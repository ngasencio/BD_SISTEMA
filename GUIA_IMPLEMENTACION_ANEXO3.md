# Guía de Implementación — Dashboard Anexo 3 en Django + React (Vite)

## Contexto del Proyecto

| Aspecto | Tu Stack |
|---------|----------|
| Backend | Django (múltiples apps) |
| Frontend | React + Vite (archivos `.jsx`) |
| Base de Datos | MySQL / MariaDB |
| Modelo clave | `Devengo` (tabla `devengo`) / `DevengoSigfeAnual` (tabla `api_sigfe_devengo_anual`) |
| Jerarquía presup. | `Anexo1.ruta_jerarquica` + tabla nueva `concepto_jerarquia` |

---

## Arquitectura de Integración

```
┌─────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite)                                │
│                                                         │
│  src/pages/Anexo3Dashboard.jsx    ← Componente página   │
│  src/api/anexo3.js                ← Llamadas al API     │
│  src/components/anexo3/           ← Sub-componentes     │
│    ├── TreePresupuestario.jsx                           │
│    ├── ChartAcumulado.jsx                               │
│    ├── ChartCascada.jsx                                 │
│    ├── TablaResumenMensual.jsx                          │
│    └── FilterBar.jsx                                    │
└──────────────┬──────────────────────────────────────────┘
               │  fetch('/api/anexo3/devengo/')
               │  fetch('/api/anexo3/jerarquia/')
               ▼
┌─────────────────────────────────────────────────────────┐
│  BACKEND (Django)                                       │
│                                                         │
│  apps/presupuesto/                                      │
│    ├── models.py        ← Devengo + ConceptoJerarquia   │
│    ├── serializers.py   ← DRF serializers               │
│    ├── views.py         ← API views                     │
│    ├── urls.py          ← Rutas /api/anexo3/            │
│    └── management/commands/                             │
│        └── cargar_jerarquia.py  ← Carga inicial xlsx    │
└──────────────┬──────────────────────────────────────────┘
               │  ORM queries
               ▼
┌─────────────────────────────────────────────────────────┐
│  MySQL / MariaDB                                        │
│    ├── devengo                     (ya existe)          │
│    ├── api_sigfe_devengo_anual     (ya existe)          │
│    └── concepto_jerarquia          (NUEVO)              │
└─────────────────────────────────────────────────────────┘
```

---

## FASE 1 — Modelo de Jerarquía Presupuestaria (Backend)

### 1.1 Crear el modelo `ConceptoJerarquia`

Este modelo almacena los 702 conceptos presupuestarios con sus 5 niveles jerárquicos.

**Archivo:** `apps/presupuesto/models.py` (agregar al final)

```python
class ConceptoJerarquia(models.Model):
    """
    Jerarquía de conceptos presupuestarios — 5 niveles.
    N1 (2 chars)  = Subtítulo       (ej: 21 GASTOS EN PERSONAL)
    N2 (4 chars)  = Ítem            (ej: 2101 Personal de Planta)
    N3 (7 chars)  = Asignación      (ej: 2101001 Sueldos y Sobresueldos)
    N4 (10 chars) = Sub-asignación  (ej: 2101001001 Sueldos Bases)
    N5 (12 chars) = Detalle         (ej: 210100100101 Sueldo B Planta L 15076)
    """
    codigo = models.CharField('Código', max_length=12, unique=True, db_index=True)
    descripcion = models.CharField('Descripción completa', max_length=255)
    nivel = models.SmallIntegerField('Nivel (1-5)', db_index=True)

    # Ancestros denormalizados para consultas rápidas
    n1_codigo = models.CharField('Código N1', max_length=2, db_index=True)
    n1_desc = models.CharField('Subtítulo (N1)', max_length=100, blank=True, default='')
    n2_codigo = models.CharField('Código N2', max_length=4, blank=True, default='')
    n2_desc = models.CharField('Ítem (N2)', max_length=100, blank=True, default='')
    n3_codigo = models.CharField('Código N3', max_length=7, blank=True, default='')
    n3_desc = models.CharField('Asignación (N3)', max_length=150, blank=True, default='')
    n4_codigo = models.CharField('Código N4', max_length=10, blank=True, default='')
    n4_desc = models.CharField('Sub-asignación (N4)', max_length=200, blank=True, default='')
    n5_codigo = models.CharField('Código N5', max_length=12, blank=True, default='')
    n5_desc = models.CharField('Detalle (N5)', max_length=255, blank=True, default='')

    class Meta:
        db_table = 'concepto_jerarquia'
        verbose_name = 'Concepto Presupuestario (Jerarquía)'
        verbose_name_plural = 'Conceptos Presupuestarios (Jerarquía)'
        ordering = ['codigo']
        indexes = [
            models.Index(fields=['n1_codigo']),
            models.Index(fields=['n2_codigo']),
            models.Index(fields=['n3_codigo']),
        ]

    def __str__(self):
        return f"N{self.nivel} | {self.descripcion}"
```

