// Traduce el filtro compartido {ue, anho, mesDesde, mesHasta, excluir3435} al
// nombrado snake_case que esperan los endpoints sigfe-anexo1/*.
export function paramsBase(filtros, extra = {}) {
    return {
        ue: filtros.ue || undefined,
        anho: filtros.anho || undefined,
        mes_desde: filtros.mesDesde || undefined,
        mes_hasta: filtros.mesHasta || undefined,
        excluir_34_35: filtros.excluir3435,
        ...extra,
    };
}
