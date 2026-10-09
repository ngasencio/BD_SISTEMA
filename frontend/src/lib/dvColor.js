// Colores del sistema de diseño DV-UI para gráficos.
// D3 y Chart.js dibujan en SVG/canvas y no resuelven `var(--dv-…)` (ni permiten `color + '33'` con una variable),
// así que se lee el valor hexadecimal actual del token desde el documento.

/** Valor hexadecimal actual de un token `--dv-*`; `respaldo` si no hay documento (pruebas) o el token no existe. */
export function dvColor(token, respaldo = '#8A94A6') {
    if (typeof document === 'undefined') return respaldo;
    const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return valor || respaldo;
}
