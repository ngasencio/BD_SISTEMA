import apiClient from '../../../lib/axios';

export const getOCRawAll = (params = {}) =>
    apiClient.get('ordenes-compra/raw_all/', { params });

// ETL — Actualización desde dashboard
export const iniciarActualizacionOC = (fechaDesde, fechaHasta) =>
    apiClient.post('ordenes-compra/actualizar/', { fecha_desde: fechaDesde, fecha_hasta: fechaHasta });

export const getEstadoActualizacionOC = (taskId) =>
    apiClient.get(`ordenes-compra/actualizar-estado/${taskId}/`);
