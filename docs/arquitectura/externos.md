# Integraciones externas

| Servicio | Dirección | Autenticación | Usado por | Riesgo si falla |
|---|---|---|---|---|
| API Mercado Público | REST HTTPS (SSL deshabilitado en el cliente) | Ninguna / clave pública del organismo | `etl-licitaciones`, `etl-oc`, `etl-compra-agil` | Los dashboards de Licitaciones/OC/Compra Ágil dejan de recibir datos nuevos; los datos ya cargados siguen disponibles. |
| Panel SSO Osorno | Portal web institucional, sin API pública | Login RUT+DV+clave de una persona autorizada, ingresado por modal en cada sincronización | `etl-fsc-panel`, `etl-contratos` | Formularios FSC y Contratos dejan de actualizarse; como el portal entrega el histórico completo en cada descarga, un cambio de diseño del portal puede romper el scraping sin aviso previo. |
| Portal SIGFE | Portal web gubernamental, sin API pública | Login usuario/clave SIGFE, ingresado por modal | `etl-devengo-sigfe`, `etl-anexo1-sigfe` | El Anexo N°3 (Control de Deuda) y el Anexo N°1 (Ejecución Presupuestaria) dejan de reflejar el estado más reciente. |
| Portal DIPRES / Acepta | Portal web con reCAPTCHA | Login usuario/clave; el reCAPTCHA a veces exige un re-login manual desde el servidor | `etl-facturas-dipres` | El módulo de Facturas deja de actualizarse; puede requerir intervención manual (resolver el reCAPTCHA con navegador visible). |

Ninguna integración expone credenciales, tokens ni cadenas de conexión en el código versionado de forma directa — las claves de portales externos se piden por modal en el momento de usar el botón "Actualizar" y no se guardan. Las que sí están hardcodeadas (`SECRET_KEY` y contraseña de MariaDB en `backend/core/settings.py`) son de uso **interno** del sistema, no de una integración externa, y están registradas como hallazgo (ver `hallazgos.md`).
