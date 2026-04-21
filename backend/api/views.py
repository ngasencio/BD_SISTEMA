import logging

from django.core.cache import cache
from django.http import JsonResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters, serializers as drf_serializers, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    BoletaGarantia, BoletaGarantiaAudit, Comprador,
    DetalleLicitacion, DetalleOrdenCompra, Devengo,
    Factura, Licitacion, OrdenCompra, Proveedor,
)
from .serializers import (
    BoletaGarantiaAuditSerializer, BoletaGarantiaSerializer,
    CompradorSerializer, DetalleLicitacionSerializer,
    DetalleOrdenCompraSerializer, DevengoSerializer,
    FacturaSerializer, LicitacionSerializer, OrdenCompraSerializer, ProveedorSerializer,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Licitaciones
# =============================================================================

class LicitacionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Licitacion.objects.prefetch_related('detalles').all()
    serializer_class = LicitacionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['Estado', 'C_NombreOrganismo', 'Tipo', 'EsRenovable']


class DetalleLicitacionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DetalleLicitacion.objects.all()
    serializer_class = DetalleLicitacionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['licitacion', 'CodigoProducto', 'Categoria']


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


# =============================================================================
# Dashboard stats (licitaciones)
# =============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    cache_key = 'dashboard_stats_general'
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data)

    from django.db.models import Sum
    total = Licitacion.objects.count()
    cerradas = Licitacion.objects.filter(Estado='Cerrada').count()
    publicadas = Licitacion.objects.filter(Estado='Publicada').count()
    monto_total = Licitacion.objects.aggregate(t=Sum('MontoEstimado'))['t'] or 0
    compradores = Licitacion.objects.values('C_Usuario').distinct().count()

    response_data = {
        'total': total,
        'cerradas': cerradas,
        'publicadas': publicadas,
        'monto_total': monto_total,
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
    cache_key = f'devengo_stats_ue_{ue_safe}_sd_{solo_deuda}'
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data)

    from .services import obtener_kpis_devengo
    qs = Devengo.objects.all()
    response_data = obtener_kpis_devengo(qs, codigo_ue=ue, solo_deuda=solo_deuda)
    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


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
    )

    estado = request.GET.get('estado', '')
    anio = request.GET.get('anio', '')

    if estado:
        qs = qs.filter(EstadoOC__iexact=estado)
    if anio:
        qs = qs.filter(FechaEnvio__year=anio)

    return JsonResponse(list(qs[:limit]), safe=False)


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

    return JsonResponse(list(qs[:limit]), safe=False)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def facturas_raw_all(request):
    """Devuelve todas las facturas sin paginación para el dashboard OC."""
    anio = request.GET.get('anio', '')
    qs = Factura.objects.values(
        'id', 'tipo_documento', 'folio', 'emisor', 'razon_social_emisor',
        'emision', 'monto_neto', 'monto_exento', 'monto_iva', 'monto_total',
        'estado_acepta', 'uri', 'estado_reclamo', 'fecha_reclamo',
        'estado_devengo', 'folio_oc', 'fecha_ingreso_oc',
        'folio_rc', 'fecha_ingreso_rc', 'ticket_devengo', 'folio_sigfe',
        'tarea_actual', 'fecha_ingreso', 'fecha_aceptacion', 'fecha_devengo',
    )
    if anio:
        # emision tiene formato DD-MM-YYYY — filtramos el año en posición 6..9
        qs = [r for r in qs if (r['emision'] or '')[-4:] == anio]
        return JsonResponse(list(qs), safe=False)
    return JsonResponse(list(qs), safe=False)


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
    ordering_fields = ['vigencia_garantia', 'fecha_emision', 'mes_anio', 'monto', 'created_at', 'numero_documento', 'tipo_documento', 'proveedor__nombre', 'estado_trazabilidad']
    ordering = ['-vigencia_garantia']

    def _snapshot(self, instance):
        """Serializa una instancia a dict para guardar en auditoría."""
        return BoletaGarantiaSerializer(instance, context={'request': self.request}).data

    def perform_create(self, serializer):
        serializer.save(creado_por=self.request.user)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        # Capturar estado ANTES de guardar cambios
        snapshot_antes = self._snapshot(instance)

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            logger.warning('Errores de validación en UPDATE boleta %s: %s', instance.pk, serializer.errors)
            return Response(serializer.errors, status=400)

        self.perform_update(serializer)

        # Registrar en auditoría
        snapshot_despues = self._snapshot(serializer.instance)
        BoletaGarantiaAudit.objects.create(
            accion='MODIFICAR',
            boleta_id=instance.pk,
            numero_documento=instance.numero_documento,
            snapshot_antes=snapshot_antes,
            snapshot=snapshot_despues,
            eliminado_por=request.user,
            razon='',
        )
        logger.info('Boleta %s modificada por %s.', instance.pk, request.user.username)

        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def perform_destroy(self, instance):
        razon = self.request.data.get('razon', '')
        snapshot = self._snapshot(instance)
        BoletaGarantiaAudit.objects.create(
            accion='ELIMINAR',
            boleta_id=instance.pk,
            numero_documento=instance.numero_documento,
            snapshot=snapshot,
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
    """Historial de auditoría de boletas eliminadas (solo lectura)."""
    queryset = BoletaGarantiaAudit.objects.select_related('eliminado_por').all()
    serializer_class = BoletaGarantiaAuditSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [drf_filters.OrderingFilter]
    ordering_fields = ['eliminado_en', 'boleta_id']
    ordering = ['-eliminado_en']
