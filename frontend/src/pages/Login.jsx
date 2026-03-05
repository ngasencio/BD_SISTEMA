import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await axios.post('http://10.8.153.227:8000/api/auth/login/', {
                username,
                password
            });
            localStorage.setItem('token', res.data.access);
            localStorage.setItem('refresh', res.data.refresh);
            navigate('/');
        } catch (err) {
            setError('Credenciales inválidas');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--gob-gris1)' }}>
            <div className="card" style={{ padding: '30px', width: '100%', maxWidth: '400px' }}>
                <h2 className="card-title" style={{ fontSize: '20px', textAlign: 'center', marginBottom: '20px' }}>Login Sistema</h2>
                {error && <div className="alert alert-danger">{error}</div>}
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label className="detail-field-lbl" style={{ display: 'block' }}>Usuario</label>
                        <input className="filter-input" type="text" value={username} onChange={e => setUsername(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label className="detail-field-lbl" style={{ display: 'block' }}>Contraseña</label>
                        <input className="filter-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: 'center' }}>
                        {loading ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
