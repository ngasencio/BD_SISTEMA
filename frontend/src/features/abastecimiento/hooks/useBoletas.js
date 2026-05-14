/**
 * @file features/abastecimiento/hooks/useBoletas.js
 * @description Hook de datos para el módulo de Registro de Boletas de Garantía.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    createBoleta, deleteBoleta, getAuditoria,
    getBoletas, getCompradores, getProveedores, updateBoleta,
} from '../api/boletasApi';

// ─── Catálogos (se cargan una sola vez) ───────────────────────────────────────

export function useCatalogos() {
    const [proveedores, setProveedores] = useState([]);
    const [compradores, setCompradores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([getProveedores(), getCompradores()])
            .then(([pRes, cRes]) => {
                if (cancelled) return;
                setProveedores(pRes.data);
                setCompradores(cRes.data);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message || 'Error cargando catálogos');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    return { proveedores, compradores, loading, error };
}

// ─── Lista paginada de boletas ─────────────────────────────────────────────────

export function useBoletas() {
    const [boletas, setBoletas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [filters, setFilters] = useState({});
    const PAGE_SIZE = 20;

    const fetchBoletas = useCallback(async (currentPage, currentFilters) => {
        setLoading(true);
        setError(null);
        try {
            const res = await getBoletas({
                page: currentPage,
                page_size: PAGE_SIZE,
                ...currentFilters,
            });
            // DRF PageNumberPagination devuelve { count, results }
            const data = res.data;
            setBoletas(data.results ?? data);
            setTotalCount(data.count ?? (data.results ?? data).length);
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cargar las boletas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBoletas(page, filters);
    }, [page, filters, fetchBoletas]);

    const refresh = () => fetchBoletas(page, filters);

    const applyFilters = (newFilters) => {
        setPage(1);
        setFilters(newFilters);
    };

    return {
        boletas, loading, error,
        page, setPage, totalCount, PAGE_SIZE,
        filters, applyFilters, refresh,
    };
}

// ─── Operaciones CRUD ─────────────────────────────────────────────────────────

export function useBoletasMutations(onSuccess) {
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const save = async (formData, editId = null) => {
        setSaving(true);
        setSaveError(null);
        try {
            if (editId) {
                await updateBoleta(editId, formData);
            } else {
                await createBoleta(formData);
            }
            onSuccess?.();
            return true;
        } catch (err) {
            const data = err.response?.data;
            const msg = data
                ? Object.values(data).flat().join(' ')
                : 'Error al guardar. Intente nuevamente.';
            setSaveError(msg);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id, razon) => {
        setSaving(true);
        setSaveError(null);
        try {
            await deleteBoleta(id, razon);
            onSuccess?.();
            return true;
        } catch (err) {
            setSaveError(err.response?.data?.detail || 'Error al eliminar.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    return { save, remove, saving, saveError };
}

// ─── Auditoría ────────────────────────────────────────────────────────────────

export function useAuditoria() {
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getAuditoria();
            setRegistros(res.data.results ?? res.data);
        } catch (err) {
            setError('Error al cargar la auditoría.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch(); }, [fetch]);

    return { registros, loading, error, refresh: fetch };
}
