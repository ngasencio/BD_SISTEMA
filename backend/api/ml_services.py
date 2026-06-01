"""
ML Services — BD_SISTEMA
Funciones de machine learning y análisis avanzado.
Ver .claude/agent-ml.md para documentación completa.
"""
import re
from collections import defaultdict

import numpy as np

# ── Utilidad: convertir numpy scalars a Python nativos ────────────────────────
def _to_python(obj):
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def _safe_float(val):
    try:
        return float(val or 0)
    except (ValueError, TypeError):
        return 0.0


# =============================================================================
# Preprocesador de texto reutilizable
# =============================================================================

_STOPWORDS_ES = None

def _get_stopwords():
    global _STOPWORDS_ES
    if _STOPWORDS_ES is None:
        try:
            from nltk.corpus import stopwords
            _STOPWORDS_ES = set(stopwords.words('spanish'))
        except Exception:
            _STOPWORDS_ES = {
                'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las',
                'un', 'por', 'con', 'una', 'su', 'para', 'es', 'al', 'lo',
                'como', 'mas', 'o', 'pero', 'sus', 'le', 'ya', 'entre', 'sin',
            }
    return _STOPWORDS_ES


def preprocesar_texto(texto):
    """
    Normaliza un nombre de producto para comparación semántica.
    'ZAPATOS PUNTA ACERO talla 42' → 'zapato punta acero'
    """
    if not texto:
        return ''
    try:
        from unidecode import unidecode
        texto = unidecode(str(texto))
    except Exception:
        pass

    texto = texto.lower()
    texto = re.sub(r'[^a-z\s]', ' ', texto)

    tokens = texto.split()
    sw = _get_stopwords()
    tokens = [t for t in tokens if t not in sw and len(t) >= 3]

    # Stemming básico: quitar sufijos comunes en español
    stemmed = []
    for t in tokens:
        for sufijo in ('cion', 'ciones', 'dores', 'ables', 'ible', 'ibles',
                       'ados', 'idas', 'idos', 'eras', 'eros', 'istas',
                       'antes', 'antes'):
            if t.endswith(sufijo) and len(t) - len(sufijo) >= 3:
                t = t[:-len(sufijo)]
                break
        # Plurales simples
        if t.endswith('es') and len(t) > 4:
            t = t[:-2]
        elif t.endswith('s') and len(t) > 3:
            t = t[:-1]
        stemmed.append(t)

    return ' '.join(stemmed)


# =============================================================================
# Estadísticas comparativas año a año (sin ML)
# =============================================================================

