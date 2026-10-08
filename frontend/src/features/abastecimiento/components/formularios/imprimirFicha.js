// Impresión de la ficha del formulario (A4). Documento aparte: no hereda los estilos de la
// app, así que los colores se declaran aquí como variables que replican los tokens DV-UI.
import { fmtCLP, fmtFecha, infoEstado, ocsDeLaFicha, resumenOcs, bandejasConDias, CONFIANZA_ENLACE, ESTADO_ENLACE, ESTADO_PAC_ENLACE } from './shared.js';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const vacio = (v) => v === null || v === undefined || v === '';

const campo = (label, valor, { mono, ancho } = {}) =>
    `<div class="campo${ancho ? ' ancho' : ''}"><label>${esc(label)}</label><span class="${mono ? 'mono' : ''}">${vacio(valor) ? '—' : esc(valor)}</span></div>`;

const seccion = (titulo, contenido) => `<section><h3>${esc(titulo)}</h3>${contenido}</section>`;

const ESTILOS = `
  :root { --navy:#132C48; --primary:#0F69B4; --ink:#0F1722; --ink2:#48546A; --ink3:#7C8798; --line:#E7EAF0; --alt:#FAFBFD; --sel:#F3F8FC; --warn:#AC6A1C; --warnbg:#FAEFDF; }
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: var(--ink); line-height: 1.4; }
  .cabecera { border-bottom: 3px solid var(--navy); padding-bottom: 10px; margin-bottom: 14px; }
  .cabecera .org { margin: 0; font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); }
  .cabecera h1 { margin: 4px 0 8px; font-size: 15pt; color: var(--navy); }
  .meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .folio { font-family: Consolas, monospace; font-size: 12pt; font-weight: 700; color: var(--primary); background: var(--sel); padding: 2px 12px; border-radius: 4px; }
  .pill { font-size: 8.5pt; font-weight: 600; padding: 2px 10px; border-radius: 10px; background: #EEF0F4; color: var(--ink2); }
  .resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .resumen div { border: 1px solid var(--line); border-radius: 5px; padding: 6px 9px; background: var(--alt); }
  .resumen small { display: block; font-size: 7pt; letter-spacing: .06em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .resumen b { font-size: 11pt; }
  section { margin-bottom: 13px; break-inside: avoid-page; }
  h3 { margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--line); font-size: 8pt; letter-spacing: .09em; text-transform: uppercase; color: var(--primary); }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; }
  .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; }
  .campo { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .campo.ancho { grid-column: 1 / -1; }
  .campo label { font-size: 7pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ink3); }
  .campo span { font-size: 9.5pt; overflow-wrap: anywhere; }
  .mono { font-family: Consolas, monospace; font-weight: 600; }
  p.texto { margin: 0 0 6px; padding: 7px 10px; background: var(--alt); border: 1px solid var(--line); border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
  p.clave { border-left: 3px solid var(--primary); background: var(--sel); font-weight: 600; }
  p.aviso { border-left: 3px solid var(--warn); background: var(--warnbg); }
  .adjuntos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .adj { padding: 5px 10px; border: 1px solid var(--line); border-radius: 4px; font-size: 9pt; }
  .adj.si { background: var(--sel); color: var(--primary); }
  .adj.no { border-style: dashed; color: var(--ink3); }
  .adj a { color: inherit; text-decoration: none; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead { display: table-header-group; }
  th { background: var(--navy); color: #fff; padding: 5px 7px; text-align: left; font-size: 7.5pt; letter-spacing: .04em; text-transform: uppercase; }
  td { padding: 5px 7px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:nth-child(even) td { background: var(--alt); }
  .der { text-align: right; }
  .descartada td { color: var(--ink3); }
  .total { text-align: right; margin-top: 4px; font-size: 9pt; }
  .vacio { margin: 0; color: var(--ink3); font-size: 9pt; }
  .proceso { border: 1px solid var(--line); border-radius: 5px; padding: 8px 10px; margin-bottom: 8px; }
  .proceso h4 { margin: 0 0 6px; font-size: 10pt; color: var(--navy); }
  .pie { margin-top: 16px; padding-top: 6px; border-top: 1px solid var(--line); font-size: 7.5pt; color: var(--ink3); display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

function tablaOc(filas) {
    if (!filas.length) return '<p class="vacio">Sin órdenes de compra enlazadas.</p>';
    const cuerpo = filas.map((r) => {
        const oc = r.oc;
        const enlace = r.via === 'proceso'
            ? `Vía proceso de compra${r.proceso ? ` (${r.proceso})` : ''}`
            : `${ESTADO_ENLACE[r.estadoEnlace]?.label || r.estadoEnlace} · ${CONFIANZA_ENLACE[r.confianza] || r.confianza}`;
        return `<tr class="${r.descartada ? 'descartada' : ''}">
            <td class="mono">${esc(r.codigo)}</td>
            <td>${oc ? esc(oc.nombre_oc) : '<i>OC aún no sincronizada</i>'}</td>
            <td>${esc(oc?.proveedor) || '—'}</td>
            <td>${esc(oc?.estado_oc) || '—'}</td>
            <td class="der">${oc?.total_bruto != null ? fmtCLP(oc.total_bruto) : '—'}</td>
            <td>${esc(enlace)}</td>
            <td>${r.estadoPac ? esc(ESTADO_PAC_ENLACE[r.estadoPac]?.label || r.estadoPac) : '—'}</td>
        </tr>`;
    }).join('');
    return `<table><thead><tr><th>Código OC</th><th>Nombre</th><th>Proveedor</th><th>Estado OC</th><th class="der">Monto bruto</th><th>Enlace</th><th>PAC</th></tr></thead><tbody>${cuerpo}</tbody></table>`;
}

/** HTML completo de la ficha, listo para `document.write` en una ventana de impresión. */
export function htmlFicha(f, ahora = new Date()) {
    const est = infoEstado(f.estado);
    const adjuntos = [
        ['adj_espec_tecnicas', 'Especificaciones técnicas'], ['adj_cotizacion', 'Cotización'],
        ['adj_validacion', 'Validación'], ['adj_form_justificacion', 'Formulario de justificación'],
    ].map(([k, label]) => (f[k]
        ? `<div class="adj si">📎 <a href="${esc(f[k])}">${esc(label)}</a></div>`
        : `<div class="adj no">— ${esc(label)}</div>`)).join('');

    const totalCarro = (f.productos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const productos = f.productos?.length
        ? `<table><thead><tr><th>Categoría</th><th>Producto</th><th>Descripción</th><th class="der">Cant.</th><th class="der">Monto</th><th>Ítem presupuestario</th></tr></thead><tbody>${
            f.productos.map((p) => `<tr><td>${esc(p.categoria) || '—'}</td><td>${esc(p.producto) || '—'}</td><td>${esc(p.descripcion) || '—'}</td><td class="der">${esc(p.cantidad) || '—'}</td><td class="der">${p.monto != null ? fmtCLP(p.monto) : '—'}</td><td>${esc(p.item_presupuestario) || '—'}</td></tr>`).join('')
        }</tbody></table><div class="total">Total del carro: <b>${fmtCLP(totalCarro)}</b></div>`
        : '<p class="vacio">Sin productos registrados en el carro.</p>';

    const procesos = (f.procesos || []).map((p) => `
        <div class="proceso"><h4>${esc(p.titulo)}</h4><div class="grid3">
            ${campo('Tipo', p.tipo_proceso)}${campo('Estado', p.estado_proceso)}${campo('Comprador', p.comprador)}
            ${campo('Cierre estimado', p.fecha_cierre_estimada ? fmtFecha(p.fecha_cierre_estimada) : null)}
            ${campo('Licitación', p.codigo_licitacion, { mono: true })}${campo('Compra ágil', p.codigo_compra_agil, { mono: true })}
            ${p.observaciones ? campo('Observaciones del comprador', p.observaciones, { ancho: true }) : ''}
        </div></div>`).join('');

    const historial = f.historial_estados?.length
        ? `<table><thead><tr><th>Fecha</th><th>Bandeja</th><th class="der">Días en la bandeja</th></tr></thead><tbody>${
            bandejasConDias(f.historial_estados).map((h) => `<tr><td>${fmtFecha(h.fecha)}</td><td>${esc(h.estado)} · ${esc(infoEstado(h.estado).nombre)}</td><td class="der">${h.dias ?? '—'}${h.actual ? ' (actual)' : ''}</td></tr>`).join('')
        }</tbody></table>`
        : '<p class="vacio">Sin historial de bandejas registrado.</p>';

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>FSC · ${esc(f.id_formulario || `Folio ${f.folio}`)}</title><style>${ESTILOS}</style></head><body>
<div class="cabecera">
  <p class="org">Servicio de Salud Osorno — Organismo 7296</p>
  <h1>Formulario de Solicitud de Compra</h1>
  <div class="meta">
    <span class="folio">${esc(f.id_formulario || `Folio ${f.folio}`)}</span>
    <span class="pill">${esc(f.estado || '—')} · ${esc(est.nombre)}</span>
    ${f.destino_actual ? `<span class="pill">Bandeja de ${esc(f.destino_actual)}</span>` : ''}
    ${f.dentro_fuera_pac ? `<span class="pill">${f.dentro_fuera_pac === 'DENTRO' ? 'Dentro del PAC' : 'Fuera del PAC'}</span>` : ''}
  </div>
</div>
<div class="resumen">
  <div><small>Monto estimado</small><b>${fmtCLP(f.monto_estimado)}</b></div>
  <div><small>Fecha de solicitud</small><b>${fmtFecha(f.fecha_solicitud)}</b></div>
  <div><small>Comprador</small><b>${esc(f.comprador) || '—'}</b></div>
  <div><small>OC enlazadas</small><b>${resumenOcs(ocsDeLaFicha(f)).confirmadas}</b></div>
</div>
${seccion('Datos generales', `<div class="grid3">
  ${campo('Folio', f.folio, { mono: true })}${campo('Año', f.anho)}${campo('Tipo de formulario', f.formulario)}
  ${campo('Fecha de solicitud', fmtFecha(f.fecha_solicitud))}${campo('Fecha de entrega', fmtFecha(f.fecha_entrega))}${campo('Fecha de derivación', f.fecha_derivado ? fmtFecha(f.fecha_derivado) : null)}
  ${campo('Monto estimado', fmtCLP(f.monto_estimado))}${campo('Moneda / tipo de monto', [f.moneda, f.tipo_monto].filter(Boolean).join(' · '))}${campo('Cotización', f.cotizacion)}
  ${campo('Ítem presupuestario', f.item_presupuestario)}${campo('Folio de requerimiento', f.folio_requerimiento, { mono: true })}
