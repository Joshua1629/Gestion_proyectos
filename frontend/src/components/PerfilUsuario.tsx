import '../css/PerfilUsuario.css';

interface PerfilUsuarioProps {
  user: any;
  onBack?: () => void;
}

export default function PerfilUsuario({ user, onBack }: PerfilUsuarioProps) {
  return (
    <div className="perfil-usuario-container">
      <div className="perfil-header">
        <h2>Mi Perfil</h2>
        {onBack && (
          <button onClick={onBack} className="perfil-back-btn">
            ← Volver 
          </button>
        )}
      </div>
      <div style={{ marginTop: 12, maxWidth: 480 }}>
        <div className="perfil-info-grid">
          <div className="perfil-label">Nombre</div>
          <div className="perfil-value">{user?.nombre || '-'}</div>

          <div className="perfil-label">Usuario</div>
          <div className="perfil-value">{user?.usuario || '-'}</div>

          <div className="perfil-label">Correo</div>
          <div className="perfil-value">{user?.email || '-'}</div>

          <div className="perfil-label">Rol</div>
          <div className="perfil-value">{user?.rol || '-'}</div>
        </div>
      </div>
      <p className="perfil-note">
        Si necesitas cambiar tu información, contacta a un administrador.
      </p>
    </div>
  );
}
