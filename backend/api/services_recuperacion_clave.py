"""Recuperación de contraseña por correo (login › «¿Olvidaste tu contraseña?»).

Flujo en tres pasos, todos validados AQUÍ (la pantalla solo los refleja):

  1. solicitar_codigo   correo → código aleatorio de `RECUPERACION_LARGO_CODIGO` dígitos por correo,
                        vigente `RECUPERACION_VIGENCIA_MIN` (5) minutos.
  2. verificar_codigo   correo + código → token de un solo uso. El código se CONSUME al acertar.
  3. restablecer_clave  token + contraseña nueva (+ confirmación) → contraseña cambiada.

Garantías (conservarlas al modificar este archivo):
  · El código sale de `secrets` (CSPRNG) y NUNCA se devuelve al cliente: solo viaja por correo.
  · Nada se guarda en claro: la BD tiene el HMAC (clave = SECRET_KEY) del código y del token.
  · La expiración se compara contra el reloj del servidor en cada consulta.
  · Los intentos se reservan con un UPDATE atómico (`intentos < máximo`): peticiones paralelas no
    pueden probar más códigos que el tope. Un código acertado se consume; uno agotado deja de servir.
  · No se revela si un correo existe: `solicitar_codigo` no distingue casos hacia afuera (límites
    de frecuencia incluidos) y los fallos de `verificar_codigo` llevan siempre el mismo mensaje.
    El motivo real queda solo en Administración › Logs.
  · La contraseña nueva pasa por `AUTH_PASSWORD_VALIDATORS` del proyecto (largo mínimo, no común,
    no solo numérica, no parecida al usuario) y debe repetirse igual.
  · La cuenta se elige primero por USERNAME (el usuario de ingreso es el correo) y recién después por
    el campo correo; si varias cuentas activas comparten el correo y ningún username coincide, es
    ambiguo: no se envía nada (habría que adivinar de quién es el código).
"""
import re
import secrets
import threading
from datetime import timedelta
from hmac import compare_digest

from django.conf import settings
from django.contrib.auth import password_validation
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import connection, transaction
from django.db.models import F
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.crypto import salted_hmac

from .models import RecuperacionContrasena
from .services_logs import WARN, logs, obtener_ip

MENSAJE_GENERICO = ('Si el correo corresponde a una cuenta activa, enviamos un código de verificación. '
                    'Revisa tu bandeja de entrada (y la carpeta de correo no deseado).')
MENSAJE_CODIGO_INVALIDO = ('El código es incorrecto, ya venció o se superó el máximo de intentos. '
                           'Solicita uno nuevo.')
MENSAJE_TOKEN_INVALIDO = ('La verificación ya no es válida: venció o ya se usó. '
                          'Vuelve a solicitar un código.')


