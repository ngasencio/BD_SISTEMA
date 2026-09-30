# ETL Carga PAC
- **Cluster:** ETL Presupuesto (SIGFE/DIPRES/PAC)
- **Tipo:** script
- **Ubicación:** api/data/data_planificacionPac/cargar_pac_servidor.py, api/data/data_pac/consolidar_pac.py
- **Tecnología:** Python 3 + pandas + Django ORM

## Qué hace
A diferencia de los demás ETL de este cluster, no hace scraping: carga el plan PAC vigente (`PlanerPAC`) desde los Excel `PlanificacionPACxxxx.xlsx` y recarga el maestro histórico multi-año `PacProyectoMaestro` desde `OCPAC_Maestro.csv` (comando `python manage.py cargar_pac_maestro`, disparado también desde el botón "Actualizar Maestro" de `/pac-cumplimiento`).

## Entradas / Salidas
- **Entrada:** archivos Excel/CSV locales, actualizados a mano.
- **Salida:** upsert en `PlanerPAC` (por `id_proyecto+nombre_item+pac+fecha_inicio_compra`) y reemplazo completo de `PacProyectoMaestro`.

## Depende de →
- `mariadb`, `archivos-maestros`

## Lo usan ←
- `backend-api` (endpoint síncrono `pac-cumplimiento/actualizar-maestro/`)

## Riesgos / notas
`PlanerPAC` se acumula año sobre año y nunca se borra — un mismo ítem puede repetirse en tramos con distinta fecha. `PacProyectoMaestro` no trae fechas ni montos, solo sirve para verificar si un `id_plan` es un proyecto PAC real.
