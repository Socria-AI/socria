'use client';
// components/ux-v0/api.ts — calling SocriaUX v0's routes, with every failure said plainly.
//
// A model route streams its progress when asked (lib/ux-v0/stage-server.ts): one JSON line per event —
// accepted, checking, the model asked, still thinking, writing, finishing — then the result. post() asks for
// it, hands each event to `onProgress`, and resolves with the result, exactly as a plain JSON answer would.
//
//   signal       cancels the request: the server stops the model, and the answer says "Cancelled"
//   operationId  names the action: the same action sent again (a double-click, a retry after a dropped
//                connection) is answered once, and charged once
//   timeoutMs    stops waiting past the server's own deadline (default 70 s): SocriaUX answers by 55 s, and
//                the platform ends a request at 60, so a wait past 70 means the connection itself is lost
//
// Every model answer carries its operation record (lib/ux-v0/telemetry.ts). post() adds what only the browser
// can measure — the whole round trip, and so the network's share — and tells the workspace's diagnostics
// (the 'ux-v0-telemetry' event). Nothing in it is a prompt or the designer's words.

import type { OperationRecord } from '@/lib/ux-v0/telemetry';

export interface Progress {
  type: 'accepted' | 'progress';
  phase?: 'checking' | 'asked' | 'thinking' | 'writing' | 'fallback' | 'finishing';
  model?: string;
  tier?: string;
  chars?: number;
  elapsedMs?: number;
  coalesced?: boolean;
}

export interface PostOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  operationId?: string;
  timeoutMs?: number;
}

export type ApiResult<T> =
  | { ok: true; data: T; ms: number }
  | { ok: false; error: string; status: number; signIn?: boolean; limit?: boolean; cancelled?: boolean; timeout?: boolean; busy?: boolean; retryAfter?: number; ms: number };

/** What the diagnostics hear about each call: the server's record and the browser's own round trip. */
export interface CallTiming {
  path: string;
  clientMs: number;
  /** the round trip less the server's own time: the network, and the platform's queue */
  networkMs: number | null;
  /** from sending to the first byte of the answer (the server's "accepted", when streamed) */
  firstByteMs: number | null;
  status: number;
  record: OperationRecord | null;
}

const DEFAULT_TIMEOUT = 70_000;

/** A new name for one action of the designer's: kept for that action's retries. */
export const operationId = (kind: string) => `${kind.replace(/[^a-z0-9-]/gi, '').slice(0, 20)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

function tell(t: CallTiming) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ux-v0-telemetry', { detail: t }));
}

export async function post<T>(path: string, body: unknown, o: PostOptions = {}): Promise<ApiResult<T>> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  // one controller for the designer's cancel and the wait's own limit, so either stops the request
  const ctl = new AbortController();
  let timedOut = false;
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT;
  const timer = setTimeout(() => ((timedOut = true), ctl.abort()), timeoutMs);
  const onAbort = () => ctl.abort();
  if (o.signal?.aborted) ctl.abort();
  o.signal?.addEventListener('abort', onAbort, { once: true });
  const stopped = (): ApiResult<T> =>
    timedOut
      ? { ok: false, error: `SocriaUX did not answer within ${Math.round(timeoutMs / 1000)} seconds. Nothing changed; check the connection and try again.`, status: 0, timeout: true, ms: ms() }
      : { ok: false, error: 'Cancelled. Nothing changed.', status: 499, cancelled: true, ms: ms() };
  let res: Response;
  let firstByteMs: number | null = null;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json', ...(o.operationId ? { 'X-Operation-Id': o.operationId } : {}) },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
    if (ctl.signal.aborted) return stopped();
    return { ok: false, error: 'You appear to be offline. Your work is saved in this browser.', status: 0, ms: ms() };
  }
  let status = res.status;
  let j: any = null;
  try {
    if (/application\/x-ndjson/.test(res.headers.get('content-type') ?? '') && res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        firstByteMs ??= ms();
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let ev: any;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === 'result') {
            status = Number(ev.status) || 200;
            j = ev.body ?? null;
          } else if (ev.type === 'accepted' || ev.type === 'progress') o.onProgress?.(ev as Progress);
        }
      }
      if (j === null) {
        clearTimeout(timer);
        o.signal?.removeEventListener('abort', onAbort);
        if (ctl.signal.aborted) return stopped();
        tell({ path, clientMs: ms(), networkMs: null, firstByteMs, status: 0, record: null });
        return { ok: false, error: 'The answer was cut off on its way. Nothing changed; try again.', status: 0, ms: ms() };
      }
    } else {
      j = await res.json().catch(() => null);
      firstByteMs = ms();
    }
  } catch {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
    if (ctl.signal.aborted) return stopped();
    return { ok: false, error: 'The connection dropped while SocriaUX was answering. Nothing changed; try again.', status: 0, ms: ms() };
  }
  clearTimeout(timer);
  o.signal?.removeEventListener('abort', onAbort);
  const record = j && typeof j.telemetry === 'object' ? (j.telemetry as OperationRecord) : null;
  tell({ path, clientMs: ms(), networkMs: record ? Math.max(0, ms() - record.totalMs) : null, firstByteMs, status, record });
  if (status >= 200 && status < 300 && j && !j.error) {
    // what the server says about this call's model or budget (made on the economy model, a budget nearly used):
    // said to the designer wherever the call came from (components/ux-v0/Workspace.tsx listens)
    if (typeof j.notice === 'string' && j.notice && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ux-v0-notice', { detail: j.notice.slice(0, 400) }));
    if (j.budget && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ux-v0-budget', { detail: j.budget }));
    return { ok: true, data: j as T, ms: ms() };
  }
  if (status === 499 || j?.cancelled) return stopped();
  const error =
    status === 401
      ? 'Reasoning with SocriaUX needs a Socria account.'
      : status === 429 && !j?.error
        ? 'That is the limit for now. Your work is saved; try again shortly.'
        : j?.error || j?.message || (status >= 500 ? `SocriaUX’s server did not answer properly (${status}). Nothing changed; try again in a moment.` : 'SocriaUX could not answer just now. Your work is saved; try again in a moment.');
  return { ok: false, error, status, signIn: status === 401, limit: status === 429 || !!j?.limit, timeout: !!j?.timeout, busy: !!j?.busy, retryAfter: typeof j?.retryAfter === 'number' ? j.retryAfter : undefined, ms: ms() };
}
