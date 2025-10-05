import React, { useState } from 'react';
import { login, saveAuth } from '../services/auth';
import '../css/login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(username, password);
      saveAuth(res.token, res.user);
      window.location.href = '/';
    } catch (err: any) {
      const isCredencialesInvalidas =
        err?.status === 401 ||
        /credenciales inválidas|credenciales inválidas/i.test(err?.error || '') ||
        /invalid credentials|unauthorized/i.test(err?.error || '');

      const msg = isCredencialesInvalidas
        ? 'Usuario o contraseña incorrecto'
        : (err?.error || err?.message || 'Error al iniciar sesión');

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="https://png.pngtree.com/element_pic/00/16/07/115783931601b5c.jpg" alt="Logo empresa" />
        </div>
        <h2>Iniciar Sesión</h2>
        <p className="login-subtitle">Accede a tu sistema de gestión electrico</p>
        
        {error && <div className="login-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ingresa tu usuario"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              required
            />
          </div>
          
          <button 
            type="submit" 
            className={`login-submit ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? '' : 'Iniciar Sesión'}
          </button>
        </form>
        
        <div className="login-footer">
          <p>Sistema de Gestión de Proyectos Eléctricos</p>
        </div>
      </div>
    </div>
  );
}