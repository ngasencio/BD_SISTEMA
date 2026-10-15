"""Informe por correo de cada actualización automática (`actualizacion_completa`).

Al terminar una corrida llega UN correo con un bloque por fuente (OC, Panel FSC, Panel PAC,
Compras Ágiles, Licitaciones): estado, rango actualizado, contadores, y las listas de lo nuevo y
de lo que cambió. En el cuerpo van las primeras filas de cada lista; el detalle completo viaja en
un Excel adjunto.

Cómo se calculan los cambios: antes de cada etapa se toma una foto de la tabla (o del conjunto de
tablas) y otra al terminar; la diferencia es lo "nuevo" y lo "cambiado". Es la misma idea del panel
de novedades de los botones del dashboard, y para FSC reutiliza sus helpers (`_snapshot_fsc` /
`_diff_fsc` de views). Nada de esto puede tumbar una actualización: si una foto falla, ese bloque
sale sin listas pero con su resumen.
"""
import html as _html
import io
from dataclasses import dataclass, field
from datetime import date, datetime

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

MAX_FILAS_CORREO = 25    # por lista, en el cuerpo del correo
MAX_FILAS_ADJUNTO = 20000
MAX_TEXTO_CELDA = 90

# Orden del correo (el pedido por el usuario) — no es el de ejecución.
ORDEN_INFORME = ('ordenes_compra', 'formularios', 'formularios_pac', 'compra_agil', 'licitaciones')
TITULOS = {
    'ordenes_compra': 'Órdenes de Compra (OC)',
    'formularios': 'Panel FSC — Formularios de Solicitud de Compra',
    'formularios_pac': 'Panel PAC — Formularios del Plan Anual de Compras',
    'compra_agil': 'Compras Ágiles',
    'licitaciones': 'Licitaciones',
}
ABREVIATURAS = {'ordenes_compra': 'OC', 'formularios': 'FSC', 'formularios_pac': 'PAC',
                'compra_agil': 'CA', 'licitaciones': 'LIC'}

# Bandejas de visación (FSC y PAC comparten códigos); R = rechazado.
ESTADOS = {
    'P': 'Pendiente Firmas', 'FR': 'Revisor Finanzas', 'FA': 'Autorizador Finanzas',
    'ASDA': 'Autorizador Sub Dir. Administrativo', 'ADIR': 'Autorizador Director',
    'AA': 'Autorizador Abastecimiento', 'DC': 'Derivación Compras', 'AC': 'A Comprador',
    'R': 'Rechazado',
}

COLOR_ESTADO = {'OK': '#1a7f37', 'SIN_NOVEDADES': '#57606a', 'ERROR': '#cf222e', 'NO_INCLUIDA': '#8c959f'}
TEXTO_ESTADO = {'OK': 'Actualizado', 'SIN_NOVEDADES': 'Sin novedades', 'ERROR': 'CON ERROR',
                'NO_INCLUIDA': 'No incluida en esta corrida'}


# ─── Utilidades de formato ────────────────────────────────────────────────────

def _clp(valor):
    try:
        return '$ {:,}'.format(round(float(valor))).replace(',', '.')
    except (TypeError, ValueError):
        return '' if valor in (None, '') else str(valor)


def _fecha(valor):
    if valor in (None, ''):
        return ''
    if hasattr(valor, 'strftime'):
        return valor.strftime('%d-%m-%Y')
    return str(valor)[:10]


def _estado(codigo):
    codigo = (codigo or '').strip() if isinstance(codigo, str) else codigo
    return f"{codigo} · {ESTADOS[codigo]}" if codigo in ESTADOS else (codigo or '')


def _texto(valor, maximo=MAX_TEXTO_CELDA):
    s = '' if valor is None else str(valor).replace('\n', ' ').strip()
    return s if len(s) <= maximo else s[:maximo - 1] + '…'


def lista(titulo, columnas, filas, total=None):
    """Una lista del informe. `total` puede ser mayor que len(filas) si la fuente ya la recortó."""
    return {'titulo': titulo, 'columnas': columnas, 'filas': filas,
            'total': len(filas) if total is None else total}


