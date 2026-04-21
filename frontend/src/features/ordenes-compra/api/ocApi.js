import apiClient from '../../../lib/axios';

export const getOCRawAll = (params = {}) =>
    apiClient.get('ordenes-compra/raw_all/', { params });

export const getFacturasRawAll = (params = {}) =>
    apiClient.get('facturas/raw_all/', { params });
