import csv
import datetime as dt
import json
import os
import pathlib
import re
import ssl
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple
import pandas as pd
import numpy as np

# ==========================================================
# CONFIGURACIÓN RED DE SALUD - SERVICIO DE SALUD OSORNO
# ==========================================================

TICKET = "2798F2D3-0AC5-4323-9BB9-5E90618194BA"

# Tabla de organismos de la Red SSO (código → nombre corto)
RED_SSO: Dict[str, str] = {
    "7296":    "Servicio de Salud Osorno",
    "7327":    "Hospital Purranque",
    "7470":    "Hospital Río Negro",
    "7287":    "Hospital Puerto Octay",
    "1238659": "Hospital Futa Srüka Lawenche Kunko Mapu Mo",
    "1238663": "Hospital Pü Mulen de Quilacahuín",
    #"7393":    "Hospital Base Osorno",
}

# Mantener compatibilidad: CODIGO_ORGANISMO apunta al SSO por defecto
CODIGO_ORGANISMO = "7296"

# 1. Obtenemos la ruta donde está este archivo
RUTA_API = pathlib.Path(__file__).parent.absolute()

# 2. Definimos las carpetas de trabajo (nueva estructura multi-organismo)
CARPETA_BASE    = RUTA_API / "OC_TOTAL_DSSO"
CARPETA_DIARIO  = CARPETA_BASE / "DIARIO"
CARPETA_MAESTROS = CARPETA_BASE / "MAESTROS"

# Nombres de los maestros consolidados de la Red
NOMBRE_MAESTRO_RESUMEN = "OC_TOTAL_Maestro_Resumen.csv"
NOMBRE_MAESTRO_DETALLE = "OC_TOTAL_Maestro_Detalle.csv"

# Asegurar que existan los directorios
CARPETA_DIARIO.mkdir(parents=True, exist_ok=True)
CARPETA_MAESTROS.mkdir(parents=True, exist_ok=True)

MAX_REINTENTOS = 5
ESPERA_ENTRE_INTENTOS = 4.0

# Concurrencia: en modo multi-organismo se corren 6 organismos en paralelo,
# cada uno con MAX_WORKERS_DETALLE hilos internos → reducido a 4 para no saturar la API.
MAX_WORKERS_DETALLE  = 4   # hilos por organismo (era 6 para un solo organismo)
MAX_WORKERS_ORGANISMO = 6  # organismos en paralelo (uno por establecimiento)

# Throttle suave entre peticiones de detalle (en segundos). Se aplica por tarea/hilo.
ESPERA_ENTRE_DETALLES = 0.05

URL_OC = "https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra.json"

# Patrón código Compra Ágil: {CodigoUnidad}-{N}-COT{año}  ej: "1057532-18-COT22"
_RE_COT = re.compile(r'\b(\d{4,8}-\d{1,4}-COT\d{2,4})\b', re.IGNORECASE)

# Tablas de decodificación (fuente: anexos API Mercado Público)
_TIPO_OC_DESC: Dict[str, str] = {
    "OC": "Automática",
    "D1": "Trato Directo por proveedor único",
    "C1": "Trato Directo por emergencia, urgencia e imprevisto",
    "F3": "Trato Directo por confidencialidad",
    "G1": "Trato Directo por naturaleza de negociación",
    "R1": "Orden de compra menor a 3 UTM",
    "CA": "Orden de compra sin resolución",
    "SE": "Sin emisión automática",
    "CM": "Convenio Marco",
    "FG": "Trato Directo (Art. 8 letras f y g - Ley 19.886)",
    "TL": "Convenio Marco – Tienda de Libros",
    "MC": "Microcompra",
    "AG": "Compra Ágil",
    "CC": "Compra Coordinada",
    "TD": "Trato Directo",
}

_MONEDA_DESC: Dict[str, str] = {
    "CLP": "Peso Chileno",
    "CLF": "Unidad de Fomento",
    "USD": "Dólar Americano",
    "UTM": "Unidad Tributaria Mensual",
    "EUR": "Euro",
}

_DESPACHO_DESC: Dict[str, str] = {
    "7":  "Despachar a Dirección de envío",
    "9":  "Despachar según programa adjuntado",
    "12": "Otra Forma de Despacho",
    "14": "Retiramos de su bodega",
    "20": "Despacho por courier o encomienda aérea",
    "21": "Despacho por courier o encomienda terrestre",
    "22": "A convenir",
}

_FORMA_PAGO_DESC: Dict[str, str] = {
    "1":  "15 días contra recepción de factura",
    "2":  "30 días contra recepción de factura",
    "39": "Otra forma de pago",
    "46": "50 días contra recepción de factura",
    "47": "60 días contra recepción de factura",
    "48": "A 45 días",
    "49": "A más de 30 días",
}

@dataclass(frozen=True)
class ApiConfig:
    """Configuración de acceso a API y resiliencia."""

    codigo_organismo: str
    ticket: str
    max_reintentos: int = MAX_REINTENTOS
    espera_base: float = ESPERA_ENTRE_INTENTOS
    timeout: int = 30
    url_oc: str = URL_OC

