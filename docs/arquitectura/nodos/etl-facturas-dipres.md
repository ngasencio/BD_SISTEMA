# ETL Facturas DIPRES
- **Cluster:** ETL Presupuesto (SIGFE/DIPRES/PAC)
- **Tipo:** script
- **Ubicación:** api/data/data_facturas/dipres_scraper.py, actualizar_facturas.py
- **Tecnología:** Python 3 + Playwright

## Qué hace
Descarga facturas desde el portal DIPRES/Acepta y hace upsert por `folio+emisor` en el modelo `Factura`.

## Entradas / Salidas
- **Entrada:** usuario/clave + rango de fechas.
- **Salida:** filas en `Factura` (`emision` guardado como string `DD-MM-YYYY`).

## Depende de →
- `dipres-web`, `mariadb`

## Lo usan ←
- `backend-etl-runner`

## Riesgos / notas
Es el único ETL que usa **Playwright** en vez de Selenium. El portal tiene reCAPTCHA, que no se puede resolver de forma remota vía el modal web — el modo `headless=False` existe específicamente para que alguien con acceso a la pantalla del servidor resuelva un re-login manual cuando la sesión expira.
