"""
=============================================================================
  SSO Abastecimiento — Unificador y cargador de data_facturas
  Uso:  python actualizar_facturas.py

  Opciones:
    1) Solo unificar Excel  → guarda unified_facturas.csv (sin subir)
    2) Unificar + subir al servidor  (SQLAlchemy — desde cualquier PC en LAN)
    3) Unificar + subir vía Django ORM  (solo desde el servidor)

  Qué hace (opción 2/3):
    1. Lee TODOS los .xls/.xlsx de esta misma carpeta (auto-descubre)
    2. Unifica los DataFrames en uno solo
    3. Limpia y normaliza los datos
    4. REEMPLAZA completamente la tabla data_facturas
       (DELETE + INSERT — siempre queda sincronizada con los Excel)

  Requisitos (opción 2):
    pip install pandas openpyxl xlrd sqlalchemy pymysql
  Requisitos (opción 3):
    Ejecutar desde el servidor con el virtualenv del proyecto Django
=============================================================================
"""

import os
import sys
import glob
import pathlib
from datetime import datetime

import pandas as pd

# ════════════════════════════════════════════════════════════════════════
#  CONFIGURACIÓN — ajusta solo si cambian las credenciales del servidor
# ════════════════════════════════════════════════════════════════════════

DB_HOST     = "10.8.153.227"
DB_PORT     = "3306"
DB_NAME     = "bd_sistema"
DB_USER     = "root"
DB_PASSWORD = "Nicolas2017#"
TABLE       = "data_facturas"

CARPETA     = pathlib.Path(__file__).parent
CSV_SALIDA  = CARPETA / "unified_facturas.csv"

# ════════════════════════════════════════════════════════════════════════
#  COLUMNAS
# ════════════════════════════════════════════════════════════════════════

COLS_EXTRA_DB = ["dirrecep", "cmnarecep", "ciudadrecep",
                 "rut_usuario_resp", "nombre_usuario_resp"]

DATE_COLS = ["publicacion", "emision", "fecha_vencimiento",
             "fecha_nar", "fecha_arm", "fecha_reclamo",
             "fecha_ingreso_oc", "fecha_ingreso_rc",
             "fecha_ingreso", "fecha_aceptacion", "fecha_devengo",
             "fecha_recepcion_sii"]

COLS_NUMERIC_AS_STR = ["codigo_devengo", "ticket_devengo", "folio_sigfe",
                       "area_transaccional", "rut_usuario_resp",
                       "folio", "emisor"]

# ════════════════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════════════════

def _num_a_str(x):
    """12345.0 → '12345', mantiene strings, None → None."""
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    s = str(x)
    if s.endswith(".0") and s[:-2].lstrip("-").isdigit():
        return s[:-2]
    return s


def _safe(v):
    """Convierte NaN/NaT a None para SQL (patrón de OC_SSO_SERVER)."""
    if v is None:
        return None
    if isinstance(v, float) and pd.isna(v):
        return None
    try:
        import pandas as _pd
        if _pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


# ════════════════════════════════════════════════════════════════════════
#  ETL — Descubrir, leer, limpiar
# ════════════════════════════════════════════════════════════════════════

def descubrir_archivos():
    xls  = sorted(glob.glob(str(CARPETA / "*.xls")))
    xlsx = sorted(glob.glob(str(CARPETA / "*.xlsx")))
    return [f for f in xls + xlsx
            if not pathlib.Path(f).name.startswith("~")]


def leer_y_unificar(archivos):
    frames = []
    total_leido = 0

    for ruta in archivos:
        nombre = pathlib.Path(ruta).name
        try:
            df = pd.read_excel(ruta, dtype=str)
            df_typed = pd.read_excel(ruta)

            for col in DATE_COLS:
                if col in df_typed.columns:
                    df[col] = df_typed[col]

            df["_origen"] = nombre
            frames.append(df)
            total_leido += len(df)
            print(f"   ✓ {nombre:<30} → {len(df):>6} registros")

        except Exception as e:
            print(f"   ⚠ Error leyendo {nombre}: {e}")

    if not frames:
        raise RuntimeError("No se pudo leer ningún archivo Excel.")

    unified = pd.concat(frames, ignore_index=True)
    unified.drop(columns=["_origen"], inplace=True)
    return unified, total_leido


