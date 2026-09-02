import React, { useEffect, useState } from 'react';
import { getFormularioDerivadoDetalle, getProductosFormulario } from '../api/comprasApi';

const fmtN = (n) => new Intl.NumberFormat('es-CL').format(n ?? 0);
const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const RE_TIPO_FORMULARIO = /Nro\s*(\d+)/i;
const parseTipoFormulario = (texto) => {
    const m = texto?.match(RE_TIPO_FORMULARIO);
    return m ? Number(m[1]) : null;
};

// Espejo exacto de ESTADO_FSC_INFO en features/abastecimiento/components/FormulariosPage.jsx
// — mismas 9 bandejas de visación del Panel SSO, mismos colores.
const ESTADO_FSC_INFO = {
    P:    { nombre: 'Pendiente Firmas',                        color: '#d97706' },
    FR:   { nombre: 'Revisor Finanzas',                        color: '#2563eb' },
    FA:   { nombre: 'Autorizador Finanzas',                    color: '#4f46e5' },
    ASDA: { nombre: 'Autorizador Sub Director Administrativo', color: '#7c3aed' },
    ADIR: { nombre: 'Autorizador Director',                    color: '#a21caf' },
    AA:   { nombre: 'Autorizador Abastecimiento',              color: '#0891b2' },
    DC:   { nombre: 'Derivación Compras',                      color: '#1d4ed8' },
    AC:   { nombre: 'A Comprador',                             color: '#15803d' },
    R:    { nombre: 'Rechazado',                                color: '#b91c1c' },
};

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

const thStyle = {
    padding: '9px 10px', textAlign: 'left', fontWeight: 600,
    color: '#475569', borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12,
};

