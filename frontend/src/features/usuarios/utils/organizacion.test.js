// Pruebas de la lógica de edición de usuarios — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    armarPayloadFicha, borradorDesdeFicha, descendientesDe, errorDeCampo, errorDeSeccion,
    filtrarNodos, hayCambios, indexarArbol, mismosIds, normalizarTexto, seccionesConError,
    valoresIguales,
} from './organizacion.js';

const ARBOL = [
    {
        clave: '1-4', nombre: 'SUBDIRECCION ADMINISTRATIVA', establecimiento_id: 1, subdireccion_id: 4,
        departamentos: [{
            id: 10, nombre: 'DEPARTAMENTO DE FINANZAS', nombre_corto: 'FIN', es_depto: true,
            subdireccion_id: 4, establecimiento_id: 1,
            hijos: [
                { id: 11, nombre: 'SUB DPTO. CONTABILIDAD', es_depto: false, subdireccion_id: 4, establecimiento_id: 1,
                  hijos: [{ id: 12, nombre: 'UNIDAD DE TESORERÍA', es_depto: false, hijos: [] }] },
                { id: 13, nombre: 'SUB DPTO. PRESUPUESTO', es_depto: false, hijos: [] },
            ],
        }],
    },
    {
        clave: '2-0', nombre: 'HOSPITAL PURRANQUE', establecimiento_id: 2, subdireccion_id: null,
        departamentos: [{ id: 20, nombre: 'ATENCIÓN CERRADA', es_depto: true, hijos: [] }],
    },
];

const FICHA = {
    id: 5,
    cuenta: { username: 'ana@x.cl', email: 'ana@x.cl', first_name: 'Ana', last_name: '', is_active: true },
    perfil: { role: 'viewer', panel_id: 7, establecimiento_id: 1, cargo: 'Enfermera', run: '1-9' },
    panel: { id: 7, usuario: 'ANA', correo_electronico: 'ana@x.cl', descripcion: null, activo: 'S',
             establecimiento_id: 1, alias: 'ANA', run: '1-9', cargo: 'Enfermera' },
    organizacion: { departamentos_propios_ids: [10] },
};

test('normalizarTexto quita tildes, mayúsculas y espacios repetidos', () => {
    assert.equal(normalizarTexto('  ATENCIÓN   Cerrada '), 'atencion cerrada');
    assert.equal(normalizarTexto(null), '');
});

test('indexarArbol aplana con ruta completa, profundidad y padre', () => {
    const { filas, porId } = indexarArbol(ARBOL);
    assert.equal(filas.length, 5);
    assert.equal(porId.get(12).ruta,
        'SUBDIRECCION ADMINISTRATIVA › DEPARTAMENTO DE FINANZAS › SUB DPTO. CONTABILIDAD › UNIDAD DE TESORERÍA');
    assert.equal(porId.get(12).profundidad, 2);
    assert.equal(porId.get(12).padreId, 11);
    assert.equal(porId.get(10).tieneHijos, true);
    assert.equal(porId.get(13).tieneHijos, false);
    assert.equal(porId.get(10).padreId, null);
});

test('filtrarNodos busca sin tildes y por varias palabras en la ruta', () => {
    const { filas } = indexarArbol(ARBOL);
    assert.deepEqual(filtrarNodos(filas, 'tesoreria').map(f => f.id), [12]);
    assert.deepEqual(filtrarNodos(filas, 'finanzas contab').map(f => f.id), [11, 12]);
    assert.deepEqual(filtrarNodos(filas, 'purranque').map(f => f.id), [20]);
    assert.deepEqual(filtrarNodos(filas, 'FIN').map(f => f.id).includes(10), true);   // por nombre corto
    assert.equal(filtrarNodos(filas, '').length, 5);
    assert.deepEqual(filtrarNodos(filas, 'zzz'), []);
});

test('descendientesDe devuelve todos los niveles y nunca al propio nodo', () => {
    const { filas } = indexarArbol(ARBOL);
    assert.deepEqual([...descendientesDe(filas, 10)].sort(), [11, 12, 13]);
    assert.deepEqual([...descendientesDe(filas, 11)], [12]);
    assert.equal(descendientesDe(filas, 13).size, 0);
});

