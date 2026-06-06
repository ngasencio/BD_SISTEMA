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
    licitaciones_calendario, licitaciones_anos_calendario,
    compraagil_calendario, compraagil_anos_calendario,
    iniciar_descarga_ofertas, estado_descarga_ofertas,
    iniciar_actualizacion_compraagil, estado_actualizacion_compraagil,
    iniciar_actualizacion_oc, estado_actualizacion_oc,
    iniciar_actualizacion_li, estado_actualizacion_li,
    cancelar_actualizacion_ca, cancelar_actualizacion_oc, cancelar_actualizacion_li,
    GestionContratoViewSet,
    iniciar_actualizacion_contratos, estado_actualizacion_contratos,
    cancelar_actualizacion_contratos, contratos_stats_view,
    contratos_evaluaciones_view, contratos_financiero_view,
    contratos_oc_detalle_view, contratos_plazos_view, contratos_pac_view,
)

router = DefaultRouter()
router.register(r'licitaciones', LicitacionViewSet, basename='licitacion')
router.register(r'detalles', DetalleLicitacionViewSet, basename='detallicitacion')
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

# Módulo Gestión de Contratos
router.register(r'contratos', GestionContratoViewSet, basename='contrato')

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

    # Licitaciones — Calendario autónomo
    path('licitaciones/calendario/', licitaciones_calendario, name='licitaciones_calendario'),
    path('licitaciones/anos-calendario/', licitaciones_anos_calendario, name='licitaciones_anos_calendario'),

    # Compra Ágil — Calendario autónomo
    path('compraagil/calendario/', compraagil_calendario, name='compraagil_calendario'),
    path('compraagil/anos-calendario/', compraagil_anos_calendario, name='compraagil_anos_calendario'),

    # Descarga de ofertas (scraper)
    path('licitaciones/descarga-ofertas/', iniciar_descarga_ofertas, name='iniciar_descarga_ofertas'),
    path('licitaciones/descarga-estado/<str:task_id>/', estado_descarga_ofertas, name='estado_descarga_ofertas'),

    # Compra Ágil — Actualización ETL desde dashboard
    path('compraagil/actualizar/', iniciar_actualizacion_compraagil, name='iniciar_actualizacion_compraagil'),
    path('compraagil/actualizar-estado/<str:task_id>/', estado_actualizacion_compraagil, name='estado_actualizacion_compraagil'),

    # Órdenes de Compra — Actualización ETL desde dashboard
    path('ordenes-compra/actualizar/', iniciar_actualizacion_oc, name='iniciar_actualizacion_oc'),
    path('ordenes-compra/actualizar-estado/<str:task_id>/', estado_actualizacion_oc, name='estado_actualizacion_oc'),

    # Licitaciones — Actualización ETL desde dashboard
    path('licitaciones/actualizar/', iniciar_actualizacion_li, name='iniciar_actualizacion_li'),
    path('licitaciones/actualizar-estado/<str:task_id>/', estado_actualizacion_li, name='estado_actualizacion_li'),
    path('licitaciones/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_li, name='cancelar_actualizacion_li'),

    # OC — cancelación
    path('ordenes-compra/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_oc, name='cancelar_actualizacion_oc'),

    # Compra Ágil — cancelación
    path('compraagil/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_ca, name='cancelar_actualizacion_ca'),

    # Gestión de Contratos — ETL desde dashboard
    path('contratos/stats/', contratos_stats_view, name='contratos_stats'),
    path('contratos/actualizar/', iniciar_actualizacion_contratos, name='iniciar_actualizacion_contratos'),
    path('contratos/actualizar-estado/<str:task_id>/', estado_actualizacion_contratos, name='estado_actualizacion_contratos'),
    path('contratos/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_contratos, name='cancelar_actualizacion_contratos'),
    # Gestión de Contratos — analíticos
    path('contratos/evaluaciones/', contratos_evaluaciones_view, name='contratos_evaluaciones'),
    path('contratos/financiero/', contratos_financiero_view, name='contratos_financiero'),
    path('contratos/oc-detalle/', contratos_oc_detalle_view, name='contratos_oc_detalle'),
    path('contratos/plazos/', contratos_plazos_view, name='contratos_plazos'),
    path('contratos/pac/', contratos_pac_view, name='contratos_pac'),

    # Router ViewSets
    path('', include(router.urls)),
]
