"""
Diagnóstico del campo de búsqueda de Mercado Público.
Inspecciona la estructura del DOM, detecta iframes, frameworks JS,
y prueba distintas estrategias de escritura reportando cuál funciona.
"""

import time
import json
import sys
import subprocess
import tkinter as tk

# Forzar UTF-8 en stdout para Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

URL   = "https://www.mercadopublico.cl/Home/BusquedaLicitacion"
TEXTO = "3447-243-L125"


def iniciar_chrome():
    opts = webdriver.ChromeOptions()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-notifications")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=opts
    )
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"}
    )
    return driver


def copiar_clipboard(texto):
    try:
        root = tk.Tk(); root.withdraw()
        root.clipboard_clear(); root.clipboard_append(texto); root.update(); root.destroy()
        return True
    except Exception:
        pass
    try:
        subprocess.run("clip", input=texto.encode("utf-16-le"), check=True); return True
    except Exception:
        return False


def sep(titulo=""):
    print("\n" + "-"*60)
    if titulo:
        print(f"  {titulo}")
        print("-"*60)


# ────────────────────────────────────────────────────────────
#  1. ESTRUCTURA DE IFRAMES
# ────────────────────────────────────────────────────────────
def auditar_iframes(driver):
    sep("1. IFRAMES EN DOCUMENTO PRINCIPAL")
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    print(f"Total iframes: {len(iframes)}")
    for i, f in enumerate(iframes):
        print(f"  [{i}] id={f.get_attribute('id')!r:20}  "
              f"name={f.get_attribute('name')!r:20}  "
              f"src={str(f.get_attribute('src'))[:60]}")
    return iframes


# ────────────────────────────────────────────────────────────
#  2. BUSCAR CAMPO EN TODOS LOS CONTEXTOS (main + cada iframe)
# ────────────────────────────────────────────────────────────
def buscar_campo_en_contexto(driver, contexto_nombre="main"):
    """Devuelve (campo, contexto_nombre) o (None, None)."""
    SELECTORES = [
        (By.ID,           "textoBusqueda"),
        (By.NAME,         "textoBusqueda"),
        (By.CSS_SELECTOR, "input.input-mp"),
        (By.CSS_SELECTOR, "input[type='search']"),
        (By.CSS_SELECTOR, "input[type='text']"),
        (By.CSS_SELECTOR, "input[placeholder]"),
    ]
    for metodo, valor in SELECTORES:
        try:
            el = driver.find_element(metodo, valor)
            if el.is_displayed():
                print(f"  [ENCONTRADO] contexto={contexto_nombre}  selector=({metodo},{valor!r})  "
                      f"id={el.get_attribute('id')!r}  type={el.get_attribute('type')!r}")
                return el, contexto_nombre
        except Exception:
            continue
    return None, None


def encontrar_campo(driver, iframes):
    sep("2. LOCALIZACIÓN DEL CAMPO")

    # Contexto principal
    campo, ctx = buscar_campo_en_contexto(driver, "main")
    if campo:
        return campo, ctx, None  # (campo, contexto, iframe_index)

    # Dentro de cada iframe
    for i, iframe in enumerate(iframes):
        try:
            driver.switch_to.frame(iframe)
            campo, ctx = buscar_campo_en_contexto(driver, f"iframe[{i}]")
            if campo:
                return campo, ctx, i
            driver.switch_to.default_content()
        except Exception as e:
            driver.switch_to.default_content()
            print(f"  [WARN] No se pudo entrar en iframe[{i}]: {e}")

    print("  [ERROR] Campo no encontrado en ningún contexto.")
    return None, None, None


# ────────────────────────────────────────────────────────────
#  3. AUDITAR PROPIEDADES DEL CAMPO
# ────────────────────────────────────────────────────────────
def auditar_campo(driver, campo):
    sep("3. PROPIEDADES DEL CAMPO")
    props = driver.execute_script("""
        var el = arguments[0];
        var style = window.getComputedStyle(el);
        return {
            tagName:       el.tagName,
            id:            el.id,
            name:          el.name,
            type:          el.type,
            value:         el.value,
            readOnly:      el.readOnly,
            disabled:      el.disabled,
            maxLength:     el.maxLength,
            placeholder:   el.placeholder,
            className:     el.className,
            pointerEvents: style.pointerEvents,
            visibility:    style.visibility,
            display:       style.display,
            opacity:       style.opacity,
            zIndex:        style.zIndex,
            // ¿Tiene framework?
            hasReactFiber: !!Object.keys(el).find(k => k.startsWith('__reactFiber')),
            hasReactProps: !!Object.keys(el).find(k => k.startsWith('__reactProps')),
            hasAngular:    !!el.__zone_symbol__value,
            hasVue:        !!(el.__vue__ || el._vei),
            // Listeners
            listenerCount: (window._selenium_listeners || 0),
        };
    """, campo)
    for k, v in props.items():
        print(f"  {k:<18}: {v}")
    return props


