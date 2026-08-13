import React, { useMemo, useState } from 'react';
import { Doughnut, Line } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchFinancieroAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const COLOR_EQUILIBRIO = { normal: '--color-success', atencion: '--color-warning', critico: '--color-danger' };
const COLOR_DEUDA = { verde: '--color-success', amarillo: '--color-warning', rojo: '--color-danger' };
const COLOR_PAGO = { verde: '--color-success', amarillo: '--color-warning', rojo: '--color-danger' };

export default function TabFinanciero({ filtros, refreshKey }) {
    const [segmentoSeleccionado, setSegmentoSeleccionado] = useState(null);
    const { data, loading, error } = useAnexo1Fetch(
        fetchFinancieroAnexo1, paramsBase(filtros), refreshKey, 'No se pudo cargar el Análisis Financiero.',
    );

    const gaugeData = useMemo(() => {
        if (!data) return null;
        const dev = data.kpis.total_devengado;
        const compSinDev = Math.max(0, data.kpis.compromiso_financiero - dev);
        const libre = Math.max(0, data.kpis.disponibilidad_libre);
        return {
            labels: ['Devengado', 'Comprometido sin Devengar', 'Disponible Libre'],
            datasets: [{ data: [dev, compSinDev, libre], backgroundColor: ['#0FAB5C', '#C47820', '#94a3b8'], borderWidth: 0 }],
        };
    }, [data]);

    const deudaHistData = useMemo(() => {
        if (!data?.deuda_evolucion_historica?.length) return null;
        return {
            labels: data.deuda_evolucion_historica.map((d) => d.periodo),
            datasets: [{ label: 'Deuda Flotante (M$)', data: data.deuda_evolucion_historica.map((d) => d.deuda / 1e6), borderColor: '#D0202F', backgroundColor: '#D0202F18', tension: 0.3, pointRadius: 2 }],
        };
    }, [data]);

    const estRealData = useMemo(() => {
        if (!data?.estimado_vs_real_anho) return null;
        return {
            labels: MESES,
            datasets: [
                { label: 'Real Acumulado (M$)', data: data.estimado_vs_real_anho.real_acumulado.map((v) => v / 1e6), borderColor: '#1B3FD8', tension: 0.3, pointRadius: 3 },
                { label: 'Estimado Lineal (M$)', data: data.estimado_vs_real_anho.estimado_lineal.map((v) => v / 1e6), borderColor: '#94a3b8', borderDash: [6, 4], pointRadius: 0 },
            ],
        };
    }, [data]);

    if (loading && !data) return <div className="loading-spinner">Cargando Análisis Financiero…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    const k = data.kpis;

    const onClickSegmento = (evt, els) => {
        if (!els.length || !gaugeData) return;
        const i = els[0].index;
        const label = gaugeData.labels[i];
        const valor = gaugeData.datasets[0].data[i];
        setSegmentoSeleccionado((prev) => (prev?.label === label ? null : { label, valor }));
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    return (
        <div>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="Equilibrio Financiero" value={fmtPct(k.equilibrio_financiero_pct)} icon="⚖️" colorVar={COLOR_EQUILIBRIO[k.estado_equilibrio]} tip="% de ejecución del período — mide la velocidad de gasto, no el cumplimiento del año." />
                <KpiCard title="Compromiso Financiero" value={fmtMoney(k.compromiso_financiero)} icon="🤝" colorVar="--color-accent" tip="Monto comprometido (órdenes de compra u obligaciones) aún no devengado." />
                <KpiCard title="Total Devengado" value={fmtMoney(k.total_devengado)} icon="✅" colorVar="--color-success" tip="Gasto reconocido contablemente en el período seleccionado." />
                <KpiCard title="Deuda Flotante" value={fmtMoney(k.deuda_flotante)} icon="⚠️" colorVar={COLOR_DEUDA[k.estado_deuda]} tip="Devengado menos Efectivo — obligaciones reconocidas y aún no pagadas." />
                <KpiCard title="Disponibilidad Libre" value={fmtMoney(k.disponibilidad_libre)} icon="💰" colorVar="--color-primary" tip="Ley de Presupuestos menos lo Comprometido — saldo aún sin comprometer." />
                <KpiCard title="Tasa de Pago" value={fmtPct(k.tasa_pago_pct)} icon="💳" colorVar={COLOR_PAGO[k.estado_tasa_pago]} tip="Efectivo sobre Devengado del período seleccionado." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 20 }}>
                {gaugeData && (
                    <div className="card" style={{ padding: 16, height: 320 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }} data-tip="Cómo se reparte la Ley de Presupuestos entre lo ya devengado, lo comprometido sin devengar y lo aún disponible.">Composición de la Ley</div>
                        <Doughnut
                            data={gaugeData}
                            options={{
                                responsive: true, maintainAspectRatio: false,
                                onClick: onClickSegmento,
                                onHover: cursorPointer,
                                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10.5 } } } },
                            }}
                        />
                        {segmentoSeleccionado && (
                            <div className="analysis-context" style={{ marginTop: 10, marginBottom: 0 }}>
                                🔎 {segmentoSeleccionado.label}: {fmtMoney(segmentoSeleccionado.valor)}
                                <button onClick={() => setSegmentoSeleccionado(null)} title="Limpiar selección">✕</button>
                            </div>
                        )}
                    </div>
                )}
                {estRealData && (
                    <div className="card" style={{ padding: 16, height: 320 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }} data-tip="Compara el devengado acumulado real del año contra una línea de gasto ideal (Ley/12 × mes).">Real Acumulado vs. Estimado Lineal</div>
                        <Line data={estRealData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => `M$${v}` } } } }} />
                    </div>
                )}
            </div>

            {deudaHistData && (
                <div className="card" style={{ padding: 16, height: 300, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }} data-tip="Deuda flotante mes a mes desde el primer período cargado en el sistema, sin acotar al año seleccionado.">Evolución Histórica de la Deuda Flotante (todos los períodos cargados)</div>
                    <Line data={deudaHistData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { font: { size: 9 }, maxRotation: 60 } }, y: { ticks: { callback: (v) => `M$${v}` } } } }} />
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th>Subtítulo</th>
                            <th>Ley</th>
                            <th>Comprometido</th>
                            <th>Devengado</th>
                            <th>Deuda</th>
                            <th>% Ejecución</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.subtitulos.map((s) => (
                            <tr key={s.codigo}>
                                <td>{s.codigo} {s.nombre}</td>
                                <td className="td-monto">{fmtMoney(s.ley)}</td>
                                <td className="td-monto">{fmtMoney(s.comprometido)}</td>
                                <td className="td-monto">{fmtMoney(s.devengado)}</td>
                                <td className="td-monto">{fmtMoney(s.deuda)}</td>
                                <td className="td-monto" style={{ fontWeight: 700 }}>{fmtPct(s.pct_ejecucion)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
