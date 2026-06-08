# CLAUDE.md — Backend (Django REST API)

Subagente de backend. Lee esto antes de tocar cualquier archivo en `backend/`.

---

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| Python | 3.x | Lenguaje |
| Django | 4.2.29 | Framework web |
| Django REST Framework | 3.16.1 | API REST |
| mysqlclient | 2.2.8 | Driver MariaDB |
| django-cors-headers | 4.9.0 | CORS |
| simplejwt | 5.5.1 | Autenticación JWT |
| django-filter | latest | Filtros en ViewSets |
| pandas / numpy | latest | Procesamiento en services |
| scikit-learn | 1.8.0 | ML: TF-IDF, K-means, clustering |
| mlxtend | 0.24.0 | ML: Apriori, FP-Growth |
| nltk | 3.9.4 | ML: Stopwords, tokenización |
| python-decouple | latest | Variables de entorno (.env) |

---

## Estructura de apps

```
backend/
├── core/                  # Proyecto raíz
│   ├── settings.py        # Configuración — LEER ANTES de cambiar cualquier cosa
│   ├── urls.py            # Monta /admin/ y /api/
│   ├── wsgi.py / asgi.py
├── api/                   # App principal — todos los modelos y endpoints activos
│   ├── models.py
│   ├── views.py
│   ├── serializers.py
│   ├── services.py        # Lógica de negocio compleja (KPIs, agregaciones)
│   ├── ml_services.py     # Funciones ML (clustering, apriori, candidatos convenio)
│   ├── urls.py            # Router + paths custom
│   ├── admin.py
│   └── migrations/
└── ordenes_compra/        # App suspendida — NO tiene URLs activas, NO en INSTALLED_APPS
    └── models.py          # Vacío — se llenará con el módulo de OC expandido
```

---

## Configuración clave (`core/settings.py`)

- `DEBUG = True`, `ALLOWED_HOSTS = ['*']` — solo desarrollo
- DB: MariaDB `127.0.0.1:3306`, base `bd_sistema`, usuario `root`
- `TIME_ZONE = 'America/Santiago'`
- JWT: access 1 día / refresh 7 días
- Cache: `LocMemCache` (volátil — se pierde al reiniciar, no compartido entre workers)
- `CORS_ALLOW_ALL_ORIGINS = True`
- Paginación global: 50 registros (`PageNumberPagination`)
- **PENDIENTE:** mover credenciales a variables de entorno (`.env`)

---

## Modelos — Estado actual

### PROBLEMA DE NAMING — Dos convenciones conviven

| App / Modelos | Convención | Estado |
|---|---|---|
| `Licitacion`, `OrdenCompra`, `DetalleLicitacion`, `DetalleOrdenCompra` | `PascalCase` en campos Python | Legado — vienen de la API Mercado Público |
| Todos los demás modelos | `snake_case` en campos Python | Correcto — convención Django |

**Regla para código nuevo:** usar siempre `snake_case` con `db_column` si la columna en DB tiene otro nombre.

### Modelos activos completos

