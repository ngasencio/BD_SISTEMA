import apiClient from '../../../lib/axios';

export const getNotificaciones = () => apiClient.get('compras-notificaciones/');
export const getNoLeidas = () => apiClient.get('compras-notificaciones/no-leidas/');
export const marcarLeida = (id) => apiClient.patch(`compras-notificaciones/${id}/`, { leida: true });
export const marcarTodasLeidas = () => apiClient.post('compras-notificaciones/marcar-todas-leidas/');
