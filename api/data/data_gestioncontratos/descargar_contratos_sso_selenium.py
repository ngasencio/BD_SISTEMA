"""
descargar_contratos_sso_selenium.py
=====================================
Automatiza la descarga del Excel de contratos del Servicio de Salud Osorno
desde https://www.mercadopublico.cl/Contratos/Ciudadania
usando Selenium + ChromeDriver.

Requisitos:
    pip install selenium webdriver-manager lxml sqlalchemy
"""

import time
import urllib.parse
from pathlib import Path

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from sqlalchemy import create_engine, text
from webdriver_manager.chrome import ChromeDriverManager

# ─── Configuración descarga ────────────────────────────────────────────────────
URL_BASE       = "https://www.mercadopublico.cl/Contratos/Ciudadania"
INSTITUCION    = "SERVICIO DE SALUD OSORNO"
DATA_CODE      = "7296"
CARPETA_SALIDA = Path(__file__).parent / "data_gestioncontratos"
HEADLESS       = True
WAIT_TIMEOUT   = 30
WAIT_DESCARGA  = 60

# ─── Configuración base de datos ───────────────────────────────────────────────
DB_HOST     = "127.0.0.1"
DB_PORT     = 3306
DB_NAME     = "bd_sistema"
DB_USER     = "root"
DB_PASSWORD = "Nicolas2017#"
TABLA_DB    = "data_gestioncontratos"

# ─── Nombres de columnas del archivo (25 columnas, tabla HTML índice 2) ────────
COLUMNAS = [
    "numero_contrato",
    "nombre_contrato",
    "id_licitacion_oc",
    "rut_organismo",
    "nombre_organismo",
    "ejecucion_contrato",
    "categoria_contrato",
    "tipo_contrato",
    "unidad_requirente",
    "unidad_moneda",
    "monto_contrato",
    "monto_ejecutado",
    "monto_por_ejecutar",
    "fecha_inicio",
    "fecha_termino",
    "estado_contrato",
    "garantias_hitos_incumplidos",
    "garantias_por_vencer",
    "garantias_vencidas",
    "garantias_cobradas",
    "sanciones_solicitadas",
    "sanciones_aplicadas",
    "dias_vigencia",
    "dias_restantes",
    "evaluacion",
]


# =============================================================================
# DESCARGA
# =============================================================================

def crear_driver(carpeta_descarga: Path) -> webdriver.Chrome:
    opciones = Options()
    if HEADLESS:
        opciones.add_argument("--headless=new")
    opciones.add_argument("--no-sandbox")
    opciones.add_argument("--disable-dev-shm-usage")
    opciones.add_argument("--disable-gpu")
    opciones.add_argument("--window-size=1280,900")
    prefs = {
        "download.default_directory":  str(carpeta_descarga.resolve()),
        "download.prompt_for_download": False,
        "download.directory_upgrade":   True,
        "safebrowsing.enabled":         True,
    }
    opciones.add_experimental_option("prefs", prefs)
    servicio = Service(ChromeDriverManager().install())
    driver   = webdriver.Chrome(service=servicio, options=opciones)
    driver.set_page_load_timeout(60)
    return driver


def _log_consola(paso=None, paso_desc=None, progreso_pct=None, log=None):
    """Callback por defecto quando se ejecuta el script standalone (CLI)."""
    if log:
        print(log)


def esperar_descarga(carpeta: Path, timeout: int = WAIT_DESCARGA, progress_callback=None) -> Path:
    _avisar = progress_callback or _log_consola
    _avisar(log="Esperando que el archivo se descargue …")
    inicio = time.time()
    while time.time() - inicio < timeout:
        xlsx_files = [f for f in carpeta.glob("*.xls*") if f.suffix != ".crdownload"]
        temporales = list(carpeta.glob("*.crdownload"))
        if xlsx_files and not temporales:
            return max(xlsx_files, key=lambda f: f.stat().st_mtime)
        time.sleep(1)
    raise TimeoutError(f"El archivo no se descargó en {timeout} segundos.")


