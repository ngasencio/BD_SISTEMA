/**
 * @file features/finanzas/hooks/useDevengoStats.js
 * @description Hook para estadísticas del dashboard financiero.
 *
 * La API /api/devengo/stats/ devuelve:
 *   { kpis: { deuda_total, deuda_pagada, monto_vigente, pct_pendiente, n_registros,
 *             top_proveedor, top_proveedor_monto, top_ue, top_ue_monto },
 *     por_ue, top_proveedores, por_tipo_doc, por_n1 }
 *
 * Este hook normaliza esa respuesta al formato que usa FinanzasDashboard.
 */
import { useState, useEffect } from 'react';
import { getDevengoStats } from '../api/finanzasApi';

const mapApiResponse = (data) => {
    const k = data.kpis ?? {};
    const monto_vigente = k.monto_vigente ?? 0;
    const deuda_pagada = k.deuda_pagada ?? 0;
    const deuda_total = k.deuda_total ?? 0;

    return {
        presupuesto_total: monto_vigente,
        presupuesto_ejecutado: deuda_pagada,
        porcentaje_ejecucion: monto_vigente > 0
            ? Math.round((deuda_pagada / monto_vigente) * 100)
            : 0,
        deuda_pendiente: deuda_total,
        monto_disponible_total: monto_vigente - deuda_total,
        monto_vigente_total: monto_vigente,
        monto_consumido_total: deuda_pagada,
        n_registros: k.n_registros ?? 0,
        top_proveedor: k.top_proveedor ?? '-',
        top_proveedor_monto: k.top_proveedor_monto ?? 0,
        top_ue: k.top_ue ?? '-',
        // Distribución por tipo de documento como "estados_pago"
        estados_pago: (data.por_tipo_doc ?? []).map((r) => ({
            estado: r.td,
            monto: r.deuda,
            cantidad: null,
        })),
        por_ue: data.por_ue ?? [],
        top_proveedores: data.top_proveedores ?? [],
        por_n1: data.por_n1 ?? [],
    };
};

export const useDevengoStats = (params = {}) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const fetch = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data } = await getDevengoStats(params);
                if (!cancelled) setStats(mapApiResponse(data));
            } catch (err) {
                if (!cancelled) {
                    setError(err.response?.data?.detail || 'Error al cargar estadísticas de devengo.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetch();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { stats, loading, error };
};
