import { useState, useEffect } from 'react';
import { type Proyecto, type Fase, getProyecto, updateFase, getColorEstadoFase } from '../services/proyectos';
import { type Tarea, getTareasByProyecto, createTarea, getUsuarios } from '../services/tareas';
import '../css/ProyectoDetail.css';

interface Usuario {
  id: number;
  nombre: string;
  email: string;
}

export default function ProyectoDetail({ proyectoId, onBack }: { 
  proyectoId: number; 
  onBack: () => void; 
}) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumen' | 'fases' | 'tareas'>('resumen');
  const [showCreateTarea, setShowCreateTarea] = useState(false);
  const [selectedTarea, setSelectedTarea] = useState<Tarea | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    loadProyectoData();
    loadUsuarios();
  }, [proyectoId]);

  const loadProyectoData = async () => {
    try {
      setLoading(true);
      const [proyectoData, tareasData] = await Promise.all([
        getProyecto(proyectoId),
        getTareasByProyecto(proyectoId)
      ]);
      setProyecto(proyectoData);
      setTareas(tareasData);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos del proyecto');
    } finally {
      setLoading(false);
    }
  };

  const loadUsuarios = async () => {
    try {
      const usuariosData = await getUsuarios();
      setUsuarios(usuariosData);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    }
  };

  // Actualizar estado de fase
  const handleUpdateFase = async (faseId: number, estado: Fase['estado']) => {
    if (!proyecto) return;
    
    try {
      await updateFase(proyecto.id, faseId, { estado });
      await loadProyectoData(); // Recargar para obtener progreso actualizado
    } catch (err: any) {
      setError(err.message || 'Error al actualizar fase');
    }
  };

  // Calcular progreso por fase
  const getProgresoFase = (faseNombre: string) => {
    const tareasFase = tareas.filter(t => t.fase === faseNombre);
    if (tareasFase.length === 0) return 0;
    return Math.round(tareasFase.reduce((acc, t) => acc + t.progreso, 0) / tareasFase.length);
  };

  if (loading) return <div className="loading">Cargando proyecto...</div>;
  if (!proyecto) return <div className="error">Proyecto no encontrado</div>;

  return (
    <div className="proyecto-detail">
      {/* Header */}
      <div className="proyecto-header">
        <div className="header-content">
          <button onClick={onBack} className="btn btn-outline">
            ← Volver
          </button>
          <div className="proyecto-info">
            <h1>{proyecto.nombre}</h1>
            <p className="cliente">Cliente: {proyecto.cliente}</p>
          </div>
          <div className="proyecto-stats">
            <div className="stat">
              <span className="stat-label">Progreso</span>
              <span className="stat-value">{proyecto.progreso_general || 0}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Tareas</span>
              <span className="stat-value">{proyecto.tareas_completadas || 0}/{proyecto.total_tareas || 0}</span>
            </div>
          </div>
        </div>
        
        {/* Barra de progreso general */}
        <div className="progress-section">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${proyecto.progreso_general || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'resumen' ? 'active' : ''}`}
          onClick={() => setActiveTab('resumen')}
        >
          Resumen
        </button>
        <button 
          className={`tab ${activeTab === 'fases' ? 'active' : ''}`}
          onClick={() => setActiveTab('fases')}
        >
          Fases
        </button>
        <button 
          className={`tab ${activeTab === 'tareas' ? 'active' : ''}`}
          onClick={() => setActiveTab('tareas')}
        >
          Tareas ({tareas.length})
        </button>
      </div>

      {/* Contenido según tab activo */}
      <div className="tab-content">
        {activeTab === 'resumen' && (
          <ResumenTab proyecto={proyecto} tareas={tareas} />
        )}
        
        {activeTab === 'fases' && (
          <FasesTab 
            proyecto={proyecto} 
            tareas={tareas}
            onUpdateFase={handleUpdateFase}
            getProgresoFase={getProgresoFase}
          />
        )}
        
        {activeTab === 'tareas' && (
          <TareasTab 
            tareas={tareas}
            usuarios={usuarios}
            onCreateTarea={() => setShowCreateTarea(true)}
            onSelectTarea={setSelectedTarea}
          />
        )}
      </div>

      {/* Modal crear tarea */}
      {showCreateTarea && (
        <CreateTareaModal
          proyectoId={proyecto.id}
          usuarios={usuarios}
          onClose={() => setShowCreateTarea(false)}
          onSuccess={() => {
            setShowCreateTarea(false);
            loadProyectoData();
          }}
        />
      )}

      {/* Modal detalle tarea */}
      {selectedTarea && (
        <TareaDetailModal
          tarea={selectedTarea}
          onClose={() => setSelectedTarea(null)}
        />
      )}
    </div>
  );
}

// Tab de Resumen
function ResumenTab({ proyecto, tareas }: { proyecto: Proyecto; tareas: Tarea[] }) {
  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-ES');
  };

  const tareasPorPrioridad = {
    Alta: tareas.filter(t => t.prioridad === 'Alta').length,
    Media: tareas.filter(t => t.prioridad === 'Media').length,
    Baja: tareas.filter(t => t.prioridad === 'Baja').length,
  };

  const tareasAtrasadas = tareas.filter(t => 
    t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.progreso < 100
  ).length;

  return (
    <div className="resumen-tab">
      <div className="resumen-grid">
        {/* Info general */}
        <div className="info-card">
          <h3>Información General</h3>
          <div className="info-list">
            <div className="info-item">
              <span>Fecha de inicio:</span>
              <span>{formatDate(proyecto.fecha_inicio)}</span>
            </div>
            <div className="info-item">
              <span>Fecha de fin:</span>
              <span>{formatDate(proyecto.fecha_fin)}</span>
            </div>
            <div className="info-item">
              <span>Total de fases:</span>
              <span>{proyecto.total_fases || 0}</span>
            </div>
            <div className="info-item">
              <span>Fases completadas:</span>
              <span>{proyecto.fases_completadas || 0}</span>
            </div>
          </div>
        </div>

        {/* Estadísticas de tareas */}
        <div className="info-card">
          <h3>Estadísticas de Tareas</h3>
          <div className="stats-list">
            <div className="stat-item">
              <span>Total de tareas:</span>
              <span className="stat-value">{tareas.length}</span>
            </div>
            <div className="stat-item">
              <span>Tareas completadas:</span>
              <span className="stat-value text-green">{tareas.filter(t => t.progreso === 100).length}</span>
            </div>
            <div className="stat-item">
              <span>Tareas atrasadas:</span>
              <span className="stat-value text-red">{tareasAtrasadas}</span>
            </div>
          </div>
        </div>

        {/* Prioridades */}
        <div className="info-card">
          <h3>Tareas por Prioridad</h3>
          <div className="priority-stats">
            <div className="priority-item">
              <span className="priority-label priority-alta">Alta</span>
              <span>{tareasPorPrioridad.Alta}</span>
            </div>
            <div className="priority-item">
              <span className="priority-label priority-media">Media</span>
              <span>{tareasPorPrioridad.Media}</span>
            </div>
            <div className="priority-item">
              <span className="priority-label priority-baja">Baja</span>
              <span>{tareasPorPrioridad.Baja}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab de Fases
function FasesTab({ 
  proyecto, 
  tareas, 
  onUpdateFase, 
  getProgresoFase 
}: { 
  proyecto: Proyecto; 
  tareas: Tarea[];
  onUpdateFase: (faseId: number, estado: Fase['estado']) => void;
  getProgresoFase: (faseNombre: string) => number;
}) {
  return (
    <div className="fases-tab">
      <div className="fases-list">
        {proyecto.fases?.map((fase) => (
          <div key={fase.id} className="fase-card">
            <div className="fase-header">
              <h3>{fase.nombre}</h3>
              <select
                value={fase.estado}
                onChange={(e) => onUpdateFase(fase.id, e.target.value as Fase['estado'])}
                className="estado-select"
                style={{ backgroundColor: getColorEstadoFase(fase.estado) }}
              >
                <option value="Pendiente">Pendiente</option>
                <option value="En progreso">En progreso</option>
                <option value="Completado">Completado</option>
              </select>
            </div>
            
            <div className="fase-progress">
              <div className="progress-info">
                <span>Progreso de tareas: {getProgresoFase(fase.nombre)}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${getProgresoFase(fase.nombre)}%` }}
                />
              </div>
            </div>

            <div className="fase-tareas">
              <h4>Tareas en esta fase</h4>
              {tareas.filter(t => t.fase === fase.nombre).map(tarea => (
                <div key={tarea.id} className="tarea-mini">
                  <span>{tarea.nombre}</span>
                  <span className={`priority-badge priority-${tarea.prioridad.toLowerCase()}`}>
                    {tarea.prioridad}
                  </span>
                  <span>{tarea.progreso}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tab de Tareas
function TareasTab({ 
  tareas, 
  usuarios,
  onCreateTarea,
  onSelectTarea
}: { 
  tareas: Tarea[];
  usuarios: Usuario[];
  onCreateTarea: () => void;
  onSelectTarea: (tarea: Tarea) => void;
}) {
  const [filtro, setFiltro] = useState<'todas' | 'pendientes' | 'completadas'>('todas');
  const [ordenPor, setOrdenPor] = useState<'nombre' | 'prioridad' | 'fecha_limite'>('nombre');

  const tareasFiltradas = tareas
    .filter(tarea => {
      if (filtro === 'pendientes') return tarea.progreso < 100;
      if (filtro === 'completadas') return tarea.progreso === 100;
      return true;
    })
    .sort((a, b) => {
      if (ordenPor === 'prioridad') {
        const prioridadOrder = { 'Alta': 3, 'Media': 2, 'Baja': 1 };
        return prioridadOrder[b.prioridad] - prioridadOrder[a.prioridad];
      }
      if (ordenPor === 'fecha_limite') {
        if (!a.fecha_limite && !b.fecha_limite) return 0;
        if (!a.fecha_limite) return 1;
        if (!b.fecha_limite) return -1;
        return new Date(a.fecha_limite).getTime() - new Date(b.fecha_limite).getTime();
      }
      return a.nombre.localeCompare(b.nombre);
    });

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-ES');
  };

  const getUsuarioNombre = (id?: number) => {
    if (!id) return 'Sin asignar';
    const usuario = usuarios.find(u => u.id === id);
    return usuario ? usuario.nombre : 'Desconocido';
  };

  return (
    <div className="tareas-tab">
      {/* Controles */}
      <div className="tareas-controls">
        <div className="filters">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)}>
            <option value="todas">Todas las tareas</option>
            <option value="pendientes">Pendientes</option>
            <option value="completadas">Completadas</option>
          </select>
          
          <select value={ordenPor} onChange={(e) => setOrdenPor(e.target.value as any)}>
            <option value="nombre">Ordenar por nombre</option>
            <option value="prioridad">Ordenar por prioridad</option>
            <option value="fecha_limite">Ordenar por fecha límite</option>
          </select>
        </div>
        
        <button onClick={onCreateTarea} className="btn btn-primary">
          + Nueva Tarea
        </button>
      </div>

      {/* Lista de tareas */}
      <div className="tareas-list">
        {tareasFiltradas.map(tarea => (
          <div key={tarea.id} className="tarea-card" onClick={() => onSelectTarea(tarea)}>
            <div className="tarea-header">
              <h4>{tarea.nombre}</h4>
              <span className={`priority-badge priority-${tarea.prioridad.toLowerCase()}`}>
                {tarea.prioridad}
              </span>
            </div>
            
            <div className="tarea-info">
              <div className="info-row">
                <span>Responsable: {getUsuarioNombre(tarea.responsable)}</span>
                <span>Fase: {tarea.fase}</span>
              </div>
              <div className="info-row">
                <span>Fecha límite: {formatDate(tarea.fecha_limite)}</span>
                <span>Progreso: {tarea.progreso}%</span>
              </div>
            </div>
            
            <div className="tarea-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${tarea.progreso}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Modal para crear tarea (simplificado)
function CreateTareaModal({ proyectoId, usuarios, onClose, onSuccess }: {
  proyectoId: number;
  usuarios: Usuario[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    responsable: '',
    prioridad: 'Media' as 'Alta' | 'Media' | 'Baja',
    fase: 'Planificación' as 'Planificación' | 'Ejecución' | 'Cierre',
    fecha_limite: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTarea({
        ...formData,
        proyecto_id: proyectoId,
        responsable: formData.responsable ? parseInt(formData.responsable) : undefined
      });
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Error al crear tarea');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Nueva Tarea</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Nombre de la tarea</label>
            <input
              type="text"
              required
              value={formData.nombre}
              onChange={(e) => setFormData({...formData, nombre: e.target.value})}
            />
          </div>
          
          <div className="form-group">
            <label>Descripción</label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
              rows={3}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Responsable</label>
              <select
                value={formData.responsable}
                onChange={(e) => setFormData({...formData, responsable: e.target.value})}
              >
                <option value="">Sin asignar</option>
                {usuarios.map(user => (
                  <option key={user.id} value={user.id}>{user.nombre}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Prioridad</label>
              <select
                value={formData.prioridad}
                onChange={(e) => setFormData({...formData, prioridad: e.target.value as any})}
              >
                <option value="Baja">Baja</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Fase</label>
              <select
                value={formData.fase}
                onChange={(e) => setFormData({...formData, fase: e.target.value as any})}
              >
                <option value="Planificación">Planificación</option>
                <option value="Ejecución">Ejecución</option>
                <option value="Cierre">Cierre</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Fecha límite</label>
              <input
                type="date"
                value={formData.fecha_limite}
                onChange={(e) => setFormData({...formData, fecha_limite: e.target.value})}
              />
            </div>
          </div>
        </form>
        
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={handleSubmit} className="btn btn-primary">Crear Tarea</button>
        </div>
      </div>
    </div>
  );
}

// Modal detalle de tarea (placeholder)
function TareaDetailModal({ tarea, onClose }: {
  tarea: Tarea;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-large">
        <div className="modal-header">
          <h2>{tarea.nombre}</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>
        <div className="modal-body">
          <p>Aquí irán los detalles de la tarea con chat y gestión completa...</p>
          <p><strong>Descripción:</strong> {tarea.descripcion}</p>
          <p><strong>Progreso:</strong> {tarea.progreso}%</p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-primary">Cerrar</button>
        </div>
      </div>
    </div>
  );
}