# Gestión SSO Osorno — Mapa de Arquitectura

Sistema interno de gestión de abastecimiento para el **Servicio de Salud Osorno** (Organismo 7296, Chile). Centraliza y cruza información que hoy vive repartida entre la API de Mercado Público, portales institucionales sin API (Panel SSO, SIGFE, DIPRES) y planillas Excel, para dar visibilidad de licitaciones, órdenes de compra, cumplimiento del Plan Anual de Compras (PAC), contratos, garantías, deuda presupuestaria y facturas — todo en un solo dashboard con roles.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite, servido en `/gestion-sso/` |
| Backend | Django 4.2 + Django REST Framework 3.16, JWT |
| Base de datos | MariaDB |
| ETL | Scripts Python independientes (requests / Selenium / Playwright según el origen) |
| Servidor de producción | Waitress (WSGI puro Python, reemplaza a Gunicorn por ser Windows) |

## Cómo se ejecuta (desarrollo)

```bash
# Backend — desde backend/
python manage.py runserver 0.0.0.0:8000

# Frontend — desde frontend/
npm run dev        # Vite :5173

# ETL — desde api/ (manual o vía botón "Actualizar" del dashboard)
python LI_SSO_SERVER.py
python OC_SSO_SERVER.py
```

## Flujos principales

1. **Compra pública → dashboard**: `etl-licitaciones`/`etl-oc`/`etl-compra-agil` descargan de `api-mercado-publico` → `mariadb` → `backend-api` → dashboards del frontend.
2. **Solicitud de compra → enlace con PAC**: una persona crea un FSC en el Panel SSO → `etl-fsc-panel` lo sincroniza → si genera una OC, `backend-services` (matching FSC-OC-PAC) la enlaza automáticamente → se revisa en `mod-fsc-oc-pac`.
3. **Actualización manual desde el dashboard**: usuario pulsa "Actualizar" en cualquier módulo → `backend-api` lanza `backend-etl-runner` → el script ETL correspondiente corre en un hilo daemon con progreso en vivo → panel de cambios al terminar.
4. **Reportería presupuestaria**: `etl-devengo-sigfe`/`etl-anexo1-sigfe` descargan de `sigfe-web` → `mariadb` → reportes HTML/PDF en `mod-anexo-sigfe`.
5. **Explicar el sistema**: cualquier persona autenticada entra a `home` → botón "Ver Mapa" → `mapa-sistema` (este mismo mapa, en 3D).

## Cómo regenerar este mapa

El mapa vive enteramente en `graph.json` — nunca se edita `mapa-sistema.html` a mano.

```bash
cd docs/arquitectura
python build_graph.py
```

Esto valida `graph.json` (ids únicos, aristas válidas, sin secretos) y genera `mapa-sistema.html` a partir de `mapa-sistema.template.html`. Después, copiar el archivo generado a `frontend/public/mapa-sistema.html` para que quede disponible en la ruta `/mapa-sistema` de la SPA (ver `frontend/src/features/mapa-sistema/`).

### Para agregar un componente nuevo al sistema

1. Agregar el nodo en `graph.json` → `nodes` (elegir un `id` corto en kebab-case, asignarlo a un cluster existente o crear uno nuevo en `clusters`).
2. Agregar sus conexiones en `graph.json` → `edges`, citando siempre la evidencia (archivo:línea o el import/llamada que la prueba).
3. Crear `nodos/<id>.md` siguiendo la plantilla de los demás archivos de esa carpeta.
4. Sumar la fila correspondiente a `relaciones.md` (ver nota en `hallazgos.md` — no se genera sola todavía).
5. Correr `python build_graph.py` y verificar que no marque nodos huérfanos ni secretos.

Mantener el total entre 15 y 40 nodos — si un cluster crece demasiado, es señal de que conviene agruparlo en un nodo compuesto (como se hizo con `mod-abastecimiento` o `mod-anexo-sigfe`) y dejar el detalle real en su `.md`.

## Estructura de esta carpeta

```
docs/arquitectura/
├── 00-resumen.md              # este archivo
├── clusters.md                # qué agrupa cada cluster
├── nodos/<id>.md               # un archivo por componente
├── relaciones.md               # tabla completa de conexiones con evidencia
├── externos.md                 # integraciones externas y su riesgo
├── hallazgos.md                # deuda técnica y dudas detectadas
├── graph.json                  # fuente única de verdad del mapa
├── build_graph.py              # valida graph.json y genera el HTML
└── mapa-sistema.template.html  # plantilla del mapa 3D (no editar el HTML final a mano)
```
