import { useEffect, useState } from "react";
import {
  listNormasRepoByEvidencia,
  type EvidenciaNormaRepoLink,
} from "../services/evidencias";
import ImageWithFallback from "./ImageWithFallback";

interface EvidenciaParaModal {
  id: number;
  imageUrl: string;
  comentario?: string | null;
}

interface Props {
  evidencia: EvidenciaParaModal;
  onClose: () => void;
}

export default function EvidenciaAbrirModal({ evidencia, onClose }: Props) {
  const [incumplimientos, setIncumplimientos] = useState<
    EvidenciaNormaRepoLink[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageExpanded, setImageExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await listNormasRepoByEvidencia(evidencia.id);
        if (!cancelled) setIncumplimientos(res.items || []);
      } catch (e: any) {
        if (!cancelled)
          setError(
            e?.detail || e?.error || e?.message || "Error al cargar incumplimientos"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evidencia.id]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal evidencia-abrir-modal"
        style={{ maxWidth: 720 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidencia-abrir-title"
      >
        <div className="modal-header">
          <div className="modal-title" id="evidencia-abrir-title">
            Ver evidencia
          </div>
          <button
            type="button"
            className="close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div
            className="evidencia-abrir-imagen evidencia-abrir-imagen-clickable"
            onClick={() => evidencia.imageUrl && setImageExpanded(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && evidencia.imageUrl) {
                e.preventDefault();
                setImageExpanded(true);
              }
            }}
            title={evidencia.imageUrl ? "Clic para ampliar" : undefined}
          >
            {evidencia.imageUrl ? (
              <>
                <ImageWithFallback
                  src={evidencia.imageUrl}
                  alt={evidencia.comentario || "Evidencia"}
                  style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }}
                />
                <span className="evidencia-abrir-ampliar-hint">Clic para ampliar</span>
              </>
            ) : (
              <div className="muted" style={{ padding: 24 }}>
                Sin imagen
              </div>
            )}
          </div>

          {imageExpanded && evidencia.imageUrl && (
            <div
              className="evidencia-abrir-lightbox"
              onClick={() => setImageExpanded(false)}
              role="presentation"
            >
              <button
                type="button"
                className="evidencia-abrir-lightbox-close"
                onClick={() => setImageExpanded(false)}
                aria-label="Cerrar vista ampliada"
              >
                &times;
              </button>
              <div
                className="evidencia-abrir-lightbox-img-wrap"
                onClick={(e) => e.stopPropagation()}
              >
                <ImageWithFallback
                  src={evidencia.imageUrl}
                  alt={evidencia.comentario || "Evidencia"}
                  style={{
                    maxWidth: "95vw",
                    maxHeight: "95vh",
                    objectFit: "contain",
                  }}
                />
              </div>
            </div>
          )}
          {evidencia.comentario && (
            <p className="evidencia-abrir-comentario muted small">
              {evidencia.comentario}
            </p>
          )}

          <h4 style={{ marginTop: 16, marginBottom: 8 }}>
            Incumplimientos asociados ({incumplimientos.length})
          </h4>
          {error && <div className="error-message">{error}</div>}
          {loading && <div className="muted">Cargando incumplimientos...</div>}
          {!loading && incumplimientos.length === 0 && (
            <p className="muted small">Ningún incumplimiento asociado a esta evidencia.</p>
          )}
          {!loading && incumplimientos.length > 0 && (
            <ul className="evidencia-abrir-lista-incumplimientos">
              {incumplimientos.map((item) => {
                const tituloNorm = (item.titulo || "").trim();
                const descNorm = (item.descripcion || "").trim();
                const descripcionDistinta = descNorm && descNorm !== tituloNorm;
                return (
                <li key={item.id} className="incumplimiento-item">
                  <strong>{item.titulo}</strong>
                  {descripcionDistinta && (
                    <div className="small muted">{item.descripcion}</div>
                  )}
                  <div className="incumplimiento-meta small">
                    {item.categoria && (
                      <span className="meta-tag">{item.categoria}</span>
                    )}
                    {item.fuente && (
                      <span className="meta-fuente">Fuente: {item.fuente}</span>
                    )}
                    {item.clasificacion && (
                      <span
                        className={`meta-clasificacion clasif-${String(
                          item.clasificacion
                        ).toLowerCase()}`}
                      >
                        {item.clasificacion}
                      </span>
                    )}
                  </div>
                  {item.observacion && (
                    <div className="small" style={{ marginTop: 4 }}>
                      Observación: {item.observacion}
                    </div>
                  )}
                </li>
              );
              })}
            </ul>
          )}
          <p className="muted xsmall" style={{ marginTop: 12 }}>
            Para agregar, editar o eliminar incumplimientos use el botón
            &quot;Incumplimientos&quot; en la tarjeta de la evidencia.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
