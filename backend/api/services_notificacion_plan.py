"""Notificación del Plan de Compras (Gestor de Compras > pestaña "Notificación").

Avisa por correo a los responsables del PAC (y, cuando se active, a las jefaturas de su
departamento) que deben generar su Formulario de Solicitud de Compra en el Panel
Documental. Todo el flujo vive en este archivo; las vistas solo validan y delegan.

Regla de oro: en MODO PRUEBA (settings.NOTIF_PLAN_MODO_PRUEBA, activo por defecto) NINGÚN
correo sale hacia un destinatario real — todo se redirige a NOTIF_PLAN_DESTINO_PRUEBA.
"""
import logging
import re
import unicodedata
from collections import defaultdict
from datetime import date
from difflib import SequenceMatcher

from django.conf import settings
from django.db import transaction

from .models import PacResponsableCorreo, PertenenciaUsuario, UsuarioPanel

logger = logging.getLogger(__name__)


# =============================================================================
# Acceso
# =============================================================================

def usuario_puede_notificar_plan(user) -> bool:
    """True solo si el correo del usuario está en settings.NOTIF_PLAN_USUARIOS.

    No basta ser admin ni superusuario: enviar correos masivos a funcionarios es una
    capacidad nominal. El correo se toma de auth.User.email y, si está vacío, del
    username cuando este tiene forma de correo (así entra la cuenta importada del Panel)."""
    if not user or not user.is_authenticated:
        return False
    candidatos = {(getattr(user, 'email', '') or '').strip().lower()}
    username = (getattr(user, 'username', '') or '').strip().lower()
    if '@' in username:
        candidatos.add(username)
    candidatos.discard('')
    return bool(candidatos & set(settings.NOTIF_PLAN_USUARIOS))


# =============================================================================
# Cruce responsable del PAC → correo
# =============================================================================
# PlanerPAC.nombre_responsable es solo un nombre, con tildes rotas ("Mar�a"), apellidos
# de más ("Bruno Ojeda Alvarez" vs "BRUNO OJEDA") o repetidos. Se cruza contra el alias de
# UsuarioPanel, que a su vez trae mojibake de otra codificación (UTF-8 leído como cp437:
# "NU├æEZ" en vez de "NUÑEZ").

ESTADO_CONFIRMADO = 'CONFIRMADO'      # equivalencia guardada por una persona
ESTADO_EXACTO = 'EXACTO'              # un único usuario activo con el mismo nombre
ESTADO_SUGERIDO = 'SUGERIDO'          # parecidos: hay que confirmar cuál es
ESTADO_AMBIGUO = 'AMBIGUO'            # varios usuarios activos con ese mismo nombre
ESTADO_SIN_CORREO = 'SIN_CORREO'      # ningún candidato razonable
ESTADOS_UTILIZABLES = (ESTADO_CONFIRMADO, ESTADO_EXACTO)

UMBRAL_SUGERENCIA = 0.65
MAX_CANDIDATOS = 3
_RE_JEFATURA = re.compile(r'\b(jef[ae]|director[a]?|subdirector[a]?)\b')
_RE_CORREO = re.compile(r'[^@\s]+@[^@\s]+\.[^@\s]+')


def reparar_texto(s) -> str:
    """Deshace los mojibake más comunes: UTF-8 leído como cp437 ('├æ' en vez de 'Ñ') o como
    latin-1 ('Ã±'). Si no hay nada que reparar, devuelve el texto tal cual."""
    s = '' if s is None else str(s)
    for codec in ('cp437', 'latin-1'):
        try:
            arreglado = s.encode(codec).decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if arreglado != s:
            return arreglado
    return s


def normalizar_nombre(s) -> str:
    """Minúsculas, sin tildes ni signos, espacios colapsados. Un carácter irrecuperable
    (U+FFFD) se conserva como '?', que el cruce trata como comodín."""
    s = reparar_texto(s).replace('�', '?')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z? ]', ' ', s).split())


def _token_coincide(a: str, b: str) -> bool:
    if a == b:
        return True
    if '?' in a or '?' in b:
        # '?' = caracter(es) perdidos: "mar?a" debe calzar con "maria".
        pat_a = re.escape(a).replace(r'\?', '.{0,2}')
        pat_b = re.escape(b).replace(r'\?', '.{0,2}')
        return bool(re.fullmatch(pat_a, b) or re.fullmatch(pat_b, a))
    return False


def _tokens_en_comun(ta, tb) -> int:
    restantes = list(tb)
    n = 0
    for t in ta:
        for i, u in enumerate(restantes):
            if _token_coincide(t, u):
                n += 1
                del restantes[i]
                break
    return n


def _mismo_nombre(clave_a: str, clave_b: str) -> bool:
    """Igualdad de nombres normalizados, tolerando '?' (caracteres perdidos) en cualquiera."""
    if clave_a == clave_b:
        return True
    if '?' not in clave_a and '?' not in clave_b:
        return False
    ta, tb = clave_a.split(), clave_b.split()
    return len(ta) == len(tb) and all(_token_coincide(x, y) for x, y in zip(ta, tb))


def _puntaje_nombres(clave_a: str, clave_b: str) -> float:
    """0-1: mezcla de cuántos nombres/apellidos coinciden (sobre el más corto de los dos,
    para que 'bruno ojeda alvarez' calce con 'bruno ojeda') y similitud de texto."""
    ta, tb = clave_a.split(), clave_b.split()
    if not ta or not tb:
        return 0.0
    comunes = _tokens_en_comun(ta, tb)
    cobertura = comunes / min(len(ta), len(tb))
    return 0.6 * cobertura + 0.4 * SequenceMatcher(None, clave_a, clave_b).ratio()


def _correo_valido(correo) -> str:
    correo = (correo or '').strip().lower()
    return correo if _RE_CORREO.fullmatch(correo) else ''


def cargar_usuarios_panel() -> list:
    """Usuarios del Panel SSO con correo, listos para cruzar (una sola query por llamada)."""
    filas = []
    for u in UsuarioPanel.objects.all().only('id', 'alias', 'correo_electronico', 'cargo', 'activo'):
        correo = _correo_valido(u.correo_electronico)
        clave = normalizar_nombre(u.alias)
        if not correo or not clave:
            continue
        filas.append({
            'id': u.id, 'alias': reparar_texto(u.alias).strip(), 'clave': clave, 'correo': correo,
            'cargo': reparar_texto(u.cargo).strip(), 'activo': (u.activo or '').upper() == 'S',
        })
    return filas


def _deptos_por_usuario_panel() -> dict:
    """{id de UsuarioPanel: {ids de departamento}} desde data_pertenencia_usuario."""
    mapa = defaultdict(set)
    for uid, dep in PertenenciaUsuario.objects.filter(tipo_dependencia='DEP').values_list(
            'id_usuario', 'id_dependencia'):
        mapa[uid].add(dep)
    return mapa


def _candidato(u: dict, puntaje: float) -> dict:
    return {'correo': u['correo'], 'alias': u['alias'], 'cargo': u['cargo'],
            'activo': u['activo'], 'puntaje': round(puntaje, 2)}


