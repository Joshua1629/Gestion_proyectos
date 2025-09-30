import React, { useEffect, useState } from 'react';
import { listProyectos, createProyecto, deleteProyecto } from '../services/proyectos';

export default function ProyectosList() {
  const [data, setData] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listProyectos(p, limit);
      setData(res.data);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (e: any) {
      setError(e?.message || JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProyecto({ nombre, cliente });
      setNombre(''); setCliente('');
      load(1);
    } catch (err: any) {
      setError(err?.errors ? JSON.stringify(err.errors) : err?.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminar proyecto?')) return;
    try {
      await deleteProyecto(id);
      load(page);
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <h2>Proyectos</h2>
      {error && <div style={{color:'red'}}>{error}</div>}
      <form onSubmit={handleCreate}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" required />
        <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Cliente" required />
        <button type="submit" disabled={loading}>Crear</button>
      </form>

      {loading ? <p>Cargando...</p> : (
        <>
          <table>
            <thead><tr><th>ID</th><th>Nombre</th><th>Cliente</th><th>Acciones</th></tr></thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.nombre}</td>
                  <td>{p.cliente}</td>
                  <td>
                    <button /* abrir detalle/editar */>Editar</button>
                    <button onClick={() => handleDelete(p.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <button disabled={page <= 1} onClick={() => load(page - 1)}>Anterior</button>
            <span> {page} / {totalPages} </span>
            <button disabled={page >= totalPages} onClick={() => load(page + 1)}>Siguiente</button>
          </div>
        </>
      )}
    </div>
  );
}