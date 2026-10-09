"""Inicio (Home): tablero ejecutivo «¿Cómo vamos en el año?».

Junta en un solo payload lo que el Home necesita (compras del año contra el mismo corte del año anterior,
cumplimiento del PAC, formularios por bandeja y deuda SIGFE). No calcula indicadores propios: reutiliza las
funciones de `services.py` que ya alimentan `/pac`, Formularios y el Anexo N°3, para que las cifras del Home
coincidan siempre con las de cada módulo.

Cada bloque lleva el mismo control de acceso que su módulo de origen (ver `ROLES_*`); el Home nunca muestra
un dato que el usuario no podría abrir en su propia pantalla. Un bloque sin acceso viaja como `None`.
"""
import calendar
from datetime import date, datetime, timedelta

from django.core.cache import cache
from django.db.models import Count, Max, Min, Q, Sum
from django.utils import timezone

from . import services as S
from .models import DevengoSigfeAnual, FormularioFSC, FormularioFSCDerivado, FormularioFSCEstadoLog, OrdenCompra

# Mismos conjuntos que los permisos de las vistas de origen (`_IsAbastecimiento`, `_IsJefaturaAbastecimiento`, `_IsFinanzas`).
ROLES_FORMULARIOS = frozenset({'admin', 'abastecimiento', 'comprador', 'general', 'jefatura'})
ROLES_DEUDA = frozenset({'admin', 'finanzas', 'general'})

MODALIDADES_PRINCIPALES = ('Licitación', 'Compra Ágil', 'Convenio Marco', 'Trato Directo')
TTL_CACHE_SEG = 300


def corte_comparable(anio, hoy):
    """(corte del año pedido, mismo corte del año anterior).

    Para el año en curso se compara «al mismo día» (1-ene a hoy contra 1-ene a ese mismo día del año anterior);
    para un año cerrado, año completo contra año completo. Comparar el año en curso contra un año entero
    haría ver una caída que no existe.
    """
    if anio == hoy.year:
        ultimo_dia = calendar.monthrange(anio - 1, hoy.month)[1]
        return hoy, date(anio - 1, hoy.month, min(hoy.day, ultimo_dia))
    return date(anio, 12, 31), date(anio - 1, 12, 31)


def variacion_pct(actual, anterior):
    """Variación porcentual; `None` si no hay base de comparación (anterior en 0 o ausente)."""
    if not anterior:
        return None
    return round((actual - anterior) / anterior * 100, 1)


def _iso(valor):
    return valor.isoformat() if valor else None


# ── Fechas SIN funciones de zona horaria de la base ──────────────────────────
# El MariaDB de este sistema no tiene cargadas las tablas de zonas horarias, así que `ExtractMonth`,
# `__date` o `__month` (que Django traduce a CONVERT_TZ(..., 'America/Santiago')) devuelven NULL y el
# resultado sale vacío SIN error; SQLite sí las resuelve, por lo que las pruebas no lo delatan. Todo se
# resuelve con comparaciones de rango sobre límites calculados aquí, válidas en cualquier motor.

def _inicio_dia(d):
    """Medianoche local (America/Santiago) de la fecha `d`, con zona horaria."""
    return timezone.make_aware(datetime(d.year, d.month, d.day))


def _limites_meses(anio):
    """[(mes, inicio, fin_exclusivo)] de los 12 meses de `anio`."""
    return [
        (m, _inicio_dia(date(anio, m, 1)), _inicio_dia(date(anio + (m == 12), m % 12 + 1, 1)))
        for m in range(1, 13)
    ]


def _oc_validas(anio):
    """OC del año sin canceladas — misma base que los indicadores Res.188."""
    return OrdenCompra.objects.filter(FechaEnvio__year=anio).exclude(EstadoOC='Cancelada')


def _totales_oc(qs):
    agg = qs.aggregate(monto=Sum('TotalNeto'), n=Count('pk'))
    return {'cantidad': agg['n'] or 0, 'monto_neto': float(agg['monto'] or 0)}


