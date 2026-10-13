"""Administración de usuarios — ficha completa editable por un administrador.

Un administrador abre un usuario y puede corregir, en un solo guardado atómico:
  - la CUENTA de acceso y el PERFIL del sistema (auth.User + PerfilUsuario) — se delega en
    `UserAdminSerializer`, el mismo camino de siempre, con guardas de autoprotección;
  - su fila del PANEL SSO (`data_usuario_panel`, espejo `managed=False`);
  - el DEPARTAMENTO que ve como Gestor de Compras (capa propia
    `AsignacionDepartamentoUsuario`, que prevalece sobre `data_pertenencia_usuario`);
y, aparte, la JERARQUÍA misma (`data_departamento`: nombre, padre, subdirección…).

Diseño (para que sumar una entidad editable sea agregar una entrada, no código nuevo):
  - Las tablas espejo se editan con un REGISTRO de campos (`CAMPOS_PANEL`,
    `CAMPOS_DEPARTAMENTO`): solo lo declarado es editable, cada campo con su tipo, largo y
    obligatoriedad. Un campo desconocido se RECHAZA (no se ignora en silencio).
  - TODO cambio queda en `AuditoriaAdmin` (quién, cuándo, campo, antes → después). Las
    contraseñas nunca se guardan.
  - Esta capa no importa nada de HTTP: las reglas incumplidas salen como
    `ErrorAdministracion`, y la vista las traduce a 400.

Las tablas del Panel SSO son un espejo cargado desde fuera de este proyecto: si alguien las
vuelve a importar, las ediciones directas (`panel`, `departamento`) se pierden — por eso la
auditoría guarda el valor anterior y el nuevo, y por eso el departamento de un gestor vive en
una tabla propia y no ahí.
"""
from collections import defaultdict

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction

from .models import (
    AsignacionDepartamentoUsuario, AuditoriaAdmin, Departamento, Establecimiento,
    FormularioFSC, PerfilUsuario, PertenenciaUsuario, UsuarioPanel,
)
from .serializers import UserAdminSerializer
from .services import (
    _construir_alcance, _departamentos_asignados_gestor, _mapa_departamentos,
    _mapa_nombres_subdireccion, _normalizar_texto_pac, invalidar_cache_alcance_gestor,
    reclasificar_dentro_fuera_pac,
)

SEPARADOR_RUTA = ' › '
MIN_LARGO_CLAVE = 6


class ErrorAdministracion(Exception):
    """Regla de negocio o validación incumplida. `detalle` es un dict
    {sección: {campo: mensaje} | mensaje}; `status` es el código HTTP sugerido."""

    def __init__(self, detalle, status=400):
        super().__init__(str(detalle))
        self.detalle = detalle
        self.status = status


# =============================================================================
# Registro de campos editables
# =============================================================================
#
# tipo: 'str' | 'email' | 'int' | 'choice'.  `requerido`: no admite vacío/None.
# `max`: largo máximo (str/email).  `opciones`: valores válidos (choice); el vacío se
# normaliza a None (así `es_depto` queda 'SI' o NULL, como en el origen).

CAMPOS_PANEL = {
    'usuario':            {'tipo': 'str',    'max': 100, 'requerido': True},
    'correo_electronico': {'tipo': 'email',  'max': 150, 'requerido': True},
    'descripcion':        {'tipo': 'str',    'max': 150},
    'activo':             {'tipo': 'choice', 'opciones': ('S', 'N'), 'requerido': True},
    'establecimiento_id': {'tipo': 'int',    'requerido': True},
    'alias':              {'tipo': 'str',    'max': 150},
    'run':                {'tipo': 'str',    'max': 15},
    'cargo':              {'tipo': 'str',    'max': 200},
}

CAMPOS_DEPARTAMENTO = {
    'descripcion':        {'tipo': 'str',    'max': 200, 'requerido': True},
    'nombre_corto':       {'tipo': 'str',    'max': 20},
    'parent_id':          {'tipo': 'int'},
    'subdireccion_id':    {'tipo': 'int'},
    'es_depto':           {'tipo': 'choice', 'opciones': ('SI',)},
    'establecimiento_id': {'tipo': 'int',    'requerido': True},
}

CAMPOS_CUENTA = ('username', 'email', 'first_name', 'last_name', 'is_active', 'password')
CAMPOS_PERFIL = ('role', 'panel_id', 'establecimiento_id', 'cargo', 'run')
_CAMPOS_CUENTA_AUDITADOS = ('username', 'email', 'first_name', 'last_name', 'is_active')


