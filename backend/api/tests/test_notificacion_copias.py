"""Copias (CC) editables y envío de prueba del módulo Notificación."""
from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from api.models import (
    Departamento, NotificacionPlanCopia, NotificacionPlanLote, PerfilUsuario, PertenenciaUsuario,
    PlanerPAC, UsuarioPanel,
)
from api.services_notificacion_plan import (
    calcular_copias, enviar_prueba, guardar_regla_copia, iniciar_envio, previsualizar_lote,
)

CORREO_OK = 'nicolas.asencio@redsalud.gob.cl'
PRUEBA = 'prueba@x.cl'
AUTO = [{'nombre': 'JEFA UNO', 'cargo': 'Jefa', 'correo': 'jefa@x.cl'},
        {'nombre': 'JEFE DOS', 'cargo': 'Jefe', 'correo': 'jefe2@x.cl'}]


class CalcularCopiasTest(TestCase):
    def _c(self, auto=AUTO, agregar=None, excluir=None, ajuste=None, resp='resp@x.cl'):
        return calcular_copias(auto, agregar or {}, excluir or set(), ajuste, resp)

    def test_sin_reglas_son_las_jefaturas_automaticas(self):
        copias, excluidas = self._c()
        self.assertEqual([c['correo'] for c in copias], ['jefa@x.cl', 'jefe2@x.cl'])
        self.assertEqual({c['origen'] for c in copias}, {'AUTO'})
        self.assertEqual(excluidas, [])

    def test_regla_excluir_quita_y_queda_listada_para_poder_restaurarla(self):
        copias, excluidas = self._c(excluir={'jefe2@x.cl'})
        self.assertEqual([c['correo'] for c in copias], ['jefa@x.cl'])
        self.assertEqual([(e['correo'], e['motivo']) for e in excluidas], [('jefe2@x.cl', 'REGLA')])

    def test_regla_agregar_suma_un_correo(self):
        copias, _ = self._c(agregar={'nuevo@x.cl': 'NUEVA PERSONA'})
        self.assertEqual([c['correo'] for c in copias], ['jefa@x.cl', 'jefe2@x.cl', 'nuevo@x.cl'])
        self.assertEqual(copias[-1]['origen'], 'REGLA')

    def test_ajuste_puntual_quita_y_agrega_solo_para_ese_envio(self):
        copias, excluidas = self._c(ajuste={'quitar': ['jefa@x.cl'], 'agregar': ['otro@x.cl']})
        self.assertEqual([c['correo'] for c in copias], ['jefe2@x.cl', 'otro@x.cl'])
        self.assertEqual([(e['correo'], e['motivo']) for e in excluidas], [('jefa@x.cl', 'PUNTUAL')])

    def test_agregar_puntual_se_respeta_aunque_una_regla_lo_excluya(self):
        copias, _ = self._c(excluir={'jefa@x.cl'}, ajuste={'agregar': ['jefa@x.cl']})
        self.assertIn('jefa@x.cl', [c['correo'] for c in copias])

    def test_quitar_puntual_siempre_gana(self):
        copias, _ = self._c(ajuste={'agregar': ['x@x.cl'], 'quitar': ['x@x.cl']})
        self.assertNotIn('x@x.cl', [c['correo'] for c in copias])

    def test_el_responsable_nunca_va_en_copia_de_su_propio_correo(self):
        copias, excluidas = self._c(resp='JEFA@x.cl', ajuste={'agregar': ['jefa@x.cl']})
        self.assertNotIn('jefa@x.cl', [c['correo'] for c in copias + excluidas])

    def test_no_duplica_y_descarta_correos_invalidos(self):
        copias, _ = self._c(agregar={'jefa@x.cl': 'DUP'}, ajuste={'agregar': ['basura', '', 'JEFE2@x.cl']})
        correos = [c['correo'] for c in copias]
        self.assertEqual(sorted(correos), ['jefa@x.cl', 'jefe2@x.cl'])

    def test_orden_automaticas_luego_reglas_luego_puntuales(self):
        copias, _ = self._c(agregar={'regla@x.cl': 'R'}, ajuste={'agregar': ['puntual@x.cl']})
        self.assertEqual([c['origen'] for c in copias], ['AUTO', 'AUTO', 'REGLA', 'PUNTUAL'])

    def test_ajuste_none_o_vacio(self):
        self.assertEqual(len(self._c(ajuste=None)[0]), 2)
        self.assertEqual(len(self._c(ajuste={})[0]), 2)


