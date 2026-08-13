"""
Análisis de Ejecución Presupuestaria — Anexo N°1 (api_sigfe_anexo1).

Reconstruye en backend los cálculos que hacía client-side (Excel + JS) el
dashboard standalone `Dashboard_SSO_Integrado.html`, ahora leyendo
directamente `SigfeAnexo1` en vez de un archivo subido a mano. Cada función
pública de acá corresponde 1:1 a una vista de ese dashboard (comentario con
el nombre de la función JS original para poder auditar la migración).

Semántica de los datos confirmada contra la DB real (ver conversación de
diseño): dentro de un mismo (codigo_ue, anho, concepto_presupuestario),
`ley_presupuestos` solo viene poblado en el mes 1 (es el monto anual de la
Ley, no cambia mes a mes) — el resto de los meses trae 0. `requerimiento`,
`compromiso`, `devengado`, `efectivo` y `deuda_flotante` son en cambio
INCREMENTALES por mes (no acumulado YTD) — para obtener un acumulado de
varios meses hay que sumarlos. Por eso `_agregar()` usa `Max(ley)` pero
`Sum()` para el resto, igual que `agg()` en el HTML original.
"""
import re
from collections import defaultdict

from django.db.models import Max, Sum

from .models import SigfeAnexo1, DevengoSigfeAnual
from .services import _construir_hier_lookup, _resolver_hier

# Largos de código por nivel (N1=Subtítulo..N5=Detalle), mismo criterio
# documentado en el modelo ConceptoJerarquia — los códigos SIGFE son
# jerárquicos por prefijo, así que el código de un nivel es siempre el
# prefijo de ese largo del código completo.
_LARGOS_NIVEL_HIER = (2, 4, 7, 10, 12)

# =============================================================================
# Umbrales de negocio — preservados tal cual el dashboard original por vista
# (son distintos a propósito: cada uno mide algo distinto — instantáneo vs.
# proyectado, y "deuda flotante" no tiene el mismo peso relativo en cada
# análisis). No unificar sin pedir explícitamente el cambio de criterio.
# =============================================================================

# rAl (Alertas): deuda>1M => advertencia, deuda>100M => crítica
UMBRAL_DEUDA_ALERTAS_ADVERTENCIA = 1_000_000
UMBRAL_DEUDA_ALERTAS_CRITICA = 100_000_000

# rEx (Exportar): deuda>5M => amarilla, deuda>50M => roja
UMBRAL_DEUDA_EXPORTAR_AMARILLA = 5_000_000
UMBRAL_DEUDA_EXPORTAR_ROJA = 50_000_000

# rFin (Análisis Financiero): deuda>100M => media, deuda>500M => alta
UMBRAL_DEUDA_FINANCIERO_MEDIA = 100_000_000
UMBRAL_DEUDA_FINANCIERO_ALTA = 500_000_000

# rDf (Deuda Flotante): sobre valores en M$ (deuda/1e6) => 20/50 => 20M/50M
UMBRAL_DEUDA_FLOTANTE_AMBAR = 20_000_000
UMBRAL_DEUDA_FLOTANTE_ROJA = 50_000_000

# fP()/pbar(): banda genérica %Ejecución y %Pago instantáneos (res/dr)
BANDA_PCT_ROJO = 50
BANDA_PCT_AMARILLO = 80

# sf/br (pejPrj — % ejecución PROYECTADA a fin de año): banda distinta
# a propósito, una proyección tiene más margen que un valor instantáneo.
BANDA_PROYECCION_ROJO = 70
BANDA_PROYECCION_AMARILLO = 90

# sf: banda de respaldo cuando no hay proyección (pejPrj es None) y se usa
# el % ejecución actual (pejAct) en su lugar — más exigente que la de arriba.
BANDA_SEMAFORO_FALLBACK_ROJO = 50
BANDA_SEMAFORO_FALLBACK_AMARILLO = 75

# rDf: % Pago del último mes con datos
BANDA_PCT_PAGO_DEUDA_ROJO = 80
BANDA_PCT_PAGO_DEUDA_AMARILLO = 95

# rDf (tabla antigüedad): % Deuda/Devengado por subtítulo
BANDA_DEUDA_SOBRE_DEV_AMARILLO = 5
BANDA_DEUDA_SOBRE_DEV_ROJO = 20

# rAl: dev > ley*N para categoría especial (34) con deuda arrastrada
MULTIPLICADOR_DEUDA_ARRASTRADA_CAT34 = 10
LEY_MINIMA_SIN_EJECUCION = 10_000_000

# rFin: banda de "Equilibrio Financiero" — cuanto más alto el %Ejecución del
# período, más crítico (mide velocidad de gasto, no cumplimiento).
BANDA_EQUILIBRIO_NORMAL = 50
BANDA_EQUILIBRIO_ATENCION = 85

MESES_LARGO = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']


# =============================================================================
# Helpers compartidos
# =============================================================================

def _filtrar_base(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None, excluir_34_35=True):
    """Queryset base sobre SigfeAnexo1 según los filtros comunes a todas las
    vistas. `codigo_ue` vacío/None/'todas' = consolidado (todas las UE)."""
    qs = SigfeAnexo1.objects.all()
    if codigo_ue and codigo_ue != 'todas':
        qs = qs.filter(codigo_ue=codigo_ue)
    if anho:
        qs = qs.filter(anho=anho)
    if mes_desde:
        qs = qs.filter(mes__gte=mes_desde)
    if mes_hasta:
        qs = qs.filter(mes__lte=mes_hasta)
    if excluir_34_35:
        qs = qs.exclude(concepto_presupuestario__startswith='34').exclude(concepto_presupuestario__startswith='35')
    return qs


