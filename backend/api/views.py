import ctypes
import json
import logging
import re
import subprocess
import sys
import threading
import uuid
from pathlib import Path

from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.db.models import DecimalField
from django.db.models.functions import Cast
from django.http import HttpResponse
import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# Almacén en memoria de tareas de descarga (app local, un solo usuario)
_tareas_descarga = {}

# Almacén de tareas ETL Compra Ágil
_tareas_actualizacion_ca: dict = {}

# Almacén de tareas ETL Órdenes de Compra
_tareas_actualizacion_oc: dict = {}

_RUTA_AG_SERVIDOR = Path(__file__).parent.parent.parent / "api"

from django.contrib.auth.models import User
from rest_framework.permissions import BasePermission

from .models import (
    BoletaGarantia, BoletaGarantiaAudit, Comprador,
    DetalleLicitacion, DetalleOrdenCompra,
    Factura, Licitacion, OrdenCompra, Proveedor,
    PlanerPAC, CompraAgilResumen, CompraAgilProducto, CompraAgilProveedor,
    RevisionOCCorregible, GestionContrato,
    FormularioFSC, FormularioFSCDerivado, FormularioFSCProducto,
    PerfilUsuario, Departamento, Establecimiento, DevengoSigfeAnual,
    ConceptoJerarquia, SigfeAnexo1,
)
from .serializers import (
    BoletaGarantiaAuditSerializer, BoletaGarantiaSerializer,
    CompradorSerializer, DetalleLicitacionSerializer,
    DetalleOrdenCompraSerializer,
    LicitacionSerializer, LicitacionCalendarioSerializer,
    OrdenCompraSerializer, ProveedorSerializer,
    PlanerPACSerializer, CompraAgilResumenSerializer, CompraAgilCalendarioSerializer,
    CompraAgilProductoSerializer, CompraAgilProveedorSerializer,
    RevisionOCCorregibleSerializer, GestionContratoSerializer,
    FormularioFSCSerializer, FormularioFSCDerivadoSerializer, FormularioFSCProductoSerializer,
    UserAdminSerializer, UserMeSerializer,
    DepartamentoSerializer, EstablecimientoSerializer,
    DevengoSigfeAnualSerializer, SigfeAnexo1Serializer,
)

