import React, { useMemo, useState } from 'react';
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
    const [seleccionado, setSeleccionado] = useState(null);
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

    const onClickBarra = (evt, els) => {
        if (!els.length) return;
        const codigo = data.subtitulos[els[0].index]?.codigo;
        setSeleccionado((prev) => (prev === codigo ? null : codigo));
    };
    const cursorPointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
    const seleccionLabel = seleccionado
        ? (() => { const s = data.subtitulos.find((x) => x.codigo === seleccionado); return s ? `${s.codigo} ${s.nombre}` : seleccionado; })()
        : null;

    return (
        <div>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KpiCard title="En Ruta" value={data.contadores.en_ruta} icon="🟢" colorVar="--color-success" tip="Subtítulos con proyección de ejecución a diciembre ≥90% de la Ley." />
                <KpiCard title="En Atención" value={data.contadores.en_atencion} icon="🟡" colorVar="--color-warning" tip="Subtítulos con proyección de ejecución entre 70% y 90% de la Ley." />
                <KpiCard title="En Riesgo" value={data.contadores.en_riesgo} icon="🔴" colorVar="--color-danger" tip="Subtítulos con proyección de ejecución <70% de la Ley — riesgo de no ejecutar el presupuesto." />
                <KpiCard title="Meses Restantes" value={data.meses_restantes} icon="📅" colorVar="--color-primary" tip="Meses que quedan del año calendario para ejecutar el saldo de la Ley." />
            </div>

            {chartData && (
                <div className="card" style={{ padding: 16, height: 340, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gob-gris5)', marginBottom: 10 }} data-tip="Click en una barra para resaltar ese subtítulo en la tabla de abajo.">Ley vs. Proyección a Diciembre por Subtítulo</div>
                    <Bar
                        data={chartData}
                        options={{
                            responsive: true, maintainAspectRatio: false,
                            onClick: onClickBarra,
                            onHover: cursorPointer,
                            plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y * 1e6)}` } } },
                            scales: { x: { ticks: { font: { size: 10 }, maxRotation: 45 } }, y: { ticks: { callback: (v) => `M$${v}` } } },
                        }}
                    />
                </div>
            )}

            {seleccionLabel && (
                <div className="analysis-context">
                    🔎 Analizando: {seleccionLabel}
                    <button onClick={() => setSeleccionado(null)} title="Limpiar selección">✕</button>
                </div>
            )}

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table-gob">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Subtítulo</th>
                            <th>Ley</th>
                            <th>Dev. Acumulado</th>
                            <th data-tip="Devengado acumulado sobre la Ley del año completo, a la fecha.">% Ejec. Actual</th>
                            <th>Proyección Dic.</th>
                            <th data-tip="Devengado proyectado a diciembre sobre la Ley — define el color del semáforo.">% Ejec. Proyectada</th>
                            <th data-tip="Diferencia entre la Ley y la proyección a diciembre.">Brecha</th>
                            <th data-tip="Gasto mensual promedio necesario en lo que resta del año para ejecutar el 100% de la Ley.">Gasto Mensual Necesario</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.subtitulos.map((s) => (
                            <tr key={s.codigo} style={s.codigo === seleccionado ? { background: 'var(--gob-celeste-lt)' } : undefined}>
                                <td style={{ fontSize: 14 }}>{ICONO_ESTADO[s.estado]}</td>
                                <td>{s.codigo} {s.nombre}</td>
                                <td className="td-monto">{fmtMoney(s.ley)}</td>
                                <td className="td-monto">{fmtMoney(s.devengado_acumulado)}</td>
                                <td className="td-monto">{fmtPct(s.pct_ejecucion_actual)}</td>
                                <td className="td-monto">{fmtMoney(s.proyeccion_diciembre)}</td>
                                <td className="td-monto" style={{ fontWeight: 700, color: COLOR_ESTADO[s.estado] }}>{fmtPct(s.pct_ejecucion_proyectado)}</td>
                                <td className="td-monto">{fmtMoney(s.brecha)}</td>
                                <td className="td-monto">{s.gasto_mensual_necesario != null ? fmtMoney(s.gasto_mensual_necesario) : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
