// Pruebas de la lógica de selección — se ejecutan con `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    alternar, cantidadSeleccionada, construirSeleccion, estaSeleccionado, filtrosAParams,
    paginaCompleta, seleccionVacia, seleccionarPagina, seleccionarTodosFiltrados,
} from './seleccion.js';

test('selección vacía no tiene nada seleccionado', () => {
    const s = seleccionVacia();
    assert.equal(estaSeleccionado(s, 'A'), false);
    assert.equal(cantidadSeleccionada(s, 100), 0);
    assert.equal(construirSeleccion(s, 2026, {}, 100), null);
});

test('alternar marca y desmarca sin mutar la selección anterior', () => {
    const s0 = seleccionVacia();
    const s1 = alternar(s0, 'A');
    assert.equal(estaSeleccionado(s0, 'A'), false);
    assert.equal(estaSeleccionado(s1, 'A'), true);
    assert.equal(estaSeleccionado(alternar(s1, 'A'), 'A'), false);
});

test('seleccionar y deseleccionar una página', () => {
    const pagina = ['A', 'B', 'C'];
    let s = seleccionarPagina(seleccionVacia(), pagina, true);
    assert.equal(paginaCompleta(s, pagina), true);
    assert.equal(cantidadSeleccionada(s, 10), 3);
    s = alternar(s, 'B');
    assert.equal(paginaCompleta(s, pagina), false);
    s = seleccionarPagina(s, pagina, false);
    assert.equal(cantidadSeleccionada(s, 10), 0);
});

test('una página vacía nunca está "completa"', () => {
    assert.equal(paginaCompleta(seleccionarTodosFiltrados(), []), false);
});

test('todos los filtrados: todo está seleccionado salvo las exclusiones', () => {
    let s = seleccionarTodosFiltrados();
    assert.equal(estaSeleccionado(s, 'X'), true);
    assert.equal(cantidadSeleccionada(s, 177), 177);
    s = alternar(s, 'X');
    assert.equal(estaSeleccionado(s, 'X'), false);
    assert.equal(cantidadSeleccionada(s, 177), 176);
    s = alternar(s, 'X');
    assert.equal(cantidadSeleccionada(s, 177), 177);
});

test('en modo filtro, seleccionar/deseleccionar página ajusta las exclusiones', () => {
    let s = seleccionarPagina(seleccionarTodosFiltrados(), ['A', 'B'], false);
    assert.equal(cantidadSeleccionada(s, 10), 8);
    s = seleccionarPagina(s, ['A'], true);
    assert.equal(cantidadSeleccionada(s, 10), 9);
});

test('la cantidad nunca es negativa', () => {
    const s = seleccionarPagina(seleccionarTodosFiltrados(), ['A', 'B', 'C'], false);
    assert.equal(cantidadSeleccionada(s, 2), 0);
});

test('construirSeleccion por ids', () => {
    const s = seleccionarPagina(seleccionVacia(), ['A', 'B'], true);
    assert.deepEqual(construirSeleccion(s, 2026, {}, 50), { anho: 2026, ids: ['A', 'B'] });
});

test('construirSeleccion por filtro lleva filtros y exclusiones, con vacíos como null', () => {
    const s = alternar(seleccionarTodosFiltrados(), 'Z');
    const r = construirSeleccion(s, 2026, { estados: ['ATRASADO'], mes: '', search: '', correo: 'con' }, 50);
    assert.deepEqual(r, {
        anho: 2026,
        filtros: { estados: ['ATRASADO'], mes: null, search: null, correo: 'con', notificado: null },
        excluir: ['Z'],
    });
});

test('construirSeleccion sin año no manda anho', () => {
    const s = alternar(seleccionVacia(), 'A');
    assert.equal('anho' in construirSeleccion(s, null, {}, 1), false);
});

test('todos los filtrados con todo excluido equivale a nada seleccionado', () => {
    const s = seleccionarPagina(seleccionarTodosFiltrados(), ['A', 'B'], false);
    assert.equal(construirSeleccion(s, 2026, {}, 2), null);
});

test('filtrosAParams omite lo vacío y une los estados', () => {
    assert.deepEqual(filtrosAParams({}), {});
    assert.deepEqual(
        filtrosAParams({ estados: ['ATRASADO', 'PENDIENTE'], mes: '2026-06', search: 'x', correo: 'sin', notificado: 'no' }),
        { estado: 'ATRASADO,PENDIENTE', mes: '2026-06', search: 'x', correo: 'sin', notificado: 'no' },
    );
    assert.deepEqual(filtrosAParams({ estados: [], mes: '', correo: '' }), {});
});
