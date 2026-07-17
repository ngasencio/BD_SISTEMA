import { useCallback, useEffect, useState } from 'react';
import { fetchEstadoBDAnexo1 } from '../api/anexo1SigfeApi';

export function useAnexo1EstadoBD() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: res } = await fetchEstadoBDAnexo1();
            setData(res);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo cargar el estado de la base de datos.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch(); }, [fetch]);

    return { data, loading, error, refresh: fetch };
}