# Campos de fecha que mapea EVENT_CFG en CalendarioSect.jsx (17 campos)
_CALENDAR_DATE_FIELDS = [
    'FechaCreacion', 'FechaPublicacion', 'FechaInicio', 'FechaFinal',
    'FechaCierre', 'FechaPubRespuestas',
    'FechaActoAperturaTecnica', 'FechaActoAperturaEconomica',
    'FechaSoporteFisico', 'FechaTiempoEvaluacion',
    'FechaVisitaTerreno', 'FechaEntregaAntecedentes',
    'FechaEstimadaAdjudicacion', 'FechaAdjudicacion', 'Adj_Fecha',
    'FechaEstimadaFirma', 'FechaInicioContrato',
]
from .services import (
    obtener_kpis_devengo,
    calcular_indicadores_res188,
    calcular_oc_stats,
    calcular_oc_productos,
    calcular_compraagil_ahorro_stats,
    calcular_ahorro_licitaciones,
    calcular_gestion_licitaciones,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Licitaciones
# =============================================================================

class LicitacionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LicitacionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['Estado', 'C_NombreOrganismo', 'Tipo', 'EsRenovable']

    def get_queryset(self):
        # prefetch_related solo en retrieve (detalle individual) — en list carga ~2300 filas extra innecesarias
        qs = Licitacion.objects.all()
        if self.action == 'retrieve':
            qs = qs.prefetch_related('detalles')
        anio = self.request.query_params.get('anio', '').strip()
        if anio and anio.isdigit():
            qs = qs.filter(FechaPublicacion__year=int(anio))
        return qs


class DetalleLicitacionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DetalleLicitacionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['licitacion', 'CodigoProducto', 'Categoria']

    def get_queryset(self):
        qs = DetalleLicitacion.objects.all()
        anio = self.request.query_params.get('anio', '').strip()
        if anio and anio.isdigit():
            qs = qs.filter(licitacion__FechaPublicacion__year=int(anio))
        return qs


# =============================================================================
# Dashboard stats (licitaciones)
# =============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def licitaciones_ahorro_stats(request):
    """KPIs y desglose de ahorro para licitaciones adjudicadas. Cache 5min por año."""
    anio = request.GET.get('anio', '').strip()
    anio_int = int(anio) if anio and anio.isdigit() else None
    cache_key = f'licitaciones_ahorro_stats_v1_{anio}'
    data = cache.get(cache_key)
    if not data:
        try:
            data = calcular_ahorro_licitaciones(anio=anio_int)
            cache.set(cache_key, data, timeout=300)
        except Exception as e:
            logger.error('licitaciones_ahorro_stats error: %s', e, exc_info=True)
            return Response({'detail': f'Error al calcular ahorro: {e}'}, status=500)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def licitaciones_gestion_stats(request):
    """Licitaciones activas con semáforo de urgencia. Cache 5min por año."""
    anio = request.GET.get('anio', '').strip()
    anio_int = int(anio) if anio and anio.isdigit() else None
    cache_key = f'licitaciones_gestion_stats_v1_{anio}'
    data = cache.get(cache_key)
    if not data:
        try:
            data = calcular_gestion_licitaciones(anio=anio_int)
            cache.set(cache_key, data, timeout=300)
        except Exception as e:
            logger.error('licitaciones_gestion_stats error: %s', e, exc_info=True)
            return Response({'detail': f'Error al calcular gestión: {e}'}, status=500)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def licitaciones_anos_view(request):
    """Años distintos disponibles en FechaPublicacion de Licitacion. Cache 10min."""
    from django.db import connection
    data = cache.get('licitaciones_anos_v1')
    if not data:
        with connection.cursor() as c:
            c.execute(
                'SELECT DISTINCT YEAR(FechaPublicacion) FROM api_licitacion '
                'WHERE FechaPublicacion IS NOT NULL ORDER BY 1 DESC'
            )
            data = [row[0] for row in c.fetchall() if row[0]]
        cache.set('licitaciones_anos_v1', data, timeout=600)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    anio = request.GET.get('anio', '').strip()
    estado = request.GET.get('Estado', '').strip()
    cache_key = f'dashboard_stats_{anio}_{estado}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data)

    qs = Licitacion.objects.all()
    if anio and anio.isdigit():
        qs = qs.filter(FechaPublicacion__year=int(anio))
    if estado:
        qs = qs.filter(Estado=estado)

    total = qs.count()
    cerradas = qs.filter(Estado='Cerrada').count()
    publicadas = qs.filter(Estado='Publicada').count()
    monto_total = qs.aggregate(t=Sum('MontoEstimado'))['t'] or 0
    compradores = qs.values('C_Usuario').distinct().count()

    response_data = {
        'total': total,
        'cerradas': cerradas,
        'publicadas': publicadas,
        'monto_total': float(monto_total),
        'compradores': compradores,
    }
    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


# =============================================================================
# Devengo SIGFE Anual (histórico consolidado, descarga Selenium) — reemplaza
# por completo al viejo modelo/tabla Devengo (eliminados)
# =============================================================================

class DevengoSigfeAnualViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet de solo lectura para el histórico de Devengo SIGFE consolidado
    (tabla api_sigfe_devengo_anual). Expone todos los campos del registro."""
    queryset = DevengoSigfeAnual.objects.all()
    serializer_class = DevengoSigfeAnualSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ['codigo_ue', 'tipo_documento', 'concepto_presupuestario']
    search_fields = ['principal', 'concepto_presupuestario', 'tipo_documento', 'codigo_ue', 'numero_documento', 'titulo']
    ordering_fields = ['fecha_documento', 'monto_vigente', 'monto_disponible', 'monto_consumido', 'fecha_sync']
    ordering = ['-fecha_documento']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_sigfe_anual_raw_all(request):
    """Devuelve todo el histórico SIGFE sin paginación, para consumo del futuro
    reporte de Devengo (frontend). Filtros opcionales: ue, desde, hasta (fecha_documento)."""
    ue = request.GET.get('ue', '')
    desde = request.GET.get('desde', '')
    hasta = request.GET.get('hasta', '')
    try:
        # Límite generoso: esta tabla acumula histórico anual y ya supera
        # 38.000 filas (creciendo con cada sincronización SIGFE) — un tope
        # bajo la truncaría en silencio para los dashboards que esperan
        # "todo el histórico" (ex-Devengo).
        limit = min(int(request.GET.get('limit', 50000)), 100000)
    except (ValueError, TypeError):
        limit = 50000

    qs = DevengoSigfeAnual.objects.all()
    if ue:
        qs = qs.filter(codigo_ue=ue)
    if desde:
        qs = qs.filter(fecha_documento__gte=desde)
    if hasta:
        qs = qs.filter(fecha_documento__lte=hasta)

    serializer = DevengoSigfeAnualSerializer(qs[:limit], many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_sigfe_anual_stats(request):
    """KPIs agregados (deuda, top proveedores, por UE, por tipo doc, por
    concepto N1) sobre api_sigfe_devengo_anual — reemplazo directo de
    devengo_stats() ahora que el módulo Anexo N°3 corre 100% sobre
    DevengoSigfeAnual. obtener_kpis_devengo() no necesitó ningún cambio:
    solo usa campos presentes en ambos modelos (monto_*, codigo_ue,
    principal, tipo_documento, concepto_presupuestario)."""
    ue = request.GET.get('ue', '')
    solo_deuda = request.GET.get('solo_deuda', '1') == '1'
    ue_safe = ue[:50].replace(' ', '_')
    cache_key = f'devengo_sigfe_anual_stats_ue_{ue_safe}_sd_{int(solo_deuda)}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data)

    qs = DevengoSigfeAnual.objects.all()
    response_data = obtener_kpis_devengo(qs, codigo_ue=ue, solo_deuda=solo_deuda)
    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


# =============================================================================
# SIGFE Anexo N°1 (Estado de Ejecución Presupuestaria) — descarga Selenium
# (api/data/data_anexo1/Sigfe_Descargas_Estado_ejecucion_presupuestaria.py) +
# consolidación (api/data/data_anexo1/consolidar_anexo1_sigfe.py), disparable
# desde el dashboard igual patrón que Anexo N°3 (devengo SIGFE). Sin relación
# con el viejo modelo Anexo1/tabla_anexo1.
# =============================================================================

class SigfeAnexo1ViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet de solo lectura sobre api_sigfe_anexo1."""
    queryset = SigfeAnexo1.objects.all()
    serializer_class = SigfeAnexo1Serializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ['codigo_ue', 'anho', 'mes', 'concepto_presupuestario']
    search_fields = ['concepto_presupuestario', 'ruta_jerarquica', 'nombre_establecimiento']
    ordering_fields = ['anho', 'mes', 'nivel', 'fecha_sync']
    ordering = ['-anho', '-mes', 'nivel']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def sigfe_anexo1_estado_bd(request):
    """Matriz establecimiento x mes con semáforo verde/amarillo/rojo de
    cobertura de datos, para el tab 'Base de datos' de Anexo N°1."""
    try:
        anho_desde = request.GET.get('anho_desde')
        anho_desde = int(anho_desde) if anho_desde else None
    except (ValueError, TypeError):
        anho_desde = None

    cache_key = f'sigfe_anexo1_estado_bd_{anho_desde or "default"}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data)

    from .services import calcular_sigfe_anexo1_estado_bd
    response_data = calcular_sigfe_anexo1_estado_bd(anho_desde=anho_desde)
    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


# -- Actualización desde SIGFE (Selenium, disparada desde el dashboard) -------

_tareas_actualizacion_anexo1: dict = {}

_RUTA_DATA_ANEXO1 = Path(__file__).parent.parent.parent / "api" / "data" / "data_anexo1"

_PATRON_FECHA_ISO_ANEXO1 = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _ejecutar_actualizacion_anexo1(task_id: str, usuario: str, password: str,
                                    fecha_desde: str, fecha_hasta: str):
    """Descarga (Selenium headless) + consolida Anexo N°1 por establecimiento,
    delegando en Sigfe_Descargas_Estado_ejecucion_presupuestaria. Mismo
    patrón que _ejecutar_actualizacion_sigfe (Anexo N°3)."""
    _tareas_actualizacion_anexo1[task_id]["thread_id"] = threading.current_thread().ident

    ruta_modulo = str(_RUTA_DATA_ANEXO1)
    if ruta_modulo not in sys.path:
        sys.path.insert(0, ruta_modulo)

    try:
        import Sigfe_Descargas_Estado_ejecucion_presupuestaria as anexo1_etl
    except ImportError as exc:
        _tareas_actualizacion_anexo1[task_id].update(
            status="error", error=f"No se pudo cargar el módulo de descarga: {exc}"
        )
        return

    logs = []

    def _cb(paso=None, paso_desc=None, progreso_pct=None, log=None):
        upd = {}
        if paso is not None:
            upd["paso"] = paso
        if paso_desc is not None:
            upd["paso_desc"] = paso_desc
        if progreso_pct is not None:
            upd["progreso_pct"] = progreso_pct
        if log:
            logs.append(log)
            upd["logs_recientes"] = logs[-40:]
        if upd:
            _tareas_actualizacion_anexo1[task_id].update(**upd)

    try:
        _tareas_actualizacion_anexo1[task_id].update(status="en_proceso")
        _cb(paso=1, paso_desc="Iniciando navegador y autenticando en SIGFE...", progreso_pct=1,
            log=f"Descargando Anexo N°1 del {fecha_desde} al {fecha_hasta}...")

        resultado = anexo1_etl.ejecutar_actualizacion_anexo1(
            usuario, password, fecha_desde, fecha_hasta, progress_callback=_cb,
        )

        consolidacion = resultado["consolidacion"]
        diff = {
            "tramos_ok": resultado["tramos_ok"],
            "tramos_fallidos": resultado["tramos_fallidos"],
            "archivos_procesados": consolidacion.get("archivos_procesados", 0),
            "archivos_fallidos": consolidacion.get("archivos_fallidos", 0),
            "filas_totales": consolidacion.get("filas_totales", 0),
            "resumen": consolidacion.get("resumen", []),
            "fallidos_detalle": consolidacion.get("fallidos_detalle", []),
        }

        # El panel 'Base de datos' cachea 5 min por año-desde -- invalidar el
        # default (el que usa la página) para que refleje lo recién cargado.
        cache.delete('sigfe_anexo1_estado_bd_default')

        _tareas_actualizacion_anexo1[task_id].update(
            status="completado", paso=5,
            paso_desc=(
                f"Completado: {consolidacion.get('archivos_procesados', 0)} tramo(s) sincronizados "
                f"({len(resultado['tramos_ok'])}/{len(resultado['tramos_ok']) + len(resultado['tramos_fallidos'])} OK)."
            ),
            logs_recientes=logs[-40:],
            progreso_pct=100,
            diff=diff,
        )

    except Exception as exc:
        logger.exception("Error actualizando Anexo N°1 SIGFE")
        _tareas_actualizacion_anexo1[task_id].update(
            status="error", error=str(exc), logs_recientes=logs[-40:],
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_actualizacion_anexo1(request):
    """Inicia la descarga + consolidación de Anexo N°1 por establecimiento.
    Body: {usuario, password, fecha_desde, fecha_hasta} (fechas YYYY-MM-DD)."""
    for tarea in _tareas_actualizacion_anexo1.values():
        if tarea.get("status") in ("iniciado", "en_proceso"):
            return Response({"error": "Ya hay una actualización de Anexo N°1 en curso."}, status=409)

    usuario = str(request.data.get("usuario", "")).strip()
    password = str(request.data.get("password", "")).strip()
    fecha_desde = str(request.data.get("fecha_desde", "")).strip()
    fecha_hasta = str(request.data.get("fecha_hasta", "")).strip()

    if not usuario or not password:
        return Response({"error": "Debe indicar usuario y contraseña de SIGFE."}, status=400)
    if not _PATRON_FECHA_ISO_ANEXO1.match(fecha_desde) or not _PATRON_FECHA_ISO_ANEXO1.match(fecha_hasta):
        return Response({"error": "Fechas inválidas (se esperan como YYYY-MM-DD)."}, status=400)
    if fecha_desde > fecha_hasta:
        return Response({"error": "La fecha 'desde' no puede ser posterior a 'hasta'."}, status=400)

    task_id = str(uuid.uuid4())[:8]
    _tareas_actualizacion_anexo1[task_id] = {
        "status": "iniciado",
        "paso": 0,
        "paso_desc": "Iniciando...",
        "error": None,
        "logs_recientes": [],
        "progreso_pct": 0,
        "diff": None,
    }
    threading.Thread(
        target=_ejecutar_actualizacion_anexo1,
        args=(task_id, usuario, password, fecha_desde, fecha_hasta),
        daemon=True,
    ).start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_actualizacion_anexo1(request, task_id):
    """Retorna el estado de una tarea de actualización de Anexo N°1."""
    tarea = _tareas_actualizacion_anexo1.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id":        task_id,
        "status":         tarea["status"],
        "paso":           tarea["paso"],
        "paso_desc":      tarea["paso_desc"],
        "progreso_pct":   tarea.get("progreso_pct", 0),
        "logs_recientes": tarea.get("logs_recientes", []),
        "error":          tarea.get("error"),
        "diff":           tarea.get("diff"),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancelar_actualizacion_anexo1(request, task_id):
    """Cancela una tarea de actualización de Anexo N°1 en curso (mata el
    hilo real y, al desenrollar el try/finally del ETL, también cierra
    Chrome)."""
    return _cancelar_tarea(_tareas_actualizacion_anexo1, task_id)


_NIVELES_PREFIJO_HIER = (10, 7, 4, 2)


def _construir_hier_lookup() -> dict:
    """{codigo: [n1_desc, n2_desc, n3_desc, n4_desc, n5_desc, nivel]} — mismo
    formato que el HIER_LOOKUP ya embebido en el HTML standalone, para poder
    reutilizar exactamente la misma lógica de resolución (resolveHier)."""
    lookup = {}
    for c in ConceptoJerarquia.objects.all().values(
        'codigo', 'n1_desc', 'n2_desc', 'n3_desc', 'n4_desc', 'n5_desc', 'nivel'
    ):
        lookup[c['codigo']] = [
            c['n1_desc'], c['n2_desc'], c['n3_desc'], c['n4_desc'], c['n5_desc'], c['nivel'],
        ]
    return lookup


def _resolver_hier(lookup: dict, codigo: str):
    """Réplica de resolveHier() del HTML: match exacto, si no, prefijos
    progresivos de largo 10/7/4/2 (N4→N1)."""
    if codigo in lookup:
        return lookup[codigo]
    for largo in _NIVELES_PREFIJO_HIER:
        prefijo = codigo[:largo]
        if prefijo in lookup:
            return lookup[prefijo]
    return None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_sigfe_anual_reporte_html(request):
    """Sirve el reporte HTML standalone (Anexo N°3 — árbol jerárquico +
    Chart.js) con D_SLIM pre-cargado desde api_sigfe_devengo_anual. Protegido
    igual que el resto del API (JWT); el frontend debe pedirlo con la
    instancia de axios autenticada y renderizarlo vía iframe.srcDoc, NO como
    <iframe src=...> directo (eso no llevaría el header Authorization).

    ?rango=completo carga TODO el histórico; por defecto ('reciente') se
    limita a año actual + anterior. api_sigfe_devengo_anual acumula
    histórico indefinidamente (ya ~39.000 filas) — mandar todo sin filtro
    genera una respuesta de ~20+ MB que el navegador debe parsear y sobre
    la que corren varios Chart.js: en equipos con poca RAM libre puede
    colgar o hacer crashear la pestaña/navegador. El filtro usa
    fecha_documento (siempre poblada) y no fecha_conforme, que puede venir
    vacía justo en la deuda pendiente de confirmar — filtrar por esa
    dejaría afuera lo más relevante de un reporte de control de deuda."""
    from datetime import date

    rango = request.GET.get('rango', 'reciente')  # 'reciente' (default) | 'completo'
    cache_key = f'devengo_sigfe_anual_reporte_html_{rango}'
    html = cache.get(cache_key)
    if html is None:
        qs = DevengoSigfeAnual.objects.exclude(
            monto_vigente=0, monto_disponible=0, monto_consumido=0,
        )
        if rango != 'completo':
            qs = qs.filter(fecha_documento__year__gte=date.today().year - 1)
        qs = qs.values(
            'codigo_ue', 'principal', 'tipo_documento', 'fecha_conforme', 'fecha_documento',
            'id_chile_compra', 'catalogo_01', 'catalogo_03', 'catalogo_04',
            'concepto_presupuestario', 'monto_vigente', 'monto_disponible', 'monto_consumido',
        )

        hier_lookup = _construir_hier_lookup()

        d_slim = []
        for r in qs.iterator(chunk_size=2000):
            f = r['fecha_conforme'].isoformat() if r['fecha_conforme'] else ''
            fd = r['fecha_documento'].isoformat() if r['fecha_documento'] else ''

            c3_raw = (r['catalogo_03'] or '').strip()
            c4_raw = (r['catalogo_04'] or '').strip()
            if '0404-PRAIS' in c3_raw:
                c3_raw, c4_raw = 'No Aplica', c3_raw
            c3 = c3_raw.replace('DetalledeTransferencias - ', '')[:50]
            c4 = c4_raw.replace('UnidadesDemandantes - ', '')[:50]

            idcc = r['id_chile_compra'] or ''
            cp = (r['concepto_presupuestario'] or 'Sin concepto').strip()[:60]
            cp_code = cp.split(' ')[0] if cp else ''
            h = _resolver_hier(hier_lookup, cp_code)

            d_slim.append({
                'u': r['codigo_ue'] or '',
                'pr': r['principal'] or 'Desconocido',
                'td': (r['tipo_documento'] or '')[:30],
                'f': f, 'fd': fd, 'me': fd[:7],
                'mp': 1 if idcc.strip() else 0,
                'c1': (r['catalogo_01'] or '').replace('ProgramaPresupuestario - ', '')[:40],
                'c3': c3, 'c4': c4,
                'cp': cp,
                'vg': int(r['monto_vigente'] or 0),
                'di': int(r['monto_disponible'] or 0),
                'co': int(r['monto_consumido'] or 0),
                'a': f[:4], 'm': f[:7],
                'h1': h[0] if h else '', 'h2': h[1] if h else '', 'h3': h[2] if h else '',
                'h4': h[3] if h else '', 'h5': h[4] if h else '', 'hn': h[5] if h else 0,
            })

        # El sidebar interno, el header institucional propio y el tab de
        # "Carga de Archivos" ya se removieron/ocultaron directamente en la
        # plantilla (backend/api/templates/anexo3_reporte_sigfe.html) — no
        # hace falta parchear el HTML en cada request.
        html_path = Path(__file__).parent / 'templates' / 'anexo3_reporte_sigfe.html'
        html = html_path.read_text(encoding='utf-8')

        d_slim_json = json.dumps(d_slim, ensure_ascii=False, separators=(',', ':'))
        html = html.replace('const D_SLIM=[];', f'const D_SLIM={d_slim_json};', 1)

        cache.set(cache_key, html, timeout=300)

    return HttpResponse(html, content_type='text/html; charset=utf-8')


# -- Actualización desde SIGFE (Selenium, disparada desde el dashboard) -------

_tareas_actualizacion_sigfe: dict = {}

_RUTA_DATA_DEVENGO = Path(__file__).parent.parent.parent / "api" / "data" / "data_devengo"

_PATRON_FECHA_ISO_SIGFE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _ejecutar_actualizacion_sigfe(task_id: str, usuario: str, password: str,
                                   fecha_desde: str, fecha_hasta: str):
    """Descarga (Selenium headless) + consolida los devengos SIGFE por
    establecimiento, delegando en sigfe_descarga_devengos_Completo."""
    _tareas_actualizacion_sigfe[task_id]["thread_id"] = threading.current_thread().ident

    ruta_modulo = str(_RUTA_DATA_DEVENGO)
    if ruta_modulo not in sys.path:
        sys.path.insert(0, ruta_modulo)

    try:
        import sigfe_descarga_devengos_Completo as sigfe_etl
    except ImportError as exc:
        _tareas_actualizacion_sigfe[task_id].update(
            status="error", error=f"No se pudo cargar sigfe_descarga_devengos_Completo: {exc}"
        )
        return

    logs = []

    def _cb(paso=None, paso_desc=None, progreso_pct=None, log=None):
        upd = {}
        if paso is not None:
            upd["paso"] = paso
        if paso_desc is not None:
            upd["paso_desc"] = paso_desc
        if progreso_pct is not None:
            upd["progreso_pct"] = progreso_pct
        if log:
            logs.append(log)
            upd["logs_recientes"] = logs[-40:]
        if upd:
            _tareas_actualizacion_sigfe[task_id].update(**upd)

    try:
        _tareas_actualizacion_sigfe[task_id].update(status="en_proceso")
        _cb(paso=1, paso_desc="Iniciando navegador y autenticando en SIGFE...", progreso_pct=1,
            log=f"Descargando devengos SIGFE del {fecha_desde} al {fecha_hasta}...")

        resultado = sigfe_etl.ejecutar_actualizacion_sigfe(
            usuario, password, fecha_desde, fecha_hasta, progress_callback=_cb,
        )

        consolidacion = resultado["consolidacion"]
        diff = {
            "establecimientos_ok": resultado["establecimientos_ok"],
            "establecimientos_fallidos": resultado["establecimientos_fallidos"],
            "filas_leidas": consolidacion.get("filas_leidas", 0),
            "insertadas": consolidacion.get("insertadas", 0),
            "ya_existian": consolidacion.get("ya_existian", 0),
            "nuevos_detalle": consolidacion.get("nuevos_detalle", []),
            "nuevos_detalle_truncado": consolidacion.get("nuevos_detalle_truncado", False),
            "resumen_por_ue": consolidacion.get("resumen_por_ue", []),
        }

        # El reporte HTML cachea D_SLIM 5 min (una entrada por 'rango') —
        # invalidar ambas para que la próxima apertura del reporte ya
        # muestre los documentos recién sincronizados.
        cache.delete('devengo_sigfe_anual_reporte_html_reciente')
        cache.delete('devengo_sigfe_anual_reporte_html_completo')

        _tareas_actualizacion_sigfe[task_id].update(
            status="completado", paso=5,
            paso_desc=(
                f"Completado: {consolidacion.get('insertadas', 0)} documentos nuevos "
                f"({len(resultado['establecimientos_ok'])}/{len(resultado['establecimientos_ok']) + len(resultado['establecimientos_fallidos'])} establecimientos)."
            ),
            logs_recientes=logs[-40:],
            progreso_pct=100,
            diff=diff,
        )

    except Exception as exc:
        logger.exception("Error actualizando devengos SIGFE")
        _tareas_actualizacion_sigfe[task_id].update(
            status="error", error=str(exc), logs_recientes=logs[-40:],
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_actualizacion_sigfe(request):
    """Inicia la descarga + consolidación de devengos SIGFE por establecimiento.
    Body: {usuario, password, fecha_desde, fecha_hasta} (fechas YYYY-MM-DD)."""
    for tarea in _tareas_actualizacion_sigfe.values():
        if tarea.get("status") in ("iniciado", "en_proceso"):
            return Response({"error": "Ya hay una actualización SIGFE en curso."}, status=409)

    usuario = str(request.data.get("usuario", "")).strip()
    password = str(request.data.get("password", "")).strip()
    fecha_desde = str(request.data.get("fecha_desde", "")).strip()
    fecha_hasta = str(request.data.get("fecha_hasta", "")).strip()

    if not usuario or not password:
        return Response({"error": "Debe indicar usuario y contraseña de SIGFE."}, status=400)
    if not _PATRON_FECHA_ISO_SIGFE.match(fecha_desde) or not _PATRON_FECHA_ISO_SIGFE.match(fecha_hasta):
        return Response({"error": "Fechas inválidas (se esperan como YYYY-MM-DD)."}, status=400)
    if fecha_desde > fecha_hasta:
        return Response({"error": "La fecha 'desde' no puede ser posterior a 'hasta'."}, status=400)

    task_id = str(uuid.uuid4())[:8]
    _tareas_actualizacion_sigfe[task_id] = {
        "status": "iniciado",
        "paso": 0,
        "paso_desc": "Iniciando...",
        "error": None,
        "logs_recientes": [],
        "progreso_pct": 0,
        "diff": None,
    }
    threading.Thread(
        target=_ejecutar_actualizacion_sigfe,
        args=(task_id, usuario, password, fecha_desde, fecha_hasta),
        daemon=True,
    ).start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_actualizacion_sigfe(request, task_id):
    """Retorna el estado de una tarea de actualización SIGFE."""
    tarea = _tareas_actualizacion_sigfe.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id":        task_id,
        "status":         tarea["status"],
        "paso":           tarea["paso"],
        "paso_desc":      tarea["paso_desc"],
        "progreso_pct":   tarea.get("progreso_pct", 0),
        "logs_recientes": tarea.get("logs_recientes", []),
        "error":          tarea.get("error"),
        "diff":           tarea.get("diff"),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancelar_actualizacion_sigfe(request, task_id):
    """Cancela una tarea de actualización SIGFE en curso (mata el hilo real
    y, al desenrollar el try/finally del ETL, también cierra Chrome)."""
    return _cancelar_tarea(_tareas_actualizacion_sigfe, task_id)


# =============================================================================
# Órdenes de Compra
# =============================================================================

class OrdenCompraViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OrdenCompra.objects.prefetch_related('detalles').all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['EstadoOC', 'C_Unidad', 'TipoOC']


class DetalleOrdenCompraViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DetalleOrdenCompra.objects.all()
    serializer_class = DetalleOrdenCompraSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['orden_compra', 'CodigoProducto', 'Categoria']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ordenes_compra_raw_all(request):
    """Devuelve todas las OC sin paginación para el dashboard (solo campos necesarios)."""
    try:
        limit = min(int(request.GET.get('limit', 25000)), 25000)
    except (ValueError, TypeError):
        limit = 25000

    estado = request.GET.get('estado', '')
    anio = request.GET.get('anio', '')

    cache_key = f'oc_raw_all_v2_{estado}_{anio}_{limit}'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    qs = OrdenCompra.objects.values(
        'codigo_oc', 'NombreOC', 'EstadoOC', 'TipoOC', 'TipoMoneda',
        'FechaCreacion', 'FechaEnvio', 'FechaAceptacion',
        'TotalNeto', 'TotalBruto',
        'C_Unidad', 'C_CodigoUnidad',
        'P_Nombre', 'P_Rut',
        'LinkMP', 'EnlacePAC',
        'CodigoLicitacion', 'ID_Proyecto', 'Nombre_Proyecto',
        'TipoCompraInterna', 'TipoOCInterno', 'DescripcionTipoOC',
    )

    if estado:
        qs = qs.filter(EstadoOC__iexact=estado)
    if anio:
        try:
            qs = qs.filter(FechaEnvio__year=int(anio))
        except (ValueError, TypeError):
            pass

    data = list(qs[:limit])
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ordenes_compra_proyectos_licitacion(request):
    """
    Mapa cross-year: CodigoLicitacion → lista de {id_proyecto, nombre_proyecto, n}.
    Usado para sugerir proyectos PAC a OC no enlazadas.
    """
    cache_key = 'oc_proyectos_licitacion_v2'
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    qs = (
        OrdenCompra.objects
        .exclude(CodigoLicitacion__isnull=True).exclude(CodigoLicitacion='')
        .exclude(ID_Proyecto__isnull=True).exclude(ID_Proyecto='')
        .values('CodigoLicitacion', 'ID_Proyecto')
        .annotate(n=Count('codigo_oc'))
        .order_by('CodigoLicitacion', '-n')
    )

    # Nombre por ID_Proyecto — tomamos el primer valor no vacío encontrado
    nombres = dict(
        OrdenCompra.objects
        .exclude(ID_Proyecto__isnull=True).exclude(ID_Proyecto='')
        .exclude(Nombre_Proyecto__isnull=True).exclude(Nombre_Proyecto='')
        .values_list('ID_Proyecto', 'Nombre_Proyecto')
        .distinct()[:5000]
    )

    result = {}
    for r in qs:
        lic = r['CodigoLicitacion']
        if lic not in result:
            result[lic] = []
        result[lic].append({
            'id_proyecto':      r['ID_Proyecto'],
            'nombre_proyecto':  nombres.get(r['ID_Proyecto'], ''),
            'n':                r['n'],
        })

    cache.set(cache_key, result, timeout=600)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def facturas_raw_all(request):
    """Devuelve facturas sin paginación. Filtro de año a nivel DB usando __endswith (formato DD-MM-YYYY)."""
    anio = request.GET.get('anio', '').strip()

    cache_key = f'facturas_raw_all_{anio}'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    qs = Factura.objects.values(
        'id', 'tipo_documento', 'folio', 'emisor', 'razon_social_emisor',
        'emision', 'monto_neto', 'monto_exento', 'monto_iva', 'monto_total',
        'estado_acepta', 'uri', 'estado_reclamo', 'fecha_reclamo',
        'estado_devengo', 'folio_oc', 'fecha_ingreso_oc',
        'folio_rc', 'fecha_ingreso_rc', 'ticket_devengo', 'folio_sigfe',
        'tarea_actual', 'fecha_ingreso', 'fecha_aceptacion', 'fecha_devengo',
    )
    if anio and anio.isdigit() and len(anio) == 4:
        qs = qs.filter(emision__endswith=anio)

    data = list(qs)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


# =============================================================================
# Módulo Garantías — Registro de Boletas
# =============================================================================

class NoPaginationMixin:
    """Desactiva la paginación para un ViewSet específico."""
    pagination_class = None


class ProveedorViewSet(NoPaginationMixin, viewsets.ReadOnlyModelViewSet):
    """Lista de proveedores para el dropdown del formulario de boletas."""
    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [drf_filters.SearchFilter]
    search_fields = ['nombre', 'rut']


class CompradorViewSet(NoPaginationMixin, viewsets.ReadOnlyModelViewSet):
    """Lista de compradores para el dropdown del formulario de boletas."""
    queryset = Comprador.objects.all()
    serializer_class = CompradorSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [drf_filters.SearchFilter]
    search_fields = ['nombre']


class BoletaGarantiaViewSet(viewsets.ModelViewSet):
    """CRUD completo de Boletas de Garantía con auditoría en modificación y eliminación."""
    queryset = BoletaGarantia.objects.select_related('proveedor', 'comprador', 'creado_por').all()
    serializer_class = BoletaGarantiaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ['tipo_documento', 'formato_documento', 'banco', 'proveedor', 'comprador']
    search_fields = ['numero_documento', 'nombre_licitacion', 'id_licitacion', 'proveedor__nombre']
    ordering_fields = [
        'vigencia_garantia', 'fecha_emision', 'mes_anio', 'monto', 'created_at',
        'numero_documento', 'tipo_documento', 'proveedor__nombre', 'estado_trazabilidad',
    ]
    ordering = ['-vigencia_garantia']

    def _snapshot(self, instance):
        """Serializa una instancia a dict para guardar en auditoría."""
        return BoletaGarantiaSerializer(instance, context={'request': self.request}).data

    def perform_create(self, serializer):
        serializer.save(creado_por=self.request.user)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        snapshot_antes = self._snapshot(instance)

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            logger.warning('Errores de validación en UPDATE boleta %s: %s', instance.pk, serializer.errors)
            return Response(serializer.errors, status=400)

        self.perform_update(serializer)

        BoletaGarantiaAudit.objects.create(
            accion='MODIFICAR',
            boleta_id=instance.pk,
            numero_documento=instance.numero_documento,
            snapshot_antes=snapshot_antes,
            snapshot=self._snapshot(serializer.instance),
            eliminado_por=request.user,
            razon='',
        )
        logger.info('Boleta %s modificada por %s.', instance.pk, request.user.username)

        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def perform_destroy(self, instance):
        razon = self.request.data.get('razon', '')
        BoletaGarantiaAudit.objects.create(
            accion='ELIMINAR',
            boleta_id=instance.pk,
            numero_documento=instance.numero_documento,
            snapshot=self._snapshot(instance),
            eliminado_por=self.request.user,
            razon=razon,
        )
        logger.info(
            'Boleta %s eliminada por %s. Razón: %s',
            instance.pk, self.request.user.username, razon or '(sin razón)',
        )
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=204)


class BoletaGarantiaAuditViewSet(NoPaginationMixin, viewsets.ReadOnlyModelViewSet):
    """Historial de auditoría de boletas (solo lectura)."""
    queryset = BoletaGarantiaAudit.objects.select_related('eliminado_por').all()
    serializer_class = BoletaGarantiaAuditSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [drf_filters.OrderingFilter]
    ordering_fields = ['eliminado_en', 'boleta_id']
    ordering = ['-eliminado_en']


# =============================================================================
# PAC / Compras Ágiles
# =============================================================================

class PlanerPACViewSet(NoPaginationMixin, viewsets.ReadOnlyModelViewSet):
    queryset = PlanerPAC.objects.all()
    serializer_class = PlanerPACSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_fields = ['unidad_compra', 'tipo_proyecto', 'pac']
    search_fields = ['nombre_proyecto', 'nombre_item', 'id_proyecto']


class CompraAgilResumenViewSet(NoPaginationMixin, viewsets.ReadOnlyModelViewSet):
    """Sin paginación: devuelve todos los registros en 1 sola petición.
    Con 1489 CAs el JSON pesa ~300KB — manejable. Evita 30 peticiones secuenciales."""
    queryset = CompraAgilResumen.objects.all()
    serializer_class = CompraAgilResumenSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_fields = ['estadoglosa', 'unidadcompra']
    search_fields = ['codigocompraagil', 'nombre']

    def get_queryset(self):
        qs = CompraAgilResumen.objects.all()
        fecha_desde = self.request.query_params.get('fecha_desde')
        fecha_hasta = self.request.query_params.get('fecha_hasta')
        if fecha_desde:
            qs = qs.filter(fechapublicacion__gte=fecha_desde)
        if fecha_hasta:
            qs = qs.filter(fechapublicacion__lte=fecha_hasta)
        return qs


class CompraAgilProductoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CompraAgilProducto.objects.all()
    serializer_class = CompraAgilProductoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['codigocompraagil']


class CompraAgilProveedorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CompraAgilProveedor.objects.all()
    serializer_class = CompraAgilProveedorSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['codigocompraagil', 'proveedorseleccionado']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def compraagil_ahorro_stats_view(request):
    """KPIs y desglose de ahorro para el módulo Compra Ágil. Cache 5min por rango de fechas."""
    fecha_desde = request.GET.get('fecha_desde', '')
    fecha_hasta = request.GET.get('fecha_hasta', '')
    cache_key = f'compraagil_ahorro_{fecha_desde}_{fecha_hasta}'
    data = cache.get(cache_key)
    if not data:
        try:
            data = calcular_compraagil_ahorro_stats(
                fecha_desde=fecha_desde or None,
                fecha_hasta=fecha_hasta or None,
            )
            cache.set(cache_key, data, timeout=300)
        except Exception as e:
            logger.error('compraagil_ahorro_stats_view error: %s', e, exc_info=True)
            return Response({'detail': f'Error al calcular estadísticas: {e}'}, status=500)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def compraagil_comparativa_view(request):
    """Estadísticas comparativas año a año para el tab Comparativa."""
    from .ml_services import calcular_comparativa_stats
    data = cache.get('compraagil_comparativa')
    if not data:
        data = calcular_comparativa_stats()
        cache.set('compraagil_comparativa', data, timeout=600)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def compraagil_patrones_view(request):
    """
    Patrones ML segmentados por tipo para carga progresiva en el frontend.
    ?tipo=clusters|asociaciones|candidatos
    Cada tipo tiene su propio cache y try/except — un fallo no afecta a los demás.
    """
    from .ml_services import (
        calcular_clusters_productos,
        calcular_asociaciones_proveedor,
        calcular_apriori_comprador,
        calcular_candidatos_convenio,
    )
    try:
        umbral_monto = int(request.GET.get('umbral_monto', 300000))
        umbral_freq  = int(request.GET.get('umbral_frecuencia', 3))
        min_support  = float(request.GET.get('min_support', 0.05))
    except (ValueError, TypeError):
        umbral_monto, umbral_freq, min_support = 300000, 3, 0.05

    tipo = request.GET.get('tipo', 'clusters')

    if tipo == 'clusters':
        cache_key = 'compraagil_clusters'
        data = cache.get(cache_key)
        if not data:
            try:
                data = calcular_clusters_productos()
            except Exception as e:
                logger.error('ML clusters error: %s', e)
                data = {'error': str(e), 'clusters': [], 'n_productos': 0, 'n_analizados': 0}
            cache.set(cache_key, data, timeout=600)

    elif tipo == 'asociaciones':
        cache_key = f'compraagil_asoc_{min_support}'
        data = cache.get(cache_key)
        if not data:
            asoc_prov, asoc_comp = {}, {}
            try:
                asoc_prov = calcular_asociaciones_proveedor(min_support)
            except Exception as e:
                logger.error('ML apriori proveedor error: %s', e)
                asoc_prov = {'error': str(e), 'frecuentes': [], 'reglas': []}
            try:
                asoc_comp = calcular_apriori_comprador(min_support)
            except Exception as e:
                logger.error('ML fpgrowth comprador error: %s', e)
                asoc_comp = {'error': str(e), 'frecuentes': [], 'reglas': []}
            data = {'asociaciones_proveedor': asoc_prov, 'asociaciones_comprador': asoc_comp}
            cache.set(cache_key, data, timeout=600)

    elif tipo == 'candidatos':
        cache_key = f'compraagil_cand_{umbral_monto}_{umbral_freq}'
        data = cache.get(cache_key)
        if not data:
            try:
                data = calcular_candidatos_convenio(umbral_monto, umbral_freq)
            except Exception as e:
                logger.error('ML candidatos error: %s', e)
                data = {'error': str(e), 'candidatos': [], 'total_encontrados': 0}
            cache.set(cache_key, data, timeout=600)

    else:
        return Response({'error': f'tipo no reconocido: {tipo}'}, status=400)

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def compraagil_anios_view(request):
    """Años distintos disponibles en fechapublicacion de CompraAgilResumen."""
    from django.db.models.functions import Substr
    data = cache.get('compraagil_anios')
    if not data:
        anios = (
            CompraAgilResumen.objects
            .annotate(anio=Substr('fechapublicacion', 1, 4))
            .values_list('anio', flat=True)
            .distinct()
        )
        data = sorted({a for a in anios if a and a.isdigit() and len(a) == 4}, reverse=True)
        cache.set('compraagil_anios', data, timeout=600)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pac_indicadores_view(request):
    """Indicadores Res.188 calculados desde la BD. Cache 5min."""
    try:
        anio = int(request.GET.get('anio', 2026))
    except (ValueError, TypeError):
        anio = 2026

    cache_key = f'pac_indicadores_res188_{anio}'
    data = cache.get(cache_key)
    if not data:
        data = calcular_indicadores_res188(anio)
        cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pac_oc_stats_view(request):
    """Estadísticas de OC para los 8 paneles del tab Órdenes de Compra. Cache 5min."""
    try:
        anio = int(request.GET.get('anio', 2026))
    except (ValueError, TypeError):
        anio = 2026

    cache_key = f'pac_oc_stats_v4_{anio}'
    data = cache.get(cache_key)
    if not data:
        data = calcular_oc_stats(anio)
        cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pac_oc_productos_view(request):
    """Estadísticas de DetalleOrdenCompra para el tab Análisis Productos. Cache 5min."""
    try:
        anio = int(request.GET.get('anio', 2026))
    except (ValueError, TypeError):
        anio = 2026

    cache_key = f'pac_oc_productos_{anio}'
    data = cache.get(cache_key)
    if not data:
        data = calcular_oc_productos(anio)
        cache.set(cache_key, data, timeout=300)
    return Response(data)


# =============================================================================
# Revisión OC Corregibles
# =============================================================================

class RevisionOCCorregibleViewSet(viewsets.ModelViewSet):
    """CRUD de revisiones de OC corregibles. revisado_por se asigna del JWT."""
    queryset = RevisionOCCorregible.objects.all()
    serializer_class = RevisionOCCorregibleSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [DjangoFilterBackend, drf_filters.OrderingFilter]
    filterset_fields = ['codigo_oc', 'resultado']
    ordering_fields = ['fecha_revision', 'resultado']
    ordering = ['-fecha_revision']

    def perform_create(self, serializer):
        serializer.save(revisado_por=self.request.user.username)


# =============================================================================
# Calendario — endpoints autónomos (sin filtro de Estado, año por fechas de evento)
# =============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def licitaciones_anos_calendario(request):
    """
    Años en que existe al menos una licitación con alguna fecha de evento en ese año.
    Usado por el selector de año del Calendario. Cache 10 min.
    """
    cache_key = 'licitaciones_anos_calendario_v1'
    if cached := cache.get(cache_key):
        return Response(cached)

    from django.db import connection
    years = set()
    with connection.cursor() as cursor:
        for field in _CALENDAR_DATE_FIELDS:
            try:
                cursor.execute(
                    f'SELECT DISTINCT YEAR(`{field}`) FROM api_licitacion WHERE `{field}` IS NOT NULL'
                )
                for (yr,) in cursor.fetchall():
                    if yr is not None and int(yr) >= 2010:  # excluir años basura
                        years.add(int(yr))
            except Exception:
                pass

    data = sorted(years, reverse=True)
    cache.set(cache_key, data, timeout=600)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def licitaciones_calendario(request):
    """
    Licitaciones para el Calendario.
    Filtra por 'anio': licitaciones que tienen CUALQUIER fecha de evento en ese año.
    Sin filtro de Estado. Sin paginación (máx 2000). Cache 5 min por año.
    """
    anio = request.query_params.get('anio', '').strip()
    cache_key = f'licitaciones_calendario_{anio or "all"}'
    if cached := cache.get(cache_key):
        return Response(cached)

    qs = Licitacion.objects.all()
    if anio and anio.isdigit():
        year = int(anio)
        q = Q()
        for f in _CALENDAR_DATE_FIELDS:
            q |= Q(**{f'{f}__year': year})
        qs = qs.filter(q)

    serializer = LicitacionCalendarioSerializer(qs[:2000], many=True)
    data = serializer.data
    cache.set(cache_key, data, timeout=300)
    return Response(data)


# =============================================================================
# Compra Ágil — Calendario autónomo
# =============================================================================

_CA_DATE_FIELDS = ['fechapublicacion', 'fechacierre', 'fechaultimocambio']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def compraagil_anos_calendario(request):
    """Años distintos con al menos una Compra Ágil con evento en ese año. Cache 10 min."""
    cache_key = 'compraagil_anos_calendario_v1'
    if cached := cache.get(cache_key):
        return Response(cached)

    from django.db import connection
    years = set()
    with connection.cursor() as cursor:
        for field in _CA_DATE_FIELDS:
            db_col = CompraAgilResumen._meta.get_field(field).column
            try:
                cursor.execute(
                    f'SELECT DISTINCT YEAR(`{db_col}`) FROM api_compraagil_resumen WHERE `{db_col}` IS NOT NULL'
                )
                for (yr,) in cursor.fetchall():
                    if yr is not None and int(yr) >= 2015:
                        years.add(int(yr))
            except Exception:
                pass

    data = sorted(years, reverse=True)
    cache.set(cache_key, data, timeout=600)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def compraagil_calendario(request):
    """
    Compras Ágiles para el Calendario.
    Filtra por 'anio': compras que tienen CUALQUIER fecha de evento en ese año.
    Sin paginación (máx 2000). Cache 5 min por año.
    """
    anio = request.query_params.get('anio', '').strip()
    cache_key = f'compraagil_calendario_{anio or "all"}'
    if cached := cache.get(cache_key):
        return Response(cached)

    qs = CompraAgilResumen.objects.all()
    if anio and anio.isdigit():
        year = int(anio)
        q = Q()
        for f in _CA_DATE_FIELDS:
            q |= Q(**{f'{f}__year': year})
        qs = qs.filter(q)

    serializer = CompraAgilCalendarioSerializer(qs[:2000], many=True)
    data = serializer.data
    cache.set(cache_key, data, timeout=300)
    return Response(data)


# =============================================================================
# Descarga de Ofertas (scraper Mercado Público)
# =============================================================================

_SCRIPT_DESCARGA = (
    Path(__file__).parent.parent.parent / "api" / "DescargaOfertas" / "run_api.py"
)


def _carpeta_descargas() -> Path:
    home = Path.home()
    for candidato in [home / "Downloads", home / "Descargas"]:
        if candidato.exists():
            return candidato
    return home / "Downloads"


def _ejecutar_descarga(task_id: str, codigo: str):
    """Corre el scraper en un hilo daemon y actualiza _tareas_descarga."""
    carpeta_salida = _carpeta_descargas()
    try:
        _tareas_descarga[task_id]["status"] = "en_proceso"
        proc = subprocess.Popen(
            [sys.executable, str(_SCRIPT_DESCARGA), codigo, str(carpeta_salida)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            cwd=str(_SCRIPT_DESCARGA.parent),
        )
        stdout, stderr = proc.communicate()

        if proc.returncode == 0:
            zip_path = None
            carpeta_path = None
            for line in stdout.splitlines():
                if line.startswith("ZIP_PATH:"):
                    zip_path = line[9:].strip()
                elif line.startswith("CARPETA_PATH:"):
                    carpeta_path = line[13:].strip()
            _tareas_descarga[task_id].update(
                status="completado",
                ruta_zip=zip_path,
                ruta_carpeta=carpeta_path,
            )
        else:
            error_msg = stderr[-800:] if stderr else "Error desconocido"
            _tareas_descarga[task_id].update(status="error", error=error_msg)
    except Exception as exc:
        _tareas_descarga[task_id].update(status="error", error=str(exc))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_descarga_ofertas(request):
    """Inicia el scraper de ofertas en segundo plano. Retorna un task_id para polling."""
    codigo = (request.data.get("codigo") or "").strip()
    if not codigo:
        return Response({"error": "Código de licitación requerido."}, status=400)

    task_id = str(uuid.uuid4())[:8]
    _tareas_descarga[task_id] = {
        "status": "iniciado",
        "codigo": codigo,
        "ruta_zip": None,
        "ruta_carpeta": None,
        "error": None,
    }
    hilo = threading.Thread(target=_ejecutar_descarga, args=(task_id, codigo), daemon=True)
    hilo.start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_descarga_ofertas(request, task_id):
    """Retorna el estado actual de una tarea de descarga."""
    tarea = _tareas_descarga.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id": task_id,
        "status": tarea["status"],
        "ruta_zip": tarea.get("ruta_zip"),
        "ruta_carpeta": tarea.get("ruta_carpeta"),
        "error": tarea.get("error"),
    })


# ─── Actualización Compra Ágil desde el dashboard ─────────────────────────────

class _ETLLiveStream:
    """
    Reemplaza sys.stdout durante el ETL.
    Parsea cada línea impresa y actualiza el dict de tarea en tiempo real,
    evitando errores de codificación cp1252 de Windows (los print del ETL usan emojis).
    """

    _SKIP = re.compile(
        r"^\s*(?:={3,}|─{3,}|-{3,}"
        r"|📄\s*Obteniendo página"
        r"|🏥\s*ORGANISMO|🔐\s*VALIDACIÓN|1️⃣|2️⃣"
        r"|EXTRACTOR COMPRA|Región Los Lagos"
        r"|\s*)$"
    )
    _KEEP = re.compile(
        r"[✅⊗✨📊🔄🔗❌⚠️🚀💾]"
        r"|\[\d+/\d+\]"
        r"|registros|OC_Codigo|Método\s*1|SINCRONIZANDO|RESULTADO|INTEGRANDO"
    )

    def __init__(self, task_id: str, total_dias: int):
        self._tid = task_id
        self._total = max(total_dias, 1)
        self._partial = ""
        self._dias_ok = 0
        self._logs: list = []

    def write(self, text: str):
        if _tareas_actualizacion_ca.get(self._tid, {}).get("status") == "cancelado":
            raise SystemExit("Cancelado por el usuario")
        self._partial += text
        while "\n" in self._partial:
            line, self._partial = self._partial.split("\n", 1)
            self._handle(line.rstrip("\r"))

    def flush(self):
        pass

    def _handle(self, line: str):
        t = _tareas_actualizacion_ca.get(self._tid)
        if not t:
            return

        upd: dict = {}

        # Día procesando
        m = re.search(r"PROCESANDO[:\s]+(\d{2}-\d{2}-\d{4})", line)
        if m:
            upd["dia_actual"] = m.group(1)
            upd["paso_desc"] = f"Procesando {m.group(1)}..."

        # Total registros en región
        m = re.search(r"Total:\s*(\d+)\s*registros en\s*(\d+)\s*páginas", line)
        if m:
            upd["total_region_dia"] = int(m.group(1))

        # SSO validados del día
        m = re.search(r"SSO.*ambas.*validaciones.*:\s*(\d+)", line)
        if m:
            upd["sso_dia"] = int(m.group(1))

        # Día completado → avanza barra
        if "COMPLETADO EXITOSAMENTE" in line and "DÍA" in line:
            self._dias_ok += 1
            pct = min(99, round(self._dias_ok / self._total * 100))
            upd["dias_completados"] = self._dias_ok
            upd["progreso_pct"] = pct
            upd["paso_desc"] = f"{self._dias_ok}/{self._total} días completados"

        # Integración de maestros (dentro de refresh)
        if "INTEGRANDO NUEVOS DATOS" in line:
            upd["paso_desc"] = "Integrando datos en maestros..."

        m = re.search(r"Maestro Resumen:\s*(\d+)", line)
        if m:
            upd["maestro_resumen_total"] = int(m.group(1))

        # Enlace OC
        m = re.search(r"CAs con OC_Codigo:\s*(\d+)/(\d+)", line)
        if m:
            upd["oc_encontradas"] = int(m.group(1))
            upd["oc_total_ps"] = int(m.group(2))

        m = re.search(r"Método 1:\s*(\d+)\s*códigos enlazados", line)
        if m:
            upd["oc_metodo1"] = int(m.group(1))

        # Sincronización con MariaDB
        if "SINCRONIZANDO MAESTROS" in line:
            upd["paso_desc"] = "Subiendo tablas a base de datos..."

        m = re.search(r"(api_compraagil_\w+):\s*(\d+)\s*registros", line)
        if m:
            tabla_n = t.get("tablas_sync", 0) + 1
            upd["tablas_sync"] = tabla_n
            upd["ultima_tabla_sync"] = f"{m.group(1)}: {m.group(2)} reg."
            upd["progreso_sync_pct"] = min(100, round(tabla_n / 5 * 100))

        # Log visual — filtrar líneas ruidosas, conservar informativas
        stripped = line.strip()
        if stripped and not self._SKIP.match(stripped) and self._KEEP.search(stripped):
            self._logs.append(stripped)
            if len(self._logs) > 12:
                self._logs.pop(0)
            upd["logs_recientes"] = list(self._logs)

        if upd:
            t.update(upd)


def _ejecutar_actualizacion_compraagil(task_id: str, fecha_desde_str: str, fecha_hasta_str: str):
    """Ejecuta el ETL de Compra Ágil en un hilo daemon con reporte de progreso en tiempo real."""
    import contextlib
    import datetime as _dt

    api_path = str(_RUTA_AG_SERVIDOR)
    if api_path not in sys.path:
        sys.path.insert(0, api_path)

    try:
        import AG_SSO_SERVER as ag
    except ImportError as exc:
        _tareas_actualizacion_ca[task_id].update(
            status="error", error=f"No se pudo cargar AG_SSO_SERVER: {exc}"
        )
        return

    try:
        d1 = _dt.datetime.strptime(fecha_desde_str, "%Y-%m-%d").date()
        d2 = _dt.datetime.strptime(fecha_hasta_str, "%Y-%m-%d").date()
        total_dias = (d2 - d1).days + 1

        _tareas_actualizacion_ca[task_id].update(
            total_dias=total_dias, dias_completados=0, progreso_pct=0,
            dia_actual=None, logs_recientes=[], oc_encontradas=None,
            oc_total_ps=None, oc_metodo1=None,
            maestro_resumen_total=None,
            tablas_sync=0, progreso_sync_pct=0, ultima_tabla_sync=None,
            diff=None,
        )

        _tareas_actualizacion_ca[task_id]["thread_id"] = threading.current_thread().ident
        stream = _ETLLiveStream(task_id, total_dias)

        # ── Paso 1: refresh (descarga + enlace OC al final) ──
        _tareas_actualizacion_ca[task_id].update(
            status="en_proceso", paso=1,
            paso_desc="Iniciando descarga de datos...",
        )
        with contextlib.redirect_stdout(stream):
            ag.refresh_base_datos(d1, d2)

        # ── Snapshot pre-sync: estado actual de la BD ──
        from django.db import close_old_connections as _close_ca
        _close_ca()
        snap_pre_ca: dict = {}
        try:
            snap_pre_ca = {
                r["codigocompraagil"]: {
                    "estado": r["estadoglosa"] or "",
                    "oc":     r["oc_codigo"] or "",
                }
                for r in CompraAgilResumen.objects.values("codigocompraagil", "estadoglosa", "oc_codigo")
            }
        except Exception:
            pass

        _tareas_actualizacion_ca[task_id].update(
            paso=2, progreso_pct=100,
            paso_desc="Sincronizando con base de datos...",
        )

        # ── Paso 2: sincronizar con MariaDB ──
        with contextlib.redirect_stdout(stream):
            ag.sincronizar_con_servidor()

        # ── Diff post-sync ──
        _tareas_actualizacion_ca[task_id].update(paso_desc="Calculando cambios detectados...")
        diff_ca: dict = {
            "nuevas": [], "cambiadas": [], "oc_vinculadas": [],
            "nuevas_count": 0, "cambiadas_count": 0, "oc_vinculadas_count": 0,
            "total_antes": len(snap_pre_ca), "total_despues": 0,
        }
        try:
            _close_ca()
            campos_ca = ("codigocompraagil", "estadoglosa", "estadocodigo",
                         "nombre", "unidadcompra", "presupuestoestimado",
                         "montodisponibleclp", "oc_codigo", "fechacierre",
                         "totalofertasrecibidas")
            snap_post_ca = {
                r["codigocompraagil"]: r
                for r in CompraAgilResumen.objects.values(*campos_ca)
            }
            diff_ca["total_despues"] = len(snap_post_ca)

            nuevas_ca, cambiadas_ca, oc_vinculadas_ca = [], [], []

            for cod, det in snap_post_ca.items():
                base = {
                    "codigo":    cod,
                    "nombre":    det.get("nombre") or "",
                    "unidad":    det.get("unidadcompra") or "",
                    "monto":     str(det.get("presupuestoestimado") or det.get("montodisponibleclp") or ""),
                    "oc_codigo": det.get("oc_codigo") or "",
                    "cierre":    str(det.get("fechacierre") or ""),
                    "ofertas":   str(det.get("totalofertasrecibidas") or ""),
                }
                if cod not in snap_pre_ca:
                    nuevas_ca.append({**base, "estado": det.get("estadoglosa") or ""})
                else:
                    pre = snap_pre_ca[cod]
                    estado_nuevo = det.get("estadoglosa") or ""
                    if pre["estado"] != estado_nuevo:
                        cambiadas_ca.append({**base,
                            "estado_anterior": pre["estado"],
                            "estado_nuevo":    estado_nuevo,
                        })
                    # OC recién vinculada: antes sin OC, ahora con OC
                    oc_nueva = det.get("oc_codigo") or ""
                    if not pre["oc"] and oc_nueva:
                        oc_vinculadas_ca.append({**base, "estado": estado_nuevo})

            nuevas_ca.sort(key=lambda x: x.get("cierre", "") or "", reverse=True)
            cambiadas_ca.sort(key=lambda x: x["codigo"])
            oc_vinculadas_ca.sort(key=lambda x: x["codigo"])

            diff_ca.update({
                "nuevas":            nuevas_ca,
                "cambiadas":         cambiadas_ca,
                "oc_vinculadas":     oc_vinculadas_ca,
                "nuevas_count":      len(nuevas_ca),
                "cambiadas_count":   len(cambiadas_ca),
                "oc_vinculadas_count": len(oc_vinculadas_ca),
            })
        except Exception as exc_diff:
            diff_ca["error_diff"] = str(exc_diff)

        _tareas_actualizacion_ca[task_id].update(
            status="completado", paso=3,
            paso_desc="Completado exitosamente",
            progreso_sync_pct=100,
            diff=diff_ca,
        )

    except Exception as exc:
        _tareas_actualizacion_ca[task_id].update(status="error", error=str(exc))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_actualizacion_compraagil(request):
    """Inicia el ETL de Compra Ágil. Body: {fecha_desde, fecha_hasta} en formato YYYY-MM-DD."""
    for tarea in _tareas_actualizacion_ca.values():
        if tarea.get("status") in ("iniciado", "en_proceso"):
            return Response({"error": "Ya hay una actualización en curso."}, status=409)

    fecha_desde = (request.data.get("fecha_desde") or "").strip()
    fecha_hasta = (request.data.get("fecha_hasta") or "").strip()
    if not fecha_desde or not fecha_hasta:
        return Response(
            {"error": "Parámetros fecha_desde y fecha_hasta requeridos (YYYY-MM-DD)."},
            status=400,
        )

    task_id = str(uuid.uuid4())[:8]
    _tareas_actualizacion_ca[task_id] = {
        "status": "iniciado",
        "paso": 0,
        "paso_desc": "Iniciando...",
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "error": None,
    }
    threading.Thread(
        target=_ejecutar_actualizacion_compraagil,
        args=(task_id, fecha_desde, fecha_hasta),
        daemon=True,
    ).start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_actualizacion_compraagil(request, task_id):
    """Retorna el estado completo de una tarea de actualización Compra Ágil."""
    tarea = _tareas_actualizacion_ca.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id": task_id,
        "status": tarea["status"],
        "paso": tarea["paso"],
        "paso_desc": tarea["paso_desc"],
        "fecha_desde": tarea.get("fecha_desde"),
        "fecha_hasta": tarea.get("fecha_hasta"),
        # Progreso paso 1
        "total_dias": tarea.get("total_dias", 0),
        "dias_completados": tarea.get("dias_completados", 0),
        "progreso_pct": tarea.get("progreso_pct", 0),
        "dia_actual": tarea.get("dia_actual"),
        # Progreso paso 2
        "tablas_sync": tarea.get("tablas_sync", 0),
        "progreso_sync_pct": tarea.get("progreso_sync_pct", 0),
        "ultima_tabla_sync": tarea.get("ultima_tabla_sync"),
        # Resultados
        "oc_encontradas": tarea.get("oc_encontradas"),
        "oc_total_ps": tarea.get("oc_total_ps"),
        "oc_metodo1": tarea.get("oc_metodo1"),
        "maestro_resumen_total": tarea.get("maestro_resumen_total"),
        # Log en tiempo real
        "logs_recientes": tarea.get("logs_recientes", []),
        # Diff de cambios (disponible al completar)
        "diff": tarea.get("diff"),
        "error": tarea.get("error"),
    })


