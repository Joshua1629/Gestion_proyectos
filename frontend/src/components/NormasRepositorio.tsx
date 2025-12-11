import { useEffect, useState } from "react";
import {
  importExcel,
  listNormasRepo,
  type NormaRepoItem,
  buildRepoReportUrl,
  createNormaRepo,
  deleteNormaRepo,
  updateNormaRepo,
} from "../services/normasRepo";
import "../css/NormasPanel.css";
import "../css/NormasRepositorio.css";
import Icon from "./Icon";

export default function NormasRepositorio({ onBack, canManage = true }: { onBack?: () => void; canManage?: boolean }) {
  const [items, setItems] = useState<NormaRepoItem[]>([]);
  const [categoria, setCategoria] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCategoria, setNewCategoria] = useState("");
  const [newDescripcion, setNewDescripcion] = useState("");
  const [newArticulo, setNewArticulo] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCategoria, setEditCategoria] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editArticulo, setEditArticulo] = useState("");

  async function fetchData(p = page) {
    try {
      setLoading(true);
      const res = await listNormasRepo({ categoria, page: p, limit: 20 });
      setItems(res.items || []);
      setTotalPages(res.totalPages || 1);
      setPage(res.page || 1);
    } catch (e: any) {
      setError(e?.message || "Error al cargar catálogo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchData(1);
  }, []);

  const onImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setError("Seleccione un archivo .xlsx");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const res = await importExcel(importFile);
      alert(
        `Importación completa\nCreados: ${res.created}\nActualizados: ${res.updated}\nErrores: ${res.errors}`
      );
      setImportFile(null);
      setError(null);
      await fetchData(1);
    } catch (e: any) {
      // Preferir el detalle del servidor si existe
      setError(e?.detail || e?.error || e?.message || "Error importando Excel");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (it: NormaRepoItem) => {
    setEditingId(it.id);
    setEditCategoria(it.categoria || "");
    setEditDescripcion(it.descripcion || it.titulo || "");
    setEditArticulo((it as any).fuente || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCategoria("");
    setEditDescripcion("");
    setEditArticulo("");
  };

  const saveEdit = async (id: number) => {
    if (!editDescripcion.trim()) {
      setError("La descripción es obligatoria");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await updateNormaRepo(id, {
        categoria: editCategoria.trim() || null,
        descripcion: editDescripcion.trim(),
        titulo: editDescripcion.trim(),
        fuente: editArticulo.trim() || null,
      });
      cancelEdit();
      await fetchData(page);
    } catch (e: any) {
      setError(e?.detail || e?.error || e?.message || "Error actualizando");
    } finally {
      setLoading(false);
    }
  };

  const openReport = async () => {
    try {
      setError(null);
      setLoading(true);
    const url = buildRepoReportUrl(undefined, { categoria });
      console.log('📄 Abriendo PDF de normas:', url);
      
      // Usar appFetch para verificar que el endpoint responda (usando HEAD)
      // Esto usa el IPC de Electron y maneja errores mejor
      try {
        const api = (globalThis as any).api;
        if (api && typeof api.fetch === 'function') {
          // Verificar con HEAD usando IPC
          const testResponse = await api.fetch(url, { method: 'HEAD' });
          if (!testResponse || !testResponse.ok) {
            const errorMsg = testResponse?.error || 
                           `El servidor respondió con error: ${testResponse?.status || 'desconocido'}`;
            throw new Error(errorMsg);
          }
        } else {
          // Fallback: usar fetch nativo solo si no hay IPC
          const testResponse = await fetch(url, { method: 'HEAD' });
          if (!testResponse.ok) {
            throw new Error(`El servidor respondió con error: ${testResponse.status} ${testResponse.statusText}`);
          }
        }
      } catch (fetchErr: any) {
        console.error('❌ Error verificando URL del PDF:', fetchErr);
        const errorMessage = fetchErr?.message || 
                           fetchErr?.error || 
                           'No se pudo conectar con el servidor';
        setError(`Error al generar PDF: ${errorMessage}`);
        setLoading(false);
        return;
      }
      
      // Intentar abrir en nueva ventana
      // Usar setTimeout para asegurar que el estado de loading se actualice
      setTimeout(() => {
        try {
          const newWindow = window.open(url, "_blank");
          
          // Si el navegador bloquea la ventana emergente, mostrar mensaje
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            setError('No se pudo abrir la ventana. Verifica que las ventanas emergentes no estén bloqueadas.');
            setLoading(false);
          } else {
            // Monitorear si la ventana se cierra rápidamente (indicaría un error)
            setTimeout(() => {
              try {
                if (newWindow.closed) {
                  setError('El PDF no se pudo cargar. Verifica que el servidor esté funcionando correctamente.');
                }
                setLoading(false);
              } catch (e) {
                // Ignorar errores de acceso cross-origin
                setLoading(false);
              }
            }, 2000);
          }
        } catch (windowErr: any) {
          console.error('❌ Error abriendo ventana:', windowErr);
          setError('Error al abrir la ventana del PDF. Intenta nuevamente.');
          setLoading(false);
        }
      }, 100);
    } catch (err: any) {
      console.error('❌ Error al abrir PDF:', err);
      const errorMessage = err?.message || 
                          err?.error || 
                          'Error al exportar PDF. Verifica la consola para más detalles.';
      setError(errorMessage);
      setLoading(false);
    }
  };

  const resetAddForm = () => {
    setNewCategoria("");
    setNewDescripcion("");
    setNewArticulo("");
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescripcion.trim()) {
      setError("La descripción es obligatoria");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await createNormaRepo({
        categoria: newCategoria.trim() || null,
        descripcion: newDescripcion.trim(),
        titulo: newDescripcion.trim(), // el backend requiere titulo
        fuente: newArticulo.trim() || null,
      });
      resetAddForm();
      setShowAdd(false);
      await fetchData(1);
    } catch (e: any) {
      setError(e?.detail || e?.error || e?.message || "Error creando norma");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="normas-panel">
      <div className="normas-header">
        <h3>📚 Repositorio de Normas / Incumplimientos</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && (
            <button className="btn" onClick={onBack}>
              ⟵ Volver 
            </button>
          )}
        </div>
      </div>

      {canManage && (
        <form className="norma-uploader" onSubmit={onImport}>
          <div className="row">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            />
            <button className="btn btn-primary" disabled={loading} type="submit">
              Importar Excel
            </button>
          </div>
        </form>
      )}

      <div className="normas-busqueda">
        <input
          className="categoria-input"
          placeholder="Categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <button className="btn" onClick={() => void fetchData(1)}>
          Buscar
        </button>
        <button className="btn" onClick={openReport}>
          Exportar PDF
        </button>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Cancelar" : "Agregar"}
          </button>
        )}
      </div>

      {canManage && showAdd && (
        <form className="normas-add-inline" onSubmit={onCreate}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Categoría"
              value={newCategoria}
              onChange={(e) => setNewCategoria(e.target.value)}
              style={{ minWidth: 180 }}
            />
            <input
              type="text"
              placeholder="Descripción del incumplimiento (requerido)"
              value={newDescripcion}
              onChange={(e) => setNewDescripcion(e.target.value)}
              style={{ flex: 1, minWidth: 280 }}
            />
            <input
              type="text"
              placeholder="Artículo / Fuente"
              value={newArticulo}
              onChange={(e) => setNewArticulo(e.target.value)}
              style={{ minWidth: 160 }}
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              Guardar
            </button>
          </div>
        </form>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="normas-table-wrapper">
        {loading && <div>Cargando...</div>}
        {!loading && items.length === 0 && (
          <div className="empty-state">Sin registros</div>
        )}
        {!loading && items.length > 0 && (
          <div className="table-scroll">
            <table className="normas-table">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>Categoría</th>
                  <th>Descripción</th>
                  <th style={{ width: "22%" }}>Artículo</th>
                  <th className="col-actions" style={{ width: 110 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const isEditing = editingId === it.id;
                  return (
                    <tr key={it.id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="table-input"
                            type="text"
                            value={editCategoria}
                            onChange={(e) => setEditCategoria(e.target.value)}
                          />
                        ) : (
                          it.categoria || ""
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="table-input"
                            type="text"
                            value={editDescripcion}
                            onChange={(e) => setEditDescripcion(e.target.value)}
                          />
                        ) : (
                          <div>
                            <div className="t-strong">
                              {it.descripcion || it.titulo}
                            </div>
                            {it.etiquetas && (
                              <div className="muted small">{it.etiquetas}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="table-input"
                            type="text"
                            value={editArticulo}
                            onChange={(e) => setEditArticulo(e.target.value)}
                          />
                        ) : (
                          (it as any).fuente || ""
                        )}
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        {canManage ? (
                          isEditing ? (
                            <>
                              <button
                                className="btn btn-primary"
                                onClick={() => void saveEdit(it.id)}
                                disabled={loading}
                                title="Guardar cambios"
                              >
                                <Icon name="save" size={18} /> Guardar
                              </button>
                              <button
                                className="btn"
                                onClick={cancelEdit}
                                disabled={loading}
                                title="Cancelar edición"
                              >
                                <Icon name="close" size={18} /> Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn btn-outline"
                                onClick={() => startEdit(it)}
                                title="Editar"
                              >
                                <Icon name="edit" size={18} /> Editar
                              </button>
                              <button
                                className="btn btn-outline btn-danger"
                                onClick={async () => {
                                  const ok = window.confirm(
                                    "¿Eliminar este registro del repositorio?"
                                  );
                                  if (!ok) return;
                                  try {
                                    setLoading(true);
                                    await deleteNormaRepo(it.id);
                                    await fetchData(page);
                                  } catch (e: any) {
                                    setError(
                                      e?.detail || e?.error || e?.message || "Error eliminando"
                                    );
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                title="Eliminar"
                              >
                                🗑 Eliminar
                              </button>
                            </>
                          )
                        ) : (
                          <span className="muted small">Sin acciones</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          className="btn"
          disabled={page <= 1}
          onClick={() => void fetchData(page - 1)}
        >
          Anterior
        </button>
        <div style={{ alignSelf: "center" }}>
          Página {page} de {totalPages}
        </div>
        <button
          className="btn"
          disabled={page >= totalPages}
          onClick={() => void fetchData(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
