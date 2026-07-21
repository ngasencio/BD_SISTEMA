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
from etapa2_carpetas  import crear_carpeta_principal, crear_carpetas_proveedores
from etapa3_adjuntos  import descargar_adjuntos_licitacion
from etapa4_anexos    import descargar_anexos_proveedor
from etapa5_resumen   import generar_resumen
from etapa6_fusion    import fusionar_anexos


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

        # Carpeta principal + Documentos Anexos, creada ANTES del cuadro de
        # ofertas para poder descargar los adjuntos de la licitación.
        rutas = crear_carpeta_principal(codigo, nombre, carpeta_base=carpeta_base)

        # Documentos Anexos de la licitación ("Ver Adjuntos") — reemplaza la
        # antigua descarga de "Ficha del Proveedor" (portal externo con
        # errores de carga frecuentes).
        total_adjuntos_lic = descargar_adjuntos_licitacion(
            driver, rutas["documentos_anexos"]
        )
        print(f"[INFO] Documentos Anexos de la licitación: {total_adjuntos_lic}")

        if not abrir_cuadro_ofertas(driver):
            print("[ERROR] Esta licitación no tiene cuadro de ofertas público.", file=sys.stderr)
            sys.exit(1)

        proveedores = extraer_proveedores(driver)
        if not proveedores:
            print("[ERROR] No se encontraron proveedores en el cuadro de ofertas.", file=sys.stderr)
            sys.exit(1)

        print(f"[INFO] Licitación: {nombre}")
        print(f"[INFO] Proveedores encontrados: {len(proveedores)}")

        rutas["proveedores"] = crear_carpetas_proveedores(
            rutas["carpeta_principal"], proveedores
        )

        driver.switch_to.default_content()
        cuadro_handle = driver.current_window_handle
        log_dict  = {}
        log_lista = []

        for p in proveedores:
            letra   = p["letra"]
            rutas_p = rutas["proveedores"].get(letra, {})
            log_dict[letra] = {"admin": 0, "tec": 0, "econ": 0}

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

        generar_resumen(
            rutas["carpeta_principal"],
            rutas["resumen_txt"],
            codigo, nombre,
            proveedores, rutas, log_dict,
            log_detalle=log_lista,
            total_adjuntos_licitacion=total_adjuntos_lic,
        )

        # Etapa 6: fusión de anexos — antes de crear el ZIP para que quede incluido
        fusionar_anexos(proveedores, rutas, rutas["resumen_txt"])

        # FIX BUG-13: capturar OSError en la creación del ZIP y reportarlo
        # correctamente al backend en lugar de dejar el proceso colgado.
        carpeta_principal = Path(rutas["carpeta_principal"])
        zip_path = None
        try:
            zip_path = carpeta_base / f"{carpeta_principal.name}.zip"
            _crear_zip(carpeta_principal, zip_path)
        except OSError as e:
            print(f"[ERROR] No se pudo crear el ZIP: {e}", file=sys.stderr)
            zip_path = None

        # Estas líneas son leídas por el backend Django
        print(f"CARPETA_PATH:{rutas['carpeta_principal']}")
        if zip_path and zip_path.exists():
            print(f"ZIP_PATH:{zip_path}")

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
