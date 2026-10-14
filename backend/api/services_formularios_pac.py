"""Formularios PAC — consultas y cálculos para las pantallas (Abastecimiento › Formularios ›
Formularios PAC). La carga a la BD vive en `services_formularios_pac_etl.py`.

Una ficha PAC es la solicitud con que un departamento pide crear (Nuevo), cambiar (Modificar)
o quitar (Eliminar) un proyecto del Plan Anual de Compras. Recorre las bandejas
P → FR → FA → AA → DC (DC = ficha aprobada, estado final) y puede terminar en R (rechazada).

Los endpoints cachean con LocMemCache (volátil, no compartido entre procesos): `invalidar_cache`
sube un número de versión que forma parte de toda clave, así que no hace falta enumerarlas.
Las funciones `calcular_*` son puras (sin caché ni request) y aceptan `departamentos`
(lista de `FormularioPAC.departamento`) para acotar: None = sin acotar, [] = ninguna.
"""
import re
import time
from collections import defaultdict
from datetime import date

from django.core.cache import cache
from django.db.models import Count, Min, Sum

from .models import (
    FormularioPAC, FormularioPACEstadoLog, FormularioPACProducto, PacProyectoMaestro, PlanerPAC,
)

# ─── Bandejas ─────────────────────────────────────────────────────────────────

PIPELINE_ESTADOS_PAC = [
    ('P', 'Pendiente Firma'),
    ('FR', 'Revisor Finanzas'),
    ('FA', 'Jefatura Finanzas'),
    ('AA', 'Jefatura Abastecimiento'),
    ('DC', 'Aprobada'),
]
ESTADOS_EN_TRAMITE = ('P', 'FR', 'FA', 'AA')
ESTADO_APROBADA = 'DC'
ESTADO_RECHAZADA = 'R'
ACCIONES_PAC = ('Nuevo', 'Modificar', 'Eliminar')


def generar_id_ficha_pac(folio, anho):
    """ID corto y legible de una ficha: «PAC-1664-25» (folio del Panel + año en 2 dígitos)."""
    if folio is None or anho is None:
        return None
    return f'PAC-{folio:04d}-{anho % 100:02d}'


# ─── Caché versionada ─────────────────────────────────────────────────────────

_CLAVE_VERSION = 'formularios_pac_version'


def _version():
    v = cache.get(_CLAVE_VERSION)
    if v is None:
        v = int(time.time())
        cache.set(_CLAVE_VERSION, v, timeout=None)
    return v


def clave_cache(nombre, *partes):
    """Clave de caché versionada: cambia al invalidar, sin borrar claves una por una."""
    return ':'.join(['fpac', str(_version()), nombre, *[str(p) for p in partes]])


def invalidar_cache_formularios_pac():
    cache.set(_CLAVE_VERSION, int(time.time() * 1000), timeout=None)


# ─── Organigrama (filtro Subdirección → Departamento) ─────────────────────────

def mapa_departamento_organigrama():
    """`FormularioPAC.departamento` → depto raíz + subdirección (None = «Sin Clasificar»).
    Mismo matching normalizado que Formularios FSC (`_mapa_organigrama_de_nombres`)."""
    from .services import _mapa_organigrama_de_nombres
    nombres = (
        FormularioPAC.objects.exclude(departamento__isnull=True).exclude(departamento='')
        .values_list('departamento', flat=True).distinct()
    )
    return _mapa_organigrama_de_nombres(nombres)


def departamentos_de_organigrama(mapa, subdireccion='', depto='', sin_clasificar=False):
    """Traduce el filtro del organigrama a la lista de `departamento` que lo cumplen.
    None = sin filtro. Misma semántica que `FormularioFSCViewSet.get_queryset`."""
    subdireccion, depto = str(subdireccion or '').strip(), str(depto or '').strip()
    if not (subdireccion or depto or sin_clasificar):
        return None
    elegidos = []
    for nombre, info in mapa.items():
        if info is None:
            if sin_clasificar:
                elegidos.append(nombre)
            continue
        if depto and str(info['depto_id']) != depto:
            continue
        if subdireccion and str(info['subdireccion_id']) != subdireccion:
            continue
        if depto or subdireccion:
            elegidos.append(nombre)
    return elegidos


