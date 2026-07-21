import calendar
import re
from collections import defaultdict
from datetime import date, datetime

from django.db.models import Count, DecimalField, Max, Q, Sum
from django.db.models.functions import Cast

from .models import (
    DetalleOrdenCompra, GestionContrato, Licitacion, DetalleLicitacion,
    OrdenCompra, PlanerPAC,
    CompraAgilResumen, CompraAgilProveedor, CompraAgilProductoCotizado,
    FormularioFSC, FormularioFSCDerivado, FormularioFSCProducto, FormularioFSCEstadoLog,
    SigfeAnexo1,
    PacProyectoMaestro, Departamento, Establecimiento, SsoSubdireccion,
)

# Todas las variantes que puede tomar el flag "proveedor seleccionado" en CA
_GANADOR_FLAGS = frozenset(['1', 'Si', 'si', 'True', 'true'])


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
    Calcula los indicadores cuantificables desde la BD (Ind 1, 2, 5).
    Ind 3 y 6 requieren entrada manual.
    Ind 4 requiere tabla de contratos (no disponible en BD).
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

    # ── Score parcial (ind 3 y 6 en 0 cuando no hay entrada manual) ──
    sc = {
        'i1': min(100, i1 or 0),
        'i2': min(100, i2 or 0),
        'i3': 0,
        'i4': 0,
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
        .annotate(monto=Sum('TotalNeto'))
        .order_by('mes')
    )
    evol_map = {}
    for r in evol_enlace_raw:
        m = r['mes']
        if m not in evol_map:
            evol_map[m] = {'mes': m, 'enlazada': 0.0, 'no_enlazada': 0.0}
        v = float(r['monto'] or 0)
        if r['EnlacePAC'] == 'Enlazada':
            evol_map[m]['enlazada'] = v
        else:
            evol_map[m]['no_enlazada'] += v
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

    return {
        'anio': anio,
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


def calcular_pac_dentro_fuera_stats(anho=None, fecha_desde=None, fecha_hasta=None, subdireccion=None, depto=None):
    """% Dentro/Fuera PAC + comparativa histórica por año, a nivel FSC individual.

    Granularidad y fuente de verdad acordadas con el usuario: 100% desde
    FormularioFSCDerivado.dentro_fuera_pac (verificado contra PacProyectoMaestro),
    agrupado por el año de fecha_derivado — nunca depende de PlanerPAC.
    `fecha_desde`/`fecha_hasta` (ISO 'YYYY-MM-DD') tienen prioridad sobre `anho`;
    se usan para las comparativas de período de la reportería (ver Fase E).
    """
    qs_base = (
        FormularioFSCDerivado.objects
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


def _eventos_planificados_por_proyecto(anho=None):
    """Agrupa PlanerPAC por (id_proyecto, fecha_inicio_compra) = 'evento de compra'
    — un mismo proyecto puede tener varios ítems programados en meses distintos."""
    qs = PlanerPAC.objects.exclude(id_proyecto__isnull=True).exclude(fecha_inicio_compra__isnull=True)
    if anho:
        qs = qs.filter(pac=str(anho))
    eventos = defaultdict(set)
    for id_proyecto, fecha_str in qs.values_list('id_proyecto', 'fecha_inicio_compra'):
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
    eventos = _eventos_planificados_por_proyecto(anho)

    fsc_qs = (
        FormularioFSCDerivado.objects
        .filter(dentro_fuera_pac=FormularioFSCDerivado.DENTRO)
        .exclude(fecha_derivado__isnull=True).exclude(fecha_derivado='')
        .exclude(id_plan__isnull=True).exclude(id_plan='')
    )
    if fecha_desde:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=fecha_desde)
    if fecha_hasta:
        fsc_qs = fsc_qs.filter(fecha_derivado__lte=fecha_hasta)
    elif anho:
        fsc_qs = fsc_qs.filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')
    if subdireccion:
        fsc_qs = fsc_qs.filter(sso_departamento__subdireccion_id=subdireccion)
    if depto:
        fsc_qs = fsc_qs.filter(sso_departamento_id=depto)

    proyectos_con_fsc = set()
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
            proyectos_con_fsc.add(fsc.id_plan)
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

    # Proyectos planificados sin ningún FSC Dentro PAC derivado todavía.
    proyectos_sin_iniciar = []
    n_pendientes = n_atrasados_sin_iniciar = 0
    primer_dia_mes_actual = date(hoy.year, hoy.month, 1)
    for id_proyecto, fechas in eventos.items():
        if id_proyecto in proyectos_con_fsc:
            continue
        primera_fecha = fechas[0]
        estado_proyecto = PENDIENTE if primera_fecha >= primer_dia_mes_actual else ATRASADO
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
    fsc_qs = FormularioFSCDerivado.objects.exclude(dentro_fuera_pac__isnull=True)
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
                'subdepartamentos': sorted(d['subdepartamentos'], key=lambda s: -s['total']),
            })
        deptos_lista.sort(key=lambda d: -d['total'])
        nodo_sub['departamentos'] = deptos_lista
        resultado.append(nodo_sub)
    resultado.sort(key=lambda n: (n['nombre'] == 'Sin Clasificar', -n['total']))
    return {'subdirecciones': resultado}


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
                if d['total'] < 3:  # muestra insuficiente para rankear con sentido
                    continue
                monto_total = d['monto_dentro'] + d['monto_fuera']
                pct_dentro_valor = round(d['monto_dentro'] / monto_total * 100, 1) if monto_total else None
                filas.append({
                    'nombre': d['nombre'], 'subdireccion': sub['nombre'],
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
        fsc_qs = FormularioFSCDerivado.objects.exclude(dentro_fuera_pac__isnull=True)
        if fecha_desde:
            fsc_qs = fsc_qs.filter(fecha_derivado__gte=fecha_desde)
        if fecha_hasta:
            fsc_qs = fsc_qs.filter(fecha_derivado__lte=fecha_hasta)
        elif anho:
            fsc_qs = fsc_qs.filter(fecha_derivado__gte=f'{anho}-01-01', fecha_derivado__lte=f'{anho}-12-31')
        filas = []
        for fsc in fsc_qs.only('folio', 'anho', 'unidad_requirente', 'monto_estimado', 'dentro_fuera_pac', 'requerimiento'):
            temporal = temporal_por_id.get(fsc.id)
            pct_dentro = 100.0 if fsc.dentro_fuera_pac == FormularioFSCDerivado.DENTRO else 0.0
            pct_en_fecha = None if not temporal else (100.0 if temporal['estado'] == EN_FECHA else 0.0)
            filas.append({
                'folio': fsc.folio, 'anho': fsc.anho, 'unidad_requirente': fsc.unidad_requirente,
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
    return {'mejores': filas[:limite_efectivo], 'peores': list(reversed(filas))[:limite_efectivo]}
