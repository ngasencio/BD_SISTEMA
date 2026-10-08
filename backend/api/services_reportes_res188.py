"""
Reportería institucional (Word, PDF, PPT) para los Indicadores Res.188/2026 del
módulo PAC (`/pac`). Empieza cubriendo solo el Indicador 1 — % Compras dentro
del PAC — con el detalle de enlace PAC (evolución mensual, trimestral,
comparativo anual, corregidas, etc.) ya disponible en `calcular_oc_stats`.

Arquitectura pensada para escalar: a diferencia de `services_reportes.py`
(3 funciones monolíticas que repiten la secuencia de secciones a mano por
formato), este módulo arma primero una lista de `Seccion` (contenido puro,
sin conocimiento de docx/pptx/reportlab) vía `_construir_secciones()`, y cada
generador (`generar_informe_word_ind1`, `generar_reporte_pdf_ind1`,
`generar_presentacion_ppt_ind1`) es un solo loop que traduce esa MISMA lista
a su formato. Agregar el Indicador 2 (o cualquier sección nueva) más adelante
significa agregar `Seccion`es en `_construir_secciones()` — no tocar los 3
renderers.

Reutiliza deliberadamente los helpers de bajo nivel ya probados en
`services_reportes.py` (colores institucionales, `_fig_a_bytes`, márgenes,
títulos de capítulo/sección, estilos PDF, helpers de slide PPT) para que el
resultado visual sea indistinguible del informe de Cumplimiento Interno PAC.
Lo único propio de este módulo es la portada/pie de página (llevan un título
distinto) y, por supuesto, el contenido.
"""
import io
from dataclasses import dataclass, field
from datetime import date

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

from pptx import Presentation
from pptx.util import Inches as PptxInches, Pt as PptxPt

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, PageBreak
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.styles import ParagraphStyle

from .services import calcular_indicadores_res188, calcular_oc_stats
from .plantillas_narrativas import _n, _money, MESES_ES
from .services_reportes import (
    NOMBRE_INSTITUCION,
    COLOR_INSTITUCIONAL, COLOR_INSTITUCIONAL_CLARO, COLOR_DENTRO, COLOR_FUERA, COLOR_PENDIENTE,
    _fig_a_bytes, _logo_bytes, _edificio_bytes,
    _configurar_margenes_docx, _agregar_campo_docx, _forzar_actualizacion_campos_docx,
    _titulo_capitulo_docx, _titulo_seccion_docx,
    _PDF_ESTILOS, _PDF_TABLA_ESTILO, _celda, _celda_encabezado, _fila_encabezado, _pdf_imagen,
    _ppt_slide_en_blanco, _ppt_titulo, _ppt_parrafo, _ppt_imagen, _ppt_pie_pagina, _ppt_numerar_diapositivas,
    _ppt_portada, _ppt_divisor_seccion, _ppt_estilizar_tabla,
    COLOR_TITULO_PPT, COLOR_TEXTO_PPT, PPT_ANCHO, PPT_ALTO, PPT_MARGEN, PPT_ANCHO_CONTENIDO,
)

import matplotlib.pyplot as plt  # backend Agg ya fijado por el import de services_reportes arriba
from matplotlib.lines import Line2D
from PIL import Image as PILImage

TITULO_INFORME_IND1 = 'Informe de Gestión PAC — Indicador 1: % Compras dentro del PAC'

MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
TRIMESTRES = [('T1 (Ene-Mar)', (1, 2, 3)), ('T2 (Abr-Jun)', (4, 5, 6)), ('T3 (Jul-Sep)', (7, 8, 9)), ('T4 (Oct-Dic)', (10, 11, 12))]
PALETA_ANIOS = ['#1e3a5f', '#38b2bd', '#16a34a', '#d97706', '#dc2626', '#7c3aed']
# Color FIJO por año (no por posición en el gráfico): un mismo año se ve igual en el gráfico mensual por monto, en el
# de cantidad de OC y en el informe de cualquier año. 2022-2026 conservan los colores históricos del informe.
COLOR_ANIO = {2020: '#7c3aed', 2021: '#64748b', 2022: '#1e3a5f', 2023: '#38b2bd', 2024: '#16a34a', 2025: '#d97706', 2026: '#dc2626'}


def _color_anio(anio):
    """Color del año en las series multi-año. Años fuera del mapa (2027 en adelante) ciclan la paleta de forma
    estable: la ventana de 5 años nunca repite color."""
    return COLOR_ANIO.get(anio) or PALETA_ANIOS[(anio - 2022) % len(PALETA_ANIOS)]


def _fmt_millones(x):
    """$1.234.567.890 -> '1.235' — para ejes de gráfico, SIEMPRE en millones de pesos y con el
    eje rotulado 'Millones de $'. Antes se abreviaba '$1.2MM'/'$45M', ambiguo en Chile
    (MM$ = millones, M$ = miles) y se podía leer con un factor 1.000 de error."""
    return f'{x / 1e6:,.0f}'.replace(',', '.')


# =============================================================================
# Capa de datos — une calcular_indicadores_res188 + calcular_oc_stats
# =============================================================================

def _primer_anio_con_enlace(historico_enlace_anual):
    """Primer año con al menos una OC enlazada a un proyecto PAC. Antes de ese año el sistema
    no tiene proyectos PAC contra los cuales enlazar (el maestro PAC parte en 2020), así que
    un 0% no significa incumplimiento sino ausencia de dato — no se grafica ni se tabula."""
    anios = sorted(r['anio'] for r in (historico_enlace_anual or []) if r.get('enlazadas'))
    return anios[0] if anios else None


def _construir_datos(anio):
    oc = calcular_oc_stats(anio)
    return {
        'anio': anio,
        'hoy': date.today(),
        'indicadores': calcular_indicadores_res188(anio),
        'oc': oc,
        'primer_anio_enlace': _primer_anio_con_enlace(oc['historico_enlace_anual']),
    }


def _historico_visible(datos):
    """Serie anual (ascendente) desde el primer año con enlace PAC posible."""
    primer = datos['primer_anio_enlace']
    filas = sorted(datos['oc']['historico_enlace_anual'], key=lambda r: r['anio'])
    return [r for r in filas if primer is not None and r['anio'] >= primer]


# =============================================================================
# Modelo de contenido — independiente de docx/pptx/reportlab
# =============================================================================

@dataclass
class Grafico:
    imagen: object                 # BytesIO (PNG) o None
    caption: str
    ancho_word: float = 5.6        # inches
    ancho_pdf: tuple = (5.6, 3.15)  # (w, h) inches
    ancho_ppt: float = 8.6         # inches


@dataclass
class Tabla:
    encabezados: list
    filas: list                    # list[list[str]]
    anchos_word: list = None       # inches por columna (None = reparto automático)
    anchos_pdf: list = None


@dataclass
class Seccion:
    titulo: str
    nivel: int = 1                  # 1 = capítulo, 2 = subsección
    parrafo: str = None
    graficos: list = field(default_factory=list)   # list[Grafico]
    tabla: Tabla = None
    nota: str = None


# =============================================================================
# Gráficos (matplotlib, paleta institucional, devuelven BytesIO vía _fig_a_bytes)
# =============================================================================

