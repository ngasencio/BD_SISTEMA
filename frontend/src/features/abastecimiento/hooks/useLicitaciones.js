/**
 * @file features/abastecimiento/hooks/useLicitaciones.js
 * @description Hook para listar y paginar licitaciones desde DRF.
 */
import { useState, useEffect, useCallback } from 'react';
import { getLicitaciones } from '../api/abastecimientoApi';

export const useLicitaciones = (initialParams = {}) => {
    const [data, setData] = useState([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [params, setParams] = useState({ page: 1, ...initialParams });

    const fetchLicitaciones = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: res } = await getLicitaciones(params);
            // DRF paginado devuelve { count, results }
            setData(res.results ?? res);
            setCount(res.count ?? (res.results ?? res).length);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar licitaciones.');
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => { fetchLicitaciones(); }, [fetchLicitaciones]);

    const changePage = (page) => setParams((p) => ({ ...p, page }));
    const applyFilter = (filters) => setParams((p) => ({ ...p, ...filters, page: 1 }));

    return { data, count, loading, error, params, changePage, applyFilter, refetch: fetchLicitaciones };
};
