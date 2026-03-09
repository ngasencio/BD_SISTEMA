from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters
from .models import Licitacion, DetalleLicitacion, Devengo
from .serializers import LicitacionSerializer, DetalleLicitacionSerializer, DevengoSerializer
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from django.db.models import Sum, Count, Q, Avg, F
from django.core.cache import cache
from django.http import JsonResponse

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

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    cache_key = "dashboard_stats_general"
    cached_data = cache.get(cache_key)
    
    if cached_data:
        return Response(cached_data)

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
    
    # Caché por 5 minutos (300 segundos) para no abrumar la DB
    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


class DevengoViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet para el módulo de Control de Deuda (Anexo N°3)"""
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
    """KPIs agregados para el dashboard de Control de Deuda con optimización de caché"""
    ue = request.GET.get('ue', '')
    solo_deuda = request.GET.get('solo_deuda', '1') == '1'

    cache_key = f"devengo_stats_ue_{ue}_sd_{solo_deuda}"
    cached_data = cache.get(cache_key)
    
    if cached_data:
        return Response(cached_data)

    from .services import obtener_kpis_devengo
    qs = Devengo.objects.all()
    response_data = obtener_kpis_devengo(qs, codigo_ue=ue, solo_deuda=solo_deuda)
    
    # Guardar en caché por 5 minutos para performance óptimo del dashboard
    cache.set(cache_key, response_data, timeout=300)
    return Response(response_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devengo_raw_all(request):
    """Endpoint ultra-rápido para devolver toda la data de devengo al dashboard sin paginación."""
    # Solo solicitamos los campos que realmente usa el frontend para minimizar el JSON (de 14k registros)
    qs = Devengo.objects.values(
        'codigo_ue', 'principal', 'tipo_documento', 'fecha_conforme',
        'id_chile_compra', 'catalogo_01', 'catalogo_02', 'catalogo_04',
        'concepto_presupuestario', 'monto_vigente', 'monto_disponible', 'monto_consumido'
    )
    return JsonResponse(list(qs), safe=False)
