# Prompt para Claude Code — Mapa 3D de arquitectura del sistema

> Cómo usarlo: abre Claude Code en la **raíz del proyecto** y pega todo lo que está bajo la línea. Reemplaza lo que está entre `{{ }}` antes de pegarlo.

---

## Rol y objetivo

Actúa como arquitecto de software que documenta un sistema existente. Tu trabajo tiene tres entregables:

1. Documentación en Markdown de cada parte del sistema y de sus conexiones externas.
2. Un archivo `graph.json` con nodos y relaciones. Es la **única fuente de verdad** del mapa.
3. Un HTML con Three.js que dibuja ese grafo en 3D de forma interactiva, **generado desde `graph.json`** con un script. No escribas los datos a mano dentro del HTML.

Nombre del sistema: `{{NOMBRE_DEL_SISTEMA}}`
Para qué sirve (una línea): `{{DESCRIPCION_CORTA}}`
Público de la presentación: `{{ej: jefatura, equipo TI, auditoría}}`

Trabaja por fases. **Detente al final de las fases 1 y 2** y espera mi aprobación antes de seguir.

---

## Reglas que aplican siempre

- **Toda relación necesita evidencia.** Cada arista lleva `evidencia` (archivo:línea, o el import/llamada/URL/consulta SQL que la prueba). Si deduces una relación sin encontrarla en el código, márcala `"confianza": "inferida"` y explica por qué. No inventes conexiones para que el grafo se vea más completo.
- **Nada sensible en los .md, el JSON ni el HTML:** ni contraseñas, tokens, API keys, cadenas de conexión, IPs internas, usuarios de BD, RUT, nombres de personas ni datos de pacientes o proveedores. Nombra la variable de entorno (ej. `DB_PASSWORD en .env`), nunca su valor. Si ves un secreto escrito directamente en el código, dilo en `hallazgos.md` sin copiar el valor.
- **La granularidad importa.** Apunta a **15–40 nodos**. Un nodo es un componente con responsabilidad propia (servicio, módulo, script, BD, API externa, carpeta de datos, tarea programada), no cada archivo. Si hay más, agrupa y deja el detalle en el .md del nodo.
- No modifiques código del proyecto. Solo crea archivos dentro de `docs/arquitectura/`.
- Si algo es ambiguo (por ejemplo, un módulo muerto o duplicado), anótalo en `hallazgos.md` en vez de adivinar.

---

## FASE 1 — Reconocimiento (sin escribir docs todavía)

1. Recorre el repositorio: estructura de carpetas, manifiestos (`package.json`, `requirements.txt`, `pyproject.toml`, `*.csproj`, etc.), puntos de entrada, configuración, `.env.example`, Dockerfiles, scripts, tareas programadas y SQL.
2. Identifica:
   - **Componentes internos**: qué hace cada uno, cuál es su punto de entrada y qué tecnología usa.
   - **Almacenes de datos**: bases de datos, archivos Excel/CSV, carpetas compartidas, caché.
   - **Conexiones externas**: APIs de terceros, portales que se scrapean, servicios de correo, SSO/LDAP, servicios en la nube. Para cada una: protocolo y dirección (entra o sale).
   - **Flujos principales**: 3 a 5 recorridos de punta a punta (ej. "usuario carga archivo → proceso → BD → reporte").
3. **Checkpoint 1.** Muéstrame solo esto:
   - Una tabla de **clusters** propuestos (entre 4 y 8), cada uno con nombre y color hex.
   - Una tabla de **nodos** candidatos: id, label, cluster y descripción de una línea.
   - La lista de conexiones externas.
   - Lo que no pudiste determinar.

   Espera mi OK.

---

## FASE 2 — Documentación Markdown + graph.json

Estructura de salida:

```
docs/arquitectura/
├── 00-resumen.md          # qué es el sistema, diagrama de flujos principales, stack, cómo se ejecuta
├── clusters.md            # cada cluster: propósito y nodos que contiene
├── nodos/<id>.md          # un archivo por nodo (plantilla abajo)
├── relaciones.md          # tabla completa de aristas con evidencia
├── externos.md            # todas las integraciones externas, auth (sin secretos), riesgo si fallan
├── hallazgos.md           # deuda técnica, código muerto, secretos a la vista, dudas
└── graph.json
```

Plantilla de `nodos/<id>.md`:

```markdown
# <Label>
- **Cluster:** <cluster>
- **Tipo:** servicio | módulo | script | bd | archivo | api-externa | ui | tarea-programada
- **Ubicación:** <ruta en el repo o URL del externo>
- **Tecnología:** <lenguaje / framework / versión si consta>
## Qué hace
<2–5 líneas en lenguaje claro, pensado para alguien no técnico>
## Entradas / Salidas
## Depende de  → (lista de ids con la relación)
## Lo usan      ← (lista de ids con la relación)
## Riesgos / notas
```

Esquema de `graph.json`:

```json
{
  "meta": { "sistema": "...", "descripcion": "...", "generado": "YYYY-MM-DD", "commit": "<hash si hay git>" },
  "clusters": { "<cid>": { "name": "...", "color": "#rrggbb" } },
  "nodes": [
    { "id": "kebab-case", "label": "Texto corto (≤22 chars)", "cluster": "<cid>",
      "tipo": "servicio", "path": "ruta/o/url", "tech": "Python 3.11",
      "desc": "2–3 frases claras.", "md": "nodos/<id>.md" }
  ],
  "edges": [
    { "a": "<id origen>", "b": "<id destino>", "rel": "etiqueta corta (≤24 chars)",
      "tipo": "http | sql | archivo | import | cola | scraping | manual",
      "evidencia": "src/x.py:42 — requests.get(API_URL)", "confianza": "verificada | inferida" }
  ]
}
```