# ─── Actualización Órdenes de Compra desde el dashboard ──────────────────────

class _ETLLiveStream_OC:
    """
    Reemplaza sys.stdout durante el ETL de OC.
    Parsea líneas informativas y actualiza el dict de tarea en tiempo real.
    Maneja tanto \\n (líneas normales) como \\r (progreso in-place de ThreadPoolExecutor).
    """

    _SKIP = re.compile(
        r"^\s*(?:={3,}|─{3,}|-{3,}"
        r"|EXTRACTOR SSO|GESTIÓN TOTAL"
        r"|── Descarga|── Maestros|── Sincronización|── Reparación"
        r"|\s*)$"
    )
    _KEEP = re.compile(
        r"[✅✨📊🔄🔗❌⚠️🚀💾]|>>>"
        r"|registros|Guardado|REFRESH|ENLACE|PAC|Vaciando|Insertando|TOTAL EN BD"
        r"|Maestro|actualizado|COMPLETADO|Sin datos"
    )

    def __init__(self, task_id: str, total_dias: int):
        self._tid = task_id
        self._total = max(total_dias, 1)
        self._partial = ""
        self._logs: list = []

    def write(self, text: str):
        if _tareas_actualizacion_oc.get(self._tid, {}).get("status") == "cancelado":
            raise SystemExit("Cancelado por el usuario")
        self._partial += text
        while "\n" in self._partial:
            raw_line, self._partial = self._partial.split("\n", 1)
            if "\r" in raw_line:
                raw_line = raw_line.split("\r")[-1]
            self._handle(raw_line.strip())

    def flush(self):
        pass

    def _handle(self, line: str):
        t = _tareas_actualizacion_oc.get(self._tid)
        if not t or not line:
            return

        upd: dict = {}

        # Extracción diaria
        m = re.search(r"EXTRACCIÓN SSO[:\s]+(\d{2}/\d{2}/\d{4})", line)
        if m:
            upd["paso_desc"] = f"Procesando {m.group(1)}..."

        if "Sin datos en API" in line or "Sin datos" in line:
            upd["paso_desc"] = "Sin datos para este día, continuando..."

        # Integración maestros
        if "INTEGRANDO NUEVOS DATOS" in line:
            upd["paso_desc"] = "Integrando datos en maestros..."

        m = re.search(r"Maestro Resumen actualizado.*?(\d+)", line)
        if m:
            upd["maestro_resumen_total"] = int(m.group(1))

        m = re.search(r"Maestro Detalles actualizado.*?(\d+)", line)
        if m:
            upd["maestro_detalles_total"] = int(m.group(1))

        # Enlace PAC
        if "ENLACE CON PLAN ANUAL" in line or "INICIANDO ENLACE" in line:
            upd["paso_desc"] = "Enlazando con Plan Anual de Compras (PAC)..."

        m = re.search(r"actualizado exitosamente con\s*(\d+)\s*registros", line)
        if m:
            upd["pac_registros"] = int(m.group(1))

        # Subida a Django
        if "CARGANDO CSVs" in line or "SINCRONIZACIÓN MASIVA" in line:
            upd["paso_desc"] = "Preparando carga a base de datos..."

        if "Vaciando la base de datos" in line:
            upd["paso_desc"] = "Vaciando registros anteriores..."
            upd["progreso_sync_pct"] = 20

        m = re.search(r"Insertando\s+(\d[\d,]*)\s+Órdenes de Compra", line)
        if m:
            n = int(m.group(1).replace(",", ""))
            upd["ocs_subidas"] = n
            upd["paso_desc"] = f"Insertando {n:,} órdenes de compra..."
            upd["progreso_sync_pct"] = 50

        m = re.search(r"Insertando\s+(\d[\d,]*)\s+Detalles", line)
        if m:
            n = int(m.group(1).replace(",", ""))
            upd["detalles_subidos"] = n
            upd["paso_desc"] = f"Insertando {n:,} líneas de detalle..."
            upd["progreso_sync_pct"] = 75

        if "Sincronización masiva finalizada" in line:
            upd["progreso_sync_pct"] = 100
            upd["paso_desc"] = "Sincronización completada."

        m = re.search(r"TOTAL EN BD:\s*(\d+).*?(\d+)\s*Detalles", line)
        if m:
            upd["ocs_en_bd"] = int(m.group(1))
            upd["detalles_en_bd"] = int(m.group(2))

        # Log visual
        if not self._SKIP.match(line) and self._KEEP.search(line):
            self._logs.append(line)
            if len(self._logs) > 12:
                self._logs.pop(0)
            upd["logs_recientes"] = list(self._logs)

        if upd:
            t.update(upd)


