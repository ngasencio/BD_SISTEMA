import { useEffect, useState } from 'react';
import { getFichaPacDetalle } from '../../../api/pacCumplimientoApi';
import { fmtCLP } from '../../../utils/format';

function SeccionTitulo({ children }) {
    return (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #e0f2fe', paddingBottom: 5, marginBottom: 10 }}>
            {children}
        </div>
    );
}

function Campo({ label, value, mono, span2 }) {
    if (value == null || value === '') return null;
    return (
        <div style={{ gridColumn: span2 ? 'span 2' : undefined, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
            <span style={{ fontSize: 13, color: '#1e293b', fontFamily: mono ? 'monospace' : undefined, fontWeight: mono ? 700 : 400 }}>{value}</span>
        </div>
    );
}

const ESTADO_BADGE = {
    EJECUTADO: { label: '✅ Ejecutado', bg: '#dcfce7', color: '#15803d' },
    PENDIENTE: { label: '⏳ Pendiente', bg: '#fffbeb', color: '#b45309' },
    ATRASADO: { label: '⏰ Atrasado', bg: '#fee2e2', color: '#b91c1c' },
    SIN_FECHA: { label: '❓ Sin fecha', bg: '#f1f5f9', color: '#64748b' },
};

export default function ModalFichaPac({ idProyecto, onCerrar }) {
    const [ficha, setFicha] = useState(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        if (!idProyecto) { setFicha(null); return; }
        setCargando(true);
        getFichaPacDetalle(idProyecto)
            .then(({ data }) => setFicha(data))
            .catch(() => setFicha(null))
            .finally(() => setCargando(false));
    }, [idProyecto]);

    if (!idProyecto) return null;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={onCerrar}
        >
            <div
                style={{ background: '#fff', borderRadius: 12, width: 780, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>{idProyecto}</span>
                            {ficha?.estado_ejecucion && (
                                <span style={{
                                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                                    background: ESTADO_BADGE[ficha.estado_ejecucion]?.bg, color: ESTADO_BADGE[ficha.estado_ejecucion]?.color,
                                }}>
                                    {ESTADO_BADGE[ficha.estado_ejecucion]?.label ?? ficha.estado_ejecucion}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', maxWidth: 600 }}>{ficha?.nombre_proyecto || 'Ficha del Plan Anual de Compras'}</div>
                    </div>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', flexShrink: 0 }}>✕</button>
                </div>

                {cargando ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando ficha…</div>
                ) : !ficha ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No se encontró la ficha.</div>
                ) : (
                    <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <section>
                            <SeccionTitulo>Identificación</SeccionTitulo>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 20px' }}>
                                <Campo label="Departamento (texto original)" value={ficha.depto_texto} span2 />
                                <Campo label="Subdirección" value={ficha.subdireccion_nombre} />
                                <Campo label="Unidad" value={ficha.unidad} />
                                <Campo label="Responsable" value={ficha.nombre_responsable} />
                                <Campo label="Cargo" value={ficha.cargo_responsable} />
                                <Campo label="Tipo de Proyecto" value={ficha.tipo_proyecto} />
                                <Campo label="Año PAC" value={ficha.pac} mono />
                            </div>
                            {!ficha.depto_nombre && (
                                <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                                    ⚠️ El departamento "{ficha.depto_texto}" no calzó con ningún Departamento registrado — revisar la relación en la base de datos.
                                </div>
                            )}
                        </section>

                        <section>
                            <SeccionTitulo>Ítems del Plan ({ficha.items.length})</SeccionTitulo>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Ítem', 'Cantidad', 'Monto Unitario', 'Monto Total', 'Fecha Compra'].map((h) => (
                                                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ficha.items.map((it, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '6px 8px', maxWidth: 220 }}>{it.nombre_item || '—'}</td>
                                                <td style={{ padding: '6px 8px' }}>{it.cantidad_items || '—'}</td>
                                                <td style={{ padding: '6px 8px' }}>{fmtCLP(it.monto_unitario_item)}</td>
                                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{fmtCLP(it.monto_total_item)}</td>
                                                <td style={{ padding: '6px 8px', color: '#64748b' }}>{(it.fecha_inicio_compra || '').slice(0, 10) || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section>
                            <SeccionTitulo>Formularios de Compra vinculados ({ficha.formularios.length})</SeccionTitulo>
                            {ficha.formularios.length === 0 ? (
                                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Ningún formulario ha declarado este ID de Plan todavía.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {ficha.formularios.map((f) => (
                                        <div key={f.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0369a1' }}>{f.id_formulario}</span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                                                    background: f.dentro_fuera_pac === 'DENTRO' ? '#dcfce7' : '#fee2e2',
                                                    color: f.dentro_fuera_pac === 'DENTRO' ? '#15803d' : '#b91c1c',
                                                }}>
                                                    {f.dentro_fuera_pac === 'DENTRO' ? 'Dentro PAC' : 'Fuera PAC'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                                <span>Derivado: {f.fecha_derivado || '—'}</span>
                                                <span>Estado: {f.estado_compra || '—'}</span>
                                                <span>Comprador: {f.comprador || '—'}</span>
                                                <span>Monto: {fmtCLP(f.monto_estimado)}</span>
                                            </div>
                                            {f.productos.length > 0 && (
                                                <div style={{ marginTop: 8, fontSize: 11, color: '#475569' }}>
                                                    📦 {f.productos.length} producto(s): {f.productos.slice(0, 3).map((p) => p.producto).filter(Boolean).join(', ')}
                                                    {f.productos.length > 3 ? '…' : ''}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section>
                            <SeccionTitulo>Órdenes de Compra enlazadas ({ficha.ordenes_compra.length})</SeccionTitulo>
                            {ficha.ordenes_compra.length === 0 ? (
                                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Sin OC enlazadas en el maestro PAC-OC.</p>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                {['Código OC', 'Nombre', 'Estado', 'Monto Bruto', 'Fecha Envío', ''].map((h) => (
                                                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ficha.ordenes_compra.map((oc) => (
                                                <tr key={oc.codigo_oc} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{oc.codigo_oc}</td>
                                                    <td style={{ padding: '6px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={oc.nombre_oc}>{oc.nombre_oc}</td>
                                                    <td style={{ padding: '6px 8px' }}>{oc.estado_oc || '—'}</td>
                                                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{fmtCLP(oc.total_bruto)}</td>
                                                    <td style={{ padding: '6px 8px', color: '#64748b' }}>{(oc.fecha_envio || '').slice(0, 10) || '—'}</td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        {oc.link_mp && <a href={oc.link_mp} target="_blank" rel="noopener noreferrer" style={{ color: '#0369a1', fontSize: 11, fontWeight: 600 }}>Ver en MP ↗</a>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                )}

                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
