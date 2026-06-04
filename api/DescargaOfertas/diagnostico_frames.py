"""
Diagnóstico de estructura de frames del Cuadro de Ofertas.
Ejecuta: python diagnostico_frames.py
Ingresa el código cuando se pida, luego inicia sesión si el sitio lo pide.
El script reporta exactamente en qué frame vive grdSupplies.
"""

import sys
import time
sys.stdout.reconfigure(encoding="utf-8")

from etapa1_navegacion import (
    iniciar_chrome, buscar_licitacion, entrar_ficha, abrir_cuadro_ofertas
)
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException


def listar_frames(driver, prefijo=""):
    """Devuelve info de todos los frames/iframes en el contexto actual."""
    resultado = []
    for tag in ("frame", "iframe"):
        elementos = driver.find_elements(By.TAG_NAME, tag)
        for i, el in enumerate(elementos):
            nombre = el.get_attribute("name") or ""
            id_    = el.get_attribute("id")   or ""
            src    = (el.get_attribute("src")  or "")[:80]
            resultado.append(f"{prefijo}<{tag}> name='{nombre}' id='{id_}' src='{src}'")
    return resultado


def intentar_encontrar_grd(driver, ruta: list) -> bool:
    """Intenta navegar por la ruta de frames y buscar grdSupplies."""
    driver.switch_to.default_content()
    try:
        for paso in ruta:
            if paso == "NAME:PopupFicha":
                driver.switch_to.frame(driver.find_element(By.NAME, "PopupFicha"))
            elif paso == "NAME:Cuerpo":
                driver.switch_to.frame(driver.find_element(By.NAME, "Cuerpo"))
            elif paso == "NAME:Encabezado":
                driver.switch_to.frame(driver.find_element(By.NAME, "Encabezado"))
            else:
                driver.switch_to.frame(driver.find_element(By.NAME, paso))
        # Buscar grdSupplies
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.ID, "grdSupplies"))
        )
        return True
    except Exception:
        return False
    finally:
        driver.switch_to.default_content()


def main():
    codigo = input("Código de licitación (ej: 1502-18-LE25): ").strip().lstrip("﻿")

    driver = iniciar_chrome()

    try:
        print("\n[1/4] Buscando licitación...")
        if not buscar_licitacion(driver, codigo):
            print("ERROR: no se pudo buscar.")
            return

        print("[2/4] Entrando a la ficha...")
        if not entrar_ficha(driver, codigo):
            print("ERROR: no se encontró la licitación.")
            return

        print("\n>> Si el sitio pide login, inicia sesión ahora.")
        print(">> Presiona ENTER cuando estés listo para continuar...")
        try:
            input()
        except EOFError:
            time.sleep(10)

        print("[3/4] Abriendo cuadro de ofertas...")
        if not abrir_cuadro_ofertas(driver):
            print("ERROR: no se pudo abrir el cuadro.")
            return

        time.sleep(2)

        # ── Nivel 0: default_content ──────────────────────────────
        print("\n" + "="*60)
        print("NIVEL 0 — default_content (documento raíz)")
        print("="*60)
        driver.switch_to.default_content()
        print(f"  URL: {driver.current_url[:80]}")
        frames_0 = listar_frames(driver, "  ")
        if frames_0:
            for f in frames_0:
                print(f)
        else:
            print("  (sin frames ni iframes en este nivel)")

        # ── Nivel 1: entrar a cada frame del nivel 0 ──────────────
        for tag in ("frame", "iframe"):
            elementos = driver.find_elements(By.TAG_NAME, tag)
            for i, el in enumerate(elementos):
                nombre = el.get_attribute("name") or f"[{tag}_{i}]"
                driver.switch_to.default_content()
                try:
                    driver.switch_to.frame(el)
                    url1 = driver.current_url[:80]
                    print(f"\n{'='*60}")
                    print(f"NIVEL 1 — dentro de <{tag} name='{nombre}'>")
                    print(f"{'='*60}")
                    print(f"  URL: {url1}")
                    frames_1 = listar_frames(driver, "  ")
                    if frames_1:
                        for f in frames_1:
                            print(f)
                    else:
                        print("  (sin frames en este nivel)")

                    # ── Nivel 2: entrar a cada frame del nivel 1 ──
                    for tag2 in ("frame", "iframe"):
                        elems2 = driver.find_elements(By.TAG_NAME, tag2)
                        for j, el2 in enumerate(elems2):
                            nombre2 = el2.get_attribute("name") or f"[{tag2}_{j}]"
                            try:
                                driver.switch_to.frame(el2)
                                url2 = driver.current_url[:80]
                                print(f"\n  {'─'*50}")
                                print(f"  NIVEL 2 — dentro de <{tag2} name='{nombre2}'>")
                                print(f"  URL: {url2}")
                                frames_2 = listar_frames(driver, "    ")
                                if frames_2:
                                    for f in frames_2:
                                        print(f)
                                else:
                                    print("    (sin frames en este nivel)")
                                # Buscar grdSupplies aquí
                                try:
                                    driver.find_element(By.ID, "grdSupplies")
                                    print(f"  *** grdSupplies ENCONTRADO aquí ***")
                                except NoSuchElementException:
                                    pass
                                driver.switch_to.default_content()
                                driver.switch_to.frame(el)
                            except Exception as e:
                                print(f"  [skip nivel 2 '{nombre2}']: {e}")
                                driver.switch_to.default_content()
                                driver.switch_to.frame(el)

                    # Buscar grdSupplies en nivel 1
                    try:
                        driver.find_element(By.ID, "grdSupplies")
                        print(f"\n  *** grdSupplies ENCONTRADO en nivel 1 ({nombre}) ***")
                    except NoSuchElementException:
                        pass

                except Exception as e:
                    print(f"  [skip '{nombre}']: {e}")
                driver.switch_to.default_content()

        # ── Buscar grdSupplies en default_content ─────────────────
        driver.switch_to.default_content()
        try:
            driver.find_element(By.ID, "grdSupplies")
            print("\n*** grdSupplies ENCONTRADO en default_content (nivel 0) ***")
        except NoSuchElementException:
            pass

        # ── Probar rutas conocidas ─────────────────────────────────
        print("\n" + "="*60)
        print("PRUEBA DE RUTAS HACIA grdSupplies")
        print("="*60)
        rutas = [
            ["NAME:PopupFicha"],
            ["NAME:Cuerpo"],
            ["NAME:PopupFicha", "NAME:Cuerpo"],
            ["NAME:Cuerpo", "NAME:PopupFicha"],
        ]
        for ruta in rutas:
            ok = intentar_encontrar_grd(driver, ruta)
            resultado = "✓ FUNCIONA" if ok else "✗ falla"
            print(f"  {' → '.join(ruta)}: {resultado}")

        print("\n" + "="*60)
        print("DIAGNÓSTICO COMPLETADO")
        print("="*60)

    finally:
        try:
            input("\nPresiona ENTER para cerrar...")
        except EOFError:
            pass
        driver.quit()


if __name__ == "__main__":
    main()
