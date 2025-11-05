import { appFetch } from '../utils/appFetch';

const API = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001') + '/api/evidencias';

export type Categoria = 'OK' | 'LEVE' | 'CRITICO';

export interface Evidencia {
  id: number;
  proyectoId: number;
  tareaId?: number | null;
  categoria: Categoria;
  comentario?: string | null;
  imageUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  createdBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvidenciaNormaRepoLink {
  id: number; // norma_repo_id
  titulo: string;
  descripcion?: string | null;
  categoria?: string | null;
  fuente?: string | null;
  clasificacion?: Categoria;
  observacion?: string | null;
}

export async function uploadEvidencia(params: { file: File; proyectoId: number; tareaId?: number; categoria?: Categoria; comentario?: string }) {
  const fd = new FormData();
  fd.append('file', params.file);
  fd.append('proyectoId', String(params.proyectoId));
  if (params.tareaId) fd.append('tareaId', String(params.tareaId));
  if (params.categoria) fd.append('categoria', params.categoria);
  if (params.comentario) fd.append('comentario', params.comentario);

  // No seteamos Content-Type para que el navegador ponga el boundary multipart
  return appFetch(`${API}/upload`, {
    method: 'POST',
    body: fd,
    asJson: true
  });
}

export async function getEvidencias(filters: { proyectoId: number; tareaId?: number; categoria?: Categoria; page?: number; limit?: number }) {
  const q = new URLSearchParams();
  q.set('proyectoId', String(filters.proyectoId));
  if (filters.tareaId) q.set('tareaId', String(filters.tareaId));
  if (filters.categoria) q.set('categoria', filters.categoria);
  if (filters.page) q.set('page', String(filters.page));
  if (filters.limit) q.set('limit', String(filters.limit));
  return appFetch(`${API}?${q.toString()}`);
}

export async function updateEvidencia(id: number, payload: Partial<Pick<Evidencia, 'categoria' | 'comentario'>>) {
  return appFetch(`${API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteEvidencia(id: number) {
  return appFetch(`${API}/${id}`, { method: 'DELETE', asJson: false });
}

// Asociaciones Evidencia ⇄ Normas-Repo
export async function listNormasRepoByEvidencia(evidenciaId: number): Promise<{ items: EvidenciaNormaRepoLink[] }> {
  return appFetch(`${API}/${evidenciaId}/normas-repo`);
}

export async function attachNormaRepoToEvidencia(evidenciaId: number, payload: { normaRepoId: number; clasificacion?: Categoria; observacion?: string }) {
  return appFetch(`${API}/${evidenciaId}/normas-repo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export async function detachNormaRepoFromEvidencia(evidenciaId: number, normaRepoId: number) {
  return appFetch(`${API}/${evidenciaId}/normas-repo/${normaRepoId}`, { method: 'DELETE', asJson: false });
}
