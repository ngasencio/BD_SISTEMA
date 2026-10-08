// Ficha completa de un FSC (botón "Ver" de Solicitudes y de Derivados).
// Un solo componente para ambas tablas: el backend (`formularios/ficha/`) resuelve la fila
// gemela y devuelve todo junto — datos, carro, bandejas, proceso de compra y OC enlazadas.
import { useCallback, useEffect, useRef, useState } from 'react';
import './formularios.css';
import { getFormularioFicha } from '../../api/formulariosApi';
import DetalleOcModal from '../../../fsc-oc-pac/components/DetalleOcModal';
import {
    fmtCLP, fmtFecha, diasDesde, infoEstado, ocsDeLaFicha, resumenOcs, bandejasConDias,
    CONFIANZA_ENLACE, ESTADO_ENLACE, ESTADO_PAC_ENLACE,
} from './shared';
import { imprimirFicha } from './imprimirFicha';
import { Chip, EstadoChip, DiasChip } from './ui';

const SECCIONES = [
    ['general', 'Datos generales'], ['solicitante', 'Solicitante'], ['descripcion', 'Descripción'],
    ['plan', 'Plan y financiamiento'], ['adjuntos', 'Adjuntos'], ['productos', 'Productos'],
    ['gestion', 'Gestión de compra'], ['oc', 'Órdenes de compra'], ['trazabilidad', 'Trazabilidad'],
];

const ADJUNTOS = [
    ['adj_espec_tecnicas', 'Especificaciones técnicas'], ['adj_cotizacion', 'Cotización'],
    ['adj_validacion', 'Validación'], ['adj_form_justificacion', 'Formulario de justificación'],
];

function Campo({ label, value, mono, ancho }) {
    const vacio = value === null || value === undefined || value === '';
    return (
        <div className={`frm-field${ancho ? ' frm-field--wide' : ''}`}>
            <span className="frm-field__label">{label}</span>
            <span className={`frm-field__value${vacio ? ' is-empty' : ''}${mono ? ' is-mono' : ''}`}>{vacio ? '—' : value}</span>
        </div>
    );
}

const Seccion = ({ id, titulo, cuenta, refs, children }) => (
    <section className="frm-sec" ref={(el) => { refs.current[id] = el; }}>
        <h3 className="frm-sec__title">{titulo}{cuenta !== undefined && <span className="frm-sec__count">{cuenta}</span>}</h3>
        {children}
    </section>
);

function varianteEstadoOc(estado) {
    const e = (estado || '').toLowerCase();
    if (/cancel|rechaz/.test(e)) return 'none';
    if (/acept/.test(e)) return 'ok';
    if (/envi/.test(e)) return 'watch';
    return 'draft';
}

