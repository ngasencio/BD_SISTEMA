import { useState, useEffect } from 'react';

/**
 * Tabla con búsqueda + orden + paginación del lado del servidor (DRF).
 * `fetcher(params)` debe devolver la promesa de axios; `filtros` es un objeto de filtros
 * adicionales (o null) y reinicia la página cuando cambia.
 */
export function useListaServidor(fetcher, ordenInicial, filtros) {
    const [search, setSearch] = useState('');
    const [ordering, setOrdering] = useState(ordenInicial);
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ results: [], count: 0 });
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(false);
    const filtrosKey = JSON.stringify(filtros || {});

    useEffect(() => { setPage(1); }, [search, ordering, filtrosKey]);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(false);
        fetcher({ search: search || undefined, ordering, page, ...(filtros || {}) })
            .then(({ data: res }) => {
                if (!activo) return;
                const results = res.results ?? res;
                setData({ results, count: res.count ?? results.length });
            })
            .catch(() => { if (activo) { setData({ results: [], count: 0 }); setError(true); } })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, ordering, page, filtrosKey]);

    return { search, setSearch, ordering, setOrdering, page, setPage, data, cargando, error };
}
