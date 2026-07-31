"""
sigfe_estado_ejecucion_presupuestaria.py
------------------------------------------
Automatiza la descarga del reporte "Estado de Ejecución Presupuestaria -
Anexo 1" desde SIGFE Reports, por establecimiento y por MES CERRADO
(este reporte se trabaja mes a mes, a diferencia de Disponibilidad de
Devengos que se descargaba por rango de fechas libre).

REQUISITOS PREVIOS:
  pip install selenium

CREDENCIALES:
  Se piden interactivamente (usuario visible, contraseña oculta con
  getpass), igual que en sigfe_descarga_devengos.py.

DEBUG SIN INSPECCIÓN MANUAL:
  Igual que el script anterior: cualquier paso que falle guarda HTML en
  debug_html_ejecucion/ para que me lo pegues sin necesitar DevTools.

ESTADO DE CONFIANZA POR SECCIÓN:
  [Seguro]     login, menú, Gasto, Ejercicio Fiscal, fechas vía JS,
               árbol de cobertura + 'Limpiar' (id confirmado por ti),
               selección de establecimiento por texto, botón Exportar +
               'Como XLSX' (mismos patrones ya validados en el otro script).
  [Adivinando] botón "Opciones" (asumido id="options" - el HTML que me
               diste para este botón estaba duplicado del de "Exportar",
               así que esto es una suposición informada, no un hecho) y
               los selectores "Nivel 9" / "Catálogo de Cruce" dentro del
               panel de opciones (nunca vi el HTML de la lista desplegable
               real). Esta es la parte más frágil de todo el script.
"""

import os
import re
import sys
import time
import getpass
import logging
import calendar
from dataclasses import dataclass, field
from datetime import datetime, date
from typing import List, Optional, Tuple

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
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
# Anclado a la ubicación del propio archivo, NO a os.getcwd(): cuando este
# módulo se importa desde el hilo de Django (ejecutar_actualizacion_anexo1),
# el cwd del proceso es backend/, no api/data/data_anexo1/ -- con
# os.getcwd() los .xlsx se descargaban en un lugar y consolidar_anexo1_sigfe.py
# (que sí está anclado a __file__) buscaba en otro. Mismo patrón ya usado en
# api/data/data_devengo/sigfe_descarga_devengos_Completo.py (_RUTA_MODULO).
_RUTA_MODULO = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(_RUTA_MODULO, "descargas_sigfe_ejecucion")
DEBUG_DIR = os.path.join(_RUTA_MODULO, "debug_html_ejecucion")
TIMEOUT = 25

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("sigfe_ejecucion")


ESTABLECIMIENTOS_SSO = [
    "1638001 Direccion del Servicio",
    "1638002 Hospital de Osorno",
    "1638003 Hospital Puerto Octay",
    "1638004 Hospital Purranque",
    "1638005 Hospital de Rio Negro",
    "1638006 Hospital Mision San Juan de la Costa",
    "1638007 Hospital del Perpetuo Socorro de Quilacahuin",
]


@dataclass
class ConfigEjecucionPresupuestaria:
    ejercicio: str = ""          # ej: "2026"
    fecha_desde: str = ""        # DD/MM/AA, ej: 01/01/26
    fecha_hasta: str = ""        # DD/MM/AA, ej: 16/07/26
    establecimientos: List[str] = field(default_factory=lambda: list(ESTABLECIMIENTOS_SSO))
    nivel_deseado: str = "Nivel 9"


# --------------------------------------------------------------------------
# UTILIDADES GENERALES (mismo patrón que sigfe_descarga_devengos.py)
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


def pedir_ejercicio_y_rango() -> Tuple[str, str, str]:
    """
    Pide Ejercicio Fiscal (año) y el rango Desde/Hasta dentro de ese año.
    El rango se trocea en meses más adelante (generar_rangos_mensuales).
    """
    patron_fecha = re.compile(r"^\d{2}/\d{2}/\d{2}$")

    print("\n--- Reporte: Estado de Ejecución Presupuestaria - Anexo 1 ---")
    while True:
        ejercicio = input("Ejercicio Fiscal (año completo, ej: 2026): ").strip()
        if ejercicio.isdigit() and len(ejercicio) == 4:
            break
        print("Ingresa un año de 4 dígitos, ej: 2026")

    while True:
        desde = input("Fecha DESDE (formato DD/MM/AA, ej: 01/01/26): ").strip()
        if patron_fecha.match(desde):
            break
        print("Formato inválido. Usa DD/MM/AA, ej: 01/01/26")

    while True:
        hasta = input("Fecha HASTA (formato DD/MM/AA, ej: 16/07/26): ").strip()
        if patron_fecha.match(hasta):
            break
        print("Formato inválido. Usa DD/MM/AA, ej: 16/07/26")

    return ejercicio, desde, hasta


