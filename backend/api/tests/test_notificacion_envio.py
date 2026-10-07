"""Paso 6 del módulo Notificación: vista previa, envío por lotes y endpoints.

El backend de correo en pruebas es locmem (core.settings_test): nada sale a internet; los
mensajes quedan en `avisos()`."""
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Departamento, NotificacionPlanEnvio, NotificacionPlanItem, NotificacionPlanLote,
    PerfilUsuario, PertenenciaUsuario, PlanerPAC, UsuarioPanel,
)
from api.services_notificacion_plan import (
    EnvioEnCurso, ReenvioPendiente, estado_lote, iniciar_envio, previsualizar_lote,
)

def avisos():
    """Correos de aviso a responsables (excluye el resumen de cierre con el PDF)."""
    return [m for m in mail.outbox if 'Resumen:' not in m.subject]


def resumenes():
    return [m for m in mail.outbox if 'Resumen:' in m.subject]


CORREO_OK = 'nicolas.asencio@redsalud.gob.cl'
PRUEBA = 'prueba@x.cl'
PASADO = '2020-03-01 00:00:00'


class BaseEnvioTest(TestCase):
    def setUp(self):
        cache.clear()
        self.depto = Departamento.objects.create(descripcion='DPTO UNO', es_depto='SI',
                                                 subdireccion_id=2, establecimiento_id=1)
        self.ana = UsuarioPanel.objects.create(usuario='ana', alias='ANA PEREZ', correo_electronico='ana@x.cl',
                                               cargo='Encargada', activo='S', establecimiento_id=1)
        self.beto = UsuarioPanel.objects.create(usuario='beto', alias='BETO RIOS', correo_electronico='beto@x.cl',
                                                cargo='Encargado', activo='S', establecimiento_id=1)
        jefa = UsuarioPanel.objects.create(usuario='jefa', alias='JEFA UNO', correo_electronico='jefa@x.cl',
                                           cargo='Jefa Departamento', activo='S', establecimiento_id=1)
        PertenenciaUsuario.objects.create(id_usuario=jefa.id, tipo_dependencia='DEP',
                                          id_dependencia=self.depto.id, id_subdireccion=2)
        for id_proyecto, resp in (('P-1', 'Ana Perez'), ('P-2', 'Ana Perez'), ('P-3', 'Beto Rios'),
                                  ('P-4', 'Persona Desconocida')):
            PlanerPAC.objects.create(
                id_proyecto=id_proyecto, nombre_proyecto=f'Proyecto {id_proyecto}', depto='DPTO UNO',
                sub='DIRECCION', nombre_responsable=resp, cargo_responsable='Cargo',
                fecha_inicio_compra=PASADO, monto_total_item='1000', monto_unitario_item='1000',
                cantidad_items='1', nombre_item='Item', pac='2026')

    def sel(self, *ids):
        return {'anho': 2026, 'ids': list(ids)}


@override_settings(NOTIF_PLAN_MODO_PRUEBA=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA,
                   NOTIF_PLAN_CC_JEFATURAS=False, NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50)