def _normalizar_valor(nombre, spec, valor):
    """Devuelve el valor limpio o lanza ValueError con el mensaje para el usuario."""
    tipo = spec['tipo']
    vacio = valor is None or (isinstance(valor, str) and not valor.strip())

    if vacio:
        if spec.get('requerido'):
            raise ValueError('Campo obligatorio.')
        return None

    if tipo in ('str', 'email'):
        texto = str(valor).strip()
        if len(texto) > spec['max']:
            raise ValueError(f"Máximo {spec['max']} caracteres.")
        if tipo == 'email':
            try:
                validate_email(texto)
            except DjangoValidationError:
                raise ValueError('Correo electrónico inválido.')
        return texto

    if tipo == 'int':
        if isinstance(valor, bool):
            raise ValueError('Debe ser un número entero.')
        try:
            return int(str(valor).strip())
        except (TypeError, ValueError):
            raise ValueError('Debe ser un número entero.')

    if tipo == 'choice':
        texto = str(valor).strip().upper()   # todas las opciones del registro van en mayúsculas
        if texto not in spec['opciones']:
            raise ValueError('Valor no permitido (' + ', '.join(spec['opciones']) + ').')
        return texto

    raise ValueError(f'Tipo no soportado: {tipo}')  # pragma: no cover — error de programación


def _limpiar_cambios(cambios, specs, seccion):
    """Valida `cambios` contra el registro. Acumula TODOS los errores (no solo el primero)."""
    errores, limpios = {}, {}
    for campo, valor in (cambios or {}).items():
        spec = specs.get(campo)
        if spec is None:
            errores[campo] = 'Este campo no se puede editar.'
            continue
        try:
            limpios[campo] = _normalizar_valor(campo, spec, valor)
        except ValueError as e:
            errores[campo] = str(e)
    if errores:
        raise ErrorAdministracion({seccion: errores})
    return limpios


# =============================================================================
# Auditoría
# =============================================================================

def _diferencias(antes, despues):
    return {k: [antes.get(k), despues[k]] for k in despues if antes.get(k) != despues[k]}


def _registrar_auditoria(actor, entidad, objeto_id, etiqueta, cambios, usuario_afectado=None):
    """Una fila por entidad modificada. Sin cambios reales no escribe nada."""
    if not cambios:
        return None
    return AuditoriaAdmin.objects.create(
        actor=actor, actor_nombre=(actor.username if actor else '')[:150],
        usuario_afectado=usuario_afectado, entidad=entidad,
        objeto_id=str(objeto_id), objeto_etiqueta=(etiqueta or '')[:200], cambios=cambios,
    )


def listar_historial(usuario_id=None, entidad=None, objeto_id=None, limite=50):
    """Últimos cambios (más recientes primero), filtrables por cuenta afectada u objeto."""
    qs = AuditoriaAdmin.objects.all()
    if usuario_id is not None:
        qs = qs.filter(usuario_afectado_id=usuario_id)
    if entidad:
        qs = qs.filter(entidad=entidad)
    if objeto_id is not None:
        qs = qs.filter(objeto_id=str(objeto_id))
    etiquetas = dict(AuditoriaAdmin.ENTIDADES)
    return [
        {
            'id': a.id, 'fecha': a.creado_en.isoformat(), 'actor': a.actor_nombre,
            'entidad': a.entidad, 'entidad_etiqueta': etiquetas.get(a.entidad, a.entidad),
            'objeto_id': a.objeto_id, 'objeto_etiqueta': a.objeto_etiqueta, 'cambios': a.cambios,
        }
        for a in qs[:max(1, min(int(limite), 200))]
    ]


# =============================================================================
# Jerarquía: rutas, árbol y descripciones
# =============================================================================

def _es_raiz(nodo, mapa):
    """Un nodo es de primer nivel si el origen lo marca (`es_depto == 'SI'`, autoritativo) o si
    su padre no existe / es otra subdirección-establecimiento. Mismo criterio que
    `_resolver_depto_raiz` y `_cuelga_de` — por eso el árbol que ve el administrador es el
    mismo que usa el alcance del gestor."""
    if nodo['es_depto'] == 'SI':
        return True
    padre = mapa.get(nodo['parent_id'])
    return (
        not padre or padre['id'] == nodo['id']
        or padre['subdireccion_id'] != nodo['subdireccion_id']
        or padre['establecimiento_id'] != nodo['establecimiento_id']
    )


