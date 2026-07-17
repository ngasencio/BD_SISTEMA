"""
consolidar_anexo1_sigfe.py
---------------------------
Lee los .xlsx descargados por Sigfe_Descargas_Estado_ejecucion_presupuestaria.py
(carpeta descargas_sigfe_ejecucion/) y los sincroniza con la tabla api_sigfe_anexo1
(modelo SigfeAnexo1, backend/api/models.py).

A diferencia de anexo1_loader.py (que hace un reemplazo total de tabla_anexo1),
acá la sincronización es incremental POR TRAMO: para cada archivo se borra e
inserta solo el conjunto (codigo_ue, anho, mes) correspondiente a ese archivo,
así reprocesar un mes no afecta los demás ya cargados.

El establecimiento, código y rango de fechas real del tramo NO se toman del
nombre de archivo (poco confiable: nombres de establecimiento con espacios se
sanitizan a "_" y podrían colisionar con el separador). Se leen directamente
de las filas de metadata que trae el propio reporte SIGFE (filas 1 y 2), que
son la fuente autoritativa de qué establecimiento y qué rango de fechas
contiene realmente el archivo.

Si hay varios archivos para el mismo (codigo_ue, anho, mes) -- por ejemplo,
reintentos o descargas repetidas del mes en curso -- se procesan todos en
orden alfabético de nombre de archivo. Como el nombre termina en
YYYYMMDD_HHMMSS, esto procesa los archivos de más antiguo a más reciente, y
como cada uno hace un delete-scoped antes de insertar, el último (más
reciente) para esa clave es el que queda vigente.

Uso:
    cd api/data/data_anexo1
    python consolidar_anexo1_sigfe.py
"""

import os
import re
import sys
import glob
import warnings
import pathlib
from datetime import date
from decimal import Decimal, InvalidOperation

import pandas as pd

BASE_DIR = pathlib.Path(__file__).parent.absolute()
DOWNLOAD_DIR = BASE_DIR / "descargas_sigfe_ejecucion"

MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

# Columnas de datos reales confirmadas en el Excel (fila de encabezado = índice 6):
# Nivel | Concepto Presupuestario | Nivel Cruce | Catalogo Cruce | Ley de Presupuestos |
# Requerimiento | Saldo por Aplicar | Compromiso | Saldo por Comprometer | Devengado |
# Saldo por Devengar | Efectivo | Deuda Flotante
MAPEO_COLUMNAS = {
    "Nivel Cruce": "nivel_cruce",
    "Catalogo Cruce": "catalogo_cruce",
    "Ley de Presupuestos": "ley_presupuestos",
    "Requerimiento": "requerimiento",
    "Saldo por Aplicar": "saldo_por_aplicar",
    "Compromiso": "compromiso",
    "Saldo por Comprometer": "saldo_por_comprometer",
    "Devengado": "devengado",
    "Saldo por Devengar": "saldo_por_devengar",
    "Efectivo": "efectivo",
    "Deuda Flotante": "deuda_flotante",
}
COLUMNAS_NUMERICAS = [
    "Ley de Presupuestos", "Requerimiento", "Saldo por Aplicar", "Compromiso",
    "Saldo por Comprometer", "Devengado", "Saldo por Devengar", "Efectivo",
    "Deuda Flotante",
]


class ArchivoInvalido(Exception):
    pass


def parse_numero(valor) -> Decimal:
    """
    Convierte el valor de una celda a Decimal, o 0 si está vacía.

    Los montos de este reporte SIGFE vienen como texto plano sin separador de
    miles ni notación contable de paréntesis (confirmado sobre datos reales:
    enteros con o sin signo '-', p.ej. '61698553684' / '-2590809428'). No se
    intenta adivinar un formato de separadores -- mismo criterio que
    api/data/data_devengo/consolidar_devengo_anual.py (round(float(val), 2))
    para el mismo origen de datos SIGFE.
    """
    if valor is None or (not isinstance(valor, str) and pd.isna(valor)):
        return Decimal("0")
    texto = str(valor).strip()
    if texto == "" or texto.lower() == "nan":
        return Decimal("0")
    try:
        return Decimal(texto)
    except InvalidOperation:
        warnings.warn(f"No se pudo convertir a número: '{valor}' -> 0")
        return Decimal("0")


