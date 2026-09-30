# Lógica de Negocio
- **Cluster:** Backend API (Django REST)
- **Tipo:** módulo
- **Ubicación:** backend/api/services.py, services_reportes*.py, plantillas_narrativas.py
- **Tecnología:** Python 3 + pandas

## Qué hace
Concentra todo el cálculo de negocio: KPIs, agregaciones, el matching automático FSC-OC-PAC (`recalcular_fsc_oc_matching`) y la generación de informes Word/PPT/PDF de PAC Cumplimiento (con texto narrativo condicional, sin IA).

## Entradas / Salidas
- **Entrada:** llamadas desde `backend-api`; también se dispara automáticamente al terminar el ETL de OC o de Formularios FSC.
- **Salida:** dicts/DataFrames que `backend-api` serializa, o archivos Word/PPT/PDF descargables.

## Depende de →
- `mariadb`

## Lo usan ←
- `backend-api`, `etl-oc` (dispara matching al terminar), `etl-fsc-panel` (dispara matching al terminar)

## Riesgos / notas
`recalcular_fsc_oc_matching()` es idempotente y **nunca pisa una decisión humana** (CONFIRMADO/RECHAZADO/MANUAL) — solo toca filas en estado SUGERIDO. Al formatear números en los reportes, usar los helpers `_n()`/`_money()`, nunca `str.replace(',', '.')` sobre un párrafo completo (corrompe la prosa).
