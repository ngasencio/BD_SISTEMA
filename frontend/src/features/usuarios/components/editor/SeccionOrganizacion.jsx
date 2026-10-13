import { useEffect, useState } from 'react';
import { previsualizarAlcance } from '../../api/usuariosApi';
import { errorDeSeccion, mismosIds } from '../../utils/organizacion';
import SelectorDepartamentos from './SelectorDepartamentos';

const ORIGEN = {
    propio:  { texto: 'Asignado a mano por un administrador', clase: 'ue-origen-propio' },
    panel:   { texto: 'Pertenencia del Panel SSO',            clase: 'ue-origen-panel' },
    ninguno: { texto: 'Sin departamento',                     clase: 'ue-origen-ninguno' },
};

function Resumen({ r }) {
    if (!r) return null;
    return (
        <div className="ue-resumen">
            <div className="ue-resumen-cifras">
                <span><strong>{r.n_departamentos_en_alcance}</strong> departamento(s) en alcance</span>
                <span><strong>{r.n_unidades}</strong> unidad(es) con formularios</span>
                <span><strong>{r.n_formularios}</strong> formularios</span>
            </div>
            {(r.departamentos || []).map(d => (
                <div key={d.id} className="ue-resumen-depto">
                    <strong>{d.nombre}</strong> <small>{d.subdireccion}</small>
                    {d.sub_departamentos?.length ? (
                        <small className="ue-ruta">+ {d.sub_departamentos.join(' · ')}</small>
                    ) : <small className="ue-ruta">sin sub-departamentos</small>}
                </div>
            ))}
        </div>
    );
}

/**
 * Departamento que ve un Gestor de Compras. La asignación hecha acá (capa propia) prevalece
 * sobre la pertenencia del Panel SSO; sin asignación propia vale la del Panel.
 */
export default function SeccionOrganizacion({
    userId, ficha, departamentos, setDepartamentos, arbol, indice, esGestor, errores, onEditarDepartamento,
}) {
    const org = ficha.organizacion;
    const guardados = org.departamentos_propios_ids;
    const cambiado = !mismosIds(guardados, departamentos);

    const [prev, setPrev]         = useState(null);
    const [errorPrev, setErrorPrev] = useState(null);

    // Vista previa de lo que verá con la selección actual (misma regla que el resolver real).
    useEffect(() => {
        if (!cambiado || departamentos.length === 0) {
            setPrev(null);
            setErrorPrev(null);
            return undefined;
        }
        let activo = true;
        const t = setTimeout(() => {
            previsualizarAlcance(userId, departamentos)
                .then(({ data }) => { if (activo) { setPrev(data); setErrorPrev(null); } })
                .catch(err => { if (activo) setErrorPrev(err.response?.data?.errores?.departamentos
                    || err.response?.data?.detail || 'No se pudo calcular la vista previa.'); });
        }, 250);
        return () => { activo = false; clearTimeout(t); };
    }, [userId, departamentos, cambiado]);

    const alternar = (id) => setDepartamentos(
        departamentos.includes(id) ? departamentos.filter(d => d !== id) : [...departamentos, id],
    );
    const origen = ORIGEN[org.origen] || ORIGEN.ninguno;
    const errorGeneral = errorDeSeccion(errores, 'departamentos');

    return (
        <div>
            {!esGestor && (
                <div className="ue-aviso ue-aviso-info">
                    Esta cuenta no tiene el rol <strong>Gestor de Compras</strong>. La asignación se guarda,
                    pero solo surte efecto cuando tenga ese rol.
                </div>
            )}

            <div className="mu-section-label">Lo que usa el sistema hoy</div>
            <div className="ue-vigente">
                <span className={`ue-origen ${origen.clase}`}>{origen.texto}</span>
                {org.alcance ? (
                    <Resumen r={org.alcance} />
                ) : (
                    <div className="ue-aviso ue-aviso-alerta">
                        {org.motivo_sin_alcance || 'No tiene departamento: no vería ningún dato.'}
                    </div>
                )}
            </div>

            <div className="mu-section-label" style={{ marginTop: 20 }}>Departamento según el Panel SSO</div>
            {org.departamentos_panel.length ? (
                <ul className="ue-lista-simple">
                    {org.departamentos_panel.map(d => (
                        <li key={d.id}>
                            <strong>{d.nombre}</strong><small className="ue-ruta">{d.ruta}</small>
                        </li>
                    ))}
                </ul>
            ) : <div className="ue-vacio">El Panel SSO no le asigna departamento.</div>}

            <div className="mu-section-label" style={{ marginTop: 20 }}>
                Asignación propia <span className="mu-hint">(prevalece sobre el Panel)</span>
            </div>
            {errorGeneral && <div className="error-message">{errorGeneral}</div>}

            {departamentos.length > 0 ? (
                <div className="ue-chips">
                    {departamentos.map(id => {
                        const fila = indice.porId.get(id);
                        return (
                            <span key={id} className="ue-chip" title={fila?.ruta}>
                                <span>{fila?.nombre || `#${id}`}</span>
                                <button type="button" className="ue-chip-btn" title="Editar jerarquía de este departamento"
                                    onClick={() => onEditarDepartamento(id)}>✎</button>
                                <button type="button" className="ue-chip-btn" title="Quitar"
                                    onClick={() => alternar(id)}>✕</button>
                            </span>
                        );
                    })}
                </div>
            ) : (
                <div className="ue-vacio">
                    Sin asignación propia: se usa la del Panel SSO.
                </div>
            )}
            {departamentos.length > 0 && (
                <button type="button" className="btn-secondary ue-btn-chico"
                    onClick={() => setDepartamentos([])}>
                    Volver a la del Panel SSO
                </button>
            )}

            {cambiado && (
                <div className="ue-previa">
                    <div className="ue-previa-titulo">
                        {departamentos.length === 0
                            ? 'Al guardar, vuelve a regir la pertenencia del Panel SSO.'
                            : 'Vista previa — esto verá al guardar:'}
                    </div>
                    {errorPrev && <div className="error-message">{String(errorPrev)}</div>}
                    <Resumen r={prev} />
                </div>
            )}

            <div className="mu-section-label" style={{ marginTop: 20 }}>Elegir departamento(s)</div>
            <SelectorDepartamentos
                arbol={arbol} indice={indice} seleccionados={departamentos} onAlternar={alternar}
            />
        </div>
    );
}
