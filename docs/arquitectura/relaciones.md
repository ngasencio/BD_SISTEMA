# Relaciones

La dirección de cada fila va de **quien inicia o llama** hacia **quien responde o recibe**. Esta tabla se genera a mano a partir de `graph.json` — si edita el grafo, actualice también esta tabla (o regenérela con un script propio; hoy `build_graph.py` no la genera automáticamente, ver `hallazgos.md`).

| Origen | Destino | Relación | Tipo | Evidencia | Confianza |
|---|---|---|---|---|---|
| app-shell | home | ruta / | import | frontend/src/App.jsx:74 | verificada |
| app-shell | mapa-sistema | ruta /mapa-sistema | import | frontend/src/App.jsx (ruta agregada para este módulo) | verificada |
| home | mapa-sistema | botón Ver Mapa | import | frontend/src/features/inicio/components/InicioPage.jsx (botón «Mapa del sistema») | verificada |
| app-shell | mod-mercado-publico | rutas /licitaciones, /oc | import | frontend/src/App.jsx:75-76 | verificada |
| app-shell | mod-compra-agil | ruta /compra-agil | import | frontend/src/App.jsx:82 | verificada |
| app-shell | mod-pac | rutas /pac, /pac-cumplimiento | import | frontend/src/App.jsx:78,80 | verificada |
| app-shell | mod-abastecimiento | rutas /abastecimiento/* | import | frontend/src/App.jsx:85-87 | verificada |
| app-shell | mod-fsc-oc-pac | ruta /fsc-oc-pac | import | frontend/src/App.jsx:87 | verificada |
| app-shell | mod-anexo-sigfe | rutas /anexo1, /anexo3 | import | frontend/src/App.jsx:98-99 | verificada |
| app-shell | mod-finanzas-facturas | rutas /finanzas, /facturas | import | frontend/src/App.jsx:97,100 | verificada |
| app-shell | mod-usuarios | ruta /admin/usuarios | import | frontend/src/App.jsx:107-108 | verificada |
| app-shell | backend-api | login / refresh JWT | http | frontend/src/store/authStore.jsx + POST /api/auth/login/ | verificada |
| home | backend-api | REST dashboard/stats | http | GET /api/dashboard/stats/ | inferida |
| mod-mercado-publico | backend-api | REST licitaciones/oc | http | GET /api/licitaciones/, /api/ordenes-compra/ | verificada |
| mod-compra-agil | backend-api | REST compraagil-* | http | features/compra-agil/api/compraAgilApi.js | verificada |
| mod-pac | backend-api | REST pac*, pac-cumplimiento* | http | GET /api/pac/*, /api/pac-cumplimiento/* | verificada |
| mod-abastecimiento | backend-api | REST boletas/contratos/fsc | http | GET /api/boletas-garantia/, /api/contratos/, /api/formularios* | verificada |
| mod-fsc-oc-pac | backend-api | REST fsc-oc-pac/* | http | GET/POST /api/fsc-oc-pac/* | verificada |
| mod-anexo-sigfe | backend-api | REST devengo/anexo1 | http | GET /api/devengo-sigfe-anual/*, /api/sigfe-anexo1/* | verificada |
| mod-finanzas-facturas | backend-api | REST facturas raw_all | http | GET /api/facturas/raw_all/ | verificada |
| mod-usuarios | backend-api | REST usuarios/ | http | features/usuarios/components/UsuariosPage.jsx | inferida |
| backend-api | backend-services | delega cálculos | import | backend/api/views.py (import services) | verificada |
| backend-api | backend-ml | delega análisis ML | import | backend/api/views.py (import ml_services) | verificada |
| backend-api | backend-auth | autenticación JWT | import | backend/core/settings.py REST_FRAMEWORK | verificada |
| backend-api | mariadb | ORM queries | sql | backend/api/models.py | verificada |
| backend-services | mariadb | agregaciones ORM | sql | backend/api/services.py | verificada |
| backend-ml | mariadb | lee datos para ML | sql | backend/api/ml_services.py | verificada |
| backend-api | backend-etl-runner | POST */actualizar/ | import | backend/api/urls.py | verificada |
| backend-etl-runner | etl-licitaciones | import dinámico | import | backend/api/views.py:3327 | verificada |
| backend-etl-runner | etl-oc | import dinámico | import | backend/api/views.py:2988 | verificada |
| backend-etl-runner | etl-compra-agil | import dinámico | import | backend/api/views.py:2664 | verificada |
| backend-etl-runner | etl-contratos | import dinámico | import | backend/api/views.py:3624 | verificada |
| backend-etl-runner | etl-fsc-panel | import dinámico | import | backend/api/views.py:4097 | verificada |
| backend-etl-runner | etl-devengo-sigfe | import dinámico | import | backend/api/views.py:999 | verificada |
| backend-etl-runner | etl-anexo1-sigfe | import dinámico | import | backend/api/views.py:748 | verificada |
| backend-etl-runner | etl-facturas-dipres | import dinámico | import | backend/api/views.py:1322 | verificada |
| backend-api | etl-pac-loader | recarga maestro PAC | import | backend/api/urls.py:243-244 | verificada |
| etl-oc | backend-services | dispara matching FSC-OC | import | backend/api/views.py, tras oc.subir_maestros_a_django() | verificada |
| etl-fsc-panel | backend-services | dispara matching FSC-OC | import | api/data/data_panel/page_data_panel.py, tras _clasificar_dentro_fuera_pac() | verificada |
| etl-licitaciones | api-mercado-publico | descarga licitaciones | http | api/LI_SSO_SERVER.py | verificada |
| etl-oc | api-mercado-publico | descarga órdenes de compra | http | api/OC_SSO_SERVER.py | verificada |
| etl-compra-agil | api-mercado-publico | descarga compra ágil | http | api/AG_SSO_SERVER.py | verificada |
| etl-fsc-panel | panel-sso-documental | login + descarga FSC | scraping | api/data/data_panel/page_data_panel.py | verificada |
| etl-contratos | panel-sso-documental | descarga excel contratos | scraping | api/data/data_gestioncontratos/descargar_contratos_sso_selenium.py | verificada |
| etl-devengo-sigfe | sigfe-web | login + descarga devengo | scraping | api/data/data_devengo/sigfe_descarga_devengos_Completo.py | verificada |
| etl-anexo1-sigfe | sigfe-web | login + descarga ejecución | scraping | api/data/data_anexo1/Sigfe_Descargas_Estado_ejecucion_presupuestaria.py | verificada |
| etl-facturas-dipres | dipres-web | descarga facturas | scraping | api/data/data_facturas/dipres_scraper.py | verificada |
| etl-licitaciones | mariadb | DELETE + bulk_create | sql | api/LI_SSO_SERVER.py | verificada |
| etl-oc | mariadb | DELETE + bulk_create | sql | api/OC_SSO_SERVER.py | verificada |
| etl-compra-agil | mariadb | DELETE + bulk_create | sql | api/AG_SSO_SERVER.py | verificada |
| etl-fsc-panel | mariadb | upsert + borrado acotado | sql | api/data/data_panel/page_data_panel.py | verificada |
| etl-contratos | mariadb | carga GestionContrato | sql | backend/api/views.py:3614 | verificada |
| etl-devengo-sigfe | mariadb | upsert por doc_key | sql | api/data/data_devengo/consolidar_devengo_anual.py | verificada |
| etl-anexo1-sigfe | mariadb | consolida por establecimiento | sql | api/data/data_anexo1/consolidar_anexo1_sigfe.py | verificada |
| etl-facturas-dipres | mariadb | upsert folio+emisor | sql | api/data/data_facturas/actualizar_facturas.py | verificada |
| etl-pac-loader | mariadb | upsert PlanerPAC/Maestro | sql | api/data/data_planificacionPac/cargar_pac_servidor.py | verificada |
| etl-oc | archivos-maestros | lee OCPAC_Maestro.csv | archivo | api/OC_SSO_SERVER.py (enlazar_con_pac) | verificada |
| etl-pac-loader | archivos-maestros | lee PAC*.xlsx / CSV | archivo | api/data/data_planificacionPac/, api/data/data_pac/consolidar_pac.py | verificada |
| etl-contratos | archivos-maestros | descarga/lee excel | archivo | api/data/data_gestioncontratos/ | verificada |
| etl-licitaciones | archivos-maestros | snapshot CSV maestro | archivo | api/LI_DSSO/MAESTROS/ | inferida |
| etl-oc | archivos-maestros | snapshot CSV maestro | archivo | api/OC_DSSO/MAESTROS/ | inferida |
| etl-compra-agil | archivos-maestros | snapshot CSV maestro | archivo | api/CA_DSSO/MAESTROS/ | inferida |

## Aristas marcadas `inferida`

- `home → backend-api`: no se confirmó qué endpoint exacto consume el Home hoy (probablemente ninguno aún — la página es mayormente estática); se deja marcada por si en el futuro muestra KPIs.
- `mod-usuarios → backend-api`: no se ubicó el archivo `usuariosApi.js` explícito durante el reconocimiento, se infiere del patrón estándar de toda feature (`api/<nombre>Api.js`).
- `etl-licitaciones/etl-oc/etl-compra-agil → archivos-maestros` (snapshot CSV): se confirmó que las carpetas `MAESTROS/` existen y cambian en cada sync (según `git status`), pero no se leyó la línea exacta del script que escribe el CSV.
