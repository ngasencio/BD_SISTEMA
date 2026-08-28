from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import MyTokenObtainPairSerializer
from .views import (
    BoletaGarantiaAuditViewSet, BoletaGarantiaViewSet,
    CompradorViewSet, DetalleLicitacionViewSet, DetalleOrdenCompraViewSet,
    LicitacionViewSet, OrdenCompraViewSet, ProveedorViewSet,
    dashboard_stats, facturas_raw_all, facturas_stats_view, facturas_analisis_view,
    iniciar_actualizacion_facturas, estado_actualizacion_facturas, cancelar_actualizacion_facturas,
    DevengoSigfeAnualViewSet, devengo_sigfe_anual_raw_all, devengo_sigfe_anual_reporte_html,
    devengo_sigfe_anual_stats,
    iniciar_actualizacion_sigfe, estado_actualizacion_sigfe, cancelar_actualizacion_sigfe,
    ordenes_compra_raw_all, ordenes_compra_proyectos_licitacion,
    PlanerPACViewSet, CompraAgilResumenViewSet, CompraAgilProductoViewSet,
    CompraAgilProveedorViewSet, pac_indicadores_view, pac_oc_stats_view,
    pac_oc_productos_view, compraagil_ahorro_stats_view, compraagil_anios_view,
    compraagil_comparativa_view, compraagil_patrones_view,
    RevisionOCCorregibleViewSet,
    licitaciones_ahorro_stats, licitaciones_gestion_stats, licitaciones_anos_view,
    licitaciones_calendario, licitaciones_anos_calendario,
    compraagil_calendario, compraagil_anos_calendario,
    iniciar_descarga_ofertas, estado_descarga_ofertas, descargar_archivo_ofertas,
    iniciar_actualizacion_compraagil, estado_actualizacion_compraagil,
    iniciar_actualizacion_oc, estado_actualizacion_oc,
    iniciar_actualizacion_li, estado_actualizacion_li,
    cancelar_actualizacion_ca, cancelar_actualizacion_oc, cancelar_actualizacion_li,
    GestionContratoViewSet,
    iniciar_actualizacion_contratos, estado_actualizacion_contratos,
    cancelar_actualizacion_contratos, contratos_stats_view,
    contratos_evaluaciones_view, contratos_financiero_view,
    contratos_oc_detalle_view, contratos_plazos_view, contratos_pac_view,
    contratos_pac_detalle_oc_view,
    FormularioFSCViewSet, FormularioFSCDerivadoViewSet, FormularioFSCProductoViewSet,
    iniciar_actualizacion_formularios, estado_actualizacion_formularios,
    cancelar_actualizacion_formularios, formularios_stats_view, formularios_flujo_view,
    formularios_alertas_view, formularios_unificacion_view, formularios_historial_view,
    formularios_organigrama_view,
    UsuarioViewSet, user_me, DepartamentoViewSet, EstablecimientoViewSet,
    SigfeAnexo1ViewSet, sigfe_anexo1_estado_bd, sigfe_anexo1_resumen, sigfe_anexo1_guia_simple,
    sigfe_anexo1_serie_nivel1,
    sigfe_anexo1_alertas, sigfe_anexo1_semaforo, sigfe_anexo1_burn_rate, sigfe_anexo1_deuda_flotante,
    sigfe_anexo1_tendencias, sigfe_anexo1_financiero,
    sigfe_anexo1_detallado, sigfe_anexo1_detallado_pareto, sigfe_anexo1_detallado_temporal, sigfe_anexo1_detallado_control,
    sigfe_anexo1_reporte_pdf, sigfe_anexo1_conciliacion_devengo,
    iniciar_actualizacion_anexo1, estado_actualizacion_anexo1, cancelar_actualizacion_anexo1,
    pac_cumplimiento_dentro_fuera_view, pac_cumplimiento_temporal_view,
    pac_cumplimiento_jerarquia_view, pac_cumplimiento_rankings_view,
    pac_cumplimiento_temporalidad_mensual_view, pac_cumplimiento_resumen_subdireccion_view,
    pac_cumplimiento_serie_mensual_view,
    pac_ficha_lista_view, pac_ficha_detalle_view,
    pac_temporal_mensual_planer_view, pac_jerarquia_planer_view,
    pac_cumplimiento_actualizar_maestro, pac_cumplimiento_actualizar_jerarquia,
    pac_cumplimiento_reporte_word, pac_cumplimiento_reporte_ppt, pac_cumplimiento_reporte_pdf,
    pac_indicadores_reporte_word, pac_indicadores_reporte_ppt, pac_indicadores_reporte_pdf,
)

class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer

router = DefaultRouter()
router.register(r'licitaciones', LicitacionViewSet, basename='licitacion')
router.register(r'detalles', DetalleLicitacionViewSet, basename='detallicitacion')
router.register(r'devengo-sigfe-anual', DevengoSigfeAnualViewSet, basename='devengosigfeanual')
router.register(r'sigfe-anexo1', SigfeAnexo1ViewSet, basename='sigfeanexo1')
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

