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
│   ├── urls.py            # Router + paths custom
│   ├── admin.py
│   └── migrations/
└── ordenes_compra/        # App en desarrollo — NO tiene URLs activas aún
    └── models.py          # Vacío — se llenará con el módulo de OC expandido
```

---

## Configuración clave (`core/settings.py`)

- `DEBUG = True`, `ALLOWED_HOSTS = ['*']` — solo desarrollo
- DB: MariaDB `127.0.0.1:3306`, base `bd_sistema`, usuario `root`
- `TIME_ZONE = 'America/Santiago'`
- JWT: access 1 día / refresh 7 días
- Cache: `LocMemCache` (volátil — se pierde al reiniciar)
- `CORS_ALLOW_ALL_ORIGINS = True`
- Paginación global: 50 registros (`PageNumberPagination`)
- **PENDIENTE:** mover credenciales a variables de entorno (`.env`)

---

## Modelos — Estado actual y convenciones

### PROBLEMA DE NAMING — Dos convenciones conviven

| App / Modelos | Convención | Estado |
|---|---|---|
| `Licitacion`, `OrdenCompra`, `DetalleLicitacion`, `DetalleOrdenCompra` | `PascalCase` en campos Python | Legado — vienen de la API Mercado Público |
| `Devengo`, `BoletaGarantia`, `Proveedor`, `Comprador`, `Anexo1` | `snake_case` en campos Python | Correcto — convención Django |

**Regla para código nuevo:** usar siempre `snake_case` con `db_column` si la columna en DB tiene otro nombre.

### Modelos activos

| Modelo | Tabla DB | PK | Notas |
|---|---|---|---|
| `Licitacion` | auto Django | `codigo_licitacion` | PascalCase legacy |
| `DetalleLicitacion` | auto Django | `id` | FK → Licitacion |
| `OrdenCompra` | `api_ordencompra` | `codigo_oc` | PascalCase legacy. `db_column='ID_Proyecto'` (antes tenía espacio) |
| `DetalleOrdenCompra` | `api_detalleordencompra` | `id` | FK → OrdenCompra |
| `Devengo` | `devengo` | `id` | snake_case correcto |
| `Anexo1` | `tabla_anexo1` | `id` | snake_case correcto |
| `Proveedor` | `T_Proveedores` | `rut` | Para módulo garantías |
| `Comprador` | `T_Comprador` | `id` | Para módulo garantías |
| `BoletaGarantia` | `T_BoletaGarantia` | `id` | CRUD completo + auditoría |
| `BoletaGarantiaAudit` | `T_BoletaGarantia_Audit` | `id` | Log JSON. `usuario`/`fecha_accion` semánticamente correctos |

---

## Endpoints REST completos

**Base URL:** `/api/`  
**Autenticación:** JWT Bearer en todos excepto `/auth/`

```
POST   /api/auth/login/                    TokenObtainPairView
POST   /api/auth/refresh/                  TokenRefreshView

GET    /api/dashboard/stats/               KPIs licitaciones (cache 5min)
GET    /api/devengo/stats/                 KPIs devengo (cache 5min) ?ue=&solo_deuda=1
GET    /api/devengo/raw_all/               Sin paginar ?ue=&desde=&hasta=&limit= (max 10000)
GET    /api/ordenes-compra/raw_all/        Sin paginar ?estado=&anio=&limit= (max 20000)

GET    /api/licitaciones/                  ?Estado=&C_NombreOrganismo=&Tipo=&EsRenovable=
GET    /api/licitaciones/{id}/
GET    /api/detalles/                      ?licitacion=&CodigoProducto=&Categoria=
GET    /api/devengo/                       ?codigo_ue=&tipo_documento=&concepto_presupuestario=&search=&ordering=
GET    /api/devengo/{id}/
GET    /api/ordenes-compra/                ?EstadoOC=&C_Unidad=&TipoOC=
GET    /api/ordenes-compra/{id}/
GET    /api/ordenes-compra-detalles/
CRUD   /api/boletas-garantia/              ?tipo_documento=&formato_documento=&banco=&proveedor=&comprador=&search=&ordering=
GET    /api/boletas-garantia/{id}/
GET    /api/boletas-garantia-audit/        Solo lectura
GET    /api/proveedores/                   ?search= (sin paginación)
GET    /api/compradores/                   ?search= (sin paginación)
```

### Estructura de respuesta de `devengo/stats/`
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

## Convenciones para código nuevo

### Nuevo endpoint estándar (ViewSet)
```python
# 1. Modelo en api/models.py (snake_case)
class NuevoModelo(models.Model):
    campo_uno = models.CharField(max_length=255)
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

### Endpoint custom con cache
```python
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mi_stats(request):
    cache_key = 'mi_stats_v1'
    if data := cache.get(cache_key):
        return Response(data)
    # calcular...
    cache.set(cache_key, data, timeout=300)
    return Response(data)
```

### Lógica de negocio compleja → `services.py`
Nunca poner lógica de agregación/cálculo en views. Va en `api/services.py`.

### Parámetros de URL — siempre validar tipos
```python
try:
    limit = min(int(request.GET.get('limit', 5000)), 10000)
except (ValueError, TypeError):
    limit = 5000
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
| 1 | Credenciales hardcoded en `settings.py` → mover a `.env` | Alta |
| 2 | `ordenes_compra` app vacía, no en INSTALLED_APPS | Media (se activa al desarrollar el módulo) |
| 3 | `LocMemCache` → migrar a Redis para 200 usuarios | Media |
| 4 | ETL sin rollback atómico (DELETE+bulk_create) → usar `update_or_create` | Alta |
| 5 | Tests vacíos — escribir tests para endpoints críticos | Media |
| 6 | `CORS_ALLOW_ALL_ORIGINS` → restringir en producción | Alta (antes de producción) |
