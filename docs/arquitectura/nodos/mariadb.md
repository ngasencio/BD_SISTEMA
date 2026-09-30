# MariaDB
- **Cluster:** Almacenamiento de Datos
- **Tipo:** bd
- **Ubicación:** MariaDB — base `bd_sistema`
- **Tecnología:** MariaDB 10.x

## Qué hace
Es la única base de datos relacional del sistema. Contiene todas las tablas activas: Licitaciones, Órdenes de Compra, PAC, Formularios FSC, Contratos, Devengo SIGFE, garantías, usuarios y sus tablas de enlace/override.

## Entradas / Salidas
- **Entrada:** escrituras de todos los scripts ETL (DELETE+bulk_create o upsert, según el módulo) y del backend (acciones humanas como confirmar/rechazar un enlace).
- **Salida:** lecturas del backend vía Django ORM.

## Depende de →
- (ninguno)

## Lo usan ←
- `backend-api`, `backend-services`, `backend-ml`, `etl-licitaciones`, `etl-oc`, `etl-compra-agil`, `etl-fsc-panel`, `etl-contratos`, `etl-devengo-sigfe`, `etl-anexo1-sigfe`, `etl-facturas-dipres`, `etl-pac-loader`

## Riesgos / notas
Coexisten dos convenciones de nombres de campo (PascalCase legado en Licitacion/OrdenCompra vs. snake_case en todo lo demás). Varios ETL hacen `DELETE`+`bulk_create` sin `transaction.atomic()` — una caída a mitad de sincronización puede dejar la tabla vacía o parcial. El usuario de producción debiera ser de privilegio limitado, no `root`.