class PrevisualizarTest(BaseEnvioTest):
    def test_resumen_de_lo_que_se_enviaria(self):
        r = previsualizar_lote(self.sel('P-1', 'P-2', 'P-3', 'P-4'), None)
        self.assertEqual({e['nombre_responsable'] for e in r['enviables']}, {'Ana Perez', 'Beto Rios'})
        ana = next(e for e in r['enviables'] if e['nombre_responsable'] == 'Ana Perez')
        self.assertEqual((ana['planes'], ana['monto_total']), (2, 2000))
        self.assertEqual(ana['para'], [PRUEBA])                 # modo prueba: va al destino de prueba
        self.assertEqual(ana['reales_para'], ['ana@x.cl'])       # pero se informa a quién habría ido
        self.assertEqual(ana['cc'], [])
        self.assertEqual([j['correo'] for j in ana['copias']], ['jefa@x.cl'])   # identificadas aunque no se copien
        self.assertEqual(r['total_planes'], 4)
        self.assertTrue(r['modo_prueba'])

    def test_un_responsable_que_es_jefatura_no_figura_como_su_propia_jefatura(self):
        PertenenciaUsuario.objects.create(id_usuario=self.ana.id, tipo_dependencia='DEP',
                                          id_dependencia=self.depto.id, id_subdireccion=2)
        UsuarioPanel.objects.filter(pk=self.ana.pk).update(cargo='Jefa Unidad')
        r = previsualizar_lote(self.sel('P-1', 'P-3'), None)
        ana = next(e for e in r['enviables'] if e['nombre_responsable'] == 'Ana Perez')
        beto = next(e for e in r['enviables'] if e['nombre_responsable'] == 'Beto Rios')
        self.assertEqual([j['correo'] for j in ana['copias']], ['jefa@x.cl'])
        self.assertEqual({j['correo'] for j in beto['copias']}, {'jefa@x.cl', 'ana@x.cl'})

    def test_omite_responsables_sin_correo_confirmado(self):
        r = previsualizar_lote(self.sel('P-1', 'P-4'), None)
        self.assertEqual([o['nombre_responsable'] for o in r['omitidos']], ['Persona Desconocida'])

    def test_html_de_ejemplo_trae_el_logo_embebido_y_es_el_pedido(self):
        r = previsualizar_lote(self.sel('P-1', 'P-3'), None, ejemplo='Beto Rios')
        self.assertEqual(r['ejemplo'], 'Beto Rios')
        self.assertIn('data:image/png;base64,', r['html_ejemplo'])
        self.assertNotIn('cid:logo', r['html_ejemplo'])
        self.assertIn('P-3', r['html_ejemplo'])
        self.assertNotIn('_mensajes', r)

    def test_ejemplo_inexistente_usa_el_primero(self):
        self.assertEqual(previsualizar_lote(self.sel('P-1'), None, ejemplo='Nadie')['ejemplo'], 'Ana Perez')

    def test_seleccion_vacia(self):
        r = previsualizar_lote(self.sel(), None)
        self.assertEqual((r['enviables'], r['html_ejemplo']), ([], ''))

    @override_settings(NOTIF_PLAN_MAX_LOTE=1)
    def test_marca_si_excede_el_tope(self):
        self.assertTrue(previsualizar_lote(self.sel('P-1', 'P-3'), None)['excede_tope'])


@override_settings(NOTIF_PLAN_MODO_PRUEBA=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA,
                   NOTIF_PLAN_CC_JEFATURAS=False, NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50)
