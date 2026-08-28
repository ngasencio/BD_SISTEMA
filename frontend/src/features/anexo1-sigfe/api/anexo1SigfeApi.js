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

// Tabs de "Análisis de Ejecución Presupuestaria" (migrados desde
// Dashboard_SSO_Integrado.html) — filtros comunes: ue, anho, mes_desde,
// mes_hasta, excluir_34_35.
export const fetchResumenAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/resumen/', { params });

export const fetchGuiaSimpleAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/guia-simple/', { params });

export const fetchSerieNivel1Anexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/serie-nivel1/', { params });

export const fetchAlertasAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/alertas/', { params });

export const fetchSemaforoAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/semaforo/', { params });

export const fetchBurnRateAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/burn-rate/', { params });

export const fetchDeudaFlotanteAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/deuda-flotante/', { params });

export const fetchTendenciasAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/tendencias/', { params });

export const fetchFinancieroAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/financiero/', { params });

export const fetchDetalladoAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/detallado/', { params });

export const fetchDetalladoParetoAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/detallado/pareto/', { params });

export const fetchDetalladoTemporalAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/detallado/temporal/', { params });

export const fetchDetalladoControlAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/detallado/control/', { params });

export const descargarReporteAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/reporte-pdf/', { params, responseType: 'blob' });

export const fetchConciliacionDevengoAnexo1 = (params = {}) =>
    apiClient.get('sigfe-anexo1/conciliacion-devengo/', { params });

// ETL: descarga (Selenium, servidor) + consolidación desde SIGFE.
// Las credenciales SIGFE viajan solo en este POST — no se persisten.
// visible=true corre Chrome con ventana visible en el escritorio del servidor
// en vez de headless — solo útil para diagnosticar si el proceso corre en la
// misma máquina física desde la que se está mirando.
export const iniciarActualizacionAnexo1 = ({ usuario, password, fechaDesde, fechaHasta, visible }) =>
    apiClient.post('sigfe-anexo1/actualizar/', {
        usuario, password, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, visible: !!visible,
    });

export const estadoActualizacionAnexo1 = (taskId) =>
    apiClient.get(`sigfe-anexo1/actualizar-estado/${taskId}/`);

export const cancelarActualizacionAnexo1 = (taskId) =>
    apiClient.post(`sigfe-anexo1/actualizar-cancelar/${taskId}/`);
