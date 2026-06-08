import apiClient from '../../../lib/axios';

export const getFormulariosStats = (params = {}) => apiClient.get('formularios/stats/', { params });

export const getFormularios          = (params = {}) => apiClient.get('formularios-fsc/', { params });
export const getFormulariosDerivados = (params = {}) => apiClient.get('formularios-fsc-derivados/', { params });
export const getFormulariosProductos = (params = {}) => apiClient.get('formularios-fsc-productos/', { params });

export const iniciarActualizacionFormularios  = (credenciales)  => apiClient.post('formularios/actualizar/', credenciales);
export const estadoActualizacionFormularios   = (taskId)        => apiClient.get(`formularios/actualizar-estado/${taskId}/`);
export const cancelarActualizacionFormularios = (taskId)        => apiClient.post(`formularios/actualizar-cancelar/${taskId}/`);