def resolver_correo(nombre, usuarios, confirmados, depto_ids=None, deptos_usuario=None) -> dict:
    """Resuelve UN nombre de responsable del PAC a un correo.

    `usuarios`: salida de cargar_usuarios_panel(). `confirmados`: {nombre_normalizado: correo}
    (PacResponsableCorreo). `depto_ids`: departamentos de los planes del responsable, y
    `deptos_usuario` = _deptos_por_usuario_panel(): solo sirven para desempatar y subir el
    puntaje de quien pertenece al mismo departamento.

    Devuelve {'estado', 'correo', 'candidatos'}; `correo` solo viene cuando el estado es
    utilizable (CONFIRMADO/EXACTO) — con SUGERIDO/AMBIGUO una persona debe elegir."""
    clave = normalizar_nombre(nombre)
    if not clave:
        return {'estado': ESTADO_SIN_CORREO, 'correo': '', 'candidatos': []}
    if clave in confirmados:
        return {'estado': ESTADO_CONFIRMADO, 'correo': confirmados[clave], 'candidatos': []}

    depto_ids = set(depto_ids or ())
    deptos_usuario = deptos_usuario or {}

    def mismo_depto(u):
        return bool(depto_ids and deptos_usuario.get(u['id'], set()) & depto_ids)

    activos = [u for u in usuarios if u['activo'] and _mismo_nombre(clave, u['clave'])]
    correos_activos = {u['correo'] for u in activos}
    if len(correos_activos) == 1:
        return {'estado': ESTADO_EXACTO, 'correo': next(iter(correos_activos)),
                'candidatos': [_candidato(activos[0], 1.0)]}
    if len(correos_activos) > 1:
        # Homónimos: si solo uno pertenece al departamento del plan, ese es.
        del_depto = {u['correo'] for u in activos if mismo_depto(u)}
        if len(del_depto) == 1:
            correo = next(iter(del_depto))
            elegido = next(u for u in activos if u['correo'] == correo)
            return {'estado': ESTADO_EXACTO, 'correo': correo, 'candidatos': [_candidato(elegido, 1.0)]}
        vistos, candidatos = set(), []
        for u in activos:
            if u['correo'] not in vistos:
                vistos.add(u['correo'])
                candidatos.append(_candidato(u, 1.0))
        return {'estado': ESTADO_AMBIGUO, 'correo': '', 'candidatos': candidatos[:MAX_CANDIDATOS]}

    # Sin igualdad exacta con un usuario activo: sugerir parecidos (y homónimos inactivos).
    puntuados, vistos = [], set()
    for u in usuarios:
        p = _puntaje_nombres(clave, u['clave'])
        if mismo_depto(u):
            p = min(1.0, p + 0.15)
        if not u['activo']:
            p -= 0.1   # un usuario dado de baja nunca debe ganarle a uno activo parecido
        if p >= UMBRAL_SUGERENCIA:
            puntuados.append((p, u))
    puntuados.sort(key=lambda x: -x[0])
    candidatos = []
    for p, u in puntuados:
        if u['correo'] not in vistos:
            vistos.add(u['correo'])
            candidatos.append(_candidato(u, p))
    if not candidatos:
        return {'estado': ESTADO_SIN_CORREO, 'correo': '', 'candidatos': []}
    return {'estado': ESTADO_SUGERIDO, 'correo': '', 'candidatos': candidatos[:MAX_CANDIDATOS]}


def resolver_responsables(responsables: dict) -> dict:
    """Resuelve muchos responsables de una vez. `responsables`: {nombre: set(depto_ids)}.
    Devuelve {nombre: resolución}. Carga usuarios y equivalencias una sola vez."""
    usuarios = cargar_usuarios_panel()
    confirmados = dict(PacResponsableCorreo.objects.values_list('nombre_normalizado', 'correo'))
    deptos_usuario = _deptos_por_usuario_panel()
    return {
        nombre: resolver_correo(nombre, usuarios, confirmados, depto_ids, deptos_usuario)
        for nombre, depto_ids in responsables.items()
    }


@transaction.atomic
def confirmar_correo_responsable(nombre, correo, usuario) -> PacResponsableCorreo:
    """Guarda (o corrige) la equivalencia nombre-del-PAC → correo. Se hace UNA vez por
    responsable: de ahí en adelante el cruce devuelve CONFIRMADO sin preguntar."""
    clave = normalizar_nombre(nombre)
    correo_ok = _correo_valido(correo)
    if not clave:
        raise ValueError('Falta el nombre del responsable.')
    if not correo_ok:
        raise ValueError('El correo no es válido.')
    obj, _ = PacResponsableCorreo.objects.update_or_create(
        nombre_normalizado=clave,
        defaults={'nombre_original': (nombre or '')[:200], 'correo': correo_ok,
                  'confirmado_por': usuario if getattr(usuario, 'pk', None) else None},
    )
    return obj


# =============================================================================
# Jefaturas del departamento (para el CC)
# =============================================================================

def es_cargo_jefatura(cargo) -> bool:
    return bool(_RE_JEFATURA.search(normalizar_nombre(cargo)))


def _departamentos_relevantes(depto_id, mapa_deptos) -> set:
    """El departamento y los que están por encima hasta su raíz (es_depto == 'SI'): una
    jefatura puede estar asignada al nodo raíz aunque el plan sea de un sub-departamento."""
    resultado, actual, visitados = set(), depto_id, set()
    while actual is not None and actual not in visitados and actual in mapa_deptos:
        resultado.add(actual)
        visitados.add(actual)
        nodo = mapa_deptos[actual]
        if nodo['es_depto'] == 'SI':
            break
        actual = nodo['parent_id']
    return resultado


def jefaturas_por_departamento(depto_ids, usuarios=None) -> dict:
    """{depto_id: [{nombre, cargo, correo}]} — usuarios ACTIVOS asignados a ese departamento
    (o a sus ancestros hasta la raíz) cuyo cargo es de jefatura (Jefe/a, Director/a,
    Subdirector/a). No hay un campo "es jefatura" en el Panel: se infiere del cargo."""
    from .services import _mapa_departamentos
    depto_ids = {d for d in depto_ids if d}
    if not depto_ids:
        return {}
    mapa_deptos = _mapa_departamentos()
    relevantes = {d: _departamentos_relevantes(d, mapa_deptos) for d in depto_ids}
    todos_deps = set().union(*relevantes.values())
    if not todos_deps:
        return {d: [] for d in depto_ids}

    usuarios = usuarios if usuarios is not None else cargar_usuarios_panel()
    jefes_por_id = {u['id']: u for u in usuarios if u['activo'] and es_cargo_jefatura(u['cargo'])}
    por_dep = defaultdict(list)
    for uid, dep in PertenenciaUsuario.objects.filter(
            tipo_dependencia='DEP', id_dependencia__in=todos_deps, id_usuario__in=list(jefes_por_id),
    ).values_list('id_usuario', 'id_dependencia'):
        por_dep[dep].append(jefes_por_id[uid])

    resultado = {}
    for d, deps in relevantes.items():
        vistos, lista = set(), []
        for dep in deps:
            for u in por_dep.get(dep, []):
                if u['correo'] not in vistos:
                    vistos.add(u['correo'])
                    lista.append({'nombre': u['alias'], 'cargo': u['cargo'], 'correo': u['correo']})
        resultado[d] = sorted(lista, key=lambda j: j['nombre'])
    return resultado


# =============================================================================
# Selección de planes notificables
# =============================================================================
# Una "ficha" es un proyecto del PAC (id_proyecto) con todos sus ítems; sale de
# services._calcular_fichas_pac_completo, la MISMA fuente de la pestaña Plan, así que lo que
# se selecciona acá calza con lo que se ve allá. Notificable = la ficha aún no tiene
# formulario (FSC) ni OC que la respalde: Atrasado, Pendiente o Sin fecha.

ESTADOS_NOTIFICABLES = ('ATRASADO', 'PENDIENTE', 'SIN_FECHA')
_RE_MES = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')
_CACHE_FICHAS_SEG = 60
_LOTE_IN = 400   # tamaño de los IN (...) — SQLite limita las variables por consulta


def _fichas_base(anho, depto_ids):
    """Todas las fichas del PAC en el alcance, sin filtrar por estado. `depto_ids` None = todos
    los departamentos; una lista VACÍA = ninguno (nunca "todo": _calcular_fichas_pac_completo
    trata depto=[] como sin filtro, así que se corta acá)."""
    from django.core.cache import cache
    from .services import _calcular_fichas_pac_completo
    if depto_ids is not None and not depto_ids:
        return []
    clave = 'notif_plan_fichas_{}_{}'.format(
        anho or 'todos', 'todos' if depto_ids is None else ','.join(map(str, sorted(depto_ids))))
    if (cached := cache.get(clave)) is not None:
        return cached
    filas = _calcular_fichas_pac_completo(
        anho=anho, depto=None if depto_ids is None else list(depto_ids))
    cache.set(clave, filas, timeout=_CACHE_FICHAS_SEG)
    return filas


