import React, { useEffect, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = n => `${(n || 0).toFixed(1)}%`;

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

    const top5Unidades = [...por_unidad].sort((a, b) => b.ahorro - a.ahorro).slice(0, 8);
    const barUnidadData = {
        labels: top5Unidades.map(u => u.unidad.length > 20 ? u.unidad.slice(0, 20) + '…' : u.unidad),
        datasets: [
            {
                label: 'Presupuesto',
                data: top5Unidades.map(u => u.presupuesto),
                backgroundColor: 'rgba(59,130,246,0.6)',
                borderColor: '#3b82f6',
                borderWidth: 1,
            },
            {
                label: 'Monto OC',
                data: top5Unidades.map(u => u.monto_oc),
                backgroundColor: 'rgba(34,197,94,0.6)',
                borderColor: '#22c55e',
                borderWidth: 1,
            },
        ],
    };

    return (
        <div>
            {/* ── KPIs de ahorro ── */}
            <section className="kpi-grid">
                <KpiCard
                    title="Ahorro Total (Simple)"
                    value={fmt(kpis.ahorro_simple)}
                    subtitle={`${fmtPct(kpis.pct_ahorro_simple)} del presupuesto`}
                    icon="💰"
                    colorVar="--color-success"
                />
                <KpiCard
                    title="Presupuesto Total"
                    value={fmt(kpis.total_presupuesto)}
                    icon="📋"
                    colorVar="--color-primary"
                />
                <KpiCard
                    title="Monto Total OC"
                    value={fmt(kpis.total_monto_oc)}
                    icon="🏷️"
                    colorVar="--color-accent"
                />
                <KpiCard
                    title="% Ahorro Res.188/2026"
                    value={`${kpis.pct_ahorro_res188}%`}
                    subtitle={`$${new Intl.NumberFormat('es-CL').format(kpis.ahorro_res188)} ahorrado`}
                    icon="📊"
                    colorVar="--color-success"
                />
            </section>

            {/* ── Panel explicativo Res.188 ── */}
            <div className="card res188-panel">
                <h3 className="card-title">📘 Indicador Ahorro — Metodología Res.188/2026</h3>
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

            {/* ── Gráfico por unidad ── */}
            <div className="card">
                <h3 className="card-title">Presupuesto vs Monto OC por Unidad (Top 8)</h3>
                <div className="chart-container-md">
                    <Bar
                        ref={barUnidadRef}
                        data={barUnidadData}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            indexAxis: 'y',
                            plugins: {
                                legend: { position: 'top' },
                                tooltip: {
                                    callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.x)}` },
                                },
                            },
                            scales: {
                                x: { ticks: { callback: v => `$${(v / 1000000).toFixed(0)}M` } },
                            },
                        }}
                    />
                </div>
            </div>

            {/* ── Tabla ahorro por unidad ── */}
            <div className="card">
                <div className="table-toolbar">
                    <h3 className="card-title">Ahorro por Unidad de Compra</h3>
                    <input
                        className="search-input"
                        placeholder="🔍 Buscar unidad..."
                        value={busquedaUnidad}
                        onChange={e => setBusquedaUnidad(e.target.value)}
                    />
                </div>
                <div className="table-scroll">
                    <table className="data-table sortable">
                        <thead>
                            <tr>
                                <th onClick={() => toggleUnidad('unidad')} className="sortable-th">Unidad{arrowUnidad('unidad')}</th>
                                <th onClick={() => toggleUnidad('total')} className="sortable-th">CAs{arrowUnidad('total')}</th>
                                <th onClick={() => toggleUnidad('adjudicadas')} className="sortable-th">Adjudicadas{arrowUnidad('adjudicadas')}</th>
                                <th onClick={() => toggleUnidad('presupuesto')} className="sortable-th">Presupuesto{arrowUnidad('presupuesto')}</th>
                                <th onClick={() => toggleUnidad('monto_oc')} className="sortable-th">Monto OC{arrowUnidad('monto_oc')}</th>
                                <th onClick={() => toggleUnidad('ahorro')} className="sortable-th">Ahorro{arrowUnidad('ahorro')}</th>
                                <th onClick={() => toggleUnidad('pct_ahorro')} className="sortable-th">% Ahorro{arrowUnidad('pct_ahorro')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {unidadesFiltradas.map((u, i) => (
                                <tr key={i}>
                                    <td>{u.unidad}</td>
                                    <td>{u.total}</td>
                                    <td>{u.adjudicadas}</td>
                                    <td>{fmt(u.presupuesto)}</td>
                                    <td>{u.monto_oc > 0 ? fmt(u.monto_oc) : '—'}</td>
                                    <td className={u.ahorro >= 0 ? 'text-success' : 'text-danger'}>{fmt(u.ahorro)}</td>
                                    <td className={u.pct_ahorro >= 0 ? 'text-success' : 'text-danger'}>{fmtPct(u.pct_ahorro)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Top ítems con mayor ahorro ── */}
            <div className="card">
                <div className="table-toolbar">
                    <h3 className="card-title">Top Ítems con Mayor Ahorro (Metodología Res.188)</h3>
                    <input
                        className="search-input"
                        placeholder="🔍 Buscar ítem o CA..."
                        value={busquedaItems}
                        onChange={e => setBusquedaItems(e.target.value)}
                    />
                </div>
                <div className="table-scroll">
                    <table className="data-table sortable">
                        <thead>
                            <tr>
                                <th onClick={() => toggleTop('codigo_ca')} className="sortable-th">Código CA{arrowTop('codigo_ca')}</th>
                                <th onClick={() => toggleTop('nombre_producto')} className="sortable-th">Producto{arrowTop('nombre_producto')}</th>
                                <th onClick={() => toggleTop('precio_promedio')} className="sortable-th">Precio Promedio{arrowTop('precio_promedio')}</th>
                                <th onClick={() => toggleTop('precio_adjudicado')} className="sortable-th">Precio Adjudicado{arrowTop('precio_adjudicado')}</th>
                                <th onClick={() => toggleTop('cantidad')} className="sortable-th">Cantidad{arrowTop('cantidad')}</th>
                                <th onClick={() => toggleTop('ahorro')} className="sortable-th">Ahorro Total{arrowTop('ahorro')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topFiltrados.length === 0 && (
                                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af' }}>Sin datos</td></tr>
                            )}
                            {topFiltrados.map((item, i) => (
                                <tr key={i}>
                                    <td><span className="codigo-badge">{item.codigo_ca}</span></td>
                                    <td title={item.nombre_producto}>{item.nombre_producto?.slice(0, 50)}{item.nombre_producto?.length > 50 ? '…' : ''}</td>
                                    <td>{fmt(item.precio_promedio)}</td>
                                    <td>{fmt(item.precio_adjudicado)}</td>
                                    <td>{item.cantidad}</td>
                                    <td className="text-success">{fmt(item.ahorro)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Ítems con oportunidad de mejora ── */}
            {mejorFiltrados.length > 0 && (
                <div className="card">
                    <h3 className="card-title">⚠️ Oportunidades de Mejora — Precio Adjudicado &gt; Promedio</h3>
                    <p className="card-subtitle">Ítems donde el precio adjudicado superó el precio promedio de las ofertas. Requieren revisión.</p>
                    <div className="table-scroll">
                        <table className="data-table sortable">
                            <thead>
                                <tr>
                                    <th onClick={() => toggleMejora('codigo_ca')} className="sortable-th">Código CA{arrowMejora('codigo_ca')}</th>
                                    <th onClick={() => toggleMejora('nombre_producto')} className="sortable-th">Producto{arrowMejora('nombre_producto')}</th>
                                    <th onClick={() => toggleMejora('precio_promedio')} className="sortable-th">Precio Promedio{arrowMejora('precio_promedio')}</th>
                                    <th onClick={() => toggleMejora('precio_adjudicado')} className="sortable-th">Precio Adjudicado{arrowMejora('precio_adjudicado')}</th>
                                    <th onClick={() => toggleMejora('diferencia')} className="sortable-th">Sobrecosto{arrowMejora('diferencia')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mejorFiltrados.map((item, i) => (
                                    <tr key={i}>
                                        <td><span className="codigo-badge">{item.codigo_ca}</span></td>
                                        <td title={item.nombre_producto}>{item.nombre_producto?.slice(0, 50)}{item.nombre_producto?.length > 50 ? '…' : ''}</td>
                                        <td>{fmt(item.precio_promedio)}</td>
                                        <td>{fmt(item.precio_adjudicado)}</td>
                                        <td className="text-danger">{fmt(item.diferencia)}</td>
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