function ProductosDelFormulario({ folio, anho, formularioTexto }) {
    const [estado, setEstado] = useState('cargando');
    const [productos, setProductos] = useState([]);

    useEffect(() => {
        let activo = true;
        setEstado('cargando');
        const params = { folio, anho };
        const tipo = parseTipoFormulario(formularioTexto);
        if (tipo) params.tipo_formulario = tipo;
        getProductosFormulario(params)
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
                                ? <span style={{ color: '#374151' }}>{p.item_presupuestario}</span>
                                : <span style={{ color: '#f97316', fontSize: 11, fontWeight: 600, background: '#fff7ed', padding: '1px 7px', borderRadius: 10, border: '1px solid #fed7aa' }}>⚠️ Sin ítem</span>
                            }
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// Detalle completo de un FSC — réplica exacta (mismos campos, misma
// impresión A4) del ModalDocumento de
// features/abastecimiento/components/FormulariosPage.jsx, adaptada para
// abrirse solo con el id (se resuelve el resto acá) desde cualquier
// contexto del módulo Compras (Mis Formularios, panel de proceso).
export default function ModalDetalleFsc({ fscId, onCerrar }) {
    const [formulario, setFormulario] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [imprimiendo, setImprimiendo] = useState(false);

    useEffect(() => {
        if (!fscId) return;
        let activo = true;
        setCargando(true);
        setError(null);
        getFormularioDerivadoDetalle(fscId)
            .then(({ data }) => { if (activo) setFormulario(data); })
            .catch(() => { if (activo) setError('No fue posible cargar el detalle del formulario.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [fscId]);

    if (!fscId) return null;

    const handlePrint = async () => {
        if (!formulario) return;
        setImprimiendo(true);
        let productos = [];
        try {
            const params = { folio: formulario.folio, anho: formulario.anho };
            const tipo = parseTipoFormulario(formulario.formulario);
            if (tipo) params.tipo_formulario = tipo;
            const { data } = await getProductosFormulario(params);
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
  .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 14px; margin-bottom: 18px; }
  .header .org { font-size: 9pt; color: #64748b; margin: 0 0 4px; letter-spacing: 0.04em; text-transform: uppercase; }
  .header h1 { font-size: 15pt; color: #7c3aed; margin: 6px 0; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
  .header-meta { display: flex; justify-content: center; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  .folio-badge { font-family: monospace; font-size: 14pt; font-weight: 700; color: #7c3aed; background: #ede9fe; border: 2px solid #c4b5fd; padding: 3px 16px; border-radius: 4px; }
  .estado-badge { font-size: 10pt; font-weight: 700; padding: 3px 14px; border-radius: 20px; }
  .destino-badge { font-size: 9.5pt; color: #7c3aed; background: #f5f3ff; border: 1px solid #c4b5fd; padding: 2px 12px; border-radius: 20px; }
  section { margin-bottom: 16px; }
  .section-title { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #7c3aed; border-bottom: 2px solid #ede9fe; padding-bottom: 5px; margin-bottom: 10px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 20px; }
  .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px; }
  .campo { display: flex; flex-direction: column; gap: 2px; }
  .campo.span2 { grid-column: span 2; }
  .campo label { font-size: 7.5pt; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
  .campo .valor { font-size: 11pt; color: #1e293b; }
  .campo .valor.mono { font-family: monospace; font-weight: 700; }
  p.texto-box { font-size: 10.5pt; color: #374151; line-height: 1.6; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 9px 12px; white-space: pre-wrap; word-break: break-word; margin: 0; }
  p.green-box  { border-left: 3px solid #16a34a; background: #f0fdf4; }
  p.yellow-box { border-left: 3px solid #f59e0b; background: #fffbeb; }
  .plan-id { font-family: monospace; font-size: 12pt; font-weight: 700; color: #15803d; background: #f0fdf4; border: 1px solid #86efac; padding: 3px 12px; border-radius: 4px; display: inline-block; }
  .plan-sin-id-title { font-size: 9pt; color: #f59e0b; font-weight: 700; margin: 0 0 6px; }
  .adj-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .adj-item { padding: 7px 12px; border-radius: 6px; font-size: 10pt; }
  .adj-ok { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; }
  .adj-ok a { color: #0369a1; text-decoration: none; }
  .adj-no { background: #f8fafc; border: 1px dashed #e2e8f0; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  th { background: #7c3aed; color: #fff; padding: 7px 10px; text-align: left; font-size: 8.5pt; font-weight: 700; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #374151; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .right { text-align: right; }
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

    const adjuntos = [
        { key: 'adj_espec_tecnicas',     label: '📎 Espec. Técnicas' },
        { key: 'adj_cotizacion',         label: '📎 Cotización' },
        { key: 'adj_validacion',         label: '📎 Validación' },
        { key: 'adj_form_justificacion', label: '📎 Form. Justificación' },
    ];
    const hayAdjuntos = formulario && adjuntos.some(a => formulario[a.key]);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
             onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

                <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                                {formulario?.id_formulario || (formulario ? `Folio ${formulario.folio}` : 'Cargando…')}
                            </span>
                            {formulario && <EstadoFSCBadge codigo={formulario.estado} />}
                            {formulario?.destino_actual && (
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
                            {formulario?.formulario || 'Formulario de Solicitud de Compra'}
                        </div>
                    </div>
                    <button onClick={onCerrar} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#64748b', flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {cargando && <div className="loading-spinner">Cargando…</div>}
                    {error && <div className="error-message">{error}</div>}

                    {formulario && (
                        <>
                            <section>
                                <SeccionTitulo>Identificación</SeccionTitulo>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px' }}>
                                    <Campo label="Folio" value={formulario.folio} mono />
                                    <Campo label="Año" value={formulario.anho} />
                                    <Campo label="Bandeja actual" value={(ESTADO_FSC_INFO[formulario.estado] || { nombre: formulario.estado }).nombre} />
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
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 20px' }}>
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
                                    <p style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6, margin: 0, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid #16a34a', fontWeight: 500 }}>
                                        {formulario.requerimiento}
                                    </p>
                                </section>
                            )}

                            {formulario.objetivo_compra && (
                                <section>
                                    <SeccionTitulo>Objetivo de Compra</SeccionTitulo>
                                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
                                        {formulario.objetivo_compra}
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
                                    <div>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 6, display: 'block' }}>Sin ID de Plan — Justificación:</span>
                                        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, background: '#fffbeb', borderRadius: 8, padding: '10px 14px', borderLeft: '3px solid #f59e0b' }}>
                                            {formulario.justificacion || '—'}
                                        </p>
                                    </div>
                                )}
                            </section>

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

                            <section>
                                <SeccionTitulo>Carro de Productos</SeccionTitulo>
                                <ProductosDelFormulario folio={formulario.folio} anho={formulario.anho} formularioTexto={formulario.formulario} />
                            </section>
                        </>
                    )}
                </div>

                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={handlePrint}
                        disabled={imprimiendo || !formulario}
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
