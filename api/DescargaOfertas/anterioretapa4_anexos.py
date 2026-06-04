"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 4
  Descarga de Anexos (Administrativos, Técnicos, Económicos)
=============================================================
"""

import os
import sys
import time
import shutil

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
TIMEOUT_DESCARGA = 30
TIMEOUT_POPUP    = 10
ESPERA_MAX       = 20

# tipo → clave en rutas del proveedor
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


# ─────────────────────────────────────────────
#  AUXILIARES
# ─────────────────────────────────────────────
def esperar_descarga(carpeta_descargas: str, nombre_esperado: str,
                     timeout: int = TIMEOUT_DESCARGA) -> "str | None":
    """
    Espera que aparezca el archivo en Descargas.
    Ignora .crdownload (descarga en progreso de Chrome).
    Retorna la ruta completa o None si timeout.
    """
    inicio = time.time()
    while time.time() - inicio < timeout:
        try:
            archivos = [f for f in os.listdir(carpeta_descargas)
                        if not f.endswith('.crdownload') and not f.endswith('.tmp')]
        except OSError:
            time.sleep(0.5)
            continue

        # Buscar por nombre exacto
        for archivo in archivos:
            if nombre_esperado.lower() in archivo.lower():
                return os.path.join(carpeta_descargas, archivo)

        # Fallback: archivo más reciente modificado en los últimos 5 segundos
        recientes = [
            os.path.join(carpeta_descargas, f) for f in archivos
            if time.time() - os.path.getmtime(os.path.join(carpeta_descargas, f)) < 5
        ]
        if recientes:
            return max(recientes, key=os.path.getmtime)

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


def _buscar_boton_tipo(driver, fila_index: int, tipo: str):
    """
    Busca el botón de anexo en grdSupplies.
    n = fila_index + 2  (ctl01=header, ctl02=primera fila de datos)
    """
    n            = fila_index + 2
    id_exacto    = f"grdSupplies_ctl{n:02d}__GvImgb{tipo}Attachment"
    css_fallback = f"input[id*='ctl{n:02d}'][id*='{tipo}']"

    try:
        btn = driver.find_element(By.ID, id_exacto)
        if btn.is_displayed():
            return btn
    except NoSuchElementException:
        pass

    try:
        for c in driver.find_elements(By.CSS_SELECTOR, css_fallback):
            if c.is_displayed():
                return c
    except Exception:
        pass

    return None


def _descargar_popup(driver, tipo: str, carpeta_destino: str,
                     carpeta_descargas: str, nombre_proveedor: str,
                     rut: str, log: list) -> int:
    """
    Opera sobre el popup ya activo.
    Espera DWNL_grdId, descarga cada archivo y lo mueve a carpeta_destino.
    Retorna el número de archivos descargados, o -1 si la tabla no cargó (reintentar).
    """
    try:
        WebDriverWait(driver, ESPERA_MAX).until(
            EC.presence_of_element_located((By.ID, "DWNL_grdId"))
        )
    except TimeoutException:
        print(f"[WARN] Tabla DWNL_grdId no encontrada en popup {tipo}.")
        return -1  # señal para reintentar

    time.sleep(0.5)

    filas = driver.find_elements(
        By.XPATH,
        "//table[@id='DWNL_grdId']//tr["
        "@class='cssFwkItemStyle' or @class='cssFwkAlternatingItemStyle']"
    )

    if not filas:
        print(f"[INFO] Popup {tipo} sin archivos (tabla vacía).")
        log.append({
            "proveedor": nombre_proveedor,
            "rut":        rut,
            "tipo_anexo": SUBCARPETAS.get(tipo, tipo),
            "archivo":    "",
            "estado":     "Popup vacío",
            "detalle":    "",
        })
        return 0

    print(f"[INFO] {len(filas)} archivo(s) disponibles en popup {tipo}.")
    descargados = 0

    for idx, fila in enumerate(filas):
        ctl = f"ctl{idx + 2:02d}"  # ctl02, ctl03, ...

        # Nombre del archivo (span con ID exacto)
        try:
            nombre_archivo = driver.find_element(
                By.ID, f"DWNL_grdId_{ctl}_File"
            ).text.strip()
        except Exception:
            nombre_archivo = f"archivo_{idx + 1}"

        try:
            snapshot = set(os.listdir(carpeta_descargas))

            # Activar checkbox
            chk = driver.find_element(By.ID, f"DWNL_grdId_{ctl}_chk")
            if not chk.is_selected():
                driver.execute_script("arguments[0].click();", chk)
                time.sleep(0.3)

            # Clic en Ver Anexo
            btn_ver = driver.find_element(By.ID, f"DWNL_grdId_{ctl}_search")
            driver.execute_script("arguments[0].click();", btn_ver)

            # Esperar descarga
            archivo = esperar_descarga(carpeta_descargas, nombre_archivo, TIMEOUT_DESCARGA)

            if archivo:
                nombre_final = _nombre_unico(carpeta_destino, os.path.basename(archivo))
                destino = os.path.join(carpeta_destino, nombre_final)
                shutil.move(archivo, destino)
                descargados += 1
                print(f"[OK]   {nombre_final}")
                log.append({
                    "proveedor": nombre_proveedor,
                    "rut":        rut,
                    "tipo_anexo": SUBCARPETAS.get(tipo, tipo),
                    "archivo":    nombre_final,
                    "estado":     "Descargado",
                    "detalle":    "",
                })
            else:
                print(f"[WARN] Timeout descargando '{nombre_archivo}'.")
                log.append({
                    "proveedor": nombre_proveedor,
                    "rut":        rut,
                    "tipo_anexo": SUBCARPETAS.get(tipo, tipo),
                    "archivo":    nombre_archivo,
                    "estado":     "Error",
                    "detalle":    f"Timeout {TIMEOUT_DESCARGA}s",
                })

            # Desactivar checkbox antes del siguiente archivo
            try:
                chk_actual = driver.find_element(By.ID, f"DWNL_grdId_{ctl}_chk")
                if chk_actual.is_selected():
                    driver.execute_script("arguments[0].click();", chk_actual)
            except Exception:
                pass

            time.sleep(0.5)

        except StaleElementReferenceException:
            print(f"[WARN] Fila {idx + 1} obsoleta (postback ASP.NET).")
            log.append({
                "proveedor": nombre_proveedor, "rut": rut,
                "tipo_anexo": SUBCARPETAS.get(tipo, tipo),
                "archivo":    nombre_archivo,
                "estado":     "Error",
                "detalle":    "StaleElementReference",
            })
            continue
        except Exception as e:
            print(f"[WARN] Error en '{nombre_archivo}': {e}")
            log.append({
                "proveedor": nombre_proveedor, "rut": rut,
                "tipo_anexo": SUBCARPETAS.get(tipo, tipo),
                "archivo":    nombre_archivo,
                "estado":     "Error",
                "detalle":    str(e),
            })
            continue

    return descargados


# ─────────────────────────────────────────────
#  FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────
def descargar_anexos_proveedor(driver, proveedor: dict, rutas: dict,
                               carpeta_descargas: str, log: list) -> dict:
    """
    Descarga los 3 tipos de anexos para un proveedor.

    El cuadro de ofertas es un RadWindow overlay con un <iframe name='PopupFicha'>
    que contiene grdSupplies. Esta función entra al iframe en cada iteración para
    encontrar los botones, y sale de él antes de cambiar de ventana.

    Parámetros
    ----------
    driver            : WebDriver en la ventana de la ficha (default content)
    proveedor         : {"letra", "rut", "nombre", "fila_index"}
    rutas             : rutas del proveedor {"admin", "tec", "econ", "ficha", "raiz"}
    carpeta_descargas : path absoluto a la carpeta de Descargas de Windows
    log               : lista mutable; se hace append de cada evento

    Retorna
    -------
    dict  {"admin": int, "tec": int, "econ": int}
    """
    cuadro_handle = driver.current_window_handle  # ventana de la ficha (default content)
    fila_index    = proveedor["fila_index"]
    nombre_prov   = proveedor["nombre"]
    rut           = proveedor["rut"]
    conteo        = {"admin": 0, "tec": 0, "econ": 0}

    for tipo in ("Administrative", "Technical", "Economic"):
        clave_rutas     = TIPO_MAP[tipo]
        carpeta_destino = rutas.get(clave_rutas, "")

        print(f"\n[INFO] Anexos {SUBCARPETAS[tipo]} — {nombre_prov}...")

        for intento in range(1, REINTENTOS + 1):
            # Snapshot de handles ANTES de hacer nada en este intento
            handles_snapshot = set(driver.window_handles)

            try:
                # ── 0. Entrar al iframe PopupFicha ──
                # grdSupplies y sus botones viven dentro del RadWindow iframe
                driver.switch_to.default_content()
                driver.switch_to.frame(driver.find_element(By.NAME, "PopupFicha"))

                handles_antes = set(driver.window_handles)

                # ── 1. Localizar y clicar botón ──
                boton = _buscar_boton_tipo(driver, fila_index, tipo)
                if boton is None:
                    print(f"[INFO] Sin botón '{tipo}' para fila {fila_index}. Carpeta vacía.")
                    log.append({
                        "proveedor": nombre_prov, "rut": rut,
                        "tipo_anexo": SUBCARPETAS[tipo], "archivo": "",
                        "estado": "Sin botón", "detalle": "",
                    })
                    driver.switch_to.default_content()
                    break  # Definitivo, no reintentar

                try:
                    boton.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", boton)

                # ── 2. Esperar popup de anexos (window.open → nueva ventana real) ──
                try:
                    WebDriverWait(driver, TIMEOUT_POPUP).until(
                        lambda d: len(d.window_handles) > len(handles_antes)
                    )
                except TimeoutException:
                    print(f"[WARN] Intento {intento}/{REINTENTOS}: popup de anexos no se abrió.")
                    driver.switch_to.default_content()
                    time.sleep(2)
                    continue

                popup_handle = (set(driver.window_handles) - handles_antes).pop()
                driver.switch_to.window(popup_handle)

                # ── 3. Descargar archivos del popup ──
                n = _descargar_popup(
                    driver, tipo, carpeta_destino, carpeta_descargas,
                    nombre_prov, rut, log
                )

                # ── 4. Cerrar popup y volver al cuadro (default content) ──
                driver.close()
                driver.switch_to.window(cuadro_handle)
                # Ahora en default content; el iframe PopupFicha sigue en el DOM

                if n == -1:
                    time.sleep(2)
                    continue

                conteo[clave_rutas] = n
                print(f"[OK]   {n} archivo(s) {SUBCARPETAS[tipo]} descargados.")
                break  # Éxito

            except Exception as e:
                print(f"[WARN] Intento {intento}/{REINTENTOS} error inesperado: {e}")
                # Cerrar ventanas extra que puedan haber quedado abiertas
                for h in list(driver.window_handles):
                    if h not in handles_snapshot and h != cuadro_handle:
                        try:
                            driver.switch_to.window(h)
                            driver.close()
                        except Exception:
                            pass
                try:
                    driver.switch_to.window(cuadro_handle)
                except Exception:
                    pass
                time.sleep(3)
        else:
            print(f"[ERROR TÉCNICO] No se descargaron anexos '{tipo}' para {nombre_prov} "
                  f"tras {REINTENTOS} intentos.")
            print(f"[ERROR SIMPLE]  Los anexos '{SUBCARPETAS[tipo]}' no pudieron "
                  "descargarse. La carpeta quedará vacía.")
            try:
                driver.switch_to.default_content()
            except Exception:
                pass

    return conteo


# ─────────────────────────────────────────────
#  MAIN (prueba independiente)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    carpeta_descargas = os.path.join(os.path.expanduser("~"), "Downloads")
    print("etapa4_anexos.py - Para probar, ejecutar desde scraper_mp.py.")
    print(f"Carpeta descargas: {carpeta_descargas}")
    print(f"Tipos disponibles: {list(TIPO_MAP.keys())}")
