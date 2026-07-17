/**
 * @file features/finanzas/api/finanzasApi.js
 * @description Llamadas a la API del módulo Finanzas (Devengo / Control de deuda).
 * Corre 100% sobre api_sigfe_devengo_anual — la tabla 'devengo' fue eliminada.
 */
import apiClient from '../../../lib/axios';

// ─── Devengo (histórico consolidado SIGFE) ────────────────────────────────────
export const getDevengoStats = () =>
    apiClient.get('devengo-sigfe-anual/stats/');

export const getDevengoRaw = (params = {}) =>
    apiClient.get('devengo-sigfe-anual/raw_all/', { params });

export const getDevengoList = (params = {}) =>
    apiClient.get('devengo-sigfe-anual/', { params });