def descargar_archivo(progress_callback=None) -> Path:
    """Descarga el Excel de contratos SSO desde Mercado Público.

    Retorna la ruta del archivo descargado (renombrado con la fecha del día).
    Si se pasa `progress_callback(paso=None, paso_desc=None, progreso_pct=None, log=None)`,
    se usa para reportar avance en vez de `print()` — evita errores de encoding cp1252
    cuando se ejecuta headless desde un hilo del servidor Django en Windows.
    """
    _avisar = progress_callback or _log_consola

    CARPETA_SALIDA.mkdir(parents=True, exist_ok=True)
    _avisar(log=f"Carpeta de destino: {CARPETA_SALIDA.resolve()}")

    driver = crear_driver(CARPETA_SALIDA)
    wait   = WebDriverWait(driver, WAIT_TIMEOUT)

    try:
        _avisar(paso_desc="Abriendo Mercado Público...", progreso_pct=10, log=f"Abriendo {URL_BASE} …")
        driver.get(URL_BASE)
        _avisar(log="Página cargada.")

        _avisar(paso_desc="Buscando institución...", progreso_pct=20,
                log="Haciendo clic en 'Revisar contrato por institución pública' …")
        bloque = wait.until(EC.element_to_be_clickable((By.ID, "byins")))
        bloque.click()

        _avisar(log=f"Ingresando '{INSTITUCION}' …")
        input_nombre = wait.until(EC.visibility_of_element_located((By.ID, "txtNombreIns")))
        input_nombre.clear()
        input_nombre.send_keys(INSTITUCION)

        _avisar(progreso_pct=30, log="Buscando …")
        btn_buscar = wait.until(EC.element_to_be_clickable((By.ID, "btnBuscarNombreInstitucion")))
        btn_buscar.click()

        _avisar(paso_desc="Seleccionando institución en resultados...", progreso_pct=40,
                log="Esperando resultados …")
        selector_css = f'span.lnkBusqueda[data-code="{DATA_CODE}"]'
        resultado = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector_css)))
        _avisar(log=f"Seleccionando: {resultado.text}")
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", resultado)
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", resultado)

        _avisar(paso_desc="Cargando vista de contratos...", progreso_pct=50,
                log="Esperando vista de contratos …")
        btn_excel = wait.until(EC.element_to_be_clickable((By.ID, "excel-contrato")))
        _avisar(log="Botón 'Exportar como archivo Excel' visible.")

        # Eliminar archivo anterior antes de descargar
        for viejo in CARPETA_SALIDA.glob("*.xls*"):
            viejo.unlink()
            _avisar(log=f"Archivo anterior eliminado: {viejo.name}")

        _avisar(paso_desc="Descargando Excel de contratos...", progreso_pct=60,
                log="Iniciando descarga del Excel …")
        btn_excel.click()

        archivo = esperar_descarga(CARPETA_SALIDA, progress_callback=progress_callback)

        # Renombrar con fecha (sin hora) para nombre limpio
        fecha_hoy  = time.strftime("%Y%m%d")
        sufijo     = archivo.suffix
        nombre_final = CARPETA_SALIDA / f"contratos_sso_{fecha_hoy}{sufijo}"

        # Si ya existe un archivo con ese nombre exacto, eliminarlo primero
        if nombre_final.exists():
            nombre_final.unlink()

        archivo.rename(nombre_final)

        _avisar(
            paso_desc="Descarga completada.", progreso_pct=70,
            log=(
                f"Descarga exitosa: {nombre_final.name} "
                f"({nombre_final.stat().st_size:,} bytes)"
            ),
        )
        return nombre_final

    except Exception as exc:
        _avisar(log=f"ERROR en la descarga: {exc}")
        raise

    finally:
        driver.quit()


# =============================================================================
# SUBIDA AL SERVIDOR
# =============================================================================

