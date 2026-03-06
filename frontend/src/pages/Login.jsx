import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await axios.post('http://10.8.153.227:8000/api/auth/login/', { username, password });
            localStorage.setItem('token', res.data.access);
            localStorage.setItem('refresh', res.data.refresh);
            navigate('/');
        } catch {
            setError('Usuario o contraseña incorrectos. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-wrapper">
            {/* Panel izquierdo — branding */}
            <div className="login-left">
                <div className="login-left-inner">
                    <div className="login-logo">🏥</div>
                    <div className="login-brand-name">Sistema Gestión Interno</div>
                    <div className="login-brand-org">Servicio de Salud Osorno</div>
                    <div className="login-brand-code">SSO · Código 7296 · Región de Los Lagos</div>
                    <div className="login-features">
                        <div className="login-feature"><span>📦</span> Gestión de Abastecimiento</div>
                        <div className="login-feature"><span>💵</span> Control Financiero y Deuda</div>
                        <div className="login-feature"><span>📊</span> Reportes y Análisis</div>
                        <div className="login-feature"><span>🔗</span> Integración Mercado Público</div>
                    </div>
                </div>
                <div className="login-left-footer">
                    Ministerio de Salud · Gobierno de Chile · {new Date().getFullYear()}
                </div>
            </div>

            {/* Panel derecho — formulario */}
            <div className="login-right">
                <div className="login-card">
                    {/* Encabezado del card */}
                    <div className="login-card-header">
                        <div className="login-card-icon">🔐</div>
                        <h1 className="login-card-title">Iniciar Sesión</h1>
                        <p className="login-card-subtitle">Ingrese sus credenciales institucionales</p>
                    </div>

                    {/* Alerta de error */}
                    {error && (
                        <div className="login-error">
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Formulario */}
                    <form onSubmit={handleLogin} className="login-form">
                        <div className="login-field">
                            <label className="login-label">Usuario</label>
                            <div className="login-input-wrap">
                                <span className="login-input-icon">👤</span>
                                <input
                                    className="login-input"
                                    type="text"
                                    placeholder="Nombre de usuario"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="login-field">
                            <label className="login-label">Contraseña</label>
                            <div className="login-input-wrap">
                                <span className="login-input-icon">🔒</span>
                                <input
                                    className="login-input"
                                    type={showPass ? 'text' : 'password'}
                                    placeholder="Contraseña"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="login-toggle-pass"
                                    onClick={() => setShowPass(s => !s)}
                                    tabIndex={-1}
                                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                >
                                    {showPass ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        <button
                            className={`login-btn ${loading ? 'loading' : ''}`}
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="login-spinner" />
                                    Verificando…
                                </>
                            ) : (
                                <>
                                    <span>🔑</span> Ingresar al Sistema
                                </>
                            )}
                        </button>
                    </form>

                    {/* Pie del card */}
                    <div className="login-card-footer">
                        <span>🛡️</span>
                        Acceso restringido — Solo personal autorizado
                    </div>
                </div>

                {/* Footer inferior */}
                <div className="login-right-footer">
                    Sistema Gestión Interno v2.0 · © {new Date().getFullYear()} Servicio de Salud Osorno
                </div>
            </div>
        </div>
    );
}
