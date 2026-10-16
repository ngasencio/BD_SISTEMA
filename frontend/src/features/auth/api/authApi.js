/**
 * @file features/auth/api/authApi.js
 * @description Llamadas a la API de autenticación DRF (SimpleJWT).
 */
import apiClient from '../../../lib/axios';

/**
 * Inicia sesión con credenciales.
 * POST /api/auth/login/  → { access, refresh }
 */
export const loginApi = (credentials) =>
    apiClient.post('auth/login/', credentials);

/**
 * Renueva el access token.
 * POST /api/auth/refresh/  → { access }
 */
export const refreshTokenApi = (refresh) =>
    apiClient.post('auth/refresh/', { refresh });

// ─── Recuperación de contraseña por correo (endpoints públicos) ───────────────

/**
 * Paso 1: pide un código por correo.
 * POST /api/auth/recuperar/solicitar/  { email } → { detail, vigencia_segundos, reenvio_segundos }
 * Responde siempre igual exista o no la cuenta (no revela qué correos están registrados).
 */
export const solicitarCodigoApi = (email) =>
    apiClient.post('auth/recuperar/solicitar/', { email });

/**
 * Paso 2: verifica el código. El código acertado se consume y se canjea por un token de un solo uso.
 * POST /api/auth/recuperar/verificar/  { email, codigo } → { token, vigencia_segundos }
 */
export const verificarCodigoApi = (email, codigo) =>
    apiClient.post('auth/recuperar/verificar/', { email, codigo });

/**
 * Paso 3: define la contraseña nueva con el token del paso 2.
 * POST /api/auth/recuperar/restablecer/  { token, password, password_confirm } → { detail }
 */
export const restablecerClaveApi = ({ token, password, password_confirm }) =>
    apiClient.post('auth/recuperar/restablecer/', { token, password, password_confirm });
