import { useEffect, useState } from "react";
import { listNormasRepo, type NormaRepoItem } from "../services/normasRepo";
import {
  listNormasRepoByEvidencia,
  attachNormaRepoToEvidencia,
  detachNormaRepoFromEvidencia,
  type EvidenciaNormaRepoLink,
} from "../services/evidencias";

interface Props {
  evidenciaId: number;
  onClose: () => void;
  onUpdated?: (count: number) => void;
}

type Severidad = "OK" | "LEVE" | "CRITICO";

export default function EvidenciaNormasModal({
  evidenciaId,
  onClose,
  onUpdated,
}: Props) {
  const [normas, setNormas] = useState<NormaRepoItem[]>([]);
  const [selected, setSelected] = useState<
    Record<number, { checked: boolean; clasificacion: Severidad }>
  >({});
  const [original, setOriginal] = useState<Record<number, Severidad>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Campo de búsqueda removido; mantener variable fija vacía para reutilizar lógica existente
  const search = "";
  const [categoria, setCategoria] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError(null);
      // Solicitar todas las normas con parámetro all (hasta 2000).
      let repoRes = await listNormasRepo({ search, categoria, all: true });
      if (
        repoRes.total &&
        repoRes.items &&
        repoRes.items.length < repoRes.total
      ) {
        // Fallback paginado incremental si el servidor no devolvió todo.
        const accumulated: NormaRepoItem[] = [...(repoRes.items || [])];
        const limit = 500;
        let page = 2;
        const totalPages = Math.ceil(repoRes.total / limit);
        while (accumulated.length < repoRes.total && page <= totalPages) {
          const pageRes = await listNormasRepo({
            search,
            categoria,
            page,
            limit,
          });
          accumulated.push(...(pageRes.items || []));
          page++;
        }
        repoRes.items = accumulated;
      }
      const linksRes = await listNormasRepoByEvidencia(evidenciaId);
      const repoItems: NormaRepoItem[] = repoRes.items || [];
      setNormas(repoItems);
      const links: EvidenciaNormaRepoLink[] = linksRes.items || [];
      const sel: Record<
        number,
        { checked: boolean; clasificacion: Severidad }
      > = {};
      const orig: Record<number, Severidad> = {};
      for (const l of links) {
        sel[l.id] = {
          checked: true,
          clasificacion: (l.clasificacion as Severidad) || "LEVE",
        };
        orig[l.id] = (l.clasificacion as Severidad) || "LEVE";
      }
      setSelected(sel);
      setOriginal(orig);
    } catch (e: any) {
      setError(e?.detail || e?.error || e?.message || "Error cargando normas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []); // initial

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      // Asociar nuevos o actualizar severidad
      for (const n of normas) {
        const sel = selected[n.id];
        const was = original[n.id];
        if (sel?.checked) {
          if (!was || was !== sel.clasificacion) {
            await attachNormaRepoToEvidencia(evidenciaId, {
              normaRepoId: n.id,
              clasificacion: sel.clasificacion,
            });
          }
        } else if (was) {
          await detachNormaRepoFromEvidencia(evidenciaId, n.id);
        }
      }
      // Releer para contar final
      const linksRes = await listNormasRepoByEvidencia(evidenciaId);
      const finalCount = (linksRes.items || []).length;
      onUpdated && onUpdated(finalCount);
      onClose();
    } catch (e: any) {
      setError(
        e?.detail || e?.error || e?.message || "Error guardando asociaciones"
      );
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: number) {
    setSelected((s) => ({
      ...s,
      [id]: {
        checked: !s[id]?.checked,
        clasificacion: s[id]?.clasificacion || "LEVE",
      },
    }));
  }
  function changeSev(id: number, sev: Severidad) {
    setSelected((s) => ({
      ...s,
      [id]: { checked: s[id]?.checked ?? true, clasificacion: sev },
    }));
  }

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Añadir incumplimientos a evidencia</div>
          <button
            className="close"
            onClick={() => {
              if (!saving) onClose();
            }}
          >
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-filters">
            <input
              className="modal-filter-input"
              placeholder="Categoría"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            />
            <button
              className="btn modal-filter-btn"
              onClick={() => void load()}
              disabled={loading}
            >
              Buscar
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
          {loading && <div>Cargando...</div>}
          {!loading && (
            <div className="normas-table-wrapper">
              <table className="normas-table">
                <thead>
                  <tr>
                    <th className="col-select">Sel</th>
                    <th className="col-categoria">Categoría</th>
                    <th className="col-descripcion">Descripción</th>
                    <th className="col-articulo">Artículo / Fuente</th>
                    <th className="col-estado">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {normas.map((n) => {
                    const sel = selected[n.id];
                    return (
                      <tr key={n.id} className={sel?.checked ? "selected" : ""}>
                        <td className="col-select">
                          <input
                            type="checkbox"
                            checked={!!sel?.checked}
                            onChange={() => toggle(n.id)}
                          />
                        </td>
                        <td className="col-categoria">{n.categoria || ""}</td>
                        <td className="col-descripcion">
                          <div className="multiline-clamp-6">
                            {n.descripcion || n.titulo}
                          </div>
                        </td>
                        <td className="col-articulo">
                          {(n as any).fuente || ""}
                        </td>
                        <td className="col-estado">
                          <select
                            className="link-clasificacion-select"
                            value={sel?.clasificacion || "LEVE"}
                            onChange={(e) =>
                              changeSev(n.id, e.target.value as Severidad)
                            }
                            disabled={!sel?.checked}
                          >
                            <option value="OK">OK</option>
                            <option value="LEVE">Leve</option>
                            <option value="CRITICO">Crítico</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn"
            onClick={() => {
              if (!saving) onClose();
            }}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            Asociar
          </button>
        </div>
      </div>
    </div>
  );
}
