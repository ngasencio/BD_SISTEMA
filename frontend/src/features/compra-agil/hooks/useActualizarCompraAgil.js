import { useState, useEffect, useRef, useCallback } from 'react';
import { iniciarActualizacionCompraAgil, getEstadoActualizacionCompraAgil } from '../api/compraAgilApi';

const POLL_INTERVAL_MS = 3000;

/**
 * Gestiona el proceso ETL de actualización de Compra Ágil.
 *
 * Retorna:
 *   tarea       — estado actual: null | { status, paso, paso_desc, oc_encontradas, error, fecha_desde, fecha_hasta }
 *   iniciando   — true mientras se hace el POST inicial
 *   iniciar(fechaDesde, fechaHasta) — lanza el proceso
 *   cerrar()    — oculta el banner (solo cuando completado/error)
 */
export function useActualizarCompraAgil(onCompletado) {
    const [tarea, setTarea] = useState(null);
    const [iniciando, setIniciando] = useState(false);
    const pollRef = useRef(null);
    const taskIdRef = useRef(null);

    const detenerPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const iniciarPolling = useCallback((taskId) => {
        detenerPolling();
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await getEstadoActualizacionCompraAgil(taskId);
                setTarea(data);
                if (data.status === 'completado') {
                    detenerPolling();
                    if (onCompletado) onCompletado();
                } else if (data.status === 'error') {
                    detenerPolling();
                }
            } catch {
                // silencioso — el polling sigue
            }
        }, POLL_INTERVAL_MS);
    }, [detenerPolling, onCompletado]);

    const iniciar = useCallback(async (fechaDesde, fechaHasta) => {
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionCompraAgil(fechaDesde, fechaHasta);
            taskIdRef.current = data.task_id;
            setTarea({ status: 'iniciado', paso: 0, paso_desc: 'Iniciando...', fecha_desde: fechaDesde, fecha_hasta: fechaHasta, oc_encontradas: null, error: null });
            iniciarPolling(data.task_id);
        } catch (err) {
            const msg = err.response?.data?.error || 'No se pudo iniciar la actualización.';
            setTarea({ status: 'error', paso: 0, paso_desc: msg, error: msg });
        } finally {
            setIniciando(false);
        }
    }, [iniciarPolling]);

    const cerrar = useCallback(() => {
        detenerPolling();
        setTarea(null);
        taskIdRef.current = null;
    }, [detenerPolling]);

    // Limpieza al desmontar
    useEffect(() => () => detenerPolling(), [detenerPolling]);

    return { tarea, iniciando, iniciar, cerrar };
}
