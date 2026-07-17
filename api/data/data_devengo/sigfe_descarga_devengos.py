"""
sigfe_descarga_devengos.py
---------------------------------
Automatiza el login y la descarga del reporte "Disponibilidad de Devengos
Presupuestarios" desde SIGFE Reports (www.sigfe.gob.cl / asin.sigfe.gob.cl),
por establecimiento (cobertura) del Servicio de Salud Osorno.

REQUISITOS PREVIOS:
  pip install selenium

CREDENCIALES:
  El script las pide de forma interactiva (usuario visible, contraseña
  oculta con getpass). Si defines SIGFE_USER / SIGFE_PASS como variables
  de entorno, las usa como atajo sin preguntar (útil para automatización
  desatendida más adelante).

DEBUG SIN INSPECCIÓN MANUAL:
  Como no puedes abrir DevTools tú mismo, el script guarda automáticamente
  el HTML del árbol de cobertura (y de cualquier paso que falle) en la
  carpeta debug_html/. Si algo se rompe, pégame el contenido del archivo
  .html más reciente de esa carpeta y ajusto los selectores desde ahí.

ESTADO DE CONFIANZA POR SECCIÓN:
  [Seguro]     login, selección de "Gasto", click en Buscar/Aceptar simples
               -> confirmados por ti en producción.
  [Probable]   fechas vía JS (arregla el bug de "Hasta"), export de menú
               contextual "Ampliar Todo Debajo".
  [Adivinando] selector del botón de exportación XLSX dentro del iframe
               Jasper (nadie lo ha confirmado todavía con HTML real).
"""

import os
import sys
import time
import getpass
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementClickInterceptedException,
)

# --------------------------------------------------------------------------
# CONFIGURACIÓN Y LOGGING
# --------------------------------------------------------------------------

LOGIN_URL = "http://www.sigfe.gob.cl/sigfeReports/"
DOWNLOAD_DIR = os.path.join(os.getcwd(), "descargas_sigfe")
DEBUG_DIR = os.path.join(os.getcwd(), "debug_html")
TIMEOUT = 25

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("sigfe")


@dataclass
class ConfigReporte:
    """Parámetros de una corrida. Pensado para poder extenderse a otros
    reportes de SIGFE más adelante (no solo Disponibilidad de Devengos)."""
    nombre_reporte: str = "Disponibilidad de Devengos Presupuestarios"
    fecha_desde: str = ""   # formato DD/MM/AA, ej: 01/01/26
    fecha_hasta: str = ""
    establecimientos: List[str] = field(default_factory=list)  # texto exacto del árbol
    # URL directa de exportación. No lleva token de sesión - el servidor
    # de Jasper asocia el reporte activo a tu sesión vía cookie, así que
    # esta URL sirve para cualquier búsqueda que hayas hecho en esta misma
    # sesión de navegador, no solo para la primera.
    url_export_xlsx: str = "https://asin.sigfe.gob.cl/jasperserver-pro/flow.html/flowFile/SA_DisponibilidadDevengoPresupuestario.xlsx"


# --------------------------------------------------------------------------
# UTILIDADES GENERALES
# --------------------------------------------------------------------------

def pedir_credenciales():
    user = os.environ.get("SIGFE_USER")
    pw = os.environ.get("SIGFE_PASS")
    if user and pw:
        log.info("Usando credenciales desde variables de entorno.")
        return user, pw
    if not user:
        user = input("Usuario SIGFE: ").strip()
    if not pw:
        pw = getpass.getpass("Contraseña SIGFE (no se mostrará en pantalla): ")
    if not user or not pw:
        log.error("Usuario o contraseña vacíos. Abortando.")
        sys.exit(1)
    return user, pw


def pedir_rango_fechas() -> (str, str):
    """
    Pide el rango de fechas por consola, en el mismo formato que usa
    SIGFE (DD/MM/AA, ej: 01/01/26). Valida formato básico antes de aceptar.
    """
    import re
    patron = re.compile(r"^\d{2}/\d{2}/\d{2}$")

    print("\n--- Reporte: Disponibilidad de Devengos Presupuestarios ---")
    while True:
        desde = input("Fecha DESDE (formato DD/MM/AA, ej: 01/01/26): ").strip()
        if patron.match(desde):
            break
        print("Formato inválido. Usa DD/MM/AA, ej: 01/01/26")

    while True:
        hasta = input("Fecha HASTA (formato DD/MM/AA, ej: 30/06/26): ").strip()
        if patron.match(hasta):
            break
        print("Formato inválido. Usa DD/MM/AA, ej: 30/06/26")

    return desde, hasta


