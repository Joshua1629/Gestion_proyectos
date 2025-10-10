export type AppFetchOptions = RequestInit & { asJson?: boolean };

export async function appFetch(url: string, options: AppFetchOptions = {}) {
  const opts: RequestInit = { ...options };
  const asJson = options.asJson !== false; // por defecto intentamos JSON

  // Preferir el puente IPC si existe (Electron preload)
  const api = (globalThis as any).api;
  if (api && typeof api.fetch === 'function') {
    const res = await api.fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.body,
      credentials: (opts as any).credentials,
    });
    if (!res.ok) {
      throw { status: res.status, statusText: res.statusText, ...(typeof res.body === 'object' ? res.body : { error: res.body }) };
    }
    return asJson ? res.body : res;
  }

  // Fallback a fetch del navegador
  const r = await fetch(url, opts);
  if (!r.ok) {
    let data: any = null;
    try { data = await r.json(); } catch { data = await r.text(); }
    throw { status: r.status, statusText: r.statusText, ...(typeof data === 'object' ? data : { error: data }) };
  }
  return asJson ? r.json() : r;
}
