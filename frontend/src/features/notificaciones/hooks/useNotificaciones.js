import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../store/authStore';
import { getNoLeidas, getNotificaciones, marcarLeida, marcarTodasLeidas } from '../api/notificacionesApi';

const INTERVALO_POLLING_MS = 25000;

// Campanita global (Topbar): solo el contador se consulta por polling —
// liviano, una query indexada (idx_compras_notif_dest_leida). La lista
// completa se trae recién al abrir el dropdown, no en cada tick.
export function useNotificaciones() {
    const { isAuthenticated } = useAuth();
    const [count, setCount] = useState(0);
    const [notificaciones, setNotificaciones] = useState([]);
    const [abierto, setAbierto] = useState(false);
    const [cargando, setCargando] = useState(false);
    const intervalRef = useRef(null);

    const refrescarContador = useCallback(() => {
        getNoLeidas()
            .then(({ data }) => setCount(data.count ?? 0))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            setCount(0);
            return undefined;
        }
        refrescarContador();
        intervalRef.current = setInterval(refrescarContador, INTERVALO_POLLING_MS);
        return () => clearInterval(intervalRef.current);
    }, [isAuthenticated, refrescarContador]);

    const abrir = useCallback(() => {
        setAbierto(true);
        setCargando(true);
        getNotificaciones()
            .then(({ data }) => setNotificaciones(data))
            .catch(() => setNotificaciones([]))
            .finally(() => setCargando(false));
    }, []);

    const cerrar = useCallback(() => setAbierto(false), []);

    const onMarcarLeida = useCallback((id) => {
        marcarLeida(id).then(() => {
            setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
            refrescarContador();
        }).catch(() => {});
    }, [refrescarContador]);

    const onMarcarTodasLeidas = useCallback(() => {
        marcarTodasLeidas().then(() => {
            setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
            setCount(0);
        }).catch(() => {});
    }, []);

    return { count, notificaciones, abierto, cargando, abrir, cerrar, onMarcarLeida, onMarcarTodasLeidas };
}