def _ejecutar_actualizacion_oc(task_id: str, fecha_desde_str: str, fecha_hasta_str: str):
    """Ejecuta el ETL de OC en un hilo daemon con reporte de progreso en tiempo real."""
    import contextlib
    import datetime as _dt

    api_path = str(_RUTA_AG_SERVIDOR)
    if api_path not in sys.path:
        sys.path.insert(0, api_path)

    try:
        import OC_SSO_SERVER as oc
    except ImportError as exc:
        _tareas_actualizacion_oc[task_id].update(
            status="error", error=f"No se pudo cargar OC_SSO_SERVER: {exc}"
        )
        return

    try:
        d1 = _dt.datetime.strptime(fecha_desde_str, "%Y-%m-%d").date()
        d2 = _dt.datetime.strptime(fecha_hasta_str, "%Y-%m-%d").date()
        total_dias = (d2 - d1).days + 1

        _tareas_actualizacion_oc[task_id].update(
            total_dias=total_dias, dias_completados=0, progreso_pct=0,
            dia_actual=None, ocs_dia=0, total_ocs_dia=0,
            logs_recientes=[], maestro_resumen_total=None,
            maestro_detalles_total=None, pac_registros=None,
            ocs_subidas=None, detalles_subidos=None,
            ocs_en_bd=None, detalles_en_bd=None,
            progreso_sync_pct=0, diff=None,
        )

        _tareas_actualizacion_oc[task_id]["thread_id"] = threading.current_thread().ident
        stream = _ETLLiveStream_OC(task_id, total_dias)
        progress_state: dict = {"days_done": set()}

        def _on_progress(fecha, codigo_oc, done, total):
            if _tareas_actualizacion_oc.get(task_id, {}).get("status") == "cancelado":
                raise SystemExit("Cancelado por el usuario")
            if total > 0 and done >= total:
                progress_state["days_done"].add(fecha)
            dias_ok = len(progress_state["days_done"])
            frac = (dias_ok + (done / max(total, 1))) / max(total_dias, 1)
            pct = min(99, round(frac * 100))
            _tareas_actualizacion_oc[task_id].update(
                dia_actual=fecha.strftime("%d-%m-%Y"),
                ocs_dia=done,
                total_ocs_dia=total,
                progreso_pct=pct,
                dias_completados=dias_ok,
                paso_desc=f"Procesando {fecha.strftime('%d-%m-%Y')} — {done}/{total} OCs",
            )

        # ── Paso 1: refresh (descarga + maestros + PAC) ──
        _tareas_actualizacion_oc[task_id].update(
            status="en_proceso", paso=1,
            paso_desc="Iniciando descarga de Órdenes de Compra...",
        )
        with contextlib.redirect_stdout(stream):
            oc.refresh_base_datos(d1, d2, progress_callback=_on_progress)

        # ── Snapshot pre-sync: capturar estado actual de la BD ──
        from django.db import close_old_connections as _close_conns
        _close_conns()
        snap_pre: dict = {}
        try:
            snap_pre = dict(OrdenCompra.objects.values_list("codigo_oc", "EstadoOC"))
        except Exception:
            pass

        _tareas_actualizacion_oc[task_id].update(
            paso=2, progreso_pct=100,
            paso_desc="Sincronizando con base de datos...",
        )

        # ── Paso 2: subir maestros a Django/MariaDB ──
        with contextlib.redirect_stdout(stream):
            oc.subir_maestros_a_django()

        # ── Diff post-sync: calcular qué cambió ──
        _tareas_actualizacion_oc[task_id].update(paso_desc="Calculando cambios detectados...")
        diff: dict = {
            "nuevas": [], "cambiadas": [],
            "nuevas_count": 0, "cambiadas_count": 0,
            "total_antes": len(snap_pre), "total_despues": 0,
        }
        try:
            _close_conns()
            campos = ("codigo_oc", "EstadoOC", "TotalNeto", "TotalBruto",
                      "NombreOC", "P_Nombre", "C_Unidad", "FechaEnvio", "TipoOC")
            snap_post = {r["codigo_oc"]: r for r in OrdenCompra.objects.values(*campos)}
            diff["total_despues"] = len(snap_post)

            nuevas, cambiadas = [], []
            for cod, det in snap_post.items():
                total_raw = str(det.get("TotalNeto") or det.get("TotalBruto") or "")
                base = {
                    "codigo":    cod,
                    "proveedor": det.get("P_Nombre") or "",
                    "unidad":    det.get("C_Unidad") or "",
                    "total":     total_raw,
                    "nombre":    det.get("NombreOC") or "",
                    "tipo":      det.get("TipoOC") or "",
                }
                if cod not in snap_pre:
                    nuevas.append({**base,
                        "estado": det.get("EstadoOC") or "",
                        "fecha":  str(det.get("FechaEnvio") or ""),
                    })
                elif snap_pre[cod] != (det.get("EstadoOC") or ""):
                    cambiadas.append({**base,
                        "estado_anterior": snap_pre[cod] or "",
                        "estado_nuevo":    det.get("EstadoOC") or "",
                    })

            nuevas.sort(key=lambda x: x.get("fecha", "") or "", reverse=True)
            cambiadas.sort(key=lambda x: x["codigo"])

            diff.update({
                "nuevas":         nuevas,
                "cambiadas":      cambiadas,
                "nuevas_count":   len(nuevas),
                "cambiadas_count": len(cambiadas),
            })
        except Exception as exc_diff:
            diff["error_diff"] = str(exc_diff)

        _tareas_actualizacion_oc[task_id].update(
            status="completado", paso=3,
            paso_desc="Completado exitosamente",
            progreso_sync_pct=100,
            diff=diff,
        )

    except Exception as exc:
        _tareas_actualizacion_oc[task_id].update(status="error", error=str(exc))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_actualizacion_oc(request):
    """Inicia el ETL de OC. Body: {fecha_desde, fecha_hasta} en formato YYYY-MM-DD."""
    for tarea in _tareas_actualizacion_oc.values():
        if tarea.get("status") in ("iniciado", "en_proceso"):
            return Response({"error": "Ya hay una actualización de OC en curso."}, status=409)

    fecha_desde = (request.data.get("fecha_desde") or "").strip()
    fecha_hasta = (request.data.get("fecha_hasta") or "").strip()
    if not fecha_desde or not fecha_hasta:
        return Response(
            {"error": "Parámetros fecha_desde y fecha_hasta requeridos (YYYY-MM-DD)."},
            status=400,
        )

    task_id = str(uuid.uuid4())[:8]
    _tareas_actualizacion_oc[task_id] = {
        "status": "iniciado",
        "paso": 0,
        "paso_desc": "Iniciando...",
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "error": None,
    }
    threading.Thread(
        target=_ejecutar_actualizacion_oc,
        args=(task_id, fecha_desde, fecha_hasta),
        daemon=True,
    ).start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_actualizacion_oc(request, task_id):
    """Retorna el estado completo de una tarea de actualización OC."""
    tarea = _tareas_actualizacion_oc.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id": task_id,
        "status": tarea["status"],
        "paso": tarea["paso"],
        "paso_desc": tarea["paso_desc"],
        "fecha_desde": tarea.get("fecha_desde"),
        "fecha_hasta": tarea.get("fecha_hasta"),
        # Progreso paso 1
        "total_dias": tarea.get("total_dias", 0),
        "dias_completados": tarea.get("dias_completados", 0),
        "progreso_pct": tarea.get("progreso_pct", 0),
        "dia_actual": tarea.get("dia_actual"),
        "ocs_dia": tarea.get("ocs_dia", 0),
        "total_ocs_dia": tarea.get("total_ocs_dia", 0),
        # Progreso paso 2
        "progreso_sync_pct": tarea.get("progreso_sync_pct", 0),
        # Resultados
        "maestro_resumen_total": tarea.get("maestro_resumen_total"),
        "maestro_detalles_total": tarea.get("maestro_detalles_total"),
        "pac_registros": tarea.get("pac_registros"),
        "ocs_subidas": tarea.get("ocs_subidas"),
        "detalles_subidos": tarea.get("detalles_subidos"),
        "ocs_en_bd": tarea.get("ocs_en_bd"),
        "detalles_en_bd": tarea.get("detalles_en_bd"),
        # Log en tiempo real
        "logs_recientes": tarea.get("logs_recientes", []),
        # Diff de cambios detectados (disponible al completar)
        "diff": tarea.get("diff"),
        "error": tarea.get("error"),
    })


