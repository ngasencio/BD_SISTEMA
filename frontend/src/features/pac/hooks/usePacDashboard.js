import { useState, useEffect, useCallback } from 'react';
import { getIndicadoresRes188, getOCStats } from '../api/pacApi';

export function usePacDashboard(anio = 2026) {
    const [indicadores, setIndicadores] = useState(null);
    const [ocStats, setOcStats]         = useState(null);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [indRes, ocRes] = await Promise.allSettled([
                getIndicadoresRes188(anio),
                getOCStats(anio),
            ]);
            if (indRes.status === 'fulfilled') setIndicadores(indRes.value.data);
            if (ocRes.status === 'fulfilled')  setOcStats(ocRes.value.data);
            else setError('Error al cargar estadísticas OC.');
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar datos PAC.');
        } finally {
            setLoading(false);
        }
    }, [anio]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    return { indicadores, ocStats, loading, error, refresh: fetchAll };
}
