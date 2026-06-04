import { useState, useEffect, useRef, useCallback } from 'react';
import { iniciarActualizacionOC, getEstadoActualizacionOC } from '../api/ocApi';

const POLL_MS = 3000;

/**
 * Gestiona el proceso ETL de actualización de Órdenes de Compra.
 * onCompletado se llama cuando el ETL termina exitosamente (para refrescar el dashboard).
 */
export function useActualizarOC(onCompletado) {
    const [tarea, setTarea] = useState(null);
    const [iniciando, setIniciando] = useState(false);
    const pollRef = useRef(null);

    const detener = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, []);

    const iniciarPolling = useCallback((taskId) => {
        detener();
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await getEstadoActualizacionOC(taskId);
                setTarea(data);
                if (data.status === 'completado') { detener(); if (onCompletado) onCompletado(); }
                else if (data.status === 'error') { detener(); }
            } catch { /* silencioso */ }
        }, POLL_MS);
    }, [detener, onCompletado]);

    const iniciar = useCallback(async (fechaDesde, fechaHasta) => {
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionOC(fechaDesde, fechaHasta);
            setTarea({ status: 'iniciado', paso: 0, paso_desc: 'Iniciando...', fecha_desde: fechaDesde, fecha_hasta: fechaHasta, error: null });
            iniciarPolling(data.task_id);
        } catch (err) {
            const msg = err.response?.data?.error || 'No se pudo iniciar la actualización.';
            setTarea({ status: 'error', paso: 0, paso_desc: msg, error: msg });
        } finally {
            setIniciando(false);
        }
    }, [iniciarPolling]);

    const cerrar = useCallback(() => { detener(); setTarea(null); }, [detener]);

    useEffect(() => () => detener(), [detener]);

    return { tarea, iniciando, iniciar, cerrar };
}
