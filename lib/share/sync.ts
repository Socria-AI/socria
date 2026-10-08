// lib/share/sync.ts
//
// KEEPING ONE SHARED LINE OF THINKING IN STEP ACROSS SCREENS — the decisions,
// pure, so they can be tested without two browsers.
//
// The server holds the canonical state (the owner's row, written only through
// /api/shared/conversation). Each client remembers what it knows the server
// holds (`Seen`): which turns, by id; which map; which version.
//
//   outgoing   what this client has that the server does not: its turns whose
//              ids the server has never held, and its map if it changed
//   absorb     a row from the server, joined with what is on screen: the
//              server's turns in the server's order, then this screen's turns
//              the server has not had yet. Never a replacement — nothing typed
//              here, and no answer Socria gave here, is wiped by someone
//              else's write landing first
//
// WHY BY ID. This used to go by position: "the turns after the ones I saw".
// One counter was made to index two lists — the server's row and this screen —
// and when the other person wrote in between, the two came apart: this
// screen's next turn and Socria's answer to it were never sent, and the next
// adoption wiped them from the screen they were written on, while the other
// person never saw them at all. That was "Socria disappears". Every message
// now carries an id from the moment it is made (lib/chat-thread.ts), and the
// two lists are joined by it.
//
// THE MAP goes whole, against the version it was drawn on; a stale one comes
// back 409 with the current map, which this client adopts (the next extraction
// folds its own turn back in). So the version this client sends is only ever
// one whose map it holds: a row whose map changed is taken in without moving
// the version until this screen can show that map too — mid-reply, or with a
// map of its own still unsent, it waits, and a map it sends meanwhile is
// refused rather than allowed to overwrite someone else's.
//
// Turns written before ids existed carry none: they are the server's, in the
// server's order, and are never re-sent.
//
// PURE.

export interface SyncTurn {
  id?: string;
  at?: number;
  role: 'user' | 'assistant';
  content: string;
  by?: unknown;
  replyTo?: unknown;
  attachments?: unknown;
  synthesis?: unknown;
}

export interface Seen {
  /** the ids the server is known to hold, or to have held (it keeps the last 200) */
  acked: ReadonlySet<string>;
  /** the map as the server held it at `version`, serialised */
  map: string;
  /** the server's version (updated_at) this client has fully taken in */
  version: number;
}

/** The most turns one write carries — the route's own ceiling. */
export const MAX_APPEND = 4;

/** A stable serialisation of a map, so "changed" means changed. */
export function mapKey(map: unknown): string {
  if (!map || typeof map !== 'object') return '';
  try {
    return JSON.stringify(map);
  } catch {
    return '';
  }
}

export interface OutTurn {
  id: string;
  at?: number;
  role: 'user' | 'assistant';
  content: string;
  replyTo?: unknown;
  synthesis?: unknown;
}

export interface Outgoing {
  /** turns to append, in order — the server names the author */
  append: OutTurn[];
  /** the map to send, or undefined when it has not changed */
  map: unknown;
}

const isTurn = (m: SyncTurn | null | undefined): m is SyncTurn =>
  !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';

/** This screen's turns the server has never held, that can be sent (an empty one cannot). */
export function pendingTurns(seen: Seen, local: { messages: SyncTurn[] }): SyncTurn[] {
  return (local.messages ?? []).filter(
    (m) => isTurn(m) && typeof m.id === 'string' && !!m.id && !seen.acked.has(m.id) && !!m.content.trim()
  );
}

export function outgoing(seen: Seen, local: { messages: SyncTurn[]; map: unknown }): Outgoing {
  const append = pendingTurns(seen, local)
    .slice(0, MAX_APPEND)
    .map((m) => ({
      id: m.id as string,
      role: m.role,
      content: m.content,
      ...(m.at ? { at: m.at } : {}),
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      ...(m.role === 'assistant' && m.synthesis ? { synthesis: m.synthesis } : {}),
    }));
  const key = mapKey(local.map);
  return { append, map: key && key !== seen.map ? local.map : undefined };
}

/** Nothing of this client's own is still waiting to be sent. */
export function settled(seen: Seen, local: { messages: SyncTurn[]; map: unknown }): boolean {
  const o = outgoing(seen, local);
  return o.append.length === 0 && o.map === undefined;
}

/**
 * The server's turns joined with this screen's: the server's, in its order —
 * keeping, for a turn this screen also holds, what only this screen carries (a
 * note attached, a synthesis card) — then this screen's turns the server has
 * never held, in this screen's order. A turn the server held once and has
 * since let go (past the 200 it keeps) is let go here too.
 */
