"""
Módulo PAC — generación de gráficos estáticos (matplotlib) reutilizados por los
3 formatos de reportería (Word, PPT, PDF). Backend 'Agg': sin display, server-side.

Paleta consistente con el dashboard (frontend/src/features/pac-cumplimiento/):
  Dentro/En fecha = verde, Fuera/Atrasado = rojo, Pendiente = ámbar,
  Sin clasificar/planificación = gris.
"""
import io
from datetime import date

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt
from pptx import Presentation
from pptx.util import Inches as PptxInches, Pt as PptxPt
from pptx.dml.color import RGBColor
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, PageBreak,
)

from .plantillas_narrativas import (
    etiqueta_periodo, parrafo_resumen_ejecutivo, parrafo_cumplimiento_temporal,
    parrafo_capitulo_subdireccion, parrafo_conclusiones,
)

COLOR_DENTRO = '#16a34a'
COLOR_FUERA = '#dc2626'
COLOR_PENDIENTE = '#f59e0b'
COLOR_SIN_DATO = '#9ca3af'

plt.rcParams.update({
    'font.family': 'sans-serif',
    'font.size': 10,
    'axes.edgecolor': '#cbd5e1',
    'axes.labelcolor': '#374151',
    'text.color': '#374151',
    'xtick.color': '#64748b',
    'ytick.color': '#64748b',
})


def _fig_a_bytes(fig, dpi=150):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', transparent=False, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def grafico_donut_dentro_fuera(pct_dentro, titulo='Dentro / Fuera PAC'):
    """Dona simple 2 segmentos — usada en Resumen Ejecutivo y capítulos por subdirección."""
    pct_fuera = round(100 - pct_dentro, 1)
    fig, ax = plt.subplots(figsize=(3.6, 3.6))
    ax.pie(
        [pct_dentro, pct_fuera],
        colors=[COLOR_DENTRO, COLOR_FUERA],
        startangle=90,
        wedgeprops={'width': 0.35, 'edgecolor': 'white', 'linewidth': 2},
        autopct=lambda p: f'{p:.0f}%' if p > 5 else '',
        pctdistance=0.82,
        textprops={'color': 'white', 'fontweight': 'bold', 'fontsize': 11},
    )
    ax.set_title(titulo, fontsize=11, pad=10)
    fig.legend(
        ['Dentro PAC', 'Fuera PAC'], loc='lower center', ncol=2, frameon=False,
        bbox_to_anchor=(0.5, -0.02), fontsize=9,
    )
    return _fig_a_bytes(fig)


def grafico_barras_comparativa_anual(comparativa_anual, titulo='Comparativa histórica — Dentro vs Fuera PAC'):
    """Barras apiladas por año — comparativa_anual: [{anho, dentro, fuera, ...}]."""
    if not comparativa_anual:
        return None
    anhos = [str(r['anho']) for r in comparativa_anual]
    dentro = [r['dentro'] for r in comparativa_anual]
    fuera = [r['fuera'] for r in comparativa_anual]

    fig, ax = plt.subplots(figsize=(6.4, 3.6))
    ax.bar(anhos, dentro, color=COLOR_DENTRO, label='Dentro PAC', width=0.55)
    ax.bar(anhos, fuera, bottom=dentro, color=COLOR_FUERA, label='Fuera PAC', width=0.55)
    ax.set_title(titulo, fontsize=11, pad=10)
    ax.spines[['top', 'right']].set_visible(False)
    ax.legend(loc='upper center', ncol=2, frameon=False, bbox_to_anchor=(0.5, -0.12))
    fig.tight_layout()
    return _fig_a_bytes(fig)


