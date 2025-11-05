import { useEffect, useState } from 'react';
import { importExcel, listNormasRepo, type NormaRepoItem, uploadEvidenciaNorma, listEvidenciasNorma, deleteEvidenciaNorma, buildRepoReportUrl, deleteNormaRepo } from '../services/normasRepo';
import '../css/NormasPanel.css';

export default function NormasRepositorio() {
  const [items, setItems] = useState<NormaRepoItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [severidad, setSeveridad] = useState('');
  const [viewMode, setViewMode] = useState<'tabla'|'lista'>('tabla');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [openEvid, setOpenEvid] = useState<number | null>(null);
  const [evidencias, setEvidencias] = useState<Record<number, any[]>>({});
  // const [uploadingFor, setUploadingFor] = useState<number | null>(null);

  async function fetchData(p = page) {
    try {
      setLoading(true);
      const res = await listNormasRepo({ search, categoria, severidad, page: p, limit: 20 });
      setItems(res.items || []);
      setTotalPages(res.totalPages || 1);
      setPage(res.page || 1);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar catálogo');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchData(1); }, []);

  const onImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) { setError('Seleccione un archivo .xlsx'); return; }
    try {
      setError(null);
      setLoading(true);
      const res = await importExcel(importFile);
      alert(`Importación completa\nCreados: ${res.created}\nActualizados: ${res.updated}\nErrores: ${res.errors}`);
      setImportFile(null);
      setError(null);
      await fetchData(1);
    } catch (e: any) {
      // Preferir el detalle del servidor si existe
      setError(e?.detail || e?.error || e?.message || 'Error importando Excel');
    } finally { setLoading(false); }
  };

  const toggleSelect = (id: number) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const openReport = () => {
    const ids = Object.entries(selected).filter(([_, v]) => v).map(([k]) => Number(k));
    const url = buildRepoReportUrl(ids.length ? ids : undefined, { search, categoria, severidad });
    window.open(url, '_blank');
  };

  const toggleEvidencias = async (id: number) => {
    if (openEvid === id) { setOpenEvid(null); return; }
    setOpenEvid(id);
    if (!evidencias[id]) {
      const res = await listEvidenciasNorma(id);
      setEvidencias(prev => ({ ...prev, [id]: res.items || [] }));
    }
  };

  const handleUploadEvidencia = async (id: number, file: File | null, comentario?: string) => {
    if (!file) return;
    try {
      await uploadEvidenciaNorma(id, file, comentario);
      const res = await listEvidenciasNorma(id);
      setEvidencias(prev => ({ ...prev, [id]: res.items || [] }));
    } catch (e: any) {
      setError(e?.message || 'Error subiendo evidencia');
    } finally { /* noop */ }
  };

  return (
    <div className="normas-panel">
      <h3>📚 Repositorio de Normas / Incumplimientos</h3>

      <form className="norma-uploader" onSubmit={onImport}>
        <div className="row">
          <input type="file" accept=".xlsx,.csv" onChange={e => setImportFile(e.target.files?.[0] || null)} />
          <button className="btn btn-primary" disabled={loading} type="submit">Importar Excel</button>
        </div>
      </form>

      <div className="normas-busqueda">
        <input placeholder="Buscar por título, código, descripción, etiquetas" value={search} onChange={e => setSearch(e.target.value)} />
        <input placeholder="Categoría" value={categoria} onChange={e => setCategoria(e.target.value)} />
        <input placeholder="Severidad" value={severidad} onChange={e => setSeveridad(e.target.value)} />
        <button className="btn" onClick={() => void fetchData(1)}>Buscar</button>
        <button className="btn" onClick={() => { setSearch(''); setCategoria(''); setSeveridad(''); void fetchData(1); }}>Limpiar</button>
        <button className="btn" onClick={openReport}>Exportar PDF</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" className={`btn ${viewMode==='tabla'?'active':''}`} onClick={() => setViewMode('tabla')}>Vista tabla</button>
          <button type="button" className={`btn ${viewMode==='lista'?'active':''}`} onClick={() => setViewMode('lista')}>Vista lista</button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {viewMode === 'tabla' ? (
        <div className="normas-table-wrapper">
          {loading && <div>Cargando...</div>}
          {!loading && items.length === 0 && <div className="empty-state">Sin registros</div>}
          {!loading && items.length > 0 && (
            <div className="table-scroll">
              <table className="normas-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Categoría</th>
                    <th>Descripción</th>
                    <th style={{ width: '22%' }}>Artículo</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id}>
                      <td>{it.categoria || ''}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggleSelect(it.id)} />
                          <div>
                            <div className="t-strong">{it.descripcion || it.titulo}</div>
                            {it.etiquetas && <div className="muted small">{it.etiquetas}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{(it as any).fuente || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <div className="normas-list">
        {loading && <div>Cargando...</div>}
        {!loading && items.length === 0 && <div className="empty-state">Sin registros</div>}
        {!loading && items.map(it => (
          <div key={it.id} className="norma-item">
            <div className="norma-main" style={{ flex: 1 }}>
              <div className="norma-title">
                <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggleSelect(it.id)} style={{ marginRight: 8 }} />
                {it.titulo}
              </div>
              <div className="norma-desc">
                {[it.codigo, it.categoria, it.subcategoria, it.severidad].filter(Boolean).join(' · ')}
              </div>
              {it.descripcion && <div className="norma-desc">{it.descripcion}</div>}
              {it.incumplimiento && <div className="norma-desc"><b>Incumplimiento:</b> {it.incumplimiento}</div>}
              {/* Mostrar artículo/fuente si existe */}
              {(it as any).fuente && <div className="norma-desc"><b>Artículo:</b> {(it as any).fuente}</div>}
              {it.etiquetas && <div className="norma-tags">{it.etiquetas}</div>}
            </div>
            <div className="norma-actions">
              <label className="btn small">
                Subir evidencia
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleUploadEvidencia(it.id, e.target.files?.[0] || null)} />
              </label>
              <button className="btn small" onClick={() => void toggleEvidencias(it.id)}>
                {openEvid === it.id ? 'Ocultar evidencias' : 'Ver evidencias'}
              </button>
              <button className="btn small danger" onClick={async () => { if (!confirm('Eliminar registro?')) return; await deleteNormaRepo(it.id); await fetchData(page); }}>Eliminar</button>
            </div>
            {openEvid === it.id && (
              <div className="evidencias-list" style={{ marginTop: 10, paddingLeft: 10 }}>
                {(evidencias[it.id] || []).length === 0 ? (
                  <div className="empty-state">Sin evidencias</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {(evidencias[it.id] || []).map(ev => (
                      <div key={ev.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 6 }}>
                        <img src={ev.thumbUrl || ev.imageUrl} style={{ maxWidth: 160, maxHeight: 120, display: 'block', borderRadius: 4 }} />
                        {ev.comentario && <div style={{ fontSize: 12 }}>{ev.comentario}</div>}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <a className="btn small" href={ev.imageUrl} target="_blank" rel="noreferrer">Abrir</a>
                          <button className="btn small danger" onClick={async () => { await deleteEvidenciaNorma(ev.id); const res = await listEvidenciasNorma(it.id); setEvidencias(prev => ({ ...prev, [it.id]: res.items || [] })); }}>Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" disabled={page <= 1} onClick={() => void fetchData(page - 1)}>Anterior</button>
        <div style={{ alignSelf: 'center' }}>Página {page} de {totalPages}</div>
        <button className="btn" disabled={page >= totalPages} onClick={() => void fetchData(page + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
