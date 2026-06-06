import apiClient from '../../../lib/axios';

export const getContratosStats       = ()              => apiClient.get('contratos/stats/');
export const getContratos            = (params = {})   => apiClient.get('contratos/', { params });

export const iniciarActualizacionContratos  = ()       => apiClient.post('contratos/actualizar/');
export const estadoActualizacionContratos   = (taskId) => apiClient.get(`contratos/actualizar-estado/${taskId}/`);
export const cancelarActualizacionContratos = (taskId) => apiClient.post(`contratos/actualizar-cancelar/${taskId}/`);

// Endpoints analíticos
export const getContratosEvaluaciones = ()             => apiClient.get('contratos/evaluaciones/');
export const getContratosFinanciero   = (params = {})  => apiClient.get('contratos/financiero/', { params });
export const getContratosOCDetalle    = (idLic)        => apiClient.get('contratos/oc-detalle/', { params: { id_licitacion_oc: idLic } });
export const getContratosPlazos       = (params = {})  => apiClient.get('contratos/plazos/', { params });
export const getContratosPAC          = (params = {})  => apiClient.get('contratos/pac/', { params });