def _filtrar_fichas(filas, estados=None, mes=None, search=None, responsable=None):
    estados = tuple(e for e in (estados or ESTADOS_NOTIFICABLES) if e in ESTADOS_NOTIFICABLES) \
        or ESTADOS_NOTIFICABLES
    resultado = [f for f in filas if f['estado_ejecucion'] in estados]
    if mes and _RE_MES.match(mes):
        resultado = [f for f in resultado if (f['fecha_mas_proxima'] or '').startswith(mes)]
    if search:
        s = normalizar_nombre(search)
        resultado = [
            f for f in resultado
            if s in normalizar_nombre(f['nombre_proyecto']) or s in (f['id_proyecto'] or '').lower()
            or s in normalizar_nombre(f['depto_nombre'] or f['depto_texto'])
            or s in normalizar_nombre(f['nombre_responsable'])
        ]
    if responsable:
        clave = normalizar_nombre(responsable)
        resultado = [f for f in resultado if normalizar_nombre(f['nombre_responsable']) == clave]
    return resultado


def historial_notificaciones(ids, anho=None) -> dict:
    """{id_proyecto: {'reales', 'ultimo_real', 'pruebas'}} de los correos ya ENVIADOS.
    Los lotes en modo prueba se cuentan aparte: no equivalen a "el responsable ya fue avisado"."""
    from .models import NotificacionPlanItem
    hist = {}
    ids = list(ids)
    for i in range(0, len(ids), _LOTE_IN):
        qs = NotificacionPlanItem.objects.filter(
            id_proyecto__in=ids[i:i + _LOTE_IN], envio__estado='ENVIADO')
        if anho:
            qs = qs.filter(anho=anho)
        for id_proy, prueba, cuando in qs.values_list(
                'id_proyecto', 'envio__lote__modo_prueba', 'envio__enviado_en'):
            h = hist.setdefault(id_proy, {'reales': 0, 'ultimo_real': None, 'pruebas': 0})
            if prueba:
                h['pruebas'] += 1
            else:
                h['reales'] += 1
                if cuando and (h['ultimo_real'] is None or cuando > h['ultimo_real']):
                    h['ultimo_real'] = cuando
    for h in hist.values():
        h['ultimo_real'] = h['ultimo_real'].isoformat() if h['ultimo_real'] else None
    return hist


def _resolver_de_fichas(fichas) -> dict:
    """{nombre_responsable: resolución} para los responsables de estas fichas, usando los
    departamentos de sus planes para desempatar homónimos."""
    deptos = defaultdict(set)
    for f in fichas:
        nombre = f['nombre_responsable']
        if nombre:
            deptos[nombre]
            if f['depto_id']:
                deptos[nombre].add(f['depto_id'])
    return resolver_responsables(dict(deptos))


def _sin_resolucion():
    return {'estado': ESTADO_SIN_CORREO, 'correo': '', 'candidatos': []}


def listar_planes_notificables(*, anho=None, depto_ids=None, estados=None, mes=None, search=None,
                               responsable=None, correo=None, notificado=None,
                               page=1, page_size=50) -> dict:
    """Planes que aún no tienen formulario, listos para seleccionar y notificar.

    `correo`: 'con' (responsable con correo utilizable) | 'sin' (hay que confirmarlo) | None.
    `notificado`: 'si' (ya se avisó de verdad) | 'no' | None. Devuelve la página pedida más
    los KPI del conjunto filtrado completo."""
    fichas = _filtrar_fichas(_fichas_base(anho, depto_ids), estados, mes, search, responsable)
    resoluciones = _resolver_de_fichas(fichas)
    hist = historial_notificaciones([f['id_proyecto'] for f in fichas], anho)

    def utilizable(f):
        return resoluciones.get(f['nombre_responsable'], _sin_resolucion())['estado'] in ESTADOS_UTILIZABLES

    def ya_notificado(f):
        return hist.get(f['id_proyecto'], {}).get('reales', 0) > 0

    if correo == 'con':
        fichas = [f for f in fichas if utilizable(f)]
    elif correo == 'sin':
        fichas = [f for f in fichas if not utilizable(f)]
    if notificado == 'si':
        fichas = [f for f in fichas if ya_notificado(f)]
    elif notificado == 'no':
        fichas = [f for f in fichas if not ya_notificado(f)]

    # Personas distintas (no variantes de texto): quien está escrito de dos maneras cuenta una vez.
    personas = {
        clave_persona(f['nombre_responsable'], resoluciones.get(f['nombre_responsable'], _sin_resolucion())): f['nombre_responsable']
        for f in fichas if f['nombre_responsable']
    }
    kpis = {
        'planes': len(fichas),
        'monto_total': round(sum(f['monto_total'] or 0 for f in fichas)),
        'responsables': len(personas),
        'planes_con_correo': sum(1 for f in fichas if utilizable(f)),
        'responsables_por_confirmar': sum(
            1 for r in personas.values()
            if resoluciones.get(r, _sin_resolucion())['estado'] not in ESTADOS_UTILIZABLES),
        'planes_ya_notificados': sum(1 for f in fichas if ya_notificado(f)),
        'planes_sin_responsable': sum(1 for f in fichas if not f['nombre_responsable']),
    }

    inicio = (page - 1) * page_size
    filas = []
    for f in fichas[inicio:inicio + page_size]:
        res = resoluciones.get(f['nombre_responsable'], _sin_resolucion())
        h = hist.get(f['id_proyecto'], {})
        filas.append({
            'id_proyecto': f['id_proyecto'], 'nombre_proyecto': f['nombre_proyecto'],
            'depto_id': f['depto_id'], 'depto_nombre': f['depto_nombre'] or f['depto_texto'],
            'nombre_responsable': f['nombre_responsable'], 'cargo_responsable': f['cargo_responsable'],
            'monto_total': f['monto_total'], 'cantidad_items': f['cantidad_items'],
            'fecha_mas_proxima': f['fecha_mas_proxima'], 'estado_ejecucion': f['estado_ejecucion'],
            'correo_estado': res['estado'], 'correo': res['correo'],
            'correo_candidatos': res['candidatos'],
            'notificado_veces': h.get('reales', 0), 'ultimo_envio': h.get('ultimo_real'),
            'pruebas_veces': h.get('pruebas', 0),
        })
    return {'count': len(fichas), 'page': page, 'page_size': page_size,
            'kpis': kpis, 'results': filas}


def listar_responsables_por_confirmar(*, anho=None, depto_ids=None, estados=None, mes=None,
                                      search=None) -> list:
    """Responsables de los planes filtrados cuyo correo NO es utilizable todavía (sugerido,
    ambiguo o sin candidato), con sus candidatos, para confirmarlos una sola vez."""
    fichas = _filtrar_fichas(_fichas_base(anho, depto_ids), estados, mes, search)
    resoluciones = _resolver_de_fichas(fichas)
    por_responsable = defaultdict(lambda: {'planes': 0, 'monto': 0.0, 'deptos': set()})
    for f in fichas:
        nombre = f['nombre_responsable']
        if not nombre:
            continue
        r = por_responsable[nombre]
        r['planes'] += 1
        r['monto'] += f['monto_total'] or 0
        r['deptos'].add(f['depto_nombre'] or f['depto_texto'] or '')
    filas = []
    for nombre, r in por_responsable.items():
        res = resoluciones.get(nombre, _sin_resolucion())
        if res['estado'] in ESTADOS_UTILIZABLES:
            continue
        filas.append({
            'nombre_responsable': nombre, 'estado': res['estado'], 'candidatos': res['candidatos'],
            'planes': r['planes'], 'monto_total': round(r['monto']),
            'departamentos': sorted(d for d in r['deptos'] if d),
        })
    filas.sort(key=lambda x: (-x['planes'], x['nombre_responsable']))
    return filas


