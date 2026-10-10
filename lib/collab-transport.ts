// lib/collab-transport.ts
//
// How an event travels between two people — and who is allowed to be one of
// them.
//
// WHAT THIS REPLACED. The first version opened a Supabase Realtime channel
// from the browser, named after a six-character code, using the public anon
// key. The channel was not private, so Supabase applied no policy to it:
// anyone with that key — which every visitor had, because it shipped in the
// bundle by design — could subscribe to any room whose code they guessed or
// were given, and read every message and map edit without appearing in the
// room. The "two people" limit was React state and stopped nobody.
//
// There is now exactly one path, and it goes through Socria's own server:
// a poll for events, a post to add them, both behind a Clerk session and
// both refusing anyone who is not a member of that room
// (app/api/logos/room/events). The browser no longer talks to Supabase at
// all, which is why NEXT_PUBLIC_SUPABASE_ANON_KEY is gone.
//
// The trade is latency: a poll is not a socket, and an event lands within
// about a second rather than instantly. That is the right side of the trade
// for a feature whose alternative was an unauthenticated broadcast, and the
// interface below is unchanged, so a properly-authorized socket can replace
// the polling later without touching the reducer or the UI.
//
// Nothing here trusts what arrives: every inbound payload still goes through
// sanitizeEvent before it reaches the reducer, and the SERVER overwrites the
// author of every event with the session that sent it.
//
// AND NOTHING SENT IS LOST QUIETLY. `send` used to fire a request and ignore
// whatever came back, so a map over the 512 KB batch limit (413) — eight
// scenes at their caps are about 1.2 MB — simply stopped reaching the other
// seat while the sender's own screen showed it. Now sends go out in order,
// batched under the route's limits; a dropped connection, a rate limit or a
// server error is tried again; and anything that still does not go — too
// large, refused, out of retries — is returned from `send` and reported to
// `onError`, so the room can say so.

import { sanitizeBy, type CollabEvent, type CollabEventKind } from './collab';
import { sanitizeMap, type LogosNode } from './logos';
import { cleanAt, cleanMsgId, cleanReplyRef } from './chat-thread';
import { sanitizeSynthesis } from './logos-synthesis';
import { sanitizeWorkspace, type ModelDoc } from './model/docs';
import { sanitizeSpace, type ThoughtObject } from './objects';

/** Most events one request may carry — the events route's own ceiling. */
export const MAX_BATCH = 20;
/** And how much they may weigh together, serialised — the route refuses more with 413. */
export const MAX_BATCH_BYTES = 512 * 1024;

/** Why something sent to the room did not arrive. */
export interface SendFailure {
  /** the HTTP status, or 0 when the request never reached the server */
  status: number;
  /** what happened, in words a person can read */
  error: string;
  /** the kinds of the events that did not go, so a caller can say which part */
  kinds: CollabEventKind[];
  /** and their ids */
  ids: string[];
  /** refused for its size: sending it again will not help */
  tooLarge: boolean;
}

export type SendResult = { ok: true } | ({ ok: false } & SendFailure);

/** A stamp that orders two edits and can still be counted past (+1 stays exact). */
const cleanStamp = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1e15, Math.max(1, Math.floor(v))) : 1;

/** A message's own fields off the wire: its id, when, what it answers, a synthesis card — shaped, or absent. */
function messageExtras(m: Record<string, unknown>, role: 'user' | 'assistant'): Record<string, unknown> {
  const id = cleanMsgId(m.id);
  const at = cleanAt(m.at);
  const replyTo = cleanReplyRef(m.replyTo);
  const synthesis = role === 'assistant' ? sanitizeSynthesis(m.synthesis) : undefined;
  return { ...(id ? { id } : {}), ...(at ? { at } : {}), ...(replyTo ? { replyTo } : {}), ...(synthesis ? { synthesis } : {}) };
}

