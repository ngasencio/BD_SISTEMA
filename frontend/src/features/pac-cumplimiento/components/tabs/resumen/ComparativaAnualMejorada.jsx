import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend } from 'chart.js';
import { fmtN } from '../../../utils/format';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 };
const sectionSub = { fontSize: 12, color: '#64748b', marginBottom: 12 };

export default function ComparativaAnualMejorada({ serie }) {
    const puntos = serie ?? [];

    const lineData = useMemo(() => {
        if (!puntos.length) return null;
        return {
            labels: puntos.map((p) => `${p.nombre_mes} ${String(p.anho).slice(2)}`),
            datasets: [{
                label: '% Dentro del PAC',
                data: puntos.map((p) => p.pct_dentro),
                borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.12)',
                fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5,
            }],
        };
    }, [puntos]);

    const lineOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => ` ${ctx.raw}% dentro del PAC`,
                    afterLabel: (ctx) => {
                        const p = puntos[ctx.dataIndex];
                        return p ? `${fmtN(p.total)} formularios (${fmtN(p.dentro)} dentro / ${fmtN(p.fuera)} fuera)` : '';
                    },
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 60, minRotation: 60 } },
            y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, callback: (v) => `${v}%` } },
        },
    };

    if (!puntos.length) {
        return (
            <div style={cardStyle}>
                <div style={sectionTitle}>📈 Comparativa Anual — evolución mensual del % Dentro PAC</div>
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 12 }}>Sin datos históricos suficientes.</div>
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={sectionTitle}>📈 Comparativa Anual — evolución mensual del % Dentro PAC</div>
            <div style={sectionSub}>
                Todos los meses con datos disponibles ({puntos[0].nombre_mes} {puntos[0].anho} — {puntos[puntos.length - 1].nombre_mes} {puntos[puntos.length - 1].anho}), para visualizar la mejora del control del Plan Anual de Compras en el tiempo
            </div>
            <div className="chart-box" style={{ height: 260 }}>
                <Line data={lineData} options={lineOptions} />
            </div>
        </div>
    );
}
