import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../store/authStore';
import { getMe, updateMe } from '../api/usuariosApi';

const ROLE_LABELS = {
    admin:          'Administrador',
    abastecimiento: 'Abastecimiento',
    finanzas:       'Finanzas',
    viewer:         'Visualizador',
};

export default function PerfilPage() {
    const { user: jwtUser } = useAuth();
    const [perfil, setPerfil]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState(null);
    const [ok, setOk]           = useState(false);

    const [email,     setEmail]    = useState('');
    const [nombre,    setNombre]   = useState('');
    const [apellido,  setApellido] = useState('');
    const [passNew,   setPassNew]  = useState('');
    const [passConf,  setPassConf] = useState('');

    useEffect(() => {
        getMe()
            .then(({ data }) => {
                setPerfil(data);
                setEmail(data.email || '');
                setNombre(data.first_name || '');
                setApellido(data.last_name || '');
            })
            .catch(() => setError('No se pudo cargar el perfil.'))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setError(null);
        setOk(false);
        if (passNew && passNew !== passConf) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        setSaving(true);
        try {
            const payload = { email, first_name: nombre, last_name: apellido };
            if (passNew) payload.password_new = passNew;
            await updateMe(payload);
            setOk(true);
            setPassNew('');
            setPassConf('');
        } catch (err) {
            const d = err.response?.data;
            setError(d?.detail || JSON.stringify(d) || 'Error al guardar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="loading-spinner" style={{ padding: 40 }}>Cargando perfil…</div>;

    return (
        <div className="feature-page">
            <div className="page-header">
                <div className="page-title">
                    <span className="page-title-icon">👤</span> Mi Perfil
                </div>
                <div className="page-subtitle">Gestiona tu información de cuenta</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
                {/* Tarjeta de info */}
                <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: '#7c3aed', color: '#fff',
                        fontSize: 28, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px',
                    }}>
                        {(perfil?.first_name?.[0] || perfil?.username?.[0] || '?').toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {[perfil?.first_name, perfil?.last_name].filter(Boolean).join(' ') || perfil?.username}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{perfil?.username}</div>

                    <div style={{
                        marginTop: 16, padding: '6px 14px', borderRadius: 20,
                        background: '#ede9fe', color: '#7c3aed',
                        fontSize: 12, fontWeight: 600, display: 'inline-block',
                    }}>
                        {ROLE_LABELS[jwtUser?.role] || jwtUser?.role || 'Visualizador'}
                    </div>

                    {perfil?.perfil?.cargo && (
                        <div style={{ marginTop: 12, fontSize: 12, color: '#374151' }}>
                            {perfil.perfil.cargo}
                        </div>
                    )}
                    {perfil?.perfil?.run && (
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                            RUN: {perfil.perfil.run}
                        </div>
                    )}
                </div>

                {/* Formulario */}
                <div className="card" style={{ padding: 24 }}>
                    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {error && <div className="error-message">{error}</div>}
                        {ok    && <div style={{ padding: '10px 14px', background: '#d1fae5', color: '#065f46', borderRadius: 8, fontSize: 13 }}>
                            ✅ Perfil actualizado correctamente.
                        </div>}

                        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                            Información Personal
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <label className="form-field">
                                <span>Nombre</span>
                                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} />
                            </label>
                            <label className="form-field">
                                <span>Apellido</span>
                                <input type="text" value={apellido} onChange={e => setApellido(e.target.value)} />
                            </label>
                            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                                <span>Correo electrónico</span>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                            </label>
                        </div>

                        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                            Cambiar Contraseña
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <label className="form-field">
                                <span>Nueva contraseña (mín. 8 caracteres)</span>
                                <input
                                    type="password"
                                    value={passNew}
                                    onChange={e => setPassNew(e.target.value)}
                                    placeholder="Dejar vacío para no cambiar"
                                    minLength={8}
                                />
                            </label>
                            <label className="form-field">
                                <span>Confirmar nueva contraseña</span>
                                <input
                                    type="password"
                                    value={passConf}
                                    onChange={e => setPassConf(e.target.value)}
                                    placeholder="Repetir contraseña"
                                />
                            </label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving ? 'Guardando…' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