# ────────────────────────────────────────────────────────────
#  4. ESTRATEGIAS DE ESCRITURA
# ────────────────────────────────────────────────────────────
def probar_estrategias(driver, campo):
    sep("4. ESTRATEGIAS DE ESCRITURA")
    texto = TEXTO

    def valor_ok():
        v = campo.get_attribute("value")
        return v == texto, v

    def limpiar():
        try:
            driver.execute_script("arguments[0].value = '';", campo)
            campo.click(); ActionChains(driver).key_down(Keys.CONTROL).send_keys('a').key_up(Keys.CONTROL).perform()
            ActionChains(driver).send_keys(Keys.DELETE).perform()
            time.sleep(0.2)
        except Exception:
            pass

    resultados = {}

    # ── E1: send_keys simple ────────────────────────────────
    print("\n  [E1] send_keys simple")
    try:
        limpiar(); campo.click(); campo.send_keys(texto); time.sleep(0.5)
        ok, val = valor_ok()
        resultados["E1_send_keys"] = {"ok": ok, "valor": val}
        print(f"       → ok={ok}  value={val!r}")
    except Exception as e:
        resultados["E1_send_keys"] = {"ok": False, "error": str(e)}
        print(f"       → EXCEPCION: {e}")

    # ── E2: Portapapeles + Ctrl+V ───────────────────────────
    print("\n  [E2] Portapapeles + Ctrl+V")
    try:
        limpiar(); copiar_clipboard(texto)
        campo.click(); time.sleep(0.2)
        ActionChains(driver).key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
        time.sleep(0.5)
        ok, val = valor_ok()
        resultados["E2_clipboard"] = {"ok": ok, "valor": val}
        print(f"       → ok={ok}  value={val!r}")
    except Exception as e:
        resultados["E2_clipboard"] = {"ok": False, "error": str(e)}
        print(f"       → EXCEPCION: {e}")

    # ── E3: JS .value + Event input/change ─────────────────
    print("\n  [E3] JS .value + events input/change")
    try:
        limpiar()
        driver.execute_script("""
            var el = arguments[0], val = arguments[1];
            el.focus(); el.value = val;
            ['input','change'].forEach(t =>
                el.dispatchEvent(new Event(t, {bubbles:true,cancelable:true})));
        """, campo, texto)
        time.sleep(0.4)
        ok, val = valor_ok()
        resultados["E3_js_events"] = {"ok": ok, "valor": val}
        print(f"       → ok={ok}  value={val!r}")
    except Exception as e:
        resultados["E3_js_events"] = {"ok": False, "error": str(e)}
        print(f"       → EXCEPCION: {e}")

    # ── E4: React nativeInputValueSetter ───────────────────
    print("\n  [E4] React nativeInputValueSetter")
    try:
        limpiar()
        driver.execute_script("""
            var el = arguments[0], val = arguments[1];
            var setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input',  {bubbles:true,cancelable:true}));
            el.dispatchEvent(new Event('change', {bubbles:true,cancelable:true}));
        """, campo, texto)
        time.sleep(0.4)
        ok, val = valor_ok()
        resultados["E4_react_setter"] = {"ok": ok, "valor": val}
        print(f"       → ok={ok}  value={val!r}")
    except Exception as e:
        resultados["E4_react_setter"] = {"ok": False, "error": str(e)}
        print(f"       → EXCEPCION: {e}")

    # ── E5: execCommand insertText ──────────────────────────
    print("\n  [E5] execCommand insertText")
    try:
        limpiar(); campo.click()
        driver.execute_script("""
            var el = arguments[0]; el.focus(); el.select();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, arguments[1]);
        """, campo, texto)
        time.sleep(0.4)
        ok, val = valor_ok()
        resultados["E5_execCommand"] = {"ok": ok, "valor": val}
        print(f"       → ok={ok}  value={val!r}")
    except Exception as e:
        resultados["E5_execCommand"] = {"ok": False, "error": str(e)}
        print(f"       → EXCEPCION: {e}")

    # ── E6: KeyboardEvent char a char ──────────────────────
    print("\n  [E6] KeyboardEvent char a char (JS)")
    try:
        limpiar()
        driver.execute_script("""
            var el = arguments[0], val = arguments[1];
            el.focus(); el.value = '';
            for (var i=0; i<val.length; i++) {
                var c = val[i];
                el.dispatchEvent(new KeyboardEvent('keydown',  {key:c,bubbles:true}));
                el.dispatchEvent(new KeyboardEvent('keypress', {key:c,bubbles:true}));
                el.value += c;
                el.dispatchEvent(new Event('input', {bubbles:true,cancelable:true}));
                el.dispatchEvent(new KeyboardEvent('keyup',    {key:c,bubbles:true}));
            }
            el.dispatchEvent(new Event('change', {bubbles:true,cancelable:true}));
        """, campo, texto)
        time.sleep(0.5)
        ok, val = valor_ok()
        resultados["E6_keyboard_js"] = {"ok": ok, "valor": val}
        print(f"       → ok={ok}  value={val!r}")
    except Exception as e:
        resultados["E6_keyboard_js"] = {"ok": False, "error": str(e)}
        print(f"       → EXCEPCION: {e}")

    # ── E7: send_keys char a char con pause ────────────────
    print("\n  [E7] send_keys char a char (Selenium)")
    try:
        limpiar(); campo.click(); time.sleep(0.2)
        for ch in texto:
            campo.send_keys(ch); time.sleep(0.07)
        time.sleep(0.4)
        ok, val = valor_ok()
        resultados["E7_char_by_char"] = {"ok": ok, "valor": val}
        print(f"       → ok={ok}  value={val!r}")
    except Exception as e:
        resultados["E7_char_by_char"] = {"ok": False, "error": str(e)}
        print(f"       → EXCEPCION: {e}")

    return resultados


