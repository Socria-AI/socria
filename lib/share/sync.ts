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
// back 409 with the current map. So the version this client sends is only ever
// one whose map it holds: a row whose map changed is taken in without moving
// the version until this screen can show that map too — mid-reply, or with a
// map of its own still unsent, it waits, and a map it sends meanwhile is
// refused rather than allowed to overwrite someone else's.
//
// A REFUSED MAP IS MERGED, NEVER TAKEN WHOLE (mergeMaps). It used to be
// adopted wholesale, which cost the person whose write lost the race their
// slider moves, their scene steps and the model they had just built — gone
// from their own screen and never stored. Now the server's map and this
// screen's are joined part by part against the base both last agreed on:
// nodes by id, model documents by id (lib/model/docs.ts mergeWorkspaces),
// objects of thought by id with this screen's new steps computed again on top
// of theirs. What either side deleted since the base stays deleted. The merge
// is then sent, against the version the refusal carried.
//
// THE VERSION MOVES ON THE SERVER'S WORD. A map that went in is the server's
// map at the version its answer names — whatever bytes the server stored it
// in. This used to be decided by comparing those bytes with the ones sent, and
// the server sanitises what it stores, so a model just built never compared
// equal: a client that moved a slider during the save stayed a version behind
// its own write, its next push was refused against itself, and the slider
// snapped back (R dragged to 3, shown at 2).
//
// Turns written before ids existed carry none: they are the server's, in the
// server's order, and are never re-sent.
//
// PURE.

import { mergeById, mergeWorkspaces, stableKey, type ModelWorkspace } from '@/lib/model/docs';
import { apply, freshId, kindOf, seek, MAX_OBJECTS, type ObjectSpace, type Step, type ThoughtObject } from '@/lib/objects';
import { keyOf } from '@/lib/map-edit';

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
  /**
   * The server's own serialisation of that same map, when it is not `map`
   * byte for byte. The server sanitises the map it stores, so a map this
   * client sent comes back in other bytes; a row carrying these bytes is the
   * map this client already knows, not someone else's write.
   */
  held?: string;
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
  /** true when the map on screen should be replaced — by `map` */
  takeMap: boolean;
  /**
   * The map the screen should show when `takeMap`: the server's, or — after a
   * refused write — the server's merged with this screen's (mergeMaps).
   */
  map?: unknown;
  /** what of this screen's the merge could not keep, in words — worth saying */
  lost?: string[];
  seen: Seen;
  /** anything on screen changes */
  changed: boolean;
}

export interface AbsorbOptions {
  /** a reply is streaming here: the map on screen is about to be redrawn from it */
  busy: boolean;
  /** the server refused this client's map (409): the two are merged, part by part */
  conflict?: boolean;
  /** the old name for `conflict`. A refused map is merged now; it is never taken whole. */
  takeMap?: boolean;
  /**
   * The map this client sent and the server ACCEPTED: this row is its
   * acknowledgement, so the version moves to the row's whatever bytes the
   * server stored it in.
   */
  sent?: unknown;
  /**
   * This client may not write the map (a viewer, a commenter, or a write the
   * server refused with 403): nothing on this screen can ever be sent, so the
   * server's map is always the one to show — a local change, however it got
   * there, never freezes the screen on itself.
   */
  readOnly?: boolean;
}

/**
 * A row from the server, taken in. `busy`: a reply is streaming here, so the
 * map on screen is about to be redrawn from it and must not be swapped under
 * it. `conflict`: the server refused this client's map (409) — the two are
 * merged (mergeMaps) and the merge is what this screen holds and sends next.
 * `sent`: the server accepted this client's map, and this row says so.
 */
