import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchBurnRateAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const RITMO_COLOR = { Acelerado: '#0891b2', Lento: '#dc2626', Normal: 'var(--gob-gris5)' };

export default function TabBurnRate({ filtros, refreshKey }) {
    const [subtitulo, setSubtitulo] = useState('');
    const [mesSeleccionado, setMesSeleccionado] = useState(null);
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

    const onClickMes = (evt, els) => {
        if (!els.length) return;
        const mes = data.tabla_mensual[els[0].index]?.mes;
        setMesSeleccionado((prev) => (prev === mes ? null : mes));
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gob-gris4)', display: 'block', marginBottom: 4 }}>Subtítulo</label>
                <select
                    value={subtitulo}
                    onChange={(e) => setSubtitulo(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid var(--gob-gris3)', borderRadius: 7, fontSize: 12.5 }}
                >
                    <option value="">Todos (consolidado)</option>
                    {data.subtitulos_disponibles.map((s) => (
                        <option key={s.codigo} value={s.concepto}>{s.codigo} {s.nombre}</option>
                    ))}
                </select>
            </div>

            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="Gasto Mensual Promedio" value={fmtMoney(data.kpis.gasto_mensual_promedio)} icon="📊" colorVar="--color-primary" tip="Devengado acumulado dividido por la cantidad de meses transcurridos con datos." />
                <KpiCard
                    title="Desviación vs. Esperado"
                    value={fmtPct(data.kpis.desviacion_vs_esperado_pct)}
                    icon={data.kpis.desviacion_vs_esperado_pct >= 0 ? '⬆️' : '⬇️'}
                    colorVar={data.kpis.desviacion_vs_esperado_pct >= 0 ? '--color-success' : '--color-danger'}
                    tip="Qué tan lejos está el gasto acumulado real del ritmo ideal lineal (Ley/12 × meses transcurridos)."
                />
                <KpiCard title="Proyección a Diciembre" value={fmtMoney(data.kpis.proyeccion_diciembre)} icon="🔮" colorVar="--color-accent" tip="Devengado acumulado + gasto mensual promedio × meses restantes del año." />
                <KpiCard
                    title="% Ejecución Proyectada"
                    value={fmtPct(data.kpis.pct_ejecucion_proyectada)}
                    icon="🎯"
                    colorVar={{ verde: '--color-success', amarillo: '--color-warning', rojo: '--color-danger' }[data.kpis.estado_proyeccion] || '--color-primary'}
                    tip="Proyección a diciembre sobre la Ley — ≥90% en ruta, 70-90% atención, <70% riesgo."
                />
            </div>

            {data.kpis.pct_ejecucion_proyectada != null && (
                <div className="progress-row" style={{ marginBottom: 20 }}>
                    <span className="progress-label">% Ejecución Proyectada a Diciembre</span>
                    <div className="progress-track">
                        <div
                            className={`progress-fill ${data.kpis.estado_proyeccion === 'rojo' ? 'rojo' : data.kpis.estado_proyeccion === 'amarillo' ? 'amarillo' : ''}`}
                            style={{ width: `${Math.min(100, Math.max(0, data.kpis.pct_ejecucion_proyectada))}%` }}
                        />
                    </div>
                    <span className="progress-val">{fmtPct(data.kpis.pct_ejecucion_proyectada)}</span>
                </div>
            )}

            {chartData && (
                <div className="card" style={{ padding: 16, height: 340, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }} data-tip="Click en un punto para resaltar ese mes en la tabla de abajo.">Acumulado Real vs. Ritmo Ideal</div>
                    <Line
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            onClick: onClickMes,
                            onHover: cursorPointer,
                            plugins: { legend: { position: 'bottom' } },
                            scales: { y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            {mesSeleccionado && (
                <div className="analysis-context">
                    🔎 Analizando: {mesSeleccionado}
                    <button onClick={() => setMesSeleccionado(null)} title="Limpiar selección">✕</button>
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th>Mes</th>
                            <th>Gasto</th>
                            <th>Acumulado</th>
                            <th data-tip="Ritmo ideal: Ley/12 × meses transcurridos.">Esperado</th>
                            <th data-tip="Diferencia % entre lo acumulado real y el ritmo ideal.">Desviación</th>
                            <th>% Ejecución</th>
                            <th data-tip="Acelerado: desviación ≥5%. Lento: desviación ≤-5%. Normal: entre ambos.">Ritmo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.tabla_mensual.map((m) => (
                            <tr key={m.mes} style={m.mes === mesSeleccionado ? { background: 'var(--gob-celeste-lt)' } : undefined}>
                                <td>{m.mes}</td>
                                <td className="td-monto">{fmtMoney(m.gasto)}</td>
                                <td className="td-monto">{fmtMoney(m.acumulado)}</td>
                                <td className="td-monto">{fmtMoney(m.esperado)}</td>
                                <td className="td-monto" style={{ color: (m.desviacion_pct ?? 0) >= 0 ? 'var(--gob-verde)' : 'var(--gob-rojo)' }}>{fmtPct(m.desviacion_pct)}</td>
                                <td className="td-monto">{fmtPct(m.pct_ejecucion)}</td>
                                <td style={{ fontWeight: 600, color: RITMO_COLOR[m.ritmo] }}>{m.ritmo}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
