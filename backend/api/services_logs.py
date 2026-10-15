"""Servicio central de LOGS — Administración › Logs.

Un único punto para registrar y consultar lo que ocurre en el sistema, en tres categorías:

  AUTH          accesos y seguridad   (login éxito/fallo, fuerza bruta, 403, cambio de contraseña)
  AUDIT         actividad del sistema (usuarios, roles, organización, envíos, actualizaciones de datos)
  SYSTEM_ERROR  errores y diagnóstico (excepciones, base de datos, APIs externas, recursos)

Uso desde cualquier parte del backend (singleton `logs`):

    from .services_logs import logs
    logs.auth('LOGIN_FAILED', 'Intento fallido', nivel='WARN', request=request)
    logs.audit('USER_UPDATED', 'admin cambió el rol de ana', actor=request.user, metadata={...})
    logs.error('ETL_FAILED', 'Falló la actualización de OC', exc=exc)

Garantías (lo que hay que conservar al modificar este archivo):
  · NUNCA lanza excepciones al llamador: un log que no se pudo guardar no puede tirar una vista,
    un ETL ni un login. Lo no guardado va a un archivo rotativo de respaldo (`bd_sistema.logs`).
  · NO bloquea: las filas se encolan y un único hilo daemon las inserta en lotes. La cola es
    acotada: si se llena se descarta (y se cuenta) antes que frenar la aplicación.
  · NUNCA guarda secretos: `_sanear()` enmascara contraseñas/tokens por nombre de clave y por
    patrón en los textos. Las vistas no registran cuerpos de petición.
  · `message` siempre es una frase en español que cualquier persona entiende; lo técnico va
    en `metadata`.

Este módulo se importa durante la configuración de logging (antes de que Django cargue las apps):
por eso el modelo `RegistroLog` se importa de forma perezosa dentro de las funciones.
"""
import atexit
import contextvars
import ipaddress
import json
import logging
import queue
import re
import shutil
import threading
import time
import traceback
from datetime import datetime, time as _hora, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import connection, close_old_connections
from django.db import Error as _ErrorBD, InterfaceError as _InterfaceErrorBD, OperationalError as _OperationalErrorBD
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

# Respaldo cuando la BD no puede recibir el log (archivo rotativo, ver LOGGING en settings).
_respaldo_log = logging.getLogger('bd_sistema.logs')

CAT_AUTH, CAT_AUDIT, CAT_ERROR = 'AUTH', 'AUDIT', 'SYSTEM_ERROR'
INFO, WARN, ERROR, CRITICAL = 'INFO', 'WARN', 'ERROR', 'CRITICAL'
NIVELES = (INFO, WARN, ERROR, CRITICAL)

CATEGORIAS_ETIQUETA = {
    CAT_AUTH:  'Accesos y seguridad',
    CAT_AUDIT: 'Actividad del sistema',
    CAT_ERROR: 'Errores y diagnóstico',
}
NIVELES_ETIQUETA = {INFO: 'Informativo', WARN: 'Advertencia', ERROR: 'Error', CRITICAL: 'Crítico'}

# ─── Catálogo de acciones: código → (categoría, título corto, explicación para cualquier persona) ──
ACCIONES = {
    # Accesos y seguridad
    'LOGIN_SUCCESS': (CAT_AUTH, 'Inicio de sesión correcto',
                      'Una persona ingresó al sistema con su usuario y contraseña.'),
    'LOGIN_FAILED': (CAT_AUTH, 'Intento de acceso fallido',
                     'Alguien intentó ingresar con un usuario o una contraseña incorrectos. Un caso aislado '
                     'es normal (error al teclear); muchos seguidos pueden ser un intento de intrusión.'),
    'LOGIN_INACTIVE_ACCOUNT': (CAT_AUTH, 'Acceso con cuenta desactivada',
                               'Alguien intentó ingresar con una cuenta que un administrador desactivó.'),
    'BRUTE_FORCE_SUSPECTED': (CAT_AUTH, 'Posible ataque de fuerza bruta',
                              'Hubo muchos intentos fallidos seguidos desde la misma dirección o sobre el mismo '
                              'usuario. Conviene revisar de quién se trata. El sistema solo avisa: no bloquea la cuenta.'),
    'ACCESS_DENIED': (CAT_AUTH, 'Acceso denegado',
                      'Una persona con sesión iniciada intentó abrir o hacer algo para lo que su rol no tiene permiso.'),
    'PASSWORD_CHANGED': (CAT_AUTH, 'Cambio de contraseña',
                         'Se cambió la contraseña de una cuenta. El valor de la contraseña nunca se guarda en el registro.'),
    'ACCOUNT_DEACTIVATED': (CAT_AUTH, 'Cuenta desactivada',
                            'Un administrador desactivó una cuenta: esa persona ya no puede ingresar al sistema.'),
    'ACCOUNT_ACTIVATED': (CAT_AUTH, 'Cuenta reactivada',
                          'Un administrador volvió a activar una cuenta que estaba desactivada.'),
    # Actividad del sistema
    'USER_CREATED': (CAT_AUDIT, 'Usuario creado', 'Un administrador creó una cuenta nueva.'),
    'USER_UPDATED': (CAT_AUDIT, 'Usuario modificado', 'Un administrador cambió datos de una cuenta (nombre, correo, estado…).'),
    'USER_DELETED': (CAT_AUDIT, 'Usuario eliminado', 'Un administrador eliminó una cuenta.'),
    'ROLE_CHANGED': (CAT_AUDIT, 'Rol cambiado',
                     'Se cambió el rol de una persona, es decir, a qué módulos del sistema puede entrar.'),
    'PANEL_USER_UPDATED': (CAT_AUDIT, 'Datos del Panel SSO modificados',
                           'Un administrador cambió los datos de una persona espejados desde el Panel SSO.'),
    'DEPARTMENT_ASSIGNED': (CAT_AUDIT, 'Departamento asignado',
                            'Un administrador cambió el departamento que ve un Gestor de Compras.'),
    'DEPARTMENT_EDITED': (CAT_AUDIT, 'Departamento modificado',
                          'Un administrador cambió la jerarquía de departamentos (nombre, dependencia). '
                          'Afecta a toda la organización.'),
    'ADMIN_ACTION': (CAT_AUDIT, 'Acción administrativa',
                     'Una persona ejecutó una acción en una sección crítica del sistema (administración, '
                     'envíos masivos, actualización de datos).'),
    # Errores y diagnóstico
    'UNHANDLED_EXCEPTION': (CAT_ERROR, 'Error interno no controlado',
                            'El sistema falló de forma inesperada al atender una solicitud. El detalle técnico '
                            'está en la ficha del evento, para quien deba corregirlo.'),
    'SERVER_ERROR_RESPONSE': (CAT_ERROR, 'Respuesta de error del servidor',
                              'El servidor respondió con un error (código 5xx) y la persona no pudo completar lo que hacía.'),
    'DATABASE_ERROR': (CAT_ERROR, 'Falla de base de datos',
                       'Una consulta a la base de datos falló o no hubo conexión con ella.'),
    'EXTERNAL_SERVICE_ERROR': (CAT_ERROR, 'Falla de un servicio externo',
                               'No se pudo conectar con un servicio externo (Mercado Público, SIGFE, Panel SSO, correo…).'),
    'ETL_FAILED': (CAT_ERROR, 'Falló una actualización de datos',
                   'Una carga de datos (licitaciones, órdenes de compra, formularios, SIGFE…) terminó con error.'),
    'APP_ERROR': (CAT_ERROR, 'Error registrado por la aplicación',
                  'Una parte del sistema detectó un problema y lo dejó anotado.'),
    'RESOURCE_ALERT': (CAT_ERROR, 'Alerta de recursos del servidor',
                       'El servidor tiene un recurso al límite (espacio en disco, base de datos…).'),
    'LOG_QUEUE_OVERFLOW': (CAT_ERROR, 'Registros descartados',
                           'Se generaron más eventos de los que se pudieron guardar y algunos se descartaron.'),
}

