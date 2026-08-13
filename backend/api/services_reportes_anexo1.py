"""
Exportar Reporte — Anexo N°1 (Análisis de Ejecución Presupuestaria).

Reemplaza el `doPrint()`/`window.print()` del dashboard original por un PDF
real generado en el servidor (reportlab), siguiendo el patrón ya usado en
`services_reportes_res188.py` para el Indicador 1 de PAC — pero deliberadamente
más simple (SimpleDocTemplate, sin portada/TOC multi-capítulo) porque el
original (`rEx`) era un resumen de una sola vista, no un informe institucional.

Reutiliza los estilos/tabla/celdas ya definidos en `services_reportes.py` para
que el resultado visual sea consistente con el resto del sistema.

v2.0 (2026-08-13): agrega 4 secciones nuevas (tendencias, burn_rate,
deuda_flotante, financiero) reutilizando funciones de cálculo que ya
alimentaban los tabs de React pero no el PDF, más gráficos matplotlib
(mismo patrón `_fig_a_bytes`/`_pdf_imagen` que usan los reportes PAC/Res.188),
inspirado en la riqueza visual del reporte jerárquico de Anexo N°3 — sin
convertirlo en un informe multi-capítulo con TOC.
"""
import io
from datetime import date

import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .services_reportes import (
    NOMBRE_INSTITUCION, COLOR_INSTITUCIONAL, COLOR_DENTRO, COLOR_FUERA, COLOR_PENDIENTE, COLOR_SIN_DATO,
    _PDF_ESTILOS, _PDF_TABLA_ESTILO, _celda, _celda_encabezado, _fila_encabezado, _fig_a_bytes, _pdf_imagen,
)
from .plantillas_narrativas import _money
from .services_anexo1_ejecucion import (
    calcular_anexo1_resumen, calcular_anexo1_semaforo, calcular_anexo1_alertas,
    calcular_anexo1_burn_rate, calcular_anexo1_deuda_flotante, calcular_anexo1_tendencias,
    calcular_anexo1_financiero,
)

TITULO_INFORME = 'Análisis de Ejecución Presupuestaria — Anexo N°1'

COLOR_ESTADO_HEX = {'verde': COLOR_DENTRO, 'amarillo': COLOR_PENDIENTE, 'rojo': COLOR_FUERA}

TODAS_LAS_SECCIONES = {'kpi', 'tabla', 'semaforo', 'alertas', 'tendencias', 'burn_rate', 'deuda_flotante', 'financiero'}


def _pct(v):
    return '—' if v is None else f'{v:.1f}%'


# =============================================================================
# Gráficos matplotlib (Agg) — mismo patrón que services_reportes.py
# =============================================================================

def _grafico_burn_rate(tabla_mensual):
    if not tabla_mensual:
        return None
    meses = [f['mes'][:3] for f in tabla_mensual]
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    ax.plot(meses, [f['acumulado'] for f in tabla_mensual], color=COLOR_INSTITUCIONAL, marker='o', linewidth=2, label='Acumulado real')
    ax.plot(meses, [f['esperado'] for f in tabla_mensual], color=COLOR_SIN_DATO, linestyle='--', linewidth=1.5, label='Ritmo ideal')
    ax.set_title('Acumulado Real vs. Ritmo Ideal', fontsize=11, pad=10)
    ax.spines[['top', 'right']].set_visible(False)
    ax.legend(loc='upper left', fontsize=8, frameon=False)
    ax.tick_params(labelsize=8)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_deuda_flotante(serie_mensual):
    if not serie_mensual:
        return None
    meses = [m['mes'] for m in serie_mensual]
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    ax.plot(meses, [m['devengado'] for m in serie_mensual], color=COLOR_INSTITUCIONAL, marker='o', markersize=3, linewidth=1.8, label='Devengado')
    ax.plot(meses, [m['efectivo'] for m in serie_mensual], color=COLOR_DENTRO, marker='o', markersize=3, linewidth=1.8, label='Efectivo')
    ax.plot(meses, [m['deuda'] for m in serie_mensual], color=COLOR_FUERA, marker='o', markersize=3, linewidth=1.8, label='Deuda Flotante')
    ax.set_title('Devengado · Efectivo · Deuda Flotante por Mes', fontsize=11, pad=10)
    ax.spines[['top', 'right']].set_visible(False)
    ax.legend(loc='upper left', fontsize=8, frameon=False)
    ax.tick_params(labelsize=8)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_tendencias(series_por_anho, anho_base):
    if not series_por_anho:
        return None
    meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    paleta = ['#1e3a5f', '#38b2bd', '#d97706', '#7c3aed', '#dc2626', '#0891b2']
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    for i, (anho, serie) in enumerate(sorted(series_por_anho.items())):
        ancho = 2.4 if int(anho) == anho_base else 1.3
        ax.plot(meses, serie['devengado'], color=paleta[i % len(paleta)], linewidth=ancho, marker='o', markersize=2.5, label=str(anho))
    ax.set_title('Evolución Mensual del Devengado — comparación interanual', fontsize=11, pad=10)
    ax.spines[['top', 'right']].set_visible(False)
    ax.legend(loc='upper left', fontsize=8, frameon=False, ncol=len(series_por_anho))
    ax.tick_params(labelsize=8)
    fig.tight_layout()
    return _fig_a_bytes(fig)


