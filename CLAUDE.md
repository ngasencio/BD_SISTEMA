# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Agentes especializados en `.claude/`** — leer antes de cada tarea:
>
> | Agente | Cuándo leerlo |
> |---|---|
> | `agent-arquitectura.md` | Antes de agregar módulo, decidir estructura, o tocar routing |
> | `agent-datos.md` | Antes de consultar, modificar o crear modelos y relaciones DB |
> | `agent-codigo.md` | Antes de escribir código backend o frontend nuevo |
> | `agent-seguridad.md` | Antes de cada commit o deploy |
> | `agent-testing.md` | Antes de escribir cualquier test |
> | `agent-devops.md` | Para deploy, Nginx, ETL cron, backups, troubleshooting |

---

## What this system does

Internal procurement management web app for **Organismo 7296 — Servicio de Salud Osorno** (Chile). Pulls data from the Mercado Público API, stores it in MariaDB, and exposes it via Django REST API + React SPA.

---

## Development commands

```bash
# Backend — from BD_SISTEMA/backend/
python manage.py runserver 0.0.0.0:8000
python manage.py makemigrations && python manage.py migrate
python manage.py createsuperuser

# Frontend — from BD_SISTEMA/frontend/
npm run dev        # Vite dev server on :5173
npm run build      # Outputs to dist/ (served by Django at /bd_sistema/)

# ETL scripts — from BD_SISTEMA/api/  (run manually or via cron)
python LI_SSO_SERVER.py        # Licitaciones ETL
python OC_SSO_SERVER.py        # Órdenes de Compra ETL
```

No linting configured. Tests aún no implementados — ver `agent-testing.md` para la estrategia y los comandos (pytest + Vitest).

---

## Repository layout

```
BD_SISTEMA/
├── backend/          # Django 4.2 + DRF 3.16 — REST API on :8000
│   ├── core/         # settings.py, urls.py (mounts /api/ and /bd_sistema/ SPA)
│   └── api/          # ALL active models, views, serializers, services, urls
├── frontend/         # React 18 + Vite SPA — served at /bd_sistema/
│   └── src/
│       ├── App.jsx              # Router + RequireAuth/RequireRole guards
│       ├── components/ui/AppLayout.jsx  # Shell: Topbar + Sidebar + <Outlet>
│       ├── pages/               # Legacy pages (Dashboard, Home, OC, AnexoDeuda)
│       └── features/            # Feature-Sliced modules (preferred pattern)
└── api/              # Python ETL scripts — NOT a web server, run via CLI
    ├── LI_SSO_SERVER.py
    ├── OC_SSO_SERVER.py
    └── data/         # Static Excel/CSV files (PAC, facturas) — NOT in DB. FSC ya NO vive aquí: se sincroniza en vivo a la DB vía data_panel/page_data_panel.py
```

---

## Data flow

```
Mercado Público API (HTTPS, SSL disabled — known issue)
  → api/ ETL scripts (import Django ORM directly, no HTTP)
  → MariaDB :3306  bd_sistema
  → backend/ Django :8000  /api/*  (JWT required)
  → frontend/ React  /bd_sistema/
```

ETL scripts call `bulk_create` / `all().delete()` on the ORM directly — no intermediate HTTP. Modifying a model requires checking the corresponding ETL script for compatibility.

---

## Backend — active models (`backend/api/models.py`)

Two naming conventions coexist — **do not mix them in new code**:

| Convention | Models | Rule for new models |
|---|---|---|
| PascalCase fields (legacy, from MP API) | `Licitacion`, `OrdenCompra`, `DetalleLicitacion`, `DetalleOrdenCompra` | Keep as-is; use `db_column` if renaming |
| snake_case fields (correct Django style) | All others | **Use this** |

