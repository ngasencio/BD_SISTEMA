// Panel lateral de sugerencias (grupos por ítem) y tarjetas por categoría de producto.
import '../formularios.css';
import { fmtCLP } from '../shared';
import { Chip } from '../ui';
import { colorEstado } from './jerarquia';

export function SidebarGrupos({ grupos, grupoResaltado, onSelect }) {
    if (!grupos?.length) return <div className="frm-col__empty">Sin grupos para este año.</div>;
    return (
        <>
            {grupos.map((gi) => {
                const activo = grupoResaltado === gi.item_presupuestario;
                const partes = gi.item_presupuestario.split(' - ');
                const codigo = partes[0];
                const nombre = partes.slice(1).join(' - ') || gi.item_presupuestario;
                return (
                    <button key={gi.item_presupuestario} type="button" className={`frm-group${activo ? ' is-active' : ''}`}
                            aria-pressed={activo} onClick={() => onSelect(activo ? null : gi.item_presupuestario)}>
                        <div className="frm-group__top">
                            <span className="frm-id">{codigo}</span>
                            <span className="frm-group__count">{gi.n_formularios} FSC</span>
                        </div>
                        <div className="frm-group__name">{nombre}</div>
                        <div className="frm-group__money">{fmtCLP(gi.monto_total)}</div>
                        <div className="frm-chips">
                            {Object.entries(gi.estados || {}).map(([estado, n]) => (
                                <span key={estado} className="dv-chip frm-chip-neutral">
                                    <span className="dv-chip__dot" style={{ color: colorEstado(estado) }} />{estado} <b>×{n}</b>
                                </span>
                            ))}
                        </div>
                    </button>
                );
            })}
        </>
    );
}

export function CardsCategoria({ grupos }) {
    if (!grupos?.length) return null;
    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head">
                <h2 className="frm-panel__title">Segunda capa: similitud por categoría de productos</h2>
                <span className="frm-panel__note">Categorías que piden dos o más formularios en camino.</span>
            </div>
            <div className="frm-panel__body">
                <div className="frm-catcards">
                    {grupos.map((g) => (
                        <div key={g.categoria} className="frm-catcard">
                            <div className="frm-catcard__name">{g.categoria}</div>
                            <div className="frm-catcard__value">{g.n_formularios}</div>
                            <div className="frm-catcard__meta">formularios</div>
                            <Chip variante="none">{fmtCLP(g.monto_total)}</Chip>
                            <div className="frm-dots">
                                {[...new Set((g.formularios || []).map((f) => f.estado))].map((e) => (
                                    <i key={e} style={{ background: colorEstado(e) }} title={e} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