def calcular_comparativa_stats():
    """
    Evolución anual y mensual de las Compras Ágiles.
    Retorna estructura lista para graficar en el frontend.
    """
    from .models import CompraAgilResumen, CompraAgilProveedor, OrdenCompra
    from django.db.models.functions import Substr

    all_ca = list(CompraAgilResumen.objects.values(
        'codigocompraagil', 'estadoglosa', 'unidadcompra',
        'presupuestoestimado', 'oc_codigo', 'fechapublicacion',
        'totalofertasrecibidas', 'totalproveedorescotizando',
    ))

    # Mapa OC → TotalBruto
    oc_codigos = [ca['oc_codigo'] for ca in all_ca if ca.get('oc_codigo')]
    oc_map = {}
    if oc_codigos:
        for oc in OrdenCompra.objects.filter(codigo_oc__in=oc_codigos).values(
            'codigo_oc', 'TotalBruto',
        ):
            oc_map[oc['codigo_oc']] = _safe_float(oc.get('TotalBruto'))

    # Acumuladores por año y por (año, mes)
    por_anio = defaultdict(lambda: {
        'total': 0, 'adjudicadas': 0, 'desiertas': 0, 'canceladas': 0,
        'presupuesto': 0.0, 'monto_oc': 0.0, 'ahorro': 0.0,
        'sum_cotizantes': 0, 'n_con_cotizantes': 0,
        'proveedores': set(),
    })
    por_mes_anio = defaultdict(lambda: {'cantidad': 0, 'monto_oc': 0.0, 'presupuesto': 0.0})

    for ca in all_ca:
        fecha = (ca.get('fechapublicacion') or '')
        anio = fecha[:4] if len(fecha) >= 4 and fecha[:4].isdigit() else None
        mes  = fecha[5:7] if len(fecha) >= 7 else None
        if not anio:
            continue

        estado = ca.get('estadoglosa') or ''
        presup = _safe_float(ca.get('presupuestoestimado'))
        monto_oc = oc_map.get(ca.get('oc_codigo') or '', 0.0)

        d = por_anio[anio]
        d['total'] += 1
        d['presupuesto'] += presup
        if estado == 'Proveedor seleccionado':
            d['adjudicadas'] += 1
        elif estado == 'Desierta':
            d['desiertas'] += 1
        elif estado == 'Cancelada':
            d['canceladas'] += 1

        if monto_oc > 0:
            d['monto_oc'] += monto_oc
            d['ahorro'] += presup - monto_oc

        try:
            cot = int(ca.get('totalproveedorescotizando') or 0)
            if cot > 0:
                d['sum_cotizantes'] += cot
                d['n_con_cotizantes'] += 1
        except (ValueError, TypeError):
            pass

        if mes:
            k = (anio, mes)
            por_mes_anio[k]['cantidad'] += 1
            por_mes_anio[k]['monto_oc'] += monto_oc
            por_mes_anio[k]['presupuesto'] += presup

    # Proveedores únicos por año — dict O(1) en lugar de búsqueda O(N) por registro
    ca_anio_map = {
        ca['codigocompraagil']: (ca.get('fechapublicacion') or '')[:4]
        for ca in all_ca
        if ca.get('codigocompraagil')
    }
    for prov in CompraAgilProveedor.objects.values('codigocompraagil', 'rutproveedor'):
        ca_codigo = prov.get('codigocompraagil') or ''
        ca_anio = ca_anio_map.get(ca_codigo)
        if ca_anio and ca_anio.isdigit() and prov.get('rutproveedor'):
            por_anio[ca_anio]['proveedores'].add(prov['rutproveedor'])

    # Serializar
    anios_list = []
    for anio in sorted(por_anio.keys()):
        d = por_anio[anio]
        monto_oc = d['monto_oc']
        ahorro = d['ahorro']
        pct_adj = round(d['adjudicadas'] / d['total'] * 100, 1) if d['total'] else 0
        pct_ahorro = round(ahorro / monto_oc * 100, 1) if monto_oc > 0 else 0
        avg_cot = round(d['sum_cotizantes'] / d['n_con_cotizantes'], 1) if d['n_con_cotizantes'] else 0
        anios_list.append({
            'anio': anio,
            'total_ca': d['total'],
            'adjudicadas': d['adjudicadas'],
            'desiertas': d['desiertas'],
            'canceladas': d['canceladas'],
            'pct_adjudicacion': pct_adj,
            'presupuesto': round(d['presupuesto'], 0),
            'monto_oc': round(monto_oc, 0),
            'ahorro': round(ahorro, 0),
            'pct_ahorro': pct_ahorro,
            'proveedores_unicos': len(d['proveedores']),
            'avg_cotizantes': avg_cot,
        })

    # Heatmap mensual
    meses_list = []
    for (anio, mes), v in sorted(por_mes_anio.items()):
        meses_list.append({
            'anio': anio, 'mes': mes,
            'cantidad': v['cantidad'],
            'monto_oc': round(v['monto_oc'], 0),
            'presupuesto': round(v['presupuesto'], 0),
        })

    # Ranking unidades
    por_unidad = defaultdict(lambda: {'total': 0, 'monto_oc': 0.0})
    for ca in all_ca:
        u = ca.get('unidadcompra') or 'Sin unidad'
        por_unidad[u]['total'] += 1
        por_unidad[u]['monto_oc'] += oc_map.get(ca.get('oc_codigo') or '', 0.0)
    ranking_unidades = sorted(
        [{'unidad': k, 'total': v['total'], 'monto_oc': round(v['monto_oc'], 0)}
         for k, v in por_unidad.items()],
        key=lambda x: x['monto_oc'], reverse=True,
    )[:15]

    return {
        'por_anio': anios_list,
        'por_mes_anio': meses_list,
        'ranking_unidades': ranking_unidades,
    }


