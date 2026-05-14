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
│   ├── Sidebar.jsx           # Sidebar principal (usar este, no el de ui/)
│   ├── Topbar.jsx
│   └── ui/
│       ├── AppLayout.jsx     # Layout con Sidebar — envuelve rutas protegidas
│       ├── Button.jsx
│       ├── DataTable.jsx
│       └── Sidebar.jsx       # DUPLICADO LEGACY — no usar, usar components/Sidebar.jsx
├── pages/                    # Páginas que aún no fueron migradas a features/
│   ├── Dashboard.jsx         # /licitaciones
│   ├── AnexoDeudaPage.jsx    # /anexo3
│   ├── Home.jsx              # /
│   └── OrdenesCompraDashboard.jsx  # /ordenes-compra — pendiente migrar a features/
└── features/                 # Módulos por dominio — PATRÓN PREFERIDO
    ├── auth/
    ├── abastecimiento/
    └── finanzas/
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

### Ejemplo: nuevo endpoint en la capa API
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

export function useMiDato() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: res } = await getMiDato();
            setData(res.results ?? res);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar.');
        } finally {
            setLoading(false);
        }
    }, []);

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
El interceptor de axios agrega `/` automáticamente si la URL no termina en `/` y no tiene `?`.
Igualmente, siempre escribir URLs con `/` al final para claridad:
```js
apiClient.get('boletas-garantia/')    // ✓
apiClient.get('boletas-garantia')     // funciona pero menos explícito
```

### Formato de moneda chilena
```js
const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
```

### Paginación — respuesta DRF
```js
// DRF devuelve { count: N, results: [...] }
const data = res.data;
const items = data.results ?? data;
const total = data.count ?? items.length;
```

### CSS — no usar estilos inline
Usar clases CSS existentes. Si se necesita uno nuevo, agregar a `index.css`.
Clases de utilidad disponibles: `feature-page`, `page-header`, `page-title`, `page-subtitle`,
`card`, `kpi-grid`, `loading-spinner`, `badge`, `tab-btn`, `tab-btn.active`

---

## Rutas y roles

| Ruta | Componente | Roles |
|---|---|---|
| `/login` | LoginPage | Público |
| `/` | Home | Autenticado |
| `/licitaciones` | Dashboard | Autenticado |
| `/anexo3` | AnexoDeudaPage | Autenticado |
| `/ordenes-compra` | OrdenesCompraDashboard | Autenticado |
| `/abastecimiento/dashboard` | AbastecimientoDashboard | admin, abastecimiento, viewer |
| `/abastecimiento/fsc` | FSCManager | admin, abastecimiento, viewer |
| `/abastecimiento/boletas` | BoletasPage | admin, abastecimiento, viewer |
| `/finanzas/dashboard` | FinanzasDashboard | admin, finanzas |

---

## Componentes reutilizables disponibles

| Componente | Path | Uso |
|---|---|---|
| `KpiCard` | `features/abastecimiento/components/KpiCard.jsx` | Tarjeta de KPI con título, valor, icono, color |
| `DataTable` | `components/ui/DataTable.jsx` | Tabla paginada genérica |
| `AppLayout` | `components/ui/AppLayout.jsx` | Layout con Sidebar — lo usan todas las rutas protegidas |
| `Sidebar` | `components/Sidebar.jsx` | **Usar este** — el de `ui/Sidebar.jsx` es legacy |

---

## Estado de los módulos

| Módulo | Estado | Notas |
|---|---|---|
| Licitaciones | ✅ Completo | Dashboard + filtros + gráficos |
| Órdenes de Compra | ✅ Funcional | Pendiente migrar a `features/` |
| Anexo N°3 | ✅ Funcional | |
| Boletas de Garantía | ✅ Completo | CRUD + auditoría |
| FSC Manager | ✅ Funcional | |
| Dashboard Finanzas | ⚠️ En desarrollo | Hook mapeado a API real, aún en construcción |
| Gestión Inventario | 🔲 Próximo | Solo placeholder en Sidebar |
| Gestión Usuarios | 🔲 Próximo | Solo placeholder en Sidebar |
| Módulo OC expandido | 🔲 En desarrollo | Se adaptará desde análisis HTML externo |

---

## Pendientes conocidos

| # | Problema | Archivo | Prioridad |
|---|---|---|---|
| 1 | `OrdenesCompraDashboard` importa Sidebar/Topbar directamente — no usa AppLayout | `pages/OrdenesCompraDashboard.jsx` | Media |
| 2 | `KpiCard` duplicado inline en `OrdenesCompraResumen.jsx` | `components/OrdenesCompraResumen.jsx:57` | Baja |
| 3 | `withIva` hardcodea 19% — el modelo tiene `PorcentajeIva` | `components/OrdenesCompraResumen.jsx:31` | Baja |
| 4 | `components/ui/Sidebar.jsx` es legacy — no referenciar | `components/ui/Sidebar.jsx` | Baja |