def resolver_seleccion(seleccion: dict, depto_ids=None) -> list:
    """Fichas elegidas por el usuario. `seleccion` es una de:
      {'anho': 2026, 'ids': ['PC26-1', ...]}                         — selección explícita
      {'anho': 2026, 'filtros': {...}, 'excluir': ['PC26-9', ...]}   — "todos los filtrados"
    (los mismos filtros que listar_planes_notificables). Siempre se acota a `depto_ids` y a
    estados notificables: un id fuera de alcance o ya ejecutado simplemente se ignora."""
    anho = seleccion.get('anho') or None
    base = _fichas_base(anho, depto_ids)
    if seleccion.get('ids') is not None:
        ids = {str(i) for i in seleccion['ids']}
        return _filtrar_fichas([f for f in base if f['id_proyecto'] in ids])
    filtros = seleccion.get('filtros') or {}
    fichas = _filtrar_fichas(base, filtros.get('estados'), filtros.get('mes'),
                             filtros.get('search'), filtros.get('responsable'))
    if filtros.get('correo') in ('con', 'sin') or filtros.get('notificado') in ('si', 'no'):
        resoluciones = _resolver_de_fichas(fichas)
        hist = historial_notificaciones([f['id_proyecto'] for f in fichas], anho)
        if filtros.get('correo') in ('con', 'sin'):
            quiere = filtros['correo'] == 'con'
            fichas = [f for f in fichas if (resoluciones.get(
                f['nombre_responsable'], _sin_resolucion())['estado'] in ESTADOS_UTILIZABLES) == quiere]
        if filtros.get('notificado') in ('si', 'no'):
            quiere = filtros['notificado'] == 'si'
            fichas = [f for f in fichas if (hist.get(f['id_proyecto'], {}).get('reales', 0) > 0) == quiere]
    excluir = {str(i) for i in (seleccion.get('excluir') or [])}
    return [f for f in fichas if f['id_proyecto'] not in excluir]


# =============================================================================
# Destinatarios y construcción del correo
# =============================================================================

ESTADO_LABEL = {
    'ATRASADO': ('Atrasado', '#fde8ea', '#b4232f'),
    'PENDIENTE': ('Pendiente', '#e7f0fb', '#1b5fa6'),
    'SIN_FECHA': ('Sin fecha', '#eef0f3', '#5a6472'),
}
_SIN_DATO = '—'


def _fmt_clp(n) -> str:
    try:
        return '$' + f'{round(float(n or 0)):,}'.replace(',', '.')
    except (TypeError, ValueError):
        return _SIN_DATO


def _fmt_fecha(d) -> str:
    return d.strftime('%d/%m/%Y') if d else 'Sin fecha'


def _txt(v) -> str:
    v = reparar_texto(v).strip()
    return v or _SIN_DATO


def calcular_destinatarios(correo_responsable, jefaturas=(), modo_prueba=None) -> dict:
    """Para quién sale REALMENTE un correo.

    Destinatarios "reales": el responsable (Para) y, en copia, las `jefaturas` recibidas (la lista
    ya resuelta por calcular_copias: jefaturas del departamento ± reglas ± ajustes del envío), solo
    si NOTIF_PLAN_CC_JEFATURAS está encendido — es el interruptor general de las copias. Las
    copias fijas de Abastecimiento (NOTIF_PLAN_RESUMEN_CC) NO van acá: reciben únicamente el
    correo resumen con el PDF. En MODO PRUEBA nada de eso se usa: el correo va solo a
    NOTIF_PLAN_DESTINO_PRUEBA y los reales quedan únicamente informados en el aviso del correo."""
    modo = settings.NOTIF_PLAN_MODO_PRUEBA if modo_prueba is None else bool(modo_prueba)
    para_real = _correo_valido(correo_responsable)
    cc_real, vistos = [], {para_real}
    candidatos = []
    if settings.NOTIF_PLAN_CC_JEFATURAS:
        candidatos += [j['correo'] for j in jefaturas]
    for c in candidatos:
        c = _correo_valido(c)
        if c and c not in vistos:
            vistos.add(c)
            cc_real.append(c)
    if modo:
        destino = _correo_valido(settings.NOTIF_PLAN_DESTINO_PRUEBA)
        if not destino:
            raise ValueError('Modo prueba activo pero NOTIF_PLAN_DESTINO_PRUEBA no es un correo válido.')
        return {'modo_prueba': True, 'para': [destino], 'cc': [],
                'reales_para': [para_real] if para_real else [], 'reales_cc': cc_real}
    if not para_real:
        raise ValueError('El responsable no tiene un correo utilizable.')
    return {'modo_prueba': False, 'para': [para_real], 'cc': cc_real,
            'reales_para': [para_real], 'reales_cc': cc_real}


def cargar_detalle_pac(ids, anho=None) -> dict:
    """{id_proyecto: {cabecera..., 'items': [...]}} con TODO lo que trae el PAC de cada plan
    (todas las filas de PlanerPAC del proyecto, cada una un ítem con su fecha de compra)."""
    from .models import PlanerPAC
    from .services import _parsear_fecha_planer, _to_float_pac
    ids = list(ids)
    por_id = {}
    for i in range(0, len(ids), _LOTE_IN):
        qs = PlanerPAC.objects.filter(id_proyecto__in=ids[i:i + _LOTE_IN])
        if anho:
            qs = qs.filter(pac=str(anho))
        for row in qs.order_by('id'):
            d = por_id.setdefault(row.id_proyecto, {
                'unidad_compra': _txt(row.unidad_compra), 'tipo_proyecto': _txt(row.tipo_proyecto),
                'depto': _txt(row.depto), 'sub': _txt(row.sub), 'unidad': _txt(row.unidad),
                'codigo_presupuestario': _txt(row.codigo_presupuestario), 'items': [],
            })
            fecha = _parsear_fecha_planer(row.fecha_inicio_compra)
            d['items'].append({
                'nombre': _txt(row.nombre_item), 'cantidad': _txt(row.cantidad_items),
                'unitario': _fmt_clp(_to_float_pac(row.monto_unitario_item)),
                'total': _fmt_clp(_to_float_pac(row.monto_total_item)),
                'fecha': _fmt_fecha(fecha), '_orden': fecha.isoformat() if fecha else '9999',
            })
    for d in por_id.values():
        d['items'].sort(key=lambda it: it['_orden'])
    return por_id


def agrupar_por_responsable(fichas, resoluciones) -> list:
    """Una entrada por PERSONA (= un correo), con sus fichas ordenadas por fecha de compra.

    El PAC escribe a una misma persona de varias formas ("Yuvit Garcia-Chacur" / "Yuvit
    García-Chacur", "Carolina Silva" / "Carolina Silva Carolina Silva"). Si todas resuelven al mismo
    correo, se unen en un solo grupo: de lo contrario la persona recibiría un correo por variante.
    El nombre mostrado es el de la variante con más planes."""
    grupos = {}
    for f in fichas:
        nombre = f['nombre_responsable'] or ''
        res = resoluciones.get(nombre) or _sin_resolucion()
        g = grupos.setdefault(clave_persona(nombre, res), {
            'nombre': nombre, 'cargo': f['cargo_responsable'] or '', 'fichas': [],
            'depto_ids': set(), 'resolucion': res, 'variantes': {},
        })
        g['fichas'].append(f)
        g['variantes'][nombre] = g['variantes'].get(nombre, 0) + 1
        if f['depto_id']:
            g['depto_ids'].add(f['depto_id'])
    for g in grupos.values():
        g['nombre'] = max(g['variantes'], key=lambda n: (g['variantes'][n], n))
        g['cargo'] = next((f['cargo_responsable'] for f in g['fichas']
                           if f['nombre_responsable'] == g['nombre'] and f['cargo_responsable']), g['cargo'])
        g['fichas'].sort(key=lambda f: (f['fecha_mas_proxima'] is None, f['fecha_mas_proxima'] or ''))
        g['monto_total'] = sum(f['monto_total'] or 0 for f in g['fichas'])
    return sorted(grupos.values(), key=lambda g: g['nombre'].lower())


def clave_persona(nombre, resolucion) -> str:
    """Identidad de un responsable: su correo si está resuelto (así las variantes del nombre
    coinciden) y, si no, su nombre normalizado."""
    if resolucion['estado'] in ESTADOS_UTILIZABLES and resolucion['correo']:
        return 'correo:' + resolucion['correo']
    return 'nombre:' + normalizar_nombre(nombre)