# Módulo Formularios FSC (Panel SS Osorno)
router.register(r'formularios-fsc', FormularioFSCViewSet, basename='formulariofsc')
router.register(r'formularios-fsc-derivados', FormularioFSCDerivadoViewSet, basename='formulariofscderivado')
router.register(r'formularios-fsc-productos', FormularioFSCProductoViewSet, basename='formulariofscproducto')

# Módulo Usuarios
router.register(r'usuarios', UsuarioViewSet, basename='usuario')
router.register(r'departamentos', DepartamentoViewSet, basename='departamento')
router.register(r'establecimientos', EstablecimientoViewSet, basename='establecimiento')

urlpatterns = [
    # Autenticación JWT (con claims de role/cargo/establecimiento)
    path('auth/login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', user_me, name='user_me'),

    # Estadísticas y endpoints especiales
    path('dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    path('devengo-sigfe-anual/raw_all/', devengo_sigfe_anual_raw_all, name='devengo_sigfe_anual_raw_all'),
    path('devengo-sigfe-anual/stats/', devengo_sigfe_anual_stats, name='devengo_sigfe_anual_stats'),
    path('devengo-sigfe-anual/reporte-html/', devengo_sigfe_anual_reporte_html, name='devengo_sigfe_anual_reporte_html'),
    path('devengo-sigfe-anual/actualizar/', iniciar_actualizacion_sigfe, name='sigfe_actualizar'),
    path('devengo-sigfe-anual/actualizar-estado/<str:task_id>/', estado_actualizacion_sigfe, name='sigfe_actualizar_estado'),
    path('devengo-sigfe-anual/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_sigfe, name='sigfe_actualizar_cancelar'),
    path('sigfe-anexo1/estado-bd/', sigfe_anexo1_estado_bd, name='sigfe_anexo1_estado_bd'),
    path('sigfe-anexo1/resumen/', sigfe_anexo1_resumen, name='sigfe_anexo1_resumen'),
    path('sigfe-anexo1/guia-simple/', sigfe_anexo1_guia_simple, name='sigfe_anexo1_guia_simple'),
    path('sigfe-anexo1/serie-nivel1/', sigfe_anexo1_serie_nivel1, name='sigfe_anexo1_serie_nivel1'),
    path('sigfe-anexo1/alertas/', sigfe_anexo1_alertas, name='sigfe_anexo1_alertas'),
    path('sigfe-anexo1/semaforo/', sigfe_anexo1_semaforo, name='sigfe_anexo1_semaforo'),
    path('sigfe-anexo1/burn-rate/', sigfe_anexo1_burn_rate, name='sigfe_anexo1_burn_rate'),
    path('sigfe-anexo1/deuda-flotante/', sigfe_anexo1_deuda_flotante, name='sigfe_anexo1_deuda_flotante'),
    path('sigfe-anexo1/tendencias/', sigfe_anexo1_tendencias, name='sigfe_anexo1_tendencias'),
    path('sigfe-anexo1/financiero/', sigfe_anexo1_financiero, name='sigfe_anexo1_financiero'),
    path('sigfe-anexo1/detallado/', sigfe_anexo1_detallado, name='sigfe_anexo1_detallado'),
    path('sigfe-anexo1/detallado/pareto/', sigfe_anexo1_detallado_pareto, name='sigfe_anexo1_detallado_pareto'),
    path('sigfe-anexo1/detallado/temporal/', sigfe_anexo1_detallado_temporal, name='sigfe_anexo1_detallado_temporal'),
    path('sigfe-anexo1/detallado/control/', sigfe_anexo1_detallado_control, name='sigfe_anexo1_detallado_control'),
    path('sigfe-anexo1/reporte-pdf/', sigfe_anexo1_reporte_pdf, name='sigfe_anexo1_reporte_pdf'),
    path('sigfe-anexo1/conciliacion-devengo/', sigfe_anexo1_conciliacion_devengo, name='sigfe_anexo1_conciliacion_devengo'),
    path('sigfe-anexo1/actualizar/', iniciar_actualizacion_anexo1, name='anexo1_actualizar'),
    path('sigfe-anexo1/actualizar-estado/<str:task_id>/', estado_actualizacion_anexo1, name='anexo1_actualizar_estado'),
    path('sigfe-anexo1/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_anexo1, name='anexo1_actualizar_cancelar'),
    path('ordenes-compra/raw_all/', ordenes_compra_raw_all, name='ordenes_compra_raw_all'),
    path('ordenes-compra/proyectos-licitacion/', ordenes_compra_proyectos_licitacion, name='oc_proyectos_licitacion'),
    path('facturas/raw_all/', facturas_raw_all, name='facturas_raw_all'),
    path('facturas/stats/', facturas_stats_view, name='facturas_stats'),
    path('facturas/analisis/', facturas_analisis_view, name='facturas_analisis'),
    path('facturas/actualizar/', iniciar_actualizacion_facturas, name='iniciar_actualizacion_facturas'),
    path('facturas/actualizar-estado/<str:task_id>/', estado_actualizacion_facturas, name='estado_actualizacion_facturas'),
    path('facturas/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_facturas, name='cancelar_actualizacion_facturas'),
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
    path('licitaciones/descarga-archivo/<str:task_id>/', descargar_archivo_ofertas, name='descargar_archivo_ofertas'),

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
    path('contratos/pac-detalle-oc/', contratos_pac_detalle_oc_view, name='contratos_pac_detalle_oc'),

    # Formularios FSC — ETL desde dashboard
    path('formularios/stats/', formularios_stats_view, name='formularios_stats'),
    path('formularios/flujo/', formularios_flujo_view, name='formularios_flujo'),
    path('formularios/actualizar/', iniciar_actualizacion_formularios, name='iniciar_actualizacion_formularios'),
    path('formularios/actualizar-estado/<str:task_id>/', estado_actualizacion_formularios, name='estado_actualizacion_formularios'),
    path('formularios/actualizar-cancelar/<str:task_id>/', cancelar_actualizacion_formularios, name='cancelar_actualizacion_formularios'),
    path('formularios/alertas/', formularios_alertas_view, name='formularios_alertas'),
    path('formularios/unificacion/', formularios_unificacion_view, name='formularios_unificacion'),
    path('formularios/historial/', formularios_historial_view, name='formularios_historial'),
    path('formularios/organigrama/', formularios_organigrama_view, name='formularios_organigrama'),

    # Módulo PAC — Seguimiento y Rendimiento del Plan Anual de Compras
    path('pac-cumplimiento/dentro-fuera/', pac_cumplimiento_dentro_fuera_view, name='pac_cumplimiento_dentro_fuera'),
    path('pac-cumplimiento/temporal/', pac_cumplimiento_temporal_view, name='pac_cumplimiento_temporal'),
    path('pac-cumplimiento/jerarquia/', pac_cumplimiento_jerarquia_view, name='pac_cumplimiento_jerarquia'),
    path('pac-cumplimiento/rankings/', pac_cumplimiento_rankings_view, name='pac_cumplimiento_rankings'),
    path('pac-cumplimiento/temporalidad-mensual/', pac_cumplimiento_temporalidad_mensual_view, name='pac_cumplimiento_temporalidad_mensual'),
    path('pac-cumplimiento/resumen-subdireccion/', pac_cumplimiento_resumen_subdireccion_view, name='pac_cumplimiento_resumen_subdireccion'),
    path('pac-cumplimiento/serie-mensual/', pac_cumplimiento_serie_mensual_view, name='pac_cumplimiento_serie_mensual'),

    # Módulo PAC — Ejecución del Plan de Compras (Ficha PAC ↔ Formulario ↔ OC)
    path('pac-cumplimiento/fichas/', pac_ficha_lista_view, name='pac_ficha_lista'),
    path('pac-cumplimiento/fichas/<str:id_proyecto>/', pac_ficha_detalle_view, name='pac_ficha_detalle'),
    path('pac-cumplimiento/temporal-mensual-planer/', pac_temporal_mensual_planer_view, name='pac_temporal_mensual_planer'),
    path('pac-cumplimiento/jerarquia-planer/', pac_jerarquia_planer_view, name='pac_jerarquia_planer'),

    path('pac-cumplimiento/actualizar-maestro/', pac_cumplimiento_actualizar_maestro, name='pac_cumplimiento_actualizar_maestro'),
    path('pac-cumplimiento/actualizar-jerarquia/', pac_cumplimiento_actualizar_jerarquia, name='pac_cumplimiento_actualizar_jerarquia'),
    path('pac-cumplimiento/reporte/word/', pac_cumplimiento_reporte_word, name='pac_cumplimiento_reporte_word'),
    path('pac-cumplimiento/reporte/ppt/', pac_cumplimiento_reporte_ppt, name='pac_cumplimiento_reporte_ppt'),
    path('pac-cumplimiento/reporte/pdf/', pac_cumplimiento_reporte_pdf, name='pac_cumplimiento_reporte_pdf'),
    path('pac/reporte/word/', pac_indicadores_reporte_word, name='pac_indicadores_reporte_word'),
    path('pac/reporte/ppt/', pac_indicadores_reporte_ppt, name='pac_indicadores_reporte_ppt'),
    path('pac/reporte/pdf/', pac_indicadores_reporte_pdf, name='pac_indicadores_reporte_pdf'),

    # Router ViewSets
    path('', include(router.urls)),
]
