import apiClient from '../../../lib/axios';

export const getResumen = (params = {}) =>
    apiClient.get('fsc-oc-pac/resumen/', { params });

export const getPendientes = (params = {}) =>
    apiClient.get('fsc-oc-pac/pendientes/', { params });

export const getPivote = (params = {}) =>
    apiClient.get('fsc-oc-pac/pivote/', { params });

export const getCompraAgilResumen = (params = {}) =>
    apiClient.get('fsc-oc-pac/compraagil-resumen/', { params });

export const getFscOcLinks = (params = {}) =>
    apiClient.get('fsc-oc-links/', { params });

export const confirmarLink = (linkId) =>
    apiClient.post('fsc-oc-pac/confirmar/', { link_id: linkId });

export const rechazarLink = (linkId, motivo) =>
    apiClient.post('fsc-oc-pac/rechazar/', { link_id: linkId, motivo });

export const enlazarManual = (formularioDerivadoId, codigoOc, observaciones) =>
    apiClient.post('fsc-oc-pac/enlazar-manual/', {
        formulario_derivado_id: formularioDerivadoId,
        codigo_oc: codigoOc,
        observaciones,
    });

export const recalcularMatching = () =>
    apiClient.post('fsc-oc-pac/recalcular/');

export const getFscDetalle = (id) =>
    apiClient.get('fsc-oc-pac/fsc-detalle/', { params: { id } });

export const getOcDetalle = (codigoOc) =>
    apiClient.get('fsc-oc-pac/oc-detalle/', { params: { codigo_oc: codigoOc } });

export const corregirPac = (codigoOc, formularioDerivadoId, observaciones) =>
    apiClient.post('fsc-oc-pac/corregir-pac/', {
        codigo_oc: codigoOc,
        formulario_derivado_id: formularioDerivadoId,
        observaciones,
    });

export const getCorregidas = () =>
    apiClient.get('fsc-oc-pac/corregidas/');

export const getImpacto = () =>
    apiClient.get('fsc-oc-pac/impacto/');