def _agregar(queryset, nivel=None):
    """Equivalente a agg(files, lvl) del HTML original: agrupa por concepto
    presupuestario, toma el máximo de Ley (constante anual, evita inflarla al
    sumar meses) y suma el resto (son incrementales por mes).

    Dos etapas: cada UE tiene su PROPIA Ley anual para un mismo concepto
    (confirmado contra la DB real — ej. "21 GASTOS EN PERSONAL" trae un
    ley_presupuestos distinto por codigo_ue). Agrupar directo por concepto y
    tomar Max(ley) al consolidar varias UE tomaría solo la ley de la UE más
    grande en vez de sumar las 7 — subestima la Ley total y descuadra
    %Ejecución. Por eso primero se agrupa por (codigo_ue, concepto) — ahí
    Max(ley) es seguro, evita inflar por los 12 meses duplicados — y luego se
    suma esa ley por-UE al consolidar por concepto."""
    qs = queryset.filter(nivel=nivel) if nivel else queryset
    filas_por_ue = (
        qs.values('codigo_ue', 'concepto_presupuestario', 'nivel')
          .annotate(
              ley=Max('ley_presupuestos'),
              req=Sum('requerimiento'),
              comp=Sum('compromiso'),
              dev=Sum('devengado'),
              efec=Sum('efectivo'),
              deuda=Sum('deuda_flotante'),
          )
    )
    acumulado = {}
    orden = []
    for f in filas_por_ue:
        concepto = f['concepto_presupuestario']
        if concepto not in acumulado:
            codigo, _, nombre = concepto.partition(' ')
            acumulado[concepto] = {
                'concepto': concepto, 'codigo': codigo, 'nombre': nombre.strip(), 'nivel': f['nivel'],
                'ley': 0.0, 'req': 0.0, 'comp': 0.0, 'dev': 0.0, 'efec': 0.0, 'deuda': 0.0,
            }
            orden.append(concepto)
        acc = acumulado[concepto]
        acc['ley'] += float(f['ley'] or 0)
        acc['req'] += float(f['req'] or 0)
        acc['comp'] += float(f['comp'] or 0)
        acc['dev'] += float(f['dev'] or 0)
        acc['efec'] += float(f['efec'] or 0)
        acc['deuda'] += float(f['deuda'] or 0)
    return [acumulado[c] for c in sorted(orden)]


def _clasificar_pct(valor, rojo=BANDA_PCT_ROJO, amarillo=BANDA_PCT_AMARILLO):
    """>=amarillo => verde, >=rojo => amarillo, si no => rojo (fP() del original)."""
    if valor >= amarillo:
        return 'verde'
    if valor >= rojo:
        return 'amarillo'
    return 'rojo'


def _enriquecer_jerarquia(filas):
    """Agrega a cada fila (dict con 'codigo'/'nivel') los códigos/descripciones
    reales N1-N5 desde `ConceptoJerarquia` (misma tabla que usa el árbol de
    Anexo N°3), en vez de dejar que el frontend adivine la jerarquía por
    substring de código. Los códigos de nivel son prefijos del propio código
    de la fila (ver `_LARGOS_NIVEL_HIER`); las descripciones se resuelven vía
    `_resolver_hier()` (match exacto o prefijo progresivo 10/7/4/2) — cuando
    no hay match para un nivel, la descripción queda vacía mientras el código
    de ese nivel sigue disponible (mejor un nodo "sin nombre" que perderlo)."""
    lookup = _construir_hier_lookup()
    for f in filas:
        codigo = f['codigo']
        hier = _resolver_hier(lookup, codigo)
        descs = hier[:5] if hier else ['', '', '', '', '']
        propio_nivel = f.get('nivel') or len(_LARGOS_NIVEL_HIER)
        for i, largo in enumerate(_LARGOS_NIVEL_HIER):
            n = i + 1
            if n <= propio_nivel and len(codigo) >= largo:
                f[f'n{n}_codigo'] = codigo[:largo]
                f[f'n{n}_desc'] = descs[i] or ''
            else:
                f[f'n{n}_codigo'] = ''
                f[f'n{n}_desc'] = ''
    return filas


def _mes_mayor_gasto(codigo_ue, anho, subtitulo=None, excluir_34_35=True):
    """Mes (1-12) con mayor Devengado nivel-1 dentro del año completo,
    independiente del rango de período seleccionado (así se comporta rRes)."""
    qs = _filtrar_base(codigo_ue=codigo_ue, anho=anho, excluir_34_35=excluir_34_35).filter(nivel=1)
    if subtitulo:
        qs = qs.filter(concepto_presupuestario=subtitulo)
    por_mes = (
        qs.values('mes').annotate(dev=Sum('devengado')).order_by('-dev')
    )
    mejor = por_mes.first()
    if not mejor or not mejor['dev']:
        return None
    return mejor['mes']


def _ultimo_mes_con_datos(codigo_ue, anho):
    """Mes (1-12) más alto con al menos una fila cargada para el año — 'lastM'
    del original (equivalente a "hay un archivo/tramo sincronizado para ese mes")."""
    qs = SigfeAnexo1.objects.filter(anho=anho)
    if codigo_ue and codigo_ue != 'todas':
        qs = qs.filter(codigo_ue=codigo_ue)
    return qs.aggregate(m=Max('mes'))['m']


def _serie_mensual(qs_nivel1):
    """Devengado/Efectivo por mes (1-12) sobre un queryset ya filtrado a
    nivel=1 (y a los demás filtros que corresponda) — 'mData'/'serDev'/'serEfec'
    del original. Meses sin filas quedan en 0."""
    filas = qs_nivel1.values('mes').annotate(dev=Sum('devengado'), efec=Sum('efectivo'))
    por_mes = {f['mes']: {'dev': float(f['dev'] or 0), 'efec': float(f['efec'] or 0)} for f in filas}
    return [por_mes.get(m, {'dev': 0.0, 'efec': 0.0}) for m in range(1, 13)]


def _serie_mensual_por_concepto(qs_nivel1):
    """Devengado mensual (lista de 12) por concepto — para tablas que comparan
    año base vs. año anterior subtítulo por subtítulo (Tendencias)."""
    filas = qs_nivel1.values('concepto_presupuestario', 'mes').annotate(dev=Sum('devengado'))
    agrupado = defaultdict(lambda: [0.0] * 12)
    for f in filas:
        agrupado[f['concepto_presupuestario']][f['mes'] - 1] = float(f['dev'] or 0)
    return agrupado


# =============================================================================
# Resumen Ejecutivo (rRes)
# =============================================================================

