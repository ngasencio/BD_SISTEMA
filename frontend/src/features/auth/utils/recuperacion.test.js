// Pruebas de la lógica de «¿Olvidaste tu contraseña?» — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    claveLista, codigoCompleto, esCorreoValido, formatoReloj, interpretarError, reglasClave,
    segundosRestantes, soloDigitos,
} from './recuperacion.js';

test('formatoReloj muestra minutos:segundos y nunca negativos', () => {
    assert.equal(formatoReloj(300), '5:00');
    assert.equal(formatoReloj(299), '4:59');
    assert.equal(formatoReloj(61), '1:01');
    assert.equal(formatoReloj(0), '0:00');
    assert.equal(formatoReloj(-5), '0:00');
    assert.equal(formatoReloj(undefined), '0:00');
});

test('segundosRestantes cuenta hacia atrás hasta 0 y tolera la falta de fecha', () => {
    const t0 = 1_000_000;
    assert.equal(segundosRestantes(t0 + 300_000, t0), 300);
    assert.equal(segundosRestantes(t0 + 1, t0), 1);          // redondea hacia arriba: nunca muestra 0:00 con tiempo vivo
    assert.equal(segundosRestantes(t0, t0), 0);
    assert.equal(segundosRestantes(t0 - 10_000, t0), 0);
    assert.equal(segundosRestantes(null, t0), 0);
});

test('soloDigitos deja solo números, hasta 6, y acepta lo que se copia del correo', () => {
    assert.equal(soloDigitos('123456'), '123456');
    assert.equal(soloDigitos('123 456'), '123456');
    assert.equal(soloDigitos('123-456'), '123456');
    assert.equal(soloDigitos('12a3b'), '123');
    assert.equal(soloDigitos('12345678'), '123456');
    assert.equal(soloDigitos(null), '');
    assert.equal(soloDigitos('004921'), '004921');           // conserva los ceros a la izquierda
});

test('codigoCompleto exige los 6 dígitos', () => {
    assert.equal(codigoCompleto('12345'), false);
    assert.equal(codigoCompleto('123456'), true);
    assert.equal(codigoCompleto('123 456'), true);
});

test('esCorreoValido', () => {
    assert.equal(esCorreoValido('ana@redsalud.gob.cl'), true);
    assert.equal(esCorreoValido('  ana@redsalud.gob.cl '), true);
    for (const malo of ['', 'ana', 'ana@', '@x.cl', 'a b@x.cl', null, undefined]) assert.equal(esCorreoValido(malo), false, String(malo));
});

test('reglasClave: largo, no solo números y coincidencia', () => {
    const estado = (p, c) => Object.fromEntries(reglasClave(p, c).map((r) => [r.id, r.ok]));
    assert.deepEqual(estado('corta1', 'corta1'), { largo: false, numerica: true, coincide: true });
    assert.deepEqual(estado('12345678', '12345678'), { largo: true, numerica: false, coincide: true });
    assert.deepEqual(estado('Clave-larga-1', 'Clave-larga-2'), { largo: true, numerica: true, coincide: false });
    assert.deepEqual(estado('', ''), { largo: false, numerica: false, coincide: false });
});

test('claveLista solo con las tres reglas cumplidas', () => {
    assert.equal(claveLista('Clave-larga-1', 'Clave-larga-1'), true);
    assert.equal(claveLista('Clave-larga-1', 'otra'), false);
    assert.equal(claveLista('123456789', '123456789'), false);
});

test('interpretarError: sin respuesta es un problema de conexión (reintentable)', () => {
    const e = interpretarError(new Error('Network Error'));
    assert.match(e.mensaje, /No se pudo conectar/);
    assert.equal(e.fatal, false);
});

test('interpretarError: 400 con campos marca el campo y NO es fatal (se puede corregir)', () => {
    const e = interpretarError({ response: { status: 400, data: {
        detail: 'La contraseña no cumple los requisitos.',
        errores: { password: ['Esta contraseña es demasiado común.'] } } } });
    assert.equal(e.mensaje, 'Esta contraseña es demasiado común.');
    assert.deepEqual(e.campos, { password: ['Esta contraseña es demasiado común.'] });
    assert.equal(e.fatal, false);
});

test('interpretarError: 400 sin campos (código o token inválido) es fatal y usa el mensaje del servidor', () => {
    const e = interpretarError({ response: { status: 400, data: { detail: 'La verificación ya no es válida.' } } });
    assert.equal(e.mensaje, 'La verificación ya no es válida.');
    assert.equal(e.fatal, true);
});

test('interpretarError: error de servidor usa el texto por defecto y no es fatal', () => {
    const e = interpretarError({ response: { status: 500, data: {} } }, 'Falló.');
    assert.equal(e.mensaje, 'Falló.');
    assert.equal(e.fatal, false);
});
