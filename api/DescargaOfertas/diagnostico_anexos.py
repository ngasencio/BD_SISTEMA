"""
Diagnóstico completo del flujo de anexos.
Navega manualmente sin usar entrar_ficha para poder inspeccionar cada paso.
Licitación: 1502-18-LE25
"""

import os
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from etapa1_navegacion import iniciar_chrome, buscar_licitacion, abrir_cuadro_ofertas

CARPETA_DESCARGAS = os.path.join(os.path.expanduser("~"), "Downloads")
CODIGO = "1502-18-LE25"


def sep(titulo=""):
    print("\n" + "-" * 60)
    if titulo:
        print(f"  {titulo}")
        print("-" * 60)


def snapshot():
    try:
        return set(os.listdir(CARPETA_DESCARGAS))
    except Exception:
        return set()


def main():
    print("=" * 60)
    print(f"  DIAGNOSTICO ANEXOS - {CODIGO}")
    print("=" * 60)

    driver = iniciar_chrome()

    try:
        # ─────────────────────────────────────────────────────
        # FASE 1: Buscar y entrar a la licitación manualmente
        # ─────────────────────────────────────────────────────
        sep("FASE 1 - Buscar licitacion")
        ok = buscar_licitacion(driver, CODIGO)
        print(f"[INFO] buscar_licitacion retorno: {ok}")
        print(f"[INFO] URL actual: {driver.current_url}")
        print(f"[INFO] Handles: {driver.window_handles}")
        time.sleep(3)

        # Inspeccionar dónde están los resultados
        sep("FASE 1b - Inspeccionar resultados de busqueda")

        # ── Documento principal ──────────────────────────────
        driver.switch_to.default_content()
        links_main = driver.find_elements(By.TAG_NAME, "a")
        print(f"[INFO] Total <a> en documento principal: {len(links_main)}")
        for lk in links_main[:30]:
            txt  = lk.text.strip()[:60]
            href = (lk.get_attribute("href") or "")[:80]
            if txt or href:
                print(f"  [{lk.is_displayed()}] texto={txt!r:40}  href={href!r}")

        # ── Dentro de form-iframe ───────────────────────────
        try:
            driver.switch_to.frame(driver.find_element(By.ID, "form-iframe"))
            links_iframe = driver.find_elements(By.TAG_NAME, "a")
            print(f"\n[INFO] Total <a> en form-iframe: {len(links_iframe)}")
            for lk in links_iframe[:30]:
                txt  = lk.text.strip()[:60]
                href = (lk.get_attribute("href") or "")[:80]
                if txt or href:
                    print(f"  [{lk.is_displayed()}] texto={txt!r:40}  href={href!r}")

            # Buscar el link de la licitacion dentro del iframe
            candidatos = driver.find_elements(By.XPATH,
                f"//a[contains(normalize-space(.), '{CODIGO}') "
                f"or contains(@href, '{CODIGO}')]")
            print(f"\n[INFO] Links que contienen el codigo en iframe: {len(candidatos)}")
            for lk in candidatos[:5]:
                print(f"  texto={lk.text.strip()[:60]!r}  href={lk.get_attribute('href')!r}")

            driver.switch_to.default_content()
        except Exception as e:
            driver.switch_to.default_content()
            print(f"[WARN] form-iframe no accesible: {e}")

        # ── Otros iframes ────────────────────────────────────
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        print(f"\n[INFO] Total iframes en pagina: {len(iframes)}")
        for i, fr in enumerate(iframes):
            print(f"  [{i}] id={fr.get_attribute('id')!r}  "
                  f"name={fr.get_attribute('name')!r}  "
                  f"src={str(fr.get_attribute('src'))[:60]!r}")

        # ─────────────────────────────────────────────────────
        # FASE 2: Entrar a la ficha manualmente buscando en iframe
        # ─────────────────────────────────────────────────────
        sep("FASE 2 - Intentar entrar a ficha desde iframe")
        entro = False

        for iframe_id in ["form-iframe"]:
            try:
                driver.switch_to.frame(driver.find_element(By.ID, iframe_id))
                for xpath in [
                    f"//a[contains(normalize-space(.), '{CODIGO}')]",
                    f"//a[contains(@href, '{CODIGO}')]",
                    "//a[contains(@href, 'Licitacion') or contains(@href, 'licitacion')]",
                    "//h2[contains(@class,'text-weight')]//ancestor::a[1]",
                    "//h2//ancestor::a[1]",
                    "//li[contains(@class,'result')]//a",
                    "//div[contains(@class,'result')]//a",
                ]:
                    try:
                        elementos = driver.find_elements(By.XPATH, xpath)
                        if elementos:
                            for el in elementos[:3]:
                                print(f"[FOUND] xpath={xpath}")
                                print(f"        texto={el.text.strip()[:60]!r}")
                                print(f"        href={el.get_attribute('href')!r}")
                                print(f"        visible={el.is_displayed()}")
                    except Exception:
                        pass

                driver.switch_to.default_content()
            except Exception as e:
                driver.switch_to.default_content()
                print(f"[WARN] iframe {iframe_id!r}: {e}")

        # Capturar HTML del form-iframe para ver la estructura completa
        sep("FASE 2b - HTML de form-iframe (primeros 4000 chars)")
        try:
            driver.switch_to.frame(driver.find_element(By.ID, "form-iframe"))
            html = driver.execute_script("return document.body.innerHTML;")[:4000]
            print(html)
            driver.switch_to.default_content()
        except Exception as e:
            driver.switch_to.default_content()
            print(f"[WARN] {e}")

        # ─────────────────────────────────────────────────────
        # FASE 3: Navegar directamente a la URL de la ficha
        # si encontramos una URL en la inspección anterior
        # ─────────────────────────────────────────────────────
        # La mayoría de los scrapers de Mercado Público construyen
        # la URL de la ficha directamente. Intentar patron conocido:
        sep("FASE 3 - Navegar directo a la ficha (URL directa)")
        urls_directas = [
            f"https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs={CODIGO}",
            f"https://www.mercadopublico.cl/Licitaciones/Public/BuscarLicitacion?codigoLicitacion={CODIGO}",
        ]
        for url in urls_directas:
            print(f"\n[INFO] Probando URL directa: {url}")
            driver.get(url)
            time.sleep(3)
            print(f"[INFO] URL resultante: {driver.current_url}")
            # Verificar si llegamos a la ficha (buscar boton cuadro de ofertas)
            try:
                boton = driver.find_element(By.ID, "imgCuadroOferta")
                print(f"[OK] Boton 'imgCuadroOferta' ENCONTRADO en esta URL!")
                entro = True
                break
            except NoSuchElementException:
                print(f"[INFO] imgCuadroOferta no encontrado en esa URL.")

        if not entro:
            print("\n[INFO] No se encontro la URL directa. "
                  "El scraper necesita pasar por la busqueda.")

        # ─────────────────────────────────────────────────────
        # FASE 4: Si llegamos a la ficha, proceder con cuadro de ofertas
        # ─────────────────────────────────────────────────────
        sep("FASE 4 - Cuadro de ofertas y anexos")

        # Verificar si imgCuadroOferta existe en la pagina actual
        try:
            boton_cuadro = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.ID, "imgCuadroOferta"))
            )
            print("[OK] Boton imgCuadroOferta disponible.")
        except TimeoutException:
            print("[INFO] imgCuadroOferta no disponible en pagina actual.")
            print("[INFO] El diagnostico de la FASE 1 ya recopiló la info clave.")
            print("       Revisar la salida de FASE 1b y 2 para entender la")
            print("       estructura de resultados y corregir entrar_ficha().")
            return

        handles_antes = set(driver.window_handles)
        driver.execute_script("arguments[0].click();", boton_cuadro)
        time.sleep(3)

        if len(driver.window_handles) > len(handles_antes):
            driver.switch_to.window(driver.window_handles[-1])
            print(f"[INFO] Ventana cuadro de ofertas. URL: {driver.current_url}")

        cuadro_handle = driver.current_window_handle

        # Esperar grdSupplies
        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.ID, "grdSupplies"))
            )
            print("[OK] Tabla grdSupplies encontrada.")
        except TimeoutException:
            print("[ERROR] grdSupplies no encontrado.")
            return

        filas = driver.find_elements(By.XPATH,
            "//table[@id='grdSupplies']//tr[contains(@class,'cssFwk')]")
        print(f"[INFO] Proveedores en cuadro: {len(filas)}")

        # ── Inspeccionar inputs de la primera fila ────────────
        sep("FASE 4b - Inputs de la primera fila de grdSupplies")
        if filas:
            todos_inputs = filas[0].find_elements(By.TAG_NAME, "input")
            print(f"Total inputs en fila 0: {len(todos_inputs)}")
            for inp in todos_inputs:
                print(f"  id={inp.get_attribute('id') or '':60}  "
                      f"type={inp.get_attribute('type') or '':12}  "
                      f"name={inp.get_attribute('name') or '':50}  "
                      f"visible={inp.is_displayed()}")

        # ── Probar apertura del popup de anexos ───────────────
        sep("FASE 5 - Abrir popup de anexos (primer tipo disponible)")
        boton_anexo = None
        for fila_index in range(min(len(filas), 3)):
            n = fila_index + 2
            for tipo in ["Administrative", "Technical", "Economic"]:
                id_exacto = f"grdSupplies_ctl{n:02d}__GvImgb{tipo}Attachment"
                css_fb    = f"input[id*='ctl{n:02d}'][id*='{tipo}']"
                try:
                    b = driver.find_element(By.ID, id_exacto)
                    if b.is_displayed():
                        boton_anexo = (b, tipo, fila_index)
                        break
                except NoSuchElementException:
                    pass
                if not boton_anexo:
                    try:
                        cs = driver.find_elements(By.CSS_SELECTOR, css_fb)
                        for c in cs:
                            if c.is_displayed():
                                boton_anexo = (c, tipo, fila_index)
                                break
                    except Exception:
                        pass
                if boton_anexo:
                    break
            if boton_anexo:
                break

        if not boton_anexo:
            print("[WARN] No se encontro boton de anexo. Volcando todos los inputs de grdSupplies:")
            todos = driver.find_elements(By.XPATH, "//table[@id='grdSupplies']//input")
            for inp in todos:
                iid = inp.get_attribute('id') or ''
                print(f"  id={iid!r:65} visible={inp.is_displayed()}")
        else:
            btn, tipo, fi = boton_anexo
            print(f"[OK] Boton encontrado: tipo={tipo}  fila_index={fi}")
            print(f"     id={btn.get_attribute('id')!r}")

            handles_antes2 = set(driver.window_handles)
            snap_antes = snapshot()

            driver.execute_script("arguments[0].click();", btn)
            print("[INFO] Clic en boton de anexo.")
            time.sleep(4)

            handles_ahora = set(driver.window_handles)
            nuevos = handles_ahora - handles_antes2
            print(f"[INFO] Nuevas ventanas: {len(nuevos)} → {nuevos}")

            if nuevos:
                popup_h = nuevos.pop()
                driver.switch_to.window(popup_h)
                print(f"[INFO] URL del popup: {driver.current_url}")
                time.sleep(2)

                # Inspeccionar tabla
                sep("FASE 6 - Tabla DWNL_grdId en el popup")
                try:
                    WebDriverWait(driver, 12).until(
                        EC.presence_of_element_located((By.ID, "DWNL_grdId"))
                    )
                    print("[OK] DWNL_grdId encontrada.")
                except TimeoutException:
                    print("[WARN] DWNL_grdId no encontrada.")

                filas_pop = driver.find_elements(By.XPATH,
                    "//table[@id='DWNL_grdId']//tr")
                filas_chk = driver.find_elements(By.XPATH,
                    "//table[@id='DWNL_grdId']//tr[.//input[@type='checkbox']]")
                print(f"[INFO] Filas totales popup: {len(filas_pop)}")
                print(f"[INFO] Filas con checkbox : {len(filas_chk)}")

                for i, fila in enumerate(filas_chk[:3]):
                    print(f"\n  --- Fila popup {i+1} ---")
                    html = driver.execute_script(
                        "return arguments[0].outerHTML;", fila)[:600]
                    print(f"  {html}")

                if filas_chk:
                    sep("FASE 7 - Click en 'Ver Anexo' fila 1")
                    fila1 = filas_chk[0]
                    snap_antes3 = snapshot()

                    try:
                        chk = fila1.find_element(By.XPATH, ".//input[@type='checkbox']")
                        print(f"[INFO] Checkbox id={chk.get_attribute('id')!r}  "
                              f"selected={chk.is_selected()}")
                        if not chk.is_selected():
                            driver.execute_script("arguments[0].click();", chk)
                            time.sleep(0.4)
                    except Exception as e:
                        print(f"[WARN] Checkbox: {e}")

                    try:
                        btn_ver = fila1.find_element(By.XPATH,
                            ".//input[@type='image'][@title='Ver Anexo']")
                        print(f"[INFO] Ver Anexo id={btn_ver.get_attribute('id')!r}  "
                              f"name={btn_ver.get_attribute('name')!r}")

                        handles_antes4 = set(driver.window_handles)
                        driver.execute_script("arguments[0].click();", btn_ver)
                        print("[INFO] Clic en Ver Anexo.")
                        time.sleep(5)

                        handles_4 = set(driver.window_handles)
                        nuevos_4  = handles_4 - handles_antes4
                        snap_4    = snapshot()
                        nuevos_archivos = snap_4 - snap_antes3

                        print(f"\n[RESULTADO]")
                        print(f"  Nuevas ventanas  : {nuevos_4}")
                        print(f"  Archivos nuevos  : {nuevos_archivos}")
                        print(f"  URL popup actual : {driver.current_url}")

                        if nuevos_4:
                            for hh in nuevos_4:
                                driver.switch_to.window(hh)
                                print(f"  -> Ventana nueva URL: {driver.current_url}")
                        elif nuevos_archivos:
                            print(f"  [OK] DESCARGA DETECTADA: {nuevos_archivos}")
                        else:
                            print("  [??] Nada detectado aun. Esperando 10s mas...")
                            time.sleep(10)
                            snap_5 = snapshot()
                            print(f"  Archivos tras 15s total: {snap_5 - snap_antes3}")

                    except NoSuchElementException:
                        print("[ERROR] Boton 'Ver Anexo' no encontrado.")
                        print("[INFO] Todos los inputs en el popup:")
                        for inp in driver.find_elements(By.TAG_NAME, "input"):
                            print(f"  id={inp.get_attribute('id') or '':45}  "
                                  f"type={inp.get_attribute('type') or '':12}  "
                                  f"title={inp.get_attribute('title') or '':20}  "
                                  f"name={inp.get_attribute('name') or ''}")

            else:
                print("[INFO] No se abrio popup. El boton puede actuar en la misma ventana.")
                snap_2 = snapshot()
                print(f"[INFO] URL actual: {driver.current_url}")
                print(f"[INFO] Nuevos archivos en Downloads: {snap_2 - snap_antes}")

    except Exception as e:
        import traceback
        print(f"\n[ERROR FATAL]: {e}")
        traceback.print_exc()
    finally:
        time.sleep(5)
        driver.quit()
        print("\n[INFO] Diagnostico terminado.")


if __name__ == "__main__":
    main()
