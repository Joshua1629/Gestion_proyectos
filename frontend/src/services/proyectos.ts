import { appFetch } from '../utils/appFetch';

const API = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001') + '/api/proyectos';

export interface Proyecto {
  id: number;
  nombre: string;
  cliente: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  progreso_general?: number;
  total_tareas?: number;
  tareas_completadas?: number;
  total_fases?: number;
  fases_completadas?: number;
  fases?: Fase[];
  tareas?: TareaResumen[];
}

export interface Fase {
  id: number;
  proyecto_id: number;
  nombre: 'Planificación' | 'Ejecución' | 'Cierre';
  estado: 'Pendiente' | 'En progreso' | 'Completado';
  fecha_inicio?: string;
  fecha_fin?: string;
}

export interface TareaResumen {
  id: number;
  proyecto_id: number;
  nombre: string;
  responsable?: number;
  responsable_nombre?: string;
  responsable_email?: string;
  prioridad: 'Baja' | 'Media' | 'Alta';
  fecha_limite?: string;
  progreso: number;
}

// Obtener lista de proyectos con paginación y búsqueda
export async function getProyectos(page = 1, limit = 10, search = '') {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(search && { search })
  });
  
  const url = `${API}?${params}`;
  console.log('🔍 Llamando API proyectos:', url);
  
  try {
    const data = await appFetch(url);
    console.log(' Datos recibidos:', data);
    return data;
  } catch (error) {
    console.error('❌ Error en getProyectos:', error);
    throw error;
  }
}

// Obtener proyecto por ID con fases y tareas
export async function getProyecto(id: number): Promise<Proyecto> {
  return appFetch(`${API}/${id}`);
}

// Crear nuevo proyecto (con fases automáticas)
export async function createProyecto(proyecto: Partial<Proyecto>): Promise<Proyecto> {
  return appFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proyecto)
  });
}

// Actualizar proyecto
export async function updateProyecto(id: number, proyecto: Partial<Proyecto>): Promise<Proyecto> {
  return appFetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proyecto)
  });
}

// Eliminar proyecto
export async function deleteProyecto(id: number) {
  return appFetch(`${API}/${id}`, { method: 'DELETE' });
}

// ===== GESTIÓN DE FASES =====

// Actualizar estado de una fase
export async function updateFase(proyectoId: number, faseId: number, fase: Partial<Fase>): Promise<Fase> {
  return appFetch(`${API}/${proyectoId}/fases/${faseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fase)
  });
}

// Función helper para calcular progreso de proyecto
export function calcularProgresoProyecto(proyecto: Proyecto): number {
  if (!proyecto.total_tareas || proyecto.total_tareas === 0) return 0;
  return Math.round((proyecto.tareas_completadas || 0) / proyecto.total_tareas * 100);
}

// Función helper para obtener color de prioridad
export function getColorPrioridad(prioridad: 'Baja' | 'Media' | 'Alta'): string {
  switch (prioridad) {
    case 'Alta': return '#dc3545';    // Rojo
    case 'Media': return '#ffc107';   // Amarillo
    case 'Baja': return '#28a745';    // Verde
    default: return '#6c757d';        // Gris
  }
}

// Función helper para obtener color de estado de fase
export function getColorEstadoFase(estado: 'Pendiente' | 'En progreso' | 'Completado'): string {
  switch (estado) {
    case 'Completado': return '#28a745';   // Verde
    case 'En progreso': return '#007bff';  // Azul
    case 'Pendiente': return '#6c757d';    // Gris
    default: return '#6c757d';
  }
}