def calcular_formularios_pac_organigrama(mapa=None):
    """Árbol Subdirección/Hospital → Departamento(raíz) con conteo de fichas por nodo, para el
    filtro en cascada. Misma forma que `calcular_formularios_organigrama` de FSC."""
    mapa = mapa if mapa is not None else mapa_departamento_organigrama()
    conteo = dict(
        FormularioPAC.objects.exclude(departamento__isnull=True).exclude(departamento='')
        .values('departamento').annotate(n=Count('id')).values_list('departamento', 'n')
    )
    subdirecciones, sin_clasificar_total = {}, 0
    for nombre, info in mapa.items():
        n = conteo.get(nombre, 0)
        if info is None:
            sin_clasificar_total += n
            continue
        clave = (info['establecimiento_id'], info['subdireccion_id'])
        sub = subdirecciones.setdefault(clave, {
            'subdireccion_id': info['subdireccion_id'], 'nombre': info['nombre_subdireccion'],
            'departamentos': {}, 'total': 0,
        })
        sub['total'] += n
        d = sub['departamentos'].setdefault(info['depto_id'], {
            'depto_id': info['depto_id'], 'nombre': info['nombre_depto'], 'total': 0,
        })
        d['total'] += n

    resultado = []
    for sub in subdirecciones.values():
        sub['departamentos'] = sorted(sub['departamentos'].values(), key=lambda d: d['nombre'] or '')
        resultado.append(sub)
    resultado.sort(key=lambda s: s['nombre'] or '')
    if sin_clasificar_total:
        resultado.append({'subdireccion_id': None, 'nombre': 'Sin Clasificar',
                          'departamentos': [], 'total': sin_clasificar_total})
    return {'subdirecciones': resultado}


# ─── Utilidades ───────────────────────────────────────────────────────────────

def _qs_fichas(anho=None, departamentos=None):
    qs = FormularioPAC.objects.all()
    if anho:
        qs = qs.filter(anho=anho)
    if departamentos is not None:
        qs = qs.filter(departamento__in=departamentos)
    return qs


def _dias_desde(fecha, hoy):
    return (hoy - fecha).days if fecha else None


def _primera_carga():
    """Fecha del primer registro de historial: antes de ella no se sabe desde cuándo una ficha
    está en su bandeja (el Panel solo expone el estado actual)."""
    return FormularioPACEstadoLog.objects.aggregate(m=Min('fecha_registro'))['m']


def _dias_en_bandeja(ids, hoy):
    """{ficha_id: días en la bandeja actual} solo donde se conoce. Se conoce si la ficha tuvo al
    menos 2 estados registrados, o si su único registro es posterior a la primera carga (la vimos
    aparecer). Una ficha con un solo registro de la primera carga lleva «al menos» ese tiempo."""
    if not ids:
        return {}
    primera = _primera_carga()
    ultima, cuantas = {}, defaultdict(int)
    for formulario_id, fecha in (
        FormularioPACEstadoLog.objects.filter(formulario_id__in=ids)
        .order_by('id').values_list('formulario_id', 'fecha_registro')
    ):
        ultima[formulario_id] = fecha
        cuantas[formulario_id] += 1
    return {
        pk: (hoy - fecha).days for pk, fecha in ultima.items()
        if cuantas[pk] >= 2 or fecha != primera
    }


def _promedio(valores):
    valores = [v for v in valores if v is not None]
    return round(sum(valores) / len(valores), 1) if valores else None


# ─── KPIs ─────────────────────────────────────────────────────────────────────