def construir_correo(grupo, detalle, destinatarios, anho, jefaturas=()) -> dict:
    """Renderiza asunto, HTML y texto plano del correo de UN responsable. `grupo` sale de
    agrupar_por_responsable(), `detalle` de cargar_detalle_pac()."""
    from django.template.loader import render_to_string
    planes = []
    for f in grupo['fichas']:
        d = detalle.get(f['id_proyecto'], {})
        etiqueta, bg, fg = ESTADO_LABEL.get(f['estado_ejecucion'], ESTADO_LABEL['SIN_FECHA'])
        fecha = f['fecha_mas_proxima']
        planes.append({
            'id_proyecto': f['id_proyecto'], 'nombre_proyecto': _txt(f['nombre_proyecto']),
            'fecha': _fmt_fecha(date.fromisoformat(fecha)) if fecha else 'Sin fecha',
            'monto': _fmt_clp(f['monto_total']), 'estado_label': etiqueta, 'estado_bg': bg, 'estado_fg': fg,
            'depto': d.get('depto') or _txt(f['depto_nombre']), 'sub': d.get('sub', _SIN_DATO),
            'unidad': d.get('unidad', _SIN_DATO), 'unidad_compra': d.get('unidad_compra', _SIN_DATO),
            'tipo_proyecto': d.get('tipo_proyecto', _SIN_DATO),
            'codigo_presupuestario': d.get('codigo_presupuestario', _SIN_DATO),
            'responsable': _txt(f['nombre_responsable']), 'items': d.get('items', []),
        })
    n = len(planes)
    # Solo se nombra a quien de verdad va en copia (con jefaturas apagadas, no se las menciona).
    cc_nombres = ', '.join(j['nombre'] for j in jefaturas
                          if _correo_valido(j['correo']) in destinatarios['reales_cc'])
    contexto = {
        'anho': anho or '', 'nombre': _txt(grupo['nombre']), 'cargo': reparar_texto(grupo['cargo']).strip(),
        'planes': planes, 'n_planes': n, 'monto_total': _fmt_clp(grupo['monto_total']),
        'n_atrasados': sum(1 for p in planes if p['estado_label'] == 'Atrasado'),
        'n_pendientes': sum(1 for p in planes if p['estado_label'] == 'Pendiente'),
        'n_sin_fecha': sum(1 for p in planes if p['estado_label'] == 'Sin fecha'),
        'url_panel': settings.NOTIF_PLAN_URL_PANEL, 'modo_prueba': destinatarios['modo_prueba'],
        'reales_para': ', '.join(destinatarios['reales_para']) or 'sin correo utilizable',
        'reales_cc': ', '.join(destinatarios['reales_cc']), 'cc_jefaturas': cc_nombres,
    }
    asunto = (f'Plan de Compras {anho}: genere su Formulario de Solicitud de Compra '
              f'({n} plan{"" if n == 1 else "es"})' if anho else
              f'Genere su Formulario de Solicitud de Compra ({n} plan{"" if n == 1 else "es"})')
    if destinatarios['modo_prueba']:
        asunto = '[PRUEBA] ' + asunto
    contexto['asunto'] = asunto
    return {
        'asunto': asunto,
        'html': render_to_string('notificacion_plan/correo.html', contexto),
        'texto': render_to_string('notificacion_plan/correo.txt', contexto),
    }


# =============================================================================
# Vista previa y envío de un lote
# =============================================================================

class ReenvioPendiente(Exception):
    """Hay planes que ya fueron notificados de verdad y falta confirmar el reenvío."""
    def __init__(self, planes):
        super().__init__('Hay planes que ya fueron notificados.')
        self.planes = planes


class ConfirmacionRealPendiente(Exception):
    """En modo oficial el envío masivo exige `confirmar_real=True`: la confirmación la impone el
    SERVIDOR (no solo la casilla de la pantalla), así un POST directo no manda correos reales."""


class EnvioEnCurso(Exception):
    """Ya hay un lote enviándose; evita que un doble clic mande todo dos veces."""


_ENVIO_VIGENTE_MIN = 15          # un lote ENVIANDO más viejo que esto se considera interrumpido
_RUTA_LOGO = None


def _bytes_logo() -> bytes:
    global _RUTA_LOGO
    if _RUTA_LOGO is None:
        from pathlib import Path
        _RUTA_LOGO = (Path(__file__).resolve().parent / 'assets' / 'logo_correo.png').read_bytes()
    return _RUTA_LOGO


def _unir_jefaturas(depto_ids, jefaturas_por_depto) -> list:
    vistas, lista = set(), []
    for d in sorted(depto_ids):
        for j in jefaturas_por_depto.get(d, []):
            if j['correo'] not in vistas:
                vistas.add(j['correo'])
                lista.append(j)
    return lista


ORIGEN_AUTO, ORIGEN_REGLA, ORIGEN_PUNTUAL = 'AUTO', 'REGLA', 'PUNTUAL'


def calcular_copias(auto, agregar_regla, excluir_regla, ajuste, correo_responsable):
    """Lista final de copias (CC) de UN correo. Función pura.

    · `auto`: jefaturas del departamento por cargo [{nombre, cargo, correo}].
    · `agregar_regla` {correo: nombre} / `excluir_regla` {correo}: reglas PERMANENTES del departamento.
    · `ajuste` {'quitar': [correos], 'agregar': [correos]}: cambios SOLO de este envío.
    El responsable nunca va en copia de su propio correo. Un correo agregado a mano para este envío
    se respeta aunque una regla lo excluya; "quitar" para este envío siempre gana.
    Devuelve (copias, excluidas): cada una [{correo, nombre, cargo, origen, motivo?}] — `excluidas` son
    las que habrían ido pero se quitaron (por regla o por ajuste), para poder restaurarlas en la UI."""
    propio = _correo_valido(correo_responsable)
    quitar = {_correo_valido(c) for c in (ajuste or {}).get('quitar', [])} - {''}
    puntuales = [_correo_valido(c) for c in (ajuste or {}).get('agregar', [])]
    puntuales = [c for c in puntuales if c]
    candidatos = {}
    for j in auto:
        candidatos.setdefault(_correo_valido(j['correo']), {
            'correo': _correo_valido(j['correo']), 'nombre': j['nombre'], 'cargo': j.get('cargo', ''),
            'origen': ORIGEN_AUTO})
    for correo, nombre in agregar_regla.items():
        candidatos.setdefault(correo, {'correo': correo, 'nombre': nombre or correo, 'cargo': '',
                                       'origen': ORIGEN_REGLA})
    for correo in puntuales:
        candidatos.setdefault(correo, {'correo': correo, 'nombre': correo, 'cargo': '', 'origen': ORIGEN_PUNTUAL})
    copias, excluidas = [], []
    for correo, item in candidatos.items():
        if not correo or correo == propio:
            continue
        if correo in quitar:
            excluidas.append({**item, 'motivo': 'PUNTUAL'})
        elif correo in excluir_regla and correo not in puntuales:
            excluidas.append({**item, 'motivo': 'REGLA'})
        else:
            copias.append(item)
    orden = {ORIGEN_AUTO: 0, ORIGEN_REGLA: 1, ORIGEN_PUNTUAL: 2}
    copias.sort(key=lambda c: (orden[c['origen']], c['nombre'].lower()))
    excluidas.sort(key=lambda c: c['nombre'].lower())
    return copias, excluidas


def cargar_reglas_copia(depto_ids) -> dict:
    """{depto_id: {'agregar': {correo: nombre}, 'excluir': {correo}}} de las reglas guardadas."""
    from .models import NotificacionPlanCopia
    reglas = defaultdict(lambda: {'agregar': {}, 'excluir': set()})
    for depto, correo, nombre, accion in NotificacionPlanCopia.objects.filter(
            departamento_id__in=[d for d in depto_ids if d]).values_list(
            'departamento_id', 'correo', 'nombre', 'accion'):
        if accion == 'AGREGAR':
            reglas[depto]['agregar'][correo] = nombre
        else:
            reglas[depto]['excluir'].add(correo)
    return reglas


