"""
Módulo PAC — generación de reportería institucional (Word, PPT, PDF) para el
Servicio de Salud Osorno. Informe único y exhaustivo (decisión del usuario
2026-07-21): consolida TODA la información del dashboard /pac-cumplimiento
(Resumen, Jerarquía, Rankings, Cumplimiento Temporal FSC, y Ejecución del Plan
de Compras vía Ficha PAC/OC) en un solo documento por formato — capítulos por
subdirección, portada institucional (logo + fachada), índice con numeración de
página real, y pie de página en todas las hojas.

PPT es deliberadamente más breve (versión ejecutiva pensada para presentar en
una reunión de Alta Dirección) — Word/PDF llevan el detalle exhaustivo con
tablas por departamento.

Paleta institucional: mismos colores que frontend/src/index.css
(--gob-azul/--gob-celeste) y que el dashboard (verde=Dentro/Ejecutado,
rojo=Fuera/Atrasado, ámbar=Pendiente, gris=Sin dato).
"""
import io
import os
from datetime import date

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image as PILImage

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

from pptx import Presentation
from pptx.util import Inches as PptxInches, Pt as PptxPt
from pptx.dml.color import RGBColor as PptxRGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Image as RLImage, PageBreak,
)
from reportlab.platypus.tableofcontents import TableOfContents

from .plantillas_narrativas import (
    etiqueta_periodo, parrafo_resumen_ejecutivo, parrafo_cumplimiento_temporal,
    parrafo_capitulo_subdireccion, parrafo_conclusiones, _n, _money,
)

# =============================================================================
# Identidad institucional
# =============================================================================

NOMBRE_INSTITUCION = 'Dirección Servicio de Salud Osorno'
TITULO_INFORME = 'Informe de Seguimiento y Ejecución del Plan Anual de Compras'

COLOR_INSTITUCIONAL = '#1e3a5f'        # --gob-azul (frontend/src/index.css)
COLOR_INSTITUCIONAL_CLARO = '#38b2bd'  # --gob-celeste
COLOR_DENTRO = '#16a34a'
COLOR_FUERA = '#dc2626'
COLOR_PENDIENTE = '#f59e0b'
COLOR_SIN_DATO = '#9ca3af'

NOMBRES_SUBDIRECCIONES_INSTITUCIONALES = {
    'DIRECTOR',
    'SUBDIRECCION DE GESTION ASISTENCIAL',
    'SUBDIRECCION ADMINISTRATIVA',
    'SUBDIRECCION DE GESTION Y DESARROLLO DE LAS PERSONAS',
}

# Los nombres de subdirección llegan en mayúsculas y sin tildes desde el origen
# (`SsoSubdireccion.nombre`/`PlanerPAC.sub`) — un informe institucional para Alta
# Dirección merece la ortografía correcta al menos para estas 4 ramas fijas, que
# son además los títulos de capítulo más visibles del documento (encabezados +
# índice). No se intenta corregir los ~150 nombres de departamento (serían
# demasiados para mantener a mano) — solo las subdirecciones.
_NOMBRES_DISPLAY_SUBDIRECCION = {
    'DIRECTOR': 'Director',
    'SUBDIRECCION DE GESTION ASISTENCIAL': 'Subdirección de Gestión Asistencial',
    'SUBDIRECCION ADMINISTRATIVA': 'Subdirección Administrativa',
    'SUBDIRECCION DE GESTION Y DESARROLLO DE LAS PERSONAS': 'Subdirección de Gestión y Desarrollo de las Personas',
    'SIN CLASIFICAR': 'Sin Clasificar',
}


def _nombre_subdireccion_display(nombre):
    if not nombre:
        return nombre
    return _NOMBRES_DISPLAY_SUBDIRECCION.get(nombre.upper(), nombre.title())

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_LOGO_PATH = os.path.join(_BASE_DIR, 'frontend', 'public', 'logo.jpg')
_EDIFICIO_PATH = os.path.join(_BASE_DIR, 'frontend', 'public', 'edificio.jpg')

_CACHE_IMAGENES = {}


def _imagen_redimensionada(path, ancho_max):
    """Carga y cachea (en memoria del proceso) una versión redimensionada de una
    imagen institucional — `logo.jpg` pesa 3.6MB a 5906x5349px; insertarlo tal cual
    en cada reporte generado infla el archivo de salida y ralentiza la generación."""
    clave = (path, ancho_max)
    if clave not in _CACHE_IMAGENES:
        try:
            img = PILImage.open(path).convert('RGB')
            if img.width > ancho_max:
                ratio = ancho_max / img.width
                img = img.resize((ancho_max, int(img.height * ratio)), PILImage.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=87)
            _CACHE_IMAGENES[clave] = buf.getvalue()
        except Exception:
            _CACHE_IMAGENES[clave] = None
    data = _CACHE_IMAGENES[clave]
    return io.BytesIO(data) if data else None


def _logo_bytes(ancho_max=500):
    return _imagen_redimensionada(_LOGO_PATH, ancho_max)


def _edificio_bytes(ancho_max=1000):
    return _imagen_redimensionada(_EDIFICIO_PATH, ancho_max)


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


def _truncar(texto, largo):
    texto = str(texto or '—')
    return texto if len(texto) <= largo else texto[:largo - 1] + '…'


# =============================================================================
# Gráficos (matplotlib → PNG) — reutilizados por Word/PPT/PDF
# =============================================================================

def grafico_donut_dentro_fuera(pct_dentro, titulo='Dentro / Fuera PAC'):
    """Dona simple 2 segmentos — % Dentro/Fuera PAC a nivel de formularios."""
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


def grafico_donut_ejecucion_planer(ejecutados, pendientes, atrasados, titulo='Ejecución Plan de Compras'):
    """Dona 3 segmentos — Ejecutado/Pendiente/Atrasado, dominio Ficha PAC (`PlanerPAC`).
    Distinto de `grafico_donut_cumplimiento_temporal` (dominio formularios FSC) — no
    reutilizarlo acá evita mostrar la etiqueta 'En fecha' donde correspondía 'Ejecutado'."""
    valores = [ejecutados, pendientes, atrasados]
    if not sum(valores):
        return None
    etiquetas = ['Ejecutado', 'Pendiente', 'Atrasado']
    colores = [COLOR_DENTRO, COLOR_PENDIENTE, COLOR_FUERA]
    datos = [(e, v, c) for e, v, c in zip(etiquetas, valores, colores) if v > 0]

    fig, ax = plt.subplots(figsize=(4.2, 3.8))
    ax.pie(
        [d[1] for d in datos], colors=[d[2] for d in datos], startangle=90,
        wedgeprops={'width': 0.35, 'edgecolor': 'white', 'linewidth': 2},
        autopct=lambda p: f'{p:.0f}%' if p > 5 else '',
        pctdistance=0.82,
        textprops={'color': 'white', 'fontweight': 'bold', 'fontsize': 10},
    )
    ax.set_title(titulo, fontsize=11, pad=10)
    fig.legend(
        [d[0] for d in datos], loc='lower center', ncol=3, frameon=False,
        bbox_to_anchor=(0.5, -0.02), fontsize=8,
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
    """Barras horizontales para rankings mejores/peores (departamento)."""
    if not filas:
        return None
    nombres = [_truncar(f[campo_nombre], 40) for f in filas]
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


def grafico_evolucion_mensual_dentro_fuera(meses, anho, anho_anterior, titulo=None):
    """Barras Dentro/Fuera PAC por mes de `anho` + línea de % Dentro del año
    anterior superpuesta — mismo dato que el panel 'Temporalidad' del Resumen."""
    if not meses or not any(m['total'] for m in meses):
        return None
    nombres_mes = [m['nombre_mes'] for m in meses]
    dentro = [m['dentro'] for m in meses]
    fuera = [m['fuera'] for m in meses]
    pct_anterior = [m['pct_dentro_anho_anterior'] for m in meses]

    fig, ax1 = plt.subplots(figsize=(7.2, 3.3))
    ax1.bar(nombres_mes, dentro, color=COLOR_DENTRO, label=f'Dentro PAC {anho}')
    ax1.bar(nombres_mes, fuera, bottom=dentro, color=COLOR_FUERA, label=f'Fuera PAC {anho}')
    ax1.set_ylabel('N° formularios')
    ax1.spines[['top']].set_visible(False)

    ax2 = ax1.twinx()
    puntos = [(i, v) for i, v in enumerate(pct_anterior) if v is not None]
    if puntos:
        xs, ys = zip(*puntos)
        ax2.plot(xs, ys, color='#64748b', linestyle='--', marker='o', markersize=3, label=f'% Dentro {anho_anterior}')
    ax2.set_ylabel(f'% Dentro {anho_anterior}')
    ax2.set_ylim(0, 100)

    ax1.set_title(titulo or 'Evolución mensual — Dentro/Fuera PAC', fontsize=11, pad=10)
    l1, e1 = ax1.get_legend_handles_labels()
    l2, e2 = ax2.get_legend_handles_labels()
    ax1.legend(l1 + l2, e1 + e2, loc='upper center', bbox_to_anchor=(0.5, -0.16), ncol=3, fontsize=8, frameon=False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def grafico_barras_ejecucion_mensual_planer(meses, titulo=None):
    """Barras apiladas Ejecutado/Pendiente/Atrasado por mes — Ejecución del Plan de
    Compras (Ficha PAC), mismo dato que el gráfico del sub-tab Temporal."""
    if not meses or not any(m['total'] for m in meses):
        return None
    nombres_mes = [m['nombre_mes'] for m in meses]
    ejecutados = [m['ejecutados'] for m in meses]
    pendientes = [m['pendientes'] for m in meses]
    atrasados = [m['atrasados'] for m in meses]
    base_atrasado = [e + p for e, p in zip(ejecutados, pendientes)]

    fig, ax = plt.subplots(figsize=(7.2, 3))
    ax.bar(nombres_mes, ejecutados, color=COLOR_DENTRO, label='Ejecutado')
    ax.bar(nombres_mes, pendientes, bottom=ejecutados, color=COLOR_PENDIENTE, label='Pendiente')
    ax.bar(nombres_mes, atrasados, bottom=base_atrasado, color=COLOR_FUERA, label='Atrasado')
    ax.set_ylabel('N° fichas')
    ax.spines[['top']].set_visible(False)
    ax.set_title(titulo or 'Ejecución mensual del Plan de Compras', fontsize=11, pad=10)
    ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.14), ncol=3, fontsize=8, frameon=False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def grafico_barras_ejecucion_por_depto(departamentos, titulo=None):
    """Barras horizontales apiladas Ejecutado/Pendiente/Atrasado por departamento —
    versión del gráfico de `grafico_barras_ejecucion_mensual_planer` pero con eje
    departamento en vez de mes, para el capítulo por subdirección del PPT."""
    filas = [d for d in departamentos if d['total']]
    if not filas:
        return None
    nombres = [_truncar(d['nombre'].title(), 32) for d in filas]
    ejecutados = [d['ejecutados'] for d in filas]
    pendientes = [d['pendientes'] for d in filas]
    atrasados = [d['atrasados'] for d in filas]
    base_atrasado = [e + p for e, p in zip(ejecutados, pendientes)]

    fig, ax = plt.subplots(figsize=(6.4, max(2.2, 0.45 * len(filas))))
    ax.barh(nombres[::-1], ejecutados[::-1], color=COLOR_DENTRO, label='Ejecutado')
    ax.barh(nombres[::-1], pendientes[::-1], left=ejecutados[::-1], color=COLOR_PENDIENTE, label='Pendiente')
    ax.barh(nombres[::-1], atrasados[::-1], left=base_atrasado[::-1], color=COLOR_FUERA, label='Atrasado')
    ax.set_xlabel('N° fichas')
    ax.spines[['top', 'right']].set_visible(False)
    ax.set_title(titulo or 'Ejecución del Plan de Compras por departamento', fontsize=11, pad=10)
    ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.12), ncol=3, fontsize=8, frameon=False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


# =============================================================================
# Recolección y combinación de datos — TODO el dashboard /pac-cumplimiento en
# una sola función, para que los 3 formatos consuman exactamente lo mismo.
# =============================================================================

