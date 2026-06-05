# CLAUDE.md — Frontend (React + Vite SPA)

Subagente de frontend. Lee esto antes de tocar cualquier archivo en `frontend/`.

---

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| React | 18.3.1 | Framework UI |
| react-router-dom | 7.13.1 | Enrutamiento con roles |
| Axios | 1.13.6 | Cliente HTTP (instancia centralizada en `src/lib/axios.js`) |
| Chart.js + react-chartjs-2 | 4.5.1 / 5.3.1 | Gráficos |
| xlsx | 0.18.5 | Exportación Excel |
| Vite | 5.4.10 | Build tool |

**Base URL:** `VITE_API_URL=http://10.8.153.227:8000/api/` (`.env`)
**Desplegado en:** `/bd_sistema/` → `vite.config.js: base: '/bd_sistema/'`
**BrowserRouter:** `basename="/bd_sistema"`

---

## Estructura de `src/`

```
src/
├── main.jsx                  # Entry point — registra Chart.js globalmente
├── App.jsx                   # Router principal con guards RequireAuth / RequireRole
├── store/
│   └── authStore.jsx         # Context API + useReducer — ÚNICA fuente de auth
├── lib/
│   └── axios.js              # Instancia Axios — ÚNICO cliente HTTP. Interceptores JWT.
├── components/               # Componentes compartidos entre features
│   ├── Sidebar.jsx           # Sidebar principal — usar ESTE
│   ├── Topbar.jsx
│   └── ui/
│       ├── AppLayout.jsx     # Layout con Sidebar — envuelve todas las rutas protegidas
│       ├── Button.jsx
│       ├── DataTable.jsx
│       └── Sidebar.jsx       # DUPLICADO LEGACY — NO usar
├── pages/                    # Páginas legacy (aún no migradas a features/)
│   ├── Dashboard.jsx         # /licitaciones
│   ├── AnexoDeudaPage.jsx    # /anexo3
│   ├── Home.jsx              # /
│   └── OrdenesCompraDashboard.jsx  # /ordenes-compra — pendiente migrar a features/
└── features/                 # Módulos por dominio — PATRÓN PREFERIDO
    ├── auth/                 # Login
    ├── compra-agil/          # /compra-agil — ML análisis incluido
    ├── pac/                  # /pac — PAC, Res.188, indicadores
    ├── abastecimiento/       # /abastecimiento/* — FSC, boletas
    └── finanzas/             # /finanzas/* — devengo, dashboard finanzas
```

---

## Sistema de autenticación

### Flujo completo
1. `LoginPage` → `POST /api/auth/login/` → recibe `{ access, refresh }`
2. `saveSession()` guarda ambos tokens en `localStorage`
3. `authStore.jsx` decodifica el JWT y expone `user`, `role`, `isAuthenticated`
4. Cada request HTTP → interceptor inyecta `Authorization: Bearer <token>`
5. Si respuesta es 401 → interceptor intenta refresh automático
6. Si refresh falla → `clearSession()` + redirect a `/bd_sistema/login`

### Hooks de auth
```js
// Siempre via hook — nunca acceder al context directamente
const { user, role, isAuthenticated, login, logout } = useAuth();
```

### Roles disponibles
`admin` | `abastecimiento` | `finanzas` | `viewer`

Rol se extrae del JWT payload: `user.role` o `user.groups?.[0]` o `'viewer'` por defecto.

---

## Rutas y roles — Completo

| Ruta | Componente | Roles |
|---|---|---|
| `/login` | `features/auth/pages/LoginPage` | Público |
| `/` | `pages/Home` | Autenticado |
| `/licitaciones` | `pages/Dashboard` | Autenticado |
| `/anexo3` | `pages/AnexoDeudaPage` | Autenticado |
| `/ordenes-compra` | `pages/OrdenesCompraDashboard` | Autenticado |
| `/compra-agil` | `features/compra-agil/components/CompraAgilPage` | Autenticado |
| `/pac` | `features/pac/components/PacDashboardPage` | Autenticado |
| `/abastecimiento/dashboard` | `features/abastecimiento/components/AbastecimientoDashboard` | admin, abastecimiento, viewer |
| `/abastecimiento/fsc` | `features/abastecimiento/components/FSCManager` | admin, abastecimiento, viewer |
| `/abastecimiento/boletas` | `features/abastecimiento/components/BoletasPage` | admin, abastecimiento, viewer |
| `/finanzas/dashboard` | `features/finanzas/components/FinanzasDashboard` | admin, finanzas |

---

## Regla de layout (CRÍTICA)