def _grafico_donut_enlace(pct_enlace):
    if pct_enlace is None:
        return None
    pct_fuera = round(100 - pct_enlace, 1)
    fig, ax = plt.subplots(figsize=(3.6, 3.6))
    ax.pie(
        [pct_enlace, pct_fuera], colors=[COLOR_DENTRO, COLOR_FUERA], startangle=90,
        wedgeprops={'width': 0.35, 'edgecolor': 'white', 'linewidth': 2},
        autopct=lambda p: f'{p:.0f}%' if p > 5 else '', pctdistance=0.82,
        textprops={'color': 'white', 'fontweight': 'bold', 'fontsize': 11},
    )
    ax.set_title('% Enlace al PAC', fontsize=11, pad=10)
    fig.legend(['Enlazada', 'No Enlazada'], loc='lower center', ncol=2, frameon=False,
               bbox_to_anchor=(0.5, -0.02), fontsize=9)
    return _fig_a_bytes(fig)


def _grafico_barras_enlace(labels, enlazada, no_enlazada, titulo):
    fig, ax = plt.subplots(figsize=(7.0, 3.4))
    x = range(len(labels))
    ancho = 0.38
    ax.bar([i - ancho / 2 for i in x], enlazada, width=ancho, label='Enlazada', color=COLOR_DENTRO, edgecolor='none')
    ax.bar([i + ancho / 2 for i in x], no_enlazada, width=ancho, label='No Enlazada', color=COLOR_FUERA, edgecolor='none')
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=9)
    ax.yaxis.set_major_formatter(lambda v, _: _fmt_millones(v))
    ax.set_ylabel('Millones de $', fontsize=9)
    ax.set_title(titulo, fontsize=11, pad=10)
    ax.legend(frameon=False, fontsize=9, loc='upper left')
    ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_evolucion_mensual(evolucion_enlace, anio):
    mapa = {r['mes']: r for r in (evolucion_enlace or [])}
    enl = [mapa.get(m, {}).get('enlazada', 0) for m in range(1, 13)]
    noenl = [mapa.get(m, {}).get('no_enlazada', 0) for m in range(1, 13)]
    return _grafico_barras_enlace(MESES_CORTOS, enl, noenl, f'Evolución Mensual: Enlazada vs No Enlazada — Monto ({anio})')


def _grafico_barras_enlace_cantidad(labels, enlazada, no_enlazada, titulo):
    """Igual que `_grafico_barras_enlace` pero con eje Y entero (N° OC) en vez de monto."""
    fig, ax = plt.subplots(figsize=(7.0, 3.4))
    x = range(len(labels))
    ancho = 0.38
    ax.bar([i - ancho / 2 for i in x], enlazada, width=ancho, label='Enlazada', color=COLOR_DENTRO, edgecolor='none')
    ax.bar([i + ancho / 2 for i in x], no_enlazada, width=ancho, label='No Enlazada', color=COLOR_FUERA, edgecolor='none')
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=9)
    ax.set_ylabel('N° de OC', fontsize=9)
    ax.set_title(titulo, fontsize=11, pad=10)
    ax.legend(frameon=False, fontsize=9, loc='upper left')
    ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_evolucion_mensual_cantidad(evolucion_enlace, anio):
    mapa = {r['mes']: r for r in (evolucion_enlace or [])}
    enl = [mapa.get(m, {}).get('cantidad_enlazada', 0) for m in range(1, 13)]
    noenl = [mapa.get(m, {}).get('cantidad_no_enlazada', 0) for m in range(1, 13)]
    return _grafico_barras_enlace_cantidad(MESES_CORTOS, enl, noenl, f'Evolución Mensual: Enlazada vs No Enlazada — N° de OC ({anio})')


def _grafico_trimestral(evolucion_enlace, anio):
    mapa = {r['mes']: r for r in (evolucion_enlace or [])}
    labels = [t[0] for t in TRIMESTRES]
    enl = [sum(mapa.get(m, {}).get('enlazada', 0) for m in meses) for _, meses in TRIMESTRES]
    noenl = [sum(mapa.get(m, {}).get('no_enlazada', 0) for m in meses) for _, meses in TRIMESTRES]
    fig, ax = plt.subplots(figsize=(4.6, 3.4))
    x = range(len(labels))
    ancho = 0.38
    ax.bar([i - ancho / 2 for i in x], enl, width=ancho, label='Enlazada', color=COLOR_DENTRO)
    ax.bar([i + ancho / 2 for i in x], noenl, width=ancho, label='No Enlazada', color=COLOR_FUERA)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=9)
    ax.yaxis.set_major_formatter(lambda v, _: _fmt_millones(v))
    ax.set_ylabel('Millones de $', fontsize=9)
    ax.set_title(f'Comparativo Trimestral ({anio})', fontsize=11, pad=10)
    ax.legend(frameon=False, fontsize=9)
    ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_linea_pct_anual(historico_enlace_anual, campo, titulo, ylabel, color):
    """Línea del % de enlace por año (`campo` = 'pct_enlace_monto' o 'pct_enlace'). Recibe la serie ya
    acotada a los años con enlace PAC posible (`_historico_visible`). Mismo diseño para la versión por
    monto y la por cantidad de OC, para que se lean como par."""
    filas = sorted(historico_enlace_anual or [], key=lambda r: r['anio'])
    if not filas:
        return None
    fig, ax = plt.subplots(figsize=(7.0, 3.2))
    anios = [r['anio'] for r in filas]
    pct = [r[campo] for r in filas]
    ax.plot(anios, pct, color=color, marker='o', linewidth=2.2, markersize=5)
    ax.fill_between(anios, pct, color=color, alpha=.12)
    ax.set_ylim(0, 100)
    ax.set_xticks(anios)
    ax.set_ylabel(ylabel, fontsize=9)
    ax.set_title(titulo, fontsize=11, pad=10)
    ax.spines[['top', 'right']].set_visible(False)
    for a, p in zip(anios, pct):
        ax.annotate(f'{p:.0f}%', (a, p), textcoords='offset points', xytext=(0, 7), ha='center', fontsize=8, color=color)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_comparativo_anual(historico_enlace_anual):
    """% de enlace por MONTO (a cualquier proyecto PAC)."""
    return _grafico_linea_pct_anual(
        historico_enlace_anual, 'pct_enlace_monto',
        'Comparativo Anual — % Enlace a cualquier proyecto PAC (por monto)',
        '% del monto enlazado al PAC', COLOR_INSTITUCIONAL,
    )


def _grafico_comparativo_anual_pct_cantidad(historico_enlace_anual):
    """% de enlace por CANTIDAD de OC (a cualquier proyecto PAC) — par del gráfico por monto."""
    return _grafico_linea_pct_anual(
        historico_enlace_anual, 'pct_enlace',
        'Comparativo Anual — % Enlace a cualquier proyecto PAC (por cantidad de OC)',
        '% de las OC enlazadas al PAC', COLOR_INSTITUCIONAL_CLARO,
    )


