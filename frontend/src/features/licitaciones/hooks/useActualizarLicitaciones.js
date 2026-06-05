import { useState, useEffect, useRef, useCallback } from 'react';
import { iniciarActualizacionLicitaciones, getEstadoActualizacionLicitaciones, cancelarActualizacionLicitaciones } from '../api/licitacionesEtlApi';

const POLL_MS = 3000;

export function useActualizarLicitaciones(onCompletado) {
    const [tarea, setTarea]       = useState(null);
    const [iniciando, setIniciando] = useState(false);
    const pollRef   = useRef(null);
    const taskIdRef = useRef(null);

    const detener = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, []);

    const iniciarPolling = useCallback((taskId) => {
        detener();
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await getEstadoActualizacionLicitaciones(taskId);
                setTarea(data);
                if (data.status === 'completado') { detener(); if (onCompletado) onCompletado(); }
                else if (data.status === 'error' || data.status === 'cancelado') { detener(); }
            } catch { /* silencioso */ }
        }, POLL_MS);
    }, [detener, onCompletado]);

    const iniciar = useCallback(async (fechaDesde, fechaHasta) => {
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionLicitaciones(fechaDesde, fechaHasta);
            taskIdRef.current = data.task_id;
            setTarea({ status: 'iniciado', paso: 0, paso_desc: 'Iniciando...', task_id: data.task_id, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, error: null });
            iniciarPolling(data.task_id);
        } catch (err) {
            const msg = err.response?.data?.error || 'No se pudo iniciar la actualización.';
            setTarea({ status: 'error', paso: 0, paso_desc: msg, error: msg });
        } finally {
            setIniciando(false);
        }
    }, [iniciarPolling]);

    const cancelar = useCallback(async () => {
        const tid = taskIdRef.current;
        if (!tid) return;
        try { await cancelarActualizacionLicitaciones(tid); } catch { /* silencioso */ }
        detener();
        setTarea(prev => prev ? { ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.', error: 'Actualización cancelada por el usuario.' } : null);
    }, [detener]);

    const cerrar = useCallback(() => { detener(); setTarea(null); taskIdRef.current = null; }, [detener]);

    useEffect(() => () => detener(), [detener]);

    return { tarea, iniciando, iniciar, cancelar, cerrar };
}
