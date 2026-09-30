# Clusters

## Frontend SPA (React) — `#7dd3fc`
La aplicación web que usan las personas del Servicio de Salud Osorno. Un solo proyecto React/Vite, dividido en "features" por dominio de negocio.

Nodos: `app-shell`, `home`, `mapa-sistema`, `mod-mercado-publico`, `mod-compra-agil`, `mod-pac`, `mod-abastecimiento`, `mod-fsc-oc-pac`, `mod-anexo-sigfe`, `mod-finanzas-facturas`, `mod-usuarios`.

## Backend API (Django REST) — `#a78bfa`
El servidor Django que expone la API REST, aplica los permisos por rol y orquesta las tareas de sincronización (ETL) que se lanzan desde el frontend.

Nodos: `backend-api`, `backend-services`, `backend-ml`, `backend-etl-runner`, `backend-auth`.

## Almacenamiento de Datos — `#facc15`
Dónde vive la información: la base de datos relacional y los archivos CSV/Excel que el sistema usa como "maestros" fuera de la base.

Nodos: `mariadb`, `archivos-maestros`.

## ETL Mercado Público — `#4ade80`
Scripts que descargan datos desde la API pública de Mercado Público (Licitaciones, Órdenes de Compra, Compra Ágil).

Nodos: `etl-licitaciones`, `etl-oc`, `etl-compra-agil`.

## ETL Panel SSO / Selenium — `#f472b6`
Scripts que simulan a un usuario real (vía Selenium) para descargar información de portales institucionales que no tienen API: Formularios FSC y Contratos.

Nodos: `etl-fsc-panel`, `etl-contratos`.

## ETL Presupuesto (SIGFE/DIPRES/PAC) — `#fb923c`
Scripts que alimentan la reportería financiera y presupuestaria: devengo, ejecución presupuestaria, facturas y el Plan Anual de Compras.

Nodos: `etl-devengo-sigfe`, `etl-anexo1-sigfe`, `etl-facturas-dipres`, `etl-pac-loader`.

## Portales y APIs Externas — `#f87171`
Los sistemas de terceros (Mercado Público, Panel SSO, SIGFE, DIPRES) de donde el sistema obtiene su información original. Ninguno es propio del proyecto.

Nodos: `api-mercado-publico`, `panel-sso-documental`, `sigfe-web`, `dipres-web`.
