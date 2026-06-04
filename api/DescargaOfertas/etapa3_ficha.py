"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 3
  Descarga de Ficha del Proveedor (PDF)
=============================================================
"""

import os
import sys
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ─────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────
ESPERA_MAX       = 20
REINTENTOS       = 3
TIMEOUT_DESCARGA = 60
URL_FICHA_BASE   = "https://proveedor.mercadopublico.cl/ficha/"

EXTS_TEMP = ('.crdownload', '.tmp', '.part', '.download')


# ─────────────────────────────────────────────
#  PRIVADO
# ─────────────────────────────────────────────
def _set_download_folder(driver, carpeta: str):
    """
    Redirige las descargas de Chrome a `carpeta` usando CDP.
    Con behavior='allow' Chrome descarga todo (PDF, docx, etc.)
    sin abrirlo en el navegador ni mostrar diálogo.
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
        try:
            driver.execute_cdp_cmd("Page.setDownloadBehavior", {
                "behavior":     "allow",
                "downloadPath": abs_path,
            })
        except Exception as e:
            print(f"[WARN] CDP setDownloadBehavior falló: {e}")


def _esperar_descarga(carpeta: str, snapshot_antes: set,
                      timeout: int = TIMEOUT_DESCARGA) -> "str | None":
    """
    Espera que aparezca un archivo nuevo y completo en `carpeta`.
    Ignora archivos temporales de Chrome (.crdownload, .tmp, etc.).
    Retorna la ruta completa del archivo descargado, o None si timeout.
    """
    deadline  = time.time() + timeout
    detectado = False

    while time.time() < deadline:
        try:
            archivos_ahora = set(os.listdir(carpeta))
        except OSError:
            time.sleep(1)
            continue

        # Detectar descarga en curso
        parciales = {f for f in archivos_ahora if f.endswith(EXTS_TEMP)}
        if parciales:
            detectado = True
            time.sleep(0.5)
            continue

        # Archivos nuevos y completos
        nuevos  = archivos_ahora - snapshot_antes
        validos = {f for f in nuevos if not f.endswith(EXTS_TEMP)}
        if validos:
            nombre = sorted(
                validos,
                key=lambda f: os.path.getmtime(os.path.join(carpeta, f)),
                reverse=True
            )[0]
            return os.path.join(carpeta, nombre)

        if detectado:
            time.sleep(0.5)
            continue

        time.sleep(1)

    return None


def _buscar_boton_descarga(driver) -> "object | None":
    """
    Busca el botón de descarga de ficha PDF con tres selectores en cascada.
    Retorna el WebElement o None si no se encuentra.
    """
    # Selector 1: XPath por texto visible
    try:
        btn = WebDriverWait(driver, 8).until(
            EC.element_to_be_clickable(
                (By.XPATH, "//a[contains(., 'Descargar ficha')]")
            )
        )
        print("[INFO] Botón ficha encontrado por texto XPath.")
        return btn
    except TimeoutException:
        pass

    # Selector 2: <a> con href que contenga '/ficha/'
    try:
        candidatos = driver.find_elements(By.CSS_SELECTOR, "a[href*='/ficha/']")
        for c in candidatos:
            if "descargar" in c.text.lower() and c.is_displayed():
                print("[INFO] Botón ficha encontrado por href + texto.")
                return c
    except Exception:
        pass

    # Selector 3: clase CSS conocida
    try:
        btn = driver.find_element(By.CSS_SELECTOR, "a.sc-hMSOUR")
        if btn.is_displayed():
            print("[INFO] Botón ficha encontrado por clase CSS sc-hMSOUR.")
            return btn
    except NoSuchElementException:
        pass

    return None


# ─────────────────────────────────────────────
#  FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────
def descargar_ficha(driver, rut: str, nombre: str, carpeta_destino: str) -> bool:
    """
    Navega a la ficha del proveedor en una nueva tab y descarga el PDF
    directamente a carpeta_destino usando CDP.
    Cierra la tab al terminar.

    Retorna True si la descarga fue exitosa, False en caso contrario.
    """
    print(f"\n[INFO] Descargando ficha: {rut} - {nombre}")

    for intento in range(1, REINTENTOS + 1):
        handle_original = driver.current_window_handle
        nueva_tab = None

        try:
            # ── 1. Abrir nueva tab ──
            handles_antes = set(driver.window_handles)
            driver.execute_script("window.open('');")
            WebDriverWait(driver, 10).until(
                lambda d: len(d.window_handles) > len(handles_antes)
            )
            nueva_tab = (set(driver.window_handles) - handles_antes).pop()
            driver.switch_to.window(nueva_tab)

            # ── 2. Apuntar descargas a la carpeta correcta ANTES de navegar ──
            # Es crítico hacerlo aquí: si la URL misma sirve el PDF directamente,
            # Chrome lo descargaría al instante de navegar.
            _set_download_folder(driver, carpeta_destino)

            # ── 3. Navegar a la ficha ──
            url = f"{URL_FICHA_BASE}{rut}"
            driver.get(url)
            WebDriverWait(driver, ESPERA_MAX).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            time.sleep(1.5)

            # ── 4. Buscar botón de descarga ──
            boton = _buscar_boton_descarga(driver)
            if boton is None:
                print(f"[WARN] Ficha no disponible en portal para {rut}.")
                driver.close()
                driver.switch_to.window(handle_original)
                return False

            # ── 5. Confirmar ruta CDP y tomar snapshot ──
            _set_download_folder(driver, carpeta_destino)
            snapshot = set(os.listdir(carpeta_destino))

            driver.execute_script("arguments[0].click();", boton)
            print(f"[INFO] Clic en botón de descarga. Esperando PDF en carpeta ficha...")

            # ── 6. Esperar el archivo en carpeta_destino ──
            archivo = _esperar_descarga(carpeta_destino, snapshot, TIMEOUT_DESCARGA)
            if archivo is None:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: timeout esperando PDF.")
                driver.close()
                driver.switch_to.window(handle_original)
                time.sleep(2)
                continue

            print(f"[OK]   Ficha guardada: {os.path.basename(archivo)}")
            driver.close()
            driver.switch_to.window(handle_original)
            return True

        except Exception as e:
            print(f"[WARN] Intento {intento}/{REINTENTOS} falló: {e}")
            try:
                if nueva_tab and nueva_tab in driver.window_handles:
                    driver.switch_to.window(nueva_tab)
                    driver.close()
                driver.switch_to.window(handle_original)
            except Exception:
                pass
            time.sleep(2)

    print(f"\n[ERROR TÉCNICO] No se pudo descargar la ficha de {nombre} "
          f"tras {REINTENTOS} intentos.")
    print("[ERROR SIMPLE]  La ficha del proveedor no está disponible en el portal.")
    return False


# ─────────────────────────────────────────────
#  MAIN (prueba independiente)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("etapa3_ficha.py - Para probar, ejecutar desde scraper_mp.py.")
    print(f"URL base ficha  : {URL_FICHA_BASE}")
