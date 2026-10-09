// Pruebas del formato y la disposición del Home — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    armarFilas, fmtFechaCorta, fmtMillones, fmtNota, fmtPct, fmtVariacion, nombreMes, rutaFormularios, sentidoVariacion,
} from './formato.js';

test('fmtMillones redondea a millones con separador de miles chileno', () => {
    assert.equal(fmtMillones(5878674692), '$5.879 M');
    assert.equal(fmtMillones(8583017945), '$8.583 M');
    assert.equal(fmtMillones(0), '$0 M');
    assert.equal(fmtMillones(null), '$0 M');
});

test('fmtPct usa coma decimal y tolera null', () => {
    assert.equal(fmtPct(77.58), '77,6%');
    assert.equal(fmtPct(80.4), '80,4%');
    assert.equal(fmtPct(100, 0), '100%');
    assert.equal(fmtPct(null), '—');
    assert.equal(fmtPct(undefined), '—');
});

test('fmtVariacion lleva signo, usa el menos tipográfico y avisa cuando no hay base', () => {
    assert.equal(fmtVariacion(4.4), '+4,4%');
    assert.equal(fmtVariacion(-7.7), '−7,7%');
    assert.equal(fmtVariacion(0), '0,0%');
    assert.equal(fmtVariacion(null), 'sin base de comparación');
});

test('fmtNota usa coma decimal y marca la muestra insuficiente', () => {
    assert.equal(fmtNota(6.1), '6,1');
    assert.equal(fmtNota(7), '7,0');
    assert.equal(fmtNota(null), 's/n');
});

test('sentidoVariacion solo indica la dirección', () => {
    assert.deepEqual([sentidoVariacion(3), sentidoVariacion(-3), sentidoVariacion(0)], ['sube', 'baja', 'igual']);
});

test('fechas: formato corto y nombre de mes', () => {
    assert.equal(fmtFechaCorta('2026-10-07T12:36:30.393000+00:00'), '07-10-2026');
    assert.equal(fmtFechaCorta('2026-10-08'), '08-10-2026');
    assert.equal(fmtFechaCorta(null), '—');
    assert.equal(nombreMes(1), 'Ene');
    assert.equal(nombreMes(12), 'Dic');
    assert.equal(nombreMes(13), '');
});

test('rutaFormularios lleva a la pantalla que el rol realmente puede abrir', () => {
    for (const r of ['admin', 'abastecimiento', 'comprador', 'general']) assert.equal(rutaFormularios(r), '/abastecimiento/formularios');
    assert.equal(rutaFormularios('jefatura'), '/compras/panel-formularios');
    assert.equal(rutaFormularios('viewer'), null);
    assert.equal(rutaFormularios('finanzas'), null);
});

const paneles = (filas) => filas.map((f) => f.map((p) => `${p.panel}:${p.cols}`));

test('armarFilas: viewer ve mensual y modalidades en una sola fila', () => {
    assert.deepEqual(paneles(armarFilas({ formularios: false, deuda: false })), [['mensual:8', 'modalidades:4']]);
});

test('armarFilas: abastecimiento suma las bandejas y deja modalidades abajo a ancho completo', () => {
    assert.deepEqual(paneles(armarFilas({ formularios: true, deuda: false })), [['mensual:8', 'formularios:4'], ['modalidades:12']]);
});

test('armarFilas: finanzas suma la deuda debajo, sin huecos', () => {
    assert.deepEqual(paneles(armarFilas({ formularios: false, deuda: true })), [['mensual:8', 'modalidades:4'], ['deuda:12']]);
});

test('armarFilas: admin ve todo y la segunda fila se reparte en mitades', () => {
    assert.deepEqual(paneles(armarFilas({ formularios: true, deuda: true })), [['mensual:8', 'formularios:4'], ['deuda:6', 'modalidades:6']]);
});