export interface Transport {
  /**
   * Send one event to everyone else in the room. Resolves once it is in the
   * room's log, or with why it is not — never silently.
   */
  send(ev: CollabEvent): Promise<SendResult>;
  /** called for every event that arrives from someone else */
  onEvent(fn: (ev: CollabEvent) => void): void;
  /** called whenever something sent could not be delivered (after any retries) */
  onError?(fn: (failure: SendFailure) => void): void;
  /** tear it all down */
  close(): void;
  /** the one backend there is; kept for the copy that describes the room */
  readonly kind: 'server';
}

const EVENT_KINDS: CollabEventKind[] = ['hello', 'bye', 'message', 'node.add', 'node.edit', 'node.remove', 'map', 'model.revision', 'object.step'];

/** A model document id, as a workspace keeps it. */
const DOC_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
/** An object id, as an object space keeps it. */
const OBJ_ID = /^[A-Za-z0-9_]{1,16}$/;

/**
 * An event off the wire, trusted for nothing.
 *
 * Returns null for anything that is not a well-formed event of a known kind,
 * so a malformed or hostile payload is dropped before it can reach the
 * reducer. Each kind's own fields are validated with the same functions the
 * rest of the app uses — the map through sanitizeMap, the author through
 * sanitizeBy — so nothing gets a weaker check for arriving over a socket.
 */
export function sanitizeEvent(raw: unknown): CollabEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (typeof kind !== 'string' || !EVENT_KINDS.includes(kind as CollabEventKind)) return null;
  const id = typeof r.id === 'string' ? r.id.slice(0, 80) : '';
  const at = typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0;
  const by = sanitizeBy(r.by);
  if (!id || !by) return null;
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

  switch (kind) {
    case 'hello': {
      const p = r.participant as Record<string, unknown> | undefined;
      const seat = p?.seat === 'host' || p?.seat === 'guest' ? p.seat : null;
      if (!p || typeof p.id !== 'string' || !seat) return null;
      const participant = { id: p.id.slice(0, 64), name: s(p.name, 40) || (seat === 'host' ? 'Host' : 'Guest'), seat };
      // The session, when a host announces itself, gets the same treatment a
      // saved session gets — its map sanitised, its messages trimmed to shape.
      let session: CollabEvent extends { session?: infer S } ? S : undefined;
      const rs = r.session as Record<string, unknown> | undefined;
      if (rs && typeof rs.id === 'string') {
        session = {
          id: rs.id.slice(0, 64),
          title: s(rs.title, 200) || 'A shared line of thinking',
          messages: Array.isArray(rs.messages)
            ? (rs.messages as unknown[])
                .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
                .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
                .slice(-200)
                .map((m) => ({ ...messageExtras(m, m.role as 'user' | 'assistant'), role: m.role as 'user' | 'assistant', content: (m.content as string).slice(0, 12_000), ...(sanitizeBy(m.by) ? { by: sanitizeBy(m.by) } : {}) }))
            : [],
          map: sanitizeMap(rs.map),
          updatedAt: typeof rs.updatedAt === 'number' ? rs.updatedAt : at,
        } as never;
      }
      return { id, at, by, kind, participant, ...(session ? { session } : {}) } as CollabEvent;
    }
    case 'bye':
      return { id, at, by, kind } as CollabEvent;
    case 'message': {
      const m = r.message as Record<string, unknown> | undefined;
      if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
      return { id, at, by, kind, message: { ...messageExtras(m, m.role), role: m.role, content: m.content.slice(0, 12_000) } } as CollabEvent;
    }
    case 'node.add': {
      // One node through the map sanitiser, so a node from the wire is exactly
      // as trustworthy as one from storage.
      const one = sanitizeMap({ nodes: [r.node], edges: [] }).nodes[0] as LogosNode | undefined;
      if (!one) return null;
      return { id, at, by, kind, node: one } as CollabEvent;
    }
    case 'node.edit': {
      const nodeId = s(r.nodeId, 40);
      const label = s(r.label, 120);
      if (!nodeId || !label) return null;
      return { id, at, by, kind, nodeId, label } as CollabEvent;
    }
    case 'node.remove': {
      const nodeId = s(r.nodeId, 40);
      if (!nodeId) return null;
      return { id, at, by, kind, nodeId } as CollabEvent;
    }
    case 'map':
      return { id, at, by, kind, map: sanitizeMap(r.map) } as CollabEvent;
    case 'model.revision': {
      // One document through the same check a stored workspace gets: every
      // revision re-validated by the engine, so a model from the wire is
      // worth exactly what one from storage is.
      const docId = s(r.docId, 48);
      if (!DOC_ID.test(docId)) return null;
      const active = r.active === true;
      let doc: ModelDoc | null | undefined;
      if (r.doc === null) doc = null;
      else if (r.doc !== undefined) {
        const one = sanitizeWorkspace({ docs: [r.doc], active: null }).docs[0];
        if (!one || one.id !== docId) return null;
        doc = one;
      }
      if (doc === undefined && !active) return null;
      return {
        id, at, by, kind, docId,
        ...(doc !== undefined ? { doc } : {}),
        ...(active ? { active: true } : {}),
        stamp: cleanStamp(r.stamp),
      } as CollabEvent;
    }
    case 'object.step': {
      // One object through the same check a stored space gets: every step
      // computed again from the state before it, the history cut where it
      // stops following.
      const objId = s(r.objId, 16);
      if (!OBJ_ID.test(objId)) return null;
      let obj: ThoughtObject | null;
      if (r.obj === null) obj = null;
      else {
        const one = sanitizeSpace({ objs: [r.obj] })?.objs[0];
        if (!one || one.id !== objId) return null;
        obj = one;
      }
      return { id, at, by, kind, objId, obj, stamp: cleanStamp(r.stamp) } as CollabEvent;
    }
    default:
      return null;
  }
}

