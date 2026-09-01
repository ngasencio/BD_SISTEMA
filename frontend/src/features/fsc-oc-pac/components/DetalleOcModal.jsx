import { useState, useEffect } from 'react';
import { getOcDetalle, corregirPac } from '../api/fscOcPacApi';
import { fmtCLP, ESTADO_LABEL, CONFIANZA_LABEL, PAC_ESTADO_LABEL, PAC_ESTADO_CHIP } from '../utils/format';
import Chip from './Chip';

const Campo = ({ label, value, mono }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="dv-eyebrow">{label}</span>
        <span style={{ fontSize: 13, color: 'var(--dv-ink)', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', fontWeight: mono ? 600 : 400 }}>
            {value ?? '—'}
        </span>
    </div>
);

const SeccionTitulo = ({ children }) => (
    <div className="dv-eyebrow" style={{ color: 'var(--dv-ok)', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid var(--dv-line-2)' }}>
        {children}
    </div>
);

export default function DetalleOcModal({ codigoOc, onCerrar, onVerFsc, onCorregido }) {
    const [oc, setOc] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [corrigiendoId, setCorrigiendoId] = useState(null);

    const cargar = () => {
        if (!codigoOc) return;
        setLoading(true);
        setError(null);
        getOcDetalle(codigoOc)
            .then(({ data }) => setOc(data))
            .catch((err) => setError(err.response?.data?.error || 'Error al cargar la OC.'))
            .finally(() => setLoading(false));
    };

    useEffect(cargar, [codigoOc]);

    if (!codigoOc) return null;

    const handleCorregir = async (formularioDerivadoId) => {
        setCorrigiendoId(formularioDerivadoId);
        try {
            await corregirPac(codigoOc, formularioDerivadoId, '');
            cargar();
            onCorregido?.();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al corregir el PAC.');
        } finally {
            setCorrigiendoId(null);
        }
    };

    return (
        <div className="dv-overlay is-open" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div className="dv-modal">
                <header className="dv-modal__header">
                    <div>
                        <h2 style={{ fontFamily: 'ui-monospace, monospace' }}>{codigoOc}</h2>
                        <div className="dv-sub">{oc?.nombre_oc || 'Orden de Compra'}</div>
                    </div>
                    <div className="dv-modal__actions">
                        <button className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={onCerrar} aria-label="Cerrar">✕</button>
                    </div>
                </header>

                <div className="dv-modal__body">
                    {loading && <div className="dv-footnote" style={{ textAlign: 'center', padding: 30 }}>Cargando…</div>}
                    {error && <div className="alert alert-error">{error}</div>}

                    {oc && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <section>
                                <SeccionTitulo>Datos Generales</SeccionTitulo>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 20px' }}>
                                    <Campo label="Estado" value={oc.estado_oc} />
                                    <Campo label="Tipo OC" value={oc.descripcion_tipo_oc || oc.tipo_oc} />
                                    <Campo label="Fecha Envío" value={oc.fecha_envio} />
                                    <Campo label="Fecha Creación" value={oc.fecha_creacion} />
                                    <Campo label="Unidad Compradora" value={oc.unidad_compradora} />
                                    <Campo label="Proveedor" value={oc.proveedor} />
                                    <Campo label="Total Neto" value={fmtCLP(oc.total_neto)} />
                                    <Campo label="Total Bruto" value={fmtCLP(oc.total_bruto)} />
                                    {oc.codigo_licitacion && <Campo label="Código Licitación" value={oc.codigo_licitacion} mono />}
                                    {oc.codigo_compra_agil && <Campo label="Código Compra Ágil" value={oc.codigo_compra_agil} mono />}
                                </div>
                            </section>

                            <section>
                                <SeccionTitulo>Estado PAC</SeccionTitulo>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                        <Campo label="Enlace PAC (sistema)" value={oc.enlace_pac} />
                                        <Campo label="ID Proyecto (sistema)" value={oc.id_proyecto} mono />
                                        {oc.id_proyecto_override && <Campo label="ID Proyecto (corregido a mano)" value={oc.id_proyecto_override} mono />}
                                    </div>

                                    {oc.enlaces_fsc?.length === 0 && (
                                        <p className="dv-footnote">Esta OC no tiene ningún FSC enlazado todavía.</p>
                                    )}
                                    {oc.enlaces_fsc?.map((e) => (
                                        <div key={e.link_id} style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                            border: '1px solid var(--dv-line)', borderRadius: 'var(--dv-r-lg)',
                                            background: e.estado_pac === 'PAC_OK' ? 'var(--dv-ok-bg)' : 'var(--dv-warn-bg)',
                                        }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dv-ink)' }}>{e.id_formulario} <span style={{ fontWeight: 400, color: 'var(--dv-ink-3)' }}>· {CONFIANZA_LABEL[e.confianza]} / {ESTADO_LABEL[e.estado] || e.estado}</span></div>
                                                <div className="dv-footnote">
                                                    PAC que declara el FSC: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{e.id_plan_fsc || '—'}</span>
                                                    {e.nombre_pac_fsc && <span> — <strong style={{ color: 'var(--dv-ink-2)' }}>{e.nombre_pac_fsc}</strong></span>}
                                                </div>
                                            </div>
                                            {e.estado_pac && <Chip variant={PAC_ESTADO_CHIP[e.estado_pac]}>{PAC_ESTADO_LABEL[e.estado_pac]}</Chip>}
                                            <button className="dv-btn dv-btn--sm" onClick={() => onVerFsc?.(e.formulario_derivado_id)}>Ver FSC</button>
                                            {e.estado === 'CONFIRMADO' && e.estado_pac !== 'PAC_OK' && e.id_plan_fsc && (
                                                <button
                                                    className="dv-btn dv-btn--primary dv-btn--sm"
                                                    disabled={corrigiendoId === e.formulario_derivado_id}
                                                    onClick={() => handleCorregir(e.formulario_derivado_id)}
                                                >
                                                    {corrigiendoId === e.formulario_derivado_id ? '⏳' : '🔗 Enlazar al PAC del FSC'}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section>
                                <SeccionTitulo>Líneas de Producto</SeccionTitulo>
                                {oc.detalle_productos?.length ? (
                                    <div className="dv-table-scroll">
                                        <table className="dv-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left' }}>Producto</th>
                                                    <th>Cantidad</th>
                                                    <th>Precio Neto</th>
                                                    <th>Total Línea</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {oc.detalle_productos.map((p, i) => (
                                                    <tr key={i}>
                                                        <td style={{ textAlign: 'left', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.Producto}</td>
                                                        <td>{p.Cantidad} {p.Unidad}</td>
                                                        <td>{p.PrecioNeto != null ? fmtCLP(p.PrecioNeto) : '—'}</td>
                                                        <td>{p.TotalLinea != null ? fmtCLP(p.TotalLinea) : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="dv-footnote">Sin líneas de producto registradas.</p>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
