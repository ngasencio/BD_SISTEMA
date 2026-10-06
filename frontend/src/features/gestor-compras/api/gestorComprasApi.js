import apiClient from '../../../lib/axios';

// Todo el módulo es de SOLO LECTURA y el backend decide qué departamento ve cada
// usuario (resolver_alcance_gestor). `params` puede traer `depto_id`, pero solo lo
// respetan admin/jefatura/general — para un gestor se ignora en el servidor.
const B = 'gestor-compras';

export const getMiAlcance = (params = {}) => apiClient.get(`${B}/mi-alcance/`, { params });

// ── Tab Solicitudes ──────────────────────────────────────────────────────────
export const getGestorStats = (params = {}) => apiClient.get(`${B}/stats/`, { params });
export const getGestorFlujo = (params = {}) => apiClient.get(`${B}/flujo/`, { params });
export const getGestorAlertas = (params = {}) => apiClient.get(`${B}/alertas/`, { params });
export const getGestorSolicitudes = (params = {}) => apiClient.get(`${B}/solicitudes/`, { params });
export const getGestorSolicitudProductos = (id, params = {}) =>
    apiClient.get(`${B}/solicitudes/${id}/productos/`, { params });

// ── Tab Derivación a Comprador ───────────────────────────────────────────────
export const getGestorResumen = (params = {}) => apiClient.get(`${B}/resumen/`, { params });
export const getGestorDerivaciones = (params = {}) => apiClient.get(`${B}/derivaciones/`, { params });
export const getGestorDerivacion = (id, params = {}) => apiClient.get(`${B}/derivaciones/${id}/`, { params });
export const getGestorDerivacionProductos = (id, params = {}) =>
    apiClient.get(`${B}/derivaciones/${id}/productos/`, { params });
export const getGestorProcesos = (params = {}) => apiClient.get(`${B}/procesos/`, { params });
export const getGestorProceso = (id, params = {}) => apiClient.get(`${B}/procesos/${id}/`, { params });
export const getGestorProcesoHistorial = (id, params = {}) =>
    apiClient.get(`${B}/procesos/${id}/historial/`, { params });
export const getGestorProcesoDetalleMp = (id, params = {}) =>
    apiClient.get(`${B}/procesos/${id}/detalle-mp/`, { params });

// ── Tab Plan de Compra ───────────────────────────────────────────────────────
export const getGestorPlanResumen = (params = {}) => apiClient.get(`${B}/plan/resumen/`, { params });
export const getGestorPlanTemporal = (params = {}) => apiClient.get(`${B}/plan/temporal/`, { params });
export const getGestorPlanMensual = (params = {}) => apiClient.get(`${B}/plan/mensual/`, { params });
export const getGestorPlanItems = (params = {}) => apiClient.get(`${B}/plan/items/`, { params });
export const getGestorPlanItem = (idProyecto, params = {}) =>
    apiClient.get(`${B}/plan/items/${encodeURIComponent(idProyecto)}/`, { params });
