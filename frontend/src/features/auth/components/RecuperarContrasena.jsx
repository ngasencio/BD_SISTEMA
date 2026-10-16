/**
 * @file features/auth/components/RecuperarContrasena.jsx
 * @description Flujo «¿Olvidaste tu contraseña?» dentro del panel derecho del login, en 4 pasos:
 *   correo → código (5 min) → contraseña nueva → listo.
 * Reutiliza las clases del login (.form-header, .field, .input-wrap, .btn-login, .msg). El servidor
 * valida todo (vigencia, intentos, reglas de contraseña); el reloj y la lista de reglas de acá son
 * solo una guía. El token que entrega el paso 2 vive únicamente en memoria del componente.
 */
import { useEffect, useRef, useState } from 'react';
import { restablecerClaveApi, solicitarCodigoApi, verificarCodigoApi } from '../api/authApi';
import {
    LARGO_CODIGO, claveLista, codigoCompleto, esCorreoValido, formatoReloj, interpretarError,
    reglasClave, segundosRestantes, soloDigitos,
} from '../utils/recuperacion';

const PASO = { CORREO: 'correo', CODIGO: 'codigo', CLAVE: 'clave', LISTO: 'listo' };

const TITULOS = {
    [PASO.CORREO]: ['Recuperar acceso', '¿Olvidaste tu contraseña?', 'Ingresa el correo de tu cuenta y te enviaremos un código de verificación.'],
    [PASO.CODIGO]: ['Verificación', 'Revisa tu correo', 'Escribe el código de 6 dígitos que te enviamos.'],
    [PASO.CLAVE]: ['Casi listo', 'Crea tu nueva contraseña', 'Elige una contraseña que no hayas usado antes en el sistema.'],
    [PASO.LISTO]: ['Listo', 'Contraseña actualizada', 'Ya puedes iniciar sesión con tu nueva contraseña.'],
};

