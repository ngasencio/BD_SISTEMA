// Las tres vistas del Historial de Compras: repeticiones de productos, mapa de calor anual y detalle por solicitud.
// Todas reciben los FSC ya filtrados (con su carro embebido) y piden abrir la ficha mediante `onVerFSC(id)`.
import { Fragment, useEffect, useMemo, useState } from 'react';
import './formularios.css';
import { fmtCLP, fmtFecha, fmtN } from './shared';
import { Chip, EstadoChip, FiltroChip } from './ui';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const Caret = ({ abierto }) => <span className={`frm-caret${abierto ? ' is-open' : ''}`} aria-hidden="true">▶</span>;

const BotonVer = ({ id, onVerFSC, detenerPropagacion }) => (
    <button type="button" className="dv-btn frm-btn-ver" title="Ver la ficha completa del formulario"
            onClick={(e) => { if (detenerPropagacion) e.stopPropagation(); onVerFSC?.(id); }}>
        Ver
    </button>
);

const Vacio = ({ children }) => <div className="frm-note" style={{ textAlign: 'center' }}>{children}</div>;

/** Cifra clave sobre las vistas (misma pieza que el resumen de la ficha). */
export function Cifra({ label, valor, hint }) {
    return (
        <div className="frm-stat">
            <div className="frm-stat__label">{label}</div>
            <div className="frm-stat__value">{valor}</div>
            {hint && <div className="frm-stat__hint">{hint}</div>}
        </div>
    );
}

// ─── Tabla anidada: formularios que comparten un producto / ítem / mes ───────

