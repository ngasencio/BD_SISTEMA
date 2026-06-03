import React, { useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

const fmtCompact = (n) => {
    if (!n) return '$0';
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)} MM`;
    if (n >= 1_000_000) return `$${Math.round(n / 1_000_000).toLocaleString('es-CL')} M`;
    return fmt(n);
};

const ESTADO_COLORS = {
    'Adjudicada': '#27ae60',
    'Publicada': '#6bccd6',
    'Cerrada': '#aab8cc',
    'Revocada': '#e74c3c',
    'Desierta (o art. 3 ó 9 Ley 19.886)': '#f39c12',
    'En Evaluación': '#9b59b6',
    'Suspendida': '#fd7e14',
};

const TIPO_COLORS = [
    'rgba(26,61,113,0.80)', 'rgba(26,61,113,0.65)', 'rgba(26,61,113,0.50)',
    'rgba(107,204,214,0.80)', 'rgba(107,204,214,0.60)', 'rgba(243,156,18,0.75)',
    'rgba(39,174,96,0.70)', 'rgba(231,76,60,0.65)',
];

function RankList({ items, color }) {
    const max = items[0]?.[1] || 1;
    return (
        <div style={{ padding: '4px 0' }}>
            {items.map(([nombre, count], i) => (
                <div key={nombre} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '7px 0',
                    borderBottom: i < items.length - 1 ? '1px solid #f0f2f5' : 'none',
                }}>
                    <span style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: color, color: '#fff',
                        fontSize: '11px', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>{i + 1}</span>
                    <span style={{
                        flex: 1, fontSize: '13px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={nombre}>{nombre}</span>
                    <span style={{ fontWeight: 700, color, fontSize: '13px', flexShrink: 0 }}>{count}</span>
                    <div style={{ width: '56px', height: '5px', background: '#eef0f3', borderRadius: '3px', flexShrink: 0 }}>
                        <div style={{
                            width: `${(count / max) * 100}%`,
                            height: '100%', background: color, borderRadius: '3px',
                        }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ResumenSect({ licitaciones = [] }) {
    const kpis = useMemo(() => {
        const total = licitaciones.length;
        const adjudicadas = licitaciones.filter(l => l.Estado === 'Adjudicada').length;
        const montoTotal = licitaciones.reduce((acc, l) => acc + (parseFloat(l.MontoEstimado) || 0), 0);
        const renovables = licitaciones.filter(l => l.EsRenovable).length;
        const tipos = new Set(licitaciones.map(l => l.Tipo).filter(Boolean)).size;
        const oferentes = licitaciones
            .map(l => l.Adj_NumeroOferentes)
            .filter(n => n != null && n > 0);
        const promedioOferentes = oferentes.length
            ? (oferentes.reduce((a, b) => a + b, 0) / oferentes.length).toFixed(1)
            : '—';
        const pctAdj = total ? ((adjudicadas / total) * 100).toFixed(1) : '0.0';
        return { total, adjudicadas, montoTotal, renovables, tipos, promedioOferentes, pctAdj };
    }, [licitaciones]);

    const estadoChart = useMemo(() => {
        const counts = {};
        licitaciones.forEach(l => { if (l.Estado) counts[l.Estado] = (counts[l.Estado] || 0) + 1; });
        const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        return {
            labels,
            datasets: [{
                data: labels.map(k => counts[k]),
                backgroundColor: labels.map(l => ESTADO_COLORS[l] || '#bdc3c7'),
                borderWidth: 2, borderColor: '#fff',
            }],
        };
    }, [licitaciones]);

    const tipoChart = useMemo(() => {
        const counts = {};
        licitaciones.forEach(l => { if (l.Tipo) counts[l.Tipo] = (counts[l.Tipo] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return {
            labels: sorted.map(([t]) => t),
            datasets: [{
                label: 'Licitaciones',
                data: sorted.map(([, c]) => c),
                backgroundColor: TIPO_COLORS,
                borderRadius: 4, borderWidth: 0,
            }],
        };
    }, [licitaciones]);

    const topCompradores = useMemo(() => {
        const counts = {};
        licitaciones.forEach(l => { if (l.C_Usuario) counts[l.C_Usuario] = (counts[l.C_Usuario] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [licitaciones]);

    const topUnidades = useMemo(() => {
        const counts = {};
        licitaciones.forEach(l => { if (l.C_Unidad) counts[l.C_Unidad] = (counts[l.C_Unidad] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [licitaciones]);

    const rangoMontos = useMemo(() => {
        const montos = licitaciones.map(l => parseFloat(l.MontoEstimado) || 0).filter(m => m > 0);
        if (!montos.length) return { min: 0, avg: 0, max: 0 };
        const sum = montos.reduce((a, b) => a + b, 0);
        return { min: Math.min(...montos), avg: sum / montos.length, max: Math.max(...montos) };
    }, [licitaciones]);

    const ultimas = useMemo(() =>
        [...licitaciones]
            .filter(l => l.FechaPublicacion)
            .sort((a, b) => new Date(b.FechaPublicacion) - new Date(a.FechaPublicacion))
            .slice(0, 10),
        [licitaciones]
    );

    const CHART_OPTS_BASE = {
        plugins: { legend: { labels: { color: '#6c757d', font: { size: 11, family: 'Roboto' } } } },
    };

    return (
        <div className="tab-view active" id="tab-resumen">

            {/* ── Fila 1: KPIs ── */}
            <div className="kpi-grid">
                <div className="kpi-card kpi-azul">
                    <span className="kpi-icon">📋</span>
                    <div className="kpi-label">Total Licitaciones</div>
                    <div className="kpi-value">{kpis.total.toLocaleString('es-CL')}</div>
                    <div className="kpi-meta">en base de datos</div>
                </div>
                <div className="kpi-card kpi-rojo">
                    <span className="kpi-icon">💰</span>
                    <div className="kpi-label">Monto Total Estimado</div>
                    <div className="kpi-value" style={{ fontSize: '18px' }}>{fmtCompact(kpis.montoTotal)}</div>
                    <div className="kpi-meta">CLP acumulado</div>
                </div>
                <div className="kpi-card kpi-verde">
                    <span className="kpi-icon">✅</span>
                    <div className="kpi-label">Adjudicadas</div>
                    <div className="kpi-value">{kpis.adjudicadas.toLocaleString('es-CL')}</div>
                    <div className="kpi-meta">{kpis.pctAdj}% del total</div>
                </div>
                <div className="kpi-card kpi-celeste">
                    <span className="kpi-icon">👥</span>
                    <div className="kpi-label">Prom. Oferentes</div>
                    <div className="kpi-value">{kpis.promedioOferentes}</div>
                    <div className="kpi-meta">por licitación adjudicada</div>
                </div>
                <div className="kpi-card kpi-amarillo">
                    <span className="kpi-icon">🔄</span>
                    <div className="kpi-label">Renovables</div>
                    <div className="kpi-value">{kpis.renovables.toLocaleString('es-CL')}</div>
                    <div className="kpi-meta">con opción de renovación</div>
                </div>
                <div className="kpi-card kpi-azul">
                    <span className="kpi-icon">🗂️</span>
                    <div className="kpi-label">Tipos Distintos</div>
                    <div className="kpi-value">{kpis.tipos}</div>
                    <div className="kpi-meta">modalidades de compra</div>
                </div>
            </div>

            {/* ── Fila 2: Gráficos Estado + Tipo ── */}
            <div className="grid-2" style={{ marginTop: '18px' }}>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📊</span>
                        <span className="card-title">Distribución por Estado</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap">
                            <Doughnut
                                data={estadoChart}
                                options={{ ...CHART_OPTS_BASE, cutout: '60%' }}
                            />
                        </div>
                    </div>
                </div>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>🗂️</span>
                        <span className="card-title">Distribución por Tipo</span>
                    </div>
                    <div className="card-body">
                        <div className="chart-wrap">
                            <Bar
                                data={tipoChart}
                                options={{
                                    indexAxis: 'y',
                                    plugins: { legend: { display: false } },
                                    scales: {
                                        x: { ticks: { color: '#6c757d', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                                        y: { ticks: { color: '#6c757d', font: { size: 10 } }, grid: { display: false } },
                                    },
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Fila 3: Top Compradores + Top Unidades ── */}
            <div className="grid-2" style={{ marginTop: '18px' }}>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>👤</span>
                        <span className="card-title">Top 5 Compradores</span>
                    </div>
                    <div className="card-body" style={{ padding: '8px 16px 12px' }}>
                        <RankList items={topCompradores} color="#1a3d71" />
                    </div>
                </div>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>🏥</span>
                        <span className="card-title">Top 5 Unidades Compradoras</span>
                    </div>
                    <div className="card-body" style={{ padding: '8px 16px 12px' }}>
                        <RankList items={topUnidades} color="#0d7a85" />
                    </div>
                </div>
            </div>

            {/* ── Fila 4: Rango de Montos ── */}
            <div style={{ marginTop: '18px' }}>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>💵</span>
                        <span className="card-title">Rango de Montos Estimados</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: '#9aabb8', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mínimo</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#27ae60' }}>{fmt(rangoMontos.min)}</div>
                            </div>
                            <div style={{ width: '1px', background: '#eef0f3' }} />
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: '#9aabb8', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Promedio</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a3d71' }}>{fmt(rangoMontos.avg)}</div>
                            </div>
                            <div style={{ width: '1px', background: '#eef0f3' }} />
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: '#9aabb8', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Máximo</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#e74c3c' }}>{fmt(rangoMontos.max)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Fila 5: Últimas 10 licitaciones ── */}
            <div style={{ marginTop: '18px' }}>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>🕐</span>
                        <span className="card-title">Últimas 10 Licitaciones Publicadas</span>
                    </div>
                    <div className="table-responsive">
                        <table className="table-gob">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Nombre</th>
                                    <th>Tipo</th>
                                    <th>Estado</th>
                                    <th>Comprador</th>
                                    <th>Unidad</th>
                                    <th>Monto Estimado</th>
                                    <th>Publicación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ultimas.length === 0 ? (
                                    <tr><td colSpan="8" style={{ textAlign: 'center', color: '#aaa' }}>Sin datos</td></tr>
                                ) : ultimas.map(lic => (
                                    <tr key={lic.codigo_licitacion}>
                                        <td className="td-mono" style={{ fontSize: '11px' }}>{lic.codigo_licitacion}</td>
                                        <td>
                                            <span title={lic.Nombre} style={{ maxWidth: '200px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {lic.Nombre}
                                            </span>
                                        </td>
                                        <td><span className="tag tag-azul">{lic.Tipo}</span></td>
                                        <td>
                                            <span className="tag" style={{
                                                background: `${ESTADO_COLORS[lic.Estado] || '#bdc3c7'}22`,
                                                color: ESTADO_COLORS[lic.Estado] || '#555',
                                                border: `1px solid ${ESTADO_COLORS[lic.Estado] || '#bdc3c7'}55`,
                                            }}>{lic.Estado}</span>
                                        </td>
                                        <td style={{ fontSize: '12px' }}>{lic.C_Usuario}</td>
                                        <td style={{ fontSize: '12px' }}>{lic.C_Unidad}</td>
                                        <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>
                                            {lic.MontoEstimado ? fmt(lic.MontoEstimado) : '—'}
                                        </td>
                                        <td style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px' }}>
                                            {new Date(lic.FechaPublicacion).toLocaleDateString('es-CL')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    );
}