| Modelo | Tabla DB | PK | Notas |
|---|---|---|---|
| `Licitacion` | `api_licitacion` | `codigo_licitacion` | PascalCase legacy |
| `DetalleLicitacion` | `api_detallelicitacion` | `id` | FK → Licitacion |
| `OrdenCompra` | `api_ordencompra` | `codigo_oc` | PascalCase legacy. `TotalNeto`/`TotalBruto` son **TextField** — convertir con `Number()` / `Decimal()` |
| `DetalleOrdenCompra` | `api_detalleordencompra` | `id` | FK → OrdenCompra |
| `Factura` | `data_facturas` | `id` | `emision` almacenado como string DD-MM-YYYY |
| `PlanerPAC` | (auto) | `id` | Datos de planificación PAC cargados desde Excel |
| `CompraAgilResumen` | `api_compraagil_resumen` | `codigocompraagil` | `presupuestoestimado` es **TextField** |
| `CompraAgilDocumento` | `api_compraagil_documentos` | `id` | FK → CompraAgilResumen |
| `CompraAgilProducto` | `api_compraagil_productos` | `id` | FK → CompraAgilResumen |
| `CompraAgilProductoCotizado` | `api_compraagil_productos_cotizados` | `id` | Precios cotizados |
| `CompraAgilProveedor` | `api_compraagil_proveedores` | `id` | `proveedorseleccionado` es **inconsistente**: valores `"1"`, `"Si"`, `"si"`, `"True"`, `"true"` — verificar con `str(val) in ['1','Si','si','True','true']` |
| `RevisionOCCorregible` | (auto) | `id` | Revisión manual de enlace PAC-OC con resultado/motivo/observaciones |
| `Devengo` | `devengo` | `id` | snake_case correcto |
| `Anexo1` | `tabla_anexo1` | `id` | snake_case correcto |
| `Proveedor` | `T_Proveedores` | `rut` | Para módulo garantías |
| `Comprador` | `T_Comprador` | `id` | Para módulo garantías |
| `BoletaGarantia` | `T_BoletaGarantia` | `id` | CRUD completo + auditoría + file upload |
| `BoletaGarantiaAudit` | `T_BoletaGarantia_Audit` | `id` | Log JSON. `usuario`/`fecha_accion` semánticamente correctos |
| `GestionContrato` | `data_gestioncontratos` | `numero_contrato` | snake_case. `monto_por_ejecutar` nullable (ETL caps >10^13 to None). `fecha_inicio`/`fecha_termino` malformed strings ("07-00-2026" month=00 — use `dias_restantes`/`dias_vigencia` only). Join: `id_licitacion_oc = OrdenCompra.CodigoLicitacion` (~49% coverage). `TotalBruto` aggregation needs `Cast('TotalBruto', output_field=DecimalField(max_digits=20, decimal_places=2))`. `evaluacion` values: `"Evaluación Pendiente"`, `"--"`, or numeric string `"4"`/`"5"`. `EnlacePAC` values: `"Enlazada"`/`"No Enlazada"` — always compare `== 'Enlazada'`, never truthiness. |
| `FormularioFSC` | `data_formularios_fsc` | `id` | snake_case. Formularios Solicitud de Compra sincronizados desde Panel SSO (Selenium). `monto_estimado` es **BigIntegerField** — el origen lo trae como string con separador de miles ("672.000"), convertir con `.replace(".", "")`. **No tiene clave natural única** — `folio`/`folio+anho` se repiten (~33% colisión); el ETL usa `folio+anho+unidad_requirente+fecha_solicitud` para upsert. |
| `FormularioFSCDerivado` | `data_formularios_fsc_derivados` | `id` | snake_case. Superset de columnas de `FormularioFSC` + `comprador`/`estado_compra`/`fecha_derivado`. Misma regla de clave compuesta para upsert. |
| `FormularioFSCProducto` | `data_formularios_fsc_productos` | `id` | snake_case. Líneas de producto del "carro" de cada FSC. `tipo_formulario` usa `db_column='t_form'`. Clave de upsert: `folio+anho+tipo_formulario+categoria+producto+descripcion`. |

---

## Endpoints REST — Completo

**Base URL:** `/api/`
**Autenticación:** JWT Bearer en todos excepto `/auth/`

