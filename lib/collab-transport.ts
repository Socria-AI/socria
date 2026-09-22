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

import { sanitizeBy, type CollabEvent, type CollabEventKind } from './collab';
import { sanitizeMap, type LogosNode } from './logos';

export interface Transport {
  /** send one event to everyone else in the room */
  send(ev: CollabEvent): void;
  /** called for every event that arrives from someone else */
  onEvent(fn: (ev: CollabEvent) => void): void;
  /** tear it all down */
  close(): void;
  /** the one backend there is; kept for the copy that describes the room */
  readonly kind: 'server';
}

const EVENT_KINDS: CollabEventKind[] = ['hello', 'bye', 'message', 'node.add', 'node.edit', 'node.remove', 'map'];

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
                .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content as string).slice(0, 12_000), ...(sanitizeBy(m.by) ? { by: sanitizeBy(m.by) } : {}) }))
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
      return { id, at, by, kind, message: { role: m.role, content: m.content.slice(0, 12_000) } } as CollabEvent;
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
    default:
      return null;
  }
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

  send(ev: CollabEvent) {
    if (this.stopped) return;
    void fetch('/api/logos/room/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: this.roomId, events: [ev] }),
    }).catch(() => {});
  }

  onEvent(fn: (ev: CollabEvent) => void) {
    this.fn = fn;
  }

  close() {
    this.stopped = true;
    this.fn = null;
    this.presenceFn = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.onVisible && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    this.onVisible = null;
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
