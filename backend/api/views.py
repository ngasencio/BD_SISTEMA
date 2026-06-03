import logging

from django.core.cache import cache
from django.db.models import Count, Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    BoletaGarantia, BoletaGarantiaAudit, Comprador,
    DetalleLicitacion, DetalleOrdenCompra, Devengo,
    Factura, Licitacion, OrdenCompra, Proveedor,
    PlanerPAC, CompraAgilResumen, CompraAgilProducto, CompraAgilProveedor,
    RevisionOCCorregible,
)
from .serializers import (
    BoletaGarantiaAuditSerializer, BoletaGarantiaSerializer,
    CompradorSerializer, DetalleLicitacionSerializer,
    DetalleOrdenCompraSerializer, DevengoSerializer,
    LicitacionSerializer, OrdenCompraSerializer, ProveedorSerializer,
    PlanerPACSerializer, CompraAgilResumenSerializer,
    CompraAgilProductoSerializer, CompraAgilProveedorSerializer,
    RevisionOCCorregibleSerializer,
)
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
