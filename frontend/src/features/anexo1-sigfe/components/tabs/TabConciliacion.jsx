import React, { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchConciliacionDevengoAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);

export default function TabConciliacion({ filtros, refreshKey }) {
    const [seleccionado, setSeleccionado] = useState(null);
    const { data, loading, error } = useAnexo1Fetch(
        fetchConciliacionDevengoAnexo1, paramsBase(filtros), refreshKey, 'No se pudo cargar la Conciliación con Anexo N°3.',
    );

    const filasChart = useMemo(() => {
        if (!data?.filas?.length) return [];
        return data.filas.filter((f) => f.deuda_flujo_anexo1 > 0 || f.deuda_stock_anexo3 > 0);
    }, [data]);

    const chartData = useMemo(() => {
        if (!filasChart.length) return null;
        return {
            labels: filasChart.map((f) => `${f.codigo} ${f.nombre || ''}`.slice(0, 26)),
            datasets: [
                { label: 'Deuda Flotante — Anexo N°1 (flujo)', data: filasChart.map((f) => f.deuda_flujo_anexo1 / 1e6), backgroundColor: '#1B3FD8', borderRadius: 3 },
                { label: 'Deuda Pendiente — Anexo N°3 (stock actual)', data: filasChart.map((f) => f.deuda_stock_anexo3 / 1e6), backgroundColor: '#D0202F', borderRadius: 3 },
            ],
        };
    }, [filasChart]);

    if (loading && !data) return <div className="loading-spinner">Cargando Conciliación con Anexo N°3…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    const t = data.totales;
    const onClickBarra = (evt, els) => {
        if (!els.length) return;
        const codigo = filasChart[els[0].index]?.codigo;
        setSeleccionado((prev) => (prev === codigo ? null : codigo));
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

    return (
        <div>
            <div style={{ background: 'var(--gob-celeste-lt)', border: '1px solid var(--gob-celeste)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 12.5, color: 'var(--gob-azul-dark)', marginBottom: 20 }}>
                <strong>ℹ️ Por qué estos montos no calzan exacto:</strong> "Deuda Flotante" (Anexo N°1) es un{' '}
                <strong>flujo</strong> — cuánta deuda se generó dentro del período seleccionado (Devengado − Efectivo,
                mes a mes). "Deuda Pendiente" (Anexo N°3) es un <strong>stock</strong> — el saldo impago de cada
                documento (factura, resolución, etc.) a la fecha de hoy, sin importar el año en que se originó. Se
                espera que estén en el mismo orden de magnitud, no que calcen al peso — la diferencia suele explicarse
                por deuda de períodos anteriores que ya se pagó o que sigue arrastrándose.
            </div>

            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="Deuda Flotante — Anexo N°1 (flujo del período)" value={fmtMoney(t.deuda_flujo_anexo1)} icon="📊" colorVar="--color-primary" tip="Devengado menos Efectivo del período seleccionado (flujo)." />
                <KpiCard title="Deuda Pendiente — Anexo N°3 (stock actual)" value={fmtMoney(t.deuda_stock_anexo3)} icon="⚠️" colorVar="--color-danger" tip="Saldo impago de documentos a la fecha de hoy, sin importar el año de origen (stock)." />
                <KpiCard title="Diferencia" value={fmtMoney(t.delta)} subtitle={fmtPct(t.delta_pct)} icon="↔️" colorVar={Math.abs(t.delta_pct ?? 0) < 15 ? '--color-success' : '--color-warning'} tip="Diferencia entre flujo (N°1) y stock (N°3) — un desfase moderado es esperable, ver nota arriba." />
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 380, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }} data-tip="Compara, por subtítulo, la deuda flotante del período (Anexo N°1) contra la deuda pendiente vigente (Anexo N°3).">Deuda Flotante vs. Deuda Pendiente por Subtítulo</div>
                    <Bar
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            onClick: onClickBarra,
                            onHover: cursorPointer,
                            plugins: { legend: { position: 'bottom' } },
                            scales: { x: { ticks: { font: { size: 10 }, maxRotation: 45 } }, y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            {seleccionado && (() => {
                const f = data.filas.find((x) => x.codigo === seleccionado);
                return f ? (
                    <div className="analysis-context">
                        🔎 Analizando: {f.codigo} {f.nombre || '(sin match en Anexo N°1)'}
                        <button onClick={() => setSeleccionado(null)} title="Limpiar selección">✕</button>
                    </div>
                ) : null;
            })()}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th>Subtítulo</th>
                            <th>Deuda Flotante (N°1)</th>
                            <th>Deuda Pendiente (N°3)</th>
                            <th>Diferencia</th>
                            <th>Diferencia %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.filas.map((f) => (
                            <tr key={f.codigo} style={f.codigo === seleccionado ? { background: 'var(--gob-celeste-lt)' } : undefined}>
                                <td>{f.codigo} {f.nombre || '(sin match en Anexo N°1)'}</td>
                                <td className="td-monto">{fmtMoney(f.deuda_flujo_anexo1)}</td>
                                <td className="td-monto">{fmtMoney(f.deuda_stock_anexo3)}</td>
                                <td className="td-monto">{fmtMoney(f.delta)}</td>
                                <td className="td-monto" style={{ fontWeight: 600 }}>{fmtPct(f.delta_pct)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
