import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Evidencia,
  getEvidencias,
  uploadEvidencia,
  deleteEvidencia,
  updateEvidencia,
  reorderEvidencias,
  addComentarioEvidencia,
  updateComentarioEvidencia,
  deleteComentarioEvidencia,
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
  const [comentariosPanelEvidencia, setComentariosPanelEvidencia] = useState<Evidencia | null>(null);
  const [deleteComentarioConfirm, setDeleteComentarioConfirm] = useState<{
    evidenciaId: number;
    comentarioId: number;
  } | null>(null);
  const [editingComentario, setEditingComentario] = useState<{
    evidenciaId: number;
    comentarioId: number;
    text: string;
  } | null>(null);
  const [editComentario, setEditComentario] = useState("");
  const [savingComentarioId, setSavingComentarioId] = useState<number | null>(
    null,
  );
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

  async function load(silent = false): Promise<Evidencia[]> {
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
      return list;
    } catch (e: any) {
      if (!silent) setError(e?.message || "Error al cargar evidencias");
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [proyectoId]);

  // Bloquear scroll del fondo cuando cualquier modal/panel está abierto (Comentarios o Ver evidencia)
  useEffect(() => {
    if (comentariosPanelEvidencia !== null || openAbrirEvidencia !== null) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [comentariosPanelEvidencia, openAbrirEvidencia]);

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

  async function handleAddComentario(evidenciaId: number) {
    const text = editComentario.trim();
    if (!text) return;
    try {
      setError(null);
      setSavingComentarioId(evidenciaId);
      await addComentarioEvidencia(evidenciaId, text);
      setEditComentario("");
      const list = await load(true);
      setComentariosPanelEvidencia((prev) => (prev?.id === evidenciaId ? (list.find((e) => e.id === evidenciaId) ?? prev) : prev));
    } catch (e: any) {
      setError(
        e?.detail || e?.error || e?.message || "Error al agregar comentario",
      );
    } finally {
      setSavingComentarioId(null);
    }
  }

  function handleStartEditComentario(evidenciaId: number, comentarioId: number, text: string) {
    setEditingComentario({ evidenciaId, comentarioId, text });
  }

  function handleCancelEditComentario() {
    setEditingComentario(null);
  }

  async function handleSaveEditComentario() {
    if (!editingComentario || !editingComentario.text.trim()) return;
    const { evidenciaId, comentarioId, text } = editingComentario;
    try {
      setError(null);
      setSavingComentarioId(evidenciaId);
      await updateComentarioEvidencia(evidenciaId, comentarioId, text);
      setEditingComentario(null);
      const list = await load(true);
      setComentariosPanelEvidencia((prev) => (prev?.id === evidenciaId ? (list.find((e) => e.id === evidenciaId) ?? null) : prev));
    } catch (e: any) {
      setError(
        e?.detail || e?.error || e?.message || "Error al actualizar comentario",
      );
    } finally {
      setSavingComentarioId(null);
    }
  }

  function handleDeleteComentario(evidenciaId: number, comentarioId: number) {
    setDeleteComentarioConfirm({ evidenciaId, comentarioId });
  }

  async function doDeleteComentario(evidenciaId: number, comentarioId: number) {
    try {
      setError(null);
      setDeleteComentarioConfirm(null);
      setSavingComentarioId(evidenciaId);
      await deleteComentarioEvidencia(evidenciaId, comentarioId);
      const list = await load(true);
      setComentariosPanelEvidencia((prev) => (prev?.id === evidenciaId ? (list.find((e) => e.id === evidenciaId) ?? null) : prev));
    } catch (e: any) {
      setError(
        e?.detail || e?.error || e?.message || "Error al eliminar comentario",
      );
    } finally {
      setSavingComentarioId(null);
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
                    <div className="acciones-col-comentarios-incumplimientos" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => setComentariosPanelEvidencia(ev)}
                        title="Ver y gestionar comentarios"
                        aria-label={
                          (() => {
                            const n = ev.comentarios?.length ?? (ev.comentario ? 1 : 0);
                            return n ? `Comentarios (${n})` : "Sin comentarios";
                          })()
                        }
                      >
                        <Icon name="comment" size={14} />
                        {(() => {
                          const n = ev.comentarios?.length ?? (ev.comentario ? 1 : 0);
                          return n ? ` Comentarios (${n})` : " Comentarios";
                        })()}
                      </button>
                      <button
                        className="btn small"
                        onClick={async () => {
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
            comentarios: openAbrirEvidencia.comentarios,
          }}
          onClose={() => setOpenAbrirEvidencia(null)}
        />
      )}

      {comentariosPanelEvidencia !== null && (
        <div
          className="modal-backdrop"
          role="presentation"
        >
          <div
            className="modal panel-comentarios"
            style={{ maxWidth: 540, minWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="panel-comentarios-title"
          >
            <div className="modal-header">
              <div className="modal-title" id="panel-comentarios-title">
                Comentarios
              </div>
              <button
                type="button"
                className="close"
                onClick={() => !savingComentarioId && setComentariosPanelEvidencia(null)}
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto", position: "relative" }}>
              {deleteComentarioConfirm !== null && (
                <div
                  className="modal-backdrop"
                  style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="confirm-delete-comentario-title"
                >
                  <div
                    className="modal"
                    style={{ maxWidth: 320 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="modal-body">
                      <p id="confirm-delete-comentario-title" style={{ margin: 0 }}>
                        ¿Eliminar este comentario?
                      </p>
                    </div>
                    <div className="modal-footer" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setDeleteComentarioConfirm(null)}
                        disabled={savingComentarioId !== null}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => doDeleteComentario(deleteComentarioConfirm.evidenciaId, deleteComentarioConfirm.comentarioId)}
                        disabled={savingComentarioId !== null}
                      >
                        Aceptar
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {(() => {
                const ev = comentariosPanelEvidencia;
                const lista = ev.comentarios?.length ? ev.comentarios : ev.comentario ? [{ id: null, comentario: ev.comentario }] : [];
                return (
                  <>
                    {lista.length > 0 ? (
                      <ul className="lista-comentarios-panel">
                        {lista.map((c, i) => {
                          const isEditing = editingComentario?.comentarioId === c.id && editingComentario?.evidenciaId === ev.id;
                          const commentText = (c as { comentario?: string }).comentario ?? "";
                          return (
                            <li key={c.id ?? `legacy-${i}`}>
                              {isEditing ? (
                                <>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={editingComentario.text}
                                    onChange={(e) => setEditingComentario((prev) => prev ? { ...prev, text: e.target.value } : null)}
                                    style={{ flex: 1, minWidth: 0, padding: "6px 8px", fontSize: 13 }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveEditComentario();
                                      if (e.key === "Escape") handleCancelEditComentario();
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    className="btn small"
                                    style={{ padding: "2px 8px", minHeight: "auto", flexShrink: 0 }}
                                    onClick={() => handleSaveEditComentario()}
                                    disabled={savingComentarioId !== null || !editingComentario.text.trim()}
                                    title="Guardar"
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn small"
                                    style={{ padding: "2px 8px", minHeight: "auto", flexShrink: 0 }}
                                    onClick={() => handleCancelEditComentario()}
                                    disabled={savingComentarioId !== null}
                                    title="Cancelar"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span style={{ flex: 1 }}>{commentText}</span>
                                  {c.id != null && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn small"
                                        style={{ padding: "2px 6px", minHeight: "auto", flexShrink: 0 }}
                                        onClick={() => handleStartEditComentario(ev.id, c.id as number, commentText)}
                                        disabled={savingComentarioId !== null}
                                        title="Editar comentario"
                                        aria-label="Editar comentario"
                                      >
                                        <Icon name="edit" size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn small danger"
                                        style={{ padding: "2px 6px", minHeight: "auto", flexShrink: 0 }}
                                        onClick={() => handleDeleteComentario(ev.id, c.id as number)}
                                        disabled={savingComentarioId !== null}
                                        title="Eliminar comentario"
                                        aria-label="Eliminar comentario"
                                      >
                                        <Icon name="delete" size={14} />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="muted small" style={{ margin: "0 0 12px 0" }}>Sin comentarios.</p>
                    )}
                    <div className="edit-comentario-form" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        value={editComentario}
                        onChange={(e) => setEditComentario(e.target.value)}
                        placeholder="Agregar comentario..."
                        style={{ flex: 1, minWidth: 160 }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddComentario(ev.id);
                          } else if (e.key === "Escape") {
                            setComentariosPanelEvidencia(null);
                          }
                        }}
                      />
                      <button
                        className="btn small"
                        onClick={() => handleAddComentario(ev.id)}
                        disabled={savingComentarioId !== null || !editComentario.trim()}
                      >
                        Agregar
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setComentariosPanelEvidencia(null)}
                disabled={savingComentarioId !== null}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
