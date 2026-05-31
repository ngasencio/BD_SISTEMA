# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Specialized agent files in `.claude/`** — read before starting any task:
> - `agent-arquitectura.md` — module patterns, where each piece goes, what NOT to do
> - `agent-datos.md` — full DB schema, relations, data sources, known data-quality bugs
> - `agent-seguridad.md` — known vulnerabilities, fixes, per-commit checklist
> - `agent-testing.md` — test strategy, pytest/Vitest patterns, priorities P1–P5
> - `agent-devops.md` — Nginx+Gunicorn deploy, systemd, ETL cron, backup, rollback
> - `django_mysql_expert.md` — Django/MySQL conventions (Clean Architecture, SOLID)
> - `react_expert.md` — React conventions (SOLID, Feature-Sliced Design)

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

No linting or test commands are configured yet (`backend/api/tests.py` is empty, no Vitest config).

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
    └── data/         # Static Excel/CSV files (PAC, FSC, facturas) — NOT in DB
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
```

**Lógica de negocio compleja** → always in `api/services.py`, never in views. Key service functions: `obtener_kpis_devengo`, `calcular_indicadores_res188`, `calcular_oc_stats`, `calcular_oc_productos`, `calcular_compraagil_ahorro_stats`.

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