def guardar_html_debug(driver, nombre: str, contenido: Optional[str] = None):
    """
    Guarda HTML en debug_html/ con timestamp, para que puedas pegármelo
    en el chat sin necesitar DevTools. Si no se pasa 'contenido', guarda
    el page_source completo actual.
    """
    os.makedirs(DEBUG_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(DEBUG_DIR, f"{nombre}_{timestamp}.html")
    try:
        html = contenido if contenido is not None else driver.page_source
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        log.info(f"HTML de debug guardado: {path}")
    except Exception as e:
        log.warning(f"No se pudo guardar HTML de debug: {e}")
    return path


def esperar_archivo_nuevo(carpeta: str, extension: str = ".xlsx",
                           archivos_previos: Optional[set] = None,
                           timeout: int = 60, intervalo: float = 1.5):
    """
    Espera hasta que aparezca un archivo nuevo con la extensión dada en
    'carpeta', comparando contra el listado previo a la descarga. Devuelve
    la ruta del archivo nuevo, o None si se agota el timeout. También
    ignora archivos temporales de descarga en progreso (.crdownload, .tmp).
    """
    if archivos_previos is None:
        archivos_previos = set()

    inicio = time.time()
    while time.time() - inicio < timeout:
        actuales = set(os.listdir(carpeta)) if os.path.isdir(carpeta) else set()
        nuevos = actuales - archivos_previos
        completos = [
            f for f in nuevos
            if f.lower().endswith(extension) and not f.lower().endswith((".crdownload", ".tmp"))
        ]
        if completos:
            return os.path.join(carpeta, completos[0])
        time.sleep(intervalo)
    return None


def set_input_value_js(driver, element_id: str, value: str):
    """
    Setea el valor de un input directamente vía JavaScript y dispara los
    eventos que ADF/JSF necesita para registrar el cambio (input, change,
    blur). Evita el problema de datepickers/overlays tapando el campo,
    que es lo que probablemente rompió el campo 'Hasta' con send_keys.
    """
    script = """
    var el = document.getElementById(arguments[0]);
    if (!el) { return false; }
    el.value = arguments[1];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
    """
    ok = driver.execute_script(script, element_id, value)
    if not ok:
        raise NoSuchElementException(f"No se encontró el input con id={element_id}")
    return ok


def click_seguro(driver, by, selector, timeout=TIMEOUT, descripcion=""):
    """Espera a que un elemento sea clickeable y hace click, con reintento
    vía JavaScript si el click normal es interceptado."""
    try:
        el = WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((by, selector))
        )
        el.click()
    except ElementClickInterceptedException:
        log.warning(f"Click interceptado en '{descripcion}', reintentando con JS.")
        el = driver.find_element(by, selector)
        driver.execute_script("arguments[0].click();", el)
    except TimeoutException:
        log.error(f"Timeout esperando elemento clickeable: {descripcion} ({selector})")
        raise
    return el


def crear_driver():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    options = webdriver.ChromeOptions()
    # No actives headless hasta que todo el flujo esté 100% validado -
    # necesitas ver la pantalla para detectar dónde se traba.
    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "safebrowsing.enabled": True,
    }
    options.add_experimental_option("prefs", prefs)
    options.add_argument("--start-maximized")
    return webdriver.Chrome(options=options)


# --------------------------------------------------------------------------
# CLASE PRINCIPAL DEL SCRAPER
# --------------------------------------------------------------------------