_ETIQUETAS_RUTA = [
    ('/api/usuarios/', 'Administración de usuarios'),
    ('/api/organizacion/', 'Organización y departamentos'),
    ('/api/departamentos/', 'Departamentos'),
    ('/api/logs/', 'Registro de logs'),
    ('/api/licitaciones/', 'Licitaciones'),
    ('/api/ordenes-compra', 'Órdenes de Compra'),
    ('/api/compraagil', 'Compra Ágil'),
    ('/api/pac-cumplimiento/', 'Cumplimiento Interno PAC'),
    ('/api/pac/', 'PAC (Res. 188)'),
    ('/api/planer-pac/', 'Plan Anual de Compras'),
    ('/api/formularios-pac', 'Formularios PAC'),
    ('/api/formularios', 'Formularios FSC'),
    ('/api/fsc-oc-pac/', 'Enlace FSC-OC-PAC'),
    ('/api/contratos/', 'Contratos'),
    ('/api/boletas-garantia', 'Boletas de garantía'),
    ('/api/gestor-compras/notificacion/', 'Notificaciones del Plan de Compras'),
    ('/api/gestor-compras/', 'Gestor de Compras'),
    ('/api/compras-', 'Gestión de Compras'),
    ('/api/devengo-sigfe-anual/', 'Anexo N°3 (deuda SIGFE)'),
    ('/api/sigfe-anexo1/', 'Anexo N°1 (SIGFE)'),
    ('/api/facturas/', 'Facturas DIPRES'),
    ('/api/inicio/', 'Inicio'),
]


def titulo_accion(codigo):
    return ACCIONES.get(codigo, (None, codigo, ''))[1]


def explicacion_accion(codigo):
    return ACCIONES.get(codigo, (None, codigo, ''))[2]


def etiqueta_ruta(ruta):
    """Nombre del módulo al que pertenece una ruta de la API (o la ruta tal cual)."""
    for prefijo, etiqueta in _ETIQUETAS_RUTA:
        if (ruta or '').startswith(prefijo):
            return etiqueta
    return ruta or ''


# ─── Saneado: jamás secretos en el registro ───────────────────────────────────

_CLAVE_SENSIBLE = re.compile(
    r'pass|pwd|clave|secret|token|authorization|cookie|api[_-]?key|ticket|credencial|^refresh$|^access$', re.I)
_TEXTO_SENSIBLE = re.compile(
    r'(?i)\b(password|passwd|pwd|clave|token|secret|api[_-]?key|authorization)\b(\s*[=:]\s*)(?:Bearer\s+)?[^\s,;&\'"]+')
_MAX_TEXTO = 2000
_MAX_PILA = 8000
_MAX_JSON = 20000


def _limpiar_texto(valor, maximo=_MAX_TEXTO):
    """Texto sin secretos y de largo <= `maximo` (incluida la elipsis: las columnas tienen tope)."""
    texto = _TEXTO_SENSIBLE.sub(r'\1\2***', str(valor))
    return texto if len(texto) <= maximo else texto[:maximo - 1] + '…'


