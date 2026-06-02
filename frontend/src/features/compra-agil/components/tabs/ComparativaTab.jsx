import React, { useState, useEffect, useMemo } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
    getCompraAgilComparativa,
    getCompraAgilClusters,
    getCompraAgilAsociaciones,
    getCompraAgilCandidatos,
} from '../../api/compraAgilApi';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat('es-CL').format(n || 0);

const COLORES_ANIO = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const NIVEL_COLOR = { Alto: '#22c55e', Medio: '#f59e0b', Bajo: '#9ca3af' };
const NIVEL_BG    = { Alto: '#dcfce7', Medio: '#fef9c3', Bajo: '#f3f4f6' };

// ── Helpers ──────────────────────────────────────────────────────────────────
function KpiEvolucion({ label, anios, campo, formato = 'numero' }) {
    if (!anios.length) return null;
    const ultimo = anios[anios.length - 1];
    const penultimo = anios.length >= 2 ? anios[anios.length - 2] : null;
    const valor = ultimo[campo] ?? 0;
    const anterior = penultimo ? (penultimo[campo] ?? 0) : null;
    const diff = anterior !== null && anterior !== 0
        ? ((valor - anterior) / Math.abs(anterior) * 100).toFixed(1)
        : null;
    const positivo = diff !== null ? parseFloat(diff) >= 0 : null;

    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 150px', minWidth: 140,
            borderTop: `4px solid ${positivo === false ? '#ef4444' : '#3b82f6'}`,
        }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
                {formato === 'moneda' ? fmt(valor) : formato === 'pct' ? `${valor}%` : fmtN(valor)}
            </div>
            {diff !== null && (
                <div style={{ fontSize: 11, marginTop: 4, color: positivo ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {positivo ? '▲' : '▼'} {Math.abs(diff)}% vs {penultimo.anio}
                </div>
            )}
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Año {ultimo.anio}</div>
        </div>
    );
}

function useSortable(data, defaultKey = '', dir = 'desc') {
    const [key, setKey] = useState(defaultKey);
    const [d, setD] = useState(dir);
    const sorted = useMemo(() => [...(data || [])].sort((a, b) => {
        const va = a[key], vb = b[key];
        if (va == null) return 1; if (vb == null) return -1;
        const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return d === 'asc' ? c : -c;
    }), [data, key, d]);
    const toggle = k => { if (key === k) setD(x => x === 'asc' ? 'desc' : 'asc'); else { setKey(k); setD('desc'); } };
    const arrow = k => key === k ? (d === 'asc' ? ' ▲' : ' ▼') : ' ↕';
    return { sorted, toggle, arrow };
}

