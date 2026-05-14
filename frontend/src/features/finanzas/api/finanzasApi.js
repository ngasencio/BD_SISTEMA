/**
 * @file features/finanzas/api/finanzasApi.js
 * @description Llamadas a la API del módulo Finanzas (Devengo / Control de deuda).
 */
import apiClient from '../../../lib/axios';

// ─── Devengo ──────────────────────────────────────────────────────────────────
export const getDevengoStats = () =>
    apiClient.get('devengo/stats/');

export const getDevengoRaw = (params = {}) =>
    apiClient.get('devengo/raw_all/', { params });

export const getDevengoList = (params = {}) =>
    apiClient.get('devengo/', { params });