class SigfeDevengosScraper:
    """
    Automatiza la descarga del reporte 'Disponibilidad de Devengos
    Presupuestarios' de SIGFE Reports, uno o varios establecimientos
    a la vez.

    Flujo:
      1. login()
      2. navegar_a_reporte()
      3. configurar_fechas()
      4. abrir_selector_cobertura()
      5. seleccionar_establecimientos([...])
      6. buscar_reporte()
      7. descargar_xlsx()
    """

    def __init__(self, driver, config: ConfigReporte):
        self.driver = driver
        self.config = config

    # -- Autenticación -----------------------------------------------------

    def login(self, user: str, password: str):
        log.info("Cargando página de login...")
        self.driver.get(LOGIN_URL)

        campo_user = WebDriverWait(self.driver, TIMEOUT).until(
            EC.presence_of_element_located((By.ID, "j_username::content"))
        )
        campo_user.clear()
        campo_user.send_keys(user)

        campo_pass = self.driver.find_element(By.ID, "j_password::content")
        campo_pass.clear()
        campo_pass.send_keys(password)

        click_seguro(self.driver, By.ID, "idCBIngresar", descripcion="Botón Ingresar")
        log.info("Login enviado. Esperando carga de página principal...")
        time.sleep(3)

    # -- Navegación de menú --------------------------------------------------

    def navegar_a_reporte(self):
        log.info("Abriendo menú Reportabilidad...")
        menu_reportabilidad = WebDriverWait(self.driver, TIMEOUT).until(
            EC.presence_of_element_located(
                (By.XPATH, "//a[contains(@class,'af_menu_bar-item-text') and text()='Reportabilidad']")
            )
        )
        ActionChains(self.driver).move_to_element(menu_reportabilidad).click().perform()
        time.sleep(1)

        log.info("Seleccionando submenú 'Descarga de Información Transaccional'...")
        submenu = WebDriverWait(self.driver, TIMEOUT).until(
            EC.presence_of_element_located(
                (By.XPATH, "//td[contains(@class,'af_menu_submenu-text') and contains(text(),'Descarga de Informaci')]")
            )
        )
        ActionChains(self.driver).move_to_element(submenu).click().perform()
        time.sleep(1)

        log.info("Seleccionando 'Disponibilidad de Devengos Presupuestarios'...")
        item = WebDriverWait(self.driver, TIMEOUT).until(
            EC.element_to_be_clickable(
                (By.XPATH, "//td[contains(@class,'af_commandMenuItem_menu-item-text') and contains(text(),'Disponibilidad de Devengos')]")
            )
        )
        item.click()
        time.sleep(2)

        log.info("Seleccionando tipo 'Gasto'...")
        select_tipo = WebDriverWait(self.driver, TIMEOUT).until(
            EC.presence_of_element_located((By.ID, "idPgTpl:idSeonchTipoPresup::content"))
        )
        Select(select_tipo).select_by_visible_text("Gasto")
        time.sleep(1)

    # -- Fechas ---------------------------------------------------------------

    def configurar_fechas(self):
        """
        Setea Desde/Hasta vía JavaScript directo (ver set_input_value_js),
        que es más confiable que send_keys frente a datepickers de ADF.
        """
        log.info(f"Configurando fechas: Desde={self.config.fecha_desde} / Hasta={self.config.fecha_hasta}")

        set_input_value_js(self.driver, "idPgTpl:idIndaDesdeCreacion::content", self.config.fecha_desde)
        time.sleep(0.5)
        set_input_value_js(self.driver, "idPgTpl:idIndaHasta::content", self.config.fecha_hasta)
        time.sleep(0.5)

        # Cierra cualquier date-picker/overlay que haya quedado abierto
        self.driver.find_element(By.TAG_NAME, "body").click()
        time.sleep(1)

    # -- Selector de cobertura (popup con árbol) ------------------------------

    def abrir_selector_cobertura(self):
        log.info("Abriendo selector de cobertura...")
        click_seguro(
            self.driver, By.ID, "idPgTpl:commandLink1xy",
            descripcion="Link Buscar (abre popup cobertura)"
        )
        time.sleep(2)

        # Esperamos a que el árbol exista antes de intentar expandirlo
        try:
            WebDriverWait(self.driver, TIMEOUT).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.af_tree"))
            )
        except TimeoutException:
            guardar_html_debug(self.driver, "error_popup_cobertura_no_aparecio")
            raise

        # Guarda el HTML del popup ni bien aparece, para debug futuro
        try:
            arbol = self.driver.find_element(By.CSS_SELECTOR, "div.af_tree")
            guardar_html_debug(self.driver, "arbol_cobertura_inicial", arbol.get_attribute("outerHTML"))
        except NoSuchElementException:
            pass

    def expandir_todo_el_arbol(self):
        """
        [Probable] Click derecho sobre el nodo raíz del árbol para abrir
        el menú contextual, luego click en 'Ampliar Todo Debajo'.
        Si esto falla, revisa el archivo debug_html/arbol_cobertura_inicial_*.html
        y pégamelo - ahí debería verse el menú contextual real.
        """
        log.info("Expandiendo árbol de cobertura ('Ampliar Todo Debajo')...")
        try:
            nodo_raiz = WebDriverWait(self.driver, TIMEOUT).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.af_tree .af_tree_data-row"))
            )
            ActionChains(self.driver).context_click(nodo_raiz).perform()
            time.sleep(1)

            opcion_ampliar = WebDriverWait(self.driver, TIMEOUT).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//td[contains(@class,'af_commandMenuItem_menu-item-text') and contains(text(),'Ampliar Todo Debajo')]")
                )
            )
            opcion_ampliar.click()
            time.sleep(2)
            log.info("Árbol expandido.")
        except (TimeoutException, NoSuchElementException) as e:
            guardar_html_debug(self.driver, "error_expandir_arbol")
            log.error(
                "No se pudo expandir el árbol automáticamente. Revisa "
                "debug_html/error_expandir_arbol_*.html y pégamelo para ajustar "
                f"el selector. Detalle: {e}"
            )
            raise

    def seleccionar_establecimientos(self, nombres: List[str]):
        """
        Selecciona checkboxes por el TEXTO del establecimiento (no por
        índice), porque los índices (":3:sbc4", ":4:sbc4", etc.) pueden
        cambiar entre sesiones según cómo se renderice el árbol. Ejemplo
        de texto esperado: "1638001 Direccion del Servicio".
        """
        for nombre in nombres:
            log.info(f"Seleccionando establecimiento: {nombre}")
            try:
                label = WebDriverWait(self.driver, TIMEOUT).until(
                    EC.presence_of_element_located(
                        (By.XPATH, f"//label[contains(@class,'af_selectBooleanCheckbox_item-text') and contains(text(),'{nombre}')]")
                    )
                )
                checkbox_id = label.get_attribute("for")
                checkbox = self.driver.find_element(By.ID, checkbox_id)

                if not checkbox.is_selected():
                    self.driver.execute_script("arguments[0].click();", checkbox)
                    log.info(f"  -> checkbox marcado: {checkbox_id}")
                else:
                    log.info(f"  -> ya estaba marcado: {checkbox_id}")
            except (TimeoutException, NoSuchElementException):
                guardar_html_debug(self.driver, f"error_no_encontrado_{nombre.replace(' ', '_')}")
                log.error(
                    f"No se encontró el establecimiento '{nombre}' en el árbol. "
                    f"Revisa el HTML de debug guardado y pégamelo."
                )
                raise

    def aceptar_seleccion_cobertura(self):
        log.info("Click en 'Aceptar' del selector de cobertura...")
        click_seguro(
            self.driver, By.ID, "svwPopupCobertura:siCBBuscar:idCmbIrBuscar2",
            descripcion="Botón Aceptar (popup cobertura)"
        )
        time.sleep(2)

    # -- Búsqueda y descarga ----------------------------------------------

    def buscar_reporte(self):
        log.info("Click en 'Buscar' final para generar el reporte...")
        click_seguro(
            self.driver, By.ID, "idPgTpl:siCBBuscarPr:commandButton1",
            descripcion="Botón Buscar (final)"
        )
        log.info("Esperando que cargue el iframe con el reporte Jasper...")
        WebDriverWait(self.driver, TIMEOUT * 2).until(
            EC.presence_of_element_located((By.ID, "idPgTpl:if1"))
        )
        # El reporte Jasper dentro del iframe puede tardar bastante en
        # terminar de renderizar (depende del volumen de datos). Damos un
        # margen inicial generoso antes de siquiera intentar buscar el
        # botón de exportación - el reintento fino ocurre en descargar_xlsx().
        log.info("Esperando a que el reporte termine de cargar dentro del iframe (margen inicial)...")
        time.sleep(10)

    def descargar_xlsx_directo(self, timeout_espera: int = 60) -> Optional[str]:
        """
        Descarga vía navegación directa a la URL de export conocida
        (config.url_export_xlsx), en una pestaña nueva del MISMO navegador
        - así reutiliza las cookies de sesión de asin.sigfe.gob.cl que ya
        se establecieron al cargar el iframe del reporte. No requiere
        encontrar ningún botón.
        """
        log.info(f"Intentando descarga directa: {self.config.url_export_xlsx}")

        archivos_previos = set(os.listdir(DOWNLOAD_DIR)) if os.path.isdir(DOWNLOAD_DIR) else set()
        handle_original = self.driver.current_window_handle

        self.driver.switch_to.new_window('tab')
        try:
            self.driver.get(self.config.url_export_xlsx)
        except Exception as e:
            log.warning(f"Error al navegar a la URL de export directa: {e}")

        archivo = esperar_archivo_nuevo(
            DOWNLOAD_DIR, extension=".xlsx",
            archivos_previos=archivos_previos, timeout=timeout_espera
        )

        # Cierra la pestaña nueva y vuelve a la original
        try:
            self.driver.close()
        except Exception:
            pass
        self.driver.switch_to.window(handle_original)

        if archivo:
            log.info(f"Descarga confirmada: {archivo}")
        else:
            log.warning(
                f"No apareció un .xlsx nuevo en {DOWNLOAD_DIR} tras {timeout_espera}s "
                "usando la URL directa."
            )
        return archivo

    def descargar_xlsx(self, nombre_archivo_sugerido: str = "reporte",
                        intentos_max: int = 6, espera_entre_intentos: int = 10):
        """
        Método principal: click en el botón real 'Exportar' -> 'Como XLSX'
        (selectores confirmados en producción). Si por algún motivo no
        se encuentra (ADF tardó en renderizar, cambió el DOM, etc.), cae
        a la descarga directa por URL como respaldo.
        """
        archivo = self._descargar_xlsx_via_boton(nombre_archivo_sugerido, intentos_max, espera_entre_intentos)
        if archivo:
            return True

        log.info("El botón de exportación no funcionó. Probando plan B: URL directa...")
        archivo = self.descargar_xlsx_directo()
        return bool(archivo)

    def _descargar_xlsx_via_boton(self, nombre_archivo_sugerido: str = "reporte",
                        intentos_max: int = 6, espera_entre_intentos: int = 10):
        """
        [Seguro] Selectores confirmados: botón con id="export" que abre un
        menú, y dentro del menú un <li> cuyo texto es "Como XLSX".
        Reintenta por si el reporte todavía no ha terminado de renderizar
        cuando se hace el primer intento.
        """
        self.driver.switch_to.default_content()
        iframe = self.driver.find_element(By.ID, "idPgTpl:if1")
        self.driver.switch_to.frame(iframe)

        posibles_selectores_export = [
            (By.ID, "export"),
            (By.CSS_SELECTOR, "button[aria-label='Exportar']"),
            (By.CSS_SELECTOR, "button[title='Exportar']"),
        ]

        boton_export = None
        archivo_descargado = None
        for intento in range(1, intentos_max + 1):
            log.info(f"Buscando botón 'Exportar' (intento {intento}/{intentos_max})...")
            for by, sel in posibles_selectores_export:
                try:
                    boton_export = WebDriverWait(self.driver, 5).until(
                        EC.element_to_be_clickable((by, sel))
                    )
                    log.info(f"Botón 'Exportar' encontrado con selector: {sel}")
                    break
                except TimeoutException:
                    continue
            if boton_export is not None:
                break
            log.info(
                f"Todavía no aparece el botón 'Exportar'. "
                f"Reintentando en {espera_entre_intentos}s (probablemente el "
                f"reporte sigue cargando datos)..."
            )
            self.driver.switch_to.default_content()
            time.sleep(espera_entre_intentos)
            try:
                iframe = self.driver.find_element(By.ID, "idPgTpl:if1")
                self.driver.switch_to.frame(iframe)
            except NoSuchElementException:
                log.warning("El iframe del reporte ya no está presente en esta iteración.")
                continue

        if boton_export is None:
            try:
                html_iframe = self.driver.execute_script("return document.body.innerHTML;")
            except Exception:
                html_iframe = None
            guardar_html_debug(self.driver, "error_boton_export_no_encontrado", html_iframe)
            log.error(
                f"No se pudo ubicar el botón 'Exportar' tras {intentos_max} intentos. "
                "Revisa debug_html/error_boton_export_no_encontrado_*.html."
            )
            self.driver.switch_to.default_content()
            return None

        archivos_previos = set(os.listdir(DOWNLOAD_DIR)) if os.path.isdir(DOWNLOAD_DIR) else set()

        boton_export.click()
        time.sleep(1)

        try:
            opcion_xlsx = WebDriverWait(self.driver, 8).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//li[.//p[contains(text(),'Como XLSX')]] | //p[contains(@class,'wrap') and contains(text(),'Como XLSX')]")
                )
            )
            opcion_xlsx.click()
            log.info(f"Click en 'Como XLSX' realizado ({nombre_archivo_sugerido}).")
        except TimeoutException:
            log.warning("Se encontró el botón 'Exportar' pero no la opción 'Como XLSX' en el menú.")
            try:
                html_menu = self.driver.execute_script("return document.body.innerHTML;")
            except Exception:
                html_menu = None
            guardar_html_debug(self.driver, "error_opcion_xlsx_no_encontrada", html_menu)
            self.driver.switch_to.default_content()
            return None

        self.driver.switch_to.default_content()

        archivo = esperar_archivo_nuevo(
            DOWNLOAD_DIR, extension=".xlsx",
            archivos_previos=archivos_previos, timeout=30
        )
        if archivo:
            log.info(f"Descarga confirmada: {archivo}")
        else:
            log.warning(f"Se hizo click en 'Como XLSX' pero no se detectó archivo nuevo en {DOWNLOAD_DIR}.")
        return archivo

    # -- Flujo completo -----------------------------------------------------

    def ejecutar(self, user: str, password: str):
        self.login(user, password)
        self.navegar_a_reporte()
        self.configurar_fechas()
        self.abrir_selector_cobertura()
        self.expandir_todo_el_arbol()
        self.seleccionar_establecimientos(self.config.establecimientos)
        self.aceptar_seleccion_cobertura()
        self.buscar_reporte()
        return self.descargar_xlsx()


