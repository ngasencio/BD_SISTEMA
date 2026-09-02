import apiClient from '../../../lib/axios';

export const getMisFormularios = (params = {}) =>
    apiClient.get('compras/mis-formularios/', { params });

export const getProcesos      = (params = {}) => apiClient.get('compras-procesos/', { params });
export const getProceso       = (id)          => apiClient.get(`compras-procesos/${id}/`);
export const crearProceso     = (data)        => apiClient.post('compras-procesos/', data);
export const actualizarProceso = (id, data)   => apiClient.patch(`compras-procesos/${id}/`, data);
export const cambiarEstadoProceso = (id, estado_proceso, comentario = '') =>
    apiClient.post(`compras-procesos/${id}/cambiar-estado/`, { estado_proceso, comentario });
export const agregarFormularioAProceso = (id, formulario_id) =>
    apiClient.post(`compras-procesos/${id}/agregar-formulario/`, { formulario_id });
export const agregarOcAProceso = (id, codigo_oc) =>
    apiClient.post(`compras-procesos/${id}/agregar-oc/`, { codigo_oc });
export const desvincularProcesoMp = (id) => apiClient.post(`compras-procesos/${id}/desvincular-mp/`);
export const quitarOcDeProceso = (id, codigo_oc) =>
    apiClient.post(`compras-procesos/${id}/quitar-oc/`, { codigo_oc });
export const getHistorialProceso = (id) => apiClient.get(`compras-procesos/${id}/historial/`);
export const getDetalleProcesoMp = (id) => apiClient.get(`compras-procesos/${id}/detalle-mp/`);

export const getCompradores = (params = {}) => apiClient.get('compras-compradores/', { params });

// Detalle completo de un FSC derivado — mismo endpoint que usa Formularios FSC
// (features/abastecimiento), reutilizado acá para el botón "Ver" de la ficha.
export const getFormularioDerivadoDetalle = (id) => apiClient.get(`formularios-fsc-derivados/${id}/`);
export const getProductosFormulario = (params = {}) => apiClient.get('formularios-fsc-productos/', { params });

// Búsqueda de Licitación/Compra Ágil/OC ya sincronizadas localmente, para
// enlazar al proceso desde el mismo panel. Fase 3 agrega el fallback a la API
// de Mercado Público en vivo cuando no hay resultados locales — mismo
// contrato, no cambia esta capa.
export const buscarLicitacion = (q) => apiClient.get('compras/buscar-licitacion/', { params: { q } });
export const buscarCompraAgil = (q) => apiClient.get('compras/buscar-compra-agil/', { params: { q } });
export const buscarOc = (q) => apiClient.get('compras/buscar-oc/', { params: { q } });

// Fase 3: si el código exacto no está sincronizado localmente, lo trae en
// vivo de Mercado Público y lo guarda en la base de datos general (no una
// tabla aparte) — queda disponible para todo el sistema desde ese momento.
export const importarLicitacion = (codigo) => apiClient.post('compras/importar-licitacion/', { codigo });
export const importarCompraAgil = (codigo) => apiClient.post('compras/importar-compra-agil/', { codigo });
export const importarOc = (codigo) => apiClient.post('compras/importar-oc/', { codigo });

