// Pruebas de los ajustes puntuales de copia — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import { agregarPuntual, ajustesParaEnviar, quitarPuntual, restaurarPuntual } from './ajustesCopia.js';

test('sin ajustes no se manda nada al servidor', () => {
    assert.equal(ajustesParaEnviar({}), undefined);
    assert.deepEqual(ajustesParaEnviar({ Ana: { quitar: ['a@x.cl'], agregar: [] } }), { Ana: { quitar: ['a@x.cl'], agregar: [] } });
});

test('quitar y agregar quedan por responsable y normalizados', () => {
    let a = quitarPuntual({}, 'Ana', ' JEFA@x.cl ');
    a = agregarPuntual(a, 'Ana', 'Nuevo@X.cl');
    a = agregarPuntual(a, 'Beto', 'otro@x.cl');
    assert.deepEqual(a, {
        Ana: { quitar: ['jefa@x.cl'], agregar: ['nuevo@x.cl'] },
        Beto: { quitar: [], agregar: ['otro@x.cl'] },
    });
});

test('no duplica el mismo correo', () => {
    let a = quitarPuntual({}, 'Ana', 'j@x.cl');
    a = quitarPuntual(a, 'Ana', 'J@x.cl');
    a = agregarPuntual(a, 'Ana', 'n@x.cl');
    a = agregarPuntual(a, 'Ana', 'N@x.cl');
    assert.deepEqual(a, { Ana: { quitar: ['j@x.cl'], agregar: ['n@x.cl'] } });
});

test('quitar a alguien agregado en este mismo envío solo deshace la adición', () => {
    const a = quitarPuntual(agregarPuntual({}, 'Ana', 'n@x.cl'), 'Ana', 'n@x.cl');
    assert.deepEqual(a, {});
});

test('agregar a alguien que se había quitado anula el "quitar"', () => {
    const a = agregarPuntual(quitarPuntual({}, 'Ana', 'j@x.cl'), 'Ana', 'j@x.cl');
    assert.deepEqual(a, { Ana: { quitar: [], agregar: ['j@x.cl'] } });
});

test('restaurar saca el correo de "quitar" y limpia la entrada si queda vacía', () => {
    const a = restaurarPuntual(quitarPuntual({}, 'Ana', 'j@x.cl'), 'Ana', 'J@x.cl');
    assert.deepEqual(a, {});
});

test('las funciones no mutan el objeto original', () => {
    const original = { Ana: { quitar: ['j@x.cl'], agregar: [] } };
    const copia = JSON.parse(JSON.stringify(original));
    quitarPuntual(original, 'Ana', 'z@x.cl');
    agregarPuntual(original, 'Ana', 'y@x.cl');
    restaurarPuntual(original, 'Ana', 'j@x.cl');
    assert.deepEqual(original, copia);
});