def _ruta_departamento(depto_id, mapa, nombres_rama):
    """«Subdirección › Departamento › Sub-departamento» — verifica de un vistazo dónde cae."""
    nodo = mapa.get(depto_id)
    if not nodo:
        return ''
    partes, visitados, actual = [], set(), nodo
    while actual and actual['id'] not in visitados:
        visitados.add(actual['id'])
        partes.append(actual['descripcion'] or f"#{actual['id']}")
        if _es_raiz(actual, mapa):
            break
        actual = mapa.get(actual['parent_id'])
    rama = nombres_rama.get((nodo['establecimiento_id'], nodo['subdireccion_id']), 'Sin Clasificar')
    return SEPARADOR_RUTA.join([rama] + list(reversed(partes)))


def _describir_departamentos(ids, mapa, nombres_rama):
    return [
        {
            'id': d_id,
            'nombre': mapa[d_id]['descripcion'],
            'ruta': _ruta_departamento(d_id, mapa, nombres_rama),
        }
        for d_id in sorted(ids) if d_id in mapa
    ]


def construir_arbol_organizacion():
    """Árbol para el selector en cascada: ramas (Subdirección de la Dirección o cada
    hospital) → departamentos de primer nivel → sub-departamentos, a cualquier profundidad.

    Retorna [{clave, establecimiento_id, subdireccion_id, nombre, departamentos: [nodo]}] con
    nodo = {id, nombre, nombre_corto, es_depto, hijos: [nodo]}. Nada se descarta: un nodo cuya
    cadena de padres es un ciclo (dato corrupto) aparece como raíz de su rama en vez de
    desaparecer del selector."""
    mapa = _mapa_departamentos()
    nombres_rama, establecimientos = _mapa_nombres_subdireccion()

    def clave_rama(nodo):
        # La Dirección (establecimiento 1) tiene 4 subdirecciones con nombre propio. Cada
        # hospital de la red usa varios `subdireccion_id` SIN nombre propio: se agrupan bajo el
        # hospital (igual que PAC Cumplimiento), no 4 ramas con el mismo nombre.
        est = nodo['establecimiento_id']
        return (est, nodo['subdireccion_id']) if est == 1 else (est, None)

    def nombre_rama(clave):
        est, sub = clave
        if est == 1:
            return nombres_rama.get((est, sub), 'Sin Clasificar')
        return establecimientos.get(est, 'Sin Clasificar')

    hijos_de = defaultdict(list)
    raices = []
    for d_id, nodo in mapa.items():
        (raices if _es_raiz(nodo, mapa) else hijos_de[nodo['parent_id']]).append(d_id)

    visitados = set()

    def armar(d_id):
        visitados.add(d_id)
        nodo = mapa[d_id]
        return {
            'id': d_id,
            'nombre': nodo['descripcion'] or f'#{d_id}',
            'nombre_corto': nodo['nombre_corto'],
            'es_depto': nodo['es_depto'] == 'SI',
            # Para mover un departamento bajo otro hay que heredar su subdirección/establecimiento
            # (el árbol agrupa los hospitales y no deja ver su subdireccion_id real).
            'subdireccion_id': nodo['subdireccion_id'],
            'establecimiento_id': nodo['establecimiento_id'],
            'hijos': sorted(
                (armar(h) for h in hijos_de.get(d_id, ()) if h not in visitados),
                key=lambda n: n['nombre'],
            ),
        }

    por_rama = defaultdict(list)
    for d_id in raices:
        por_rama[clave_rama(mapa[d_id])].append(armar(d_id))
    # Ciclos: nodos que ninguna raíz alcanzó.
    for d_id, nodo in mapa.items():
        if d_id not in visitados:
            por_rama[clave_rama(nodo)].append(armar(d_id))

    return [
        {
            'clave': f'{est}-{sub or 0}',
            'establecimiento_id': est,
            'subdireccion_id': sub,
            'nombre': nombre_rama((est, sub)),
            'departamentos': sorted(deptos, key=lambda n: n['nombre']),
        }
        for (est, sub), deptos in sorted(por_rama.items(), key=lambda kv: (kv[0][0] or 0, kv[0][1] or 0))
    ]


def _contar_formularios(unidades):
    if not unidades:
        return 0
    return FormularioFSC.objects.filter(unidad_requirente__in=unidades).count()


def previsualizar_alcance_departamentos(departamento_ids):
    """Qué vería un gestor con estos departamentos, ANTES de guardar. Usa la misma
    `_construir_alcance` que el resolver real, así la vista previa no puede diferir de lo
    que el gestor verá después."""
    ids = _validar_ids_departamento(departamento_ids if departamento_ids is not None else [])
    if not ids:
        return {
            'departamentos': [], 'n_departamentos_en_alcance': 0,
            'n_unidades': 0, 'n_formularios': 0,
        }
    mapa = _mapa_departamentos()
    alcance = _construir_alcance(set(ids), 'gestor', 'propio', mapa)
    return {
        'departamentos': alcance['departamentos'],
        'n_departamentos_en_alcance': len(alcance['depto_ids']),
        'n_unidades': len(alcance['unidades']),
        'n_formularios': _contar_formularios(alcance['unidades']),
    }


