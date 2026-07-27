import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';
import { useAnexo1Fetch } from '../../hooks/useAnexo1Fetch';
import { fetchSemaforoAnexo1 } from '../../api/anexo1SigfeApi';
import { paramsBase } from './filtrosParams';

const fmtMoney = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtM = (n) => 'M$ ' + (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 });
const fmtPct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);

const COLOR_ESTADO = { verde: '#16a34a', amarillo: '#ca8a04', rojo: '#dc2626' };
const ICONO_ESTADO = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };

export default function TabSemaforo({ filtros, refreshKey }) {
    const { data, loading, error } = useAnexo1Fetch(
        fetchSemaforoAnexo1, paramsBase(filtros), refreshKey, 'No se pudo cargar el Semáforo de Cierre.',
    );

    const chartData = useMemo(() => {
        if (!data?.subtitulos?.length) return null;
        return {
            labels: data.subtitulos.map((s) => `${s.codigo} ${s.nombre}`.slice(0, 26)),
            datasets: [
                { label: 'Ley (M$)', data: data.subtitulos.map((s) => s.ley / 1e6), backgroundColor: '#cbd5e1', borderRadius: 3 },
                {
                    label: 'Proyección a Diciembre (M$)',
                    data: data.subtitulos.map((s) => s.proyeccion_diciembre / 1e6),
                    backgroundColor: data.subtitulos.map((s) => COLOR_ESTADO[s.estado]),
                    borderRadius: 3,
                },
            ],
        };
    }, [data]);

    if (loading && !data) return <div className="loading-spinner">Cargando Semáforo de Cierre…</div>;
    if (error) return <div className="error-message">{error}</div>;
    if (!data) return null;

    if (!data.ultimo_mes_con_datos) {
        return <div className="error-message">No hay datos cargados para el año seleccionado.</div>;
    }

    return (
        <div>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="En Ruta" value={data.contadores.en_ruta} icon="🟢" colorVar="--color-success" />
                <KpiCard title="En Atención" value={data.contadores.en_atencion} icon="🟡" colorVar="--color-warning" />
                <KpiCard title="En Riesgo" value={data.contadores.en_riesgo} icon="🔴" colorVar="--color-danger" />
                <KpiCard title="Meses Restantes" value={data.meses_restantes} icon="📅" colorVar="--color-primary" />
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 340, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>Ley vs. Proyección a Diciembre por Subtítulo</div>
                    <Bar
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y * 1e6)}` } } },
                            scales: { x: { ticks: { font: { size: 10 }, maxRotation: 45 } }, y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['', 'Subtítulo', 'Ley', 'Dev. Acumulado', '% Ejec. Actual', 'Proyección Dic.', '% Ejec. Proyectada', 'Brecha', 'Gasto Mensual Necesario'].map((h) => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11.5, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.subtitulos.map((s) => (
                            <tr key={s.codigo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '9px 12px', fontSize: 14 }}>{ICONO_ESTADO[s.estado]}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5 }}>{s.codigo} {s.nombre}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(s.ley)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(s.devengado_acumulado)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtPct(s.pct_ejecucion_actual)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(s.proyeccion_diciembre)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right', fontWeight: 700, color: COLOR_ESTADO[s.estado] }}>{fmtPct(s.pct_ejecucion_proyectado)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{fmtMoney(s.brecha)}</td>
                                <td style={{ padding: '9px 12px', fontSize: 12.5, textAlign: 'right' }}>{s.gasto_mensual_necesario != null ? fmtMoney(s.gasto_mensual_necesario) : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
