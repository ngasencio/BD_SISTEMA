/**
 * @file features/abastecimiento/api/abastecimientoApi.js
 * @description Llamadas a la API del módulo Abastecimiento (Licitaciones / FSC).
 * Todos los endpoints consumen el DRF del backend BD_SISTEMA.
 */
import apiClient from '../../../lib/axios';

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardStats = () =>
    apiClient.get('dashboard/stats/');

// ─── Licitaciones ─────────────────────────────────────────────────────────────
export const getLicitaciones = (params = {}) =>
    apiClient.get('licitaciones/', { params });

export const getLicitacionById = (codigo) =>
    apiClient.get(`licitaciones/${codigo}/`);

export const getDetallesLicitacion = (codigoLicitacion) =>
    apiClient.get('detalles/', { params: { licitacion: codigoLicitacion } });

// ─── FSC (Formularios de Solicitud de Compra) — extensión futura ──────────────
// Cuando el backend exponga el endpoint FSC, descomentar:
// export const getFSCList = (params = {}) => apiClient.get('fsc/', { params });
// export const createFSC = (data) => apiClient.post('fsc/', data);
// export const updateFSC = (id, data) => apiClient.patch(`fsc/${id}/`, data);
