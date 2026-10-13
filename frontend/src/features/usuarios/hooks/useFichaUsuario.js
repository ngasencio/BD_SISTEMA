import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    getArbolOrganizacion, getFichaUsuario, getUsuariosPanel, patchFichaUsuario,
} from '../api/usuariosApi';
import { indexarArbol } from '../utils/organizacion';

/**
 * Ficha completa de un usuario para el editor del administrador: cuenta, perfil, fila del
 * Panel SSO y departamento — más el árbol de la organización (para elegir/mostrar rutas).
 * `guardar(payload)` aplica el PATCH atómico y deja en `ficha` la versión ya actualizada.
 */
export function useFichaUsuario(userId) {
    const [ficha, setFicha]     = useState(null);
    const [arbol, setArbol]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    const cargar = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [f, a] = await Promise.all([getFichaUsuario(userId), getArbolOrganizacion()]);
            setFicha(f.data);
            setArbol(a.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'No se pudo cargar la ficha del usuario.');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { cargar(); }, [cargar]);

    const guardar = useCallback(async (payload) => {
        const { data } = await patchFichaUsuario(userId, payload);
        setFicha(data);
        return data;
    }, [userId]);

    // Tras editar un departamento: cambian el árbol (nombre/padre) y el alcance de la ficha.
    const recargarTodo = useCallback(async () => {
        const [f, a] = await Promise.all([getFichaUsuario(userId), getArbolOrganizacion()]);
        setFicha(f.data);
        setArbol(a.data);
    }, [userId]);

    const indice = useMemo(() => indexarArbol(arbol), [arbol]);

    return { ficha, arbol, indice, loading, error, guardar, recargar: cargar, recargarTodo };
}

/** Usuarios del Panel SSO, solo cuando se piden (≈480 filas): para revincular una cuenta. */
export function useUsuariosPanel(habilitado) {
    const [usuarios, setUsuarios] = useState([]);
    const [cargado, setCargado]   = useState(false);

    useEffect(() => {
        if (!habilitado || cargado) return undefined;
        let activo = true;
        getUsuariosPanel()
            .then(({ data }) => { if (activo) { setUsuarios(data); setCargado(true); } })
            .catch(() => { if (activo) setCargado(true); });
        return () => { activo = false; };
    }, [habilitado, cargado]);

    return { usuarios, cargando: habilitado && !cargado };
}
