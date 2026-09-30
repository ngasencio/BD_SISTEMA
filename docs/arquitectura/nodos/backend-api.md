# API REST
- **Cluster:** Backend API (Django REST)
- **Tipo:** servicio
- **Ubicación:** backend/api/views.py, serializers.py, urls.py
- **Tecnología:** Django 4.2 + Django REST Framework 3.16

## Qué hace
Es la puerta de entrada única entre el frontend y el resto del sistema. Expone todos los endpoints bajo `/api/`, valida el token JWT en cada petición y delega el cálculo real en `backend-services`/`backend-ml`. También contiene el orquestador de tareas ETL (`backend-etl-runner`).

## Entradas / Salidas
- **Entrada:** peticiones HTTP con `Authorization: Bearer <token>` desde cualquier módulo del frontend.
- **Salida:** JSON serializado; en los endpoints `*/actualizar/` devuelve un `task_id` para hacer polling.

## Depende de →
- `backend-services`, `backend-ml`, `backend-auth`, `mariadb`, `backend-etl-runner`, `etl-pac-loader`

## Lo usan ←
- Todos los módulos del frontend (`app-shell`, `home`, `mod-mercado-publico`, `mod-compra-agil`, `mod-pac`, `mod-abastecimiento`, `mod-fsc-oc-pac`, `mod-anexo-sigfe`, `mod-finanzas-facturas`, `mod-usuarios`)

## Riesgos / notas
La regla del proyecto es tajante: la lógica de agregación/cálculo **nunca** va en `views.py` ni en los serializers, siempre en `services.py`. `CORS_ALLOW_ALL_ORIGINS=True` y `SECRET_KEY`/credenciales con fallback hardcoded en `settings.py` son deuda técnica pendiente antes de producción.
