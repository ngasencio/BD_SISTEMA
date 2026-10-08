// Jerarquía institucional (Subdirección → Departamento → Sub-departamento) y ranking de usuarios requirentes.
import { useMemo, useState } from 'react';
import '../formularios.css';
import { fmtCLP, fmtN } from '../shared';
import { NotaChip } from './Graficos';
import { filasJerarquia } from './logica';

export function JerarquiaTabla({ jerarquia, onSeleccionar, claveSeleccionada }) {
    const [expandidas, setExpandidas] = useState(new Set());
    const alternar = (clave) => setExpandidas((prev) => {
        const next = new Set(prev);
        if (next.has(clave)) next.delete(clave); else next.add(clave);
        return next;
    });
    const filas = useMemo(() => filasJerarquia(jerarquia, expandidas), [jerarquia, expandidas]);

    if (!filas.length) return <div className="frm-note" style={{ textAlign: 'center' }}>Sin datos para el período seleccionado.</div>;

    return (
        <div className="frm-table-wrap">
            <table className="dv-table frm-table">
                <thead>
                    <tr>
                        <th>Unidad</th>
                        <th className="is-num">Total</th>
                        <th className="is-num">Dentro del PAC</th>
                        <th className="is-num">Monto dentro</th>
                        <th className="is-center">Nota</th>
                        <th className="is-center"><span className="frm-sr">Analizar</span></th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f) => {
                        const activa = claveSeleccionada === f.clave;
                        const abierta = expandidas.has(f.clave);
                        return (
                            <tr key={f.clave} className={`${f.expandible ? 'is-expandable' : ''}${activa ? ' is-selected' : ''}`}
                                onClick={f.expandible ? () => alternar(f.clave) : undefined}>
                                <td style={{ paddingLeft: `calc(var(--dv-sp-5) + ${f.nivel * 24}px)` }}>
                                    <span className={`frm-tree__name${f.nivel === 0 ? ' frm-tree__name--root' : ''}`}>
                                        {f.expandible ? <span className={`frm-caret${abierta ? ' is-open' : ''}`} aria-hidden="true">▶</span> : <span style={{ width: 12, display: 'inline-block' }} />}
                                        {f.nombre}
                                        {f.detalle && <small>({f.detalle})</small>}
                                    </span>
                                </td>
                                <td className="is-num">{fmtN(f.m.total)}</td>
                                <td className="is-num is-nowrap">
                                    {fmtN(f.m.dentro)} <span className="frm-muted">({f.m.pct_dentro}%)</span>
                                    <span className="frm-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, f.m.pct_dentro || 0)}%` }} /></span>
                                </td>
                                <td className="is-num is-nowrap">{fmtCLP(f.m.monto_dentro)}</td>
                                <td className="is-center"><NotaChip nota={f.m.nota} /></td>
                                <td className="is-center">
                                    <button type="button" className={`dv-btn frm-btn-ver${activa ? ' dv-btn--primary' : ''}`}
                                            title="Filtrar el ranking y los formularios de abajo por esta unidad"
                                            onClick={(e) => { e.stopPropagation(); onSeleccionar({ clave: f.clave, label: f.nombre, ...f.alcance }); }}>
                                        {activa ? 'Analizando' : 'Analizar'}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function RankingUsuarios({ usuarios }) {
    const [mostrarTodos, setMostrarTodos] = useState(false);
    if (!usuarios?.usuarios?.length) return <div className="frm-note" style={{ textAlign: 'center' }}>Sin usuarios requirentes para el período seleccionado.</div>;
    const filas = mostrarTodos ? usuarios.usuarios : usuarios.usuarios.slice(0, 15);

    return (
        <>
            <div className="frm-table-wrap">
                <table className="dv-table frm-table">
                    <thead>
                        <tr>
                            <th>Usuario requirente</th>
                            <th className="is-num">Total</th>
                            <th className="is-num">% Dentro (cantidad)</th>
                            <th className="is-num">% Dentro (monto)</th>
                            <th className="is-center">Nota</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((u) => (
                            <tr key={u.usuario_requirente} className={u.muestra_insuficiente ? 'is-muted' : ''}>
                                <td className="is-strong">
                                    {u.usuario_requirente}
                                    {u.muestra_insuficiente && <span className="frm-sub" style={{ display: 'inline', marginLeft: 'var(--dv-sp-3)' }}>muestra baja</span>}
                                </td>
                                <td className="is-num">{fmtN(u.total)}</td>
                                <td className="is-num">{u.pct_dentro_cantidad}%</td>
                                <td className="is-num">{u.pct_dentro_monto}%</td>
                                <td className="is-center"><NotaChip nota={u.nota} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {usuarios.usuarios.length > 15 && (
                <div style={{ textAlign: 'center', marginTop: 'var(--dv-sp-4)' }}>
                    <button type="button" className="dv-btn" onClick={() => setMostrarTodos((m) => !m)}>
                        {mostrarTodos ? 'Ver menos' : `Ver los ${usuarios.usuarios.length} usuarios`}
                    </button>
                </div>
            )}
        </>
    );
}
