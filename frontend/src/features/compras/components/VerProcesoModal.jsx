import React, { useEffect, useState } from 'react';
import { getDetalleProcesoMp } from '../api/comprasApi';
import { tipoLabel } from '../constants/estadosProceso';

const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);

const Campo = ({ label, value, span2 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...(span2 ? { gridColumn: 'span 2' } : {}) }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 13, color: '#1e293b' }}>{value || '—'}</span>
    </div>
);

const SeccionTitulo = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid #ede9fe' }}>
        {children}
    </div>
);

// Línea de tiempo compacta con las fechas clave de la licitación/compra ágil,
// en orden cronológico, marcando lo ya ocurrido vs lo pendiente.
function LineaTiempo({ fechas }) {
    if (!fechas || fechas.length === 0) {
        return <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>Sin fechas registradas para este proceso.</p>;
    }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    return (
        <div>
            {fechas.map((f, i) => {
                const d = new Date(f.fecha);
                const dSolo = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                const diffDias = Math.round((dSolo - hoy) / 86400000);
                const pasado = diffDias < 0;
                const esHoy = diffDias === 0;
                const color = esHoy ? '#d97706' : pasado ? '#16a34a' : '#94a3b8';
                const relativo = esHoy ? 'Hoy' : pasado ? `hace ${-diffDias} día${-diffDias === 1 ? '' : 's'}` : `en ${diffDias} día${diffDias === 1 ? '' : 's'}`;
                return (
                    <div key={f.clave} style={{ display: 'flex', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0 }}>
                            <span style={{
                                width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                                background: pasado || esHoy ? color : '#fff', border: `2.5px solid ${color}`,
                            }} />
                            {i < fechas.length - 1 && <span style={{ width: 2, flex: 1, background: '#e2e8f0', minHeight: 26 }} />}
                        </div>
                        <div style={{ paddingBottom: 18 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.label}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                {d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {' · '}
                                <span style={{ color, fontWeight: 600 }}>{relativo}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Detalle "todos los registros" de la Licitación/Compra Ágil enlazada a un
// Proceso de Compra — resumen curado, línea de tiempo de fechas clave,
// líneas/productos, y las OC ya enlazadas a ese proceso (recibidas via prop,
// ya cargadas en el panel padre).
export default function VerProcesoModal({ proceso, onCerrar }) {
    const [detalle, setDetalle] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!proceso) return;
        let activo = true;
        setCargando(true);
        setError(null);
        getDetalleProcesoMp(proceso.id)
            .then(({ data }) => { if (activo) setDetalle(data); })
            .catch(() => { if (activo) setError('No fue posible cargar el detalle del proceso.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [proceso?.id]);

    if (!proceso) return null;

    const lic = detalle?.licitacion;
    const ca = detalle?.compra_agil;
    const lineas = detalle?.lineas || [];

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
             onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

                <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{lic?.codigo_licitacion || ca?.codigocompraagil || proceso.titulo}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                                {tipoLabel(proceso.tipo_proceso)}
                            </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{lic?.Nombre || ca?.nombre || proceso.titulo}</div>
                    </div>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
                    {cargando && <div className="loading-spinner">Cargando…</div>}
                    {error && <div className="error-message">{error}</div>}

                    {!cargando && !lic && !ca && (
                        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                            Este proceso no tiene una Licitación o Compra Ágil enlazada aún — no hay datos de Mercado Público que mostrar.
                        </p>
                    )}

                    {lic && (
                        <section>
                            <SeccionTitulo>Datos de la Licitación</SeccionTitulo>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px', marginBottom: 14 }}>
                                <Campo label="Estado en Mercado Público" value={lic.Estado} />
                                <Campo label="Organismo" value={lic.C_NombreOrganismo} />
                                <Campo label="Unidad" value={lic.C_Unidad} />
                                <Campo label="Comprador MP" value={lic.C_Usuario} />
                                <Campo label="Tipo" value={lic.DescripcionTipoLicitacion} />
                                <Campo label="Monto Estimado" value={fmtCLP(lic.MontoEstimado)} />
                            </div>
                            {lic.Descripcion && (
                                <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6, margin: 0, background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                                    {lic.Descripcion}
                                </p>
                            )}
                        </section>
                    )}

                    {ca && (
                        <section>
                            <SeccionTitulo>Datos de la Compra Ágil</SeccionTitulo>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px', marginBottom: 14 }}>
                                <Campo label="Estado en Mercado Público" value={ca.estadoglosa} />
                                <Campo label="Unidad de Compra" value={ca.unidadcompra} />
                                <Campo label="Presupuesto Estimado" value={ca.presupuestoestimado ? fmtCLP(Number(ca.presupuestoestimado)) : '—'} />
                            </div>
                            {ca.descripcion && (
                                <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6, margin: 0, background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                                    {ca.descripcion}
                                </p>
                            )}
                        </section>
                    )}

                    {(lic || ca) && (
                        <section>
                            <SeccionTitulo>Línea de Tiempo</SeccionTitulo>
                            <LineaTiempo fechas={detalle?.fechas} />
                        </section>
                    )}

                    {lineas.length > 0 && (
                        <section>
                            <SeccionTitulo>{lic ? 'Líneas de la Licitación' : 'Productos de la Compra Ágil'}</SeccionTitulo>
                            <table className="data-table data-table-sm" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 12 }}>Producto</th>
                                        <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 12 }}>Descripción</th>
                                        <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 12 }}>Cantidad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineas.map((l, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                            <td style={{ padding: '7px 10px', fontSize: 12, color: '#374151' }}>{l.NombreProducto || l.nombre || '—'}</td>
                                            <td style={{ padding: '7px 10px', maxWidth: 320, fontSize: 12, color: '#374151' }}>
                                                <div className="truncate-text" title={l.DescripcionItem || l.descripcion}>{l.DescripcionItem || l.descripcion || '—'}</div>
                                            </td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#374151' }}>
                                                {fmtN(l.Cantidad ?? l.cantidad)} {l.UnidadMedida || l.unidadmedida || ''}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    )}

                    {proceso.ordenes_compra_detalle?.length > 0 && (
                        <section>
                            <SeccionTitulo>Órdenes de Compra Enlazadas</SeccionTitulo>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {proceso.ordenes_compra_detalle.map(oc => (
                                    <div key={oc.id} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, padding: '9px 12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#15803d', fontSize: 12.5 }}>{oc.codigo_oc}</span>
                                            <span style={{ fontSize: 11.5, color: '#475569' }}>{oc.estado_oc}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{oc.nombre_oc}</div>
                                        {oc.link_mp && (
                                            <a href={oc.link_mp} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb' }}>
                                                Ver en Mercado Público ↗
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
