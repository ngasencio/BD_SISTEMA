import React, { useEffect, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = n => `${(n || 0).toFixed(1)}%`;

function KpiCard({ label, value, sub, color = '#3b82f6' }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '16px 20px',
            border: '1px solid #e2e8f0', flex: '1 1 160px', minWidth: 150,
            borderTop: `4px solid ${color}`,
        }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

function useSortable(data, defaultKey = '', defaultDir = 'desc') {
    const [sortKey, setSortKey] = useState(defaultKey);
    const [sortDir, setSortDir] = useState(defaultDir);

    const sorted = [...(data || [])].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const toggle = key => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const arrow = key => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';

    return { sorted, toggle, arrow, sortKey };
}

const SortTh = ({ col, label, toggle, arrow, align }) => (
    <th
        onClick={() => toggle(col)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: align || 'left' }}
    >
        {label}<span style={{ opacity: 0.6 }}>{arrow(col)}</span>
    </th>
);

export default function AhorroTab({ stats, loading, chartsRef }) {
    const barUnidadRef = useRef(null);
    const [busquedaUnidad, setBusquedaUnidad] = useState('');
    const [busquedaItems, setBusquedaItems] = useState('');

    useEffect(() => {
        if (chartsRef && barUnidadRef.current) chartsRef.barUnidad = barUnidadRef.current;
    }, [chartsRef, stats]);

    const { sorted: unidadesSort, toggle: toggleUnidad, arrow: arrowUnidad } = useSortable(stats?.por_unidad, 'ahorro');
    const { sorted: topSort, toggle: toggleTop, arrow: arrowTop } = useSortable(stats?.top_ahorro_items, 'ahorro');
    const { sorted: mejoraSort, toggle: toggleMejora, arrow: arrowMejora } = useSortable(stats?.mejora_items, 'diferencia');

    if (loading) return <div className="loading-spinner">Cargando análisis de ahorro...</div>;
    if (!stats) return null;

    const { kpis, por_unidad } = stats;

    const unidadesFiltradas = unidadesSort.filter(u =>
        !busquedaUnidad || u.unidad.toLowerCase().includes(busquedaUnidad.toLowerCase())
    );

    const topFiltrados = topSort.filter(i =>
        !busquedaItems || i.nombre_producto.toLowerCase().includes(busquedaItems.toLowerCase()) ||
        i.codigo_ca.toLowerCase().includes(busquedaItems.toLowerCase())
    );

    const mejorFiltrados = mejoraSort.filter(i =>
        !busquedaItems || i.nombre_producto.toLowerCase().includes(busquedaItems.toLowerCase()) ||
        i.codigo_ca.toLowerCase().includes(busquedaItems.toLowerCase())
    );

    const top8Unidades = [...por_unidad].sort((a, b) => b.ahorro - a.ahorro).slice(0, 8);
    const barUnidadData = {
        labels: top8Unidades.map(u => u.unidad.length > 20 ? u.unidad.slice(0, 20) + '…' : u.unidad),
        datasets: [
            {
                label: 'Presupuesto',
                data: top8Unidades.map(u => u.presupuesto),
                backgroundColor: 'rgba(59,130,246,0.75)',
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 4,
            },
            {
                label: 'Monto OC',
                data: top8Unidades.map(u => u.monto_oc),
                backgroundColor: 'rgba(34,197,94,0.75)',
                borderColor: '#22c55e',
                borderWidth: 1,
                borderRadius: 4,
            },
        ],
    };

    return (
        <div>
            {/* ── KPIs de ahorro ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <KpiCard
                    label="Ahorro Total (Simple)"
                    value={fmt(kpis.ahorro_simple)}
                    sub={`${fmtPct(kpis.pct_ahorro_simple)} del presupuesto`}
                    color="#22c55e"
                />
                <KpiCard
                    label="Presupuesto Total"
                    value={fmt(kpis.total_presupuesto)}
                    color="#3b82f6"
                />
                <KpiCard
                    label="Monto Total OC"
                    value={fmt(kpis.total_monto_oc)}
                    color="#8b5cf6"
                />
                <KpiCard
                    label="% Ahorro Res.188/2026"
                    value={`${kpis.pct_ahorro_res188}%`}
                    sub={`${fmt(kpis.ahorro_res188)} ahorrado`}
                    color="#10b981"
                />
            </div>

            {/* ── Panel explicativo Res.188 ── */}
            <div className="card res188-panel" style={{ marginBottom: 16 }}>
                <div className="card-header card-header-accent">
                    <span>📘</span>
                    <span className="card-title">Indicador Ahorro — Metodología Res.188/2026</span>
                </div>
                <div style={{ padding: '14px 20px' }}>
                    <div className="res188-body">
                        <p>
                            El <strong>Indicador 5 de la Resolución 188/2026</strong> de la Dirección ChileCompra evalúa la
                            eficiencia de las Compras Ágiles midiendo cuánto ahorró la institución respecto al precio
                            promedio de mercado obtenido durante el proceso competitivo.
                        </p>
                        <div className="res188-formula-block">
                            <p className="formula-title">Fórmula de cálculo:</p>
                            <div className="formula-box">
                                <p><strong>Monto Total Ahorrado</strong> =</p>
                                <p className="formula-indent">Σ [ (Precio promedio de ofertas por ítem − Precio adjudicado por ítem) × Cantidad adjudicada del ítem ]</p>
                                <p style={{ marginTop: 8 }}><strong>% Ahorro</strong> = (Monto Total Ahorrado / Monto Total Adjudicado) × 100</p>
                            </div>
                        </div>
                        <div className="res188-aclaraciones">
                            <div className="aclaracion-item">
                                <span className="aclaracion-icon">🔵</span>
                                <span><strong>Precio promedio de ofertas:</strong> promedio de los precios unitarios de todos los proveedores que cotizaron ese ítem específico.</span>
                            </div>
                            <div className="aclaracion-item">
                                <span className="aclaracion-icon">🟢</span>
                                <span><strong>Precio adjudicado:</strong> precio unitario ofertado por el proveedor seleccionado para ese ítem.</span>
                            </div>
                            <div className="aclaracion-item">
                                <span className="aclaracion-icon">⚠️</span>
                                <span><strong>Ítems con ahorro negativo:</strong> el precio adjudicado fue mayor al promedio de ofertas. Se reportan como oportunidad de mejora.</span>
                            </div>
                            <div className="aclaracion-item">
                                <span className="aclaracion-icon">📌</span>
                                <span><strong>Aplicabilidad:</strong> solo se calculan compras en estado "Proveedor seleccionado" con al menos 2 cotizantes por ítem.</span>
                            </div>
                        </div>
                        <div className="res188-resultado">
                            <span className="resultado-label">Resultado institucional:</span>
                            <span className="resultado-valor">{kpis.pct_ahorro_res188}%</span>
                            <span className="resultado-adj">sobre {fmt(kpis.adjudicado_res188)} adjudicado</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Gráfico por unidad ── */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header card-header-accent">
                    <span>📊</span>
                    <span className="card-title">Presupuesto vs Monto OC por Unidad (Top 8)</span>
                </div>
                <div style={{ padding: 16, height: 290, position: 'relative' }}>
                    <Bar
                        ref={barUnidadRef}
                        data={barUnidadData}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            indexAxis: 'y',
                            plugins: {
                                legend: { position: 'top', labels: { font: { size: 11 } } },
                                tooltip: {
                                    callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.x)}` },
                                },
                            },
                            scales: {
                                x: { ticks: { callback: v => `$${(v / 1e6).toFixed(0)}M`, font: { size: 10 } } },
                                y: { ticks: { font: { size: 10 } } },
                            },
                        }}
                    />
                </div>
            </div>

            {/* ── Tabla ahorro por unidad ── */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header card-header-accent">
                    <span>🏢</span>
                    <span className="card-title">Ahorro por Unidad de Compra</span>
                    <div style={{ marginLeft: 'auto' }}>
                        <input
                            className="filter-input"
                            placeholder="🔍 Buscar unidad..."
                            value={busquedaUnidad}
                            onChange={e => setBusquedaUnidad(e.target.value)}
                            style={{ minWidth: 200 }}
                        />
                    </div>
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <SortTh col="unidad" label="Unidad" toggle={toggleUnidad} arrow={arrowUnidad} />
                                <SortTh col="total" label="CAs" toggle={toggleUnidad} arrow={arrowUnidad} />
                                <SortTh col="adjudicadas" label="Adjudicadas" toggle={toggleUnidad} arrow={arrowUnidad} />
                                <SortTh col="presupuesto" label="Presupuesto" toggle={toggleUnidad} arrow={arrowUnidad} align="right" />
                                <SortTh col="monto_oc" label="Monto OC" toggle={toggleUnidad} arrow={arrowUnidad} align="right" />
                                <SortTh col="ahorro" label="Ahorro" toggle={toggleUnidad} arrow={arrowUnidad} align="right" />
                                <SortTh col="pct_ahorro" label="% Ahorro" toggle={toggleUnidad} arrow={arrowUnidad} align="right" />
                            </tr>
                        </thead>
                        <tbody>
                            {unidadesFiltradas.length === 0 && (
                                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sin datos</td></tr>
                            )}
                            {unidadesFiltradas.map((u, i) => (
                                <tr key={i}>
                                    <td>{u.unidad}</td>
                                    <td style={{ textAlign: 'center' }}>{u.total}</td>
                                    <td style={{ textAlign: 'center' }}>{u.adjudicadas}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmt(u.presupuesto)}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{u.monto_oc > 0 ? fmt(u.monto_oc) : '—'}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: u.ahorro >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(u.ahorro)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: u.pct_ahorro >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(u.pct_ahorro)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Top ítems con mayor ahorro ── */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header card-header-accent">
                    <span>💰</span>
                    <span className="card-title">Top Ítems con Mayor Ahorro (Metodología Res.188)</span>
                    <div style={{ marginLeft: 'auto' }}>
                        <input
                            className="filter-input"
                            placeholder="🔍 Buscar ítem o CA..."
                            value={busquedaItems}
                            onChange={e => setBusquedaItems(e.target.value)}
                            style={{ minWidth: 200 }}
                        />
                    </div>
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <SortTh col="codigo_ca" label="Código CA" toggle={toggleTop} arrow={arrowTop} />
                                <SortTh col="nombre_producto" label="Producto" toggle={toggleTop} arrow={arrowTop} />
                                <SortTh col="precio_promedio" label="Precio Promedio" toggle={toggleTop} arrow={arrowTop} align="right" />
                                <SortTh col="precio_adjudicado" label="Precio Adjudicado" toggle={toggleTop} arrow={arrowTop} align="right" />
                                <SortTh col="cantidad" label="Cantidad" toggle={toggleTop} arrow={arrowTop} align="center" />
                                <SortTh col="ahorro" label="Ahorro Total" toggle={toggleTop} arrow={arrowTop} align="right" />
                            </tr>
                        </thead>
                        <tbody>
                            {topFiltrados.length === 0 && (
                                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sin datos</td></tr>
                            )}
                            {topFiltrados.map((item, i) => (
                                <tr key={i}>
                                    <td>
                                        <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                                            {item.codigo_ca}
                                        </span>
                                    </td>
                                    <td title={item.nombre_producto} style={{ maxWidth: 260 }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.nombre_producto}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmt(item.precio_promedio)}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmt(item.precio_adjudicado)}</td>
                                    <td style={{ textAlign: 'center' }}>{item.cantidad}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 12 }}>{fmt(item.ahorro)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Ítems con oportunidad de mejora ── */}
            {mejorFiltrados.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="card-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
                        <span>⚠️</span>
                        <span className="card-title" style={{ color: '#c2410c' }}>Oportunidades de Mejora — Precio Adjudicado &gt; Promedio</span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{mejorFiltrados.length} ítem(s)</span>
                    </div>
                    <div style={{ padding: '8px 16px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', fontSize: 12, color: '#92400e' }}>
                        Ítems donde el precio adjudicado superó el precio promedio de las ofertas. Requieren revisión.
                    </div>
                    <div className="table-responsive">
                        <table className="table-gob">
                            <thead>
                                <tr>
                                    <SortTh col="codigo_ca" label="Código CA" toggle={toggleMejora} arrow={arrowMejora} />
                                    <SortTh col="nombre_producto" label="Producto" toggle={toggleMejora} arrow={arrowMejora} />
                                    <SortTh col="precio_promedio" label="Precio Promedio" toggle={toggleMejora} arrow={arrowMejora} align="right" />
                                    <SortTh col="precio_adjudicado" label="Precio Adjudicado" toggle={toggleMejora} arrow={arrowMejora} align="right" />
                                    <SortTh col="diferencia" label="Sobrecosto" toggle={toggleMejora} arrow={arrowMejora} align="right" />
                                </tr>
                            </thead>
                            <tbody>
                                {mejorFiltrados.map((item, i) => (
                                    <tr key={i}>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#fef2f2', color: '#dc2626', padding: '2px 7px', borderRadius: 6, border: '1px solid #fca5a5' }}>
                                                {item.codigo_ca}
                                            </span>
                                        </td>
                                        <td title={item.nombre_producto} style={{ maxWidth: 260 }}>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.nombre_producto}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmt(item.precio_promedio)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmt(item.precio_adjudicado)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626', fontFamily: 'monospace', fontSize: 12 }}>{fmt(item.diferencia)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
