import React from 'react';

const COLOR_ESTADO = {
    verde: { bg: '#dcfce7', border: '#16a34a', text: '#166534' },
    amarillo: { bg: '#fef9c3', border: '#ca8a04', text: '#854d0e' },
    rojo: { bg: '#fee2e2', border: '#dc2626', text: '#991b1b' },
};

const ETIQUETA_ESTADO = {
    verde: 'Completo',
    amarillo: 'Mes en curso (parcial)',
    rojo: 'Sin datos',
};

function formatearPeriodo(periodo) {
    const [anho, mes] = periodo.split('-');
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${nombres[parseInt(mes, 10) - 1]} ${anho.slice(2)}`;
}

function Celda({ info }) {
    const colores = COLOR_ESTADO[info.estado] || COLOR_ESTADO.rojo;
    const titulo = [
        ETIQUETA_ESTADO[info.estado],
        info.n_filas ? `${info.n_filas} filas` : null,
        info.fecha_hasta_tramo ? `hasta ${info.fecha_hasta_tramo}` : null,
        info.fecha_sync ? `sincronizado ${new Date(info.fecha_sync).toLocaleString('es-CL')}` : null,
    ].filter(Boolean).join(' — ');

    return (
        <td
            title={titulo}
            style={{
                background: colores.bg,
                border: `1px solid ${colores.border}`,
                color: colores.text,
                textAlign: 'center',
                padding: '8px 4px',
                fontSize: 12,
                fontWeight: 600,
                minWidth: 46,
                cursor: 'default',
            }}
        >
            {info.n_filas > 0 ? info.n_filas : '—'}
        </td>
    );
}

export default function MatrizEstadoBD({ data }) {
    if (!data) return null;
    const { establecimientos, periodos, matriz } = data;

    return (
        <div className="card" style={{ padding: 0 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                {Object.entries(ETIQUETA_ESTADO).map(([estado, etiqueta]) => (
                    <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569' }}>
                        <span style={{
                            width: 12, height: 12, borderRadius: 3, display: 'inline-block',
                            background: COLOR_ESTADO[estado].bg, border: `1px solid ${COLOR_ESTADO[estado].border}`,
                        }} />
                        {etiqueta}
                    </div>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
                    El número en cada celda es la cantidad de filas cargadas para ese mes.
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{
                                position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1,
                                textAlign: 'left', padding: '8px 12px', fontSize: 12.5, color: '#334155',
                                borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                            }}>
                                Establecimiento
                            </th>
                            {periodos.map((p) => (
                                <th key={p} style={{
                                    padding: '8px 4px', fontSize: 11.5, color: '#64748b', fontWeight: 600,
                                    borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                                }}>
                                    {formatearPeriodo(p)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {establecimientos.map((est) => (
                            <tr key={est.codigo_ue}>
                                <td style={{
                                    position: 'sticky', left: 0, background: '#fff', zIndex: 1,
                                    padding: '8px 12px', fontSize: 13, color: '#1e293b', whiteSpace: 'nowrap',
                                    borderBottom: '1px solid #f1f5f9',
                                }}>
                                    <div style={{ fontWeight: 600 }}>{est.nombre}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{est.codigo_ue}</div>
                                </td>
                                {periodos.map((p) => (
                                    <Celda key={p} info={matriz[est.codigo_ue]?.[p] || { estado: 'rojo', n_filas: 0 }} />
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
