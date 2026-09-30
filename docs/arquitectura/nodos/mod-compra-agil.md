# Compra Ágil
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/compra-agil/
- **Tecnología:** React 18

## Qué hace
Dashboard de Compra Ágil: resumen de compras, ahorro por convenio marco, comparativas anuales, proveedores y un set de pestañas de análisis con Machine Learning (clustering de productos, asociaciones de compra).

## Entradas / Salidas
- **Entrada:** filtros (fecha, estado, unidad de compra).
- **Salida:** REST a `backend-api`, incluyendo endpoints de ML (`/compraagil/clusters/`, `/apriori-comprador/`, etc.).

## Depende de →
- `backend-api`

## Lo usan ←
- `app-shell` (ruta `/compra-agil`)

## Riesgos / notas
Los endpoints de ML tienen cache de 15 min — cambios recientes en la base pueden no reflejarse de inmediato en clusters/asociaciones.
