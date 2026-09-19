// lib/collab-transport.ts
//
// How an event travels between two people. The reducer in lib/collab.ts does
// not care; this is the only file that does.
//
// ONE INTERFACE, TWO BACKENDS.
//
//   BroadcastChannel — two tabs of the same browser. It needs nothing
//   configured, it works offline, and it is what the automated check drives:
//   two clients on one machine, converging through a real channel. It is also
//   a genuine product path — two people at one shared screen, or one person
//   with the room open twice.
//
//   Supabase Realtime — two devices, two networks. Broadcast carries the
//   events; Presence carries who-is-here. It needs the public Supabase URL
//   and anon key in the browser (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY); with
//   those absent it simply is not offered, and Logos 2 falls back to the
//   same-browser channel with a line of copy that says so.
//
// Nothing here trusts what arrives: every inbound payload goes through
// sanitizeEvent before it reaches the reducer. A channel is a place a
// stranger can shout into — the room code is a soft gate, not a wall.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { roomFor, sanitizeBy, type CollabEvent, type CollabEventKind } from './collab';
import { sanitizeMap, type LogosNode } from './logos';

export interface Transport {
  /** send one event to everyone else in the room */
  send(ev: CollabEvent): void;
  /** called for every event that arrives from someone else */
  onEvent(fn: (ev: CollabEvent) => void): void;
  /** tear it all down */
  close(): void;
  /** which backend this is, for the copy that explains the room's reach */
  readonly kind: 'local' | 'realtime';
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

// ── same browser ────────────────────────────────────────────────────

class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  private ch: BroadcastChannel;
  private fn: ((ev: CollabEvent) => void) | null = null;
  constructor(code: string) {
    this.ch = new BroadcastChannel(roomFor(code));
    this.ch.onmessage = (e) => {
      const ev = sanitizeEvent(e.data);
      if (ev && this.fn) this.fn(ev);
    };
  }
  send(ev: CollabEvent) {
    this.ch.postMessage(ev);
  }
  onEvent(fn: (ev: CollabEvent) => void) {
    this.fn = fn;
  }
  close() {
    this.fn = null;
    try {
      this.ch.close();
    } catch {}
  }
}

// ── across devices ──────────────────────────────────────────────────

let browserClient: SupabaseClient | null = null;
function browserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return browserClient;
}

/** Whether the cross-device backend can run here at all. */
export function realtimeAvailable(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

class RealtimeTransport implements Transport {
  readonly kind = 'realtime' as const;
  private fn: ((ev: CollabEvent) => void) | null = null;
  private channel: ReturnType<SupabaseClient['channel']>;
  constructor(client: SupabaseClient, code: string) {
    this.channel = client.channel(roomFor(code), { config: { broadcast: { self: false } } });
    this.channel
      .on('broadcast', { event: 'ev' }, (msg: { payload?: unknown }) => {
        const ev = sanitizeEvent(msg?.payload);
        if (ev && this.fn) this.fn(ev);
      })
      .subscribe();
  }
  send(ev: CollabEvent) {
    void this.channel.send({ type: 'broadcast', event: 'ev', payload: ev });
  }
  onEvent(fn: (ev: CollabEvent) => void) {
    this.fn = fn;
  }
  close() {
    this.fn = null;
    try {
      void this.channel.unsubscribe();
    } catch {}
  }
}

/**
 * Open the room. Cross-device where it can, same-browser where it cannot —
 * and it never throws: a room that only reaches this browser is still a room,
 * and the surface says which one you are in.
 */
export function openTransport(code: string, prefer: 'auto' | 'local' = 'auto'): Transport {
  if (prefer === 'auto') {
    const client = browserSupabase();
    if (client) return new RealtimeTransport(client, code);
  }
  return new LocalTransport(code);
}
