// Pruebas de la lógica pura de la ficha del formulario — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bandejasConDias, diasEntre, fmtFecha, ocsDeLaFicha, parseFecha, resumenOcs } from './shared.js';
import { htmlFicha } from './imprimirFicha.js';

const oc = (codigo, extra = {}) => ({ codigo_oc: codigo, nombre_oc: `OC ${codigo}`, estado_oc: 'Aceptada', proveedor: 'PROV', total_bruto: 1000, ...extra });
const enlace = (codigo, estado, extra = {}) => ({ link_id: codigo, codigo_oc: codigo, oc: oc(codigo), confianza: 'ALTA', estado, estado_pac: 'PAC_OK', ...extra });

test('fmtFecha entrega DD-MM-AAAA para los formatos del Panel y deja pasar lo desconocido', () => {
    assert.equal(fmtFecha('2026-03-02'), '02-03-2026');
    assert.equal(fmtFecha('2026-03-02T10:30:00'), '02-03-2026');
    assert.equal(fmtFecha('02-03-2026'), '02-03-2026');
    assert.equal(fmtFecha('02/03/2026'), '02-03-2026');
    assert.equal(fmtFecha('07-00-2026x'), '07-00-2026x');
    assert.equal(fmtFecha(null), '—');
    assert.equal(fmtFecha(''), '—');
});

test('diasEntre cuenta días corridos y devuelve null si una fecha no se entiende', () => {
    assert.equal(diasEntre('2026-03-02', '2026-03-10'), 8);
    assert.equal(diasEntre('2026-03-10', '2026-03-02'), 0); // nunca negativo
    assert.equal(diasEntre('basura', '2026-03-02'), null);
    assert.equal(parseFecha('2026-13-45') instanceof Date, true); // fecha imposible: Date la normaliza, no revienta
});

test('ocsDeLaFicha: confirmadas primero, vía proceso después, sugeridas y descartadas al final', () => {
    const f = {
        enlaces_oc: [enlace('R', 'RECHAZADO'), enlace('S', 'SUGERIDO'), enlace('C', 'CONFIRMADO')],
        procesos: [{ titulo: 'Proceso 1', ordenes_compra: [oc('P')] }],
    };
    assert.deepEqual(ocsDeLaFicha(f).map((o) => o.codigo), ['C', 'P', 'S', 'R']);
});

test('ocsDeLaFicha: una OC enlazada y vinculada al proceso aparece una sola vez', () => {
    const f = { enlaces_oc: [enlace('C', 'CONFIRMADO')], procesos: [{ titulo: 'P', ordenes_compra: [oc('C'), oc('Z')] }] };
    const filas = ocsDeLaFicha(f);
    assert.deepEqual(filas.map((o) => [o.codigo, o.via]), [['C', 'enlace'], ['Z', 'proceso']]);
});

test('ocsDeLaFicha: tolera una ficha sin enlaces ni procesos y una OC aún no sincronizada', () => {
    assert.deepEqual(ocsDeLaFicha({}), []);
    assert.deepEqual(ocsDeLaFicha(null), []);
    const [fila] = ocsDeLaFicha({ enlaces_oc: [{ link_id: 1, codigo_oc: 'X', oc: null, estado: 'SUGERIDO' }] });
    assert.equal(fila.oc, null);
});

test('resumenOcs separa confirmadas (incluye vía proceso), sugeridas y descartadas', () => {
    const f = {
        enlaces_oc: [enlace('C', 'CONFIRMADO'), enlace('S1', 'SUGERIDO'), enlace('S2', 'SUGERIDO'), enlace('R', 'RECHAZADO')],
        procesos: [{ titulo: 'P', ordenes_compra: [oc('P')] }],
    };
    assert.deepEqual(resumenOcs(ocsDeLaFicha(f)), { confirmadas: 2, sugeridas: 2, descartadas: 1 });
});

test('bandejasConDias mide cada bandeja hasta la siguiente y marca la actual', () => {
    const h = bandejasConDias([
        { estado: 'P', fecha: '2026-03-02' }, { estado: 'FR', fecha: '2026-03-05' }, { estado: 'AC', fecha: '2026-03-06' },
    ]);
    assert.deepEqual(h.map((x) => x.dias).slice(0, 2), [3, 1]);
    assert.deepEqual(h.map((x) => x.actual), [false, false, true]);
    assert.deepEqual(bandejasConDias([]), []);
    assert.deepEqual(bandejasConDias(undefined), []);
});

test('htmlFicha escapa el contenido y no deja "undefined" ni "null" en pantalla', () => {
    const f = {
        id_formulario: 'F1-005-26', folio: 5, anho: 2026, estado: 'AC', monto_estimado: 1000,
        requerimiento: '<script>alert(1)</script> & "comillas"',
        productos: [], historial_estados: [], procesos: [], enlaces_oc: [enlace('1000-61-SE26', 'CONFIRMADO')],
    };
    const html = htmlFicha(f, new Date('2026-10-08T12:00:00'));
    assert.ok(!html.includes('<script>alert(1)</script>'), 'el HTML del usuario debe ir escapado');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('1000-61-SE26'));
    assert.ok(!/undefined|\bnull\b/.test(html.replace(/<style>[\s\S]*<\/style>/, '')), 'no deben filtrarse valores vacíos');
});

test('htmlFicha de un formulario sin derivar ni productos usa los textos de "sin datos"', () => {
    const html = htmlFicha({ folio: 9, anho: 2026, productos: [], historial_estados: [], procesos: [], enlaces_oc: [] });
    assert.ok(html.includes('Sin productos registrados en el carro.'));
    assert.ok(html.includes('Sin órdenes de compra enlazadas.'));
    assert.ok(html.includes('Sin historial de bandejas registrado.'));
});
