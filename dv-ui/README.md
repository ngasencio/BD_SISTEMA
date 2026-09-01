# DV-UI — Sistema de diseño

Extraído y reestructurado desde `Dashboard_Consolidado_DIVPRE.html`.

El archivo original tenía ~91.000 caracteres de CSS en un solo bloque, sin orden interno, con nombres de clase de dos letras y tres secciones que se sobrescribían entre sí. Funcionaba porque vivía solo. Esto es lo mismo, dividido en capas, renombrado y documentado.

---

## 1 · Estructura

```
css/
  dv-ui.css              ← punto de entrada (solo @imports)
  01-tokens.css          ← colores, tipografía, espaciado, sombras, curvas
  02-base.css            ← reset, tipografía del documento, utilidades
  03-layout.css          ← shell, sidebar, topbar, rejillas
  components/
    controls.css         ← botón, select, segmentado, tag
    chip.css             ← chip de estado (5 variantes)
    card.css             ← tarjeta KPI (normal y compacta)
    surface.css          ← panel, tile, hero, callout, fórmula, placeholder
    table.css            ← tabla de datos con filas expandibles
    dataviz.css          ← bullet, medidor, progreso, columnas, ranking, SVG
    overlay.css          ← modal, tira de mini-tarjetas, tooltip
  04-motion.css          ← animaciones de entrada y transición de página
  05-print.css           ← hoja de impresión
demo.html                ← todos los componentes en una página
```

**El orden de los `@import` no es decorativo.** Tokens antes que todo, impresión al final. Si lo alteras, la cascada se rompe en formas difíciles de diagnosticar.

### Uso

```html
<link rel="stylesheet" href="/css/dv-ui.css">
```

En producción, concatena y minifica en lugar de encadenar `@import` (cada uno es una petición HTTP en serie):

```bash
# Sin herramientas
cat css/01-tokens.css css/02-base.css css/03-layout.css \
    css/components/*.css \
    css/04-motion.css css/05-print.css > dist/dv-ui.css

# Con PostCSS
npx postcss css/dv-ui.css -o dist/dv-ui.min.css --use postcss-import cssnano
```

Nota sobre `components/*.css`: el glob los ordena alfabéticamente, y en este sistema eso funciona porque **ningún componente depende del orden de otro** — no hay dos que compitan por el mismo selector. Si añades uno que sí lo haga, nómbralo explícitamente en el `cat`.

---

## 2 · Los tres principios

**Un token, un lugar.** Ningún archivo fuera de `01-tokens.css` escribe un color, un tamaño de fuente o una sombra literal. Si te ves escribiendo `#0F69B4` en un componente, falta un token o estás usando el equivocado.

**El nombre describe el rol, no la apariencia.** `--dv-ok` y no `--dv-green`. Cuando la institución cambie la paleta —y va a pasar— cambias el valor y no tocas una sola clase.

**El componente no conoce su posición.** Ningún componente lleva `margin-top` ni `width`. El espaciado entre piezas es responsabilidad del contenedor (`.dv-grid`, `.dv-split`). Esto es lo que permite reutilizarlos sin pelear con márgenes heredados.

---

## 3 · Convención de nombres

```
.dv-componente                    bloque
.dv-componente__parte             elemento interno
.dv-componente--variante          variante permanente
.is-estado                        estado temporal (lo cambia el JS)
--dv-componente-propiedad         punto de personalización por instancia
```

Ejemplo completo:

```html
<article class="dv-card dv-card--compact is-muted"
         style="--dv-card-accent:#0F69B4">
  <div class="dv-card__title">Interoperabilidad</div>
  <div class="dv-card__value">30,2<u>%</u></div>
</article>
```

`is-*` va separado del bloque a propósito: es lo único que el JavaScript toca. Si tu código añade o quita una clase que no empieza con `is-`, es señal de que estás cambiando estructura desde el runtime, y eso casi siempre es un error de diseño.

---

## 4 · Equivalencias con el original

