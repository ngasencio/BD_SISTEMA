"""
=============================================================
  SCRAPER MERCADO PÚBLICO - ETAPA 6
  Fusión de anexos por carpeta de proveedor

  Para cada empresa y cada tipo de anexo (Administrativos,
  Técnicos, Económicos):
    1. Convierte .doc/.docx → PDF via Word COM (pywin32)
    2. Fusiona todos los PDFs en "Anexo Completo {Tipo} - {Empresa}.pdf"
    3. Convive con los archivos originales (no los elimina)
    4. Agrega estadísticas al resumen.txt existente (append)

  Dependencias: pip install pypdf pywin32
=============================================================
"""

import os
import sys
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ─────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────
TIPOS = [
    ("admin", "Administrativos"),
    ("tec",   "Técnicos"),
    ("econ",  "Económicos"),
]

EXTS_PDF  = {".pdf"}
EXTS_WORD = {".doc", ".docx"}
PREFIJO_FUSION = "Anexo Completo"   # archivos ya fusionados — se excluyen del scan

NOMBRE_MAX = 60   # caracteres máximos del nombre de empresa en el filename


# ─────────────────────────────────────────────
#  DEPENDENCIAS
# ─────────────────────────────────────────────
def _verificar_dependencias() -> bool:
    """Instala pypdf y pywin32 si no están disponibles. Retorna True si todo OK."""
    faltantes = []
    try:
        import pypdf  # noqa: F401
    except ImportError:
        faltantes.append("pypdf")
    try:
        import win32com.client  # noqa: F401
    except ImportError:
        faltantes.append("pywin32")

    if not faltantes:
        return True

    print(f"[INFO] Instalando dependencias faltantes: {', '.join(faltantes)}")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install"] + faltantes,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print("[OK]   Dependencias instaladas correctamente.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] No se pudieron instalar dependencias: {e}")
        return False


# ─────────────────────────────────────────────
#  UTILIDADES
# ─────────────────────────────────────────────
CHARS_INVALIDOS = set(r'/\:*?"<>|')

def _sanitizar_nombre(nombre: str) -> str:
    """Elimina caracteres inválidos para nombres de archivo Windows y trunca."""
    limpio = "".join(c if c not in CHARS_INVALIDOS else "-" for c in nombre)
    limpio = " ".join(limpio.split())   # colapsar espacios múltiples
    return limpio[:NOMBRE_MAX].strip("-").strip()


def _listar_carpeta(carpeta: str) -> tuple[list[str], list[str]]:
    """
    Retorna (pdfs, words) — rutas absolutas de archivos en la carpeta.
    Excluye archivos que ya son fusionados (prefijo 'Anexo Completo').
    """
    pdfs  = []
    words = []
    try:
        for nombre in sorted(os.listdir(carpeta)):
            if nombre.startswith(PREFIJO_FUSION):
                continue
            ruta = os.path.join(carpeta, nombre)
            if not os.path.isfile(ruta):
                continue
            ext = Path(nombre).suffix.lower()
            if ext in EXTS_PDF:
                pdfs.append(ruta)
            elif ext in EXTS_WORD:
                words.append(ruta)
    except OSError:
        pass
    return pdfs, words


# ─────────────────────────────────────────────
#  WORD COM
# ─────────────────────────────────────────────
def _iniciar_word():
    """
    Abre una instancia silenciosa de Microsoft Word via COM.
    Retorna el objeto word_app, o None si Word no está disponible.
    Llama a CoInitialize para ser seguro desde hilos secundarios (Django ETL).
    """
    try:
        import pythoncom
        import win32com.client
        pythoncom.CoInitialize()
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0   # wdAlertsNone — sin diálogos de seguridad
        print("[OK]   Microsoft Word COM iniciado.")
        return word
    except Exception as e:
        print(f"[WARN] No se pudo iniciar Word COM: {e}")
        print("[WARN] Los archivos Word serán omitidos en la fusión.")
        return None


def _cerrar_word(word_app) -> None:
    """Cierra Word COM y libera el apartamento COM."""
    if word_app is None:
        return
    try:
        word_app.Quit()
    except Exception:
        pass
    try:
        import pythoncom
        pythoncom.CoUninitialize()
    except Exception:
        pass
    print("[OK]   Microsoft Word COM cerrado.")