class BaseCopiasTest(TestCase):
    def setUp(self):
        cache.clear()
        self.depto = Departamento.objects.create(descripcion='DPTO UNO', es_depto='SI', subdireccion_id=2,
                                                 establecimiento_id=1)
        self.otro_depto = Departamento.objects.create(descripcion='DPTO DOS', es_depto='SI', subdireccion_id=2,
                                                      establecimiento_id=1)
        self.ana = UsuarioPanel.objects.create(usuario='ana', alias='ANA PEREZ', correo_electronico='ana@x.cl',
                                               cargo='Encargada', activo='S', establecimiento_id=1)
        self.beto = UsuarioPanel.objects.create(usuario='beto', alias='BETO RIOS', correo_electronico='beto@x.cl',
                                                cargo='Encargado', activo='S', establecimiento_id=1)
        self.jefa = UsuarioPanel.objects.create(usuario='jefa', alias='JEFA UNO', correo_electronico='jefa@x.cl',
                                                cargo='Jefa Departamento', activo='S', establecimiento_id=1)
        self.jefe2 = UsuarioPanel.objects.create(usuario='jefe2', alias='JEFE DOS', correo_electronico='jefe2@x.cl',
                                                 cargo='Jefe Subdepto', activo='S', establecimiento_id=1)
        self.externo = UsuarioPanel.objects.create(usuario='ext', alias='PERSONA EXTRA',
                                                   correo_electronico='extra@x.cl', cargo='Profesional',
                                                   activo='S', establecimiento_id=1)
        for u in (self.jefa, self.jefe2):
            PertenenciaUsuario.objects.create(id_usuario=u.id, tipo_dependencia='DEP',
                                              id_dependencia=self.depto.id, id_subdireccion=2)
        for id_proyecto, resp, depto in (('P-1', 'Ana Perez', 'DPTO UNO'), ('P-2', 'Beto Rios', 'DPTO DOS')):
            PlanerPAC.objects.create(
                id_proyecto=id_proyecto, nombre_proyecto=f'Proyecto {id_proyecto}', depto=depto, sub='DIRECCION',
                nombre_responsable=resp, cargo_responsable='Cargo', fecha_inicio_compra='2020-03-01 00:00:00',
                monto_total_item='1000', monto_unitario_item='1000', cantidad_items='1', nombre_item='Item', pac='2026')

    def sel(self, *ids):
        return {'anho': 2026, 'ids': list(ids)}

    def fila(self, prev, nombre):
        return next(e for e in prev['enviables'] if e['nombre_responsable'] == nombre)


@override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA,
                   NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50)