```
# Auth
POST   /api/auth/login/                        TokenObtainPairView
POST   /api/auth/refresh/                      TokenRefreshView

# Licitaciones
GET    /api/licitaciones/                      ?Estado=&C_NombreOrganismo=&Tipo=&EsRenovable=
GET    /api/licitaciones/{id}/
GET    /api/detalles/                          ?licitacion=&CodigoProducto=&Categoria=
GET    /api/dashboard/stats/                   KPIs licitaciones (cache 5min)

# Órdenes de Compra
GET    /api/ordenes-compra/                    ?EstadoOC=&C_Unidad=&TipoOC=
GET    /api/ordenes-compra/{id}/
GET    /api/ordenes-compra-detalles/
GET    /api/ordenes-compra/raw_all/            ?estado=&anio=&limit= (max 20000, sin paginar)
GET    /api/ordenes-compra/proyectos-licitacion/  CodigoLicitacion→ID_Proyecto map (cache 10min)
GET    /api/facturas/raw_all/                  ?anio= (sin paginar, emision como string DD-MM-YYYY)

# Devengo (Anexo N°3)
GET    /api/devengo/                           ?codigo_ue=&tipo_documento=&concepto_presupuestario=&search=&ordering=
GET    /api/devengo/{id}/
GET    /api/devengo/stats/                     ?ue=&solo_deuda= (cache 5min por combinación ue/flag)
GET    /api/devengo/raw_all/                   ?ue=&desde=&hasta=&limit= (max 10000)

# PAC
GET    /api/planer-pac/                        Filas del plan PAC
GET    /api/pac/indicadores-res188/            Indicadores ahorro Res.188/2026
GET    /api/pac/oc-stats/                      Estadísticas OC agregadas para PAC
GET    /api/pac/oc-productos/                  Productos por OC para análisis PAC

# Compra Ágil
GET    /api/compraagil-resumen/                ?estadoglosa=&unidadcompra=&search=
GET    /api/compraagil-productos/              ?codigocompraagil=
GET    /api/compraagil-proveedores/            ?codigocompraagil=
GET    /api/compraagil/ahorro-stats/           ?fecha_desde=&fecha_hasta= (cache 5min)

# Compra Ágil — ML
GET    /api/compraagil/comparativa-stats/      Estadísticas comparativas
GET    /api/compraagil/clusters/               ?n_clusters= K-means sobre productos (cache 15min)
GET    /api/compraagil/asociaciones/           ?min_support= Apriori proveedor (cache 15min)
GET    /api/compraagil/apriori-comprador/      ?min_support= FP-Growth por comprador (cache 15min)
GET    /api/compraagil/candidatos-convenio/    ?umbral_monto=&umbral_freq= scoring multicritério

# Garantías (Boletas)
GET    /api/proveedores/                       ?search= (sin paginación)
GET    /api/compradores/                       ?search= (sin paginación)
CRUD   /api/boletas-garantia/                  ?tipo_documento=&banco=&proveedor=&search=&ordering=
GET    /api/boletas-garantia/{id}/
GET    /api/boletas-garantia-audit/            Solo lectura

# Revisiones OC
CRUD   /api/revisiones-oc/                     ?codigo_oc=

# Gestión Contratos SSO
GET    /api/contratos/                         ?estado_contrato=&categoria_contrato=&tipo_contrato=&unidad_requirente=&search=
GET    /api/contratos/{numero_contrato}/
GET    /api/contratos/stats/                   Aggregated KPIs (cache 5min)
POST   /api/contratos/actualizar/              Launches async ETL → {task_id}
POST   /api/contratos/actualizar-cancelar/{task_id}/  Cancels running ETL (ctypes kill)
GET    /api/contratos/tarea-status/{task_id}/  Polls ETL progress
GET    /api/contratos/evaluaciones/            Res.188 evaluation analysis (cache 5min)
GET    /api/contratos/financiero/              OC reconciliation + financial projections (cache 5min)
GET    /api/contratos/oc-detalle/              ?id_licitacion_oc= OC+products for one contract (cache 5min per id)
GET    /api/contratos/plazos/                  Active contracts alert levels (cache 5min)
GET    /api/contratos/pac/                     PAC linkage pivot by year (cache 5min)

# Formularios FSC (Panel Documental SS Osorno — sincronizado vía Selenium, NO Excel)
GET    /api/formularios/stats/                 KPIs + distribuciones (cache 5min)
GET    /api/formularios-fsc/                   ?anho=&unidad_requirente=&estado=&search=
GET    /api/formularios-fsc-derivados/         ?anho=&estado_compra=&search=
GET    /api/formularios-fsc-productos/         ?anho=&categoria=
POST   /api/formularios/actualizar/            {rut, dv, clave} → {task_id} (credenciales Panel SSO, no persistidas)
GET    /api/formularios/actualizar-estado/<id>/
POST   /api/formularios/actualizar-cancelar/<id>/

# ETL — Actualización desde dashboard (hilo daemon, polling)
POST   /api/licitaciones/actualizar/           {fecha_desde, fecha_hasta} YYYY-MM-DD → {task_id}
GET    /api/licitaciones/actualizar-estado/<id>/  Estado del ETL + diff de cambios
POST   /api/ordenes-compra/actualizar/         {fecha_desde, fecha_hasta} YYYY-MM-DD → {task_id}
GET    /api/ordenes-compra/actualizar-estado/<id>/  Estado + diff (nuevas, cambiadas)
POST   /api/compraagil/actualizar/             {fecha_desde, fecha_hasta} YYYY-MM-DD → {task_id}
GET    /api/compraagil/actualizar-estado/<id>/  Estado del ETL Compra Ágil
```

