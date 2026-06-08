"""
Descarga automatizada de reportes FSC desde el Panel Documental SS Osorno
(https://panel.ssosorno.cl) vía Selenium, y carga de los datos a Django.

Se invoca desde el dashboard (botón "Actualizar" del tab Formularios en
Abastecimiento → /api/formularios/actualizar/) o directamente por CLI.

Reportes descargados (botones del panel):
    totalfscy    → Formularios Solicitud de Compra del año      (total_fsc_anho_*.xls)
    totalfscdy   → Formularios derivados a comprador            (total_fsc_anho_derivadas_*.xls)
    totalcarrofsc→ Carro de productos por formulario            (total_carro_fsc_*.xls)
"""
import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

RUTA_PANEL = Path(__file__).parent.absolute()
DOWNLOAD_DIR = RUTA_PANEL
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

URL_PANEL = "https://panel.ssosorno.cl/panel_documental/app/solicitudes_compras/abastecimiento/exportar.php"

# id del botón de exportación → (prefijo de archivo final, tipo usado por el ETL Django)
_BOTONES_REPORTES = [
    ("totalfscy", "total_fsc_anho", "fsc"),
    ("totalfscdy", "total_fsc_anho_derivadas", "derivados"),
    ("totalcarrofsc", "total_carro_fsc", "carro"),
]


def _credenciales_por_defecto():
    """Credenciales de acceso al Panel SS Osorno — vienen de variables de entorno, nunca hardcodeadas."""
    return (
        os.environ.get("PANEL_SSO_RUT", ""),
        os.environ.get("PANEL_SSO_DV", ""),
        os.environ.get("PANEL_SSO_CLAVE", ""),
    )


def _crear_driver():
    chrome_options = Options()
    prefs = {
        "download.default_directory": str(DOWNLOAD_DIR),
        "download.prompt_for_download": False,
        "safebrowsing.enabled": True,
    }
    chrome_options.add_experimental_option("prefs", prefs)
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1366,900")
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)


def _archivos_xls(directorio):
    return {f for f in directorio.iterdir() if f.suffix.lower() in (".xls", ".xlsx", ".crdownload")}


def _esperar_descarga(directorio, archivos_antes, timeout=60):
    """Espera a que aparezca un archivo nuevo y termine de descargarse (sin extensión .crdownload)."""
    fin = time.time() + timeout
    nuevo = None
    while time.time() < fin:
        actuales = _archivos_xls(directorio)
        candidatos = [f for f in (actuales - archivos_antes) if not f.name.endswith(".crdownload")]
        if candidatos:
            nuevo = max(candidatos, key=lambda f: f.stat().st_mtime)
            # Confirmar que ya no existe el .crdownload asociado
            if not any(f.name == nuevo.name + ".crdownload" for f in actuales):
                return nuevo
        time.sleep(1)
    return nuevo