def _serie_mensual(qs, anio):
    """{mes (1-12): {'monto', 'cantidad'}} de las OC de `anio` — una sola consulta con sumas condicionales."""
    agregados = {}
    for m, ini, fin in _limites_meses(anio):
        en_mes = Q(FechaEnvio__gte=ini, FechaEnvio__lt=fin)
        agregados[f'monto{m}'] = Sum('TotalNeto', filter=en_mes)
        agregados[f'n{m}'] = Count('pk', filter=en_mes)
    r = qs.aggregate(**agregados)
    return {m: {'monto': float(r[f'monto{m}'] or 0), 'cantidad': r[f'n{m}']} for m in range(1, 13)}


def _bloque_oc(anio, hoy):
    corte, corte_anterior = corte_comparable(anio, hoy)
    actual = _oc_validas(anio).filter(FechaEnvio__lt=_inicio_dia(corte + timedelta(days=1)))
    anterior = _oc_validas(anio - 1).filter(FechaEnvio__lt=_inicio_dia(corte_anterior + timedelta(days=1)))
    t_act, t_ant = _totales_oc(actual), _totales_oc(anterior)

    # La serie mensual muestra el año anterior COMPLETO (contexto) y el actual hasta el corte.
    mes_act, mes_ant = _serie_mensual(actual, anio), _serie_mensual(_oc_validas(anio - 1), anio - 1)
    mensual = [
        {
            'mes': m,
            'actual': mes_act.get(m, {}).get('monto', 0), 'cantidad_actual': mes_act.get(m, {}).get('cantidad', 0),
            'anterior': mes_ant.get(m, {}).get('monto', 0), 'cantidad_anterior': mes_ant.get(m, {}).get('cantidad', 0),
        }
        for m in range(1, 13)
    ]

    por_modalidad = {}
    for fila in actual.values('TipoCompraInterna').annotate(monto=Sum('TotalNeto'), n=Count('pk')):
        nombre = fila['TipoCompraInterna'] if fila['TipoCompraInterna'] in MODALIDADES_PRINCIPALES else 'Otras'
        acum = por_modalidad.setdefault(nombre, {'modalidad': nombre, 'cantidad': 0, 'monto': 0.0})
        acum['cantidad'] += fila['n']
        acum['monto'] += float(fila['monto'] or 0)
    modalidades = sorted(por_modalidad.values(), key=lambda m: -m['monto'])

    return {
        **t_act,
        'anterior': t_ant,
        'var_cantidad_pct': variacion_pct(t_act['cantidad'], t_ant['cantidad']),
        'var_monto_pct': variacion_pct(t_act['monto_neto'], t_ant['monto_neto']),
        'corte': corte.isoformat(), 'corte_anterior': corte_anterior.isoformat(),
        'mes_en_curso': hoy.month if anio == hoy.year else None,
        'mensual': mensual,
        'modalidades': modalidades,
        'ultima_oc': _iso(OrdenCompra.objects.aggregate(m=Max('FechaEnvio'))['m']),
    }


def _bloque_pac(anio):
    """Indicadores Res.188 (misma caché y misma función que /pac) y nota Dentro/Fuera PAC de los formularios derivados."""
    clave = f'pac_indicadores_res188_{anio}'
    ind = cache.get(clave)
    if not ind:
        ind = S.calcular_indicadores_res188(anio)
        cache.set(clave, ind, timeout=TTL_CACHE_SEG)

    k = S.calcular_pac_dentro_fuera_stats(anho=anio)['kpis']
    monto_total = k['monto_dentro'] + k['monto_fuera']
    return {
        'enlace_pct': ind['i1'],
        'plan_del_anio_cargado': ind['plan_del_anio_cargado'],
        'competitivo_pct': ind['i2'],
        'dentro_fuera': {
            'total': k['total'], 'dentro': k['dentro'], 'fuera': k['fuera'], 'pct_dentro': k['pct_dentro'],
            'nota': S._nota_desempeno_pac(k['total'], k['dentro'], k['monto_dentro'], monto_total),
            'muestra_minima': S.MUESTRA_MINIMA_PAC,
        },
    }


