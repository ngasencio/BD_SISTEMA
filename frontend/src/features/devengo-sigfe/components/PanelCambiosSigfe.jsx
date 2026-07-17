import React from 'react';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const thP = { padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' };
const tdP = { padding: '7px 10px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' };

export default function PanelCambiosSigfe({ diff, onCerrar }) {
    if (!diff) return null;

    const { establecimientos_ok = [], establecimientos_fallidos = [], insertadas = 0, ya_existian = 0,
        resumen_por_ue = [], nuevos_detalle = [], nuevos_detalle_truncado = false } = diff;

    const kpis = [
        { icono: '🆕', label: 'Documentos nuevos', valor: insertadas },
        { icono: '♻️', label: 'Ya existían', valor: ya_existian },
        { icono: '✅', label: 'Establecimientos OK', valor: establecimientos_ok.length },
        { icono: '⚠️', label: 'Establecimientos con error', valor: establecimientos_fallidos.length },
    ];

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 720, zIndex: 1300,
            background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', borderLeft: '3px solid #0ea5e9',
        }}>
            {/* Header */}
            <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📊 Resumen de sincronización SIGFE</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Documentos incorporados en esta actualización</div>
                </div>
                <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '14px 24px', borderBottom: '1px solid #f1f5f9' }}>
                {kpis.map(k => (
                    <div key={k.label} style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 18 }}>{k.icono}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{fmtN(k.valor)}</div>
                        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>{k.label}</div>
                    </div>
                ))}
            </div>

            {establecimientos_fallidos.length > 0 && (
                <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
                    No se pudo descargar: {establecimientos_fallidos.join(', ')}. Revisa las fechas o vuelve a intentar
                    solo para esos establecimientos.
                </div>
            )}

            {/* Análisis por establecimiento */}
            {resumen_por_ue.length > 0 && (
                <div style={{ padding: '16px 24px 4px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Análisis por establecimiento</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thP}>Establecimiento</th>
                                <th style={{ ...thP, textAlign: 'right' }}>Docs. nuevos</th>
                                <th style={{ ...thP, textAlign: 'right' }}>Monto vigente</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resumen_por_ue.map((r, i) => (
                                <tr key={r.codigo_ue} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={tdP}>{r.codigo_ue}</td>
                                    <td style={{ ...tdP, textAlign: 'right' }}>{fmtN(r.cantidad)}</td>
                                    <td style={{ ...tdP, textAlign: 'right', fontWeight: 500 }}>{fmtCLP(r.monto_vigente_total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Detalle de documentos nuevos */}
            <div style={{ padding: '16px 24px 4px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                    Documentos nuevos {nuevos_detalle_truncado && <span style={{ fontWeight: 400, color: '#94a3b8' }}>(mostrando los primeros {nuevos_detalle.length})</span>}
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {nuevos_detalle.length === 0 ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                            No se agregaron documentos nuevos en esta sincronización.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={thP}>Establecimiento</th>
                                    <th style={thP}>Proveedor</th>
                                    <th style={thP}>Documento</th>
                                    <th style={thP}>Fecha</th>
                                    <th style={thP}>Concepto</th>
                                    <th style={{ ...thP, textAlign: 'right' }}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {nuevos_detalle.map((d, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ ...tdP, maxWidth: 140 }}>
                                            <div className="truncate-text" title={d.codigo_ue} style={{ fontSize: 11 }}>{d.codigo_ue}</div>
                                        </td>
                                        <td style={{ ...tdP, maxWidth: 160 }}>
                                            <div className="truncate-text" title={d.principal} style={{ fontSize: 12 }}>{d.principal || '—'}</div>
                                        </td>
                                        <td style={tdP}>{d.tipo_documento} #{d.numero_documento}</td>
                                        <td style={tdP}>{d.fecha_documento || '—'}</td>
                                        <td style={{ ...tdP, maxWidth: 180 }}>
                                            <div className="truncate-text" title={d.concepto_presupuestario} style={{ fontSize: 11 }}>{d.concepto_presupuestario}</div>
                                        </td>
                                        <td style={{ ...tdP, textAlign: 'right', fontWeight: 500 }}>{fmtCLP(d.monto_vigente)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Cerrar
                </button>
            </div>
        </div>
    );
}
