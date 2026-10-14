import apiClient from '../../../lib/axios';

// Formularios PAC — fichas de planificación del Plan Anual de Compras (Panel SS Osorno).
// Todos los endpoints de análisis aceptan los filtros globales: ?anho= y el organigrama
// (?subdireccion= | ?depto= | ?sin_clasificar=1).

export const getFormulariosPacStats      = (params = {}) => apiClient.get('formularios-pac/stats/', { params });
export const getFormulariosPacFlujo      = (params = {}) => apiClient.get('formularios-pac/flujo/', { params });
export const getFormulariosPacAlertas    = (params = {}) => apiClient.get('formularios-pac/alertas/', { params });
export const getFormulariosPacCarro      = (params = {}) => apiClient.get('formularios-pac/carro/', { params });
export const getFormulariosPacOrganigrama = () => apiClient.get('formularios-pac/organigrama/');

// Ficha completa para el botón «Ver»: cabecera + carro + historial de bandejas + proyecto del plan.
export const getFormularioPacFicha = (id) => apiClient.get('formularios-pac/ficha/', { params: { id } });

// Listados paginados del servidor (DRF).
export const getFormulariosPac          = (params = {}) => apiClient.get('formularios-pac-fichas/', { params });
export const getFormulariosPacProductos = (params = {}) => apiClient.get('formularios-pac-productos/', { params });

// Actualización desde el Panel (misma mecánica que Formularios FSC).
export const iniciarActualizacionFormulariosPac  = (credenciales) => apiClient.post('formularios-pac/actualizar/', credenciales);
export const estadoActualizacionFormulariosPac   = (taskId) => apiClient.get(`formularios-pac/actualizar-estado/${taskId}/`);
export const cancelarActualizacionFormulariosPac = (taskId) => apiClient.post(`formularios-pac/actualizar-cancelar/${taskId}/`);