def descargar_reportes_panel(rut, dv, clave, progress_callback=None):
    """
    Inicia sesión en el Panel SS Osorno y descarga los 3 reportes FSC.

    Retorna un dict {tipo: Path} con los archivos descargados, donde
    tipo ∈ {"fsc", "derivados", "carro"}.
    """
    def _avisar(paso=None, paso_desc=None, progreso_pct=None, log=None):
        if progress_callback:
            progress_callback(paso=paso, paso_desc=paso_desc, progreso_pct=progreso_pct, log=log)

    driver = None
    archivos = {}
    try:
        _avisar(paso_desc="Iniciando navegador Chrome...", log="Abriendo navegador headless...")
        driver = _crear_driver()
        wait = WebDriverWait(driver, 30)

        # 1. LOGIN
        _avisar(paso_desc="Ingresando credenciales en el Panel SS Osorno...", log="Autenticando...")
        driver.get(URL_PANEL)
        wait.until(EC.presence_of_element_located((By.ID, "rut"))).send_keys(rut)
        driver.find_element(By.ID, "dv").send_keys(dv)
        driver.find_element(By.ID, "clave").send_keys(clave)
        driver.find_element(By.XPATH, "//button[contains(text(), 'Acceder')]").click()
        time.sleep(5)

        # 2. NAVEGAR A REPORTES
        _avisar(paso_desc="Accediendo al módulo de Reportes...", log="Navegando al menú de Reportes...")
        try:
            link_reportes = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//span[contains(text(), 'Reportes')]/parent::a")
            ))
            link_reportes.click()
            time.sleep(3)
        except Exception:
            driver.get(URL_PANEL)

        # 3. DESCARGAR LOS REPORTES
        total_botones = len(_BOTONES_REPORTES)
        for idx, (boton_id, prefijo, tipo) in enumerate(_BOTONES_REPORTES):
            try:
                antes = _archivos_xls(DOWNLOAD_DIR)
                btn = wait.until(EC.element_to_be_clickable((By.ID, boton_id)))
                btn.click()
                _avisar(
                    paso_desc=f"Descargando reporte: {prefijo}...",
                    progreso_pct=10 + int((idx + 1) * (35 / total_botones)),
                    log=f"Solicitando descarga de '{boton_id}'...",
                )
                archivo = _esperar_descarga(DOWNLOAD_DIR, antes, timeout=90)
                if archivo:
                    destino = DOWNLOAD_DIR / f"{prefijo}{archivo.suffix.lower()}"
                    if destino.exists():
                        destino.unlink()
                    archivo.rename(destino)
                    archivos[tipo] = destino
                    _avisar(log=f"✅ Descargado: {destino.name}")
                else:
                    _avisar(log=f"⚠️ No se detectó la descarga de '{boton_id}'.")
            except Exception as exc:
                _avisar(log=f"⚠️ Error con el botón '{boton_id}': {exc}")

        return archivos
    finally:
        if driver is not None:
            driver.quit()


# ---------------------------------------------------------------------------
# Carga a Django
# ---------------------------------------------------------------------------

