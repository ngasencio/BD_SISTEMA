"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 1
  Búsqueda y navegación hasta el Cuadro de Ofertas
=============================================================
  Dependencias: pip install selenium webdriver-manager requests
=============================================================
"""

import time
import sys
import subprocess
import tkinter as tk
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

# ─────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────
URL_BUSQUEDA = "https://www.mercadopublico.cl/Home/BusquedaLicitacion"
ESPERA_MAX   = 20
REINTENTOS   = 3


# ─────────────────────────────────────────────
#  PORTAPAPELES (Windows nativo, sin dependencias extra)
# ─────────────────────────────────────────────
def _copiar_al_portapapeles(texto):
    """Copia texto al portapapeles de Windows usando tkinter (sin instalar nada)."""
    try:
        root = tk.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.clipboard_append(texto)
        root.update()
        root.destroy()
        return True
    except Exception:
        pass
    # Fallback: clip.exe (viene con Windows)
    try:
        subprocess.run("clip", input=texto.encode("utf-16-le"), check=True)
        return True
    except Exception:
        return False


# ─────────────────────────────────────────────
#  INICIALIZAR CHROME  (anti-detección activada)
# ─────────────────────────────────────────────
def iniciar_chrome():
    """
    Inicia Chrome ocultando las huellas de Selenium.
    Mercado Público (y otros sitios .cl del gobierno) leen
    navigator.webdriver y bloquean la interacción si es True.
    Con estas opciones el sitio ve un Chrome normal.
    """
    print("\n[INFO] Iniciando Chrome...")
    opciones = webdriver.ChromeOptions()
    opciones.add_argument("--start-maximized")
    opciones.add_argument("--disable-notifications")

    # ── Ocultar huella de automatización ──
    opciones.add_argument("--disable-blink-features=AutomationControlled")
    opciones.add_experimental_option("excludeSwitches", ["enable-automation"])
    opciones.add_experimental_option("useAutomationExtension", False)

    try:
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=opciones
        )
        # Parchear navigator.webdriver = undefined a nivel de página
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"}
        )
        print("[OK]   Chrome iniciado (modo anti-detección).")
        return driver
    except Exception as e:
        print(f"\n[ERROR TÉCNICO] No se pudo iniciar Chrome: {e}")
        print("[ERROR SIMPLE]  Asegúrate de tener Google Chrome instalado.")
        sys.exit(1)


# ─────────────────────────────────────────────
#  BUSCAR LICITACIÓN
# ─────────────────────────────────────────────
def _cerrar_overlays(driver):
    """
    Cierra banners de cookies, modales de términos y cualquier overlay
    que pueda interceptar los clics antes de interactuar con el campo.
    Mercado Público muestra un banner de cookies en la parte inferior
    y ocasionalmente un modal de aviso al entrar.
    """
    # Selectores conocidos de overlays en Mercado Público
    selectores_cierre = [
        "button#cookieConsentOkButton",
        "button.cookie-consent-ok",
        "button[id*='cookie']",
        "button[id*='Cookie']",
        "a[id*='cookie']",
        "#cookieAccept",
        ".cookie-accept",
        "button.btn-mp[data-dismiss='modal']",
        "button[data-dismiss='modal']",
        ".modal .close",
        "#modalInformacion .close",
        "button.close",
    ]
    for selector in selectores_cierre:
        try:
            btn = driver.find_element(By.CSS_SELECTOR, selector)
            if btn.is_displayed():
                driver.execute_script("arguments[0].click();", btn)
                print(f"[INFO] Overlay cerrado: {selector}")
                time.sleep(0.5)
        except Exception:
            continue

    # Forzar cierre de cualquier modal Bootstrap activo vía JS
    try:
        driver.execute_script("""
            document.querySelectorAll('.modal.show, .modal.in').forEach(function(m) {
                m.style.display = 'none';
                m.classList.remove('show', 'in');
            });
            document.querySelectorAll('.modal-backdrop').forEach(function(b) {
                b.remove();
            });
            document.body.classList.remove('modal-open');
        """)
    except Exception:
        pass


def _escribir_en_campo(driver, campo, texto):
    """
    Intenta escribir `texto` en `campo` usando cinco estrategias en cascada.
    Devuelve True si el valor quedó escrito correctamente.

    Estrategia 1 — Portapapeles + Ctrl+V (la más fiable: dispara el evento
                   nativo 'paste' del navegador, que ningún framework bloquea).
    Estrategia 2 — send_keys directo (funciona cuando no hay detección de bot).
    Estrategia 3 — JS .value + eventos input/change (ASP.NET / jQuery).
    Estrategia 4 — execCommand('insertText') (dispara evento nativo del browser).
    Estrategia 5 — Caracteres uno a uno con pausa (validación en tiempo real).
    """
    campo_id = campo.get_attribute("id") or campo.get_attribute("name") or "campo"

    def _campo_ok():
        return campo.get_attribute("value") == texto

    def _scroll_y_foco():
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", campo)
        time.sleep(0.3)
        campo.click()
        time.sleep(0.2)

    # ── Estrategia 1: Portapapeles + Ctrl+V ──────────────────────────
    try:
        if _copiar_al_portapapeles(texto):
            _scroll_y_foco()
            # Limpiar campo y pegar
            ActionChains(driver).key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL).perform()
            time.sleep(0.1)
            ActionChains(driver).key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
            time.sleep(0.4)
            if _campo_ok():
                print(f"[OK]   Escritura OK con portapapeles Ctrl+V ({campo_id}).")
                return True
            print(f"[INFO] Portapapeles incompleto; valor='{campo.get_attribute('value')}'")
    except Exception as e:
        print(f"[INFO] Portapapeles falló: {e}")

    # ── Estrategia 2: send_keys directo ──────────────────────────────
    try:
        _scroll_y_foco()
        campo.clear()
        campo.send_keys(texto)
        time.sleep(0.3)
        if _campo_ok():
            print(f"[OK]   Escritura OK con send_keys directo ({campo_id}).")
            return True
        print(f"[INFO] send_keys directo incompleto; valor='{campo.get_attribute('value')}'")
    except Exception as e:
        print(f"[INFO] send_keys directo falló: {e}")

    # ── Estrategia 3: JS .value + eventos input/change ────────────────
    try:
        driver.execute_script("""
            var el  = arguments[0];
            var val = arguments[1];
            el.focus();
            el.value = val;
            ['input', 'change'].forEach(function(t) {
                el.dispatchEvent(new Event(t, {bubbles: true, cancelable: true}));
            });
        """, campo, texto)
        time.sleep(0.3)
        if _campo_ok():
            print(f"[OK]   Escritura OK con JS .value + eventos ({campo_id}).")
            return True
        print(f"[INFO] JS .value incompleto; valor='{campo.get_attribute('value')}'")
    except Exception as e:
        print(f"[INFO] JS .value falló: {e}")

    # ── Estrategia 4: execCommand('insertText') ───────────────────────
    try:
        driver.execute_script("""
            var el = arguments[0];
            el.focus();
            el.select();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, arguments[1]);
        """, campo, texto)
        time.sleep(0.3)
        if _campo_ok():
            print(f"[OK]   Escritura OK con execCommand insertText ({campo_id}).")
            return True
        print(f"[INFO] execCommand incompleto; valor='{campo.get_attribute('value')}'")
    except Exception as e:
        print(f"[INFO] execCommand falló: {e}")

    # ── Estrategia 5: caracteres uno a uno con ActionChains ───────────
    try:
        _scroll_y_foco()
        ActionChains(driver).key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL).perform()
        time.sleep(0.1)
        ActionChains(driver).send_keys(Keys.DELETE).perform()
        time.sleep(0.1)
        for char in texto:
            ActionChains(driver).send_keys(char).perform()
            time.sleep(0.06)
        time.sleep(0.3)
        if _campo_ok():
            print(f"[OK]   Escritura OK char a char ({campo_id}).")
            return True
        print(f"[INFO] Char a char incompleto; valor='{campo.get_attribute('value')}'")
    except Exception as e:
        print(f"[INFO] Char a char falló: {e}")

    return False


def buscar_licitacion(driver, codigo):
    """
    Navega a Mercado Público e ingresa el código en el buscador.

    IMPORTANTE: El campo está directamente en la página principal,
    NO dentro de ningún iframe. Usa _escribir_en_campo() con 5 estrategias
    en cascada para superar las animaciones CSS del formulario.
    """
    print(f"\n[INFO] Buscando licitación: {codigo}")

    for intento in range(1, REINTENTOS + 1):
        try:
            driver.get(URL_BUSQUEDA)

            # ── 1. Esperar carga completa del DOM ──
            WebDriverWait(driver, ESPERA_MAX).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            time.sleep(2)

            # ── 2. Cerrar overlays (cookies, modales) ──
            _cerrar_overlays(driver)
            time.sleep(0.5)

            # ── 3. Localizar el campo en el contexto principal (sin iframe) ──
            campo = None
            selectores = [
                (By.ID,           "textoBusqueda"),
                (By.NAME,         "textoBusqueda"),
                (By.CSS_SELECTOR, "input.input-mp"),
                (By.CSS_SELECTOR, "input[aria-label*=\'licitaci\']"),
                (By.XPATH,        "//div[contains(@class,\'buscador\')]//input"),
            ]
            for metodo, valor in selectores:
                try:
                    campo = WebDriverWait(driver, 8).until(
                        EC.presence_of_element_located((metodo, valor))
                    )
                    print(f"[INFO] Campo localizado con: {valor}")
                    break
                except TimeoutException:
                    continue

            if not campo:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: campo no encontrado.")
                time.sleep(2)
                continue

            # ── 4. Escribir el código usando las 5 estrategias ──
            escrito = _escribir_en_campo(driver, campo, codigo)
            if not escrito:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: no se pudo escribir en el campo.")
                time.sleep(2)
                continue

            # ── 5. Enviar búsqueda: botón primero, ENTER como fallback ──
            enviado = False
            for btn_selector in ["#btnBuscar", "button.btn", "button[type=\'submit\']"]:
                try:
                    btn = driver.find_element(By.CSS_SELECTOR, btn_selector)
                    if btn.is_displayed() and btn.is_enabled():
                        driver.execute_script("arguments[0].click();", btn)
                        enviado = True
                        print(f"[OK]   Búsqueda enviada con botón ({btn_selector}).")
                        break
                except Exception:
                    continue

            if not enviado:
                campo.send_keys(Keys.RETURN)
                print("[OK]   Búsqueda enviada con ENTER (fallback).")

            time.sleep(4)
            return True

        except Exception as e:
            print(f"[WARN] Intento {intento}/{REINTENTOS} falló: {e}")
            time.sleep(3)

    print("\n[ERROR TÉCNICO] No se pudo ingresar el código en el campo de búsqueda.")
    print("[ERROR SIMPLE]  Mercado Público no respondió. Revisa tu conexión a internet.")
    return False


# ─────────────────────────────────────────────
#  ENTRAR A LA FICHA DE LA LICITACIÓN
# ─────────────────────────────────────────────
def entrar_ficha(driver, codigo):
    """
    En los resultados de búsqueda encuentra el enlace que coincide
    con el código y hace clic para entrar a la ficha.
    Cuatro estrategias en cascada para distintas estructuras del DOM.
    """
    print("\n[INFO] Buscando resultado en la lista...")

    for intento in range(1, REINTENTOS + 1):
        try:
            time.sleep(3)
            enlace = None

            # Estrategia A: <a> cuyo texto contenga el código
            elementos = driver.find_elements(By.XPATH,
                f"//a[contains(normalize-space(text()), '{codigo}')]"
            )
            if elementos:
                enlace = elementos[0]
                print("[INFO] Estrategia A: texto del enlace contiene el código.")

            # Estrategia B: <a> cuyo href contenga el código
            if not enlace:
                elementos = driver.find_elements(By.XPATH,
                    f"//a[contains(@href, '{codigo}')]"
                )
                if elementos:
                    enlace = elementos[0]
                    print("[INFO] Estrategia B: href del enlace contiene el código.")

            # Estrategia C: elemento con el código → buscar <a> ancestro
            if not enlace:
                elementos = driver.find_elements(By.XPATH,
                    f"//*[contains(normalize-space(text()), '{codigo}')]"
                )
                for elem in elementos:
                    try:
                        enlace = elem.find_element(By.XPATH, "ancestor::a[1]")
                        print("[INFO] Estrategia C: <a> ancestro del nodo con código.")
                        break
                    except NoSuchElementException:
                        continue

            # Estrategia D: primer h2 resultado → su <a> ancestro
            if not enlace:
                elementos = driver.find_elements(By.XPATH,
                    "//h2[contains(@class,'text-weight')]//ancestor::a[1]"
                )
                if elementos:
                    enlace = elementos[0]
                    print("[INFO] Estrategia D: primer resultado h2.")

            if enlace:
                titulo = enlace.text.strip().split('\n')[0] or "Sin título"
                print(f"[OK]   Resultado encontrado: {titulo}")
                driver.execute_script("arguments[0].click();", enlace)
                time.sleep(3)
                return True
            else:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: sin resultado.")
                print(f"[DEBUG] URL actual: {driver.current_url}")
                time.sleep(3)

        except Exception as e:
            print(f"[WARN] Intento {intento}/{REINTENTOS} error: {e}")
            time.sleep(3)

    print("\n[ERROR TÉCNICO] No se encontró la licitación en los resultados.")
    print(f"[ERROR SIMPLE]  Verifica que el código '{codigo}' esté bien escrito.")
    return False


# ─────────────────────────────────────────────
#  OBTENER NOMBRE DE LA LICITACIÓN
# ─────────────────────────────────────────────
def obtener_nombre_licitacion(driver):
    try:
        wait = WebDriverWait(driver, ESPERA_MAX)
        elem = wait.until(EC.presence_of_element_located((By.TAG_NAME, "h2")))
        nombre = elem.text.strip()
        # Caracteres inválidos en nombres de carpeta Windows
        for char in ['/', '\\', ':', '*', '?', '"', '<', '>', '|']:
            nombre = nombre.replace(char, '-')
        nombre = nombre[:80].strip()
        print(f"[OK]   Nombre licitación: {nombre}")
        return nombre
    except Exception as e:
        print(f"[WARN] No se pudo obtener el nombre: {e}")
        return "Licitacion"


# ─────────────────────────────────────────────
#  ABRIR CUADRO DE OFERTAS
# ─────────────────────────────────────────────
def abrir_cuadro_ofertas(driver):
    print("\n[INFO] Buscando Cuadro de Ofertas...")
    wait = WebDriverWait(driver, ESPERA_MAX)

    for intento in range(1, REINTENTOS + 1):
        try:
            boton = wait.until(
                EC.element_to_be_clickable((By.ID, "imgCuadroOferta"))
            )
            driver.execute_script("arguments[0].click();", boton)
            print("[OK]   Cuadro de Ofertas abierto.")
            time.sleep(3)
            return True
        except TimeoutException:
            print(f"[WARN] Intento {intento}/{REINTENTOS}: no se encontró el botón.")
            time.sleep(3)

    print("\n[ERROR TÉCNICO] No se encontró el botón 'Cuadro de Ofertas'.")
    print("[ERROR SIMPLE]  Esta licitación puede no tener ofertas públicas.")
    return False


# ─────────────────────────────────────────────
#  EXTRAER TABLA DE PROVEEDORES
# ─────────────────────────────────────────────
def extraer_proveedores(driver):
    print("\n[INFO] Extrayendo proveedores del Cuadro de Ofertas...")
    wait    = WebDriverWait(driver, ESPERA_MAX)
    letras  = 'abcdefghijklmnopqrstuvwxyz'
    proveedores = []

    for intento in range(1, REINTENTOS + 1):
        try:
            # Cambiar a nueva ventana si el cuadro la abrió
            if len(driver.window_handles) > 1:
                driver.switch_to.window(driver.window_handles[-1])
                print("[INFO] Cambiando a ventana del Cuadro de Ofertas.")

            wait.until(EC.presence_of_element_located((By.ID, "grdSupplies")))

            filas = driver.find_elements(By.XPATH,
                "//table[@id='grdSupplies']//tr[contains(@class,'cssFwk')]"
            )

            if not filas:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: tabla sin filas.")
                time.sleep(3)
                continue

            for i, fila in enumerate(filas):
                try:
                    rut    = fila.find_element(By.XPATH, ".//td[1]//a").text.strip()
                    nombre = fila.find_element(By.XPATH, ".//td[2]//a").text.strip()
                    oferta = fila.find_element(By.XPATH, ".//td[3]//span").text.strip()
                    total  = fila.find_element(By.XPATH, ".//td[4]//span").text.strip()
                    estado = fila.find_element(By.XPATH, ".//td[5]//span").text.strip()
                    letra  = letras[i] if i < len(letras) else str(i + 1)

                    proveedores.append({
                        "letra":      letra,
                        "rut":        rut,
                        "nombre":     nombre,
                        "oferta":     oferta,
                        "total":      total,
                        "estado":     estado,
                        "fila_index": i
                    })
                except NoSuchElementException as e:
                    print(f"[WARN] Fila {i+1}: no se pudo leer → {e}")
                    continue

            break

        except TimeoutException:
            print(f"[WARN] Intento {intento}/{REINTENTOS}: timeout en tabla.")
            time.sleep(3)

    return proveedores


# ─────────────────────────────────────────────
#  MOSTRAR RESUMEN EN CONSOLA
# ─────────────────────────────────────────────
def mostrar_resumen_proveedores(proveedores, codigo, nombre):
    print("\n" + "="*60)
    print(f"  LICITACIÓN : {codigo}")
    print(f"  NOMBRE     : {nombre}")
    print(f"  OFERTAS    : {len(proveedores)} proveedor(es) encontrado(s)")
    print("="*60)
    for p in proveedores:
        print(f"\n  [{p['letra'].upper()}] {p['rut']} - {p['nombre']}")
        print(f"       Oferta : {p['oferta']}")
        print(f"       Total  : {p['total']}")
        print(f"       Estado : {p['estado']}")
    print("\n" + "="*60)


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────
def main():
    print("\n" + "="*60)
    print("  SCRAPER MERCADO PÚBLICO - ETAPA 1")
    print("  Navegación y extracción de ofertas")
    print("="*60)

    codigo = input("\nIngresa el código de la licitación (ej: 3447-243-L125): ").strip()
    if not codigo:
        print("[ERROR] Debes ingresar un código de licitación.")
        sys.exit(1)

    driver = iniciar_chrome()

    try:
        if not buscar_licitacion(driver, codigo):
            driver.quit()
            sys.exit(1)

        if not entrar_ficha(driver, codigo):
            driver.quit()
            sys.exit(1)

        nombre_licitacion = obtener_nombre_licitacion(driver)

        if not abrir_cuadro_ofertas(driver):
            driver.quit()
            sys.exit(1)

        proveedores = extraer_proveedores(driver)

        if not proveedores:
            print("\n[ERROR TÉCNICO] No se extrajeron proveedores.")
            print("[ERROR SIMPLE]  No hay ofertas disponibles para esta licitación.")
            driver.quit()
            sys.exit(1)

        mostrar_resumen_proveedores(proveedores, codigo, nombre_licitacion)
        print("\n[✓] ETAPA 1 COMPLETADA — Revisa los datos antes de continuar.")
        input("\nPresiona ENTER para cerrar el navegador...")

    except KeyboardInterrupt:
        print("\n[INFO] Proceso interrumpido por el usuario.")
    finally:
        driver.quit()
        print("[INFO] Navegador cerrado.")


if __name__ == "__main__":
    main()