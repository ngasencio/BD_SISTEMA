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


def _con_articulo(periodo_label):
    """'3er trimestre de 2026' -> 'el 3er trimestre de 2026'; 'octubre de 2026' queda igual
    (los meses no llevan artículo: 'Durante octubre de 2026'). Antes salía 'Durante 3er
    trimestre de 2026'."""
    return f'el {periodo_label}' if 'trimestre' in periodo_label else periodo_label


def _frase_variacion(variacion_pp, contra, conector=', con'):
    """Frase de variación en puntos porcentuales. `contra` ya lleva su preposición ('al período
    anterior', 'al mismo período del año anterior') — antes salía 'respecto a el período
    anterior' y 'lo que representa' repetido tras 'Este resultado representa'."""
    if variacion_pp is None:
        return ''
    if variacion_pp > 1:
        return f'{conector} un alza de {abs(variacion_pp):.1f} puntos porcentuales respecto {contra}'
    if variacion_pp < -1:
        return f'{conector} una baja de {abs(variacion_pp):.1f} puntos porcentuales respecto {contra}'
    return f'{conector} una variación menor a 1 punto porcentual (relativamente estable) respecto {contra}'


def parrafo_resumen_ejecutivo(periodo_label, kpis, comparativa_periodos):
    """Párrafo introductorio del Resumen Ejecutivo Institucional."""
    pct = kpis['pct_dentro']
    var_ant = comparativa_periodos['periodo_anterior']['variacion_pp']
    var_anho = comparativa_periodos['mismo_periodo_anho_anterior']['variacion_pp']
    frase_ant = _frase_variacion(var_ant, 'al período anterior')
    frase_anho = _frase_variacion(var_anho, 'al mismo período del año anterior', conector=' y' if frase_ant else ', con')

    return (
        f'Durante {_con_articulo(periodo_label)}, el Servicio de Salud Osorno gestionó {_n(kpis["total"])} formularios de '
        f'solicitud de compra derivados a comprador, de los cuales {_n(kpis["dentro"])} '
        f'({pct:.1f}%) se encuentran verificados dentro del Plan Anual de Compras (PAC) y '
        f'{_n(kpis["fuera"])} ({100 - pct:.1f}%) fuera de él. Este resultado representa {_nivel(pct)} '
        f'de apego institucional al PAC{frase_ant}{frase_anho}. '
        f'El monto asociado a compras dentro del PAC alcanzó {_money(kpis["monto_dentro"])}, '
        f'mientras que {_money(kpis["monto_fuera"])} correspondieron a compras fuera de la planificación vigente.'
    )


def parrafo_cumplimiento_temporal(periodo_label, kpis_temporal, resumen_fichas=None, anho=None):
    """Párrafo sobre cumplimiento de fechas planificadas, para el Resumen Ejecutivo.

    El % en fecha se mide SOLO sobre formularios Dentro PAC derivados en el período
    (`formularios_evaluados`). Los proyectos del plan que todavía no tienen formulario ni OC
    son otra unidad (fichas) y se informan en una frase aparte con `resumen_fichas` — antes
    ambas se sumaban y el texto hablaba de '442 formularios' en un período con 164."""
    periodo = _con_articulo(periodo_label)
    evaluados = kpis_temporal.get('formularios_evaluados', 0)
    pct = kpis_temporal.get('pct_en_fecha_formularios')
    if not evaluados or pct is None:
        texto = (
            f'En cuanto al cumplimiento de los plazos planificados, {periodo} no registra formularios Dentro PAC '
            f'con una fecha de compra planificada comparable.'
        )
    else:
        texto = (
            f'En cuanto al cumplimiento de los plazos planificados, de los {_n(evaluados)} formularios Dentro PAC '
            f'derivados durante {periodo} con fecha de compra comparable, {_n(kpis_temporal["en_fecha"])} '
            f'({pct:.1f}%) se derivaron en fecha o con anticipación y {_n(kpis_temporal["formularios_atrasados"])} '
            f'presentaron atraso respecto a lo planificado. Esto refleja {_nivel(pct)} de cumplimiento temporal '
            f'del PAC durante {periodo}.'
        )
    if resumen_fichas and resumen_fichas.get('total'):
        sin_ejecutar = resumen_fichas['pendientes'] + resumen_fichas['atrasadas'] + resumen_fichas.get('sin_fecha', 0)
        texto += (
            f' Por separado, {_n(sin_ejecutar)} de las {_n(resumen_fichas["total"])} fichas del Plan de Compras'
            f'{f" {anho}" if anho else ""} aún no cuentan con formulario ni orden de compra: '
            f'{_n(resumen_fichas["atrasadas"])} con fecha de compra vencida y {_n(resumen_fichas["pendientes"])} '
            f'cuyo plazo aún no vence (estado a la fecha de generación del informe).'
        )
    return texto


def parrafo_capitulo_subdireccion(nombre_display, kpis_sub, ranking_mejor=None, ranking_peor=None):
    """Párrafo introductorio del capítulo de una subdirección.

    `nombre_display` debe venir YA formateado para lectura (ej.
    `_nombre_subdireccion_display()` de `services_reportes.py` — "Subdirección de
    Gestión Asistencial", con tildes), NO el nombre crudo de origen (mayúsculas sin
    tildes, "SUBDIRECCION DE GESTION ASISTENCIAL"). Antes ambos call sites (Word y
    PDF) pasaban el nombre crudo y esta función le aplicaba `.title()`, produciendo
    "Subdireccion De Gestion Asistencial" en el párrafo justo debajo de un título de
    capítulo que sí mostraba las tildes correctas (bug real, revisión de código
    2026-07-27) — se corrige recibiendo el nombre ya resuelto, sin recalcularlo acá.

    'DIRECTOR'/'Director' es la única de las 4 ramas institucionales que no empieza
    con 'Subdirección' — es masculina ('El Director'), las otras 3 son femeninas
    ('La Subdirección de...'). Sin este chequeo el texto queda "La Director...".
    """
    pct = kpis_sub['pct_dentro']
    articulo = 'El' if nombre_display.strip().upper().startswith('DIRECTOR') else 'La'
    base = (
        f'{articulo} {nombre_display} gestionó {_n(kpis_sub["total"])} formularios en el período, con un '
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
    pct_en_fecha = kpis_temporal.get('pct_en_fecha_formularios')
    recomendacion = (
        'Se recomienda reforzar la planificación anticipada en las unidades con menor apego al PAC, '
        'priorizando la incorporación temprana de sus necesidades de compra en el ciclo de planificación '
        'del próximo ejercicio.'
        if pct_dentro < 70 else
        'Se recomienda mantener las prácticas actuales de planificación y reforzar el seguimiento en las '
        'unidades identificadas con menor desempeño relativo.'
    )
    if pct_en_fecha is None:
        cierre_temporal = (
            ' No hubo formularios Dentro PAC con fecha planificada comparable para evaluar el cumplimiento de plazos.'
        )
        y_temporal = '.'
    else:
        cierre_temporal = ''
        y_temporal = (
            f' y {_nivel(pct_en_fecha)} de cumplimiento de los plazos planificados '
            f'({pct_en_fecha:.1f}% de los formularios derivados en fecha).'
        )
    return (
        f'En síntesis, durante {_con_articulo(periodo_label)} el Servicio de Salud Osorno registró {_nivel(pct_dentro)} '
        f'de apego al Plan Anual de Compras ({pct_dentro:.1f}%){y_temporal}{cierre_temporal} {recomendacion}'
    )