def _sanear(valor, profundidad=0, maximo=_MAX_TEXTO):
    """Copia segura de `valor` para guardar como JSON: enmascara claves sensibles y acota tamaños."""
    if profundidad > 6:
        return '…'
    if isinstance(valor, dict):
        return {
            str(k)[:100]: (
                '***' if _CLAVE_SENSIBLE.search(str(k))
                else _sanear(v, profundidad + 1, _MAX_PILA if str(k) == 'stack_trace' else _MAX_TEXTO)
            )
            for k, v in list(valor.items())[:100]
        }
    if isinstance(valor, (list, tuple, set)):
        return [_sanear(v, profundidad + 1) for v in list(valor)[:50]]
    if isinstance(valor, (int, float, bool)) or valor is None:
        return valor
    return _limpiar_texto(valor, maximo)


# ─── Contexto de la petición HTTP en curso (lo abre el middleware) ────────────

_contexto = contextvars.ContextVar('registro_logs_contexto', default=None)


def obtener_ip(request):
    """IP de origen. `X-Forwarded-For` solo se respeta si la conexión directa viene de un proxy
    confiable (por defecto el propio servidor): si no, cualquiera podría falsearla."""
    meta = getattr(request, 'META', None) or {}
    ip = meta.get('REMOTE_ADDR', '') or ''
    if ip in getattr(settings, 'LOGS_PROXIES_CONFIABLES', ('127.0.0.1', '::1')):
        reenviada = meta.get('HTTP_X_FORWARDED_FOR', '')
        if reenviada:
            ip = reenviada.split(',')[0].strip()
    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return None


def abrir_contexto(request):
    return _contexto.set({
        'request': request,
        'ip': obtener_ip(request),
        'audit_emitidos': 0,    # el middleware no repite lo que un servicio ya auditó con detalle
        'error_emitido': False,  # …ni el error que process_exception ya registró
    })


def cerrar_contexto(token):
    try:
        _contexto.reset(token)
    except (ValueError, LookupError):
        pass


def contexto_actual():
    return _contexto.get()


# ─── Construcción del registro ────────────────────────────────────────────────

def _modelo():
    from .models import RegistroLog
    return RegistroLog


def _rol_de(user):
    try:
        return user.perfil.role
    except Exception:
        return 'admin' if getattr(user, 'is_superuser', False) else ''


def resolver_actor(actor, request):
    """(id, username, rol) de quien hizo la acción; ('ANONYMOUS') si nadie inició sesión."""
    user = actor
    if user is None and request is not None:
        try:
            user = getattr(request, 'user', None)
        except Exception:   # la autenticación de DRF puede fallar con un token inválido
            user = None
    if user is not None and getattr(user, 'is_authenticated', False):
        return user.pk, (user.get_username() or '')[:150] or 'ANONYMOUS', _rol_de(user)
    return None, 'ANONYMOUS', ''


def _construir(categoria, nivel, accion, mensaje, *, request=None, actor=None, metadata=None,
               status_code=None, ip=None):
    ctx = contexto_actual() or {}
    req = request if request is not None else ctx.get('request')
    actor_id, username, rol = resolver_actor(actor, req)
    meta_req = getattr(req, 'META', None) or {}
    datos = _sanear(metadata or {})
    if not isinstance(datos, dict):
        datos = {'valor': datos}
    if len(json.dumps(datos, default=str)) > _MAX_JSON:
        datos = {'truncado': True, 'resumen': _limpiar_texto(json.dumps(datos, default=str), 4000)}
    if ip is None and req is not None:
        ip = ctx['ip'] if ctx.get('request') is req else obtener_ip(req)
    return _modelo()(
        timestamp=timezone.now(),
        level=nivel if nivel in NIVELES else INFO,
        category=categoria,
        action=str(accion)[:60],
        message=_limpiar_texto(mensaje or titulo_accion(accion), 500),
        actor_id=actor_id, actor_username=username, actor_role=rol[:50],
        ip_address=ip,
        user_agent=str(meta_req.get('HTTP_USER_AGENT', ''))[:400],
        http_method=(getattr(req, 'method', '') or '')[:10],
        path=(getattr(req, 'path', '') or '')[:300],
        status_code=status_code,
        metadata=datos,
    )


# ─── Escritura asíncrona ──────────────────────────────────────────────────────

_cola = None
_hilo = None
_candado = threading.Lock()
_estadisticas = {'encolados': 0, 'guardados': 0, 'descartados': 0, 'fallidos': 0}


def _a_dict(r):
    return {
        'timestamp': r.timestamp.isoformat(), 'level': r.level, 'category': r.category, 'action': r.action,
        'message': r.message, 'actor': r.actor_username, 'ip': r.ip_address, 'path': r.path,
        'status_code': r.status_code, 'metadata': r.metadata,
    }


def _respaldar(lote, motivo):
    for r in lote:
        try:
            _respaldo_log.error('LOG_NO_GUARDADO (%s) %s', motivo, json.dumps(_a_dict(r), default=str, ensure_ascii=False))
        except Exception:
            pass


def _guardar_lote(lote, en_hilo_propio=False):
    """Inserta el lote. Si falla en bloque reintenta fila por fila para que una sola fila
    inválida no se lleve a las demás; lo que no se pueda guardar va al archivo de respaldo.
    `en_hilo_propio`: solo el hilo escritor puede cerrar/reabrir su conexión (en modo
    síncrono la conexión es la de la petición o de la prueba, quizá dentro de una transacción)."""
    modelo = _modelo()
    try:
        if en_hilo_propio:
            close_old_connections()
        modelo.objects.bulk_create(lote)
        _estadisticas['guardados'] += len(lote)
        return
    except Exception:
        pass
    for registro in lote:
        try:
            registro.pk = None
            registro.save(force_insert=True)
            _estadisticas['guardados'] += 1
        except Exception as exc:
            _estadisticas['fallidos'] += 1
            _respaldar([registro], f'{type(exc).__name__}: {exc}')
    if en_hilo_propio:
        try:
            connection.close()   # por si la conexión quedó rota; el próximo lote la reabre
        except Exception:
            pass