# =============================================================================
# Ficha del usuario (lectura)
# =============================================================================

def _fila_panel(panel):
    if panel is None:
        return None
    return {
        'id': panel.id, 'usuario': panel.usuario, 'correo_electronico': panel.correo_electronico,
        'descripcion': panel.descripcion, 'activo': panel.activo,
        'establecimiento_id': panel.establecimiento_id, 'alias': panel.alias,
        'run': panel.run, 'cargo': panel.cargo,
    }


def obtener_ficha_usuario(usuario):
    """Todo lo necesario para editar a `usuario` en una sola respuesta."""
    perfil = PerfilUsuario.objects.filter(user_id=usuario.id).first()
    panel_id = perfil.panel_id if perfil else None
    panel = UsuarioPanel.objects.filter(id=panel_id).first() if panel_id else None

    mapa = _mapa_departamentos()
    nombres_rama, _ = _mapa_nombres_subdireccion()

    ids_panel = set()
    if panel_id:
        ids_panel = {
            d for d in PertenenciaUsuario.objects.filter(id_usuario=panel_id, tipo_dependencia='DEP')
            .values_list('id_dependencia', flat=True) if d in mapa
        }
    ids_propios = set(
        AsignacionDepartamentoUsuario.objects.filter(user_id=usuario.id).values_list('departamento_id', flat=True)
    )
    vigentes, origen, motivo = _departamentos_asignados_gestor(usuario, mapa)

    alcance = None
    if vigentes:
        a = _construir_alcance(vigentes, 'gestor', origen, mapa)
        alcance = {
            'departamentos': a['departamentos'],
            'n_departamentos_en_alcance': len(a['depto_ids']),
            'n_unidades': len(a['unidades']),
            'n_formularios': _contar_formularios(a['unidades']),
        }

    return {
        'id': usuario.id,
        'cuenta': {
            'username': usuario.username, 'email': usuario.email,
            'first_name': usuario.first_name, 'last_name': usuario.last_name,
            'is_active': usuario.is_active, 'is_staff': usuario.is_staff,
            'is_superuser': usuario.is_superuser,
            'date_joined': usuario.date_joined.isoformat() if usuario.date_joined else None,
            'last_login': usuario.last_login.isoformat() if usuario.last_login else None,
        },
        'perfil': {
            'role': perfil.role if perfil else 'viewer',
            'panel_id': panel_id,
            'establecimiento_id': perfil.establecimiento_id if perfil else None,
            'cargo': (perfil.cargo or '') if perfil else '',
            'run': (perfil.run or '') if perfil else '',
        },
        'panel': _fila_panel(panel),
        'organizacion': {
            'es_gestor': bool(perfil and perfil.role == 'gestor_compras'),
            'origen': origen if vigentes else 'ninguno',
            'motivo_sin_alcance': None if vigentes else motivo,
            'departamentos_panel': _describir_departamentos(ids_panel, mapa, nombres_rama),
            'departamentos_propios': _describir_departamentos(ids_propios, mapa, nombres_rama),
            'departamentos_propios_ids': sorted(ids_propios),
            'alcance': alcance,
        },
    }


def listar_usuarios_panel():
    """Usuarios del Panel SSO (≈480) para reasignar el vínculo de una cuenta. Incluye a qué
    cuenta del sistema ya están vinculados, para no elegir uno ocupado."""
    vinculos = {
        panel_id: username for panel_id, username in
        PerfilUsuario.objects.exclude(panel_id__isnull=True).values_list('panel_id', 'user__username')
    }
    return [
        {
            'id': p.id, 'alias': p.alias or p.usuario, 'correo': p.correo_electronico,
            'cargo': p.cargo or '', 'activo': p.activo == 'S',
            'vinculado_a': vinculos.get(p.id),
        }
        for p in UsuarioPanel.objects.all().order_by('alias', 'usuario')
    ]


# =============================================================================
# Guardado de la ficha (escritura, atómico)
# =============================================================================

def _validar_ids_departamento(ids):
    """Lista de ids de departamento limpia, sin repetidos y comprobada contra la jerarquía.
    `None` NO es una lista vacía: un null accidental no debe borrar la asignación."""
    if not isinstance(ids, (list, tuple, set)):
        raise ErrorAdministracion({'departamentos': 'Debe ser una lista de departamentos.'})
    limpios = []
    for crudo in ids:
        if isinstance(crudo, bool):
            raise ErrorAdministracion({'departamentos': 'Departamento inválido.'})
        try:
            valor = int(crudo)
        except (TypeError, ValueError):
            raise ErrorAdministracion({'departamentos': f'Departamento inválido: {crudo!r}.'})
        if valor not in limpios:
            limpios.append(valor)
    mapa = _mapa_departamentos()
    faltantes = [d for d in limpios if d not in mapa]
    if faltantes:
        raise ErrorAdministracion({'departamentos': f'No existe(n) en la organización: {faltantes}.'})
    return limpios