def _grafico_comparativo_anual_cantidad(historico_enlace_anual):
    filas = sorted(historico_enlace_anual or [], key=lambda r: r['anio'])
    if not filas:
        return None
    labels = [str(r['anio']) for r in filas]
    enl = [r['enlazadas'] for r in filas]
    noenl = [r['total_oc'] - r['enlazadas'] for r in filas]
    return _grafico_barras_enlace_cantidad(labels, enl, noenl, 'Comparativo Anual — N° de OC Enlazadas vs No Enlazadas')


def _anios_comparables_mensual(anios_con_datos, anio_actual, primer_anio, maximo=5):
    """Años a dibujar en la serie mensual: hasta `maximo` años que terminan en el año del
    informe (así el año en análisis SIEMPRE está en el gráfico — antes se tomaban los últimos
    5 años con datos y, para años anteriores a 2022, el año resaltado quedaba fuera), sin
    bajar del primer año con enlace PAC posible."""
    candidatos = sorted(a for a in anios_con_datos if a <= anio_actual and (primer_anio is None or a >= primer_anio))
    return candidatos[-maximo:]


def _mes_en_curso_visible(historico_enlace_mensual, anio_actual, primer_anio, hoy):
    """(año, mes) del mes en curso si ese punto aparece en el gráfico mensual, si no None. El mes en curso aún no
    termina: su % es parcial y se dibuja distinto (marcador hueco + línea punteada) en vez de leerse como una caída
    real — eso es lo que producía la bajada brusca al final de la línea del año actual."""
    clave = (hoy.year, hoy.month)
    if hoy.month < 2:
        return None  # con solo enero no hay tramo anterior que unir
    anios_dibujados = _anios_comparables_mensual({r['anio'] for r in (historico_enlace_mensual or [])}, anio_actual, primer_anio)
    if hoy.year not in anios_dibujados:
        return None
    return clave if any((r['anio'], r['mes']) == clave for r in historico_enlace_mensual) else None


def _grafico_multi_anio_mensual(historico_enlace_mensual, anio_actual, primer_anio=None, campo='pct_enlace_monto',
                                titulo='% Enlace Mensual por monto — Comparativo con Años Anteriores',
                                ylabel='% del monto enlazado a cualquier proyecto PAC', mes_en_curso=None):
    """% de enlace mensual comparado entre años, con el año del informe resaltado. `campo` elige la medida:
    'pct_enlace_monto' (por monto) o 'pct_enlace' (por cantidad de OC). Cada año usa SIEMPRE su color fijo
    (`_color_anio`), así los dos gráficos se leen como un par. `mes_en_curso` = (año, mes) a dibujar como parcial."""
    por_anio = {}
    for r in (historico_enlace_mensual or []):
        por_anio.setdefault(r['anio'], {})[r['mes']] = r[campo]
    anios_recientes = _anios_comparables_mensual(por_anio.keys(), anio_actual, primer_anio)
    if not anios_recientes:
        return None
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    hay_parcial = False
    for a in anios_recientes:
        serie = [por_anio.get(a, {}).get(m) for m in range(1, 13)]
        color, grosor = _color_anio(a), (3 if a == anio_actual else 1.4)
        m = mes_en_curso[1] if (mes_en_curso and a == mes_en_curso[0]) else None
        if m and m > 1 and serie[m - 1] is not None:
            # Tramo completo (hasta el mes anterior) + unión punteada + punto hueco del mes en curso.
            ax.plot(range(1, 13), serie[:m - 1] + [None] * (13 - m), marker='o', markersize=3, color=color, linewidth=grosor, label=str(a))
            if serie[m - 2] is not None:
                ax.plot([m - 1, m], [serie[m - 2], serie[m - 1]], color=color, linewidth=grosor, linestyle=':')
            ax.plot([m], [serie[m - 1]], marker='o', markersize=5.5, markerfacecolor='white', markeredgecolor=color,
                    markeredgewidth=1.6, linestyle='none')
            hay_parcial = True
        else:
            ax.plot(range(1, 13), serie, marker='o', markersize=3, color=color, linewidth=grosor, label=str(a))
    ax.set_xticks(range(1, 13))
    ax.set_xticklabels(MESES_CORTOS, fontsize=9)
    ax.set_ylim(0, 100)
    ax.set_ylabel(ylabel, fontsize=9)
    ax.set_title(titulo, fontsize=10.5, pad=10)
    handles, etiquetas = ax.get_legend_handles_labels()
    if hay_parcial:
        handles.append(Line2D([0], [0], marker='o', color='#64748b', markerfacecolor='white', markeredgewidth=1.4, linestyle=':'))
        etiquetas.append('Mes en curso (parcial)')
    ax.legend(handles, etiquetas, frameon=False, fontsize=8, ncol=len(etiquetas))
    ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_mensual_monto(historico_enlace_mensual, anio_actual, primer_anio=None, mes_en_curso=None):
    return _grafico_multi_anio_mensual(
        historico_enlace_mensual, anio_actual, primer_anio, 'pct_enlace_monto',
        '% Enlace Mensual por monto — Comparativo con Años Anteriores',
        '% del monto enlazado a cualquier proyecto PAC', mes_en_curso,
    )


def _grafico_mensual_cantidad(historico_enlace_mensual, anio_actual, primer_anio=None, mes_en_curso=None):
    return _grafico_multi_anio_mensual(
        historico_enlace_mensual, anio_actual, primer_anio, 'pct_enlace',
        '% Enlace Mensual por cantidad de OC — Comparativo con Años Anteriores',
        '% de las OC enlazadas a cualquier proyecto PAC', mes_en_curso,
    )


def _grafico_tipo_oc_fuera_pac(no_enlazadas_tipo_oc, limite=8):
    filas = (no_enlazadas_tipo_oc or [])[:limite]
    if not filas:
        return None
    filas = list(reversed(filas))  # barh dibuja de abajo hacia arriba
    fig, ax = plt.subplots(figsize=(6.8, max(2.2, 0.42 * len(filas) + 1)))
    ax.barh([f['tipo_oc'] for f in filas], [f['cantidad'] for f in filas], color=COLOR_FUERA)
    ax.set_title('OC Fuera del PAC por Tipo (N°)', fontsize=11, pad=10)
    ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout()
    return _fig_a_bytes(fig)


# =============================================================================
# Narrativa (determinística, sin IA — mismo criterio que plantillas_narrativas.py)
# =============================================================================

def _nivel(pct):
    if pct is None:
        return 'sin información suficiente'
    if pct >= 70:
        return 'un nivel satisfactorio'
    if pct >= 40:
        return 'un nivel intermedio, con espacio de mejora'
    return 'un nivel crítico que requiere atención'


def _pct_ind1(datos):
    """% Compras dentro del PAC (Indicador 1) del año del informe: monto de OC enlazadas a un proyecto de
    `PlanerPAC` (el plan cargado, con su arrastre PC24/PC25) sobre el monto total de OC del año. Es la cifra de
    la dona, la tabla, la narrativa y las conclusiones — y la misma del dashboard y del Score Res.188."""
    return datos['indicadores'].get('i1')


# Qué mide la palabra "Enlazada" en las series mensual/trimestral/anual (viene de `EnlacePAC`, no de PlanerPAC).
_TEXTO_BASE_SERIES = (
    'En los gráficos y tablas de evolución mensual, trimestral y anual de este informe, "Enlazada" significa OC '
    'asociada a CUALQUIER proyecto PAC del maestro histórico (incluye proyectos de años anteriores que ya no figuran '
    'en el plan vigente); por eso su total puede ser mayor que el monto del Indicador 1.'
)