test('valoresIguales trata null, undefined y vacío como lo mismo', () => {
    assert.equal(valoresIguales(null, ''), true);
    assert.equal(valoresIguales(undefined, null), true);
    assert.equal(valoresIguales(5, '5'), true);
    assert.equal(valoresIguales(true, true), true);
    assert.equal(valoresIguales(true, false), false);
    assert.equal(valoresIguales('a', 'b'), false);
    assert.equal(valoresIguales(0, ''), false);
});

test('sin cambios el payload está vacío y no hay nada que guardar', () => {
    const payload = armarPayloadFicha(FICHA, borradorDesdeFicha(FICHA));
    assert.deepEqual(payload, {});
    assert.equal(hayCambios(payload), false);
});

test('el payload lleva solo los campos modificados de cada sección', () => {
    const b = borradorDesdeFicha(FICHA);
    b.cuenta.first_name = 'Anita';
    b.perfil.role = 'gestor_compras';
    b.panel.cargo = 'Jefa';
    const payload = armarPayloadFicha(FICHA, b);
    assert.deepEqual(payload, {
        cuenta: { first_name: 'Anita' },
        perfil: { role: 'gestor_compras' },
        panel: { cargo: 'Jefa' },
    });
});

test('un campo vaciado viaja como null, no como string vacío', () => {
    const b = borradorDesdeFicha(FICHA);
    b.perfil.establecimiento_id = '';
    b.perfil.cargo = '';
    assert.deepEqual(armarPayloadFicha(FICHA, b), { perfil: { establecimiento_id: null, cargo: null } });
});

test('la contraseña solo viaja si se escribió', () => {
    const b = borradorDesdeFicha(FICHA);
    assert.equal(armarPayloadFicha(FICHA, b).cuenta, undefined);
    b.cuenta.password = 'NuevaClave1';
    assert.deepEqual(armarPayloadFicha(FICHA, b), { cuenta: { password: 'NuevaClave1' } });
});

test('departamentos: null no se toca, mismo conjunto no cambia, distinto o vacío sí', () => {
    const b = borradorDesdeFicha(FICHA);
    b.departamentos = null;
    assert.equal('departamentos' in armarPayloadFicha(FICHA, b), false);
    b.departamentos = [10];
    assert.equal('departamentos' in armarPayloadFicha(FICHA, b), false);
    b.departamentos = [11, 13];
    assert.deepEqual(armarPayloadFicha(FICHA, b).departamentos, [11, 13]);
    b.departamentos = [];   // volver a la asignación del Panel
    assert.deepEqual(armarPayloadFicha(FICHA, b).departamentos, []);
});

test('mismosIds ignora el orden y compara números con strings', () => {
    assert.equal(mismosIds([1, 2], [2, 1]), true);
    assert.equal(mismosIds([1, 2], ['2', '1']), true);
    assert.equal(mismosIds([1], [1, 2]), false);
    assert.equal(mismosIds([], []), true);
});

test('una ficha sin vínculo al Panel no genera sección panel', () => {
    const sinPanel = { ...FICHA, panel: null };
    const b = borradorDesdeFicha(sinPanel);
    assert.equal(b.panel, null);
    assert.deepEqual(armarPayloadFicha(sinPanel, b), {});
});

test('lectura de errores del servidor por sección y campo', () => {
    const errores = {
        panel: { activo: 'Valor no permitido (S, N).', run: ['Máximo 15 caracteres.'] },
        departamentos: 'No existe(n) en la organización: [9].',
        cuenta: {},
    };
    assert.equal(errorDeCampo(errores, 'panel', 'activo'), 'Valor no permitido (S, N).');
    assert.equal(errorDeCampo(errores, 'panel', 'run'), 'Máximo 15 caracteres.');
    assert.equal(errorDeCampo(errores, 'panel', 'cargo'), null);
    assert.equal(errorDeSeccion(errores, 'departamentos'), 'No existe(n) en la organización: [9].');
    assert.equal(errorDeSeccion(errores, 'panel'), null);
    assert.deepEqual(seccionesConError(errores).sort(), ['departamentos', 'panel']);
    assert.deepEqual(seccionesConError(null), []);
});
