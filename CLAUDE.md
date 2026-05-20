# CLAUDE.md — BD_SISTEMA

Contexto persistente del proyecto para Claude Code. Leer antes de cualquier tarea.

> **Subagentes disponibles:**
> - `backend/CLAUDE.md` — Django REST API: modelos, endpoints, convenciones
> - `frontend/CLAUDE.md` — React SPA: features, hooks, rutas, componentes
> - `api/CLAUDE.md` — Scripts ETL: flujo de datos, integración Django, CSV
>
> **Equipo de agentes especializados (`.claude/`):**
> - `agent-arquitectura.md` — Cómo agregar nuevos módulos, decisiones de diseño, patrón completo de feature
> - `agent-datos.md` — Mapa completo de tablas DB, relaciones, fuentes de datos, convenciones de nombres
> - `agent-seguridad.md` — Vulnerabilidades conocidas, fixes pendientes, checklist para código nuevo
> - `agent-testing.md` — Estrategia de tests, patrones Django/React, prioridades P1/P2/P3
> - `agent-devops.md` — Deploy con Nginx+Gunicorn, systemd, ETL automatizado, checklist de producción
> - `django_mysql_expert.md` — Buenas prácticas generales Django + MySQL (Clean Architecture, SOLID)
> - `react_expert.md` — Buenas prácticas generales React (SOLID, Feature-Sliced Design)

---

## Descripción del proyecto

Sistema web de gestión de compras públicas para el **organismo 7296** (Chile). Consume la API de Mercado Público, almacena en MariaDB y expone los datos mediante una API REST Django + SPA React.

---

## Estructura de repositorio

```
BD_SISTEMA/
├── backend/        # Django 4.2 + DRF — API REST
├── frontend/       # React 18 + Vite — SPA
├── api/            # Scripts ETL Python (ejecución manual/cron)
├── venv/           # Virtualenv Python compartido
└── requirements.txt
```

---

## Componente 1: `backend/` — Django REST API

### Stack
- Python + Django 4.2, Django REST Framework 3.16
- MySQL/MariaDB (`mysqlclient`), `django-cors-headers`, `simplejwt`
- `pandas`, `numpy` para procesamiento en servicios

### Configuración relevante (`backend/core/settings.py`)
- `DEBUG = True`, `ALLOWED_HOSTS = ['*']`
- DB: MariaDB en `127.0.0.1:3306`, base `bd_sistema`, usuario `root`
- `TIME_ZONE = 'America/Santiago'`, `LANGUAGE_CODE = 'es-cl'`
- JWT: access token 1 día / refresh token 7 días
- Cache: `LocMemCache` (volátil, se pierde al reiniciar el proceso)
- `CORS_ALLOW_ALL_ORIGINS = True`
- Paginación por defecto: 50 registros (`PageNumberPagination`)

### Apps Django
| App | Rol |
|---|---|
| `core/` | Configuración del proyecto, urls raíz |
| `api/` | App principal: modelos, views, serializers, servicios |
| `ordenes_compra/` | App secundaria, modelos en DB pero sin endpoints propios aún |

### Modelos de datos
| Modelo | Tabla | Descripción |
|---|---|---|
| `Licitacion` | (auto Django) | PK: `codigo_licitacion`. Estado, fechas, organismo, monto |
| `DetalleLicitacion` | (auto Django) | FK→Licitacion. Producto, categoría, ganador |
| `OrdenCompra` | `api_ordencompra` | PK: `codigo_oc`. Estado, montos, proveedor, comprador, PAC |
| `DetalleOrdenCompra` | `api_detalleordencompra` | FK→OrdenCompra. Líneas de detalle |
| `Devengo` | `devengo` | Anexo N°3: deuda por UE, tipo doc, conceptos presupuestarios |
| `Anexo1` | `tabla_anexo1` | Consolidado presupuestario |
| `Proveedor` | `T_Proveedores` | PK: `rut`. Catálogo para boletas |
| `Comprador` | `T_Comprador` | Catálogo compradores internos |
| `BoletaGarantia` | `T_BoletaGarantia` | CRUD completo con adjunto (media/) |
| `BoletaGarantiaAudit` | `T_BoletaGarantia_Audit` | Log JSON de cambios (MODIFICAR/ELIMINAR) |

### Endpoints REST (todos requieren JWT Bearer excepto `/auth/`)
```
POST   /api/auth/login/
POST   /api/auth/refresh/

GET    /api/licitaciones/             (filtros: Estado, C_NombreOrganismo, Tipo)
GET    /api/licitaciones/{id}/
GET    /api/detalles/
GET    /api/ordenes-compra/           (filtros: EstadoOC, C_Unidad, TipoOC)
GET    /api/ordenes-compra/{id}/
GET    /api/ordenes-compra-detalles/
GET    /api/ordenes-compra/raw_all/   (sin paginación, max 20000)
GET    /api/devengo/
GET    /api/devengo/{id}/
GET    /api/devengo/stats/            (cache 5min)
GET    /api/devengo/raw_all/          (sin paginación, max 10000)
GET    /api/dashboard/stats/          (KPIs licitaciones, cache 5min)
GET    /api/proveedores/              (sin paginación)
GET    /api/compradores/              (sin paginación)
CRUD   /api/boletas-garantia/
GET    /api/boletas-garantia-audit/   (solo lectura)
```

