// lib/share/sync.ts
//
// KEEPING ONE SHARED LINE OF THINKING IN STEP ACROSS SCREENS — the decisions,
// pure, so they can be tested without two browsers.
//
// The server holds the canonical state (the owner's row, written only
// through /api/shared/conversation). Each client knows the last version it
// saw (`Seen`): how many turns, which map, which version number. From that:
//
//   outgoing   what this client has that the server does not yet: the turns
//              after the ones it saw, and its map if it changed
//   incoming   whether a newer server version may replace what is on screen
//              — only when this client has nothing of its own still unsent,
//              so a turn being written is never wiped by a poll
//
// The map goes as a whole, against the version it was drawn on; a stale one
// comes back 409 with the current map, which this client then adopts (the
// next extraction folds its own turn back in). Turns are appended, never
// replaced, so two people sending at once both land.
//
// PURE.

export interface SyncTurn {
  role: 'user' | 'assistant';
  content: string;
  by?: unknown;
}

export interface Seen {
  /** turns the server held at that version */
  count: number;
  /** the map as the server held it, serialised */
  map: string;
  /** the server's version (updated_at) */
  version: number;
}

/** A stable serialisation of a map, so "changed" means changed. */
export function mapKey(map: unknown): string {
  if (!map || typeof map !== 'object') return '';
  try {
    return JSON.stringify(map);
  } catch {
    return '';
  }
}

export interface Outgoing {
  /** turns to append, in order — just role and words; the server names the author */
  append: { role: 'user' | 'assistant'; content: string }[];
  /** the map to send, or undefined when it has not changed */
  map: unknown;
}

export function outgoing(seen: Seen, local: { messages: SyncTurn[]; map: unknown }): Outgoing {
  const extra = (local.messages ?? []).slice(seen.count);
  const append = extra
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  const key = mapKey(local.map);
  return { append, map: key && key !== seen.map ? local.map : undefined };
}

/** Nothing of this client's own is still waiting to be sent. */
export function settled(seen: Seen, local: { messages: SyncTurn[]; map: unknown }): boolean {
  const o = outgoing(seen, local);
  return o.append.length === 0 && o.map === undefined;
}

/**
 * May the server's newer version replace what is on screen? Only if it IS
 * newer, and this client is not in the middle of saying something.
 */
export function mayAdopt(seen: Seen, remoteVersion: number, local: { messages: SyncTurn[]; map: unknown }, busy: boolean): boolean {
  return remoteVersion > seen.version && !busy && settled(seen, local);
}

/** What a client has seen, once it has adopted (or written) a server version. */
export function seenOf(remote: { messages: unknown[]; map: unknown; updatedAt: number }): Seen {
  return { count: Array.isArray(remote.messages) ? remote.messages.length : 0, map: mapKey(remote.map), version: Number(remote.updatedAt) || 0 };
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
