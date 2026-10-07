"""Paso 3 del módulo Notificación: cruce responsable del PAC → correo y jefaturas."""
from django.core.cache import cache
from django.test import TestCase

from api.models import Departamento, PacResponsableCorreo, PertenenciaUsuario, UsuarioPanel
from api.services_notificacion_plan import (
    ESTADO_AMBIGUO, ESTADO_CONFIRMADO, ESTADO_EXACTO, ESTADO_SIN_CORREO, ESTADO_SUGERIDO,
    cargar_usuarios_panel, confirmar_correo_responsable, es_cargo_jefatura,
    jefaturas_por_departamento, normalizar_nombre, reparar_texto, resolver_correo,
    resolver_responsables,
)


def _u(id, alias, correo, cargo='', activo=True):
    return {'id': id, 'alias': alias, 'clave': normalizar_nombre(alias), 'correo': correo,
            'cargo': cargo, 'activo': activo}


class NormalizacionTest(TestCase):
    def test_repara_mojibake_cp437_del_panel(self):
        self.assertEqual(reparar_texto('NU├æEZ'), 'NUÑEZ')
        self.assertEqual(reparar_texto('ALARC├ôN'), 'ALARCÓN')

    def test_repara_mojibake_latin1(self):
        self.assertEqual(reparar_texto('MuÃ±oz'), 'Muñoz')

    def test_texto_sano_no_cambia(self):
        self.assertEqual(reparar_texto('Muñoz'), 'Muñoz')
        self.assertEqual(reparar_texto(None), '')

    def test_normaliza_tildes_mayusculas_y_espacios(self):
        self.assertEqual(normalizar_nombre('  MARÍA   Núñez '), 'maria nunez')

    def test_alias_del_panel_y_nombre_del_pac_coinciden_tras_normalizar(self):
        self.assertEqual(normalizar_nombre('NU├æEZ'), normalizar_nombre('Núñez'))

    def test_caracter_irrecuperable_queda_como_comodin(self):
        self.assertEqual(normalizar_nombre('Ana Mar�a Diaz'), 'ana mar?a diaz')