# ─── Fotos antes/después por fuente ───────────────────────────────────────────

_CAMPOS_OC = ('codigo_oc', 'EstadoOC', 'TotalNeto', 'TotalBruto', 'NombreOC', 'P_Nombre', 'C_Unidad',
              'FechaEnvio', 'TipoOC')
_CAMPOS_LI = ('codigo_licitacion', 'Estado', 'Nombre', 'Tipo', 'MontoEstimado', 'FechaCierre', 'C_Unidad',
              'C_NombreOrganismo')
_CAMPOS_CA = ('codigocompraagil', 'estadoglosa', 'nombre', 'unidadcompra', 'presupuestoestimado',
              'montodisponibleclp', 'oc_codigo', 'fechacierre', 'totalofertasrecibidas')
_CAMPOS_PAC = ('folio', 'anho', 'estado', 'departamento', 'nombre_proyecto', 'monto', 'accion_proyecto',
               'fecha_ficha', 'solicitante')


def _resultado(nuevos, cambios, total, resumen, listas):
    return {'nuevos': nuevos, 'cambios': cambios, 'total': total, 'resumen': resumen, 'listas': listas}


def tomar_oc():
    from .models import OrdenCompra
    return {r['codigo_oc']: r for r in OrdenCompra.objects.order_by().values(*_CAMPOS_OC)}


def comparar_oc(antes, despues):
    nuevas = [r for k, r in despues.items() if k not in antes]
    cambiadas = [(r, antes[k]['EstadoOC']) for k, r in despues.items()
                 if k in antes and (antes[k]['EstadoOC'] or '') != (r['EstadoOC'] or '')]
    desaparecidas = [k for k in antes if k not in despues]
    nuevas.sort(key=lambda r: str(r['FechaEnvio'] or ''), reverse=True)
    cambiadas.sort(key=lambda t: t[0]['codigo_oc'])
    resumen = [('OC en la base de datos', len(despues)), ('OC nuevas', len(nuevas)),
               ('OC que cambiaron de estado', len(cambiadas))]
    if desaparecidas:
        resumen.append(('OC que ya no vienen de Mercado Público', len(desaparecidas)))
    listas = [
        lista('OC nuevas', ['Código OC', 'Nombre', 'Proveedor', 'Unidad', 'Tipo', 'Total', 'Estado', 'Fecha envío'],
              [[r['codigo_oc'], _texto(r['NombreOC']), _texto(r['P_Nombre']), _texto(r['C_Unidad']), r['TipoOC'],
                _clp(r['TotalNeto'] or r['TotalBruto']), r['EstadoOC'], _fecha(r['FechaEnvio'])] for r in nuevas]),
        lista('OC con cambio de estado',
              ['Código OC', 'Nombre', 'Proveedor', 'Unidad', 'Total', 'Estado anterior', 'Estado nuevo'],
              [[r['codigo_oc'], _texto(r['NombreOC']), _texto(r['P_Nombre']), _texto(r['C_Unidad']),
                _clp(r['TotalNeto'] or r['TotalBruto']), ant, r['EstadoOC']] for r, ant in cambiadas]),
    ]
    return _resultado(len(nuevas), len(cambiadas), len(despues), resumen, listas)


def tomar_licitaciones():
    from .models import Licitacion
    return {r['codigo_licitacion']: r for r in Licitacion.objects.order_by().values(*_CAMPOS_LI)}


