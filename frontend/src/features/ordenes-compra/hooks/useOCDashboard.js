import { useState, useEffect, useCallback, useMemo } from 'react';
import { getOCRawAll } from '../api/ocApi';

export function useOCDashboard() {
    const [rawOC, setRawOC] = useState([]);
    const [loadingOC, setLoadingOC] = useState(false);
    const [errorOC, setErrorOC] = useState(null);

    // Filters
    const [anio, setAnio] = useState('');
    const [unidad, setUnidad] = useState('Todas');

    const years = useMemo(() => {
        if (!rawOC.length) return [];
        const set = new Set(rawOC.map(r => {
            const f = r.FechaEnvio || r.FechaCreacion || '';
            return f ? new Date(f).getFullYear().toString() : null;
        }).filter(Boolean));
        return [...set].sort((a, b) => b - a);
    }, [rawOC]);

    const unidades = useMemo(() => {
        if (!rawOC.length) return [];
        return [...new Set(rawOC.map(r => r.C_Unidad).filter(Boolean))].sort();
    }, [rawOC]);

    const ocData = useMemo(() => {
        let d = rawOC;
        if (anio) {
            d = d.filter(r => {
                const f = r.FechaEnvio || r.FechaCreacion || '';
                return f && new Date(f).getFullYear().toString() === anio;
            });
        }
        if (unidad !== 'Todas') {
            d = d.filter(r => r.C_Unidad === unidad);
        }
        return d;
    }, [rawOC, anio, unidad]);

    const fetchOC = useCallback(async () => {
        setLoadingOC(true);
        setErrorOC(null);
        try {
            const { data } = await getOCRawAll({ limit: 25000 });
            setRawOC(Array.isArray(data) ? data : (data.results ?? []));
        } catch (err) {
            setErrorOC(err.response?.data?.detail || 'Error al cargar órdenes de compra.');
        } finally {
            setLoadingOC(false);
        }
    }, []);

    useEffect(() => { fetchOC(); }, [fetchOC]);

    useEffect(() => {
        if (years.length && !anio) setAnio(years[0]);
    }, [years, anio]);

    return {
        rawOC,
        ocData,
        loadingOC,
        errorOC,
        anio, setAnio,
        unidad, setUnidad,
        years,
        unidades,
        refresh: fetchOC,
    };
}
