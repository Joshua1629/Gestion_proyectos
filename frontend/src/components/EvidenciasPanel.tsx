import { useEffect, useMemo, useState } from 'react';
import { type Categoria, type Evidencia, deleteEvidencia, getEvidencias, updateEvidencia, uploadEvidencia } from '../services/evidencias';
import { type Tarea } from '../services/tareas';
import '../css/EvidenciasPanel.css';

export default function EvidenciasPanel({ proyectoId, tareas }: { proyectoId: number; tareas: Tarea[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [categoria, setCategoria] = useState<Categoria>('OK');
  const [comentario, setComentario] = useState('');
  const [tareaId, setTareaId] = useState<number | ''>('');
  const [items, setItems] = useState<Evidencia[]>([]);
  const [filterCategoria, setFilterCategoria] = useState<Categoria | ''>('');
  const [filterTareaId, setFilterTareaId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataUrls, setDataUrls] = useState<Record<number, string>>({});

  const tareasById = useMemo(() => Object.fromEntries((tareas || []).map(t => [t.id, t])), [tareas]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getEvidencias({ proyectoId, tareaId: filterTareaId || undefined, categoria: filterCategoria || undefined, page: 1, limit: 50 });
      setItems(res.items || []);
      // Prefetch imágenes como dataURL vía IPC para evitar problemas de red del renderer
      try {
        const api: any = (globalThis as any).api;
        if (api && typeof api.getBinary === 'function' && Array.isArray(res.items)) {
          const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001');
          const pairs = await Promise.all(
            res.items.slice(0, 50).map(async (ev: any) => {
              const resolved = ev.imageUrl && /^https?:\/\//i.test(ev.imageUrl)
                ? ev.imageUrl
                : new URL(ev.imageUrl || '/', base).toString();
              try {
                const r = await api.getBinary(resolved);
                if (r && r.ok && r.dataUrl) return [ev.id, r.dataUrl] as const;
              } catch {}
              return null;
            })
          );
          const map: Record<number, string> = {};
          for (const p of pairs) if (p) map[p[0]] = p[1];
          if (Object.keys(map).length) setDataUrls(prev => ({ ...prev, ...map }));
        }
      } catch {}
    } catch (e: any) {
      setError(e?.message || 'Error al cargar evidencias');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [proyectoId, filterCategoria, filterTareaId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Selecciona una imagen'); return; }
    try {
      setLoading(true);
      await uploadEvidencia({ file, proyectoId, tareaId: tareaId === '' ? undefined : Number(tareaId), categoria, comentario: comentario.trim() || undefined });
      setFile(null); setComentario(''); setCategoria('OK'); setTareaId('');
      await load();
    } catch (e: any) {
      const msg = e?.detail || e?.error || e?.statusText || e?.message || 'Error al subir evidencia';
      setError(String(msg));
    } finally { setLoading(false); }
  }

  return (
    <div className="evidencias-panel">
      <h3>📷 Evidencias fotográficas</h3>

      <form className="evidencia-uploader" onSubmit={handleUpload}>
        <div className="row">
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
          <select value={categoria} onChange={e => setCategoria(e.target.value as Categoria)}>
            <option value="OK">OK</option>
            <option value="LEVE">Leve</option>
            <option value="CRITICO">Crítico</option>
          </select>
          <select value={tareaId as any} onChange={e => setTareaId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Sin tarea</option>
            {(tareas || []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div className="row">
          <input placeholder="Comentario (opcional)" value={comentario} onChange={e => setComentario(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={loading}>Subir</button>
        </div>
      </form>

      <div className="evidencias-filtros">
        <select value={filterCategoria as any} onChange={e => setFilterCategoria(e.target.value as any)}>
          <option value="">Todas</option>
          <option value="OK">OK</option>
          <option value="LEVE">Leve</option>
          <option value="CRITICO">Crítico</option>
        </select>
        <select value={filterTareaId as any} onChange={e => setFilterTareaId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Todas las tareas</option>
          {(tareas || []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <button className="btn" onClick={() => { setFilterCategoria(''); setFilterTareaId(''); }}>Limpiar filtros</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? <div>Cargando...</div> : (
        <div className="evidencias-grid">
          {items.length === 0 ? <div className="empty-state">No hay evidencias</div> : items.map(ev => (
            <div className={`evidencia-card cat-${ev.categoria.toLowerCase()}`} key={ev.id}>
              <div className="evidencia-thumb">
                {/* imageUrl puede ser relativo o absoluto; resolvemos de forma robusta con fallback a dataURL vía IPC */}
                {(() => {
                  const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001');
                  const resolved = ev.imageUrl && /^https?:\/\//i.test(ev.imageUrl)
                    ? ev.imageUrl
                    : new URL(ev.imageUrl || '/', base).toString();
                  const src = dataUrls[ev.id] || resolved;
                  return (
                    <img
                      src={src}
                      alt={ev.comentario || `Evidencia ${ev.id}`}
                      onError={async () => {
                        try {
                          const api: any = (globalThis as any).api;
                          if (api && typeof api.getBinary === 'function') {
                            const r = await api.getBinary(resolved);
                            if (r && r.ok && r.dataUrl) {
                              setDataUrls(prev => ({ ...prev, [ev.id]: r.dataUrl }));
                            }
                          }
                        } catch { /* noop */ }
                      }}
                    />
                  );
                })()}
                <span className="badge">{ev.categoria}</span>
              </div>
              <div className="evidencia-meta">
                {ev.tareaId && <div className="tarea-ref">Tarea: {tareasById[ev.tareaId]?.nombre || ev.tareaId}</div>}
                {ev.comentario && <div className="comentario">{ev.comentario}</div>}
                <div className="acciones">
                  <select value={ev.categoria} onChange={async e => { try { await updateEvidencia(ev.id, { categoria: e.target.value as Categoria }); await load(); } catch (err) { setError('Error actualizando categoría'); } }}>
                    <option value="OK">OK</option>
                    <option value="LEVE">Leve</option>
                    <option value="CRITICO">Crítico</option>
                  </select>
                  <button className="btn small danger" onClick={async () => { if (!confirm('Eliminar evidencia?')) return; try { await deleteEvidencia(ev.id); await load(); } catch { setError('Error eliminando evidencia'); } }}>Eliminar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