def comparar_licitaciones(antes, despues):
    nuevas = [r for k, r in despues.items() if k not in antes]
    cambiadas = [(r, antes[k]['Estado']) for k, r in despues.items()
                 if k in antes and (antes[k]['Estado'] or '') != (r['Estado'] or '')]
    adjudicadas = [t for t in cambiadas if (t[0]['Estado'] or '').lower().startswith('adjudic')]
    nuevas.sort(key=lambda r: str(r['FechaCierre'] or ''), reverse=True)
    cambiadas.sort(key=lambda t: t[0]['codigo_licitacion'])
    resumen = [('Licitaciones en la base de datos', len(despues)), ('Licitaciones nuevas', len(nuevas)),
               ('Cambiaron de estado', len(cambiadas)), ('De ellas, adjudicadas', len(adjudicadas))]
    listas = [
        lista('Licitaciones nuevas', ['Código', 'Nombre', 'Tipo', 'Unidad', 'Monto estimado', 'Estado', 'Cierre'],
              [[r['codigo_licitacion'], _texto(r['Nombre']), r['Tipo'], _texto(r['C_Unidad']),
                _clp(r['MontoEstimado']), r['Estado'], _fecha(r['FechaCierre'])] for r in nuevas]),
        lista('Licitaciones con cambio de estado',
              ['Código', 'Nombre', 'Unidad', 'Estado anterior', 'Estado nuevo'],
              [[r['codigo_licitacion'], _texto(r['Nombre']), _texto(r['C_Unidad']), ant, r['Estado']]
               for r, ant in cambiadas]),
    ]
    return _resultado(len(nuevas), len(cambiadas), len(despues), resumen, listas)


def tomar_compra_agil():
    from .models import CompraAgilResumen
    return {r['codigocompraagil']: r for r in CompraAgilResumen.objects.order_by().values(*_CAMPOS_CA)}


def comparar_compra_agil(antes, despues):
    nuevas = [r for k, r in despues.items() if k not in antes]
    cambiadas = [(r, antes[k]['estadoglosa']) for k, r in despues.items()
                 if k in antes and (antes[k]['estadoglosa'] or '') != (r['estadoglosa'] or '')]
    con_oc = [r for k, r in despues.items()
              if k in antes and not (antes[k]['oc_codigo'] or '').strip() and (r['oc_codigo'] or '').strip()]
    nuevas.sort(key=lambda r: str(r['fechacierre'] or ''), reverse=True)
    cambiadas.sort(key=lambda t: t[0]['codigocompraagil'])
    resumen = [('Compras ágiles en la base de datos', len(despues)), ('Compras ágiles nuevas', len(nuevas)),
               ('Cambiaron de estado', len(cambiadas)), ('Con OC recién vinculada', len(con_oc))]
    listas = [
        lista('Compras ágiles nuevas',
              ['Código', 'Nombre', 'Unidad', 'Presupuesto', 'Estado', 'Ofertas', 'OC', 'Cierre'],
              [[r['codigocompraagil'], _texto(r['nombre']), _texto(r['unidadcompra']),
                _clp(r['presupuestoestimado'] or r['montodisponibleclp']), r['estadoglosa'],
                r['totalofertasrecibidas'], r['oc_codigo'], _fecha(r['fechacierre'])] for r in nuevas]),
        lista('Compras ágiles con cambio de estado',
              ['Código', 'Nombre', 'Unidad', 'Estado anterior', 'Estado nuevo', 'OC'],
              [[r['codigocompraagil'], _texto(r['nombre']), _texto(r['unidadcompra']), ant, r['estadoglosa'],
                r['oc_codigo']] for r, ant in cambiadas]),
        lista('Compras ágiles con OC recién vinculada', ['Código', 'Nombre', 'Unidad', 'Estado', 'OC'],
              [[r['codigocompraagil'], _texto(r['nombre']), _texto(r['unidadcompra']), r['estadoglosa'],
                r['oc_codigo']] for r in con_oc]),
    ]
    return _resultado(len(nuevas), len(cambiadas), len(despues), resumen, listas)


def tomar_fsc():
    from . import views  # reutiliza las fotos del panel de novedades del botón
    return views._snapshot_fsc()


