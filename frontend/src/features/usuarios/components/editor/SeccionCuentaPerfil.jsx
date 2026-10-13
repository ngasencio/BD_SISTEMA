import { useState } from 'react';
import { ROLES } from '../../constants/roles';
import { errorDeCampo } from '../../utils/organizacion';
import LeyendaRoles from '../LeyendaRoles';
import Campo, { Interruptor } from './Campo';
import { opcionesEstablecimiento } from './opcionesEstablecimiento';

/** Cuenta de acceso (auth.User) + perfil del sistema (PerfilUsuario). */
export default function SeccionCuentaPerfil({
    borrador, setCuenta, setPerfil, errores, establecimientos, esPropio,
}) {
    const [verClave, setVerClave] = useState(false);
    const { cuenta, perfil } = borrador;

    return (
        <div>
            <div className="mu-section-label">Cuenta de acceso</div>
            <div className="mu-grid-2">
                <Campo etiqueta="Correo electrónico (usuario de acceso)" error={errorDeCampo(errores, 'cuenta', 'username')
                    || errorDeCampo(errores, 'cuenta', 'email')}>
                    <input
                        type="email"
                        value={cuenta.username}
                        onChange={e => { setCuenta('username', e.target.value); setCuenta('email', e.target.value); }}
                        required
                        autoComplete="username"
                    />
                </Campo>
                <Campo
                    etiqueta="Contraseña" hint="(vacío = sin cambios)"
                    error={errorDeCampo(errores, 'cuenta', 'password')}
                >
                    <div className="mu-pass-wrap">
                        <input
                            type={verClave ? 'text' : 'password'}
                            value={cuenta.password}
                            onChange={e => setCuenta('password', e.target.value)}
                            placeholder="••••••••"
                            minLength={6}
                            autoComplete="new-password"
                        />
                        <button type="button" className="mu-pass-toggle" tabIndex={-1}
                            onClick={() => setVerClave(v => !v)}>{verClave ? '🙈' : '👁'}</button>
                    </div>
                </Campo>
                <Campo etiqueta="Nombre" error={errorDeCampo(errores, 'cuenta', 'first_name')}>
                    <input type="text" value={cuenta.first_name}
                        onChange={e => setCuenta('first_name', e.target.value)} />
                </Campo>
                <Campo etiqueta="Apellido" error={errorDeCampo(errores, 'cuenta', 'last_name')}>
                    <input type="text" value={cuenta.last_name}
                        onChange={e => setCuenta('last_name', e.target.value)} />
                </Campo>
            </div>

            <div className="mu-section-label" style={{ marginTop: 20 }}>Perfil del sistema</div>
            <div className="mu-grid-2">
                <Campo etiqueta="Rol" error={errorDeCampo(errores, 'perfil', 'role')}>
                    <select value={perfil.role} onChange={e => setPerfil('role', e.target.value)}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <LeyendaRoles variant="compact" rolActivo={perfil.role} />
                </Campo>
                <Campo etiqueta="Establecimiento" error={errorDeCampo(errores, 'perfil', 'establecimiento_id')}>
                    <select
                        value={perfil.establecimiento_id ?? ''}
                        onChange={e => setPerfil('establecimiento_id', e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">— Sin asignar —</option>
                        {opcionesEstablecimiento(establecimientos, perfil.establecimiento_id)}
                    </select>
                </Campo>
                <Campo etiqueta="Cargo" error={errorDeCampo(errores, 'perfil', 'cargo')}>
                    <input type="text" value={perfil.cargo} onChange={e => setPerfil('cargo', e.target.value)} />
                </Campo>
                <Campo etiqueta="RUN" error={errorDeCampo(errores, 'perfil', 'run')}>
                    <input type="text" value={perfil.run} placeholder="12345678-9"
                        onChange={e => setPerfil('run', e.target.value)} />
                </Campo>
            </div>

            <Interruptor
                activo={cuenta.is_active}
                onChange={v => setCuenta('is_active', v)}
                deshabilitado={esPropio}
            >
                {cuenta.is_active
                    ? <><strong>Activo</strong> — puede ingresar al sistema</>
                    : <><strong>Inactivo</strong> — no puede iniciar sesión</>}
                {esPropio ? <span className="mu-hint"> (no puedes desactivar tu propia cuenta)</span> : null}
            </Interruptor>
        </div>
    );
}
