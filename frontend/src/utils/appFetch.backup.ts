export type AppFetchOptions = RequestInit & { asJson?: boolean };

export async function appFetch(url: string, options: AppFetchOptions = {}) {
  const opts: RequestInit = { ...options };
  const asJson = options.asJson !== false; // por defecto intentamos JSON
  // Adjuntar Authorization si existe token y no fue especificado
  try {
    const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('token') : null;
    const headers = new Headers(opts.headers || {} as any);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    opts.headers = headers as any;
  } catch {}

  // Preferir el puente IPC si existe (Electron preload)
  const api = (globalThis as any).api;
  const isFormData = typeof FormData !== 'undefined' && (opts as any).body instanceof FormData;
  // Importante: cuando el body es FormData (multipart), evitar el puente IPC porque no serializa el stream correctamente
  if (api && typeof api.fetch === 'function' && !isFormData) {
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

  // Si estamos en Electron y el body es FormData, usar IPC upload para evitar problemas de red del renderer
  if (api && typeof api.uploadMultipart === 'function' && isFormData) {
    const fd = (opts as any).body as FormData;
    const fields: Record<string, string> = {};
    const files: Array<{ fieldName: string; name: string; type: string; buffer: ArrayBuffer }> = [];
    (fd as any).forEach((value: any, key: string) => {
      if (typeof File !== 'undefined' && value instanceof File) {
        // se completará con arrayBuffer más abajo
        files.push({ fieldName: key, name: value.name, type: value.type || 'application/octet-stream', buffer: new ArrayBuffer(0) });
      } else {
        fields[key] = String(value);
      }
    });
    // Completar buffers
    for (const f of files) {
      const v: any = (fd as any).get(f.fieldName);
      if (v && typeof v.arrayBuffer === 'function') {
        f.buffer = await v.arrayBuffer();
        f.type = v.type || f.type;
      }
    }
    // Extraer Authorization de headers ya calculados arriba
    let headers: Record<string, string> | undefined = undefined;
    try {
      const h = new Headers(opts.headers as any);
      const auth = h.get('Authorization');
      if (auth) headers = { Authorization: auth };
    } catch {}
    const res = await api.uploadMultipart({ url, method: opts.method || 'POST', fields, files, headers });
    if (!res.ok) {
      const body = res.body;
      // Incluir res.error si existe
      throw { status: res.status, statusText: res.statusText, ...(typeof body === 'object' ? body : { error: body }), ...(res.error ? { error: res.error } : {}) };
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
