// Piezas visuales propias de Formularios PAC, sobre el sistema DV-UI (estilos en ../formularios/formularios.css).
import '../formularios/formularios.css';
import './formularios-pac.css';
import { infoEstadoPac, ACCION_PAC_INFO } from './sharedPac';

/** Bandeja de una ficha PAC: chip neutro con punto del color de la bandeja. */
export function EstadoPacChip({ codigo }) {
    const info = infoEstadoPac(codigo);
    return (
        <span className="dv-chip frm-chip-neutral" title={`${info.nombre}${info.detalle ? ` — ${info.detalle}` : ''}`}>
            <span className="dv-chip__dot" style={{ color: info.color }} />
            {codigo || '—'}
        </span>
    );
}

/** Acción de la ficha: Nuevo / Modificar / Eliminar. */
export function AccionPacChip({ accion }) {
    if (!accion) return <span className="frm-muted">—</span>;
    const info = ACCION_PAC_INFO[accion] || { variante: 'draft', detalle: '' };
    return <span className={`dv-chip dv-chip--${info.variante}`} title={info.detalle}>{accion}</span>;
}

/** Barra horizontal de una serie ordenada. `onClick` la vuelve un filtro. */
export function BarraPac({ etiqueta, valor, texto, sub, maximo, color, activa, onClick, titulo }) {
    const ancho = maximo ? Math.max(0, Math.min(100, (Math.abs(valor) / maximo) * 100)) : 0;
    const Cuerpo = onClick ? 'button' : 'div';
    return (
        <Cuerpo className={`pac-bar${activa ? ' is-active' : ''}`} {...(onClick ? { type: 'button', onClick } : {})}
                title={titulo || etiqueta} style={color ? { '--bar-color': color } : undefined}>
            <span className="pac-bar__label">{etiqueta}</span>
            <span className="pac-bar__track"><span className="pac-bar__fill" style={{ width: `${ancho}%` }} /></span>
            <span className="pac-bar__value">{texto}{sub && <small>{sub}</small>}</span>
        </Cuerpo>
    );
}
