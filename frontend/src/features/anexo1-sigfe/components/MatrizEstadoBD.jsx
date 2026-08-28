import React, { useState } from 'react';
import EstablecimientoSerieNivel1 from './EstablecimientoSerieNivel1';

const COLOR_ESTADO = {
    verde: { bg: 'var(--gob-verde-lt)', border: 'var(--gob-verde)', text: '#166534' },
    amarillo: { bg: 'var(--gob-amarillo-lt)', border: 'var(--gob-amarillo)', text: '#854d0e' },
    rojo: { bg: 'var(--gob-rojo-lt)', border: 'var(--gob-rojo)', text: 'var(--gob-rojo)' },
};

const ETIQUETA_ESTADO = {
    verde: 'Completo',
    amarillo: 'Mes en curso (parcial)',
    rojo: 'Sin datos',
};

export function formatearPeriodo(periodo) {
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
                padding: '5px 4px',
                fontSize: 11,
                fontWeight: 600,
                minWidth: 40,
                cursor: 'default',
            }}
        >
            {info.n_filas > 0 ? info.n_filas : '—'}
        </td>
    );
}

export default function MatrizEstadoBD({ data }) {
    const [seleccionado, setSeleccionado] = useState(null);
    const [hover, setHover] = useState(null);

    if (!data) return null;
    const { establecimientos, periodos, matriz } = data;

    const toggleSeleccion = (codigoUe) => {
        setSeleccionado((prev) => (prev === codigoUe ? null : codigoUe));
    };

    const estSeleccionado = establecimientos.find((e) => e.codigo_ue === seleccionado);

    return (
        <div className="card" style={{ padding: 0 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                {Object.entries(ETIQUETA_ESTADO).map(([estado, etiqueta]) => (
                    <div key={estado} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gob-gris5)' }}>
                        <span style={{
                            width: 10, height: 10, borderRadius: 3, display: 'inline-block',
                            background: COLOR_ESTADO[estado].bg, border: `1px solid ${COLOR_ESTADO[estado].border}`,
                        }} />
                        {etiqueta}
                    </div>
                ))}
                <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gob-gris4)' }}>
                    Cantidad de filas cargadas por mes · clic en un establecimiento para ver su gasto Nivel 1.
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{
                                position: 'sticky', left: 0, background: 'var(--gob-gris1)', zIndex: 1,
                                textAlign: 'left', padding: '6px 12px', fontSize: 10.5, color: 'var(--gob-gris4)',
                                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px',
                                borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
                            }}>
                                Establecimiento
                            </th>
                            {periodos.map((p) => (
                                <th key={p} style={{
                                    padding: '6px 4px', fontSize: 10.5, color: 'var(--gob-gris4)', fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: '.2px',
                                    borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap',
                                }}>
                                    {formatearPeriodo(p)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {establecimientos.map((est) => {
                            const activo = est.codigo_ue === seleccionado;
                            const resaltado = activo || est.codigo_ue === hover;
                            return (
                                <tr
                                    key={est.codigo_ue}
                                    onClick={() => toggleSeleccion(est.codigo_ue)}
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHover(est.codigo_ue)}
                                    onMouseLeave={() => setHover((prev) => (prev === est.codigo_ue ? null : prev))}
                                >
                                    <td style={{
                                        position: 'sticky', left: 0, zIndex: 1,
                                        background: resaltado ? 'var(--gob-celeste-lt)' : '#fff',
                                        borderLeft: activo ? '3px solid var(--gob-azul)' : '3px solid transparent',
                                        padding: '6px 12px 6px 9px', fontSize: 12.5, color: 'var(--gob-gris5)', whiteSpace: 'nowrap',
                                        borderBottom: '1px solid var(--gob-gris2)',
                                    }}>
                                        <div style={{ fontWeight: 600 }}>{est.nombre}</div>
                                        <div style={{ fontSize: 10.5, color: 'var(--gob-gris4)' }}>{est.codigo_ue}</div>
                                    </td>
                                    {periodos.map((p) => (
                                        <Celda key={p} info={matriz[est.codigo_ue]?.[p] || { estado: 'rojo', n_filas: 0 }} />
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {estSeleccionado && (
                <EstablecimientoSerieNivel1
                    codigoUe={estSeleccionado.codigo_ue}
                    nombre={estSeleccionado.nombre}
                    onClose={() => setSeleccionado(null)}
                />
            )}
        </div>
    );
}