def calcular_anexo1_resumen(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None,
                             subtitulo=None, anho_comparacion=None, excluir_34_35=True):
    base = _filtrar_base(codigo_ue, anho, mes_desde, mes_hasta, excluir_34_35).filter(nivel=1)
    if subtitulo:
        base = base.filter(concepto_presupuestario=subtitulo)
    filas = _agregar(base, nivel=1)

    t_ley = sum(f['ley'] for f in filas)
    t_req = sum(f['req'] for f in filas)
    t_comp = sum(f['comp'] for f in filas)
    t_dev = sum(f['dev'] for f in filas)
    t_efec = sum(f['efec'] for f in filas)
    t_deuda = t_dev - t_efec
    saldo_aplicar = t_ley - t_req
    saldo_devengar = t_comp - t_dev
    subtitulos_activos = sum(1 for f in filas if f['dev'] > 0)
    pct_ejecucion = (t_dev / t_ley * 100) if t_ley else 0
    pct_pago = (t_efec / t_dev * 100) if t_dev else 0
    mes_mayor_gasto = _mes_mayor_gasto(codigo_ue, anho, subtitulo, excluir_34_35) if anho else None

    comparacion = None
    if anho_comparacion:
        base_comp = _filtrar_base(codigo_ue, anho_comparacion, mes_desde, mes_hasta, excluir_34_35).filter(nivel=1)
        if subtitulo:
            base_comp = base_comp.filter(concepto_presupuestario=subtitulo)
        filas_comp = _agregar(base_comp, nivel=1)
        dev_comp = sum(f['dev'] for f in filas_comp)
        efec_comp = sum(f['efec'] for f in filas_comp)
        dev_por_codigo_comp = {f['codigo']: f['dev'] for f in filas_comp}
        comparacion = {
            'anho': anho_comparacion,
            'devengado': dev_comp,
            'efectivo': efec_comp,
            'delta_devengado_pct': ((t_dev - dev_comp) / dev_comp * 100) if dev_comp else None,
            'delta_efectivo_pct': ((t_efec - efec_comp) / efec_comp * 100) if efec_comp else None,
            'devengado_por_codigo': dev_por_codigo_comp,
        }

    return {
        'kpis': {
            'ley_presupuestos': t_ley,
            'saldo_por_aplicar': saldo_aplicar,
            'comprometido': t_comp,
            'saldo_por_devengar': saldo_devengar,
            'devengado': t_dev,
            'deuda_flotante': t_deuda,
            'efectivo': t_efec,
            'subtitulos_activos': subtitulos_activos,
            'mes_mayor_gasto': MESES_LARGO[mes_mayor_gasto - 1] if mes_mayor_gasto else None,
            'pct_ejecucion': pct_ejecucion,
            'pct_ejecucion_estado': _clasificar_pct(pct_ejecucion),
            'pct_pago': pct_pago,
            'pct_pago_estado': _clasificar_pct(pct_pago),
        },
        'comparacion': comparacion,
        'grafico_barras': [
            {'codigo': f['codigo'], 'nombre': f['nombre'], 'ley': f['ley'], 'devengado': f['dev'], 'efectivo': f['efec']}
            for f in filas
        ],
        'grafico_donut': [
            {'codigo': f['codigo'], 'nombre': f['nombre'], 'devengado': f['dev']}
            for f in filas if f['dev'] > 0
        ],
    }


# =============================================================================
# Alertas y Anomalías (rAl)
# =============================================================================

def calcular_anexo1_alertas(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None):
    """Nunca excluye Subt. 34/35 (el original tampoco lo permite acá — la
    regla de categoría especial justamente necesita esas filas)."""
    filas = _agregar(_filtrar_base(codigo_ue, anho, mes_desde, mes_hasta, excluir_34_35=False))

    alertas = []
    for f in filas:
        deuda = f['dev'] - f['efec']

        if f['nivel'] == 1 and f['ley'] > 0 and f['dev'] > f['ley']:
            alertas.append({
                'severidad': 'critica', 'concepto': f['concepto'], 'tipo': 'Sobrejecución presupuestaria',
                'valor': f['dev'] - f['ley'],
                'observacion': f'Devengado (${f["dev"]:,.0f}) supera la Ley (${f["ley"]:,.0f}).',
            })

        if deuda > UMBRAL_DEUDA_ALERTAS_ADVERTENCIA and f['dev'] > 0:
            severidad = 'critica' if deuda > UMBRAL_DEUDA_ALERTAS_CRITICA else 'advertencia'
            alertas.append({
                'severidad': severidad, 'concepto': f['concepto'], 'tipo': 'Deuda flotante pendiente',
                'valor': deuda, 'observacion': f'Deuda flotante de ${deuda:,.0f} (Devengado - Efectivo).',
            })

        if (f['codigo'] == '34' and f['dev'] > 0 and f['ley'] > 0
                and f['dev'] > f['ley'] * MULTIPLICADOR_DEUDA_ARRASTRADA_CAT34):
            alertas.append({
                'severidad': 'info', 'concepto': f['concepto'], 'tipo': 'Categoría especial — deuda arrastrada',
                'valor': f['dev'], 'observacion': 'Devengado muy superior a la Ley — típico de deuda arrastrada de años anteriores.',
            })

        if f['nivel'] == 1 and f['ley'] > LEY_MINIMA_SIN_EJECUCION and f['dev'] == 0:
            alertas.append({
                'severidad': 'advertencia', 'concepto': f['concepto'], 'tipo': 'Sin ejecución con Ley asignada',
                'valor': f['ley'], 'observacion': f'Ley asignada de ${f["ley"]:,.0f} sin devengo registrado.',
            })

        if f['efec'] > f['dev'] and f['dev'] > 0:
            alertas.append({
                'severidad': 'critica', 'concepto': f['concepto'], 'tipo': 'Efectivo supera Devengado',
                'valor': f['efec'] - f['dev'], 'observacion': 'Anomalía contable: el pago efectivo excede lo devengado.',
            })

    orden = {'critica': 0, 'advertencia': 1, 'info': 2}
    alertas.sort(key=lambda a: orden[a['severidad']])
    return {
        'alertas': alertas,
        'contadores': {
            'criticas': sum(1 for a in alertas if a['severidad'] == 'critica'),
            'advertencias': sum(1 for a in alertas if a['severidad'] == 'advertencia'),
            'informativas': sum(1 for a in alertas if a['severidad'] == 'info'),
        },
    }


# =============================================================================
# Semáforo de Cierre de Año (rSf)
# =============================================================================