def extraer_metadata(filepath: str) -> dict:
    """
    Lee las filas de cabecera del reporte (sin datos) para obtener el
    establecimiento real y el rango de fechas real del tramo descargado.

    Estructura conocida:
        Fila 0: 'Estado de Ejecución Presupuestaria'
        Fila 1: '1638002 Hospital de Osorno'
        Fila 2: '01 enero 2026 al 31 enero 2026'
        ...
        Fila 6: encabezados de columnas
    """
    meta = pd.read_excel(filepath, header=None, dtype=str, nrows=4)

    linea_establecimiento = str(meta.iloc[1, 0]).strip()
    m_est = re.match(r"^(\d+)\s+(.+)$", linea_establecimiento)
    if not m_est:
        raise ArchivoInvalido(
            f"No se pudo leer establecimiento en fila 1: '{linea_establecimiento}'"
        )
    codigo_ue, nombre_establecimiento = m_est.group(1), m_est.group(2).strip()

    linea_periodo = str(meta.iloc[2, 0]).strip().lower()
    m_periodo = re.match(
        r"^(\d{1,2})\s+(\w+)\s+(\d{4})\s+al\s+(\d{1,2})\s+(\w+)\s+(\d{4})$",
        linea_periodo,
    )
    if not m_periodo:
        raise ArchivoInvalido(f"No se pudo leer el período en fila 2: '{linea_periodo}'")

    d1, mes1_txt, y1, d2, mes2_txt, y2 = m_periodo.groups()
    mes1 = MESES_ES.get(mes1_txt)
    mes2 = MESES_ES.get(mes2_txt)
    if not mes1 or not mes2:
        raise ArchivoInvalido(f"Nombre de mes desconocido en período: '{linea_periodo}'")

    fecha_desde = date(int(y1), mes1, int(d1))
    fecha_hasta = date(int(y2), mes2, int(d2))

    return {
        "codigo_ue": codigo_ue,
        "nombre_establecimiento": nombre_establecimiento,
        "fecha_desde_tramo": fecha_desde,
        "fecha_hasta_tramo": fecha_hasta,
        # El tramo siempre cae dentro de un único mes calendario
        # (ver generar_rangos_mensuales en el script de descarga).
        "anho": fecha_desde.year,
        "mes": fecha_desde.month,
    }


def construir_ruta_jerarquica(niveles: pd.Series, conceptos: pd.Series) -> list:
    """Para cada fila, concatena los conceptos de los niveles ancestros."""
    rutas = []
    pila: list[tuple[int, str]] = []
    for nivel, concepto in zip(niveles, conceptos):
        concepto = str(concepto).strip()
        if pd.isna(nivel):
            rutas.append(concepto)
            continue
        nivel_int = int(nivel)
        pila = [(n, c) for n, c in pila if n < nivel_int]
        pila.append((nivel_int, concepto))
        rutas.append(" > ".join(c for _, c in pila))
    return rutas


