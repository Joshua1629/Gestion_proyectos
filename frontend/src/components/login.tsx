import React, { useState } from "react";
import { login, saveAuth } from "../services/auth";
import "../css/login.css";

interface LoginProps {
  onLoginSuccess?: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      console.log('🔄 ========== INICIO DE LOGIN ==========');
      console.log('🔄 Usuario:', username);
      console.log('🔄 Contraseña:', password ? '***' : 'vacía');
      
      const res = await login(username, password);
      console.log('✅ Respuesta del servidor recibida:', res);
      console.log('✅ Tipo de respuesta:', typeof res);
      console.log('✅ Tiene token?', !!res?.token);
      console.log('✅ Tiene user?', !!res?.user);
      
      if (!res || !res.token || !res.user) {
        console.error('❌ Respuesta de login inválida:', res);
        console.error('❌ Tipo:', typeof res);
        console.error('❌ Contenido completo:', JSON.stringify(res, null, 2));
        throw new Error('Respuesta de login inválida - falta token o user');
      }
      
      console.log('💾 Guardando autenticación en localStorage...');
      console.log('💾 Token a guardar:', res.token.substring(0, 20) + '...');
      console.log('💾 User a guardar:', JSON.stringify(res.user, null, 2));
      
      saveAuth(res.token, res.user);
      
      // Verificar que se guardó correctamente
      const savedUser = JSON.parse(localStorage.getItem('user') || 'null');
      const savedToken = localStorage.getItem('token');
      
      console.log('✅ Verificación post-guardado:');
      console.log('✅ Usuario guardado:', savedUser ? 'Sí' : 'No', savedUser);
      console.log('✅ Token guardado:', savedToken ? 'Sí' : 'No', savedToken ? savedToken.substring(0, 20) + '...' : '');
      
      if (!savedUser || !savedToken) {
        throw new Error('Error al guardar en localStorage');
      }
      
      // En Electron, la forma más confiable es recargar después de guardar
      // Esto asegura que App.tsx cargue el usuario correctamente desde localStorage
      console.log('✅ Login exitoso, recargando aplicación...');
      
      // Intentar callback primero (para logs)
      if (onLoginSuccess) {
        try {
          onLoginSuccess(res.user);
        } catch (err) {
          console.warn('⚠️ Error en callback, continuando con recarga:', err);
        }
      }
      
      // Recargar después de un breve delay para asegurar que localStorage se guardó
      setTimeout(() => {
        console.log('🔄 Recargando página para aplicar cambios...');
        window.location.reload();
      }, 100);
    } catch (err: any) {
      console.error('❌ ========== ERROR EN LOGIN ==========');
      console.error('❌ Error completo:', err);
      console.error('❌ Tipo de error:', typeof err);
      console.error('❌ Mensaje:', err?.message);
      console.error('❌ Status:', err?.status);
      console.error('❌ Stack:', err?.stack);
      const isCredencialesInvalidas =
        err?.status === 401 ||
        /credenciales inválidas|credenciales inválidas/i.test(
          err?.error || ""
        ) ||
        /invalid credentials|unauthorized/i.test(err?.error || "");

      const msg = isCredencialesInvalidas
        ? "Usuario o contraseña incorrecto"
        : err?.error || err?.message || "Error al iniciar sesión";

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="./logo.png" alt="Logo empresa" onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== 'logo.png') {
              target.src = 'logo.png';
            }
          }} />
        </div>
        <h2>Iniciar Sesión</h2>
        <p className="login-subtitle">
          Accede a tu sistema de gestión electrico
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              required
            />
          </div>

          <button
            type="submit"
            className={`login-submit ${loading ? "loading" : ""}`}
            disabled={loading}
          >
            {loading ? "" : "Iniciar Sesión"}
          </button>
        </form>

        <div className="login-footer">
          <p>Sistema de Gestión de Proyectos Eléctricos</p>
        </div>
      </div>
    </div>
  );
}
