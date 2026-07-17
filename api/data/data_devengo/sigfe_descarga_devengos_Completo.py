"""
sigfe_descarga_devengos.py
---------------------------------
Automatiza el login y la descarga del reporte "Disponibilidad de Devengos
Presupuestarios" desde SIGFE Reports (www.sigfe.gob.cl / asin.sigfe.gob.cl),
por establecimiento (cobertura) del Servicio de Salud Osorno.

Al terminar el lote de descargas, invoca automáticamente
consolidar_devengo_anual.py para normalizar los .xlsx nuevos y sincronizarlos
(upsert incremental, sin duplicar) contra la tabla api_sigfe_devengo_anual.
Requiere correrse desde esta misma carpeta (api/data/data_devengo/), porque
ambos scripts resuelven sus rutas relativas al directorio de trabajo actual.

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
import re
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

# Rutas ancladas a la ubicación del archivo, NO al cwd del proceso que lo
# importa. Si esto se dispara desde un hilo de Django (cwd = backend/, no
# api/data/data_devengo/), usar os.getcwd() apuntaría a una carpeta
# completamente distinta y las descargas nunca aparecerían donde
# consolidar_devengo_anual.py las espera.
_RUTA_MODULO = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_RUTA_MODULO, "descargas_sigfe")
DEBUG_DIR = os.path.join(_RUTA_MODULO, "debug_html")
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


def renombrar_archivo(path_original: str, nombre_sugerido: str) -> str:
    """
    Renombra el archivo descargado (que siempre llega con el mismo nombre
    genérico del reporte) para incluir el establecimiento y un timestamp,
    evitando que Chrome empiece a agregar '(1)', '(2)' automáticamente y
    perdamos de vista cuál archivo corresponde a cuál hospital.
    """
    carpeta = os.path.dirname(path_original)
    ext = os.path.splitext(path_original)[1]
    nombre_limpio = re.sub(r"[^A-Za-z0-9_\-]+", "_", nombre_sugerido).strip("_")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    nuevo_nombre = f"{nombre_limpio}_{timestamp}{ext}"
    nuevo_path = os.path.join(carpeta, nuevo_nombre)
    contador = 1
    while os.path.exists(nuevo_path):
        nuevo_nombre = f"{nombre_limpio}_{timestamp}_{contador}{ext}"
        nuevo_path = os.path.join(carpeta, nuevo_nombre)
        contador += 1

    os.rename(path_original, nuevo_path)
    return nuevo_path


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


def crear_driver(headless: bool = False):
    """headless=True es obligatorio para la corrida disparada desde el
    dashboard web (un hilo del backend no tiene pantalla) — ver
    ejecutar_actualizacion_sigfe(). El default sigue en False para no romper
    el uso manual por CLI (main()), donde ver la ventana ayuda a depurar."""
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    options = webdriver.ChromeOptions()
    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "safebrowsing.enabled": True,
    }
    options.add_experimental_option("prefs", prefs)
    if headless:
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1366,900")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
    else:
        options.add_argument("--start-maximized")
    driver = webdriver.Chrome(options=options)
    if headless:
        # Chrome headless no siempre honra 'download.default_directory' vía
        # prefs solamente; forzar el comportamiento de descarga por CDP evita
        # que los .xlsx terminen en blanco o no se descarguen en absoluto.
        try:
            driver.execute_cdp_cmd("Page.setDownloadBehavior", {
                "behavior": "allow",
                "downloadPath": DOWNLOAD_DIR,
            })
        except Exception as e:
            log.warning(f"No se pudo fijar downloadPath vía CDP: {e}")
    return driver


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

    def __init__(self, driver, config: ConfigReporte, progress_callback=None):
        self.driver = driver
        self.config = config
        self._checkboxes_marcados: List[str] = []  # ids de checkbox marcados en la iteración actual
        self.progress_callback = progress_callback

    def _avisar(self, paso=None, paso_desc=None, progreso_pct=None, log_msg=None):
        """Reporta progreso al caller (ej. el hilo del backend Django) sin
        que un problema en el callback interrumpa el scraping en sí."""
        if self.progress_callback:
            try:
                self.progress_callback(paso=paso, paso_desc=paso_desc, progreso_pct=progreso_pct, log=log_msg)
            except Exception:
                pass

    # -- Autenticación -----------------------------------------------------

    def login(self, user: str, password: str):
        log.info("Cargando página de login...")
        self._avisar(paso_desc="Iniciando sesión en SIGFE...", progreso_pct=2, log_msg="Cargando página de login...")
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
        self._avisar(log_msg="Login enviado, esperando carga...")
        time.sleep(3)

    # -- Navegación de menú --------------------------------------------------

    def navegar_a_reporte(self):
        log.info("Abriendo menú Reportabilidad...")
        self._avisar(paso_desc="Accediendo al reporte de Disponibilidad de Devengos...", progreso_pct=5)
        try:
            menu_reportabilidad = WebDriverWait(self.driver, TIMEOUT).until(
                EC.presence_of_element_located(
                    (By.XPATH, "//a[contains(@class,'af_menu_bar-item-text') and text()='Reportabilidad']")
                )
            )
        except TimeoutException:
            guardar_html_debug(self.driver, "error_login_o_menu_no_aparecio")
            raise RuntimeError(
                "No se pudo acceder al menú de Reportabilidad tras iniciar sesión. "
                "Verifica que el usuario y la contraseña de SIGFE sean correctos."
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

        self.seleccionar_tipo_gasto()

    def seleccionar_tipo_gasto(self):
        """Separado en su propio método porque también hay que rehacerlo
        cada vez que volvemos a la búsqueda tras descargar un reporte."""
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

                if checkbox_id not in self._checkboxes_marcados:
                    self._checkboxes_marcados.append(checkbox_id)
            except (TimeoutException, NoSuchElementException):
                guardar_html_debug(self.driver, f"error_no_encontrado_{nombre.replace(' ', '_')}")
                log.error(
                    f"No se encontró el establecimiento '{nombre}' en el árbol. "
                    f"Revisa el HTML de debug guardado y pégamelo."
                )
                raise

    def deseleccionar_previos(self):
        """
        Desmarca los checkboxes que quedaron marcados de la iteración
        anterior del loop, ANTES de marcar el establecimiento nuevo.
        Esto evita depender de un link 'Limpiar' cuyo id no confirmamos,
        y evita terminar con 2+ establecimientos marcados a la vez sin
        darnos cuenta.
        """
        if not self._checkboxes_marcados:
            return
        log.info(f"Desmarcando {len(self._checkboxes_marcados)} checkbox(es) de la iteración anterior...")
        for checkbox_id in self._checkboxes_marcados:
            try:
                checkbox = self.driver.find_element(By.ID, checkbox_id)
                if checkbox.is_selected():
                    self.driver.execute_script("arguments[0].click();", checkbox)
                    log.info(f"  -> desmarcado: {checkbox_id}")
            except NoSuchElementException:
                # El árbol puede haberse regenerado con otros ids tras
                # 'Volver' - no es fatal, seguimos con los demás.
                log.info(f"  -> checkbox '{checkbox_id}' ya no existe en el DOM (árbol regenerado, ok).")
        self._checkboxes_marcados = []

    def aceptar_seleccion_cobertura(self):
        log.info("Click en 'Aceptar' del selector de cobertura...")
        click_seguro(
            self.driver, By.ID, "svwPopupCobertura:siCBBuscar:idCmbIrBuscar2",
            descripcion="Botón Aceptar (popup cobertura)"
        )
        time.sleep(2)

    def volver_a_busqueda(self):
        """
        Click en 'Volver', que regresa a la pantalla de búsqueda (misma
        pantalla donde se configuran Desde/Hasta/Gasto/Cobertura) sin
        tener que renavegar el menú Reportabilidad de nuevo.
        """
        log.info("Click en 'Volver' para reiniciar la búsqueda...")
        click_seguro(
            self.driver, By.ID, "idPgTpl:siCBVolver:idCmbIrBuscar2",
            descripcion="Botón Volver"
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

    def descargar_xlsx_directo(self, nombre_archivo_sugerido: Optional[str] = None,
                                timeout_espera: int = 60) -> Optional[str]:
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
            if nombre_archivo_sugerido:
                archivo = renombrar_archivo(archivo, nombre_archivo_sugerido)
                log.info(f"Renombrado a: {archivo}")
        else:
            log.warning(
                f"No apareció un .xlsx nuevo en {DOWNLOAD_DIR} tras {timeout_espera}s "
                "usando la URL directa."
            )
        return archivo

    def descargar_xlsx(self, nombre_archivo_sugerido: str = "reporte",
                        timeout_total_seg: int = 480, espera_entre_intentos: int = 10,
                        pct_base: float = 0, pct_share: float = 0):
        """
        Método principal: click en el botón real 'Exportar' -> 'Como XLSX'
        (selectores confirmados en producción). Si por algún motivo no
        se encuentra (ADF tardó en renderizar, cambió el DOM, etc.), cae
        a la descarga directa por URL como respaldo. Devuelve la ruta del
        archivo (ya renombrado) o None si ambos métodos fallaron.
        """
        archivo = self._descargar_xlsx_via_boton(
            nombre_archivo_sugerido, timeout_total_seg, espera_entre_intentos,
            pct_base=pct_base, pct_share=pct_share,
        )
        if archivo:
            return archivo

        log.info("El botón de exportación no funcionó. Probando plan B: URL directa...")
        return self.descargar_xlsx_directo(nombre_archivo_sugerido=nombre_archivo_sugerido)

    def _descargar_xlsx_via_boton(self, nombre_archivo_sugerido: str = "reporte",
                        timeout_total_seg: int = 480, espera_entre_intentos: int = 10,
                        pct_base: float = 0, pct_share: float = 0):
        """
        [Seguro] Selectores confirmados: botón con id="export" que abre un
        menú, y dentro del menú un <li> cuyo texto es "Como XLSX".

        Reintenta durante un PRESUPUESTO DE TIEMPO TOTAL (timeout_total_seg)
        en vez de una cantidad fija de intentos: establecimientos grandes
        (ej. Hospital de Osorno, ~1200 páginas del reporte Jasper con solo
        6 meses de datos) pueden tardar bastante más en renderizar que uno
        chico, y ese volumen seguirá creciendo con el tiempo. Con un
        presupuesto de tiempo no hace falta volver a tocar un número mágico
        de intentos cada vez que la demora aumente.
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
        inicio = time.time()
        intento = 0
        while time.time() - inicio < timeout_total_seg:
            intento += 1
            transcurrido = int(time.time() - inicio)
            frac = min(transcurrido / timeout_total_seg, 1.0) if timeout_total_seg else 0
            self._avisar(
                progreso_pct=round(pct_base + pct_share * frac),
                paso_desc=f"Esperando que SIGFE termine de generar el reporte ({transcurrido}s/{timeout_total_seg}s)...",
            )
            log.info(f"Buscando botón 'Exportar' (intento {intento}, {transcurrido}s/{timeout_total_seg}s)...")
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

            restante = timeout_total_seg - (time.time() - inicio)
            if restante <= 0:
                break
            espera = min(espera_entre_intentos, restante)
            log.info(
                f"Todavía no aparece el botón 'Exportar'. "
                f"Reintentando en {espera:.0f}s (probablemente el "
                f"reporte sigue cargando datos; quedan ~{restante:.0f}s de presupuesto)..."
            )
            self.driver.switch_to.default_content()
            time.sleep(espera)
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
                f"No se pudo ubicar el botón 'Exportar' tras {int(time.time() - inicio)}s "
                f"(presupuesto: {timeout_total_seg}s). Revisa "
                "debug_html/error_boton_export_no_encontrado_*.html."
            )
            self.driver.switch_to.default_content()
            return None

        self._avisar(progreso_pct=round(pct_base + pct_share * 0.9), log_msg="Botón 'Exportar' encontrado, generando XLSX...")
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
            archivo = renombrar_archivo(archivo, nombre_archivo_sugerido)
            log.info(f"Renombrado a: {archivo}")
        else:
            log.warning(f"Se hizo click en 'Como XLSX' pero no se detectó archivo nuevo en {DOWNLOAD_DIR}.")
        return archivo

    # -- Flujo por establecimiento y flujo de lote -----------------------------

    def procesar_establecimiento(self, nombre: str, pct_base: float = 0, pct_share: float = 0) -> Optional[str]:
        """Ejecuta el ciclo completo para UN establecimiento, asumiendo que
        ya se hizo login y navegar_a_reporte() previamente. Devuelve la
        ruta del archivo descargado, o None si falló.

        pct_base/pct_share delimitan el tramo de progreso (0-100) que le
        corresponde a este establecimiento dentro del lote completo, para
        poder reportar avance granular durante la espera de exportación
        (que puede tomar varios minutos en establecimientos grandes)."""
        self._avisar(paso_desc=f"Configurando búsqueda: {nombre}", progreso_pct=round(pct_base + pct_share * 0.05))
        self.seleccionar_tipo_gasto()
        self.configurar_fechas()
        self.abrir_selector_cobertura()
        self.expandir_todo_el_arbol()
        self.deseleccionar_previos()
        self.seleccionar_establecimientos([nombre])
        self.aceptar_seleccion_cobertura()
        self._avisar(progreso_pct=round(pct_base + pct_share * 0.15), log_msg=f"Generando reporte para {nombre}...")
        self.buscar_reporte()
        return self.descargar_xlsx(
            nombre_archivo_sugerido=nombre,
            pct_base=pct_base + pct_share * 0.15,
            pct_share=pct_share * 0.85,
        )

    def ejecutar_lote(self, user: str, password: str, establecimientos: List[str]) -> dict:
        """
        Hace login y navega al reporte UNA sola vez, y luego repite el
        ciclo (fechas -> Gasto -> cobertura -> buscar -> descargar ->
        Volver) para cada establecimiento de la lista. Si uno falla, lo
        registra y sigue con el resto en vez de abortar todo el lote.
        """
        self.login(user, password)
        self.navegar_a_reporte()

        resultados = {}
        total = len(establecimientos)
        # Login+navegación usan el 0-6%; el resto del lote (6-95%) se reparte
        # entre establecimientos; el 95-100% queda para la consolidación
        # (reportada por el caller, después de ejecutar_lote()).
        pct_disponible = 89.0
        for idx, nombre in enumerate(establecimientos):
            pct_base = 6 + (pct_disponible / total) * idx
            pct_share = pct_disponible / total
            log.info(f"\n=== Procesando establecimiento {idx + 1}/{total}: {nombre} ===")
            self._avisar(
                paso=3, progreso_pct=round(pct_base),
                paso_desc=f"Establecimiento {idx + 1}/{total}: {nombre}",
                log_msg=f"=== Procesando {nombre} ({idx + 1}/{total}) ===",
            )
            try:
                archivo = self.procesar_establecimiento(nombre, pct_base=pct_base, pct_share=pct_share)
                resultados[nombre] = archivo
                if archivo:
                    log.info(f"OK -> {archivo}")
                    self._avisar(log_msg=f"✅ {nombre}: descarga OK")
                else:
                    log.error(f"'{nombre}' no se pudo descargar (revisa debug_html/).")
                    self._avisar(log_msg=f"⚠️ {nombre}: no se pudo descargar")
            except Exception as e:
                log.exception(f"Error procesando '{nombre}': {e}")
                guardar_html_debug(self.driver, f"error_lote_{nombre.replace(' ', '_')}")
                resultados[nombre] = None
                self._avisar(log_msg=f"❌ {nombre}: error — {e}")

            es_ultimo = (idx == total - 1)
            if not es_ultimo:
                try:
                    self.volver_a_busqueda()
                except Exception as e:
                    log.error(
                        f"No se pudo volver a la búsqueda tras '{nombre}': {e}. "
                        "Se detiene el resto del lote (los establecimientos "
                        "restantes quedan sin procesar)."
                    )
                    break

        return resultados


