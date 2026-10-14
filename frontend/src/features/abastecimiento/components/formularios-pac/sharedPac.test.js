// Pruebas de la lógica pura de Formularios PAC — `npm test` (node --test, sin dependencias).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACCIONES_PAC, ALCANCES_CARRO, ESTADOS_EN_TRAMITE_PAC, PIPELINE_PAC, anchoBarra, bandejasPacConDias,
    esEnTramitePac, estadosDeAlcance, fmtMesIso, fmtMillones, infoEstadoPac, paramsFiltrosPac,
    paramsOrganigrama, pctDe, tituloFichaPac,
} from './sharedPac.js';

test('el flujo es P → FR → FA → AA → DC y DC es final (no está en trámite)', () => {
    assert.deepEqual(PIPELINE_PAC, ['P', 'FR', 'FA', 'AA', 'DC']);
    assert.deepEqual(ESTADOS_EN_TRAMITE_PAC, ['P', 'FR', 'FA', 'AA']);
    assert.equal(esEnTramitePac('DC'), false);
    assert.equal(esEnTramitePac('R'), false);
    assert.equal(esEnTramitePac('AA'), true);
    assert.deepEqual(ACCIONES_PAC, ['Nuevo', 'Modificar', 'Eliminar']);
});

test('infoEstadoPac nombra DC «Aprobada» y no revienta con códigos desconocidos', () => {
    assert.equal(infoEstadoPac('DC').nombre, 'Aprobada');
    assert.equal(infoEstadoPac('R').nombre, 'Rechazada');
    assert.equal(infoEstadoPac('XX').nombre, 'XX');
    assert.equal(infoEstadoPac(null).nombre, 'Sin estado');
});

test('paramsOrganigrama: sin clasificar manda, luego depto, luego subdirección', () => {
    assert.deepEqual(paramsOrganigrama('sin_clasificar', ''), { sin_clasificar: 1 });
    assert.deepEqual(paramsOrganigrama('3', '14'), { depto: '14' });
    assert.deepEqual(paramsOrganigrama('3', ''), { subdireccion: '3' });
    assert.deepEqual(paramsOrganigrama('', ''), {});
});

test('paramsFiltrosPac junta año y organigrama sin claves vacías', () => {
    assert.deepEqual(paramsFiltrosPac({ anio: '2026', subdireccionSel: '4', deptoSel: '' }), { anho: '2026', subdireccion: '4' });
    assert.deepEqual(paramsFiltrosPac({}), {});
    assert.deepEqual(paramsFiltrosPac(), {});
});

test('alcances del carro: vigentes excluye rechazadas y todas las incluye', () => {
    assert.deepEqual(estadosDeAlcance('vigentes'), ['P', 'FR', 'FA', 'AA', 'DC']);
    assert.deepEqual(estadosDeAlcance('rechazadas'), ['R']);
    assert.ok(estadosDeAlcance('todas').includes('R'));
    assert.deepEqual(estadosDeAlcance('inexistente'), estadosDeAlcance('vigentes'));
    assert.equal(ALCANCES_CARRO[0].id, 'vigentes');
});

test('fmtMesIso y fmtMillones', () => {
    assert.equal(fmtMesIso('2026-05'), 'mayo 2026');
    assert.equal(fmtMesIso('2025-12'), 'diciembre 2025');
    assert.equal(fmtMesIso('Sin mes'), 'Sin mes');
    assert.equal(fmtMesIso('2026-13'), '2026-13');
    assert.equal(fmtMesIso(null), '—');
    assert.equal(fmtMillones(70887008513), '$ 70.887 M');
    assert.equal(fmtMillones(-5668124), '-$ 6 M');
    assert.equal(fmtMillones(950000), '$ 950.000');
    assert.equal(fmtMillones(null), '$ 0');
});

test('pctDe y anchoBarra', () => {
    assert.equal(pctDe(905, 1093), 82.8);
    assert.equal(pctDe(1, 0), null);
    assert.equal(anchoBarra(50, 200), 25);
    assert.equal(anchoBarra(300, 200), 100);
    assert.equal(anchoBarra(-50, 200), 25);   // montos negativos (Modificar que rebaja) no deben salirse
    assert.equal(anchoBarra(10, 0), 0);
    assert.equal(anchoBarra('x', 10), 0);
});

test('bandejasPacConDias ordena, calcula días por bandeja y marca la actual', () => {
    const hoy = new Date('2026-10-14T00:00:00');
    const r = bandejasPacConDias([
        { estado: 'FR', fecha_registro: '2026-10-05' },
        { estado: 'P', fecha_registro: '2026-10-01' },
    ], hoy);
    assert.deepEqual(r.map((x) => x.estado), ['P', 'FR']);
    assert.equal(r[0].dias, 4);
    assert.equal(r[0].actual, false);
    assert.equal(r[1].dias, 9);
    assert.equal(r[1].actual, true);
    assert.deepEqual(bandejasPacConDias([], hoy), []);
    assert.deepEqual(bandejasPacConDias(null, hoy), []);
});

test('tituloFichaPac usa el proyecto de la ficha o, en su defecto, el identificador del plan', () => {
    assert.equal(tituloFichaPac({ nombre_proyecto: ' Compra de insumos ', identificador_proyecto: 'X-1' }), 'Compra de insumos');
    assert.equal(tituloFichaPac({ nombre_proyecto: null, identificador_proyecto: '1057532-32-PC26' }), 'Proyecto del plan 1057532-32-PC26');
    assert.equal(tituloFichaPac({ nombre_proyecto: '  ', identificador_proyecto: null }), '');
    assert.equal(tituloFichaPac(null), '');
});
