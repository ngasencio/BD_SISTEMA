import apiClient from '../../../lib/axios';

export const getMisFormularios = (params = {}) =>
    apiClient.get('compras/mis-formularios/', { params });

// Panel "Resumen" — alertas de plazo (Licitación/Compra Ágil próximas a
// cerrar o ya cerradas sin tramitar), FSC en gestión interna sin enlace MP,
// y el pivote tipo×estado. Todo acotado al comprador logueado.
export const getResumenComprador = () => apiClient.get('compras/resumen/');

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
// `forzar=true` (botón "🔄 Actualizar" de un enlace ya existente) se salta el
// atajo "ya está en la BD local" y siempre vuelve a consultar Mercado
// Público, sobrescribiendo el registro local con lo último.
export const importarLicitacion = (codigo, forzar = false) =>
    apiClient.post('compras/importar-licitacion/', { codigo, forzar });
export const importarCompraAgil = (codigo, forzar = false) =>
    apiClient.post('compras/importar-compra-agil/', { codigo, forzar });
export const importarOc = (codigo, forzar = false) =>
    apiClient.post('compras/importar-oc/', { codigo, forzar });

// Panel Formularios — supervisión global de jefatura (sin 'comprador').
export const getJefaturaActividad = (params = {}) => apiClient.get('compras/jefatura/actividad/', { params });
export const getJefaturaSinGestion = () => apiClient.get('compras/jefatura/sin-gestion/');
export const getJefaturaAvance = () => apiClient.get('compras/jefatura/avance/');
export const getJefaturaResumen = (compradorId) =>
    apiClient.get('compras/jefatura/resumen/', { params: { comprador_id: compradorId } });