def _parrafo_resumen_ejecutivo(datos):
    anio = datos['anio']
    pct = _pct_ind1(datos)
    if pct is None:
        return (f'Durante {anio} no se registran Órdenes de Compra del Servicio de Salud Osorno '
                f'con las cuales calcular el % de compras dentro del Plan Anual de Compras (PAC).')

    texto = (
        f'Durante {anio}, el {pct:.1f}% del monto total de Órdenes de Compra del Servicio de Salud Osorno '
        f'quedó enlazado a proyectos del Plan Anual de Compras (PAC) vigente (incluye el arrastre de proyectos '
        f'PC24 y PC25), lo que representa {_nivel(pct)}.'
    )
    if not datos['indicadores'].get('plan_del_anio_cargado'):
        texto += (
            f' Atención: el plan PAC {anio} no está cargado en el sistema; el indicador se mide contra los proyectos '
            f'del plan que sí está cargado y por eso no es comparable para este año.'
        )
    return texto


def _nota_cualquier_pac(datos):
    """Observación: el mismo indicador considerando CUALQUIER proyecto PAC enlazado (maestro histórico),
    que es la base de las series del informe, con la variación contra el año anterior en esa misma base."""
    ind = datos['indicadores']
    anio = datos['anio']
    if ind.get('i1_cualquier_pac') is None:
        return None
    dif = (ind.get('monto_enlazado_cualquier_pac') or 0) - (ind.get('monto_enlazado_pac') or 0)
    texto = (
        f'Observación — cualquier proyecto PAC: si además se consideran las OC enlazadas a proyectos de PAC de años '
        f'anteriores que ya no figuran en el plan vigente, el % sube a {ind["i1_cualquier_pac"]:.1f}% '
        f'({_money(ind["monto_enlazado_cualquier_pac"])}; {_money(dif)} más que el indicador). '
    )
    primer = datos['primer_anio_enlace']
    anterior = next((r for r in datos['oc']['historico_enlace_anual'] if r['anio'] == anio - 1), None)
    if anterior and primer is not None and anterior['anio'] >= primer:
        var = round(round(ind['i1_cualquier_pac'], 1) - anterior['pct_enlace_monto'], 1)
        texto += (
            f'En esa misma base, {anio - 1} fue {anterior["pct_enlace_monto"]:.1f}% '
            f'({"un alza" if var > 0 else "una baja" if var < 0 else "sin variación"}'
            f'{f" de {abs(var):.1f} puntos porcentuales" if var else ""}). '
        )
    return texto.strip()


# =============================================================================
# Comparativo anual por CANTIDAD de OC — par del comparativo por monto: gráfico de líneas, tabla de avance
# y texto explicativo (sección "% Enlace PAC por cantidad de OC")
# =============================================================================

def _lista_anios(anios):
    """[2023] -> '2023'; [2023, 2025] -> '2023 y 2025'; [2022, 2023, 2025] -> '2022, 2023 y 2025'."""
    anios = [str(a) for a in anios]
    return anios[0] if len(anios) == 1 else ', '.join(anios[:-1]) + ' y ' + anios[-1]


def _oc_de_total(r):
    return f'{_n(r["enlazadas"])} de {_n(r["total_oc"])} OC'


def _frase_variacion_anual(pct, pct_ant, anio_ant):
    var = round(pct - pct_ant, 1)
    if var > 1:
        return f'un alza de {var:.1f} puntos porcentuales respecto a {anio_ant} ({pct_ant:.1f}%)'
    if var < -1:
        return f'una baja de {abs(var):.1f} puntos porcentuales respecto a {anio_ant} ({pct_ant:.1f}%)'
    return f'una variación menor a 1 punto porcentual respecto a {anio_ant} ({pct_ant:.1f}%)'


def _parrafo_avance_cantidad(hist):
    """Texto principal: de dónde partió el % de enlace por cantidad de OC, dónde está hoy y cómo varió
    respecto al año anterior. `hist` = serie anual ascendente de `_historico_visible`."""
    if not hist:
        return None
    ult = hist[-1]
    if len(hist) == 1:
        return (
            f'Medido por cantidad de OC, en {ult["anio"]} quedaron enlazadas a un proyecto PAC {_oc_de_total(ult)} '
            f'({ult["pct_enlace"]:.1f}%). Aún no hay otro año con enlace PAC contra el cual medir el avance.'
        )
    pri, ant = hist[0], hist[-2]
    return (
        f'Medido por cantidad de OC (y no por monto), el enlace al PAC pasó de {pri["pct_enlace"]:.1f}% en '
        f'{pri["anio"]} ({_oc_de_total(pri)}) a {ult["pct_enlace"]:.1f}% en {ult["anio"]} ({_oc_de_total(ult)}), es decir, '
        f'{_frase_variacion_anual(ult["pct_enlace"], ant["pct_enlace"], ant["anio"])}.'
    )


def _nota_avance_cantidad(hist, anio_en_curso):
    """Lectura del avance: mayor salto anual, retrocesos, comparación con el % por monto y aviso de año en
    curso. Determinística, sin IA (mismo criterio que `plantillas_narrativas.py`)."""
    if not hist:
        return None
    ult = hist[-1]
    partes = []
    if len(hist) >= 2:
        saltos = [(hist[i]['pct_enlace'] - hist[i - 1]['pct_enlace'], hist[i - 1]['anio'], hist[i]['anio'])
                  for i in range(1, len(hist))]
        mayor, desde, hasta = max(saltos)
        if mayor > 0:
            partes.append(f'El mayor avance anual fue entre {desde} y {hasta} (+{mayor:.1f} puntos porcentuales).')
        bajas = [hasta_ for v, _, hasta_ in saltos if v < -1]
        partes.append(
            f'Hubo retrocesos respecto al año anterior en {_lista_anios(bajas)}.' if bajas
            else 'No hubo retrocesos de un año a otro.'
        )
    dif = round(ult['pct_enlace_monto'] - ult['pct_enlace'], 1)
    if abs(dif) >= 1:
        partes.append(
            f'En {ult["anio"]}, por monto el enlace es {ult["pct_enlace_monto"]:.1f}% ({dif:+.1f} puntos porcentuales frente al '
            f'% por cantidad): las OC enlazadas tienen en promedio montos {"mayores" if dif > 0 else "menores"} que las no enlazadas.'
        )
    else:
        partes.append(f'En {ult["anio"]}, el % por monto ({ult["pct_enlace_monto"]:.1f}%) es similar al % por cantidad.')
    if ult['anio'] == anio_en_curso:
        partes.append(f'{ult["anio"]} está en curso: considera las OC enviadas hasta la fecha de generación del informe.')
    return 'Lectura del avance: ' + ' '.join(partes)


