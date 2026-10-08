// Compras Conjuntas: formularios en camino (ASDA → DC) agrupados por ítem presupuestario y categoría,
// para detectar candidatos a una compra única. Un clic en cualquier folio abre su ficha completa.
import { useCallback, useEffect, useState } from 'react';
import '../formularios.css';
import { getFormulariosUnificacion } from '../../../api/formulariosApi';
import { fmtCLP, fmtN } from '../shared';
import FichaFormularioModal from '../FichaFormularioModal';
import GrafoRed from './GrafoRed';
import GrafoBurbujas from './GrafoBurbujas';
import GrafoCascada from './GrafoCascada';
import ProductosVistas from './ProductosVistas';
import { CardsCategoria, SidebarGrupos } from './PanelesGrupos';

const VISTAS = [
    { id: 'red', label: 'Red', hint: 'Vista de fuerzas: arrastra y explora los clusters' },
    { id: 'burbujas', label: 'Burbujas', hint: 'Jerarquía de ítems: clic para profundizar nivel a nivel' },
    { id: 'pipeline', label: 'Cascada', hint: 'Niveles en columnas: selecciona de izquierda a derecha' },
    { id: 'productos', label: 'Productos', hint: 'Agrupación por ítem → categoría → formularios (tres presentaciones)' },
];

export default function TabUnificacion({ anioSeleccionado }) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [grupoResaltado, setGrupo] = useState(null);
    const [vista, setVista] = useState('red');
    const [fichaId, setFichaId] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setGrupo(null);
        setFichaId(null);
        getFormulariosUnificacion(anioSeleccionado ? { anho: anioSeleccionado } : {})
            .then(({ data }) => { if (activo) setDatos(data); })
            .catch(() => { if (activo) setDatos(null); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anioSeleccionado]);

    const abrirFicha = useCallback((nodo) => setFichaId(nodo?.id ?? null), []);

    if (cargando) return <div className="frm-note" style={{ textAlign: 'center' }}>Cargando análisis de unificación…</div>;
    if (!datos) return <div className="frm-note frm-state--error">No fue posible cargar el análisis.</div>;
    if (!datos.nodos?.length) {
        return <div className="frm-note" style={{ textAlign: 'center' }}>No hay formularios en camino (ASDA → DC) para el período seleccionado.</div>;
    }

    const vistaActual = VISTAS.find((v) => v.id === vista);

    return (
        <>
            {fichaId && <FichaFormularioModal origen="solicitud" id={fichaId} onCerrar={() => setFichaId(null)} />}

            <div className="frm-stats">
                <div className="frm-stat"><div className="frm-stat__label">Grupos de unificación</div><div className="frm-stat__value">{fmtN(datos.grupos?.length || 0)}</div><div className="frm-stat__hint">Ítems con dos o más formularios</div></div>
                <div className="frm-stat"><div className="frm-stat__label">Formularios en camino</div><div className="frm-stat__value">{fmtN(datos.total_formularios)}</div><div className="frm-stat__hint">Bandejas ASDA a DC</div></div>
                <div className="frm-stat"><div className="frm-stat__label">Monto total estimado</div><div className="frm-stat__value">{fmtCLP(datos.total_monto)}</div><div className="frm-stat__hint">Suma de los formularios en camino</div></div>
            </div>

            <section className="dv-panel frm-panel">
                <div className="frm-panel__head">
                    <h2 className="frm-panel__title">Compras conjuntas</h2>
                    <span className="frm-panel__note">{vistaActual?.hint}. Clic en un folio para ver su ficha completa.</span>
                </div>
                <div className="frm-panel__body">
                    <div className="frm-segmented" role="tablist" aria-label="Vista">
                        {VISTAS.map((v) => (
                            <button key={v.id} type="button" role="tab" aria-selected={vista === v.id} title={v.hint}
                                    className={vista === v.id ? 'is-active' : ''} onClick={() => setVista(v.id)}>
                                {v.label}
                            </button>
                        ))}
                    </div>

                    {vista === 'red' && (
                        <div className="frm-split">
                            <div className="frm-split__main">
                                <GrafoRed nodos={datos.nodos} grupos={datos.grupos} grupoResaltado={grupoResaltado} onClickNodo={abrirFicha} />
                            </div>
                            <aside className="frm-aside" aria-label="Sugerencias de unificación">
                                <div className="frm-aside__head">Sugerencias<span>({datos.grupos?.length})</span></div>
                                <div className="frm-aside__body">
                                    <SidebarGrupos grupos={datos.grupos} grupoResaltado={grupoResaltado} onSelect={setGrupo} />
                                </div>
                            </aside>
                        </div>
                    )}
                    {vista === 'burbujas' && <GrafoBurbujas grupos={datos.grupos} nodos={datos.nodos} onClickNodo={abrirFicha} />}
                    {vista === 'pipeline' && <GrafoCascada grupos={datos.grupos} nodos={datos.nodos} onClickNodo={abrirFicha} />}
                    {vista === 'productos' && <ProductosVistas gruposProductos={datos.grupos_productos || []} onClickNodo={abrirFicha} />}
                </div>
            </section>

            {vista === 'red' && <CardsCategoria grupos={datos.grupos_categoria} />}
        </>
    );
}
