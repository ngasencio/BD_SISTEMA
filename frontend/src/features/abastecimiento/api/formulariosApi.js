import apiClient from '../../../lib/axios';

export const getFormulariosStats = (params = {}) => apiClient.get('formularios/stats/', { params });
export const getFormulariosFlujo = (params = {}) => apiClient.get('formularios/flujo/', { params });
export const getFormulariosOrganigrama = () => apiClient.get('formularios/organigrama/');

export const getFormularios          = (params = {}) => apiClient.get('formularios-fsc/', { params });
export const getFormulariosDerivados = (params = {}) => apiClient.get('formularios-fsc-derivados/', { params });
export const getFormulariosProductos = (params = {}) => apiClient.get('formularios-fsc-productos/', { params });

export const getFormulariosAlertas      = (params = {}) => apiClient.get('formularios/alertas/', { params });
export const getFormulariosUnificacion  = (params = {}) => apiClient.get('formularios/unificacion/', { params });
export const getFormulariosHistorial    = (params = {}) => apiClient.get('formularios/historial/', { params });
export const getFormularioById          = (id)          => apiClient.get(`formularios-fsc/${id}/`);

// Ficha completa para el botón "Ver": formulario + carro + historial de bandejas + proceso de
// compra + OC enlazadas. `origen` indica de qué tabla viene el id ('solicitud' | 'derivado').
export const getFormularioFicha = (origen, id) => apiClient.get('formularios/ficha/', { params: { origen, id } });

export const iniciarActualizacionFormularios  = (credenciales)  => apiClient.post('formularios/actualizar/', credenciales);
export const estadoActualizacionFormularios   = (taskId)        => apiClient.get(`formularios/actualizar-estado/${taskId}/`);
export const cancelarActualizacionFormularios = (taskId)        => apiClient.post(`formularios/actualizar-cancelar/${taskId}/`);

// Pestaña "Temporalidad" — reutiliza el backend del módulo PAC Cumplimiento
// (mismo alcance: Establecimiento 1, Dirección SS Osorno) acotado a estado='AC'.
export const getTemporalidadComparativo = () => apiClient.get('pac-cumplimiento/temporalidad-formularios/comparativo/');
export const getTemporalidadJerarquia   = (anho) => apiClient.get('pac-cumplimiento/temporalidad-formularios/jerarquia/', { params: anho ? { anho } : {} });

// `filtroOrg` opcional: { ids: number[], sinClasificar: boolean } — acota el ranking a
// una rama de la jerarquía (mismo contrato que `sso_departamento_in`/`sin_clasificar`
// de `formularios-fsc-derivados/`, usado por la tabla de drill-down de abajo).
export const getTemporalidadUsuarios = (anho, limite = 50, filtroOrg = null) => apiClient.get(
    'pac-cumplimiento/temporalidad-formularios/usuarios/',
    { params: { limite, ...(anho ? { anho } : {}), ...(filtroOrg?.ids?.length ? { depto_ids: filtroOrg.ids.join(',') } : {}), ...(filtroOrg?.sinClasificar ? { sin_clasificar: 1 } : {}) } },
);

// Detalle de un formulario YA DERIVADO (tabla distinta de getFormularioById, que
// apunta a formularios-fsc/ — ids de FormularioFSC y FormularioFSCDerivado NO son
// intercambiables, son tablas y PKs distintos).
export const getFormularioDerivadoById = (id) => apiClient.get(`formularios-fsc-derivados/${id}/`);
