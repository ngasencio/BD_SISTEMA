import apiClient from '../../../lib/axios';

export const getUsuarios = (params = {}) =>
    apiClient.get('usuarios/', { params });

export const getUsuario = (id) =>
    apiClient.get(`usuarios/${id}/`);

export const createUsuario = (data) =>
    apiClient.post('usuarios/', data);

export const updateUsuario = (id, data) =>
    apiClient.patch(`usuarios/${id}/`, data);

export const deleteUsuario = (id) =>
    apiClient.delete(`usuarios/${id}/`);

export const getMe = () =>
    apiClient.get('auth/me/');

export const updateMe = (data) =>
    apiClient.patch('auth/me/', data);

export const getDepartamentos = (params = {}) =>
    apiClient.get('departamentos/', { params });

export const getEstablecimientos = () =>
    apiClient.get('establecimientos/');

// --- Administración completa del usuario (ficha) y de la jerarquía de departamentos ---
// Solo `admin`. El guardado de la ficha es atómico y queda auditado en el servidor.

export const getFichaUsuario = (id) =>
    apiClient.get(`usuarios/${id}/ficha/`);

export const patchFichaUsuario = (id, data) =>
    apiClient.patch(`usuarios/${id}/ficha/`, data);

export const previsualizarAlcance = (id, departamentos) =>
    apiClient.post(`usuarios/${id}/previsualizar-alcance/`, { departamentos });

export const getHistorialUsuario = (id, params = {}) =>
    apiClient.get(`usuarios/${id}/historial/`, { params });

export const getArbolOrganizacion = () =>
    apiClient.get('organizacion/arbol/');

export const getUsuariosPanel = () =>
    apiClient.get('organizacion/usuarios-panel/');

export const getDepartamentoAdmin = (id) =>
    apiClient.get(`organizacion/departamentos/${id}/`);

export const patchDepartamentoAdmin = (id, data) =>
    apiClient.patch(`organizacion/departamentos/${id}/`, data);

export const getHistorialDepartamento = (id) =>
    apiClient.get(`organizacion/departamentos/${id}/historial/`);
