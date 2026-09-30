# Panel SSO Osorno
- **Cluster:** Portales y APIs Externas
- **Tipo:** api-externa
- **Ubicación:** Portal documental institucional (URL no publicada en este mapa)
- **Tecnología:** Portal web con login RUT+clave, sin API pública

## Qué hace
Portal documental interno del Servicio de Salud Osorno donde se gestionan los Formularios de Solicitud de Compra (FSC) y los contratos vigentes. No expone una API — el sistema entra simulando a un usuario real vía Selenium.

## Entradas / Salidas
- **Entrada:** login con RUT/DV/clave de una persona autorizada.
- **Salida:** histórico completo de Formularios FSC (HTML/tablas) o el Excel de contratos.

## Depende de →
- (ninguno — es un servicio externo)

## Lo usan ←
- `etl-fsc-panel`, `etl-contratos`

## Riesgos / notas
Las credenciales se piden por modal en el momento de la sincronización y no se persisten en la base de datos. Un cambio de diseño del portal puede romper el scraping en cualquier momento — no hay contrato/versión de API que garantice estabilidad.