def grafico_donut_cumplimiento_temporal(kpis_temporal, titulo='Cumplimiento Temporal'):
    """Dona 4 segmentos — En fecha / Atrasado / Pendiente / Sin planificación con fecha."""
    valores = [
        kpis_temporal.get('en_fecha', 0),
        kpis_temporal.get('atrasado', 0),
        kpis_temporal.get('pendiente', 0),
        kpis_temporal.get('sin_planificacion_con_fecha', 0),
    ]
    if not sum(valores):
        return None
    etiquetas = ['En fecha', 'Atrasado', 'Pendiente', 'Sin planificación']
    colores = [COLOR_DENTRO, COLOR_FUERA, COLOR_PENDIENTE, COLOR_SIN_DATO]
    # Se omiten segmentos en 0 para no saturar la leyenda con etiquetas vacías.
    datos = [(e, v, c) for e, v, c in zip(etiquetas, valores, colores) if v > 0]

    fig, ax = plt.subplots(figsize=(4.2, 3.8))
    ax.pie(
        [d[1] for d in datos], colors=[d[2] for d in datos], startangle=90,
        wedgeprops={'width': 0.35, 'edgecolor': 'white', 'linewidth': 2},
    )
    ax.set_title(titulo, fontsize=11, pad=10)
    fig.legend(
        [d[0] for d in datos], loc='lower center', ncol=2, frameon=False,
        bbox_to_anchor=(0.5, -0.05), fontsize=8,
    )
    return _fig_a_bytes(fig)


def grafico_barras_ranking(filas, campo_nombre='nombre', campo_valor='score', titulo='Ranking', color=COLOR_DENTRO, horizontal=True):
    """Barras horizontales para rankings mejores/peores (departamento o formulario)."""
    if not filas:
        return None
    nombres = [ (f[campo_nombre][:40] + '…') if len(f[campo_nombre]) > 40 else f[campo_nombre] for f in filas]
    valores = [f[campo_valor] for f in filas]

    fig, ax = plt.subplots(figsize=(6.4, max(2.2, 0.35 * len(filas))))
    if horizontal:
        ax.barh(nombres[::-1], valores[::-1], color=color, height=0.6)
        ax.set_xlabel('Score')
    else:
        ax.bar(nombres, valores, color=color, width=0.6)
        ax.set_ylabel('Score')
        plt.xticks(rotation=45, ha='right')
    ax.set_title(titulo, fontsize=11, pad=10)
    ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


# =============================================================================
# Informe Word — estructura acordada: Portada → Resumen Ejecutivo Institucional
# → 4 capítulos por subdirección (Dirección SS Osorno) → Ranking consolidado →
# Conclusiones → Anexo (otras unidades de la red + detalle).
# =============================================================================

NOMBRES_SUBDIRECCIONES_INSTITUCIONALES = {
    'DIRECTOR',
    'SUBDIRECCION DE GESTION ASISTENCIAL',
    'SUBDIRECCION ADMINISTRATIVA',
    'SUBDIRECCION DE GESTION Y DESARROLLO DE LAS PERSONAS',
}


def _money(v):
    return f'${v:,.0f}'.replace(',', '.')


def _tabla_departamentos(doc, departamentos):
    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    encabezados = ['Departamento', 'Total', '% Dentro PAC', '% En fecha', 'Monto Dentro PAC']
    for i, h in enumerate(encabezados):
        tabla.rows[0].cells[i].text = h
    for d in departamentos:
        fila = tabla.add_row().cells
        fila[0].text = d['nombre'].title()
        fila[1].text = str(d['total'])
        fila[2].text = f"{d['pct_dentro']}%"
        fila[3].text = f"{d['pct_en_fecha']}%" if d['pct_en_fecha'] is not None else '—'
        fila[4].text = _money(d['monto_dentro'])


def _tabla_ranking_depto(doc, filas):
    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    for i, h in enumerate(['Departamento', 'Subdirección', 'Total', 'Score', '% Dentro PAC']):
        tabla.rows[0].cells[i].text = h
    for f in filas:
        fila = tabla.add_row().cells
        fila[0].text = f['nombre'].title()
        fila[1].text = f['subdireccion'].title()
        fila[2].text = str(f['total'])
        fila[3].text = f"{f['score']:.0f}"
        fila[4].text = f"{f['pct_dentro']}%"


