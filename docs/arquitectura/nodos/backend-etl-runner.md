# Orquestador ETL
- **Cluster:** Backend API (Django REST)
- **Tipo:** servicio
- **Ubicación:** backend/api/views.py (funciones `_ejecutar_actualizacion_*`)
- **Tecnología:** Python `threading` (hilo daemon), sin cola externa

## Qué hace
Cuando alguien pulsa "Actualizar" en el frontend, esta pieza lanza el script ETL correspondiente en un hilo daemon, captura su progreso (via `progress_callback` o parseando el stdout) y expone un `task_id` para que el frontend haga polling del estado hasta que termine.

## Entradas / Salidas
- **Entrada:** POST a `*/actualizar/` (fechas, o credenciales cuando el origen requiere login).
- **Salida:** progreso en tiempo real + diff de cambios (nuevas/cambiadas) al finalizar.

## Depende de →
- `etl-licitaciones`, `etl-oc`, `etl-compra-agil`, `etl-contratos`, `etl-fsc-panel`, `etl-devengo-sigfe`, `etl-anexo1-sigfe`, `etl-facturas-dipres`

## Lo usan ←
- `backend-api`

## Riesgos / notas
No usa Celery ni Redis como cola — es un hilo daemon en el mismo proceso de Waitress. Solo puede correr una tarea por tipo a la vez (guard HTTP 409). El stdout se redirige a `io.StringIO` para evitar errores de codificación `cp1252` con emojis en Windows.
