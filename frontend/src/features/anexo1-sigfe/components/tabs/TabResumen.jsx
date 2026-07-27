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

    return (
        <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                    <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                        Subtítulo (opcional)
                    </label>
                    <select
                        value={subtitulo}
                        onChange={(e) => setSubtitulo(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5 }}
                    >
                        <option value="">Todos los subtítulos</option>
                        {data.grafico_barras.map((f) => (
                            <option key={f.codigo} value={`${f.codigo} ${f.nombre}`}>{f.codigo} {f.nombre}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                        Comparar con año
                    </label>
                    <select
                        value={anhoComparacion}
                        onChange={(e) => setAnhoComparacion(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 12.5 }}
                    >
                        <option value="">Sin comparación</option>
                        {filtros.anho && <option value={filtros.anho - 1}>{filtros.anho - 1}</option>}
                    </select>
                </div>
            </div>

            <div className="kpi-grid">
                <KpiCard title="Ley de Presupuestos" value={fmtMoney(kpis.ley_presupuestos)} icon="📜" colorVar="--color-primary" />
                <KpiCard title="Saldo por Aplicar" value={fmtMoney(kpis.saldo_por_aplicar)} icon="📥" colorVar={kpis.saldo_por_aplicar < 0 ? '--color-danger' : '--color-primary'} />
                <KpiCard title="Comprometido" value={fmtMoney(kpis.comprometido)} icon="🤝" colorVar="--color-accent" />
                <KpiCard title="Saldo por Devengar" value={fmtMoney(kpis.saldo_por_devengar)} icon="⏳" colorVar={kpis.saldo_por_devengar < 0 ? '--color-danger' : '--color-accent'} />
                <KpiCard title="Devengado" value={fmtMoney(kpis.devengado)} icon="✅" colorVar="--color-success" />
                <KpiCard title="Deuda Flotante" value={fmtMoney(kpis.deuda_flotante)} icon="⚠️" colorVar={kpis.deuda_flotante > 0 ? '--color-warning' : '--color-success'} />
                <KpiCard title="Efectivo" value={fmtMoney(kpis.efectivo)} icon="💵" colorVar="--color-accent" />
                <KpiCard title="Subtítulos Activos" value={kpis.subtitulos_activos} icon="🗂️" colorVar="--color-primary" />
                <KpiCard title="Mes de Mayor Gasto" value={kpis.mes_mayor_gasto ?? '—'} icon="📅" colorVar="--color-primary" />
                <KpiCard
                    title="% Ejecución"
                    value={fmtPct(kpis.pct_ejecucion)}
                    icon="📈"
                    colorVar={ESTADO_COLOR[kpis.pct_ejecucion_estado]}
                    trend={comparacion?.delta_devengado_pct}
                />
                <KpiCard
                    title="% Pago"
                    value={fmtPct(kpis.pct_pago)}
                    icon="💳"
                    colorVar={ESTADO_COLOR[kpis.pct_pago_estado]}
                    trend={comparacion?.delta_efectivo_pct}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 20 }}>
                <div className="card" style={{ padding: 16, height: 380 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                        Ley · Devengado · Efectivo por Subtítulo
                    </div>
                    {barData && (
                        <Bar
                            data={barData}
                            options={{
                                responsive: true, maintainAspectRatio: false,
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                        Participación del Devengado
                    </div>
                    {donutData && (
                        <Doughnut
                            data={donutData}
                            options={{
                                responsive: true, maintainAspectRatio: false,
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
