import React from 'react';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const thP = { padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' };
const tdP = { padding: '7px 10px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' };

const NOMBRES_MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function PanelCambiosAnexo1({ diff, onCerrar }) {
    if (!diff) return null;

    const {
        tramos_ok = [], tramos_fallidos = [], archivos_procesados = 0, archivos_fallidos = 0,
        filas_totales = 0, resumen = [], fallidos_detalle = [],
    } = diff;

    const kpis = [
        { icono: '🆕', label: 'Tramos sincronizados', valor: archivos_procesados },
        { icono: '📄', label: 'Filas cargadas', valor: filas_totales },
        { icono: '✅', label: 'Tramos descargados OK', valor: tramos_ok.length },
        { icono: '⚠️', label: 'Tramos con error', valor: tramos_fallidos.length + archivos_fallidos },
    ];

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 640, zIndex: 1300,
            background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', borderLeft: '3px solid #0ea5e9',
        }}>
            <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📊 Resumen de sincronización Anexo N°1</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Tramos establecimiento × mes incorporados en esta actualización</div>
                </div>
                <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '14px 24px', borderBottom: '1px solid #f1f5f9' }}>
                {kpis.map(k => (
                    <div key={k.label} style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 18 }}>{k.icono}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{fmtN(k.valor)}</div>
                        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>{k.label}</div>
                    </div>
                ))}
            </div>

            {(tramos_fallidos.length > 0 || fallidos_detalle.length > 0) && (
                <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
                    {tramos_fallidos.length > 0 && (
                        <div>No se pudo descargar: {tramos_fallidos.join(', ')}.</div>
                    )}
                    {fallidos_detalle.map((f, i) => <div key={i} style={{ marginTop: 4 }}>{f}</div>)}
                </div>
            )}

            <div style={{ padding: '16px 24px 4px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Tramos sincronizados</div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {resumen.length === 0 ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                            No se sincronizó ningún tramo en esta actualización.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={thP}>Establecimiento</th>
                                    <th style={thP}>Período</th>
                                    <th style={{ ...thP, textAlign: 'right' }}>Filas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resumen.map((r, i) => (
                                    <tr key={`${r.codigo_ue}-${r.anho}-${r.mes}`} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={tdP}>
                                            <div style={{ fontWeight: 600 }}>{r.nombre_establecimiento}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.codigo_ue}</div>
                                        </td>
                                        <td style={tdP}>{NOMBRES_MES[r.mes]} {r.anho}</td>
                                        <td style={{ ...tdP, textAlign: 'right', fontWeight: 500 }}>{fmtN(r.filas)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Cerrar
                </button>
            </div>
        </div>
    );
}