class ReglasEnPrevisualizacionTest(BaseCopiasTest):
    def test_sin_reglas_van_las_jefaturas_del_departamento(self):
        f = self.fila(previsualizar_lote(self.sel('P-1'), None), 'Ana Perez')
        self.assertEqual(f['cc'], ['jefa@x.cl', 'jefe2@x.cl'])
        self.assertEqual(f['depto_ref_id'], self.depto.id)

    def test_regla_excluir_se_aplica_y_se_puede_restaurar(self):
        guardar_regla_copia('excluir', self.depto.id, 'jefe2@x.cl', 'JEFE DOS', None)
        f = self.fila(previsualizar_lote(self.sel('P-1'), None), 'Ana Perez')
        self.assertEqual(f['cc'], ['jefa@x.cl'])
        self.assertEqual([(e['correo'], e['motivo']) for e in f['copias_excluidas']], [('jefe2@x.cl', 'REGLA')])
        guardar_regla_copia('olvidar', self.depto.id, 'jefe2@x.cl', '', None)
        self.assertEqual(self.fila(previsualizar_lote(self.sel('P-1'), None), 'Ana Perez')['cc'],
                         ['jefa@x.cl', 'jefe2@x.cl'])

    def test_regla_agregar_incluye_el_correo_con_el_nombre_del_panel(self):
        guardar_regla_copia('agregar', self.depto.id, 'extra@x.cl', '', None)
        f = self.fila(previsualizar_lote(self.sel('P-1'), None), 'Ana Perez')
        self.assertIn('extra@x.cl', f['cc'])
        extra = next(c for c in f['copias'] if c['correo'] == 'extra@x.cl')
        self.assertEqual((extra['nombre'], extra['origen']), ('PERSONA EXTRA', 'REGLA'))

    def test_la_regla_es_por_departamento(self):
        guardar_regla_copia('excluir', self.depto.id, 'jefa@x.cl', '', None)
        guardar_regla_copia('agregar', self.otro_depto.id, 'extra@x.cl', '', None)
        prev = previsualizar_lote(self.sel('P-1', 'P-2'), None)
        self.assertEqual(self.fila(prev, 'Ana Perez')['cc'], ['jefe2@x.cl'])             # DPTO UNO: sin jefa
        self.assertEqual(self.fila(prev, 'Beto Rios')['cc'], ['extra@x.cl'])             # DPTO DOS: solo la agregada

    def test_ajuste_puntual_no_se_guarda(self):
        ajustes = {'Ana Perez': {'quitar': ['jefa@x.cl'], 'agregar': ['extra@x.cl']}}
        f = self.fila(previsualizar_lote(self.sel('P-1'), None, ajustes=ajustes), 'Ana Perez')
        self.assertEqual(f['cc'], ['jefe2@x.cl', 'extra@x.cl'])
        self.assertEqual(NotificacionPlanCopia.objects.count(), 0)
        self.assertEqual(self.fila(previsualizar_lote(self.sel('P-1'), None), 'Ana Perez')['cc'],
                         ['jefa@x.cl', 'jefe2@x.cl'])                                   # el siguiente envío vuelve a lo normal

    def test_el_ajuste_de_un_responsable_no_afecta_a_otro(self):
        ajustes = {'Ana Perez': {'quitar': ['jefa@x.cl']}}
        prev = previsualizar_lote(self.sel('P-1', 'P-2'), None, ajustes=ajustes)
        self.assertEqual(self.fila(prev, 'Ana Perez')['cc'], ['jefe2@x.cl'])

    @override_settings(NOTIF_PLAN_CC_JEFATURAS=False)
    def test_con_el_interruptor_general_apagado_no_va_ninguna_copia(self):
        guardar_regla_copia('agregar', self.depto.id, 'extra@x.cl', '', None)
        f = self.fila(previsualizar_lote(self.sel('P-1'), None), 'Ana Perez')
        self.assertEqual(f['cc'], [])
        self.assertTrue(f['copias'])        # pero se siguen mostrando para poder revisarlas


class GuardarReglaTest(BaseCopiasTest):
    def test_agregar_y_excluir_se_anulan_entre_si(self):
        guardar_regla_copia('agregar', self.depto.id, 'x@x.cl', 'X', None)
        guardar_regla_copia('excluir', self.depto.id, 'X@x.cl', '', None)
        regla = NotificacionPlanCopia.objects.get()
        self.assertEqual(regla.accion, 'EXCLUIR')

    def test_olvidar_borra_la_regla(self):
        guardar_regla_copia('excluir', self.depto.id, 'x@x.cl', '', None)
        guardar_regla_copia('olvidar', self.depto.id, 'x@x.cl', '', None)
        self.assertEqual(NotificacionPlanCopia.objects.count(), 0)

    def test_validaciones(self):
        for args in (('borrar', self.depto.id, 'x@x.cl'), ('excluir', 99999, 'x@x.cl'),
                     ('excluir', 'abc', 'x@x.cl'), ('excluir', None, 'x@x.cl'),
                     ('excluir', self.depto.id, 'no-es-correo'), ('excluir', self.depto.id, '')):
            with self.assertRaises(ValueError, msg=str(args)):
                guardar_regla_copia(*args, '', None)
        self.assertEqual(NotificacionPlanCopia.objects.count(), 0)

    def test_guarda_quien_la_creo(self):
        u = User.objects.create_user('quien', password='x')
        guardar_regla_copia('excluir', self.depto.id, 'x@x.cl', 'X', u)
        self.assertEqual(NotificacionPlanCopia.objects.get().creado_por, u)


