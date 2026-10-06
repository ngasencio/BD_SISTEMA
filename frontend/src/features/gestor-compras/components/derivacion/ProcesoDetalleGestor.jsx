import React, { useEffect, useState } from 'react';
import { getGestorProceso, getGestorProcesoHistorial } from '../../api/gestorComprasApi';
import { ESTADO_COLOR, colorPorTipo, estadoLabel, tipoLabel } from '../../../compras/constants/estadosProceso';
import { fmtCLP } from '../solicitudes/shared';

const PAC_INFO = {
    PAC_OK: { label: 'PAC OK', color: '#16a34a' },
    SIN_PAC: { label: 'Sin PAC', color: '#dc2626' },
    PAC_DISTINTO: { label: 'PAC distinto', color: '#ea580c' },
};

const urlSegura = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

const fmtFechaHora = (iso) => (iso
    ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—');

function Campo({ label, value, span2 }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...(span2 ? { gridColumn: 'span 2' } : {}) }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ fontSize: 13, color: '#1e293b' }}>{value || '—'}</span>
        </div>
    );
}

function Seccion({ titulo, children }) {
    return (
        <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid #ede9fe' }}>
                {titulo}
            </div>
            {children}
        </section>
    );
}

function Chip({ color, children }) {
    return (
        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', background: `${color}1f`, color, border: `1px solid ${color}55` }}>
            {children}
        </span>
    );
}