def _aplanar_errores_serializer(errores):
    """Errores DRF → {campo: 'mensaje'} legible (el cliente no muestra códigos en inglés)."""
    plano = {}
    for campo, detalle in errores.items():
        if isinstance(detalle, dict):
            plano[campo] = _aplanar_errores_serializer(detalle)
            continue
        primero = detalle[0] if isinstance(detalle, (list, tuple)) and detalle else detalle
        codigo = getattr(primero, 'code', None)
        if codigo == 'unique':
            plano[campo] = 'Ya existe otro registro con este valor.'
        elif codigo in ('blank', 'null', 'required'):
            plano[campo] = 'Campo obligatorio.'
        elif codigo == 'invalid_choice':
            plano[campo] = 'Valor no permitido.'
        else:
            plano[campo] = str(primero)
    return plano


def _snapshot_cuenta(usuario):
    return {c: getattr(usuario, c) for c in _CAMPOS_CUENTA_AUDITADOS}


def _snapshot_perfil(perfil):
    if perfil is None:
        return {c: None for c in CAMPOS_PERFIL}
    return {c: getattr(perfil, c) for c in CAMPOS_PERFIL}


def capturar_estado_cuenta_perfil(usuario):
    """(cuenta, perfil) tal como están HOY en la base — para comparar antes/después."""
    perfil = PerfilUsuario.objects.filter(user_id=usuario.id).first()
    return _snapshot_cuenta(usuario), _snapshot_perfil(perfil)


def diferencias_cuenta_perfil(usuario, antes, password_cambiada=False):
    """Compara `antes` (de `capturar_estado_cuenta_perfil`) con el estado actual."""
    usuario.refresh_from_db()
    despues_cuenta, despues_perfil = capturar_estado_cuenta_perfil(usuario)
    cambios_cuenta = _diferencias(antes[0], despues_cuenta)
    if password_cambiada:
        cambios_cuenta['password'] = ['—', 'actualizada']   # jamás el valor
    return cambios_cuenta, _diferencias(antes[1], despues_perfil)


def validar_autoproteccion(actor, usuario, is_active=None, role=None):
    """Un administrador no puede dejarse sin acceso a la administración: ni desactivar su propia
    cuenta ni quitarse el rol `admin` (un superusuario conserva el acceso igual)."""
    if usuario.pk != actor.pk or actor.is_superuser:
        return
    if is_active is False:
        raise ErrorAdministracion({'cuenta': {'is_active': 'No puedes desactivar tu propia cuenta.'}})
    if role and role != 'admin':
        raise ErrorAdministracion({'perfil': {'role': 'No puedes quitarte tu propio rol de administrador.'}})


def _registrar_cuenta_y_perfil(actor, usuario, cambios_cuenta, cambios_perfil):
    _registrar_auditoria(actor, AuditoriaAdmin.ENTIDAD_CUENTA, usuario.id, usuario.username,
                         cambios_cuenta, usuario_afectado=usuario)
    _registrar_auditoria(actor, AuditoriaAdmin.ENTIDAD_PERFIL, usuario.id, usuario.username,
                         cambios_perfil, usuario_afectado=usuario)


def auditar_actualizacion_usuario(actor, usuario, antes, password_cambiada=False):
    """Registra lo que cambió en cuenta/perfil. Lo usa también el PATCH clásico de /usuarios/{id}/
    (toggle Activo, rol masivo…), para que el historial no tenga huecos."""
    cambios_cuenta, cambios_perfil = diferencias_cuenta_perfil(usuario, antes, password_cambiada)
    _registrar_cuenta_y_perfil(actor, usuario, cambios_cuenta, cambios_perfil)


def auditar_alta_usuario(actor, usuario):
    perfil = PerfilUsuario.objects.filter(user_id=usuario.id).first()
    _registrar_auditoria(
        actor, AuditoriaAdmin.ENTIDAD_CUENTA, usuario.id, usuario.username,
        {'cuenta': [None, 'creada'], 'username': [None, usuario.username],
         'role': [None, perfil.role if perfil else 'viewer']},
        usuario_afectado=usuario,
    )


