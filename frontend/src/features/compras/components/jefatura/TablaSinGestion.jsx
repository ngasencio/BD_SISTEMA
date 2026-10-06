import React, { useEffect, useState } from 'react';
import { getJefaturaSinGestion } from '../../api/comprasApi';
import FscProcesoPanel from '../FscProcesoPanel';
import ModalDetalleFsc from '../ModalDetalleFsc';

const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);

const thStyle = {
    padding: '9px 10px', textAlign: 'left', fontWeight: 600,
    color: '#475569', borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap', background: '#f8fafc', fontSize: 12,
};

// Mismos umbrales que DiasBadge en MisFormulariosPage/FormulariosPage —
// acá `dias` ya viene calculado del backend (calcular_compras_sin_gestion),
// no hay fecha string que parsear en el frontend.
function DiasBadge({ dias }) {
    if (dias === null || dias === undefined) return <span style={{ color: '#94a3b8' }}>—</span>;
    const color = dias > 30 ? '#dc2626' : dias > 10 ? '#f97316' : dias > 5 ? '#f59e0b' : '#16a34a';
    const bg    = dias > 30 ? '#fef2f2' : dias > 10 ? '#fff7ed' : dias > 5 ? '#fffbeb' : '#f0fdf4';
    return (
        <span style={{
            display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: bg, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap',
        }}>
            {dias}d
        </span>
    );
}

// Tabla "sin gestión" del Tab General — FSC de TODOS los compradores que
// todavía no tienen un ProcesoCompra. Incluye el caso 'sin cuenta asignada'
// (comprador_id=null) para que un hueco de catálogo como el de Bastián
// Miranda/Lesly Díaz salte a la vista en vez de pasar desapercibido.
export default function TablaSinGestion({ refreshKey, onRefrescar }) {
    const [data, setData] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [fscSeleccionado, setFscSeleccionado] = useState(null);
    const [fscVerId, setFscVerId] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getJefaturaSinGestion()
            .then(({ data: res }) => { if (activo) setData(res); })
            .catch(() => { if (activo) setData([]); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [refreshKey]);

    return (
        <div className="card">
            <div className="card-header card-header-accent">
                <span>📋</span>
                <span className="card-title">{data.length} formulario(s) sin gestión (todos los compradores)</span>
            </div>

            {cargando ? (
                <div className="loading-spinner">Cargando…</div>
            ) : data.length === 0 ? (
                <div className="loading-spinner">Todos los FSC activos ya tienen un Proceso de Compra asociado.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>ID</th>
                                <th style={thStyle}>Comprador</th>
                                <th style={thStyle}>Unidad Requirente</th>
                                <th style={thStyle}>Requerimiento</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Monto Estimado</th>
                                <th style={thStyle}>Días</th>
                                <th style={thStyle}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((f, i) => (
                                <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                                        {f.id_formulario}
                                    </td>
                                    <td style={{ padding: '8px 10px', color: f.comprador_id ? '#374151' : '#dc2626', fontWeight: f.comprador_id ? 400 : 600 }}>
                                        {f.comprador_display}
                                    </td>
                                    <td style={{ padding: '8px 10px', color: '#374151' }}>{f.unidad_requirente || '—'}</td>
                                    <td style={{ padding: '8px 10px', maxWidth: 280 }}>
                                        <div className="truncate-text" title={f.requerimiento}>{f.requerimiento || '—'}</div>
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#374151' }}>{fmtCLP(f.monto_estimado)}</td>
                                    <td style={{ padding: '8px 10px' }}><DiasBadge dias={f.dias} /></td>
                                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button type="button" className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}
                                                    onClick={() => setFscVerId(f.id)}>
                                                Ver
                                            </button>
                                            <button type="button" className="btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}
                                                    disabled={!f.comprador_id}
                                                    title={f.comprador_id ? '' : 'Este comprador no tiene cuenta asignada en el catálogo — no se puede clasificar a su nombre todavía.'}
                                                    onClick={() => setFscSeleccionado(f)}>
                                                Gestionar
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {fscSeleccionado && (
                <FscProcesoPanel
                    fsc={fscSeleccionado}
                    onCambiado={() => { setFscSeleccionado(null); onRefrescar?.(); }}
                    onCerrar={() => setFscSeleccionado(null)}
                />
            )}
            {fscVerId && <ModalDetalleFsc fscId={fscVerId} onCerrar={() => setFscVerId(null)} />}
        </div>
    );
}
