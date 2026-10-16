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
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

MAX_FILAS_CORREO = 25    # por lista, en el cuerpo del correo
MAX_FILAS_ADJUNTO = 20000
MAX_TEXTO_CELDA = 90
UMBRAL_DIAS_TRAMITE = 10  # un FSC «en trámite hace más de N días» (ni AC ni R)
# Gmail recorta un mensaje cuyo HTML pasa de ~102 KB (y esconde el pie). Si el cuerpo se pasa de este
# límite se reconstruye con menos filas por lista, en este orden (el Excel adjunto siempre trae todas).
LIMITE_HTML_BYTES = 95_000
ESCALA_FILAS_CORREO = (MAX_FILAS_CORREO, 15, 10, 5)

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
    # Mercado Público entrega algunos nombres con entidades HTML ya codificadas («BARRÍA &amp; MEDINA»):
    # se decodifican acá para no mostrarlas literales (el correo vuelve a escapar al dibujar).
    s = '' if valor is None else _html.unescape(str(valor)).replace('\n', ' ').strip()
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
    d = views._diff_fsc(a_fsc, d_fsc, a_der, d_der, hoy, dias_fn, umbral_dias=UMBRAL_DIAS_TRAMITE)

    def _fila(r, extra=None):
        base_ = [f"{r['folio']}/{r['anho']}", _texto(r['unidad_requirente']), _texto(r.get('usuario_requirente')),
                 _estado(r['estado']), _clp(r['monto_estimado']), _fecha(r['fecha_solicitud'])]
        return base_ if extra is None else base_ + [extra]

    cols = ['Folio/Año', 'Unidad requirente', 'Solicitante', 'Estado', 'Monto estimado', 'Fecha solicitud']

    # «En trámite hace más de 10 días»: los MÁS RECIENTES primero (pedido del usuario, 2026-10-16: los más
    # antiguos llegan hasta formularios de 2022 y tapaban lo que hoy se puede gestionar). Se arma desde la
    # foto completa y NO desde `d['pegados']`: `_diff_fsc` la ordena de más antigua a más reciente y la
    # recorta a 200, así que si el atraso crece justo los recientes quedarían fuera del informe.
    pegados = [r for r in d_fsc.values()
               if r['estado'] not in ('AC', 'R') and r['dias'] is not None and r['dias'] > UMBRAL_DIAS_TRAMITE]
    pegados.sort(key=lambda r: (r['dias'], -(r['anho'] or 0), -(r['folio'] or 0)))

    resumen = [('Formularios FSC en la base de datos', len(d_fsc)), ('FSC nuevos', d['nuevos_count']),
               ('FSC que cambiaron de bandeja', d['cambiaron_estado_count']),
               ('Derivados a comprador (nuevos)', d['derivados_nuevos_count']),
               (f'En trámite hace más de {UMBRAL_DIAS_TRAMITE} días', len(pegados))]
    listas = [
        lista('FSC nuevos', cols, [_fila(r) for r in d['nuevos']], d['nuevos_count']),
        lista('FSC que cambiaron de bandeja', cols + ['Estado anterior'],
              [_fila(r, _estado(r['estado_anterior'])) for r in d['cambiaron_estado']], d['cambiaron_estado_count']),
        lista('Derivados a comprador (nuevos)', cols, [_fila(r) for r in d['derivados_nuevos']],
              d['derivados_nuevos_count']),
        lista(f'En trámite hace más de {UMBRAL_DIAS_TRAMITE} días (más recientes primero)', cols + ['Días'],
              [_fila(r, r['dias']) for r in pegados], len(pegados)),
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


def _resumen_corto(resultados):
    """«OC +12/3 · FSC +5/2 · …» (nuevos/cambios de estado por bloque): va en el asunto y como vista
    previa del mensaje en la bandeja de entrada."""
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
    return ' · '.join(partes)


def _asunto(resultados, contexto):
    hora = contexto['inicio'].strftime('%H:%M')
    return (f"[BD_SISTEMA] Actualización {hora} del {contexto['inicio']:%d-%m-%Y} · "
            f"{_estado_global(resultados)} · {_resumen_corto(resultados)}")


# ─── Diseño del correo ────────────────────────────────────────────────────────
#
# Reglas que condicionan el HTML (es un correo, no una página):
#  · Estructura con TABLAS y atributos (`bgcolor`, `width`, `align`): Outlook de escritorio dibuja el correo
#    con el motor de Word y no entiende flex/grid ni gradientes; border-radius lo ignora (cae en cuadrado).
#  · Lo estructural (cabecera, tarjetas) lleva estilo en línea; lo que se repite por fila (cientos de
#    celdas) va en clases de un bloque <style> del <head>: con estilos en línea en cada celda el cuerpo
#    pasaba de 170 KB y Gmail lo recorta a ~102 KB.
#  · El logo viaja incrustado (`cid:logo`, ver `enviar_informe`). Nada se carga desde internet.
#  · Paleta institucional de Notificación del Plan (azul `#1b5fa6` + rojo del logo) y un color por módulo.

AZUL, AZUL_OSCURO, ROJO_LOGO = '#1b5fa6', '#12467f', '#e8404b'
COLOR_MODULO = {
    'ordenes_compra': '#15803d',   # verde (OC)
    'formularios': '#7c3aed',      # púrpura (Formularios)
    'formularios_pac': '#0e7490',  # teal
    'compra_agil': '#0369a1',      # celeste oscuro (contraste con texto blanco)
    'licitaciones': '#1d4ed8',     # azul
}
FUENTE = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

# Clase de la «etiqueta» (pill) por estado de la etapa.
_CLASE_ESTADO = {'OK': 'po', 'SIN_NOVEDADES': 'pn', 'ERROR': 'pb', 'NO_INCLUIDA': 'pn'}

# Columnas que se dibujan distinto (por NOMBRE: las listas ya vienen armadas como texto).
_COLS_NUMERICAS = {'Total', 'Monto estimado', 'Presupuesto', 'Monto', 'Ofertas'}
_COLS_ESTADO = {'Estado', 'Estado anterior', 'Estado nuevo'}
_COLS_SIN_QUIEBRE = {'Fecha envío', 'Fecha solicitud', 'Fecha ficha', 'Cierre', 'Tipo', 'OC', 'Acción'}

# Bandeja que cierra el trámite: en FSC es AC («A Comprador»); en PAC es DC (ficha aprobada). La misma sigla
# significa cosas distintas según la fuente, por eso el color depende de la etapa.
_BANDEJA_FINAL = {'formularios': ('AC',), 'formularios_pac': ('DC',)}
_ESTADO_MALO = re.compile(r'rechaz|desiert|cancel|revoc|anulad', re.IGNORECASE)
_ESTADO_BUENO = re.compile(r'adjudic|aceptad|conforme|recepci|finaliz|cerrad', re.IGNORECASE)

# <style> en el <head>. Colores de las etiquetas: po=verde, pi=azul, pw=ámbar, pr=naranja, pb=rojo, pn=gris.
ESTILOS = (
    '<style>'
    'body{margin:0;padding:0;-webkit-text-size-adjust:100%}'
    'table{border-collapse:collapse}'
    '.l{width:100%}'
    '.l th{text-align:left;padding:6px 8px;background:#f1f5fa;color:#374151;border-bottom:2px solid #c9d3e0;'
    'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}'
    '.l td{padding:5px 8px;border-bottom:1px solid #e9edf3;font-size:12px;vertical-align:top;color:#1f2937}'
    '.l tr.z td{background:#f7f9fc}'
    '.l td.c{font-family:Consolas,"Courier New",monospace;font-weight:700;white-space:nowrap;color:#12467f}'
    '.l td.n,.l th.n{text-align:right;white-space:nowrap}'
    '.l td.w{white-space:nowrap}'
    '.r th{background:#1b5fa6;color:#ffffff;border-bottom:0;font-size:12px;text-transform:none;letter-spacing:0;'
    'padding:8px}'
    '.r td{font-size:13px;padding:8px}'
    '.p{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;'
    'white-space:nowrap}'
    '.pl{white-space:normal}'
    '.po{background:#dcf5e3;color:#1a7f37}.pi{background:#e7f0fb;color:#1b5fa6}'
    '.pw{background:#fff4d6;color:#8a5a00}.pr{background:#ffe7d3;color:#a24100}'
    '.pb{background:#fde8ea;color:#b4232f}.pn{background:#eef0f3;color:#5a6472}'
    '@media only screen and (max-width:620px){.tarjeta{width:100%!important}.pad{padding-left:12px!important;'
    'padding-right:12px!important}}'
    '</style>'
)


def _n(valor):
    """Entero con separador de miles chileno (1.234); '—' si no hay dato."""
    if valor is None:
        return '—'
    return f'{valor:,}'.replace(',', '.') if isinstance(valor, int) else str(valor)


def _tono_estado(texto, finales=()):
    """Clase de color de un estado. FSC/PAC llegan como «AA · Autorizador Abastecimiento»; OC,
    Licitaciones y Compras Ágiles como texto de Mercado Público (misma idea que el frontend).
    `finales`: códigos de bandeja que cierran el trámite en esa fuente (ver `_BANDEJA_FINAL`)."""
    t = (texto or '').strip()
    if not t:
        return 'pn'
    codigo = t.split(' · ')[0].strip().upper() if ' · ' in t else ''
    if codigo == 'R' or _ESTADO_MALO.search(t):
        return 'pb'
    if codigo in finales or _ESTADO_BUENO.search(t):
        return 'po'
    return 'pi'


def _tono_dias(dias):
    try:
        dias = int(dias)
    except (TypeError, ValueError):
        return 'pn'
    return 'pw' if dias <= 30 else ('pr' if dias <= 90 else 'pb')


def _celda(columna, valor, primera=False, finales=()):
    texto = _html.escape('' if valor is None else str(valor))
    if primera:
        return f'<td class="c">{texto}</td>'
    if columna in _COLS_ESTADO:
        if not texto:
            return '<td></td>'
        largo = ' pl' if len(texto) > 26 else ''   # las muy largas sí pueden partirse en dos líneas
        return f'<td><span class="p {_tono_estado(texto, finales)}{largo}">{texto}</span></td>'
    if columna == 'Días':
        return f'<td class="n"><span class="p {_tono_dias(valor)}">{texto}</span></td>'
    if columna in _COLS_NUMERICAS:
        return f'<td class="n">{texto}</td>'
    if columna in _COLS_SIN_QUIEBRE:
        return f'<td class="w">{texto}</td>'
    return f'<td>{texto}</td>'


def _tabla_html(columnas, filas, maximo=MAX_FILAS_CORREO, finales=()):
    esc = _html.escape
    numericas = _COLS_NUMERICAS | {'Días'}
    cab = ''.join(f'<th class="n">{esc(str(c))}</th>' if c in numericas else f'<th>{esc(str(c))}</th>'
                  for c in columnas)
    cuerpo = ''.join(
        ('<tr class="z">' if i % 2 else '<tr>')   # cebra: la clase, no estilo en línea (peso del HTML)
        + ''.join(_celda(c, v, j == 0, finales) for j, (c, v) in enumerate(zip(columnas, fila))) + '</tr>'
        for i, fila in enumerate(filas[:maximo]))
    return (f'<table class="l" width="100%" cellpadding="0" cellspacing="0">'
            f'<thead><tr>{cab}</tr></thead><tbody>{cuerpo}</tbody></table>')


def _pill(texto, clase):
    return f'<span class="p {clase}">{_html.escape(texto)}</span>'


def _tarjetas_html(items, ancho_pct=None):
    """Fila de tarjetas con cifra grande. items: [(rótulo, valor, color_cifra, fondo)]."""
    esc = _html.escape
    ancho = ancho_pct or int(100 / max(len(items), 1))
    celdas = ''.join(
        f'<td width="{ancho}%" align="center" bgcolor="{fondo}" valign="top" '
        f'style="background:{fondo};padding:12px 6px;border-radius:8px">'
        f'<div style="font-size:22px;font-weight:700;line-height:1.2;color:{color}">{esc(str(valor))}</div>'
        f'<div style="font-size:11px;line-height:1.35;color:#5a6472;margin-top:3px">{esc(rotulo)}</div></td>'
        for rotulo, valor, color, fondo in items)
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>{celdas}</tr></table>')


def _kpis_html(resultados, contexto):
    ok = sum(1 for r in resultados if r.estado != 'ERROR')
    todo_ok = ok == len(resultados)
    return _tarjetas_html([
        ('Bloques actualizados', f'{ok} de {len(resultados)}',
         '#1a7f37' if todo_ok else '#b4232f', '#e8f6ec' if todo_ok else '#fde8ea'),
        ('Registros nuevos', _n(sum(r.nuevos or 0 for r in resultados)), AZUL, '#e7f0fb'),
        ('Cambios de estado', _n(sum(r.cambios or 0 for r in resultados)), '#8a5a00', '#fff4d6'),
        ('Duración de la corrida', _duracion(contexto['segundos']), '#5a6472', '#eef0f3'),
    ], ancho_pct=25)


def _resumen_html(resultados):
    esc = _html.escape
    por = _por_etapa(resultados)
    filas = ''
    for i, etapa in enumerate(ORDEN_INFORME):
        r = por.get(etapa)
        z = ' class="z"' if i % 2 else ''
        punto = f'<span style="color:{COLOR_MODULO[etapa]};font-size:14px">&#9679;</span>&nbsp;'
        if r is None:
            filas += (f'<tr{z}><td>{punto}{esc(TITULOS[etapa])}</td>'
                      f'<td colspan="4" style="color:#8c959f">no incluida en esta corrida</td></tr>')
            continue
        filas += (f'<tr{z}><td>{punto}<b>{esc(TITULOS[etapa])}</b></td>'
                  f'<td>{_pill(TEXTO_ESTADO.get(r.estado, r.estado), _CLASE_ESTADO.get(r.estado, "pn"))}</td>'
                  f'<td class="n">{_n(r.nuevos)}</td><td class="n">{_n(r.cambios)}</td>'
                  f'<td class="n">{_n(r.total)}</td></tr>')
    return ('<table class="l r" width="100%" cellpadding="0" cellspacing="0"><thead><tr>'
            '<th>Bloque</th><th>Estado</th><th class="n">Nuevos</th><th class="n">Cambios de estado</th>'
            f'<th class="n">Total en BD</th></tr></thead><tbody>{filas}</tbody></table>')


def _bloque_html(etapa, r, maximo=MAX_FILAS_CORREO):
    """Una fuente de datos como tarjeta: franja de color del módulo, estado, cifras y listas."""
    esc = _html.escape
    titulo = TITULOS[etapa]
    color = COLOR_MODULO[etapa]
    if r is None:
        return ('<tr><td class="pad" style="padding:0 24px 12px"><table role="presentation" width="100%" '
                'cellpadding="0" cellspacing="0" bgcolor="#f6f8fb" style="border:1px dashed #c9d3e0">'
                '<tr><td style="padding:10px 14px;font-size:13px;color:#8c959f">'
                f'<b>{esc(titulo)}</b> — no se incluye en esta corrida.</td></tr></table></td></tr>')

    ecolor = COLOR_ESTADO.get(r.estado, '#57606a')
    filas = [
        # Franja del módulo: sigla + título a la izquierda, estado a la derecha.
        f'<tr><td bgcolor="{color}" style="background:{color};padding:10px 14px">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="color:#ffffff;font-size:15px;font-weight:700">'
        f'<span style="display:inline-block;background:#ffffff;color:{color};font-size:11px;font-weight:800;'
        f'padding:1px 7px;border-radius:4px;margin-right:8px">{esc(ABREVIATURAS[etapa])}</span>{esc(titulo)}</td>'
        '<td align="right" style="white-space:nowrap">'
        f'<span style="display:inline-block;background:#ffffff;color:{ecolor};font-size:11px;font-weight:700;'
        f'padding:2px 10px;border-radius:10px">{esc(TEXTO_ESTADO.get(r.estado, r.estado))}</span></td>'
        '</tr></table></td></tr>',
        f'<tr><td style="padding:9px 14px 0;font-size:12px;color:#6b7686">{esc(r.rango or "")}'
        f'{" · " if r.rango else ""}duración {esc(_duracion(r.segundos))}</td></tr>',
    ]
    if r.detalle:
        if r.estado == 'ERROR':   # el motivo del fallo tiene que saltar a la vista
            filas.append('<tr><td style="padding:8px 14px 0"><table role="presentation" width="100%" '
                         'cellpadding="0" cellspacing="0"><tr><td bgcolor="#fde8ea" style="background:#fde8ea;'
                         'border-left:4px solid #b4232f;padding:8px 12px;font-size:13px;color:#7a1620">'
                         f'{esc(r.detalle)}</td></tr></table></td></tr>')
        else:
            filas.append(f'<tr><td style="padding:6px 14px 0;font-size:13px;color:#374151">{esc(r.detalle)}</td></tr>')
    if r.resumen:
        filas.append('<tr><td style="padding:6px 8px 0">' + _tarjetas_html(
            [(k, _n(v), color, '#f6f8fb') for k, v in r.resumen]) + '</td></tr>')
    for lst in r.listas:
        if not lst['total']:
            continue
        filas.append(
            '<tr><td style="padding:12px 10px 0">'
            f'<div style="font-size:13px;font-weight:700;color:#1f2937;margin-bottom:5px">{esc(lst["titulo"])} '
            f'<span style="display:inline-block;background:{color};color:#ffffff;font-size:11px;padding:0 8px;'
            f'border-radius:9px">{_n(lst["total"])}</span></div>'
            + _tabla_html(lst['columnas'], lst['filas'], maximo, _BANDEJA_FINAL.get(etapa, ()))
            + (f'<div style="font-size:11px;color:#6b7686;padding:5px 0 0">… y {lst["total"] - maximo} más; el '
               f'detalle completo está en el Excel adjunto.</div>'
               if lst['total'] > maximo else '')
            + '</td></tr>')
    for nota in r.notas:
        filas.append('<tr><td style="padding:10px 14px 0"><table role="presentation" width="100%" cellpadding="0" '
                     'cellspacing="0"><tr><td bgcolor="#fff4d6" style="background:#fff4d6;border-left:4px solid '
                     f'#f0b429;padding:7px 12px;font-size:12px;color:#7a5200">⚠ {esc(nota)}</td></tr></table></td></tr>')
    filas.append('<tr><td style="font-size:0;line-height:0;height:12px">&nbsp;</td></tr>')
    return ('<tr><td class="pad" style="padding:0 20px 16px"><table role="presentation" width="100%" '
            'cellpadding="0" cellspacing="0" style="border:1px solid #dbe1ea;border-collapse:separate">'
            + ''.join(filas) + '</table></td></tr>')


def _seccion(titulo):
    return (f'<tr><td class="pad" style="padding:18px 24px 8px"><div style="font-size:16px;font-weight:700;'
            f'color:{AZUL}">{_html.escape(titulo)}</div></td></tr>')


def _documento(asunto, preheader, filas, nota_asunto=True):
    """Esqueleto común: fondo, tarjeta de 900 px, franja azul/roja (los dos colores del logo) y pie.
    `filas`: <tr> del interior de la tarjeta, entre la cabecera y el pie."""
    esc = _html.escape
    return (
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
        f'<title>{esc(asunto)}</title>{ESTILOS}</head>'
        f'<body style="margin:0;padding:0;background:#eef1f5;font-family:{FUENTE};color:#1f2937">'
        # Texto de vista previa de la bandeja (oculto en el cuerpo).
        '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;'
        f'color:#eef1f5">{esc(preheader)}</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef1f5">'
        '<tr><td align="center" style="padding:20px 10px">'
        '<table role="presentation" class="tarjeta" width="900" cellpadding="0" cellspacing="0" '
        'bgcolor="#ffffff" style="width:900px;max-width:100%;background:#ffffff;border:1px solid #dbe1ea">'
        # Franja de marca.
        '<tr><td style="font-size:0;line-height:0"><table role="presentation" width="100%" cellpadding="0" '
        f'cellspacing="0"><tr><td width="55%" height="6" bgcolor="{AZUL}" style="height:6px;font-size:0;'
        f'line-height:0">&nbsp;</td><td height="6" bgcolor="{ROJO_LOGO}" style="height:6px;font-size:0;'
        'line-height:0">&nbsp;</td></tr></table></td></tr>'
        + filas +
        # Pie institucional.
        '<tr><td class="pad" bgcolor="#f1f5fa" style="background:#f1f5fa;padding:14px 24px;font-size:11px;'
        'line-height:1.6;color:#6b7686;border-top:1px solid #dbe1ea">'
        'Servicio de Salud Osorno &middot; Departamento de Abastecimiento &middot; Gobierno de Chile.<br>'
        'Informe generado automáticamente por el sistema de gestión de compras (BD_SISTEMA).'
        + (' En el asunto: «+nuevos/cambios de estado» por bloque.' if nota_asunto else '') +
        '</td></tr>'
        '</table></td></tr></table></body></html>')


def _cabecera(supra, titulo, subtitulo, pill=''):
    """Cabecera: logo a la izquierda, títulos al centro y (opcional) etiqueta de resultado a la derecha."""
    esc = _html.escape
    derecha = (f'<td align="right" valign="middle" style="padding-left:12px;white-space:nowrap">{pill}</td>'
               if pill else '')
    return (
        f'<tr><td class="pad" style="padding:20px 24px 16px;border-bottom:4px solid {AZUL}">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        '<td width="100" valign="middle"><img src="cid:logo" alt="Servicio de Salud Osorno" width="92" height="83" '
        'style="display:block;border:0;outline:none;text-decoration:none"></td>'
        '<td valign="middle" style="padding-left:16px">'
        f'<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7686">{esc(supra)}</div>'
        f'<div style="font-size:22px;font-weight:700;color:{AZUL};line-height:1.25;margin-top:3px">{esc(titulo)}</div>'
        f'<div style="font-size:14px;color:#374151;margin-top:2px">{esc(subtitulo)}</div></td>'
        f'{derecha}</tr></table></td></tr>')


def _cobertura(ventana):
    """Qué rango de datos cubrió la corrida (una línea por fuente)."""
    partes = [p.strip() for p in (ventana or '').split(';') if p.strip() and p.strip() != '-']
    if not partes:
        return ''
    esc = _html.escape
    return ('<tr><td class="pad" bgcolor="#eaf1fa" style="background:#eaf1fa;padding:10px 24px;font-size:12px;'
            'line-height:1.7;color:#374151;border-bottom:1px solid #dbe1ea">'
            f'<b style="color:{AZUL_OSCURO};font-size:11px;letter-spacing:.05em;text-transform:uppercase">'
            'Datos incluidos en esta corrida</b><br>' + '<br>'.join(esc(p) for p in partes) + '</td></tr>')


def _html_informe(resultados, contexto, maximo):
    """Correo completo con `maximo` filas por lista."""
    inicio = contexto['inicio']
    todo_ok = _estado_global(resultados) == 'OK'
    pill = ('<span style="display:inline-block;background:{bg};color:{fg};font-size:12px;font-weight:700;'
            'padding:5px 14px;border-radius:14px">{txt}</span>').format(
        bg='#dcf5e3' if todo_ok else '#fde8ea', fg='#1a7f37' if todo_ok else '#b4232f',
        txt='✔ Resultado: OK' if todo_ok else '⚠ Resultado: CON ERRORES')
    por = _por_etapa(resultados)
    filas = (
        _cabecera('Servicio de Salud Osorno · Abastecimiento', 'Informe de actualización de datos',
                  f'Corrida del {inicio:%d-%m-%Y} a las {inicio:%H:%M}', pill)
        + _cobertura(contexto.get('ventana', ''))
        + f'<tr><td class="pad" style="padding:14px 18px 0">{_kpis_html(resultados, contexto)}</td></tr>'
        + _seccion('Resumen por bloque')
        + f'<tr><td class="pad" style="padding:0 24px 8px">{_resumen_html(resultados)}</td></tr>'
        + _seccion('Detalle de cada fuente')
        + ''.join(_bloque_html(etapa, por.get(etapa), maximo) for etapa in ORDEN_INFORME)
    )
    return _documento(_asunto(resultados, contexto), _resumen_corto(resultados), filas)


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
    """resultados: lista de ResultadoEtapa. contexto: {inicio: datetime, segundos, ventana}.

    Cada lista del cuerpo muestra las primeras `MAX_FILAS_CORREO` filas; si el HTML pasara del límite de
    Gmail se reconstruye con menos (ver `ESCALA_FILAS_CORREO`). El Excel adjunto siempre trae todas."""
    cuerpo = ''
    for maximo in ESCALA_FILAS_CORREO:
        cuerpo = _html_informe(resultados, contexto, maximo)
        if len(cuerpo.encode('utf-8')) <= LIMITE_HTML_BYTES:
            break
    adjuntos = []
    xlsx = _excel(resultados, contexto)
    if xlsx:
        adjuntos.append((f"actualizacion_{contexto['inicio']:%Y%m%d_%H%M}.xlsx", xlsx,
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
    return Informe(_asunto(resultados, contexto), _texto_plano(resultados, contexto), cuerpo, adjuntos)


def destinatarios_informe():
    return list(getattr(settings, 'SYNC_INFORME_A', None) or [])


def _clase_mensaje():
    """Clase de mensaje con el logo incrustado (`cid:logo`, misma estructura MIME que Notificación del
    Plan, que lee también Outlook web). Si el archivo del logo no se pudiera leer, el informe sale igual
    (con la imagen rota) en vez de perderse."""
    try:
        from .services_notificacion_plan import _bytes_logo, _clase_correo_con_logo
        _bytes_logo()
        return _clase_correo_con_logo()
    except Exception:
        return EmailMultiAlternatives


def enviar_informe(informe, destinos=None):
    """Envía el informe. Lanza si el SMTP falla (quien llama decide qué hacer)."""
    destinos = destinos or destinatarios_informe()
    if not destinos:
        raise RuntimeError('No hay destinatarios del informe (SYNC_INFORME_A).')
    msg = _clase_mensaje()(informe.asunto, informe.texto, None, destinos)
    msg.attach_alternative(informe.html, 'text/html')
    for nombre, datos, mime in informe.adjuntos:
        msg.attach(nombre, datos, mime)
    msg.send(fail_silently=False)
    return destinos


def informe_omitido(contexto, motivo):
    """Aviso corto: la corrida no se ejecutó (había otra en curso). Mismo diseño que el informe."""
    esc = _html.escape
    inicio = contexto['inicio']
    asunto = f"[BD_SISTEMA] Actualización {inicio:%H:%M} del {inicio:%d-%m-%Y} · OMITIDA"
    texto = f'La actualización programada NO se ejecutó: {motivo}\nSe reintenta en el siguiente horario.'
    pill = ('<span style="display:inline-block;background:#fff4d6;color:#8a5a00;font-size:12px;font-weight:700;'
            'padding:5px 14px;border-radius:14px">⚠ Omitida</span>')
    filas = (
        _cabecera('Servicio de Salud Osorno · Abastecimiento', 'Actualización omitida',
                  f'Corrida programada del {inicio:%d-%m-%Y} a las {inicio:%H:%M}', pill)
        + '<tr><td class="pad" style="padding:18px 24px 6px"><table role="presentation" width="100%" '
          'cellpadding="0" cellspacing="0"><tr><td bgcolor="#fff4d6" style="background:#fff4d6;border-left:4px '
          'solid #f0b429;padding:10px 14px;font-size:14px;line-height:1.5;color:#7a5200">'
          f'<b>La actualización programada no se ejecutó.</b><br>{esc(motivo[:1].upper() + motivo[1:])}'
          '</td></tr></table></td></tr>'
        + '<tr><td class="pad" style="padding:8px 24px 20px;font-size:13px;color:#374151">'
          'Se reintenta automáticamente en el siguiente horario programado.</td></tr>'
    )
    return Informe(asunto, texto,
                   _documento(asunto, 'La actualización programada no se ejecutó.', filas, nota_asunto=False), [])