def auditar_baja_usuario(actor, usuario):
    """Llamar ANTES de borrar: la FK `usuario_afectado` queda en NULL, la etiqueta se conserva."""
    _registrar_auditoria(
        actor, AuditoriaAdmin.ENTIDAD_CUENTA, usuario.id, usuario.username,
        {'cuenta': ['existía', 'eliminada'], 'username': [usuario.username, None]},
    )


def _actualizar_cuenta_y_perfil(actor, usuario, cuenta, perfil):
    """Cuenta + perfil por el serializer de siempre. Devuelve (cambios_cuenta, cambios_perfil)."""
    cuenta = dict(cuenta or {})
    perfil = dict(perfil or {})

    desconocidos = {c: 'Este campo no se puede editar.' for c in cuenta if c not in CAMPOS_CUENTA}
    if desconocidos:
        raise ErrorAdministracion({'cuenta': desconocidos})
    desconocidos = {c: 'Este campo no se puede editar.' for c in perfil if c not in CAMPOS_PERFIL}
    if desconocidos:
        raise ErrorAdministracion({'perfil': desconocidos})

    validar_autoproteccion(actor, usuario, cuenta.get('is_active'), perfil.get('role'))

    # Gotcha documentado del módulo: un IntegerField rechaza '' — el vacío llega como null.
    if perfil.get('establecimiento_id') == '':
        perfil['establecimiento_id'] = None

    clave = cuenta.get('password')
    if clave is not None and clave != '' and len(str(clave)) < MIN_LARGO_CLAVE:
        raise ErrorAdministracion({'cuenta': {'password': f'Mínimo {MIN_LARGO_CLAVE} caracteres.'}})
    if clave in (None, ''):
        cuenta.pop('password', None)

    if 'panel_id' in perfil:
        panel_id = perfil['panel_id']
        if panel_id in ('', None):
            perfil['panel_id'] = None
        else:
            try:
                panel_id = int(panel_id)
            except (TypeError, ValueError):
                raise ErrorAdministracion({'perfil': {'panel_id': 'Debe ser un número entero.'}})
            if not UsuarioPanel.objects.filter(id=panel_id).exists():
                raise ErrorAdministracion({'perfil': {'panel_id': 'No existe ese usuario en el Panel SSO.'}})
            otro = PerfilUsuario.objects.filter(panel_id=panel_id).exclude(user_id=usuario.id).select_related('user').first()
            if otro:
                raise ErrorAdministracion({'perfil': {
                    'panel_id': f'Ya está vinculado a la cuenta {otro.user.username}.',
                }})
            perfil['panel_id'] = panel_id

    if not cuenta and not perfil:
        return {}, {}

    antes = capturar_estado_cuenta_perfil(usuario)

    datos = dict(cuenta)
    if perfil:
        datos['perfil'] = perfil
    serializer = UserAdminSerializer(usuario, data=datos, partial=True)
    if not serializer.is_valid():
        errores = _aplanar_errores_serializer(serializer.errors)
        raise ErrorAdministracion({
            'cuenta': {k: v for k, v in errores.items() if k != 'perfil'},
            'perfil': errores.get('perfil', {}),
        })
    serializer.save()
    return diferencias_cuenta_perfil(usuario, antes, password_cambiada=bool(cuenta.get('password')))


def _actualizar_fila_panel(usuario, cambios):
    """Edita la fila de `data_usuario_panel` vinculada a la cuenta. Devuelve (panel, cambios)."""
    perfil = PerfilUsuario.objects.filter(user_id=usuario.id).first()
    if not perfil or not perfil.panel_id:
        raise ErrorAdministracion({'panel': 'La cuenta no está vinculada a un usuario del Panel SSO.'})
    panel = UsuarioPanel.objects.filter(id=perfil.panel_id).first()
    if panel is None:
        raise ErrorAdministracion({'panel': 'El usuario del Panel SSO vinculado ya no existe.'})

    limpios = _limpiar_cambios(cambios, CAMPOS_PANEL, 'panel')
    # OJO: en `data_usuario_panel` (y en la mayoría de los perfiles) `establecimiento_id` guarda el
    # CÓDIGO del Panel (197-203), no `Establecimiento.id` (1-7) — que es lo que usa data_departamento.
    if 'establecimiento_id' in limpios and not Establecimiento.objects.filter(
            codigo=limpios['establecimiento_id']).exists():
        raise ErrorAdministracion({'panel': {'establecimiento_id': 'No existe ese establecimiento.'}})

    antes = {c: getattr(panel, c) for c in limpios}
    diferencias = _diferencias(antes, limpios)
    if diferencias:
        for campo, (_, nuevo) in diferencias.items():
            setattr(panel, campo, nuevo)
        panel.save(update_fields=list(diferencias))
    return panel, diferencias