export function mergeTurns(server: SyncTurn[], local: SyncTurn[], acked: ReadonlySet<string>): SyncTurn[] {
  const mine = new Map<string, SyncTurn>();
  for (const m of local ?? []) if (isTurn(m) && m.id) mine.set(m.id, m);
  const onServer = new Set<string>();
  const out: SyncTurn[] = [];
  for (const m of server ?? []) {
    if (!isTurn(m)) continue;
    if (m.id) {
      if (onServer.has(m.id)) continue;
      onServer.add(m.id);
      const l = mine.get(m.id);
      out.push(
        l
          ? {
              ...m,
              ...(l.attachments !== undefined && m.attachments === undefined ? { attachments: l.attachments } : {}),
              ...(l.synthesis !== undefined && m.synthesis === undefined ? { synthesis: l.synthesis } : {}),
            }
          : m
      );
    } else {
      out.push(m);
    }
  }
  for (const m of local ?? []) {
    if (isTurn(m) && m.id && !onServer.has(m.id) && !acked.has(m.id)) out.push(m);
  }
  return out;
}

function sameTurns(a: SyncTurn[], b: SyncTurn[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (!x || !y || x.id !== y.id || x.role !== y.role || x.content !== y.content) return false;
    if (mapKey(x.by ?? null) !== mapKey(y.by ?? null)) return false;
  }
  return true;
}

export interface Absorbed {
  /** what the screen should now hold */
  messages: SyncTurn[];
  /** true when the server's map should replace the one on screen */
  takeMap: boolean;
  seen: Seen;
  /** anything on screen changes */
  changed: boolean;
}

/**
 * A row from the server, taken in. `busy`: a reply is streaming here, so the
 * map on screen is about to be redrawn from it and must not be swapped under
 * it. `takeMap`: the server refused this client's map (409) — its map wins.
 */
export function absorb(
  seen: Seen,
  remote: { messages: SyncTurn[]; map: unknown; updatedAt: number },
  local: { messages: SyncTurn[]; map: unknown },
  opts: { busy: boolean; takeMap?: boolean }
): Absorbed {
  const acked = new Set(seen.acked);
  for (const m of remote.messages ?? []) if (isTurn(m) && m.id) acked.add(m.id);
  const messages = mergeTurns(remote.messages ?? [], local.messages ?? [], acked);
  const remoteKey = mapKey(remote.map);
  const localKey = mapKey(local.map);
  const same = remoteKey === localKey;
  const dirty = localKey !== seen.map;
  const takeMap = !same && (!!opts.takeMap || (!opts.busy && !dirty));
  // Taken in fully — version and all — only when this screen now holds the
  // server's map, or the server's map is the one it already knew.
  const holds = same || takeMap || remoteKey === seen.map;
  const version = holds ? Math.max(seen.version, Number(remote.updatedAt) || 0) : seen.version;
  return {
    messages,
    takeMap,
    seen: { acked, map: holds ? remoteKey : seen.map, version },
    changed: takeMap || !sameTurns(messages, local.messages ?? []),
  };
}

/** What a client knows once it has taken in a server version whole. */
export function seenOf(remote: { messages: SyncTurn[]; map: unknown; updatedAt: number }): Seen {
  const acked = new Set<string>();
  for (const m of remote.messages ?? []) if (isTurn(m) && m.id) acked.add(m.id);
  return { acked, map: mapKey(remote.map), version: Number(remote.updatedAt) || 0 };
}

/** Before the first read: nothing known on the server, and the map on screen taken as its own. */
export function unseen(local: { map: unknown } | null): Seen {
  return { acked: new Set(), map: mapKey(local?.map), version: 0 };
}

// ── pointers on a shared map ────────────────────────────────────────

/** A pointer in map (world) coordinates, from a point on screen and the camera. */
export function toWorld(screen: { x: number; y: number }, cam: { x: number; y: number; k: number }): { x: number; y: number } {
  const k = cam.k || 1;
  return { x: (screen.x - cam.x) / k, y: (screen.y - cam.y) / k };
}

/** And back: where someone else's pointer falls on this screen's camera. */
export function toScreen(world: { x: number; y: number }, cam: { x: number; y: number; k: number }): { x: number; y: number } {
  return { x: world.x * (cam.k || 1) + cam.x, y: world.y * (cam.k || 1) + cam.y };
}

/** The camera, read off the world layer's CSS transform (matrix(a, b, c, d, e, f)). */
export function camFromTransform(t: string | null | undefined): { x: number; y: number; k: number } {
  const m = typeof t === 'string' ? t.match(/matrix\(([^)]+)\)/) : null;
  if (!m) return { x: 0, y: 0, k: 1 };
  const [a, , , , e, f] = m[1].split(',').map((v) => Number(v.trim()));
  return { x: Number.isFinite(e) ? e : 0, y: Number.isFinite(f) ? f : 0, k: Number.isFinite(a) && a > 0 ? a : 1 };
}
