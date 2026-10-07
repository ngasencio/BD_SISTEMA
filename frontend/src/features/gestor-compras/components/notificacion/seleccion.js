// Lógica PURA (sin React) de la selección de planes de la pestaña Notificación, para poder
// probarla con `node --test` sin dependencias. Una selección es de dos tipos:
//   · 'ids'    — planes elegidos uno a uno (o por página): selecciona solo los de `ids`.
//   · 'filtro' — "todos los planes que cumplen el filtro actual": selecciona todos MENOS los
//                de `excluidos`. Así funciona con miles de planes sin cargarlos todos al navegador,
//                y el servidor vuelve a resolver el filtro al enviar.
// Las funciones nunca mutan: devuelven una selección nueva.

export const seleccionVacia = () => ({ modo: 'ids', ids: new Set(), excluidos: new Set() });

export const estaSeleccionado = (sel, id) =>
    sel.modo === 'filtro' ? !sel.excluidos.has(id) : sel.ids.has(id);

const copiar = (sel) => ({ modo: sel.modo, ids: new Set(sel.ids), excluidos: new Set(sel.excluidos) });

export function alternar(sel, id) {
    const n = copiar(sel);
    const objetivo = n.modo === 'filtro' ? n.excluidos : n.ids;
    if (objetivo.has(id)) objetivo.delete(id); else objetivo.add(id);
    return n;
}

// marcar=true selecciona todos los de la página; false los deselecciona.
export function seleccionarPagina(sel, idsPagina, marcar) {
    const n = copiar(sel);
    for (const id of idsPagina) {
        if (n.modo === 'filtro') { if (marcar) n.excluidos.delete(id); else n.excluidos.add(id); }
        else if (marcar) n.ids.add(id); else n.ids.delete(id);
    }
    return n;
}

export const paginaCompleta = (sel, idsPagina) =>
    idsPagina.length > 0 && idsPagina.every((id) => estaSeleccionado(sel, id));

export const seleccionarTodosFiltrados = () => ({ modo: 'filtro', ids: new Set(), excluidos: new Set() });

export const cantidadSeleccionada = (sel, totalFiltrado) =>
    sel.modo === 'filtro' ? Math.max(0, (totalFiltrado || 0) - sel.excluidos.size) : sel.ids.size;

// Filtros de la tabla → parámetros de la query string del GET.
export function filtrosAParams(f) {
    const p = {};
    if (f.estados?.length) p.estado = f.estados.join(',');
    if (f.mes) p.mes = f.mes;
    if (f.search) p.search = f.search;
    if (f.correo) p.correo = f.correo;
    if (f.notificado) p.notificado = f.notificado;
    return p;
}

// Selección → cuerpo del POST (previsualizar/enviar). null si no hay nada seleccionado.
export function construirSeleccion(sel, anho, filtros, totalFiltrado) {
    if (cantidadSeleccionada(sel, totalFiltrado) <= 0) return null;
    const base = anho ? { anho } : {};
    if (sel.modo === 'ids') return { ...base, ids: [...sel.ids] };
    return {
        ...base,
        filtros: {
            estados: filtros.estados?.length ? filtros.estados : null,
            mes: filtros.mes || null, search: filtros.search || null,
            correo: filtros.correo || null, notificado: filtros.notificado || null,
        },
        excluir: [...sel.excluidos],
    };
}
