// Ajustes de copia (CC) SOLO de un envío — lógica pura, sin React, probada con `npm test`.
// Forma: { [nombre_responsable]: { quitar: [correo], agregar: [correo] } }, que es lo que espera el
// servidor en `ajustes_cc`. Las funciones no mutan: devuelven un objeto nuevo.

const norm = (c) => String(c || '').trim().toLowerCase();
const sinDup = (lista, correo) => lista.filter((c) => norm(c) !== norm(correo));

const actual = (ajustes, nombre) => ({
    quitar: [...(ajustes[nombre]?.quitar || [])],
    agregar: [...(ajustes[nombre]?.agregar || [])],
});

const guardar = (ajustes, nombre, ajuste) => {
    const resto = { ...ajustes };
    delete resto[nombre];
    return ajuste.quitar.length || ajuste.agregar.length ? { ...resto, [nombre]: ajuste } : resto;
};

// Quitar a alguien solo en este envío. Si lo había agregado a mano en este mismo envío, basta con
// deshacer esa adición (no tiene sentido "agregar y quitar" a la vez).
export function quitarPuntual(ajustes, nombre, correo) {
    const a = actual(ajustes, nombre);
    if (a.agregar.some((c) => norm(c) === norm(correo))) {
        a.agregar = sinDup(a.agregar, correo);
    } else if (!a.quitar.some((c) => norm(c) === norm(correo))) {
        a.quitar.push(norm(correo));
    }
    return guardar(ajustes, nombre, a);
}

// Agregar un correo solo en este envío (anula un "quitar" previo del mismo correo).
export function agregarPuntual(ajustes, nombre, correo) {
    const a = actual(ajustes, nombre);
    a.quitar = sinDup(a.quitar, correo);
    if (!a.agregar.some((c) => norm(c) === norm(correo))) a.agregar.push(norm(correo));
    return guardar(ajustes, nombre, a);
}

// Restaurar a alguien que se había quitado solo en este envío.
export function restaurarPuntual(ajustes, nombre, correo) {
    const a = actual(ajustes, nombre);
    a.quitar = sinDup(a.quitar, correo);
    return guardar(ajustes, nombre, a);
}

// Qué mandar al servidor: nada si no hay ajustes.
export const ajustesParaEnviar = (ajustes) => (Object.keys(ajustes).length ? ajustes : undefined);
