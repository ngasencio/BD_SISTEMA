"""
=============================================================
  SCRAPER MERCADO PÚBLICO - UTILIDADES COMPARTIDAS
  Funciones reutilizadas por etapa3_adjuntos.py y etapa4_anexos.py
=============================================================
"""

import os
import time

EXTS_TEMP = ('.crdownload', '.tmp', '.part', '.download')


def set_download_folder(driver, carpeta: str) -> None:
    """
    Redirige descargas de Chrome a `carpeta` via CDP.
    behavior='allow' fuerza descarga directa sin diálogo ni visor de PDF.
    Intenta Browser.setDownloadBehavior primero; cae a Page.setDownloadBehavior
    para versiones antiguas de ChromeDriver.
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


def esperar_descarga(carpeta: str, snapshot_antes: set,
                     nombre_esperado: str = "",
                     timeout: int = 60) -> "str | None":
    """
    Espera que aparezca un archivo nuevo y completo en `carpeta`.
    Ignora extensiones temporales de Chrome (.crdownload, .tmp, etc.).

    Parámetros
    ----------
    carpeta         : directorio donde Chrome guarda el archivo
    snapshot_antes  : set de nombres de archivo ANTES de disparar la descarga
    nombre_esperado : nombre (o fragmento) que se prefiere si hay varios nuevos
    timeout         : segundos máximos de espera

    Retorna
    -------
    Ruta completa del archivo descargado, o None si se alcanza el timeout.
    """
    inicio    = time.time()
    detectado = False  # True en cuanto se vio al menos un archivo temporal

    while time.time() - inicio < timeout:
        try:
            todos = os.listdir(carpeta)
        except OSError:
            time.sleep(0.5)
            continue

        temporales = [f for f in todos if f.endswith(EXTS_TEMP)]
        if temporales:
            detectado = True
            time.sleep(0.25)   # OPT-7: reducido de 0.5s → 0.25s (detecta rename antes)
            continue

        nuevos = [
            f for f in todos
            if f not in snapshot_antes and not f.endswith(EXTS_TEMP)
        ]

        if nuevos:
            # Preferir el archivo cuyo nombre coincide con el esperado
            if nombre_esperado:
                for f in nuevos:
                    if nombre_esperado.lower() in f.lower():
                        return os.path.join(carpeta, f)
            # Fallback: el archivo más reciente
            return os.path.join(
                carpeta,
                max(nuevos, key=lambda f: os.path.getmtime(os.path.join(carpeta, f)))
            )

        if detectado:
            # Ya se detectó descarga en curso y ahora no hay temporales ni nuevos.
            # Puede ser que el rename aún no ocurrió; esperar un ciclo más.
            time.sleep(0.25)   # OPT-7: reducido de 0.5s → 0.25s
            continue

        time.sleep(0.5)        # OPT-7: reducido de 1s → 0.5s (idle sin descarga activa)

    return None
