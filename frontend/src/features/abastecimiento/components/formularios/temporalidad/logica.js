// Lógica pura de la pestaña Temporalidad (sin React): nota de desempeño, alcance de la jerarquía y agregados.

export const MUESTRA_MINIMA_PAC = 3; // debe coincidir con MUESTRA_MINIMA_PAC de backend/api/services.py

/**
 * Réplica en JS de `_nota_desempeno_pac` (services.py): nota 1.0-7.0 = 1 + 6 × (50 % del % Dentro por cantidad
 * + 50 % del % Dentro por monto), o `null` si hay menos de `MUESTRA_MINIMA_PAC` formularios. Se usa para
 * agregar la nota sobre los años ya cargados sin pedirle al backend cada combinación de años.
 */
export function notaDesempeno(total, dentroCant, montoDentro, montoTotal) {
    if (total < MUESTRA_MINIMA_PAC) return null;
    const pctCantidad = (dentroCant / total) * 100;
    const pctMonto = montoTotal ? (montoDentro / montoTotal) * 100 : pctCantidad;
    const score = 0.5 * pctCantidad + 0.5 * pctMonto;
    return Math.round((1 + (score / 100) * 6) * 10) / 10;
}

/** Variante de chip DV-UI para una nota (sin rojo de alarma: debajo de 4 es ámbar). */
export function varianteNota(nota) {
    if (nota === null || nota === undefined) return 'none';
    if (nota < 4.0) return 'warn';
    if (nota < 5.5) return 'watch';
    return 'ok';
}

// ─── Alcance de un nodo de la jerarquía ──────────────────────────────────────
// Qué `depto_id` caen bajo el nodo en el que se hizo clic. Una subdirección o un departamento raíz deben
// incluir también los de sus sub-departamentos: la jerarquía ya los suma para las métricas, pero en la tabla
// real cada sub-departamento tiene su propio `sso_departamento_id`.

export function idsDeSubdireccion(sub) {
    if (sub.subdireccion_id == null) return { ids: [], sinClasificar: true };
    const ids = [];
    sub.departamentos.forEach((d) => {
        if (d.depto_id != null) ids.push(d.depto_id);
        d.subdepartamentos.forEach((sd) => ids.push(sd.depto_id));
    });
    return { ids, sinClasificar: false };
}

export function idsDeDepartamento(d) {
    if (d.depto_id == null) return { ids: [], sinClasificar: true };
    return { ids: [d.depto_id, ...d.subdepartamentos.map((sd) => sd.depto_id)], sinClasificar: false };
}

export function idsDeSubdepartamento(sd) {
    return { ids: [sd.depto_id], sinClasificar: false };
}

/** Totales Dentro/Fuera de la serie anual para un año (o todos si `anhoScope` es ''), con porcentajes y nota. */
export function resumenDeAlcance(serieAnual, anhoScope) {
    const filas = anhoScope ? serieAnual.filter((s) => s.anho === Number(anhoScope)) : serieAnual;
    const agg = filas.reduce((acc, s) => ({
        dentroCant: acc.dentroCant + s.dentro_cantidad, fueraCant: acc.fueraCant + s.fuera_cantidad,
        dentroMonto: acc.dentroMonto + s.dentro_monto, fueraMonto: acc.fueraMonto + s.fuera_monto,
    }), { dentroCant: 0, fueraCant: 0, dentroMonto: 0, fueraMonto: 0 });
    const totalCant = agg.dentroCant + agg.fueraCant;
    const totalMonto = agg.dentroMonto + agg.fueraMonto;
    return {
        ...agg, totalCant, totalMonto,
        pctDentroCant: totalCant ? (agg.dentroCant / totalCant) * 100 : 0,
        pctDentroMonto: totalMonto ? (agg.dentroMonto / totalMonto) * 100 : 0,
        nota: notaDesempeno(totalCant, agg.dentroCant, agg.dentroMonto, totalMonto),
    };
}

/**
 * Aplana la jerarquía Subdirección → Departamento → Sub-departamento en filas de tabla, mostrando solo los
 * hijos de lo expandido. `expandidas` es un Set de claves; cada fila lleva su clave, nivel y alcance (`ids`).
 */
export function filasJerarquia(jerarquia, expandidas) {
    const filas = [];
    (jerarquia?.subdirecciones || []).forEach((sub) => {
        const claveSub = `sub-${sub.subdireccion_id ?? 'sinclasificar'}`;
        filas.push({ clave: claveSub, nombre: sub.nombre, detalle: `${sub.departamentos.length} deptos`, nivel: 0, m: sub, expandible: sub.departamentos.length > 0, alcance: idsDeSubdireccion(sub) });
        if (!expandidas.has(claveSub)) return;
        sub.departamentos.forEach((d) => {
            const claveDepto = `${claveSub}-depto-${d.depto_id ?? 'sinclasificar'}`;
            filas.push({ clave: claveDepto, nombre: d.nombre, nivel: 1, m: d, expandible: d.subdepartamentos.length > 0, alcance: idsDeDepartamento(d) });
            if (!expandidas.has(claveDepto)) return;
            d.subdepartamentos.forEach((sd) => {
                filas.push({ clave: `${claveDepto}-sd-${sd.depto_id}`, nombre: sd.nombre, nivel: 2, m: sd, expandible: false, alcance: idsDeSubdepartamento(sd) });
            });
        });
    });
    return filas;
}