| Model | DB table | PK | Notes |
|---|---|---|---|
| `Licitacion` | `api_licitacion` | `codigo_licitacion` | PascalCase legacy |
| `DetalleLicitacion` | `api_detallicitacion` | `id` | FK→Licitacion |
| `OrdenCompra` | `api_ordencompra` | `codigo_oc` | PascalCase legacy. `TotalNeto`/`TotalBruto` are **TextField** — convert with `Number()` / `Decimal()` |
| `DetalleOrdenCompra` | `api_detalleordencompra` | `id` | FK→OrdenCompra |
| `Factura` | (auto) | `id` | `emision` stored as DD-MM-YYYY string |
| `PlanerPAC` | `data_planerpac` | `id` | snake_case. PAC plan vigente, cargado desde `PlanificacionPACxxxx.xlsx` vía `api/data/data_planificacionPac/cargar_pac_servidor.py` (upsert por `id_proyecto+nombre_item+pac+fecha_inicio_compra` — un mismo ítem puede repetirse en tramos con distinta fecha). `managed=True` desde que se retrofiteó la PK (antes el loader hacía `DROP TABLE`+`to_sql` crudo sin `id`). Se acumula año sobre año, nunca se borra. `cantidad_oc`/`meses_envio_oc` (TextField) agregados para el módulo PAC Cumplimiento. |
| `PacProyectoMaestro` | `data_pac_proyecto_maestro` | `id` | snake_case. Maestro histórico multi-año (PC20-PC26+) de proyectos PAC, cargado desde `OCPAC_Maestro.csv` (actualización manual) vía `python manage.py cargar_pac_maestro`. Usado solo para verificar si un `FormularioFSCDerivado.id_plan` corresponde a un proyecto PAC real (columna `dentro_fuera_pac`) — no trae fechas ni montos, eso vive en `PlanerPAC`. |
| `SsoSubdireccion` | `data_sso_subdireccion` | `subdireccion_id` | snake_case. Solo 4 filas (IDs 2-5) — nombres de las subdirecciones institucionales (Dirección SS Osorno), cargadas desde `mapa_sso.xlsx` vía `python manage.py cargar_jerarquia_sso`. Resuelve el nombre de `Departamento.subdireccion_id` cuando `establecimiento_id=1`; los otros 6 hospitales de la red se agrupan por `Establecimiento.descripcion` en su lugar (no tienen nombre propio de subdirección). |
| `CompraAgilResumen` | `api_compraagil_resumen` | `codigocompraagil` | `presupuestoestimado` is **TextField** |
| `CompraAgilDocumento` | `api_compraagil_documentos` | `id` | FK→CompraAgilResumen |
| `CompraAgilProducto` | `api_compraagil_productos` | `id` | FK→CompraAgilResumen |
| `CompraAgilProductoCotizado` | `api_compraagil_productos_cotizados` | `id` | Quoted prices |
| `CompraAgilProveedor` | `api_compraagil_proveedores` | `id` | `proveedorseleccionado` field is **inconsistent**: values are `"1"`, `"Si"`, `"si"`, `"True"`, `"true"` — check with `str(val) in ['1','Si','si','True','true']` |
| `RevisionOCCorregible` | (auto) | `id` | Manual PAC-link review with resultado/motivo/observaciones |
| `Anexo1` | `tabla_anexo1` | `id` | snake_case |
| `Proveedor` | `T_Proveedores` | `rut` | Custom table name |
| `Comprador` | `T_Comprador` | `id` | Custom table name |
| `BoletaGarantia` | `T_BoletaGarantia` | `id` | CRUD + file upload |
| `BoletaGarantiaAudit` | `T_BoletaGarantia_Audit` | `id` | Auto-written on update/delete |
| `GestionContrato` | `data_gestioncontratos` | `numero_contrato` (PK) | snake_case. `monto_por_ejecutar` nullable (>10^13 → None). `fecha_inicio`/`fecha_termino` malformed strings ("07-00-2026"). Join: `id_licitacion_oc = OrdenCompra.CodigoLicitacion` |
| `FormularioFSC` | `data_formularios_fsc` | `id` | snake_case. Sin clave natural única — `folio`/`folio+anho` se repiten (~33% colisión); ETL usa `update_or_create` por `folio+anho+unidad_requirente+fecha_solicitud`. El Panel SSO trae el histórico completo en cada descarga, así que desde 2026-07-21 el sync también **elimina** (acotado a los años presentes en el archivo, ver `_sincronizar_borrado()` en `page_data_panel.py`) las filas cuya clave ya no aparece — borrar un FSC elimina en cascada su `historial_estados`. Campos `adj_espec_tecnicas`, `adj_cotizacion`, `adj_validacion`, `adj_form_justificacion` (TextField nullable): URLs de adjuntos del Panel SSO. `destino_actual` (TextField nullable): persona que actualmente tiene el formulario. `item_presupuestario`/`folio_requerimiento` (CharField 200, nullable). `fecha_solicitud` como string `YYYY-MM-DD`. ViewSet filtra `?estado=DC,AA` (CSV) via `FormularioFSCFilter(BaseInFilter)` |
| `FormularioFSCDerivado` | `data_formularios_fsc_derivados` | `id` | snake_case. Misma clave de upsert que `FormularioFSC`. También tiene los 4 campos `adj_*`. **Módulo PAC Cumplimiento:** `dentro_fuera_pac` (choices `DENTRO`/`FUERA`, null) y `sso_departamento` (FK→`Departamento`, `db_constraint=False` porque esa tabla es `managed=False` con `id` tipo `int(11)` incompatible con el `bigint` que genera Django) — ambos calculados por `_clasificar_dentro_fuera_pac()` en `page_data_panel.py`, recalculado en cada sync. Null en `sso_departamento` = "Sin Clasificar" (unidad_requirente sin match), nunca se descarta. |
| `FormularioFSCProducto` | `data_formularios_fsc_productos` | `id` | snake_case. `tipo_formulario` usa `db_column='t_form'`. Clave de upsert: `folio+anho+tipo_formulario+categoria+producto+descripcion` |
| `DevengoSigfeAnual` | `api_sigfe_devengo_anual` | `id` | snake_case. Reemplaza por completo al viejo modelo `Devengo` (tabla `devengo`, eliminada). Histórico consolidado de devengo SIGFE por establecimiento — sincronización incremental (upsert por `row_hash`, nunca borra) vía `api/data/data_devengo/sigfe_descarga_devengos_Completo.py` + `consolidar_devengo_anual.py`, disparable desde el dashboard (`/api/devengo-sigfe-anual/actualizar/`). Todo el módulo Anexo N°3 (Control de Deuda) corre sobre esta tabla. |
| `ConceptoJerarquia` | `concepto_jerarquia` | `id` | snake_case. Jerarquía de 5 niveles (Subtítulo→Ítem→Asignación→Sub-asignación→Detalle) de conceptos presupuestarios, 702 registros, prácticamente estática. Se carga con `python manage.py cargar_jerarquia`. Usada para enriquecer el reporte HTML jerárquico de Anexo N°3. |

