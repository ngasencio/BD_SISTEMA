"""
consolidar_devengo.py
Script para consolidar archivos de devengo presupuestario del Servicio de Salud Osorno.
Lee todos los .xlsx de data/data_devengo/2026_gasto/, limpia y concatena en un solo CSV.
"""

import pandas as pd
import glob
import os
import sys

DATA_PATH   = "2026_gasto/"
OUTPUT_FILE = "devengo_consolidado.csv"
HEADER_ROW  = 5   # Fila 5 (0-indexed) contiene los encabezados reales

# Columnas que deben aparecer primero en el output (si existen)
COLS_PRIMERAS = ["Código Unidad Ejecutora", "Folio", "Titulo", "Tipo Presupuesto"]


def limpiar_dataframe(df: pd.DataFrame, filepath: str) -> pd.DataFrame:
    """Limpia un DataFrame individual: paginación, tipos y fechas."""

    # Eliminar filas que contengan "Página X de" en cualquier celda
    mask_pagina = df.apply(
        lambda row: row.astype(str).str.contains(r"Página\s+\d+\s+de", na=False, regex=True).any(),
        axis=1,
    )
    n_eliminadas = mask_pagina.sum()
    if n_eliminadas:
        print(f"  ↳ Eliminadas {n_eliminadas} filas de paginación")
    df = df[~mask_pagina].copy()

    # Normalizar montos
    for col in ["Monto Vigente", "Monto Disponible", "Monto Consumido"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Normalizar fechas
    for col in ["Fecha Documento", "Fecha Conforme", "Fecha Ingreso / Fecha Recepción "]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    # Columna de trazabilidad
    df["archivo_origen"] = os.path.basename(filepath)

    return df


def reordenar_columnas(df: pd.DataFrame):
    """Pone COLS_PRIMERAS al inicio y evita duplicados."""

    # 1. Eliminar columnas completamente vacías
    df = df.dropna(axis=1, how="all")

    # 2. Reordenar
    presentes = [c for c in COLS_PRIMERAS if c in df.columns]
    resto = [c for c in df.columns if c not in presentes]
    df = df[presentes + resto]

    return df


def guardar_en_django(df: pd.DataFrame):
    """Sincroniza el DataFrame consolidado con la base de datos Django."""
    import sys
    import numpy as np

    print("\n🚀 INICIANDO SINCRONIZACIÓN CON BASE DE DATOS (Django)...")

    # Configuración on-the-fly de Django
    backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'backend'))
    if backend_path not in sys.path:
        sys.path.append(backend_path)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

    import django
    from django.apps import apps
    if not apps.ready:
        django.setup()

    from api.models import Devengo

    # Mapeo de columnas del Excel/CSV a campos del modelo Django
    mapping = {
        "Código Unidad Ejecutora": "codigo_ue",
        "Folio": "folio",
        "Titulo": "titulo",
        "Tipo Presupuesto": "tipo_presupuesto",
        "Moneda Presupuestaria": "moneda_presupuestaria",
        "Principal": "principal",
        "Principal Relacionado": "principal_relacionado",
        "Moneda Documento": "moneda_documento",
        "Tipo de Cambio": "tipo_cambio",
        "Tipo de Documento": "tipo_documento",
        "Número de Documento": "numero_documento",
        "Fecha Documento": "fecha_documento",
        "Fecha Conforme": "fecha_conforme",
        "Id Chile Compra": "id_chile_compra",
        "Fecha Ingreso / Fecha Recepción ": "fecha_ingreso",
        "Catálogo 01": "catalogo_01",
        "Catálogo 02": "catalogo_02",
        "Catálogo 03": "catalogo_03",
        "Catálogo 04": "catalogo_04",
        "Catálogo 05": "catalogo_05",
        "Concepto Presupuestario": "concepto_presupuestario",
        "Monto Vigente": "monto_vigente",
        "Monto Disponible": "monto_disponible",
        "Monto Consumido": "monto_consumido",
        "archivo_origen": "archivo_origen"
    }

    # Limpiar nulos de pandas para Django
    df = df.replace({np.nan: None})
    records = df.to_dict('records')

    print("  -> Vaciando tabla 'devengo' para reemplazo total...")
    Devengo.objects.all().delete()

    objs = []
    for r in records:
        data = {}
        for excel_col, model_field in mapping.items():
            val = r.get(excel_col)
            # Manejo de fechas
            if model_field in ['fecha_documento', 'fecha_conforme', 'fecha_ingreso']:
                if val and not pd.isna(val):
                    try:
                        data[model_field] = pd.to_datetime(val).date()
                    except:
                        data[model_field] = None
                else:
                    data[model_field] = None
            else:
                data[model_field] = val
        
        objs.append(Devengo(**data))

    print(f"  -> Insertando {len(objs)} registros en bloques...")
    Devengo.objects.bulk_create(objs, batch_size=100)
    print("  ✅ Sincronización masiva finalizada exitosamente.")


def consolidar():
    archivos = sorted(glob.glob(os.path.join(DATA_PATH, "*.xlsx")))

    if not archivos:
        print(f"[ERROR] No se encontraron archivos .xlsx en: {DATA_PATH}")
        sys.exit(1)

    print(f"Archivos encontrados: {len(archivos)}")
    frames = []

    for filepath in archivos:
        print(f"\nProcesando: {os.path.basename(filepath)}")
        try:
            df_raw = pd.read_excel(filepath, header=HEADER_ROW)
            df_clean = limpiar_dataframe(df_raw, filepath)
            frames.append(df_clean)
            print(f"  ✓ {len(df_clean)} filas cargadas")
        except Exception as e:
            print(f"  [ADVERTENCIA] No se pudo procesar {filepath}: {e}")

    if not frames:
        print("[ERROR] Ningún archivo pudo ser procesado.")
        sys.exit(1)

    # Concatenar todo
    consolidado = pd.concat(frames, ignore_index=True)

    # Reordenar columnas
    consolidado = reordenar_columnas(consolidado)

    # Exportar CSV UTF-8 con BOM
    consolidado.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig", sep=",")

    # Resumen final en consola
    print("\n" + "═" * 55)
    print("RESUMEN CONSOLIDACIÓN")
    print("═" * 55)
    print(f"  Archivos procesados  : {len(frames)}")
    print(f"  Filas totales        : {len(consolidado):,}")
    print(f"  Columnas finales     : {len(consolidado.columns)}")
    print(f"  Archivo exportado    : {OUTPUT_FILE}")
    print("═" * 55)

    # NUEVO: Sincronizar con base de datos
    try:
        guardar_en_django(consolidado)
    except Exception as e:
        print(f"\n❌ Error al sincronizar con Django: {e}")

    return consolidado


if __name__ == "__main__":
    consolidar()