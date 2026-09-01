import { useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';
import { fmtN, ESTADO_LABEL, ESTADO_COLOR, PAC_ESTADO_LABEL, PAC_ESTADO_COLOR } from '../../utils/format';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function KpiCard({ label, value, sub, accent }) {
    return (
        <article className="dv-card dv-enter" style={{ '--dv-card-accent': accent, flex: '1 1 180px' }}>
            <div className="dv-card__title">{label}</div>
            <div className="dv-card__value">{value}</div>
            {sub && <div className="dv-card__meta">{sub}</div>}
        </article>
    );
}

const ESTADOS_ORDEN = ['CONFIRMADO', 'PENDIENTE_MEDIA', 'PENDIENTE_BAJA', 'RECHAZADO_TOTAL', 'SIN_MATCH'];

export default function ResumenTab({ resumen }) {
    const kpis = resumen?.kpis;
    const pac = resumen?.pac_en_confirmados;
    const porAnho = resumen?.por_anho ?? [];

    const donutData = useMemo(() => {
        if (!kpis || !kpis.total_dentro_pac) return null;
        return {
            labels: ESTADOS_ORDEN.map((e) => ESTADO_LABEL[e]),
            datasets: [{
                data: ESTADOS_ORDEN.map((e) => kpis[e.toLowerCase()] ?? 0),
                backgroundColor: ESTADOS_ORDEN.map((e) => ESTADO_COLOR[e]),
                borderWidth: 0,
                hoverOffset: 6,
            }],
        };
    }, [kpis]);

    const barData = useMemo(() => {
        if (!porAnho.length) return null;
        return {
            labels: porAnho.map((r) => String(r.anho)),
            datasets: ESTADOS_ORDEN.map((estado) => ({
                label: ESTADO_LABEL[estado],
                data: porAnho.map((r) => r[estado] ?? 0),
                backgroundColor: ESTADO_COLOR[estado],
                borderRadius: 4,
                stack: 'enlace',
            })),
        };
    }, [porAnho]);

    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtN(ctx.raw)} FSC` } },
        },
        scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 } },
        },
    };

    const donutOptions = {
        cutout: '70%',
        plugins: {
            legend: { position: 'bottom', labels: { color: '#64748b', padding: 14, font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtN(ctx.raw)} FSC` } },
        },
    };

    if (!kpis) {
        return <div className="dv-footnote" style={{ textAlign: 'center', padding: 60 }}>Sin datos para el período seleccionado.</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="FSC Dentro-PAC evaluados" value={fmtN(kpis.total_dentro_pac)} accent="var(--dv-primary)" />
                <KpiCard label="✅ % Enlazado (confirmado)" value={`${kpis.pct_enlazado}%`} accent={kpis.pct_enlazado >= 70 ? 'var(--dv-ok)' : kpis.pct_enlazado >= 30 ? 'var(--dv-warn)' : 'var(--dv-watch)'} sub={`${fmtN(kpis.confirmado)} de ${fmtN(kpis.total_dentro_pac)}`} />
                <KpiCard label="📝 Pendiente Media" value={fmtN(kpis.pendiente_media)} accent={ESTADO_COLOR.PENDIENTE_MEDIA} sub="Tipo+Folio+Año calzan" />
                <KpiCard label="📝 Pendiente Baja" value={fmtN(kpis.pendiente_baja)} accent={ESTADO_COLOR.PENDIENTE_BAJA} sub="solo Tipo+Folio (legacy)" />
                <KpiCard label="Sin candidata" value={fmtN(kpis.sin_match)} accent={ESTADO_COLOR.SIN_MATCH} />
            </div>

            {pac && pac.total > 0 && (
                <div className="dv-panel">
                    <h3 className="dv-panel__title">🎯 PAC en las OC confirmadas</h3>
                    <p className="dv-panel__subtitle">¿Cada OC realmente enlazada tiene el PAC que declara su FSC? Cuenta por OC, no por FSC — un FSC con 2 OC confirmadas (varios procesos de compra) aporta 2.</p>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <KpiCard label={PAC_ESTADO_LABEL.PAC_OK} value={fmtN(pac.pac_ok)} accent={PAC_ESTADO_COLOR.PAC_OK} sub={`${pac.pct_ok}% de ${fmtN(pac.total)} OC confirmadas`} />
                        <KpiCard label={PAC_ESTADO_LABEL.SIN_PAC} value={fmtN(pac.sin_pac)} accent={PAC_ESTADO_COLOR.SIN_PAC} />
                        <KpiCard label={PAC_ESTADO_LABEL.PAC_DISTINTO} value={fmtN(pac.pac_distinto)} accent={PAC_ESTADO_COLOR.PAC_DISTINTO} />
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div className="dv-panel" style={{ flex: '1 1 320px', height: 320, marginBottom: 0 }}>
                    <h3 className="dv-panel__title">Distribución del enlace</h3>
                    <div style={{ height: 250, marginTop: 10 }}>
                        {donutData ? <Doughnut data={donutData} options={donutOptions} /> : <div className="dv-footnote">Sin datos.</div>}
                    </div>
                </div>
                <div className="dv-panel" style={{ flex: '2 1 420px', height: 320, marginBottom: 0 }}>
                    <h3 className="dv-panel__title">Evolución por año</h3>
                    <div style={{ height: 250, marginTop: 10 }}>
                        {barData ? <Bar data={barData} options={barOptions} /> : <div className="dv-footnote">Sin datos.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