function TablaFscAnidada({ filas, conMontos, onVerFSC }) {
    return (
        <table className="dv-table frm-table frm-nested">
            <thead>
                <tr>
                    <th>ID</th><th>Fecha</th><th>Bandeja</th><th>Unidad</th><th>Usuario</th>
                    {conMontos && <><th className="is-num">Cantidad</th><th className="is-num">Monto</th></>}
                    <th className="is-center"><span className="frm-sr">Ficha</span></th>
                </tr>
            </thead>
            <tbody>
                {filas.map((s, j) => (
                    <tr key={`${s.id}-${j}`}>
                        <td className="is-nowrap"><span className="frm-id">{s.idf || `#${s.folio}`}</span></td>
                        <td className="is-nowrap">{fmtFecha(s.fecha)}</td>
                        <td><EstadoChip codigo={s.estado} /></td>
                        <td><div className="frm-trunc" title={s.unidad}>{s.unidad || '—'}</div></td>
                        <td><div className="frm-trunc frm-trunc--sm" title={s.usuario}>{s.usuario || '—'}</div></td>
                        {conMontos && <><td className="is-num">{fmtN(s.cantidad)}</td><td className="is-num is-nowrap">{fmtCLP(s.monto)}</td></>}
                        <td className="is-center"><BotonVer id={s.id} onVerFSC={onVerFSC} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Vista A — Distribución anual (mapa de calor ítem × mes) ─────────────────

export function SubTabPivote({ datos, onVerFSC }) {
    const [agruparPor, setAgruparPor] = useState('item');
    const [metrica, setMetrica] = useState('monto');
    const [celdaExpandida, setCeldaExpandida] = useState(null);

    // Estructura independiente de la métrica: recalcular solo al cambiar datos o agrupación.
    const pivotBase = useMemo(() => {
        const map = {};
        datos.forEach((fsc) => {
            const partes = (fsc.fecha_solicitud || '').split('-');
            const mes = partes.length === 3 ? parseInt(partes[1], 10) - 1 : null;
            if (mes === null || mes < 0 || mes > 11) return;
            fsc.productos.forEach((p) => {
                const rowKey = agruparPor === 'item' ? (p.item_presupuestario || '(Sin ítem)')
                    : agruparPor === 'categoria' ? (p.categoria || '(Sin categoría)')
                        : (p.producto || '(Sin nombre)');
                if (!map[rowKey]) {
                    map[rowKey] = {
                        key: rowKey, meses_monto: Array(12).fill(0), meses_cantidad: Array(12).fill(0), meses_count: Array(12).fill(0),
                        meses_fscs: Array.from({ length: 12 }, () => new Map()), total_monto: 0, total_cantidad: 0, total_count: 0,
                    };
                }
                const fila = map[rowKey];
                fila.meses_monto[mes] += p.monto ?? 0;
                fila.meses_cantidad[mes] += p.cantidad ?? 0;
                fila.meses_count[mes] += 1;
                fila.total_monto += p.monto ?? 0;
                fila.total_cantidad += p.cantidad ?? 0;
                fila.total_count += 1;
                if (!fila.meses_fscs[mes].has(fsc.id)) {
                    fila.meses_fscs[mes].set(fsc.id, {
                        id: fsc.id, idf: fsc.id_formulario, folio: fsc.folio, anho: fsc.anho, estado: fsc.estado,
                        unidad: fsc.unidad_requirente, usuario: fsc.usuario_requirente, fecha: fsc.fecha_solicitud,
                    });
                }
            });
        });
        return Object.values(map).sort((a, b) => b.total_monto - a.total_monto);
    }, [datos, agruparPor]);

    const pivot = useMemo(() => pivotBase.map((row) => ({
        ...row,
        meses: metrica === 'monto' ? row.meses_monto : metrica === 'cantidad' ? row.meses_cantidad : row.meses_count,
    })), [pivotBase, metrica]);

    useEffect(() => { setCeldaExpandida(null); }, [pivotBase]);

    const maxCell = useMemo(() => Math.max(...pivot.flatMap((r) => r.meses), 1), [pivot]);
    const fondo = (val) => (val ? `color-mix(in srgb, var(--dv-primary) ${Math.round(8 + (val / maxCell) * 62)}%, var(--dv-surface))` : undefined);
    const texto = (val) => {
        if (!val) return '—';
        if (metrica === 'monto') return val >= 1_000_000 ? `${(val / 1_000_000).toFixed(1)}M` : val >= 1_000 ? `${(val / 1_000).toFixed(0)}K` : fmtN(val);
        return fmtN(val);
    };
    const total = (r) => (metrica === 'monto' ? fmtCLP(r.total_monto) : metrica === 'cantidad' ? fmtN(r.total_cantidad) : fmtN(r.total_count));
    const alternarCelda = (rowKey, mesIdx, val) => {
        if (!val) return;
        setCeldaExpandida((old) => (old?.rowKey === rowKey && old?.mesIdx === mesIdx ? null : { rowKey, mesIdx }));
    };
    const etiquetaFila = agruparPor === 'item' ? 'Ítem presupuestario' : agruparPor === 'categoria' ? 'Categoría' : 'Producto';

    return (
        <>
            <div className="frm-controls">
                <span className="frm-controls__label">Agrupar por</span>
                {[{ id: 'item', label: 'Ítem presupuestario' }, { id: 'categoria', label: 'Categoría' }, { id: 'producto', label: 'Producto' }].map((o) => (
                    <FiltroChip key={o.id} activo={agruparPor === o.id} onClick={() => setAgruparPor(o.id)}>{o.label}</FiltroChip>
                ))}
                <span className="frm-controls__label" style={{ marginLeft: 'var(--dv-sp-4)' }}>Métrica</span>
                {[{ id: 'monto', label: 'Monto ($)' }, { id: 'cantidad', label: 'Cantidad' }, { id: 'count', label: 'N° de FSC' }].map((o) => (
                    <FiltroChip key={o.id} activo={metrica === o.id} onClick={() => setMetrica(o.id)}>{o.label}</FiltroChip>
                ))}
                {celdaExpandida && (
                    <div className="frm-controls__end">
                        <button type="button" className="dv-btn" onClick={() => setCeldaExpandida(null)}>Cerrar detalle</button>
                    </div>
                )}
            </div>

            {pivot.length === 0 ? <Vacio>Sin datos con los filtros seleccionados.</Vacio> : (
                <>
                    <div className="frm-table-wrap">
                        <table className="dv-table frm-table frm-heat">
                            <thead>
                                <tr>
                                    <th className="frm-heat__first">{etiquetaFila}</th>
                                    {MESES.map((m) => <th key={m} className="is-center">{m}</th>)}
                                    <th className="is-num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pivot.map((row) => {
                                    const abierta = celdaExpandida?.rowKey === row.key;
                                    const fscs = abierta ? [...row.meses_fscs[celdaExpandida.mesIdx].values()] : [];
                                    return (
                                        <Fragment key={row.key}>
                                            <tr className={abierta ? 'is-open' : ''}>
                                                <td className="frm-heat__first"><div className="frm-trunc" title={row.key}>{row.key}</div></td>
                                                {row.meses.map((val, mi) => {
                                                    const activa = abierta && celdaExpandida.mesIdx === mi;
                                                    return (
                                                        <td key={mi} onClick={() => alternarCelda(row.key, mi, val)}
                                                            className={`frm-heat__cell${val ? ' is-clickable' : ' is-empty'}${activa ? ' is-active' : ''}`}
                                                            style={{ background: fondo(val), color: val && val / maxCell > 0.55 ? '#fff' : undefined }}
                                                            title={val ? `${MESES[mi]}: ${texto(val)} — clic para ver los formularios` : undefined}>
                                                            {texto(val)}
                                                        </td>
                                                    );
                                                })}
                                                <td className="frm-heat__total">{total(row)}</td>
                                            </tr>
                                            {abierta && (
                                                <tr className="frm-subrow">
                                                    <td colSpan={14}>
                                                        <div className="frm-subrow__inner" style={{ paddingLeft: 'var(--dv-sp-7)' }}>
                                                            <div className="dv-eyebrow frm-subrow__title" style={{ color: 'var(--dv-primary)' }}>
                                                                {MESES[celdaExpandida.mesIdx]} — {fscs.length} formulario(s) con «{row.key}»
                                                            </div>
                                                            {fscs.length === 0 ? <span className="frm-muted">Sin formularios.</span>
                                                                : <TablaFscAnidada filas={fscs} onVerFSC={onVerFSC} />}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="frm-heat__legend">
                        <span>Menor</span><span className="frm-heat__ramp" /><span>Mayor concentración</span>
                        <span style={{ marginLeft: 'auto' }}>Haz clic en una celda para ver los formularios de ese mes.</span>
                    </div>
                </>
            )}
        </>
    );
}

// ─── Vista B — Repeticiones de productos ─────────────────────────────────────

export function SubTabRepeticiones({ datos, onVerFSC }) {
    const [expandido, setExpandido] = useState(null);
    const [soloRepetidos, setSoloRepetidos] = useState(false);

    const agrupados = useMemo(() => {
        const map = {};
        datos.forEach((fsc) => {
            fsc.productos.forEach((p) => {
                const key = `${p.item_presupuestario}‖${p.producto}`;
                if (!map[key]) map[key] = { key, producto: p.producto, categoria: p.categoria, item_presupuestario: p.item_presupuestario, total_cantidad: 0, total_monto: 0, solicitudes: [] };
                map[key].total_cantidad += p.cantidad;
                map[key].total_monto += p.monto;
                map[key].solicitudes.push({
                    id: fsc.id, idf: fsc.id_formulario, folio: fsc.folio, anho: fsc.anho, unidad: fsc.unidad_requirente,
                    usuario: fsc.usuario_requirente, fecha: fsc.fecha_solicitud, estado: fsc.estado, cantidad: p.cantidad, monto: p.monto,
                });
            });
        });
        return Object.values(map).sort((a, b) => b.solicitudes.length - a.solicitudes.length || b.total_monto - a.total_monto);
    }, [datos]);

    const items = soloRepetidos ? agrupados.filter((a) => a.solicitudes.length > 1) : agrupados;
    const repetidos = agrupados.filter((a) => a.solicitudes.length > 1).length;
    const totalMonto = agrupados.reduce((s, a) => s + a.total_monto, 0);

    return (
        <>
            <div className="frm-stats">
                <Cifra label="Productos únicos" valor={fmtN(agrupados.length)} />
                <Cifra label="Con repeticiones" valor={fmtN(repetidos)} hint="Pedidos en más de un formulario" />
                <Cifra label="Solicitudes" valor={fmtN(datos.length)} />
                <Cifra label="Monto total" valor={fmtCLP(totalMonto)} />
            </div>
            <div className="frm-controls">
                <label className="frm-check">
                    <input type="checkbox" checked={soloRepetidos} onChange={(e) => setSoloRepetidos(e.target.checked)} />
                    Mostrar solo los repetidos ({repetidos})
                </label>
            </div>
            <div className="frm-table-wrap">
                <table className="dv-table frm-table">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }} />
                            <th>Ítem presupuestario</th>
                            <th>Producto</th>
                            <th>Categoría</th>
                            <th className="is-center">Solicitudes</th>
                            <th className="is-num">Cantidad total</th>
                            <th className="is-num">Monto total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && <tr><td colSpan={7} className="frm-state">Sin productos.</td></tr>}
                        {items.map((item) => {
                            const dup = item.solicitudes.length > 1;
                            const abierto = expandido === item.key;
                            return (
                                <Fragment key={item.key}>
                                    <tr className={`is-expandable${abierto ? ' is-open' : ''}`} onClick={() => setExpandido(abierto ? null : item.key)}>
                                        <td className="is-center"><Caret abierto={abierto} /></td>
                                        <td className={item.item_presupuestario ? 'is-strong' : ''}>{item.item_presupuestario || <span className="frm-muted">—</span>}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--dv-sp-3)' }}>
                                                {dup && <Chip variante="warn" title="Producto pedido en más de un formulario">× {item.solicitudes.length}</Chip>}
                                                <span className="frm-trunc" title={item.producto}>{item.producto || '—'}</span>
                                            </div>
                                        </td>
                                        <td>{item.categoria || '—'}</td>
                                        <td className="is-center"><Chip variante={dup ? 'warn' : 'ok'}>{item.solicitudes.length}</Chip></td>
                                        <td className="is-num">{fmtN(item.total_cantidad)}</td>
                                        <td className="is-num is-strong is-nowrap">{fmtCLP(item.total_monto)}</td>
                                    </tr>
                                    {abierto && (
                                        <tr className="frm-subrow">
                                            <td colSpan={7}>
                                                <div className="frm-subrow__inner">
                                                    <div className="dv-eyebrow frm-subrow__title" style={{ color: 'var(--dv-primary)' }}>Formularios que incluyen este producto</div>
                                                    <TablaFscAnidada filas={item.solicitudes} conMontos onVerFSC={onVerFSC} />
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ─── Vista C — Por solicitud ─────────────────────────────────────────────────

export function SubTabCronologico({ datos, onVerFSC }) {
    const [expandido, setExpandido] = useState(null);
    if (datos.length === 0) return <Vacio>Sin solicitudes con los filtros seleccionados.</Vacio>;

    return (
        <div className="frm-table-wrap">
            <table className="dv-table frm-table">
                <thead>
                    <tr>
                        <th style={{ width: 28 }} />
                        <th>ID</th>
                        <th>Solicitud</th>
                        <th>Bandeja</th>
                        <th>Unidad requirente</th>
                        <th>Usuario</th>
                        <th>Requerimiento</th>
                        <th className="is-center">Productos</th>
                        <th className="is-num">Monto estimado</th>
                        <th className="is-center"><span className="frm-sr">Ficha</span></th>
                    </tr>
                </thead>
                <tbody>
                    {datos.map((fsc) => {
                        const abierto = expandido === fsc.id;
                        return (
                            <Fragment key={fsc.id}>
                                <tr className={`is-expandable${abierto ? ' is-open' : ''}`} onClick={() => setExpandido(abierto ? null : fsc.id)}>
                                    <td className="is-center"><Caret abierto={abierto} /></td>
                                    <td className="is-nowrap"><span className="frm-id">{fsc.id_formulario || `#${fsc.folio}`}</span></td>
                                    <td className="is-nowrap">{fmtFecha(fsc.fecha_solicitud)}</td>
                                    <td><EstadoChip codigo={fsc.estado} /></td>
                                    <td><div className="frm-trunc" title={fsc.unidad_requirente}>{fsc.unidad_requirente || '—'}</div></td>
                                    <td><div className="frm-trunc frm-trunc--sm" title={fsc.usuario_requirente}>{fsc.usuario_requirente || '—'}</div></td>
                                    <td><div className="frm-clamp" title={fsc.requerimiento}>{fsc.requerimiento || '—'}</div></td>
                                    <td className="is-center">{fsc.productos.length > 0 ? fsc.productos.length : <span className="frm-muted">—</span>}</td>
                                    <td className="is-num is-strong is-nowrap">{fmtCLP(fsc.monto_estimado)}</td>
                                    <td className="is-center"><BotonVer id={fsc.id} onVerFSC={onVerFSC} detenerPropagacion /></td>
                                </tr>
                                {abierto && (
                                    <tr className="frm-subrow">
                                        <td colSpan={10}>
                                            <div className="frm-subrow__inner">
                                                {fsc.productos.length === 0 ? (
                                                    <span className="frm-muted">Este formulario no registra productos en el carro.</span>
                                                ) : (
                                                    <>
                                                        <div className="dv-eyebrow frm-subrow__title" style={{ color: 'var(--dv-primary)' }}>Productos en el carro ({fsc.productos.length})</div>
                                                        <table className="dv-table frm-table frm-nested">
                                                            <thead>
                                                                <tr>
                                                                    <th>Categoría</th><th>Producto</th><th>Descripción</th>
                                                                    <th className="is-num">Cant.</th><th className="is-num">Monto</th><th>Ítem presupuestario</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {fsc.productos.map((p, j) => (
                                                                    <tr key={j}>
                                                                        <td>{p.categoria || '—'}</td>
                                                                        <td className="is-strong">{p.producto || '—'}</td>
                                                                        <td><div className="frm-trunc" title={p.descripcion}>{p.descripcion || '—'}</div></td>
                                                                        <td className="is-num">{fmtN(p.cantidad)}</td>
                                                                        <td className="is-num is-nowrap">{fmtCLP(p.monto)}</td>
                                                                        <td>{p.item_presupuestario || <Chip variante="warn">Sin ítem</Chip>}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
