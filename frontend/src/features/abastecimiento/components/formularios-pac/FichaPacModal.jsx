// Ficha completa de una ficha PAC (botón «Ver»): cabecera, carro, proyecto del plan y bandejas.
import { useEffect, useRef, useState } from 'react';
import '../formularios/formularios.css';
import './formularios-pac.css';
import { getFormularioPacFicha } from '../../api/formulariosPacApi';
import { fmtCLP, fmtFecha } from '../formularios/shared';
import { Chip, DiasChip } from '../formularios/ui';
import { AccionPacChip, EstadoPacChip } from './uiPac';
import { bandejasPacConDias, esEnTramitePac, infoEstadoPac, tituloFichaPac } from './sharedPac';

const SECCIONES = [
    ['general', 'Datos generales'], ['responsable', 'Responsable'], ['descripcion', 'Descripción'],
    ['plan', 'Proyecto del plan'], ['carro', 'Carro de productos'], ['trazabilidad', 'Trazabilidad'],
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

function ProyectoPlan({ ficha, plan, relacionadas }) {
    if (!ficha.identificador_proyecto) {
        return (
            <div className="frm-note">
                {ficha.accion_proyecto === 'Nuevo'
                    ? 'Esta ficha propone un proyecto nuevo: todavía no tiene un identificador en el plan.'
                    : 'La ficha no indica a qué proyecto del plan se refiere.'}
            </div>
        );
    }
    return (
        <>
            <div className="pac-plan">
                <div className="pac-plan__head">
                    <span className="frm-id">{ficha.identificador_proyecto}</span>
                    {plan?.en_plan_vigente
                        ? <Chip variante="ok" title="El proyecto está en el plan vigente (PlanerPAC)">En el plan vigente</Chip>
                        : <Chip variante="none" title="El plan vigente cargado no incluye este proyecto (hoy solo trae el PAC 2026)">No está en el plan vigente</Chip>}
                    {plan?.en_maestro && <Chip variante="draft" title="Existe en el maestro histórico de proyectos PAC">En el maestro histórico</Chip>}
                </div>
                <div className="frm-fields frm-fields--2">
                    <Campo label="Nombre del proyecto" value={plan?.nombre_proyecto} ancho />
                    <Campo label="Departamento en el plan" value={plan?.depto} />
                    <Campo label="Monto del plan" value={plan?.monto_total != null ? fmtCLP(plan.monto_total) : null} />
                    <Campo label="Ítems en el plan" value={plan?.n_items || null} />
                    <Campo label="OC asociada (maestro)" value={plan?.oc_asociada} mono />
                </div>
            </div>
            {relacionadas.length > 0 && (
                <>
                    <div className="frm-subtitle">Otras fichas sobre el mismo proyecto</div>
                    <div className="frm-table-wrap">
                        <table className="dv-table frm-table">
                            <thead><tr><th>Ficha</th><th>Fecha</th><th>Acción</th><th>Bandeja</th><th className="is-num">Monto</th></tr></thead>
                            <tbody>
                                {relacionadas.map((r) => (
                                    <tr key={r.id}>
                                        <td><span className="frm-id">{r.id_ficha}</span></td>
                                        <td>{fmtFecha(r.fecha_ficha)}</td>
                                        <td><AccionPacChip accion={r.accion_proyecto} /></td>
                                        <td><EstadoPacChip codigo={r.estado} /></td>
                                        <td className="is-num">{r.monto != null ? fmtCLP(r.monto) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </>
    );
}

/** @param id id de la ficha (FormularioPAC.id); null/undefined = cerrado */
export default function FichaPacModal({ id, onCerrar }) {
    const [d, setD] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const refs = useRef({});

    useEffect(() => {
        if (!id) return undefined;
        let activo = true;
        setCargando(true);
        setError(null);
        setD(null);
        getFormularioPacFicha(id)
            .then(({ data }) => { if (activo) setD(data); })
            .catch((err) => { if (activo) setError(err.response?.data?.error || 'No fue posible cargar la ficha.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [id]);

    useEffect(() => {
        if (!id) return undefined;
        const alTeclear = (e) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', alTeclear);
        return () => window.removeEventListener('keydown', alTeclear);
    }, [id, onCerrar]);

    if (!id) return null;

    const f = d?.ficha;
    const est = f ? infoEstadoPac(f.estado) : null;
    const carro = d?.carro;
    const org = d?.organigrama;
    const irA = (clave) => refs.current[clave]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <div className="dv-overlay is-open" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div className="dv-modal frm-ficha" role="dialog" aria-modal="true" aria-label="Ficha PAC">
                <header className="dv-modal__header">
                    <div>
                        <div className="dv-eyebrow frm-ficha__eyebrow">Formulario PAC — Plan Anual de Compras</div>
                        <div className="frm-ficha__idrow">
                            <h2>{f?.id_ficha || 'Cargando…'}</h2>
                            {f && (
                                <>
                                    <span className="dv-chip frm-ficha__chip-on-dark" title={est.detalle}>
                                        <span className="dv-chip__dot" style={{ color: est.color }} />{f.estado || '—'} · {est.nombre}
                                    </span>
                                    {f.accion_proyecto && <span className="dv-chip frm-ficha__chip-on-dark">{f.accion_proyecto}</span>}
                                </>
                            )}
                        </div>
                        {f && <div className="dv-sub">{tituloFichaPac(f) || 'Sin nombre de proyecto'} · {f.departamento || 'Sin departamento'}</div>}
                    </div>
                    <div className="dv-modal__actions">
                        <button type="button" className="dv-btn dv-btn--on-dark dv-btn--icon" onClick={onCerrar} aria-label="Cerrar">✕</button>
                    </div>
                </header>

                <div className="dv-modal__body">
                    {cargando && !f && <div className="frm-ficha__loading">Cargando ficha…</div>}
                    {error && <div className="frm-note frm-state--error">{error}</div>}

                    {f && (
                        <>
                            <div className="frm-ficha__strip">
                                <div className="frm-stat">
                                    <div className="frm-stat__label">Monto de la ficha</div>
                                    <div className="frm-stat__value">{f.monto != null ? fmtCLP(f.monto) : '—'}</div>
                                    <div className="frm-stat__hint">{f.monto == null ? 'Sin monto declarado' : f.monto < 0 ? 'Rebaja neta del proyecto' : 'Efecto neto declarado'}</div>
                                </div>
                                <div className="frm-stat">
                                    <div className="frm-stat__label">Bandeja actual</div>
                                    <div className="frm-stat__value"><EstadoPacChip codigo={f.estado} /></div>
                                    <div className="frm-stat__hint">{est.nombre}</div>
                                </div>
                                <div className="frm-stat">
                                    <div className="frm-stat__label">Días en trámite</div>
                                    <div className="frm-stat__value">{esEnTramitePac(f.estado) ? <DiasChip dias={f.dias_en_tramite} /> : '—'}</div>
                                    <div className="frm-stat__hint">
                                        {esEnTramitePac(f.estado)
                                            ? (f.dias_en_bandeja != null ? `${f.dias_en_bandeja} día(s) en la bandeja actual` : `Desde el ${fmtFecha(f.fecha_ficha)}`)
                                            : 'Trámite terminado'}
                                    </div>
                                </div>
                                <div className="frm-stat">
                                    <div className="frm-stat__label">Carro de productos</div>
                                    <div className="frm-stat__value">{carro.n_lineas}</div>
                                    <div className="frm-stat__hint">
                                        {carro.n_lineas === 0 ? 'Sin líneas' : carro.cuadra_con_monto === true ? 'Cuadra con el monto'
                                            : carro.diferencia != null ? `Difiere del monto en ${fmtCLP(carro.diferencia)}` : 'Ficha sin monto'}
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
                                    <Campo label="Fecha de la ficha" value={fmtFecha(f.fecha_ficha)} />
                                    <Campo label="Acción" value={f.accion_proyecto} />
                                    <Campo label="Tipo de requerimiento" value={f.tipo_requerimiento} />
                                    <Campo label="Tipo de proyecto" value={f.tipo_proyecto} />
                                    <Campo label="Recursos programáticos" value={f.recursos_programaticos} />
                                    <Campo label="Proyecto del plan" value={f.identificador_proyecto} mono />
                                    <Campo label="Autorización de la jefatura" value={f.fecha_autorizacion_jefe ? fmtFecha(f.fecha_autorizacion_jefe) : null} />
                                    {f.rec_prog_justificacion && <Campo label="Justificación de recursos programáticos" value={f.rec_prog_justificacion} ancho />}
                                </div>
                                {f.estado === 'R' && (
                                    <>
                                        <div className="frm-subtitle">Rechazo{f.fecha_rechazo ? ` — ${fmtFecha(f.fecha_rechazo)}` : ''}</div>
                                        <p className="frm-text frm-text--warn">{f.obs_rechazo || 'Sin observación registrada.'}</p>
                                    </>
                                )}
                            </Seccion>

                            <Seccion id="responsable" titulo="Responsable" refs={refs}>
                                <div className="frm-fields frm-fields--2">
                                    <Campo label="Departamento" value={f.departamento} />
                                    <Campo label="Subdirección / establecimiento" value={org ? org.nombre_subdireccion : 'Sin clasificar'} />
                                    <Campo label="Departamento (organigrama)" value={org ? org.nombre_depto : 'Sin clasificar'} />
                                    <Campo label="Responsable" value={f.nombre_responsable} />
                                    <Campo label="Cargo" value={f.cargo_responsable} />
                                    <Campo label="Jefatura" value={f.nombre_jefatura} />
                                    <Campo label="Solicitante" value={f.solicitante} />
                                    <Campo label="Anexo" value={f.anexo} />
                                    <Campo label="Correo" value={f.correo} />
                                </div>
                            </Seccion>

                            <Seccion id="descripcion" titulo="Descripción" refs={refs}>
                                {f.nombre_proyecto && <p className="frm-text frm-text--key">{f.nombre_proyecto}</p>}
                                {f.nombre_programa && (<><div className="frm-subtitle">Programa</div><p className="frm-text">{f.nombre_programa}</p></>)}
                                {f.descripcion_adquisicion && (<><div className="frm-subtitle">Descripción de la adquisición</div><p className="frm-text">{f.descripcion_adquisicion}</p></>)}
                                {f.objetivo_adquisicion && (<><div className="frm-subtitle">Objetivo</div><p className="frm-text">{f.objetivo_adquisicion}</p></>)}
                                {!f.nombre_proyecto && !f.nombre_programa && !f.descripcion_adquisicion && !f.objetivo_adquisicion && (
                                    <div className="frm-note">Sin descripción registrada.</div>
                                )}
                            </Seccion>

                            <Seccion id="plan" titulo="Proyecto del plan" refs={refs}>
                                <ProyectoPlan ficha={f} plan={d.proyecto_plan} relacionadas={d.fichas_del_mismo_proyecto} />
                            </Seccion>

                            <Seccion id="carro" titulo="Carro de productos" cuenta={d.productos.length ? `${d.productos.length} línea(s)` : undefined} refs={refs}>
                                {d.productos.length === 0 ? (
                                    <div className="frm-note">
                                        {f.accion_proyecto === 'Eliminar' ? 'Una ficha de eliminación no lleva productos.' : 'Esta ficha no registra productos en el carro.'}
                                    </div>
                                ) : (
                                    <>
                                        <div className="frm-table-wrap">
                                            <table className="dv-table frm-table">
                                                <thead><tr><th>#</th><th>Categoría</th><th>Producto</th><th className="is-num">Cant.</th><th>Unidad</th><th className="is-num">Monto</th><th>Ítem presupuestario</th><th>Mes de ejecución</th></tr></thead>
                                                <tbody>
                                                    {d.productos.map((p) => (
                                                        <tr key={p.linea}>
                                                            <td className="frm-muted">{p.linea}</td>
                                                            <td>{p.categoria || '—'}</td>
                                                            <td className="is-strong"><div className="frm-trunc" title={p.producto}>{p.producto || '—'}</div></td>
                                                            <td className="is-num">{p.cantidad ?? '—'}</td>
                                                            <td>{p.unidad || '—'}</td>
                                                            <td className="is-num is-nowrap">{p.monto != null ? fmtCLP(p.monto) : '—'}</td>
                                                            <td>{p.item_presupuestario ? <div className="frm-trunc" title={p.item_presupuestario}>{p.item_presupuestario}</div> : <Chip variante="warn">Sin ítem</Chip>}</td>
                                                            <td className="is-nowrap">{p.mes_ejecucion || <span className="frm-muted">—</span>}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="frm-totalrow">
                                            <span>Total del carro <b>{fmtCLP(carro.suma_lineas)}</b></span>
                                            <span>Monto de la ficha <b>{f.monto != null ? fmtCLP(f.monto) : '—'}</b></span>
                                        </div>
                                        {carro.cuadra_con_monto === false && (
                                            <p className="dv-footnote" style={{ marginTop: 'var(--dv-sp-3)' }}>
                                                El monto de la ficha no coincide con la suma de sus líneas ({fmtCLP(carro.diferencia)} de diferencia).
                                                {f.accion_proyecto === 'Modificar' && ' En una modificación el monto es el cambio neto y el carro la versión resultante del proyecto.'}
                                            </p>
                                        )}
                                    </>
                                )}
                            </Seccion>

                            <Seccion id="trazabilidad" titulo="Trazabilidad de bandejas" refs={refs}>
                                {d.historial_estados.length === 0 ? (
                                    <div className="frm-note">Aún no hay historial de bandejas para esta ficha.</div>
                                ) : (
                                    <ul className="frm-timeline">
                                        {bandejasPacConDias(d.historial_estados).map((h, i) => (
                                            <li key={`${h.estado}-${h.fecha}-${i}`} style={{ '--frm-dot': infoEstadoPac(h.estado).color }}>
                                                <span className="frm-timeline__date">{fmtFecha(h.fecha)}</span>
                                                <EstadoPacChip codigo={h.estado} />
                                                <span>{infoEstadoPac(h.estado).nombre}</span>
                                                <span className="frm-timeline__days">{h.dias != null ? `${h.dias} día(s)${h.actual ? ' hasta hoy' : ''}` : ''}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p className="dv-footnote" style={{ marginTop: 'var(--dv-sp-3)' }}>
                                    El Panel solo informa la bandeja vigente; el historial se construye en cada sincronización
                                    {d.historial_desde ? `, desde el ${fmtFecha(d.historial_desde)}` : ''}.
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
    );
}
