from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from .models import Licitacion, DetalleLicitacion
from .serializers import LicitacionSerializer, DetalleLicitacionSerializer
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from django.db.models import Sum, Count, Q

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
    filterset_fields = ['CodigoLicitacion', 'CodigoProducto', 'Categoria']

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    total = Licitacion.objects.count()
    cerradas = Licitacion.objects.filter(Estado='Cerrada').count()
    publicadas = Licitacion.objects.filter(Estado='Publicada').count()
    monto_total = Licitacion.objects.aggregate(Sum('MontoEstimado'))['MontoEstimado__sum'] or 0
    compradores = Licitacion.objects.values('C_Usuario').distinct().count()

    return Response({
        'total': total,
        'cerradas': cerradas,
        'publicadas': publicadas,
        'monto_total': monto_total,
        'compradores': compradores,
    })
