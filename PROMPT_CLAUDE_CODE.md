# PROMPT PARA CLAUDE CODE — Integración Dashboard Anexo 3

Copia y pega esto en Claude Code desde la raíz de tu proyecto Django:

---

```
Necesito integrar un dashboard de "Anexo N°3 — Control de Deuda Flotante" a mi proyecto Django + React (Vite/JSX). El dashboard ya existe como HTML standalone y necesito conectarlo a la BD MySQL existente.

## CONTEXTO DEL PROYECTO

- Backend: Django con múltiples apps, la app principal de datos está en la carpeta donde están los models.py
- Frontend: React + Vite (archivos .jsx), config en vite.config.js
- BD: MySQL / MariaDB
- El modelo `Devengo` ya existe con tabla `devengo` (~16K registros)
- El modelo `DevengoSigfeAnual` ya existe con tabla `api_sigfe_devengo_anual`
- Ya tengo DRF instalado (Django REST Framework)

## LO QUE NECESITO QUE HAGAS (en orden):

### PASO 1 — Modelo ConceptoJerarquia
Primero lee mi models.py para entender la estructura. Luego agrega este modelo al final:

```python
class ConceptoJerarquia(models.Model):
    codigo = models.CharField('Código', max_length=12, unique=True, db_index=True)
    descripcion = models.CharField('Descripción completa', max_length=255)
    nivel = models.SmallIntegerField('Nivel (1-5)', db_index=True)
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
```

Ejecuta makemigrations y migrate.

### PASO 2 — Management Command para cargar jerarquía
Crea el management command `cargar_jerarquia.py` que:
- Recibe un archivo .xlsx como argumento (tiene 2 columnas: "Nivel" y "Concepto Presupuestario")
- Los códigos tienen longitudes: N1=2 chars, N2=4, N3=7, N4=10, N5=12
- Cada concepto tiene formato "CODIGO DESCRIPCION" (ej: "2101001 Sueldos y Sobresueldos")
- Para cada concepto, resuelve sus ancestros por prefijo del código
- Usa bulk_create con ignore_conflicts=True
- Tiene flag --limpiar para borrar registros previos

### PASO 3 — Vista Django que sirve el HTML con datos de BD
El archivo HTML del dashboard está en: [INDICAR RUTA DEL HTML]

Crea una vista `anexo3_dashboard_html` que:
1. Lee registros del modelo Devengo (o DevengoSigfeAnual según param ?fuente=)
2. Acepta filtro ?ue= para código unidad ejecutora
3. Transforma cada registro al formato D_SLIM del dashboard:
   - u: codigo_ue
   - pr: principal
   - td: tipo_documento (max 30 chars)
   - f: fecha_conforme (YYYY-MM-DD)
   - fd: fecha_documento (YYYY-MM-DD)
   - me: fecha_documento[:7] (mes emisión)
   - mp: 1 si id_chile_compra tiene valor, 0 si no
   - c1: catalogo_01 (sin prefijo "ProgramaPresupuestario - ", max 40)
   - c3: catalogo_03 (sin prefijo "DetalledeTransferencias - ", max 50)
   - c4: catalogo_04 (sin prefijo "UnidadesDemandantes - ", max 50)
   - cp: concepto_presupuestario (max 60)
   - vg: monto_vigente (entero)
   - di: monto_disponible (entero)
   - co: monto_consumido (entero)
   - a: año de fecha_conforme
   - m: mes de fecha_conforme (YYYY-MM)
   - Si catalogo_03 contiene "0404-PRAIS": c4=c3, c3="No Aplica"
4. Lee ConceptoJerarquia y construye lookup {codigo: [h1,h2,h3,h4,h5,nivel]}
5. Enriquece cada registro con h1,h2,h3,h4,h5,hn buscando por código del concepto
6. Lee el HTML, reemplaza `const D_SLIM=[];` por `const D_SLIM=[{datos...}];`
7. Retorna HttpResponse con content_type='text/html; charset=utf-8'

### PASO 4 — URLs
Agrega la URL:
```python
path('presupuesto/anexo3/dashboard/', anexo3_dashboard_html, name='anexo3-dashboard'),
```

### PASO 5 — Integrar en React
En el frontend, crea un componente que embeba el dashboard como iframe:
```jsx
<iframe src="/presupuesto/anexo3/dashboard/" style={{ width: '100%', height: 'calc(100vh - 80px)', border: 'none' }} />
```
Y agrega la ruta correspondiente en el router de React.

### PASO 6 — Proxy en Vite
En vite.config.js, asegurar que el proxy incluya:
```javascript
'/presupuesto': 'http://localhost:8000',
```

## NOTAS IMPORTANTES
- El HTML usa Chart.js via CDN, SheetJS via CDN — NO necesita npm install adicional
- El HTML es self-contained (~380KB vacío), todo inline
- La tabla devengo tiene campos: codigo_ue, principal, tipo_documento, fecha_documento, fecha_conforme, id_chile_compra, catalogo_01..05, concepto_presupuestario, monto_vigente, monto_disponible, monto_consumido
- El dashboard filtra registros donde los 3 montos son 0 (no los incluye)
- El HIER_LOOKUP ya está embebido en el HTML (116KB), así que la vista Django solo necesita inyectar D_SLIM

Empieza leyendo mi estructura de proyecto (tree), luego el models.py relevante, y después implementa paso a paso. Pregúntame antes de asumir rutas de archivos.
```

---

## INSTRUCCIONES DE USO

1. Abre Claude Code en la raíz de tu proyecto
2. Copia el HTML `anexo3_deuda_VACIO.html` a alguna carpeta de tu proyecto (ej: `apps/presupuesto/templates/`)
3. Copia el Excel `Jerarqui_Concepto_Presupouestario.xlsx` a algún lugar accesible
4. Pega el prompt de arriba
5. Cuando Claude Code pregunte por rutas, indícale dónde pusiste los archivos
6. Después de implementar, ejecuta:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   python manage.py cargar_jerarquia /ruta/al/Jerarqui_Concepto_Presupouestario.xlsx --limpiar
   ```
7. Arranca Django y accede a `/presupuesto/anexo3/dashboard/`