def comparar_fsc(antes, despues):
    from . import views
    a_fsc, a_der, hoy, dias_fn = antes
    d_fsc, d_der, _, _ = despues
    d = views._diff_fsc(a_fsc, d_fsc, a_der, d_der, hoy, dias_fn)

    def _fila(r, extra=None):
        base_ = [f"{r['folio']}/{r['anho']}", _texto(r['unidad_requirente']), _texto(r.get('usuario_requirente')),
                 _estado(r['estado']), _clp(r['monto_estimado']), _fecha(r['fecha_solicitud'])]
        return base_ if extra is None else base_ + [extra]

    cols = ['Folio/Año', 'Unidad requirente', 'Solicitante', 'Estado', 'Monto estimado', 'Fecha solicitud']
    resumen = [('Formularios FSC en la base de datos', len(d_fsc)), ('FSC nuevos', d['nuevos_count']),
               ('FSC que cambiaron de bandeja', d['cambiaron_estado_count']),
               ('Derivados a comprador (nuevos)', d['derivados_nuevos_count']),
               ('En trámite hace más de 10 días', d['pegados_count'])]
    listas = [
        lista('FSC nuevos', cols, [_fila(r) for r in d['nuevos']], d['nuevos_count']),
        lista('FSC que cambiaron de bandeja', cols + ['Estado anterior'],
              [_fila(r, _estado(r['estado_anterior'])) for r in d['cambiaron_estado']], d['cambiaron_estado_count']),
        lista('Derivados a comprador (nuevos)', cols, [_fila(r) for r in d['derivados_nuevos']],
              d['derivados_nuevos_count']),
        lista('En trámite hace más de 10 días (más antiguos primero)', cols + ['Días'],
              [_fila(r, r['dias']) for r in d['pegados']], d['pegados_count']),
    ]
    return _resultado(d['nuevos_count'], d['cambiaron_estado_count'], len(d_fsc), resumen, listas)


def tomar_pac():
    from .models import FormularioPAC
    return {(r['anho'], r['folio']): r for r in FormularioPAC.objects.order_by().values(*_CAMPOS_PAC)}


def comparar_pac(antes, despues):
    nuevas = [r for k, r in despues.items() if k not in antes]
    cambiadas = [(r, antes[k]['estado']) for k, r in despues.items()
                 if k in antes and (antes[k]['estado'] or '') != (r['estado'] or '')]
    eliminadas = [r for k, r in antes.items() if k not in despues]
    nuevas.sort(key=lambda r: (r['anho'], r['folio']), reverse=True)
    cols = ['Ficha/Año', 'Departamento', 'Acción', 'Proyecto', 'Monto', 'Estado', 'Fecha ficha']

    def _fila(r):
        return [f"{r['folio']}/{r['anho']}", _texto(r['departamento']), r['accion_proyecto'],
                _texto(r['nombre_proyecto']), _clp(r['monto']), _estado(r['estado']), _fecha(r['fecha_ficha'])]

    resumen = [('Fichas PAC en la base de datos', len(despues)), ('Fichas nuevas', len(nuevas)),
               ('Fichas que cambiaron de bandeja', len(cambiadas)), ('Fichas que ya no están', len(eliminadas))]
    listas = [
        lista('Fichas PAC nuevas', cols, [_fila(r) for r in nuevas]),
        lista('Fichas PAC que cambiaron de bandeja', cols + ['Estado anterior'],
              [_fila(r) + [_estado(ant)] for r, ant in cambiadas]),
        lista('Fichas PAC que ya no están en el Panel', cols, [_fila(r) for r in eliminadas]),
    ]
    return _resultado(len(nuevas), len(cambiadas), len(despues), resumen, listas)


# etapa → (tomar foto, comparar)
INSTANTANEAS = {
    'ordenes_compra': (tomar_oc, comparar_oc),
    'licitaciones': (tomar_licitaciones, comparar_licitaciones),
    'formularios': (tomar_fsc, comparar_fsc),
    'formularios_pac': (tomar_pac, comparar_pac),
    'compra_agil': (tomar_compra_agil, comparar_compra_agil),
}


# ─── Construcción del correo ──────────────────────────────────────────────────

@dataclass
class Informe:
    asunto: str
    texto: str
    html: str
    adjuntos: list = field(default_factory=list)  # [(nombre, bytes, mimetype)]


def _duracion(segundos):
    segundos = int(round(segundos or 0))
    m, s = divmod(segundos, 60)
    h, m = divmod(m, 60)
    return f'{h} h {m:02d} min' if h else (f'{m} min {s:02d} s' if m else f'{s} s')


def _por_etapa(resultados):
    return {r.etapa: r for r in resultados}


def _estado_global(resultados):
    if any(r.estado == 'ERROR' for r in resultados):
        return 'CON ERRORES'
    return 'OK'


