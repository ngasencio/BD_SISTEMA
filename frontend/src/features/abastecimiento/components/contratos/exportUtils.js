import * as XLSX from 'xlsx';

const fmt = (n) =>
    n == null ? '' :
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

export function exportarEvaluaciones(data) {
    const wb = XLSX.utils.book_new();

    const filas = data.detalle_pendientes.map(r => ({
        'N° Contrato': r.numero_contrato,
        'Nombre': r.nombre_contrato,
        'Estado': r.estado_contrato,
        'Unidad': r.unidad_requirente,
        'Monto Contrato': r.monto_contrato,
        'Año': r.anio,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Pendientes de Evaluación');

    const resumen = data.por_anio.map(r => ({
        'Año': r.anio,
        'Total Terminados': r.total,
        'Evaluados': r.evaluados,
        'Pendientes': r.pendientes,
        'Monto Total': r.monto,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Por Año');

    XLSX.writeFile(wb, 'evaluaciones_contratos.xlsx');
}

export function exportarFinanciero(rows) {
    const wb = XLSX.utils.book_new();
    const filas = rows.map(r => ({
        'N° Contrato': r.numero_contrato,
        'Nombre Contrato': r.nombre_contrato,
        'ID Licitación OC': r.id_licitacion_oc,
        'Estado': r.estado_contrato,
        'Unidad': r.unidad_requirente,
        'Categoría': r.categoria_contrato,
        'Monto Contrato': r.monto_contrato,
        'Monto Ejecutado': r.monto_ejecutado,
        'Monto por Ejecutar': r.monto_por_ejecutar ?? '',
        'Monto OC (sistema)': r.suma_bruto_oc ?? '',
        'N° OC': r.n_oc,
        'Reconciliación': r.reconciliacion,
        'Meses hasta agotamiento': r.meses_hasta_agotamiento ?? '',
        'Alerta': r.alerta,
        'Días Vigencia': r.dias_vigencia,
        'Días Restantes': r.dias_restantes,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Seguimiento Financiero');
    XLSX.writeFile(wb, 'seguimiento_financiero_contratos.xlsx');
}

export function exportarOCDetalle(idLic, data) {
    const wb = XLSX.utils.book_new();
    const filas_oc = data.oc.map(oc => ({
        'Código OC': oc.codigo_oc,
        'Nombre OC': oc.NombreOC,
        'Estado': oc.EstadoOC,
        'Total Bruto': oc.TotalBruto,
        'Total Neto': oc.TotalNeto,
        'Fecha Envío': oc.FechaEnvio,
        'Fecha Creación': oc.FechaCreacion,
        'Proveedor': oc.P_Nombre,
        'Unidad': oc.C_Unidad,
        'Enlace PAC': oc.EnlacePAC,
        'ID Proyecto': oc.ID_Proyecto,
        'Nombre Proyecto': oc.Nombre_Proyecto,
        'Link MP': oc.LinkMP,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas_oc), 'Órdenes de Compra');

    const filas_prod = [];
    data.oc.forEach(oc => {
        (oc.productos || []).forEach(p => {
            filas_prod.push({
                'Código OC': oc.codigo_oc,
                'Código Categoría': p.CodigoCategoria,
                'Categoría': p.Categoria,
                'Código Producto': p.CodigoProducto,
                'Producto': p.Producto,
                'Cantidad': p.Cantidad,
                'Precio Neto': p.PrecioNeto,
                'Total Línea': p.TotalLinea,
            });
        });
    });
    if (filas_prod.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas_prod), 'Detalle Productos');
    }

    XLSX.writeFile(wb, `oc_detalle_${idLic}.xlsx`);
}

export function exportarPlazos(data) {
    const wb = XLSX.utils.book_new();
    const filas = data.activos.map(r => ({
        'N° Contrato': r.numero_contrato,
        'Nombre': r.nombre_contrato,
        'Estado': r.estado_contrato,
        'Unidad': r.unidad_requirente,
        'Monto Contrato': r.monto_contrato,
        'Días Vigencia': r.dias_vigencia,
        'Días Restantes': r.dias_restantes,
        '% Tiempo Ejecutado': r.pct_ejecutado_tiempo,
        'Alerta': r.alerta_tiempo,
        'Fecha Inicio': r.fecha_inicio,
        'Fecha Término': r.fecha_termino,
        'ID Licitación OC': r.id_licitacion_oc,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Plazos y Vigencia');
    XLSX.writeFile(wb, 'plazos_contratos.xlsx');
}

export function exportarPAC(data) {
    const wb = XLSX.utils.book_new();
    const filas_resumen = data.resumen.map(r => ({
        'N° Contrato': r.numero_contrato,
        'Nombre': r.nombre_contrato,
        'Monto Contrato': r.monto_contrato,
        'Estado': r.estado_contrato,
        'Categoría': r.categoria_contrato,
        'ID Licitación OC': r.id_licitacion_oc,
        'N° OC Total': r.n_oc_total,
        'N° OC Enlazadas': r.n_oc_enlazada,
        'N° OC No Enlazadas': r.n_oc_no_enlazada,
        '% Enlazado': r.pct_enlazada,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas_resumen), 'Cruce PAC');

    const filas_pivot = data.pivot_anio_estado.map(r => ({
        'Año': r.anio,
        'Enlazada': r.Enlazada,
        'No Enlazada': r['No Enlazada'],
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas_pivot), 'Por Año');

    XLSX.writeFile(wb, 'cruce_pac_contratos.xlsx');
}
