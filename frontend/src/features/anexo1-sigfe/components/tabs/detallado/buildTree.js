// Arma el árbol de drill-down (nivel 1→5) a partir de filas planas, por
// prefijo de código presupuestario — igual criterio que bld() en el HTML
// original, pero sin asumir largos fijos por nivel (más robusto).
export function buildTree(filas) {
    const porCodigo = new Map(filas.map((f) => [f.codigo, { ...f, hijos: [] }]));
    const codigos = [...porCodigo.keys()].sort((a, b) => a.length - b.length);
    const raices = [];

    for (const codigo of codigos) {
        const nodo = porCodigo.get(codigo);
        let mejorPadre = null;
        for (const otro of codigos) {
            if (otro !== codigo && codigo.startsWith(otro) && otro.length < codigo.length) {
                if (!mejorPadre || otro.length > mejorPadre.length) mejorPadre = otro;
            }
        }
        if (mejorPadre) {
            porCodigo.get(mejorPadre).hijos.push(nodo);
        } else {
            raices.push(nodo);
        }
    }
    return raices;
}
