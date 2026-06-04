import apiClient from '../../../lib/axios';

export const getCompraAgilAhorroStats = (params = {}) =>
    apiClient.get('compraagil/ahorro-stats/', { params });

export const getCompraAgilAnios = () =>
    apiClient.get('compraagil/anios/');

export const getCompraAgilComparativa = () =>
    apiClient.get('compraagil/comparativa/');

export const getCompraAgilClusters = () =>
    apiClient.get('compraagil/patrones/', { params: { tipo: 'clusters' } });

export const getCompraAgilAsociaciones = (minSupport = 0.05) =>
    apiClient.get('compraagil/patrones/', { params: { tipo: 'asociaciones', min_support: minSupport } });

export const getCompraAgilCandidatos = (umbralMonto = 300000, umbralFreq = 3) =>
    apiClient.get('compraagil/patrones/', { params: { tipo: 'candidatos', umbral_monto: umbralMonto, umbral_frecuencia: umbralFreq } });

export const getCompraAgilResumen = (params = {}) =>
    apiClient.get('compraagil-resumen/', { params });

export const getCompraAgilProductos = (params = {}) =>
    apiClient.get('compraagil-productos/', { params });

export const getCompraAgilProveedores = (params = {}) =>
    apiClient.get('compraagil-proveedores/', { params });

// ETL — Actualización desde dashboard
export const iniciarActualizacionCompraAgil = (fechaDesde, fechaHasta) =>
    apiClient.post('compraagil/actualizar/', { fecha_desde: fechaDesde, fecha_hasta: fechaHasta });

export const getEstadoActualizacionCompraAgil = (taskId) =>
    apiClient.get(`compraagil/actualizar-estado/${taskId}/`);
