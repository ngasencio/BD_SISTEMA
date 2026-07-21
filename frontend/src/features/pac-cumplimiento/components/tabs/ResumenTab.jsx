import { useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const fmt = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtB = (n) => {
    if (n == null) return '—';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return fmt(n);
};
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

function KpiCard({ label, value, sub, color }) {
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '14px 18px',
            border: '1px solid #e2e8f0', flex: '1 1 170px', minWidth: 150,
            borderTop: `4px solid ${color}`, boxShadow: '0 1px 2px rgba(15,23,42,.04)',
        }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}

export default function ResumenTab({ dentroFuera }) {
    const kpis = dentroFuera?.kpis;
    const comparativa = dentroFuera?.comparativa_anual ?? [];

    const donutData = useMemo(() => {
        if (!kpis || !kpis.total) return null;
        return {
            labels: ['Dentro PAC', 'Fuera PAC'],
            datasets: [{
                data: [kpis.pct_dentro, Math.round((100 - kpis.pct_dentro) * 10) / 10],
                backgroundColor: ['#16a34a', '#dc2626'],
                borderWidth: 0,
                hoverOffset: 6,
            }],
        };
    }, [kpis]);

    const barData = useMemo(() => {
        if (!comparativa.length) return null;
        return {
            labels: comparativa.map((r) => String(r.anho)),
            datasets: [
                { label: '✅ Dentro PAC', data: comparativa.map((r) => r.dentro), backgroundColor: '#16a34a', borderRadius: 4, stack: 'df' },
                { label: '⛔ Fuera PAC', data: comparativa.map((r) => r.fuera), backgroundColor: '#dc2626', borderRadius: 4, stack: 'df' },
            ],
        };
    }, [comparativa]);

    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtN(ctx.raw)} formularios` } },
        },
        scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 } },
        },
    };

    const donutOptions = {
        cutout: '70%',
        plugins: {
            legend: { position: 'bottom', labels: { color: '#64748b', padding: 16, font: { size: 12 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%` } },
        },
    };

    if (!kpis) {
        return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="Total formularios evaluados" value={fmtN(kpis.total)} color="#0ea5e9" sub="con proyecto PAC declarado" />
                <KpiCard label="% Dentro del PAC" value={`${kpis.pct_dentro}%`} color={kpis.pct_dentro >= 70 ? '#16a34a' : kpis.pct_dentro >= 40 ? '#f59e0b' : '#dc2626'} sub={`${fmtN(kpis.dentro)} de ${fmtN(kpis.total)}`} />
                <KpiCard label="⛔ Fuera del PAC" value={fmtN(kpis.fuera)} color="#dc2626" sub={`${Math.round((100 - kpis.pct_dentro) * 10) / 10}% del total`} />
                <KpiCard label="💰 Monto Dentro PAC" value={fmtB(kpis.monto_dentro)} color="#16a34a" />
                <KpiCard label="💸 Monto Fuera PAC" value={fmtB(kpis.monto_fuera)} color="#dc2626" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
                <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                        📊 Distribución Dentro/Fuera PAC
                    </div>
                    <div style={{ height: 240 }}>
                        {donutData ? <Doughnut data={donutData} options={donutOptions} /> : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Sin datos.</div>
                        )}
                    </div>
                </div>

                <div style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                        📅 Comparativa histórica — Dentro vs Fuera por año de derivación
                    </div>
                    <div style={{ height: 240 }}>
                        {barData ? <Bar data={barData} options={barOptions} /> : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Sin datos suficientes para graficar.</div>
                        )}
                    </div>
                </div>
            </div>

            {comparativa.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Año', 'Dentro PAC', 'Fuera PAC', 'Total', '% Dentro'].map((h) => (
                                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', fontSize: 12 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[...comparativa].reverse().map((r) => (
                                <tr key={r.anho} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.anho}</td>
                                    <td style={{ padding: '7px 10px', color: '#15803d', fontWeight: 600 }}>{fmtN(r.dentro)}</td>
                                    <td style={{ padding: '7px 10px', color: '#dc2626', fontWeight: 600 }}>{fmtN(r.fuera)}</td>
                                    <td style={{ padding: '7px 10px' }}>{fmtN(r.total)}</td>
                                    <td style={{ padding: '7px 10px', fontWeight: 700, color: r.pct_dentro >= 70 ? '#15803d' : r.pct_dentro >= 40 ? '#b45309' : '#dc2626' }}>{r.pct_dentro}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
