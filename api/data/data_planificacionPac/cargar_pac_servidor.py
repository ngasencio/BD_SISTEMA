"""
cargar_pac_servidor.py
======================
Carga un archivo PlanificacionPACxxxx.xlsx a la tabla `data_planerpac` (modelo
Django `PlanerPAC`).

Modo **reemplazo por año**: el Excel es la versión VIGENTE completa del plan de
cada año que contiene (columna `PAC`). Durante el año el plan se modifica (1ª,
2ª modificación...) y cada archivo nuevo reemplaza al anterior, así que la carga:

  1. borra las filas de `data_planerpac` de los años presentes en el archivo
     (proyectos que la modificación eliminó dejan de existir en el plan), e
  2. inserta TODAS las filas del Excel, en una sola transacción (si algo falla
     no se borra nada).

Los años que el archivo no trae (ej. cargar PAC 2027 no toca 2026) NO se tocan:
la tabla sigue acumulando año sobre año para poder comparar entre años.

Por qué ya no es un upsert: un mismo ítem puede repetirse con la misma fecha y
montos distintos (cuotas mensuales de un servicio), y no existe una clave natural
única que las distinga. El upsert anterior colapsaba esas filas en una sola y
subestimaba el monto del plan.

Después de cargar, reclasifica Dentro/Fuera PAC de los formularios FSC (la regla depende de
qué proyectos existen en el plan) y reengancha el cruce FSC-OC-PAC; `--sin-reclasificar` lo omite.

Seguridad:
  - Antes de borrar se guarda un respaldo CSV de las filas que se reemplazan en
    `respaldos/` (junto a este script). Sirve además como historial de versiones.
  - Si el archivo trae mucho menos filas que lo ya cargado para ese año se aborta
    (señal de archivo equivocado o truncado), salvo `--forzar`.

Uso (desde cualquier carpeta):
    python cargar_pac_servidor.py --dry-run                       # simula, no escribe nada
    python cargar_pac_servidor.py                                 # autodetecta el .xlsx más reciente
    python cargar_pac_servidor.py "PlanificacionPAC2026-2DA MODIFICACION.xlsx"
    python cargar_pac_servidor.py archivo.xlsx --forzar           # omite la guarda de tamaño
"""

import argparse
import datetime
import os
import sys
import pathlib

import pandas as pd

# --- Rutas --------------------------------------------------------------------
RUTA_SCRIPT = pathlib.Path(__file__).parent.absolute()
CARPETA_RESPALDOS = RUTA_SCRIPT / "respaldos"
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

# Columnas que los informes/servicios leen como número o fecha: si vienen con
# basura se avisa antes de cargar (los campos del modelo son TextField).
COLUMNAS_NUMERICAS = ["cantidad_items", "monto_unitario_item", "monto_total_item", "cantidad_oc"]

# Guarda contra archivos equivocados/truncados: el archivo debe traer al menos
# esta fracción de las filas que ya hay cargadas para el mismo año.
FRACCION_MINIMA_FILAS = 0.5


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


