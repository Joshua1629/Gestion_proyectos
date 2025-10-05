import { useState, useEffect } from "react";
import {
  type Proyecto,
  getProyectos,
  createProyecto,
  deleteProyecto,
  calcularProgresoProyecto,
} from "../services/proyectos";
import "../css/ProyectosDashboard.css";

export default function ProyectosDashboard({
  onSelectProyecto,
}: {
  onSelectProyecto?: (proyectoId: number) => void;
}) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado del formulario
  const [formData, setFormData] = useState({
    nombre: "",
    cliente: "",
    cedula_juridica: "",
    fecha_inicio: "",
    fecha_fin: "",
    descripcion: "",
    prioridad: "media",
    crear_fases: {
      planificacion: true,
      ejecucion: true,
      cierre: true,
    },
  });

  // Validación del formulario
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // Cargar proyectos
  const loadProyectos = async () => {
    try {
      console.log("🚀 Iniciando carga de proyectos...");
      setLoading(true);
      const data = await getProyectos(page, 12, search);
      console.log("✅ Proyectos cargados:", data);
      setProyectos(data.data || []);
      setTotalPages(data.totalPages || 0);
    } catch (err: any) {
      console.error("❌ Error cargando proyectos:", err);
      setError(err.message || "Error al cargar proyectos");
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

  // Validar formulario
  const validateForm = () => {
    const errors: { [key: string]: string } = {};

    if (!formData.nombre.trim()) {
      errors.nombre = "El nombre del proyecto es requerido";
    }

    if (!formData.cliente.trim()) {
      errors.cliente = "El nombre del cliente es requerido";
    }

    if (
      formData.cedula_juridica &&
      !/^\d{9,12}$/.test(formData.cedula_juridica.replace(/[-\s]/g, ""))
    ) {
      errors.cedula_juridica =
        "La cédula jurídica debe tener entre 9 y 12 dígitos";
    }

    if (formData.fecha_inicio && formData.fecha_fin) {
      const fechaInicio = new Date(formData.fecha_inicio);
      const fechaFin = new Date(formData.fecha_fin);
      if (fechaFin <= fechaInicio) {
        errors.fecha_fin =
          "La fecha de fin debe ser posterior a la fecha de inicio";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Crear proyecto
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const projectData = {
        nombre: formData.nombre.trim(),
        cliente: formData.cliente.trim(),
        cedula_juridica: formData.cedula_juridica.trim() || undefined,
        fecha_inicio: formData.fecha_inicio || undefined,
        fecha_fin: formData.fecha_fin || undefined,
        descripcion: formData.descripcion.trim() || undefined,
      };

      console.log("📤 Enviando datos del proyecto:", projectData);

      const nuevoProyecto = await createProyecto(projectData);
      console.log("✅ Proyecto creado exitosamente:", nuevoProyecto);

      // Recargar la lista de proyectos
      await loadProyectos();

      // Cerrar modal y resetear formulario
      setShowCreateModal(false);
      resetForm();

      // Mostrar mensaje de éxito (opcional)
      alert("¡Proyecto creado exitosamente!");
    } catch (err: any) {
      console.error("❌ Error creando proyecto:", err);
      setError(
        err.message ||
          "Error al crear el proyecto. Por favor, intenta nuevamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resetear formulario
  const resetForm = () => {
    setFormData({
      nombre: "",
      cliente: "",
      cedula_juridica: "",
      fecha_inicio: "",
      fecha_fin: "",
      descripcion: "",
      prioridad: "media",
      crear_fases: {
        planificacion: true,
        ejecucion: true,
        cierre: true,
      },
    });
    setFormErrors({});
  };

  // Actualizar datos del formulario
  const updateFormData = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Limpiar error del campo al modificarlo
    if (formErrors[field]) {
      setFormErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  // Eliminar proyecto
  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este proyecto?")) return;

    try {
      await deleteProyecto(id);
      await loadProyectos();
    } catch (err: any) {
      setError(err.message || "Error al eliminar proyecto");
    }
  };

  // Cerrar modal
  const handleCloseModal = () => {
    setShowCreateModal(false);
    resetForm();
  };

  // Calcular estadísticas
  const stats = {
    total: proyectos.length,
    enProgreso: proyectos.filter((p) => {
      const progreso = calcularProgresoProyecto(p);
      return progreso > 0 && progreso < 100;
    }).length,
    completados: proyectos.filter((p) => calcularProgresoProyecto(p) === 100)
      .length,
    progresoPromedio:
      proyectos.length > 0
        ? Math.round(
            proyectos.reduce((acc, p) => acc + calcularProgresoProyecto(p), 0) /
              proyectos.length
          )
        : 0,
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "No definida";
    return new Date(dateString).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getEstadoColor = (progreso: number) => {
    if (progreso === 100) return "success";
    if (progreso > 50) return "warning";
    if (progreso > 0) return "info";
    return "default";
  };

  const getEstadoText = (progreso: number) => {
    if (progreso === 100) return "Completado";
    if (progreso > 50) return "Avanzado";
    if (progreso > 0) return "En Progreso";
    return "Iniciando";
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p className="loading-text">Cargando proyectos...</p>
      </div>
    );
  }

  return (
    <div className="proyectos-dashboard">
      {/* Header del dashboard */}
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1>Panel de Proyectos</h1>
          <p className="dashboard-subtitle">
            Gestiona y supervisa todos tus proyectos Electricos
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* Estadísticas empresariales */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📁</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total de Proyectos</div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-icon">⚡</div>
          <div className="stat-value">{stats.enProgreso}</div>
          <div className="stat-label">En Progreso</div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{stats.completados}</div>
          <div className="stat-label">Completados</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-value">{stats.progresoPromedio}%</div>
          <div className="stat-label">Progreso Promedio</div>
        </div>
      </div>

      {/* Controles del dashboard */}
      <div className="dashboard-controls">
        <div className="search-container">
          <div className="search-icon">🔍</div>
          <input
            type="text"
            placeholder="Buscar proyectos por nombre o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-controls">
          <select className="filter-select">
            <option value="">Todos los estados</option>
            <option value="iniciando">Iniciando</option>
            <option value="progreso">En Progreso</option>
            <option value="avanzado">Avanzado</option>
            <option value="completado">Completado</option>
          </select>
          <select className="filter-select">
            <option value="">Ordenar por</option>
            <option value="nombre">Nombre</option>
            <option value="fecha">Fecha</option>
            <option value="progreso">Progreso</option>
            <option value="cliente">Cliente</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Grid de Proyectos empresariales */}
      <div className="proyectos-grid">
        {proyectos.map((proyecto) => {
          const progreso = calcularProgresoProyecto(proyecto);
          return (
            <div key={proyecto.id} className="proyecto-card">
              {/* Header del proyecto */}
              <div className="proyecto-card-header">
                <div className="proyecto-title">{proyecto.nombre}</div>
                <div className="proyecto-description">
                  Cliente: {proyecto.cliente}
                </div>
                <div className="proyecto-meta">
                  <span
                    className={`proyecto-estado estado-${getEstadoColor(
                      progreso
                    )}`}
                  >
                    {getEstadoText(progreso)}
                  </span>
                  <span className="proyecto-fecha">
                    {formatDate(proyecto.fecha_inicio)}
                  </span>
                </div>
              </div>

              {/* Body del proyecto */}
              <div className="proyecto-card-body">
                {/* Progreso - SIN texto fijo */}
                <div className="proyecto-progress">
                  <div className="progress-header">
                    <span className="progress-percentage">{progreso}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${progreso}%` }}
                    ></div>
                  </div>
                </div>

                {/* Estadísticas */}
                <div className="proyecto-stats">
                  <div className="stat-item">
                    <div className="stat-number">
                      {proyecto.total_fases || 0}
                    </div>
                    <div className="stat-text">Fases</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">
                      {proyecto.total_tareas || 0}
                    </div>
                    <div className="stat-text">Tareas</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">
                      {proyecto.tareas_completadas || 0}
                    </div>
                    <div className="stat-text">Completas</div>
                  </div>
                </div>

                {/* Fechas importantes */}
                <div className="proyecto-fechas">
                  <div className="fecha-item">
                    <span className="fecha-label">Inicio:</span>
                    <span className="fecha-value">
                      {formatDate(proyecto.fecha_inicio)}
                    </span>
                  </div>
                  <div className="fecha-item">
                    <span className="fecha-label">Fin:</span>
                    <span className="fecha-value">
                      {formatDate(proyecto.fecha_fin)}
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="proyecto-actions">
                  <button
                    onClick={() =>
                      onSelectProyecto && onSelectProyecto(proyecto.id)
                    }
                    className="btn btn-primary"
                  >
                    Ver Detalles
                  </button>
                  <button
                    onClick={() => handleDelete(proyecto.id)}
                    className="btn btn-outline btn-danger"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Estado vacío */}
      {proyectos.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h4 className="empty-title">No hay proyectos</h4>
          <p className="empty-description">
            Comienza creando tu primer proyecto Electrico para gestionar tareas
            y equipos.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Crear Primer Proyecto
          </button>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ← Anterior
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map(
            (pageNum) => (
              <button
                key={pageNum}
                className={`pagination-btn ${page === pageNum ? "active" : ""}`}
                onClick={() => setPage(pageNum)}
              >
                {pageNum}
              </button>
            )
          )}

          <button
            className="pagination-btn"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente →
          </button>

          <span className="pagination-info">
            Página {page} de {totalPages}
          </span>
        </div>
      )}

      {/* Modal de crear proyecto empresarial */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-section">
                <h3>Crear Nuevo Proyecto</h3>
                <p className="modal-subtitle">
                  Configura los detalles básicos de tu proyecto electrico
                </p>
              </div>
              <button
                className="modal-close"
                onClick={handleCloseModal}
                aria-label="Cerrar modal"
                disabled={isSubmitting}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <form
                id="create-project-form"
                className="create-project-form"
                onSubmit={handleCreateProject}
              >
                {/* Información básica */}
                <div className="form-section">
                  <div className="section-header">
                    <h4 className="section-title">📋 Información Básica</h4>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label
                        htmlFor="proyecto-nombre"
                        className="form-label required"
                      >
                        Nombre del Proyecto
                      </label>
                      <input
                        id="proyecto-nombre"
                        type="text"
                        className={`form-input ${
                          formErrors.nombre ? "error" : ""
                        }`}
                        placeholder="Ej: Sistema de Gestión CRM"
                        value={formData.nombre}
                        onChange={(e) =>
                          updateFormData("nombre", e.target.value)
                        }
                        required
                        disabled={isSubmitting}
                      />
                      {formErrors.nombre && (
                        <span className="field-error-message">
                          {formErrors.nombre}
                        </span>
                      )}
                      <span className="form-hint">
                        Nombre descriptivo del proyecto
                      </span>
                    </div>

                    <div className="form-group">
                      <label
                        htmlFor="proyecto-cliente"
                        className="form-label required"
                      >
                        Cliente
                      </label>
                      <input
                        id="proyecto-cliente"
                        type="text"
                        className={`form-input ${
                          formErrors.cliente ? "error" : ""
                        }`}
                        placeholder="Ej: Empresa ABC S.A."
                        value={formData.cliente}
                        onChange={(e) =>
                          updateFormData("cliente", e.target.value)
                        }
                        required
                        disabled={isSubmitting}
                      />
                      {formErrors.cliente && (
                        <span className="field-error-message">
                          {formErrors.cliente}
                        </span>
                      )}
                      <span className="form-hint">
                        Nombre de la empresa o cliente
                      </span>
                    </div>
                  </div>

                  {/* Campo de cédula jurídica */}
                  <div className="form-group">
                    <label htmlFor="cedula-juridica" className="form-label">
                      Cédula Jurídica
                    </label>
                    <input
                      id="cedula-juridica"
                      type="text"
                      className={`form-input ${
                        formErrors.cedula_juridica ? "error" : ""
                      }`}
                      placeholder="Ej: 3-101-123456"
                      value={formData.cedula_juridica}
                      onChange={(e) =>
                        updateFormData("cedula_juridica", e.target.value)
                      }
                      disabled={isSubmitting}
                    />
                    {formErrors.cedula_juridica && (
                      <span className="field-error-message">
                        {formErrors.cedula_juridica}
                      </span>
                    )}
                    <span className="form-hint">
                      Cédula jurídica de la empresa (opcional)
                    </span>
                  </div>
                </div>

                {/* Fechas del proyecto */}
                <div className="form-section">
                  <div className="section-header">
                    <h4 className="section-title">📅 Cronograma</h4>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="fecha-inicio" className="form-label">
                        Fecha de Inicio
                      </label>
                      <input
                        id="fecha-inicio"
                        type="date"
                        className="form-input"
                        value={formData.fecha_inicio}
                        onChange={(e) =>
                          updateFormData("fecha_inicio", e.target.value)
                        }
                        disabled={isSubmitting}
                      />
                      <span className="form-hint">
                        Fecha estimada de inicio
                      </span>
                    </div>

                    <div className="form-group">
                      <label htmlFor="fecha-fin" className="form-label">
                        Fecha de Finalización
                      </label>
                      <input
                        id="fecha-fin"
                        type="date"
                        className={`form-input ${
                          formErrors.fecha_fin ? "error" : ""
                        }`}
                        value={formData.fecha_fin}
                        onChange={(e) =>
                          updateFormData("fecha_fin", e.target.value)
                        }
                        disabled={isSubmitting}
                      />
                      {formErrors.fecha_fin && (
                        <span className="field-error-message">
                          {formErrors.fecha_fin}
                        </span>
                      )}
                      <span className="form-hint">
                        Fecha estimada de entrega
                      </span>
                    </div>
                  </div>
                </div>

                {/* Descripción del proyecto */}
                <div className="form-section">
                  <div className="section-header">
                    <h4 className="section-title">📝 Descripción</h4>
                  </div>

                  <div className="form-group">
                    <label
                      htmlFor="proyecto-descripcion"
                      className="form-label"
                    >
                      Descripción del Proyecto
                    </label>
                    <textarea
                      id="proyecto-descripcion"
                      className="form-textarea"
                      placeholder="Describe brevemente los objetivos, alcance y características principales del proyecto..."
                      rows={4}
                      value={formData.descripcion}
                      onChange={(e) =>
                        updateFormData("descripcion", e.target.value)
                      }
                      disabled={isSubmitting}
                    />
                    <span className="form-hint">
                      Información adicional sobre el proyecto (opcional)
                    </span>
                  </div>
                </div>

                {/* Configuración inicial */}
                <div className="form-section">
                  <div className="section-header">
                    <h4 className="section-title">⚙️ Configuración Inicial</h4>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label
                        htmlFor="proyecto-prioridad"
                        className="form-label"
                      >
                        Prioridad
                      </label>
                      <select
                        id="proyecto-prioridad"
                        className="form-select"
                        value={formData.prioridad}
                        onChange={(e) =>
                          updateFormData("prioridad", e.target.value)
                        }
                        disabled={isSubmitting}
                      >
                        <option value="baja">🟢 Baja</option>
                        <option value="media">🟡 Media</option>
                        <option value="alta">🔴 Alta</option>
                      </select>
                      <span className="form-hint">
                        Nivel de prioridad del proyecto
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Crear Fases Predeterminadas
                      </label>
                      <div className="checkbox-group">
                        <label className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={formData.crear_fases.planificacion}
                            onChange={(e) =>
                              updateFormData("crear_fases", {
                                ...formData.crear_fases,
                                planificacion: e.target.checked,
                              })
                            }
                            disabled={isSubmitting}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Planificación</span>
                        </label>
                        <label className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={formData.crear_fases.ejecucion}
                            onChange={(e) =>
                              updateFormData("crear_fases", {
                                ...formData.crear_fases,
                                ejecucion: e.target.checked,
                              })
                            }
                            disabled={isSubmitting}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Ejecución</span>
                        </label>
                        <label className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={formData.crear_fases.cierre}
                            onChange={(e) =>
                              updateFormData("crear_fases", {
                                ...formData.crear_fases,
                                cierre: e.target.checked,
                              })
                            }
                            disabled={isSubmitting}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Cierre</span>
                        </label>
                      </div>
                      <span className="form-hint">
                        Fases estándar para comenzar
                      </span>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseModal}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`btn btn-primary ${isSubmitting ? "loading" : ""}`}
                form="create-project-form"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="btn-spinner"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <span className="btn-icon">💾</span>
                    Guardar Proyecto
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
