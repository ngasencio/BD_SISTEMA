import apiClient from '../../../lib/axios';

export const getFacturasStats = () => apiClient.get('facturas/stats/');

export const getFacturasAnalisis = () => apiClient.get('facturas/analisis/');

// ETL: descarga (Playwright, servidor) + upsert (folio+emisor) desde DIPRES/Acepta.
// Las credenciales viajan solo en este POST — no se persisten.
// visible=true corre Chromium con ventana visible en el escritorio del servidor —
// solo tiene efecto real si quien lo dispara tiene acceso directo a esa máquina
// (necesario para resolver el reCAPTCHA cuando la sesión persistente expiró).
export const iniciarActualizacionFacturas = ({ usuario, password, fechaDesde, fechaHasta, visible }) =>
    apiClient.post('facturas/actualizar/', {
        usuario, password, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, visible: !!visible,
    });

export const estadoActualizacionFacturas = (taskId) =>
    apiClient.get(`facturas/actualizar-estado/${taskId}/`);

export const cancelarActualizacionFacturas = (taskId) =>
    apiClient.post(`facturas/actualizar-cancelar/${taskId}/`);