### 1.2 Migración

```bash
python manage.py makemigrations presupuesto
python manage.py migrate
```

### 1.3 Management Command — Cargar jerarquía desde Excel

**Archivo:** `apps/presupuesto/management/commands/cargar_jerarquia.py`

```python
"""
Carga la jerarquía de conceptos presupuestarios desde el Excel.
Uso: python manage.py cargar_jerarquia /ruta/a/Jerarqui_Concepto_Presupouestario.xlsx
"""
import openpyxl
from django.core.management.base import BaseCommand
from apps.presupuesto.models import ConceptoJerarquia


# Longitud de código por nivel
NIVEL_LEN = {1: 2, 2: 4, 3: 7, 4: 10, 5: 12}


class Command(BaseCommand):
    help = 'Carga jerarquía presupuestaria desde Excel (Nivel + Concepto Presupuestario)'

    def add_arguments(self, parser):
        parser.add_argument('archivo', type=str, help='Ruta al archivo .xlsx')
        parser.add_argument('--limpiar', action='store_true',
                            help='Eliminar registros existentes antes de cargar')

    def handle(self, *args, **options):
        ruta = options['archivo']
        if options['limpiar']:
            n, _ = ConceptoJerarquia.objects.all().delete()
            self.stdout.write(f'🗑️  Eliminados {n} registros previos')

        wb = openpyxl.load_workbook(ruta, read_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(min_row=2, values_only=True))  # saltar header
        wb.close()

        # Paso 1: construir diccionario código → descripción completa
        code_full = {}
        entries = []
        for nivel_raw, concepto_raw in rows:
            if not nivel_raw or not concepto_raw:
                continue
            nivel = int(nivel_raw)
            concepto = str(concepto_raw).strip()
            codigo = concepto.split(' ', 1)[0]
            code_full[codigo] = concepto
            entries.append((codigo, concepto, nivel))

        # Paso 2: para cada concepto, resolver ancestros
        objs = []
        for codigo, concepto, nivel in entries:
            data = {
                'codigo': codigo,
                'descripcion': concepto,
                'nivel': nivel,
                'n1_codigo': '', 'n1_desc': '',
                'n2_codigo': '', 'n2_desc': '',
                'n3_codigo': '', 'n3_desc': '',
                'n4_codigo': '', 'n4_desc': '',
                'n5_codigo': '', 'n5_desc': '',
            }

            # Asignar el nivel propio
            data[f'n{nivel}_codigo'] = codigo
            data[f'n{nivel}_desc'] = concepto

            # Buscar ancestros por prefijo
            for anc_nivel in range(1, nivel):
                anc_len = NIVEL_LEN[anc_nivel]
                prefix = codigo[:anc_len]
                if prefix in code_full:
                    data[f'n{anc_nivel}_codigo'] = prefix
                    data[f'n{anc_nivel}_desc'] = code_full[prefix]

            objs.append(ConceptoJerarquia(**data))

        # Paso 3: bulk create
        ConceptoJerarquia.objects.bulk_create(objs, ignore_conflicts=True)
        self.stdout.write(self.style.SUCCESS(
            f'✅ Cargados {len(objs)} conceptos presupuestarios (5 niveles)'
        ))
```

**Ejecutar:**
```bash
python manage.py cargar_jerarquia /ruta/a/Jerarqui_Concepto_Presupouestario.xlsx --limpiar
```

---

## FASE 2 — API REST (Django)

### 2.1 Serializers

**Archivo:** `apps/presupuesto/serializers.py` (agregar)

