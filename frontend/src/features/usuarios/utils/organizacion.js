// Lógica pura de la edición de usuarios (sin React): se prueba con `npm test`.
//
// El árbol llega del servidor como ramas → departamentos → hijos (ver
// `construir_arbol_organizacion`). Acá se indexa una sola vez para buscar, mostrar la ruta
// completa de cada nodo y excluir descendientes al elegir un padre.

export const CAMPOS_CUENTA = ['username', 'email', 'first_name', 'last_name', 'is_active'];
export const CAMPOS_PERFIL = ['role', 'cargo', 'run', 'establecimiento_id', 'panel_id'];
export const CAMPOS_PANEL = [
    'usuario', 'correo_electronico', 'descripcion', 'activo', 'establecimiento_id', 'alias', 'run', 'cargo',
];

const SEPARADOR = ' › ';

/** Minúsculas, sin tildes ni espacios repetidos — para buscar «atencion» y hallar «ATENCIÓN». */
export function normalizarTexto(texto) {
    return String(texto ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Aplana el árbol. Cada fila: {id, nombre, ruta, rama, profundidad, es_depto, tieneHijos,
 * subdireccion_id, establecimiento_id, padreId}. `porId` permite buscar por id en O(1).
 */
export function indexarArbol(arbol = []) {
    const filas = [];
    const porId = new Map();

    const recorrer = (nodos, rama, ancestros, padreId) => {
        for (const nodo of nodos) {
            const fila = {
                id: nodo.id,
                nombre: nodo.nombre,
                nombre_corto: nodo.nombre_corto ?? null,
                ruta: [rama.nombre, ...ancestros, nodo.nombre].join(SEPARADOR),
                rama: rama.nombre,
                profundidad: ancestros.length,
                es_depto: !!nodo.es_depto,
                tieneHijos: (nodo.hijos || []).length > 0,
                subdireccion_id: nodo.subdireccion_id ?? null,
                establecimiento_id: nodo.establecimiento_id ?? null,
                padreId,
            };
            filas.push(fila);
            porId.set(nodo.id, fila);
            recorrer(nodo.hijos || [], rama, [...ancestros, nodo.nombre], nodo.id);
        }
    };
    for (const rama of arbol) recorrer(rama.departamentos || [], rama, [], null);
    return { filas, porId };
}

/** Filas cuyo nombre o ruta contiene todas las palabras de `texto` (sin tildes ni mayúsculas). */
export function filtrarNodos(filas, texto) {
    const palabras = normalizarTexto(texto).split(' ').filter(Boolean);
    if (!palabras.length) return filas;
    return filas.filter(f => {
        const hay = normalizarTexto(`${f.ruta} ${f.nombre_corto ?? ''}`);
        return palabras.every(p => hay.includes(p));
    });
}

/** Ids de todos los descendientes de `id` (a cualquier profundidad). */
export function descendientesDe(filas, id) {
    const hijosDe = new Map();
    for (const f of filas) {
        if (f.padreId == null) continue;
        if (!hijosDe.has(f.padreId)) hijosDe.set(f.padreId, []);
        hijosDe.get(f.padreId).push(f.id);
    }
    const resultado = new Set();
    const pila = [...(hijosDe.get(id) || [])];
    while (pila.length) {
        const actual = pila.pop();
        if (resultado.has(actual)) continue;
        resultado.add(actual);
        pila.push(...(hijosDe.get(actual) || []));
    }
    return resultado;
}

// ---------------------------------------------------------------------------
// Payload de guardado: solo lo que cambió
// ---------------------------------------------------------------------------

const vacio = (v) => v === null || v === undefined || v === '';

/** Igualdad tolerante: null/undefined/'' son lo mismo; 5 y '5' son lo mismo. */
export function valoresIguales(a, b) {
    if (vacio(a) && vacio(b)) return true;
    if (vacio(a) || vacio(b)) return false;
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
    return String(a).trim() === String(b).trim();
}

function cambiados(original = {}, borrador = {}, campos) {
    const salida = {};
    for (const campo of campos) {
        if (!(campo in borrador)) continue;
        if (!valoresIguales(original[campo], borrador[campo])) {
            salida[campo] = vacio(borrador[campo]) ? null : borrador[campo];
        }
    }
    return salida;
}

export function mismosIds(a = [], b = []) {
    if (a.length !== b.length) return false;
    const conjunto = new Set(a.map(Number));
    return b.every(x => conjunto.has(Number(x)));
}

/**
 * Compara la ficha del servidor con el borrador y arma el cuerpo del PATCH con SOLO lo
 * modificado. Devuelve {} si no hay nada que guardar (el botón Guardar se deshabilita).
 *
 * borrador = { cuenta: {…, password}, perfil: {…}, panel: {…}|null, departamentos: [ids]|null }
 *   - `departamentos: null` = no se tocó; [] = quitar la asignación propia (vuelve al Panel).
 */
export function armarPayloadFicha(ficha, borrador) {
    const payload = {};
    if (!ficha || !borrador) return payload;

    const cuenta = cambiados(ficha.cuenta, borrador.cuenta, CAMPOS_CUENTA);
    if (borrador.cuenta?.password) cuenta.password = borrador.cuenta.password;
    if (Object.keys(cuenta).length) payload.cuenta = cuenta;

    const perfil = cambiados(ficha.perfil, borrador.perfil, CAMPOS_PERFIL);
    if (Object.keys(perfil).length) payload.perfil = perfil;

    if (ficha.panel && borrador.panel) {
        const panel = cambiados(ficha.panel, borrador.panel, CAMPOS_PANEL);
        if (Object.keys(panel).length) payload.panel = panel;
    }

    if (Array.isArray(borrador.departamentos)) {
        const actuales = ficha.organizacion?.departamentos_propios_ids || [];
        if (!mismosIds(actuales, borrador.departamentos)) payload.departamentos = borrador.departamentos;
    }
    return payload;
}

export function hayCambios(payload) {
    return Object.keys(payload || {}).length > 0;
}

/** Borrador inicial = copia editable de la ficha (sin referencias compartidas). */
export function borradorDesdeFicha(ficha) {
    return {
        cuenta: {
            username: ficha.cuenta.username ?? '',
            email: ficha.cuenta.email ?? '',
            first_name: ficha.cuenta.first_name ?? '',
            last_name: ficha.cuenta.last_name ?? '',
            is_active: !!ficha.cuenta.is_active,
            password: '',
        },
        perfil: {
            role: ficha.perfil.role ?? 'viewer',
            cargo: ficha.perfil.cargo ?? '',
            run: ficha.perfil.run ?? '',
            establecimiento_id: ficha.perfil.establecimiento_id ?? null,
            panel_id: ficha.perfil.panel_id ?? null,
        },
        panel: ficha.panel ? {
            usuario: ficha.panel.usuario ?? '',
            correo_electronico: ficha.panel.correo_electronico ?? '',
            descripcion: ficha.panel.descripcion ?? '',
            activo: ficha.panel.activo ?? 'S',
            establecimiento_id: ficha.panel.establecimiento_id ?? null,
            alias: ficha.panel.alias ?? '',
            run: ficha.panel.run ?? '',
            cargo: ficha.panel.cargo ?? '',
        } : null,
        departamentos: [...(ficha.organizacion?.departamentos_propios_ids || [])],
    };
}

// ---------------------------------------------------------------------------
// Errores del servidor
// ---------------------------------------------------------------------------

/** Mensaje de un campo: `errores.panel.activo`. Acepta string o lista. */
export function errorDeCampo(errores, seccion, campo) {
    const valor = errores?.[seccion]?.[campo];
    return Array.isArray(valor) ? valor[0] : (valor || null);
}

/** Mensaje general de una sección (cuando el servidor devolvió un string, no por campo). */
export function errorDeSeccion(errores, seccion) {
    const valor = errores?.[seccion];
    return typeof valor === 'string' ? valor : null;
}

/** Secciones con algún error, para marcar las pestañas. */
export function seccionesConError(errores) {
    return Object.entries(errores || {})
        .filter(([, v]) => (typeof v === 'string' ? v : Object.keys(v || {}).length > 0))
        .map(([k]) => k);
}

export const ETIQUETAS_CAMPO = {
    username: 'Correo / usuario', email: 'Correo', first_name: 'Nombre', last_name: 'Apellido',
    is_active: 'Activo', password: 'Contraseña', role: 'Rol', cargo: 'Cargo', run: 'RUN',
    establecimiento_id: 'Establecimiento', panel_id: 'Usuario del Panel', usuario: 'Usuario (Panel)',
    correo_electronico: 'Correo (Panel)', descripcion: 'Descripción', activo: 'Activo (Panel)',
    alias: 'Alias', departamentos: 'Departamentos asignados', nombre_corto: 'Nombre corto',
    parent_id: 'Depende de', subdireccion_id: 'Subdirección', es_depto: 'Primer nivel',
};
