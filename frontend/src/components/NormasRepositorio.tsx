import { useEffect, useState } from "react";
import {
  importExcel,
  listNormasRepo,
  type NormaRepoItem,
  buildRepoReportUrl,
} from "../services/normasRepo";
import "../css/NormasPanel.css";

export default function NormasRepositorio({ onBack }: { onBack?: () => void }) {
  const [items, setItems] = useState<NormaRepoItem[]>([]);
  const [categoria, setCategoria] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const [uploadingFor, setUploadingFor] = useState<number | null>(null);

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

  const openReport = () => {
    const url = buildRepoReportUrl(undefined, { categoria });
    window.open(url, "_blank");
  };

  return (
    <div className="normas-panel">
      <div className="normas-header">
        <h3>📚 Repositorio de Normas / Incumplimientos</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && (
            <button className="btn" onClick={onBack}>
              ⟵ Volver al Dashboard
            </button>
          )}
        </div>
      </div>

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
      </div>

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
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.categoria || ""}</td>
                    <td>
                      <div>
                        <div className="t-strong">
                          {it.descripcion || it.titulo}
                        </div>
                        {it.etiquetas && (
                          <div className="muted small">{it.etiquetas}</div>
                        )}
                      </div>
                    </td>
                    <td>{(it as any).fuente || ""}</td>
                  </tr>
                ))}
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