def _anho_de_periodo(periodo):
    return int(periodo[:4])


def _datos_informe_completo(periodo):
    """Reúne TODA la información del dashboard PAC Cumplimiento para un `periodo`
    ('YYYY-MM' o 'YYYY-QN'): las secciones basadas en FormularioFSCDerivado respetan
    el período exacto (mes/trimestre); la sección de Ejecución del Plan de Compras
    (Ficha PAC/OC) siempre refleja el AÑO PAC completo extraído de `periodo`, porque
    esa planificación es intrínsecamente anual — se etiqueta así explícitamente en
    el informe para no confundir ambos cortes temporales."""
    from .services import (
        calcular_pac_dentro_fuera_stats, calcular_pac_comparativa_periodos,
        calcular_pac_cumplimiento_temporal, calcular_pac_jerarquia, calcular_pac_rankings,
        calcular_pac_resumen_subdireccion, calcular_pac_temporalidad_mensual,
        calcular_pac_jerarquia_planer, calcular_pac_temporal_mensual_planer,
        _calcular_fichas_pac_completo, _rango_fechas_periodo,
    )

    anho = _anho_de_periodo(periodo)
    desde, hasta = _rango_fechas_periodo(periodo)
    desde_iso, hasta_iso = desde.isoformat(), hasta.isoformat()
    label = etiqueta_periodo(periodo)

    dentro_fuera = calcular_pac_dentro_fuera_stats(fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    comparativa_periodos = calcular_pac_comparativa_periodos(periodo)
    # `anho=anho` es obligatorio acá aunque fecha_desde/fecha_hasta ya acoten el período: las
    # 3 funciones de abajo usan `anho` para escoger los eventos planificados de PlanerPAC
    # contra los que se compara "% en fecha" (`_eventos_planificados_por_proyecto`). Sin
    # `anho`, ese universo de eventos queda SIN filtrar por año (todo el histórico PC20-PC26+
    # en vez de solo el año del período), dando un "% en fecha"/score de ranking distinto al
    # que muestra el dashboard interactivo para el mismo filtro — bug real encontrado en
    # revisión de código 2026-07-22, coherente con cómo la vista del dashboard SÍ pasa `anho`
    # (ver `pac_cumplimiento_temporal_view` en views.py).
    temporal = calcular_pac_cumplimiento_temporal(anho=anho, fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    jerarquia_fsc = calcular_pac_jerarquia(anho=anho, fecha_desde=desde_iso, fecha_hasta=hasta_iso)
    rankings_depto = calcular_pac_rankings(anho=anho, fecha_desde=desde_iso, fecha_hasta=hasta_iso, tipo='depto')
    rankings_formulario = calcular_pac_rankings(anho=anho, fecha_desde=desde_iso, fecha_hasta=hasta_iso, tipo='formulario')
    resumen_subdireccion = calcular_pac_resumen_subdireccion(anho)
    temporalidad_mensual = calcular_pac_temporalidad_mensual(anho)

    fichas = _calcular_fichas_pac_completo(anho=anho)
    jerarquia_planer = calcular_pac_jerarquia_planer(anho)
    temporal_mensual_planer = calcular_pac_temporal_mensual_planer(anho)

    hoy = date.today()
    anho_prox, mes_prox = (hoy.year, hoy.month + 1) if hoy.month < 12 else (hoy.year + 1, 1)
    prefijo_prox = f'{anho_prox}-{mes_prox:02d}'
    proximo_mes = [
        f for f in fichas
        if f['estado_ejecucion'] != 'EJECUTADO' and (f['fecha_mas_proxima'] or '').startswith(prefijo_prox)
    ]
    atrasadas = [f for f in fichas if f['estado_ejecucion'] == 'ATRASADO']
    total_fichas = len(fichas)
    ejecutados_fichas = sum(1 for f in fichas if f['estado_ejecucion'] == 'EJECUTADO')
    monto_total_fichas = sum(f['monto_total'] or 0 for f in fichas)

    subdirecciones = _combinar_subdirecciones(jerarquia_fsc, jerarquia_planer, fichas)
    avance_trimestral = _avance_trimestral(periodo, temporalidad_mensual, temporal_mensual_planer)

    return {
        'periodo': periodo, 'label': label, 'anho': anho, 'anho_anterior': anho - 1, 'hoy': hoy,
        'dentro_fuera': dentro_fuera, 'comparativa_periodos': comparativa_periodos,
        'temporal': temporal, 'jerarquia_fsc': jerarquia_fsc,
        'rankings_depto': rankings_depto, 'rankings_formulario': rankings_formulario,
        'resumen_subdireccion': resumen_subdireccion, 'temporalidad_mensual': temporalidad_mensual,
        'fichas': fichas, 'jerarquia_planer': jerarquia_planer,
        'temporal_mensual_planer': temporal_mensual_planer,
        'proximo_mes': proximo_mes, 'atrasadas': atrasadas,
        'total_fichas': total_fichas, 'ejecutados_fichas': ejecutados_fichas,
        'pct_ejecutado_fichas': round(ejecutados_fichas / total_fichas * 100, 1) if total_fichas else 0,
        'monto_total_fichas': monto_total_fichas,
        'subdirecciones': subdirecciones,
        'avance_trimestral': avance_trimestral,
    }


def _avance_trimestral(periodo, temporalidad_mensual, temporal_mensual_planer):
    """Si `periodo` es un trimestre ('YYYY-QN'), arma el avance MES A MES de los 3
    meses que lo componen (Dentro/Fuera PAC + Ejecución del Plan de Compras) — pedido
    explícito del usuario 2026-07-22 ("cuando seleccione trimestral, mostrar avance
    trimestral, para ver su mejora y cómo vamos cumpliendo"). Reutiliza las series de
    12 meses que YA calcula `_datos_informe_completo` (`calcular_pac_temporalidad_mensual`/
    `calcular_pac_temporal_mensual_planer`), solo filtrando a los 3 meses del trimestre
    — no agrega ninguna consulta nueva a la BD. Se aplica a cualquier trimestre (Q1-Q4),
    no solo a Q2/Q3 (los ejemplos que dio el usuario) — no hay razón para mostrar la
    evolución interna solo en algunos trimestres y no en otros. Retorna `None` si
    `periodo` es mensual (un solo mes no tiene "avance interno" que mostrar)."""
    periodo = periodo.upper()
    if 'Q' not in periodo:
        return None
    _, q_str = periodo.split('-Q')
    trimestre = int(q_str)
    mes_ini = (trimestre - 1) * 3 + 1
    meses_trimestre = {mes_ini, mes_ini + 1, mes_ini + 2}

    meses_fsc = [m for m in temporalidad_mensual['meses'] if m['mes'] in meses_trimestre]
    meses_planer = [m for m in temporal_mensual_planer['meses'] if m['mes'] in meses_trimestre]

    pct_dentro_validos = [m['pct_dentro'] for m in meses_fsc if m['pct_dentro'] is not None and m['total']]
    variacion_pct_dentro = round(pct_dentro_validos[-1] - pct_dentro_validos[0], 1) if len(pct_dentro_validos) >= 2 else None

    pct_ejecutado_validos = [m['pct_ejecutado'] for m in meses_planer if m['total']]
    variacion_pct_ejecutado = round(pct_ejecutado_validos[-1] - pct_ejecutado_validos[0], 1) if len(pct_ejecutado_validos) >= 2 else None

    return {
        'trimestre': trimestre, 'meses_fsc': meses_fsc, 'meses_planer': meses_planer,
        'variacion_pct_dentro': variacion_pct_dentro, 'variacion_pct_ejecutado': variacion_pct_ejecutado,
    }


def _combinar_subdirecciones(jerarquia_fsc, jerarquia_planer, fichas):
    """Combina el árbol de Jerarquía FSC (Dentro/Fuera + cumplimiento temporal) con
    el árbol de Ejecución PAC (Fichas) por NOMBRE de subdirección, para que el
    informe tenga UN capítulo por subdirección con ambas vistas — decisión del
    usuario 2026-07-21 ('un solo reporte unificado, capítulos por subdirección').
    Las 2 fuentes son deliberadamente independientes en el resto del sistema (ver
    docstrings de `calcular_pac_jerarquia`/`calcular_pac_jerarquia_planer`) — acá
    solo se juntan para efectos de presentación del informe, no se cruzan datos."""
    fsc_por_nombre = {s['nombre']: s for s in jerarquia_fsc['subdirecciones']}
    planer_por_nombre = {s['nombre']: s for s in jerarquia_planer['subdirecciones']}
    nombres = list(dict.fromkeys(list(fsc_por_nombre.keys()) + list(planer_por_nombre.keys())))

    responsables_por_sub = {}
    for f in fichas:
        if f['nombre_responsable'] and f['subdireccion_nombre']:
            responsables_por_sub.setdefault(f['subdireccion_nombre'], set()).add(f['nombre_responsable'])

    combinado = [{
        'nombre': nombre,
        'fsc': fsc_por_nombre.get(nombre),
        'planer': planer_por_nombre.get(nombre),
        'responsables': sorted(responsables_por_sub.get(nombre, [])),
        'institucional': nombre in NOMBRES_SUBDIRECCIONES_INSTITUCIONALES,
    } for nombre in nombres]

    combinado.sort(key=lambda s: (s['nombre'] == 'Sin Clasificar', not s['institucional'], s['nombre']))
    return combinado


# =============================================================================
# Word — helpers institucionales (portada, índice, pie de página, márgenes)
# =============================================================================

def _configurar_margenes_docx(doc):
    for section in doc.sections:
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.3)
        section.left_margin = Cm(2.8)
        section.right_margin = Cm(2.2)


def _agregar_campo_docx(paragraph, instruccion):
    """Inserta un campo de Word de bajo nivel (PAGE, NUMPAGES, TOC) vía XML — la API
    de alto nivel de python-docx no soporta campos, solo texto/estilo."""
    run = paragraph.add_run()
    r = run._r
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = instruccion
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    r.append(fld_begin)
    r.append(instr)
    r.append(fld_end)


def _forzar_actualizacion_campos_docx(doc):
    """Sin esto, Word muestra el índice y los números de página con el texto
    placeholder hasta que el usuario actualiza los campos manualmente (F9). Con
    `w:updateFields`, Word los recalcula automáticamente al abrir el documento."""
    settings = doc.settings.element
    campo = OxmlElement('w:updateFields')
    campo.set(qn('w:val'), 'true')
    settings.append(campo)


def _agregar_pie_pagina_docx(doc):
    section = doc.sections[0]
    footer = section.footer
    footer.is_linked_to_previous = True
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    color_pie = RGBColor(0x94, 0xa3, 0xb8)

    run1 = p.add_run(f'{NOMBRE_INSTITUCION} · Informe de Seguimiento y Ejecución del Plan Anual de Compras · Página ')
    run1.font.size = Pt(8)
    run1.font.color.rgb = color_pie
    _agregar_campo_docx(p, 'PAGE')
    run2 = p.add_run(' de ')
    run2.font.size = Pt(8)
    run2.font.color.rgb = color_pie
    _agregar_campo_docx(p, 'NUMPAGES')


def _agregar_portada_docx(doc, periodo_label, anho, hoy):
    logo = _logo_bytes()
    if logo:
        p_logo = doc.add_paragraph()
        p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_logo.add_run().add_picture(logo, width=Inches(1.5))

    doc.add_paragraph()
    titulo = doc.add_paragraph()
    titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_t = titulo.add_run(TITULO_INFORME)
    run_t.font.size = Pt(24)
    run_t.font.bold = True
    run_t.font.color.rgb = RGBColor(0x1e, 0x3a, 0x5f)

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_s = sub.add_run(NOMBRE_INSTITUCION.upper())
    run_s.font.size = Pt(15)
    run_s.font.bold = True
    run_s.font.color.rgb = RGBColor(0x38, 0xb2, 0xbd)

    edificio = _edificio_bytes()
    if edificio:
        doc.add_paragraph()
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img.add_run().add_picture(edificio, width=Inches(5.6))

    doc.add_paragraph()
    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_m = meta.add_run(
        f'Período de análisis: {periodo_label}\n'
        f'Año PAC (Plan Anual de Compras): {anho}\n'
        f'Generado el {hoy.strftime("%d-%m-%Y")}'
    )
    run_m.font.size = Pt(11.5)
    run_m.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    doc.add_page_break()


def _agregar_indice_docx(doc):
    h = doc.add_heading('Índice', level=1)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x1e, 0x3a, 0x5f)
    p_ayuda = doc.add_paragraph()
    run_ayuda = p_ayuda.add_run(
        '(el índice se actualiza automáticamente al abrir el documento; si no se '
        've, haga clic derecho sobre él y seleccione "Actualizar campos")'
    )
    run_ayuda.font.size = Pt(9)
    run_ayuda.italic = True
    run_ayuda.font.color.rgb = RGBColor(0x94, 0xa3, 0xb8)
    p_toc = doc.add_paragraph()
    _agregar_campo_docx(p_toc, 'TOC \\o "1-2" \\h \\z \\u')
    doc.add_page_break()