---

## Backend — all REST endpoints (`/api/`)

All require `Authorization: Bearer <access_token>` except `/auth/`.

```
POST  auth/login/                         TokenObtainPairView
POST  auth/refresh/                       TokenRefreshView

# Licitaciones
GET   licitaciones/                       ?Estado=&C_NombreOrganismo=&Tipo=&EsRenovable=
GET   licitaciones/{id}/
GET   detalles/                           ?licitacion=&CodigoProducto=&Categoria=
GET   dashboard/stats/                    KPI aggregates (5 min cache)

# Órdenes de Compra
GET   ordenes-compra/                     ?EstadoOC=&C_Unidad=&TipoOC=
GET   ordenes-compra/{id}/
GET   ordenes-compra-detalles/
GET   ordenes-compra/raw_all/             ?estado=&anio=&limit= (max 25 000, unpaginated, default 25 000)
GET   ordenes-compra/proyectos-licitacion/ CodigoLicitacion→ID_Proyecto map (10 min cache)
GET   facturas/raw_all/                   ?anio= (unpaginated, emision as DD-MM-YYYY string)

# Devengo SIGFE Anual (Anexo N°3 — reemplaza al viejo modelo/tabla Devengo, eliminado)
GET   devengo-sigfe-anual/                ?codigo_ue=&tipo_documento=&concepto_presupuestario=&search=&ordering=
GET   devengo-sigfe-anual/{id}/
GET   devengo-sigfe-anual/stats/          ?ue=&solo_deuda= (5 min cache per ue/flag combo)
GET   devengo-sigfe-anual/raw_all/        ?ue=&desde=&hasta=&limit= (max 100 000, default 50 000)
GET   devengo-sigfe-anual/reporte-html/   Reporte HTML standalone (árbol jerárquico + Chart.js) con D_SLIM inyectado — pedir con axios autenticado + iframe.srcDoc/Blob, NUNCA <iframe src=...> directo (5 min cache)
POST  devengo-sigfe-anual/actualizar/     {usuario, password, fecha_desde, fecha_hasta} (YYYY-MM-DD) → {task_id}. Selenium headless server-side.
GET   devengo-sigfe-anual/actualizar-estado/<task_id>/  Progreso + diff (nuevos_detalle, resumen_por_ue)
POST  devengo-sigfe-anual/actualizar-cancelar/<task_id>/  Cancelación real (mata el hilo + cierra Chrome)

# PAC
GET   planer-pac/                         PAC plan rows
GET   pac/indicadores-res188/             Res.188/2026 savings indicators
GET   pac/oc-stats/                       OC stats aggregated for PAC
GET   pac/oc-productos/                   Products per OC for PAC analysis

# PAC — Seguimiento y Rendimiento del Plan Anual de Compras (módulo separado del bloque PAC de arriba)
GET   pac-cumplimiento/dentro-fuera/      ?anho=&subdireccion=&depto= % Dentro/Fuera + comparativa histórica por año (5 min cache)
GET   pac-cumplimiento/temporal/          ?anho=&subdireccion=&depto= En fecha/Atrasado/Pendiente/Sin planificación (5 min cache)
GET   pac-cumplimiento/jerarquia/         ?anho= Árbol Subdirección→Departamento(raíz)→Sub-departamento (5 min cache)
GET   pac-cumplimiento/rankings/          ?anho=&tipo=depto|formulario Mejores/peores, score compuesto (5 min cache)
POST  pac-cumplimiento/actualizar-maestro/     Recarga OCPAC_Maestro.csv → PacProyectoMaestro (síncrono, sin task_id)
POST  pac-cumplimiento/actualizar-jerarquia/   Recarga nombres de subdirección desde mapa_sso.xlsx (síncrono)
GET   pac-cumplimiento/reporte/word|ppt|pdf/   ?periodo=YYYY-MM|YYYY-QN Descarga informe/presentación/PDF (python-docx/python-pptx/reportlab)

# Compra Ágil
GET   compraagil-resumen/                 ?estadoglosa=&unidadcompra=&search=
GET   compraagil-productos/               ?codigocompraagil=
GET   compraagil-proveedores/             ?codigocompraagil=
GET   compraagil/ahorro-stats/            ?fecha_desde=&fecha_hasta= (5 min cache)

# Garantías (Boletas)
GET   proveedores/                        ?search= (no pagination)
GET   compradores/                        ?search= (no pagination)
CRUD  boletas-garantia/                   ?tipo_documento=&banco=&proveedor=&search=&ordering=
GET   boletas-garantia/{id}/
GET   boletas-garantia-audit/             Read-only

# Revisiones OC
CRUD  revisiones-oc/                      ?codigo_oc=

# Gestión Contratos SSO
GET   contratos/                          ?estado_contrato=&categoria_contrato=&tipo_contrato=&unidad_requirente=&search=
GET   contratos/{numero_contrato}/
GET   contratos/stats/                    Aggregated KPIs (5 min cache)
POST  contratos/actualizar/               Launches async ETL task → {task_id}
POST  contratos/actualizar-cancelar/{task_id}/  Cancels running ETL
GET   contratos/tarea-status/{task_id}/   Polls ETL progress {status, paso_desc, progreso_pct, logs_recientes}
GET   contratos/evaluaciones/             Res.188 evaluation analysis (5 min cache)
GET   contratos/financiero/               OC reconciliation + financial projections (5 min cache)
GET   contratos/oc-detalle/               ?id_licitacion_oc= — OC + productos for one contract (5 min cache per id)
GET   contratos/plazos/                   Active contracts with alert levels (5 min cache)
GET   contratos/pac/                      PAC linkage pivot by year (5 min cache)

# Formularios FSC (Panel Documental SS Osorno — sync vía Selenium, reemplaza Excel)
GET   formularios/stats/                  ?anho= KPIs + distributions (5 min cache)
GET   formularios/flujo/                  ?anho= Pipeline P→AC + rechazados (5 min cache)
GET   formularios/alertas/                ?dias_min=10&anho= FSC activos con días desde solicitud ≥ umbral, ordenados por días desc
GET   formularios/unificacion/            ?anho= Grupos candidatos a compra conjunta: layer1=item_presupuestario (≥2 FSC), layer2=categoria. Estados ASDA→DC. (5 min cache)
GET   formularios/historial/              ?anho=&unidad_requirente=&usuario_requirente= FSC+productos embebidos excl. R/P. Usado por Tab "Historial de Compras". (5 min cache)
POST  formularios/actualizar/             {rut, dv, clave} → launches async ETL task → {task_id}
POST  formularios/actualizar-cancelar/{task_id}/  Cancels running ETL
GET   formularios/actualizar-estado/{task_id}/    Polls ETL progress {status, paso_desc, progreso_pct, logs_recientes, diff}
GET   formularios-fsc/                    ?anho=&unidad_requirente=&estado=DC,AA (CSV multi-select)&search=
GET   formularios-fsc-derivados/          ?anho=&estado_compra=&search=
GET   formularios-fsc-productos/          ?anho=&categoria=
```

