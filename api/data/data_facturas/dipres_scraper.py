#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dipres_scraper.py  (v2 - menu interactivo)
==========================================
Descarga automatizada de reportes de Documentos Recibidos desde el portal
DIPRES / Acepta (https://dipres.acepta.com).

NOVEDADES v2
------------
  * Menu interactivo: se ejecuta sin argumentos.
  * Detecta el alert() nativo "Comenzaremos a trabajar en su reporte" como
    confirmacion de que el export quedo encolado. Si no aparece -> aborta.
  * Filtro adicional por Estado Devengo.
  * Vuelve al menu al terminar cada descarga.

REQUISITOS
----------
    pip install playwright
    playwright install chromium

CREDENCIALES
------------
    Nunca se escriben en este archivo. Variables de entorno opcionales:
        DIPRES_RUT, DIPRES_PASS
    Si no existen, se piden por consola (la pass no se muestra en pantalla).

USO
---
    python dipres_scraper.py

    Modo directo (sin menu, para automatizar despues):
    python dipres_scraper.py --desde 2026-08-01 --hasta 2026-08-05

NOTA
----
    Este script NO evade el reCAPTCHA. Depende de que un humano lo resuelva
    una sola vez; la sesion queda en el perfil persistente ./.perfil_dipres
"""

from __future__ import annotations

import argparse
import csv
import getpass
import io
import os
import re
import sys
import time
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

try:
    from playwright.sync_api import (
        sync_playwright, Page, BrowserContext,
        TimeoutError as PWTimeout,
    )
except ImportError:
    sys.exit("Falta Playwright.\n  pip install playwright\n  playwright install chromium")

# ---------------------------------------------------------------------------
# CONFIGURACION
# ---------------------------------------------------------------------------

BASE_URL = "https://dipres.acepta.com/"
# Anclado a la carpeta del script (no al cwd): necesario para que las corridas
# lanzadas desde un hilo Django (cwd = backend/ u otro) usen siempre el mismo
# perfil persistente y la misma carpeta de descargas que el uso interactivo.
CARPETA = Path(__file__).parent.resolve()
PERFIL_DIR = (CARPETA / ".perfil_dipres").resolve()
SALIDA_DIR = (CARPETA / "descargas_dipres").resolve()

SEL_LOGIN_RUT = 'input[name="LoginForm[rut]"]'
SEL_LOGIN_PASS = 'input[type="password"]'
SEL_BTN_INGRESAR = 'button.g-recaptcha'
SEL_FORM_HOME = 'input[name="FSTART"]'
SEL_BTN_BUSCAR = 'input[name="buscar2"]'
SEL_BTN_EXPORTAR = 'input[name="Exportar"]'
SEL_MENU_REPORTES = 'a:has-text("Reportes")'
SEL_TABLA_REPORTES = '#tabla_grilla_reportesNEW'

# Spinner que el portal inyecta reemplazando el boton mientras la peticion
# esta en vuelo (ver el script attrchange() del propio portal).
SEL_SPINNER_BUSCAR = '#spin_buscar2'
# Grilla de resultados de la busqueda. El div se llama grilla_buscarNEW_recibidos,
# asi que la tabla deberia seguir el mismo patron que tabla_grilla_reportesNEW.
# Se usa solo como senal blanda: si no aparece, no se aborta.
SEL_TABLA_RESULTADOS = '#tabla_grilla_buscarNEW_recibidos'

# Texto del alert() nativo que confirma que el reporte quedo encolado.
FRASE_CONFIRMACION = "comenzaremos a trabajar"

TIMEOUT_LOGIN_MANUAL_S = 300
TIMEOUT_EXPORTAR_S = 180
TIMEOUT_REPORTE_S = 1800
INTERVALO_POLL_S = 15

TIPOS_FECHA = {
    "1": ("Recepcion", "Recepcion Custodia"),
    "2": ("Emision", "Emision"),
    "3": ("recepcion_sii", "Recepcion SII"),
}

TIPOS_DTE = {
    "1": ("*", "Todos DTE"),
    "2": ("33", "Factura Electronica"),
    "3": ("34", "Factura No Afecta o Exenta"),
    "4": ("56", "Nota de Debito"),
    "5": ("61", "Nota de Credito"),
}

ESTADOS_DOC = {
    "1": ("REMI", "Documento Recibido (Todos)"),
    "2": ("RASI", "Aceptado por el SII"),
    "3": ("RRSI", "Rechazado por el SII"),
    "4": ("RRE0", "Documento No Revisado"),
    "5": ("RRE1", "Documento Revisado"),
    "6": ("RACS", "Documentos Cedidos"),
    "7": ("", "Sin filtro de estado"),
}

ESTADOS_DEVENGO = {
    "1": ("", "Sin filtro"),
    "2": ("FINALIZADO_SIN_ERRORES", "Finalizado sin Errores"),
    "3": ("FINALIZADO_CON_ERRORES", "Finalizado con Errores"),
    "4": ("EN_PROCESO", "En Proceso"),
    "5": ("NO_ENVIADO", "No Enviado"),
    "6": ("BORRADOR", "Borrador"),
    "7": ("MANUAL_SIGFE", "Manual SIGFE"),
    "8": ("EXTRA_PRESUPUESTARIO", "Extra Presupuestario"),
    "9": ("REPROCESO", "Para Reprocesar"),
}


# ---------------------------------------------------------------------------
# MODELO
# ---------------------------------------------------------------------------

@dataclass
class FilaReporte:
    id: str
    fecha: str
    canal: str
    filtros: str
    total_registros: str
    estado: str
    rut_usuario: str
    href_descarga: str | None

    @property
    def listo(self) -> bool:
        return self.estado.strip().upper() == "OK" and bool(self.href_descarga)


@dataclass
class Opciones:
    tipo_fecha: str = "Recepcion"
    tipo_dte: str = "*"
    estado: str = "REMI"
    estado_devengo: str = ""
    rut_emisor: str = ""
    chunk_dias: int = 0
    unir: bool = False
    conservar_zip: bool = False
    headless: bool = False
    salida: Path = field(default_factory=lambda: SALIDA_DIR)


@dataclass
class Criterios:
    fstart: str
    fend: str
    op: Opciones


# ---------------------------------------------------------------------------
# UTILIDADES DE CONSOLA
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def _avisar(progress_callback, paso: str, paso_desc: str, progreso_pct: int,
            mensaje: str | None = None) -> None:
    """Reporta progreso al callback opcional (patrón usado por sigfe_descarga_devengos_Completo.py).

    No debe interrumpir el flujo si el callback falla.
    """
    log(mensaje or paso_desc)
    if progress_callback:
        try:
            progress_callback(paso, paso_desc, progreso_pct, mensaje or paso_desc)
        except Exception:
            pass


def titulo(txt: str) -> None:
    print("\n" + "=" * 64)
    print(f"  {txt}")
    print("=" * 64)


def pedir(texto: str, default: str = "") -> str:
    suf = f" [{default}]" if default else ""
    val = input(f"{texto}{suf}: ").strip()
    return val or default


def pedir_opcion(texto: str, opciones: dict, default: str) -> tuple[str, str]:
    print(f"\n{texto}")
    for k, (_, desc) in opciones.items():
        marca = " <-- actual" if opciones[k][0] == default else ""
        print(f"   {k}) {desc}{marca}")
    while True:
        sel = input("   Opcion: ").strip()
        if not sel:
            for cod, desc in opciones.values():
                if cod == default:
                    return cod, desc
            return default, default
        if sel in opciones:
            return opciones[sel]
        print("   Opcion invalida.")


def pedir_si_no(texto: str, default: bool = False) -> bool:
    d = "S/n" if default else "s/N"
    val = input(f"{texto} [{d}]: ").strip().lower()
    if not val:
        return default
    return val in ("s", "si", "sí", "y", "yes")


def parse_fecha(txt: str) -> date | None:
    txt = txt.strip().lower()
    hoy = date.today()
    if txt in ("hoy", "today"):
        return hoy
    if txt == "ayer":
        return hoy - timedelta(days=1)
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(txt, fmt).date()
        except ValueError:
            continue
    return None


def pedir_fecha(texto: str, default: date | None = None) -> date:
    while True:
        crudo = pedir(texto + " (YYYY-MM-DD | dd-mm-yyyy | hoy | ayer)",
                      default.isoformat() if default else "")
        f = parse_fecha(crudo)
        if f:
            return f
        print("   Fecha invalida.")


def primer_dia(d: date) -> date:
    return d.replace(day=1)


def ultimo_dia(d: date) -> date:
    if d.month == 12:
        return d.replace(day=31)
    return d.replace(month=d.month + 1, day=1) - timedelta(days=1)


# ---------------------------------------------------------------------------
# UTILIDADES DE DATOS
# ---------------------------------------------------------------------------

def normalizar_id(txt: str) -> str:
    return re.sub(r"\D", "", txt or "")


def normalizar_rut(txt: str) -> str:
    return re.sub(r"[^0-9kK]", "", (txt or "")).upper()


def variantes_rut(txt: str) -> set[str]:
    """
    El portal es inconsistente con el digito verificador:
      - JSON de sesion : "13522489"     (SIN DV)
      - grilla HTML    : "13.522.489-8" (CON DV)
    Genera ambas formas para poder comparar.
    """
    s = normalizar_rut(txt)
    if not s:
        return set()
    v = {s}
    if len(s) >= 8:
        v.add(s[:-1])                      # quitar posible DV
    if "-" in (txt or ""):
        cuerpo = normalizar_rut(txt.split("-")[0])
        if cuerpo:
            v.add(cuerpo)
    return {x for x in v if len(x) >= 7}


def rut_coincide(a: str, b: str) -> bool:
    if not a or not b:
        return False
    return bool(variantes_rut(a) & variantes_rut(b))


def credenciales() -> tuple[str, str]:
    rut = os.environ.get("DIPRES_RUT") or input("RUT (ej 12345678-9): ").strip()
    pwd = os.environ.get("DIPRES_PASS") or getpass.getpass("Password: ")
    if not rut or not pwd:
        raise RuntimeError("Faltan credenciales.")
    return rut, pwd


def frame_con(page: Page, selector: str, timeout_s: int = 30, visible: bool = False):
    """
    El portal usa ext.php?r=<url>, probable iframe. Busca en todos los frames.

    visible=True es CRITICO para los botones: el portal alterna elementos con
    'display', asi que query_selector() encuentra botones ocultos que aun no
    estan listos. Sin este chequeo se hace click sobre elementos invisibles.
    """
    limite = time.time() + timeout_s
    while time.time() < limite:
        for fr in page.frames:
            try:
                el = fr.query_selector(selector)
                if el and (not visible or el.is_visible()):
                    return fr
            except Exception:
                continue
        page.wait_for_timeout(500)
    return None


def esperar_spinner(page: Page, selector: str, timeout_s: int = 180) -> None:
    """
    Espera a que desaparezca el spinner que el portal inyecta durante una
    peticion. Si nunca aparece, no pasa nada (la respuesta pudo ser inmediata).
    """
    apareció = False
    limite = time.time() + 5
    while time.time() < limite:
        if frame_con(page, selector, timeout_s=1, visible=True):
            apareció = True
            break

    if not apareció:
        return

    log("Peticion en curso (spinner activo)...")
    limite = time.time() + timeout_s
    while time.time() < limite:
        if not frame_con(page, selector, timeout_s=1, visible=True):
            log("Spinner liberado.")
            return
        page.wait_for_timeout(1000)
    log("ADVERTENCIA: el spinner sigue activo tras el timeout.")


# ---------------------------------------------------------------------------
# LOGIN
# ---------------------------------------------------------------------------

def asegurar_sesion(page: Page, headless: bool,
                    usuario: str | None = None, password: str | None = None) -> None:
    """
    usuario/password: si se pasan (llamadas programaticas, ej. desde el hilo Django),
    se usan directo y NUNCA se cae a input()/getpass() -- eso colgaria un hilo del
    servidor esperando stdin. Sin ellos, se comporta como siempre (env vars o consola).
    """
    log("Abriendo portal...")
    page.goto(BASE_URL, wait_until="domcontentloaded")

    if frame_con(page, SEL_FORM_HOME, timeout_s=8):
        log("Sesion persistente activa. No se requiere login.")
        return

    fr_login = frame_con(page, SEL_LOGIN_RUT, timeout_s=15)
    if not fr_login:
        raise RuntimeError(
            "No encuentro el formulario de busqueda ni el de login. "
            "El DOM del portal pudo cambiar."
        )

    if headless:
        raise RuntimeError(
            "La sesion expiro y estas en modo headless. El reCAPTCHA invisible "
            "no se resuelve sin navegador visible. Corre una vez en modo visible "
            "con acceso directo a la maquina (esto no se puede resolver via web)."
        )

    if usuario and password:
        rut, pwd = usuario, password
    else:
        rut, pwd = credenciales()
    log("Completando formulario de login...")
    fr_login.fill(SEL_LOGIN_RUT, rut)

    pass_sel = SEL_LOGIN_PASS
    if not fr_login.query_selector(pass_sel):
        pass_sel = 'input[name="LoginForm[password]"]'
    fr_login.fill(pass_sel, pwd)

    log("Click en Ingresar (dispara reCAPTCHA invisible)...")
    try:
        fr_login.click(SEL_BTN_INGRESAR, timeout=10_000)
    except PWTimeout:
        fr_login.click('button:has-text("Ingresar")', timeout=10_000)

    log(f"Esperando ingreso (hasta {TIMEOUT_LOGIN_MANUAL_S}s).")
    log(">>> Si aparece un desafio de reCAPTCHA, resuelvelo TU en la ventana. <<<")

    if not frame_con(page, SEL_FORM_HOME, timeout_s=TIMEOUT_LOGIN_MANUAL_S):
        raise RuntimeError("No se completo el ingreso dentro del tiempo permitido.")

    log("Ingreso confirmado.")


def contexto_sesion(page: Page) -> dict:
    datos: dict[str, str] = {}
    fr = frame_con(page, "#uri_params", timeout_s=10)
    if not fr:
        return datos
    val = fr.get_attribute("#uri_params", "value") or ""
    for clave in ("session_id", "rutUsuario", "rutCliente", "aplicacion"):
        m = re.search(rf"{clave}=([^%&]+)", val)
        if m:
            datos[clave] = m.group(1)
    return datos


# ---------------------------------------------------------------------------
# BUSQUEDA + EXPORTACION
# ---------------------------------------------------------------------------

def lanzar_exportacion(page: Page, c: Criterios, buzon: list[str]) -> None:
    """
    Llena el formulario, busca y exporta.
    'buzon' acumula los mensajes de los alert() nativos capturados.
    """
    fr = frame_con(page, SEL_BTN_BUSCAR, timeout_s=30)
    if not fr:
        raise RuntimeError("No encuentro el formulario de busqueda.")

    op = c.op
    log(f"Filtros: {c.fstart} -> {c.fend} | tipo_fecha={op.tipo_fecha} "
        f"| dte={op.tipo_dte} | estado={op.estado or '-'} "
        f"| devengo={op.estado_devengo or '-'}")

    fr.fill('input[name="FSTART"]', c.fstart)
    fr.fill('input[name="FEND"]', c.fend)
    fr.select_option('select[name="TIPO_FECHA"]', op.tipo_fecha)
    fr.select_option('select[name="TIPO_DTE"]', op.tipo_dte)
    if op.estado:
        fr.select_option('select[name="ESTADO"]', op.estado)
    if op.estado_devengo:
        fr.select_option('select[name="ESTADO_DEVENGO"]', op.estado_devengo)
    if op.rut_emisor:
        fr.fill('input[name="RUT_EMISOR"]', op.rut_emisor)

    log("Click en Buscar...")
    fr.click(SEL_BTN_BUSCAR)

    # 1) El portal reemplaza el boton por un spinner mientras consulta.
    esperar_spinner(page, SEL_SPINNER_BUSCAR, TIMEOUT_EXPORTAR_S)

    # 2) Senal blanda: la grilla de resultados. Si el id no coincide con lo
    #    esperado, no se aborta; el criterio duro es el boton Exportar.
    fr_grilla = frame_con(page, SEL_TABLA_RESULTADOS, timeout_s=20, visible=True)
    if fr_grilla:
        filas = fr_grilla.query_selector_all(f"{SEL_TABLA_RESULTADOS} tbody tr")
        log(f"Grilla de resultados cargada ({len(filas)} fila(s) en pantalla).")
    else:
        log("No identifique la grilla de resultados por id. "
            "Sigo con el boton Exportar como criterio.")

    # 3) Criterio duro: el boton Exportar VISIBLE (no solo presente en el DOM).
    log(f"Esperando boton Exportar visible (hasta {TIMEOUT_EXPORTAR_S}s)...")
    fr2 = frame_con(page, SEL_BTN_EXPORTAR, timeout_s=TIMEOUT_EXPORTAR_S, visible=True)
    if not fr2:
        if frame_con(page, SEL_BTN_EXPORTAR, timeout_s=2):
            raise RuntimeError(
                "El boton Exportar existe en el DOM pero nunca se hizo visible. "
                "La busqueda probablemente no devolvio registros para ese filtro."
            )
        raise RuntimeError(
            "El boton Exportar nunca aparecio. Causas probables: la busqueda no "
            "devolvio registros, o el servidor demoro mas de lo previsto."
        )

    marca = len(buzon)
    log("Boton Exportar disponible. Click...")
    # wait_for_selector con state=visible deja que Playwright verifique
    # actionability (visible, estable, habilitado) antes del click.
    fr2.wait_for_selector(SEL_BTN_EXPORTAR, state="visible", timeout=30_000)
    fr2.click(SEL_BTN_EXPORTAR)

    # El portal responde con un alert() nativo:
    #   "Comenzaremos a trabajar en su reporte, estara en minutos
    #    en la seccion de Reportes"
    limite = time.time() + 30
    while time.time() < limite and len(buzon) == marca:
        page.wait_for_timeout(500)

    nuevos = buzon[marca:]
    if not nuevos:
        raise RuntimeError(
            "El portal no confirmo el encolado (no llego el alert esperado). "
            "Aborto para no quedar esperando un reporte que nunca se genero."
        )

    for m in nuevos:
        log(f"Portal dice: {m}")

    if not any(FRASE_CONFIRMACION in m.lower() for m in nuevos):
        log("ADVERTENCIA: el mensaje del portal no es el de confirmacion habitual.")


# ---------------------------------------------------------------------------
# GRILLA DE REPORTES
# ---------------------------------------------------------------------------

def href_reportes(page: Page) -> str | None:
    """
    Lee el href REAL del menu 'Reportes' desde una pestana YA autenticada.

    Es imprescindible: el portal lleva el session_id dentro de la URL
    (ext.php?r=...&session_id=...), y ademas emite un session_id distinto por
    pantalla. Un goto(BASE_URL) limpio en otra pestana cae en el login.
    """
    for fr in page.frames:
        try:
            a = fr.query_selector(SEL_MENU_REPORTES)
            if not a:
                continue
            href = a.get_attribute("href")
            if not href or href in ("#", ""):
                continue
            base = fr.url if fr.url and fr.url != "about:blank" else page.url
            absoluta = urljoin(base, href)
            log(f"URL de Reportes capturada desde la sesion activa.")
            return absoluta
        except Exception:
            continue
    return None


def abrir_reportes(page: Page, url: str | None = None) -> None:
    """
    Deja ESTA pestana en la grilla de Reportes.
    Prioriza la URL autenticada; si falla, cae al click sobre el menu.
    """
    if url:
        page.goto(url, wait_until="domcontentloaded")
        if frame_con(page, SEL_TABLA_REPORTES, timeout_s=60):
            return
        if frame_con(page, SEL_LOGIN_RUT, timeout_s=3):
            raise RuntimeError(
                "La pestana de Reportes cayo en la pantalla de login. "
                "El session_id de la URL no fue aceptado en una pestana nueva. "
                "Reporta esto: hay que volver al modo de pestana unica."
            )

    if not frame_con(page, SEL_MENU_REPORTES, timeout_s=3):
        page.goto(BASE_URL, wait_until="domcontentloaded")

    try:
        page.click(SEL_MENU_REPORTES, timeout=10_000)
    except PWTimeout:
        fr = frame_con(page, SEL_MENU_REPORTES, timeout_s=10)
        if not fr:
            raise RuntimeError("No encuentro el enlace del menu 'Reportes'.")
        fr.click(SEL_MENU_REPORTES)

    if not frame_con(page, SEL_TABLA_REPORTES, timeout_s=60):
        raise RuntimeError("La grilla de reportes no cargo.")


def refrescar_grilla(page: Page, url: str | None = None) -> None:
    """Recarga la grilla. reload() conserva la URL con su session_id."""
    try:
        page.reload(wait_until="domcontentloaded")
        if frame_con(page, SEL_TABLA_REPORTES, timeout_s=45):
            return
    except Exception:
        pass
    abrir_reportes(page, url)


def leer_grilla(page: Page) -> list[FilaReporte]:
    fr = frame_con(page, SEL_TABLA_REPORTES, timeout_s=30)
    if not fr:
        return []
    filas: list[FilaReporte] = []
    for tr in fr.query_selector_all(f"{SEL_TABLA_REPORTES} tbody tr"):
        def campo(nombre: str) -> str:
            el = tr.query_selector(f'td[data-campo="{nombre}"]')
            return (el.inner_text().strip() if el else "")

        rid = normalizar_id(campo("id"))
        if not rid:
            continue

        a = tr.query_selector('a[id*="Descargargrilla_reportesNEW"]')
        href = a.get_attribute("href") if a else None
        if href in ("", "#"):
            href = None

        filas.append(FilaReporte(
            id=rid,
            fecha=campo("fecha"),
            canal=campo("canal"),
            filtros=campo("filtros"),
            total_registros=campo("total_registros"),
            estado=campo("estado"),
            rut_usuario=campo("rut_usuario"),   # crudo: "13.522.489-8"
            href_descarga=href,
        ))
    return filas


def elegir_reporte(nuevos: list[FilaReporte], crit: Criterios,
                   rut_propio: str) -> FilaReporte | None:
    """
    Cascada de criterios, del mas fuerte al mas debil:

      1. La columna FILTROS contiene 'Desde=<fstart>' y 'Hasta=<fend>'.
         Es el identificador mas confiable: describe ESTA exportacion.
         OJO: mientras el reporte se genera, FILTROS puede venir vacio.
      2. El RUT de la fila coincide con el propio (tolerando el DV).
      3. Como ultimo recurso, el ID mas alto (los IDs son secuenciales).
    """
    if not nuevos:
        return None

    por_fechas = [f for f in nuevos
                  if crit.fstart in f.filtros and crit.fend in f.filtros]
    if por_fechas:
        elegido = max(por_fechas, key=lambda f: int(f.id))
        log(f"Match por FILTROS ({crit.fstart} / {crit.fend}) -> ID {elegido.id}")
        return elegido

    por_rut = [f for f in nuevos if rut_coincide(f.rut_usuario, rut_propio)]
    if por_rut:
        elegido = max(por_rut, key=lambda f: int(f.id))
        log(f"Match por RUT ({elegido.rut_usuario}) -> ID {elegido.id}")
        return elegido

    elegido = max(nuevos, key=lambda f: int(f.id))
    log(f"ADVERTENCIA: ningun criterio fuerte coincidio. "
        f"Tomo el ID mas alto de los nuevos -> {elegido.id} "
        f"(rut fila: '{elegido.rut_usuario}', rut propio: '{rut_propio}')")
    return elegido


def esperar_reporte(page: Page, ids_previos: set[str], rut_propio: str,
                    crit: Criterios, url_rep: str | None = None,
                    progress_callback=None, pct_base: int = 10, pct_span: int = 70) -> FilaReporte:
    """
    Identifica el reporte por ID NUEVO + criterios de elegir_reporte().
    Nunca por posicion en la grilla: la grilla es compartida entre usuarios.
    'page' debe ser la pestana de Reportes, NO la del formulario.
    """
    limite = time.time() + TIMEOUT_REPORTE_S
    objetivo: str | None = None
    primera = True

    while time.time() < limite:
        if primera:
            primera = False
        else:
            time.sleep(INTERVALO_POLL_S)
        refrescar_grilla(page, url_rep)
        filas = leer_grilla(page)

        transcurrido = 1 - max(0.0, (limite - time.time())) / TIMEOUT_REPORTE_S
        pct = pct_base + int(pct_span * min(transcurrido, 0.95))

        if objetivo is None:
            nuevos = [f for f in filas if f.id not in ids_previos]
            elegido = elegir_reporte(nuevos, crit, rut_propio)
            if elegido:
                objetivo = elegido.id
            else:
                _avisar(progress_callback, "esperando", "Esperando que DIPRES genere el reporte...", pct,
                        f"Aun no aparece un reporte nuevo ({len(filas)} filas en grilla, 0 nuevas). Esperando...")

        if objetivo:
            fila = next((f for f in filas if f.id == objetivo), None)
            if fila:
                if fila.listo:
                    _avisar(progress_callback, "reporte_listo",
                            f"Reporte listo ({fila.total_registros} registros)", pct_base + pct_span,
                            f"Reporte {fila.id} LISTO ({fila.total_registros} registros).")
                    return fila
                if fila.estado.strip().upper() == "OK" and not fila.href_descarga:
                    _avisar(progress_callback, "esperando", "Esperando enlace de descarga...", pct,
                            f"Reporte {fila.id} dice OK pero no expone enlace de descarga todavia. Reintentando...")
                else:
                    _avisar(progress_callback, "esperando", f"Reporte en progreso: {fila.estado}", pct,
                            f"Reporte {fila.id} en progreso: estado='{fila.estado}'")

    raise TimeoutError(f"El reporte no quedo disponible en {TIMEOUT_REPORTE_S}s.")


# ---------------------------------------------------------------------------
# DESCARGA + EXTRACCION
# ---------------------------------------------------------------------------

def detectar_formato(datos: bytes) -> tuple[str, str, bool]:
    """
    Identifica el formato REAL por los bytes de cabecera, no por la extension.
    El portal entrega un enlace .csv.zip que en realidad contiene un .xls.

    Devuelve (extension, descripcion, es_binario).
    """
    if datos[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return ".xls", "Excel 97-2003 (OLE2/BIFF)", True
    if datos[:4] == b"PK\x03\x04":
        return ".xlsx", "Excel 2007+ (OOXML)", True

    cabeza = datos[:4096].lstrip()[:512].lower()
    if cabeza.startswith(b"<?xml") or b"<html" in cabeza or b"<table" in cabeza:
        # Caso frecuente en portales chilenos: tabla HTML con extension .xls.
        # Excel la abre, pero pandas/openpyxl fallan.
        return ".xls", "HTML disfrazado de Excel", False
    return ".csv", "texto plano (CSV/TSV)", False


def descargar_y_extraer(ctx: BrowserContext, fila: FilaReporte, destino: Path,
                        conservar_zip: bool = False) -> list[Path]:
    destino.mkdir(parents=True, exist_ok=True)
    log(f"Descargando {fila.href_descarga}")

    resp = ctx.request.get(fila.href_descarga, timeout=300_000)
    if not resp.ok:
        raise RuntimeError(f"Descarga fallida: HTTP {resp.status}")

    contenido = resp.body()
    zip_path = destino / f"reporte_{fila.id}.zip"
    zip_path.write_bytes(contenido)
    log(f"ZIP recibido ({len(contenido):,} bytes)")

    extraidos: list[Path] = []
    with zipfile.ZipFile(io.BytesIO(contenido)) as zf:
        internos = [n for n in zf.namelist() if not n.endswith("/")]
        if not internos:
            raise RuntimeError("El ZIP venia vacio.")

        for idx, nombre in enumerate(internos):
            datos = zf.read(nombre)
            ext, desc, binario = detectar_formato(datos)
            log(f"  '{nombre}' -> {desc}  ({len(datos):,} bytes)")

            sufijo = "" if len(internos) == 1 else f"_{idx + 1}"
            salida = destino / f"reporte_{fila.id}{sufijo}{ext}"

            if binario:
                # Excel real: se escribe tal cual. Decodificarlo lo corrompe.
                salida.write_bytes(datos)
            else:
                # Texto (CSV o HTML-como-xls): normalizar a UTF-8.
                salida.write_text(decodificar(datos), encoding="utf-8")

            extraidos.append(salida)
            log(f"  Guardado -> {salida.name}")

    if not conservar_zip:
        try:
            zip_path.unlink()
        except OSError:
            pass
    else:
        log(f"  ZIP conservado -> {zip_path.name}")

    return extraidos


def decodificar(crudo: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return crudo.decode(enc)
        except UnicodeDecodeError:
            continue
    return crudo.decode("latin-1", errors="replace")


def detectar_delimitador(texto: str) -> str:
    muestra = "\n".join(texto.splitlines()[:5])
    try:
        return csv.Sniffer().sniff(muestra, delimiters=";,\t|").delimiter
    except Exception:
        return ";"


def unir_archivos(archivos: list[Path], salida_base: Path) -> Path | None:
    """
    Consolida varios tramos en un solo archivo.
      - Todos texto (.csv)  -> concatena con el modulo csv (sin dependencias).
      - Hay binarios (.xls) -> requiere pandas + xlrd. Si faltan, avisa y no une.
    """
    if not archivos:
        return None

    exts = {a.suffix.lower() for a in archivos}
    binarios = [a for a in archivos
                if a.suffix.lower() in (".xls", ".xlsx")
                and a.read_bytes()[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"]

    if not binarios and exts <= {".csv", ".txt"}:
        return _unir_texto(archivos, salida_base.with_suffix(".csv"))

    try:
        import pandas as pd  # noqa: F401
    except ImportError:
        log("No puedo consolidar archivos Excel binarios sin pandas.")
        log("  Instala:  pip install pandas xlrd openpyxl")
        log("  Los archivos por tramo quedan disponibles por separado.")
        return None

    import pandas as pd
    marcos = []
    for a in archivos:
        try:
            marcos.append(pd.read_excel(a))
        except Exception as e:
            log(f"  No pude leer {a.name}: {e}")
    if not marcos:
        log("No se pudo leer ningun archivo para consolidar.")
        return None

    df = pd.concat(marcos, ignore_index=True)
    salida = salida_base.with_suffix(".xlsx")
    try:
        df.to_excel(salida, index=False)
    except Exception as e:
        log(f"No pude escribir el consolidado: {e}")
        log("  Instala:  pip install openpyxl")
        return None
    log(f"Consolidado: {salida.name} ({len(df):,} filas)")
    return salida


def _unir_texto(archivos: list[Path], salida: Path) -> Path:
    filas: list[list[str]] = []
    encabezado: list[str] | None = None
    for a in archivos:
        texto = a.read_text(encoding="utf-8")
        lector = csv.reader(io.StringIO(texto), delimiter=detectar_delimitador(texto))
        cab = next(lector, None)
        if cab is None:
            continue
        if encabezado is None:
            encabezado = cab
        elif cab != encabezado:
            log(f"ADVERTENCIA: encabezado distinto en {a.name}. Se conserva el primero.")
        filas.extend(lector)

    with salida.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, delimiter=";")
        if encabezado:
            w.writerow(encabezado)
        w.writerows(filas)
    log(f"Consolidado: {salida.name} ({len(filas):,} filas)")
    return salida


# ---------------------------------------------------------------------------
# ORQUESTACION
# ---------------------------------------------------------------------------

def tramos(desde: date, hasta: date, dias: int):
    if not dias or dias <= 0:
        yield desde, hasta
        return
    ini = desde
    while ini <= hasta:
        fin = min(ini + timedelta(days=dias - 1), hasta)
        yield ini, fin
        ini = fin + timedelta(days=1)


def ejecutar_descarga(d0: date, d1: date, op: Opciones,
                      usuario: str | None = None, password: str | None = None,
                      progress_callback=None) -> list[Path]:
    """
    Usa DOS pestanas para que la de busqueda nunca tenga que navegar a Reportes:

      Pestana A (busqueda) : formulario -> Buscar -> Exportar. No sale de ahi
                             hasta que el portal confirma el encolado.
      Pestana B (reportes) : snapshot de IDs previos y polling posterior.

    ORDEN CRITICO: la pestana B se abre SOLO despues de que el login quedo
    confirmado, y se navega con el href real del menu (que lleva el session_id).
    Abrirla antes dejaba una pestana en blanco durante el captcha, y un
    goto(BASE_URL) limpio caia en la pantalla de login.

    usuario/password/progress_callback: opcionales, usados por
    ejecutar_actualizacion_facturas() para correr sin prompts desde un hilo
    Django. En uso interactivo (menu CLI) se dejan en None y todo funciona
    igual que antes.
    """
    PERFIL_DIR.mkdir(parents=True, exist_ok=True)
    rut_propio = usuario or os.environ.get("DIPRES_RUT", "")
    generados: list[Path] = []
    buzon_dialogos: list[str] = []
    fallo: Exception | None = None

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PERFIL_DIR),
            headless=op.headless,
            accept_downloads=True,
            viewport={"width": 1440, "height": 900},
            locale="es-CL",
        )

        def on_dialog(d):
            buzon_dialogos.append(d.message)
            try:
                d.accept()
            except Exception:
                pass

        # Solo UNA pestana hasta que la sesion este resuelta.
        pg_busqueda = ctx.pages[0] if ctx.pages else ctx.new_page()
        pg_busqueda.on("dialog", on_dialog)
        pg_reportes: Page | None = None

        try:
            _avisar(progress_callback, "sesion", "Abriendo sesion en DIPRES/Acepta...", 2)
            pg_busqueda.bring_to_front()
            asegurar_sesion(pg_busqueda, op.headless, usuario=usuario, password=password)
            _avisar(progress_callback, "sesion", "Sesion confirmada", 8)

            info = contexto_sesion(pg_busqueda)
            if info:
                log(f"Contexto de sesion: {info}")
                if not rut_propio and info.get("rutUsuario"):
                    rut_propio = info["rutUsuario"]

            # Capturar la URL de Reportes DESDE la pestana autenticada.
            url_rep = href_reportes(pg_busqueda)
            if not url_rep:
                log("ADVERTENCIA: no pude leer el href del menu Reportes. "
                    "La segunda pestana intentara con el menu.")

            log("Abriendo pestana de Reportes (la de busqueda no se toca)...")
            pg_reportes = ctx.new_page()
            pg_reportes.on("dialog", on_dialog)
            abrir_reportes(pg_reportes, url_rep)
            log("Pestana de Reportes autenticada y con grilla cargada.")

            lista = list(tramos(d0, d1, op.chunk_dias))
            n = len(lista)
            for i, (ini, fin) in enumerate(lista, 1):
                pct_ini = 10 + int((i - 1) * 85 / n)
                pct_fin = 10 + int(i * 85 / n)
                log("-" * 60)
                _avisar(progress_callback, "tramo", f"Tramo {i}/{n}: {ini} -> {fin}", pct_ini)

                # --- Pestana B: snapshot ANTES de exportar -------------------
                refrescar_grilla(pg_reportes, url_rep)
                ids_previos = {f.id for f in leer_grilla(pg_reportes)}
                log(f"IDs previos en grilla: {len(ids_previos)}")

                # --- Pestana A: formulario -> Buscar -> Exportar -------------
                pg_busqueda.bring_to_front()
                if not frame_con(pg_busqueda, SEL_BTN_BUSCAR, timeout_s=5, visible=True):
                    pg_busqueda.goto(BASE_URL, wait_until="domcontentloaded")
                if not frame_con(pg_busqueda, SEL_BTN_BUSCAR, timeout_s=45, visible=True):
                    raise RuntimeError("El formulario de busqueda no esta disponible.")

                crit = Criterios(fstart=ini.isoformat(), fend=fin.isoformat(), op=op)
                lanzar_exportacion(pg_busqueda, crit, buzon_dialogos)
                # A partir de aqui el export YA fue confirmado por el portal.

                # --- Pestana B: polling y descarga --------------------------
                pg_reportes.bring_to_front()
                fila = esperar_reporte(pg_reportes, ids_previos, rut_propio,
                                       crit, url_rep, progress_callback=progress_callback,
                                       pct_base=pct_ini, pct_span=(pct_fin - pct_ini))
                generados.extend(descargar_y_extraer(ctx, fila, op.salida, op.conservar_zip))
                _avisar(progress_callback, "tramo", f"Tramo {i}/{n} descargado", pct_fin)

            if op.unir and len(generados) > 1:
                unir_archivos(generados, op.salida / f"consolidado_{d0}_{d1}")

            _avisar(progress_callback, "completado", "Descarga finalizada", 95)

        except Exception as e:
            fallo = e
            log(f"FALLO: {e}")
            if not op.headless:
                try:
                    input("\n>>> Navegador ABIERTO para que inspecciones. "
                          "Enter para cerrarlo... ")
                except EOFError:
                    pass
        finally:
            ctx.close()

    if fallo:
        raise fallo
    return generados


# ---------------------------------------------------------------------------
# CARGA A DJANGO — entrypoint programatico para el modulo web "Facturas"
# ---------------------------------------------------------------------------
#
# Sin prompts, sin menu: pensado para ser llamado desde un hilo daemon de
# Django (ver backend/api/views.py, patron identico al usado por
# api/data/data_devengo/sigfe_descarga_devengos_Completo.py).

def setup_django() -> None:
    ruta_api = CARPETA.parent.parent  # api/data/data_facturas -> api -> raiz proyecto
    backend = ruta_api / "backend"
    if str(backend) not in sys.path:
        sys.path.insert(0, str(backend))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
    import django
    django.setup()


def _leer_archivos_descargados(archivos: list[Path]):
    """
    Lee los archivos que ESTA corrida genero (no un glob de toda la carpeta).
    Detecta el formato real por bytes (igual que descargar_y_extraer/detectar_formato):
    el portal puede entregar Excel binario real, HTML disfrazado de .xls, o CSV/texto.
    """
    import pandas as pd
    from actualizar_facturas import DATE_COLS

    frames = []
    total_leido = 0
    for ruta in archivos:
        datos = ruta.read_bytes()
        ext, desc, binario = detectar_formato(datos)
        try:
            if ext in (".xls", ".xlsx") and binario:
                df = pd.read_excel(ruta, dtype=str)
                df_typed = pd.read_excel(ruta)
            elif ext == ".xls" and not binario:
                tablas = pd.read_html(io.StringIO(decodificar(datos)))
                df_typed = max(tablas, key=len)
                df = df_typed.astype(str)
            else:
                texto = decodificar(datos)
                delim = detectar_delimitador(texto)
                df = pd.read_csv(ruta, dtype=str, sep=delim, encoding="utf-8", engine="python")
                df_typed = pd.read_csv(ruta, sep=delim, encoding="utf-8", engine="python")
        except Exception as e:
            log(f"   ADVERTENCIA: no pude leer {ruta.name} ({desc}): {e}")
            continue

        for col in DATE_COLS:
            if col in df_typed.columns:
                df[col] = df_typed[col]

        frames.append(df)
        total_leido += len(df)
        log(f"   Leido {ruta.name} ({desc}): {len(df)} filas")

    if not frames:
        raise RuntimeError("No se pudo leer ningun archivo de la descarga.")
    unified = pd.concat(frames, ignore_index=True)
    return unified, total_leido


def ejecutar_actualizacion_facturas(usuario: str, password: str,
                                    fecha_desde_iso: str, fecha_hasta_iso: str,
                                    headless: bool = True, progress_callback=None) -> dict:
    """
    Descarga [fecha_desde_iso, fecha_hasta_iso] desde DIPRES/Acepta, unifica/limpia
    los archivos resultantes y hace upsert (folio+emisor) en el modelo Factura.
    Nunca borra registros existentes -- ver decision de arquitectura del modulo Facturas.
    """
    d0 = date.fromisoformat(fecha_desde_iso)
    d1 = date.fromisoformat(fecha_hasta_iso)
    if d0 > d1:
        raise ValueError("fecha_desde no puede ser posterior a fecha_hasta.")

    op = Opciones(headless=headless, salida=SALIDA_DIR)
    archivos = ejecutar_descarga(d0, d1, op, usuario=usuario, password=password,
                                 progress_callback=progress_callback)

    if not archivos:
        _avisar(progress_callback, "completado", "Sin archivos nuevos para el rango indicado", 100)
        return {"filas_leidas": 0, "nuevas": 0, "actualizadas": 0, "total_final": None}

    _avisar(progress_callback, "procesando", "Unificando y limpiando datos descargados...", 96)
    df, filas_leidas = _leer_archivos_descargados(archivos)

    from actualizar_facturas import limpiar as _limpiar_facturas, _safe as _safe_valor
    df = _limpiar_facturas(df)

    _avisar(progress_callback, "guardando", "Guardando en la base de datos...", 98)
    setup_django()
    from django.db import transaction
    from api.models import Factura

    cols = [f.name for f in Factura._meta.get_fields()
            if hasattr(f, 'column') and f.name != 'id']

    nuevas = 0
    actualizadas = 0
    with transaction.atomic():
        for _, row in df.iterrows():
            kwargs = {col: _safe_valor(row[col]) for col in cols if col in df.columns}
            folio = kwargs.pop('folio', None)
            emisor = kwargs.pop('emisor', None)
            if folio is None or emisor is None:
                continue
            try:
                _, creado = Factura.objects.update_or_create(
                    folio=folio, emisor=emisor, defaults=kwargs
                )
            except Factura.MultipleObjectsReturned:
                log(f"   ADVERTENCIA: folio={folio} emisor={emisor} tiene mas de una "
                    f"fila existente en BD, se omite (revisar duplicados manualmente).")
                continue
            if creado:
                nuevas += 1
            else:
                actualizadas += 1

    total_final = Factura.objects.count()
    _avisar(progress_callback, "completado", "Actualizacion completada", 100,
            f"Listo: {nuevas} nuevas, {actualizadas} actualizadas, {total_final} en total.")

    return {
        "filas_leidas": filas_leidas,
        "nuevas": nuevas,
        "actualizadas": actualizadas,
        "total_final": total_final,
    }


# ---------------------------------------------------------------------------
# MENU
# ---------------------------------------------------------------------------

def menu_avanzado(op: Opciones) -> None:
    titulo("OPCIONES AVANZADAS")

    op.tipo_fecha, desc = pedir_opcion("Tipo de fecha:", TIPOS_FECHA, op.tipo_fecha)
    print(f"   -> {desc}")

    op.tipo_dte, desc = pedir_opcion("Tipo de documento:", TIPOS_DTE, op.tipo_dte)
    print(f"   -> {desc}")

    op.estado, desc = pedir_opcion("Estado del documento:", ESTADOS_DOC, op.estado)
    print(f"   -> {desc}")

    op.estado_devengo, desc = pedir_opcion("Estado de devengo:", ESTADOS_DEVENGO, op.estado_devengo)
    print(f"   -> {desc}")

    op.rut_emisor = pedir("\nRUT emisor (vacio = todos)", op.rut_emisor)

    crudo = pedir("Partir en tramos de N dias (0 = un solo tramo)", str(op.chunk_dias))
    op.chunk_dias = int(crudo) if crudo.isdigit() else 0

    op.unir = pedir_si_no("Consolidar los tramos en un solo archivo?", op.unir)
    op.conservar_zip = pedir_si_no("Conservar tambien el .zip original?", op.conservar_zip)
    op.headless = pedir_si_no("Modo headless (solo si la sesion ya esta viva)?", op.headless)

    ruta = pedir("Carpeta de salida", str(op.salida))
    op.salida = Path(ruta).resolve()

    print("\nOpciones guardadas para esta sesion.")


def mostrar_config(op: Opciones) -> None:
    def desc_de(d: dict, cod: str) -> str:
        for c, t in d.values():
            if c == cod:
                return t
        return cod or "-"

    print("\n  Configuracion actual:")
    print(f"    Tipo fecha .......: {desc_de(TIPOS_FECHA, op.tipo_fecha)}")
    print(f"    Tipo documento ...: {desc_de(TIPOS_DTE, op.tipo_dte)}")
    print(f"    Estado documento .: {desc_de(ESTADOS_DOC, op.estado)}")
    print(f"    Estado devengo ...: {desc_de(ESTADOS_DEVENGO, op.estado_devengo)}")
    print(f"    RUT emisor .......: {op.rut_emisor or 'todos'}")
    print(f"    Tramos ...........: {op.chunk_dias or 'sin partir'}")
    print(f"    Consolidar .......: {'si' if op.unir else 'no'}")
    print(f"    Conservar ZIP ....: {'si' if op.conservar_zip else 'no'}")
    print(f"    Headless .........: {'si' if op.headless else 'no'}")
    print(f"    Salida ...........: {op.salida}")


def confirmar_y_correr(d0: date, d1: date, op: Opciones) -> None:
    dias = (d1 - d0).days + 1
    titulo("RESUMEN")
    print(f"    Periodo: {d0} -> {d1}  ({dias} dia(s))")
    mostrar_config(op)
    if not pedir_si_no("\nEjecutar?", True):
        print("Cancelado.")
        return
    try:
        archivos = ejecutar_descarga(d0, d1, op)
        titulo("RESULTADO")
        if archivos:
            for a in archivos:
                print(f"    {a}")
        else:
            print("    No se genero ningun archivo.")
    except KeyboardInterrupt:
        print("\nInterrumpido por el usuario.")
    except Exception as e:
        print(f"\nERROR: {e}")
    input("\nEnter para volver al menu...")


def menu_sesion() -> None:
    titulo("SESION")
    if PERFIL_DIR.exists():
        n = sum(1 for _ in PERFIL_DIR.rglob("*"))
        print(f"    Perfil persistente: {PERFIL_DIR}")
        print(f"    Archivos: {n}")
        if pedir_si_no("\nBorrar el perfil (obliga a re-loguear con captcha)?", False):
            import shutil
            shutil.rmtree(PERFIL_DIR, ignore_errors=True)
            print("    Perfil borrado.")
    else:
        print("    No existe perfil todavia. Se creara en la primera corrida.")
    input("\nEnter para volver...")


def menu_principal() -> None:
    op = Opciones()
    hoy = date.today()

    while True:
        titulo("DIPRES / ACEPTA - Descarga de Documentos Recibidos")
        print("    1) Ultimos 7 dias")
        print("    2) Mes actual")
        print("    3) Mes anterior")
        print("    4) Rango personalizado")
        print("    5) Un solo dia")
        print("    6) Opciones avanzadas (filtros, tramos, salida)")
        print("    7) Ver configuracion actual")
        print("    8) Sesion / perfil del navegador")
        print("    0) Salir")

        sel = input("\n  Opcion: ").strip()
        hoy = date.today()

        if sel == "1":
            confirmar_y_correr(hoy - timedelta(days=6), hoy, op)
        elif sel == "2":
            confirmar_y_correr(primer_dia(hoy), hoy, op)
        elif sel == "3":
            fin = primer_dia(hoy) - timedelta(days=1)
            confirmar_y_correr(primer_dia(fin), fin, op)
        elif sel == "4":
            d0 = pedir_fecha("  Desde", primer_dia(hoy))
            d1 = pedir_fecha("  Hasta", hoy)
            if d0 > d1:
                print("  El 'desde' es posterior al 'hasta'.")
                continue
            confirmar_y_correr(d0, d1, op)
        elif sel == "5":
            d = pedir_fecha("  Fecha", hoy)
            confirmar_y_correr(d, d, op)
        elif sel == "6":
            menu_avanzado(op)
        elif sel == "7":
            mostrar_config(op)
            input("\nEnter para volver...")
        elif sel == "8":
            menu_sesion()
        elif sel == "0":
            print("Hasta luego.")
            return
        else:
            print("  Opcion invalida.")


# ---------------------------------------------------------------------------
# ENTRADA
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Descarga reportes de Documentos Recibidos DIPRES/Acepta. "
                    "Sin argumentos abre el menu interactivo.")
    ap.add_argument("--desde", help="YYYY-MM-DD")
    ap.add_argument("--hasta", help="YYYY-MM-DD")
    ap.add_argument("--tipo-fecha", default="Recepcion",
                    choices=["Recepcion", "Emision", "recepcion_sii"])
    ap.add_argument("--tipo-dte", default="*", choices=["*", "33", "34", "56", "61"])
    ap.add_argument("--estado", default="REMI")
    ap.add_argument("--estado-devengo", default="")
    ap.add_argument("--rut-emisor", default="")
    ap.add_argument("--chunk-dias", type=int, default=0)
    ap.add_argument("--unir", action="store_true")
    ap.add_argument("--conservar-zip", action="store_true")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--salida", default=str(SALIDA_DIR))
    args = ap.parse_args()

    if not args.desde and not args.hasta:
        try:
            menu_principal()
        except KeyboardInterrupt:
            print("\nInterrumpido.")
        return 0

    if not (args.desde and args.hasta):
        sys.exit("ERROR: --desde y --hasta se usan juntos, o ninguno (menu).")

    d0 = parse_fecha(args.desde)
    d1 = parse_fecha(args.hasta)
    if not d0 or not d1:
        sys.exit("ERROR: formato de fecha invalido.")
    if d0 > d1:
        sys.exit("ERROR: --desde es posterior a --hasta.")

    op = Opciones(
        tipo_fecha=args.tipo_fecha,
        tipo_dte=args.tipo_dte,
        estado=args.estado,
        estado_devengo=args.estado_devengo,
        rut_emisor=args.rut_emisor,
        chunk_dias=args.chunk_dias,
        unir=args.unir,
        conservar_zip=args.conservar_zip,
        headless=args.headless,
        salida=Path(args.salida).resolve(),
    )
    archivos = ejecutar_descarga(d0, d1, op)
    log(f"Listo. {len(archivos)} archivo(s) en {op.salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
