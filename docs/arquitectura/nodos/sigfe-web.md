# Portal SIGFE
- **Cluster:** Portales y APIs Externas
- **Tipo:** api-externa
- **Ubicación:** Sistema de Información para la Gestión Financiera del Estado (URL no publicada en este mapa)
- **Tecnología:** Portal web con login, sin API pública

## Qué hace
Portal gubernamental de gestión financiera. Es la fuente del devengo por establecimiento (Anexo N°3 — Control de Deuda) y del estado de ejecución presupuestaria (Anexo N°1), ambos descargados vía Selenium.

## Entradas / Salidas
- **Entrada:** login con usuario/clave SIGFE + rango de fechas.
- **Salida:** reportes de devengo / ejecución presupuestaria por establecimiento.

## Depende de →
- (ninguno — es un servicio externo)

## Lo usan ←
- `etl-devengo-sigfe`, `etl-anexo1-sigfe`

## Riesgos / notas
Ambos ETL soportan un modo con ventana de Chrome visible (`headless=False`) para diagnosticar fallos de automatización directamente en la pantalla del servidor.