# --------------------------------------------------------------------------
# PUNTO DE ENTRADA
# --------------------------------------------------------------------------

def main():
    user, password = pedir_credenciales()
    fecha_desde, fecha_hasta = pedir_rango_fechas()

    # Por ahora solo Dirección del Servicio. Cuando esto funcione de punta
    # a punta, agregamos el resto de los establecimientos a esta lista
    # (o hacemos un loop externo, uno por uno, según cómo se comporte
    # SIGFE al repetir la búsqueda).
    config = ConfigReporte(
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        establecimientos=["1638001 Direccion del Servicio"],
    )

    driver = crear_driver()
    scraper = SigfeDevengosScraper(driver, config)

    try:
        exito = scraper.ejecutar(user, password)
        if exito:
            log.info(f"Listo. Revisa la carpeta de descargas: {DOWNLOAD_DIR}")
        else:
            log.error("La descarga no se completó automáticamente. Revisa debug_html/.")
    except Exception as e:
        log.exception(f"Error durante la ejecución: {e}")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        screenshot_path = os.path.join(DEBUG_DIR, f"error_{timestamp}.png")
        os.makedirs(DEBUG_DIR, exist_ok=True)
        try:
            driver.save_screenshot(screenshot_path)
            log.info(f"Screenshot guardado para debug: {screenshot_path}")
        except Exception:
            pass
        guardar_html_debug(driver, "error_general")
        raise
    finally:
        input("Presiona ENTER para cerrar el navegador...")
        driver.quit()


if __name__ == "__main__":
    main()