def calcular_anexo1_semaforo(codigo_ue=None, anho=None, excluir_34_35=True):
    ultimo_mes = _ultimo_mes_con_datos(codigo_ue, anho)
    if not ultimo_mes:
        return {'meses_restantes': None, 'ultimo_mes_con_datos': None, 'contadores': {}, 'subtitulos': []}

    meses_restantes = 12 - ultimo_mes
    filas = _agregar(
        _filtrar_base(codigo_ue, anho, mes_hasta=ultimo_mes, excluir_34_35=excluir_34_35).filter(nivel=1),
        nivel=1,
    )

    subtitulos = []
    contadores = {'verde': 0, 'amarillo': 0, 'rojo': 0}
    for f in filas:
        dev_acum, ley = f['dev'], f['ley']
        prom_mensual = dev_acum / ultimo_mes if ultimo_mes else 0
        proyeccion = dev_acum + prom_mensual * meses_restantes
        pct_ejec_actual = (dev_acum / ley * 100) if ley else None
        pct_ejec_proyectado = (proyeccion / ley * 100) if ley else None
        brecha = max(0, ley - dev_acum)
        gasto_mensual_necesario = (brecha / meses_restantes) if meses_restantes else None

        if pct_ejec_proyectado is not None:
            estado = _clasificar_pct(pct_ejec_proyectado, BANDA_PROYECCION_ROJO, BANDA_PROYECCION_AMARILLO)
        elif pct_ejec_actual is not None:
            estado = _clasificar_pct(pct_ejec_actual, BANDA_SEMAFORO_FALLBACK_ROJO, BANDA_SEMAFORO_FALLBACK_AMARILLO)
        else:
            estado = 'rojo'
        contadores[estado] += 1

        subtitulos.append({
            'codigo': f['codigo'], 'nombre': f['nombre'], 'estado': estado,
            'ley': ley, 'devengado_acumulado': dev_acum,
            'pct_ejecucion_actual': pct_ejec_actual, 'proyeccion_diciembre': proyeccion,
            'pct_ejecucion_proyectado': pct_ejec_proyectado, 'brecha': brecha,
            'gasto_mensual_necesario': gasto_mensual_necesario,
        })

    return {
        'meses_restantes': meses_restantes,
        'ultimo_mes_con_datos': ultimo_mes,
        'contadores': {
            'en_ruta': contadores['verde'], 'en_atencion': contadores['amarillo'], 'en_riesgo': contadores['rojo'],
        },
        'subtitulos': subtitulos,
    }


# =============================================================================
# Burn Rate · Velocidad de Gasto (rBr)
# =============================================================================

def calcular_anexo1_burn_rate(codigo_ue=None, anho=None, subtitulo=None, excluir_34_35=True):
    ultimo_mes = _ultimo_mes_con_datos(codigo_ue, anho)
    if not ultimo_mes:
        return {'ultimo_mes_con_datos': None, 'kpis': {}, 'tabla_mensual': []}

    base_nivel1_todos = _filtrar_base(codigo_ue, anho, excluir_34_35=excluir_34_35).filter(nivel=1)
    subtitulos_disponibles = [
        {'concepto': f['concepto'], 'codigo': f['codigo'], 'nombre': f['nombre']}
        for f in _agregar(base_nivel1_todos, nivel=1)
    ]

    base_nivel1 = base_nivel1_todos.filter(concepto_presupuestario=subtitulo) if subtitulo else base_nivel1_todos

    ley_total = sum(f['ley'] for f in _agregar(base_nivel1, nivel=1))
    serie = _serie_mensual(base_nivel1)

    acumulado = []
    total = 0.0
    for mes in serie:
        total += mes['dev']
        acumulado.append(total)
    ideal = [ley_total / 12 * (i + 1) for i in range(12)]

    dev_acum = acumulado[ultimo_mes - 1]
    esperado_actual = ideal[ultimo_mes - 1]
    desviacion_pct = ((dev_acum - esperado_actual) / esperado_actual * 100) if esperado_actual else None
    prom_mensual = dev_acum / ultimo_mes
    proyeccion_diciembre = dev_acum + prom_mensual * (12 - ultimo_mes)
    pct_ejec_proyectado = (proyeccion_diciembre / ley_total * 100) if ley_total else None

    def _ritmo(desv):
        if desv is None:
            return 'Normal'
        if desv >= 5:
            return 'Acelerado'
        if desv <= -5:
            return 'Lento'
        return 'Normal'

    tabla_mensual = []
    for i in range(ultimo_mes):
        esperado_m = ideal[i]
        desv_m = ((acumulado[i] - esperado_m) / esperado_m * 100) if esperado_m else None
        tabla_mensual.append({
            'mes': MESES_LARGO[i], 'gasto': serie[i]['dev'], 'acumulado': acumulado[i],
            'esperado': esperado_m, 'desviacion_pct': desv_m,
            'pct_ejecucion': (acumulado[i] / ley_total * 100) if ley_total else None,
            'ritmo': _ritmo(desv_m),
        })

    return {
        'ultimo_mes_con_datos': ultimo_mes,
        'ley_total': ley_total,
        'kpis': {
            'gasto_mensual_promedio': prom_mensual,
            'desviacion_vs_esperado_pct': desviacion_pct,
            'proyeccion_diciembre': proyeccion_diciembre,
            'pct_ejecucion_proyectada': pct_ejec_proyectado,
            'estado_proyeccion': (
                _clasificar_pct(pct_ejec_proyectado, BANDA_PROYECCION_ROJO, BANDA_PROYECCION_AMARILLO)
                if pct_ejec_proyectado is not None else None
            ),
        },
        'tabla_mensual': tabla_mensual,
        'subtitulos_disponibles': subtitulos_disponibles,
    }


# =============================================================================
# Evolución de Deuda Flotante (rDf)
# =============================================================================

