/**
 * @file features/abastecimiento/api/boletasApi.js
 * @description API layer para el módulo de Registro de Boletas de Garantía.
 */
import apiClient from '../../../lib/axios';

// ─── Catálogos ─────────────────────────────────────────────────────────────────

export const getProveedores = (search = '') =>
    apiClient.get('proveedores/', { params: search ? { search } : {} });

export const getCompradores = (search = '') =>
    apiClient.get('compradores/', { params: search ? { search } : {} });

// ─── Boletas de Garantía ───────────────────────────────────────────────────────

export const getBoletas = (params = {}) =>
    apiClient.get('boletas-garantia/', { params });

export const getBoletaById = (id) =>
    apiClient.get(`boletas-garantia/${id}/`);

export const createBoleta = (formData) =>
    apiClient.post('boletas-garantia/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

export const updateBoleta = (id, formData) =>
    apiClient.patch(`boletas-garantia/${id}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

/**
 * Elimina una boleta registrando la razón de baja en auditoría.
 * @param {number} id
 * @param {string} razon
 */
export const deleteBoleta = (id, razon = '') => {
    const body = new FormData();
    body.append('razon', razon);
    return apiClient.delete(`boletas-garantia/${id}/`, { data: body });
};

// ─── Auditoría ─────────────────────────────────────────────────────────────────

export const getAuditoria = (params = {}) =>
    apiClient.get('boletas-garantia-audit/', { params });
