export default function PerfilUsuario({ user }: { user: any }) {
  return (
    <div style={{ padding: 16 }}>
      <h2>Mi Perfil</h2>
      <div style={{ marginTop: 12, maxWidth: 480 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 8 }}>
          <div className="muted">Nombre</div>
          <div>{user?.nombre || '-'}</div>

          <div className="muted">Usuario</div>
          <div>{user?.usuario || '-'}</div>

          <div className="muted">Correo</div>
          <div>{user?.email || '-'}</div>

          <div className="muted">Rol</div>
          <div>{user?.rol || '-'}</div>
        </div>
      </div>
      <p style={{ marginTop: 16 }} className="muted">
        Si necesitas cambiar tu información, contacta a un administrador.
      </p>
    </div>
  );
}
