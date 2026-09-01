import { useState, useEffect } from 'react';
import { getImpacto } from '../../api/fscOcPacApi';
import { fmtN, fmtCLP } from '../../utils/format';

function ViaProgress({ label, color, sincronizadas, esperando }) {
    const total = sincronizadas + esperando;
    const pctSync = total ? Math.round(100 * sincronizadas / total) : 0;
    return (
        <div>
            <div className="dv-progress__head">
                <span className="dv-progress__label">{label}</span>
                <span className="dv-progress__value">{fmtN(total)} OC corregidas</span>
            </div>
            <div className="dv-progress__track">
                <div className="dv-progress__bar" style={{ width: `${pctSync}%`, background: color }} />
            </div>
            <div className="dv-progress__note">{fmtN(sincronizadas)} sincronizadas ({pctSync}%) · {fmtN(esperando)} esperando el próximo sync</div>
        </div>
    );
}

export default function ImpactoTab() {
    const [data, setData] = useState(null);

    useEffect(() => { getImpacto().then(({ data }) => setData(data)); }, []);

    if (!data) return <div className="dv-footnote" style={{ padding: 30 }}>Cargando…</div>;

    const { via_licitacion, via_formularios, combinado } = data;

    return (
        <div>
            <div className="dv-hero">
                <div>
                    <div className="dv-hero__value">{fmtN(combinado.oc_unicas_totales)}<em> OC regularizadas</em></div>
                    <div className="dv-hero__caption">Gracias a revisión manual, sumando ambas vías (sin duplicar las que se tocaron por las dos).</div>
                </div>
                <div className="dv-hero__rule" />
                <div>
                    <div className="dv-eyebrow">Contexto institucional</div>
                    <p className="dv-prose" style={{ marginTop: 8 }}>
                        De las {fmtN(combinado.total_oc_sistema)} OC del sistema, {combinado.enlazadas_automatico_pct}% ya muestra <code>EnlacePAC=Enlazada</code> de
                        forma puramente automática (el ETL las matchea solo contra <code>OCPAC_Maestro.csv</code>). Las {fmtN(combinado.oc_unicas_totales)} de acá
                        son las que necesitaron ojo humano para quedar bien enlazadas.
                    </p>
                </div>
            </div>

            <div className="dv-panel">
                <h3 className="dv-panel__title">Impacto por vía</h3>
                <p className="dv-panel__subtitle">Dos caminos conviven hoy en el sistema para enlazar una OC a su PAC a mano: por Licitación (tab "OC Corregibles" en Órdenes de Compra) y por Formularios FSC (este módulo).</p>
                <div className="dv-progress-group">
                    <ViaProgress label="🏛️ Vía Licitación (OC Corregibles)" color="var(--dv-primary)" sincronizadas={via_licitacion.sincronizadas} esperando={via_licitacion.esperando_sync} />
                    <ViaProgress label="📋 Vía Formularios FSC (este módulo)" color="var(--dv-secondary)" sincronizadas={via_formularios.sincronizadas} esperando={via_formularios.esperando_sync} />
                </div>
                {combinado.oc_tocadas_por_ambas_vias > 0 && (
                    <div className="dv-footnote" style={{ marginTop: 14 }}>
                        {fmtN(combinado.oc_tocadas_por_ambas_vias)} OC fueron corregidas por ambas vías a la vez.
                    </div>
                )}
            </div>

            <div className="dv-strip">
                <div className="dv-tile">
                    <div className="dv-tile__label">Vía Licitación</div>
                    <div className="dv-tile__value dv-num">{fmtN(via_licitacion.oc_unicas_corregidas)}</div>
                    <div className="dv-tile__hint">OC únicas con revisión "Enlazada" en OC Corregibles</div>
                </div>
                <div className="dv-tile">
                    <div className="dv-tile__label">Vía Formularios FSC</div>
                    <div className="dv-tile__value dv-num">{fmtN(via_formularios.oc_unicas_corregidas)}</div>
                    <div className="dv-tile__hint">OC enlazadas a mano desde este módulo</div>
                </div>
                <div className="dv-tile">
                    <div className="dv-tile__label">Monto regularizado (Formularios)</div>
                    <div className="dv-tile__value dv-num">{fmtCLP(via_formularios.monto_regularizado)}</div>
                    <div className="dv-tile__hint">Total bruto de las OC corregidas por esta vía</div>
                </div>
            </div>

            <div className="dv-formula">
                <div className="dv-formula__label">Cómo se calcula "sincronizada"</div>
                <b>Sincronizada = el PAC que asignó la corrección manual coincide con lo que hoy muestra `OrdenCompra.EnlacePAC`/`ID_Proyecto`</b> (recalculado
                automáticamente contra <code>OCPAC_Maestro.csv</code> en cada sync de OC). Si coincide, el sistema oficial ya "alcanzó" a la corrección manual;
                si no, la corrección sigue siendo la única razón por la que esa OC muestra el PAC correcto.
            </div>
        </div>
    );
}
