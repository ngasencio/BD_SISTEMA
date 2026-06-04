"""
=============================================================
  SCRAPER MERCADO PÚBLICO - WRAPPER PARA API DJANGO
  Uso: python run_api.py <codigo_licitacion> <carpeta_salida>
  Salida stdout:
      ZIP_PATH:<ruta_al_zip>
      CARPETA_PATH:<ruta_a_la_carpeta>
=============================================================
"""

import sys
import os
import zipfile
from pathlib import Path

# Agregar el directorio de los módulos al path
sys.path.insert(0, str(Path(__file__).parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from etapa1_navegacion import (
    iniciar_chrome,
    buscar_licitacion,
    entrar_ficha,
    obtener_nombre_licitacion,
    abrir_cuadro_ofertas,
    extraer_proveedores,
)
from etapa2_carpetas import crear_estructura
from etapa3_ficha    import descargar_ficha
from etapa4_anexos   import descargar_anexos_proveedor
from etapa5_resumen  import generar_resumen


def _crear_zip(carpeta: Path, zip_destino: Path) -> Path:
    with zipfile.ZipFile(zip_destino, "w", zipfile.ZIP_DEFLATED) as zf:
        for archivo in carpeta.rglob("*"):
            if archivo.is_file():
                zf.write(archivo, archivo.relative_to(carpeta.parent))
    return zip_destino


def run(codigo: str, carpeta_base: Path):
    driver = iniciar_chrome()
    try:
        if not buscar_licitacion(driver, codigo):
            print(f"[ERROR] No se pudo buscar la licitación {codigo}", file=sys.stderr)
            sys.exit(1)

        if not entrar_ficha(driver, codigo):
            print(f"[ERROR] No se encontró la licitación {codigo}", file=sys.stderr)
            sys.exit(1)

        nombre = obtener_nombre_licitacion(driver)

        if not abrir_cuadro_ofertas(driver):
            print("[ERROR] Esta licitación no tiene cuadro de ofertas público.", file=sys.stderr)
            sys.exit(1)

        proveedores = extraer_proveedores(driver)
        if not proveedores:
            print("[ERROR] No se encontraron proveedores en el cuadro de ofertas.", file=sys.stderr)
            sys.exit(1)

        print(f"[INFO] Licitación: {nombre}")
        print(f"[INFO] Proveedores encontrados: {len(proveedores)}")

        rutas = crear_estructura(codigo, nombre, proveedores, carpeta_base=carpeta_base)

        driver.switch_to.default_content()
        cuadro_handle = driver.current_window_handle
        log_dict  = {}
        log_lista = []

        for p in proveedores:
            letra   = p["letra"]
            rutas_p = rutas["proveedores"].get(letra, {})
            log_dict[letra] = {"ficha_ok": False, "admin": 0, "tec": 0, "econ": 0}

            print(f"[INFO] Procesando proveedor [{letra.upper()}] {p['nombre']}")

            try:
                driver.switch_to.window(cuadro_handle)
                conteo = descargar_anexos_proveedor(driver, p, rutas_p, log_lista)
                log_dict[letra]["admin"] = conteo["admin"]
                log_dict[letra]["tec"]   = conteo["tec"]
                log_dict[letra]["econ"]  = conteo["econ"]
            except Exception as e:
                print(f"[WARN] Error en anexos de [{letra.upper()}]: {e}")
                try:
                    driver.switch_to.window(cuadro_handle)
                except Exception:
                    pass

            try:
                driver.switch_to.window(cuadro_handle)
                ok = descargar_ficha(
                    driver,
                    p["rut"],
                    p["nombre"],
                    rutas_p.get("ficha", "")
                )
                log_dict[letra]["ficha_ok"] = ok
            except Exception as e:
                print(f"[WARN] Error en ficha de [{letra.upper()}]: {e}")
                try:
                    driver.switch_to.window(cuadro_handle)
                except Exception:
                    pass

        generar_resumen(
            rutas["carpeta_principal"],
            rutas["resumen_txt"],
            codigo, nombre,
            proveedores, rutas, log_dict
        )

        # Crear ZIP en la misma carpeta base
        carpeta_principal = Path(rutas["carpeta_principal"])
        zip_path = carpeta_base / f"{carpeta_principal.name}.zip"
        _crear_zip(carpeta_principal, zip_path)

        # Estas líneas son leídas por el backend Django
        print(f"ZIP_PATH:{zip_path}")
        print(f"CARPETA_PATH:{rutas['carpeta_principal']}")

    finally:
        driver.quit()
        print("[INFO] Navegador cerrado.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python run_api.py <codigo_licitacion> <carpeta_salida>")
        sys.exit(1)

    _codigo      = sys.argv[1].strip().lstrip("﻿")
    _carpeta_base = Path(sys.argv[2])
    _carpeta_base.mkdir(parents=True, exist_ok=True)

    run(_codigo, _carpeta_base)
