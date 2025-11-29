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
  createTarea,
  updateTarea,
  deleteTarea,
} from "../services/tareas";
import "../css/ProyectoDetail.css";
import EvidenciasPanel from "./EvidenciasPanel";
// import NormasPanel from "./NormasPanel"; // Repositorio ahora es global

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
  const [activeTab, setActiveTab] = useState<
    "resumen" | "fases" | "tareas" | "evidencias"
  >("resumen");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tarea | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);

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

      const tareasArray: Tarea[] = Array.isArray(tareasData)
        ? tareasData
        : (tareasData?.data as Tarea[]) ?? [];

      setTareas(tareasArray);

      try {
        const users = await getUsuarios();
        setUsuarios(users || []);
      } catch (e) {
        setUsuarios([]);
      }
    } catch (err: any) {
      setError((err && (err.detail || err.message)) || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (tarea: Tarea, checked: boolean) => {
    if (!tarea || typeof tarea.id === "undefined") return;
    if (updatingIds.includes(tarea.id)) return;
    setUpdatingIds((s) => [...s, tarea.id]);
    try {
      // Set progreso to 100 when checked, or 0 when unchecked
      await updateTarea(tarea.id, { progreso: checked ? 100 : 0 });
      // Refresh data to keep proyecto aggregates in sync
      await loadProyectoData();
    } catch (err: any) {
      setError(
        (err && (err.detail || err.message)) || "Error al actualizar tarea"
      );
    } finally {
      setUpdatingIds((s) => s.filter((id) => id !== tarea.id));
    }
  };

  const handleUpdateFase = async (faseId: number, estado: Fase["estado"]) => {
    if (!proyecto) return;

    try {
      await updateFase(proyecto.id, faseId, { estado });
      await loadProyectoData();
    } catch (err: any) {
      setError(
        (err && (err.detail || err.message)) || "Error al actualizar fase"
      );
    }
  };

  const getProgresoFase = (faseNombre: string) => {
    if (!Array.isArray(tareas)) return 0;
    const tareasFase = tareas.filter((t) => t.fase === faseNombre);
    if (tareasFase.length === 0) return 0;
    return Math.round(
      tareasFase.reduce((acc, t) => acc + (t.progreso || 0), 0) /
        tareasFase.length
    );
  };

  const formatDate = (dateInput?: string | number | null) => {
    if (dateInput === null || dateInput === undefined || dateInput === "")
      return "No definida";

    try {
      // Si es un número o una cadena que contiene solo dígitos, interpretarlo como timestamp
      if (typeof dateInput === "number" || /^\d+$/.test(String(dateInput))) {
        let n = Number(dateInput);
        // Si parece estar en segundos (10 dígitos), convertir a ms
        if (String(n).length === 10) n = n * 1000;
        const dnum = new Date(n);
        if (!isNaN(dnum.getTime()))
          return dnum.toLocaleDateString("es-ES", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
      }

      // Intentar parsear como ISO u otros formatos reconocidos
      const d = new Date(String(dateInput));
      if (!isNaN(d.getTime()))
        return d.toLocaleDateString("es-ES", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      return "No definida";
    } catch (e) {
      return "No definida";
    }
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
      <div className="proyecto-header">
        <div className="header-content">
          <button onClick={onBack} className="btn btn-primary">
            ← Volver al Dashboard
          </button>
          <div className="proyecto-info">
            <h1>{proyecto.nombre}</h1>
            <p className="cliente">Cliente: {proyecto.cliente}</p>
            {proyecto.codigo && (
              <p className="codigo">ID: {proyecto.codigo}</p>
            )}
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
            <div className="stat">
              <span className="stat-label">Fases</span>
              <span className="stat-value">{proyecto.fases_completadas || 0}/{proyecto.total_fases || 0}</span>
            </div>
          </div>
          <div>
            <button
              className="btn"
              onClick={() => {
                const base = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001";
                const url = `${base}/api/reportes/proyectos/${proyecto.id}/pdf`;
                window.open(url, "_blank");
              }}
            >
              🧾 Exportar PDF
            </button>
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
        <button
          className={`tab-button ${activeTab === "evidencias" ? "active" : ""}`}
          onClick={() => setActiveTab("evidencias")}
        >
          📷 Evidencias
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "resumen" && (
          <div className="resumen-grid">
            <div className="progress-section">
              <h3 className="section-title">
                <span className="section-icon">📈</span> Progreso General
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
                <span className="section-icon">📋</span> Estadísticas Rápidas
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

                  {/* Inicio/Fin ocultos */}

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

        {activeTab === "tareas" && (
          <div className="tareas-section">
            <div className="tareas-header">
              <h3 className="section-title">
                <span className="section-icon">✅</span> Lista de Tareas
              </h3>
              <div className="tareas-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setEditing(null);
                    setShowForm(true);
                  }}
                >
                  + Nueva Tarea
                </button>
              </div>
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
                      <input
                        type="checkbox"
                        aria-label={`Marcar tarea ${tarea.nombre} como completada`}
                        checked={tarea.progreso === 100}
                        disabled={updatingIds.includes(tarea.id)}
                        onChange={(e) => {
                          void handleToggleComplete(tarea, e.target.checked);
                        }}
                      />
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

                      <div className="tarea-actions">
                        <button
                          className="btn small"
                          onClick={async () => {
                            setEditing(tarea);
                            setShowForm(true);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="btn small danger"
                          onClick={async () => {
                            if (!confirm("Eliminar tarea?")) return;
                            try {
                              await deleteTarea(tarea.id);
                              await loadProyectoData();
                            } catch (err: any) {
                              setError(
                                (err && (err.detail || err.message)) ||
                                  "Error al eliminar tarea"
                              );
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
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

        {activeTab === "evidencias" && (
          <div className="evidencias-section">
            <EvidenciasPanel proyectoId={proyecto.id} tareas={tareas} />
          </div>
        )}

        {/* La vista de Normas se movió a un repositorio global accesible desde el header */}
      </div>

      {showForm && (
        <div className="tarea-form-modal">
          <div className="tarea-form">
            <h3>{editing ? "Editar Tarea" : "Nueva Tarea"}</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const fd = new FormData(form);
                const payload: any = {
                  proyecto_id: proyectoId,
                  nombre: String(fd.get("nombre") || "").trim(),
                  descripcion:
                    String(fd.get("descripcion") || "").trim() || undefined,
                  responsable: fd.get("responsable")
                    ? Number(fd.get("responsable"))
                    : undefined,
                  prioridad: (fd.get("prioridad") as string) || undefined,
                  fase: (fd.get("fase") as string) || undefined,
                  fecha_limite: (fd.get("fecha_limite") as string) || undefined,
                };

                try {
                  console.debug("Enviando payload tarea:", payload);
                  if (editing) {
                    await updateTarea(editing.id, payload);
                  } else {
                    await createTarea(payload);
                  }
                  setShowForm(false);
                  setEditing(null);
                  await loadProyectoData();
                } catch (err: any) {
                  const serverDetail =
                    err &&
                    (err.detail || err.raw || err.rawBody || err.rawBodySent);
                  setError(
                    (serverDetail ? String(serverDetail) + " — " : "") +
                      (err?.message || "Error guardando tarea")
                  );
                }
              }}
            >
              <div className="form-row full-row">
                <label>Nombre</label>
                <input
                  name="nombre"
                  defaultValue={editing?.nombre || ""}
                  required
                />
              </div>
              <div className="form-row full-row">
                <label>Descripción</label>
                <textarea
                  name="descripcion"
                  defaultValue={editing?.descripcion || ""}
                ></textarea>
              </div>
              <div className="form-row">
                <label>Responsable</label>
                <select
                  name="responsable"
                  defaultValue={String(editing?.responsable || "")}
                >
                  <option value="">-- Ninguno --</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Prioridad</label>
                <select
                  name="prioridad"
                  defaultValue={editing?.prioridad || "Media"}
                >
                  <option>Media</option>
                  <option>Baja</option>
                  <option>Alta</option>
                </select>
                <label>Fase</label>
                <select
                  name="fase"
                  defaultValue={editing?.fase || "Planificación"}
                >
                  <option>Planificación</option>
                  <option>Ejecución</option>
                  <option>Cierre</option>
                </select>
              </div>
              <div className="form-row full-row">
                <label>Fecha Límite</label>
                <input
                  type="date"
                  name="fecha_limite"
                  defaultValue={
                    editing?.fecha_limite
                      ? editing.fecha_limite.split("T")[0]
                      : ""
                  }
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn primary">
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn cancel"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