def _asunto(resultados, contexto):
    por = _por_etapa(resultados)
    partes = []
    for etapa in ORDEN_INFORME:
        r = por.get(etapa)
        if not r:
            continue
        if r.estado == 'ERROR':
            partes.append(f'{ABREVIATURAS[etapa]} ERROR')
        else:
            partes.append(f'{ABREVIATURAS[etapa]} +{r.nuevos or 0}/{r.cambios or 0}')
    hora = contexto['inicio'].strftime('%H:%M')
    return (f"[BD_SISTEMA] Actualización {hora} del {contexto['inicio']:%d-%m-%Y} · "
            f"{_estado_global(resultados)} · {' · '.join(partes)}")


def _filas_html(filas, maximo):
    return filas[:maximo]


# Estilos en un bloque <style>: con estilos en línea en cada celda el HTML pasa de ~170 KB y Gmail
# lo recorta (límite ~100 KB). Outlook/Office 365 respeta selectores de clase.
ESTILOS = (
    '<style>'
    'table.l{border-collapse:collapse;width:100%;margin:4px 0 10px}'
    'table.l th{text-align:left;padding:4px 8px;background:#f6f8fa;border-bottom:1px solid #d0d7de;'
    'font-size:12px;white-space:nowrap}'
    'table.l td{padding:3px 8px;border-bottom:1px solid #eaeef2;font-size:12px;vertical-align:top}'
    'table.r td{padding:5px 8px;border-top:1px solid #eaeef2;font-size:13px}'
    'table.r th{text-align:left;padding:5px 8px;background:#f6f8fa;font-size:13px}'
    '.n{text-align:right}'
    '</style>'
)


def _tabla_html(columnas, filas, maximo=MAX_FILAS_CORREO):
    esc = _html.escape
    cab = ''.join(f'<th>{esc(str(c))}</th>' for c in columnas)
    cuerpo = ''.join(
        '<tr>' + ''.join(f'<td>{esc("" if v is None else str(v))}</td>' for v in fila) + '</tr>'
        for fila in filas[:maximo])
    return f'<table class="l"><thead><tr>{cab}</tr></thead><tbody>{cuerpo}</tbody></table>'


def _bloque_html(etapa, r):
    esc = _html.escape
    titulo = TITULOS[etapa]
    if r is None:
        return (f'<div style="margin:18px 0;padding:10px 14px;border:1px solid #d0d7de;border-radius:6px;'
                f'color:#8c959f"><b>{esc(titulo)}</b> — no se incluye en esta corrida.</div>')
    color = COLOR_ESTADO.get(r.estado, '#57606a')
    partes = [
        f'<div style="margin:18px 0 6px;padding:10px 14px;border-left:5px solid {color};background:#f6f8fa">'
        f'<div style="font-size:15px;font-weight:600">{esc(titulo)}</div>'
        f'<div style="font-size:12px;color:{color};font-weight:600">{esc(TEXTO_ESTADO.get(r.estado, r.estado))}'
        f' · {esc(_duracion(r.segundos))}</div>'
        f'<div style="font-size:12px;color:#57606a;margin-top:2px">{esc(r.rango or "")}</div></div>',
        f'<p style="font-size:13px;margin:6px 0">{esc(r.detalle or "")}</p>',
    ]
    if r.resumen:
        filas = ''.join(
            f'<tr><td style="padding:2px 14px 2px 0;font-size:13px;color:#57606a">{esc(str(k))}</td>'
            f'<td style="padding:2px 0;font-size:13px;font-weight:600;text-align:right">'
            f'{esc(f"{v:,}".replace(",", ".") if isinstance(v, int) else str(v))}</td></tr>' for k, v in r.resumen)
        partes.append(f'<table style="margin:4px 0 8px">{filas}</table>')
    for lst in r.listas:
        if not lst['total']:
            continue
        titulo_l = f"{lst['titulo']} ({lst['total']})"
        partes.append(f'<div style="font-size:13px;font-weight:600;margin-top:8px">{esc(titulo_l)}</div>')
        partes.append(_tabla_html(lst['columnas'], lst['filas']))
        if lst['total'] > MAX_FILAS_CORREO:
            partes.append(f'<div style="font-size:11px;color:#57606a;margin:-6px 0 8px">… y '
                          f'{lst["total"] - MAX_FILAS_CORREO} más; el detalle completo está en el Excel adjunto.'
                          f'</div>')
    for nota in r.notas:
        partes.append(f'<div style="font-size:12px;color:#9a6700;margin:4px 0">⚠ {esc(nota)}</div>')
    return ''.join(partes)