class ResolverCorreoTest(TestCase):
    def setUp(self):
        self.usuarios = [
            _u(1, 'ANA MARIA DIAZ', 'ana@x.cl'),
            _u(2, 'BRUNO OJEDA', 'bruno@x.cl'),
            _u(3, 'CARLOS LOPEZ MONJE', 'clopez1@x.cl'),
            _u(4, 'CARLOS LOPEZ GUTIERREZ', 'clopez2@x.cl'),
            _u(5, 'VIVIANA SANCHEZ', 'viv1@x.cl'),
            _u(6, 'VIVIANA SANCHEZ', 'viv2@x.cl'),
            _u(7, 'PEDRO BAJA', 'pedro@x.cl', activo=False),
            _u(8, 'LUCIA REPE', 'lucia@x.cl'),
            _u(9, 'LUCIA REPE', 'lucia@x.cl'),   # mismo correo duplicado: no es ambigüedad
        ]

    def _r(self, nombre, **kw):
        return resolver_correo(nombre, self.usuarios, kw.pop('confirmados', {}), **kw)

    def test_exacto_unico(self):
        r = self._r('Ana María Diaz')
        self.assertEqual((r['estado'], r['correo']), (ESTADO_EXACTO, 'ana@x.cl'))

    def test_exacto_con_caracter_perdido(self):
        # "Mar�a" (la í se perdió en la base del PAC) debe calzar con "MARIA".
        r = self._r('Ana Mar�a Diaz')
        self.assertEqual((r['estado'], r['correo']), (ESTADO_EXACTO, 'ana@x.cl'))

    def test_mismo_correo_repetido_no_es_ambiguo(self):
        self.assertEqual(self._r('Lucia Repe')['estado'], ESTADO_EXACTO)

    def test_apellido_de_mas_se_sugiere_y_no_se_usa_solo(self):
        r = self._r('Bruno Ojeda Alvarez')
        self.assertEqual(r['estado'], ESTADO_SUGERIDO)
        self.assertEqual(r['correo'], '')           # nunca se envía a una sugerencia sin confirmar
        self.assertEqual(r['candidatos'][0]['correo'], 'bruno@x.cl')

    def test_dos_candidatos_parecidos_se_ofrecen_ambos(self):
        r = self._r('Carlos López')
        self.assertEqual(r['estado'], ESTADO_SUGERIDO)
        self.assertEqual({c['correo'] for c in r['candidatos']}, {'clopez1@x.cl', 'clopez2@x.cl'})

    def test_homonimos_son_ambiguos(self):
        r = self._r('Viviana Sanchez')
        self.assertEqual(r['estado'], ESTADO_AMBIGUO)
        self.assertEqual(r['correo'], '')

    def test_homonimos_se_desempatan_por_departamento(self):
        r = self._r('Viviana Sanchez', depto_ids={10}, deptos_usuario={5: {99}, 6: {10}})
        self.assertEqual((r['estado'], r['correo']), (ESTADO_EXACTO, 'viv2@x.cl'))

    def test_homonimos_en_el_mismo_departamento_siguen_ambiguos(self):
        r = self._r('Viviana Sanchez', depto_ids={10}, deptos_usuario={5: {10}, 6: {10}})
        self.assertEqual(r['estado'], ESTADO_AMBIGUO)

    def test_usuario_inactivo_nunca_es_exacto(self):
        r = self._r('Pedro Baja')
        self.assertNotEqual(r['estado'], ESTADO_EXACTO)
        self.assertEqual(r['correo'], '')

    def test_sin_parecido_no_hay_candidatos(self):
        r = self._r('Eleuterio Roman')
        self.assertEqual((r['estado'], r['candidatos']), (ESTADO_SIN_CORREO, []))

    def test_un_solo_apellido_en_comun_no_basta(self):
        self.assertEqual(self._r('Zoe Ojeda')['estado'], ESTADO_SIN_CORREO)

    def test_confirmado_manda_sobre_todo(self):
        r = self._r('Viviana Sanchez', confirmados={'viviana sanchez': 'elegida@x.cl'})
        self.assertEqual((r['estado'], r['correo']), (ESTADO_CONFIRMADO, 'elegida@x.cl'))

    def test_nombre_vacio(self):
        self.assertEqual(self._r('')['estado'], ESTADO_SIN_CORREO)
        self.assertEqual(self._r(None)['estado'], ESTADO_SIN_CORREO)


class ConfirmarCorreoTest(TestCase):
    def test_guarda_y_luego_resuelve_como_confirmado(self):
        confirmar_correo_responsable('Bruno Ojeda Alvarez', ' Bruno@X.cl ', None)
        self.assertEqual(PacResponsableCorreo.objects.get().correo, 'bruno@x.cl')
        r = resolver_responsables({'Bruno Ojeda Alvarez': set()})['Bruno Ojeda Alvarez']
        self.assertEqual((r['estado'], r['correo']), (ESTADO_CONFIRMADO, 'bruno@x.cl'))

    def test_confirmar_de_nuevo_corrige_sin_duplicar(self):
        confirmar_correo_responsable('Bruno Ojeda', 'a@x.cl', None)
        confirmar_correo_responsable('BRUNO  OJEDA', 'b@x.cl', None)
        self.assertEqual(PacResponsableCorreo.objects.count(), 1)
        self.assertEqual(PacResponsableCorreo.objects.get().correo, 'b@x.cl')

    def test_correo_invalido_se_rechaza(self):
        for malo in ('', 'sin-arroba', 'a@b', None):
            with self.assertRaises(ValueError):
                confirmar_correo_responsable('Alguien', malo, None)
        self.assertFalse(PacResponsableCorreo.objects.exists())

    def test_nombre_vacio_se_rechaza(self):
        with self.assertRaises(ValueError):
            confirmar_correo_responsable('  ', 'a@x.cl', None)


