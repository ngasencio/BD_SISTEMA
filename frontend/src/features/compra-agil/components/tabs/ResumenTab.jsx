import React, { useEffect, useRef } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat('es-CL').format(n || 0);

const ESTADO_COLORS = {
    'Proveedor seleccionado': '#22c55e',
    'Cerrada': '#3b82f6',
    'Publicada': '#f59e0b',
    'Desierta': '#ef4444',
    'Cancelada': '#9ca3af',
};

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

function EstadoBadge({ estado }) {
    const color = ESTADO_COLORS[estado] || '#9ca3af';
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            background: color + '20', color, border: `1px solid ${color}50`,
        }}>
            {estado}
        </span>
    );
}

export default function ResumenTab({ stats, loading, chartsRef }) {
    const doughnutRef = useRef(null);
    const barRef = useRef(null);

    useEffect(() => {
        if (chartsRef && doughnutRef.current) chartsRef.donut = doughnutRef.current;
        if (chartsRef && barRef.current) chartsRef.barMes = barRef.current;
    }, [chartsRef, stats]);

    if (loading) return <div className="loading-spinner">Cargando resumen...</div>;
    if (!stats) return null;

    const { kpis, por_estado, por_mes } = stats;

    const donutData = {
        labels: por_estado.map(e => e.estado),
        datasets: [{
            data: por_estado.map(e => e.cantidad),
            backgroundColor: por_estado.map(e => ESTADO_COLORS[e.estado] || '#6b7280'),
            borderWidth: 2,
            borderColor: '#fff',
        }],
    };

    const meses = por_mes.slice(-12);
    const barData = {
        labels: meses.map(m => m.mes),
        datasets: [
            {
                label: 'Presupuesto estimado',
                data: meses.map(m => m.presupuesto),
                backgroundColor: 'rgba(59,130,246,0.75)',
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 4,
            },
            {
                label: 'Monto OC',
                data: meses.map(m => m.monto_oc),
                backgroundColor: 'rgba(34,197,94,0.75)',
                borderColor: '#22c55e',
                borderWidth: 1,
                borderRadius: 4,
            },
        ],
    };

    const pctAdj = kpis.total_ca > 0 ? ((kpis.adjudicadas / kpis.total_ca) * 100).toFixed(1) : 0;

    return (
        <div>
            {/* ── KPIs fila 1 ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <KpiCard label="Total Compras Ágiles" value={fmtN(kpis.total_ca)} color="#3b82f6" />
                <KpiCard label="Adjudicadas" value={fmtN(kpis.adjudicadas)} sub={`${pctAdj}% del total`} color="#22c55e" />
                <KpiCard label="Desiertas" value={fmtN(kpis.desiertas)} color="#f59e0b" />
                <KpiCard label="Canceladas" value={fmtN(kpis.canceladas)} color="#ef4444" />
            </div>

            {/* ── KPIs fila 2 ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <KpiCard label="Presupuesto Total" value={fmt(kpis.total_presupuesto)} color="#6366f1" />
                <KpiCard label="Monto Total OC" value={fmt(kpis.total_monto_oc)} color="#8b5cf6" />
                <KpiCard label="Ahorro Total" value={fmt(kpis.ahorro_simple)} color="#22c55e" />
                <KpiCard label="% Ahorro Res.188" value={`${kpis.pct_ahorro_res188}%`} sub="Metodología Res.188/2026" color="#10b981" />
            </div>

            {/* ── Gráficos ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                    <div className="card-header card-header-accent">
                        <span>🥧</span>
                        <span className="card-title">Distribución por Estado</span>
                    </div>
                    <div style={{ padding: 16, height: 230, position: 'relative' }}>
                        {por_estado.length > 0
                            ? <Doughnut
                                ref={doughnutRef}
                                data={donutData}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
                                        tooltip: {
                                            callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} compras` },
                                        },
                                    },
                                }}
                            />
                            : <p style={{ color: '#94a3b8' }}>Sin datos</p>}
                    </div>
                </div>

                <div className="card" style={{ overflow: 'hidden' }}>
                    <div className="card-header card-header-accent">
                        <span>📊</span>
                        <span className="card-title">Evolución Mensual — Presupuesto vs OC</span>
                    </div>
                    <div style={{ padding: 16, height: 230, position: 'relative' }}>
                        {meses.length > 0
                            ? <Bar
                                ref={barRef}
                                data={barData}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'top', labels: { font: { size: 11 } } },
                                        tooltip: {
                                            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` },
                                        },
                                    },
                                    scales: {
                                        y: { ticks: { callback: v => `$${(v / 1e6).toFixed(1)}M`, font: { size: 10 } } },
                                        x: { ticks: { font: { size: 10 } } },
                                    },
                                }}
                            />
                            : <p style={{ color: '#94a3b8' }}>Sin datos</p>}
                    </div>
                </div>
            </div>

            {/* ── Tabla de estados ── */}
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>📋</span>
                    <span className="card-title">Detalle por Estado</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{por_estado.length} estados</span>
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Estado</th>
                                <th style={{ textAlign: 'center' }}>Cantidad</th>
                                <th style={{ textAlign: 'right' }}>Presupuesto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {por_estado.map(e => (
                                <tr key={e.estado}>
                                    <td><EstadoBadge estado={e.estado} /></td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{fmtN(e.cantidad)}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{fmt(e.presupuesto)}</td>
                                </tr>
                            ))}
                            {por_estado.length === 0 && (
                                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sin datos</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