# --------------------------------------------------------------------------
# PUNTO DE ENTRADA
# --------------------------------------------------------------------------

ESTABLECIMIENTOS_SSO = [
    "1638001 Direccion del Servicio",
    "1638002 Hospital de Osorno",
    "1638003 Hospital Puerto Octay",
    "1638004 Hospital Purranque",
    "1638005 Hospital de Rio Negro",
    "1638006 Hospital Mision San Juan de la Costa",
    "1638007 Hospital del Perpetuo Socorro de Quilacahuin",
]

_PATRON_FECHA_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _iso_a_ddmmaa(fecha_iso: str) -> str:
    """Convierte 'YYYY-MM-DD' (formato que usa el resto del sistema en sus
    modales de fecha) al 'DD/MM/AA' que espera el campo de fecha de SIGFE."""
    if not _PATRON_FECHA_ISO.match(fecha_iso or ""):
        raise ValueError(f"Fecha inválida (se espera YYYY-MM-DD): {fecha_iso!r}")
    anio, mes, dia = fecha_iso.split("-")
    return f"{dia}/{mes}/{anio[2:]}"


def ejecutar_actualizacion_sigfe(usuario: str, password: str,
                                  fecha_desde_iso: str, fecha_hasta_iso: str,
                                  establecimientos: Optional[List[str]] = None,
                                  progress_callback=None) -> dict:
    """
    Punto de entrada PROGRAMÁTICO (sin input(), sin prompts) para disparar
    la descarga + consolidación desde el hilo de un backend web (Django).
    A diferencia de main(): no bloquea esperando ENTER, corre Chrome
    headless siempre, y garantiza driver.quit() pase lo que pase.

    Devuelve un dict con el detalle de la descarga y de la consolidación
    (incluye 'nuevos_detalle' y 'resumen_por_ue' para el panel de cambios).
    Lanza excepción si algo irrecuperable falla (login, ningún archivo
    descargado, etc.) — el caller decide cómo reportarlo.
    """
    establecimientos = establecimientos or ESTABLECIMIENTOS_SSO
    config = ConfigReporte(
        fecha_desde=_iso_a_ddmmaa(fecha_desde_iso),
        fecha_hasta=_iso_a_ddmmaa(fecha_hasta_iso),
    )

    driver = crear_driver(headless=True)
    scraper = SigfeDevengosScraper(driver, config, progress_callback=progress_callback)

    try:
        resultados = scraper.ejecutar_lote(usuario, password, establecimientos)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    ok = [n for n, a in resultados.items() if a]
    fallidos = [n for n, a in resultados.items() if not a]

    if not ok:
        raise RuntimeError(
            "No se pudo descargar ningún establecimiento. Revisa las credenciales "
            "y las fechas ingresadas, o los archivos de debug en debug_html/."
        )

    if progress_callback:
        try:
            progress_callback(
                paso=4, progreso_pct=90,
                paso_desc="Descarga completa. Consolidando y sincronizando con la base de datos...",
                log_msg=f"Descarga: {len(ok)}/{len(resultados)} establecimientos OK.",
            )
        except Exception:
            pass

    import consolidar_devengo_anual
    consolidacion = consolidar_devengo_anual.consolidar(progress_callback=progress_callback)

    return {
        "establecimientos_ok": ok,
        "establecimientos_fallidos": fallidos,
        "consolidacion": consolidacion,
    }