class ErrorRecuperacion(Exception):
    """Fallo que se le puede mostrar a la persona. `campos` = {campo: [mensajes]} para marcar el formulario."""

    def __init__(self, mensaje, campos=None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.campos = campos or {}


# ─── Parámetros (se leen al usarlos, para que las pruebas puedan cambiarlos) ──

def _cfg(nombre, defecto):
    return getattr(settings, nombre, defecto)


def vigencia_codigo_seg():
    return int(_cfg('RECUPERACION_VIGENCIA_MIN', 5)) * 60


def espera_reenvio_seg():
    return int(_cfg('RECUPERACION_REENVIO_SEG', 60))


# ─── Primitivas ───────────────────────────────────────────────────────────────

def generar_codigo():
    """Código numérico aleatorio y uniforme (CSPRNG), con ceros a la izquierda: '004921'."""
    largo = int(_cfg('RECUPERACION_LARGO_CODIGO', 6))
    return str(secrets.randbelow(10 ** largo)).zfill(largo)


def _hash_codigo(usuario_id, codigo):
    # Mezcla el id del usuario: el mismo código de dos personas no da el mismo hash.
    return salted_hmac('api.recuperacion_clave.codigo', f'{usuario_id}:{codigo}', algorithm='sha256').hexdigest()


def _hash_token(token):
    return salted_hmac('api.recuperacion_clave.token', token, algorithm='sha256').hexdigest()


def normalizar_correo(correo):
    correo = (correo or '').strip().lower() if isinstance(correo, str) else ''
    try:
        if not correo or len(correo) > 254:
            raise ValidationError('vacío')
        validate_email(correo)
    except ValidationError:
        raise ErrorRecuperacion('Ingresa un correo electrónico válido.', {'email': ['Ingresa un correo electrónico válido.']})
    return correo


def _normalizar_codigo(codigo):
    """Acepta «123 456» o «123-456» (se copia así del correo); exige solo dígitos y el largo exacto."""
    largo = int(_cfg('RECUPERACION_LARGO_CODIGO', 6))
    limpio = re.sub(r'[\s\-]', '', codigo) if isinstance(codigo, str) else ''
    if not (limpio.isascii() and limpio.isdigit() and len(limpio) == largo):
        msg = f'El código tiene {largo} dígitos.'
        raise ErrorRecuperacion(msg, {'codigo': [msg]})
    return limpio


def _enmascarar_correo(correo):
    """«juan.perez@redsalud.gob.cl» → «j***@redsalud.gob.cl» (para el registro de logs)."""
    local, _, dominio = correo.partition('@')
    return f'{local[:1]}***@{dominio}' if dominio else f'{correo[:1]}***'


def _buscar_cuenta(correo):
    """(usuario, motivo). `motivo` explica por qué no hay cuenta utilizable (solo para el log).

    En este sistema el usuario de ingreso ES el correo (449 de 451 cuentas), así que primero se busca
    la cuenta cuyo USERNAME es lo escrito: es lo que la persona usa para entrar y desempata cuando el
    mismo correo figura en varias cuentas (p. ej. un usuario antiguo y el actual). El código siempre
    se envía al correo REGISTRADO en esa cuenta, no a lo que se tecleó. Si ningún username coincide,
    se busca por el campo correo; ahí, varias cuentas activas con el mismo correo son ambiguas."""
    campos = ('id', 'username', 'email', 'is_active', 'first_name', 'last_name')
    por_usuario = list(User.objects.filter(username__iexact=correo).only(*campos)[:2])
    if len(por_usuario) == 1:
        cuenta = por_usuario[0]
        return (cuenta, None) if cuenta.is_active else (None, 'la cuenta está desactivada')
    cuentas = list(User.objects.filter(email__iexact=correo).only(*campos))
    activas = [u for u in cuentas if u.is_active]
    if len(activas) == 1:
        return activas[0], None
    if len(activas) > 1:
        return None, 'el correo está asociado a más de una cuenta activa'
    if cuentas:
        return None, 'la cuenta está desactivada'
    return None, 'no existe una cuenta con ese correo'


# ─── 1. Solicitar el código ───────────────────────────────────────────────────

def solicitar_codigo(correo, request=None):
    """Genera y envía un código. NO informa si el correo existe (ni si un límite lo frenó): el
    llamador responde siempre `MENSAJE_GENERICO`. Solo lanza `ErrorRecuperacion` por un correo mal escrito."""
    correo = normalizar_correo(correo)
    ip = obtener_ip(request) if request is not None else None
    cuenta, motivo = _buscar_cuenta(correo)
    if cuenta is None:
        logs.auth('PASSWORD_RESET_REQUESTED',
                  f'Se pidió recuperar la contraseña de «{_enmascarar_correo(correo)}», pero {motivo}. No se envió ningún código.',
                  nivel=WARN, request=request, status_code=200, metadata={'resultado': 'sin envío', 'motivo': motivo})
        return

    ahora = timezone.now()
    limite = _limite_alcanzado(cuenta, ip, ahora)
    if limite:
        logs.auth('PASSWORD_RESET_REQUESTED',
                  f'Se pidió recuperar la contraseña de {cuenta.username}, pero no se envió un código: {limite}.',
                  nivel=WARN, request=request, actor=cuenta, status_code=200,
                  metadata={'resultado': 'sin envío', 'motivo': limite})
        return

    codigo = generar_codigo()
    with transaction.atomic():
        # Un código nuevo deja sin efecto a los anteriores todavía pendientes.
        RecuperacionContrasena.objects.filter(
            usuario=cuenta, usado_en__isnull=True, invalidado_en__isnull=True).update(invalidado_en=ahora)
        solicitud = RecuperacionContrasena.objects.create(
            usuario=cuenta, codigo_hash=_hash_codigo(cuenta.pk, codigo), creado_en=ahora,
            expira_en=ahora + timedelta(seconds=vigencia_codigo_seg()), ip_address=ip)

    logs.auth('PASSWORD_RESET_REQUESTED',
              f'{cuenta.username} pidió recuperar su contraseña: se envió un código a {_enmascarar_correo(cuenta.email)}.',
              request=request, actor=cuenta, status_code=200,
              metadata={'resultado': 'código enviado', 'vigencia_min': vigencia_codigo_seg() // 60})

    args = (solicitud.pk, cuenta.pk, cuenta.email, cuenta.get_full_name() or cuenta.get_username(), codigo)
    if _cfg('RECUPERACION_ENVIO_EN_HILO', True):
        threading.Thread(target=_entregar_codigo_en_hilo, args=args, daemon=True).start()
    else:
        _entregar_codigo(*args)


def _limite_alcanzado(cuenta, ip, ahora):
    """Texto del límite que impide enviar otro código (o None). Frena el correo masivo a una persona."""
    anteriores = RecuperacionContrasena.objects.filter(usuario=cuenta)
    ultimo = anteriores.order_by('-creado_en').values_list('creado_en', flat=True).first()
    if ultimo and (ahora - ultimo).total_seconds() < espera_reenvio_seg():
        return f'ya se envió uno hace menos de {espera_reenvio_seg()} segundos'
    desde = ahora - timedelta(hours=1)
    if anteriores.filter(creado_en__gte=desde).count() >= int(_cfg('RECUPERACION_MAX_POR_HORA_USUARIO', 5)):
        return 'la cuenta alcanzó el máximo de códigos por hora'
    if ip and RecuperacionContrasena.objects.filter(
            ip_address=ip, creado_en__gte=desde).count() >= int(_cfg('RECUPERACION_MAX_POR_HORA_IP', 30)):
        return 'la dirección IP alcanzó el máximo de códigos por hora'
    return None


def construir_correo(nombre, correo_destino, codigo):
    """Correo (texto + HTML con el logo incrustado, igual que los avisos del Plan de Compras)."""
    from .services_notificacion_plan import _clase_correo_con_logo
    minutos = vigencia_codigo_seg() // 60
    asunto = 'Tu código para recuperar la contraseña — Sistema de Gestión SSO'
    contexto = {'nombre': nombre, 'codigo': codigo, 'vigencia_min': minutos, 'asunto': asunto}
    mensaje = _clase_correo_con_logo()(
        subject=asunto, body=render_to_string('recuperacion/codigo.txt', contexto),
        from_email=settings.DEFAULT_FROM_EMAIL, to=[correo_destino])
    mensaje.attach_alternative(render_to_string('recuperacion/codigo.html', contexto), 'text/html')
    return mensaje


def _entregar_codigo(solicitud_id, usuario_id, correo, nombre, codigo):
    """Envía el correo. Si falla, descarta la solicitud (así no cuenta para la espera entre códigos
    ni para el tope por hora) y lo deja anotado como falla de un servicio externo."""
    try:
        construir_correo(nombre, correo, codigo).send(fail_silently=False)
    except Exception as exc:   # SMTP caído, credenciales vencidas, etc.
        RecuperacionContrasena.objects.filter(pk=solicitud_id).delete()
        logs.error('EXTERNAL_SERVICE_ERROR',
                   f'No se pudo enviar el correo de recuperación de contraseña a {_enmascarar_correo(correo)}: '
                   f'revise la configuración del correo.', exc=exc, metadata={'usuario_id': usuario_id})


def _entregar_codigo_en_hilo(*args):
    try:
        _entregar_codigo(*args)
    finally:
        connection.close()   # el hilo (de un solo uso) abrió su propia conexión a la BD


# ─── 2. Verificar el código ───────────────────────────────────────────────────

def verificar_codigo(correo, codigo, request=None):
    """Comprueba el código y lo canjea por un token de un solo uso (devuelve el token en claro, que
    no se guarda). Todo fallo lanza el MISMO `ErrorRecuperacion`; el motivo real va solo al log."""
    correo = normalizar_correo(correo)
    codigo = _normalizar_codigo(codigo)
    cuenta, motivo_cuenta = _buscar_cuenta(correo)
    if cuenta is None:
        _rechazar_codigo(request, None, f'{motivo_cuenta} («{_enmascarar_correo(correo)}»)', 'sin cuenta utilizable')

    ahora = timezone.now()
    pendientes = RecuperacionContrasena.objects.filter(
        usuario=cuenta, verificado_en__isnull=True, usado_en__isnull=True, invalidado_en__isnull=True)
    solicitud = pendientes.order_by('-creado_en').first()
    if solicitud is None:
        _rechazar_codigo(request, cuenta, 'no hay un código pendiente (no se pidió, ya se usó o fue reemplazado)',
                         'sin código pendiente')
    if solicitud.expira_en <= ahora:
        _rechazar_codigo(request, cuenta, 'el código ya venció', 'código vencido')

    maximo = int(_cfg('RECUPERACION_MAX_INTENTOS', 5))
    # Reserva atómica del intento: si otra petición agotó el tope entre tanto, no se compara nada.
    reservado = pendientes.filter(pk=solicitud.pk, intentos__lt=maximo, expira_en__gt=ahora).update(
        intentos=F('intentos') + 1)
    if not reservado:
        _rechazar_codigo(request, cuenta, 'se agotaron los intentos de este código', 'intentos agotados')

    if not compare_digest(solicitud.codigo_hash, _hash_codigo(cuenta.pk, codigo)):
        solicitud.refresh_from_db(fields=['intentos'])
        agotado = solicitud.intentos >= maximo
        if agotado:
            RecuperacionContrasena.objects.filter(pk=solicitud.pk).update(invalidado_en=ahora)
        _rechazar_codigo(
            request, cuenta,
            f'código incorrecto (intento {solicitud.intentos} de {maximo}'
            f'{"; el código quedó inutilizado" if agotado else ""})',
            'código incorrecto', extra={'intentos': solicitud.intentos, 'maximo': maximo})

    token = secrets.token_urlsafe(32)
    consumido = RecuperacionContrasena.objects.filter(
        pk=solicitud.pk, verificado_en__isnull=True, invalidado_en__isnull=True, usado_en__isnull=True,
        expira_en__gt=ahora,
    ).update(verificado_en=ahora, codigo_hash='', token_hash=_hash_token(token),
             token_expira_en=ahora + timedelta(minutes=int(_cfg('RECUPERACION_TOKEN_VIGENCIA_MIN', 10))))
    if not consumido:   # otra petición lo consumió o venció justo ahora
        _rechazar_codigo(request, cuenta, 'el código ya fue consumido por otra petición', 'código ya consumido')

    logs.auth('PASSWORD_RESET_VERIFIED', f'{cuenta.username} verificó el código de recuperación de contraseña.',
              request=request, actor=cuenta, status_code=200)
    return token


def _rechazar_codigo(request, cuenta, descripcion, motivo, extra=None):
    quien = f' de {cuenta.username}' if cuenta is not None else ''
    logs.auth('PASSWORD_RESET_FAILED',
              f'Se rechazó un código de recuperación de contraseña{quien}: {descripcion}.',
              nivel=WARN, request=request, actor=cuenta, status_code=400,
              metadata={'paso': 'verificar', 'motivo': motivo, **(extra or {})})
    raise ErrorRecuperacion(MENSAJE_CODIGO_INVALIDO)


# ─── 3. Definir la contraseña nueva ───────────────────────────────────────────

def restablecer_clave(token, password, confirmacion, request=None):
    """Cambia la contraseña con el token de la verificación. El token se consume solo si el cambio
    se hace: una contraseña rechazada por las reglas deja reintentar dentro de su vigencia."""
    token = token.strip() if isinstance(token, str) else ''
    if not token or len(token) > 200:
        _rechazar_token(request, None, 'no se envió el token de verificación')
    ahora = timezone.now()
    solicitud = RecuperacionContrasena.objects.select_related('usuario').filter(
        token_hash=_hash_token(token), verificado_en__isnull=False, usado_en__isnull=True,
        invalidado_en__isnull=True, token_expira_en__gt=ahora).first()
    if solicitud is None or not solicitud.usuario.is_active:
        _rechazar_token(request, None, 'el token no existe, ya se usó o venció')
    usuario = solicitud.usuario

    if not isinstance(password, str) or not password:
        raise ErrorRecuperacion('Escribe la contraseña nueva.', {'password': ['Escribe la contraseña nueva.']})
    if password != confirmacion:
        raise ErrorRecuperacion('Las contraseñas no coinciden.', {'password_confirm': ['Las contraseñas no coinciden.']})
    try:
        password_validation.validate_password(password, usuario)
    except ValidationError as exc:
        raise ErrorRecuperacion('La contraseña no cumple los requisitos.', {'password': list(exc.messages)})

    with transaction.atomic():
        consumido = RecuperacionContrasena.objects.filter(
            pk=solicitud.pk, usado_en__isnull=True, invalidado_en__isnull=True, token_expira_en__gt=ahora,
        ).update(usado_en=ahora, token_hash='')
        if not consumido:
            _rechazar_token(request, usuario, 'el token ya fue usado por otra petición')
        usuario.set_password(password)
        usuario.save(update_fields=['password'])
        # Cualquier otro código o verificación pendiente de esta cuenta queda sin efecto.
        RecuperacionContrasena.objects.filter(
            usuario=usuario, usado_en__isnull=True, invalidado_en__isnull=True).update(invalidado_en=ahora)

    logs.auth('PASSWORD_CHANGED', f'{usuario.username} cambió su contraseña mediante la recuperación por correo.',
              request=request, actor=usuario, status_code=200, metadata={'via': 'recuperación por correo'})
    return usuario


def _rechazar_token(request, cuenta, descripcion):
    logs.auth('PASSWORD_RESET_FAILED',
              f'Se rechazó un cambio de contraseña por recuperación: {descripcion}.',
              nivel=WARN, request=request, actor=cuenta, status_code=400,
              metadata={'paso': 'restablecer', 'motivo': descripcion})
    raise ErrorRecuperacion(MENSAJE_TOKEN_INVALIDO)
