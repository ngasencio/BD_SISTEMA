"""
cargar_pac_servidor.py
======================
Carga el archivo PlanificacionPAC2026.xlsx a la base de datos bd_sistema.
Tabla destino: data_planerPAC

Cada ejecucion reemplaza completamente la tabla con el contenido actual del Excel.

Uso:
    python cargar_pac_servidor.py
"""

import pathlib
import urllib.parse

import pandas as pd
from sqlalchemy import create_engine, text

# --- Rutas --------------------------------------------------------------------
RUTA_SCRIPT = pathlib.Path(__file__).parent
ARCHIVO_PAC = RUTA_SCRIPT / "PlanificacionPAC2026.xlsx"
HOJA        = "Hoja1"

# --- Base de datos ------------------------------------------------------------
DB_HOST     = "127.0.0.1"
DB_PORT     = 3306
DB_NAME     = "bd_sistema"
DB_USER     = "root"
DB_PASSWORD = "Nicolas2017#"
TABLA_DB    = "data_planerPAC"

# --- Nombres de columnas limpios (16 columnas, asignacion por posicion) -------
COLUMNAS = [
    "unidad_compra",          # Unidad de Compra
    "id_proyecto",            # ID Proyecto
    "codigo_presupuestario",  # Codigo presupuestario
    "nombre_proyecto",        # Nombre Proyecto
    "cantidad_items",         # Cantidad de Items
    "nombre_item",            # Nombre Item
    "monto_unitario_item",    # Monto Unitario Item
    "monto_total_item",       # Monto Total Item Ano 2026
    "nombre_responsable",     # Nombre responsable
    "cargo_responsable",      # Cargo responsable
    "fecha_inicio_compra",    # Fecha de Inicio Compra
    "depto",                  # depto
    "sub",                    # sub
    "unidad",                 # unidad
    "tipo_proyecto",          # Tipo Proyecto
    "pac",                    # PAC
]


def get_engine():
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


def cargar():
    print("\n" + "=" * 60)
    print("  CARGANDO PAC 2026 -> bd_sistema")
    print(f"  Archivo : {ARCHIVO_PAC.name}")
    print(f"  Tabla   : {TABLA_DB}")
    print("=" * 60)

    # 1. Verificar que el archivo existe
    if not ARCHIVO_PAC.exists():
        print(f"\n[ERROR] No se encontro el archivo:\n   {ARCHIVO_PAC.resolve()}")
        return

    # 2. Leer Excel
    print("\nLeyendo Excel ...")
    df = pd.read_excel(ARCHIVO_PAC, sheet_name=HOJA, header=0, dtype=str)

    if df.empty:
        print("[ERROR] El archivo esta vacio.")
        return

    print(f"   [OK] {len(df)} filas leidas con {len(df.columns)} columnas.")

    # 3. Asignar nombres limpios
    if len(df.columns) != len(COLUMNAS):
        print(f"[AVISO] Columnas esperadas: {len(COLUMNAS)} | Encontradas: {len(df.columns)}")
        print("   Verifica que el archivo no haya cambiado de estructura.")
        print(f"   Columnas encontradas: {list(df.columns)}")
        return

    df.columns = COLUMNAS

    # 4. Limpiar datos
    df.dropna(how="all", inplace=True)
    df.fillna("", inplace=True)

    print(f"   [OK] {len(df)} filas despues de limpieza.")

    # 5. Conectar a la base de datos
    print(f"\nConectando a {DB_HOST}:{DB_PORT} / {DB_NAME} ...")
    engine = get_engine()
    if engine is None:
        print("[ERROR] No se pudo conectar a MariaDB.")
        print("   Verifica que XAMPP este activo.")
        return
    print("   [OK] Conexion exitosa.")

    # 6. Reemplazar tabla (DROP + INSERT)
    print(f"\nCargando datos en '{TABLA_DB}' ...")
    try:
        with engine.connect() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS `{TABLA_DB}`"))
            conn.commit()

        df.to_sql(TABLA_DB, con=engine, if_exists="append", index=False, chunksize=500)

        print("\n" + "=" * 60)
        print("  OK - CARGA COMPLETADA EXITOSAMENTE")
        print("=" * 60)
        print(f"  Tabla   : {DB_NAME}.{TABLA_DB}")
        print(f"  Filas   : {len(df)}")
        print(f"  Columnas: {', '.join(COLUMNAS[:4])} (+{len(COLUMNAS) - 4} mas)")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] Al cargar los datos: {e}")

    finally:
        engine.dispose()


if __name__ == "__main__":
    cargar()
