// Alertas / demoras: formularios activos con más de N días desde su solicitud.
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import './formularios.css';
import { getFormulariosAlertas } from '../../api/formulariosApi';
import { ESTADO_FSC_INFO, fmtCLP, fmtFecha, fmtN } from './shared';
import { DiasChip, EstadoChip, FilaEstado, FiltroChip } from './ui';
import FichaFormularioModal from './FichaFormularioModal';

const UMBRALES = [5, 10, 15, 30];
// Sin rojo de alarma (criterio DV-UI): del ámbar claro al marrón a medida que crece la demora.
const COLORES_UMBRAL = { 5: 'var(--dv-watch)', 10: 'var(--dv-warn)', 15: 'var(--dv-secondary)', 30: 'var(--dv-scale-low)' };

export default function TabAlertas({ anioSeleccionado }) {
    const [diasMin, setDiasMin] = useState(10);
    const [datos, setDatos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(false);
    const [fichaId, setFichaId] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(false);
        const params = { dias_min: diasMin };
        if (anioSeleccionado) params.anho = anioSeleccionado;
        getFormulariosAlertas(params)
            .then(({ data }) => { if (activo) setDatos(data.results ?? data); })
            .catch(() => { if (activo) { setDatos([]); setError(true); } })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [diasMin, anioSeleccionado]);

    const exportarExcel = () => {
        if (!datos.length) return;
        const wb = XLSX.utils.book_new();
        const filas = datos.map((f) => ({
            'ID Formulario': f.id_formulario || `F${f.folio}-${f.anho}`,
            'Folio': f.folio,
            'Año': f.anho,
            'Fecha Solicitud': f.fecha_solicitud,
            'Días en Sistema': f.dias,
            'Bandeja Actual': ESTADO_FSC_INFO[f.estado]?.nombre || f.estado || '—',
            'En bandeja de': f.destino_actual || '—',
            'Unidad Requirente': f.unidad_requirente || '—',
            'Usuario Requirente': f.usuario_requirente || '—',
            'Monto Estimado': f.monto_estimado || 0,
            'Requerimiento': f.requerimiento || '—',
        }));
        const ws = XLSX.utils.json_to_sheet(filas);
        ws['!cols'] = [12, 8, 6, 14, 12, 22, 24, 30, 25, 14, 40].map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'Alertas FSC');
        XLSX.writeFile(wb, `alertas_fsc_>${diasMin}dias_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const resumen = useMemo(() => {
        const porBandeja = {};
        datos.forEach((f) => {
            const b = f.estado || 'Sin estado';
            porBandeja[b] = (porBandeja[b] || 0) + 1;
        });
        return Object.entries(porBandeja).sort((a, b) => b[1] - a[1]);
    }, [datos]);

    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head">
                <h2 className="frm-panel__title">Alertas y demoras</h2>
                <span className="frm-panel__note">Formularios en bandejas activas (sin contar Compradores ni Rechazados) según los días desde su solicitud.</span>
            </div>
            <div className="frm-panel__body">
                {fichaId && <FichaFormularioModal origen="solicitud" id={fichaId} onCerrar={() => setFichaId(null)} />}

                <div className="frm-controls">
                    <span className="frm-controls__label">Mostrar formularios con más de</span>
                    {UMBRALES.map((u) => (
                        <FiltroChip key={u} punto activo={diasMin === u} color={COLORES_UMBRAL[u]} onClick={() => setDiasMin(u)}>
                            {u} días
                        </FiltroChip>
                    ))}
                    <div className="frm-controls__end">
                        <span className="frm-count">{fmtN(datos.length)} formulario(s) con alerta</span>
                        <button type="button" className="dv-btn frm-btn-export" onClick={exportarExcel} disabled={!datos.length || cargando}>
                            Exportar a Excel
                        </button>
                    </div>
                </div>

                {!cargando && resumen.length > 0 && (
                    <div className="frm-chips" style={{ marginBottom: 'var(--dv-sp-4)' }}>
                        {resumen.map(([est, cnt]) => (
                            <span key={est} className="dv-chip frm-chip-neutral" title={ESTADO_FSC_INFO[est]?.nombre || est}>
                                <span className="dv-chip__dot" style={{ color: ESTADO_FSC_INFO[est]?.color || 'var(--dv-none)' }} />
                                {est} · {ESTADO_FSC_INFO[est]?.nombre || est} <b>{cnt}</b>
                            </span>
                        ))}
                    </div>
                )}

                <div className="frm-table-wrap">
                    <table className="dv-table frm-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th className="is-center">Días</th>
                                <th>Bandeja</th>
                                <th>En bandeja de</th>
                                <th>Unidad requirente</th>
                                <th>Usuario</th>
                                <th className="is-num">Monto estimado</th>
                                <th>Requerimiento</th>
                                <th>Solicitud</th>
                                <th className="is-center"><span className="frm-sr">Ficha</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? <FilaEstado colSpan={10}>Cargando alertas…</FilaEstado>
                                : error ? <FilaEstado colSpan={10} error>No fue posible cargar las alertas.</FilaEstado>
                                : datos.length === 0 ? <FilaEstado colSpan={10}>No hay formularios con más de {diasMin} días en bandejas activas.</FilaEstado>
                                : datos.map((f) => (
                                    <tr key={f.id}>
                                        <td className="is-nowrap"><span className="frm-id">{f.id_formulario || `#${f.folio}`}</span></td>
                                        <td className="is-center"><DiasChip dias={f.dias} /></td>
                                        <td><EstadoChip codigo={f.estado} /></td>
                                        <td>{f.destino_actual
                                            ? <div className="frm-trunc frm-trunc--sm" title={f.destino_actual}>{f.destino_actual}</div>
                                            : <span className="frm-muted">—</span>}</td>
                                        <td><div className="frm-trunc" title={f.unidad_requirente}>{f.unidad_requirente || '—'}</div></td>
                                        <td><div className="frm-trunc frm-trunc--sm" title={f.usuario_requirente}>{f.usuario_requirente || '—'}</div></td>
                                        <td className="is-num is-strong is-nowrap">{fmtCLP(f.monto_estimado)}</td>
                                        <td><div className="frm-clamp" title={f.requerimiento}>{f.requerimiento || '—'}</div></td>
                                        <td className="is-nowrap">{fmtFecha(f.fecha_solicitud)}</td>
                                        <td className="is-center">
                                            <button type="button" className="dv-btn frm-btn-ver" onClick={() => setFichaId(f.id)}
                                                    title="Ver la ficha completa del formulario">Ver</button>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