class JefaturasTest(TestCase):
    """Departamento/UsuarioPanel/PertenenciaUsuario son managed=False: el runner de pruebas
    crea sus tablas (core/test_runner.py)."""

    def setUp(self):
        cache.clear()
        # Raíz (es_depto=SI) con un sub-departamento colgando; y otro departamento aparte.
        self.raiz = Departamento.objects.create(descripcion='DPTO RAIZ', es_depto='SI', parent_id=None,
                                                subdireccion_id=2, establecimiento_id=1)
        self.sub = Departamento.objects.create(descripcion='SUB DPTO', es_depto='NO', parent_id=self.raiz.id,
                                               subdireccion_id=2, establecimiento_id=1)
        self.otro = Departamento.objects.create(descripcion='OTRO DPTO', es_depto='SI', parent_id=None,
                                                subdireccion_id=3, establecimiento_id=1)

        def usuario(alias, correo, cargo, activo='S'):
            return UsuarioPanel.objects.create(usuario=alias, correo_electronico=correo, alias=alias,
                                               cargo=cargo, activo=activo, establecimiento_id=1)

        self.jefa = usuario('JEFA UNO', 'jefa@x.cl', 'Jefa Departamento')
        self.director = usuario('DIRECTOR UNO', 'dir@x.cl', 'Director')
        self.funcionario = usuario('FUNC UNO', 'func@x.cl', 'Encargada De Compras')
        self.jefe_baja = usuario('JEFE BAJA', 'baja@x.cl', 'Jefe', activo='N')
        self.jefe_otro = usuario('JEFE OTRO', 'otro@x.cl', 'Jefe')
        for u, d in ((self.jefa, self.raiz), (self.director, self.sub), (self.funcionario, self.raiz),
                     (self.jefe_baja, self.raiz), (self.jefe_otro, self.otro)):
            PertenenciaUsuario.objects.create(id_usuario=u.id, tipo_dependencia='DEP',
                                              id_dependencia=d.id, id_subdireccion=2)

    def test_cargos_de_jefatura(self):
        for c in ('Jefa Departamento', 'JEFE (S) SUB. DPTO', 'Director', 'Directora Cosam',
                  'Subdirectora de Gestión'):
            self.assertTrue(es_cargo_jefatura(c), c)
        for c in ('Encargada De Compras', 'Coordinadora', 'Profesional', '', None):
            self.assertFalse(es_cargo_jefatura(c), c)

    def test_un_subdepartamento_hereda_la_jefatura_de_su_raiz(self):
        r = jefaturas_por_departamento({self.sub.id})
        self.assertEqual({j['correo'] for j in r[self.sub.id]}, {'jefa@x.cl', 'dir@x.cl'})

    def test_la_raiz_no_incluye_jefaturas_de_sus_hijos(self):
        r = jefaturas_por_departamento({self.raiz.id})
        self.assertEqual({j['correo'] for j in r[self.raiz.id]}, {'jefa@x.cl'})

    def test_no_incluye_funcionarios_ni_inactivos_ni_otro_departamento(self):
        correos = {j['correo'] for j in jefaturas_por_departamento({self.raiz.id})[self.raiz.id]}
        self.assertNotIn('func@x.cl', correos)
        self.assertNotIn('baja@x.cl', correos)
        self.assertNotIn('otro@x.cl', correos)

    def test_departamento_sin_jefatura_devuelve_lista_vacia(self):
        sin = Departamento.objects.create(descripcion='SIN JEFE', es_depto='SI', establecimiento_id=1)
        self.assertEqual(jefaturas_por_departamento({sin.id}), {sin.id: []})

    def test_sin_departamentos(self):
        self.assertEqual(jefaturas_por_departamento(set()), {})
        self.assertEqual(jefaturas_por_departamento({None}), {})

    def test_cargar_usuarios_ignora_sin_correo(self):
        UsuarioPanel.objects.create(usuario='X', correo_electronico='', alias='SIN CORREO',
                                    activo='S', establecimiento_id=1)
        self.assertNotIn('sin correo', {u['clave'] for u in cargar_usuarios_panel()})
