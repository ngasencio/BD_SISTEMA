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