// Detalle de SOLO LECTURA de un proceso de compra del departamento: datos, observaciones,
// FSC propios, órdenes de compra y el historial completo de estados con los comentarios
// del comprador. Lo abre la tabla de procesos o el chip de "Estado de Gestión" de un FSC.
export default function ProcesoDetalleGestor({ procesoId, params, onVerFsc, onVerMercadoPublico, onCerrar }) {
    const [proceso, setProceso] = useState(null);
    const [historial, setHistorial] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(null);
        Promise.all([getGestorProceso(procesoId, params), getGestorProcesoHistorial(procesoId, params)])
            .then(([{ data: p }, { data: h }]) => { if (activo) { setProceso(p); setHistorial(h); } })
            .catch(() => { if (activo) setError('No fue posible cargar el proceso.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [procesoId, params]);

    const tieneMp = Boolean(proceso && (proceso.licitacion || proceso.codigo_compra_agil));

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
        >
            <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                            {proceso?.titulo || 'Proceso de compra'}
                        </div>
                        {proceso && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Chip color={colorPorTipo(proceso.tipo_proceso)}>{tipoLabel(proceso.tipo_proceso)}</Chip>
                                <Chip color={ESTADO_COLOR(proceso.estado_proceso)}>{estadoLabel(proceso.estado_proceso)}</Chip>
                            </div>
                        )}
                    </div>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
                    {cargando && <div className="loading-spinner">Cargando…</div>}
                    {error && <div className="error-message">{error}</div>}

                    {proceso && (
                        <>
                            <Seccion titulo="Datos del proceso">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px' }}>
                                    <Campo label="Comprador" value={proceso.comprador_nombre} />
                                    <Campo label="Monto estimado" value={proceso.monto_estimado ? fmtCLP(proceso.monto_estimado) : null} />
                                    <Campo label="Cierre estimado" value={proceso.fecha_cierre_estimada} />
                                    <Campo label="Creado" value={fmtFechaHora(proceso.creado_en)} />
                                    <Campo label="Última actualización" value={fmtFechaHora(proceso.actualizado_en)} />
                                    <Campo label="Finalizado" value={proceso.finalizado_en ? fmtFechaHora(proceso.finalizado_en) : null} />
                                    {proceso.licitacion && <Campo label="Licitación" value={`${proceso.licitacion} · ${proceso.licitacion_estado || ''}`} span2 />}
                                    {proceso.codigo_compra_agil && <Campo label="Compra Ágil" value={`${proceso.codigo_compra_agil} · ${proceso.compra_agil_estado || ''}`} span2 />}
                                </div>
                                {proceso.observaciones && (
                                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '14px 0 0', background: '#f8fafc', borderRadius: 8, padding: '10px 14px', whiteSpace: 'pre-wrap' }}>
                                        <strong style={{ display: 'block', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Observaciones</strong>
                                        {proceso.observaciones}
                                    </p>
                                )}
                            </Seccion>

                            <Seccion titulo={`Formularios de su departamento (${proceso.n_formularios})`}>
                                {proceso.formularios_detalle.length === 0 ? (
                                    <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>—</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {proceso.formularios_detalle.map((f) => (
                                            <div
                                                key={f.id}
                                                onClick={() => onVerFsc(f.formulario_derivado)}
                                                role="button"
                                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                                            >
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: '#7c3aed', flexShrink: 0 }}>{f.id_formulario}</span>
                                                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.requerimiento}</span>
                                                <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, flexShrink: 0 }}>{fmtCLP(f.monto_estimado)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {proceso.n_formularios_otros > 0 && (
                                    <p className="gc-nota" style={{ marginTop: 10 }}>
                                        Compra conjunta: este proceso incluye además {proceso.n_formularios_otros} formulario(s) de otros departamentos, que no se muestran aquí.
                                    </p>
                                )}
                            </Seccion>

                            {proceso.ordenes_compra_detalle.length > 0 && (
                                <Seccion titulo="Órdenes de compra">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {proceso.ordenes_compra_detalle.map((oc) => {
                                            const pac = PAC_INFO[oc.estado_pac];
                                            const link = urlSegura(oc.link_mp);
                                            return (
                                                <div key={oc.id} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, padding: '9px 12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#15803d', fontSize: 12.5 }}>{oc.codigo_oc}</span>
                                                        <span style={{ fontSize: 11.5, color: '#475569' }}>
                                                            {oc.estado_oc}
                                                            {pac && <strong style={{ color: pac.color, marginLeft: 8 }}>· {pac.label}</strong>}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                                                        {oc.nombre_oc}{oc.total_bruto ? ` — ${fmtCLP(oc.total_bruto)}` : ''}
                                                    </div>
                                                    {link && (
                                                        <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb' }}>
                                                            Ver en Mercado Público ↗
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Seccion>
                            )}

                            <Seccion titulo={`Historial y observaciones (${historial.length})`}>
                                {historial.length === 0 ? (
                                    <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Sin movimientos registrados.</p>
                                ) : (
                                    <div>
                                        {[...historial].reverse().map((h, i, arr) => (
                                            <div key={h.id} style={{ display: 'flex', gap: 12 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0 }}>
                                                    <span style={{ width: 11, height: 11, borderRadius: '50%', background: ESTADO_COLOR(h.estado_nuevo), flexShrink: 0, marginTop: 3 }} />
                                                    {i < arr.length - 1 && <span style={{ width: 2, flex: 1, background: '#e2e8f0', minHeight: 20 }} />}
                                                </div>
                                                <div style={{ paddingBottom: 16, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                                        {h.estado_anterior && h.estado_anterior !== h.estado_nuevo
                                                            ? `${h.estado_anterior_display} → ${h.estado_nuevo_display}`
                                                            : h.estado_nuevo_display}
                                                    </div>
                                                    <div style={{ fontSize: 11.5, color: '#64748b' }}>
                                                        {fmtFechaHora(h.fecha)}{h.usuario_nombre ? ` · ${h.usuario_nombre}` : ''}
                                                    </div>
                                                    {h.comentario && (
                                                        <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5, margin: '5px 0 0', background: '#f8fafc', borderRadius: 6, padding: '7px 10px', whiteSpace: 'pre-wrap' }}>
                                                            {h.comentario}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Seccion>
                        </>
                    )}
                </div>

                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {tieneMp ? (
                        <button
                            onClick={() => onVerMercadoPublico(proceso)}
                            style={{ padding: '8px 18px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                            🛒 Ver detalle en Mercado Público
                        </button>
                    ) : <span />}
                    <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
