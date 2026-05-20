import React, { useState } from 'react';

const fmt = (n) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const fPct = (v) => (v != null ? v.toFixed(1) + '%' : '—');

export default function InformePDFTab({ indicadores, ocStats, anio = 2026 }) {
    const [mods, setMods] = useState(0);
    const s3 = mods === 0 ? 100 : mods <= 3 ? 80 : mods <= 6 ? 60 : 40;

    const i1 = indicadores?.i1 ?? 0;
    const i2 = indicadores?.i2 ?? 0;
    const i5 = indicadores?.i5 ?? 0;

    const sc = { i1: Math.min(100, i1), i2: Math.min(100, i2), i3: s3, i4: 0, i5: Math.min(100, i5), i6: 0 };
    const pw = { i1: .25, i2: .15, i3: .10, i4: .20, i5: .20, i6: .10 };
    const score = Object.keys(pw).reduce((s, k) => s + sc[k] * pw[k], 0);

    const handlePrint = () => window.print();

    return (
        <div className="pac-tab-content">
            {/* Controles (no se imprimen) */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button className="btn btn-primary" onClick={handlePrint}>
                    🖨️ Imprimir / Guardar PDF
                </button>
                <label style={{ fontSize: 12, color: '#7a8899' }}>
                    Mods. PAC:
                    <input
                        type="number" min="0" value={mods}
                        onChange={(e) => setMods(parseInt(e.target.value) || 0)}
                        style={{ width: 50, marginLeft: 6, border: '1.5px solid #c8d3de', borderRadius: 5, padding: '3px 6px' }}
                    />
                </label>
                <span style={{ fontSize: 11, color: '#7a8899' }}>
                    El informe incluye los indicadores disponibles en BD. Ind. 4 y 6 requieren datos manuales.
                </span>
            </div>

            {/* Documento imprimible */}
            <div id="print-doc" className="pac-print-doc">
                <div className="pac-print-header">
                    <div>
                        <div className="pac-print-title">Informe de Gestión PAC {anio}</div>
                        <div className="pac-print-subtitle">Indicadores Resolución Exenta N°188/2026 · Organismo 7296</div>
                    </div>
                    <div className="pac-print-score">
                        <div className="pac-print-score-val">{score.toFixed(1)}</div>
                        <div className="pac-print-score-lbl">/100 pts</div>
                    </div>
                </div>

                <div className="pac-print-section">Resumen de Indicadores</div>
                <table className="pac-print-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Indicador</th>
                            <th>Fórmula</th>
                            <th>Pond.</th>
                            <th>Valor</th>
                            <th>Pts.</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>1</td>
                            <td>% Compras dentro del PAC</td>
                            <td>OC enlazadas / Total OC</td>
                            <td>25%</td>
                            <td>{fPct(indicadores?.i1)}</td>
                            <td>{(sc.i1 * .25).toFixed(1)}</td>
                        </tr>
                        <tr>
                            <td>2</td>
                            <td>% Procesos Competitivos</td>
                            <td>(SE Lic + AG) / Total OC</td>
                            <td>15%</td>
                            <td>{fPct(indicadores?.i2)}</td>
                            <td>{(sc.i2 * .15).toFixed(1)}</td>
                        </tr>
                        <tr>
                            <td>3</td>
                            <td>Modificaciones al PAC</td>
                            <td>N° ediciones</td>
                            <td>10%</td>
                            <td>{mods} mods.</td>
                            <td>{(s3 * .10).toFixed(1)}</td>
                        </tr>
                        <tr>
                            <td>4</td>
                            <td>Satisfacción Servicio/Producto</td>
                            <td>Σ Notas / N° notas</td>
                            <td>20%</td>
                            <td>Pendiente</td>
                            <td>0.0</td>
                        </tr>
                        <tr>
                            <td>5</td>
                            <td>Ahorro en Compras</td>
                            <td>Ahorro / Adjudicado</td>
                            <td>20%</td>
                            <td>{fPct(indicadores?.i5)}</td>
                            <td>{(sc.i5 * .20).toFixed(1)}</td>
                        </tr>
                        <tr>
                            <td>6</td>
                            <td>% RFI de Innovación</td>
                            <td>RFI Innov. / Total RFI</td>
                            <td>10%</td>
                            <td>Pendiente</td>
                            <td>0.0</td>
                        </tr>
                        <tr style={{ fontWeight: 700, background: '#f5f8fc' }}>
                            <td colSpan={5} style={{ textAlign: 'right' }}>Puntaje Total</td>
                            <td>{score.toFixed(1)}</td>
                        </tr>
                    </tbody>
                </table>

                {ocStats && (
                    <>
                        <div className="pac-print-section">Resumen Órdenes de Compra {anio}</div>
                        <table className="pac-print-table">
                            <tbody>
                                <tr>
                                    <td><strong>Total OC emitidas</strong></td>
                                    <td>{ocStats.resumen.total_oc.toLocaleString('es-CL')}</td>
                                    <td><strong>Monto Neto Total</strong></td>
                                    <td>{fmt(ocStats.resumen.monto_total)}</td>
                                </tr>
                                <tr>
                                    <td><strong>Monto Bruto Total</strong></td>
                                    <td>{fmt(ocStats.resumen.monto_bruto)}</td>
                                    <td><strong>Monto OC-PAC</strong></td>
                                    <td>{fmt(indicadores?.monto_enlazado_pac)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div className="pac-print-section">Estado de OC</div>
                        <table className="pac-print-table">
                            <thead>
                                <tr><th>Estado</th><th>Cantidad</th><th>Monto Neto</th></tr>
                            </thead>
                            <tbody>
                                {ocStats.por_estado.map((r, i) => (
                                    <tr key={i}>
                                        <td>{r.estado || '—'}</td>
                                        <td>{r.cantidad}</td>
                                        <td>{fmt(r.monto)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="pac-print-section">Top 10 Proveedores</div>
                        <table className="pac-print-table">
                            <thead>
                                <tr><th>Proveedor</th><th>RUT</th><th>OC</th><th>Monto</th></tr>
                            </thead>
                            <tbody>
                                {ocStats.top_proveedores.slice(0, 10).map((r, i) => (
                                    <tr key={i}>
                                        <td>{r.nombre || '—'}</td>
                                        <td>{r.rut || '—'}</td>
                                        <td>{r.cantidad}</td>
                                        <td>{fmt(r.monto)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}

                <div className="pac-print-footer">
                    Generado: {new Date().toLocaleDateString('es-CL')} · BD_SISTEMA · Organismo 7296
                </div>
            </div>
        </div>
    );
}
