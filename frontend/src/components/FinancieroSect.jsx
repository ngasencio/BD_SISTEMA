import React from 'react';

export default function FinancieroSect({ licitaciones, detalles }) {
    return (
        <div className="tab-view active" id="tab-financiero">
            <div className="alert alert-info">
                <span className="alert-icon">💡</span>
                <div>
                    El campo <strong>MontoEstimado</strong> no fue declarado en las {licitaciones.length} licitaciones actuales.
                    Esta es una práctica común cuando el organismo no desea revelar el presupuesto disponible.
                    Los análisis financieros se activarán automáticamente al registrarse montos adjudicados.
                </div>
            </div>
            <div className="kpi-grid">
                <div className="kpi-card kpi-azul">
                    <span className="kpi-icon">💵</span>
                    <div className="kpi-label">Monto Estimado Total</div>
                    <div className="kpi-value" style={{ fontSize: '20px', paddingTop: '4px' }}>No inform.</div>
                    <div className="kpi-meta">Ambas licitaciones en $0</div>
                </div>
                <div className="kpi-card kpi-celeste">
                    <span className="kpi-icon">🏆</span>
                    <div className="kpi-label">Monto Adjudicado</div>
                    <div className="kpi-value" style={{ fontSize: '20px', paddingTop: '4px' }}>Pendiente</div>
                    <div className="kpi-meta">Adjudicaciones no resueltas</div>
                </div>
                <div className="kpi-card kpi-amarillo">
                    <span className="kpi-icon">📦</span>
                    <div className="kpi-label">Ítems Adjudicados</div>
                    <div className="kpi-value">0</div>
                    <div className="kpi-meta">De {detalles.length} ítems totales</div>
                </div>
                <div className="kpi-card kpi-verde">
                    <span className="kpi-icon">📅</span>
                    <div className="kpi-label">Adj. Estimada Más Próxima</div>
                    <div className="kpi-value" style={{ fontSize: '18px', paddingTop: '4px' }}>31 Mar</div>
                    <div className="kpi-meta">1057532-15-LE26</div>
                </div>
            </div>

            <div className="grid-2">
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📈</span>
                        <span className="card-title">Distribución de Montos Adjudicados</span>
                    </div>
                    <div className="card-body">
                        <div className="empty-state">
                            <div className="empty-state-icon">📉</div>
                            <div className="empty-state-msg">Sin montos adjudicados disponibles.<br />Las visualizaciones se generarán automáticamente al resolverse las adjudicaciones.</div>
                        </div>
                    </div>
                </div>
                <div className="card">
                    <div className="card-header card-header-accent">
                        <span style={{ fontSize: '16px' }}>📅</span>
                        <span className="card-title">Calendario de Adjudicaciones Estimadas</span>
                    </div>
                    <div className="card-body">
                        {licitaciones.map(l => {
                            if (!l.FechaEstimadaAdjudicacion) return null;
                            const d = new Date(l.FechaEstimadaAdjudicacion);
                            return (
                                <div className="adj-item" key={l.CodigoLicitacion}>
                                    <div className="adj-date-box">
                                        <div className="adj-date-day">{d.getDate()}</div>
                                        <div className="adj-date-month">{d.toLocaleString('es', { month: 'short' }).toUpperCase()}</div>
                                    </div>
                                    <div className="adj-info">
                                        <div className="adj-info-name">{l.Nombre.substring(0, 50)}…</div>
                                        <div className="adj-info-code">{l.CodigoLicitacion}</div>
                                        <div className="adj-info-buyer">👤 {l.C_Usuario}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header card-header-accent">
                    <span style={{ fontSize: '16px' }}>🧩</span>
                    <span className="card-title">Detalle de Ítems por Licitación</span>
                    <span className="card-subtitle">Con montos unitarios cuando estén disponibles</span>
                </div>
                <div className="table-responsive">
                    <table className="table-gob">
                        <thead>
                            <tr>
                                <th>Licitación</th><th>Corr.</th><th>Nombre Producto</th><th>Categoría</th><th>Unidad</th><th>Cantidad</th><th>Precio Unit.</th><th>Cant. Adj.</th><th>Total Est.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detalles.map(i => (
                                <tr key={`${i.CodigoLicitacion}-${i.Correlativo}`}>
                                    <td className="td-mono">{i.CodigoLicitacion}</td>
                                    <td style={{ textAlign: 'center' }}>{i.Correlativo}</td>
                                    <td><span title={i.DescripcionItem} style={{ maxWidth: '200px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.NombreProducto}</span></td>
                                    <td><span className="tag tag-celeste" style={{ fontSize: '10px' }}>{i.Categoria?.split('/').slice(-1)[0].trim()}</span></td>
                                    <td>{i.UnidadMedida}</td>
                                    <td style={{ textAlign: 'center' }}>{i.Cantidad}</td>
                                    <td><span className="tag tag-gris">No inform.</span></td>
                                    <td style={{ textAlign: 'center', color: 'var(--gob-gris4)' }}>—</td>
                                    <td style={{ color: 'var(--gob-gris4)' }}>—</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
