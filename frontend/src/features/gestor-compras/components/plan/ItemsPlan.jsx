import React, { useMemo, useState } from 'react';
import { getGestorPlanItems } from '../../api/gestorComprasApi';
import { BarraPaginacion, fmtCLP, fmtN, useListaServidor } from '../solicitudes/shared';
import { ESTADO_FICHA } from './ModalFichaGestor';

const ESTADOS = [
    { key: '', label: 'Todos' },
    { key: 'EJECUTADO', label: '✅ Ejecutado' },
    { key: 'PENDIENTE', label: '⏳ Pendiente' },
    { key: 'ATRASADO', label: '⏰ Atrasado' },
    { key: 'SIN_FECHA', label: '❓ Sin fecha' },
];

const th = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };

// Ítems (proyectos) del Plan Anual de Compras del departamento, con su estado de ejecución y
// los formularios y órdenes de compra que los respaldan. Solo lectura.
export default function ItemsPlan({ params, anho, onVerFicha }) {
    const [estado, setEstado] = useState('');
    const filtros = useMemo(() => ({
        ...params,
        ...(anho ? { anho } : {}),
        ...(estado ? { estado } : {}),
    }), [params, anho, estado]);

    // El endpoint pagina con page/page_size y no ordena (orden por fecha de compra más próxima).
    const { search, setSearch, page, setPage, data, cargando } =
        useListaServidor(getGestorPlanItems, undefined, filtros);

    return (
        <div className="card">
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>📋 Ítems del Plan Anual de Compras</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Proyectos de su departamento: ficha, formulario de compra vinculado y OC enlazada — {fmtN(data.count)} ficha(s)
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por proyecto…"
                        style={{ border: '1.5px solid #c8d3de', borderRadius: 7, padding: '6px 10px', fontSize: 12, minWidth: 200 }}
                    />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {ESTADOS.map((e) => (
                            <button
                                key={e.key}
                                onClick={() => setEstado(e.key)}
                                style={{
                                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    border: `1px solid ${estado === e.key ? '#0ea5e9' : '#e2e8f0'}`,
                                    background: estado === e.key ? '#e0f2fe' : '#fff',
                                    color: estado === e.key ? '#0369a1' : '#64748b',
                                }}
                            >
                                {e.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            {['ID Proyecto', 'Nombre Proyecto', 'Departamento', 'Responsable', 'Monto Total', 'Fecha Compra', 'Formulario', 'OC', 'Estado', ''].map((h) => <th key={h} style={th}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {cargando ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Cargando…</td></tr>
                        ) : data.results.length === 0 ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No hay ítems del plan para el filtro seleccionado.</td></tr>
                        ) : data.results.map((f) => {
                            const badge = ESTADO_FICHA[f.estado_ejecucion] ?? ESTADO_FICHA.SIN_FECHA;
                            return (
                                <tr key={f.id_proyecto} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#0369a1' }}>{f.id_proyecto}</td>
                                    <td style={{ padding: '7px 10px', maxWidth: 240 }}><div className="truncate-text" title={f.nombre_proyecto}>{f.nombre_proyecto}</div></td>
                                    <td style={{ padding: '7px 10px', maxWidth: 200 }}><div className="truncate-text" title={f.depto_nombre || f.depto_texto}>{f.depto_nombre || f.depto_texto}</div></td>
                                    <td style={{ padding: '7px 10px', maxWidth: 160 }}><div className="truncate-text" title={f.nombre_responsable}>{f.nombre_responsable}</div></td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500 }}>{fmtCLP(f.monto_total)}</td>
                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{f.fecha_mas_proxima || '—'}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{f.tiene_formulario ? `✅ ${f.cantidad_formularios}` : '—'}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>{f.tiene_oc ? `✅ ${f.cantidad_oc}` : '—'}</td>
                                    <td style={{ padding: '7px 10px' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
                                            {badge.label}
                                        </span>
                                    </td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => onVerFicha(f.id_proyecto)}
                                            title="Ver ficha completa"
                                            style={{ padding: '4px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, color: '#0369a1', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                            🔍 Revisar
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div style={{ padding: '0 18px 12px' }}>
                <BarraPaginacion page={page} setPage={setPage} count={data.count} />
            </div>
        </div>
    );
}
