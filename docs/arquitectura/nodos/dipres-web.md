# Portal DIPRES
- **Cluster:** Portales y APIs Externas
- **Tipo:** api-externa
- **Ubicación:** Dirección de Presupuestos / Acepta (URL no publicada en este mapa)
- **Tecnología:** Portal web con reCAPTCHA

## Qué hace
Portal de la Dirección de Presupuestos usado para descargar las facturas que alimentan el módulo de Facturas.

## Entradas / Salidas
- **Entrada:** login + rango de fechas.
- **Salida:** listado de facturas (folio, emisor, monto, fecha de emisión).

## Depende de →
- (ninguno — es un servicio externo)

## Lo usan ←
- `etl-facturas-dipres`

## Riesgos / notas
Protegido con reCAPTCHA — no se puede resolver de forma remota, por lo que a veces se requiere un re-login manual con navegador visible desde el propio servidor.
