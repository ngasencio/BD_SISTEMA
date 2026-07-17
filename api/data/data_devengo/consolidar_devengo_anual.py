"""
consolidar_devengo_anual.py
---------------------------------
Consolida los .xlsx de "Disponibilidad de Devengos Presupuestarios" descargados
por sigfe_descarga_devengos_Completo.py (carpeta descargas_sigfe/) y los
sincroniza de forma INCREMENTAL contra la tabla api_sigfe_devengo_anual
(modelo Django DevengoSigfeAnual), acumulando histórico anual sin duplicar.

A diferencia de consolidar_devengo.py (que reemplaza por completo la tabla
'devengo' usada por el dashboard de Anexo N°3), este script NO borra nada:
cada fila se identifica por un hash de su contenido de negocio (row_hash) y
solo se insertan las filas cuyo hash todavía no existe en la base. Esto
permite volver a descargar rangos de fechas superpuestos sin generar
duplicados, y acumular el año completo en varias corridas parciales.

Uso:
    cd api/data/data_devengo
    python consolidar_devengo_anual.py
"""

import glob
import hashlib
import os
import re
import sys
from datetime import datetime, date

import pandas as pd

# La consola de Windows suele usar cp1252, que no soporta los caracteres
# Unicode (↳, ✅, ⚠) usados en los mensajes de progreso — sin esto el script
# revienta con UnicodeEncodeError apenas imprime el primer símbolo.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# Igual que en sigfe_descarga_devengos_Completo.py: anclado a la ubicación
# del archivo, no al cwd del proceso. Una ruta relativa aquí ("descargas_sigfe/")
# se resuelve contra el directorio de trabajo actual en el momento de ejecutar
# el script - si se invoca desde otra carpeta (o desde un hilo de Django que
# corre con otro cwd), busca en el lugar equivocado y nunca encuentra los
# .xlsx que sí descargó el scraper.
_RUTA_MODULO = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(_RUTA_MODULO, "descargas_sigfe")
PROCESADOS_PATH = os.path.join(DATA_PATH, "procesados")
HEADER_ROW = 5  # Fila 6 del Excel (0-indexed) contiene los encabezados reales

PATRON_PAGINA = re.compile(r"P[aá]gina\s+\d+\s+de", re.IGNORECASE)

# Mapea cada campo del modelo a las variantes de encabezado que puede traer
# el Excel (normalizadas: espacios colapsados y sin espacios al borde).
# SIGFE ha ido agregando columnas con el tiempo (Catálogo 06, Fecha Emisión,
# Insumo, Monto Vigente Insumo) — por eso se listan variantes, no un único
# nombre exacto, para no perder datos silenciosamente si vuelve a cambiar.
MAPEO_COLUMNAS = {
    "codigo_ue": ["Código Unidad Ejecutora"],
    "folio": ["Folio"],
    "titulo": ["Titulo", "Título"],
    "tipo_presupuesto": ["Tipo Presupuesto"],
    "moneda_presupuestaria": ["Moneda Presupuestaria"],
    "principal": ["Principal"],
    "principal_relacionado": ["Principal Relacionado"],
    "moneda_documento": ["Moneda Documento"],
    "tipo_cambio": ["Tipo de Cambio", "Tipo Cambio"],
    "tipo_documento": ["Tipo de Documento", "Tipo Documento"],
    "numero_documento": ["Número de Documento", "Número Documento"],
    "fecha_documento": ["Fecha Documento"],
    "fecha_conforme": ["Fecha Conforme"],
    "id_chile_compra": ["Id Chile Compra"],
    "fecha_emision": ["Fecha Emisión", "Fecha Emision"],
    "fecha_ingreso": [
        "Fecha Ingreso / Fecha Recepción",
        "Fecha Ingreso/Fecha Recepción",
        "Fecha Ingreso",
        "Fecha Recepción",
    ],
    "catalogo_01": ["Catálogo 01", "Catálogos 01"],
    "catalogo_02": ["Catálogo 02", "Catálogos 02"],
    "catalogo_03": ["Catálogo 03", "Catálogos 03"],
    "catalogo_04": ["Catálogo 04", "Catálogos 04"],
    "catalogo_05": ["Catálogo 05", "Catálogos 05"],
    "catalogo_06": ["Catálogo 06", "Catálogos 06"],
    "concepto_presupuestario": ["Concepto Presupuestario"],
    "monto_vigente": ["Monto Vigente"],
    "monto_disponible": ["Monto Disponible"],
    "monto_consumido": ["Monto Consumido"],
    "insumo": ["Insumo"],
    "monto_vigente_insumo": ["Monto Vigente Insumo"],
}

CAMPOS_FECHA = {"fecha_documento", "fecha_conforme", "fecha_emision", "fecha_ingreso"}
CAMPOS_DECIMAL = {"tipo_cambio", "monto_vigente", "monto_disponible", "monto_consumido", "monto_vigente_insumo"}

