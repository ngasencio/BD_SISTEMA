from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    BoletaGarantiaAuditViewSet, BoletaGarantiaViewSet,
    CompradorViewSet, DetalleLicitacionViewSet, DetalleOrdenCompraViewSet,
    DevengoViewSet, LicitacionViewSet, OrdenCompraViewSet, ProveedorViewSet,
    dashboard_stats, devengo_raw_all, devengo_stats, facturas_raw_all,
    ordenes_compra_raw_all,
)

router = DefaultRouter()
router.register(r'licitaciones', LicitacionViewSet)
router.register(r'detalles', DetalleLicitacionViewSet)
router.register(r'devengo', DevengoViewSet)
router.register(r'ordenes-compra', OrdenCompraViewSet)
router.register(r'ordenes-compra-detalles', DetalleOrdenCompraViewSet)

# Módulo Garantías
router.register(r'proveedores', ProveedorViewSet)
router.register(r'compradores', CompradorViewSet)
router.register(r'boletas-garantia', BoletaGarantiaViewSet)
router.register(r'boletas-garantia-audit', BoletaGarantiaAuditViewSet)

urlpatterns = [
    # Autenticación JWT
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Estadísticas y endpoints especiales
    path('dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    path('devengo/stats/', devengo_stats, name='devengo_stats'),
    path('devengo/raw_all/', devengo_raw_all, name='devengo_raw_all'),
    path('ordenes-compra/raw_all/', ordenes_compra_raw_all, name='ordenes_compra_raw_all'),
    path('facturas/raw_all/', facturas_raw_all, name='facturas_raw_all'),

    # Router ViewSets
    path('', include(router.urls)),
]
