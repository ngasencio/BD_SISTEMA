import apiClient from '../../../lib/axios';

export const getIndicadoresRes188 = (anio = 2026) =>
    apiClient.get('pac/indicadores-res188/', { params: { anio } });

export const getOCStats = (anio = 2026) =>
    apiClient.get('pac/oc-stats/', { params: { anio } });

export const descargarReporteInd1 = (formato, anio) =>
    apiClient.get(`pac/reporte/${formato}/`, { params: { anio }, responseType: 'blob' });

export const getPlanerPAC = (params = {}) =>
    apiClient.get('planer-pac/', { params });

export const getCompraAgilResumen = (params = {}) =>
    apiClient.get('compraagil-resumen/', { params });

export const getCompraAgilProductos = (params = {}) =>
    apiClient.get('compraagil-productos/', { params });

export const getCompraAgilProveedores = (params = {}) =>
    apiClient.get('compraagil-proveedores/', { params });