def _titulo_capitulo_docx(doc, texto):
    h = doc.add_heading(texto, level=1)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x1e, 0x3a, 0x5f)
    return h


def _titulo_seccion_docx(doc, texto):
    h = doc.add_heading(texto, level=2)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x38, 0x6f, 0xc9)
    return h


# =============================================================================
# Word — tablas
# =============================================================================

def _tabla_departamentos(doc, departamentos):
    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    encabezados = ['Departamento', 'Total', '% Dentro PAC', '% En fecha', 'Monto Dentro PAC']
    for i, h in enumerate(encabezados):
        tabla.rows[0].cells[i].text = h
    for d in departamentos:
        fila = tabla.add_row().cells
        fila[0].text = _truncar(d['nombre'].title(), 55)
        fila[1].text = str(d['total'])
        fila[2].text = f"{d['pct_dentro']}%"
        fila[3].text = f"{d['pct_en_fecha']}%" if d['pct_en_fecha'] is not None else '—'
        fila[4].text = _money(d['monto_dentro'])


def _tabla_deptos_ejecucion(doc, departamentos):
    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    for i, h in enumerate(['Departamento', 'Total Fichas', 'Ejecutado', 'Pendiente', 'Atrasado']):
        tabla.rows[0].cells[i].text = h
    for dpt in departamentos:
        fila = tabla.add_row().cells
        fila[0].text = _truncar(dpt['nombre'].title(), 55)
        fila[1].text = str(dpt['total'])
        fila[2].text = str(dpt['ejecutados'])
        fila[3].text = str(dpt['pendientes'])
        fila[4].text = str(dpt['atrasados'])


def _tabla_ranking_depto(doc, filas):
    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    for i, h in enumerate(['Departamento', 'Subdirección', 'Total', 'Score', '% Dentro PAC']):
        tabla.rows[0].cells[i].text = h
    for f in filas:
        fila = tabla.add_row().cells
        fila[0].text = _truncar(f['nombre'].title(), 45)
        fila[1].text = _truncar(_nombre_subdireccion_display(f['subdireccion']), 35)
        fila[2].text = str(f['total'])
        fila[3].text = f"{f['score']:.0f}"
        fila[4].text = f"{f['pct_dentro']}%"


def _tabla_ranking_formulario(doc, filas):
    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    for i, h in enumerate(['Folio/Año', 'Unidad Requirente', 'Dentro/Fuera', 'Monto', 'Score']):
        tabla.rows[0].cells[i].text = h
    for f in filas:
        fila = tabla.add_row().cells
        fila[0].text = f"{f['folio']}/{f['anho']}"
        fila[1].text = _truncar(f['unidad_requirente'], 45)
        fila[2].text = 'Dentro' if f['dentro_fuera_pac'] == 'DENTRO' else 'Fuera'
        fila[3].text = _money(f['monto_estimado'])
        fila[4].text = f"{f['score']:.0f}"


def _tabla_resumen_subdireccion(doc, filas, anho, anho_anterior):
    tabla = doc.add_table(rows=1, cols=6)
    tabla.style = 'Light Grid Accent 1'
    for i, h in enumerate(['Subdirección', 'Dentro', 'Fuera', f'% Dentro {anho}', f'% Dentro {anho_anterior}', 'Variación']):
        tabla.rows[0].cells[i].text = h
    for f in filas:
        fila = tabla.add_row().cells
        fila[0].text = _truncar(_nombre_subdireccion_display(f['nombre']), 45)
        fila[1].text = str(f['dentro'])
        fila[2].text = str(f['fuera'])
        fila[3].text = f"{f['pct_dentro']}%"
        fila[4].text = f"{f['pct_dentro_anho_anterior']}%" if f['pct_dentro_anho_anterior'] is not None else '—'
        fila[5].text = f"{f['variacion_pp']:+.1f} pp" if f['variacion_pp'] is not None else '—'


def _tabla_fichas_pac_docx(doc, filas, limite=40):
    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    for i, h in enumerate(['ID Proyecto', 'Departamento', 'Responsable', 'Fecha Compra', 'Estado']):
        tabla.rows[0].cells[i].text = h
    for f in filas[:limite]:
        fila = tabla.add_row().cells
        fila[0].text = f['id_proyecto']
        fila[1].text = _truncar(f['depto_nombre'] or f['depto_texto'], 45)
        fila[2].text = _truncar(f['nombre_responsable'], 30)
        fila[3].text = f['fecha_mas_proxima'] or '—'
        fila[4].text = f['estado_ejecucion']
    if len(filas) > limite:
        p = doc.add_paragraph()
        run = p.add_run(f'… y {len(filas) - limite} ficha(s) adicional(es) — ver detalle completo en el dashboard interactivo.')
        run.italic = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x94, 0xa3, 0xb8)


_PARRAFOS_METODOLOGIA = [
    'El presente informe integra dos fuentes de datos complementarias pero '
    'independientes entre sí, cada una respondiendo una pregunta distinta sobre '
    'la gestión del Plan Anual de Compras (PAC):',
    '(1) Cumplimiento Dentro/Fuera del PAC y Cumplimiento Temporal: se determina '
    'a nivel de cada Formulario de Solicitud de Compra (FSC) derivado a comprador, '
    'verificando si el proyecto que declara (ID de Plan) existe en el maestro '
    'histórico del Plan Anual de Compras. El cumplimiento temporal compara la '
    'fecha en que el formulario fue derivado contra la fecha de compra '
    'planificada para ese proyecto, con una tolerancia de un mes calendario.',
    '(2) Ejecución del Plan de Compras (Ficha PAC): se determina a nivel de cada '
    'ficha/proyecto del Plan Anual de Compras. Una ficha se considera "Ejecutada" '
    'cuando cuenta con al menos un formulario de compra u orden de compra '
    'enlazada; "Pendiente" cuando su fecha de compra planificada aún no vence; y '
    '"Atrasada" cuando la fecha ya venció sin formulario ni orden de compra '
    'asociada.',
    'Por tratarse de universos y momentos de corte distintos, las cifras de '
    'ambas fuentes no son directamente sumables entre sí — se presentan en '
    'secciones separadas dentro de cada capítulo de subdirección para mantener '
    'la trazabilidad de cada una.',
]


def _tabla_avance_trimestral_docx(doc, avance):
    """Tabla mes a mes del trimestre — % Dentro PAC y % Ejecutado del Plan de Compras,
    para visualizar la mejora dentro del propio trimestre (pedido 2026-07-22)."""
    meses_fsc_por_mes = {m['mes']: m for m in avance['meses_fsc']}
    meses_planer_por_mes = {m['mes']: m for m in avance['meses_planer']}
    meses_ids = sorted(set(meses_fsc_por_mes) | set(meses_planer_por_mes))

    tabla = doc.add_table(rows=1, cols=5)
    tabla.style = 'Light Grid Accent 1'
    for i, h in enumerate(['Mes', 'Formularios', '% Dentro PAC', 'Fichas Plan Compras', '% Ejecutado']):
        tabla.rows[0].cells[i].text = h
    for mes_id in meses_ids:
        mf, mp = meses_fsc_por_mes.get(mes_id), meses_planer_por_mes.get(mes_id)
        fila = tabla.add_row().cells
        fila[0].text = (mf or mp)['nombre_mes']
        fila[1].text = str(mf['total']) if mf else '—'
        fila[2].text = f"{mf['pct_dentro']}%" if mf and mf['total'] else '—'
        fila[3].text = str(mp['total']) if mp else '—'
        fila[4].text = f"{mp['pct_ejecutado']}%" if mp and mp['total'] else '—'


def _mejor_peor_de_ranking(rankings_depto, nombre_sub):
    mejor = next((f for f in rankings_depto['mejores'] if f['subdireccion'] == nombre_sub), None)
    peor = next((f for f in rankings_depto['peores'] if f['subdireccion'] == nombre_sub), None)
    return mejor, peor


