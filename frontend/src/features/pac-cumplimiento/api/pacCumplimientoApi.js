import apiClient from '../../../lib/axios';

export const getDentroFuera = (params = {}) =>
    apiClient.get('pac-cumplimiento/dentro-fuera/', { params });

export const getCumplimientoTemporal = (params = {}) =>
    apiClient.get('pac-cumplimiento/temporal/', { params });

export const getJerarquia = (params = {}) =>
    apiClient.get('pac-cumplimiento/jerarquia/', { params });

export const getRankings = (params = {}) =>
    apiClient.get('pac-cumplimiento/rankings/', { params });

export const actualizarMaestroPac = () =>
    apiClient.post('pac-cumplimiento/actualizar-maestro/');

export const actualizarJerarquiaPac = () =>
    apiClient.post('pac-cumplimiento/actualizar-jerarquia/');

export const descargarReporte = (formato, periodo) =>
    apiClient.get(`pac-cumplimiento/reporte/${formato}/`, { params: { periodo }, responseType: 'blob' });