### Lógica de negocio
- `backend/api/services.py` → `obtener_kpis_devengo()`: agrega deuda por UE, top proveedores, breakdowns
- Auditoría de boletas se dispara automáticamente en update/delete (override de `perform_update`/`perform_destroy`)

---

## Componente 2: `frontend/` — React SPA

### Stack
- React 18.3, React Router 7.13, Axios 1.13
- Chart.js 4.5 + react-chartjs-2
- xlsx 0.18 para exportación Excel
- Vite 5.4 como build tool

### Configuración
- `VITE_API_URL=http://10.8.153.227:8000/api/` (IP LAN del servidor)
- Desplegada en subruta `/bd_sistema/` (`vite.config.js: base: '/bd_sistema/'`)
- `BrowserRouter` usa `basename="/bd_sistema"`

### Estructura de `src/`
```
src/
├── main.jsx            # Entry point, registra Chart.js
├── App.jsx             # Router principal con guards por rol
├── store/authStore.jsx # Context API + useReducer (auth global)
├── lib/axios.js        # Instancia Axios con interceptores JWT
├── utils.jsx
├── components/         # Componentes compartidos (Sidebar, Topbar, secciones)
├── pages/              # Páginas generales
│   ├── Dashboard.jsx          (/licitaciones)
│   ├── AnexoDeudaPage.jsx     (/anexo3)
│   └── OrdenesCompraDashboard.jsx (/ordenes-compra)
└── features/           # Módulos por dominio (lazy loaded)
    ├── auth/           # LoginPage, hooks, API calls
    ├── abastecimiento/ # Boletas garantía, FSC
    └── finanzas/       # Dashboard devengo
```

### Sistema de autenticación
- JWT en `localStorage` (`access_token`, `refresh_token`)
- Interceptor REQUEST: inyecta `Authorization: Bearer <token>`
- Interceptor RESPONSE: ante 401 → intenta refresh automático → si falla, limpia sesión y redirige a `/bd_sistema/login`
- Cola de peticiones pendientes durante el refresh (patrón `failedQueue`)

### Rutas y roles
| Ruta | Componente | Roles |
|---|---|---|
| `/login` | LoginPage | Público |
| `/` | Home | Autenticado |
| `/licitaciones` | Dashboard | Autenticado |
| `/anexo3` | AnexoDeudaPage | Autenticado |
| `/ordenes-compra` | OrdenesCompraDashboard | Autenticado |
| `/abastecimiento/*` | AbastecimientoDashboard, FSCManager, BoletasPage | admin, abastecimiento, viewer |
| `/finanzas/*` | FinanzasDashboard | admin, finanzas |

Roles extraídos del JWT payload: `user.role` o `user.groups[0]` → `admin | abastecimiento | finanzas | viewer`

### Capas de API por feature
- `features/auth/api/` → `/auth/`
- `features/abastecimiento/api/boletasApi.js` → proveedores, compradores, boletas, auditoría
- `features/abastecimiento/api/abastecimientoApi.js` → datos FSC/PAC
- `features/finanzas/api/finanzasApi.js` → devengo stats + raw_all

---

## Componente 3: `api/` — Scripts ETL Python

### Propósito
Extracción de datos desde Mercado Público hacia la base de datos. Se ejecutan manualmente desde CLI o por cron. **No son un servidor HTTP.**

### Configuración fija en scripts
- `CODIGO_ORGANISMO = "7296"`
- `TICKET = "2798F2D3-0AC5-4323-9BB9-5E90618194BA"`
- API Mercado Público: `https://api.mercadopublico.cl/servicios/v1/publico/`

### Scripts principales
| Script | Función |
|---|---|
| `LI_SSO_SERVER.py` | ETL de licitaciones. Menú CLI: descarga diaria, unificar, refresh, sincronizar a DB |
| `OC_SSO_SERVER.py` | ETL de órdenes de compra + cruce con datos PAC. Misma estructura |
| `OC_SSO_PorDiaPeriodo_v2.py` | Variante para rango de fechas |
| `apiv1/` | Scripts legacy de consolidación |

### Integración con Django (importante)
Los scripts importan Django ORM **directamente** mediante:
```python
sys.path.append('../backend')
os.environ['DJANGO_SETTINGS_MODULE'] = 'core.settings'
django.setup()
```
Luego llaman a `Model.objects.bulk_create()` y `Model.objects.all().delete()`.
**No hay comunicación HTTP entre ETL y backend.**

