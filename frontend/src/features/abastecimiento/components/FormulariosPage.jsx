import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    getFormulariosStats, getFormulariosFlujo,
    getFormularios, getFormulariosDerivados, getFormulariosProductos,
    iniciarActualizacionFormularios, estadoActualizacionFormularios, cancelarActualizacionFormularios,
} from '../api/formulariosApi';
import { KpiCard } from './KpiCard';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const RE_TIPO_FORMULARIO = /Nro\s*(\d+)/i;
const parseTipoFormulario = (texto) => {
    const m = texto?.match(RE_TIPO_FORMULARIO);
    return m ? Number(m[1]) : null;
};

// ─── Bandejas de visación FSC ─────────────────────────────────────────────────
// Mismo orden y nombres que PIPELINE_ESTADOS_FSC en backend/api/services.py

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

function EstadoFSCBadge({ codigo }) {
    const info = ESTADO_FSC_INFO[codigo] || { nombre: codigo || 'Sin estado', color: '#94a3b8' };
    return <span className="estado-badge" style={{ background: info.color }} title={info.nombre}>{codigo || '—'}</span>;
}

// ─── Tooltip informativo (mismo patrón que TabFinanciero) ────────────────────

function InfoTooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            <span style={{ cursor: 'help', color: '#94a3b8', fontSize: 12, marginLeft: 4 }}>ⓘ</span>
            {show && (
                <span style={{
                    position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#f8fafc', fontSize: 11, padding: '7px 11px',
                    borderRadius: 7, whiteSpace: 'pre-wrap', minWidth: 200, maxWidth: 300,
                    width: 'max-content', textAlign: 'left', zIndex: 200, lineHeight: 1.7,
                    boxShadow: '0 6px 20px rgba(0,0,0,.28)', pointerEvents: 'none',
                }}>
                    {text}
                </span>
            )}
        </span>
    );
}

// ─── Chip de filtro rápido (mismo patrón que TabFinanciero) ──────────────────

function FiltroChip({ activo, color, bg, onClick, children }) {
    return (
        <button onClick={onClick} style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11,
            fontWeight: activo ? 700 : 400,
            border: activo ? `2px solid ${color || '#7c3aed'}` : '1px solid #e2e8f0',
            background: activo ? (bg || (color ? `${color}15` : '#ede9fe')) : '#fff',
            color: activo ? (color || '#7c3aed') : '#64748b',
            cursor: 'pointer',
        }}>
            {children}
        </button>
    );
}

// ─── Sub-tab estilo "Resumen & Gráficos" / "Tabla Detalle" (TabFinanciero) ───