def _word_a_pdf(doc_path: str, carpeta_tmp: str, word_app) -> "str | None":
    """
    Convierte un archivo Word a PDF usando Word COM.
    Guarda el PDF en carpeta_tmp con el mismo nombre base + .pdf.
    Retorna la ruta del PDF generado, o None si falla.
    """
    if word_app is None:
        return None

    nombre_base = Path(doc_path).stem
    pdf_destino = os.path.join(carpeta_tmp, f"{nombre_base}.pdf")
    abs_doc = os.path.abspath(doc_path)

    doc = None
    try:
        doc = word_app.Documents.Open(abs_doc, ReadOnly=True)
        # FileFormat 17 = wdFormatPDF
        doc.SaveAs2(os.path.abspath(pdf_destino), FileFormat=17)
        return pdf_destino
    except Exception as e:
        print(f"[WARN] Word→PDF falló [{os.path.basename(doc_path)}]: {e}")
        return None
    finally:
        if doc is not None:
            try:
                doc.Close(SaveChanges=False)
            except Exception:
                pass


# ─────────────────────────────────────────────
#  FUSIÓN PDF
# ─────────────────────────────────────────────
def _fusionar_pdfs(lista_pdfs: list[str], ruta_salida: str) -> tuple[int, list[str]]:
    """
    Fusiona lista_pdfs en ruta_salida usando pypdf.
    Retorna (páginas_totales, lista_de_fallidos).
    """
    from pypdf import PdfWriter, PdfReader
    from pypdf.errors import PdfReadError

    writer   = PdfWriter()
    fallidos = []
    paginas  = 0

    for pdf_path in lista_pdfs:
        try:
            reader = PdfReader(pdf_path)
            for page in reader.pages:
                writer.add_page(page)
                paginas += 1
        except PdfReadError as e:
            print(f"[WARN] PDF ilegible [{os.path.basename(pdf_path)}]: {e}")
            fallidos.append(os.path.basename(pdf_path))
        except Exception as e:
            print(f"[WARN] Error al leer PDF [{os.path.basename(pdf_path)}]: {e}")
            fallidos.append(os.path.basename(pdf_path))

    if paginas == 0:
        return 0, fallidos

    try:
        with open(ruta_salida, "wb") as f:
            writer.write(f)
    except OSError as e:
        print(f"[ERROR] No se pudo escribir fusionado: {e}")
        return 0, fallidos

    return paginas, fallidos


# ─────────────────────────────────────────────
#  PROCESAMIENTO POR CARPETA
# ─────────────────────────────────────────────
def _procesar_carpeta(
    carpeta:       str,
    nombre_empresa: str,
    etiqueta_tipo: str,
    word_app,
) -> dict:
    """
    Procesa una carpeta de un tipo de anexo para un proveedor.
    Retorna stats: {pdf_nativos, word_ok, word_fail, fusion_ok, paginas, nombre_archivo}.
    """
    stats = {
        "pdf_nativos":   0,
        "word_ok":       0,
        "word_fail":     0,
        "fusion_ok":     False,
        "parcial":       False,
        "paginas":       0,
        "nombre_archivo": "",
    }

    if not carpeta or not os.path.isdir(carpeta):
        return stats

    pdfs_nativos, words = _listar_carpeta(carpeta)
    stats["pdf_nativos"] = len(pdfs_nativos)

    if not pdfs_nativos and not words:
        return stats   # carpeta vacía — no crear fusionado

    # Convertir Word → PDF en carpeta temporal
    carpeta_tmp = os.path.join(carpeta, "_tmp_fusion")
    pdfs_convertidos = []
    if words:
        os.makedirs(carpeta_tmp, exist_ok=True)
        for doc_path in words:
            pdf_tmp = _word_a_pdf(doc_path, carpeta_tmp, word_app)
            if pdf_tmp and os.path.isfile(pdf_tmp):
                pdfs_convertidos.append(pdf_tmp)
                stats["word_ok"] += 1
            else:
                stats["word_fail"] += 1

    # Lista final: PDFs nativos primero, luego los convertidos de Word
    todos_pdfs = pdfs_nativos + pdfs_convertidos

    if not todos_pdfs:
        # Solo había Word y todos fallaron
        _limpiar_tmp(carpeta_tmp)
        return stats

    # Nombre del archivo fusionado
    nombre_san = _sanitizar_nombre(nombre_empresa)
    nombre_archivo = f"{PREFIJO_FUSION} {etiqueta_tipo} - {nombre_san}.pdf"
    ruta_salida = os.path.join(carpeta, nombre_archivo)

    paginas, fallidos_pdf = _fusionar_pdfs(todos_pdfs, ruta_salida)

    _limpiar_tmp(carpeta_tmp)

    if paginas > 0:
        stats["fusion_ok"]     = True
        stats["parcial"]       = bool(fallidos_pdf) or bool(stats["word_fail"])
        stats["paginas"]       = paginas
        stats["nombre_archivo"] = nombre_archivo
        estado = "parcial" if stats["parcial"] else "OK"
        print(f"[OK]   Fusionado ({estado}): {nombre_archivo} — {paginas} página(s)")
    else:
        print(f"[WARN] No se pudo crear fusionado para {etiqueta_tipo} / {nombre_empresa}")

    return stats


