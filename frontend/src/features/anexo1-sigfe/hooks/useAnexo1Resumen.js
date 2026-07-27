import { useCallback, useEffect, useState } from 'react';
import { fetchResumenAnexo1 } from '../api/anexo1SigfeApi';

export function useAnexo1Resumen(filtros = {}, refreshKey = 0) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: res } = await fetchResumenAnexo1({
                ue: filtros.ue || undefined,
                anho: filtros.anho || undefined,
                mes_desde: filtros.mesDesde || undefined,
                mes_hasta: filtros.mesHasta || undefined,
                subtitulo: filtros.subtitulo || undefined,
                anho_comparacion: filtros.anhoComparacion || undefined,
                excluir_34_35: filtros.excluir3435,
            });
            setData(res);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo cargar el Resumen Ejecutivo.');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(filtros), refreshKey]);

    useEffect(() => { fetch(); }, [fetch]);

    return { data, loading, error, refresh: fetch };
}