/** How long an event weighs on the wire — the measure the route applies. */
export function eventBytes(ev: CollabEvent): number {
  try {
    return JSON.stringify(ev).length;
  } catch {
    return Infinity;
  }
}

/** What a failed send says to the person, by what the server answered. */
function failureWords(status: number, bytes?: number): string {
  if (status === 413) {
    const kb = bytes && Number.isFinite(bytes) && bytes >= 1024 ? ` (${Math.round(bytes / 1024)} KB)` : '';
    return `That is too large to share in a room${kb} — the most one change may carry is ${MAX_BATCH_BYTES / 1024} KB. It is on your screen, but the other person will not see it.`;
  }
  if (status === 0) return 'The room could not be reached, so the other person has not seen your last change.';
  if (status === 401) return 'You are signed out, so nothing more reaches the room. Sign in again to keep sharing.';
  if (status === 404) return 'This room is no longer open, so nothing more reaches it.';
  if (status === 422) return 'The room would not take part of your last change: it did not pass the check every change gets.';
  if (status === 429) return 'Too much was sent at once, so the room did not take your last change.';
  return 'Your last change could not be shared just now.';
}

// ── the only transport: through our own server ──────────────────────

/**
 * How often to ask for what the other person has said.
 *
 * Two seconds, not one: the events route spends the shared 'aux' rate-limit
 * budget, which allows 40 requests a minute for a signed-in caller. A poll
 * every 1.2s is 50/min from the room alone — so a room would throttle itself
 * into silence within a minute, and take the rest of Logos down with it,
 * because the map and memory passes draw on the same pool. 2s leaves room for
 * the surface's other traffic.
 */
export const POLL_MS = 2000;

/** Waits before a send that failed for a passing reason is tried again. */
export const SEND_RETRY_MS = [1000, 3000, 8000];

interface Outbox {
  ev: CollabEvent;
  bytes: number;
  done: (r: SendResult) => void;
}