def calcular_anexo1_deuda_flotante(codigo_ue=None, anho=None, excluir_34_35=True):
    ultimo_mes = _ultimo_mes_con_datos(codigo_ue, anho)
    if not ultimo_mes:
        return {'ultimo_mes_con_datos': None, 'kpis': {}, 'serie_mensual': [], 'antiguedad_por_subtitulo': []}

    base_nivel1 = _filtrar_base(codigo_ue, anho, excluir_34_35=excluir_34_35).filter(nivel=1)
    serie = _serie_mensual(base_nivel1)
    serie_deuda = [m['dev'] - m['efec'] for m in serie]

    tramo_activo = serie_deuda[:ultimo_mes]
    deuda_maxima = max(tramo_activo)
    deuda_maxima_mes = tramo_activo.index(deuda_maxima) + 1
    deuda_actual = serie_deuda[ultimo_mes - 1]
    tendencia = deuda_actual - serie_deuda[ultimo_mes - 2] if ultimo_mes >= 2 else None
    dev_ultimo_mes = serie[ultimo_mes - 1]['dev']
    efec_ultimo_mes = serie[ultimo_mes - 1]['efec']
    pct_pago = (efec_ultimo_mes / dev_ultimo_mes * 100) if dev_ultimo_mes else None

    estado_deuda = (
        'rojo' if deuda_actual > UMBRAL_DEUDA_FLOTANTE_ROJA
        else 'amarillo' if deuda_actual > UMBRAL_DEUDA_FLOTANTE_AMBAR
        else 'verde'
    )
    estado_pago = _clasificar_pct(
        pct_pago if pct_pago is not None else 0, BANDA_PCT_PAGO_DEUDA_ROJO, BANDA_PCT_PAGO_DEUDA_AMARILLO,
    )

    filas_subtitulo = _agregar(
        _filtrar_base(codigo_ue, anho, mes_hasta=ultimo_mes, excluir_34_35=excluir_34_35).filter(nivel=1),
        nivel=1,
    )
    antiguedad = []
    for f in filas_subtitulo:
        serie_sub = _serie_mensual(
            _filtrar_base(codigo_ue, anho, mes_hasta=ultimo_mes, excluir_34_35=excluir_34_35)
            .filter(nivel=1, concepto_presupuestario=f['concepto'])
        )[:ultimo_mes]
        deuda_sub_mensual = [m['dev'] - m['efec'] for m in serie_sub]
        deuda_sub_max = max(deuda_sub_mensual) if deuda_sub_mensual else 0
        deuda_sub_max_mes = deuda_sub_mensual.index(deuda_sub_max) + 1 if deuda_sub_mensual else None
        deuda_sub = f['dev'] - f['efec']
        pct_deuda_sobre_dev = (deuda_sub / f['dev'] * 100) if f['dev'] else 0
        tendencia_sub = None
        if len(deuda_sub_mensual) >= 2:
            tendencia_sub = 'bajando' if deuda_sub_mensual[-1] < deuda_sub_mensual[-2] else 'subiendo'

        antiguedad.append({
            'codigo': f['codigo'], 'nombre': f['nombre'],
            'devengado_total': f['dev'], 'efectivo_total': f['efec'], 'deuda': deuda_sub,
            'pct_deuda_sobre_devengado': pct_deuda_sobre_dev,
            # _clasificar_pct() asume "más alto = mejor" (verde); acá es al revés
            # (más %Deuda/Dev = peor), así que se invierte sobre el complemento a 100.
            'estado_pct_deuda': _clasificar_pct(
                100 - pct_deuda_sobre_dev, 100 - BANDA_DEUDA_SOBRE_DEV_ROJO, 100 - BANDA_DEUDA_SOBRE_DEV_AMARILLO,
            ),
            'mes_deuda_maxima': MESES_LARGO[deuda_sub_max_mes - 1] if deuda_sub_max_mes else None,
            'valor_deuda_maxima': deuda_sub_max, 'tendencia': tendencia_sub,
        })

    return {
        'ultimo_mes_con_datos': ultimo_mes,
        'kpis': {
            'deuda_actual': deuda_actual, 'estado_deuda_actual': estado_deuda,
            'deuda_maxima': deuda_maxima, 'mes_deuda_maxima': MESES_LARGO[deuda_maxima_mes - 1],
            'tendencia_vs_mes_anterior': tendencia,
            'pct_pago_acumulado': pct_pago, 'estado_pct_pago': estado_pago,
        },
        'serie_mensual': [
            {'mes': MESES_CORTO[i], 'devengado': serie[i]['dev'], 'efectivo': serie[i]['efec'], 'deuda': serie_deuda[i]}
            for i in range(ultimo_mes)
        ],
        'antiguedad_por_subtitulo': antiguedad,
    }


# =============================================================================
# Histórico y Tendencias (rTr) — la única vista intrínsecamente multi-año
# =============================================================================

def calcular_anexo1_tendencias(codigo_ue=None, subtitulo=None, anhos=None, excluir_34_35=True):
    qs_todos = SigfeAnexo1.objects.all()
    if codigo_ue and codigo_ue != 'todas':
        qs_todos = qs_todos.filter(codigo_ue=codigo_ue)
    if excluir_34_35:
        qs_todos = qs_todos.exclude(concepto_presupuestario__startswith='34').exclude(concepto_presupuestario__startswith='35')
    qs_base = qs_todos.filter(nivel=1)

    anhos_disponibles = sorted(set(qs_base.values_list('anho', flat=True)))
    if not anhos_disponibles:
        return {'anhos_disponibles': [], 'anhos_usados': [], 'series_por_anho': {}, 'arbol_proyeccion': [], 'subtitulos_disponibles': []}

    anhos_usar = sorted(a for a in anhos if a in anhos_disponibles) if anhos else anhos_disponibles

    # `subtitulo` puede ser un concepto de CUALQUIER nivel (no solo Subtítulo)
    # cuando viene de un click en el árbol de la tabla de proyección — por eso
    # se filtra sobre `qs_todos`, no sobre `qs_base` (que solo tiene nivel=1).
    # Sin selección, se usa `qs_base` (nivel=1) para no inflar el consolidado
    # sumando niveles anidados entre sí.
    qs_serie = qs_todos.filter(concepto_presupuestario=subtitulo) if subtitulo else qs_base
    series_por_anho = {}
    for anho in anhos_usar:
        serie = _serie_mensual(qs_serie.filter(anho=anho))
        series_por_anho[anho] = {'devengado': [m['dev'] for m in serie], 'efectivo': [m['efec'] for m in serie]}

    anho_base = max(anhos_usar)
    anho_prev = anho_base - 1
    serie_base_dev = series_por_anho[anho_base]['devengado']
    ultimo_mes_real = max([i + 1 for i, v in enumerate(serie_base_dev) if v != 0], default=0)

    proyeccion_anho_base = None
    if ultimo_mes_real and anho_prev in anhos_disponibles:
        dev_prev = _serie_mensual(qs_serie.filter(anho=anho_prev))
        dev_prev = [m['dev'] for m in dev_prev]
        acum_base = sum(serie_base_dev[:ultimo_mes_real])
        acum_prev = sum(dev_prev[:ultimo_mes_real])
        ratio = (acum_base / acum_prev) if acum_prev else None
        if ratio is not None:
            proyeccion_anho_base = [
                serie_base_dev[i] if i < ultimo_mes_real else dev_prev[i] * ratio
                for i in range(12)
            ]

    # Árbol de proyección: TODOS los niveles (no solo Subtítulo) — no respeta
    # el filtro `subtitulo`, que solo acota el gráfico principal — compara año
    # base vs. cierre del año anterior, igual que rPrj, pero ahora desglosado
    # por Subtítulo→Ítem→Asignación→Sub-asignación→Detalle vía
    # `_enriquecer_jerarquia()` (misma función que usa el tab Detallado).
    arbol_proyeccion = []
    if ultimo_mes_real and anho_prev in anhos_disponibles:
        nivel_por_concepto = dict(
            qs_todos.filter(anho=anho_base).values_list('concepto_presupuestario', 'nivel').distinct()
        )
        por_concepto_base = _serie_mensual_por_concepto(qs_todos.filter(anho=anho_base))
        por_concepto_prev = _serie_mensual_por_concepto(qs_todos.filter(anho=anho_prev))
        for concepto, serie_c in por_concepto_base.items():
            acumulado = sum(serie_c[:ultimo_mes_real])
            promedio = acumulado / ultimo_mes_real
            proyeccion = acumulado + promedio * (12 - ultimo_mes_real)
            cierre_anterior = sum(por_concepto_prev.get(concepto, [0.0] * 12))
            delta = proyeccion - cierre_anterior
            delta_pct = (delta / cierre_anterior * 100) if cierre_anterior else None
            codigo, _, nombre = concepto.partition(' ')
            arbol_proyeccion.append({
                'concepto': concepto, 'codigo': codigo, 'nombre': nombre.strip(),
                'nivel': nivel_por_concepto.get(concepto, 1),
                'acumulado_real': acumulado,
                'proyeccion_diciembre': proyeccion, 'cierre_anio_anterior': cierre_anterior,
                'delta': delta, 'delta_pct': delta_pct,
            })
        arbol_proyeccion.sort(key=lambda r: r['codigo'])
        _enriquecer_jerarquia(arbol_proyeccion)

    subtitulos_disponibles = []
    for concepto in sorted(set(qs_base.values_list('concepto_presupuestario', flat=True))):
        codigo, _, nombre = concepto.partition(' ')
        subtitulos_disponibles.append({'concepto': concepto, 'codigo': codigo, 'nombre': nombre.strip()})

    return {
        'anhos_disponibles': anhos_disponibles,
        'anhos_usados': anhos_usar,
        'anho_base': anho_base,
        'ultimo_mes_real': ultimo_mes_real,
        'series_por_anho': {str(a): v for a, v in series_por_anho.items()},
        'proyeccion_anho_base': proyeccion_anho_base,
        'arbol_proyeccion': arbol_proyeccion,
        'subtitulos_disponibles': subtitulos_disponibles,
    }


