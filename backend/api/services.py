import calendar
import re
from collections import defaultdict
from datetime import date, datetime
from difflib import SequenceMatcher

from django.db import transaction
from django.db.models import Avg, CharField, Count, DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Cast, Concat, Substr
from django.utils import timezone

from .models import (
    DetalleOrdenCompra, GestionContrato, Licitacion, DetalleLicitacion,
    OrdenCompra, PlanerPAC, RevisionOCCorregible,
    CompraAgilResumen, CompraAgilProveedor, CompraAgilProductoCotizado, CompraAgilProducto,
    FormularioFSC, FormularioFSCDerivado, FormularioFSCProducto, FormularioFSCEstadoLog,
    SigfeAnexo1, ConceptoJerarquia,
    PacProyectoMaestro, Departamento, Establecimiento, SsoSubdireccion,
    Factura, FacturaSyncLog,
    FscOcLink, CompradorInicial, OcPacOverride,
    ComprasCompradorPerfil, ProcesoCompra, ProcesoCompraFormulario,
    ProcesoCompraOrdenCompra, ProcesoCompraEstadoLog, ComprasNotificacion,
)

# Todas las variantes que puede tomar el flag "proveedor seleccionado" en CA
_GANADOR_FLAGS = frozenset(['1', 'Si', 'si', 'True', 'true'])


# =============================================================================
# Jerarquía de conceptos presupuestarios (ConceptoJerarquia, 702 filas, N1-N5)
# — usada por el reporte HTML de Anexo N°3 (devengo_sigfe_anual_reporte_html)
# y por el árbol jerárquico de Anexo N°1 (calcular_anexo1_detallado).
# =============================================================================

_NIVELES_PREFIJO_HIER = (10, 7, 4, 2)


def _construir_hier_lookup() -> dict:
    """{codigo: [n1_desc, n2_desc, n3_desc, n4_desc, n5_desc, nivel]} — mismo
    formato que el HIER_LOOKUP ya embebido en el HTML standalone, para poder
    reutilizar exactamente la misma lógica de resolución (resolveHier)."""
    lookup = {}
    for c in ConceptoJerarquia.objects.all().values(
        'codigo', 'n1_desc', 'n2_desc', 'n3_desc', 'n4_desc', 'n5_desc', 'nivel'
    ):
        lookup[c['codigo']] = [
            c['n1_desc'], c['n2_desc'], c['n3_desc'], c['n4_desc'], c['n5_desc'], c['nivel'],
        ]
    return lookup


def _resolver_hier(lookup: dict, codigo: str):
    """Réplica de resolveHier() del HTML: match exacto, si no, prefijos
    progresivos de largo 10/7/4/2 (N4→N1)."""
    if codigo in lookup:
        return lookup[codigo]
    for largo in _NIVELES_PREFIJO_HIER:
        prefijo = codigo[:largo]
        if prefijo in lookup:
            return lookup[prefijo]
    return None


def obtener_kpis_devengo(devengo_qs, codigo_ue=None, solo_deuda=True):
    """
    Servicio para calcular KPIs complejos de devengo
    """
    qs = devengo_qs
    if codigo_ue:
        qs = qs.filter(codigo_ue=codigo_ue)
    if solo_deuda:
        qs = qs.filter(monto_disponible__gt=0)

    agg = qs.aggregate(
        total_pendiente=Sum('monto_disponible'),
        total_pagado=Sum('monto_consumido'),
        total_vigente=Sum('monto_vigente'),
        n_registros=Count('id'),
    )

    # Top 10 proveedores con mayor deuda
    top_proveedores = (
        qs.values('principal')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')[:10]
    )

    # Deuda por UE
    por_ue = (
        qs.values('codigo_ue')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')
    )

    # Deuda por tipo de documento
    por_tipo_doc = (
        qs.values('tipo_documento')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')[:10]
    )

    # Deuda por concepto N1
    por_n1 = (
        qs.values('concepto_presupuestario')
        .annotate(deuda=Sum('monto_disponible'))
        .order_by('-deuda')[:15]
    )

    total_pendiente = float(agg['total_pendiente'] or 0)
    total_vigente = float(agg['total_vigente'] or 0)
    pct_pendiente = round((total_pendiente / total_vigente * 100), 1) if total_vigente > 0 else 0

    top_prov = list(top_proveedores)
    top_ue_entry = list(por_ue[:1])

    return {
        'kpis': {
            'deuda_total': total_pendiente,
            'deuda_pagada': float(agg['total_pagado'] or 0),
            'monto_vigente': total_vigente,
            'pct_pendiente': pct_pendiente,
            'n_registros': agg['n_registros'],
            'top_proveedor': top_prov[0]['principal'] if top_prov else '-',
            'top_proveedor_monto': float(top_prov[0]['deuda']) if top_prov else 0,
            'top_ue': top_ue_entry[0]['codigo_ue'] if top_ue_entry else '-',
            'top_ue_monto': float(top_ue_entry[0]['deuda']) if top_ue_entry else 0,
        },
        'por_ue': [{'ue': r['codigo_ue'], 'deuda': float(r['deuda'])} for r in por_ue],
        'top_proveedores': [{'prov': r['principal'], 'deuda': float(r['deuda'])} for r in top_proveedores],
        'por_tipo_doc': [{'td': r['tipo_documento'], 'deuda': float(r['deuda'])} for r in por_tipo_doc],
        'por_n1': [{'cp': r['concepto_presupuestario'], 'deuda': float(r['deuda'])} for r in por_n1],
    }


# =============================================================================
# PAC Dashboard — Indicadores Res.188/2026
# =============================================================================

def calcular_indicadores_res188(anio=2026):
    """
    Calcula los indicadores cuantificables desde la BD (Ind 1, 2, 4, 5).
    Ind 3 y 6 requieren entrada manual.
    """
    # OC válidas del año (excluye canceladas)
    oc_qs = OrdenCompra.objects.filter(
        FechaEnvio__year=anio
    ).exclude(EstadoOC='Cancelada')

    total_agg = oc_qs.aggregate(total=Sum('TotalNeto'))
    total = float(total_agg['total'] or 0)

    # ── Indicador 1: % Compras dentro del PAC ──
    pac_ids = set(
        PlanerPAC.objects.exclude(id_proyecto__isnull=True)
        .exclude(id_proyecto='')
        .values_list('id_proyecto', flat=True)
    )
    monto_enlazado = float(
        oc_qs.filter(
            EnlacePAC='Enlazada',
            ID_Proyecto__in=pac_ids
        ).aggregate(t=Sum('TotalNeto'))['t'] or 0
    )
    i1 = (monto_enlazado / total * 100) if total > 0 else None

    # ── Indicador 2: % Procesos Competitivos ──
    monto_comp = float(
        oc_qs.filter(
            Q(TipoOC='AG') |
            Q(TipoOC='SE', CodigoLicitacion__isnull=False)
        ).exclude(CodigoLicitacion='').aggregate(t=Sum('TotalNeto'))['t'] or 0
    )
    i2 = (monto_comp / total * 100) if total > 0 else None

    # ── Indicador 5: Ahorro en Compras Ágiles ──
    proveedores = list(
        CompraAgilProveedor.objects.values(
            'codigocompraagil', 'proveedorseleccionado', 'valorneto'
        )
    )
    by_ca = defaultdict(list)
    for p in proveedores:
        if p['codigocompraagil']:
            by_ca[p['codigocompraagil']].append(p)

    ahorrado = 0.0
    adjudicado = 0.0
    for rows in by_ca.values():
        sel = next((r for r in rows if str(r.get('proveedorseleccionado', '')) in _GANADOR_FLAGS), None)
        if not sel:
            continue
        p_sel = float(sel['valorneto'] or 0)
        if not p_sel:
            continue
        precios = [float(r['valorneto'] or 0) for r in rows if float(r['valorneto'] or 0) > 0]
        if len(precios) < 2:
            continue
        avg = sum(precios) / len(precios)
        ahorrado += max(0.0, avg - p_sel)
        adjudicado += p_sel

    i5 = (ahorrado / adjudicado * 100) if adjudicado > 0 else 0.0

    # ── Indicador 4: Satisfacción Servicio/Producto ──
    # Nota promedio (escala 1-7 Mercado Público) de TODOS los contratos terminados
    # y evaluados de GestionContrato, a nivel institucional (no filtrado por año):
    # la evaluación de un contrato no ocurre necesariamente el mismo año en que se
    # inició (sufijo CLxx del número de contrato), y con datos tan escasos
    # (verificado: 7 de 868 contratos tienen nota) filtrar por año del selector PAC
    # deja el indicador vacío casi siempre. Score = (nota_promedio / 7) * 100.
    ev_kpis = calcular_contratos_evaluaciones()['kpis']
    i4_nota = ev_kpis['nota_promedio']
    i4_evaluados = ev_kpis['evaluados']
    i4_terminados = ev_kpis['total_terminados']
    i4_pendientes = ev_kpis['pendientes']
    i4_score = round(min(100, (i4_nota / 7) * 100), 1) if i4_nota is not None else None

    # ── Score parcial (ind 3 y 6 en 0 cuando no hay entrada manual) ──
    sc = {
        'i1': min(100, i1 or 0),
        'i2': min(100, i2 or 0),
        'i3': 0,
        'i4': i4_score or 0,
        'i5': min(100, i5),
        'i6': 0,
    }
    pw = {'i1': .25, 'i2': .15, 'i3': .10, 'i4': .20, 'i5': .20, 'i6': .10}
    score_parcial = sum(sc[k] * pw[k] for k in pw)

    return {
        'anio': anio,
        'total_oc': total,
        'i1': round(i1, 2) if i1 is not None else None,
        'i2': round(i2, 2) if i2 is not None else None,
        'i4_nota': i4_nota,
        'i4_score': i4_score,
        'i4_evaluados': i4_evaluados,
        'i4_terminados': i4_terminados,
        'i4_pendientes': i4_pendientes,
        'i5': round(i5, 2),
        'score_parcial': round(score_parcial, 1),
        'monto_enlazado_pac': monto_enlazado,
        'monto_competitivo': monto_comp,
        'ahorro_ca': round(ahorrado, 2),
        'adjudicado_ca': round(adjudicado, 2),
    }