def generar_informe_word(periodo):
    """Genera el informe Word del período ('YYYY-MM' o 'YYYY-QN'). Retorna BytesIO.

    `periodo` define mensual vs trimestral automáticamente según su formato
    (no hay un parámetro `tipo` separado — el propio string ya lo determina).
    """
    from .services import (
        calcular_pac_dentro_fuera_stats, calcular_pac_comparativa_periodos,
        calcular_pac_cumplimiento_temporal, calcular_pac_jerarquia, calcular_pac_rankings,
        _rango_fechas_periodo,
    )

    desde, hasta = _rango_fechas_periodo(periodo)
    desde_iso, hasta_iso = desde.isoformat(), hasta.isoformat()
    label = etiqueta_periodo(periodo)

    dentro_fuera = calcular_pac_dentro_fuera_stats(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    comparativa_periodos = calcular_pac_comparativa_periodos(periodo)
    temporal = calcular_pac_cumplimiento_temporal(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    jerarquia = calcular_pac_jerarquia(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    rankings_depto = calcular_pac_rankings(fecha_desde=desde_iso, fecha_hasta=hasta_iso, tipo='depto')

    doc = Document()

    # --- Portada -------------------------------------------------------------
    titulo = doc.add_heading('Informe de Seguimiento del Plan Anual de Compras', level=0)
    titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(
        f'Servicio de Salud Osorno\nPeríodo: {label}\nGenerado el {date.today().strftime("%d-%m-%Y")}'
    )
    run.font.size = Pt(14)
    doc.add_page_break()

    # --- Resumen Ejecutivo Institucional --------------------------------------
    doc.add_heading('Resumen Ejecutivo Institucional', level=1)
    doc.add_paragraph(parrafo_resumen_ejecutivo(label, dentro_fuera['kpis'], comparativa_periodos))
    doc.add_paragraph(parrafo_cumplimiento_temporal(label, temporal['kpis']))

    img = grafico_donut_dentro_fuera(dentro_fuera['kpis']['pct_dentro'])
    if img:
        doc.add_picture(img, width=Inches(3))
    img = grafico_barras_comparativa_anual(dentro_fuera['comparativa_anual'])
    if img:
        doc.add_picture(img, width=Inches(5.5))
    img = grafico_donut_cumplimiento_temporal(temporal['kpis'])
    if img:
        doc.add_picture(img, width=Inches(3.5))
    doc.add_page_break()

    # --- 4 capítulos institucionales ------------------------------------------
    subs_institucionales = [
        s for s in jerarquia['subdirecciones'] if s['nombre'] in NOMBRES_SUBDIRECCIONES_INSTITUCIONALES
    ]
    otras_ramas = [
        s for s in jerarquia['subdirecciones'] if s['nombre'] not in NOMBRES_SUBDIRECCIONES_INSTITUCIONALES
    ]

    for sub_nodo in subs_institucionales:
        doc.add_heading(sub_nodo['nombre'].title(), level=1)
        mejor_rk = next((f for f in rankings_depto['mejores'] if f['subdireccion'] == sub_nodo['nombre']), None)
        peor_rk = next((f for f in rankings_depto['peores'] if f['subdireccion'] == sub_nodo['nombre']), None)
        doc.add_paragraph(parrafo_capitulo_subdireccion(sub_nodo['nombre'], sub_nodo, mejor_rk, peor_rk))
        if sub_nodo['departamentos']:
            _tabla_departamentos(doc, sub_nodo['departamentos'])
        else:
            doc.add_paragraph('Sin formularios registrados en el período.')
        doc.add_page_break()

    # --- Ranking Institucional Consolidado ------------------------------------
    doc.add_heading('Ranking Institucional Consolidado', level=1)
    doc.add_heading('Mejores departamentos', level=2)
    if rankings_depto['mejores']:
        _tabla_ranking_depto(doc, rankings_depto['mejores'])
    else:
        doc.add_paragraph('Sin datos suficientes para generar el ranking en este período.')
    doc.add_heading('Departamentos con mayor oportunidad de mejora', level=2)
    if rankings_depto['peores']:
        _tabla_ranking_depto(doc, rankings_depto['peores'])
    else:
        doc.add_paragraph('Sin datos suficientes para generar el ranking en este período.')
    doc.add_page_break()

    # --- Conclusiones y Recomendaciones ---------------------------------------
    doc.add_heading('Conclusiones y Recomendaciones', level=1)
    doc.add_paragraph(parrafo_conclusiones(label, dentro_fuera['kpis'], temporal['kpis']))
    doc.add_page_break()

    # --- Anexo: otras unidades de la red + detalle ----------------------------
    doc.add_heading('Anexo — Otras Unidades de la Red y Detalle', level=1)
    if otras_ramas:
        for sub_nodo in otras_ramas:
            doc.add_heading(sub_nodo['nombre'].title(), level=2)
            _tabla_departamentos(doc, sub_nodo['departamentos'])
    else:
        doc.add_paragraph('Sin registros de otras unidades de la red en este período.')

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


# =============================================================================
# Presentación PPT — espejo resumido del Word: misma estructura de capítulos,
# formato slide en vez de párrafo. 1 slide por subdirección institucional.
# =============================================================================

COLOR_TITULO_PPT = RGBColor(0x1e, 0x29, 0x3b)
COLOR_TEXTO_PPT = RGBColor(0x37, 0x41, 0x51)


def _ppt_slide_en_blanco(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def _ppt_titulo(slide, texto, top=PptxInches(0.3), tamano=28):
    caja = slide.shapes.add_textbox(PptxInches(0.5), top, PptxInches(9), PptxInches(0.8))
    p = caja.text_frame.paragraphs[0]
    run = p.add_run()
    run.text = texto
    run.font.size = PptxPt(tamano)
    run.font.bold = True
    run.font.color.rgb = COLOR_TITULO_PPT
    return caja


def _ppt_parrafo(slide, texto, top, left=PptxInches(0.5), width=PptxInches(9), tamano=14, height=PptxInches(1.2)):
    caja = slide.shapes.add_textbox(left, top, width, height)
    tf = caja.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = texto
    run.font.size = PptxPt(tamano)
    run.font.color.rgb = COLOR_TEXTO_PPT
    return caja


def _ppt_imagen(slide, img_bytes, left, top, width):
    if img_bytes:
        slide.shapes.add_picture(img_bytes, left, top, width=width)


def _ppt_tabla_departamentos(slide, departamentos, top, limite=8):
    filas_datos = departamentos[:limite]
    n_filas = len(filas_datos) + 1
    tabla_shape = slide.shapes.add_table(n_filas, 4, PptxInches(0.5), top, PptxInches(9), PptxInches(0.4 * n_filas))
    tabla = tabla_shape.table
    for i, h in enumerate(['Departamento', 'Total', '% Dentro', '% En fecha']):
        tabla.cell(0, i).text = h
    for r, d in enumerate(filas_datos, start=1):
        tabla.cell(r, 0).text = d['nombre'].title()
        tabla.cell(r, 1).text = str(d['total'])
        tabla.cell(r, 2).text = f"{d['pct_dentro']}%"
        tabla.cell(r, 3).text = f"{d['pct_en_fecha']}%" if d['pct_en_fecha'] is not None else '—'
    for row in tabla.rows:
        for cell in row.cells:
            for p in cell.text_frame.paragraphs:
                for run in p.runs:
                    run.font.size = PptxPt(11)


def generar_presentacion_ppt(periodo):
    """Genera la presentación PPT del período ('YYYY-MM' o 'YYYY-QN'). Retorna BytesIO.
    Espejo resumido del Word — misma estructura, sin la narrativa completa."""
    from .services import (
        calcular_pac_dentro_fuera_stats, calcular_pac_comparativa_periodos,
        calcular_pac_cumplimiento_temporal, calcular_pac_jerarquia, calcular_pac_rankings,
        _rango_fechas_periodo,
    )

    desde, hasta = _rango_fechas_periodo(periodo)
    desde_iso, hasta_iso = desde.isoformat(), hasta.isoformat()
    label = etiqueta_periodo(periodo)

    dentro_fuera = calcular_pac_dentro_fuera_stats(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    comparativa_periodos = calcular_pac_comparativa_periodos(periodo)
    temporal = calcular_pac_cumplimiento_temporal(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    jerarquia = calcular_pac_jerarquia(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    rankings_depto = calcular_pac_rankings(fecha_desde=desde_iso, fecha_hasta=hasta_iso, tipo='depto')

    prs = Presentation()
    prs.slide_width = PptxInches(10)
    prs.slide_height = PptxInches(7.5)

    # --- Portada ---------------------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Seguimiento del Plan Anual de Compras', top=PptxInches(2.6), tamano=32)
    _ppt_parrafo(
        slide, f'Servicio de Salud Osorno · Período: {label}\nGenerado el {date.today().strftime("%d-%m-%Y")}',
        top=PptxInches(3.6), tamano=16,
    )

    # --- Resumen Ejecutivo -------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Resumen Ejecutivo Institucional')
    kpis = dentro_fuera['kpis']
    var_ant = comparativa_periodos['periodo_anterior']['variacion_pp']
    resumen_kpis = (
        f'Total formularios: {kpis["total"]:,} — Dentro PAC: {kpis["dentro"]:,} ({kpis["pct_dentro"]}%) — '
        f'Fuera PAC: {kpis["fuera"]:,}\nVariación vs período anterior: {var_ant:+.1f} p.p.\n'
        f'% Cumplimiento temporal: {temporal["kpis"]["pct_en_fecha"]}%'
    ).replace(',', '.')
    _ppt_parrafo(slide, resumen_kpis, top=PptxInches(1.1), tamano=15, height=PptxInches(1.4))
    _ppt_imagen(slide, grafico_donut_dentro_fuera(kpis['pct_dentro']), PptxInches(0.5), PptxInches(2.7), PptxInches(3.2))
    _ppt_imagen(slide, grafico_donut_cumplimiento_temporal(temporal['kpis']), PptxInches(4.2), PptxInches(2.7), PptxInches(3.2))

    # --- Comparativa histórica -----------------------------------------------
    img_comp = grafico_barras_comparativa_anual(dentro_fuera['comparativa_anual'])
    if img_comp:
        slide = _ppt_slide_en_blanco(prs)
        _ppt_titulo(slide, 'Comparativa Histórica — Dentro vs Fuera PAC')
        _ppt_imagen(slide, img_comp, PptxInches(1), PptxInches(1.2), PptxInches(8))

    # --- 4 capítulos institucionales (1 slide c/u) ----------------------------
    subs_institucionales = [
        s for s in jerarquia['subdirecciones'] if s['nombre'] in NOMBRES_SUBDIRECCIONES_INSTITUCIONALES
    ]
    for sub_nodo in subs_institucionales:
        slide = _ppt_slide_en_blanco(prs)
        _ppt_titulo(slide, sub_nodo['nombre'].title(), tamano=24)
        resumen_sub = (
            f'{sub_nodo["total"]:,} formularios — {sub_nodo["pct_dentro"]}% Dentro PAC — '
            f'{_money(sub_nodo["monto_dentro"])} gestionados dentro del PAC'
        ).replace(',', '.')
        _ppt_parrafo(slide, resumen_sub, top=PptxInches(1.05), tamano=14, height=PptxInches(0.6))
        _ppt_tabla_departamentos(slide, sub_nodo['departamentos'], top=PptxInches(1.7))

    # --- Ranking consolidado (mejores + peores, top 8 c/u) --------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Ranking Institucional — Mejores')
    _ppt_tabla_departamentos(slide, rankings_depto['mejores'], top=PptxInches(1.1), limite=8)

    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Ranking Institucional — Mayor Oportunidad de Mejora')
    _ppt_tabla_departamentos(slide, rankings_depto['peores'], top=PptxInches(1.1), limite=8)

    # --- Conclusiones ----------------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Conclusiones y Recomendaciones')
    _ppt_parrafo(
        slide, parrafo_conclusiones(label, dentro_fuera['kpis'], temporal['kpis']),
        top=PptxInches(1.2), tamano=16, height=PptxInches(3),
    )

    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf


# =============================================================================
# Reporte PDF — reportlab (Platypus). Misma estructura resumida que el PPT,
# sin dependencias nativas del sistema (seguro en Windows y en el servidor).
# =============================================================================

_PDF_ESTILOS = getSampleStyleSheet()
_PDF_ESTILOS.add(ParagraphStyle(
    name='TituloPortada', fontSize=22, leading=28, alignment=1, spaceAfter=14, textColor=colors.HexColor('#1e293b'),
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='Subportada', fontSize=13, leading=20, alignment=1, textColor=colors.HexColor('#475569'),
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='TituloCapitulo', fontSize=16, leading=20, spaceBefore=6, spaceAfter=10, textColor=colors.HexColor('#1e293b'),
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='TituloSeccion', fontSize=13, leading=17, spaceBefore=4, spaceAfter=8, textColor=colors.HexColor('#334155'),
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='Cuerpo', fontSize=10.5, leading=15, spaceAfter=10, textColor=colors.HexColor('#374151'),
))

_PDF_TABLA_ESTILO = TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#334155')),
    ('FONTSIZE', (0, 0), (-1, -1), 8.5),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
])


def _pdf_tabla_departamentos(departamentos, limite=12):
    encabezado = ['Departamento', 'Total', '% Dentro', '% En fecha', 'Monto Dentro PAC']
    filas = [encabezado]
    for d in departamentos[:limite]:
        filas.append([
            d['nombre'].title(), str(d['total']), f"{d['pct_dentro']}%",
            f"{d['pct_en_fecha']}%" if d['pct_en_fecha'] is not None else '—', _money(d['monto_dentro']),
        ])
    tabla = Table(filas, colWidths=[2.4 * inch, 0.6 * inch, 0.8 * inch, 0.8 * inch, 1.4 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_ranking(filas_ranking, limite=10):
    encabezado = ['Departamento', 'Subdirección', 'Score', '% Dentro']
    filas = [encabezado]
    for f in filas_ranking[:limite]:
        filas.append([f['nombre'].title(), f['subdireccion'].title(), f"{f['score']:.0f}", f"{f['pct_dentro']}%"])
    tabla = Table(filas, colWidths=[2.2 * inch, 2.2 * inch, 0.8 * inch, 0.8 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_imagen(img_bytes, width_in, height_in):
    if not img_bytes:
        return None
    return RLImage(img_bytes, width=width_in * inch, height=height_in * inch)


def generar_reporte_pdf(periodo):
    """Genera el reporte PDF del período ('YYYY-MM' o 'YYYY-QN'). Retorna BytesIO.
    Misma estructura resumida que el PPT — portada, resumen ejecutivo, 4 capítulos
    institucionales, ranking consolidado y conclusiones."""
    from .services import (
        calcular_pac_dentro_fuera_stats, calcular_pac_comparativa_periodos,
        calcular_pac_cumplimiento_temporal, calcular_pac_jerarquia, calcular_pac_rankings,
        _rango_fechas_periodo,
    )

    desde, hasta = _rango_fechas_periodo(periodo)
    desde_iso, hasta_iso = desde.isoformat(), hasta.isoformat()
    label = etiqueta_periodo(periodo)

    dentro_fuera = calcular_pac_dentro_fuera_stats(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    comparativa_periodos = calcular_pac_comparativa_periodos(periodo)
    temporal = calcular_pac_cumplimiento_temporal(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    jerarquia = calcular_pac_jerarquia(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    rankings_depto = calcular_pac_rankings(fecha_desde=desde_iso, fecha_hasta=hasta_iso, tipo='depto')

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch, leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    est = _PDF_ESTILOS
    story = []

    # --- Portada -----------------------------------------------------------
    story.append(Spacer(1, 2 * inch))
    story.append(Paragraph('Informe de Seguimiento del Plan Anual de Compras', est['TituloPortada']))
    story.append(Paragraph(
        f'Servicio de Salud Osorno<br/>Período: {label}<br/>'
        f'Generado el {date.today().strftime("%d-%m-%Y")}',
        est['Subportada'],
    ))
    story.append(PageBreak())

    # --- Resumen Ejecutivo ---------------------------------------------------
    story.append(Paragraph('Resumen Ejecutivo Institucional', est['TituloCapitulo']))
    story.append(Paragraph(parrafo_resumen_ejecutivo(label, dentro_fuera['kpis'], comparativa_periodos), est['Cuerpo']))
    story.append(Paragraph(parrafo_cumplimiento_temporal(label, temporal['kpis']), est['Cuerpo']))

    img = _pdf_imagen(grafico_donut_dentro_fuera(dentro_fuera['kpis']['pct_dentro']), 2.6, 2.6)
    if img:
        story.append(img)
    img = _pdf_imagen(grafico_barras_comparativa_anual(dentro_fuera['comparativa_anual']), 5.5, 3.1)
    if img:
        story.append(img)
    story.append(PageBreak())

    # --- 4 capítulos institucionales ------------------------------------------
    subs_institucionales = [
        s for s in jerarquia['subdirecciones'] if s['nombre'] in NOMBRES_SUBDIRECCIONES_INSTITUCIONALES
    ]
    for sub_nodo in subs_institucionales:
        mejor_rk = next((f for f in rankings_depto['mejores'] if f['subdireccion'] == sub_nodo['nombre']), None)
        peor_rk = next((f for f in rankings_depto['peores'] if f['subdireccion'] == sub_nodo['nombre']), None)
        story.append(Paragraph(sub_nodo['nombre'].title(), est['TituloCapitulo']))
        story.append(Paragraph(parrafo_capitulo_subdireccion(sub_nodo['nombre'], sub_nodo, mejor_rk, peor_rk), est['Cuerpo']))
        if sub_nodo['departamentos']:
            story.append(_pdf_tabla_departamentos(sub_nodo['departamentos']))
        else:
            story.append(Paragraph('Sin formularios registrados en el período.', est['Cuerpo']))
        story.append(PageBreak())

    # --- Ranking Institucional Consolidado ------------------------------------
    story.append(Paragraph('Ranking Institucional Consolidado', est['TituloCapitulo']))
    story.append(Paragraph('Mejores departamentos', est['TituloSeccion']))
    if rankings_depto['mejores']:
        story.append(_pdf_tabla_ranking(rankings_depto['mejores']))
    else:
        story.append(Paragraph('Sin datos suficientes para generar el ranking en este período.', est['Cuerpo']))
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph('Departamentos con mayor oportunidad de mejora', est['TituloSeccion']))
    if rankings_depto['peores']:
        story.append(_pdf_tabla_ranking(rankings_depto['peores']))
    else:
        story.append(Paragraph('Sin datos suficientes para generar el ranking en este período.', est['Cuerpo']))
    story.append(PageBreak())

    # --- Conclusiones ------------------------------------------------------
    story.append(Paragraph('Conclusiones y Recomendaciones', est['TituloCapitulo']))
    story.append(Paragraph(parrafo_conclusiones(label, dentro_fuera['kpis'], temporal['kpis']), est['Cuerpo']))

    doc.build(story)
    buf.seek(0)
    return buf
