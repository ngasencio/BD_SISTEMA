// Pruebas de la jerarquía de ítems de Compras Conjuntas — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHierarchy, getRadiusUni, parseItemCode } from './jerarquia.js';

const nodos = [
    { folio: 1, anho: 2026, estado: 'DC', monto_estimado: 1000, items_propios: ['22.04.004 - Materiales'] },
    // Un FSC con dos ítems (relación M:N): cuenta una sola vez en los niveles superiores.
    { folio: 2, anho: 2026, estado: 'AA', monto_estimado: 2000, items_propios: ['22.04.004 - Materiales', '22.04.005 - Otros'] },
    { folio: 3, anho: 2026, estado: 'DC', monto_estimado: 4000, items_propios: ['22.04.005 - Otros'] },
];
const grupos = [{ item_presupuestario: '22.04.004 - Materiales' }, { item_presupuestario: '22.04.005 - Otros' }];

const buscar = (nodo, code) => (nodo.code === code ? nodo : nodo.children.map((c) => buscar(c, code)).find(Boolean));

test('parseItemCode separa código, niveles y etiqueta', () => {
    assert.deepEqual(parseItemCode('22.04.004 - Materiales de Oficina'), { code: '22.04.004', parts: ['22', '04', '004'], label: 'Materiales de Oficina' });
    assert.deepEqual(parseItemCode('22.04'), { code: '22.04', parts: ['22', '04'], label: '' });
    assert.deepEqual(parseItemCode(''), { code: '', parts: [], label: '' });
    assert.deepEqual(parseItemCode(null), { code: '', parts: [], label: '' });
});

test('las hojas cuentan sus formularios y su monto', () => {
    const raiz = buildHierarchy(grupos, nodos);
    assert.equal(buscar(raiz, '22.04.004').n_formularios, 2);
    assert.equal(buscar(raiz, '22.04.004').monto_total, 3000);
    assert.equal(buscar(raiz, '22.04.005').n_formularios, 2);
    assert.equal(buscar(raiz, '22.04.005').monto_total, 6000);
});

test('los niveles superiores suman los formularios de sus hojas sin repetir los de varios ítems', () => {
    // Regresión: antes se agregaba ANTES de reunir los formularios y estos niveles quedaban en 0.
    const raiz = buildHierarchy(grupos, nodos);
    for (const code of ['22', '22.04', 'root']) {
        const nodo = buscar(raiz, code);
        assert.equal(nodo.n_formularios, 3, code);
        assert.equal(nodo.monto_total, 7000, code);
        assert.deepEqual(nodo.estados, { DC: 2, AA: 1 }, code);
    }
});

test('sin grupos ni nodos devuelve solo la raíz vacía', () => {
    const raiz = buildHierarchy([], []);
    assert.equal(raiz.children.length, 0);
    assert.equal(raiz.n_formularios, 0);
    assert.doesNotThrow(() => buildHierarchy(undefined, undefined));
});

test('getRadiusUni crece con el monto pero se mantiene entre 10 y 32', () => {
    assert.equal(getRadiusUni(0), 10);
    assert.ok(getRadiusUni(5_000_000) > getRadiusUni(500_000));
    assert.equal(getRadiusUni(1e15), 32);
});
