import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchDeudaFlotanteAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const COLOR_ESTADO = { verde: '--color-success', amarillo: '--color-warning', rojo: '--color-danger' };
const COLOR_ESTADO_HEX = { verde: '#16a34a', amarillo: '#ca8a04', rojo: '#dc2626' };

export default function TabDeudaFlotante({ filtros, refreshKey }) {
    const [mesSeleccionado, setMesSeleccionado] = useState(null);
    const { data, loading, error } = useAnexo1Fetch(
        fetchDeudaFlotanteAnexo1, paramsBase(filtros), refreshKey, 'No se pudo cargar Deuda Flotante.',
    );

    const chartData = useMemo(() => {
        if (!data?.serie_mensual?.length) return null;
        return {
            labels: data.serie_mensual.map((m) => m.mes),
            datasets: [
                { label: 'Devengado (M$)', data: data.serie_mensual.map((m) => m.devengado / 1e6), borderColor: '#1B3FD8', tension: 0.3, pointRadius: 3 },
                { label: 'Efectivo (M$)', data: data.serie_mensual.map((m) => m.efectivo / 1e6), borderColor: '#0FAB5C', tension: 0.3, pointRadius: 3 },
                { label: 'Deuda Flotante (M$)', data: data.serie_mensual.map((m) => m.deuda / 1e6), borderColor: '#D0202F', tension: 0.3, pointRadius: 3 },
            ],
        };
    }, [data]);

    if (loading && !data) return <div className="loading-spinner">Cargando Deuda Flotante…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    if (!data.ultimo_mes_con_datos) {
        return <div className="error-message">No hay datos cargados para el año seleccionado.</div>;
    }

    const k = data.kpis;

    const onClickMes = (evt, els) => {
        if (!els.length) return;
        const m = data.serie_mensual[els[0].index];
        setMesSeleccionado((prev) => (prev?.mes === m.mes ? null : m));
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    return (
        <div>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="Deuda Actual" value={fmtMoney(k.deuda_actual)} icon="⚠️" colorVar={COLOR_ESTADO[k.estado_deuda_actual]} tip="Devengado menos Efectivo del último mes con datos." />
                <KpiCard title="Deuda Máxima" value={fmtMoney(k.deuda_maxima)} subtitle={k.mes_deuda_maxima} icon="📈" colorVar="--color-primary" tip="El mayor valor de deuda flotante registrado en el año." />
                <KpiCard
                    title="Tendencia vs. Mes Anterior"
                    value={k.tendencia_vs_mes_anterior != null ? fmtMoney(k.tendencia_vs_mes_anterior) : '—'}
                    icon={k.tendencia_vs_mes_anterior >= 0 ? '⬆️' : '⬇️'}
                    colorVar={k.tendencia_vs_mes_anterior > 0 ? '--color-danger' : '--color-success'}
                    tip="Variación de la deuda flotante respecto al mes inmediatamente anterior."
                />
                <KpiCard title="% Pago Acumulado" value={fmtPct(k.pct_pago_acumulado)} icon="💳" colorVar={COLOR_ESTADO[k.estado_pct_pago]} tip="Efectivo sobre Devengado del último mes con datos." />
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 340, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }} data-tip="Click en un mes para ver el detalle de sus tres valores.">Devengado · Efectivo · Deuda Flotante por Mes</div>
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
                    🔎 Analizando: {mesSeleccionado.mes} — Devengado {fmtMoney(mesSeleccionado.devengado)} · Efectivo {fmtMoney(mesSeleccionado.efectivo)} · Deuda {fmtMoney(mesSeleccionado.deuda)}
                    <button onClick={() => setMesSeleccionado(null)} title="Limpiar selección">✕</button>
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th>Subtítulo</th>
                            <th>Dev. Total</th>
                            <th>Efec. Total</th>
                            <th>Deuda</th>
                            <th data-tip="Deuda flotante sobre Devengado — mientras más alto, mayor rezago de pago.">% Deuda/Dev</th>
                            <th>Mes Deuda Máx.</th>
                            <th>Valor Máx.</th>
                            <th data-tip="Comparación de la deuda del subtítulo contra el mes anterior.">Tendencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.antiguedad_por_subtitulo.map((s) => (
                            <tr key={s.codigo}>
                                <td>{s.codigo} {s.nombre}</td>
                                <td className="td-monto">{fmtMoney(s.devengado_total)}</td>
                                <td className="td-monto">{fmtMoney(s.efectivo_total)}</td>
                                <td className="td-monto">{fmtMoney(s.deuda)}</td>
                                <td className="td-monto" style={{ fontWeight: 700, color: COLOR_ESTADO_HEX[s.estado_pct_deuda] }}>{fmtPct(s.pct_deuda_sobre_devengado)}</td>
                                <td>{s.mes_deuda_maxima ?? '—'}</td>
                                <td className="td-monto">{fmtMoney(s.valor_deuda_maxima)}</td>
                                <td>{s.tendencia === 'bajando' ? '↓ Bajando' : s.tendencia === 'subiendo' ? '↑ Subiendo' : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