def _limpiar_tmp(carpeta_tmp: str) -> None:
    """Elimina la subcarpeta temporal de conversiones Word."""
    if os.path.isdir(carpeta_tmp):
        try:
            shutil.rmtree(carpeta_tmp)
        except Exception as e:
            print(f"[WARN] No se pudo limpiar carpeta temporal: {e}")


# ─────────────────────────────────────────────
#  APPEND AL RESUMEN
# ─────────────────────────────────────────────
def _append_resumen(resumen_txt_path: str, proveedores: list, stats_por_letra: dict) -> None:
    """
    Agrega la sección 'FUSIÓN DE ANEXOS' al final del resumen.txt existente.
    No sobreescribe nada — solo append.
    """
    sep   = "=" * 60
    sep_m = "-" * 60
    fecha = datetime.now().strftime("%d/%m/%Y %H:%M")
    lineas = [
        "",
        sep,
        "  FUSIÓN DE ANEXOS (ETAPA 6)",
        f"  Fecha : {fecha}",
        sep_m,
    ]

    total_pdf   = 0
    total_word  = 0
    total_fail  = 0
    total_fusionados = 0

    for p in proveedores:
        letra = p["letra"]
        nombre = p["nombre"]
        stats_p = stats_por_letra.get(letra, {})

        lineas.append(f"\n[{letra.upper()}] {p['rut']} - {nombre}")

        for clave, etiqueta in TIPOS:
            s = stats_p.get(clave, {})
            pdf_n = s.get("pdf_nativos", 0)
            w_ok  = s.get("word_ok", 0)
            w_fail= s.get("word_fail", 0)
            ok    = s.get("fusion_ok", False)
            parc  = s.get("parcial", False)
            pags  = s.get("paginas", 0)

            total_pdf  += pdf_n
            total_word += w_ok
            total_fail += w_fail

            if pdf_n == 0 and w_ok == 0 and w_fail == 0:
                lineas.append(f"    {etiqueta:<18}: sin archivos PDF/Word")
                continue

            estado_txt = "OK" if ok and not parc else ("parcial" if ok and parc else "FALLÓ")
            if ok:
                total_fusionados += 1

            partes = []
            if pdf_n:
                partes.append(f"{pdf_n} PDF")
            if w_ok:
                partes.append(f"{w_ok} Word convertido{'s' if w_ok > 1 else ''}")
            if w_fail:
                partes.append(f"{w_fail} Word falló")

            lineas.append(
                f"    {etiqueta:<18}: {' + '.join(partes)}"
                f" — {pags} pág. — Fusionado {estado_txt}"
            )

    lineas += [
        "",
        sep_m,
        "  TOTALES FUSIÓN",
        sep_m,
        f"  PDF nativos procesados  : {total_pdf}",
        f"  Word convertidos        : {total_word}",
        f"  Word con error          : {total_fail}",
        f"  Fusionados creados      : {total_fusionados}",
        sep,
    ]

    try:
        with open(resumen_txt_path, "a", encoding="utf-8") as f:
            f.write("\n".join(lineas) + "\n")
        print(f"[OK]   Estadísticas de fusión agregadas a: {resumen_txt_path}")
    except OSError as e:
        print(f"[ERROR] No se pudo escribir en resumen.txt: {e}")
        print("\n".join(lineas))


