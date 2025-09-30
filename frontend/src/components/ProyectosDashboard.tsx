import { useState, useEffect } from 'react';
import { type Proyecto, getProyectos, createProyecto, deleteProyecto, calcularProgresoProyecto, getColorEstadoFase } from '../services/proyectos';
import '../css/ProyectosDashboard.css';

export default function ProyectosDashboard({ onSelectProyecto }: { 
  onSelectProyecto?: (proyectoId: number) => void 
}) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null);

  // Cargar proyectos
  const loadProyectos = async () => {
    try {
      console.log('🚀 Iniciando carga de proyectos...');
      setLoading(true);
      const data = await getProyectos(page, 12, search);
      console.log('✅ Proyectos cargados:', data);
      setProyectos(data.data || []);
      setTotalPages(data.totalPages || 0);
    } catch (err: any) {
      console.error('❌ Error cargando proyectos:', err);
      setError(err.message || 'Error al cargar proyectos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProyectos();
  }, [page, search]);

  // Buscar proyectos
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProyectos();
  };

  // Eliminar proyecto
  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este proyecto?')) return;
    
    try {
      await deleteProyecto(id);
      loadProyectos();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar proyecto');
    }
  };

  // Formatear fecha
  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-ES');
  };

  // Calcular estadísticas generales
  const stats = {
    total: proyectos.length,
    enProgreso: proyectos.filter(p => p.fases?.some(f => f.estado === 'En progreso')).length,
    completados: proyectos.filter(p => p.fases?.every(f => f.estado === 'Completado')).length,
    progresoPromedio: Math.round(proyectos.reduce((acc, p) => acc + calcularProgresoProyecto(p), 0) / (proyectos.length || 1))
  };

  if (loading) return <div className="loading">Cargando proyectos...</div>;

  return (
    <div className="proyectos-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Gestión de Proyectos</h1>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + Nuevo Proyecto
        </button>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Proyectos</h3>
          <span className="stat-number">{stats.total}</span>
        </div>
        <div className="stat-card">
          <h3>En Progreso</h3>
          <span className="stat-number text-blue">{stats.enProgreso}</span>
        </div>
        <div className="stat-card">
          <h3>Completados</h3>
          <span className="stat-number text-green">{stats.completados}</span>
        </div>
        <div className="stat-card">
          <h3>Progreso Promedio</h3>
          <span className="stat-number">{stats.progresoPromedio}%</span>
        </div>
      </div>

      {/* Búsqueda */}
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Buscar proyectos por nombre o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="btn btn-outline">Buscar</button>
      </form>

      {/* Error */}
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Grid de Proyectos */}
      <div className="proyectos-grid">
        {proyectos.map((proyecto) => (
          <div key={proyecto.id} className="proyecto-card">
            {/* Header del proyecto */}
            <div className="proyecto-header">
              <h3>{proyecto.nombre}</h3>
              <div className="proyecto-actions">
                <button 
                  onClick={() => onSelectProyecto ? onSelectProyecto(proyecto.id) : setSelectedProyecto(proyecto)}
                  className="btn btn-sm btn-outline"
                >
                  Ver
                </button>
                <button 
                  onClick={() => handleDelete(proyecto.id)}
                  className="btn btn-sm btn-danger"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {/* Info del proyecto */}
            <div className="proyecto-info">
              <p><strong>Cliente:</strong> {proyecto.cliente}</p>
              <p><strong>Inicio:</strong> {formatDate(proyecto.fecha_inicio)}</p>
              <p><strong>Fin:</strong> {formatDate(proyecto.fecha_fin)}</p>
            </div>

            {/* Progreso general */}
            <div className="progreso-section">
              <div className="progreso-header">
                <span>Progreso General</span>
                <span>{calcularProgresoProyecto(proyecto)}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${calcularProgresoProyecto(proyecto)}%` }}
                />
              </div>
            </div>

            {/* Fases */}
            <div className="fases-section">
              <h4>Fases</h4>
              <div className="fases-list">
                {proyecto.fases?.map((fase) => (
                  <div key={fase.id} className="fase-item">
                    <span className="fase-nombre">{fase.nombre}</span>
                    <span 
                      className="fase-estado"
                      style={{ 
                        backgroundColor: getColorEstadoFase(fase.estado),
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px'
                      }}
                    >
                      {fase.estado}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Estadísticas de tareas */}
            <div className="tareas-stats">
              <div className="stat-item">
                <span>Tareas:</span>
                <span>{proyecto.tareas_completadas || 0}/{proyecto.total_tareas || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn btn-outline"
          >
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn btn-outline"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modal para crear proyecto */}
      {showCreateModal && (
        <CreateProyectoModal 
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadProyectos();
          }}
        />
      )}

      {/* Modal para ver proyecto */}
      {selectedProyecto && (
        <ProyectoDetailModal
          proyecto={selectedProyecto}
          onClose={() => setSelectedProyecto(null)}
        />
      )}
    </div>
  );
}

// Modal para crear proyecto
function CreateProyectoModal({ onClose, onSuccess }: { 
  onClose: () => void; 
  onSuccess: () => void; 
}) {
  const [formData, setFormData] = useState({
    nombre: '',
    cliente: '',
    fecha_inicio: '',
    fecha_fin: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await createProyecto(formData);
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Error al crear proyecto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Nuevo Proyecto</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Nombre del Proyecto</label>
            <input
              type="text"
              required
              value={formData.nombre}
              onChange={(e) => setFormData({...formData, nombre: e.target.value})}
            />
          </div>
          
          <div className="form-group">
            <label>Cliente</label>
            <input
              type="text"
              required
              value={formData.cliente}
              onChange={(e) => setFormData({...formData, cliente: e.target.value})}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Fecha de Inicio</label>
              <input
                type="date"
                value={formData.fecha_inicio}
                onChange={(e) => setFormData({...formData, fecha_inicio: e.target.value})}
              />
            </div>
            
            <div className="form-group">
              <label>Fecha de Fin</label>
              <input
                type="date"
                value={formData.fecha_fin}
                onChange={(e) => setFormData({...formData, fecha_fin: e.target.value})}
              />
            </div>
          </div>
        </form>
        
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Creando...' : 'Crear Proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para ver detalles de proyecto (placeholder)
function ProyectoDetailModal({ proyecto, onClose }: {
  proyecto: Proyecto;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-large">
        <div className="modal-header">
          <h2>{proyecto.nombre}</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        <div className="modal-body">
          <p>Aquí irán los detalles completos del proyecto con fases y tareas...</p>
          <p><strong>Cliente:</strong> {proyecto.cliente}</p>
          <p><strong>Progreso:</strong> {calcularProgresoProyecto(proyecto)}%</p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-primary">Cerrar</button>
        </div>
      </div>
    </div>
  );
}