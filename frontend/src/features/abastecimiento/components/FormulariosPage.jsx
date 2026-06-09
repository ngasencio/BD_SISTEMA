import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
    getFormulariosStats, getFormulariosFlujo,
    getFormularios, getFormulariosDerivados, getFormulariosProductos,
    getFormulariosAlertas,
    iniciarActualizacionFormularios, estadoActualizacionFormularios, cancelarActualizacionFormularios,
} from '../api/formulariosApi';
import { KpiCard } from './KpiCard';

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

function parseFecha(str) {
    if (!str) return null;
    const formatos = [
        /^(\d{4})-(\d{2})-(\d{2})$/,  // YYYY-MM-DD
        /^(\d{2})-(\d{2})-(\d{4})$/,  // DD-MM-YYYY
        /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
    ];
    let m;
    if ((m = str.match(formatos[0]))) return new Date(+m[1], +m[2]-1, +m[3]);
    if ((m = str.match(formatos[1]))) return new Date(+m[3], +m[2]-1, +m[1]);
    if ((m = str.match(formatos[2]))) return new Date(+m[3], +m[2]-1, +m[1]);
    return null;
}

function diasDesde(fechaStr) {
    const d = parseFecha(fechaStr);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function DiasBadge({ dias, compact }) {
    if (dias === null || dias === undefined) return <span style={{ color: '#94a3b8' }}>—</span>;
    const color = dias > 30 ? '#dc2626' : dias > 10 ? '#f97316' : dias > 5 ? '#f59e0b' : '#16a34a';
    const bg    = dias > 30 ? '#fef2f2' : dias > 10 ? '#fff7ed' : dias > 5 ? '#fffbeb' : '#f0fdf4';
    return (
        <span style={{
            display: 'inline-block', padding: compact ? '1px 7px' : '2px 10px',
            borderRadius: 20, fontSize: compact ? 10 : 11, fontWeight: 700,
            background: bg, color, border: `1px solid ${color}40`,
            whiteSpace: 'nowrap',
        }}>
            {dias}d
        </span>
    );
}

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const RE_TIPO_FORMULARIO = /Nro\s*(\d+)/i;
const parseTipoFormulario = (texto) => {
    const m = texto?.match(RE_TIPO_FORMULARIO);
    return m ? Number(m[1]) : null;
};

// ─── Bandejas de visación FSC ─────────────────────────────────────────────────

const ESTADO_FSC_INFO = {
    P:    { nombre: 'Pendiente Firmas',                        color: '#f59e0b' },
    FR:   { nombre: 'Revisor Finanzas',                        color: '#3b82f6' },
    FA:   { nombre: 'Autorizador Finanzas',                    color: '#6366f1' },
    ASDA: { nombre: 'Autorizador Sub Director Administrativo', color: '#8b5cf6' },
    ADIR: { nombre: 'Autorizador Director',                    color: '#a855f7' },
    AA:   { nombre: 'Autorizador Abastecimiento',              color: '#06b6d4' },
    DC:   { nombre: 'Derivación Compras',                      color: '#0ea5e9' },
    AC:   { nombre: 'A Comprador',                             color: '#16a34a' },
    R:    { nombre: 'Rechazado',                               color: '#dc2626' },
};

// ─── Badge de estado FSC ──────────────────────────────────────────────────────

function EstadoFSCBadge({ codigo }) {
    const info = ESTADO_FSC_INFO[codigo] || { nombre: codigo || 'Sin estado', color: '#94a3b8' };
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            background: info.color + '20', color: info.color,
            border: `1px solid ${info.color}50`,
        }} title={info.nombre}>
            {codigo || '—'}
        </span>
    );
}

// ─── Tooltip informativo — ícono ? con borde CSS ──────────────────────────────

function InfoTooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            <span style={{
                cursor: 'help',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%',
                border: '1.5px solid #94a3b8', color: '#94a3b8',
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                marginLeft: 4, userSelect: 'none', flexShrink: 0,
            }}>?</span>
            {show && (
                <span style={{
                    position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#f8fafc', fontSize: 11, padding: '7px 11px',
                    borderRadius: 7, whiteSpace: 'normal', minWidth: 200, maxWidth: 280,
                    width: 'max-content', textAlign: 'left', zIndex: 200, lineHeight: 1.7,
                    boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

// ─── Chip de filtro rápido ────────────────────────────────────────────────────

function FiltroChip({ activo, color, onClick, children }) {
    return (
        <button onClick={onClick} style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11,
            fontWeight: activo ? 700 : 400,
            border: activo ? `2px solid ${color || '#7c3aed'}` : '1px solid #e2e8f0',
            background: activo ? (color ? `${color}15` : '#ede9fe') : '#fff',
            color: activo ? (color || '#7c3aed') : '#64748b',
            cursor: 'pointer', transition: 'all 0.15s',
        }}>
            {children}
        </button>
    );
}

// ─── Banner de progreso ETL ───────────────────────────────────────────────────

function BannerFormularios({ tarea, onCerrar, onCancelar }) {
    if (!tarea) return null;
    const completado = tarea.status === 'completado';
    const error      = tarea.status === 'error';
    const enProceso  = tarea.status === 'en_proceso' || tarea.status === 'iniciado';
    const color = completado ? '#16a34a' : error ? '#dc2626' : '#0ea5e9';

    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            background: '#1e1e2e', border: `2px solid ${color}`,
            borderRadius: 12, padding: '16px 20px', width: 380,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontFamily: 'monospace',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color, fontWeight: 700, fontSize: 13 }}>
                    {completado ? '✅ Actualización completada' : error ? '❌ Error' : '🔄 Actualizando Formularios FSC...'}
                </span>
                <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ background: '#374151', borderRadius: 4, height: 6, marginBottom: 10 }}>
                <div style={{ width: `${tarea.progreso_pct || (completado ? 100 : enProceso ? 15 : 0)}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ color: '#d1d5db', fontSize: 12, marginBottom: 8 }}>{tarea.paso_desc}</div>
            {tarea.total_cargados > 0 && (
                <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
                    {fmtN(tarea.total_cargados)} registros cargados
                </div>
            )}
            {tarea.logs_recientes?.length > 0 && (
                <div style={{ background: '#111827', borderRadius: 6, padding: '6px 8px', maxHeight: 100, overflowY: 'auto', fontSize: 10, color: '#4ade80', lineHeight: 1.5 }}>
                    {tarea.logs_recientes.map((l, i) => <div key={i}>&gt; {l}</div>)}
                </div>
            )}
            {error && <div style={{ color: '#fca5a5', fontSize: 11, marginTop: 8 }}>{tarea.error}</div>}
            {enProceso && (
                <button onClick={onCancelar} style={{ marginTop: 10, width: '100%', padding: '6px', background: '#374151', border: '1px solid #6b7280', borderRadius: 6, color: '#d1d5db', cursor: 'pointer', fontSize: 12 }}>
                    Cancelar
                </button>
            )}
        </div>
    );
}

// ─── Modal de credenciales del Panel SS Osorno ────────────────────────────────

function ModalCredenciales({ onConfirmar, onCerrar }) {
    const [rut, setRut] = useState('');
    const [dv, setDv] = useState('');
    const [clave, setClave] = useState('');

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 6px' }}>Acceso al Panel SS Osorno</h3>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>
                    Ingrese sus credenciales para descargar los reportes FSC. No se almacenan en el servidor.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input placeholder="RUT (sin DV)" value={rut} onChange={e => setRut(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                    <input placeholder="DV" value={dv} onChange={e => setDv(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                    <input placeholder="Contraseña" type="password" value={clave} onChange={e => setClave(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '8px 14px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
                    <button
                        onClick={() => onConfirmar({ rut, dv, clave })}
                        disabled={!rut || !dv || !clave}
                        style={{ padding: '8px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, cursor: (!rut || !dv || !clave) ? 'not-allowed' : 'pointer', opacity: (!rut || !dv || !clave) ? 0.6 : 1 }}
                    >
                        Iniciar descarga
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Tabla simple (usada solo por el tab "Carro de Productos") ───────────────

function TablaFormularios({ columnas, filas, vacio }) {
    if (vacio) return <div className="loading-spinner">Sin datos para mostrar.</div>;
    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr>
                        {columnas.map(c => (
                            <th key={c.key} style={{ textAlign: 'left', padding: '9px 10px', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', color: '#475569', fontSize: 12, fontWeight: 600 }}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f, i) => (
                        <tr key={f.id ?? i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            {columnas.map(c => (
                                <td key={c.key} style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#374151', fontSize: 13 }}>
                                    {c.render ? c.render(f) : (f[c.key] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const COLS_PRODUCTOS = [
    { key: 'folio', label: 'Folio' },
    { key: 'anho', label: 'Año' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'producto', label: 'Producto' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'monto', label: 'Monto', render: (f) => fmtCLP(f.monto) },
    { key: 'item_presupuestario', label: 'Item Presupuestario' },
];

// ─── Encabezado de columna ordenable — patrón ThSort ─────────────────────────

const thStyle = {
    padding: '9px 10px', textAlign: 'left', fontWeight: 600,
    color: '#475569', borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12,
    cursor: 'pointer', userSelect: 'none',
};

function SortableTh({ label, campo, ordering, setOrdering, align, title: tip }) {
    const asc    = ordering === campo;
    const desc   = ordering === `-${campo}`;
    const activo = asc || desc;
    const arrow  = activo ? (desc ? ' ↓' : ' ↑') : ' ⇅';
    const alternar = () => setOrdering(asc ? `-${campo}` : campo);
    return (
        <th onClick={alternar} title={tip || `Ordenar por ${label}`}
            style={{ ...thStyle, textAlign: align || 'left', color: activo ? '#7c3aed' : thStyle.color, background: activo ? '#f5f3ff' : thStyle.background }}>
            {label}
            <span style={{ color: activo ? '#7c3aed' : '#cbd5e1', fontWeight: 700 }}>{arrow}</span>
            {tip && <InfoTooltip text={tip} />}
        </th>
    );
}

// ─── Hook genérico: tabla con búsqueda + orden + paginación server-side ──────

function useListaServidor(fetcher, ordenInicial, filtros) {
    const [search, setSearch]   = useState('');
    const [ordering, setOrdering] = useState(ordenInicial);
    const [page, setPage]       = useState(1);
    const [data, setData]       = useState({ results: [], count: 0 });
    const [cargando, setCargando] = useState(true);
    const filtrosKey = JSON.stringify(filtros || {});

    useEffect(() => { setPage(1); }, [search, ordering, filtrosKey]);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        fetcher({ search: search || undefined, ordering, page, ...(filtros || {}) })
            .then(({ data: res }) => {
                if (!activo) return;
                const results = res.results ?? res;
                setData({ results, count: res.count ?? results.length });
            })
            .catch(() => { if (activo) setData({ results: [], count: 0 }); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, ordering, page, filtrosKey]);

    return { search, setSearch, ordering, setOrdering, page, setPage, data, cargando };
}

function BarraPaginacion({ page, setPage, count, pageSize = 50 }) {
    const totalPaginas = Math.max(1, Math.ceil(count / pageSize));
    if (totalPaginas <= 1) return null;
    return (
        <div className="pagination-bar">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
            <span className="page-info">Página {page} de {totalPaginas} — {fmtN(count)} registro(s)</span>
            <button className="page-btn" disabled={page >= totalPaginas} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
        </div>
    );
}

// ─── Drill-down: productos de un formulario (cruce folio + año + tipo) ───────

function ProductosDelFormulario({ folio, anho, formularioTexto }) {
    const [estado, setEstado] = useState('cargando');
    const [productos, setProductos] = useState([]);

    useEffect(() => {
        let activo = true;
        setEstado('cargando');
        const params = { folio, anho };
        const tipo = parseTipoFormulario(formularioTexto);
        if (tipo) params.tipo_formulario = tipo;
        getFormulariosProductos(params)
            .then(({ data }) => {
                if (!activo) return;
                setProductos(data.results ?? data);
                setEstado('listo');
            })
            .catch(() => { if (activo) setEstado('error'); });
        return () => { activo = false; };
    }, [folio, anho, formularioTexto]);

    if (estado === 'cargando') return <div className="loading-spinner-sm">Cargando productos…</div>;
    if (estado === 'error') return <div className="expanded-empty">No fue posible cargar los productos.</div>;
    if (productos.length === 0) return <div className="expanded-empty">Este formulario no registra productos en el carro.</div>;

    return (
        <table className="data-table data-table-sm" style={{ width: '100%' }}>
            <thead>
                <tr>
                    <th style={thStyle}>Categoría</th>
                    <th style={thStyle}>Producto</th>
                    <th style={thStyle}>Descripción</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Cantidad</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Monto</th>
                    <th style={thStyle}>Item Presupuestario</th>
                </tr>
            </thead>
            <tbody>
                {productos.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 10px', fontSize: 12, color: '#374151' }}>{p.categoria || '—'}</td>
                        <td style={{ padding: '7px 10px', fontSize: 12, color: '#374151' }}>{p.producto || '—'}</td>
                        <td style={{ padding: '7px 10px', maxWidth: 260, fontSize: 12, color: '#374151' }}><div className="truncate-text" title={p.descripcion}>{p.descripcion || '—'}</div></td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#374151' }}>{fmtN(p.cantidad)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#374151' }}>{fmtCLP(p.monto)}</td>
                        <td style={{ padding: '7px 10px', fontSize: 12, color: '#374151' }}>{p.item_presupuestario || '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Modal de detalle completo del formulario ("Documento") ──────────────────

function ModalDocumento({ formulario, onCerrar }) {
    if (!formulario) return null;
    const info = ESTADO_FSC_INFO[formulario.estado] || { nombre: formulario.estado || 'Sin estado', color: '#94a3b8' };

    const Campo = ({ label, value, mono, span2 }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...(span2 ? { gridColumn: 'span 2' } : {}) }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ fontSize: 13, color: '#1e293b', fontFamily: mono ? 'monospace' : 'inherit', fontWeight: mono ? 600 : 400 }}>
                {value || '—'}
            </span>
        </div>
    );

    const SeccionTitulo = ({ children }) => (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, paddingBottom: 6, borderBottom: '2px solid #ede9fe' }}>
            {children}
        </div>
    );

    const adjuntos = [
        { key: 'adj_espec_tecnicas',    label: '📎 Espec. Técnicas' },
        { key: 'adj_cotizacion',        label: '📎 Cotización' },
        { key: 'adj_validacion',        label: '📎 Validación' },
        { key: 'adj_form_justificacion',label: '📎 Form. Justificación' },
    ];
    const hayAdjuntos = adjuntos.some(a => formulario[a.key]);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
             onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                                {formulario.id_formulario || `Folio ${formulario.folio}`}
                            </span>
                            <EstadoFSCBadge codigo={formulario.estado} />
                            {formulario.destino_actual && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                    background: '#f5f3ff', border: '1px solid #c4b5fd', color: '#7c3aed',
                                }} title="Persona que actualmente tiene el formulario en su bandeja">
                                    👤 {formulario.destino_actual}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                            {formulario.formulario || 'Formulario de Solicitud de Compra'}
                        </div>
                    </div>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                </div>

                {/* Cuerpo scrollable */}
                <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Bloque: Identificación */}
                    <section>
                        <SeccionTitulo>Identificación</SeccionTitulo>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px' }}>
                            <Campo label="Folio" value={formulario.folio} mono />
                            <Campo label="Año" value={formulario.anho} />
                            <Campo label="Bandeja actual" value={info.nombre} />
                            <Campo label="Fecha Solicitud" value={formulario.fecha_solicitud} />
                            <Campo label="Fecha Entrega" value={formulario.fecha_entrega} />
                            <Campo label="Monto Estimado" value={fmtCLP(formulario.monto_estimado)} />
                            {formulario.destino_actual && <Campo label="Actualmente en bandeja de" value={formulario.destino_actual} span2 />}
                            {formulario.item_presupuestario && <Campo label="Ítem Presupuestario" value={formulario.item_presupuestario} />}
                            {formulario.folio_requerimiento && <Campo label="Folio Requerimiento" value={formulario.folio_requerimiento} mono />}
                        </div>
                    </section>

                    {/* Bloque: Solicitante */}
                    <section>
                        <SeccionTitulo>Solicitante</SeccionTitulo>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 20px' }}>
                            <Campo label="Unidad Requirente" value={formulario.unidad_requirente} />
                            <Campo label="Usuario Requirente" value={formulario.usuario_requirente} />
                            <Campo label="Encargado" value={formulario.encargado} />
                            <Campo label="Jefe" value={formulario.jefe} />
                            <Campo label="Anexo" value={formulario.anexo} />
                            <Campo label="Correo" value={formulario.correo} />
                        </div>
                    </section>

                    {/* Bloque: Nombre de la Compra */}
                    {formulario.requerimiento && (
                        <section>
                            <SeccionTitulo>Nombre de la Compra</SeccionTitulo>
                            <p style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6, margin: 0, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid #16a34a', fontWeight: 500 }}>
                                {formulario.requerimiento}
                            </p>
                        </section>
                    )}

                    {/* Bloque: Objetivo de Compra */}
                    {formulario.objetivo_compra && (
                        <section>
                            <SeccionTitulo>Objetivo de Compra</SeccionTitulo>
                            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                                {formulario.objetivo_compra}
                            </p>
                        </section>
                    )}

                    {/* Bloque: Especificaciones Técnicas */}
                    {formulario.especificaciones_tecnicas && (
                        <section>
                            <SeccionTitulo>Especificaciones Técnicas</SeccionTitulo>
                            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, background: '#f8fafc', borderRadius: 8, padding: '10px 14px', whiteSpace: 'pre-wrap' }}>
                                {formulario.especificaciones_tecnicas}
                            </p>
                        </section>
                    )}

                    {/* Bloque: Plan de Compras */}
                    <section>
                        <SeccionTitulo>Plan de Compras</SeccionTitulo>
                        {formulario.id_plan ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID Plan:</span>
                                <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#16a34a', fontWeight: 700, background: '#f0fdf4', padding: '2px 10px', borderRadius: 6 }}>{formulario.id_plan}</span>
                            </div>
                        ) : (
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 6, display: 'block' }}>Sin ID de Plan — Justificación:</span>
                                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, background: '#fffbeb', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid #f59e0b' }}>
                                    {formulario.justificacion || '—'}
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Bloque: Archivos Adjuntos */}
                    <section>
                        <SeccionTitulo>Archivos Adjuntos</SeccionTitulo>
                        {hayAdjuntos ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                                {adjuntos.map(({ key, label }) => (
                                    formulario[key] ? (
                                        <a
                                            key={key}
                                            href={formulario[key]}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '9px 14px', borderRadius: 8,
                                                background: '#f0f9ff', border: '1px solid #bae6fd',
                                                color: '#0369a1', fontSize: 12, fontWeight: 600,
                                                textDecoration: 'none', transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#e0f2fe'; e.currentTarget.style.borderColor = '#38bdf8'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = '#f0f9ff'; e.currentTarget.style.borderColor = '#bae6fd'; }}
                                        >
                                            {label}
                                        </a>
                                    ) : (
                                        <div key={key} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '9px 14px', borderRadius: 8,
                                            background: '#f8fafc', border: '1px dashed #e2e8f0',
                                            color: '#94a3b8', fontSize: 12,
                                        }}>
                                            {label.replace('📎', '—')}
                                        </div>
                                    )
                                ))}
                            </div>
                        ) : (
                            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Este formulario no tiene archivos adjuntos registrados.</p>
                        )}
                    </section>

                    {/* Bloque: Carro de productos */}
                    <section>
                        <SeccionTitulo>Carro de Productos</SeccionTitulo>
                        <ProductosDelFormulario folio={formulario.folio} anho={formulario.anho} formularioTexto={formulario.formulario} />
                    </section>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Flujo de visación — componente controlado ────────────────────────────────

const PIPELINE_ORDEN = ['P', 'FR', 'FA', 'ASDA', 'ADIR', 'AA', 'DC', 'AC'];

function FlujoVisacion({ anioSeleccionado, estadoSel, onSelectEstado }) {
    const [flujo, setFlujo]       = useState(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getFormulariosFlujo(anioSeleccionado ? { anho: anioSeleccionado } : {})
            .then(({ data }) => { if (activo) setFlujo(data); })
            .catch(() => { if (activo) setFlujo(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anioSeleccionado]);

    // Debe ir antes de los early returns para no violar Rules of Hooks
    const destinosCounts = useMemo(() => {
        if (!flujo || !estadoSel?.length) return [];
        const allForms = [];
        estadoSel.forEach(codigo => {
            const nodo = flujo.estados_pipeline.find(e => e.codigo === codigo);
            if (nodo?.formularios) allForms.push(...nodo.formularios);
            if (codigo === 'R' && flujo.rechazados?.formularios) allForms.push(...flujo.rechazados.formularios);
        });
        const counts = {};
        allForms.forEach(f => {
            const d = f.destino_actual?.trim() || null;
            if (d) counts[d] = (counts[d] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [estadoSel, flujo]);

    if (cargando) return <div className="loading-spinner">Cargando flujo de visación…</div>;
    if (!flujo)   return <div className="loading-spinner">No fue posible cargar el flujo de visación.</div>;

    const nodos = PIPELINE_ORDEN.map(codigo => flujo.estados_pipeline.find(e => e.codigo === codigo)).filter(Boolean);

    return (
        <div className="card">
            <div className="card-header card-header-accent">
                <span>🔁</span>
                <span className="card-title">
                    Línea de flujo de visación
                    <InfoTooltip text={`Recorrido de las solicitudes por las bandejas de visación, desde P · Pendiente Firmas hasta AC · A Comprador. Haz clic en un círculo para filtrar la tabla de solicitudes. Historial disponible desde el ${flujo.historial_disponible_desde}.`} />
                </span>
            </div>
            <div className="flujo-pipeline">
                {nodos.map((nodo, i) => (
                    <React.Fragment key={nodo.codigo}>
                        <button
                            type="button"
                            className={`flujo-nodo ${estadoSel?.includes(nodo.codigo) ? 'activo' : ''}`}
                            style={{ '--nodo-color': ESTADO_FSC_INFO[nodo.codigo]?.color || '#94a3b8' }}
                            onClick={() => {
                                const actual = estadoSel || [];
                                onSelectEstado(actual.includes(nodo.codigo)
                                    ? actual.filter(c => c !== nodo.codigo)
                                    : [...actual, nodo.codigo]);
                            }}
                            title={`${ESTADO_FSC_INFO[nodo.codigo]?.nombre || nodo.nombre} — ${fmtN(nodo.cantidad)} formulario(s)\nClic para filtrar/agregar a filtro`}
                        >
                            <span className="flujo-nodo-circulo">{fmtN(nodo.cantidad)}</span>
                            <span className="flujo-nodo-label">{nodo.codigo}</span>
                        </button>
                        {i < nodos.length - 1 && <span className="flujo-flecha">→</span>}
                    </React.Fragment>
                ))}
                <span className="flujo-flecha flujo-flecha-rama" title="Formularios rechazados en cualquier punto del proceso">↘</span>
                <button
                    type="button"
                    className={`flujo-nodo ${estadoSel?.includes('R') ? 'activo' : ''}`}
                    style={{ '--nodo-color': ESTADO_FSC_INFO.R.color }}
                    onClick={() => {
                        const actual = estadoSel || [];
                        onSelectEstado(actual.includes('R') ? actual.filter(c => c !== 'R') : [...actual, 'R']);
                    }}
                    title={`Rechazados — ${fmtN(flujo.rechazados.cantidad)} formulario(s)\nClic para filtrar/agregar a filtro`}
                >
                    <span className="flujo-nodo-circulo">{fmtN(flujo.rechazados.cantidad)}</span>
                    <span className="flujo-nodo-label">R</span>
                </button>
            </div>
            {estadoSel?.length > 0 ? (
                <>
                    <p style={{ fontSize: 11, color: '#7c3aed', padding: '0 16px 6px', margin: 0, fontWeight: 600 }}>
                        Filtrando por: <strong>{estadoSel.map(c => ESTADO_FSC_INFO[c]?.nombre || c).join(', ')}</strong> — haz clic de nuevo para quitar
                    </p>
                    {destinosCounts.length > 0 && (
                        <div style={{ padding: '6px 16px 14px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7 }}>
                                Actualmente en bandeja de:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {destinosCounts.map(([nombre, n]) => (
                                    <span key={nombre} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '4px 12px', borderRadius: 20,
                                        background: '#f5f3ff', border: '1px solid #ddd6fe',
                                        fontSize: 12, color: '#5b21b6', fontWeight: 500,
                                    }}>
                                        👤 {nombre}
                                        <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 11, marginLeft: 2 }}>({n})</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <p style={{ fontSize: 11, color: '#94a3b8', padding: '0 16px 14px', margin: 0 }}>
                    Haz clic en una bandeja para filtrar. Puedes seleccionar múltiples.
                </p>
            )}
        </div>
    );
}

// ─── Tabla de solicitudes FSC ─────────────────────────────────────────────────

function TablaSolicitudes({ filtroBandeja, onFiltroChange, anioSeleccionado, tablaRef }) {
    const filtros = {
        ...(filtroBandeja?.length ? { estado: filtroBandeja.join(',') } : {}),
        ...(anioSeleccionado ? { anho: anioSeleccionado } : {}),
    };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando } =
        useListaServidor(getFormularios, '-fecha_solicitud', Object.keys(filtros).length ? filtros : null);

    const [modalDoc, setModalDoc] = useState(null);

    return (
        <>
            <ModalDocumento formulario={modalDoc} onCerrar={() => setModalDoc(null)} />

            {/* Buscador */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }} ref={tablaRef}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                    <input
                        style={{
                            width: '100%', padding: '9px 14px 9px 36px',
                            border: '1.5px solid #e2e8f0', borderRadius: 24,
                            fontSize: 13, color: '#1e293b', background: '#f8fafc',
                            outline: 'none', boxSizing: 'border-box',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        placeholder="Buscar por folio, unidad, usuario, requerimiento, especificaciones técnicas…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onFocus={e => { e.target.style.borderColor = '#7c3aed'; e.target.style.boxShadow = '0 0 0 3px #ede9fe'; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                    />
                </div>
                <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', background: '#f1f5f9', padding: '6px 12px', borderRadius: 20, fontWeight: 600 }}>
                    {fmtN(data.count)} solicitud(es)
                </span>
            </div>

            {/* Chips de filtro por bandeja — selección múltiple */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                    Bandeja
                    <InfoTooltip text="Filtra las solicitudes por bandeja de visación. Puedes seleccionar múltiples bandejas a la vez." />
                    :
                </span>
                <FiltroChip activo={!filtroBandeja?.length} onClick={() => onFiltroChange([])}>Todas</FiltroChip>
                {Object.entries(ESTADO_FSC_INFO).map(([codigo, info]) => (
                    <FiltroChip key={codigo} activo={filtroBandeja?.includes(codigo)} color={info.color}
                        onClick={() => {
                            const actual = filtroBandeja || [];
                            onFiltroChange(actual.includes(codigo)
                                ? actual.filter(c => c !== codigo)
                                : [...actual, codigo]);
                        }}>
                        {codigo} · {info.nombre}
                    </FiltroChip>
                ))}
            </div>

            {/* Tabla */}
            <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <SortableTh label="ID / Folio"          campo="folio"              ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Año"                  campo="anho"               ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Fecha Solicitud"      campo="fecha_solicitud"    ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Unidad Requirente"    campo="unidad_requirente"  ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Usuario"              campo="usuario_requirente" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Monto Estimado"       campo="monto_estimado"     ordering={ordering} setOrdering={setOrdering} align="right" />
                            <th style={{ ...thStyle, textAlign: 'center' }} title="Días desde la fecha de solicitud hasta hoy">Días</th>
                            <SortableTh label="Bandeja"              campo="estado"             ordering={ordering} setOrdering={setOrdering} tip="Bandeja de visación actual del formulario" />
                            <SortableTh label="Destino Actual"       campo="destino_actual"     ordering={ordering} setOrdering={setOrdering} tip="Persona que actualmente tiene el formulario en su bandeja" />
                            <th style={{ ...thStyle, textAlign: 'center' }}>Documento</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={10} className="loading-spinner-sm" style={{ textAlign: 'center', padding: 24 }}>Cargando solicitudes…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>No se encontraron solicitudes.</td></tr>
                        ) : data.results.map((f, i) => (
                            <tr key={f.id}
                                style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 0.1s' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}>
                                <td style={{ padding: '8px 10px' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '2px 7px', borderRadius: 5 }}
                                          title="ID generado: tipo de formulario + folio + año">
                                        {f.id_formulario || `#${f.folio}`}
                                    </span>
                                </td>
                                <td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>{f.anho}</td>
                                <td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>{f.fecha_solicitud || '—'}</td>
                                <td style={{ padding: '8px 10px', maxWidth: 220 }}><div className="truncate-text" title={f.unidad_requirente} style={{ fontSize: 13, color: '#374151' }}>{f.unidad_requirente}</div></td>
                                <td style={{ padding: '8px 10px', maxWidth: 160 }}><div className="truncate-text" title={f.usuario_requirente} style={{ fontSize: 13, color: '#374151' }}>{f.usuario_requirente}</div></td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: '#374151', fontWeight: 500 }}>{fmtCLP(f.monto_estimado)}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}><DiasBadge dias={diasDesde(f.fecha_solicitud)} compact /></td>
                                <td style={{ padding: '8px 10px' }}><EstadoFSCBadge codigo={f.estado} /></td>
                                <td style={{ padding: '8px 10px', maxWidth: 160 }}>
                                    {f.destino_actual
                                        ? <div className="truncate-text" title={f.destino_actual} style={{ fontSize: 12, color: '#5b21b6' }}>👤 {f.destino_actual}</div>
                                        : <span style={{ color: '#94a3b8' }}>—</span>
                                    }
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <button
                                        onClick={() => setModalDoc(f)}
                                        title="Ver documento completo"
                                        style={{
                                            padding: '4px 12px', background: '#f5f3ff',
                                            border: '1px solid #c4b5fd', borderRadius: 6,
                                            color: '#7c3aed', fontSize: 11, fontWeight: 600,
                                            cursor: 'pointer', whiteSpace: 'nowrap',
                                            transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.borderColor = '#7c3aed'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = '#c4b5fd'; }}
                                    >
                                        📄 Ver
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <BarraPaginacion page={page} setPage={setPage} count={data.count} />
        </>
    );
}