### ETL endpoints — Response schema de estado

```json
{
  "task_id": "abc12345",
  "status": "iniciado | en_proceso | completado | error",
  "paso": 0-3,
  "paso_desc": "Descripción del paso actual",
  "total_dias": 7,
  "dias_completados": 4,
  "progreso_pct": 57,
  "progreso_sync_pct": 75,
  "logs_recientes": ["✅ Guardado en DIARIO: 20260603", "..."],
  "diff": {
    "nuevas": [...],
    "cambiadas": [...],
    "adjudicadas": [...],   // solo Licitaciones
    "nuevas_count": 12,
    "cambiadas_count": 4,
    "total_antes": 1247,
    "total_despues": 1259
  },
  "error": null
}
```

### ETL — Notas de implementación

- Los 3 scripts se importan dinámicamente con `sys.path.insert` apuntando a `api/`
- El stdout se redirige a `io.StringIO` via `contextlib.redirect_stdout()` para evitar errores `cp1252` con emojis en Windows
- El progreso real-time se captura via `progress_callback` (nativo en LI y OC) y via `_ETLLiveStream_*` (parser de stdout)
- El diff pre/post sync usa el ORM Django directamente (`Licitacion.objects.values(...)`)
- Solo puede correr una tarea por tipo a la vez (guard 409 en el endpoint POST)

---

## Servicios de lógica de negocio (`api/services.py`)

Funciones clave — nunca duplicar en views:

| Función | Módulo |
|---|---|
| `obtener_kpis_devengo(ue, solo_deuda)` | Devengo |
| `calcular_indicadores_res188()` | PAC |
| `calcular_oc_stats()` | PAC / OC |
| `calcular_oc_productos()` | PAC / OC |
| `calcular_compraagil_ahorro_stats(fecha_desde, fecha_hasta)` | Compra Ágil |
| `calcular_contratos_evaluaciones()` | Contratos — Res.188 evaluation classification |
| `calcular_contratos_financiero(filtros)` | Contratos — OC join, reconciliation, financial projection |
| `calcular_contratos_oc_detalle(id_licitacion_oc)` | Contratos — OC + DetalleOrdenCompra for one contract |
| `calcular_contratos_plazos(filtros)` | Contratos — active contracts with alerta_tiempo levels |
| `calcular_contratos_pac(filtros)` | Contratos — PAC linkage pivot (EnlacePAC) by year |
| `calcular_formularios_stats(anho=None)` | Formularios FSC — KPIs (total, derivados, monto estimado, % derivados) + distribuciones por estado/unidad/estado_compra |

---

## Servicios ML (`api/ml_services.py`)

| Función | Algoritmo | Módulo |
|---|---|---|
| `calcular_comparativa_stats()` | Estadística pura | Compra Ágil |
| `calcular_clusters_productos(n_clusters)` | TF-IDF + K-means | Compra Ágil |
| `calcular_asociaciones_proveedor(min_support)` | Apriori (mlxtend) | Compra Ágil |
| `calcular_apriori_comprador(min_support)` | FP-Growth (mlxtend) | Compra Ágil |
| `calcular_candidatos_convenio(umbral_monto, umbral_freq)` | Scoring multicritério | Compra Ágil |
| `preprocesar_texto(texto)` | NLTK + unidecode | Reutilizable |

