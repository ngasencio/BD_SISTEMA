import React, { useMemo, useState } from 'react';
import { buildTree, nombreSinCodigo } from './buildTree';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const ESTADO_TAG = { verde: 'tag-verde', amarillo: 'tag-naranja', rojo: 'tag-rojo' };

function Nodo({ nodo, expandidos, toggleExpand, seleccionado, onSeleccionar }) {
    const tieneHijos = nodo.hijos.length > 0;
    const expandido = expandidos.has(nodo.codigo);
    const activo = seleccionado === nodo.codigo;
    const nombre = nombreSinCodigo(nodo[`n${nodo.nivel}_desc`], nodo.codigo) || nodo.nombre;

    return (
        <div className={`tree-node n${nodo.nivel}`}>
            <div
                className={`tree-hd ${activo ? 'active' : ''}`}
                onClick={() => onSeleccionar(nodo.codigo)}
                data-tip={`Devengado ${fmtMoney(nodo.devengado)} · Efectivo ${fmtMoney(nodo.efectivo)}${nodo.pct_pago != null ? ` · ${fmtPct(nodo.pct_pago)} pagado` : ''} — click para ver el detalle completo`}
            >
                {tieneHijos ? (
                    <span
                        className={`tree-expand ${expandido ? 'open' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleExpand(nodo.codigo); }}
                    >
                        ▶
                    </span>
                ) : <span style={{ width: 14, display: 'inline-block', flexShrink: 0 }} />}
                <span className="tree-code">{nodo.codigo}</span>
                <span className="tree-name">{nombre}</span>
                {nodo.pct_pago != null && (
                    <span className={`tag ${ESTADO_TAG[nodo.estado_pct_pago] || 'tag-gris'}`}>{fmtPct(nodo.pct_pago)}</span>
                )}
                <span className="tree-amt">{fmtMoney(nodo.devengado)}</span>
            </div>
            {expandido && tieneHijos && (
                <div>
                    {nodo.hijos.map((h) => (
                        <Nodo
                            key={h.codigo} nodo={h} expandidos={expandidos} toggleExpand={toggleExpand}
                            seleccionado={seleccionado} onSeleccionar={onSeleccionar}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function Breadcrumb({ nodo, onNavegar }) {
    const pasos = [];
    for (let n = 1; n <= nodo.nivel; n++) {
        const codigo = nodo[`n${n}_codigo`];
        if (!codigo) continue;
        const nombre = nombreSinCodigo(nodo[`n${n}_desc`], codigo) || codigo;
        pasos.push({ codigo, nombre, esUltimo: n === nodo.nivel });
    }
    return (
        <div className="breadcrumb">
            <span style={{ fontSize: 11.5, color: 'var(--gob-gris4)', marginRight: 2 }}>🔎 Analizando:</span>
            {pasos.map((p, i) => (
                <React.Fragment key={p.codigo}>
                    {i > 0 && <span className="breadcrumb-sep">›</span>}
                    <button
                        className={`breadcrumb-item ${p.esUltimo ? 'active' : ''}`}
                        onClick={() => !p.esUltimo && onNavegar(p.codigo)}
                    >
                        {p.nombre}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}

export default function TablaJerarquica({ filas }) {
    const [expandidos, setExpandidos] = useState(() => new Set());
    const [seleccionado, setSeleccionado] = useState(null);
    const arbol = useMemo(() => buildTree(filas), [filas]);
    const porCodigo = useMemo(() => new Map(filas.map((f) => [f.codigo, f])), [filas]);

    const toggleExpand = (codigo) => {
        setExpandidos((prev) => {
            const next = new Set(prev);
            next.has(codigo) ? next.delete(codigo) : next.add(codigo);
            return next;
        });
    };

    const nodoSel = seleccionado ? porCodigo.get(seleccionado) : null;

    return (
        <div>
            {nodoSel && <Breadcrumb nodo={nodoSel} onNavegar={setSeleccionado} />}

            <div className="card" style={{ padding: '10px 8px', maxHeight: 520, overflowY: 'auto' }}>
                {arbol.map((n) => (
                    <Nodo
                        key={n.codigo} nodo={n} expandidos={expandidos} toggleExpand={toggleExpand}
                        seleccionado={seleccionado} onSeleccionar={setSeleccionado}
                    />
                ))}
            </div>

            {nodoSel && (
                <div className="tree-detail">
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }}>
                        {nombreSinCodigo(nodoSel[`n${nodoSel.nivel}_desc`], nodoSel.codigo) || nodoSel.nombre}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                        <div className="tree-mini-kpi" data-tip="Monto anual asignado por la Ley de Presupuestos para este concepto.">
                            <div className="val">{fmtMoney(nodoSel.ley)}</div><div className="lbl">Ley</div>
                        </div>
                        <div className="tree-mini-kpi" data-tip="Gasto reconocido contablemente (devengado), acumulado en el período.">
                            <div className="val">{fmtMoney(nodoSel.devengado)}</div><div className="lbl">Devengado</div>
                        </div>
                        <div className="tree-mini-kpi" data-tip="Monto efectivamente pagado del devengado acumulado.">
                            <div className="val">{fmtMoney(nodoSel.efectivo)}</div><div className="lbl">Efectivo</div>
                        </div>
                        <div className="tree-mini-kpi" data-tip="Devengado menos Efectivo — obligaciones reconocidas y aún no pagadas.">
                            <div className="val">{fmtMoney(nodoSel.saldo_dev_efec)}</div><div className="lbl">Deuda Flotante</div>
                        </div>
                        <div className="tree-mini-kpi" data-tip="Efectivo sobre Devengado — qué proporción de lo devengado ya se pagó.">
                            <div className="val">{fmtPct(nodoSel.pct_pago)}</div><div className="lbl">% Pago</div>
                        </div>
                        <div className="tree-mini-kpi" data-tip="Devengado sobre Ley — solo disponible a nivel Subtítulo.">
                            <div className="val">{fmtPct(nodoSel.pct_ejecucion)}</div><div className="lbl">% Ejecución</div>
                        </div>
                        <div className="tree-mini-kpi" data-tip="Monto comprometido (orden de compra u obligación) aún no devengado.">
                            <div className="val">{fmtMoney(nodoSel.comprometido)}</div><div className="lbl">Comprometido</div>
                        </div>
                        <div className="tree-mini-kpi" data-tip="Requerimiento solicitado en el período.">
                            <div className="val">{fmtMoney(nodoSel.requerimiento)}</div><div className="lbl">Requerimiento</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