La dirección de una arista va de **quien inicia o llama** hacia **quien responde o recibe**.

**Checkpoint 2.** Muéstrame un conteo de nodos, aristas y clusters, la lista de aristas `inferida` y un resumen de `hallazgos.md`. Espera mi OK.

---

## FASE 3 — Generador y HTML 3D

Crea `docs/arquitectura/build_graph.py` (Python estándar, sin dependencias externas) que:

1. Lee `graph.json` y lo **valida**: ids únicos, toda arista apunta a nodos que existen, todo nodo pertenece a un cluster que existe, no hay nodos huérfanos (si los hay, avisa), los colores son hex válidos. Además busca patrones de secretos (`password=`, `token`, `apikey`, `Bearer `, IPs privadas `10.` / `192.168.` / `172.16-31.`, formato RUT) y **falla** si encuentra alguno.
2. Inyecta el JSON dentro de `mapa-sistema.template.html`, en `<script id="graph-data" type="application/json">`, y escribe `mapa-sistema.html`.

   El motivo: abrir el HTML con doble clic (`file://`) bloquea `fetch()` de archivos locales, así que los datos tienen que ir dentro del HTML.

Especificación del HTML (un solo archivo, sin build):

**Base técnica**
- Three.js `0.160.0` por importmap desde `cdn.jsdelivr.net/npm/three@0.160.0/`, con `OrbitControls` de `three/addons/controls/OrbitControls.js`.
- `OrbitControls` con damping (`dampingFactor ≈ 0.06`), `autoRotate` activado al cargar (se detiene con la primera interacción), `minDistance`/`maxDistance` para acotar el zoom.
- Fondo oscuro (`#05060f`), `FogExp2` leve y un campo de ~1400 estrellas (`THREE.Points`) en una esfera lejana.
- Soporte de `resize` y `devicePixelRatio` limitado a 2.

**Layout**
- Anclas de cluster repartidas en una esfera de Fibonacci (radio ≈ 230). Cada nodo parte cerca de su ancla con un poco de ruido.
- Física force-directed que corre en cada frame:
  - repulsión entre todos los pares (`k/d²`, con tope);
  - resorte en cada arista (longitud de reposo ≈ 150);
  - atracción hacia el ancla del cluster;
  - leve atracción al centro;
  - amortiguación de velocidad ~0.86;
  - `alpha` de enfriamiento que decae hasta un mínimo (≈0.035) para que el grafo se asiente sin congelarse.

**Nodos**
- Esfera sólida del color del cluster, más un sprite de *glow* radial con `AdditiveBlending` hecho con una textura de canvas cacheada por color, más un sprite con la etiqueta de texto (textura de canvas) debajo del nodo.
- El tamaño de la esfera escala suave según el grado del nodo (número de conexiones).
- Pulso sutil de escala (±10 %).

**Aristas**
- Curva Bézier cuadrática entre los dos nodos, con punto de control perpendicular y curvatura determinista por índice. Se recalcula en cada frame.
- Color: mezcla de los colores de ambos clusters.
- Aristas `inferida` en línea punteada (`LineDashedMaterial` + `computeLineDistances`) o con opacidad menor.
- Etiqueta `rel` como sprite en el punto medio.
- 2 "paquetes" luminosos (`THREE.Points` con vertexColors) viajando de `a` hacia `b` para mostrar la dirección.

**Interacción**
- Raycaster solo contra las esferas.
- **Hover**: tooltip HTML con label y cluster; resalta el nodo y sus vecinos y atenúa el resto (nodos, etiquetas y aristas).
- **Click** (distinguir de arrastre: umbral de 6 px entre pointerdown y pointerup): abre un **modal** con:
  - label, chip de cluster con su color, tipo, tecnología y `path` en monoespaciado;
  - la descripción;
  - la lista de conexiones con flecha → (sale) / ← (entra), el nombre del otro nodo, `rel`, `tipo` y `evidencia` en texto pequeño.

  Cada conexión es clicable: lleva la cámara animada (lerp de 600 ms) hacia ese nodo y abre su modal. El modal se cierra con ✕, con ESC o con clic en el fondo.
- **Leyenda** de clusters (arriba a la derecha): clic en un chip aísla ese cluster y otro clic lo libera.
- **Toolbar** (abajo a la izquierda): "Centrar cámara", "Rotación on/off", "Ver todo", un **buscador** por label que enfoca el nodo encontrado y un toggle "Mostrar inferidas".
- **Header** (arriba a la izquierda): nombre del sistema, descripción y estadísticas (`N nodos · M relaciones · K clusters`).

**Estilo**
- Paneles con fondo translúcido, `backdrop-filter: blur`, borde sutil y bordes redondeados de 14 px.
- Tipografía `Segoe UI, system-ui`.
- Todo el texto de la UI en español.
- Construye el DOM con `textContent` (no `innerHTML`) para los datos que vienen del JSON.

---

## FASE 4 — Verificación

1. Ejecuta `python docs/arquitectura/build_graph.py` y muéstrame la salida de la validación.
2. Revisa que cada nodo tenga su `.md` y que cada `md` del JSON exista.
3. Si puedes, abre el HTML con un navegador headless (Playwright) y confirma que:
   - la consola no tiene errores;
   - el canvas renderiza;
   - un clic en un nodo abre el modal.
4. Entrega un resumen final con:
   - la lista de archivos creados;
   - cómo regenerar el mapa (`editar graph.json → python build_graph.py`);
   - las 3 relaciones o componentes que más conviene que un humano confirme.
