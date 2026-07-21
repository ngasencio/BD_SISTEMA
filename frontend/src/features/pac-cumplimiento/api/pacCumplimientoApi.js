import apiClient from '../../../lib/axios';

export const getDentroFuera = (params = {}) =>
    apiClient.get('pac-cumplimiento/dentro-fuera/', { params });

export const getCumplimientoTemporal = (params = {}) =>
    apiClient.get('pac-cumplimiento/temporal/', { params });

export const getJerarquia = (params = {}) =>
    apiClient.get('pac-cumplimiento/jerarquia/', { params });

export const getRankings = (params = {}) =>
    apiClient.get('pac-cumplimiento/rankings/', { params });

export const getTemporalidadMensual = (params = {}) =>
    apiClient.get('pac-cumplimiento/temporalidad-mensual/', { params });

export const getResumenSubdireccion = (params = {}) =>
    apiClient.get('pac-cumplimiento/resumen-subdireccion/', { params });

export const getSerieMensualHistorica = () =>
    apiClient.get('pac-cumplimiento/serie-mensual/');

// Módulo Ficha PAC — Ejecución del Plan de Compras (Ficha ↔ Formulario ↔ OC)
export const getFichasPac = (params = {}) =>
    apiClient.get('pac-cumplimiento/fichas/', { params });

export const getFichaPacDetalle = (idProyecto) =>
    apiClient.get(`pac-cumplimiento/fichas/${encodeURIComponent(idProyecto)}/`);

export const getTemporalMensualPlaner = (params = {}) =>
    apiClient.get('pac-cumplimiento/temporal-mensual-planer/', { params });

export const getJerarquiaPlaner = (params = {}) =>
    apiClient.get('pac-cumplimiento/jerarquia-planer/', { params });

// Departamentos de Establecimiento 197 — para el selector de filtro por depto en Ver Ficha/Temporal.
export const getDepartamentosPac = () =>
    apiClient.get('departamentos/', { params: { establecimiento_id: ESTABLECIMIENTO_PAC_CUMPLIMIENTO } });

// Tabla de formularios del Resumen — reutiliza el endpoint ya existente de
// Abastecimiento con ?establecimiento= para acotar a Establecimiento SSO 197
// (misma tabla, distinto alcance; ver FormularioFSCDerivadoViewSet.get_queryset).
export const ESTABLECIMIENTO_PAC_CUMPLIMIENTO = 1;

export const getFormulariosPac = (params = {}) =>
    apiClient.get('formularios-fsc-derivados/', {
        params: { establecimiento: ESTABLECIMIENTO_PAC_CUMPLIMIENTO, ...params },
    });

// Un formulario puntual por su PK real (id) — usado por Rankings (tipo='formulario')
// para abrir el modal de revisión directo desde una fila del ranking, sin pasar por
// la tabla paginada/filtrada.
export const getFormularioPacPorId = (id) =>
    apiClient.get(`formularios-fsc-derivados/${id}/`);

export const actualizarMaestroPac = () =>
    apiClient.post('pac-cumplimiento/actualizar-maestro/');

export const actualizarJerarquiaPac = () =>
    apiClient.post('pac-cumplimiento/actualizar-jerarquia/');

export const descargarReporte = (formato, periodo) =>
    apiClient.get(`pac-cumplimiento/reporte/${formato}/`, { params: { periodo }, responseType: 'blob' });
