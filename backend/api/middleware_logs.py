"""Middleware del módulo de logs (Administración › Logs). Solo actúa sobre `/api/`.

Hace tres cosas, todas sin cambiar la respuesta que recibe el usuario:

  1. Abre el CONTEXTO de la petición (IP, user-agent, usuario) para que cualquier log emitido
     durante ella —desde un servicio, un ETL en su hilo, un hook— quede con quién y desde dónde.
  2. Captura los errores NO controlados: `process_exception` registra la excepción con su
     stack trace (clasificada: base de datos / servicio externo / interno) y devuelve None,
     así Django sigue con su manejo normal del 500. También registra los 5xx que una vista
     devolvió «a mano» sin lanzar excepción.
  3. Audita las rutas críticas de administración (`RUTAS_AUDITADAS`): quién, qué endpoint y
     cuál fue el resultado. Los 403 de cualquier ruta quedan como ACCESS_DENIED (seguridad).

No registra cuerpos de petición ni respuestas: ahí viajan contraseñas, RUT y claves del Panel.
Si un servicio ya dejó un log de auditoría con detalle (antes → después) en la misma petición,
no se duplica con la línea genérica, salvo que la operación haya fallado.

Un fallo dentro de este middleware se traga: registrar nunca debe romper una petición."""
import re
import time

from django.conf import settings

from .services_logs import (
    ERROR, INFO, WARN, abrir_contexto, cerrar_contexto, contexto_actual, etiqueta_ruta, logs,
    resolver_actor,
)

# (expresión regular de la ruta, nombre del módulo para la frase). Se puede reemplazar entera
# con settings.LOGS_RUTAS_AUDITADAS. Solo se auditan POST/PUT/PATCH/DELETE.
RUTAS_AUDITADAS = [
    (r'^/api/usuarios/', 'Administración de usuarios'),
    (r'^/api/organizacion/', 'Organización y departamentos'),
    (r'^/api/gestor-compras/notificacion/(enviar|enviar-prueba|copias|confirmar-correo)/',
     'Notificaciones del Plan de Compras'),
    (r'^/api/fsc-oc-pac/(confirmar|rechazar|enlazar-manual|corregir-pac|recalcular)/', 'Enlace FSC-OC-PAC'),
    (r'^/api/pac-cumplimiento/actualizar-(maestro|jerarquia)/', 'Actualización del PAC'),
    (r'^/api/[\w-]+/actualizar(-cancelar)?/', 'Actualización de datos'),
]
_SIN_AUDITAR = re.compile(r'/previsualizar')   # POST de solo cálculo: no cambia nada
_METODOS_ESCRITURA = {'POST', 'PUT', 'PATCH', 'DELETE'}
_VERBO = {'POST': 'ejecutó una acción', 'PUT': 'modificó datos', 'PATCH': 'modificó datos', 'DELETE': 'eliminó datos'}
_RESULTADO = {
    200: 'resultado correcto', 201: 'resultado correcto (se creó)', 202: 'aceptado, se procesa en segundo plano',
    204: 'resultado correcto', 400: 'rechazado por datos inválidos', 404: 'no se encontró lo solicitado',
    409: 'rechazado: hay otra operación en curso o en conflicto', 422: 'rechazado por datos inválidos',
    429: 'rechazado por exceso de solicitudes',
}


def _resultado(estado):
    if estado in _RESULTADO:
        return _RESULTADO[estado]
    if estado < 400:
        return 'resultado correcto'
    return 'rechazado' if estado < 500 else 'falló por un error del servidor'


class RegistroLogsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        reglas = getattr(settings, 'LOGS_RUTAS_AUDITADAS', RUTAS_AUDITADAS)
        self._rutas = [(re.compile(patron), etiqueta) for patron, etiqueta in reglas]

    def __call__(self, request):
        if not request.path.startswith('/api/'):
            return self.get_response(request)
        token = abrir_contexto(request)
        inicio = time.monotonic()
        try:
            response = self.get_response(request)
            try:
                self._registrar_respuesta(request, response, time.monotonic() - inicio)
            except Exception:
                pass
            return response
        finally:
            cerrar_contexto(token)

    def process_exception(self, request, exception):
        try:
            logs.excepcion(exception, request=request)
        except Exception:
            pass
        return None   # Django continúa con su respuesta 500 de siempre

    # ── internos ──

    def _modulo_auditado(self, ruta):
        if _SIN_AUDITAR.search(ruta):
            return None
        for patron, etiqueta in self._rutas:
            if patron.search(ruta):
                return etiqueta
        return None

    def _registrar_respuesta(self, request, response, duracion):
        estado = response.status_code
        metodo, ruta = request.method, request.path
        contexto = contexto_actual() or {}
        _, usuario, rol = resolver_actor(None, request)
        quien = usuario if usuario != 'ANONYMOUS' else 'Una persona sin sesión iniciada'
        modulo = etiqueta_ruta(ruta)
        meta = {'metodo': metodo, 'ruta': ruta, 'modulo': modulo, 'duracion_ms': round(duracion * 1000)}

        if estado == 403:
            logs.auth(
                'ACCESS_DENIED',
                f'{quien}{f" (rol: {rol})" if rol else ""} intentó acceder a «{modulo}» '
                f'({metodo} {ruta}) sin tener permiso.',
                nivel=WARN, request=request, status_code=estado, metadata=meta)
            return

        if estado >= 500 and not contexto.get('error_emitido'):
            logs.error(
                'SERVER_ERROR_RESPONSE',
                f'El servidor respondió con error {estado} al atender {metodo} {ruta} ({modulo}).',
                request=request, status_code=estado, metadata=meta)

        if metodo in _METODOS_ESCRITURA and estado != 401:
            etiqueta = self._modulo_auditado(ruta)
            if etiqueta and (contexto.get('audit_emitidos', 0) == 0 or estado >= 400):
                logs.audit(
                    'ADMIN_ACTION',
                    f'{quien} {_VERBO[metodo]} en «{etiqueta}» ({metodo} {ruta}): {_resultado(estado)}.',
                    nivel=INFO if estado < 400 else WARN if estado < 500 else ERROR,
                    request=request, status_code=estado, metadata=meta)
