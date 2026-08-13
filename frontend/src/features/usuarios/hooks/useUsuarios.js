import { useState, useEffect, useCallback } from 'react';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario, getEstablecimientos } from '../api/usuariosApi';

export function useUsuarios(filtros = {}) {
    const [usuarios, setUsuarios]         = useState([]);
    const [establecimientos, setEstablecimientos] = useState([]);
    const [loading, setLoading]           = useState(false);
    const [error, setError]               = useState(null);
    const [total, setTotal]               = useState(0);

    const fetchUsuarios = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await getUsuarios(filtros);
            const rows = data.results ?? data;
            setUsuarios(rows);
            setTotal(data.count ?? rows.length);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar usuarios.');
        } finally {
            setLoading(false);
        }
    }, [JSON.stringify(filtros)]);

    const fetchEstablecimientos = useCallback(async () => {
        try {
            const { data } = await getEstablecimientos();
            setEstablecimientos(data.results ?? data);
        } catch {
            // no-op
        }
    }, []);

    useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);
    useEffect(() => { fetchEstablecimientos(); }, [fetchEstablecimientos]);

    const crear = async (data) => {
        await createUsuario(data);
        await fetchUsuarios();
    };

    const actualizar = async (id, data) => {
        await updateUsuario(id, data);
        await fetchUsuarios();
    };

    const eliminar = async (id) => {
        await deleteUsuario(id);
        await fetchUsuarios();
    };

    // Asigna `role` a varios usuarios a la vez. Se envía en lotes (no todo de una)
    // para no saturar al backend cuando la selección son cientos de usuarios.
    const actualizarRolMasivo = async (ids, role, loteSize = 20) => {
        let ok = 0;
        let fallidos = 0;
        for (let i = 0; i < ids.length; i += loteSize) {
            const lote = ids.slice(i, i + loteSize);
            const resultados = await Promise.allSettled(
                lote.map(id => updateUsuario(id, { perfil: { role } }))
            );
            resultados.forEach(r => { r.status === 'fulfilled' ? ok++ : fallidos++; });
        }
        await fetchUsuarios();
        return { ok, fallidos };
    };

    return {
        usuarios, establecimientos, loading, error, total,
        refresh: fetchUsuarios, crear, actualizar, eliminar, actualizarRolMasivo,
    };
}
