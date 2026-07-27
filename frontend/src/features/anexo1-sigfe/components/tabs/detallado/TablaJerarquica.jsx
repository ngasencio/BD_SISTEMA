import React, { useMemo, useState } from 'react';
import { buildTree } from './buildTree';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const COLOR_ESTADO = { verde: '#16a34a', amarillo: '#ca8a04', rojo: '#dc2626' };

function Fila({ nodo, profundidad, expandidos, toggle }) {
    const tieneHijos = nodo.hijos.length > 0;
    const expandido = expandidos.has(nodo.codigo);

    return (
        <>
            <tr style={{ borderBottom: '1px solid #f1f5f9', background: nodo.es_categoria_especial ? '#fef9f0' : undefined }}>
                <td style={{ padding: '7px 12px', paddingLeft: 12 + profundidad * 18, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {tieneHijos ? (
                        <button onClick={() => toggle(nodo.codigo)} style={{ border: 'none', background: 'none', cursor: 'pointer', marginRight: 4, fontSize: 11 }}>
                            {expandido ? '▼' : '▶'}
                        </button>
                    ) : <span style={{ display: 'inline-block', width: 15 }} />}
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#1e3a5f', fontWeight: 700 }}>{nodo.codigo}</span>{' '}
                    {nodo.nombre}
                </td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right' }}>{nodo.pct_participacion != null ? fmtPct(nodo.pct_participacion) : '—'}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right' }}>{fmtMoney(nodo.ley)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right' }}>{fmtMoney(nodo.requerimiento)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right' }}>{fmtMoney(nodo.comprometido)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right' }}>{fmtMoney(nodo.devengado)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right' }}>{fmtMoney(nodo.efectivo)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right' }}>{fmtMoney(nodo.saldo_dev_efec)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', fontWeight: 600, color: nodo.pct_pago != null ? COLOR_ESTADO[nodo.estado_pct_pago] : undefined }}>{fmtPct(nodo.pct_pago)}</td>
                <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', fontWeight: 600, color: nodo.pct_ejecucion != null ? COLOR_ESTADO[nodo.estado_pct_ejecucion] : undefined }}>{fmtPct(nodo.pct_ejecucion)}</td>
            </tr>
            {expandido && nodo.hijos.map((h) => (
                <Fila key={h.codigo} nodo={h} profundidad={profundidad + 1} expandidos={expandidos} toggle={toggle} />
            ))}
        </>
    );
}

export default function TablaJerarquica({ filas }) {
    const [expandidos, setExpandidos] = useState(() => new Set());
    const arbol = useMemo(() => buildTree(filas), [filas]);

    const toggle = (codigo) => {
        setExpandidos((prev) => {
            const next = new Set(prev);
            next.has(codigo) ? next.delete(codigo) : next.add(codigo);
            return next;
        });
    };

    return (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                    <tr style={{ background: '#f8fafc' }}>
                        {['Concepto', '% Particip.', 'Ley', 'Requerimiento', 'Comprometido', 'Devengado', 'Efectivo', 'Saldo Dev-Efec', '% Pago', '% Ejecución'].map((h) => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {arbol.map((n) => (
                        <Fila key={n.codigo} nodo={n} profundidad={0} expandidos={expandidos} toggle={toggle} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
