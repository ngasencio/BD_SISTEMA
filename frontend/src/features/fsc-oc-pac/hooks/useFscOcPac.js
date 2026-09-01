import { useState, useEffect, useCallback } from 'react';
import {
    getResumen, getPendientes, getPivote, getCompraAgilResumen,
} from '../api/fscOcPacApi';

export function useFscOcPac(anho) {
    const [resumen, setResumen] = useState(null);
    const [pendientes, setPendientes] = useState(null);
    const [pivote, setPivote] = useState(null);
    const [compraAgil, setCompraAgil] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = anho ? { anho } : {};
        try {
            const [rsRes, pdRes, pvRes, caRes] = await Promise.allSettled([
                getResumen(params),
                getPendientes(params),
                getPivote(params),
                getCompraAgilResumen(params),
            ]);
            if (rsRes.status === 'fulfilled') setResumen(rsRes.value.data);
            else setError('Error al cargar el resumen del enlace FSC-OC-PAC.');
            if (pdRes.status === 'fulfilled') setPendientes(pdRes.value.data);
            if (pvRes.status === 'fulfilled') setPivote(pvRes.value.data);
            if (caRes.status === 'fulfilled') setCompraAgil(caRes.value.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar datos del módulo.');
        } finally {
            setLoading(false);
        }
    }, [anho]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    return { resumen, pendientes, pivote, compraAgil, loading, error, refresh: fetchAll };
}
