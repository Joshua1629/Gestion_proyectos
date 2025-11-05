import { useEffect, useState } from 'react';
import './App.css';
import Login from './components/login';
import { getCurrentUser, logout } from './services/auth';
import ProyectosDashboard from './components/ProyectosDashboard';
import NormasRepositorio from './components/NormasRepositorio';
import ProyectoDetail from './components/ProyectoDetail';

type ViewType = 'dashboard' | 'proyecto-detail' | 'normas-repo';

interface AppState {
  currentView: ViewType;
  selectedProyectoId?: number;
}

function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [appState, setAppState] = useState<AppState>({
    currentView: 'dashboard'
  });

  const navigateToProyecto = (proyectoId: number) => {
    setAppState({
      currentView: 'proyecto-detail',
      selectedProyectoId: proyectoId
    });
  };

  const navigateBack = () => {
    setAppState({
      currentView: 'dashboard'
    });
  };

  const openNormasRepo = () => {
    setAppState({ currentView: 'normas-repo' });
  };

  return (
    <div className="app-container">
      {/* Header Principal */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="app-title">Sistema de Gestión de Proyectos</h1>
            <span className="user-info">Bienvenido, {user?.nombre || user?.email}</span>
          </div>
          <div className="header-actions">
            <button onClick={openNormasRepo} className="btn">Repositorio de Normas</button>
            <span className="user-role">{user?.rol}</span>
            <button onClick={onLogout} className="btn btn-outline">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="main-content">
        {appState.currentView === 'dashboard' && (
          <ProyectosDashboard onSelectProyecto={navigateToProyecto} />
        )}
        
        {appState.currentView === 'normas-repo' && (
          <NormasRepositorio />
        )}

        {appState.currentView === 'proyecto-detail' && appState.selectedProyectoId && (
          <ProyectoDetail 
            proyectoId={appState.selectedProyectoId}
            onBack={navigateBack}
          />
        )}
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
  }, []);

  const handleLogout = () => {
    logout();
    setUser(null);
    // recargar para forzar estado limpio
    window.location.href = '/';
  };

  useEffect(() => { console.log('App mounted'); }, []);

  // Diagnóstico de conectividad desde el renderer (solo en desarrollo; una sola vez)
 /* useEffect(() => {
    if (!import.meta.env.DEV) return;
    const key = '__did_connectivity_probe__';
    if ((window as any)[key]) return; // evitar doble ejecución por StrictMode
    (window as any)[key] = true;
    console.log('navigator.onLine =', navigator.onLine);
    const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001');
    fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'probe', password: 'xxxx' }) })
      .then(r => console.log('probe /api/auth/login status', r.status))
      .catch(e => console.warn('probe failed', e?.message || e));
  }, []);
*/
  if (!user) {
    return <Login />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

export default App;

