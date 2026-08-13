// Arma el árbol de drill-down (nivel 1→5) usando la jerarquía real resuelta
// en el backend contra `ConceptoJerarquia` (n1_codigo..n5_codigo por fila,
// ver `_enriquecer_jerarquia()` en services_anexo1_ejecucion.py) — reemplaza
// la heurística anterior por substring de código (`codigo.startsWith(otro)`,
// O(n²), sin nombres oficiales de nivel) por un anidado O(n) sobre códigos
// oficiales de la Contraloría/SIGFE.
export function buildTree(filas) {
    const porCodigo = new Map(filas.map((f) => [f.codigo, { ...f, hijos: [] }]));
    const raices = [];

    for (const f of filas) {
        const nodo = porCodigo.get(f.codigo);
        let codigoPadre = null;
        for (let n = f.nivel - 1; n >= 1; n--) {
            const ancestro = f[`n${n}_codigo`];
            if (ancestro && ancestro !== f.codigo && porCodigo.has(ancestro)) {
                codigoPadre = ancestro;
                break;
            }
        }
        if (codigoPadre) {
            porCodigo.get(codigoPadre).hijos.push(nodo);
        } else {
            raices.push(nodo);
        }
    }
    return raices;
}

// La descripción de ConceptoJerarquia viene con el código concatenado
// ("21 GASTOS EN PERSONAL", igual convención que concepto_presupuestario en
// toda la app) — para mostrarla junto al chip de código sin repetirlo.
export function nombreSinCodigo(desc, codigo) {
    if (!desc) return '';
    const prefijo = `${codigo} `;
    return desc.startsWith(prefijo) ? desc.slice(prefijo.length) : desc;
}