def calcular_formularios_pac_stats(anho=None, departamentos=None):
    """KPIs y distribuciones de las fichas PAC (pestaña «Solicitudes PAC»).

    Cada grupo trae `monto` (todas sus fichas) y `monto_vigente` (sin las rechazadas, o sea lo
    que sigue en pie: en trámite + aprobadas). El monto de una ficha puede ser negativo (Modificar
    que rebaja) o nulo (Eliminar): se suma tal cual, es el efecto neto declarado."""
    qs = _qs_fichas(anho, departamentos)
    filas = list(qs.values_list('estado', 'accion_proyecto', 'monto', 'tipo_proyecto',
                                'tipo_requerimiento', 'departamento', 'fecha_ficha'))

    def _nuevo():
        # monto = todas las fichas del grupo; monto_vigente = sin las rechazadas
        return {'total': 0, 'monto': 0, 'monto_vigente': 0, 'aprobadas': 0, 'rechazadas': 0, 'en_tramite': 0}

    por_estado, por_accion, por_depto = defaultdict(_nuevo), defaultdict(_nuevo), defaultdict(_nuevo)
    por_tipo_proyecto, por_tipo_req, por_mes = defaultdict(int), defaultdict(int), defaultdict(_nuevo)
    totales = _nuevo()

    for estado, accion, monto, tipo_proyecto, tipo_req, depto, fecha in filas:
        monto = monto or 0
        vigente = estado != ESTADO_RECHAZADA
        destinos = [totales, por_estado[estado or 'Sin estado'], por_accion[accion or 'Sin acción'],
                    por_depto[depto or 'Sin departamento']]
        if fecha:
            destinos.append(por_mes[f'{fecha.year}-{fecha.month:02d}'])
        for d in destinos:
            d['total'] += 1
            d['monto'] += monto
            if vigente:
                d['monto_vigente'] += monto
            if estado == ESTADO_APROBADA:
                d['aprobadas'] += 1
            elif estado == ESTADO_RECHAZADA:
                d['rechazadas'] += 1
            elif estado in ESTADOS_EN_TRAMITE:
                d['en_tramite'] += 1
        por_tipo_proyecto[tipo_proyecto or 'Sin dato'] += 1
        por_tipo_req[tipo_req or 'Sin dato'] += 1

    resueltas = totales['aprobadas'] + totales['rechazadas']
    orden_estado = {c: i for i, (c, _) in enumerate(PIPELINE_ESTADOS_PAC)}
    orden_estado[ESTADO_RECHAZADA] = len(orden_estado)

    anios = list(FormularioPAC.objects.order_by('-anho').values_list('anho', flat=True).distinct())
    return {
        'kpis': {
            'total_fichas': totales['total'],
            'en_tramite': totales['en_tramite'],
            'aprobadas': totales['aprobadas'],
            'rechazadas': totales['rechazadas'],
            'sin_estado': totales['total'] - totales['en_tramite'] - totales['aprobadas'] - totales['rechazadas'],
            'monto_vigente': totales['monto_vigente'],
            'monto_total': totales['monto'],
            'pct_aprobacion': round(totales['aprobadas'] / resueltas * 100, 1) if resueltas else None,
            'pct_rechazo': round(totales['rechazadas'] / resueltas * 100, 1) if resueltas else None,
        },
        'por_estado': sorted(
            [{'estado': e, **v} for e, v in por_estado.items()],
            key=lambda r: orden_estado.get(r['estado'], 99)),
        'por_accion': sorted(
            [{'accion': a, **v} for a, v in por_accion.items()],
            key=lambda r: ACCIONES_PAC.index(r['accion']) if r['accion'] in ACCIONES_PAC else 99),
        'por_tipo_proyecto': [{'tipo': t, 'total': n} for t, n in sorted(por_tipo_proyecto.items(), key=lambda x: -x[1])],
        'por_tipo_requerimiento': [{'tipo': t, 'total': n} for t, n in sorted(por_tipo_req.items(), key=lambda x: -x[1])],
        'por_departamento': sorted(
            [{'departamento': d, **v} for d, v in por_depto.items()], key=lambda r: -r['total'])[:10],
        'por_mes': [{'mes': m, **v} for m, v in sorted(por_mes.items())],
        'anios_disponibles': anios,
    }


# ─── Flujo de visación ────────────────────────────────────────────────────────