**Lógica de negocio compleja** → always in `api/services.py`, never in views. Key service functions: `obtener_kpis_devengo`, `calcular_indicadores_res188`, `calcular_oc_stats`, `calcular_oc_productos`, `calcular_compraagil_ahorro_stats`, `calcular_contratos_evaluaciones`, `calcular_contratos_financiero`, `calcular_contratos_oc_detalle`, `calcular_contratos_plazos`, `calcular_contratos_pac`, `calcular_formularios_stats`, `calcular_formularios_unificacion`, `calcular_formularios_historial`. **Helpers en views.py (NO en services):** `_snapshot_fsc()` (captura estado pre-ETL), `_diff_fsc()` (compara snapshots y produce diff con 4 categorías: nuevos/cambiaron_estado/derivados_nuevos/pegados).

**Módulo PAC Cumplimiento** (`api/services.py`): `calcular_pac_dentro_fuera_stats`, `calcular_pac_comparativa_periodos`, `calcular_pac_cumplimiento_temporal`, `calcular_pac_jerarquia`, `calcular_pac_rankings` — todas aceptan `fecha_desde`/`fecha_hasta` (ISO, prioridad) o `anho`. `calcular_pac_jerarquia` resuelve sub-departamentos vía `_resolver_depto_raiz()`: sube la cadena `Departamento.parent_id` (hasta 3 niveles reales observados) hasta el departamento de primer nivel dentro de la misma subdirección/establecimiento — `es_depto == 'SI'` es la señal autoritativa de "soy de primer nivel" y corta la cadena ahí aunque `parent_id` apunte a otro lado (hay departamentos reales, ej. PRAIS, cuyo `parent_id` apunta al nodo que representa la propia Subdirección, no a un par). Sin este rollup, sub-departamentos (ej. "AYEKAN" bajo "DEPARTAMENTO DE SALUD MENTAL") aparecían como hermanos sueltos fragmentando las métricas — ver `_mapa_departamentos()`/`_resolver_depto_raiz()`. Generación de reportes en `api/services_reportes.py` (`generar_informe_word`/`generar_presentacion_ppt`/`generar_reporte_pdf`, matplotlib backend `Agg`) + `api/plantillas_narrativas.py` (frases condicionales, sin IA — usar `_n()`/`_money()` para formatear números, nunca `str.replace(',', '.')` sobre un párrafo completo, corrompe comas de la prosa).

