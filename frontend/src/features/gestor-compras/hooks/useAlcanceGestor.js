import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMiAlcance } from '../api/gestorComprasApi';

// Departamento(s) que el usuario puede ver. El gestor recibe el suyo (de su
// pertenencia en el Panel SSO); admin/jefatura/general reciben además la lista de
// `departamentos_disponibles` y eligen uno — la elección vive en la URL (?depto_id=)
// para que sobreviva a un refresco y se pueda compartir el enlace.
export function useAlcanceGestor() {
    const [searchParams, setSearchParams] = useSearchParams();
    const deptoId = searchParams.get('depto_id') || '';
    const [alcance, setAlcance] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(null);
        getMiAlcance(deptoId ? { depto_id: deptoId } : {})
            .then(({ data }) => { if (activo) setAlcance(data); })
            .catch((err) => {
                if (!activo) return;
                setAlcance(null);
                setError(err.response?.data?.detail || 'No fue posible cargar su departamento.');
            })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [deptoId]);

    const setDeptoId = useCallback((id) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (id) next.set('depto_id', id); else next.delete('depto_id');
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    // Params que cada tab agrega a sus llamadas (vacío para un gestor).
    const params = useMemo(() => (deptoId ? { depto_id: deptoId } : {}), [deptoId]);

    return { alcance, cargando, error, deptoId, setDeptoId, params };
}
