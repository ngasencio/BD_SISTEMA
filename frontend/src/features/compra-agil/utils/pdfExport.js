import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoSrc from '../../../assets/logo.jpg';

// ─── Paleta institucional ────────────────────────────────────────────────────
const C = {
    navy:       [30,  58,  95],
    navyLight:  [224, 231, 242],
    gold:       [200, 150, 62],
    goldLight:  [253, 243, 217],
    green:      [21,  128, 61],
    greenLight: [220, 252, 231],
    amber:      [180, 83,  9],
    amberLight: [255, 243, 205],
    gray:       [100, 116, 139],
    grayLight:  [241, 245, 249],
    white:      [255, 255, 255],
    dark:       [15,  23,  42],
    red:        [185, 28,  28],
};

// ─── Formateadores ───────────────────────────────────────────────────────────
const fmt    = n => new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(n||0);
const fmtN   = n => new Intl.NumberFormat('es-CL').format(n||0);
const fmtPct = n => `${(+n||0).toFixed(1)}%`;
const trunc  = (s, n) => s && s.length > n ? s.slice(0, n-1)+'…' : (s||'');
const fmtMes = str => {
    if (!str) return '—';
    const [y, m] = str.split('-');
    const nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${nombres[+m-1]||m} ${y}`;
};

// ─── Carga logo como base64 ──────────────────────────────────────────────────
async function loadLogo() {
    try {
        const resp = await fetch(logoSrc);
        const blob = await resp.blob();
        return await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch { return null; }
}

// ─── Header de página ────────────────────────────────────────────────────────
function pageHeader(doc, titulo, pag, total, logo, filtros) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...C.navy);  doc.rect(0, 0, W, 18, 'F');
    doc.setFillColor(...C.gold);  doc.rect(0, 18, W, 2,  'F');

    if (logo) { try { doc.addImage(logo, 'JPEG', 3, 1, 14, 16); } catch {} }

    doc.setFont('helvetica','bold');  doc.setFontSize(7.5); doc.setTextColor(...C.white);
    doc.text('SERVICIO DE SALUD OSORNO', 20, 7);
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
    doc.text('Departamento de Abastecimiento y Operaciones', 20, 13);

    doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.text(titulo, W/2, 10, {align:'center'});

    doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
    doc.text(`Pág. ${pag} / ${total}`, W-4, 14, {align:'right'});

    if (filtros?.fechaDesde || filtros?.fechaHasta) {
        doc.setFillColor(...C.navyLight); doc.rect(0, 20, W, 7, 'F');
        doc.setTextColor(...C.navy); doc.setFont('helvetica','italic'); doc.setFontSize(7);
        const txt = `Período: ${filtros.fechaDesde||'—'} → ${filtros.fechaHasta||'hoy'}`;
        doc.text(txt, W/2, 25, {align:'center'});
        return 30;
    }
    return 24;
}

// ─── Footer de página ────────────────────────────────────────────────────────
function pageFooter(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setFillColor(...C.navy); doc.rect(0, H-8, W, 8, 'F');
    doc.setFillColor(...C.gold); doc.rect(0, H-8, W, 1, 'F');
    doc.setTextColor(...C.white); doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
    doc.text('Servicio de Salud Osorno — Departamento de Abastecimiento y Operaciones — Uso Interno', W/2, H-3, {align:'center'});
    doc.text(`Generado: ${new Date().toLocaleString('es-CL')}`, 5, H-3);
}

// ─── Banner de sección ───────────────────────────────────────────────────────
function banner(doc, y, texto) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...C.navy); doc.rect(14, y, W-28, 8, 'F');
    doc.setFillColor(...C.gold); doc.rect(14, y, 3, 8, 'F');
    doc.setTextColor(...C.white); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.text(texto, 21, y+5.5);
    return y+11;
}

// ─── Caja de nota (info / warning / success) ─────────────────────────────────
function noteBox(doc, y, lines, tipo='info') {
    const W   = doc.internal.pageSize.getWidth();
    const bgs  = {info:C.navyLight, warning:C.amberLight, success:C.greenLight};
    const bds  = {info:C.navy,      warning:C.amber,       success:C.green};
    const h    = lines.length * 5 + 8;
    doc.setFillColor(...bgs[tipo]); doc.roundedRect(14, y, W-28, h, 2, 2, 'F');
    doc.setFillColor(...bds[tipo]); doc.rect(14, y, 3, h, 'F');
    doc.setTextColor(...C.dark); doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
    lines.forEach((l, i) => doc.text(l, 21, y+6+i*5));
    return y+h+4;
}

// ─── Tarjetas KPI (hasta 4 por fila) ────────────────────────────────────────
function kpiRow(doc, y, cards) {
    const W    = doc.internal.pageSize.getWidth();
    const n    = Math.min(cards.length, 4);
    const cw   = (W - 28 - (n-1)*4) / n;
    const ch   = 25;
    cards.forEach((k, i) => {
        const x = 14 + i*(cw+4);
        doc.setFillColor(...(k.bg||C.navyLight));
        doc.roundedRect(x, y, cw, ch, 3, 3, 'F');
        doc.setFillColor(...(k.accent||C.navy));
        doc.roundedRect(x, y, cw, 2.5, 1, 1, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(...C.gray);
        doc.text(k.label.toUpperCase(), x+4, y+8);
        const big = k.value.length > 13 ? 9 : 11;
        doc.setFontSize(big); doc.setFont('helvetica','bold'); doc.setTextColor(...C.dark);
        doc.text(k.value, x+4, y+17);
        if (k.sub) {
            doc.setFontSize(6); doc.setFont('helvetica','normal'); doc.setTextColor(...C.gray);
            doc.text(k.sub, x+4, y+23);
        }
    });
    return y+ch+5;
}

// ─── Barras horizontales ─────────────────────────────────────────────────────
// items: [{label, bars:[{value, color, label?}]}]
function hBars(doc, items, x, y, totalW, opts={}) {
    const lw = opts.labelWidth || 52;
    const bh = opts.barHeight  || 4.5;
    const bg = opts.barGap     || 1.5;
    const rg = opts.rowGap     || 4;
    const cw = totalW - lw - 28;
    const maxVal = Math.max(...items.flatMap(it => it.bars.map(b=>b.value)), 1);
    let cy = y;
    items.forEach(item => {
        const totalBarsH = item.bars.length * (bh+bg) - bg;
        doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...C.dark);
        doc.text(trunc(item.label, 24), x, cy + totalBarsH/2 + 1, {baseline:'middle'});
        item.bars.forEach((bar, bi) => {
            const bw = Math.max(0.5, (bar.value / maxVal) * cw);
            const by = cy + bi*(bh+bg);
            doc.setFillColor(...bar.color);
            doc.roundedRect(x+lw, by, bw, bh, 1, 1, 'F');
        });
        // Value label on last bar
        const lastBar = item.bars[item.bars.length-1];
        const lastBw  = Math.max(0.5, (lastBar.value / maxVal) * cw);
        doc.setFont('helvetica','bold'); doc.setFontSize(5.5); doc.setTextColor(...C.dark);
        doc.text(fmt(lastBar.value), x+lw+lastBw+2, cy+totalBarsH/2+1, {baseline:'middle'});
        cy += totalBarsH + rg;
    });
    return cy + 2;
}

// ─── Tabla pivot unidad × mes ────────────────────────────────────────────────
function pivotTable(doc, y, por_unidad_mes, W) {
    const unidades = [...new Set(por_unidad_mes.map(r=>r.unidad))].sort();
    const meses    = [...new Set(por_unidad_mes.map(r=>r.mes))].sort();
    if (!unidades.length || !meses.length) return y;

    const pivot = {};
    por_unidad_mes.forEach(r => {
        if (!pivot[r.unidad]) pivot[r.unidad] = {};
        pivot[r.unidad][r.mes] = r;
    });

    const head = [['Unidad de Compra', ...meses.map(fmtMes), 'Total Ahorro']];

    const body = unidades.map(u => {
        const tot = meses.reduce((s,m) => s+(pivot[u]?.[m]?.ahorro||0), 0);
        return [
            trunc(u, 28),
            ...meses.map(m => {
                const v = pivot[u]?.[m]?.ahorro;
                return (v !== undefined && v !== 0) ? fmt(v) : '—';
            }),
            fmt(tot),
        ];
    });

    const footTotals = ['TOTAL'];
    let grand = 0;
    meses.forEach(m => {
        const t = unidades.reduce((s,u) => s+(pivot[u]?.[m]?.ahorro||0), 0);
        grand += t;
        footTotals.push(fmt(t));
    });
    footTotals.push(fmt(grand));

    const fs = meses.length > 8 ? 5.5 : meses.length > 5 ? 6 : 7;

    autoTable(doc, {
        startY: y,
        head,
        body,
        foot: [footTotals],
        styles:     { fontSize:fs, cellPadding:2, halign:'right' },
        headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', halign:'center' },
        footStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold' },
        columnStyles:{ 0:{ halign:'left', fontStyle:'bold', cellWidth:55 } },
        margin: { left:14, right:14 },
        didParseCell(data) {
            if (data.section==='body' && data.column.index>=1 && data.column.index<=meses.length) {
                const u = unidades[data.row.index];
                const m = meses[data.column.index-1];
                const v = pivot[u]?.[m]?.ahorro;
                if (v !== undefined) {
                    if (v > 0) { data.cell.styles.fillColor=C.greenLight; data.cell.styles.textColor=C.green; }
                    else if (v < 0) { data.cell.styles.fillColor=[254,226,226]; data.cell.styles.textColor=C.red; }
                }
            }
        },
    });
    return doc.lastAutoTable.finalY + 4;
}

// ─── Narrativa automática ────────────────────────────────────────────────────
function narrativa(kpis, filtros) {
    const periodo = (filtros?.fechaDesde && filtros?.fechaHasta)
        ? `el período ${filtros.fechaDesde} a ${filtros.fechaHasta}`
        : 'el período analizado';
    const tasa = kpis.total_ca>0 ? ((kpis.adjudicadas/kpis.total_ca)*100).toFixed(1) : 0;
    let t = `Durante ${periodo}, el Departamento de Abastecimiento y Operaciones gestionó ${fmtN(kpis.total_ca)} compras ágiles `;
    t += `por un presupuesto estimado de ${fmt(kpis.total_presupuesto)}, adjudicando el ${tasa}% de los procesos `;
    t += `(${fmtN(kpis.adjudicadas)} compras) por un monto total de ${fmt(kpis.total_monto_oc)}. `;
    if (kpis.ahorro_simple>0) t += `Se obtuvo un ahorro simple de ${fmt(kpis.ahorro_simple)} (${fmtPct(kpis.pct_ahorro_simple)} respecto al monto OC). `;
    if (kpis.ahorro_res188>0) t += `El indicador Res.188/2026 registra un ahorro de ${fmt(kpis.ahorro_res188)} (${fmtPct(kpis.pct_ahorro_res188)}). `;
    if (kpis.desiertas>0||kpis.canceladas>0)
        t += `Se registraron ${fmtN(kpis.desiertas)} procesos desiertos y ${fmtN(kpis.canceladas)} cancelados, los cuales no generan orden de compra.`;
    return t;
}

// ─── Conclusiones automáticas ────────────────────────────────────────────────
function conclusiones(kpis, por_unidad, mejora_items, top_proveedores) {
    const list = [];
    const tasa = kpis.total_ca>0 ? (kpis.adjudicadas/kpis.total_ca*100).toFixed(1) : 0;
    list.push(`1.  La tasa de adjudicación del período alcanzó el ${tasa}%, reflejando la efectividad en la gestión de los procesos de compra ágil.`);
    if (kpis.ahorro_simple>0)
        list.push(`2.  El ahorro simple acumulado de ${fmt(kpis.ahorro_simple)} representa una optimización real del gasto respecto a los presupuestos estimados por las unidades de compra.`);
    if (mejora_items?.length>0)
        list.push(`3.  Se identificaron ${mejora_items.length} ítem(s) con precio adjudicado superior al promedio de mercado (Res.188). Se recomienda revisar la estimación presupuestaria y el proceso de evaluación de ofertas en estos casos.`);
    const topP = top_proveedores?.[0];
    if (topP && kpis.total_monto_oc>0) {
        const pct = (topP.monto_total/kpis.total_monto_oc*100).toFixed(1);
        if (+pct>30)
            list.push(`4.  Alerta de concentración: "${trunc(topP.razonsocial,45)}" concentra el ${pct}% del monto total adjudicado. Se recomienda ampliar la base de proveedores para mitigar el riesgo.`);
    }
    const sobrePpto = (por_unidad||[]).filter(u=>u.monto_oc>0&&u.ahorro<0);
    if (sobrePpto.length>0)
        list.push(`5.  Las unidades ${sobrePpto.slice(0,2).map(u=>u.unidad).join(' y ')} presentaron monto OC superior al presupuesto estimado. Se sugiere revisar la metodología de estimación en dichas unidades.`);
    return list;
}

// ════════════════════════════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export async function generarPDFCompraAgil({ stats, compras, proveedores, filtros }) {
    if (!stats) return;
    const logo = await loadLogo();
    const { kpis, por_estado, por_unidad, por_mes, por_unidad_mes,
            top_proveedores, top_ahorro_items, mejora_items } = stats;
    const TOTAL = 8;
    const tasa  = kpis.total_ca>0 ? ((kpis.adjudicadas/kpis.total_ca)*100).toFixed(1) : 0;

    // ── P1: PORTADA ──────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W = 210; const H = 297;

    doc.setFillColor(...C.navy); doc.rect(0, 0, W, 145, 'F');
    doc.setFillColor(...C.gold); doc.rect(0, 145, W, 4,   'F');

    if (logo) { try { doc.addImage(logo,'JPEG', W/2-22, 14, 44, 44, undefined,'FAST'); } catch {} }

    doc.setTextColor(...C.white);
    doc.setFont('helvetica','bold');   doc.setFontSize(10);
    doc.text('SERVICIO DE SALUD OSORNO', W/2, 68, {align:'center'});
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.text('Departamento de Abastecimiento y Operaciones', W/2, 76, {align:'center'});

    doc.setFillColor(...C.gold); doc.rect(35, 81, W-70, 0.6, 'F');

    doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor(...C.white);
    doc.text('INFORME DE GESTIÓN', W/2, 96, {align:'center'});
    doc.setFontSize(20); doc.setTextColor(...C.gold);
    doc.text('COMPRA ÁGIL', W/2, 110, {align:'center'});

    const periodoStr = (filtros?.fechaDesde&&filtros?.fechaHasta)
        ? `${filtros.fechaDesde}  →  ${filtros.fechaHasta}` : 'Período completo';
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...C.white);
    doc.text(periodoStr, W/2, 122, {align:'center'});

    doc.setFillColor(...C.gold); doc.roundedRect(W/2-22, 129, 44, 9, 2, 2, 'F');
    doc.setTextColor(...C.navy); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.text('USO INTERNO', W/2, 134.5, {align:'center'});

    // Área info
    doc.setFillColor(...C.grayLight); doc.rect(0, 149, W, H-149-8, 'F');
    doc.setTextColor(...C.navy); doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text('Información del Reporte', 14, 163);
    const info = [
        ['Fecha de generación:',   new Date().toLocaleString('es-CL')],
        ['Total Compras Ágiles:',  `${fmtN(kpis.total_ca)} procesos`],
        ['Adjudicadas:',           `${fmtN(kpis.adjudicadas)} (${tasa}%)`],
        ['Presupuesto total:',     fmt(kpis.total_presupuesto)],
        ['Monto total OC:',        fmt(kpis.total_monto_oc)],
        ['Ahorro simple:',         `${fmt(kpis.ahorro_simple)} (${fmtPct(kpis.pct_ahorro_simple)})`],
    ];
    doc.setFontSize(8.5);
    info.forEach(([l,v],i)=>{
        doc.setFont('helvetica','bold'); doc.setTextColor(...C.navy); doc.text(l, 20, 173+i*7.5);
        doc.setFont('helvetica','normal'); doc.setTextColor(...C.dark); doc.text(v, 72, 173+i*7.5);
    });

    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...C.navy);
    doc.text('Contenido del Informe', 14, 225);
    const toc = [
        ['Pág. 2','Resumen Ejecutivo — KPIs y síntesis del período'],
        ['Pág. 3','Estado de las Compras — Distribución por estado y unidad'],
        ['Pág. 4','Ahorro Simple — Presupuesto vs Monto OC por unidad'],
        ['Pág. 5','Indicador Res.188/2026 — Top ítems y oportunidades de mejora'],
        ['Pág. 6','Tabla Pivot — Ahorro mensual por unidad de compra'],
        ['Pág. 7','Análisis de Proveedores — Ranking y concentración'],
        ['Pág. 8','Conclusiones y Recomendaciones'],
    ];
    doc.setFontSize(8);
    toc.forEach(([p,d],i)=>{
        const ry = 233+i*7;
        doc.setFillColor(...C.gold); doc.roundedRect(14, ry-4.5, 15, 6, 1, 1, 'F');
        doc.setTextColor(...C.navy); doc.setFont('helvetica','bold'); doc.text(p, 21.5, ry, {align:'center'});
        doc.setFont('helvetica','normal'); doc.setTextColor(...C.dark); doc.text(d, 33, ry);
    });

    pageFooter(doc);

    // ── P2: RESUMEN EJECUTIVO ────────────────────────────────────────────────
    doc.addPage('a4','portrait');
    let y = pageHeader(doc,'RESUMEN EJECUTIVO',2,TOTAL,logo,filtros);
    y = banner(doc, y, 'SÍNTESIS DEL PERÍODO');
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...C.dark);
    const narLines = doc.splitTextToSize(narrativa(kpis,filtros), W-28);
    doc.text(narLines, 14, y+2);
    y += narLines.length*5+10;

    y = banner(doc, y, 'INDICADORES DE GESTIÓN');
    y = kpiRow(doc, y, [
        {label:'Total Compras Ágiles', value:fmtN(kpis.total_ca),    sub:`Procesos en el período`,          bg:C.navyLight,  accent:C.navy},
        {label:'Adjudicadas',          value:fmtN(kpis.adjudicadas),  sub:`${tasa}% de tasa de adjudicación`,bg:C.greenLight, accent:C.green},
        {label:'Desiertas',            value:fmtN(kpis.desiertas),    sub:'Sin ofertas válidas',             bg:C.goldLight,  accent:C.gold},
        {label:'Canceladas',           value:fmtN(kpis.canceladas),   sub:'Procesos anulados',              bg:[254,226,226], accent:C.red},
    ]);
    y = kpiRow(doc, y, [
        {label:'Presupuesto Total',   value:fmt(kpis.total_presupuesto), sub:'Suma estimados declarados',        bg:C.navyLight,  accent:C.navy},
        {label:'Monto Total OC',      value:fmt(kpis.total_monto_oc),    sub:'Suma órdenes de compra',           bg:C.navyLight,  accent:C.navy},
        {label:'Ahorro Simple',       value:fmt(kpis.ahorro_simple),     sub:`${fmtPct(kpis.pct_ahorro_simple)} del monto OC`, bg:C.greenLight, accent:C.green},
        {label:'Ahorro Res.188/2026', value:fmt(kpis.ahorro_res188),     sub:`${fmtPct(kpis.pct_ahorro_res188)} del adjudicado`,bg:C.greenLight,accent:C.green},
    ]);
    y = noteBox(doc, y, [
        'Ahorro Simple = Presupuesto Estimado − Monto OC. Solo compras con proveedor seleccionado y OC asociada.',
        'Ahorro Res.188 = (Precio Promedio Competidores − Precio Adjudicado) × Cantidad. Requiere mínimo 2 cotizantes por ítem.',
    ],'info');
    pageFooter(doc);

    // ── P3: ESTADO DE LAS COMPRAS ────────────────────────────────────────────
    doc.addPage('a4','portrait');
    y = pageHeader(doc,'ESTADO DE LAS COMPRAS',3,TOTAL,logo,filtros);
    y = banner(doc, y, 'DISTRIBUCIÓN POR ESTADO');
    autoTable(doc,{
        startY:y,
        head:[['Estado','N° Compras','Presupuesto Estimado','% del Total']],
        body:(por_estado||[]).map(e=>{
            const pct = kpis.total_ca>0 ? fmtPct(e.cantidad/kpis.total_ca*100) : '—';
            return [e.estado, fmtN(e.cantidad), fmt(e.presupuesto), pct];
        }),
        foot:[['TOTAL', fmtN(kpis.total_ca), fmt(kpis.total_presupuesto), '100%']],
        styles:{fontSize:8.5,cellPadding:3},
        headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold'},
        footStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold'},
        alternateRowStyles:{fillColor:C.grayLight},
        columnStyles:{1:{halign:'center'},2:{halign:'right'},3:{halign:'center'}},
        margin:{left:14,right:14},
    });
    y = doc.lastAutoTable.finalY+5;
    y = noteBox(doc,y,[
        'Los estados "Desierta" y "Cancelada" no generan Orden de Compra y no se incluyen en el cálculo de ahorro.',
        '"Proveedor seleccionado" corresponde a compras adjudicadas con OC emitida o en trámite.',
    ],'info');
    y = banner(doc, y, 'COMPRAS POR UNIDAD DE COMPRA');
    autoTable(doc,{
        startY:y,
        head:[['Unidad de Compra','Total CAs','Adjudicadas','Tasa Adj.','Presupuesto']],
        body:(por_unidad||[]).map(u=>[
            u.unidad, fmtN(u.total), fmtN(u.adjudicadas),
            u.total>0 ? fmtPct(u.adjudicadas/u.total*100) : '—',
            fmt(u.presupuesto),
        ]),
        styles:{fontSize:7.5,cellPadding:2.5},
        headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold'},
        alternateRowStyles:{fillColor:C.grayLight},
        columnStyles:{1:{halign:'center'},2:{halign:'center'},3:{halign:'center'},4:{halign:'right'}},
        margin:{left:14,right:14},
    });
    pageFooter(doc);

    // ── P4: AHORRO SIMPLE ────────────────────────────────────────────────────
    doc.addPage('a4','portrait');
    y = pageHeader(doc,'ANÁLISIS DE AHORRO SIMPLE',4,TOTAL,logo,filtros);
    y = banner(doc, y, 'METODOLOGÍA 1 — AHORRO SIMPLE (PRESUPUESTO VS MONTO OC)');
    y = noteBox(doc, y, [
        'Fórmula: Ahorro = Σ (Presupuesto Estimado − Monto OC Adjudicada)  |  Solo compras con proveedor seleccionado y OC asociada.',
        'Valores negativos indican que el monto OC superó el presupuesto estimado para esa compra.',
    ],'info');
    y = kpiRow(doc, y, [
        {label:'Presupuesto Total',  value:fmt(kpis.total_presupuesto), bg:C.navyLight,  accent:C.navy},
        {label:'Monto OC Total',     value:fmt(kpis.total_monto_oc),    bg:C.navyLight,  accent:C.navy},
        {label:'Ahorro Simple Total',value:fmt(kpis.ahorro_simple),     sub:fmtPct(kpis.pct_ahorro_simple), bg:C.greenLight, accent:C.green},
    ]);
    y = banner(doc, y, 'COMPARATIVA PRESUPUESTO VS MONTO OC — TOP UNIDADES');
    const topU = (por_unidad||[]).filter(u=>u.monto_oc>0).slice(0,9);
    if (topU.length>0) {
        const chartH = topU.length*14+6;
        y = hBars(doc, topU.map(u=>({
            label: u.unidad,
            bars:  [
                {value:u.presupuesto, color:C.navy},
                {value:u.monto_oc,    color:C.gold},
            ],
        })), 14, y, W-28, {labelWidth:52, barHeight:4, barGap:1.5, rowGap:3});
        // leyenda
        doc.setFillColor(...C.navy); doc.rect(14, y, 8, 3.5, 'F');
        doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...C.dark);
        doc.text('Presupuesto Estimado', 25, y+3);
        doc.setFillColor(...C.gold); doc.rect(82, y, 8, 3.5, 'F');
        doc.text('Monto OC Adjudicada', 93, y+3);
        y += 9;
    }
    y = banner(doc, y, 'DETALLE POR UNIDAD DE COMPRA');
    autoTable(doc,{
        startY:y,
        head:[['Unidad de Compra','Total CAs','Adj.','Presupuesto','Monto OC','Ahorro','% Ahorro']],
        body:(por_unidad||[]).map(u=>[
            u.unidad, fmtN(u.total), fmtN(u.adjudicadas),
            fmt(u.presupuesto), u.monto_oc>0?fmt(u.monto_oc):'—',
            fmt(u.ahorro), u.monto_oc>0?fmtPct(u.pct_ahorro):'—',
        ]),
        foot:[['TOTAL',fmtN(kpis.total_ca),fmtN(kpis.adjudicadas),
               fmt(kpis.total_presupuesto),fmt(kpis.total_monto_oc),
               fmt(kpis.ahorro_simple),fmtPct(kpis.pct_ahorro_simple)]],
        styles:{fontSize:7.5,cellPadding:2.5},
        headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold'},
        footStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold'},
        alternateRowStyles:{fillColor:C.grayLight},
        columnStyles:{1:{halign:'center'},2:{halign:'center'},3:{halign:'right'},
                      4:{halign:'right'},5:{halign:'right',fontStyle:'bold'},6:{halign:'center'}},
        didParseCell(data){
            if (data.section==='body'&&data.column.index===5) {
                const raw = String(data.cell.raw||'').replace(/[^0-9,\-]/g,'').replace(',','.');
                const v = parseFloat(raw);
                if (!isNaN(v)) data.cell.styles.textColor = v<0 ? C.red : C.green;
            }
        },
        margin:{left:14,right:14},
    });
    pageFooter(doc);

    // ── P5: AHORRO RES.188/2026 ──────────────────────────────────────────────
    doc.addPage('a4','portrait');
    y = pageHeader(doc,'INDICADOR AHORRO RES. 188/2026',5,TOTAL,logo,filtros);
    y = banner(doc, y, 'METODOLOGÍA 2 — INDICADOR RESOLUCIÓN N°188/2026');
    y = noteBox(doc, y, [
        'Fórmula: Ahorro = Σ [ (Precio Promedio Competidores − Precio Adjudicado) × Cantidad Adjudicada ]',
        '% Ahorro = (Monto Total Ahorrado / Monto Total Adjudicado) × 100',
        'Aplicabilidad: CAs con "Proveedor seleccionado" y mínimo 2 cotizantes por ítem.',
        'Fuente normativa: Resolución Exenta N°188/2026, Dirección ChileCompra.',
    ],'info');
    y = kpiRow(doc, y, [
        {label:'Ahorro Res.188 Total',  value:fmt(kpis.ahorro_res188),     sub:fmtPct(kpis.pct_ahorro_res188)+' del adj.', bg:C.greenLight, accent:C.green},
        {label:'Monto Adjudicado',      value:fmt(kpis.adjudicado_res188), sub:'Base de cálculo Res.188',                  bg:C.navyLight,  accent:C.navy},
        {label:'Ítems con Ahorro',      value:fmtN(top_ahorro_items?.length||0), sub:'Precio adj. < promedio',             bg:C.greenLight, accent:C.green},
        {label:'Ítems a Mejorar',       value:fmtN(mejora_items?.length||0),     sub:'Precio adj. > promedio',             bg:C.amberLight, accent:C.amber},
    ]);
    if (top_ahorro_items?.length>0) {
        y = banner(doc, y, 'TOP ÍTEMS CON MAYOR AHORRO');
        autoTable(doc,{
            startY:y,
            head:[['Código CA','Producto','P. Promedio','P. Adjudicado','Cant.','Ahorro']],
            body:top_ahorro_items.slice(0,10).map(i=>[
                i.codigo_ca, trunc(i.nombre_producto,38),
                fmt(i.precio_promedio), fmt(i.precio_adjudicado),
                fmtN(i.cantidad), fmt(i.ahorro),
            ]),
            styles:{fontSize:7.5,cellPadding:2.5},
            headStyles:{fillColor:C.green,textColor:C.white,fontStyle:'bold'},
            alternateRowStyles:{fillColor:C.greenLight},
            columnStyles:{2:{halign:'right'},3:{halign:'right'},4:{halign:'center'},
                          5:{halign:'right',fontStyle:'bold',textColor:C.green}},
            margin:{left:14,right:14},
        });
        y = doc.lastAutoTable.finalY+5;
    }
    if (mejora_items?.length>0) {
        y = banner(doc, y, 'OPORTUNIDADES DE MEJORA — PRECIO ADJUDICADO SUPERIOR AL PROMEDIO');
        y = noteBox(doc, y, [
            'Los siguientes ítems fueron adjudicados a un precio superior al promedio de los competidores.',
            'Se recomienda revisar la estimación presupuestaria y el proceso de evaluación de ofertas.',
        ],'warning');
        autoTable(doc,{
            startY:y,
            head:[['Código CA','Producto','P. Promedio','P. Adjudicado','Sobrecosto']],
            body:mejora_items.slice(0,10).map(i=>[
                i.codigo_ca, trunc(i.nombre_producto,40),
                fmt(i.precio_promedio), fmt(i.precio_adjudicado), fmt(i.diferencia),
            ]),
            styles:{fontSize:7.5,cellPadding:2.5},
            headStyles:{fillColor:C.amber,textColor:C.white,fontStyle:'bold'},
            alternateRowStyles:{fillColor:C.amberLight},
            columnStyles:{2:{halign:'right'},3:{halign:'right'},4:{halign:'right',fontStyle:'bold',textColor:C.red}},
            margin:{left:14,right:14},
        });
    }
    pageFooter(doc);

    // ── P6: PIVOT UNIDAD × MES (landscape) ──────────────────────────────────
    doc.addPage([297,210]);
    const WL = 297;
    y = pageHeader(doc,'TABLA PIVOT — AHORRO POR UNIDAD Y MES',6,TOTAL,logo,filtros);
    y = banner(doc, y, 'AHORRO SIMPLE MENSUAL POR UNIDAD DE COMPRA');
    if (por_unidad_mes?.length>0) {
        y = pivotTable(doc, y, por_unidad_mes, WL);
        y = noteBox(doc, y, [
            'Valores en pesos chilenos (CLP). Verde: monto OC < presupuesto (ahorro positivo). Rojo: monto OC superó el presupuesto.',
            'Solo considera CAs con proveedor seleccionado y OC asociada. "—" indica sin compras adjudicadas con OC en ese período.',
        ],'info');
    } else {
        doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...C.gray);
        doc.text('No hay datos de pivot para el período seleccionado.', WL/2, y+20, {align:'center'});
    }
    pageFooter(doc);

    // ── P7: PROVEEDORES (landscape) ──────────────────────────────────────────
    doc.addPage([297,210]);
    y = pageHeader(doc,'ANÁLISIS DE PROVEEDORES',7,TOTAL,logo,filtros);
    y = banner(doc, y, 'RANKING TOP 20 PROVEEDORES POR MONTO ADJUDICADO');
    const topP = top_proveedores?.[0];
    if (topP&&kpis.total_monto_oc>0) {
        const pct = (topP.monto_total/kpis.total_monto_oc*100).toFixed(1);
        if (+pct>30)
            y = noteBox(doc, y, [
                `Alerta de concentración: "${trunc(topP.razonsocial,55)}" concentra el ${pct}% del monto total adjudicado.`,
                'Se recomienda ampliar la base de proveedores para mitigar el riesgo de dependencia.',
            ],'warning');
    }
    autoTable(doc,{
        startY:y,
        head:[['#','Razón Social','RUT','CAs Ganadas','Participadas','Tasa Adj.','Monto Adjudicado','% del Total']],
        body:(top_proveedores||[]).slice(0,20).map((p,i)=>{
            const pct = kpis.total_monto_oc>0 ? fmtPct(p.monto_total/kpis.total_monto_oc*100) : '—';
            return [`${i+1}`, trunc(p.razonsocial,48), p.rut,
                    fmtN(p.ganadas), fmtN(p.participadas), `${p.tasa}%`,
                    fmt(p.monto_total), pct];
        }),
        styles:{fontSize:8,cellPadding:2.5},
        headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold'},
        alternateRowStyles:{fillColor:C.grayLight},
        columnStyles:{
            0:{halign:'center',cellWidth:8},
            2:{halign:'center',cellWidth:24},
            3:{halign:'center',textColor:C.green,fontStyle:'bold'},
            4:{halign:'center'},5:{halign:'center'},
            6:{halign:'right',fontStyle:'bold'},7:{halign:'center'},
        },
        margin:{left:14,right:14},
    });
    pageFooter(doc);

    // ── P8: CONCLUSIONES ─────────────────────────────────────────────────────
    doc.addPage('a4','portrait');
    y = pageHeader(doc,'CONCLUSIONES Y RECOMENDACIONES',8,TOTAL,logo,filtros);
    y = banner(doc, y, 'ANÁLISIS GENERAL DEL PERÍODO');
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...C.dark);
    const narLines2 = doc.splitTextToSize(narrativa(kpis,filtros), W-28);
    doc.text(narLines2, 14, y+2);
    y += narLines2.length*5+10;

    y = banner(doc, y, 'CONCLUSIONES Y RECOMENDACIONES');
    conclusiones(kpis, por_unidad, mejora_items, top_proveedores).forEach(c=>{
        const cl = doc.splitTextToSize(c, W-38);
        const ch = cl.length*5+7;
        doc.setFillColor(...C.navyLight); doc.roundedRect(14, y, W-28, ch, 2, 2, 'F');
        doc.setFillColor(...C.navy);      doc.rect(14, y, 3, ch, 'F');
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C.dark);
        doc.text(cl, 21, y+5);
        y += ch+5;
    });

    y = banner(doc, y, 'RESUMEN DE INDICADORES');
    autoTable(doc,{
        startY:y,
        head:[['Indicador','Valor']],
        body:[
            ['Total Compras Ágiles',        fmtN(kpis.total_ca)],
            ['Compras Adjudicadas',          `${fmtN(kpis.adjudicadas)} (${tasa}%)`],
            ['Presupuesto Total',            fmt(kpis.total_presupuesto)],
            ['Monto OC Total',               fmt(kpis.total_monto_oc)],
            ['Ahorro Simple',                `${fmt(kpis.ahorro_simple)}  (${fmtPct(kpis.pct_ahorro_simple)})`],
            ['Ahorro Res.188/2026',          `${fmt(kpis.ahorro_res188)}  (${fmtPct(kpis.pct_ahorro_res188)})`],
            ['Proveedores activos',          fmtN(top_proveedores?.length||0)],
            ['Ítems con ahorro (Res.188)',   fmtN(top_ahorro_items?.length||0)],
            ['Ítems a mejorar (Res.188)',    fmtN(mejora_items?.length||0)],
            ['Fecha de generación',          new Date().toLocaleString('es-CL')],
        ],
        styles:{fontSize:9,cellPadding:3},
        headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold'},
        alternateRowStyles:{fillColor:C.grayLight},
        columnStyles:{1:{halign:'right',fontStyle:'bold'}},
        margin:{left:14,right:80},
    });
    pageFooter(doc);

    // ── Guardar ──────────────────────────────────────────────────────────────
    doc.save(`Reporte_CompraAgil_${new Date().toISOString().slice(0,10)}.pdf`);
}
