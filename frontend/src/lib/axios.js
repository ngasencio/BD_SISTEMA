/**
 * @file src/lib/axios.js
 * @description Instancia global de Axios optimizada para Django REST Framework.
 *
 * Interceptores incluidos:
 *  - REQUEST:  Inyección automática del token JWT (Bearer) en cada petición.
 *  - RESPONSE: Manejo de error 401 con renovación automática del refresh token.
 *              Si el refresh también falla, limpia el storage y redirige a /login.
 *
 * Convención DRF: todas las URLs deben terminar en "/" (trailing slash).
 */
import axios from 'axios';

// ─── Constantes ──────────────────────────────────────────────────────────────
const BASE_URL =
    import.meta.env.VITE_API_URL ||
    `http://${window.location.hostname}:8000/api/`;

const TOKEN_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

// ─── Instancia principal ──────────────────────────────────────────────────────
const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    // DRF espera trailing slashes; lo forzamos aquí para no depender de cada llamada.
    // Si la URL ya termina en "/" no agrega otra.
});

// Helper: asegura que la URL tenga trailing slash (convención DRF)
apiClient.interceptors.request.use((config) => {
    if (config.url && !config.url.endsWith('/') && !config.url.includes('?')) {
        config.url += '/';
    }
    return config;
});

// ─── Interceptor REQUEST — Inyección de JWT ───────────────────────────────────
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ─── Interceptor RESPONSE — Renovación de token (refresh) ────────────────────
let isRefreshing = false;
let failedQueue = []; // Cola de peticiones que esperan el nuevo token

const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Solo actuamos ante un 401 y evitamos bucles infinitos con _retry
        if (error.response?.status === 401 && !originalRequest._retry) {
            const refreshToken = localStorage.getItem(REFRESH_KEY);

            // Si no hay refresh token, cerramos sesión directamente
            if (!refreshToken) {
                clearSession();
                return Promise.reject(error);
            }

            if (isRefreshing) {
                // Si ya hay un refresh en curso, encolar esta petición
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        return apiClient(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Petición directa a DRF para renovar el token
                const { data } = await axios.post(`${BASE_URL}auth/refresh/`, {
                    refresh: refreshToken,
                });

                const newAccessToken = data.access;
                localStorage.setItem(TOKEN_KEY, newAccessToken);
                apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;

                processQueue(null, newAccessToken);
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                clearSession();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

// ─── Helpers de sesión ────────────────────────────────────────────────────────
export const saveSession = ({ access, refresh }) => {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
};

export const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    // Redirige al login sin depender de React Router
    window.location.href = '/bd_sistema/login';
};

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY);

export default apiClient;
