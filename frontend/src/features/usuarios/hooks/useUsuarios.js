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

    return { usuarios, establecimientos, loading, error, total, refresh: fetchUsuarios, crear, actualizar, eliminar };
}