class ServerTransport implements Transport {
  readonly kind = 'server' as const;
  private fn: ((ev: CollabEvent) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private busy = false;
  private stopped = false;
  private onVisible: (() => void) | null = null;
  private presenceFn: ((who: { id: string; name: string; seat: 'host' | 'guest' }[]) => void) | null =
    null;
  /** what is waiting to go, in the order it was sent */
  private outbox: Outbox[] = [];
  /** a request is in flight: one at a time, so the room hears things in order */
  private sending = false;
  /** a failed send is waiting to be tried again */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  /** the server refused a batch for its size: send one event per request until the outbox empties */
  private single = false;
  private errorFn: ((f: SendFailure) => void) | null = null;

  /**
   * `since` lets a caller start from the room's tail instead of replaying it
   * from the beginning. A guest joining a long-running room wants the state,
   * which the host's hello carries; it does not want every keystroke since
   * the room opened.
   */
  constructor(
    private roomId: string,
    since = 0
  ) {
    this.cursor = since;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
    if (typeof document !== 'undefined') {
      this.onVisible = () => {
        if (document.visibilityState === 'visible') void this.poll();
      };
      document.addEventListener('visibilitychange', this.onVisible);
    }
  }

  onPresence(fn: (who: { id: string; name: string; seat: 'host' | 'guest' }[]) => void) {
    this.presenceFn = fn;
  }

  private async poll(): Promise<void> {
    // One request in flight at a time: a slow network must not pile up polls
    // and deliver the same events several times over.
    if (this.busy || this.stopped) return;
    // And not at all while nobody is looking. A room left open in a
    // background tab would otherwise poll all day — thousands of requests
    // against a daily budget, for a screen no one is reading. The next
    // foreground poll catches up from the cursor, so nothing is lost.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.busy = true;
    try {
      const res = await fetch(
        `/api/logos/room/events?roomId=${encodeURIComponent(this.roomId)}&since=${this.cursor}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json?.cursor === 'number') this.cursor = json.cursor;
      if (this.presenceFn && Array.isArray(json?.present)) this.presenceFn(json.present);
      if (!Array.isArray(json?.events)) return;
      for (const raw of json.events) {
        const ev = sanitizeEvent(raw);
        // Our own events come back too; the reducer is idempotent by event
        // id, so replay costs nothing and guarantees both sides converge on
        // the server's order rather than on their own.
        if (ev && this.fn && !this.stopped) this.fn(ev);
      }
    } catch {
      // Offline, or the route refused. The next tick tries again; a failed
      // poll must never take the room down.
    } finally {
      this.busy = false;
    }
  }

  send(ev: CollabEvent): Promise<SendResult> {
    if (this.stopped) {
      return Promise.resolve({ ok: false, status: 0, error: 'This room has been left.', kinds: [ev.kind], ids: [ev.id], tooLarge: false });
    }
    const bytes = eventBytes(ev);
    // Too large for any request the route will take: said now, not after a
    // round trip that cannot succeed. `+ 2` is the brackets of the batch.
    if (bytes + 2 > MAX_BATCH_BYTES) {
      const f: SendFailure = { status: 413, error: failureWords(413, bytes), kinds: [ev.kind], ids: [ev.id], tooLarge: true };
      this.report(f);
      return Promise.resolve({ ok: false, ...f });
    }
    return new Promise<SendResult>((done) => {
      this.outbox.push({ ev, bytes, done });
      void this.pump();
    });
  }

  onEvent(fn: (ev: CollabEvent) => void) {
    this.fn = fn;
  }

  onError(fn: (failure: SendFailure) => void) {
    this.errorFn = fn;
  }

  private report(f: SendFailure) {
    try {
      this.errorFn?.(f);
    } catch {
      // a broken listener must not take the room down
    }
  }

  private fail(batch: Outbox[], status: number, opts: { tooLarge?: boolean; bytes?: number } = {}) {
    if (!batch.length) return;
    const f: SendFailure = {
      status,
      error: failureWords(status, opts.bytes),
      kinds: [...new Set(batch.map((b) => b.ev.kind))],
      ids: batch.map((b) => b.ev.id),
      tooLarge: !!opts.tooLarge,
    };
    this.report(f);
    for (const b of batch) b.done({ ok: false, ...f });
  }

  /** Send what is waiting: in order, as many as one request may carry, one request at a time. */
  private async pump(): Promise<void> {
    if (this.sending || this.retryTimer || this.stopped || !this.outbox.length) return;
    const batch: Outbox[] = [];
    let bytes = 2;
    const most = this.single ? 1 : MAX_BATCH;
    while (this.outbox.length && batch.length < most) {
      const next = this.outbox[0];
      if (batch.length && bytes + next.bytes + 1 > MAX_BATCH_BYTES) break;
      batch.push(this.outbox.shift()!);
      bytes += next.bytes + 1;
    }
    this.sending = true;
    let res: Response | null = null;
    try {
      res = await fetch('/api/logos/room/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: this.roomId, events: batch.map((b) => b.ev) }),
      });
    } catch {
      res = null;
    }
    this.sending = false;
    if (this.stopped) {
      for (const b of batch) b.done({ ok: false, status: 0, error: 'This room has been left.', kinds: [b.ev.kind], ids: [b.ev.id], tooLarge: false });
      return;
    }
    const status = res?.status ?? 0;

    if (res && res.ok) {
      this.attempt = 0;
      const json = await res.json().catch(() => null);
      // the ones the route's own check refused: they are not in the log, and
      // sending them again would be refused again
      const refused = new Set(Array.isArray(json?.dropped) ? (json.dropped as unknown[]).filter((x): x is string => typeof x === 'string') : []);
      this.fail(batch.filter((b) => refused.has(b.ev.id)), 422);
      for (const b of batch) if (!refused.has(b.ev.id)) b.done({ ok: true });
      if (!this.outbox.length) this.single = false;
      void this.pump();
      return;
    }

    if (status === 413 && batch.length > 1) {
      // the route measured the batch larger than this did: one at a time
      this.outbox.unshift(...batch);
      this.single = true;
      void this.pump();
      return;
    }

    const passing = status === 0 || status === 429 || status >= 500;
    if (passing && this.attempt < SEND_RETRY_MS.length) {
      // back at the head of the outbox, in order, and tried again shortly —
      // a repeat of an event that did land is forgiven by its id
      this.outbox.unshift(...batch);
      const asked = status === 429 ? Number(res?.headers.get('Retry-After')) * 1000 : 0;
      const wait = Math.max(Number.isFinite(asked) ? asked : 0, SEND_RETRY_MS[this.attempt]);
      this.attempt += 1;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.pump();
      }, wait);
      return;
    }

    this.attempt = 0;
    this.fail(batch, status, { tooLarge: status === 413, bytes: batch.length === 1 ? batch[0].bytes : bytes });
    if (!this.outbox.length) this.single = false;
    void this.pump();
  }

  close() {
    this.stopped = true;
    this.fn = null;
    this.presenceFn = null;
    this.errorFn = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.onVisible && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    this.onVisible = null;
    // What is still waiting — a goodbye, most often — goes once, best effort,
    // and outlives the page if it has to.
    const left = this.outbox.splice(0);
    if (left.length) {
      void fetch('/api/logos/room/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: this.roomId, events: left.slice(0, MAX_BATCH).map((b) => b.ev) }),
        keepalive: true,
      }).catch(() => {});
      for (const b of left) b.done({ ok: false, status: 0, error: 'This room has been left.', kinds: [b.ev.kind], ids: [b.ev.id], tooLarge: false });
    }
  }
}

export type { ServerTransport };

/**
 * Open the room's channel.
 *
 * Takes the room id the server issued when the person created or joined —
 * never a code the caller typed. A code is how you ASK for a seat
 * (POST /api/logos/room/join); a room id is only ever handed back by the
 * server to somebody it has already seated.
 */
export function openTransport(roomId: string, since = 0): Transport {
  return new ServerTransport(roomId, since);
}