def _resumen_html(resultados):
    esc = _html.escape
    por = _por_etapa(resultados)
    filas = ''
    for etapa in ORDEN_INFORME:
        r = por.get(etapa)
        if r is None:
            filas += (f'<tr><td style="color:#8c959f">{esc(TITULOS[etapa])}</td>'
                      f'<td colspan="4" style="color:#8c959f">no incluida en esta corrida</td></tr>')
            continue
        color = COLOR_ESTADO.get(r.estado, '#57606a')
        num = lambda v: '—' if v is None else f'{v:,}'.replace(',', '.')  # noqa: E731
        filas += (f'<tr><td>{esc(TITULOS[etapa])}</td>'
                  f'<td style="color:{color};font-weight:600">{esc(TEXTO_ESTADO.get(r.estado, r.estado))}</td>'
                  f'<td class="n">{num(r.nuevos)}</td><td class="n">{num(r.cambios)}</td>'
                  f'<td class="n">{num(r.total)}</td></tr>')
    return ('<table class="r" style="border-collapse:collapse;width:100%">'
            '<thead><tr><th>Bloque</th><th>Estado</th><th class="n">Nuevos</th>'
            '<th class="n">Cambios de estado</th><th class="n">Total en BD</th></tr></thead>'
            f'<tbody>{filas}</tbody></table>')


def _texto_plano(resultados, contexto):
    por = _por_etapa(resultados)
    lineas = [f"Actualización automática — {contexto['inicio']:%d-%m-%Y %H:%M} "
              f"(duración {_duracion(contexto['segundos'])}) — {_estado_global(resultados)}",
              contexto.get('ventana', ''), '']
    for etapa in ORDEN_INFORME:
        r = por.get(etapa)
        lineas.append(TITULOS[etapa].upper())
        if r is None:
            lineas += ['  (no incluida en esta corrida)', '']
            continue
        lineas.append(f"  {TEXTO_ESTADO.get(r.estado, r.estado)} — {r.detalle}")
        lineas += [f'  {k}: {v}' for k, v in r.resumen]
        lineas += [f'  AVISO: {n}' for n in r.notas]
        lineas.append('')
    lineas.append('El detalle completo (todas las filas) va en el Excel adjunto.')
    return '\n'.join(lineas)


def _nombre_hoja(prefijo, titulo, usados):
    limpio = ''.join(c for c in f'{prefijo} {titulo}' if c not in '[]:*?/\\')[:31].strip()
    base_, n = limpio, 2
    while limpio in usados:
        limpio = f'{base_[:28]}~{n}'
        n += 1
    usados.add(limpio)
    return limpio