// ─── Resumen + Gráficos + Tabla (tab unificado) ───────────────────────────────

function ResumenFormularios({ stats, anioSeleccionado, filtroBandeja, onFiltroChange }) {
    const kpis     = stats?.kpis;
    const tablaRef = useRef(null);

    const handleSelectBandeja = useCallback((nuevaBandeja) => {
        onFiltroChange(nuevaBandeja);
        if (nuevaBandeja?.length && tablaRef.current) {
            setTimeout(() => tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
    }, [onFiltroChange]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* KPIs */}
            {kpis && (
                <section className="kpi-grid">
                    <KpiCard
                        title={<>Total Formularios <InfoTooltip text="Cantidad de solicitudes FSC registradas en el sistema, según el filtro de año aplicado." /></>}
                        value={fmtN(kpis.total_formularios)}
                        subtitle="FSC registrados"
                        icon="📋"
                        colorVar="--color-primary"
                    />
                    <KpiCard
                        title={<>Derivados a Comprador <InfoTooltip text="Solicitudes que ya fueron derivadas a un comprador para su gestión de compra (bandeja DC en adelante)." /></>}
                        value={fmtN(kpis.total_derivados)}
                        subtitle={`${kpis.pct_derivados}% del total`}
                        icon="➡️"
                        colorVar="--color-accent"
                    />
                    <KpiCard
                        title={<>Monto Total Estimado <InfoTooltip text="Suma de monto_estimado de todas las solicitudes FSC del filtro actual." /></>}
                        value={fmtCLP(kpis.monto_total_estimado)}
                        subtitle="Suma de solicitudes FSC"
                        icon="💰"
                        colorVar="--color-success"
                    />
                    <KpiCard
                        title={<>Estados de Compra <InfoTooltip text="Cantidad de categorías distintas de estado_compra observadas entre los formularios derivados." /></>}
                        value={fmtN(stats.por_estado_compra?.length ?? 0)}
                        subtitle="Categorías distintas"
                        icon="🏷️"
                        colorVar="--color-warning"
                    />
                </section>
            )}

            {/* Flujo de visación (controlado) */}
            <FlujoVisacion
                anioSeleccionado={anioSeleccionado}
                estadoSel={filtroBandeja}
                onSelectEstado={handleSelectBandeja}
            />

            {/* Tabla de solicitudes (siempre visible, se filtra con el flujo) */}
            <div className="card">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>
                        Solicitudes FSC
                        {filtroBandeja?.length > 0 && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#7c3aed', fontWeight: 400 }}>
                                — filtrando por: <strong>{filtroBandeja.map(c => ESTADO_FSC_INFO[c]?.nombre || c).join(', ')}</strong>
                            </span>
                        )}
                    </span>
                </div>
                <div style={{ padding: '16px 20px' }}>
                    <TablaSolicitudes
                        filtroBandeja={filtroBandeja}
                        onFiltroChange={onFiltroChange}
                        anioSeleccionado={anioSeleccionado}
                        tablaRef={tablaRef}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Tabla de Derivados ───────────────────────────────────────────────────────

const COLORES_ESTADO_COMPRA = ['#0ea5e9', '#7c3aed', '#16a34a', '#f59e0b', '#dc2626', '#0891b2', '#9333ea', '#65a30d'];

function TablaDerivados({ opcionesEstadoCompra, anioSeleccionado }) {
    const [filtroEstadoCompra, setFiltroEstadoCompra] = useState('');
    const filtros = {
        ...(filtroEstadoCompra ? { estado_compra: filtroEstadoCompra } : {}),
        ...(anioSeleccionado ? { anho: anioSeleccionado } : {}),
    };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando } =
        useListaServidor(getFormulariosDerivados, '-fecha_derivado', Object.keys(filtros).length ? filtros : null);
    const [expandido, setExpandido] = useState(null);

    return (
        <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                    <input
                        style={{
                            width: '100%', padding: '9px 14px 9px 36px',
                            border: '1.5px solid #e2e8f0', borderRadius: 24,
                            fontSize: 13, color: '#1e293b', background: '#f8fafc',
                            outline: 'none', boxSizing: 'border-box',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        placeholder="Buscar por folio, unidad, comprador, objetivo de compra…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setExpandido(null); }}
                        onFocus={e => { e.target.style.borderColor = '#7c3aed'; e.target.style.boxShadow = '0 0 0 3px #ede9fe'; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                    />
                </div>
                <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', background: '#f1f5f9', padding: '6px 12px', borderRadius: 20, fontWeight: 600 }}>
                    {fmtN(data.count)} derivado(s)
                </span>
            </div>
            {opcionesEstadoCompra?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                        Estado de compra
                        <InfoTooltip text="Filtra los formularios derivados según el estado de gestión de la compra asignado por el comprador." />
                        :
                    </span>
                    <FiltroChip activo={!filtroEstadoCompra} onClick={() => { setFiltroEstadoCompra(''); setExpandido(null); }}>Todos</FiltroChip>
                    {opcionesEstadoCompra.map((e, i) => (
                        <FiltroChip key={e} activo={filtroEstadoCompra === e} color={COLORES_ESTADO_COMPRA[i % COLORES_ESTADO_COMPRA.length]}
                            onClick={() => { setFiltroEstadoCompra(filtroEstadoCompra === e ? '' : e); setExpandido(null); }}>
                            {e}
                        </FiltroChip>
                    ))}
                </div>
            )}
            <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ ...thStyle, width: 28 }} />
                            <SortableTh label="Folio"             campo="folio"              ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Año"               campo="anho"               ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Fecha Derivado"    campo="fecha_derivado"     ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Unidad Requirente" campo="unidad_requirente"  ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Comprador"         campo="comprador"          ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Monto Estimado"    campo="monto_estimado"     ordering={ordering} setOrdering={setOrdering} align="right" />
                            <SortableTh label="Estado Compra"     campo="estado_compra"      ordering={ordering} setOrdering={setOrdering} />
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }} className="loading-spinner-sm">Cargando derivados…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>No se encontraron derivados.</td></tr>
                        ) : data.results.map((f, i) => {
                            const abierto = expandido === f.id;
                            return (
                                <React.Fragment key={f.id}>
                                    <tr className={`main-row ${abierto ? 'expanded' : ''}`}
                                        style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = abierto ? '#f5f3ff' : (i % 2 === 0 ? '#fff' : '#fafafa')}
                                        onClick={() => setExpandido(abierto ? null : f.id)}>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 12 }}>{abierto ? '▾' : '▸'}</td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '2px 7px', borderRadius: 5 }}>
                                                {f.id_formulario || `#${f.folio}`}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>{f.anho}</td>
                                        <td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>{f.fecha_derivado || '—'}</td>
                                        <td style={{ padding: '8px 10px', maxWidth: 220 }}><div className="truncate-text" title={f.unidad_requirente} style={{ fontSize: 13, color: '#374151' }}>{f.unidad_requirente}</div></td>
                                        <td style={{ padding: '8px 10px', maxWidth: 160 }}><div className="truncate-text" title={f.comprador} style={{ fontSize: 13, color: '#374151' }}>{f.comprador || '—'}</div></td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: '#374151', fontWeight: 500 }}>{fmtCLP(f.monto_estimado)}</td>
                                        <td style={{ padding: '8px 10px' }}>
                                            {f.estado_compra ? (
                                                <span style={{
                                                    display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                                                    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                                                    background: COLORES_ESTADO_COMPRA[Math.max(0, opcionesEstadoCompra.indexOf(f.estado_compra)) % COLORES_ESTADO_COMPRA.length] + '20',
                                                    color: COLORES_ESTADO_COMPRA[Math.max(0, opcionesEstadoCompra.indexOf(f.estado_compra)) % COLORES_ESTADO_COMPRA.length],
                                                    border: `1px solid ${COLORES_ESTADO_COMPRA[Math.max(0, opcionesEstadoCompra.indexOf(f.estado_compra)) % COLORES_ESTADO_COMPRA.length]}50`,
                                                }}>
                                                    {f.estado_compra}
                                                </span>
                                            ) : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                    </tr>
                                    {abierto && (
                                        <tr className="expanded-section-row">
                                            <td colSpan={8}>
                                                <div className="expanded-section">
                                                    <div className="expanded-section-title">🛒 Productos del carro — {f.id_formulario || `Folio ${f.folio}`}</div>
                                                    <ProductosDelFormulario folio={f.folio} anho={f.anho} formularioTexto={f.formulario} />
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <BarraPaginacion page={page} setPage={setPage} count={data.count} />
        </>
    );
}

// ─── Panel lateral de cambios post-sync ──────────────────────────────────────

const TABS_DIFF = [
    { id: 'nuevos',          label: 'Nuevos',           icono: '🆕', key: 'nuevos_count' },
    { id: 'cambiaron_estado',label: 'Cambiaron Estado', icono: '🔄', key: 'cambiaron_estado_count' },
    { id: 'derivados_nuevos',label: 'Derivados Nuevos', icono: '➡️', key: 'derivados_nuevos_count' },
    { id: 'pegados',         label: 'Pegados >10 días', icono: '⏰', key: 'pegados_count' },
];

function PanelCambiosFSC({ diff, onCerrar }) {
    const [tabActivo, setTabActivo] = useState('nuevos');
    if (!diff) return null;

    const thP = { padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' };
    const tdP = { padding: '7px 10px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' };

    const filas = diff[tabActivo] || [];
    const hayDatos = filas.length > 0;

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 680, zIndex: 1300,
            background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', borderLeft: '3px solid #7c3aed',
        }}>
            {/* Header */}
            <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📊 Resumen de Sincronización FSC</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Cambios detectados en esta actualización</div>
                </div>
                <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
            </div>

            {/* Contadores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, padding: '14px 24px', borderBottom: '1px solid #f1f5f9' }}>
                {TABS_DIFF.map(t => (
                    <button key={t.id} onClick={() => setTabActivo(t.id)} style={{
                        padding: '10px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                        border: tabActivo === t.id ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                        background: tabActivo === t.id ? '#f5f3ff' : '#fff',
                        transition: 'all 0.15s',
                    }}>
                        <div style={{ fontSize: 18 }}>{t.icono}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: tabActivo === t.id ? '#7c3aed' : '#1e293b' }}>{fmtN(diff[t.key] || 0)}</div>
                        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>{t.label}</div>
                    </button>
                ))}
            </div>

            {/* Tabla de resultados */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
                {!hayDatos ? (
                    <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        Sin registros en esta categoría para esta sincronización.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thP}>Folio</th>
                                {tabActivo === 'cambiaron_estado' && <th style={thP}>Estado Anterior</th>}
                                <th style={thP}>{tabActivo === 'cambiaron_estado' ? 'Estado Nuevo' : 'Bandeja'}</th>
                                <th style={thP}>Unidad Requirente</th>
                                {tabActivo === 'pegados' && <th style={{ ...thP, textAlign: 'center' }}>Días</th>}
                                <th style={{ ...thP, textAlign: 'right' }}>Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ ...tdP, fontFamily: 'monospace', fontWeight: 600, color: '#7c3aed' }}>
                                        #{f.folio}
                                    </td>
                                    {tabActivo === 'cambiaron_estado' && (
                                        <td style={tdP}><EstadoFSCBadge codigo={f.estado_anterior} /></td>
                                    )}
                                    <td style={tdP}><EstadoFSCBadge codigo={tabActivo === 'cambiaron_estado' ? f.estado : f.estado} /></td>
                                    <td style={{ ...tdP, maxWidth: 200 }}>
                                        <div className="truncate-text" title={f.unidad_requirente} style={{ fontSize: 12 }}>{f.unidad_requirente || '—'}</div>
                                    </td>
                                    {tabActivo === 'pegados' && (
                                        <td style={{ ...tdP, textAlign: 'center' }}>
                                            <DiasBadge dias={f.dias} />
                                        </td>
                                    )}
                                    <td style={{ ...tdP, textAlign: 'right', fontWeight: 500 }}>{fmtCLP(f.monto_estimado)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onCerrar} style={{ padding: '8px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Cerrar
                </button>
            </div>
        </div>
    );
}


// ─── Tabs principales ─────────────────────────────────────────────────────────

const TABS = [
    { id: 'solicitudes', label: 'Solicitudes (FSC)',     icono: '📝' },
    { id: 'derivados',   label: 'Derivados a Comprador', icono: '➡️' },
    { id: 'productos',   label: 'Carro de Productos',    icono: '🛒' },
    { id: 'alertas',     label: 'Alertas / Demoras',     icono: '⏰' },
];

// ─── Tab Alertas / Demoras ────────────────────────────────────────────────────

const UMBRALES = [5, 10, 15, 30];
const COLORES_UMBRAL = { 5: '#f59e0b', 10: '#f97316', 15: '#ef4444', 30: '#991b1b' };

function TabAlertas({ anioSeleccionado }) {
    const [diasMin, setDiasMin] = useState(10);
    const [datos, setDatos] = useState([]);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        const params = { dias_min: diasMin };
        if (anioSeleccionado) params.anho = anioSeleccionado;
        getFormulariosAlertas(params)
            .then(({ data }) => { if (activo) setDatos(data.results ?? data); })
            .catch(() => { if (activo) setDatos([]); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [diasMin, anioSeleccionado]);

    const exportarExcel = () => {
        if (!datos.length) return;
        const wb = XLSX.utils.book_new();
        const filas = datos.map(f => ({
            'ID Formulario': `F${f.folio}-${f.anho}`,
            'Folio': f.folio,
            'Año': f.anho,
            'Fecha Solicitud': f.fecha_solicitud,
            'Días en Sistema': f.dias,
            'Bandeja Actual': ESTADO_FSC_INFO[f.estado]?.nombre || f.estado || '—',
            'Unidad Requirente': f.unidad_requirente || '—',
            'Usuario Requirente': f.usuario_requirente || '—',
            'Monto Estimado': f.monto_estimado || 0,
            'Requerimiento': f.requerimiento || '—',
        }));
        const ws = XLSX.utils.json_to_sheet(filas);
        ws['!cols'] = [10,8,6,14,12,22,30,25,14,40].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'Alertas FSC');
        XLSX.writeFile(wb, `alertas_fsc_>${diasMin}dias_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const resumen = useMemo(() => {
        const por_bandeja = {};
        datos.forEach(f => {
            const b = f.estado || 'Sin estado';
            por_bandeja[b] = (por_bandeja[b] || 0) + 1;
        });
        return por_bandeja;
    }, [datos]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Controles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Mostrar FSC con más de:</span>
                {UMBRALES.map(u => (
                    <FiltroChip key={u} activo={diasMin === u} color={COLORES_UMBRAL[u]}
                        onClick={() => setDiasMin(u)}>
                        {u} días
                    </FiltroChip>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '6px 12px', borderRadius: 20 }}>
                    {fmtN(datos.length)} formulario(s) con alerta
                </span>
                <button onClick={exportarExcel} disabled={!datos.length || cargando}
                    style={{
                        padding: '7px 14px', background: '#16a34a', color: '#fff',
                        border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        cursor: datos.length ? 'pointer' : 'not-allowed',
                        opacity: datos.length ? 1 : 0.5, whiteSpace: 'nowrap',
                    }}>
                    📥 Exportar Excel
                </button>
            </div>

            {/* Resumen por bandeja */}
            {!cargando && Object.keys(resumen).length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(resumen).sort((a,b) => b[1]-a[1]).map(([est, cnt]) => {
                        const info = ESTADO_FSC_INFO[est] || { nombre: est, color: '#94a3b8' };
                        return (
                            <span key={est} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                background: info.color + '15', color: info.color, border: `1px solid ${info.color}40`,
                            }}>
                                {est} · {info.nombre} — {cnt}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Tabla */}
            <div className="card">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Folio</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Días</th>
                                <th style={thStyle}>Bandeja</th>
                                <th style={thStyle}>Unidad Requirente</th>
                                <th style={thStyle}>Usuario</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Monto</th>
                                <th style={thStyle}>Requerimiento</th>
                                <th style={thStyle}>Fecha Solicitud</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }} className="loading-spinner-sm">Cargando alertas…</td></tr>
                            ) : datos.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>
                                    No hay formularios con más de {diasMin} días en bandejas activas.
                                </td></tr>
                            ) : datos.map((f, i) => (
                                <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '7px 10px' }}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '2px 7px', borderRadius: 5 }}>
                                            #{f.folio}
                                        </span>
                                    </td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                        <DiasBadge dias={f.dias} />
                                    </td>
                                    <td style={{ padding: '7px 10px' }}>
                                        <EstadoFSCBadge codigo={f.estado} />
                                    </td>
                                    <td style={{ padding: '7px 10px', maxWidth: 220 }}>
                                        <div className="truncate-text" title={f.unidad_requirente} style={{ fontSize: 12, color: '#374151' }}>{f.unidad_requirente || '—'}</div>
                                    </td>
                                    <td style={{ padding: '7px 10px', maxWidth: 150 }}>
                                        <div className="truncate-text" title={f.usuario_requirente} style={{ fontSize: 12, color: '#374151' }}>{f.usuario_requirente || '—'}</div>
                                    </td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#374151', fontWeight: 500 }}>{fmtCLP(f.monto_estimado)}</td>
                                    <td style={{ padding: '7px 10px', maxWidth: 240 }}>
                                        <div className="truncate-text" title={f.requerimiento} style={{ fontSize: 11, color: '#374151' }}>{f.requerimiento || '—'}</div>
                                    </td>
                                    <td style={{ padding: '7px 10px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{f.fecha_solicitud || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}


// ─── Página principal ─────────────────────────────────────────────────────────

export function FormulariosPage() {
    const [tab, setTab]                   = useState('solicitudes');
    const [stats, setStats]               = useState(null);
    const [filtroBandeja, setFiltroBandeja] = useState([]);
    const [anioGlobal, setAnioGlobal]     = useState(null);

    const [filasProductos, setFilasProductos]       = useState([]);
    const [cargandoProductos, setCargandoProductos] = useState(false);

    const [tarea, setTarea]         = useState(null);
    const [iniciando, setIniciando] = useState(false);
    const [modalAbierto, setModalAbierto] = useState(false);
    const [panelCambios, setPanelCambios] = useState(null);
    const pollingRef                = useRef(null);

    const cargarStats = useCallback(async () => {
        try {
            const { data } = await getFormulariosStats(anioGlobal ? { anho: anioGlobal } : {});
            setStats(data);
        } catch { /* ignorar */ }
    }, [anioGlobal]);

    useEffect(() => { cargarStats(); }, [cargarStats]);

    // Resetear filtro de bandeja al cambiar el año global
    useEffect(() => { setFiltroBandeja([]); }, [anioGlobal]);

    useEffect(() => {
        if (tab !== 'productos') return;
        let activo = true;
        setCargandoProductos(true);
        getFormulariosProductos({ ordering: '-folio' })
            .then(({ data }) => { if (activo) setFilasProductos(data.results ?? data); })
            .catch(() => { if (activo) setFilasProductos([]); })
            .finally(() => { if (activo) setCargandoProductos(false); });
        return () => { activo = false; };
    }, [tab]);

    useEffect(() => () => clearInterval(pollingRef.current), []);

    const iniciarPolling = useCallback((taskId) => {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const { data } = await estadoActualizacionFormularios(taskId);
                setTarea(data);
                if (['completado', 'error', 'cancelado'].includes(data.status)) {
                    clearInterval(pollingRef.current);
                    if (data.status === 'completado') {
                        cargarStats();
                        if (data.diff) setPanelCambios(data.diff);
                    }
                }
            } catch {
                clearInterval(pollingRef.current);
            }
        }, 2000);
    }, [cargarStats]);

    const handleConfirmarCredenciales = async ({ rut, dv, clave }) => {
        setModalAbierto(false);
        if (iniciando) return;
        setIniciando(true);
        try {
            const { data } = await iniciarActualizacionFormularios({ rut, dv, clave });
            setTarea({ status: 'iniciado', task_id: data.task_id, paso: 0, paso_desc: 'Iniciando...', progreso_pct: 0, logs_recientes: [] });
            iniciarPolling(data.task_id);
        } catch (err) {
            alert(err.response?.data?.error || 'Error al iniciar la actualización.');
        } finally {
            setIniciando(false);
        }
    };

    const handleCancelar = async () => {
        if (!tarea?.task_id) return;
        try { await cancelarActualizacionFormularios(tarea.task_id); } catch { /* ignorar */ }
        clearInterval(pollingRef.current);
        setTarea(prev => ({ ...prev, status: 'cancelado', paso_desc: 'Cancelado por el usuario.' }));
    };

    const enProceso             = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';
    const opcionesEstadoCompra  = stats?.por_estado_compra?.map(e => e.estado).filter(Boolean) ?? [];
    const aniosDisponibles      = stats?.anios_disponibles;

    return (
        <div className="feature-page">
            {/* Título + acción */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="page-title"><span className="page-title-icon">📋</span> Formularios FSC</div>
                    <div className="page-subtitle">Formularios Solicitud de Compra — Panel Documental SS Osorno</div>
                </div>
                <button
                    onClick={() => setModalAbierto(true)}
                    disabled={iniciando || enProceso}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 18px',
                        background: enProceso ? '#0369a1' : '#0ea5e9',
                        color: '#fff', border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 600,
                        cursor: (iniciando || enProceso) ? 'not-allowed' : 'pointer',
                        opacity: iniciando ? 0.7 : 1, whiteSpace: 'nowrap',
                    }}
                >
                    {enProceso ? '⚙️ Actualizando...' : '🔄 Actualizar desde Panel'}
                </button>
            </div>

            {/* Filtros globales */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0 18px' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                    Filtros
                    <InfoTooltip text="El año seleccionado se aplica a los indicadores, al flujo de visación y a los listados de Solicitudes y Derivados." />
                    :
                </span>
                <span style={{ fontSize: 12, color: '#64748b' }}>📅 Año</span>
                <select className="filtro-select" value={anioGlobal || ''} onChange={e => setAnioGlobal(e.target.value || null)}>
                    <option value="">Todos los años</option>
                    {aniosDisponibles?.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            {/* Tabs principales */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid #e5e7eb' }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`tab-btn ${tab === t.id ? 'active' : ''}`}>
                        <span style={{ marginRight: 6 }}>{t.icono}</span>{t.label}
                    </button>
                ))}
            </div>

            {tab === 'solicitudes' && (
                <ResumenFormularios
                    stats={stats}
                    anioSeleccionado={anioGlobal}
                    filtroBandeja={filtroBandeja}
                    onFiltroChange={setFiltroBandeja}
                />
            )}

            {tab === 'derivados' && (
                <div className="card">
                    <TablaDerivados opcionesEstadoCompra={opcionesEstadoCompra} anioSeleccionado={anioGlobal} />
                </div>
            )}

            {tab === 'productos' && (
                <div className="card">
                    {cargandoProductos ? (
                        <div className="loading-spinner">Cargando datos...</div>
                    ) : (
                        <TablaFormularios columnas={COLS_PRODUCTOS} filas={filasProductos} vacio={filasProductos.length === 0} />
                    )}
                </div>
            )}

            {tab === 'alertas' && (
                <TabAlertas anioSeleccionado={anioGlobal} />
            )}

            {modalAbierto && (
                <ModalCredenciales onConfirmar={handleConfirmarCredenciales} onCerrar={() => setModalAbierto(false)} />
            )}

            {panelCambios && (
                <PanelCambiosFSC diff={panelCambios} onCerrar={() => setPanelCambios(null)} />
            )}

            <BannerFormularios
                tarea={tarea}
                onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }}
                onCancelar={handleCancelar}
            />
        </div>
    );
}
