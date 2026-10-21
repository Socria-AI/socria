// lib/logos5/merge.ts — THE CORE CHATS, BROUGHT INTO LOGOS 5.
//
// Core 4 and Logos 5 kept two histories: a Core chat lived on the Core
// screen, a line of thinking on Logos 5, and the Universal Map drew Core chats
// by their names alone. They are one history now. Every conversation is
// listed, opened and drawn in Logos 5, and the chats from before were moved
// there once (app/api/conversations/merge):
//   • MOVED, NOT CONVERTED. A conversation's `kind` is where it was last left
//     (lib/conversation-surface.ts); the move writes that and nothing else —
//     the messages, title, memory, map, draft and Project stay exactly as they
//     were, and so does when it was last worked on.
//   • ONCE PER ACCOUNT, recorded as the 'logos.merged' milestone
//     (lib/first-run.ts), so a second device does not move them again. The
//     Core 4 screen is still there for whoever picks it: a chat begun there
//     afterwards opens there from its rail, and is on Logos 5's map, List and
//     search all the same, as every conversation is.
//   • NEVER AN INCOGNITO CONVERSATION — one the person asked to keep out of
//     everything is not moved, and no map is drawn from it.
//   • Their maps are drawn afterwards, in the browser, one at a time and
//     paced (LogosApp): the maps owed are kept here, so a visit cut short
//     carries on where it stopped, and one that cannot be drawn now is drawn
//     when it is opened (owesExtraction). Each is written alone — the map,
//     onto a conversation that has none (app/api/conversations PATCH).
//   • NOT FOR A CHAT KEPT QUIET (quietConversations): one the person took off
//     the record or kept to itself, or one a private memory came from — a
//     weighty conversation, whose memories never reach Logos (invariant 3,
//     lib/mind/types.ts). It is brought in like the rest; its map is drawn
//     only if the person opens it here, as it always was.
//   • NOT A WAY INTO A REWARD. A map drawn in the background is marked
//     `unopened` (lib/logos.ts) and the 5-Node Challenge does not read it
//     until the person opens the conversation in Logos — when a Core chat's
//     map used to be drawn at all — so who qualifies is exactly as before.
//
// PURE, apart from the two storage helpers.

/** What the move needs to know of a stored conversation. */
export interface MergeRow {
  id: string;
  /** the stored `kind`; absent or null on rows written before the column */
  kind?: string | null;
  incognito?: boolean | null;
}

/** The conversations to bring in: everything not already in Logos, except what is incognito. */
export function candidatesForMerge(rows: readonly MergeRow[]): string[] {
  return rows.filter((r) => r && typeof r.id === 'string' && r.kind !== 'logos' && r.incognito !== true).map((r) => r.id);
}

/** A list in pieces of at most `n`, for writes whose filter travels in a URL. */
export function chunked<T>(list: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += Math.max(1, n)) out.push(list.slice(i, i + Math.max(1, n)));
  return out;
}

// ── the chats kept quiet ─────────────────────────────────────────────

/** What the stores say about how private each conversation is. Any of them may be absent. */
export interface QuietSources {
  /** Core 4's state per conversation (core4_state): what the person said may be kept from it */
  states?: readonly { conversation_id?: unknown; state?: unknown }[] | null;
  /** Mind memories marked private (mind_nodes), with where each came from */
  privateNodes?: readonly { provenance?: unknown }[] | null;
  /** the person's memory entries (user_profiles.understanding.entries) */
  entries?: readonly unknown[] | null;
}

/**
 * The conversations whose maps are NOT drawn in the background: off the
 * record ('none') or kept to themselves ('conversation_only'), as Core 4
 * holds it, and any a private memory came from.
 */
