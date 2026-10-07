import React, { useState } from 'react';

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ORIGEN = {
    AUTO: { icono: '', titulo: 'Jefatura del departamento (según su cargo)' },
    REGLA: { icono: '📌 ', titulo: 'Agregada de forma permanente a este departamento' },
    PUNTUAL: { icono: '✏️ ', titulo: 'Agregada solo para este envío' },
};

// Copias (CC) de UN correo: quitar o agregar personas. Cada cambio se elige entre
//   · "solo este envío"             → se manda con el envío y no se recuerda
//   · "siempre en este departamento" → queda guardado para todos los envíos futuros del departamento
// Las personas quitadas se listan aparte para poder restaurarlas.
export default function EditorCopias({ fila, copiasActivas, ocupado, onQuitar, onAgregar, onRestaurar }) {
    const [quitando, setQuitando] = useState(null);   // item de copia en confirmación
    const [agregando, setAgregando] = useState(false);
    const [nuevo, setNuevo] = useState('');
    const correoValido = RE_CORREO.test(nuevo.trim());
    const depto = fila.departamento || 'este departamento';
    const sinDepto = !fila.depto_ref_id;

    const cerrarAgregar = () => { setAgregando(false); setNuevo(''); };

    return (
        <div className="gc-notif-cc">
            {!copiasActivas && (
                <div className="gc-notif-sub" title="NOTIF_PLAN_CC_JEFATURAS está apagado en el servidor">
                    ⚠️ Las copias están desactivadas en el servidor: ningún correo llevará CC.
                </div>
            )}

            <div className="gc-notif-cc-lista">
                {fila.copias.length === 0 && <span className="gc-notif-sub">sin copias</span>}
                {fila.copias.map((c) => (
                    <span key={c.correo} className="gc-notif-cc-chip" title={`${ORIGEN[c.origen]?.titulo}\n${c.correo}${c.cargo ? `\n${c.cargo}` : ''}`}>
                        {ORIGEN[c.origen]?.icono}{c.nombre}
                        <button
                            className="gc-notif-cc-x" disabled={ocupado} aria-label={`Quitar a ${c.nombre}`}
                            onClick={() => { setQuitando(c); setAgregando(false); }}
                        >✕</button>
                    </span>
                ))}
                <button
                    className="gc-notif-link" disabled={ocupado}
                    onClick={() => { setAgregando(true); setQuitando(null); }}
                >＋ Agregar</button>
            </div>

            {quitando && (
                <div className="gc-notif-cc-panel">
                    <div>¿Quitar a <strong>{quitando.nombre}</strong> de las copias?</div>
                    <div className="gc-notif-cc-acciones">
                        <button className="gc-notif-btn gc-notif-btn-sm" disabled={ocupado}
                            onClick={() => { onQuitar(quitando, false); setQuitando(null); }}>
                            Solo este envío
                        </button>
                        <button className="gc-notif-btn gc-notif-btn-sm" disabled={ocupado || sinDepto || quitando.origen === 'PUNTUAL'}
                            title={quitando.origen === 'PUNTUAL' ? 'Se agregó solo para este envío' : `Quitar siempre de ${depto}`}
                            onClick={() => { onQuitar(quitando, true); setQuitando(null); }}>
                            Siempre en este departamento
                        </button>
                        <button className="gc-notif-link" onClick={() => setQuitando(null)}>Cancelar</button>
                    </div>
                </div>
            )}

            {agregando && (
                <div className="gc-notif-cc-panel">
                    <input
                        type="email" autoFocus value={nuevo} placeholder="correo@redsalud.gob.cl"
                        onChange={(e) => setNuevo(e.target.value)}
                    />
                    <div className="gc-notif-cc-acciones">
                        <button className="gc-notif-btn gc-notif-btn-sm" disabled={ocupado || !correoValido}
                            onClick={() => { onAgregar(nuevo.trim(), false); cerrarAgregar(); }}>
                            Solo este envío
                        </button>
                        <button className="gc-notif-btn gc-notif-btn-sm" disabled={ocupado || !correoValido || sinDepto}
                            title={`Agregar siempre a ${depto}`}
                            onClick={() => { onAgregar(nuevo.trim(), true); cerrarAgregar(); }}>
                            Siempre en este departamento
                        </button>
                        <button className="gc-notif-link" onClick={cerrarAgregar}>Cancelar</button>
                    </div>
                </div>
            )}

            {fila.copias_excluidas.length > 0 && (
                <div className="gc-notif-cc-quitadas">
                    {fila.copias_excluidas.map((c) => (
                        <span key={c.correo} className="gc-notif-cc-quitada">
                            <s>{c.nombre}</s>
                            <span className="gc-notif-sub"> {c.motivo === 'REGLA' ? '(siempre quitada)' : '(solo este envío)'}</span>
                            <button className="gc-notif-link" disabled={ocupado} onClick={() => onRestaurar(c)}>↩ Restaurar</button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
