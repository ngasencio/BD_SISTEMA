import { useEffect, useState } from 'react';
import { getHistorialUsuario } from '../../api/usuariosApi';
import ListaCambios from './ListaCambios';

/** Cambios administrativos hechos a esta cuenta. `version` cambia tras cada guardado. */
export default function SeccionHistorial({ userId, version }) {
    const [items, setItems]     = useState(null);
    const [error, setError]     = useState(null);

    useEffect(() => {
        let activo = true;
        setItems(null);
        setError(null);
        getHistorialUsuario(userId, { limite: 100 })
            .then(({ data }) => { if (activo) setItems(data); })
            .catch(err => { if (activo) setError(err.response?.data?.detail || 'No se pudo cargar el historial.'); });
        return () => { activo = false; };
    }, [userId, version]);

    return (
        <div>
            <div className="mu-section-label">Cambios hechos desde Gestión de Usuarios</div>
            {error && <div className="error-message">{error}</div>}
            {!error && items === null && <div className="ue-vacio">Cargando historial…</div>}
            {items && <ListaCambios items={items} vacio="Todavía no se ha modificado esta cuenta desde aquí." />}
        </div>
    );
}
