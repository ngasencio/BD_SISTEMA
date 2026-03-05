import React from 'react';
import { TODAY, fmt, BadgeEstado } from '../utils';

const HITOS = [
    { campo: 'FechaCreacion', icon: '🆕', label: 'Creada' },
    { campo: 'FechaInicio', icon: '🚀', label: 'Inicio' },
    { campo: 'FechaPublicacion', icon: '📢', label: 'Publicada' },
    { campo: 'FechaFinal', icon: '📋', label: 'Fin Bases' },
    { campo: 'FechaPubRespuestas', icon: '💬', label: 'Respuestas' },
    { campo: 'FechaSoporteFisico', icon: '📎', label: 'Soporte Fís.' },
    { campo: 'FechaVisitaTerreno', icon: '👷', label: 'Visita Terreno' },
    { campo: 'FechaEntregaAntecedentes', icon: '📂', label: 'Antecedentes' },
    { campo: 'FechaCierre', icon: '⏳', label: 'Cierre Ofertas' },
    { campo: 'FechaActoAperturaTecnica', icon: '🛠️', label: 'Apert. Técn.' },
    { campo: 'FechaActoAperturaEconomica', icon: '💰', label: 'Apert. Econ.' },
    { campo: 'FechaTiempoEvaluacion', icon: '🧮', label: 'Evaluación' },
    { campo: 'FechaEstimadaAdjudicacion', icon: '📅', label: 'Adj. Estimada' },
    { campo: 'FechaAdjudicacion', icon: '🏆', label: 'Adjudicación' },
    { campo: 'FechaEstimadaFirma', icon: '✍️', label: 'Firma Pend.' },
    { campo: 'FechaInicioContrato', icon: '🚀', label: 'Inicio Contrato' },
];

export default function TimelineSect({ licitaciones }) {
    return (
        <div className="tab-view active" id="tab-timeline">
            <div className="alert alert-info">
                <span className="alert-icon">ℹ️</span>
                <div>
                    Las etapas <strong style={{ color: 'var(--gob-verde)' }}>con borde verde</strong> ya ocurrieron ·
                    Las etapas con <strong style={{ color: 'var(--gob-azul)' }}>borde azul pulsante</strong> son las más próximas al día de hoy ·
                    Las etapas en gris están pendientes o no aplican a esta licitación.
                </div>
            </div>
            <div className="card">
                <div className="card-header card-header-accent">
                    <span style={{ fontSize: '16px' }}>📅</span>
                    <span className="card-title">Línea de Tiempo por Hitos del Proceso</span>
                    <span className="card-subtitle">Ciclo de vida completo — 16 etapas definidas</span>
                </div>
                <div className="card-body" id="timeline-container">
                    {licitaciones.map(l => (
                        <div className="tl-licit" key={l.CodigoLicitacion}>
                            <div className="tl-licit-name">
                                <span className="tag tag-azul" style={{ fontFamily: '"Roboto Mono",monospace' }}>{l.CodigoLicitacion}</span>
                                <span style={{ marginLeft: '10px' }}>{l.Nombre}</span>
                                <span style={{ marginLeft: '10px' }}><BadgeEstado estado={l.Estado} /></span>
                            </div>
                            <div className="tl-scroll">
                                <div className="tl-steps">
                                    {HITOS.map(h => {
                                        const val = l[h.campo];
                                        if (!val) {
                                            return (
                                                <div className="tl-step" key={h.campo}>
                                                    <div className="tl-dot empty">{h.icon}</div>
                                                    <div className="tl-label">{h.label}</div>
                                                    <div className="tl-date">N/A</div>
                                                </div>
                                            );
                                        }
                                        const d = new Date(val);
                                        const isPast = d < TODAY;
                                        const isClose = Math.abs(d - TODAY) < 86400000 * 4;
                                        const cls = isClose ? 'current' : isPast ? 'past' : 'future';

                                        return (
                                            <div className="tl-step" key={h.campo}>
                                                <div className={`tl-dot ${cls}`}>{h.icon}</div>
                                                <div className="tl-label">{h.label}</div>
                                                <div className="tl-date">{fmt(val)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
