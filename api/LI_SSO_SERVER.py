import csv
import datetime as dt
import json
import pathlib
import ssl
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

import pandas as pd

# =========================
# CONFIGURACIÓN FIJA SSO (LICITACIONES)
# =========================
CODIGO_ORGANISMO = "7296"
TICKET = "2798F2D3-0AC5-4323-9BB9-5E90618194BA"

# RUTAS
RUTA_API = pathlib.Path(__file__).parent.absolute()
CARPETA_BASE = RUTA_API / "LI_DSSO"
CARPETA_DIARIO = CARPETA_BASE / "DIARIO"
CARPETA_MAESTROS = CARPETA_BASE / "MAESTROS"

# Aseguramos que existan las carpetas
CARPETA_DIARIO.mkdir(parents=True, exist_ok=True)
CARPETA_MAESTROS.mkdir(parents=True, exist_ok=True)

# Configuración de rendimiento
MAX_REINTENTOS = 5
ESPERA_ENTRE_INTENTOS = 4.0
MAX_WORKERS_DETALLE = 6  # Concurrencia controlada
ESPERA_ENTRE_DETALLES = 0.05  # Throttle suave

URL_LICITACIONES = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"

# Tablas de decodificación (fuente: anexos API Mercado Público — Licitaciones)
_TIPO_LIC_DESC: Dict[str, str] = {
    "L1": "Licitación Pública Menor a 100 UTM",
    "LE": "Licitación Pública Entre 100 y 1000 UTM",
    "LP": "Licitación Pública Mayor a 1000 UTM",
    "LS": "Servicios personales especializados",
    "A1": "Privada por licitación pública sin oferentes",
    "B1": "Privada por otras causales",
    "J1": "Servicios de naturaleza confidencial",
    "F1": "Convenios con personas jurídicas extranjeras",
    "E1": "Remanente de contrato anterior",
    "CO": "Privada entre 100 y 1000 UTM",
    "B2": "Privada mayor a 1000 UTM",
    "A2": "Trato directo por licitación privada desierta",
    "D1": "Trato directo por proveedor único",
    "E2": "Privada menor a 100 UTM",
    "C2": "Trato directo (Cotización)",
    "C1": "Compra Directa (Orden de compra)",
    "F2": "Trato Directo (Cotización)",
    "F3": "Compra Directa (Orden de compra)",
    "G2": "Directo (Cotización)",
    "G1": "Compra Directa (Orden de compra)",
    "R1": "Orden de Compra menor a 3 UTM",
    "CA": "Orden de Compra sin Resolución",
    "SE": "Orden de Compra sin emisión automática",
}

_MONEDA_DESC: Dict[str, str] = {
    "CLP": "Peso Chileno",
    "CLF": "Unidad de Fomento",
    "USD": "Dólar Americano",
    "UTM": "Unidad Tributaria Mensual",
    "EUR": "Euro",
}

_ESTIMACION_DESC: Dict[str, str] = {
    "1": "Presupuesto Disponible",
    "2": "Precio Referencial",
}

_TIPO_PAGO_LI_DESC: Dict[str, str] = {
    "1":  "Pago a 30 días",
    "2":  "Pago a 30, 60 y 90 días",
    "3":  "Pago al día",
    "4":  "Pago Anual",
    "5":  "Pago a 60 días",
    "6":  "Pagos Mensuales",
    "7":  "Pago Contra Entrega Conforme",
    "8":  "Pago Bimensual",
    "9":  "Pago Por Estado de Avance",
    "10": "Pago Trimestral",
}

_UNIDAD_TIEMPO_DESC: Dict[str, str] = {
    "1": "Horas",
    "2": "Días",
    "3": "Semanas",
    "4": "Meses",
    "5": "Años",
}

_ADJ_TIPO_DESC: Dict[str, str] = {
    "1": "Autorización",
    "2": "Resolución",
    "3": "Otros",
    "4": "Decreto",
    "5": "Acuerdo",
}

_TIPO_CONVOCATORIA_DESC: Dict[str, str] = {
    "1": "Pública",
    "2": "Privada",
}

# =========================
# CLASES DE CONFIGURACIÓN
# =========================

@dataclass(frozen=True)
class ApiConfig:
    """Configuración de acceso a API y resiliencia."""
    codigo_organismo: str
    ticket: str
    max_reintentos: int = MAX_REINTENTOS
    espera_base: float = ESPERA_ENTRE_INTENTOS
    timeout: int = 30
    url_licitaciones: str = URL_LICITACIONES


