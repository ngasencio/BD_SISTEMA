import React, { useState, useEffect } from 'react';
import { ROLES, getRol } from '../constants/roles';
import LeyendaRoles from './LeyendaRoles';

const AVATAR_COLORS = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#db2777'];

function getAvatarColor(str = '') {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const EMPTY = {
    username: '', email: '', first_name: '', last_name: '',
    is_active: true, password: '',
    perfil: { role: 'viewer', cargo: '', run: '', establecimiento_id: null },
};

export default function ModalUsuario({ usuario, establecimientos = [], onSave, onClose }) {
    const esEdicion = !!usuario;
    const [form, setForm]     = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState(null);
    const [showPass, setShowPass] = useState(false);

    useEffect(() => {
        if (usuario) {
            setForm({
                ...usuario,
                password: '',
                perfil: {
                    role:               usuario.perfil?.role               ?? 'viewer',
                    cargo:              usuario.perfil?.cargo              ?? '',
                    run:                usuario.perfil?.run                ?? '',
                    establecimiento_id: usuario.perfil?.establecimiento_id ?? null,
                },
            });
        } else {
            setForm(EMPTY);
        }
        setError(null);
        setShowPass(false);
    }, [usuario]);

    const set       = (field, val) => setForm(f => ({ ...f, [field]: val }));
    const setPerfil = (field, val) => setForm(f => ({ ...f, perfil: { ...f.perfil, [field]: val } }));

    const initials = form.first_name
        ? form.first_name[0].toUpperCase()
        : (form.username?.[0] || '?').toUpperCase();
    const avatarBg = getAvatarColor(form.username);
    const rolActual = getRol(form.perfil.role);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const payload = { ...form };
            if (!payload.password) delete payload.password;
            if (!payload.email) payload.email = payload.username;
            // Asegurar que establecimiento_id vacío llega como null, nunca como string vacío
            if (payload.perfil) {
                payload.perfil = { ...payload.perfil };
                if (payload.perfil.establecimiento_id === '') {
                    payload.perfil.establecimiento_id = null;
                }
            }
            await onSave(payload);
            onClose();
        } catch (err) {
            const d = err.response?.data;
            setError(
                typeof d === 'string' ? d :
                d?.username?.[0] || d?.email?.[0] || d?.detail ||
                JSON.stringify(d) || 'Error al guardar.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="drawer-backdrop" onClick={onClose} />
            <div className="mu-drawer">
                {/* Header con avatar */}
                <div className="mu-header">
                    <div className="mu-header-avatar" style={{ background: avatarBg }}>
                        {initials}
                    </div>
                    <div className="mu-header-info">
                        <div className="mu-header-title">
                            {esEdicion ? (
                                [form.first_name, form.last_name].filter(Boolean).join(' ') || form.username || 'Usuario'
                            ) : 'Nuevo usuario'}
                        </div>
                        {esEdicion && (
                            <div className="mu-header-email">{form.username}</div>
                        )}
                        <div className="mu-role-pill" style={{ background: rolActual.color + '22', color: rolActual.color }}>
                            {rolActual.label}
                        </div>
                    </div>
                    <button className="modal-close mu-close" onClick={onClose} type="button">✕</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mu-body">
                        {error && <div className="error-message">{error}</div>}

                        {/* Sección: Cuenta */}
                        <div className="mu-section-label">Cuenta de acceso</div>
                        <div className="mu-grid-2">
                            <label className="form-field mu-field">
                                <span>Correo electrónico *</span>
                                <input
                                    type="email"
                                    value={form.username}
                                    onChange={e => { set('username', e.target.value); set('email', e.target.value); }}
                                    required
                                    placeholder="usuario@redsalud.gob.cl"
                                    autoComplete="username"
                                />
                            </label>
                            <label className="form-field mu-field">
                                <span>
                                    Contraseña {esEdicion
                                        ? <span className="mu-hint">(vacío = sin cambios)</span>
                                        : '*'}
                                </span>
                                <div className="mu-pass-wrap">
                                    <input
                                        type={showPass ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={e => set('password', e.target.value)}
                                        required={!esEdicion}
                                        placeholder={esEdicion ? '••••••••' : 'Contraseña inicial'}
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="mu-pass-toggle"
                                        onClick={() => setShowPass(s => !s)}
                                        tabIndex={-1}
                                    >{showPass ? '🙈' : '👁'}</button>
                                </div>
                            </label>
                            <label className="form-field mu-field">
                                <span>Nombre</span>
                                <input
                                    type="text"
                                    value={form.first_name}
                                    onChange={e => set('first_name', e.target.value)}
                                    placeholder="Nombre"
                                />
                            </label>
                            <label className="form-field mu-field">
                                <span>Apellido</span>
                                <input
                                    type="text"
                                    value={form.last_name}
                                    onChange={e => set('last_name', e.target.value)}
                                    placeholder="Apellido"
                                />
                            </label>
                        </div>

                        {/* Sección: Perfil */}
                        <div className="mu-section-label" style={{ marginTop: 20 }}>Perfil del sistema</div>
                        <div className="mu-grid-2">
                            <label className="form-field mu-field">
                                <span>Rol *</span>
                                <select value={form.perfil.role} onChange={e => setPerfil('role', e.target.value)}>
                                    {ROLES.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                                <LeyendaRoles variant="compact" rolActivo={form.perfil.role} />
                            </label>
                            <label className="form-field mu-field">
                                <span>Establecimiento</span>
                                <select
                                    value={form.perfil.establecimiento_id ?? ''}
                                    onChange={e => setPerfil('establecimiento_id', e.target.value ? Number(e.target.value) : null)}
                                >
                                    <option value="">— Sin asignar —</option>
                                    {establecimientos.map(est => (
                                        <option key={est.id} value={est.id}>
                                            {est.nombre_corto || est.descripcion}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="form-field mu-field">
                                <span>Cargo</span>
                                <input
                                    type="text"
                                    value={form.perfil.cargo}
                                    onChange={e => setPerfil('cargo', e.target.value)}
                                    placeholder="Cargo o función"
                                />
                            </label>
                            <label className="form-field mu-field">
                                <span>RUN</span>
                                <input
                                    type="text"
                                    value={form.perfil.run}
                                    onChange={e => setPerfil('run', e.target.value)}
                                    placeholder="12345678-9"
                                />
                            </label>
                        </div>

                        {/* Toggle activo */}
                        <div className="mu-toggle-row">
                            <label className="mu-toggle-label">
                                <div
                                    className={`mu-toggle ${form.is_active ? 'mu-toggle-on' : ''}`}
                                    onClick={() => set('is_active', !form.is_active)}
                                    role="switch"
                                    aria-checked={form.is_active}
                                    tabIndex={0}
                                    onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && set('is_active', !form.is_active)}
                                >
                                    <div className="mu-toggle-thumb" />
                                </div>
                                <span>
                                    {form.is_active
                                        ? <><strong>Activo</strong> — el usuario puede ingresar al sistema</>
                                        : <><strong>Inactivo</strong> — el usuario no puede iniciar sesión</>}
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mu-footer">
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary mu-btn-save" disabled={saving}>
                            {saving
                                ? <><span className="mu-saving-dot" />Guardando…</>
                                : (esEdicion ? '💾 Guardar cambios' : '✅ Crear usuario')}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
