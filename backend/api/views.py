import logging

from django.core.cache import cache
from django.db.models import Avg, Count, F, Q, Sum
from django.http import JsonResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Devengo, DetalleLicitacion, DetalleOrdenCompra, Licitacion, OrdenCompra
from .serializers import (
    DetalleOrdenCompraSerializer,
    DetalleLicitacionSerializer,
    DevengoSerializer,
    LicitacionSerializer,
    OrdenCompraSerializer,
)

logger = logging.getLogger(__name__)


# =============================================================================
# ViewSets de lectura
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


class DevengoViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet para el módulo Control de Deuda (Anexo N°3)."""
    queryset = Devengo.objects.all()
    serializer_class = DevengoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ['codigo_ue', 'tipo_documento', 'concepto_presupuestario']
    search_fields = ['principal', 'concepto_presupuestario', 'tipo_documento', 'codigo_ue']
    ordering_fields = ['monto_disponible', 'monto_vigente', 'fecha_conforme']
    ordering = ['-monto_disponible']


# =============================================================================
# Endpoints de estadísticas
# =============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """KPIs generales del dashboard de Licitaciones, con caché de 5 minutos."""
    cache_key = "dashboard_stats_general"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    total = Licitacion.objects.count()
    response_data = {
        'total': total,
        'cerradas': Licitacion.objects.filter(Estado='Cerrada').count(),
        'publicadas': Licitacion.objects.filter(Estado='Publicada').count(),
        'monto_total': Licitacion.objects.aggregate(t=Sum('MontoEstimado'))['t'] or 0,
        'compradores': Licitacion.objects.values('C_Usuario').distinct().count(),
    }

    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_stats(request):
    """KPIs agregados para el dashboard de Control de Deuda con caché de 5 minutos."""
    ue = request.GET.get('ue', '')
    solo_deuda = request.GET.get('solo_deuda', '1') == '1'

    # Sanitizar el parámetro ue para evitar inyección en claves de caché
    ue_safe = ue[:50].replace(' ', '_') if ue else 'all'
    cache_key = f"devengo_stats_{ue_safe}_sd_{int(solo_deuda)}"

    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    from .services import obtener_kpis_devengo
    qs = Devengo.objects.all()
    try:
        response_data = obtener_kpis_devengo(qs, codigo_ue=ue, solo_deuda=solo_deuda)
    except Exception:
        logger.exception("Error calculando KPIs de devengo (ue=%s)", ue)
        return Response({'error': 'Error interno al calcular estadísticas.'}, status=500)

    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_raw_all(request):
    """
    Devuelve los registros de devengo para el dashboard.

    Parámetros opcionales de filtrado:
      - ue:    filtra por código de unidad ejecutora
      - desde: fecha mínima de conforme (YYYY-MM-DD)
      - hasta: fecha máxima de conforme (YYYY-MM-DD)
      - limit: máximo de registros (default 5000, max 10000)
    """
    qs = Devengo.objects.all()

    ue = request.GET.get('ue', '')
    if ue:
        qs = qs.filter(codigo_ue=ue)

    desde = request.GET.get('desde', '')
    hasta = request.GET.get('hasta', '')
    if desde:
        qs = qs.filter(fecha_conforme__gte=desde)
    if hasta:
        qs = qs.filter(fecha_conforme__lte=hasta)

    try:
        limit = min(int(request.GET.get('limit', 5000)), 10000)
    except (ValueError, TypeError):
        limit = 5000

    qs = qs.values(
        'codigo_ue', 'principal', 'tipo_documento', 'fecha_conforme',
        'id_chile_compra', 'catalogo_01', 'catalogo_02', 'catalogo_04',
        'concepto_presupuestario', 'monto_vigente', 'monto_disponible', 'monto_consumido',
    ).order_by('-monto_disponible')[:limit]

    return JsonResponse(list(qs), safe=False)