@override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA,
                   NOTIF_PLAN_RESUMEN_CC=['cristina@x.cl', 'sandra@x.cl'], NOTIF_PLAN_MAX_LOTE=50)
class EnvioOficialConCopiasTest(BaseCopiasTest):
    def _avisos(self):
        return [m for m in mail.outbox if 'Resumen:' not in m.subject]

    def test_el_envio_oficial_usa_las_copias_ajustadas(self):
        guardar_regla_copia('excluir', self.depto.id, 'jefe2@x.cl', '', None)
        lote = iniciar_envio(self.sel('P-1'), None, None, en_hilo=False, confirmar_real=True,
                             ajustes={'Ana Perez': {'agregar': ['extra@x.cl']}})
        m = self._avisos()[0]
        self.assertEqual((m.to, m.cc), (['ana@x.cl'], ['jefa@x.cl', 'extra@x.cl']))
        self.assertEqual(lote.envios.get().cc, 'jefa@x.cl,extra@x.cl')       # queda registrado lo REAL
        self.assertNotIn('cristina@x.cl', m.to + m.cc)                      # las fijas solo en el resumen

    def test_cristina_y_sandra_reciben_solo_el_resumen(self):
        iniciar_envio(self.sel('P-1', 'P-2'), None, User.objects.create_user('n', email=CORREO_OK, password='x'),
                      en_hilo=False, confirmar_real=True)
        resumen = [m for m in mail.outbox if 'Resumen:' in m.subject]
        self.assertEqual(len(resumen), 1)
        self.assertEqual(resumen[0].cc, ['cristina@x.cl', 'sandra@x.cl'])
        for aviso in self._avisos():
            self.assertNotIn('cristina@x.cl', aviso.to + aviso.cc)
            self.assertNotIn('sandra@x.cl', aviso.to + aviso.cc)


@override_settings(NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=True, NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA,
                   NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50)
class EnviarPruebaTest(BaseCopiasTest):
    def test_en_modo_oficial_la_prueba_va_solo_a_la_cuenta_de_prueba(self):
        r = enviar_prueba(self.sel('P-1', 'P-2'), None, ejemplo='Beto Rios')
        self.assertEqual(len(mail.outbox), 1)
        m = mail.outbox[0]
        self.assertEqual((m.to, m.cc), ([PRUEBA], []))
        self.assertTrue(m.subject.startswith('[PRUEBA] '))
        self.assertIn('MODO PRUEBA', m.alternatives[0][0])
        self.assertIn('beto@x.cl', m.alternatives[0][0])             # a quién habría ido de verdad
        self.assertEqual((r['responsable'], r['enviado_a']), ('Beto Rios', [PRUEBA]))

    def test_no_crea_lote_ni_marca_planes_como_notificados(self):
        from api.services_notificacion_plan import historial_notificaciones
        enviar_prueba(self.sel('P-1'), None)
        self.assertEqual(NotificacionPlanLote.objects.count(), 0)
        self.assertEqual(historial_notificaciones(['P-1']), {})

    def test_sin_responsables_con_correo_falla_sin_enviar(self):
        PlanerPAC.objects.create(id_proyecto='P-9', nombre_proyecto='x', depto='DPTO UNO', nombre_responsable='Nadie Conocido',
                                 fecha_inicio_compra='2020-03-01 00:00:00', monto_total_item='1', pac='2026')
        with self.assertRaises(ValueError):
            enviar_prueba(self.sel('P-9'), None)
        self.assertEqual(len(mail.outbox), 0)

    def test_respeta_los_ajustes_en_el_aviso_de_a_quien_habria_ido(self):
        enviar_prueba(self.sel('P-1'), None, ajustes={'Ana Perez': {'quitar': ['jefa@x.cl']}})
        html = mail.outbox[0].alternatives[0][0]
        self.assertIn('jefe2@x.cl', html)
        self.assertNotIn('jefa@x.cl', html)


