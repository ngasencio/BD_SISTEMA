import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import * as d3 from 'd3';
import {
    getFormulariosStats, getFormulariosFlujo,
    getFormularios, getFormulariosDerivados, getFormulariosProductos,
    getFormulariosAlertas, getFormulariosUnificacion, getFormulariosHistorial,
    getFormularioById,
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
    P:    { nombre: 'Pendiente Firmas',                        color: '#d97706' },
    FR:   { nombre: 'Revisor Finanzas',                        color: '#2563eb' },
    FA:   { nombre: 'Autorizador Finanzas',                    color: '#4f46e5' },
    ASDA: { nombre: 'Autorizador Sub Director Administrativo', color: '#7c3aed' },
    ADIR: { nombre: 'Autorizador Director',                    color: '#a21caf' },
    AA:   { nombre: 'Autorizador Abastecimiento',              color: '#0891b2' },
    DC:   { nombre: 'Derivación Compras',                      color: '#1d4ed8' },
    AC:   { nombre: 'A Comprador',                             color: '#15803d' },
    R:    { nombre: 'Rechazado',                               color: '#b91c1c' },
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
                        <td style={{ padding: '7px 10px', fontSize: 12 }}>
                            {p.item_presupuestario
                                ? <span style={{ color:'#374151' }}>{p.item_presupuestario}</span>
                                : <span style={{ color:'#f97316', fontSize:11, fontWeight:600, background:'#fff7ed', padding:'1px 7px', borderRadius:10, border:'1px solid #fed7aa' }}>⚠️ Sin ítem</span>
                            }
                        </td>
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
    const [imprimiendo, setImprimiendo] = useState(false);

    const handlePrint = async () => {
        setImprimiendo(true);
        let productos = [];
        try {
            const params = { folio: formulario.folio, anho: formulario.anho };
            const tipo = parseTipoFormulario(formulario.formulario);
            if (tipo) params.tipo_formulario = tipo;
            const { data } = await getFormulariosProductos(params);
            productos = data.results ?? data;
        } catch (_) { /* imprimir sin productos */ }

        const fmtMoneda = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
        const fmtNum = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
        const esc = (str) => String(str ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const estadoInfo = ESTADO_FSC_INFO[formulario.estado] || { nombre: formulario.estado || 'Sin estado', color: '#94a3b8' };

        const campo = (label, value, opts = {}) => {
            if (!value && value !== 0) return '';
            return `<div class="campo${opts.span2 ? ' span2' : ''}">
                <label>${esc(label)}</label>
                <span class="valor${opts.mono ? ' mono' : ''}">${esc(String(value))}</span>
            </div>`;
        };

        const adjuntos = [
            { key: 'adj_espec_tecnicas',     label: 'Espec. Técnicas' },
            { key: 'adj_cotizacion',         label: 'Cotización' },
            { key: 'adj_validacion',         label: 'Validación' },
            { key: 'adj_form_justificacion', label: 'Form. Justificación' },
        ];
        const adjHtml = adjuntos.map(({ key, label }) =>
            formulario[key]
                ? `<div class="adj-item adj-ok">&#128206; <a href="${esc(formulario[key])}" target="_blank">${esc(label)}</a></div>`
                : `<div class="adj-item adj-no">&#8212; ${esc(label)}</div>`
        ).join('');

        const productosHtml = productos.length === 0
            ? '<p class="sin-datos">Sin productos registrados en el carro.</p>'
            : `<table>
                <thead><tr>
                    <th>Categoría</th><th>Producto</th><th>Descripción</th>
                    <th class="right">Cantidad</th><th class="right">Monto</th><th>Ítem Presupuestario</th>
                </tr></thead>
                <tbody>
                    ${productos.map(p => `<tr>
                        <td>${esc(p.categoria)}</td>
                        <td>${esc(p.producto)}</td>
                        <td>${esc(p.descripcion)}</td>
                        <td class="right">${fmtNum(p.cantidad)}</td>
                        <td class="right">${fmtMoneda(p.monto)}</td>
                        <td>${esc(p.item_presupuestario)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>`;

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>FSC · ${esc(formulario.id_formulario || `Folio ${formulario.folio}`)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1e293b; margin: 0; }
  /* ─── Cabecera ─── */
  .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 14px; margin-bottom: 18px; }
  .header .org { font-size: 9pt; color: #64748b; margin: 0 0 4px; letter-spacing: 0.04em; text-transform: uppercase; }
  .header h1 { font-size: 15pt; color: #7c3aed; margin: 6px 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
  .header-meta { display: flex; justify-content: center; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  .folio-badge { font-family: monospace; font-size: 14pt; font-weight: 700; color: #7c3aed; background: #ede9fe; border: 2px solid #c4b5fd; padding: 3px 16px; border-radius: 4px; }
  .estado-badge { font-size: 10pt; font-weight: 700; padding: 3px 14px; border-radius: 20px; }
  .destino-badge { font-size: 9.5pt; color: #7c3aed; background: #f5f3ff; border: 1px solid #c4b5fd; padding: 2px 12px; border-radius: 20px; }
  /* ─── Secciones ─── */
  section { margin-bottom: 16px; }
  .section-title { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #7c3aed; border-bottom: 2px solid #ede9fe; padding-bottom: 5px; margin-bottom: 10px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
  .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px; }
  .campo { display: flex; flex-direction: column; gap: 2px; }
  .campo.span2 { grid-column: span 2; }
  .campo label { font-size: 7.5pt; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
  .campo .valor { font-size: 11pt; color: #1e293b; }
  .campo .valor.mono { font-family: monospace; font-weight: 700; }
  /* ─── Bloques de texto ─── */
  p.texto-box { font-size: 10.5pt; color: #374151; line-height: 1.6; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 9px 12px; white-space: pre-wrap; word-break: break-word; margin: 0; }
  p.green-box  { border-left: 3px solid #16a34a; background: #f0fdf4; }
  p.yellow-box { border-left: 3px solid #f59e0b; background: #fffbeb; }
  .plan-id { font-family: monospace; font-size: 12pt; font-weight: 700; color: #15803d; background: #f0fdf4; border: 1px solid #86efac; padding: 3px 12px; border-radius: 4px; display: inline-block; }
  .plan-sin-id-title { font-size: 9pt; color: #f59e0b; font-weight: 700; margin: 0 0 6px; }
  /* ─── Adjuntos ─── */
  .adj-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .adj-item { padding: 7px 12px; border-radius: 6px; font-size: 10pt; }
  .adj-ok { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; }
  .adj-ok a { color: #0369a1; text-decoration: none; }
  .adj-no { background: #f8fafc; border: 1px dashed #e2e8f0; color: #94a3b8; }
  /* ─── Tabla productos ─── */
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  th { background: #7c3aed; color: #fff; padding: 7px 10px; text-align: left; font-size: 8.5pt; font-weight: 700; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #374151; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .right { text-align: right; }
  /* ─── Pie de página ─── */
  .footer-print { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between; }
  .sin-datos { color: #94a3b8; font-size: 10pt; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  <p class="org">Servicio de Salud Osorno — Organismo 7296</p>
  <h1>Formulario de Solicitud de Compra (FSC)</h1>
  <div class="header-meta">
    <span class="folio-badge">${esc(formulario.id_formulario || `Folio ${formulario.folio}`)}</span>
    <span class="estado-badge" style="background:${estadoInfo.color}20;color:${estadoInfo.color};border:1px solid ${estadoInfo.color}50">
      ${esc(formulario.estado || '—')} · ${esc(estadoInfo.nombre)}
    </span>
    ${formulario.destino_actual ? `<span class="destino-badge">👤 ${esc(formulario.destino_actual)}</span>` : ''}
  </div>
</div>

<section>
  <div class="section-title">Identificación</div>
  <div class="grid-3">
    ${campo('Folio', formulario.folio, { mono: true })}
    ${campo('Año', formulario.anho)}
    ${campo('Bandeja Actual', estadoInfo.nombre)}
    ${campo('Fecha Solicitud', formulario.fecha_solicitud)}
    ${campo('Fecha Entrega', formulario.fecha_entrega)}
    ${campo('Monto Estimado', fmtMoneda(formulario.monto_estimado))}
    ${formulario.destino_actual ? campo('Actualmente en bandeja de', formulario.destino_actual, { span2: true }) : ''}
    ${formulario.item_presupuestario ? campo('Ítem Presupuestario', formulario.item_presupuestario) : ''}
    ${formulario.folio_requerimiento ? campo('Folio Requerimiento', formulario.folio_requerimiento, { mono: true }) : ''}
  </div>
</section>

<section>
  <div class="section-title">Solicitante</div>
  <div class="grid-2">
    ${campo('Unidad Requirente', formulario.unidad_requirente)}
    ${campo('Usuario Requirente', formulario.usuario_requirente)}
    ${campo('Encargado', formulario.encargado)}
    ${campo('Jefe', formulario.jefe)}
    ${campo('Anexo', formulario.anexo)}
    ${campo('Correo', formulario.correo)}
  </div>
</section>

${formulario.requerimiento ? `
<section>
  <div class="section-title">Nombre de la Compra</div>
  <p class="texto-box green-box">${esc(formulario.requerimiento)}</p>
</section>` : ''}

${formulario.objetivo_compra ? `
<section>
  <div class="section-title">Objetivo de Compra</div>
  <p class="texto-box">${esc(formulario.objetivo_compra)}</p>
</section>` : ''}

${formulario.especificaciones_tecnicas ? `
<section>
  <div class="section-title">Especificaciones Técnicas</div>
  <p class="texto-box">${esc(formulario.especificaciones_tecnicas)}</p>
</section>` : ''}

<section>
  <div class="section-title">Plan de Compras</div>
  ${formulario.id_plan
    ? `<span class="plan-id">${esc(formulario.id_plan)}</span>`
    : `<p class="plan-sin-id-title">Sin ID de Plan — Justificación:</p>
       <p class="texto-box yellow-box">${esc(formulario.justificacion || '—')}</p>`}
</section>

<section>
  <div class="section-title">Archivos Adjuntos</div>
  <div class="adj-grid">${adjHtml}</div>
</section>

<section>
  <div class="section-title">Carro de Productos</div>
  ${productosHtml}
</section>

<div class="footer-print">
  <span>Servicio de Salud Osorno — Sistema de Gestión BD SSO</span>
  <span>Impreso: ${new Date().toLocaleString('es-CL')}</span>
</div>

</body>
</html>`;

        const win = window.open('', '_blank', 'width=950,height=780');
        if (win) {
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); setImprimiendo(false); }, 600);
        } else {
            setImprimiendo(false);
        }
    };

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
                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={handlePrint}
                        disabled={imprimiendo}
                        style={{
                            padding: '8px 18px', background: imprimiendo ? '#f1f5f9' : '#f5f3ff',
                            color: imprimiendo ? '#94a3b8' : '#7c3aed',
                            border: '1px solid', borderColor: imprimiendo ? '#e2e8f0' : '#c4b5fd',
                            borderRadius: 8, cursor: imprimiendo ? 'not-allowed' : 'pointer',
                            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7,
                            transition: 'all 0.15s',
                        }}
                    >
                        {imprimiendo ? '⏳ Preparando…' : '🖨️ Imprimir ficha'}
                    </button>
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

// ─── Tab Unificación de Compras ───────────────────────────────────────────────

const ESTADO_COLORS_UNI = {
    ASDA: '#7c3aed',
    ADIR: '#c026d3',
    AA:   '#0891b2',
    DC:   '#1d4ed8',
};

function getRadiusUni(monto) {
    return Math.max(10, Math.min(32, Math.sqrt((monto || 0) / 1500000) * 3 + 10));
}

// ─── Jerarquía de ítems presupuestarios ───────────────────────────────────────

function parseItemCode(itemPresupuestario) {
    if (!itemPresupuestario) return { code: '', parts: [], label: '' };
    const dashIdx = itemPresupuestario.indexOf(' - ');
    const code  = dashIdx >= 0 ? itemPresupuestario.slice(0, dashIdx).trim() : itemPresupuestario.trim();
    const label = dashIdx >= 0 ? itemPresupuestario.slice(dashIdx + 3).trim() : '';
    const parts = code.split('.').filter(Boolean);
    return { code, parts, label };
}

function buildHierarchy(grupos, nodos) {
    const nodeMap = {};
    const root = { code: 'root', label: 'Todos los ítems', children: [], fscChildren: [], allFscDescendants: [], n_formularios: 0, monto_total: 0, estados: {}, isLeaf: false };
    nodeMap['root'] = root;

    (grupos || []).forEach(grupo => {
        const { code, parts, label } = parseItemCode(grupo.item_presupuestario);
        if (!code || parts.length === 0) return;
        let current = root;
        parts.forEach((_, depth) => {
            const pathCode = parts.slice(0, depth + 1).join('.');
            if (!nodeMap[pathCode]) {
                const child = {
                    code: pathCode,
                    label: depth === parts.length - 1 ? label : pathCode,
                    fullItem: depth === parts.length - 1 ? grupo.item_presupuestario : pathCode,
                    children: [], fscChildren: [], allFscDescendants: [],
                    n_formularios: 0, monto_total: 0, estados: {},
                    isLeaf: depth === parts.length - 1,
                    grupoData: depth === parts.length - 1 ? grupo : null,
                };
                nodeMap[pathCode] = child;
                current.children.push(child);
            } else if (depth === parts.length - 1) {
                nodeMap[pathCode].isLeaf = true;
                nodeMap[pathCode].grupoData = grupo;
                nodeMap[pathCode].label = label;
                nodeMap[pathCode].fullItem = grupo.item_presupuestario;
            }
            current = nodeMap[pathCode];
        });
    });

    // M:N — un FSC puede pertenecer a múltiples ítems; se inserta en cada uno
    (nodos || []).forEach(nodo => {
        const items = nodo.items_propios?.length ? nodo.items_propios : (nodo.primary_item ? [nodo.primary_item] : []);
        items.forEach(item => {
            const { code } = parseItemCode(item);
            if (nodeMap[code]) nodeMap[code].fscChildren.push(nodo);
        });
    });

    function deduplicarFSC(list) {
        const seen = new Set();
        return list.filter(f => { const k = `${f.folio}-${f.anho}`; if (seen.has(k)) return false; seen.add(k); return true; });
    }

    // Agregar datos desde hojas hacia arriba (con deduplicación M:N)
    function aggregate(node) {
        node.children.forEach(aggregate);
        node.fscChildren = deduplicarFSC(node.fscChildren);
        if (node.isLeaf) {
            node.n_formularios = node.fscChildren.length;
            node.monto_total   = node.fscChildren.reduce((s, f) => s + (f.monto_estimado || 0), 0);
            const est = {};
            node.fscChildren.forEach(f => { est[f.estado] = (est[f.estado] || 0) + 1; });
            node.estados = est;
        } else {
            const uniq = deduplicarFSC(node.children.flatMap(c => c.allFscDescendants));
            node.n_formularios = uniq.length;
            node.monto_total   = uniq.reduce((s, f) => s + (f.monto_estimado || 0), 0);
            const est = {};
            uniq.forEach(f => { est[f.estado] = (est[f.estado] || 0) + 1; });
            node.estados = est;
        }
    }
    aggregate(root);

    // Colectar todos los FSC únicos en el subárbol
    function collectAllFSC(node) {
        const own  = node.fscChildren || [];
        const deep = (node.children || []).flatMap(collectAllFSC);
        node.allFscDescendants = deduplicarFSC([...own, ...deep]);
        return node.allFscDescendants;
    }
    collectAllFSC(root);

    return root;
}