def main():
    user, password = pedir_credenciales()
    fecha_desde, fecha_hasta = pedir_rango_fechas()

    config = ConfigReporte(
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )

    driver = crear_driver()
    scraper = SigfeDevengosScraper(driver, config)

    try:
        resultados = scraper.ejecutar_lote(user, password, ESTABLECIMIENTOS_SSO)

        log.info("\n========== RESUMEN DEL LOTE ==========")
        ok = [n for n, a in resultados.items() if a]
        fallidos = [n for n, a in resultados.items() if not a]
        for nombre, archivo in resultados.items():
            estado = archivo if archivo else "FALLÓ"
            log.info(f"  {nombre}: {estado}")
        log.info(f"Éxito: {len(ok)}/{len(resultados)}. Fallidos: {len(fallidos)}.")
        if fallidos:
            log.info("Revisa debug_html/ para los que fallaron y pégame el HTML correspondiente.")

        if ok:
            log.info("\n========== CONSOLIDANDO Y SINCRONIZANDO CON LA BASE DE DATOS ==========")
            try:
                import consolidar_devengo_anual
                consolidar_devengo_anual.consolidar()
            except Exception as e:
                log.error(
                    f"La descarga terminó OK pero la consolidación/sincronización falló: {e}. "
                    f"Los .xlsx siguen en {DOWNLOAD_DIR} — puedes reintentar corriendo "
                    "'python consolidar_devengo_anual.py' manualmente sin volver a descargar."
                )
        else:
            log.warning("Ningún establecimiento se descargó correctamente; se omite la consolidación.")

    except Exception as e:
        log.exception(f"Error durante la ejecución: {e}")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        os.makedirs(DEBUG_DIR, exist_ok=True)
        screenshot_path = os.path.join(DEBUG_DIR, f"error_{timestamp}.png")
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
