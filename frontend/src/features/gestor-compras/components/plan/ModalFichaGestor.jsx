import React, { useEffect, useMemo, useState } from 'react';
import { getGestorPlanItem } from '../../api/gestorComprasApi';
import { fmtCLP, fmtN } from '../solicitudes/shared';

// Ficha completa de un proyecto del Plan Anual de Compras — botón "Ver" de las tablas de
// proyectos. Banner con lo esencial, y debajo tarjetas con TODO lo que hay del PAC: identificación,
// responsable, cronología de ejecución, ítems (con código presupuestario, OC y meses de envío),
// formularios vinculados y órdenes de compra. Solo lectura: gestor-compras/plan/items/<id>/ da 404
// si el proyecto no es de su departamento y limita los FSC vinculados a los de su alcance.

export const ESTADO_FICHA = {
    EJECUTADO: { label: '✅ Ejecutado', bg: '#dcfce7', color: '#15803d' },
    PENDIENTE: { label: '⏳ Pendiente', bg: '#fffbeb', color: '#b45309' },
    ATRASADO: { label: '⏰ Atrasado', bg: '#fee2e2', color: '#b91c1c' },
    SIN_FECHA: { label: '❓ Sin fecha', bg: '#f1f5f9', color: '#64748b' },
};

const MENSAJE_ESTADO = {
    EJECUTADO: { color: '#15803d', bg: '#f0fdf4', texto: 'Este proyecto ya se ejecutó: tiene al menos un formulario de compra u orden de compra asociada.' },
    PENDIENTE: { color: '#b45309', bg: '#fffbeb', texto: 'Compra planificada para más adelante: todavía no vence su fecha y no tiene formulario ni OC.' },
    ATRASADO: { color: '#b91c1c', bg: '#fef2f2', texto: 'La fecha de compra planificada ya venció y el proyecto no tiene formulario ni OC asociada.' },
    SIN_FECHA: { color: '#475569', bg: '#f8fafc', texto: 'El proyecto no tiene fecha de compra cargada en el plan, por lo que no se puede evaluar su avance.' },
};

const urlSegura = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

// 'YYYY-MM-DD[ hh:mm:ss]' → 'dd-mm-yyyy' (sin pasar por Date: evita el desfase de zona horaria)
const fmtFecha = (s) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || '—');
};

const fecha10 = (s) => (s ? String(s).slice(0, 10) : null);

function Campo({ label, value }) {
    return (
        <div>
            <div className="gc-ficha-campo-label">{label}</div>
            <div className="gc-ficha-campo-value">{value || value === 0 ? value : '—'}</div>
        </div>
    );
}

function Tarjeta({ icono, titulo, children }) {
    return (
        <section className="gc-ficha-card">
            <div className="gc-ficha-card-title"><span>{icono}</span>{titulo}</div>
            {children}
        </section>
    );
}

function Paso({ clase, icono, label, fecha }) {
    return (
        <div className={`gc-ficha-step ${clase}`}>
            <span className="gc-ficha-step-dot">{icono}</span>
            <div className="gc-ficha-step-label">{label}</div>
            <div className="gc-ficha-step-fecha">{fecha}</div>
        </div>
    );
}

