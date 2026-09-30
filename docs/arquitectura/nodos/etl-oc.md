# ETL Órdenes Compra
- **Cluster:** ETL Mercado Público
- **Tipo:** script
- **Ubicación:** api/OC_SSO_SERVER.py, api/OC_TOTAL_DSSO_SERVER.py
- **Tecnología:** Python 3 + requests

## Qué hace
Descarga Órdenes de Compra desde Mercado Público, recalcula desde cero el enlace con PAC (`enlazar_con_pac()` contra `OCPAC_Maestro.csv`) y, al terminar, dispara automáticamente el matching FSC-OC-PAC. `OC_TOTAL_DSSO_SERVER.py` es la variante de carga histórica completa.

## Entradas / Salidas
- **Entrada:** rango de fechas.
- **Salida:** filas en `api_ordencompra`/`api_detalleordencompra`; recalcula `EnlacePAC`/`ID_Proyecto`/`Nombre_Proyecto`.

## Depende de →
- `api-mercado-publico`, `mariadb`, `archivos-maestros`, `backend-services` (dispara matching)

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
`EnlacePAC`/`ID_Proyecto`/`Nombre_Proyecto` se recalculan **desde cero** en cada sync — cualquier corrección manual escrita directo en esas columnas se pierde. Usar `OcPacOverride` para correcciones que deban sobrevivir al sync.
