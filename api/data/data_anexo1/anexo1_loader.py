"""
anexo1_loader.py
Unifica los archivos 'maestro_*.csv' de la carpeta data/data_anexo1 y los sube a la 
tabla 'tabla_anexo1' en la base de datos MariaDB (Django).
"""
import os
import glob
import pandas as pd
import numpy as np
import sys
import warnings

def guardar_en_django(df: pd.DataFrame):
    """Sincroniza el DataFrame consolidado con la base de datos Django."""
    print("\n🚀 INICIANDO SINCRONIZACIÓN CON BASE DE DATOS (Django)...")

    # Configuración on-the-fly de Django
    # Estructura: api/data/data_anexo1/ -> backend/
    base_dir = os.path.dirname(os.path.abspath(__file__))
    backend_path = os.path.abspath(os.path.join(base_dir, '..', '..', '..', 'backend'))
    
    if backend_path not in sys.path:
        sys.path.append(backend_path)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

    import django
    from django.apps import apps
    if not apps.ready:
        django.setup()

    from api.models import Anexo1

    # Mapeo de columnas del CSV a campos del modelo Django
    mapping = {
        "Nivel": "nivel",
        "Concepto Presupuestario": "concepto_presupuestario",
        "Ley de Presupuestos": "ley_presupuestos",
        "Requerimiento": "requerimiento",
        "_col_4": "col_4",
        "Saldo por Devengar": "saldo_por_devengar",
        "Efectivo": "efectivo",
        "Deuda Flotante": "deuda_flotante",
        "Ruta_Jerarquica": "ruta_jerarquica",
        "Establecimiento": "establecimiento",
        "Fecha": "fecha"
    }

    # Limpiar nulos para Django
    df = df.replace({np.nan: None})
    records = df.to_dict('records')

    print("  -> Vaciando tabla 'tabla_anexo1' para reemplazo total...")
    Anexo1.objects.all().delete()

    objs = []
    for r in records:
        data = {}
        for csv_col, model_field in mapping.items():
            val = r.get(csv_col)
            
            # Manejo de campos numéricos (asegurar float o 0)
            if model_field in ['ley_presupuestos', 'requerimiento', 'saldo_por_devengar', 'efectivo', 'deuda_flotante']:
                try:
                    data[model_field] = float(val) if val is not None else 0.0
                except:
                    data[model_field] = 0.0
            
            # Manejo de fechas
            elif model_field == 'fecha':
                if val and not pd.isna(val):
                    try:
                        data[model_field] = pd.to_datetime(val).date()
                    except:
                        data[model_field] = None
                else:
                    data[model_field] = None
            else:
                data[model_field] = val
        
        objs.append(Anexo1(**data))

    print(f"  -> Insertando {len(objs)} registros en bloques...")
    Anexo1.objects.bulk_create(objs, batch_size=200)
    print("  ✅ Sincronización masiva de Anexo 1 finalizada exitosamente.")

def load_and_sync_anexo1():
    """Busca maestros, los une y los sube a la base de datos."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    archivos_maestros = glob.glob(os.path.join(base_dir, "maestro_*.csv"))
    
    if not archivos_maestros:
        print(f"⚠ No se encontraron archivos 'maestro_*.csv' en {base_dir}.")
        return

    print(f"Archivos maestros encontrados: {len(archivos_maestros)}")
    frames = []
    for filepath in archivos_maestros:
        print(f"  - Cargando: {os.path.basename(filepath)}")
        try:
            df = pd.read_csv(filepath, encoding="utf-8-sig", dtype={"Nivel": str})
            frames.append(df)
        except Exception as e:
            print(f"  ❌ Error al cargar {filepath}: {e}")
            
    if not frames:
        print("⚠ No hay datos para procesar.")
        return
        
    df_consolidado = pd.concat(frames, ignore_index=True)
    print(f"✔ Consolidación completa: {len(df_consolidado)} filas totales.")

    # Guardar en base de datos
    try:
        guardar_en_django(df_consolidado)
    except Exception as e:
        print(f"❌ Error crítico en la sincronización: {e}")

if __name__ == "__main__":
    load_and_sync_anexo1()
