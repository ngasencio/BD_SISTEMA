import { useState, useEffect, useCallback } from 'react';
import {
    getDentroFuera, getCumplimientoTemporal, getJerarquia, getRankings,
} from '../api/pacCumplimientoApi';

export function usePacCumplimiento(anho, rankingTipo = 'depto') {
    const [dentroFuera, setDentroFuera] = useState(null);
    const [temporal, setTemporal]       = useState(null);
    const [jerarquia, setJerarquia]     = useState(null);
    const [rankings, setRankings]       = useState(null);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = anho ? { anho } : {};
        try {
            const [dfRes, tpRes, jrRes, rkRes] = await Promise.allSettled([
                getDentroFuera(params),
                getCumplimientoTemporal(params),
                getJerarquia(params),
                getRankings({ ...params, tipo: rankingTipo }),
            ]);
            if (dfRes.status === 'fulfilled') setDentroFuera(dfRes.value.data);
            else setError('Error al cargar Dentro/Fuera PAC.');
            if (tpRes.status === 'fulfilled') setTemporal(tpRes.value.data);
            if (jrRes.status === 'fulfilled') setJerarquia(jrRes.value.data);
            if (rkRes.status === 'fulfilled') setRankings(rkRes.value.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar datos del módulo PAC.');
        } finally {
            setLoading(false);
        }
    }, [anho, rankingTipo]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    return { dentroFuera, temporal, jerarquia, rankings, loading, error, refresh: fetchAll };
}