```python
from rest_framework import serializers
from .models import Devengo, DevengoSigfeAnual, ConceptoJerarquia


class DevengoListSerializer(serializers.Serializer):
    """Serializer ligero para el dashboard — solo campos necesarios."""
    u = serializers.CharField(source='codigo_ue')
    pr = serializers.CharField(source='principal')
    td = serializers.CharField(source='tipo_documento')
    f = serializers.DateField(source='fecha_conforme')
    fd = serializers.DateField(source='fecha_documento')
    cp = serializers.CharField(source='concepto_presupuestario')
    c1 = serializers.CharField(source='catalogo_01')
    c3 = serializers.CharField(source='catalogo_03')
    c4 = serializers.CharField(source='catalogo_04')
    vg = serializers.DecimalField(source='monto_vigente', max_digits=20, decimal_places=0)
    di = serializers.DecimalField(source='monto_disponible', max_digits=20, decimal_places=0)
    co = serializers.DecimalField(source='monto_consumido', max_digits=20, decimal_places=0)
    mp = serializers.SerializerMethodField()

    def get_mp(self, obj):
        return 1 if obj.id_chile_compra and obj.id_chile_compra.strip() else 0


class JerarquiaLookupSerializer(serializers.Serializer):
    """Retorna el mapa de lookup para el frontend: {codigo: [h1,h2,h3,h4,h5,nivel]}"""
    codigo = serializers.CharField()
    n1_desc = serializers.CharField()
    n2_desc = serializers.CharField()
    n3_desc = serializers.CharField()
    n4_desc = serializers.CharField()
    n5_desc = serializers.CharField()
    nivel = serializers.IntegerField()
```

### 2.2 Views

**Archivo:** `apps/presupuesto/views.py` (agregar)

```python
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, F, Q, Value, CharField
from django.db.models.functions import Coalesce, Left, Substr, TruncMonth
from .models import Devengo, DevengoSigfeAnual, ConceptoJerarquia
from .serializers import DevengoListSerializer
import json


class Anexo3DevengoAPI(APIView):
    """
    GET /api/anexo3/devengo/
    Retorna todos los registros de devengo (Anexo 3) en formato ligero
    para el dashboard frontend.

    Query params opcionales:
      - ue: Código Unidad Ejecutora (filtra por establecimiento)
      - anio: Año (filtra por año de fecha_conforme)
      - fuente: 'devengo' (defecto) o 'sigfe_anual'
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fuente = request.query_params.get('fuente', 'devengo')
        ue = request.query_params.get('ue', '')
        anio = request.query_params.get('anio', '')

        if fuente == 'sigfe_anual':
            qs = DevengoSigfeAnual.objects.all()
        else:
            qs = Devengo.objects.all()

        if ue:
            qs = qs.filter(codigo_ue=ue)
        if anio:
            qs = qs.filter(fecha_conforme__year=int(anio))

        # Excluir filas sin montos
        qs = qs.exclude(
            monto_vigente=0,
            monto_disponible=0,
            monto_consumido=0,
        )

        serializer = DevengoListSerializer(qs, many=True)
        return Response(serializer.data)


class Anexo3JerarquiaAPI(APIView):
    """
    GET /api/anexo3/jerarquia/
    Retorna el diccionario de lookup de jerarquía presupuestaria.
    Formato: { "codigo": ["h1_desc", "h2_desc", "h3_desc", "h4_desc", "h5_desc", nivel], ... }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conceptos = ConceptoJerarquia.objects.all().values(
            'codigo', 'n1_desc', 'n2_desc', 'n3_desc', 'n4_desc', 'n5_desc', 'nivel'
        )
        lookup = {}
        for c in conceptos:
            lookup[c['codigo']] = [
                c['n1_desc'] or '',
                c['n2_desc'] or '',
                c['n3_desc'] or '',
                c['n4_desc'] or '',
                c['n5_desc'] or '',
                c['nivel'],
            ]
        return Response(lookup)


class Anexo3ResumenAPI(APIView):
    """
    GET /api/anexo3/resumen/
    KPIs agregados pre-calculados en el servidor para carga rápida.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        fuente = request.query_params.get('fuente', 'devengo')
        ue = request.query_params.get('ue', '')

        Model = DevengoSigfeAnual if fuente == 'sigfe_anual' else Devengo
        qs = Model.objects.all()
        if ue:
            qs = qs.filter(codigo_ue=ue)

        totales = qs.aggregate(
            total_vigente=Coalesce(Sum('monto_vigente'), 0),
            total_disponible=Coalesce(Sum('monto_disponible'), 0),
            total_consumido=Coalesce(Sum('monto_consumido'), 0),
            total_registros=Count('id'),
            proveedores_unicos=Count('principal', distinct=True),
            conceptos_unicos=Count('concepto_presupuestario', distinct=True),
        )

        # Unidades Ejecutoras disponibles (para filtro)
        ues = list(
            qs.values_list('codigo_ue', flat=True)
              .distinct()
              .order_by('codigo_ue')
        )

        return Response({
            **totales,
            'unidades_ejecutoras': ues,
        })
```

