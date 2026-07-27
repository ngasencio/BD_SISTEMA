import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchTendenciasAnexo1 } from '../../api/anexo1SigfeApi';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const PALETTE = ['#1B3FD8', '#0FAB5C', '#C47820', '#9333EA', '#D0202F', '#0891B2'];

export default function TabTendencias({ filtros, refreshKey }) {
    const [subtitulo, setSubtitulo] = useState('');
    const [anhosSeleccionados, setAnhosSeleccionados] = useState(null);
    const [metrica, setMetrica] = useState('devengado');

    const { data, loading, error } = useAnexo1Fetch(
        fetchTendenciasAnexo1,
        {
            ue: filtros.ue || undefined,
            excluir_34_35: filtros.excluir3435,
            subtitulo: subtitulo || undefined,
            anhos: anhosSeleccionados?.length ? anhosSeleccionados.join(',') : undefined,
        },
        refreshKey,
        'No se pudo cargar Histórico y Tendencias.',
    );

    useEffect(() => {
        if (data?.anhos_disponibles && anhosSeleccionados === null) {
            setAnhosSeleccionados(data.anhos_disponibles);
        }
    }, [data, anhosSeleccionados]);

    const toggleAnho = (anho) => {
        setAnhosSeleccionados((prev) => {
            const actual = prev || data.anhos_disponibles;
            if (actual.includes(anho)) {
                return actual.length > 1 ? actual.filter((a) => a !== anho) : actual;
            }
            return [...actual, anho].sort();
        });
    };

    const chartData = useMemo(() => {
        if (!data?.series_por_anho) return null;
        const anhosUsados = Object.keys(data.series_por_anho).map(Number).sort();
        const datasets = anhosUsados.map((anho, i) => {
            const col = PALETTE[i % PALETTE.length];
            const serie = data.series_por_anho[String(anho)][metrica];
            return {
                label: String(anho), data: serie.map((v) => v / 1e6),
                borderColor: col, backgroundColor: col + '18',
                borderWidth: anho === data.anho_base ? 2.5 : 1.5,
                pointRadius: 3, tension: 0.3,
            };
        });
        if (data.proyeccion_anho_base && metrica === 'devengado') {
            datasets.push({
                label: `Proyección ${data.anho_base}`,
                data: data.proyeccion_anho_base.map((v) => v / 1e6),
                borderColor: '#94a3b8', borderDash: [6, 4], pointRadius: 0, borderWidth: 2,
            });
        }
        return { labels: MESES, datasets };
    }, [data, metrica]);

    if (loading && !data) return <div className="loading-spinner">Cargando Histórico y Tendencias…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data || !data.anhos_disponibles.length) return <div className="error-message">No hay datos históricos cargados.</div>;

    const anhosMostrados = anhosSeleccionados || data.anhos_disponibles;

    return (
        <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                    <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Subtítulo</label>
                    <select value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5 }}>
                        <option value="">Todos (consolidado)</option>
                        {data.subtitulos_disponibles.map((s) => (
                            <option key={s.codigo} value={s.concepto}>{s.codigo} {s.nombre}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Métrica</label>
                    <select value={metrica} onChange={(e) => setMetrica(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5 }}>
                        <option value="devengado">Devengado</option>
                        <option value="efectivo">Efectivo</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {data.anhos_disponibles.map((a) => (
                        <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 20, cursor: 'pointer', background: anhosMostrados.includes(a) ? '#eff6ff' : '#fff' }}>
                            <input type="checkbox" checked={anhosMostrados.includes(a)} onChange={() => toggleAnho(a)} /> {a}
                        </label>
                    ))}
                </div>
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 380, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                        Evolución Mensual ({metrica === 'devengado' ? 'Devengado' : 'Efectivo'}) — comparación interanual
                    </div>
                    <Line
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom' } },
                            scales: { y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            {data.tabla_subtitulos.length > 0 && (
                <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                    <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0' }}>
                        Proyección {data.anho_base} vs. Cierre {data.anho_base - 1} por Subtítulo
                    </div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Subtítulo', 'Acumulado Real', 'Proyección Dic.', 'Cierre Año Anterior', 'Δ', 'Δ%'].map((h) => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.tabla_subtitulos.map((s) => (
                                <tr key={s.codigo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{s.codigo} {s.nombre}</td>
                                    <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(s.acumulado_real)}</td>
                                    <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(s.proyeccion_diciembre)}</td>
                                    <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(s.cierre_anio_anterior)}</td>
                                    <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right', color: s.delta >= 0 ? '#16a34a' : '#dc2626' }}>{fmtMoney(s.delta)}</td>
                                    <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right', fontWeight: 700, color: s.delta >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(s.delta_pct)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