# =============================================================================
# ML — Clustering de productos (TF-IDF + K-means)
# =============================================================================

def calcular_clusters_productos(n_clusters=None):
    """
    Agrupa productos similares usando TF-IDF + K-means.
    Retorna clusters con nombre sugerido y productos miembros.
    """
    from .models import CompraAgilProducto, CompraAgilResumen
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    productos = list(CompraAgilProducto.objects.values(
        'codigocompraagil', 'codigoproducto', 'nombre', 'descripcion', 'cantidad',
    ))
    if len(productos) < 4:
        return {'clusters': [], 'n_productos': len(productos), 'advertencia': 'Datos insuficientes para clustering'}

    nombres = [p.get('nombre') or p.get('descripcion') or '' for p in productos]
    procesados = [preprocesar_texto(n) for n in nombres]

    textos_validos = [(i, t) for i, t in enumerate(procesados) if len(t.strip()) >= 3]
    if len(textos_validos) < 4:
        return {'clusters': [], 'n_productos': len(productos), 'advertencia': 'Texto insuficiente para clustering'}

    indices, corpus = zip(*textos_validos)

    vectorizer = TfidfVectorizer(max_features=300, ngram_range=(1, 2), min_df=1)
    X = vectorizer.fit_transform(corpus)

    # Elegir k óptimo si no se especifica
    n_max = min(12, len(corpus) // 2)
    if n_max < 2:
        n_max = 2

    if n_clusters is None:
        best_k, best_score = 3, -1
        for k in range(2, n_max + 1):
            km = KMeans(n_clusters=k, random_state=42, n_init='auto', max_iter=200)
            labels = km.fit_predict(X)
            if len(set(labels)) > 1:
                try:
                    score = silhouette_score(X, labels, sample_size=min(500, len(corpus)))
                    if score > best_score:
                        best_score, best_k = score, k
                except Exception:
                    pass
        k_final = best_k
    else:
        k_final = min(int(n_clusters), n_max)

    km_final = KMeans(n_clusters=k_final, random_state=42, n_init='auto', max_iter=300)
    labels_final = km_final.fit_predict(X)

    # Obtener términos más representativos de cada cluster
    feature_names = vectorizer.get_feature_names_out()
    centros = km_final.cluster_centers_

    clusters = defaultdict(list)
    for idx, label in zip(indices, labels_final):
        clusters[int(label)].append(productos[idx])

    resultado = []
    for cluster_id, prods in sorted(clusters.items()):
        top_terms_idx = centros[cluster_id].argsort()[-4:][::-1]
        nombre_sugerido = ' / '.join(
            feature_names[i].title() for i in top_terms_idx
            if centros[cluster_id][i] > 0
        ) or f'Grupo {cluster_id + 1}'

        # Años en que aparece este cluster
        ca_codigos = {p['codigocompraagil'] for p in prods if p.get('codigocompraagil')}
        ca_anios = set()
        for ca in CompraAgilResumen.objects.filter(
            codigocompraagil__in=ca_codigos
        ).values('codigocompraagil', 'fechapublicacion'):
            a = (ca.get('fechapublicacion') or '')[:4]
            if a.isdigit():
                ca_anios.add(a)

        resultado.append({
            'cluster_id': cluster_id,
            'nombre_sugerido': nombre_sugerido,
            'n_productos': len(prods),
            'anios_activo': sorted(ca_anios),
            'productos': [
                {
                    'nombre': p.get('nombre') or '',
                    'codigo': p.get('codigoproducto') or '',
                    'ca': p.get('codigocompraagil') or '',
                }
                for p in prods[:20]
            ],
        })

    return {
        'clusters': resultado,
        'n_clusters': k_final,
        'n_productos': len(productos),
        'n_analizados': len(textos_validos),
    }


# =============================================================================
# ML — Asociaciones por proveedor (Apriori)
# =============================================================================

def calcular_asociaciones_proveedor(min_support=0.05):
    """
    Detecta qué productos tiende a ofrecer el mismo proveedor.
    Cada 'transacción' es un proveedor + los productos que cotizó.
    """
    from .models import CompraAgilProductoCotizado
    from mlxtend.frequent_patterns import apriori, association_rules
    import pandas as pd

    cotizaciones = list(CompraAgilProductoCotizado.objects.values(
        'rutproveedor', 'codigoproducto', 'nombreproducto',
    ))
    if not cotizaciones:
        return {'reglas': [], 'frecuentes': [], 'advertencia': 'Sin datos de cotizaciones'}

    # Construir tabla: proveedor → set de productos cotizados
    prov_productos = defaultdict(set)
    producto_nombre = {}
    for c in cotizaciones:
        rut = c.get('rutproveedor') or ''
        cod = c.get('codigoproducto') or ''
        nombre = preprocesar_texto(c.get('nombreproducto') or '')
        if rut and cod and nombre:
            prov_productos[rut].add(nombre)
            producto_nombre[cod] = nombre

    if len(prov_productos) < 3:
        return {'reglas': [], 'frecuentes': [], 'advertencia': 'Pocos proveedores para análisis'}

    # Vocabulario de productos normalizados
    vocab = sorted({p for prods in prov_productos.values() for p in prods})
    if len(vocab) < 2:
        return {'reglas': [], 'frecuentes': [], 'advertencia': 'Productos insuficientes'}

    # Matriz binaria proveedor × producto
    rows = []
    for rut, prods in prov_productos.items():
        rows.append({v: (v in prods) for v in vocab})

    import pandas as pd
    df = pd.DataFrame(rows, dtype=bool)

    # Apriori
    try:
        freq = apriori(df, min_support=min_support, use_colnames=True, max_len=4)
    except Exception:
        freq = apriori(df, min_support=max(min_support, 0.1), use_colnames=True, max_len=3)

    if freq.empty:
        return {'reglas': [], 'frecuentes': [], 'advertencia': 'No se encontraron patrones con el soporte mínimo'}

    frecuentes = []
    for _, row in freq.iterrows():
        items = list(row['itemsets'])
        if len(items) >= 2:
            frecuentes.append({
                'productos': sorted(items),
                'soporte': round(float(row['support']), 3),
                'n_proveedores': int(round(float(row['support']) * len(prov_productos))),
            })
    frecuentes.sort(key=lambda x: (-len(x['productos']), -x['soporte']))

    # Reglas de asociación
    reglas = []
    try:
        rules = association_rules(freq, metric='confidence', min_threshold=0.5, num_itemsets=len(freq))
        for _, r in rules.iterrows():
            antecedent = sorted(list(r['antecedents']))
            consequent = sorted(list(r['consequents']))
            reglas.append({
                'si_ofrece': antecedent,
                'tambien_ofrece': consequent,
                'confianza': round(float(r['confidence']), 2),
                'soporte': round(float(r['support']), 3),
                'lift': round(float(r['lift']), 2),
            })
        reglas.sort(key=lambda x: -x['lift'])
    except Exception:
        pass

    return {
        'frecuentes': frecuentes[:20],
        'reglas': reglas[:15],
        'n_proveedores': len(prov_productos),
        'n_productos_vocab': len(vocab),
        'min_support_usado': min_support,
    }


# =============================================================================
# ML — Asociaciones por unidad compradora (FP-Growth)
# =============================================================================

def calcular_apriori_comprador(min_support=0.05):
    """
    Detecta qué productos compra frecuentemente la misma unidad compradora.
    Cada 'transacción' es una unidad + los productos que compró en sus CAs.
    """
    from .models import CompraAgilProducto, CompraAgilResumen
    from mlxtend.frequent_patterns import fpgrowth, association_rules
    import pandas as pd

    # Mapa CA → unidad
    ca_unidad = {
        ca['codigocompraagil']: ca.get('unidadcompra') or 'Sin unidad'
        for ca in CompraAgilResumen.objects.values('codigocompraagil', 'unidadcompra')
        if ca.get('codigocompraagil')
    }

    productos = list(CompraAgilProducto.objects.values(
        'codigocompraagil', 'nombre',
    ))
    if not productos:
        return {'frecuentes': [], 'reglas': [], 'advertencia': 'Sin datos de productos'}

    # Unidad → set de productos
    unidad_productos = defaultdict(set)
    for p in productos:
        ca = p.get('codigocompraagil') or ''
        nombre = preprocesar_texto(p.get('nombre') or '')
        unidad = ca_unidad.get(ca, 'Sin unidad')
        if nombre and len(nombre) >= 3:
            unidad_productos[unidad].add(nombre)

    if len(unidad_productos) < 2:
        return {'frecuentes': [], 'reglas': [], 'advertencia': 'Pocas unidades para análisis'}

    vocab = sorted({p for prods in unidad_productos.values() for p in prods})
    if len(vocab) < 2:
        return {'frecuentes': [], 'reglas': [], 'advertencia': 'Vocabulario insuficiente'}

    rows = []
    for unidad, prods in unidad_productos.items():
        rows.append({v: (v in prods) for v in vocab})

    import pandas as pd
    df = pd.DataFrame(rows, dtype=bool)

    try:
        freq = fpgrowth(df, min_support=min_support, use_colnames=True, max_len=4)
    except Exception:
        freq = fpgrowth(df, min_support=max(min_support, 0.15), use_colnames=True, max_len=3)

    if freq.empty:
        return {'frecuentes': [], 'reglas': [], 'advertencia': 'No se encontraron patrones'}

    frecuentes = []
    for _, row in freq.iterrows():
        items = list(row['itemsets'])
        if len(items) >= 2:
            frecuentes.append({
                'productos': sorted(items),
                'soporte': round(float(row['support']), 3),
                'n_unidades': int(round(float(row['support']) * len(unidad_productos))),
            })
    frecuentes.sort(key=lambda x: (-len(x['productos']), -x['soporte']))

    reglas = []
    try:
        rules = association_rules(freq, metric='confidence', min_threshold=0.5, num_itemsets=len(freq))
        for _, r in rules.iterrows():
            reglas.append({
                'si_compra': sorted(list(r['antecedents'])),
                'tambien_compra': sorted(list(r['consequents'])),
                'confianza': round(float(r['confidence']), 2),
                'lift': round(float(r['lift']), 2),
            })
        reglas.sort(key=lambda x: -x['lift'])
    except Exception:
        pass

    return {
        'frecuentes': frecuentes[:20],
        'reglas': reglas[:15],
        'n_unidades': len(unidad_productos),
        'n_productos_vocab': len(vocab),
    }


# =============================================================================
# Scoring — Candidatos a convenio anual
# =============================================================================

def calcular_candidatos_convenio(umbral_monto=300000, umbral_frecuencia=3):
    """
    Identifica productos candidatos para convenio anual basado en:
    - Frecuencia de compra
    - Concentración en un proveedor
    - Años consecutivos activos
    - Monto acumulado
    """
    from .models import CompraAgilProducto, CompraAgilProveedor, CompraAgilResumen, OrdenCompra

    # Mapa CA → (unidad, año, monto_oc)
    oc_codigos_map = {}
    ca_meta = {}
    for ca in CompraAgilResumen.objects.values(
        'codigocompraagil', 'unidadcompra', 'fechapublicacion',
        'oc_codigo', 'estadoglosa',
    ):
        cod = ca.get('codigocompraagil') or ''
        if cod:
            ca_meta[cod] = {
                'unidad': ca.get('unidadcompra') or '',
                'anio': (ca.get('fechapublicacion') or '')[:4],
                'oc_codigo': ca.get('oc_codigo') or '',
                'estado': ca.get('estadoglosa') or '',
            }
            if ca.get('oc_codigo'):
                oc_codigos_map[ca['oc_codigo']] = cod

    oc_montos = {}
    if oc_codigos_map:
        for oc in OrdenCompra.objects.filter(
            codigo_oc__in=list(oc_codigos_map.keys())
        ).values('codigo_oc', 'TotalBruto'):
            oc_montos[oc['codigo_oc']] = _safe_float(oc.get('TotalBruto'))

    # Agrupar productos por nombre normalizado
    productos = list(CompraAgilProducto.objects.values(
        'codigocompraagil', 'nombre', 'cantidad',
    ))

    grupo_productos = defaultdict(list)
    for p in productos:
        nombre_norm = preprocesar_texto(p.get('nombre') or '')
        if len(nombre_norm) >= 3:
            grupo_productos[nombre_norm].append(p)

    # Mapa proveedor ganador por CA + mapa rut→nombre (evita N queries a DB después)
    rut_a_nombre = {}
    ganadores_ca = {}
    for prov in CompraAgilProveedor.objects.values(
        'codigocompraagil', 'rutproveedor', 'razonsocial', 'proveedorseleccionado',
    ):
        rut = prov.get('rutproveedor') or ''
        nombre = prov.get('razonsocial') or ''
        if rut and nombre:
            rut_a_nombre[rut] = nombre
        if str(prov.get('proveedorseleccionado', '')) in ('1', 'Si', 'si', 'True', 'true'):
            ganadores_ca[prov['codigocompraagil']] = {
                'rut': rut,
                'nombre': nombre,
            }

    candidatos = []
    for nombre_norm, prods in grupo_productos.items():
        if len(prods) < 2:
            continue

        ca_codigos = [p['codigocompraagil'] for p in prods if p.get('codigocompraagil')]
        anios = set()
        monto_total = 0.0
        proveedores_ganadores = []

        for ca_cod in ca_codigos:
            meta = ca_meta.get(ca_cod, {})
            anio = meta.get('anio', '')
            if anio.isdigit():
                anios.add(anio)
            oc_cod = meta.get('oc_codigo', '')
            monto_total += oc_montos.get(oc_cod, 0.0)
            ganador = ganadores_ca.get(ca_cod)
            if ganador and ganador['rut']:
                proveedores_ganadores.append(ganador['rut'])

        frecuencia = len(prods)
        n_anios = len(anios)

        # Proveedor dominante
        prov_dominante_rut, pct_dominancia, nombre_dominante = '', 0, ''
        if proveedores_ganadores:
            conteo = defaultdict(int)
            for r in proveedores_ganadores:
                conteo[r] += 1
            prov_dom_rut = max(conteo, key=conteo.get)
            pct_dom = round(conteo[prov_dom_rut] / len(proveedores_ganadores) * 100, 1)
            prov_dominante_rut = prov_dom_rut
            pct_dominancia = pct_dom
            # Lookup O(1) desde el mapa ya cargado — sin query adicional a DB
            nombre_dominante = rut_a_nombre.get(prov_dom_rut, '')

        # Scoring
        score = 0
        badges = []
        if frecuencia >= umbral_frecuencia:
            score += 1
            badges.append('Alta frecuencia')
        if pct_dominancia >= 60:
            score += 1
            badges.append('Proveedor único')
        if n_anios >= 2:
            score += 1
            badges.append('Recurrente')
        if monto_total >= umbral_monto:
            score += 1
            badges.append('Alto monto')

        if score == 0:
            continue

        nivel = 'Alto' if score >= 3 else 'Medio' if score == 2 else 'Bajo'

        # Nombre legible — Counter O(N) en lugar de max(set, key=list.count) O(N²)
        nombres_originales = [p.get('nombre') or '' for p in prods if p.get('nombre')]
        if nombres_originales:
            from collections import Counter
            nombre_display = Counter(nombres_originales).most_common(1)[0][0]
        else:
            nombre_display = nombre_norm

        candidatos.append({
            'nombre_producto': nombre_display,
            'nombre_normalizado': nombre_norm,
            'frecuencia': frecuencia,
            'anios_activo': sorted(anios),
            'n_anios': n_anios,
            'monto_acumulado': round(monto_total, 0),
            'proveedor_dominante': nombre_dominante or prov_dominante_rut,
            'pct_dominancia': pct_dominancia,
            'score': score,
            'nivel': nivel,
            'badges': badges,
        })

    candidatos.sort(key=lambda x: (-x['score'], -x['frecuencia'], -x['monto_acumulado']))
    return {
        'candidatos': candidatos[:50],
        'total_encontrados': len(candidatos),
        'umbral_monto': umbral_monto,
        'umbral_frecuencia': umbral_frecuencia,
    }
