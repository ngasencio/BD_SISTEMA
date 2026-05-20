from collections import defaultdict

from django.db.models import Sum, Count, Q, Avg

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
    from .models import OrdenCompra, PlanerPAC, CompraAgilProveedor

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
        sel = next((r for r in rows if str(r['proveedorseleccionado']) == '1'), None)
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
    Estadísticas de OC para los paneles del tab Órdenes de Compra.
    """
    from .models import OrdenCompra

    oc_qs = OrdenCompra.objects.filter(FechaEnvio__year=anio)

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

    # ── Evolución mensual ──
    evolucion_mensual = list(
        oc_qs.exclude(EstadoOC='Cancelada')
        .extra(select={'mes': "MONTH(FechaEnvio)"})
        .values('mes')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('mes')
    )

    # ── Lead time (días creación → aceptación) ──
    oc_con_fechas = oc_qs.exclude(
        FechaAceptacion__isnull=True
    ).exclude(FechaCreacion__isnull=True)

    lead_times = list(
        oc_con_fechas.extra(
            select={'dias': "DATEDIFF(FechaAceptacion, FechaCreacion)"}
        ).values('C_Unidad', 'dias').order_by('C_Unidad')
    )
    # Promedio por unidad
    lt_by_unidad = defaultdict(list)
    for r in lead_times:
        if r['dias'] is not None and r['dias'] >= 0:
            lt_by_unidad[r['C_Unidad'] or 'Sin unidad'].append(r['dias'])
    lead_time_stats = [
        {'unidad': u, 'avg_dias': round(sum(v) / len(v), 1), 'n': len(v)}
        for u, v in lt_by_unidad.items()
    ]
    lead_time_stats.sort(key=lambda x: x['avg_dias'], reverse=True)

    # ── Top proveedores ──
    top_proveedores = list(
        oc_qs.exclude(EstadoOC='Cancelada')
        .values('P_Nombre', 'P_Rut')
        .annotate(cantidad=Count('codigo_oc'), monto=Sum('TotalNeto'))
        .order_by('-monto')[:15]
    )

    return {
        'anio': anio,
        'resumen': {
            'total_oc': resumen['total'] or 0,
            'monto_total': float(resumen['monto_total'] or 0),
            'monto_bruto': float(resumen['monto_bruto'] or 0),
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
    }
