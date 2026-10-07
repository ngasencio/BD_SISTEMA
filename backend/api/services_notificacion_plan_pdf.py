"""PDF de cierre de un lote de notificaciones del Plan de Compras: a quién se le avisó, por qué
planes y con qué resultado. Se adjunta al correo resumen y también se descarga desde el módulo."""
import io
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import NotificacionPlanLote

_AZUL = colors.HexColor('#1b5fa6')
_GRIS = colors.HexColor('#6b7686')
_LINEA = colors.HexColor('#dbe1ea')
_ESTADO = {'ENVIADO': ('Enviado', '#1a7f37'), 'ERROR': ('Error', '#b4232f'), 'PENDIENTE': ('Pendiente', '#9a6700')}

_base = getSampleStyleSheet()
_E = {
    'titulo': ParagraphStyle('t', parent=_base['Title'], fontSize=17, textColor=_AZUL, alignment=0, spaceAfter=2),
    'sub': ParagraphStyle('s', parent=_base['Normal'], fontSize=9.5, textColor=_GRIS),
    'h2': ParagraphStyle('h2', parent=_base['Heading2'], fontSize=12, textColor=_AZUL, spaceBefore=12, spaceAfter=4),
    'celda': ParagraphStyle('c', parent=_base['Normal'], fontSize=8, leading=10),
    'celda_der': ParagraphStyle('cd', parent=_base['Normal'], fontSize=8, leading=10, alignment=2),
    'cab': ParagraphStyle('ch', parent=_base['Normal'], fontSize=8, leading=10, textColor=colors.white,
                          fontName='Helvetica-Bold'),
    'plan': ParagraphStyle('p', parent=_base['Normal'], fontSize=7.5, leading=9.5, textColor=colors.HexColor('#374151')),
    'prueba': ParagraphStyle('pr', parent=_base['Normal'], fontSize=9, textColor=colors.HexColor('#7a5200'),
                             backColor=colors.HexColor('#fff4d6'), borderPadding=6, leading=12),
}


def _p(texto, estilo='celda'):
    from xml.sax.saxutils import escape
    return Paragraph(escape(str(texto if texto not in (None, '') else '—')).replace('\n', '<br/>'), _E[estilo])


def _clp(n) -> str:
    return '$' + f'{int(n or 0):,}'.replace(',', '.')