def generar_informe_word(periodo):
    """Genera el informe Word institucional único y exhaustivo del período
    ('YYYY-MM' o 'YYYY-QN'). Retorna BytesIO. Estructura: Portada → Índice →
    Resumen Ejecutivo Institucional → Metodología → capítulos por subdirección
    (Formularios Dentro/Fuera PAC + Ejecución del Plan de Compras combinados) →
    Rankings Institucionales (departamentos y formularios) → Alertas y
    Seguimiento → Conclusiones → Anexo (otras unidades de la red)."""
    d = _datos_informe_completo(periodo)
    label, anho, anho_ant, hoy = d['label'], d['anho'], d['anho_anterior'], d['hoy']

    doc = Document()
    _configurar_margenes_docx(doc)

    # --- Portada + Índice ---------------------------------------------------
    _agregar_portada_docx(doc, label, anho, hoy)
    _agregar_indice_docx(doc)

    # --- Resumen Ejecutivo Institucional -------------------------------------
    _titulo_capitulo_docx(doc, 'Resumen Ejecutivo Institucional')
    doc.add_paragraph(parrafo_resumen_ejecutivo(label, d['dentro_fuera']['kpis'], d['comparativa_periodos']))
    doc.add_paragraph(parrafo_cumplimiento_temporal(label, d['temporal']['kpis']))
    doc.add_paragraph(
        f'En paralelo, el Plan Anual de Compras {anho} registra {_n(d["total_fichas"])} fichas/proyectos, '
        f'de las cuales {_n(d["ejecutados_fichas"])} ({d["pct_ejecutado_fichas"]}%) cuentan con formulario '
        f'de compra u orden de compra enlazada, por un monto total planificado de {_money(d["monto_total_fichas"])}.'
    )

    img = grafico_donut_dentro_fuera(d['dentro_fuera']['kpis']['pct_dentro'])
    if img:
        doc.add_picture(img, width=Inches(2.8))
        cap = doc.add_paragraph()
        run = cap.add_run('Gráfico 1 — Distribución de formularios Dentro/Fuera del PAC en el período.')
        run.italic = True
        run.font.size = Pt(9)

    img = grafico_barras_comparativa_anual(d['dentro_fuera']['comparativa_anual'])
    if img:
        doc.add_picture(img, width=Inches(5.6))
        cap = doc.add_paragraph()
        run = cap.add_run('Gráfico 2 — Comparativa histórica anual de formularios Dentro/Fuera del PAC.')
        run.italic = True
        run.font.size = Pt(9)

    img = grafico_evolucion_mensual_dentro_fuera(d['temporalidad_mensual']['meses'], anho, anho_ant)
    if img:
        doc.add_picture(img, width=Inches(5.8))
        cap = doc.add_paragraph()
        run = cap.add_run(
            f'Gráfico 3 — Evolución mensual {anho} (barras) comparada contra el % Dentro del PAC de {anho_ant} '
            '(línea punteada), para visualizar la tendencia mes a mes respecto al año anterior.'
        )
        run.italic = True
        run.font.size = Pt(9)

    if d['avance_trimestral']:
        av = d['avance_trimestral']
        _titulo_seccion_docx(doc, f'Avance Trimestral — {label}')
        doc.add_paragraph(
            f'Detalle mes a mes de los 3 meses que componen el {label}, para visualizar la mejora o '
            'retroceso dentro del propio trimestre — complementario a la comparación anual del Gráfico 3.'
        )
        img = grafico_evolucion_mensual_dentro_fuera(av['meses_fsc'], anho, anho_ant, titulo=f'Avance mensual — {label}')
        if img:
            doc.add_picture(img, width=Inches(5.6))
            cap = doc.add_paragraph()
            texto_var = (
                f'variación de {av["variacion_pct_dentro"]:+.1f} p.p. entre el primer y el último mes del trimestre'
                if av['variacion_pct_dentro'] is not None else 'sin datos suficientes para calcular variación interna'
            )
            run = cap.add_run(f'Gráfico 3b — % Dentro PAC mes a mes dentro del {label} ({texto_var}).')
            run.italic = True
            run.font.size = Pt(9)
        img = grafico_barras_ejecucion_mensual_planer(av['meses_planer'], titulo=f'Ejecución Plan de Compras — {label}')
        if img:
            doc.add_picture(img, width=Inches(5.6))
            cap = doc.add_paragraph()
            texto_var = (
                f'variación de {av["variacion_pct_ejecutado"]:+.1f} p.p. entre el primer y el último mes'
                if av['variacion_pct_ejecutado'] is not None else 'sin datos suficientes para calcular variación interna'
            )
            run = cap.add_run(f'Gráfico 3c — % Ejecutado del Plan de Compras mes a mes dentro del {label} ({texto_var}).')
            run.italic = True
            run.font.size = Pt(9)
        _tabla_avance_trimestral_docx(doc, av)

    doc.add_page_break()

    _titulo_seccion_docx(doc, 'Cumplimiento Dentro/Fuera del PAC por Subdirección')
    doc.add_paragraph(
        'La siguiente tabla desglosa, por subdirección, el número de formularios Dentro y Fuera del PAC '
        f'del año {anho} comparado contra el mismo corte de {anho_ant}, para dimensionar la evolución del '
        'apego institucional al Plan Anual de Compras.'
    )
    if d['resumen_subdireccion']['subdirecciones']:
        _tabla_resumen_subdireccion(doc, d['resumen_subdireccion']['subdirecciones'], anho, anho_ant)
    img = grafico_donut_cumplimiento_temporal(d['temporal']['kpis'])
    if img:
        doc.add_picture(img, width=Inches(3.4))
        cap = doc.add_paragraph()
        run = cap.add_run('Gráfico 4 — Cumplimiento temporal: formularios Dentro del PAC evaluados contra su fecha planificada.')
        run.italic = True
        run.font.size = Pt(9)

    img = grafico_barras_ejecucion_mensual_planer(d['temporal_mensual_planer']['meses'])
    if img:
        doc.add_picture(img, width=Inches(5.8))
        cap = doc.add_paragraph()
        run = cap.add_run(f'Gráfico 5 — Ejecución mensual del Plan de Compras {anho} (fichas Ejecutadas/Pendientes/Atrasadas).')
        run.italic = True
        run.font.size = Pt(9)
    doc.add_page_break()

    # --- Metodología ----------------------------------------------------------
    _titulo_capitulo_docx(doc, 'Metodología')
    for parrafo in _PARRAFOS_METODOLOGIA:
        doc.add_paragraph(parrafo)
    doc.add_page_break()

    # --- Capítulos por Subdirección --------------------------------------------
    subs_institucionales = [s for s in d['subdirecciones'] if s['institucional']]
    otras_ramas = [s for s in d['subdirecciones'] if not s['institucional']]

    for sub in subs_institucionales:
        _titulo_capitulo_docx(doc, _nombre_subdireccion_display(sub['nombre']))

        _titulo_seccion_docx(doc, f'Formularios de Solicitud de Compra — Período {label}')
        if sub['fsc'] and sub['fsc']['total']:
            mejor_rk, peor_rk = _mejor_peor_de_ranking(d['rankings_depto'], sub['nombre'])
            doc.add_paragraph(parrafo_capitulo_subdireccion(sub['nombre'], sub['fsc'], mejor_rk, peor_rk))
            if sub['fsc']['departamentos']:
                _tabla_departamentos(doc, sub['fsc']['departamentos'])
        else:
            doc.add_paragraph('Sin formularios registrados en el período para esta subdirección.')

        _titulo_seccion_docx(doc, f'Ejecución del Plan de Compras — Año PAC {anho}')
        if sub['planer'] and sub['planer']['total']:
            p = sub['planer']
            doc.add_paragraph(
                f"{_n(p['total'])} fichas del Plan de Compras — {p['pct_ejecutado']}% ejecutadas "
                f"({_n(p['ejecutados'])} ejecutadas, {_n(p['pendientes'])} pendientes, {_n(p['atrasados'])} atrasadas). "
                f"Monto total planificado: {_money(p['monto_total'])}."
            )
            if p['departamentos']:
                _tabla_deptos_ejecucion(doc, p['departamentos'])
            if sub['responsables']:
                p_resp = doc.add_paragraph()
                run = p_resp.add_run('Responsables: ' + ', '.join(sub['responsables']))
                run.font.size = Pt(9.5)
                run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
        else:
            doc.add_paragraph('Sin fichas del Plan de Compras registradas para esta subdirección.')
        doc.add_page_break()

    # --- Rankings Institucionales -----------------------------------------------
    _titulo_capitulo_docx(doc, 'Rankings Institucionales')
    doc.add_paragraph(
        'El score compuesto de cada ranking pondera 40% el % Dentro del PAC, 40% el % de cumplimiento '
        'temporal (fecha de derivación vs. fecha planificada) y 20% el % Dentro del PAC ponderado por monto '
        '— evitando que el resultado dependa solo del tamaño del presupuesto gestionado.'
    )
    _titulo_seccion_docx(doc, 'Mejores departamentos')
    if d['rankings_depto']['mejores']:
        _tabla_ranking_depto(doc, d['rankings_depto']['mejores'])
    else:
        doc.add_paragraph('Sin datos suficientes para generar el ranking en este período.')
    _titulo_seccion_docx(doc, 'Departamentos con mayor oportunidad de mejora')
    if d['rankings_depto']['peores']:
        _tabla_ranking_depto(doc, d['rankings_depto']['peores'])
    else:
        doc.add_paragraph('Sin datos suficientes para generar el ranking en este período.')

    _titulo_seccion_docx(doc, 'Mejores formularios')
    if d['rankings_formulario']['mejores']:
        _tabla_ranking_formulario(doc, d['rankings_formulario']['mejores'])
    else:
        doc.add_paragraph('Sin datos suficientes para generar el ranking en este período.')
    _titulo_seccion_docx(doc, 'Formularios con mayor oportunidad de mejora')
    if d['rankings_formulario']['peores']:
        _tabla_ranking_formulario(doc, d['rankings_formulario']['peores'])
    else:
        doc.add_paragraph('Sin datos suficientes para generar el ranking en este período.')
    doc.add_page_break()

    # --- Alertas y Seguimiento ----------------------------------------------
    _titulo_capitulo_docx(doc, 'Alertas y Seguimiento')
    _titulo_seccion_docx(doc, 'Proyectos planificados sin ningún formulario Dentro PAC derivado todavía')
    if d['temporal']['proyectos_sin_iniciar']:
        tabla = doc.add_table(rows=1, cols=3)
        tabla.style = 'Light Grid Accent 1'
        for i, h in enumerate(['ID Proyecto', 'Fecha Planificada', 'Estado']):
            tabla.rows[0].cells[i].text = h
        for p in d['temporal']['proyectos_sin_iniciar'][:30]:
            fila = tabla.add_row().cells
            fila[0].text = p['id_proyecto']
            fila[1].text = p['fecha_inicio_compra']
            fila[2].text = 'Pendiente' if p['estado'] == 'PENDIENTE' else 'Atrasado'
    else:
        doc.add_paragraph('No hay proyectos planificados sin iniciar en el período.')

    _titulo_seccion_docx(doc, f'Fichas a ejecutar el próximo mes (Año PAC {anho})')
    if d['proximo_mes']:
        doc.add_paragraph(f'{_n(len(d["proximo_mes"]))} ficha(s) planificada(s) para el próximo mes, aún sin ejecutar.')
        _tabla_fichas_pac_docx(doc, d['proximo_mes'])
    else:
        doc.add_paragraph('No hay fichas planificadas para el próximo mes.')

    _titulo_seccion_docx(doc, f'Fichas atrasadas (Año PAC {anho})')
    if d['atrasadas']:
        doc.add_paragraph(f'{_n(len(d["atrasadas"]))} ficha(s) con fecha de compra vencida y sin formulario ni OC enlazada.')
        _tabla_fichas_pac_docx(doc, d['atrasadas'])
    else:
        doc.add_paragraph('No hay fichas atrasadas en el período.')
    doc.add_page_break()

    # --- Conclusiones y Recomendaciones ---------------------------------------
    _titulo_capitulo_docx(doc, 'Conclusiones y Recomendaciones')
    doc.add_paragraph(parrafo_conclusiones(label, d['dentro_fuera']['kpis'], d['temporal']['kpis']))
    doc.add_paragraph(
        f'En cuanto a la ejecución del Plan de Compras {anho}, {d["pct_ejecutado_fichas"]}% de las fichas '
        f'planificadas cuentan hoy con formulario u orden de compra enlazada. '
        + ('Se recomienda priorizar la revisión de las fichas atrasadas listadas en la sección de Alertas '
           'y coordinar con los responsables de cada subdirección la regularización de los proyectos pendientes.'
           if d['pct_ejecutado_fichas'] < 70 else
           'El nivel de ejecución es satisfactorio; se recomienda mantener el seguimiento mensual para '
           'sostener la tendencia.')
    )
    doc.add_page_break()

    # --- Anexo: otras unidades de la red ---------------------------------------
    _titulo_capitulo_docx(doc, 'Anexo — Otras Unidades de la Red')
    doc.add_paragraph(
        'Detalle abreviado de las restantes unidades de la red asistencial (fuera de la Dirección Servicio '
        'de Salud Osorno) y de los formularios que no pudieron clasificarse organizacionalmente.'
    )
    if otras_ramas:
        for sub in otras_ramas:
            _titulo_seccion_docx(doc, _nombre_subdireccion_display(sub['nombre']))
            if sub['fsc'] and sub['fsc']['departamentos']:
                _tabla_departamentos(doc, sub['fsc']['departamentos'])
            if sub['planer'] and sub['planer']['departamentos']:
                doc.add_paragraph('Ejecución del Plan de Compras:')
                _tabla_deptos_ejecucion(doc, sub['planer']['departamentos'])
    else:
        doc.add_paragraph('Sin registros de otras unidades de la red en este período.')

    _agregar_pie_pagina_docx(doc)
    _forzar_actualizacion_campos_docx(doc)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


# =============================================================================
# PDF — reportlab (Platypus). Índice con numeración de página real vía
# `BaseDocTemplate.multiBuild()` (2 pasadas: la 1ª resuelve en qué página cae
# cada capítulo, la 2ª ya puede imprimir el índice con esos números).
# =============================================================================

_PDF_ESTILOS = getSampleStyleSheet()
_PDF_ESTILOS.add(ParagraphStyle(
    name='TituloPortada', fontSize=22, leading=28, alignment=1, spaceAfter=10,
    textColor=colors.HexColor(COLOR_INSTITUCIONAL), fontName='Helvetica-Bold',
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='SubportadaFuerte', fontSize=14, leading=18, alignment=1, spaceAfter=6,
    textColor=colors.HexColor(COLOR_INSTITUCIONAL_CLARO), fontName='Helvetica-Bold',
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='Subportada', fontSize=11.5, leading=17, alignment=1, textColor=colors.HexColor('#475569'),
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='TituloCapitulo', fontSize=16, leading=20, spaceBefore=6, spaceAfter=10,
    textColor=colors.HexColor(COLOR_INSTITUCIONAL), fontName='Helvetica-Bold',
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='TituloSeccion', fontSize=12.5, leading=16, spaceBefore=8, spaceAfter=8,
    textColor=colors.HexColor('#386fc9'), fontName='Helvetica-Bold',
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='Cuerpo', fontSize=10, leading=14.5, spaceAfter=9, textColor=colors.HexColor('#374151'),
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='Leyenda', fontSize=8, leading=11, spaceAfter=10, textColor=colors.HexColor('#94a3b8'), fontName='Helvetica-Oblique',
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='Celda', fontSize=8, leading=10, textColor=colors.HexColor('#334155'),
))
_PDF_ESTILOS.add(ParagraphStyle(
    name='CeldaEncabezado', fontSize=8, leading=10, textColor=colors.HexColor('#334155'), fontName='Helvetica-Bold',
))

