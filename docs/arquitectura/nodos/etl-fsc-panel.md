# ETL Formularios FSC
- **Cluster:** ETL Panel SSO / Selenium
- **Tipo:** script
- **Ubicación:** api/data/data_panel/page_data_panel.py
- **Tecnología:** Python 3 + Selenium

## Qué hace
Inicia sesión en el Panel SSO Documental con RUT/DV/clave, descarga el histórico completo de Formularios FSC (no incremental) y sincroniza contra MariaDB por upsert, además de borrar (acotado a los años presentes en la descarga) las filas cuya clave ya no aparece. También clasifica cada formulario como Dentro/Fuera de PAC y dispara el matching FSC-OC-PAC al terminar.

## Entradas / Salidas
- **Entrada:** credenciales del Panel SSO (no se persisten).
- **Salida:** upsert en `FormularioFSC`/`FormularioFSCDerivado`/`FormularioFSCProducto`; historial de estados en `FormularioFSCEstadoLog`.

## Depende de →
- `panel-sso-documental`, `mariadb`, `backend-services` (dispara matching)

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
Como el Panel SSO entrega el histórico completo en cada descarga, el borrado por ausencia de clave puede eliminar en cascada el `historial_estados` de un FSC — vigente desde 2026-07-21. No hay clave natural única (folio/año se repiten ~33%); la clave de upsert es `folio+anho+unidad_requirente+fecha_solicitud`.