| Original | DV-UI | Qué es |
|---|---|---|
| `.app` | `.dv-app` | Shell |
| `aside` | `.dv-sidebar` | Barra lateral |
| `aside a` | `.dv-nav-item` | Ítem de navegación |
| `.navpill` | `.dv-nav-pill` | Indicador deslizante |
| `.tb` | `.dv-topbar` | Barra superior |
| `.mw` | `.dv-shell-main` | Columna principal |
| `.cr` | `.dv-breadcrumb` | Migas de pan |
| `.ct` | `.dv-topbar__actions` | Zona de filtros |
| `.gb` | `.dv-btn` | Botón |
| `.mb` | `.dv-btn--on-dark` | Botón sobre fondo oscuro |
| `select` | `.dv-select` | Select con flecha SVG |
| `.seg` | `.dv-segmented` | Control segmentado |
| `.tg` / `.tags` | `.dv-tag` / `.dv-tag-list` | Etiqueta |
| `.k` | `.dv-card` | Tarjeta KPI |
| `.k.kmin` | `.dv-card--compact` | Tarjeta KPI compacta |
| `.k.off` | `.dv-card.is-muted` | Tarjeta sin dato |
| `.k .t` / `.v` / `.m` / `.ft` / `.cu` | `.dv-card__title` / `__value` / `__meta` / `__footer` / `__cut` | Partes de la tarjeta |
| `.ch` + `.c-ok`…`.c-nc` | `.dv-chip` + `--ok --warn --watch --draft --none` | Chip de estado |
| `.cd` | `.dv-panel` | Panel |
| `.ih` | `.dv-panel--head` | Cabecera de indicador |
| `.cd h3` / `.sh` | `.dv-panel__title` / `__subtitle` | Título y subtítulo |
| `.tl` | `.dv-tile` | Tile de cifra |
| `.hero` | `.dv-hero` | Bloque de portada |
| `.note` / `.note.w` | `.dv-callout` / `--warn` | Nota destacada |
| `.fbox` | `.dv-formula` | Caja de metodología |
| `.soon` | `.dv-placeholder` | Bloque "próximamente" |
| `.hl` | `.dv-eyebrow` | Etiqueta en versalitas |
| `.sec` | `.dv-section` | Encabezado de sección |
| `.ejerow` / `.ejelab` | `.dv-group-row` / `__label` | Fila de grupo temático |
| `.grid` | `.dv-grid` | Rejilla fluida |
| `.two` / `.pair2` | `.dv-split` / `--wide` | Dos columnas asimétricas |
| `table` | `.dv-table` | Tabla |
| `.tw` | `.dv-table-scroll` | Envoltorio con scroll |
| `tr.sv` / `.op` | `.dv-row.is-expandable` / `.is-open` | Fila expandible |
| `tr.sb` | `.dv-row-sub` | Fila de detalle |
| `tr.tot` | `.dv-row-total` | Fila de total |
| `.cv` | `.dv-caret` | Chevron |
| `.bl` / `.bd` / `.ms` / `.tk` | `.dv-bullet` / `__band` / `__measure` / `__target` | Bullet chart |
| `.mini` | `.dv-meter` | Medidor en línea |
| `.vbwrap` / `.vbtrack` / `.vbbar` | `.dv-progress-group` / `__track` / `__bar` | Barra de progreso |
| `.msr` / `.mstrack` / `.msbar` | `.dv-columns` / `__track` / `__bar` | Columnas mensuales |
| `.lg` | `.dv-legend` | Leyenda discreta |
| `.mleg` | `.dv-scale-legend` | Leyenda de escala continua |
| `.rk` / `.rw` | `.dv-rank` / `__row` | Lista de ranking |
| `.ov` / `.md` | `.dv-overlay` / `.dv-modal` | Modal |
| `.mstrip` / `.mi` | `.dv-strip` / `.dv-mini` | Tira de mini-tarjetas |
| `.tt` | `.dv-tooltip` | Tooltip |
| `.zmap` | `.dv-map-box` | Contenedor de mapa |
| `svg text.bl2` / `.vl` | `.dv-svg-label` / `.dv-svg-value` | Texto dentro de SVG |
| `svg rect.bb` | `.dv-svg-bar` | Barra SVG |
| `svg .rg` / `.top` | `.dv-svg-region` / `.dv-svg-face` | Región de mapa |
| `.bgfx` | `.dv-bg-fx` | Fondo animado |
| `#sweep` | `.dv-sweep` | Barra de progreso superior |
| `.reveal` | `.dv-reveal` | Aparición al scroll |
| `.ft2` | `.dv-footnote` | Nota al pie |

---

## 5 · Los tres snippets de JS que el CSS necesita

El CSS es autónomo salvo en tres puntos. Son ~30 líneas en total.

### Halo que sigue al cursor (`.dv-card--compact`)

```js
document.querySelectorAll('.dv-card--compact').forEach(el => {
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--dv-mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--dv-my', `${e.clientY - r.top}px`);
  });
});
```

### Aparición al hacer scroll (`.dv-reveal`)

```js
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  });
}, { rootMargin: '0px 0px -10% 0px' });

document.querySelectorAll('.dv-reveal').forEach(el => io.observe(el));
```

`unobserve` después de disparar no es opcional: sin eso el observer sigue trabajando por cada scroll durante toda la sesión.

### Tooltip único (`.dv-tooltip`)