def leer_archivo(filepath: str, metadata: dict) -> pd.DataFrame:
    df = pd.read_excel(filepath, header=6, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    df.dropna(axis=1, how="all", inplace=True)

    df.dropna(how="all", inplace=True)
    df.reset_index(drop=True, inplace=True)

    if df.empty:
        raise ArchivoInvalido("El archivo no tiene filas de datos tras la limpieza.")
    if "Nivel" not in df.columns or "Concepto Presupuestario" not in df.columns:
        raise ArchivoInvalido(
            f"Faltan columnas esperadas 'Nivel'/'Concepto Presupuestario'. "
            f"Columnas encontradas: {list(df.columns)}"
        )

    # Filas de ruido detectadas por FORMA, no por texto de paginación adivinado
    # (el intento inicial de buscar "indica 1 de" -- copiado del reporte de
    # Devengo -- no detectaba nada acá: este reporte pagina con "Página N de
    # M", que además llega con encoding roto desde el export XLSX). Una fila
    # de datos real siempre tiene Nivel numérico + Concepto Presupuestario no
    # vacío; se descartan:
    #   - separadores de página: Concepto Presupuestario vacío
    #   - encabezado repetido en cada página: Nivel == "Nivel" (texto literal)
    #   - fila de gran total del reporte: Concepto Presupuestario == "Total"
    mask_ruido = (
        df["Concepto Presupuestario"].isna()
        | (df["Nivel"].astype(str).str.strip().str.lower() == "nivel")
        | (df["Concepto Presupuestario"].astype(str).str.strip().str.lower() == "total")
    )
    df = df[~mask_ruido].reset_index(drop=True)
    if df.empty:
        raise ArchivoInvalido("El archivo no tiene filas de datos tras filtrar ruido de paginación.")

    nivel_numerico = pd.to_numeric(df["Nivel"], errors="coerce")
    df["_ruta_jerarquica"] = construir_ruta_jerarquica(nivel_numerico, df["Concepto Presupuestario"])
    df["_nivel_int"] = nivel_numerico

    registros = []
    for _, fila in df.iterrows():
        registro = dict(metadata)
        registro["nivel"] = int(fila["_nivel_int"]) if pd.notna(fila["_nivel_int"]) else None
        registro["concepto_presupuestario"] = (
            str(fila["Concepto Presupuestario"]).strip()
            if pd.notna(fila["Concepto Presupuestario"]) else None
        )
        registro["ruta_jerarquica"] = fila["_ruta_jerarquica"]

        for col_excel, campo_modelo in MAPEO_COLUMNAS.items():
            valor = fila.get(col_excel)
            if campo_modelo in ("nivel_cruce", "catalogo_cruce"):
                registro[campo_modelo] = (
                    str(valor).strip() if valor is not None and pd.notna(valor) and str(valor).strip() else None
                )
            else:
                registro[campo_modelo] = parse_numero(valor)

        registros.append(registro)

    return registros


def guardar_en_django(registros: list, metadata: dict, archivo_origen: str):
    base_dir = pathlib.Path(__file__).parent.absolute()
    backend_path = str((base_dir / ".." / ".." / ".." / "backend").resolve())
    if backend_path not in sys.path:
        sys.path.append(backend_path)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

    import django
    from django.apps import apps
    if not apps.ready:
        django.setup()

    from django.db import transaction
    from api.models import SigfeAnexo1

    objs = []
    for r in registros:
        objs.append(SigfeAnexo1(
            codigo_ue=metadata["codigo_ue"],
            nombre_establecimiento=metadata["nombre_establecimiento"],
            anho=metadata["anho"],
            mes=metadata["mes"],
            fecha_desde_tramo=metadata["fecha_desde_tramo"],
            fecha_hasta_tramo=metadata["fecha_hasta_tramo"],
            nivel=r["nivel"],
            concepto_presupuestario=r["concepto_presupuestario"],
            nivel_cruce=r["nivel_cruce"],
            catalogo_cruce=r["catalogo_cruce"],
            ruta_jerarquica=r["ruta_jerarquica"],
            ley_presupuestos=r["ley_presupuestos"],
            requerimiento=r["requerimiento"],
            saldo_por_aplicar=r["saldo_por_aplicar"],
            compromiso=r["compromiso"],
            saldo_por_comprometer=r["saldo_por_comprometer"],
            devengado=r["devengado"],
            saldo_por_devengar=r["saldo_por_devengar"],
            efectivo=r["efectivo"],
            deuda_flotante=r["deuda_flotante"],
            archivo_origen=archivo_origen,
        ))

    with transaction.atomic():
        SigfeAnexo1.objects.filter(
            codigo_ue=metadata["codigo_ue"], anho=metadata["anho"], mes=metadata["mes"],
        ).delete()
        SigfeAnexo1.objects.bulk_create(objs, batch_size=500)


PROCESADOS_DIR = DOWNLOAD_DIR / "procesados"


def mover_a_procesados(filepath: str):
    """Archiva un .xlsx ya sincronizado, igual patrón que
    api/data/data_devengo/consolidar_devengo_anual.py -- así una corrida
    futura no vuelve a leer (ni a pagar el costo de) archivos ya cargados."""
    os.makedirs(PROCESADOS_DIR, exist_ok=True)
    nombre = os.path.basename(filepath)
    destino = PROCESADOS_DIR / nombre
    base, ext = os.path.splitext(str(destino))
    contador = 1
    while destino.exists():
        destino = pathlib.Path(f"{base}_{contador}{ext}")
        contador += 1
    os.rename(filepath, destino)


def procesar_archivo(filepath: str) -> dict:
    nombre = os.path.basename(filepath)
    try:
        metadata = extraer_metadata(filepath)
        registros = leer_archivo(filepath, metadata)
        guardar_en_django(registros, metadata, archivo_origen=nombre)
        return {
            "exito": True, "metadata": metadata, "n_filas": len(registros),
            "mensaje": (
                f"OK  {nombre} -> {metadata['codigo_ue']} {metadata['nombre_establecimiento']} "
                f"{metadata['anho']}-{metadata['mes']:02d} ({len(registros)} filas)"
            ),
        }
    except ArchivoInvalido as e:
        return {"exito": False, "metadata": None, "n_filas": 0, "mensaje": f"OMITIDO  {nombre}: {e}"}
    except Exception as e:
        return {"exito": False, "metadata": None, "n_filas": 0, "mensaje": f"ERROR  {nombre}: {e}"}


def consolidar(progress_callback=None) -> dict:
    """
    Punto de entrada de la consolidación. Lanza RuntimeError (no sys.exit)
    ante condiciones de error -- sys.exit() dispara SystemExit, que NO
    hereda de Exception y por lo tanto no lo captura un 'except Exception'
    en el hilo de Django que orquesta la descarga web; la tarea quedaría
    colgada en 'en_proceso' para siempre. Mismo criterio que
    api/data/data_devengo/consolidar_devengo_anual.py.

    Devuelve un dict con el resumen (para el panel de cambios del
    dashboard); los archivos sincronizados con éxito se archivan en
    descargas_sigfe_ejecucion/procesados/.
    """
    def _avisar(**kw):
        if progress_callback:
            try:
                progress_callback(**kw)
            except Exception:
                pass

    if not DOWNLOAD_DIR.is_dir():
        raise RuntimeError(f"No existe la carpeta de descargas: {DOWNLOAD_DIR}")

    archivos = sorted(glob.glob(str(DOWNLOAD_DIR / "*.xlsx")))
    if not archivos:
        raise RuntimeError(f"No se encontraron archivos .xlsx en {DOWNLOAD_DIR}")

    print(f"Procesando {len(archivos)} archivo(s) desde {DOWNLOAD_DIR}...\n")
    _avisar(paso_desc=f"Consolidando {len(archivos)} archivo(s) descargados...", progreso_pct=92,
            log=f"Consolidando {len(archivos)} archivo(s) descargados...")

    resumen = []
    fallidos_detalle = []
    archivos_ok = []
    filas_totales = 0

    for filepath in archivos:
        resultado = procesar_archivo(filepath)
        print(resultado["mensaje"])
        if resultado["exito"]:
            archivos_ok.append(filepath)
            filas_totales += resultado["n_filas"]
            m = resultado["metadata"]
            resumen.append({
                "codigo_ue": m["codigo_ue"],
                "nombre_establecimiento": m["nombre_establecimiento"],
                "anho": m["anho"], "mes": m["mes"], "filas": resultado["n_filas"],
            })
        else:
            fallidos_detalle.append(resultado["mensaje"])

    for filepath in archivos_ok:
        try:
            mover_a_procesados(filepath)
        except Exception as e:
            print(f"  No se pudo mover {os.path.basename(filepath)} a procesados/: {e}")

    print(f"\nResumen: {len(archivos_ok)}/{len(archivos)} archivo(s) sincronizados correctamente.")
    if fallidos_detalle:
        print(f"{len(fallidos_detalle)} archivo(s) con problemas:")
        for f in fallidos_detalle:
            print(f"  - {f}")

    _avisar(progreso_pct=100, log=f"{len(archivos_ok)} archivo(s) consolidados y movidos a procesados/")

    return {
        "archivos_procesados": len(archivos_ok),
        "archivos_fallidos": len(fallidos_detalle),
        "archivos_totales": len(archivos),
        "filas_totales": filas_totales,
        "resumen": resumen,
        "fallidos_detalle": fallidos_detalle,
    }


if __name__ == "__main__":
    consolidar()