def calcular_formularios_pac_flujo(anho=None, departamentos=None, hoy=None):
    """Cantidad, monto y antigüedad de las fichas por bandeja (P → FR → FA → AA → DC) + rechazadas.

    - `dias_en_tramite`: días desde `fecha_ficha`. Es la única medida retroactiva — solo se
      calcula en bandejas activas; en DC (final) y R el trámite ya terminó.
    - `dias_en_bandeja`: días desde que la sincronización vio la ficha en su bandeja actual;
      solo donde se conoce (ver `_dias_en_bandeja`)."""
    hoy = hoy or date.today()
    qs = _qs_fichas(anho, departamentos)
    filas = list(qs.values_list('id', 'estado', 'monto', 'fecha_ficha'))
    activas = [pk for pk, estado, _, _ in filas if estado in ESTADOS_EN_TRAMITE]
    en_bandeja = _dias_en_bandeja(activas, hoy)

    grupos = defaultdict(lambda: {'cantidad': 0, 'monto': 0, 'tramite': [], 'bandeja': []})
    sin_estado = 0
    for pk, estado, monto, fecha in filas:
        if estado is None:
            sin_estado += 1
            continue
        g = grupos[estado]
        g['cantidad'] += 1
        g['monto'] += monto or 0
        if estado in ESTADOS_EN_TRAMITE:
            g['tramite'].append(_dias_desde(fecha, hoy))
            g['bandeja'].append(en_bandeja.get(pk))

    def _nodo(codigo, nombre):
        g = grupos.get(codigo) or {'cantidad': 0, 'monto': 0, 'tramite': [], 'bandeja': []}
        tramite = [d for d in g['tramite'] if d is not None]
        return {
            'codigo': codigo, 'nombre': nombre, 'cantidad': g['cantidad'], 'monto': g['monto'],
            'dias_en_tramite_promedio': _promedio(tramite),
            'dias_en_tramite_max': max(tramite) if tramite else None,
            'dias_en_bandeja_promedio': _promedio(g['bandeja']),
        }

    estados_pipeline = [_nodo(c, n) for c, n in PIPELINE_ESTADOS_PAC]
    rechazadas = grupos.get(ESTADO_RECHAZADA, {'cantidad': 0, 'monto': 0})
    return {
        'estados_pipeline': estados_pipeline,
        'rechazadas': {'cantidad': rechazadas['cantidad'], 'monto': rechazadas['monto']},
        'sin_estado': sin_estado,
        'total_en_tramite': sum(n['cantidad'] for n in estados_pipeline if n['codigo'] in ESTADOS_EN_TRAMITE),
        'historial_disponible_desde': (_primera_carga().isoformat() if _primera_carga() else None),
    }


# ─── Alertas / demoras ────────────────────────────────────────────────────────

def calcular_formularios_pac_alertas(anho=None, dias_min=10, departamentos=None, hoy=None):
    """Fichas aún en trámite (P/FR/FA/AA) con `dias_min` o más días desde `fecha_ficha`,
    de la más antigua a la más reciente. DC y R no generan alerta (ya terminaron)."""
    hoy = hoy or date.today()
    qs = _qs_fichas(anho, departamentos).filter(estado__in=ESTADOS_EN_TRAMITE)
    fichas = list(qs.only(
        'id', 'folio', 'anho', 'fecha_ficha', 'estado', 'departamento', 'nombre_proyecto',
        'accion_proyecto', 'monto', 'nombre_responsable', 'solicitante', 'identificador_proyecto',
    ))
    en_bandeja = _dias_en_bandeja([f.pk for f in fichas], hoy)
    registros = []
    for f in fichas:
        dias = _dias_desde(f.fecha_ficha, hoy)
        if dias is None or dias < dias_min:
            continue
        registros.append({
            'id': f.id, 'id_ficha': generar_id_ficha_pac(f.folio, f.anho), 'folio': f.folio, 'anho': f.anho,
            'fecha_ficha': f.fecha_ficha.isoformat(), 'estado': f.estado, 'departamento': f.departamento,
            'nombre_proyecto': f.nombre_proyecto, 'accion_proyecto': f.accion_proyecto, 'monto': f.monto,
            'nombre_responsable': f.nombre_responsable, 'solicitante': f.solicitante,
            'identificador_proyecto': f.identificador_proyecto,
            'dias': dias, 'dias_en_bandeja': en_bandeja.get(f.pk),
        })
    registros.sort(key=lambda r: -r['dias'])
    return {'count': len(registros), 'results': registros}


# ─── Carro de productos ───────────────────────────────────────────────────────

_RE_ITEM = re.compile(r'^\s*(\d{1,2}(?:\.\d{1,3}){1,5})\s*(?:-\s*(.*))?$')


def separar_item_presupuestario(texto):
    """'22.04.001 - Materiales de Oficina' → ('22.04.001', 'Materiales de Oficina', '22.04').
    Valores sin código (None, '0', ids numéricos viejos de 2024) → (None, None, None)."""
    if not texto:
        return None, None, None
    m = _RE_ITEM.match(texto)
    if not m:
        return None, None, None
    codigo = m.group(1)
    return codigo, (m.group(2) or '').strip() or None, '.'.join(codigo.split('.')[:2])


