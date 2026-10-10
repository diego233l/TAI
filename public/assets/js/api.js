// Cliente de la API JSON.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function call(method, path, body, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: !!opts.keepalive,
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta no JSON */ }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'Error ' + res.status);
  return data;
}

export const api = {
  get: (p) => call('GET', p),
  post: (p, b = {}, o) => call('POST', p, b, o),
};
