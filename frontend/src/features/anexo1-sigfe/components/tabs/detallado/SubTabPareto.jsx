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
    const [seleccionado, setSeleccionado] = useState(null);
    const { data, loading, error } = useAnexo1Fetch(
        fetchDetalladoParetoAnexo1, paramsBase(filtros, { metrica }), 0, 'No se pudo cargar el diagrama de Pareto.',
    );

    const topItems = useMemo(() => (data?.items || []).slice(0, 25), [data]);

    const chartData = useMemo(() => {
        if (!topItems.length) return null;
        return {
            labels: topItems.map((i) => `${i.codigo} ${i.nombre}`.slice(0, 26)),
            datasets: [
                {
                    type: 'bar', label: metrica === 'dev' ? 'Devengado (M$)' : 'Ley (M$)',
                    data: topItems.map((i) => i.valor / 1e6), backgroundColor: topItems.map((i) => COLOR_CAT[i.categoria]),
                    yAxisID: 'y', order: 2,
                },
                {
                    type: 'line', label: '% Acumulado', data: topItems.map((i) => i.pct_acumulado),
                    borderColor: '#D0202F', borderWidth: 2, pointRadius: 3, yAxisID: 'y2', order: 1,
                },
            ],
        };
    }, [topItems, metrica]);

    if (loading && !data) return <div className="loading-spinner">Cargando Pareto…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    const onClickBarra = (evt, els) => {
        if (!els.length) return;
        const codigo = topItems[els[0].index]?.codigo;
        setSeleccionado((prev) => (prev === codigo ? null : codigo));
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gob-gris4)', display: 'block', marginBottom: 4 }}>Métrica</label>
                <select value={metrica} onChange={(e) => setMetrica(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--gob-gris3)', borderRadius: 7, fontSize: 12.5 }}>
                    <option value="dev">Devengado</option>
                    <option value="ley">Ley de Presupuestos</option>
                </select>
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 380, marginBottom: 20 }}>
                    <div
                        style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }}
                        data-tip="Clasificación ABC: los ítems que acumulan hasta 80% del valor son A (críticos), hasta 95% son B, el resto C — prioriza dónde poner atención."
                    >
                        Diagrama de Pareto (top 25 ítems hoja) — 🔴 A (80%) · 🟡 B (95%) · 🟢 C
                    </div>
                    <Chart
                        type="bar"
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            onClick: onClickBarra,
                            onHover: cursorPointer,
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

            {seleccionado && (() => {
                const it = data.items.find((x) => x.codigo === seleccionado);
                return it ? (
                    <div className="analysis-context">
                        🔎 Analizando: {it.codigo} {it.nombre}
                        <button onClick={() => setSeleccionado(null)} title="Limpiar selección">✕</button>
                    </div>
                ) : null;
            })()}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th>Cat.</th>
                            <th>#</th>
                            <th>Concepto</th>
                            <th>Valor</th>
                            <th>% Individual</th>
                            <th>% Acumulado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((it, i) => (
                            <tr key={it.codigo} style={it.codigo === seleccionado ? { background: 'var(--gob-celeste-lt)' } : undefined}>
                                <td>
                                    <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: COLOR_CAT[it.categoria], color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: '18px' }}>{it.categoria}</span>
                                </td>
                                <td style={{ color: 'var(--gob-gris4)' }}>{i + 1}</td>
                                <td className="td-mono" style={{ fontSize: 12.5 }}><span style={{ fontWeight: 700, color: 'var(--gob-azul)' }}>{it.codigo}</span> {it.nombre}</td>
                                <td className="td-monto" style={{ fontWeight: 600 }}>{fmtMoney(it.valor)}</td>
                                <td className="td-monto">{it.pct_individual.toFixed(1)}%</td>
                                <td className="td-monto" style={{ fontWeight: 600 }}>{it.pct_acumulado.toFixed(1)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