@transaction.atomic
def guardar_regla_copia(accion, departamento_id, correo, nombre, usuario):
    """Guarda una regla permanente de copia de un departamento.
      'excluir' → esa persona deja de ir en copia en este departamento.
      'agregar' → este correo siempre va en copia en este departamento.
      'olvidar' → borra la regla: vuelve a regir la lista automática por cargo.
    Agregar y excluir se anulan entre sí (una sola regla por departamento+correo)."""
    from .models import NotificacionPlanCopia
    from .services import _mapa_departamentos
    if accion not in ('excluir', 'agregar', 'olvidar'):
        raise ValueError('Acción inválida.')
    try:
        departamento_id = int(departamento_id)
    except (TypeError, ValueError):
        raise ValueError('Departamento inválido.')
    if departamento_id not in _mapa_departamentos():
        raise ValueError('El departamento no existe.')
    correo_ok = _correo_valido(correo)
    if not correo_ok:
        raise ValueError('El correo no es válido.')
    if accion == 'olvidar':
        NotificacionPlanCopia.objects.filter(departamento_id=departamento_id, correo=correo_ok).delete()
        return None
    obj, _ = NotificacionPlanCopia.objects.update_or_create(
        departamento_id=departamento_id, correo=correo_ok,
        defaults={'accion': NotificacionPlanCopia.ACCION_EXCLUIR if accion == 'excluir'
                  else NotificacionPlanCopia.ACCION_AGREGAR,
                  'nombre': (nombre or '')[:200],
                  'creado_por': usuario if getattr(usuario, 'pk', None) else None})
    return obj


def _depto_principal(fichas):
    """Departamento donde el responsable tiene más planes (el que representa su correo)."""
    cuenta = defaultdict(int)
    for f in fichas:
        if f['depto_id']:
            cuenta[f['depto_id']] += 1
    return min(cuenta, key=lambda d: (-cuenta[d], d)) if cuenta else None


def _preparar_lote(seleccion, depto_ids, ajustes=None, modo_prueba=None) -> dict:
    """Todo lo que se enviaría, sin enviar nada: agrupa por responsable, resuelve correos,
    copias (jefaturas ± reglas ± ajustes), detecta reenvíos y construye cada correo.
    `ajustes` = {nombre_responsable: {'quitar': [...], 'agregar': [...]}} (solo este envío).
    `modo_prueba` None = el de settings; True fuerza el modo prueba (botón "Enviarme una prueba")."""
    anho = seleccion.get('anho') or None
    ajustes = ajustes or {}
    fichas = resolver_seleccion(seleccion, depto_ids)
    resoluciones = _resolver_de_fichas(fichas)
    grupos = agrupar_por_responsable(fichas, resoluciones)
    ids = [f['id_proyecto'] for f in fichas]
    hist = historial_notificaciones(ids, anho)
    detalle = cargar_detalle_pac(ids, anho)
    todos_deptos = {d for g in grupos for d in g['depto_ids']}
    # Las jefaturas se identifican SIEMPRE (la vista previa las muestra para validarlas), pero solo
    # van en copia si NOTIF_PLAN_CC_JEFATURAS está encendido (ver calcular_destinatarios).
    usuarios = cargar_usuarios_panel()
    jefes = jefaturas_por_departamento(todos_deptos, usuarios)
    reglas = cargar_reglas_copia(todos_deptos)
    modo_prueba = settings.NOTIF_PLAN_MODO_PRUEBA if modo_prueba is None else bool(modo_prueba)
    por_correo = {u['correo']: u for u in usuarios}

    def _con_nombre(item):
        # correos agregados a mano: si son un usuario del Panel, mostrar su nombre y cargo
        u = por_correo.get(item['correo'])
        return {**item, 'nombre': u['alias'], 'cargo': u['cargo']} if u and item['nombre'] == item['correo'] else item

    enviables, omitidos, mensajes = [], [], {}
    for g in grupos:
        res = g['resolucion']
        planes_ids = [f['id_proyecto'] for f in g['fichas']]
        if not g['nombre']:
            omitidos.append({'nombre_responsable': '(sin responsable)', 'estado': 'SIN_RESPONSABLE',
                             'planes': len(planes_ids), 'motivo': 'El plan no tiene responsable en el PAC.'})
            continue
        if res['estado'] not in ESTADOS_UTILIZABLES:
            omitidos.append({'nombre_responsable': g['nombre'], 'estado': res['estado'],
                             'planes': len(planes_ids),
                             'motivo': 'Falta confirmar el correo del responsable.'})
            continue
        # Copias = jefaturas del departamento (por cargo) ± reglas permanentes ± ajustes de este envío.
        # Quien es jefatura Y responsable no va en copia de su propio correo (calcular_copias).
        agregar_regla, excluir_regla = {}, set()
        for d in g['depto_ids']:
            agregar_regla.update(reglas[d]['agregar'])
            excluir_regla |= reglas[d]['excluir']
        copias, excluidas = calcular_copias(
            _unir_jefaturas(g['depto_ids'], jefes), agregar_regla, excluir_regla,
            ajustes.get(g['nombre']), res['correo'])
        copias = [_con_nombre(c) for c in copias]
        excluidas = [_con_nombre(c) for c in excluidas]
        dest = calcular_destinatarios(res['correo'], copias, modo_prueba)
        correo = construir_correo(g, detalle, dest, anho, copias)
        mensajes[g['nombre']] = {'correo': correo, 'dest': dest}
        reenvio = [i for i in planes_ids if hist.get(i, {}).get('reales', 0) > 0]
        enviables.append({
            'nombre_responsable': g['nombre'], 'cargo_responsable': g['cargo'],
            'correo': res['correo'], 'para': dest['para'], 'cc': dest['cc'],
            'reales_para': dest['reales_para'], 'reales_cc': dest['reales_cc'],
            'copias': copias, 'copias_excluidas': excluidas, 'depto_ref_id': _depto_principal(g['fichas']),
            'planes': len(planes_ids), 'monto_total': round(g['monto_total']),
            'asunto': correo['asunto'], 'ids': planes_ids, 'reenvio_ids': reenvio,
            'departamento': (g['fichas'][0]['depto_nombre'] or g['fichas'][0]['depto_texto'] or ''),
        })
    reenvios = sorted({i for e in enviables for i in e['reenvio_ids']})
    return {
        'anho': anho, 'modo_prueba': modo_prueba,
        'destino_prueba': settings.NOTIF_PLAN_DESTINO_PRUEBA if modo_prueba else None,
        'copias_activas': bool(settings.NOTIF_PLAN_CC_JEFATURAS),
        'max_lote': settings.NOTIF_PLAN_MAX_LOTE, 'excede_tope': len(enviables) > settings.NOTIF_PLAN_MAX_LOTE,
        'total_planes': len(fichas), 'total_responsables': len(grupos),
        'enviables': enviables, 'omitidos': omitidos,
        'planes_enviables': sum(e['planes'] for e in enviables),
        'reenvios': reenvios, 'requiere_confirmar_reenvio': bool(reenvios),
        '_mensajes': mensajes, '_nombres_planes': {f['id_proyecto']: f['nombre_proyecto'] for f in fichas},
    }


def _html_para_navegador(html: str) -> str:
    """El logo del correo va como adjunto inline (cid:logo); en un iframe se muestra embebido."""
    import base64
    b64 = base64.b64encode(_bytes_logo()).decode()
    return html.replace('cid:logo', 'data:image/png;base64,' + b64)


def previsualizar_lote(seleccion, depto_ids, ejemplo=None, ajustes=None, usuario=None) -> dict:
    """Resumen de lo que se enviaría + el HTML de UN correo (`ejemplo` = nombre del responsable;
    por defecto el primero) para mostrarlo tal como lo recibiría el destinatario."""
    lote = _preparar_lote(seleccion, depto_ids, ajustes)
    mensajes = lote.pop('_mensajes')
    lote.pop('_nombres_planes')
    # A quién llegará el correo resumen con el PDF (se muestra en la revisión previa).
    resumen = resumen_destinatarios(getattr(usuario, 'email', '') or '', lote['modo_prueba'])
    lote['resumen_para'], lote['resumen_cc'] = resumen['para'], resumen['cc']
    nombre = ejemplo if ejemplo in mensajes else next(iter(mensajes), None)
    lote['ejemplo'] = nombre
    lote['html_ejemplo'] = _html_para_navegador(mensajes[nombre]['correo']['html']) if nombre else ''
    return lote


