import ctypes
import logging
import re
import subprocess
import sys
import threading
import uuid
from pathlib import Path

from django.core.cache import cache
from django.db.models import Count, Q, Sum
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

from .models import (
    BoletaGarantia, BoletaGarantiaAudit, Comprador,
    DetalleLicitacion, DetalleOrdenCompra, Devengo,
    Factura, Licitacion, OrdenCompra, Proveedor,
    PlanerPAC, CompraAgilResumen, CompraAgilProducto, CompraAgilProveedor,
    RevisionOCCorregible, GestionContrato,
)
from .serializers import (
    BoletaGarantiaAuditSerializer, BoletaGarantiaSerializer,
    CompradorSerializer, DetalleLicitacionSerializer,
    DetalleOrdenCompraSerializer, DevengoSerializer,
    LicitacionSerializer, LicitacionCalendarioSerializer,
    OrdenCompraSerializer, ProveedorSerializer,
    PlanerPACSerializer, CompraAgilResumenSerializer, CompraAgilCalendarioSerializer,
    CompraAgilProductoSerializer, CompraAgilProveedorSerializer,
    RevisionOCCorregibleSerializer, GestionContratoSerializer,
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
        qs = Licitacion.objects.prefetch_related('detalles').all()
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
# Devengo
# =============================================================================

class DevengoViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet para el módulo de Control de Deuda (Anexo N°3)."""
    queryset = Devengo.objects.all()
    serializer_class = DevengoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ['codigo_ue', 'tipo_documento', 'concepto_presupuestario']
    search_fields = ['principal', 'concepto_presupuestario', 'tipo_documento', 'codigo_ue']
    ordering_fields = ['monto_disponible', 'monto_vigente', 'fecha_conforme']
    ordering = ['-monto_disponible']


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_stats(request):
    """KPIs agregados para el dashboard de Control de Deuda con caché."""
    ue = request.GET.get('ue', '')
    solo_deuda = request.GET.get('solo_deuda', '1') == '1'
    ue_safe = ue[:50].replace(' ', '_')
    cache_key = f'devengo_stats_ue_{ue_safe}_sd_{int(solo_deuda)}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data)

    qs = Devengo.objects.all()
    response_data = obtener_kpis_devengo(qs, codigo_ue=ue, solo_deuda=solo_deuda)
    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_raw_all(request):
    """Devuelve toda la data de devengo sin paginación para el dashboard."""
    ue = request.GET.get('ue', '')
    desde = request.GET.get('desde', '')
    hasta = request.GET.get('hasta', '')
    try:
        limit = min(int(request.GET.get('limit', 5000)), 10000)
    except (ValueError, TypeError):
        limit = 5000

    qs = Devengo.objects.values(
        'codigo_ue', 'principal', 'tipo_documento', 'fecha_conforme',
        'id_chile_compra', 'catalogo_01', 'catalogo_02', 'catalogo_04',
        'concepto_presupuestario', 'monto_vigente', 'monto_disponible', 'monto_consumido',
    )
    if ue:
        qs = qs.filter(codigo_ue=ue)
    if desde:
        qs = qs.filter(fecha_conforme__gte=desde)
    if hasta:
        qs = qs.filter(fecha_conforme__lte=hasta)

    return Response(list(qs[:limit]))


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
        limit = min(int(request.GET.get('limit', 15000)), 20000)
    except (ValueError, TypeError):
        limit = 15000

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

    estado = request.GET.get('estado', '')
    anio = request.GET.get('anio', '')

    if estado:
        qs = qs.filter(EstadoOC__iexact=estado)
    if anio:
        try:
            qs = qs.filter(FechaEnvio__year=int(anio))
        except (ValueError, TypeError):
            pass

    return Response(list(qs[:limit]))


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
    qs = Factura.objects.values(
        'id', 'tipo_documento', 'folio', 'emisor', 'razon_social_emisor',
        'emision', 'monto_neto', 'monto_exento', 'monto_iva', 'monto_total',
        'estado_acepta', 'uri', 'estado_reclamo', 'fecha_reclamo',
        'estado_devengo', 'folio_oc', 'fecha_ingreso_oc',
        'folio_rc', 'fecha_ingreso_rc', 'ticket_devengo', 'folio_sigfe',
        'tarea_actual', 'fecha_ingreso', 'fecha_aceptacion', 'fecha_devengo',
    )
    if anio and anio.isdigit() and len(anio) == 4:
        # emision almacenado como DD-MM-YYYY → filtrar por sufijo en DB
        qs = qs.filter(emision__endswith=anio)

    return Response(list(qs))


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

        from .models import GestionContrato

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
    """KPIs y distribuciones para el dashboard de Gestión de Contratos."""
    from .models import GestionContrato

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

    return Response({
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
    })


class GestionContratoViewSet(viewsets.ReadOnlyModelViewSet):
    """Lista paginada de contratos con filtros básicos."""
    queryset = GestionContrato.objects.all()
    serializer_class = GestionContratoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ["estado_contrato", "categoria_contrato", "tipo_contrato", "unidad_requirente"]
    search_fields = ["nombre_contrato", "numero_contrato", "nombre_organismo"]
    ordering_fields = ["monto_contrato", "monto_ejecutado", "dias_restantes", "fecha_inicio"]
