# ETL Anexo N°1
- **Cluster:** ETL Presupuesto (SIGFE/DIPRES/PAC)
- **Tipo:** script
- **Ubicación:** api/data/data_anexo1/Sigfe_Descargas_Estado_ejecucion_presupuestaria.py, consolidar_anexo1_sigfe.py
- **Tecnología:** Python 3 + Selenium

## Qué hace
Mismo patrón que el ETL de Devengo (`_ejecutar_actualizacion_anexo1` sigue el mismo flujo que `_ejecutar_actualizacion_sigfe`), pero descarga el estado de ejecución presupuestaria por establecimiento para alimentar el Anexo N°1.

## Entradas / Salidas
- **Entrada:** usuario/clave SIGFE + rango de fechas.
- **Salida:** filas consolidadas en `Anexo1`/tablas relacionadas.

## Depende de →
- `sigfe-web`, `mariadb`

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
Tiene el modo `headless=False` (ventana de Chrome visible en el servidor) para diagnosticar en qué paso falla la automatización — solo útil si quien lo dispara tiene acceso físico/remoto a la pantalla del servidor.