def _excel(resultados, contexto):
    """Excel con una hoja de resumen y una hoja por lista (todas las filas). None si falla."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        return None
    wb = Workbook()
    ws = wb.active
    ws.title = 'Resumen'
    ws.append([f"Actualización automática {contexto['inicio']:%d-%m-%Y %H:%M}", _estado_global(resultados)])
    ws.append([contexto.get('ventana', '')])
    ws.append([])
    ws.append(['Bloque', 'Estado', 'Nuevos', 'Cambios de estado', 'Total en BD', 'Duración', 'Detalle'])
    for c in ws[4]:
        c.font = Font(bold=True)
    por = _por_etapa(resultados)
    usados = {'Resumen'}
    for etapa in ORDEN_INFORME:
        r = por.get(etapa)
        if r is None:
            ws.append([TITULOS[etapa], 'No incluida en esta corrida'])
            continue
        ws.append([TITULOS[etapa], TEXTO_ESTADO.get(r.estado, r.estado), r.nuevos, r.cambios, r.total,
                   _duracion(r.segundos), r.detalle])
        for k, v in r.resumen:
            ws.append(['', k, v])
        for lst in r.listas:
            if not lst['filas']:
                continue
            hoja = wb.create_sheet(_nombre_hoja(ABREVIATURAS[etapa], lst['titulo'], usados))
            hoja.append(lst['columnas'])
            for c in hoja[1]:
                c.font = Font(bold=True)
            for fila in lst['filas'][:MAX_FILAS_ADJUNTO]:
                hoja.append(["" if v is None else v for v in fila])
            hoja.freeze_panes = 'A2'
    ws.column_dimensions['A'].width = 52
    ws.column_dimensions['B'].width = 30
    ws.column_dimensions['G'].width = 90
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def construir_informe(resultados, contexto):
    """resultados: lista de ResultadoEtapa. contexto: {inicio: datetime, segundos, ventana}."""
    esc = _html.escape
    cuerpo = (
        f'{ESTILOS}<div style="font-family:Segoe UI,Arial,sans-serif;max-width:860px;color:#1f2328">'
        f'<h2 style="margin:0 0 4px;font-size:18px">Actualización automática — '
        f'{contexto["inicio"]:%d-%m-%Y %H:%M}</h2>'
        f'<div style="font-size:13px;color:#57606a">Duración: {esc(_duracion(contexto["segundos"]))} · '
        f'Resultado: <b style="color:'
        f'{"#cf222e" if _estado_global(resultados) != "OK" else "#1a7f37"}">{esc(_estado_global(resultados))}'
        f'</b></div>'
        f'<div style="font-size:12px;color:#57606a;margin:2px 0 4px">{esc(contexto.get("ventana", ""))}</div>'
        '<div style="font-size:11px;color:#8c959f;margin:0 0 12px">En el asunto: «+nuevos/cambios de estado» '
        'por bloque.</div>'
        f'{_resumen_html(resultados)}'
    )
    por = _por_etapa(resultados)
    for etapa in ORDEN_INFORME:
        cuerpo += _bloque_html(etapa, por.get(etapa))
    cuerpo += ('<hr style="margin:20px 0;border:none;border-top:1px solid #d0d7de">'
               '<div style="font-size:11px;color:#8c959f">Informe automático de BD_SISTEMA. '
               'Cada tabla del cuerpo muestra las primeras filas; el Excel adjunto trae todas. '
               'Detalle técnico: backend/logs/actualizacion_diaria.log en el PC servidor.</div></div>')
    adjuntos = []
    xlsx = _excel(resultados, contexto)
    if xlsx:
        adjuntos.append((f"actualizacion_{contexto['inicio']:%Y%m%d_%H%M}.xlsx", xlsx,
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
    return Informe(_asunto(resultados, contexto), _texto_plano(resultados, contexto), cuerpo, adjuntos)


def destinatarios_informe():
    return list(getattr(settings, 'SYNC_INFORME_A', None) or [])


def enviar_informe(informe, destinos=None):
    """Envía el informe. Lanza si el SMTP falla (quien llama decide qué hacer)."""
    destinos = destinos or destinatarios_informe()
    if not destinos:
        raise RuntimeError('No hay destinatarios del informe (SYNC_INFORME_A).')
    msg = EmailMultiAlternatives(informe.asunto, informe.texto, None, destinos)
    msg.attach_alternative(informe.html, 'text/html')
    for nombre, datos, mime in informe.adjuntos:
        msg.attach(nombre, datos, mime)
    msg.send(fail_silently=False)
    return destinos


def informe_omitido(contexto, motivo):
    """Aviso corto: la corrida no se ejecutó (había otra en curso)."""
    esc = _html.escape
    asunto = f"[BD_SISTEMA] Actualización {contexto['inicio']:%H:%M} del {contexto['inicio']:%d-%m-%Y} · OMITIDA"
    texto = f'La actualización programada NO se ejecutó: {motivo}\nSe reintenta en el siguiente horario.'
    html_ = ('<div style="font-family:Segoe UI,Arial,sans-serif"><h3>Actualización omitida</h3>'
             f'<p>{esc(motivo)}</p><p>Se reintenta en el siguiente horario programado.</p></div>')
    return Informe(asunto, texto, html_, [])