def _get_engine():
    pwd_enc = urllib.parse.quote_plus(DB_PASSWORD) if DB_PASSWORD else ""
    auth    = f"{DB_USER}:{pwd_enc}@" if DB_PASSWORD else f"{DB_USER}@"

    for dialect in ("mysql+mysqldb", "mysql+pymysql"):
        try:
            dsn = f"{dialect}://{auth}{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
            eng = create_engine(dsn, pool_pre_ping=True)
            with eng.connect() as conn:
                conn.execute(text("SELECT 1"))
            return eng
        except Exception:
            continue
    return None


def subir_al_servidor() -> None:
    print("\n" + "=" * 55)
    print("  🚀  SUBIDA DE CONTRATOS → bd_sistema")
    print(f"  Host : {DB_HOST}:{DB_PORT}  /  BD: {DB_NAME}")
    print("=" * 55)

    # Buscar el archivo en la carpeta
    archivos = list(CARPETA_SALIDA.glob("*.xls*"))
    if not archivos:
        print(f"\n[✗] No se encontró ningún archivo en:\n    {CARPETA_SALIDA.resolve()}")
        print("    Ejecuta primero la opción 1 para descargar el archivo.")
        return

    archivo = max(archivos, key=lambda f: f.stat().st_mtime)
    print(f"\n[→] Leyendo: {archivo.name}")

    # Leer: el archivo .xls es HTML, los datos están en la tabla de índice 2
    try:
        tablas = pd.read_html(str(archivo), encoding="utf-8")
    except Exception as e:
        print(f"[✗] Error al leer el archivo: {e}")
        return

    if len(tablas) < 3:
        print(f"[✗] Estructura inesperada: se esperaban 3 tablas HTML, se encontraron {len(tablas)}.")
        return

    df = tablas[2].copy()

    if df.empty:
        print("[✗] El archivo no contiene datos.")
        return

    # Asignar nombres de columnas limpios
    if len(df.columns) == len(COLUMNAS):
        df.columns = COLUMNAS
    else:
        print(f"[!] Advertencia: se esperaban {len(COLUMNAS)} columnas, se encontraron {len(df.columns)}.")
        print("    Se usarán nombres originales del archivo.")

    print(f"[✓] {len(df)} contratos leídos con {len(df.columns)} columnas.")

    # Conectar a la base de datos
    engine = _get_engine()
    if engine is None:
        print("[✗] No se pudo conectar a MariaDB.")
        print("    Verifica que XAMPP esté activo y las credenciales sean correctas.")
        return

    # Reemplazar tabla (DROP + INSERT)
    try:
        with engine.connect() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS `{TABLA_DB}`"))
            conn.commit()

        df.to_sql(TABLA_DB, con=engine, if_exists="append", index=False, chunksize=500)

        print()
        print("=" * 55)
        print("  ✅  SUBIDA EXITOSA")
        print("=" * 55)
        print(f"  Tabla   : {TABLA_DB}")
        print(f"  Filas   : {len(df)}")
        print(f"  Columnas: {len(df.columns)}")
        print("=" * 55)

    except Exception as e:
        print(f"[✗] Error al subir los datos: {e}")

    finally:
        engine.dispose()


# =============================================================================
# MENÚ PRINCIPAL
# =============================================================================

if __name__ == "__main__":
    while True:
        print("\n" + "=" * 55)
        print("   GESTIÓN DE CONTRATOS SSO - Mercado Público")
        print("=" * 55)
        print("1) Descargar archivo de contratos")
        print("2) Subir al servidor (→ bd_sistema)")
        print("0) Salir")

        op = input("\nSeleccione opción: ").strip()

        try:
            if op == "0":
                print("\n👋 Saliendo …")
                break
            elif op == "1":
                descargar_archivo()
            elif op == "2":
                subir_al_servidor()
            else:
                print("\n⚠️  Opción inválida.")

        except Exception as e:
            print(f"\n[✗] Error inesperado: {e}")
            import traceback
            traceback.print_exc()
