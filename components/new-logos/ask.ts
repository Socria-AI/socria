// components/new-logos/ask.ts — ONE TURN WITH THE ASSISTANT, from anywhere on a canvas.
//
// The turn is the existing one: the person's message is saved to the canonical conversation first (never lost), the
// existing chat endpoint answers (same accounts, limits and reasoning), and the reply is saved after it. What the
// canvas adds is WHAT THE TURN IS ABOUT: an object asked from is sent as the endpoint's focus brief (what "this"
// means, with a few lines of what it says) and kept on the message as `about` — the existing Point & Ask fields — so
// the other interface shows it too and later turns remember it. Where the exchange appears on the canvas is the
// canvas's business (lib/new-logos/canvas.ts), never the message's.
//
// SOURCES travel the existing way too: a source mentioned is a document attachment on the person's message (so the
// other interface shows it), and for every turn the passages of the conversation's library documents that bear on
// the question are fetched (lib/new-logos/source-ops.ts passagesFor) and sent as the endpoint's `docs`, which letters,
// shows and cites them — never whole documents.

import { failureText, forAssistant, newMessage, visibleReply, type StoredMessage } from '@/lib/new-logos/convo';

export interface About {
  /** what the object is called, as the person sees it */
  label: string;
  /** where it is: the workspace or conversation it belongs to */
  of: string;
  /** a few lines of what it says (the focus brief's facts) */
  lines: string[];
}

export interface TurnDeps {
  appendTurns: (id: string, turns: StoredMessage[], create?: { title: string }) => Promise<{ ok: boolean; gone?: boolean }>;
  /** whether the conversation is placed in (or related to) an objective, so its context is worth fetching */
  placed: boolean;
  /** what the conversation's documents say about a question: their outlines and best passages */
  passages?: (q: { docIds: string[]; query: string }) => Promise<{ docs: unknown[] }>;
}

/** The documents a conversation has attached, newest first (at most `n`). */
export function docIdsIn(history: readonly StoredMessage[], n = 6): string[] {
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < n; i--)
    for (const a of Array.isArray(history[i].attachments) ? (history[i].attachments as unknown[]) : []) {
      const d = a && typeof a === 'object' ? (a as { kind?: unknown; doc?: unknown }) : {};
      if (d.kind === 'doc' && typeof d.doc === 'string' && !out.includes(d.doc) && out.length < n) out.push(d.doc);
    }
  return out;
}

export type TurnResult =
  | { ok: true; answer: StoredMessage }
  | { ok: false; stage: 'save' | 'reply'; note: string; retry: boolean };

const focusOf = (a?: About) =>
  a ? { focus: { kind: 'part', label: a.label.slice(0, 80), of: a.of.slice(0, 90), lines: a.lines.slice(0, 12).map((l) => l.slice(0, 220)) } } : {};

/** The person's message, with what it is about kept on it (Point & Ask), and the sources it attaches. */
export function askMessage(text: string, about: About | undefined, now: number, attachments?: unknown[]): StoredMessage {
  const m = newMessage('user', text, now);
  return {
    ...m,
    ...(about ? { about: { kind: 'part', label: about.label.slice(0, 120), of: about.of.slice(0, 90) } } : {}),
    ...(attachments?.length ? { attachments } : {}),
  };
}

/** Save the person's message (creating the conversation when `create` is given). */
export async function saveAsk(deps: TurnDeps, convId: string, ask: StoredMessage, create?: { title: string }): Promise<{ ok: true } | { ok: false; note: string }> {
  const saved = await deps.appendTurns(convId, [ask], create);
  if (saved.ok) return { ok: true };
  return { ok: false, note: saved.gone ? 'This conversation was deleted elsewhere.' : 'Your message could not be saved just now. Try again.' };
}

/**
 * The reply to `history` (whose last message is the person's), streamed through `onText`, then saved.
 * `about` is what the last message was asked from, if anything.
 */
export async function reply(
  deps: TurnDeps,
  convId: string,
  history: StoredMessage[],
  about: About | undefined,
  onText: (text: string) => void,
  signal?: AbortSignal
): Promise<TurnResult> {
  try {
    let objective: unknown = null;
    if (deps.placed) {
      const c = await fetch(`/api/new-logos/context?conversation=${encodeURIComponent(convId)}&turns=${history.length}`, { cache: 'no-store', signal }).catch(() => null);
      const j = c && c.ok ? await c.json().catch(() => null) : null;
      objective = j?.turn ?? null;
    }
    // the passages of the conversation's documents that bear on this question (never the whole documents)
    let docs: unknown[] = [];
    const docIds = docIdsIn(history);
    const last = [...history].reverse().find((m) => m.role === 'user');
    if (deps.passages && docIds.length && last) docs = (await deps.passages({ docIds, query: last.content }).catch(() => ({ docs: [] }))).docs;
    const res = await fetch('/api/logos/chat', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: convId, messages: forAssistant(history), ...(objective ? { objective } : {}), ...focusOf(about), ...(docs.length ? { docs } : {}) }),
    });
    if (!res.ok || !res.body) return { ok: false, stage: 'reply', note: failureText(res.status), retry: res.status !== 413 };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    let stopped = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        onText(visibleReply(acc));
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') throw e;
      stopped = true;
    }
    const text = visibleReply(acc).trim();
    if (!text) return { ok: false, stage: 'reply', note: stopped ? 'Stopped before a reply arrived.' : failureText(500), retry: true };
    const answer = newMessage('assistant', text, Date.now());
    const saved = await deps.appendTurns(convId, [answer]);
    if (!saved.ok) return { ok: false, stage: 'reply', note: saved.gone ? 'This conversation was deleted elsewhere; the reply was not saved.' : 'The reply could not be saved just now.', retry: true };
    return { ok: true, answer };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, stage: 'reply', note: 'Stopped before a reply arrived.', retry: true };
    return { ok: false, stage: 'reply', note: failureText(0), retry: true };
  }
}
