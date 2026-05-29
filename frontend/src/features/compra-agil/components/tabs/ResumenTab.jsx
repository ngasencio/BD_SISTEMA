import React, { useEffect, useRef } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat('es-CL').format(n || 0);

const ESTADO_COLORS = {
    'Proveedor seleccionado': '#22c55e',
    'Cerrada': '#3b82f6',
    'Publicada': '#f59e0b',
    'Desierta': '#ef4444',
    'Cancelada': '#9ca3af',
};

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
                backgroundColor: 'rgba(59,130,246,0.6)',
                borderColor: '#3b82f6',
                borderWidth: 1,
            },
            {
                label: 'Monto OC',
                data: meses.map(m => m.monto_oc),
                backgroundColor: 'rgba(34,197,94,0.6)',
                borderColor: '#22c55e',
                borderWidth: 1,
            },
        ],
    };

    const pctAdj = kpis.total_ca > 0 ? ((kpis.adjudicadas / kpis.total_ca) * 100).toFixed(1) : 0;

    return (
        <div>
            {/* KPIs principales */}
            <section className="kpi-grid">
                <KpiCard title="Total Compras Ágiles" value={fmtN(kpis.total_ca)} icon="🛒" colorVar="--color-primary" />
                <KpiCard title="Adjudicadas" value={fmtN(kpis.adjudicadas)} subtitle={`${pctAdj}% del total`} icon="✅" colorVar="--color-success" />
                <KpiCard title="Desiertas" value={fmtN(kpis.desiertas)} icon="⚠️" colorVar="--color-warning" />
                <KpiCard title="Canceladas" value={fmtN(kpis.canceladas)} icon="❌" colorVar="--color-danger" />
            </section>
            <section className="kpi-grid" style={{ marginTop: 0 }}>
                <KpiCard title="Presupuesto Total" value={fmt(kpis.total_presupuesto)} icon="📋" colorVar="--color-primary" />
                <KpiCard title="Monto Total OC" value={fmt(kpis.total_monto_oc)} icon="🏷️" colorVar="--color-accent" />
                <KpiCard title="Ahorro Total" value={fmt(kpis.ahorro_simple)} icon="💰" colorVar="--color-success" />
                <KpiCard title="% Ahorro Res.188" value={`${kpis.pct_ahorro_res188}%`} subtitle="Metodología Res.188/2026" icon="📊" colorVar="--color-success" />
            </section>

            {/* Charts */}
            <div className="charts-row">
                <div className="card chart-card">
                    <h3 className="card-title">Distribución por Estado</h3>
                    <div className="chart-container-sm">
                        <Doughnut
                            ref={doughnutRef}
                            data={donutData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { position: 'right' },
                                    tooltip: {
                                        callbacks: {
                                            label: ctx => ` ${ctx.label}: ${ctx.parsed} compras`,
                                        },
                                    },
                                },
                            }}
                        />
                    </div>
                    {/* Tabla de estados */}
                    <table className="data-table" style={{ marginTop: 12 }}>
                        <thead>
                            <tr><th>Estado</th><th>Cantidad</th><th>Presupuesto</th></tr>
                        </thead>
                        <tbody>
                            {por_estado.map(e => (
                                <tr key={e.estado}>
                                    <td>
                                        <span className="estado-dot" style={{ background: ESTADO_COLORS[e.estado] || '#6b7280' }} />
                                        {e.estado}
                                    </td>
                                    <td>{fmtN(e.cantidad)}</td>
                                    <td>{fmt(e.presupuesto)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="card chart-card">
                    <h3 className="card-title">Evolución Mensual — Presupuesto vs OC</h3>
                    <div className="chart-container-sm">
                        <Bar
                            ref={barRef}
                            data={barData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { position: 'top' },
                                    tooltip: {
                                        callbacks: {
                                            label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
                                        },
                                    },
                                },
                                scales: {
                                    y: {
                                        ticks: {
                                            callback: v => `$${(v / 1000000).toFixed(1)}M`,
                                        },
                                    },
                                },
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