### 2.3 URLs

**Archivo:** `apps/presupuesto/urls.py` (agregar)

```python
from django.urls import path
from .views import Anexo3DevengoAPI, Anexo3JerarquiaAPI, Anexo3ResumenAPI

urlpatterns = [
    # ... tus rutas existentes ...

    # Anexo 3 — Dashboard API
    path('api/anexo3/devengo/', Anexo3DevengoAPI.as_view(), name='anexo3-devengo'),
    path('api/anexo3/jerarquia/', Anexo3JerarquiaAPI.as_view(), name='anexo3-jerarquia'),
    path('api/anexo3/resumen/', Anexo3ResumenAPI.as_view(), name='anexo3-resumen'),
]
```

---

## FASE 3 — Frontend (React + Vite)

### 3.1 Capa API

**Archivo:** `frontend/src/api/anexo3.js`

```javascript
const BASE = '/api/anexo3';

/**
 * Obtiene todos los registros de devengo para el dashboard.
 * @param {Object} params - { ue, anio, fuente }
 * @returns {Promise<Array>} Array de registros slim
 */
export async function fetchDevengo(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/devengo/?${qs}`, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

/**
 * Obtiene el lookup de jerarquía presupuestaria.
 * Se cachea en memoria porque no cambia durante la sesión.
 * @returns {Promise<Object>} { codigo: [h1, h2, h3, h4, h5, nivel] }
 */
