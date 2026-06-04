"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 5
  Generación del archivo resumen.txt
=============================================================
"""

import os
import sys
from datetime import datetime

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ─────────────────────────────────────────────
#  PRIVADO
# ─────────────────────────────────────────────
def _contar_archivos(carpeta: str) -> int:
    """Cuenta archivos (no directorios) en una carpeta. Retorna 0 si no existe."""
    try:
        return len([f for f in os.listdir(carpeta)
                    if os.path.isfile(os.path.join(carpeta, f))])
    except OSError:
        return 0


def _hay_archivo_pdf(carpeta: str) -> bool:
    """Verifica si hay al menos un PDF en la carpeta."""
    try:
        return any(f.lower().endswith('.pdf') for f in os.listdir(carpeta))
    except OSError:
        return False


def _estado_ficha(carpeta_ficha: str, ficha_ok_log: bool) -> str:
    if _hay_archivo_pdf(carpeta_ficha):
        return "Descargada"
    if ficha_ok_log:
        return "Descargada"
    return "No disponible"


def _estado_anexos(carpeta: str, count_log: int) -> str:
    count_disco = _contar_archivos(carpeta)
    total = max(count_disco, count_log)
    if total == 0:
        return "Vacio"
    return f"{total} archivo(s)"


# ─────────────────────────────────────────────
#  FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────
def generar_resumen(
    carpeta_principal: str,
    resumen_txt_path:  str,
    codigo:            str,
    nombre:            str,
    proveedores:       list,
    rutas:             dict,
    log:               dict
) -> str:
    """
    Genera resumen.txt con el detalle de todo lo descargado.

    Parámetros
    ----------
    carpeta_principal : path raíz de la descarga
    resumen_txt_path  : path donde escribir resumen.txt
    codigo            : código de la licitación
    nombre            : nombre de la licitación
    proveedores       : lista de dicts (de etapa1)
    rutas             : dict de rutas (de etapa2)
    log               : {'a': {'ficha_ok': bool, 'admin': int, 'tec': int, 'econ': int}, ...}

    Retorna
    -------
    path absoluto de resumen.txt
    """
    print("\n[INFO] Generando resumen.txt...")

    sep   = "=" * 60
    sep_m = "-" * 60
    fecha = datetime.now().strftime("%d/%m/%Y %H:%M")
    lineas = []

    # ── Encabezado ──────────────────────────────────────────────
    lineas += [
        sep,
        "  RESUMEN DESCARGA OFERTAS",
        sep,
        f"  Licitacion : {codigo}",
        f"  Nombre     : {nombre}",
        f"  Fecha      : {fecha}",
        f"  Total ofertas: {len(proveedores)}",
        sep,
    ]

    # ── Detalle por proveedor ────────────────────────────────────
    for p in proveedores:
        letra = p["letra"]
        log_p = log.get(letra, {"ficha_ok": False, "admin": 0, "tec": 0, "econ": 0})
        rutas_p = rutas.get("proveedores", {}).get(letra, {})

        ficha_estado = _estado_ficha(rutas_p.get("ficha", ""), log_p.get("ficha_ok", False))
        admin_estado = _estado_anexos(rutas_p.get("admin", ""), log_p.get("admin", 0))
        tec_estado   = _estado_anexos(rutas_p.get("tec",   ""), log_p.get("tec",   0))
        econ_estado  = _estado_anexos(rutas_p.get("econ",  ""), log_p.get("econ",  0))

        lineas += [
            "",
            f"[{letra.upper()}] {p['rut']} - {p['nombre']}",
            f"    Oferta  : {p.get('oferta', '-')}",
            f"    Total   : {p.get('total', '-')}",
            f"    Estado  : {p.get('estado', '-')}",
            f"    Ficha del Proveedor      : {ficha_estado}",
            f"    Anexos Administrativos   : {admin_estado}",
            f"    Anexos Tecnicos          : {tec_estado}",
            f"    Anexos Economicos        : {econ_estado}",
        ]

    # ── Totales ──────────────────────────────────────────────────
    total_fichas  = sum(1 for p in proveedores
                        if _estado_ficha(
                            rutas.get("proveedores", {}).get(p["letra"], {}).get("ficha", ""),
                            log.get(p["letra"], {}).get("ficha_ok", False)
                        ) == "Descargada")
    total_archivos = sum(
        _contar_archivos(rutas.get("proveedores", {}).get(p["letra"], {}).get("admin", "")) +
        _contar_archivos(rutas.get("proveedores", {}).get(p["letra"], {}).get("tec",   "")) +
        _contar_archivos(rutas.get("proveedores", {}).get(p["letra"], {}).get("econ",  ""))
        for p in proveedores
    )

    lineas += [
        "",
        sep,
        "  TOTALES",
        sep_m,
        f"  Fichas descargadas  : {total_fichas} / {len(proveedores)}",
        f"  Total anexos        : {total_archivos} archivo(s)",
        sep,
        "  FIN DEL PROCESO",
        sep,
    ]

    contenido = "\n".join(lineas)

    # ── Escribir archivo ─────────────────────────────────────────
    try:
        with open(resumen_txt_path, "w", encoding="utf-8") as f:
            f.write(contenido)
        print(f"[OK]   Resumen guardado en: {resumen_txt_path}")
    except OSError as e:
        print(f"[ERROR TÉCNICO] No se pudo escribir resumen.txt: {e}")
        print("[ERROR SIMPLE]  Verifica permisos en la carpeta de destino.")
        print("\n--- CONTENIDO DEL RESUMEN ---")
        print(contenido)

    return resumen_txt_path


# ─────────────────────────────────────────────
#  MAIN (prueba independiente)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        # Crear subcarpetas simuladas
        for sub in ["ficha_a", "admin_a", "tec_a", "econ_a",
                    "ficha_b", "admin_b", "tec_b", "econ_b"]:
            os.makedirs(os.path.join(tmp, sub), exist_ok=True)
        # Simular archivo descargado
        open(os.path.join(tmp, "admin_a", "ANEXO1.pdf"), "w").close()

        prov = [
            {"letra": "a", "rut": "76.680.253-2", "nombre": "NORTHFITT LTDA",
             "oferta": "OFERTA A", "total": "$5.000.000", "estado": "Aceptada",
             "fila_index": 0},
            {"letra": "b", "rut": "88.123.456-7", "nombre": "OTRO PROVEEDOR",
             "oferta": "OFERTA B", "total": "$3.000.000", "estado": "Vigente",
             "fila_index": 1},
        ]
        rutas = {
            "carpeta_principal": tmp,
            "resumen_txt": os.path.join(tmp, "resumen.txt"),
            "proveedores": {
                "a": {"raiz": tmp, "ficha": os.path.join(tmp, "ficha_a"),
                      "admin": os.path.join(tmp, "admin_a"),
                      "tec": os.path.join(tmp, "tec_a"),
                      "econ": os.path.join(tmp, "econ_a")},
                "b": {"raiz": tmp, "ficha": os.path.join(tmp, "ficha_b"),
                      "admin": os.path.join(tmp, "admin_b"),
                      "tec": os.path.join(tmp, "tec_b"),
                      "econ": os.path.join(tmp, "econ_b")},
            }
        }
        log = {
            "a": {"ficha_ok": True,  "admin": 1, "tec": 0, "econ": 0},
            "b": {"ficha_ok": False, "admin": 0, "tec": 0, "econ": 0},
        }

        ruta = generar_resumen(tmp, os.path.join(tmp, "resumen.txt"),
                               "3447-243-L125", "Suministro de Flexibles",
                               prov, rutas, log)
        print("\n--- CONTENIDO GENERADO ---")
        with open(ruta, encoding="utf-8") as f:
            print(f.read())