class EnvioTest(BaseEnvioTest):
    def _enviar(self, *ids, **kw):
        return iniciar_envio(self.sel(*ids), None, None, en_hilo=False, confirmar_real=True, **kw)

    def test_modo_prueba_manda_un_correo_por_responsable_solo_al_destino_de_prueba(self):
        lote = self._enviar('P-1', 'P-2', 'P-3')
        self.assertEqual(len(avisos()), 2)
        for m in avisos():
            self.assertEqual(m.to, [PRUEBA])
            self.assertEqual(m.cc, [])
            self.assertTrue(m.subject.startswith('[PRUEBA] '))
        self.assertNotIn('ana@x.cl', [d for m in avisos() for d in m.to + m.cc])
        self.assertEqual((lote.estado, lote.enviados, lote.fallidos, lote.modo_prueba), ('ENVIADO', 2, 0, True))

    def test_el_correo_lleva_texto_html_y_logo_inline(self):
        self._enviar('P-1')
        m = avisos()[0]
        self.assertIn('P-1', m.body)
        self.assertEqual(m.alternatives[0][1], 'text/html')
        self.assertIn('cid:logo', m.alternatives[0][0])

    def test_el_logo_viaja_junto_al_html_dentro_de_multipart_related(self):
        """Estructura que exige Outlook web (con el logo como hermano de 'alternative' sale como
        imagen rota): alternative[ text/plain, related[ text/html, image/png <logo> ] ]."""
        self._enviar('P-1')
        raiz = avisos()[0].message()
        self.assertEqual(raiz.get_content_type(), 'multipart/alternative')
        texto, relacionado = raiz.get_payload()
        self.assertEqual(texto.get_content_type(), 'text/plain')
        self.assertEqual(relacionado.get_content_type(), 'multipart/related')
        html, imagen = relacionado.get_payload()
        self.assertEqual(html.get_content_type(), 'text/html')
        self.assertEqual(imagen.get_content_type(), 'image/png')
        self.assertEqual(imagen['Content-ID'], '<logo>')
        self.assertTrue(imagen['Content-Disposition'].startswith('inline'))
        self.assertTrue(imagen.get_payload(decode=True).startswith(b'\x89PNG'))
        # el HTML referencia exactamente ese Content-ID
        self.assertIn('src="cid:logo"', html.get_payload(decode=True).decode('utf-8'))

    def test_el_logo_declara_ancho_y_alto(self):
        self._enviar('P-1')
        self.assertIn('width="92" height="83"', avisos()[0].alternatives[0][0])

    def test_un_correo_con_todos_los_planes_del_responsable(self):
        self._enviar('P-1', 'P-2')
        self.assertEqual(len(avisos()), 1)
        self.assertIn('(2 planes)', avisos()[0].subject)

    def test_registra_lote_envios_e_items(self):
        lote = self._enviar('P-1', 'P-2', 'P-3')
        envio = lote.envios.get(nombre_responsable='Ana Perez')
        self.assertEqual((envio.estado, envio.destinatario_real, envio.enviado_a, envio.n_planes),
                         ('ENVIADO', 'ana@x.cl', PRUEBA, 2))
        self.assertIsNotNone(envio.enviado_en)
        self.assertEqual({i.id_proyecto for i in envio.items.all()}, {'P-1', 'P-2'})
        self.assertEqual(NotificacionPlanItem.objects.count(), 3)
        self.assertEqual(lote.total_planes, 3)

    def test_ids_de_una_seleccion_por_filtros(self):
        lote = iniciar_envio({'anho': 2026, 'filtros': {'estados': ['ATRASADO'], 'correo': 'con'},
                              'excluir': ['P-3']}, None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual(lote.envios.count(), 1)
        self.assertEqual(lote.envios.get().nombre_responsable, 'Ana Perez')

    def test_sin_correos_enviables_no_envia_ni_crea_lote(self):
        with self.assertRaises(ValueError):
            self._enviar('P-4')
        self.assertEqual((len(avisos()), NotificacionPlanLote.objects.count()), (0, 0))

    @override_settings(NOTIF_PLAN_MAX_LOTE=1)
    def test_el_tope_por_lote_bloquea_todo_el_envio(self):
        with self.assertRaises(ValueError):
            self._enviar('P-1', 'P-3')
        self.assertEqual((len(avisos()), NotificacionPlanLote.objects.count()), (0, 0))

    def test_los_omitidos_no_bloquean_a_los_demas(self):
        lote = self._enviar('P-1', 'P-4')
        self.assertEqual(len(avisos()), 1)
        self.assertEqual(lote.envios.count(), 1)

    def test_un_envio_de_prueba_no_exige_confirmar_reenvio_la_proxima_vez(self):
        self._enviar('P-1')
        self._enviar('P-1')        # no lanza ReenvioPendiente: el anterior fue solo una prueba
        self.assertEqual(len(avisos()), 2)

    def test_hay_un_lote_enviando_bloquea_otro(self):
        NotificacionPlanLote.objects.create(estado='ENVIANDO', modo_prueba=True)
        with self.assertRaises(EnvioEnCurso):
            self._enviar('P-1')
        self.assertEqual(len(avisos()), 0)

    def test_un_lote_enviando_muy_antiguo_no_bloquea(self):
        viejo = NotificacionPlanLote.objects.create(estado='ENVIANDO', modo_prueba=True)
        NotificacionPlanLote.objects.filter(pk=viejo.pk).update(creado_en=timezone.now() - timedelta(minutes=60))
        self._enviar('P-1')
        self.assertEqual(len(avisos()), 1)


@override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_CC_JEFATURAS=True,
                   NOTIF_PLAN_RESUMEN_CC=['cristina@x.cl', 'sandra@x.cl'], NOTIF_PLAN_MAX_LOTE=50)
