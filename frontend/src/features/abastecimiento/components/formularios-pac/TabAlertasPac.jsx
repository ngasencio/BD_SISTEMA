// Alertas / demoras: fichas PAC aún en trámite (P, FR, FA, AA) con más de N días desde su fecha.
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import '../formularios/formularios.css';
import './formularios-pac.css';
import { getFormulariosPacAlertas } from '../../api/formulariosPacApi';
import { fmtCLP, fmtFecha, fmtN } from '../formularios/shared';
import { DiasChip, FilaEstado, FiltroChip } from '../formularios/ui';
import { AccionPacChip, EstadoPacChip } from './uiPac';
import { infoEstadoPac, tituloFichaPac } from './sharedPac';
import FichaPacModal from './FichaPacModal';

// Las fichas pueden llevar meses detenidas: los umbrales llegan más lejos que en FSC.
const UMBRALES = [10, 30, 90, 180];
// Sin rojo de alarma (criterio DV-UI): del ámbar claro al marrón a medida que crece la demora.
const COLORES_UMBRAL = { 10: 'var(--dv-watch)', 30: 'var(--dv-warn)', 90: 'var(--dv-secondary)', 180: 'var(--dv-scale-low)' };

export default function TabAlertasPac({ filtros }) {
    const [diasMin, setDiasMin] = useState(30);
    const [datos, setDatos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(false);
    const [fichaId, setFichaId] = useState(null);
    const clave = JSON.stringify(filtros || {});

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(false);
        getFormulariosPacAlertas({ ...(filtros || {}), dias_min: diasMin })
            .then(({ data }) => { if (activo) setDatos(data.results ?? data); })
            .catch(() => { if (activo) { setDatos([]); setError(true); } })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diasMin, clave]);

    const resumen = useMemo(() => {
        const porBandeja = {};
        datos.forEach((f) => { porBandeja[f.estado || 'Sin estado'] = (porBandeja[f.estado || 'Sin estado'] || 0) + 1; });
        return Object.entries(porBandeja).sort((a, b) => b[1] - a[1]);
    }, [datos]);

    const exportarExcel = () => {
        if (!datos.length) return;
        const wb = XLSX.utils.book_new();
        const filas = datos.map((f) => ({
            'ID Ficha': f.id_ficha,
            'Fecha': f.fecha_ficha,
            'Días en trámite': f.dias,
            'Bandeja': infoEstadoPac(f.estado).nombre,
            'Acción': f.accion_proyecto || '—',
            'Departamento': f.departamento || '—',
            'Proyecto': tituloFichaPac(f) || '—',
            'Proyecto del plan': f.identificador_proyecto || '—',
            'Monto': f.monto ?? 0,
            'Responsable': f.nombre_responsable || '—',
            'Solicitante': f.solicitante || '—',
        }));
        const ws = XLSX.utils.json_to_sheet(filas);
        ws['!cols'] = [14, 12, 14, 24, 12, 36, 48, 20, 14, 26, 26].map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'Alertas PAC');
        XLSX.writeFile(wb, `alertas_pac_${diasMin}dias_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head">
                <h2 className="frm-panel__title">Alertas y demoras</h2>
                <span className="frm-panel__note">Fichas que siguen en una bandeja de trámite (P, FR, FA o AA) según los días desde su fecha. Las aprobadas (DC) y rechazadas (R) no generan alerta.</span>
            </div>
            <div className="frm-panel__body">
                {fichaId && <FichaPacModal id={fichaId} onCerrar={() => setFichaId(null)} />}

                <div className="frm-controls">
                    <span className="frm-controls__label">Mostrar fichas con más de</span>
                    {UMBRALES.map((u) => (
                        <FiltroChip key={u} punto activo={diasMin === u} color={COLORES_UMBRAL[u]} onClick={() => setDiasMin(u)}>
                            {u} días
                        </FiltroChip>
                    ))}
                    <div className="frm-controls__end">
                        <span className="frm-count">{fmtN(datos.length)} ficha(s) con alerta</span>
                        <button type="button" className="dv-btn frm-btn-export" onClick={exportarExcel} disabled={!datos.length || cargando}>
                            Exportar a Excel
                        </button>
                    </div>
                </div>

                {!cargando && resumen.length > 0 && (
                    <div className="frm-chips" style={{ marginBottom: 'var(--dv-sp-4)' }}>
                        {resumen.map(([est, cnt]) => (
                            <span key={est} className="dv-chip frm-chip-neutral" title={infoEstadoPac(est).nombre}>
                                <span className="dv-chip__dot" style={{ color: infoEstadoPac(est).color }} />
                                {est} · {infoEstadoPac(est).nombre} <b>{cnt}</b>
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
                                <th>Acción</th>
                                <th>Departamento</th>
                                <th>Proyecto</th>
                                <th className="is-num">Monto</th>
                                <th>Responsable</th>
                                <th>Fecha</th>
                                <th className="is-center"><span className="frm-sr">Ficha</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? <FilaEstado colSpan={10}>Cargando alertas…</FilaEstado>
                                : error ? <FilaEstado colSpan={10} error>No fue posible cargar las alertas.</FilaEstado>
                                : datos.length === 0 ? <FilaEstado colSpan={10}>No hay fichas con más de {diasMin} días en bandejas de trámite.</FilaEstado>
                                : datos.map((f) => (
                                    <tr key={f.id}>
                                        <td className="is-nowrap"><span className="frm-id">{f.id_ficha}</span></td>
                                        <td className="is-center"><DiasChip dias={f.dias} /></td>
                                        <td><EstadoPacChip codigo={f.estado} /></td>
                                        <td><AccionPacChip accion={f.accion_proyecto} /></td>
                                        <td><div className="frm-trunc" title={f.departamento}>{f.departamento || '—'}</div></td>
                                        <td><div className="frm-trunc" title={tituloFichaPac(f)}>{tituloFichaPac(f) || '—'}</div></td>
                                        <td className="is-num is-strong is-nowrap">{f.monto != null ? fmtCLP(f.monto) : '—'}</td>
                                        <td><div className="frm-trunc frm-trunc--sm" title={f.nombre_responsable}>{f.nombre_responsable || '—'}</div></td>
                                        <td className="is-nowrap">{fmtFecha(f.fecha_ficha)}</td>
                                        <td className="is-center">
                                            <button type="button" className="dv-btn frm-btn-ver" onClick={() => setFichaId(f.id)}
                                                    title="Ver la ficha completa">Ver</button>
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
