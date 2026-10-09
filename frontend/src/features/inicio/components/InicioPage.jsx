// Inicio (Home): «¿Cómo vamos en el año?» — tablero ejecutivo con las cifras clave de compras, PAC,
// formularios y deuda. Cada rol recibe solo los bloques de los módulos que puede abrir (decide el servidor).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImg from '../../../assets/logo.jpg';
import { useAuth } from '../../../store/authStore';
import '../styles/inicio.css';
import { useInicioResumen } from '../hooks/useInicioResumen';
import { armarFilas, fmtFechaCorta, fmtFechaLarga, rutaFormularios } from '../utils/formato';
import Indicadores from './Indicadores';
import { PanelDeuda, PanelFormularios, PanelMensual, PanelModalidades } from './Paneles';

export default function InicioPage() {
    const navigate = useNavigate();
    const { role } = useAuth();
    const [anioElegido, setAnioElegido] = useState(null);
    const { datos, cargando, error, reintentar } = useInicioResumen(anioElegido);

    const anio = datos?.anio ?? new Date().getFullYear();
    const enCurso = datos?.oc.mes_en_curso != null;

    const paneles = datos && {
        mensual: <PanelMensual oc={datos.oc} anio={anio} onIr={navigate} />,
        formularios: datos.formularios && <PanelFormularios formularios={datos.formularios} anio={anio} ruta={rutaFormularios(role)} onIr={navigate} />,
        deuda: datos.deuda && <PanelDeuda deuda={datos.deuda} ruta="/anexo3/reporte-sigfe" onIr={navigate} />,
        modalidades: <PanelModalidades oc={datos.oc} anio={anio} onIr={navigate} />,
    };

    return (
        <div className={`feature-page ini-page${cargando && datos ? ' is-cargando' : ''}`}>
            <header className="ini-header">
                <div className="ini-brand">
                    <div className="ini-logo"><img src={logoImg} alt="Servicio de Salud Osorno" /></div>
                    <div>
                        <div className="dv-eyebrow">Sistema de Gestión Interno</div>
                        <h1 className="ini-title">¿Cómo vamos en {anio}?</h1>
                        <div className="ini-sub">
                            Servicio de Salud Osorno · Organismo 7296
                            {datos && (enCurso ? ` · datos al ${fmtFechaLarga(datos.oc.corte)}` : ` · año ${anio} completo`)}
                        </div>
                    </div>
                </div>
                <div className="ini-controls">
                    {datos?.anios_disponibles.length > 1 && (
                        <label className="ini-field">
                            Año
                            <select className="dv-select" value={anio} onChange={(e) => setAnioElegido(Number(e.target.value))} aria-label="Año del tablero">
                                {[...datos.anios_disponibles].reverse().map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </label>
                    )}
                    <button type="button" className="dv-btn" onClick={() => navigate('/mapa-sistema')} title="Ver cómo está conectado el sistema">Mapa del sistema</button>
                </div>
            </header>

            {error && !datos && (
                <div className="ini-estado">
                    <div>{error}</div>
                    <button type="button" className="dv-btn dv-btn--primary" onClick={reintentar}>Reintentar</button>
                </div>
            )}
            {cargando && !datos && <div className="ini-estado">Calculando los indicadores del año…</div>}

            {datos && (
                <div className="ini-body">
                    <Indicadores datos={datos} onIr={navigate} />

                    {armarFilas({ formularios: Boolean(datos.formularios), deuda: Boolean(datos.deuda) }).map((fila) => (
                        <div className="ini-grid" key={fila.map((p) => p.panel).join('-')}>
                            {fila.map(({ panel, cols }) => <div key={panel} className={`ini-col-${cols}`}>{paneles[panel]}</div>)}
                        </div>
                    ))}

                    <footer className="ini-footer">
                        <span>
                            Las cifras de compras excluyen órdenes canceladas y se cuentan por fecha de envío.
                            {enCurso && ` Se compara contra el mismo corte de ${anio - 1}.`}
                        </span>
                        <span>
                            <b>Datos:</b> órdenes de compra hasta el {fmtFechaCorta(datos.oc.ultima_oc)}
                            {datos.formularios && <> · formularios {fmtFechaCorta(datos.formularios.actualizado)}</>}
                            {datos.deuda && <> · SIGFE {fmtFechaCorta(datos.deuda.actualizado)}</>}
                        </span>
                    </footer>
                </div>
            )}
        </div>
    );
}