def _grafico_financiero_composicion(k):
    dev = k['total_devengado']
    comp_sin_dev = max(0.0, k['compromiso_financiero'] - dev)
    libre = max(0.0, k['disponibilidad_libre'])
    valores = [dev, comp_sin_dev, libre]
    if not sum(valores):
        return None
    etiquetas = ['Devengado', 'Comprometido sin Devengar', 'Disponible Libre']
    colores = [COLOR_DENTRO, COLOR_PENDIENTE, COLOR_SIN_DATO]
    datos = [(e, v, c) for e, v, c in zip(etiquetas, valores, colores) if v > 0]
    fig, ax = plt.subplots(figsize=(3.8, 3.4))
    ax.pie(
        [d[1] for d in datos], colors=[d[2] for d in datos], startangle=90,
        wedgeprops={'width': 0.35, 'edgecolor': 'white', 'linewidth': 2},
        autopct=lambda p: f'{p:.0f}%' if p > 5 else '',
        pctdistance=0.82,
        textprops={'color': 'white', 'fontweight': 'bold', 'fontsize': 10},
    )
    ax.set_title('Composición de la Ley', fontsize=11, pad=10)
    fig.legend([d[0] for d in datos], loc='lower center', ncol=1, frameon=False, bbox_to_anchor=(0.5, -0.05), fontsize=8)
    return _fig_a_bytes(fig)