def _clase_correo_con_logo():
    """EmailMultiAlternatives con la estructura MIME que lee TODO cliente de correo:

        multipart/alternative
        ├─ text/plain
        └─ multipart/related
           ├─ text/html          (referencia el logo como `cid:logo`)
           └─ image/png          (Content-ID: <logo>)

    Con el logo como hermano del bloque alternative (lo que arma Django por defecto con
    `mixed_subtype='related'`) Outlook de escritorio lo muestra, pero Outlook web lo da por
    imagen rota. La imagen debe viajar JUNTO al HTML que la usa."""
    from email.mime.image import MIMEImage
    from django.core.mail import EmailMultiAlternatives
    from django.core.mail.message import SafeMIMEMultipart

    class CorreoConLogo(EmailMultiAlternatives):
        def _create_alternatives(self, msg):
            html = next((c for c, tipo in self.alternatives if tipo == 'text/html'), None)
            if html is None:
                return super()._create_alternatives(msg)
            alternativa = SafeMIMEMultipart(_subtype='alternative', encoding=self.encoding)
            alternativa.attach(msg)                                    # text/plain
            relacionado = SafeMIMEMultipart(_subtype='related', encoding=self.encoding)
            relacionado.attach(self._create_mime_attachment(html, 'text/html'))
            logo = MIMEImage(_bytes_logo(), _subtype='png')
            logo.add_header('Content-ID', '<logo>')
            logo.add_header('Content-Disposition', 'inline', filename='logo.png')
            relacionado.attach(logo)
            alternativa.attach(relacionado)
            return alternativa

    return CorreoConLogo


def construir_mensaje(correo: dict, dest: dict):
    """Mensaje listo para enviar: texto + HTML con el logo incrustado (ver _clase_correo_con_logo)."""
    msg = _clase_correo_con_logo()(
        subject=correo['asunto'], body=correo['texto'], from_email=settings.DEFAULT_FROM_EMAIL,
        to=dest['para'], cc=dest['cc'],
        reply_to=[settings.EMAIL_HOST_USER] if settings.EMAIL_HOST_USER else None)
    msg.attach_alternative(correo['html'], 'text/html')
    return msg


def _hay_envio_en_curso() -> bool:
    from datetime import timedelta
    from django.utils import timezone
    from .models import NotificacionPlanLote
    desde = timezone.now() - timedelta(minutes=_ENVIO_VIGENTE_MIN)
    return NotificacionPlanLote.objects.filter(
        estado=NotificacionPlanLote.ESTADO_ENVIANDO, creado_en__gte=desde).exists()


def enviar_prueba(seleccion, depto_ids, ejemplo=None, ajustes=None) -> dict:
    """Manda UN correo de muestra SOLO a NOTIF_PLAN_DESTINO_PRUEBA, aunque el sistema esté en modo
    oficial: sirve para ver el resultado final (logo, formato) antes del envío masivo. Lleva el
    aviso [PRUEBA] con a quién habría ido, no crea lote ni registra planes como notificados."""
    lote = _preparar_lote(seleccion, depto_ids, ajustes, modo_prueba=True)
    mensajes = lote['_mensajes']
    nombre = ejemplo if ejemplo in mensajes else next(iter(mensajes), None)
    if nombre is None:
        raise ValueError('No hay ningún correo para probar: ningún responsable de la selección '
                         'tiene un correo confirmado.')
    m = mensajes[nombre]
    construir_mensaje(m['correo'], m['dest']).send()
    return {'responsable': nombre, 'enviado_a': m['dest']['para'], 'asunto': m['correo']['asunto']}


def iniciar_envio(seleccion, depto_ids, usuario, confirmar_reenvio=False, en_hilo=True, ajustes=None,
                   confirmar_real=False):
    """Crea el lote (con un registro por correo) y lo envía. Devuelve el NotificacionPlanLote.

    Rechaza (sin enviar nada) si: no hay correos enviables, se excede el tope por lote, hay
    planes ya notificados sin `confirmar_reenvio`, o ya hay otro lote enviándose."""
    import json
    import threading
    from .models import NotificacionPlanEnvio, NotificacionPlanItem, NotificacionPlanLote

    if not settings.NOTIF_PLAN_MODO_PRUEBA and not confirmar_real:
        raise ConfirmacionRealPendiente('Falta confirmar el envío real a los responsables.')
    if _hay_envio_en_curso():
        raise EnvioEnCurso('Ya hay un envío en curso. Espere a que termine antes de iniciar otro.')
    lote_prep = _preparar_lote(seleccion, depto_ids, ajustes)
    mensajes = lote_prep.pop('_mensajes')
    plan_nombre = lote_prep.pop('_nombres_planes')
    enviables = lote_prep['enviables']
    if not enviables:
        raise ValueError('No hay correos para enviar: ningún responsable de la selección tiene '
                         'un correo confirmado.')
    if lote_prep['excede_tope']:
        raise ValueError(f'La selección tiene {len(enviables)} responsables y el máximo por envío es '
                         f'{lote_prep["max_lote"]}. Acote la selección (por mes, estado o departamento).')
    if lote_prep['requiere_confirmar_reenvio'] and not confirmar_reenvio:
        raise ReenvioPendiente(lote_prep['reenvios'])

    anho = lote_prep['anho']
    with transaction.atomic():
        lote = NotificacionPlanLote.objects.create(
            creado_por=usuario if getattr(usuario, 'pk', None) else None, anho=anho,
            modo_prueba=lote_prep['modo_prueba'], estado=NotificacionPlanLote.ESTADO_ENVIANDO,
            filtros=json.dumps({k: v for k, v in seleccion.items() if k != 'ids'} | (
                {'n_ids': len(seleccion['ids'])} if seleccion.get('ids') is not None else {}),
                ensure_ascii=False)[:20000],
            total_responsables=len(enviables), total_planes=lote_prep['planes_enviables'])
        envio_por_nombre = {}
        for e in enviables:
            dest = mensajes[e['nombre_responsable']]['dest']
            envio = NotificacionPlanEnvio.objects.create(
                lote=lote, nombre_responsable=e['nombre_responsable'][:200],
                cargo_responsable=(e['cargo_responsable'] or '')[:250],
                departamento=(e['departamento'] or '')[:250], destinatario_real=e['correo'],
                enviado_a=','.join(dest['para'])[:500], cc=','.join(dest['cc']),
                jefaturas=json.dumps(e['copias'], ensure_ascii=False), asunto=e['asunto'][:300],
                n_planes=e['planes'], monto_total=e['monto_total'])
            envio_por_nombre[e['nombre_responsable']] = envio
            NotificacionPlanItem.objects.bulk_create([
                NotificacionPlanItem(envio=envio, id_proyecto=i, anho=anho,
                                     nombre_proyecto=plan_nombre.get(i, ''))
                for i in e['ids']])

    trabajo = [(envio_por_nombre[n].pk, m['correo'], m['dest']) for n, m in mensajes.items()]
    if en_hilo:
        threading.Thread(target=ejecutar_envio, args=(lote.pk, trabajo), daemon=True).start()
    else:
        ejecutar_envio(lote.pk, trabajo)
        lote.refresh_from_db()
    return lote


