/**
 * @file features/finanzas/hooks/useDevengoStats.js
 * @description Hook para estadísticas del dashboard financiero.
 */
import { useState, useEffect } from 'react';
import { getDevengoStats } from '../api/finanzasApi';

const MOCK_FINANZAS = {
    presupuesto_total: 4_200_000_000,
    presupuesto_ejecutado: 2_940_000_000,
    porcentaje_ejecucion: 70,
    deuda_pendiente: 185_000_000,
    estados_pago: [
        { estado: 'Pagado', monto: 2_755_000_000, cantidad: 312 },
        { estado: 'Pendiente', monto: 185_000_000, cantidad: 47 },
        { estado: 'En Proceso', monto: 95_000_000, cantidad: 23 },
        { estado: 'Rechazado', monto: 12_000_000, cantidad: 5 },
    ],
    monto_vigente_total: 3_125_000_000,
    monto_disponible_total: 1_260_000_000,
    monto_consumido_total: 1_865_000_000,
};

export const useDevengoStats = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isMock, setIsMock] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetch = async () => {
            try {
                const { data } = await getDevengoStats();
                if (!cancelled) setStats(data);
            } catch {
                if (!cancelled) { setStats(MOCK_FINANZAS); setIsMock(true); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetch();
        return () => { cancelled = true; };
    }, []);

    return { stats, loading, isMock };
};