def limpiar(df):
    # 1. Fechas → string DD-MM-YYYY
    for col in DATE_COLS:
        if col in df.columns:
            dt = pd.to_datetime(df[col], errors="coerce")
            df[col] = dt.dt.strftime("%d-%m-%Y").where(dt.notna(), other=None)

    # 2. Numéricos como texto (eliminar ".0" flotante)
    for col in COLS_NUMERIC_AS_STR:
        if col in df.columns:
            df[col] = df[col].apply(_num_a_str)

    # 3. Agregar columnas extra de DB como NULL
    for col in COLS_EXTRA_DB:
        if col not in df.columns:
            df[col] = None

    # 4. NaN → None (→ NULL en SQL)
    df = df.where(pd.notna(df), other=None)

    # 5. Strip en campos clave
    for col in ["emisor", "receptor", "razon_social_emisor"]:
        if col in df.columns:
            df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)

    # 6. Eliminar duplicados folio+emisor
    antes = len(df)
    df = df.drop_duplicates(subset=["folio", "emisor"], keep="last")
    duplicados = antes - len(df)
    if duplicados:
        print(f"   ℹ  {duplicados} duplicados eliminados (mismo folio+emisor)")

    return df


# ════════════════════════════════════════════════════════════════════════
#  OPCIÓN 1 — Solo exportar CSV
# ════════════════════════════════════════════════════════════════════════

def exportar_csv(df):
    df.to_csv(CSV_SALIDA, index=False, encoding="utf-8-sig")
    print(f"   ✓ Guardado en: {CSV_SALIDA}")
    print(f"   → {len(df)} registros exportados")


# ════════════════════════════════════════════════════════════════════════
#  OPCIÓN 2 — SQLAlchemy (conexión remota desde cualquier PC en LAN)
# ════════════════════════════════════════════════════════════════════════

def conectar_sqlalchemy():
    from sqlalchemy import create_engine
    url = (f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}"
           f"@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4")
    return create_engine(url, pool_pre_ping=True)


