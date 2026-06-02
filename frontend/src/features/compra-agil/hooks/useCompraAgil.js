import { useState, useEffect, useCallback } from 'react';
import { getCompraAgilAhorroStats, getCompraAgilResumen, getCompraAgilProveedores } from '../api/compraAgilApi';

export function useCompraAgil(filtros = {}) {
    const { fechaDesde, fechaHasta } = filtros;

    const [stats, setStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [errorStats, setErrorStats] = useState(null);

    const [compras, setCompras] = useState([]);
    const [loadingCompras, setLoadingCompras] = useState(true);
    const [errorCompras, setErrorCompras] = useState(null);
    const [comprasCount, setComprasCount] = useState(0);

    const [proveedores, setProveedores] = useState([]);
    const [loadingProveedores, setLoadingProveedores] = useState(false);

    const params = {};
    if (fechaDesde) params.fecha_desde = fechaDesde;
    if (fechaHasta) params.fecha_hasta = fechaHasta;

    const fetchStats = useCallback(async () => {
        setLoadingStats(true);
        setErrorStats(null);
        try {
            const { data } = await getCompraAgilAhorroStats(params);
            setStats(data);
        } catch (err) {
            setErrorStats(err.response?.data?.detail || 'Error al cargar estadísticas.');
        } finally {
            setLoadingStats(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fechaDesde, fechaHasta]);

    const fetchCompras = useCallback(async (extraParams = {}) => {
        setLoadingCompras(true);
        setErrorCompras(null);
        try {
            const p = {};
            if (fechaDesde) p.fecha_desde = fechaDesde;
            if (fechaHasta) p.fecha_hasta = fechaHasta;
            // El ViewSet usa NoPaginationMixin → devuelve todos los registros en 1 petición
            const { data } = await getCompraAgilResumen({ ...p, ...extraParams });
            const items = Array.isArray(data) ? data : (data.results ?? []);
            setCompras(items);
            setComprasCount(items.length);
        } catch (err) {
            const msg = err.response?.data?.detail || err.message || 'Error al cargar compras ágiles.';
            setErrorCompras(msg);
            setCompras([]);
        } finally {
            setLoadingCompras(false);
        }
    }, [fechaDesde, fechaHasta]);

    const fetchProveedores = useCallback(async () => {
        setLoadingProveedores(true);
        try {
            const { data } = await getCompraAgilProveedores({ page_size: 5000 });
            setProveedores(data.results ?? data);
        } catch {
            setProveedores([]);
        } finally {
            setLoadingProveedores(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchCompras();
    }, [fetchStats, fetchCompras]);

    useEffect(() => {
        fetchProveedores();
    }, [fetchProveedores]);

    return {
        stats, loadingStats, errorStats,
        compras, loadingCompras, errorCompras, comprasCount,
        proveedores, loadingProveedores,
        refresh: () => { fetchStats(); fetchCompras(); fetchProveedores(); },
        fetchCompras,
    };
}
