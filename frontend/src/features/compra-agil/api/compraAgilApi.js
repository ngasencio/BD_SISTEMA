import apiClient from '../../../lib/axios';

export const getCompraAgilAhorroStats = (params = {}) =>
    apiClient.get('compraagil/ahorro-stats/', { params });

export const getCompraAgilResumen = (params = {}) =>
    apiClient.get('compraagil-resumen/', { params });

export const getCompraAgilProductos = (params = {}) =>
    apiClient.get('compraagil-productos/', { params });

export const getCompraAgilProveedores = (params = {}) =>
    apiClient.get('compraagil-proveedores/', { params });