def _tabla_avance_cantidad(hist, anio_en_curso):
    """Tabla del avance anual por cantidad de OC, con la variación en puntos porcentuales contra el año anterior."""
    filas, anterior = [], None
    for r in hist:
        variacion = '—' if anterior is None else f'{round(r["pct_enlace"] - anterior, 1):+.1f} pp'
        anterior = r['pct_enlace']
        etiqueta = f'{r["anio"]} (en curso)' if r['anio'] == anio_en_curso else str(r['anio'])
        filas.append([
            etiqueta, _n(r['enlazadas']), _n(r['total_oc'] - r['enlazadas']), _n(r['total_oc']),
            f'{r["pct_enlace"]:.1f}%', variacion,
        ])
    return Tabla(
        encabezados=['Año', 'OC Enlazadas', 'OC No Enlazadas', 'Total OC', '% Enlace (N° OC)', 'Variación vs año anterior'],
        filas=filas,
    )


def _parrafo_conclusiones(datos):
    anio = datos['anio']
    pct = _pct_ind1(datos) or 0
    corregidas = datos['oc']['corregidas']
    if pct >= 70:
        texto = (
            'El nivel de enlace al Plan Anual de Compras alcanzado es satisfactorio. Se recomienda mantener '
            'las prácticas actuales de planificación y seguir monitoreando mensualmente para sostener la tendencia.'
        )
    else:
        texto = (
            'Se recomienda reforzar la planificación anticipada en las unidades y tipos de compra con menor '
            'apego al PAC, priorizando la revisión de las Órdenes de Compra "Fuera del PAC" con mayor volumen '
            'identificadas en este informe.'
        )
    if corregidas.get('esperando_sync', 0) > 0:
        texto += (
            f" Adicionalmente, existen {_n(corregidas['esperando_sync'])} OC corregidas manualmente que aún no "
            f'han sido confirmadas por la sincronización automática con Mercado Público — se recomienda '
            f'verificarlas en la próxima actualización.'
        )
    return texto


# =============================================================================
# Registro de secciones — el contenido se define UNA vez, los 3 formatos lo consumen igual
# =============================================================================