function SubTabBtn({ activo, onClick, children }) {
    return (
        <button onClick={onClick} style={{
            padding: '10px 18px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 12,
            fontWeight: activo ? 700 : 400,
            color: activo ? '#7c3aed' : '#64748b',
            borderBottom: activo ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom: -2,
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
                            <th key={c.key} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f, i) => (
                        <tr key={f.id ?? i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            {columnas.map(c => (
                                <td key={c.key} style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
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

// ─── Encabezado de columna ordenable (server-side, vía ?ordering=) ───────────

function SortableTh({ label, campo, ordering, setOrdering, align, title }) {
    const asc = ordering === campo;
    const desc = ordering === `-${campo}`;
    const activo = asc || desc;
    const alternar = () => setOrdering(asc ? `-${campo}` : campo);
    return (
        <th className="sortable-th" style={{ textAlign: align || 'left' }} onClick={alternar} title={title || `Ordenar por ${label}`}>
            {label}
            <span style={{ marginLeft: 4, color: activo ? '#1d4ed8' : '#cbd5e1', fontSize: 10 }}>
                {desc ? '▼' : asc ? '▲' : '↕'}
            </span>
        </th>
    );
}

// ─── Hook genérico: tabla con búsqueda + orden + paginación server-side ──────

function useListaServidor(fetcher, ordenInicial, filtros) {
    const [search, setSearch] = useState('');
    const [ordering, setOrdering] = useState(ordenInicial);
    const [page, setPage] = useState(1);
    const [data, setData] = useState({ results: [], count: 0 });
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
    if (estado === 'error') return <div className="expanded-empty">No fue posible cargar los productos de este formulario.</div>;
    if (productos.length === 0) return <div className="expanded-empty">Este formulario no registra productos en el carro.</div>;

    return (
        <table className="data-table data-table-sm" style={{ width: '100%' }}>
            <thead>
                <tr>
                    <th>Categoría</th><th>Producto</th><th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th>Item Presupuestario</th>
                </tr>
            </thead>
            <tbody>
                {productos.map(p => (
                    <tr key={p.id}>
                        <td>{p.categoria || '—'}</td>
                        <td>{p.producto || '—'}</td>
                        <td style={{ maxWidth: 260 }}><div className="truncate-text" title={p.descripcion}>{p.descripcion || '—'}</div></td>
                        <td style={{ textAlign: 'right' }}>{fmtN(p.cantidad)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCLP(p.monto)}</td>
                        <td>{p.item_presupuestario || '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Sub-tab "Flujo de Visación" — pipeline circular P → AC ──────────────────

const PIPELINE_ORDEN = ['P', 'FR', 'FA', 'ASDA', 'ADIR', 'AA', 'DC', 'AC'];

function PanelDetalleEstado({ nodo }) {
    if (!nodo) return null;
    const info = ESTADO_FSC_INFO[nodo.codigo] || { nombre: nodo.nombre, color: '#94a3b8' };
    return (
        <div className="card flujo-detalle">
            <div className="card-header card-header-accent">
                <span className="estado-dot" style={{ background: info.color }} />
                <span className="card-title">{info.nombre} ({nodo.codigo}) — {fmtN(nodo.cantidad)} formulario(s)</span>
            </div>
            {nodo.formularios.length === 0 ? (
                <div className="expanded-empty" style={{ padding: 16 }}>No hay formularios actualmente en esta bandeja.</div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table data-table-sm" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>ID Formulario</th>
                                <th>Folio / Año</th>
                                <th>Unidad Requirente</th>
                                <th>Usuario</th>
                                <th>Fecha Solicitud</th>
                                <th style={{ textAlign: 'right' }}>Monto Estimado</th>
                                <th title="Días corridos desde la fecha de solicitud hasta hoy">Días en trámite</th>
                                <th title="Días desde que el formulario llegó a esta bandeja (historial disponible desde 2026-06-08)">Días en bandeja actual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nodo.formularios.map(f => (
                                <tr key={f.id}>
                                    <td><span className="codigo-badge">{f.id_formulario || '—'}</span></td>
                                    <td>{f.folio} / {f.anho}</td>
                                    <td style={{ maxWidth: 220 }}><div className="truncate-text" title={f.unidad_requirente}>{f.unidad_requirente}</div></td>
                                    <td style={{ maxWidth: 180 }}><div className="truncate-text" title={f.usuario_requirente}>{f.usuario_requirente}</div></td>
                                    <td>{f.fecha_solicitud || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{fmtCLP(f.monto_estimado)}</td>
                                    <td>{f.dias_en_tramite ?? '—'}{f.dias_en_tramite != null ? ' d' : ''}</td>
                                    <td>{f.dias_en_estado_actual ?? '—'}{f.dias_en_estado_actual != null ? ' d' : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function ResumenFormularios({ stats, anioSeleccionado }) {
    const kpis = stats?.kpis;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
            <FlujoVisacion anioSeleccionado={anioSeleccionado} />
        </div>
    );
}

function FlujoVisacion({ anioSeleccionado }) {
    const [flujo, setFlujo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [estadoSel, setEstadoSel] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setEstadoSel(null);
        getFormulariosFlujo(anioSeleccionado ? { anho: anioSeleccionado } : {})
            .then(({ data }) => { if (activo) setFlujo(data); })
            .catch(() => { if (activo) setFlujo(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anioSeleccionado]);

    if (cargando) return <div className="loading-spinner">Cargando flujo de visación…</div>;
    if (!flujo) return <div className="loading-spinner">No fue posible cargar el flujo de visación.</div>;

    const nodos = PIPELINE_ORDEN.map(codigo => flujo.estados_pipeline.find(e => e.codigo === codigo)).filter(Boolean);
    const nodoSel = estadoSel === 'R'
        ? { codigo: 'R', nombre: 'Rechazados', cantidad: flujo.rechazados.cantidad, formularios: flujo.rechazados.formularios }
        : nodos.find(n => n.codigo === estadoSel) || null;

    return (
        <div>
            <div className="card">
                <div className="card-header card-header-accent">
                    <span>🔁</span>
                    <span className="card-title">
                        Línea de flujo de visación
                        <InfoTooltip text={`Recorrido de las solicitudes por las bandejas de visación, desde P · Pendiente Firmas hasta AC · A Comprador.\nHaz clic en un círculo para ver el detalle de los formularios que se encuentran ahí y cuántos días llevan en esa bandeja.\nHistorial de avance disponible desde el ${flujo.historial_disponible_desde}.`} />
                    </span>
                </div>
                <div className="flujo-pipeline">
                    {nodos.map((nodo, i) => (
                        <React.Fragment key={nodo.codigo}>
                            <button
                                type="button"
                                className={`flujo-nodo ${estadoSel === nodo.codigo ? 'activo' : ''}`}
                                style={{ '--nodo-color': ESTADO_FSC_INFO[nodo.codigo]?.color || '#94a3b8' }}
                                onClick={() => setEstadoSel(prev => prev === nodo.codigo ? null : nodo.codigo)}
                                title={`${ESTADO_FSC_INFO[nodo.codigo]?.nombre || nodo.nombre} — ${fmtN(nodo.cantidad)} formulario(s)`}
                            >
                                <span className="flujo-nodo-circulo">{fmtN(nodo.cantidad)}</span>
                                <span className="flujo-nodo-label">{nodo.codigo}</span>
                            </button>
                            {i < nodos.length - 1 && <span className="flujo-flecha">→</span>}
                        </React.Fragment>
                    ))}
                    <span className="flujo-flecha flujo-flecha-rama" title="Formularios rechazados en cualquier punto del proceso">⤵</span>
                    <button
                        type="button"
                        className={`flujo-nodo ${estadoSel === 'R' ? 'activo' : ''}`}
                        style={{ '--nodo-color': ESTADO_FSC_INFO.R.color }}
                        onClick={() => setEstadoSel(prev => prev === 'R' ? null : 'R')}
                        title={`Rechazados — ${fmtN(flujo.rechazados.cantidad)} formulario(s)`}
                    >
                        <span className="flujo-nodo-circulo">{fmtN(flujo.rechazados.cantidad)}</span>
                        <span className="flujo-nodo-label">R</span>
                    </button>
                </div>
                <p style={{ fontSize: 11, color: '#94a3b8', padding: '0 16px 14px', margin: 0 }}>
                    Los círculos se muestran en tamaño uniforme — el número dentro de cada uno indica la cantidad real de formularios,
                    sin que las bandejas con más volumen (p.ej. "AC") distorsionen la lectura del diagrama.
                </p>
            </div>

            {nodoSel && <PanelDetalleEstado nodo={nodoSel} />}
        </div>
    );
}

// ─── Sub-tab "Listado" — tabla de Solicitudes con búsqueda/orden/drill-down ──

function TablaSolicitudes({ filtroEstado, setFiltroEstado, anioSeleccionado }) {
    const filtros = { ...(filtroEstado ? { estado: filtroEstado } : {}), ...(anioSeleccionado ? { anho: anioSeleccionado } : {}) };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando } =
        useListaServidor(getFormularios, '-fecha_solicitud', Object.keys(filtros).length ? filtros : null);
    const [expandido, setExpandido] = useState(null);

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                        className="search-input"
                        placeholder="🔍 Buscar por folio, unidad, usuario, objetivo de compra…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setExpandido(null); }}
                        style={{ flex: 1 }}
                    />
                    <span className="result-count">{fmtN(data.count)} solicitud(es)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                        Bandeja
                        <InfoTooltip text="Filtra las solicitudes por la bandeja de visación donde se encuentran actualmente." />
                        :
                    </span>
                    <FiltroChip activo={!filtroEstado} onClick={() => { setFiltroEstado(''); setExpandido(null); }}>Todas</FiltroChip>
                    {Object.entries(ESTADO_FSC_INFO).filter(([c]) => c !== 'R').map(([codigo, info]) => (
                        <FiltroChip key={codigo} activo={filtroEstado === codigo} color={info.color}
                            onClick={() => { setFiltroEstado(filtroEstado === codigo ? '' : codigo); setExpandido(null); }}>
                            {codigo} · {info.nombre}
                        </FiltroChip>
                    ))}
                </div>
            </div>
            <div className="table-scroll">
                <table className="data-table sortable" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ width: 28 }} />
                            <SortableTh label="Folio"             campo="folio"             ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Año"               campo="anho"              ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Fecha Solicitud"   campo="fecha_solicitud"   ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Unidad Requirente" campo="unidad_requirente" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Usuario"           campo="usuario_requirente" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Monto Estimado"    campo="monto_estimado"    ordering={ordering} setOrdering={setOrdering} align="right" />
                            <SortableTh label="Bandeja"           campo="estado"            ordering={ordering} setOrdering={setOrdering} title="Bandeja de visación actual" />
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={8} className="loading-spinner-sm">Cargando solicitudes…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No se encontraron solicitudes.</td></tr>
                        ) : data.results.map(f => {
                            const abierto = expandido === f.id;
                            return (
                                <React.Fragment key={f.id}>
                                    <tr className={`main-row ${abierto ? 'expanded' : ''}`} onClick={() => setExpandido(abierto ? null : f.id)}>
                                        <td className="expand-btn">{abierto ? '▾' : '▸'}</td>
                                        <td><span className="codigo-badge" title="ID generado: tipo de formulario + folio + año">{f.id_formulario || `#${f.folio}`}</span></td>
                                        <td>{f.anho}</td>
                                        <td>{f.fecha_solicitud || '—'}</td>
                                        <td style={{ maxWidth: 220 }}><div className="truncate-text" title={f.unidad_requirente}>{f.unidad_requirente}</div></td>
                                        <td style={{ maxWidth: 160 }}><div className="truncate-text" title={f.usuario_requirente}>{f.usuario_requirente}</div></td>
                                        <td style={{ textAlign: 'right' }}>{fmtCLP(f.monto_estimado)}</td>
                                        <td><EstadoFSCBadge codigo={f.estado} /></td>
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

// ─── Tabla de Derivados — mismo patrón de búsqueda/orden/drill-down ──────────

const COLORES_ESTADO_COMPRA = ['#0ea5e9', '#7c3aed', '#16a34a', '#f59e0b', '#dc2626', '#0891b2', '#9333ea', '#65a30d'];

function TablaDerivados({ opcionesEstadoCompra, anioSeleccionado }) {
    const [filtroEstadoCompra, setFiltroEstadoCompra] = useState('');
    const filtros = { ...(filtroEstadoCompra ? { estado_compra: filtroEstadoCompra } : {}), ...(anioSeleccionado ? { anho: anioSeleccionado } : {}) };
    const { search, setSearch, ordering, setOrdering, page, setPage, data, cargando } =
        useListaServidor(getFormulariosDerivados, '-fecha_derivado', Object.keys(filtros).length ? filtros : null);
    const [expandido, setExpandido] = useState(null);

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                        className="search-input"
                        placeholder="🔍 Buscar por folio, unidad, comprador, objetivo de compra…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setExpandido(null); }}
                        style={{ flex: 1 }}
                    />
                    <span className="result-count">{fmtN(data.count)} derivado(s)</span>
                </div>
                {opcionesEstadoCompra?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            </div>
            <div className="table-scroll">
                <table className="data-table sortable" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ width: 28 }} />
                            <SortableTh label="Folio"             campo="folio"             ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Año"               campo="anho"              ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Fecha Derivado"    campo="fecha_derivado"    ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Unidad Requirente" campo="unidad_requirente" ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Comprador"         campo="comprador"         ordering={ordering} setOrdering={setOrdering} />
                            <SortableTh label="Monto Estimado"    campo="monto_estimado"    ordering={ordering} setOrdering={setOrdering} align="right" />
                            <SortableTh label="Estado Compra"     campo="estado_compra"     ordering={ordering} setOrdering={setOrdering} />
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={8} className="loading-spinner-sm">Cargando derivados…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No se encontraron derivados.</td></tr>
                        ) : data.results.map(f => {
                            const abierto = expandido === f.id;
                            return (
                                <React.Fragment key={f.id}>
                                    <tr className={`main-row ${abierto ? 'expanded' : ''}`} onClick={() => setExpandido(abierto ? null : f.id)}>
                                        <td className="expand-btn">{abierto ? '▾' : '▸'}</td>
                                        <td><span className="codigo-badge" title="ID generado: tipo de formulario + folio + año">{f.id_formulario || `#${f.folio}`}</span></td>
                                        <td>{f.anho}</td>
                                        <td>{f.fecha_derivado || '—'}</td>
                                        <td style={{ maxWidth: 220 }}><div className="truncate-text" title={f.unidad_requirente}>{f.unidad_requirente}</div></td>
                                        <td style={{ maxWidth: 160 }}><div className="truncate-text" title={f.comprador}>{f.comprador || '—'}</div></td>
                                        <td style={{ textAlign: 'right' }}>{fmtCLP(f.monto_estimado)}</td>
                                        <td>{f.estado_compra
                                            ? <span className="estado-badge" style={{ background: COLORES_ESTADO_COMPRA[Math.max(0, opcionesEstadoCompra.indexOf(f.estado_compra)) % COLORES_ESTADO_COMPRA.length] }}>{f.estado_compra}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
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

// ─── Definición de tabs principales ──────────────────────────────────────────

const TABS = [
    { id: 'solicitudes', label: 'Solicitudes (FSC)', icono: '📝' },
    { id: 'derivados',   label: 'Derivados a Comprador', icono: '➡️' },
    { id: 'productos',   label: 'Carro de Productos', icono: '🛒' },
];

// Mismo formato de sub-tabs que Contratos SSO › Seg. Financiero (📊 Resumen & Gráficos | 📋 Tabla Detalle)
const SUBTABS_SOLICITUDES = [
    { id: 'resumen', label: '📊 Resumen & Gráficos' },
    { id: 'detalle', label: '📋 Tabla Detalle' },
];

// ─── Página principal ─────────────────────────────────────────────────────────

export function FormulariosPage() {
    const [tab, setTab]                 = useState('solicitudes');
    const [subTab, setSubTab]           = useState('resumen');
    const [stats, setStats]             = useState(null);
    const [filtroEstado, setFiltroEstado] = useState('');
    const [anioGlobal, setAnioGlobal]   = useState(null);

    const [filasProductos, setFilasProductos] = useState([]);
    const [cargandoProductos, setCargandoProductos] = useState(false);

    const [tarea, setTarea]             = useState(null);
    const [iniciando, setIniciando]     = useState(false);
    const [modalAbierto, setModalAbierto] = useState(false);
    const pollingRef                    = useRef(null);

    const cargarStats = useCallback(async () => {
        try {
            const { data } = await getFormulariosStats(anioGlobal ? { anho: anioGlobal } : {});
            setStats(data);
        } catch { /* ignorar */ }
    }, [anioGlobal]);

    useEffect(() => { cargarStats(); }, [cargarStats]);

    // El tab "Carro de Productos" mantiene su tabla simple original
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
                    if (data.status === 'completado') cargarStats();
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

    const enProceso = tarea?.status === 'iniciado' || tarea?.status === 'en_proceso';
    const opcionesEstadoCompra = stats?.por_estado_compra?.map(e => e.estado).filter(Boolean) ?? [];
    const aniosDisponibles = stats?.anios_disponibles;

    return (
        <div className="feature-page">
            {/* ── Título + acción de actualización ── */}
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

            {/* ── Filtros globales (afectan KPIs, flujo, listados y derivados) ── */}
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

            {/* ── Tabs principales ── */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid #e5e7eb' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`tab-btn ${tab === t.id ? 'active' : ''}`}
                    >
                        <span style={{ marginRight: 6 }}>{t.icono}</span>{t.label}
                    </button>
                ))}
            </div>

            {tab === 'solicitudes' && (
                <>
                    {/* ── Sub-tabs estilo Contratos SSO › Seg. Financiero ── */}
                    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
                        {SUBTABS_SOLICITUDES.map(st => (
                            <SubTabBtn key={st.id} activo={subTab === st.id} onClick={() => setSubTab(st.id)}>
                                {st.label}
                            </SubTabBtn>
                        ))}
                    </div>

                    {subTab === 'resumen' ? (
                        <ResumenFormularios stats={stats} anioSeleccionado={anioGlobal} />
                    ) : (
                        <div className="card">
                            <TablaSolicitudes filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado} anioSeleccionado={anioGlobal} />
                        </div>
                    )}
                </>
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

            {modalAbierto && (
                <ModalCredenciales onConfirmar={handleConfirmarCredenciales} onCerrar={() => setModalAbierto(false)} />
            )}

            <BannerFormularios
                tarea={tarea}
                onCerrar={() => { clearInterval(pollingRef.current); setTarea(null); }}
                onCancelar={handleCancelar}
            />
        </div>
    );
}
