"""
Exportar Reporte — Anexo N°1 (Análisis de Ejecución Presupuestaria).

Reemplaza el `doPrint()`/`window.print()` del dashboard original por un PDF
real generado en el servidor (reportlab), siguiendo el patrón ya usado en
`services_reportes_res188.py` para el Indicador 1 de PAC — pero deliberadamente
más simple (SimpleDocTemplate, sin portada/TOC multi-capítulo) porque el
original (`rEx`) era un resumen de una sola vista, no un informe institucional.

Reutiliza los estilos/tabla/celdas ya definidos en `services_reportes.py` para
que el resultado visual sea consistente con el resto del sistema.
"""
import io
from datetime import date

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .services_reportes import (
    NOMBRE_INSTITUCION, COLOR_INSTITUCIONAL, COLOR_DENTRO, COLOR_FUERA, COLOR_PENDIENTE,
    _PDF_ESTILOS, _PDF_TABLA_ESTILO, _celda, _celda_encabezado, _fila_encabezado,
)
from .plantillas_narrativas import _money
from .services_anexo1_ejecucion import (
    calcular_anexo1_resumen, calcular_anexo1_semaforo, calcular_anexo1_alertas,
)

TITULO_INFORME = 'Análisis de Ejecución Presupuestaria — Anexo N°1'

COLOR_ESTADO_HEX = {'verde': COLOR_DENTRO, 'amarillo': COLOR_PENDIENTE, 'rojo': COLOR_FUERA}


def _pct(v):
    return '—' if v is None else f'{v:.1f}%'


def generar_reporte_anexo1_pdf(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None,
                                excluir_34_35=True, secciones=None):
    """secciones: set/list opcional entre {'kpi','tabla','semaforo','alertas'} — default: las 4."""
    secciones = set(secciones) if secciones else {'kpi', 'tabla', 'semaforo', 'alertas'}

    resumen = calcular_anexo1_resumen(codigo_ue=codigo_ue, anho=anho, mes_desde=mes_desde,
                                       mes_hasta=mes_hasta, excluir_34_35=excluir_34_35)
    semaforo = calcular_anexo1_semaforo(codigo_ue=codigo_ue, anho=anho, excluir_34_35=excluir_34_35) if 'semaforo' in secciones else None
    alertas = calcular_anexo1_alertas(codigo_ue=codigo_ue, anho=anho, mes_desde=mes_desde, mes_hasta=mes_hasta) if 'alertas' in secciones else None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.7 * inch, bottomMargin=0.6 * inch, leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    story = []

    story.append(Paragraph(TITULO_INFORME, _PDF_ESTILOS['TituloCapitulo']))
    establecimiento = 'Servicio de Salud Osorno — Consolidado' if not codigo_ue or codigo_ue == 'todas' else f'Establecimiento {codigo_ue}'
    periodo_txt = f'Año {anho or "—"} · Período {mes_desde or 1:02d} a {mes_hasta or 12:02d}'
    story.append(Paragraph(f'{NOMBRE_INSTITUCION} · {establecimiento} · {periodo_txt}', _PDF_ESTILOS['Metadato']))
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
