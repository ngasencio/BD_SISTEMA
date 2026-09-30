# Maestros CSV/Excel
- **Cluster:** Almacenamiento de Datos
- **Tipo:** archivo
- **Ubicación:** api/*/MAESTROS/, api/data/data_pac/, api/data/data_gestioncontratos/
- **Tecnología:** CSV / XLSX

## Qué hace
Son los archivos que **no** viven en MariaDB pero que el sistema necesita para funcionar: snapshots CSV que cada ETL de Mercado Público guarda como respaldo, el maestro `OCPAC_Maestro.csv` que enlaza OC con su proyecto PAC real, los planes PAC en Excel (`PAC22.xlsx`...`PAC26.xlsx`) y el Excel de contratos descargado del Panel SSO.

## Entradas / Salidas
- **Entrada:** escritos por los ETL de Mercado Público y por el ETL de Contratos; el maestro PAC se actualiza manualmente.
- **Salida:** leídos por `etl-oc` (enlace PAC) y `etl-pac-loader` (carga a MariaDB).

## Depende de →
- (ninguno)

## Lo usan ←
- `etl-oc`, `etl-pac-loader`, `etl-contratos`, `etl-licitaciones`, `etl-compra-agil`

## Riesgos / notas
`OCPAC_Maestro.csv` es de actualización manual (`python manage.py cargar_pac_maestro`) — un desfase aquí afecta directamente el estado PAC mostrado en `mod-fsc-oc-pac`. Nunca escribir una corrección de PAC directo en la base: se pisa en el próximo sync (usar `OcPacOverride`).
