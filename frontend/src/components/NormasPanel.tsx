import { useEffect, useState } from 'react';
import { attachNorma, deleteNorma, detachNorma, getNormasByProyecto, searchNormas, uploadNorma, type Norma } from '../services/normas';
import { type Tarea } from '../services/tareas';
import '../css/NormasPanel.css';

export default function NormasPanel({ proyectoId, tareas }: { proyectoId: number; tareas: Tarea[]; }) {
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [etiquetas, setEtiquetas] = useState('');
  const [tareaId, setTareaId] = useState<number | ''>('');

  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjuntas, setAdjuntas] = useState<Norma[]>([]);
  const [resultados, setResultados] = useState<Norma[]>([]);

  async function loadAdjuntas() {
    try {
      const list = await getNormasByProyecto(proyectoId);
      setAdjuntas(list || []);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar normas del proyecto');
    }
  }

  async function buscar() {
    try {
      const res = await searchNormas({ search: busqueda, page: 1, limit: 50 });
      setResultados(Array.isArray(res.items) ? res.items : []);
    } catch (e: any) {
      setError(e?.message || 'Error al buscar normas');
    }
  }

  useEffect(() => { void loadAdjuntas(); }, [proyectoId]);
  useEffect(() => { void buscar(); }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Seleccione un archivo PDF o TXT'); return; }
    if (!titulo.trim()) { setError('Ingrese un título'); return; }
    try {
      setLoading(true);
      await uploadNorma({ file, titulo: titulo.trim(), descripcion: descripcion.trim() || undefined, etiquetas: etiquetas.trim() || undefined, proyectoId, tareaId: tareaId === '' ? undefined : Number(tareaId) });
      setFile(null); setTitulo(''); setDescripcion(''); setEtiquetas(''); setTareaId('');
      await loadAdjuntas();
      await buscar();
    } catch (e: any) {
      setError(e?.message || 'Error al subir norma');
    } finally { setLoading(false); }
  }

  return (
    <div className="normas-panel">
      <h3>📚 Normas técnicas</h3>

      <form className="norma-uploader" onSubmit={handleUpload}>
        <div className="row">
          <input type="file" accept="application/pdf,text/plain" onChange={e => setFile(e.target.files?.[0] || null)} />
          <input placeholder="Título" value={titulo} onChange={e => setTitulo(e.target.value)} />
        </div>
        <div className="row">
          <input placeholder="Descripción (opcional)" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          <input placeholder="Etiquetas (coma-separadas)" value={etiquetas} onChange={e => setEtiquetas(e.target.value)} />
          <select value={tareaId as any} onChange={e => setTareaId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Asociar a proyecto</option>
            {(tareas || []).map(t => (<option key={t.id} value={t.id}>Asociar a tarea: {t.nombre}</option>))}
          </select>
          <button className="btn btn-primary" disabled={loading} type="submit">Subir</button>
        </div>
      </form>

      <div className="normas-busqueda">
        <input placeholder="Buscar por título, descripción, etiquetas o contenido" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <button className="btn" onClick={() => void buscar()}>Buscar</button>
        <button className="btn" onClick={() => { setBusqueda(''); void buscar(); }}>Limpiar</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="normas-secciones">
        <div className="normas-col">
          <h4>Adjuntas a este proyecto</h4>
          <div className="normas-list">
            {adjuntas.length === 0 ? <div className="empty-state">No hay normas adjuntas</div> : adjuntas.map(n => (
              <div key={n.id} className="norma-item">
                <div className="norma-main">
                  <div className="norma-title">{n.titulo}</div>
                  {n.descripcion && <div className="norma-desc">{n.descripcion}</div>}
                  {n.etiquetas && <div className="norma-tags">{n.etiquetas}</div>}
                </div>
                <div className="norma-actions">
                  <a className="btn small" href={(n.fileUrl?.startsWith('http') ? n.fileUrl : new URL(n.fileUrl || '/', (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001')).toString())} target="_blank" rel="noreferrer">Abrir</a>
                  <button className="btn small" onClick={async () => { await detachNorma(n.id, { proyectoId }); await loadAdjuntas(); }}>Quitar</button>
                  <button className="btn small danger" onClick={async () => { if (!confirm('Eliminar norma?')) return; await deleteNorma(n.id); await loadAdjuntas(); await buscar(); }}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="normas-col">
          <h4>Repositorio (búsqueda)</h4>
          <div className="normas-list">
            {resultados.length === 0 ? <div className="empty-state">Sin resultados</div> : resultados.map(n => (
              <div key={n.id} className="norma-item">
                <div className="norma-main">
                  <div className="norma-title">{n.titulo}</div>
                  {n.descripcion && <div className="norma-desc">{n.descripcion}</div>}
                  {n.etiquetas && <div className="norma-tags">{n.etiquetas}</div>}
                </div>
                <div className="norma-actions">
                  <a className="btn small" href={(n.fileUrl?.startsWith('http') ? n.fileUrl : new URL(n.fileUrl || '/', (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001')).toString())} target="_blank" rel="noreferrer">Abrir</a>
                  <button className="btn small" onClick={async () => { await attachNorma(n.id, { proyectoId }); await loadAdjuntas(); }}>Añadir al proyecto</button>
                  <div className="attach-tarea">
                    <select value={''}
                      onChange={async (e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value);
                        if (val) { await attachNorma(n.id, { tareaId: val }); alert('Asociada a tarea'); }
                        (e.target as HTMLSelectElement).value = '';
                      }}>
                      <option value="">Asociar a tarea…</option>
                      {(tareas || []).map(t => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