def _actualizar_asignacion(actor, usuario, ids):
    """Reemplaza el conjunto de departamentos asignados a mano. Lista vacía = quitar la
    asignación propia y volver a la pertenencia del Panel. Devuelve el cambio para auditar."""
    nuevos = _validar_ids_departamento(ids)
    actuales = set(
        AsignacionDepartamentoUsuario.objects.filter(user_id=usuario.id).values_list('departamento_id', flat=True)
    )
    a_crear = [d for d in nuevos if d not in actuales]
    a_quitar = actuales - set(nuevos)
    if not a_crear and not a_quitar:
        return {}
    if a_quitar:
        AsignacionDepartamentoUsuario.objects.filter(user_id=usuario.id, departamento_id__in=a_quitar).delete()
    AsignacionDepartamentoUsuario.objects.bulk_create([
        AsignacionDepartamentoUsuario(user=usuario, departamento_id=d, asignado_por=actor) for d in a_crear
    ])
    mapa = _mapa_departamentos()
    nombre = lambda d: (mapa.get(d) or {}).get('descripcion') or f'#{d}'  # noqa: E731
    return {'departamentos': [
        sorted(nombre(d) for d in actuales) or ['(la del Panel SSO)'],
        sorted(nombre(d) for d in nuevos) or ['(la del Panel SSO)'],
    ]}


def aplicar_cambios_ficha(actor, usuario, payload):
    """Aplica en UNA transacción las secciones presentes en `payload`:
        {cuenta?: {...}, perfil?: {...}, panel?: {...}, departamentos?: [ids]}
    Si cualquiera falla no se guarda nada. Retorna la ficha ya actualizada."""
    if not isinstance(payload, dict):
        raise ErrorAdministracion({'detail': 'Cuerpo inválido.'})
    desconocidas = set(payload) - {'cuenta', 'perfil', 'panel', 'departamentos'}
    if desconocidas:
        raise ErrorAdministracion({'detail': f'Secciones no reconocidas: {sorted(desconocidas)}.'})

    with transaction.atomic():
        cambios_cuenta, cambios_perfil = _actualizar_cuenta_y_perfil(
            actor, usuario, payload.get('cuenta'), payload.get('perfil'),
        )
        _registrar_cuenta_y_perfil(actor, usuario, cambios_cuenta, cambios_perfil)

        if payload.get('panel'):
            panel, cambios_panel = _actualizar_fila_panel(usuario, payload['panel'])
            _registrar_auditoria(actor, AuditoriaAdmin.ENTIDAD_PANEL, panel.id,
                                 panel.alias or panel.correo_electronico, cambios_panel,
                                 usuario_afectado=usuario)

        if 'departamentos' in payload:
            cambios_asig = _actualizar_asignacion(actor, usuario, payload['departamentos'])
            _registrar_auditoria(actor, AuditoriaAdmin.ENTIDAD_ASIGNACION, usuario.id, usuario.username,
                                 cambios_asig, usuario_afectado=usuario)

    # Fuera de la transacción (solo si confirmó): el cambio debe verse YA, no a los 60 s.
    invalidar_cache_alcance_gestor(usuario.id)
    cache.delete('gestor_departamentos_gestionables')
    return obtener_ficha_usuario(User.objects.get(pk=usuario.pk))


# =============================================================================
# Jerarquía (data_departamento)
# =============================================================================

def _unidades_que_calzan(depto):
    """Valores de `FormularioFSC.unidad_requirente` que hoy resuelven a este departamento
    (mismo match normalizado que usa la clasificación Dentro/Fuera PAC y el alcance)."""
    claves = {_normalizar_texto_pac(depto.descripcion)}
    if depto.nombre_corto:
        claves.add(_normalizar_texto_pac(depto.nombre_corto))
    claves.discard('')
    unidades = (
        FormularioFSC.objects.exclude(unidad_requirente__isnull=True).exclude(unidad_requirente='')
        .order_by().values_list('unidad_requirente', flat=True).distinct()
    )
    return sorted(u for u in unidades if _normalizar_texto_pac(u) in claves)


def _descendientes(depto_id, mapa):
    hijos_de = defaultdict(list)
    for d_id, nodo in mapa.items():
        if not _es_raiz(nodo, mapa):
            hijos_de[nodo['parent_id']].append(d_id)
    encontrados, pila = set(), list(hijos_de.get(depto_id, ()))
    while pila:
        actual = pila.pop()
        if actual in encontrados or actual == depto_id:
            continue
        encontrados.add(actual)
        pila.extend(hijos_de.get(actual, ()))
    return encontrados