# ─── Actualización Licitaciones desde el dashboard ────────────────────────────

_tareas_actualizacion_li: dict = {}


class _ETLLiveStream_LI:
    """
    Reemplaza sys.stdout durante el ETL de Licitaciones.
    Parsea líneas relevantes y actualiza el dict de tarea en tiempo real.
    Maneja \\n y \\r (progreso in-place del ThreadPoolExecutor).
    """

    _SKIP = re.compile(
        r"^\s*(?:={3,}|─{3,}|-{3,}"
        r"|EXTRACTOR LICITACIONES|GESTIÓN TOTAL"
        r"|── Descarga|── Maestros|── Sincronización"
        r"|\s*)$"
    )
    _KEEP = re.compile(
        r"[✅✨📊🔄🔗❌⚠️🚀💾]|>>>"
        r"|licitaciones|Guardado|REFRESH|Maestro|actualizado|COMPLETADO"
        r"|Vaciando|Insertando|TOTAL EN BD|Sin licitaciones"
    )

    def __init__(self, task_id: str, total_dias: int):
        self._tid = task_id
        self._total = max(total_dias, 1)
        self._partial = ""
        self._logs: list = []

    def write(self, text: str):
        if _tareas_actualizacion_li.get(self._tid, {}).get("status") == "cancelado":
            raise SystemExit("Cancelado por el usuario")
        self._partial += text
        while "\n" in self._partial:
            raw, self._partial = self._partial.split("\n", 1)
            if "\r" in raw:
                raw = raw.split("\r")[-1]
            self._handle(raw.strip())

    def flush(self):
        pass

    def _handle(self, line: str):
        t = _tareas_actualizacion_li.get(self._tid)
        if not t or not line:
            return

        upd: dict = {}

        # Día siendo procesado
        m = re.search(r"LICITACIONES SSO[:\s]+(\d{2}/\d{2}/\d{4})", line)
        if m:
            upd["paso_desc"] = f"Procesando {m.group(1)}..."

        # Conteo encontrado en el día
        m = re.search(r"encontraron\s+(\d+)\s+licitaciones", line)
        if m:
            upd["lics_encontradas_dia"] = int(m.group(1))

        # Sin datos este día
        if "Sin licitaciones" in line or "sin licitaciones" in line:
            upd["paso_desc"] = "Sin licitaciones este día, continuando..."

        # Integración maestros
        if "INTEGRANDO NUEVOS DATOS" in line:
            upd["paso_desc"] = "Integrando datos en maestros..."

        m = re.search(r"Maestro Resumen actualizado.*?(\d+)", line)
        if m:
            upd["maestro_resumen_total"] = int(m.group(1))

        m = re.search(r"Maestro Detalle actualizado.*?(\d+)", line)
        if m:
            upd["maestro_detalles_total"] = int(m.group(1))

        # Sincronización
        if "CARGANDO CSVs" in line or "SINCRONIZACIÓN MASIVA" in line:
            upd["paso_desc"] = "Preparando carga a base de datos..."

        if "Vaciando la base de datos" in line:
            upd["paso_desc"] = "Vaciando registros anteriores..."
            upd["progreso_sync_pct"] = 20

        m = re.search(r"Insertando\s+(\d[\d,]*)\s+Licitaciones\s+en BD", line)
        if m:
            n = int(m.group(1).replace(",", ""))
            upd["lics_subidas"] = n
            upd["paso_desc"] = f"Insertando {n:,} licitaciones..."
            upd["progreso_sync_pct"] = 50

        m = re.search(r"Insertando\s+(\d[\d,]*)\s+Detalles\s+en BD", line)
        if m:
            n = int(m.group(1).replace(",", ""))
            upd["detalles_subidos"] = n
            upd["paso_desc"] = f"Insertando {n:,} líneas de detalle..."
            upd["progreso_sync_pct"] = 75

        if "Sincronización masiva finalizada" in line:
            upd["progreso_sync_pct"] = 100
            upd["paso_desc"] = "Sincronización completada."

        m = re.search(r"TOTAL EN BD:\s*(\d+)\s*Licitaciones.*?(\d+)\s*Detalles", line)
        if m:
            upd["lics_en_bd"]      = int(m.group(1))
            upd["detalles_en_bd"]  = int(m.group(2))

        # Log visual
        if not self._SKIP.match(line) and self._KEEP.search(line):
            self._logs.append(line)
            if len(self._logs) > 12:
                self._logs.pop(0)
            upd["logs_recientes"] = list(self._logs)

        if upd:
            t.update(upd)