def generar_reporte_anexo1_pdf(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None,
                                excluir_34_35=True, secciones=None):
    """secciones: set/list opcional entre TODAS_LAS_SECCIONES — default: todas."""
    secciones = set(secciones) if secciones else set(TODAS_LAS_SECCIONES)

    resumen = calcular_anexo1_resumen(codigo_ue=codigo_ue, anho=anho, mes_desde=mes_desde,
                                       mes_hasta=mes_hasta, excluir_34_35=excluir_34_35)
    semaforo = calcular_anexo1_semaforo(codigo_ue=codigo_ue, anho=anho, excluir_34_35=excluir_34_35) if 'semaforo' in secciones else None
    alertas = calcular_anexo1_alertas(codigo_ue=codigo_ue, anho=anho, mes_desde=mes_desde, mes_hasta=mes_hasta) if 'alertas' in secciones else None
    burn_rate = calcular_anexo1_burn_rate(codigo_ue=codigo_ue, anho=anho, excluir_34_35=excluir_34_35) if 'burn_rate' in secciones else None
    deuda_flotante = calcular_anexo1_deuda_flotante(codigo_ue=codigo_ue, anho=anho, excluir_34_35=excluir_34_35) if 'deuda_flotante' in secciones else None
    tendencias = calcular_anexo1_tendencias(codigo_ue=codigo_ue, anhos=[anho, anho - 1] if anho else None, excluir_34_35=excluir_34_35) if 'tendencias' in secciones else None
    financiero = calcular_anexo1_financiero(codigo_ue=codigo_ue, anho=anho, mes_desde=mes_desde, mes_hasta=mes_hasta, excluir_34_35=excluir_34_35) if 'financiero' in secciones else None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.7 * inch, bottomMargin=0.6 * inch, leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    story = []

    # ── Portada liviana: institución, título, período, fecha de generación ──
    story.append(Paragraph(NOMBRE_INSTITUCION, _PDF_ESTILOS['Metadato']))
    story.append(Paragraph(TITULO_INFORME, _PDF_ESTILOS['TituloCapitulo']))
    establecimiento = 'Consolidado Servicio de Salud Osorno' if not codigo_ue or codigo_ue == 'todas' else f'Establecimiento {codigo_ue}'
    periodo_txt = f'Año {anho or "—"} · Período {mes_desde or 1:02d} a {mes_hasta or 12:02d}'
    story.append(Paragraph(f'{establecimiento} · {periodo_txt}', _PDF_ESTILOS['Metadato']))
    story.append(Paragraph(f'Generado el {date.today().strftime("%d-%m-%Y")}', _PDF_ESTILOS['Metadato']))
    story.append(Spacer(1, 10))

    if 'kpi' in secciones:
        k = resumen['kpis']
        story.append(Paragraph('Resumen Ejecutivo', _PDF_ESTILOS['TituloSeccion']))
        filas_kpi = [
            _fila_encabezado(['Ley de Presupuestos', 'Devengado', 'Efectivo', 'Deuda Flotante', '% Ejecución', '% Pago']),
            [
                _celda(_money(k['ley_presupuestos'])), _celda(_money(k['devengado'])), _celda(_money(k['efectivo'])),
                _celda(_money(k['deuda_flotante'])), _celda(_pct(k['pct_ejecucion'])), _celda(_pct(k['pct_pago'])),
            ],
        ]
        tabla_kpi = Table(filas_kpi, colWidths=[1.2 * inch] * 6, repeatRows=1)
        tabla_kpi.setStyle(_PDF_TABLA_ESTILO)
        story.append(tabla_kpi)
        story.append(Spacer(1, 14))

    if 'tabla' in secciones:
        story.append(Paragraph('Ejecución por Subtítulo', _PDF_ESTILOS['TituloSeccion']))
        filas = [_fila_encabezado(['Subtítulo', 'Ley', 'Devengado', 'Efectivo'])]
        for f in resumen['grafico_barras']:
            filas.append([_celda(f'{f["codigo"]} {f["nombre"]}'), _celda(_money(f['ley'])), _celda(_money(f['devengado'])), _celda(_money(f['efectivo']))])
        tabla = Table(filas, colWidths=[2.8 * inch, 1.3 * inch, 1.3 * inch, 1.3 * inch], repeatRows=1)
        tabla.setStyle(_PDF_TABLA_ESTILO)
        story.append(tabla)
        story.append(Spacer(1, 14))

    if 'semaforo' in secciones and semaforo and semaforo['ultimo_mes_con_datos']:
        story.append(Paragraph(f'Semáforo de Cierre de Año (meses restantes: {semaforo["meses_restantes"]})', _PDF_ESTILOS['TituloSeccion']))
        filas = [_fila_encabezado(['', 'Subtítulo', 'Ley', 'Proyección Dic.', '% Ejec. Proyectada'])]
        for s in semaforo['subtitulos']:
            filas.append([
                _celda('●'), _celda(f'{s["codigo"]} {s["nombre"]}'), _celda(_money(s['ley'])),
                _celda(_money(s['proyeccion_diciembre'])), _celda(_pct(s['pct_ejecucion_proyectado'])),
            ])
        tabla = Table(filas, colWidths=[0.3 * inch, 2.5 * inch, 1.3 * inch, 1.3 * inch, 1.3 * inch], repeatRows=1)
        estilo_comandos = list(_PDF_TABLA_ESTILO.getCommands())
        for i, s in enumerate(semaforo['subtitulos'], start=1):
            estilo_comandos.append(('TEXTCOLOR', (0, i), (0, i), colors.HexColor(COLOR_ESTADO_HEX[s['estado']])))
        tabla.setStyle(TableStyle(estilo_comandos))
        story.append(tabla)
        story.append(Spacer(1, 14))

    if 'burn_rate' in secciones and burn_rate and burn_rate['ultimo_mes_con_datos']:
        story.append(Paragraph('Burn Rate — Ritmo de Ejecución', _PDF_ESTILOS['TituloSeccion']))
        k = burn_rate['kpis']
        filas_kpi = [
            _fila_encabezado(['Gasto Mensual Promedio', 'Desviación vs. Esperado', 'Proyección a Diciembre', '% Ejecución Proyectada']),
            [_celda(_money(k['gasto_mensual_promedio'])), _celda(_pct(k['desviacion_vs_esperado_pct'])),
             _celda(_money(k['proyeccion_diciembre'])), _celda(_pct(k['pct_ejecucion_proyectada']))],
        ]
        tabla_kpi = Table(filas_kpi, colWidths=[1.7 * inch] * 4, repeatRows=1)
        tabla_kpi.setStyle(_PDF_TABLA_ESTILO)
        story.append(tabla_kpi)
        story.append(Spacer(1, 8))
        img = _pdf_imagen(_grafico_burn_rate(burn_rate['tabla_mensual']), 6.0, 2.8)
        if img:
            story.append(img)
        story.append(Spacer(1, 14))

    if 'deuda_flotante' in secciones and deuda_flotante and deuda_flotante['ultimo_mes_con_datos']:
        story.append(Paragraph('Evolución de la Deuda Flotante', _PDF_ESTILOS['TituloSeccion']))
        k = deuda_flotante['kpis']
        filas_kpi = [
            _fila_encabezado(['Deuda Actual', 'Deuda Máxima', 'Mes Deuda Máx.', '% Pago Acumulado']),
            [_celda(_money(k['deuda_actual'])), _celda(_money(k['deuda_maxima'])),
             _celda(k['mes_deuda_maxima']), _celda(_pct(k['pct_pago_acumulado']))],
        ]
        tabla_kpi = Table(filas_kpi, colWidths=[1.7 * inch] * 4, repeatRows=1)
        tabla_kpi.setStyle(_PDF_TABLA_ESTILO)
        story.append(tabla_kpi)
        story.append(Spacer(1, 8))
        img = _pdf_imagen(_grafico_deuda_flotante(deuda_flotante['serie_mensual']), 6.0, 2.8)
        if img:
            story.append(img)
        story.append(Spacer(1, 14))

    if 'tendencias' in secciones and tendencias and tendencias['series_por_anho']:
        story.append(Paragraph('Histórico y Tendencias', _PDF_ESTILOS['TituloSeccion']))
        img = _pdf_imagen(_grafico_tendencias(tendencias['series_por_anho'], tendencias['anho_base']), 6.0, 3.0)
        if img:
            story.append(img)
        story.append(Spacer(1, 14))

    if 'financiero' in secciones and financiero:
        story.append(Paragraph('Análisis Financiero', _PDF_ESTILOS['TituloSeccion']))
        k = financiero['kpis']
        filas_kpi = [
            _fila_encabezado(['Equilibrio Financiero', 'Compromiso Financiero', 'Deuda Flotante', 'Disponibilidad Libre', 'Tasa de Pago']),
            [_celda(_pct(k['equilibrio_financiero_pct'])), _celda(_money(k['compromiso_financiero'])),
             _celda(_money(k['deuda_flotante'])), _celda(_money(k['disponibilidad_libre'])), _celda(_pct(k['tasa_pago_pct']))],
        ]
        tabla_kpi = Table(filas_kpi, colWidths=[1.4 * inch] * 5, repeatRows=1)
        tabla_kpi.setStyle(_PDF_TABLA_ESTILO)
        story.append(tabla_kpi)
        story.append(Spacer(1, 8))
        img = _pdf_imagen(_grafico_financiero_composicion(k), 4.5, 4.0)
        if img:
            story.append(img)
        story.append(Spacer(1, 14))

    if 'alertas' in secciones and alertas:
        story.append(Paragraph(f'Alertas y Anomalías (top 10 de {len(alertas["alertas"])})', _PDF_ESTILOS['TituloSeccion']))
        if alertas['alertas']:
            filas = [_fila_encabezado(['Severidad', 'Concepto', 'Tipo', 'Valor'])]
            for a in alertas['alertas'][:10]:
                filas.append([_celda(a['severidad'].capitalize()), _celda(a['concepto']), _celda(a['tipo']), _celda(_money(a['valor']))])
            tabla = Table(filas, colWidths=[0.9 * inch, 2.3 * inch, 2.1 * inch, 1.1 * inch], repeatRows=1)
            tabla.setStyle(_PDF_TABLA_ESTILO)
            story.append(tabla)
        else:
            story.append(Paragraph('Sin alertas para el período seleccionado.', _PDF_ESTILOS['Cuerpo']))

    doc.build(story)
    buf.seek(0)
    return buf