# ─────────────────────────────────────────────
#  FUNCIÓN PÚBLICA
# ─────────────────────────────────────────────
def fusionar_anexos(proveedores: list, rutas: dict, resumen_txt_path: str) -> dict:
    """
    Punto de entrada principal para la etapa 6.

    Parámetros
    ----------
    proveedores      : lista de dicts con {letra, nombre, rut, ...} (de etapa1)
    rutas            : dict con {proveedores: {letra: {admin, tec, econ}}} (de etapa2)
    resumen_txt_path : ruta al resumen.txt ya generado por etapa5

    Retorna dict con estadísticas globales.
    """
    print("\n[INFO] Iniciando fusión de anexos...")

    if not _verificar_dependencias():
        print("[ERROR] No se puede ejecutar la etapa 6 sin las dependencias.")
        return {}

    word_app = _iniciar_word()
    stats_por_letra = {}

    try:
        for p in proveedores:
            letra  = p["letra"]
            nombre = p["nombre"]
            rutas_p = rutas.get("proveedores", {}).get(letra, {})
            stats_por_letra[letra] = {}

            print(f"\n[INFO] Fusionando anexos de [{letra.upper()}] {nombre}")

            for clave, etiqueta in TIPOS:
                carpeta = rutas_p.get(clave, "")
                print(f"  → {etiqueta}...")
                stats = _procesar_carpeta(carpeta, nombre, etiqueta, word_app)
                stats_por_letra[letra][clave] = stats

    finally:
        _cerrar_word(word_app)

    _append_resumen(resumen_txt_path, proveedores, stats_por_letra)

    # Totales para retornar al caller
    total_fusionados = sum(
        1
        for s_letra in stats_por_letra.values()
        for s in s_letra.values()
        if s.get("fusion_ok")
    )
    print(f"\n[OK]   Etapa 6 completada — {total_fusionados} fusionado(s) creado(s).")
    return stats_por_letra


# ─────────────────────────────────────────────
#  MAIN (prueba independiente)
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import json

    if len(sys.argv) < 2:
        print("Uso: python etapa6_fusion.py <carpeta_licitacion>")
        print("     Procesa una carpeta ya descargada por el scraper.")
        sys.exit(1)

    raiz = Path(sys.argv[1])
    if not raiz.is_dir():
        print(f"[ERROR] Carpeta no encontrada: {raiz}")
        sys.exit(1)

    # Reconstruir proveedores y rutas escaneando la carpeta
    proveedores_test = []
    rutas_test = {"proveedores": {}}

    for sub in sorted(raiz.iterdir()):
        if not sub.is_dir():
            continue
        # Cada subcarpeta es un proveedor: nombre_carpeta = "[LETRA] RUT - NOMBRE"
        nombre_sub = sub.name
        if not nombre_sub.startswith("["):
            continue
        try:
            letra = nombre_sub[1]
            resto = nombre_sub[3:].strip()   # "RUT - NOMBRE"
            partes = resto.split(" - ", 1)
            rut    = partes[0].strip()
            nombre = partes[1].strip() if len(partes) > 1 else "Empresa"
        except Exception:
            continue

        proveedores_test.append({"letra": letra, "rut": rut, "nombre": nombre})
        rutas_test["proveedores"][letra] = {
            "admin": str(sub / "Anexos Administrativos"),
            "tec":   str(sub / "Anexos Técnicos"),
            "econ":  str(sub / "Anexos Económicos"),
        }

    resumen_txt = str(raiz / "resumen.txt")
    if not os.path.isfile(resumen_txt):
        # Crear resumen vacío para la prueba
        with open(resumen_txt, "w", encoding="utf-8") as f:
            f.write("(resumen de prueba)\n")

    if not proveedores_test:
        print("[WARN] No se encontraron subcarpetas de proveedores.")
        sys.exit(0)

    resultado = fusionar_anexos(proveedores_test, rutas_test, resumen_txt)
    print("\n--- ESTADÍSTICAS ---")
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
