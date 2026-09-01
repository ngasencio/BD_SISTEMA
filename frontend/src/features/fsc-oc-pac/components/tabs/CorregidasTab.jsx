import { useState, useEffect, useCallback } from 'react';
import { getCorregidas } from '../../api/fscOcPacApi';
import { fmtN, fmtCLP } from '../../utils/format';
import Chip from '../Chip';

export default function CorregidasTab() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const cargar = useCallback(() => {
        setLoading(true);
        getCorregidas().then(({ data }) => setData(data)).finally(() => setLoading(false));
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    if (loading && !data) return <div className="dv-footnote" style={{ padding: 30 }}>Cargando…</div>;
    if (!data) return null;

    const { kpis, filas } = data;

    return (
        <div>
            <div className="dv-strip">
                <div className="dv-mini is-active">
                    <div className="dv-mini__name">Total corregidas</div>
                    <div className="dv-mini__value dv-num">{fmtN(kpis.total_corregidas)}</div>
                    <div className="dv-mini__figures">vía Formularios FSC</div>
                </div>
                <div className="dv-mini">
                    <div className="dv-mini__name">Sincronizadas</div>
                    <div className="dv-mini__value dv-num" style={{ color: 'var(--dv-ok)' }}>{fmtN(kpis.sincronizadas)}</div>
                    <div className="dv-mini__figures">El OCPAC_Maestro.csv ya lo reflejó solo</div>
                </div>
                <div className="dv-mini">
                    <div className="dv-mini__name">Esperando sync</div>
                    <div className="dv-mini__value dv-num" style={{ color: 'var(--dv-warn)' }}>{fmtN(kpis.esperando_sync)}</div>
                    <div className="dv-mini__figures">Depende de esta corrección todavía</div>
                </div>
                <div className="dv-mini">
                    <div className="dv-mini__name">Monto regularizado</div>
                    <div className="dv-mini__value dv-num">{fmtCLP(kpis.monto_regularizado)}</div>
                    <div className="dv-mini__figures">Total bruto de las OC corregidas</div>
                </div>
            </div>

            <div className="dv-callout">
                🔧 Corregidas manualmente: <b>{fmtN(kpis.total_corregidas)}</b> OC fueron enlazadas a mano a su PAC desde este módulo (vía el FSC que las originó).
                De ellas, <b>{fmtN(kpis.sincronizadas)}</b> ya quedaron confirmadas porque <code>OCPAC_Maestro.csv</code> también las trae, y <b>{fmtN(kpis.esperando_sync)}</b> aún
                dependen de esta corrección — si Abastecimiento actualiza el maestro con el mismo proyecto, el próximo sync de OC las confirmará también por su cuenta.
            </div>

            <div className="dv-panel">
                <h3 className="dv-panel__title">Registro de correcciones</h3>
                <p className="dv-panel__subtitle">Cada fila es una acción "Enlazar OC al PAC del FSC" o una corrección manual desde el tab Revisión Pendientes.</p>
                {filas.length === 0 ? (
                    <p className="dv-footnote">Todavía no se ha corregido ninguna OC por esta vía.</p>
                ) : (
                    <div className="dv-table-scroll">
                        <table className="dv-table">
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>OC</th>
                                    <th style={{ textAlign: 'left' }}>FSC origen</th>
                                    <th style={{ textAlign: 'left' }}>PAC asignado</th>
                                    <th>Estado</th>
                                    <th style={{ textAlign: 'left' }}>Por</th>
                                    <th style={{ textAlign: 'left' }}>Fecha</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.map((f) => (
                                    <tr key={f.codigo_oc}>
                                        <td style={{ textAlign: 'left' }}>
                                            <div style={{ fontWeight: 600 }}>{f.codigo_oc}</div>
                                            <div className="dv-footnote" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{f.nombre_oc}</div>
                                        </td>
                                        <td style={{ textAlign: 'left' }}>{f.id_formulario_origen || '—'}</td>
                                        <td style={{ textAlign: 'left' }}>
                                            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{f.id_proyecto_correcto}</div>
                                            <div className="dv-footnote">{f.nombre_proyecto}</div>
                                        </td>
                                        <td>
                                            {f.sincronizada
                                                ? <Chip variant="ok">Sincronizada</Chip>
                                                : <Chip variant="warn">Esperando sync</Chip>}
                                        </td>
                                        <td style={{ textAlign: 'left' }}>{f.creado_por || '—'}</td>
                                        <td style={{ textAlign: 'left' }}>{f.creado_en ? new Date(f.creado_en).toLocaleDateString('es-CL') : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
