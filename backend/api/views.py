from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters
from .models import Licitacion, DetalleLicitacion, Devengo
from .serializers import LicitacionSerializer, DetalleLicitacionSerializer, DevengoSerializer
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from django.db.models import Sum, Count, Q, Avg, F

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
    """KPIs agregados para el dashboard de Control de Deuda"""
    ue = request.GET.get('ue', '')
    solo_deuda = request.GET.get('solo_deuda', '1') == '1'

    qs = Devengo.objects.all()
    if ue:
        qs = qs.filter(codigo_ue=ue)
    if solo_deuda:
        qs = qs.filter(monto_disponible__gt=0)

    agg = qs.aggregate(
        total_pendiente=Sum('monto_disponible'),
        total_pagado=Sum('monto_consumido'),
        total_vigente=Sum('monto_vigente'),
        n_registros=Count('id'),
    )

    # Top 10 proveedores con mayor deuda
    top_proveedores = (
        qs.values('principal')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')[:10]
    )

    # Deuda por UE
    por_ue = (
        qs.values('codigo_ue')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')
    )

    # Deuda por tipo de documento
    por_tipo_doc = (
        qs.values('tipo_documento')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')[:10]
    )

    # Deuda por concepto N1
    por_n1 = (
        qs.values('concepto_presupuestario')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')[:15]
    )

    total_pendiente = float(agg['total_pendiente'] or 0)
    total_vigente = float(agg['total_vigente'] or 0)
    pct_pendiente = round((total_pendiente / total_vigente * 100), 1) if total_vigente > 0 else 0

    top_prov = list(top_proveedores)
    top_ue_entry = list(por_ue[:1])

    return Response({
        'kpis': {
            'deuda_total': total_pendiente,
            'deuda_pagada': float(agg['total_pagado'] or 0),
            'monto_vigente': total_vigente,
            'pct_pendiente': pct_pendiente,
            'n_registros': agg['n_registros'],
            'top_proveedor': top_prov[0]['principal'] if top_prov else '-',
            'top_proveedor_monto': float(top_prov[0]['deuda']) if top_prov else 0,
            'top_ue': top_ue_entry[0]['codigo_ue'] if top_ue_entry else '-',
            'top_ue_monto': float(top_ue_entry[0]['deuda']) if top_ue_entry else 0,
        },
        'por_ue': [{'ue': r['codigo_ue'], 'deuda': float(r['deuda'])} for r in por_ue],
        'top_proveedores': [{'prov': r['principal'], 'deuda': float(r['deuda'])} for r in top_proveedores],
        'por_tipo_doc': [{'td': r['tipo_documento'], 'deuda': float(r['deuda'])} for r in por_tipo_doc],
        'por_n1': [{'cp': r['concepto_presupuestario'], 'deuda': float(r['deuda'])} for r in por_n1],
    })
