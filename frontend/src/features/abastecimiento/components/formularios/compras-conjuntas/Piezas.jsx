// Piezas compartidas por las vistas de Compras Conjuntas.
import '../formularios.css';
import { fmtCLP } from '../shared';
import { EstadoChip } from '../ui';
import { colorEstado } from './jerarquia';

/** Formulario resumido (ID, bandeja, unidad y monto). `onClickNodo(fsc)` abre la ficha. */
export function FscMini({ fsc, onClickNodo }) {
    return (
        <button type="button" className="frm-fsc" style={{ '--fsc-color': colorEstado(fsc.estado) }} onClick={() => onClickNodo?.(fsc)}
                title="Ver la ficha completa del formulario">
            <div className="frm-fsc__top">
                <span className="frm-id">{fsc.id_formulario || `#${fsc.folio}`}</span>
                <EstadoChip codigo={fsc.estado} />
            </div>
            <div className="frm-fsc__unit" title={fsc.unidad_requirente}>{fsc.unidad_requirente}</div>
            <div className="frm-fsc__money">{fmtCLP(fsc.monto_estimado)}</div>
        </button>
    );
}

/** Columna de una vista en cascada. `activa=false` la atenúa y muestra `pista`. */
export function Columna({ titulo, activa = true, pista, vacio = 'Sin elementos', alturaMax, children, ancho }) {
    const hayHijos = Array.isArray(children) ? children.length > 0 : Boolean(children);
    return (
        <div className={`frm-col${activa ? '' : ' is-inactive'}`} style={ancho ? { maxWidth: ancho } : undefined}>
            <div className="frm-col__head">{titulo}</div>
            <div className="frm-col__body" style={alturaMax ? { maxHeight: alturaMax } : undefined}>
                {!activa ? <div className="frm-col__empty">{pista}</div>
                    : !hayHijos ? <div className="frm-col__empty">{vacio}</div>
                        : children}
            </div>
        </div>
    );
}

export const Flecha = () => <div className="frm-arrow" aria-hidden="true">›</div>;

/** Puntos de color por bandeja (resumen visual de `estados`). */
export function PuntosEstado({ estados }) {
    const lista = Object.entries(estados || {});
    if (!lista.length) return null;
    return (
        <div className="frm-dots">
            {lista.map(([est, n]) => <i key={est} style={{ background: colorEstado(est) }} title={`${est}: ${n}`} />)}
        </div>
    );
}
