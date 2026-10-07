import React, { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { getGestorPlanMensual } from '../../api/gestorComprasApi';
import { fmtN, fmtCompacto } from '../../../pac-cumplimiento/utils/format';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const SERIES = [
    { clave: 'ejecutado', label: '✅ Ejecutado', color: '#16a34a' },
    { clave: 'pendiente', label: '⏳ Pendiente', color: '#f59e0b' },
    { clave: 'atrasado', label: '⏰ Atrasado', color: '#dc2626' },
];

const etiqueta = (m) => `${m.nombre_mes} ${String(m.anio).slice(2)}`;
const etiquetaLarga = (m) => `${m.nombre_mes} ${m.anio}`;

// Rendimiento mensual del plan: fichas del departamento por mes de su fecha de compra, apiladas por
// estado de ejecución. Clic en una barra (o elegir el mes en el selector) filtra la tabla de abajo a
// ese mes; clic de nuevo, o "Quitar filtro", lo deshace. Cada ficha cuenta una sola vez, en el mes de
// su fecha de compra más próxima — la misma con la que filtra la tabla, así que ambas calzan.
// `soloPorAvisar` (pestaña Notificación): oculta lo ya ejecutado y cuenta solo pendientes + atrasados,
// que es lo único que se puede avisar; así un mes sin nada por avisar no se puede elegir y la tabla
// nunca queda vacía por culpa del gráfico.
export default function GraficoMensualPlan({ params, anho, mes, onSelectMes, soloPorAvisar = false }) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [metrica, setMetrica] = useState('cantidad');

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getGestorPlanMensual({ ...params, ...(anho ? { anho } : {}) })
            .then(({ data }) => { if (activo) setDatos(data); })
            .catch(() => { if (activo) setDatos(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [params, anho]);

    const meses = useMemo(() => {
        const base = datos?.meses ?? [];
        if (!soloPorAvisar) return base;
        return base.map((m) => ({
            ...m, ejecutado: 0, monto_ejecutado: 0,
            total: m.pendiente + m.atrasado, monto_total: m.monto_pendiente + m.monto_atrasado,
        }));
    }, [datos, soloPorAvisar]);
    const series = useMemo(
        () => (soloPorAvisar ? SERIES.filter((s) => s.clave !== 'ejecutado') : SERIES), [soloPorAvisar]);
    const seleccionado = meses.find((m) => m.mes === mes) || null;
    const esMonto = metrica === 'monto';

    const chartData = useMemo(() => ({
        labels: meses.map(etiqueta),
        datasets: series.map((s) => ({
            label: s.label,
            data: meses.map((m) => (esMonto ? m[`monto_${s.clave}`] : m[s.clave])),
            // Con un mes elegido, el resto se atenúa para que se vea cuál está filtrando la tabla.
            backgroundColor: meses.map((m) => (mes && m.mes !== mes ? `${s.color}40` : s.color)),
            borderRadius: 4,
            stack: 'estado',
        })),
    }), [meses, mes, esMonto, series]);

    const opciones = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_evento, elementos) => {
            if (!elementos.length) return;
            const m = meses[elementos[0].index];
            // un mes sin proyectos (relleno del eje continuo) no se puede elegir: dejaría la tabla vacía
            if (m && m.total > 0) onSelectMes(m.mes === mes ? null : m.mes);
        },
        onHover: (evento, elementos) => {
            const el = evento?.native?.target;
            if (el) el.style.cursor = elementos.length ? 'pointer' : 'default';
        },
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
            tooltip: {
                callbacks: {
                    title: (items) => (meses[items[0].dataIndex] ? etiquetaLarga(meses[items[0].dataIndex]) : ''),
                    label: (ctx) => ` ${ctx.dataset.label}: ${esMonto ? fmtCompacto(ctx.raw) : `${fmtN(ctx.raw)} ficha(s)`}`,
                    afterBody: (items) => {
                        const m = meses[items[0].dataIndex];
                        if (!m) return [];
                        const total = esMonto ? fmtCompacto(m.monto_total) : `${fmtN(m.total)} ficha(s)`;
                        return [soloPorAvisar ? `Por avisar: ${total}` : `Total: ${total} · ${m.pct_ejecutado}% ejecutado`];
                    },
                },
            },
        },
        scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 60, autoSkip: true } },
            y: {
                stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' },
                ticks: { font: { size: 11 }, precision: 0, callback: (v) => (esMonto ? fmtCompacto(v) : v) },
            },
        },
    }), [meses, mes, esMonto, onSelectMes, soloPorAvisar]);

    return (
        <div className="card" style={{ padding: '16px 18px' }}>
            <div className="gc-mensual-head">
                <div>
                    <div className="gc-mensual-title">📊 Rendimiento mensual del plan</div>
                    <div className="gc-mensual-sub">
                        {soloPorAvisar
                            ? 'Planes pendientes y atrasados por mes de su fecha de compra (lo que aún se puede avisar). Haga clic en un mes para filtrar la tabla.'
                            : 'Proyectos por mes de su fecha de compra, según su estado de ejecución. Haga clic en un mes para filtrar la tabla.'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="gc-toggle" role="group" aria-label="Métrica">
                        <button className={metrica === 'cantidad' ? 'active' : ''} onClick={() => setMetrica('cantidad')}>N° de fichas</button>
                        <button className={metrica === 'monto' ? 'active' : ''} onClick={() => setMetrica('monto')}>Monto $</button>
                    </div>
                    <select
                        className="filtro-select"
                        value={mes || ''}
                        onChange={(e) => onSelectMes(e.target.value || null)}
                        aria-label="Filtrar por mes"
                        disabled={!meses.length}
                    >
                        <option value="">Todos los meses</option>
                        {meses.filter((m) => m.total > 0).map((m) => (
                            <option key={m.mes} value={m.mes}>{etiquetaLarga(m)} ({m.total})</option>
                        ))}
                    </select>
                </div>
            </div>

            {cargando ? (
                <div className="loading-spinner">Cargando el gráfico…</div>
            ) : !meses.length ? (
                <div className="gc-empty">
                    <div className="gc-empty-icon">📭</div>
                    <div className="gc-empty-sub">No hay proyectos con fecha de compra para graficar.</div>
                </div>
            ) : (
                <div className="chart-box" style={{ height: 300 }}>
                    <Bar data={chartData} options={opciones} />
                </div>
            )}

            {seleccionado && (
                <div className="gc-mes-sel">
                    <span className="gc-mes-sel-title">📅 {etiquetaLarga(seleccionado)}</span>
                    <span className="gc-mes-sel-kpi"><b>{fmtN(seleccionado.total)}</b> proyecto(s)</span>
                    {!soloPorAvisar && (
                        <span className="gc-mes-sel-kpi" style={{ color: '#15803d' }}><b>{seleccionado.ejecutado}</b> ejecutado(s)</span>
                    )}
                    <span className="gc-mes-sel-kpi" style={{ color: '#b45309' }}><b>{seleccionado.pendiente}</b> pendiente(s)</span>
                    <span className="gc-mes-sel-kpi" style={{ color: '#b91c1c' }}><b>{seleccionado.atrasado}</b> atrasado(s)</span>
                    <span className="gc-mes-sel-kpi">
                        {!soloPorAvisar && <><b>{seleccionado.pct_ejecutado}%</b> de ejecución · </>}{fmtCompacto(seleccionado.monto_total)}
                    </span>
                    <button className="gc-link-btn" onClick={() => onSelectMes(null)}>✕ Quitar filtro</button>
                </div>
            )}

            {datos?.sin_fecha?.total > 0 && (
                <p className="gc-nota" style={{ marginTop: 12 }}>
                    {fmtN(datos.sin_fecha.total)} proyecto(s) sin fecha de compra válida no aparecen en el gráfico (siguen en la tabla).
                </p>
            )}
        </div>
    );
}
