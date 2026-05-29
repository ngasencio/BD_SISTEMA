import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat('es-CL').format(n || 0);
const fmtFecha = str => str ? str.slice(0, 10) : '—';

// Paleta institucional
const COLOR = {
    primary: [30, 64, 175],       // azul oscuro
    primaryLight: [219, 234, 254], // azul muy claro
    success: [22, 163, 74],        // verde
    successLight: [220, 252, 231],
    warning: [180, 83, 9],
    gray: [107, 114, 128],
    grayLight: [243, 244, 246],
    dark: [17, 24, 39],
    white: [255, 255, 255],
    accent: [8, 145, 178],
};

function addHeader(doc, titulo, subtitulo, filtros, pagina, totalPaginas) {
    const W = doc.internal.pageSize.getWidth();

    // Barra superior azul
    doc.setFillColor(...COLOR.primary);
    doc.rect(0, 0, W, 22, 'F');

    // Título principal
    doc.setTextColor(...COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('ORGANISMO 7296 — SISTEMA DE GESTIÓN DE COMPRAS PÚBLICAS', 14, 10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${new Date().toLocaleString('es-CL')}  ·  Pág ${pagina}/${totalPaginas}`, W - 14, 10, { align: 'right' });

    // Subtítulo del módulo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(titulo, 14, 18);

    if (subtitulo) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR.white);
        doc.text(subtitulo, W / 2, 18, { align: 'center' });
    }

    // Filtros activos
    if (filtros?.fechaDesde || filtros?.fechaHasta) {
        doc.setFillColor(...COLOR.primaryLight);
        doc.rect(0, 22, W, 8, 'F');
        doc.setTextColor(...COLOR.primary);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        const filtroTxt = `Período filtrado: ${filtros.fechaDesde || '—'} → ${filtros.fechaHasta || '—'}`;
        doc.text(filtroTxt, W / 2, 27, { align: 'center' });
        return 34;
    }
    return 28;
}

function addFooter(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setFillColor(...COLOR.grayLight);
    doc.rect(0, H - 10, W, 10, 'F');
    doc.setTextColor(...COLOR.gray);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Reporte generado automáticamente por BD SISTEMA · Compra Ágil · Organismo 7296', W / 2, H - 4, { align: 'center' });
}

function addKpiRow(doc, y, kpis, W) {
    const cardW = (W - 28 - 9) / 4;
    const cards = kpis;
    cards.forEach((k, i) => {
        const x = 14 + i * (cardW + 3);
        doc.setFillColor(...(k.color || COLOR.primaryLight));
        doc.roundedRect(x, y, cardW, 20, 2, 2, 'F');
        doc.setTextColor(...COLOR.primary);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(k.label.toUpperCase(), x + 3, y + 6);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLOR.dark);
        doc.text(String(k.value), x + 3, y + 14);
        if (k.sub) {
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...COLOR.gray);
            doc.text(k.sub, x + 3, y + 19);
        }
    });
    return y + 24;
}

function sectionTitle(doc, y, texto) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...COLOR.primary);
    doc.rect(14, y, W - 28, 7, 'F');
    doc.setTextColor(...COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(texto, 17, y + 5);
    return y + 10;
}

export async function generarPDFCompraAgil({ stats, compras, proveedores, filtros }) {
    if (!stats) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const TOTAL_PAGES = 5;

    const { kpis, por_estado, por_unidad, top_proveedores, top_ahorro_items, mejora_items } = stats;

    // ═══════════════════════════════════════════
    // PORTADA
    // ═══════════════════════════════════════════
    doc.setFillColor(...COLOR.primary);
    doc.rect(0, 0, W, 80, 'F');

    doc.setTextColor(...COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('REPORTE', W / 2, 30, { align: 'center' });
    doc.setFontSize(26);
    doc.text('COMPRA ÁGIL', W / 2, 44, { align: 'center' });

    doc.setFillColor(...COLOR.white);
    doc.setDrawColor(...COLOR.primaryLight);
    doc.line(30, 52, W - 30, 52);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Organismo 7296 — Sistema de Gestión de Compras Públicas', W / 2, 62, { align: 'center' });
    doc.setFontSize(9);
    doc.text('Módulo: Compra Ágil — Análisis de Eficiencia y Ahorro', W / 2, 70, { align: 'center' });

    doc.setFillColor(...COLOR.grayLight);
    doc.rect(0, 80, W, 50, 'F');

    doc.setTextColor(...COLOR.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Información del Reporte', 14, 94);

    const metaItems = [
        ['Fecha de generación:', new Date().toLocaleString('es-CL')],
        ['Período filtrado:', filtros?.fechaDesde ? `${filtros.fechaDesde} → ${filtros.fechaHasta || 'hoy'}` : 'Sin filtro (todos los datos)'],
        ['Total Compras Ágiles:', fmtN(kpis.total_ca)],
        ['Compras Adjudicadas:', `${fmtN(kpis.adjudicadas)} (${kpis.total_ca > 0 ? ((kpis.adjudicadas / kpis.total_ca) * 100).toFixed(1) : 0}%)`],
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    metaItems.forEach(([label, val], i) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, 20, 102 + i * 7);
        doc.setFont('helvetica', 'normal');
        doc.text(val, 80, 102 + i * 7);
    });

    doc.setFillColor(...COLOR.primary);
    doc.rect(14, 140, W - 28, 1, 'F');
    doc.setTextColor(...COLOR.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CONTENIDO DEL REPORTE', 14, 152);

    const contenido = [
        '1. Resumen Ejecutivo — KPIs globales y distribución por estado',
        '2. Análisis de Ahorro — Comparativa presupuesto vs monto OC',
        '3. Metodología Res.188/2026 — % Ahorro y top ítems',
        '4. Detalle Compras Ágiles — Tabla de compras adjudicadas',
        '5. Análisis de Proveedores — Ranking y tasa de adjudicación',
    ];
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.dark);
    doc.setFontSize(9);
    contenido.forEach((c, i) => {
        doc.text(c, 20, 160 + i * 8);
    });

    addFooter(doc);

    // ═══════════════════════════════════════════
    // PÁG 2 — RESUMEN EJECUTIVO
    // ═══════════════════════════════════════════
    doc.addPage();
    let y = addHeader(doc, 'RESUMEN EJECUTIVO', 'Vista general Compra Ágil', filtros, 2, TOTAL_PAGES);

    y = sectionTitle(doc, y, 'INDICADORES PRINCIPALES');
    y = addKpiRow(doc, y, [
        { label: 'Total CA', value: fmtN(kpis.total_ca), color: COLOR.primaryLight },
        { label: 'Adjudicadas', value: fmtN(kpis.adjudicadas), sub: `${kpis.total_ca > 0 ? ((kpis.adjudicadas / kpis.total_ca) * 100).toFixed(1) : 0}% del total`, color: COLOR.successLight },
        { label: 'Desiertas', value: fmtN(kpis.desiertas), color: [255, 243, 205] },
        { label: 'Canceladas', value: fmtN(kpis.canceladas), color: [254, 226, 226] },
    ], W);
    y = addKpiRow(doc, y, [
        { label: 'Presupuesto Total', value: fmt(kpis.total_presupuesto), color: COLOR.primaryLight },
        { label: 'Monto Total OC', value: fmt(kpis.total_monto_oc), color: COLOR.primaryLight },
        { label: 'Ahorro Total', value: fmt(kpis.ahorro_simple), sub: `${kpis.pct_ahorro_simple}% del presupuesto`, color: COLOR.successLight },
        { label: '% Ahorro Res.188', value: `${kpis.pct_ahorro_res188}%`, sub: 'Metodología Res.188/2026', color: COLOR.successLight },
    ], W);

    y = sectionTitle(doc, y, 'DISTRIBUCIÓN POR ESTADO');
    autoTable(doc, {
        startY: y,
        head: [['Estado', 'Cantidad', 'Presupuesto Estimado']],
        body: por_estado.map(e => [e.estado, fmtN(e.cantidad), fmt(e.presupuesto)]),
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: { fillColor: COLOR.primary, textColor: COLOR.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: COLOR.grayLight },
        margin: { left: 14, right: 14 },
    });

    addFooter(doc);

    // ═══════════════════════════════════════════
    // PÁG 3 — ANÁLISIS DE AHORRO
    // ═══════════════════════════════════════════
    doc.addPage();
    y = addHeader(doc, 'ANÁLISIS DE AHORRO', null, filtros, 3, TOTAL_PAGES);

    y = sectionTitle(doc, y, 'METODOLOGÍA RES.188/2026 — INDICADOR 5');

    doc.setFillColor(...COLOR.primaryLight);
    doc.roundedRect(14, y, W - 28, 38, 2, 2, 'F');
    doc.setTextColor(...COLOR.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Fórmula de cálculo del % Ahorro:', 18, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.dark);
    const formulaLines = [
        'Monto Total Ahorrado = Σ [ (Precio promedio ofertas por ítem − Precio adjudicado por ítem) × Cantidad adjudicada ]',
        '% Ahorro = (Monto Total Ahorrado / Monto Total Adjudicado) × 100',
        '',
        'Aplicabilidad: Solo Compras Ágiles en estado "Proveedor seleccionado" con mínimo 2 cotizantes por ítem.',
        'Fuente normativa: Resolución Exenta N°188/2026, Dirección ChileCompra.',
    ];
    formulaLines.forEach((l, i) => doc.text(l, 18, y + 14 + i * 6));
    y += 42;

    y = addKpiRow(doc, y, [
        { label: '% Ahorro Res.188', value: `${kpis.pct_ahorro_res188}%`, color: COLOR.successLight },
        { label: 'Monto Ahorrado Res.188', value: fmt(kpis.ahorro_res188), color: COLOR.successLight },
        { label: 'Monto Adjudicado Res.188', value: fmt(kpis.adjudicado_res188), color: COLOR.primaryLight },
        { label: 'Ahorro Simple (Ppto-OC)', value: fmt(kpis.ahorro_simple), sub: `${kpis.pct_ahorro_simple}%`, color: COLOR.successLight },
    ], W);

    y = sectionTitle(doc, y, 'AHORRO POR UNIDAD DE COMPRA');
    autoTable(doc, {
        startY: y,
        head: [['Unidad de Compra', 'Total CAs', 'Adjudicadas', 'Presupuesto', 'Monto OC', 'Ahorro', '% Ahorro']],
        body: (por_unidad || []).slice(0, 15).map(u => [
            u.unidad, fmtN(u.total), fmtN(u.adjudicadas),
            fmt(u.presupuesto), u.monto_oc > 0 ? fmt(u.monto_oc) : '—',
            fmt(u.ahorro), `${u.pct_ahorro}%`,
        ]),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: COLOR.primary, textColor: COLOR.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: COLOR.grayLight },
        columnStyles: {
            4: { halign: 'right' }, 5: { halign: 'right' },
            6: { halign: 'right', textColor: [22, 163, 74] }, 7: { halign: 'right' },
        },
        margin: { left: 14, right: 14 },
    });

    addFooter(doc);

    // ═══════════════════════════════════════════
    // PÁG 4 — DETALLE COMPRAS ÁGILES
    // ═══════════════════════════════════════════
    doc.addPage();
    y = addHeader(doc, 'DETALLE COMPRAS ÁGILES', null, filtros, 4, TOTAL_PAGES);

    y = sectionTitle(doc, y, 'COMPRAS ÁGILES ADJUDICADAS');

    const comprasAdj = (compras || []).filter(c => c.estadoglosa === 'Proveedor seleccionado').slice(0, 40);
    autoTable(doc, {
        startY: y,
        head: [['Código CA', 'Nombre', 'Unidad', 'Presupuesto', 'OC Código', 'Publicación']],
        body: comprasAdj.map(c => [
            c.codigocompraagil,
            (c.nombre || '').slice(0, 40) + (c.nombre?.length > 40 ? '…' : ''),
            (c.unidadcompra || '').slice(0, 20),
            c.presupuestoestimado ? fmt(c.presupuestoestimado) : '—',
            c.oc_codigo || '—',
            fmtFecha(c.fechapublicacion),
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: COLOR.primary, textColor: COLOR.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: COLOR.grayLight },
        margin: { left: 14, right: 14 },
    });

    if (top_ahorro_items?.length > 0) {
        const finalY = doc.lastAutoTable.finalY + 6;
        y = sectionTitle(doc, finalY, 'TOP ÍTEMS CON MAYOR AHORRO (RES.188)');
        autoTable(doc, {
            startY: y,
            head: [['Código CA', 'Producto', 'Precio Promedio', 'Precio Adjudicado', 'Cantidad', 'Ahorro']],
            body: top_ahorro_items.slice(0, 10).map(i => [
                i.codigo_ca,
                (i.nombre_producto || '').slice(0, 35) + (i.nombre_producto?.length > 35 ? '…' : ''),
                fmt(i.precio_promedio),
                fmt(i.precio_adjudicado),
                fmtN(i.cantidad),
                fmt(i.ahorro),
            ]),
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [22, 101, 52], textColor: COLOR.white, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: COLOR.grayLight },
            margin: { left: 14, right: 14 },
        });
    }

    addFooter(doc);

    // ═══════════════════════════════════════════
    // PÁG 5 — PROVEEDORES
    // ═══════════════════════════════════════════
    doc.addPage();
    y = addHeader(doc, 'ANÁLISIS DE PROVEEDORES', null, filtros, 5, TOTAL_PAGES);

    y = sectionTitle(doc, y, 'RANKING DE PROVEEDORES POR ADJUDICACIÓN');
    autoTable(doc, {
        startY: y,
        head: [['#', 'Razón Social', 'RUT', 'CAs Ganadas', 'Participadas', 'Tasa Adj.', 'Monto Adjudicado']],
        body: (top_proveedores || []).slice(0, 20).map((p, i) => [
            `#${i + 1}`,
            (p.razonsocial || '').slice(0, 35),
            p.rut,
            fmtN(p.ganadas),
            fmtN(p.participadas),
            `${p.tasa}%`,
            fmt(p.monto_total),
        ]),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: COLOR.primary, textColor: COLOR.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: COLOR.grayLight },
        columnStyles: {
            3: { halign: 'center', textColor: [22, 163, 74], fontStyle: 'bold' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
    });

    if (mejora_items?.length > 0) {
        const finalY2 = doc.lastAutoTable.finalY + 6;
        y = sectionTitle(doc, finalY2, 'OPORTUNIDADES DE MEJORA — PRECIO ADJUDICADO > PROMEDIO');
        autoTable(doc, {
            startY: y,
            head: [['Código CA', 'Producto', 'Precio Promedio', 'Precio Adjudicado', 'Sobrecosto']],
            body: mejora_items.slice(0, 10).map(i => [
                i.codigo_ca,
                (i.nombre_producto || '').slice(0, 40),
                fmt(i.precio_promedio),
                fmt(i.precio_adjudicado),
                fmt(i.diferencia),
            ]),
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [180, 83, 9], textColor: COLOR.white, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [255, 247, 237] },
            columnStyles: { 4: { textColor: [185, 28, 28], fontStyle: 'bold' } },
            margin: { left: 14, right: 14 },
        });
    }

    addFooter(doc);

    // Guardar
    const nombreArchivo = `Reporte_CompraAgil_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(nombreArchivo);
}
