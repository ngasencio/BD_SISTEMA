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
| `PlanerPAC` | (auto) | `id` | PAC plan data loaded from Excel |
| `CompraAgilResumen` | `api_compraagil_resumen` | `codigocompraagil` | `presupuestoestimado` is **TextField** |
| `CompraAgilDocumento` | `api_compraagil_documentos` | `id` | FK→CompraAgilResumen |
| `CompraAgilProducto` | `api_compraagil_productos` | `id` | FK→CompraAgilResumen |
| `CompraAgilProductoCotizado` | `api_compraagil_productos_cotizados` | `id` | Quoted prices |
| `CompraAgilProveedor` | `api_compraagil_proveedores` | `id` | `proveedorseleccionado` field is **inconsistent**: values are `"1"`, `"Si"`, `"si"`, `"True"`, `"true"` — check with `str(val) in ['1','Si','si','True','true']` |
| `RevisionOCCorregible` | (auto) | `id` | Manual PAC-link review with resultado/motivo/observaciones |
| `Devengo` | `devengo` | `id` | snake_case |
| `Anexo1` | `tabla_anexo1` | `id` | snake_case |
| `Proveedor` | `T_Proveedores` | `rut` | Custom table name |
| `Comprador` | `T_Comprador` | `id` | Custom table name |
| `BoletaGarantia` | `T_BoletaGarantia` | `id` | CRUD + file upload |
| `BoletaGarantiaAudit` | `T_BoletaGarantia_Audit` | `id` | Auto-written on update/delete |
| `GestionContrato` | `data_gestioncontratos` | `numero_contrato` (PK) | snake_case. `monto_por_ejecutar` nullable (>10^13 → None). `fecha_inicio`/`fecha_termino` malformed strings ("07-00-2026"). Join: `id_licitacion_oc = OrdenCompra.CodigoLicitacion` |
| `FormularioFSC` | `data_formularios_fsc` | `id` | snake_case. Sin clave natural única — `folio`/`folio+anho` se repiten (~33% colisión); ETL usa `update_or_create` por `folio+anho+unidad_requirente+fecha_solicitud` (no destructivo, preserva historial) |
| `FormularioFSCDerivado` | `data_formularios_fsc_derivados` | `id` | snake_case. Misma clave de upsert que `FormularioFSC` |
| `FormularioFSCProducto` | `data_formularios_fsc_productos` | `id` | snake_case. `tipo_formulario` usa `db_column='t_form'`. Clave de upsert: `folio+anho+tipo_formulario+categoria+producto+descripcion` |

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
GET   ordenes-compra/raw_all/             ?estado=&anio=&limit= (max 20 000, unpaginated)
GET   ordenes-compra/proyectos-licitacion/ CodigoLicitacion→ID_Proyecto map (10 min cache)
GET   facturas/raw_all/                   ?anio= (unpaginated, emision as DD-MM-YYYY string)

# Devengo (Anexo N°3)
GET   devengo/                            ?codigo_ue=&tipo_documento=&concepto_presupuestario=&search=&ordering=
GET   devengo/{id}/
GET   devengo/stats/                      ?ue=&solo_deuda= (5 min cache per ue/flag combo)
GET   devengo/raw_all/                    ?ue=&desde=&hasta=&limit= (max 10 000)

# PAC
GET   planer-pac/                         PAC plan rows
GET   pac/indicadores-res188/             Res.188/2026 savings indicators
GET   pac/oc-stats/                       OC stats aggregated for PAC
GET   pac/oc-productos/                   Products per OC for PAC analysis

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
POST  formularios/actualizar/             {rut, dv, clave} → launches async ETL task → {task_id}
POST  formularios/actualizar-cancelar/{task_id}/  Cancels running ETL
GET   formularios/actualizar-estado/{task_id}/    Polls ETL progress {status, paso_desc, progreso_pct, logs_recientes}
GET   formularios-fsc/                    ?anho=&unidad_requirente=&estado=&search=
GET   formularios-fsc-derivados/          ?anho=&estado_compra=&search=
GET   formularios-fsc-productos/          ?anho=&categoria=
```

**Lógica de negocio compleja** → always in `api/services.py`, never in views. Key service functions: `obtener_kpis_devengo`, `calcular_indicadores_res188`, `calcular_oc_stats`, `calcular_oc_productos`, `calcular_compraagil_ahorro_stats`, `calcular_contratos_evaluaciones`, `calcular_contratos_financiero`, `calcular_contratos_oc_detalle`, `calcular_contratos_plazos`, `calcular_contratos_pac`, `calcular_formularios_stats`.

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
| `/anexo3` | `pages/AnexoDeudaPage` | Authenticated |
| `/ordenes-compra` | `pages/OrdenesCompraDashboard` | Authenticated |
| `/compra-agil` | `features/compra-agil/components/CompraAgilPage` | Authenticated |
| `/pac` | `features/pac/components/PacDashboardPage` | Authenticated |
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
