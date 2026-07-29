"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 1
  Búsqueda y navegación hasta el Cuadro de Ofertas
=============================================================
  Dependencias: pip install selenium webdriver-manager requests
=============================================================
"""

import re
import time
import sys
import subprocess
import tkinter as tk
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

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
    opciones.add_argument("--disable-popup-blocking")

    # ── Ocultar huella de automatización ──
    opciones.add_argument("--disable-blink-features=AutomationControlled")
    opciones.add_experimental_option("excludeSwitches", ["enable-automation"])
    opciones.add_experimental_option("useAutomationExtension", False)

    # OPT-6: flags de rendimiento — reducen tiempo de startup y overhead de red
    opciones.add_argument("--disable-extensions")
    opciones.add_argument("--disable-background-networking")
    opciones.add_argument("--disable-background-timer-throttling")
    opciones.add_argument("--disable-translate")
    opciones.add_argument("--disable-default-apps")
    opciones.add_argument("--no-first-run")
    opciones.add_argument("--safebrowsing-disable-auto-update")
    opciones.add_argument("--metrics-recording-only")
    opciones.add_argument("--password-store=basic")

    opciones.add_experimental_option("prefs", {
        "profile.default_content_setting_values.popups": 1,
        "plugins.always_open_pdf_externally": True,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        # Evita que Chrome haga una consulta de reputación a Google por cada
        # archivo descargado antes de liberar el rename .crdownload → final.
        # Con decenas de PDFs/DOCX por licitación, ese round-trip de red se
        # suma a la latencia de MP y de cualquier escaneo local (antivirus).
        "safebrowsing.enabled": False,
        "safebrowsing_for_trusted_sources_enabled": False,
    })

    try:
        driver = webdriver.Chrome(options=opciones)
        # Parchear navigator.webdriver = undefined a nivel de página
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"}
        )
        # Bloquear descargas automáticas hasta que etapa4/etapa3 fijen la carpeta.
        # Sin esto, cualquier descarga antes del primer _set_download_folder iría
        # a la carpeta por defecto de Chrome y podría terminar en el lugar incorrecto.
        try:
            driver.execute_cdp_cmd("Browser.setDownloadBehavior", {
                "behavior": "deny",
            })
        except Exception:
            pass
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
    OPT-2: antes hacía 11 find_element + sleep(0.5) por cada selector = hasta 5.5s.
    Ahora todo se resuelve en una única llamada JS: 0 round-trips adicionales.
    """
    try:
        cerrados = driver.execute_script("""
            var sels = [
                "button#cookieConsentOkButton","button.cookie-consent-ok",
                "button[id*='cookie']","button[id*='Cookie']","a[id*='cookie']",
                "#cookieAccept",".cookie-accept",
                "button.btn-mp[data-dismiss='modal']","button[data-dismiss='modal']",
                ".modal .close","#modalInformacion .close","button.close"
            ];
            var n = 0;
            sels.forEach(function(s) {
                try {
                    var el = document.querySelector(s);
                    if (el && el.offsetParent !== null) { el.click(); n++; }
                } catch(e) {}
            });
            document.querySelectorAll('.modal.show,.modal.in').forEach(function(m) {
                m.style.display='none'; m.classList.remove('show','in');
            });
            document.querySelectorAll('.modal-backdrop').forEach(function(b){ b.remove(); });
            document.body.classList.remove('modal-open');
            return n;
        """)
        if cerrados:
            print(f"[INFO] Overlays cerrados (JS batch): {cerrados}")
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

    El formulario vive dentro de un iframe (id='form-iframe'), por lo que
    hay que cambiar el contexto de Selenium antes de interactuar con el campo.
    El flujo es: carga → overlays → switch iframe → escribe → click botón → switch back.
    """
    print(f"\n[INFO] Buscando licitación: {codigo}")

    for intento in range(1, REINTENTOS + 1):
        try:
            driver.get(URL_BUSQUEDA)

            # ── 1. Esperar a que el DOM esté listo ──
            WebDriverWait(driver, ESPERA_MAX).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            time.sleep(0.5)

            # ── 2. Cerrar overlays desde el contexto principal ──
            _cerrar_overlays(driver)

            # ── 3. Cambiar al iframe que contiene el formulario ──
            # OPT-3a: verificar presencia del iframe con JS antes de encolar
            # WebDriverWait — si ya está en el DOM el timeout se reduce a 5s.
            iframe_localizado = False
            try:
                iframe_existe = driver.execute_script(
                    "return !!(document.getElementById('form-iframe') || "
                    "document.getElementsByName('form-iframe').length);"
                )
            except Exception:
                iframe_existe = False
            espera_iframe = 5 if iframe_existe else ESPERA_MAX

            for iframe_sel in [
                (By.ID,   "form-iframe"),
                (By.NAME, "form-iframe"),
            ]:
                try:
                    WebDriverWait(driver, espera_iframe).until(
                        EC.frame_to_be_available_and_switch_to_it(iframe_sel)
                    )
                    iframe_localizado = True
                    print(f"[INFO] Contexto cambiado a iframe '{iframe_sel[1]}'.")
                    break
                except TimeoutException:
                    continue

            if not iframe_localizado:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: iframe del formulario no disponible.")
                driver.switch_to.default_content()
                time.sleep(2)
                continue

            # ── 4. Localizar el campo dentro del iframe ──
            # OPT-3b: intento no-bloqueante primero (find_elements = 0s timeout),
            # luego fallback con WebDriverWait breve (5s) si no lo encontró.
            campo = None
            _selectores_campo = [
                (By.ID,           "textoBusqueda"),
                (By.NAME,         "textoBusqueda"),
                (By.CSS_SELECTOR, "input.input-mp"),
                (By.CSS_SELECTOR, "input[type='text']"),
            ]
            for metodo, valor in _selectores_campo:
                found = driver.find_elements(metodo, valor)
                if found and found[0].is_displayed():
                    campo = found[0]
                    print(f"[INFO] Campo localizado (no-blocking) con: {valor}")
                    break

            if not campo:
                for metodo, valor in _selectores_campo:
                    try:
                        campo = WebDriverWait(driver, 5).until(
                            EC.element_to_be_clickable((metodo, valor))
                        )
                        print(f"[INFO] Campo clickable localizado con: {valor}")
                        break
                    except TimeoutException:
                        continue

            if not campo:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: campo no encontrado en iframe.")
                driver.switch_to.default_content()
                time.sleep(2)
                continue

            # ── 5. Escribir el código (usa las 5 estrategias) ──
            # FIX BUG-01: antes se usaba send_keys directo y _escribir_en_campo
            # nunca se llamaba. Ahora se delega aquí para que las 5 estrategias
            # (portapapeles, send_keys, JS, execCommand, char-a-char) se activen
            # cuando el campo rechaza la escritura simple.
            if not _escribir_en_campo(driver, campo, codigo):
                print(f"[WARN] Intento {intento}/{REINTENTOS}: ninguna estrategia "
                      f"logró escribir el código.")
                driver.switch_to.default_content()
                time.sleep(2)
                continue

            print(f"[OK]   Texto escrito correctamente: '{codigo}'")

            # ── 6. Enviar la búsqueda (botón dentro del mismo iframe) ──
            enviado = False
            for btn_selector in [
                "#btnBuscar",
                "button[type='submit']",
                "input[type='submit']",
                "button.btn-mp",
                "button.btn-buscar",
                "button[onclick*='Buscar']",
                "button[onclick*='buscar']",
            ]:
                try:
                    btn = driver.find_element(By.CSS_SELECTOR, btn_selector)
                    if btn.is_displayed() and btn.is_enabled():
                        driver.execute_script("arguments[0].click();", btn)
                        enviado = True
                        print(f"[OK]   Búsqueda enviada con clic en botón ({btn_selector}).")
                        break
                except Exception:
                    continue

            if not enviado:
                campo.send_keys(Keys.RETURN)
                print("[OK]   Búsqueda enviada con ENTER.")

            # ── 7. Volver al contexto principal y esperar resultados ──
            driver.switch_to.default_content()
            time.sleep(1.5)
            return True

        except Exception as e:
            print(f"[WARN] Intento {intento}/{REINTENTOS} falló: {e}")
            try:
                driver.switch_to.default_content()
            except Exception:
                pass
            time.sleep(3)

    print("\n[ERROR TÉCNICO] No se pudo ingresar el código en el campo de búsqueda.")
    print("[ERROR SIMPLE]  Mercado Público no respondió. Revisa tu conexión a internet.")
    return False


# ─────────────────────────────────────────────
#  ENTRAR A LA FICHA DE LA LICITACIÓN
# ─────────────────────────────────────────────
def entrar_ficha(driver, codigo):
    """
    Encuentra el resultado de búsqueda y entra a la ficha de la licitación.

    Los resultados se cargan dentro de form-iframe con un link que llama
    $.Busqueda.verFicha('URL'). Se extrae esa URL y se navega en una nueva
    pestaña para evitar depender del popup nativo. Si no se encuentra en el
    iframe, se intentan estrategias en el documento principal como fallback.
    """
    print("\n[INFO] Buscando resultado en la lista...")

    for intento in range(1, REINTENTOS + 1):
        try:
            time.sleep(1)

            # Cerrar alertas pendientes (pueden aparecer si la sesión expiró)
            try:
                driver.switch_to.alert.dismiss()
                time.sleep(0.3)
            except Exception:
                pass

            enlace         = None
            url_ficha      = None
            titulo_iframe  = None  # título extraído dentro del iframe

            # ── Estrategia 0: form-iframe + extracción de URL ────────────
            # Los resultados modernos de Mercado Público se cargan en
            # form-iframe.  El <a> tiene href="#" y el onclick contiene
            # $.Busqueda.verFicha('http://...?idlicitacion=...').
            # Extraemos URL y título DENTRO del iframe antes de salir,
            # porque después de switch_to.default_content() el WebElement
            # deja de ser accesible y lanza NoSuchElementException.
            try:
                driver.switch_to.frame(driver.find_element(By.ID, "form-iframe"))
                for xpath in [
                    "//div[contains(@class,'responsive-resultado')]//a[.//h2]",
                    "//a[contains(@onclick,'verFicha')]",
                    "//h2[contains(@class,'text-weight')]//ancestor::a[1]",
                    "//h2//ancestor::a[1]",
                ]:
                    for el in driver.find_elements(By.XPATH, xpath):
                        if not el.is_displayed():
                            continue
                        onclick = el.get_attribute("onclick") or ""
                        m = re.search(r"verFicha\('([^']+)'\)", onclick)
                        if not m:
                            continue

                        url_candidate = m.group(1)

                        # FIX BUG-02: verificar que el resultado corresponde al
                        # código buscado. La URL interna usa IDs numéricos, así que
                        # revisamos el texto del contenedor padre del resultado.
                        try:
                            parent_text = el.find_element(
                                By.XPATH, "ancestor::div[1]"
                            ).text
                        except Exception:
                            parent_text = el.text or ""

                        codigo_norm = codigo.upper().replace(" ", "")
                        if (codigo_norm not in parent_text.upper().replace(" ", "")
                                and codigo_norm not in url_candidate.upper()):
                            print(f"[WARN] Estrategia 0: resultado ignorado "
                                  f"(código no encontrado en contexto).")
                            continue

                        url_ficha = url_candidate
                        try:
                            titulo_iframe = el.text.strip().split('\n')[0]
                        except Exception:
                            titulo_iframe = ""
                        enlace = True
                        print(f"[INFO] Estrategia 0 (iframe): {xpath}")
                        break
                    if enlace:
                        break
                driver.switch_to.default_content()
            except Exception:
                driver.switch_to.default_content()

            # ── Estrategias A-D: documento principal (fallback) ──────────
            # Solo se ejecutan si Estrategia 0 no encontró nada.
            # Aquí `enlace` sí puede ser un WebElement (en main doc).
            enlace_elem = None  # WebElement válido en el contexto actual
            if not enlace:
                for metodo, xpath, label in [
                    ("A", f"//a[contains(normalize-space(text()), '{codigo}')]",
                     "texto del enlace contiene el código"),
                    ("B", f"//a[contains(@href, '{codigo}')]",
                     "href del enlace contiene el código"),
                    ("D", "//h2[contains(@class,'text-weight')]//ancestor::a[1]",
                     "primer resultado h2"),
                ]:
                    elementos = driver.find_elements(By.XPATH, xpath)
                    if elementos:
                        enlace_elem = elementos[0]
                        print(f"[INFO] Estrategia {metodo}: {label}.")
                        break

            if not enlace and not enlace_elem and not url_ficha:
                # Estrategia C: nodo con el código → <a> ancestro
                for elem in driver.find_elements(By.XPATH,
                        f"//*[contains(normalize-space(text()), '{codigo}')]"):
                    try:
                        enlace_elem = elem.find_element(By.XPATH, "ancestor::a[1]")
                        print("[INFO] Estrategia C: <a> ancestro del nodo con código.")
                        break
                    except NoSuchElementException:
                        continue

            if enlace or enlace_elem or url_ficha:
                if enlace:
                    # Estrategia 0: título ya extraído dentro del iframe
                    titulo = titulo_iframe or url_ficha or "Sin título"
                else:
                    try:
                        titulo = enlace_elem.text.strip().split('\n')[0]
                    except Exception:
                        titulo = "Sin título"
                print(f"[OK]   Resultado encontrado: {titulo[:70]}")

                handles_antes = set(driver.window_handles)

                if url_ficha:
                    # Abrir la ficha directamente en nueva pestaña
                    driver.execute_script("window.open('');")
                    WebDriverWait(driver, 10).until(
                        lambda d: len(d.window_handles) > len(handles_antes)
                    )
                    nueva = (set(driver.window_handles) - handles_antes).pop()
                    driver.switch_to.window(nueva)
                    driver.get(url_ficha)
                    print(f"[INFO] Ficha abierta en nueva pestaña: {url_ficha[:70]}")
                elif enlace_elem:
                    driver.execute_script("arguments[0].click();", enlace_elem)
                    time.sleep(1)
                    # Esperar posible nueva ventana emergente
                    try:
                        WebDriverWait(driver, 8).until(
                            lambda d: len(d.window_handles) > len(handles_antes)
                        )
                        nueva = (set(driver.window_handles) - handles_antes).pop()
                        driver.switch_to.window(nueva)
                        print(f"[INFO] Nueva ventana de ficha abierta.")
                    except TimeoutException:
                        pass  # navegó en la ventana actual

                # Descartar alerta si aparece tras la navegación
                try:
                    driver.switch_to.alert.dismiss()
                    time.sleep(0.5)
                except Exception:
                    pass

                time.sleep(1.5)
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
    """
    OPT-1 + BUG-11: antes usaba 7 × WebDriverWait(20s) en cascada → hasta 140s de
    espera innecesaria si ningún selector coincidía. Ahora: una sola espera corta
    (5s) para que la página cargue al menos un h2, luego scan no-bloqueante con
    find_elements (retorno inmediato si el elemento no existe).
    """
    CHARS_INVALIDOS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']

    def _limpiar(texto: str) -> str:
        for ch in CHARS_INVALIDOS:
            texto = texto.replace(ch, '-')
        return texto[:80].strip() or "Licitacion"

    # Esperar a que la página tenga al menos un h2 (máx 5s)
    try:
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.TAG_NAME, "h2"))
        )
    except TimeoutException:
        pass

    # Scan no-bloqueante — find_elements retorna [] de inmediato si no existe
    SELECTORES = [
        (By.CSS_SELECTOR, "h2.titulodetalle"),
        (By.CSS_SELECTOR, ".titulo-licitacion h2"),
        (By.CSS_SELECTOR, ".ficha-licitacion h2"),
        (By.CSS_SELECTOR, "#titulo-licitacion"),
        (By.CSS_SELECTOR, "main h2"),
        (By.CSS_SELECTOR, "#content h2"),
        (By.CSS_SELECTOR, ".container h2"),
    ]

    for metodo, selector in SELECTORES:
        try:
            for elem in driver.find_elements(metodo, selector):
                texto = elem.text.strip()
                if texto and len(texto) > 5:
                    nombre = _limpiar(texto)
                    print(f"[OK]   Nombre licitación ({selector}): {nombre}")
                    return nombre
        except Exception:
            continue

    # Fallback 1: título del documento sin el sufijo del sitio
    try:
        titulo_doc = driver.title.strip()
        for sufijo in [" - Mercado Público", " - MercadoPublico",
                       " | Mercado Público", " | MercadoPublico"]:
            if titulo_doc.endswith(sufijo):
                titulo_doc = titulo_doc[: -len(sufijo)].strip()
                break
        if titulo_doc and len(titulo_doc) > 5:
            nombre = _limpiar(titulo_doc)
            print(f"[OK]   Nombre licitación (title): {nombre}")
            return nombre
    except Exception:
        pass

    # Fallback 2: cualquier h2 con contenido suficiente
    try:
        for elem in driver.find_elements(By.TAG_NAME, "h2"):
            texto = elem.text.strip()
            if texto and len(texto) > 10:
                nombre = _limpiar(texto)
                print(f"[WARN] Nombre licitación (h2 genérico): {nombre}")
                return nombre
    except Exception:
        pass

    print("[WARN] No se pudo obtener el nombre de la licitación.")
    return "Licitacion"


# ─────────────────────────────────────────────
#  GENERADOR DE ETIQUETAS PARA PROVEEDORES
# ─────────────────────────────────────────────
def _generar_etiqueta(idx: int) -> str:
    """
    FIX BUG-12: el esquema original se agotaba en 26 proveedores y caía a
    números string. Ahora genera etiquetas alfabéticas ilimitadas:
    a-z (0-25) → aa-az (26-51) → ba-bz (52-77) → … (soporta hasta 702+)
    """
    BASE = 'abcdefghijklmnopqrstuvwxyz'
    if idx < 26:
        return BASE[idx]
    idx -= 26
    return BASE[idx // 26] + BASE[idx % 26]


# ─────────────────────────────────────────────
#  ABRIR CUADRO DE OFERTAS
# ─────────────────────────────────────────────
def abrir_cuadro_ofertas(driver):
    """
    El botón imgCuadroOferta llama a openPopupFicha() que abre un RadWindow
    overlay (NO una ventana nueva). El contenido se carga dentro de
    <iframe name='PopupFicha'>. Esperamos ese iframe antes de retornar.
    """
    print("\n[INFO] Buscando Cuadro de Ofertas...")
    wait = WebDriverWait(driver, ESPERA_MAX)

    for intento in range(1, REINTENTOS + 1):
        try:
            boton = wait.until(
                EC.element_to_be_clickable((By.ID, "imgCuadroOferta"))
            )
            boton.click()

            # Esperar iframe PopupFicha (RadWindow overlay, no nueva ventana)
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.NAME, "PopupFicha"))
            )
            print("[OK]   Cuadro de Ofertas abierto (iframe PopupFicha detectado).")
            # Esperar grdSupplies en frame Cuerpo en vez de sleep fijo
            try:
                WebDriverWait(driver, 8).until(
                    EC.frame_to_be_available_and_switch_to_it((By.NAME, "PopupFicha"))
                )
                WebDriverWait(driver, 8).until(
                    EC.frame_to_be_available_and_switch_to_it((By.NAME, "Cuerpo"))
                )
                WebDriverWait(driver, 8).until(
                    EC.presence_of_element_located((By.ID, "grdSupplies"))
                )
            except TimeoutException:
                pass
            finally:
                driver.switch_to.default_content()
            return True

        except TimeoutException:
            print(f"[WARN] Intento {intento}/{REINTENTOS}: botón o iframe no encontrado.")
            time.sleep(3)

    print("\n[ERROR TÉCNICO] No se encontró el botón 'Cuadro de Ofertas'.")
    print("[ERROR SIMPLE]  Esta licitación puede no tener ofertas públicas.")
    return False


# ─────────────────────────────────────────────
#  EXTRAER TABLA DE PROVEEDORES
# ─────────────────────────────────────────────
def extraer_proveedores(driver):
    print("\n[INFO] Extrayendo proveedores del Cuadro de Ofertas...")
    wait        = WebDriverWait(driver, ESPERA_MAX)
    proveedores = []

    for intento in range(1, REINTENTOS + 1):
        try:
            # Ruta confirmada: default_content → PopupFicha → Cuerpo
            driver.switch_to.default_content()
            driver.switch_to.frame(driver.find_element(By.NAME, "PopupFicha"))
            driver.switch_to.frame(driver.find_element(By.NAME, "Cuerpo"))
            print("[INFO] Contexto cambiado a PopupFicha → Cuerpo.")

            wait.until(EC.presence_of_element_located((By.ID, "grdSupplies")))

            pagina_actual = 1
            while True:
                # OPT-4: 1 sola llamada JS reemplaza el find_elements de guardia
                # + los 5×N find_element por fila (antes = 5N+1 round-trips Selenium).
                # IMPORTANTE: se usa indexOf('cssFwk') en lugar de tr.cssFwk para
                # replicar el XPath contains(@class,'cssFwk') — que coincide con
                # clases compuestas como cssFwkRow/cssFwkEven que MP puede generar.
                filas_data = driver.execute_script("""
                    var t = document.getElementById('grdSupplies');
                    if (!t) return [];
                    var out = [];
                    var txt = function(el) {
                        return el ? (el.innerText || el.textContent || '').trim() : '';
                    };
                    var cel = function(el, sub) {
                        if (!el) return '';
                        var n = el.querySelector(sub);
                        return n ? txt(n) : txt(el);
                    };
                    Array.prototype.filter.call(
                        t.querySelectorAll('tr'),
                        function(r) { return r.className.indexOf('cssFwk') >= 0; }
                    ).forEach(function(r) {
                        var td = r.querySelectorAll('td');
                        if (td.length < 3) return;
                        out.push({
                            rut:    cel(td[0], 'a'),
                            nombre: cel(td[1], 'a'),
                            oferta: cel(td[2], 'span') || txt(td[2]),
                            total:  cel(td[3], 'span') || txt(td[3]),
                            estado: cel(td[4], 'span') || txt(td[4])
                        });
                    });
                    return out;
                """)

                if not filas_data and pagina_actual == 1:
                    print(f"[WARN] Intento {intento}/{REINTENTOS}: tabla sin filas.")
                    break

                print(f"[INFO] Página {pagina_actual}: {len(filas_data)} proveedor(es).")

                for i, data in enumerate(filas_data):
                    if not data or not data.get('rut'):
                        print(f"[WARN] Fila {i+1} p{pagina_actual}: datos incompletos, omitida.")
                        continue
                    letra = _generar_etiqueta(len(proveedores))
                    proveedores.append({
                        "letra":      letra,
                        "rut":        data['rut'],
                        "nombre":     data['nombre'],
                        "oferta":     data['oferta'],
                        "total":      data['total'],
                        "estado":     data['estado'],
                        "fila_index": i,
                        "pagina_grd": pagina_actual,
                    })

                # Buscar link a la siguiente página
                sig_pag = pagina_actual + 1
                try:
                    old_grd = driver.find_element(By.ID, "grdSupplies")
                    driver.find_element(
                        By.XPATH,
                        f"//table[@id='WucPagerGrid__TblPages']"
                        f"//div[contains(@onclick,'fnMovePage({sig_pag},')]"
                    )
                    driver.execute_script(f"fnMovePage({sig_pag}, 'WucPagerGrid');")
                    WebDriverWait(driver, 10).until(EC.staleness_of(old_grd))
                    wait.until(EC.presence_of_element_located((By.ID, "grdSupplies")))
                    pagina_actual = sig_pag
                    print(f"[INFO] Avanzando a página {pagina_actual} del cuadro.")
                except NoSuchElementException:
                    break  # Sin más páginas

            if proveedores:
                # La extracción deja el grid en la última página.
                # Volvemos a página 1 usando el botón real del paginador.
                # Si el botón de página 1 no existe, ya estamos en ella.
                if pagina_actual > 1:
                    try:
                        old_grd = driver.find_element(By.ID, "grdSupplies")
                        btn_p1 = driver.find_element(
                            By.XPATH,
                            "//table[@id='WucPagerGrid__TblPages']"
                            "//div[contains(@onclick,'fnMovePage(1,')]"
                        )
                        driver.execute_script("arguments[0].click();", btn_p1)
                        WebDriverWait(driver, 10).until(EC.staleness_of(old_grd))
                        wait.until(EC.presence_of_element_located(
                            (By.ID, "grdSupplies")))
                        print("[INFO] Grid vuelto a página 1 tras la extracción.")
                    except NoSuchElementException:
                        print("[INFO] Grid ya en página 1.")
                    except Exception as e:
                        print(f"[WARN] No se pudo volver a página 1: {e}")
                break  # Extracción exitosa
            else:
                driver.switch_to.default_content()
                time.sleep(3)

        except TimeoutException:
            print(f"[WARN] Intento {intento}/{REINTENTOS}: timeout en tabla.")
            driver.switch_to.default_content()
            time.sleep(3)
        except Exception as e:
            print(f"[WARN] Intento {intento}/{REINTENTOS}: error → {e}")
            driver.switch_to.default_content()
            time.sleep(3)

    # Salir del iframe antes de retornar
    try:
        driver.switch_to.default_content()
    except Exception:
        pass

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