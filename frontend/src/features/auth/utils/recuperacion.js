/**
 * @file features/auth/utils/recuperacion.js
 * @description Lógica pura (sin React) de la pantalla «¿Olvidaste tu contraseña?», para poder
 * probarla con `npm test`. El servidor es la autoridad en TODO (vigencia del código, intentos,
 * reglas de contraseña): esto solo ayuda a que la pantalla guíe y no mande peticiones inútiles.
 */

export const LARGO_CODIGO = 6;
export const MIN_LARGO_CLAVE = 8;   // igual que MinimumLengthValidator de AUTH_PASSWORD_VALIDATORS

/** «300» → «5:00». Nunca devuelve negativos. */
export const formatoReloj = (segundos) => {
    const s = Math.max(0, Math.floor(Number(segundos) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Segundos que faltan hasta `venceEn` (ms epoch); 0 si ya pasó o no hay fecha. */
export const segundosRestantes = (venceEn, ahora = Date.now()) =>
    venceEn ? Math.max(0, Math.ceil((venceEn - ahora) / 1000)) : 0;

/** Lo que escribe la persona en el campo del código → solo dígitos, hasta el largo del código.
 *  Acepta pegar «123 456» o «123-456», que es como se copia del correo. */
export const soloDigitos = (valor, largo = LARGO_CODIGO) =>
    String(valor ?? '').replace(/\D/g, '').slice(0, largo);

export const codigoCompleto = (codigo) => soloDigitos(codigo).length === LARGO_CODIGO;

export const esCorreoValido = (correo) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo ?? '').trim());

/** Chequeos que se pueden hacer sin el servidor, para mostrarlos como lista mientras se escribe.
 *  (Que no sea una contraseña común o parecida al usuario solo lo sabe el servidor.) */
export const reglasClave = (password, confirmacion) => {
    const p = String(password ?? '');
    return [
        { id: 'largo', texto: `Al menos ${MIN_LARGO_CLAVE} caracteres`, ok: p.length >= MIN_LARGO_CLAVE },
        { id: 'numerica', texto: 'No puede ser solo números', ok: p.length > 0 && !/^\d+$/.test(p) },
        { id: 'coincide', texto: 'Las dos contraseñas coinciden', ok: p.length > 0 && p === String(confirmacion ?? '') },
    ];
};

export const claveLista = (password, confirmacion) =>
    reglasClave(password, confirmacion).every((r) => r.ok);

/**
 * Error de axios → { mensaje, campos, fatal }.
 *  · mensaje: texto para mostrar.
 *  · campos:  { password: [...], ... } cuando el servidor marcó campos concretos.
 *  · fatal:   true si no hay nada que corregir en el formulario (token vencido/usado: hay que volver a empezar).
 */
export const interpretarError = (error, porDefecto = 'No se pudo completar la solicitud. Intenta nuevamente.') => {
    const respuesta = error?.response;
    if (!respuesta) {
        return { mensaje: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.', campos: {}, fatal: false };
    }
    const datos = respuesta.data || {};
    const campos = datos.errores && typeof datos.errores === 'object' ? datos.errores : {};
    const detalle = typeof datos.detail === 'string' && datos.detail ? datos.detail : porDefecto;
    const hayCampos = Object.keys(campos).length > 0;
    const primero = hayCampos ? [].concat(Object.values(campos)[0])[0] : null;
    return {
        mensaje: hayCampos && primero ? String(primero) : detalle,
        campos,
        fatal: respuesta.status === 400 && !hayCampos,
    };
};
