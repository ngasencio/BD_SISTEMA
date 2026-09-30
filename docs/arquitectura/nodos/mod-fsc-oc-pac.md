# Enlace FSC-OC-PAC
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/fsc-oc-pac/
- **Tecnología:** React 18 + diseño DV-UI

## Qué hace
Cruza los Formularios FSC (Dentro-PAC) con las Órdenes de Compra que generaron y con el PAC real de esa compra. Tiene 7 pestañas: Resumen, Jerarquía, Revisión Pendientes, Corregidas, Impacto, Detalle y Compra Ágil. Permite confirmar/rechazar candidatas de enlace y corregir manualmente el PAC de una OC.

## Entradas / Salidas
- **Entrada:** decisiones humanas de revisión (confirmar, rechazar, enlazar manual, corregir PAC).
- **Salida:** REST a `backend-api` (`/fsc-oc-pac/*`).

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (ruta `/fsc-oc-pac`)

## Riesgos / notas
Único módulo del sistema con el sistema de diseño **DV-UI** propio (`features/fsc-oc-pac/styles/dv-ui.css`) — antes de extenderlo a otro módulo, revisar `frontend/CLAUDE.md` (sección "Sistema de diseño DV-UI").
