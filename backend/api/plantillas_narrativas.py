"""
Módulo PAC — plantillas de frases condicionales para la narrativa del informe
Word (y resúmenes del PPT). Sin IA: texto 100% determinístico armado a partir
de los números ya calculados en services.py, para que el resultado sea
auditable y estable entre generaciones del mismo período.
"""

MESES_ES = [
    '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]


def _n(v):
    """Formatea un entero con separador de miles chileno (punto), ej. 1234 -> '1.234'.
    NUNCA aplicar str.replace(',', '.') sobre un párrafo completo — corrompe las
    comas normales de la prosa en español."""
    return f'{v:,.0f}'.replace(',', '.')


def _money(v):
    return f'${_n(v)}'


def etiqueta_periodo(periodo):
    """'2026-07' -> 'julio de 2026'. '2026-Q3' -> '3er trimestre de 2026'."""
    periodo = periodo.upper()
    if 'Q' in periodo:
        anho, q = periodo.split('-Q')
        ordinal = {'1': '1er', '2': '2do', '3': '3er', '4': '4to'}.get(q, q)
        return f'{ordinal} trimestre de {anho}'
    anho, mes = periodo.split('-')
    return f'{MESES_ES[int(mes)]} de {int(anho)}'


def _nivel(pct, alto=70, medio=40):
    if pct is None:
        return 'sin información suficiente'
    if pct >= alto:
        return 'un nivel satisfactorio'
    if pct >= medio:
        return 'un nivel intermedio, con espacio de mejora'
    return 'un nivel crítico que requiere atención'


def _frase_variacion(variacion_pp, contra='el período anterior'):
    if variacion_pp is None:
        return ''
    if variacion_pp > 1:
        return f', lo que representa un alza de {abs(variacion_pp):.1f} puntos porcentuales respecto a {contra}'
    if variacion_pp < -1:
        return f', lo que representa una baja de {abs(variacion_pp):.1f} puntos porcentuales respecto a {contra}'
    return f', manteniéndose relativamente estable respecto a {contra}'


def parrafo_resumen_ejecutivo(periodo_label, kpis, comparativa_periodos):
    """Párrafo introductorio del Resumen Ejecutivo Institucional."""
    pct = kpis['pct_dentro']
    var_ant = comparativa_periodos['periodo_anterior']['variacion_pp']
    var_anho = comparativa_periodos['mismo_periodo_anho_anterior']['variacion_pp']

    return (
        f'Durante {periodo_label}, el Servicio de Salud Osorno gestionó {_n(kpis["total"])} formularios de '
        f'solicitud de compra derivados a comprador, de los cuales {_n(kpis["dentro"])} '
        f'({pct:.1f}%) se encuentran verificados dentro del Plan Anual de Compras (PAC) y '
        f'{_n(kpis["fuera"])} ({100 - pct:.1f}%) fuera de él. Este resultado representa {_nivel(pct)} '
        f'de apego institucional al PAC{_frase_variacion(var_ant)}'
        f'{_frase_variacion(var_anho, "el mismo período del año anterior")}. '
        f'El monto asociado a compras dentro del PAC alcanzó {_money(kpis["monto_dentro"])}, '
        f'mientras que {_money(kpis["monto_fuera"])} correspondieron a compras fuera de la planificación vigente.'
    )


def parrafo_cumplimiento_temporal(periodo_label, kpis_temporal):
    """Párrafo sobre cumplimiento de fechas planificadas, para el Resumen Ejecutivo."""
    pct = kpis_temporal['pct_en_fecha']
    return (
        f'En cuanto al cumplimiento de los plazos planificados, de los {_n(kpis_temporal["total_evaluado"])} '
        f'formularios Dentro PAC con fecha de compra comparable, {_n(kpis_temporal["en_fecha"])} '
        f'({pct:.1f}%) se derivaron en fecha o con anticipación, {_n(kpis_temporal["atrasado"])} '
        f'presentaron atraso respecto a lo planificado y {_n(kpis_temporal["pendiente"])} corresponden a compras '
        f'planificadas cuyo plazo aún no vence. Esto refleja {_nivel(pct)} de cumplimiento temporal del PAC '
        f'durante {periodo_label}.'
    )


def parrafo_capitulo_subdireccion(nombre_sub, kpis_sub, ranking_mejor=None, ranking_peor=None):
    """Párrafo introductorio del capítulo de una subdirección.

    'DIRECTOR' es la única de las 4 ramas institucionales que no empieza con
    'SUBDIRECCION' — es masculina ('El Director'), las otras 3 son femeninas
    ('La Subdirección de...'). Sin este chequeo el texto queda "La Director...".
    """
    pct = kpis_sub['pct_dentro']
    articulo = 'El' if nombre_sub.upper().startswith('DIRECTOR') else 'La'
    base = (
        f'{articulo} {nombre_sub.title()} gestionó {_n(kpis_sub["total"])} formularios en el período, con un '
        f'{pct:.1f}% de ellos verificados dentro del Plan Anual de Compras — {_nivel(pct)} respecto '
        f'al estándar institucional. El monto gestionado dentro del PAC alcanzó '
        f'{_money(kpis_sub["monto_dentro"])}, frente a {_money(kpis_sub["monto_fuera"])} fuera de planificación.'
    )

    if ranking_mejor and ranking_peor and ranking_mejor['nombre'] != ranking_peor['nombre']:
        base += (
            f' Dentro de esta subdirección, el departamento con mejor desempeño fue '
            f'{ranking_mejor["nombre"].title()} ({ranking_mejor["score"]:.0f} puntos de score compuesto), '
            f'mientras que {ranking_peor["nombre"].title()} presentó el resultado más bajo '
            f'({ranking_peor["score"]:.0f} puntos), siendo el principal foco de mejora a abordar.'
        )
    return base


def parrafo_conclusiones(periodo_label, kpis_globales, kpis_temporal):
    pct_dentro = kpis_globales['pct_dentro']
    pct_en_fecha = kpis_temporal['pct_en_fecha']
    recomendacion = (
        'Se recomienda reforzar la planificación anticipada en las unidades con menor apego al PAC, '
        'priorizando la incorporación temprana de sus necesidades de compra en el ciclo de planificación '
        'del próximo ejercicio.'
        if pct_dentro < 70 else
        'Se recomienda mantener las prácticas actuales de planificación y reforzar el seguimiento en las '
        'unidades identificadas con menor desempeño relativo.'
    )
    return (
        f'En síntesis, durante {periodo_label} el Servicio de Salud Osorno registró {_nivel(pct_dentro)} '
        f'de apego al Plan Anual de Compras ({pct_dentro:.1f}%) y {_nivel(pct_en_fecha)} de cumplimiento '
        f'de los plazos planificados ({pct_en_fecha:.1f}%). {recomendacion}'
    )