# Campos que participan del hash de contenido (identifican un registro real).
# archivo_origen queda fuera a propósito: el mismo registro puede reaparecer
# en otra descarga con otro nombre de archivo y sigue siendo el mismo hecho.
CAMPOS_HASH = [c for c in MAPEO_COLUMNAS.keys()]


def normalizar_encabezado(texto: str) -> str:
    return re.sub(r"\s+", " ", str(texto).strip())


def construir_mapa_columnas(columnas_df) -> dict:
    """Devuelve {campo_modelo: nombre_columna_real_en_df}, tolerando variantes
    de encabezado y espacios extra. Si un campo no se encuentra, se omite
    (queda como None para todas las filas del archivo, sin abortar)."""
    normalizadas = {normalizar_encabezado(c): c for c in columnas_df}
    mapa = {}
    for campo, variantes in MAPEO_COLUMNAS.items():
        for variante in variantes:
            clave = normalizar_encabezado(variante)
            if clave in normalizadas:
                mapa[campo] = normalizadas[clave]
                break
    return mapa


def quitar_filas_paginacion(df: pd.DataFrame) -> pd.DataFrame:
    """Elimina filas que contienen 'Página X de' (pie de página de Jasper
    repetido en cada página del reporte) en cualquier columna."""
    mask_pagina = pd.Series(False, index=df.index)
    for col in df.columns:
        mask_pagina = mask_pagina | df[col].astype(str).str.contains(PATRON_PAGINA, na=False, regex=True)
    n_eliminadas = int(mask_pagina.sum())
    if n_eliminadas:
        print(f"  ↳ Eliminadas {n_eliminadas} filas de paginación")
    return df[~mask_pagina].copy()


def _es_nulo(val) -> bool:
    """pd.isna() cubre None, NaN Y pandas.NaT (fechas faltantes) — a
    diferencia de chequear solo 'isinstance(val, float)', que deja pasar
    los NaT de columnas de fecha vacías y termina reventando en Django."""
    if val is None:
        return True
    try:
        resultado = pd.isna(val)
        return bool(resultado)
    except (TypeError, ValueError):
        return False


def valor_a_texto(val) -> str:
    """Convierte un valor de celda a texto estable para hash/almacenamiento.
    Los números que Excel/pandas leen como float (40.0) se guardan como
    entero cuando corresponde, para no terminar con '40.0' en un CharField
    que en el fondo representa un folio/número de documento entero."""
    if _es_nulo(val):
        return ""
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val).strip()


def valor_a_fecha(val):
    if _es_nulo(val):
        return None
    if isinstance(val, (datetime, date)):
        return val
    if isinstance(val, str) and val.strip():
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(val.strip(), fmt)
            except ValueError:
                continue
    return None


def valor_a_decimal_texto(val) -> str:
    """Representación de texto estable de un monto, para el hash — evita que
    diferencias de representación flotante (34020000.0 vs 34020000) generen
    hashes distintos para el mismo monto real."""
    if _es_nulo(val):
        return "0"
    try:
        return f"{float(val):.2f}"
    except (TypeError, ValueError):
        return "0"


def calcular_row_hash(registro: dict) -> str:
    partes = []
    for campo in CAMPOS_HASH:
        val = registro.get(campo)
        if campo in CAMPOS_DECIMAL:
            partes.append(valor_a_decimal_texto(val))
        elif campo in CAMPOS_FECHA:
            fecha = valor_a_fecha(val)
            partes.append(fecha.isoformat() if fecha else "")
        else:
            partes.append(valor_a_texto(val))
    cadena = "|".join(partes)
    return hashlib.sha256(cadena.encode("utf-8")).hexdigest()