**Todas las páginas renderizan dentro de `AppLayout`** (`components/ui/AppLayout.jsx`), que ya provee `<Topbar>`, `<Sidebar>`, `<main class="main">` (margin-left: 68px, margin-top: 40px), y `<div class="content">` (padding: 24px 28px 48px).

**Las páginas NO deben incluir su propio `<Sidebar>`, `<Topbar>`, `<main>`, ni `<div class="content">`** — hacerlo apila márgenes y genera ~192px de espacio izquierdo sobrante.

```jsx
// ✅ Correcto — renderiza dentro de AppLayout
export default function MiPage() {
    return (
        <div className="feature-page">
            <div className="page-header">
                <div className="page-title"><span className="page-title-icon">📄</span> Título</div>
                <div className="page-subtitle">Subtítulo</div>
            </div>
            {/* contenido */}
        </div>
    );
}

// ❌ Incorrecto — doble wrapper
export default function MiPage() {
    return (
        <div style={{ display: 'flex' }}>
            <Sidebar /><main className="main"><Topbar /><div className="content">...</div></main>
        </div>
    );
}
```

`feature-page` es un wrapper semántico sin padding — el padding real lo provee el `.content` de AppLayout.

---

## Patrón para nueva feature

Toda feature nueva sigue esta estructura:

```
src/features/<nombre>/
├── api/
│   └── <nombre>Api.js       # Solo llamadas HTTP con apiClient
├── components/
│   └── <Nombre>Page.jsx     # Componente principal de página
├── hooks/
│   └── use<Nombre>.js       # Lógica de estado y efectos
└── routes/
    └── index.jsx            # Exporta JSX de rutas para App.jsx
```

### Ejemplo: capa API
```js
// features/mifeature/api/mifeatureApi.js
import apiClient from '../../../lib/axios';

export const getMiDato = (params = {}) =>
    apiClient.get('mi-endpoint/', { params });

export const createMiDato = (data) =>
    apiClient.post('mi-endpoint/', data);
```

### Ejemplo: hook de datos
```js
// features/mifeature/hooks/useMiDato.js
import { useState, useEffect, useCallback } from 'react';
import { getMiDato } from '../api/mifeatureApi';

export function useMiDato(filtros = {}) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: res } = await getMiDato(filtros);
            setData(res.results ?? res);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar.');
        } finally {
            setLoading(false);
        }
    }, [JSON.stringify(filtros)]);

    useEffect(() => { fetch(); }, [fetch]);
    return { data, loading, error, refresh: fetch };
}
```

### Registrar rutas en App.jsx
```jsx
// features/mifeature/routes/index.jsx
import React from 'react';
import { Route } from 'react-router-dom';
import MiPage from '../components/MiPage';

export const miFeatureRoutes = (
    <Route path="/mi-ruta" element={<MiPage />} />
);

// App.jsx → dentro de <RequireRole allowed={[...]}>
import { miFeatureRoutes } from './features/mifeature/routes';
{miFeatureRoutes}
```

---

## Reglas de desarrollo

### Axios — siempre usar la instancia centralizada
```js
import apiClient from '../../../lib/axios';  // ajustar path relativo
// NUNCA: import axios from 'axios'  (excepto en lib/axios.js)
```

### Trailing slash — DRF lo requiere
```js
apiClient.get('boletas-garantia/')    // ✓
apiClient.get('boletas-garantia')     // funciona pero menos explícito
```

### Formato de moneda chilena (CLP)
```js
const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
```

### Paginación — respuesta DRF
```js
const items = res.data.results ?? res.data;
const total = res.data.count ?? items.length;
```

### CSS — clases disponibles (no usar style inline)
```
feature-page      → wrapper de página sin padding extra
page-header       → encabezado de página
page-title        → título con icono
page-subtitle     → subtítulo descriptivo
card              → tarjeta con sombra
kpi-grid          → grid de KPIs
kpi-card          → tarjeta individual de KPI
loading-spinner   → indicador de carga
badge             → etiqueta de estado
tab-btn           → botón de tab
tab-btn.active    → tab activo
error-message     → mensaje de error
```
Si necesitas una clase nueva → agregarla en `frontend/src/index.css`.

---

## Componentes reutilizables disponibles

| Componente | Path | Uso |
|---|---|---|
| `KpiCard` | `features/abastecimiento/components/KpiCard.jsx` | Tarjeta KPI con título, valor, icono, color |
| `DataTable` | `components/ui/DataTable.jsx` | Tabla paginada genérica |
| `AppLayout` | `components/ui/AppLayout.jsx` | Layout con Sidebar — lo usan todas las rutas protegidas |
| `Sidebar` | `components/Sidebar.jsx` | **Usar este** — el de `ui/Sidebar.jsx` es legacy |