export function quietConversations(src: QuietSources): Set<string> {
  const out = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === 'string' && id) out.add(id);
  };
  for (const r of src.states ?? []) {
    const policy = (r?.state as { persistPolicy?: unknown } | null | undefined)?.persistPolicy;
    if (policy === 'none' || policy === 'conversation_only') add(r?.conversation_id);
  }
  for (const n of src.privateNodes ?? []) {
    for (const p of Array.isArray(n?.provenance) ? n.provenance : []) add((p as { conversationId?: unknown } | null)?.conversationId);
  }
  for (const e of src.entries ?? []) {
    const x = e as { private?: unknown; source?: { conversationId?: unknown } } | null;
    if (x?.private === true) add(x.source?.conversationId);
  }
  return out;
}

// ── the maps still owed ──────────────────────────────────────────────

/** Per browser: the conversations brought in whose maps are not drawn yet. */
export const OWED_KEY = 'socria.logos5.mapsOwed.v1';
const MAX_OWED = 1000;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_:.\-]{1,120}$/.test(v);

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readOwed(storage: StorageLike | null | undefined): string[] {
  try {
    const raw = JSON.parse(storage?.getItem(OWED_KEY) || '[]');
    return Array.isArray(raw) ? [...new Set(raw.filter(isId))].slice(0, MAX_OWED) : [];
  } catch {
    return [];
  }
}

export function writeOwed(storage: StorageLike | null | undefined, ids: readonly string[]): void {
  try {
    const keep = [...new Set(ids.filter(isId))].slice(0, MAX_OWED);
    if (keep.length) storage?.setItem(OWED_KEY, JSON.stringify(keep));
    else storage?.removeItem(OWED_KEY);
  } catch {
    /* a full or blocked store: the maps are drawn when each is opened instead */
  }
}

/** What a session must expose for its map to be drawn. */
export interface OwedSession {
  id: string;
  messages?: readonly unknown[] | null;
  map?: { nodes?: readonly unknown[] } | null;
}

/**
 * The next conversation to draw a map for, and the ones that no longer owe
 * one: gone, already drawn (by hand or when opened), with nothing said, or
 * not this browser's to save (shared, someone else's). The one open now is
 * skipped rather than dropped — opening it draws its own map.
 */
export function nextOwed(owed: readonly string[], sessions: readonly OwedSession[], skip: ReadonlySet<string> = new Set(), open: string | null = null): { id: string | null; drop: string[] } {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const drop: string[] = [];
  for (const id of owed) {
    const s = byId.get(id);
    const said = Array.isArray(s?.messages) && s!.messages!.length > 0;
    const drawn = Array.isArray(s?.map?.nodes) && s!.map!.nodes!.length > 0;
    if (!s || !said || drawn || skip.has(id)) {
      drop.push(id);
      continue;
    }
    if (id === open) continue;
    return { id, drop };
  }
  return { id: null, drop };
}

/** Between two maps drawn in the background: well inside the 'aux' budget (lib/rate-limit.ts) the app's own passes share. */
export const OWED_PACE_MS = 2500;

/**
 * At most this many drawn in the background in one day, newest first — the
 * rest the next day, or each when it is opened. The map pass shares the
 * account's 'aux' day (1,200, lib/rate-limit.ts) with everything the person
 * does in Logos, and years of chats must not spend it for them.
 */
export const OWED_PER_DAY = 150;
const DAY_KEY = 'socria.logos5.mapsOwed.day.v1';

/** How many maps this browser has drawn in the background on this calendar day. */
export function drawnOn(storage: StorageLike | null | undefined, day: string): number {
  try {
    const raw = JSON.parse(storage?.getItem(DAY_KEY) || 'null') as { day?: unknown; n?: unknown } | null;
    return raw && raw.day === day && typeof raw.n === 'number' && Number.isFinite(raw.n) && raw.n > 0 ? Math.floor(raw.n) : 0;
  } catch {
    return 0;
  }
}

/** One more drawn today. */
export function countDrawn(storage: StorageLike | null | undefined, day: string): void {
  try {
    storage?.setItem(DAY_KEY, JSON.stringify({ day, n: drawnOn(storage, day) + 1 }));
  } catch {
    /* a full or blocked store: the pace and the minute's limit still hold */
  }
}