def _lineas_de_fichas(fichas):
    """Líneas del carro cuyas fichas están en `fichas` (iterable de FormularioPAC), unidas por
    (folio, anho). Devuelve (dict clave→ficha, lista de líneas)."""
    por_clave = {(f.folio, f.anho): f for f in fichas}
    if not por_clave:
        return por_clave, []
    por_anho = defaultdict(set)
    for folio, a in por_clave:
        por_anho[a].add(folio)
    lineas = []
    for a, folios in por_anho.items():
        for linea in FormularioPACProducto.objects.filter(anho=a, folio__in=folios):
            lineas.append(linea)
    return por_clave, lineas


def calcular_formularios_pac_carro(anho=None, departamentos=None, estados=None, acciones=None):
    """Análisis del carro: por categoría, ítem presupuestario, mes de ejecución y producto.

    Solo cuentan las líneas con ficha (cabecera) — las huérfanas se informan aparte. Por defecto
    se excluyen las fichas rechazadas (`estados=None`); `estados` y `acciones` acotan."""
    qs = _qs_fichas(anho, departamentos)
    if estados:
        qs = qs.filter(estado__in=estados)
    else:
        qs = qs.exclude(estado=ESTADO_RECHAZADA)
    if acciones:
        qs = qs.filter(accion_proyecto__in=acciones)
    fichas = list(qs.only('id', 'folio', 'anho', 'departamento', 'estado'))
    por_clave, lineas = _lineas_de_fichas(fichas)

    def _acum():
        return {'n_lineas': 0, 'monto': 0, 'fichas': set()}

    por_categoria, por_item, por_mes = defaultdict(_acum), defaultdict(_acum), defaultdict(_acum)
    por_producto, por_depto, por_grupo = defaultdict(_acum), defaultdict(_acum), defaultdict(_acum)
    etiquetas_item = {}
    total_monto, sin_item, sin_mes = 0, 0, 0
    fichas_con_lineas = set()

    for l in lineas:
        monto = l.monto or 0
        ficha = por_clave[(l.folio, l.anho)]
        clave_ficha = (l.folio, l.anho)
        fichas_con_lineas.add(clave_ficha)
        total_monto += monto

        codigo, etiqueta, grupo = separar_item_presupuestario(l.item_presupuestario)
        if codigo is None:
            sin_item += 1
        else:
            etiquetas_item.setdefault(codigo, etiqueta)
        mes = l.mes_ejecucion_fecha.strftime('%Y-%m') if l.mes_ejecucion_fecha else None
        if mes is None:
            sin_mes += 1

        objetivos = [
            por_categoria[l.categoria or 'Sin categoría'],
            por_item[codigo or 'Sin ítem'],
            por_grupo[grupo or 'Sin ítem'],
            por_producto[(l.categoria or 'Sin categoría', l.producto or 'Sin nombre')],
            por_depto[ficha.departamento or 'Sin departamento'],
            por_mes[mes or 'Sin mes'],
        ]
        for o in objetivos:
            o['n_lineas'] += 1
            o['monto'] += monto
            o['fichas'].add(clave_ficha)

    def _lista(d, fn):
        return [{**fn(k), 'n_lineas': v['n_lineas'], 'n_fichas': len(v['fichas']), 'monto': v['monto']}
                for k, v in d.items()]

    orden_monto = lambda r: -r['monto']  # noqa: E731
    huerfanas = 0
    if departamentos is None and not acciones and not estados:
        claves_cabecera = set(FormularioPAC.objects.filter(
            **({'anho': anho} if anho else {})).values_list('folio', 'anho'))
        lineas_anho = FormularioPACProducto.objects.filter(**({'anho': anho} if anho else {}))
        huerfanas = sum(1 for f, a in lineas_anho.values_list('folio', 'anho') if (f, a) not in claves_cabecera)

    return {
        'totales': {
            'n_lineas': len(lineas), 'monto': total_monto, 'n_fichas': len(fichas_con_lineas),
            'n_fichas_consideradas': len(fichas), 'lineas_sin_item': sin_item, 'lineas_sin_mes': sin_mes,
            'lineas_sin_ficha': huerfanas,
        },
        'por_categoria': sorted(_lista(por_categoria, lambda k: {'categoria': k}), key=orden_monto),
        'por_item': sorted(_lista(por_item, lambda k: {'codigo': k, 'nombre': etiquetas_item.get(k)}), key=orden_monto),
        'por_subtitulo': sorted(_lista(por_grupo, lambda k: {'codigo': k}), key=orden_monto),
        'por_mes': sorted(_lista(por_mes, lambda k: {'mes': k}), key=lambda r: (r['mes'] == 'Sin mes', r['mes'])),
        'top_productos': sorted(
            _lista(por_producto, lambda k: {'categoria': k[0], 'producto': k[1]}), key=orden_monto)[:20],
        'por_departamento': sorted(_lista(por_depto, lambda k: {'departamento': k}), key=orden_monto)[:15],
    }


