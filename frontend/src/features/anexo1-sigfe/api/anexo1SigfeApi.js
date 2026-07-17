import apiClient from '../../../lib/axios';

// Matriz establecimiento x mes con semáforo verde/amarillo/rojo de cobertura
// de datos sobre api_sigfe_anexo1. anhoDesde es opcional (default: año actual - 1).
export const fetchEstadoBDAnexo1 = (anhoDesde) =>
    apiClient.get('sigfe-anexo1/estado-bd/', {
        params: anhoDesde ? { anho_desde: anhoDesde } : {},
    });

// Listado paginado, para futuras vistas de detalle por establecimiento/mes.
export const fetchAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/', { params });

// ETL: descarga (Selenium headless, servidor) + consolidación desde SIGFE.
// Las credenciales SIGFE viajan solo en este POST — no se persisten.
export const iniciarActualizacionAnexo1 = ({ usuario, password, fechaDesde, fechaHasta }) =>
    apiClient.post('sigfe-anexo1/actualizar/', {
        usuario, password, fecha_desde: fechaDesde, fecha_hasta: fechaHasta,
    });

export const estadoActualizacionAnexo1 = (taskId) =>
    apiClient.get(`sigfe-anexo1/actualizar-estado/${taskId}/`);

export const cancelarActualizacionAnexo1 = (taskId) =>
    apiClient.post(`sigfe-anexo1/actualizar-cancelar/${taskId}/`);
