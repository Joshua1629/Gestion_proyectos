function headersToPlain(h: any): Record<string, string> {
  try {
    if (!h) return {};
    if (typeof Headers !== 'undefined' && h instanceof Headers) {
      const out: Record<string, string> = {};
      (h as any).forEach((v: string, k: string) => { out[k] = v; });
      return out;
    }
    if (typeof h === 'object') return { ...(h as Record<string, string>) };
  } catch {}
  return {};
}
export type AppFetchOptions = RequestInit & { asJson?: boolean };

export async function appFetch(url: string, options: AppFetchOptions = {}) {
  const opts: RequestInit = { ...options };
  const asJson = options.asJson !== false; // por defecto intentamos JSON

  // Adjuntar Authorization si existe token
  try {
    const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('token') : null;
    const hdrs = new Headers((opts.headers as any) || {});
    if (token && !hdrs.has('Authorization')) {
      hdrs.set('Authorization', `Bearer ${token}`);
    }
    opts.headers = hdrs as any;
  } catch {}

  // Preferir puente IPC si existe (Electron)
  const api = (globalThis as any).api;
  const isFormData = typeof FormData !== 'undefined' && (opts as any).body instanceof FormData;

  // IPC normal (no multipart): convertir headers a objeto plano
  if (api && typeof api.fetch === 'function' && !isFormData) {
    try {
      const res = await api.fetch(url, {
        method: opts.method || 'GET',
        headers: headersToPlain(opts.headers),
        body: opts.body,
        credentials: (opts as any).credentials,
      });
      
      // Si res es null o undefined, el backend no respondió
      if (!res || typeof res !== 'object') {
        throw { 
          status: 503, 
          statusText: 'Service Unavailable', 
          error: 'El backend no está respondiendo. Verifica que el servidor esté ejecutándose.' 
        };
      }
      
      // El IPC handler puede devolver { ok: false, error: "..." } sin status/statusText
      if (!res.ok) {
        const errorObj: any = {
          status: res.status || 500,
          statusText: res.statusText || 'Error',
        };
        
        // Si hay un error directo (del IPC handler)
        if (res.error) {
          errorObj.error = res.error;
        } 
        // Si hay un body con error
        else if (typeof res.body === 'object' && res.body) {
          Object.assign(errorObj, res.body);
        }
        // Si el body es un string con el error
        else if (res.body) {
          errorObj.error = res.body;
        }
        // Error genérico
        else {
          errorObj.error = 'Error desconocido del servidor';
        }
        
        throw errorObj;
      }
      
      return asJson ? res.body : res;
    } catch (err: any) {
      // Si es un objeto error ya formateado, re-lanzarlo
      if (err && typeof err === 'object' && (err.status || err.error || err.statusText)) {
        throw err;
      }
      // Si es un error de red/tiempo de espera, formatearlo
      throw {
        status: err?.status || 503,
        statusText: err?.statusText || 'Service Unavailable',
        error: err?.message || err?.toString() || 'No se pudo conectar con el servidor. Verifica que el backend esté ejecutándose.'
      };
    }
  }

  // IPC multipart: ya paso Authorization explícita
  if (api && typeof api.uploadMultipart === 'function' && isFormData) {
    const fd = (opts as any).body as FormData;
    const fields: Record<string, string> = {};
    const files: Array<{ fieldName: string; name: string; type: string; buffer: ArrayBuffer }> = [];
    (fd as any).forEach((value: any, key: string) => {
      if (typeof File !== 'undefined' && value instanceof File) {
        files.push({ fieldName: key, name: value.name, type: value.type || 'application/octet-stream', buffer: new ArrayBuffer(0) });
      } else {
        fields[key] = String(value);
      }
    });
    for (const f of files) {
      const v: any = (fd as any).get(f.fieldName);
      if (v && typeof v.arrayBuffer === 'function') {
        f.buffer = await v.arrayBuffer();
        f.type = v.type || f.type;
      }
    }
    let headers: Record<string, string> | undefined = undefined;
    try {
      const h = new Headers(opts.headers as any);
      const auth = h.get('Authorization');
      if (auth) headers = { Authorization: auth };
    } catch {}
    const res = await api.uploadMultipart({ url, method: opts.method || 'POST', fields, files, headers });
    if (!res.ok) {
      const body = res.body;
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

