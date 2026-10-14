"""Carga a la BD de los reportes de Formularios PAC del Panel SS Osorno.

Reportes (Panel › Reportes, `exportar.php`):
    totalpac       «Total PAC año actual»  → cabeceras de fichas  → FormularioPAC
    totalcarropac  «Total Carro PAC»       → líneas de producto   → FormularioPACProducto

La descarga (Selenium) vive en `api/data/data_formularios_pac/page_data_panel_pac.py`; este
módulo solo lee los archivos y sincroniza la BD, para poder probarlo sin navegador ni Panel.

Decisiones (verificadas contra los reportes reales del 2026-10-14):

- **Parseo por NOMBRE de columna y celda a celda**, no por posición con pandas: el HTML del
  Panel trae `<td>` sin cerrar y, a veces, una fila con una celda de menos (1 de 1.114 en la
  cabecera), lo que con un mapeo posicional corre todas las columnas siguientes (el `estado`
  terminaba en `monto`). Aquí una fila corta se realinea anclándose en los links de adjuntos
  o, si no se puede, se conserva la ficha tal como estaba en vez de guardar basura.
- **Cabecera = upsert** por (folio, anho) — `folio` es la columna `id` del Panel, única en
  todo el reporte — y se eliminan las fichas que ya no vienen, acotado a los años presentes
  en el archivo (misma regla que Formularios FSC) y con una guarda contra archivos truncados.
- **Carro = reemplazo por año**, no upsert: no tiene clave natural (hay líneas idénticas
  legítimas) y colapsarlas subestimaba montos (la suma del carro coincide con el monto de la
  cabecera en el 99 % de las fichas). Es todo-o-nada dentro de una transacción.
- Los links `excel adjunto` / `archivo post finanzas` NO se guardan: el Panel los exporta
  truncados a la carpeta, sin nombre de archivo.
"""
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

from django.db import transaction
from django.db.models import Count

from .models import FormularioPAC, FormularioPACEstadoLog, FormularioPACProducto

# Bandejas conocidas de una ficha PAC. Un valor fuera de esto en `estado` es una fila corrida.
_RE_ESTADO = re.compile(r'^[A-Z]{1,5}$')

# Fracción mínima del contenido ya cargado que debe traer un archivo para aceptar que borre.
# Un reporte truncado (error del Panel, descarga a medias) no debe vaciar la tabla.
FRACCION_MINIMA = 0.5

_BATCH = 500


class ReporteInvalido(Exception):
    """El archivo no es el reporte esperado o traería una carga destructiva sospechosa."""


# Cabecera del Panel (normalizada) → campo del modelo FormularioPAC.
_CAMPOS_CABECERA = {
    'id': 'folio',
    'fecha_ficha': 'fecha_ficha',
    'anho': 'anho',
    'accion_proyecto': 'accion_proyecto',
    'identificador_proyecto': 'identificador_proyecto',
    'departamento': 'departamento',
    'cargo_responsable': 'cargo_responsable',
    'nombre_responsable': 'nombre_responsable',
    'anexo': 'anexo',
    'correo': 'correo',
    'fecha_autorizacion_jefe': 'fecha_autorizacion_jefe',
    'nombre_jefatura': 'nombre_jefatura',
    'nombre_proyecto': 'nombre_proyecto',
    'tipo_requerimiento': 'tipo_requerimiento',
    'tipo_proyecto': 'tipo_proyecto',
    'recursos_programaticos': 'recursos_programaticos',
    'rec_prog_justificacion': 'rec_prog_justificacion',
    'nombre_programa': 'nombre_programa',
    'descripcion_adquisicion': 'descripcion_adquisicion',
    'objetivo_adquisicion': 'objetivo_adquisicion',
    'monto': 'monto',
    'estado': 'estado',
    'obs_rechazo': 'obs_rechazo',
    'fecha_rechazo': 'fecha_rechazo',
    'solicitante': 'solicitante',
}
_LINKS_ADJUNTOS = ('excel_adjunto', 'archivo_post_finanzas')
# Con menos de este número de fichas ya cargadas no se aplica la guarda contra archivos truncados
# (borrar 1 de 1 es legítimo; borrar 600 de 1.100 no).
_MIN_PARA_GUARDA = 20