def calcular_oc_stats(anio=2026):
    """
    Estadísticas de OC para los 8 paneles del tab Órdenes de Compra.
    Cubre: Resumen, Estado, PAC, Enlace, LeadTime, Monetario, Histórico.
    Usa .extra() para extracciones de fecha (compatibilidad MariaDB/Django).
    """
    oc_qs = OrdenCompra.objects.filter(FechaEnvio__year=anio)
    oc_nc = oc_qs.exclude(EstadoOC='Cancelada')  # no canceladas

    # ── Resumen general ──
    resumen = oc_qs.aggregate(
        total=Count('codigo_oc'),
        monto_total=Sum('TotalNeto'),
        monto_bruto=Sum('TotalBruto'),
    )

    # ── Por estado ──
    por_estado = list(
        oc_qs.values('EstadoOC')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')
    )

    # ── Por tipo OC ──
    por_tipo = list(
        oc_qs.values('TipoOC', 'DescripcionTipoOC')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')
    )

    # ── Por unidad compradora ──
    por_unidad = list(
        oc_qs.values('C_Unidad')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')[:15]
    )

    # ── Cruce PAC ──
    cruce_pac = list(
        oc_qs.values('EnlacePAC')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')
    )

    # ── Evolución mensual (total) ──
    evolucion_mensual = list(
        oc_nc
        .extra(select={'mes': "MONTH(FechaEnvio)"})
        .values('mes')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('mes')
    )

    # ── Top proveedores ──
    top_proveedores = list(
        oc_nc
        .values('P_Nombre', 'P_Rut')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')[:15]
    )

    # ════════════════════════════════════════════════
    # RESUMEN GENERAL: evolución mensual por EnlacePAC
    # ════════════════════════════════════════════════
    evol_enlace_raw = (
        oc_nc
        .extra(select={'mes': "MONTH(FechaEnvio)"})
        .values('mes', 'EnlacePAC')
        .annotate(monto=Sum('TotalNeto'), cantidad=Count('codigo_oc'))
        .order_by('mes')
    )
    evol_map = {}
    for r in evol_enlace_raw:
        m = r['mes']
        if m not in evol_map:
            evol_map[m] = {'mes': m, 'enlazada': 0.0, 'no_enlazada': 0.0, 'cantidad_enlazada': 0, 'cantidad_no_enlazada': 0}
        v = float(r['monto'] or 0)
        n = r['cantidad'] or 0
        if r['EnlacePAC'] == 'Enlazada':
            evol_map[m]['enlazada'] = v
            evol_map[m]['cantidad_enlazada'] = n
        else:
            evol_map[m]['no_enlazada'] += v
            evol_map[m]['cantidad_no_enlazada'] += n
    evolucion_enlace = sorted(evol_map.values(), key=lambda x: x['mes'])

    # Por TipoOCInterno con split Enlazada/No Enlazada
    tipo_int_raw = (
        oc_nc
        .values('TipoOCInterno', 'EnlacePAC')
        .annotate(monto=Sum('TotalNeto'), cantidad=Count('codigo_oc'))
        .order_by('TipoOCInterno')
    )
    tipo_int_map = {}
    for r in tipo_int_raw:
        t = r['TipoOCInterno'] or 'Sin Clasificar'
        if t not in tipo_int_map:
            tipo_int_map[t] = {'tipo': t, 'enlazada': 0.0, 'no_enlazada': 0.0, 'total': 0.0, 'cantidad': 0}
        v = float(r['monto'] or 0)
        tipo_int_map[t]['total'] += v
        tipo_int_map[t]['cantidad'] += r['cantidad']
        if r['EnlacePAC'] == 'Enlazada':
            tipo_int_map[t]['enlazada'] += v
        else:
            tipo_int_map[t]['no_enlazada'] += v
    por_tipo_interno = sorted(tipo_int_map.values(), key=lambda x: x['total'], reverse=True)

    # ════════════════════════════════════════════════
    # ESTADO OC: pendientes por antigüedad
    # ════════════════════════════════════════════════
    pendientes_qs = oc_qs.exclude(EstadoOC__in=['Recepción Conforme', 'Cancelada'])
    rc_count = oc_qs.filter(EstadoOC='Recepción Conforme').count()
    pend_count = pendientes_qs.count()
    pend_monto = float(pendientes_qs.aggregate(t=Sum('TotalNeto'))['t'] or 0)

    pend_con_dias = list(
        pendientes_qs.exclude(FechaEnvio__isnull=True)
        .extra(select={'dias': "COALESCE(GREATEST(0, DATEDIFF(CURDATE(), FechaEnvio)), 0)"})
        .values('codigo_oc', 'DescripcionTipoOC', 'EstadoOC', 'P_Nombre',
                'FechaEnvio', 'TotalNeto', 'LinkMP', 'dias')
    )
    pend_con_dias.sort(key=lambda x: int(x['dias'] or 0), reverse=True)
    buckets = {'0-7': 0, '8-15': 0, '16-30': 0, '31-60': 0, '61-90': 0, '>90': 0}
    critico = atento = normal = 0
    for r in pend_con_dias:
        d = int(r['dias'] or 0)
        if d <= 7:
            buckets['0-7'] += 1; normal += 1
        elif d <= 15:
            buckets['8-15'] += 1; normal += 1
        elif d <= 30:
            buckets['16-30'] += 1; normal += 1
        elif d <= 60:
            buckets['31-60'] += 1; atento += 1
        elif d <= 90:
            buckets['61-90'] += 1; critico += 1
        else:
            buckets['>90'] += 1; critico += 1

    pendientes_edad = [{'rango': k, 'cantidad': v} for k, v in buckets.items()]
    pendientes_tabla = [
        {
            'codigo_oc': r['codigo_oc'],
            'descripcion_tipo': r['DescripcionTipoOC'] or '',
            'estado': r['EstadoOC'] or '',
            'proveedor': r['P_Nombre'] or '',
            'fecha_envio': str(r['FechaEnvio'])[:10] if r['FechaEnvio'] else '',
            'total_neto': float(r['TotalNeto'] or 0),
            'link_mp': r['LinkMP'] or '',
            'dias_pend': int(r['dias'] or 0),
        }
        for r in pend_con_dias[:50]
    ]

    pendientes_evol = list(
        pendientes_qs.exclude(FechaEnvio__isnull=True)
        .extra(select={'mes': "MONTH(FechaEnvio)"})
        .values('mes')
        .annotate(cantidad=Count('codigo_oc'))
        .order_by('mes')
    )

    # ════════════════════════════════════════════════
    # ANÁLISIS PAC: semestral + no enlazadas
    # ════════════════════════════════════════════════
    oc_enlazada = oc_nc.filter(EnlacePAC='Enlazada')
    oc_no_enlazada = oc_nc.filter(EnlacePAC='No Enlazada')

    pac_semestral = {
        's1_enlazada': float(oc_enlazada.filter(FechaEnvio__month__lte=6).aggregate(t=Sum('TotalNeto'))['t'] or 0),
        's2_enlazada': float(oc_enlazada.filter(FechaEnvio__month__gte=7).aggregate(t=Sum('TotalNeto'))['t'] or 0),
        's1_no_enlazada': float(oc_no_enlazada.filter(FechaEnvio__month__lte=6).aggregate(t=Sum('TotalNeto'))['t'] or 0),
        's2_no_enlazada': float(oc_no_enlazada.filter(FechaEnvio__month__gte=7).aggregate(t=Sum('TotalNeto'))['t'] or 0),
    }

    no_enlazadas_tc = list(
        oc_no_enlazada.values('TipoCompraInterna')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')
    )
    no_enlazadas_ti = list(
        oc_no_enlazada.values('TipoOCInterno')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')
    )
    # "Resumen por Tipo OC" — agrupado por DescripcionTipoOC (distinto de TipoCompraInterna arriba)
    no_enlazadas_tipo_oc_raw = list(
        oc_no_enlazada.values('DescripcionTipoOC')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-cantidad')
    )
    no_enlazadas_tipo_oc = [
        {'tipo_oc': r['DescripcionTipoOC'] or 'Sin tipo', 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
        for r in no_enlazadas_tipo_oc_raw
    ]

    # Matriz cruzada: DescripcionTipoOC × TipoOCInterno (N° OCs), solo no enlazadas
    matriz_raw = list(
        oc_no_enlazada.values('DescripcionTipoOC', 'TipoOCInterno')
        .annotate(cantidad=Count('codigo_oc'))
    )
    matriz_filas = sorted({(r['DescripcionTipoOC'] or 'Sin tipo') for r in matriz_raw})
    matriz_columnas = sorted({(r['TipoOCInterno'] or 'Sin clasificar') for r in matriz_raw})
    matriz_datos = {fila: {} for fila in matriz_filas}
    for r in matriz_raw:
        fila = r['DescripcionTipoOC'] or 'Sin tipo'
        col = r['TipoOCInterno'] or 'Sin clasificar'
        matriz_datos[fila][col] = matriz_datos[fila].get(col, 0) + r['cantidad']
    # "Punto más relevante" de la matriz — la celda (Tipo OC, Tipo Interno) con más OC,
    # calculado una sola vez en el backend para que dashboard y reportes lo lean igual.
    total_matriz = sum(v for fila in matriz_datos.values() for v in fila.values())
    celda_max = None
    for fila, cols in matriz_datos.items():
        for col, val in cols.items():
            if celda_max is None or val > celda_max[2]:
                celda_max = (fila, col, val)
    matriz_insight = None
    if celda_max and total_matriz:
        f_max, c_max, v_max = celda_max
        matriz_insight = {
            'tipo_oc': f_max, 'tipo_interno': c_max, 'cantidad': v_max,
            'pct_del_total': round(v_max / total_matriz * 100, 1),
            'total_matriz': total_matriz,
        }
    matriz_tipo_oc_interno = {
        'filas': matriz_filas, 'columnas': matriz_columnas, 'datos': matriz_datos,
        'insight': matriz_insight,
    }

    # ════════════════════════════════════════════════
    # OPORTUNIDAD ENLACE
    # ════════════════════════════════════════════════
    oc_corregibles = oc_no_enlazada.exclude(CodigoLicitacion='').exclude(CodigoLicitacion__isnull=True)
    top_lic = list(
        oc_corregibles.values('CodigoLicitacion')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-cantidad')[:10]
    )
    lic_unicas = oc_corregibles.values('CodigoLicitacion').distinct().count()
    corregibles_count = oc_corregibles.count()
    no_enlazadas_tabla = list(
        oc_corregibles.values(
            'codigo_oc', 'CodigoLicitacion', 'DescripcionTipoOC',
            'P_Nombre', 'TotalNeto', 'FechaEnvio', 'LinkMP'
        ).order_by('-TotalNeto')[:50]
    )

    # ════════════════════════════════════════════════
    # LEAD TIME
    # ════════════════════════════════════════════════
    oc_ce_raw = list(
        oc_nc.exclude(FechaCreacion__isnull=True).exclude(FechaEnvio__isnull=True)
        .extra(select={'dias_ce': "COALESCE(GREATEST(0, DATEDIFF(FechaEnvio, FechaCreacion)), 0)"})
        .values('codigo_oc', 'DescripcionTipoOC', 'P_Nombre',
                'FechaCreacion', 'FechaEnvio', 'FechaAceptacion', 'TotalNeto', 'dias_ce')
    )
    for r in oc_ce_raw:
        r['dias_ce'] = int(r['dias_ce'] or 0)
    oc_ea_map = {
        r['codigo_oc']: int(r['dias_ea'] or 0)
        for r in list(
            oc_nc.exclude(FechaEnvio__isnull=True).exclude(FechaAceptacion__isnull=True)
            .extra(select={'dias_ea': "COALESCE(GREATEST(0, DATEDIFF(FechaAceptacion, FechaEnvio)), 0)"})
            .values('codigo_oc', 'dias_ea')
        )
    }

    def lt_bucket(d):
        if d is None:
            return None
        if d <= 3: return '0-3'
        elif d <= 7: return '4-7'
        elif d <= 14: return '8-14'
        elif d <= 30: return '15-30'
        elif d <= 60: return '31-60'
        else: return '>60'

    lt_ce_cnt = defaultdict(int)
    lt_ea_cnt = defaultdict(int)
    lt_modal_ce = defaultdict(list)
    lt_modal_ea = defaultdict(list)

    for r in oc_ce_raw:
        b = lt_bucket(r['dias_ce'])
        if b:
            lt_ce_cnt[b] += 1
        ea = oc_ea_map.get(r['codigo_oc'])
        if ea is not None:
            b_ea = lt_bucket(ea)
            if b_ea:
                lt_ea_cnt[b_ea] += 1
        modal = r['DescripcionTipoOC'] or 'Sin tipo'
        lt_modal_ce[modal].append(r['dias_ce'] or 0)
        if ea is not None:
            lt_modal_ea[modal].append(ea)

    lt_rangos = ['0-3', '4-7', '8-14', '15-30', '31-60', '>60']
    lt_ce_distribucion = [{'rango': rng, 'cantidad': lt_ce_cnt[rng]} for rng in lt_rangos]
    lt_ea_distribucion = [{'rango': rng, 'cantidad': lt_ea_cnt[rng]} for rng in lt_rangos]
    lt_por_modalidad = sorted([
        {
            'modalidad': k,
            'avg_ce': round(sum(lt_modal_ce[k]) / len(lt_modal_ce[k]), 1) if lt_modal_ce[k] else 0,
            'avg_ea': round(sum(lt_modal_ea[k]) / len(lt_modal_ea[k]), 1) if lt_modal_ea[k] else 0,
            'cantidad': len(lt_modal_ce[k]),
        }
        for k in lt_modal_ce
    ], key=lambda x: x['cantidad'], reverse=True)

    all_ce_vals = [r['dias_ce'] or 0 for r in oc_ce_raw]
    all_ea_vals = [v for v in oc_ea_map.values() if v is not None]
    avg_ce = round(sum(all_ce_vals) / len(all_ce_vals), 1) if all_ce_vals else 0
    avg_ea = round(sum(all_ea_vals) / len(all_ea_vals), 1) if all_ea_vals else 0

    lt_tabla = [
        {
            'codigo_oc': r['codigo_oc'],
            'descripcion_tipo': r['DescripcionTipoOC'] or '',
            'proveedor': r['P_Nombre'] or '',
            'fecha_creacion': str(r['FechaCreacion'])[:10] if r['FechaCreacion'] else '',
            'fecha_envio': str(r['FechaEnvio'])[:10] if r['FechaEnvio'] else '',
            'fecha_aceptacion': str(r['FechaAceptacion'])[:10] if r['FechaAceptacion'] else '',
            'lt_ce': r['dias_ce'] or 0,
            'lt_ea': oc_ea_map.get(r['codigo_oc']) or 0,
            'total_neto': float(r['TotalNeto'] or 0),
        }
        for r in oc_ce_raw if (r['dias_ce'] or 0) > 10
    ][:50]

    # Lead time por unidad (legacy, mantenido para compatibilidad)
    lt_by_unidad = defaultdict(list)
    for r in oc_ce_raw:
        ea = oc_ea_map.get(r['codigo_oc'])
        total = (r['dias_ce'] or 0) + (ea or 0)
        if total >= 0:
            lt_by_unidad[r['DescripcionTipoOC'] or 'Sin tipo'].append(total)
    lead_time_stats = [
        {'unidad': u, 'avg_dias': round(sum(v) / len(v), 1), 'n': len(v)}
        for u, v in lt_by_unidad.items()
    ]
    lead_time_stats.sort(key=lambda x: x['avg_dias'], reverse=True)

    # ════════════════════════════════════════════════
    # ANÁLISIS MONETARIO
    # ════════════════════════════════════════════════
    monto_rc = float(oc_qs.filter(EstadoOC='Recepción Conforme').aggregate(t=Sum('TotalNeto'))['t'] or 0)
    monto_cancelado = float(oc_qs.filter(EstadoOC='Cancelada').aggregate(t=Sum('TotalNeto'))['t'] or 0)
    monto_pendiente = float(pendientes_qs.aggregate(t=Sum('TotalNeto'))['t'] or 0)

    por_forma_pago = list(
        oc_nc.values('DescripcionFormaPago')
        .annotate(monto=Sum('TotalNeto'), cantidad=Count('codigo_oc'))
        .order_by('-monto')
    )
    por_despacho = list(
        oc_nc.values('DescripcionDespacho')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-cantidad')
    )
    por_moneda = list(
        oc_nc.values('DescripcionMoneda')
        .annotate(monto=Sum('TotalNeto'), cantidad=Count('codigo_oc'))
        .order_by('-monto')
    )
    por_modalidad_monto = list(
        oc_nc.values('DescripcionTipoOC')
        .annotate(monto=Sum('TotalNeto'), cantidad=Count('codigo_oc'))
        .order_by('-monto')
    )

    # ════════════════════════════════════════════════
    # COMPARATIVO HISTÓRICO (todos los años)
    # ════════════════════════════════════════════════
    hist_qs = OrdenCompra.objects.exclude(EstadoOC='Cancelada').exclude(FechaEnvio__isnull=True)

    hist_anual_raw = list(
        hist_qs
        .extra(select={'year': "YEAR(FechaEnvio)"})
        .values('year')
        .annotate(total_oc=Count('codigo_oc'), monto_total=Sum('TotalNeto'))
        .order_by('year')
    )
    historico_anual = [
        {'anio': r['year'], 'total_oc': r['total_oc'], 'monto_total': float(r['monto_total'] or 0)}
        for r in hist_anual_raw if r['year']
    ]

    # Split Enlazada/No Enlazada por año — alimenta el "Comparativo Anual" (% enlace PAC)
    hist_enlace_anual_raw = list(
        hist_qs
        .extra(select={'year': "YEAR(FechaEnvio)"})
        .values('year', 'EnlacePAC')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
    )
    hist_enlace_anual_map = defaultdict(lambda: {'enlazadas': 0, 'monto_enlazado': 0.0, 'monto_no_enlazado': 0.0})
    for r in hist_enlace_anual_raw:
        y = r['year']
        if not y:
            continue
        m = float(r['monto'] or 0)
        if r['EnlacePAC'] == 'Enlazada':
            hist_enlace_anual_map[y]['enlazadas'] += r['cantidad']
            hist_enlace_anual_map[y]['monto_enlazado'] += m
        else:
            hist_enlace_anual_map[y]['monto_no_enlazado'] += m

    historico_enlace_anual = [
        {
            'anio': r['anio'], 'total_oc': r['total_oc'], 'monto_total': r['monto_total'],
            'enlazadas': hist_enlace_anual_map[r['anio']]['enlazadas'],
            'pct_enlace': round(hist_enlace_anual_map[r['anio']]['enlazadas'] / r['total_oc'] * 100, 1) if r['total_oc'] else 0.0,
            'monto_enlazado': hist_enlace_anual_map[r['anio']]['monto_enlazado'],
            'monto_no_enlazado': hist_enlace_anual_map[r['anio']]['monto_no_enlazado'],
        }
        for r in historico_anual
    ]

    # Split Enlazada/No Enlazada por (año, mes) — serie mensual multi-año para el gráfico de línea
    hist_enlace_mensual_raw = list(
        hist_qs
        .extra(select={'year': "YEAR(FechaEnvio)", 'mes': "MONTH(FechaEnvio)"})
        .values('year', 'mes', 'EnlacePAC')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
    )
    hist_enlace_mensual_map = defaultdict(lambda: {'total': 0, 'enlazadas': 0, 'monto_enlazado': 0.0, 'monto_no_enlazado': 0.0})
    for r in hist_enlace_mensual_raw:
        y, mes = r['year'], r['mes']
        if not y or not mes:
            continue
        key = (y, mes)
        m = float(r['monto'] or 0)
        hist_enlace_mensual_map[key]['total'] += r['cantidad']
        if r['EnlacePAC'] == 'Enlazada':
            hist_enlace_mensual_map[key]['enlazadas'] += r['cantidad']
            hist_enlace_mensual_map[key]['monto_enlazado'] += m
        else:
            hist_enlace_mensual_map[key]['monto_no_enlazado'] += m

    historico_enlace_mensual = [
        {
            'anio': y, 'mes': mes,
            'total': v['total'], 'enlazadas': v['enlazadas'],
            'pct_enlace': round(v['enlazadas'] / v['total'] * 100, 1) if v['total'] else 0.0,
            'monto_enlazado': v['monto_enlazado'], 'monto_no_enlazado': v['monto_no_enlazado'],
        }
        for (y, mes), v in sorted(hist_enlace_mensual_map.items())
    ]

    hist_modal_raw = list(
        hist_qs
        .extra(select={'year': "YEAR(FechaEnvio)"})
        .values('year', 'DescripcionTipoOC')
        .annotate(monto=Sum('TotalNeto'), cantidad=Count('codigo_oc'))
        .order_by('year')
    )
    historico_modalidad = [
        {
            'anio': r['year'],
            'modalidad': r['DescripcionTipoOC'] or 'Sin tipo',
            'monto': float(r['monto'] or 0),
            'cantidad': r['cantidad'],
        }
        for r in hist_modal_raw if r['year']
    ]

    hist_sem_raw = list(
        hist_qs
        .extra(select={'year': "YEAR(FechaEnvio)", 'mes': "MONTH(FechaEnvio)"})
        .values('year', 'mes')
        .annotate(monto=Sum('TotalNeto'), cantidad=Count('codigo_oc'))
        .order_by('year', 'mes')
    )
    hist_sem_map = defaultdict(lambda: {'s1_monto': 0.0, 's2_monto': 0.0, 's1_cantidad': 0, 's2_cantidad': 0})
    for r in hist_sem_raw:
        a = r['year']
        mv = float(r['monto'] or 0)
        nv = r['cantidad'] or 0
        if (r['mes'] or 0) <= 6:
            hist_sem_map[a]['s1_monto'] += mv
            hist_sem_map[a]['s1_cantidad'] += nv
        else:
            hist_sem_map[a]['s2_monto'] += mv
            hist_sem_map[a]['s2_cantidad'] += nv
    historico_semestral = [{'anio': k, **v} for k, v in sorted(hist_sem_map.items())]

    # ════════════════════════════════════════════════
    # CORREGIDAS — revisiones manuales de enlace PAC (RevisionOCCorregible)
    # Institucional (no filtrado por año), igual que en /ordenes-compra.
    # ════════════════════════════════════════════════
    revisiones = list(RevisionOCCorregible.objects.values('codigo_oc', 'resultado'))
    revisiones_enlazada = [r for r in revisiones if r['resultado'] == 'Enlazada']
    codigos_corregidos = {r['codigo_oc'] for r in revisiones_enlazada}
    sincronizadas = OrdenCompra.objects.filter(
        codigo_oc__in=codigos_corregidos, EnlacePAC='Enlazada'
    ).count()
    corregidas = {
        'total_revisiones': len(revisiones),
        'enlazadas_revisiones': len(revisiones_enlazada),
        'oc_unicas_corregidas': len(codigos_corregidos),
        'sincronizadas': sincronizadas,
        'esperando_sync': len(codigos_corregidos) - sincronizadas,
    }

    return {
        'anio': anio,
        'corregidas': corregidas,
        'resumen': {
            'total_oc': resumen['total'] or 0,
            'monto_total': float(resumen['monto_total'] or 0),
            'monto_bruto': float(resumen['monto_bruto'] or 0),
            'rc_count': rc_count,
            'pendientes_count': pend_count,
            'pendientes_monto': pend_monto,
            'critico': critico,
            'atento': atento,
            'normal': normal,
            'monto_rc': monto_rc,
            'monto_cancelado': monto_cancelado,
            'monto_pendiente': monto_pendiente,
            'avg_lt_ce': avg_ce,
            'avg_lt_ea': avg_ea,
        },
        'por_estado': [
            {'estado': r['EstadoOC'], 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in por_estado
        ],
        'por_tipo': [
            {'tipo': r['TipoOC'], 'descripcion': r['DescripcionTipoOC'],
             'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in por_tipo
        ],
        'por_unidad': [
            {'unidad': r['C_Unidad'], 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in por_unidad
        ],
        'cruce_pac': [
            {'enlace': r['EnlacePAC'] or 'Sin enlace', 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in cruce_pac
        ],
        'evolucion_mensual': [
            {'mes': r['mes'], 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in evolucion_mensual
        ],
        'lead_time': lead_time_stats[:15],
        'top_proveedores': [
            {'nombre': r['P_Nombre'], 'rut': r['P_Rut'],
             'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in top_proveedores
        ],
        # ── Nuevos campos ──
        'evolucion_enlace': evolucion_enlace,
        'por_tipo_interno': por_tipo_interno,
        'pendientes_edad': pendientes_edad,
        'pendientes_evolucion': [{'mes': r['mes'], 'cantidad': r['cantidad']} for r in pendientes_evol],
        'pendientes_tabla': pendientes_tabla,
        'pac_semestral': pac_semestral,
        'no_enlazadas_tipo_compra': [
            {'tipo_compra': r['TipoCompraInterna'] or 'Sin tipo', 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in no_enlazadas_tc
        ],
        'no_enlazadas_tipo_interno': [
            {'tipo_interno': r['TipoOCInterno'] or 'Sin tipo', 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in no_enlazadas_ti
        ],
        'no_enlazadas_tipo_oc': no_enlazadas_tipo_oc,
        'matriz_tipo_oc_interno': matriz_tipo_oc_interno,
        'oportunidades_enlace': {
            'top_licitaciones': [
                {'codigo_licitacion': r['CodigoLicitacion'], 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
                for r in top_lic
            ],
            'lic_unicas': lic_unicas,
            'corregibles': corregibles_count,
        },
        'no_enlazadas_tabla': [
            {
                'codigo_oc': r['codigo_oc'],
                'codigo_licitacion': r['CodigoLicitacion'] or '',
                'descripcion_tipo': r['DescripcionTipoOC'] or '',
                'proveedor': r['P_Nombre'] or '',
                'total_neto': float(r['TotalNeto'] or 0),
                'fecha_envio': str(r['FechaEnvio'])[:10] if r['FechaEnvio'] else '',
                'link_mp': r['LinkMP'] or '',
            }
            for r in no_enlazadas_tabla
        ],
        'lt_ce_distribucion': lt_ce_distribucion,
        'lt_ea_distribucion': lt_ea_distribucion,
        'lt_por_modalidad': lt_por_modalidad,
        'lt_tabla': lt_tabla,
        'por_forma_pago': [
            {'forma_pago': r['DescripcionFormaPago'] or 'Sin dato', 'monto': float(r['monto'] or 0), 'cantidad': r['cantidad']}
            for r in por_forma_pago
        ],
        'por_despacho': [
            {'despacho': r['DescripcionDespacho'] or 'Sin dato', 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in por_despacho
        ],
        'por_moneda': [
            {'moneda': r['DescripcionMoneda'] or 'Sin dato', 'monto': float(r['monto'] or 0), 'cantidad': r['cantidad']}
            for r in por_moneda
        ],
        'por_modalidad_monto': [
            {'modalidad': r['DescripcionTipoOC'] or 'Sin tipo', 'monto': float(r['monto'] or 0), 'cantidad': r['cantidad']}
            for r in por_modalidad_monto
        ],
        'historico_anual': historico_anual,
        'historico_semestral': historico_semestral,
        'historico_modalidad': historico_modalidad,
        'historico_enlace_anual': historico_enlace_anual,
        'historico_enlace_mensual': historico_enlace_mensual,
    }


def calcular_oc_productos(anio=2026):
    """
    Estadísticas de productos (DetalleOrdenCompra) para el tab Análisis Productos.
    """
    oc_ids = list(OrdenCompra.objects.filter(FechaEnvio__year=anio).values_list('codigo_oc', flat=True))
    det_qs = DetalleOrdenCompra.objects.filter(orden_compra_id__in=oc_ids)

    agg = det_qs.aggregate(
        unique_prods=Count('CodigoProducto', distinct=True),
        total_monto=Sum('TotalLinea'),
        oc_count=Count('orden_compra', distinct=True),
    )

    top_categorias = list(
        det_qs.values('Categoria')
        .annotate(monto=Sum('TotalLinea'), cantidad=Count('id'))
        .order_by('-monto')[:10]
    )
    top_productos = list(
        det_qs.values('Producto')
        .annotate(cantidad=Count('id'), monto=Sum('TotalLinea'))
        .order_by('-cantidad')[:10]
    )

    oc_td_ids = list(OrdenCompra.objects.filter(FechaEnvio__year=anio, TipoOC='TD').values_list('codigo_oc', flat=True))
    top_td = list(
        DetalleOrdenCompra.objects.filter(orden_compra_id__in=oc_td_ids)
        .values('Producto')
        .annotate(cantidad=Count('id'), monto=Sum('TotalLinea'))
        .order_by('-monto')[:10]
    )

    # Top 5 categorías × modalidad (gráfico apilado)
    top5_cats = [r['Categoria'] for r in top_categorias[:5]]
    oc_modal_map = dict(OrdenCompra.objects.filter(codigo_oc__in=oc_ids).values_list('codigo_oc', 'DescripcionTipoOC'))
    cat_modal_raw = list(
        det_qs.filter(Categoria__in=top5_cats)
        .values('Categoria', 'orden_compra_id')
        .annotate(monto=Sum('TotalLinea'))
    )
    cat_modal_agg = defaultdict(lambda: defaultdict(float))
    for r in cat_modal_raw:
        modal = oc_modal_map.get(r['orden_compra_id']) or 'Sin tipo'
        cat_modal_agg[r['Categoria'] or 'Sin categoría'][modal] += float(r['monto'] or 0)

    por_categoria_modalidad = [
        {'categoria': cat, 'modalidades': dict(mods)}
        for cat, mods in cat_modal_agg.items()
    ]

    return {
        'anio': anio,
        'resumen': {
            'unique_productos': agg['unique_prods'] or 0,
            'total_lineas_monto': float(agg['total_monto'] or 0),
            'oc_con_detalle': agg['oc_count'] or 0,
        },
        'top_categorias': [
            {'categoria': r['Categoria'] or 'Sin categoría', 'monto': float(r['monto'] or 0), 'cantidad': r['cantidad']}
            for r in top_categorias
        ],
        'top_productos': [
            {'producto': r['Producto'] or 'Sin nombre', 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in top_productos
        ],
        'top_td': [
            {'producto': r['Producto'] or 'Sin nombre', 'cantidad': r['cantidad'], 'monto': float(r['monto'] or 0)}
            for r in top_td
        ],
        'por_categoria_modalidad': por_categoria_modalidad,
    }


# =============================================================================
# Módulo Compra Ágil — Estadísticas de Ahorro
# =============================================================================

def calcular_compraagil_ahorro_stats(fecha_desde=None, fecha_hasta=None):
    """
    Calcula KPIs de ahorro para el módulo Compra Ágil.
    - Ahorro simple: PresupuestoEstimado - TotalBruto(OC)
    - % Ahorro Res.188/2026: metodología por ítem (promedio ofertas vs adjudicado)
    Los campos monetarios están almacenados como TextField → conversión explícita.
    """
    def _f(val):
        try:
            return float(val or 0)
        except (ValueError, TypeError):
            return 0.0

    # ── 1. Base queryset ──────────────────────────────────────────────────────
    qs = CompraAgilResumen.objects.all()
    if fecha_desde:
        qs = qs.filter(fechapublicacion__gte=fecha_desde)
    if fecha_hasta:
        qs = qs.filter(fechapublicacion__lte=fecha_hasta)

    all_ca = list(qs.values(
        'codigocompraagil', 'nombre', 'estadoglosa', 'unidadcompra',
        'presupuestoestimado', 'oc_codigo', 'fechapublicacion', 'fechacierre',
        'totalofertasrecibidas', 'totalproveedorescotizando',
    ))

    # ── 2. OCs asociadas ─────────────────────────────────────────────────────
    oc_codigos = [ca['oc_codigo'] for ca in all_ca if ca.get('oc_codigo')]
    oc_map = {}
    if oc_codigos:
        for oc in OrdenCompra.objects.filter(codigo_oc__in=oc_codigos).values(
            'codigo_oc', 'TotalBruto', 'TotalNeto', 'EstadoOC', 'FechaEnvio',
        ):
            oc_map[oc['codigo_oc']] = oc

    # ── 3. Proveedores por CA ─────────────────────────────────────────────────
    prov_by_ca = defaultdict(list)
    for p in CompraAgilProveedor.objects.values(
        'codigocompraagil', 'rutproveedor', 'razonsocial',
        'proveedorseleccionado', 'valorneto', 'montototal', 'totalproductoscotizados',
    ):
        if p['codigocompraagil']:
            prov_by_ca[p['codigocompraagil']].append(p)

    # ── 4. Cotizaciones por ítem ──────────────────────────────────────────────
    cot_by_ca = defaultdict(list)
    for c in CompraAgilProductoCotizado.objects.values(
        'codigocompraagil', 'rutproveedor', 'codigoproducto',
        'nombreproducto', 'cantidad', 'preciounitario',
    ):
        if c['codigocompraagil']:
            cot_by_ca[c['codigocompraagil']].append(c)

    # ── 5. Acumuladores ──────────────────────────────────────────────────────
    total_presupuesto = 0.0
    total_monto_oc = 0.0
    ahorro_simple_total = 0.0
    ahorro_res188_total = 0.0
    adjudicado_res188_total = 0.0

    por_unidad = defaultdict(lambda: {
        'presupuesto': 0.0, 'monto_oc': 0.0, 'ahorro': 0.0,
        'adjudicadas': 0, 'total': 0,
    })
    por_estado = defaultdict(lambda: {'cantidad': 0, 'presupuesto': 0.0})
    por_mes = defaultdict(lambda: {'cantidad': 0, 'presupuesto': 0.0, 'monto_oc': 0.0})
    por_unidad_mes = defaultdict(lambda: {
        'presupuesto': 0.0, 'monto_oc': 0.0, 'ahorro': 0.0, 'cantidad': 0,
    })
    top_ahorro_items = []
    mejora_items = []

    for ca in all_ca:
        codigo = ca['codigocompraagil'] or ''
        estado = ca.get('estadoglosa') or ''
        unidad = ca.get('unidadcompra') or 'Sin unidad'
        presupuesto = _f(ca.get('presupuestoestimado'))
        # fechapublicacion es DateTimeField → usar strftime; antes era TextField
        fecha_val = ca.get('fechapublicacion')
        fecha = fecha_val.strftime('%Y-%m') if fecha_val else ''

        total_presupuesto += presupuesto
        por_estado[estado]['cantidad'] += 1
        por_estado[estado]['presupuesto'] += presupuesto
        por_unidad[unidad]['presupuesto'] += presupuesto
        por_unidad[unidad]['total'] += 1
        por_mes[fecha]['cantidad'] += 1
        por_mes[fecha]['presupuesto'] += presupuesto
        key_um = (unidad, fecha)
        por_unidad_mes[key_um]['presupuesto'] += presupuesto
        por_unidad_mes[key_um]['cantidad'] += 1

        # Ahorro simple (solo si tiene OC)
        oc = oc_map.get(ca.get('oc_codigo') or '')
        monto_oc = _f(oc.get('TotalBruto')) if oc else 0.0
        if monto_oc > 0:
            total_monto_oc += monto_oc
            por_unidad[unidad]['monto_oc'] += monto_oc
            por_mes[fecha]['monto_oc'] += monto_oc
            por_unidad_mes[key_um]['monto_oc'] += monto_oc
            if presupuesto > 0:
                ahorro = presupuesto - monto_oc
                ahorro_simple_total += ahorro
                por_unidad[unidad]['ahorro'] += ahorro
                por_unidad_mes[key_um]['ahorro'] += ahorro
        if estado == 'Proveedor seleccionado':
            por_unidad[unidad]['adjudicadas'] += 1

        # Ahorro Res.188 por ítem
        proveedores_ca = prov_by_ca.get(codigo, [])
        ganador = next(
            (p for p in proveedores_ca
             if str(p.get('proveedorseleccionado', '')) in ('1', 'Si', 'si', 'True', 'true')),
            None,
        )
        cotizaciones_ca = cot_by_ca.get(codigo, [])
        if ganador and cotizaciones_ca:
            rut_ganador = ganador.get('rutproveedor', '')
            by_product = defaultdict(list)
            for c in cotizaciones_ca:
                if c.get('codigoproducto'):
                    by_product[c['codigoproducto']].append(c)

            for prod_code, cots in by_product.items():
                precios_competidores, precio_ganador, cantidad_adj, nombre_prod = [], None, 0.0, ''
                for cot in cots:
                    precio = _f(cot.get('preciounitario'))
                    if cot.get('rutproveedor') == rut_ganador:
                        # Precio del ganador: se guarda separado, no entra al promedio
                        if precio > 0:
                            precio_ganador = precio
                        cantidad_adj = _f(cot.get('cantidad'))
                        nombre_prod = cot.get('nombreproducto', '')
                    elif precio > 0:
                        # Solo competidores van al promedio
                        precios_competidores.append(precio)

                if len(precios_competidores) >= 1 and precio_ganador is not None:
                    avg = sum(precios_competidores) / len(precios_competidores)
                    ahorro_item = (avg - precio_ganador) * cantidad_adj
                    adj_item = precio_ganador * cantidad_adj
                    ahorro_res188_total += ahorro_item
                    adjudicado_res188_total += adj_item
                    entry = {
                        'codigo_ca': codigo,
                        'nombre_ca': ca.get('nombre', ''),
                        'codigo_producto': prod_code,
                        'nombre_producto': nombre_prod,
                        'precio_promedio': round(avg, 0),
                        'precio_adjudicado': round(precio_ganador, 0),
                        'cantidad': cantidad_adj,
                        'ahorro': round(ahorro_item, 0),
                    }
                    if ahorro_item > 0:
                        top_ahorro_items.append(entry)
                    elif ahorro_item < 0:
                        mejora_items.append({**entry, 'diferencia': round(abs(ahorro_item), 0)})

    pct_res188 = (ahorro_res188_total / adjudicado_res188_total * 100) if adjudicado_res188_total > 0 else 0.0

    # ── 6. Top proveedores ────────────────────────────────────────────────────
    prov_stats = defaultdict(lambda: {'razonsocial': '', 'ganadas': 0, 'participadas': 0, 'monto': 0.0})
    for p in CompraAgilProveedor.objects.values(
        'rutproveedor', 'razonsocial', 'proveedorseleccionado', 'montototal',
    ):
        rut = p['rutproveedor'] or 'SIN_RUT'
        prov_stats[rut]['razonsocial'] = p.get('razonsocial', '')
        prov_stats[rut]['participadas'] += 1
        if str(p.get('proveedorseleccionado', '')) in ('1', 'Si', 'si', 'True', 'true'):
            prov_stats[rut]['ganadas'] += 1
            prov_stats[rut]['monto'] += _f(p.get('montototal'))

    top_proveedores = sorted(
        [
            {
                'rut': k, 'razonsocial': v['razonsocial'],
                'ganadas': v['ganadas'], 'participadas': v['participadas'],
                'monto_total': round(v['monto'], 0),
                'tasa': round(v['ganadas'] / v['participadas'] * 100, 1) if v['participadas'] > 0 else 0,
            }
            for k, v in prov_stats.items() if v['ganadas'] > 0
        ],
        key=lambda x: x['monto_total'], reverse=True,
    )[:20]

    # ── 7. Listas de salida ───────────────────────────────────────────────────
    top_ahorro_items.sort(key=lambda x: x['ahorro'], reverse=True)
    mejora_items.sort(key=lambda x: x['diferencia'], reverse=True)

    por_unidad_list = sorted(
        [
            {
                'unidad': k,
                'presupuesto': round(v['presupuesto'], 0),
                'monto_oc': round(v['monto_oc'], 0),
                'ahorro': round(v['ahorro'], 0),
                'adjudicadas': v['adjudicadas'],
                'total': v['total'],
                'pct_ahorro': round(v['ahorro'] / v['monto_oc'] * 100, 1) if v['monto_oc'] > 0 else 0,
            }
            for k, v in por_unidad.items()
        ],
        key=lambda x: x['ahorro'], reverse=True,
    )

    por_estado_list = [
        {'estado': k, 'cantidad': v['cantidad'], 'presupuesto': round(v['presupuesto'], 0)}
        for k, v in por_estado.items()
    ]

    por_mes_list = sorted(
        [
            {
                'mes': k,
                'cantidad': v['cantidad'],
                'presupuesto': round(v['presupuesto'], 0),
                'monto_oc': round(v['monto_oc'], 0),
            }
            for k, v in por_mes.items() if k
        ],
        key=lambda x: x['mes'],
    )

    por_unidad_mes_list = sorted(
        [
            {
                'unidad': k[0],
                'mes': k[1],
                'presupuesto': round(v['presupuesto'], 0),
                'monto_oc': round(v['monto_oc'], 0),
                'ahorro': round(v['ahorro'], 0),
                'cantidad': v['cantidad'],
            }
            for k, v in por_unidad_mes.items() if k[1]
        ],
        key=lambda x: (x['unidad'], x['mes']),
    )

    estados = {e['estado']: e['cantidad'] for e in por_estado_list}

    return {
        'kpis': {
            'total_ca': len(all_ca),
            'adjudicadas': estados.get('Proveedor seleccionado', 0),
            'desiertas': estados.get('Desierta', 0),
            'canceladas': estados.get('Cancelada', 0),
            'publicadas': estados.get('Publicada', 0),
            'cerradas': estados.get('Cerrada', 0),
            'total_presupuesto': round(total_presupuesto, 0),
            'total_monto_oc': round(total_monto_oc, 0),
            'ahorro_simple': round(ahorro_simple_total, 0),
            'pct_ahorro_simple': round(
                ahorro_simple_total / total_monto_oc * 100, 1
            ) if total_monto_oc > 0 else 0,
            'ahorro_res188': round(ahorro_res188_total, 0),
            'adjudicado_res188': round(adjudicado_res188_total, 0),
            'pct_ahorro_res188': round(pct_res188, 2),
        },
        'por_estado': por_estado_list,
        'por_unidad': por_unidad_list,
        'por_mes': por_mes_list,
        'por_unidad_mes': por_unidad_mes_list,
        'top_proveedores': top_proveedores,
        'top_ahorro_items': top_ahorro_items[:10],
        'mejora_items': mejora_items[:10],
    }


# =============================================================================
# Módulo Licitaciones — Ahorro
# =============================================================================

def _normalizar_usuario(nombre):
    if not nombre:
        return 'Sin asignar'
    return ' '.join(nombre.strip().split()).title()


def calcular_ahorro_licitaciones(anio=None):
    """
    Calcula el ahorro en licitaciones adjudicadas.

    Grupo A (VisibilidadMonto=1): Ahorro = MontoEstimado − Σ(MontoUnitarioGanador × CantidadAdjudicada)
    Grupo B (VisibilidadMonto=0): Solo monto transado, sin cálculo de ahorro.
    Excluye Desierta y Revocada del análisis de ahorro (se cuentan aparte).
    OC vinculadas: join por CodigoLicitacion → suma TotalBruto.
    anio: filtrar por FechaAdjudicacion__year (None = todos los años).
    """
    # Licitaciones adjudicadas
    qs_adj = Licitacion.objects.filter(Estado='Adjudicada')
    if anio:
        qs_adj = qs_adj.filter(FechaAdjudicacion__year=anio)
    adjudicadas = list(
        qs_adj.values(
            'codigo_licitacion', 'Nombre', 'C_Usuario', 'Tipo',
            'MontoEstimado', 'VisibilidadMonto', 'FechaAdjudicacion',
        )
    )

    codigos_adj = [l['codigo_licitacion'] for l in adjudicadas]

    # Detalles: solo de las licitaciones adjudicadas relevantes
    detalles_qs = list(
        DetalleLicitacion.objects.filter(
            licitacion_id__in=codigos_adj
        ).exclude(
            MontoUnitarioGanador__isnull=True
        ).exclude(
            CantidadAdjudicada__isnull=True
        ).values(
            'licitacion_id', 'Categoria', 'NombreProducto',
            'MontoUnitarioGanador', 'CantidadAdjudicada',
        )
    )

    # Agrupa detalles por licitación
    detalles_by_lic = defaultdict(list)
    for d in detalles_qs:
        detalles_by_lic[d['licitacion_id']].append(d)

    # OC vinculadas por CodigoLicitacion
    codigos = [l['codigo_licitacion'] for l in adjudicadas]
    oc_por_lic = defaultdict(lambda: {'n_oc': 0, 'total_bruto': 0.0})
    for oc in OrdenCompra.objects.filter(
        CodigoLicitacion__in=codigos
    ).exclude(CodigoLicitacion='').values(
        'CodigoLicitacion', 'TotalBruto'
    ):
        lic = oc['CodigoLicitacion']
        oc_por_lic[lic]['n_oc'] += 1
        try:
            oc_por_lic[lic]['total_bruto'] += float(oc['TotalBruto'] or 0)
        except (ValueError, TypeError):
            pass

    grupo_a = []
    grupo_b = []
    kpi_ahorro_total = 0.0
    kpi_monto_estimado_total = 0.0
    kpi_adjudicado_a = 0.0
    kpi_adjudicado_b = 0.0
    kpi_n_oc = 0
    kpi_bruto_oc = 0.0

    por_comprador_a = defaultdict(lambda: {'n': 0, 'ahorro': 0.0, 'estimado': 0.0, 'adjudicado': 0.0})
    por_comprador_b = defaultdict(lambda: {'n': 0, 'adjudicado': 0.0})
    por_tipo = defaultdict(lambda: {'n': 0, 'ahorro': 0.0, 'adjudicado': 0.0})

    for lic in adjudicadas:
        codigo = lic['codigo_licitacion']
        comprador = _normalizar_usuario(lic['C_Usuario'])
        tipo = lic['Tipo'] or 'Sin tipo'
        monto_estimado = float(lic['MontoEstimado'] or 0)
        visibilidad = int(lic['VisibilidadMonto'] or 0)
        oc_info = oc_por_lic.get(codigo, {'n_oc': 0, 'total_bruto': 0.0})

        # Calcular adjudicado real desde detalles
        items = detalles_by_lic.get(codigo, [])
        adjudicado_real = sum(
            float(d['MontoUnitarioGanador'] or 0) * float(d['CantidadAdjudicada'] or 0)
            for d in items
        )

        kpi_n_oc += oc_info['n_oc']
        kpi_bruto_oc += oc_info['total_bruto']
        fecha_adj = str(lic['FechaAdjudicacion'])[:10] if lic['FechaAdjudicacion'] else ''

        if visibilidad == 1 and monto_estimado > 0:
            ahorro = monto_estimado - adjudicado_real
            pct = round(ahorro / monto_estimado * 100, 2) if monto_estimado > 0 else 0.0
            kpi_ahorro_total += ahorro
            kpi_monto_estimado_total += monto_estimado
            kpi_adjudicado_a += adjudicado_real
            por_comprador_a[comprador]['n'] += 1
            por_comprador_a[comprador]['ahorro'] += ahorro
            por_comprador_a[comprador]['estimado'] += monto_estimado
            por_comprador_a[comprador]['adjudicado'] += adjudicado_real
            por_tipo[tipo]['n'] += 1
            por_tipo[tipo]['ahorro'] += ahorro
            por_tipo[tipo]['adjudicado'] += adjudicado_real
            grupo_a.append({
                'codigo_licitacion': codigo,
                'nombre': lic['Nombre'] or '',
                'comprador': comprador,
                'tipo': tipo,
                'monto_estimado': round(monto_estimado, 0),
                'adjudicado_real': round(adjudicado_real, 0),
                'ahorro': round(ahorro, 0),
                'pct_ahorro': pct,
                'n_items': len(items),
                'n_oc': oc_info['n_oc'],
                'total_bruto_oc': round(oc_info['total_bruto'], 0),
                'fecha_adjudicacion': fecha_adj,
            })
        else:
            kpi_adjudicado_b += adjudicado_real
            por_comprador_b[comprador]['n'] += 1
            por_comprador_b[comprador]['adjudicado'] += adjudicado_real
            grupo_b.append({
                'codigo_licitacion': codigo,
                'nombre': lic['Nombre'] or '',
                'comprador': comprador,
                'tipo': tipo,
                'adjudicado_real': round(adjudicado_real, 0),
                'n_items': len(items),
                'n_oc': oc_info['n_oc'],
                'total_bruto_oc': round(oc_info['total_bruto'], 0),
                'fecha_adjudicacion': fecha_adj,
            })

    grupo_a.sort(key=lambda x: x['ahorro'], reverse=True)
    grupo_b.sort(key=lambda x: x['adjudicado_real'], reverse=True)

    # Conteos de fallidas — Desierta puede venir como 'Desierta (o art. 3 ó 9 Ley 19.886)'
    qs_des = Licitacion.objects.filter(Estado__startswith='Desierta')
    qs_rev = Licitacion.objects.filter(Estado='Revocada')
    if anio:
        qs_des = qs_des.filter(FechaPublicacion__year=anio)
        qs_rev = qs_rev.filter(FechaPublicacion__year=anio)
    desiertas = qs_des.count()
    revocadas = qs_rev.count()

    pct_ahorro_promedio = round(kpi_ahorro_total / kpi_monto_estimado_total * 100, 2) if kpi_monto_estimado_total > 0 else 0.0

    por_comprador_list = sorted([
        {
            'comprador': k,
            'n_licitaciones_a': v['n'],
            'ahorro_total': round(v['ahorro'], 0),
            'monto_estimado': round(v['estimado'], 0),
            'adjudicado_a': round(v['adjudicado'], 0),
            'pct_ahorro': round(v['ahorro'] / v['estimado'] * 100, 2) if v['estimado'] > 0 else 0,
            'adjudicado_b': round(por_comprador_b.get(k, {}).get('adjudicado', 0.0), 0),
        }
        for k, v in por_comprador_a.items()
    ], key=lambda x: x['ahorro_total'], reverse=True)

    # Agregar compradores que solo tienen grupo B
    compradores_solo_b = [
        {
            'comprador': k,
            'n_licitaciones_a': 0,
            'ahorro_total': 0,
            'monto_estimado': 0,
            'adjudicado_a': 0,
            'pct_ahorro': 0,
            'adjudicado_b': round(v['adjudicado'], 0),
        }
        for k, v in por_comprador_b.items()
        if k not in por_comprador_a
    ]
    por_comprador_list += compradores_solo_b

    return {
        'kpis': {
            'total_adjudicadas_a': len(grupo_a),
            'total_adjudicadas_b': len(grupo_b),
            'total_desiertas': desiertas,
            'total_revocadas': revocadas,
            'ahorro_total': round(kpi_ahorro_total, 0),
            'pct_ahorro_promedio': pct_ahorro_promedio,
            'monto_estimado_total': round(kpi_monto_estimado_total, 0),
            'adjudicado_total_a': round(kpi_adjudicado_a, 0),
            'adjudicado_total_b': round(kpi_adjudicado_b, 0),
            'n_oc_total': kpi_n_oc,
            'total_bruto_oc': round(kpi_bruto_oc, 0),
        },
        'grupo_a': grupo_a,
        'grupo_b': grupo_b,
        'por_comprador': por_comprador_list,
        'por_tipo': sorted([
            {
                'tipo': k,
                'n': v['n'],
                'ahorro': round(v['ahorro'], 0),
                'adjudicado': round(v['adjudicado'], 0),
                'pct_ahorro': round(v['ahorro'] / v['adjudicado'] * 100, 2) if v['adjudicado'] > 0 else 0,
            }
            for k, v in por_tipo.items()
        ], key=lambda x: x['ahorro'], reverse=True),
        'fallidas': {
            'desiertas': desiertas,
            'revocadas': revocadas,
        },
        # Notas metodológicas para mostrar al pie de los gráficos
        'metodologia': {
            'grupo_a': 'Ahorro = MontoEstimado (con IVA) − Σ(PrecioUnitarioAdjudicado × CantidadAdjudicada). Solo licitaciones con monto público (VisibilidadMonto=1).',
            'grupo_b': 'Monto transado = Σ(PrecioUnitarioAdjudicado × CantidadAdjudicada). Monto estimado no público (VisibilidadMonto=0) — ahorro no calculable.',
            'oc': 'TotalBruto de OC incluye IVA, base comparable con MontoEstimado.',
        },
    }


# =============================================================================
# Módulo Licitaciones — Gestión
# =============================================================================

def calcular_gestion_licitaciones(anio=None):
    """
    Retorna licitaciones activas (Publicada / Cerrada) con semáforo de urgencia.

    Semáforo para Publicadas (clave: FechaCierre):
      🔴 Rojo    → < 3 días o ya vencida
      🟡 Amarillo → < 7 días
      🟢 Verde    → ≥ 7 días

    Semáforo para Cerradas (clave: FechaEstimadaAdjudicacion):
      🔴 Rojo    → fecha estimada ya vencida, o < 3 días, o >30 días sin fecha estimada
      🟡 Amarillo → < 7 días, o 14-30 días sin fecha estimada
      🟢 Verde    → ≥ 7 días
    """
    hoy = date.today()

    qs_activas = Licitacion.objects.filter(Estado__in=['Publicada', 'Cerrada'])
    if anio:
        qs_activas = qs_activas.filter(FechaPublicacion__year=anio)
    activas = list(qs_activas.values(
            'codigo_licitacion', 'Nombre', 'C_Usuario', 'Estado', 'Tipo',
            'FechaCierre', 'FechaEstimadaAdjudicacion', 'MontoEstimado', 'VisibilidadMonto',
        )
    )

    licitaciones_out = []
    kpi = {'publicadas': 0, 'cerradas': 0, 'rojo': 0, 'amarillo': 0, 'verde': 0}
    por_comprador = defaultdict(lambda: {
        'total': 0, 'publicadas': 0, 'cerradas': 0, 'rojo': 0, 'amarillo': 0,
    })

    for lic in activas:
        comprador = _normalizar_usuario(lic['C_Usuario'])
        estado = lic['Estado']
        fecha_cierre = lic['FechaCierre'].date() if lic['FechaCierre'] else None
        fecha_est_adj = lic['FechaEstimadaAdjudicacion'].date() if lic['FechaEstimadaAdjudicacion'] else None

        dias_para_cierre = None
        dias_en_evaluacion = None
        dias_para_adjudicacion = None
        semaforo = 'verde'
        descripcion_semaforo = ''

        if estado == 'Publicada':
            kpi['publicadas'] += 1
            if fecha_cierre:
                dias_para_cierre = (fecha_cierre - hoy).days
                if dias_para_cierre < 0:
                    semaforo = 'rojo'
                    descripcion_semaforo = f'Cierre vencido hace {abs(dias_para_cierre)} días'
                elif dias_para_cierre < 3:
                    semaforo = 'rojo'
                    descripcion_semaforo = f'Cierre en {dias_para_cierre} día(s)'
                elif dias_para_cierre < 7:
                    semaforo = 'amarillo'
                    descripcion_semaforo = f'Cierre en {dias_para_cierre} días'
                else:
                    semaforo = 'verde'
                    descripcion_semaforo = f'Cierre en {dias_para_cierre} días'
            else:
                semaforo = 'amarillo'
                descripcion_semaforo = 'Sin fecha de cierre'

        elif estado == 'Cerrada':
            kpi['cerradas'] += 1
            if fecha_cierre:
                dias_en_evaluacion = (hoy - fecha_cierre).days
            if fecha_est_adj:
                dias_para_adjudicacion = (fecha_est_adj - hoy).days
                if dias_para_adjudicacion < 0:
                    semaforo = 'rojo'
                    descripcion_semaforo = f'Adjudicación estimada vencida hace {abs(dias_para_adjudicacion)} días'
                elif dias_para_adjudicacion < 3:
                    semaforo = 'rojo'
                    descripcion_semaforo = f'Adjudicación estimada en {dias_para_adjudicacion} día(s)'
                elif dias_para_adjudicacion < 7:
                    semaforo = 'amarillo'
                    descripcion_semaforo = f'Adjudicación estimada en {dias_para_adjudicacion} días'
                else:
                    semaforo = 'verde'
                    descripcion_semaforo = f'Adjudicación estimada en {dias_para_adjudicacion} días'
            else:
                # Sin fecha estimada: evaluar por tiempo en evaluación
                d = dias_en_evaluacion or 0
                if d > 30:
                    semaforo = 'rojo'
                    descripcion_semaforo = f'En evaluación {d} días sin fecha estimada'
                elif d > 14:
                    semaforo = 'amarillo'
                    descripcion_semaforo = f'En evaluación {d} días sin fecha estimada'
                else:
                    semaforo = 'verde'
                    descripcion_semaforo = f'En evaluación {d} días'

        kpi[semaforo] += 1
        por_comprador[comprador]['total'] += 1
        # Mapeo singular→plural para que coincida con las claves del defaultdict
        estado_key = 'publicadas' if estado == 'Publicada' else 'cerradas'
        por_comprador[comprador][estado_key] += 1
        por_comprador[comprador][semaforo] = por_comprador[comprador].get(semaforo, 0) + 1

        licitaciones_out.append({
            'codigo_licitacion': lic['codigo_licitacion'],
            'nombre': lic['Nombre'] or '',
            'comprador': comprador,
            'estado': estado,
            'tipo': lic['Tipo'] or '',
            'fecha_cierre': str(fecha_cierre) if fecha_cierre else '',
            'fecha_estimada_adjudicacion': str(fecha_est_adj) if fecha_est_adj else '',
            'dias_para_cierre': dias_para_cierre,
            'dias_en_evaluacion': dias_en_evaluacion,
            'dias_para_adjudicacion': dias_para_adjudicacion,
            'semaforo': semaforo,
            'descripcion_semaforo': descripcion_semaforo,
            'monto_estimado': float(lic['MontoEstimado'] or 0),
            'visibilidad_monto': int(lic['VisibilidadMonto'] or 0),
        })

    # Ordenar: primero rojos, luego amarillos, luego verdes; dentro de cada grupo por urgencia
    orden_semaforo = {'rojo': 0, 'amarillo': 1, 'verde': 2}
    licitaciones_out.sort(key=lambda x: (
        orden_semaforo[x['semaforo']],
        x['dias_para_cierre'] if x['dias_para_cierre'] is not None else (x['dias_para_adjudicacion'] or 999),
    ))

    por_comprador_list = sorted([
        {
            'comprador': k,
            'total': v['total'],
            'publicadas': v.get('publicadas', 0),
            'cerradas': v.get('cerradas', 0),
            'alertas_rojo': v.get('rojo', 0),
            'alertas_amarillo': v.get('amarillo', 0),
        }
        for k, v in por_comprador.items()
    ], key=lambda x: (x['alertas_rojo'], x['alertas_amarillo']), reverse=True)

    return {
        'kpis': {
            'total_publicadas': kpi['publicadas'],
            'total_cerradas': kpi['cerradas'],
            'alertas_rojo': kpi['rojo'],
            'alertas_amarillo': kpi['amarillo'],
            'alertas_verde': kpi['verde'],
        },
        'licitaciones': licitaciones_out,
        'por_comprador': por_comprador_list,
    }


# =============================================================================
# Módulo Gestión de Contratos — Servicios analíticos
# =============================================================================

_ESTADOS_VIGENTES_CONTRATO = ['En ejecución', 'En ejecución (Modificado)', 'Ampliado']
_EVAL_PENDIENTE_VALS = frozenset(['--', 'Evaluación Pendiente'])


def _anio_contrato(numero_contrato):
    """Extrae el año del sufijo del código de contrato. 'CL26' → 2026."""
    import re
    m = re.search(r'(\d{2})$', (numero_contrato or '').upper().strip())
    if m:
        return 2000 + int(m.group(1))
    return None


def calcular_contratos_evaluaciones():
    """
    KPIs y detalle de evaluaciones Res.188.
    Pendiente = estado empieza con 'Terminado' AND evaluacion in {'--, 'Evaluación Pendiente'}
    Evaluado  = evaluacion es número (nota)
    No aplica = contrato vigente con '--'
    """
    todos = list(GestionContrato.objects.values(
        'numero_contrato', 'nombre_contrato', 'estado_contrato',
        'evaluacion', 'monto_contrato', 'unidad_requirente',
    ))

    kpi_ev = 0
    kpi_pend = 0
    kpi_term = 0
    notas = []
    notas_por_anio = defaultdict(list)
    por_anio = {}
    por_estado_term = {}
    detalle_pend = []

    for c in todos:
        estado = c['estado_contrato'] or ''
        evaluacion = c['evaluacion'] or ''
        es_terminado = estado.startswith('Terminado')
        monto = int(c['monto_contrato'] or 0)

        try:
            nota = float(evaluacion)
            es_evaluado = True
        except (ValueError, TypeError):
            nota = None
            es_evaluado = False

        anio = _anio_contrato(c['numero_contrato'])
        bucket = por_anio.setdefault(
            anio or 0,
            {'anio': anio or 0, 'total': 0, 'evaluados': 0, 'pendientes': 0, 'monto': 0}
        )

        if es_terminado:
            kpi_term += 1
            bucket['total'] += 1
            bucket['monto'] += monto
            est_b = por_estado_term.setdefault(estado, {'estado': estado, 'pendientes': 0, 'monto': 0})

            if es_evaluado:
                kpi_ev += 1
                notas.append(nota)
                notas_por_anio[anio or 0].append(nota)
                bucket['evaluados'] += 1
            elif evaluacion in _EVAL_PENDIENTE_VALS:
                kpi_pend += 1
                bucket['pendientes'] += 1
                est_b['pendientes'] += 1
                est_b['monto'] += monto
                detalle_pend.append({
                    'numero_contrato': c['numero_contrato'],
                    'nombre_contrato': c['nombre_contrato'] or '',
                    'estado_contrato': estado,
                    'monto_contrato': monto,
                    'unidad_requirente': c['unidad_requirente'] or '',
                    'anio': anio,
                })

    nota_promedio = round(sum(notas) / len(notas), 2) if notas else None
    pct_pendiente = round(kpi_pend / kpi_term * 100, 1) if kpi_term > 0 else 0.0

    for bucket in por_anio.values():
        notas_anio = notas_por_anio.get(bucket['anio'], [])
        bucket['nota_promedio'] = round(sum(notas_anio) / len(notas_anio), 2) if notas_anio else None

    detalle_pend.sort(key=lambda x: x['monto_contrato'], reverse=True)

    return {
        'kpis': {
            'total_terminados': kpi_term,
            'evaluados': kpi_ev,
            'pendientes': kpi_pend,
            'nota_promedio': nota_promedio,
            'pct_pendiente': pct_pendiente,
        },
        'por_anio': sorted(por_anio.values(), key=lambda x: x['anio'], reverse=True),
        'por_estado_terminado': sorted(
            por_estado_term.values(), key=lambda x: x['pendientes'], reverse=True
        ),
        'detalle_pendientes': detalle_pend,
    }


def calcular_contratos_financiero(filtros=None):
    """
    Tabla maestra de seguimiento financiero. LEFT JOIN con OC de TODOS los años.
    Cast TotalBruto a Decimal antes de Sum (es TextField).
    """
    qs = GestionContrato.objects.all()
    if filtros:
        if filtros.get('estado_contrato'):
            qs = qs.filter(estado_contrato=filtros['estado_contrato'])
        if filtros.get('categoria_contrato'):
            qs = qs.filter(categoria_contrato=filtros['categoria_contrato'])
        if filtros.get('tipo_contrato'):
            qs = qs.filter(tipo_contrato=filtros['tipo_contrato'])
        if filtros.get('unidad_requirente'):
            qs = qs.filter(unidad_requirente__icontains=filtros['unidad_requirente'])

    contratos = list(qs.values(
        'numero_contrato', 'nombre_contrato', 'id_licitacion_oc',
        'monto_contrato', 'monto_ejecutado', 'monto_por_ejecutar',
        'estado_contrato', 'unidad_requirente', 'categoria_contrato',
        'tipo_contrato', 'dias_vigencia', 'dias_restantes', 'evaluacion',
    ))

    # Agregar OC por CodigoLicitacion — TODOS los años
    _decimal_field = DecimalField(max_digits=20, decimal_places=2)
    oc_agg = list(
        OrdenCompra.objects
        .values('CodigoLicitacion')
        .annotate(
            suma_bruto=Sum(Cast('TotalBruto', output_field=_decimal_field)),
            n_oc=Count('codigo_oc'),
        )
    )
    oc_map = {
        r['CodigoLicitacion']: {'suma_bruto': float(r['suma_bruto'] or 0), 'n_oc': r['n_oc']}
        for r in oc_agg if r['CodigoLicitacion']
    }

    resultado = []
    for c in contratos:
        id_lic = c['id_licitacion_oc'] or ''
        oc_data = oc_map.get(id_lic)
        monto_contrato = int(c['monto_contrato'] or 0)
        monto_ejecutado = int(c['monto_ejecutado'] or 0)
        monto_por_ejecutar = c['monto_por_ejecutar']
        dias_vigencia = int(c['dias_vigencia'] or 0)
        dias_restantes = int(c['dias_restantes'] or 0)
        dias_activos = max(dias_vigencia - dias_restantes, 1)

        if oc_data:
            suma_bruto = oc_data['suma_bruto']
            n_oc = oc_data['n_oc']
            if monto_ejecutado > 0:
                diff_pct = abs(suma_bruto - monto_ejecutado) / monto_ejecutado
                if diff_pct <= 0.01:
                    reconciliacion = 'cuadrado'
                elif diff_pct <= 0.10:
                    reconciliacion = 'diferencia_menor'
                else:
                    reconciliacion = 'revisar'
            else:
                reconciliacion = 'sin_ejecutado'

            meses_hasta_agotamiento = None
            alerta = 'ok'
            if monto_por_ejecutar is not None and monto_por_ejecutar > 0:
                tasa_mensual = suma_bruto / (dias_activos / 30)
                if tasa_mensual > 0:
                    meses = round(monto_por_ejecutar / tasa_mensual, 1)
                    meses_hasta_agotamiento = meses
                    if meses < 3:
                        alerta = 'critico'
                    elif meses < 6:
                        alerta = 'urgente'
                    elif meses < 12:
                        alerta = 'atencion'
        else:
            suma_bruto = None
            n_oc = 0
            reconciliacion = 'sin_datos'
            meses_hasta_agotamiento = None
            alerta = 'sin_datos'

        resultado.append({
            'numero_contrato': c['numero_contrato'],
            'nombre_contrato': c['nombre_contrato'] or '',
            'id_licitacion_oc': id_lic,
            'monto_contrato': monto_contrato,
            'monto_ejecutado': monto_ejecutado,
            'monto_por_ejecutar': int(monto_por_ejecutar) if monto_por_ejecutar is not None else None,
            'estado_contrato': c['estado_contrato'] or '',
            'unidad_requirente': c['unidad_requirente'] or '',
            'categoria_contrato': c['categoria_contrato'] or '',
            'dias_vigencia': dias_vigencia,
            'dias_restantes': dias_restantes,
            'suma_bruto_oc': round(suma_bruto, 0) if suma_bruto is not None else None,
            'n_oc': n_oc,
            'reconciliacion': reconciliacion,
            'meses_hasta_agotamiento': meses_hasta_agotamiento,
            'alerta': alerta,
        })

    resultado.sort(key=lambda x: x['monto_contrato'], reverse=True)
    return resultado


def calcular_contratos_oc_detalle(id_licitacion_oc):
    """
    OC + líneas de detalle para un contrato específico (llamada on-demand al expandir fila).
    """
    oc_qs = list(
        OrdenCompra.objects.filter(CodigoLicitacion=id_licitacion_oc)
        .values(
            'codigo_oc', 'NombreOC', 'EstadoOC', 'TotalBruto', 'TotalNeto',
            'FechaEnvio', 'FechaCreacion', 'C_Unidad', 'P_Nombre', 'P_Rut',
            'EnlacePAC', 'ID_Proyecto', 'Nombre_Proyecto', 'LinkMP',
        )
        .order_by('-FechaEnvio')
    )

    oc_codigos = [r['codigo_oc'] for r in oc_qs]
    det_map = defaultdict(list)
    for d in DetalleOrdenCompra.objects.filter(orden_compra_id__in=oc_codigos).values(
        'orden_compra_id', 'CodigoCategoria', 'Categoria',
        'CodigoProducto', 'Producto', 'Cantidad', 'PrecioNeto', 'TotalLinea',
    ):
        det_map[d['orden_compra_id']].append({
            'CodigoCategoria': d['CodigoCategoria'] or '',
            'Categoria': d['Categoria'] or '',
            'CodigoProducto': d['CodigoProducto'] or '',
            'Producto': d['Producto'] or '',
            'Cantidad': float(d['Cantidad'] or 0),
            'PrecioNeto': float(d['PrecioNeto'] or 0),
            'TotalLinea': float(d['TotalLinea'] or 0),
        })

    proyectos_map = {}
    oc_out = []
    for r in oc_qs:
        try:
            total_bruto = float(r['TotalBruto'] or 0)
        except (ValueError, TypeError):
            total_bruto = 0.0
        try:
            total_neto = float(r['TotalNeto'] or 0)
        except (ValueError, TypeError):
            total_neto = 0.0

        id_proy = str(r['ID_Proyecto'] or '')
        nombre_proy = str(r['Nombre_Proyecto'] or '')
        if id_proy:
            if id_proy not in proyectos_map:
                proyectos_map[id_proy] = {
                    'ID_Proyecto': id_proy, 'Nombre_Proyecto': nombre_proy,
                    'n_oc': 0, 'suma_bruto': 0.0,
                }
            proyectos_map[id_proy]['n_oc'] += 1
            proyectos_map[id_proy]['suma_bruto'] += total_bruto

        oc_out.append({
            'codigo_oc': r['codigo_oc'],
            'NombreOC': r['NombreOC'] or '',
            'EstadoOC': r['EstadoOC'] or '',
            'TotalBruto': total_bruto,
            'TotalNeto': total_neto,
            'FechaEnvio': str(r['FechaEnvio'])[:10] if r['FechaEnvio'] else '',
            'FechaCreacion': str(r['FechaCreacion'])[:10] if r['FechaCreacion'] else '',
            'C_Unidad': r['C_Unidad'] or '',
            'P_Nombre': r['P_Nombre'] or '',
            'EnlacePAC': r['EnlacePAC'] or '',
            'ID_Proyecto': id_proy,
            'Nombre_Proyecto': nombre_proy,
            'LinkMP': r['LinkMP'] or '',
            'productos': det_map.get(r['codigo_oc'], []),
        })

    proyectos = sorted(proyectos_map.values(), key=lambda x: x['suma_bruto'], reverse=True)
    return {'oc': oc_out, 'proyectos': proyectos}


def calcular_contratos_plazos(filtros=None):
    """
    Contratos activos con semáforo de tiempo basado en dias_restantes.
    Las fechas inicio/termino son strings malformados ('07-00-2026') — no se usan para cálculos.
    """
    qs = GestionContrato.objects.filter(estado_contrato__in=_ESTADOS_VIGENTES_CONTRATO)
    if filtros:
        if filtros.get('categoria_contrato'):
            qs = qs.filter(categoria_contrato=filtros['categoria_contrato'])
        if filtros.get('unidad_requirente'):
            qs = qs.filter(unidad_requirente__icontains=filtros['unidad_requirente'])

    activos = list(qs.values(
        'numero_contrato', 'nombre_contrato', 'estado_contrato',
        'fecha_inicio', 'fecha_termino', 'dias_vigencia', 'dias_restantes',
        'unidad_requirente', 'id_licitacion_oc', 'monto_contrato', 'categoria_contrato',
    ))

    id_licitacion_ocs = list({c['id_licitacion_oc'] for c in activos if c['id_licitacion_oc']})
    proyectos_por_lic = defaultdict(list)
    seen_proy = set()
    for r in OrdenCompra.objects.filter(
        CodigoLicitacion__in=id_licitacion_ocs,
    ).exclude(ID_Proyecto='').exclude(ID_Proyecto__isnull=True).values(
        'CodigoLicitacion', 'ID_Proyecto', 'Nombre_Proyecto'
    ).distinct():
        key = (r['CodigoLicitacion'], str(r['ID_Proyecto'] or ''))
        if key not in seen_proy:
            seen_proy.add(key)
            proyectos_por_lic[r['CodigoLicitacion']].append({
                'ID_Proyecto': str(r['ID_Proyecto'] or ''),
                'Nombre_Proyecto': r['Nombre_Proyecto'] or '',
            })

    kpis = {'total_activos': 0, 'critico': 0, 'urgente': 0, 'atencion': 0, 'ok': 0}
    resultado = []

    for c in activos:
        dias_restantes = int(c['dias_restantes'] or 0)
        dias_vigencia = int(c['dias_vigencia'] or 0)
        dias_transcurridos = max(dias_vigencia - dias_restantes, 0)
        pct_tiempo = round(dias_transcurridos / dias_vigencia * 100, 1) if dias_vigencia > 0 else 0.0

        if dias_restantes <= 0:
            alerta = 'critico'
        elif dias_restantes <= 90:
            alerta = 'critico'
        elif dias_restantes <= 180:
            alerta = 'urgente'
        elif dias_restantes <= 365:
            alerta = 'atencion'
        else:
            alerta = 'ok'

        kpis['total_activos'] += 1
        kpis[alerta] += 1

        resultado.append({
            'numero_contrato': c['numero_contrato'],
            'nombre_contrato': c['nombre_contrato'] or '',
            'estado_contrato': c['estado_contrato'] or '',
            'fecha_inicio': c['fecha_inicio'] or '',
            'fecha_termino': c['fecha_termino'] or '',
            'dias_vigencia': dias_vigencia,
            'dias_restantes': dias_restantes,
            'pct_ejecutado_tiempo': pct_tiempo,
            'alerta_tiempo': alerta,
            'unidad_requirente': c['unidad_requirente'] or '',
            'id_licitacion_oc': c['id_licitacion_oc'] or '',
            'monto_contrato': int(c['monto_contrato'] or 0),
            'proyectos': proyectos_por_lic.get(c['id_licitacion_oc'] or '', []),
        })

    resultado.sort(key=lambda x: x['dias_restantes'])
    return {'activos': resultado, 'kpis': kpis}


def calcular_contratos_pac(filtros=None):
    """
    Cruce PAC: estado EnlacePAC por contrato y proyecto, todos los años.
    EnlacePAC valores: 'Enlazada' | 'No Enlazada' — siempre comparar con == 'Enlazada'.
    """
    qs = GestionContrato.objects.all()
    if filtros:
        if filtros.get('estado_contrato'):
            qs = qs.filter(estado_contrato=filtros['estado_contrato'])
        if filtros.get('categoria_contrato'):
            qs = qs.filter(categoria_contrato=filtros['categoria_contrato'])

    contratos = list(qs.values(
        'numero_contrato', 'nombre_contrato', 'monto_contrato',
        'id_licitacion_oc', 'estado_contrato', 'categoria_contrato',
    ))

    id_lics = list({c['id_licitacion_oc'] for c in contratos if c['id_licitacion_oc']})
    oc_raw = list(
        OrdenCompra.objects.filter(CodigoLicitacion__in=id_lics)
        .exclude(FechaEnvio__isnull=True)
        .extra(select={'anio': 'YEAR(FechaEnvio)', 'mes': 'MONTH(FechaEnvio)'})
        .values('CodigoLicitacion', 'ID_Proyecto', 'Nombre_Proyecto', 'EnlacePAC', 'anio', 'mes')
        .annotate(n_oc=Count('codigo_oc'))
    )

    # cod_lic → {id_proy → {anio → {enlazadas, no_enlazadas, Nombre_Proyecto}}}
    oc_by_lic = defaultdict(lambda: defaultdict(lambda: defaultdict(
        lambda: {'enlazadas': 0, 'no_enlazadas': 0, 'Nombre_Proyecto': ''}
    )))
    # (anio, mes) → {Enlazada, No Enlazada} — para el gráfico de evolución mensual
    pivot_mes = defaultdict(lambda: {'Enlazada': 0, 'No Enlazada': 0})
    for r in oc_raw:
        cod = r['CodigoLicitacion'] or ''
        if not cod:
            continue
        proy = str(r['ID_Proyecto'] or 'Sin proyecto')
        anio = r['anio'] or 0
        mes = r['mes'] or 0
        n = r['n_oc'] or 0
        oc_by_lic[cod][proy][anio]['Nombre_Proyecto'] = r['Nombre_Proyecto'] or ''
        clave_mes = pivot_mes[(anio, mes)]
        if r['EnlacePAC'] == 'Enlazada':
            oc_by_lic[cod][proy][anio]['enlazadas'] += n
            clave_mes['Enlazada'] += n
        else:
            oc_by_lic[cod][proy][anio]['no_enlazadas'] += n
            clave_mes['No Enlazada'] += n

    pivot = defaultdict(lambda: {'Enlazada': 0, 'No Enlazada': 0})
    kpis = {
        'contratos_100pct_enlazados': 0, 'contratos_sin_oc': 0, 'contratos_sin_pac': 0,
        'contratos_parcialmente_enlazados': 0,
    }
    resumen = []

    for c in contratos:
        id_lic = c['id_licitacion_oc'] or ''
        proy_data = oc_by_lic.get(id_lic)

        if not proy_data:
            kpis['contratos_sin_oc'] += 1
            n_enlazada = n_total = 0
            proyectos_list = []
        else:
            n_enlazada = n_total = 0
            proyectos_list = []
            for proy, anios in proy_data.items():
                for anio, st in anios.items():
                    enl = st['enlazadas']
                    no_enl = st['no_enlazadas']
                    n_enlazada += enl
                    n_total += enl + no_enl
                    proyectos_list.append({
                        'ID_Proyecto': proy,
                        'Nombre_Proyecto': st['Nombre_Proyecto'],
                        'anio': anio,
                        'enlazadas': enl,
                        'no_enlazadas': no_enl,
                    })
                    pivot[anio]['Enlazada'] += enl
                    pivot[anio]['No Enlazada'] += no_enl

        n_no_enlazada = n_total - n_enlazada
        pct_enl = round(n_enlazada / n_total * 100, 1) if n_total > 0 else 0.0

        if n_total > 0 and n_no_enlazada == 0:
            kpis['contratos_100pct_enlazados'] += 1
        if n_total > 0 and n_enlazada == 0:
            kpis['contratos_sin_pac'] += 1
        if n_total > 0 and 0 < n_enlazada < n_total:
            kpis['contratos_parcialmente_enlazados'] += 1

        resumen.append({
            'numero_contrato': c['numero_contrato'],
            'nombre_contrato': c['nombre_contrato'] or '',
            'monto_contrato': int(c['monto_contrato'] or 0),
            'estado_contrato': c['estado_contrato'] or '',
            'categoria_contrato': c['categoria_contrato'] or '',
            'id_licitacion_oc': id_lic,
            'n_oc_total': n_total,
            'n_oc_enlazada': n_enlazada,
            'n_oc_no_enlazada': n_no_enlazada,
            'pct_enlazada': pct_enl,
            'proyectos': proyectos_list,
        })

    resumen.sort(key=lambda x: x['n_oc_total'], reverse=True)
    total_enl_global = sum(r['n_oc_enlazada'] for r in resumen)
    total_oc_global = sum(r['n_oc_total'] for r in resumen)
    pct_global = round(total_enl_global / total_oc_global * 100, 1) if total_oc_global > 0 else 0.0

    MESES_ABREV = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    return {
        'resumen': resumen,
        'kpis': {**kpis, 'pct_enlazado_global': pct_global},
        'pivot_anio_estado': sorted(
            [{'anio': k, 'Enlazada': v['Enlazada'], 'No Enlazada': v['No Enlazada']}
             for k, v in pivot.items()],
            key=lambda x: x['anio'],
        ),
        'pivot_mes_estado': sorted(
            [
                {
                    'periodo': f"{anio:04d}-{mes:02d}",
                    'anio': anio,
                    'mes': mes,
                    'mes_label': MESES_ABREV[mes] if 1 <= mes <= 12 else '—',
                    'Enlazada': v['Enlazada'],
                    'No Enlazada': v['No Enlazada'],
                }
                for (anio, mes), v in pivot_mes.items() if anio and mes
            ],
            key=lambda x: (x['anio'], x['mes']),
        ),
    }


def calcular_contratos_pac_detalle_oc(filtros=None):
    """
    Cruce PAC a nivel de OC individual: una fila por cada OC ligada a un contrato,
    con su código PAC (ID_Proyecto), nombre de proyecto y estado de enlace.
    Permite responder "¿con qué código PAC quedó esta OC?" y la inversa
    "¿qué OC están enlazadas al código PAC X?".
    EnlacePAC valores: 'Enlazada' | 'No Enlazada' — siempre comparar con == 'Enlazada'.
    """
    qs = GestionContrato.objects.all()
    if filtros:
        if filtros.get('estado_contrato'):
            qs = qs.filter(estado_contrato=filtros['estado_contrato'])
        if filtros.get('categoria_contrato'):
            qs = qs.filter(categoria_contrato=filtros['categoria_contrato'])

    contratos = list(qs.values(
        'numero_contrato', 'nombre_contrato', 'id_licitacion_oc', 'estado_contrato',
    ))
    contrato_by_lic = {c['id_licitacion_oc']: c for c in contratos if c['id_licitacion_oc']}
    id_lics = list(contrato_by_lic.keys())

    oc_qs = (
        OrdenCompra.objects.filter(CodigoLicitacion__in=id_lics)
        .exclude(FechaEnvio__isnull=True)
        .extra(select={'anio': 'YEAR(FechaEnvio)'})
        .values(
            'codigo_oc', 'CodigoLicitacion', 'NombreOC', 'EstadoOC', 'TotalBruto',
            'FechaEnvio', 'C_Unidad', 'EnlacePAC', 'ID_Proyecto', 'Nombre_Proyecto',
            'LinkMP', 'anio',
        )
    )

    filas = []
    for oc in oc_qs:
        contrato = contrato_by_lic.get(oc['CodigoLicitacion'] or '')
        if not contrato:
            continue
        try:
            total_bruto = float(oc['TotalBruto'] or 0)
        except (ValueError, TypeError):
            total_bruto = 0.0

        filas.append({
            'codigo_oc': oc['codigo_oc'],
            'nombre_oc': oc['NombreOC'] or '',
            'estado_oc': oc['EstadoOC'] or '',
            'total_bruto': total_bruto,
            'fecha_envio': oc['FechaEnvio'].strftime('%Y-%m-%d') if oc['FechaEnvio'] else None,
            'anio': oc['anio'] or 0,
            'unidad': oc['C_Unidad'] or '',
            'link_mp': oc['LinkMP'] or '',
            'enlace_pac': oc['EnlacePAC'] or 'No Enlazada',
            'codigo_pac': str(oc['ID_Proyecto']) if oc['ID_Proyecto'] else '',
            'nombre_proyecto': oc['Nombre_Proyecto'] or '',
            'codigo_licitacion': oc['CodigoLicitacion'] or '',
            'numero_contrato': contrato['numero_contrato'],
            'nombre_contrato': contrato['nombre_contrato'] or '',
            'estado_contrato': contrato['estado_contrato'] or '',
        })

    filas.sort(key=lambda f: f['fecha_envio'] or '', reverse=True)

    # Agregación por código PAC — para sub-tab "Detalle por Código PAC"
    pac_map = defaultdict(lambda: {
        'nombre_proyecto': '', 'n_oc': 0, 'n_enlazada': 0, 'monto_total': 0.0,
        'contratos': set(), 'anios': set(),
    })
    for f in filas:
        if not f['codigo_pac']:
            continue
        p = pac_map[f['codigo_pac']]
        p['nombre_proyecto'] = p['nombre_proyecto'] or f['nombre_proyecto']
        p['n_oc'] += 1
        if f['enlace_pac'] == 'Enlazada':
            p['n_enlazada'] += 1
        p['monto_total'] += f['total_bruto']
        p['contratos'].add(f['numero_contrato'])
        if f['anio']:
            p['anios'].add(f['anio'])

    codigos_pac = sorted([
        {
            'codigo_pac': k,
            'nombre_proyecto': v['nombre_proyecto'],
            'n_oc': v['n_oc'],
            'n_enlazada': v['n_enlazada'],
            'n_contratos': len(v['contratos']),
            'monto_total': round(v['monto_total'], 0),
            'anios': sorted(v['anios']),
        }
        for k, v in pac_map.items()
    ], key=lambda x: x['n_oc'], reverse=True)

    # Agregación por código de licitación — para el explorador del sub-tab "Buscador"
    lic_map = defaultdict(lambda: {
        'numero_contrato': '', 'nombre_contrato': '', 'estado_contrato': '',
        'n_oc': 0, 'n_enlazada': 0, 'monto_total': 0.0,
        'codigos_pac': defaultdict(lambda: {'n_oc': 0, 'n_enlazada': 0, 'nombre_proyecto': ''}),
    })
    for f in filas:
        if not f['codigo_licitacion']:
            continue
        l = lic_map[f['codigo_licitacion']]
        l['numero_contrato'] = f['numero_contrato']
        l['nombre_contrato'] = f['nombre_contrato']
        l['estado_contrato'] = f['estado_contrato']
        l['n_oc'] += 1
        l['monto_total'] += f['total_bruto']
        if f['enlace_pac'] == 'Enlazada':
            l['n_enlazada'] += 1
        if f['codigo_pac']:
            cp = l['codigos_pac'][f['codigo_pac']]
            cp['n_oc'] += 1
            cp['nombre_proyecto'] = cp['nombre_proyecto'] or f['nombre_proyecto']
            if f['enlace_pac'] == 'Enlazada':
                cp['n_enlazada'] += 1

    licitaciones = sorted([
        {
            'codigo_licitacion': k,
            'numero_contrato': v['numero_contrato'],
            'nombre_contrato': v['nombre_contrato'],
            'estado_contrato': v['estado_contrato'],
            'n_oc': v['n_oc'],
            'n_enlazada': v['n_enlazada'],
            'n_no_enlazada': v['n_oc'] - v['n_enlazada'],
            'monto_total': round(v['monto_total'], 0),
            'n_codigos_pac': len(v['codigos_pac']),
            'codigos_pac': sorted([
                {
                    'codigo_pac': cp_k,
                    'nombre_proyecto': cp_v['nombre_proyecto'],
                    'n_oc': cp_v['n_oc'],
                    'n_enlazada': cp_v['n_enlazada'],
                }
                for cp_k, cp_v in v['codigos_pac'].items()
            ], key=lambda x: x['n_oc'], reverse=True),
        }
        for k, v in lic_map.items()
    ], key=lambda x: x['n_oc'], reverse=True)

    kpis = {
        'total_oc': len(filas),
        'total_enlazadas': sum(1 for f in filas if f['enlace_pac'] == 'Enlazada'),
        'total_no_enlazadas': sum(1 for f in filas if f['enlace_pac'] != 'Enlazada'),
        'total_codigos_pac': len(codigos_pac),
        'total_licitaciones': len(licitaciones),
        'monto_enlazado': round(sum(f['total_bruto'] for f in filas if f['enlace_pac'] == 'Enlazada'), 0),
        'monto_no_enlazado': round(sum(f['total_bruto'] for f in filas if f['enlace_pac'] != 'Enlazada'), 0),
    }

    return {
        'filas': filas,
        'codigos_pac': codigos_pac,
        'licitaciones': licitaciones,
        'kpis': kpis,
    }


# =============================================================================
# Formularios FSC (Panel SS Osorno)
# =============================================================================

_RE_TIPO_FORMULARIO = re.compile(r'Nro\s*(\d+)', re.IGNORECASE)

# Bandejas de visación en el orden en que recorre un FSC, desde que el
# requirente lo crea (P) hasta que llega al comprador (AC). "R" (Rechazado)
# queda fuera del pipeline — es una salida lateral, no una bandeja de tránsito.
PIPELINE_ESTADOS_FSC = [
    ('P',    'Pendiente Firmas'),
    ('FR',   'Revisor Finanzas'),
    ('FA',   'Autorizador Finanzas'),
    ('ASDA', 'Autorizador Sub Director Administrativo'),
    ('ADIR', 'Autorizador Director'),
    ('AA',   'Autorizador Abastecimiento'),
    ('DC',   'Derivación Compras'),
    ('AC',   'A Comprador'),
]


def generar_id_formulario(folio, anho, tipo_formulario=None, formulario_texto=None):
    """ID corto y legible para un FSC: "Fn-XXX-AA".

    n = tipo de formulario (1-5, extraído de "Formulario Solicitud de Compra Nro N"
        o pasado directo cuando ya se conoce, p.ej. FormularioFSCProducto.tipo_formulario)
    XXX = folio relleno a 3 dígitos
    AA  = año en 2 dígitos

    Ej.: folio 1, "...Nro 1", 2026 → "F1-001-26". Mismo formato en FSC, Derivados
    y Productos para que se puedan cruzar de un vistazo (y a futuro con sus OC).
    """
    n = tipo_formulario
    if n is None and formulario_texto:
        m = _RE_TIPO_FORMULARIO.search(formulario_texto)
        n = int(m.group(1)) if m else None
    if n is None or folio is None or anho is None:
        return None
    return f"F{n}-{folio:03d}-{anho % 100:02d}"


def calcular_formularios_stats(anho=None):
    """KPIs agregados de Formularios FSC para el tab 'Formularios' de Abastecimiento."""
    fsc_qs = FormularioFSC.objects.all()
    derivados_qs = FormularioFSCDerivado.objects.all()
    if anho:
        fsc_qs = fsc_qs.filter(anho=anho)
        derivados_qs = derivados_qs.filter(anho=anho)

    total_formularios = fsc_qs.count()
    total_derivados = derivados_qs.count()

    monto_total_estimado = fsc_qs.aggregate(total=Sum('monto_estimado'))['total'] or 0

    por_estado = list(
        fsc_qs.values('estado')
        .annotate(total=Count('id'))
        .order_by('-total')
    )

    por_unidad = list(
        fsc_qs.values('unidad_requirente')
        .annotate(total=Count('id'), monto=Sum('monto_estimado'))
        .order_by('-total')[:10]
    )

    por_estado_compra = list(
        derivados_qs.exclude(estado_compra__isnull=True)
        .values('estado_compra')
        .annotate(total=Count('id'))
        .order_by('-total')
    )

    anios_disponibles = list(
        FormularioFSC.objects.order_by('-anho').values_list('anho', flat=True).distinct()
    )

    return {
        'kpis': {
            'total_formularios': total_formularios,
            'total_derivados': total_derivados,
            'monto_total_estimado': float(monto_total_estimado),
            'pct_derivados': round(total_derivados / total_formularios * 100, 1) if total_formularios else 0,
        },
        'por_estado': [{'estado': r['estado'] or 'Sin estado', 'total': r['total']} for r in por_estado],
        'por_unidad_requirente': [
            {'unidad': r['unidad_requirente'] or 'Sin unidad', 'total': r['total'], 'monto': float(r['monto'] or 0)}
            for r in por_unidad
        ],
        'por_estado_compra': [{'estado': r['estado_compra'], 'total': r['total']} for r in por_estado_compra],
        'anios_disponibles': anios_disponibles,
    }


def calcular_formularios_flujo(anho=None):
    """Pipeline de visación de FSC 'en camino' (P → AC) para el sub-tab de Flujo.

    Para cada formulario informa:
      - dias_en_tramite: días desde `fecha_solicitud` hasta hoy. Es la única medida
        retroactiva posible — el Panel SSO no expone historial de cambios de estado.
      - dias_en_estado_actual: días desde que `FormularioFSCEstadoLog` detectó el
        estado vigente. Solo disponible para FSC cuyo cambio fue capturado desde
        2026-06-08 (cuando se empezó a registrar el historial); None si aún no hay dato.
    """
    qs = FormularioFSC.objects.all()
    if anho:
        qs = qs.filter(anho=anho)

    hoy = date.today()
    codigos_pipeline = [c for c, _ in PIPELINE_ESTADOS_FSC]

    # Última fecha en que se detectó un cambio de estado por FSC — al solo registrarse
    # cambios, esa fecha corresponde al estado vigente (ver _registrar_cambio_estado en el ETL)
    ultima_fecha_por_fsc = dict(
        FormularioFSCEstadoLog.objects
        .filter(formulario__in=qs)
        .values('formulario_id')
        .annotate(ultima_fecha=Max('fecha_registro'))
        .values_list('formulario_id', 'ultima_fecha')
    )

    def _serializar(fsc):
        dias_tramite = None
        if fsc.fecha_solicitud:
            try:
                fecha = datetime.strptime(fsc.fecha_solicitud, '%Y-%m-%d').date()
                dias_tramite = (hoy - fecha).days
            except (ValueError, TypeError):
                pass
        ultima_fecha = ultima_fecha_por_fsc.get(fsc.id)
        return {
            'id': fsc.id,
            'id_formulario': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario),
            'folio': fsc.folio,
            'anho': fsc.anho,
            'unidad_requirente': fsc.unidad_requirente,
            'usuario_requirente': fsc.usuario_requirente,
            'fecha_solicitud': fsc.fecha_solicitud,
            'monto_estimado': float(fsc.monto_estimado or 0),
            'estado': fsc.estado,
            'destino_actual': fsc.destino_actual,
            'dias_en_tramite': dias_tramite,
            'dias_en_estado_actual': (hoy - ultima_fecha).days if ultima_fecha else None,
        }

    agrupado = defaultdict(list)
    for fsc in qs.filter(estado__in=codigos_pipeline + ['R']).order_by('-fecha_solicitud'):
        agrupado[fsc.estado].append(_serializar(fsc))

    estados_pipeline = [
        {
            'codigo': codigo,
            'nombre': nombre,
            'cantidad': len(agrupado.get(codigo, [])),
            'formularios': agrupado.get(codigo, []),
        }
        for codigo, nombre in PIPELINE_ESTADOS_FSC
    ]
    rechazados = agrupado.get('R', [])

    dias_validos = [
        f['dias_en_tramite']
        for estado in estados_pipeline
        for f in estado['formularios']
        if f['dias_en_tramite'] is not None
    ]

    return {
        'estados_pipeline': estados_pipeline,
        'rechazados': {'cantidad': len(rechazados), 'formularios': rechazados},
        'total_en_camino': sum(e['cantidad'] for e in estados_pipeline),
        'promedio_dias_tramite': round(sum(dias_validos) / len(dias_validos), 1) if dias_validos else 0,
        'historial_disponible_desde': '2026-06-08',
    }


def calcular_formularios_unificacion(anho=None):
    """Agrupa FSC en camino (ASDA→DC) por item_presupuestario para detectar candidatos
    de compra conjunta. Segunda capa: agrupación por categoría de productos."""
    from collections import defaultdict

    ESTADOS_CAMINO = ['ASDA', 'ADIR', 'AA', 'DC']

    qs = FormularioFSC.objects.filter(estado__in=ESTADOS_CAMINO)
    if anho:
        qs = qs.filter(anho=anho)

    # Key: (folio, anho, tipo_formulario) — evita colisión cuando mismo folio/año tiene
    # distintos tipos de formulario (F1-082-26 y F2-082-26 son formularios distintos).
    fsc_map = {}
    for f in qs:
        m_tipo = _RE_TIPO_FORMULARIO.search(f.formulario or '')
        tipo = int(m_tipo.group(1)) if m_tipo else None
        key = (f.folio, f.anho, tipo)
        fsc_map[key] = {
            'folio': f.folio,
            'anho': f.anho,
            'tipo_formulario': tipo,
            'estado': f.estado,
            'unidad_requirente': f.unidad_requirente or '',
            'monto_estimado': int(f.monto_estimado or 0),
            'destino_actual': f.destino_actual or '',
            'requerimiento': (f.requerimiento or '')[:100],
            'usuario_requirente': f.usuario_requirente or '',
            'fecha_solicitud': f.fecha_solicitud or '',
            'item_presupuestario': f.item_presupuestario or '',
            'id_formulario': generar_id_formulario(f.folio, f.anho, tipo_formulario=tipo),
        }

    if not fsc_map:
        return {'nodos': [], 'grupos': [], 'grupos_categoria': [], 'grupos_productos': [], 'total_formularios': 0, 'total_monto': 0}

    # Filtrar productos por (folio, anho, tipo_formulario) exacto.
    # folio__in + anho__in + tipo__in es eficiente; el guard key-not-in-fsc_map
    # descarta cualquier mezcla cross-year o cross-tipo residual.
    folios = list({k[0] for k in fsc_map})
    anhos  = list({k[1] for k in fsc_map})
    tipos  = [t for t in {k[2] for k in fsc_map} if t is not None]
    prods  = FormularioFSCProducto.objects.filter(folio__in=folios, anho__in=anhos)
    if tipos:
        prods = prods.filter(tipo_formulario__in=tipos)

    item_to_keys = defaultdict(set)
    key_to_items = defaultdict(set)
    cat_to_keys  = defaultdict(set)

    for p in prods.values('folio', 'anho', 'tipo_formulario', 'item_presupuestario', 'categoria'):
        key = (p['folio'], p['anho'], p['tipo_formulario'])
        if key not in fsc_map:
            continue  # descarta cross-year o cross-tipo residual
        item = (p['item_presupuestario'] or '').strip()
        if item and item != '0':
            item_to_keys[item].add(key)
            key_to_items[key].add(item)
        cat = (p['categoria'] or '').strip()
        if cat:
            cat_to_keys[cat].add(key)

    # Assign primary_item (single, for backwards compat) + items_propios (all shared items ≥2)
    nodos = []
    for key, details in fsc_map.items():
        items = list(key_to_items.get(key, set()))
        candidates = sorted(
            [(it, len(item_to_keys[it])) for it in items if len(item_to_keys[it]) >= 2],
            key=lambda x: -x[1]
        )
        primary_item  = candidates[0][0] if candidates else None
        items_propios = [it for it, _ in candidates]
        nodos.append({**details, 'primary_item': primary_item, 'items_propios': items_propios})

    # Grupos layer 1: item_presupuestario con ≥2 FSC
    grupos = []
    for item, keys_set in item_to_keys.items():
        if len(keys_set) < 2:
            continue
        forms = [fsc_map[k] for k in keys_set if k in fsc_map]
        estado_counts = defaultdict(int)
        for f in forms:
            estado_counts[f['estado']] += 1
        orden = ['ASDA', 'ADIR', 'AA', 'DC']
        grupos.append({
            'item_presupuestario': item,
            'n_formularios': len(forms),
            'monto_total': sum(f['monto_estimado'] for f in forms),
            'estados': dict(estado_counts),
            'formularios': sorted(forms, key=lambda x: orden.index(x['estado']) if x['estado'] in orden else 99),
        })
    grupos.sort(key=lambda x: -x['n_formularios'])

    # Grupos layer 2: categoría con ≥2 FSC
    grupos_categoria = []
    for cat, keys_set in cat_to_keys.items():
        if len(keys_set) < 2:
            continue
        forms = [fsc_map[k] for k in keys_set if k in fsc_map]
        grupos_categoria.append({
            'categoria': cat,
            'n_formularios': len(forms),
            'monto_total': sum(f['monto_estimado'] for f in forms),
            'formularios': forms,
        })
    grupos_categoria.sort(key=lambda x: -x['n_formularios'])

    # Grupos productos: ítem → categorías → formularios (para tab Productos, vista Opción C)
    # Estructura: por cada ítem con ≥2 FSC, agrupar sus formularios por categoría de producto
    item_cat_keys = defaultdict(lambda: defaultdict(set))
    for p in prods.values('folio', 'anho', 'tipo_formulario', 'item_presupuestario', 'categoria'):
        key = (p['folio'], p['anho'], p['tipo_formulario'])
        if key not in fsc_map:
            continue
        item = (p['item_presupuestario'] or '').strip()
        cat  = (p['categoria'] or '').strip()
        if item and item != '0' and len(item_to_keys.get(item, set())) >= 2:
            item_cat_keys[item][cat or '(sin categoría)'].add(key)

    grupos_productos = []
    for item, cat_map in item_cat_keys.items():
        all_keys = set()
        for keys_set in cat_map.values():
            all_keys |= keys_set
        forms_item = [fsc_map[k] for k in all_keys if k in fsc_map]
        orden = ['ASDA', 'ADIR', 'AA', 'DC']
        estado_counts = defaultdict(int)
        for f in forms_item:
            estado_counts[f['estado']] += 1
        categorias = []
        for cat, keys_set in sorted(cat_map.items(), key=lambda x: -len(x[1])):
            forms_cat = [fsc_map[k] for k in keys_set if k in fsc_map]
            categorias.append({
                'categoria': cat,
                'n_formularios': len(forms_cat),
                'monto_total': sum(f['monto_estimado'] for f in forms_cat),
                'formularios': sorted(forms_cat, key=lambda x: orden.index(x['estado']) if x['estado'] in orden else 99),
            })
        grupos_productos.append({
            'item_presupuestario': item,
            'n_formularios': len(forms_item),
            'n_categorias': len(categorias),
            'monto_total': sum(f['monto_estimado'] for f in forms_item),
            'estados': dict(estado_counts),
            'categorias': categorias,
        })
    grupos_productos.sort(key=lambda x: -x['n_formularios'])

    return {
        'nodos': nodos,
        'grupos': grupos,
        'grupos_categoria': grupos_categoria[:20],
        'grupos_productos': grupos_productos,
        'total_formularios': len(nodos),
        'total_monto': sum(f['monto_estimado'] for f in fsc_map.values()),
    }


def calcular_formularios_historial(anho=None, unidad_requirente=None, usuario_requirente=None):
    """
    Historial de productos solicitados agrupado por unidad requirente.
    Excluye estados R (Rechazado) y P (Pendiente Firmas).
    Retorna lista de FSC con sus productos embebidos.

    JOIN key: (folio, anho, tipo_formulario) — evita colisión cruzada entre FSC con
    mismo folio/año pero distintas unidades requirente (33% colisión observada con
    solo folio+anho). El tipo_formulario se extrae del campo 'formulario' via regex.
    """
    estados_excluidos = ['R', 'P']
    qs = FormularioFSC.objects.exclude(estado__in=estados_excluidos)
    if anho:
        try:
            qs = qs.filter(anho=int(anho))
        except (ValueError, TypeError):
            pass
    if unidad_requirente:
        qs = qs.filter(unidad_requirente__icontains=unidad_requirente)
    if usuario_requirente:
        qs = qs.filter(usuario_requirente__icontains=usuario_requirente)

    fscs = list(qs.only(
        'id', 'folio', 'anho', 'formulario', 'fecha_solicitud', 'estado',
        'unidad_requirente', 'usuario_requirente',
        'monto_estimado', 'requerimiento',
    ).order_by('-fecha_solicitud'))

    if not fscs:
        return []

    # Construir mapa id→tipo y conjunto de claves (folio, anho, tipo)
    fsc_tipo = {}
    fsc_keys = set()
    for f in fscs:
        m = _RE_TIPO_FORMULARIO.search(f.formulario or '')
        tipo = int(m.group(1)) if m else None
        fsc_tipo[f.id] = tipo
        fsc_keys.add((f.folio, f.anho, tipo))

    # Consultar productos usando folio+anho para eficiencia; luego discriminar por tipo
    folios = list({k[0] for k in fsc_keys})
    anhos_list = list({k[1] for k in fsc_keys})
    tipos = [t for t in {k[2] for k in fsc_keys} if t is not None]

    prods_qs = FormularioFSCProducto.objects.filter(folio__in=folios, anho__in=anhos_list)
    if tipos:
        prods_qs = prods_qs.filter(tipo_formulario__in=tipos)

    productos_map = defaultdict(list)
    for p in prods_qs.only(
        'folio', 'anho', 'tipo_formulario', 'categoria', 'producto', 'descripcion',
        'cantidad', 'monto', 'item_presupuestario',
    ):
        key = (p.folio, p.anho, p.tipo_formulario)
        if key not in fsc_keys:
            continue
        try:
            monto = float(p.monto) if p.monto else 0.0
        except (ValueError, TypeError):
            monto = 0.0
        try:
            cantidad = float(p.cantidad) if p.cantidad else 0.0
        except (ValueError, TypeError):
            cantidad = 0.0
        productos_map[key].append({
            'categoria': p.categoria or '',
            'producto': p.producto or '',
            'descripcion': p.descripcion or '',
            'cantidad': cantidad,
            'monto': monto,
            'item_presupuestario': (p.item_presupuestario or '').strip(),
        })

    resultado = []
    for f in fscs:
        tipo = fsc_tipo[f.id]
        key = (f.folio, f.anho, tipo)
        try:
            monto_est = float(f.monto_estimado) if f.monto_estimado else 0.0
        except (ValueError, TypeError):
            monto_est = 0.0
        resultado.append({
            'id': f.id,
            'folio': f.folio,
            'anho': f.anho,
            'fecha_solicitud': str(f.fecha_solicitud) if f.fecha_solicitud else None,
            'estado': f.estado or '',
            'unidad_requirente': f.unidad_requirente or '',
            'usuario_requirente': f.usuario_requirente or '',
            'monto_estimado': monto_est,
            'requerimiento': f.requerimiento or '',
            'productos': productos_map.get(key, []),
        })

    return resultado


# =============================================================================
# Anexo N°1 — Estado de Ejecución Presupuestaria (SIGFE)
# =============================================================================

# Catálogo fijo de los 7 establecimientos SSO — mismo listado que
# ESTABLECIMIENTOS_SSO en Sigfe_Descargas_Estado_ejecucion_presupuestaria.py.
# Se usa para que la matriz muestre siempre las 7 filas (en rojo) aunque un
# establecimiento todavía no tenga ningún mes cargado en la BD.
ESTABLECIMIENTOS_ANEXO1 = [
    ('1638001', 'Direccion del Servicio'),
    ('1638002', 'Hospital de Osorno'),
    ('1638003', 'Hospital Puerto Octay'),
    ('1638004', 'Hospital Purranque'),
    ('1638005', 'Hospital de Rio Negro'),
    ('1638006', 'Hospital Mision San Juan de la Costa'),
    ('1638007', 'Hospital del Perpetuo Socorro de Quilacahuin'),
]


def calcular_sigfe_anexo1_estado_bd(anho_desde=None):
    """
    Matriz establecimiento x mes con semáforo de cobertura de datos sobre
    api_sigfe_anexo1, para el tab "Base de datos" de Anexo N°1.

    Semáforo (criterio simple, confirmado con el usuario -- no distingue una
    carga incompleta por error en un mes ya cerrado, solo expone
    fecha_hasta_tramo en el detalle de cada celda para inspección manual):
      - verde:    mes anterior al actual, con datos cargados
      - amarillo: mes en curso, con datos cargados (parcial por definición)
      - rojo:     sin datos cargados (incluye el mes en curso si aún no se
                  ha descargado nada)
    """
    hoy = date.today()
    anho_actual, mes_actual = hoy.year, hoy.month
    if anho_desde is None:
        anho_desde = anho_actual - 1

    periodos = []
    y, m = anho_desde, 1
    while (y, m) <= (anho_actual, mes_actual):
        periodos.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    filas = (
        SigfeAnexo1.objects
        .filter(anho__gte=anho_desde)
        .values('codigo_ue', 'anho', 'mes')
        .annotate(n_filas=Count('id'), fecha_hasta=Max('fecha_hasta_tramo'), fecha_sync=Max('fecha_sync'))
    )
    datos_por_clave = {(f['codigo_ue'], f['anho'], f['mes']): f for f in filas}

    nombres_bd = dict(
        SigfeAnexo1.objects.values_list('codigo_ue', 'nombre_establecimiento').distinct()
    )

    establecimientos = []
    matriz = {}
    for codigo_ue, nombre_default in ESTABLECIMIENTOS_ANEXO1:
        establecimientos.append({
            'codigo_ue': codigo_ue,
            'nombre': nombres_bd.get(codigo_ue, nombre_default),
        })

        fila_matriz = {}
        for anho, mes in periodos:
            periodo_str = f'{anho}-{mes:02d}'
            info = datos_por_clave.get((codigo_ue, anho, mes))
            if info:
                es_mes_actual = (anho == anho_actual and mes == mes_actual)
                fila_matriz[periodo_str] = {
                    'estado': 'amarillo' if es_mes_actual else 'verde',
                    'n_filas': info['n_filas'],
                    'fecha_hasta_tramo': info['fecha_hasta'].isoformat() if info['fecha_hasta'] else None,
                    'fecha_sync': info['fecha_sync'].isoformat() if info['fecha_sync'] else None,
                }
            else:
                fila_matriz[periodo_str] = {
                    'estado': 'rojo', 'n_filas': 0, 'fecha_hasta_tramo': None, 'fecha_sync': None,
                }
        matriz[codigo_ue] = fila_matriz

    return {
        'establecimientos': establecimientos,
        'periodos': [f'{a}-{m:02d}' for a, m in periodos],
        'matriz': matriz,
    }


# =============================================================================
# Módulo PAC — Seguimiento y Rendimiento del Plan Anual de Compras
# =============================================================================
# dentro_fuera_pac y sso_departamento se calculan en page_data_panel.py en cada
# sync (ver _clasificar_dentro_fuera_pac). Estas funciones solo agregan/leen.

def _rango_fechas_periodo(periodo):
    """'YYYY-MM' (mes) o 'YYYY-QN' (trimestre) -> (date_desde, date_hasta) inclusive."""
    periodo = periodo.upper()
    if 'Q' in periodo:
        anho_str, q_str = periodo.split('-Q')
        anho, trimestre = int(anho_str), int(q_str)
        mes_ini = (trimestre - 1) * 3 + 1
        mes_fin = mes_ini + 2
    else:
        anho_str, mes_str = periodo.split('-')
        anho = int(anho_str)
        mes_ini = mes_fin = int(mes_str)
    fecha_desde = date(anho, mes_ini, 1)
    fecha_hasta = date(anho, mes_fin, calendar.monthrange(anho, mes_fin)[1])
    return fecha_desde, fecha_hasta


def _periodo_anterior(periodo):
    periodo = periodo.upper()
    if 'Q' in periodo:
        anho_str, q_str = periodo.split('-Q')
        anho, trimestre = int(anho_str), int(q_str)
        return f'{anho - 1}-Q4' if trimestre == 1 else f'{anho}-Q{trimestre - 1}'
    anho_str, mes_str = periodo.split('-')
    anho, mes = int(anho_str), int(mes_str)
    return f'{anho - 1}-12' if mes == 1 else f'{anho}-{mes - 1:02d}'


def _mismo_periodo_anho_anterior(periodo):
    periodo = periodo.upper()
    if 'Q' in periodo:
        anho_str, q_str = periodo.split('-Q')
        return f'{int(anho_str) - 1}-Q{q_str}'
    anho_str, mes_str = periodo.split('-')
    return f'{int(anho_str) - 1}-{mes_str}'


def _comparativa_anual_dentro_fuera(qs_base):
    """Agrupa por año de fecha_derivado (string 'YYYY-MM-DD') — no usa PlanerPAC."""
    por_anho = defaultdict(lambda: {'dentro': 0, 'fuera': 0})
    for fecha_derivado, estado in qs_base.values_list('fecha_derivado', 'dentro_fuera_pac'):
        if not fecha_derivado or len(fecha_derivado) < 4:
            continue
        bucket = por_anho[fecha_derivado[:4]]
        bucket['dentro' if estado == FormularioFSCDerivado.DENTRO else 'fuera'] += 1
    resultado = []
    for anho_str in sorted(por_anho):
        d, f = por_anho[anho_str]['dentro'], por_anho[anho_str]['fuera']
        t = d + f
        resultado.append({
            'anho': int(anho_str), 'dentro': d, 'fuera': f, 'total': t,
            'pct_dentro': round(d / t * 100, 1) if t else 0,
        })
    return resultado


ESTABLECIMIENTO_PAC_CUMPLIMIENTO = 1  # Dirección SS Osorno (código 197) — único establecimiento en alcance del módulo
MUESTRA_MINIMA_PAC = 3  # bajo este total, un % Dentro/Fuera no es representativo (1 formulario = 0% o 100%)


def _qs_fsc_derivado_pac_cumplimiento():
    """Queryset base para TODO el módulo PAC Cumplimiento — Resumen, Jerarquía, Rankings,
    Cumplimiento Temporal y la reportería Word/PPT/PDF (que reutiliza estas mismas
    funciones, así que filtrar aquí basta para que el alcance impacte todo el módulo).

    Acotado a un único establecimiento (Dirección SS Osorno, id=1/código 197 —
    `ESTABLECIMIENTO_PAC_CUMPLIMIENTO`), decisión explícita del usuario 2026-07-21.
    Incluye también los formularios "Sin Clasificar" (`sso_departamento` NULL — su
    `unidad_requirente` no calzó con ningún Departamento de NINGÚN establecimiento):
    no hay forma de descartar que pertenezcan a la Dirección, así que se incluyen por
    ahora — el usuario los identificará por `unidad_requirente` (expuesto en
    `calcular_pac_detalle_formularios`) y corregirá la relación en la BD; una vez
    reclasificados quedarán dentro o fuera del establecimiento automáticamente.
    """
    return FormularioFSCDerivado.objects.filter(
        Q(sso_departamento__establecimiento_id=ESTABLECIMIENTO_PAC_CUMPLIMIENTO) |
        Q(sso_departamento__isnull=True)
    )


def calcular_pac_dentro_fuera_stats(anho=None, fecha_desde=None, fecha_hasta=None, subdireccion=None, depto=None):
    """% Dentro/Fuera PAC + comparativa histórica por año, a nivel FSC individual.

    Granularidad y fuente de verdad acordadas con el usuario: 100% desde
    FormularioFSCDerivado.dentro_fuera_pac (verificado contra PacProyectoMaestro),
    agrupado por el año de fecha_derivado — nunca depende de PlanerPAC.
    `fecha_desde`/`fecha_hasta` (ISO 'YYYY-MM-DD') tienen prioridad sobre `anho`;
    se usan para las comparativas de período de la reportería (ver Fase E).
    """
    qs_base = (
        _qs_fsc_derivado_pac_cumplimiento()
        .exclude(dentro_fuera_pac__isnull=True)
        .exclude(fecha_derivado__isnull=True).exclude(fecha_derivado='')
    )
    if subdireccion:
        qs_base = qs_base.filter(sso_departamento__subdireccion_id=subdireccion)
    if depto:
        qs_base = qs_base.filter(sso_departamento_id=depto)

    qs = qs_base
    if fecha_desde:
        qs = qs.filter(fecha_derivado__gte=fecha_desde)
    if fecha_hasta:
        qs = qs.filter(fecha_derivado__lte=fecha_hasta)
    elif anho:
        qs = qs.filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')

    total = qs.count()
    dentro = qs.filter(dentro_fuera_pac=FormularioFSCDerivado.DENTRO).count()
    fuera = total - dentro
    montos = qs.aggregate(
        monto_dentro=Sum('monto_estimado', filter=Q(dentro_fuera_pac=FormularioFSCDerivado.DENTRO)),
        monto_fuera=Sum('monto_estimado', filter=Q(dentro_fuera_pac=FormularioFSCDerivado.FUERA)),
    )

    return {
        'kpis': {
            'total': total,
            'dentro': dentro,
            'fuera': fuera,
            'pct_dentro': round(dentro / total * 100, 1) if total else 0,
            'monto_dentro': float(montos['monto_dentro'] or 0),
            'monto_fuera': float(montos['monto_fuera'] or 0),
        },
        'comparativa_anual': _comparativa_anual_dentro_fuera(qs_base),
    }


def calcular_pac_comparativa_periodos(periodo, subdireccion=None, depto=None):
    """Compara el % Dentro PAC de `periodo` ('YYYY-MM' o 'YYYY-QN') contra el
    período inmediatamente anterior y contra el mismo período del año anterior.
    Reutilizada por el dashboard y por la reportería (Word/PPT/PDF, Fase E).
    """
    def _kpis_periodo(p):
        desde, hasta = _rango_fechas_periodo(p)
        stats = calcular_pac_dentro_fuera_stats(
            fecha_desde=desde.isoformat(), fecha_hasta=hasta.isoformat(),
            subdireccion=subdireccion, depto=depto,
        )['kpis']
        return {'periodo': p, **stats}

    actual = _kpis_periodo(periodo)
    anterior = _kpis_periodo(_periodo_anterior(periodo))
    interanual = _kpis_periodo(_mismo_periodo_anho_anterior(periodo))

    return {
        'actual': actual,
        'periodo_anterior': {**anterior, 'variacion_pp': round(actual['pct_dentro'] - anterior['pct_dentro'], 1)},
        'mismo_periodo_anho_anterior': {
            **interanual, 'variacion_pp': round(actual['pct_dentro'] - interanual['pct_dentro'], 1),
        },
    }


EN_FECHA, ATRASADO, PENDIENTE, SIN_PLANIFICACION = 'EN_FECHA', 'ATRASADO', 'PENDIENTE', 'SIN_PLANIFICACION_CON_FECHA'


def _parsear_fecha_planer(s):
    if not s:
        return None
    s = str(s).strip()[:19]
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _eventos_planificados_por_proyecto(anho=None, subdireccion=None, depto=None):
    """Agrupa PlanerPAC por (id_proyecto, fecha_inicio_compra) = 'evento de compra'
    — un mismo proyecto puede tener varios ítems programados en meses distintos.

    `subdireccion`/`depto` acotan el universo de proyectos planificados a una rama
    organizacional, resolviendo `PlanerPAC.depto`/`sub` (texto) igual que
    `_calcular_fichas_pac_completo` — necesario porque `calcular_pac_cumplimiento_temporal`
    cruza este universo contra un `fsc_qs` que SÍ filtra por subdirección/depto; sin este
    filtro, un proyecto de OTRA subdirección sin FSC en el filtro actual se contaba igual
    como "sin iniciar" de la subdirección filtrada (bug real, revisión de código 2026-07-27)."""
    qs = PlanerPAC.objects.exclude(id_proyecto__isnull=True).exclude(fecha_inicio_compra__isnull=True)
    if anho:
        qs = qs.filter(pac=str(anho))

    mapa_deptos = mapa_subs = None
    depto_ids = None
    if depto is not None:
        depto_ids = depto if isinstance(depto, (list, set, tuple)) else [depto]
        mapa_deptos = _mapa_departamentos_por_nombre()
    if subdireccion is not None:
        mapa_subs = _mapa_subdirecciones_por_nombre()

    eventos = defaultdict(set)
    for id_proyecto, fecha_str, depto_texto, sub_texto in qs.values_list(
        'id_proyecto', 'fecha_inicio_compra', 'depto', 'sub',
    ):
        if depto_ids is not None:
            depto_obj = _resolver_depto_ficha_pac(depto_texto, mapa_deptos)
            if not depto_obj or depto_obj.id not in depto_ids:
                continue
        if subdireccion is not None:
            sub_obj = _resolver_subdireccion_ficha_pac(sub_texto, mapa_subs)
            if not sub_obj or sub_obj.subdireccion_id != subdireccion:
                continue
        fecha = _parsear_fecha_planer(fecha_str)
        if fecha:
            eventos[id_proyecto].add(fecha)
    return {k: sorted(v) for k, v in eventos.items()}


def calcular_pac_cumplimiento_temporal(anho=None, fecha_desde=None, fecha_hasta=None, subdireccion=None, depto=None):
    """Cumplimiento temporal del PAC: cruza FormularioFSCDerivado (solo los Dentro
    PAC) contra los eventos planificados de PlanerPAC. Tolerancia: mes calendario
    (acordado con el usuario). Acotado a los años que PlanerPAC tenga cargados.

    `fecha_desde`/`fecha_hasta` (ISO 'YYYY-MM-DD') tienen prioridad sobre `anho` —
    usados por la reportería (Fase E) para acotar a un mes/trimestre específico.

    Un proyecto con varias fechas planificadas se compara contra el evento MÁS
    CERCANO a la fecha_derivado de cada FSC — es una aproximación documentada
    (ver riesgos del plan), no un match exacto ítem-a-ítem.

    Categorías:
      - En fecha: fecha_derivado en el mismo mes/año del evento, o antes.
      - Atrasado: fecha_derivado posterior al mes/año del evento — o el evento ya
        venció y ningún FSC Dentro PAC de ese proyecto se ha derivado todavía.
      - Pendiente: evento futuro sin ningún FSC Dentro PAC derivado aún.
      - Sin planificación con fecha: el FSC está Dentro PAC pero su proyecto no
        tiene fecha_inicio_compra cargada en PlanerPAC (años no cargados aún).
    """
    hoy = date.today()
    eventos = _eventos_planificados_por_proyecto(anho, subdireccion=subdireccion, depto=depto)

    fsc_qs_base = (
        _qs_fsc_derivado_pac_cumplimiento()
        .filter(dentro_fuera_pac=FormularioFSCDerivado.DENTRO)
        .exclude(fecha_derivado__isnull=True).exclude(fecha_derivado='')
        .exclude(id_plan__isnull=True).exclude(id_plan='')
    )
    if subdireccion:
        fsc_qs_base = fsc_qs_base.filter(sso_departamento__subdireccion_id=subdireccion)
    if depto:
        fsc_qs_base = fsc_qs_base.filter(sso_departamento_id=depto)

    fsc_qs = fsc_qs_base
    if fecha_desde:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=fecha_desde)
    if fecha_hasta:
        fsc_qs = fsc_qs.filter(fecha_derivado__lte=fecha_hasta)
    elif anho:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')

    fecha_tope = fecha_hasta or (f'{anho}-12-31' if anho else hoy.isoformat())
    # Universo de "¿este proyecto ya tiene algún FSC Dentro PAC derivado, alguna vez hasta
    # fecha_tope?" — deliberadamente SIN el límite inferior fecha_desde/anho-01-01: antes este
    # set se armaba dentro del loop de abajo a partir de `fsc_qs` (ya acotado por fecha_desde),
    # así que un proyecto ejecutado en enero aparecía como "sin iniciar" en un reporte de junio
    # solo porque su FSC quedó fuera de la ventana del período (bug real, revisión de código
    # 2026-07-27). Separado acá en su propia consulta, acotada solo por el cierre del período.
    proyectos_con_fsc = set(
        fsc_qs_base.filter(fecha_derivado__lte=fecha_tope).values_list('id_plan', flat=True)
    )

    detalle = []
    conteo = {EN_FECHA: 0, ATRASADO: 0, SIN_PLANIFICACION: 0}

    for fsc in fsc_qs.only(
        'id', 'folio', 'anho', 'id_plan', 'fecha_derivado', 'unidad_requirente',
        'monto_estimado', 'sso_departamento_id',
    ):
        fecha_derivado = _parsear_fecha_planer(fsc.fecha_derivado)
        eventos_proyecto = eventos.get(fsc.id_plan)
        if not fecha_derivado or not eventos_proyecto:
            estado, evento_cercano = SIN_PLANIFICACION, None
            conteo[SIN_PLANIFICACION] += 1
        else:
            evento_cercano = min(eventos_proyecto, key=lambda e: abs((e - fecha_derivado).days))
            mismo_mes = (fecha_derivado.year, fecha_derivado.month) == (evento_cercano.year, evento_cercano.month)
            estado = EN_FECHA if (mismo_mes or fecha_derivado < evento_cercano) else ATRASADO
            conteo[estado] += 1

        detalle.append({
            'id': fsc.id, 'folio': fsc.folio, 'anho': fsc.anho, 'id_plan': fsc.id_plan,
            'fecha_derivado': fsc.fecha_derivado,
            'fecha_evento_mas_cercano': evento_cercano.isoformat() if evento_cercano else None,
            'estado': estado,
            'unidad_requirente': fsc.unidad_requirente,
            'sso_departamento_id': fsc.sso_departamento_id,
            'monto_estimado': float(fsc.monto_estimado) if fsc.monto_estimado else 0,
        })

    # Proyectos planificados sin ningún FSC Dentro PAC derivado todavía (hasta fecha_tope).
    proyectos_sin_iniciar = []
    n_pendientes = n_atrasados_sin_iniciar = 0
    # Fecha de referencia para "¿el evento ya venció?": el cierre del período reportado
    # (fecha_hasta) cuando se pasa uno, o la fecha real de hoy para la vista interactiva del
    # dashboard (sin período explícito). Antes siempre usaba `hoy`, así que un reporte de un
    # trimestre pasado clasificaba Pendiente/Atrasado según la fecha de HOY en vez del cierre
    # del período que dice estar reportando (bug real, revisión de código 2026-07-27).
    fecha_referencia = _parsear_fecha_planer(fecha_hasta) if fecha_hasta else hoy
    primer_dia_mes_referencia = date(fecha_referencia.year, fecha_referencia.month, 1)
    for id_proyecto, fechas in eventos.items():
        if id_proyecto in proyectos_con_fsc:
            continue
        primera_fecha = fechas[0]
        estado_proyecto = PENDIENTE if primera_fecha >= primer_dia_mes_referencia else ATRASADO
        n_pendientes += estado_proyecto == PENDIENTE
        n_atrasados_sin_iniciar += estado_proyecto == ATRASADO
        proyectos_sin_iniciar.append({
            'id_proyecto': id_proyecto,
            'fecha_inicio_compra': primera_fecha.isoformat(),
            'estado': estado_proyecto,
        })

    total = conteo[EN_FECHA] + conteo[ATRASADO] + n_pendientes + n_atrasados_sin_iniciar
    return {
        'kpis': {
            'en_fecha': conteo[EN_FECHA],
            'atrasado': conteo[ATRASADO] + n_atrasados_sin_iniciar,
            'pendiente': n_pendientes,
            'sin_planificacion_con_fecha': conteo[SIN_PLANIFICACION],
            'total_evaluado': total,
            'pct_en_fecha': round(conteo[EN_FECHA] / total * 100, 1) if total else 0,
        },
        'detalle_formularios': detalle,
        'proyectos_sin_iniciar': proyectos_sin_iniciar,
    }


def _mapa_nombres_subdireccion():
    """Resuelve el nombre de 'rama superior' de un Departamento:
      - establecimiento_id=1 (Dirección SS Osorno): nombre real de subdirección
        (SsoSubdireccion, IDs 2-5 — los 4 capítulos del informe institucional).
      - otros 6 establecimientos (hospitales de red): cada uno tiene su propio
        rango de subdireccion_id, no solapado y sin nombre propio — se agrupan
        bajo el nombre del hospital (Establecimiento.descripcion) en su lugar.
    Retorna {(establecimiento_id, subdireccion_id): nombre}.
    """
    mapa = {}
    for s in SsoSubdireccion.objects.all():
        mapa[(1, s.subdireccion_id)] = s.nombre
    establecimientos = dict(Establecimiento.objects.values_list('id', 'descripcion'))
    for depto in Departamento.objects.exclude(establecimiento_id=1).values('establecimiento_id', 'subdireccion_id').distinct():
        clave = (depto['establecimiento_id'], depto['subdireccion_id'])
        mapa.setdefault(clave, establecimientos.get(depto['establecimiento_id'], 'Sin Clasificar'))
    return mapa, establecimientos


def _mapa_departamentos():
    """Todos los Departamento indexados por id, con solo los campos necesarios
    para resolver la cadena parent_id → depto raíz. Tabla chica (147 filas hoy)
    — se carga completa una vez por llamada, no solo los deptos con FSC, porque
    nodos intermedios de la cadena pueden no tener ningún FSC matcheado directo."""
    return {
        d['id']: d for d in Departamento.objects.values(
            'id', 'parent_id', 'subdireccion_id', 'establecimiento_id', 'es_depto', 'descripcion', 'nombre_corto',
        )
    }


def _resolver_depto_raiz(depto_id, mapa_deptos, _visitados=None):
    """Sube la cadena parent_id hasta el departamento de primer nivel ('raíz')
    dentro de la MISMA subdirección/establecimiento — evita que sub-departamentos
    (ej. 'AYEKAN' colgando de 'DEPARTAMENTO DE SALUD MENTAL', o cadenas de 3
    niveles como Sub-depto→Depto medio→Depto mayor) aparezcan como hermanos
    sueltos del departamento del que en realidad dependen.

    `es_depto == 'SI'` es la señal AUTORITATIVA de "soy un departamento de
    primer nivel" y corta la cadena ahí, incluso si `parent_id` apunta a otro
    lado (el origen tiene casos así: departamentos reales — ej. PRAIS — cuyo
    parent_id apunta al nodo que representa la propia Subdirección, no a un
    departamento par; sin este corte se fusionarían incorrectamente con ese
    nodo). Solo se sigue la cadena cuando `es_depto` NO está marcado, es decir,
    cuando el propio origen dice "no soy de primer nivel".
    """
    visitados = _visitados or set()
    nodo = mapa_deptos.get(depto_id)
    if not nodo or depto_id in visitados:
        return depto_id
    if nodo['es_depto'] == 'SI':
        return depto_id
    padre_id = nodo['parent_id']
    if not padre_id or padre_id == depto_id:
        return depto_id
    padre = mapa_deptos.get(padre_id)
    if not padre or padre['subdireccion_id'] != nodo['subdireccion_id'] or padre['establecimiento_id'] != nodo['establecimiento_id']:
        return depto_id
    visitados.add(depto_id)
    return _resolver_depto_raiz(padre_id, mapa_deptos, visitados)


def _orden_por_rendimiento_pac(d):
    """Ordena departamentos/sub-departamentos de la Jerarquía por mejor % Dentro PAC —
    pedido explícito del usuario 2026-07-21 ("ordena los deptos por mejor %"). Los que no
    alcanzan MUESTRA_MINIMA_PAC van al final (bool ascendente en la tupla, ya que False<True
    en Python) para que un depto con 1 formulario al 100% no aparezca sobre uno con 50
    formularios al 95% — mismo criterio que usa calcular_pac_rankings para descartar del
    ranking. El total desempata entre departamentos con % idéntico.
    """
    return (d['total'] < MUESTRA_MINIMA_PAC, -d['pct_dentro'], -d['total'])


def calcular_pac_jerarquia(anho=None, fecha_desde=None, fecha_hasta=None):
    """Árbol Subdirección/Hospital → Departamento (raíz) → Sub-departamento con
    métricas PAC agregadas (Dentro/Fuera, % en fecha, monto). Incluye el bucket
    'Sin Clasificar' (formularios cuyo unidad_requirente no calzó con ningún
    Departamento) como una rama más al mismo nivel — nunca se descarta.

    Un mismo departamento puede tener sub-departamentos colgando de él
    (`Departamento.parent_id`, hasta 3 niveles reales observados en el origen)
    — sin agruparlos, sus métricas quedarían fragmentadas entre el padre y cada
    hijo como si fueran unidades independientes. `_resolver_depto_raiz` los
    consolida bajo el departamento de primer nivel; el detalle del
    sub-departamento real se conserva en `subdepartamentos` para drill-down.

    `fecha_desde`/`fecha_hasta` (ISO) tienen prioridad sobre `anho` — usados por
    la reportería para acotar a un mes/trimestre específico.
    """
    fsc_qs = _qs_fsc_derivado_pac_cumplimiento().exclude(dentro_fuera_pac__isnull=True)
    if fecha_desde:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=fecha_desde)
    if fecha_hasta:
        fsc_qs = fsc_qs.filter(fecha_derivado__lte=fecha_hasta)
    elif anho:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')

    filas = fsc_qs.values(
        'sso_departamento_id', 'sso_departamento__descripcion',
        'sso_departamento__subdireccion_id', 'sso_departamento__establecimiento_id',
    ).annotate(
        total=Count('id'),
        dentro=Count('id', filter=Q(dentro_fuera_pac=FormularioFSCDerivado.DENTRO)),
        monto_dentro=Sum('monto_estimado', filter=Q(dentro_fuera_pac=FormularioFSCDerivado.DENTRO)),
        monto_fuera=Sum('monto_estimado', filter=Q(dentro_fuera_pac=FormularioFSCDerivado.FUERA)),
    )

    # % en fecha por depto real (antes de rollup), reutilizando el detalle ya
    # calculado en cumplimiento temporal (evita recalcular evento-más-cercano acá).
    temporal = calcular_pac_cumplimiento_temporal(anho=anho, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
    en_fecha_por_depto = defaultdict(lambda: [0, 0])  # [en_fecha, evaluados_con_evento]
    for d in temporal['detalle_formularios']:
        if d['estado'] in (EN_FECHA, ATRASADO):
            bucket = en_fecha_por_depto[d['sso_departamento_id']]
            bucket[1] += 1
            bucket[0] += d['estado'] == EN_FECHA

    nombres_rama, _ = _mapa_nombres_subdireccion()
    mapa_deptos = _mapa_departamentos()

    def _fila_metricas(fila_o_dict):
        total, dentro = fila_o_dict['total'], fila_o_dict['dentro']
        en_fecha, evaluados = en_fecha_por_depto.get(fila_o_dict['depto_id'], [0, 0])
        return {
            'depto_id': fila_o_dict['depto_id'], 'nombre': fila_o_dict['nombre'],
            'total': total, 'dentro': dentro, 'fuera': total - dentro,
            'pct_dentro': round(dentro / total * 100, 1) if total else 0,
            'monto_dentro': fila_o_dict['monto_dentro'], 'monto_fuera': fila_o_dict['monto_fuera'],
            'pct_en_fecha': round(en_fecha / evaluados * 100, 1) if evaluados else None,
        }

    subdirecciones = {}
    for fila in filas:
        depto_id = fila['sso_departamento_id']
        establecimiento_id = fila['sso_departamento__establecimiento_id']
        subdireccion_id = fila['sso_departamento__subdireccion_id']
        subdireccion_nombre = nombres_rama.get((establecimiento_id, subdireccion_id), 'Sin Clasificar')
        nombre_depto = fila['sso_departamento__descripcion'] or 'Sin Clasificar'
        total, dentro = fila['total'], fila['dentro']
        monto_dentro, monto_fuera = float(fila['monto_dentro'] or 0), float(fila['monto_fuera'] or 0)

        clave_sub = (establecimiento_id, subdireccion_id) if depto_id is not None else 'sin_clasificar'
        if clave_sub not in subdirecciones:
            subdirecciones[clave_sub] = {
                'subdireccion_id': subdireccion_id, 'nombre': subdireccion_nombre,
                'departamentos': {}, 'total': 0, 'dentro': 0, 'monto_dentro': 0.0, 'monto_fuera': 0.0,
            }
        nodo_sub = subdirecciones[clave_sub]

        raiz_id = _resolver_depto_raiz(depto_id, mapa_deptos) if depto_id is not None else None
        raiz_info = mapa_deptos.get(raiz_id)
        nombre_raiz = (raiz_info['descripcion'] if raiz_info else None) or nombre_depto

        clave_depto = raiz_id if depto_id is not None else 'sin_clasificar'
        if clave_depto not in nodo_sub['departamentos']:
            nodo_sub['departamentos'][clave_depto] = {
                'depto_id': raiz_id, 'nombre': nombre_raiz,
                'total': 0, 'dentro': 0, 'monto_dentro': 0.0, 'monto_fuera': 0.0,
                'subdepartamentos': [],
            }
        nodo_depto = nodo_sub['departamentos'][clave_depto]
        nodo_depto['total'] += total
        nodo_depto['dentro'] += dentro
        nodo_depto['monto_dentro'] += monto_dentro
        nodo_depto['monto_fuera'] += monto_fuera
        if raiz_id != depto_id:
            nodo_depto['subdepartamentos'].append(_fila_metricas({
                'depto_id': depto_id, 'nombre': nombre_depto, 'total': total, 'dentro': dentro,
                'monto_dentro': monto_dentro, 'monto_fuera': monto_fuera,
            }))

        nodo_sub['total'] += total
        nodo_sub['dentro'] += dentro
        nodo_sub['monto_dentro'] += monto_dentro
        nodo_sub['monto_fuera'] += monto_fuera

    resultado = []
    for nodo_sub in subdirecciones.values():
        nodo_sub['pct_dentro'] = round(nodo_sub['dentro'] / nodo_sub['total'] * 100, 1) if nodo_sub['total'] else 0
        deptos_lista = []
        for d in nodo_sub['departamentos'].values():
            en_fecha, evaluados = en_fecha_por_depto.get(d['depto_id'], [0, 0])
            for sub in d['subdepartamentos']:
                if sub['depto_id'] != d['depto_id']:
                    e2, ev2 = en_fecha_por_depto.get(sub['depto_id'], [0, 0])
                    en_fecha += e2
                    evaluados += ev2
            deptos_lista.append({
                'depto_id': d['depto_id'], 'nombre': d['nombre'],
                'total': d['total'], 'dentro': d['dentro'], 'fuera': d['total'] - d['dentro'],
                'pct_dentro': round(d['dentro'] / d['total'] * 100, 1) if d['total'] else 0,
                'monto_dentro': d['monto_dentro'], 'monto_fuera': d['monto_fuera'],
                'pct_en_fecha': round(en_fecha / evaluados * 100, 1) if evaluados else None,
                'subdepartamentos': sorted(d['subdepartamentos'], key=_orden_por_rendimiento_pac),
            })
        deptos_lista.sort(key=_orden_por_rendimiento_pac)
        nodo_sub['departamentos'] = deptos_lista
        resultado.append(nodo_sub)
    resultado.sort(key=lambda n: (n['nombre'] == 'Sin Clasificar', -n['total']))
    return {'subdirecciones': resultado}


def calcular_pac_detalle_fsc_por_subdireccion(anho=None, fecha_desde=None, fecha_hasta=None):
    """Detalle a nivel de CADA FormularioFSCDerivado individual (no agregado por
    departamento), agrupado por nombre de subdirección — usado exclusivamente por
    la reportería (`services_reportes.py`) para listar, dentro del capítulo de cada
    subdirección, con qué formularios concretos se compone su % Dentro/Fuera PAC
    (`calcular_pac_jerarquia` solo agrega, no lista individuos). Mismos filtros de
    período que `calcular_pac_jerarquia`; reutiliza el detalle ya calculado por
    `calcular_pac_cumplimiento_temporal` para no duplicar la lógica de evento-más-cercano.
    """
    fsc_qs = _qs_fsc_derivado_pac_cumplimiento().exclude(dentro_fuera_pac__isnull=True)
    if fecha_desde:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=fecha_desde)
    if fecha_hasta:
        fsc_qs = fsc_qs.filter(fecha_derivado__lte=fecha_hasta)
    elif anho:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')

    temporal_por_id = {
        d['id']: d for d in calcular_pac_cumplimiento_temporal(
            anho=anho, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
        )['detalle_formularios']
    }
    nombres_rama, _ = _mapa_nombres_subdireccion()

    por_sub = defaultdict(list)
    for fsc in fsc_qs.select_related('sso_departamento').only(
        'id', 'folio', 'anho', 'formulario', 'unidad_requirente', 'dentro_fuera_pac',
        'monto_estimado', 'fecha_derivado', 'sso_departamento__subdireccion_id',
        'sso_departamento__establecimiento_id',
    ):
        depto = fsc.sso_departamento
        est_id = depto.establecimiento_id if depto else None
        sub_id = depto.subdireccion_id if depto else None
        nombre_sub = nombres_rama.get((est_id, sub_id), 'Sin Clasificar')
        temporal_fsc = temporal_por_id.get(fsc.id)
        por_sub[nombre_sub].append({
            'id': fsc.id, 'folio': fsc.folio, 'anho': fsc.anho,
            'id_formulario': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario),
            'unidad_requirente': fsc.unidad_requirente,
            'dentro_fuera_pac': fsc.dentro_fuera_pac,
            'monto_estimado': float(fsc.monto_estimado) if fsc.monto_estimado else 0,
            'fecha_derivado': fsc.fecha_derivado,
            'estado_temporal': temporal_fsc['estado'] if temporal_fsc else None,
        })

    for lista in por_sub.values():
        lista.sort(key=lambda f: f['fecha_derivado'] or '', reverse=True)
    return dict(por_sub)


def _score_compuesto(pct_dentro, pct_en_fecha, pct_dentro_valor):
    """Score de ranking acordado con el usuario: % Dentro (cantidad) + % cumplimiento
    temporal + % Dentro ponderado por monto (evita que el score dependa del tamaño
    absoluto del presupuesto — un depto chico y uno grande son comparables)."""
    partes = [p for p in (pct_dentro, pct_en_fecha, pct_dentro_valor) if p is not None]
    pesos = {0: 0.4, 1: 0.4, 2: 0.2}
    disponibles = [(i, p) for i, p in enumerate((pct_dentro, pct_en_fecha, pct_dentro_valor)) if p is not None]
    peso_total = sum(pesos[i] for i, _ in disponibles)
    if not peso_total:
        return 0.0
    return round(sum(pesos[i] * p for i, p in disponibles) / peso_total, 1)


def calcular_pac_rankings(anho=None, fecha_desde=None, fecha_hasta=None, tipo='depto', limite=15):
    """Mejores/peores departamentos o formularios, con el score compuesto acordado.
    `tipo`: 'depto' o 'formulario'. `fecha_desde`/`fecha_hasta` tienen prioridad
    sobre `anho` — usados por la reportería para acotar a un mes/trimestre.
    """
    if tipo == 'depto':
        jerarquia = calcular_pac_jerarquia(anho=anho, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta)
        filas = []
        for sub in jerarquia['subdirecciones']:
            for d in sub['departamentos']:
                if d['total'] < MUESTRA_MINIMA_PAC:  # muestra insuficiente para rankear con sentido
                    continue
                monto_total = d['monto_dentro'] + d['monto_fuera']
                pct_dentro_valor = round(d['monto_dentro'] / monto_total * 100, 1) if monto_total else None
                filas.append({
                    'nombre': d['nombre'], 'subdireccion': sub['nombre'],
                    'depto_id': d['depto_id'],
                    'subdepto_ids': [s['depto_id'] for s in d['subdepartamentos']],
                    'total': d['total'], 'pct_dentro': d['pct_dentro'], 'pct_en_fecha': d['pct_en_fecha'],
                    'monto_dentro': d['monto_dentro'], 'monto_fuera': d['monto_fuera'],
                    'pct_dentro_valor': pct_dentro_valor,
                    'score': _score_compuesto(d['pct_dentro'], d['pct_en_fecha'], pct_dentro_valor),
                })
    else:
        # Clave por `id` (PK real), no (folio, anho): esa combinación NO es única en
        # FormularioFSCDerivado (colisiones documentadas — folio se reasigna por
        # unidad/año), usarla como clave mezclaría el estado temporal entre formularios.
        temporal_por_id = {
            d['id']: d for d in calcular_pac_cumplimiento_temporal(
                anho=anho, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta,
            )['detalle_formularios']
        }
        fsc_qs = _qs_fsc_derivado_pac_cumplimiento().exclude(dentro_fuera_pac__isnull=True)
        if fecha_desde:
            fsc_qs = fsc_qs.filter(fecha_derivado__gte=fecha_desde)
        if fecha_hasta:
            fsc_qs = fsc_qs.filter(fecha_derivado__lte=fecha_hasta)
        elif anho:
            fsc_qs = fsc_qs.filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')
        filas = []
        for fsc in fsc_qs.only('id', 'folio', 'anho', 'unidad_requirente', 'monto_estimado', 'dentro_fuera_pac', 'requerimiento'):
            temporal = temporal_por_id.get(fsc.id)
            pct_dentro = 100.0 if fsc.dentro_fuera_pac == FormularioFSCDerivado.DENTRO else 0.0
            pct_en_fecha = None if not temporal else (100.0 if temporal['estado'] == EN_FECHA else 0.0)
            filas.append({
                'id': fsc.id, 'folio': fsc.folio, 'anho': fsc.anho, 'unidad_requirente': fsc.unidad_requirente,
                'requerimiento': (fsc.requerimiento or '')[:200],
                'dentro_fuera_pac': fsc.dentro_fuera_pac,
                'estado_temporal': temporal['estado'] if temporal else None,
                'monto_estimado': float(fsc.monto_estimado) if fsc.monto_estimado else 0,
                'score': _score_compuesto(pct_dentro, pct_en_fecha, None),
            })

    filas.sort(key=lambda f: -f['score'])
    # Si hay pocos elementos elegibles, top-N y bottom-N pueden solaparse (ej. 26
    # elegibles con límite 15+15). Se acota el límite efectivo para que "mejores"
    # y "peores" nunca compartan un mismo departamento/formulario.
    limite_efectivo = min(limite, len(filas) // 2)
    total_elegibles = len(filas)
    score_promedio = round(sum(f['score'] for f in filas) / total_elegibles, 1) if total_elegibles else 0
    return {
        'mejores': filas[:limite_efectivo], 'peores': list(reversed(filas))[:limite_efectivo],
        'total_elegibles': total_elegibles, 'score_promedio': score_promedio,
    }


_MESES_ES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']


def _serie_mensual_dentro_fuera(anho):
    """Recuento Dentro/Fuera PAC por mes (1-12) de `anho`, agrupado por fecha_derivado.
    Bloque compartido por `calcular_pac_temporalidad_mensual` — separado para poder
    pedir dos años (actual y anterior) sin duplicar la agregación."""
    qs = (
        _qs_fsc_derivado_pac_cumplimiento()
        .exclude(dentro_fuera_pac__isnull=True)
        .exclude(fecha_derivado__isnull=True).exclude(fecha_derivado='')
        .filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')
    )
    por_mes = defaultdict(lambda: {'dentro': 0, 'fuera': 0})
    for fecha_derivado, estado in qs.values_list('fecha_derivado', 'dentro_fuera_pac'):
        if len(fecha_derivado) < 7:
            continue
        mes = int(fecha_derivado[5:7])
        bucket = por_mes[mes]
        bucket['dentro' if estado == FormularioFSCDerivado.DENTRO else 'fuera'] += 1
    return por_mes


def calcular_pac_temporalidad_mensual(anho):
    """Recuento MENSUAL (12 meses) de FSC Dentro/Fuera PAC para `anho`, comparado mes a
    mes contra `anho - 1` — el panel "Temporalidad" del Resumen: cómo viene el año en
    curso respecto al anterior. Acotado a Establecimiento SSO 197 vía
    `_qs_fsc_derivado_pac_cumplimiento` (afecta a `_serie_mensual_dentro_fuera`).
    """
    actual = _serie_mensual_dentro_fuera(anho)
    anterior = _serie_mensual_dentro_fuera(anho - 1)

    meses = []
    for m in range(1, 13):
        a = actual.get(m, {'dentro': 0, 'fuera': 0})
        p = anterior.get(m, {'dentro': 0, 'fuera': 0})
        total_a, total_p = a['dentro'] + a['fuera'], p['dentro'] + p['fuera']
        pct_a = round(a['dentro'] / total_a * 100, 1) if total_a else None
        pct_p = round(p['dentro'] / total_p * 100, 1) if total_p else None
        meses.append({
            'mes': m, 'nombre_mes': _MESES_ES[m],
            'dentro': a['dentro'], 'fuera': a['fuera'], 'total': total_a, 'pct_dentro': pct_a,
            'dentro_anho_anterior': p['dentro'], 'fuera_anho_anterior': p['fuera'],
            'total_anho_anterior': total_p, 'pct_dentro_anho_anterior': pct_p,
            'variacion_pp': round(pct_a - pct_p, 1) if (pct_a is not None and pct_p is not None) else None,
        })

    total_actual = sum(m['total'] for m in meses)
    total_anterior = sum(m['total_anho_anterior'] for m in meses)
    dentro_actual = sum(m['dentro'] for m in meses)
    dentro_anterior = sum(m['dentro_anho_anterior'] for m in meses)

    return {
        'anho': anho, 'anho_anterior': anho - 1,
        'meses': meses,
        'resumen': {
            'total_actual': total_actual, 'dentro_actual': dentro_actual,
            'pct_dentro_actual': round(dentro_actual / total_actual * 100, 1) if total_actual else 0,
            'total_anterior': total_anterior, 'dentro_anterior': dentro_anterior,
            'pct_dentro_anterior': round(dentro_anterior / total_anterior * 100, 1) if total_anterior else 0,
        },
    }


def calcular_pac_resumen_subdireccion(anho):
    """Recuento Dentro/Fuera PAC por Subdirección (ya acotado a Establecimiento SSO 197
    porque reutiliza `calcular_pac_jerarquia`, que parte de `_qs_fsc_derivado_pac_cumplimiento`),
    comparado contra el mismo período del año anterior. No duplica la lógica de
    resolución de nombres/rollup de departamentos — solo reagrega lo que ya calcula
    `calcular_pac_jerarquia` para dos años y los cruza por nombre de subdirección.
    """
    actual = calcular_pac_jerarquia(anho=anho)['subdirecciones']
    anterior = calcular_pac_jerarquia(anho=anho - 1)['subdirecciones']
    anterior_por_nombre = {s['nombre']: s for s in anterior}

    filas = []
    nombres_vistos = set()
    for s in actual:
        nombres_vistos.add(s['nombre'])
        prev = anterior_por_nombre.get(s['nombre'])
        pct_prev = prev['pct_dentro'] if prev else None
        filas.append({
            'subdireccion_id': s['subdireccion_id'], 'nombre': s['nombre'],
            'total': s['total'], 'dentro': s['dentro'], 'fuera': s['total'] - s['dentro'],
            'pct_dentro': s['pct_dentro'],
            'total_anho_anterior': prev['total'] if prev else 0,
            'dentro_anho_anterior': prev['dentro'] if prev else 0,
            'pct_dentro_anho_anterior': pct_prev,
            'variacion_pp': round(s['pct_dentro'] - pct_prev, 1) if pct_prev is not None else None,
        })
    # Subdirecciones con movimiento el año anterior pero ninguno este año — se muestran
    # igual, en ceros, para que la comparación no las haga desaparecer silenciosamente.
    for s in anterior:
        if s['nombre'] in nombres_vistos:
            continue
        filas.append({
            'subdireccion_id': s['subdireccion_id'], 'nombre': s['nombre'],
            'total': 0, 'dentro': 0, 'fuera': 0, 'pct_dentro': 0,
            'total_anho_anterior': s['total'], 'dentro_anho_anterior': s['dentro'],
            'pct_dentro_anho_anterior': s['pct_dentro'], 'variacion_pp': None,
        })
    filas.sort(key=lambda f: (f['nombre'] == 'Sin Clasificar', -f['total']))
    return {'anho': anho, 'anho_anterior': anho - 1, 'subdirecciones': filas}


def calcular_pac_serie_mensual_historica():
    """Serie mensual ('YYYY-MM') del % Dentro PAC a través de TODO el histórico
    disponible (no solo el año seleccionado) — muestra la mejora/control del plan de
    compras mes a mes en el tiempo. Complementa `_comparativa_anual_dentro_fuera`
    (agregada por año) con el detalle mensual para el gráfico de "Comparativa Anual
    mejorada" del Resumen. Acotado a Establecimiento SSO 197.
    """
    qs = (
        _qs_fsc_derivado_pac_cumplimiento()
        .exclude(dentro_fuera_pac__isnull=True)
        .exclude(fecha_derivado__isnull=True).exclude(fecha_derivado='')
    )
    por_periodo = defaultdict(lambda: {'dentro': 0, 'fuera': 0})
    for fecha_derivado, estado in qs.values_list('fecha_derivado', 'dentro_fuera_pac'):
        if len(fecha_derivado) < 7:
            continue
        periodo = fecha_derivado[:7]
        bucket = por_periodo[periodo]
        bucket['dentro' if estado == FormularioFSCDerivado.DENTRO else 'fuera'] += 1

    resultado = []
    for periodo in sorted(por_periodo):
        d, f = por_periodo[periodo]['dentro'], por_periodo[periodo]['fuera']
        t = d + f
        anho_p, mes_p = periodo.split('-')
        resultado.append({
            'periodo': periodo, 'anho': int(anho_p), 'mes': int(mes_p), 'nombre_mes': _MESES_ES[int(mes_p)],
            'dentro': d, 'fuera': f, 'total': t,
            'pct_dentro': round(d / t * 100, 1) if t else 0,
        })
    return resultado


# =============================================================================
# Módulo PAC — Ejecución del Plan de Compras (Ficha PAC ↔ Formulario ↔ OC)
# =============================================================================
#
# Tres joins distintos, cada uno con su propósito (no unificar en uno solo):
#   Ficha (PlanerPAC.id_proyecto)
#     → Formulario:  FormularioFSCDerivado.id_plan == PlanerPAC.id_proyecto
#     → Orden de Compra: PacProyectoMaestro.oc_asociada == OrdenCompra.codigo_oc,
#       con PacProyectoMaestro.id_proyecto == PlanerPAC.id_proyecto como puente.
#       Decisión explícita del usuario 2026-07-21: usar el maestro curado desde
#       OCPAC_Maestro.csv (Mercado Público), NO el EnlacePAC/ID_Proyecto que pone el
#       propio ETL de OC — verificado que el maestro cubre 4786/5031 OC reales contra
#       solo 1172 vía EnlacePAC/ID_Proyecto sobre el PlanerPAC vigente (2026).

_TABLA_TILDES_PAC = str.maketrans("ÁÉÍÓÚÜÑ", "AEIOUUN")


def _normalizar_texto_pac(s):
    """Mayúsculas, sin tildes, espacios colapsados — mismo criterio que
    `_normalizar_texto` de `api/data/data_panel/page_data_panel.py`, duplicado aquí
    porque ese script vive fuera del paquete `backend` y no es importable desde
    `services.py`. Usado para jerarquizar `PlanerPAC.depto`/`sub` contra
    `Departamento`/`SsoSubdireccion` — nunca se había hecho antes (a diferencia de
    `FormularioFSCDerivado.unidad_requirente`, que sí tiene este matching)."""
    if not s:
        return ""
    return " ".join(str(s).upper().translate(_TABLA_TILDES_PAC).split())


def _mapa_departamentos_por_nombre():
    mapa = {}
    for d in Departamento.objects.all():
        mapa.setdefault(_normalizar_texto_pac(d.descripcion), d)
        if d.nombre_corto:
            mapa.setdefault(_normalizar_texto_pac(d.nombre_corto), d)
    # Alias manuales: unidades cuyo texto difiere entre fuentes para el MISMO
    # departamento real. id=11 se renombró el 2026-07-21 (sesión de Resumen PAC) a
    # 'DPTO. GESTION DEL RIESGO EN EMERGENCIAS Y DESASTRES' para calzar con
    # FormularioFSCDerivado.unidad_requirente — pero PlanerPAC.depto sigue trayendo el
    # nombre largo original ('SUB. DPTO. ... TELECOMUNICACIONES'), así que se agrega
    # como alias en vez de perder el match en esta fuente.
    depto_11 = mapa.get(_normalizar_texto_pac('DPTO. GESTION DEL RIESGO EN EMERGENCIAS Y DESASTRES'))
    if depto_11:
        mapa.setdefault(_normalizar_texto_pac('SUB. DPTO. GESTION DEL RIESGO EN EMERGENCIAS, DESASTRES Y TELECOMUNICACIONES'), depto_11)
    return mapa


def _mapa_subdirecciones_por_nombre():
    """SsoSubdireccion.nombre vs PlanerPAC.sub tienen un alias conocido: la ficha PAC
    trae 'DIRECCIÓN' con un byte corrupto de origen ('DIRECCI�N' tal cual llega de
    la BD) para lo que en SsoSubdireccion se llama 'DIRECTOR' — mismo ámbito
    (dependencia directa de la Dirección), distinto nombre. Se resuelve por prefijo en
    `_resolver_subdireccion_ficha_pac`, no acá."""
    return {_normalizar_texto_pac(s.nombre): s for s in SsoSubdireccion.objects.all()}


# =============================================================================
# Formularios FSC — filtro Subdirección/Departamento (Solicitudes FSC)
# =============================================================================
#
# FormularioFSC (a diferencia de FormularioFSCDerivado) no persiste un FK
# `sso_departamento` — esa clasificación solo la calcula el ETL de
# page_data_panel.py sobre el Derivado. Para el filtro de la tabla "Solicitudes
# FSC" se optó (decisión del usuario, 2026-07-29) por resolver el match
# unidad_requirente → Departamento en caliente en vez de agregar una migración +
# tocar el ETL: FormularioFSC tiene baja cardinalidad de unidad_requirente
# distintos (~cientos), así que recalcular es barato. La vista que consume esto
# (FormularioFSCViewSet.get_queryset, views.py) cachea el resultado con
# LocMemCache para no repetir el cálculo en cada request de la tabla.

def _mapa_unidad_requirente_organigrama():
    """unidad_requirente (texto libre de FormularioFSC) → depto raíz + subdirección,
    usando el mismo matching normalizado que `_clasificar_dentro_fuera_pac()` en
    page_data_panel.py aplica sobre FormularioFSCDerivado.unidad_requirente, pero
    sin persistirlo. None = "Sin Clasificar" (unidad_requirente sin match en
    Departamento), nunca se descarta."""
    mapa_deptos = _mapa_departamentos()
    mapa_por_nombre = _mapa_departamentos_por_nombre()
    nombres_rama, _ = _mapa_nombres_subdireccion()

    resultado = {}
    unidades = (
        FormularioFSC.objects.exclude(unidad_requirente__isnull=True).exclude(unidad_requirente='')
        .values_list('unidad_requirente', flat=True).distinct()
    )
    for unidad in unidades:
        depto = mapa_por_nombre.get(_normalizar_texto_pac(unidad))
        if not depto:
            resultado[unidad] = None
            continue
        raiz_id = _resolver_depto_raiz(depto.id, mapa_deptos)
        raiz_info = mapa_deptos.get(raiz_id) or {}
        establecimiento_id = raiz_info.get('establecimiento_id', depto.establecimiento_id)
        subdireccion_id = raiz_info.get('subdireccion_id', depto.subdireccion_id)
        resultado[unidad] = {
            'depto_id': raiz_id,
            'nombre_depto': raiz_info.get('descripcion') or depto.descripcion,
            'establecimiento_id': establecimiento_id,
            'subdireccion_id': subdireccion_id,
            'nombre_subdireccion': nombres_rama.get((establecimiento_id, subdireccion_id), 'Sin Clasificar'),
        }
    return resultado


def calcular_formularios_organigrama():
    """Árbol Subdirección/Hospital → Departamento(raíz) para poblar el filtro en
    cascada de la tabla "Solicitudes FSC" (Abastecimiento › Formularios). Solo
    estructura + conteo de formularios por nodo — a diferencia de
    `calcular_pac_jerarquia`, no cruza con `dentro_fuera_pac` (ese campo no existe
    en FormularioFSC) y no se acota a un establecimiento: Formularios FSC cubre
    toda la red, a diferencia del módulo PAC Cumplimiento (ver
    `ESTABLECIMIENTO_PAC_CUMPLIMIENTO`)."""
    mapa_unidad = _mapa_unidad_requirente_organigrama()
    conteo_por_unidad = dict(
        FormularioFSC.objects.exclude(unidad_requirente__isnull=True).exclude(unidad_requirente='')
        .values('unidad_requirente').annotate(n=Count('id')).values_list('unidad_requirente', 'n')
    )

    subdirecciones = {}
    sin_clasificar_total = 0
    for unidad, info in mapa_unidad.items():
        n = conteo_por_unidad.get(unidad, 0)
        if info is None:
            sin_clasificar_total += n
            continue
        clave_sub = (info['establecimiento_id'], info['subdireccion_id'])
        nodo_sub = subdirecciones.setdefault(clave_sub, {
            'subdireccion_id': info['subdireccion_id'], 'nombre': info['nombre_subdireccion'],
            'departamentos': {}, 'total': 0,
        })
        nodo_sub['total'] += n
        nodo_depto = nodo_sub['departamentos'].setdefault(info['depto_id'], {
            'depto_id': info['depto_id'], 'nombre': info['nombre_depto'], 'total': 0,
        })
        nodo_depto['total'] += n

    resultado = []
    for nodo in subdirecciones.values():
        nodo['departamentos'] = sorted(nodo['departamentos'].values(), key=lambda d: d['nombre'] or '')
        resultado.append(nodo)
    resultado.sort(key=lambda n: n['nombre'] or '')
    if sin_clasificar_total:
        resultado.append({'subdireccion_id': None, 'nombre': 'Sin Clasificar', 'departamentos': [], 'total': sin_clasificar_total})
    return {'subdirecciones': resultado}


def _resolver_depto_ficha_pac(depto_texto, mapa_deptos):
    return mapa_deptos.get(_normalizar_texto_pac(depto_texto))


def _resolver_subdireccion_ficha_pac(sub_texto, mapa_subdirecciones):
    txt = _normalizar_texto_pac(sub_texto)
    if txt.startswith('DIRECCI'):  # ver nota de _mapa_subdirecciones_por_nombre
        return mapa_subdirecciones.get('DIRECTOR')
    return mapa_subdirecciones.get(txt)


def _to_float_pac(v):
    """monto_total_item/monto_unitario_item son TextField numéricos simples (ej.
    '15000018', sin separador de miles) — a diferencia de otros montos del sistema,
    no requieren limpieza de puntos/comas."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _mapa_oc_por_proyecto_pac(ids_proyecto=None):
    """id_proyecto → lista de OrdenCompra enlazadas, vía PacProyectoMaestro.oc_asociada."""
    qs_maestro = PacProyectoMaestro.objects.exclude(oc_asociada__isnull=True).exclude(oc_asociada='')
    if ids_proyecto is not None:
        qs_maestro = qs_maestro.filter(id_proyecto__in=ids_proyecto)
    pares = list(qs_maestro.values_list('id_proyecto', 'oc_asociada'))
    codigos_oc = {oc for _, oc in pares}
    ocs_por_codigo = {
        oc.codigo_oc: oc for oc in OrdenCompra.objects.filter(codigo_oc__in=codigos_oc).only(
            'codigo_oc', 'NombreOC', 'EstadoOC', 'TotalBruto', 'FechaEnvio', 'C_Unidad', 'LinkMP',
        )
    }
    mapa = defaultdict(list)
    for id_proyecto, oc_codigo in pares:
        oc = ocs_por_codigo.get(oc_codigo)
        if oc:
            mapa[id_proyecto].append(oc)
    return mapa


def _mapa_formularios_por_id_plan_pac(ids_proyecto=None):
    """id_plan (== PlanerPAC.id_proyecto) → lista de FormularioFSCDerivado — mismo join
    que usa `calcular_pac_cumplimiento_temporal`, factorizado acá para reusarlo en el
    módulo de Ficha PAC sin duplicar la consulta."""
    qs = _qs_fsc_derivado_pac_cumplimiento().exclude(id_plan__isnull=True).exclude(id_plan='')
    if ids_proyecto is not None:
        qs = qs.filter(id_plan__in=ids_proyecto)
    mapa = defaultdict(list)
    for fsc in qs.only(
        'id', 'folio', 'anho', 'formulario', 'id_plan', 'fecha_derivado', 'dentro_fuera_pac',
        'estado_compra', 'comprador', 'monto_estimado', 'unidad_requirente',
    ):
        mapa[fsc.id_plan].append(fsc)
    return mapa


FICHA_EJECUTADO, FICHA_PENDIENTE, FICHA_ATRASADO, FICHA_SIN_FECHA = 'EJECUTADO', 'PENDIENTE', 'ATRASADO', 'SIN_FECHA'


def _calcular_fichas_pac_completo(anho=None, depto=None, subdireccion=None, estado=None, search=None):
    """Agrega PlanerPAC por `id_proyecto` (una ficha puede tener varios ítems en
    distintos meses — ver `cantidad_items`/`items` en el detalle) y enriquece cada una
    con sus flags de enlace (Formulario, OC) y estado de ejecución temporal. Devuelve
    la lista COMPLETA ya filtrada/ordenada — `calcular_pac_fichas` solo la pagina,
    `calcular_pac_jerarquia_planer` y la reportería la consumen entera.
    """
    qs = PlanerPAC.objects.exclude(id_proyecto__isnull=True).exclude(id_proyecto='')
    if anho:
        qs = qs.filter(pac=str(anho))

    proyectos = {}
    for row in qs.only(
        'id_proyecto', 'nombre_proyecto', 'depto', 'sub', 'unidad', 'monto_total_item',
        'nombre_responsable', 'cargo_responsable', 'fecha_inicio_compra', 'tipo_proyecto',
        'codigo_presupuestario',
    ):
        p = proyectos.setdefault(row.id_proyecto, {
            'id_proyecto': row.id_proyecto, 'nombre_proyecto': row.nombre_proyecto,
            'depto_texto': row.depto, 'sub_texto': row.sub, 'unidad': row.unidad,
            'nombre_responsable': row.nombre_responsable, 'cargo_responsable': row.cargo_responsable,
            'tipo_proyecto': row.tipo_proyecto, 'codigo_presupuestario': row.codigo_presupuestario,
            'monto_total': 0.0, 'cantidad_items': 0, 'fechas_compra': [],
        })
        monto = _to_float_pac(row.monto_total_item)
        if monto:
            p['monto_total'] += monto
        p['cantidad_items'] += 1
        fecha = _parsear_fecha_planer(row.fecha_inicio_compra)
        if fecha:
            p['fechas_compra'].append(fecha)

    mapa_deptos = _mapa_departamentos_por_nombre()
    mapa_subs = _mapa_subdirecciones_por_nombre()
    ids_proyecto = list(proyectos.keys())
    mapa_form = _mapa_formularios_por_id_plan_pac(ids_proyecto)
    mapa_oc = _mapa_oc_por_proyecto_pac(ids_proyecto)

    hoy = date.today()
    primer_dia_mes_actual = date(hoy.year, hoy.month, 1)

    filas = []
    for id_proyecto, p in proyectos.items():
        depto_obj = _resolver_depto_ficha_pac(p['depto_texto'], mapa_deptos)
        sub_obj = _resolver_subdireccion_ficha_pac(p['sub_texto'], mapa_subs)
        formularios = mapa_form.get(id_proyecto, [])
        ocs = mapa_oc.get(id_proyecto, [])
        fecha_mas_proxima = min(p['fechas_compra']) if p['fechas_compra'] else None
        tiene_formulario = len(formularios) > 0
        tiene_oc = len(ocs) > 0

        if tiene_formulario or tiene_oc:
            estado_ejec = FICHA_EJECUTADO
        elif fecha_mas_proxima and fecha_mas_proxima >= primer_dia_mes_actual:
            estado_ejec = FICHA_PENDIENTE
        elif fecha_mas_proxima:
            estado_ejec = FICHA_ATRASADO
        else:
            estado_ejec = FICHA_SIN_FECHA

        # `formularios_ejecutores`: identidad de cada FSC que ejecutó esta ficha (no solo
        # el conteo) — pedido de la reportería 2026-07-23 para poder decir "con qué FSC
        # se ejecutó el proyecto" en el capítulo de Ejecución del Plan de Compras.
        formularios_ejecutores = [{
            'id': fx.id, 'folio': fx.folio, 'anho': fx.anho,
            'id_formulario': generar_id_formulario(fx.folio, fx.anho, formulario_texto=fx.formulario),
            'comprador': fx.comprador, 'fecha_derivado': fx.fecha_derivado,
            'dentro_fuera_pac': fx.dentro_fuera_pac,
        } for fx in formularios]

        filas.append({
            'id_proyecto': id_proyecto, 'nombre_proyecto': p['nombre_proyecto'],
            'depto_texto': p['depto_texto'], 'depto_id': depto_obj.id if depto_obj else None,
            'depto_nombre': depto_obj.descripcion if depto_obj else None,
            'sub_texto': p['sub_texto'],
            'subdireccion_id': sub_obj.subdireccion_id if sub_obj else None,
            'subdireccion_nombre': sub_obj.nombre if sub_obj else None,
            'unidad': p['unidad'], 'nombre_responsable': p['nombre_responsable'],
            'cargo_responsable': p['cargo_responsable'], 'tipo_proyecto': p['tipo_proyecto'],
            'monto_total': round(p['monto_total'], 0), 'cantidad_items': p['cantidad_items'],
            'fecha_mas_proxima': fecha_mas_proxima.isoformat() if fecha_mas_proxima else None,
            'tiene_formulario': tiene_formulario, 'cantidad_formularios': len(formularios),
            'formularios_ejecutores': formularios_ejecutores,
            'tiene_oc': tiene_oc, 'cantidad_oc': len(ocs),
            'estado_ejecucion': estado_ejec,
        })

    if depto:
        # Acepta un id único o una lista/set (varios depto_id que rollean a la misma
        # raíz en calcular_pac_jerarquia_planer — filtrar por el nodo raíz sin esto
        # perdería las fichas matcheadas directo a un sub-departamento).
        depto_ids = depto if isinstance(depto, (list, set, tuple)) else [depto]
        filas = [f for f in filas if f['depto_id'] in depto_ids]
    if subdireccion:
        filas = [f for f in filas if f['subdireccion_id'] == subdireccion]
    if estado:
        filas = [f for f in filas if f['estado_ejecucion'] == estado]
    if search:
        s = search.upper()
        filas = [
            f for f in filas
            if s in (f['nombre_proyecto'] or '').upper()
            or s in f['id_proyecto'].upper()
            or s in (f['depto_texto'] or '').upper()
        ]

    filas.sort(key=lambda f: (f['fecha_mas_proxima'] is None, f['fecha_mas_proxima'] or ''))
    return filas


def calcular_pac_fichas(anho=None, depto=None, subdireccion=None, estado=None, search=None, page=1, page_size=50):
    """Listado paginado de fichas PAC para el sub-tab 'Ver Ficha' — ver
    `_calcular_fichas_pac_completo` para la lógica de agregación/enlace."""
    filas = _calcular_fichas_pac_completo(anho=anho, depto=depto, subdireccion=subdireccion, estado=estado, search=search)
    total = len(filas)
    inicio = (page - 1) * page_size
    return {
        'count': total, 'page': page, 'page_size': page_size,
        'results': filas[inicio:inicio + page_size],
    }


def calcular_pac_ficha_detalle(id_proyecto):
    """Detalle completo de una ficha PAC (todos sus ítems/meses) para el modal
    'Revisar' del sub-tab Ver Ficha: filas de PlanerPAC, formularios derivados (con
    productos) y OC enlazadas. Retorna None si el id_proyecto no existe."""
    items = list(PlanerPAC.objects.filter(id_proyecto=id_proyecto))
    if not items:
        return None

    mapa_deptos = _mapa_departamentos_por_nombre()
    mapa_subs = _mapa_subdirecciones_por_nombre()
    primero = items[0]
    depto_obj = _resolver_depto_ficha_pac(primero.depto, mapa_deptos)
    sub_obj = _resolver_subdireccion_ficha_pac(primero.sub, mapa_subs)

    items_data = [{
        'nombre_item': it.nombre_item, 'cantidad_items': it.cantidad_items,
        'monto_unitario_item': _to_float_pac(it.monto_unitario_item),
        'monto_total_item': _to_float_pac(it.monto_total_item),
        'fecha_inicio_compra': it.fecha_inicio_compra,
        'meses_envio_oc': it.meses_envio_oc, 'cantidad_oc': it.cantidad_oc,
        'codigo_presupuestario': it.codigo_presupuestario,
    } for it in items]

    formularios = _mapa_formularios_por_id_plan_pac([id_proyecto]).get(id_proyecto, [])
    formularios_data = []
    for fsc in formularios:
        productos = list(FormularioFSCProducto.objects.filter(folio=fsc.folio, anho=fsc.anho).values(
            'categoria', 'producto', 'descripcion', 'cantidad', 'monto', 'item_presupuestario',
        ))
        formularios_data.append({
            'id': fsc.id, 'folio': fsc.folio, 'anho': fsc.anho,
            'id_formulario': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario),
            'fecha_derivado': fsc.fecha_derivado, 'dentro_fuera_pac': fsc.dentro_fuera_pac,
            'estado_compra': fsc.estado_compra, 'comprador': fsc.comprador,
            'monto_estimado': float(fsc.monto_estimado) if fsc.monto_estimado else 0,
            'unidad_requirente': fsc.unidad_requirente,
            'productos': productos,
        })

    ocs = _mapa_oc_por_proyecto_pac([id_proyecto]).get(id_proyecto, [])
    ocs_data = [{
        'codigo_oc': oc.codigo_oc, 'nombre_oc': oc.NombreOC, 'estado_oc': oc.EstadoOC,
        'total_bruto': float(oc.TotalBruto) if oc.TotalBruto is not None else None,
        'fecha_envio': oc.FechaEnvio.isoformat() if oc.FechaEnvio else None,
        'unidad': oc.C_Unidad, 'link_mp': oc.LinkMP,
    } for oc in ocs]

    hoy = date.today()
    primer_dia_mes_actual = date(hoy.year, hoy.month, 1)
    fechas_compra = [f for f in (_parsear_fecha_planer(it.fecha_inicio_compra) for it in items) if f]
    fecha_mas_proxima = min(fechas_compra) if fechas_compra else None
    if formularios or ocs:
        estado_ejecucion = FICHA_EJECUTADO
    elif fecha_mas_proxima and fecha_mas_proxima >= primer_dia_mes_actual:
        estado_ejecucion = FICHA_PENDIENTE
    elif fecha_mas_proxima:
        estado_ejecucion = FICHA_ATRASADO
    else:
        estado_ejecucion = FICHA_SIN_FECHA

    return {
        'id_proyecto': id_proyecto, 'nombre_proyecto': primero.nombre_proyecto,
        'depto_texto': primero.depto, 'depto_nombre': depto_obj.descripcion if depto_obj else None,
        'sub_texto': primero.sub, 'subdireccion_nombre': sub_obj.nombre if sub_obj else None,
        'unidad': primero.unidad, 'tipo_proyecto': primero.tipo_proyecto,
        'nombre_responsable': primero.nombre_responsable, 'cargo_responsable': primero.cargo_responsable,
        'pac': primero.pac, 'estado_ejecucion': estado_ejecucion,
        'items': items_data,
        'formularios': formularios_data,
        'ordenes_compra': ocs_data,
    }


def calcular_pac_temporal_mensual_planer(anho):
    """Datos mensuales (12 meses) de ítems PAC por `fecha_inicio_compra` — para el
    gráfico de barras y el calendario mensual del sub-tab 'Temporal'."""
    qs = PlanerPAC.objects.filter(pac=str(anho)).exclude(id_proyecto__isnull=True).exclude(id_proyecto='')
    filas = list(qs.only('id_proyecto', 'fecha_inicio_compra', 'monto_total_item'))

    ids_proyecto = {r.id_proyecto for r in filas}
    mapa_form = _mapa_formularios_por_id_plan_pac(list(ids_proyecto))
    mapa_oc = _mapa_oc_por_proyecto_pac(list(ids_proyecto))
    hoy = date.today()
    primer_dia_mes_actual = date(hoy.year, hoy.month, 1)

    por_mes = defaultdict(lambda: {'total': 0, 'ejecutados': 0, 'pendientes': 0, 'atrasados': 0, 'monto': 0.0})
    for r in filas:
        fecha = _parsear_fecha_planer(r.fecha_inicio_compra)
        if not fecha or fecha.year != int(anho):
            continue
        bucket = por_mes[fecha.month]
        bucket['total'] += 1
        bucket['monto'] += _to_float_pac(r.monto_total_item) or 0
        ejecutado = bool(mapa_form.get(r.id_proyecto)) or bool(mapa_oc.get(r.id_proyecto))
        if ejecutado:
            bucket['ejecutados'] += 1
        elif fecha >= primer_dia_mes_actual:
            bucket['pendientes'] += 1
        else:
            bucket['atrasados'] += 1

    meses = []
    for m in range(1, 13):
        b = por_mes.get(m, {'total': 0, 'ejecutados': 0, 'pendientes': 0, 'atrasados': 0, 'monto': 0.0})
        meses.append({
            'mes': m, 'nombre_mes': _MESES_ES[m],
            'total': b['total'], 'ejecutados': b['ejecutados'],
            'pendientes': b['pendientes'], 'atrasados': b['atrasados'],
            'pct_ejecutado': round(b['ejecutados'] / b['total'] * 100, 1) if b['total'] else 0,
            'monto': round(b['monto'], 0),
        })
    return {'anho': int(anho), 'meses': meses}


def calcular_pac_jerarquia_planer(anho):
    """Árbol Subdirección → Departamento (raíz) → Sub-departamento para las fichas
    PAC — sub-tab 'Ejecución Jerárquica'. Mismo rollup que `calcular_pac_jerarquia`
    (FSC) vía `_resolver_depto_raiz`: un departamento raíz agrupa sus
    sub-departamentos reales (ej. 'AYEKAN'/'CDR KUMELEN' bajo 'DEPARTAMENTO DE SALUD
    MENTAL') para no fragmentar sus métricas, pero el detalle de cada sub-departamento
    se conserva en `subdepartamentos` para el drill-down (pedido 2026-07-21).
    A diferencia de `calcular_pac_jerarquia`, la subdirección se resuelve DIRECTO desde
    `PlanerPAC.sub` (texto explícito, no requiere subir por establecimiento) — no
    reutiliza `_mapa_nombres_subdireccion` porque ese mapa resuelve la rama a partir de
    `Departamento.subdireccion_id`, un paso innecesario cuando la ficha ya trae su
    propia subdirección declarada."""
    fichas = _calcular_fichas_pac_completo(anho=anho)
    mapa_deptos = _mapa_departamentos()

    subdirecciones = {}
    for f in fichas:
        sub_nombre = f['subdireccion_nombre'] or 'Sin Clasificar'
        nodo_sub = subdirecciones.setdefault(sub_nombre, {
            'nombre': sub_nombre, 'subdireccion_id': f['subdireccion_id'], 'departamentos': {},
            'total': 0, 'ejecutados': 0, 'pendientes': 0, 'atrasados': 0, 'monto_total': 0.0,
        })

        depto_id = f['depto_id']
        raiz_id = _resolver_depto_raiz(depto_id, mapa_deptos) if depto_id is not None else None
        raiz_info = mapa_deptos.get(raiz_id) if raiz_id is not None else None
        nombre_depto = (raiz_info['descripcion'] if raiz_info else None) or f['depto_nombre'] or f['depto_texto'] or 'Sin Clasificar'
        clave_depto = raiz_id if raiz_id is not None else (f['depto_texto'] or 'sin_clasificar')

        nodo_depto = nodo_sub['departamentos'].setdefault(clave_depto, {
            # `depto_ids`: TODOS los depto_id crudos que rollean a esta raíz (un
            # departamento raíz puede agrupar varios sub-departamentos vía
            # _resolver_depto_raiz) — necesario para filtrar fichas por este nodo sin
            # perder las que matchearon directo a un sub-departamento.
            'nombre': nombre_depto, 'depto_ids': set(), 'subdepartamentos': {},
            'total': 0, 'ejecutados': 0, 'pendientes': 0, 'atrasados': 0, 'monto_total': 0.0,
        })
        if depto_id is not None:
            nodo_depto['depto_ids'].add(depto_id)

        nodo_subdepto = None
        if depto_id is not None and raiz_id != depto_id:
            nombre_subdepto = f['depto_nombre'] or f['depto_texto'] or 'Sin Clasificar'
            nodo_subdepto = nodo_depto['subdepartamentos'].setdefault(depto_id, {
                'nombre': nombre_subdepto, 'depto_ids': [depto_id],
                'total': 0, 'ejecutados': 0, 'pendientes': 0, 'atrasados': 0, 'monto_total': 0.0,
            })

        nodos_a_actualizar = [nodo_sub, nodo_depto] + ([nodo_subdepto] if nodo_subdepto else [])
        for nodo in nodos_a_actualizar:
            nodo['total'] += 1
            nodo['monto_total'] += f['monto_total'] or 0
            if f['estado_ejecucion'] == FICHA_EJECUTADO:
                nodo['ejecutados'] += 1
            elif f['estado_ejecucion'] == FICHA_PENDIENTE:
                nodo['pendientes'] += 1
            elif f['estado_ejecucion'] == FICHA_ATRASADO:
                nodo['atrasados'] += 1

    resultado = []
    for sub in subdirecciones.values():
        deptos = []
        for d in sub['departamentos'].values():
            d['pct_ejecutado'] = round(d['ejecutados'] / d['total'] * 100, 1) if d['total'] else 0
            d['depto_ids'] = sorted(d['depto_ids'])
            subdepartamentos = []
            for sd in d['subdepartamentos'].values():
                sd['pct_ejecutado'] = round(sd['ejecutados'] / sd['total'] * 100, 1) if sd['total'] else 0
                subdepartamentos.append(sd)
            subdepartamentos.sort(key=lambda sd: -sd['total'])
            d['subdepartamentos'] = subdepartamentos
            deptos.append(d)
        deptos.sort(key=lambda d: -d['total'])
        sub['departamentos'] = deptos
        sub['pct_ejecutado'] = round(sub['ejecutados'] / sub['total'] * 100, 1) if sub['total'] else 0
        resultado.append(sub)
    resultado.sort(key=lambda s: (s['nombre'] == 'Sin Clasificar', -s['total']))
    return {'anho': int(anho), 'subdirecciones': resultado}


# =============================================================================
# Módulo Facturas (DIPRES/Acepta) — tab "Datos"
# =============================================================================

def calcular_facturas_stats() -> dict:
    """KPIs para el tab 'Datos' del módulo Facturas: total de registros, distribución
    por año (agrupada en la BD a partir de los 4 últimos caracteres de `emision`,
    string DD-MM-YYYY — evita el slicing en Python que usa facturas_raw_all) y la
    última sincronización DIPRES (FacturaSyncLog, ver docstring del modelo)."""
    total_registros = Factura.objects.count()

    por_anio_qs = (
        Factura.objects
        .exclude(emision__isnull=True)
        .exclude(emision='')
        .annotate(anio=Substr('emision', 7, 4))
        .values('anio')
        .annotate(count=Count('id'))
        .order_by('anio')
    )
    por_anio = [
        {'anio': r['anio'], 'count': r['count']}
        for r in por_anio_qs if r['anio'] and r['anio'].isdigit()
    ]

    ultima = FacturaSyncLog.objects.first()  # ordering = ['-fecha_ejecucion']
    ultima_sync = None
    if ultima:
        ultima_sync = {
            'fecha_ejecucion': ultima.fecha_ejecucion.isoformat(),
            'fecha_desde': ultima.fecha_desde.isoformat(),
            'fecha_hasta': ultima.fecha_hasta.isoformat(),
            'registros_leidos': ultima.registros_leidos,
            'registros_nuevos': ultima.registros_nuevos,
            'registros_actualizados': ultima.registros_actualizados,
            'estado': ultima.estado,
            'error_mensaje': ultima.error_mensaje,
            'usuario': ultima.usuario,
        }

    historial_sync = [
        {
            'fecha_ejecucion': s.fecha_ejecucion.isoformat(),
            'fecha_desde': s.fecha_desde.isoformat(),
            'fecha_hasta': s.fecha_hasta.isoformat(),
            'registros_nuevos': s.registros_nuevos,
            'registros_actualizados': s.registros_actualizados,
            'estado': s.estado,
            'usuario': s.usuario,
        }
        for s in FacturaSyncLog.objects.all()[:10]
    ]

    return {
        'total_registros': total_registros,
        'por_anio': por_anio,
        'ultima_sync': ultima_sync,
        'historial_sync': historial_sync,
    }


def _humanizar_tipo_documento(raw) -> str:
    """`tipo_documento` llega como slug (ej. 'factura_electronica',
    'nota_de_credito_electronica') — no como código DTE numérico. Dos fuentes
    históricas conviven (Excel legacy vs. scraper DIPRES) con slugs ligeramente
    distintos para el mismo tipo de documento (ej. 'nota_credito' vs.
    'nota_de_credito_electronica') — no se fusionan aquí para no asumir
    equivalencias sin verificar; solo se humaniza el texto. Algunas filas
    legacy tienen caracteres corruptos (U+FFFD) por un mal-decode en la carga
    original desde Excel — irrecuperable, se muestra tal cual."""
    if not raw:
        return 'Sin especificar'
    return str(raw).replace('_', ' ').strip().title()


def calcular_facturas_analisis() -> dict:
    """Análisis exploratorio para el tab 'Datos' del módulo Facturas: composición
    por tipo de documento, serie temporal mensual, distribución por tarea_actual,
    relación con Orden de Compra (folio_oc) y detección de duplicados (folio+emisor).
    Todas las agregaciones corren en la BD — nada de slicing en Python sobre 16k+ filas."""
    qs = Factura.objects.all()
    total = qs.count()

    # --- Composición por tipo de documento ---
    por_tipo_qs = (
        qs.values('tipo_documento')
        .annotate(count=Count('id'), monto_total=Sum('monto_total'))
        .order_by('-count')
    )
    por_tipo_documento = [
        {
            'tipo_documento': r['tipo_documento'] or 'sin_especificar',
            'label': _humanizar_tipo_documento(r['tipo_documento']),
            'count': r['count'],
            'pct': round(r['count'] / total * 100, 1) if total else 0,
            'monto_total': float(r['monto_total'] or 0),
        }
        for r in por_tipo_qs
    ]

    # --- Serie temporal mensual (a partir de emision, string DD-MM-YYYY) ---
    serie_qs = (
        qs.exclude(emision__isnull=True).exclude(emision='')
        .annotate(periodo=Concat(
            Substr('emision', 7, 4), Value('-'), Substr('emision', 4, 2),
            output_field=CharField(),
        ))
        .values('periodo')
        .annotate(count=Count('id'), monto_total=Sum('monto_total'))
        .order_by('periodo')
    )
    serie_temporal = [
        {'periodo': r['periodo'], 'count': r['count'], 'monto_total': float(r['monto_total'] or 0)}
        for r in serie_qs
        if r['periodo'] and len(r['periodo']) == 7 and r['periodo'][:4].isdigit() and r['periodo'][5:7].isdigit()
    ]

    # --- Distribución por tarea_actual (estado de tramitación) ---
    tarea_qs = (
        qs.exclude(tarea_actual__isnull=True).exclude(tarea_actual='')
        .values('tarea_actual')
        .annotate(count=Count('id'))
        .order_by('-count')[:12]
    )
    por_tarea_actual = [
        {'tarea_actual': r['tarea_actual'], 'count': r['count']}
        for r in tarea_qs
    ]

    # --- Relación con Orden de Compra (folio_oc) ---
    con_oc = qs.exclude(folio_oc__isnull=True).exclude(folio_oc='').count()
    sin_oc = total - con_oc
    relacion_oc = {
        'con_oc': con_oc,
        'sin_oc': sin_oc,
        'pct_con_oc': round(con_oc / total * 100, 1) if total else 0,
    }

    # --- Duplicados: filas que comparten folio+emisor (debería ser 0 desde que el
    # ETL hace upsert por esa clave, pero puede haber arrastre de cargas previas) ---
    dup_qs = (
        qs.values('folio', 'emisor')
        .annotate(count=Count('id'))
        .filter(count__gt=1)
        .order_by('-count')
    )
    dup_detalle = list(dup_qs[:50])
    dup_grupos = dup_qs.count()
    dup_filas_agg = dup_qs.aggregate(filas=Sum('count'))
    duplicados = {
        'grupos_duplicados': dup_grupos,
        'filas_afectadas': dup_filas_agg['filas'] or 0,
        'detalle': [
            {'folio': d['folio'], 'emisor': d['emisor'], 'count': d['count']}
            for d in dup_detalle
        ],
        'detalle_truncado': dup_grupos > 50,
    }

    # --- Montos globales ---
    montos_agg = qs.aggregate(
        total=Sum('monto_total'), neto=Sum('monto_neto'),
        iva=Sum('monto_iva'), promedio=Avg('monto_total'),
    )
    montos = {
        'total': float(montos_agg['total'] or 0),
        'neto': float(montos_agg['neto'] or 0),
        'iva': float(montos_agg['iva'] or 0),
        'promedio': float(montos_agg['promedio'] or 0),
    }

    return {
        'por_tipo_documento': por_tipo_documento,
        'serie_temporal': serie_temporal,
        'por_tarea_actual': por_tarea_actual,
        'relacion_oc': relacion_oc,
        'duplicados': duplicados,
        'montos': montos,
    }


# =============================================================================
# Enlace FSC ↔ OC ↔ PAC — cruza FormularioFSCDerivado (Dentro PAC) con
# OrdenCompra (TipoOCInterno='Formulario') usando el código embebido en
# NombreOC ("F1-162-26-NAM" = Tipo-Folio-Año-Comprador). Ver diseño completo
# en el plan de implementación (2026-08-28) — puntos clave:
#   - `recalcular_fsc_oc_matching()` es idempotente y NUNCA pisa una fila que
#     un humano ya marcó CONFIRMADO/RECHAZADO/MANUAL (solo toca SUGERIDO o
#     crea filas nuevas).
#   - "Sin match" NO se persiste como fila con orden_compra=NULL (MariaDB
#     trata cada NULL como distinto en un UniqueConstraint, así que eso
#     permitiría filas "sin match" duplicadas en cada recálculo) — se
#     representa por AUSENCIA de filas FscOcLink para ese FormularioFSCDerivado.
#   - Detecta y marca (sin tocar estado/confianza) links "huérfanos" cuya
#     orden_compra ya no existe en la tabla api_ordencompra — puede pasar
#     porque OC_SSO_SERVER.py hace DELETE total + bulk_create en cada sync
#     (ver FscOcLink.orden_compra en models.py para el detalle del FK).
# =============================================================================

_RE_NOMBRE_OC = re.compile(
    r'^\s*F\s*(\d)\s*-\s*(\d+)(?:\s*-\s*(\d{2,4}))?(?:\s*-\s*([A-ZÑ]{2,4}))?',
    re.IGNORECASE,
)


def _parsear_nombre_oc(nombre_oc):
    """Extrae {tipo, folio, anho, comprador_codigo} del NombreOC de una OC de
    tipo 'Formulario' (ej. "F1-299-26-IVO", "F2-100-2026 / ...", "F1-664 Orden
    de Compra..."). `anho`/`comprador_codigo` pueden venir None (formato
    legacy, sin esos segmentos). Devuelve None si ni siquiera calza Tipo+Folio."""
    if not nombre_oc:
        return None
    m = _RE_NOMBRE_OC.match(str(nombre_oc).strip())
    if not m:
        return None
    tipo, folio_s, anho_s, comprador = m.groups()
    anho = None
    if anho_s:
        anho = int(anho_s) if len(anho_s) == 4 else 2000 + int(anho_s)
    return {
        'tipo': int(tipo),
        'folio': int(folio_s),
        'anho': anho,
        'comprador_codigo': comprador.upper() if comprador else None,
    }


def _extraer_tipo_formulario_fsc(fsc):
    m = _RE_TIPO_FORMULARIO.search(fsc.formulario or '')
    return int(m.group(1)) if m else None


def _parse_fecha_fsc(s):
    """fecha_solicitud/fecha_derivado vienen como CharField — normalmente
    'YYYY-MM-DD', pero el origen (Panel SSO) no garantiza formato estricto."""
    if not s:
        return None
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(str(s).strip()[:10], fmt).date()
        except ValueError:
            continue
    return None


def _fecha_derivacion_fsc(fsc):
    """Fecha de referencia para 'este FSC no pudo generar una OC antes de
    esto': `fecha_derivado` si existe (ya derivado a comprador), si no
    `fecha_solicitud` (más temprana, más laxa — mejor eso que no filtrar nada)."""
    return _parse_fecha_fsc(fsc.fecha_derivado) or _parse_fecha_fsc(fsc.fecha_solicitud)


def _oc_no_es_anterior_al_fsc(fecha_ref_fsc, oc, tolerancia_dias=5):
    """Descarta candidatas cronológicamente imposibles: una OC no puede
    emitirse antes de que su FSC se derive a compra. Si falta la fecha en
    cualquiera de los dos lados, NO filtra (mejor un falso positivo ocasional
    que perder una candidata válida por datos incompletos). `tolerancia_dias`
    absorbe ruido de registro (zona horaria, mismo día) sin dejar pasar OC de
    años/meses anteriores — el caso real reportado: sugerir OC 2023-2024 para
    un FSC 2026 solo porque el folio coincidía (formato legacy sin año en
    NombreOC, matching por BAJA_SUGERIDA)."""
    if not fecha_ref_fsc:
        return True
    fecha_oc = oc.get('FechaEnvio') or oc.get('FechaCreacion')
    if not fecha_oc:
        return True
    return (fecha_oc.date() - fecha_ref_fsc).days >= -tolerancia_dias


def _construir_indice_oc_formulario():
    """Indexa OrdenCompra(TipoOCInterno='Formulario') por (tipo,folio,anho) y
    por (tipo,folio) — la segunda para el fallback de formato legacy sin año."""
    idx_full, idx_folio = defaultdict(list), defaultdict(list)
    qs = OrdenCompra.objects.filter(TipoOCInterno='Formulario').values(
        'codigo_oc', 'NombreOC', 'DescripcionOC', 'FechaEnvio', 'FechaCreacion',
        'C_Unidad', 'TotalNeto', 'TotalBruto',
    )
    for oc in qs:
        parsed = _parsear_nombre_oc(oc['NombreOC'])
        if not parsed:
            continue
        oc = {**oc, **parsed}
        if parsed['anho'] is not None:
            idx_full[(parsed['tipo'], parsed['folio'], parsed['anho'])].append(oc)
        idx_folio[(parsed['tipo'], parsed['folio'])].append(oc)
    return idx_full, idx_folio


def _score_similitud_fsc_oc(fsc, oc, comprador_lookup=None):
    """Combina 5 señales (0..1 cada una) para rankear candidatas de formato
    legacy (solo Tipo+Folio, sin año que desambigüe). Devuelve
    (score_total, detalle_dict) — el detalle se persiste en criterios_match
    para que el panel de revisión muestre POR QUÉ se sugiere cada candidata.

    Caso frecuente que motiva la señal de comprador: OC tipo "F1-385-IVO/..."
    NO trae año (cae en el fallback solo-folio) pero SÍ trae el código de
    comprador — sin esta señal, esa candidata (folio+comprador exactos) rankeaba
    igual de bajo que una coincidencia de folio puramente casual entre años.
    """
    comprador_lookup = comprador_lookup or {}
    detalle = {}

    # Fecha: la OC debería emitirse en/después de la solicitud del FSC, idealmente
    # dentro de los ~6 meses siguientes.
    fecha_fsc = _parse_fecha_fsc(fsc.fecha_derivado) or _parse_fecha_fsc(fsc.fecha_solicitud)
    fecha_oc = oc['FechaEnvio'] or oc['FechaCreacion']
    if fecha_fsc and fecha_oc:
        delta_dias = (fecha_oc.date() - fecha_fsc).days
        if delta_dias < 0:
            score_fecha = max(0.0, 1 + delta_dias / 30)
        else:
            score_fecha = max(0.0, 1 - delta_dias / 180)
        detalle['fecha'] = {'delta_dias': delta_dias, 'score': round(score_fecha, 2)}
    else:
        score_fecha = 0.3
        detalle['fecha'] = {'delta_dias': None, 'score': score_fecha}

    # Unidad/comprador: unidad_requirente del FSC contra C_Unidad de la OC (texto libre).
    u_fsc = _normalizar_texto_pac(fsc.unidad_requirente)
    u_oc = _normalizar_texto_pac(oc['C_Unidad'])
    if u_fsc and u_oc:
        score_unidad = SequenceMatcher(None, u_fsc, u_oc).ratio()
    else:
        score_unidad = 0.3
    detalle['unidad'] = {'score': round(score_unidad, 2)}

    # Monto: fsc.monto_estimado vs TotalBruto/TotalNeto de la OC.
    monto_fsc = fsc.monto_estimado
    monto_oc = oc['TotalBruto'] if oc['TotalBruto'] is not None else oc['TotalNeto']
    if monto_fsc and monto_oc:
        diff_rel = abs(float(monto_oc) - float(monto_fsc)) / max(float(monto_fsc), 1.0)
        score_monto = max(0.0, 1 - diff_rel)
    else:
        score_monto = 0.3
    detalle['monto'] = {'score': round(score_monto, 2)}

    # Texto: objetivo_compra/requerimiento del FSC vs NombreOC+DescripcionOC.
    txt_fsc = _normalizar_texto_pac(fsc.objetivo_compra or fsc.requerimiento or '')
    txt_oc = _normalizar_texto_pac(f"{oc['NombreOC'] or ''} {oc['DescripcionOC'] or ''}")
    if txt_fsc and txt_oc:
        score_texto = SequenceMatcher(None, txt_fsc[:500], txt_oc[:500]).ratio()
    else:
        score_texto = 0.3
    detalle['texto'] = {'score': round(score_texto, 2)}

    # Comprador: código embebido en NombreOC (ej. "-IVO") contra el nombre
    # completo del comprador del FSC, vía el catálogo CompradorInicial.
    comprador_fsc_norm = _normalizar_texto_pac(fsc.comprador)
    if oc.get('comprador_codigo') and comprador_fsc_norm:
        nombre_comprador_oc = comprador_lookup.get(oc['comprador_codigo'])
        if nombre_comprador_oc is None:
            score_comprador = 0.3  # código presente pero no está en el catálogo (¿comprador nuevo?)
        elif nombre_comprador_oc == comprador_fsc_norm:
            score_comprador = 1.0
        else:
            score_comprador = 0.0  # código presente y NO coincide — señal negativa fuerte
    else:
        score_comprador = 0.4  # sin código en la OC — ausencia no es evidencia en contra
    detalle['comprador'] = {'score': round(score_comprador, 2)}

    score_total = round(
        0.20 * score_fecha + 0.15 * score_unidad + 0.25 * score_monto
        + 0.15 * score_texto + 0.25 * score_comprador, 3
    )
    return score_total, detalle


def _upsert_fsc_oc_links(fsc, candidatos, confianza, estado_nuevo, criterios_extra_fn=None):
    """Crea/actualiza FscOcLink para cada candidata SIN tocar filas que un
    humano ya resolvió (estado != SUGERIDO). Devuelve cuántas filas tocó."""
    tocadas = 0
    for oc in candidatos:
        existente = FscOcLink.objects.filter(
            formulario_derivado=fsc, orden_compra_id=oc['codigo_oc']
        ).first()
        if existente and existente.estado != FscOcLink.SUGERIDO:
            continue

        criterios = {'tipo': oc['tipo'], 'folio': oc['folio'], 'anho_oc': oc.get('anho')}
        score = None
        if criterios_extra_fn:
            score, detalle = criterios_extra_fn(oc)
            criterios['similitud'] = detalle

        defaults = {
            'confianza': confianza,
            'score_similitud': score,
            'criterios_match': criterios,
        }
        if existente:
            for k, v in defaults.items():
                setattr(existente, k, v)
            existente.save(update_fields=list(defaults.keys()) + ['actualizado_en'])
        else:
            FscOcLink.objects.create(
                formulario_derivado=fsc, orden_compra_id=oc['codigo_oc'],
                estado=estado_nuevo, **defaults,
            )
        tocadas += 1
    return tocadas


def recalcular_fsc_oc_matching(anhos=None, _avisar=None):
    """Recalcula el enlace FSC↔OC para todos los FormularioFSCDerivado
    Dentro-PAC (o solo los años en `anhos` si se pasa). Idempotente y seguro
    de llamar en cada sync de OC o de FSC — ver cabecera de sección para las
    reglas de no-pisar-decisiones-humanas y el manejo de "sin match"/huérfanos.
    """
    _avisar = _avisar or (lambda **kw: None)
    from django.db import close_old_connections
    close_old_connections()

    idx_full, idx_folio = _construir_indice_oc_formulario()
    comprador_lookup = {
        ci.codigo.upper(): _normalizar_texto_pac(ci.usuario.first_name)
        for ci in CompradorInicial.objects.select_related('usuario')
    }
    codigos_oc_validos = set(OrdenCompra.objects.values_list('codigo_oc', flat=True))

    qs = FormularioFSCDerivado.objects.filter(dentro_fuera_pac=FormularioFSCDerivado.DENTRO)
    if anhos:
        qs = qs.filter(anho__in=anhos)

    stats = {'evaluados': 0, 'alta': 0, 'alta_oc': 0, 'media': 0, 'baja': 0, 'sin_match': 0, 'sin_clave': 0}

    for fsc in qs.iterator(chunk_size=200):
        stats['evaluados'] += 1
        tipo = _extraer_tipo_formulario_fsc(fsc)
        if tipo is None or not fsc.folio or not fsc.anho:
            stats['sin_clave'] += 1
            continue

        fecha_ref_fsc = _fecha_derivacion_fsc(fsc)
        candidatos_mismo_periodo = [
            oc for oc in idx_full.get((tipo, fsc.folio, fsc.anho), [])
            if _oc_no_es_anterior_al_fsc(fecha_ref_fsc, oc)
        ]
        comprador_fsc_norm = _normalizar_texto_pac(fsc.comprador)
        # Un FSC puede tener varias OC legítimas (varios procesos de compra —
        # ej. despacho parcial, proveedores distintos). Cada candidata que
        # calza Tipo+Folio+Año+Comprador se confirma de forma INDEPENDIENTE,
        # no solo cuando hay una única coincidencia — antes `len(...) == 1`
        # degradaba a MEDIA/SUGERIDO el caso de 2+ OC igualmente válidas.
        candidatos_alta = [
            oc for oc in candidatos_mismo_periodo
            if comprador_fsc_norm and oc['comprador_codigo']
            and comprador_lookup.get(oc['comprador_codigo']) == comprador_fsc_norm
        ]
        codigos_alta = {oc['codigo_oc'] for oc in candidatos_alta}
        candidatos_media = [oc for oc in candidatos_mismo_periodo if oc['codigo_oc'] not in codigos_alta]

        tocado = False
        codigos_candidatos_validos = set()
        if candidatos_alta:
            _upsert_fsc_oc_links(fsc, candidatos_alta, FscOcLink.ALTA, FscOcLink.CONFIRMADO)
            stats['alta'] += 1
            stats['alta_oc'] += len(candidatos_alta)
            codigos_candidatos_validos |= {oc['codigo_oc'] for oc in candidatos_alta}
            tocado = True
        if candidatos_media:
            _upsert_fsc_oc_links(fsc, candidatos_media, FscOcLink.MEDIA, FscOcLink.SUGERIDO)
            stats['media'] += 1
            codigos_candidatos_validos |= {oc['codigo_oc'] for oc in candidatos_media}
            tocado = True

        if not tocado:
            candidatos_baja = [
                oc for oc in idx_folio.get((tipo, fsc.folio), [])
                if _oc_no_es_anterior_al_fsc(fecha_ref_fsc, oc)
            ][:10]
            if candidatos_baja:
                _upsert_fsc_oc_links(
                    fsc, candidatos_baja, FscOcLink.BAJA_SUGERIDA, FscOcLink.SUGERIDO,
                    criterios_extra_fn=lambda oc: _score_similitud_fsc_oc(fsc, oc, comprador_lookup),
                )
                stats['baja'] += 1
                codigos_candidatos_validos |= {oc['codigo_oc'] for oc in candidatos_baja}
            else:
                stats['sin_match'] += 1

        # Limpieza de sugerencias obsoletas: un link SUGERIDO (nunca CONFIRMADO/
        # RECHAZADO/MANUAL — esos son decisión humana, jamás se tocan) que ya no
        # aparece entre las candidatas válidas de esta corrida se borra. Es lo
        # que permite que el filtro de fecha (`_oc_no_es_anterior_al_fsc`) surta
        # efecto sobre sugerencias creadas en corridas anteriores, y en general
        # mantiene la cola de revisión libre de sugerencias que ya no califican
        # (ej. la OC cambió de fecha en un sync, o el criterio de matching cambió).
        FscOcLink.objects.filter(
            formulario_derivado=fsc, estado=FscOcLink.SUGERIDO,
        ).exclude(orden_compra_id__in=codigos_candidatos_validos).delete()

    # Huérfanos: links (cualquier estado) cuya OC ya no existe en la tabla
    # actual — solo se marca/desmarca en criterios_match, NUNCA se toca
    # estado/confianza. Se revisan TODOS los links con orden_compra (no solo
    # los recién detectados) para poder desmarcar el flag si la OC reaparece
    # en un sync posterior (mismo codigo_oc recreado por el ETL).
    huerfanos = 0
    for link in FscOcLink.objects.exclude(orden_compra_id__isnull=True):
        es_huerfano = link.orden_compra_id not in codigos_oc_validos
        criterios = dict(link.criterios_match or {})
        if bool(criterios.get('huerfano')) == es_huerfano:
            continue
        if es_huerfano:
            criterios['huerfano'] = True
        else:
            criterios.pop('huerfano', None)
        link.criterios_match = criterios
        link.save(update_fields=['criterios_match', 'actualizado_en'])
        if es_huerfano:
            huerfanos += 1

    _avisar(log=(
        f"Enlace FSC-OC: {stats['evaluados']} FSC Dentro-PAC evaluados — "
        f"{stats['alta']} Alta ({stats['alta_oc']} OC confirmadas — puede haber varias por FSC), "
        f"{stats['media']} Media, {stats['baja']} Baja-sugerida, "
        f"{stats['sin_match']} sin candidata, {stats['sin_clave']} sin folio/año/tipo válido, "
        f"{huerfanos} links huérfanos detectados (OC ya no existe)."
    ))
    return {**stats, 'huerfanos': huerfanos}


def _estado_enlace_fsc(links):
    """Reduce la lista de FscOcLink de un FSC a un único estado agregado
    para KPIs/pivote/tabla. Prioridad: CONFIRMADO > MEDIA/ALTA pendiente >
    BAJA pendiente > RECHAZADO (todas) > SIN_MATCH (sin filas)."""
    if not links:
        return 'SIN_MATCH'
    if any(l.estado == FscOcLink.CONFIRMADO for l in links):
        return 'CONFIRMADO'
    pendientes = [l for l in links if l.estado == FscOcLink.SUGERIDO]
    if any(l.confianza in (FscOcLink.ALTA, FscOcLink.MEDIA) for l in pendientes):
        return 'PENDIENTE_MEDIA'
    if pendientes:
        return 'PENDIENTE_BAJA'
    return 'RECHAZADO_TOTAL'


def _pac_match_estado(id_plan_fsc, oc, overrides):
    """Compara el PAC que declara el FSC (`id_plan`) contra el PAC real de la
    OC — override manual (`OcPacOverride`) primero, si no existe cae a
    `OrdenCompra.EnlacePAC`/`ID_Proyecto` (recalculados desde CSV en cada sync,
    ver `OcPacOverride` en models.py). `oc` es un dict con al menos
    `codigo_oc`/`EnlacePAC`/`ID_Proyecto`, o None si no hay OC que comparar."""
    if not oc:
        return None
    id_proyecto_real = overrides.get(oc['codigo_oc'])
    if id_proyecto_real is None:
        if oc.get('EnlacePAC') != 'Enlazada' or not oc.get('ID_Proyecto'):
            return 'SIN_PAC'
        id_proyecto_real = oc['ID_Proyecto']
    if not id_plan_fsc:
        return None
    return 'PAC_OK' if id_proyecto_real == id_plan_fsc else 'PAC_DISTINTO'


def _mapa_overrides_pac():
    return dict(OcPacOverride.objects.values_list('orden_compra_id', 'id_proyecto_correcto'))


def _mapa_nombres_pac():
    """id_proyecto → nombre_proyecto, para mostrar junto al ID (más rápido de
    buscar en Mercado Público que solo el código). PacProyectoMaestro primero
    (histórico multi-año), PlanerPAC pisa con el nombre del plan vigente si
    también existe ahí — mismas dos fuentes que usa `_clasificar_dentro_fuera_pac`
    para decidir Dentro/Fuera, así el nombre siempre está disponible cuando el
    ID también lo está."""
    mapa = {}
    for id_proyecto, nombre in PacProyectoMaestro.objects.exclude(nombre_proyecto__isnull=True).exclude(nombre_proyecto='').values_list('id_proyecto', 'nombre_proyecto'):
        mapa.setdefault(id_proyecto, nombre)
    for id_proyecto, nombre in PlanerPAC.objects.exclude(nombre_proyecto__isnull=True).exclude(nombre_proyecto='').values_list('id_proyecto', 'nombre_proyecto'):
        mapa[id_proyecto] = nombre
    return mapa


def calcular_fsc_oc_resumen(anho=None):
    """KPIs globales del módulo Enlace FSC-OC-PAC: % enlazado por estado,
    evolución por año, distribución por confianza, y — entre los CONFIRMADO —
    cuántas OC tienen realmente el PAC que declara su FSC. Cache 5 min en la vista."""
    qs = FormularioFSCDerivado.objects.filter(dentro_fuera_pac=FormularioFSCDerivado.DENTRO)
    if anho:
        qs = qs.filter(anho=anho)

    fsc_ids = list(qs.values_list('id', flat=True))
    links_por_fsc = defaultdict(list)
    for link in FscOcLink.objects.filter(formulario_derivado_id__in=fsc_ids).select_related(None):
        links_por_fsc[link.formulario_derivado_id].append(link)

    conteo = defaultdict(int)
    por_anho = defaultdict(lambda: defaultdict(int))
    anho_por_id = dict(qs.values_list('id', 'anho'))
    id_plan_por_id = dict(qs.values_list('id', 'id_plan'))
    for fid in fsc_ids:
        estado = _estado_enlace_fsc(links_por_fsc.get(fid, []))
        conteo[estado] += 1
        por_anho[anho_por_id[fid]][estado] += 1

    total = len(fsc_ids)

    # PAC en confirmados: solo tiene sentido para FSC con link CONFIRMADO.
    overrides = _mapa_overrides_pac()
    codigos_confirmados = [
        l.orden_compra_id for links in links_por_fsc.values() for l in links
        if l.estado == FscOcLink.CONFIRMADO
    ]
    ocs_por_codigo = {
        oc['codigo_oc']: oc for oc in
        OrdenCompra.objects.filter(codigo_oc__in=codigos_confirmados)
        .values('codigo_oc', 'EnlacePAC', 'ID_Proyecto')
    }
    # Cuenta por OC confirmada, no por FSC — un FSC con 2 OC confirmadas aporta
    # 2 al total (cada proceso de compra se evalúa por separado).
    pac_conteo = defaultdict(int)
    for fid, links in links_por_fsc.items():
        for confirmado in (l for l in links if l.estado == FscOcLink.CONFIRMADO):
            oc = ocs_por_codigo.get(confirmado.orden_compra_id)
            estado_pac = _pac_match_estado(id_plan_por_id.get(fid), oc, overrides) or 'SIN_PAC'
            pac_conteo[estado_pac] += 1
    total_confirmados = sum(pac_conteo.values())

    return {
        'kpis': {
            'total_dentro_pac': total,
            'confirmado': conteo['CONFIRMADO'],
            'pendiente_media': conteo['PENDIENTE_MEDIA'],
            'pendiente_baja': conteo['PENDIENTE_BAJA'],
            'rechazado_total': conteo['RECHAZADO_TOTAL'],
            'sin_match': conteo['SIN_MATCH'],
            'pct_enlazado': round(100 * conteo['CONFIRMADO'] / total, 1) if total else 0.0,
        },
        'pac_en_confirmados': {
            # 'total' cuenta OC confirmadas, no FSC — puede ser mayor que
            # kpis.confirmado (que cuenta FSC con al menos una OC confirmada)
            # si algún FSC tiene varias OC confirmadas a la vez.
            'total': total_confirmados,
            'pac_ok': pac_conteo['PAC_OK'],
            'sin_pac': pac_conteo['SIN_PAC'],
            'pac_distinto': pac_conteo['PAC_DISTINTO'],
            'pct_ok': round(100 * pac_conteo['PAC_OK'] / total_confirmados, 1) if total_confirmados else 0.0,
        },
        'por_anho': [
            {'anho': a, **{k: v for k, v in d.items()}}
            for a, d in sorted(por_anho.items())
        ],
    }


def calcular_fsc_oc_pendientes(anho=None):
    """Cola de revisión del tab 'Revisión Pendientes', con dos secciones:
    - `enlace_pendiente`: FSC Dentro-PAC con candidatas SUGERIDO por resolver
      (confirmar/rechazar/enlazar a mano) — incluye FSC que YA tienen una o
      más OC confirmada, siempre que queden candidatas sin decidir: un FSC
      puede generar varios procesos de compra (varias OC legítimas a la vez),
      así que "ya tiene una confirmada" no significa "no hay nada más que
      revisar" — `n_confirmadas` en cada fila indica cuántas ya están OK.
    - `pac_pendiente`: una fila POR CADA OC confirmada cuyo PAC no calza con
      lo que el FSC declara (SIN_PAC o PAC_DISTINTO) — un mismo FSC puede
      aparecer más de una vez aquí si tiene varias OC confirmadas con
      problemas de PAC distintos.
    """
    qs = FormularioFSCDerivado.objects.filter(
        dentro_fuera_pac=FormularioFSCDerivado.DENTRO
    ).select_related('sso_departamento')
    if anho:
        qs = qs.filter(anho=anho)

    fsc_ids = list(qs.values_list('id', flat=True))
    links = (
        FscOcLink.objects.filter(formulario_derivado_id__in=fsc_ids)
        .select_related('orden_compra')
        .order_by('-score_similitud')
    )
    links_por_fsc = defaultdict(list)
    for link in links:
        links_por_fsc[link.formulario_derivado_id].append(link)

    overrides = _mapa_overrides_pac()
    nombres_pac = _mapa_nombres_pac()

    enlace_pendiente = []
    pac_pendiente = []
    for fsc in qs:
        fsc_links = links_por_fsc.get(fsc.id, [])
        confirmadas = [l for l in fsc_links if l.estado == FscOcLink.CONFIRMADO]
        sugeridas = [l for l in fsc_links if l.estado == FscOcLink.SUGERIDO]

        if sugeridas:
            enlace_pendiente.append({
                'id': fsc.id,
                'id_formulario': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario),
                'folio': fsc.folio, 'anho': fsc.anho,
                'unidad_requirente': fsc.unidad_requirente,
                'comprador': fsc.comprador,
                'monto_estimado': fsc.monto_estimado,
                'departamento': fsc.sso_departamento.descripcion if fsc.sso_departamento else None,
                'estado_enlace': _estado_enlace_fsc(fsc_links),
                'n_confirmadas': len(confirmadas),
                'candidatas': [
                    {
                        'link_id': l.id,
                        'codigo_oc': l.orden_compra_id,
                        'nombre_oc': l.orden_compra.NombreOC if l.orden_compra else None,
                        'total_bruto': float(l.orden_compra.TotalBruto) if l.orden_compra and l.orden_compra.TotalBruto else None,
                        'confianza': l.confianza,
                        'estado': l.estado,
                        'score_similitud': l.score_similitud,
                        'criterios_match': l.criterios_match,
                        'estado_pac': _pac_match_estado(
                            fsc.id_plan,
                            {'codigo_oc': l.orden_compra_id, 'EnlacePAC': l.orden_compra.EnlacePAC, 'ID_Proyecto': l.orden_compra.ID_Proyecto} if l.orden_compra else None,
                            overrides,
                        ),
                    }
                    for l in fsc_links
                ],
            })

        for confirmado in confirmadas:
            oc = confirmado.orden_compra
            oc_dict = {'codigo_oc': oc.codigo_oc, 'EnlacePAC': oc.EnlacePAC, 'ID_Proyecto': oc.ID_Proyecto} if oc else None
            estado_pac = _pac_match_estado(fsc.id_plan, oc_dict, overrides)
            if estado_pac in ('SIN_PAC', 'PAC_DISTINTO'):
                pac_pendiente.append({
                    'id': fsc.id,
                    'id_formulario': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario),
                    'folio': fsc.folio, 'anho': fsc.anho,
                    'unidad_requirente': fsc.unidad_requirente,
                    'id_plan_fsc': fsc.id_plan,
                    'nombre_pac_fsc': nombres_pac.get(fsc.id_plan),
                    'link_id': confirmado.id,
                    'codigo_oc': oc.codigo_oc if oc else None,
                    'nombre_oc': oc.NombreOC if oc else None,
                    'id_proyecto_oc': oc.ID_Proyecto if oc else None,
                    'enlace_pac_oc': oc.EnlacePAC if oc else None,
                    'estado_pac': estado_pac,
                })

    return {'enlace_pendiente': enlace_pendiente, 'pac_pendiente': pac_pendiente}


def calcular_fsc_oc_pivote(anho=None):
    """Pivote Subdirección → Departamento con conteo por estado de enlace,
    reutilizando `_mapa_departamentos`/`_resolver_depto_raiz` del módulo PAC
    Cumplimiento (misma jerarquía, mismo criterio de rollup a depto raíz)."""
    qs = FormularioFSCDerivado.objects.filter(
        dentro_fuera_pac=FormularioFSCDerivado.DENTRO
    ).select_related('sso_departamento')
    if anho:
        qs = qs.filter(anho=anho)

    fsc_ids = list(qs.values_list('id', flat=True))
    links_por_fsc = defaultdict(list)
    for link in FscOcLink.objects.filter(formulario_derivado_id__in=fsc_ids):
        links_por_fsc[link.formulario_derivado_id].append(link)

    mapa_deptos = _mapa_departamentos()
    nodos = defaultdict(lambda: defaultdict(int))
    for fsc in qs:
        estado = _estado_enlace_fsc(links_por_fsc.get(fsc.id, []))
        if fsc.sso_departamento_id:
            depto_raiz_id = _resolver_depto_raiz(fsc.sso_departamento_id, mapa_deptos)
            nodo_raiz = mapa_deptos.get(depto_raiz_id)
            clave = nodo_raiz['descripcion'] if nodo_raiz else fsc.sso_departamento.descripcion
        else:
            clave = 'Sin Clasificar'
        nodos[clave][estado] += 1
        nodos[clave]['total'] += 1

    return [{'departamento': k, **v} for k, v in sorted(nodos.items())]


def calcular_fsc_oc_compraagil_resumen(anho=None):
    """Reporte (solo lectura, sin revisión manual) del enlace ya existente
    OC↔CompraAgilResumen vía OrdenCompra.CodigoCompraAgil — ese campo ya lo
    puebla el ETL (`_extraer_codigo_ca()` en OC_SSO_SERVER.py), acá solo se
    mide cobertura."""
    qs = OrdenCompra.objects.filter(TipoOC='AG')
    if anho:
        qs = qs.filter(FechaEnvio__year=anho)

    total = qs.count()
    con_codigo = qs.exclude(CodigoCompraAgil__isnull=True).exclude(CodigoCompraAgil='').count()
    codigos_ca_validos = set(CompraAgilResumen.objects.values_list('codigocompraagil', flat=True))
    codigos_oc = set(
        qs.exclude(CodigoCompraAgil__isnull=True).exclude(CodigoCompraAgil='')
        .values_list('CodigoCompraAgil', flat=True)
    )
    enlazadas_validas = len(codigos_oc & codigos_ca_validos)

    return {
        'kpis': {
            'total_oc_agil': total,
            'con_codigo_ca': con_codigo,
            'enlazadas_a_ca_existente': enlazadas_validas,
            'pct_enlazado': round(100 * enlazadas_validas / total, 1) if total else 0.0,
        },
        'detalle': list(
            qs.exclude(CodigoCompraAgil__isnull=True).exclude(CodigoCompraAgil='')
            .values('codigo_oc', 'NombreOC', 'CodigoCompraAgil', 'FechaEnvio', 'TotalBruto')[:500]
        ),
    }


def confirmar_fsc_oc_link(link_id, usuario):
    """Confirma una candidata SUGERIDO. Un FSC PUEDE tener varias OC
    CONFIRMADO a la vez — un mismo FSC puede derivar en varios procesos de
    compra (despacho parcial, proveedores distintos, etc.), así que confirmar
    una candidata NO rechaza las demás del mismo formulario; cada una se
    revisa y decide por separado (confirmar otra más, o rechazarla)."""
    from django.utils import timezone
    link = FscOcLink.objects.select_related('formulario_derivado').get(pk=link_id)
    link.estado = FscOcLink.CONFIRMADO
    link.revisado_por = usuario
    link.fecha_revision = timezone.now()
    link.save(update_fields=['estado', 'revisado_por', 'fecha_revision', 'actualizado_en'])
    return link


def rechazar_fsc_oc_link(link_id, usuario, motivo=''):
    from django.utils import timezone
    link = FscOcLink.objects.get(pk=link_id)
    link.estado = FscOcLink.RECHAZADO
    link.motivo_rechazo = motivo or ''
    link.revisado_por = usuario
    link.fecha_revision = timezone.now()
    link.save(update_fields=['estado', 'motivo_rechazo', 'revisado_por', 'fecha_revision', 'actualizado_en'])
    return link


def enlazar_fsc_oc_manual(formulario_derivado_id, codigo_oc, usuario, observaciones=''):
    """Enlace a mano — sobre todo para el formato legacy sin año/comprador
    confiable, o para agregar una OC adicional a un FSC que ya tiene otra(s)
    confirmada(s) (varios procesos de compra). Valida que la OC exista y
    confirma directo; NO toca otras candidatas del mismo FSC — cada una se
    revisa por separado."""
    if not OrdenCompra.objects.filter(codigo_oc=codigo_oc).exists():
        raise ValueError(f"La OC {codigo_oc} no existe en el sistema.")

    from django.utils import timezone
    link, _creado = FscOcLink.objects.update_or_create(
        formulario_derivado_id=formulario_derivado_id, orden_compra_id=codigo_oc,
        defaults={
            'confianza': FscOcLink.MANUAL, 'estado': FscOcLink.CONFIRMADO,
            'observaciones': observaciones or '', 'revisado_por': usuario, 'fecha_revision': timezone.now(),
        },
    )
    return link


def corregir_oc_pac(codigo_oc, formulario_derivado_id, usuario, observaciones=''):
    """Corrige el PAC real de una OC usando el `id_plan` declarado por el FSC
    que se le confirmó — crea/actualiza el `OcPacOverride` (ver models.py para
    por qué NO se escribe en `OrdenCompra.ID_Proyecto` directamente)."""
    fsc = FormularioFSCDerivado.objects.get(pk=formulario_derivado_id)
    if not fsc.id_plan:
        raise ValueError('Este FSC no declara ningún PAC (id_plan vacío) — nada que copiar a la OC.')
    if not OrdenCompra.objects.filter(codigo_oc=codigo_oc).exists():
        raise ValueError(f'La OC {codigo_oc} no existe en el sistema.')

    override, _creado = OcPacOverride.objects.update_or_create(
        orden_compra_id=codigo_oc,
        defaults={
            'id_proyecto_correcto': fsc.id_plan,
            'formulario_derivado': fsc,
            'observaciones': observaciones or '',
            'creado_por': usuario,
        },
    )
    return override


def calcular_fsc_oc_detalle_fsc(fsc_id):
    """Detalle completo de un FormularioFSCDerivado para el modal 'Ver' del
    tab Enlace FSC-OC-PAC — mismas 8 secciones que `ModalDocumento` en
    Formularios FSC (identificación/solicitante/nombre/objetivo/especificaciones/
    plan de compras/adjuntos/carro), más los enlaces OC y su estado PAC."""
    fsc = FormularioFSCDerivado.objects.select_related('sso_departamento').get(pk=fsc_id)
    tipo_formulario = _extraer_tipo_formulario_fsc(fsc)

    productos = list(FormularioFSCProducto.objects.filter(
        folio=fsc.folio, anho=fsc.anho, tipo_formulario=tipo_formulario,
    ).values('categoria', 'producto', 'descripcion', 'cantidad', 'monto', 'item_presupuestario'))

    overrides = _mapa_overrides_pac()
    nombre_plan = _mapa_nombres_pac().get(fsc.id_plan)
    enlaces = []
    for link in FscOcLink.objects.filter(formulario_derivado=fsc).select_related('orden_compra').order_by('-estado', '-score_similitud'):
        oc = link.orden_compra
        oc_dict = {'codigo_oc': oc.codigo_oc, 'EnlacePAC': oc.EnlacePAC, 'ID_Proyecto': oc.ID_Proyecto} if oc else None
        enlaces.append({
            'link_id': link.id, 'codigo_oc': link.orden_compra_id,
            'nombre_oc': oc.NombreOC if oc else None,
            'confianza': link.confianza, 'estado': link.estado,
            'estado_pac': _pac_match_estado(fsc.id_plan, oc_dict, overrides),
        })

    return {
        'id': fsc.id,
        'id_formulario': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario),
        'folio': fsc.folio, 'anho': fsc.anho, 'formulario': fsc.formulario,
        'fecha_solicitud': fsc.fecha_solicitud, 'fecha_entrega': fsc.fecha_entrega,
        'fecha_derivado': fsc.fecha_derivado, 'estado': fsc.estado, 'estado_compra': fsc.estado_compra,
        'unidad_requirente': fsc.unidad_requirente, 'usuario_requirente': fsc.usuario_requirente,
        'anexo': fsc.anexo, 'correo': fsc.correo, 'encargado': fsc.encargado, 'jefe': fsc.jefe,
        'comprador': fsc.comprador,
        'requerimiento': fsc.requerimiento,
        'objetivo_compra': fsc.objetivo_compra,
        'especificaciones_tecnicas': fsc.especificaciones_tecnicas,
        'monto_estimado': fsc.monto_estimado, 'moneda': fsc.moneda, 'tipo_monto': fsc.tipo_monto,
        'plan_anual': fsc.plan_anual, 'id_plan': fsc.id_plan, 'nombre_plan': nombre_plan,
        'justificacion': fsc.justificacion,
        'validacion_tecnica': fsc.validacion_tecnica, 'unidad_validadora': fsc.unidad_validadora,
        'justificacion_no_validacion': fsc.justificacion_no_validacion,
        'fuente_financiamiento': fsc.fuente_financiamiento,
        'item_presupuestario': fsc.item_presupuestario, 'folio_requerimiento': fsc.folio_requerimiento,
        'adj_espec_tecnicas': fsc.adj_espec_tecnicas, 'adj_cotizacion': fsc.adj_cotizacion,
        'adj_validacion': fsc.adj_validacion, 'adj_form_justificacion': fsc.adj_form_justificacion,
        'departamento': fsc.sso_departamento.descripcion if fsc.sso_departamento else None,
        'dentro_fuera_pac': fsc.dentro_fuera_pac,
        'productos': productos,
        'enlaces_oc': enlaces,
    }


def calcular_fsc_oc_detalle_oc(codigo_oc):
    """Detalle completo de una OrdenCompra para el modal 'Ver' del tab Enlace
    FSC-OC-PAC — cabecera + líneas de detalle + estado PAC (con override si
    existe) + el/los FSC enlazados a esta OC."""
    oc = OrdenCompra.objects.get(pk=codigo_oc)
    detalle = list(oc.detalles.values(
        'CodigoProducto', 'Producto', 'Categoria', 'Cantidad', 'Unidad', 'PrecioNeto', 'TotalLinea',
    ))

    overrides = _mapa_overrides_pac()
    nombres_pac = _mapa_nombres_pac()
    oc_dict = {'codigo_oc': oc.codigo_oc, 'EnlacePAC': oc.EnlacePAC, 'ID_Proyecto': oc.ID_Proyecto}
    override = OcPacOverride.objects.filter(pk=codigo_oc).first()

    enlaces_fsc = []
    for link in FscOcLink.objects.filter(orden_compra_id=codigo_oc).select_related('formulario_derivado'):
        fsc = link.formulario_derivado
        enlaces_fsc.append({
            'link_id': link.id, 'formulario_derivado_id': fsc.id,
            'id_formulario': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario),
            'id_plan_fsc': fsc.id_plan,
            'nombre_pac_fsc': nombres_pac.get(fsc.id_plan),
            'confianza': link.confianza, 'estado': link.estado,
            'estado_pac': _pac_match_estado(fsc.id_plan, oc_dict, overrides),
        })

    return {
        'codigo_oc': oc.codigo_oc, 'nombre_oc': oc.NombreOC, 'descripcion_oc': oc.DescripcionOC,
        'estado_oc': oc.EstadoOC, 'tipo_oc': oc.TipoOC, 'descripcion_tipo_oc': oc.DescripcionTipoOC,
        'tipo_oc_interno': oc.TipoOCInterno, 'codigo_licitacion': oc.CodigoLicitacion,
        'codigo_compra_agil': oc.CodigoCompraAgil,
        'fecha_creacion': oc.FechaCreacion, 'fecha_envio': oc.FechaEnvio, 'fecha_aceptacion': oc.FechaAceptacion,
        'total_neto': float(oc.TotalNeto) if oc.TotalNeto is not None else None,
        'total_bruto': float(oc.TotalBruto) if oc.TotalBruto is not None else None,
        'unidad_compradora': oc.C_Unidad, 'proveedor': oc.P_Nombre, 'rut_proveedor': oc.P_Rut,
        'enlace_pac': oc.EnlacePAC, 'id_proyecto': oc.ID_Proyecto, 'nombre_proyecto': oc.Nombre_Proyecto,
        'id_proyecto_override': override.id_proyecto_correcto if override else None,
        'link_mp': oc.LinkMP,
        'detalle_productos': detalle,
        'enlaces_fsc': enlaces_fsc,
    }


def calcular_oc_pac_corregidas():
    """Registro de todo lo enlazado manualmente vía Formularios FSC
    (`OcPacOverride`) — mismo espíritu que `SubtabCorregidas` del tab 'OC
    Corregibles' (`OrdenesCompraResumen.jsx`): lista + KPIs de
    sincronizadas/esperando_sync. 'Sincronizada' = el próximo sync de OC ya
    volvió a matchear esa OC en `OCPAC_Maestro.csv` (`OrdenCompra.ID_Proyecto`
    coincide con la corrección) — igual criterio que usa `corregidas` dentro
    de `calcular_oc_stats()` para `RevisionOCCorregible`, pero contra
    `OcPacOverride`."""
    overrides = list(
        OcPacOverride.objects.select_related('formulario_derivado', 'creado_por').all()
    )
    codigos = [o.orden_compra_id for o in overrides]
    ocs = {
        oc['codigo_oc']: oc for oc in
        OrdenCompra.objects.filter(codigo_oc__in=codigos)
        .values('codigo_oc', 'NombreOC', 'ID_Proyecto', 'EnlacePAC', 'TotalBruto')
    }
    nombres_pac = _mapa_nombres_pac()

    filas = []
    sincronizadas = 0
    monto_regularizado = 0
    for o in overrides:
        oc = ocs.get(o.orden_compra_id)
        sync = bool(oc and oc['EnlacePAC'] == 'Enlazada' and oc['ID_Proyecto'] == o.id_proyecto_correcto)
        if sync:
            sincronizadas += 1
        if oc and oc['TotalBruto']:
            monto_regularizado += float(oc['TotalBruto'])
        fsc = o.formulario_derivado
        filas.append({
            'codigo_oc': o.orden_compra_id,
            'nombre_oc': oc['NombreOC'] if oc else None,
            'id_proyecto_correcto': o.id_proyecto_correcto,
            'nombre_proyecto': nombres_pac.get(o.id_proyecto_correcto),
            'id_formulario_origen': generar_id_formulario(fsc.folio, fsc.anho, formulario_texto=fsc.formulario) if fsc else None,
            'formulario_derivado_id': fsc.id if fsc else None,
            'observaciones': o.observaciones,
            'creado_por': o.creado_por.get_full_name() or o.creado_por.username if o.creado_por else None,
            'creado_en': o.creado_en,
            'sincronizada': sync,
        })

    total = len(overrides)
    return {
        'kpis': {
            'total_corregidas': total,
            'sincronizadas': sincronizadas,
            'esperando_sync': total - sincronizadas,
            'monto_regularizado': monto_regularizado,
        },
        'filas': filas,
    }


def calcular_fsc_oc_impacto():
    """Reporte combinado: cuánto está subiendo el indicador de enlace OC↔PAC
    gracias a las DOS vías de corrección manual que conviven en el sistema —
    Licitación (`RevisionOCCorregible`, tab 'OC Corregibles' en
    /ordenes-compra) y Formularios FSC (`OcPacOverride`, este módulo).
    Recalcula la agregación de `RevisionOCCorregible` de forma independiente
    (NO llama a `calcular_oc_stats()`, que es la función gigante que ya
    alimenta /pac — reusar esa función completa solo para esta cifra sería
    caro e innecesario; aquí se repite el mismo cálculo acotado, ver el bloque
    'CORREGIDAS' dentro de `calcular_oc_stats()` para el original)."""
    revisiones = list(RevisionOCCorregible.objects.values('codigo_oc', 'resultado'))
    revisiones_enlazada = [r for r in revisiones if r['resultado'] == 'Enlazada']
    codigos_licitacion = {r['codigo_oc'] for r in revisiones_enlazada}
    sync_licitacion = OrdenCompra.objects.filter(
        codigo_oc__in=codigos_licitacion, EnlacePAC='Enlazada'
    ).count()

    formularios = calcular_oc_pac_corregidas()
    codigos_formularios = {f['codigo_oc'] for f in formularios['filas']}

    total_oc = OrdenCompra.objects.count()
    enlazadas_automatico = OrdenCompra.objects.filter(EnlacePAC='Enlazada').count()
    codigos_ambas_vias = codigos_licitacion & codigos_formularios

    return {
        'via_licitacion': {
            'oc_unicas_corregidas': len(codigos_licitacion),
            'sincronizadas': sync_licitacion,
            'esperando_sync': len(codigos_licitacion) - sync_licitacion,
        },
        'via_formularios': {
            'oc_unicas_corregidas': len(codigos_formularios),
            'sincronizadas': formularios['kpis']['sincronizadas'],
            'esperando_sync': formularios['kpis']['esperando_sync'],
            'monto_regularizado': formularios['kpis']['monto_regularizado'],
        },
        'combinado': {
            'oc_tocadas_por_ambas_vias': len(codigos_ambas_vias),
            'oc_unicas_totales': len(codigos_licitacion | codigos_formularios),
            'total_oc_sistema': total_oc,
            'enlazadas_automatico_pct': round(100 * enlazadas_automatico / total_oc, 1) if total_oc else 0.0,
        },
    }


# =============================================================================
# Módulo Gestión de Compras — Procesos de Compra por comprador
#
# Convierte un FormularioFSCDerivado en estado AC (bandeja "A Comprador" del
# Panel SSO) en uno o más ProcesoCompra (Licitación / Compra Ágil / Convenio
# Marco / Trato Directo / Orden de Compra directa) que el comprador clasifica
# y hace avanzar de estado hasta finalizar. Relación M2M en ambos sentidos con
# FormularioFSCDerivado (un FSC puede abrir varios procesos en paralelo, un
# proceso puede agrupar varios FSC de compra conjunta) y con OrdenCompra (un
# proceso puede generar varias OC). Ver plan de implementación (2026-09-01)
# para el diseño completo — Fase 2: CRUD de ProcesoCompra sin integración en
# vivo con Mercado Público (esa es Fase 3) ni notificaciones (Fase 4).
# =============================================================================

ESTADOS_POR_TIPO_PROCESO = {
    ProcesoCompra.LICITACION: [
        'RECEPCIONADO', 'LIC_PUBLICACION', 'REVISION_COMPRADOR', 'LIC_REVISION_BASES_REFERENTE',
        'LIC_PENDIENTE_AUT_REFERENTE', 'LIC_PREPARACION_INFORME_EVAL', 'LIC_EVALUACION_OFERTAS',
        'LIC_ADJUDICACION_DESERCION', 'LIC_SEGUNDO_LLAMADO', 'LIC_SUSCRIPCION_CONTRATO',
        'LIC_EN_EJECUCION', 'OC_ENVIADA', 'FINALIZADO', 'OTROS', 'RECHAZADO',
    ],
    ProcesoCompra.COMPRA_AGIL: [
        'RECEPCIONADO', 'CA_PUBLICADA', 'REVISION_COMPRADOR', 'CA_ENVIADA_REFERENTE',
        'OC_ENVIADA', 'FINALIZADO', 'OTROS', 'RECHAZADO',
    ],
    ProcesoCompra.CONVENIO_MARCO: ['RECEPCIONADO', 'FINALIZADO', 'OTROS', 'RECHAZADO'],
    ProcesoCompra.TRATO_DIRECTO: ['RECEPCIONADO', 'TD_TRAMITACION_RESOLUCION', 'FINALIZADO', 'RECHAZADO'],
    ProcesoCompra.ORDEN_COMPRA_DIRECTA: ['RECEPCIONADO', 'OCD_GESTIONANDO_ENVIO', 'FINALIZADO', 'RECHAZADO'],
}


def validar_estado_para_tipo(tipo_proceso, estado_proceso):
    """Lanza ValueError si `estado_proceso` no pertenece a
    ESTADOS_POR_TIPO_PROCESO[tipo_proceso]. Se llama SIEMPRE antes de guardar
    un ProcesoCompra (creación o cambio de estado) — los choices del campo
    CharField son la UNIÓN de todos los tipos (Django no rechazaría por sí
    solo un estado válido para otro tipo distinto)."""
    permitidos = ESTADOS_POR_TIPO_PROCESO.get(tipo_proceso)
    if permitidos is None:
        raise ValueError(f"Tipo de proceso desconocido: {tipo_proceso!r}")
    if estado_proceso not in permitidos:
        raise ValueError(
            f"Estado {estado_proceso!r} no es válido para {tipo_proceso!r}. "
            f"Válidos: {', '.join(permitidos)}"
        )


def resolver_nombres_comprador(usuario):
    """Devuelve los valores de FormularioFSCDerivado.comprador (texto libre
    del Panel SSO, ej. 'ALICIA VIDAL') que corresponden a `usuario`, vía el
    catálogo ComprasCompradorPerfil."""
    return list(
        ComprasCompradorPerfil.objects.filter(usuario=usuario, activo=True)
        .values_list('nombre_comprador', flat=True)
    )


def listar_fsc_finalizados_comprador(usuario):
    """FormularioFSCDerivado (bandeja 'AC') cuyo `estado_compra` — campo
    textual propio del Panel SSO, ej. 'Licitación - Proceso Finalizado',
    'Compra Ágil - Proceso Finalizado' — indica que el proceso de compra ya
    se dio por finalizado. Es independiente de ProcesoCompra.estado_proceso
    (nuestro seguimiento interno): usa el dato tal cual lo trae el Panel SSO."""
    nombres = resolver_nombres_comprador(usuario)
    return FormularioFSCDerivado.objects.filter(
        estado='AC', comprador__in=nombres, estado_compra__icontains='Proceso Finalizado',
    ).order_by('-fecha_derivado', '-folio')


def listar_fsc_pendientes_comprador(usuario, incluir_ya_clasificados=False):
    """Bandeja 'Mis Formularios': FormularioFSCDerivado en estado 'AC' (bandeja
    'A Comprador') cuyo campo `comprador` coincide con los nombres resueltos
    para `usuario`. Por defecto EXCLUYE los que ya tienen al menos un
    ProcesoCompra vinculado — son los 'pendientes de clasificar'; con
    incluir_ya_clasificados=True se listan todos los NO finalizados (para el
    tab 'Formularios'). Siempre excluye los que ya están en
    listar_fsc_finalizados_comprador (estado_compra con 'Proceso Finalizado')
    para que un mismo FSC no aparezca duplicado en ambos tabs."""
    nombres = resolver_nombres_comprador(usuario)
    qs = FormularioFSCDerivado.objects.filter(estado='AC', comprador__in=nombres).exclude(
        estado_compra__icontains='Proceso Finalizado'
    )
    if not incluir_ya_clasificados:
        qs = qs.exclude(vinculos_proceso__isnull=False)
    return qs.order_by('-fecha_derivado', '-folio')


def crear_proceso_compra(*, tipo_proceso, titulo, comprador, formulario_ids, usuario_creador,
                          estado_proceso='RECEPCIONADO', **campos_opcionales):
    """Crea un ProcesoCompra, valida estado vs tipo, vincula 1..N
    FormularioFSCDerivado (M2M — soporta compra conjunta) y registra la
    primera fila en ProcesoCompraEstadoLog (estado_anterior=None)."""
    validar_estado_para_tipo(tipo_proceso, estado_proceso)
    if not formulario_ids:
        raise ValueError('Debe indicar al menos un formulario (formulario_ids).')
    with transaction.atomic():
        proceso = ProcesoCompra.objects.create(
            tipo_proceso=tipo_proceso, estado_proceso=estado_proceso, titulo=titulo,
            comprador=comprador, creado_por=usuario_creador, **campos_opcionales,
        )
        for fsc_id in formulario_ids:
            ProcesoCompraFormulario.objects.get_or_create(
                proceso=proceso, formulario_derivado_id=fsc_id,
                defaults={'creado_por': usuario_creador},
            )
        ProcesoCompraEstadoLog.objects.create(
            proceso=proceso, estado_anterior=None, estado_nuevo=estado_proceso,
            usuario=usuario_creador, comentario='Proceso creado.',
        )
    return proceso


def cambiar_estado_proceso(proceso_id, nuevo_estado, usuario, comentario=''):
    """Cambia estado_proceso, valida contra tipo_proceso y escribe
    ProcesoCompraEstadoLog. También sirve para dejar una nota de seguimiento
    SIN cambiar de estado (nuevo_estado == estado actual + comentario no
    vacío) — así el comprador puede ir registrando avances para que jefatura
    los revise en el historial aunque el proceso siga en la misma etapa.
    No-op real (sin fila de historial) solo cuando no cambia el estado NI
    trae comentario. Fase 4 engancha aquí el disparo de notificaciones
    in-app/email — no implementado todavía."""
    proceso = ProcesoCompra.objects.select_related('comprador').get(pk=proceso_id)
    validar_estado_para_tipo(proceso.tipo_proceso, nuevo_estado)
    anterior = proceso.estado_proceso
    comentario = (comentario or '').strip()
    if anterior == nuevo_estado and not comentario:
        return proceso
    with transaction.atomic():
        if anterior != nuevo_estado:
            proceso.estado_proceso = nuevo_estado
            if nuevo_estado == 'FINALIZADO':
                proceso.finalizado_en = timezone.now()
            proceso.save(update_fields=['estado_proceso', 'finalizado_en', 'actualizado_en'])
        ProcesoCompraEstadoLog.objects.create(
            proceso=proceso, estado_anterior=anterior, estado_nuevo=nuevo_estado,
            usuario=usuario, comentario=comentario,
        )
    return proceso


def agregar_formulario_a_proceso(proceso_id, formulario_id, usuario):
    """Agrega un FSC adicional a un proceso existente (compra conjunta).
    Idempotente vía get_or_create sobre la constraint única
    (proceso, formulario_derivado). Lanza FormularioFSCDerivado.DoesNotExist
    si el id no existe."""
    FormularioFSCDerivado.objects.get(pk=formulario_id)  # valida existencia, 404 explícito en la vista
    proceso = ProcesoCompra.objects.get(pk=proceso_id)
    vinculo, _creado = ProcesoCompraFormulario.objects.get_or_create(
        proceso=proceso, formulario_derivado_id=formulario_id,
        defaults={'creado_por': usuario},
    )
    return vinculo


def buscar_licitacion_local(query, limite=10):
    """Búsqueda por código o nombre entre las Licitaciones ya sincronizadas
    localmente (LI_SSO_SERVER.py). Fase 3 extiende esta función para, si no
    hay resultados, consultar en vivo la API de Mercado Público y persistir
    el hallazgo — por ahora solo busca local."""
    query = (query or '').strip()
    if not query:
        return []
    qs = Licitacion.objects.filter(
        Q(codigo_licitacion__icontains=query) | Q(Nombre__icontains=query)
    ).order_by('-FechaPublicacion')[:limite]
    return list(qs.values('codigo_licitacion', 'Nombre', 'Estado', 'FechaCierre', 'MontoEstimado'))


def buscar_compra_agil_local(query, limite=10):
    """Búsqueda por código o nombre entre las Compras Ágiles ya sincronizadas
    localmente (AG_SSO_SERVER2.py). Ver nota de Fase 3 en buscar_licitacion_local."""
    query = (query or '').strip()
    if not query:
        return []
    qs = CompraAgilResumen.objects.filter(
        Q(codigocompraagil__icontains=query) | Q(nombre__icontains=query)
    ).order_by('-fechapublicacion')[:limite]
    return list(qs.values('codigocompraagil', 'nombre', 'estadoglosa', 'fechacierre'))


def buscar_oc_local(query, limite=10):
    """Búsqueda por código o nombre entre las Órdenes de Compra ya
    sincronizadas localmente (OC_SSO_SERVER.py). Ver nota de Fase 3 en
    buscar_licitacion_local."""
    query = (query or '').strip()
    if not query:
        return []
    qs = OrdenCompra.objects.filter(
        Q(codigo_oc__icontains=query) | Q(NombreOC__icontains=query)
    ).order_by('-FechaEnvio')[:limite]
    return list(qs.values('codigo_oc', 'NombreOC', 'EstadoOC', 'TotalBruto'))


_FECHAS_LICITACION = [
    ('FechaCreacion',              'Creación'),
    ('FechaPublicacion',           'Publicación'),
    ('FechaCierre',                'Cierre de Ofertas'),
    ('FechaActoAperturaTecnica',   'Apertura Técnica'),
    ('FechaActoAperturaEconomica', 'Apertura Económica'),
    ('FechaEstimadaAdjudicacion',  'Adjudicación Estimada'),
    ('FechaAdjudicacion',          'Adjudicación'),
    ('FechaInicioContrato',        'Inicio de Contrato'),
    ('FechaFinal',                 'Fecha Final'),
]

_FECHAS_COMPRA_AGIL = [
    ('fechapublicacion',   'Publicación'),
    ('fechacierre',        'Cierre'),
    ('fechaultimocambio',  'Último Cambio'),
]


def calcular_proceso_detalle_mp(proceso_id):
    """Detalle curado de la Licitación/Compra Ágil vinculada a un
    ProcesoCompra, para el panel 'Ver' (botón junto a cada proceso en el
    bloque 'Enlace Mercado Público'): resumen relevante para el comprador
    (sin banderas administrativas internas de MP), sus líneas/productos, y
    las fechas clave ordenadas cronológicamente para la línea de tiempo."""
    proceso = ProcesoCompra.objects.select_related('licitacion').get(pk=proceso_id)
    data = {'licitacion': None, 'compra_agil': None, 'lineas': [], 'fechas': []}

    if proceso.licitacion_id:
        lic = proceso.licitacion
        data['licitacion'] = {
            'codigo_licitacion': lic.codigo_licitacion,
            'Nombre': lic.Nombre,
            'Descripcion': lic.Descripcion,
            'Estado': lic.Estado,
            'C_NombreOrganismo': lic.C_NombreOrganismo,
            'C_Unidad': lic.C_Unidad,
            'C_Usuario': lic.C_Usuario,
            'C_Cargo': lic.C_Cargo,
            'MontoEstimado': lic.MontoEstimado,
            'DescripcionTipoLicitacion': lic.DescripcionTipoLicitacion,
        }
        for campo, label in _FECHAS_LICITACION:
            valor = getattr(lic, campo, None)
            if valor:
                data['fechas'].append({'clave': campo, 'label': label, 'fecha': valor.isoformat()})
        data['lineas'] = list(DetalleLicitacion.objects.filter(licitacion=lic).values(
            'NombreProducto', 'DescripcionItem', 'Cantidad', 'UnidadMedida',
            'MontoUnitarioGanador', 'NombreGanador',
        ))

    elif proceso.codigo_compra_agil:
        ca = CompraAgilResumen.objects.filter(codigocompraagil=proceso.codigo_compra_agil).first()
        if ca:
            data['compra_agil'] = {
                'codigocompraagil': ca.codigocompraagil,
                'nombre': ca.nombre,
                'descripcion': ca.descripcion,
                'estadoglosa': ca.estadoglosa,
                'unidadcompra': ca.unidadcompra,
                'presupuestoestimado': ca.presupuestoestimado,
            }
            for campo, label in _FECHAS_COMPRA_AGIL:
                valor = getattr(ca, campo, None)
                if valor:
                    data['fechas'].append({'clave': campo, 'label': label, 'fecha': valor.isoformat()})
            data['lineas'] = list(CompraAgilProducto.objects.filter(codigocompraagil=ca.codigocompraagil).values(
                'nombre', 'descripcion', 'cantidad', 'unidadmedida',
            ))

    data['fechas'].sort(key=lambda f: f['fecha'])
    return data


def desvincular_proceso_mp(proceso_id, usuario):
    """Quita el enlace de Licitación/Compra Ágil de un proceso, sin borrar el
    proceso ni su historial — para cuando el comprador se equivocó al elegir
    el código y quiere buscar de nuevo."""
    proceso = ProcesoCompra.objects.get(pk=proceso_id)
    proceso.licitacion = None
    proceso.codigo_compra_agil = None
    proceso.save(update_fields=['licitacion', 'codigo_compra_agil', 'actualizado_en'])
    return proceso


def quitar_oc_de_proceso(proceso_id, codigo_oc, usuario):
    """Quita el enlace de una Orden de Compra a un proceso (borra solo la
    fila ProcesoCompraOrdenCompra, la OC en sí no se toca)."""
    ProcesoCompraOrdenCompra.objects.filter(proceso_id=proceso_id, orden_compra_id=codigo_oc).delete()


# =============================================================================
# Fase 3 — Integración en vivo con Mercado Público
#
# Cuando una búsqueda local (buscar_licitacion_local/buscar_compra_agil_local/
# buscar_oc_local) no encuentra un código, estas funciones lo traen EN VIVO de
# la API de Mercado Público usando los mismos clientes/parsers que ya usan los
# ETL batch (api/LI_SSO_SERVER.py, OC_SSO_SERVER.py, AG_SSO_SERVER2.py — a
# nivel de repo, NO backend/api/), y lo persisten con update_or_create en las
# tablas GENERALES del sistema (Licitacion/OrdenCompra/CompraAgilResumen) —
# nunca en una tabla paralela. CRÍTICO: nunca llamar a guardar_en_django()/
# sincronizar_con_servidor() de esos scripts — hacen DELETE total + bulk_create
# de TODA la tabla en cada corrida batch; acá se hace update_or_create acotado
# a un solo registro. Alcance reducido a propósito: no recalcula
# EnlacePAC/ID_Proyecto/TipoOCInterno (requiere el cruce completo contra
# OCPAC_Maestro.csv de enlazar_con_pac()) ni Descripcion* derivadas de
# _enriquecer_df_lic/_enriquecer_df_oc — quedan pendientes hasta el próximo
# ETL batch completo, que sí las recalcula sobre toda la tabla.
# =============================================================================

def _ruta_etl_scripts():
    """sys.path para poder `import LI_SSO_SERVER`/`OC_SSO_SERVER`/`AG_SSO_SERVER2`
    — directorio api/ en la raíz del repo, NO backend/api/. Mismo cálculo que
    _RUTA_AG_SERVIDOR en views.py."""
    import sys
    from pathlib import Path
    ruta = str(Path(__file__).resolve().parent.parent.parent / 'api')
    if ruta not in sys.path:
        sys.path.insert(0, ruta)
    return ruta


def _coercionar_valor(valor, tipo):
    """tipo: 'fecha' | 'int' | 'float' — misma lógica que guardar_en_django()
    de cada script ETL, replicada acá porque esas funciones son destructivas
    (delete-all) y no se pueden invocar para un solo registro."""
    import dateutil.parser
    from django.utils.timezone import make_aware, is_naive

    if valor is None or str(valor).strip() == '' or str(valor).strip().lower() == 'none':
        return None
    if tipo == 'fecha':
        try:
            val_dt = dateutil.parser.isoparse(str(valor))
            if is_naive(val_dt):
                val_dt = make_aware(val_dt)
            return val_dt
        except (ValueError, TypeError):
            return None
    if tipo == 'int':
        try:
            return int(float(valor))
        except (ValueError, TypeError):
            return None
    if tipo == 'float':
        try:
            v = valor.replace(',', '.') if isinstance(valor, str) else valor
            return float(v)
        except (ValueError, TypeError):
            return None
    return valor


def _medir(fn):
    """Ejecuta fn() cronometrando la llamada Y capturando su stdout: los
    clientes MercadoPublico*Client (LI/OC/AG) nunca lanzan excepción en sus
    fallos de red — hacen print() del error real (ej. '⚠️ API sin respuesta
    tras 2 intentos: HTTP Error 504: Gateway Timeout') y devuelven None en
    silencio (mismo patrón que ya captura el resto del proyecto para leer
    progreso de ETL vía contextlib.redirect_stdout, ver CLAUDE.md). Sin este
    capture, un 504 real de Mercado Público se reportaría como 'no
    encontrado' — indistinguible para quien lo usa. Devuelve (resultado,
    segundos, excepcion_o_None, log_capturado: str)."""
    import time, io, contextlib
    inicio = time.time()
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer):
            resultado = fn()
        return resultado, round(time.time() - inicio, 1), None, buffer.getvalue().strip()
    except Exception as e:
        return None, round(time.time() - inicio, 1), e, buffer.getvalue().strip()


_LI_DT_FIELDS = {
    'FechaCreacion', 'FechaCierre', 'FechaInicio', 'FechaFinal', 'FechaPublicacion',
    'FechaAdjudicacion', 'FechaEstimadaAdjudicacion', 'Adj_Fecha',
    'FechaPubRespuestas', 'FechaActoAperturaTecnica', 'FechaActoAperturaEconomica',
    'FechaSoporteFisico', 'FechaTiempoEvaluacion', 'FechaEstimadaFirma',
    'FechaVisitaTerreno', 'FechaEntregaAntecedentes', 'FechaInicioContrato',
}
_LI_INT_FIELDS = {
    'Etapas', 'CodigoEstado', 'CodigoTipo', 'DiasCierreLicitacion', 'CantidadReclamos',
    'Informada', 'TomaRazon', 'EstadoPublicidadOfertas', 'Contrato', 'Obras',
    'UnidadTiempoEvaluacion', 'Estimacion', 'VisibilidadMonto', 'TipoPago',
    'Tiempo', 'UnidadTiempo', 'ProhibicionContratacion', 'SubContratacion',
    'ExtensionPlazo', 'EsBaseTipo', 'UnidadTiempoContratoLicitacion',
    'ValorTiempoRenovacion', 'Adj_Tipo', 'Adj_NumeroOferentes',
}


def _resumen_licitacion_ligero(lic):
    return {
        'codigo_licitacion': lic.codigo_licitacion, 'Nombre': lic.Nombre,
        'Estado': lic.Estado, 'FechaCierre': lic.FechaCierre, 'MontoEstimado': lic.MontoEstimado,
    }


def buscar_o_importar_licitacion(codigo):
    """Busca Licitacion por PK local; si no existe, la trae en vivo de
    Mercado Público (mismo cliente que usa LI_SSO_SERVER.py para el ETL
    batch) y la persiste con update_or_create. Devuelve
    (dict_resumen_o_None, creada: bool, diagnostico: dict) —
    diagnostico siempre trae 'segundos' y 'motivo' para que el frontend
    pueda mostrar en su mini terminal cuánto tardó y por qué falló si no
    encontró nada (no encontrada de verdad vs. timeout/error de red)."""
    codigo = (codigo or '').strip().upper()
    if not codigo:
        return None, False, {'segundos': 0, 'motivo': 'Código vacío.'}
    lic = Licitacion.objects.filter(codigo_licitacion=codigo).first()
    if lic:
        return _resumen_licitacion_ligero(lic), False, {'segundos': 0, 'motivo': 'Encontrada en la base de datos local.'}

    _ruta_etl_scripts()
    import LI_SSO_SERVER as li
    cliente = li.MercadoPublicoLicitacionesClient(
        li.ApiConfig(codigo_organismo=li.CODIGO_ORGANISMO, ticket=li.TICKET, max_reintentos=2, timeout=30)
    )
    detalle, segundos, excepcion, log = _medir(lambda: cliente.obtener_detalle_licitacion(codigo))
    if excepcion is not None:
        return None, False, {'segundos': segundos, 'motivo': f'Excepción al consultar Mercado Público: {excepcion}', 'log': log}
    if not detalle:
        motivo = log or (
            f'Mercado Público no devolvió datos para "{codigo}" tras {segundos}s '
            f'(agotó los reintentos — puede no existir, o la API respondió lento/con error).'
        )
        return None, False, {'segundos': segundos, 'motivo': motivo, 'log': log}
    resumen, items = li._extraer_resumen_y_detalles(codigo, detalle)

    campos_modelo = {f.name for f in Licitacion._meta.get_fields()}
    defaults = {}
    for k, v in resumen.items():
        if k == 'CodigoLicitacion':
            continue
        if k in _LI_DT_FIELDS:
            defaults[k] = _coercionar_valor(v, 'fecha')
        elif k == 'EsRenovable':
            defaults[k] = str(v or '').strip().lower() in ('1', 'true', 'si', 'sí', 'yes')
        elif k in _LI_INT_FIELDS:
            defaults[k] = _coercionar_valor(v, 'int')
        elif k == 'MontoEstimado':
            defaults[k] = _coercionar_valor(v, 'float')
        else:
            defaults[k] = v if (v is not None and str(v).strip().lower() != 'none') else None
    defaults = {k: v for k, v in defaults.items() if k in campos_modelo}
    if not defaults.get('Numero'):
        defaults['Numero'] = ''

    campos_det = {f.name for f in DetalleLicitacion._meta.get_fields()}
    with transaction.atomic():
        lic, creada = Licitacion.objects.update_or_create(codigo_licitacion=codigo, defaults=defaults)
        DetalleLicitacion.objects.filter(licitacion_id=codigo).delete()
        nuevos = []
        for it in items:
            it = it.copy()
            it.pop('CodigoLicitacion', None)
            correlativo = it.pop('Correlativo', None) or it.get('CodigoProducto') or 0
            det_defaults = {}
            for k, v in it.items():
                if k in ('Cantidad', 'MontoUnitarioGanador', 'CantidadAdjudicada'):
                    det_defaults[k] = _coercionar_valor(v, 'float')
                else:
                    det_defaults[k] = v if (v is not None and str(v).strip().lower() != 'none') else None
            det_defaults = {k: v for k, v in det_defaults.items() if k in campos_det}
            nuevos.append(DetalleLicitacion(licitacion_id=codigo, Correlativo=correlativo, **det_defaults))
        DetalleLicitacion.objects.bulk_create(nuevos)

    return _resumen_licitacion_ligero(lic), True, {'segundos': segundos, 'motivo': 'OK'}


_OC_DT_FIELDS = {'FechaCreacion', 'FechaEnvio', 'FechaAceptacion', 'FechaCancelacion', 'FechaUltimaModificacion'}
_OC_FLOAT_FIELDS = {'CodigoEstado', 'CantidadEvaluacion', 'PromedioCalificacion', 'TotalNeto', 'PorcentajeIva', 'Impuestos', 'TotalBruto'}


def _resumen_oc_ligero(oc):
    return {'codigo_oc': oc.codigo_oc, 'NombreOC': oc.NombreOC, 'EstadoOC': oc.EstadoOC, 'TotalBruto': oc.TotalBruto}


def buscar_o_importar_oc(codigo_oc):
    """Busca OrdenCompra por PK local; si no existe, la trae en vivo (mismo
    cliente que OC_SSO_SERVER.py) y persiste resumen + líneas con
    update_or_create. NO recalcula EnlacePAC/ID_Proyecto/TipoOCInterno —
    para corrección manual puntual del PAC existe OcPacOverride. Devuelve
    (dict_resumen_o_None, creada: bool, diagnostico: dict) — ver docstring
    de buscar_o_importar_licitacion para el propósito de diagnostico."""
    codigo_oc = (codigo_oc or '').strip().upper()
    if not codigo_oc:
        return None, False, {'segundos': 0, 'motivo': 'Código vacío.'}
    oc = OrdenCompra.objects.filter(codigo_oc=codigo_oc).first()
    if oc:
        return _resumen_oc_ligero(oc), False, {'segundos': 0, 'motivo': 'Encontrada en la base de datos local.'}

    _ruta_etl_scripts()
    import OC_SSO_SERVER as ocserver
    cliente = ocserver.MercadoPublicoClient(
        ocserver.ApiConfig(codigo_organismo=ocserver.CODIGO_ORGANISMO, ticket=ocserver.TICKET, max_reintentos=2, timeout=30)
    )
    detalle, segundos, excepcion, log = _medir(lambda: cliente.obtener_detalle_oc(codigo_oc))
    if excepcion is not None:
        return None, False, {'segundos': segundos, 'motivo': f'Excepción al consultar Mercado Público: {excepcion}', 'log': log}
    if not detalle:
        motivo = log or (
            f'Mercado Público no devolvió datos para "{codigo_oc}" tras {segundos}s '
            f'(agotó los reintentos — puede no existir, o la API respondió lento/con error).'
        )
        return None, False, {'segundos': segundos, 'motivo': motivo, 'log': log}
    resumen, items = ocserver._extraer_resumen_y_detalles(codigo_oc, detalle)

    campos_modelo = {f.name for f in OrdenCompra._meta.get_fields()}
    defaults = {}
    for k, v in resumen.items():
        if k == 'CodigoOC':
            continue
        if k in _OC_DT_FIELDS:
            defaults[k] = _coercionar_valor(v, 'fecha')
        elif k in _OC_FLOAT_FIELDS:
            defaults[k] = _coercionar_valor(v, 'float')
        else:
            defaults[k] = v if (v is not None and str(v).strip().lower() != 'none') else None
    defaults = {k: v for k, v in defaults.items() if k in campos_modelo}

    campos_det = {f.name for f in DetalleOrdenCompra._meta.get_fields()}
    with transaction.atomic():
        oc, creada = OrdenCompra.objects.update_or_create(codigo_oc=codigo_oc, defaults=defaults)
        DetalleOrdenCompra.objects.filter(orden_compra_id=codigo_oc).delete()
        nuevos = []
        for it in items:
            it = it.copy()
            it.pop('CodigoOC', None)
            correlativo = it.pop('Correlativo', None) or it.get('CodigoProducto') or 0
            det_defaults = {}
            for k, v in it.items():
                if k in ('Cantidad', 'PrecioNeto', 'TotalImpuestos', 'TotalLinea'):
                    det_defaults[k] = _coercionar_valor(v, 'float')
                else:
                    det_defaults[k] = v if (v is not None and str(v).strip().lower() != 'none') else None
            det_defaults = {k: v for k, v in det_defaults.items() if k in campos_det}
            nuevos.append(DetalleOrdenCompra(orden_compra_id=codigo_oc, Correlativo=correlativo, **det_defaults))
        DetalleOrdenCompra.objects.bulk_create(nuevos)

    return _resumen_oc_ligero(oc), True, {'segundos': segundos, 'motivo': 'OK'}


_CA_DT_DBCOLS = {'FechaPublicacion', 'FechaCierre', 'FechaUltimoCambio'}


def _resumen_compra_agil_ligero(fila):
    """`fila` es un dict (de .values(), nunca una instancia de modelo) — ver
    nota en buscar_o_importar_compra_agil sobre por qué se evita a propósito
    cualquier SELECT de fila completa sobre CompraAgilResumen."""
    return {
        'codigocompraagil': fila.get('codigocompraagil'),
        'nombre': fila.get('nombre'),
        'estadoglosa': fila.get('estadoglosa'),
    }


def buscar_o_importar_compra_agil(codigo):
    """Busca CompraAgilResumen por PK local; si no existe, la trae en vivo
    (mismo cliente que AG_SSO_SERVER2.py) y persiste resumen + productos
    solicitados. Mapea por db_column (los atributos Python del modelo son
    minúsculas, ej. codigocompraagil/db_column='CodigoCompraAgil' — a
    diferencia de Licitacion/OrdenCompra que usan PascalCase directo). NO
    importa proveedores/documentos (fuera de alcance — se completan en el
    próximo ETL batch completo).

    IMPORTANTE — nunca usar .get()/.first()/update_or_create() (ni cualquier
    otra operación que dispare un SELECT de la fila completa) sobre
    CompraAgilResumen: la tabla es managed=False, poblada por
    AG_SSO_SERVER2.sincronizar_con_servidor() con pandas.to_sql() sin
    validación de tipos ni constraint de unicidad — hay filas reales en
    producción con fechas corruptas (string no parseable) en columnas
    DateTimeField, que revientan con AttributeError al convertir el valor
    ('str' object has no attribute 'utcoffset') apenas Django intenta leer
    esa fila completa (bug real reportado 2026-09-02: cualquier SELECT que
    toque esas columnas, en cualquier fila de la tabla, puede fallar). Por
    eso acá todo se hace con .values() acotado a las columnas que interesan
    (nunca las de fecha), .exists() para el existence-check, y .update()/
    .create() en vez de update_or_create() para escribir sin leer antes.

    IMPORTANTE #2 — la API v2 de Compra Ágil (api2.mercadopublico.cl) es
    MUY lenta: medido en producción, una sola consulta de detalle puede
    tardar ~25s (bug real reportado 2026-09-02: con timeout=30 por defecto
    y max_reintentos=2, agotaba los 2 intentos por timeout y reportaba
    'no encontrado' para códigos que sí existían). timeout=45 le da margen;
    devuelve (dict_resumen_o_None, creada: bool, diagnostico: dict) con
    'segundos' reales para que el frontend pueda mostrar cuánto tardó."""
    codigo = (codigo or '').strip().upper()
    if not codigo:
        return None, False, {'segundos': 0, 'motivo': 'Código vacío.'}
    fila = CompraAgilResumen.objects.filter(codigocompraagil=codigo).values(
        'codigocompraagil', 'nombre', 'estadoglosa'
    ).first()
    if fila:
        return _resumen_compra_agil_ligero(fila), False, {'segundos': 0, 'motivo': 'Encontrada en la base de datos local.'}

    _ruta_etl_scripts()
    import AG_SSO_SERVER2 as ag
    # ApiConfig de este script difiere de LI/OC: toma ticket+region (no
    # codigo_organismo) — obtener_detalle_compra_agil() de todas formas no usa
    # region (llama directo a /v2/compra-agil/{codigo}), pero el dataclass la
    # exige igual. REGION_LOS_LAGOS es la misma constante que usa el CLI.
    # max_reintentos=1 (NO 2) a propósito — ver 2026-09-02: reintentar duplica
    # el consumo del rate-limit de Mercado Público sin mejorar la fiabilidad
    # (una consulta aislada de 1 solo intento con timeout=30 es la que
    # demostró funcionar de forma confiable; reintentar de inmediato tras un
    # 429/504 solo empeora el problema al gastar el doble de cupo por búsqueda).
    cliente = ag.MercadoPublicoCompraAgilClient(
        ag.ApiConfig(ticket=ag.TICKET, region=ag.REGION_LOS_LAGOS, max_reintentos=1, timeout=30)
    )
    detalle, segundos, excepcion, log = _medir(lambda: cliente.obtener_detalle_compra_agil(codigo))
    if excepcion is not None:
        return None, False, {'segundos': segundos, 'motivo': f'Excepción al consultar Mercado Público: {excepcion}', 'log': log}
    if not detalle:
        motivo = log or (
            f'Mercado Público no devolvió datos para "{codigo}" tras {segundos}s '
            f'(agotó los reintentos — la API de Compra Ágil es lenta, ~25s por consulta; '
            f'puede no existir, o haber tardado más de lo esperado).'
        )
        return None, False, {'segundos': segundos, 'motivo': motivo, 'log': log}
    resumen, productos, _proveedores, _cotizados, _documentos = ag._extraer_tablas_normalizadas(detalle)

    dbcol_a_attname = {
        f.db_column: f.attname for f in CompraAgilResumen._meta.get_fields() if getattr(f, 'db_column', None)
    }
    defaults = {}
    for k, v in resumen.items():
        attname = dbcol_a_attname.get(k)
        if not attname or attname == 'codigocompraagil':
            continue
        if k in _CA_DT_DBCOLS:
            defaults[attname] = _coercionar_valor(v, 'fecha')
        else:
            defaults[attname] = v if (v is not None and str(v).strip().lower() != 'none') else None

    dbcol_a_attname_prod = {
        f.db_column: f.attname for f in CompraAgilProducto._meta.get_fields() if getattr(f, 'db_column', None)
    }
    with transaction.atomic():
        creada = not CompraAgilResumen.objects.filter(codigocompraagil=codigo).exists()
        if creada:
            CompraAgilResumen.objects.create(codigocompraagil=codigo, **defaults)
        else:
            CompraAgilResumen.objects.filter(codigocompraagil=codigo).update(**defaults)
        CompraAgilProducto.objects.filter(codigocompraagil=codigo).delete()
        nuevos = []
        for p in productos:
            pd_defaults = {dbcol_a_attname_prod[k]: v for k, v in p.items() if k in dbcol_a_attname_prod}
            if not pd_defaults.get('codigoproducto'):
                continue
            nuevos.append(CompraAgilProducto(**pd_defaults))
        CompraAgilProducto.objects.bulk_create(nuevos)

    resultado = {'codigocompraagil': codigo, 'nombre': defaults.get('nombre'), 'estadoglosa': defaults.get('estadoglosa')}
    return resultado, True, {'segundos': segundos, 'motivo': 'OK'}


def agregar_oc_a_proceso(proceso_id, codigo_oc, usuario):
    """Vincula una OrdenCompra ya sincronizada localmente a un proceso (un
    proceso puede generar varias OC, ej. despachos parciales). Lanza
    OrdenCompra.DoesNotExist si el código no está sincronizado — la vista
    debe indicarle al frontend que use el buscador de Mercado Público
    (Fase 3) en ese caso."""
    OrdenCompra.objects.get(pk=codigo_oc)  # valida existencia, 404 explícito en la vista
    proceso = ProcesoCompra.objects.get(pk=proceso_id)
    vinculo, _creado = ProcesoCompraOrdenCompra.objects.get_or_create(
        proceso=proceso, orden_compra_id=codigo_oc,
        defaults={'creado_por': usuario},
    )
    return vinculo
