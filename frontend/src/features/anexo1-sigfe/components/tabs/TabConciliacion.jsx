import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchConciliacionDevengoAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);

export default function TabConciliacion({ filtros, refreshKey }) {
    const { data, loading, error } = useAnexo1Fetch(
        fetchConciliacionDevengoAnexo1, paramsBase(filtros), refreshKey, 'No se pudo cargar la Conciliación con Anexo N°3.',
    );

    const chartData = useMemo(() => {
        if (!data?.filas?.length) return null;
        const filas = data.filas.filter((f) => f.deuda_flujo_anexo1 > 0 || f.deuda_stock_anexo3 > 0);
        return {
            labels: filas.map((f) => `${f.codigo} ${f.nombre || ''}`.slice(0, 26)),
            datasets: [
                { label: 'Deuda Flotante — Anexo N°1 (flujo)', data: filas.map((f) => f.deuda_flujo_anexo1 / 1e6), backgroundColor: '#1B3FD8', borderRadius: 3 },
                { label: 'Deuda Pendiente — Anexo N°3 (stock actual)', data: filas.map((f) => f.deuda_stock_anexo3 / 1e6), backgroundColor: '#D0202F', borderRadius: 3 },
            ],
        };
    }, [data]);

    if (loading && !data) return <div className="loading-spinner">Cargando Conciliación con Anexo N°3…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    const t = data.totales;

    return (
        <div>
            <div style={{ background: '#f0f6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', fontSize: 12.5, color: '#1e40af', marginBottom: 20 }}>
                <strong>ℹ️ Por qué estos montos no calzan exacto:</strong> "Deuda Flotante" (Anexo N°1) es un{' '}
                <strong>flujo</strong> — cuánta deuda se generó dentro del período seleccionado (Devengado − Efectivo,
                mes a mes). "Deuda Pendiente" (Anexo N°3) es un <strong>stock</strong> — el saldo impago de cada
                documento (factura, resolución, etc.) a la fecha de hoy, sin importar el año en que se originó. Se
                espera que estén en el mismo orden de magnitud, no que calcen al peso — la diferencia suele explicarse
                por deuda de períodos anteriores que ya se pagó o que sigue arrastrándose.
            </div>

            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="Deuda Flotante — Anexo N°1 (flujo del período)" value={fmtMoney(t.deuda_flujo_anexo1)} icon="📊" colorVar="--color-primary" />
                <KpiCard title="Deuda Pendiente — Anexo N°3 (stock actual)" value={fmtMoney(t.deuda_stock_anexo3)} icon="⚠️" colorVar="--color-danger" />
                <KpiCard title="Diferencia" value={fmtMoney(t.delta)} subtitle={fmtPct(t.delta_pct)} icon="↔️" colorVar={Math.abs(t.delta_pct ?? 0) < 15 ? '--color-success' : '--color-warning'} />
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 380, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>Deuda Flotante vs. Deuda Pendiente por Subtítulo</div>
                    <Bar
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom' } },
                            scales: { x: { ticks: { font: { size: 10 }, maxRotation: 45 } }, y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['Subtítulo', 'Deuda Flotante (N°1)', 'Deuda Pendiente (N°3)', 'Diferencia', 'Diferencia %'].map((h) => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.filas.map((f) => (
                            <tr key={f.codigo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{f.codigo} {f.nombre || '(sin match en Anexo N°1)'}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(f.deuda_flujo_anexo1)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(f.deuda_stock_anexo3)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(f.delta)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right', fontWeight: 600 }}>{fmtPct(f.delta_pct)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
