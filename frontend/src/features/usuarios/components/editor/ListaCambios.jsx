import { ETIQUETAS_CAMPO } from '../../utils/organizacion';

const fmtFecha = (iso) => {
    try {
        return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
};

const fmtValor = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    return String(v);
};

/** Entradas de auditoría: quién, cuándo, qué campo y antes → después. */
export default function ListaCambios({ items, vacio = 'Sin cambios registrados.' }) {
    if (!items?.length) return <div className="ue-vacio">{vacio}</div>;
    return (
        <ul className="ue-historial">
            {items.map(item => (
                <li key={item.id} className="ue-historial-item">
                    <div className="ue-historial-cab">
                        <strong>{item.entidad_etiqueta}</strong>
                        {item.objeto_etiqueta ? <span> · {item.objeto_etiqueta}</span> : null}
                        <span className="ue-historial-meta">{fmtFecha(item.fecha)} · {item.actor || '—'}</span>
                    </div>
                    <ul className="ue-historial-campos">
                        {Object.entries(item.cambios || {}).map(([campo, par]) => (
                            <li key={campo}>
                                <span className="ue-campo">{ETIQUETAS_CAMPO[campo] || campo}</span>
                                <span className="ue-antes">{fmtValor(par?.[0])}</span>
                                <span className="ue-flecha">→</span>
                                <span className="ue-despues">{fmtValor(par?.[1])}</span>
                            </li>
                        ))}
                    </ul>
                </li>
            ))}
        </ul>
    );
}