# =============================================================================
# Análisis Financiero (rFin)
# =============================================================================

def calcular_anexo1_financiero(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None, excluir_34_35=True):
    filas = _agregar(_filtrar_base(codigo_ue, anho, mes_desde, mes_hasta, excluir_34_35).filter(nivel=1), nivel=1)
    t_ley = sum(f['ley'] for f in filas)
    t_comp = sum(f['comp'] for f in filas)
    t_dev = sum(f['dev'] for f in filas)
    t_efec = sum(f['efec'] for f in filas)
    t_deuda = t_dev - t_efec
    pct_ejec = (t_dev / t_ley * 100) if t_ley else 0
    pct_pago = (t_efec / t_dev * 100) if t_dev else 0
    s_libre = t_ley - t_comp

    estado_equilibrio = (
        'normal' if pct_ejec < BANDA_EQUILIBRIO_NORMAL
        else 'atencion' if pct_ejec < BANDA_EQUILIBRIO_ATENCION
        else 'critico'
    )
    estado_deuda = (
        'rojo' if t_deuda > UMBRAL_DEUDA_FINANCIERO_ALTA
        else 'amarillo' if t_deuda > UMBRAL_DEUDA_FINANCIERO_MEDIA
        else 'verde'
    )
    estado_pago = _clasificar_pct(pct_pago, BANDA_PCT_PAGO_DEUDA_ROJO, BANDA_PCT_PAGO_DEUDA_AMARILLO)

    # Series históricas multi-año (deuda evolución completa, acumulado por año,
    # tendencia con regresión lineal simple) — independientes del período elegido.
    qs_hist = SigfeAnexo1.objects.filter(nivel=1)
    if codigo_ue and codigo_ue != 'todas':
        qs_hist = qs_hist.filter(codigo_ue=codigo_ue)
    if excluir_34_35:
        qs_hist = qs_hist.exclude(concepto_presupuestario__startswith='34').exclude(concepto_presupuestario__startswith='35')

    serie_hist = list(
        qs_hist.values('anho', 'mes').annotate(dev=Sum('devengado'), efec=Sum('efectivo')).order_by('anho', 'mes')
    )
    deuda_evolucion = [
        {'periodo': f"{r['anho']}-{r['mes']:02d}", 'deuda': float(r['dev'] or 0) - float(r['efec'] or 0)}
        for r in serie_hist
    ]

    por_anho_mes = defaultdict(lambda: [0.0] * 12)
    for r in serie_hist:
        por_anho_mes[r['anho']][r['mes'] - 1] = float(r['dev'] or 0)
    devengado_acumulado_por_anho = {}
    for a, meses in por_anho_mes.items():
        acumulado, total = [], 0.0
        for v in meses:
            total += v
            acumulado.append(total)
        devengado_acumulado_por_anho[str(a)] = acumulado

    puntos_y = [float(r['dev'] or 0) for r in serie_hist]
    tendencia_regresion = None
    n = len(puntos_y)
    if n >= 2:
        xs = list(range(n))
        sum_x, sum_y = sum(xs), sum(puntos_y)
        sum_xy = sum(x * y for x, y in zip(xs, puntos_y))
        sum_x2 = sum(x * x for x in xs)
        denom = n * sum_x2 - sum_x ** 2
        if denom:
            slope = (n * sum_xy - sum_x * sum_y) / denom
            intercept = (sum_y - slope * sum_x) / n
            tendencia_regresion = [slope * x + intercept for x in xs]

    estimado_vs_real_anho = None
    if anho and anho in por_anho_mes:
        acumulado, total = [], 0.0
        for v in por_anho_mes[anho]:
            total += v
            acumulado.append(total)
        estimado = [t_ley / 12 * (i + 1) for i in range(12)] if t_ley else [0.0] * 12
        estimado_vs_real_anho = {'real_acumulado': acumulado, 'estimado_lineal': estimado}

    return {
        'kpis': {
            'equilibrio_financiero_pct': pct_ejec, 'estado_equilibrio': estado_equilibrio,
            'compromiso_financiero': t_comp, 'total_devengado': t_dev, 'deuda_flotante': t_deuda,
            'estado_deuda': estado_deuda, 'disponibilidad_libre': s_libre,
            'tasa_pago_pct': pct_pago, 'estado_tasa_pago': estado_pago,
            'ley_presupuestos': t_ley, 'efectivo': t_efec,
        },
        'subtitulos': [
            {
                'codigo': f['codigo'], 'nombre': f['nombre'], 'ley': f['ley'], 'comprometido': f['comp'],
                'devengado': f['dev'], 'deuda': f['dev'] - f['efec'],
                'pct_ejecucion': (f['dev'] / f['ley'] * 100) if f['ley'] else None,
            }
            for f in filas
        ],
        'deuda_evolucion_historica': deuda_evolucion,
        'devengado_acumulado_por_anho': devengado_acumulado_por_anho,
        'tendencia_periodos': [f"{r['anho']}-{r['mes']:02d}" for r in serie_hist],
        'tendencia_devengado': puntos_y,
        'tendencia_regresion': tendencia_regresion,
        'estimado_vs_real_anho': estimado_vs_real_anho,
    }