def cargar_sqlalchemy(df, engine):
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        conn.execute(text(f"TRUNCATE TABLE `{TABLE}`"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    print(f"   ✓ Tabla {TABLE} limpiada (TRUNCATE)")

    total = len(df)
    lote  = 500
    insertados = 0

    for i in range(0, total, lote):
        chunk = df.iloc[i:i + lote]
        chunk.to_sql(TABLE, con=engine, if_exists="append",
                     index=False, chunksize=lote, method="multi")
        insertados += len(chunk)
        pct  = insertados / total * 100
        barra = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        print(f"\r   [{barra}] {pct:5.1f}%  ({insertados}/{total})",
              end="", flush=True)

    print()
    return insertados


def subir_sqlalchemy(df, total_leido, archivos):
    print(f"🔌 Conectando a {DB_HOST}:{DB_PORT}/{DB_NAME} (SQLAlchemy)...")
    try:
        engine = conectar_sqlalchemy()
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("   ✓ Conexión exitosa\n")
    except Exception as e:
        print(f"\n   ❌ Error de conexión: {e}")
        print("   → Verifica acceso remoto: GRANT ALL ON bd_sistema.* TO 'root'@'%' IDENTIFIED BY 'pass'; FLUSH PRIVILEGES;")
        sys.exit(1)

    from sqlalchemy import text
    with engine.connect() as conn:
        total_bd = conn.execute(text(f"SELECT COUNT(*) FROM `{TABLE}`")).scalar()

    print(f"⚠  La tabla '{TABLE}' contiene actualmente {total_bd} registros.")
    print(f"   Se reemplazarán por los {len(df)} registros de los Excel.\n")
    respuesta = input("   ¿Continuar? [s/N]: ").strip().lower()
    if respuesta != "s":
        print("\n   Operación cancelada.\n")
        sys.exit(0)
    print()

    print(f"🚀 Cargando {len(df)} registros en '{TABLE}'...")
    try:
        insertados = cargar_sqlalchemy(df, engine)
    except Exception as e:
        print(f"\n   ❌ Error durante la carga: {e}")
        sys.exit(1)

    with engine.connect() as conn:
        total_final = conn.execute(text(f"SELECT COUNT(*) FROM `{TABLE}`")).scalar()

    _resumen(archivos, total_leido, len(df), insertados, total_final)


# ════════════════════════════════════════════════════════════════════════
#  OPCIÓN 3 — Django ORM (igual que OC_SSO_SERVER.py)
# ════════════════════════════════════════════════════════════════════════

def setup_django():
    ruta_api = pathlib.Path(__file__).parent.parent.parent  # api/data/data_facturas → raíz
    backend  = ruta_api / "backend"
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    import django
    django.setup()


def cargar_django(df, total_leido, archivos):
    print("⚙️  Configurando Django ORM...")
    try:
        setup_django()
        from api.models import Factura
    except Exception as e:
        print(f"\n   ❌ No se pudo inicializar Django: {e}")
        print("   → Esta opción solo funciona desde el servidor con el venv del proyecto.")
        sys.exit(1)

    print(f"   ✓ Django listo. Modelos cargados.\n")

    cols = [f.name for f in Factura._meta.get_fields()
            if hasattr(f, 'column') and f.name != 'id']

    registros = []
    for _, row in df.iterrows():
        kwargs = {}
        for col in cols:
            if col in df.columns:
                kwargs[col] = _safe(row[col])
        registros.append(Factura(**kwargs))

    total = len(registros)
    print(f"⚠  Se eliminarán los registros actuales y se insertarán {total} nuevos.")
    respuesta = input("   ¿Continuar? [s/N]: ").strip().lower()
    if respuesta != "s":
        print("\n   Operación cancelada.\n")
        sys.exit(0)
    print()

    print(f"🗑  Eliminando registros anteriores...")
    Factura.objects.all().delete()
    print(f"   ✓ Tabla limpiada\n")

    print(f"🚀 Insertando {total} registros (lotes de 500)...")
    lote = 500
    insertados = 0
    for i in range(0, total, lote):
        chunk = registros[i:i + lote]
        Factura.objects.bulk_create(chunk, batch_size=lote)
        insertados += len(chunk)
        pct  = insertados / total * 100
        barra = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        print(f"\r   [{barra}] {pct:5.1f}%  ({insertados}/{total})",
              end="", flush=True)
    print()

    total_final = Factura.objects.count()
    _resumen(archivos, total_leido, len(df), insertados, total_final)


# ════════════════════════════════════════════════════════════════════════
#  RESUMEN FINAL
# ════════════════════════════════════════════════════════════════════════

def _resumen(archivos, total_leido, df_len, insertados, total_final):
    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print("║   ✅ Proceso completado exitosamente                     ║")
    print("╠══════════════════════════════════════════════════════════╣")
    print(f"║   Archivos procesados : {len(archivos):<34}║")
    print(f"║   Filas en Excel      : {total_leido:<34}║")
    print(f"║   Duplicados removidos: {total_leido - df_len:<34}║")
    print(f"║   Insertados en BD    : {insertados:<34}║")
    print(f"║   Total final en BD   : {total_final:<34}║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()


# ════════════════════════════════════════════════════════════════════════
#  MAIN — Menú CLI
# ════════════════════════════════════════════════════════════════════════

def main():
    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print("║   SSO Abastecimiento — Actualizador data_facturas        ║")
    print(f"║   Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M')}                              ║")
    print("╠══════════════════════════════════════════════════════════╣")
    print("║   1) Solo unificar Excel  →  exportar CSV local          ║")
    print("║   2) Unificar + subir al servidor  (SQLAlchemy / LAN)    ║")
    print("║   3) Unificar + subir vía Django ORM  (desde servidor)   ║")
    print("║   0) Salir                                               ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()

    opcion = input("   Selecciona una opción [0-3]: ").strip()
    if opcion == "0":
        print("\n   Hasta luego.\n")
        sys.exit(0)
    if opcion not in ("1", "2", "3"):
        print("\n   Opción no válida.\n")
        sys.exit(1)

    print()

    # ── Descubrir archivos ───────────────────────────────────────────
    print("📂 Buscando archivos Excel en la carpeta...")
    archivos = descubrir_archivos()
    if not archivos:
        print("   ❌ No se encontraron archivos .xls/.xlsx en esta carpeta.")
        sys.exit(1)
    print(f"   → {len(archivos)} archivo(s) encontrado(s):\n")

    # ── Leer y unificar ──────────────────────────────────────────────
    print("📖 Leyendo y unificando Excel...")
    df, total_leido = leer_y_unificar(archivos)
    print(f"\n   → Total unificado: {len(df)} registros\n")

    # ── Limpiar ──────────────────────────────────────────────────────
    print("🧹 Normalizando datos...")
    df = limpiar(df)
    print(f"   → Registros finales: {len(df)}\n")

    # ── Ejecutar opción seleccionada ─────────────────────────────────
    if opcion == "1":
        print("💾 Exportando CSV...")
        exportar_csv(df)
    elif opcion == "2":
        subir_sqlalchemy(df, total_leido, archivos)
    elif opcion == "3":
        cargar_django(df, total_leido, archivos)


if __name__ == "__main__":
    main()
