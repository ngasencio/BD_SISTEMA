import apiClient from '../../../lib/axios';

// Tablero del Home. Sin `anio`, el servidor usa el año en curso; devuelve solo los bloques que el rol puede ver.
export const getInicioResumen = (anio) =>
    apiClient.get('inicio/resumen/', { params: anio ? { anio } : {} });