def _bucle_escritor(cola):
    while True:
        lote = [cola.get()]
        try:
            while len(lote) < 200:
                try:
                    lote.append(cola.get_nowait())
                except queue.Empty:
                    break
            _guardar_lote(lote, en_hilo_propio=True)
        except Exception:
            _respaldo_log.exception('Falló el hilo escritor de logs')
        finally:
            for _ in lote:
                cola.task_done()


def _asegurar_hilo():
    global _cola, _hilo
    if _hilo is not None and _hilo.is_alive():
        return
    with _candado:
        if _cola is None:
            _cola = queue.Queue(maxsize=int(getattr(settings, 'LOGS_COLA_MAX', 5000)))
            atexit.register(vaciar_cola, 3)
        if _hilo is None or not _hilo.is_alive():
            _hilo = threading.Thread(target=_bucle_escritor, args=(_cola,), name='registro-logs', daemon=True)
            _hilo.start()


def _encolar(registro):
    if not getattr(settings, 'LOGS_ASYNC', True):
        _guardar_lote([registro])
        return
    _asegurar_hilo()
    try:
        _cola.put_nowait(registro)
        _estadisticas['encolados'] += 1
    except queue.Full:
        _estadisticas['descartados'] += 1
        _respaldar([registro], 'cola llena')


def vaciar_cola(timeout=10):
    """Espera a que se escriba lo pendiente (cierre del proceso, comandos, pruebas)."""
    if _cola is None:
        return
    limite = time.monotonic() + timeout
    while _cola.unfinished_tasks and time.monotonic() < limite:
        time.sleep(0.02)


def estado_cola():
    return {
        'pendientes': _cola.qsize() if _cola is not None else 0,
        'capacidad': int(getattr(settings, 'LOGS_COLA_MAX', 5000)),
        **_estadisticas,
    }


# ─── Clasificación de excepciones ─────────────────────────────────────────────

_MODULOS_EXTERNOS = {'requests', 'urllib3', 'urllib', 'ssl', 'socket', 'http', 'selenium', 'smtplib'}


def clasificar_excepcion(exc):
    """(acción, nivel, descripción legible) según el tipo de fallo."""
    if isinstance(exc, (_OperationalErrorBD, _InterfaceErrorBD)):
        return 'DATABASE_ERROR', CRITICAL, 'No se pudo comunicar con la base de datos'
    if isinstance(exc, _ErrorBD):
        return 'DATABASE_ERROR', ERROR, 'La base de datos rechazó una consulta'
    raiz = (type(exc).__module__ or '').split('.')[0]
    if isinstance(exc, (ConnectionError, TimeoutError)) or raiz in _MODULOS_EXTERNOS:
        return 'EXTERNAL_SERVICE_ERROR', ERROR, 'Falló la conexión con un servicio externo'
    return 'UNHANDLED_EXCEPTION', ERROR, 'Error interno no controlado'


_MARCADORES = re.compile(r'(?m)^[ \t]*[\^~]+[ \t]*\r?\n')


def _pila(exc):
    """Stack trace como texto. Si es muy largo se conserva el FINAL (ahí está la causa)."""
    texto = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    texto = _limpiar_texto(_MARCADORES.sub('', texto), 10 ** 6)
    return texto if len(texto) <= _MAX_PILA else '…' + texto[-(_MAX_PILA - 1):]


# ─── API pública: el singleton `logs` ─────────────────────────────────────────

class RegistroLogger:
    """Fachada de escritura. Todos los métodos son seguros: nunca lanzan."""

    def _emitir(self, categoria, accion, mensaje, nivel=INFO, **kw):
        try:
            _encolar(_construir(categoria, nivel, accion, mensaje, **kw))
        except Exception:
            try:
                _respaldo_log.exception('No se pudo emitir el log %s', accion)
            except Exception:
                pass

    def auth(self, accion, mensaje='', *, nivel=INFO, **kw):
        """Accesos y seguridad. kw: request, actor, metadata, status_code, ip."""
        self._emitir(CAT_AUTH, accion, mensaje, nivel, **kw)

    def audit(self, accion, mensaje='', *, nivel=INFO, **kw):
        """Actividad del sistema (quién hizo qué). kw: request, actor, metadata, status_code, ip."""
        ctx = contexto_actual()
        if ctx is not None:
            ctx['audit_emitidos'] += 1
        self._emitir(CAT_AUDIT, accion, mensaje, nivel, **kw)

    def error(self, accion, mensaje='', *, nivel=ERROR, exc=None, **kw):
        """Errores y diagnóstico. Con `exc` agrega tipo y stack trace a `metadata`."""
        try:
            if exc is not None:
                meta = dict(kw.pop('metadata', None) or {})
                meta.setdefault('tipo_excepcion', type(exc).__name__)
                meta.setdefault('detalle', _limpiar_texto(str(exc), 1000))
                meta['stack_trace'] = _pila(exc)
                kw['metadata'] = meta
        except Exception:
            pass
        self._emitir(CAT_ERROR, accion, mensaje, nivel, **kw)

    def excepcion(self, exc, *, request=None, contexto='', metadata=None):
        """Registra una excepción clasificándola (BD, servicio externo, error interno)."""
        try:
            accion, nivel, descripcion = clasificar_excepcion(exc)
            req = request if request is not None else (contexto_actual() or {}).get('request')
            donde = f' al atender {req.method} {req.path}' if req is not None else ''
            if contexto:
                donde = f' en {contexto}'
            ctx = contexto_actual()
            if ctx is not None:
                ctx['error_emitido'] = True
            self.error(
                accion, f'{descripcion}{donde} ({type(exc).__name__}).', nivel=nivel, exc=exc,
                request=request, status_code=500 if req is not None else None, metadata=metadata,
            )
        except Exception:
            pass


