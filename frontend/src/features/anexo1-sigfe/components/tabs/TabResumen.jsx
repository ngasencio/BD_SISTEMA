import React, { useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Resumen } from '../../hooks/useAnexo1Resumen';

const ESTADO_COLOR = { verde: '--color-success', amarillo: '--color-warning', rojo: '--color-danger' };

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtM = (n) => 'M$ ' + (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 });
const fmtPct = (n) => `${(n ?? 0).toFixed(1)}%`;

const PALETTE = ['#1B3FD8', '#0FAB5C', '#C47820', '#9333EA', '#D0202F', '#0891B2', '#db2777', '#059669', '#64748b'];

export default function TabResumen({ filtros, refreshKey }) {
    const [subtitulo, setSubtitulo] = useState('');
    const [anhoComparacion, setAnhoComparacion] = useState('');

    const { data, loading, error } = useAnexo1Resumen(
        { ...filtros, subtitulo: subtitulo || undefined, anhoComparacion: anhoComparacion || undefined },
        refreshKey,
    );

    const barData = useMemo(() => {
        if (!data) return null;
        const filas = data.grafico_barras;
        return {
            labels: filas.map((f) => `${f.codigo} ${f.nombre}`.slice(0, 28)),
            datasets: [
                { label: 'Ley (M$)', data: filas.map((f) => f.ley / 1e6), backgroundColor: '#1B3FD8', borderRadius: 3 },
                { label: 'Devengado (M$)', data: filas.map((f) => f.devengado / 1e6), backgroundColor: '#0FAB5C', borderRadius: 3 },
                { label: 'Efectivo (M$)', data: filas.map((f) => f.efectivo / 1e6), backgroundColor: '#0891B2', borderRadius: 3 },
            ],
        };
    }, [data]);

    const donutData = useMemo(() => {
        if (!data) return null;
        const filas = data.grafico_donut;
        return {
            labels: filas.map((f) => `${f.codigo} ${f.nombre}`.slice(0, 28)),
            datasets: [{
                data: filas.map((f) => f.devengado / 1e6),
                backgroundColor: filas.map((_, i) => PALETTE[i % PALETTE.length]),
                borderWidth: 0,
            }],
        };
    }, [data]);

    if (loading && !data) return <div className="loading-spinner">Cargando Resumen Ejecutivo…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    const { kpis, comparacion } = data;

    // Drill-down: click en una barra/segmento del gráfico equivale a elegir
    // ese subtítulo en el select de arriba (mismo estado `subtitulo`) — así
    // los KPI/gráficos se refiltran y el chip de contexto explica qué se
    // está mirando, sin importar si el filtro se disparó desde el select o
    // desde el gráfico.
    const seleccionarSubtitulo = (concepto) => setSubtitulo((prev) => (prev === concepto ? '' : concepto));
    const onClickBarra = (evt, els) => {
        if (!els.length) return;
        const f = data.grafico_barras[els[0].index];
        seleccionarSubtitulo(`${f.codigo} ${f.nombre}`);
    };
    const onClickDonut = (evt, els) => {
        if (!els.length) return;
        const f = data.grafico_donut[els[0].index];
        seleccionarSubtitulo(`${f.codigo} ${f.nombre}`);
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    return (
        <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="filter-group">
                    <label className="filter-label">Subtítulo (opcional)</label>
                    <select
                        className="filter-input"
                        value={subtitulo}
                        onChange={(e) => setSubtitulo(e.target.value)}
                    >
                        <option value="">Todos los subtítulos</option>
                        {data.grafico_barras.map((f) => (
                            <option key={f.codigo} value={`${f.codigo} ${f.nombre}`}>{f.codigo} {f.nombre}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label className="filter-label">Comparar con año</label>
                    <select
                        className="filter-input"
                        value={anhoComparacion}
                        onChange={(e) => setAnhoComparacion(e.target.value)}
                    >
                        <option value="">Sin comparación</option>
                        {filtros.anho && <option value={filtros.anho - 1}>{filtros.anho - 1}</option>}
                    </select>
                </div>
            </div>

            {subtitulo && (
                <div className="analysis-context">
                    🔎 Analizando: {subtitulo}
                    <button onClick={() => setSubtitulo('')} title="Limpiar selección">✕</button>
                </div>
            )}

            <div className="kpi-grid">
                <KpiCard title="Ley de Presupuestos" value={fmtMoney(kpis.ley_presupuestos)} icon="📜" colorVar="--color-primary" tip="Monto anual total asignado por la Ley de Presupuestos para el período/establecimiento filtrado." />
                <KpiCard title="Saldo por Aplicar" value={fmtMoney(kpis.saldo_por_aplicar)} icon="📥" colorVar={kpis.saldo_por_aplicar < 0 ? '--color-danger' : '--color-primary'} tip="Ley menos Requerimiento — parte de la Ley aún sin solicitud de compra asociada." />
                <KpiCard title="Comprometido" value={fmtMoney(kpis.comprometido)} icon="🤝" colorVar="--color-accent" tip="Monto comprometido (orden de compra u obligación) aún no devengado." />
                <KpiCard title="Saldo por Devengar" value={fmtMoney(kpis.saldo_por_devengar)} icon="⏳" colorVar={kpis.saldo_por_devengar < 0 ? '--color-danger' : '--color-accent'} tip="Comprometido menos Devengado — compromisos aún sin reconocer contablemente." />
                <KpiCard title="Devengado" value={fmtMoney(kpis.devengado)} icon="✅" colorVar="--color-success" tip="Gasto reconocido contablemente, acumulado en el período seleccionado." />
                <KpiCard title="Deuda Flotante" value={fmtMoney(kpis.deuda_flotante)} icon="⚠️" colorVar={kpis.deuda_flotante > 0 ? '--color-warning' : '--color-success'} tip="Devengado menos Efectivo — obligaciones reconocidas y aún no pagadas." />
                <KpiCard title="Efectivo" value={fmtMoney(kpis.efectivo)} icon="💵" colorVar="--color-accent" tip="Monto efectivamente pagado del devengado acumulado." />
                <KpiCard title="Subtítulos Activos" value={kpis.subtitulos_activos} icon="🗂️" colorVar="--color-primary" tip="Cantidad de subtítulos presupuestarios (N1) con movimiento en el período." />
                <KpiCard title="Mes de Mayor Gasto" value={kpis.mes_mayor_gasto ?? '—'} icon="📅" colorVar="--color-primary" tip="Mes del año con mayor Devengado a nivel Subtítulo, considerando el año completo." />
                <KpiCard
                    title="% Ejecución"
                    value={fmtPct(kpis.pct_ejecucion)}
                    icon="📈"
                    colorVar={ESTADO_COLOR[kpis.pct_ejecucion_estado]}
                    trend={comparacion?.delta_devengado_pct}
                    tip="Devengado sobre Ley de Presupuestos. La flecha compara contra el mismo período del año anterior, si se seleccionó."
                />
                <KpiCard
                    title="% Pago"
                    value={fmtPct(kpis.pct_pago)}
                    icon="💳"
                    colorVar={ESTADO_COLOR[kpis.pct_pago_estado]}
                    trend={comparacion?.delta_efectivo_pct}
                    tip="Efectivo sobre Devengado. La flecha compara contra el mismo período del año anterior, si se seleccionó."
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 20 }}>
                <div className="card" style={{ padding: 16, height: 380 }}>
                    <div
                        style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }}
                        data-tip="Compara, por cada subtítulo presupuestario, la Ley asignada contra lo Devengado y lo Efectivo pagado."
                    >
                        Ley · Devengado · Efectivo por Subtítulo
                    </div>
                    {barData && (
                        <Bar
                            data={barData}
                            options={{
                                responsive: true, maintainAspectRatio: false,
                                onClick: onClickBarra,
                                onHover: cursorPointer,
                                plugins: {
                                    legend: { position: 'bottom' },
                                    tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y * 1e6)}` } },
                                },
                                scales: {
                                    x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
                                    y: { ticks: { callback: (v) => `M$${v}` } },
                                },
                            }}
                        />
                    )}
                </div>
                <div className="card" style={{ padding: 16, height: 380 }}>
                    <div
                        style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }}
                        data-tip="Qué porcentaje del Devengado total corresponde a cada subtítulo."
                    >
                        Participación del Devengado
                    </div>
                    {donutData && (
                        <Doughnut
                            data={donutData}
                            options={{
                                responsive: true, maintainAspectRatio: false,
                                onClick: onClickDonut,
                                onHover: cursorPointer,
                                plugins: {
                                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10.5 } } },
                                    tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtM(c.parsed * 1e6)}` } },
                                },
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