@override_settings(NOTIF_PLAN_USUARIOS=[CORREO_OK], NOTIF_PLAN_MODO_PRUEBA=False, NOTIF_PLAN_CC_JEFATURAS=True,
                   NOTIF_PLAN_DESTINO_PRUEBA=PRUEBA, NOTIF_PLAN_RESUMEN_CC=[], NOTIF_PLAN_MAX_LOTE=50)
class EndpointsCopiasTest(BaseCopiasTest):
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

    def test_otro_admin_recibe_403_en_copias_y_prueba(self):
        self.client.force_authenticate(self.otro)
        self.assertEqual(self._post('copias/', {'accion': 'excluir', 'departamento_id': self.depto.id,
                                                'correo': 'x@x.cl'}).status_code, 403)
        self.assertEqual(self._post('enviar-prueba/', {'seleccion': self.sel('P-1')}).status_code, 403)
        self.assertEqual((NotificacionPlanCopia.objects.count(), len(mail.outbox)), (0, 0))

    def test_guardar_regla_y_verla_en_la_previsualizacion(self):
        self.client.force_authenticate(self.nico)
        r = self._post('copias/', {'accion': 'excluir', 'departamento_id': self.depto.id,
                                   'correo': 'jefe2@x.cl', 'nombre': 'JEFE DOS'})
        self.assertEqual(r.status_code, 200)
        prev = self._post('previsualizar/', {'seleccion': self.sel('P-1')})
        self.assertEqual(prev.data['enviables'][0]['cc'], ['jefa@x.cl'])

    def test_regla_invalida_es_400(self):
        self.client.force_authenticate(self.nico)
        for cuerpo in ({'accion': 'excluir', 'departamento_id': 99999, 'correo': 'x@x.cl'},
                       {'accion': 'excluir', 'departamento_id': self.depto.id, 'correo': 'mal'},
                       {'accion': 'x', 'departamento_id': self.depto.id, 'correo': 'x@x.cl'}, {}):
            self.assertEqual(self._post('copias/', cuerpo).status_code, 400, cuerpo)

    def test_ajustes_en_la_previsualizacion_y_validacion(self):
        self.client.force_authenticate(self.nico)
        ok = self._post('previsualizar/', {'seleccion': self.sel('P-1'),
                                           'ajustes_cc': {'Ana Perez': {'quitar': ['jefa@x.cl']}}})
        self.assertEqual(ok.data['enviables'][0]['cc'], ['jefe2@x.cl'])
        for malo in ('texto', [1], {'Ana': 'x'}):
            r = self._post('previsualizar/', {'seleccion': self.sel('P-1'), 'ajustes_cc': malo})
            self.assertEqual(r.status_code, 400, malo)

    def test_enviar_prueba_manda_un_solo_correo_a_la_cuenta_de_prueba(self):
        self.client.force_authenticate(self.nico)
        r = self._post('enviar-prueba/', {'seleccion': self.sel('P-1', 'P-2'), 'ejemplo': 'Ana Perez'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['enviado_a'], [PRUEBA])
        self.assertEqual([(m.to, m.cc) for m in mail.outbox], [([PRUEBA], [])])

    def test_enviar_prueba_sin_destinatarios_es_400(self):
        self.client.force_authenticate(self.nico)
        self.assertEqual(self._post('enviar-prueba/', {'seleccion': self.sel()}).status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_enviar_prueba_con_smtp_caido_es_502_sin_filtrar_detalles(self):
        from unittest import mock
        self.client.force_authenticate(self.nico)
        with mock.patch('django.core.mail.backends.locmem.EmailBackend.send_messages',
                        side_effect=RuntimeError('auth SECRETO fallida')):
            r = self._post('enviar-prueba/', {'seleccion': self.sel('P-1')})
        self.assertEqual(r.status_code, 502)
        self.assertNotIn('SECRETO', str(r.data))
