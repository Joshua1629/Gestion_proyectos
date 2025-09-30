import React, { useState } from 'react';
import { login, saveAuth } from '../services/auth';
import '../css/login.css';

export default function Login() {
  const [username, setUsername] = useState(''); // antes email
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(username, password); // ahora envía identificador
      saveAuth(res.token, res.user);
      window.location.href = '/';
    } catch (err: any) {
      // Mostrar mensaje amigable cuando las credenciales son inválidas
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
        <h2>Iniciar sesión</h2>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <label>Usuario</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            placeholder="Usuario"
          />
          <label>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="********"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
