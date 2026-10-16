"""Endpoints públicos de recuperación de contraseña (pantalla de login). La lógica vive en
`services_recuperacion_clave`; acá solo se traduce HTTP.

Son públicos A PROPÓSITO (quien olvidó su clave no tiene sesión) y por eso:
  · `authentication_classes([])`: un token vencido guardado en el navegador NO debe tumbar la
    petición con 401 (DRF autentica antes de mirar los permisos), igual que el login.
  · Nunca devuelven el código ni dicen si un correo existe (ver el docstring del servicio).
  · Todo error de validación responde 400 con `detail` y, si corresponde, `errores` por campo."""
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import services_recuperacion_clave as recuperacion


def _datos(request):
    return request.data if hasattr(request.data, 'get') else {}


def _error(exc):
    cuerpo = {'detail': exc.mensaje}
    if exc.campos:
        cuerpo['errores'] = exc.campos
    return Response(cuerpo, status=400)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def recuperar_solicitar_view(request):
    """{email} → 200 con un mensaje genérico, exista o no la cuenta."""
    try:
        recuperacion.solicitar_codigo(_datos(request).get('email'), request=request)
    except recuperacion.ErrorRecuperacion as exc:
        return _error(exc)
    return Response({
        'detail': recuperacion.MENSAJE_GENERICO,
        'vigencia_segundos': recuperacion.vigencia_codigo_seg(),
        'reenvio_segundos': recuperacion.espera_reenvio_seg(),
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def recuperar_verificar_view(request):
    """{email, codigo} → {token}: el token (un solo uso) autoriza definir la contraseña nueva."""
    datos = _datos(request)
    try:
        token = recuperacion.verificar_codigo(datos.get('email'), datos.get('codigo'), request=request)
    except recuperacion.ErrorRecuperacion as exc:
        return _error(exc)
    from django.conf import settings
    return Response({'token': token,
                     'vigencia_segundos': int(getattr(settings, 'RECUPERACION_TOKEN_VIGENCIA_MIN', 10)) * 60})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def recuperar_restablecer_view(request):
    """{token, password, password_confirm} → contraseña cambiada. Después se ingresa con el login normal."""
    datos = _datos(request)
    try:
        recuperacion.restablecer_clave(
            datos.get('token'), datos.get('password'), datos.get('password_confirm'), request=request)
    except recuperacion.ErrorRecuperacion as exc:
        return _error(exc)
    return Response({'detail': 'Tu contraseña fue actualizada. Ya puedes iniciar sesión con la nueva.'})