logs = RegistroLogger()


# ─── Enganches de eventos concretos ───────────────────────────────────────────

def _enmascarar_usuario(texto):
    """Usuario inexistente: una persona puede haber escrito su CONTRASEÑA en el campo usuario,
    así que no se guarda tal cual (solo el comienzo y el largo)."""
    texto = texto or ''
    return f'{texto[:2]}***({len(texto)} caracteres)' if texto else '(vacío)'


def registrar_login_exitoso(request, user):
    logs.auth(
        'LOGIN_SUCCESS', f'{user.get_username()} inició sesión en el sistema.',
        request=request, actor=user, status_code=200,
        metadata={'rol': _rol_de(user)},
    )


def registrar_login_fallido(request, username):
    """Registra el intento fallido, distingue el motivo y avisa si parece fuerza bruta.
    El motivo queda solo en el log: la respuesta al cliente no cambia (no revela si el usuario existe)."""
    from django.contrib.auth.models import User
    username = (username or '')[:150]
    cuenta = User.objects.filter(username=username).first() if username else None
    if cuenta is None:
        accion, motivo, quien = 'LOGIN_FAILED', 'el usuario no existe', _enmascarar_usuario(username)
    elif not cuenta.is_active:
        accion, motivo, quien = 'LOGIN_INACTIVE_ACCOUNT', 'la cuenta está desactivada', cuenta.get_username()
    else:
        accion, motivo, quien = 'LOGIN_FAILED', 'la contraseña es incorrecta', cuenta.get_username()
    ip = obtener_ip(request)
    anteriores = _fallos_recientes(ip, cuenta.get_username() if cuenta else None)
    logs.auth(
        accion, f'Intento de ingreso fallido con el usuario «{quien}»: {motivo}.',
        nivel=WARN, request=request, status_code=401,
        metadata={'usuario_intentado': quien, 'usuario_existe': cuenta is not None, 'motivo': motivo},
    )
    _evaluar_fuerza_bruta(request, ip, quien, anteriores)


def _fallos_recientes(ip, username):
    """Fallos ya registrados en la ventana: (por IP, por usuario). Consulta rápida, indexada."""
    try:
        desde = timezone.now() - timedelta(minutes=int(getattr(settings, 'LOGS_FUERZA_BRUTA_VENTANA_MIN', 15)))
        base = _modelo().objects.filter(
            category=CAT_AUTH, action__in=('LOGIN_FAILED', 'LOGIN_INACTIVE_ACCOUNT'), timestamp__gte=desde)
        por_ip = base.filter(ip_address=ip).count() if ip else 0
        por_usuario = base.filter(metadata__usuario_intentado=username).count() if username else 0
        return por_ip, por_usuario
    except Exception:
        return 0, 0


def _evaluar_fuerza_bruta(request, ip, quien, anteriores):
    """Avisa (CRÍTICO) cada vez que los fallos de una misma IP o de un mismo usuario completan un
    múltiplo del umbral dentro de la ventana. No bloquea nada: solo hace visible el patrón."""
    try:
        umbral = max(2, int(getattr(settings, 'LOGS_FUERZA_BRUTA_UMBRAL', 5)))
        ventana = int(getattr(settings, 'LOGS_FUERZA_BRUTA_VENTANA_MIN', 15))
        por_ip, por_usuario = anteriores[0] + 1, anteriores[1] + 1
        for total, origen, valor in ((por_ip, 'dirección IP', ip), (por_usuario, 'usuario', quien)):
            if valor and total >= umbral and total % umbral == 0:
                logs.auth(
                    'BRUTE_FORCE_SUSPECTED',
                    f'{total} intentos fallidos en {ventana} minutos desde la misma {origen} «{valor}».'
                    if origen == 'dirección IP' else
                    f'{total} intentos fallidos en {ventana} minutos contra el usuario «{valor}».',
                    nivel=CRITICAL, request=request,
                    metadata={'origen': origen, 'valor': valor, 'intentos': total, 'ventana_min': ventana},
                )
    except Exception:
        pass


# ─── Espejo de la auditoría de administración de usuarios ─────────────────────

_ETIQUETA_CAMPO = {
    'username': 'usuario', 'email': 'correo', 'first_name': 'nombre', 'last_name': 'apellido',
    'is_active': 'activo', 'password': 'contraseña', 'role': 'rol', 'cargo': 'cargo', 'run': 'RUN',
    'panel_id': 'vínculo con el Panel SSO', 'establecimiento_id': 'establecimiento', 'cuenta': 'cuenta',
    'descripcion': 'nombre', 'nombre_corto': 'nombre corto', 'parent_id': 'depende de',
    'subdireccion_id': 'subdirección', 'establecimiento': 'establecimiento', 'es_depto': 'es departamento',
}
_ACCION_POR_ENTIDAD = {
    'cuenta': 'USER_UPDATED', 'perfil': 'USER_UPDATED', 'panel': 'PANEL_USER_UPDATED',
    'asignacion': 'DEPARTMENT_ASSIGNED', 'departamento': 'DEPARTMENT_EDITED',
}


