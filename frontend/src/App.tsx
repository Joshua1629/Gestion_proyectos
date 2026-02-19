import { useEffect, useState, useCallback, useRef } from 'react';
import './App.css';
import Login from './components/login';
import { getCurrentUser, logout } from './services/auth';
import ProyectosDashboard from './components/ProyectosDashboard';
import NormasRepositorio from './components/NormasRepositorio';
import ProyectoDetail from './components/ProyectoDetail';
import PerfilUsuario from './components/PerfilUsuario';

type ViewType = 'dashboard' | 'proyecto-detail' | 'normas-repo' | 'perfil';

interface AppState {
  currentView: ViewType;
  selectedProyectoId?: number;
}

// Función helper para obtener la ruta del logo
function getLogoPath(filename: string = 'logo.png'): string {
  // Usar la URL del API para acceder al logo desde el servidor
  const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001';
  return `${apiUrl.replace(/\/$/, '')}/${filename}`;
}

function Dashboard({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [appState, setAppState] = useState<AppState>({
    currentView: 'dashboard'
  });
  const isUsuario = String(user?.rol || '').toLowerCase() === 'usuario';
  const canManage = !isUsuario; // solo admin gestiona

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

  const openPerfil = () => {
    setAppState({ currentView: 'perfil' });
  };

  return (
    <div className="app-container">
      {/* Header Principal */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-container">
              <img src={getLogoPath()} alt="FERMA S.R.L" className="app-logo" onError={(e) => {
                const target = e.target as HTMLImageElement;
                // Intentar logoapp.png como fallback
                if (!target.src.includes('logoapp.png')) {
                  target.src = getLogoPath('logoapp.png');
                } else {
                  // Si ambos fallan, ocultar la imagen
                  target.style.display = 'none';
                }
              }} />
            </div>
            <div className="title-section">
              <h1 className="app-title">Sistema de Gestión de Proyectos</h1>
              <span className="user-info">Bienvenido, {user?.nombre || user?.email}</span>
            </div>
          </div>
          <div className="header-actions">
            <button onClick={openNormasRepo} className="btn">Repositorio de Normas</button>
            <button onClick={openPerfil} className="btn">Mi Perfil</button>
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
          <ProyectosDashboard onSelectProyecto={navigateToProyecto} canManage={canManage} />
        )}
        
        {appState.currentView === 'perfil' && (
          <PerfilUsuario user={user} onBack={navigateBack} />
        )}

        {appState.currentView === 'normas-repo' && (
          <NormasRepositorio onBack={navigateBack} canManage={canManage} />
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
  const [loading, setLoading] = useState(true);
  const loginInProgress = useRef(false); // Ref para evitar múltiples intentos

  // Callback para manejar login exitoso
  const handleLoginSuccess = useCallback((userData: any) => {
    console.log('🎉 ========== CALLBACK LOGIN RECIBIDO EN APP ==========');
    console.log('🎉 UserData recibido:', userData);
    
    // Prevenir múltiples ejecuciones
    if (loginInProgress.current) {
      console.log('⚠️ Login ya en progreso, ignorando callback duplicado');
      return;
    }
    
    loginInProgress.current = true;
    
    // Verificar que userData es válido
    if (!userData || typeof userData !== 'object' || !userData.id) {
      console.error('❌ UserData inválido, intentando desde localStorage...');
      const savedUser = getCurrentUser();
      const savedToken = localStorage.getItem('token');
      
      if (savedUser && savedToken && savedUser.id) {
        console.log('✅ Usando usuario de localStorage como fallback');
        setUser(savedUser);
        setLoading(false);
        loginInProgress.current = false;
        return;
      }
      console.error('❌ No se pudo recuperar usuario válido');
      loginInProgress.current = false;
      return;
    }
    
    // Actualizar estado de forma síncrona
    console.log('✅ Actualizando estado con usuario válido...');
    setUser(userData);
    setLoading(false);
    loginInProgress.current = false;
    
    console.log('✅ Estados actualizados exitosamente');
  }, []);

  // Función para cargar el usuario desde localStorage
  const loadUser = useCallback(() => {
    try {
      const u = getCurrentUser();
      const token = localStorage.getItem('token');
      
      console.log('🔍 loadUser - Usuario completo:', JSON.stringify(u, null, 2));
      console.log('🔍 loadUser - Token:', token ? `${token.substring(0, 20)}...` : 'Ausente');
      console.log('🔍 loadUser - Usuario es válido?', u && typeof u === 'object' && u.id);
      
      if (u && token && typeof u === 'object' && u.id) {
        console.log('✅ Usuario y token válidos encontrados, mostrando dashboard');
        setUser(u);
        setLoading(false);
        return true;
      } else {
        console.log('⚠️ No hay usuario o token válido, mostrando login');
        console.log('   - Usuario:', u ? 'Presente pero inválido' : 'Ausente');
        console.log('   - Token:', token ? 'Presente' : 'Ausente');
        setUser(null);
        setLoading(false);
        // NO limpiar datos aquí - podría estar en proceso de guardado durante login
        return false;
      }
    } catch (error) {
      console.error('❌ Error en loadUser:', error);
      setUser(null);
      setLoading(false);
      return false;
    }
  }, []);

  useEffect(() => {
    console.log('🚀 ========== APP MOUNTED ==========');
    console.log('🚀 Iniciando carga de usuario...');
    
    // Resetear flag de login
    loginInProgress.current = false;
    
    // Cargar usuario inicial
    loadUser();
    
    // También escuchar evento como fallback (por si el callback no se pasa)
    const handleLoginEvent = () => {
      console.log('📢 ========== EVENTO LOGIN RECIBIDO (FALLBACK) ==========');
      setTimeout(() => {
        loadUser();
      }, 100);
    };
    
    window.addEventListener('user-logged-in', handleLoginEvent);
    console.log('✅ Listener de evento user-logged-in registrado (fallback)');
    
    return () => {
      window.removeEventListener('user-logged-in', handleLoginEvent);
      loginInProgress.current = false;
    };
  }, [loadUser]);

  const handleLogout = () => {
    logout();
    setUser(null);
    // recargar para forzar estado limpio
    window.location.reload();
  };

  // Mostrar loading mientras se verifica el usuario
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'var(--bg-main, #f8fafc)',
        color: 'var(--text-primary, #111827)'
      }}>
        <div style={{ fontSize: '16px', fontWeight: 500 }}>Cargando...</div>
      </div>
    );
  }

  // Si no hay usuario, mostrar login
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Si hay usuario, mostrar dashboard
  return <Dashboard user={user} onLogout={handleLogout} />;
}

export default App;