// ── Bloque 1: KPIs y Gráfico YoY ─────────────────────────────────────────────
function BloqueEvolucionAnual({ anios }) {
    if (!anios.length) return <p style={{ color: '#94a3b8', padding: 16 }}>Sin datos de años.</p>;

    const barData = {
        labels: anios.map(a => a.anio),
        datasets: [
            { label: 'Total CAs', data: anios.map(a => a.total_ca), backgroundColor: 'rgba(59,130,246,0.7)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 },
            { label: 'Adjudicadas', data: anios.map(a => a.adjudicadas), backgroundColor: 'rgba(34,197,94,0.7)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 4 },
            { label: 'Desiertas', data: anios.map(a => a.desiertas), backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 },
        ],
    };

    const lineData = {
        labels: anios.map(a => a.anio),
        datasets: [
            { label: '% Ahorro', data: anios.map(a => a.pct_ahorro), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', tension: 0.4, fill: true, yAxisID: 'y' },
            { label: '% Adjudicación', data: anios.map(a => a.pct_adjudicacion), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.4, fill: false, yAxisID: 'y' },
            { label: 'Prom. cotizantes', data: anios.map(a => a.avg_cotizantes), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: false, yAxisID: 'y2' },
        ],
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <KpiEvolucion label="Total CAs" anios={anios} campo="total_ca" />
                <KpiEvolucion label="Adjudicadas" anios={anios} campo="adjudicadas" />
                <KpiEvolucion label="Monto OC" anios={anios} campo="monto_oc" formato="moneda" />
                <KpiEvolucion label="% Ahorro" anios={anios} campo="pct_ahorro" formato="pct" />
                <KpiEvolucion label="Proveedores únicos" anios={anios} campo="proveedores_unicos" />
                <KpiEvolucion label="Prom. cotizantes/CA" anios={anios} campo="avg_cotizantes" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="card">
                    <h3 className="card-title">CAs por Estado — Evolución</h3>
                    <div style={{ height: 220, position: 'relative' }}>
                        <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }} />
                    </div>
                </div>
                <div className="card">
                    <h3 className="card-title">Indicadores de Eficiencia Anual</h3>
                    <div style={{ height: 220, position: 'relative' }}>
                        <Line data={lineData} options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'top' } },
                            scales: {
                                y: { beginAtZero: true, ticks: { callback: v => `${v}%` } },
                                y2: { position: 'right', beginAtZero: true, ticks: { callback: v => `${v}x` }, grid: { drawOnChartArea: false } },
                            },
                        }} />
                    </div>
                </div>
            </div>
            <div className="card">
                <h3 className="card-title">Tabla Comparativa por Año</h3>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead><tr>
                            <th>Año</th><th>Total CAs</th><th>Adjudicadas</th><th>% Adj.</th>
                            <th>Desiertas</th><th>Presupuesto</th><th>Monto OC</th>
                            <th>Ahorro</th><th>% Ahorro</th><th>Proveedores</th><th>Prom. cotizantes</th>
                        </tr></thead>
                        <tbody>
                            {anios.map((a, i) => (
                                <tr key={a.anio} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                    <td style={{ fontWeight: 700, color: COLORES_ANIO[i % COLORES_ANIO.length] }}>{a.anio}</td>
                                    <td>{fmtN(a.total_ca)}</td>
                                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{fmtN(a.adjudicadas)}</td>
                                    <td>{a.pct_adjudicacion}%</td>
                                    <td style={{ color: '#dc2626' }}>{fmtN(a.desiertas)}</td>
                                    <td>{fmt(a.presupuesto)}</td>
                                    <td>{fmt(a.monto_oc)}</td>
                                    <td className="text-success">{fmt(a.ahorro)}</td>
                                    <td className="text-success">{a.pct_ahorro}%</td>
                                    <td>{fmtN(a.proveedores_unicos)}</td>
                                    <td>{a.avg_cotizantes}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ── Bloque 2: Heatmap mensual ─────────────────────────────────────────────────
function BloqueHeatmap({ porMesAnio }) {
    const anios = [...new Set(porMesAnio.map(m => m.anio))].sort();
    if (!anios.length) return <p style={{ color: '#94a3b8', padding: 16 }}>Sin datos mensuales.</p>;

    const getMes = (anio, mes) => porMesAnio.find(m => m.anio === anio && m.mes === mes);
    const maxCantidad = Math.max(...porMesAnio.map(m => m.cantidad), 1);

    const intensidad = (v) => {
        const pct = v / maxCantidad;
        if (pct === 0) return { bg: '#f8fafc', color: '#94a3b8' };
        if (pct < 0.25) return { bg: '#dbeafe', color: '#1d4ed8' };
        if (pct < 0.5)  return { bg: '#93c5fd', color: '#1e3a5f' };
        if (pct < 0.75) return { bg: '#3b82f6', color: '#fff' };
        return { bg: '#1d4ed8', color: '#fff' };
    };

    // Datos para líneas superpuestas
    const lineData = {
        labels: MESES,
        datasets: anios.map((anio, i) => ({
            label: anio,
            data: Array.from({ length: 12 }, (_, m) => {
                const d = getMes(anio, String(m + 1).padStart(2, '0'));
                return d ? d.cantidad : 0;
            }),
            borderColor: COLORES_ANIO[i % COLORES_ANIO.length],
            backgroundColor: COLORES_ANIO[i % COLORES_ANIO.length] + '20',
            tension: 0.4, fill: false, pointRadius: 4,
        })),
    };

    return (
        <div>
            <div className="card" style={{ marginBottom: 16 }}>
                <h3 className="card-title">Estacionalidad — Cantidad de CAs por Mes</h3>
                <div style={{ height: 240, position: 'relative' }}>
                    <Line data={lineData} options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'top' } },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    }} />
                </div>
            </div>
            <div className="card">
                <h3 className="card-title">Heatmap Mensual — Intensidad de Actividad</h3>
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    Color más oscuro = más Compras Ágiles publicadas ese mes
                </p>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead><tr>
                            <th>Año</th>
                            {MESES.map(m => <th key={m} style={{ textAlign: 'center', minWidth: 44 }}>{m}</th>)}
                            <th style={{ textAlign: 'right' }}>Total</th>
                        </tr></thead>
                        <tbody>
                            {anios.map(anio => {
                                const total = porMesAnio.filter(m => m.anio === anio).reduce((s, m) => s + m.cantidad, 0);
                                return (
                                    <tr key={anio}>
                                        <td style={{ fontWeight: 700 }}>{anio}</td>
                                        {Array.from({ length: 12 }, (_, i) => {
                                            const mes = String(i + 1).padStart(2, '0');
                                            const d = getMes(anio, mes);
                                            const cant = d ? d.cantidad : 0;
                                            const { bg, color } = intensidad(cant);
                                            return (
                                                <td key={mes} style={{ textAlign: 'center', background: bg, color, fontWeight: cant > 0 ? 600 : 400, borderRadius: 4, padding: '6px 4px' }}
                                                    title={d ? `${fmt(d.monto_oc)} OC` : '—'}>
                                                    {cant || '—'}
                                                </td>
                                            );
                                        })}
                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtN(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ── Bloque 3: Clusters de productos (TF-IDF) ──────────────────────────────────
function BloqueClusters({ clusters, nProductos, nAnalizados }) {
    const [expandido, setExpandido] = useState({});
    const [busqueda, setBusqueda] = useState('');

    if (!clusters?.length) return <p style={{ color: '#94a3b8', padding: 16 }}>Sin clusters generados.</p>;

    const filtrados = clusters.filter(c =>
        !busqueda || c.nombre_sugerido.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="card">
            <div className="card-header card-header-accent">
                <span>🔍</span>
                <span className="card-title">Grupos de Productos Similares — TF-IDF K-means</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                    {nAnalizados} productos analizados · {clusters.length} grupos detectados
                </span>
            </div>
            <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8 }}>
                <input className="filter-input" placeholder="🔍 Buscar grupo..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ maxWidth: 280 }} />
            </div>
            <div className="table-responsive">
                <table className="table-gob">
                    <thead><tr>
                        <th style={{ width: 32 }}></th>
                        <th>Nombre del grupo (términos clave)</th>
                        <th style={{ textAlign: 'center' }}>Productos</th>
                        <th>Años activo</th>
                    </tr></thead>
                    <tbody>
                        {filtrados.map(c => (
                            <React.Fragment key={c.cluster_id}>
                                <tr style={{ cursor: 'pointer', background: expandido[c.cluster_id] ? '#eff6ff' : undefined }}
                                    onClick={() => setExpandido(p => ({ ...p, [c.cluster_id]: !p[c.cluster_id] }))}>
                                    <td style={{ color: '#6b7280', fontSize: 11, textAlign: 'center' }}>
                                        {expandido[c.cluster_id] ? '▼' : '▶'}
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{c.nombre_sugerido}</td>
                                    <td style={{ textAlign: 'center' }}>{fmtN(c.n_productos)}</td>
                                    <td>{c.anios_activo.join(', ') || '—'}</td>
                                </tr>
                                {expandido[c.cluster_id] && (
                                    <tr style={{ background: '#f8fafc' }}>
                                        <td colSpan={4}>
                                            <div style={{ padding: '8px 24px', borderLeft: '3px solid #3b82f6' }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {c.productos.map((p, i) => (
                                                        <span key={i} style={{ fontSize: 11, padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 20 }}>
                                                            {p.nombre}
                                                        </span>
                                                    ))}
                                                    {c.n_productos > 20 && <span style={{ fontSize: 11, color: '#94a3b8' }}>+{c.n_productos - 20} más...</span>}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Bloque 4: Candidatos a convenio ──────────────────────────────────────────
function BloqueCandidatos({ candidatosData, onRefresh }) {
    const [umbralMonto, setUmbralMonto] = useState(300000);
    const [umbralFreq, setUmbralFreq] = useState(3);
    const [busqueda, setBusqueda] = useState('');

    const candidatos = candidatosData?.candidatos || [];
    const { sorted, toggle, arrow } = useSortable(candidatos, 'score');

    const filtrados = sorted.filter(c =>
        !busqueda || c.nombre_producto.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.proveedor_dominante.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="card">
            <div className="card-header card-header-accent">
                <span>📋</span>
                <span className="card-title">Candidatos a Convenio Anual</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                    {candidatosData?.total_encontrados || 0} detectados
                </span>
            </div>
            {/* Controles configurables */}
            <div style={{ display: 'flex', gap: 16, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <label style={{ color: '#475569', fontWeight: 600 }}>Umbral monto acumulado:</label>
                    <input type="number" value={umbralMonto} onChange={e => setUmbralMonto(Number(e.target.value))}
                        style={{ width: 110, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                    <span style={{ color: '#64748b' }}>CLP</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <label style={{ color: '#475569', fontWeight: 600 }}>Frecuencia mínima:</label>
                    <input type="number" value={umbralFreq} min={2} onChange={e => setUmbralFreq(Number(e.target.value))}
                        style={{ width: 60, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
                    <span style={{ color: '#64748b' }}>compras</span>
                </div>
                <button className="btn-excel" style={{ background: '#3b82f6' }}
                    onClick={() => onRefresh(umbralMonto, umbralFreq)}>
                    🔄 Recalcular
                </button>
                <input className="filter-input" placeholder="🔍 Buscar producto o proveedor..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ maxWidth: 260 }} />
            </div>
            <div className="table-responsive">
                <table className="table-gob">
                    <thead><tr>
                        <th onClick={() => toggle('nombre_producto')} style={{ cursor: 'pointer' }}>Producto{arrow('nombre_producto')}</th>
                        <th onClick={() => toggle('frecuencia')} style={{ cursor: 'pointer', textAlign: 'center' }}>Frecuencia{arrow('frecuencia')}</th>
                        <th onClick={() => toggle('n_anios')} style={{ cursor: 'pointer', textAlign: 'center' }}>Años{arrow('n_anios')}</th>
                        <th onClick={() => toggle('monto_acumulado')} style={{ cursor: 'pointer', textAlign: 'right' }}>Monto acumulado{arrow('monto_acumulado')}</th>
                        <th>Proveedor dominante</th>
                        <th onClick={() => toggle('pct_dominancia')} style={{ cursor: 'pointer', textAlign: 'center' }}>% Dom.{arrow('pct_dominancia')}</th>
                        <th>Características</th>
                        <th onClick={() => toggle('score')} style={{ cursor: 'pointer', textAlign: 'center' }}>Score{arrow('score')}</th>
                    </tr></thead>
                    <tbody>
                        {!filtrados.length && (
                            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Sin candidatos con los umbrales actuales.</td></tr>
                        )}
                        {filtrados.map((c, i) => (
                            <tr key={i}>
                                <td style={{ fontWeight: 500, maxWidth: 200 }}
                                    title={c.nombre_producto}>
                                    {c.nombre_producto.slice(0, 45)}{c.nombre_producto.length > 45 ? '…' : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#3b82f6' }}>{c.frecuencia}×</td>
                                <td style={{ textAlign: 'center' }}>{c.anios_activo.join(', ')}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmt(c.monto_acumulado)}</td>
                                <td style={{ fontSize: 12, color: '#475569' }}
                                    title={c.proveedor_dominante}>
                                    {(c.proveedor_dominante || '—').slice(0, 30)}{c.proveedor_dominante?.length > 30 ? '…' : ''}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    {c.pct_dominancia > 0 && (
                                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20,
                                            background: c.pct_dominancia >= 60 ? '#dcfce7' : '#fef9c3',
                                            color: c.pct_dominancia >= 60 ? '#16a34a' : '#b45309', fontWeight: 700 }}>
                                            {c.pct_dominancia}%
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {c.badges.map(b => (
                                            <span key={b} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20,
                                                background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                                        background: NIVEL_BG[c.nivel], color: NIVEL_COLOR[c.nivel] }}>
                                        {'⭐'.repeat(c.score)} {c.nivel}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Bloque 5: Asociaciones ML ─────────────────────────────────────────────────
function BloqueAsociaciones({ asocProv, asocComprador }) {
    // Nueva estructura: pares + productos_frecuentes (conteo directo)
    const pares = asocProv?.pares || [];
    const productosFrec = asocProv?.productos_frecuentes || [];
    const frecComp = asocComprador?.frecuentes || [];
    const advertenciaComp = asocComprador?.advertencia;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Asociaciones por proveedor — conteo directo de pares */}
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>🏢</span>
                    <span className="card-title">Co-venta entre Proveedores</span>
                </div>
                <div style={{ padding: '8px 16px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                    {asocProv?.n_proveedores || 0} proveedores analizados · {asocProv?.n_productos_vocab || 0} productos en análisis
                </div>

                {/* Productos más ofrecidos */}
                {productosFrec.length > 0 && (
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                            Productos más ofrecidos por proveedores:
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {productosFrec.slice(0, 10).map((p, i) => (
                                <span key={i} title={`${p.n_proveedores} proveedores (${p.pct_proveedores}%)`}
                                    style={{ fontSize: 11, padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, cursor: 'default' }}>
                                    {p.producto} <span style={{ opacity: 0.7 }}>({p.n_proveedores})</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pares co-vendidos */}
                <div style={{ padding: '8px 16px 12px' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                        Pares de productos co-ofrecidos con más frecuencia:
                    </p>
                    {!pares.length && (
                        <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sin pares detectados.</p>
                    )}
                    {pares.slice(0, 12).map((p, i) => (
                        <div key={i} style={{ marginBottom: 6, padding: '7px 10px', background: '#f8fafc', borderRadius: 7, borderLeft: '3px solid #3b82f6' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 3 }}>
                                <span style={{ fontSize: 11, padding: '2px 7px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 20 }}>{p.producto_a}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>+</span>
                                <span style={{ fontSize: 11, padding: '2px 7px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 20 }}>{p.producto_b}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                <strong style={{ color: '#374151' }}>{p.n_proveedores}</strong> proveedores ofrecen ambos ·{' '}
                                Si ofrece A → <strong style={{ color: '#16a34a' }}>{p.confianza_ab}%</strong> también ofrece B
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Asociaciones por unidad compradora */}
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>🏥</span>
                    <span className="card-title">Productos por Unidad Compradora (FP-Growth)</span>
                </div>
                <div style={{ padding: '8px 16px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                    {asocComprador?.n_unidades || 0} unidades · {asocComprador?.n_productos_vocab || 0} tipos de producto
                </div>
                {advertenciaComp && (
                    <p style={{ padding: '12px 16px', color: '#f59e0b', fontSize: 12 }}>⚠️ {advertenciaComp}</p>
                )}
                {!advertenciaComp && !frecComp.length && (
                    <p style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>Sin patrones detectados.</p>
                )}
                <div style={{ padding: '0 16px 12px' }}>
                    {frecComp.map((f, i) => (
                        <div key={i} style={{ marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                                {f.productos.map((p, j) => (
                                    <span key={j} style={{ fontSize: 11, padding: '2px 8px', background: '#dcfce7', color: '#166534', borderRadius: 20 }}>{p}</span>
                                ))}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                {f.n_unidades} unidad{f.n_unidades !== 1 ? 'es' : ''} compra estos productos juntos · soporte: {(f.soporte * 100).toFixed(0)}%
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Progress Stepper ─────────────────────────────────────────────────────────
function ProgressStepper({ pasos }) {
    return (
        <div style={{ padding: '20px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
                🧠 Ejecutando análisis de Machine Learning
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pasos.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Ícono de estado */}
                        <div style={{
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700,
                            background: p.estado === 'ok' ? '#dcfce7' : p.estado === 'error' ? '#fee2e2' : p.estado === 'loading' ? '#dbeafe' : '#f1f5f9',
                            color: p.estado === 'ok' ? '#16a34a' : p.estado === 'error' ? '#dc2626' : p.estado === 'loading' ? '#1d4ed8' : '#9ca3af',
                            border: `2px solid ${p.estado === 'ok' ? '#86efac' : p.estado === 'error' ? '#fca5a5' : p.estado === 'loading' ? '#93c5fd' : '#e2e8f0'}`,
                        }}>
                            {p.estado === 'ok' ? '✓' : p.estado === 'error' ? '✗' : p.estado === 'loading' ? '⟳' : String(i + 1)}
                        </div>
                        {/* Texto */}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: p.estado === 'pending' ? '#9ca3af' : '#1e293b' }}>
                                {p.label}
                            </div>
                            {p.detalle && (
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{p.detalle}</div>
                            )}
                        </div>
                        {/* Barra de progreso individual */}
                        {p.estado === 'loading' && (
                            <div style={{ width: 120, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                                <div style={{
                                    height: '100%', background: '#3b82f6', borderRadius: 2,
                                    animation: 'progressPulse 1.5s ease-in-out infinite',
                                    width: '60%',
                                }} />
                            </div>
                        )}
                        {p.estado === 'ok' && p.duracion && (
                            <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{p.duracion}s</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────
const SUB_TABS = [
    { id: 'evolucion',     label: '📈 Evolución Anual' },
    { id: 'estacionalidad', label: '📅 Estacionalidad' },
    { id: 'clusters',      label: '🔍 Grupos de Productos' },
    { id: 'convenio',      label: '📋 Candidatos Convenio' },
    { id: 'asociaciones',  label: '🤝 Asociaciones ML' },
];

// Mapa de qué sub-tabs pertenecen a cada carga
const TAB_CARGA = {
    evolucion: 'comp', estacionalidad: 'comp',
    clusters: 'clusters', convenio: 'candidatos', asociaciones: 'asoc',
};

export default function ComparativaTab() {
    const [subTab, setSubTab] = useState('evolucion');

    // ── Estado por sección ───────────────────────────────────────────────────
    const [comparativa,  setComparativa]  = useState(null);
    const [clusters,     setClusters]     = useState(null);
    const [asociaciones, setAsociaciones] = useState(null);
    const [candidatos,   setCandidatos]   = useState(null);

    const [stComp,    setStComp]    = useState('loading');  // loading|ok|error
    const [stCluster, setStCluster] = useState('pending');
    const [stAsoc,    setStAsoc]    = useState('pending');
    const [stCand,    setStCand]    = useState('pending');

    const [errComp,    setErrComp]    = useState('');
    const [errCluster, setErrCluster] = useState('');
    const [errAsoc,    setErrAsoc]    = useState('');
    const [errCand,    setErrCand]    = useState('');

    const [duraciones, setDuraciones] = useState({});

    // ── Carga comparativa (estadísticas puras, rápida) ───────────────────────
    useEffect(() => {
        const t0 = Date.now();
        setStComp('loading');
        getCompraAgilComparativa()
            .then(({ data }) => {
                setComparativa(data);
                setStComp('ok');
                setDuraciones(d => ({ ...d, comp: ((Date.now() - t0) / 1000).toFixed(1) }));
            })
            .catch(e => { setStComp('error'); setErrComp(e.message || 'Error al cargar estadísticas'); });
    }, []);

    // ── Carga ML: clusters primero, luego asociaciones + candidatos EN PARALELO ──
    useEffect(() => {
        const runML = async () => {
            // Paso 1: clusters (secuencial, base para los otros)
            let t = Date.now();
            setStCluster('loading');
            try {
                const { data } = await getCompraAgilClusters();
                setClusters(data);
                setStCluster('ok');
                setDuraciones(d => ({ ...d, cluster: ((Date.now() - t) / 1000).toFixed(1) }));
            } catch (e) {
                setStCluster('error');
                setErrCluster(e.message || 'Error en clustering');
            }

            // Pasos 2 y 3: asociaciones + candidatos EN PARALELO (independientes entre sí)
            const tAsoc = Date.now();
            const tCand = Date.now();
            setStAsoc('loading');
            setStCand('loading');

            const [resAsoc, resCand] = await Promise.allSettled([
                getCompraAgilAsociaciones(),
                getCompraAgilCandidatos(),
            ]);

            if (resAsoc.status === 'fulfilled') {
                setAsociaciones(resAsoc.value.data);
                setStAsoc('ok');
                setDuraciones(d => ({ ...d, asoc: ((Date.now() - tAsoc) / 1000).toFixed(1) }));
            } else {
                setStAsoc('error');
                setErrAsoc(resAsoc.reason?.message || 'Error en asociaciones');
            }

            if (resCand.status === 'fulfilled') {
                setCandidatos(resCand.value.data);
                setStCand('ok');
                setDuraciones(d => ({ ...d, cand: ((Date.now() - tCand) / 1000).toFixed(1) }));
            } else {
                setStCand('error');
                setErrCand(resCand.reason?.message || 'Error en candidatos');
            }
        };
        runML();
    }, []);


    const handleRefreshCandidatos = async (umbralMonto, umbralFreq) => {
        const t = Date.now();
        setStCand('loading');
        try {
            const { data } = await getCompraAgilCandidatos(umbralMonto, umbralFreq);
            setCandidatos(data);
            setStCand('ok');
            setDuraciones(d => ({ ...d, cand: ((Date.now() - t) / 1000).toFixed(1) }));
        } catch (e) {
            setStCand('error');
            setErrCand(e.message || 'Error al recalcular');
        }
    };

    // ── Pasos del stepper ────────────────────────────────────────────────────
    const pasosML = [
        {
            label: 'Agrupación de productos — TF-IDF + K-means',
            detalle: clusters ? `${clusters.n_analizados || 0} productos → ${clusters.n_clusters || 0} grupos detectados` : 'Vectorizando nombres de productos y ejecutando clustering...',
            estado: stCluster, duracion: duraciones.cluster,
        },
        {
            label: 'Asociaciones por proveedor — Conteo de co-venta + FP-Growth',
            detalle: asociaciones?.asociaciones_proveedor
                ? `${asociaciones.asociaciones_proveedor.n_proveedores || 0} proveedores · ${asociaciones.asociaciones_proveedor.pares?.length || 0} pares detectados`
                : 'Analizando pares de productos co-ofrecidos por proveedores... (paralelo)',
            estado: stAsoc, duracion: duraciones.asoc,
        },
        {
            label: 'Candidatos a convenio — Scoring multicritério',
            detalle: candidatos
                ? `${candidatos.total_encontrados || 0} candidatos identificados`
                : 'Evaluando frecuencia, proveedor dominante y monto acumulado... (paralelo)',
            estado: stCand, duracion: duraciones.cand,
        },
    ];

    const mlEnProceso = [stCluster, stAsoc, stCand].some(s => s === 'loading' || s === 'pending');

    const renderError = (msg) => (
        <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: '#dc2626', fontSize: 14 }}>⚠️ {msg}</p>
            <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 6 }}>Revisa los logs del backend para más detalles.</p>
        </div>
    );

    return (
        <div>
            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
                {SUB_TABS.map(t => (
                    <button key={t.id} onClick={() => setSubTab(t.id)} style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: 'none', cursor: 'pointer', transition: 'all .15s',
                        background: subTab === t.id ? '#1d4ed8' : '#f1f5f9',
                        color: subTab === t.id ? '#fff' : '#475569',
                    }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Banner de progreso ML — visible cuando algún cálculo corre */}
            {['clusters', 'convenio', 'asociaciones'].includes(subTab) && (
                <ProgressStepper pasos={pasosML} />
            )}

            {/* ── Evolución Anual ── */}
            {subTab === 'evolucion' && (
                stComp === 'loading' ? <div className="loading-spinner">Calculando estadísticas anuales...</div>
                : stComp === 'error' ? renderError(errComp)
                : <BloqueEvolucionAnual anios={comparativa?.por_anio || []} />
            )}

            {/* ── Estacionalidad ── */}
            {subTab === 'estacionalidad' && (
                stComp === 'loading' ? <div className="loading-spinner">Construyendo heatmap mensual...</div>
                : stComp === 'error' ? renderError(errComp)
                : <BloqueHeatmap porMesAnio={comparativa?.por_mes_anio || []} />
            )}

            {/* ── Grupos de Productos ── */}
            {subTab === 'clusters' && (
                stCluster === 'loading' || stCluster === 'pending'
                    ? null  // el stepper ya muestra el progreso
                    : stCluster === 'error' ? renderError(errCluster)
                    : <BloqueClusters
                        clusters={clusters?.clusters || []}
                        nProductos={clusters?.n_productos || 0}
                        nAnalizados={clusters?.n_analizados || 0}
                    />
            )}

            {/* ── Candidatos Convenio ── */}
            {subTab === 'convenio' && (
                stCand === 'loading' || stCand === 'pending'
                    ? null
                    : stCand === 'error' ? renderError(errCand)
                    : <BloqueCandidatos
                        candidatosData={candidatos}
                        onRefresh={handleRefreshCandidatos}
                        loadingRefresh={stCand === 'loading'}
                    />
            )}

            {/* ── Asociaciones ML ── */}
            {subTab === 'asociaciones' && (
                stAsoc === 'loading' || stAsoc === 'pending'
                    ? null
                    : stAsoc === 'error' ? renderError(errAsoc)
                    : <BloqueAsociaciones
                        asocProv={asociaciones?.asociaciones_proveedor}
                        asocComprador={asociaciones?.asociaciones_comprador}
                    />
            )}

            {/* CSS para animación de barra */}
            <style>{`
                @keyframes progressPulse {
                    0%   { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
            `}</style>
        </div>
    );
}
