# ETL Compra Ágil
- **Cluster:** ETL Mercado Público
- **Tipo:** script
- **Ubicación:** api/AG_SSO_SERVER.py, api/AG_SSO_SERVER2.py
- **Tecnología:** Python 3 + requests

## Qué hace
Descarga las compras por Convenio Marco / Compra Ágil desde Mercado Público: resumen, documentos, productos, productos cotizados y proveedores.

## Entradas / Salidas
- **Entrada:** rango de fechas.
- **Salida:** filas en `api_compraagil_resumen` y tablas relacionadas; snapshot CSV en `api/CA_DSSO/MAESTROS/`.

## Depende de →
- `api-mercado-publico`, `mariadb`, `archivos-maestros`

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
El campo `proveedorseleccionado` llega con valores inconsistentes (`"1"`, `"Si"`, `"si"`, `"True"`, `"true"`) — cualquier consumidor debe normalizarlo, no asumir booleano.
