import React, { useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import { useAnexo1Fetch } from '../../../hooks/useAnexo1Fetch';
import { fetchDetalladoTemporalAnexo1 } from '../../../api/anexo1SigfeApi';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtM = (n) => 'M$ ' + (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 });
const STACK_COLORS = ['#1B3FD8', '#0FAB5C', '#C47820', '#9333EA', '#D0202F', '#0891B2', '#db2777', '#059669'];
const PALETTE = ['#1B3FD8', '#0FAB5C', '#C47820', '#9333EA', '#D0202F', '#0891B2'];

export default function SubTabTemporal({ filtros }) {
    const [vista, setVista] = useState('apilado');
    const [concepto, setConcepto] = useState('');

    const { data, loading, error } = useAnexo1Fetch(
        fetchDetalladoTemporalAnexo1,
        {
            ue: filtros.ue || undefined, anho: filtros.anho || undefined,
            excluir_34_35: filtros.excluir3435, vista, concepto: vista === 'concepto' ? (concepto || undefined) : undefined,
        },
        0, 'No se pudo cargar la Evolución Temporal.',
    );

    const chartApilado = useMemo(() => {
        if (vista !== 'apilado' || !data?.series?.length) return null;
        return {
            labels: MESES,
            datasets: data.series.map((s, i) => ({
                label: `${s.codigo} ${s.nombre}`.slice(0, 24), data: s.valores.map((v) => v / 1e6),
                backgroundColor: STACK_COLORS[i % STACK_COLORS.length], stack: 'devengado', borderRadius: 2,
            })),
        };
    }, [data, vista]);

    const chartConcepto = useMemo(() => {
        if (vista !== 'concepto' || !data?.series_por_anho) return null;
        const anhos = Object.keys(data.series_por_anho).sort();
        return {
            labels: MESES,
            datasets: anhos.map((a, i) => ({
                label: a, data: data.series_por_anho[a].map((v) => v / 1e6),
                borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length] + '18',
                tension: 0.3, pointRadius: 3, spanGaps: false,
            })),
        };
    }, [data, vista]);

    if (loading && !data) return <div className="loading-spinner">Cargando Evolución Temporal…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    return (
        <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                    <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Vista</label>
                    <select value={vista} onChange={(e) => setVista(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5 }}>
                        <option value="apilado">Composición apilada (año)</option>
                        <option value="concepto">Por concepto (todos los años)</option>
                    </select>
                </div>
                {vista === 'concepto' && (
                    <div>
                        <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Concepto</label>
                        <select value={concepto} onChange={(e) => setConcepto(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5, minWidth: 260 }}>
                            <option value="">Seleccionar concepto…</option>
                            {data.conceptos_disponibles.map((c) => (
                                <option key={c.concepto} value={c.concepto}>{c.codigo} {c.nombre}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {chartApilado && (
                <div className="card" style={{ padding: 16, height: 400 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>Composición del Devengado por Subtítulo — {data.anho}</div>
                    <Bar
                        data={chartApilado}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y * 1e6)}` } } },
                            scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            {vista === 'concepto' && !concepto && (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Selecciona un concepto para ver su evolución histórica.</div>
            )}

            {chartConcepto && (
                <div className="card" style={{ padding: 16, height: 400 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>Evolución Mensual — comparación interanual</div>
                    <Line
                        data={chartConcepto}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y * 1e6)}` } } },
                            scales: { y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}
        </div>
    );
}
