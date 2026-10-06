import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { getGestorAlertas } from '../../api/gestorComprasApi';
import { DiasBadge, ESTADO_FSC_INFO, EstadoFSCBadge, FiltroChip, fmtCLP, fmtN, thStyle } from './shared';

const UMBRALES = [5, 10, 15, 30];
const COLORES_UMBRAL = { 5: '#f59e0b', 10: '#f97316', 15: '#ef4444', 30: '#991b1b' };

// Alertas / Demoras del departamento — copia de TabAlertas de Formularios FSC: FSC activos
// (≠ AC/R) con más de N días desde su solicitud, para saber qué reclamar.
export default function AlertasGestor({ params, anho }) {
    const [diasMin, setDiasMin] = useState(10);
    const [datos, setDatos] = useState([]);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        getGestorAlertas({ ...params, dias_min: diasMin, ...(anho ? { anho } : {}) })
            .then(({ data }) => { if (activo) setDatos(data.results ?? data); })
            .catch(() => { if (activo) setDatos([]); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [params, diasMin, anho]);

    const resumen = useMemo(() => {
        const porBandeja = {};
        datos.forEach((f) => { const b = f.estado || 'Sin estado'; porBandeja[b] = (porBandeja[b] || 0) + 1; });
        return Object.entries(porBandeja).sort((a, b) => b[1] - a[1]);
    }, [datos]);

    const exportarExcel = () => {
        if (!datos.length) return;
        const hoja = XLSX.utils.json_to_sheet(datos.map((f) => ({
            'ID Formulario': `F${f.folio}-${f.anho}`,
            'Folio': f.folio,
            'Año': f.anho,
            'Fecha Solicitud': f.fecha_solicitud,
            'Días en Sistema': f.dias,
            'Bandeja Actual': ESTADO_FSC_INFO[f.estado]?.nombre || f.estado || '—',
            'Destino Actual': f.destino_actual || '—',
            'Unidad Requirente': f.unidad_requirente || '—',
            'Usuario Requirente': f.usuario_requirente || '—',
            'Monto Estimado': f.monto_estimado || 0,
            'Requerimiento': f.requerimiento || '—',
        })));
        hoja['!cols'] = [10, 8, 6, 14, 12, 24, 24, 30, 25, 14, 40].map((wch) => ({ wch }));
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Alertas FSC');
        XLSX.writeFile(libro, `alertas_fsc_mas_de_${diasMin}_dias_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Mostrar FSC con más de:</span>
                {UMBRALES.map((u) => (
                    <FiltroChip key={u} activo={diasMin === u} color={COLORES_UMBRAL[u]} onClick={() => setDiasMin(u)}>
                        {u} días
                    </FiltroChip>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '6px 12px', borderRadius: 20 }}>
                    {fmtN(datos.length)} formulario(s) con alerta
                </span>
                <button
                    onClick={exportarExcel}
                    disabled={!datos.length || cargando}
                    style={{ padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: datos.length ? 'pointer' : 'not-allowed', opacity: datos.length ? 1 : 0.5 }}
                >
                    📥 Exportar Excel
                </button>
            </div>

            {!cargando && resumen.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {resumen.map(([est, cnt]) => {
                        const info = ESTADO_FSC_INFO[est] || { nombre: est, color: '#94a3b8' };
                        return (
                            <span key={est} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${info.color}15`, color: info.color, border: `1px solid ${info.color}40` }}>
                                {est} · {info.nombre} — {cnt}
                            </span>
                        );
                    })}
                </div>
            )}

            <div className="card">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Folio</th>
                                <th style={{ ...thStyle, textAlign: 'center' }}>Días</th>
                                <th style={thStyle}>Bandeja</th>
                                <th style={thStyle}>Destino Actual</th>
                                <th style={thStyle}>Unidad Requirente</th>
                                <th style={thStyle}>Usuario</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Monto</th>
                                <th style={thStyle}>Requerimiento</th>
                                <th style={thStyle}>Fecha Solicitud</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24 }} className="loading-spinner-sm">Cargando alertas…</td></tr>
                            ) : datos.length === 0 ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 13 }}>
                                    No hay formularios con más de {diasMin} días en bandejas activas.
                                </td></tr>
                            ) : datos.map((f, i) => (
                                <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '7px 10px' }}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '2px 7px', borderRadius: 5 }}>#{f.folio}</span>
                                    </td>
                                    <td style={{ padding: '7px 10px', textAlign: 'center' }}><DiasBadge dias={f.dias} /></td>
                                    <td style={{ padding: '7px 10px' }}><EstadoFSCBadge codigo={f.estado} /></td>
                                    <td style={{ padding: '7px 10px', maxWidth: 160 }}>
                                        {f.destino_actual
                                            ? <div className="truncate-text" title={f.destino_actual} style={{ fontSize: 12, color: '#5b21b6' }}>👤 {f.destino_actual}</div>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '7px 10px', maxWidth: 220 }}><div className="truncate-text" title={f.unidad_requirente} style={{ fontSize: 12, color: '#374151' }}>{f.unidad_requirente || '—'}</div></td>
                                    <td style={{ padding: '7px 10px', maxWidth: 150 }}><div className="truncate-text" title={f.usuario_requirente} style={{ fontSize: 12, color: '#374151' }}>{f.usuario_requirente || '—'}</div></td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: '#374151', fontWeight: 500 }}>{fmtCLP(f.monto_estimado)}</td>
                                    <td style={{ padding: '7px 10px', maxWidth: 240 }}><div className="truncate-text" title={f.requerimiento} style={{ fontSize: 11, color: '#374151' }}>{f.requerimiento || '—'}</div></td>
                                    <td style={{ padding: '7px 10px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{f.fecha_solicitud || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
