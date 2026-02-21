import { appFetch } from '../utils/appFetch';

const API = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001') + '/api/evidencias';

export type Categoria = 'OK' | 'LEVE' | 'CRITICO';

export interface Evidencia {
  id: number;
  proyectoId: number;
  tareaId?: number | null;
  categoria: Categoria;
  tipo?: string; // tipo de evidencia (INCUMPLIMIENTO, INSTITUCIONAL, TECNICA, GENERAL)
  comentario?: string | null;
  imageUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  createdBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
  groupKey?: string;
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

export async function uploadEvidencia(params: { file: File; proyectoId: number; tareaId?: number; categoria?: Categoria; comentario?: string; tipo?: string }) {
  const fd = new FormData();
  fd.append('file', params.file);
  fd.append('proyectoId', String(params.proyectoId));
  if (params.tareaId) fd.append('tareaId', String(params.tareaId));
  if (params.categoria) fd.append('categoria', params.categoria);
  if (params.comentario) fd.append('comentario', params.comentario);
  if (params.tipo) fd.append('tipo', params.tipo);

  // No seteamos Content-Type para que el navegador ponga el boundary multipart
  return appFetch(`${API}/upload`, {
    method: 'POST',
    body: fd,
    asJson: true
  });
}

export async function getEvidencias(filters: { proyectoId: number; tareaId?: number; categoria?: Categoria; tipo?: string; page?: number; limit?: number; order?: 'recent' | 'report' }) {
  const q = new URLSearchParams();
  q.set('proyectoId', String(filters.proyectoId));
  if (filters.tareaId) q.set('tareaId', String(filters.tareaId));
  if (filters.categoria) q.set('categoria', filters.categoria);
  if (filters.tipo) q.set('tipo', String(filters.tipo));
  if (filters.page) q.set('page', String(filters.page));
  if (filters.limit) q.set('limit', String(filters.limit));
  if (filters.order) q.set('order', filters.order);
  return appFetch(`${API}?${q.toString()}`);
}

// Obtener evidencias agrupadas (grupos)
export interface EvidenciaGroup {
  groupKey: string;
  proyectoId: number;
  tareaId?: number | null;
  comentario?: string | null;
  evidenciaIds: number[];
  images: string[]; // hasta 3 urls
  normasCount: number; // cantidad de normas únicas asociadas al grupo
  count: number; // cantidad de fotos en el grupo
}

export async function getEvidenciaGroups(filters: { proyectoId: number; tareaId?: number; categoria?: Categoria; tipo?: string }) {
  const q = new URLSearchParams();
  q.set('proyectoId', String(filters.proyectoId));
  if (filters.tareaId) q.set('tareaId', String(filters.tareaId));
  if (filters.categoria) q.set('categoria', filters.categoria);
  if (filters.tipo) q.set('tipo', String(filters.tipo));
  q.set('group', 'true');
  return appFetch(`${API}?${q.toString()}`);
}

// Subir múltiples imágenes para un mismo grupo
export async function uploadEvidenciasMultiple(params: { files: File[]; proyectoId: number; tareaId?: number; comentario?: string; tipo?: string }) {
  const fd = new FormData();
  for (const f of params.files) fd.append('files', f);
  fd.append('proyectoId', String(params.proyectoId));
  if (params.tareaId) fd.append('tareaId', String(params.tareaId));
  if (params.comentario) fd.append('comentario', params.comentario);
  if (params.tipo) fd.append('tipo', params.tipo);
  return appFetch(`${API}/upload-multiple`, { method: 'POST', body: fd, asJson: true });
}

// Agrupado por tipo (devuelve items: [{ tipo, groups: [...] }])
export async function getEvidenciasByTipo(filters: { proyectoId: number; tareaId?: number }) {
  const q = new URLSearchParams();
  q.set('proyectoId', String(filters.proyectoId));
  if (filters.tareaId) q.set('tareaId', String(filters.tareaId));
  return appFetch(`${API}/by-tipo?${q.toString()}`);
}

// Exportar PDF por tipo
export async function exportEvidenciasPdf(proyectoId: number, tipo: string) {
  const q = new URLSearchParams();
  q.set('proyectoId', String(proyectoId));
  q.set('tipo', tipo);
  // responderá un PDF, no JSON
  return appFetch(`${API}/export/pdf?${q.toString()}`, { asJson: false });
}

// Normas por grupo
export async function listNormasRepoByGroup(groupKey: string): Promise<{ items: EvidenciaNormaRepoLink[] }> {
  return appFetch(`${API}/groups/${encodeURIComponent(groupKey)}/normas-repo`);
}

export async function attachNormaRepoToGroup(groupKey: string, payload: { normaRepoId: number; clasificacion?: Categoria; observacion?: string }) {
  return appFetch(`${API}/groups/${encodeURIComponent(groupKey)}/normas-repo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export async function detachNormaRepoFromGroup(groupKey: string, normaRepoId: number) {
  return appFetch(`${API}/groups/${encodeURIComponent(groupKey)}/normas-repo/${normaRepoId}`, { method: 'DELETE', asJson: false });
}

export async function deleteEvidenciaGroup(groupKey: string) {
  return appFetch(`${API}/groups/${encodeURIComponent(groupKey)}`, { method: 'DELETE', asJson: false });
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

/** Reordenar evidencias del proyecto; el orden se usa en reportes PDF. */
export async function swapEvidencias(proyectoId: number, id1: number, id2: number) {
  return appFetch(`${API}/swap`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyectoId, id1, id2 }),
    asJson: true
  });
}

export async function reorderEvidencias(proyectoId: number, orderedIds: number[]) {
  return appFetch(`${API}/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyectoId, orderedIds }),
    asJson: true
  });
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

// Listar evidencias por groupKey
export async function listEvidenciasByGroup(groupKey: string) {
  return appFetch(`${API}/groups/${encodeURIComponent(groupKey)}`);
}