def _valor_legible(v):
    if v is True:
        return 'sí'
    if v is False:
        return 'no'
    if v is None or v == '':
        return '(vacío)'
    return f'«{_limpiar_texto(v, 80)}»' if isinstance(v, str) else str(v)[:80]


def describir_cambios(cambios):
    """{campo: [antes, después]} → 'rol: «viewer» → «admin»; activo: sí → no'."""
    partes = []
    for campo, par in (cambios or {}).items():
        etiqueta = _ETIQUETA_CAMPO.get(campo, campo)
        if campo == 'password':
            partes.append('contraseña: actualizada')
        elif isinstance(par, (list, tuple)) and len(par) == 2:
            partes.append(f'{etiqueta}: {_valor_legible(par[0])} → {_valor_legible(par[1])}')
        else:
            partes.append(f'{etiqueta}: {_valor_legible(par)}')
    return '; '.join(partes)[:400]


def espejar_auditoria_admin(actor, entidad, objeto_id, etiqueta, cambios, usuario_afectado=None):
    """Replica un cambio auditado en `AuditoriaAdmin` hacia el registro de logs (con antes → después
    y el IP de quien lo hizo). Se escribe SOLO si la transacción se confirma: un cambio revertido no
    debe aparecer como realizado."""
    from django.db import transaction
    try:
        quien = actor.get_username() if actor is not None else 'Un administrador'
        accion = _ACCION_POR_ENTIDAD.get(entidad, 'USER_UPDATED')
        nivel_cambios = cambios or {}
        if 'cuenta' in nivel_cambios and (nivel_cambios['cuenta'] or [None, None])[-1] == 'creada':
            accion = 'USER_CREATED'
        elif 'cuenta' in nivel_cambios and (nivel_cambios['cuenta'] or [None, None])[-1] == 'eliminada':
            accion = 'USER_DELETED'
        elif entidad == 'perfil' and 'role' in nivel_cambios:
            accion = 'ROLE_CHANGED'
        verbo = {
            'USER_CREATED': 'creó la cuenta de', 'USER_DELETED': 'eliminó la cuenta de',
            'ROLE_CHANGED': 'cambió el rol de', 'DEPARTMENT_ASSIGNED': 'cambió el departamento asignado a',
            'DEPARTMENT_EDITED': 'modificó el departamento',
        }.get(accion, 'modificó')
        metadata = {'entidad': entidad, 'objeto_id': objeto_id, 'objeto': etiqueta, 'cambios': nivel_cambios,
                    'usuario_afectado_id': getattr(usuario_afectado, 'pk', None)}
        if accion == 'USER_CREATED':
            rol = (nivel_cambios.get('role') or [None, 'viewer'])[-1]
            mensaje = f'{quien} creó la cuenta de {etiqueta} con el rol «{rol}».'
        elif accion == 'USER_DELETED':
            mensaje = f'{quien} eliminó la cuenta de {etiqueta}.'
        else:
            mensaje = f'{quien} {verbo} {etiqueta}: {describir_cambios(nivel_cambios)}.'
        registros = [_construir(CAT_AUDIT, INFO, accion, mensaje, actor=actor, metadata=metadata)]
        # Lecturas de seguridad del mismo cambio: contraseña y activación/desactivación de la cuenta.
        if entidad == 'cuenta' and 'password' in nivel_cambios:
            registros.append(_construir(
                CAT_AUTH, INFO, 'PASSWORD_CHANGED',
                f'{quien} cambió la contraseña de {etiqueta}.', actor=actor, metadata={'objeto': etiqueta}))
        if entidad == 'cuenta' and 'is_active' in nivel_cambios:
            activa = (nivel_cambios['is_active'] or [None, None])[-1]
            registros.append(_construir(
                CAT_AUTH, WARN if not activa else INFO,
                'ACCOUNT_ACTIVATED' if activa else 'ACCOUNT_DEACTIVATED',
                f'{quien} {"reactivó" if activa else "desactivó"} la cuenta de {etiqueta}.',
                actor=actor, metadata={'objeto': etiqueta}))
        ctx = contexto_actual()
        if ctx is not None:
            ctx['audit_emitidos'] += 1
        transaction.on_commit(lambda: [_encolar(r) for r in registros])
    except Exception:
        try:
            _respaldo_log.exception('No se pudo espejar la auditoría de administración')
        except Exception:
            pass


# ─── Consultas ────────────────────────────────────────────────────────────────

def _fecha_local(texto, fin_de_dia=False):
    """'YYYY-MM-DD' (día completo, hora de Chile; con `fin_de_dia` es el inicio del día siguiente, así
    `hasta` es inclusivo) o ISO con hora → datetime aware. None si no se entiende."""
    texto = str(texto or '').strip()
    if not texto:
        return None
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', texto):
        dia = parse_date(texto)   # ojo: parse_datetime('2026-03-10') ya daría medianoche, sin «fin de día»
        if dia is None:
            return None
        dt = datetime.combine(dia + timedelta(days=1 if fin_de_dia else 0), _hora.min)
    else:
        dt = parse_datetime(texto)
        if dt is None:
            return None
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt


def _lista(valor):
    return [v.strip() for v in str(valor or '').split(',') if v.strip()]


