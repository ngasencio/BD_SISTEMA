import { useMemo, useState } from 'react';
import { useUsuariosPanel } from '../../hooks/useFichaUsuario';
import { errorDeCampo, errorDeSeccion, normalizarTexto } from '../../utils/organizacion';
import Campo from './Campo';
import { opcionesEstablecimiento } from './opcionesEstablecimiento';

const LIMITE_OPCIONES = 40;

/**
 * Vínculo con el Panel SSO (PerfilUsuario.panel_id) y datos de su fila en data_usuario_panel.
 * Esa tabla es un espejo del Panel: un re-import la pisa; por eso cada cambio queda auditado.
 */
export default function SeccionPanel({
    ficha, borrador, setPanel, setPanelId, errores, establecimientos,
}) {
    const [buscar, setBuscar]       = useState('');
    const [eligiendo, setEligiendo] = useState(false);
    const { usuarios, cargando }    = useUsuariosPanel(eligiendo);

    const panelIdBorrador = borrador.perfil.panel_id;
    const vinculoCambiado = (ficha.perfil.panel_id ?? null) !== (panelIdBorrador ?? null);
    const panel = borrador.panel;
    const errorGeneral = errorDeSeccion(errores, 'panel');

    const opciones = useMemo(() => {
        const texto = normalizarTexto(buscar);
        const lista = texto
            ? usuarios.filter(u => normalizarTexto(`${u.alias} ${u.correo} ${u.cargo}`).includes(texto))
            : usuarios;
        return lista.slice(0, LIMITE_OPCIONES);
    }, [usuarios, buscar]);

    const elegir = (u) => {
        setPanelId(u.id);
        setEligiendo(false);
        setBuscar('');
    };

    return (
        <div>
            <div className="ue-aviso ue-aviso-info">
                Estos datos son un <strong>espejo del Panel SSO</strong>. Si alguien vuelve a importar el
                Panel, sus valores se restablecen. Cada cambio queda en el historial con el valor anterior.
            </div>

            <div className="mu-section-label">Vínculo con el Panel SSO</div>
            <div className="ue-vinculo">
                {ficha.panel ? (
                    <div>
                        <strong>{ficha.panel.alias || ficha.panel.usuario}</strong>
                        <small className="ue-ruta">
                            {ficha.panel.correo_electronico} · id Panel {ficha.panel.id}
                        </small>
                    </div>
                ) : (
                    <div className="ue-vacio">Esta cuenta no está vinculada a un usuario del Panel SSO.</div>
                )}
                <button type="button" className="btn-secondary ue-btn-chico"
                    onClick={() => setEligiendo(e => !e)}>
                    {eligiendo ? 'Cancelar' : (ficha.panel ? 'Cambiar vínculo…' : 'Vincular…')}
                </button>
                {panelIdBorrador !== null && panelIdBorrador !== undefined && (
                    <button type="button" className="btn-secondary ue-btn-chico"
                        onClick={() => setPanelId(null)}>Desvincular</button>
                )}
            </div>
            {errorDeCampo(errores, 'perfil', 'panel_id') && (
                <div className="error-message">{errorDeCampo(errores, 'perfil', 'panel_id')}</div>
            )}
            {vinculoCambiado && (
                <div className="ue-aviso ue-aviso-alerta">
                    El vínculo cambió{panelIdBorrador ? ` (nuevo id Panel ${panelIdBorrador})` : ' (sin vínculo)'}.
                    Guarde primero y luego edite los datos del nuevo usuario del Panel.
                </div>
            )}

            {eligiendo && (
                <div className="ue-selector">
                    <input type="search" className="ue-selector-buscar" autoFocus
                        placeholder="Buscar por nombre, correo o cargo…"
                        value={buscar} onChange={e => setBuscar(e.target.value)} />
                    <div className="ue-selector-cuerpo">
                        {cargando && <div className="ue-vacio">Cargando usuarios del Panel…</div>}
                        <ul className="ue-resultados">
                            {opciones.map(u => {
                                const ocupado = u.vinculado_a && u.id !== ficha.perfil.panel_id;
                                return (
                                    <li key={u.id}>
                                        <button type="button" className="ue-opcion" disabled={!!ocupado}
                                            onClick={() => elegir(u)}>
                                            <strong>{u.alias}</strong>
                                            <small className="ue-ruta">
                                                {u.correo}{u.cargo ? ` · ${u.cargo}` : ''}{u.activo ? '' : ' · inactivo'}
                                            </small>
                                            {ocupado ? <small className="ue-ocupado">ya vinculado a {u.vinculado_a}</small> : null}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        {!cargando && opciones.length === 0 && <div className="ue-vacio">Sin coincidencias.</div>}
                    </div>
                </div>
            )}

            {ficha.panel && panel && (
                <>
                    <div className="mu-section-label" style={{ marginTop: 20 }}>Datos en el Panel SSO</div>
                    {errorGeneral && <div className="error-message">{errorGeneral}</div>}
                    <fieldset className="ue-fieldset" disabled={vinculoCambiado}>
                        <div className="mu-grid-2">
                            <Campo etiqueta="Alias" error={errorDeCampo(errores, 'panel', 'alias')}>
                                <input type="text" value={panel.alias} onChange={e => setPanel('alias', e.target.value)} />
                            </Campo>
                            <Campo etiqueta="Usuario (login del Panel)" error={errorDeCampo(errores, 'panel', 'usuario')}>
                                <input type="text" value={panel.usuario} onChange={e => setPanel('usuario', e.target.value)} />
                            </Campo>
                            <Campo etiqueta="Correo electrónico" error={errorDeCampo(errores, 'panel', 'correo_electronico')}>
                                <input type="email" value={panel.correo_electronico}
                                    onChange={e => setPanel('correo_electronico', e.target.value)} />
                            </Campo>
                            <Campo etiqueta="Cargo" error={errorDeCampo(errores, 'panel', 'cargo')}>
                                <input type="text" value={panel.cargo} onChange={e => setPanel('cargo', e.target.value)} />
                            </Campo>
                            <Campo etiqueta="RUN" error={errorDeCampo(errores, 'panel', 'run')}>
                                <input type="text" value={panel.run} onChange={e => setPanel('run', e.target.value)} />
                            </Campo>
                            <Campo etiqueta="Descripción" error={errorDeCampo(errores, 'panel', 'descripcion')}>
                                <input type="text" value={panel.descripcion}
                                    onChange={e => setPanel('descripcion', e.target.value)} />
                            </Campo>
                            <Campo etiqueta="Establecimiento" error={errorDeCampo(errores, 'panel', 'establecimiento_id')}>
                                <select value={panel.establecimiento_id ?? ''}
                                    onChange={e => setPanel('establecimiento_id', e.target.value ? Number(e.target.value) : null)}>
                                    <option value="">— Sin asignar —</option>
                                    {opcionesEstablecimiento(establecimientos, panel.establecimiento_id)}
                                </select>
                            </Campo>
                            <Campo etiqueta="Estado en el Panel" error={errorDeCampo(errores, 'panel', 'activo')}>
                                <select value={panel.activo} onChange={e => setPanel('activo', e.target.value)}>
                                    <option value="S">Activo (S)</option>
                                    <option value="N">Inactivo (N)</option>
                                </select>
                            </Campo>
                        </div>
                    </fieldset>
                </>
            )}
        </div>
    );
}
