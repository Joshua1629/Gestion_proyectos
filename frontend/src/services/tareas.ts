const API = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001') + '/api/tareas';

export interface Tarea {
  id: number;
  proyecto_id: number;
  nombre: string;
  descripcion?: string;
  responsable?: number;
  responsable_nombre?: string;
  responsable_email?: string;
  prioridad: 'Baja' | 'Media' | 'Alta';
  fase: 'Planificación' | 'Ejecución' | 'Cierre';
  fecha_limite?: string;
  progreso: number;
  total_comentarios?: number;
  comentarios?: Comentario[];
}

export interface Comentario {
  id: number;
  tarea_id: number;
  usuario_id: number;
  usuario_nombre?: string;
  usuario_email?: string;
  comentario: string;
  fecha_comentario: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
}

// Obtener tareas de un proyecto
export async function getTareasByProyecto(proyectoId: number, page = 1, limit = 20) {
  const res = await fetch(`${API}/proyecto/${proyectoId}?page=${page}&limit=${limit}`);
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// Obtener tarea por ID con comentarios
export async function getTarea(id: number): Promise<Tarea> {
  const res = await fetch(`${API}/${id}`);
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// Crear nueva tarea
export async function createTarea(tarea: Partial<Tarea>): Promise<Tarea> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tarea)
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// Actualizar tarea
export async function updateTarea(id: number, tarea: Partial<Tarea>): Promise<Tarea> {
  const res = await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tarea)
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// Eliminar tarea
export async function deleteTarea(id: number) {
  const res = await fetch(`${API}/${id}`, {
    method: 'DELETE'
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// ===== COMENTARIOS =====

// Agregar comentario a tarea
export async function addComentario(tareaId: number, usuarioId: number, comentario: string): Promise<Comentario> {
  const res = await fetch(`${API}/${tareaId}/comentarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: usuarioId, comentario })
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// Obtener comentarios de una tarea
export async function getComentarios(tareaId: number, page = 1, limit = 20) {
  const res = await fetch(`${API}/${tareaId}/comentarios?page=${page}&limit=${limit}`);
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// Obtener lista de usuarios para asignación
export async function getUsuarios(): Promise<Usuario[]> {
  const res = await fetch(`${API}/usuarios/lista`);
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}