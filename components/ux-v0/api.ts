'use client';
// components/ux-v0/api.ts — calling SocriaUX v0's routes, with every failure said plainly.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; signIn?: boolean; limit?: boolean };

export async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: 'You appear to be offline. Your work is saved in this browser.', status: 0 };
  }
  const j = await res.json().catch(() => null);
  if (res.ok && j && !j.error) {
    // what the server says about this call's model or budget (made on the economy model, a budget nearly used):
    // said to the designer wherever the call came from (components/ux-v0/Workspace.tsx listens)
    if (typeof j.notice === 'string' && j.notice && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ux-v0-notice', { detail: j.notice.slice(0, 400) }));
    return { ok: true, data: j as T };
  }
  const error =
    res.status === 401
      ? 'Reasoning with SocriaUX needs a Socria account.'
      : res.status === 429 && !j?.error
        ? 'That is the limit for now. Your work is saved; try again shortly.'
        : j?.error || j?.message || 'SocriaUX could not answer just now. Your work is saved; try again in a moment.';
  return { ok: false, error, status: res.status, signIn: res.status === 401, limit: res.status === 429 || !!j?.limit };
}
