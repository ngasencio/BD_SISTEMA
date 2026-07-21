import { useMemo } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import { fmtN, colorPct } from '../../../utils/format';

ChartJS.register(BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 };
const sectionSub = { fontSize: 12, color: '#64748b', marginBottom: 12 };

export default function TemporalidadMensual({ data, anho }) {
    const meses = data?.meses ?? [];
    const anhoAnterior = data?.anho_anterior ?? (anho ? anho - 1 : null);

    const barData = useMemo(() => {
        if (!meses.length) return null;
        return {
            labels: meses.map((m) => m.nombre_mes),
            datasets: [
                { label: '✅ Dentro PAC', data: meses.map((m) => m.dentro), backgroundColor: '#16a34a', borderRadius: 4, stack: 'df' },
                { label: '⛔ Fuera PAC', data: meses.map((m) => m.fuera), backgroundColor: '#dc2626', borderRadius: 4, stack: 'df' },
            ],
        };
    }, [meses]);

    const lineData = useMemo(() => {
        if (!meses.length) return null;
        return {
            labels: meses.map((m) => m.nombre_mes),
            datasets: [
                {
                    label: `${anho ?? ''}`, data: meses.map((m) => m.pct_dentro),
                    borderColor: '#0ea5e9', backgroundColor: '#0ea5e9', tension: 0.3, spanGaps: true,
                },
                {
                    label: `${anhoAnterior ?? ''}`, data: meses.map((m) => m.pct_dentro_anho_anterior),
                    borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderDash: [5, 4], tension: 0.3, spanGaps: true,
                },
            ],
        };
    }, [meses, anho, anhoAnterior]);

    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtN(ctx.raw)} formularios` } },
        },
        scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 } },
        },
    };

    const lineOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw == null ? 'sin datos' : ctx.raw + '%'}` } },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, callback: (v) => `${v}%` } },
        },
    };

    if (!meses.length) {
        return (
            <div style={cardStyle}>
                <div style={sectionTitle}>📅 Temporalidad — comportamiento mensual</div>
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 12 }}>Sin datos para el período seleccionado.</div>
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>📅 Temporalidad — comportamiento mensual</div>
            <div style={sectionSub}>Recuento de FSC Dentro/Fuera PAC mes a mes, comparado contra {anhoAnterior}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="chart-box" style={{ height: 220 }}><Bar data={barData} options={barOptions} /></div>
                <div className="chart-box" style={{ height: 220 }}><Line data={lineData} options={lineOptions} /></div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Mes', 'Dentro', 'Fuera', 'Total', '% Dentro', `% Dentro ${anhoAnterior}`, 'Variación'].map((h) => (
                                <th key={h} style={{ padding: '7px 9px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {meses.map((m) => (
                            <tr key={m.mes} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 9px', fontWeight: 600 }}>{m.nombre_mes}</td>
                                <td style={{ padding: '6px 9px', color: '#15803d', fontWeight: 600 }}>{fmtN(m.dentro)}</td>
                                <td style={{ padding: '6px 9px', color: '#dc2626', fontWeight: 600 }}>{fmtN(m.fuera)}</td>
                                <td style={{ padding: '6px 9px' }}>{fmtN(m.total)}</td>
                                <td style={{ padding: '6px 9px', fontWeight: 700, color: m.pct_dentro == null ? '#94a3b8' : colorPct(m.pct_dentro) }}>
                                    {m.pct_dentro == null ? '—' : `${m.pct_dentro}%`}
                                </td>
                                <td style={{ padding: '6px 9px', color: '#64748b' }}>
                                    {m.pct_dentro_anho_anterior == null ? '—' : `${m.pct_dentro_anho_anterior}%`}
                                </td>
                                <td style={{ padding: '6px 9px', fontWeight: 600, color: m.variacion_pp == null ? '#94a3b8' : m.variacion_pp >= 0 ? '#15803d' : '#dc2626' }}>
                                    {m.variacion_pp == null ? '—' : `${m.variacion_pp > 0 ? '▲' : m.variacion_pp < 0 ? '▼' : '='} ${Math.abs(m.variacion_pp)} pp`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
