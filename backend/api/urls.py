from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    BoletaGarantiaAuditViewSet, BoletaGarantiaViewSet,
    CompradorViewSet, DetalleLicitacionViewSet, DetalleOrdenCompraViewSet,
    DevengoViewSet, LicitacionViewSet, OrdenCompraViewSet, ProveedorViewSet,
    dashboard_stats, devengo_raw_all, devengo_stats, facturas_raw_all,
    ordenes_compra_raw_all, ordenes_compra_proyectos_licitacion,
    PlanerPACViewSet, CompraAgilResumenViewSet, CompraAgilProductoViewSet,
    CompraAgilProveedorViewSet, pac_indicadores_view, pac_oc_stats_view,
    pac_oc_productos_view, compraagil_ahorro_stats_view, compraagil_anios_view,
    compraagil_comparativa_view, compraagil_patrones_view,
    RevisionOCCorregibleViewSet,
    licitaciones_ahorro_stats, licitaciones_gestion_stats, licitaciones_anos_view,
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

# Módulo PAC / Compras Ágiles
router.register(r'planer-pac', PlanerPACViewSet)
router.register(r'compraagil-resumen', CompraAgilResumenViewSet)
router.register(r'compraagil-productos', CompraAgilProductoViewSet)
router.register(r'compraagil-proveedores', CompraAgilProveedorViewSet)

# Módulo Revisión OC Corregibles
router.register(r'revisiones-oc', RevisionOCCorregibleViewSet)

urlpatterns = [
    # Autenticación JWT
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Estadísticas y endpoints especiales
    path('dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    path('devengo/stats/', devengo_stats, name='devengo_stats'),
    path('devengo/raw_all/', devengo_raw_all, name='devengo_raw_all'),
    path('ordenes-compra/raw_all/', ordenes_compra_raw_all, name='ordenes_compra_raw_all'),
    path('ordenes-compra/proyectos-licitacion/', ordenes_compra_proyectos_licitacion, name='oc_proyectos_licitacion'),
    path('facturas/raw_all/', facturas_raw_all, name='facturas_raw_all'),
    path('pac/indicadores-res188/', pac_indicadores_view, name='pac_indicadores'),
    path('pac/oc-stats/', pac_oc_stats_view, name='pac_oc_stats'),
    path('pac/oc-productos/', pac_oc_productos_view, name='pac_oc_productos'),
    path('compraagil/ahorro-stats/', compraagil_ahorro_stats_view, name='compraagil_ahorro_stats'),
    path('compraagil/anios/', compraagil_anios_view, name='compraagil_anios'),
    path('compraagil/comparativa/', compraagil_comparativa_view, name='compraagil_comparativa'),
    path('compraagil/patrones/', compraagil_patrones_view, name='compraagil_patrones'),

    # Licitaciones — estadísticas extendidas
    path('licitaciones/anos/', licitaciones_anos_view, name='licitaciones_anos'),
    path('licitaciones/ahorro-stats/', licitaciones_ahorro_stats, name='licitaciones_ahorro_stats'),
    path('licitaciones/gestion-stats/', licitaciones_gestion_stats, name='licitaciones_gestion_stats'),

    # Router ViewSets
    path('', include(router.urls)),
]
