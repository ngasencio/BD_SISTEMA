import apiClient from '../../../lib/axios';

// El reporte es HTML standalone (Chart.js + árbol jerárquico) con los datos
// de api_sigfe_devengo_anual ya inyectados por el backend. Se pide como texto
// autenticado (no <iframe src=...> directo) para que viaje el header
// Authorization igual que el resto de las llamadas al API.
// rango: 'reciente' (año actual + anterior, default) | 'completo' (todo el histórico)
export const fetchReporteSigfeHtml = (rango = 'reciente') =>
    apiClient.get('devengo-sigfe-anual/reporte-html/', { params: { rango }, responseType: 'text' });

// ETL: descarga (Selenium, servidor) + consolidación desde SIGFE.
// Las credenciales SIGFE viajan solo en este POST — no se persisten.
// visible=true corre Chrome con ventana visible en el escritorio del servidor
// en vez de headless — solo útil para diagnosticar si el proceso corre en la
// misma máquina física desde la que se está mirando.
export const iniciarActualizacionSigfe = ({ usuario, password, fechaDesde, fechaHasta, visible }) =>
    apiClient.post('devengo-sigfe-anual/actualizar/', {
        usuario, password, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, visible: !!visible,
    });

export const estadoActualizacionSigfe = (taskId) =>
    apiClient.get(`devengo-sigfe-anual/actualizar-estado/${taskId}/`);

export const cancelarActualizacionSigfe = (taskId) =>
    apiClient.post(`devengo-sigfe-anual/actualizar-cancelar/${taskId}/`);