def generar_rangos_mensuales(fecha_desde_str: str, fecha_hasta_str: str) -> List[Tuple[str, str, str]]:
    """
    Trocea el rango [fecha_desde_str, fecha_hasta_str] (formato DD/MM/AA)
    en tramos mensuales: cada mes completo, excepto el primer y último
    tramo que respetan las fechas exactas que dio el usuario (por eso
    julio queda parcial si 'hasta' es a mitad de mes).

    Devuelve una lista de tuplas (desde_DD/MM/AA, hasta_DD/MM/AA, etiqueta
    "AAAA-MM") en orden cronológico.
    """
    fmt = "%d/%m/%y"
    inicio = datetime.strptime(fecha_desde_str, fmt).date()
    fin = datetime.strptime(fecha_hasta_str, fmt).date()

    if inicio > fin:
        raise ValueError("La fecha 'Desde' es posterior a la fecha 'Hasta'.")

    rangos = []
    cursor = inicio
    while cursor <= fin:
        year, month = cursor.year, cursor.month
        ultimo_dia_num = calendar.monthrange(year, month)[1]
        ultimo_dia_mes = date(year, month, ultimo_dia_num)

        desde_tramo = cursor
        hasta_tramo = min(ultimo_dia_mes, fin)

        etiqueta = f"{year}-{month:02d}"
        rangos.append((desde_tramo.strftime(fmt), hasta_tramo.strftime(fmt), etiqueta))

        # Avanza al día 1 del mes siguiente
        if month == 12:
            cursor = date(year + 1, 1, 1)
        else:
            cursor = date(year, month + 1, 1)

    return rangos


