# CLAUDE.md — ETL Scripts (api/)

Subagente de datos/ETL. Lee esto antes de tocar cualquier archivo en `api/`.

---

## Propósito

Scripts Python de extracción y carga de datos. Se ejecutan **manualmente** desde CLI (target: ejecución diaria). No son un servidor HTTP — no exponen endpoints.

---

## Scripts principales

| Script | Función | Menú CLI |
|---|---|---|
| `LI_SSO_SERVER.py` | ETL Licitaciones desde Mercado Público | 1-3: descarga, 5: unificar, 6: refresh, 7: sincronizar DB |
| `OC_SSO_SERVER.py` | ETL Órdenes de Compra + cruce PAC | 1-3: descarga, 5: unificar, 6: refresh, 7: enlace PAC, 8: sincronizar DB |
| `OC_SSO_PorDiaPeriodo_v2.py` | ETL OC por rango de fechas | Script directo |
| `data/data_loader.py` | Carga FSC, PAC, facturas con Streamlit | Interfaz visual separada |

---

## Configuración fija (en ambos scripts principales)

```python
CODIGO_ORGANISMO = "7296"      # Servicio de Salud Osorno
TICKET = "2798F2D3-..."        # API key Mercado Público — PENDIENTE: mover a variable de entorno
```

**Endpoint Licitaciones:** `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json`  
**Endpoint OC:** `https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra.json`

---

## Flujo de datos

```
Mercado Público API
       │ HTTPS (urllib) — actualmente SSL no verificado
       ▼
ETL Script (ThreadPoolExecutor 6 workers, throttle 50ms)
       │ backoff lineal, 5 reintentos
       ▼
CSV locales
├── api/LI_DSSO/DIARIO/    → LICITACION_SSO_YYYYMMDD_RESUMEN.csv + _DETALLES.csv
├── api/LI_DSSO/MAESTROS/  → Maestro_Resumen.csv + Maestro_Detalle.csv (consolidado)
├── api/OC_DSSO/DIARIO/    → SSO_YYYYMMDD_RESUMEN.csv + _DETALLES.csv
└── api/OC_DSSO/MAESTROS/  → OC_Maestro_Resumen.csv + OC_Maestro_Detalles.csv
       │
       ▼
guardar_en_django()
  - sys.path.append('../backend')
  - os.environ['DJANGO_SETTINGS_MODULE'] = 'core.settings'
  - django.setup()
  - Model.objects.all().delete() + Model.objects.bulk_create(...)
       │
       ▼
MariaDB bd_sistema
```

---

## Integración con Django — patrón actual

Los scripts importan el ORM de Django directamente:

```python
import sys, os, django
sys.path.append(str(pathlib.Path(__file__).parent.parent / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from api.models import Licitacion, DetalleLicitacion
```

**Ejecutar siempre desde la carpeta `api/`** para que el path relativo funcione:
```bash
cd api
python LI_SSO_SERVER.py
python OC_SSO_SERVER.py
```

---

## Estructura de archivos de datos

```
api/data/
├── data_loader.py              # Streamlit — interfaz de análisis exploratorio
├── data_fsc/                   # FSC 2025.xlsx — Formularios Solicitud Compra
├── data_pac/
│   ├── consolidar_pac.py
│   └── OCPAC_Maestro.csv       # Cruce PAC-OC para enlazar OC con proyectos
├── data_planificacionPac/      # PlanificacionPAC26.xlsx
├── data_devengo/
│   └── consolidar_devengo.py
├── data_facturas/
├── data_anexo1/
│   ├── anexo1_loader.py
│   ├── data_anexo1.py
│   └── jerarquia_presupuestaria.py
├── data_compraagil/
├── data_convenios/
├── data_panel/
├── data_peulla/
└── data_proveedores/
    ├── scraping_proveedores_v3_debug.py  # Versión activa del scraper
    └── (versiones anteriores v1, v2, con_login)
```

---

## Convenciones para nuevos scripts

### Estructura base de un script ETL
```python
import pathlib, sys, os

# Paths
RUTA_API = pathlib.Path(__file__).parent.absolute()
CARPETA_SALIDA = RUTA_API / "NUEVA_FUENTE"
CARPETA_SALIDA.mkdir(parents=True, exist_ok=True)

# Django setup
def setup_django():
    sys.path.insert(0, str(RUTA_API.parent / 'backend'))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
    import django
    django.setup()

# Siempre usar update_or_create en lugar de DELETE + bulk_create
def guardar_en_django(registros):
    setup_django()
    from api.models import MiModelo
    for r in registros:
        MiModelo.objects.update_or_create(
            pk=r['id'],
            defaults=r
        )
```

### Resiliencia — patrón de reintentos
```python
MAX_REINTENTOS = 5
ESPERA_BASE = 4.0  # segundos, backoff lineal

for intento in range(1, MAX_REINTENTOS + 1):
    try:
        response = hacer_request()
        break
    except Exception as e:
        time.sleep(ESPERA_BASE * intento)
else:
    print(f"⚠️ Falló tras {MAX_REINTENTOS} intentos")
    return None
```

---

## Pendientes críticos

| # | Problema | Impacto |
|---|---|---|
| 1 | `DELETE total + bulk_create` → si falla a mitad, la tabla queda vacía | Integridad de datos |
| 2 | `ssl._create_unverified_context()` — SSL no verificado | Seguridad |
| 3 | `TICKET` hardcodeado en el script | Seguridad |
| 4 | Ejecutar desde `api/` es requerido (path relativo frágil) | Operacional |

### Fix recomendado para #1 — usar transacción atómica
```python
from django.db import transaction

with transaction.atomic():
    Modelo.objects.all().delete()
    Modelo.objects.bulk_create(nuevos_registros, batch_size=500)
```

---

## Scripts legacy en `apiv1/`

```
apiv1/
├── Consolidar_Licitaciones.py   # Versión anterior — reemplazado por LI_SSO_SERVER.py
├── Consolidar_OC.py             # Versión anterior — reemplazado por OC_SSO_SERVER.py
├── LI_SSO_PorDiaPeriodo.py      # v1
├── LI_SSO_PorDiaPeriodo_v2.py   # v2
├── OC_SSO_PorDiaPeriodo.py      # v1
└── OC_SSO_PorDiaPeriodo2.py     # v2
```

No eliminar aún — pueden tener lógica de referencia útil.