---

## Estado de los módulos

| Módulo | Ruta | Estado | Notas |
|---|---|---|---|
| Licitaciones | `/licitaciones` | ✅ Completo | Dashboard + filtros + gráficos + **botón ETL + panel de cambios** |
| Órdenes de Compra | `/ordenes-compra` | ✅ Funcional | Pendiente migrar a `features/` + **botón ETL + panel de cambios** |
| Anexo N°3 | `/anexo3` | ✅ Funcional | |
| Compra Ágil | `/compra-agil` | ✅ Completo | Tablas + análisis ML + **botón ETL** |
| PAC | `/pac` | ✅ Completo | Res.188 indicadores + stats OC |
| Boletas de Garantía | `/abastecimiento/boletas` | ✅ Completo | CRUD + auditoría + archivo adjunto |
| FSC Manager | `/abastecimiento/fsc` | ✅ Funcional | |
| Dashboard Finanzas | `/finanzas/dashboard` | ⚠️ En desarrollo | Hook mapeado a API real, construcción activa |
| Gestión Inventario | — | 🔲 Próximo | Solo placeholder en Sidebar |
| Gestión Usuarios | — | 🔲 Próximo | Solo placeholder en Sidebar |

---

## Patrón ETL — Botón "Actualizar API"

Los 3 módulos principales (Licitaciones, OC, Compra Ágil) tienen un botón "🔄 Actualizar API" que dispara el ETL desde el dashboard. El patrón es idéntico en los tres:

### Archivos involucrados por módulo

| Módulo | API layer | Hook | Componente |
|---|---|---|---|
| Licitaciones | `features/licitaciones/api/licitacionesEtlApi.js` | `features/licitaciones/hooks/useActualizarLicitaciones.js` | `pages/Dashboard.jsx` |
| OC | `features/ordenes-compra/api/ocApi.js` | `features/ordenes-compra/hooks/useActualizarOC.js` | `pages/OrdenesCompraDashboard.jsx` |
| Compra Ágil | `features/compra-agil/api/compraAgilApi.js` | `features/compra-agil/hooks/useActualizarCompraAgil.js` | `features/compra-agil/components/CompraAgilPage.jsx` |

### Hook genérico `useActualizarXXX`

```js
const { tarea, iniciando, iniciar, cerrar } = useActualizarXXX(onCompletado);
// tarea: null | { status, paso, paso_desc, progreso_pct, logs_recientes, diff, ... }
// iniciar(fechaDesde, fechaHasta) → POST → polling cada 3s
// cerrar() → detiene polling + limpia tarea
// onCompletado() → callback al llegar a status='completado' (usado para abrir panel)
```

### Flujo UX

```
[🔄 Actualizar API]  → Modal (fechas + descripción pasos)
                     → Banner flotante (progreso en tiempo real)
                     → Al completar: abre panel lateral automáticamente
                     → Panel: 3 tabs (Nuevas / Cambiaron / Adjudicadas/OC-cambiadas)
                     → [Cerrar y actualizar dashboard] → refreshKey++ → re-fetch datos
```

### Componentes en cada página

- `BannerXX` — fijo bottom-right, spinner + barras de progreso + log terminal oscuro
- `PanelCambiosXX` — drawer 660-680px desde la derecha, tabla filtrable
- `ModalFechasXX` — modal centrado con date pickers (default: últimos 7 días)
- `EstadoBadge` / `LIEstadoBadge` — chips de color por estado

### Colores por módulo

| Módulo | Color primario |
|---|---|
| Licitaciones | `#1d4ed8` (azul) |
| OC | `#15803d` (verde oscuro) |
| Compra Ágil | `#0ea5e9` (celeste) |

---

## Pendientes conocidos

| # | Problema | Archivo | Prioridad |
|---|---|---|---|
| 1 | `OrdenesCompraDashboard` importa Sidebar/Topbar directamente — no usa AppLayout | `pages/OrdenesCompraDashboard.jsx` | Media |
| 2 | `KpiCard` duplicado inline | `components/OrdenesCompraResumen.jsx:57` | Baja |
| 3 | `withIva` hardcodea 19% — el modelo tiene `PorcentajeIva` | `components/OrdenesCompraResumen.jsx:31` | Baja |
| 4 | `components/ui/Sidebar.jsx` es legacy — no referenciar | `components/ui/Sidebar.jsx` | Baja |
| 5 | Dashboard Finanzas aún en construcción | `features/finanzas/` | Media |