function TablaOc({ filas, onVerOc }) {
    return (
        <div className="frm-table-wrap">
            <table className="dv-table frm-table frm-table--oc">
                <thead>
                    <tr>
                        <th>Código OC</th><th>Nombre</th><th>Proveedor</th><th>Estado OC</th>
                        <th className="is-num">Monto bruto</th><th>Enlace</th><th>PAC</th><th className="is-center"><span className="frm-sr">Detalle</span></th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map((r) => {
                        const oc = r.oc;
                        const enlace = r.via === 'proceso'
                            ? { label: 'Vía proceso', variante: 'draft' }
                            : ESTADO_ENLACE[r.estadoEnlace] || { label: r.estadoEnlace, variante: 'none' };
                        const pac = r.estadoPac ? ESTADO_PAC_ENLACE[r.estadoPac] : null;
                        return (
                            <tr key={r.codigo} className={r.descartada ? 'is-muted' : ''}>
                                <td><span className="frm-id">{r.codigo}</span></td>
                                <td>
                                    {oc ? <div className="frm-trunc" title={oc.nombre_oc}>{oc.nombre_oc || '—'}</div> : <span className="frm-muted">OC aún no sincronizada</span>}
                                    {r.descartada && r.motivoRechazo && <span className="frm-sub">Descartada: {r.motivoRechazo}</span>}
                                    {r.via === 'proceso' && r.proceso && <span className="frm-sub">Proceso: {r.proceso}</span>}
                                </td>
                                <td><div className="frm-trunc frm-trunc--sm" title={oc?.proveedor}>{oc?.proveedor || '—'}</div></td>
                                <td className="is-nowrap">
                                    {oc?.estado_oc ? <Chip variante={varianteEstadoOc(oc.estado_oc)}>{oc.estado_oc}</Chip> : <span className="frm-muted">—</span>}
                                    {oc?.fecha_envio && <span className="frm-sub">Enviada {fmtFecha(oc.fecha_envio)}</span>}
                                </td>
                                <td className="is-num is-strong is-nowrap">{oc?.total_bruto != null ? fmtCLP(oc.total_bruto) : '—'}</td>
                                <td className="is-nowrap">
                                    <Chip variante={enlace.variante}>{enlace.label}</Chip>
                                    {r.via === 'enlace' && <span className="frm-sub">Confianza {CONFIANZA_ENLACE[r.confianza] || r.confianza}</span>}
                                </td>
                                <td className="is-nowrap">{pac ? <Chip variante={pac.variante}>{pac.label}</Chip> : <span className="frm-muted">—</span>}</td>
                                <td className="is-center">
                                    <button type="button" className="dv-btn frm-btn-ver" onClick={() => onVerOc(r.codigo)}>Ver OC</button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/**
 * @param origen 'solicitud' (id de FormularioFSC) | 'derivado' (id de FormularioFSCDerivado)
 * @param id     id del registro; null/undefined = modal cerrado
 */
export default function FichaFormularioModal({ origen, id, onCerrar }) {
    const [destino, setDestino] = useState({ origen, id });
    const [f, setF] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [ocAbierta, setOcAbierta] = useState(null);
    const refs = useRef({});
    const cuerpoRef = useRef(null);

    useEffect(() => { setDestino({ origen, id }); }, [origen, id]);

    const cargar = useCallback(() => {
        if (!destino.id) return undefined;
        let activo = true;
        setCargando(true);
        setError(null);
        getFormularioFicha(destino.origen, destino.id)
            .then(({ data }) => { if (activo) setF(data); })
            .catch((err) => { if (activo) { setF(null); setError(err.response?.data?.error || 'No fue posible cargar el formulario.'); } })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [destino]);

    useEffect(() => cargar(), [cargar]);

    // Esc cierra primero el detalle de OC (si está encima) y luego la ficha.
    useEffect(() => {
        if (!id) return undefined;
        const alTeclear = (e) => {
            if (e.key !== 'Escape') return;
            if (ocAbierta) setOcAbierta(null); else onCerrar();
        };
        window.addEventListener('keydown', alTeclear);
        return () => window.removeEventListener('keydown', alTeclear);
    }, [id, ocAbierta, onCerrar]);

    if (!id) return null;

    const irA = (clave) => refs.current[clave]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const ocs = f ? ocsDeLaFicha(f) : [];
    const cuentaOc = resumenOcs(ocs);
    const est = f ? infoEstado(f.estado) : null;
    const totalCarro = (f?.productos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const dias = f ? diasDesde(f.fecha_solicitud) : null;

    return (
        <>
            <div className="dv-overlay is-open" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
                <div className="dv-modal frm-ficha" role="dialog" aria-modal="true" aria-label="Ficha del formulario">
                    <header className="dv-modal__header">
                        <div>
                            <div className="dv-eyebrow frm-ficha__eyebrow">Formulario de Solicitud de Compra</div>
                            <div className="frm-ficha__idrow">
                                <h2>{f?.id_formulario || (f ? `Folio ${f.folio}` : 'Cargando…')}</h2>
                                {f && (
                                    <>
                                        <span className="dv-chip frm-ficha__chip-on-dark" title={est.persona ? `${est.nombre} (${est.persona})` : est.nombre}>
                                            <span className="dv-chip__dot" style={{ color: est.color }} />{f.estado || '—'} · {est.nombre}
                                        </span>
                                        {f.destino_actual && <span className="dv-chip frm-ficha__chip-on-dark" title="Persona que tiene el formulario en su bandeja">Bandeja de {f.destino_actual}</span>}
                                        {f.dentro_fuera_pac && <span className="dv-chip frm-ficha__chip-on-dark">{f.dentro_fuera_pac === 'DENTRO' ? 'Dentro del PAC' : 'Fuera del PAC'}</span>}
                                    </>
                                )}
                            </div>
                            {f && <div className="dv-sub">{f.formulario || 'Formulario de Solicitud de Compra'} · {f.unidad_requirente || 'Sin unidad'}</div>}
                        </div>
                        <div className="dv-modal__actions">
                            {f && (
                                <button type="button" className="dv-btn dv-btn--on-dark"
                                        onClick={() => { if (!imprimirFicha(f)) alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.'); }}>
                                    Imprimir ficha
                                </button>
                            )}
                            <button type="button" className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={onCerrar} aria-label="Cerrar">✕</button>
                        </div>
                    </header>

                    <div className="dv-modal__body" ref={cuerpoRef}>
                        {cargando && !f && <div className="frm-ficha__loading">Cargando ficha…</div>}
                        {error && <div className="frm-note frm-state--error">{error}</div>}

                        {f && (
                            <>
                                <div className="frm-ficha__strip">
                                    <div className="frm-stat">
                                        <div className="frm-stat__label">Monto estimado</div>
                                        <div className="frm-stat__value">{fmtCLP(f.monto_estimado)}</div>
                                        <div className="frm-stat__hint">{[f.moneda, f.tipo_monto].filter(Boolean).join(' · ') || 'Solicitado por la unidad'}</div>
                                    </div>
                                    <div className="frm-stat">
                                        <div className="frm-stat__label">Bandeja actual</div>
                                        <div className="frm-stat__value"><EstadoChip codigo={f.estado} /></div>
                                        <div className="frm-stat__hint">{est.nombre}</div>
                                    </div>
                                    <div className="frm-stat">
                                        <div className="frm-stat__label">Desde la solicitud</div>
                                        <div className="frm-stat__value"><DiasChip dias={dias} /></div>
                                        <div className="frm-stat__hint">Solicitado el {fmtFecha(f.fecha_solicitud)}</div>
                                    </div>
                                    <div className="frm-stat">
                                        <div className="frm-stat__label">Comprador</div>
                                        <div className="frm-stat__value" style={{ fontSize: 'var(--dv-fs-md)' }}>{f.comprador || '—'}</div>
                                        <div className="frm-stat__hint">{f.es_derivado ? (f.estado_compra || 'Derivado, sin estado de compra') : 'Aún no derivado a comprador'}</div>
                                    </div>
                                    <div className="frm-stat">
                                        <div className="frm-stat__label">Órdenes de compra</div>
                                        <div className="frm-stat__value">{cuentaOc.confirmadas}</div>
                                        <div className="frm-stat__hint">
                                            {cuentaOc.sugeridas > 0
                                                ? `${cuentaOc.confirmadas === 1 ? 'Confirmada' : 'Confirmadas'} · ${cuentaOc.sugeridas} sugerida(s) por revisar`
                                                : `${cuentaOc.confirmadas === 1 ? 'Enlazada' : 'Enlazadas'} al formulario`}
                                        </div>
                                    </div>
                                </div>

                                <nav className="frm-ficha__nav" aria-label="Secciones de la ficha">
                                    {SECCIONES.map(([clave, titulo]) => <button type="button" key={clave} onClick={() => irA(clave)}>{titulo}</button>)}
                                </nav>

                                <Seccion id="general" titulo="Datos generales" refs={refs}>
                                    <div className="frm-fields frm-fields--3">
                                        <Campo label="Folio" value={f.folio} mono />
                                        <Campo label="Año" value={f.anho} />
                                        <Campo label="Tipo de formulario" value={f.formulario} />
                                        <Campo label="Fecha de solicitud" value={fmtFecha(f.fecha_solicitud)} />
                                        <Campo label="Fecha de entrega" value={fmtFecha(f.fecha_entrega)} />
                                        <Campo label="Fecha de derivación" value={f.fecha_derivado ? fmtFecha(f.fecha_derivado) : null} />
                                        <Campo label="Monto estimado" value={fmtCLP(f.monto_estimado)} />
                                        <Campo label="Moneda · tipo de monto" value={[f.moneda, f.tipo_monto].filter(Boolean).join(' · ')} />
                                        <Campo label="Cotización" value={f.cotizacion} />
                                        <Campo label="Ítem presupuestario" value={f.item_presupuestario} />
                                        <Campo label="Folio de requerimiento" value={f.folio_requerimiento} mono />
                                        <Campo label="En la bandeja de" value={f.destino_actual} />
                                    </div>
                                </Seccion>

                                <Seccion id="solicitante" titulo="Solicitante" refs={refs}>
                                    <div className="frm-fields frm-fields--2">
                                        <Campo label="Unidad requirente" value={f.unidad_requirente} />
                                        <Campo label="Subdirección / establecimiento" value={f.subdireccion || 'Sin clasificar'} />
                                        <Campo label="Departamento (organigrama)" value={f.departamento || 'Sin clasificar'} />
                                        <Campo label="Usuario requirente" value={f.usuario_requirente} />
                                        <Campo label="Encargado" value={f.encargado} />
                                        <Campo label="Jefe" value={f.jefe} />
                                        <Campo label="Anexo" value={f.anexo} />
                                        <Campo label="Correo" value={f.correo} />
                                    </div>
                                </Seccion>

                                <Seccion id="descripcion" titulo="Descripción de la compra" refs={refs}>
                                    {f.requerimiento && <p className="frm-text frm-text--key">{f.requerimiento}</p>}
                                    {f.objetivo_compra && (<><div className="frm-subtitle">Objetivo de la compra</div><p className="frm-text">{f.objetivo_compra}</p></>)}
                                    {f.especificaciones_tecnicas && (<><div className="frm-subtitle">Especificaciones técnicas</div><p className="frm-text">{f.especificaciones_tecnicas}</p></>)}
                                    {!f.requerimiento && !f.objetivo_compra && !f.especificaciones_tecnicas && <div className="frm-note">Sin descripción registrada.</div>}
                                </Seccion>

                                <Seccion id="plan" titulo="Plan de compras y financiamiento" refs={refs}>
                                    <div className="frm-fields frm-fields--2">
                                        <Campo label="ID del plan de compras" value={f.id_plan} mono />
                                        <Campo label="Proyecto PAC" value={f.nombre_plan} />
                                        <Campo label="Plan anual (declarado)" value={f.plan_anual} />
                                        <Campo label="Ubicación en el PAC" value={f.dentro_fuera_pac ? (f.dentro_fuera_pac === 'DENTRO' ? 'Dentro del PAC' : 'Fuera del PAC') : null} />
                                        <Campo label="Fuente de financiamiento" value={f.fuente_financiamiento} />
                                        <Campo label="Validación técnica" value={f.validacion_tecnica} />
                                        <Campo label="Unidad validadora" value={f.unidad_validadora} />
                                    </div>
                                    {f.justificacion_no_validacion && (<><div className="frm-subtitle">Justificación de no validación</div><p className="frm-text">{f.justificacion_no_validacion}</p></>)}
                                    {!f.id_plan && (<><div className="frm-subtitle">Sin ID de plan — justificación</div><p className="frm-text frm-text--warn">{f.justificacion || '—'}</p></>)}
                                </Seccion>

                                <Seccion id="adjuntos" titulo="Archivos adjuntos" refs={refs}>
                                    <div className="frm-attach">
                                        {ADJUNTOS.map(([clave, etiqueta]) => (f[clave]
                                            ? <a key={clave} className="frm-attach__item" href={f[clave]} target="_blank" rel="noopener noreferrer">📎 {etiqueta}</a>
                                            : <span key={clave} className="frm-attach__item">— {etiqueta}</span>))}
                                    </div>
                                </Seccion>

                                <Seccion id="productos" titulo="Carro de productos" cuenta={f.productos.length ? `${f.productos.length} línea(s)` : undefined} refs={refs}>
                                    {f.productos.length === 0 ? <div className="frm-note">Este formulario no registra productos en el carro.</div> : (
                                        <>
                                            <div className="frm-table-wrap">
                                                <table className="dv-table frm-table">
                                                    <thead><tr><th>Categoría</th><th>Producto</th><th>Descripción</th><th className="is-num">Cant.</th><th className="is-num">Monto</th><th>Ítem presupuestario</th></tr></thead>
                                                    <tbody>
                                                        {f.productos.map((p) => (
                                                            <tr key={p.id}>
                                                                <td>{p.categoria || '—'}</td>
                                                                <td className="is-strong">{p.producto || '—'}</td>
                                                                <td><div className="frm-trunc" title={p.descripcion}>{p.descripcion || '—'}</div></td>
                                                                <td className="is-num">{p.cantidad ?? '—'}</td>
                                                                <td className="is-num">{p.monto != null ? fmtCLP(p.monto) : '—'}</td>
                                                                <td>{p.item_presupuestario || <Chip variante="warn">Sin ítem</Chip>}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div className="frm-totalrow">
                                                <span>Total del carro <b>{fmtCLP(totalCarro)}</b></span>
                                                <span>Monto estimado <b>{fmtCLP(f.monto_estimado)}</b></span>
                                            </div>
                                        </>
                                    )}
                                </Seccion>

                                <Seccion id="gestion" titulo="Gestión de compra" refs={refs}>
                                    {!f.es_derivado ? (
                                        <div className="frm-note">Este formulario todavía no ha sido derivado a un comprador.</div>
                                    ) : (
                                        <>
                                            <div className="frm-fields frm-fields--3">
                                                <Campo label="Comprador" value={f.comprador} />
                                                <Campo label="Estado de la compra" value={f.estado_compra} />
                                                <Campo label="Derivado el" value={f.fecha_derivado ? fmtFecha(f.fecha_derivado) : null} />
                                            </div>
                                            {f.procesos.length > 0 && <div className="frm-subtitle">Proceso{f.procesos.length > 1 ? 's' : ''} de compra</div>}
                                            {f.procesos.map((p) => (
                                                <div className="frm-process" key={p.id}>
                                                    <div className="frm-process__head">
                                                        <span className="frm-process__title">{p.titulo}</span>
                                                        <Chip variante="draft">{p.tipo_proceso}</Chip>
                                                        <Chip variante={p.finalizado_en ? 'ok' : 'watch'}>{p.estado_proceso}</Chip>
                                                    </div>
                                                    <div className="frm-fields frm-fields--3">
                                                        <Campo label="Comprador responsable" value={p.comprador} />
                                                        <Campo label="Monto estimado" value={p.monto_estimado != null ? fmtCLP(p.monto_estimado) : null} />
                                                        <Campo label="Cierre estimado" value={p.fecha_cierre_estimada ? fmtFecha(p.fecha_cierre_estimada) : null} />
                                                        <Campo label="Licitación" value={p.codigo_licitacion} mono />
                                                        <Campo label="Compra ágil" value={p.codigo_compra_agil} mono />
                                                        <Campo label="Proceso iniciado" value={fmtFecha(p.creado_en)} />
                                                        {p.observaciones && <Campo label="Observaciones del comprador" value={p.observaciones} ancho />}
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </Seccion>

                                <Seccion id="oc" titulo="Órdenes de compra enlazadas" cuenta={ocs.length ? [`${cuentaOc.confirmadas} confirmada(s)`, cuentaOc.sugeridas && `${cuentaOc.sugeridas} sugerida(s)`, cuentaOc.descartadas && `${cuentaOc.descartadas} descartada(s)`].filter(Boolean).join(' · ') : undefined} refs={refs}>
                                    {!f.es_derivado ? (
                                        <div className="frm-note">Las órdenes de compra se enlazan una vez que el formulario es derivado a un comprador.</div>
                                    ) : ocs.length === 0 ? (
                                        <div className="frm-note">Este formulario no tiene órdenes de compra enlazadas.</div>
                                    ) : (
                                        <>
                                            <TablaOc filas={ocs} onVerOc={setOcAbierta} />
                                            {ocs.some((o) => o.estadoEnlace === 'SUGERIDO') && (
                                                <p className="dv-footnote" style={{ marginTop: 'var(--dv-sp-3)' }}>
                                                    Los enlaces «Sugerido» aún no han sido confirmados; se revisan en el módulo Enlace FSC-OC-PAC.
                                                </p>
                                            )}
                                        </>
                                    )}
                                </Seccion>

                                <Seccion id="trazabilidad" titulo="Trazabilidad de bandejas" refs={refs}>
                                    {f.historial_estados.length === 0 ? (
                                        <div className="frm-note">Aún no hay historial de bandejas para este formulario.</div>
                                    ) : (
                                        <ul className="frm-timeline">
                                            {bandejasConDias(f.historial_estados).map((h, i) => (
                                                <li key={`${h.estado}-${h.fecha}-${i}`} style={{ '--frm-dot': infoEstado(h.estado).color }}>
                                                    <span className="frm-timeline__date">{fmtFecha(h.fecha)}</span>
                                                    <EstadoChip codigo={h.estado} />
                                                    <span>{infoEstado(h.estado).nombre}</span>
                                                    <span className="frm-timeline__days">{h.dias != null ? `${h.dias} día(s)${h.actual ? ' hasta hoy' : ''}` : ''}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <p className="dv-footnote" style={{ marginTop: 'var(--dv-sp-3)' }}>
                                        El Panel SSO solo informa la bandeja vigente; el historial se construye desde el 08-06-2026 en cada sincronización.
                                    </p>
                                </Seccion>
                            </>
                        )}
                    </div>

                    <footer className="dv-modal__footer">
                        <button type="button" className="dv-btn dv-btn--primary" onClick={onCerrar}>Cerrar</button>
                    </footer>
                </div>
            </div>

            <DetalleOcModal
                codigoOc={ocAbierta}
                onCerrar={() => setOcAbierta(null)}
                onVerFsc={(derivadoId) => { setOcAbierta(null); setDestino({ origen: 'derivado', id: derivadoId }); }}
                onCorregido={cargar}
            />
        </>
    );
}