class MercadoPublicoClient:
    """Cliente mínimo para la API (urllib) con backoff y manejo de errores."""

    def __init__(self, cfg: ApiConfig):
        self.cfg = cfg
        self._ctx = ssl._create_unverified_context()

    def get_json(self, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        url_completa = self.cfg.url_oc + "?" + urllib.parse.urlencode(params)
        last_err: Optional[Exception] = None

        for intento in range(1, self.cfg.max_reintentos + 1):
            try:
                with urllib.request.urlopen(url_completa, context=self._ctx, timeout=self.cfg.timeout) as resp:
                    return json.load(resp)
            except Exception as e:
                last_err = e
                print(f"    ⚠️ Intento {intento}/{self.cfg.max_reintentos} falló (timeout/error). Reintentando en {self.cfg.espera_base * intento}s...")
                # Backoff lineal (simple y predecible). Si necesitas más agresividad: exponencial.
                time.sleep(self.cfg.espera_base * intento)

        print(f"⚠️  API sin respuesta tras {self.cfg.max_reintentos} intentos: {last_err}")
        return None

    def obtener_listado_dia(self, fecha_dt: dt.date) -> List[Dict[str, Any]]:
        params = {
            "fecha": fecha_dt.strftime("%d%m%Y"),
            "CodigoOrganismo": self.cfg.codigo_organismo,
            "ticket": self.cfg.ticket,
        }
        data = self.get_json(params)
        if not data or not data.get("Listado"):
            return []
        return data["Listado"]

    def obtener_detalle_oc(self, codigo_oc: str) -> Optional[Dict[str, Any]]:
        params = {"codigo": codigo_oc, "ticket": self.cfg.ticket}
        data = self.get_json(params)
        return data["Listado"][0] if data and data.get("Listado") else None

def limpiar(texto):
    if texto is None: return ""
    return str(texto).replace("\n", " ").replace(";", ",").replace("\r", " ").strip()

def generar_link_mp(codigo_oc):
    """Genera el link directo a la orden de compra en Mercado Público"""
    if not codigo_oc or str(codigo_oc).strip() == "" or str(codigo_oc).lower() == "nan":
        return ""
    base_url = "http://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC="
    return f"{base_url}{codigo_oc}"

def _extraer_codigo_ca(nombre: str, descripcion: str) -> str:
    """Busca el código de Compra Ágil (XXXXXXX-NN-COTyy) en texto libre."""
    for texto in (nombre, descripcion):
        if not texto or str(texto).strip().lower() in ("nan", "none", ""):
            continue
        m = _RE_COT.search(str(texto))
        if m:
            return m.group(1).upper()
    return ""


def _enriquecer_df_oc(df: pd.DataFrame) -> pd.DataFrame:
    """
    Añade/recalcula las columnas CodigoCompraAgil, TipoCompraInterna y TipoOCInterno.
    Se aplica sobre el DataFrame maestro de resumen.
    """
    _cols_recalc = [
        "CodigoCompraAgil", "TipoCompraInterna", "TipoOCInterno",
        "DescripcionTipoOC", "DescripcionMoneda", "DescripcionDespacho", "DescripcionFormaPago",
    ]
    for col in _cols_recalc:
        if col in df.columns:
            df.drop(columns=[col], inplace=True)

    # CodigoCompraAgil: solo para TipoOC == "AG"
    def _get_ca(row):
        if str(row.get("TipoOC", "") or "").strip().upper() != "AG":
            return None
        codigo = _extraer_codigo_ca(
            str(row.get("NombreOC", "") or ""),
            str(row.get("DescripcionOC", "") or ""),
        )
        return codigo if codigo else None

    df["CodigoCompraAgil"] = df.apply(_get_ca, axis=1)

    # TipoCompraInterna: clasificación por TipoOC y CodigoLicitacion
    def _clasificar(row):
        tipo_oc = str(row.get("TipoOC", "") or "").strip().upper()
        cod_lic = str(row.get("CodigoLicitacion", "") or "").strip()
        if tipo_oc == "AG":
            return "Compra Ágil"
        if tipo_oc == "CM":
            return "Convenio Marco"
        if tipo_oc == "TD":
            return "Trato Directo"
        if cod_lic and cod_lic.lower() not in ("nan", "none"):
            return "Licitación"
        return tipo_oc if tipo_oc else "Otro"

    df["TipoCompraInterna"] = df.apply(_clasificar, axis=1)

    # TipoOCInterno: clasificación interna por prefijo del NombreOC
    _PREFIJOS_FORMULARIO = ("F1", "F2", "F3", "F4", "F5")

    def _tipo_oc_interno(row):
        nombre = str(row.get("NombreOC", "") or "").strip().upper()
        if nombre.startswith("CC"):
            return "Contratos"
        if any(nombre.startswith(p) for p in _PREFIJOS_FORMULARIO):
            return "Formulario"
        if nombre.startswith("PA"):
            return "Pasajes"
        if nombre.startswith("TD"):
            return "Trato Directo"
        return "Sin Clasificar"

    df["TipoOCInterno"] = df.apply(_tipo_oc_interno, axis=1)

    # Columnas descriptivas a partir de tablas de decodificación Mercado Público
    def _decode(col: str, tabla: Dict[str, str]) -> "pd.Series":
        if col not in df.columns:
            return pd.Series("", index=df.index)
        return df[col].apply(lambda x: tabla.get(str(x or "").strip().upper(), ""))

    df["DescripcionTipoOC"]    = _decode("TipoOC",      _TIPO_OC_DESC)
    df["DescripcionMoneda"]    = _decode("TipoMoneda",   _MONEDA_DESC)
    df["DescripcionDespacho"]  = df["TipoDespacho"].apply(
        lambda x: _DESPACHO_DESC.get(str(x or "").strip(), "")
    ) if "TipoDespacho" in df.columns else ""
    df["DescripcionFormaPago"] = df["FormaPago"].apply(
        lambda x: _FORMA_PAGO_DESC.get(str(x or "").strip(), "")
    ) if "FormaPago" in df.columns else ""

    return df


def _write_csv_dicts(path: pathlib.Path, rows: List[Dict[str, Any]], delimiter: str = ";") -> None:
    """Escritura CSV consistente y relativamente rápida para lista de dicts."""
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8-sig") as csvfile:
        w = csv.DictWriter(csvfile, fieldnames=rows[0].keys(), delimiter=delimiter)
        w.writeheader()
        w.writerows(rows)

def _extraer_resumen_y_detalles(
    codigo: str,
    oc: Dict[str, Any],
    codigo_organismo: str = "",
    nombre_organismo: str = "",
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Normaliza un JSON de OC en fila resumen + filas detalle.
    
    Los campos CodigoOrganismo y NombreOrganismo se inyectan como primeras
    columnas del resumen y del detalle para trazabilidad multi-establecimiento.
    """
    comp = oc.get("Comprador") or {}
    prov = oc.get("Proveedor") or {}
    fech = oc.get("Fechas") or {}

    resumen = {
        "CodigoOrganismo": codigo_organismo,
        "NombreOrganismo": nombre_organismo,
        "CodigoOC": codigo,
        "LinkMP": generar_link_mp(codigo),
        "NombreOC": limpiar(oc.get("Nombre")),
        "CodigoEstado": oc.get("CodigoEstado"),
        "EstadoOC": oc.get("Estado"),
        "CodigoLicitacion": oc.get("CodigoLicitacion"),
        "TipoOC": oc.get("Tipo"),
        "TipoMoneda": oc.get("TipoMoneda"),
        "Financiamiento": oc.get("Financiamiento"),
        "FormaPago": oc.get("FormaPago"),
        "TipoDespacho": oc.get("TipoDespacho"),
        "Pais": oc.get("Pais"),
        "FechaCreacion": fech.get("FechaCreacion"),
        "FechaEnvio": fech.get("FechaEnvio"),
        "FechaAceptacion": fech.get("FechaAceptacion"),
        "FechaCancelacion": fech.get("FechaCancelacion"),
        "FechaUltimaModificacion": fech.get("FechaUltimaModificacion"),
        "PromedioCalificacion": oc.get("PromedioCalificacion"),
        "CantidadEvaluacion": oc.get("CantidadEvaluacion"),
        "TotalNeto": oc.get("TotalNeto"),
        "PorcentajeIva": oc.get("PorcentajeIva"),
        "Impuestos": oc.get("Impuestos"),
        "TotalBruto": oc.get("Total"),
        "C_CodigoUnidad": comp.get("CodigoUnidad"),
        "C_Unidad": comp.get("NombreUnidad"),
        "C_RutUnidad": comp.get("RutUnidad"),
        "C_Actividad": comp.get("Actividad"),
        "C_Direccion": comp.get("DireccionUnidad"),
        "C_Comuna": comp.get("ComunaUnidad"),
        "C_Region": comp.get("RegionUnidad"),
        "C_Contacto": comp.get("NombreContacto"),
        "C_Cargo": comp.get("CargoContacto"),
        "C_Email": comp.get("MailContacto"), #Duplicado
        "P_Codigo": prov.get("Codigo"),
        "P_Nombre": prov.get("Nombre"),
        "P_Rut": prov.get("RutSucursal"),
        "P_Actividad": limpiar(prov.get("Actividad")),
        "P_Direccion": limpiar(prov.get("Direccion")),
        "P_Comuna": prov.get("Comuna"),
        "P_Region": prov.get("Region"),
        "P_Contacto": prov.get("NombreContacto"),
        "P_Cargo": prov.get("CargoContacto"),
        "P_Email": prov.get("MailContacto"), #Duplicado
        "DescripcionOC": limpiar(oc.get("Descripcion")),
    }

    detalles: List[Dict[str, Any]] = []
    items_list = oc.get("Items", {}).get("Listado", []) if oc.get("Items") else []
    for it in items_list:
        detalles.append(
            {
                "CodigoOrganismo": codigo_organismo,
                "NombreOrganismo": nombre_organismo,
                "CodigoOC": codigo,
                "Correlativo": it.get("Correlativo"),
                "CodigoCategoria": it.get("CodigoCategoria"),
                "Categoria": limpiar(it.get("Categoria")),
                "CodigoProducto": it.get("CodigoProducto"),
                "Producto": limpiar(it.get("Producto")),
                "EspecificacionComprador": limpiar(it.get("EspecificacionComprador")),
                "EspecificacionProveedor": limpiar(it.get("EspecificacionProveedor")),
                "Cantidad": it.get("Cantidad"),
                "Unidad": it.get("Unidad"),
                "PrecioNeto": it.get("PrecioNeto"),
                "TotalImpuestos": it.get("TotalImpuestos"),
                "TotalLinea": it.get("Total"),
            }
        )

    return resumen, detalles

# =========================
# PROCESAMIENTO DIARIO (EXTRACCIÓN)
# =========================

def procesar_dia(
    fecha_dt,
    modo_actualizar: bool = False,
    codigo_organismo: str = CODIGO_ORGANISMO,
    ticket: str = TICKET,
    max_workers_detalle: int = MAX_WORKERS_DETALLE,
    espera_entre_detalles: float = ESPERA_ENTRE_DETALLES,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
):
    """
    Descarga las OCs de un día específico para UN organismo y las guarda en DIARIO.

    Nombre de archivo: {codigo_organismo}_{fecha}_RESUMEN.csv / _DETALLES.csv
    Las columnas CodigoOrganismo y NombreOrganismo se insertan en cada fila para
    permitir la consolidación multi-establecimiento en los maestros.

    Retorna True si descargó datos, False si no encontró nada.
    """
    nombre_organismo = RED_SSO.get(codigo_organismo, codigo_organismo)
    fecha_consulta   = fecha_dt.strftime("%d/%m/%Y")
    f_str            = fecha_dt.strftime("%Y%m%d")

    # Prefijo por organismo → trazabilidad en DIARIO/
    ruta_resumen  = CARPETA_DIARIO / f"{codigo_organismo}_{f_str}_RESUMEN.csv"
    ruta_detalles = CARPETA_DIARIO / f"{codigo_organismo}_{f_str}_DETALLES.csv"

    # Cache en disco: si ya existen ambos archivos y no se fuerza actualización, se evita trabajo.
    if (not modo_actualizar) and ruta_resumen.exists() and ruta_detalles.exists():
        print(f"    ✅ [{nombre_organismo}] Ya existe en DIARIO (cache).")
        return True

    # Lógica de Actualización: borrar previo antes de re-descargar
    if modo_actualizar:
        for ruta in (ruta_resumen, ruta_detalles):
            if ruta.exists():
                ruta.unlink()

    print(f"\n>>> EXTRACCIÓN [{nombre_organismo}] ({codigo_organismo}): {fecha_consulta}")

    client    = MercadoPublicoClient(ApiConfig(codigo_organismo=codigo_organismo, ticket=ticket))
    ocs_basicas = client.obtener_listado_dia(fecha_dt)
    if not ocs_basicas:
        print(f"    ⚠ [{nombre_organismo}] Sin datos en API para esta fecha.")
        return False

    db_resumen: List[Dict[str, Any]] = []
    db_detalles: List[Dict[str, Any]] = []

    codigos: List[str] = [str(item.get("Codigo")) for item in ocs_basicas if item.get("Codigo")]
    total = len(codigos)

    def _fetch_one(idx_codigo: Tuple[int, str]) -> Optional[Tuple[Dict[str, Any], List[Dict[str, Any]]]]:
        idx, codigo = idx_codigo
        oc = client.obtener_detalle_oc(codigo)
        time.sleep(espera_entre_detalles)
        if not oc:
            return None
        # Inyectamos CodigoOrganismo y NombreOrganismo en cada fila
        return _extraer_resumen_y_detalles(
            codigo, oc,
            codigo_organismo=codigo_organismo,
            nombre_organismo=nombre_organismo,
        )

    # Concurrencia controlada: acelera drásticamente cuando hay muchas OCs por día.
    with ThreadPoolExecutor(max_workers=max_workers_detalle) as ex:
        future_to_codigo = {ex.submit(_fetch_one, (i, c)): c for i, c in enumerate(codigos, 1)}

        for done_count, fut in enumerate(as_completed(future_to_codigo), 1):
            codigo = future_to_codigo[fut]

            if progress_callback:
                try:
                    progress_callback(codigo, done_count, total)
                except Exception:
                    pass

            if done_count % 10 == 0 or done_count == total:
                print(f"    [{nombre_organismo}] Procesadas {done_count}/{total} OCs", end="\r")

            res = fut.result()
            if not res:
                continue
            resumen, detalles = res
            db_resumen.append(resumen)
            db_detalles.extend(detalles)

    # GUARDADO EN CSV
    if not db_resumen:
        return False

    _write_csv_dicts(ruta_resumen, db_resumen)
    _write_csv_dicts(ruta_detalles, db_detalles)

    print(f"\n✅ [{nombre_organismo}] Guardado en DIARIO: {f_str} ({len(db_resumen)} OCs)")
    return True


def procesar_dia_red_completa(
    fecha_dt,
    modo_actualizar: bool = False,
    ticket: str = TICKET,
    max_workers_detalle: int = MAX_WORKERS_DETALLE,
    espera_entre_detalles: float = ESPERA_ENTRE_DETALLES,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> List[str]:
    """
    Descarga las OCs de un día para TODOS los organismos de RED_SSO en paralelo.

    Cada organismo corre en su propio hilo (MAX_WORKERS_ORGANISMO hilos exteriores),
    y dentro de cada uno se mantiene el ThreadPoolExecutor de detalles.

    Retorna la lista de códigos de organismo que tuvieron datos.
    """
    resultados: Dict[str, bool] = {}

    def _procesar_organismo(codigo: str) -> Tuple[str, bool]:
        hubo = procesar_dia(
            fecha_dt,
            modo_actualizar=modo_actualizar,
            codigo_organismo=codigo,
            ticket=ticket,
            max_workers_detalle=max_workers_detalle,
            espera_entre_detalles=espera_entre_detalles,
            progress_callback=progress_callback,
        )
        return codigo, hubo

    with ThreadPoolExecutor(max_workers=MAX_WORKERS_ORGANISMO) as ex:
        futuros = {ex.submit(_procesar_organismo, cod): cod for cod in RED_SSO}
        for fut in as_completed(futuros):
            codigo, hubo = fut.result()
            resultados[codigo] = hubo

    con_datos = [cod for cod, hubo in resultados.items() if hubo]
    sin_datos = [RED_SSO[cod] for cod, hubo in resultados.items() if not hubo]

    if sin_datos:
        print(f"\n    ⚠ Sin datos para: {', '.join(sin_datos)}")

    return con_datos

# =========================
# INTEGRACIÓN CON DJANGO (BD SERVIDOR)
# =========================

def guardar_en_django(db_resumen, db_detalles):
    """
    Se conecta al entorno Django del proyecto BD_SISTEMA y realiza inserts/updates
    en las tablas api_ordencompra_total y api_detalleordencompra_total.
    """
    import sys, os
    import dateutil.parser

    backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
    if backend_path not in sys.path:
        sys.path.append(backend_path)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

    import django
    from django.apps import apps
    if not apps.ready:
        django.setup()

    from api.models import OrdenCompraTot, DetalleOrdenCompraTot
    from django.utils.timezone import make_aware, is_naive
    from django.db import transaction

    dt_fields = ['FechaCreacion', 'FechaEnvio', 'FechaAceptacion', 'FechaCancelacion', 'FechaUltimaModificacion']
    campos_num_oc  = ['CodigoEstado', 'CantidadEvaluacion', 'PromedioCalificacion', 'TotalNeto', 'PorcentajeIva', 'Impuestos', 'TotalBruto']
    campos_num_det = ['Cantidad', 'PrecioNeto', 'TotalImpuestos', 'TotalLinea']

    def _parsear_fecha(v):
        try:
            val = dateutil.parser.isoparse(v) if (v and str(v).strip() and str(v).lower() != 'none') else None
            return make_aware(val) if val and is_naive(val) else val
        except Exception:
            return None

    def _parsear_num(v):
        if v == '' or v is None or str(v).lower() == 'none':
            return None
        try:
            return float(str(v).replace(',', '.'))
        except ValueError:
            return None

    def _es_nulo(v):
        return v is None or str(v).lower() == 'none'

    # --- Resumen (api_ordencompra_total) ---
    print("    -> Preparando Órdenes de Compra Total para Inserción Masiva...")
    campos_modelo_oc = {f.name for f in OrdenCompraTot._meta.get_fields()}
    ocs_a_crear = []

    for r in db_resumen:
        r_copy = r.copy()
        codigo = r_copy.pop("CodigoOC", None)
        if not codigo:
            continue

        defaults = {}
        for k, v in r_copy.items():
            if k in dt_fields:
                defaults[k] = _parsear_fecha(v)
            elif k in campos_num_oc:
                defaults[k] = _parsear_num(v)
            else:
                defaults[k] = None if _es_nulo(v) else v

        if "ID Proyecto" in defaults:
            defaults["ID_Proyecto"] = defaults.pop("ID Proyecto")

        dict_limpio = {k: v for k, v in defaults.items() if k in campos_modelo_oc}
        dict_limpio['codigo_oc'] = codigo
        ocs_a_crear.append(OrdenCompraTot(**dict_limpio))

    print(f"    -> Vaciando api_ordencompra_total y api_detalleordencompra_total...")
    with transaction.atomic():
        DetalleOrdenCompraTot.objects.all().delete()
        OrdenCompraTot.objects.all().delete()

        print(f"    -> Insertando {len(ocs_a_crear)} Órdenes de Compra en BD...")
        OrdenCompraTot.objects.bulk_create(ocs_a_crear, batch_size=500)

    # --- Detalles (api_detalleordencompra_total) ---
    print("    -> Preparando Detalles para Inserción Masiva...")
    campos_modelo_det = {f.name for f in DetalleOrdenCompraTot._meta.get_fields()}
    detalles_a_crear = []
    codigos_validos  = {oc.codigo_oc for oc in ocs_a_crear}

    for d in db_detalles:
        d_copy = d.copy()
        codigo_oc = d_copy.pop("CodigoOC", None)
        if not codigo_oc or codigo_oc not in codigos_validos:
            continue

        correlativo = d_copy.pop("Correlativo", None)
        if correlativo is None or str(correlativo).lower() == 'none':
            correlativo = d_copy.get("CodigoProducto") or 0

        defaults_det = {}
        for k, v in d_copy.items():
            if k in campos_num_det:
                defaults_det[k] = _parsear_num(v)
            else:
                defaults_det[k] = None if _es_nulo(v) else v

        dict_limpio_det = {k: v for k, v in defaults_det.items() if k in campos_modelo_det}
        dict_limpio_det['orden_compra_id'] = codigo_oc
        dict_limpio_det['Correlativo']     = correlativo
        detalles_a_crear.append(DetalleOrdenCompraTot(**dict_limpio_det))

    print(f"    -> Insertando {len(detalles_a_crear)} Detalles en BD...")
    with transaction.atomic():
        DetalleOrdenCompraTot.objects.bulk_create(detalles_a_crear, batch_size=500)

    return len(ocs_a_crear), len(detalles_a_crear)

# =======================================================
# NUEVAS FUNCIONES: UNIFICACIÓN Y REFRESH (PANDAS)
# =======================================================

def unificar_base_datos():
    """
    5) Lee todos los CSVs de la carpeta DIARIO (todos los organismos de la Red)
    y crea/sobreescribe los archivos Maestros consolidados en MAESTROS/.

    Todos los archivos diarios ya incluyen CodigoOrganismo y NombreOrganismo,
    por lo que la concatenación es directa sin necesidad de identificación extra.
    """
    print("\n🔄 INICIANDO UNIFICACIÓN DE BASE DE DATOS - RED SSO COMPLETA...")

    # --- PROCESAR RESUMEN ---
    print("   -> Buscando archivos de Resumen en DIARIO...")
    archivos_res = list(CARPETA_DIARIO.glob("*_RESUMEN.csv"))

    if archivos_res:
        # Nota: si la carpeta DIARIO crece mucho, esta concatenación puede consumir RAM.
        # Para grandes volúmenes, conviene migrar a un almacenamiento incremental (SQLite/Parquet).
        df_res = pd.concat(
            [pd.read_csv(f, sep=";", encoding="utf-8-sig", dtype=str) for f in archivos_res],
            ignore_index=True,
        )

        df_res.drop_duplicates(subset=["CodigoOC"], keep="last", inplace=True)

        df_res["LinkMP"] = df_res["CodigoOC"].apply(generar_link_mp)
        df_res = _enriquecer_df_oc(df_res)

        ruta_m_res = CARPETA_MAESTROS / NOMBRE_MAESTRO_RESUMEN
        df_res.to_csv(ruta_m_res, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Resumen creado: {len(df_res)} registros.")
        if "NombreOrganismo" in df_res.columns:
            print(f"   📊 OCs por Establecimiento:\n{df_res['NombreOrganismo'].value_counts().to_string()}")

    else:
        print("   ⚠️ No se encontraron archivos de Resumen en DIARIO.")

    # --- PROCESAR DETALLES ---
    print("   -> Buscando archivos de Detalles en DIARIO...")
    archivos_det = list(CARPETA_DIARIO.glob("*_DETALLES.csv"))

    if archivos_det:
        df_det = pd.concat(
            [pd.read_csv(f, sep=";", encoding="utf-8-sig", dtype=str) for f in archivos_det],
            ignore_index=True,
        )

        df_det.drop_duplicates(subset=["CodigoOC", "Correlativo"], keep="last", inplace=True)

        ruta_m_det = CARPETA_MAESTROS / NOMBRE_MAESTRO_DETALLE
        df_det.to_csv(ruta_m_det, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Detalle creado: {len(df_det)} registros.")

    else:
        print("   ⚠️ No se encontraron archivos de Detalles en DIARIO.")

    enlazar_con_pac()

def refresh_base_datos(
    f_ini,
    f_fin,
    ticket: str = TICKET,
    max_workers_detalle: int = MAX_WORKERS_DETALLE,
    espera_entre_detalles: float = ESPERA_ENTRE_DETALLES,
    progress_callback: Optional[Callable[[dt.date, str, int, int], None]] = None,
):
    """
    6) Descarga el rango para TODA la Red SSO en paralelo, luego integra
    los nuevos diarios a los maestros consolidados (Upsert) y guarda.

    Para cada fecha se lanzan los 6 organismos simultáneamente.
    Los maestros resultantes son OC_TOTAL_Maestro_Resumen.csv y
    OC_TOTAL_Maestro_Detalle.csv.
    """
    print(f"\n🚀 INICIANDO REFRESH RED COMPLETA SSO ({f_ini} al {f_fin})")
    print(f"   Organismos: {', '.join(RED_SSO.values())}\n")

    # 1. DESCARGA MASIVA A DIARIO (todos los organismos, día a día)
    d_actual = f_ini
    # dias_con_datos: set de (codigo_organismo, fecha) que tuvieron registros
    pares_con_datos: List[Tuple[str, dt.date]] = []

    while d_actual <= f_fin:
        print(f"\n📅 Procesando fecha: {d_actual.strftime('%d/%m/%Y')}")

        def _cb_oc(codigo: str, done: int, total: int) -> None:
            if progress_callback:
                progress_callback(d_actual, codigo, done, total)

        codigos_con_datos = procesar_dia_red_completa(
            d_actual,
            modo_actualizar=True,
            ticket=ticket,
            max_workers_detalle=max_workers_detalle,
            espera_entre_detalles=espera_entre_detalles,
            progress_callback=_cb_oc,
        )
        for cod in codigos_con_datos:
            pares_con_datos.append((cod, d_actual))

        d_actual += dt.timedelta(days=1)

    if not pares_con_datos:
        print("\n⚠️ No se encontraron nuevos datos en el rango seleccionado. Los Maestros no se tocarán.")
        return

    print("\n🔄 INTEGRANDO NUEVOS DATOS A LOS MAESTROS (UPSERT)...")

    # Rutas Maestros
    ruta_m_res = CARPETA_MAESTROS / NOMBRE_MAESTRO_RESUMEN
    ruta_m_det = CARPETA_MAESTROS / NOMBRE_MAESTRO_DETALLE

    # --- ACTUALIZAR RESUMEN ---
    df_master_res = pd.read_csv(ruta_m_res, sep=";", encoding="utf-8-sig", dtype=str) \
        if ruta_m_res.exists() else pd.DataFrame()

    # Construir lista de archivos diarios descargados (por organismo + fecha)
    archivos_nuevos_res = [
        CARPETA_DIARIO / f"{cod}_{fecha.strftime('%Y%m%d')}_RESUMEN.csv"
        for cod, fecha in pares_con_datos
    ]
    frames_res = [
        pd.read_csv(f, sep=";", encoding="utf-8-sig", dtype=str)
        for f in archivos_nuevos_res if f.exists()
    ]

    if frames_res:
        df_nuevos_res = pd.concat(frames_res, ignore_index=True)
        df_final_res  = pd.concat([df_master_res, df_nuevos_res])
        df_final_res.drop_duplicates(subset=["CodigoOC"], keep="last", inplace=True)

        df_final_res["LinkMP"] = df_final_res["CodigoOC"].apply(generar_link_mp)
        df_final_res = _enriquecer_df_oc(df_final_res)

        df_final_res.to_csv(ruta_m_res, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Resumen actualizado. Total registros: {len(df_final_res)}")
        if "NombreOrganismo" in df_final_res.columns:
            print(f"   📊 OCs por Establecimiento:\n{df_final_res['NombreOrganismo'].value_counts().to_string()}")

    # --- ACTUALIZAR DETALLES ---
    df_master_det = pd.read_csv(ruta_m_det, sep=";", encoding="utf-8-sig", dtype=str) \
        if ruta_m_det.exists() else pd.DataFrame()

    archivos_nuevos_det = [
        CARPETA_DIARIO / f"{cod}_{fecha.strftime('%Y%m%d')}_DETALLES.csv"
        for cod, fecha in pares_con_datos
    ]
    frames_det = [
        pd.read_csv(f, sep=";", encoding="utf-8-sig", dtype=str)
        for f in archivos_nuevos_det if f.exists()
    ]

    if frames_det:
        df_nuevos_det = pd.concat(frames_det, ignore_index=True)

        # ESTRATEGIA SEGURA: si una OC cambió, reemplazamos TODOS sus ítems.
        ocs_actualizadas = df_nuevos_det["CodigoOC"].unique()
        if not df_master_det.empty:
            df_master_det = df_master_det[~df_master_det["CodigoOC"].isin(ocs_actualizadas)]

        df_final_det = pd.concat([df_master_det, df_nuevos_det])
        df_final_det.to_csv(ruta_m_det, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Detalle actualizado. Total registros: {len(df_final_det)}")

    enlazar_con_pac()
    print("\n✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.")

def enlazar_con_pac():
    """
    7) Lee OC_TOTAL_Maestro_Resumen.csv y OCPAC_Maestro.csv.
    Añade columnas EnlacePAC e ID Proyecto guiándose por OC Asociada PAC.
    Opera sobre el maestro consolidado de toda la Red SSO.
    """
    print("\n🔗 INICIANDO ENLACE CON PLAN ANUAL DE COMPRAS (PAC)...")
    ruta_m_res = CARPETA_MAESTROS / NOMBRE_MAESTRO_RESUMEN
    ruta_pac   = RUTA_API / "data" / "data_pac" / "OCPAC_Maestro.csv"

    if not ruta_m_res.exists():
        print(f"   ⚠️ No se encontró {NOMBRE_MAESTRO_RESUMEN} en MAESTROS.")
        return

    if not ruta_pac.exists():
        print(f"   ⚠️ No se encontró OCPAC_Maestro.csv en {ruta_pac}.")
        return

    print(f"   -> Cargando {NOMBRE_MAESTRO_RESUMEN}...")
    df_res = pd.read_csv(ruta_m_res, sep=";", encoding="utf-8-sig", dtype=str)
    
    print("   -> Cargando OCPAC_Maestro.csv...")
    try:
        try:
            df_pac = pd.read_csv(ruta_pac, sep=";", encoding="utf-8-sig", dtype=str)
            if "OC Asociada PAC" not in df_pac.columns or "ID Proyecto" not in df_pac.columns:
                raise ValueError("Falló delimitador ;")
        except:
            df_pac = pd.read_csv(ruta_pac, sep=",", encoding="utf-8-sig", dtype=str)
            if "OC Asociada PAC" not in df_pac.columns or "ID Proyecto" not in df_pac.columns:
                print("   ⚠️ OCPAC_Maestro.csv no tiene las columnas 'ID Proyecto' o 'OC Asociada PAC'.")
                return
    except Exception as e:
        print(f"   ⚠️ Error al leer OCPAC_Maestro.csv: {e}")
        return

    # Limpiar columnas previas si existían en el Maestro para que no haya duplicación
    columnas_a_borrar = [col for col in ["EnlacePAC", "ID Proyecto"] if col in df_res.columns]
    if columnas_a_borrar:
        df_res.drop(columns=columnas_a_borrar, inplace=True)

    # Dejamos solo valores únicos de OC en PAC para evitar multiplicar filas en Resumen
    df_pac_reducido = df_pac[["OC Asociada PAC", "ID Proyecto"]].dropna(subset=["OC Asociada PAC"])
    df_pac_reducido = df_pac_reducido[df_pac_reducido["OC Asociada PAC"].str.strip() != ""]
    df_pac_reducido.drop_duplicates(subset=["OC Asociada PAC"], keep="first", inplace=True)
    
    print("   -> Cruzando datos...")
    df_merged = df_res.merge(
        df_pac_reducido,
        left_on="CodigoOC",
        right_on="OC Asociada PAC",
        how="left"
    )

    # Asignar Enlazada / No Enlazada
    df_merged["EnlacePAC"] = df_merged["OC Asociada PAC"].apply(
        lambda x: "Enlazada" if pd.notnull(x) and str(x).strip() != "" else "No Enlazada"
    )
    
    df_merged.drop(columns=["OC Asociada PAC"], inplace=True)

    if "LinkMP" not in df_merged.columns:
        df_merged["LinkMP"] = df_merged["CodigoOC"].apply(generar_link_mp)

    print(f"   -> Guardando {NOMBRE_MAESTRO_RESUMEN}...")
    df_merged.to_csv(ruta_m_res, sep=";", index=False, encoding="utf-8-sig")
    print(f"   ✅ Archivo actualizado exitosamente con {len(df_merged)} registros.")
    print(f"   📊 Resumen Enlace PAC:\n{df_merged['EnlacePAC'].value_counts().to_string()}")

def buscar_compra_agil():
    """
    9) Extrae CodigoCompraAgil y calcula TipoCompraInterna sobre el Maestro Resumen existente.
    Útil para enriquecer datos de toda la Red sin necesidad de re-descargar.
    """
    ruta_m_res = CARPETA_MAESTROS / NOMBRE_MAESTRO_RESUMEN

    if not ruta_m_res.exists():
        print(f"   ❌ No existe {NOMBRE_MAESTRO_RESUMEN}. Ejecute Unificar (5) o Refresh (6) primero.")
        return

    print("\n🔍 EXTRAYENDO CÓDIGOS COMPRA ÁGIL Y CLASIFICANDO TIPOS DE COMPRA (RED COMPLETA)...")
    df = pd.read_csv(ruta_m_res, sep=";", encoding="utf-8-sig", dtype=str)
    df = _enriquecer_df_oc(df)
    df.to_csv(ruta_m_res, sep=";", index=False, encoding="utf-8-sig")

    total_ag   = int((df.get("TipoOC", pd.Series(dtype=str)).str.upper() == "AG").sum())
    con_codigo = int(df["CodigoCompraAgil"].notna().sum()) if "CodigoCompraAgil" in df.columns else 0
    print(f"   ✅ Proceso completado sobre {len(df)} registros.")
    print(f"   📊 OCs Compra Ágil (AG): {total_ag} | Con código extraído: {con_codigo}")
    if "TipoCompraInterna" in df.columns:
        print(f"   📊 TipoCompraInterna:\n{df['TipoCompraInterna'].value_counts().to_string()}")


def subir_maestros_a_django():
    """
    8) Lee los archivos CSV Maestro (Resumen y Detalle) completos de la Red SSO
    y envía todo el volumen a la Base de Datos MariaDB mediante el ORM de Django (Upsert).
    """
    ruta_m_res = CARPETA_MAESTROS / NOMBRE_MAESTRO_RESUMEN
    ruta_m_det = CARPETA_MAESTROS / NOMBRE_MAESTRO_DETALLE

    if not ruta_m_res.exists() or not ruta_m_det.exists():
        print("   ❌ No existen los archivos Maestro (Resumen/Detalle). Ejecute la Opción 5 primero.")
        return

    print("\n🚀 CARGANDO CSVs MAESTROS PARA SINCRONIZACIÓN MASIVA A DJANGO (RED COMPLETA)...")
    df_res = pd.read_csv(ruta_m_res, sep=";", encoding="utf-8-sig", dtype=str)
    df_det = pd.read_csv(ruta_m_det, sep=";", encoding="utf-8-sig", dtype=str)

    # Limpiar nulos de pandas ("nan", float('nan')) para que no den problemas en JSON/Dicts
    df_res = df_res.replace({np.nan: None})
    df_det = df_det.replace({np.nan: None})

    datos_res = df_res.to_dict("records")
    datos_det = df_det.to_dict("records")

    print(f"   -> Subiendo {len(datos_res)} Órdenes de Compra y {len(datos_det)} Detalles a la Base de Datos...")
    try:
        count_oc, count_det = guardar_en_django(datos_res, datos_det)
        print("   ✅ Sincronización masiva finalizada exitosamente.")
        print(f"   📊 TOTAL EN BD: {count_oc} Órdenes de Compra (Resumen) y {count_det} Detalles.")
    except Exception as e:
        print(f"   ❌ Error en la sincronización masiva: {e}")

# =========================
# MENÚ PRINCIPAL
# =========================

if __name__ == "__main__":
    while True:
        print("\n=========================================")
        print("   EXTRACTOR RED SSO - GESTIÓN TOTAL")
        print("=========================================")
        organismos = " | ".join(f"{c}: {n.split()[1] if len(n.split()) > 1 else n}" for c, n in RED_SSO.items())
        print(f"   Red: {len(RED_SSO)} organismos")
        print(f"   Carpeta: OC_TOTAL_DSSO/")
        print("── Descarga (TODOS los organismos en paralelo) ──")
        print("1) Hoy                (descarga hoy a DIARIO)")
        print("2) Día manual         (un día a DIARIO)")
        print("3) Rango sin forzar   (solo descarga lo nuevo a DIARIO)")
        print("── Maestros ──────────────────────────────────────")
        print("5) UNIFICAR           (DIARIO → Maestros + PAC)")
        print("6) REFRESH            (Descarga rango + Maestros + PAC)  ← uso habitual")
        print("── Sincronización ────────────────────────────────")
        print("8) SINCRONIZAR A BD   (Sube CSV Maestros a MariaDB/Django)")
        print("── Reparación manual ─────────────────────────────")
        print("7) Enlace PAC         (re-enlazar si cambió el archivo PAC)")
        print("9) Compra Ágil        (re-clasificar tipos sin re-descargar)")
        print("─────────────────────────────────────────────────")
        print("0) Salir")

        op = input("\nSeleccione opción: ")

        try:
            if op == "0":
                break

            elif op == "1":
                procesar_dia_red_completa(dt.date.today(), modo_actualizar=True)

            elif op == "2":
                f_in = input("Fecha (dd-mm-aaaa): ")
                try:
                    fecha_valida = dt.datetime.strptime(f_in, "%d-%m-%Y").date()
                    procesar_dia_red_completa(fecha_valida, modo_actualizar=True)
                except ValueError:
                    print("⚠️ Formato de fecha inválido. Utilice dd-mm-aaaa")

            elif op == "3":
                ini = input("Desde (dd-mm-aaaa): ")
                fin = input("Hasta (dd-mm-aaaa): ")
                try:
                    d1 = dt.datetime.strptime(ini, "%d-%m-%Y").date()
                    d2 = dt.datetime.strptime(fin, "%d-%m-%Y").date()
                except ValueError:
                    print("⚠️ Formato de fecha inválido. Utilice dd-mm-aaaa")
                    continue
                while d1 <= d2:
                    procesar_dia_red_completa(d1, modo_actualizar=False)
                    d1 += dt.timedelta(days=1)

            elif op == "5":
                unificar_base_datos()

            elif op == "6":
                ini = input("Desde (dd-mm-aaaa): ")
                fin = input("Hasta (dd-mm-aaaa): ")
                try:
                    d_ini = dt.datetime.strptime(ini, "%d-%m-%Y").date()
                    d_fin = dt.datetime.strptime(fin, "%d-%m-%Y").date()
                except ValueError:
                    print("⚠️ Formato de fecha inválido. Utilice dd-mm-aaaa")
                    continue
                refresh_base_datos(d_ini, d_fin)

            elif op == "7":
                enlazar_con_pac()

            elif op == "8":
                subir_maestros_a_django()

            elif op == "9":
                buscar_compra_agil()

        except KeyboardInterrupt:
            print("\n⚠️ Proceso cancelado por el usuario (Ctrl+C). Retornando al menú...")
        except Exception as e:
            print(f"\n❌ Error: {e}")