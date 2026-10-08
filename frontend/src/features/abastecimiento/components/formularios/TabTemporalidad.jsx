// Temporalidad: cumplimiento del Plan Anual de Compras (Dentro/Fuera del PAC) sobre los formularios
// derivados a comprador (estado AC). Reutiliza el backend de Cumplimiento Interno PAC (mismo alcance
// institucional: Dirección SS Osorno) para no duplicar la resolución de la jerarquía.
import { useEffect, useMemo, useState } from 'react';
import './formularios.css';
import { getTemporalidadComparativo, getTemporalidadJerarquia, getTemporalidadUsuarios } from '../../api/formulariosApi';
import { fmtN } from './shared';
import { FiltroChip, InfoTooltip } from './ui';
import { resumenDeAlcance } from './temporalidad/logica';
import { ComparativoAnual, IndicadorPac, NotaChip } from './temporalidad/Graficos';
import { JerarquiaTabla, RankingUsuarios } from './temporalidad/JerarquiaRanking';
import TablaFormulariosDrillDown from './temporalidad/TablaFormulariosDrillDown';

export default function TabTemporalidad() {
    const [comparativo, setComparativo] = useState(null);
    const [aniosSel, setAniosSel] = useState([]);
    const [anhoScope, setAnhoScope] = useState(''); // '' = todos los años
    const [jerarquia, setJerarquia] = useState(null);
    const [usuarios, setUsuarios] = useState(null);
    const [filtroOrg, setFiltroOrg] = useState(null); // { clave, label, ids, sinClasificar } | null
    const [cargandoJerarquia, setCargandoJerarquia] = useState(true);
    const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
    const [error, setError] = useState(null);

    // Serie completa: una sola vez, el frontend decide qué años mostrar.
    useEffect(() => {
        let activo = true;
        getTemporalidadComparativo()
            .then(({ data }) => {
                if (!activo) return;
                setComparativo(data);
                setAniosSel(data.anhos_disponibles);
            })
            .catch(() => { if (activo) setError('No se pudo cargar el comparativo anual.'); });
        return () => { activo = false; };
    }, []);

    // La jerarquía depende solo del año: seleccionar un nodo no debe reconstruir el árbol.
    useEffect(() => {
        let activo = true;
        setCargandoJerarquia(true);
        getTemporalidadJerarquia(anhoScope ? Number(anhoScope) : undefined)
            .then(({ data }) => { if (activo) setJerarquia(data); })
            .catch(() => { if (activo) setError('No se pudo cargar la jerarquía.'); })
            .finally(() => { if (activo) setCargandoJerarquia(false); });
        return () => { activo = false; };
    }, [anhoScope]);

    // El ranking depende del año y de la unidad elegida en la jerarquía («Analizar»).
    useEffect(() => {
        let activo = true;
        setCargandoUsuarios(true);
        getTemporalidadUsuarios(anhoScope ? Number(anhoScope) : undefined, 100, filtroOrg)
            .then(({ data }) => { if (activo) setUsuarios(data); })
            .catch(() => { if (activo) setError('No se pudo cargar el ranking de usuarios.'); })
            .finally(() => { if (activo) setCargandoUsuarios(false); });
        return () => { activo = false; };
    }, [anhoScope, filtroOrg]);

    // Clic en el mismo nodo ya seleccionado lo deselecciona.
    const seleccionarOrg = (nuevo) => setFiltroOrg((prev) => (prev?.clave === nuevo.clave ? null : nuevo));
    const resumen = useMemo(() => (comparativo ? resumenDeAlcance(comparativo.serie_anual, anhoScope) : null), [comparativo, anhoScope]);
    const alternarAnio = (anho) => setAniosSel((prev) => (prev.includes(anho) ? prev.filter((a) => a !== anho) : [...prev, anho].sort()));

    if (error) return <div className="frm-note frm-state--error">{error}</div>;
    if (!comparativo) return <div className="frm-note" style={{ textAlign: 'center' }}>Cargando temporalidad…</div>;

    return (
        <>
            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Cumplimiento del Plan Anual de Compras</h2>
                    <span className="frm-panel__note">
                        Sobre formularios derivados a comprador (estado AC), con el mismo alcance institucional que Cumplimiento Interno PAC (Dirección SS Osorno).
                    </span>
                </div>
                <div className="frm-panel__body">
                    <label className="frm-field-inline">
                        <span>Año de análisis<InfoTooltip text="Acota la nota, la jerarquía y el ranking. El comparativo anual de más abajo siempre muestra los años que elijas." /></span>
                        <select className="dv-select" value={anhoScope} onChange={(e) => setAnhoScope(e.target.value)}>
                            <option value="">Todos los años</option>
                            {comparativo.anhos_disponibles.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            {resumen && (
                <div className="frm-indicator">
                    <IndicadorPac resumen={resumen} />
                    <section className="dv-panel frm-panel">
                        <div className="frm-panel__body frm-nota-card">
                            <div className="dv-eyebrow">Nota de cumplimiento</div>
                            <NotaChip nota={resumen.nota} grande />
                            <div className="dv-footnote">Escala 1.0 a 7.0</div>
                        </div>
                    </section>
                </div>
            )}

            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Comparativo anual</h2>
                    <span className="frm-panel__note">Años a graficar:</span>
                    <div className="frm-pills" style={{ margin: 0 }}>
                        {comparativo.anhos_disponibles.map((a) => (
                            <FiltroChip key={a} activo={aniosSel.includes(a)} onClick={() => alternarAnio(a)}>{a}</FiltroChip>
                        ))}
                    </div>
                </div>
                <div className="frm-panel__body"><ComparativoAnual serieAnual={comparativo.serie_anual} aniosSel={aniosSel} /></div>
            </section>

            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Jerarquía institucional</h2>
                    <span className="frm-panel__note">
                        Subdirección → Departamento → Sub-departamento. Usa «Analizar» en una fila para filtrar el ranking y los formularios de abajo.
                        {cargandoJerarquia && ' Actualizando…'}
                    </span>
                </div>
                <div className="frm-panel__body">
                    {jerarquia && <JerarquiaTabla jerarquia={jerarquia} onSeleccionar={seleccionarOrg} claveSeleccionada={filtroOrg?.clave} />}
                </div>
            </section>

            {filtroOrg && (
                <div className="frm-filterchip">
                    Filtrando por: {filtroOrg.label}
                    <button type="button" onClick={() => setFiltroOrg(null)}>Quitar filtro</button>
                </div>
            )}

            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Desempeño por usuario requirente</h2>
                    <span className="frm-panel__note">
                        {cargandoUsuarios && 'Actualizando… '}
                        {!cargandoUsuarios && usuarios?.nota_promedio != null &&
                            `Nota promedio ${usuarios.nota_promedio.toFixed(1)} sobre ${fmtN(usuarios.total_elegibles)} usuarios evaluados de ${fmtN(usuarios.total_usuarios)}.`}
                    </span>
                </div>
                <div className="frm-panel__body">{usuarios && <RankingUsuarios usuarios={usuarios} />}</div>
            </section>

            <TablaFormulariosDrillDown filtroOrg={filtroOrg} anhoScope={anhoScope} />
        </>
    );
}