def procesar_archivo(filepath: str) -> list:
    """Lee un xlsx y devuelve una lista de dicts (uno por fila válida), ya
    con row_hash calculado y listos para insertar en DevengoSigfeAnual."""
    df = pd.read_excel(filepath, header=HEADER_ROW)
    df = quitar_filas_paginacion(df)

    mapa = construir_mapa_columnas(df.columns)
    faltantes = [c for c in MAPEO_COLUMNAS if c not in mapa]
    if faltantes:
        print(f"  ⚠ Columnas no encontradas en este archivo (se guardarán vacías): {faltantes}")
    if "codigo_ue" not in mapa:
        print(f"  [ERROR] No se encontró la columna 'Código Unidad Ejecutora'. Se omite el archivo.")
        return []

    registros = []
    nombre_archivo = os.path.basename(filepath)
    for _, fila in df.iterrows():
        registro = {}
        for campo, col_real in mapa.items():
            registro[campo] = fila[col_real]

        if not valor_a_texto(registro.get("codigo_ue")):
            continue  # fila sin código UE -> no es un registro real

        row_hash = calcular_row_hash(registro)

        # Normalizar valores finales para el modelo Django
        limpio = {"archivo_origen": nombre_archivo, "row_hash": row_hash}
        for campo in MAPEO_COLUMNAS:
            val = registro.get(campo)
            if campo in CAMPOS_FECHA:
                limpio[campo] = valor_a_fecha(val)
            elif campo in CAMPOS_DECIMAL:
                valor_por_defecto = None if campo == "monto_vigente_insumo" else 0
                try:
                    limpio[campo] = valor_por_defecto if _es_nulo(val) else round(float(val), 2)
                except (TypeError, ValueError):
                    limpio[campo] = valor_por_defecto
            else:
                texto = valor_a_texto(val)
                limpio[campo] = texto if texto else None

        # fecha_documento/fecha_conforme/fecha_ingreso son DateField -> solo la fecha
        for campo in ("fecha_documento", "fecha_conforme", "fecha_ingreso"):
            if limpio.get(campo) is not None:
                limpio[campo] = limpio[campo].date() if hasattr(limpio[campo], "date") else limpio[campo]

        registros.append(limpio)

    return registros


def guardar_en_django(registros: list, progress_callback=None):
    """Upsert incremental: solo inserta filas cuyo row_hash todavía no existe.
    No borra nada de la tabla (a diferencia de consolidar_devengo.py).

    Devuelve un dict con conteos + un detalle acotado de las filas nuevas
    (para mostrar "documentos nuevos" en el panel de cambios del dashboard)
    y un resumen agregado por establecimiento."""
    def _avisar(**kw):
        if progress_callback:
            try:
                progress_callback(**kw)
            except Exception:
                pass

    print("\n🚀 SINCRONIZANDO CON api_sigfe_devengo_anual (Django)...")
    _avisar(paso_desc="Sincronizando con la base de datos...", progreso_pct=92, log_msg="Sincronizando con la base de datos...")

    backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))
    if backend_path not in sys.path:
        sys.path.append(backend_path)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

    import django
    from django.apps import apps
    if not apps.ready:
        django.setup()

    from api.models import DevengoSigfeAnual

    # Se consulta en lotes (no un solo IN gigante) para no exceder
    # max_allowed_packet de MariaDB con decenas de miles de hashes.
    TAM_LOTE_CONSULTA = 3000
    hashes_nuevos = list({r["row_hash"] for r in registros})
    hashes_existentes = set()
    for i in range(0, len(hashes_nuevos), TAM_LOTE_CONSULTA):
        lote = hashes_nuevos[i:i + TAM_LOTE_CONSULTA]
        hashes_existentes.update(
            DevengoSigfeAnual.objects.filter(row_hash__in=lote).values_list("row_hash", flat=True)
        )

    # Deduplicar también DENTRO del lote leído: es normal que dos descargas
    # con rangos de fecha superpuestos (ej. corridas de días distintos)
    # traigan filas idénticas entre sí, no solo repetidas de la BD. Si no se
    # filtran aquí, bulk_create(ignore_conflicts=True) las descarta igual
    # por la restricción única de row_hash, pero en silencio — el conteo
    # final de la tabla quedaría más bajo que "insertadas" sin explicación.
    vistos_en_lote = set()
    por_insertar = []
    duplicados_intra_lote = 0
    for r in registros:
        h = r["row_hash"]
        if h in hashes_existentes:
            continue
        if h in vistos_en_lote:
            duplicados_intra_lote += 1
            continue
        vistos_en_lote.add(h)
        por_insertar.append(r)

    ya_existian = len(registros) - len(por_insertar) - duplicados_intra_lote

    print(
        f"  -> {len(registros)} filas leídas | {ya_existian} ya existían en BD | "
        f"{duplicados_intra_lote} duplicadas dentro del mismo lote | {len(por_insertar)} nuevas por insertar"
    )

    # batch_size chico: max_allowed_packet de este servidor MariaDB es de
    # solo 1 MiB, y las filas tienen varios campos de texto largos (titulo,
    # principal, catálogos) que con lotes de 1000 lo superan fácilmente.
    objs = [DevengoSigfeAnual(**r) for r in por_insertar]
    DevengoSigfeAnual.objects.bulk_create(objs, batch_size=200, ignore_conflicts=True)

    total_en_tabla = DevengoSigfeAnual.objects.count()
    print(f"  ✅ Insertadas {len(objs)} filas nuevas. Total en tabla: {total_en_tabla}")
    _avisar(progreso_pct=98, log_msg=f"Insertadas {len(objs)} filas nuevas. Total en tabla: {total_en_tabla}")

    # Detalle acotado (panel "documentos nuevos") + resumen agregado por
    # establecimiento (para el panel de análisis) — se arman desde los
    # mismos dicts ya en memoria, sin consultas extra a la BD.
    LIMITE_DETALLE = 300
    nuevos_detalle = []
    resumen_por_ue = {}
    for r in por_insertar:
        ue = r.get("codigo_ue") or "(sin establecimiento)"
        agg = resumen_por_ue.setdefault(ue, {"codigo_ue": ue, "cantidad": 0, "monto_vigente_total": 0})
        agg["cantidad"] += 1
        agg["monto_vigente_total"] += float(r.get("monto_vigente") or 0)

        if len(nuevos_detalle) < LIMITE_DETALLE:
            fecha_doc = r.get("fecha_documento")
            nuevos_detalle.append({
                "codigo_ue": ue,
                "principal": r.get("principal"),
                "tipo_documento": r.get("tipo_documento"),
                "numero_documento": r.get("numero_documento"),
                "fecha_documento": fecha_doc.isoformat() if fecha_doc else None,
                "concepto_presupuestario": r.get("concepto_presupuestario"),
                "monto_vigente": float(r.get("monto_vigente") or 0),
            })

    return {
        "filas_leidas": len(registros),
        "ya_existian": ya_existian,
        "duplicados_intra_lote": duplicados_intra_lote,
        "insertadas": len(objs),
        "total_en_tabla": total_en_tabla,
        "nuevos_detalle": nuevos_detalle,
        "nuevos_detalle_truncado": len(por_insertar) > LIMITE_DETALLE,
        "resumen_por_ue": sorted(resumen_por_ue.values(), key=lambda x: -x["monto_vigente_total"]),
    }