</div>`)}
${seccion('Solicitante', `<div class="grid2">
  ${campo('Unidad requirente', f.unidad_requirente)}${campo('Subdirección / establecimiento', f.subdireccion)}
  ${campo('Departamento (organigrama)', f.departamento)}
  ${campo('Usuario requirente', f.usuario_requirente)}${campo('Encargado', f.encargado)}
  ${campo('Jefe', f.jefe)}${campo('Anexo', f.anexo)}${campo('Correo', f.correo)}
</div>`)}
${seccion('Descripción de la compra', `
  ${f.requerimiento ? `<p class="texto clave">${esc(f.requerimiento)}</p>` : ''}
  ${f.objetivo_compra ? `<div class="campo"><label>Objetivo de la compra</label></div><p class="texto">${esc(f.objetivo_compra)}</p>` : ''}
  ${f.especificaciones_tecnicas ? `<div class="campo"><label>Especificaciones técnicas</label></div><p class="texto">${esc(f.especificaciones_tecnicas)}</p>` : ''}
  ${!f.requerimiento && !f.objetivo_compra && !f.especificaciones_tecnicas ? '<p class="vacio">Sin descripción registrada.</p>' : ''}`)}
${seccion('Plan de compras y financiamiento', `<div class="grid2">
  ${campo('ID del plan de compras', f.id_plan, { mono: true })}${campo('Nombre del proyecto PAC', f.nombre_plan)}
  ${campo('Plan anual (declarado)', f.plan_anual)}${campo('Fuente de financiamiento', f.fuente_financiamiento)}
  ${campo('Validación técnica', f.validacion_tecnica)}${campo('Unidad validadora', f.unidad_validadora)}
  ${f.justificacion_no_validacion ? campo('Justificación de no validación', f.justificacion_no_validacion, { ancho: true }) : ''}
</div>${!f.id_plan && f.justificacion ? `<p class="texto aviso"><b>Sin ID de plan — justificación:</b> ${esc(f.justificacion)}</p>` : ''}`)}
${seccion('Archivos adjuntos', `<div class="adjuntos">${adjuntos}</div>`)}
${seccion('Carro de productos', productos)}
${seccion('Gestión de compra', `<div class="grid3">${campo('Comprador', f.comprador)}${campo('Estado de la compra', f.estado_compra)}${campo('Derivado el', f.fecha_derivado ? fmtFecha(f.fecha_derivado) : null)}</div>${procesos}`)}
${seccion('Órdenes de compra enlazadas', tablaOc(ocsDeLaFicha(f)))}
${seccion('Trazabilidad de bandejas', historial)}
<div class="pie"><span>Servicio de Salud Osorno — Sistema de Gestión BD SSO</span><span>Impreso: ${esc(ahora.toLocaleString('es-CL'))}</span></div>
</body></html>`;
}

/** Abre la ventana de impresión. Devuelve false si el navegador bloqueó la ventana emergente. */
export function imprimirFicha(f) {
    const win = window.open('', '_blank', 'width=980,height=800');
    if (!win) return false;
    win.document.write(htmlFicha(f));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
    return true;
}