```js
const tip = document.querySelector('.dv-tooltip');

document.addEventListener('mousemove', e => {
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.classList.remove('is-visible'); return; }
  tip.textContent   = el.dataset.tip;
  tip.style.left    = `${e.clientX + 14}px`;
  tip.style.top     = `${e.clientY - 34}px`;
  tip.classList.add('is-visible');
});
```

Un solo nodo para toda la página, delegando desde `document`. El original enganchaba un listener por elemento después de cada render — con 250 filas eso son 250 listeners que hay que volver a crear en cada cambio de vista.

---

## 6 · Escalas de color para datos

Los colores de las visualizaciones **no** son tokens CSS: se calculan en JS porque son continuos. Los extremos sí están en `01-tokens.css`.

```js
const mix = (a, b, t) =>
  `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;

const LOW  = [138,  85,  24];   // --dv-scale-low   · lejos de la meta
const MID  = [232, 234, 238];   // --dv-scale-mid   · neutro
const HIGH = [ 10,  74, 128];   // --dv-scale-high  · sobre la meta
const PALE = [226, 235, 244];   // --dv-scale-pale

// Divergente: t ∈ [-1, 1]. Negativo = por debajo, positivo = por encima.
const diverging = t => t == null ? 'var(--dv-scale-empty)'
  : t >= 0 ? mix(MID, HIGH, Math.min(1, t))
           : mix(MID, LOW,  Math.min(1, -t));

// Secuencial: t ∈ [0, 1]. El piso de 0.04 evita que el 0 quede invisible.
const sequential = t => t == null ? 'var(--dv-scale-empty)'
  : mix(PALE, HIGH, Math.max(.04, Math.min(1, t)));
```

Dos advertencias sobre la escala divergente:

1. **No es segura para daltonismo por sí sola.** Azul y ámbar se distinguen razonablemente en deuteranopía, pero no lo des por hecho: acompaña siempre el color con el número, como hace el original.
2. **Normaliza contra el percentil 85, no contra el máximo.** El original lo hace y es correcto: un solo valor extremo comprime toda la escala y deja al resto indistinguible.

---

## 7 · Compatibilidad

| Función | Dónde se usa | Soporte |
|---|---|---|
| Variables CSS | Todo | Universal |
| `color-mix()` | Halo y borde de `.dv-card--compact` | Chrome/Edge 111+, Safari 16.4+, Firefox 113+ |
| `backdrop-filter` | `.dv-overlay` | Universal desde 2023 |
| `paint-order` | Texto SVG con contorno | Universal salvo IE |
| `transform-box: fill-box` | Animación de barras SVG | Universal salvo IE |
| `columns` | `.dv-rank` | Universal |

Si necesitas soportar navegadores anteriores a 2023, `color-mix()` es el único bloqueante real. Degrada limpio: sin él, la tarjeta compacta pierde el halo y el borde de color, pero sigue funcionando. Para forzar un respaldo:

```css
@supports not (color: color-mix(in srgb, red 50%, transparent)) {
  .dv-card--compact:hover { border-color: var(--dv-line-hover); }
  .dv-card--compact::after { display: none; }
}
```

---

## 8 · Qué corregí respecto del original

| Problema | Corrección |
|---|---|
| Sin estilo de foco de teclado | `:focus-visible` global en `02-base.css` |
| 30+ tamaños de fuente arbitrarios (10.2, 10.4, 10.6, 10.7…) | Escala de 10 pasos |
| Sin escala de espaciado; paddings sueltos | Escala de 8 pasos |
| 8 breakpoints (820, 860, 900, 1000, 1080, 1150, 1250) | 4 breakpoints |
| Reglas duplicadas que se anulaban (`main>div{animation}` declarado y luego cancelado) | Eliminadas |
| Un listener de tooltip por elemento, recreado en cada render | Delegación desde `document` |
| Nombres de 2 letras (`.k`, `.cd`, `.tl`, `.ih`) | Nombres semánticos con prefijo |
| Tabla ancha sin `thead` repetido al imprimir | `display: table-header-group` |

## 9 · Qué NO incluye

**La fuente.** Inter Variable venía incrustada como Data-URI base64 (~64 KB). Autoalójala o cárgala desde Google Fonts — instrucciones en la cabecera de `02-base.css`.

**El mapa.** Los polígonos de Chile y la lógica de extrusión 3D son datos y JavaScript, no CSS. `dataviz.css` trae los estilos que ese SVG necesita (`.dv-svg-region`, `.dv-svg-face`, `.dv-map-box`), pero la geometría hay que portarla aparte.

**Modo oscuro.** El original no lo tenía. Añadirlo ahora es viable precisamente porque todo pasa por tokens: bastaría redefinir el bloque `:root` dentro de `@media (prefers-color-scheme: dark)`. Los pares de estado (`--dv-ok` / `--dv-ok-bg`) necesitarían revisión de contraste, no solo inversión.
