# Licitaciones y OC
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/pages/Dashboard.jsx, OrdenesCompraDashboard.jsx, features/ordenes-compra/
- **Tecnología:** React 18 + Chart.js

## Qué hace
Dos dashboards hermanos: **Licitaciones** (`/licitaciones`) y **Órdenes de Compra** (`/ordenes-compra`, con una versión nueva en `/ordenes-compra-v2`). Muestran filtros, KPIs y gráficos sobre lo publicado en Mercado Público, y tienen el botón "🔄 Actualizar API" que dispara el ETL correspondiente desde el propio dashboard.

## Entradas / Salidas
- **Entrada:** filtros de usuario (estado, unidad, tipo, año).
- **Salida:** peticiones REST a `backend-api`; al pulsar "Actualizar" dispara un ETL asíncrono con panel de cambios (nuevas/cambiadas/adjudicadas).

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (rutas `/licitaciones`, `/ordenes-compra`)

## Riesgos / notas
`OrdenesCompraDashboard.jsx` todavía importa Sidebar/Topbar directamente en vez de depender de `AppLayout` — pendiente de migración (ver `frontend/CLAUDE.md`, pendiente #1).
