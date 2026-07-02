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

from _utils import set_download_folder, esperar_descarga

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ─────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────
ESPERA_MAX       = 20
REINTENTOS       = 3
TIMEOUT_DESCARGA = 60
URL_FICHA_BASE   = "https://proveedor.mercadopublico.cl/ficha/"


# ─────────────────────────────────────────────
#  PRIVADO
# ─────────────────────────────────────────────
def _rut_para_url(rut: str) -> str:
    """
    FIX BUG-06: el portal de proveedores espera el RUT sin puntos ('76680253-2'),
    no en el formato de tabla con puntos ('76.680.253-2').
    """
    return rut.replace('.', '')


def _buscar_boton_descarga(driver) -> "object | None":
    """
    FIX BUG-05: eliminado el selector 'a.sc-hMSOUR' que era un hash de
    styled-components y se rompía con cada deploy del portal.
    Ahora usa solo selectores semánticos estables (texto, href, atributos).
    Retorna el WebElement o None si no se encuentra.
    """
    # Selector 1: texto visible exacto o parcial (más robusto)
    for xpath in [
        "//a[contains(normalize-space(.), 'Descargar ficha')]",
        "//button[contains(normalize-space(.), 'Descargar ficha')]",
        "//a[contains(normalize-space(.), 'Descargar Ficha')]",
    ]:
        try:
            btn = WebDriverWait(driver, 8).until(
                EC.element_to_be_clickable((By.XPATH, xpath))
            )
            print(f"[INFO] Botón ficha encontrado por texto: {xpath}")
            return btn
        except TimeoutException:
            continue

    # Selector 2: <a> con href descarga + texto contiene 'descargar'
    try:
        for css in ["a[href*='download']", "a[href*='descargar']",
                    "a[href*='.pdf']", "a[download]"]:
            candidatos = driver.find_elements(By.CSS_SELECTOR, css)
            for c in candidatos:
                if c.is_displayed() and "descargar" in c.text.lower():
                    print(f"[INFO] Botón ficha encontrado por href ({css}).")
                    return c
    except Exception:
        pass

    # Selector 3: botón con aria-label o title relacionado a descarga
    try:
        for css in [
            "a[aria-label*='descargar' i]",
            "a[title*='descargar' i]",
            "button[aria-label*='descargar' i]",
        ]:
            candidatos = driver.find_elements(By.CSS_SELECTOR, css)
            for c in candidatos:
                if c.is_displayed():
                    print(f"[INFO] Botón ficha encontrado por aria/title ({css}).")
                    return c
    except Exception:
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

    rut_url = _rut_para_url(rut)  # FIX BUG-06: sin puntos para la URL

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
            set_download_folder(driver, carpeta_destino)

            # ── 3. Navegar a la ficha (FIX BUG-06: RUT sin puntos) ──
            url = f"{URL_FICHA_BASE}{rut_url}"
            driver.get(url)
            WebDriverWait(driver, ESPERA_MAX).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            time.sleep(1.5)

            # ── 4. Buscar botón de descarga ──
            boton = _buscar_boton_descarga(driver)
            if boton is None:
                print(f"[WARN] Ficha no disponible en portal para {rut_url}.")
                driver.close()
                driver.switch_to.window(handle_original)
                return False

            # ── 5. Confirmar ruta CDP y tomar snapshot ──
            set_download_folder(driver, carpeta_destino)
            snapshot = set(os.listdir(carpeta_destino))

            driver.execute_script("arguments[0].click();", boton)
            print(f"[INFO] Clic en botón de descarga. Esperando PDF en carpeta ficha...")

            # ── 6. Esperar el archivo en carpeta_destino ──
            archivo = esperar_descarga(carpeta_destino, snapshot,
                                       timeout=TIMEOUT_DESCARGA)
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