def detalle_departamento(depto_id):
    """Lo que el administrador necesita saber ANTES de editar un departamento."""
    depto = Departamento.objects.filter(id=depto_id).first()
    if depto is None:
        raise ErrorAdministracion({'detail': 'Departamento no encontrado.'}, status=404)
    mapa = _mapa_departamentos()
    nombres_rama, _ = _mapa_nombres_subdireccion()
    unidades = _unidades_que_calzan(depto)
    return {
        'id': depto.id,
        'descripcion': depto.descripcion, 'nombre_corto': depto.nombre_corto,
        'parent_id': depto.parent_id, 'subdireccion_id': depto.subdireccion_id,
        'establecimiento_id': depto.establecimiento_id, 'es_depto': depto.es_depto,
        'ruta': _ruta_departamento(depto.id, mapa, nombres_rama),
        'impacto': {
            'n_sub_departamentos': len(_descendientes(depto.id, mapa)),
            'n_usuarios_panel': PertenenciaUsuario.objects.filter(
                id_dependencia=depto.id, tipo_dependencia='DEP').count(),
            'n_usuarios_asignados': AsignacionDepartamentoUsuario.objects.filter(
                departamento_id=depto.id).count(),
            'unidades_formularios': unidades,
            'n_formularios': _contar_formularios(unidades),
        },
    }


def _validar_padre(depto, padre_id, mapa):
    if padre_id is None:
        return
    if padre_id == depto.id:
        raise ErrorAdministracion({'departamento': {'parent_id': 'Un departamento no puede ser su propio padre.'}})
    if padre_id not in mapa:
        raise ErrorAdministracion({'departamento': {'parent_id': 'El departamento padre no existe.'}})
    # Ciclo: subiendo desde el nuevo padre no se debe llegar a este departamento.
    visitados, actual = set(), padre_id
    while actual is not None and actual not in visitados:
        if actual == depto.id:
            raise ErrorAdministracion({'departamento': {
                'parent_id': 'Crearía un ciclo: ese departamento depende de este.',
            }})
        visitados.add(actual)
        actual = (mapa.get(actual) or {}).get('parent_id')


def editar_departamento(actor, depto_id, cambios, reclasificar=False):
    """Edita un departamento existente. No crea ni borra (la tabla es un espejo del Panel y su
    `id` no es autoincremental). Con `reclasificar`, recalcula Dentro/Fuera PAC y el
    departamento de los formularios — hace falta si cambió el nombre, porque el vínculo
    formulario → departamento es por NOMBRE y se fija en cada sync."""
    depto = Departamento.objects.filter(id=depto_id).first()
    if depto is None:
        raise ErrorAdministracion({'detail': 'Departamento no encontrado.'}, status=404)

    limpios = _limpiar_cambios(cambios, CAMPOS_DEPARTAMENTO, 'departamento')
    if 'establecimiento_id' in limpios and not Establecimiento.objects.filter(id=limpios['establecimiento_id']).exists():
        raise ErrorAdministracion({'departamento': {'establecimiento_id': 'No existe ese establecimiento.'}})
    if 'parent_id' in limpios:
        mapa = _mapa_departamentos()
        _validar_padre(depto, limpios['parent_id'], mapa)
        # Un departamento solo "cuelga" de su padre si comparte subdirección y establecimiento
        # (si no, el sistema lo trata como de primer nivel): al mover bajo otro padre, hereda los
        # suyos salvo que el administrador los indique explícitamente.
        padre = mapa.get(limpios['parent_id'])
        if padre:
            limpios.setdefault('subdireccion_id', padre['subdireccion_id'])
            limpios.setdefault('establecimiento_id', padre['establecimiento_id'])

    resumen_reclasificacion = None
    with transaction.atomic():
        antes = {c: getattr(depto, c) for c in limpios}
        diferencias = _diferencias(antes, limpios)
        if diferencias:
            for campo, (_, nuevo) in diferencias.items():
                setattr(depto, campo, nuevo)
            depto.save(update_fields=list(diferencias))
            _registrar_auditoria(actor, AuditoriaAdmin.ENTIDAD_DEPARTAMENTO, depto.id,
                                 depto.descripcion, diferencias)

    if diferencias:
        # Misma práctica que tras cada sync: la jerarquía alimenta decenas de cálculos
        # cacheados (PAC Cumplimiento, alcance de gestores, rankings…).
        cache.clear()
        if reclasificar:
            resumen_reclasificacion = reclasificar_dentro_fuera_pac()

    ficha = detalle_departamento(depto.id)
    ficha['reclasificacion'] = resumen_reclasificacion
    ficha['cambios'] = diferencias
    return ficha