### Archivos de trabajo
```
api/LI_DSSO/DIARIO/     # CSVs diarios de licitaciones
api/LI_DSSO/MAESTROS/   # Maestro_Resumen.csv + Maestro_Detalle.csv
api/OC_DSSO/DIARIO/     # CSVs diarios de OC
api/OC_DSSO/MAESTROS/   # OC_Maestro_Resumen.csv + OC_Maestro_Detalles.csv
api/data/               # Datos estáticos: FSC, PAC, facturas, convenios, devengo, anexo1
```

### `api/data/data_loader.py`
Usa Streamlit con `@st.cache_data` para cargar FSC, PAC, OC-PAC y facturas. Interfaz de análisis exploratorio, **separada del sistema Django/React**.

---

## Flujo de datos completo

```
[Mercado Público API]
        │ HTTPS (urllib, SSL no verificado)
        ▼
[api/ Scripts ETL]  →  CSV locales  →  Django ORM directo
                                              │
                                              ▼
                                    [MariaDB :3306 bd_sistema]
                                              │ ORM
                                              ▼
                                    [backend/ Django :8000]
                                      /api/* (JWT required)
                                              │ HTTP/JSON + JWT
                                              ▼
                                    [frontend/ React /bd_sistema/]
```

---

## Base de datos

- **Motor:** MariaDB / MySQL
- **Host:** `127.0.0.1:3306`
- **Base:** `bd_sistema`
- **Usuario:** `root`
- **Charset:** `utf8mb4`
- Las tablas de Boletas usan nombres personalizados (`T_BoletaGarantia`, `T_Comprador`, etc.)
- Las tablas de Django siguen convención `app_modelo` (`api_ordencompra`, etc.)

---

## Decisiones de arquitectura relevantes

1. **ETL sin HTTP:** los scripts ETL acceden a Django ORM directamente vía `sys.path`. No hay API interna entre `api/` y `backend/`.
2. **Un solo proceso Django** en desarrollo (runserver). No hay workers Gunicorn/uWSGI configurados aún.
3. **Cache volátil:** `LocMemCache` se pierde al reiniciar. No usar para datos críticos.
4. **CORS abierto:** `CORS_ALLOW_ALL_ORIGINS = True`. Aceptable en red local, revisar en producción.
5. **Credenciales hardcoded:** `settings.py` tiene `SECRET_KEY`, contraseña de DB y ticket de API sin variables de entorno.
6. **Auditoría parcial:** solo `BoletaGarantia` tiene log de cambios. El resto de modelos no tiene historial.
7. **Datos complementarios en archivos:** FSC, PAC, facturas viven como Excel/CSV en `api/data/`, no en MariaDB.
8. **SPA en subruta:** el frontend se sirve en `/bd_sistema/`. Requiere servidor web (Nginx/Apache) con proxy reverso a Django en :8000.

---

## Convenciones de código

### Backend (Python/Django)
- Serializers en `backend/api/serializers.py`
- Lógica de negocio compleja en `backend/api/services.py`, no en views
- Nuevos endpoints: preferir `ViewSet` + `Router` sobre `APIView` sueltas
- Nuevos modelos: agregar a `backend/api/models.py` (o `ordenes_compra/models.py` si aplica) + migración

### Frontend (React)
- Nuevas features van en `src/features/<dominio>/` con subcarpetas `api/`, `components/`, `hooks/`, `routes/`
- Llamadas HTTP siempre a través de la instancia Axios de `src/lib/axios.js` (tiene interceptores JWT)
- Estado global de auth solo via `useAuth()` hook de `src/store/authStore.jsx`
- Roles se validan en `App.jsx` mediante el guard de rutas

### Scripts ETL
- Mantener menú CLI numérico (patrón existente)
- Resiliencia: backoff + reintentos para llamadas a Mercado Público
- Siempre hacer `django.setup()` antes de importar modelos

---

## Comandos de desarrollo

```bash
# Backend
cd backend
python manage.py runserver 0.0.0.0:8000

# Frontend
cd frontend
npm run dev          # dev server :5173
npm run build        # genera dist/

# ETL Licitaciones
cd api
python LI_SSO_SERVER.py

# ETL Órdenes de Compra
cd api
python OC_SSO_SERVER.py

# DB migrations
cd backend
python manage.py makemigrations
python manage.py migrate
```

---

## Lo que NO está implementado aún

- `ordenes_compra/` app tiene modelos pero sin URLs/views expuestos
- No hay proceso de despliegue automatizado (Nginx config, systemd, etc.)
- No hay variables de entorno (`.env`) en el backend — credenciales hardcoded
- No hay tests automatizados (unitarios ni de integración)
- Cache distribuida (Redis) no configurada
