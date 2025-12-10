import { useEffect, useMemo, useState } from "react";
import {
  type Evidencia,
  getEvidencias,
  uploadEvidencia,
  deleteEvidencia,
  updateEvidencia,
} from "../services/evidencias";
import { type Tarea } from "../services/tareas";
import "../css/EvidenciasPanel.css";
import ImageWithFallback from "./ImageWithFallback";
import EvidenciaNormasModal from "./EvidenciaNormasModal";
import { listNormasRepoByEvidencia } from "../services/evidencias";
export default function EvidenciasPanel({
  proyectoId,
  tareas,
}: {
  proyectoId: number;
  tareas: Tarea[];
}) {
  // Form / upload
  const [file, setFile] = useState<File | null>(null);
  const [comentario, setComentario] = useState("");
  const [tareaId, setTareaId] = useState<number | "">("");
  const [isPortada, setIsPortada] = useState(false);
  const IMG_PLACEHOLDER =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" as const;
  const [items, setItems] = useState<Evidencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNormasFor, setShowNormasFor] = useState<number | null>(null);
  const [normasCount, setNormasCount] = useState<Record<number, number>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editComentario, setEditComentario] = useState("");

  const tareasById = useMemo(
    () => Object.fromEntries((tareas || []).map((t) => [t.id, t])),
    [tareas]
  );

  function normalizeImageUrl(url?: string | null) {
    if (!url) return "";
    const base = (
      import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001"
    ).replace(/\/$/, "");
    const uploadsIdx = url.indexOf("/uploads/");
    if (uploadsIdx >= 0) return `${base}${url.slice(uploadsIdx)}`;
    if (/^https?:\/\//i.test(url)) return url;
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getEvidencias({ proyectoId, limit: 100 });
      const list: Evidencia[] = (res.items || []).map((e: Evidencia) => ({
        ...e,
        imageUrl: normalizeImageUrl(e.imageUrl),
      }));
      setItems(list);

      // Cargar conteos de incumplimientos para cada evidencia
      const counts: Record<number, number> = {};
      await Promise.all(
        list.map(async (ev) => {
          try {
            const normasRes = await listNormasRepoByEvidencia(ev.id);
            counts[ev.id] = (normasRes.items || []).length;
          } catch {
            counts[ev.id] = 0;
          }
        })
      );
      setNormasCount(counts);
    } catch (e: any) {
      setError(e?.message || "Error al cargar evidencias");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [proyectoId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona una imagen");
      return;
    }
    try {
      setLoading(true);
      const tId = tareaId === "" ? undefined : Number(tareaId);
      const commentFinal = comentario.trim() || "";

      // Si es portada institucional, eliminar anteriores y subir con tipo INSTITUCIONAL
      if (isPortada) {
        try {
          const prev = await getEvidencias({
            proyectoId,
            tipo: "INSTITUCIONAL",
            limit: 100,
          });
          for (const p of prev.items || []) {
            try {
              await deleteEvidencia(p.id);
            } catch {}
          }
        } catch {}
        await uploadEvidencia({
          file,
          proyectoId,
          tareaId: tId,
          comentario: commentFinal || undefined,
          tipo: "INSTITUCIONAL" as any,
        });
      } else {
        await uploadEvidencia({
          file,
          proyectoId,
          tareaId: tId,
          comentario: commentFinal || undefined,
        });
      }

      setFile(null);
      setComentario("");
      setTareaId("");
      setIsPortada(false);
      await load();
    } catch (e: any) {
      setError(
        e?.detail || e?.error || e?.message || "Error al subir evidencia"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveComentario(evidenciaId: number) {
    try {
      setLoading(true);
      await updateEvidencia(evidenciaId, { comentario: editComentario.trim() || undefined });
      setEditingId(null);
      setEditComentario("");
      await load();
    } catch (e: any) {
      setError(e?.detail || e?.error || e?.message || "Error al actualizar comentario");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteComentario(evidenciaId: number) {
    if (!confirm("¿Eliminar el comentario de esta evidencia?")) return;
    try {
      setLoading(true);
      await updateEvidencia(evidenciaId, { comentario: "" });
      setEditingId(null);
      setEditComentario("");
      await load();
    } catch (e: any) {
      setError(e?.detail || e?.error || e?.message || "Error al borrar comentario");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="evidencias-panel">
      <h3>📷 Evidencias fotográficas</h3>

      {/* Formulario de subida */}
      <form className="evidencia-uploader" onSubmit={handleUpload}>
        <div className="row">
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setFile((e.target.files && e.target.files[0]) || null)
            }
          />
          <select
            value={tareaId as any}
            onChange={(e) =>
              setTareaId(e.target.value === "" ? "" : Number(e.target.value))
            }
          >
            <option value="">Sin tarea</option>
            {(tareas || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <input
            placeholder="Comentario (opcional)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <label
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={isPortada}
              onChange={(e) => setIsPortada(e.target.checked)}
            />{" "}
            Portada institucional
          </label>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Subir
          </button>
        </div>
        <div className="muted xsmall" style={{ marginTop: 4 }}>
          Sube imágenes individualmente.
        </div>
      </form>

      {/* Filtros eliminados */}

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div>Cargando...</div>
      ) : (
        <div className="evidencias-grid" style={{ marginTop: 12 }}>
          {items.length === 0 ? (
            <div className="empty-state">No hay evidencias</div>
          ) : (
            items.map((ev) => (
              <div key={ev.id} className="evidencia-card">
                <div className="evidencia-thumb">
                  {ev.imageUrl ? (
                    <ImageWithFallback
                      src={ev.imageUrl}
                      alt={ev.comentario || "foto"}
                      placeholder={IMG_PLACEHOLDER}
                      preferIpc={true}
                    />
                  ) : (
                    <div className="muted small" style={{ padding: 8 }}>
                      Sin imagen
                    </div>
                  )}
                  {String(ev.tipo).toUpperCase() === "INSTITUCIONAL" && (
                    <div className="badge">Portada</div>
                  )}
                </div>
                <div className="evidencia-meta">
                  {ev.tareaId && (
                    <div className="tarea-ref">
                      Tarea: {tareasById[ev.tareaId]?.nombre || ev.tareaId}
                    </div>
                  )}
                  <div className="comentario">
                    {editingId === ev.id ? (
                      <div className="edit-comentario-form">
                        <input
                          type="text"
                          value={editComentario}
                          onChange={(e) => setEditComentario(e.target.value)}
                          placeholder="Comentario"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveComentario(ev.id);
                            } else if (e.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                        />
                        <button
                          className="btn small"
                          onClick={() => handleSaveComentario(ev.id)}
                          disabled={loading}
                        >
                          Guardar
                        </button>
                        {ev.comentario && (
                          <button
                            className="btn small danger"
                            onClick={() => handleDeleteComentario(ev.id)}
                            disabled={loading}
                            title="Borrar comentario"
                          >
                            🗑️
                          </button>
                        )}
                        <button
                          className="btn small"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setEditingId(ev.id);
                          setEditComentario(ev.comentario || "");
                        }}
                        title="Clic para editar comentario"
                      >
                        {ev.comentario || "Sin comentario"}
                        <span style={{ marginLeft: 6, opacity: 0.5 }}>✏️</span>
                      </span>
                    )}
                  </div>
                  <div className="acciones">
                    <button
                      className="btn small danger"
                      onClick={async () => {
                        if (!confirm("Eliminar esta evidencia?")) return;
                        try {
                          await deleteEvidencia(ev.id);
                          await load();
                        } catch {
                          setError("No se pudo eliminar");
                        }
                      }}
                    >
                      Eliminar
                    </button>
                    <a
                      className="btn small"
                      href={ev.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir
                    </a>
                    <button
                      className="btn small"
                      onClick={async () => {
                        // Cargar conteo si aún no
                        if (normasCount[ev.id] === undefined) {
                          try {
                            const res = await listNormasRepoByEvidencia(ev.id);
                            setNormasCount((c) => ({
                              ...c,
                              [ev.id]: (res.items || []).length,
                            }));
                          } catch {}
                        }
                        setShowNormasFor(ev.id);
                      }}
                    >
                      Incumplimientos
                      {` (${normasCount[ev.id] ?? 0})`}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {showNormasFor !== null && (
        <EvidenciaNormasModal
          evidenciaId={showNormasFor}
          onClose={() => setShowNormasFor(null)}
          onUpdated={(count) =>
            setNormasCount((c) => ({ ...c, [showNormasFor]: count }))
          }
        />
      )}
    </div>
  );
}