_PDF_TABLA_ESTILO = TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
])


def _celda(texto):
    """Envuelve el texto en un Paragraph para que reportlab lo ajuste (word-wrap)
    dentro del ancho de columna en vez de desbordarlo — pedido explícito del
    usuario ('ojo con las tablas que no se desborde el texto')."""
    return Paragraph(str(texto if texto not in (None, '') else '—'), _PDF_ESTILOS['Celda'])


def _celda_encabezado(texto):
    return Paragraph(str(texto), _PDF_ESTILOS['CeldaEncabezado'])


def _fila_encabezado(encabezados):
    return [_celda_encabezado(h) for h in encabezados]


def _pdf_imagen(img_bytes, width_in, height_in):
    if not img_bytes:
        return None
    img = RLImage(img_bytes, width=width_in * inch, height=height_in * inch)
    img.hAlign = 'CENTER'
    return img


def _pdf_tabla_departamentos(departamentos, limite=20):
    filas = [_fila_encabezado(['Departamento', 'Total', '% Dentro', '% En fecha', 'Monto Dentro PAC'])]
    for d in departamentos[:limite]:
        filas.append([
            _celda(d['nombre'].title()), str(d['total']), f"{d['pct_dentro']}%",
            f"{d['pct_en_fecha']}%" if d['pct_en_fecha'] is not None else '—', _money(d['monto_dentro']),
        ])
    tabla = Table(filas, colWidths=[2.3 * inch, 0.55 * inch, 0.75 * inch, 0.75 * inch, 1.35 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_deptos_ejecucion(departamentos, limite=20):
    filas = [_fila_encabezado(['Departamento', 'Total Fichas', 'Ejecutado', 'Pendiente', 'Atrasado'])]
    for dpt in departamentos[:limite]:
        filas.append([_celda(dpt['nombre'].title()), str(dpt['total']), str(dpt['ejecutados']), str(dpt['pendientes']), str(dpt['atrasados'])])
    tabla = Table(filas, colWidths=[2.7 * inch, 0.7 * inch, 0.75 * inch, 0.75 * inch, 0.75 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_ranking_depto(filas_ranking, limite=15):
    filas = [_fila_encabezado(['Departamento', 'Subdirección', 'Total', 'Score', '% Dentro'])]
    for f in filas_ranking[:limite]:
        filas.append([_celda(f['nombre'].title()), _celda(_nombre_subdireccion_display(f['subdireccion'])), str(f['total']), f"{f['score']:.0f}", f"{f['pct_dentro']}%"])
    tabla = Table(filas, colWidths=[2 * inch, 2 * inch, 0.6 * inch, 0.6 * inch, 0.7 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_ranking_formulario(filas_ranking, limite=15):
    filas = [_fila_encabezado(['Folio/Año', 'Unidad Requirente', 'Dentro/Fuera', 'Monto', 'Score'])]
    for f in filas_ranking[:limite]:
        filas.append([
            f"{f['folio']}/{f['anho']}", _celda(f['unidad_requirente']),
            'Dentro' if f['dentro_fuera_pac'] == 'DENTRO' else 'Fuera', _money(f['monto_estimado']), f"{f['score']:.0f}",
        ])
    tabla = Table(filas, colWidths=[0.8 * inch, 2.6 * inch, 0.85 * inch, 1 * inch, 0.55 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_resumen_subdireccion(filas, anho, anho_anterior, limite=15):
    encabezado = ['Subdirección', 'Dentro', 'Fuera', f'% Dentro {anho}', f'% Dentro {anho_anterior}', 'Variación']
    tabla_filas = [_fila_encabezado(encabezado)]
    for f in filas[:limite]:
        tabla_filas.append([
            _celda(_nombre_subdireccion_display(f['nombre'])), str(f['dentro']), str(f['fuera']), f"{f['pct_dentro']}%",
            f"{f['pct_dentro_anho_anterior']}%" if f['pct_dentro_anho_anterior'] is not None else '—',
            f"{f['variacion_pp']:+.1f} pp" if f['variacion_pp'] is not None else '—',
        ])
    tabla = Table(tabla_filas, colWidths=[2.2 * inch, 0.6 * inch, 0.6 * inch, 0.9 * inch, 0.9 * inch, 0.8 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_fichas_pac(filas, limite=25):
    encabezado = ['ID Proyecto', 'Departamento', 'Responsable', 'Fecha Compra', 'Estado']
    tabla_filas = [_fila_encabezado(encabezado)]
    for f in filas[:limite]:
        tabla_filas.append([
            f['id_proyecto'], _celda(f['depto_nombre'] or f['depto_texto']),
            _celda(f['nombre_responsable']), f['fecha_mas_proxima'] or '—', f['estado_ejecucion'],
        ])
    tabla = Table(tabla_filas, colWidths=[1 * inch, 1.9 * inch, 1.4 * inch, 0.85 * inch, 0.75 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_avance_trimestral(avance):
    """Tabla mes a mes del trimestre — misma lógica que `_tabla_avance_trimestral_docx`
    (Word), en formato reportlab con celdas `Paragraph` (sin desborde de texto)."""
    meses_fsc_por_mes = {m['mes']: m for m in avance['meses_fsc']}
    meses_planer_por_mes = {m['mes']: m for m in avance['meses_planer']}
    meses_ids = sorted(set(meses_fsc_por_mes) | set(meses_planer_por_mes))

    tabla_filas = [_fila_encabezado(['Mes', 'Formularios', '% Dentro PAC', 'Fichas Plan Compras', '% Ejecutado'])]
    for mes_id in meses_ids:
        mf, mp = meses_fsc_por_mes.get(mes_id), meses_planer_por_mes.get(mes_id)
        tabla_filas.append([
            (mf or mp)['nombre_mes'],
            str(mf['total']) if mf else '—',
            f"{mf['pct_dentro']}%" if mf and mf['total'] else '—',
            str(mp['total']) if mp else '—',
            f"{mp['pct_ejecutado']}%" if mp and mp['total'] else '—',
        ])
    tabla = Table(tabla_filas, colWidths=[1 * inch, 1.1 * inch, 1.1 * inch, 1.3 * inch, 1.1 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


def _pdf_tabla_proyectos_sin_iniciar(proyectos, limite=30):
    tabla_filas = [_fila_encabezado(['ID Proyecto', 'Fecha Planificada', 'Estado'])]
    for p in proyectos[:limite]:
        tabla_filas.append([p['id_proyecto'], p['fecha_inicio_compra'], 'Pendiente' if p['estado'] == 'PENDIENTE' else 'Atrasado'])
    tabla = Table(tabla_filas, colWidths=[2.2 * inch, 1.5 * inch, 1.2 * inch], repeatRows=1)
    tabla.setStyle(_PDF_TABLA_ESTILO)
    return tabla


class _InformeDocTemplate(BaseDocTemplate):
    """DocTemplate con pie de página institucional en todas las hojas y registro
    de entradas de índice (`notify('TOCEntry', ...)`) leyendo el estilo de cada
    Paragraph — 'TituloCapitulo' → nivel 0, 'TituloSeccion' → nivel 1. Requiere
    `multiBuild()` en vez de `build()` para que el índice resuelva números de
    página reales (reportlab necesita una pasada extra para saber en qué página
    terminó cada capítulo antes de poder imprimir el índice)."""

    def __init__(self, *args, **kwargs):
        BaseDocTemplate.__init__(self, *args, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='normal')
        self.addPageTemplates([PageTemplate(id='con_pie', frames=[frame], onPage=self._dibujar_pie)])

    def _dibujar_pie(self, canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(colors.HexColor('#94a3b8'))
        canvas.drawCentredString(
            doc.pagesize[0] / 2, 0.45 * inch,
            f'{NOMBRE_INSTITUCION} · Informe de Seguimiento y Ejecución del Plan Anual de Compras · Página {doc.page}',
        )
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            estilo = flowable.style.name
            texto = flowable.getPlainText()
            if estilo == 'TituloCapitulo':
                self.notify('TOCEntry', (0, texto, self.page))
            elif estilo == 'TituloSeccion':
                self.notify('TOCEntry', (1, texto, self.page))


def _portada_pdf(story, periodo_label, anho, hoy):
    logo = _pdf_imagen(_logo_bytes(), 1.3, 1.3)
    if logo:
        story.append(logo)
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph(TITULO_INFORME, _PDF_ESTILOS['TituloPortada']))
    story.append(Paragraph(NOMBRE_INSTITUCION.upper(), _PDF_ESTILOS['SubportadaFuerte']))
    edificio = _pdf_imagen(_edificio_bytes(), 5.3, 3.48)
    if edificio:
        story.append(Spacer(1, 0.2 * inch))
        story.append(edificio)
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(
        f'Período de análisis: {periodo_label}<br/>Año PAC (Plan Anual de Compras): {anho}<br/>'
        f'Generado el {hoy.strftime("%d-%m-%Y")}',
        _PDF_ESTILOS['Subportada'],
    ))
    story.append(PageBreak())


def _indice_pdf(story):
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name='TOCCapitulo', fontSize=11, leading=16, textColor=colors.HexColor(COLOR_INSTITUCIONAL), spaceBefore=4),
        ParagraphStyle(name='TOCSeccion', fontSize=9.5, leading=13, leftIndent=16, textColor=colors.HexColor('#475569')),
    ]
    story.append(Paragraph('Índice', _PDF_ESTILOS['TituloCapitulo']))
    story.append(toc)
    story.append(PageBreak())


def generar_reporte_pdf(periodo):
    """Genera el reporte PDF institucional único y exhaustivo del período
    ('YYYY-MM' o 'YYYY-QN'). Retorna BytesIO. Misma estructura de capítulos que
    `generar_informe_word` — ver ese docstring."""
    d = _datos_informe_completo(periodo)
    label, anho, anho_ant, hoy = d['label'], d['anho'], d['anho_anterior'], d['hoy']
    est = _PDF_ESTILOS

    buf = io.BytesIO()
    doc = _InformeDocTemplate(
        buf, pagesize=letter,
        topMargin=0.9 * inch, bottomMargin=0.85 * inch, leftMargin=0.95 * inch, rightMargin=0.75 * inch,
    )
    story = []

    _portada_pdf(story, label, anho, hoy)
    _indice_pdf(story)

    # --- Resumen Ejecutivo Institucional -------------------------------------
    story.append(Paragraph('Resumen Ejecutivo Institucional', est['TituloCapitulo']))
    story.append(Paragraph(parrafo_resumen_ejecutivo(label, d['dentro_fuera']['kpis'], d['comparativa_periodos']), est['Cuerpo']))
    story.append(Paragraph(parrafo_cumplimiento_temporal(label, d['temporal']['kpis']), est['Cuerpo']))
    story.append(Paragraph(
        f'En paralelo, el Plan Anual de Compras {anho} registra {_n(d["total_fichas"])} fichas/proyectos, de las '
        f'cuales {_n(d["ejecutados_fichas"])} ({d["pct_ejecutado_fichas"]}%) cuentan con formulario de compra u '
        f'orden de compra enlazada, por un monto total planificado de {_money(d["monto_total_fichas"])}.',
        est['Cuerpo'],
    ))

    img = _pdf_imagen(grafico_donut_dentro_fuera(d['dentro_fuera']['kpis']['pct_dentro']), 2.5, 2.5)
    if img:
        story.append(img)
        story.append(Paragraph('Gráfico 1 — Distribución de formularios Dentro/Fuera del PAC en el período.', est['Leyenda']))
    img = _pdf_imagen(grafico_barras_comparativa_anual(d['dentro_fuera']['comparativa_anual']), 5.4, 3.0)
    if img:
        story.append(img)
        story.append(Paragraph('Gráfico 2 — Comparativa histórica anual de formularios Dentro/Fuera del PAC.', est['Leyenda']))
    img = _pdf_imagen(grafico_evolucion_mensual_dentro_fuera(d['temporalidad_mensual']['meses'], anho, anho_ant), 5.6, 2.6)
    if img:
        story.append(img)
        story.append(Paragraph(
            f'Gráfico 3 — Evolución mensual {anho} (barras) comparada contra el % Dentro del PAC de {anho_ant} '
            '(línea punteada).', est['Leyenda'],
        ))

    if d['avance_trimestral']:
        av = d['avance_trimestral']
        story.append(Paragraph(f'Avance Trimestral — {label}', est['TituloSeccion']))
        story.append(Paragraph(
            f'Detalle mes a mes de los 3 meses que componen el {label}, para visualizar la mejora o retroceso '
            'dentro del propio trimestre — complementario a la comparación anual del Gráfico 3.', est['Cuerpo'],
        ))
        img = _pdf_imagen(grafico_evolucion_mensual_dentro_fuera(av['meses_fsc'], anho, anho_ant, titulo=f'Avance mensual — {label}'), 5.6, 2.6)
        if img:
            story.append(img)
            texto_var = (
                f'variación de {av["variacion_pct_dentro"]:+.1f} p.p. entre el primer y el último mes del trimestre'
                if av['variacion_pct_dentro'] is not None else 'sin datos suficientes para calcular variación interna'
            )
            story.append(Paragraph(f'Gráfico 3b — % Dentro PAC mes a mes dentro del {label} ({texto_var}).', est['Leyenda']))
        img = _pdf_imagen(grafico_barras_ejecucion_mensual_planer(av['meses_planer'], titulo=f'Ejecución Plan de Compras — {label}'), 5.6, 2.6)
        if img:
            story.append(img)
            texto_var = (
                f'variación de {av["variacion_pct_ejecutado"]:+.1f} p.p. entre el primer y el último mes'
                if av['variacion_pct_ejecutado'] is not None else 'sin datos suficientes para calcular variación interna'
            )
            story.append(Paragraph(f'Gráfico 3c — % Ejecutado del Plan de Compras mes a mes dentro del {label} ({texto_var}).', est['Leyenda']))
        story.append(_pdf_tabla_avance_trimestral(av))

    story.append(PageBreak())

    story.append(Paragraph('Cumplimiento Dentro/Fuera del PAC por Subdirección', est['TituloSeccion']))
    story.append(Paragraph(
        'Desglose por subdirección del número de formularios Dentro y Fuera del PAC del año en curso comparado '
        'contra el mismo corte del año anterior.', est['Cuerpo'],
    ))
    if d['resumen_subdireccion']['subdirecciones']:
        story.append(_pdf_tabla_resumen_subdireccion(d['resumen_subdireccion']['subdirecciones'], anho, anho_ant))
    img = _pdf_imagen(grafico_donut_cumplimiento_temporal(d['temporal']['kpis']), 3.0, 2.7)
    if img:
        story.append(Spacer(1, 0.15 * inch))
        story.append(img)
        story.append(Paragraph('Gráfico 4 — Cumplimiento temporal: formularios Dentro del PAC evaluados contra su fecha planificada.', est['Leyenda']))
    img = _pdf_imagen(grafico_barras_ejecucion_mensual_planer(d['temporal_mensual_planer']['meses']), 5.6, 2.4)
    if img:
        story.append(img)
        story.append(Paragraph(f'Gráfico 5 — Ejecución mensual del Plan de Compras {anho} (fichas Ejecutadas/Pendientes/Atrasadas).', est['Leyenda']))
    story.append(PageBreak())

    # --- Metodología -----------------------------------------------------------
    story.append(Paragraph('Metodología', est['TituloCapitulo']))
    for parrafo in _PARRAFOS_METODOLOGIA:
        story.append(Paragraph(parrafo, est['Cuerpo']))
    story.append(PageBreak())

    # --- Capítulos por Subdirección ----------------------------------------------
    subs_institucionales = [s for s in d['subdirecciones'] if s['institucional']]
    otras_ramas = [s for s in d['subdirecciones'] if not s['institucional']]

    for sub in subs_institucionales:
        story.append(Paragraph(_nombre_subdireccion_display(sub['nombre']), est['TituloCapitulo']))

        story.append(Paragraph(f'Formularios de Solicitud de Compra — Período {label}', est['TituloSeccion']))
        if sub['fsc'] and sub['fsc']['total']:
            mejor_rk, peor_rk = _mejor_peor_de_ranking(d['rankings_depto'], sub['nombre'])
            story.append(Paragraph(parrafo_capitulo_subdireccion(sub['nombre'], sub['fsc'], mejor_rk, peor_rk), est['Cuerpo']))
            if sub['fsc']['departamentos']:
                story.append(_pdf_tabla_departamentos(sub['fsc']['departamentos']))
        else:
            story.append(Paragraph('Sin formularios registrados en el período para esta subdirección.', est['Cuerpo']))

        story.append(Spacer(1, 0.12 * inch))
        story.append(Paragraph(f'Ejecución del Plan de Compras — Año PAC {anho}', est['TituloSeccion']))
        if sub['planer'] and sub['planer']['total']:
            p = sub['planer']
            story.append(Paragraph(
                f"{_n(p['total'])} fichas del Plan de Compras — {p['pct_ejecutado']}% ejecutadas "
                f"({_n(p['ejecutados'])} ejecutadas, {_n(p['pendientes'])} pendientes, {_n(p['atrasados'])} atrasadas). "
                f"Monto total planificado: {_money(p['monto_total'])}.",
                est['Cuerpo'],
            ))
            if p['departamentos']:
                story.append(_pdf_tabla_deptos_ejecucion(p['departamentos']))
            if sub['responsables']:
                story.append(Paragraph('Responsables: ' + ', '.join(sub['responsables']), est['Leyenda']))
        else:
            story.append(Paragraph('Sin fichas del Plan de Compras registradas para esta subdirección.', est['Cuerpo']))
        story.append(PageBreak())

    # --- Rankings Institucionales -------------------------------------------
    story.append(Paragraph('Rankings Institucionales', est['TituloCapitulo']))
    story.append(Paragraph(
        'El score compuesto pondera 40% el % Dentro del PAC, 40% el % de cumplimiento temporal y 20% el % '
        'Dentro del PAC ponderado por monto.', est['Cuerpo'],
    ))
    story.append(Paragraph('Mejores departamentos', est['TituloSeccion']))
    if d['rankings_depto']['mejores']:
        story.append(_pdf_tabla_ranking_depto(d['rankings_depto']['mejores']))
    else:
        story.append(Paragraph('Sin datos suficientes para generar el ranking en este período.', est['Cuerpo']))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph('Departamentos con mayor oportunidad de mejora', est['TituloSeccion']))
    if d['rankings_depto']['peores']:
        story.append(_pdf_tabla_ranking_depto(d['rankings_depto']['peores']))
    else:
        story.append(Paragraph('Sin datos suficientes para generar el ranking en este período.', est['Cuerpo']))
    story.append(PageBreak())

    story.append(Paragraph('Mejores formularios', est['TituloSeccion']))
    if d['rankings_formulario']['mejores']:
        story.append(_pdf_tabla_ranking_formulario(d['rankings_formulario']['mejores']))
    else:
        story.append(Paragraph('Sin datos suficientes para generar el ranking en este período.', est['Cuerpo']))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph('Formularios con mayor oportunidad de mejora', est['TituloSeccion']))
    if d['rankings_formulario']['peores']:
        story.append(_pdf_tabla_ranking_formulario(d['rankings_formulario']['peores']))
    else:
        story.append(Paragraph('Sin datos suficientes para generar el ranking en este período.', est['Cuerpo']))
    story.append(PageBreak())

    # --- Alertas y Seguimiento ------------------------------------------------
    story.append(Paragraph('Alertas y Seguimiento', est['TituloCapitulo']))
    story.append(Paragraph('Proyectos planificados sin ningún formulario Dentro PAC derivado todavía', est['TituloSeccion']))
    if d['temporal']['proyectos_sin_iniciar']:
        story.append(_pdf_tabla_proyectos_sin_iniciar(d['temporal']['proyectos_sin_iniciar']))
    else:
        story.append(Paragraph('No hay proyectos planificados sin iniciar en el período.', est['Cuerpo']))
    story.append(Spacer(1, 0.15 * inch))

    story.append(Paragraph(f'Fichas a ejecutar el próximo mes (Año PAC {anho})', est['TituloSeccion']))
    if d['proximo_mes']:
        story.append(Paragraph(f'{_n(len(d["proximo_mes"]))} ficha(s) planificada(s) para el próximo mes, aún sin ejecutar.', est['Cuerpo']))
        story.append(_pdf_tabla_fichas_pac(d['proximo_mes']))
    else:
        story.append(Paragraph('No hay fichas planificadas para el próximo mes.', est['Cuerpo']))
    story.append(Spacer(1, 0.15 * inch))

    story.append(Paragraph(f'Fichas atrasadas (Año PAC {anho})', est['TituloSeccion']))
    if d['atrasadas']:
        story.append(Paragraph(f'{_n(len(d["atrasadas"]))} ficha(s) con fecha de compra vencida y sin formulario ni OC enlazada.', est['Cuerpo']))
        story.append(_pdf_tabla_fichas_pac(d['atrasadas']))
    else:
        story.append(Paragraph('No hay fichas atrasadas en el período.', est['Cuerpo']))
    story.append(PageBreak())

    # --- Conclusiones y Recomendaciones ---------------------------------------
    story.append(Paragraph('Conclusiones y Recomendaciones', est['TituloCapitulo']))
    story.append(Paragraph(parrafo_conclusiones(label, d['dentro_fuera']['kpis'], d['temporal']['kpis']), est['Cuerpo']))
    story.append(Paragraph(
        f'En cuanto a la ejecución del Plan de Compras {anho}, {d["pct_ejecutado_fichas"]}% de las fichas '
        'planificadas cuentan hoy con formulario u orden de compra enlazada. '
        + ('Se recomienda priorizar la revisión de las fichas atrasadas listadas en Alertas y Seguimiento y '
           'coordinar con los responsables de cada subdirección la regularización de los proyectos pendientes.'
           if d['pct_ejecutado_fichas'] < 70 else
           'El nivel de ejecución es satisfactorio; se recomienda mantener el seguimiento mensual para sostener '
           'la tendencia.'),
        est['Cuerpo'],
    ))
    story.append(PageBreak())

    # --- Anexo: otras unidades de la red ----------------------------------------
    story.append(Paragraph('Anexo — Otras Unidades de la Red', est['TituloCapitulo']))
    story.append(Paragraph(
        'Detalle abreviado de las restantes unidades de la red asistencial (fuera de la Dirección Servicio de '
        'Salud Osorno) y de los formularios que no pudieron clasificarse organizacionalmente.', est['Cuerpo'],
    ))
    if otras_ramas:
        for sub in otras_ramas:
            story.append(Paragraph(_nombre_subdireccion_display(sub['nombre']), est['TituloSeccion']))
            if sub['fsc'] and sub['fsc']['departamentos']:
                story.append(_pdf_tabla_departamentos(sub['fsc']['departamentos']))
            if sub['planer'] and sub['planer']['departamentos']:
                story.append(Spacer(1, 0.08 * inch))
                story.append(Paragraph('Ejecución del Plan de Compras:', est['Cuerpo']))
                story.append(_pdf_tabla_deptos_ejecucion(sub['planer']['departamentos']))
            story.append(Spacer(1, 0.1 * inch))
    else:
        story.append(Paragraph('Sin registros de otras unidades de la red en este período.', est['Cuerpo']))

    doc.multiBuild(story)
    buf.seek(0)
    return buf


# =============================================================================
# PPT — presentación institucional completa (decisión del usuario 2026-07-21,
# ampliada el mismo día): parte con una sección general (KPIs, comparativas,
# evolución mensual) y luego desarrolla UN capítulo por subdirección con sus
# propios KPIs, gráficos y tablas por departamento — pensada para poder
# exponerse completa o subdirección por subdirección en una reunión con Alta
# Dirección. Ya NO es un resumen de una sola diapositiva por subdirección
# (versión anterior, más liviana); ese nivel de detalle ahora vive en
# `_ppt_capitulo_subdireccion`, espejo del capítulo de Word/PDF pero en slides.
# =============================================================================

COLOR_TITULO_PPT = PptxRGBColor(0x1e, 0x3a, 0x5f)
COLOR_ACENTO_PPT = PptxRGBColor(0x38, 0xb2, 0xbd)
COLOR_TEXTO_PPT = PptxRGBColor(0x37, 0x41, 0x51)
COLOR_PIE_PPT = PptxRGBColor(0x94, 0xa3, 0xb8)


def _ppt_slide_en_blanco(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def _ppt_titulo(slide, texto, top=PptxInches(0.35), tamano=26):
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


def _ppt_pie_pagina(slide):
    caja = slide.shapes.add_textbox(PptxInches(0.4), PptxInches(7.05), PptxInches(9.2), PptxInches(0.35))
    p = caja.text_frame.paragraphs[0]
    run = p.add_run()
    run.text = NOMBRE_INSTITUCION
    run.font.size = PptxPt(8)
    run.font.color.rgb = COLOR_PIE_PPT


def _ppt_numerar_diapositivas(prs):
    total = len(prs.slides._sldIdLst)
    for i, slide in enumerate(prs.slides, start=1):
        caja = slide.shapes.add_textbox(PptxInches(9.3), PptxInches(7.05), PptxInches(0.6), PptxInches(0.35))
        p = caja.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.RIGHT
        run = p.add_run()
        run.text = f'{i}/{total}'
        run.font.size = PptxPt(8)
        run.font.color.rgb = COLOR_PIE_PPT


def _ppt_tabla_resumen_combinado(slide, subdirecciones, top):
    """Una sola tabla que resume las 4 subdirecciones institucionales — versión
    ejecutiva del capítulo por subdirección exhaustivo de Word/PDF."""
    filas_datos = [s for s in subdirecciones if s['institucional']]
    n_filas = len(filas_datos) + 1
    tabla_shape = slide.shapes.add_table(n_filas, 5, PptxInches(0.5), top, PptxInches(9), PptxInches(0.45 * n_filas))
    tabla = tabla_shape.table
    for i, h in enumerate(['Subdirección', 'Formularios', '% Dentro PAC', 'Fichas Plan Compras', '% Ejecutado']):
        tabla.cell(0, i).text = h
    for r, s in enumerate(filas_datos, start=1):
        fsc, planer = s['fsc'], s['planer']
        tabla.cell(r, 0).text = _nombre_subdireccion_display(s['nombre'])
        tabla.cell(r, 1).text = str(fsc['total']) if fsc else '—'
        tabla.cell(r, 2).text = f"{fsc['pct_dentro']}%" if fsc else '—'
        tabla.cell(r, 3).text = str(planer['total']) if planer else '—'
        tabla.cell(r, 4).text = f"{planer['pct_ejecutado']}%" if planer else '—'
    for row in tabla.rows:
        for cell in row.cells:
            for p in cell.text_frame.paragraphs:
                for run in p.runs:
                    run.font.size = PptxPt(12)


def _ppt_tabla_ranking(slide, filas, top, limite=5):
    filas_datos = filas[:limite]
    n_filas = len(filas_datos) + 1
    tabla_shape = slide.shapes.add_table(n_filas, 4, PptxInches(0.5), top, PptxInches(9), PptxInches(0.42 * n_filas))
    tabla = tabla_shape.table
    for i, h in enumerate(['Departamento', 'Subdirección', 'Score', '% Dentro']):
        tabla.cell(0, i).text = h
    for r, f in enumerate(filas_datos, start=1):
        tabla.cell(r, 0).text = f['nombre'].title()
        tabla.cell(r, 1).text = _nombre_subdireccion_display(f['subdireccion'])
        tabla.cell(r, 2).text = f"{f['score']:.0f}"
        tabla.cell(r, 3).text = f"{f['pct_dentro']}%"
    for row in tabla.rows:
        for cell in row.cells:
            for p in cell.text_frame.paragraphs:
                for run in p.runs:
                    run.font.size = PptxPt(12)


def _ppt_tabla_depto_dentro_fuera(slide, departamentos, top, limite=12):
    """Tabla Dentro/Fuera PAC por departamento — capítulo por subdirección del PPT.
    Mismos campos que `_tabla_departamentos` (Word), formato compacto de slide."""
    filas_datos = departamentos[:limite]
    n_filas = len(filas_datos) + 1
    tabla_shape = slide.shapes.add_table(n_filas, 5, PptxInches(0.4), top, PptxInches(9.2), PptxInches(0.4 * n_filas))
    tabla = tabla_shape.table
    tabla.columns[0].width = PptxInches(3.4)
    for i, h in enumerate(['Departamento', 'Total', 'Dentro', 'Fuera', '% Dentro']):
        tabla.cell(0, i).text = h
    for r, d in enumerate(filas_datos, start=1):
        tabla.cell(r, 0).text = _truncar(d['nombre'].title(), 42)
        tabla.cell(r, 1).text = str(d['total'])
        tabla.cell(r, 2).text = str(d['dentro'])
        tabla.cell(r, 3).text = str(d['fuera'])
        tabla.cell(r, 4).text = f"{d['pct_dentro']}%"
    for row in tabla.rows:
        for cell in row.cells:
            for p in cell.text_frame.paragraphs:
                for run in p.runs:
                    run.font.size = PptxPt(12)
    if len(departamentos) > limite:
        _ppt_parrafo(
            slide, f'… y {len(departamentos) - limite} departamento(s) adicional(es) — ver detalle en el informe Word/PDF.',
            top=top + PptxInches(0.4 * n_filas) + PptxInches(0.1), tamano=10, height=PptxInches(0.4),
        )


def _ppt_tabla_depto_ejecucion(slide, departamentos, top, limite=12):
    """Tabla Ejecución del Plan de Compras por departamento — capítulo por
    subdirección del PPT. Mismos campos que `_tabla_deptos_ejecucion` (Word)."""
    filas_datos = departamentos[:limite]
    n_filas = len(filas_datos) + 1
    tabla_shape = slide.shapes.add_table(n_filas, 5, PptxInches(0.4), top, PptxInches(9.2), PptxInches(0.4 * n_filas))
    tabla = tabla_shape.table
    tabla.columns[0].width = PptxInches(3.4)
    for i, h in enumerate(['Departamento', 'Total', 'Ejecutadas', 'Atrasadas', '% Ejecutado']):
        tabla.cell(0, i).text = h
    for r, d in enumerate(filas_datos, start=1):
        tabla.cell(r, 0).text = _truncar(d['nombre'].title(), 42)
        tabla.cell(r, 1).text = str(d['total'])
        tabla.cell(r, 2).text = str(d['ejecutados'])
        tabla.cell(r, 3).text = str(d['atrasados'])
        tabla.cell(r, 4).text = f"{d['pct_ejecutado']}%"
    for row in tabla.rows:
        for cell in row.cells:
            for p in cell.text_frame.paragraphs:
                for run in p.runs:
                    run.font.size = PptxPt(12)
    if len(departamentos) > limite:
        _ppt_parrafo(
            slide, f'… y {len(departamentos) - limite} departamento(s) adicional(es) — ver detalle en el informe Word/PDF.',
            top=top + PptxInches(0.4 * n_filas) + PptxInches(0.1), tamano=10, height=PptxInches(0.4),
        )


def _ppt_capitulo_subdireccion(prs, nombre_display, fsc, planer, responsables, anho):
    """Mini-capítulo de la subdirección `nombre_display` en el PPT — decisión del
    usuario 2026-07-21 (2ª ronda): expandir el PPT de 'ejecutivo resumido' a una
    presentación completa organizable por subdirección, para exponer a cada una
    individualmente. Espejo del capítulo de Word/PDF pero en formato slide: KPIs +
    donut, tabla+gráfico Dentro/Fuera por departamento, tabla+gráfico de Ejecución
    del Plan de Compras por departamento. `fsc`/`planer` pueden ser `None` si esa
    subdirección no tiene datos en el dominio correspondiente (períodos cortos)."""
    # --- Portada de capítulo + KPIs -----------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    franja = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, PptxInches(0), PptxInches(0), PptxInches(10), PptxInches(1.15))
    franja.fill.solid()
    franja.fill.fore_color.rgb = COLOR_TITULO_PPT
    franja.line.fill.background()
    tf = franja.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = nombre_display
    run.font.size = PptxPt(24)
    run.font.bold = True
    run.font.color.rgb = PptxRGBColor(0xff, 0xff, 0xff)

    kpis_texto = []
    if fsc:
        kpis_texto.append(
            f'Formularios totales: {_n(fsc["total"])}  ·  Dentro PAC: {_n(fsc["dentro"])} ({fsc["pct_dentro"]}%)  ·  '
            f'Fuera PAC: {_n(fsc["total"] - fsc["dentro"])}'
        )
    else:
        kpis_texto.append('Sin formularios registrados en este período.')
    if planer:
        kpis_texto.append(
            f'Plan de Compras {anho}: {_n(planer["total"])} fichas  ·  Ejecutadas: {_n(planer["ejecutados"])} '
            f'({planer["pct_ejecutado"]}%)  ·  Atrasadas: {_n(planer["atrasados"])}  ·  '
            f'Monto planificado: {_money(planer["monto_total"])}'
        )
    else:
        kpis_texto.append(f'Sin fichas del Plan de Compras {anho} registradas para esta subdirección.')
    if responsables:
        kpis_texto.append('Responsables: ' + ', '.join(responsables[:5]) + ('…' if len(responsables) > 5 else ''))
    _ppt_parrafo(slide, '\n\n'.join(kpis_texto), top=PptxInches(1.5), tamano=14, height=PptxInches(2))

    if fsc:
        _ppt_imagen(slide, grafico_donut_dentro_fuera(fsc['pct_dentro'], titulo='Dentro / Fuera PAC'),
                    PptxInches(1.2), PptxInches(3.8), PptxInches(3.2))
    if planer:
        _ppt_imagen(
            slide,
            grafico_donut_ejecucion_planer(planer['ejecutados'], planer['pendientes'], planer['atrasados']),
            PptxInches(5.6), PptxInches(3.8), PptxInches(3.2),
        )

    # --- Dentro/Fuera por departamento: tabla + gráfico ----------------------
    if fsc and fsc['departamentos']:
        slide = _ppt_slide_en_blanco(prs)
        _ppt_titulo(slide, f'{nombre_display} — Formularios por Departamento')
        _ppt_tabla_depto_dentro_fuera(slide, fsc['departamentos'], top=PptxInches(1.1))

        img_ranking = grafico_barras_ranking(
            fsc['departamentos'], campo_nombre='nombre', campo_valor='pct_dentro',
            titulo='Ranking de departamentos — % Dentro PAC', color=COLOR_DENTRO,
        )
        if img_ranking:
            slide = _ppt_slide_en_blanco(prs)
            _ppt_titulo(slide, f'{nombre_display} — Ranking % Dentro PAC')
            _ppt_imagen(slide, img_ranking, PptxInches(1.4), PptxInches(1.1), PptxInches(7.2))

    # --- Ejecución PAC por departamento: tabla + gráfico ---------------------
    if planer and planer['departamentos']:
        slide = _ppt_slide_en_blanco(prs)
        _ppt_titulo(slide, f'{nombre_display} — Ejecución del Plan de Compras por Departamento')
        _ppt_tabla_depto_ejecucion(slide, planer['departamentos'], top=PptxInches(1.1))

        img_ejec_depto = grafico_barras_ejecucion_por_depto(
            planer['departamentos'], titulo=f'{nombre_display} — Ejecutado / Pendiente / Atrasado por depto.',
        )
        if img_ejec_depto:
            slide = _ppt_slide_en_blanco(prs)
            _ppt_titulo(slide, f'{nombre_display} — Ejecución por Departamento')
            _ppt_imagen(slide, img_ejec_depto, PptxInches(1.4), PptxInches(1.1), PptxInches(7.2))


def generar_presentacion_ppt(periodo):
    """Genera la presentación PPT institucional del período ('YYYY-MM' o 'YYYY-QN').
    Retorna BytesIO. Estructura: sección general (KPIs institucionales, comparativas,
    evolución mensual, resumen por subdirección) seguida de UN capítulo completo por
    cada subdirección institucional (KPIs propios, gráficos y tablas por departamento
    — ver `_ppt_capitulo_subdireccion`), y cierra con rankings/alertas/conclusiones.
    Funciona igual para período mensual ('YYYY-MM') o trimestral ('YYYY-QN') — ambos
    pasan por `_datos_informe_completo`, que ya resuelve el rango de fechas."""
    d = _datos_informe_completo(periodo)
    label, anho, anho_ant, hoy = d['label'], d['anho'], d['anho_anterior'], d['hoy']

    prs = Presentation()
    prs.slide_width = PptxInches(10)
    prs.slide_height = PptxInches(7.5)

    # --- Portada -------------------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    logo = _logo_bytes()
    if logo:
        slide.shapes.add_picture(logo, PptxInches(4.2), PptxInches(0.35), height=PptxInches(1.1))
    _ppt_titulo(slide, TITULO_INFORME, top=PptxInches(1.7), tamano=30)
    caja_sub = slide.shapes.add_textbox(PptxInches(0.5), PptxInches(2.55), PptxInches(9), PptxInches(0.5))
    p_sub = caja_sub.text_frame.paragraphs[0]
    p_sub.alignment = PP_ALIGN.CENTER
    run_sub = p_sub.add_run()
    run_sub.text = NOMBRE_INSTITUCION.upper()
    run_sub.font.size = PptxPt(16)
    run_sub.font.bold = True
    run_sub.font.color.rgb = COLOR_ACENTO_PPT
    edificio = _edificio_bytes()
    if edificio:
        slide.shapes.add_picture(edificio, PptxInches(2.4), PptxInches(3.15), width=PptxInches(5.2))
    caja_meta = slide.shapes.add_textbox(PptxInches(0.5), PptxInches(6.7), PptxInches(9), PptxInches(0.6))
    p_meta = caja_meta.text_frame.paragraphs[0]
    p_meta.alignment = PP_ALIGN.CENTER
    run_meta = p_meta.add_run()
    run_meta.text = f'Período: {label} · Año PAC {anho} · Generado el {hoy.strftime("%d-%m-%Y")}'
    run_meta.font.size = PptxPt(12)
    run_meta.font.color.rgb = COLOR_TEXTO_PPT

    # --- Agenda ----------------------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Agenda')
    subdirecciones_institucionales = [s for s in d['subdirecciones'] if s['institucional']]
    agenda = [
        'Resumen Ejecutivo Institucional',
        'Comparativa Histórica y Evolución Mensual',
        *([f'Avance Trimestral — {label}'] if d['avance_trimestral'] else []),
        'Ejecución del Plan Anual de Compras',
        'Resumen General por Subdirección',
        *[f'Detalle — {_nombre_subdireccion_display(s["nombre"])}' for s in subdirecciones_institucionales],
        'Rankings Institucionales',
        'Alertas y Seguimiento',
        'Conclusiones y Recomendaciones',
    ]
    tamano_agenda = 18 if len(agenda) <= 8 else 14
    espacio_agenda = 14 if len(agenda) <= 8 else 8
    caja = slide.shapes.add_textbox(PptxInches(0.8), PptxInches(1.15), PptxInches(8.4), PptxInches(5.8))
    tf = caja.text_frame
    tf.word_wrap = True
    for i, item in enumerate(agenda):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run()
        run.text = f'{i + 1}.  {item}'
        run.font.size = PptxPt(tamano_agenda)
        run.font.color.rgb = COLOR_TEXTO_PPT
        p.space_after = PptxPt(espacio_agenda)

    # --- Resumen Ejecutivo -------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Resumen Ejecutivo Institucional')
    kpis = d['dentro_fuera']['kpis']
    var_ant = d['comparativa_periodos']['periodo_anterior']['variacion_pp']
    resumen_kpis = (
        f'Total formularios: {_n(kpis["total"])} — Dentro PAC: {_n(kpis["dentro"])} ({kpis["pct_dentro"]}%) — '
        f'Fuera PAC: {_n(kpis["fuera"])}\nVariación vs período anterior: {var_ant:+.1f} p.p.\n'
        f'% Cumplimiento temporal: {d["temporal"]["kpis"]["pct_en_fecha"]}%\n'
        f'Plan de Compras {anho}: {_n(d["total_fichas"])} fichas — {d["pct_ejecutado_fichas"]}% ejecutadas'
    )
    _ppt_parrafo(slide, resumen_kpis, top=PptxInches(1.05), tamano=14, height=PptxInches(1.6))
    _ppt_imagen(slide, grafico_donut_dentro_fuera(kpis['pct_dentro']), PptxInches(0.5), PptxInches(2.9), PptxInches(3.2))
    _ppt_imagen(slide, grafico_donut_cumplimiento_temporal(d['temporal']['kpis']), PptxInches(4.2), PptxInches(2.9), PptxInches(3.2))

    # --- Comparativa histórica + Evolución mensual --------------------------
    img_comp = grafico_barras_comparativa_anual(d['dentro_fuera']['comparativa_anual'])
    if img_comp:
        slide = _ppt_slide_en_blanco(prs)
        _ppt_titulo(slide, 'Comparativa Histórica — Dentro vs Fuera PAC')
        _ppt_imagen(slide, img_comp, PptxInches(1), PptxInches(1.2), PptxInches(8))

    img_evol = grafico_evolucion_mensual_dentro_fuera(d['temporalidad_mensual']['meses'], anho, anho_ant)
    if img_evol:
        slide = _ppt_slide_en_blanco(prs)
        _ppt_titulo(slide, f'Evolución Mensual {anho} vs {anho_ant}')
        _ppt_imagen(slide, img_evol, PptxInches(0.8), PptxInches(1.2), PptxInches(8.4))

    # --- Avance Trimestral (solo si el período es un trimestre) --------------
    if d['avance_trimestral']:
        av = d['avance_trimestral']
        slide = _ppt_slide_en_blanco(prs)
        _ppt_titulo(slide, f'Avance Trimestral — {label}')
        texto_var_dentro = (
            f'{av["variacion_pct_dentro"]:+.1f} p.p.' if av['variacion_pct_dentro'] is not None else 'sin datos suficientes'
        )
        texto_var_ejec = (
            f'{av["variacion_pct_ejecutado"]:+.1f} p.p.' if av['variacion_pct_ejecutado'] is not None else 'sin datos suficientes'
        )
        _ppt_parrafo(
            slide,
            f'Variación % Dentro PAC dentro del trimestre: {texto_var_dentro}   ·   '
            f'Variación % Ejecutado del Plan de Compras: {texto_var_ejec}',
            top=PptxInches(1.05), tamano=13, height=PptxInches(0.6),
        )
        img_av_fsc = grafico_evolucion_mensual_dentro_fuera(av['meses_fsc'], anho, anho_ant, titulo=f'% Dentro PAC — {label}')
        _ppt_imagen(slide, img_av_fsc, PptxInches(0.3), PptxInches(1.8), PptxInches(4.7))
        img_av_planer = grafico_barras_ejecucion_mensual_planer(av['meses_planer'], titulo=f'Ejecución — {label}')
        _ppt_imagen(slide, img_av_planer, PptxInches(5.1), PptxInches(1.8), PptxInches(4.7))

    # --- Ejecución del Plan de Compras ---------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Ejecución del Plan Anual de Compras')
    _ppt_parrafo(
        slide,
        f'Año PAC {anho}: {_n(d["total_fichas"])} fichas — {d["pct_ejecutado_fichas"]}% ejecutadas '
        f'({_n(d["ejecutados_fichas"])} con formulario u OC enlazada). '
        f'Monto total planificado: {_money(d["monto_total_fichas"])}.',
        top=PptxInches(1.05), tamano=14, height=PptxInches(1.0),
    )
    img_ejec = grafico_barras_ejecucion_mensual_planer(d['temporal_mensual_planer']['meses'])
    if img_ejec:
        _ppt_imagen(slide, img_ejec, PptxInches(0.8), PptxInches(2.1), PptxInches(8.4))

    # --- Resumen general por subdirección (1 tabla combinada, panorama antes
    # del detalle) ------------------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Resumen General por Subdirección')
    _ppt_parrafo(
        slide,
        'Formularios Dentro/Fuera del PAC y ejecución del Plan de Compras, por subdirección institucional — '
        'el detalle completo de cada una (KPIs, gráficos y departamentos) se desarrolla a continuación.',
        top=PptxInches(1.0), tamano=12, height=PptxInches(0.7),
    )
    _ppt_tabla_resumen_combinado(slide, d['subdirecciones'], top=PptxInches(1.75))

    # --- Detalle por subdirección: un capítulo completo por cada una --------
    for s in subdirecciones_institucionales:
        _ppt_capitulo_subdireccion(
            prs, _nombre_subdireccion_display(s['nombre']), s['fsc'], s['planer'], s['responsables'], anho,
        )

    # --- Rankings ----------------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Ranking Institucional — Mejores Departamentos')
    if d['rankings_depto']['mejores']:
        _ppt_tabla_ranking(slide, d['rankings_depto']['mejores'], top=PptxInches(1.2), limite=5)
    else:
        _ppt_parrafo(slide, 'Sin datos suficientes para generar el ranking en este período.', top=PptxInches(1.2))

    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Ranking Institucional — Mayor Oportunidad de Mejora')
    if d['rankings_depto']['peores']:
        _ppt_tabla_ranking(slide, d['rankings_depto']['peores'], top=PptxInches(1.2), limite=5)
    else:
        _ppt_parrafo(slide, 'Sin datos suficientes para generar el ranking en este período.', top=PptxInches(1.2))

    # --- Alertas y Seguimiento (solo conteos, versión ejecutiva) ---------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Alertas y Seguimiento')
    n_sin_iniciar = len(d['temporal']['proyectos_sin_iniciar'])
    alertas_texto = (
        f'⚠  Proyectos planificados sin formulario Dentro PAC derivado: {_n(n_sin_iniciar)}\n\n'
        f'📅  Fichas a ejecutar el próximo mes (Año PAC {anho}): {_n(len(d["proximo_mes"]))}\n\n'
        f'⏰  Fichas atrasadas (Año PAC {anho}): {_n(len(d["atrasadas"]))}'
    )
    _ppt_parrafo(slide, alertas_texto, top=PptxInches(1.3), tamano=17, height=PptxInches(3))

    # --- Conclusiones ----------------------------------------------------------
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, 'Conclusiones y Recomendaciones')
    _ppt_parrafo(
        slide, parrafo_conclusiones(label, d['dentro_fuera']['kpis'], d['temporal']['kpis']),
        top=PptxInches(1.2), tamano=15, height=PptxInches(2.6),
    )
    _ppt_parrafo(
        slide,
        f'Ejecución del Plan de Compras {anho}: {d["pct_ejecutado_fichas"]}% ejecutado. '
        + ('Se recomienda priorizar la regularización de fichas atrasadas.' if d['pct_ejecutado_fichas'] < 70
           else 'Nivel de ejecución satisfactorio — mantener el seguimiento mensual.'),
        top=PptxInches(4.2), tamano=15, height=PptxInches(1.4),
    )

    for slide in prs.slides:
        _ppt_pie_pagina(slide)
    _ppt_numerar_diapositivas(prs)

    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf
