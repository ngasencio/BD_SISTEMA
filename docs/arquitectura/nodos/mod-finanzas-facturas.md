# Finanzas y Facturas
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/finanzas/, features/facturas/
- **Tecnología:** React 18

## Qué hace
Dashboard financiero general (`/finanzas/dashboard`, en desarrollo) y el módulo de **Facturas** DIPRES/Acepta (`/facturas`), con su propio botón de actualización.

## Entradas / Salidas
- **Entrada:** filtros por año/proveedor.
- **Salida:** REST a `backend-api` (`/facturas/raw_all/`, etc.); dispara el ETL de Facturas DIPRES.

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (rutas `/finanzas/dashboard`, `/facturas`)

## Riesgos / notas
El dashboard de Finanzas sigue en construcción activa — no dar por completos todos sus indicadores.
