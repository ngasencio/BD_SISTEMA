import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useAnexo1Fetch } from '../hooks/useAnexo1Fetch';
import { fetchSerieNivel1Anexo1 } from '../api/anexo1SigfeApi';
import { formatearPeriodo } from './MatrizEstadoBD';
import { buildTree, nombreSinCodigo } from './tabs/detallado/buildTree';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

function NodoArbol({ nodo, expandidos, toggleExpand, seleccionado, onSeleccionar }) {
    const tieneHijos = nodo.hijos.length > 0;
    const expandido = expandidos.has(nodo.codigo);
    const activo = seleccionado === nodo.codigo;
    const nombre = nombreSinCodigo(nodo[`n${nodo.nivel}_desc`], nodo.codigo) || nodo.nombre;

    return (
        <div className={`tree-node n${nodo.nivel}`}>
            <div
                className={`tree-hd ${activo ? 'active' : ''}`}
                onClick={() => onSeleccionar(nodo.codigo)}
                data-tip={`Devengado ${fmtMoney(nodo.total)} · Efectivo ${fmtMoney(nodo.total_efectivo)} — click para graficar la serie mensual`}
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
                <span className="tree-amt">{fmtMoney(nodo.total)}</span>
            </div>
            {expandido && tieneHijos && (
                <div>
                    {nodo.hijos.map((h) => (
                        <NodoArbol
                            key={h.codigo} nodo={h} expandidos={expandidos} toggleExpand={toggleExpand}
                            seleccionado={seleccionado} onSeleccionar={onSeleccionar}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function EstablecimientoSerieNivel1({ codigoUe, nombre, onClose }) {
    const { data, loading, error } = useAnexo1Fetch(
        fetchSerieNivel1Anexo1,
        { ue: codigoUe, excluir_34_35: true },
        0,
        'No se pudo cargar la serie de gasto Nivel 1.',
    );

    const [expandidos, setExpandidos] = useState(() => new Set());
    const [seleccionado, setSeleccionado] = useState(null);

    const arbol = useMemo(() => buildTree(data?.por_concepto || []), [data]);
    const porCodigo = useMemo(() => new Map((data?.por_concepto || []).map((f) => [f.codigo, f])), [data]);
    const nodoSel = seleccionado ? porCodigo.get(seleccionado) : null;

    const toggleExpand = (codigo) => {
        setExpandidos((prev) => {
            const next = new Set(prev);
            next.has(codigo) ? next.delete(codigo) : next.add(codigo);
            return next;
        });
    };

    const chartData = useMemo(() => {
        if (!data?.periodos?.length) return null;
        const labels = data.periodos.map(formatearPeriodo);
        const dev = nodoSel ? nodoSel.valores : data.total.devengado;
        const efec = nodoSel ? nodoSel.valores_efectivo : data.total.efectivo;
        const sufijo = nodoSel ? `${nodoSel.codigo} ${nombreSinCodigo(nodoSel[`n${nodoSel.nivel}_desc`], nodoSel.codigo) || nodoSel.nombre}` : 'Total Nivel 1';
        return {
            labels,
            datasets: [
                {
                    label: `${sufijo} — Devengado`, data: dev.map((v) => v / 1e6),
                    borderColor: '#1e3a5f', backgroundColor: '#1e3a5f',
                    borderWidth: 2.5, pointRadius: 3, tension: 0.3,
                },
                {
                    label: `${sufijo} — Efectivo`, data: efec.map((v) => v / 1e6),
                    borderColor: '#16a34a', backgroundColor: '#16a34a',
                    borderWidth: 2, pointRadius: 3, tension: 0.3,
                },
            ],
        };
    }, [data, nodoSel]);

    if (!codigoUe) return null;

    return (
        <div style={{ borderTop: '1px solid var(--gob-gris2)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gob-azul)' }}>
                        📈 Gasto Nivel 1 — {nombre}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gob-gris4)' }}>
                        Devengado y Efectivo mensual. Desplegá el árbol de abajo y hacé clic en cualquier concepto para graficar su propia serie.
                    </div>
                </div>
                <button
                    onClick={onClose}
                    title="Cerrar detalle"
                    style={{
                        border: '1px solid var(--gob-gris3)', background: '#fff', color: 'var(--gob-gris4)',
                        borderRadius: 'var(--radius)', width: 26, height: 26, cursor: 'pointer', fontSize: 13,
                        lineHeight: 1,
                    }}
                >
                    ✕
                </button>
            </div>

            {loading && !data && <div className="loading-spinner">Cargando serie…</div>}
            {error && <div className="error-message">{error}</div>}

            {data && !data.periodos.length && !loading && (
                <div style={{ fontSize: 12, color: 'var(--gob-gris4)', padding: '8px 0' }}>
                    Este establecimiento no tiene datos de Nivel 1 cargados todavía.
                </div>
            )}

            {nodoSel && (
                <div className="analysis-context">
                    🔎 Analizando: {nodoSel.codigo} {nombreSinCodigo(nodoSel[`n${nodoSel.nivel}_desc`], nodoSel.codigo) || nodoSel.nombre}
                    <button onClick={() => setSeleccionado(null)} title="Volver al total">✕</button>
                </div>
            )}

            {chartData && (
                <div style={{ height: 260, marginBottom: 18 }}>
                    <Line
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'bottom' },
                                tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtMoney(c.parsed.y * 1e6)}` } },
                            },
                            scales: { y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            {arbol.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                    <div className="card" style={{ padding: '10px 8px', maxHeight: 420, overflowY: 'auto', minWidth: 320 }}>
                        {arbol.map((n) => (
                            <NodoArbol
                                key={n.codigo} nodo={n} expandidos={expandidos} toggleExpand={toggleExpand}
                                seleccionado={seleccionado} onSeleccionar={setSeleccionado}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
