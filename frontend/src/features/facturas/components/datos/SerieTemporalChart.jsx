import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend } from 'chart.js';
import { cardStyle, sectionTitle, sectionSub, emptyState } from './styles';
import { fmtN, fmtCLP, fmtCLPCorto, fmtPeriodo } from '../../utils/format';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, Legend);

export default function SerieTemporalChart({ serie }) {
    const [metrica, setMetrica] = useState('count'); // 'count' | 'monto_total'
    const puntos = serie ?? [];

    const chartData = useMemo(() => {
        if (!puntos.length) return null;
        const esMonto = metrica === 'monto_total';
        return {
            labels: puntos.map((p) => fmtPeriodo(p.periodo)),
            datasets: [{
                label: esMonto ? 'Monto facturado' : 'Facturas recibidas',
                data: puntos.map((p) => p[metrica]),
                borderColor: '#3b6fc9', backgroundColor: 'rgba(59,111,201,0.12)',
                fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5,
            }],
        };
    }, [puntos, metrica]);

    const options = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => metrica === 'monto_total'
                        ? ` ${fmtCLP(ctx.raw)}`
                        : ` ${fmtN(ctx.raw)} facturas`,
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: {
                beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: {
                    font: { size: 11 },
                    callback: (v) => metrica === 'monto_total' ? fmtCLPCorto(v) : fmtN(v),
                },
            },
        },
    };

    return (
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                    <div style={sectionTitle}>📈 Evolución Mensual</div>
                    <div style={sectionSub}>
                        Cantidad de facturas o monto total recibido desde DIPRES/Acepta, agrupado por mes de emisión.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
                    {[{ id: 'count', label: 'Cantidad' }, { id: 'monto_total', label: 'Monto' }].map(o => (
                        <button
                            key={o.id}
                            onClick={() => setMetrica(o.id)}
                            style={{
                                padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none',
                                cursor: 'pointer',
                                background: metrica === o.id ? '#fff' : 'transparent',
                                color: metrica === o.id ? '#1e3a5f' : '#64748b',
                                boxShadow: metrica === o.id ? '0 1px 2px rgba(15,23,42,.15)' : 'none',
                            }}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>
            {!puntos.length ? (
                <div style={emptyState}>Sin datos temporales suficientes.</div>
            ) : (
                <div className="chart-box" style={{ height: 260, marginTop: 8 }}>
                    <Line data={chartData} options={options} />
                </div>
            )}
        </div>
    );
}