def generar_pdf_lote(lote_id) -> bytes:
    """Devuelve el PDF del lote. Lanza NotificacionPlanLote.DoesNotExist si no existe."""
    lote = NotificacionPlanLote.objects.select_related('creado_por').get(pk=lote_id)
    envios = list(lote.envios.prefetch_related('items').order_by('nombre_responsable'))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(letter), leftMargin=1.3 * cm, rightMargin=1.3 * cm,
        topMargin=1.2 * cm, bottomMargin=1.2 * cm,
        title=f'Notificaciones del Plan de Compras — Lote {lote.pk}', author='Servicio de Salud Osorno')
    h = []

    logo = Path(__file__).resolve().parent / 'assets' / 'logo_correo.png'
    cab = [[Image(str(logo), width=1.7 * cm, height=1.54 * cm) if logo.exists() else '',
            [Paragraph('Notificaciones del Plan de Compras', _E['titulo']),
             Paragraph(f'Servicio de Salud Osorno · Abastecimiento — Lote N° {lote.pk} · '
                       f'{lote.creado_en.astimezone().strftime("%d/%m/%Y %H:%M")}', _E['sub'])]]]
    t = Table(cab, colWidths=[2.2 * cm, None])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LINEBELOW', (0, 0), (-1, 0), 1.5, _AZUL),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    h += [t, Spacer(1, 6)]

    if lote.modo_prueba:
        h += [Paragraph('<b>ENVÍO DE PRUEBA</b> — los correos se enviaron únicamente al destinatario de prueba; '
                        'las columnas "Correo del responsable" muestran a quién habrían llegado en producción.',
                        _E['prueba']), Spacer(1, 6)]

    por_envio = sum(e.n_planes for e in envios)
    monto = sum(int(e.monto_total) for e in envios)
    enviados = sum(1 for e in envios if e.estado == 'ENVIADO')
    fallidos = sum(1 for e in envios if e.estado == 'ERROR')
    quien = (lote.creado_por.get_full_name() or lote.creado_por.email or lote.creado_por.username) \
        if lote.creado_por else '—'
    resumen = [[_p('Responsables notificados', 'celda'), _p('Planes de compra', 'celda'),
                _p('Monto asociado', 'celda'), _p('Correos enviados / con error', 'celda'), _p('Enviado por', 'celda')],
               [Paragraph(f'<b>{len(envios)}</b>', _E['titulo']), Paragraph(f'<b>{por_envio}</b>', _E['titulo']),
                Paragraph(f'<b>{_clp(monto)}</b>', _E['titulo']),
                Paragraph(f'<b>{enviados}</b> / <b>{fallidos}</b>', _E['titulo']), _p(quien)]]
    t = Table(resumen, colWidths=[None] * 5)
    t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, _LINEA), ('INNERGRID', (0, 0), (-1, -1), 0.4, _LINEA),
                           ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5fa')),
                           ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    h += [t, Paragraph('Detalle por responsable', _E['h2'])]

    filas = [[_p(x, 'cab') for x in ('N°', 'Responsable', 'Departamento', 'Correo del responsable',
                                     'Enviado a / Con copia a', 'Planes', 'Monto', 'Estado')]]
    for i, e in enumerate(envios, 1):
        etiqueta, color = _ESTADO.get(e.estado, (e.estado, '#374151'))
        a_quien = e.enviado_a + (f'\nCC: {e.cc.replace(",", ", ")}' if e.cc else '')
        filas.append([
            _p(i), _p(f'{e.nombre_responsable}\n{e.cargo_responsable}'.strip()), _p(e.departamento),
            _p(e.destinatario_real), _p(a_quien), _p(e.n_planes, 'celda_der'), _p(_clp(e.monto_total), 'celda_der'),
            Paragraph(f'<font color="{color}"><b>{etiqueta}</b></font>' + (
                f'<br/><font size="6.5">{_e(e.error)}</font>' if e.error else ''), _E['celda'])])
    t = Table(filas, repeatRows=1, colWidths=[0.9 * cm, 4.4 * cm, 4.2 * cm, 4.5 * cm, 5.2 * cm, 1.6 * cm, 2.3 * cm, 2.2 * cm])
    estilo = [('BACKGROUND', (0, 0), (-1, 0), _AZUL), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
              ('LINEBELOW', (0, 0), (-1, -1), 0.3, _LINEA), ('TOPPADDING', (0, 0), (-1, -1), 3),
              ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
    for r in range(2, len(filas), 2):
        estilo.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor('#f6f8fb')))
    t.setStyle(TableStyle(estilo))
    h.append(t)

    h.append(Paragraph('Planes incluidos en cada aviso', _E['h2']))
    for e in envios:
        planes = sorted(e.items.all(), key=lambda it: it.id_proyecto)
        texto = ' · '.join(f'<b>{_e(it.id_proyecto)}</b> {_e(it.nombre_proyecto)}' for it in planes) or '—'
        h += [Paragraph(f'<b>{_e(e.nombre_responsable)}</b> ({e.n_planes})', _E['celda']),
              Paragraph(texto, _E['plan']), Spacer(1, 4)]

    doc.build(h, onFirstPage=_pie, onLaterPages=_pie)
    return buf.getvalue()


def _e(s) -> str:
    from xml.sax.saxutils import escape
    return escape(str(s or ''))


def _pie(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(_GRIS)
    canvas.drawString(1.3 * cm, 0.7 * cm, 'Servicio de Salud Osorno — Departamento de Abastecimiento — Documento generado automáticamente')
    canvas.drawRightString(landscape(letter)[0] - 1.3 * cm, 0.7 * cm, f'Página {doc.page}')
    canvas.restoreState()