def guardar_html_debug(driver, nombre: str, contenido: Optional[str] = None):
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
    ejecutar_actualizacion_anexo1(). El default sigue en False para no romper
    el uso manual por CLI (main()), donde ver la ventana ayuda a depurar.
    Mismo patrón que api/data/data_devengo/sigfe_descarga_devengos_Completo.py."""
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

class SigfeEjecucionPresupuestariaScraper:
    """
    Flujo:
      1. login()
      2. navegar_a_reporte()
      3. Por cada establecimiento:
           Por cada mes dentro del rango:
             seleccionar_tipo_y_ejercicio()
             configurar_fechas(mes_desde, mes_hasta)
             abrir_selector_cobertura()
             expandir_todo_el_arbol()
             limpiar_seleccion_cobertura()
             seleccionar_establecimientos([establecimiento])
             aceptar_seleccion_cobertura()
             buscar_reporte()
             configurar_niveles_export()   # Opciones -> Nivel 9 x2 -> Aplicar
             descargar_xlsx(...)
             volver_a_busqueda()
    """

    def __init__(self, driver, config: ConfigEjecucionPresupuestaria, progress_callback=None):
        self.driver = driver
        self.config = config
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
        time.sleep(3)

    # -- Navegación de menú --------------------------------------------------

    def navegar_a_reporte(self):
        self._avisar(paso_desc="Navegando al reporte de Ejecución Presupuestaria...", progreso_pct=4,
                     log_msg="Sesión iniciada. Abriendo menú de reportes...")
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

        log.info("Seleccionando sub-sub-menú 'Estados / Balance'...")
        submenu2 = WebDriverWait(self.driver, TIMEOUT).until(
            EC.presence_of_element_located(
                (By.XPATH, "//td[contains(@class,'af_menu_submenu-text') and contains(text(),'Estados') and contains(text(),'Balance')]")
            )
        )
        ActionChains(self.driver).move_to_element(submenu2).click().perform()
        time.sleep(1)

        log.info("Seleccionando 'Estado de Ejecución Presupuestaria'...")
        item = WebDriverWait(self.driver, TIMEOUT).until(
            EC.element_to_be_clickable(
                (By.XPATH, "//td[contains(@class,'af_commandMenuItem_menu-item-text') and contains(text(),'Estado de Ejecuci')]")
            )
        )
        item.click()
        time.sleep(2)

    def seleccionar_tipo_y_ejercicio(self):
        """Se repite tras cada 'Volver', igual que 'Gasto' en el otro reporte."""
        log.info("Seleccionando tipo 'Gasto'...")
        select_tipo = WebDriverWait(self.driver, TIMEOUT).until(
            EC.presence_of_element_located((By.ID, "idPgTpl:idSeonchTipoPresup::content"))
        )
        Select(select_tipo).select_by_visible_text("Gasto")
        time.sleep(0.5)

        log.info(f"Seleccionando Ejercicio Fiscal '{self.config.ejercicio}'...")
        select_ejercicio = self.driver.find_element(By.ID, "idPgTpl:idSeonchEjercicio::content")
        Select(select_ejercicio).select_by_visible_text(self.config.ejercicio)
        time.sleep(1)

    # -- Fechas ---------------------------------------------------------------

    def configurar_fechas(self, fecha_desde: str, fecha_hasta: str):
        log.info(f"Configurando fechas del tramo: Desde={fecha_desde} / Hasta={fecha_hasta}")
        set_input_value_js(self.driver, "idPgTpl:idIndaDesdeCreacion::content", fecha_desde)
        time.sleep(0.5)
        set_input_value_js(self.driver, "idPgTpl:idIndaHasta::content", fecha_hasta)
        time.sleep(0.5)
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
        try:
            WebDriverWait(self.driver, TIMEOUT).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.af_tree"))
            )
        except TimeoutException:
            guardar_html_debug(self.driver, "error_popup_cobertura_no_aparecio")
            raise

    def expandir_todo_el_arbol(self):
        """[Probable] Igual patrón que en sigfe_descarga_devengos.py: click
        derecho sobre el nodo raíz para abrir el menú contextual con
        'Ampliar Todo Debajo'."""
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
        except (TimeoutException, NoSuchElementException) as e:
            guardar_html_debug(self.driver, "error_expandir_arbol")
            log.error(f"No se pudo expandir el árbol. Detalle: {e}")
            raise

    def limpiar_seleccion_cobertura(self):
        """
        [Seguro] A diferencia del otro reporte, acá SÍ tenemos el id real
        del link 'Limpiar', así que no necesitamos trackear checkboxes
        manualmente entre iteraciones.
        """
        log.info("Click en 'Limpiar' para deseleccionar todo lo marcado por defecto...")
        click_seguro(
            self.driver, By.ID, "svwPopupCobertura:idCmlIrLimpiar",
            descripcion="Link Limpiar (cobertura)"
        )
        time.sleep(1)

    def seleccionar_establecimientos(self, nombres: List[str]):
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
            except (TimeoutException, NoSuchElementException):
                guardar_html_debug(self.driver, f"error_no_encontrado_{nombre.replace(' ', '_')}")
                log.error(f"No se encontró '{nombre}' en el árbol.")
                raise

    def aceptar_seleccion_cobertura(self):
        log.info("Click en 'Aceptar' del selector de cobertura...")
        click_seguro(
            self.driver, By.ID, "svwPopupCobertura:siCBBuscar:idCmbIrBuscar2",
            descripcion="Botón Aceptar (popup cobertura)"
        )
        time.sleep(2)

    def volver_a_busqueda(self):
        log.info("Click en 'Volver' para reiniciar la búsqueda...")
        click_seguro(
            self.driver, By.ID, "idPgTpl:siCBVolver:idCmbIrBuscar2",
            descripcion="Botón Volver"
        )
        time.sleep(2)

    # -- Búsqueda ------------------------------------------------------------

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
        log.info("Esperando a que el reporte termine de cargar (margen inicial)...")
        time.sleep(10)

    # -- Configuración de niveles (Opciones -> Nivel 9 x2 -> Aplicar) --------

    def _buscar_select_nativo(self, contenedor_id: str) -> Optional[str]:
        """
        Busca un <select> HTML nativo dentro del contenedor (patrón de
        'mejora progresiva': muchos widgets JS decoran un <select> real
        oculto con esta interfaz visual custom). Si existe, es MUCHO más
        confiable manipularlo directamente que clickear el widget falso.
        Devuelve el outerHTML si lo encuentra, o None si no hay ninguno.
        """
        resultado = self.driver.execute_script(
            """
            var cont = document.getElementById(arguments[0]);
            if (!cont) return null;
            var selects = cont.querySelectorAll('select');
            if (selects.length === 0) return null;
            return selects[0].outerHTML;
            """,
            contenedor_id,
        )
        return resultado

    def _seleccionar_nivel_en_contenedor(self, contenedor_id: str, nivel_texto: str = "Nivel 9",
                                           diagnostico: bool = False):
        """
        [Seguro] contenedor_id real confirmado: 'nivel_concepto' (Catálogo
        Base) o 'nivel_concepto_cruce' (Catálogo de Cruce).

        Estrategia en dos niveles:
        1) Intenta encontrar y usar un <select> NATIVO oculto dentro del
           contenedor (si existe, es la vía más confiable - nada de
           clickear un widget JS custom).
        2) Si no hay <select> nativo, cae al click sobre el <li> visible
           - y si 'diagnostico=True', en vez de guardar un archivo, IMPRIME
           en el log el HTML de la lista abierta para que lo copies
           directamente de la consola sin necesitar abrir nada.
        """
        anchor = WebDriverWait(self.driver, 8).until(
            EC.element_to_be_clickable(
                (By.XPATH, f"//div[@id='{contenedor_id}']//a[contains(@class,'jr-mSingleselect-input')]")
            )
        )

        # --- Intento 1: <select> nativo oculto ---
        select_html = self._buscar_select_nativo(contenedor_id)
        if select_html:
            log.info(f"[{contenedor_id}] <select> nativo encontrado: {select_html[:300]}")
            try:
                select_el = self.driver.find_element(By.CSS_SELECTOR, f"#{contenedor_id} select")
                Select(select_el).select_by_visible_text(nivel_texto)
                self.driver.execute_script(
                    "arguments[0].dispatchEvent(new Event('change', {bubbles:true}));", select_el
                )
                time.sleep(1)
                seleccion_actual = anchor.find_element(
                    By.CSS_SELECTOR, "span.jr-mSingleselect-input-selection"
                ).text.strip()
                if seleccion_actual == nivel_texto:
                    log.info(f"'{contenedor_id}' confirmado en '{seleccion_actual}' vía <select> nativo.")
                    return
                else:
                    log.warning(
                        f"El <select> nativo se setéo pero el widget visual sigue mostrando "
                        f"'{seleccion_actual}' - probablemente no está realmente enlazado. "
                        "Sigo con el plan B (click)."
                    )
            except Exception as e:
                log.warning(f"No se pudo usar el <select> nativo de '{contenedor_id}': {e}. Sigo con plan B.")
        else:
            log.info(f"[{contenedor_id}] No se encontró <select> nativo. Voy directo al click.")

        # --- Intento 2: click sobre el <li> visible ---
        anchor.click()
        time.sleep(0.8)

        if diagnostico:
            # Imprime en el log el HTML de CUALQUIER contenedor visible que
            # parezca ser la lista desplegable abierta - directo a consola,
            # sin archivo, para que lo copies de ahí mismo.
            html_visible = self.driver.execute_script(
                """
                var candidatos = document.querySelectorAll(
                    "[class*='dropdown'], [class*='Selectlist'], [class*='select-list'], ul.jr-mSelectlist"
                );
                var resultado = [];
                for (var i = 0; i < candidatos.length; i++) {
                    var el = candidatos[i];
                    var style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        resultado.push(el.outerHTML);
                    }
                }
                return resultado.join('\\n\\n=====\\n\\n');
                """
            )
            log.info(f"[DIAGNÓSTICO {contenedor_id}] Elementos visibles tipo lista/dropdown:\n{html_visible[:4000]}")

        xpath_opcion_visible = (
            "//div[contains(@class,'jr-mSingleselect-dropdown') and "
            "not(contains(@style,'display: none')) and not(contains(@style,'display:none'))]"
            f"//a[contains(@class,'jr-mSelectlist-item-text') and normalize-space(text())='{nivel_texto}']"
        )
        try:
            opcion = WebDriverWait(self.driver, 8).until(
                EC.element_to_be_clickable((By.XPATH, xpath_opcion_visible))
            )
        except TimeoutException:
            log.error(
                f"No se encontró la opción '{nivel_texto}' con el XPath conocido en '{contenedor_id}'. "
                "Revisa el bloque [DIAGNÓSTICO] impreso arriba en la consola - ahí debería estar "
                "la estructura real de la lista abierta."
            )
            raise

        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", opcion)
        time.sleep(0.3)

        # [Corrección clave] El click vía execute_script es un evento JS
        # sintético sin coordenadas de mouse reales. Este widget usa una
        # lista virtualizada (jr-mScalablelist) que probablemente hace
        # hit-testing por posición real del mouse, no solo por el evento
        # 'click'. Por eso el click JS "se ejecutaba" pero no seleccionaba
        # nada. Usamos ActionChains para un click nativo de WebDriver
        # (mouse real, con coordenadas), que es lo que un usuario humano
        # realmente dispara.
        try:
            ActionChains(self.driver).move_to_element(opcion).pause(0.2).click().perform()
        except Exception as e:
            log.warning(f"Click nativo con ActionChains falló ({e}), probando click directo de Selenium...")
            try:
                opcion.click()
            except Exception as e2:
                log.warning(f"Click directo también falló ({e2}), último recurso: click JS.")
                self.driver.execute_script(
                    """
                    var a = arguments[0];
                    var li = a.closest('.jr-mSelectlist-item') || a;
                    li.click();
                    """,
                    opcion,
                )
        time.sleep(0.8)

        anchor_actualizado = self.driver.find_element(
            By.XPATH, f"//div[@id='{contenedor_id}']//a[contains(@class,'jr-mSingleselect-input')]"
        )
        seleccion_actual = anchor_actualizado.find_element(
            By.CSS_SELECTOR, "span.jr-mSingleselect-input-selection"
        ).text.strip()

        if seleccion_actual != nivel_texto:
            raise NoSuchElementException(
                f"En '{contenedor_id}': tras clickear, quedó mostrando '{seleccion_actual}' "
                f"en vez de '{nivel_texto}'. Revisa el bloque [DIAGNÓSTICO] impreso en la consola."
            )
        log.info(f"'{contenedor_id}' confirmado en '{seleccion_actual}'.")

    def configurar_niveles_export(self, intentos_max: int = 4, espera_entre_intentos: int = 8):
        """
        [Adivinando] Esta es la parte más frágil del script. Abre el panel
        de 'Opciones' dentro del iframe, selecciona 'Nivel 9' tanto en el
        selector general como en 'Catálogo de Cruce', y hace click en
        'Aplicar'. Si algo de esto no calza con el DOM real, se guarda un
        dump de debug del panel completo - pégamelo si esto falla, es
        virtualmente seguro que va a necesitar un ajuste con HTML real.
        """
        self.driver.switch_to.default_content()
        iframe = self.driver.find_element(By.ID, "idPgTpl:if1")
        self.driver.switch_to.frame(iframe)

        # 1) Botón "Opciones" - id asumido "options" (ver advertencia en el
        #    docstring del módulo: el HTML que me diste para este botón
        #    estaba duplicado del de "Exportar").
        boton_opciones = None
        selectores_opciones = [
            (By.ID, "options"),
            (By.CSS_SELECTOR, "button[aria-label='Opciones']"),
            (By.CSS_SELECTOR, "button[title='Opciones']"),
        ]
        for by, sel in selectores_opciones:
            try:
                boton_opciones = WebDriverWait(self.driver, 8).until(
                    EC.element_to_be_clickable((by, sel))
                )
                log.info(f"Botón 'Opciones' encontrado con selector: {sel}")
                break
            except TimeoutException:
                continue

        if boton_opciones is None:
            html_iframe = self.driver.execute_script("return document.body.innerHTML;")
            guardar_html_debug(self.driver, "error_boton_opciones_no_encontrado", html_iframe)
            self.driver.switch_to.default_content()
            raise NoSuchElementException(
                "No se encontró el botón 'Opciones'. Revisa "
                "debug_html_ejecucion/error_boton_opciones_no_encontrado_*.html "
                "y pásame el HTML real de ese botón."
            )

        boton_opciones.click()
        time.sleep(1.5)

        # 2) Catálogo Base (contenedor real: nivel_concepto)
        try:
            self._seleccionar_nivel_en_contenedor(
                "nivel_concepto", self.config.nivel_deseado, diagnostico=True
            )
        except (TimeoutException, NoSuchElementException) as e:
            html_panel = self.driver.execute_script("return document.body.innerHTML;")
            guardar_html_debug(self.driver, "error_nivel_general_no_encontrado", html_panel)
            self.driver.switch_to.default_content()
            log.error(f"No se pudo seleccionar '{self.config.nivel_deseado}' en Catálogo Base: {e}")
            raise

        # 3) Catálogo de Cruce (contenedor real: nivel_concepto_cruce)
        try:
            self._seleccionar_nivel_en_contenedor(
                "nivel_concepto_cruce", self.config.nivel_deseado, diagnostico=True
            )
        except (TimeoutException, NoSuchElementException) as e:
            html_panel = self.driver.execute_script("return document.body.innerHTML;")
            guardar_html_debug(self.driver, "error_nivel_cruce_no_encontrado", html_panel)
            self.driver.switch_to.default_content()
            log.error(f"No se pudo seleccionar '{self.config.nivel_deseado}' en Catálogo de Cruce: {e}")
            raise

        # 4) Botón "Aplicar"
        try:
            boton_aplicar = WebDriverWait(self.driver, 8).until(
                EC.element_to_be_clickable((By.ID, "apply"))
            )
            boton_aplicar.click()
        except TimeoutException:
            html_panel = self.driver.execute_script("return document.body.innerHTML;")
            guardar_html_debug(self.driver, "error_boton_aplicar_no_encontrado", html_panel)
            self.driver.switch_to.default_content()
            raise NoSuchElementException(
                "No se encontró el botón 'Aplicar'. Revisa "
                "debug_html_ejecucion/error_boton_aplicar_no_encontrado_*.html."
            )

        log.info("Niveles configurados (Nivel 9 x2) y 'Aplicar' presionado. Esperando recarga del reporte...")
        self.driver.switch_to.default_content()
        time.sleep(10)  # el reporte se re-renderiza con el nuevo nivel de detalle

    # -- Descarga -------------------------------------------------------------

    def descargar_xlsx(self, nombre_archivo_sugerido: str,
                        intentos_max: int = 6, espera_entre_intentos: int = 10) -> Optional[str]:
        """
        [Seguro] Mismo patrón validado en sigfe_descarga_devengos.py:
        botón 'Exportar' (id="export") -> opción 'Como XLSX' por texto.
        No hay URL directa de respaldo conocida para este reporte.
        """
        self.driver.switch_to.default_content()
        iframe = self.driver.find_element(By.ID, "idPgTpl:if1")
        self.driver.switch_to.frame(iframe)

        boton_export = None
        for intento in range(1, intentos_max + 1):
            log.info(f"Buscando botón 'Exportar' (intento {intento}/{intentos_max})...")
            try:
                boton_export = WebDriverWait(self.driver, 5).until(
                    EC.element_to_be_clickable((By.ID, "export"))
                )
                break
            except TimeoutException:
                pass
            self.driver.switch_to.default_content()
            time.sleep(espera_entre_intentos)
            try:
                iframe = self.driver.find_element(By.ID, "idPgTpl:if1")
                self.driver.switch_to.frame(iframe)
            except NoSuchElementException:
                continue

        if boton_export is None:
            html_iframe = self.driver.execute_script("return document.body.innerHTML;")
            guardar_html_debug(self.driver, "error_boton_export_no_encontrado", html_iframe)
            log.error("No se pudo ubicar el botón 'Exportar' tras varios intentos.")
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
        except TimeoutException:
            html_menu = self.driver.execute_script("return document.body.innerHTML;")
            guardar_html_debug(self.driver, "error_opcion_xlsx_no_encontrada", html_menu)
            log.warning("No se encontró la opción 'Como XLSX'.")
            self.driver.switch_to.default_content()
            return None

        self.driver.switch_to.default_content()

        archivo = esperar_archivo_nuevo(
            DOWNLOAD_DIR, extension=".xlsx",
            archivos_previos=archivos_previos, timeout=30
        )
        if archivo:
            archivo = renombrar_archivo(archivo, nombre_archivo_sugerido)
            log.info(f"Descarga confirmada y renombrada: {archivo}")
        else:
            log.warning(f"No se detectó archivo nuevo en {DOWNLOAD_DIR}.")
        return archivo

    # -- Flujo por tramo (un mes, un establecimiento) y flujo de lote --------

    def procesar_tramo(self, establecimiento: str, mes_desde: str, mes_hasta: str, etiqueta_mes: str) -> Optional[str]:
        self.seleccionar_tipo_y_ejercicio()
        self.configurar_fechas(mes_desde, mes_hasta)
        self.abrir_selector_cobertura()
        self.expandir_todo_el_arbol()
        self.limpiar_seleccion_cobertura()
        self.seleccionar_establecimientos([establecimiento])
        self.aceptar_seleccion_cobertura()
        self.buscar_reporte()
        self.configurar_niveles_export()
        nombre_archivo = f"{establecimiento}_{etiqueta_mes}"
        return self.descargar_xlsx(nombre_archivo_sugerido=nombre_archivo)

    def ejecutar_lote(self, user: str, password: str) -> dict:
        """
        Recorre TODOS los establecimientos y, para cada uno, TODOS los
        meses del rango configurado (outer=establecimiento, inner=mes,
        como pediste). Login y navegación al reporte ocurren una sola vez.
        """
        self.login(user, password)
        self.navegar_a_reporte()

        rangos_mensuales = generar_rangos_mensuales(self.config.fecha_desde, self.config.fecha_hasta)
        log.info(f"Se descargarán {len(rangos_mensuales)} tramo(s) mensual(es) por establecimiento:")
        for d, h, e in rangos_mensuales:
            log.info(f"  {e}: {d} -> {h}")

        resultados = {}
        total_establecimientos = len(self.config.establecimientos)
        total_tramos = len(rangos_mensuales)
        contador_global = 0
        total_global = total_establecimientos * total_tramos

        self._avisar(
            paso_desc=f"Descargando {total_global} tramo(s) ({total_establecimientos} establecimiento(s) x {total_tramos} mes(es))...",
            progreso_pct=5, log_msg=f"Plan: {total_global} tramo(s) mensuales a descargar.",
        )

        for i_est, establecimiento in enumerate(self.config.establecimientos):
            for i_mes, (mes_desde, mes_hasta, etiqueta_mes) in enumerate(rangos_mensuales):
                contador_global += 1
                clave = f"{establecimiento} | {etiqueta_mes}"
                log.info(f"\n=== [{contador_global}/{total_global}] {clave} ===")
                pct = 5 + int(80 * contador_global / total_global) if total_global else 85
                self._avisar(paso_desc=f"[{contador_global}/{total_global}] {clave}", progreso_pct=pct)

                try:
                    archivo = self.procesar_tramo(establecimiento, mes_desde, mes_hasta, etiqueta_mes)
                    resultados[clave] = archivo
                    if archivo:
                        log.info(f"OK -> {archivo}")
                        self._avisar(progreso_pct=pct, log_msg=f"OK: {clave}")
                    else:
                        log.error(f"'{clave}' no se pudo descargar (revisa debug_html_ejecucion/).")
                        self._avisar(progreso_pct=pct, log_msg=f"FALLÓ: {clave}")
                except Exception as e:
                    log.exception(f"Error procesando '{clave}': {e}")
                    guardar_html_debug(self.driver, f"error_lote_{clave.replace(' ', '_').replace('|','_')}")
                    resultados[clave] = None
                    self._avisar(progreso_pct=pct, log_msg=f"ERROR en {clave}: {e}")

                es_ultimo_absoluto = (i_est == total_establecimientos - 1) and (i_mes == total_tramos - 1)
                if not es_ultimo_absoluto:
                    try:
                        self.volver_a_busqueda()
                    except Exception as e:
                        log.error(
                            f"No se pudo volver a la búsqueda tras '{clave}': {e}. "
                            "Se detiene el resto del lote."
                        )
                        return resultados

        return resultados


_PATRON_FECHA_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _iso_a_ddmmaa(fecha_iso: str) -> str:
    """Convierte 'YYYY-MM-DD' (formato que usa el resto del sistema en sus
    modales de fecha) al 'DD/MM/AA' que espera el campo de fecha de SIGFE."""
    if not _PATRON_FECHA_ISO.match(fecha_iso or ""):
        raise ValueError(f"Fecha inválida (se espera YYYY-MM-DD): {fecha_iso!r}")
    anio, mes, dia = fecha_iso.split("-")
    return f"{dia}/{mes}/{anio[2:]}"


def ejecutar_actualizacion_anexo1(usuario: str, password: str,
                                   fecha_desde_iso: str, fecha_hasta_iso: str,
                                   establecimientos: Optional[List[str]] = None,
                                   progress_callback=None,
                                   headless: bool = True) -> dict:
    """
    Punto de entrada PROGRAMÁTICO (sin input(), sin prompts) para disparar la
    descarga + consolidación desde el hilo de un backend web (Django). A
    diferencia de main(): no bloquea esperando ENTER, y garantiza
    driver.quit() pase lo que pase. Mismo patrón que
    api/data/data_devengo/sigfe_descarga_devengos_Completo.py.

    headless=True (default) corre Chrome sin ventana. Pasar headless=False
    (botón "👁 Ver navegador" del modal de actualización) abre una ventana de
    Chrome real en el escritorio donde corre el proceso de Django — solo
    tiene sentido si el backend corre en la misma máquina física desde la
    que se está mirando, y sirve para diagnosticar visualmente en qué paso
    falla la automatización.

    El 'Ejercicio Fiscal' que exige SIGFE se deriva del año de fecha_desde_iso
    -- misma limitación que el uso manual por CLI (que también pide un único
    año para todo el lote): si el rango solicitado cruza fin de año, todos
    los tramos usan el mismo Ejercicio Fiscal, lo cual sería incorrecto para
    el tramo del otro año. No es una regresión de este refactor, es una
    limitación heredada del script original -- para descargas que cruzan año,
    conviene lanzar dos actualizaciones separadas (una por año).

    Devuelve un dict con el detalle de la descarga y de la consolidación.
    Lanza excepción (RuntimeError/ValueError) si algo irrecuperable falla —
    el caller decide cómo reportarlo.
    """
    establecimientos = establecimientos or list(ESTABLECIMIENTOS_SSO)
    fecha_desde_ddmmaa = _iso_a_ddmmaa(fecha_desde_iso)
    fecha_hasta_ddmmaa = _iso_a_ddmmaa(fecha_hasta_iso)
    ejercicio = fecha_desde_iso[:4]

    config = ConfigEjecucionPresupuestaria(
        ejercicio=ejercicio,
        fecha_desde=fecha_desde_ddmmaa,
        fecha_hasta=fecha_hasta_ddmmaa,
        establecimientos=establecimientos,
    )

    driver = crear_driver(headless=headless)
    scraper = SigfeEjecucionPresupuestariaScraper(driver, config, progress_callback=progress_callback)

    try:
        resultados = scraper.ejecutar_lote(usuario, password)
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    ok = [k for k, a in resultados.items() if a]
    fallidos = [k for k, a in resultados.items() if not a]

    if not ok:
        raise RuntimeError(
            "No se pudo descargar ningún tramo. Revisa las credenciales y las fechas "
            "ingresadas, o los archivos de debug en debug_html_ejecucion/."
        )

    if progress_callback:
        try:
            progress_callback(
                progreso_pct=90,
                paso_desc="Descarga completa. Consolidando y sincronizando con la base de datos...",
                log=f"Descarga: {len(ok)}/{len(resultados)} tramo(s) OK.",
            )
        except Exception:
            pass

    import consolidar_anexo1_sigfe
    consolidacion = consolidar_anexo1_sigfe.consolidar(progress_callback=progress_callback)

    return {
        "tramos_ok": ok,
        "tramos_fallidos": fallidos,
        "consolidacion": consolidacion,
    }


# --------------------------------------------------------------------------
# PUNTO DE ENTRADA
# --------------------------------------------------------------------------

def main():
    user, password = pedir_credenciales()
    ejercicio, fecha_desde, fecha_hasta = pedir_ejercicio_y_rango()

    config = ConfigEjecucionPresupuestaria(
        ejercicio=ejercicio,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )

    driver = crear_driver()
    scraper = SigfeEjecucionPresupuestariaScraper(driver, config)

    try:
        resultados = scraper.ejecutar_lote(user, password)

        log.info("\n========== RESUMEN DEL LOTE ==========")
        ok = [k for k, a in resultados.items() if a]
        fallidos = [k for k, a in resultados.items() if not a]
        for clave, archivo in resultados.items():
            estado = archivo if archivo else "FALLÓ"
            log.info(f"  {clave}: {estado}")
        log.info(f"Éxito: {len(ok)}/{len(resultados)}. Fallidos: {len(fallidos)}.")
        if fallidos:
            log.info("Revisa debug_html_ejecucion/ para los que fallaron y pégame el HTML correspondiente.")

    except Exception as e:
        log.exception(f"Error durante la ejecución: {e}")
        os.makedirs(DEBUG_DIR, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
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
