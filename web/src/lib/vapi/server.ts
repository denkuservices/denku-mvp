// src/lib/vapi/server.ts
import 'server-only';

export const VAPI_BASE_URL = 'https://api.vapi.ai';

function getVapiKey() {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error('Missing VAPI_API_KEY');
  return key;
}

export async function vapiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error(`Vapi error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}