def ejecutar_envio(lote_id, trabajo):
    """Envía los correos de un lote uno a uno (Office 365 limita ~30 por minuto, de ahí la
    pausa). Un fallo en un correo se registra y NO detiene a los demás."""
    import time
    from django.core.mail import get_connection
    from django.db import close_old_connections
    from django.utils import timezone
    from .models import NotificacionPlanEnvio, NotificacionPlanLote

    pausa = getattr(settings, 'NOTIF_PLAN_PAUSA_SEG', 2)
    conexion = get_connection()
    try:
        for i, (envio_id, correo, dest) in enumerate(trabajo):
            envio = NotificacionPlanEnvio.objects.get(pk=envio_id)
            try:
                # Una sola conexión SMTP para todo el lote; si se cayó, se reabre.
                if getattr(conexion, 'connection', True) is None:
                    conexion.open()
                conexion.send_messages([construir_mensaje(correo, dest)])
                envio.estado, envio.enviado_en, envio.error = (
                    NotificacionPlanEnvio.ESTADO_ENVIADO, timezone.now(), '')
            except Exception as exc:   # noqa: BLE001 — cualquier fallo SMTP se registra por correo
                # Se registra el mensaje ya saneado, no el traceback: un error SMTP podría traer la clave.
                envio.estado, envio.error = NotificacionPlanEnvio.ESTADO_ERROR, _mensaje_error(exc)
                logger.error('Falló el envío del correo %s del lote %s: %s', envio_id, lote_id, envio.error)
                try:
                    conexion.close()
                except Exception:   # noqa: BLE001
                    pass
            envio.save(update_fields=['estado', 'enviado_en', 'error'])
            if pausa and i < len(trabajo) - 1:
                time.sleep(pausa)
    finally:
        try:
            conexion.close()
        except Exception:   # noqa: BLE001
            pass
        _cerrar_lote(lote_id)
        try:
            enviar_resumen_lote(lote_id)
        except Exception as exc:   # noqa: BLE001 — el resumen nunca debe tumbar ni ocultar el envío
            logger.error('No se pudo enviar el resumen del lote %s: %s', lote_id, _mensaje_error(exc))
        close_old_connections()


def _mensaje_error(exc) -> str:
    """Texto breve y seguro para guardar/mostrar: nunca incluye credenciales."""
    texto = f'{type(exc).__name__}: {exc}'
    clave = getattr(settings, 'EMAIL_HOST_PASSWORD', '')
    if clave:
        texto = texto.replace(clave, '***')
    return texto[:500]


def _cerrar_lote(lote_id):
    """Calcula el estado final del lote a partir de sus correos."""
    from django.db.models import Count
    from .models import NotificacionPlanEnvio, NotificacionPlanLote
    cuenta = dict(NotificacionPlanEnvio.objects.filter(lote_id=lote_id)
                  .values_list('estado').annotate(n=Count('id')))
    ok = cuenta.get(NotificacionPlanEnvio.ESTADO_ENVIADO, 0)
    mal = cuenta.get(NotificacionPlanEnvio.ESTADO_ERROR, 0)
    pendientes = cuenta.get(NotificacionPlanEnvio.ESTADO_PENDIENTE, 0)
    if pendientes:
        NotificacionPlanEnvio.objects.filter(
            lote_id=lote_id, estado=NotificacionPlanEnvio.ESTADO_PENDIENTE,
        ).update(estado=NotificacionPlanEnvio.ESTADO_ERROR, error='Envío interrumpido.')
        mal += pendientes
    estado = (NotificacionPlanLote.ESTADO_ENVIADO if ok and not mal else
              NotificacionPlanLote.ESTADO_PARCIAL if ok else NotificacionPlanLote.ESTADO_ERROR)
    NotificacionPlanLote.objects.filter(pk=lote_id).update(estado=estado, enviados=ok, fallidos=mal)


def estado_lote(lote_id):
    """Progreso de un lote (para el sondeo de la pantalla). Un lote que lleva demasiado
    tiempo ENVIANDO se da por interrumpido (p. ej. se reinició el servidor)."""
    from datetime import timedelta
    from django.utils import timezone
    from .models import NotificacionPlanLote
    lote = NotificacionPlanLote.objects.filter(pk=lote_id).first()
    if lote is None:
        return None
    if (lote.estado == NotificacionPlanLote.ESTADO_ENVIANDO
            and lote.creado_en < timezone.now() - timedelta(minutes=_ENVIO_VIGENTE_MIN)):
        _cerrar_lote(lote.pk)
        lote.refresh_from_db()
    envios = list(lote.envios.order_by('nombre_responsable').values(
        'id', 'nombre_responsable', 'destinatario_real', 'enviado_a', 'cc', 'n_planes',
        'monto_total', 'estado', 'error', 'enviado_en'))
    hechos = sum(1 for e in envios if e['estado'] != 'PENDIENTE')
    for e in envios:
        e['monto_total'] = int(e['monto_total'])
        e['enviado_en'] = e['enviado_en'].isoformat() if e['enviado_en'] else None
    return {
        'id': lote.pk, 'estado': lote.estado, 'modo_prueba': lote.modo_prueba, 'anho': lote.anho,
        'creado_en': lote.creado_en.isoformat(), 'total': len(envios), 'procesados': hechos,
        'enviados': sum(1 for e in envios if e['estado'] == 'ENVIADO'),
        'fallidos': sum(1 for e in envios if e['estado'] == 'ERROR'),
        'total_planes': lote.total_planes, 'envios': envios,
    }


# =============================================================================
# Correo resumen de cierre (con el PDF de a quiénes se notificó)
# =============================================================================

def resumen_destinatarios(emisor, modo_prueba) -> dict:
    """Quién recibe el correo resumen con el PDF de cierre. En modo prueba, solo el destino de
    prueba. En oficial: Para = quien envía + NOTIF_PLAN_RESUMEN_PARA (sin duplicar) y Con copia =
    NOTIF_PLAN_RESUMEN_CC (Abastecimiento), sin repetir a nadie que ya va en Para."""
    if modo_prueba:
        return {'para': [_correo_valido(settings.NOTIF_PLAN_DESTINO_PRUEBA)], 'cc': []}
    para = []
    for c in [emisor, *settings.NOTIF_PLAN_RESUMEN_PARA]:
        c = _correo_valido(c)
        if c and c not in para:
            para.append(c)
    cc = []
    for c in settings.NOTIF_PLAN_RESUMEN_CC:
        c = _correo_valido(c)
        if c and c not in para and c not in cc:
            cc.append(c)
    if not para and cc:          # sin emisor ni Para configurado: el primero de las copias pasa a Para
        para, cc = cc[:1], cc[1:]
    return {'para': para, 'cc': cc}


def destinatarios_resumen(lote) -> dict:
    return resumen_destinatarios(getattr(lote.creado_por, 'email', '') if lote.creado_por else '', lote.modo_prueba)


def enviar_resumen_lote(lote_id) -> bool:
    """Envía el PDF del lote por correo (una sola vez). Devuelve True si salió."""
    from django.core.mail import EmailMessage
    from .models import NotificacionPlanLote
    from .services_notificacion_plan_pdf import generar_pdf_lote
    lote = NotificacionPlanLote.objects.select_related('creado_por').get(pk=lote_id)
    if lote.resumen_enviado or not lote.enviados:
        return False
    dest = destinatarios_resumen(lote)
    if not [d for d in dest['para'] if d]:
        return False
    prefijo = '[PRUEBA] ' if lote.modo_prueba else ''
    cuerpo = (
        f'Se notificó a {lote.enviados} responsable(s) del Plan Anual de Compras que deben generar su '
        f'Formulario de Solicitud de Compra ({lote.total_planes} plan(es)).\n\n'
        + (f'Hubo {lote.fallidos} correo(s) con error; el detalle está en el PDF adjunto.\n\n' if lote.fallidos else '')
        + ('ENVÍO DE PRUEBA: los avisos se enviaron solo al destinatario de prueba.\n\n' if lote.modo_prueba else '')
        + 'Se adjunta el listado de a quiénes se les envió el aviso.\n\nServicio de Salud Osorno — Abastecimiento')
    msg = EmailMessage(
        subject=f'{prefijo}Resumen: notificaciones del Plan de Compras — Lote {lote.pk}', body=cuerpo,
        from_email=settings.DEFAULT_FROM_EMAIL, to=dest['para'], cc=dest['cc'])
    msg.attach(f'notificaciones_plan_compras_lote_{lote.pk}.pdf', generar_pdf_lote(lote.pk), 'application/pdf')
    msg.send()
    NotificacionPlanLote.objects.filter(pk=lote.pk).update(resumen_enviado=True)
    return True
