import { useEffect, useMemo, useState } from 'react';
import {
  type Categoria,
  type Evidencia,
  type EvidenciaNormaRepoLink,
  getEvidenciasByTipo,
  uploadEvidenciasMultiple,
  uploadEvidencia,
  listNormasRepoByGroup,
  attachNormaRepoToGroup,
  detachNormaRepoFromGroup,
  deleteEvidenciaGroup,
  listEvidenciasByGroup,
  deleteEvidencia
} from '../services/evidencias';
import { listNormasRepo, type NormaRepoItem } from '../services/normasRepo';
import { type Tarea } from '../services/tareas';
import '../css/EvidenciasPanel.css';
import ImageWithFallback from './ImageWithFallback';

type Group = { groupKey: string; proyectoId: number; tareaId?: number | null; comentario?: string | null; images: string[]; count: number; normasCount?: number; tipo?: string };
type TipoGroups = { tipo: string; groups: Group[] };

export default function EvidenciasPanel({ proyectoId, tareas }: { proyectoId: number; tareas: Tarea[] }) {
  // Form / upload
  const [files, setFiles] = useState<File[]>([]);
  const [comentario, setComentario] = useState('');
  const [tareaId, setTareaId] = useState<number | ''>('');
  const IMG_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' as const;

  // Data agrupada
  const [byTipo, setByTipo] = useState<TipoGroups[]>([]);
  // Filtros eliminados: siempre se muestran todas las evidencias del proyecto
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group detail state
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [groupItems, setGroupItems] = useState<Evidencia[]>([]);
  const [groupNormas, setGroupNormas] = useState<EvidenciaNormaRepoLink[]>([]);

  // Picker
  const [pickerOpenForGroup, setPickerOpenForGroup] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<NormaRepoItem[]>([]);
  const [pickerSelected, setPickerSelected] = useState<Record<number, Categoria>>({});

  const tareasById = useMemo(() => Object.fromEntries((tareas || []).map(t => [t.id, t])), [tareas]);

  function normalizeImageUrl(url?: string | null) {
    if (!url) return '';
    const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
    const uploadsIdx = url.indexOf('/uploads/');
    if (uploadsIdx >= 0) return `${base}${url.slice(uploadsIdx)}`;
    if (/^https?:\/\//i.test(url)) return url;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await getEvidenciasByTipo({ proyectoId });
      const items: TipoGroups[] = (res.items || []).map((t: any) => ({
        tipo: t.tipo,
        groups: (t.groups || []).map((g: any) => ({ ...g, images: (g.images || []).map((u: string) => normalizeImageUrl(u)) }))
      }));
      setByTipo(items);
    } catch (e: any) { setError(e?.message || 'Error al cargar evidencias'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [proyectoId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) { setError('Selecciona al menos una imagen'); return; }
    try {
      setLoading(true);
      const tId = tareaId === '' ? undefined : Number(tareaId);
      const commentFinal = comentario.trim() || '';

      // Subir en grupos de máximo 3 imágenes para que el backend genere grupos pequeños
      const chunkSize = 3;
      if (files.length === 1) {
        await uploadEvidencia({ file: files[0], proyectoId, tareaId: tId, comentario: commentFinal || undefined, tipo: undefined });
      } else {
        for (let i = 0; i < files.length; i += chunkSize) {
          const slice = files.slice(i, i + chunkSize);
            if (slice.length === 1) {
              await uploadEvidencia({ file: slice[0], proyectoId, tareaId: tId, comentario: commentFinal || undefined, tipo: undefined });
            } else {
              await uploadEvidenciasMultiple({ files: slice, proyectoId, tareaId: tId, comentario: commentFinal || undefined, tipo: undefined });
            }
        }
      }
      setFiles([]); setComentario(''); setTareaId('');
      await load();
    } catch (e: any) { setError(e?.detail || e?.error || e?.message || 'Error al subir evidencia'); }
    finally { setLoading(false); }
  }

  async function openGroup(groupKey: string) {
    setOpenGroupKey(groupKey);
    try {
      const [itemsRes, normasRes] = await Promise.all([
        listEvidenciasByGroup(groupKey),
        listNormasRepoByGroup(groupKey)
      ]);
      setGroupItems((itemsRes.items || []).map((e: Evidencia) => ({ ...e, imageUrl: normalizeImageUrl(e.imageUrl) })));
      setGroupNormas(normasRes.items || []);
    } catch {}
  }

  async function applyNormasToGroup(groupKey: string) {
    const entries = Object.entries(pickerSelected) as Array<[string, Categoria]>;
    for (const [idStr, clasif] of entries) {
      const nid = Number(idStr); if (!nid || Number.isNaN(nid)) continue;
      try { await attachNormaRepoToGroup(groupKey, { normaRepoId: nid, clasificacion: clasif }); } catch {}
    }
    setPickerOpenForGroup(null);
    await load();
    if (openGroupKey) try { const r = await listNormasRepoByGroup(openGroupKey); setGroupNormas(r.items || []); } catch {}
  }

  async function detachNormaFromGroup(groupKey: string, normaId: number) {
    try { await detachNormaRepoFromGroup(groupKey, normaId); } catch {}
    try { const r = await listNormasRepoByGroup(groupKey); setGroupNormas(r.items || []); } catch {}
  }

  return (
    <div className="evidencias-panel">
      <h3>📷 Evidencias fotográficas</h3>

      {/* Formulario de subida */}
      <form className="evidencia-uploader" onSubmit={handleUpload}>
        <div className="row">
          <input type="file" multiple accept="image/*" onChange={e => setFiles(Array.from(e.target.files || []))} />
          <select value={tareaId as any} onChange={e => setTareaId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Sin tarea</option>
            {(tareas || []).map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
          </select>
        </div>
        <div className="row">
          <input placeholder="Comentario (opcional)" value={comentario} onChange={e => setComentario(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={loading}>Subir</button>
        </div>
        <div className="muted xsmall" style={{ marginTop: 4 }}>
          Sube varias imágenes a la vez y el sistema las agrupa por tarea/comentario. También se clasifican por tipo.
        </div>
      </form>

      {/* Filtros eliminados */}

      {error && <div className="error-message">{error}</div>}

      {/* Vista agrupada por tipo */}
      {loading ? (<div>Cargando...</div>) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {byTipo.length === 0 ? (<div className="empty-state">No hay evidencias</div>) : byTipo.map(section => (
            <div key={section.tipo}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0' }}>
                <h4 style={{ margin: 0 }}>{section.tipo}</h4>
                {/* Botón Exportar PDF eliminado */}
              </div>
              <div className="evidencias-grid">
                {section.groups.map(g => (
                  <div className="evidencia-card" key={g.groupKey}>
                    <div className="evidencia-thumb" onClick={() => openGroup(g.groupKey)} title="Ver detalles">
                      {g.images && g.images[0]
                        ? (<ImageWithFallback src={g.images[0]} alt={g.comentario || 'Grupo'} placeholder={IMG_PLACEHOLDER} />)
                        : (<div className="muted small" style={{ padding: 8 }}>Sin imagen</div>)}
                      <div className="badge">{g.count} fotos</div>
                    </div>
                    <div className="evidencia-meta">
                      {g.tareaId && (<div className="tarea-ref">Tarea: {tareasById[g.tareaId]?.nombre || g.tareaId}</div>)}
                      <div className="comentario">{g.comentario || 'Sin comentario'}</div>
                      <div className="acciones">
                        <button className="btn small" onClick={() => openGroup(g.groupKey)}>Ver detalles</button>
                        <button className="btn small danger" onClick={async () => { if (!confirm('Eliminar TODAS las fotos del grupo?')) return; try { await deleteEvidenciaGroup(g.groupKey); await load(); } catch { setError('No se pudo eliminar el grupo'); } }}>Eliminar grupo</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: vincular normas a grupo */}
      {pickerOpenForGroup !== null && (
        <div className="modal-backdrop" onClick={() => setPickerOpenForGroup(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Añadir incumplimientos al grupo</div>
              <button className="close" onClick={() => setPickerOpenForGroup(null)} aria-label="Cerrar">×</button>
            </div>
            <div className="modal-body">
              <div className="muted xsmall">Selecciona uno o más elementos y define su estado.</div>
              <div className="normas-table-wrapper" role="region" aria-label="Listado de normas">
                <table className="normas-table" role="grid" aria-readonly="true">
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
                      const color = estado === 'CRITICO' ? '#dc3545' : estado === 'OK' ? '#28a745' : '#ffc107';
                      return (
                        <tr key={it.id} className={selected ? 'selected' : ''}>
                          <td className="col-select">
                            <input type="checkbox" checked={selected} onChange={e => {
                              setPickerSelected(prev => { const next = { ...prev } as Record<number, Categoria>; if (e.target.checked) next[it.id] = next[it.id] || 'LEVE'; else delete next[it.id]; return next; });
                            }} aria-label={`Seleccionar norma ${it.id}`} />
                          </td>
                          <td className="col-estado">
                            <span className="severity-dot" style={{ backgroundColor: color }} />
                            <select className="link-clasificacion-select" value={estado} disabled={!selected} onChange={e => {
                              const val = e.target.value as Categoria; setPickerSelected(prev => ({ ...prev, [it.id]: val }));
                            }} aria-label="Clasificación">
                              <option value="OK">OK</option>
                              <option value="LEVE">Leve</option>
                              <option value="CRITICO">Crítico</option>
                            </select>
                          </td>
                          <td className="col-categoria" title={it.categoria || ''}>{it.categoria || '—'}</td>
                          <td className="col-descripcion" title={it.descripcion || it.titulo || ''}><span className="multiline-clamp-6">{it.descripcion || it.titulo || ''}</span></td>
                          <td className="col-articulo" title={it.fuente || ''}>{it.fuente || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPickerOpenForGroup(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={Object.keys(pickerSelected).length === 0} onClick={() => applyNormasToGroup(pickerOpenForGroup!)}>Asociar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle del grupo */}
      {openGroupKey && (
        <div className="modal-backdrop" onClick={() => setOpenGroupKey(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Evidencias del grupo</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={async () => { setPickerSelected({}); try { const r = await listNormasRepo({ all: true, limit: 1500 }); setPickerResults(r.items || []); setPickerOpenForGroup(openGroupKey); } catch {} }}>+ Añadir normas</button>
                <button className="close" onClick={() => setOpenGroupKey(null)}>×</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {groupItems.map(img => (
                  <div key={img.id} className="evidencia-card">
                    <div className="evidencia-thumb"><ImageWithFallback src={img.imageUrl || IMG_PLACEHOLDER} placeholder={IMG_PLACEHOLDER} alt={img.comentario || 'img'} /></div>
                    <div className="evidencia-meta">
                      <div className="comentario">{img.comentario || '—'}</div>
                      <div className="acciones">
                        <button className="btn small danger" onClick={async () => { if (!confirm('Eliminar esta foto?')) return; try { await deleteEvidencia(img.id); await openGroup(openGroupKey); await load(); } catch {} }}>Eliminar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="incumplimientos-section" style={{ marginTop: 12 }}>
                <div className="section-header">
                  <div className="section-title">Incumplimientos del grupo <span className="chip">{groupNormas.length}</span></div>
                </div>
                {(groupNormas || []).length === 0 ? (
                  <div className="muted small" style={{ marginTop: 8 }}>Sin normas asociadas</div>
                ) : (
                  <ul className="incumpl-list" style={{ maxHeight: 200, overflow: 'auto' }}>
                    {groupNormas.map(n => {
                      const c = (n.clasificacion || 'LEVE').toUpperCase();
                      const color = c === 'CRITICO' ? '#dc3545' : c === 'OK' ? '#28a745' : '#ffc107';
                      return (
                        <li key={n.id} className="incumpl-row">
                          <span className="severity-dot" style={{ backgroundColor: color }} />
                          <div className="incumpl-text">
                            <div className="line"><strong>{n.categoria ? `${n.categoria} · ` : ''}</strong><span className="truncate">{n.titulo}{n.fuente ? <span className="muted"> {`— ${n.fuente}`}</span> : null}</span></div>
                          </div>
                          <div className="incumpl-actions"><button className="btn xsmall" onClick={() => detachNormaFromGroup(openGroupKey, n.id)}>Quitar</button></div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setOpenGroupKey(null)}>Cerrar</button>
              <button className="btn danger" onClick={async () => { if (!confirm('Eliminar todo el grupo?')) return; try { await deleteEvidenciaGroup(openGroupKey); setOpenGroupKey(null); await load(); } catch {} }}>Eliminar grupo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}