import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Evidencia,
  getEvidencias,
  uploadEvidencia,
  deleteEvidencia,
  updateEvidencia,
  reorderEvidencias,
} from "../services/evidencias";
import { type Tarea } from "../services/tareas";
import "../css/EvidenciasPanel.css";
import ImageWithFallback from "./ImageWithFallback";
import EvidenciaNormasModal from "./EvidenciaNormasModal";
import EvidenciaAbrirModal from "./EvidenciaAbrirModal";
import Icon from "./Icon";
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
  const [openAbrirEvidencia, setOpenAbrirEvidencia] = useState<Evidencia | null>(null);
  const [normasCount, setNormasCount] = useState<Record<number, number>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editComentario, setEditComentario] = useState("");
  const [savingComentarioId, setSavingComentarioId] = useState<number | null>(
    null,
  );
  const [confirmDeleteComentarioId, setConfirmDeleteComentarioId] = useState<
    number | null
  >(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [dropZoneInsertIndex, setDropZoneInsertIndex] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const comentarioInputRef = useRef<HTMLInputElement>(null);
  const draggedIdRef = useRef<number | null>(null);
  const dropTargetIdRef = useRef<number | null>(null);

  const tareasById = useMemo(
    () => Object.fromEntries((tareas || []).map((t) => [t.id, t])),
    [tareas],
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

  async function load(silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await getEvidencias({
        proyectoId,
        limit: 500,
        order: "recent",
      });
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
        }),
      );
      setNormasCount(counts);
    } catch (e: any) {
      if (!silent) setError(e?.message || "Error al cargar evidencias");
    } finally {
      if (!silent) setLoading(false);
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
            limit: 500,
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
        e?.detail || e?.error || e?.message || "Error al subir evidencia",
      );
    } finally {
      setLoading(false);
    }
  }

  function restoreFocusToForm() {
    setTimeout(() => {
      comentarioInputRef.current?.focus();
    }, 100);
  }

  async function handleSaveComentario(evidenciaId: number) {
    try {
      setSavingComentarioId(evidenciaId);
      setError(null);
      await updateEvidencia(evidenciaId, {
        comentario: editComentario.trim() || undefined,
      });
      setEditingId(null);
      setEditComentario("");
      await load(true);
    } catch (e: any) {
      setError(
        e?.detail || e?.error || e?.message || "Error al actualizar comentario",
      );
    } finally {
      setSavingComentarioId(null);
      restoreFocusToForm();
    }
  }

  function askDeleteComentario(evidenciaId: number) {
    setConfirmDeleteComentarioId(evidenciaId);
  }

  async function confirmDeleteComentario() {
    const evidenciaId = confirmDeleteComentarioId;
    if (evidenciaId == null) return;
    setConfirmDeleteComentarioId(null);
    try {
      setSavingComentarioId(evidenciaId);
      setError(null);
      await updateEvidencia(evidenciaId, { comentario: "" });
      setEditingId(null);
      setEditComentario("");
      await load(true);
    } catch (e: any) {
      setError(
        e?.detail || e?.error || e?.message || "Error al borrar comentario",
      );
    } finally {
      setSavingComentarioId(null);
      restoreFocusToForm();
    }
  }

  function handleDragStart(e: React.DragEvent, evId: number) {
    setDraggedId(evId);
    draggedIdRef.current = evId;
    e.dataTransfer.setData("text/plain", String(evId));
    e.dataTransfer.effectAllowed = "move";
    try {
      const img = new Image();
      img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      img.width = 1;
      img.height = 1;
      e.dataTransfer.setDragImage(img, 0, 0);
    } catch {
      // ignorar si setDragImage falla
    }
    if (typeof window !== "undefined" && (window as any).__logDrop) {
      console.log("[Evidencias] dragStart evId:", evId);
    }
  }

  function handleDragOver(e: React.DragEvent, evId: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    dropTargetIdRef.current = evId;
    setDropTargetId(evId);
  }

  function handleDragLeave() {
    setDropTargetId(null);
  }

  /** Inserta la evidencia arrastrada en la posición insertAtIndex (0 = primera, 1 = entre 1.ª y 2.ª, etc.). */
  function handleDropAtPosition(e: React.DragEvent, insertAtIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    setDropZoneInsertIndex(null);
    setDraggedId(null);
    const draggedEvId = draggedIdRef.current ?? (e.dataTransfer.getData("text/plain") ? Number(e.dataTransfer.getData("text/plain")) : null);
    draggedIdRef.current = null;
    dropTargetIdRef.current = null;
    if (draggedEvId == null || !proyectoId) return;
    const dId = Number(draggedEvId);
    const fromIndex = items.findIndex((i) => Number(i.id) === dId);
    if (fromIndex === -1) return;
    // No hacer nada si soltamos en la misma posición (antes o después del mismo ítem).
    if (insertAtIndex === fromIndex || insertAtIndex === fromIndex + 1) return;
    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    const insertIndex = fromIndex < insertAtIndex ? insertAtIndex - 1 : insertAtIndex;
    reordered.splice(insertIndex, 0, moved);
    setItems(reordered);
    (async () => {
      try {
        setError(null);
        const orderedIds = reordered.slice().reverse().map((i) => i.id);
        await reorderEvidencias(proyectoId, orderedIds);
        setSuccessMsg("Orden guardado. El PDF usará este orden al exportar.");
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err: any) {
        setError(
          err?.detail ||
            err?.error ||
            err?.message ||
            "Error al guardar el orden",
        );
      }
    })();
  }

  /** Al soltar sobre otra tarjeta: intercambiar las dos evidencias. */
  function handleDrop(e: React.DragEvent, targetEvId: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);
    setDropZoneInsertIndex(null);
    setDraggedId(null);
    const draggedEvId = draggedIdRef.current ?? (e.dataTransfer.getData("text/plain") ? Number(e.dataTransfer.getData("text/plain")) : null);
    draggedIdRef.current = null;
    dropTargetIdRef.current = null;
    if (draggedEvId == null || !proyectoId) return;
    if (targetEvId === draggedEvId) return;
    const dId = Number(draggedEvId);
    const tId = Number(targetEvId);
    const fromIndex = items.findIndex((i) => Number(i.id) === dId);
    const toIndex = items.findIndex((i) => Number(i.id) === tId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...items];
    reordered[fromIndex] = items[toIndex];
    reordered[toIndex] = items[fromIndex];
    setItems(reordered);
    (async () => {
      try {
        setError(null);
        const orderedIds = reordered.slice().reverse().map((i) => i.id);
        await reorderEvidencias(proyectoId, orderedIds);
        setSuccessMsg("Orden guardado. El PDF usará este orden al exportar.");
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err: any) {
        setError(
          err?.detail ||
            err?.error ||
            err?.message ||
            "Error al guardar el orden",
        );
      }
    })();
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDropTargetId(null);
    setDropZoneInsertIndex(null);
    draggedIdRef.current = null;
    dropTargetIdRef.current = null;
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
            ref={comentarioInputRef}
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
         Sube imágenes individualmente. Arrastra una tarjeta: suéltala en el espacio entre dos evidencias para insertarla ahí, o sobre otra tarjeta para intercambiarlas (el orden se aplica en el reporte PDF).
        </div>
      </form>

      {/* Filtros eliminados */}

      {successMsg && <div className="success-message" style={{ marginTop: 8, color: "var(--success, #0a0)" }}>{successMsg}</div>}
      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div>Cargando...</div>
      ) : (
        <div
          className="evidencias-grid"
          style={{ marginTop: 12 }}
          onDragOver={(e) => e.preventDefault()}
        >
          {items.length === 0 ? (
            <div className="empty-state">No hay evidencias</div>
          ) : (
            <>
              {(() => {
                const cells: React.ReactNode[] = [];
                items.forEach((ev, index) => {
                  cells.push(
                    <div
                      key={`zone-${index}`}
                      className={`evidencia-drop-zone evidencia-drop-zone--between ${dropZoneInsertIndex === index ? "evidencia-drop-zone--active" : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDropZoneInsertIndex(index);
                      }}
                      onDragLeave={() => setDropZoneInsertIndex(null)}
                      onDrop={(e) => handleDropAtPosition(e, index)}
                      title="Soltar aquí para insertar entre evidencias"
                    />
                  );
                  cells.push(
                    <div
                      key={ev.id}
                      data-evidencia-id={ev.id}
                      className={`evidencia-card ${dropTargetId === ev.id ? "evidencia-card--drop-target" : ""} ${draggedId === ev.id ? "evidencia-card--dragging" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, ev.id)}
                      onDragOver={(e) => handleDragOver(e, ev.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, ev.id)}
                      onDragEnd={handleDragEnd}
                    >
                <div className="evidencia-thumb">
                  {ev.imageUrl ? (
<ImageWithFallback
                    src={ev.imageUrl}
                    alt={ev.comentario || "foto"}
                    placeholder={IMG_PLACEHOLDER}
                    preferIpc={true}
                    draggable={false}
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
                          disabled={savingComentarioId !== null}
                        >
                          Guardar
                        </button>
                        {ev.comentario && (
                          <button
                            className="btn small danger"
                            onClick={() => askDeleteComentario(ev.id)}
                            disabled={savingComentarioId !== null}
                            title="Borrar comentario"
                          >
                            <Icon name="delete" size={18} />
                          </button>
                        )}
                        <button
                          className="btn small"
                          onClick={() => setEditingId(null)}
                          disabled={savingComentarioId !== null}
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
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setOpenAbrirEvidencia(ev)}
                    >
                      Abrir
                    </button>
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
                  );
                });
                cells.push(
                  <div
                    key="zone-last"
                    className={`evidencia-drop-zone evidencia-drop-zone--between evidencia-drop-zone--last ${dropZoneInsertIndex === items.length ? "evidencia-drop-zone--active" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropZoneInsertIndex(items.length);
                    }}
                    onDragLeave={() => setDropZoneInsertIndex(null)}
                    onDrop={(e) => handleDropAtPosition(e, items.length)}
                    title="Soltar aquí para insertar al final"
                  />
                );
                return cells;
              })()}
            </>
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

      {openAbrirEvidencia !== null && (
        <EvidenciaAbrirModal
          evidencia={{
            id: openAbrirEvidencia.id,
            imageUrl: openAbrirEvidencia.imageUrl,
            comentario: openAbrirEvidencia.comentario,
          }}
          onClose={() => setOpenAbrirEvidencia(null)}
        />
      )}

      {confirmDeleteComentarioId !== null && (
        <div
          className="modal-backdrop"
          onClick={() =>
            !savingComentarioId && setConfirmDeleteComentarioId(null)
          }
        >
          <div
            className="modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">Eliminar comentario</div>
              <button
                type="button"
                className="close"
                onClick={() =>
                  !savingComentarioId && setConfirmDeleteComentarioId(null)
                }
                disabled={savingComentarioId !== null}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Eliminar el comentario de esta evidencia?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmDeleteComentarioId(null)}
                disabled={savingComentarioId !== null}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => void confirmDeleteComentario()}
                disabled={savingComentarioId !== null}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
