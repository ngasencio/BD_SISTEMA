"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 3
  Descarga de Documentos Anexos de la Licitación ("Ver Adjuntos")
=============================================================
  Reemplaza la descarga de "Ficha del Proveedor" (portal externo
  proveedor.mercadopublico.cl, con errores de carga frecuentes) por la
  descarga de los adjuntos propios de la ficha de la licitación: botón
  "Ver Adjuntos" (id=imgAdjuntos), que abre una ventana nueva con la tabla
  estándar de adjuntos (DWNL_grdId) — Bases, Resoluciones, Formularios, etc.

  Debe ejecutarse ANTES de abrir el Cuadro de Ofertas (imgCuadroOferta),
  estando el driver en el documento principal de la ficha.
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

from _utils import set_download_folder, esperar_descarga

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ─────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────
ESPERA_MAX       = 15
TIMEOUT_POPUP    = 20
TIMEOUT_DESCARGA = 45
REINTENTOS       = 2


# ─────────────────────────────────────────────
#  PRIVADO
# ─────────────────────────────────────────────
def _buscar_boton_adjuntos(driver):
    """Localiza el botón 'Ver Adjuntos' (input#imgAdjuntos) en la ficha."""
    for metodo, valor in [
        (By.ID, "imgAdjuntos"),
        (By.NAME, "imgAdjuntos"),
        (By.CSS_SELECTOR, "input[id*='imgAdjuntos']"),
    ]:
        try:
            btn = WebDriverWait(driver, 8).until(
                EC.element_to_be_clickable((metodo, valor))
            )
            print(f"[INFO] Botón 'Ver Adjuntos' encontrado ({valor}).")
            return btn
        except TimeoutException:
            continue
    return None


def _descargar_tabla_adjuntos(driver, carpeta_destino: str) -> int:
    """
    Opera sobre la ventana popup de 'Ver Adjuntos' ya activa (DWNL_grdId
    directo en el body — misma estructura que los popups de anexos por
    proveedor de etapa4_anexos.py). Selecciona el checkbox de cada fila y
    hace clic en su botón 'Ver Anexo', con soporte de paginación.

    Retorna la cantidad de archivos descargados.
    """
    if not carpeta_destino:
        print("[WARN] Sin carpeta destino para Documentos Anexos. Se omite.")
        return 0

    set_download_folder(driver, carpeta_destino)

    try:
        WebDriverWait(driver, ESPERA_MAX).until(
            EC.presence_of_element_located((By.ID, "DWNL_grdId"))
        )
    except TimeoutException:
        print("[INFO] Ventana de adjuntos sin tabla de documentos.")
        return 0

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
                print("[INFO] Tabla de adjuntos de la licitación vacía.")
            break

        sufijo_pag = f" (pág. {pagina})" if pagina > 1 else ""
        print(f"[INFO] {len(filas)} documento(s) en Documentos Anexos{sufijo_pag}.")

        for idx in range(len(filas)):
            ctl = f"ctl{idx + 2:02d}"

            try:
                nombre_archivo = driver.find_element(
                    By.ID, f"DWNL_grdId_{ctl}_File"
                ).text.strip()
            except Exception:
                nombre_archivo = f"documento_p{pagina}_{idx + 1}"

            print(f"[INFO] Descargando: {nombre_archivo}")

            try:
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

                archivo = esperar_descarga(
                    carpeta_destino, snapshot, nombre_archivo, TIMEOUT_DESCARGA
                )

                if archivo:
                    total_descargados += 1
                    print(f"[OK]   Guardado: {os.path.basename(archivo)}")
                else:
                    print(f"[WARN] Timeout esperando: {nombre_archivo}")

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
                continue
            except Exception as e:
                print(f"[WARN] Error en '{nombre_archivo}': {e}")
                continue

        # ── Navegar a siguiente página, si existe ──────────────────
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
            print(f"[INFO] Avanzando a página {pagina} de Documentos Anexos.")
        except NoSuchElementException:
            break

    return total_descargados


# ─────────────────────────────────────────────
#  FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────
def descargar_adjuntos_licitacion(driver, carpeta_destino: str) -> int:
    """
    Abre el cuadro "Ver Adjuntos" de la licitación (botón imgAdjuntos) y
    descarga todos los documentos listados en la tabla DWNL_grdId hacia
    `carpeta_destino` (carpeta "Documentos Anexos" creada por
    etapa2_carpetas.crear_carpeta_principal).

    Debe llamarse con el driver en el contexto principal de la ficha
    (default_content, justo después de entrar_ficha()/obtener_nombre_licitacion()
    y ANTES de abrir_cuadro_ofertas()).

    No es un paso fatal: si la licitación no publica adjuntos o el botón no
    existe, retorna 0 y el flujo principal continúa con normalidad.

    Retorna la cantidad de archivos descargados.
    """
    print("\n[INFO] Buscando botón 'Ver Adjuntos' de la licitación...")
    driver.switch_to.default_content()
    ventana_principal = driver.current_window_handle

    boton = _buscar_boton_adjuntos(driver)
    if boton is None:
        print("[INFO] Sin botón 'Ver Adjuntos' — licitación sin documentos adjuntos.")
        return 0

    for intento in range(1, REINTENTOS + 1):
        handles_antes = set(driver.window_handles)
        try:
            try:
                boton.click()
            except Exception:
                driver.execute_script("arguments[0].click();", boton)

            try:
                WebDriverWait(driver, TIMEOUT_POPUP).until(
                    lambda d: len(d.window_handles) > len(handles_antes)
                )
            except TimeoutException:
                print(f"[WARN] Intento {intento}/{REINTENTOS}: ventana de "
                      f"adjuntos no se abrió en {TIMEOUT_POPUP}s.")
                time.sleep(1)
                continue

            popup_handle = (set(driver.window_handles) - handles_antes).pop()
            driver.switch_to.window(popup_handle)

            total = _descargar_tabla_adjuntos(driver, carpeta_destino)

            driver.close()
            driver.switch_to.window(ventana_principal)
            driver.switch_to.default_content()

            print(f"[OK]   {total} documento(s) de la licitación descargado(s) "
                  f"en 'Documentos Anexos'.")
            return total

        except Exception as e:
            print(f"[WARN] Intento {intento}/{REINTENTOS} error: {e}")
            for h in list(driver.window_handles):
                if h not in handles_antes and h != ventana_principal:
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

    print("[WARN] No se pudieron descargar los documentos adjuntos de la licitación "
          f"tras {REINTENTOS} intentos.")
    return 0


# ─────────────────────────────────────────────
#  MAIN (prueba independiente)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("etapa3_adjuntos.py — Para probar, ejecutar desde scraper_mp.py.")
