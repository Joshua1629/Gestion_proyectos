import { useEffect, useMemo, useState } from 'react';
import {
  type Categoria,
  type Evidencia,
  type EvidenciaNormaRepoLink,
  getEvidencias,
  uploadEvidenciasMultiple,
  uploadEvidencia,
  listNormasRepoByEvidencia,
  attachNormaRepoToEvidencia,
  detachNormaRepoFromEvidencia,
  deleteEvidencia
} from '../services/evidencias';
import { listNormasRepo, type NormaRepoItem } from '../services/normasRepo';
import { type Tarea } from '../services/tareas';
import '../css/EvidenciasPanel.css';

// Items mostrados en el picker provienen del repositorio de normas
// Usamos el tipo de servicio directamente para evitar incompatibilidades

export default function EvidenciasPanel({ proyectoId, tareas }: { proyectoId: number; tareas: Tarea[] }) {
  // Form / upload
  const [files, setFiles] = useState<File[]>([]);
  const [comentario, setComentario] = useState('');
  const [tareaId, setTareaId] = useState<number | ''>('');
  const [institucional, setInstitucional] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!(window as any).api?.getBinary;
  const IMG_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  // Data
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [filterTareaId, setFilterTareaId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Normas picker
  const [pickerOpenFor, setPickerOpenFor] = useState<number | null>(null); // evidenciaId
  const [pickerResults, setPickerResults] = useState<NormaRepoItem[]>([]);
  const [pickerSelected, setPickerSelected] = useState<Record<number, Categoria>>({});
  const [expandedEvidenciaId, setExpandedEvidenciaId] = useState<number | null>(null);
  const [normasByEvidencia, setNormasByEvidencia] = useState<Record<number, EvidenciaNormaRepoLink[]>>({});
  const [imgSrcById, setImgSrcById] = useState<Record<number, string>>({});

  const tareasById = useMemo(
    () => Object.fromEntries((tareas || []).map(t => [t.id, t])),
    [tareas]
  );

  function normalizeImageUrl(url?: string | null) {
    if (!url) return '';
    // Usar la misma base que los servicios: default a 3001 si no hay VITE_API_URL
    const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
    const uploadsIdx = url.indexOf('/uploads/');
    if (uploadsIdx >= 0) {
      const tail = url.slice(uploadsIdx);
      return `${base}${tail}`;
    }
    if (/^https?:\/\//i.test(url)) return url; // otras absolutas
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getEvidencias({ proyectoId, tareaId: filterTareaId || undefined, limit: 100 });
      const items: Evidencia[] = (res.items || []).map((e: Evidencia) => ({ ...e, imageUrl: normalizeImageUrl(e.imageUrl) }));
      setEvidencias(items);
      // En Electron: precargar por canal binario y evitar solicitar la URL directa desde el renderer
      if (isElectron) {
        for (const ev of items) {
          if (!ev.imageUrl || imgSrcById[ev.id]) continue;
          void loadImageBinary(ev.id, ev.imageUrl);
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Error al cargar evidencias');
    } finally {
      setLoading(false);
    }
  }

  async function loadImageBinary(id: number, url: string) {
    try {
      const api: any = (window as any).api;
      if (api && typeof api.getBinary === 'function') {
        const r = await api.getBinary(url);
        if (r && r.ok && r.dataUrl) {
          setImgSrcById(prev => ({ ...prev, [id]: r.dataUrl as string }));
          return;
        }
      }
      // fallback: usar URL directa si no hay API o falló
      setImgSrcById(prev => ({ ...prev, [id]: url }));
    } catch {
      setImgSrcById(prev => ({ ...prev, [id]: url }));
    }
  }

  useEffect(() => { void load(); }, [proyectoId, filterTareaId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError('Selecciona al menos una imagen');
      return;
    }
    try {
      setLoading(true);
      const commentFinal = (institucional ? '[INSTITUCION] ' : '') + (comentario.trim() || '');
      const tId = tareaId === '' ? undefined : Number(tareaId);
      if (files.length > 1) {
        await uploadEvidenciasMultiple({ files, proyectoId, tareaId: tId, comentario: commentFinal || undefined });
      } else {
        await uploadEvidencia({ file: files[0], proyectoId, tareaId: tId, comentario: commentFinal || undefined });
      }
      setFiles([]);
      setComentario('');
      setTareaId('');
      setInstitucional(false);
      await load();
    } catch (e: any) {
      const msg = e?.detail || e?.error || e?.statusText || e?.message || 'Error al subir evidencia';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  async function openPicker(evidenciaId: number) {
    setPickerOpenFor(evidenciaId);
    setPickerSelected({});
    try {
      const res = await listNormasRepo({ all: true, limit: 1500 });
      setPickerResults(res.items || []);
    } catch {/* ignoramos errores de carga masiva */}
    try {
      const r = await listNormasRepoByEvidencia(evidenciaId);
      setNormasByEvidencia(prev => ({ ...prev, [evidenciaId]: r.items || [] }));
    } catch {/* ignoramos errores de normas del grupo */}
  }

  async function applyNormasToEvidencia(evidenciaId: number) {
    const entries = Object.entries(pickerSelected) as Array<[string, Categoria]>;
    for (const [idStr, clasif] of entries) {
      const nid = Number(idStr);
      if (!nid || Number.isNaN(nid)) continue;
      try {
        await attachNormaRepoToEvidencia(evidenciaId, { normaRepoId: nid, clasificacion: clasif });
      } catch {/* ignoramos adjuntos individuales fallidos */}
    }
    setPickerOpenFor(null);
    // Refrescamos evidencias y la lista de normas si está expandido
    await load();
    try {
      const r = await listNormasRepoByEvidencia(evidenciaId);
      setNormasByEvidencia(prev => ({ ...prev, [evidenciaId]: r.items || [] }));
    } catch {}
  }

  async function toggleExpand(evidenciaId: number) {
    const next = expandedEvidenciaId === evidenciaId ? null : evidenciaId;
    setExpandedEvidenciaId(next);
    if (next) {
      try {
        const r = await listNormasRepoByEvidencia(next);
        setNormasByEvidencia(prev => ({ ...prev, [next]: r.items || [] }));
      } catch {/* ignoramos */}
    }
  }

  async function detachNorma(evidenciaId: number, normaId: number) {
    try {
      await detachNormaRepoFromEvidencia(evidenciaId, normaId);
    } catch {/* ignoramos error de detach */}
    try {
      const r = await listNormasRepoByEvidencia(evidenciaId);
      setNormasByEvidencia(prev => ({ ...prev, [evidenciaId]: r.items || [] }));
    } catch {}
  }

  return (
    <div className="evidencias-panel">
      <h3>📷 Evidencias fotográficas</h3>

      {/* Formulario de subida */}
      <form className="evidencia-uploader" onSubmit={handleUpload}>
        <div className="row">
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={e => setFiles(Array.from(e.target.files || []))}
          />
          <select
            value={tareaId as any}
            onChange={e => setTareaId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">Sin tarea</option>
            {(tareas || []).map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={institucional}
              onChange={e => setInstitucional(e.target.checked)}
            />
            <span className="muted small">Evidencia institucional (portada)</span>
          </label>
        </div>
        <div className="row">
          <input
            placeholder="Comentario (opcional)"
            value={comentario}
            onChange={e => setComentario(e.target.value)}
          />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              Subir
            </button>
        </div>
        <div className="muted xsmall" style={{ marginTop: 4 }}>
          Selecciona varias imágenes para crear una evidencia agrupada (grupo) con la misma tarea y comentario.
        </div>
      </form>

      {/* Filtros */}
      <div className="evidencias-filtros">
        <select
          value={filterTareaId as any}
          onChange={e => setFilterTareaId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Todas las tareas</option>
          {(tareas || []).map(t => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
        <button className="btn" onClick={() => setFilterTareaId('')}>
          Limpiar filtros
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Grid de evidencias */}
      {loading ? (
        <div>Cargando...</div>
      ) : (
        <div className="evidencias-grid">
          {evidencias.length === 0 ? (
            <div className="empty-state">No hay evidencias</div>
          ) : (
            evidencias.map(ev => {
              const first = isElectron ? (imgSrcById[ev.id] || IMG_PLACEHOLDER) : ev.imageUrl;
              return (
                <div className="evidencia-card" key={ev.id}>
                  <div
                    className="evidencia-thumb"
                    onClick={() => toggleExpand(ev.id)}
                    title="Ver detalles"
                  >
                    {first ? (
                      <img src={first} alt={ev.comentario || 'Evidencia'} />
                    ) : (
                      <div className="muted small" style={{ padding: 8 }}>
                        Sin imagen
                      </div>
                    )}
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
                    <div className="incumplimientos-section">
                      <div className="section-header">
                        <div className="section-title">
                          Incumplimientos <span className="chip">{(normasByEvidencia[ev.id]?.length) || 0}</span>
                        </div>
                        <button
                          className="btn xsmall"
                          onClick={() => openPicker(ev.id)}
                        >
                          + Añadir
                        </button>
                      </div>
                      {expandedEvidenciaId === ev.id && (
                        <div className="grupo-normas-list">
                          {(normasByEvidencia[ev.id] || []).length === 0 ? (
                            <div className="muted small">Sin normas asociadas</div>
                          ) : (
                            <ul className="incumpl-list">
                              {(normasByEvidencia[ev.id] || []).map(n => {
                                const c = (n.clasificacion || 'LEVE').toUpperCase();
                                const color =
                                  c === 'CRITICO'
                                    ? '#dc3545'
                                    : c === 'OK'
                                    ? '#28a745'
                                    : '#ffc107';
                                return (
                                  <li key={n.id} className="incumpl-row">
                                    <span
                                      className="severity-dot"
                                      style={{ backgroundColor: color }}
                                    />
                                    <div className="incumpl-text">
                                      <div className="line">
                                        <strong>
                                          {n.categoria ? `${n.categoria} · ` : ''}
                                        </strong>
                                        <span className="truncate">
                                          {n.titulo}
                                          {n.fuente ? (
                                            <span className="muted"> {`— ${n.fuente}`}</span>
                                          ) : null}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="incumpl-actions">
                                      <button
                                        className="btn xsmall"
                                        title="Quitar"
                                        onClick={() => detachNorma(ev.id, n.id)}
                                      >
                                        Quitar
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="acciones">
                      <button
                        className="btn small danger"
                        onClick={async () => {
                          if (!confirm('Eliminar este grupo de evidencias (todas las fotos)?')) return;
                          try {
                            await deleteEvidencia(ev.id);
                            // Limpiamos cache local de normas de la evidencia eliminada
                            setNormasByEvidencia(prev => {
                              const next = { ...prev };
                              delete next[ev.id];
                              return next;
                            });
                            await load();
                          } catch {
                            setError('Error eliminando grupo');
                          }
                        }}
                      >
                        Eliminar evidencia
                      </button>
                      <button
                        className="btn small"
                        onClick={() => toggleExpand(ev.id)}
                      >
                        {expandedEvidenciaId === ev.id ? 'Ocultar' : 'Ver normas'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal normas */}
      {pickerOpenFor !== null && (
        <div
          className="modal-backdrop"
          onClick={() => setPickerOpenFor(null)}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">Añadir incumplimientos a la evidencia</div>
              <button
                className="close"
                onClick={() => setPickerOpenFor(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="muted xsmall">
                Selecciona uno o más elementos y define su estado.
              </div>
              <div
                className="normas-table-wrapper"
                role="region"
                aria-label="Listado de normas"
              >
                <table
                  className="normas-table"
                  role="grid"
                  aria-readonly="true"
                >
                  <thead>
                    <tr>
                      <th className="col-select" aria-label="Seleccionar"></th>
                      <th className="col-estado">Estado</th>
                      <th className="col-categoria">Categoría</th>
                      <th className="col-descripcion">Descripción</th>
                      <th className="col-articulo">Artículo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickerResults.map(it => {
                      const selected = Object.prototype.hasOwnProperty.call(pickerSelected, it.id);
                      const estado: Categoria = (selected ? pickerSelected[it.id] : 'LEVE') as Categoria;
                      const color =
                        estado === 'CRITICO'
                          ? '#dc3545'
                          : estado === 'OK'
                          ? '#28a745'
                          : '#ffc107';
                      return (
                        <tr key={it.id} className={selected ? 'selected' : ''}>
                          <td className="col-select">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={e => {
                                setPickerSelected(prev => {
                                  const next = { ...prev } as Record<number, Categoria>;
                                  if (e.target.checked) next[it.id] = next[it.id] || 'LEVE';
                                  else delete next[it.id];
                                  return next;
                                });
                              }}
                              aria-label={`Seleccionar norma ${it.id}`}
                            />
                          </td>
                          <td className="col-estado">
                            <span
                              className="severity-dot"
                              style={{ backgroundColor: color }}
                            />
                            <select
                              className="link-clasificacion-select"
                              value={estado}
                              disabled={!selected}
                              onChange={e => {
                                const val = e.target.value as Categoria;
                                setPickerSelected(prev => ({ ...prev, [it.id]: val }));
                              }}
                              aria-label="Clasificación"
                            >
                              <option value="OK">OK</option>
                              <option value="LEVE">Leve</option>
                              <option value="CRITICO">Crítico</option>
                            </select>
                          </td>
                          <td className="col-categoria" title={it.categoria || ''}>
                            {it.categoria || '—'}
                          </td>
                          <td className="col-descripcion" title={it.descripcion || it.titulo || ''}>
                            <span className="multiline-clamp-6">
                              {it.descripcion || it.titulo || ''}
                            </span>
                          </td>
                          <td className="col-articulo" title={it.fuente || ''}>
                            {it.fuente || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                onClick={() => setPickerOpenFor(null)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={Object.keys(pickerSelected).length === 0}
                onClick={() => applyNormasToEvidencia(pickerOpenFor!)}
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