# ─── Ficha completa («Ver») ───────────────────────────────────────────────────

def _proyecto_del_plan(identificador):
    """Qué es el proyecto al que apunta una ficha Modificar/Eliminar: datos del plan vigente
    (PlanerPAC, hoy solo PC26) o, si no está, del maestro histórico."""
    if not identificador:
        return None
    filas = list(PlanerPAC.objects.filter(id_proyecto=identificador))
    maestro = PacProyectoMaestro.objects.filter(id_proyecto=identificador).first()
    if not filas and not maestro:
        return {'id_proyecto': identificador, 'en_plan_vigente': False, 'en_maestro': False,
                'nombre_proyecto': None, 'monto_total': None, 'n_items': 0}
    total = 0.0
    for fila in filas:
        try:
            total += float(fila.monto_total_item)
        except (TypeError, ValueError):
            pass
    return {
        'id_proyecto': identificador,
        'en_plan_vigente': bool(filas),
        'en_maestro': maestro is not None,
        'nombre_proyecto': (filas[0].nombre_proyecto if filas else maestro.nombre_proyecto),
        'monto_total': total if filas else None,
        'n_items': len(filas),
        'depto': filas[0].depto if filas else None,
        'oc_asociada': maestro.oc_asociada if maestro else None,
    }


def calcular_formulario_pac_ficha(pk, mapa_organigrama=None, hoy=None):
    """Ficha completa de una ficha PAC: cabecera, carro, historial de bandejas, organigrama y el
    proyecto del plan al que apunta. Lanza `FormularioPAC.DoesNotExist` si no existe."""
    hoy = hoy or date.today()
    f = FormularioPAC.objects.get(pk=pk)
    lineas = list(FormularioPACProducto.objects.filter(folio=f.folio, anho=f.anho).order_by('linea'))
    historial = list(f.historial_estados.order_by('fecha_registro', 'id'))
    primera = _primera_carga()
    en_bandeja = _dias_en_bandeja([f.pk], hoy).get(f.pk) if f.estado in ESTADOS_EN_TRAMITE else None

    mapa = mapa_organigrama if mapa_organigrama is not None else mapa_departamento_organigrama()
    org = mapa.get(f.departamento)

    suma_lineas = sum(l.monto or 0 for l in lineas)
    relacionadas = []
    if f.identificador_proyecto:
        relacionadas = [
            {'id': r.id, 'id_ficha': generar_id_ficha_pac(r.folio, r.anho), 'accion_proyecto': r.accion_proyecto,
             'estado': r.estado, 'fecha_ficha': r.fecha_ficha.isoformat() if r.fecha_ficha else None, 'monto': r.monto}
            for r in FormularioPAC.objects.filter(identificador_proyecto=f.identificador_proyecto)
            .exclude(pk=f.pk).order_by('fecha_ficha', 'id')
        ]

    campos = [
        'folio', 'anho', 'accion_proyecto', 'identificador_proyecto', 'departamento', 'cargo_responsable',
        'nombre_responsable', 'anexo', 'correo', 'nombre_jefatura', 'nombre_proyecto', 'tipo_requerimiento',
        'tipo_proyecto', 'recursos_programaticos', 'rec_prog_justificacion', 'nombre_programa',
        'descripcion_adquisicion', 'objetivo_adquisicion', 'monto', 'estado', 'obs_rechazo', 'solicitante',
    ]
    ficha = {c: getattr(f, c) for c in campos}
    for c in ('fecha_ficha', 'fecha_autorizacion_jefe', 'fecha_rechazo'):
        valor = getattr(f, c)
        ficha[c] = valor.isoformat() if valor else None
    ficha.update(id=f.id, id_ficha=generar_id_ficha_pac(f.folio, f.anho),
                 dias_en_tramite=_dias_desde(f.fecha_ficha, hoy) if f.estado in ESTADOS_EN_TRAMITE else None,
                 dias_en_bandeja=en_bandeja)
    return {
        'ficha': ficha,
        'organigrama': org,
        'productos': [
            {'linea': l.linea, 'categoria': l.categoria, 'producto': l.producto, 'monto': l.monto,
             'cantidad': l.cantidad, 'unidad': l.unidad, 'item_presupuestario': l.item_presupuestario,
             'mes_ejecucion': l.mes_ejecucion,
             'mes_ejecucion_fecha': l.mes_ejecucion_fecha.isoformat() if l.mes_ejecucion_fecha else None}
            for l in lineas
        ],
        'carro': {
            'n_lineas': len(lineas), 'suma_lineas': suma_lineas,
            'cuadra_con_monto': (f.monto is not None and f.monto == suma_lineas) if lineas else None,
            'diferencia': (f.monto - suma_lineas) if (lineas and f.monto is not None) else None,
        },
        'historial_estados': [{'estado': h.estado, 'fecha_registro': h.fecha_registro.isoformat()} for h in historial],
        'historial_desde': primera.isoformat() if primera else None,
        'proyecto_plan': _proyecto_del_plan(f.identificador_proyecto),
        'fichas_del_mismo_proyecto': relacionadas,
    }


