import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchBurnRateAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const RITMO_COLOR = { Acelerado: '#0891b2', Lento: '#dc2626', Normal: '#334155' };

export default function TabBurnRate({ filtros, refreshKey }) {
    const [subtitulo, setSubtitulo] = useState('');
    const { data, loading, error } = useAnexo1Fetch(
        fetchBurnRateAnexo1, paramsBase(filtros, { subtitulo: subtitulo || undefined }), refreshKey,
        'No se pudo cargar Burn Rate.',
    );

    const chartData = useMemo(() => {
        if (!data?.tabla_mensual?.length) return null;
        return {
            labels: data.tabla_mensual.map((m) => m.mes.slice(0, 3)),
            datasets: [
                { label: 'Acumulado Real (M$)', data: data.tabla_mensual.map((m) => m.acumulado / 1e6), borderColor: '#1B3FD8', backgroundColor: '#1B3FD818', tension: 0.3, pointRadius: 3 },
                { label: 'Ritmo Ideal (M$)', data: data.tabla_mensual.map((m) => m.esperado / 1e6), borderColor: '#94a3b8', borderDash: [6, 4], pointRadius: 0 },
            ],
        };
    }, [data]);

    if (loading && !data) return <div className="loading-spinner">Cargando Burn Rate…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    if (!data.ultimo_mes_con_datos) {
        return <div className="error-message">No hay datos cargados para el año seleccionado.</div>;
    }

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>Subtítulo</label>
                <select
                    value={subtitulo}
                    onChange={(e) => setSubtitulo(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5 }}
                >
                    <option value="">Todos (consolidado)</option>
                    {data.subtitulos_disponibles.map((s) => (
                        <option key={s.codigo} value={s.concepto}>{s.codigo} {s.nombre}</option>
                    ))}
                </select>
            </div>

            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="Gasto Mensual Promedio" value={fmtMoney(data.kpis.gasto_mensual_promedio)} icon="📊" colorVar="--color-primary" />
                <KpiCard
                    title="Desviación vs. Esperado"
                    value={fmtPct(data.kpis.desviacion_vs_esperado_pct)}
                    icon={data.kpis.desviacion_vs_esperado_pct >= 0 ? '⬆️' : '⬇️'}
                    colorVar={data.kpis.desviacion_vs_esperado_pct >= 0 ? '--color-success' : '--color-danger'}
                />
                <KpiCard title="Proyección a Diciembre" value={fmtMoney(data.kpis.proyeccion_diciembre)} icon="🔮" colorVar="--color-accent" />
                <KpiCard
                    title="% Ejecución Proyectada"
                    value={fmtPct(data.kpis.pct_ejecucion_proyectada)}
                    icon="🎯"
                    colorVar={{ verde: '--color-success', amarillo: '--color-warning', rojo: '--color-danger' }[data.kpis.estado_proyeccion] || '--color-primary'}
                />
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 340, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>Acumulado Real vs. Ritmo Ideal</div>
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

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Mes', 'Gasto', 'Acumulado', 'Esperado', 'Desviación', '% Ejecución', 'Ritmo'].map((h) => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.tabla_mensual.map((m) => (
                            <tr key={m.mes} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{m.mes}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(m.gasto)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(m.acumulado)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(m.esperado)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right', color: (m.desviacion_pct ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmtPct(m.desviacion_pct)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtPct(m.pct_ejecucion)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, fontWeight: 600, color: RITMO_COLOR[m.ritmo] }}>{m.ritmo}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
