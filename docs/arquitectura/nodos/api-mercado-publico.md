# API Mercado Público
- **Cluster:** Portales y APIs Externas
- **Tipo:** api-externa
- **Ubicación:** api.mercadopublico.cl (URL no publicada en este mapa)
- **Tecnología:** REST HTTPS

## Qué hace
API pública chilena de compras del Estado. Es la fuente original de todos los datos de Licitaciones, Órdenes de Compra y Compra Ágil que el sistema descarga periódicamente.

## Entradas / Salidas
- **Entrada:** peticiones REST con rango de fechas desde los ETL.
- **Salida:** JSON con licitaciones/OC/compra ágil publicadas por el organismo.

## Depende de →
- (ninguno — es un servicio externo)

## Lo usan ←
- `etl-licitaciones`, `etl-oc`, `etl-compra-agil`

## Riesgos / notas
Los clientes Python de este proyecto llaman a la API con la verificación SSL deshabilitada — deuda técnica pendiente de corregir antes de producción.
