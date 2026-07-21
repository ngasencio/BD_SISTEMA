"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 2
  Creación de estructura de carpetas
=============================================================
"""

import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ─────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────
MAX_PATH_RAIZ    = 120
CARPETAS_TIPO    = ["Anexos Administrativos", "Anexos Tecnicos", "Anexos Economicos"]
CARPETA_DOC_ANEXOS = "Documentos Anexos"   # adjuntos propios de la licitación (Ver Adjuntos)
CHARS_INVALIDOS  = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']


# ─────────────────────────────────────────────
#  PRIVADO
# ─────────────────────────────────────────────
def _sanitizar(texto: str, max_len: int) -> str:
    """Elimina caracteres inválidos en nombres de carpeta Windows y trunca."""
    for ch in CHARS_INVALIDOS:
        texto = texto.replace(ch, '-')
    # Colapsar espacios múltiples
    while '  ' in texto:
        texto = texto.replace('  ', ' ')
    # Windows no permite nombres que terminen en punto o espacio
    texto = texto.rstrip('. ')
    texto = texto[:max_len].rstrip('. ')
    return texto.strip() or '_sin_nombre'


def _escritorio() -> Path:
    """Retorna la ruta al Escritorio del usuario (OneDrive o clásico)."""
    home = Path.home()
    candidatos = [
        home / "OneDrive" / "Escritorio",
        home / "OneDrive" / "Desktop",
        home / "Desktop",
        home / "Escritorio",
    ]
    for c in candidatos:
        if c.exists():
            return c
    # Si ninguno existe, usar el primero (OneDrive/Escritorio) y dejar que mkdir lo cree
    return candidatos[0]


# ─────────────────────────────────────────────
#  CARPETA PRINCIPAL (nivel licitación)
# ─────────────────────────────────────────────
def crear_carpeta_principal(codigo: str, nombre_licitacion: str, carpeta_base: Path = None) -> dict:
    """
    Crea la carpeta raíz de la licitación junto con "Documentos Anexos"
    (adjuntos propios de la ficha — botón "Ver Adjuntos", descargados por
    etapa3_adjuntos.py ANTES de abrir el Cuadro de Ofertas).

    Se llama primero, antes de conocer los proveedores, para poder descargar
    los adjuntos de la licitación tan pronto se entra a la ficha.

    Retorna
    -------
    dict con claves:
        carpeta_principal  : str – path absoluto de la carpeta raíz
        resumen_txt        : str – path absoluto de resumen.txt
        documentos_anexos  : str – path absoluto de "Documentos Anexos"
    """
    print("\n[INFO] Creando carpeta principal de la licitación...")

    nombre_raiz = _sanitizar(f"Ofertas-{codigo}-{nombre_licitacion}", MAX_PATH_RAIZ)
    base = carpeta_base if carpeta_base is not None else _escritorio()
    carpeta_principal = base / nombre_raiz

    try:
        carpeta_principal.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(f"[ERROR TÉCNICO] No se pudo crear la carpeta principal: {e}")
        print("[ERROR SIMPLE]  Verifica que tienes permisos de escritura en el Escritorio.")
        sys.exit(1)

    resumen_path = carpeta_principal / "resumen.txt"
    if not resumen_path.exists():
        resumen_path.touch()

    carpeta_doc_anexos = carpeta_principal / CARPETA_DOC_ANEXOS
    try:
        carpeta_doc_anexos.mkdir(exist_ok=True)
    except OSError as e:
        print(f"[WARN] No se pudo crear '{CARPETA_DOC_ANEXOS}': {e}")

    print(f"[OK]   Carpeta principal lista en: {carpeta_principal}")

    return {
        "carpeta_principal": str(carpeta_principal),
        "resumen_txt":       str(resumen_path),
        "documentos_anexos": str(carpeta_doc_anexos),
        "proveedores":       {},
    }


# ─────────────────────────────────────────────
#  CARPETAS POR PROVEEDOR
# ─────────────────────────────────────────────
def crear_carpetas_proveedores(carpeta_principal: "str | Path", proveedores: list) -> dict:
    """
    Crea las subcarpetas de anexos (Administrativos/Técnicos/Económicos) para
    cada proveedor, dentro de la carpeta raíz ya creada por crear_carpeta_principal().

    Ya no crea "Ficha del Proveedor": ese paso fue eliminado (el portal de
    fichas de proveedor presentaba errores de carga frecuentes) y reemplazado
    por la descarga de "Documentos Anexos" a nivel de licitación.

    Retorna dict {letra: {raiz, admin, tec, econ}}.
    """
    print("\n[INFO] Creando carpetas por proveedor...")
    carpeta_principal = Path(carpeta_principal)
    rutas_proveedores = {}

    for p in proveedores:
        letra  = p["letra"]
        rut    = _sanitizar(p["rut"],    30)
        nombre = _sanitizar(p["nombre"], 80)

        carpeta_prov = carpeta_principal / f"{letra}) {rut} - {nombre}"

        try:
            carpeta_prov.mkdir(exist_ok=True)
            for tipo in CARPETAS_TIPO:
                (carpeta_prov / tipo).mkdir(exist_ok=True)
        except OSError as e:
            print(f"[WARN] No se pudo crear subcarpeta para [{letra.upper()}] {nombre}: {e}")
            continue

        rutas_proveedores[letra] = {
            "raiz":  str(carpeta_prov),
            "admin": str(carpeta_prov / "Anexos Administrativos"),
            "tec":   str(carpeta_prov / "Anexos Tecnicos"),
            "econ":  str(carpeta_prov / "Anexos Economicos"),
        }
        print(f"[OK]   [{letra.upper()}] Carpeta creada: {carpeta_prov.name}")

    print(f"[OK]   {len(rutas_proveedores)} carpeta(s) de proveedor listas.")
    return rutas_proveedores


# ─────────────────────────────────────────────
#  FUNCIÓN COMBINADA (compatibilidad / uso standalone)
# ─────────────────────────────────────────────
def crear_estructura(codigo: str, nombre_licitacion: str, proveedores: list, carpeta_base: Path = None) -> dict:
    """
    Crea la estructura completa (carpeta principal + Documentos Anexos +
    carpetas por proveedor) en una sola llamada. Combina crear_carpeta_principal()
    y crear_carpetas_proveedores() — útil para pruebas standalone o cuando ya
    se conocen los proveedores de antemano.
    """
    rutas = crear_carpeta_principal(codigo, nombre_licitacion, carpeta_base)
    rutas["proveedores"] = crear_carpetas_proveedores(rutas["carpeta_principal"], proveedores)
    return rutas


# ─────────────────────────────────────────────
#  MAIN (prueba independiente)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    proveedores_prueba = [
        {"letra": "a", "rut": "76.680.253-2", "nombre": "NORTHFITT LTDA",
         "oferta": "OFERTA 1", "total": "$1.000.000", "estado": "Vigente", "fila_index": 0},
        {"letra": "b", "rut": "88.123.456-7", "nombre": "PROVEEDOR DOS S.A.",
         "oferta": "OFERTA 2", "total": "$2.000.000", "estado": "Vigente", "fila_index": 1},
    ]
    resultado = crear_estructura("3447-243-L125", "Suministro de Flexibles Hidráulicos",
                                  proveedores_prueba)
    print("\n--- Rutas generadas ---")
    print(f"Principal        : {resultado['carpeta_principal']}")
    print(f"Resumen          : {resultado['resumen_txt']}")
    print(f"Documentos Anexos: {resultado['documentos_anexos']}")
    for letra, rutas in resultado["proveedores"].items():
        print(f"[{letra.upper()}] admin={rutas['admin']}")
