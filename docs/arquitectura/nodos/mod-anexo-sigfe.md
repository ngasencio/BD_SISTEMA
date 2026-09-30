# Reportería SIGFE
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/devengo-sigfe/, features/anexo1-sigfe/
- **Tecnología:** React 18

## Qué hace
Dos reportes presupuestarios alimentados por el mismo origen (portal SIGFE): **Anexo N°3 — Control de Deuda** (`/anexo3/reporte-sigfe`, reporte HTML jerárquico con Chart.js embebido vía Blob) y **Anexo N°1 — Ejecución Presupuestaria** (`/anexo1/base-datos`, 11 pestañas + PDF real generado con reportlab).

## Entradas / Salidas
- **Entrada:** credenciales SIGFE (usuario/clave) + rango de fechas al pulsar "Actualizar desde SIGFE".
- **Salida:** REST a `backend-api`; dispara los ETL de Devengo y Anexo N°1.

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (rutas `/anexo3/reporte-sigfe`, `/anexo1/base-datos`)

## Riesgos / notas
El reporte de Anexo N°3 se debe cargar vía `fetch` autenticado + `iframe.srcDoc`/Blob — nunca con `<iframe src=...>` directo, porque el endpoint requiere JWT.
