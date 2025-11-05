import { appFetch } from '../utils/appFetch';

const API = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001') + '/api/normas-repo';

export interface NormaRepoItem {
  id: number;
  codigo?: string | null;
  titulo: string;
  descripcion?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  incumplimiento?: string | null;
  severidad?: string | null;
  etiquetas?: string | null;
  fuente?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface EvidenciaRepoItem {
  id: number;
  normaRepoId: number;
  comentario?: string | null;
  imageUrl: string;
  thumbUrl?: string | null;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
}

export async function importExcel(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return appFetch(`${API}/import`, { method: 'POST', body: fd, asJson: true });
}

export async function listNormasRepo(params: { search?: string; categoria?: string; severidad?: string; page?: number; limit?: number; all?: boolean; }) {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.categoria) q.set('categoria', params.categoria);
  if (params.severidad) q.set('severidad', params.severidad);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.all) q.set('all', '1');
  return appFetch(`${API}?${q.toString()}`);
}

export async function createNormaRepo(payload: Partial<NormaRepoItem>) {
  return appFetch(`${API}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export async function updateNormaRepo(id: number, payload: Partial<NormaRepoItem>) {
  return appFetch(`${API}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export async function deleteNormaRepo(id: number) {
  return appFetch(`${API}/${id}`, { method: 'DELETE', asJson: false });
}

export async function uploadEvidenciaNorma(id: number, file: File, comentario?: string) {
  const fd = new FormData();
  fd.append('file', file);
  if (comentario) fd.append('comentario', comentario);
  return appFetch(`${API}/${id}/evidencias`, { method: 'POST', body: fd, asJson: true });
}

export async function listEvidenciasNorma(id: number): Promise<{ items: EvidenciaRepoItem[] }> {
  return appFetch(`${API}/${id}/evidencias`);
}

export async function deleteEvidenciaNorma(evidenciaId: number) {
  return appFetch(`${API}/evidencias/${evidenciaId}`, { method: 'DELETE', asJson: false });
}

export function buildRepoReportUrl(ids?: number[], filters?: { search?: string; categoria?: string; severidad?: string; }) {
  const q = new URLSearchParams();
  if (ids && ids.length) q.set('ids', ids.join(','));
  if (filters?.search) q.set('search', filters.search);
  if (filters?.categoria) q.set('categoria', filters.categoria);
  if (filters?.severidad) q.set('severidad', filters.severidad);
  const base = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001');
  return `${base}/api/normas-repo/report?${q.toString()}`;
}
