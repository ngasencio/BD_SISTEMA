import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { getJefaturaAvance } from '../../api/comprasApi';
import { KpiCard } from '../../../abastecimiento/components/KpiCard';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const thStyle = {
    padding: '9px 10px', textAlign: 'left', fontWeight: 600,
    color: '#475569', borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12,
};

// Tab Avance — comparativa por comprador (activos / con gestión / con OC /
// finalizados) + KPIs globales. Mismo patrón visual que ResumenComprador
// (KpiCard + Chart.js), pero agregado sobre TODOS los compradores.
export default function TabAvance() {
    const [data, setData] = useState(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let activo = true;
        getJefaturaAvance()
            .then(({ data: res }) => { if (activo) setData(res); })
            .catch(() => { if (activo) setData(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, []);

    if (cargando) return <div className="card" style={{ padding: 18 }}><div className="loading-spinner">Cargando…</div></div>;
    if (!data) return <div className="error-message">No se pudo cargar el avance comparativo.</div>;

    const { kpis, por_comprador } = data;

    // Todos los compradores (ya vienen ordenados por FSC activos). La altura
    // del contenedor crece con la cantidad de filas.
    const top = por_comprador;
    const barData = top.length ? {
        labels: top.map((r) => r.comprador_display),
        datasets: [
            { label: 'Con OC emitida', data: top.map((r) => r.con_oc), backgroundColor: '#16a34a', stack: 'a', borderRadius: 4 },
            { label: 'Con gestión (sin OC)', data: top.map((r) => r.con_gestion - r.con_oc), backgroundColor: '#d97706', stack: 'a', borderRadius: 4 },
            { label: 'Sin gestión', data: top.map((r) => r.sin_gestion), backgroundColor: '#dc2626', stack: 'a', borderRadius: 4 },
        ],
    } : null;
    const barOptions = {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10.5 }, boxWidth: 10, padding: 8 } } },
        scales: {
            x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10.5 }, autoSkip: false } },
        },
    };

    return (
        <div>
            <div className="kpi-grid" style={{ marginBottom: 14 }}>
                <KpiCard icon="🗂️" title="FSC Activos" value={fmtN(kpis.total_activos)} colorVar="--color-primary" />
                <KpiCard icon="✅" title="Con Gestión" value={fmtN(kpis.total_con_gestion)}
                         subtitle={`${kpis.pct_con_gestion}% del total activo`} colorVar="--color-success" />
                <KpiCard icon="📦" title="Con OC Emitida" value={fmtN(kpis.total_con_oc)}
                         subtitle={`${kpis.pct_con_oc}% del total activo`} colorVar="--color-accent" />
                <KpiCard icon="🏁" title="Finalizados" value={fmtN(kpis.total_finalizados)} colorVar="--color-success" />
                <KpiCard icon="👥" title="Compradores Activos" value={fmtN(kpis.total_compradores)} colorVar="--color-warning" />
            </div>

            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>📊 Comparativa por Comprador</div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12 }}>
                    Todos los compradores ({por_comprador.length}), ordenados por volumen de FSC activos.
                </div>
                {!barData ? (
                    <div style={{ textAlign: 'center', padding: '28px 10px', color: '#94a3b8', fontSize: 12.5 }}>Sin datos.</div>
                ) : (
                    <div className="chart-box" style={{ width: '100%', height: Math.max(220, top.length * 32) }}>
                        <Bar data={barData} options={barOptions} />
                    </div>
                )}
            </div>

            <div className="card">
                <div className="card-header card-header-accent">
                    <span>🏆</span>
                    <span className="card-title">Ranking completo ({por_comprador.length} compradores)</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>#</th>
                                <th style={thStyle}>Comprador</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Activos</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Con Gestión</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Con OC</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Sin Gestión</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Finalizados</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Días Prom. Pendiente</th>
                            </tr>
                        </thead>
                        <tbody>
                            {por_comprador.map((r, i) => (
                                <tr key={r.comprador_nombre_panel} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{i + 1}</td>
                                    <td style={{
                                        padding: '8px 10px', fontWeight: 600,
                                        color: r.comprador_id ? '#1e293b' : '#dc2626',
                                    }}>
                                        {r.comprador_display}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtN(r.activos)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#d97706' }}>{fmtN(r.con_gestion)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmtN(r.con_oc)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: r.sin_gestion > 0 ? '#dc2626' : '#94a3b8' }}>{fmtN(r.sin_gestion)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtN(r.finalizados)}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{r.dias_promedio_pendiente ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
