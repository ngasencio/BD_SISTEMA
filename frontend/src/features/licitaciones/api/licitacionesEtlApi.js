import apiClient from '../../../lib/axios';

export const iniciarActualizacionLicitaciones = (fechaDesde, fechaHasta) =>
    apiClient.post('licitaciones/actualizar/', { fecha_desde: fechaDesde, fecha_hasta: fechaHasta });

export const getEstadoActualizacionLicitaciones = (taskId) =>
    apiClient.get(`licitaciones/actualizar-estado/${taskId}/`);

export const cancelarActualizacionLicitaciones = (taskId) =>
    apiClient.post(`licitaciones/actualizar-cancelar/${taskId}/`);
