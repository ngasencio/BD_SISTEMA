import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { fmtN, colorPct } from '../../../utils/format';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 };
const sectionSub = { fontSize: 12, color: '#64748b', marginBottom: 12 };

export default function PorSubdireccion({ data }) {
    const filas = data?.subdirecciones ?? [];
    const anhoAnterior = data?.anho_anterior;

    const barData = useMemo(() => {
        if (!filas.length) return null;
        return {
            labels: filas.map((f) => f.nombre),
            datasets: [
                { label: '✅ Dentro PAC', data: filas.map((f) => f.dentro), backgroundColor: '#16a34a', borderRadius: 4, stack: 'df' },
                { label: '⛔ Fuera PAC', data: filas.map((f) => f.fuera), backgroundColor: '#dc2626', borderRadius: 4, stack: 'df' },
            ],
        };
    }, [filas]);

    const barOptions = {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtN(ctx.raw)} formularios` } },
        },
        scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        },
    };

    if (!filas.length) {
        return (
            <div style={cardStyle}>
                <div style={sectionTitle}>🏛️ Por Subdirección</div>
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 12 }}>Sin datos para el período seleccionado.</div>
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>🏛️ Por Subdirección</div>
            <div style={sectionSub}>
                Recuento Dentro/Fuera PAC por subdirección (Dirección SS Osorno), comparado contra {anhoAnterior}
            </div>

            <div className="chart-box" style={{ height: Math.max(180, filas.length * 46) }}>
                <Bar data={barData} options={barOptions} />
            </div>

            <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Subdirección', 'Dentro', 'Fuera', 'Total', '% Dentro', `% Dentro ${anhoAnterior}`, 'Variación'].map((h) => (
                                <th key={h} style={{ padding: '7px 9px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((f) => (
                            <tr key={f.subdireccion_id ?? f.nombre} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 9px', fontWeight: 600 }}>{f.nombre}</td>
                                <td style={{ padding: '6px 9px', color: '#15803d', fontWeight: 600 }}>{fmtN(f.dentro)}</td>
                                <td style={{ padding: '6px 9px', color: '#dc2626', fontWeight: 600 }}>{fmtN(f.fuera)}</td>
                                <td style={{ padding: '6px 9px' }}>{fmtN(f.total)}</td>
                                <td style={{ padding: '6px 9px', fontWeight: 700, color: colorPct(f.pct_dentro) }}>{f.pct_dentro}%</td>
                                <td style={{ padding: '6px 9px', color: '#64748b' }}>
                                    {f.pct_dentro_anho_anterior == null ? '—' : `${f.pct_dentro_anho_anterior}%`}
                                </td>
                                <td style={{ padding: '6px 9px', fontWeight: 600, color: f.variacion_pp == null ? '#94a3b8' : f.variacion_pp >= 0 ? '#15803d' : '#dc2626' }}>
                                    {f.variacion_pp == null ? '—' : `${f.variacion_pp > 0 ? '▲' : f.variacion_pp < 0 ? '▼' : '='} ${Math.abs(f.variacion_pp)} pp`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
