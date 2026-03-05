import React, { useState } from 'react';
import { fmt } from '../utils';

export default function ReportesSect({ licitaciones }) {
    const [reportType, setReportType] = useState(null);

    const printResumen = () => setReportType('resumen');
    const printTimeline = () => setReportType('timeline');
    const printCompradores = () => setReportType('compradores');

    const handlePrint = () => {
        window.print();
    };

    const exportCSV = () => {
        const rows = [['CodigoLicitacion', 'Nombre', 'Estado', 'Tipo', 'Comprador', 'FechaPublicacion', 'FechaCierre', 'FechaEstimadaAdjudicacion', 'MontoEstimado'],
        ...licitaciones.map(l => [l.CodigoLicitacion, l.Nombre, l.Estado, l.Tipo, l.C_Usuario, l.FechaPublicacion, l.FechaCierre, l.FechaEstimadaAdjudicacion, l.MontoEstimado])];
        const csv = rows.map(r => r.join(';')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
        a.download = 'licitaciones_sso_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
    };

    const renderPreview = () => {
        if (!reportType) {
            return (
                <div className="empty-state">
                    <div className="empty-state-icon">📄</div>
                    <div className="empty-state-msg">Seleccione un tipo de reporte para generar la vista previa</div>
                </div>
            );
        }

        if (reportType === 'resumen') {
            return (
                <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                            <tr style={{ background: '#f0f3f8' }}>
                                <th style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--gob-azul)', fontSize: '10px', textTransform: 'uppercase', borderBottom: '2px solid #c5d3e8' }}>Código</th>
                                <th style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--gob-azul)', fontSize: '10px', textTransform: 'uppercase', borderBottom: '2px solid #c5d3e8' }}>Nombre</th>
                                <th style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--gob-azul)', fontSize: '10px', textTransform: 'uppercase', borderBottom: '2px solid #c5d3e8' }}>Estado</th>
                                <th style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--gob-azul)', fontSize: '10px', textTransform: 'uppercase', borderBottom: '2px solid #c5d3e8' }}>Comprador</th>
                                <th style={{ textAlign: 'left', padding: '7px 10px', color: 'var(--gob-azul)', fontSize: '10px', textTransform: 'uppercase', borderBottom: '2px solid #c5d3e8' }}>Adj. Estimada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {licitaciones.map(l => (
                                <tr key={l.CodigoLicitacion} style={{ borderBottom: '1px solid var(--gob-gris2)' }}>
                                    <td style={{ padding: '8px 10px', fontFamily: '"Roboto Mono",monospace', fontSize: '10px', color: 'var(--gob-azul-light)' }}>{l.CodigoLicitacion}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px' }}>{l.Nombre?.substring(0, 42)}…</td>
                                    <td style={{ padding: '8px 10px' }}>{l.Estado}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px' }}>{l.C_Usuario}</td>
                                    <td style={{ padding: '8px 10px', fontFamily: '"Roboto Mono",monospace', fontSize: '10px', color: '#b7770d', fontWeight: 600 }}>{fmt(l.FechaEstimadaAdjudicacion)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ textAlign: 'right', marginTop: '14px', fontSize: '10.5px', color: 'var(--gob-gris4)' }}>
                        Total: {licitaciones.length} licitaciones · Generado: {new Date().toLocaleDateString('es-CL')}
                    </div>
                    <div className="no-print" style={{ marginTop: '14px' }}>
                        <button onClick={handlePrint} className="btn btn-primary">🖨️ Imprimir / Guardar PDF</button>
                    </div>
                </>
            );
        }

        if (reportType === 'timeline') {
            return (
                <>
                    {licitaciones.map(l => (
                        <div key={l.CodigoLicitacion} style={{ marginBottom: '18px', padding: '14px', border: '1px solid var(--gob-gris2)', borderRadius: 'var(--radius)' }}>
                            <div style={{ fontFamily: '"Roboto Slab",serif', fontSize: '13px', fontWeight: 600, color: 'var(--gob-azul)', marginBottom: '12px' }}>{l.Nombre} <span style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '10px', color: 'var(--gob-azul-light)' }}>{l.CodigoLicitacion}</span></div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '14px', width: '22px', textAlign: 'center' }}>🚀</span>
                                <span style={{ fontSize: '11px', color: 'var(--gob-gris4)', minWidth: '130px' }}>Publicada</span>
                                <span style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px', color: 'var(--gob-gris5)', fontWeight: 600 }}>{fmt(l.FechaPublicacion)}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '14px', width: '22px', textAlign: 'center' }}>⏳</span>
                                <span style={{ fontSize: '11px', color: 'var(--gob-gris4)', minWidth: '130px' }}>Cierre Ofertas</span>
                                <span style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '11px', color: 'var(--gob-gris5)', fontWeight: 600 }}>{fmt(l.FechaCierre)}</span>
                            </div>
                        </div>
                    ))}
                    <div className="no-print" style={{ marginTop: '12px' }}><button onClick={handlePrint} className="btn btn-primary">🖨️ Imprimir / Guardar PDF</button></div>
                </>
            );
        }

        if (reportType === 'compradores') {
            const b = {};
            licitaciones.forEach(l => { if (!b[l.C_Usuario]) b[l.C_Usuario] = []; b[l.C_Usuario].push(l); });
            return (
                <>
                    {Object.entries(b).map(([n, ls]) => (
                        <div key={n} style={{ marginBottom: '14px', padding: '12px', background: 'var(--gob-gris1)', border: '1px solid var(--gob-gris2)', borderRadius: 'var(--radius)' }}>
                            <div style={{ fontFamily: '"Roboto Slab",serif', fontWeight: 600, fontSize: '13px', color: 'var(--gob-azul)', marginBottom: '8px' }}>👤 {n}</div>
                            {ls.map(l => <div key={l.CodigoLicitacion} style={{ fontSize: '11.5px', color: 'var(--gob-gris4)', marginBottom: '3px' }}>• {l.Nombre} <span style={{ fontFamily: '"Roboto Mono",monospace', fontSize: '10px', color: 'var(--gob-azul-light)' }}>({l.CodigoLicitacion})</span></div>)}
                        </div>
                    ))}
                    <div className="no-print" style={{ marginTop: '12px' }}><button onClick={handlePrint} className="btn btn-primary">🖨️ Imprimir / Guardar PDF</button></div>
                </>
            );
        }
    };

    return (
        <div className="tab-view active" id="tab-reportes">
            <div className="grid-2">
                <div className="no-print">
                    <div className="section-lbl">Opciones de Generación de Reportes</div>

                    <div className="card" style={{ marginBottom: '14px' }}>
                        <div className="card-header card-header-accent"><span style={{ fontSize: '15px' }}>📋</span><span className="card-title">Resumen de Licitaciones</span></div>
                        <div className="card-body">
                            <p style={{ fontSize: '12.5px', color: 'var(--gob-gris4)', marginBottom: '12px' }}>Genera un reporte consolidado de todas las licitaciones con sus datos principales.</p>
                            <div className="btn-row" style={{ marginTop: '0' }}>
                                <button className="btn btn-primary" onClick={printResumen}>🖨️ Ver y Exportar</button>
                                <button className="btn btn-secondary" onClick={exportCSV}>📥 Descargar CSV</button>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '14px' }}>
                        <div className="card-header card-header-accent"><span style={{ fontSize: '15px' }}>📅</span><span className="card-title">Cronograma de Hitos</span></div>
                        <div className="card-body">
                            <p style={{ fontSize: '12.5px', color: 'var(--gob-gris4)', marginBottom: '12px' }}>Detalle de todas las fechas del ciclo de vida de cada licitación.</p>
                            <div className="btn-row" style={{ marginTop: '0' }}>
                                <button className="btn btn-primary" onClick={printTimeline}>🖨️ Ver y Exportar</button>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '14px' }}>
                        <div className="card-header card-header-accent"><span style={{ fontSize: '15px' }}>👤</span><span className="card-title">Informe por Comprador</span></div>
                        <div className="card-body">
                            <p style={{ fontSize: '12.5px', color: 'var(--gob-gris4)', marginBottom: '12px' }}>Análisis de gestión y tiempos agrupado por comprador responsable.</p>
                            <div className="btn-row" style={{ marginTop: '0' }}>
                                <button className="btn btn-primary" onClick={printCompradores}>🖨️ Ver y Exportar</button>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header card-header-accent"><span style={{ fontSize: '15px' }}>🗂️</span><span className="card-title">Informe por Categoría</span></div>
                        <div className="card-body">
                            <p style={{ fontSize: '12.5px', color: 'var(--gob-gris4)', marginBottom: '12px' }}>Distribución de ítems y montos por jerarquía de categorías de productos.</p>
                            <div className="btn-row" style={{ marginTop: '0' }}>
                                <button className="btn btn-secondary" disabled>🔜 Disponible al adjudicar</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header card-header-accent no-print">
                        <span style={{ fontSize: '16px' }}>🖨️</span>
                        <span className="card-title">Vista Previa del Reporte</span>
                    </div>
                    <div className="card-body printable-area">
                        <div className="report-preview-box" id="report-preview">
                            <div className="report-header">
                                <div className="report-header-org">Gobierno de Chile · Servicio de Salud Osorno</div>
                                <div className="report-header-title">Subdepartamento de Abastecimiento</div>
                                <div className="report-header-date">Mercado Público — Módulo de Licitaciones · Generado: {new Date().toLocaleDateString('es-CL')}</div>
                            </div>
                            <div id="rp-content">
                                {renderPreview()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