export function absorb(
  seen: Seen,
  remote: { messages: SyncTurn[]; map: unknown; updatedAt: number },
  local: { messages: SyncTurn[]; map: unknown },
  opts: AbsorbOptions
): Absorbed {
  const acked = new Set(seen.acked);
  for (const m of remote.messages ?? []) if (isTurn(m) && m.id) acked.add(m.id);
  const messages = mergeTurns(remote.messages ?? [], local.messages ?? [], acked);
  const remoteKey = mapKey(remote.map);
  const localKey = mapKey(local.map);
  const same = remoteKey === localKey;
  const at = Math.max(seen.version, Number(remote.updatedAt) || 0);
  const turnsMoved = () => !sameTurns(messages, local.messages ?? []);

  // THIS CLIENT'S OWN MAP, ACKNOWLEDGED. The server holds what was sent, at
  // the version this row names — in the bytes it chose to store it in, which
  // are remembered as `held` so the next row carrying them is not mistaken for
  // someone else's write. A screen that has moved on since the send keeps its
  // newer map, now one version ahead of the server and never behind it.
  if (opts.sent !== undefined && !opts.readOnly) {
    const sentKey = mapKey(opts.sent);
    const take = !same && localKey === sentKey && !opts.busy;
    return {
      messages,
      takeMap: take,
      ...(take ? { map: remote.map } : {}),
      seen: take || same
        ? { acked, map: remoteKey, version: at }
        : { acked, map: sentKey, version: at, ...(remoteKey && remoteKey !== sentKey ? { held: remoteKey } : {}) },
      changed: take || turnsMoved(),
    };
  }

  // A REFUSED MAP: merged with the server's, part by part, against the base
  // both last agreed on. The version moves to the server's — the merge is a
  // map drawn on it, and goes next.
  if ((opts.conflict || opts.takeMap) && !opts.readOnly) {
    const merged = same ? { map: remote.map, lost: [] as string[] } : mergeMaps(parseKey(seen.map), local.map, remote.map);
    const take = mapKey(merged.map) !== localKey;
    return {
      messages,
      takeMap: take,
      ...(take ? { map: merged.map } : {}),
      ...(merged.lost.length ? { lost: merged.lost } : {}),
      seen: { acked, map: remoteKey, version: at },
      changed: take || turnsMoved(),
    };
  }

  const dirty = !opts.readOnly && localKey !== seen.map;
  const takeMap = !same && !opts.busy && !dirty;
  // The map this client already knows, in either set of bytes.
  const known = remoteKey === seen.map || (!!seen.held && remoteKey === seen.held);
  // Taken in fully — version and all — only when this screen now holds the
  // server's map, or the server's map is the one it already knew.
  const holds = same || takeMap || known;
  const next: Seen = !holds
    ? seen.held ? { acked, map: seen.map, version: seen.version, held: seen.held } : { acked, map: seen.map, version: seen.version }
    : same || takeMap
      ? { acked, map: remoteKey, version: at }
      : { acked, map: seen.map, version: at, ...(seen.held ? { held: seen.held } : {}) };
  return {
    messages,
    takeMap,
    ...(takeMap ? { map: remote.map } : {}),
    seen: next,
    changed: takeMap || turnsMoved(),
  };
}

const parseKey = (key: string): unknown => {
  if (!key) return null;
  try {
    return JSON.parse(key);
  } catch {
    return null;
  }
};

// ── a refused map, merged ───────────────────────────────────────────

/** A map as the merge reads it: its parts, whatever else it carries. */
interface MapLike {
  nodes?: { id: string; label?: string }[];
  edges?: { from: string; to: string; relation?: string }[];
  removed?: string[];
  models?: ModelWorkspace;
  objects?: ObjectSpace;
  [k: string]: unknown;
}

const asMap = (x: unknown): MapLike | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as MapLike) : null);
const listOf = <T>(x: T[] | undefined, fallback: T[] | undefined): T[] | undefined => (Array.isArray(x) ? x : fallback);

export interface MapMerge {
  /** the map both screens' work is in */
  map: unknown;
  /** what of `mine` could not be kept, in words — e.g. a step that no longer applies */
  lost: string[];
}

