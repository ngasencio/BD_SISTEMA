// Lógica pura de Compras Conjuntas: jerarquía de ítems presupuestarios y utilidades de los grafos.
import { ESTADO_FSC_INFO } from '../shared.js';

/** Bandejas «en camino» que analiza la unificación (ASDA → DC). */
export const ESTADOS_UNIFICACION = ['ASDA', 'ADIR', 'AA', 'DC'];

/** Color de una bandeja (el mismo del flujo de visación). */
export const colorEstado = (estado) => ESTADO_FSC_INFO[estado]?.color || '#8A94A6';

/** Alto máximo de las columnas en cascada según la ventana (entre 300 y 500 px). */
export const alturaColumnas = () => Math.max(300, Math.min(Math.floor(window.innerHeight * 0.52), 500));

/** Radio de un nodo según el monto estimado (entre 10 y 32 px). */
export function getRadiusUni(monto) {
    return Math.max(10, Math.min(32, Math.sqrt((monto || 0) / 1500000) * 3 + 10));
}

/** «22.04.004 - Materiales de Oficina» → { code: '22.04.004', parts: ['22','04','004'], label: 'Materiales de Oficina' }. */
export function parseItemCode(itemPresupuestario) {
    if (!itemPresupuestario) return { code: '', parts: [], label: '' };
    const dashIdx = itemPresupuestario.indexOf(' - ');
    const code = dashIdx >= 0 ? itemPresupuestario.slice(0, dashIdx).trim() : itemPresupuestario.trim();
    const label = dashIdx >= 0 ? itemPresupuestario.slice(dashIdx + 3).trim() : '';
    const parts = code.split('.').filter(Boolean);
    return { code, parts, label };
}

const deduplicarFSC = (lista) => {
    const vistos = new Set();
    return lista.filter((f) => {
        const k = `${f.folio}-${f.anho}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
    });
};

const contarEstados = (lista) => {
    const est = {};
    lista.forEach((f) => { est[f.estado] = (est[f.estado] || 0) + 1; });
    return est;
};

/**
 * Árbol de ítems (22 → 22.04 → 22.04.004) con los FSC colgando de sus hojas. Un FSC puede tener
 * varios ítems (relación M:N): se inserta en cada uno y se deduplica al agregar hacia arriba.
 */
export function buildHierarchy(grupos, nodos) {
    const nodeMap = {};
    const root = {
        code: 'root', label: 'Todos los ítems', children: [], fscChildren: [], allFscDescendants: [],
        n_formularios: 0, monto_total: 0, estados: {}, isLeaf: false,
    };
    nodeMap.root = root;

    (grupos || []).forEach((grupo) => {
        const { code, parts, label } = parseItemCode(grupo.item_presupuestario);
        if (!code || parts.length === 0) return;
        let current = root;
        parts.forEach((_, depth) => {
            const pathCode = parts.slice(0, depth + 1).join('.');
            const esHoja = depth === parts.length - 1;
            if (!nodeMap[pathCode]) {
                const hijo = {
                    code: pathCode,
                    label: esHoja ? label : pathCode,
                    fullItem: esHoja ? grupo.item_presupuestario : pathCode,
                    children: [], fscChildren: [], allFscDescendants: [],
                    n_formularios: 0, monto_total: 0, estados: {},
                    isLeaf: esHoja,
                    grupoData: esHoja ? grupo : null,
                };
                nodeMap[pathCode] = hijo;
                current.children.push(hijo);
            } else if (esHoja) {
                nodeMap[pathCode].isLeaf = true;
                nodeMap[pathCode].grupoData = grupo;
                nodeMap[pathCode].label = label;
                nodeMap[pathCode].fullItem = grupo.item_presupuestario;
            }
            current = nodeMap[pathCode];
        });
    });

    (nodos || []).forEach((nodo) => {
        const items = nodo.items_propios?.length ? nodo.items_propios : (nodo.primary_item ? [nodo.primary_item] : []);
        items.forEach((item) => {
            const { code } = parseItemCode(item);
            if (nodeMap[code]) nodeMap[code].fscChildren.push(nodo);
        });
    });

    // Agregar desde las hojas hacia arriba.
    function aggregate(node) {
        node.children.forEach(aggregate);
        node.fscChildren = deduplicarFSC(node.fscChildren);
        const lista = node.isLeaf ? node.fscChildren : deduplicarFSC(node.children.flatMap((c) => c.allFscDescendants));
        node.n_formularios = lista.length;
        node.monto_total = lista.reduce((s, f) => s + (f.monto_estimado || 0), 0);
        node.estados = contarEstados(lista);
    }

    // Todos los FSC únicos de un subárbol (el orden importa: aggregate lo necesita de los hijos).
    function collectAllFSC(node) {
        const propios = node.fscChildren || [];
        const profundos = (node.children || []).flatMap(collectAllFSC);
        node.allFscDescendants = deduplicarFSC([...propios, ...profundos]);
        return node.allFscDescendants;
    }

    collectAllFSC(root);
    aggregate(root);
    return root;
}
