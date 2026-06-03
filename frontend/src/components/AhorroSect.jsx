import React, { useState, useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;

function SortButton({ col, sortCol, sortDir, onSort }) {
    const active = sortCol === col;
    return (
        <button
            onClick={() => onSort(col)}
            style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                color: active ? '#1a3d71' : '#aaa', fontWeight: active ? 700 : 400, fontSize: '11px',
            }}
            title={`Ordenar por ${col}`}
        >
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </button>
    );
}

function useSortTable(data, defaultCol = '', defaultDir = 'desc') {
    const [sortCol, setSortCol] = useState(defaultCol);
    const [sortDir, setSortDir] = useState(defaultDir);

    const onSort = (col) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('desc');
        }
    };

    const sorted = useMemo(() => {
        if (!sortCol) return data;
        return [...data].sort((a, b) => {
            const va = a[sortCol] ?? '';
            const vb = b[sortCol] ?? '';
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortDir === 'asc' ? va - vb : vb - va;
            }
            return sortDir === 'asc'
                ? String(va).localeCompare(String(vb), 'es')
                : String(vb).localeCompare(String(va), 'es');
        });
    }, [data, sortCol, sortDir]);

    return { sorted, sortCol, sortDir, onSort };
}

function NotaMetodologica({ texto }) {
    return (
        <div style={{
            background: '#f8f9fa', border: '1px solid #e0e0e0', borderLeft: '4px solid #6bccd6',
            borderRadius: '4px', padding: '10px 14px', marginTop: '10px',
            fontSize: '11px', color: '#666', lineHeight: '1.5',
        }}>
            <strong>Nota metodológica:</strong> {texto}
        </div>
    );
}

