const API = "http://localhost:3001/api/proyectos";

export async function listProyectos(page = 1, limit = 10, search = "") {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) q.set("search", search);
  const res = await fetch(`${API}?${q.toString()}`);
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function getProyecto(id: number) {
  const res = await fetch(`${API}/${id}`);
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function createProyecto(payload: {
  nombre: string;
  cliente: string;
  fecha_inicio?: string;
  fecha_fin?: string;
}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function updateProyecto(id: number, payload: any) {
  const res = await fetch(`${API}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function deleteProyecto(id: number) {
  const res = await fetch(`${API}/${id}`, { method: "DELETE" });
  if (!res.ok) throw await res.json();
  return res.json();
}
