import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);

export default function FinancieroSect({ licitaciones = [], detalles = [] }) {
    const kpis = useMemo(() => {
        const conMonto = licitaciones.filter(l => parseFloat(l.MontoEstimado) > 0);
        const montoTotal = conMonto.reduce((acc, l) => acc + parseFloat(l.MontoEstimado), 0);
        const adjudicadas = licitaciones.filter(l => l.Estado === 'Adjudicada').length;

        const ahora = new Date();
        const proxima = licitaciones
            .filter(l => l.FechaEstimadaAdjudicacion && new Date(l.FechaEstimadaAdjudicacion) >= ahora)
            .sort((a, b) => new Date(a.FechaEstimadaAdjudicacion) - new Date(b.FechaEstimadaAdjudicacion))[0];

        return { conMonto: conMonto.length, montoTotal, adjudicadas, proxima };
    }, [licitaciones]);

    const montosPorTipo = useMemo(() => {
        const m = {};
        licitaciones.forEach(l => {
            if (!l.Tipo || !(parseFloat(l.MontoEstimado) > 0)) return;
            m[l.Tipo] = (m[l.Tipo] || 0) + parseFloat(l.MontoEstimado);
        });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [licitaciones]);

    const adjEstimadas = useMemo(() =>
        licitaciones
            .filter(l => l.FechaEstimadaAdjudicacion)
            .sort((a, b) => new Date(a.FechaEstimadaAdjudicacion) - new Date(b.FechaEstimadaAdjudicacion))
            .slice(0, 12),
        [licitaciones]
    );

    return (
        <div className="tab-view active" id="tab-financiero">
            {kpis.conMonto === 0 && (
                <div className="alert alert-info">
                    <span className="alert-icon">💡</span>
                    <div>
                        Las licitaciones actuales no declaran <strong>MontoEstimado</strong>.
                        Es una práctica habitual cuando el organismo no desea revelar su presupuesto.
                        Los análisis de monto se activarán automáticamente cuando haya datos disponibles.
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card kpi-azul">
                    <span className="kpi-icon">💵</span>
                    <div className="kpi-label">Monto Estimado Total</div>
                    <div className="kpi-value" style={{ fontSize: kpis.montoTotal > 0 ? '16px' : '18px' }}>
                        {kpis.montoTotal > 0 ? fmt(kpis.montoTotal) : 'No informado'}
                    </div>
                    <div className="kpi-meta">{kpis.conMonto} licitaciones con monto</div>
                </div>
                <div className="kpi-card kpi-celeste">
                    <span className="kpi-icon">🏆</span>
                    <div className="kpi-label">Adjudicadas</div>
                    <div className="kpi-value">{kpis.adjudicadas.toLocaleString('es-CL')}</div>
                    <div className="kpi-meta">
                        {licitaciones.length
                            ? `${((kpis.adjudicadas / licitaciones.length) * 100).toFixed(1)}% del total`
                            : '—'}
                    </div>
                </div>
                <div className="kpi-card kpi-amarillo">
                    <span className="kpi-icon">📦</span>
                    <div className="kpi-label">Ítems Registrados</div>
                    <div className="kpi-value">{detalles.length.toLocaleString('es-CL')}</div>
                    <div className="kpi-meta">productos en detalles</div>
                </div>
                <div className="kpi-card kpi-verde">
                    <span className="kpi-icon">📅</span>
                    <div className="kpi-label">Próxima Adj. Estimada</div>
                    <div className="kpi-value" style={{ fontSize: '18px' }}>
                        {kpis.proxima
                            ? new Date(kpis.proxima.FechaEstimadaAdjudicacion)
                                .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
                            : '—'}
                    </div>
                    <div className="kpi-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {kpis.proxima?.codigo_licitacion ?? 'Sin adjudicaciones próximas'}
                    </div>
                </div>
            </div>

            {/* Gráfico montos + lista adj. estimadas */}
            <div className="grid-2" style={{ marginTop: '18px' }}>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📈</span>
                        <span className="card-title">Monto Estimado por Tipo</span>
                    </div>
                    <div className="card-body">
                        {montosPorTipo.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">📉</div>
                                <div className="empty-state-msg">
                                    Sin montos estimados disponibles.<br />
                                    Las visualizaciones se activarán al registrarse montos.
                                </div>
                            </div>
                        ) : (
                            <div className="chart-wrap">
                                <Bar
                                    data={{
                                        labels: montosPorTipo.map(([tipo]) => tipo),
                                        datasets: [{
                                            label: 'Monto Estimado',
                                            data: montosPorTipo.map(([, m]) => m),
                                            backgroundColor: 'rgba(26,61,113,0.72)',
                                            borderRadius: 4, borderWidth: 0,
                                        }],
                                    }}
                                    options={{
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } },
                                        },
                                        scales: {
                                            y: {
                                                ticks: {
                                                    color: '#6c757d', font: { size: 10 },
                                                    callback: v => `$${(v / 1e6).toFixed(0)}M`,
                                                },
                                                grid: { color: 'rgba(0,0,0,0.05)' },
                                            },
                                            x: { ticks: { color: '#6c757d', font: { size: 10 } }, grid: { display: false } },
                                        },
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📅</span>
                        <span className="card-title">Adjudicaciones Estimadas</span>
                    </div>
                    <div className="card-body" style={{ padding: '8px 14px', maxHeight: '320px', overflowY: 'auto' }}>
                        {adjEstimadas.length === 0 ? (
                            <div style={{ color: '#aaa', textAlign: 'center', padding: '24px 0', fontSize: '12px' }}>
                                Sin fechas de adjudicación disponibles
                            </div>
                        ) : adjEstimadas.map(l => {
                            const d = new Date(l.FechaEstimadaAdjudicacion);
                            return (
                                <div className="adj-item" key={l.codigo_licitacion}>
                                    <div className="adj-date-box">
                                        <div className="adj-date-day">{d.getDate()}</div>
                                        <div className="adj-date-month">
                                            {d.toLocaleString('es', { month: 'short' }).toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="adj-info">
                                        <div className="adj-info-name">{l.Nombre?.substring(0, 52)}…</div>
                                        <div className="adj-info-code">{l.codigo_licitacion}</div>
                                        <div className="adj-info-buyer">👤 {l.C_Usuario}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Tabla de ítems */}
            <div className="card" style={{ marginTop: '18px' }}>
                <div className="card-header card-header-accent">
                    <span style={{ fontSize: '16px' }}>🧩</span>
                    <span className="card-title">Detalle de Ítems por Licitación</span>
                    <span className="card-subtitle" style={{ marginLeft: '8px', fontSize: '11px', color: '#9aabb8' }}>
                        {detalles.length > 200 ? `Mostrando 200 de ${detalles.length.toLocaleString('es-CL')}` : `${detalles.length} ítems`}
                    </span>
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Licitación</th>
                                <th>Corr.</th>
                                <th>Nombre Producto</th>
                                <th>Categoría</th>
                                <th>Unidad</th>
                                <th>Cantidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detalles.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#aaa' }}>Sin ítems</td></tr>
                            ) : detalles.slice(0, 200).map((item, idx) => (
                                <tr key={idx}>
                                    <td className="td-mono" style={{ fontSize: '10px' }}>
                                        {item.licitacion || item.CodigoLicitacion}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{item.Correlativo}</td>
                                    <td>
                                        <span title={item.DescripcionItem} style={{
                                            maxWidth: '200px', display: 'block',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {item.NombreProducto}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="tag tag-celeste" style={{ fontSize: '10px' }}>
                                            {item.Categoria?.split('/').slice(-1)[0].trim()}
                                        </span>
                                    </td>
                                    <td>{item.UnidadMedida}</td>
                                    <td style={{ textAlign: 'center' }}>{item.Cantidad}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