# ────────────────────────────────────────────────────────────
#  5. PROBAR ENVÍO DE BÚSQUEDA (si alguna escritura funcionó)
# ────────────────────────────────────────────────────────────
def probar_envio(driver, campo, estrategia_ok):
    sep("5. ENVÍO DE BÚSQUEDA")
    if not estrategia_ok:
        print("  [SKIP] Ninguna estrategia escribió correctamente.")
        return False

    print(f"  Usando estrategia: {estrategia_ok}")
    # Intentar botón de búsqueda
    BOTONES = [
        "button[type='submit']",
        "input[type='submit']",
        "button.btn-mp",
        "#btnBuscar",
        "button[onclick*='buscar']",
        "button[onclick*='Buscar']",
        "button.btn-buscar",
    ]
    for sel in BOTONES:
        try:
            btn = driver.find_element(By.CSS_SELECTOR, sel)
            if btn.is_displayed() and btn.is_enabled():
                driver.execute_script("arguments[0].click();", btn)
                print(f"  [OK] Clic en botón: {sel}")
                time.sleep(4)
                print(f"  URL después de buscar: {driver.current_url}")
                return True
        except Exception:
            continue

    # Fallback ENTER
    campo.send_keys(Keys.RETURN)
    print("  [OK] Enviado con ENTER.")
    time.sleep(4)
    print(f"  URL después de buscar: {driver.current_url}")
    return True


