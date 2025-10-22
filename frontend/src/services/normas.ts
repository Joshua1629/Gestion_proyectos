import { appFetch } from '../utils/appFetch';

const API = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001') + '/api/normas';

export interface Norma {
  id: number;
  titulo: string;
  descripcion?: string | null;
  etiquetas?: string | null;
  fileUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string | null;
}

export async function uploadNorma(params: { file: File; titulo: string; descripcion?: string; etiquetas?: string; proyectoId?: number; tareaId?: number; }) {
  const fd = new FormData();
  fd.append('file', params.file);
  fd.append('titulo', params.titulo);
  if (params.descripcion) fd.append('descripcion', params.descripcion);
  if (params.etiquetas) fd.append('etiquetas', params.etiquetas);
  if (params.proyectoId) fd.append('proyectoId', String(params.proyectoId));
  if (params.tareaId) fd.append('tareaId', String(params.tareaId));
  return appFetch(`${API}/upload`, { method: 'POST', body: fd, asJson: true });
}

export async function searchNormas(params: { search?: string; page?: number; limit?: number; }) {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  return appFetch(`${API}?${q.toString()}`);
}

export async function getNormasByProyecto(proyectoId: number): Promise<Norma[]> {
  return appFetch(`${API}/by-project/${proyectoId}`);
}

export async function getNormasByTarea(tareaId: number): Promise<Norma[]> {
  return appFetch(`${API}/by-task/${tareaId}`);
}

export async function attachNorma(normaId: number, payload: { proyectoId?: number; tareaId?: number }) {
  return appFetch(`${API}/${normaId}/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function detachNorma(normaId: number, payload: { proyectoId?: number; tareaId?: number }) {
  return appFetch(`${API}/${normaId}/detach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteNorma(normaId: number) {
  return appFetch(`${API}/${normaId}`, { method: 'DELETE', asJson: false });
}
