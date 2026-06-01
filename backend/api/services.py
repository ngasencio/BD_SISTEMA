from collections import defaultdict

from django.db.models import Sum, Count, Q

from .models import (
    OrdenCompra, DetalleOrdenCompra, PlanerPAC,
    CompraAgilResumen, CompraAgilProveedor,
    CompraAgilProductoCotizado,
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
    top_ahorro_items = []
    mejora_items = []

    for ca in all_ca:
        codigo = ca['codigocompraagil'] or ''
        estado = ca.get('estadoglosa') or ''
        unidad = ca.get('unidadcompra') or 'Sin unidad'
        presupuesto = _f(ca.get('presupuestoestimado'))
        fecha = (ca.get('fechapublicacion') or '')[:7]   # "YYYY-MM"

        total_presupuesto += presupuesto
        por_estado[estado]['cantidad'] += 1
        por_estado[estado]['presupuesto'] += presupuesto
        por_unidad[unidad]['presupuesto'] += presupuesto
        por_unidad[unidad]['total'] += 1
        por_mes[fecha]['cantidad'] += 1
        por_mes[fecha]['presupuesto'] += presupuesto

        # Ahorro simple (solo si tiene OC)
        oc = oc_map.get(ca.get('oc_codigo') or '')
        monto_oc = _f(oc.get('TotalBruto')) if oc else 0.0
        if monto_oc > 0:
            total_monto_oc += monto_oc
            por_unidad[unidad]['monto_oc'] += monto_oc
            por_mes[fecha]['monto_oc'] += monto_oc
            if presupuesto > 0:
                ahorro = presupuesto - monto_oc
                ahorro_simple_total += ahorro
                por_unidad[unidad]['ahorro'] += ahorro
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
                precios, precio_ganador, cantidad_adj, nombre_prod = [], None, 0.0, ''
                for cot in cots:
                    precio = _f(cot.get('preciounitario'))
                    if precio > 0:
                        precios.append(precio)
                    if cot.get('rutproveedor') == rut_ganador:
                        precio_ganador = precio
                        cantidad_adj = _f(cot.get('cantidad'))
                        nombre_prod = cot.get('nombreproducto', '')

                if len(precios) >= 2 and precio_ganador is not None:
                    avg = sum(precios) / len(precios)
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
                'pct_ahorro': round(v['ahorro'] / v['presupuesto'] * 100, 1) if v['presupuesto'] > 0 else 0,
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
                ahorro_simple_total / total_presupuesto * 100, 1
            ) if total_presupuesto > 0 else 0,
            'ahorro_res188': round(ahorro_res188_total, 0),
            'adjudicado_res188': round(adjudicado_res188_total, 0),
            'pct_ahorro_res188': round(pct_res188, 2),
        },
        'por_estado': por_estado_list,
        'por_unidad': por_unidad_list,
        'por_mes': por_mes_list,
        'top_proveedores': top_proveedores,
        'top_ahorro_items': top_ahorro_items[:10],
        'mejora_items': mejora_items[:10],
    }
