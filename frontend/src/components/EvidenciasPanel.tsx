import { useEffect, useMemo, useState } from "react";
import {
  type Categoria,
  type Evidencia,
  deleteEvidencia,
  getEvidencias,
  uploadEvidencia,
  listNormasRepoByEvidencia,
  attachNormaRepoToEvidencia,
  detachNormaRepoFromEvidencia,
  type EvidenciaNormaRepoLink,
} from "../services/evidencias";
import { listNormasRepo } from "../services/normasRepo";
import { type Tarea } from "../services/tareas";
import "../css/EvidenciasPanel.css";

export default function EvidenciasPanel({
  proyectoId,
  tareas,
}: {
  proyectoId: number;
  tareas: Tarea[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [comentario, setComentario] = useState("");
  const [tareaId, setTareaId] = useState<number | "">("");
  const [items, setItems] = useState<Evidencia[]>([]);
  const [filterTareaId, setFilterTareaId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataUrls, setDataUrls] = useState<Record<number, string>>({});
  const [linksByEvid, setLinksByEvid] = useState<Record<number, EvidenciaNormaRepoLink[]>>({});
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickerResults, setPickerResults] = useState<any[]>([]);
  // buscador removido: mantenemos el estado simple
  // Selecciones del modal: mapa normaId -> estado individual
  const [pickerSelected, setPickerSelected] = useState<Record<number, Categoria>>({});

  const tareasById = useMemo(
    () => Object.fromEntries((tareas || []).map((t) => [t.id, t])),
    [tareas]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getEvidencias({
        proyectoId,
        tareaId: filterTareaId || undefined,
        page: 1,
        limit: 50,
      });
      setItems(res.items || []);
      // cargar asociaciones de normas para cada evidencia
      try {
        const pairs = await Promise.all(
          (res.items || []).map(async (ev: any) => {
            try {
              const r = await listNormasRepoByEvidencia(ev.id);
              return [ev.id, r.items || []] as const;
            } catch {
              return [ev.id, []] as const;
            }
          })
        );
        const map: Record<number, EvidenciaNormaRepoLink[]> = {};
        for (const p of pairs) map[p[0]] = p[1];
        setLinksByEvid(map);
      } catch {}
      // Prefetch imágenes como dataURL vía IPC para evitar problemas de red del renderer
      try {
        const api: any = (globalThis as any).api;
        if (
          api &&
          typeof api.getBinary === "function" &&
          Array.isArray(res.items)
        ) {
          const base = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001";
          const pairs = await Promise.all(
            res.items.slice(0, 50).map(async (ev: any) => {
              const resolved =
                ev.imageUrl && /^https?:\/\//i.test(ev.imageUrl)
                  ? ev.imageUrl
                  : new URL(ev.imageUrl || "/", base).toString();
              try {
                const r = await api.getBinary(resolved);
                if (r && r.ok && r.dataUrl) return [ev.id, r.dataUrl] as const;
              } catch {}
              return null;
            })
          );
          const map: Record<number, string> = {};
          for (const p of pairs) if (p) map[p[0]] = p[1];
          if (Object.keys(map).length)
            setDataUrls((prev) => ({ ...prev, ...map }));
        }
      } catch {}
    } catch (e: any) {
      setError(e?.message || "Error al cargar evidencias");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [proyectoId, filterTareaId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecciona una imagen");
      return;
    }
    try {
      setLoading(true);
      await uploadEvidencia({
        file,
        proyectoId,
        tareaId: tareaId === "" ? undefined : Number(tareaId),
        comentario: comentario.trim() || undefined,
      });
      setFile(null);
      setComentario("");
      setTareaId("");
      await load();
    } catch (e: any) {
      const msg =
        e?.detail ||
        e?.error ||
        e?.statusText ||
        e?.message ||
        "Error al subir evidencia";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="evidencias-panel">
      <h3>📷 Evidencias fotográficas</h3>

      <form className="evidencia-uploader" onSubmit={handleUpload}>
        <div className="row">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
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
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Subir
          </button>
        </div>
      </form>

      <div className="evidencias-filtros">
        <select
          value={filterTareaId as any}
          onChange={(e) =>
            setFilterTareaId(
              e.target.value === "" ? "" : Number(e.target.value)
            )
          }
        >
          <option value="">Todas las tareas</option>
          {(tareas || []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            setFilterTareaId("");
          }}
        >
          Limpiar filtros
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div>Cargando...</div>
      ) : (
        <div className="evidencias-grid">
          {items.length === 0 ? (
            <div className="empty-state">No hay evidencias</div>
          ) : (
            items.map((ev) => (
              <div className={`evidencia-card`} key={ev.id}>
                <div className="evidencia-thumb">
                  {/* imageUrl puede ser relativo o absoluto; resolvemos de forma robusta con fallback a dataURL vía IPC */}
                  {(() => {
                    const base =
                      import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001";
                    const resolved =
                      ev.imageUrl && /^https?:\/\//i.test(ev.imageUrl)
                        ? ev.imageUrl
                        : new URL(ev.imageUrl || "/", base).toString();
                    const src = dataUrls[ev.id] || resolved;
                    return (
                      <img
                        src={src}
                        alt={ev.comentario || `Evidencia ${ev.id}`}
                        onError={async () => {
                          try {
                            const api: any = (globalThis as any).api;
                            if (api && typeof api.getBinary === "function") {
                              const r = await api.getBinary(resolved);
                              if (r && r.ok && r.dataUrl) {
                                setDataUrls((prev) => ({
                                  ...prev,
                                  [ev.id]: r.dataUrl,
                                }));
                              }
                            }
                          } catch {
                            /* noop */
                          }
                        }}
                      />
                    );
                  })()}
                </div>
                <div className="evidencia-meta">
                  {ev.tareaId && (
                    <div className="tarea-ref">
                      Tarea: {tareasById[ev.tareaId]?.nombre || ev.tareaId}
                    </div>
                  )}
                  {ev.comentario && (
                    <div className="comentario">{ev.comentario}</div>
                  )}
                  {/* Sección de Incumplimientos */}
                  <div className="incumplimientos-section">
                    <div className="section-header">
                      <div className="section-title">
                        Incumplimientos
                        <span className="chip">
                          {(linksByEvid[ev.id] || []).length}
                        </span>
                      </div>
                      <button
                        className="btn xsmall"
                        onClick={async () => {
                          setPickerFor(ev.id);
                          setPickerResults([]);
                          setPickerSelected({});
                          try {
                            const res = await listNormasRepo({ all: true, limit: 2000 });
                            setPickerResults(res.items || []);
                          } catch {}
                        }}
                      >
                        + Añadir
                      </button>
                    </div>
                    {(linksByEvid[ev.id] || []).length === 0 ? (
                      <div className="muted small">Sin normas asociadas</div>
                    ) : (
                      <ul className="incumpl-list">
                        {(linksByEvid[ev.id] || []).map((l) => (
                          <li key={l.id} className="incumpl-row">
                            {(() => {
                              const c = (l.clasificacion || 'LEVE').toUpperCase();
                              const color = c === 'CRITICO' ? '#dc3545' : c === 'OK' ? '#28a745' : '#ffc107';
                              return <span className="severity-dot" style={{ backgroundColor: color }} />
                            })()}
                            <div className="incumpl-text">
                              <div className="line">
                                <strong>{l.categoria ? `${l.categoria} · ` : ''}</strong>
                                <span className="truncate">{l.titulo}{l.fuente ? <span className="muted"> {`— ${l.fuente}`}</span> : null}</span>
                              </div>
                            </div>
                            <div className="incumpl-actions">
                              <select
                                className="link-clasificacion-select"
                                value={(l.clasificacion || 'LEVE') as Categoria}
                                onChange={async (e) => {
                                  await attachNormaRepoToEvidencia(ev.id, { normaRepoId: l.id, clasificacion: e.target.value as Categoria });
                                  await load();
                                }}
                              >
                                <option value="OK">OK</option>
                                <option value="LEVE">Leve</option>
                                <option value="CRITICO">Crítico</option>
                              </select>
                              <button
                                className="btn xsmall"
                                title="Quitar"
                                onClick={async () => {
                                  await detachNormaRepoFromEvidencia(ev.id, l.id);
                                  await load();
                                }}
                              >
                                Quitar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="acciones">
                    <button
                      className="btn small danger"
                      onClick={async () => {
                        if (!confirm("Eliminar evidencia?")) return;
                        try {
                          await deleteEvidencia(ev.id);
                          await load();
                        } catch {
                          setError("Error eliminando evidencia");
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {/* Modal para asociar incumplimiento/norma */}
      {pickerFor !== null && (
        <div className="modal-backdrop" onClick={() => setPickerFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Añadir incumplimiento</div>
              <button className="close" onClick={() => setPickerFor(null)} aria-label="Cerrar">×</button>
            </div>
            <div className="modal-body">
              <div className="muted xsmall">Selecciona una o más normas y define su estado individual.</div>
              <div className="normas-list" role="listbox" aria-multiselectable="true">
                {pickerResults.map((it: any) => {
                  const selected = Object.prototype.hasOwnProperty.call(pickerSelected, it.id);
                  const estado: Categoria = (selected ? pickerSelected[it.id] : 'LEVE') as Categoria;
                  const color = (estado === 'CRITICO') ? '#dc3545' : (estado === 'OK') ? '#28a745' : '#ffc107';
                  return (
                    <div key={it.id} className={`norma-item${selected ? ' selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          setPickerSelected(prev => {
                            const next = { ...prev } as Record<number, Categoria>;
                            if (e.target.checked) next[it.id] = next[it.id] || 'LEVE'; else delete next[it.id];
                            return next;
                          });
                        }}
                      />
                      <span className="severity-dot" style={{ backgroundColor: color }} />
                      {it.categoria ? <span className="norma-cat">{it.categoria}</span> : null}
                      <span className="norma-title">{(it.descripcion || it.titulo || '').slice(0, 180)}</span>
                      {it.fuente ? <span className="norma-src"> — {it.fuente}</span> : null}
                      <select
                        className="link-clasificacion-select"
                        value={estado}
                        disabled={!selected}
                        onChange={(e) => {
                          const val = e.target.value as Categoria;
                          setPickerSelected(prev => ({ ...prev, [it.id]: val }));
                        }}
                      >
                        <option value="OK">OK</option>
                        <option value="LEVE">Leve</option>
                        <option value="CRITICO">Crítico</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPickerFor(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={Object.keys(pickerSelected).length === 0}
                onClick={async () => {
                  const entries = Object.entries(pickerSelected) as Array<[string, Categoria]>;
                  for (const [idStr, clasif] of entries) {
                    const nid = Number(idStr);
                    if (!nid || Number.isNaN(nid)) continue;
                    await attachNormaRepoToEvidencia(pickerFor as number, { normaRepoId: nid, clasificacion: clasif });
                  }
                  setPickerFor(null);
                  await load();
                }}
              >
                Asociar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