# ─── Resumen de cambios tras sincronizar ──────────────────────────────────────

def snapshot_fichas_pac(hoy=None):
    """Foto de las fichas para calcular el diff antes/después de una sincronización.
    {(folio, anho): {...}} con lo mínimo que muestra el panel de cambios."""
    hoy = hoy or date.today()
    return {
        (f.folio, f.anho): {
            'id': f.id, 'id_ficha': generar_id_ficha_pac(f.folio, f.anho), 'folio': f.folio, 'anho': f.anho,
            'departamento': f.departamento, 'nombre_proyecto': f.nombre_proyecto,
            'accion_proyecto': f.accion_proyecto, 'estado': f.estado, 'monto': f.monto,
            'fecha_ficha': f.fecha_ficha.isoformat() if f.fecha_ficha else None,
            'dias': _dias_desde(f.fecha_ficha, hoy),
        }
        for f in FormularioPAC.objects.only(
            'folio', 'anho', 'departamento', 'nombre_proyecto', 'accion_proyecto', 'estado', 'monto',
            'fecha_ficha')
    }


def diff_fichas_pac(antes, despues, umbral_dias=10, limite=200):
    """Qué cambió entre dos snapshots: fichas nuevas, que cambiaron de bandeja, que pasaron a
    aprobadas (DC) o rechazadas (R), eliminadas del Panel y las que siguen detenidas.
    Cada lista se recorta a `limite`; los `*_count` son los totales reales."""
    nuevas, cambiaron, aprobadas, rechazadas, detenidas = [], [], [], [], []
    for clave, d in despues.items():
        previa = antes.get(clave)
        estado_previo = previa['estado'] if previa else None
        if previa is None:
            nuevas.append(d)
        elif estado_previo != d['estado']:
            cambiaron.append({**d, 'estado_anterior': estado_previo})
        if d['estado'] == ESTADO_APROBADA and estado_previo != ESTADO_APROBADA:
            aprobadas.append(d)
        if d['estado'] == ESTADO_RECHAZADA and estado_previo != ESTADO_RECHAZADA:
            rechazadas.append(d)
        if d['estado'] in ESTADOS_EN_TRAMITE and d['dias'] is not None and d['dias'] > umbral_dias:
            detenidas.append(d)
    eliminadas = [antes[k] for k in antes if k not in despues]
    detenidas.sort(key=lambda x: -(x['dias'] or 0))
    resultado = {}
    for nombre, lista in (('nuevas', nuevas), ('cambiaron_estado', cambiaron), ('aprobadas', aprobadas),
                          ('rechazadas', rechazadas), ('eliminadas', eliminadas), ('detenidas', detenidas)):
        resultado[nombre] = lista[:limite]
        resultado[f'{nombre}_count'] = len(lista)
    return resultado