def aplicar_filtros(qs, params):
    """Filtros de la pantalla Logs sobre un queryset de RegistroLog. `params` = request.query_params."""
    categorias = [c for c in _lista(params.get('category')) if c in CATEGORIAS_ETIQUETA]
    if categorias:
        qs = qs.filter(category__in=categorias)
    niveles = [n for n in _lista(params.get('level')) if n in NIVELES]
    if niveles:
        qs = qs.filter(level__in=niveles)
    acciones = _lista(params.get('action'))
    if acciones:
        qs = qs.filter(action__in=acciones)
    if params.get('actor'):
        qs = qs.filter(actor_username__icontains=params['actor'].strip())
    if params.get('ip'):
        qs = qs.filter(ip_address__startswith=params['ip'].strip())
    desde, hasta = _fecha_local(params.get('desde')), _fecha_local(params.get('hasta'), fin_de_dia=True)
    if desde:
        qs = qs.filter(timestamp__gte=desde)
    if hasta:
        qs = qs.filter(timestamp__lt=hasta)
    texto = (params.get('q') or params.get('search') or '').strip()
    if texto:
        qs = qs.filter(Q(message__icontains=texto) | Q(actor_username__icontains=texto)
                       | Q(action__icontains=texto) | Q(path__icontains=texto))
    return qs


def _cuentas_por_nivel(qs):
    return {fila['level']: fila['n'] for fila in qs.values('level').annotate(n=Count('id')).order_by()}


def calcular_resumen(dias=7):
    """KPIs de las últimas 24 h + serie por categoría + rankings de la ventana `dias`.

    Las series se arman con rangos de fechas y `Count(filter=...)` y NO con TruncDate/ExtractHour:
    este MariaDB no tiene cargadas las tablas de zona horaria y esas funciones devuelven NULL sin error."""
    RegistroLog = _modelo()
    dias = max(1, min(int(dias), 90))
    ahora = timezone.now()
    hace_24h = ahora - timedelta(hours=24)
    desde = ahora - timedelta(days=dias)

    ult24 = RegistroLog.objects.filter(timestamp__gte=hace_24h)
    por_cat = {f['category']: f['n'] for f in ult24.values('category').annotate(n=Count('id')).order_by()}
    por_accion = {f['action']: f['n'] for f in ult24.values('action').annotate(n=Count('id')).order_by()}
    por_nivel = _cuentas_por_nivel(ult24)
    kpis = {
        'total': sum(por_cat.values()),
        'por_categoria': {c: por_cat.get(c, 0) for c in CATEGORIAS_ETIQUETA},
        'por_nivel': {n: por_nivel.get(n, 0) for n in NIVELES},
        'logins_exitosos': por_accion.get('LOGIN_SUCCESS', 0),
        'logins_fallidos': por_accion.get('LOGIN_FAILED', 0) + por_accion.get('LOGIN_INACTIVE_ACCOUNT', 0),
        'accesos_denegados': por_accion.get('ACCESS_DENIED', 0),
        'alertas_fuerza_bruta': por_accion.get('BRUTE_FORCE_SUSPECTED', 0),
        'cambios_administrativos': por_cat.get(CAT_AUDIT, 0),
        'errores': por_nivel.get(ERROR, 0) + por_nivel.get(CRITICAL, 0),
    }

    # Serie: por hora si la ventana es de un día; por día (hora de Chile) en otro caso.
    ahora_local = timezone.localtime(ahora)
    if dias == 1:
        paso, n = timedelta(hours=1), 24
        fin = ahora_local.replace(minute=0, second=0, microsecond=0) + paso
        etiquetas_fmt = '%H:00'
    else:
        paso, n = timedelta(days=1), dias
        fin = ahora_local.replace(hour=0, minute=0, second=0, microsecond=0) + paso
        etiquetas_fmt = '%d-%m'
    cortes = [fin - paso * (n - i) for i in range(n + 1)]
    agregados = {}
    for i in range(n):
        for cat in CATEGORIAS_ETIQUETA:
            agregados[f'b{i}_{cat}'] = Count('id', filter=Q(category=cat, timestamp__gte=cortes[i],
                                                             timestamp__lt=cortes[i + 1]))
    cuentas = RegistroLog.objects.filter(timestamp__gte=cortes[0]).aggregate(**agregados)
    serie = [{
        'etiqueta': cortes[i].strftime(etiquetas_fmt),
        'desde': cortes[i].isoformat(),
        **{cat: cuentas[f'b{i}_{cat}'] for cat in CATEGORIAS_ETIQUETA},
    } for i in range(n)]

    ventana = RegistroLog.objects.filter(timestamp__gte=desde)
    fallidos = ventana.filter(category=CAT_AUTH, action__in=('LOGIN_FAILED', 'LOGIN_INACTIVE_ACCOUNT'))
    top_ips = [
        {'ip': f['ip_address'], 'intentos': f['n']}
        for f in fallidos.exclude(ip_address__isnull=True).values('ip_address')
        .annotate(n=Count('id')).order_by('-n')[:5]
    ]
    top_acciones = [
        {'accion': f['action'], 'titulo': titulo_accion(f['action']), 'cantidad': f['n']}
        for f in ventana.values('action').annotate(n=Count('id')).order_by('-n')[:8]
    ]
    top_actores = [
        {'actor': f['actor_username'], 'cantidad': f['n']}
        for f in ventana.filter(category=CAT_AUDIT).values('actor_username').annotate(n=Count('id')).order_by('-n')[:5]
    ]
    ultimo = RegistroLog.objects.filter(level__in=(ERROR, CRITICAL)).order_by('-timestamp', '-id').first()
    return {
        'dias': dias,
        'generado': ahora.isoformat(),
        'kpis_24h': kpis,
        'serie': serie,
        'serie_por': 'hora' if dias == 1 else 'dia',
        'top_ips_fallidas': top_ips,
        'top_acciones': top_acciones,
        'top_actores_cambios': top_actores,
        'ultimo_error': None if ultimo is None else {
            'id': ultimo.id, 'timestamp': ultimo.timestamp.isoformat(), 'level': ultimo.level,
            'message': ultimo.message, 'action': ultimo.action,
        },
        'cola': estado_cola(),
    }