export default function ModalFichaGestor({ idProyecto, params, onCerrar }) {
    const [ficha, setFicha] = useState(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        if (!idProyecto) { setFicha(null); return undefined; }
        let activo = true;
        setCargando(true);
        getGestorPlanItem(idProyecto, params)
            .then(({ data }) => { if (activo) setFicha(data); })
            .catch(() => { if (activo) setFicha(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [idProyecto, params]);

    // Esc cierra el modal (mientras está abierto)
    useEffect(() => {
        if (!idProyecto) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [idProyecto, onCerrar]);

    // Cronología: planificado → formulario → OC (la primera fecha de cada etapa, si existe).
    const pasos = useMemo(() => {
        if (!ficha) return [];
        const fechasFsc = ficha.formularios.map((f) => fecha10(f.fecha_derivado)).filter(Boolean).sort();
        const fechasOc = ficha.ordenes_compra.map((o) => fecha10(o.fecha_envio)).filter(Boolean).sort();
        const hoy = new Date().toISOString().slice(0, 10);
        const vencido = ficha.fecha_mas_proxima && ficha.fecha_mas_proxima < hoy;
        return [
            { clave: 'plan', icono: '📅', label: 'Planificado', fecha: ficha.fecha_mas_proxima ? fmtFecha(ficha.fecha_mas_proxima) : 'Sin fecha', clase: ficha.fecha_mas_proxima ? 'done' : '' },
            {
                clave: 'fsc', icono: '📝', label: 'Formulario',
                fecha: ficha.formularios.length ? (fechasFsc[0] ? fmtFecha(fechasFsc[0]) : `${ficha.formularios.length} vinculado(s)`) : 'Pendiente',
                clase: ficha.formularios.length ? 'done' : (vencido ? 'alerta' : 'aviso'),
            },
            {
                clave: 'oc', icono: '📦', label: 'Orden de compra',
                fecha: ficha.ordenes_compra.length ? (fechasOc[0] ? fmtFecha(fechasOc[0]) : `${ficha.ordenes_compra.length} enlazada(s)`) : 'Pendiente',
                clase: ficha.ordenes_compra.length ? 'done' : '',
            },
        ];
    }, [ficha]);

    if (!idProyecto) return null;
    const estado = ficha?.estado_ejecucion && ESTADO_FICHA[ficha.estado_ejecucion];
    const mensaje = ficha?.estado_ejecucion && MENSAJE_ESTADO[ficha.estado_ejecucion];
    const totalItems = ficha ? ficha.items.reduce((a, it) => a + (it.monto_total_item || 0), 0) : 0;

    return (
        <div className="gc-ficha-overlay" onClick={onCerrar}>
            <div className="gc-ficha" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="gc-ficha-banner">
                    <button className="gc-ficha-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
                    <span className="gc-ficha-id">{idProyecto}</span>
                    {estado && (
                        <span className="gc-ficha-estado" style={{ background: estado.bg, color: estado.color }}>{estado.label}</span>
                    )}
                    <h2 className="gc-ficha-title">{ficha?.nombre_proyecto || (cargando ? 'Cargando proyecto…' : 'Proyecto del Plan Anual de Compras')}</h2>
                    {ficha && (
                        <div className="gc-ficha-sub">
                            {[ficha.depto_nombre || ficha.depto_texto, ficha.subdireccion_nombre].filter(Boolean).join(' · ')}
                        </div>
                    )}
                    {ficha && (
                        <div className="gc-ficha-stats">
                            <div className="gc-ficha-stat"><div className="gc-ficha-stat-label">Monto total</div><div className="gc-ficha-stat-value">{fmtCLP(ficha.monto_total)}</div></div>
                            <div className="gc-ficha-stat"><div className="gc-ficha-stat-label">Ítems</div><div className="gc-ficha-stat-value">{fmtN(ficha.n_items)}</div></div>
                            <div className="gc-ficha-stat"><div className="gc-ficha-stat-label">Compra desde</div><div className="gc-ficha-stat-value">{fmtFecha(ficha.fecha_mas_proxima)}</div></div>
                            <div className="gc-ficha-stat"><div className="gc-ficha-stat-label">Compra hasta</div><div className="gc-ficha-stat-value">{fmtFecha(ficha.fecha_ultima_compra)}</div></div>
                            <div className="gc-ficha-stat"><div className="gc-ficha-stat-label">Año PAC</div><div className="gc-ficha-stat-value">{ficha.pac || '—'}</div></div>
                        </div>
                    )}
                </div>

                <div className="gc-ficha-body">
                    {cargando && <div className="loading-spinner">Cargando ficha…</div>}
                    {!cargando && !ficha && (
                        <div className="gc-empty">
                            <div className="gc-empty-icon">🔒</div>
                            <div className="gc-empty-title">Proyecto no disponible</div>
                            <div className="gc-empty-sub">
                                Este proyecto del PAC pertenece a otro departamento o ya no existe en el plan, por lo que no se muestra.
                            </div>
                        </div>
                    )}

                    {ficha && (
                        <>
                            {mensaje && (
                                <div className="gc-ficha-callout" style={{ color: mensaje.color, background: mensaje.bg }}>
                                    {mensaje.texto}
                                </div>
                            )}

                            <Tarjeta icono="🧭" titulo="Cronología de ejecución">
                                <div className="gc-ficha-steps">
                                    {pasos.map((p) => <Paso key={p.clave} {...p} />)}
                                </div>
                            </Tarjeta>

                            <Tarjeta icono="🏷️" titulo="Identificación del proyecto">
                                <div className="gc-ficha-grid">
                                    <Campo label="ID del proyecto" value={ficha.id_proyecto} />
                                    <Campo label="Tipo de proyecto" value={ficha.tipo_proyecto} />
                                    <Campo label="Año PAC" value={ficha.pac} />
                                    <Campo label="Departamento" value={ficha.depto_nombre || ficha.depto_texto} />
                                    <Campo label="Subdirección" value={ficha.subdireccion_nombre} />
                                    <Campo label="Unidad" value={ficha.unidad} />
                                    <Campo label="Unidad de compra" value={ficha.unidad_compra} />
                                    <div>
                                        <div className="gc-ficha-campo-label">Códigos presupuestarios</div>
                                        <div className="gc-ficha-chips" style={{ marginTop: 4 }}>
                                            {ficha.codigos_presupuestarios?.length
                                                ? ficha.codigos_presupuestarios.map((c) => <span key={c} className="gc-ficha-chip">{c}</span>)
                                                : <span className="gc-ficha-campo-value">—</span>}
                                        </div>
                                    </div>
                                </div>
                            </Tarjeta>

                            <Tarjeta icono="👤" titulo="Responsable">
                                <div className="gc-ficha-grid">
                                    <Campo label="Nombre" value={ficha.nombre_responsable} />
                                    <Campo label="Cargo" value={ficha.cargo_responsable} />
                                </div>
                            </Tarjeta>

                            <Tarjeta icono="🧾" titulo={`Ítems del plan (${ficha.items.length})`}>
                                <div className="gc-ficha-table-wrap">
                                    <table className="gc-ficha-table">
                                        <thead>
                                            <tr>
                                                <th>Ítem</th>
                                                <th>Cód. presupuestario</th>
                                                <th className="gc-right">Cantidad</th>
                                                <th className="gc-right">Monto unitario</th>
                                                <th className="gc-right">Monto total</th>
                                                <th>Fecha de compra</th>
                                                <th className="gc-right">N° OC</th>
                                                <th>Meses de envío OC</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ficha.items.map((it, i) => (
                                                <tr key={i}>
                                                    <td style={{ minWidth: 200 }}>{it.nombre_item || '—'}</td>
                                                    <td style={{ fontFamily: 'monospace' }}>{it.codigo_presupuestario || '—'}</td>
                                                    <td className="gc-right">{it.cantidad_items || '—'}</td>
                                                    <td className="gc-right">{fmtCLP(it.monto_unitario_item)}</td>
                                                    <td className="gc-right" style={{ fontWeight: 600 }}>{fmtCLP(it.monto_total_item)}</td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(it.fecha_inicio_compra)}</td>
                                                    <td className="gc-right">{it.cantidad_oc || '—'}</td>
                                                    <td>{it.meses_envio_oc || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={4}>Total del proyecto</td>
                                                <td className="gc-right">{fmtCLP(totalItems)}</td>
                                                <td colSpan={3} />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </Tarjeta>

                            <Tarjeta icono="📝" titulo={`Formularios de compra vinculados (${ficha.formularios.length})`}>
                                {ficha.formularios.length === 0 ? (
                                    <p className="gc-ficha-campo-value" style={{ margin: 0, color: 'var(--gob-gris4)' }}>
                                        Ningún formulario de su departamento ha declarado este ID de Plan todavía.
                                    </p>
                                ) : (
                                    <div className="gc-ficha-table-wrap">
                                        <table className="gc-ficha-table">
                                            <thead>
                                                <tr>
                                                    <th>Formulario</th><th>PAC</th><th>Derivado</th><th>Estado de compra</th>
                                                    <th>Comprador</th><th className="gc-right">Monto</th><th>Productos</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ficha.formularios.map((f) => (
                                                    <tr key={f.id}>
                                                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--gob-azul-mid)' }}>{f.id_formulario}</td>
                                                        <td>
                                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: f.dentro_fuera_pac === 'DENTRO' ? '#dcfce7' : '#fee2e2', color: f.dentro_fuera_pac === 'DENTRO' ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>
                                                                {f.dentro_fuera_pac === 'DENTRO' ? 'Dentro PAC' : 'Fuera PAC'}
                                                            </span>
                                                        </td>
                                                        <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha_derivado)}</td>
                                                        <td>{f.estado_compra || '—'}</td>
                                                        <td>{f.comprador || '—'}</td>
                                                        <td className="gc-right">{fmtCLP(f.monto_estimado)}</td>
                                                        <td style={{ maxWidth: 240 }}>
                                                            {f.productos.length
                                                                ? `${f.productos.length}: ${f.productos.slice(0, 3).map((p) => p.producto).filter(Boolean).join(', ')}${f.productos.length > 3 ? '…' : ''}`
                                                                : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Tarjeta>

                            <Tarjeta icono="📦" titulo={`Órdenes de compra enlazadas (${ficha.ordenes_compra.length})`}>
                                {ficha.ordenes_compra.length === 0 ? (
                                    <p className="gc-ficha-campo-value" style={{ margin: 0, color: 'var(--gob-gris4)' }}>
                                        Sin OC enlazadas en el maestro PAC-OC.
                                    </p>
                                ) : (
                                    <div className="gc-ficha-table-wrap">
                                        <table className="gc-ficha-table">
                                            <thead>
                                                <tr>
                                                    <th>Código OC</th><th>Nombre</th><th>Estado</th><th>Unidad</th>
                                                    <th className="gc-right">Monto bruto</th><th>Fecha envío</th><th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ficha.ordenes_compra.map((oc) => {
                                                    const link = urlSegura(oc.link_mp);
                                                    return (
                                                        <tr key={oc.codigo_oc}>
                                                            <td style={{ fontFamily: 'monospace' }}>{oc.codigo_oc}</td>
                                                            <td style={{ maxWidth: 260 }}>{oc.nombre_oc}</td>
                                                            <td>{oc.estado_oc || '—'}</td>
                                                            <td>{oc.unidad || '—'}</td>
                                                            <td className="gc-right" style={{ fontWeight: 600 }}>{fmtCLP(oc.total_bruto)}</td>
                                                            <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(oc.fecha_envio)}</td>
                                                            <td>{link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gob-azul-mid)', fontWeight: 600 }}>Ver en MP ↗</a>}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Tarjeta>
                        </>
                    )}
                </div>

                <div className="gc-ficha-footer">
                    <button onClick={onCerrar} className="btn-primary" style={{ padding: '8px 22px' }}>Cerrar</button>
                </div>
            </div>
        </div>
    );
}