// ─── Panel lateral de detalle de un formulario FSC ────────────────────────────

function PanelDetalleFSC({ nodo, onCerrar }) {
    const [productos, setProductos] = useState([]);
    const [cargandoProd, setCargandoProd] = useState(true);

    useEffect(() => {
        if (!nodo) return;
        let activo = true;
        setCargandoProd(true);
        const params = { folio: nodo.folio, anho: nodo.anho };
        if (nodo.tipo_formulario != null) params.tipo_formulario = nodo.tipo_formulario;
        getFormulariosProductos(params)
            .then(({ data }) => { if (activo) setProductos(data.results ?? data); })
            .catch(() => { if (activo) setProductos([]); })
            .finally(() => { if (activo) setCargandoProd(false); });
        return () => { activo = false; };
    }, [nodo]);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onCerrar]);

    if (!nodo) return null;

    const estadoColor = ESTADO_COLORS_UNI[nodo.estado] || ESTADO_FSC_INFO[nodo.estado]?.color || '#94a3b8';

    const Campo = ({ label, value, mono, wide }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...(wide ? { gridColumn: 'span 2' } : {}) }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ fontSize: 12, color: '#1e293b', fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '—'}</span>
        </div>
    );

    return (
        <>
            {/* Backdrop translúcido */}
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.12)', zIndex: 1299 }} onClick={onCerrar} />

            {/* Drawer */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, zIndex: 1300,
                background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column',
                borderLeft: `3px solid ${estadoColor}`,
            }}>
                {/* Header */}
                <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: 6 }}>
                                {nodo.id_formulario || `Folio ${nodo.folio}`}
                            </span>
                            <EstadoFSCBadge codigo={nodo.estado} />
                            {nodo.destino_actual && (
                                <span style={{ fontSize: 11, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: 12, border: '1px solid #ddd6fe' }}>
                                    👤 {nodo.destino_actual}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{nodo.unidad_requirente}</div>
                    </div>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', flexShrink: 0 }}>✕</button>
                </div>

                {/* KPI rápido */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
                    {[
                        { label: 'Monto Estimado', value: fmtCLP(nodo.monto_estimado), color: '#16a34a' },
                        { label: 'Año',             value: nodo.anho,                  color: '#0891b2' },
                        { label: 'Fecha Solicitud', value: nodo.fecha_solicitud || '—', color: '#64748b' },
                    ].map(({ label, value, color }) => (
                        <div key={label} style={{ padding: '10px 14px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{label}</div>
                        </div>
                    ))}
                </div>

                {/* Contenido */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Identificación */}
                    <section>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, borderBottom: '2px solid #ede9fe', paddingBottom: 4 }}>Identificación</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                            <Campo label="Folio" value={nodo.folio} mono />
                            <Campo label="Usuario Requirente" value={nodo.usuario_requirente} />
                            {nodo.item_presupuestario && <Campo label="Ítem Presupuestario" value={nodo.item_presupuestario} wide />}
                            {nodo.primary_item && nodo.primary_item !== nodo.item_presupuestario && (
                                <Campo label="Ítem Principal (Unificación)" value={nodo.primary_item} wide />
                            )}
                        </div>
                    </section>

                    {/* Requerimiento */}
                    {nodo.requerimiento && (
                        <section>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, borderBottom: '2px solid #ede9fe', paddingBottom: 4 }}>Requerimiento</div>
                            <p style={{ fontSize: 12, color: '#1e293b', lineHeight: 1.6, margin: 0, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #16a34a' }}>
                                {nodo.requerimiento}
                            </p>
                        </section>
                    )}

                    {/* Productos */}
                    <section>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, borderBottom: '2px solid #ede9fe', paddingBottom: 4 }}>
                            Carro de Productos
                        </div>
                        {cargandoProd ? (
                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 16 }}>Cargando productos…</div>
                        ) : productos.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 16 }}>Sin productos registrados.</div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                        <tr>
                                            {['Categoría', 'Producto', 'Cant.', 'Monto', 'Ítem Presup.'].map(h => (
                                                <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {productos.map((p, i) => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                <td style={{ padding: '5px 8px', color: '#374151' }}>{p.categoria || '—'}</td>
                                                <td style={{ padding: '5px 8px', color: '#374151', maxWidth: 160 }}>
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.producto}>{p.producto || '—'}</div>
                                                </td>
                                                <td style={{ padding: '5px 8px', color: '#374151', textAlign: 'right' }}>{fmtN(p.cantidad)}</td>
                                                <td style={{ padding: '5px 8px', color: '#374151', textAlign: 'right', fontWeight: 600 }}>{fmtCLP(p.monto)}</td>
                                                <td style={{ padding: '5px 8px', color: '#64748b', fontSize: 10, fontFamily: 'monospace' }}>{p.item_presupuestario || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onCerrar} style={{ padding: '7px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        Cerrar
                    </button>
                </div>
            </div>
        </>
    );
}

function GrafoUnificacion({ nodos, grupos, grupoResaltado, onClickNodo }) {
    const svgRef    = useRef(null);
    const simRef    = useRef(null);
    const linesGRef = useRef(null);
    const [tooltip, setTooltip]       = useState(null);
    const [lineOpacity, setLineOpacity] = useState(0.35);

    useEffect(() => {
        if (!nodos?.length || !grupos?.length || !svgRef.current) return;

        const el = svgRef.current;
        const W = el.clientWidth || el.parentElement?.clientWidth || 700;
        const H = Math.max(340, Math.min(Math.floor(window.innerHeight * 0.52), 510));
        el.setAttribute('height', H);

        d3.select(el).selectAll('*').remove();
        if (simRef.current) simRef.current.stop();

        const svg = d3.select(el);
        const g   = svg.append('g');

        // Cluster anchor grid
        const N    = grupos.length;
        const COLS = Math.ceil(Math.sqrt(N * 1.5));
        const ROWS = Math.ceil(N / COLS);
        const padX = W * 0.12;
        const padY = H * 0.16;
        const stepX = (W - padX * 2) / Math.max(COLS - 1, 1);
        const stepY = (H - padY * 2) / Math.max(ROWS - 1, 1);

        const anchors = {};
        grupos.forEach((gi, i) => {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            anchors[gi.item_presupuestario] = {
                x: COLS === 1 ? W / 2 : padX + col * stepX,
                y: ROWS === 1 ? H / 2 : padY + row * stepY,
            };
        });

        // Cluster label circles + text
        const labelG = g.append('g').attr('class', 'cluster-labels').attr('pointer-events', 'none');
        grupos.forEach(gi => {
            const a = anchors[gi.item_presupuestario];
            if (!a) return;
            const partes = gi.item_presupuestario.split(' - ');
            const codigo = partes[0] || '';
            const nombre = (partes.slice(1).join(' - ') || gi.item_presupuestario).slice(0, 22);

            labelG.append('circle')
                .attr('cx', a.x).attr('cy', a.y).attr('r', 30)
                .attr('fill', '#ede9fe').attr('stroke', '#c4b5fd').attr('stroke-width', 1.5).attr('opacity', 0.85);

            labelG.append('text')
                .attr('x', a.x).attr('y', a.y - 3)
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
                .attr('font-size', 9).attr('font-weight', 700).attr('fill', '#7c3aed')
                .text(codigo);

            labelG.append('text')
                .attr('x', a.x).attr('y', a.y + 40)
                .attr('text-anchor', 'middle').attr('font-size', 8).attr('fill', '#475569')
                .text(nombre);

            labelG.append('text')
                .attr('x', a.x).attr('y', a.y + 51)
                .attr('text-anchor', 'middle').attr('font-size', 8).attr('font-weight', 600).attr('fill', '#7c3aed')
                .text(gi.n_formularios + ' FSC');
        });

        // Node data — posición = centroide de TODOS los anclas de items_propios (Opción B híbrido)
        const nodeData = nodos.map(n => {
            const items = n.items_propios?.length ? n.items_propios : (n.primary_item ? [n.primary_item] : []);
            const validAnchors = items.map(it => anchors[it]).filter(Boolean);
            const _ax = validAnchors.length ? validAnchors.reduce((s, a) => s + a.x, 0) / validAnchors.length : W * 0.5;
            const _ay = validAnchors.length ? validAnchors.reduce((s, a) => s + a.y, 0) / validAnchors.length : H * 0.88;
            return {
                ...n,
                _ax, _ay,
                _allAnchors: validAnchors,
                x: _ax + (Math.random() - 0.5) * 30,
                y: _ay + (Math.random() - 0.5) * 30,
                r: getRadiusUni(n.monto_estimado),
            };
        });

        // Líneas de tensión: FSC con múltiples ítems → línea a cada ancla (detrás de nodos)
        const linesG = g.append('g').attr('class', 'anchor-lines');
        linesGRef.current = linesG.node();
        const lineData = [];
        nodeData.forEach(n => {
            if ((n._allAnchors || []).length > 1) {
                n._allAnchors.forEach(anchor => lineData.push({ source: n, target: anchor }));
            }
        });
        linesG.selectAll('line')
            .data(lineData)
            .join('line')
            .attr('stroke', '#c4b5fd')
            .attr('stroke-dasharray', '4,3')
            .attr('stroke-width', 0.5 + lineOpacity * 2.5)
            .attr('opacity', lineOpacity);

        // Circles
        const nodesG = g.append('g').attr('class', 'fsc-nodes');
        const circles = nodesG.selectAll('circle')
            .data(nodeData)
            .join('circle')
            .attr('r', d => d.r)
            .attr('fill', d => ESTADO_COLORS_UNI[d.estado] || '#94a3b8')
            .attr('stroke', '#fff').attr('stroke-width', 2)
            .attr('opacity', 0.87)
            .style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (ev, d) => { if (!ev.active) simRef.current?.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
                .on('end',   (ev, d) => { if (!ev.active) simRef.current?.alphaTarget(0); d.fx = null; d.fy = null; })
            )
            .on('click', (ev, d) => {
                ev.stopPropagation();
                if (onClickNodo) onClickNodo(d);
            })
            .on('mouseover', (ev, d) => {
                setTooltip({ x: ev.clientX, y: ev.clientY, d });
                d3.select(ev.currentTarget).attr('stroke', '#7c3aed').attr('stroke-width', 3).attr('opacity', 1);
            })
            .on('mousemove', ev => setTooltip(p => p ? { ...p, x: ev.clientX, y: ev.clientY } : null))
            .on('mouseout',  ev => {
                setTooltip(null);
                d3.select(ev.currentTarget).attr('stroke', '#fff').attr('stroke-width', 2).attr('opacity', 0.87);
            });

        // Folio labels inside circles
        const labelsG = g.append('g').attr('class', 'fsc-labels').attr('pointer-events', 'none');
        labelsG.selectAll('text')
            .data(nodeData.filter(d => d.r >= 14))
            .join('text')
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
            .attr('font-size', 9).attr('font-weight', 700).attr('fill', '#fff')
            .text(d => d.folio);

        // Simulation
        const sim = d3.forceSimulation(nodeData)
            .force('x',       d3.forceX(d => d._ax).strength(0.28))
            .force('y',       d3.forceY(d => d._ay).strength(0.28))
            .force('collide', d3.forceCollide(d => d.r + 3).strength(1).iterations(3))
            .force('charge',  d3.forceManyBody().strength(-12));

        simRef.current = sim;

        sim.on('tick', () => {
            circles
                .attr('cx', d => { d.x = Math.max(d.r + 4, Math.min(W - d.r - 4, d.x)); return d.x; })
                .attr('cy', d => { d.y = Math.max(d.r + 4, Math.min(H - d.r - 4, d.y)); return d.y; });
            labelsG.selectAll('text').attr('x', d => d.x).attr('y', d => d.y);
            linesG.selectAll('line')
                .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        });

        // Zoom
        const zoom = d3.zoom().scaleExtent([0.35, 4])
            .on('zoom', ev => g.attr('transform', ev.transform));
        svg.call(zoom);

        return () => sim.stop();
    }, [nodos, grupos]);

    // Slider de opacidad de líneas — sin reiniciar simulación
    useEffect(() => {
        if (!svgRef.current) return;
        d3.select(svgRef.current).selectAll('.anchor-lines line')
            .attr('opacity', lineOpacity)
            .attr('stroke-width', 0.5 + lineOpacity * 2.5);
    }, [lineOpacity]);

    // Highlight sin reiniciar simulación
    useEffect(() => {
        if (!svgRef.current) return;
        const cs = d3.select(svgRef.current).selectAll('.fsc-nodes circle');
        if (!grupoResaltado) {
            cs.attr('opacity', 0.87).attr('stroke', '#fff').attr('stroke-width', 2);
        } else {
            cs.attr('opacity', d => d?.items_propios?.includes(grupoResaltado) || d?.primary_item === grupoResaltado ? 1 : 0.12)
              .attr('stroke', d => d?.items_propios?.includes(grupoResaltado) || d?.primary_item === grupoResaltado ? '#7c3aed' : '#fff')
              .attr('stroke-width', d => d?.items_propios?.includes(grupoResaltado) || d?.primary_item === grupoResaltado ? 3 : 1);
        }
    }, [grupoResaltado]);

    return (
        <div style={{ position: 'relative', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', zIndex: 5 }}>
                {Object.entries(ESTADO_COLORS_UNI).map(([estado, color]) => (
                    <span key={estado} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#374151' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />{estado}
                    </span>
                ))}
                <span style={{ fontSize: 10, color: '#94a3b8' }}>· Tamaño = monto · Arrastra · Zoom rueda</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.85)', borderRadius: 8, padding: '3px 9px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>Líneas multi-ítem</span>
                    <input type="range" min="0" max="1" step="0.05" value={lineOpacity}
                        onChange={e => setLineOpacity(parseFloat(e.target.value))}
                        style={{ width: 72, accentColor: '#7c3aed', cursor: 'pointer' }} />
                    <span style={{ fontSize: 10, color: '#7c3aed', minWidth: 24, textAlign: 'right' }}>{Math.round(lineOpacity * 100)}%</span>
                </div>
            </div>
            <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
            {tooltip && (
                <div style={{
                    position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, zIndex: 9999,
                    background: '#1e293b', color: '#f8fafc', borderRadius: 9, padding: '10px 14px',
                    fontSize: 12, pointerEvents: 'none', minWidth: 220, maxWidth: 280,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>Folio {tooltip.d.folio} / {tooltip.d.anho}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ background: (ESTADO_COLORS_UNI[tooltip.d.estado] || '#94a3b8') + '30', color: ESTADO_COLORS_UNI[tooltip.d.estado] || '#94a3b8', padding: '1px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{tooltip.d.estado}</span>
                        {tooltip.d.destino_actual && <span style={{ fontSize: 11, color: '#94a3b8' }}>👤 {tooltip.d.destino_actual}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{tooltip.d.unidad_requirente}</div>
                    {tooltip.d.requerimiento && <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 5, fontStyle: 'italic' }}>{tooltip.d.requerimiento.slice(0, 80)}{tooltip.d.requerimiento.length > 80 ? '…' : ''}</div>}
                    <div style={{ fontWeight: 700, color: '#34d399', fontSize: 13 }}>{fmtCLP(tooltip.d.monto_estimado)}</div>
                    {tooltip.d.primary_item && <div style={{ fontSize: 10, color: '#a78bfa', marginTop: 5 }}>📦 {tooltip.d.primary_item.slice(0, 55)}</div>}
                </div>
            )}
        </div>
    );
}

function SidebarGrupos({ grupos, grupoResaltado, onSelect }) {
    if (!grupos?.length) return <div style={{ color: '#94a3b8', fontSize: 13 }}>Sin grupos para este año.</div>;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {grupos.map(gi => {
                const activo = grupoResaltado === gi.item_presupuestario;
                const partes = gi.item_presupuestario.split(' - ');
                const codigo = partes[0];
                const nombre = partes.slice(1).join(' - ') || gi.item_presupuestario;
                return (
                    <div key={gi.item_presupuestario}
                        onClick={() => onSelect(activo ? null : gi.item_presupuestario)}
                        style={{
                            border: activo ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                            borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                            background: activo ? '#f5f3ff' : '#fff', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!activo) e.currentTarget.style.borderColor = '#c4b5fd'; }}
                        onMouseLeave={e => { if (!activo) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: activo ? '#7c3aed' : '#5b21b6', background: '#f5f3ff', padding: '1px 6px', borderRadius: 4 }}>{codigo}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: activo ? '#7c3aed' : '#374151' }}>{gi.n_formularios} FSC</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#374151', marginBottom: 5, lineHeight: 1.4 }}>{nombre}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 5 }}>{fmtCLP(gi.monto_total)}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {Object.entries(gi.estados || {}).map(([estado, n]) => (
                                <span key={estado} style={{
                                    fontSize: 10, fontWeight: 600,
                                    background: (ESTADO_COLORS_UNI[estado] || '#94a3b8') + '20',
                                    color: ESTADO_COLORS_UNI[estado] || '#94a3b8',
                                    border: `1px solid ${(ESTADO_COLORS_UNI[estado] || '#94a3b8')}40`,
                                    padding: '1px 6px', borderRadius: 10,
                                }}>{estado} ×{n}</span>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function CardsCategoria({ grupos }) {
    if (!grupos?.length) return null;
    return (
        <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Segunda capa — Similitud por categoría de productos
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
                {grupos.map(g => (
                    <div key={g.categoria} style={{ minWidth: 155, border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', background: '#fff', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 4, lineHeight: 1.3 }}>{g.categoria}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed' }}>{g.n_formularios}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>formularios</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>{fmtCLP(g.monto_total)}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
                            {[...new Set((g.formularios || []).map(f => f.estado))].map(e => (
                                <span key={e} style={{ width: 9, height: 9, borderRadius: '50%', background: ESTADO_COLORS_UNI[e] || '#94a3b8', display: 'inline-block' }} title={e} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Vista Burbujas: D3 circle packing jerárquico ────────────────────────────

const PACK_PALETTE = ['#7c3aed', '#0891b2', '#d97706', '#15803d', '#c026d3', '#1d4ed8', '#b91c1c', '#065f46', '#92400e', '#1e40af'];

function GrafoPack({ grupos, nodos, onClickNodo }) {
    const svgRef  = useRef(null);
    const [viewStack, setViewStack]   = useState([]);
    const [tooltip, setTooltip]       = useState(null);

    const hierarchyRoot = useMemo(() => buildHierarchy(grupos, nodos), [grupos, nodos]);
    useEffect(() => { setViewStack([]); }, [hierarchyRoot]);

    const currentNode = viewStack.length > 0 ? viewStack[viewStack.length - 1] : hierarchyRoot;

    const drillInto = useCallback((node) => setViewStack(prev => [...prev, node]), []);
    const goTo = useCallback((idx) => setViewStack(prev => idx < 0 ? [] : prev.slice(0, idx + 1)), []);

    useEffect(() => {
        if (!svgRef.current || !currentNode) return;
        const el  = svgRef.current;
        const W   = el.clientWidth || 800;
        const H   = Math.max(350, Math.min(Math.floor(window.innerHeight * 0.55), 570));
        el.setAttribute('height', H);
        d3.select(el).selectAll('*').remove();

        // Decide qué mostrar: FSC individuales (hoja) o sub-ítems
        const isFSCLevel = currentNode.isLeaf;
        const displayItems = isFSCLevel
            ? (currentNode.fscChildren || []).map(f => ({
                code: `#${f.folio}`, label: f.requerimiento?.slice(0, 40) || `Folio ${f.folio}`,
                n_formularios: 1, monto_total: f.monto_estimado || 0,
                estados: { [f.estado]: 1 }, isFSCNode: true, fscData: f,
                children: [],
              }))
            : (currentNode.children || []);

        if (!displayItems.length) return;

        // Paleta de colores por prefijo L1
        const l1Codes = [...new Set(displayItems.map(c => c.code?.split('.')[0] || '0'))];
        const colorOf = d3.scaleOrdinal(PACK_PALETTE).domain(l1Codes);

        // Pack flat (solo primer nivel — no nested)
        const packRoot = d3.hierarchy({ children: displayItems })
            .sum(d => Math.max(1, d.monto_total || d.n_formularios || 1))
            .sort((a, b) => b.value - a.value);
        d3.pack().size([W - 16, H - 16]).padding(7)(packRoot);

        const svg = d3.select(el);
        const g   = svg.append('g').attr('transform', 'translate(8,8)');

        packRoot.children?.forEach(node => {
            const d = node.data;
            const isFSC = d.isFSCNode;
            const hasSub = !isFSC && (d.children?.length > 0 || d.fscChildren?.length > 0);
            const color = isFSC
                ? (ESTADO_COLORS_UNI[d.fscData?.estado] || '#94a3b8')
                : colorOf(d.code?.split('.')[0] || '0');

            g.append('circle')
                .attr('cx', node.x).attr('cy', node.y).attr('r', node.r)
                .attr('fill', color + (hasSub ? '1e' : isFSC ? '55' : '33'))
                .attr('stroke', color).attr('stroke-width', hasSub ? 2.5 : 1.5)
                .attr('opacity', 0.92)
                .style('cursor', hasSub || isFSC ? 'pointer' : 'default')
                .on('click', (ev) => {
                    ev.stopPropagation();
                    if (isFSC && onClickNodo) return onClickNodo(d.fscData);
                    if (hasSub) drillInto(d);
                })
                .on('mouseover', ev => {
                    d3.select(ev.currentTarget).attr('stroke-width', 4).attr('opacity', 1);
                    setTooltip({ x: ev.clientX, y: ev.clientY, d, color });
                })
                .on('mousemove', ev => setTooltip(p => p ? { ...p, x: ev.clientX, y: ev.clientY } : null))
                .on('mouseout', ev => {
                    d3.select(ev.currentTarget).attr('stroke-width', hasSub ? 2.5 : 1.5).attr('opacity', 0.92);
                    setTooltip(null);
                });

            if (node.r > 14) {
                g.append('text')
                    .attr('x', node.x).attr('y', node.y + (node.r > 32 ? -6 : 0))
                    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
                    .attr('font-size', Math.min(13, node.r * 0.32 + 5)).attr('font-weight', 700)
                    .attr('fill', isFSC ? '#fff' : color).attr('pointer-events', 'none')
                    .text(isFSC ? `#${d.fscData?.folio}` : d.code);
            }
            if (node.r > 34 && !isFSC) {
                g.append('text')
                    .attr('x', node.x).attr('y', node.y + node.r * 0.28)
                    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
                    .attr('font-size', Math.min(10, node.r * 0.2)).attr('fill', color)
                    .attr('pointer-events', 'none')
                    .text(`${d.n_formularios} FSC`);
            }
        });

        // Zoom
        const zoom = d3.zoom().scaleExtent([0.4, 4])
            .on('zoom', ev => g.attr('transform', `translate(8,8) scale(${ev.transform.k}) translate(${(ev.transform.x)/ev.transform.k},${(ev.transform.y)/ev.transform.k})`));
        svg.call(zoom);

    }, [currentNode, drillInto, onClickNodo]);

    return (
        <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Breadcrumb */}
            <div style={{ padding: '7px 12px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', minHeight: 36 }}>
                <button onClick={() => goTo(-1)} style={{ padding: '2px 9px', background: viewStack.length ? '#ede9fe' : '#e2e8f0', color: '#7c3aed', border: 'none', borderRadius: 4, cursor: viewStack.length ? 'pointer' : 'default', fontSize: 11, fontWeight: 600 }}>
                    🏠 Raíz
                </button>
                {viewStack.map((node, i) => (
                    <React.Fragment key={node.code}>
                        <span style={{ color: '#c4b5fd', fontSize: 14 }}>›</span>
                        <button onClick={() => goTo(i)} style={{ padding: '2px 9px', background: i === viewStack.length - 1 ? '#ede9fe' : '#f8fafc', color: '#7c3aed', border: '1px solid #ede9fe', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                            {node.code}
                        </button>
                    </React.Fragment>
                ))}
                <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>
                    {currentNode.isLeaf
                        ? `📋 ${currentNode.fscChildren?.length} FSC — clic para ver detalle`
                        : `📂 ${currentNode.children?.length} subgrupos — clic para abrir`}
                </span>
            </div>
            {/* Info nivel actual */}
            {viewStack.length > 0 && (
                <div style={{ padding: '5px 12px', background: '#f5f3ff', borderBottom: '1px solid #ede9fe', display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#7c3aed' }}>{currentNode.code}</span>
                    {currentNode.label && <span style={{ color: '#374151' }}>{currentNode.label}</span>}
                    <span style={{ color: '#64748b' }}>{currentNode.n_formularios} FSC</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>{fmtCLP(currentNode.monto_total)}</span>
                </div>
            )}
            <div style={{ position: 'relative' }}>
                <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
                {tooltip && (
                    <div style={{
                        position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, zIndex: 9999,
                        background: '#1e293b', color: '#f8fafc', borderRadius: 9, padding: '10px 14px',
                        fontSize: 12, pointerEvents: 'none', minWidth: 200, maxWidth: 260,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    }}>
                        {tooltip.d.isFSCNode ? (
                            <>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Folio {tooltip.d.fscData?.folio} / {tooltip.d.fscData?.anho}</div>
                                <EstadoFSCBadge codigo={tooltip.d.fscData?.estado} />
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{tooltip.d.fscData?.unidad_requirente}</div>
                                <div style={{ fontWeight: 700, color: '#34d399', marginTop: 4 }}>{fmtCLP(tooltip.d.fscData?.monto_estimado)}</div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontWeight: 700, marginBottom: 3, color: tooltip.color }}>{tooltip.d.code}</div>
                                {tooltip.d.label && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{tooltip.d.label}</div>}
                                <div style={{ fontWeight: 700, color: '#34d399' }}>{fmtCLP(tooltip.d.monto_total)}</div>
                                <div style={{ fontSize: 11, color: '#a78bfa' }}>{tooltip.d.n_formularios} formularios</div>
                                {(tooltip.d.children?.length > 0 || tooltip.d.fscChildren?.length > 0) && (
                                    <div style={{ fontSize: 10, color: '#60a5fa', marginTop: 4 }}>
                                        {tooltip.d.children?.length > 0 ? `📂 ${tooltip.d.children.length} subgrupos` : `📋 ${tooltip.d.fscChildren.length} FSC`}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Vista Pipeline: columnas cascada React ───────────────────────────────────

function GrafoPipeline({ grupos, nodos, onClickNodo }) {
    const hierarchyRoot = useMemo(() => buildHierarchy(grupos, nodos), [grupos, nodos]);

    const [selL1, setSelL1] = useState(null);
    const [selL2, setSelL2] = useState(null);
    const [selL3, setSelL3] = useState(null);

    useEffect(() => { setSelL1(null); setSelL2(null); setSelL3(null); }, [hierarchyRoot]);

    const handleSelL1 = (code) => { setSelL1(prev => prev === code ? null : code); setSelL2(null); setSelL3(null); };
    const handleSelL2 = (code) => { setSelL2(prev => prev === code ? null : code); setSelL3(null); };
    const handleSelL3 = (code) => setSelL3(prev => prev === code ? null : code);

    const l1Nodes = hierarchyRoot.children || [];
    const selL1Node = selL1 ? l1Nodes.find(n => n.code === selL1) : null;
    const l2Nodes   = selL1Node?.children || [];
    const selL2Node = selL2 ? l2Nodes.find(n => n.code === selL2) : null;
    const l3Nodes   = selL2Node?.children || [];
    const selL3Node = selL3 ? l3Nodes.find(n => n.code === selL3) : null;

    const deepestSel = selL3Node || selL2Node || selL1Node;
    const fscNodes   = deepestSel?.allFscDescendants || [];
    const showL3Col  = selL2Node && l3Nodes.length > 0;

    const ItemBtn = ({ node, isSelected, onSelect }) => {
        const color = '#7c3aed';
        return (
            <button
                onClick={() => onSelect(node.code)}
                style={{
                    width: '100%', textAlign: 'left', padding: '8px 10px',
                    borderRadius: 8, cursor: 'pointer', border: 'none',
                    outline: isSelected ? `2px solid ${color}` : '1px solid #e2e8f0',
                    background: isSelected ? '#f5f3ff' : '#fff', transition: 'all 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.outline = '1px solid #c4b5fd'; e.currentTarget.style.background = '#faf5ff'; } }}
                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.outline = '1px solid #e2e8f0'; e.currentTarget.style.background = '#fff'; } }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: isSelected ? color : '#5b21b6', background: '#f5f3ff', padding: '1px 5px', borderRadius: 3 }}>
                        {node.code}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? color : '#374151' }}>{node.n_formularios}</span>
                </div>
                {node.label && node.label !== node.code && (
                    <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {node.label}
                    </div>
                )}
                <div style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', marginTop: 2 }}>{fmtCLP(node.monto_total)}</div>
                {Object.keys(node.estados || {}).length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
                        {Object.entries(node.estados).map(([est, n]) => (
                            <span key={est} style={{ width: 7, height: 7, borderRadius: '50%', background: ESTADO_COLORS_UNI[est] || '#94a3b8', display: 'inline-block' }} title={`${est}: ${n}`} />
                        ))}
                    </div>
                )}
            </button>
        );
    };

    const colMaxH = Math.max(300, Math.min(Math.floor(window.innerHeight * 0.52), 500));

    const Column = ({ title, nodes, selected, onSelect, isActive, hint }) => (
        <div style={{ flex: 1, minWidth: 155, maxWidth: 220, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', opacity: isActive ? 1 : 0.55, transition: 'opacity 0.2s' }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {title}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 7, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: colMaxH }}>
                {!isActive ? (
                    <div style={{ textAlign: 'center', color: '#c4b5fd', fontSize: 11, padding: 18 }}>{hint}</div>
                ) : nodes.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: 18 }}>Sin subniveles</div>
                ) : nodes.map(node => (
                    <ItemBtn key={node.code} node={node} isSelected={selected === node.code} onSelect={onSelect} />
                ))}
            </div>
        </div>
    );

    const FSCColumn = ({ fscList, isActive }) => (
        <div style={{ flex: 1, minWidth: 175, maxWidth: 240, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', opacity: isActive ? 1 : 0.5, transition: 'opacity 0.2s' }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📋 Formularios ({fscList.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 7, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: colMaxH }}>
                {!isActive ? (
                    <div style={{ textAlign: 'center', color: '#c4b5fd', fontSize: 11, padding: 18 }}>Selecciona un ítem</div>
                ) : fscList.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: 18 }}>Sin formularios asignados</div>
                ) : fscList.map(fsc => {
                    const col = ESTADO_COLORS_UNI[fsc.estado] || '#94a3b8';
                    return (
                        <button
                            key={`${fsc.folio}-${fsc.anho}`}
                            onClick={() => onClickNodo && onClickNodo(fsc)}
                            style={{ width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${col}30`, background: `${col}0d`, transition: 'all 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = col + '80'; e.currentTarget.style.background = col + '1a'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = col + '30'; e.currentTarget.style.background = col + '0d'; }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: col }}>#{fsc.folio}</span>
                                <EstadoFSCBadge codigo={fsc.estado} />
                            </div>
                            <div style={{ fontSize: 10, color: '#475569', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fsc.unidad_requirente}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a' }}>{fmtCLP(fsc.monto_estimado)}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const Arrow = () => <div style={{ display: 'flex', alignItems: 'center', color: '#c4b5fd', fontSize: 22, flexShrink: 0, userSelect: 'none' }}>›</div>;

    return (
        <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', width: '100%', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'stretch', padding: '8px', minWidth: 'max-content' }}>
                <Column title="Subtítulo N1" nodes={l1Nodes} selected={selL1} onSelect={handleSelL1} isActive={true} hint="" />
                <Arrow />
                <Column title="Grupo N2" nodes={l2Nodes} selected={selL2} onSelect={handleSelL2} isActive={!!selL1} hint="← Selecciona N1" />
                {showL3Col && <><Arrow /><Column title="Subgrupo N3" nodes={l3Nodes} selected={selL3} onSelect={handleSelL3} isActive={!!selL2} hint="← Selecciona N2" /></>}
                <Arrow />
                <FSCColumn fscList={fscNodes} isActive={!!deepestSel} />
            </div>
        </div>
    );
}

// ─── Tab Productos (Opción C): ítem → categoría → FSC en 3 vistas ────────────

const SUBTABS_PROD = [
    { id: 'pipeline', label: '📊 Pipeline' },
    { id: 'acordeon', label: '📋 Acordeón' },
    { id: 'treemap',  label: '🗺️ Treemap'  },
];

function FSCMiniBtn({ fsc, onClickNodo }) {
    const col = ESTADO_COLORS_UNI[fsc.estado] || '#94a3b8';
    return (
        <button
            onClick={() => onClickNodo && onClickNodo(fsc)}
            style={{ width: '100%', textAlign: 'left', padding: '6px 9px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${col}30`, background: `${col}0d`, transition: 'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = col + '80'; e.currentTarget.style.background = col + '1a'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = col + '30'; e.currentTarget.style.background = col + '0d'; }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: col }}>#{fsc.folio}</span>
                <EstadoFSCBadge codigo={fsc.estado} />
            </div>
            <div style={{ fontSize: 10, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fsc.unidad_requirente}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', marginTop: 1 }}>{fmtCLP(fsc.monto_estimado)}</div>
        </button>
    );
}

// Vista A: Pipeline cascada (ítem → categoría → FSC)
function ProductosPipeline({ gruposProductos, onClickNodo }) {
    const [selItem, setSelItem]   = useState(null);
    const [selCat,  setSelCat]    = useState(null);
    useEffect(() => { setSelItem(null); setSelCat(null); }, [gruposProductos]);

    const selItemData = selItem ? gruposProductos.find(g => g.item_presupuestario === selItem) : null;
    const cats        = selItemData?.categorias || [];
    const selCatData  = selCat ? cats.find(c => c.categoria === selCat) : null;
    const fscList     = selCatData ? selCatData.formularios : (selItemData ? selItemData.categorias.flatMap(c => c.formularios) : []);

    const colMaxH = Math.max(300, Math.min(Math.floor(window.innerHeight * 0.52), 500));
    const Arrow = () => <div style={{ display: 'flex', alignItems: 'center', color: '#c4b5fd', fontSize: 22, flexShrink: 0 }}>›</div>;

    const ColHeader = ({ title }) => (
        <div style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{title}</div>
    );
    const ColWrap = ({ active, children }) => (
        <div style={{ flex: 1, minWidth: 155, maxWidth: 230, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', opacity: active ? 1 : 0.5, transition: 'opacity 0.2s' }}>{children}</div>
    );

    return (
        <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', width: '100%', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'stretch', padding: 8, minWidth: 'max-content' }}>
                {/* Columna ítems */}
                <ColWrap active={true}>
                    <ColHeader title={`Ítems presupuestarios (${gruposProductos.length})`} />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 7, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: colMaxH }}>
                        {gruposProductos.map(g => {
                            const { code, label } = parseItemCode(g.item_presupuestario);
                            const sel = selItem === g.item_presupuestario;
                            return (
                                <button key={g.item_presupuestario} onClick={() => { setSelItem(sel ? null : g.item_presupuestario); setSelCat(null); }}
                                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                                        outline: sel ? '2px solid #7c3aed' : '1px solid #e2e8f0', background: sel ? '#f5f3ff' : '#fff' }}
                                    onMouseEnter={e => { if (!sel) { e.currentTarget.style.outline = '1px solid #c4b5fd'; e.currentTarget.style.background = '#faf5ff'; } }}
                                    onMouseLeave={e => { if (!sel) { e.currentTarget.style.outline = '1px solid #e2e8f0'; e.currentTarget.style.background = '#fff'; } }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#5b21b6', background: '#f5f3ff', padding: '1px 5px', borderRadius: 3 }}>{code}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{g.n_formularios} FSC</span>
                                    </div>
                                    {label && <div style={{ fontSize: 10, color: '#64748b', WebkitLineClamp: 2, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical' }}>{label}</div>}
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', marginTop: 2 }}>{fmtCLP(g.monto_total)}</div>
                                </button>
                            );
                        })}
                    </div>
                </ColWrap>
                <Arrow />
                {/* Columna categorías */}
                <ColWrap active={!!selItemData}>
                    <ColHeader title={`Categorías (${cats.length})`} />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 7, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: colMaxH }}>
                        {!selItemData ? <div style={{ textAlign: 'center', color: '#c4b5fd', fontSize: 11, padding: 18 }}>← Selecciona un ítem</div>
                        : cats.map(c => {
                            const sel = selCat === c.categoria;
                            return (
                                <button key={c.categoria} onClick={() => setSelCat(sel ? null : c.categoria)}
                                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                                        outline: sel ? '2px solid #0891b2' : '1px solid #e2e8f0', background: sel ? '#ecfeff' : '#fff' }}
                                    onMouseEnter={e => { if (!sel) { e.currentTarget.style.outline = '1px solid #a5f3fc'; e.currentTarget.style.background = '#f0fdff'; } }}
                                    onMouseLeave={e => { if (!sel) { e.currentTarget.style.outline = '1px solid #e2e8f0'; e.currentTarget.style.background = '#fff'; } }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: sel ? '#0891b2' : '#374151' }}>{c.categoria}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{c.n_formularios}</span>
                                    </div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#16a34a' }}>{fmtCLP(c.monto_total)}</div>
                                </button>
                            );
                        })}
                    </div>
                </ColWrap>
                <Arrow />
                {/* Columna FSC */}
                <ColWrap active={!!selItemData}>
                    <ColHeader title={`Formularios (${fscList.length})`} />
                    <div style={{ flex: 1, overflowY: 'auto', padding: 7, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: colMaxH }}>
                        {!selItemData ? <div style={{ textAlign: 'center', color: '#c4b5fd', fontSize: 11, padding: 18 }}>← Selecciona un ítem</div>
                        : fscList.length === 0 ? <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11, padding: 18 }}>Sin formularios</div>
                        : fscList.map(fsc => <FSCMiniBtn key={`${fsc.folio}-${fsc.anho}`} fsc={fsc} onClickNodo={onClickNodo} />)}
                    </div>
                </ColWrap>
            </div>
        </div>
    );
}

// Vista B: Acordeón expandible (ítem → categorías → FSC)
function ProductosAcordeon({ gruposProductos, onClickNodo }) {
    const [openItem, setOpenItem] = useState(null);
    const [openCat,  setOpenCat]  = useState({});

    const toggleItem = (item) => { setOpenItem(p => p === item ? null : item); setOpenCat({}); };
    const toggleCat  = (cat)  => setOpenCat(p => ({ ...p, [cat]: !p[cat] }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gruposProductos.map(g => {
                const { code, label } = parseItemCode(g.item_presupuestario);
                const open = openItem === g.item_presupuestario;
                return (
                    <div key={g.item_presupuestario} style={{ background: '#fff', borderRadius: 10, border: open ? '2px solid #7c3aed' : '1px solid #e2e8f0', overflow: 'hidden', transition: 'border 0.15s' }}>
                        <button onClick={() => toggleItem(g.item_presupuestario)}
                            style={{ width: '100%', textAlign: 'left', padding: '11px 14px', background: open ? '#f5f3ff' : '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>{code}</span>
                            <span style={{ fontSize: 12, color: '#1e293b', flex: 1, textAlign: 'left' }}>{label || code}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{g.n_formularios} FSC</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', flexShrink: 0 }}>{fmtCLP(g.monto_total)}</span>
                            <span style={{ color: '#c4b5fd', fontSize: 16, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
                        </button>
                        {open && (
                            <div style={{ padding: '0 14px 12px' }}>
                                {g.categorias.map(c => {
                                    const catOpen = openCat[c.categoria];
                                    return (
                                        <div key={c.categoria} style={{ marginBottom: 6, borderRadius: 8, border: catOpen ? '1px solid #a5f3fc' : '1px solid #f1f5f9', overflow: 'hidden' }}>
                                            <button onClick={() => toggleCat(c.categoria)}
                                                style={{ width: '100%', textAlign: 'left', padding: '8px 11px', background: catOpen ? '#ecfeff' : '#f8fafc', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 11, color: catOpen ? '#0891b2' : '#374151', flex: 1, fontWeight: 600 }}>{c.categoria}</span>
                                                <span style={{ fontSize: 11, color: '#64748b' }}>{c.n_formularios} FSC · {fmtCLP(c.monto_total)}</span>
                                                <span style={{ color: '#94a3b8', fontSize: 13 }}>{catOpen ? '▲' : '▼'}</span>
                                            </button>
                                            {catOpen && (
                                                <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5, background: '#fff' }}>
                                                    {c.formularios.map(fsc => <FSCMiniBtn key={`${fsc.folio}-${fsc.anho}`} fsc={fsc} onClickNodo={onClickNodo} />)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Vista C: Treemap D3 (ítem → categoría, clic en categoría abre FSC en panel)
function ProductosTreemap({ gruposProductos, onClickNodo }) {
    const containerRef = useRef(null);
    const svgRef       = useRef(null);
    const [panelCat, setPanelCat] = useState(null);
    const [tooltip,  setTooltip]  = useState(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !gruposProductos?.length) return;
        const W = containerRef.current.clientWidth || 700;
        const H = Math.max(320, Math.min(Math.floor(window.innerHeight * 0.48), 480));
        svgRef.current.setAttribute('height', H);

        d3.select(svgRef.current).selectAll('*').remove();

        const root = d3.hierarchy({
            name: 'root',
            children: gruposProductos.map(g => ({
                name: g.item_presupuestario,
                children: g.categorias.map(c => ({
                    name: c.categoria,
                    value: Math.max(1, c.monto_total || c.n_formularios),
                    n_formularios: c.n_formularios,
                    monto_total:   c.monto_total,
                    formularios:   c.formularios,
                    item:          g.item_presupuestario,
                })),
            })),
        }).sum(d => d.value || 0).sort((a, b) => b.value - a.value);

        d3.treemap().size([W, H]).padding(2).paddingTop(18)(root);

        const l1Codes = [...new Set(gruposProductos.map(g => parseItemCode(g.item_presupuestario).code.split('.')[0]))];
        const colorL1 = d3.scaleOrdinal(PACK_PALETTE).domain(l1Codes);

        const svg = d3.select(svgRef.current);

        // Grupos de nivel 1 (ítem) — solo borde y etiqueta
        svg.selectAll('.item-group').data(root.children || []).join('g').attr('class', 'item-group')
            .each(function(d) {
                const { code } = parseItemCode(d.data.name);
                const color = colorL1(code.split('.')[0]);
                d3.select(this).append('rect')
                    .attr('x', d.x0).attr('y', d.y0)
                    .attr('width', d.x1 - d.x0).attr('height', d.y1 - d.y0)
                    .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('rx', 4);
                if (d.x1 - d.x0 > 40) {
                    d3.select(this).append('text')
                        .attr('x', d.x0 + 5).attr('y', d.y0 + 13)
                        .attr('font-size', 9).attr('font-weight', 700).attr('fill', color)
                        .text(code);
                }
            });

        // Hojas (categorías)
        const leaves = svg.selectAll('.cat-leaf').data(root.leaves()).join('g').attr('class', 'cat-leaf')
            .attr('cursor', 'pointer')
            .on('click', (ev, d) => { ev.stopPropagation(); setPanelCat(d.data); })
            .on('mouseover', (ev, d) => { d3.select(ev.currentTarget).select('rect').attr('opacity', 1); setTooltip({ x: ev.clientX, y: ev.clientY, d: d.data }); })
            .on('mousemove', ev => setTooltip(p => p ? { ...p, x: ev.clientX, y: ev.clientY } : null))
            .on('mouseout',  ev => { d3.select(ev.currentTarget).select('rect').attr('opacity', 0.82); setTooltip(null); });

        leaves.append('rect')
            .attr('x', d => d.x0 + 1).attr('y', d => d.y0 + 1)
            .attr('width',  d => Math.max(0, d.x1 - d.x0 - 2))
            .attr('height', d => Math.max(0, d.y1 - d.y0 - 2))
            .attr('rx', 3)
            .attr('fill', d => { const { code } = parseItemCode(d.data.item); return colorL1(code.split('.')[0]) + '28'; })
            .attr('stroke', d => { const { code } = parseItemCode(d.data.item); return colorL1(code.split('.')[0]); })
            .attr('stroke-width', 1).attr('opacity', 0.82);

        leaves.each(function(d) {
            const w = d.x1 - d.x0 - 4, h = d.y1 - d.y0 - 4;
            if (w < 20 || h < 12) return;
            const { code } = parseItemCode(d.data.item);
            const color = colorL1(code.split('.')[0]);
            d3.select(this).append('text')
                .attr('x', d.x0 + 4).attr('y', d.y0 + 14)
                .attr('font-size', Math.min(11, w / 8 + 5)).attr('font-weight', 600).attr('fill', color)
                .attr('clip-path', `inset(0 0 0 0)`)
                .text(d.data.name.length > 20 ? d.data.name.slice(0, 20) + '…' : d.data.name);
            if (h > 30) {
                d3.select(this).append('text')
                    .attr('x', d.x0 + 4).attr('y', d.y0 + 27)
                    .attr('font-size', 9).attr('fill', '#64748b')
                    .text(`${d.data.n_formularios} FSC · ${fmtCLP(d.data.monto_total)}`);
            }
        });
    }, [gruposProductos]);

    return (
        <div>
            <div ref={containerRef} style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', position: 'relative' }}>
                <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
                {tooltip && (
                    <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 10, zIndex: 9999,
                        background: '#1e293b', color: '#f8fafc', borderRadius: 9, padding: '10px 14px',
                        fontSize: 12, pointerEvents: 'none', minWidth: 200, maxWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.d.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{parseItemCode(tooltip.d.item).code}</div>
                        <div style={{ fontWeight: 700, color: '#34d399' }}>{fmtCLP(tooltip.d.monto_total)}</div>
                        <div style={{ fontSize: 11, color: '#a78bfa' }}>{tooltip.d.n_formularios} formularios · Clic para ver</div>
                    </div>
                )}
            </div>
            {/* Panel lateral de categoría seleccionada */}
            {panelCat && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1100 }} onClick={() => setPanelCat(null)}>
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 420, background: '#fff',
                        borderLeft: '2px solid #0891b2', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdff' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#0891b2' }}>{panelCat.name}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{parseItemCode(panelCat.item).code} · {panelCat.n_formularios} formularios · {fmtCLP(panelCat.monto_total)}</div>
                            </div>
                            <button onClick={() => setPanelCat(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {panelCat.formularios.map(fsc => <FSCMiniBtn key={`${fsc.folio}-${fsc.anho}`} fsc={fsc} onClickNodo={(f) => { setPanelCat(null); onClickNodo && onClickNodo(f); }} />)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function TabProductos({ gruposProductos, onClickNodo }) {
    const [subTab, setSubTab] = useState('pipeline');

    if (!gruposProductos?.length) return (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
            Sin ítems presupuestarios compartidos entre formularios para el período seleccionado.
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                    <strong style={{ color: '#374151' }}>{gruposProductos.length}</strong> ítems ·{' '}
                    <strong style={{ color: '#374151' }}>{gruposProductos.reduce((s, g) => s + g.n_categorias, 0)}</strong> categorías ·{' '}
                    <strong style={{ color: '#16a34a' }}>{fmtCLP(gruposProductos.reduce((s, g) => s + g.monto_total, 0))}</strong> total estimado
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 9, padding: 3 }}>
                    {SUBTABS_PROD.map(st => (
                        <button key={st.id} onClick={() => setSubTab(st.id)} style={{
                            padding: '5px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12,
                            fontWeight: subTab === st.id ? 700 : 400,
                            background: subTab === st.id ? '#fff' : 'transparent',
                            color: subTab === st.id ? '#0891b2' : '#64748b',
                            boxShadow: subTab === st.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s',
                        }}>{st.label}</button>
                    ))}
                </div>
            </div>
            {subTab === 'pipeline' && <ProductosPipeline gruposProductos={gruposProductos} onClickNodo={onClickNodo} />}
            {subTab === 'acordeon' && <ProductosAcordeon gruposProductos={gruposProductos} onClickNodo={onClickNodo} />}
            {subTab === 'treemap'  && <ProductosTreemap  gruposProductos={gruposProductos} onClickNodo={onClickNodo} />}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

const SUBTABS_VIZ = [
    { id: 'red',       label: '🌐 Red Fuerza',  hint: 'Vista de fuerza — arrastra y explora clusters' },
    { id: 'burbujas',  label: '🔮 Burbujas',     hint: 'Jerarquía de ítems — clic para profundizar nivel a nivel' },
    { id: 'pipeline',  label: '📊 Pipeline',     hint: 'Cascada de niveles — selecciona de izquierda a derecha' },
    { id: 'productos', label: '📦 Productos',    hint: 'Agrupación por ítem → categoría → formularios (3 vistas internas)' },
];

function TabUnificacion({ anioSeleccionado }) {
    const [datos, setDatos]               = useState(null);
    const [cargando, setCargando]         = useState(true);
    const [grupoResaltado, setGrupo]      = useState(null);
    const [subTabViz, setSubTabViz]       = useState('red');
    const [nodoSeleccionado, setNodoSel]  = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setGrupo(null);
        setNodoSel(null);
        const params = anioSeleccionado ? { anho: anioSeleccionado } : {};
        getFormulariosUnificacion(params)
            .then(({ data }) => { if (activo) setDatos(data); })
            .catch(() => { if (activo) setDatos(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anioSeleccionado]);

    const handleClickNodo = useCallback((nodo) => setNodoSel(nodo), []);
    const handleCerrarPanel = useCallback(() => setNodoSel(null), []);

    if (cargando) return <div className="loading-spinner">Cargando análisis de unificación…</div>;
    if (!datos)   return <div className="loading-spinner">No fue posible cargar el análisis.</div>;
    if (!datos.nodos?.length) return (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13 }}>
            No hay formularios en camino (ASDA→DC) para el período seleccionado.
        </div>
    );

    const subtabActual = SUBTABS_VIZ.find(s => s.id === subTabViz);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPIs + Subtabs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ background: '#f5f3ff', borderRadius: 10, padding: '10px 16px', border: '1px solid #ede9fe' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed' }}>{datos.grupos?.length || 0}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>grupos de unificación</div>
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 16px', border: '1px solid #dcfce7' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{datos.total_formularios}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>formularios en camino</div>
                </div>
                <div style={{ background: '#fff7ed', borderRadius: 10, padding: '10px 16px', border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#f97316' }}>{fmtCLP(datos.total_monto)}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>monto total estimado</div>
                </div>
                {/* Subtab selector */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, background: '#f1f5f9', borderRadius: 10, padding: 4, flexShrink: 0 }}>
                    {SUBTABS_VIZ.map(st => (
                        <button key={st.id} onClick={() => setSubTabViz(st.id)} title={st.hint} style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: subTabViz === st.id ? 700 : 400,
                            background: subTabViz === st.id ? '#fff' : 'transparent',
                            color: subTabViz === st.id ? '#7c3aed' : '#64748b',
                            boxShadow: subTabViz === st.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.15s',
                        }}>
                            {st.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Hint del subtab activo */}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: -8 }}>
                💡 {subtabActual?.hint} · Clic en un folio (círculo) para ver detalle completo
            </div>

            {/* Visualizaciones */}
            {subTabViz === 'red' && (
                <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <GrafoUnificacion nodos={datos.nodos} grupos={datos.grupos} grupoResaltado={grupoResaltado} onClickNodo={handleClickNodo} />
                    </div>
                    <div style={{ width: 252, flexShrink: 0, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 12, color: '#374151', flexShrink: 0 }}>
                            Sugerencias
                            <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>({datos.grupos?.length})</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                            <SidebarGrupos grupos={datos.grupos} grupoResaltado={grupoResaltado} onSelect={setGrupo} />
                        </div>
                    </div>
                </div>
            )}

            {subTabViz === 'burbujas' && (
                <GrafoPack grupos={datos.grupos} nodos={datos.nodos} onClickNodo={handleClickNodo} />
            )}

            {subTabViz === 'pipeline' && (
                <GrafoPipeline grupos={datos.grupos} nodos={datos.nodos} onClickNodo={handleClickNodo} />
            )}

            {subTabViz === 'productos' && (
                <TabProductos gruposProductos={datos.grupos_productos || []} onClickNodo={handleClickNodo} />
            )}

            {/* Segunda capa (categorías) solo en vista Red */}
            {subTabViz === 'red' && datos.grupos_categoria?.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
                    <CardsCategoria grupos={datos.grupos_categoria} />
                </div>
            )}

            {/* Panel detalle FSC */}
            {nodoSeleccionado && (
                <PanelDetalleFSC nodo={nodoSeleccionado} onCerrar={handleCerrarPanel} />
            )}
        </div>
    );
}

// ─── Tab Historial de Compras ─────────────────────────────────────────────────

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function KpiMini({ label, valor, color, fmt }) {
    const v = fmt === 'clp' ? fmtCLP(valor) : fmtN(valor);
    return (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: color + '12', border: `1px solid ${color}30`, minWidth: 120 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>{v}</div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{label}</div>
        </div>
    );
}

// Sub-tab A — Pivote ítem × mes
// ─── Drawer: Ficha FSC lateral derecho ──────────────────────────────────────
function DrawerFormularioDetalle({ id, onCerrar }) {
    const [formulario, setFormulario]   = useState(null);
    const [cargando, setCargando]       = useState(false);
    const [error, setError]             = useState(null);
    const [imprimiendo, setImprimiendo] = useState(false);

    useEffect(() => {
        if (!id) return;
        let activo = true;
        setCargando(true);
        setError(null);
        setFormulario(null);
        getFormularioById(id)
            .then(({ data }) => { if (activo) setFormulario(data); })
            .catch(() => { if (activo) setError('No se pudo cargar el formulario.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [id]);

    if (!id) return null;

    const Campo = ({ label, value, mono, span2 }) => (
        <div style={{ display:'flex', flexDirection:'column', gap:2, ...(span2 ? { gridColumn:'span 2' } : {}) }}>
            <span style={{ fontSize:10, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
            <span style={{ fontSize:13, color:'#1e293b', fontFamily: mono?'monospace':'inherit', fontWeight: mono?600:400 }}>
                {value || '—'}
            </span>
        </div>
    );

    const SeccionTitulo = ({ children }) => (
        <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, paddingBottom:6, borderBottom:'2px solid #ede9fe' }}>
            {children}
        </div>
    );

    const handlePrint = async () => {
        if (!formulario) return;
        setImprimiendo(true);
        let productos = [];
        try {
            const params = { folio: formulario.folio, anho: formulario.anho };
            const tipo = parseTipoFormulario(formulario.formulario);
            if (tipo) params.tipo_formulario = tipo;
            const { data } = await getFormulariosProductos(params);
            productos = data.results ?? data;
        } catch (_) {}
        const fmtMoneda = (n) => new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(n ?? 0);
        const fmtNum    = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
        const esc       = (str) => String(str ?? '—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const estadoInfo = ESTADO_FSC_INFO[formulario.estado] || { nombre: formulario.estado || 'Sin estado', color:'#94a3b8' };
        const campo = (label, value, opts = {}) => {
            if (!value && value !== 0) return '';
            return `<div class="campo${opts.span2?' span2':''}"><label>${esc(label)}</label><span class="valor${opts.mono?' mono':''}">${esc(String(value))}</span></div>`;
        };
        const adjuntos = [
            { key:'adj_espec_tecnicas', label:'Espec. Técnicas' },
            { key:'adj_cotizacion', label:'Cotización' },
            { key:'adj_validacion', label:'Validación' },
            { key:'adj_form_justificacion', label:'Form. Justificación' },
        ];
        const adjHtml = adjuntos.map(({ key, label }) =>
            formulario[key]
                ? `<div class="adj-item adj-ok">&#128206; <a href="${esc(formulario[key])}" target="_blank">${esc(label)}</a></div>`
                : `<div class="adj-item adj-no">&#8212; ${esc(label)}</div>`
        ).join('');
        const productosHtml = productos.length === 0
            ? '<p class="sin-datos">Sin productos registrados en el carro.</p>'
            : `<table><thead><tr><th>Categoría</th><th>Producto</th><th>Descripción</th><th class="right">Cantidad</th><th class="right">Monto</th><th>Ítem Presupuestario</th></tr></thead><tbody>
                ${productos.map(p => `<tr><td>${esc(p.categoria)}</td><td>${esc(p.producto)}</td><td>${esc(p.descripcion)}</td><td class="right">${fmtNum(p.cantidad)}</td><td class="right">${fmtMoneda(p.monto)}</td><td>${esc(p.item_presupuestario)}</td></tr>`).join('')}
               </tbody></table>`;
        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>FSC · ${esc(formulario.id_formulario || `Folio ${formulario.folio}`)}</title>
<style>
  @page{size:A4 portrait;margin:18mm 15mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11pt;color:#1e293b;margin:0}
  .header{text-align:center;border-bottom:3px solid #7c3aed;padding-bottom:14px;margin-bottom:18px}.header .org{font-size:9pt;color:#64748b;margin:0 0 4px;text-transform:uppercase}.header h1{font-size:15pt;color:#7c3aed;margin:6px 0;font-weight:800;text-transform:uppercase}
  .header-meta{display:flex;justify-content:center;gap:12px;align-items:center;flex-wrap:wrap;margin-top:8px}.folio-badge{font-family:monospace;font-size:14pt;font-weight:700;color:#7c3aed;background:#ede9fe;border:2px solid #c4b5fd;padding:3px 16px;border-radius:4px}.estado-badge{font-size:10pt;font-weight:700;padding:3px 14px;border-radius:20px}.destino-badge{font-size:9.5pt;color:#7c3aed;background:#f5f3ff;border:1px solid #c4b5fd;padding:2px 12px;border-radius:20px}
  section{margin-bottom:16px}.section-title{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#7c3aed;border-bottom:2px solid #ede9fe;padding-bottom:5px;margin-bottom:10px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 20px}.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px 20px}
  .campo{display:flex;flex-direction:column;gap:2px}.campo.span2{grid-column:span 2}.campo label{font-size:7.5pt;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em}.campo .valor{font-size:11pt;color:#1e293b}.campo .valor.mono{font-family:monospace;font-weight:700}
  p.texto-box{font-size:10.5pt;color:#374151;line-height:1.6;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:9px 12px;white-space:pre-wrap;word-break:break-word;margin:0}p.green-box{border-left:3px solid #16a34a;background:#f0fdf4}p.yellow-box{border-left:3px solid #f59e0b;background:#fffbeb}
  .plan-id{font-family:monospace;font-size:12pt;font-weight:700;color:#15803d;background:#f0fdf4;border:1px solid #86efac;padding:3px 12px;border-radius:4px;display:inline-block}.plan-sin-id-title{font-size:9pt;color:#f59e0b;font-weight:700;margin:0 0 6px}
  .adj-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.adj-item{padding:7px 12px;border-radius:6px;font-size:10pt}.adj-ok{background:#f0f9ff;border:1px solid #bae6fd;color:#0369a1}.adj-ok a{color:#0369a1;text-decoration:none}.adj-no{background:#f8fafc;border:1px dashed #e2e8f0;color:#94a3b8}
  table{width:100%;border-collapse:collapse;font-size:9.5pt}thead{display:table-header-group}th{background:#7c3aed;color:#fff;padding:7px 10px;text-align:left;font-size:8.5pt;font-weight:700}td{padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#374151;vertical-align:top}tr:nth-child(even) td{background:#f8fafc}.right{text-align:right}
  .footer-print{margin-top:20px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:8pt;color:#94a3b8;display:flex;justify-content:space-between}.sin-datos{color:#94a3b8;font-size:10pt;margin:0}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="header"><p class="org">Servicio de Salud Osorno — Organismo 7296</p><h1>Formulario de Solicitud de Compra (FSC)</h1>
<div class="header-meta"><span class="folio-badge">${esc(formulario.id_formulario || `Folio ${formulario.folio}`)}</span>
<span class="estado-badge" style="background:${estadoInfo.color}20;color:${estadoInfo.color};border:1px solid ${estadoInfo.color}50">${esc(formulario.estado||'—')} · ${esc(estadoInfo.nombre)}</span>
${formulario.destino_actual ? `<span class="destino-badge">👤 ${esc(formulario.destino_actual)}</span>` : ''}</div></div>
<section><div class="section-title">Identificación</div><div class="grid-3">
${campo('Folio',formulario.folio,{mono:true})}${campo('Año',formulario.anho)}${campo('Bandeja Actual',estadoInfo.nombre)}
${campo('Fecha Solicitud',formulario.fecha_solicitud)}${campo('Fecha Entrega',formulario.fecha_entrega)}${campo('Monto Estimado',fmtMoneda(formulario.monto_estimado))}
${formulario.destino_actual?campo('Actualmente en bandeja de',formulario.destino_actual,{span2:true}):''}
${formulario.item_presupuestario?campo('Ítem Presupuestario',formulario.item_presupuestario):''}
${formulario.folio_requerimiento?campo('Folio Requerimiento',formulario.folio_requerimiento,{mono:true}):''}
</div></section>
<section><div class="section-title">Solicitante</div><div class="grid-2">
${campo('Unidad Requirente',formulario.unidad_requirente)}${campo('Usuario Requirente',formulario.usuario_requirente)}
${campo('Encargado',formulario.encargado)}${campo('Jefe',formulario.jefe)}${campo('Anexo',formulario.anexo)}${campo('Correo',formulario.correo)}
</div></section>
${formulario.requerimiento?`<section><div class="section-title">Nombre de la Compra</div><p class="texto-box green-box">${esc(formulario.requerimiento)}</p></section>`:''}
${formulario.objetivo_compra?`<section><div class="section-title">Objetivo de Compra</div><p class="texto-box">${esc(formulario.objetivo_compra)}</p></section>`:''}
${formulario.especificaciones_tecnicas?`<section><div class="section-title">Especificaciones Técnicas</div><p class="texto-box">${esc(formulario.especificaciones_tecnicas)}</p></section>`:''}
<section><div class="section-title">Plan de Compras</div>
${formulario.id_plan?`<span class="plan-id">${esc(formulario.id_plan)}</span>`:`<p class="plan-sin-id-title">Sin ID de Plan — Justificación:</p><p class="texto-box yellow-box">${esc(formulario.justificacion||'—')}</p>`}
</section>
<section><div class="section-title">Archivos Adjuntos</div><div class="adj-grid">${adjHtml}</div></section>
<section><div class="section-title">Carro de Productos</div>${productosHtml}</section>
<div class="footer-print"><span>Servicio de Salud Osorno — Sistema de Gestión BD SSO</span><span>Impreso: ${new Date().toLocaleString('es-CL')}</span></div>
</body></html>`;
        const win = window.open('', '_blank', 'width=950,height=780');
        if (win) {
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); setImprimiendo(false); }, 600);
        } else { setImprimiendo(false); }
    };

    const adjuntos = [
        { key:'adj_espec_tecnicas', label:'📎 Espec. Técnicas' },
        { key:'adj_cotizacion', label:'📎 Cotización' },
        { key:'adj_validacion', label:'📎 Validación' },
        { key:'adj_form_justificacion', label:'📎 Form. Justificación' },
    ];

    return (
        <div style={{ position:'fixed', top:0, right:0, bottom:0, width:720, zIndex:1300, background:'#fff', boxShadow:'-8px 0 40px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column', borderLeft:'3px solid #7c3aed' }}>
            {/* Header */}
            <div style={{ padding:'18px 24px 14px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexShrink:0 }}>
                <div>
                    {formulario && (
                        <>
                            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:6 }}>
                                <span style={{ fontSize:16, fontWeight:700, color:'#1e293b', fontFamily:'monospace' }}>
                                    {formulario.id_formulario || `Folio ${formulario.folio}`}
                                </span>
                                <EstadoFSCBadge codigo={formulario.estado} />
                                {formulario.destino_actual && (
                                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:'#f5f3ff', border:'1px solid #c4b5fd', color:'#7c3aed' }}>
                                        👤 {formulario.destino_actual}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize:12, color:'#64748b' }}>{formulario.formulario || 'Formulario de Solicitud de Compra'}</div>
                        </>
                    )}
                    {cargando && <div style={{ fontSize:13, color:'#64748b' }}>Cargando ficha…</div>}
                    {error && <div style={{ fontSize:13, color:'#dc2626' }}>{error}</div>}
                </div>
                <button onClick={onCerrar} style={{ background:'#f1f5f9', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16, color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
            </div>

            {/* Cuerpo scrollable */}
            {formulario && (
                <div style={{ overflowY:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:20, flex:1 }}>
                    <section>
                        <SeccionTitulo>Identificación</SeccionTitulo>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px 20px' }}>
                            <Campo label="Folio" value={formulario.folio} mono />
                            <Campo label="Año" value={formulario.anho} />
                            <Campo label="Bandeja actual" value={(ESTADO_FSC_INFO[formulario.estado] || {}).nombre || formulario.estado} />
                            <Campo label="Fecha Solicitud" value={formulario.fecha_solicitud} />
                            <Campo label="Fecha Entrega" value={formulario.fecha_entrega} />
                            <Campo label="Monto Estimado" value={fmtCLP(formulario.monto_estimado)} />
                            {formulario.destino_actual && <Campo label="Actualmente en bandeja de" value={formulario.destino_actual} span2 />}
                            {formulario.item_presupuestario && <Campo label="Ítem Presupuestario" value={formulario.item_presupuestario} />}
                            {formulario.folio_requerimiento && <Campo label="Folio Requerimiento" value={formulario.folio_requerimiento} mono />}
                        </div>
                    </section>
                    <section>
                        <SeccionTitulo>Solicitante</SeccionTitulo>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'14px 20px' }}>
                            <Campo label="Unidad Requirente" value={formulario.unidad_requirente} />
                            <Campo label="Usuario Requirente" value={formulario.usuario_requirente} />
                            <Campo label="Encargado" value={formulario.encargado} />
                            <Campo label="Jefe" value={formulario.jefe} />
                            <Campo label="Anexo" value={formulario.anexo} />
                            <Campo label="Correo" value={formulario.correo} />
                        </div>
                    </section>
                    {formulario.requerimiento && (
                        <section>
                            <SeccionTitulo>Nombre de la Compra</SeccionTitulo>
                            <p style={{ fontSize:13, color:'#1e293b', lineHeight:1.6, margin:0, background:'#f0fdf4', borderRadius:8, padding:'10px 14px', borderLeft:'3px solid #16a34a', fontWeight:500 }}>
                                {formulario.requerimiento}
                            </p>
                        </section>
                    )}
                    {formulario.objetivo_compra && (
                        <section>
                            <SeccionTitulo>Objetivo de Compra</SeccionTitulo>
                            <p style={{ fontSize:13, color:'#374151', lineHeight:1.6, margin:0, background:'#f8fafc', borderRadius:8, padding:'10px 14px' }}>
                                {formulario.objetivo_compra}
                            </p>
                        </section>
                    )}
                    {formulario.especificaciones_tecnicas && (
                        <section>
                            <SeccionTitulo>Especificaciones Técnicas</SeccionTitulo>
                            <p style={{ fontSize:13, color:'#374151', lineHeight:1.6, margin:0, background:'#f8fafc', borderRadius:8, padding:'10px 14px', whiteSpace:'pre-wrap' }}>
                                {formulario.especificaciones_tecnicas}
                            </p>
                        </section>
                    )}
                    <section>
                        <SeccionTitulo>Plan de Compras</SeccionTitulo>
                        {formulario.id_plan ? (
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <span style={{ fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>ID Plan:</span>
                                <span style={{ fontSize:13, fontFamily:'monospace', color:'#16a34a', fontWeight:700, background:'#f0fdf4', padding:'2px 10px', borderRadius:6 }}>{formulario.id_plan}</span>
                            </div>
                        ) : (
                            <div>
                                <span style={{ fontSize:11, fontWeight:600, color:'#f59e0b', marginBottom:6, display:'block' }}>Sin ID de Plan — Justificación:</span>
                                <p style={{ fontSize:13, color:'#374151', lineHeight:1.6, margin:0, background:'#fffbeb', borderRadius:8, padding:'10px 14px', borderLeft:'3px solid #f59e0b' }}>
                                    {formulario.justificacion || '—'}
                                </p>
                            </div>
                        )}
                    </section>
                    <section>
                        <SeccionTitulo>Archivos Adjuntos</SeccionTitulo>
                        {adjuntos.some(a => formulario[a.key]) ? (
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
                                {adjuntos.map(({ key, label }) => formulario[key] ? (
                                    <a key={key} href={formulario[key]} target="_blank" rel="noopener noreferrer"
                                        style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:8, background:'#f0f9ff', border:'1px solid #bae6fd', color:'#0369a1', fontSize:12, fontWeight:600, textDecoration:'none' }}>
                                        {label}
                                    </a>
                                ) : (
                                    <div key={key} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:8, background:'#f8fafc', border:'1px dashed #e2e8f0', color:'#94a3b8', fontSize:12 }}>
                                        {label.replace('📎','—')}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ fontSize:13, color:'#94a3b8', margin:0 }}>Sin archivos adjuntos registrados.</p>
                        )}
                    </section>
                    <section>
                        <SeccionTitulo>Carro de Productos</SeccionTitulo>
                        <ProductosDelFormulario folio={formulario.folio} anho={formulario.anho} formularioTexto={formulario.formulario} />
                    </section>
                </div>
            )}

            {/* Footer */}
            {formulario && (
                <div style={{ padding:'14px 24px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                    <button onClick={handlePrint} disabled={imprimiendo} style={{ padding:'8px 18px', background: imprimiendo?'#f1f5f9':'#f5f3ff', color: imprimiendo?'#94a3b8':'#7c3aed', border:'1px solid', borderColor: imprimiendo?'#e2e8f0':'#c4b5fd', borderRadius:8, cursor: imprimiendo?'not-allowed':'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:7 }}>
                        {imprimiendo ? '⏳ Preparando…' : '🖨️ Imprimir ficha'}
                    </button>
                    <button onClick={onCerrar} style={{ padding:'8px 18px', background:'#f1f5f9', color:'#374151', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600 }}>
                        Cerrar
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Sub-tab A — Distribución Anual (pivot mapa de calor) ────────────────────
function SubTabPivote({ datos, onVerFSC }) {
    const [agruparPor, setAgruparPor]         = useState('item');
    const [metrica, setMetrica]               = useState('monto');
    const [celdaExpandida, setCeldaExpandida] = useState(null);

    // Base pivot: structural data independent of metrica
    const pivotBase = useMemo(() => {
        const map = {};
        datos.forEach(fsc => {
            const partes = (fsc.fecha_solicitud || '').split('-');
            const mes = partes.length === 3 ? parseInt(partes[1], 10) - 1 : null;
            if (mes === null || mes < 0 || mes > 11) return;
            fsc.productos.forEach(p => {
                const rowKey = agruparPor === 'item'      ? (p.item_presupuestario || '(Sin ítem)')
                             : agruparPor === 'categoria' ? (p.categoria || '(Sin categoría)')
                             :                              (p.producto || '(Sin nombre)');
                if (!map[rowKey]) map[rowKey] = {
                    key: rowKey,
                    meses_monto:    Array(12).fill(0),
                    meses_cantidad: Array(12).fill(0),
                    meses_count:    Array(12).fill(0),
                    meses_fscs: Array.from({ length: 12 }, () => new Map()),
                    total_monto: 0, total_cantidad: 0, total_count: 0,
                };
                map[rowKey].meses_monto[mes]    += p.monto    ?? 0;
                map[rowKey].meses_cantidad[mes] += p.cantidad ?? 0;
                map[rowKey].meses_count[mes]    += 1;
                map[rowKey].total_monto    += p.monto    ?? 0;
                map[rowKey].total_cantidad += p.cantidad ?? 0;
                map[rowKey].total_count    += 1;
                if (!map[rowKey].meses_fscs[mes].has(fsc.id)) {
                    map[rowKey].meses_fscs[mes].set(fsc.id, {
                        id: fsc.id, folio: fsc.folio, anho: fsc.anho,
                        estado: fsc.estado, unidad: fsc.unidad_requirente,
                        usuario: fsc.usuario_requirente, fecha: fsc.fecha_solicitud,
                    });
                }
            });
        });
        return Object.values(map).sort((a, b) => b.total_monto - a.total_monto);
    }, [datos, agruparPor]);

    // Display pivot: adds meses[] based on current metrica
    const pivot = useMemo(() => pivotBase.map(row => ({
        ...row,
        meses: metrica === 'monto'    ? row.meses_monto
             : metrica === 'cantidad' ? row.meses_cantidad
             :                          row.meses_count,
    })), [pivotBase, metrica]);

    useEffect(() => { setCeldaExpandida(null); }, [pivotBase]);

    const maxCell = useMemo(() => Math.max(...pivot.flatMap(r => r.meses), 1), [pivot]);
    const cellBg  = (val, isActive) => {
        if (isActive) return '#ede9fe';
        if (!val) return 'transparent';
        const t = val / maxCell;
        return `rgba(124,58,237,${(0.08 + t * 0.65).toFixed(2)})`;
    };
    const cellTxt = (val) => {
        if (!val) return null;
        if (metrica === 'monto') return val >= 1_000_000 ? `${(val/1_000_000).toFixed(1)}M` : val >= 1_000 ? `${(val/1_000).toFixed(0)}K` : fmtN(val);
        return fmtN(val);
    };
    const totalFmt = (r) => metrica === 'monto' ? fmtCLP(r.total_monto) : metrica === 'cantidad' ? fmtN(r.total_cantidad) : fmtN(r.total_count);

    const handleCeldaClick = (rowKey, mesIdx, val) => {
        if (!val) return;
        setCeldaExpandida(old => (old?.rowKey === rowKey && old?.mesIdx === mesIdx) ? null : { rowKey, mesIdx });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Agrupar por:</span>
                {[{ id:'item', label:'Ítem Presupuestario' },{ id:'categoria', label:'Categoría' },{ id:'producto', label:'Producto' }].map(o => (
                    <FiltroChip key={o.id} activo={agruparPor === o.id} color="#7c3aed" onClick={() => setAgruparPor(o.id)}>{o.label}</FiltroChip>
                ))}
                <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Métrica:</span>
                {[{ id:'monto', label:'Monto ($)' },{ id:'cantidad', label:'Cantidad' },{ id:'count', label:'N° FSC' }].map(o => (
                    <FiltroChip key={o.id} activo={metrica === o.id} color="#0891b2" onClick={() => setMetrica(o.id)}>{o.label}</FiltroChip>
                ))}
                {celdaExpandida && (
                    <button onClick={() => setCeldaExpandida(null)} style={{ marginLeft:'auto', padding:'4px 12px', border:'1px solid #e2e8f0', borderRadius:6, background:'#fff', fontSize:11, cursor:'pointer', color:'#64748b' }}>
                        ✕ Cerrar detalle
                    </button>
                )}
            </div>
            {pivot.length === 0 ? (
                <div style={{ textAlign:'center', padding: 40, color:'#94a3b8', fontSize: 13 }}>Sin datos con los filtros seleccionados.</div>
            ) : (
                <div className="card" style={{ overflowX:'auto' }}>
                    <table style={{ borderCollapse:'collapse', width:'100%', fontSize: 11 }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, position:'sticky', left:0, minWidth:200, zIndex:1 }}>
                                    {agruparPor === 'item' ? 'Ítem Presupuestario' : agruparPor === 'categoria' ? 'Categoría' : 'Producto'}
                                </th>
                                {MESES.map(m => <th key={m} style={{ ...thStyle, textAlign:'center', minWidth:58 }}>{m}</th>)}
                                <th style={{ ...thStyle, textAlign:'right', background:'#ede9fe', color:'#7c3aed', minWidth:90 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivot.map((row, i) => {
                                const isExpRow = celdaExpandida?.rowKey === row.key;
                                const expandedFSCs = isExpRow ? [...row.meses_fscs[celdaExpandida.mesIdx].values()] : [];
                                return (
                                    <React.Fragment key={row.key}>
                                        <tr style={{ borderBottom: isExpRow ? 'none' : '1px solid #f1f5f9', background: isExpRow ? '#f5f3ff' : i%2===0?'#fff':'#fafafa' }}>
                                            <td style={{ padding:'7px 10px', position:'sticky', left:0, background: isExpRow?'#f5f3ff': i%2===0?'#fff':'#fafafa', fontWeight:500, fontSize:11, color:'#1e293b', zIndex:1, maxWidth:240 }}>
                                                <div className="truncate-text" title={row.key}>{row.key}</div>
                                            </td>
                                            {row.meses.map((val, mi) => {
                                                const isActive = isExpRow && celdaExpandida.mesIdx === mi;
                                                return (
                                                    <td key={mi} onClick={() => handleCeldaClick(row.key, mi, val)}
                                                        style={{ padding:'5px 6px', textAlign:'center', background: cellBg(val, isActive), cursor: val > 0 ? 'pointer' : 'default', outline: isActive ? '2px solid #7c3aed' : 'none', outlineOffset: -2, transition:'background 0.1s' }}
                                                        title={val > 0 ? `${MESES[mi]}: ${cellTxt(val)} — clic para ver FSC` : undefined}>
                                                        {val > 0
                                                            ? <span style={{ fontSize:10, fontWeight:600, color: isActive?'#4c1d95': val/maxCell > 0.55 ? '#fff' : '#4c1d95' }}>{cellTxt(val)}</span>
                                                            : <span style={{ color:'#e2e8f0', fontSize:10 }}>—</span>}
                                                    </td>
                                                );
                                            })}
                                            <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, fontSize:11, color:'#7c3aed', background:'#faf5ff' }}>
                                                {totalFmt(row)}
                                            </td>
                                        </tr>
                                        {isExpRow && (
                                            <tr style={{ background:'#faf5ff' }}>
                                                <td colSpan={14} style={{ padding:'10px 20px 14px 20px', borderBottom:'1px solid #e2e8f0' }}>
                                                    <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                                                        📋 {MESES[celdaExpandida.mesIdx]} — {expandedFSCs.length} formulario(s) con "{row.key}":
                                                    </div>
                                                    {expandedFSCs.length === 0 ? (
                                                        <span style={{ fontSize:11, color:'#94a3b8' }}>Sin formularios.</span>
                                                    ) : (
                                                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                                            <thead>
                                                                <tr>
                                                                    <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Folio</th>
                                                                    <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Fecha</th>
                                                                    <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Estado</th>
                                                                    <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Unidad</th>
                                                                    <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Usuario</th>
                                                                    <th style={{ ...thStyle, fontSize:10, padding:'5px 8px', textAlign:'center' }}>Acciones</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {expandedFSCs.map((fsc, j) => (
                                                                    <tr key={fsc.id} style={{ borderBottom:'1px solid #ede9fe', background: j%2===0?'#fff':'#f5f3ff' }}>
                                                                        <td style={{ padding:'5px 8px', fontFamily:'monospace', color:'#7c3aed', fontWeight:600 }}>#{fsc.folio}</td>
                                                                        <td style={{ padding:'5px 8px', color:'#64748b', whiteSpace:'nowrap' }}>{fsc.fecha || '—'}</td>
                                                                        <td style={{ padding:'5px 8px' }}><EstadoFSCBadge codigo={fsc.estado} /></td>
                                                                        <td style={{ padding:'5px 8px', color:'#374151', maxWidth:180 }}><div className="truncate-text" title={fsc.unidad}>{fsc.unidad || '—'}</div></td>
                                                                        <td style={{ padding:'5px 8px', color:'#374151', maxWidth:120 }}><div className="truncate-text" title={fsc.usuario}>{fsc.usuario || '—'}</div></td>
                                                                        <td style={{ padding:'5px 8px', textAlign:'center' }}>
                                                                            <button onClick={() => onVerFSC?.(fsc.id)} style={{ padding:'3px 10px', border:'1px solid #c4b5fd', borderRadius:6, background:'#f5f3ff', color:'#7c3aed', fontSize:10, fontWeight:600, cursor:'pointer' }}>
                                                                                👁 Ver
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Sub-tab B — Repeticiones / Duplicados
function SubTabRepeticiones({ datos, onVerFSC }) {
    const [expandido, setExpandido]       = useState(null);
    const [soloRepetidos, setSoloRepetidos] = useState(false);

    const agrupados = useMemo(() => {
        const map = {};
        datos.forEach(fsc => {
            fsc.productos.forEach(p => {
                const key = `${p.item_presupuestario}‖${p.producto}`;
                if (!map[key]) map[key] = { producto: p.producto, categoria: p.categoria, item_presupuestario: p.item_presupuestario, total_cantidad: 0, total_monto: 0, solicitudes: [] };
                map[key].total_cantidad += p.cantidad;
                map[key].total_monto    += p.monto;
                map[key].solicitudes.push({ id: fsc.id, folio: fsc.folio, anho: fsc.anho, unidad: fsc.unidad_requirente, usuario: fsc.usuario_requirente, fecha: fsc.fecha_solicitud, estado: fsc.estado, cantidad: p.cantidad, monto: p.monto });
            });
        });
        return Object.values(map).sort((a, b) => b.solicitudes.length - a.solicitudes.length || b.total_monto - a.total_monto);
    }, [datos]);

    const items     = soloRepetidos ? agrupados.filter(a => a.solicitudes.length > 1) : agrupados;
    const repetidos = agrupados.filter(a => a.solicitudes.length > 1).length;
    const totalMonto = agrupados.reduce((s, a) => s + a.total_monto, 0);

    return (
        <div style={{ display:'flex', flexDirection:'column', gap: 14 }}>
            <div style={{ display:'flex', gap: 10, alignItems:'center', flexWrap:'wrap' }}>
                <KpiMini label="Productos únicos" valor={agrupados.length} color="#7c3aed" />
                <KpiMini label="Con repeticiones"  valor={repetidos}        color="#f97316" />
                <KpiMini label="Solicitudes"        valor={datos.length}     color="#0891b2" />
                <KpiMini label="Monto total"        valor={totalMonto}       color="#16a34a" fmt="clp" />
                <label style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap: 7, fontSize: 12, color:'#64748b', cursor:'pointer', fontWeight: 600 }}>
                    <input type="checkbox" checked={soloRepetidos} onChange={e => setSoloRepetidos(e.target.checked)} />
                    Solo repetidos ({repetidos})
                </label>
            </div>
            <div className="card">
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ ...thStyle, width: 28 }} />
                            <th style={thStyle}>Ítem Presupuestario</th>
                            <th style={thStyle}>Producto</th>
                            <th style={thStyle}>Categoría</th>
                            <th style={{ ...thStyle, textAlign:'center' }}>Solicitudes</th>
                            <th style={{ ...thStyle, textAlign:'right' }}>Total Cantidad</th>
                            <th style={{ ...thStyle, textAlign:'right' }}>Total Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && (
                            <tr><td colSpan={7} style={{ textAlign:'center', padding: 32, color:'#94a3b8' }}>Sin productos.</td></tr>
                        )}
                        {items.map((item, i) => {
                            const key   = `${item.item_presupuestario}‖${item.producto}`;
                            const isDup = item.solicitudes.length > 1;
                            const open  = expandido === key;
                            return (
                                <React.Fragment key={key}>
                                    <tr onClick={() => setExpandido(open ? null : key)}
                                        style={{ borderBottom:'1px solid #f1f5f9', background: open ? '#f5f3ff' : i%2===0?'#fff':'#fafafa', cursor:'pointer' }}>
                                        <td style={{ padding:'7px 6px', textAlign:'center' }}>
                                            <span style={{ fontSize:11, color:'#94a3b8' }}>{open ? '▼' : '▶'}</span>
                                        </td>
                                        <td style={{ padding:'7px 10px', fontSize:12, fontFamily:'monospace', color: item.item_presupuestario ? '#1e293b' : '#94a3b8' }}>
                                            {item.item_presupuestario || '—'}
                                        </td>
                                        <td style={{ padding:'7px 10px', fontSize:12, color:'#1e293b', maxWidth:280 }}>
                                            <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
                                                {isDup && <span style={{ padding:'1px 7px', background:'#fff7ed', color:'#ea580c', border:'1px solid #fed7aa', borderRadius:20, fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>⚠️ ×{item.solicitudes.length}</span>}
                                                <span className="truncate-text" title={item.producto}>{item.producto || '—'}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding:'7px 10px', fontSize:12, color:'#64748b' }}>{item.categoria || '—'}</td>
                                        <td style={{ padding:'7px 10px', textAlign:'center' }}>
                                            <span style={{ padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:700, background: isDup?'#fff7ed':'#f0fdf4', color: isDup?'#ea580c':'#16a34a', border:`1px solid ${isDup?'#fed7aa':'#86efac'}` }}>
                                                {item.solicitudes.length}
                                            </span>
                                        </td>
                                        <td style={{ padding:'7px 10px', textAlign:'right', fontSize:12, color:'#374151', fontFamily:'monospace' }}>{fmtN(item.total_cantidad)}</td>
                                        <td style={{ padding:'7px 10px', textAlign:'right', fontSize:12, color:'#374151', fontWeight:500 }}>{fmtCLP(item.total_monto)}</td>
                                    </tr>
                                    {open && (
                                        <tr style={{ background:'#faf5ff' }}>
                                            <td colSpan={7} style={{ padding:'10px 20px 14px 44px' }}>
                                                <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', marginBottom: 8, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                                                    FSC que incluyen este producto:
                                                </div>
                                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                                    <thead>
                                                        <tr>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Folio</th>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Fecha</th>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Estado</th>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Unidad</th>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Usuario</th>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px', textAlign:'right' }}>Cantidad</th>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px', textAlign:'right' }}>Monto</th>
                                                            <th style={{ ...thStyle, fontSize:10, padding:'5px 8px', textAlign:'center' }}>Acciones</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {item.solicitudes.map((s, j) => (
                                                            <tr key={j} style={{ borderBottom:'1px solid #ede9fe' }}>
                                                                <td style={{ padding:'5px 8px', fontFamily:'monospace', color:'#7c3aed', fontWeight:600 }}>#{s.folio}</td>
                                                                <td style={{ padding:'5px 8px', color:'#64748b', whiteSpace:'nowrap' }}>{s.fecha || '—'}</td>
                                                                <td style={{ padding:'5px 8px' }}><EstadoFSCBadge codigo={s.estado} /></td>
                                                                <td style={{ padding:'5px 8px', color:'#374151', maxWidth:180 }}><div className="truncate-text" title={s.unidad}>{s.unidad || '—'}</div></td>
                                                                <td style={{ padding:'5px 8px', color:'#374151', maxWidth:140 }}><div className="truncate-text" title={s.usuario}>{s.usuario || '—'}</div></td>
                                                                <td style={{ padding:'5px 8px', textAlign:'right', color:'#374151' }}>{fmtN(s.cantidad)}</td>
                                                                <td style={{ padding:'5px 8px', textAlign:'right', color:'#374151' }}>{fmtCLP(s.monto)}</td>
                                                                <td style={{ padding:'5px 8px', textAlign:'center' }}>
                                                                    <button onClick={() => onVerFSC?.(s.id)} style={{ padding:'3px 10px', border:'1px solid #c4b5fd', borderRadius:6, background:'#f5f3ff', color:'#7c3aed', fontSize:10, fontWeight:600, cursor:'pointer' }}>
                                                                        👁 Ver
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Sub-tab C — Por Solicitud (cronológico)
function SubTabCronologico({ datos, onVerFSC }) {
    const [expandido, setExpandido] = useState(null);

    if (datos.length === 0) return (
        <div style={{ textAlign:'center', padding: 40, color:'#94a3b8', fontSize: 13 }}>Sin solicitudes con los filtros seleccionados.</div>
    );

    return (
        <div className="card">
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ ...thStyle, width:28 }} />
                        <th style={thStyle}>Folio</th>
                        <th style={thStyle}>Fecha Solicitud</th>
                        <th style={thStyle}>Estado</th>
                        <th style={thStyle}>Unidad Requirente</th>
                        <th style={thStyle}>Usuario</th>
                        <th style={thStyle}>Requerimiento</th>
                        <th style={{ ...thStyle, textAlign:'center' }}>Productos</th>
                        <th style={{ ...thStyle, textAlign:'right' }}>Monto</th>
                        <th style={{ ...thStyle, textAlign:'center' }}>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {datos.map((fsc, i) => {
                        const isOpen = expandido === fsc.id;
                        return (
                            <React.Fragment key={fsc.id}>
                                <tr onClick={() => setExpandido(isOpen ? null : fsc.id)}
                                    style={{ borderBottom:'1px solid #f1f5f9', background: isOpen?'#f5f3ff':i%2===0?'#fff':'#fafafa', cursor:'pointer' }}>
                                    <td style={{ padding:'7px 6px', textAlign:'center' }}>
                                        <span style={{ fontSize:11, color:'#94a3b8' }}>{isOpen ? '▼' : '▶'}</span>
                                    </td>
                                    <td style={{ padding:'7px 10px' }}>
                                        <span style={{ fontFamily:'monospace', fontWeight:600, fontSize:12, color:'#7c3aed', background:'#f5f3ff', padding:'2px 7px', borderRadius:5 }}>
                                            #{fsc.folio}
                                        </span>
                                    </td>
                                    <td style={{ padding:'7px 10px', fontSize:12, color:'#374151', whiteSpace:'nowrap' }}>{fsc.fecha_solicitud || '—'}</td>
                                    <td style={{ padding:'7px 10px' }}><EstadoFSCBadge codigo={fsc.estado} /></td>
                                    <td style={{ padding:'7px 10px', maxWidth:200 }}><div className="truncate-text" title={fsc.unidad_requirente} style={{ fontSize:12, color:'#374151' }}>{fsc.unidad_requirente || '—'}</div></td>
                                    <td style={{ padding:'7px 10px', maxWidth:140 }}><div className="truncate-text" title={fsc.usuario_requirente} style={{ fontSize:12, color:'#374151' }}>{fsc.usuario_requirente || '—'}</div></td>
                                    <td style={{ padding:'7px 10px', maxWidth:260 }}><div className="truncate-text" title={fsc.requerimiento} style={{ fontSize:11, color:'#374151' }}>{fsc.requerimiento || '—'}</div></td>
                                    <td style={{ padding:'7px 10px', textAlign:'center' }}>
                                        <span style={{ fontSize:12, fontWeight:600, color: fsc.productos.length > 0 ? '#16a34a' : '#94a3b8' }}>
                                            {fsc.productos.length > 0 ? `${fsc.productos.length}` : '—'}
                                        </span>
                                    </td>
                                    <td style={{ padding:'7px 10px', textAlign:'right', fontSize:12, color:'#374151', fontWeight:500 }}>{fmtCLP(fsc.monto_estimado)}</td>
                                    <td style={{ padding:'7px 10px', textAlign:'center' }}>
                                        <button onClick={e => { e.stopPropagation(); onVerFSC?.(fsc.id); }} style={{ padding:'3px 10px', border:'1px solid #c4b5fd', borderRadius:6, background:'#f5f3ff', color:'#7c3aed', fontSize:10, fontWeight:600, cursor:'pointer' }}>
                                            👁 Ver
                                        </button>
                                    </td>
                                </tr>
                                {isOpen && (
                                    <tr style={{ background:'#faf5ff' }}>
                                        <td colSpan={10} style={{ padding:'10px 20px 14px 44px' }}>
                                            {fsc.productos.length === 0 ? (
                                                <span style={{ fontSize:12, color:'#94a3b8' }}>Este formulario no registra productos en el carro.</span>
                                            ) : (
                                                <>
                                                    <div style={{ fontSize:11, fontWeight:700, color:'#7c3aed', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                                                        Productos en el carro ({fsc.productos.length}):
                                                    </div>
                                                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Categoría</th>
                                                                <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Producto</th>
                                                                <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Descripción</th>
                                                                <th style={{ ...thStyle, fontSize:10, padding:'5px 8px', textAlign:'right' }}>Cant.</th>
                                                                <th style={{ ...thStyle, fontSize:10, padding:'5px 8px', textAlign:'right' }}>Monto</th>
                                                                <th style={{ ...thStyle, fontSize:10, padding:'5px 8px' }}>Ítem Presupuestario</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {fsc.productos.map((p, j) => (
                                                                <tr key={j} style={{ borderBottom:'1px solid #ede9fe', background: j%2===0?'#fff':'#f5f3ff' }}>
                                                                    <td style={{ padding:'5px 8px', color:'#374151' }}>{p.categoria || '—'}</td>
                                                                    <td style={{ padding:'5px 8px', color:'#374151', fontWeight:500 }}>{p.producto || '—'}</td>
                                                                    <td style={{ padding:'5px 8px', maxWidth:240 }}><div className="truncate-text" title={p.descripcion} style={{ color:'#64748b' }}>{p.descripcion || '—'}</div></td>
                                                                    <td style={{ padding:'5px 8px', textAlign:'right', color:'#374151' }}>{fmtN(p.cantidad)}</td>
                                                                    <td style={{ padding:'5px 8px', textAlign:'right', color:'#374151' }}>{fmtCLP(p.monto)}</td>
                                                                    <td style={{ padding:'5px 8px', fontFamily:'monospace', fontSize:10, color:'#7c3aed' }}>{p.item_presupuestario || '—'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// Tab principal Historial
const SUBTABS_HISTORIAL = [
    { id: 'repeticiones', label: 'Repeticiones',      icono: '🔁', desc: 'Productos pedidos más de una vez' },
    { id: 'pivote',       label: 'Distribución Anual', icono: '📊', desc: 'Ítem / categoría por mes (mapa de calor)' },
    { id: 'cronologico',  label: 'Por Solicitud',      icono: '📋', desc: 'Cada FSC con su carro de productos' },
];

const ESTADOS_HISTORIAL = ['FR', 'FA', 'ASDA', 'ADIR', 'AA', 'DC', 'AC'];

function TabHistorial({ anioSeleccionado }) {
    const [subtab, setSubtab]             = useState('repeticiones');
    const [datos, setDatos]               = useState([]);
    const [cargando, setCargando]         = useState(false);
    const [error, setError]               = useState(null);
    const [filtroUnidad, setFiltroUnidad]     = useState('');
    const [filtroUsuario, setFiltroUsuario]   = useState('');
    const [filtroEstados, setFiltroEstados]   = useState([]);
    const [drawerFSCId, setDrawerFSCId]       = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(null);
        const params = {};
        if (anioSeleccionado) params.anho = anioSeleccionado;
        getFormulariosHistorial(params)
            .then(({ data }) => { if (activo) setDatos(Array.isArray(data) ? data : (data.results ?? [])); })
            .catch(() => { if (activo) setError('No se pudieron cargar los datos del historial.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anioSeleccionado]);

    // Reset usuario al cambiar unidad
    useEffect(() => { setFiltroUsuario(''); }, [filtroUnidad]);

    const unidades = useMemo(() => [...new Set(datos.map(f => f.unidad_requirente).filter(Boolean))].sort(), [datos]);
    const usuarios = useMemo(() => {
        const base = filtroUnidad ? datos.filter(f => f.unidad_requirente === filtroUnidad) : datos;
        return [...new Set(base.map(f => f.usuario_requirente).filter(Boolean))].sort();
    }, [datos, filtroUnidad]);

    const datosFiltrados = useMemo(() => datos.filter(f => {
        if (filtroUnidad  && f.unidad_requirente  !== filtroUnidad)  return false;
        if (filtroUsuario && f.usuario_requirente !== filtroUsuario) return false;
        if (filtroEstados.length > 0 && !filtroEstados.includes(f.estado)) return false;
        return true;
    }), [datos, filtroUnidad, filtroUsuario, filtroEstados]);

    const totalProductos = useMemo(() => datosFiltrados.reduce((s, f) => s + f.productos.length, 0), [datosFiltrados]);

    return (
        <div style={{ display:'flex', flexDirection:'column', gap: 16 }}>
            {/* Filtros */}
            <div style={{ display:'flex', alignItems:'center', gap: 10, flexWrap:'wrap', background:'#f8fafc', padding:'12px 16px', borderRadius:10, border:'1px solid #e2e8f0' }}>
                <span style={{ fontSize:12, color:'#64748b', fontWeight:600 }}>🔍 Filtrar por:</span>
                <select value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)} className="filtro-select" style={{ minWidth:220 }}>
                    <option value="">Todas las unidades</option>
                    {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)} className="filtro-select" style={{ minWidth:180 }}
                    disabled={!filtroUnidad && usuarios.length > 50}>
                    <option value="">Todos los usuarios</option>
                    {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {(filtroUnidad || filtroUsuario || filtroEstados.length > 0) && (
                    <button onClick={() => { setFiltroUnidad(''); setFiltroUsuario(''); setFiltroEstados([]); }}
                        style={{ padding:'5px 12px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, fontSize:12, cursor:'pointer', color:'#64748b' }}>
                        ✕ Limpiar
                    </button>
                )}
                <span style={{ marginLeft:'auto', fontSize:12, color:'#64748b', background:'#fff', padding:'5px 12px', borderRadius:20, border:'1px solid #e2e8f0', fontWeight:600 }}>
                    {datosFiltrados.length} solicitudes · {totalProductos} productos
                </span>
            </div>
            {/* Filtro por Estado */}
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, color:'#64748b', fontWeight:600, whiteSpace:'nowrap' }}>Bandeja:</span>
                {ESTADOS_HISTORIAL.map(est => {
                    const info = ESTADO_FSC_INFO[est] || { nombre: est, color:'#94a3b8' };
                    return (
                        <FiltroChip key={est} activo={filtroEstados.includes(est)} color={info.color}
                            onClick={() => setFiltroEstados(prev => prev.includes(est) ? prev.filter(e => e !== est) : [...prev, est])}>
                            {est} · {info.nombre}
                        </FiltroChip>
                    );
                })}
            </div>

            {/* Sub-tabs */}
            <div style={{ display:'flex', gap: 4, borderBottom:'2px solid #e5e7eb' }}>
                {SUBTABS_HISTORIAL.map(s => (
                    <button key={s.id} onClick={() => setSubtab(s.id)} title={s.desc}
                        style={{
                            padding:'8px 16px', border:'none', background:'none',
                            fontWeight:600, fontSize:12, cursor:'pointer',
                            color: subtab === s.id ? '#7c3aed' : '#64748b',
                            borderBottom: subtab === s.id ? '2px solid #7c3aed' : '2px solid transparent',
                            marginBottom: -2, whiteSpace:'nowrap',
                        }}>
                        {s.icono} {s.label}
                    </button>
                ))}
            </div>

            {cargando && <div style={{ textAlign:'center', padding: 40, color:'#64748b' }}>Cargando historial…</div>}
            {error    && <div style={{ color:'#dc2626', padding:16, background:'#fef2f2', borderRadius:8 }}>{error}</div>}

            {!cargando && !error && subtab === 'repeticiones' && <SubTabRepeticiones datos={datosFiltrados} onVerFSC={setDrawerFSCId} />}
            {!cargando && !error && subtab === 'pivote'       && <SubTabPivote       datos={datosFiltrados} onVerFSC={setDrawerFSCId} />}
            {!cargando && !error && subtab === 'cronologico'  && <SubTabCronologico  datos={datosFiltrados} onVerFSC={setDrawerFSCId} />}

            <DrawerFormularioDetalle id={drawerFSCId} onCerrar={() => setDrawerFSCId(null)} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'solicitudes',  label: 'Solicitudes (FSC)',      icono: '📝' },
    { id: 'derivados',    label: 'Derivados a Comprador',  icono: '➡️' },
    { id: 'unificacion',  label: 'Compras Conjuntas',      icono: '🔗' },
    { id: 'alertas',      label: 'Alertas / Demoras',      icono: '⏰' },
    { id: 'historial',    label: 'Historial de Compras',   icono: '📦' },
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

            {tab === 'unificacion' && (
                <TabUnificacion anioSeleccionado={anioGlobal} />
            )}

            {tab === 'alertas' && (
                <TabAlertas anioSeleccionado={anioGlobal} />
            )}

            {tab === 'historial' && (
                <TabHistorial anioSeleccionado={anioGlobal} />
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
