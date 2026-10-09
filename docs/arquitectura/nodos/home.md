# Inicio
- **Cluster:** Frontend SPA (React)
- **Tipo:** ui
- **Ubicación:** frontend/src/features/inicio/ (componente raíz `components/InicioPage.jsx`)
- **Tecnología:** React 18, Chart.js

## Qué hace
Es la pantalla que ve cualquier persona apenas inicia sesión: el tablero **«¿Cómo vamos en <año>?»** con cinco indicadores (órdenes de compra, monto neto, compras dentro del PAC, procesos competitivos, nota de formularios dentro del PAC), el monto neto mensual contra el año anterior, la compra por modalidad y, según el rol, los formularios por bandeja y la deuda SIGFE por unidad ejecutora. Cada indicador lleva al módulo donde se ve el detalle. Aquí vive el botón **"Mapa del sistema"** que abre el mapa 3D.

## Entradas / Salidas
- **Entrada:** `GET /api/inicio/resumen/?anio=` (el servidor entrega solo los bloques que el rol puede ver).
- **Salida:** navegación a la ruta del módulo elegido.

## Depende de →
- `backend-api` (`inicio/resumen/`, `api/services_inicio.py`, que reutiliza los cálculos de PAC, Formularios y Anexo N°3)
- `mapa-sistema` (botón Mapa del sistema)

## Lo usan ←
- `app-shell` (ruta `/`; el rol `gestor_compras` es redirigido a `/gestor-compras`)

## Riesgos / notas
Las cifras deben coincidir con las de los módulos a los que enlaza: por eso el servicio reutiliza las mismas funciones y no recalcula nada propio. La base MariaDB no tiene tablas de zona horaria cargadas, así que las agregaciones por mes usan rangos de fechas y no `ExtractMonth` (ver `CLAUDE.md`, "Módulo Inicio"). Reemplaza al antiguo `pages/Home.jsx`.
