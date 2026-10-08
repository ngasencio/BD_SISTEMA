// Historial de compras: qué se ha pedido, cuántas veces y cuándo, con el carro de cada FSC (excluye R y P).
import { useEffect, useMemo, useState } from 'react';
import './formularios.css';
import { getFormulariosHistorial } from '../../api/formulariosApi';
import { ESTADO_FSC_INFO, fmtN } from './shared';
import { FiltroChip } from './ui';
import { SubTabCronologico, SubTabPivote, SubTabRepeticiones } from './HistorialVistas';
import FichaFormularioModal from './FichaFormularioModal';

const SUBTABS = [
    { id: 'repeticiones', label: 'Repeticiones', desc: 'Productos pedidos más de una vez' },
    { id: 'pivote', label: 'Distribución anual', desc: 'Ítem / categoría por mes (mapa de calor)' },
    { id: 'cronologico', label: 'Por solicitud', desc: 'Cada FSC con su carro de productos' },
];

const ESTADOS = ['FR', 'FA', 'ASDA', 'ADIR', 'AA', 'DC', 'AC'];

export default function TabHistorial({ anioSeleccionado }) {
    const [subtab, setSubtab] = useState('repeticiones');
    const [datos, setDatos] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [filtroUnidad, setFiltroUnidad] = useState('');
    const [filtroUsuario, setFiltroUsuario] = useState('');
    const [filtroEstados, setFiltroEstados] = useState([]);
    const [fichaId, setFichaId] = useState(null);

    useEffect(() => {
        let activo = true;
        setCargando(true);
        setError(null);
        const params = {};
        if (anioSeleccionado) params.anho = anioSeleccionado;
        getFormulariosHistorial(params)
            .then(({ data }) => { if (activo) setDatos(Array.isArray(data) ? data : (data.results ?? [])); })
            .catch(() => { if (activo) setError('No se pudieron cargar los datos del historial.'); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [anioSeleccionado]);

    // Al cambiar de unidad, el usuario elegido deja de ser válido.
    useEffect(() => { setFiltroUsuario(''); }, [filtroUnidad]);

    const unidades = useMemo(() => [...new Set(datos.map((f) => f.unidad_requirente).filter(Boolean))].sort(), [datos]);
    const usuarios = useMemo(() => {
        const base = filtroUnidad ? datos.filter((f) => f.unidad_requirente === filtroUnidad) : datos;
        return [...new Set(base.map((f) => f.usuario_requirente).filter(Boolean))].sort();
    }, [datos, filtroUnidad]);

    const datosFiltrados = useMemo(() => datos.filter((f) => {
        if (filtroUnidad && f.unidad_requirente !== filtroUnidad) return false;
        if (filtroUsuario && f.usuario_requirente !== filtroUsuario) return false;
        if (filtroEstados.length > 0 && !filtroEstados.includes(f.estado)) return false;
        return true;
    }), [datos, filtroUnidad, filtroUsuario, filtroEstados]);

    const totalProductos = useMemo(() => datosFiltrados.reduce((s, f) => s + f.productos.length, 0), [datosFiltrados]);
    const hayFiltros = Boolean(filtroUnidad || filtroUsuario || filtroEstados.length);
    const limpiar = () => { setFiltroUnidad(''); setFiltroUsuario(''); setFiltroEstados([]); };

    return (
        <section className="dv-panel frm-panel">
            <div className="frm-panel__head">
                <h2 className="frm-panel__title">Historial de compras</h2>
                <span className="frm-panel__note">Formularios con su carro de productos, sin contar Pendientes de firma ni Rechazados.</span>
            </div>
            <div className="frm-panel__body">
                {fichaId && <FichaFormularioModal origen="solicitud" id={fichaId} onCerrar={() => setFichaId(null)} />}

                <div className="frm-filterpanel">
                    <span className="dv-eyebrow">Filtrar por</span>
                    <select className="dv-select" value={filtroUnidad} onChange={(e) => setFiltroUnidad(e.target.value)} aria-label="Unidad requirente">
                        <option value="">Todas las unidades</option>
                        {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <select className="dv-select" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} aria-label="Usuario requirente"
                            disabled={!filtroUnidad && usuarios.length > 50}>
                        <option value="">Todos los usuarios</option>
                        {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {hayFiltros && <button type="button" className="dv-btn" onClick={limpiar}>Limpiar filtros</button>}
                    <span className="frm-count" style={{ marginLeft: 'auto' }}>{fmtN(datosFiltrados.length)} solicitudes · {fmtN(totalProductos)} productos</span>
                </div>

                <div className="frm-pills">
                    <span className="frm-pills__label">Bandeja</span>
                    {ESTADOS.map((est) => {
                        const info = ESTADO_FSC_INFO[est];
                        return (
                            <FiltroChip key={est} punto activo={filtroEstados.includes(est)} color={info.color}
                                        onClick={() => setFiltroEstados((prev) => (prev.includes(est) ? prev.filter((e) => e !== est) : [...prev, est]))}>
                                {est} · {info.nombre}
                            </FiltroChip>
                        );
                    })}
                </div>

                <div className="frm-segmented" role="tablist" aria-label="Vistas del historial">
                    {SUBTABS.map((s) => (
                        <button key={s.id} type="button" role="tab" aria-selected={subtab === s.id} title={s.desc}
                                className={subtab === s.id ? 'is-active' : ''} onClick={() => setSubtab(s.id)}>
                            {s.label}
                        </button>
                    ))}
                </div>

                {cargando && <div className="frm-note" style={{ textAlign: 'center' }}>Cargando historial…</div>}
                {error && <div className="frm-note frm-state--error">{error}</div>}

                {!cargando && !error && subtab === 'repeticiones' && <SubTabRepeticiones datos={datosFiltrados} onVerFSC={setFichaId} />}
                {!cargando && !error && subtab === 'pivote' && <SubTabPivote datos={datosFiltrados} onVerFSC={setFichaId} />}
                {!cargando && !error && subtab === 'cronologico' && <SubTabCronologico datos={datosFiltrados} onVerFSC={setFichaId} />}
            </div>
        </section>
    );
}