# =============================================================================
# Análisis Detallado (rDr) — tabla base + sub-tabs Pareto / Temporal / Control
# =============================================================================

def calcular_anexo1_detallado(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None, search=None, excluir_34_35=True):
    """Devuelve TODAS las filas (niveles 1-5) planas, con jerarquía real N1-N5
    resuelta contra `ConceptoJerarquia` (ver `_enriquecer_jerarquia`) — el
    frontend arma el árbol anidando por esos campos en vez de adivinar por
    prefijo de código como hacía antes (`bld()` del original)."""
    filas = _agregar(_filtrar_base(codigo_ue, anho, mes_desde, mes_hasta, excluir_34_35))
    if search:
        s = search.lower()
        filas = [f for f in filas if s in f['concepto'].lower()]

    total_ley_n1 = sum(f['ley'] for f in filas if f['nivel'] == 1)

    resultado = []
    for f in filas:
        pct_pago = (f['efec'] / f['dev'] * 100) if f['dev'] else None
        pct_ejecucion = (f['dev'] / f['ley'] * 100) if (f['nivel'] == 1 and f['ley']) else None
        pct_participacion = (f['ley'] / total_ley_n1 * 100) if (f['nivel'] == 1 and total_ley_n1) else None
        resultado.append({
            'concepto': f['concepto'], 'codigo': f['codigo'], 'nombre': f['nombre'], 'nivel': f['nivel'],
            'ley': f['ley'], 'requerimiento': f['req'], 'comprometido': f['comp'],
            'devengado': f['dev'], 'efectivo': f['efec'],
            'saldo_req_dev': f['req'] - f['dev'], 'saldo_dev_efec': f['dev'] - f['efec'],
            'saldo_comp_dev': f['comp'] - f['dev'],
            'pct_pago': pct_pago, 'pct_ejecucion': pct_ejecucion, 'pct_participacion': pct_participacion,
            'estado_pct_pago': _clasificar_pct(pct_pago) if pct_pago is not None else None,
            'estado_pct_ejecucion': _clasificar_pct(pct_ejecucion) if pct_ejecucion is not None else None,
            'es_categoria_especial': f['codigo'] in ('34', '35'),
        })
    _enriquecer_jerarquia(resultado)
    return {'filas': resultado}


def calcular_anexo1_detallado_pareto(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None, metrica='dev', excluir_34_35=True):
    filas = _agregar(_filtrar_base(codigo_ue, anho, mes_desde, mes_hasta, excluir_34_35))
    codigos = [f['codigo'] for f in filas]

    def _es_hoja(codigo):
        # Hoja = ningún otro código del dataset lo extiende con más dígitos
        # (ej. "2201" es hoja si no existe "220101", "220102", etc.)
        return not any(
            otro != codigo and otro.startswith(codigo) and otro[len(codigo):].isdigit()
            for otro in codigos
        )

    campo = 'ley' if metrica == 'ley' else 'dev'
    items = [f for f in filas if (f[campo] or 0) > 0 and _es_hoja(f['codigo'])]
    items.sort(key=lambda f: f[campo], reverse=True)
    total = sum(f[campo] for f in items)

    resultado = []
    acumulado = 0.0
    for f in items:
        pct_individual = (f[campo] / total * 100) if total else 0
        categoria = 'A' if acumulado < 80 else ('B' if acumulado < 95 else 'C')
        acumulado += pct_individual
        resultado.append({
            'codigo': f['codigo'], 'nombre': f['nombre'], 'nivel': f['nivel'],
            'valor': f[campo], 'pct_individual': pct_individual, 'pct_acumulado': acumulado,
            'categoria': categoria,
        })
    return {'metrica': metrica, 'items': resultado}


def calcular_anexo1_detallado_temporal(codigo_ue=None, anho=None, vista='apilado', concepto=None, excluir_34_35=True):
    qs_nivel1 = SigfeAnexo1.objects.filter(nivel=1)
    if codigo_ue and codigo_ue != 'todas':
        qs_nivel1 = qs_nivel1.filter(codigo_ue=codigo_ue)
    if excluir_34_35:
        qs_nivel1 = qs_nivel1.exclude(concepto_presupuestario__startswith='34').exclude(concepto_presupuestario__startswith='35')

    qs_todos = SigfeAnexo1.objects.all()
    if codigo_ue and codigo_ue != 'todas':
        qs_todos = qs_todos.filter(codigo_ue=codigo_ue)
    if excluir_34_35:
        qs_todos = qs_todos.exclude(concepto_presupuestario__startswith='34').exclude(concepto_presupuestario__startswith='35')
    conceptos_disponibles = [
        {'concepto': f['concepto'], 'codigo': f['codigo'], 'nombre': f['nombre'], 'nivel': f['nivel']}
        for f in _agregar(qs_todos) if f['dev'] > 0
    ]

    if vista == 'concepto' and concepto:
        qs_concepto = qs_todos.filter(concepto_presupuestario=concepto)
        anhos_disp = sorted(set(qs_concepto.values_list('anho', flat=True)))
        series = {}
        for a in anhos_disp:
            serie = _serie_mensual(qs_concepto.filter(anho=a))
            series[str(a)] = [m['dev'] for m in serie]
        return {
            'vista': 'concepto', 'concepto': concepto, 'anhos': anhos_disp,
            'series_por_anho': series, 'conceptos_disponibles': conceptos_disponibles,
        }

    anho_usar = anho or (max(qs_nivel1.values_list('anho', flat=True), default=None))
    if not anho_usar:
        return {'vista': 'apilado', 'anho': None, 'series': [], 'conceptos_disponibles': conceptos_disponibles}
    por_concepto = _serie_mensual_por_concepto(qs_nivel1.filter(anho=anho_usar))
    series = []
    for c in sorted(por_concepto.keys()):
        codigo, _, nombre = c.partition(' ')
        series.append({'codigo': codigo, 'nombre': nombre.strip(), 'valores': por_concepto[c]})
    return {'vista': 'apilado', 'anho': anho_usar, 'series': series, 'conceptos_disponibles': conceptos_disponibles}