def _bloque_formularios(anio):
    """Formularios del año según la bandeja en que están HOY (no es un embudo acumulado)."""
    por_estado = dict(FormularioFSC.objects.filter(anho=anio).values_list('estado').annotate(n=Count('pk')).order_by())
    return {
        'bandejas': [{'codigo': c, 'nombre': n, 'cantidad': por_estado.get(c, 0)} for c, n in S.PIPELINE_ESTADOS_FSC],
        'rechazados': por_estado.get('R', 0),
        'total': sum(por_estado.values()),
        'derivados': FormularioFSCDerivado.objects.filter(anho=anio).count(),
        'actualizado': _iso(FormularioFSCEstadoLog.objects.aggregate(m=Max('fecha_registro'))['m']),
    }


def _bloque_deuda():
    """Saldo vigente de la deuda SIGFE por unidad ejecutora (foto de la última sincronización, no depende del año).

    Mismos filtro y sumas que `services.obtener_kpis_devengo` (hay una prueba que lo exige), pero solo las dos
    consultas que el Home necesita: esa función hace cinco agrupaciones sobre ~55 000 filas y tarda ~5 s.
    """
    deuda = DevengoSigfeAnual.objects.filter(monto_disponible__gt=0)
    agg = deuda.aggregate(total=Sum('monto_disponible'), vigente=Sum('monto_vigente'), n=Count('id'))
    total, vigente = float(agg['total'] or 0), float(agg['vigente'] or 0)
    por_ue = []
    for fila in deuda.values('codigo_ue').annotate(deuda=Sum('monto_disponible')).order_by('-deuda'):
        codigo, _, nombre = (fila['codigo_ue'] or '').partition(' ')
        por_ue.append({'codigo': codigo, 'nombre': nombre or fila['codigo_ue'], 'deuda': float(fila['deuda'])})
    return {
        'total': total, 'pct_pendiente': round(total / vigente * 100, 1) if vigente > 0 else 0, 'n_documentos': agg['n'],
        'por_ue': por_ue, 'actualizado': _iso(DevengoSigfeAnual.objects.aggregate(m=Max('fecha_sync'))['m']),
    }


def anios_disponibles(hoy):
    """Años (hasta el actual) con al menos una OC. Parte del año de la OC más antigua y confirma cada uno con `__year`."""
    primera = OrdenCompra.objects.aggregate(m=Min('FechaEnvio'))['m']
    if not primera:
        return []
    return [a for a in range(timezone.localtime(primera).year, hoy.year + 1) if OrdenCompra.objects.filter(FechaEnvio__year=a).exists()]


def calcular_inicio_resumen(anio=None, hoy=None, con_formularios=False, con_deuda=False):
    """Payload del Home. `con_formularios`/`con_deuda` los decide la vista según el rol del usuario.

    Resultado cacheado 5 min por (año, bloques): es agregación pura y el Home lo abren todos los usuarios.
    """
    hoy = hoy or date.today()
    anio = anio or hoy.year
    clave = f'inicio_resumen_v1_{anio}_{hoy.isoformat()}_{int(con_formularios)}{int(con_deuda)}'
    en_cache = cache.get(clave)
    if en_cache is not None:
        return en_cache

    resultado = {
        'anio': anio,
        'anios_disponibles': anios_disponibles(hoy),
        'oc': _bloque_oc(anio, hoy),
        'pac': _bloque_pac(anio),
        'formularios': _bloque_formularios(anio) if con_formularios else None,
        'deuda': _bloque_deuda() if con_deuda else None,
    }
    cache.set(clave, resultado, timeout=TTL_CACHE_SEG)
    return resultado
