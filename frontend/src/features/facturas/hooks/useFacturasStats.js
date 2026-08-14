import { useState, useEffect, useCallback } from 'react';
import { getFacturasStats } from '../api/facturasApi';

export function useFacturasStats() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: res } = await getFacturasStats();
            setData(res);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar los datos de Facturas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch(); }, [fetch]);
    return { data, loading, error, refresh: fetch };
}
