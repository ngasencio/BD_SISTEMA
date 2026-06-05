import apiClient from '../../../lib/axios';

export const getContratosStats  = ()         => apiClient.get('contratos/stats/');
export const getContratos        = (params = {}) => apiClient.get('contratos/', { params });

export const iniciarActualizacionContratos  = ()       => apiClient.post('contratos/actualizar/');
export const estadoActualizacionContratos   = (taskId) => apiClient.get(`contratos/actualizar-estado/${taskId}/`);
export const cancelarActualizacionContratos = (taskId) => apiClient.post(`contratos/actualizar-cancelar/${taskId}/`);