let _hierCache = null;
export async function fetchJerarquia() {
  if (_hierCache) return _hierCache;
  const res = await fetch(`${BASE}/jerarquia/`, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  _hierCache = await res.json();
  return _hierCache;
}

/**
 * KPIs pre-calculados del servidor.
 */
export async function fetchResumen(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/resumen/?${qs}`, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}
```

### 3.2 Enriquecer datos con jerarquía en el frontend

**Archivo:** `frontend/src/utils/enrichHierarchy.js`

```javascript
/**
 * Enriquece cada registro de devengo con sus niveles jerárquicos.
 * Se ejecuta UNA vez después de cargar datos + jerarquía.
 *
 * @param {Array} rows - Registros del API (array de objetos)
 * @param {Object} lookup - HIER_LOOKUP del API { codigo: [h1,h2,h3,h4,h5,nivel] }
 * @returns {Array} Registros enriquecidos con h1,h2,h3,h4,h5,hn
 */
export function enrichWithHierarchy(rows, lookup) {
  return rows.map(r => {
    const cp = r.cp || '';
    const code = cp.split(' ')[0];

    // Buscar match exacto, luego prefijos progresivos
    const h = lookup[code]
      || lookup[code.slice(0, 10)]
      || lookup[code.slice(0, 7)]
      || lookup[code.slice(0, 4)]
      || lookup[code.slice(0, 2)]
      || null;

    return {
      ...r,
      // Campos computados en frontend
      a: r.f ? r.f.slice(0, 4) : '',         // año (fecha conforme)
      m: r.f ? r.f.slice(0, 7) : '',         // mes (fecha conforme)
      me: r.fd ? r.fd.slice(0, 7) : '',      // mes emisión (fecha documento)
      mp: r.mp || 0,
      vg: Number(r.vg) || 0,
      di: Number(r.di) || 0,
      co: Number(r.co) || 0,
      // Jerarquía
      h1: h ? h[0] : '',
      h2: h ? h[1] : '',
      h3: h ? h[2] : '',
      h4: h ? h[3] : '',
      h5: h ? h[4] : '',
      hn: h ? h[5] : 0,
    };
  });
}
```

### 3.3 Componente principal — Página del Dashboard

**Archivo:** `frontend/src/pages/Anexo3Dashboard.jsx`

```jsx
import { useState, useEffect, useCallback } from 'react';
import { fetchDevengo, fetchJerarquia, fetchResumen } from '../api/anexo3';
import { enrichWithHierarchy } from '../utils/enrichHierarchy';

// Sub-componentes (los creas progresivamente)
// import TabResumen from '../components/anexo3/TabResumen';
// import TabDeuda from '../components/anexo3/TabDeuda';
// import TabPagos from '../components/anexo3/TabPagos';
// import TabArbol from '../components/anexo3/TabArbol';
// import FilterBar from '../components/anexo3/FilterBar';

const TABS = [
  { id: 'resumen',  icon: '📊', label: 'Resumen Ejecutivo' },
  { id: 'deuda',    icon: '⚠️', label: 'Deuda Flotante' },
  { id: 'pagos',    icon: '📈', label: 'Análisis de Pagos' },
  { id: 'prov',     icon: '🏢', label: 'Proveedores' },
  { id: 'arbol',    icon: '🌳', label: 'Árbol Presupuestario' },
  { id: 'concepto', icon: '📂', label: 'Concepto Presup.' },
];

export default function Anexo3Dashboard() {
  const [tab, setTab] = useState('resumen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data state
  const [allRows, setAllRows] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [hierLookup, setHierLookup] = useState({});

  // Filtros
  const [filters, setFilters] = useState({
    anio: '', ue: '', h1: '', h2: '', h3: '', concepto: '',
  });

  // ── Carga inicial ──
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [rawRows, hier] = await Promise.all([
          fetchDevengo(),
          fetchJerarquia(),
        ]);
        setHierLookup(hier);
        const enriched = enrichWithHierarchy(rawRows, hier);
        setAllRows(enriched);
        setFiltered(enriched);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // ── Aplicar filtros ──
  const applyFilters = useCallback((newFilters) => {
    setFilters(newFilters);
    let rows = allRows;
    if (newFilters.anio)     rows = rows.filter(r => r.a === newFilters.anio);
    if (newFilters.ue)       rows = rows.filter(r => r.u === newFilters.ue);
    if (newFilters.h1)       rows = rows.filter(r => r.h1 === newFilters.h1);
    if (newFilters.h2)       rows = rows.filter(r => r.h2 === newFilters.h2);
    if (newFilters.h3)       rows = rows.filter(r => r.h3 === newFilters.h3);
    if (newFilters.concepto) rows = rows.filter(r => r.cp.includes(newFilters.concepto));
    setFiltered(rows);
  }, [allRows]);

  if (loading) return <div className="p-8 text-center">Cargando datos Anexo 3...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="anexo3-dashboard">
      <header className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-800 to-blue-600 text-white rounded-lg mb-4">
        <span className="text-3xl">📊</span>
        <div>
          <h1 className="text-lg font-bold">Anexo N°3 — Control de Deuda Flotante</h1>
          <p className="text-xs opacity-70">
            {filtered.length.toLocaleString('es-CL')} registros · Dashboard jerárquico
          </p>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto mb-4 bg-gray-100 p-1 rounded-lg">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded text-sm font-medium whitespace-nowrap transition
              ${tab === t.id
                ? 'bg-white shadow text-blue-700'
                : 'text-gray-600 hover:bg-gray-200'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Filtros — implementar como componente aparte */}
      {/* <FilterBar filters={filters} data={allRows} onChange={applyFilters} /> */}

      {/* Tabs content */}
      <div className="tab-content">
        {tab === 'resumen' && <div>TODO: TabResumen con {filtered.length} filas</div>}
        {tab === 'deuda'   && <div>TODO: TabDeuda</div>}
        {tab === 'pagos'   && <div>TODO: TabPagos</div>}
        {tab === 'prov'    && <div>TODO: TabProveedores</div>}
        {tab === 'arbol'   && <div>TODO: TabArbol</div>}
        {tab === 'concepto'&& <div>TODO: TabConcepto</div>}
      </div>
    </div>
  );
}
```

### 3.4 Ruta en React Router

En tu archivo de rutas (probablemente `src/App.jsx` o `src/routes.jsx`):

```jsx
import Anexo3Dashboard from './pages/Anexo3Dashboard';

// Dentro de tus rutas:
<Route path="/anexo3" element={<Anexo3Dashboard />} />
```

---

## FASE 4 — Enfoque Pragmático: Iframe del HTML Standalone

Si quieres resultados inmediatos sin reescribir todo en React, puedes servir el HTML standalone que ya tienes como una vista Django y embeber en tu app:

### 4.1 Vista Django que sirve el HTML con datos inyectados

**Archivo:** `apps/presupuesto/views.py` (agregar)

```python
from django.http import HttpResponse
from django.template import Template, Context
from pathlib import Path
import json


def anexo3_dashboard_html(request):
    """
    Sirve el dashboard HTML standalone con datos pre-inyectados desde la BD.
    URL: /presupuesto/anexo3/dashboard/
    """
    # 1. Leer datos de la BD
    fuente = request.GET.get('fuente', 'devengo')
    Model = DevengoSigfeAnual if fuente == 'sigfe_anual' else Devengo
    qs = Model.objects.exclude(
        monto_vigente=0, monto_disponible=0, monto_consumido=0,
    )

    ue = request.GET.get('ue', '')
    if ue:
        qs = qs.filter(codigo_ue=ue)

    rows = list(qs.values(
        'codigo_ue', 'principal', 'tipo_documento',
        'fecha_conforme', 'fecha_documento', 'id_chile_compra',
        'catalogo_01', 'catalogo_03', 'catalogo_04',
        'concepto_presupuestario',
        'monto_vigente', 'monto_disponible', 'monto_consumido',
    ))

    # 2. Transformar a formato D_SLIM
    d_slim = []
    for r in rows:
        fc = str(r['fecha_conforme'] or '')
        fd = str(r['fecha_documento'] or '')
        cp = (r['concepto_presupuestario'] or '')[:60]
        c3 = r['catalogo_03'] or ''
        c4 = r['catalogo_04'] or ''
        if '0404-PRAIS' in c3:
            c4 = c3; c3 = 'No Aplica'

        idcc = r['id_chile_compra'] or ''
        d_slim.append({
            'u':  r['codigo_ue'] or '',
            'pr': r['principal'] or 'Desconocido',
            'td': (r['tipo_documento'] or '')[:30],
            'f':  fc[:10],
            'fd': fd[:10],
            'me': fd[:7],
            'mp': 1 if (idcc and idcc.strip()) else 0,
            'c1': (r['catalogo_01'] or '').replace('ProgramaPresupuestario - ', '')[:40],
            'c3': c3.replace('DetalledeTransferencias - ', '')[:50],
            'c4': c4.replace('UnidadesDemandantes - ', '')[:50],
            'cp': cp,
            'vg': int(r['monto_vigente'] or 0),
            'di': int(r['monto_disponible'] or 0),
            'co': int(r['monto_consumido'] or 0),
            'a':  fc[:4], 'm': fc[:7],
        })

    # 3. Leer jerarquía
    conceptos = ConceptoJerarquia.objects.all().values(
        'codigo', 'n1_desc', 'n2_desc', 'n3_desc', 'n4_desc', 'n5_desc', 'nivel',
    )
    hier_lookup = {}
    for c in conceptos:
        hier_lookup[c['codigo']] = [
            c['n1_desc'], c['n2_desc'], c['n3_desc'],
            c['n4_desc'], c['n5_desc'], c['nivel'],
        ]

    # 4. Enriquecer D_SLIM con jerarquía
    for row in d_slim:
        code = row['cp'].split(' ')[0] if row['cp'] else ''
        h = (hier_lookup.get(code)
             or hier_lookup.get(code[:10])
             or hier_lookup.get(code[:7])
             or hier_lookup.get(code[:4])
             or hier_lookup.get(code[:2]))
        if h:
            row['h1'] = h[0]; row['h2'] = h[1]; row['h3'] = h[2]
            row['h4'] = h[3]; row['h5'] = h[4]; row['hn'] = h[5]
        else:
            row['h1'] = row['h2'] = row['h3'] = row['h4'] = row['h5'] = ''
            row['hn'] = 0

    # 5. Leer HTML template y reemplazar D_SLIM
    html_path = Path(__file__).parent / 'templates' / 'anexo3_deuda_VACIO.html'
    html = html_path.read_text(encoding='utf-8')
    html = html.replace(
        'const D_SLIM=[];',
        f'const D_SLIM={json.dumps(d_slim, ensure_ascii=False, separators=(",",":"))}; '
    )

    return HttpResponse(html, content_type='text/html; charset=utf-8')
```

### 4.2 URL para la vista HTML

```python
# apps/presupuesto/urls.py
path('presupuesto/anexo3/dashboard/', anexo3_dashboard_html, name='anexo3-dashboard-html'),
```

### 4.3 Embeber en React (iframe o tab)

```jsx
// En cualquier componente React:
function Anexo3IframeView() {
  return (
    <iframe
      src="/presupuesto/anexo3/dashboard/"
      className="w-full border-0 rounded-lg"
      style={{ height: 'calc(100vh - 80px)' }}
      title="Anexo 3 — Control de Deuda"
    />
  );
}
```

---

## FASE 5 — Checklist de Implementación

### Backend (Django)

| # | Tarea | Archivo | Prioridad |
|---|-------|---------|-----------|
| 1 | Agregar modelo `ConceptoJerarquia` | `models.py` | P0 |
| 2 | Correr `makemigrations` + `migrate` | terminal | P0 |
| 3 | Crear management command `cargar_jerarquia` | `management/commands/` | P0 |
| 4 | Ejecutar carga del Excel de jerarquía | terminal | P0 |
| 5 | Crear API views (Devengo, Jerarquía, Resumen) | `views.py` | P1 |
| 6 | Registrar URLs `/api/anexo3/*` | `urls.py` | P1 |
| 7 | Copiar HTML a `templates/anexo3_deuda_VACIO.html` | `templates/` | P1 |
| 8 | Crear vista `anexo3_dashboard_html` (inyección BD) | `views.py` | P1 |

### Frontend (React)

| # | Tarea | Archivo | Prioridad |
|---|-------|---------|-----------|
| 9 | Crear `api/anexo3.js` (capa fetch) | `src/api/` | P1 |
| 10 | Crear `utils/enrichHierarchy.js` | `src/utils/` | P1 |
| 11 | Crear `Anexo3Dashboard.jsx` (scaffold) | `src/pages/` | P1 |
| 12 | Agregar ruta `/anexo3` en router | `App.jsx` / `routes.jsx` | P1 |
| 13 | Migrar tabs uno a uno a componentes React | `src/components/anexo3/` | P2 |

### Ruta recomendada de implementación

```
Semana 1:  Pasos 1-4 (modelo + carga jerarquía)
           Pasos 7-8 (HTML standalone servido desde Django)
           → Ya tienes el dashboard funcionando con datos reales de la BD

Semana 2:  Pasos 5-6 (API REST)
           Pasos 9-12 (scaffold React)
           → Dashboard embebido como iframe en tu app React

Semana 3+: Paso 13 (migración progresiva a componentes React nativos)
           → Cada tab se convierte en un componente React independiente
```

---

## Notas Técnicas

### Rendimiento con MySQL

Tu tabla `devengo` tiene ~16K registros. Para optimizar las queries:

```sql
-- Índice compuesto para los filtros más comunes del dashboard
ALTER TABLE devengo ADD INDEX idx_dev_ue_fecha (codigo_ue, fecha_conforme);

-- Para el gráfico de cascada por fecha de emisión
ALTER TABLE devengo ADD INDEX idx_dev_fecha_doc (fecha_documento);

-- Si usas DevengoSigfeAnual también:
ALTER TABLE api_sigfe_devengo_anual ADD INDEX idx_sigfe_ue_fecha (codigo_ue, fecha_documento);
```

### CORS (si React y Django corren en puertos distintos)

En `settings.py`:
```python
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',   # Vite dev server
]
```

### Chart.js en React

Para los gráficos, instalar en el frontend:
```bash
npm install chart.js react-chartjs-2
```

### Variables de entorno

En `vite.config.js`:
```javascript
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8000',              // Django dev
      '/presupuesto': 'http://localhost:8000',       // Dashboard HTML
    },
  },
});
```

---

## Resumen Ejecutivo

El camino más rápido a producción es la **FASE 4** (HTML standalone servido desde Django con datos inyectados desde la BD). Esto te da el dashboard completo funcionando con datos reales en un par de horas.

La **FASE 3** (componentes React nativos) es la ruta "correcta" a largo plazo, pero requiere reescribir los ~4000 líneas de JS del dashboard como componentes React con Chart.js y react-chartjs-2. Se recomienda hacerlo tab por tab de manera incremental.

Ambas rutas coexisten sin conflicto: puedes tener el iframe funcionando mientras migras gradualmente a React nativo.
