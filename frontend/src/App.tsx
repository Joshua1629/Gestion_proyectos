import { useEffect, useState } from 'react';
import './App.css';
import Login from './components/login';
import { getCurrentUser, logout } from './services/auth';
import ProyectosDashboard from './components/ProyectosDashboard';
import ProyectoDetail from './components/ProyectoDetail';

type ViewType = 'dashboard' | 'proyecto-detail';

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

  if (!user) {
    return <Login />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

export default App;

