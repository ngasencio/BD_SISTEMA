import React, { useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import { useAnexo1Fetch } from '../../../hooks/useAnexo1Fetch';
import { fetchDetalladoParetoAnexo1 } from '../../../api/anexo1SigfeApi';
import { paramsBase } from '../filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const COLOR_CAT = { A: '#dc2626', B: '#d97706', C: '#16a34a' };

export default function SubTabPareto({ filtros }) {
    const [metrica, setMetrica] = useState('dev');
    const { data, loading, error } = useAnexo1Fetch(
        fetchDetalladoParetoAnexo1, paramsBase(filtros, { metrica }), 0, 'No se pudo cargar el diagrama de Pareto.',
    );

    const chartData = useMemo(() => {
        if (!data?.items?.length) return null;
        const top = data.items.slice(0, 25);
        return {
            labels: top.map((i) => `${i.codigo} ${i.nombre}`.slice(0, 26)),
            datasets: [
                {
                    type: 'bar', label: metrica === 'dev' ? 'Devengado (M$)' : 'Ley (M$)',
                    data: top.map((i) => i.valor / 1e6), backgroundColor: top.map((i) => COLOR_CAT[i.categoria]),
                    yAxisID: 'y', order: 2,
                },
                {
                    type: 'line', label: '% Acumulado', data: top.map((i) => i.pct_acumulado),
                    borderColor: '#D0202F', borderWidth: 2, pointRadius: 3, yAxisID: 'y2', order: 1,
                },
            ],
        };
    }, [data, metrica]);

    if (loading && !data) return <div className="loading-spinner">Cargando Pareto…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Métrica</label>
                <select value={metrica} onChange={(e) => setMetrica(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5 }}>
                    <option value="dev">Devengado</option>
                    <option value="ley">Ley de Presupuestos</option>
                </select>
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 380, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                        Diagrama de Pareto (top 25 ítems hoja) — 🔴 A (80%) · 🟡 B (95%) · 🟢 C
                    </div>
                    <Chart
                        type="bar"
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom' } },
                            scales: {
                                x: { ticks: { font: { size: 9 }, maxRotation: 60 } },
                                y: { position: 'left', ticks: { callback: (v) => `M$${v}` } },
                                y2: { position: 'right', min: 0, max: 100, ticks: { callback: (v) => `${v}%` }, grid: { display: false } },
                            },
                        }}
                    />
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Cat.', '#', 'Concepto', 'Valor', '% Individual', '% Acumulado'].map((h) => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((it, i) => (
                            <tr key={it.codigo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '7px 12px' }}>
                                    <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: COLOR_CAT[it.categoria], color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: '18px' }}>{it.categoria}</span>
                                </td>
                                <td style={{ padding: '7px 12px', fontSize: 12, color: '#94a3b8' }}>{i + 1}</td>
                                <td style={{ padding: '7px 12px', fontSize: 12.5 }}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f' }}>{it.codigo}</span> {it.nombre}</td>
                                <td style={{ padding: '7px 12px', fontSize: 12.5, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(it.valor)}</td>
                                <td style={{ padding: '7px 12px', fontSize: 12.5, textAlign: 'right' }}>{it.pct_individual.toFixed(1)}%</td>
                                <td style={{ padding: '7px 12px', fontSize: 12.5, textAlign: 'right', fontWeight: 600 }}>{it.pct_acumulado.toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