def _construir_secciones(datos):
    anio = datos['anio']
    ind = datos['indicadores']
    oc = datos['oc']
    corregidas = oc['corregidas']

    secciones = []

    filas_resumen = [
        ['N° de OC del año (sin canceladas)', _n(ind.get('cantidad_oc'))],
        ['N° de OC enlazadas a proyectos del PAC vigente', _n(ind.get('cantidad_enlazadas'))],
        ['Monto total de OC del año', _money(ind.get('total_oc'))],
        ['Monto enlazado a proyectos del PAC vigente', _money(ind.get('monto_enlazado_pac'))],
        ['% Compras dentro del PAC (Ind.1, por monto)', f"{ind['i1']:.1f}%" if ind.get('i1') is not None else '—'],
    ]
    if ind.get('i1_cualquier_pac') is not None:
        filas_resumen.append([
            'Observación: % con cualquier proyecto PAC (incluye PAC de años anteriores)',
            f"{ind['i1_cualquier_pac']:.1f}% ({_money(ind['monto_enlazado_cualquier_pac'])})",
        ])
    secciones.append(Seccion(
        titulo='Resumen Ejecutivo — Indicador 1',
        parrafo=_parrafo_resumen_ejecutivo(datos),
        graficos=[Grafico(_grafico_donut_enlace(ind.get('i1')), 'Gráfico 1 — Distribución del monto de OC enlazada a proyectos del PAC vigente vs el resto (Indicador 1).', ancho_word=2.8, ancho_pdf=(2.8, 2.8), ancho_ppt=3.4)],
        tabla=Tabla(encabezados=['Indicador', 'Valor'], filas=filas_resumen),
        nota=_nota_cualquier_pac(datos),
    ))

    secciones.append(Seccion(
        titulo=f'Evolución Mensual: Enlazada vs No Enlazada — Monto ({anio})',
        parrafo=_TEXTO_BASE_SERIES,
        graficos=[Grafico(_grafico_evolucion_mensual(oc['evolucion_enlace'], anio), f'Gráfico 2 — Monto mensual de OC Enlazada (a cualquier proyecto PAC) vs No Enlazada, {anio}.')],
    ))

    secciones.append(Seccion(
        titulo=f'Evolución Mensual: Enlazada vs No Enlazada — N° de OC ({anio})',
        nivel=2,
        parrafo='Mismo período que el gráfico anterior, ahora por cantidad de Órdenes de Compra en vez de monto.',
        graficos=[Grafico(_grafico_evolucion_mensual_cantidad(oc['evolucion_enlace'], anio), f'Gráfico 3 — N° de OC Enlazada vs No Enlazada por mes, {anio}.')],
    ))

    secciones.append(Seccion(
        titulo=f'Comparativo Trimestral ({anio})',
        nivel=2,
        graficos=[Grafico(_grafico_trimestral(oc['evolucion_enlace'], anio), f'Gráfico 4 — Monto trimestral de OC Enlazada vs No Enlazada, {anio}.', ancho_word=4.4, ancho_pdf=(4.4, 3.2), ancho_ppt=6)],
    ))

    # Serie anual acotada a los años con proyectos PAC enlazables (antes de eso un 0% es falta de
    # dato, no incumplimiento: se omite y se explica en la nota).
    hist = _historico_visible(datos)
    primer = datos['primer_anio_enlace']
    nota_anios = (
        f'Se muestran los años desde {primer}: antes de ese año el sistema no tiene proyectos PAC contra los '
        f'cuales enlazar OC, por lo que un 0% no equivale a incumplimiento sino a ausencia de dato.'
        if primer is not None else None
    )
    secciones.append(Seccion(
        titulo='Comparativo Anual — % Enlace PAC (histórico institucional)',
        parrafo=(
            'La siguiente serie muestra la evolución del % del monto de OC enlazado a CUALQUIER proyecto PAC en todos '
            'los años con enlace posible, independiente del año seleccionado para el resto del informe (es el mismo '
            'criterio de los gráficos mensuales, por eso 2026 aparece aquí con el % de la observación y no con el del '
            'Indicador 1). El mismo avance medido por cantidad de OC se presenta en el apartado siguiente.'
        ),
        graficos=[Grafico(_grafico_comparativo_anual(hist), 'Gráfico 5 — % del monto de OC enlazado a cualquier proyecto PAC, por año.', ancho_pdf=(5.6, 2.56))],
        tabla=Tabla(
            encabezados=['Año', 'OC Enlazadas / Total', 'Monto Enlazado', 'Monto No Enlazado', '% Enlace (monto)'],
            filas=[
                [str(r['anio']), f"{_n(r['enlazadas'])} / {_n(r['total_oc'])}", _money(r['monto_enlazado']),
                 _money(r['monto_no_enlazado']), f"{r['pct_enlace_monto']:.1f}%"]
                for r in hist
            ],
        ),
        nota=nota_anios,
    ))

    anio_en_curso = datos['hoy'].year
    if hist:
        secciones.append(Seccion(
            titulo='Comparativo Anual — % Enlace PAC por cantidad de OC',
            nivel=2,
            parrafo=_parrafo_avance_cantidad(hist),
            graficos=[Grafico(
                _grafico_comparativo_anual_pct_cantidad(hist),
                'Gráfico 6 — % de las OC enlazadas a cualquier proyecto PAC (por cantidad de OC), por año.',
                ancho_pdf=(5.6, 2.56), ancho_ppt=8.0,
            )],
            tabla=_tabla_avance_cantidad(hist, anio_en_curso),
            nota=_nota_avance_cantidad(hist, anio_en_curso),
        ))

    secciones.append(Seccion(
        titulo='Comparativo Anual — N° de OC Enlazadas vs No Enlazadas',
        nivel=2,
        parrafo='Las mismas cantidades de OC de la tabla anterior, mostradas como barras: cuántas OC se enlazaron y cuántas no en cada año.',
        graficos=[Grafico(_grafico_comparativo_anual_cantidad(hist), 'Gráfico 7 — N° de OC Enlazada vs No Enlazada por año.')],
    ))

    # Serie mensual multi-año, en sus DOS medidas (por monto y por cantidad de OC) y con el mismo color por año.
    mensual = oc['historico_enlace_mensual']
    mes_en_curso = _mes_en_curso_visible(mensual, anio, primer, datos['hoy'])
    nota_mes_en_curso = (
        f'El último punto de {mes_en_curso[0]} corresponde a {MESES_ES[mes_en_curso[1]]}, mes aún en curso: su % es parcial y '
        f'se dibuja con marcador hueco y línea punteada para no leerlo como una caída.'
        if mes_en_curso else None
    )
    secciones.append(Seccion(
        titulo='% Enlace Mensual — Comparativo con Años Anteriores (por monto)',
        parrafo=(
            f'Serie mensual del % del MONTO de OC enlazado a cualquier proyecto PAC, de hasta 5 años que terminan en {anio}; '
            f'la línea de {anio} se resalta para ubicar el año en análisis dentro de la tendencia histórica. Cada año '
            f'conserva el mismo color en el gráfico por cantidad de OC que sigue.'
        ),
        graficos=[Grafico(
            _grafico_mensual_monto(mensual, anio, primer, mes_en_curso),
            'Gráfico 8 — % del monto enlazado a cualquier proyecto PAC por mes, comparado entre años.',
            ancho_pdf=(5.6, 2.8), ancho_ppt=7.6,
        )],
        nota=nota_mes_en_curso,
    ))

    secciones.append(Seccion(
        titulo='% Enlace Mensual — Comparativo con Años Anteriores (por cantidad de OC)',
        nivel=2,
        parrafo=(
            'Misma serie medida por CANTIDAD de OC: qué % de las OC de cada mes se enlazó a un proyecto PAC. Un mes puede verse '
            'distinto en este gráfico y en el de monto porque en el monto pesan mucho más las OC de gran valor, mientras que en '
            'la cantidad cada OC cuenta lo mismo. Los años tienen los mismos colores que en el gráfico por monto.'
        ),
        graficos=[Grafico(
            _grafico_mensual_cantidad(mensual, anio, primer, mes_en_curso),
            'Gráfico 9 — % de las OC enlazadas a cualquier proyecto PAC (por cantidad de OC) por mes, comparado entre años.',
            ancho_pdf=(5.6, 2.8), ancho_ppt=7.6,
        )],
        nota=nota_mes_en_curso,
    ))

    tipo_oc_filas = oc['no_enlazadas_tipo_oc'][:12]
    secciones.append(Seccion(
        titulo=f'Órdenes de Compra Fuera del PAC — Detalle por Tipo ({anio})',
        parrafo='Detalle de las OC que no quedaron enlazadas al PAC durante el período, agrupadas por tipo de compra — base para priorizar la revisión y corrección manual.',
        graficos=[Grafico(_grafico_tipo_oc_fuera_pac(oc['no_enlazadas_tipo_oc']), 'Gráfico 10 — N° de OC fuera del PAC por tipo.', ancho_word=5.2, ancho_pdf=(5.2, 3.4), ancho_ppt=7.5)],
        tabla=Tabla(
            encabezados=['Tipo OC', 'Cantidad', 'Monto Neto'],
            filas=[[f['tipo_oc'], _n(f['cantidad']), _money(f['monto'])] for f in tipo_oc_filas],
        ),
    ))

    matriz = oc['matriz_tipo_oc_interno']
    insight = matriz.get('insight')
    if matriz['filas'] and matriz['columnas']:
        parrafo_matriz = (
            'Cruce entre el tipo de OC y el tipo interno de clasificación, solo para las OC fuera del PAC — '
            'ayuda a identificar en qué combinación se concentran las oportunidades de corrección.'
        )
        if insight:
            parrafo_matriz += (
                f" El cruce con mayor concentración es {insight['tipo_oc']} × {insight['tipo_interno']}, con "
                f"{_n(insight['cantidad'])} OC ({insight['pct_del_total']}% del total fuera del PAC analizado en "
                f"esta matriz) — es el punto de mayor impacto para priorizar revisión y posible enlace manual."
            )
        secciones.append(Seccion(
            titulo=f'Matriz Cruzada: Tipo OC × Tipo Interno ({anio})',
            nivel=2,
            parrafo=parrafo_matriz,
            tabla=Tabla(
                encabezados=['Tipo OC'] + matriz['columnas'] + ['Total'],
                filas=[
                    [fila] + [_n(matriz['datos'].get(fila, {}).get(col, 0)) for col in matriz['columnas']]
                    + [_n(sum(matriz['datos'].get(fila, {}).values()))]
                    for fila in matriz['filas']
                ],
            ),
        ))

    if corregidas.get('oc_unicas_corregidas', 0) > 0:
        secciones.append(Seccion(
            titulo='Corregidas — Revisiones Manuales de Enlace PAC',
            nivel=2,
            parrafo=(
                f"{_n(corregidas['oc_unicas_corregidas'])} OC fueron revisadas y enlazadas manualmente al PAC "
                f"(de {_n(corregidas['total_revisiones'])} revisiones registradas en el sistema). "
                f"Es un acumulado histórico institucional: no se filtra por el año {anio} del informe."
            ),
            tabla=Tabla(
                encabezados=['Concepto', 'Cantidad'],
                filas=[
                    ['Revisiones registradas', _n(corregidas['total_revisiones'])],
                    ['OC únicas corregidas', _n(corregidas['oc_unicas_corregidas'])],
                    ['Ya sincronizadas por el ETL', _n(corregidas['sincronizadas'])],
                    ['Esperando próxima sincronización', _n(corregidas['esperando_sync'])],
                ],
            ),
        ))

    secciones.append(Seccion(
        titulo='Conclusiones y Recomendaciones',
        parrafo=_parrafo_conclusiones(datos),
    ))

    return secciones


# =============================================================================
# Word (python-docx)
# =============================================================================

def _portada_ind1_docx(doc, anio, hoy):
    logo = _logo_bytes()
    if logo:
        p_logo = doc.add_paragraph()
        p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_logo.add_run().add_picture(logo, width=Inches(1.5))

    doc.add_paragraph()
    titulo = doc.add_paragraph()
    titulo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_t = titulo.add_run(TITULO_INFORME_IND1)
    run_t.font.size = Pt(22)
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
    run_m = meta.add_run(f'Año PAC (Plan Anual de Compras): {anio}\nGenerado el {hoy.strftime("%d-%m-%Y")}')
    run_m.font.size = Pt(11.5)
    run_m.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    doc.add_page_break()


