"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 4
  Descarga de Anexos (Administrativos, Técnicos, Económicos)
=============================================================
  ESTRUCTURA REAL DE MERCADO PÚBLICO:
  - La ficha vive en un frameset con 2 frames:
      <frame name="Encabezado"> → header
      <frame name="Cuerpo">     → contiene grdSupplies y botones
  - Los popups de anexos se abren como ventana nueva (window.open)
  - Dentro del popup: DWNL_grdId está directo en el <body>, sin iframe
=============================================================
"""

import os
import sys
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException, NoSuchElementException, StaleElementReferenceException
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ─────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────
REINTENTOS       = 3
TIMEOUT_DESCARGA = 45
TIMEOUT_POPUP    = 8
ESPERA_MAX       = 15

TIPO_MAP = {
    "Administrative": "admin",
    "Technical":      "tec",
    "Economic":       "econ",
}

SUBCARPETAS = {
    "Administrative": "Anexos Administrativos",
    "Technical":      "Anexos Tecnicos",
    "Economic":       "Anexos Economicos",
}

# Extensiones de archivos temporales que Chrome genera durante la descarga
EXTS_TEMP = ('.crdownload', '.tmp', '.part', '.download')


# ─────────────────────────────────────────────
#  AUXILIARES
# ─────────────────────────────────────────────
def _set_download_folder(driver, carpeta: str):
    """
    Redirige todas las descargas de Chrome a `carpeta` usando CDP.
    Con behavior='allow' Chrome descarga todo (PDF, docx, xlsx, zip, rar…)
    en vez de abrirlo en el navegador, sin ningún diálogo de confirmación.
    """
    os.makedirs(carpeta, exist_ok=True)
    abs_path = os.path.abspath(carpeta)
    try:
        driver.execute_cdp_cmd("Browser.setDownloadBehavior", {
            "behavior":      "allow",
            "downloadPath":  abs_path,
            "eventsEnabled": True,
        })
    except Exception:
        # Fallback para versiones anteriores de ChromeDriver
        try:
            driver.execute_cdp_cmd("Page.setDownloadBehavior", {
                "behavior":     "allow",
                "downloadPath": abs_path,
            })
        except Exception as e:
            print(f"[WARN] CDP setDownloadBehavior falló: {e}")


def _entrar_frame_cuerpo(driver):
    """
    Ruta: default_content → PopupFicha (iframe RadWindow) → Cuerpo (frame).
    Intenta primero sin espera (frames ya cargados); cae a WebDriverWait solo si falla.
    """
    driver.switch_to.default_content()
    try:
        driver.switch_to.frame(driver.find_element(By.NAME, "PopupFicha"))
        driver.switch_to.frame(driver.find_element(By.NAME, "Cuerpo"))
        return True
    except NoSuchElementException:
        driver.switch_to.default_content()
        try:
            WebDriverWait(driver, 5).until(
                EC.frame_to_be_available_and_switch_to_it((By.NAME, "PopupFicha"))
            )
            WebDriverWait(driver, 5).until(
                EC.frame_to_be_available_and_switch_to_it((By.NAME, "Cuerpo"))
            )
            return True
        except TimeoutException:
            print("[WARN] No se pudo cambiar al frame PopupFicha → Cuerpo.")
            return False


def esperar_descarga(carpeta: str, snapshot_antes: set,
                     nombre_esperado: str,
                     timeout: int = TIMEOUT_DESCARGA) -> "str | None":
    """
    Espera que aparezca un archivo NUEVO y completo en `carpeta`.
    Ignora archivos temporales (.crdownload, .tmp, etc.).
    Retorna la ruta completa del archivo descargado, o None si timeout.
    """
    inicio = time.time()

    while time.time() - inicio < timeout:
        try:
            todos = os.listdir(carpeta)
        except OSError:
            time.sleep(0.5)
            continue

        # Mientras haya archivo temporal → descarga en curso
        if any(f.endswith(EXTS_TEMP) for f in todos):
            time.sleep(0.5)
            continue

        nuevos = [
            f for f in todos
            if f not in snapshot_antes
            and not f.endswith(EXTS_TEMP)
        ]

        if nuevos:
            # Preferir el que coincide con el nombre esperado
            for f in nuevos:
                if nombre_esperado.lower() in f.lower():
                    return os.path.join(carpeta, f)
            # Fallback: el más reciente
            return os.path.join(
                carpeta,
                max(nuevos, key=lambda f: os.path.getmtime(
                    os.path.join(carpeta, f)))
            )

        time.sleep(0.5)

    return None


def _nombre_unico(carpeta: str, nombre_archivo: str) -> str:
    """Retorna un nombre sin colisión en la carpeta destino."""
    base, ext = os.path.splitext(nombre_archivo)
    candidato = nombre_archivo
    contador  = 0
    while os.path.exists(os.path.join(carpeta, candidato)):
        contador += 1
        candidato = f"{base}_{contador}{ext}"
    return candidato


def _buscar_fila_por_rut(driver, rut_buscado: str) -> "tuple[int, int] | None":
    """
    Recorre TODAS las páginas del grdSupplies buscando la fila cuyo RUT
    coincide con `rut_buscado`. Empieza desde página 1.

    Al retornar, el grid queda posicionado en la página donde se encontró
    el RUT (listo para clicar el botón sin más navegación).

    Retorna (fila_index, pagina) o None si no lo encuentra.
    El driver debe estar en el frame Cuerpo al llamar esta función.
    """
    wait = WebDriverWait(driver, 8)

    # Ir a página 1 para búsqueda completa desde el inicio
    try:
        old_grd = driver.find_element(By.ID, "grdSupplies")
        btn_p1  = driver.find_element(
            By.XPATH,
            "//table[@id='WucPagerGrid__TblPages']"
            "//div[contains(@onclick,'fnMovePage(1,')]"
        )
        driver.execute_script("arguments[0].click();", btn_p1)
        wait.until(EC.staleness_of(old_grd))
        wait.until(EC.presence_of_element_located((By.ID, "grdSupplies")))
    except NoSuchElementException:
        pass  # Ya en página 1

    pagina = 1
    while True:
        filas = driver.find_elements(
            By.XPATH,
            "//table[@id='grdSupplies']//tr[contains(@class,'cssFwk')]"
        )
        for i in range(len(filas)):
            n = i + 2
            try:
                rut_elem = driver.find_element(
                    By.ID, f"grdSupplies_ctl{n:02d}__GvLblRutProvider"
                )
                if rut_elem.text.strip() == rut_buscado:
                    print(f"[OK]   RUT {rut_buscado} encontrado → "
                          f"pág {pagina}, fila {i}.")
                    return (i, pagina)
            except NoSuchElementException:
                continue

        # Avanzar a siguiente página
        sig_pag = pagina + 1
        try:
            old_grd = driver.find_element(By.ID, "grdSupplies")
            btn_sig = driver.find_element(
                By.XPATH,
                f"//table[@id='WucPagerGrid__TblPages']"
                f"//div[contains(@onclick,'fnMovePage({sig_pag},')]"
            )
            driver.execute_script("arguments[0].click();", btn_sig)
            wait.until(EC.staleness_of(old_grd))
            wait.until(EC.presence_of_element_located((By.ID, "grdSupplies")))
            pagina = sig_pag
        except NoSuchElementException:
            break  # No hay más páginas

    print(f"[ERROR] RUT {rut_buscado} no encontrado en ninguna hoja del cuadro.")
    return None


def _buscar_boton_tipo(driver, fila_index: int, tipo: str):
    """
    Busca el botón de anexo dentro del frame Cuerpo (ya activo).
    Patrón ID: grdSupplies_ctl{n}__GvImgb{tipo}Attachment
    donde n = fila_index + 2
    """
    n         = fila_index + 2
    id_exacto = f"grdSupplies_ctl{n:02d}__GvImgb{tipo}Attachment"

    # Estrategia A: ID exacto
    try:
        btn = driver.find_element(By.ID, id_exacto)
        if btn.is_displayed():
            print(f"[INFO] Botón {tipo} encontrado por ID: {id_exacto}")
            return btn
    except NoSuchElementException:
        pass

    # Estrategia B: CSS parcial
    try:
        css = f"input[id*='ctl{n:02d}'][id*='{tipo}Attachment']"
        candidatos = driver.find_elements(By.CSS_SELECTOR, css)
        for c in candidatos:
            if c.is_displayed():
                print(f"[INFO] Botón {tipo} encontrado por CSS: {css}")
                return c
    except Exception:
        pass

    # Estrategia C: título del botón en la fila correcta
    titulos = {
        "Administrative": "Anexos Administrativos",
        "Technical":      "Anexos Técnicos",
        "Economic":       "Anexos económicos",
    }
    try:
        titulo = titulos.get(tipo, "")
        filas  = driver.find_elements(
            By.XPATH,
            "//table[@id='grdSupplies']//tr[contains(@class,'cssFwk')]"
        )
        if fila_index < len(filas):
            fila = filas[fila_index]
            btns = fila.find_elements(
                By.XPATH, f".//input[@type='image'][@title='{titulo}']"
            )
            if btns:
                print(f"[INFO] Botón {tipo} encontrado por título en fila.")
                return btns[0]
    except Exception:
        pass

    return None


def _descargar_archivos_popup(driver, tipo: str, carpeta_destino: str,
                               nombre_prov: str, rut: str, log: list) -> int:
    """
    Opera sobre la ventana popup ya activa (DWNL_grdId en el body).

    Antes de cada descarga individual redirige Chrome a `carpeta_destino`
    mediante CDP, de modo que el archivo llega directo a la carpeta correcta
    sin necesidad de moverlo después.

    Soporta todos los tipos de adjunto: pdf, PDF, docx, doc, xlsx, xls,
    zip, rar y cualquier otro tipo que venga como archivo adjunto.

    Retorna: total de archivos descargados, o -1 si la tabla no cargó.
    """
    if not carpeta_destino:
        print(f"[WARN] Sin ruta destino para {tipo}. Se omite.")
        return -1

    # Apuntar Chrome a la carpeta del proveedor/tipo desde el primer momento
    _set_download_folder(driver, carpeta_destino)

    try:
        WebDriverWait(driver, ESPERA_MAX).until(
            EC.presence_of_element_located((By.ID, "DWNL_grdId"))
        )
    except TimeoutException:
        print(f"[WARN] Tabla de archivos no encontrada en popup {tipo}.")
        return -1

    total_descargados = 0
    pagina            = 1

    while True:
        filas = driver.find_elements(
            By.XPATH,
            "//table[@id='DWNL_grdId']//tr["
            "contains(@class,'cssFwkItemStyle') or "
            "contains(@class,'cssFwkAlternatingItemStyle')]"
        )

        if not filas:
            if pagina == 1:
                print(f"[INFO] Popup {SUBCARPETAS[tipo]} sin archivos.")
                log.append({
                    "proveedor": nombre_prov, "rut": rut,
                    "tipo_anexo": SUBCARPETAS[tipo],
                    "archivo": "", "estado": "Popup vacío", "detalle": "",
                })
            break

        sufijo_pag = f" (pág. {pagina})" if pagina > 1 else ""
        print(f"[INFO] {len(filas)} archivo(s) en {SUBCARPETAS[tipo]}{sufijo_pag}.")

        for idx in range(len(filas)):
            ctl = f"ctl{idx + 2:02d}"

            try:
                nombre_archivo = driver.find_element(
                    By.ID, f"DWNL_grdId_{ctl}_File"
                ).text.strip()
            except Exception:
                nombre_archivo = f"archivo_p{pagina}_{idx + 1}"

            print(f"[INFO] Descargando: {nombre_archivo}")

            try:
                # Re-confirmar destino antes de cada archivo (previene confusiones)
                _set_download_folder(driver, carpeta_destino)

                # Snapshot de la carpeta destino ANTES de disparar la descarga
                snapshot = set(os.listdir(carpeta_destino))

                chk_id = f"DWNL_grdId_{ctl}_chk"
                chk = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.ID, chk_id))
                )
                if not chk.is_selected():
                    driver.execute_script("arguments[0].click();", chk)
                    time.sleep(0.1)

                btn_ver = driver.find_element(By.ID, f"DWNL_grdId_{ctl}_search")
                driver.execute_script("arguments[0].click();", btn_ver)

                # Esperar el archivo en la carpeta destino (ya no en Downloads)
                archivo = esperar_descarga(
                    carpeta_destino, snapshot, nombre_archivo, TIMEOUT_DESCARGA
                )

                if archivo:
                    nombre_final = os.path.basename(archivo)
                    total_descargados += 1
                    print(f"[OK]   Guardado en carpeta correcta: {nombre_final}")
                    log.append({
                        "proveedor": nombre_prov, "rut": rut,
                        "tipo_anexo": SUBCARPETAS[tipo],
                        "archivo": nombre_final,
                        "estado": "Descargado", "detalle": "",
                    })
                else:
                    print(f"[WARN] Timeout esperando: {nombre_archivo}")
                    log.append({
                        "proveedor": nombre_prov, "rut": rut,
                        "tipo_anexo": SUBCARPETAS[tipo],
                        "archivo": nombre_archivo,
                        "estado": "Error",
                        "detalle": f"Timeout {TIMEOUT_DESCARGA}s",
                    })

                # Desactivar checkbox
                try:
                    chk_now = driver.find_element(By.ID, chk_id)
                    if chk_now.is_selected():
                        driver.execute_script("arguments[0].click();", chk_now)
                except Exception:
                    pass

                time.sleep(0.3)

            except StaleElementReferenceException:
                print(f"[WARN] Fila {idx+1} p{pagina} obsoleta (postback).")
                log.append({
                    "proveedor": nombre_prov, "rut": rut,
                    "tipo_anexo": SUBCARPETAS[tipo],
                    "archivo": nombre_archivo,
                    "estado": "Error", "detalle": "StaleElement",
                })
                continue
            except Exception as e:
                print(f"[WARN] Error en '{nombre_archivo}': {e}")
                log.append({
                    "proveedor": nombre_prov, "rut": rut,
                    "tipo_anexo": SUBCARPETAS[tipo],
                    "archivo": nombre_archivo,
                    "estado": "Error", "detalle": str(e),
                })
                continue

        # ── Navegar a siguiente página del popup ──────────────────
        sig_pag = pagina + 1
        try:
            old_dwnl = driver.find_element(By.ID, "DWNL_grdId")
            siguiente = driver.find_element(
                By.XPATH, f"//a[contains(@href,'Page${sig_pag}')]"
            )
            driver.execute_script("arguments[0].click();", siguiente)
            WebDriverWait(driver, 10).until(EC.staleness_of(old_dwnl))
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "DWNL_grdId"))
            )
            pagina = sig_pag
            print(f"[INFO] Avanzando a página {pagina} del popup.")
        except NoSuchElementException:
            break

    return total_descargados


# ─────────────────────────────────────────────
#  FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────
def descargar_anexos_proveedor(driver, proveedor: dict, rutas: dict,
                               log: list) -> dict:
    """
    Descarga los 3 tipos de anexos para un proveedor.

    Flujo por cada tipo:
      1. Cambiar a frame 'Cuerpo' (donde está grdSupplies)
      2. Localizar el botón del tipo de anexo
      3. Hacer clic → se abre ventana popup nueva
      4. Cambiar a esa ventana
      5. Redirigir Chrome vía CDP a la carpeta correcta del proveedor
      6. Descargar todos los archivos directo a esa carpeta
      7. Cerrar popup → volver a ventana principal → frame Cuerpo

    Retorna dict {"admin": int, "tec": int, "econ": int}
    """
    ventana_principal = driver.current_window_handle
    fila_index        = proveedor["fila_index"]
    nombre_prov       = proveedor["nombre"]
    rut               = proveedor["rut"]
    conteo            = {"admin": 0, "tec": 0, "econ": 0}

    for tipo in ("Administrative", "Technical", "Economic"):
        clave           = TIPO_MAP[tipo]
        carpeta_destino = rutas.get(clave, "")

        print(f"\n[INFO] ── {SUBCARPETAS[tipo]} ── {nombre_prov}")

        for intento in range(1, REINTENTOS + 1):
            handles_antes_intento = set(driver.window_handles)

            try:
                # ── 1. Ir al frame Cuerpo ──────────────────────
                driver.switch_to.window(ventana_principal)
                ok = _entrar_frame_cuerpo(driver)
                if not ok:
                    print(f"[WARN] Intento {intento}: no se pudo entrar al frame Cuerpo.")
                    time.sleep(2)
                    continue

                # ── 1b. Confirmar página del cuadro usando el paginador ──
                # En ASP.NET el botón de la página ACTIVA no se renderiza
                # como div clickeable: si el botón existe → estamos en otra
                # página → navegar; si no existe → ya estamos en la correcta.
                # Esto evita timeouts innecesarios y llamadas JS ambiguas.
                pagina_grd = proveedor.get("pagina_grd", 1)
                try:
                    old_grd   = driver.find_element(By.ID, "grdSupplies")
                    xpath_btn = (
                        f"//table[@id='WucPagerGrid__TblPages']"
                        f"//div[contains(@onclick,'fnMovePage({pagina_grd},')]"
                    )
                    try:
                        btn_pag = driver.find_element(By.XPATH, xpath_btn)
                        # Botón encontrado → NO estamos en esa página → navegar
                        driver.execute_script("arguments[0].click();", btn_pag)
                        WebDriverWait(driver, 10).until(EC.staleness_of(old_grd))
                        WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.ID, "grdSupplies"))
                        )
                        print(f"[INFO] Cuadro navegado a página {pagina_grd}.")
                    except NoSuchElementException:
                        # Sin botón → ya estamos en la página correcta
                        print(f"[INFO] Cuadro ya en página {pagina_grd}.")
                except Exception as pe:
                    print(f"[WARN] Navegación a página {pagina_grd} falló: {pe}")

                # ── 1c. Verificar RUT; buscar fila si no coincide ──
                # Lee el RUT del grid. Si coincide: perfecto.
                # Si NO coincide: busca el RUT en todas las hojas del cuadro
                # y usa la fila donde realmente está, sin abrir ningún popup
                # hasta estar seguros de la fila correcta.
                n_ctl       = fila_index + 2
                rut_id      = f"grdSupplies_ctl{n_ctl:02d}__GvLblRutProvider"
                fila_actual = fila_index   # puede corregirse con la búsqueda
                try:
                    rut_en_grid = driver.find_element(By.ID, rut_id).text.strip()
                    if rut_en_grid != rut:
                        print(f"[WARN] RUT no coincide en fila {fila_index} "
                              f"pág {pagina_grd}:")
                        print(f"       Esperado : {rut}")
                        print(f"       En grid  : {rut_en_grid}")
                        print(f"       Buscando RUT en el cuadro...")
                        resultado = _buscar_fila_por_rut(driver, rut)
                        if resultado is None:
                            print(f"[ERROR] RUT {rut} no encontrado en ninguna "
                                  f"hoja → se omite {SUBCARPETAS[tipo]}.")
                            driver.switch_to.default_content()
                            break   # no reintentar, no está en el cuadro
                        fila_actual, _ = resultado
                    else:
                        print(f"[OK]   RUT {rut_en_grid} verificado "
                              f"→ {SUBCARPETAS[tipo]}")
                except NoSuchElementException:
                    print(f"[WARN] No se pudo leer RUT fila {fila_index} "
                          f"→ procediendo con fila original.")

                # ── 2. Buscar botón (usa fila_actual, corregida si hubo búsqueda)
                boton = _buscar_boton_tipo(driver, fila_actual, tipo)
                if boton is None:
                    print(f"[INFO] Sin botón '{tipo}' → carpeta vacía.")
                    log.append({
                        "proveedor": nombre_prov, "rut": rut,
                        "tipo_anexo": SUBCARPETAS[tipo],
                        "archivo": "", "estado": "Sin botón", "detalle": "",
                    })
                    driver.switch_to.default_content()
                    break

                # ── 3. Clic en botón ──────────────────────────
                handles_antes_popup = set(driver.window_handles)
                try:
                    boton.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", boton)

                # ── 4. Esperar ventana popup ──────────────────
                try:
                    WebDriverWait(driver, TIMEOUT_POPUP).until(
                        lambda d: len(d.window_handles) > len(handles_antes_popup)
                    )
                except TimeoutException:
                    print(f"[WARN] Intento {intento}/{REINTENTOS}: popup no se abrió.")
                    driver.switch_to.default_content()
                    time.sleep(1)
                    continue

                popup_handle = (
                    set(driver.window_handles) - handles_antes_popup
                ).pop()
                driver.switch_to.window(popup_handle)

                # ── 5 y 6. Descargar directo a carpeta del proveedor ─
                n = _descargar_archivos_popup(
                    driver, tipo, carpeta_destino, nombre_prov, rut, log
                )

                # ── 7. Cerrar popup y volver ──────────────────
                driver.close()
                driver.switch_to.window(ventana_principal)
                driver.switch_to.default_content()

                if n == -1:
                    print(f"[WARN] Intento {intento}/{REINTENTOS}: tabla no cargó.")
                    time.sleep(1)
                    continue

                conteo[clave] = n
                print(f"[OK]   {n} archivo(s) en {SUBCARPETAS[tipo]}.")
                break

            except Exception as e:
                print(f"[WARN] Intento {intento}/{REINTENTOS} error: {e}")
                for h in list(driver.window_handles):
                    if h not in handles_antes_intento and h != ventana_principal:
                        try:
                            driver.switch_to.window(h)
                            driver.close()
                        except Exception:
                            pass
                try:
                    driver.switch_to.window(ventana_principal)
                    driver.switch_to.default_content()
                except Exception:
                    pass
                time.sleep(2)

        else:
            print(f"[ERROR TÉCNICO] No se descargaron '{tipo}' para {nombre_prov} "
                  f"tras {REINTENTOS} intentos.")
            print(f"[ERROR SIMPLE]  Los {SUBCARPETAS[tipo]} no pudieron descargarse. "
                  "La carpeta quedará vacía.")
            try:
                driver.switch_to.window(ventana_principal)
                driver.switch_to.default_content()
            except Exception:
                pass

    return conteo


# ─────────────────────────────────────────────
#  MAIN (prueba independiente)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("etapa4_anexos.py — Para probar, ejecutar desde scraper_mp.py.")
    print(f"Tipos disponibles : {list(TIPO_MAP.keys())}")
    print(f"Frame objetivo    : Cuerpo")