def _ejecutar_actualizacion_li(task_id: str, fecha_desde_str: str, fecha_hasta_str: str):
    """Ejecuta el ETL de Licitaciones en un hilo daemon con progreso en tiempo real."""
    import contextlib
    import datetime as _dt

    api_path = str(_RUTA_AG_SERVIDOR)
    if api_path not in sys.path:
        sys.path.insert(0, api_path)

    try:
        import LI_SSO_SERVER as li
    except ImportError as exc:
        _tareas_actualizacion_li[task_id].update(
            status="error", error=f"No se pudo cargar LI_SSO_SERVER: {exc}"
        )
        return

    try:
        d1 = _dt.datetime.strptime(fecha_desde_str, "%Y-%m-%d").date()
        d2 = _dt.datetime.strptime(fecha_hasta_str, "%Y-%m-%d").date()
        total_dias = (d2 - d1).days + 1

        _tareas_actualizacion_li[task_id].update(
            total_dias=total_dias, dias_completados=0, progreso_pct=0,
            dia_actual=None, lics_dia=0, total_lics_dia=0,
            logs_recientes=[], maestro_resumen_total=None,
            maestro_detalles_total=None,
            lics_subidas=None, detalles_subidos=None,
            lics_en_bd=None, detalles_en_bd=None,
            progreso_sync_pct=0, diff=None,
        )

        _tareas_actualizacion_li[task_id]["thread_id"] = threading.current_thread().ident
        stream = _ETLLiveStream_LI(task_id, total_dias)
        progress_state: dict = {"days_done": set()}

        def _on_progress(fecha, codigo_li, done, total):
            if _tareas_actualizacion_li.get(task_id, {}).get("status") == "cancelado":
                raise SystemExit("Cancelado por el usuario")
            if total > 0 and done >= total:
                progress_state["days_done"].add(fecha)
            dias_ok = len(progress_state["days_done"])
            frac = (dias_ok + (done / max(total, 1))) / max(total_dias, 1)
            pct = min(99, round(frac * 100))
            _tareas_actualizacion_li[task_id].update(
                dia_actual=fecha.strftime("%d-%m-%Y"),
                lics_dia=done,
                total_lics_dia=total,
                progreso_pct=pct,
                dias_completados=dias_ok,
                paso_desc=f"Procesando {fecha.strftime('%d-%m-%Y')} — {done}/{total} licitaciones",
            )

        # ── Paso 1: refresh (descarga + maestros) ──
        _tareas_actualizacion_li[task_id].update(
            status="en_proceso", paso=1,
            paso_desc="Iniciando descarga de Licitaciones...",
        )
        with contextlib.redirect_stdout(stream):
            li.refresh_base_datos(d1, d2, progress_callback=_on_progress)

        # ── Snapshot pre-sync ──
        from django.db import close_old_connections as _close_li
        _close_li()
        snap_pre: dict = {}
        try:
            snap_pre = dict(Licitacion.objects.values_list("codigo_licitacion", "Estado"))
        except Exception:
            pass

        _tareas_actualizacion_li[task_id].update(
            paso=2, progreso_pct=100,
            paso_desc="Sincronizando con base de datos...",
        )

        # ── Paso 2: subir maestros a Django/MariaDB ──
        with contextlib.redirect_stdout(stream):
            li.subir_maestros_a_django()

        # ── Diff post-sync ──
        _tareas_actualizacion_li[task_id].update(paso_desc="Calculando cambios detectados...")
        diff: dict = {
            "nuevas": [], "cambiadas": [], "adjudicadas": [],
            "nuevas_count": 0, "cambiadas_count": 0, "adjudicadas_count": 0,
            "total_antes": len(snap_pre), "total_despues": 0,
        }
        try:
            _close_li()
            campos = ("codigo_licitacion", "Estado", "Nombre", "Tipo",
                      "MontoEstimado", "FechaCierre", "C_Unidad", "C_NombreOrganismo")
            snap_post = {r["codigo_licitacion"]: r for r in Licitacion.objects.values(*campos)}
            diff["total_despues"] = len(snap_post)

            nuevas, cambiadas, adjudicadas = [], [], []

            for cod, det in snap_post.items():
                base = {
                    "codigo":    cod,
                    "nombre":    det.get("Nombre") or "",
                    "tipo":      det.get("Tipo") or "",
                    "unidad":    det.get("C_Unidad") or "",
                    "organismo": det.get("C_NombreOrganismo") or "",
                    "monto":     str(det.get("MontoEstimado") or ""),
                    "fecha_cierre": str(det.get("FechaCierre") or ""),
                }
                if cod not in snap_pre:
                    nuevas.append({**base, "estado": det.get("Estado") or ""})
                elif snap_pre[cod] != (det.get("Estado") or ""):
                    entry = {**base,
                        "estado_anterior": snap_pre[cod] or "",
                        "estado_nuevo":    det.get("Estado") or "",
                    }
                    cambiadas.append(entry)
                    if (det.get("Estado") or "").lower().startswith("adjudic"):
                        adjudicadas.append(entry)

            nuevas.sort(key=lambda x: x.get("fecha_cierre", "") or "", reverse=True)
            cambiadas.sort(key=lambda x: x["codigo"])

            diff.update({
                "nuevas":           nuevas,
                "cambiadas":        cambiadas,
                "adjudicadas":      adjudicadas,
                "nuevas_count":     len(nuevas),
                "cambiadas_count":  len(cambiadas),
                "adjudicadas_count": len(adjudicadas),
            })
        except Exception as exc_diff:
            diff["error_diff"] = str(exc_diff)

        _tareas_actualizacion_li[task_id].update(
            status="completado", paso=3,
            paso_desc="Completado exitosamente",
            progreso_sync_pct=100,
            diff=diff,
        )

    except Exception as exc:
        _tareas_actualizacion_li[task_id].update(status="error", error=str(exc))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_actualizacion_li(request):
    """Inicia el ETL de Licitaciones. Body: {fecha_desde, fecha_hasta} en YYYY-MM-DD."""
    for tarea in _tareas_actualizacion_li.values():
        if tarea.get("status") in ("iniciado", "en_proceso"):
            return Response({"error": "Ya hay una actualización de Licitaciones en curso."}, status=409)

    fecha_desde = (request.data.get("fecha_desde") or "").strip()
    fecha_hasta = (request.data.get("fecha_hasta") or "").strip()
    if not fecha_desde or not fecha_hasta:
        return Response(
            {"error": "Parámetros fecha_desde y fecha_hasta requeridos (YYYY-MM-DD)."},
            status=400,
        )

    task_id = str(uuid.uuid4())[:8]
    _tareas_actualizacion_li[task_id] = {
        "status": "iniciado",
        "paso": 0,
        "paso_desc": "Iniciando...",
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "error": None,
    }
    threading.Thread(
        target=_ejecutar_actualizacion_li,
        args=(task_id, fecha_desde, fecha_hasta),
        daemon=True,
    ).start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_actualizacion_li(request, task_id):
    """Retorna el estado completo de una tarea de actualización Licitaciones."""
    tarea = _tareas_actualizacion_li.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id": task_id,
        "status": tarea["status"],
        "paso": tarea["paso"],
        "paso_desc": tarea["paso_desc"],
        "fecha_desde": tarea.get("fecha_desde"),
        "fecha_hasta": tarea.get("fecha_hasta"),
        # Progreso paso 1
        "total_dias":       tarea.get("total_dias", 0),
        "dias_completados": tarea.get("dias_completados", 0),
        "progreso_pct":     tarea.get("progreso_pct", 0),
        "dia_actual":       tarea.get("dia_actual"),
        "lics_dia":         tarea.get("lics_dia", 0),
        "total_lics_dia":   tarea.get("total_lics_dia", 0),
        # Progreso paso 2
        "progreso_sync_pct": tarea.get("progreso_sync_pct", 0),
        # Resultados
        "maestro_resumen_total":  tarea.get("maestro_resumen_total"),
        "maestro_detalles_total": tarea.get("maestro_detalles_total"),
        "lics_subidas":     tarea.get("lics_subidas"),
        "detalles_subidos": tarea.get("detalles_subidos"),
        "lics_en_bd":       tarea.get("lics_en_bd"),
        "detalles_en_bd":   tarea.get("detalles_en_bd"),
        # Log en tiempo real
        "logs_recientes": tarea.get("logs_recientes", []),
        # Diff de cambios (disponible al completar)
        "diff":  tarea.get("diff"),
        "error": tarea.get("error"),
    })


# ─── Cancelación de tareas ETL ────────────────────────────────────────────────

def _cancelar_hilo(thread_id: int) -> None:
    """Envía SystemExit al hilo ETL para detenerlo (best-effort)."""
    try:
        ctypes.pythonapi.PyThreadState_SetAsyncExc(
            ctypes.c_ulong(thread_id),
            ctypes.py_object(SystemExit),
        )
    except Exception:
        pass