export default function RecuperarContrasena({ onVolver, onTerminado }) {
    const [paso, setPaso] = useState(PASO.CORREO);
    const [email, setEmail] = useState('');
    const [codigo, setCodigo] = useState('');
    const [password, setPassword] = useState('');
    const [confirmacion, setConfirmacion] = useState('');
    const [verClave, setVerClave] = useState(false);
    const [token, setToken] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [fatal, setFatal] = useState(false);          // el token/código ya no sirve: hay que volver a empezar
    const [venceEn, setVenceEn] = useState(null);       // ms epoch en que vence el código (solo guía visual)
    const [reenvioEn, setReenvioEn] = useState(null);   // ms epoch desde el que se puede pedir otro
    const [ahora, setAhora] = useState(Date.now());
    const campoCodigo = useRef(null);

    // Reloj de la pantalla del código: una actualización por segundo, solo mientras se usa.
    useEffect(() => {
        if (paso !== PASO.CODIGO) return undefined;
        const id = setInterval(() => setAhora(Date.now()), 1000);
        return () => clearInterval(id);
    }, [paso]);

    useEffect(() => {
        if (paso === PASO.CODIGO) campoCodigo.current?.focus();
    }, [paso]);

    const restante = segundosRestantes(venceEn, ahora);
    const esperaReenvio = segundosRestantes(reenvioEn, ahora);
    const vencido = paso === PASO.CODIGO && restante === 0;
    const [welcome, titulo, subtitulo] = TITULOS[paso];

    const pedirCodigo = async (e) => {
        e?.preventDefault();
        if (!esCorreoValido(email)) {
            setError('Ingresa un correo electrónico válido.');
            return;
        }
        setCargando(true);
        setError('');
        setInfo('');
        try {
            const { data } = await solicitarCodigoApi(email.trim());
            const t = Date.now();
            setVenceEn(t + (data.vigencia_segundos ?? 300) * 1000);
            setReenvioEn(t + (data.reenvio_segundos ?? 60) * 1000);
            setAhora(t);
            setCodigo('');
            setFatal(false);
            setInfo(data.detail || '');
            setPaso(PASO.CODIGO);
        } catch (err) {
            setError(interpretarError(err).mensaje);
        } finally {
            setCargando(false);
        }
    };

    const verificar = async (e) => {
        e.preventDefault();
        if (!codigoCompleto(codigo)) {
            setError(`El código tiene ${LARGO_CODIGO} dígitos.`);
            return;
        }
        setCargando(true);
        setError('');
        setInfo('');
        try {
            const { data } = await verificarCodigoApi(email.trim(), codigo);
            setToken(data.token);
            setPassword('');
            setConfirmacion('');
            setPaso(PASO.CLAVE);
        } catch (err) {
            setError(interpretarError(err).mensaje);
            setCodigo('');
            campoCodigo.current?.focus();
        } finally {
            setCargando(false);
        }
    };

    const guardarClave = async (e) => {
        e.preventDefault();
        if (!claveLista(password, confirmacion)) {
            setError('Revisa que la contraseña cumpla las condiciones y que las dos coincidan.');
            return;
        }
        setCargando(true);
        setError('');
        try {
            await restablecerClaveApi({ token, password, password_confirm: confirmacion });
            setToken('');
            setPassword('');
            setConfirmacion('');
            setPaso(PASO.LISTO);
        } catch (err) {
            const r = interpretarError(err);
            setError(r.mensaje);
            if (r.fatal) setFatal(true);   // token vencido o ya usado: no hay nada que corregir acá
        } finally {
            setCargando(false);
        }
    };

    const volverAEmpezar = () => {
        setToken('');
        setCodigo('');
        setError('');
        setInfo('');
        setFatal(false);
        setPaso(PASO.CORREO);
    };

    return (
        <div className="rec-wrap">
            <div className="form-header">
                <div className="welcome">{welcome}</div>
                <h2>{titulo}</h2>
                <p>{subtitulo}</p>
            </div>

            {error && <div className="msg error" role="alert"><span>⚠️</span> {error}</div>}
            {info && !error && <div className="msg success"><span>✉️</span> {info}</div>}

            {paso === PASO.CORREO && (
                <form onSubmit={pedirCodigo} noValidate>
                    <div className="field">
                        <label htmlFor="rec-email">Correo electrónico</label>
                        <div className="input-wrap">
                            <span className="icon">✉️</span>
                            <input
                                id="rec-email"
                                type="email"
                                placeholder="tu.nombre@redsalud.gob.cl"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                autoFocus
                                required
                            />
                        </div>
                    </div>
                    <button className="btn-login" type="submit" disabled={cargando || !email.trim()}>
                        {cargando ? <div className="spinner"></div> : 'Enviar código'}
                    </button>
                </form>
            )}

            {paso === PASO.CODIGO && (
                <form onSubmit={verificar} noValidate>
                    <div className="field">
                        <label htmlFor="rec-codigo">Código de verificación</label>
                        <div className="input-wrap">
                            <span className="icon">🔑</span>
                            {/* maxLength con 2 de margen: deja pegar «123 456» y onChange lo limpia a 6 dígitos */}
                            <input
                                id="rec-codigo"
                                ref={campoCodigo}
                                className="rec-codigo"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="••••••"
                                maxLength={LARGO_CODIGO + 2}
                                value={codigo}
                                onChange={(e) => setCodigo(soloDigitos(e.target.value))}
                                required
                            />
                        </div>
                        <div className={`rec-reloj${vencido ? ' vencido' : ''}`} aria-live="polite">
                            {vencido
                                ? 'El código venció. Solicita uno nuevo.'
                                : <>Vence en <strong>{formatoReloj(restante)}</strong> · tienes 5 intentos</>}
                        </div>
                    </div>
                    <button className="btn-login" type="submit" disabled={cargando || vencido || !codigoCompleto(codigo)}>
                        {cargando ? <div className="spinner"></div> : 'Verificar código'}
                    </button>
                    <div className="rec-acciones">
                        <button type="button" className="rec-link" onClick={pedirCodigo}
                            disabled={cargando || esperaReenvio > 0}>
                            {esperaReenvio > 0 ? `Reenviar código (${esperaReenvio} s)` : 'Reenviar código'}
                        </button>
                        <button type="button" className="rec-link" onClick={volverAEmpezar} disabled={cargando}>
                            Usar otro correo
                        </button>
                    </div>
                </form>
            )}

            {paso === PASO.CLAVE && (
                <form onSubmit={guardarClave} noValidate>
                    <div className="field">
                        <label htmlFor="rec-clave">Nueva contraseña</label>
                        <div className="input-wrap">
                            <span className="icon">🔒</span>
                            <input
                                id="rec-clave"
                                type={verClave ? 'text' : 'password'}
                                placeholder="Nueva contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                autoFocus
                                required
                            />
                            <button type="button" className="eye-btn" tabIndex={-1} onClick={() => setVerClave((v) => !v)}>
                                {verClave ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>
                    <div className="field">
                        <label htmlFor="rec-clave2">Repite la contraseña</label>
                        <div className="input-wrap">
                            <span className="icon">🔒</span>
                            <input
                                id="rec-clave2"
                                type={verClave ? 'text' : 'password'}
                                placeholder="Repite la contraseña"
                                value={confirmacion}
                                onChange={(e) => setConfirmacion(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                    </div>
                    <ul className="rec-reglas">
                        {reglasClave(password, confirmacion).map((r) => (
                            <li key={r.id} className={r.ok ? 'ok' : ''}>{r.ok ? '✓' : '○'} {r.texto}</li>
                        ))}
                    </ul>
                    {fatal ? (
                        <button className="btn-login" type="button" onClick={volverAEmpezar}>Solicitar un código nuevo</button>
                    ) : (
                        <button className="btn-login" type="submit" disabled={cargando || !claveLista(password, confirmacion)}>
                            {cargando ? <div className="spinner"></div> : 'Guardar contraseña'}
                        </button>
                    )}
                </form>
            )}

            {paso === PASO.LISTO && (
                <>
                    <div className="msg success"><span>✅</span> Tu contraseña fue actualizada correctamente.</div>
                    <button className="btn-login" type="button" onClick={onTerminado}>Ir a iniciar sesión</button>
                </>
            )}

            {paso !== PASO.LISTO && (
                <div className="rec-acciones">
                    <button type="button" className="rec-link" onClick={onVolver}>← Volver a iniciar sesión</button>
                </div>
            )}
        </div>
    );
}