_CAMPOS_CARRO = {
    'folio': 'folio',
    'anho': 'anho',
    'establecimiento': 'establecimiento',
    'categoria': 'categoria',
    'producto': 'producto',
    'monto': 'monto',
    'cantidad': 'cantidad',
    'unidad': 'unidad',
    'item_presupuestario': 'item_presupuestario',
    'mes_ejecucion': 'mes_ejecucion',
}

_CAMPOS_FECHA = {'fecha_ficha', 'fecha_autorizacion_jefe', 'fecha_rechazo'}

_MESES = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6, 'julio': 7,
    'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
}

_NULOS = {'', 'nan', 'none', 'null', 'na', 'n/a', '-', '--'}
# Marcas de "sin elegir" del formulario del Panel: no son un valor.
_PLACEHOLDER = re.compile(r'^\s*seleccione\.*\s*$', re.IGNORECASE)


# ─── Lectura del HTML ─────────────────────────────────────────────────────────

def _sin_tildes(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')


def normalizar_cabecera(texto):
    """'Fecha Autorizacion Jefe' → 'fecha_autorizacion_jefe'."""
    return re.sub(r'[^a-z0-9]+', '_', _sin_tildes(texto).lower()).strip('_')


def _decodificar(ruta):
    datos = Path(ruta).read_bytes()
    try:
        return datos.decode('utf-8')
    except UnicodeDecodeError:  # el Panel exporta en cp1252 (sin meta charset)
        return datos.decode('cp1252', errors='replace')


def leer_tabla_html(ruta):
    """(cabeceras normalizadas, filas) del primer <table> del reporte. Cada fila es la lista de
    textos de sus <td> tal cual vienen: NO se rellena ni se corre nada aquí."""
    import lxml.html

    texto = _decodificar(ruta)
    if '<table' not in texto.lower():
        raise ReporteInvalido(
            f'{Path(ruta).name} no contiene ninguna tabla (¿el Panel devolvió la página de login o un error?).')
    doc = lxml.html.fromstring(texto)
    tablas = doc.xpath('//table')
    if not tablas:
        raise ReporteInvalido(f'{Path(ruta).name} no contiene ninguna tabla.')
    tabla = (doc.xpath('//table[@id="TableDetailGeneral"]') or tablas)[0]
    cabeceras = [normalizar_cabecera(th.text_content()) for th in tabla.xpath('.//th')]
    filas = []
    for tr in tabla.xpath('.//tr'):
        celdas = tr.xpath('./td')
        if celdas:
            filas.append([' '.join(td.text_content().split()) for td in celdas])
    return cabeceras, filas


# ─── Conversión de valores ────────────────────────────────────────────────────

def a_texto(valor, maximo=None):
    """None para vacíos/placeholders; recorta al largo del campo (MariaDB estricto no trunca)."""
    if valor is None:
        return None
    s = str(valor).strip()
    if s.lower() in _NULOS or _PLACEHOLDER.match(s):
        return None
    return s[:maximo] if maximo else s


def a_entero(valor):
    """'108.183.000' → 108183000; '-5.668.124' → -5668124; '1.234,50' → 1234; si no es número → None."""
    s = a_texto(valor)
    if s is None:
        return None
    s = s.replace(' ', '')
    if ',' in s:  # decimales: se descarta la parte fraccionaria
        s = s.split(',')[0]
    s = s.replace('.', '')
    return int(s) if re.fullmatch(r'-?\d+', s) else None


def a_fecha(valor):
    s = a_texto(valor)
    if s is None:
        return None
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y'):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    return None


def interpretar_mes_ejecucion(valor, anho_ficha=None):
    """('enero-25') → ('enero-25', date(2025, 1, 1)). Sin año ('Abril') toma el de la ficha.
    El placeholder 'SELECCIONE...' y lo irreconocible dan fecha None."""
    texto = a_texto(valor, 30)
    if texto is None:
        return None, None
    m = re.fullmatch(r'([a-zA-ZáéíóúñÁÉÍÓÚÑ]+)(?:\s*[-/ ]\s*(\d{4}|\d{2}))?', texto)
    if not m:
        return texto, None
    mes = _MESES.get(_sin_tildes(m.group(1)).lower())
    if not mes:
        return texto, None
    y = m.group(2)
    anio = (2000 + int(y) if len(y) == 2 else int(y)) if y else anho_ficha
    if not anio or not 2015 <= anio <= 2045:
        return texto, None
    return texto, date(anio, mes, 1)


# ─── Cabeceras (fichas) ───────────────────────────────────────────────────────

def _realinear_fila(celdas, n_esperado, idx_primer_link):
    """Devuelve (celdas, estado): 'ok' | 'realineada' | 'ambigua'.

    Una fila con menos celdas que la cabecera perdió una `<td>`. Si el hueco está antes de los
    links de adjuntos (columnas de texto) se reconoce porque el primer link queda corrido
    exactamente tantas posiciones como celdas faltan: se inserta el vacío ahí y la cola
    (monto, estado, rechazo, solicitante) queda en su sitio. Cualquier otro caso no se puede
    saber → 'ambigua'."""
    if len(celdas) == n_esperado:
        return celdas, 'ok'
    faltan = n_esperado - len(celdas)
    if faltan <= 0:
        return celdas, 'ambigua'
    idx = next((i for i, c in enumerate(celdas) if c.lower().startswith('http')), None)
    if idx is not None and idx_primer_link is not None and idx + faltan == idx_primer_link:
        return celdas[:idx] + [''] * faltan + celdas[idx:], 'realineada'
    return celdas, 'ambigua'


def _registro_cabecera(fila_dict):
    """dict {campo_modelo: valor_crudo} → dict de valores listos para el modelo, o (None, motivo)."""
    folio = a_entero(fila_dict.get('folio'))
    anho = a_entero(fila_dict.get('anho'))
    if not folio or folio <= 0 or not anho or not 2000 <= anho <= 2100:
        return None, 'sin folio/año válidos'

    datos = {'folio': folio, 'anho': anho}
    for campo, crudo in fila_dict.items():
        if campo in ('folio', 'anho'):
            continue
        if campo in _CAMPOS_FECHA:
            datos[campo] = a_fecha(crudo)
        elif campo == 'monto':
            datos[campo] = a_entero(crudo)
        elif campo == 'estado':
            e = a_texto(crudo)
            e = e.upper() if e else None
            datos[campo] = e if e and _RE_ESTADO.match(e) else None
        elif campo == 'identificador_proyecto':
            datos[campo] = a_texto(crudo, 100)
        else:
            largo = FormularioPAC._meta.get_field(campo).max_length
            datos[campo] = a_texto(crudo, largo)
    return datos, None


def sincronizar_cabeceras(ruta, hoy=None, avisar=None, forzar=False):
    """Sincroniza FormularioPAC con el reporte `totalpac`. Devuelve el resumen de la carga."""
    hoy = hoy or date.today()
    avisar = avisar or (lambda *a, **k: None)
    cabeceras, filas = leer_tabla_html(ruta)

    faltan = [c for c in _CAMPOS_CABECERA if c not in cabeceras]
    if faltan:
        raise ReporteInvalido(
            f'El reporte de fichas PAC no trae las columnas {faltan}. ¿Cambió el Panel? '
            f'Columnas recibidas: {cabeceras}')
    pos = {c: cabeceras.index(c) for c in _CAMPOS_CABECERA}
    n = len(cabeceras)
    idx_primer_link = cabeceras.index(_LINKS_ADJUNTOS[0]) if _LINKS_ADJUNTOS[0] in cabeceras else None

    registros, vigentes, advertencias = {}, set(), []
    invalidas = realineadas = ambiguas = 0
    for celdas in filas:
        celdas, estado_fila = _realinear_fila(celdas, n, idx_primer_link)
        if estado_fila == 'ambigua':
            # La clave sí es confiable (columnas de la izquierda): se la considera vigente para
            # no borrar la ficha, pero no se actualiza con datos corridos.
            folio = a_entero(celdas[pos['id']]) if len(celdas) > pos['id'] else None
            anho = a_entero(celdas[pos['anho']]) if len(celdas) > pos['anho'] else None
            if folio and anho:
                vigentes.add((folio, anho))
            ambiguas += 1
            advertencias.append(f'Ficha {folio}/{anho}: la fila trae {len(celdas)} celdas de {n} y no se pudo '
                                'realinear; se conservó lo que ya había.')
            continue
        crudo = {_CAMPOS_CABECERA[c]: celdas[pos[c]] for c in _CAMPOS_CABECERA}
        datos, motivo = _registro_cabecera(crudo)
        if datos is None:
            invalidas += 1
            advertencias.append(f'Fila descartada ({motivo}): {celdas[:3]}')
            continue
        clave = (datos['folio'], datos['anho'])
        if clave in registros:
            advertencias.append(f'Ficha {clave[0]}/{clave[1]} repetida en el reporte; se usó la última.')
        if estado_fila == 'realineada':
            realineadas += 1
            advertencias.append(f'Ficha {clave[0]}/{clave[1]}: le faltaba una celda de texto; revisar sus '
                                'descripciones (el estado y el monto sí están bien).')
        if crudo.get('estado') and datos['estado'] is None:
            advertencias.append(f'Ficha {clave[0]}/{clave[1]}: estado «{crudo["estado"][:30]}» no es una bandeja; '
                                'quedó sin estado.')
        registros[clave] = datos
        vigentes.add(clave)

    anhos = {a for _, a in vigentes}
    nuevos = actualizados = sin_cambios = eliminados = 0
    borrado_omitido = False

    with transaction.atomic():
        existentes = {(f.folio, f.anho): f for f in FormularioPAC.objects.filter(anho__in=anhos)}
        campos_actualizables = [c for c in _CAMPOS_CABECERA.values() if c not in ('folio', 'anho')]

        crear, modificar = [], []
        for clave, datos in registros.items():
            obj = existentes.get(clave)
            if obj is None:
                crear.append(FormularioPAC(**datos))
                continue
            cambio = False
            for campo in campos_actualizables:
                if getattr(obj, campo) != datos[campo]:
                    setattr(obj, campo, datos[campo])
                    cambio = True
            if cambio:
                modificar.append(obj)
            else:
                sin_cambios += 1

        if crear:
            FormularioPAC.objects.bulk_create(crear, batch_size=_BATCH)
        if modificar:
            FormularioPAC.objects.bulk_update(modificar, campos_actualizables, batch_size=_BATCH)
        nuevos, actualizados = len(crear), len(modificar)

        # Fichas que ya no vienen (solo en los años que trae el archivo).
        a_borrar = [f.pk for clave, f in existentes.items() if clave not in vigentes]
        if a_borrar:
            if (len(existentes) >= _MIN_PARA_GUARDA and not forzar
                    and len(a_borrar) > (1 - FRACCION_MINIMA) * len(existentes)):
                borrado_omitido = True
                advertencias.append(
                    f'NO se eliminaron {len(a_borrar)} fichas de {len(existentes)}: el archivo parece '
                    'incompleto (guarda contra descargas truncadas).')
            else:
                FormularioPAC.objects.filter(pk__in=a_borrar).delete()
                eliminados = len(a_borrar)

        _registrar_cambios_de_estado(anhos, hoy)

    return {
        'filas': len(filas), 'nuevos': nuevos, 'actualizados': actualizados,
        'sin_cambios': sin_cambios, 'eliminados': eliminados,
        'invalidas': invalidas, 'realineadas': realineadas, 'ambiguas': ambiguas,
        'borrado_omitido': borrado_omitido, 'advertencias': advertencias,
        'anhos': sorted(anhos),
    }


def _registrar_cambios_de_estado(anhos, hoy):
    """Agrega una fila de historial por cada ficha cuyo estado difiere del último registrado
    (o que nunca se registró). Mismo criterio que `_registrar_cambio_estado` de FSC."""
    ultimo = {}
    for formulario_id, estado in (
        FormularioPACEstadoLog.objects.filter(formulario__anho__in=anhos)
        .order_by('id').values_list('formulario_id', 'estado')
    ):
        ultimo[formulario_id] = estado  # el último por id gana
    nuevos = [
        FormularioPACEstadoLog(formulario_id=pk, estado=estado, fecha_registro=hoy)
        for pk, estado in FormularioPAC.objects.filter(anho__in=anhos).exclude(estado__isnull=True)
        .values_list('pk', 'estado')
        if ultimo.get(pk) != estado
    ]
    if nuevos:
        FormularioPACEstadoLog.objects.bulk_create(nuevos, batch_size=_BATCH)
    return len(nuevos)


# ─── Carro (líneas de producto) ───────────────────────────────────────────────

def sincronizar_carro(ruta, avisar=None, forzar=False):
    """Reemplaza las líneas de los años presentes en el reporte `totalcarropac`.

    Todo-o-nada: si el archivo trae menos de la mitad de lo ya cargado para esos años
    (descarga truncada) lanza `ReporteInvalido` sin tocar nada."""
    avisar = avisar or (lambda *a, **k: None)
    cabeceras, filas = leer_tabla_html(ruta)
    faltan = [c for c in _CAMPOS_CARRO if c not in cabeceras]
    if faltan:
        raise ReporteInvalido(
            f'El reporte de carro PAC no trae las columnas {faltan}. ¿Cambió el Panel? '
            f'Columnas recibidas: {cabeceras}')
    pos = {c: cabeceras.index(c) for c in _CAMPOS_CARRO}
    n = len(cabeceras)

    lineas, contador, advertencias = [], {}, []
    invalidas = 0
    campo = FormularioPACProducto._meta.get_field
    for celdas in filas:
        if len(celdas) != n:
            invalidas += 1
            if len(advertencias) < 10:
                advertencias.append(f'Línea descartada: trae {len(celdas)} celdas de {n} ({celdas[:3]}).')
            continue
        folio, anho = a_entero(celdas[pos['folio']]), a_entero(celdas[pos['anho']])
        if not folio or folio <= 0 or not anho or not 2000 <= anho <= 2100:
            invalidas += 1
            if len(advertencias) < 10:
                advertencias.append(f'Línea descartada (sin folio/año válidos): {celdas[:3]}')
            continue
        contador[(folio, anho)] = contador.get((folio, anho), 0) + 1
        texto_mes, fecha_mes = interpretar_mes_ejecucion(celdas[pos['mes_ejecucion']], anho)
        lineas.append(FormularioPACProducto(
            folio=folio, anho=anho, linea=contador[(folio, anho)],
            establecimiento=a_texto(celdas[pos['establecimiento']], campo('establecimiento').max_length),
            categoria=a_texto(celdas[pos['categoria']], campo('categoria').max_length),
            producto=a_texto(celdas[pos['producto']]),
            monto=a_entero(celdas[pos['monto']]),
            cantidad=a_entero(celdas[pos['cantidad']]),
            unidad=a_texto(celdas[pos['unidad']], campo('unidad').max_length),
            item_presupuestario=a_texto(celdas[pos['item_presupuestario']], campo('item_presupuestario').max_length),
            mes_ejecucion=texto_mes, mes_ejecucion_fecha=fecha_mes,
        ))
    if invalidas > len(advertencias):
        advertencias.append(f'... y {invalidas - len(advertencias)} línea(s) descartada(s) más.')

    anhos = {l.anho for l in lineas}
    if not lineas:
        raise ReporteInvalido('El reporte de carro PAC no trae ninguna línea válida; no se modificó nada.')

    with transaction.atomic():
        previas = FormularioPACProducto.objects.filter(anho__in=anhos)
        n_previas = previas.count()
        if n_previas and len(lineas) < FRACCION_MINIMA * n_previas and not forzar:
            raise ReporteInvalido(
                f'El carro trae {len(lineas)} líneas y la BD ya tiene {n_previas} para esos años: parece '
                'una descarga incompleta, no se modificó nada.')
        previas.delete()
        FormularioPACProducto.objects.bulk_create(lineas, batch_size=1000)

    por_anho = dict(
        FormularioPACProducto.objects.filter(anho__in=anhos)
        .values_list('anho').annotate(n=Count('id')).order_by('anho')
    )
    return {
        'filas': len(filas), 'cargadas': len(lineas), 'previas': n_previas,
        'invalidas': invalidas, 'fichas': len(contador), 'anhos': sorted(anhos),
        'por_anho': por_anho, 'advertencias': advertencias,
    }


# ─── Orquestación ─────────────────────────────────────────────────────────────

def cargar_formularios_pac(archivos, progress_callback=None, hoy=None, forzar=False):
    """Carga los reportes descargados. `archivos`: {'cabecera': ruta, 'carro': ruta} (cualquiera
    puede faltar). Devuelve un resumen con las claves `nuevos/actualizados/eliminados/total`
    que usan las pantallas y la actualización diaria, más el detalle de cada reporte."""
    def _avisar(log=None, paso_desc=None, progreso_pct=None):
        if progress_callback:
            progress_callback(log=log, paso_desc=paso_desc, progreso_pct=progreso_pct)

    if not archivos:
        raise FileNotFoundError('No hay reportes de Formularios PAC para cargar.')

    resumen = {'cabeceras': None, 'carro': None}

    if archivos.get('cabecera'):
        _avisar(paso_desc='Sincronizando fichas PAC...', progreso_pct=55)
        r = sincronizar_cabeceras(archivos['cabecera'], hoy=hoy, avisar=_avisar, forzar=forzar)
        resumen['cabeceras'] = r
        for adv in r['advertencias']:
            _avisar(log=f'⚠️ {adv}')
        _avisar(log=(f"Fichas PAC → {r['nuevos']} nuevas, {r['actualizados']} actualizadas, "
                     f"{r['sin_cambios']} sin cambios, {r['eliminados']} eliminadas."))

    if archivos.get('carro'):
        _avisar(paso_desc='Sincronizando carro de productos PAC...', progreso_pct=80)
        r = sincronizar_carro(archivos['carro'], avisar=_avisar, forzar=forzar)
        resumen['carro'] = r
        for adv in r['advertencias']:
            _avisar(log=f'⚠️ {adv}')
        _avisar(log=f"Carro PAC → {r['cargadas']} líneas de {r['fichas']} fichas (había {r['previas']}).")

    cab, car = resumen['cabeceras'] or {}, resumen['carro'] or {}
    nuevos = cab.get('nuevos', 0)
    actualizados = cab.get('actualizados', 0)
    eliminados = cab.get('eliminados', 0)
    resumen.update(
        nuevos=nuevos, actualizados=actualizados, eliminados=eliminados,
        lineas_carro=car.get('cargadas', 0),
        total=cab.get('filas', 0) + car.get('cargadas', 0),
    )
    _avisar(log=(f"✅ Sincronización PAC completa: {nuevos} fichas nuevas, {actualizados} actualizadas, "
                 f"{eliminados} eliminadas; {resumen['lineas_carro']} líneas de carro."), progreso_pct=100)
    from .services_formularios_pac import invalidar_cache_formularios_pac
    invalidar_cache_formularios_pac()  # los KPIs cacheados dejan de ser válidos
    return resumen