def _indice_ind1_docx(doc):
    h = doc.add_heading('Índice', level=1)
    for run in h.runs:
        run.font.color.rgb = RGBColor(0x1e, 0x3a, 0x5f)
    p_ayuda = doc.add_paragraph()
    run_ayuda = p_ayuda.add_run('(el índice se actualiza automáticamente al abrir el documento; si no se ve, haga clic derecho sobre él y seleccione "Actualizar campos")')
    run_ayuda.font.size = Pt(9)
    run_ayuda.italic = True
    run_ayuda.font.color.rgb = RGBColor(0x94, 0xa3, 0xb8)
    p_toc = doc.add_paragraph()
    _agregar_campo_docx(p_toc, 'TOC \\o "1-2" \\h \\z \\u')
    doc.add_page_break()


def _pie_pagina_ind1_docx(doc):
    section = doc.sections[0]
    footer = section.footer
    footer.is_linked_to_previous = True
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    color_pie = RGBColor(0x94, 0xa3, 0xb8)
    run1 = p.add_run(f'{NOMBRE_INSTITUCION} · Indicador 1 Res.188/2026 · Página ')
    run1.font.size = Pt(8)
    run1.font.color.rgb = color_pie
    _agregar_campo_docx(p, 'PAGE')
    run2 = p.add_run(' de ')
    run2.font.size = Pt(8)
    run2.font.color.rgb = color_pie
    _agregar_campo_docx(p, 'NUMPAGES')


def _tabla_docx(doc, tabla: Tabla):
    n_cols = len(tabla.encabezados)
    t = doc.add_table(rows=1, cols=n_cols)
    t.style = 'Light Grid Accent 1'
    for i, h in enumerate(tabla.encabezados):
        t.rows[0].cells[i].text = str(h)
    for fila in tabla.filas:
        celdas = t.add_row().cells
        for i, val in enumerate(fila):
            celdas[i].text = str(val)
    if tabla.anchos_word:
        for i, ancho in enumerate(tabla.anchos_word):
            for row in t.rows:
                row.cells[i].width = Inches(ancho)


def _render_seccion_docx(doc, s: Seccion):
    if s.nivel == 1:
        _titulo_capitulo_docx(doc, s.titulo)
    else:
        _titulo_seccion_docx(doc, s.titulo)
    if s.parrafo:
        doc.add_paragraph(s.parrafo)
    for g in s.graficos:
        if not g.imagen:
            continue
        doc.add_picture(g.imagen, width=Inches(g.ancho_word))
        cap = doc.add_paragraph()
        run = cap.add_run(g.caption)
        run.italic = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x94, 0xa3, 0xb8)
    if s.tabla:
        _tabla_docx(doc, s.tabla)
        doc.add_paragraph()
    if s.nota:
        p = doc.add_paragraph()
        run = p.add_run(s.nota)
        run.italic = True
        run.font.size = Pt(9.5)


def generar_informe_word_ind1(anio):
    """Genera el informe Word del Indicador 1 (% Compras dentro del PAC). Retorna BytesIO."""
    datos = _construir_datos(anio)
    secciones = _construir_secciones(datos)

    doc = Document()
    _configurar_margenes_docx(doc)
    _portada_ind1_docx(doc, anio, datos['hoy'])
    _indice_ind1_docx(doc)
    for s in secciones:
        _render_seccion_docx(doc, s)
    _pie_pagina_ind1_docx(doc)
    _forzar_actualizacion_campos_docx(doc)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


# =============================================================================
# PDF (reportlab)
# =============================================================================

class _InformeInd1DocTemplate(BaseDocTemplate):
    """Mismo patrón que `_InformeDocTemplate` de services_reportes.py (pie de
    página + registro de entradas de índice vía `notify('TOCEntry', ...)`),
    con texto de pie propio — por eso no se reutiliza la clase original."""

    def __init__(self, *args, **kwargs):
        BaseDocTemplate.__init__(self, *args, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='normal')
        self.addPageTemplates([PageTemplate(id='con_pie', frames=[frame], onPage=self._dibujar_pie)])

    def _dibujar_pie(self, canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(colors.HexColor('#94a3b8'))
        canvas.drawCentredString(doc.pagesize[0] / 2, 0.45 * inch, f'{NOMBRE_INSTITUCION} · Indicador 1 Res.188/2026 · Página {doc.page}')
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            estilo = flowable.style.name
            texto = flowable.getPlainText()
            if estilo == 'TituloCapitulo':
                self.notify('TOCEntry', (0, texto, self.page))
            elif estilo == 'TituloSeccion':
                self.notify('TOCEntry', (1, texto, self.page))


def _portada_ind1_pdf(story, anio, hoy):
    logo = _pdf_imagen(_logo_bytes(), 1.3, 1.3)
    if logo:
        story.append(logo)
    story.append(Spacer(1, 0.25 * inch))
    story.append(Paragraph(TITULO_INFORME_IND1, _PDF_ESTILOS['TituloPortada']))
    story.append(Paragraph(NOMBRE_INSTITUCION.upper(), _PDF_ESTILOS['SubportadaFuerte']))
    edificio = _pdf_imagen(_edificio_bytes(), 5.3, 3.48)
    if edificio:
        story.append(Spacer(1, 0.2 * inch))
        story.append(edificio)
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(f'Año PAC (Plan Anual de Compras): {anio}<br/>Generado el {hoy.strftime("%d-%m-%Y")}', _PDF_ESTILOS['Subportada']))
    story.append(PageBreak())


def _indice_ind1_pdf(story):
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name='TOCCapitulo', fontSize=11, leading=16, textColor=colors.HexColor(COLOR_INSTITUCIONAL), spaceBefore=4),
        ParagraphStyle(name='TOCSeccion', fontSize=9.5, leading=13, leftIndent=16, textColor=colors.HexColor('#475569')),
    ]
    story.append(Paragraph('Índice', _PDF_ESTILOS['TituloCapitulo']))
    story.append(toc)
    story.append(PageBreak())


def _tabla_pdf(tabla: Tabla):
    filas = [_fila_encabezado(tabla.encabezados)] + [[_celda(v) for v in fila] for fila in tabla.filas]
    n_cols = len(tabla.encabezados)
    ancho_disponible = 6.3
    anchos = tabla.anchos_pdf or [ancho_disponible / n_cols] * n_cols
    t = Table(filas, colWidths=[a * inch for a in anchos], repeatRows=1)
    t.setStyle(_PDF_TABLA_ESTILO)
    return t


def _render_seccion_pdf(story, s: Seccion):
    story.append(Paragraph(s.titulo, _PDF_ESTILOS['TituloCapitulo' if s.nivel == 1 else 'TituloSeccion']))
    if s.parrafo:
        story.append(Paragraph(s.parrafo, _PDF_ESTILOS['Cuerpo']))
    for g in s.graficos:
        img = _pdf_imagen(g.imagen, *g.ancho_pdf)
        if img:
            story.append(img)
            story.append(Paragraph(g.caption, _PDF_ESTILOS['Leyenda']))
    if s.tabla:
        story.append(_tabla_pdf(s.tabla))
        story.append(Spacer(1, 0.15 * inch))
    if s.nota:
        story.append(Paragraph(s.nota, _PDF_ESTILOS['Metadato']))
    story.append(Spacer(1, 0.1 * inch))


