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
MAX_NOMBRE_FICHA = 40
CARPETAS_TIPO    = ["Anexos Administrativos", "Anexos Tecnicos", "Anexos Economicos"]
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
#  FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────
def crear_estructura(codigo: str, nombre_licitacion: str, proveedores: list, carpeta_base: Path = None) -> dict:
    """
    Crea la estructura de carpetas para la licitación.

    Parámetros
    ----------
    codigo           : código de licitación (ej. '3447-243-L125')
    nombre_licitacion: nombre legible de la licitación
    proveedores      : lista de dicts con keys letra, rut, nombre
    carpeta_base     : Path base donde crear la carpeta. Si es None, usa el Escritorio.

    Retorna
    -------
    dict con claves:
        carpeta_principal : str  – path absoluto de la carpeta raíz
        resumen_txt       : str  – path absoluto de resumen.txt
        proveedores       : dict – rutas por letra de proveedor
    """
    print("\n[INFO] Creando estructura de carpetas...")

    # ── Carpeta raíz ──────────────────────────────────────────────
    nombre_raiz = _sanitizar(f"Ofertas-{codigo}-{nombre_licitacion}", MAX_PATH_RAIZ)
    base = carpeta_base if carpeta_base is not None else _escritorio()
    carpeta_principal = base / nombre_raiz

    try:
        carpeta_principal.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(f"[ERROR TÉCNICO] No se pudo crear la carpeta principal: {e}")
        print("[ERROR SIMPLE]  Verifica que tienes permisos de escritura en el Escritorio.")
        sys.exit(1)

    # ── resumen.txt vacío (placeholder) ───────────────────────────
    resumen_path = carpeta_principal / "resumen.txt"
    if not resumen_path.exists():
        resumen_path.touch()

    # ── Carpetas por proveedor ─────────────────────────────────────
    rutas_proveedores = {}

    for p in proveedores:
        letra  = p["letra"]
        rut    = _sanitizar(p["rut"],    30)
        nombre = _sanitizar(p["nombre"], 80)
        nombre_ficha = _sanitizar(p["nombre"], MAX_NOMBRE_FICHA)

        carpeta_prov  = carpeta_principal / f"{letra}) {rut} - {nombre}"
        carpeta_ficha = carpeta_prov / f"Ficha del Proveedor-{nombre_ficha}"

        try:
            carpeta_prov.mkdir(exist_ok=True)
            carpeta_ficha.mkdir(exist_ok=True)
            for tipo in CARPETAS_TIPO:
                (carpeta_prov / tipo).mkdir(exist_ok=True)
        except OSError as e:
            print(f"[WARN] No se pudo crear subcarpeta para [{letra.upper()}] {nombre}: {e}")
            continue

        rutas_proveedores[letra] = {
            "raiz":  str(carpeta_prov),
            "ficha": str(carpeta_ficha),
            "admin": str(carpeta_prov / "Anexos Administrativos"),
            "tec":   str(carpeta_prov / "Anexos Tecnicos"),
            "econ":  str(carpeta_prov / "Anexos Economicos"),
        }
        print(f"[OK]   [{letra.upper()}] Carpeta creada: {carpeta_prov.name}")

    print(f"[OK]   Estructura lista en: {carpeta_principal}")

    return {
        "carpeta_principal": str(carpeta_principal),
        "resumen_txt":       str(resumen_path),
        "proveedores":       rutas_proveedores,
    }


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
    print(f"Principal : {resultado['carpeta_principal']}")
    print(f"Resumen   : {resultado['resumen_txt']}")
    for letra, rutas in resultado["proveedores"].items():
        print(f"[{letra.upper()}] ficha={rutas['ficha']}")
