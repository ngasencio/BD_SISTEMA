// Pruebas de la lógica de Temporalidad — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filasJerarquia, idsDeDepartamento, idsDeSubdepartamento, idsDeSubdireccion, notaDesempeno, resumenDeAlcance, varianteNota,
} from './logica.js';

test('notaDesempeno: sin muestra suficiente no hay nota', () => {
    assert.equal(notaDesempeno(2, 2, 100, 100), null);
    assert.equal(notaDesempeno(0, 0, 0, 0), null);
});

test('notaDesempeno: 100 % Dentro es 7.0, 0 % es 1.0 y 50 % es 4.0', () => {
    assert.equal(notaDesempeno(10, 10, 500, 500), 7.0);
    assert.equal(notaDesempeno(10, 0, 0, 500), 1.0);
    assert.equal(notaDesempeno(10, 5, 250, 500), 4.0);
});

test('notaDesempeno: pondera por mitades la cantidad y el monto', () => {
    // 100 % por cantidad, 0 % por monto → score 50 → 4.0
    assert.equal(notaDesempeno(4, 4, 0, 1000), 4.0);
    // Sin monto total se usa el porcentaje por cantidad también para el monto.
    assert.equal(notaDesempeno(4, 4, 0, 0), 7.0);
});

test('varianteNota: ok desde 5.5, watch desde 4.0, warn debajo y none sin nota', () => {
    assert.equal(varianteNota(7), 'ok');
    assert.equal(varianteNota(5.5), 'ok');
    assert.equal(varianteNota(5.4), 'watch');
    assert.equal(varianteNota(4.0), 'watch');
    assert.equal(varianteNota(3.9), 'warn');
    assert.equal(varianteNota(null), 'none');
    assert.equal(varianteNota(undefined), 'none');
});

const sub = {
    subdireccion_id: 4, nombre: 'Administrativa',
    departamentos: [
        { depto_id: 10, nombre: 'TIC', subdepartamentos: [{ depto_id: 11, nombre: 'Soporte' }, { depto_id: 12, nombre: 'Redes' }] },
        { depto_id: 20, nombre: 'RRHH', subdepartamentos: [] },
    ],
};

test('el alcance de una subdirección incluye sus departamentos y sub-departamentos', () => {
    assert.deepEqual(idsDeSubdireccion(sub), { ids: [10, 11, 12, 20], sinClasificar: false });
    assert.deepEqual(idsDeDepartamento(sub.departamentos[0]), { ids: [10, 11, 12], sinClasificar: false });
    assert.deepEqual(idsDeSubdepartamento({ depto_id: 11 }), { ids: [11], sinClasificar: false });
});

test('el nodo «Sin clasificar» no tiene ids y se marca aparte', () => {
    assert.deepEqual(idsDeSubdireccion({ subdireccion_id: null, departamentos: [] }), { ids: [], sinClasificar: true });
    assert.deepEqual(idsDeDepartamento({ depto_id: null, subdepartamentos: [] }), { ids: [], sinClasificar: true });
});

test('resumenDeAlcance suma los años y respeta el año elegido', () => {
    const serie = [
        { anho: 2025, dentro_cantidad: 6, fuera_cantidad: 4, dentro_monto: 600, fuera_monto: 400 },
        { anho: 2026, dentro_cantidad: 9, fuera_cantidad: 1, dentro_monto: 900, fuera_monto: 100 },
    ];
    const todos = resumenDeAlcance(serie, '');
    assert.equal(todos.totalCant, 20);
    assert.equal(todos.pctDentroCant, 75);
    assert.equal(todos.pctDentroMonto, 75);
    const uno = resumenDeAlcance(serie, '2026');
    assert.equal(uno.totalCant, 10);
    assert.equal(uno.pctDentroCant, 90);
    assert.equal(uno.nota, notaDesempeno(10, 9, 900, 1000));
    // Un año sin datos no divide por cero.
    const vacio = resumenDeAlcance(serie, '2030');
    assert.deepEqual([vacio.totalCant, vacio.pctDentroCant, vacio.nota], [0, 0, null]);
});

test('filasJerarquia muestra solo lo expandido, con nivel y alcance', () => {
    const j = { subdirecciones: [sub] };
    assert.deepEqual(filasJerarquia(j, new Set()).map((f) => [f.nombre, f.nivel]), [['Administrativa', 0]]);
    const abierta = filasJerarquia(j, new Set(['sub-4']));
    assert.deepEqual(abierta.map((f) => [f.nombre, f.nivel, f.expandible]), [['Administrativa', 0, true], ['TIC', 1, true], ['RRHH', 1, false]]);
    const todo = filasJerarquia(j, new Set(['sub-4', 'sub-4-depto-10']));
    assert.deepEqual(todo.map((f) => f.nombre), ['Administrativa', 'TIC', 'Soporte', 'Redes', 'RRHH']);
    assert.deepEqual(todo.find((f) => f.nombre === 'TIC').alcance, { ids: [10, 11, 12], sinClasificar: false });
    assert.deepEqual(filasJerarquia(null, new Set()), []);
});