def generar_reporte_pdf_ind1(anio):
    """Genera el informe PDF del Indicador 1. Retorna BytesIO. Misma estructura que `generar_informe_word_ind1`."""
    datos = _construir_datos(anio)
    secciones = _construir_secciones(datos)

    buf = io.BytesIO()
    doc = _InformeInd1DocTemplate(buf, pagesize=letter, topMargin=0.9 * inch, bottomMargin=0.85 * inch, leftMargin=0.95 * inch, rightMargin=0.75 * inch)
    story = []
    _portada_ind1_pdf(story, anio, datos['hoy'])
    _indice_ind1_pdf(story)
    for s in secciones:
        _render_seccion_pdf(story, s)

    doc.multiBuild(story)
    buf.seek(0)
    return buf


# =============================================================================
# PPT (python-pptx) — versión ejecutiva, un slide por sección
# =============================================================================

LIMITE_FILAS_TABLA_PPT = 10   # 10 filas + encabezado + aviso caben en la diapositiva (11 pt, 0.4" por fila)


def _ppt_tabla_generica(slide, tabla: Tabla, top, limite=LIMITE_FILAS_TABLA_PPT, nota=None):
    """Tabla + (opcional) nota debajo. Si hay más filas que `limite` se muestran las ÚLTIMAS
    (en las series por año son las más recientes y relevantes — antes se cortaban las últimas
    y quedaban 2014-2022 sin 2023-2026) y se avisa explícitamente en la diapositiva."""
    filas_datos = tabla.filas[-limite:] if len(tabla.filas) > limite else tabla.filas
    omitidas = len(tabla.filas) - len(filas_datos)
    n_filas = len(filas_datos) + 1
    n_cols = len(tabla.encabezados)
    tabla_shape = slide.shapes.add_table(n_filas, n_cols, PptxInches(PPT_MARGEN), top, PptxInches(PPT_ANCHO_CONTENIDO), PptxInches(0.4 * n_filas))
    t = tabla_shape.table
    for i, h in enumerate(tabla.encabezados):
        t.cell(0, i).text = str(h)
    for r, fila in enumerate(filas_datos, start=1):
        for c, val in enumerate(fila):
            t.cell(r, c).text = str(val)
    _ppt_estilizar_tabla(t, tamano_fuente=11)

    # Las celdas con texto largo hacen crecer la fila al renderizar: estimar el alto real para
    # que la nota/aviso de abajo no se superponga con la tabla (~9 caracteres por pulgada a 11 pt).
    ancho_col = PPT_ANCHO_CONTENIDO / n_cols
    alto_tabla = 0.4
    for fila in filas_datos:
        lineas = max((-(-len(str(v)) // max(1, int(ancho_col * 9))) for v in fila), default=1)
        alto_tabla += 0.4 + 0.2 * (max(lineas, 1) - 1)
    top_texto = top + PptxInches(alto_tabla + 0.15)
    if omitidas:
        _ppt_parrafo(
            slide, f'Se muestran las últimas {len(filas_datos)} de {len(tabla.filas)} filas — el detalle completo está en el informe Word/PDF.',
            top_texto, tamano=11, height=PptxInches(0.4),
        )
        top_texto += PptxInches(0.45)
    if nota:
        _ppt_parrafo(slide, nota, top_texto, tamano=12, height=PptxInches(1.2))


def _render_seccion_ppt(prs, s: Seccion):
    slide = _ppt_slide_en_blanco(prs)
    _ppt_titulo(slide, s.titulo, tamano=22 if s.nivel == 1 else 19)
    top = PptxInches(1.1)
    if s.parrafo:
        # ~125 caracteres por línea a 13 pt en 12.3": el gráfico/tabla baja lo necesario para no pisar un texto largo.
        lineas = -(-len(s.parrafo) // 125)
        alto_texto = max(0.9, 0.27 * lineas + 0.1)
        _ppt_parrafo(slide, s.parrafo, top, height=PptxInches(alto_texto), tamano=13)
        top = PptxInches(max(1.85, 1.1 + alto_texto + 0.05))
    if s.graficos and s.graficos[0].imagen:
        g = s.graficos[0]
        _ppt_imagen(slide, g.imagen, PptxInches((PPT_ANCHO - g.ancho_ppt) / 2), top, PptxInches(g.ancho_ppt))
        if s.nota and not s.tabla:
            # Sección solo-gráfico con nota (p. ej. aviso de "mes en curso"): va justo debajo de la imagen. Antes se
            # perdía en el PPT porque la nota solo se dibujaba en secciones sin gráfico.
            ancho_px, alto_px = PILImage.open(g.imagen).size
            g.imagen.seek(0)
            _ppt_parrafo(
                slide, s.nota, top + PptxInches(g.ancho_ppt * alto_px / ancho_px + 0.1), tamano=11, height=PptxInches(0.6),
            )
    elif s.tabla:
        # Sección solo-tabla: la nota va en la misma diapositiva, debajo de la tabla.
        _ppt_tabla_generica(slide, s.tabla, top, nota=s.nota)
    elif s.nota:
        _ppt_parrafo(slide, s.nota, top, tamano=13, height=PptxInches(1.5))
    _ppt_pie_pagina(slide)
    return slide


def generar_presentacion_ppt_ind1(anio):
    """Genera la presentación PPT del Indicador 1 — un slide por sección (versión
    ejecutiva), con el mismo lenguaje visual que `generar_presentacion_ppt`
    (Cumplimiento Interno PAC) vía los helpers compartidos de `services_reportes`.
    Retorna BytesIO."""
    datos = _construir_datos(anio)
    secciones = _construir_secciones(datos)

    prs = Presentation()
    prs.slide_width = PptxInches(PPT_ANCHO)
    prs.slide_height = PptxInches(PPT_ALTO)

    _ppt_portada(
        prs,
        badge_texto='INDICADOR RES.188/2026',
        titulo_lineas=['Informe de Gestión PAC', 'Indicador 1: % Compras dentro del PAC'],
        subtitulo_inst=NOMBRE_INSTITUCION.upper(),
        meta_texto=f'Año PAC: {anio} · Generado el {datos["hoy"].strftime("%d-%m-%Y")}',
        logo_bytes=_logo_bytes(), imagen_bytes=_edificio_bytes(),
    )

    numero_seccion = 0
    for s in secciones:
        if s.nivel == 1:
            numero_seccion += 1
            _ppt_divisor_seccion(prs, f'{numero_seccion:02d}', [s.titulo])
        _render_seccion_ppt(prs, s)
        if s.tabla and s.graficos and s.graficos[0].imagen:
            # Sección con gráfico Y tabla: la tabla va en un segundo slide (versión ejecutiva no las mezcla).
            slide2 = _ppt_slide_en_blanco(prs)
            _ppt_titulo(slide2, s.titulo + ' — Detalle', tamano=19)
            _ppt_tabla_generica(slide2, s.tabla, PptxInches(1.1), nota=s.nota)
            _ppt_pie_pagina(slide2)

    _ppt_numerar_diapositivas(prs)

    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)
    return buf