def _setup_django():
    import sys
    import django
    sys.path.insert(0, str(RUTA_PANEL.parent.parent.parent / "backend"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    django.setup()


def _archivos_locales_mas_recientes():
    """Si no se acaba de descargar, busca los últimos archivos por prefijo en DOWNLOAD_DIR."""
    archivos = {}
    for _, prefijo, tipo in _BOTONES_REPORTES:
        candidatos = sorted(
            DOWNLOAD_DIR.glob(f"{prefijo}*.xls*"),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
        if candidatos:
            archivos[tipo] = candidatos[0]
    return archivos


def cargar_formularios_a_django(archivos=None, progress_callback=None):
    """
    Lee los reportes (recién descargados o los más recientes en disco) y los **sincroniza**
    con la base de datos mediante upsert (`update_or_create`) por clave compuesta — nunca
    borra registros: la base acumula años de formularios y cada descarga del Panel solo
    trae un subconjunto (p.ej. el año en curso), así que un DELETE+bulk_create destruiría
    historial.

    Claves de coincidencia ("¿es el mismo FSC que ya tengo?"):
      - FormularioFSC / FormularioFSCDerivado → folio + anho + unidad_requirente + fecha_solicitud
      - FormularioFSCProducto                 → folio + anho + tipo_formulario + categoria + producto + descripcion

    Se eligieron estas combinaciones tras inspeccionar los xls reales: ni "folio" ni
    "folio + anho" identifican un FSC de forma única (se reasignan por unidad/año), pero
    sumando unidad_requirente + fecha_solicitud la colisión baja a ~0.4% de las filas.
    Esos pocos casos ambiguos se resuelven actualizando la primera coincidencia (ver _upsert).

    Si encuentra coincidencia → actualiza sus campos (lo "edita"); si no la encuentra →
    lo inserta como nuevo; los registros que no aparecen en la descarga actual quedan intactos.
    """
    _setup_django()
    import math
    import pandas as pd
    from django.core.exceptions import MultipleObjectsReturned
    from django.db import transaction, close_old_connections
    from datetime import date
    from api.models import FormularioFSC, FormularioFSCDerivado, FormularioFSCProducto, FormularioFSCEstadoLog

    def _avisar(log=None, paso_desc=None, progreso_pct=None):
        if progress_callback:
            progress_callback(log=log, paso_desc=paso_desc, progreso_pct=progreso_pct)

    archivos = archivos or _archivos_locales_mas_recientes()
    if not archivos:
        raise FileNotFoundError(f"No hay reportes FSC descargados en {DOWNLOAD_DIR}")

    def _to_int_monto(v):
        try:
            if v is None or (isinstance(v, float) and math.isnan(v)):
                return None
            return int(str(v).strip().replace(".", "").replace(",", "") or 0)
        except Exception:
            return None

    def _to_int(v):
        try:
            if v is None or (isinstance(v, float) and math.isnan(v)):
                return None
            return int(v)
        except Exception:
            return None

    def _to_str(v):
        s = str(v).strip() if v is not None else ""
        return s if s not in ("nan", "None", "") else None

    def _upsert(modelo, lookup, defaults):
        """update_or_create tolerante a colisiones de clave (raras, pero existen en el origen).

        Devuelve (objeto, creado) — el objeto se necesita para registrar el
        historial de bandejas de visación (ver _registrar_cambio_estado).
        """
        try:
            obj, creado = modelo.objects.update_or_create(defaults=defaults, **lookup)
            return obj, creado
        except MultipleObjectsReturned:
            obj = modelo.objects.filter(**lookup).first()
            for campo, valor in defaults.items():
                setattr(obj, campo, valor)
            obj.save(update_fields=list(defaults.keys()))
            return obj, False

    hoy = date.today()

    def _registrar_cambio_estado(fsc):
        """Agrega una entrada al historial de bandejas SOLO si el estado cambió desde
        la última vez que se vio este FSC (o si nunca se había registrado).

        El Panel SSO no expone historial de cambios de estado — esta es la única forma
        de empezar a construirlo: comparando snapshot actual vs. el último guardado.
        No reconstruye el pasado, pero desde 2026-06-08 en adelante permite calcular
        cuántos días pasó un FSC en cada bandeja de visación.
        """
        if not fsc.estado:
            return
        ultimo = fsc.historial_estados.order_by('-fecha_registro').first()
        if ultimo is None or ultimo.estado != fsc.estado:
            FormularioFSCEstadoLog.objects.create(formulario=fsc, estado=fsc.estado, fecha_registro=hoy)

    columnas_fsc = [
        "fecha_solicitud", "folio", "formulario", "anho", "unidad_requirente",
        "usuario_requirente", "anexo", "correo", "encargado", "jefe",
        "requerimiento", "fecha_entrega", "objetivo_compra", "especificaciones_tecnicas",
        "cotizacion", "monto_estimado", "moneda", "tipo_monto", "plan_anual",
        "id_plan", "justificacion", "validacion_tecnica", "unidad_validadora",
        "justificacion_no_validacion", "fuente_financiamiento", "estado",
    ]
    columnas_derivado = columnas_fsc + [
        "fecha_derivado", "comprador", "estado_compra", "item_presupuestario", "folio_requerimiento",
    ]
    columnas_producto = [
        "folio", "tipo_formulario", "anho", "categoria", "producto",
        "monto", "cantidad", "descripcion", "item_presupuestario",
    ]

    def _campos_comunes(row):
        return dict(
            fecha_solicitud=_to_str(row["fecha_solicitud"]),
            folio=_to_int(row["folio"]) or 0,
            formulario=_to_str(row["formulario"]),
            anho=_to_int(row["anho"]) or 0,
            unidad_requirente=_to_str(row["unidad_requirente"]),
            usuario_requirente=_to_str(row["usuario_requirente"]),
            anexo=_to_int(row["anexo"]),
            correo=_to_str(row["correo"]),
            encargado=_to_str(row["encargado"]),
            jefe=_to_str(row["jefe"]),
            requerimiento=_to_str(row["requerimiento"]),
            fecha_entrega=_to_str(row["fecha_entrega"]),
            objetivo_compra=_to_str(row["objetivo_compra"]),
            especificaciones_tecnicas=_to_str(row["especificaciones_tecnicas"]),
            cotizacion=_to_str(row["cotizacion"]),
            monto_estimado=_to_int_monto(row["monto_estimado"]),
            moneda=_to_str(row["moneda"]),
            tipo_monto=_to_str(row["tipo_monto"]),
            plan_anual=_to_str(row["plan_anual"]),
            id_plan=_to_str(row["id_plan"]),
            justificacion=_to_str(row["justificacion"]),
            validacion_tecnica=_to_str(row["validacion_tecnica"]),
            unidad_validadora=_to_str(row["unidad_validadora"]),
            justificacion_no_validacion=_to_str(row["justificacion_no_validacion"]),
            fuente_financiamiento=_to_str(row["fuente_financiamiento"]),
            estado=_to_str(row["estado"]),
        )

    def _clave_fsc(campos):
        """Extrae folio/anho/unidad_requirente/fecha_solicitud como lookup; deja el resto como defaults."""
        return {
            "folio": campos.pop("folio"),
            "anho": campos.pop("anho"),
            "unidad_requirente": campos.pop("unidad_requirente"),
            "fecha_solicitud": campos.pop("fecha_solicitud"),
        }

    resumen = {
        "fsc": {"nuevos": 0, "actualizados": 0},
        "derivados": {"nuevos": 0, "actualizados": 0},
        "carro": {"nuevos": 0, "actualizados": 0},
    }

    close_old_connections()

    if "fsc" in archivos:
        tabla = pd.read_html(str(archivos["fsc"]))[0]
        tabla.columns = columnas_fsc
        _avisar(paso_desc=f"Sincronizando {len(tabla)} formularios FSC...", progreso_pct=55)
        with transaction.atomic():
            for i, (_, row) in enumerate(tabla.iterrows()):
                campos = _campos_comunes(row)
                lookup = _clave_fsc(campos)
                fsc, creado = _upsert(FormularioFSC, lookup, campos)
                _registrar_cambio_estado(fsc)
                resumen["fsc"]["nuevos" if creado else "actualizados"] += 1
                if (i + 1) % 300 == 0:
                    _avisar(log=f"FSC: {i + 1}/{len(tabla)} procesados...")
        _avisar(log=f"FSC → {resumen['fsc']['nuevos']} nuevos, {resumen['fsc']['actualizados']} actualizados.")

    if "derivados" in archivos:
        tabla = pd.read_html(str(archivos["derivados"]))[0]
        tabla.columns = columnas_derivado
        _avisar(paso_desc=f"Sincronizando {len(tabla)} formularios derivados...", progreso_pct=72)
        with transaction.atomic():
            for i, (_, row) in enumerate(tabla.iterrows()):
                campos = _campos_comunes(row)
                lookup = _clave_fsc(campos)
                campos.update(
                    fecha_derivado=_to_str(row["fecha_derivado"]),
                    comprador=_to_str(row["comprador"]),
                    estado_compra=_to_str(row["estado_compra"]),
                    item_presupuestario=_to_str(row["item_presupuestario"]),
                    folio_requerimiento=_to_str(row["folio_requerimiento"]),
                )
                _, creado = _upsert(FormularioFSCDerivado, lookup, campos)
                resumen["derivados"]["nuevos" if creado else "actualizados"] += 1
                if (i + 1) % 300 == 0:
                    _avisar(log=f"Derivados: {i + 1}/{len(tabla)} procesados...")
        _avisar(log=f"Derivados → {resumen['derivados']['nuevos']} nuevos, {resumen['derivados']['actualizados']} actualizados.")

    if "carro" in archivos:
        tabla = pd.read_html(str(archivos["carro"]))[0]
        tabla.columns = columnas_producto
        _avisar(paso_desc=f"Sincronizando {len(tabla)} líneas de productos...", progreso_pct=88)
        with transaction.atomic():
            for i, (_, row) in enumerate(tabla.iterrows()):
                lookup = {
                    "folio": _to_int(row["folio"]) or 0,
                    "anho": _to_int(row["anho"]) or 0,
                    "tipo_formulario": _to_int(row["tipo_formulario"]),
                    "categoria": _to_str(row["categoria"]),
                    "producto": _to_str(row["producto"]),
                    "descripcion": _to_str(row["descripcion"]),
                }
                defaults = dict(
                    monto=_to_int_monto(row["monto"]),
                    cantidad=_to_int(row["cantidad"]),
                    item_presupuestario=_to_str(row["item_presupuestario"]),
                )
                _, creado = _upsert(FormularioFSCProducto, lookup, defaults)
                resumen["carro"]["nuevos" if creado else "actualizados"] += 1
                if (i + 1) % 500 == 0:
                    _avisar(log=f"Carro: {i + 1}/{len(tabla)} procesados...")
        _avisar(log=f"Carro → {resumen['carro']['nuevos']} nuevos, {resumen['carro']['actualizados']} actualizados.")

    total_nuevos = sum(r["nuevos"] for r in resumen.values())
    total_actualizados = sum(r["actualizados"] for r in resumen.values())
    total = total_nuevos + total_actualizados
    _avisar(
        log=f"✅ Sincronización completa: {total_nuevos} nuevos, {total_actualizados} actualizados "
            f"({total} procesados). El historial existente no se eliminó.",
        progreso_pct=100,
    )
    return {
        "fsc": resumen["fsc"],
        "derivados": resumen["derivados"],
        "carro": resumen["carro"],
        "nuevos": total_nuevos,
        "actualizados": total_actualizados,
        "total": total,
    }


def ejecutar_proceso_completo(rut=None, dv=None, clave=None, progress_callback=None):
    """Descarga los 3 reportes y los carga a Django — punto de entrada usado por el dashboard."""
    if not (rut and dv and clave):
        rut_env, dv_env, clave_env = _credenciales_por_defecto()
        rut, dv, clave = rut or rut_env, dv or dv_env, clave or clave_env
    if not (rut and dv and clave):
        raise ValueError(
            "Faltan credenciales del Panel SS Osorno. Defina PANEL_SSO_RUT, PANEL_SSO_DV "
            "y PANEL_SSO_CLAVE como variables de entorno, o pase rut/dv/clave explícitamente."
        )

    archivos = descargar_reportes_panel(rut, dv, clave, progress_callback=progress_callback)
    if not archivos:
        raise RuntimeError("No se pudo descargar ningún reporte desde el Panel SS Osorno.")
    return cargar_formularios_a_django(archivos, progress_callback=progress_callback)


if __name__ == "__main__":
    print("=" * 60)
    print(" Descarga y carga de Formularios FSC — Panel SS Osorno")
    print("=" * 60)
    print("1. Descargar reportes y cargar a Django")
    print("2. Solo descargar reportes")
    print("3. Solo cargar a Django (usa los archivos más recientes en disco)")
    opcion = input("Seleccione una opción: ").strip()

    if opcion == "1":
        rut_in = input("RUT (sin DV): ").strip() or None
        dv_in = input("DV: ").strip() or None
        clave_in = input("Contraseña: ").strip() or None
        resumen = ejecutar_proceso_completo(rut_in, dv_in, clave_in, progress_callback=lambda **kw: print(kw.get("log") or kw.get("paso_desc") or ""))
        print(f"\nResumen: {resumen}")
    elif opcion == "2":
        rut_in = input("RUT (sin DV): ").strip()
        dv_in = input("DV: ").strip()
        clave_in = input("Contraseña: ").strip()
        archivos = descargar_reportes_panel(rut_in, dv_in, clave_in, progress_callback=lambda **kw: print(kw.get("log") or kw.get("paso_desc") or ""))
        print(f"\nArchivos descargados: {archivos}")
    elif opcion == "3":
        resumen = cargar_formularios_a_django(progress_callback=lambda **kw: print(kw.get("log") or kw.get("paso_desc") or ""))
        print(f"\nResumen: {resumen}")
    else:
        print("Opción inválida.")