def calcular_anexo1_detallado_control(codigo_ue=None, concepto=None):
    if not concepto:
        return {'suficiente': False, 'historico_count': 0}

    qs = SigfeAnexo1.objects.filter(concepto_presupuestario=concepto)
    if codigo_ue and codigo_ue != 'todas':
        qs = qs.filter(codigo_ue=codigo_ue)

    filas = list(qs.values('anho', 'mes').annotate(dev=Sum('devengado')))
    historico = [
        {'anho': f['anho'], 'mes': f['mes'], 'valor': float(f['dev'] or 0)}
        for f in filas if f['dev'] and f['dev'] > 0
    ]
    if len(historico) < 3:
        return {'suficiente': False, 'historico_count': len(historico)}

    vals = [h['valor'] for h in historico]
    media = sum(vals) / len(vals)
    varianza = sum((v - media) ** 2 for v in vals) / len(vals)
    sigma = varianza ** 0.5
    ucl = media + sigma
    lcl = max(0.0, media - sigma)

    anho_actual = max(h['anho'] for h in historico)
    serie_actual = [None] * 12
    for f in filas:
        if f['anho'] == anho_actual:
            serie_actual[f['mes'] - 1] = float(f['dev'] or 0)

    fuera_de_control = [
        {'mes': MESES_LARGO[i], 'valor': v, 'sobre_limite': v > ucl}
        for i, v in enumerate(serie_actual) if v is not None and (v > ucl or v < lcl)
    ]

    return {
        'suficiente': True, 'media': media, 'sigma': sigma, 'ucl': ucl, 'lcl': lcl,
        'anho_actual': anho_actual, 'serie_actual': serie_actual, 'fuera_de_control': fuera_de_control,
    }


# =============================================================================
# Conciliación Anexo N°1 (Deuda Flotante) vs. Anexo N°3 (Deuda Pendiente)
# =============================================================================
# Dos reportes SIGFE distintos, con naturaleza de dato distinta a propósito —
# NO se espera que calcen exacto, solo que estén en el mismo orden de magnitud
# cuando se comparan correctamente:
#   - Anexo N°1 (SigfeAnexo1.deuda_flotante = devengado-efectivo): FLUJO
#     incremental por mes → sumado sobre un período da "cuánta deuda se
#     generó en ese período".
#   - Anexo N°3 (DevengoSigfeAnual.monto_disponible): STOCK a nivel de
#     documento (factura/resolución/etc.) → sumando solo los documentos con
#     saldo > 0 da "cuánto sigue impago HOY", sin importar el año de origen.
# Confirmado contra datos reales: ambos usan el MISMO código jerárquico en
# `concepto_presupuestario` (ej. "22 BIENES Y SERVICIOS DE CONSUMO"), lo que
# permite cruzarlos por el código de Subtítulo (nivel 1, primeros 2 dígitos)
# — el nivel más confiable, ya que Anexo N°3 no trae un campo `nivel` propio.

_RE_CODIGO_LIDER = re.compile(r'^(\d+)')


def _codigo_nivel1(concepto_presupuestario):
    m = _RE_CODIGO_LIDER.match(concepto_presupuestario or '')
    return m.group(1)[:2] if m else None


def calcular_anexo1_conciliacion_devengo(codigo_ue=None, anho=None, mes_desde=None, mes_hasta=None, excluir_34_35=True):
    # --- Lado Anexo N°1: deuda flotante (flujo) del período filtrado ---
    filas_n1 = _agregar(_filtrar_base(codigo_ue, anho, mes_desde, mes_hasta, excluir_34_35).filter(nivel=1), nivel=1)
    anexo1_por_codigo = {f['codigo']: f for f in filas_n1}

    # --- Lado Anexo N°3: deuda pendiente (stock actual, TODOS los años) ---
    qs_devengo = DevengoSigfeAnual.objects.filter(monto_disponible__gt=0)
    if codigo_ue and codigo_ue != 'todas':
        qs_devengo = qs_devengo.filter(codigo_ue__startswith=codigo_ue)
    if excluir_34_35:
        qs_devengo = qs_devengo.exclude(concepto_presupuestario__startswith='34').exclude(concepto_presupuestario__startswith='35')

    anexo3_por_codigo = defaultdict(float)
    for row in qs_devengo.values('concepto_presupuestario').annotate(disp=Sum('monto_disponible')):
        codigo = _codigo_nivel1(row['concepto_presupuestario'])
        if codigo:
            anexo3_por_codigo[codigo] += float(row['disp'] or 0)

    # --- Cruce por código de Subtítulo ---
    todos_codigos = sorted(set(anexo1_por_codigo) | set(anexo3_por_codigo))
    filas = []
    for codigo in todos_codigos:
        f1 = anexo1_por_codigo.get(codigo)
        deuda_flujo = (f1['dev'] - f1['efec']) if f1 else 0.0
        nombre = f1['nombre'] if f1 else None
        deuda_stock = anexo3_por_codigo.get(codigo, 0.0)
        delta = deuda_stock - deuda_flujo
        delta_pct = (delta / deuda_flujo * 100) if deuda_flujo else None
        filas.append({
            'codigo': codigo, 'nombre': nombre,
            'deuda_flujo_anexo1': deuda_flujo, 'deuda_stock_anexo3': deuda_stock,
            'delta': delta, 'delta_pct': delta_pct,
        })

    total_flujo = sum(f['deuda_flujo_anexo1'] for f in filas)
    total_stock = sum(f['deuda_stock_anexo3'] for f in filas)

    return {
        'filas': filas,
        'totales': {
            'deuda_flujo_anexo1': total_flujo,
            'deuda_stock_anexo3': total_stock,
            'delta': total_stock - total_flujo,
            'delta_pct': ((total_stock - total_flujo) / total_flujo * 100) if total_flujo else None,
        },
    }