**Cache pattern** — all stat endpoints use `LocMemCache` (volatile — lost on restart, not shared across workers):
```python
cache_key = f'my_stats_{param}'
if data := cache.get(cache_key):
    return Response(data)
# compute...
cache.set(cache_key, data, timeout=300)
```

---

## Frontend — layout rule (critical)

**All pages render inside `AppLayout`** (`components/ui/AppLayout.jsx`), which already provides `<Topbar>`, `<Sidebar>`, `<main class="main">` (margin-left: 68px, margin-top: 40px), and `<div class="content">` (padding: 24px 28px 48px).

**Pages must NOT include their own `<Sidebar>`, `<Topbar>`, `<main>`, or `<div class="content">`** — doing so stacks margins and creates ~192px of left whitespace.

```jsx
// ✅ Correct — renders inside AppLayout's .content
export default function MyPage() {
    return (
        <>
            <div className="page-header">
                <div className="page-title"><span className="page-title-icon">📄</span> Title</div>
                <div className="page-subtitle">Subtitle</div>
            </div>
            {/* content */}
        </>
    );
}

// ❌ Wrong — creates double wrapper
export default function MyPage() {
    return (
        <div style={{ display: 'flex' }}>
            <Sidebar /><main className="main"><Topbar /><div className="content">...</div></main>
        </div>
    );
}
```

