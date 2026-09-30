# PAC y Cumplimiento
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/pac/, features/pac-cumplimiento/
- **Tecnología:** React 18

## Qué hace
Dos módulos del Plan Anual de Compras: **PAC** (`/pac`, indicadores de ahorro Res.188 e informe PDF) y **Cumplimiento Interno PAC** (`/pac-cumplimiento`, separado a propósito): % Dentro/Fuera de PAC, cumplimiento temporal, jerarquía Subdirección→Departamento, rankings y reportería Word/PPT/PDF.

## Entradas / Salidas
- **Entrada:** filtros por año, subdirección, departamento o período (mes/trimestre).
- **Salida:** REST a `backend-api`; descarga de informes generados en el servidor.

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (rutas `/pac`, `/pac-cumplimiento`)

## Riesgos / notas
`/pac-cumplimiento` está acotado al Establecimiento 197 — no es un PAC global del servicio completo.
