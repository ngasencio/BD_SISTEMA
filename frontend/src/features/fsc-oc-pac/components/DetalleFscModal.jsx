import { useState, useEffect } from 'react';
import { getFscDetalle } from '../api/fscOcPacApi';
import { fmtCLP, ESTADO_LABEL, CONFIANZA_LABEL, PAC_ESTADO_LABEL, PAC_ESTADO_CHIP } from '../utils/format';
import Chip from './Chip';

const Campo = ({ label, value, mono, span2 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...(span2 ? { gridColumn: 'span 2' } : {}) }}>
        <span className="dv-eyebrow">{label}</span>
        <span style={{ fontSize: 13, color: 'var(--dv-ink)', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', fontWeight: mono ? 600 : 400 }}>
            {value ?? '—'}
        </span>
    </div>
);

const SeccionTitulo = ({ children }) => (
    <div className="dv-eyebrow" style={{ color: 'var(--dv-primary)', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid var(--dv-line-2)' }}>
        {children}
    </div>
);

const ADJUNTOS = [
    { key: 'adj_espec_tecnicas', label: '📎 Espec. Técnicas' },
    { key: 'adj_cotizacion', label: '📎 Cotización' },
    { key: 'adj_validacion', label: '📎 Validación' },
    { key: 'adj_form_justificacion', label: '📎 Form. Justificación' },
];

export default function DetalleFscModal({ fscId, onCerrar, onVerOc }) {
    const [f, setF] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!fscId) return;
        setLoading(true);
        setError(null);
        getFscDetalle(fscId)
            .then(({ data }) => setF(data))
            .catch((err) => setError(err.response?.data?.error || 'Error al cargar el formulario.'))
            .finally(() => setLoading(false));
    }, [fscId]);

    if (!fscId) return null;

    const hayAdjuntos = f && ADJUNTOS.some((a) => f[a.key]);

    return (
        <div className="dv-overlay is-open" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div className="dv-modal">
                <header className="dv-modal__header">
                    <div>
                        <h2 style={{ fontFamily: 'ui-monospace, monospace' }}>{f?.id_formulario || (fscId ? `FSC #${fscId}` : '')}</h2>
                        <div className="dv-sub">{f?.formulario || 'Formulario de Solicitud de Compra'}{f?.estado ? ` · ${f.estado}` : ''}</div>
                    </div>
                    <div className="dv-modal__actions">
                        <button className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={onCerrar} aria-label="Cerrar">✕</button>
                    </div>
                </header>

                <div className="dv-modal__body">
                    {loading && <div className="dv-footnote" style={{ textAlign: 'center', padding: 30 }}>Cargando…</div>}
                    {error && <div className="alert alert-error">{error}</div>}

                    {f && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <section>
                                <SeccionTitulo>Identificación</SeccionTitulo>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px' }}>
                                    <Campo label="Folio" value={f.folio} mono />
                                    <Campo label="Año" value={f.anho} />
                                    <Campo label="Estado Compra" value={f.estado_compra} />
                                    <Campo label="Fecha Solicitud" value={f.fecha_solicitud} />
                                    <Campo label="Fecha Entrega" value={f.fecha_entrega} />
                                    <Campo label="Fecha Derivado" value={f.fecha_derivado} />
                                    <Campo label="Monto Estimado" value={fmtCLP(f.monto_estimado)} />
                                    {f.item_presupuestario && <Campo label="Ítem Presupuestario" value={f.item_presupuestario} />}
                                    {f.folio_requerimiento && <Campo label="Folio Requerimiento" value={f.folio_requerimiento} mono />}
                                </div>
                            </section>

                            <section>
                                <SeccionTitulo>Solicitante</SeccionTitulo>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 20px' }}>
                                    <Campo label="Unidad Requirente" value={f.unidad_requirente} />
                                    <Campo label="Usuario Requirente" value={f.usuario_requirente} />
                                    <Campo label="Encargado" value={f.encargado} />
                                    <Campo label="Jefe" value={f.jefe} />
                                    <Campo label="Anexo" value={f.anexo} />
                                    <Campo label="Correo" value={f.correo} />
                                    <Campo label="Comprador" value={f.comprador} />
                                    <Campo label="Departamento" value={f.departamento || 'Sin Clasificar'} />
                                </div>
                            </section>

                            {f.requerimiento && (
                                <section>
                                    <SeccionTitulo>Nombre de la Compra</SeccionTitulo>
                                    <p style={{ fontSize: 13, color: 'var(--dv-ink)', lineHeight: 1.6, margin: 0, background: 'var(--dv-ok-bg)', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid var(--dv-ok)', fontWeight: 500 }}>
                                        {f.requerimiento}
                                    </p>
                                </section>
                            )}

                            {f.objetivo_compra && (
                                <section>
                                    <SeccionTitulo>Objetivo de Compra</SeccionTitulo>
                                    <p style={{ fontSize: 13, color: 'var(--dv-ink-2)', lineHeight: 1.6, margin: 0, background: 'var(--dv-surface-alt)', borderRadius: 8, padding: '10px 14px' }}>
                                        {f.objetivo_compra}
                                    </p>
                                </section>
                            )}

                            {f.especificaciones_tecnicas && (
                                <section>
                                    <SeccionTitulo>Especificaciones Técnicas</SeccionTitulo>
                                    <p style={{ fontSize: 13, color: 'var(--dv-ink-2)', lineHeight: 1.6, margin: 0, background: 'var(--dv-surface-alt)', borderRadius: 8, padding: '10px 14px', whiteSpace: 'pre-wrap' }}>
                                        {f.especificaciones_tecnicas}
                                    </p>
                                </section>
                            )}

                            <section>
                                <SeccionTitulo>Plan de Compras</SeccionTitulo>
                                {f.id_plan ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span className="dv-eyebrow">ID Plan:</span>
                                        <span style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', color: 'var(--dv-ok)', fontWeight: 700, background: 'var(--dv-ok-bg)', padding: '2px 10px', borderRadius: 6 }}>{f.id_plan}</span>
                                        {f.nombre_plan && <span style={{ fontSize: 13, color: 'var(--dv-ink)' }}>{f.nombre_plan}</span>}
                                    </div>
                                ) : (
                                    <div>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dv-warn)', marginBottom: 6, display: 'block' }}>Sin ID de Plan — Justificación:</span>
                                        <p style={{ fontSize: 13, color: 'var(--dv-ink-2)', lineHeight: 1.6, margin: 0, background: 'var(--dv-warn-bg)', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid var(--dv-warn)' }}>
                                            {f.justificacion || '—'}
                                        </p>
                                    </div>
                                )}
                            </section>

                            <section>
                                <SeccionTitulo>Archivos Adjuntos</SeccionTitulo>
                                {hayAdjuntos ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                                        {ADJUNTOS.map(({ key, label }) => (
                                            f[key] ? (
                                                <a key={key} href={f[key]} target="_blank" rel="noopener noreferrer" className="dv-tag" style={{ padding: '9px 14px', textAlign: 'left', background: '#F0F9FF', color: 'var(--dv-primary)' }}>
                                                    {label}
                                                </a>
                                            ) : (
                                                <div key={key} className="dv-tag" style={{ padding: '9px 14px', textAlign: 'left', background: 'transparent', border: '1px dashed var(--dv-line)', color: 'var(--dv-ink-4)' }}>
                                                    {label.replace('📎', '—')}
                                                </div>
                                            )
                                        ))}
                                    </div>
                                ) : (
                                    <p className="dv-footnote">Este formulario no tiene archivos adjuntos registrados.</p>
                                )}
                            </section>

                            <section>
                                <SeccionTitulo>Carro de Productos</SeccionTitulo>
                                {f.productos?.length ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {f.productos.map((p, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '6px 10px', background: 'var(--dv-surface-alt)', borderRadius: 6 }}>
                                                <span style={{ color: 'var(--dv-ink)' }}>{p.producto || p.descripcion || '—'}</span>
                                                <span className="dv-num" style={{ color: 'var(--dv-ink-3)', whiteSpace: 'nowrap' }}>{p.cantidad ?? ''} {p.monto != null ? `· ${fmtCLP(p.monto)}` : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="dv-footnote">Sin productos registrados.</p>
                                )}
                            </section>

                            <section>
                                <SeccionTitulo>
                                    Órdenes de Compra Enlazadas
                                    {f.enlaces_oc?.length > 0 && ` (${f.enlaces_oc.length})`}
                                </SeccionTitulo>
                                {f.enlaces_oc?.length > 1 && (
                                    <p className="dv-footnote" style={{ marginTop: -6, marginBottom: 10 }}>
                                        Este FSC tiene más de una OC enlazada — un mismo formulario puede derivar en varios procesos de compra.
                                    </p>
                                )}
                                {f.enlaces_oc?.length ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {f.enlaces_oc.map((e) => (
                                            <div key={e.link_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--dv-line)', borderRadius: 'var(--dv-r-lg)' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dv-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.codigo_oc}</div>
                                                    <div className="dv-footnote" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nombre_oc}</div>
                                                </div>
                                                <span style={{ fontSize: 10, color: 'var(--dv-ink-3)' }}>{CONFIANZA_LABEL[e.confianza]} · {ESTADO_LABEL[e.estado] || e.estado}</span>
                                                {e.estado_pac && <Chip variant={PAC_ESTADO_CHIP[e.estado_pac]}>{PAC_ESTADO_LABEL[e.estado_pac]}</Chip>}
                                                <button className="dv-btn dv-btn--sm" onClick={() => onVerOc?.(e.codigo_oc)}>Ver OC</button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="dv-footnote">Sin ninguna OC enlazada.</p>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
