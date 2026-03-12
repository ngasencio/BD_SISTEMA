/**
 * @file features/auth/pages/LoginPage.jsx
 * @description Página de login con soporte de "Recordarme" y manejo de errores
 * diferenciado por tipo (red, credenciales, servidor).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../lib/axios';
import { useAuth } from '../../../store/authStore';
import './LoginPage.css';

import edificioImg from '../../../assets/edificio.jpg';
import logoImg from '../../../assets/logo.jpg';

const REMEMBER_KEY = 'remember_username';

export const LoginPage = () => {
    const [username, setUsername] = useState(
        () => localStorage.getItem(REMEMBER_KEY) || ''
    );
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [remember, setRemember] = useState(
        () => !!localStorage.getItem(REMEMBER_KEY)
    );
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.post('auth/login/', { username, password });
            login(res.data);

            if (remember) {
                localStorage.setItem(REMEMBER_KEY, username);
            } else {
                localStorage.removeItem(REMEMBER_KEY);
            }

            navigate('/');
        } catch (err) {
            if (!err.response) {
                setError('No se pudo conectar al servidor. Verifique su conexión.');
            } else if (err.response.status === 401) {
                setError('Usuario o contraseña incorrectos. Intente nuevamente.');
            } else {
                setError('Error interno del servidor. Contacte a Soporte TI.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            {/* Background layers */}
            <div className="bg">
                <div className="bg-left">
                    <img src={edificioImg} alt="Fondo Edificio" />
                </div>
                <div className="bg-right"></div>
            </div>
            <div className="bg-diagonal"></div>

            {/* Login Card */}
            <div className="card">

                {/* Left panel */}
                <div className="panel-left">
                    <img className="building-img" src={edificioImg} alt="Edificio SSO" />
                    <div className="panel-left-overlay"></div>
                    <div className="panel-left-content">
                        <div className="sso-logo-wrap">
                            <img src={logoImg} alt="SSO Logo" />
                        </div>
                        <h1>Sistema de Gestión SSO</h1>
                        <div className="subtitle">Plataforma integral para Servicios de Salud</div>
                        <div className="panel-divider"></div>
                        <div className="panel-left-badge">
                            Acceso Seguro
                        </div>
                    </div>
                </div>

                {/* Right panel */}
                <div className="panel-right">
                    <div className="form-header">
                        <div className="welcome">BIENVENIDO</div>
                        <h2>Iniciar Sesión</h2>
                        <p>Ingrese sus credenciales corporativas para continuar</p>
                    </div>

                    {error && (
                        <div className="msg error">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin}>
                        <div className="field">
                            <label>Usuario</label>
                            <div className="input-wrap">
                                <span className="icon">👤</span>
                                <input
                                    type="text"
                                    placeholder="Ej: tu.nombre"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="field">
                            <label>Contraseña</label>
                            <div className="input-wrap">
                                <span className="icon">🔒</span>
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    placeholder="Tu contraseña"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="eye-btn"
                                    onClick={() => setShowPass(s => !s)}
                                    tabIndex={-1}
                                >
                                    {showPass ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        <div className="options-row">
                            <label className="checkbox-wrap">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={e => setRemember(e.target.checked)}
                                />
                                {' '}Recordarme
                            </label>
                            <a href="#" className="forgot">¿Olvidaste tu contraseña?</a>
                        </div>

                        <button className="btn-login" type="submit" disabled={loading}>
                            {loading ? <div className="spinner"></div> : 'Ingresar'}
                        </button>
                    </form>

                    <div className="form-footer">
                        ¿Necesitas ayuda? <a href="#">Contacta a Soporte TI</a>
                    </div>
                </div>
            </div>
        </div>
    );
};
