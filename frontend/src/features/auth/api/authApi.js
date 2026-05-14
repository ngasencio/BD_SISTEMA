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
