"""
cargar_pac_servidor.py
======================
Carga un archivo PlanificacionPACxxxx.xlsx a la tabla `data_planerpac` (modelo
Django `PlanerPAC`).

A diferencia de la versión anterior, esta carga es un **upsert** (no destructivo):
usa `update_or_create` con clave `(id_proyecto, nombre_item, pac)`, así que cargar
un nuevo año (ej. PlanificacionPAC2027.xlsx) se SUMA a lo ya cargado en vez de
reemplazarlo — necesario para poder comparar cumplimiento temporal entre años.

Uso:
    python cargar_pac_servidor.py                              # autodetecta el .xlsx más reciente en esta carpeta
    python cargar_pac_servidor.py PlanificacionPAC2027.xlsx     # archivo específico
"""

import os
import sys
import pathlib

import pandas as pd

# --- Rutas --------------------------------------------------------------------
RUTA_SCRIPT = pathlib.Path(__file__).parent.absolute()
HOJA = "Hoja1"

# --- Nombres de columnas limpios (18 columnas, asignación por posición) -------
# Debe calzar exactamente con el orden de columnas del Excel origen (Plan Anual
# de Compras exportado/editado internamente). Si el Excel cambia de estructura,
# el chequeo de cantidad de columnas más abajo aborta la carga con un aviso.
COLUMNAS = [
    "unidad_compra",          # Unidad de Compra
    "id_proyecto",            # ID Proyecto
    "codigo_presupuestario",  # Código presupuestario
    "nombre_proyecto",        # Nombre Proyecto
    "cantidad_items",         # Cantidad de Ítems
    "nombre_item",            # Nombre Ítem
    "monto_unitario_item",    # Monto Unitario Ítem
    "monto_total_item",       # Monto Total Ítem Año
    "nombre_responsable",     # Nombre responsable
    "cargo_responsable",      # Cargo responsable
    "fecha_inicio_compra",    # Fecha de Inicio Compra
    "depto",                  # depto
    "sub",                    # sub
    "unidad",                 # unidad
    "tipo_proyecto",          # Tipo Proyecto
    "pac",                    # PAC (año)
    "cantidad_oc",            # Cantidad OC
    "meses_envio_oc",         # Meses envío OC
]

# Clave de upsert: identifica una fila "ítem de proyecto PAC" de forma estable
# entre cargas sucesivas del mismo año o de años distintos. Un mismo nombre_item
# puede repetirse dentro del mismo proyecto en tramos con distinta fecha (ej. un
# insumo comprado en abril Y en mayo con montos distintos) — fecha_inicio_compra
# es necesaria en la clave para no colapsar esos tramos en una sola fila.
CLAVE_UPSERT = ["id_proyecto", "nombre_item", "pac", "fecha_inicio_compra"]


def _setup_django():
    sys.path.insert(0, str(RUTA_SCRIPT.parent.parent.parent / "backend"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    import django
    django.setup()


def _archivo_mas_reciente():
    candidatos = sorted(
        RUTA_SCRIPT.glob("PlanificacionPAC*.xlsx"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    return candidatos[0] if candidatos else None


def _upsert(modelo, lookup, defaults):
    """update_or_create tolerante a colisiones de clave (mismo patrón que page_data_panel.py)."""
    from django.core.exceptions import MultipleObjectsReturned
    try:
        return modelo.objects.update_or_create(defaults=defaults, **lookup)
    except MultipleObjectsReturned:
        obj = modelo.objects.filter(**lookup).first()
        for campo, valor in defaults.items():
            setattr(obj, campo, valor)
        obj.save(update_fields=list(defaults.keys()))
        return obj, False


def _limpiar_valor(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s if s not in ("", "nan", "None", "NaT") else None


def cargar(archivo_pac=None):
    print("\n" + "=" * 60)
    print("  CARGANDO PLAN ANUAL DE COMPRAS -> data_planerpac (upsert)")
    print("=" * 60)

    archivo = pathlib.Path(archivo_pac) if archivo_pac else _archivo_mas_reciente()
    if not archivo or not archivo.exists():
        print(f"\n[ERROR] No se encontró ningún archivo PlanificacionPAC*.xlsx en {RUTA_SCRIPT}")
        return

    print(f"  Archivo : {archivo.name}")

    df = pd.read_excel(archivo, sheet_name=HOJA, header=0, dtype=str)
    if df.empty:
        print("[ERROR] El archivo está vacío.")
        return

    print(f"  [OK] {len(df)} filas leídas con {len(df.columns)} columnas.")

    if len(df.columns) != len(COLUMNAS):
        print(f"[AVISO] Columnas esperadas: {len(COLUMNAS)} | Encontradas: {len(df.columns)}")
        print("  Verifica que el archivo no haya cambiado de estructura.")
        print(f"  Columnas encontradas: {list(df.columns)}")
        return

    df.columns = COLUMNAS
    df.dropna(how="all", inplace=True)

    _setup_django()
    from django.db import transaction
    from api.models import PlanerPAC

    nuevos, actualizados, omitidos = 0, 0, 0
    with transaction.atomic():
        for _, row in df.iterrows():
            valores = {col: _limpiar_valor(row[col]) for col in COLUMNAS}
            lookup = {clave: valores.pop(clave) for clave in CLAVE_UPSERT}
            if not lookup["id_proyecto"] or not lookup["nombre_item"]:
                omitidos += 1
                continue
            _, creado = _upsert(PlanerPAC, lookup, valores)
            if creado:
                nuevos += 1
            else:
                actualizados += 1

    print("\n" + "=" * 60)
    print("  OK - CARGA COMPLETADA (sin borrar años anteriores)")
    print(f"  Nuevos       : {nuevos}")
    print(f"  Actualizados : {actualizados}")
    print(f"  Omitidos     : {omitidos} (sin id_proyecto o nombre_item)")
    print(f"  Total en data_planerpac ahora: {PlanerPAC.objects.count()}")
    print("=" * 60)


if __name__ == "__main__":
    cargar(sys.argv[1] if len(sys.argv) > 1 else None)