**Regla crítica:** Convertir siempre numpy types a Python nativos antes de retornar:
```python
{'valor': float(np.float64(3.14))}   # ✅
{'valor': np.float64(3.14)}          # ❌ no serializable
```

---

## Patrón para nuevo endpoint estándar (ViewSet)

```python
# 1. Modelo en api/models.py (snake_case)
class NuevoModelo(models.Model):
    campo_uno = models.CharField(max_length=255, db_index=True)
    class Meta:
        db_table = 'nombre_tabla'

# 2. Serializer en api/serializers.py
class NuevoModeloSerializer(serializers.ModelSerializer):
    class Meta:
        model = NuevoModelo
        fields = '__all__'

# 3. ViewSet en api/views.py
class NuevoModeloViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NuevoModelo.objects.all()
    serializer_class = NuevoModeloSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['campo_uno']

# 4. Registrar en api/urls.py
router.register(r'nuevo-modelo', NuevoModeloViewSet)
```

## Patrón endpoint custom con cache

```python
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mi_stats(request):
    param = request.GET.get('filtro', '')
    cache_key = f'mi_stats_{param}'
    if data := cache.get(cache_key):
        return Response(data)
    data = calcular_mi_stats(param)
    cache.set(cache_key, data, timeout=300)
    return Response(data)
```

## Lógica de negocio → siempre en `services.py`

Nunca poner lógica de agregación/cálculo en views ni serializers.

## Validar parámetros de URL siempre

```python
try:
    limit = min(int(request.GET.get('limit', 5000)), 10000)
except (ValueError, TypeError):
    limit = 5000
```

---

## Estructura de respuesta de `devengo/stats/`

```json
{
  "kpis": {
    "deuda_total": float,
    "deuda_pagada": float,
    "monto_vigente": float,
    "pct_pendiente": float,
    "n_registros": int,
    "top_proveedor": string,
    "top_proveedor_monto": float,
    "top_ue": string,
    "top_ue_monto": float
  },
  "por_ue": [{"ue": str, "deuda": float}],
  "top_proveedores": [{"prov": str, "deuda": float}],
  "por_tipo_doc": [{"td": str, "deuda": float}],
  "por_n1": [{"cp": str, "deuda": float}]
}
```

---

## Migraciones

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Antes de crear modelos en `ordenes_compra/`, registrar la app en `core/settings.py` → `INSTALLED_APPS`.

---

## Archivos que NO deben estar en producción

- `backend/fix_login.py` — script de fix puntual (eliminar)
- `backend/add_cols.py` — script de utilidad (eliminar)
- `backend/run_err.txt` — log de errores (eliminar)

---

## Pendientes conocidos

| # | Problema | Prioridad |
|---|---|---|
| 1 | Credenciales hardcoded en `settings.py` → mover a `.env` con python-decouple | 🔴 Alta |
| 2 | `LocMemCache` → migrar a Redis para 200 usuarios | 🟠 Media |
| 3 | ETL sin rollback atómico (DELETE+bulk_create) → usar `transaction.atomic()` | 🔴 Alta |
| 4 | `CORS_ALLOW_ALL_ORIGINS` → restringir en producción | 🟠 Alta (antes de producción) |
| 5 | `facturas_raw_all` filtra año con slicing Python → usar query DB | 🟡 Media |
| 6 | `Factura.emision` como string DD-MM-YYYY → no indexable ni consultable por rango | 🟡 Media |
| 7 | Sin índices DB en columnas de filtro frecuente (EstadoOC, FechaEnvio, estadoglosa) | 🟡 Media |
| 8 | `ordenes_compra` app vacía, no en INSTALLED_APPS | 🟢 Baja (activar al desarrollar módulo OC) |
| 9 | Tests vacíos — escribir tests para endpoints críticos | 🟡 Media |
