import { useCallback, useEffect, useState } from 'react';
import { getInicioResumen } from '../api/inicioApi';

/** Carga el tablero del Home. `anio` null = el que decida el servidor (año en curso). */
export function useInicioResumen(anio) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [intento, setIntento] = useState(0);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(null);
        getInicioResumen(anio)
            .then(({ data }) => { if (activo) setDatos(data); })
            .catch((err) => { if (activo) setError(err.response?.data?.detail || 'No fue posible cargar el tablero.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anio, intento]);

    const reintentar = useCallback(() => setIntento((n) => n + 1), []);
    return { datos, cargando, error, reintentar };
}
