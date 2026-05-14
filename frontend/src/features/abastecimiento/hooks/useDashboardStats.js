/**
 * @file features/abastecimiento/hooks/useDashboardStats.js
 * @description Hook para obtener estadísticas del dashboard de abastecimiento.
 * Usa datos reales del backend; cae a mock si la API no responde.
 */
import { useState, useEffect } from 'react';
import { getDashboardStats } from '../api/abastecimientoApi';

// ─── Mock KPIs (datos de prueba según especificación) ─────────────────────────
const MOCK_STATS = {
    total_formularios: 744,
    dentro_pac: { count: 491, porcentaje: 66 },
    fuera_pac: { count: 253, porcentaje: 34 },
    mercado_publico: {
        licitaciones_activas: 38,
        licitaciones_adjudicadas: 210,
        monto_total_adjudicado: 1_850_000_000, // CLP
        proveedores_activos: 124,
    },
    por_mes: [
        { mes: 'Ene', formularios: 58 },
        { mes: 'Feb', formularios: 62 },
        { mes: 'Mar', formularios: 71 },
        { mes: 'Abr', formularios: 55 },
        { mes: 'May', formularios: 68 },
        { mes: 'Jun', formularios: 60 },
        { mes: 'Jul', formularios: 65 },
        { mes: 'Ago', formularios: 59 },
        { mes: 'Sep', formularios: 63 },
        { mes: 'Oct', formularios: 57 },
        { mes: 'Nov', formularios: 52 },
        { mes: 'Dic', formularios: 74 },
    ],
};

export const useDashboardStats = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isMock, setIsMock] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetchStats = async () => {
            try {
                const { data } = await getDashboardStats();
                if (!cancelled) setStats(data);
            } catch {
                // Si la API falla (p.ej. endpoint aún no existe), usamos mock
                if (!cancelled) {
                    setStats(MOCK_STATS);
                    setIsMock(true);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchStats();
        return () => { cancelled = true; };
    }, []);

    return { stats, loading, error, isMock };
};
