import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { getTemporalMensualPlaner } from '../../../api/pacCumplimientoApi';
import { fmtN, fmtCompacto, colorPct } from '../../../utils/format';
import VerFichaSubtab from './VerFichaSubtab';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const cardStyle = { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,.04)' };

function CeldaMes({ mes }) {
    const color = mes.total === 0 ? '#f1f5f9' : colorPct(mes.pct_ejecutado);
    const bg = mes.total === 0 ? '#f8fafc' : `${color}18`;
    return (
        <div style={{ border: `1.5px solid ${mes.total === 0 ? '#e2e8f0' : color}`, background: bg, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{mes.nombre_mes}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: mes.total === 0 ? '#cbd5e1' : color }}>{mes.total === 0 ? '—' : `${mes.pct_ejecutado}%`}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{fmtN(mes.total)} ficha(s)</div>
            {mes.total > 0 && (
                <div style={{ fontSize: 9.5, color: '#94a3b8', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#15803d' }}>✅{mes.ejecutados}</span>
                    {mes.pendientes > 0 && <span style={{ color: '#b45309' }}>⏳{mes.pendientes}</span>}
                    {mes.atrasados > 0 && <span style={{ color: '#b91c1c' }}>⏰{mes.atrasados}</span>}
                </div>
            )}
        </div>
    );
}

export default function TemporalSubtab({ anho }) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        setCargando(true);
        getTemporalMensualPlaner({ anho })
            .then(({ data }) => setDatos(data))
            .catch(() => setDatos(null))
            .finally(() => setCargando(false));
    }, [anho]);

    const meses = datos?.meses ?? [];

    const barData = useMemo(() => {
        if (!meses.length) return null;
        return {
            labels: meses.map((m) => m.nombre_mes),
            datasets: [
                { label: '✅ Ejecutado', data: meses.map((m) => m.ejecutados), backgroundColor: '#16a34a', borderRadius: 4, stack: 'e' },
                { label: '⏳ Pendiente', data: meses.map((m) => m.pendientes), backgroundColor: '#f59e0b', borderRadius: 4, stack: 'e' },
                { label: '⏰ Atrasado', data: meses.map((m) => m.atrasados), backgroundColor: '#dc2626', borderRadius: 4, stack: 'e' },
            ],
        };
    }, [meses]);

    const barOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtN(ctx.raw)} ficha(s)` } },
        },
        scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 } },
        },
    };

    if (cargando) {
        return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Cargando…</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>📊 Ejecución mensual del Plan de Compras</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Fichas por mes de fecha de compra planificada — {fmtN(meses.reduce((a, m) => a + m.total, 0))} en total, {fmtCompacto(meses.reduce((a, m) => a + m.monto, 0))} planificados</div>
                <div className="chart-box" style={{ height: 260 }}>
                    {barData ? <Bar data={barData} options={barOptions} /> : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>Sin datos.</div>
                    )}
                </div>
            </div>

            <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>🗓️ Calendario de ejecución mensual</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>% de fichas ejecutadas (con formulario u OC vinculada) por mes</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {meses.map((m) => <CeldaMes key={m.mes} mes={m} />)}
                </div>
            </div>

            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, background: '#f0f9ff', borderColor: '#bae6fd' }}>
                <span style={{ fontSize: 20 }}>📑</span>
                <div style={{ fontSize: 12.5, color: '#0c4a6e' }}>
                    El informe completo (resumen por subdirección con responsables, fichas próximas a ejecutar y atrasadas) se genera desde la pestaña <strong>Reportes</strong>, en formato Word, PDF o PPT ejecutivo.
                </div>
            </div>

            <VerFichaSubtab anho={anho} />
        </div>
    );
}
