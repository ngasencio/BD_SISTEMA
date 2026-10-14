"""Descarga de reportes del Panel (Selenium) — con un navegador simulado, sin tocar el Panel.

`descargar_reportes_panel` es compartido por Formularios FSC y Formularios PAC; estas pruebas
fijan que PAC use sus botones/carpeta y que el comportamiento por defecto (FSC) no cambió.
"""
import sys
import tempfile
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase

RAIZ_API = Path(__file__).resolve().parents[3] / 'api' / 'data'
for sub in ('data_panel', 'data_formularios_pac'):
    ruta = str(RAIZ_API / sub)
    if ruta not in sys.path:
        sys.path.insert(0, ruta)

import page_data_panel as panel  # noqa: E402
import page_data_panel_pac as pac  # noqa: E402


class _Elemento:
    def __init__(self, driver, valor):
        self.driver, self.valor = driver, valor

    def send_keys(self, _):
        pass

    def is_displayed(self):
        return True

    def is_enabled(self):
        return True

    def click(self):
        self.driver.clicks.append(self.valor)
        # Simula a Chrome dejando el archivo descargado en su carpeta de descargas.
        if self.valor in self.driver.reportes:
            (self.driver.directorio / f'{self.valor}_14102026-151007.xls').write_text('<table></table>')


class _NavegadorFalso:
    def __init__(self, directorio, reportes):
        self.directorio, self.reportes = Path(directorio), reportes
        self.clicks, self.cerrado, self.current_url = [], False, 'https://panel.test'
        self.page_source = ''

    def get(self, _):
        pass

    def find_element(self, _by, valor):
        return _Elemento(self, valor)

    def find_elements(self, _by, valor):
        return []  # el formulario de login ya no está → login exitoso

    def save_screenshot(self, _):
        pass

    def quit(self):
        self.cerrado = True


class _EsperaFalsa:
    def __init__(self, driver, _timeout):
        self.driver = driver

    def until(self, condicion):
        return condicion(self.driver)


class DescargaCompartidaTest(SimpleTestCase):
    def _ejecutar(self, reportes, **kw):
        self.navegador = None

        def crear(directorio=None):
            self.navegador = _NavegadorFalso(directorio or panel.DOWNLOAD_DIR, reportes)
            return self.navegador

        original = panel._esperar_descarga

        def espera_corta(directorio, antes, timeout=60):  # el timeout real (90 s) haría lenta la prueba
            return original(directorio, antes, timeout=0.3)

        with mock.patch.object(panel, '_crear_driver', side_effect=crear), \
                mock.patch.object(panel, 'WebDriverWait', _EsperaFalsa), \
                mock.patch.object(panel, '_esperar_descarga', espera_corta), \
                mock.patch.object(panel.time, 'sleep'):
            return panel.descargar_reportes_panel('11111111', '1', 'clave', **kw)

    def test_pac_usa_sus_botones_y_su_carpeta(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = self._ejecutar({'totalpac', 'totalcarropac'}, botones=pac._BOTONES_REPORTES_PAC, directorio=tmp)
            self.assertEqual(set(r), {'cabecera', 'carro'})
            self.assertEqual(r['cabecera'].name, 'total_pac_anho.xls')
            self.assertEqual(r['carro'].name, 'total_carro_pac.xls')
            self.assertTrue(all(Path(p).parent == Path(tmp) for p in r.values()))
            self.assertIn('totalpac', self.navegador.clicks)
            self.assertIn('totalcarropac', self.navegador.clicks)
            self.assertNotIn('totalfscy', self.navegador.clicks)
            self.assertTrue(self.navegador.cerrado)

    def test_por_defecto_sigue_descargando_los_tres_reportes_fsc(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(panel, 'DOWNLOAD_DIR', Path(tmp)):
            r = self._ejecutar({'totalfscy', 'totalfscdy', 'totalcarrofsc'})
            self.assertEqual(set(r), {'fsc', 'derivados', 'carro'})
            self.assertEqual(r['fsc'].name, 'total_fsc_anho.xls')
            self.assertEqual(r['derivados'].name, 'total_fsc_anho_derivadas.xls')
            self.assertEqual(r['carro'].name, 'total_carro_fsc.xls')

    def test_un_boton_que_no_descarga_no_tumba_al_otro(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = self._ejecutar({'totalpac'}, botones=pac._BOTONES_REPORTES_PAC, directorio=tmp)
            self.assertEqual(set(r), {'cabecera'})


class ArchivosLocalesTest(SimpleTestCase):
    def test_busca_por_prefijo_exacto_y_toma_el_mas_reciente(self):
        import os
        import time
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            viejo = tmp / 'total_pac_anho_01012026-000000.xls'
            nuevo = tmp / 'total_pac_anho.xls'
            carro = tmp / 'total_carro_pac_14102026-151025.xls'
            ajeno = tmp / 'total_carro_pac_resumen_otro.txt'
            for f in (viejo, nuevo, carro, ajeno):
                f.write_text('x')
            os.utime(viejo, (time.time() - 1000, time.time() - 1000))
            with mock.patch.object(pac, 'DOWNLOAD_DIR', tmp):
                r = pac._archivos_locales_mas_recientes()
            self.assertEqual(r['cabecera'], nuevo)
            self.assertEqual(r['carro'], carro)
