// Gráficos de Temporalidad (Chart.js). Chart.js dibuja en canvas y no entiende `var(--…)`, así que los colores
// se leen de los tokens DV-UI con `dvColor`. Dentro = verde institucional; Fuera = ámbar (DV-UI no usa rojo de alarma).
import { useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import '../formularios.css';
import { dvColor, fmtCLP, fmtN } from '../shared';
import { MUESTRA_MINIMA_PAC, varianteNota } from './logica';

const fmtCompacto = (n) => new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(n ?? 0);
const colores = () => ({ dentro: dvColor('--dv-ok', '#1B7A45'), fuera: dvColor('--dv-secondary', '#C97F2B'), ejes: dvColor('--dv-ink-3', '#7C8798'), rejilla: dvColor('--dv-line', '#E7EAF0') });

/** Nota 1.0 – 7.0 como chip; «s/n» cuando la muestra es insuficiente. */
export function NotaChip({ nota, grande = false }) {
    if (nota === null || nota === undefined) {
        return (
            <span className={`dv-chip dv-chip--none${grande ? ' frm-nota--lg is-text' : ''}`}
                  title={`Muestra insuficiente (menos de ${MUESTRA_MINIMA_PAC} formularios)`}>s/n</span>
        );
    }
    return <span className={`dv-chip dv-chip--${varianteNota(nota)}${grande ? ' frm-nota--lg' : ''}`}>{nota.toFixed(1)}</span>;
}

/** Comparativo anual: cantidad y monto Dentro/Fuera del PAC, lado a lado. */
export function ComparativoAnual({ serieAnual, aniosSel }) {
    const filas = useMemo(
        () => serieAnual.filter((s) => aniosSel.includes(s.anho)).sort((a, b) => a.anho - b.anho),
        [serieAnual, aniosSel],
    );
    if (!filas.length) return <div className="frm-note" style={{ textAlign: 'center' }}>Selecciona al menos un año para graficar.</div>;

    const c = colores();
    const base = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: c.ejes } } },
        scales: { y: { beginAtZero: true, ticks: { font: { size: 10 }, color: c.ejes }, grid: { color: c.rejilla } }, x: { ticks: { font: { size: 11 }, color: c.ejes }, grid: { display: false } } },
    };
    const serie = (clave) => [
        { label: 'Dentro del PAC', data: filas.map((f) => f[`dentro_${clave}`]), backgroundColor: c.dentro, borderRadius: 4 },
        { label: 'Fuera del PAC', data: filas.map((f) => f[`fuera_${clave}`]), backgroundColor: c.fuera, borderRadius: 4 },
    ];
    const etiquetas = filas.map((f) => f.anho);

    return (
        <div className="frm-grid-2">
            <div>
                <div className="dv-eyebrow" style={{ marginBottom: 'var(--dv-sp-3)' }}>Por cantidad de formularios</div>
                <div className="chart-box frm-chartbox">
                    <Bar data={{ labels: etiquetas, datasets: serie('cantidad') }} options={{
                        ...base, plugins: { ...base.plugins, tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtN(ctx.raw)}` } } },
                    }} />
                </div>
            </div>
            <div>
                <div className="dv-eyebrow" style={{ marginBottom: 'var(--dv-sp-3)' }}>Por monto estimado</div>
                <div className="chart-box frm-chartbox">
                    <Bar data={{ labels: etiquetas, datasets: serie('monto') }} options={{
                        ...base,
                        plugins: { ...base.plugins, tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtCLP(ctx.raw)}` } } },
                        scales: { ...base.scales, y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, callback: (v) => fmtCompacto(v) } } },
                    }} />
                </div>
            </div>
        </div>
    );
}

/** Indicador Dentro/Fuera (dona) con los porcentajes por cantidad y por monto. */
export function IndicadorPac({ resumen }) {
    const c = colores();
    const data = { labels: ['Dentro del PAC', 'Fuera del PAC'], datasets: [{ data: [resumen.dentroCant, resumen.fueraCant], backgroundColor: [c.dentro, c.fuera], borderWidth: 0 }] };
    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head"><h2 className="frm-panel__title">Indicador Dentro / Fuera del PAC</h2></div>
            <div className="frm-panel__body">
                <div className="frm-donut">
                    <div className="frm-donut__chart">
                        <Doughnut data={data} options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }} />
                    </div>
                    <div>
                        <div className="frm-donut__pct">{resumen.pctDentroCant.toFixed(1)}%</div>
                        <div className="frm-donut__line"><b>{fmtN(resumen.dentroCant)}</b> dentro · <b>{fmtN(resumen.fueraCant)}</b> fuera · {fmtN(resumen.totalCant)} en total</div>
                        <div className="frm-donut__line">Por monto: <b>{resumen.pctDentroMonto.toFixed(1)}%</b> ({fmtCLP(resumen.dentroMonto)} de {fmtCLP(resumen.totalMonto)})</div>
                    </div>
                </div>
            </div>
        </section>
    );
}
