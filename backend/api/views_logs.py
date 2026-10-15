"""Endpoints de Administración › Logs (solo `admin`, solo lectura).

La lógica (filtros, resumen, salud, retención) vive en `services_logs.py`; acá solo se valida el
contacto HTTP. El registro es append-only: no hay POST/PUT/DELETE a propósito."""
import csv
import json

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import RegistroLog
from .serializers import RegistroLogDetalleSerializer, RegistroLogListaSerializer
from .services_logs import (
    CATEGORIAS_ETIQUETA, NIVELES_ETIQUETA, aplicar_filtros, calcular_resumen, calcular_salud,
    catalogo_acciones, titulo_accion,
)
from .views import _IsAdmin

_ORDENES = {'timestamp', 'level', 'category', 'action', 'actor_username', 'ip_address'}
_MAX_EXPORTAR = 20000


class _PaginacionLogs(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


def _orden(params):
    """`?ordering=campo` / `-campo` solo sobre campos permitidos; por defecto lo más reciente primero."""
    pedido = (params.get('ordering') or '-timestamp').strip()
    campo = pedido.lstrip('-')
    if campo not in _ORDENES:
        return ['-timestamp', '-id']
    return [pedido, 'id' if pedido == 'timestamp' else '-id']   # desempate estable


class RegistroLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Lista paginada, detalle, resumen, catálogo, salud y exportación del registro de logs."""
    queryset = RegistroLog.objects.all()
    permission_classes = [IsAuthenticated, _IsAdmin]
    pagination_class = _PaginacionLogs
    filter_backends = []   # los filtros son propios (aplicar_filtros): `search` no es el de DRF

    def get_serializer_class(self):
        return RegistroLogDetalleSerializer if self.action == 'retrieve' else RegistroLogListaSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'retrieve':
            return qs
        return aplicar_filtros(qs, self.request.query_params).order_by(*_orden(self.request.query_params))

    @action(detail=False, methods=['get'], url_path='resumen')
    def resumen(self, request):
        """KPIs de 24 h, serie por categoría y rankings de la ventana `?dias=` (1-90, por defecto 7)."""
        try:
            dias = int(request.query_params.get('dias', 7))
        except (TypeError, ValueError):
            dias = 7
        return Response(calcular_resumen(dias))

    @action(detail=False, methods=['get'], url_path='catalogo')
    def catalogo(self, request):
        """Qué significa cada acción y cada categoría/nivel (para filtros y para explicarle a cualquiera)."""
        return Response({
            'categorias': [{'codigo': c, 'etiqueta': e} for c, e in CATEGORIAS_ETIQUETA.items()],
            'niveles': [{'codigo': c, 'etiqueta': e} for c, e in NIVELES_ETIQUETA.items()],
            'acciones': catalogo_acciones(),
        })

    @action(detail=False, methods=['get'], url_path='salud')
    def salud(self, request):
        """Base de datos, disco y cola de logs. Lo anómalo queda registrado como RESOURCE_ALERT."""
        return Response(calcular_salud())

    @action(detail=False, methods=['get'], url_path='exportar')
    def exportar(self, request):
        """CSV (UTF-8 con BOM, separador `;`, abre directo en Excel) con los mismos filtros de la tabla."""
        qs = self.get_queryset()[:_MAX_EXPORTAR]
        respuesta = HttpResponse(content_type='text/csv; charset=utf-8')
        respuesta['Content-Disposition'] = (
            f'attachment; filename="logs_{timezone.localtime().strftime("%Y%m%d_%H%M")}.csv"')
        respuesta.write('﻿')
        w = csv.writer(respuesta, delimiter=';')
        w.writerow(['Fecha (hora Chile)', 'Fecha (UTC)', 'Nivel', 'Categoría', 'Acción', 'Qué ocurrió',
                    'Usuario', 'Rol', 'IP', 'Método', 'Ruta', 'Código HTTP', 'Detalle técnico (JSON)'])
        for r in qs:
            w.writerow([
                timezone.localtime(r.timestamp).strftime('%d-%m-%Y %H:%M:%S'),
                r.timestamp.strftime('%Y-%m-%dT%H:%M:%SZ'),
                NIVELES_ETIQUETA.get(r.level, r.level), CATEGORIAS_ETIQUETA.get(r.category, r.category),
                titulo_accion(r.action), r.message, r.actor_username, r.actor_role, r.ip_address or '',
                r.http_method, r.path, r.status_code or '',
                json.dumps(r.metadata, ensure_ascii=False, default=str),
            ])
        return respuesta
