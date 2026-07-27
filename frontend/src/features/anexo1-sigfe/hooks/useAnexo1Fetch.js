import { useCallback, useEffect, useState } from 'react';

// Hook genérico para los endpoints de "Análisis de Ejecución Presupuestaria"
// — todos comparten la misma forma (GET con params -> {data}/{loading}/{error}).
export function useAnexo1Fetch(fetchFn, params = {}, refreshKey = 0, errorMsg = 'No se pudo cargar la información.') {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: res } = await fetchFn(params);
            setData(res);
        } catch (err) {
            setError(err.response?.data?.detail || errorMsg);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(params), refreshKey]);

    useEffect(() => { fetch(); }, [fetch]);

    return { data, loading, error, refresh: fetch };
}