Feature pages (`features/*/components/*Page.jsx`) use `<div className="feature-page">` as root — this is a no-padding semantic wrapper; AppLayout's `.content` provides the actual padding.

---

## Frontend — routes and feature structure

| Route | Component | Roles |
|---|---|---|
| `/login` | `features/auth/pages/LoginPage` | Public |
| `/` | `pages/Home` | Authenticated |
| `/licitaciones` | `pages/Dashboard` | Authenticated |
| `/anexo3/reporte-sigfe` | `features/devengo-sigfe/components/ReporteSigfePage` | Authenticated |
| `/ordenes-compra` | `pages/OrdenesCompraDashboard` | Authenticated |
| `/compra-agil` | `features/compra-agil/components/CompraAgilPage` | Authenticated |
| `/pac` | `features/pac/components/PacDashboardPage` | Authenticated |
| `/pac-cumplimiento` | `features/pac-cumplimiento/components/PacCumplimientoPage` | Authenticated — feature separada de `/pac` (Res.188/OC/Compra Ágil); 5 tabs: Resumen, Jerarquía, Rankings, Cumplimiento Temporal, Reportes |
| `/abastecimiento/*` | `features/abastecimiento/` | admin, abastecimiento, viewer |
| `/finanzas/*` | `features/finanzas/` | admin, finanzas |

New modules go in `src/features/<domain>/` with `api/`, `components/`, `hooks/`, `routes/` subdirectories. HTTP calls always through `src/lib/axios.js` (has JWT interceptors and automatic token refresh). Auth state only via `useAuth()` from `src/store/authStore.jsx`.

---

## Known issues to fix before production

| Priority | Issue | Location |
|---|---|---|
| 🔴 | `SECRET_KEY` and DB password hardcoded in source | `backend/core/settings.py` |
| 🔴 | `DEBUG = True` and `ALLOWED_HOSTS = ['*']` | `backend/core/settings.py` |
| 🔴 | DB user is `root` — needs least-privilege user | MariaDB |
| 🟠 | `CORS_ALLOW_ALL_ORIGINS = True` | `backend/core/settings.py` |
| 🟠 | SSL verification disabled in Mercado Público API calls | `api/*.py` ETL scripts |
| 🟠 | ETL uses DELETE+bulk_create without atomic rollback | `api/LI_SSO_SERVER.py`, `OC_SSO_SERVER.py` |
| 🟡 | `LocMemCache` is volatile and not shared across Gunicorn workers | `backend/core/settings.py` |
| 🟡 | `facturas_raw_all` filters year with Python string slicing instead of DB query | `backend/api/views.py:facturas_raw_all` |
| 🟡 | `Factura.emision` stored as DD-MM-YYYY string — can't index or range-query | `backend/api/models.py` |
| 🟡 | No DB indexes on frequent filter columns (EstadoOC, FechaEnvio, estadoglosa) | `backend/api/models.py` |
| 🟢 | Delete utility scripts not meant for production | `backend/fix_login.py`, `backend/add_cols.py`, `backend/run_err.txt` |
| 🟢 | `ordenes_compra/` app empty, not in INSTALLED_APPS | `backend/ordenes_compra/models.py` |
