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
    Licitacion, OrdenCompra, Proveedor,
)
from .serializers import (
    BoletaGarantiaAuditSerializer, BoletaGarantiaSerializer,
    CompradorSerializer, DetalleLicitacionSerializer,
    DetalleOrdenCompraSerializer, DevengoSerializer,
    LicitacionSerializer, OrdenCompraSerializer, ProveedorSerializer,
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
def devengo_raw_all(request):
    """Devuelve toda la data de devengo sin paginación para el dashboard."""
    ue = request.GET.get('ue', '')
    desde = request.GET.get('desde', '')
    hasta = request.GET.get('hasta', '')
    limit = min(int(request.GET.get('limit', 5000)), 10000)

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
    """CRUD completo de Boletas de Garantía con auditoría en eliminación."""
    queryset = BoletaGarantia.objects.select_related('proveedor', 'comprador', 'creado_por').all()
    serializer_class = BoletaGarantiaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ['tipo_documento', 'formato_documento', 'banco', 'proveedor', 'comprador']
    search_fields = ['numero_documento', 'nombre_licitacion', 'id_licitacion', 'proveedor__nombre']
    ordering_fields = ['vigencia_garantia', 'fecha_emision', 'mes_anio', 'monto', 'created_at']
    ordering = ['-vigencia_garantia']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print(f"=== VALIDATION ERRORS (CREATE) ===\n{serializer.errors}\n==================================")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            print(f"=== VALIDATION ERRORS (UPDATE) ===\n{serializer.errors}\n==================================")
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(creado_por=self.request.user)

    def perform_destroy(self, instance):
        razon = self.request.data.get('razon', '')
        # Crear snapshot antes de eliminar
        snapshot_serializer = BoletaGarantiaSerializer(instance, context={'request': self.request})
        snapshot = snapshot_serializer.data

        BoletaGarantiaAudit.objects.create(
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
        return Response({'detail': 'Boleta eliminada y registrada en auditoría.'}, status=200)


class BoletaGarantiaAuditViewSet(NoPaginationMixin, viewsets.ReadOnlyModelViewSet):
    """Historial de auditoría de boletas eliminadas (solo lectura)."""
    queryset = BoletaGarantiaAudit.objects.select_related('eliminado_por').all()
    serializer_class = BoletaGarantiaAuditSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [drf_filters.OrderingFilter]
    ordering_fields = ['eliminado_en', 'boleta_id']
    ordering = ['-eliminado_en']