class EnvioRealTest(BaseEnvioTest):
    def test_modo_real_envia_al_responsable_con_copia_solo_a_las_jefaturas(self):
        lote = iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        m = avisos()[0]
        self.assertEqual(m.to, ['ana@x.cl'])
        self.assertEqual(m.cc, ['jefa@x.cl'])          # solo la jefatura; Cristina y Sandra reciben el resumen
        self.assertFalse(m.subject.startswith('[PRUEBA]'))
        self.assertFalse(lote.modo_prueba)

    def test_reenvio_exige_confirmacion_explicita(self):
        iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual(len(avisos()), 1)
        with self.assertRaises(ReenvioPendiente) as ctx:
            iniciar_envio(self.sel('P-1', 'P-2'), None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual(ctx.exception.planes, ['P-1'])
        self.assertEqual(len(avisos()), 1)                      # no salió nada nuevo
        iniciar_envio(self.sel('P-1', 'P-2'), None, None, en_hilo=False, confirmar_real=True, confirmar_reenvio=True)
        self.assertEqual(len(avisos()), 2)

    def test_un_plan_nuevo_no_es_reenvio(self):
        iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        iniciar_envio(self.sel('P-3'), None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual(len(avisos()), 2)


@override_settings(NOTIF_PLAN_MODO_PRUEBA=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_CC_JEFATURAS=False,
                   NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50, EMAIL_HOST_PASSWORD='SECRETO-123')
class FallosTest(BaseEnvioTest):
    def _con_fallo_en(self, destinatario_asunto):
        """send_messages falla para el mensaje cuyo cuerpo contiene `destinatario_asunto`."""
        original = mail.get_connection().__class__.send_messages

        def falso(conexion, mensajes):
            if any(destinatario_asunto in m.body for m in mensajes):
                raise RuntimeError('SMTP rechazó: auth SECRETO-123 inválida')
            return original(conexion, mensajes)
        return mock.patch('django.core.mail.backends.locmem.EmailBackend.send_messages', falso)

    def test_un_fallo_no_detiene_a_los_demas_y_queda_registrado(self):
        with self._con_fallo_en('Proyecto P-1'):
            lote = iniciar_envio(self.sel('P-1', 'P-3'), None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual((lote.estado, lote.enviados, lote.fallidos), ('PARCIAL', 1, 1))
        self.assertEqual(len(avisos()), 1)
        malo = lote.envios.get(nombre_responsable='Ana Perez')
        self.assertEqual(malo.estado, 'ERROR')
        self.assertEqual(lote.envios.get(nombre_responsable='Beto Rios').estado, 'ENVIADO')

    def test_el_error_guardado_nunca_contiene_la_contrasena(self):
        with self._con_fallo_en('Proyecto P-1'):
            lote = iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        error = lote.envios.get().error
        self.assertNotIn('SECRETO-123', error)
        self.assertIn('***', error)
        self.assertEqual(lote.estado, 'ERROR')

    def test_un_envio_fallido_no_cuenta_como_notificado(self):
        with self._con_fallo_en('Proyecto P-1'):
            iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        from api.services_notificacion_plan import historial_notificaciones
        self.assertEqual(historial_notificaciones(['P-1']), {})

    def test_estado_lote_cierra_un_lote_interrumpido(self):
        lote = NotificacionPlanLote.objects.create(estado='ENVIANDO', modo_prueba=True, total_responsables=1)
        NotificacionPlanEnvio.objects.create(lote=lote, nombre_responsable='X', estado='PENDIENTE')
        NotificacionPlanLote.objects.filter(pk=lote.pk).update(creado_en=timezone.now() - timedelta(minutes=60))
        r = estado_lote(lote.pk)
        self.assertEqual(r['estado'], 'ERROR')
        self.assertEqual(r['envios'][0]['estado'], 'ERROR')

    def test_estado_lote_inexistente(self):
        self.assertIsNone(estado_lote(99999))


class _HiloSincrono:
    """Reemplaza threading.Thread para que el envío corra en el acto dentro del test."""
    def __init__(self, target=None, args=(), kwargs=None, daemon=None):
        self._t, self._a, self._k = target, args, kwargs or {}

    def start(self):
        self._t(*self._a, **self._k)


@override_settings(NOTIF_PLAN_USUARIOS=[CORREO_OK], NOTIF_PLAN_MODO_PRUEBA=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA,
                   NOTIF_PLAN_CC_JEFATURAS=False, NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50)
class EndpointsEnvioTest(BaseEnvioTest):
    BASE = '/api/gestor-compras/notificacion/'

    def setUp(self):
        super().setUp()
        self.nico = User.objects.create_user('nico', email=CORREO_OK, password='x')
        PerfilUsuario.objects.create(user=self.nico, role='admin')
        self.otro = User.objects.create_user('otro', email='otro@redsalud.gob.cl', password='x')
        PerfilUsuario.objects.create(user=self.otro, role='admin')
        self.client = APIClient()

    def _post(self, ruta, cuerpo):
        return self.client.post(self.BASE + ruta, cuerpo, format='json')

    def test_otro_admin_no_puede_previsualizar_enviar_ni_ver_lotes(self):
        self.client.force_authenticate(self.otro)
        self.assertEqual(self._post('previsualizar/', {'seleccion': self.sel('P-1')}).status_code, 403)
        self.assertEqual(self._post('enviar/', {'seleccion': self.sel('P-1')}).status_code, 403)
        self.assertEqual(self.client.get(self.BASE + 'lotes/1/').status_code, 403)
        self.assertEqual(len(avisos()), 0)

    def test_sin_login_es_401(self):
        self.assertEqual(self._post('enviar/', {'seleccion': self.sel('P-1')}).status_code, 401)

    def test_previsualizar(self):
        self.client.force_authenticate(self.nico)
        r = self._post('previsualizar/', {'seleccion': self.sel('P-1', 'P-3')})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data['enviables']), 2)
        self.assertNotIn('_mensajes', r.data)
        self.assertEqual(len(avisos()), 0)           # previsualizar jamás envía

    def test_enviar_devuelve_202_y_el_lote_queda_consultable(self):
        self.client.force_authenticate(self.nico)
        with mock.patch('threading.Thread', _HiloSincrono):
            r = self._post('enviar/', {'seleccion': self.sel('P-1', 'P-3')})
        self.assertEqual(r.status_code, 202)
        self.assertEqual(len(avisos()), 2)
        estado = self.client.get(self.BASE + f"lotes/{r.data['lote_id']}/")
        self.assertEqual(estado.status_code, 200)
        self.assertEqual((estado.data['estado'], estado.data['enviados'], estado.data['total']), ('ENVIADO', 2, 2))
        self.assertEqual(self.client.get(self.BASE + 'lotes/99999/').status_code, 404)

    def test_selecciones_invalidas_son_400(self):
        self.client.force_authenticate(self.nico)
        for malo in (None, 'texto', [], {}, {'anho': 'x', 'ids': []}, {'anho': 2026, 'ids': 'P-1'},
                     {'anho': 2026, 'filtros': 'no'}):
            self.assertEqual(self._post('enviar/', {'seleccion': malo}).status_code, 400, malo)
        self.assertEqual(len(avisos()), 0)

    def test_cuerpo_que_no_es_un_objeto_es_400_y_no_500(self):
        self.client.force_authenticate(self.nico)
        for ruta in ('enviar/', 'previsualizar/', 'confirmar-correo/'):
            self.assertEqual(self.client.post(self.BASE + ruta, [1, 2], format='json').status_code, 400, ruta)

    def test_sin_destinatarios_enviables_es_400(self):
        self.client.force_authenticate(self.nico)
        self.assertEqual(self._post('enviar/', {'seleccion': self.sel('P-4')}).status_code, 400)

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_reenvio_devuelve_409_y_se_confirma_con_true_estricto(self):
        self.client.force_authenticate(self.nico)
        real = {'confirmar_envio_real': True}
        with mock.patch('threading.Thread', _HiloSincrono):
            self.assertEqual(self._post('enviar/', {'seleccion': self.sel('P-1'), **real}).status_code, 202)
            r = self._post('enviar/', {'seleccion': self.sel('P-1'), **real})
            self.assertEqual((r.status_code, r.data['code'], r.data['planes']), (409, 'reenvio', ['P-1']))
            # "true" como texto NO cuenta como confirmación: debe ser el booleano true.
            self.assertEqual(self._post('enviar/', {'seleccion': self.sel('P-1'), **real,
                                                   'confirmar_reenvio': 'true'}).status_code, 409)
            self.assertEqual(self._post('enviar/', {'seleccion': self.sel('P-1'), **real,
                                                   'confirmar_reenvio': True}).status_code, 202)
        self.assertEqual(len(avisos()), 2)

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_en_modo_oficial_sin_confirmar_el_envio_real_no_sale_nada(self):
        """La confirmación la exige el SERVIDOR: un POST directo (sin la casilla de la pantalla)
        no manda correos reales."""
        self.client.force_authenticate(self.nico)
        with mock.patch('threading.Thread', _HiloSincrono):
            for cuerpo in ({}, {'confirmar_envio_real': 'true'}, {'confirmar_envio_real': 1},
                           {'confirmar_envio_real': False}):
                r = self._post('enviar/', {'seleccion': self.sel('P-1', 'P-3'), **cuerpo})
                self.assertEqual((r.status_code, r.data['code']), (409, 'confirmar_real'), cuerpo)
        self.assertEqual((len(mail.outbox), NotificacionPlanLote.objects.count()), (0, 0))

    def test_en_modo_prueba_no_hace_falta_la_confirmacion_real(self):
        self.client.force_authenticate(self.nico)
        with mock.patch('threading.Thread', _HiloSincrono):
            self.assertEqual(self._post('enviar/', {'seleccion': self.sel('P-1')}).status_code, 202)

    def test_envio_en_curso_devuelve_409(self):
        self.client.force_authenticate(self.nico)
        NotificacionPlanLote.objects.create(estado='ENVIANDO', modo_prueba=True)
        r = self._post('enviar/', {'seleccion': self.sel('P-1')})
        self.assertEqual((r.status_code, r.data['code']), (409, 'en_curso'))


@override_settings(NOTIF_PLAN_MODO_PRUEBA=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_CC_JEFATURAS=False,
                   NOTIF_PLAN_RESUMEN_CC=['cristina@x.cl', 'sandra@x.cl'], NOTIF_PLAN_MAX_LOTE=50)
class ResumenPdfTest(BaseEnvioTest):
    def test_resumen_de_prueba_va_solo_al_destino_de_prueba_con_el_pdf(self):
        lote = iniciar_envio(self.sel('P-1', 'P-3'), None, None, en_hilo=False, confirmar_real=True)
        r = resumenes()
        self.assertEqual(len(r), 1)
        self.assertEqual((r[0].to, r[0].cc), ([PRUEBA], []))        # Cristina y Sandra NO reciben nada en prueba
        self.assertTrue(r[0].subject.startswith('[PRUEBA] Resumen:'))
        nombre, contenido, tipo = r[0].attachments[0]
        self.assertEqual((nombre, tipo), (f'notificaciones_plan_compras_lote_{lote.pk}.pdf', 'application/pdf'))
        self.assertTrue(contenido.startswith(b'%PDF'))
        lote.refresh_from_db()
        self.assertTrue(lote.resumen_enviado)

    @override_settings(NOTIF_PLAN_MODO_PRUEBA=False)
    def test_resumen_real_va_al_emisor_con_copia_a_las_jefaturas_de_abastecimiento(self):
        emisor = User.objects.create_user('nico', email=CORREO_OK, password='x')
        iniciar_envio(self.sel('P-1'), None, emisor, en_hilo=False, confirmar_real=True)
        r = resumenes()[0]
        self.assertEqual((r.to, r.cc), ([CORREO_OK], ['cristina@x.cl', 'sandra@x.cl']))
        self.assertFalse(r.subject.startswith('[PRUEBA]'))

    def test_el_resumen_se_envia_una_sola_vez(self):
        from api.services_notificacion_plan import enviar_resumen_lote
        lote = iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        self.assertFalse(enviar_resumen_lote(lote.pk))
        self.assertEqual(len(resumenes()), 1)

    def test_si_no_se_envio_nada_no_hay_resumen(self):
        with mock.patch('django.core.mail.backends.locmem.EmailBackend.send_messages',
                        side_effect=RuntimeError('caído')):
            iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual(len(resumenes()), 0)

    def test_un_fallo_del_resumen_no_afecta_el_lote(self):
        with mock.patch('api.services_notificacion_plan.enviar_resumen_lote', side_effect=RuntimeError('x')):
            lote = iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual(lote.estado, 'ENVIADO')

    def test_pdf_incluye_a_los_notificados(self):
        from api.services_notificacion_plan_pdf import generar_pdf_lote
        lote = iniciar_envio(self.sel('P-1', 'P-2', 'P-3'), None, None, en_hilo=False, confirmar_real=True)
        pdf = generar_pdf_lote(lote.pk)
        self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertGreater(len(pdf), 3000)

    def test_pdf_de_lote_inexistente(self):
        from api.services_notificacion_plan_pdf import generar_pdf_lote
        with self.assertRaises(NotificacionPlanLote.DoesNotExist):
            generar_pdf_lote(99999)

    def test_pdf_tolera_texto_con_html_y_saltos(self):
        from api.services_notificacion_plan_pdf import generar_pdf_lote
        lote = NotificacionPlanLote.objects.create(estado='ENVIADO', modo_prueba=False, enviados=1)
        e = NotificacionPlanEnvio.objects.create(
            lote=lote, nombre_responsable='<b>Mal</b> & Cia', departamento='A\nB', estado='ERROR',
            error='<script>x</script>', n_planes=1)
        NotificacionPlanItem.objects.create(envio=e, id_proyecto='P&1', nombre_proyecto='<i>x</i>')
        self.assertTrue(generar_pdf_lote(lote.pk).startswith(b'%PDF'))


@override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_CC_JEFATURAS=False,
                   NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50)