/**
 * THREE MAPS INTO ONE: the base both sides last agreed on, this screen's
 * (`mine`) and the server's (`theirs`).
 *
 *   nodes      by id. A node only one side touched is that side's; one both
 *              changed is mine (a hand edit made here is not undone by the
 *              server's copy); one either side deleted stays deleted, and a
 *              label either side took off by hand (`removed`) stays off under
 *              any id. Edges by their ends and relation, the same way, and
 *              never to a node that is gone.
 *   models     by document id — lib/model/docs.ts mergeWorkspaces: my new
 *              revisions replayed on theirs, field by field.
 *   objects    by id: my new steps computed again on top of theirs, by the
 *              object's own code, so a merged history is still a computed one.
 *   the rest   (the picture, the context, the ask) whole: mine if I changed
 *              it since the base, else theirs.
 */
export function mergeMaps(base: unknown, mine: unknown, theirs: unknown): MapMerge {
  const B = asMap(base);
  const M = asMap(mine);
  const T = asMap(theirs);
  if (!M) return { map: theirs, lost: [] };
  if (!T) return { map: mine, lost: [] };
  const kB = mapKey(base);
  const kM = mapKey(mine);
  const kT = mapKey(theirs);
  if (kM === kB || kM === kT) return { map: theirs, lost: [] };
  if (kT === kB) return { map: mine, lost: [] };

  const lost: string[] = [];
  const out: MapLike = { ...T };
  const own = new Set(['nodes', 'edges', 'removed', 'models', 'objects', 'propose']);
  for (const k of new Set([...Object.keys(B ?? {}), ...Object.keys(M), ...Object.keys(T)])) {
    if (own.has(k) || stableKey(M[k]) === stableKey(B?.[k])) continue;
    if (M[k] === undefined) delete out[k];
    else out[k] = M[k];
  }
  // never carried: a proposal is answered on the turn it arrives
  delete out.propose;

  // `removed` is left out of a map when it is empty, so an absent list is an
  // empty one — a label taken back off it, not a list left alone
  const removed = mergeSet(B?.removed, M.removed, T.removed);
  const gone = new Set(removed);
  const nodes = mergeById(B?.nodes, listOf(M.nodes, B?.nodes), listOf(T.nodes, B?.nodes), (n) => n.id).items.filter(
    (n) => !(typeof n.label === 'string' && gone.has(keyOf(n.label)))
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edgeId = (e: { from: string; to: string; relation?: string }) => `${e.from}>${e.to}:${e.relation ?? ''}`;
  const edges = mergeById(B?.edges, listOf(M.edges, B?.edges), listOf(T.edges, B?.edges), edgeId).items.filter(
    (e) => ids.has(e.from) && ids.has(e.to)
  );
  out.nodes = nodes;
  out.edges = edges;
  if (removed.length) out.removed = removed.slice(-40);
  else delete out.removed;

  if (B?.models || M.models || T.models) {
    const w = mergeWorkspaces(B?.models, M.models, T.models);
    lost.push(...w.lost);
    if (w.workspace.docs.length) out.models = w.workspace;
    else delete out.models;
  }
  if (B?.objects || M.objects || T.objects) {
    const o = mergeObjects(B?.objects, M.objects, T.objects);
    lost.push(...o.lost);
    if (o.space) out.objects = o.space;
    else delete out.objects;
  }
  return { map: out, lost };
}

/** A set merged three ways: what either side added, less what either side took out. */
function mergeSet(base: string[] | undefined, mine: string[] | undefined, theirs: string[] | undefined): string[] {
  const b = new Set(base ?? []);
  const m = new Set(mine ?? []);
  const t = new Set(theirs ?? []);
  const out: string[] = [];
  for (const x of [...(theirs ?? []), ...(mine ?? [])]) {
    if (out.includes(x)) continue;
    if (b.has(x) && (!m.has(x) || !t.has(x))) continue; // taken out on one side since the base
    out.push(x);
  }
  return out;
}

// ── objects of thought, merged ──────────────────────────────────────

const stepKey = (s: Step): string => JSON.stringify([s.op, stableKey(s.args), s.at, s.by]);

/** What an object IS: its start, its steps and where its cursor is — never its bytes. */
export const objectKey = (o: ThoughtObject): string =>
  JSON.stringify([o.kind, o.name, o.at, o.trimmed ?? 0, (o.steps ?? []).map(stepKey), stableKey(o.states?.[0])]);

/**
 * This screen's new steps on an object, computed again on top of theirs.
 *
 * Every state of an object is one its kind's code computed (lib/objects/core.ts
 * rule 1), so a merged history cannot be stitched from two lists of states: it
 * is theirs, then each step taken here since the base, APPLIED to the state
 * theirs ended on. A step that no longer applies there (a part it names has
 * gone) stops the replay, and is said rather than dropped quietly.
 */
function replaySteps(t: ThoughtObject, known: readonly Step[], m: ThoughtObject, lost: string[]): ThoughtObject {
  const seen = new Set([...known, ...(t.steps ?? [])].map(stepKey));
  const fresh = (m.steps ?? []).slice(0, m.at).filter((s) => !seen.has(stepKey(s)));
  // nothing new here — a look back along the history only: theirs moved on, theirs stands
  if (!fresh.length) return t;
  let space: ObjectSpace = seek({ objs: [t] }, t.id, t.states.length - 1);
  for (const s of fresh) {
    const r = apply(space, t.id, s.op, s.args, { by: s.by, ...(s.suggested ? { suggested: true } : {}), at: s.at });
    if (!r.ok) {
      lost.push(`${m.name}: “${s.said}” could not be applied after the change made on another screen — ${r.why}`);
      break;
    }
    space = r.space;
  }
  return space.objs[0];
}

/** The same start, so one object: both histories in it. */
const sameStart = (a: ThoughtObject, b: ThoughtObject): boolean => {
  if (a.kind !== b.kind) return false;
  const k = kindOf(a.kind);
  try {
    return !!k && k.same(a.states[0], b.states[0]);
  } catch {
    return false;
  }
};

/**
 * Objects of thought, merged by id: one only one side worked on is that
 * side's; one both worked on is theirs with my new steps computed on top; one
 * either side removed stays removed; two made under one id from different
 * starts are both kept, mine under a fresh id.
 */
export function mergeObjects(
  base: ObjectSpace | null | undefined,
  mine: ObjectSpace | null | undefined,
  theirs: ObjectSpace | null | undefined
): { space: ObjectSpace | undefined; lost: string[] } {
  const B = new Map((base?.objs ?? []).map((o) => [o.id, o]));
  const M = new Map((mine?.objs ?? []).map((o) => [o.id, o]));
  const T = new Map((theirs?.objs ?? []).map((o) => [o.id, o]));
  const lost: string[] = [];
  const out: ThoughtObject[] = [];
  for (const t of theirs?.objs ?? []) {
    const b = B.get(t.id);
    const m = M.get(t.id);
    if (b && !m) continue; // removed here since the base: it stays removed
    if (!m) {
      out.push(t);
      continue;
    }
    if (!b) {
      // both made an object under this id since the base
      out.push(objectKey(m) !== objectKey(t) && sameStart(m, t) ? replaySteps(t, [], m, lost) : t);
      continue;
    }
    const kb = objectKey(b);
    const km = objectKey(m);
    const kt = objectKey(t);
    out.push(km === kb || km === kt ? t : kt === kb ? m : replaySteps(t, b.steps ?? [], m, lost));
  }
  for (const m of mine?.objs ?? []) {
    const b = B.get(m.id);
    const t = T.get(m.id);
    if (t) {
      if (b || objectKey(m) === objectKey(t) || sameStart(m, t)) continue; // placed above
      // a different object made under the same name: both are kept
      if (out.length >= MAX_OBJECTS) {
        lost.push(`${m.name} could not be kept: a line of thinking holds ${MAX_OBJECTS} objects at most.`);
        continue;
      }
      out.push({ ...m, id: freshId({ objs: [...out, ...(mine?.objs ?? [])] }, m.name) });
      continue;
    }
    if (b) {
      if (objectKey(m) !== objectKey(b)) lost.push(`${m.name} was removed on another screen, so what was done to it here is not kept.`);
      continue;
    }
    if (out.length >= MAX_OBJECTS) {
      lost.push(`${m.name} could not be kept: a line of thinking holds ${MAX_OBJECTS} objects at most.`);
      continue;
    }
    out.push(m); // made here since the base
  }
  return { space: out.length ? { objs: out } : undefined, lost };
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