def mover_a_procesados(archivos: list):
    os.makedirs(PROCESADOS_PATH, exist_ok=True)
    for filepath in archivos:
        destino = os.path.join(PROCESADOS_PATH, os.path.basename(filepath))
        contador = 1
        base, ext = os.path.splitext(destino)
        while os.path.exists(destino):
            destino = f"{base}_{contador}{ext}"
            contador += 1
        os.rename(filepath, destino)


def consolidar(progress_callback=None):
    """Punto de entrada de la consolidación. Lanza RuntimeError (no
    sys.exit) ante condiciones de error — sys.exit() dispara SystemExit,
    que NO hereda de Exception y por lo tanto no lo captura un
    'except Exception' en el hilo de Django que orquesta la descarga web;
    la tarea quedaría colgada en 'en_proceso' para siempre. RuntimeError
    sí es capturable y además sigue matando el proceso igual si se corre
    por CLI (__main__), así que no cambia el comportamiento manual."""
    def _avisar(**kw):
        if progress_callback:
            try:
                progress_callback(**kw)
            except Exception:
                pass

    archivos = sorted(glob.glob(os.path.join(DATA_PATH, "*.xlsx")))

    if not archivos:
        raise RuntimeError(f"No se encontraron archivos .xlsx en: {DATA_PATH}")

    print(f"Archivos encontrados: {len(archivos)}")
    _avisar(paso_desc=f"Consolidando {len(archivos)} archivo(s) descargados...", progreso_pct=90,
            log_msg=f"Consolidando {len(archivos)} archivo(s) descargados...")
    todos_los_registros = []
    archivos_ok = []

    for filepath in archivos:
        nombre = os.path.basename(filepath)
        print(f"\nProcesando: {nombre}")
        try:
            registros = procesar_archivo(filepath)
            print(f"  ✓ {len(registros)} filas válidas")
            _avisar(log_msg=f"  {nombre}: {len(registros)} filas válidas")
            todos_los_registros.extend(registros)
            archivos_ok.append(filepath)
        except Exception as e:
            print(f"  [ADVERTENCIA] No se pudo procesar {filepath}: {e}")
            _avisar(log_msg=f"⚠️ No se pudo procesar {nombre}: {e}")

    if not todos_los_registros:
        raise RuntimeError("Ningún archivo produjo filas válidas.")

    print("\n" + "═" * 55)
    print("RESUMEN LECTURA")
    print("═" * 55)
    print(f"  Archivos procesados  : {len(archivos_ok)}/{len(archivos)}")
    print(f"  Filas totales léidas : {len(todos_los_registros):,}")
    print("═" * 55)

    try:
        resultado = guardar_en_django(todos_los_registros, progress_callback=progress_callback)
    except Exception as e:
        print(f"\n❌ Error al sincronizar con Django: {e}")
        raise

    mover_a_procesados(archivos_ok)
    print(f"\n📦 {len(archivos_ok)} archivo(s) movidos a {PROCESADOS_PATH}")
    _avisar(progreso_pct=100, log_msg=f"{len(archivos_ok)} archivo(s) consolidados y movidos a procesados/")

    resultado["archivos_procesados"] = len(archivos_ok)
    resultado["archivos_totales"] = len(archivos)
    return resultado


if __name__ == "__main__":
    consolidar()
