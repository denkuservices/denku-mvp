// src/lib/vapi/server.ts
import 'server-only';

export const VAPI_BASE_URL = 'https://api.vapi.ai';

function getVapiKey() {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error('Missing VAPI_API_KEY');
  return key;
}

export async function vapiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method || 'GET';
  
  // Parse body to extract keys for logging (if it's a string, try to parse as JSON)
  let bodyKeys: string[] = [];
  let bodyPreview: unknown = null;
  
  if (init.body) {
    try {
      const parsedBody = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      bodyKeys = typeof parsedBody === 'object' && parsedBody !== null ? Object.keys(parsedBody) : [];
      // Sanitize body preview: show structure but not full values
      bodyPreview = typeof parsedBody === 'object' && parsedBody !== null
        ? Object.fromEntries(
            Object.entries(parsedBody).map(([key, value]) => [
              key,
              typeof value === 'string' && value.length > 50
                ? `${value.substring(0, 50)}...`
                : typeof value === 'object' && value !== null
                ? '[Object]'
                : value
            ])
          )
        : parsedBody;
    } catch {
      // If body isn't JSON, just note it exists
      bodyKeys = ['[non-JSON body]'];
      bodyPreview = '[non-JSON body]';
    }
  }
  
  // Log request before fetch (server-only)
  console.log("[VAPI][REQ]", {
    method,
    path,
    bodyKeys,
    bodyPreview,
  });
  
  const res = await fetch(`${VAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${getVapiKey()}`,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Log error after fetch
    console.log("[VAPI][ERR]", {
      method,
      path,
      status: res.status,
      text,
    });
    throw new Error(`Vapi error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}
