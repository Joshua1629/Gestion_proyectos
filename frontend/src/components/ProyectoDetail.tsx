import { useState, useEffect } from "react";
import {
  type Proyecto,
  type Fase,
  getProyecto,
  updateFase,
} from "../services/proyectos";
import {
  type Tarea,
  getTareasByProyecto,
  getUsuarios,
} from "../services/tareas";
import "../css/ProyectoDetail.css";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
}

export default function ProyectoDetail({
  proyectoId,
  onBack,
}: {
  proyectoId: number;
  onBack: () => void;
}) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"resumen" | "fases" | "tareas">(
    "resumen"
  );

  // Cargar datos iniciales
  useEffect(() => {
    loadProyectoData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  const loadProyectoData = async () => {
    try {
      setLoading(true);
      const [proyectoData, tareasData] = await Promise.all([
        getProyecto(proyectoId),
        getTareasByProyecto(proyectoId),
      ]);

      setProyecto(proyectoData);

      // FIX: la API devuelve { data: [...], page, total, ... }
      // Asegurarnos de obtener el array real de tareas y que siempre sea un array.
      const tareasArray: Tarea[] = Array.isArray(tareasData)
        ? tareasData
        : (tareasData?.data as Tarea[]) ?? [];

      setTareas(tareasArray);
    } catch (err: any) {
      setError(err?.message || "Error al cargar datos del proyecto");
    } finally {
      setLoading(false);
    }
  };

  // Actualizar estado de fase
  const handleUpdateFase = async (faseId: number, estado: Fase["estado"]) => {
    if (!proyecto) return;

    try {
      await updateFase(proyecto.id, faseId, { estado });
      await loadProyectoData();
    } catch (err: any) {
      setError(err?.message || "Error al actualizar fase");
    }
  };

  // Calcular progreso por fase
  const getProgresoFase = (faseNombre: string) => {
    if (!Array.isArray(tareas)) return 0;
    const tareasFase = tareas.filter((t) => t.fase === faseNombre);
    if (tareasFase.length === 0) return 0;
    return Math.round(
      tareasFase.reduce((acc, t) => acc + (t.progreso || 0), 0) /
        tareasFase.length
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Cargando proyecto...</p>
      </div>
    );
  }

  if (!proyecto) {
    return <div className="error">Proyecto no encontrado</div>;
  }

  return (
    <div className="proyecto-detail">
      {/* Header empresarial */}
      <div className="proyecto-header">
        <div className="header-content">
          <button onClick={onBack} className="btn btn-outline">
            ← Volver al Dashboard
          </button>
          <div className="proyecto-info">
            <h1>{proyecto.nombre}</h1>
            <p className="cliente">Cliente: {proyecto.cliente}</p>
          </div>
          <div className="proyecto-stats">
            <div className="stat">
              <span className="stat-label">Progreso</span>
              <span className="stat-value">
                {proyecto.progreso_general || 0}%
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Tareas</span>
              <span className="stat-value">
                {proyecto.tareas_completadas || 0}/{proyecto.total_tareas || 0}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Fases</span>
              <span className="stat-value">
                {proyecto.fases_completadas || 0}/{proyecto.total_fases || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="proyecto-metadata">
          <div className="metadata-item">
            <span className="metadata-label">Fecha de inicio</span>
            <span className="metadata-value">
              {proyecto.fecha_inicio
                ? formatDate(proyecto.fecha_inicio)
                : "No definida"}
            </span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">Fecha de fin</span>
            <span className="metadata-value">
              {proyecto.fecha_fin
                ? formatDate(proyecto.fecha_fin)
                : "No definida"}
            </span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">Total de Fases</span>
            <span className="metadata-value">{proyecto.total_fases || 0}</span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">Total de Tareas</span>
            <span className="metadata-value">{proyecto.total_tareas || 0}</span>
          </div>
        </div>
      </div>

      {/* Navegación de tabs */}
      <div className="proyecto-tabs">
        <button
          className={`tab-button ${activeTab === "resumen" ? "active" : ""}`}
          onClick={() => setActiveTab("resumen")}
        >
          📊 Resumen
        </button>
        <button
          className={`tab-button ${activeTab === "fases" ? "active" : ""}`}
          onClick={() => setActiveTab("fases")}
        >
          🎯 Fases
        </button>
        <button
          className={`tab-button ${activeTab === "tareas" ? "active" : ""}`}
          onClick={() => setActiveTab("tareas")}
        >
          ✅ Tareas ({Array.isArray(tareas) ? tareas.length : 0})
        </button>
      </div>

      {/* Contenido de tabs */}
      <div className="tab-content">
        {/* Tab Resumen */}
        {activeTab === "resumen" && (
          <div className="resumen-grid">
            <div className="progress-section">
              <h3 className="section-title">
                <span className="section-icon">📈</span>
                Progreso General
              </h3>
              <div className="progress-circle">
                <svg width="120" height="120" className="progress-ring">
                  <circle className="progress-ring-bg" cx="60" cy="60" r="50" />
                  <circle
                    className="progress-ring-fill"
                    cx="60"
                    cy="60"
                    r="50"
                    strokeDasharray={`${
                      (proyecto.progreso_general || 0) * 3.14159
                    } 314.159`}
                  />
                </svg>
                <div className="progress-text">
                  {proyecto.progreso_general || 0}%
                </div>
              </div>
              <div className="progress-details">
                <p>
                  Progreso del proyecto basado en las tareas completadas y el
                  avance de las fases.
                </p>
              </div>
            </div>

            <div className="quick-stats">
              <h3 className="section-title">
                <span className="section-icon">📋</span>
                Estadísticas Rápidas
              </h3>
              <div className="stats-list">
                <div className="stats-item">
                  <span className="stats-item-label">Total de Fases</span>
                  <span className="stats-item-value">
                    {proyecto.fases?.length || 0}
                  </span>
                </div>
                <div className="stats-item">
                  <span className="stats-item-label">Fases Completadas</span>
                  <span className="stats-item-value">
                    {proyecto.fases?.filter((f) => f.estado === "Completado")
                      .length || 0}
                  </span>
                </div>
                <div className="stats-item">
                  <span className="stats-item-label">Total de Tareas</span>
                  <span className="stats-item-value">
                    {Array.isArray(tareas) ? tareas.length : 0}
                  </span>
                </div>
                <div className="stats-item">
                  <span className="stats-item-label">Tareas Completadas</span>
                  <span className="stats-item-value">
                    {Array.isArray(tareas)
                      ? tareas.filter((t) => t.progreso === 100).length
                      : 0}
                  </span>
                </div>
                <div className="stats-item">
                  <span className="stats-item-label">Tareas en Progreso</span>
                  <span className="stats-item-value">
                    {Array.isArray(tareas)
                      ? tareas.filter((t) => t.progreso > 0 && t.progreso < 100)
                          .length
                      : 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Fases */}
        {activeTab === "fases" && (
          <div className="fases-list">
            {proyecto.fases && proyecto.fases.length > 0 ? (
              proyecto.fases.map((fase) => (
                <div key={fase.id} className="fase-card">
                  <div className="fase-header">
                    <h4 className="fase-title">{fase.nombre}</h4>
                    <select
                      className="fase-estado-selector"
                      value={fase.estado}
                      onChange={(e) =>
                        handleUpdateFase(
                          fase.id,
                          e.target.value as Fase["estado"]
                        )
                      }
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="En progreso">En Progreso</option>
                      <option value="Completado">Completado</option>
                    </select>
                  </div>

                  <div className="fase-progress">
                    <div className="progress-header">
                      <span className="progress-label">
                        Progreso de la fase
                      </span>
                      <span className="progress-percentage">
                        {getProgresoFase(fase.nombre)}%
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${getProgresoFase(fase.nombre)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="fase-fechas">
                    <div className="fecha-item">
                      <span className="fecha-label">Inicio:</span>
                      <span className="fecha-value">
                        {fase.fecha_inicio
                          ? formatDate(fase.fecha_inicio)
                          : "No definida"}
                      </span>
                    </div>
                    <div className="fecha-item">
                      <span className="fecha-label">Fin:</span>
                      <span className="fecha-value">
                        {fase.fecha_fin
                          ? formatDate(fase.fecha_fin)
                          : "No definida"}
                      </span>
                    </div>
                  </div>

                  <div className="fase-tareas">
                    {(Array.isArray(tareas) ? tareas : [])
                      .filter((t) => t.fase === fase.nombre)
                      .map((tarea) => (
                        <div key={tarea.id} className="tarea-mini">
                          <span>{tarea.nombre}</span>
                          <div className="tarea-mini-progress">
                            <div
                              className="tarea-mini-fill"
                              style={{ width: `${tarea.progreso}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎯</div>
                <h4 className="empty-title">No hay fases definidas</h4>
                <p className="empty-description">
                  Este proyecto aún no tiene fases configuradas.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab Tareas */}
        {activeTab === "tareas" && (
          <div className="tareas-section">
            <div className="tareas-header">
              <h3 className="section-title">
                <span className="section-icon">✅</span>
                Lista de Tareas
              </h3>
            </div>

            <div className="tareas-list">
              {Array.isArray(tareas) && tareas.length > 0 ? (
                tareas.map((tarea) => (
                  <div key={tarea.id} className="tarea-item">
                    <div
                      className={`tarea-checkbox ${
                        tarea.progreso === 100 ? "completed" : ""
                      }`}
                    >
                      {tarea.progreso === 100 && "✓"}
                    </div>
                    <div className="tarea-info">
                      <div className="tarea-title">{tarea.nombre}</div>
                      <div className="tarea-meta">
                        <span>Fase: {tarea.fase}</span>
                        <span>Prioridad: {tarea.prioridad}</span>
                        {tarea.responsable_nombre && (
                          <span>Responsable: {tarea.responsable_nombre}</span>
                        )}
                        {tarea.fecha_limite && (
                          <span>Límite: {formatDate(tarea.fecha_limite)}</span>
                        )}
                      </div>
                      {tarea.descripcion && (
                        <div className="tarea-description">
                          {tarea.descripcion}
                        </div>
                      )}
                    </div>
                    <div className="tarea-progress-mini">
                      <div className="tarea-progress-bar">
                        <div
                          className="tarea-progress-fill"
                          style={{ width: `${tarea.progreso}%` }}
                        ></div>
                      </div>
                      <span>{tarea.progreso}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📝</div>
                  <h4 className="empty-title">No hay tareas creadas</h4>
                  <p className="empty-description">
                    Este proyecto aún no tiene tareas asignadas.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
