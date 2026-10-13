import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../store/authStore';
import { getRol } from '../../constants/roles';
import { useFichaUsuario } from '../../hooks/useFichaUsuario';
import {
    armarPayloadFicha, borradorDesdeFicha, hayCambios, seccionesConError,
} from '../../utils/organizacion';
import '../../styles/editor.css';
import EditorDepartamento from './EditorDepartamento';
import SeccionCuentaPerfil from './SeccionCuentaPerfil';
import SeccionHistorial from './SeccionHistorial';
import SeccionOrganizacion from './SeccionOrganizacion';
import SeccionPanel from './SeccionPanel';

const AVATAR_COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777'];
const colorAvatar = (texto = '') => {
    let h = 0;
    for (let i = 0; i < texto.length; i++) h = texto.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

// Cada pestaña agrupa secciones del payload/errores del servidor (para marcar cambios y fallos).
const TABS = [
    { id: 'cuenta',       etiqueta: 'Cuenta y perfil', secciones: ['cuenta', 'perfil'] },
    { id: 'organizacion', etiqueta: 'Organización',    secciones: ['departamentos'] },
    { id: 'panel',        etiqueta: 'Panel SSO',       secciones: ['panel'] },
    { id: 'historial',    etiqueta: 'Historial',       secciones: [] },
];

/**
 * Editor completo de un usuario (drawer). Un solo botón Guardar aplica, de forma atómica y
 * auditada, lo que cambió en cualquier pestaña: cuenta, perfil, datos del Panel SSO y el
 * departamento que ve como Gestor de Compras.
 */
export default function EditorUsuario({ usuario, establecimientos = [], onGuardado, onClose }) {
    const { user: sesion } = useAuth();
    const { ficha, arbol, indice, loading, error, guardar, recargarTodo } = useFichaUsuario(usuario.id);

    const [tab, setTab]             = useState('cuenta');
    const [borrador, setBorrador]   = useState(null);
    const [errores, setErrores]     = useState({});
    const [errorGeneral, setErrorGeneral] = useState(null);
    const [aviso, setAviso]         = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [version, setVersion]     = useState(0);
    const [editandoDepto, setEditandoDepto] = useState(null);

    useEffect(() => {
        if (ficha && !borrador) setBorrador(borradorDesdeFicha(ficha));
    }, [ficha, borrador]);

    const payload = useMemo(
        () => (ficha && borrador ? armarPayloadFicha(ficha, borrador) : {}),
        [ficha, borrador],
    );
    const hayPendientes = hayCambios(payload);

    const setCuenta = (c, v) => setBorrador(b => ({ ...b, cuenta: { ...b.cuenta, [c]: v } }));
    const setPerfil = (c, v) => setBorrador(b => ({ ...b, perfil: { ...b.perfil, [c]: v } }));
    const setPanel  = (c, v) => setBorrador(b => ({ ...b, panel: { ...b.panel, [c]: v } }));
    const setDepartamentos = (ids) => setBorrador(b => ({ ...b, departamentos: ids }));

    const guardarCambios = async () => {
        setGuardando(true);
        setErrores({});
        setErrorGeneral(null);
        setAviso(null);
        try {
            const cambioRol = !!payload.perfil?.role;
            const nueva = await guardar(payload);
            setBorrador(borradorDesdeFicha(nueva));
            setVersion(v => v + 1);
            setAviso(cambioRol
                ? 'Cambios guardados. La persona debe volver a iniciar sesión para que el nuevo rol tenga efecto.'
                : 'Cambios guardados.');
            if (onGuardado) await onGuardado();
        } catch (err) {
            const d = err.response?.data;
            const errs = d?.errores || {};
            setErrores(errs);
            setErrorGeneral(d?.detail || 'No se pudo guardar.');
            const conError = seccionesConError(errs);
            const primera = TABS.find(t => t.secciones.some(s => conError.includes(s)));
            if (primera) setTab(primera.id);
        } finally {
            setGuardando(false);
        }
    };

    // Marca por pestaña: cambios sin guardar (•) y errores del servidor (!).
    const marcaTab = (t) => {
        const conError = seccionesConError(errores);
        if (t.secciones.some(s => conError.includes(s))) return 'error';
        const claves = Object.keys(payload);
        if (t.id === 'panel' && (payload.panel || payload.perfil?.panel_id !== undefined)) return 'cambio';
        if (t.id === 'cuenta') {
            const perfilSinVinculo = payload.perfil
                ? Object.keys(payload.perfil).some(k => k !== 'panel_id') : false;
            if (payload.cuenta || perfilSinVinculo) return 'cambio';
            return null;
        }
        return t.secciones.some(s => claves.includes(s)) ? 'cambio' : null;
    };

    const nombre = borrador
        ? [borrador.cuenta.first_name, borrador.cuenta.last_name].filter(Boolean).join(' ')
            || borrador.cuenta.username
        : (usuario.username || 'Usuario');
    const rol = getRol(borrador?.perfil.role ?? usuario.perfil?.role ?? 'viewer');
    const inicial = (borrador?.cuenta.first_name || borrador?.cuenta.username || usuario.username || '?')[0].toUpperCase();
    const esPropio = sesion?.user_id === usuario.id;

    return (
        <>
            <div className="drawer-backdrop" onClick={onClose} />
            <div className="mu-drawer ue-drawer">
                <div className="mu-header">
                    <div className="mu-header-avatar" style={{ background: colorAvatar(usuario.username) }}>
                        {inicial}
                    </div>
                    <div className="mu-header-info">
                        <div className="mu-header-title">{nombre}</div>
                        <div className="mu-header-email">{usuario.username}</div>
                        <div className="mu-role-pill" style={{ background: 'rgba(255,255,255,.92)', color: rol.color }}>
                            {rol.label}
                        </div>
                    </div>
                    <button className="modal-close mu-close" onClick={onClose} type="button">✕</button>
                </div>

                <div className="ue-tabs" role="tablist">
                    {TABS.map(t => {
                        const marca = marcaTab(t);
                        return (
                            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                                className={`ue-tab ${tab === t.id ? 'ue-tab-activa' : ''}`}
                                onClick={() => setTab(t.id)}>
                                {t.etiqueta}
                                {marca === 'cambio' && <span className="ue-tab-marca ue-tab-cambio" title="Cambios sin guardar">●</span>}
                                {marca === 'error' && <span className="ue-tab-marca ue-tab-error" title="Hay errores">!</span>}
                            </button>
                        );
                    })}
                </div>

                <div className="mu-body">
                    {loading && <div className="ue-vacio">Cargando ficha…</div>}
                    {error && <div className="error-message">{error}</div>}
                    {aviso && <div className="ue-aviso ue-aviso-ok">{aviso}</div>}
                    {errorGeneral && <div className="error-message">{errorGeneral}</div>}

                    {ficha && borrador && (
                        <>
                            {tab === 'cuenta' && (
                                <SeccionCuentaPerfil
                                    borrador={borrador} setCuenta={setCuenta} setPerfil={setPerfil}
                                    errores={errores} establecimientos={establecimientos} esPropio={esPropio}
                                />
                            )}
                            {tab === 'organizacion' && (
                                <SeccionOrganizacion
                                    userId={usuario.id} ficha={ficha} arbol={arbol} indice={indice}
                                    departamentos={borrador.departamentos} setDepartamentos={setDepartamentos}
                                    esGestor={borrador.perfil.role === 'gestor_compras'}
                                    errores={errores} onEditarDepartamento={setEditandoDepto}
                                />
                            )}
                            {tab === 'panel' && (
                                <SeccionPanel
                                    ficha={ficha} borrador={borrador} setPanel={setPanel}
                                    setPanelId={(id) => setPerfil('panel_id', id)}
                                    errores={errores} establecimientos={establecimientos}
                                />
                            )}
                            {tab === 'historial' && <SeccionHistorial userId={usuario.id} version={version} />}
                        </>
                    )}
                </div>

                <div className="mu-footer">
                    <span className="ue-pie-estado">
                        {hayPendientes ? 'Hay cambios sin guardar.' : 'Sin cambios pendientes.'}
                    </span>
                    <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>
                        Cerrar
                    </button>
                    <button type="button" className="btn-primary mu-btn-save"
                        onClick={guardarCambios} disabled={guardando || !hayPendientes}>
                        {guardando ? <><span className="mu-saving-dot" />Guardando…</> : '💾 Guardar cambios'}
                    </button>
                </div>
            </div>

            {editandoDepto !== null && (
                <EditorDepartamento
                    deptoId={editandoDepto} indice={indice} establecimientos={establecimientos}
                    onClose={() => setEditandoDepto(null)}
                    onGuardado={async () => { await recargarTodo(); if (onGuardado) await onGuardado(); }}
                />
            )}
        </>
    );
}