def catalogo_acciones():
    return [
        {'codigo': cod, 'categoria': cat, 'titulo': titulo, 'explicacion': expl}
        for cod, (cat, titulo, expl) in ACCIONES.items()
    ]


# ─── Salud del servidor ───────────────────────────────────────────────────────

_OK, _ATENCION, _CRITICO = 'ok', 'atencion', 'critico'


def _alertar_recurso(clave, nivel, mensaje, metadata):
    """Una alerta de recurso por clave cada 30 min como máximo (no inundar el registro)."""
    try:
        if cache.add(f'logs_alerta_{clave}', 1, 1800):
            logs.error('RESOURCE_ALERT', mensaje, nivel=nivel, metadata=metadata)
    except Exception:
        pass


def calcular_salud(registrar_alertas=True):
    """Revisión rápida de lo que más a menudo deja al sistema sin servicio: base de datos,
    disco y la propia cola de logs. Con `registrar_alertas` deja constancia de lo anómalo."""
    revisiones = []

    inicio = time.monotonic()
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT 1')
            cur.fetchone()
        ms = round((time.monotonic() - inicio) * 1000)
        revisiones.append({'clave': 'base_datos', 'titulo': 'Base de datos', 'estado': _OK,
                           'detalle': f'Responde correctamente ({ms} ms).', 'valor': ms})
    except Exception as exc:
        revisiones.append({'clave': 'base_datos', 'titulo': 'Base de datos', 'estado': _CRITICO,
                           'detalle': f'No responde: {type(exc).__name__}.', 'valor': None})
        if registrar_alertas:
            _alertar_recurso('base_datos', CRITICAL, 'La base de datos no responde.',
                             {'recurso': 'base_datos', 'error': type(exc).__name__})

    try:
        uso = shutil.disk_usage(str(settings.BASE_DIR))
        libre_pct = round(uso.free * 100 / uso.total, 1)
        libre_gb = round(uso.free / 1024 ** 3, 1)
        critico = float(getattr(settings, 'LOGS_DISCO_CRITICO_PCT', 5))
        alerta = float(getattr(settings, 'LOGS_DISCO_ALERTA_PCT', 10))
        estado = _CRITICO if libre_pct < critico else _ATENCION if libre_pct < alerta else _OK
        revisiones.append({
            'clave': 'disco', 'titulo': 'Espacio en disco', 'estado': estado,
            'detalle': f'Quedan {libre_gb} GB libres ({libre_pct} %).', 'valor': libre_pct})
        if estado != _OK and registrar_alertas:
            _alertar_recurso(
                'disco', CRITICAL if estado == _CRITICO else WARN,
                f'Queda poco espacio en el disco del servidor: {libre_gb} GB libres ({libre_pct} %).',
                {'recurso': 'disco', 'libre_pct': libre_pct, 'libre_gb': libre_gb})
    except Exception as exc:
        revisiones.append({'clave': 'disco', 'titulo': 'Espacio en disco', 'estado': _ATENCION,
                           'detalle': f'No se pudo medir: {type(exc).__name__}.', 'valor': None})

    cola = estado_cola()
    perdidos = cola['descartados'] + cola['fallidos']
    revisiones.append({
        'clave': 'cola_logs', 'titulo': 'Registro de eventos',
        'estado': _ATENCION if perdidos else _OK,
        'detalle': (f'{perdidos} evento(s) no se pudieron guardar desde el último reinicio '
                    '(quedaron en el archivo de respaldo).' if perdidos
                    else f'Guardando con normalidad ({cola["pendientes"]} pendiente(s) en cola).'),
        'valor': perdidos})

    try:
        hace_1h = timezone.now() - timedelta(hours=1)
        errores = _modelo().objects.filter(level__in=(ERROR, CRITICAL), timestamp__gte=hace_1h).count()
        estado = _CRITICO if errores >= 10 else _ATENCION if errores else _OK
        revisiones.append({
            'clave': 'errores_recientes', 'titulo': 'Errores en la última hora', 'estado': estado,
            'detalle': 'Sin errores.' if not errores else f'{errores} error(es) registrados.', 'valor': errores})
    except Exception:
        pass

    peor = _CRITICO if any(r['estado'] == _CRITICO for r in revisiones) else \
        _ATENCION if any(r['estado'] == _ATENCION for r in revisiones) else _OK
    return {'estado': peor, 'revisado': timezone.now().isoformat(), 'revisiones': revisiones}


# ─── Retención ────────────────────────────────────────────────────────────────

def limpiar_logs(dias=None, lote=5000):
    """Borra registros más antiguos que `dias` (por defecto LOGS_RETENCION_DIAS) en lotes pequeños
    para no bloquear la tabla. Devuelve cuántos eliminó."""
    dias = int(dias if dias is not None else getattr(settings, 'LOGS_RETENCION_DIAS', 180))
    if dias < 1:
        raise ValueError('Los días de retención deben ser al menos 1.')
    corte = timezone.now() - timedelta(days=dias)
    RegistroLog = _modelo()
    total = 0
    while True:
        ids = list(RegistroLog.objects.filter(timestamp__lt=corte).values_list('id', flat=True)[:lote])
        if not ids:
            return total
        total += RegistroLog.objects.filter(id__in=ids).delete()[0]
