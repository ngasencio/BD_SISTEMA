# ETL Licitaciones
- **Cluster:** ETL Mercado Público
- **Tipo:** script
- **Ubicación:** api/LI_SSO_SERVER.py
- **Tecnología:** Python 3 + requests

## Qué hace
Descarga licitaciones publicadas en Mercado Público para un rango de fechas y las carga en MariaDB. Corre manualmente (`python LI_SSO_SERVER.py`) o disparado por el botón "Actualizar" del dashboard de Licitaciones.

## Entradas / Salidas
- **Entrada:** rango de fechas (`fecha_desde`, `fecha_hasta`).
- **Salida:** filas nuevas/actualizadas en `api_licitacion`/`api_detallelicitacion`; snapshot CSV en `api/LI_DSSO/MAESTROS/`.

## Depende de →
- `api-mercado-publico`, `mariadb`, `archivos-maestros`

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
Usa `DELETE`+`bulk_create` sin `transaction.atomic()` — deuda técnica conocida. La verificación SSL está deshabilitada en las llamadas a la API.