def _cancelar_tarea(tarea_dict: dict, task_id: str) -> Response:
    """Lógica común de cancelación para los 3 tipos de ETL."""
    tarea = tarea_dict.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    if tarea.get("status") not in ("iniciado", "en_proceso"):
        return Response({"error": "La tarea no está en curso."}, status=409)

    tarea.update(
        status="cancelado",
        paso_desc="Cancelado por el usuario.",
        error="Actualización cancelada por el usuario.",
    )

    thread_id = tarea.get("thread_id")
    if thread_id:
        _cancelar_hilo(thread_id)

    return Response({"status": "cancelado"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancelar_actualizacion_ca(request, task_id):
    """Cancela una tarea ETL de Compra Ágil en curso."""
    return _cancelar_tarea(_tareas_actualizacion_ca, task_id)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancelar_actualizacion_oc(request, task_id):
    """Cancela una tarea ETL de Órdenes de Compra en curso."""
    return _cancelar_tarea(_tareas_actualizacion_oc, task_id)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancelar_actualizacion_li(request, task_id):
    """Cancela una tarea ETL de Licitaciones en curso."""
    return _cancelar_tarea(_tareas_actualizacion_li, task_id)


# =============================================================================
# Módulo Gestión de Contratos
# =============================================================================

_tareas_actualizacion_contratos: dict = {}

_RUTA_CONTRATOS_EXCEL = (
    Path(__file__).parent.parent.parent
    / "api" / "data" / "data_gestioncontratos" / "data_gestioncontratos"
)

_COLUMNAS_CONTRATOS = [
    "numero_contrato", "nombre_contrato", "id_licitacion_oc",
    "rut_organismo", "nombre_organismo", "ejecucion_contrato",
    "categoria_contrato", "tipo_contrato", "unidad_requirente",
    "unidad_moneda", "monto_contrato", "monto_ejecutado",
    "monto_por_ejecutar", "fecha_inicio", "fecha_termino",
    "estado_contrato", "garantias_hitos_incumplidos", "garantias_por_vencer",
    "garantias_vencidas", "garantias_cobradas", "sanciones_solicitadas",
    "sanciones_aplicadas", "dias_vigencia", "dias_restantes", "evaluacion",
]


def _ejecutar_actualizacion_contratos(task_id: str):
    """Lee el Excel de contratos SSO y carga los datos en GestionContrato."""
    import math
    import pandas as pd
    from django.db import transaction, close_old_connections

    try:
        _tareas_actualizacion_contratos[task_id].update(
            status="en_proceso", paso=1,
            paso_desc="Buscando archivo Excel de contratos...",
            logs_recientes=["Iniciando carga de contratos SSO..."],
        )

        archivos = list(_RUTA_CONTRATOS_EXCEL.glob("*.xls*"))
        if not archivos:
            raise FileNotFoundError(
                f"No se encontró ningún archivo Excel en:\n{_RUTA_CONTRATOS_EXCEL}\n"
                "Descarga primero el archivo desde Mercado Público."
            )

        archivo = max(archivos, key=lambda f: f.stat().st_mtime)
        logs = [f"Archivo encontrado: {archivo.name}"]
        _tareas_actualizacion_contratos[task_id].update(
            paso_desc=f"Leyendo {archivo.name}...",
            logs_recientes=logs,
            archivo_nombre=archivo.name,
        )

        tablas = pd.read_html(str(archivo), encoding="utf-8")
        if len(tablas) < 3:
            raise ValueError(
                f"Estructura inesperada: {len(tablas)} tabla(s) encontradas (se esperaban 3)."
            )

        df = tablas[2].copy()
        if df.empty:
            raise ValueError("El archivo no contiene datos de contratos.")

        if len(df.columns) == len(_COLUMNAS_CONTRATOS):
            df.columns = _COLUMNAS_CONTRATOS
        else:
            raise ValueError(
                f"Columnas inesperadas: {len(df.columns)} encontradas, "
                f"{len(_COLUMNAS_CONTRATOS)} esperadas."
            )

        total = len(df)
        logs.append(f"{total} contratos leídos con {len(df.columns)} columnas.")
        _tareas_actualizacion_contratos[task_id].update(
            paso=2, paso_desc=f"Procesando {total} contratos...",
            total_registros=total, logs_recientes=logs,
        )

        cols_int = [
            "monto_contrato", "monto_ejecutado", "monto_por_ejecutar",
            "garantias_hitos_incumplidos", "garantias_por_vencer",
            "garantias_vencidas", "garantias_cobradas",
            "sanciones_solicitadas", "sanciones_aplicadas",
            "dias_vigencia", "dias_restantes",
        ]
        for col in cols_int:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        def _to_int(v):
            try:
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    return None
                iv = int(v)
                # Descartar valores que excedan 10^13 (posible corrupción de datos)
                if abs(iv) > 10_000_000_000_000:
                    return None
                return iv
            except Exception:
                return None

        def _to_str(v):
            s = str(v).strip() if v is not None else ""
            return s if s not in ("nan", "None", "") else None

        registros = [
            GestionContrato(
                numero_contrato=_to_str(row["numero_contrato"]) or f"SIN_COD_{idx}",
                nombre_contrato=_to_str(row["nombre_contrato"]),
                id_licitacion_oc=_to_str(row["id_licitacion_oc"]),
                rut_organismo=_to_str(row["rut_organismo"]),
                nombre_organismo=_to_str(row["nombre_organismo"]),
                ejecucion_contrato=_to_str(row["ejecucion_contrato"]),
                categoria_contrato=_to_str(row["categoria_contrato"]),
                tipo_contrato=_to_str(row["tipo_contrato"]),
                unidad_requirente=_to_str(row["unidad_requirente"]),
                unidad_moneda=_to_str(row["unidad_moneda"]),
                monto_contrato=_to_int(row["monto_contrato"]),
                monto_ejecutado=_to_int(row["monto_ejecutado"]),
                monto_por_ejecutar=_to_int(row["monto_por_ejecutar"]),
                fecha_inicio=_to_str(row["fecha_inicio"]),
                fecha_termino=_to_str(row["fecha_termino"]),
                estado_contrato=_to_str(row["estado_contrato"]),
                garantias_hitos_incumplidos=_to_int(row["garantias_hitos_incumplidos"]),
                garantias_por_vencer=_to_int(row["garantias_por_vencer"]),
                garantias_vencidas=_to_int(row["garantias_vencidas"]),
                garantias_cobradas=_to_int(row["garantias_cobradas"]),
                sanciones_solicitadas=_to_int(row["sanciones_solicitadas"]),
                sanciones_aplicadas=_to_int(row["sanciones_aplicadas"]),
                dias_vigencia=_to_int(row["dias_vigencia"]),
                dias_restantes=_to_int(row["dias_restantes"]),
                evaluacion=_to_str(row["evaluacion"]),
            )
            for idx, (_, row) in enumerate(df.iterrows())
        ]

        logs.append("Cargando en base de datos (eliminar + insertar)...")
        _tareas_actualizacion_contratos[task_id].update(
            paso=3, paso_desc="Cargando en base de datos...",
            logs_recientes=logs,
        )

        close_old_connections()
        with transaction.atomic():
            GestionContrato.objects.all().delete()
            GestionContrato.objects.bulk_create(registros, batch_size=500)

        logs.append(f"✅ {len(registros)} contratos cargados exitosamente.")
        _tareas_actualizacion_contratos[task_id].update(
            status="completado", paso=4,
            paso_desc=f"Completado: {len(registros)} contratos cargados.",
            total_cargados=len(registros),
            logs_recientes=logs,
            progreso_pct=100,
        )

    except Exception as exc:
        _tareas_actualizacion_contratos[task_id].update(
            status="error", error=str(exc)
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_actualizacion_contratos(request):
    """Inicia la carga de contratos SSO desde el Excel descargado."""
    for tarea in _tareas_actualizacion_contratos.values():
        if tarea.get("status") in ("iniciado", "en_proceso"):
            return Response({"error": "Ya hay una actualización en curso."}, status=409)

    task_id = str(uuid.uuid4())[:8]
    _tareas_actualizacion_contratos[task_id] = {
        "status": "iniciado",
        "paso": 0,
        "paso_desc": "Iniciando...",
        "error": None,
        "logs_recientes": [],
        "total_registros": 0,
        "total_cargados": 0,
        "archivo_nombre": None,
        "progreso_pct": 0,
    }
    threading.Thread(
        target=_ejecutar_actualizacion_contratos,
        args=(task_id,),
        daemon=True,
    ).start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_actualizacion_contratos(request, task_id):
    """Retorna el estado de una tarea de carga de contratos."""
    tarea = _tareas_actualizacion_contratos.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id":        task_id,
        "status":         tarea["status"],
        "paso":           tarea["paso"],
        "paso_desc":      tarea["paso_desc"],
        "total_registros": tarea.get("total_registros", 0),
        "total_cargados": tarea.get("total_cargados", 0),
        "archivo_nombre": tarea.get("archivo_nombre"),
        "progreso_pct":   tarea.get("progreso_pct", 0),
        "logs_recientes": tarea.get("logs_recientes", []),
        "error":          tarea.get("error"),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancelar_actualizacion_contratos(request, task_id):
    """Cancela una tarea de carga de contratos en curso."""
    return _cancelar_tarea(_tareas_actualizacion_contratos, task_id)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def contratos_stats_view(request):
    cache_key = 'contratos_stats_v1'
    if cached := cache.get(cache_key):
        return Response(cached)

    qs = GestionContrato.objects.all()
    total = qs.count()
    if total == 0:
        return Response({"total": 0, "vacio": True})

    estados_vigentes = [
        "En ejecución", "En ejecución (Modificado)", "Ampliado"
    ]
    vigentes = qs.filter(estado_contrato__in=estados_vigentes).count()
    terminados = qs.exclude(estado_contrato__in=estados_vigentes).count()

    agg = qs.aggregate(
        monto_total=Sum("monto_contrato"),
        monto_ejecutado=Sum("monto_ejecutado"),
    )
    monto_total = agg["monto_total"] or 0
    monto_ejecutado = agg["monto_ejecutado"] or 0
    pct_ejecutado = round(monto_ejecutado / monto_total * 100, 1) if monto_total else 0

    por_estado = list(
        qs.values("estado_contrato")
        .annotate(total=Count("numero_contrato"), monto=Sum("monto_contrato"))
        .order_by("-total")
    )

    por_categoria = list(
        qs.values("categoria_contrato")
        .annotate(total=Count("numero_contrato"), monto=Sum("monto_contrato"))
        .order_by("-total")
    )

    por_tipo = list(
        qs.values("tipo_contrato")
        .annotate(total=Count("numero_contrato"), monto=Sum("monto_contrato"))
        .order_by("-total")
    )

    por_unidad = list(
        qs.values("unidad_requirente")
        .annotate(total=Count("numero_contrato"), monto=Sum("monto_contrato"))
        .order_by("-total")
    )

    por_ejecucion = list(
        qs.values("ejecucion_contrato")
        .annotate(total=Count("numero_contrato"))
        .order_by("-total")
    )

    con_garantias_por_vencer = qs.filter(garantias_por_vencer__gt=0).count()
    con_garantias_vencidas   = qs.filter(garantias_vencidas__gt=0).count()
    con_sanciones            = qs.filter(sanciones_solicitadas__gt=0).count()

    data = {
        "total":                  total,
        "vigentes":               vigentes,
        "terminados":             terminados,
        "monto_total":            monto_total,
        "monto_ejecutado":        monto_ejecutado,
        "pct_ejecutado":          pct_ejecutado,
        "con_garantias_por_vencer": con_garantias_por_vencer,
        "con_garantias_vencidas": con_garantias_vencidas,
        "con_sanciones":          con_sanciones,
        "por_estado":             por_estado,
        "por_categoria":          por_categoria,
        "por_tipo":               por_tipo,
        "por_unidad":             por_unidad,
        "por_ejecucion":          por_ejecucion,
        "vacio":                  False,
    }
    cache.set(cache_key, data, timeout=300)
    return Response(data)


class GestionContratoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GestionContrato.objects.all()
    serializer_class = GestionContratoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ["estado_contrato", "categoria_contrato", "tipo_contrato", "unidad_requirente"]
    search_fields = ["nombre_contrato", "numero_contrato", "nombre_organismo"]
    ordering_fields = ["monto_contrato", "monto_ejecutado", "dias_restantes", "fecha_inicio"]


# ── Gestión Contratos — vistas analíticas ────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def contratos_evaluaciones_view(request):
    from .services import calcular_contratos_evaluaciones
    cache_key = "contratos_evaluaciones_v1"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_contratos_evaluaciones()
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def contratos_financiero_view(request):
    from .services import calcular_contratos_financiero
    filtros = {
        'estado_contrato':   request.GET.get('estado_contrato', ''),
        'categoria_contrato': request.GET.get('categoria_contrato', ''),
        'tipo_contrato':     request.GET.get('tipo_contrato', ''),
        'unidad_requirente': request.GET.get('unidad_requirente', ''),
    }
    filtros = {k: v for k, v in filtros.items() if v}
    cache_key = f"contratos_financiero_{'_'.join(f'{k}{v}' for k, v in sorted(filtros.items()))}"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_contratos_financiero(filtros)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def contratos_oc_detalle_view(request):
    from .services import calcular_contratos_oc_detalle
    id_licitacion_oc = request.GET.get("id_licitacion_oc", "").strip()
    if not id_licitacion_oc:
        return Response({"error": "Parámetro id_licitacion_oc requerido."}, status=400)
    cache_key = f"contratos_oc_detalle_{id_licitacion_oc}"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_contratos_oc_detalle(id_licitacion_oc)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def contratos_plazos_view(request):
    from .services import calcular_contratos_plazos
    filtros = {
        'categoria_contrato': request.GET.get('categoria_contrato', ''),
        'unidad_requirente':  request.GET.get('unidad_requirente', ''),
    }
    filtros = {k: v for k, v in filtros.items() if v}
    cache_key = f"contratos_plazos_{'_'.join(f'{k}{v}' for k, v in sorted(filtros.items()))}"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_contratos_plazos(filtros)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def contratos_pac_view(request):
    from .services import calcular_contratos_pac
    filtros = {
        'estado_contrato':    request.GET.get('estado_contrato', ''),
        'categoria_contrato': request.GET.get('categoria_contrato', ''),
    }
    filtros = {k: v for k, v in filtros.items() if v}
    cache_key = f"contratos_pac_{'_'.join(f'{k}{v}' for k, v in sorted(filtros.items()))}"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_contratos_pac(filtros)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def contratos_pac_detalle_oc_view(request):
    from .services import calcular_contratos_pac_detalle_oc
    filtros = {
        'estado_contrato':    request.GET.get('estado_contrato', ''),
        'categoria_contrato': request.GET.get('categoria_contrato', ''),
    }
    filtros = {k: v for k, v in filtros.items() if v}
    cache_key = f"contratos_pac_detalle_oc_{'_'.join(f'{k}{v}' for k, v in sorted(filtros.items()))}"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_contratos_pac_detalle_oc(filtros)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


# =============================================================================
# Módulo Formularios FSC (Panel SS Osorno)
# =============================================================================

_tareas_actualizacion_formularios: dict = {}

_RUTA_DATA_PANEL = Path(__file__).parent.parent.parent / "api" / "data" / "data_panel"


def _snapshot_fsc():
    """Captura el estado actual de FormularioFSC para calcular el diff post-ETL."""
    from datetime import date, datetime
    from api.models import FormularioFSC, FormularioFSCDerivado
    hoy = date.today()

    def _dias(fecha_str):
        if not fecha_str:
            return None
        for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'):
            try:
                return (hoy - datetime.strptime(fecha_str, fmt).date()).days
            except ValueError:
                continue
        return None

    fsc = {
        (f.folio, f.anho, f.unidad_requirente or '', f.fecha_solicitud or ''): {
            'folio': f.folio, 'anho': f.anho,
            'unidad_requirente': f.unidad_requirente, 'fecha_solicitud': f.fecha_solicitud,
            'estado': f.estado, 'monto_estimado': f.monto_estimado,
            'usuario_requirente': f.usuario_requirente,
            'destino_actual': f.destino_actual,
            'dias': _dias(f.fecha_solicitud),
        }
        for f in FormularioFSC.objects.only(
            'folio', 'anho', 'unidad_requirente', 'fecha_solicitud',
            'estado', 'monto_estimado', 'usuario_requirente', 'destino_actual'
        )
    }
    derivados = {
        (f.folio, f.anho, f.unidad_requirente or '', f.fecha_solicitud or '')
        for f in FormularioFSCDerivado.objects.only('folio', 'anho', 'unidad_requirente', 'fecha_solicitud')
    }
    return fsc, derivados, hoy, _dias


def _diff_fsc(snap_antes, snap_despues, der_antes, der_despues, hoy, _dias, umbral_dias=10):
    """Calcula las 4 categorías del diff para el panel de cambios."""
    nuevos, cambiaron_estado, pegados = [], [], []

    for key, datos in snap_despues.items():
        if key not in snap_antes:
            nuevos.append(datos)
        else:
            estado_prev = snap_antes[key]['estado']
            if estado_prev != datos['estado']:
                cambiaron_estado.append({**datos, 'estado_anterior': estado_prev})

        if datos['estado'] not in ('AC', 'R') and datos['dias'] is not None and datos['dias'] > umbral_dias:
            pegados.append(datos)

    der_nuevos_keys = der_despues - der_antes
    derivados_nuevos = [
        snap_despues[k] for k in der_nuevos_keys if k in snap_despues
    ]

    pegados.sort(key=lambda x: -(x['dias'] or 0))

    return {
        'nuevos': nuevos[:200],
        'cambiaron_estado': cambiaron_estado[:200],
        'derivados_nuevos': derivados_nuevos[:200],
        'pegados': pegados[:200],
        'nuevos_count': len(nuevos),
        'cambiaron_estado_count': len(cambiaron_estado),
        'derivados_nuevos_count': len(derivados_nuevos),
        'pegados_count': len(pegados),
    }


def _ejecutar_actualizacion_formularios(task_id: str, rut: str, dv: str, clave: str):
    """Descarga (Selenium) y carga los reportes FSC del Panel SS Osorno delegando en page_data_panel."""
    panel_path = str(_RUTA_DATA_PANEL)
    if panel_path not in sys.path:
        sys.path.insert(0, panel_path)

    try:
        import page_data_panel as panel_etl
    except ImportError as exc:
        _tareas_actualizacion_formularios[task_id].update(
            status="error", error=f"No se pudo cargar page_data_panel: {exc}"
        )
        return

    logs = []

    def _cb(paso=None, paso_desc=None, progreso_pct=None, log=None):
        upd = {}
        if paso is not None:
            upd["paso"] = paso
        if paso_desc is not None:
            upd["paso_desc"] = paso_desc
        if progreso_pct is not None:
            upd["progreso_pct"] = progreso_pct
        if log:
            logs.append(log)
            upd["logs_recientes"] = logs[-30:]
        if upd:
            _tareas_actualizacion_formularios[task_id].update(**upd)

    try:
        _tareas_actualizacion_formularios[task_id].update(status="en_proceso")
        _cb(paso=1, paso_desc="Iniciando navegador y autenticando...", progreso_pct=5,
            log="Iniciando descarga de reportes desde el Panel SS Osorno...")

        snap_antes, der_antes, hoy, _dias_fn = _snapshot_fsc()

        resumen = panel_etl.ejecutar_proceso_completo(rut, dv, clave, progress_callback=_cb)

        snap_despues, der_despues, _, _ = _snapshot_fsc()
        diff = _diff_fsc(snap_antes, snap_despues, der_antes, der_despues, hoy, _dias_fn)

        for key in ('formularios_stats_v1_todos', 'formularios_unificacion_todos'):
            cache.delete(key)
        for yr in range(2024, hoy.year + 2):
            cache.delete(f'formularios_stats_v1_{yr}')
            cache.delete(f'formularios_flujo_v1_{yr}')
            cache.delete(f'formularios_unificacion_{yr}')
        cache.delete('formularios_flujo_v1_todos')

        _tareas_actualizacion_formularios[task_id].update(
            status="completado", paso=4,
            paso_desc=(
                f"Completado: {resumen['nuevos']} nuevos, {resumen['actualizados']} actualizados "
                f"({resumen['total']} procesados). Historial preservado."
            ),
            total_cargados=resumen["total"],
            logs_recientes=logs[-30:],
            progreso_pct=100,
            diff=diff,
        )

    except Exception as exc:
        logger.exception("Error actualizando formularios FSC")
        _tareas_actualizacion_formularios[task_id].update(
            status="error", error=str(exc), logs_recientes=logs[-30:],
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def iniciar_actualizacion_formularios(request):
    """Inicia la descarga y carga de Formularios FSC desde el Panel SS Osorno."""
    for tarea in _tareas_actualizacion_formularios.values():
        if tarea.get("status") in ("iniciado", "en_proceso"):
            return Response({"error": "Ya hay una actualización en curso."}, status=409)

    rut = str(request.data.get("rut", "")).strip()
    dv = str(request.data.get("dv", "")).strip()
    clave = str(request.data.get("clave", "")).strip()
    if not rut or not dv or not clave:
        return Response({"error": "Debe indicar RUT, DV y contraseña del Panel SS Osorno."}, status=400)

    task_id = str(uuid.uuid4())[:8]
    _tareas_actualizacion_formularios[task_id] = {
        "status": "iniciado",
        "paso": 0,
        "paso_desc": "Iniciando...",
        "error": None,
        "logs_recientes": [],
        "total_cargados": 0,
        "progreso_pct": 0,
    }
    threading.Thread(
        target=_ejecutar_actualizacion_formularios,
        args=(task_id, rut, dv, clave),
        daemon=True,
    ).start()
    return Response({"task_id": task_id, "status": "iniciado"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def estado_actualizacion_formularios(request, task_id):
    """Retorna el estado de una tarea de actualización de Formularios FSC."""
    tarea = _tareas_actualizacion_formularios.get(task_id)
    if not tarea:
        return Response({"error": "Tarea no encontrada."}, status=404)
    return Response({
        "task_id":        task_id,
        "status":         tarea["status"],
        "paso":           tarea["paso"],
        "paso_desc":      tarea["paso_desc"],
        "total_cargados": tarea.get("total_cargados", 0),
        "progreso_pct":   tarea.get("progreso_pct", 0),
        "logs_recientes": tarea.get("logs_recientes", []),
        "error":          tarea.get("error"),
        "diff":           tarea.get("diff"),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancelar_actualizacion_formularios(request, task_id):
    """Cancela una tarea de actualización de Formularios FSC en curso."""
    return _cancelar_tarea(_tareas_actualizacion_formularios, task_id)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def formularios_alertas_view(request):
    """Formularios FSC con alerta de demora — estados activos con días desde solicitud calculados."""
    from datetime import date, datetime
    from api.models import FormularioFSC

    hoy = date.today()
    try:
        dias_min = int(request.GET.get('dias_min', 10))
    except (ValueError, TypeError):
        dias_min = 10
    anho = request.GET.get('anho', '').strip()
    anho_int = int(anho) if anho.isdigit() else None
    estados_excluidos = ('AC', 'R')

    qs = FormularioFSC.objects.exclude(estado__in=estados_excluidos)
    if anho_int:
        qs = qs.filter(anho=anho_int)

    registros = []
    for f in qs.only(
        'id', 'folio', 'anho', 'formulario', 'fecha_solicitud', 'estado',
        'unidad_requirente', 'usuario_requirente', 'monto_estimado', 'requerimiento',
        'destino_actual',
    ):
        dias = None
        if f.fecha_solicitud:
            for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'):
                try:
                    dias = (hoy - datetime.strptime(f.fecha_solicitud, fmt).date()).days
                    break
                except ValueError:
                    continue
        if dias is None or dias < dias_min:
            continue
        registros.append({
            'id': f.id,
            'folio': f.folio,
            'anho': f.anho,
            'formulario': f.formulario,
            'fecha_solicitud': f.fecha_solicitud,
            'estado': f.estado,
            'unidad_requirente': f.unidad_requirente,
            'usuario_requirente': f.usuario_requirente,
            'monto_estimado': f.monto_estimado,
            'requerimiento': f.requerimiento,
            'destino_actual': f.destino_actual,
            'dias': dias,
        })

    registros.sort(key=lambda x: -x['dias'])
    return Response({'count': len(registros), 'results': registros})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def formularios_unificacion_view(request):
    """Análisis de compras conjuntas: agrupa FSC en camino (ASDA→DC) por item_presupuestario."""
    anho = request.GET.get('anho', '').strip()
    anho_int = int(anho) if anho.isdigit() else None
    cache_key = f'formularios_unificacion_{anho_int or "todos"}'
    if data := cache.get(cache_key):
        return Response(data)
    from .services import calcular_formularios_unificacion
    data = calcular_formularios_unificacion(anho_int)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def formularios_historial_view(request):
    """Historial de productos solicitados por unidad — excluye R y P."""
    from .services import calcular_formularios_historial
    anho = request.GET.get('anho', '').strip()
    anho_int = int(anho) if anho.isdigit() else None
    unidad = request.GET.get('unidad_requirente', '').strip() or None
    usuario = request.GET.get('usuario_requirente', '').strip() or None
    cache_key = f'formularios_historial_{anho_int or "todos"}_{unidad or ""}_{usuario or ""}'
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_formularios_historial(anho=anho_int, unidad_requirente=unidad, usuario_requirente=usuario)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def formularios_stats_view(request):
    from .services import calcular_formularios_stats
    anho = request.GET.get("anho", "").strip()
    anho_int = int(anho) if anho.isdigit() else None
    cache_key = f"formularios_stats_v1_{anho_int or 'todos'}"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_formularios_stats(anho_int)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def formularios_flujo_view(request):
    """Pipeline de bandejas de visación (P→AC) + rechazados, para el sub-tab 'Flujo de Visación'."""
    from .services import calcular_formularios_flujo
    anho = request.GET.get("anho", "").strip()
    anho_int = int(anho) if anho.isdigit() else None
    cache_key = f"formularios_flujo_v1_{anho_int or 'todos'}"
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_formularios_flujo(anho_int)
    cache.set(cache_key, data, timeout=300)
    return Response(data)


class FormularioFSCFilter(django_filters.FilterSet):
    estado = django_filters.BaseInFilter(field_name='estado', lookup_expr='in')

    class Meta:
        model = FormularioFSC
        fields = ['estado', 'anho', 'unidad_requirente']


class FormularioFSCViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FormularioFSC.objects.all()
    serializer_class = FormularioFSCSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_class = FormularioFSCFilter
    search_fields = [
        "folio", "anho", "formulario", "objetivo_compra", "usuario_requirente",
        "unidad_requirente", "encargado", "jefe", "correo", "requerimiento",
        "especificaciones_tecnicas", "estado",
    ]
    ordering_fields = ["folio", "anho", "monto_estimado", "fecha_solicitud", "unidad_requirente", "estado", "destino_actual"]


class FormularioFSCDerivadoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FormularioFSCDerivado.objects.all()
    serializer_class = FormularioFSCDerivadoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ["estado_compra", "anho", "unidad_requirente", "comprador"]
    search_fields = [
        "folio", "anho", "formulario", "objetivo_compra", "usuario_requirente",
        "unidad_requirente", "comprador", "estado_compra", "encargado", "jefe", "correo",
        "requerimiento", "especificaciones_tecnicas",
    ]
    ordering_fields = ["folio", "anho", "monto_estimado", "fecha_derivado", "unidad_requirente", "estado_compra"]


class FormularioFSCProductoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FormularioFSCProducto.objects.all()
    serializer_class = FormularioFSCProductoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ["anho", "folio", "categoria", "tipo_formulario"]
    search_fields = ["producto", "descripcion"]
    ordering_fields = ["folio", "anho", "monto", "cantidad"]


# =============================================================================
# Módulo Usuarios
# =============================================================================

class _IsAdmin(BasePermission):
    """Solo usuarios con role='admin' o is_superuser pueden acceder."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.role == 'admin'
        except Exception:
            return False


class UsuarioViewSet(viewsets.ModelViewSet):
    """CRUD de usuarios — solo admin. Sin paginación (max ~500 usuarios)."""
    queryset           = User.objects.select_related('perfil').order_by('username')
    serializer_class   = UserAdminSerializer
    permission_classes = [IsAuthenticated, _IsAdmin]
    pagination_class   = None
    filter_backends    = [drf_filters.SearchFilter, drf_filters.OrderingFilter]
    search_fields      = ['username', 'email', 'first_name', 'last_name',
                          'perfil__cargo', 'perfil__role']
    ordering_fields    = ['id', 'username', 'email', 'date_joined', 'last_login',
                          'perfil__role']
    ordering           = ['username']

    def get_queryset(self):
        qs     = super().get_queryset()
        role   = self.request.query_params.get('role')
        activo = self.request.query_params.get('activo')
        if role:
            qs = qs.filter(perfil__role=role)
        if activo is not None:
            qs = qs.filter(is_active=(activo.lower() in ('1', 'true', 's')))
        return qs

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('No puedes eliminar tu propia cuenta.')
        instance.delete()


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def user_me(request):
    """GET/PATCH del perfil propio."""
    user = request.user
    if request.method == 'GET':
        return Response(UserMeSerializer(user).data)
    serializer = UserMeSerializer(user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(UserMeSerializer(user).data)


class DepartamentoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = Departamento.objects.all()
    serializer_class   = DepartamentoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [drf_filters.SearchFilter, DjangoFilterBackend]
    filterset_fields   = ['establecimiento_id', 'es_depto']
    search_fields      = ['descripcion', 'nombre_corto']
    pagination_class   = None


class EstablecimientoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = Establecimiento.objects.all()
    serializer_class   = EstablecimientoSerializer
    permission_classes = [IsAuthenticated]
    pagination_class   = None