class MercadoPublicoLicitacionesClient:
    """Cliente optimizado para la API de Licitaciones con backoff y manejo de errores."""

    def __init__(self, cfg: ApiConfig):
        self.cfg = cfg
        self._ctx = ssl._create_unverified_context()

    def get_json(self, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Realiza petición GET con reintentos y backoff."""
        url_completa = self.cfg.url_licitaciones + "?" + urllib.parse.urlencode(params)
        last_err: Optional[Exception] = None

        for intento in range(1, self.cfg.max_reintentos + 1):
            try:
                with urllib.request.urlopen(url_completa, context=self._ctx, timeout=self.cfg.timeout) as resp:
                    return json.load(resp)
            except Exception as e:
                last_err = e
                # Backoff lineal
                time.sleep(self.cfg.espera_base * intento)

        print(f"⚠️  API sin respuesta tras {self.cfg.max_reintentos} intentos: {last_err}")
        return None

    def obtener_listado_dia(self, fecha_dt: dt.date) -> List[Dict[str, Any]]:
        """Obtiene el listado básico de licitaciones de un día."""
        params = {
            "fecha": fecha_dt.strftime("%d%m%Y"),
            "CodigoOrganismo": self.cfg.codigo_organismo,
            "ticket": self.cfg.ticket,
        }
        data = self.get_json(params)
        if not data or not data.get("Listado"):
            return []
        return data["Listado"]

    def obtener_detalle_licitacion(self, codigo_externo: str) -> Optional[Dict[str, Any]]:
        """Obtiene el detalle completo de una licitación."""
        params = {"codigo": codigo_externo, "ticket": self.cfg.ticket}
        data = self.get_json(params)
        return data["Listado"][0] if data and data.get("Listado") else None


# =========================
# FUNCIONES AUXILIARES
# =========================

def limpiar(texto):
    """Limpia texto para CSV."""
    if texto is None:
        return ""
    return str(texto).replace("\n", " ").replace(";", ",").replace("\r", " ").strip()


def to_float(val):
    """Convierte valor a float de forma segura."""
    try:
        return float(val)
    except:
        return 0.0


def _write_csv_dicts(path: pathlib.Path, rows: List[Dict[str, Any]], delimiter: str = ";") -> None:
    """Escritura CSV consistente y rápida para lista de dicts."""
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8-sig") as csvfile:
        w = csv.DictWriter(csvfile, fieldnames=rows[0].keys(), delimiter=delimiter)
        w.writeheader()
        w.writerows(rows)


def _extraer_resumen_y_detalles(codigo: str, lic: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Normaliza un JSON de licitación en fila resumen + filas detalle."""
    comp = lic.get("Comprador") or {}
    fech = lic.get("Fechas") or {}
    adj_global = lic.get("Adjudicacion") or {}

    # TABLA 1: RESUMEN
    resumen = {
        # Identificación
        "CodigoLicitacion": codigo,
        "Numero": lic.get("Numero"),  # A veces viene o es útil
        "Nombre": limpiar(lic.get("Nombre")),
        "CodigoEstado": lic.get("CodigoEstado"),
        "Estado": lic.get("Estado"),
        "Descripcion": limpiar(lic.get("Descripcion")),
        
        # Clasificación y Tipo
        "Tipo": lic.get("Tipo"),
        "CodigoTipo": lic.get("CodigoTipo"),
        "TipoConvocatoria": lic.get("TipoConvocatoria"),
        "Moneda": lic.get("Moneda"),
        "Etapas": lic.get("Etapas"),
        "EstadoEtapas": lic.get("EstadoEtapas"),
        
        # Comprador
        "C_CodigoOrganismo": comp.get("CodigoOrganismo"),
        "C_NombreOrganismo": comp.get("NombreOrganismo"), 
        "C_RutUnidad": comp.get("RutUnidad"),
        "C_CodigoUnidad": comp.get("CodigoUnidad"),
        "C_Unidad": comp.get("NombreUnidad"),
        "C_DireccionUnidad": limpiar(comp.get("DireccionUnidad")),
        "C_ComunaUnidad": comp.get("ComunaUnidad"),
        "C_RegionUnidad": comp.get("RegionUnidad"),
        "C_RutUsuario": comp.get("RutUsuario"),
        "C_CodigoUsuario": comp.get("CodigoUsuario"),
        "C_Usuario": comp.get("NombreUsuario"),
        "C_Cargo": comp.get("CargoUsuario"),

        # Fechas
        "FechaCreacion": fech.get("FechaCreacion"),
        "FechaCierre": fech.get("FechaCierre"),
        "FechaInicio": fech.get("FechaInicio"),
        "FechaFinal": fech.get("FechaFinal"),
        "FechaPubRespuestas": fech.get("FechaPubRespuestas"),
        "FechaActoAperturaTecnica": fech.get("FechaActoAperturaTecnica"),
        "FechaActoAperturaEconomica": fech.get("FechaActoAperturaEconomica"),
        "FechaPublicacion": fech.get("FechaPublicacion"),
        "FechaAdjudicacion": fech.get("FechaAdjudicacion"),
        "FechaEstimadaAdjudicacion": fech.get("FechaEstimadaAdjudicacion"),
        "FechaSoporteFisico": fech.get("FechaSoporteFisico"),
        "FechaTiempoEvaluacion": fech.get("FechaTiempoEvaluacion"),
        "FechaEstimadaFirma": fech.get("FechaEstimadaFirma"),
        "FechaVisitaTerreno": fech.get("FechaVisitaTerreno"),
        "FechaEntregaAntecedentes": fech.get("FechaEntregaAntecedentes"),
        
        # Fechas legacy (mantener compatibilidad si se usa 'FechaInicioContrato')
        # En la versión anterior 'FechaInicioContrato' mapeaba a fech.get("FechaInicio")
        "FechaInicioContrato": fech.get("FechaInicio"),

        # Detalles del Proceso
        "DiasCierreLicitacion": lic.get("DiasCierreLicitacion"),
        "Informada": lic.get("Informada"),
        "TomaRazon": lic.get("TomaRazon"),
        "EstadoPublicidadOfertas": lic.get("EstadoPublicidadOfertas"),
        "JustificacionPublicidad": limpiar(lic.get("JustificacionPublicidad")),
        "Contrato": lic.get("Contrato"),
        "Obras": lic.get("Obras"),
        "CantidadReclamos": lic.get("CantidadReclamos"),
        
        # Montos y Tiempos
        "UnidadTiempoEvaluacion": lic.get("UnidadTiempoEvaluacion"),
        "DireccionVisita": limpiar(lic.get("DireccionVisita")),
        "DireccionEntrega": limpiar(lic.get("DireccionEntrega")),
        "Estimacion": lic.get("Estimacion"),
        "FuenteFinanciamiento": lic.get("FuenteFinanciamiento"),
        "VisibilidadMonto": lic.get("VisibilidadMonto"),
        "MontoEstimado": to_float(lic.get("MontoEstimado")),
        "JustificacionMonto": limpiar(lic.get("JustificacionMontoEstimado")),
        "Tiempo": lic.get("Tiempo"),
        "UnidadTiempo": lic.get("UnidadTiempo"),
        "Modalidad": lic.get("Modalidad"),
        "TipoPago": lic.get("TipoPago"),

        # Responsables
        "Resp_Pago": lic.get("NombreResponsablePago"),
        "Resp_Email_Pago": lic.get("EmailResponsablePago"),
        "Resp_Contrato": lic.get("NombreResponsableContrato"),
        "Resp_Email": lic.get("EmailResponsableContrato"),
        "Resp_Fono": lic.get("FonoResponsableContrato"),

        # Condiciones Contratación
        "ProhibicionContratacion": lic.get("ProhibicionContratacion"),
        "SubContratacion": lic.get("SubContratacion"),
        "UnidadTiempoDuracion": lic.get("UnidadTiempoDuracionContrato"),
        "TiempoDuracionContrato": lic.get("TiempoDuracionContrato"),
        "TipoDuracionContrato": lic.get("TipoDuracionContrato"),
        "ObservacionContract": limpiar(lic.get("ObservacionContract")),
        "ExtensionPlazo": lic.get("ExtensionPlazo"),
        "EsBaseTipo": lic.get("EsBaseTipo"),
        "UnidadTiempoContratoLicitacion": lic.get("UnidadTiempoContratoLicitacion"),
        "ValorTiempoRenovacion": lic.get("ValorTiempoRenovacion"),
        "PeriodoTiempoRenovacion": lic.get("PeriodoTiempoRenovacion"),
        "EsRenovable": lic.get("EsRenovable"),
        "CodigoBIP": lic.get("CodigoBIP"),

        # Adjudicación Global
        "Adj_Tipo": adj_global.get("Tipo"),
        "Adj_Fecha": adj_global.get("Fecha"),
        "Adj_Numero": adj_global.get("Numero"),
        "Adj_NumeroOferentes": adj_global.get("NumeroOferentes"),
        "Adj_UrlActa": adj_global.get("UrlActa"),
    }

    # TABLA 2: DETALLES
    detalles: List[Dict[str, Any]] = []
    obj_items = lic.get("Items") or {}
    items_list = obj_items.get("Listado") or []
    if not isinstance(items_list, list):
        items_list = []

    for it in items_list:
        adj = it.get("Adjudicacion") or {}
        detalles.append({
            "CodigoLicitacion": codigo,
            "Correlativo": it.get("Correlativo"),
            "CodigoProducto": it.get("CodigoProducto"),
            "CodigoCategoria": it.get("CodigoCategoria"),
            "Categoria": it.get("Categoria"),
            "NombreProducto": limpiar(it.get("NombreProducto")),
            "DescripcionItem": limpiar(it.get("Descripcion")),
            "UnidadMedida": it.get("UnidadMedida"),
            "Cantidad": it.get("Cantidad"),
            "RutGanador": adj.get("RutProveedor", ""),
            "NombreGanador": adj.get("NombreProveedor", ""),
            "MontoUnitarioGanador": to_float(adj.get("MontoUnitario")),
            "CantidadAdjudicada": to_float(adj.get("Cantidad"))
        })

    return resumen, detalles


def _enriquecer_df_lic(df: pd.DataFrame) -> pd.DataFrame:
    """Añade/recalcula columnas descriptivas sobre el DataFrame maestro de licitaciones."""
    _cols_recalc = [
        "DescripcionTipoLicitacion", "DescripcionMoneda", "DescripcionEstimacion",
        "DescripcionTipoPago", "DescripcionUnidadTiempoEval", "DescripcionUnidadTiempoDuracion",
        "DescripcionAdjTipo", "DescripcionTipoConvocatoria",
        "Informada_Desc", "TomaRazon_Desc", "Contrato_Desc", "Obras_Desc",
        "VisibilidadMonto_Desc", "SubContratacion_Desc", "ExtensionPlazo_Desc",
        "EsBaseTipo_Desc", "EsRenovable_Desc",
    ]
    for col in _cols_recalc:
        if col in df.columns:
            df.drop(columns=[col], inplace=True)

    def _decode(col: str, tabla: Dict[str, str], upper: bool = True) -> pd.Series:
        if col not in df.columns:
            return pd.Series("", index=df.index)
        if upper:
            return df[col].apply(lambda x: tabla.get(str(x or "").strip().upper(), ""))
        return df[col].apply(lambda x: tabla.get(str(x or "").strip(), ""))

    df["DescripcionTipoLicitacion"]       = _decode("Tipo",                  _TIPO_LIC_DESC)
    df["DescripcionMoneda"]               = _decode("Moneda",                _MONEDA_DESC)
    df["DescripcionTipoConvocatoria"]     = _decode("TipoConvocatoria",      _TIPO_CONVOCATORIA_DESC, upper=False)
    df["DescripcionEstimacion"]           = _decode("Estimacion",            _ESTIMACION_DESC,        upper=False)
    df["DescripcionTipoPago"]             = _decode("TipoPago",              _TIPO_PAGO_LI_DESC,      upper=False)
    df["DescripcionUnidadTiempoEval"]     = _decode("UnidadTiempoEvaluacion",_UNIDAD_TIEMPO_DESC,     upper=False)
    df["DescripcionUnidadTiempoDuracion"] = _decode("UnidadTiempoDuracion",  _UNIDAD_TIEMPO_DESC,     upper=False)
    df["DescripcionAdjTipo"]              = _decode("Adj_Tipo",              _ADJ_TIPO_DESC,          upper=False)

    # Campos binarios — 0/1 → No/Sí (excepción: Obras usa 1=No / 2=Sí)
    _SINO      = {"1": "Sí", "0": "No"}
    _SINO_OBRAS = {"2": "Sí", "1": "No"}

    for campo, tabla in [
        ("Informada",        _SINO),
        ("TomaRazon",        _SINO),
        ("Contrato",         _SINO),
        ("Obras",            _SINO_OBRAS),
        ("VisibilidadMonto", _SINO),
        ("SubContratacion",  _SINO),
        ("ExtensionPlazo",   _SINO),
        ("EsBaseTipo",       _SINO),
        ("EsRenovable",      _SINO),
    ]:
        col_desc = f"{campo}_Desc"
        if campo in df.columns:
            df[col_desc] = df[campo].apply(lambda x, t=tabla: t.get(str(x or "").strip(), ""))
        else:
            df[col_desc] = ""

    return df


# =========================
# PROCESAMIENTO DIARIO (EXTRACCIÓN)
# =========================

def procesar_dia(
    fecha_dt,
    modo_actualizar=False,
    codigo_organismo: str = CODIGO_ORGANISMO,
    ticket: str = TICKET,
    max_workers_detalle: int = MAX_WORKERS_DETALLE,
    espera_entre_detalles: float = ESPERA_ENTRE_DETALLES,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
):
    """
    Descarga licitaciones de un día específico y las guarda en la carpeta DIARIO.
    Retorna True si descargó datos, False si no encontró nada.
    
    Args:
        fecha_dt: Fecha a procesar
        modo_actualizar: Si True, re-descarga aunque existan archivos
        codigo_organismo: Código del organismo
        ticket: Ticket de API
        max_workers_detalle: Número de hilos para descargas concurrentes
        espera_entre_detalles: Tiempo de espera entre peticiones (throttle)
        progress_callback: Función callback(codigo, done, total) para reportar progreso
    """
    fecha_consulta = fecha_dt.strftime("%d/%m/%Y")
    f_str = fecha_dt.strftime("%Y%m%d")
    
    # Definimos las rutas
    ruta_resumen = CARPETA_DIARIO / f"LICITACION_SSO_{f_str}_RESUMEN.csv"
    ruta_detalles = CARPETA_DIARIO / f"LICITACION_SSO_{f_str}_DETALLES.csv"

    # Cache en disco: si ya existen ambos archivos y no se fuerza actualización
    if (not modo_actualizar) and ruta_resumen.exists() and ruta_detalles.exists():
        print("    ✅ Ya existe en DIARIO (cache).")
        return True

    # Lógica de Actualización: Borrar previo a la descarga si existe
    if modo_actualizar:
        if ruta_resumen.exists():
            ruta_resumen.unlink()
        if ruta_detalles.exists():
            ruta_detalles.unlink()

    print(f"\n>>> LICITACIONES SSO: {fecha_consulta}")
    
    client = MercadoPublicoLicitacionesClient(ApiConfig(codigo_organismo=codigo_organismo, ticket=ticket))
    licitaciones_basicas = client.obtener_listado_dia(fecha_dt)
    
    if not licitaciones_basicas:
        print("    ⚠ Sin licitaciones publicadas/modificadas este día.")
        return False

    db_resumen: List[Dict[str, Any]] = []
    db_detalles: List[Dict[str, Any]] = []

    codigos: List[str] = [str(item.get("CodigoExterno")) for item in licitaciones_basicas if item.get("CodigoExterno")]
    total = len(codigos)

    print(f"    Se encontraron {total} licitaciones. Descargando detalles...")

    def _fetch_one(idx_codigo: Tuple[int, str]) -> Optional[Tuple[Dict[str, Any], List[Dict[str, Any]]]]:
        """Descarga el detalle de una licitación (ejecutado en thread)."""
        idx, codigo = idx_codigo
        lic = client.obtener_detalle_licitacion(codigo)
        time.sleep(espera_entre_detalles)
        if not lic:
            return None
        return _extraer_resumen_y_detalles(codigo, lic)

    # Concurrencia controlada: acelera drásticamente cuando hay muchas licitaciones por día
    with ThreadPoolExecutor(max_workers=max_workers_detalle) as ex:
        future_to_codigo = {ex.submit(_fetch_one, (i, c)): c for i, c in enumerate(codigos, 1)}

        for done_count, fut in enumerate(as_completed(future_to_codigo), 1):
            codigo = future_to_codigo[fut]

            # Callback de progreso para UI
            if progress_callback:
                try:
                    progress_callback(codigo, done_count, total)
                except Exception:
                    pass

            if done_count % 10 == 0 or done_count == total:
                print(f"    Procesadas {done_count}/{total} licitaciones", end="\r")

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

    print(f"\n✅ Guardado en DIARIO: {f_str}")
    return True

# =========================
# INTEGRACIÓN CON DJANGO (BD SERVIDOR)
# =========================

def guardar_en_django(db_resumen, db_detalles):
    """
    Se conecta al entorno Django del proyecto BD_SISTEMA y realiza inserts/updates (Upsert)
    en las tablas físicas de la base de datos (MariaDB/MySQL).
    """
    import sys, os
    import dateutil.parser

    # Configuración on-the-fly para usar los modelos de nuestro backend de Django
    backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
    if backend_path not in sys.path:
        sys.path.append(backend_path)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
    
    import django
    from django.apps import apps
    if not apps.ready:
        django.setup()

    from api.models import Licitacion, DetalleLicitacion
    from django.utils.timezone import make_aware, is_naive

    # Parseo de fechas para que Django no reclame formatos inválidos (ej: vacíos)
    dt_fields = [
        'FechaCreacion', 'FechaCierre', 'FechaInicio', 'FechaFinal', 'FechaPublicacion',
        'FechaAdjudicacion', 'FechaEstimadaAdjudicacion', 'Adj_Fecha',
        'FechaPubRespuestas', 'FechaActoAperturaTecnica', 'FechaActoAperturaEconomica',
        'FechaSoporteFisico', 'FechaTiempoEvaluacion', 'FechaEstimadaFirma',
        'FechaVisitaTerreno', 'FechaEntregaAntecedentes', 'FechaInicioContrato',
    ]

    print("    -> Vaciando la base de datos (Licitaciones) para reemplazo total...")
    DetalleLicitacion.objects.all().delete()
    Licitacion.objects.all().delete()

    # --- Guardar Resumen (Tabla: Licitacion) ---
    print("    -> Preparando Licitaciones para Inserción Masiva...")
    campos_modelo_lic = [f.name for f in Licitacion._meta.get_fields()]
    licitaciones_a_crear = []
    
    for r in db_resumen:
        r_copy = r.copy()
        codigo = r_copy.pop("CodigoLicitacion", None)
        if not codigo: continue
        
        defaults = {}
        for k, v in r_copy.items():
            if k in dt_fields:
                try:
                    val_dt = dateutil.parser.isoparse(v) if (v and str(v).strip()) else None
                    if val_dt and is_naive(val_dt):
                        val_dt = make_aware(val_dt)
                    defaults[k] = val_dt
                except:
                    defaults[k] = None
            elif k == 'EsRenovable':
                # BooleanField sin null=True — debe ser True/False, nunca None
                sv = str(v or '').strip().lower()
                defaults[k] = sv in ('1', 'true', 'si', 'sí', 'yes')
            elif k in [
                'Etapas', 'CodigoEstado', 'CodigoTipo',
                'DiasCierreLicitacion', 'CantidadReclamos',
                'Informada', 'TomaRazon', 'EstadoPublicidadOfertas', 'Contrato', 'Obras',
                'UnidadTiempoEvaluacion', 'Estimacion', 'VisibilidadMonto', 'TipoPago',
                'Tiempo', 'UnidadTiempo', 'ProhibicionContratacion', 'SubContratacion',
                'ExtensionPlazo', 'EsBaseTipo', 'UnidadTiempoContratoLicitacion',
                'ValorTiempoRenovacion', 'Adj_Tipo', 'Adj_NumeroOferentes',
            ]:
                try:
                    defaults[k] = int(float(v)) if (v != '' and v is not None and str(v).strip().lower() not in ('none', 'nan')) else None
                except (ValueError, TypeError):
                    defaults[k] = None
            elif k in ['MontoEstimado']:
                try:
                    if isinstance(v, str): v = v.replace(',', '.')
                    defaults[k] = float(v) if (v != '' and v is not None and str(v).strip().lower() not in ('none', 'nan')) else None
                except (ValueError, TypeError):
                    defaults[k] = None
            else:
                defaults[k] = v if (v is not None and str(v).lower() != 'none' and not pd.isna(v)) else None
                
        dict_limpio = {k: v for k, v in defaults.items() if k in campos_modelo_lic}
        dict_limpio['codigo_licitacion'] = codigo

        # Campos NOT NULL con default='' en el modelo: si la API devuelve None,
        # pasar '' en lugar de None para que MySQL no rechace la inserción.
        for _campo in ('Numero',):
            if dict_limpio.get(_campo) is None:
                dict_limpio[_campo] = ''

        licitaciones_a_crear.append(Licitacion(**dict_limpio))
        
    print(f"    -> Insertando {len(licitaciones_a_crear)} Licitaciones en BD...")
    Licitacion.objects.bulk_create(licitaciones_a_crear, batch_size=20)

    # --- Guardar Detalles (Tabla: DetalleLicitacion) ---
    print("    -> Preparando Detalles para Inserción Masiva...")
    campos_modelo_det = [f.name for f in DetalleLicitacion._meta.get_fields()]
    detalles_a_crear = []
    
    codigos_validos = {lic.codigo_licitacion for lic in licitaciones_a_crear}
    
    for d in db_detalles:
        d_copy = d.copy()
        codigo_lic = d_copy.pop("CodigoLicitacion", None)
        if not codigo_lic or codigo_lic not in codigos_validos:
            continue
            
        correlativo = d_copy.pop("Correlativo", None)
        if correlativo is None or str(correlativo).lower() == 'none' or pd.isna(correlativo):
            correlativo = d_copy.get("CodigoProducto") or 0
            
        defaults_det = {}
        for k, v in d_copy.items():
            if k in ['Cantidad', 'MontoUnitarioGanador', 'CantidadAdjudicada']:
                try:
                    if isinstance(v, str): v = v.replace(',', '.')
                    defaults_det[k] = float(v) if (v != '' and v is not None and str(v).lower() != 'none') else None
                except ValueError:
                    defaults_det[k] = None
            else:
                defaults_det[k] = v if (v is not None and str(v).lower() != 'none' and not pd.isna(v)) else None
                
        dict_limpio_det = {k: v for k, v in defaults_det.items() if k in campos_modelo_det}
        dict_limpio_det['licitacion_id'] = codigo_lic
        dict_limpio_det['Correlativo'] = correlativo
        
        detalles_a_crear.append(DetalleLicitacion(**dict_limpio_det))

    print(f"    -> Insertando {len(detalles_a_crear)} Detalles en BD...")
    DetalleLicitacion.objects.bulk_create(detalles_a_crear, batch_size=20)

    return len(licitaciones_a_crear), len(detalles_a_crear)


# =======================================================
# GESTIÓN DE BASES DE DATOS (MAESTROS)
# =======================================================

def unificar_base_datos():
    """
    Lee TODOS los CSVs de la carpeta DIARIO y reconstruye los Maestros desde cero.
    """
    print("\n🔄 INICIANDO UNIFICACIÓN DE BASE DE DATOS...")
    
    # --- PROCESAR RESUMEN ---
    print("   -> Buscando archivos de Resumen en DIARIO...")
    archivos_res = list(CARPETA_DIARIO.glob("*_RESUMEN.csv"))
    
    if archivos_res:
        df_res = pd.concat(
            [pd.read_csv(f, sep=";", encoding="utf-8-sig", dtype=str) for f in archivos_res],
            ignore_index=True,
        )
        df_res.drop_duplicates(subset=["CodigoLicitacion"], keep="last", inplace=True)
        df_res = _enriquecer_df_lic(df_res)

        ruta_m_res = CARPETA_MAESTROS / "Maestro_Resumen.csv"
        df_res.to_csv(ruta_m_res, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Resumen creado: {len(df_res)} registros.")
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
        df_det.drop_duplicates(subset=["CodigoLicitacion", "Correlativo"], keep="last", inplace=True)
        
        ruta_m_det = CARPETA_MAESTROS / "Maestro_Detalle.csv"
        df_det.to_csv(ruta_m_det, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Detalle creado: {len(df_det)} registros.")
    else:
        print("   ⚠️ No se encontraron archivos de Detalles en DIARIO.")

    print("\n✨ UNIFICACIÓN COMPLETADA EXITOSAMENTE.")


def refresh_base_datos(
    f_ini,
    f_fin,
    codigo_organismo: str = CODIGO_ORGANISMO,
    ticket: str = TICKET,
    max_workers_detalle: int = MAX_WORKERS_DETALLE,
    espera_entre_detalles: float = ESPERA_ENTRE_DETALLES,
    progress_callback: Optional[Callable[[dt.date, str, int, int], None]] = None,
):
    """
    Descarga rango, lee Maestros, actualiza (Upsert) y guarda.
    
    Args:
        f_ini: Fecha inicial
        f_fin: Fecha final
        codigo_organismo: Código del organismo
        ticket: Ticket de API
        max_workers_detalle: Número de hilos para descargas concurrentes
        espera_entre_detalles: Tiempo de espera entre peticiones
        progress_callback: Función callback(dia, codigo, done, total) para reportar progreso
    """
    print(f"\n🚀 INICIANDO REFRESH DE BASE DE DATOS ({f_ini} al {f_fin})")
    
    # 1. DESCARGA MASIVA A DIARIO
    d_actual = f_ini
    dias_descargados = []
    
    while d_actual <= f_fin:
        # Callback para este día
        def _cb_lic(codigo: str, done: int, total: int) -> None:
            if progress_callback:
                progress_callback(d_actual, codigo, done, total)

        hubo_datos = procesar_dia(
            d_actual,
            modo_actualizar=True,
            codigo_organismo=codigo_organismo,
            ticket=ticket,
            max_workers_detalle=max_workers_detalle,
            espera_entre_detalles=espera_entre_detalles,
            progress_callback=_cb_lic,
        )
        if hubo_datos:
            dias_descargados.append(d_actual)
        d_actual += dt.timedelta(days=1)
    
    if not dias_descargados:
        print("\n⚠️ No se encontraron nuevos datos en el rango seleccionado. Los Maestros no se tocarán.")
        return

    print("\n🔄 INTEGRANDO NUEVOS DATOS A LOS MAESTROS (UPSERT)...")

    # Rutas Maestros
    ruta_m_res = CARPETA_MAESTROS / "Maestro_Resumen.csv"
    ruta_m_det = CARPETA_MAESTROS / "Maestro_Detalle.csv"

    # --- ACTUALIZAR RESUMEN ---
    if ruta_m_res.exists():
        df_master_res = pd.read_csv(ruta_m_res, sep=";", encoding="utf-8-sig", dtype=str)
    else:
        df_master_res = pd.DataFrame()

    # Cargar Nuevos Archivos Diarios
    archivos_nuevos_res = [CARPETA_DIARIO / f"LICITACION_SSO_{d.strftime('%Y%m%d')}_RESUMEN.csv" for d in dias_descargados]
    df_nuevos_res = pd.concat(
        [pd.read_csv(f, sep=";", encoding="utf-8-sig", dtype=str) for f in archivos_nuevos_res if f.exists()],
        ignore_index=True,
    )

    if not df_nuevos_res.empty:
        # Concatenar y deduplicar (Keep Last asegura que la versión nueva reemplace a la vieja)
        df_final_res = pd.concat([df_master_res, df_nuevos_res])
        df_final_res.drop_duplicates(subset=["CodigoLicitacion"], keep="last", inplace=True)
        df_final_res = _enriquecer_df_lic(df_final_res)

        df_final_res.to_csv(ruta_m_res, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Resumen actualizado. Total registros: {len(df_final_res)}")

    # --- ACTUALIZAR DETALLES ---
    if ruta_m_det.exists():
        df_master_det = pd.read_csv(ruta_m_det, sep=";", encoding="utf-8-sig", dtype=str)
    else:
        df_master_det = pd.DataFrame()

    archivos_nuevos_det = [CARPETA_DIARIO / f"LICITACION_SSO_{d.strftime('%Y%m%d')}_DETALLES.csv" for d in dias_descargados]
    df_nuevos_det = pd.concat(
        [pd.read_csv(f, sep=";", encoding="utf-8-sig", dtype=str) for f in archivos_nuevos_det if f.exists()],
        ignore_index=True,
    )

    if not df_nuevos_det.empty:
        # ESTRATEGIA SEGURA: Borrar items antiguos de licitaciones actualizadas
        lics_actualizadas = df_nuevos_det["CodigoLicitacion"].unique()
        
        if not df_master_det.empty:
            df_master_det = df_master_det[~df_master_det["CodigoLicitacion"].isin(lics_actualizadas)]
        
        df_final_det = pd.concat([df_master_det, df_nuevos_det])
        
        df_final_det.to_csv(ruta_m_det, sep=";", index=False, encoding="utf-8-sig")
        print(f"   ✅ Maestro Detalle actualizado. Total registros: {len(df_final_det)}")

    print("\n✨ PROCESO DE REFRESH COMPLETADO EXITOSAMENTE.")


def subir_maestros_a_django():
    """
    Lee los archivos CSV Maestro (Resumen y Detalles) completos y envía todo el volumen
    a la Base de Datos MariaDB mediante el ORM de Django (Upsert).
    """
    import pandas as pd
    import numpy as np
    
    ruta_m_res = CARPETA_MAESTROS / "Maestro_Resumen.csv"
    ruta_m_det = CARPETA_MAESTROS / "Maestro_Detalle.csv"

    if not ruta_m_res.exists() or not ruta_m_det.exists():
        print("   ❌ No existen los archivos Maestro (Resumen/Detalles). Ejecute la Opción 5 primero.")
        return

    print("\n🚀 CARGANDO CSVs MAESTROS PARA SINCRONIZACIÓN MASIVA...")
    df_res = pd.read_csv(ruta_m_res, sep=";", encoding="utf-8-sig", dtype=str)
    df_det = pd.read_csv(ruta_m_det, sep=";", encoding="utf-8-sig", dtype=str)

    # Limpiar nulos de pandas ("nan", float('nan')) para que no den problemas en JSON/Dicts
    df_res = df_res.replace({np.nan: None})
    df_det = df_det.replace({np.nan: None})

    datos_res = df_res.to_dict("records")
    datos_det = df_det.to_dict("records")

    print(f"   -> Subiendo {len(datos_res)} Licitaciones y {len(datos_det)} Detalles a Django...")
    count_lic, count_det = guardar_en_django(datos_res, datos_det)
    print("   ✅ Sincronización masiva finalizada exitosamente.")
    print(f"   📊 TOTAL EN BD: {count_lic} Licitaciones (Resumen) y {count_det} Detalles.")


# =========================
# MENÚ PRINCIPAL
# =========================

if __name__ == "__main__":
    while True:
        print("\n=========================================")
        print("   EXTRACTOR LICITACIONES SSO - V3")
        print("=========================================")
        print("── Descarga ──────────────────────────────")
        print("1) Hoy                (descarga hoy a DIARIO)")
        print("2) Día manual         (un día a DIARIO)")
        print("3) Rango sin forzar   (solo descarga lo nuevo a DIARIO)")
        print("── Maestros ──────────────────────────────")
        print("5) UNIFICAR           (DIARIO → Maestros + enriquecimiento)")
        print("6) REFRESH            (Descarga rango + Maestros + enriquecimiento)  ← uso habitual")
        print("── Sincronización ────────────────────────")
        print("7) SINCRONIZAR A BD   (Sube CSV Maestros a MariaDB/Django)")
        print("──────────────────────────────────────────")
        print("0) Salir")
        
        op = input("\nSeleccione opción: ")
        
        try:
            if op == "0":
                break
            
            elif op == "1":
                procesar_dia(dt.date.today())
            
            elif op == "2":
                f_in = input("Fecha (dd-mm-aaaa): ")
                procesar_dia(dt.datetime.strptime(f_in, "%d-%m-%Y").date())
            
            elif op == "3":
                ini = input("Desde (dd-mm-aaaa): ")
                fin = input("Hasta (dd-mm-aaaa): ")
                d1 = dt.datetime.strptime(ini, "%d-%m-%Y").date()
                d2 = dt.datetime.strptime(fin, "%d-%m-%Y").date()
                while d1 <= d2:
                    procesar_dia(d1, modo_actualizar=False)
                    d1 += dt.timedelta(days=1)
            
            elif op == "5":
                unificar_base_datos()
                
            elif op == "6":
                ini = input("Desde (dd-mm-aaaa): ")
                fin = input("Hasta (dd-mm-aaaa): ")
                d_ini = dt.datetime.strptime(ini, "%d-%m-%Y").date()
                d_fin = dt.datetime.strptime(fin, "%d-%m-%Y").date()
                refresh_base_datos(d_ini, d_fin)

            elif op == "7":
                subir_maestros_a_django()

        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