# ────────────────────────────────────────────────────────────
#  MAIN
# ────────────────────────────────────────────────────────────
def main():
    print("\n" + "="*60)
    print("  DIAGNÓSTICO CAMPO MERCADO PÚBLICO")
    print("="*60)

    driver = iniciar_chrome()

    try:
        print(f"\n[INFO] Navegando a {URL}")
        driver.get(URL)
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        time.sleep(2.5)

        # Cerrar overlays básicos
        for sel in ["button#cookieConsentOkButton","button[data-dismiss='modal']","button.close","#cookieAccept"]:
            try:
                b = driver.find_element(By.CSS_SELECTOR, sel)
                if b.is_displayed(): driver.execute_script("arguments[0].click();", b); time.sleep(0.4)
            except Exception:
                pass
        try:
            driver.execute_script("""
                document.querySelectorAll('.modal.show,.modal.in').forEach(m=>{
                    m.style.display='none';m.classList.remove('show','in');});
                document.querySelectorAll('.modal-backdrop').forEach(b=>b.remove());
                document.body.classList.remove('modal-open');
            """)
        except Exception:
            pass

        iframes = auditar_iframes(driver)

        campo, ctx, iframe_idx = encontrar_campo(driver, iframes)

        if campo is None:
            # Último intento: volcar todos los inputs del DOM completo
            sep("AUDITORÍA COMPLETA DE INPUTS")
            all_inputs = driver.find_elements(By.TAG_NAME, "input")
            print(f"Total inputs en documento principal: {len(all_inputs)}")
            for inp in all_inputs:
                try:
                    print(f"  id={inp.get_attribute('id')!r:25} "
                          f"name={inp.get_attribute('name')!r:25} "
                          f"type={inp.get_attribute('type')!r:12} "
                          f"visible={inp.is_displayed()}")
                except Exception:
                    pass
            time.sleep(6)
            return

        props = auditar_campo(driver, campo)

        resultados = probar_estrategias(driver, campo)

        sep("RESUMEN")
        estrategia_ganadora = None
        for nombre, res in resultados.items():
            estado = "[OK] FUNCIONA" if res.get("ok") else "[ ] falla  "
            print(f"  {nombre:<25}: {estado}  →  {res.get('valor','')!r}")
            if res.get("ok") and not estrategia_ganadora:
                estrategia_ganadora = nombre

        if estrategia_ganadora:
            print(f"\n  ESTRATEGIA GANADORA: {estrategia_ganadora}")
            # Repetir escritura con la estrategia ganadora y enviar
            campo.click(); time.sleep(0.2)
            # Detectar cuál fue y reproducirla
            if "E1" in estrategia_ganadora:
                campo.clear(); campo.send_keys(TEXTO)
            elif "E2" in estrategia_ganadora:
                copiar_clipboard(TEXTO); campo.click()
                ActionChains(driver).key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
            elif "E3" in estrategia_ganadora:
                driver.execute_script("""
                    var el=arguments[0],val=arguments[1]; el.focus(); el.value=val;
                    ['input','change'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
                """, campo, TEXTO)
            elif "E4" in estrategia_ganadora:
                driver.execute_script("""
                    var el=arguments[0],val=arguments[1];
                    var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
                    s.call(el,val);
                    el.dispatchEvent(new Event('input',{bubbles:true}));
                    el.dispatchEvent(new Event('change',{bubbles:true}));
                """, campo, TEXTO)
            elif "E5" in estrategia_ganadora:
                driver.execute_script("""
                    var el=arguments[0]; el.focus(); el.select();
                    document.execCommand('selectAll',false,null);
                    document.execCommand('insertText',false,arguments[1]);
                """, campo, TEXTO)
            elif "E6" in estrategia_ganadora:
                driver.execute_script("""
                    var el=arguments[0],val=arguments[1]; el.focus(); el.value='';
                    for(var i=0;i<val.length;i++){var c=val[i];
                        el.dispatchEvent(new KeyboardEvent('keydown',{key:c,bubbles:true}));
                        el.dispatchEvent(new KeyboardEvent('keypress',{key:c,bubbles:true}));
                        el.value+=c; el.dispatchEvent(new Event('input',{bubbles:true}));
                        el.dispatchEvent(new KeyboardEvent('keyup',{key:c,bubbles:true}));}
                    el.dispatchEvent(new Event('change',{bubbles:true}));
                """, campo, TEXTO)
            elif "E7" in estrategia_ganadora:
                campo.click()
                for ch in TEXTO:
                    campo.send_keys(ch); time.sleep(0.07)
            time.sleep(0.3)
            probar_envio(driver, campo, estrategia_ganadora)
        else:
            print("\n  NINGUNA ESTRATEGIA FUNCIONÓ.")
            print("  Revisa las propiedades del campo arriba (iframe, shadow DOM, framework).")

        print(f"\n  Iframe usado: {'main' if iframe_idx is None else f'iframe[{iframe_idx}]'}")
        print(f"  Props clave: readOnly={props.get('readOnly')}, disabled={props.get('disabled')}, "
              f"display={props.get('display')}, pointerEvents={props.get('pointerEvents')}")
        print(f"  Framework detectado: React={props.get('hasReactFiber')}, "
              f"Angular={props.get('hasAngular')}, Vue={props.get('hasVue')}")

    except Exception as e:
        import traceback
        print(f"\n[ERROR FATAL]: {e}")
        traceback.print_exc()
    finally:
        time.sleep(3)
        driver.quit()
        print("[INFO] Cerrado.")


if __name__ == "__main__":
    main()
