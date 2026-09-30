# Abastecimiento
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/abastecimiento/, features/compras/
- **Tecnología:** React 18

## Qué hace
La suite operativa del área de Abastecimiento: dashboard general, **Formularios FSC** (solicitudes de compra sincronizadas desde el Panel SSO), **Boletas de Garantía** (CRUD + auditoría), **Gestión de Contratos SSO** (evaluaciones, financiero, plazos, cruce PAC) y la bandeja de **Gestión de Compras** por comprador logueado.

## Entradas / Salidas
- **Entrada:** credenciales del Panel SSO (rut/dv/clave) al pulsar "Actualizar" en Formularios; filtros por unidad/estado/año en cada tab.
- **Salida:** REST a `backend-api`; dispara los ETL de Formularios FSC y Contratos.

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (rutas `/abastecimiento/*`, `/compras/mis-formularios`)

## Riesgos / notas
Es el módulo más grande del sistema — agrupa varias features históricamente separadas. `Gestión de Compras` (bandeja del comprador) está en desarrollo activo, con cambios recientes sin commitear a la fecha de este mapa.