export default function AhorroSect({ ahorroData, loading }) {
    const [tabActivo, setTabActivo] = useState('grupo_a');
    const [filtroComprador, setFiltroComprador] = useState('');
    const [busqueda, setBusqueda] = useState('');

    const kpis = ahorroData?.kpis || {};
    const grupoA = ahorroData?.grupo_a || [];
    const grupoB = ahorroData?.grupo_b || [];
    const porComprador = ahorroData?.por_comprador || [];
    const porTipo = ahorroData?.por_tipo || [];
    const fallidas = ahorroData?.fallidas || {};
    const metodologia = ahorroData?.metodologia || {};

    const compradores = useMemo(() =>
        [...new Set([...grupoA, ...grupoB].map(l => l.comprador).filter(Boolean))].sort(),
        [grupoA, grupoB]
    );

    // Filtros para tabla
    const grupoAFiltrado = useMemo(() => grupoA.filter(l => {
        if (filtroComprador && l.comprador !== filtroComprador) return false;
        if (busqueda) {
            const q = busqueda.toLowerCase();
            if (!l.nombre?.toLowerCase().includes(q) && !l.codigo_licitacion?.toLowerCase().includes(q)) return false;
        }
        return true;
    }), [grupoA, filtroComprador, busqueda]);

    const grupoBFiltrado = useMemo(() => grupoB.filter(l => {
        if (filtroComprador && l.comprador !== filtroComprador) return false;
        if (busqueda) {
            const q = busqueda.toLowerCase();
            if (!l.nombre?.toLowerCase().includes(q) && !l.codigo_licitacion?.toLowerCase().includes(q)) return false;
        }
        return true;
    }), [grupoB, filtroComprador, busqueda]);

    const { sorted: sortedA, sortCol: scA, sortDir: sdA, onSort: onSortA } = useSortTable(grupoAFiltrado, 'ahorro', 'desc');
    const { sorted: sortedB, sortCol: scB, sortDir: sdB, onSort: onSortB } = useSortTable(grupoBFiltrado, 'adjudicado_real', 'desc');

    // Gráfico doughnut: Grupo A vs B vs Fallidas
    const doughnutData = {
        labels: ['Con ahorro calculable (A)', 'Sin visibilidad monto (B)', 'Desiertas', 'Revocadas'],
        datasets: [{
            data: [kpis.total_adjudicadas_a || 0, kpis.total_adjudicadas_b || 0, fallidas.desiertas || 0, fallidas.revocadas || 0],
            backgroundColor: ['#27ae60', '#6bccd6', '#aab8cc', '#e74c3c'],
            borderWidth: 2, borderColor: '#fff',
        }],
    };

    // Gráfico bar por comprador (ahorro en grupo A)
    const compradoresConAhorro = porComprador.filter(c => c.ahorro_total > 0).slice(0, 10);
    const chartCompradorData = {
        labels: compradoresConAhorro.map(c => c.comprador),
        datasets: [{
            label: 'Ahorro ($)',
            data: compradoresConAhorro.map(c => c.ahorro_total),
            backgroundColor: 'rgba(39,174,96,0.75)',
            borderRadius: 4,
        }],
    };

    // Gráfico bar por tipo
    const chartTipoData = {
        labels: porTipo.slice(0, 8).map(t => t.tipo),
        datasets: [
            {
                label: 'Ahorro ($)',
                data: porTipo.slice(0, 8).map(t => t.ahorro),
                backgroundColor: 'rgba(26,61,113,0.75)',
                borderRadius: 4,
            },
            {
                label: 'Adjudicado ($)',
                data: porTipo.slice(0, 8).map(t => t.adjudicado),
                backgroundColor: 'rgba(107,204,214,0.5)',
                borderRadius: 4,
            },
        ],
    };

    if (loading) return <div className="loading-spinner">Cargando estadísticas de ahorro...</div>;

    if (!ahorroData) return (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: '#888' }}>
            No hay datos de ahorro disponibles.
        </div>
    );

    return (
        <div className="tab-view active">

            {/* KPIs Grupo A */}
            <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#1a3d71', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Grupo A — Monto público (VisibilidadMonto = 1)
            </div>
            <div className="kpi-grid" style={{ marginBottom: '18px' }}>
                <div className="kpi-card kpi-verde">
                    <span className="kpi-icon">💰</span>
                    <div className="kpi-label">Ahorro Total</div>
                    <div className="kpi-value" style={{ fontSize: '16px' }}>{fmt(kpis.ahorro_total)}</div>
                    <div className="kpi-meta">{kpis.total_adjudicadas_a} licitaciones</div>
                </div>
                <div className="kpi-card kpi-azul">
                    <span className="kpi-icon">📉</span>
                    <div className="kpi-label">% Ahorro Promedio</div>
                    <div className="kpi-value">{fmtPct(kpis.pct_ahorro_promedio)}</div>
                    <div className="kpi-meta">vs MontoEstimado</div>
                </div>
                <div className="kpi-card kpi-celeste">
                    <span className="kpi-icon">🏛️</span>
                    <div className="kpi-label">Presupuesto Total</div>
                    <div className="kpi-value" style={{ fontSize: '16px' }}>{fmt(kpis.monto_estimado_total)}</div>
                    <div className="kpi-meta">Monto estimado Grupo A</div>
                </div>
                <div className="kpi-card kpi-amarillo">
                    <span className="kpi-icon">✅</span>
                    <div className="kpi-label">Adjudicado Real</div>
                    <div className="kpi-value" style={{ fontSize: '16px' }}>{fmt(kpis.adjudicado_total_a)}</div>
                    <div className="kpi-meta">Σ (Precio × Cantidad adj.)</div>
                </div>
            </div>

            {/* KPIs Grupo B + Fallidas */}
            <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Grupo B — Monto no público · Procesos fallidos
            </div>
            <div className="kpi-grid" style={{ marginBottom: '24px' }}>
                <div className="kpi-card" style={{ background: '#f0f7ff', border: '1px solid #6bccd6' }}>
                    <span className="kpi-icon">🔒</span>
                    <div className="kpi-label">Monto Transado (B)</div>
                    <div className="kpi-value" style={{ fontSize: '16px' }}>{fmt(kpis.adjudicado_total_b)}</div>
                    <div className="kpi-meta">{kpis.total_adjudicadas_b} licitaciones sin visibilidad</div>
                </div>
                <div className="kpi-card" style={{ background: '#f5f5f5', border: '1px solid #ccc' }}>
                    <span className="kpi-icon">🔗</span>
                    <div className="kpi-label">OC Vinculadas</div>
                    <div className="kpi-value">{kpis.n_oc_total ?? 0}</div>
                    <div className="kpi-meta">{fmt(kpis.total_bruto_oc)} TotalBruto</div>
                </div>
                <div className="kpi-card" style={{ background: '#fff5f5', border: '1px solid #e74c3c' }}>
                    <span className="kpi-icon">📭</span>
                    <div className="kpi-label">Desiertas</div>
                    <div className="kpi-value" style={{ color: '#e74c3c' }}>{fallidas.desiertas ?? 0}</div>
                    <div className="kpi-meta">Sin ofertas válidas</div>
                </div>
                <div className="kpi-card" style={{ background: '#fff5f5', border: '1px solid #c0392b' }}>
                    <span className="kpi-icon">🚫</span>
                    <div className="kpi-label">Revocadas</div>
                    <div className="kpi-value" style={{ color: '#c0392b' }}>{fallidas.revocadas ?? 0}</div>
                    <div className="kpi-meta">Proceso cancelado</div>
                </div>
            </div>

            {/* Gráficos */}
            <div className="grid-2" style={{ marginBottom: '24px' }}>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>🍩</span>
                        <span className="card-title">Distribución de Licitaciones Adjudicadas</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap">
                            <Doughnut
                                data={doughnutData}
                                options={{
                                    plugins: { legend: { position: 'bottom', labels: { color: '#6c757d', font: { size: 11 } } } },
                                    cutout: '55%',
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>👤</span>
                        <span className="card-title">Ahorro por Comprador (Grupo A)</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap">
                            <Bar
                                data={chartCompradorData}
                                options={{
                                    indexAxis: 'y',
                                    plugins: { legend: { display: false } },
                                    scales: {
                                        x: { ticks: { color: '#6c757d', font: { size: 10 }, callback: v => fmt(v) }, grid: { color: 'rgba(0,0,0,0.05)' } },
                                        y: { ticks: { color: '#333', font: { size: 10 } }, grid: { display: false } },
                                    },
                                    responsive: true,
                                    maintainAspectRatio: false,
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Gráfico por tipo */}
            {porTipo.length > 0 && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📊</span>
                        <span className="card-title">Ahorro vs Adjudicado por Tipo de Licitación</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap" style={{ maxHeight: '260px' }}>
                            <Bar
                                data={chartTipoData}
                                options={{
                                    plugins: { legend: { position: 'bottom', labels: { color: '#6c757d', font: { size: 11 } } } },
                                    scales: {
                                        x: { ticks: { color: '#333', font: { size: 10 } }, grid: { display: false } },
                                        y: { ticks: { color: '#6c757d', font: { size: 10 }, callback: v => fmt(v) }, grid: { color: 'rgba(0,0,0,0.05)' } },
                                    },
                                    responsive: true,
                                    maintainAspectRatio: false,
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Filtros compartidos */}
            <div className="filter-bar" style={{ marginBottom: '12px' }}>
                <input
                    className="filter-input"
                    type="text"
                    placeholder="🔍 Buscar por nombre o código…"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    style={{ minWidth: '220px' }}
                />
                <select className="filter-input" value={filtroComprador} onChange={e => setFiltroComprador(e.target.value)}>
                    <option value="">Todos los compradores</option>
                    {compradores.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    <button
                        onClick={() => setTabActivo('grupo_a')}
                        className={`tab-btn${tabActivo === 'grupo_a' ? ' active' : ''}`}
                        style={{ fontSize: '12px', padding: '4px 12px' }}
                    >
                        Grupo A ({grupoA.length})
                    </button>
                    <button
                        onClick={() => setTabActivo('grupo_b')}
                        className={`tab-btn${tabActivo === 'grupo_b' ? ' active' : ''}`}
                        style={{ fontSize: '12px', padding: '4px 12px' }}
                    >
                        Grupo B ({grupoB.length})
                    </button>
                    <button
                        onClick={() => setTabActivo('comprador')}
                        className={`tab-btn${tabActivo === 'comprador' ? ' active' : ''}`}
                        style={{ fontSize: '12px', padding: '4px 12px' }}
                    >
                        Por comprador
                    </button>
                </div>
            </div>

            {/* Tabla Grupo A */}
            {tabActivo === 'grupo_a' && (
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>💚</span>
                        <span className="card-title">Grupo A — Ahorro calculable (monto público)</span>
                        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
                            {grupoAFiltrado.length} licitaciones
                        </span>
                    </div>
                    <div className="table-responsive">
                        <table className="table-gob">
                            <thead>
                                <tr>
                                    <th>Código <SortButton col="codigo_licitacion" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>Nombre</th>
                                    <th>Comprador <SortButton col="comprador" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>Tipo <SortButton col="tipo" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>Monto Est. <SortButton col="monto_estimado" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>Adj. Real <SortButton col="adjudicado_real" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>Ahorro $ <SortButton col="ahorro" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>% Ahorro <SortButton col="pct_ahorro" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>OC <SortButton col="n_oc" sortCol={scA} sortDir={sdA} onSort={onSortA} /></th>
                                    <th>Fecha Adj.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedA.length === 0 ? (
                                    <tr><td colSpan="10" style={{ textAlign: 'center', padding: '24px', color: '#888' }}>Sin datos</td></tr>
                                ) : sortedA.map(l => (
                                    <tr key={l.codigo_licitacion}>
                                        <td className="td-mono" style={{ fontSize: '11px' }}>{l.codigo_licitacion}</td>
                                        <td>
                                            <span title={l.nombre} style={{ maxWidth: '180px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {l.nombre}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '12px' }}>{l.comprador}</td>
                                        <td><span className="tag tag-azul" style={{ fontSize: '10px' }}>{l.tipo}</span></td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{fmt(l.monto_estimado)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{fmt(l.adjudicado_real)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px', color: l.ahorro >= 0 ? '#27ae60' : '#e74c3c', fontWeight: 700 }}>
                                            {fmt(l.ahorro)}
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: l.pct_ahorro >= 0 ? '#27ae60' : '#e74c3c' }}>
                                            {fmtPct(l.pct_ahorro)}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>{l.n_oc}</td>
                                        <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{l.fecha_adjudicacion || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <NotaMetodologica texto={metodologia.grupo_a} />
                </div>
            )}

            {/* Tabla Grupo B */}
            {tabActivo === 'grupo_b' && (
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>🔒</span>
                        <span className="card-title">Grupo B — Monto no público (ahorro no calculable)</span>
                        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>
                            {grupoBFiltrado.length} licitaciones
                        </span>
                    </div>
                    <div className="table-responsive">
                        <table className="table-gob">
                            <thead>
                                <tr>
                                    <th>Código <SortButton col="codigo_licitacion" sortCol={scB} sortDir={sdB} onSort={onSortB} /></th>
                                    <th>Nombre</th>
                                    <th>Comprador <SortButton col="comprador" sortCol={scB} sortDir={sdB} onSort={onSortB} /></th>
                                    <th>Tipo <SortButton col="tipo" sortCol={scB} sortDir={sdB} onSort={onSortB} /></th>
                                    <th>Monto Transado <SortButton col="adjudicado_real" sortCol={scB} sortDir={sdB} onSort={onSortB} /></th>
                                    <th>Ítems <SortButton col="n_items" sortCol={scB} sortDir={sdB} onSort={onSortB} /></th>
                                    <th>OC <SortButton col="n_oc" sortCol={scB} sortDir={sdB} onSort={onSortB} /></th>
                                    <th>TotalBruto OC <SortButton col="total_bruto_oc" sortCol={scB} sortDir={sdB} onSort={onSortB} /></th>
                                    <th>Fecha Adj.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedB.length === 0 ? (
                                    <tr><td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: '#888' }}>Sin datos</td></tr>
                                ) : sortedB.map(l => (
                                    <tr key={l.codigo_licitacion}>
                                        <td className="td-mono" style={{ fontSize: '11px' }}>{l.codigo_licitacion}</td>
                                        <td>
                                            <span title={l.nombre} style={{ maxWidth: '180px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {l.nombre}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '12px' }}>{l.comprador}</td>
                                        <td><span className="tag tag-gris" style={{ fontSize: '10px' }}>{l.tipo}</span></td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{fmt(l.adjudicado_real)}</td>
                                        <td style={{ textAlign: 'center' }}>{l.n_items}</td>
                                        <td style={{ textAlign: 'center' }}>{l.n_oc}</td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{fmt(l.total_bruto_oc)}</td>
                                        <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{l.fecha_adjudicacion || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <NotaMetodologica texto={metodologia.grupo_b} />
                </div>
            )}

            {/* Tabla por Comprador */}
            {tabActivo === 'comprador' && (
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>👤</span>
                        <span className="card-title">Resumen de Ahorro por Comprador</span>
                    </div>
                    <div className="table-responsive">
                        <table className="table-gob">
                            <thead>
                                <tr>
                                    <th>Comprador</th>
                                    <th>Lic. Grupo A</th>
                                    <th>Ahorro Total $</th>
                                    <th>Presupuesto $</th>
                                    <th>Adjudicado A $</th>
                                    <th>% Ahorro</th>
                                    <th>Monto Transado B $</th>
                                </tr>
                            </thead>
                            <tbody>
                                {porComprador.map(c => (
                                    <tr key={c.comprador}>
                                        <td style={{ fontWeight: 600 }}>{c.comprador}</td>
                                        <td style={{ textAlign: 'center' }}>{c.n_licitaciones_a}</td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px', color: '#27ae60', fontWeight: 700 }}>{fmt(c.ahorro_total)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{fmt(c.monto_estimado)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>{fmt(c.adjudicado_a)}</td>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: c.pct_ahorro >= 0 ? '#27ae60' : '#e74c3c' }}>{fmtPct(c.pct_ahorro)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: '"Roboto Mono",monospace', fontSize: '11px', color: '#6bccd6' }}>{fmt(c.adjudicado_b)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <NotaMetodologica texto={`Grupo A: ${metodologia.grupo_a || ''} | Grupo B: ${metodologia.grupo_b || ''}`} />
                </div>
            )}
        </div>
    );
}
