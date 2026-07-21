"""
=============================================================
  SCRAPER MERCADO PÚBLICO - SCRIPT PRINCIPAL
  Integra las 6 etapas del proceso de descarga de ofertas
=============================================================
  Uso: python scraper_mp.py
  Ingresa el código de licitación cuando se solicite.
=============================================================
"""

import os
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from etapa1_navegacion import (
    iniciar_chrome,
    buscar_licitacion,
    entrar_ficha,
    obtener_nombre_licitacion,
    abrir_cuadro_ofertas,
    extraer_proveedores,
    mostrar_resumen_proveedores,
)
from etapa2_carpetas  import crear_carpeta_principal, crear_carpetas_proveedores
from etapa3_adjuntos  import descargar_adjuntos_licitacion
from etapa4_anexos    import descargar_anexos_proveedor
from etapa5_resumen   import generar_resumen
from etapa6_fusion    import fusionar_anexos


# ─────────────────────────────────────────────
#  BANNER
# ─────────────────────────────────────────────
def _banner(titulo: str):
    print("\n" + "=" * 60)
    print(f"  {titulo}")
    print("=" * 60)


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────
def main():
    _banner("SCRAPER MERCADO PÚBLICO - DESCARGA DE OFERTAS")

    codigo = input("\nIngresa el código de licitación (ej: 1502-18-LE25): ").strip()
    codigo = codigo.lstrip('﻿')  # strip BOM si se pipea desde PowerShell
    if not codigo:
        print("[ERROR] Debes ingresar un código de licitación.")
        sys.exit(1)

    driver = iniciar_chrome()

    try:
        # ── ETAPA 1: Navegación y extracción ───────────────────
        _banner("ETAPA 1 - Buscando licitación")

        if not buscar_licitacion(driver, codigo):
            print("[ERROR SIMPLE]  No se pudo buscar la licitación.")
            sys.exit(1)

        if not entrar_ficha(driver, codigo):
            print("[ERROR SIMPLE]  No se encontró la licitación en los resultados.")
            sys.exit(1)

        nombre = obtener_nombre_licitacion(driver)

        # ── ETAPA 2: Carpeta principal + Documentos Anexos ─────
        # Se crea ANTES de abrir el Cuadro de Ofertas para poder descargar
        # los adjuntos propios de la licitación (botón "Ver Adjuntos").
        _banner("ETAPA 2 - Creando carpeta principal de la licitación")
        rutas = crear_carpeta_principal(codigo, nombre)

        # ── ETAPA 3: Documentos Anexos de la licitación ("Ver Adjuntos") ─
        # Reemplaza la antigua descarga de "Ficha del Proveedor" (portal
        # externo con errores de carga frecuentes).
        _banner("ETAPA 3 - Descargando Documentos Anexos de la licitación")
        total_adjuntos_lic = descargar_adjuntos_licitacion(
            driver, rutas["documentos_anexos"]
        )

        if not abrir_cuadro_ofertas(driver):
            print("[ERROR SIMPLE]  Esta licitación no tiene cuadro de ofertas público.")
            sys.exit(1)

        proveedores = extraer_proveedores(driver)
        if not proveedores:
            print("[ERROR SIMPLE]  No se encontraron proveedores en el cuadro de ofertas.")
            sys.exit(1)

        mostrar_resumen_proveedores(proveedores, codigo, nombre)

        # ── Carpetas por proveedor (dentro de la carpeta ya creada) ─
        rutas["proveedores"] = crear_carpetas_proveedores(
            rutas["carpeta_principal"], proveedores
        )

        # Guardar el handle de la ventana del cuadro de ofertas
        # IMPORTANTE: el cuadro vive en un frameset con frame 'Cuerpo'
        # Siempre volver a default_content antes de entrar a ese frame
        driver.switch_to.default_content()
        cuadro_handle = driver.current_window_handle
        log_dict  = {}   # {letra: {admin, tec, econ}}  → para resumen
        log_lista = []   # lista de eventos detallados   → para etapa 4

        # ── ETAPA 4: Descargas de anexos por proveedor ─────────
        _banner("ETAPA 4 - Descargando anexos por proveedor")

        for p in proveedores:
            letra   = p["letra"]
            rutas_p = rutas["proveedores"].get(letra, {})
            log_dict[letra] = {"admin": 0, "tec": 0, "econ": 0}

            print(f"\n{'─' * 60}")
            print(f"  PROVEEDOR [{letra.upper()}] {p['rut']} - {p['nombre']}")
            print(f"{'─' * 60}")

            try:
                driver.switch_to.window(cuadro_handle)
                conteo = descargar_anexos_proveedor(
                    driver, p, rutas_p, log_lista
                )
                log_dict[letra]["admin"] = conteo["admin"]
                log_dict[letra]["tec"]   = conteo["tec"]
                log_dict[letra]["econ"]  = conteo["econ"]
            except Exception as e:
                print(f"[WARN] Error en anexos de [{letra.upper()}]: {e}")
                try:
                    driver.switch_to.window(cuadro_handle)
                except Exception:
                    pass

        # ── ETAPA 5: Resumen ───────────────────────────────────
        _banner("ETAPA 5 - Generando resumen")
        generar_resumen(
            rutas["carpeta_principal"],
            rutas["resumen_txt"],
            codigo, nombre,
            proveedores, rutas, log_dict,
            log_detalle=log_lista,
            total_adjuntos_licitacion=total_adjuntos_lic,
        )

        # ── ETAPA 6: Fusión de anexos ──────────────────────────
        _banner("ETAPA 6 - Fusionando anexos (PDF + Word por carpeta)")
        fusionar_anexos(proveedores, rutas, rutas["resumen_txt"])

        # ── Fin ────────────────────────────────────────────────
        _banner("PROCESO COMPLETADO")
        print(f"  Archivos guardados en:")
        print(f"  {rutas['carpeta_principal']}")
        print(f"\n  Resumen: {rutas['resumen_txt']}")
        print("=" * 60)

    except KeyboardInterrupt:
        print("\n[INFO] Proceso interrumpido por el usuario.")

    finally:
        try:
            input("\nPresiona ENTER para cerrar el navegador...")
        except EOFError:
            pass
        driver.quit()
        print("[INFO] Navegador cerrado.")


if __name__ == "__main__":
    main()