def _limpiar_valor(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s if s not in ("", "nan", "None", "NaT") else None


def _leer_excel(archivo):
    """Lee y normaliza el Excel. Devuelve un DataFrame con COLUMNAS, o None si es inválido."""
    df = pd.read_excel(archivo, sheet_name=HOJA, header=0, dtype=str)
    if df.empty:
        print("[ERROR] El archivo está vacío.")
        return None

    print(f"  [OK] {len(df)} filas leídas con {len(df.columns)} columnas.")

    if len(df.columns) != len(COLUMNAS):
        print(f"[ERROR] Columnas esperadas: {len(COLUMNAS)} | Encontradas: {len(df.columns)}")
        print("  Verifica que el archivo no haya cambiado de estructura.")
        print(f"  Columnas encontradas: {list(df.columns)}")
        return None

    df.columns = COLUMNAS
    df = df.dropna(how="all")
    for col in COLUMNAS:
        df[col] = df[col].map(_limpiar_valor)
    return df


def _validar(df):
    """Imprime el diagnóstico del archivo. Devuelve (df_valido, lista_de_errores_fatales)."""
    errores = []

    sin_clave = df["id_proyecto"].isna() | df["nombre_item"].isna()
    if sin_clave.any():
        print(f"  [AVISO] {int(sin_clave.sum())} filas sin id_proyecto o nombre_item: se omiten.")
    df = df[~sin_clave]

    if df["pac"].isna().any():
        errores.append(f"{int(df['pac'].isna().sum())} filas sin año en la columna PAC "
                       "(no se sabe qué año reemplazar).")
    else:
        # El año debe ser un entero de 4 dígitos: define qué filas se borran.
        malos = df[~df["pac"].str.fullmatch(r"\d{4}")]["pac"].unique()
        if len(malos):
            errores.append(f"Valores inválidos en la columna PAC: {list(malos)[:5]}")

    for col in COLUMNAS_NUMERICAS:
        malos = df[col].notna() & pd.to_numeric(df[col], errors="coerce").isna()
        if malos.any():
            ejemplo = df.loc[malos, col].iloc[0]
            errores.append(f"{int(malos.sum())} valores no numéricos en '{col}' (ej. {ejemplo!r}).")

    fechas_malas = df["fecha_inicio_compra"].notna() & pd.to_datetime(
        df["fecha_inicio_compra"], errors="coerce").isna()
    if fechas_malas.any():
        errores.append(f"{int(fechas_malas.sum())} fechas ilegibles en 'fecha_inicio_compra' "
                       f"(ej. {df.loc[fechas_malas, 'fecha_inicio_compra'].iloc[0]!r}).")

    return df, errores


def _resumen_archivo(df):
    monto = pd.to_numeric(df["monto_total_item"], errors="coerce").sum()
    print(f"  Filas válidas : {len(df)}")
    print(f"  Proyectos     : {df['id_proyecto'].nunique()}")
    print(f"  Años (PAC)    : {sorted(df['pac'].dropna().unique())}")
    print(f"  Monto total   : ${monto:,.0f}".replace(",", "."))


def _respaldar(PlanerPAC, anios):
    """Guarda en CSV las filas que se van a reemplazar. Devuelve la ruta (o None si no había nada)."""
    qs = PlanerPAC.objects.filter(pac__in=anios).order_by("id")
    if not qs.exists():
        return None
    CARPETA_RESPALDOS.mkdir(exist_ok=True)
    marca = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    ruta = CARPETA_RESPALDOS / f"planerpac_pac{'-'.join(anios)}_{marca}.csv"
    pd.DataFrame(list(qs.values())).to_csv(ruta, index=False, encoding="utf-8-sig")
    return ruta


def cargar(archivo_pac=None, dry_run=False, forzar=False, reclasificar=True):
    print("\n" + "=" * 60)
    print("  PLAN ANUAL DE COMPRAS -> data_planerpac (reemplazo por año)"
          + ("   [SIMULACIÓN]" if dry_run else ""))
    print("=" * 60)

    archivo = pathlib.Path(archivo_pac) if archivo_pac else _archivo_mas_reciente()
    if archivo and not archivo.is_absolute() and not archivo.exists():
        archivo = RUTA_SCRIPT / archivo  # permite pasar solo el nombre del archivo
    if not archivo or not archivo.exists():
        print(f"\n[ERROR] No se encontró ningún archivo PlanificacionPAC*.xlsx en {RUTA_SCRIPT}")
        return False

    print(f"  Archivo : {archivo.name}")

    df = _leer_excel(archivo)
    if df is None:
        return False
    df, errores = _validar(df)
    if errores:
        print("\n[ERROR] El archivo tiene problemas y NO se cargó nada:")
        for e in errores:
            print(f"   - {e}")
        return False
    if df.empty:
        print("[ERROR] No quedaron filas válidas.")
        return False

    _resumen_archivo(df)
    anios = sorted(df["pac"].unique())

    _setup_django()
    from django.db import transaction
    from api.models import PlanerPAC

    previas = PlanerPAC.objects.filter(pac__in=anios).count()
    print(f"\n  Filas actuales en BD para {anios}: {previas}")

    if previas and len(df) < previas * FRACCION_MINIMA_FILAS and not forzar:
        print(f"\n[ERROR] El archivo trae {len(df)} filas y la BD tiene {previas} para ese año "
              f"(menos del {int(FRACCION_MINIMA_FILAS * 100)}%). ¿Archivo equivocado o truncado?")
        print("  Si es correcto, repite con --forzar.")
        return False

    if dry_run:
        print("\n  Simulación: no se escribió nada. Reemplazaría "
              f"{previas} filas por {len(df)}.")
        return True

    ruta_respaldo = _respaldar(PlanerPAC, anios)
    if ruta_respaldo:
        print(f"  Respaldo: {ruta_respaldo}")

    objetos = [
        PlanerPAC(**{col: fila[col] for col in COLUMNAS})
        for fila in df.to_dict("records")
    ]
    with transaction.atomic():
        borradas, _ = PlanerPAC.objects.filter(pac__in=anios).delete()
        PlanerPAC.objects.bulk_create(objetos, batch_size=500)

    print("\n" + "=" * 60)
    print("  OK - CARGA COMPLETADA (años no incluidos en el archivo intactos)")
    print(f"  Eliminadas : {borradas}")
    print(f"  Insertadas : {len(objetos)}")
    print(f"  Total en data_planerpac ahora: {PlanerPAC.objects.count()}")
    print("=" * 60)

    if reclasificar:
        _reclasificar_formularios()
    else:
        print("\n  [AVISO] --sin-reclasificar: los formularios FSC conservan su clasificación Dentro/Fuera anterior.")
        print("          Ejecuta una actualización de Formularios (o este script sin esa opción) para ponerla al día.")
    return True


def _reclasificar_formularios():
    """Cambiar el plan cambia qué `id_plan` son válidos, pero los formularios FSC guardan su
    clasificación Dentro/Fuera ya calculada: sin este paso quedan con la del plan anterior
    hasta el próximo sync de Formularios (2026-10-08: 43 FSC desfasados tras la 2ª
    modificación del PAC 2026). Reutiliza la misma regla del ETL de formularios y reengancha
    el cruce FSC-OC-PAC, que depende de esa clasificación. La carga del PAC ya quedó
    confirmada: un fallo acá solo se avisa, nunca la revierte."""
    print("\n  Reclasificando Dentro/Fuera PAC de los formularios FSC...")
    try:
        from api.services import reclasificar_dentro_fuera_pac, recalcular_fsc_oc_matching
        reclasificar_dentro_fuera_pac(_avisar=lambda **kw: print("   ", kw.get("log", "")))
        recalcular_fsc_oc_matching(_avisar=lambda **kw: print("   ", kw.get("log", "")))
    except Exception as e:  # noqa: BLE001 — la carga ya está hecha; solo informar
        print(f"  [AVISO] No se pudo reclasificar los formularios: {e}")
        print("          Ejecuta una actualización de Formularios para ponerlos al día.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Carga el Plan Anual de Compras (reemplazo por año).")
    ap.add_argument("archivo", nargs="?", help="Excel a cargar (por defecto, el .xlsx más reciente de esta carpeta)")
    ap.add_argument("--dry-run", action="store_true", help="valida y muestra qué haría, sin escribir en la BD")
    ap.add_argument("--forzar", action="store_true", help="omite la guarda contra archivos muy pequeños")
    ap.add_argument("--sin-reclasificar", action="store_true",
                    help="no recalcula Dentro/Fuera PAC de los formularios FSC tras cargar el plan")
    args = ap.parse_args()
    ok = cargar(args.archivo, dry_run=args.dry_run, forzar=args.forzar, reclasificar=not args.sin_reclasificar)
    sys.exit(0 if ok else 1)
