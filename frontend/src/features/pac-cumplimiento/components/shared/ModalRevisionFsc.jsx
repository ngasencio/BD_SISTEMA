import { fmtCLP } from '../../utils/format';

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

const ADJUNTOS = [
    { key: 'adj_espec_tecnicas', label: 'Espec. Técnicas' },
    { key: 'adj_cotizacion', label: 'Cotización' },
    { key: 'adj_validacion', label: 'Validación' },
    { key: 'adj_form_justificacion', label: 'Form. Justificación' },
];

export default function ModalRevisionFsc({ formulario, onCerrar }) {
    if (!formulario) return null;

    const dentro = formulario.dentro_fuera_pac === 'DENTRO';
    const sinClasificar = !formulario.sso_departamento_nombre;
    const hayAdjuntos = ADJUNTOS.some((a) => formulario[a.key]);

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={onCerrar}
        >
            <div
                style={{ background: '#fff', borderRadius: 12, width: 720, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                                {formulario.id_formulario || `Folio ${formulario.folio}`}
                            </span>
                            <span style={{
                                fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                                background: dentro ? '#dcfce7' : formulario.dentro_fuera_pac === 'FUERA' ? '#fee2e2' : '#f1f5f9',
                                color: dentro ? '#15803d' : formulario.dentro_fuera_pac === 'FUERA' ? '#b91c1c' : '#64748b',
                            }}>
                                {dentro ? '✅ Dentro PAC' : formulario.dentro_fuera_pac === 'FUERA' ? '⛔ Fuera PAC' : '⏳ Sin evaluar (sin ID de Plan)'}
                            </span>
                            {formulario.estado_compra && (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
                                    {formulario.estado_compra}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{formulario.formulario || 'Formulario Solicitud de Compra derivado'}</div>
                    </div>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <section>
                        <SeccionTitulo>Identificación</SeccionTitulo>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
                            <Campo label="Folio" value={formulario.folio} mono />
                            <Campo label="Año" value={formulario.anho} />
                            <Campo label="Fecha Solicitud" value={formulario.fecha_solicitud} />
                            <Campo label="Fecha Derivado" value={formulario.fecha_derivado} />
                            <Campo label="Monto Estimado" value={fmtCLP(formulario.monto_estimado)} />
                            <Campo label="Comprador" value={formulario.comprador} />
                            {formulario.item_presupuestario && <Campo label="Ítem Presupuestario" value={formulario.item_presupuestario} />}
                            {formulario.folio_requerimiento && <Campo label="Folio Requerimiento" value={formulario.folio_requerimiento} mono />}
                        </div>
                    </section>

                    <section>
                        <SeccionTitulo>Solicitante y clasificación organizacional</SeccionTitulo>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 20px' }}>
                            <Campo label="Unidad Requirente (texto original del panel)" value={formulario.unidad_requirente} span2 />
                            <Campo label="Usuario Requirente" value={formulario.usuario_requirente} />
                            <Campo label="Encargado" value={formulario.encargado} />
                            <Campo label="Jefe" value={formulario.jefe} />
                            <Campo label="Correo" value={formulario.correo} />
                        </div>
                        <div style={{ marginTop: 10 }}>
                            {sinClasificar ? (
                                <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                                    ⚠️ <strong>Sin Clasificar</strong> — "{formulario.unidad_requirente}" no calzó con ningún Departamento registrado.
                                    Corrige la relación en la base de datos (tabla de departamentos) para que este formulario quede
                                    correctamente asignado a su subdirección/departamento.
                                </div>
                            ) : (
                                <div style={{ fontSize: 12, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px' }}>
                                    🏛️ Departamento resuelto: <strong>{formulario.sso_departamento_nombre}</strong>
                                </div>
                            )}
                        </div>
                    </section>

                    {formulario.requerimiento && (
                        <section>
                            <SeccionTitulo>Nombre de la Compra</SeccionTitulo>
                            <p style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6, margin: 0, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid #16a34a', fontWeight: 500 }}>
                                {formulario.requerimiento}
                            </p>
                        </section>
                    )}

                    {formulario.especificaciones_tecnicas && (
                        <section>
                            <SeccionTitulo>Especificaciones Técnicas</SeccionTitulo>
                            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, background: '#f8fafc', borderRadius: 8, padding: '10px 14px', whiteSpace: 'pre-wrap' }}>
                                {formulario.especificaciones_tecnicas}
                            </p>
                        </section>
                    )}

                    <section>
                        <SeccionTitulo>Plan de Compras</SeccionTitulo>
                        {formulario.id_plan ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID Plan:</span>
                                <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#16a34a', fontWeight: 700, background: '#f0fdf4', padding: '2px 10px', borderRadius: 6 }}>{formulario.id_plan}</span>
                            </div>
                        ) : (
                            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Este formulario no declara un ID de Plan Anual de Compras.</p>
                        )}
                    </section>

                    <section>
                        <SeccionTitulo>Archivos Adjuntos</SeccionTitulo>
                        {hayAdjuntos ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                                {ADJUNTOS.map(({ key, label }) => (
                                    formulario[key] ? (
                                        <a key={key} href={formulario[key]} target="_blank" rel="noopener noreferrer"
                                           style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                                            📎 {label}
                                        </a>
                                    ) : (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, background: '#f8fafc', border: '1px dashed #e2e8f0', color: '#94a3b8', fontSize: 12 }}>
                                            — {label}
                                        </div>
                                    )
                                ))}
                            </div>
                        ) : (
                            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Sin archivos adjuntos registrados.</p>
                        )}
                    </section>
                </div>

                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