class ConfirmacionRealTest(BaseEnvioTest):
    def test_el_servicio_oficial_exige_confirmar_real(self):
        from api.services_notificacion_plan import ConfirmacionRealPendiente
        with self.assertRaises(ConfirmacionRealPendiente):
            iniciar_envio(self.sel('P-1'), None, None, en_hilo=False)
        self.assertEqual((len(mail.outbox), NotificacionPlanLote.objects.count()), (0, 0))

    def test_con_confirmacion_si_envia(self):
        iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True)
        self.assertEqual(len(avisos()), 1)


@override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_CC_JEFATURAS=False,
                   NOTIF_PLAN_RESUMEN_PARA=[CORREO_OK], NOTIF_PLAN_RESUMEN_CC=['cristina@x.cl', 'sandra@x.cl'],
                   NOTIF_PLAN_MAX_LOTE=50)
class DestinatariosResumenTest(BaseEnvioTest):
    def _resumen(self, emisor_email='otra.persona@x.cl'):
        emisor = User.objects.create_user('emisor', email=emisor_email, password='x')
        iniciar_envio(self.sel('P-1'), None, emisor, en_hilo=False, confirmar_real=True)
        return resumenes()[0]

    def test_nicolas_va_en_para_y_cristina_y_sandra_en_copia(self):
        r = self._resumen(emisor_email=CORREO_OK)
        self.assertEqual(r.to, [CORREO_OK])                     # sin duplicarlo: ya era quien envía
        self.assertEqual(r.cc, ['cristina@x.cl', 'sandra@x.cl'])

    def test_si_envia_otra_persona_van_ambos_en_para(self):
        r = self._resumen()
        self.assertEqual(r.to, ['otra.persona@x.cl', CORREO_OK])

    def test_nadie_repetido_entre_para_y_copia(self):
        from api.services_notificacion_plan import resumen_destinatarios
        with override_settings(NOTIF_PLAN_RESUMEN_CC=[CORREO_OK, 'cristina@x.cl']):
            d = resumen_destinatarios(CORREO_OK, False)
        self.assertEqual((d['para'], d['cc']), ([CORREO_OK], ['cristina@x.cl']))

    def test_en_modo_prueba_solo_el_destino_de_prueba(self):
        from api.services_notificacion_plan import resumen_destinatarios
        self.assertEqual(resumen_destinatarios(CORREO_OK, True), {'para': [PRUEBA], 'cc': []})

    def test_la_revision_previa_muestra_los_correos_del_resumen(self):
        emisor = User.objects.create_user('emisor2', email=CORREO_OK, password='x')
        prev = previsualizar_lote(self.sel('P-1'), None, usuario=emisor)
        self.assertEqual((prev['resumen_para'], prev['resumen_cc']), ([CORREO_OK], ['cristina@x.cl', 'sandra@x.cl']))
