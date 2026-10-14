"""
Descarga automatizada de los reportes de Formularios PAC desde el Panel Documental SS Osorno
(https://panel.ssosorno.cl) vía Selenium, y carga de los datos a Django.

Es el mismo flujo que `data_panel/page_data_panel.py` (Formularios FSC) —mismo login, misma
página `exportar.php`— pero con otros botones. Se invoca desde el botón «Actualizar desde el
Panel» de Abastecimiento › Formularios › Formularios PAC (/api/formularios-pac/actualizar/),
desde la actualización diaria (`actualizacion_completa`) o directamente por CLI.

Reportes descargados (botones del panel):
    totalpac       → «Total PAC año actual»  cabeceras de las fichas  (total_pac_anho_*.xls)
    totalcarropac  → «Total Carro PAC»       productos de cada ficha  (total_carro_pac_*.xls)

El login y la descarga se reutilizan de `page_data_panel`; la lectura y la sincronización con
la BD viven en `backend/api/services_formularios_pac_etl.py` (así se pueden probar sin Panel).
"""
import sys
from pathlib import Path

RUTA_PAC = Path(__file__).parent.absolute()
RUTA_PANEL = RUTA_PAC.parent / "data_panel"
DOWNLOAD_DIR = RUTA_PAC
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

if str(RUTA_PANEL) not in sys.path:
    sys.path.insert(0, str(RUTA_PANEL))
import page_data_panel as panel  # noqa: E402  (login + descarga + _setup_django compartidos con FSC)

# id del botón de exportación → (prefijo de archivo final, clave usada por el cargador)
_BOTONES_REPORTES_PAC = [
    ("totalpac", "total_pac_anho", "cabecera"),
    ("totalcarropac", "total_carro_pac", "carro"),
]


def descargar_reportes_pac(rut, dv, clave, progress_callback=None):
    """Inicia sesión en el Panel y descarga los 2 reportes PAC.

    Retorna {tipo: Path} con tipo ∈ {"cabecera", "carro"} (solo los que se lograron bajar).
    """
    return panel.descargar_reportes_panel(
        rut, dv, clave, progress_callback,
        botones=_BOTONES_REPORTES_PAC, directorio=DOWNLOAD_DIR,
    )


def _archivos_locales_mas_recientes():
    """Si no se acaba de descargar, busca el último archivo de cada reporte en DOWNLOAD_DIR.

    Se acepta `<prefijo>.xls` (renombrado por la descarga) y `<prefijo>_<fecha>.xls` (nombre
    original del Panel). Se exige el `_` o la extensión justo después del prefijo para que
    `total_carro_pac` no recoja nada que solo empiece parecido."""
    archivos = {}
    for _, prefijo, tipo in _BOTONES_REPORTES_PAC:
        candidatos = [
            f for f in DOWNLOAD_DIR.iterdir()
            if f.suffix.lower() in (".xls", ".xlsx")
            and (f.stem == prefijo or f.stem.startswith(prefijo + "_"))
        ]
        if candidatos:
            archivos[tipo] = max(candidatos, key=lambda f: f.stat().st_mtime)
    return archivos


def cargar_formularios_pac_a_django(archivos=None, progress_callback=None, forzar=False):
    """Lee los reportes (recién descargados o los más recientes en disco) y sincroniza la BD.

    Ver `services_formularios_pac_etl` para las reglas de sincronización (cabeceras por
    upsert con borrado acotado a los años del archivo; carro por reemplazo de año)."""
    panel._setup_django()
    from api.services_formularios_pac_etl import cargar_formularios_pac
    from django.db import close_old_connections

    archivos = archivos or _archivos_locales_mas_recientes()
    if not archivos:
        raise FileNotFoundError(f"No hay reportes de Formularios PAC descargados en {DOWNLOAD_DIR}")
    close_old_connections()
    return cargar_formularios_pac(archivos, progress_callback=progress_callback, forzar=forzar)


def ejecutar_proceso_completo(rut=None, dv=None, clave=None, progress_callback=None):
    """Descarga los 2 reportes y los carga a Django — punto de entrada del dashboard y del job."""
    if not (rut and dv and clave):
        rut_env, dv_env, clave_env = panel._credenciales_por_defecto()
        rut, dv, clave = rut or rut_env, dv or dv_env, clave or clave_env
    if not (rut and dv and clave):
        raise ValueError(
            "Faltan credenciales del Panel SS Osorno. Defina PANEL_SSO_RUT, PANEL_SSO_DV "
            "y PANEL_SSO_CLAVE como variables de entorno, o pase rut/dv/clave explícitamente."
        )

    archivos = descargar_reportes_pac(rut, dv, clave, progress_callback=progress_callback)
    if not archivos:
        raise RuntimeError("No se pudo descargar ningún reporte PAC desde el Panel SS Osorno.")
    return cargar_formularios_pac_a_django(archivos, progress_callback=progress_callback)


if __name__ == "__main__":
    def _imprimir(**kw):
        print(kw.get("log") or kw.get("paso_desc") or "")

    print("=" * 60)
    print(" Descarga y carga de Formularios PAC — Panel SS Osorno")
    print("=" * 60)
    print("1. Descargar reportes y cargar a Django")
    print("2. Solo descargar reportes")
    print("3. Solo cargar a Django (usa los archivos más recientes en disco)")
    print("4. Cargar dos archivos indicados (cabecera y carro)")
    opcion = input("Seleccione una opción: ").strip()

    if opcion == "1":
        rut_in = input("RUT (sin DV): ").strip() or None
        dv_in = input("DV: ").strip() or None
        clave_in = input("Contraseña: ").strip() or None
        print(f"\nResumen: {ejecutar_proceso_completo(rut_in, dv_in, clave_in, progress_callback=_imprimir)}")
    elif opcion == "2":
        rut_in = input("RUT (sin DV): ").strip()
        dv_in = input("DV: ").strip()
        clave_in = input("Contraseña: ").strip()
        print(f"\nArchivos descargados: {descargar_reportes_pac(rut_in, dv_in, clave_in, progress_callback=_imprimir)}")
    elif opcion == "3":
        print(f"\nResumen: {cargar_formularios_pac_a_django(progress_callback=_imprimir)}")
    elif opcion == "4":
        cab = Path(input("Ruta del reporte de fichas (total_pac_anho_*.xls): ").strip().strip('"'))
        car = Path(input("Ruta del reporte de carro (total_carro_pac_*.xls): ").strip().strip('"'))
        print(f"\nResumen: {cargar_formularios_pac_a_django({'cabecera': cab, 'carro': car}, progress_callback=_imprimir)}")
    else:
        print("Opción inválida.")
