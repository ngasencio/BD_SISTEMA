# ETL Contratos
- **Cluster:** ETL Panel SSO / Selenium
- **Tipo:** script
- **Ubicación:** api/data/data_gestioncontratos/descargar_contratos_sso_selenium.py
- **Tecnología:** Python 3 + Selenium

## Qué hace
Descarga el Excel de Gestión de Contratos SSO desde el Panel SSO y lo carga en el modelo `GestionContrato`. A diferencia de Licitaciones/OC/Compra Ágil, no tiene modal de fechas: el botón "Actualizar" lanza el ETL directo.

## Entradas / Salidas
- **Entrada:** ninguna (sin rango de fechas parametrizable).
- **Salida:** filas en `data_gestioncontratos`.

## Depende de →
- `panel-sso-documental`, `mariadb`, `archivos-maestros`

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
El archivo descargado (`contratos_sso.xlsx`) es en realidad HTML disfrazado de `.xls` — se parsea con `pd.read_html()[2]` (la tabla de datos está en el índice 2). No tiene panel de cambios post-ETL todavía.
