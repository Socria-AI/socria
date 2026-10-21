// lib/logos5/arrange.ts — HOW THE PERSON HAS ARRANGED THEIR UNIVERSAL MAP.
//
// Everything here is the person's own choice, and nothing else: how much of
// it the map shows (Today, This week — the map — or This month, All time —
// in order, timeline.ts), where they put a
// conversation, the subject they gave one by dragging it there, the order of
// the clusters, which they starred and which they put out of sight, the links
// and the notes they drew, how the map is shown, and the views they saved.
// Nothing about a conversation is kept here — its words, its map and its
// Project stay where they are; a Project's name and colour stay with the
// Project.
//
// It travels: kept in this browser and — signed in — in the account
// (user_profiles.universal_map, through /api/profile), the newer copy winning.
// Always read through parseArrangement, which keeps only what it understands
// and bounds everything, so a copy from another version, or a damaged one,
// can never break the map.
//
// Clusters are named by key: `p:<project id>` for a Project, `c:…` a course and
// `f:…` a field read from the conversations (subjects.ts), `other` for
// everything else; `w:…` and `m:…` are weeks and months. An arrangement kept
// before the map was grouped this way still reads: its pins in a Project still
// hold (This week is drawn by subject), and an older way of grouping all of it
// — by subject, by week, `map`, `columns`, `timeline` — is All time.
//
// PURE.

/**
 * How much of it the Universal Map shows: today's learning and what it builds
 * on, or this week by subject — each a map — or this month, or all of it, in
 * order (timeline.ts).
 */
export type HomeMode = 'today' | 'week' | 'month' | 'all';
export type LabelLevel = 'minimal' | 'titles' | 'ideas';
export type ColorBy = 'project' | 'kind' | 'recency';
export type SizeBy = 'ideas' | 'recency' | 'same';
/** manual: the person's own order; started: the order they began, so nothing moves as they work */
export type SortBy = 'manual' | 'recent' | 'started' | 'name' | 'size';

export interface Display {
  /** the Core chats on the map */
  chats: boolean;
  /** the ideas conversations share, drawn between them */
  ideas: boolean;
  /** a conversation put down by hand lands on the grid */
  snap: boolean;
  labels: LabelLevel;
  color: ColorBy;
  size: SizeBy;
}

/** A conversation put somewhere by hand: relative to its cluster's origin, and only while it is in that cluster. */
export interface Pin {
  x: number;
  y: number;
  g: string;
}

/** A group's frame as the person left it: moved, given a width, folded. */
export interface FrameSet {
  dx: number;
  dy: number;
  /** its width in conversations across, 1–6; absent: as many as suit it */
  cols?: number;
  collapsed?: boolean;
}

/** A link the person drew between two conversations. */
export interface OwnLink {
  id: string;
  a: string;
  b: string;
  label: string;
}

/** Words written on the map itself. */
export interface Note {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface SavedView {
  id: string;
  name: string;
  mode: HomeMode;
  sort: SortBy;
  display: Display;
  /** the groups shown; null: all */
  projects: string[] | null;
  query: string;
}

export interface Arrangement {
  v: 1;
  /** when it last changed: between two copies, the newer wins */
  at: number;
  mode: HomeMode;
  sort: SortBy;
  display: Display;
  pins: Record<string, Pin>;
  frames: Record<string, FrameSet>;
  /** conversation id → the subject the person put it in by hand (a course or field key, or `other`) */
  subjectOf: Record<string, string>;
  /** the groups in the order the person put them; the rest follow in their own order */
  groupOrder: string[];
  /** group key → its conversations in the person's order */
  order: Record<string, string[]>;
  starred: string[];
  hidden: string[];
  links: OwnLink[];
  notes: Note[];
  views: SavedView[];
  /** the groups shown; null: all */
  projects: string[] | null;
  /** what has been said once and need not be said again */
  seen: { hint?: boolean };
}

export const HOME_KEY = 'socria.logos5.home.v1';

export const MODES: readonly HomeMode[] = ['today', 'week', 'month', 'all'];
/** How an arrangement kept before reads: every older way of grouping all of it is All time. */
const OLD_MODES: Record<string, HomeMode> = { map: 'all', columns: 'all', timeline: 'all', subject: 'all' };
const modeOf = (v: unknown, or: HomeMode): HomeMode => (typeof v === 'string' && OLD_MODES[v] ? OLD_MODES[v] : oneOf(v, MODES, or));
export const LABELS: readonly LabelLevel[] = ['minimal', 'titles', 'ideas'];
export const COLOR_BY: readonly ColorBy[] = ['project', 'kind', 'recency'];
export const SIZE_BY: readonly SizeBy[] = ['ideas', 'recency', 'same'];
export const SORTS: readonly SortBy[] = ['manual', 'recent', 'started', 'name', 'size'];

/** Put down by hand, a conversation lands on the grid unless the person turns that off: the map stays tidy. */
export const DEFAULT_DISPLAY: Display = { chats: true, ideas: true, snap: true, labels: 'ideas', color: 'project', size: 'ideas' };

export function emptyArrangement(): Arrangement {
  return {
    v: 1,
    at: 0,
    mode: 'today',
    sort: 'started',
    display: { ...DEFAULT_DISPLAY },
    pins: {},
    frames: {},
    subjectOf: {},
    groupOrder: [],
    order: {},
    starred: [],
    hidden: [],
    links: [],
    notes: [],
    views: [],
    projects: null,
    seen: {},
  };
}

// ── bounds ───────────────────────────────────────────────────────────

const MAX_PINS = 600;
const MAX_SUBJECTS = 600;
const MAX_FRAMES = 120;
const MAX_GROUPS = 120;
const MAX_IN_ORDER = 600;
const MAX_STARRED = 120;
const MAX_HIDDEN = 600;
const MAX_LINKS = 200;
const MAX_NOTES = 80;
const MAX_VIEWS = 20;
/** far enough for any map anyone will draw, near enough that a damaged number cannot fling it away */
const FAR = 60000;

export const NOTE_MAX = 280;
export const LINK_LABEL_MAX = 60;
export const VIEW_NAME_MAX = 40;

const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_:.\-]{1,120}$/.test(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(-FAR, Math.min(FAR, v))) : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], or: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : or);
const ids = (v: unknown, max: number): string[] => (Array.isArray(v) ? [...new Set(v.filter(isId))].slice(0, max) : []);
/** one line, trimmed, bounded */
export const line = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
/** a few lines, trimmed, bounded */
export const lines = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 6)
        .join('\n')
        .trim()
        .slice(0, max)
    : '';

function displayOf(v: unknown): Display {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    chats: typeof d.chats === 'boolean' ? d.chats : DEFAULT_DISPLAY.chats,
    ideas: typeof d.ideas === 'boolean' ? d.ideas : DEFAULT_DISPLAY.ideas,
    snap: typeof d.snap === 'boolean' ? d.snap : DEFAULT_DISPLAY.snap,
    labels: oneOf(d.labels, LABELS, DEFAULT_DISPLAY.labels),
    color: oneOf(d.color, COLOR_BY, DEFAULT_DISPLAY.color),
    size: oneOf(d.size, SIZE_BY, DEFAULT_DISPLAY.size),
  };
}

const groupsList = (v: unknown): string[] | null => (v === null || v === undefined ? null : Array.isArray(v) ? ids(v, MAX_GROUPS) : null);

/**
 * An arrangement from anywhere — this browser, the account, a request body —
 * kept to what is understood and bounded. Never throws; whatever cannot be
 * read is simply not there.
 */
export function parseArrangement(raw: unknown): Arrangement {
  const out = emptyArrangement();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  out.at = num(r.at) !== null && (r.at as number) > 0 ? Math.round(r.at as number) : 0;
  out.mode = modeOf(r.mode, out.mode);
  out.sort = oneOf(r.sort, SORTS, out.sort);
  out.display = displayOf(r.display);
  if (r.pins && typeof r.pins === 'object' && !Array.isArray(r.pins)) {
    for (const [id, p] of Object.entries(r.pins as Record<string, unknown>).slice(0, MAX_PINS)) {
      const q = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
      const x = num(q.x);
      const y = num(q.y);
      if (isId(id) && x !== null && y !== null && isId(q.g)) out.pins[id] = { x, y, g: q.g };
    }
  }
  if (r.frames && typeof r.frames === 'object' && !Array.isArray(r.frames)) {
    for (const [g, f] of Object.entries(r.frames as Record<string, unknown>).slice(0, MAX_FRAMES)) {
      const q = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      if (!isId(g)) continue;
      const set: FrameSet = { dx: num(q.dx) ?? 0, dy: num(q.dy) ?? 0 };
      const cols = num(q.cols);
      if (cols !== null && cols >= 1) set.cols = Math.min(6, cols);
      if (q.collapsed === true) set.collapsed = true;
      out.frames[g] = set;
    }
  }
  if (r.subjectOf && typeof r.subjectOf === 'object' && !Array.isArray(r.subjectOf)) {
    for (const [id, k] of Object.entries(r.subjectOf as Record<string, unknown>).slice(0, MAX_SUBJECTS)) if (isId(id) && isId(k)) out.subjectOf[id] = k;
  }
  out.groupOrder = ids(r.groupOrder, MAX_GROUPS);
  if (r.order && typeof r.order === 'object' && !Array.isArray(r.order)) {
    for (const [g, list] of Object.entries(r.order as Record<string, unknown>).slice(0, MAX_GROUPS)) {
      if (isId(g)) out.order[g] = ids(list, MAX_IN_ORDER);
    }
  }
  out.starred = ids(r.starred, MAX_STARRED);
  out.hidden = ids(r.hidden, MAX_HIDDEN);
  if (Array.isArray(r.links)) {
    for (const l of r.links.slice(0, MAX_LINKS)) {
      const q = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
      if (isId(q.id) && isId(q.a) && isId(q.b) && q.a !== q.b) out.links.push({ id: q.id, a: q.a, b: q.b, label: line(q.label, LINK_LABEL_MAX) });
    }
  }
  if (Array.isArray(r.notes)) {
    for (const n of r.notes.slice(0, MAX_NOTES)) {
      const q = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>;
      const x = num(q.x);
      const y = num(q.y);
      const text = lines(q.text, NOTE_MAX);
      if (isId(q.id) && x !== null && y !== null && text) out.notes.push({ id: q.id, x, y, text });
    }
  }
  if (Array.isArray(r.views)) {
    for (const v of r.views.slice(0, MAX_VIEWS)) {
      const q = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      const name = line(q.name, VIEW_NAME_MAX);
      if (!isId(q.id) || !name) continue;
      out.views.push({ id: q.id, name, mode: modeOf(q.mode, 'all'), sort: oneOf(q.sort, SORTS, 'started'), display: displayOf(q.display), projects: groupsList(q.projects), query: line(q.query, 80) });
    }
  }
  out.projects = groupsList(r.projects);
  if (r.seen && typeof r.seen === 'object' && (r.seen as Record<string, unknown>).hint === true) out.seen = { hint: true };
  return out;
}

/** Of two copies, the one changed last; the other when one is missing. */
export function newerOf(a: Arrangement | null, b: Arrangement | null): Arrangement | null {
  if (!a) return b;
  if (!b) return a;
  return b.at > a.at ? b : a;
}

// ── changes ──────────────────────────────────────────────────────────
// Each returns a new arrangement; the caller stamps the time (stamp), so the
// same change is the same result in a test.

export const stamp = (a: Arrangement, now: number): Arrangement => ({ ...a, at: now });

/** A conversation put down by hand, at a place relative to its group's corner. */
export function pinTile(a: Arrangement, id: string, g: string, x: number, y: number): Arrangement {
  const pins = { ...a.pins, [id]: { x: Math.round(x), y: Math.round(y), g } };
  const keys = Object.keys(pins);
  // the oldest pins give way first when there are too many to keep
  if (keys.length > MAX_PINS) for (const k of keys.slice(0, keys.length - MAX_PINS)) delete pins[k];
  return { ...a, pins };
}

/**
 * The subject the person gave conversations by putting them there — a course
 * or field key, or `other` — or, with null, the subject read from them again.
 */
export function setSubject(a: Arrangement, idList: readonly string[], key: string | null): Arrangement {
  const subjectOf = { ...a.subjectOf };
  for (const id of idList) {
    if (key && isId(key)) subjectOf[id] = key;
    else delete subjectOf[id];
  }
  const keys = Object.keys(subjectOf);
  if (keys.length > MAX_SUBJECTS) for (const k of keys.slice(0, keys.length - MAX_SUBJECTS)) delete subjectOf[k];
  return { ...a, subjectOf };
}

/** Put back in their cluster's order. */
export function unpinTiles(a: Arrangement, idList: readonly string[]): Arrangement {
  if (!idList.some((id) => id in a.pins)) return a;
  const pins = { ...a.pins };
  for (const id of idList) delete pins[id];
  return { ...a, pins };
}

/** A frame moved by hand: everything in it moves with it. */
export function moveFrame(a: Arrangement, g: string, dx: number, dy: number): Arrangement {
  const f = a.frames[g] ?? { dx: 0, dy: 0 };
  return { ...a, frames: { ...a.frames, [g]: { ...f, dx: Math.round(f.dx + dx), dy: Math.round(f.dy + dy) } } };
}

/** A frame given a width, or folded, or unfolded. */
export function setFrame(a: Arrangement, g: string, patch: { cols?: number | null; collapsed?: boolean }): Arrangement {
  const f: FrameSet = { ...(a.frames[g] ?? { dx: 0, dy: 0 }) };
  if (patch.cols !== undefined) {
    if (patch.cols === null || !Number.isFinite(patch.cols)) delete f.cols;
    else f.cols = Math.max(1, Math.min(6, Math.round(patch.cols)));
  }
  if (patch.collapsed !== undefined) {
    if (patch.collapsed) f.collapsed = true;
    else delete f.collapsed;
  }
  return { ...a, frames: { ...a.frames, [g]: f } };
}

/**
 * The person's own order, for the groups given — and, so that nothing else
 * jumps, the order every other group is showing now (`showing`), which
 * becomes its own order too.
 */
export function setOrder(a: Arrangement, given: Record<string, readonly string[]>, showing: Record<string, readonly string[]> = {}): Arrangement {
  const order: Record<string, string[]> = { ...a.order };
  if (a.sort !== 'manual') for (const [g, list] of Object.entries(showing)) order[g] = [...list].slice(0, MAX_IN_ORDER);
  for (const [g, list] of Object.entries(given)) order[g] = [...new Set(list)].slice(0, MAX_IN_ORDER);
  return { ...a, sort: 'manual', order };
}

/** A conversation moved within its group's order, or into another group's at a place. */
export function placeInOrder(list: readonly string[], id: string, at: number): string[] {
  const out = list.filter((x) => x !== id);
  out.splice(Math.max(0, Math.min(out.length, at)), 0, id);
  return out;
}

/** A group moved to a new place among the groups as they are shown (`keys`). */
export function moveGroup(a: Arrangement, keys: readonly string[], g: string, to: number): Arrangement {
  return { ...a, groupOrder: placeInOrder(keys.includes(g) ? keys : [...keys, g], g, to).slice(0, MAX_GROUPS) };
}

export function setIn(a: Arrangement, list: 'starred' | 'hidden', idList: readonly string[], on: boolean): Arrangement {
  const cur = a[list];
  const next = on ? [...cur, ...idList.filter((id) => !cur.includes(id))] : cur.filter((id) => !idList.includes(id));
  const max = list === 'starred' ? MAX_STARRED : MAX_HIDDEN;
  return { ...a, [list]: next.slice(-max) };
}

export function addLink(a: Arrangement, link: OwnLink): Arrangement {
  if (link.a === link.b) return a;
  // one link between two conversations: drawing it again relabels it
  const same = a.links.find((l) => (l.a === link.a && l.b === link.b) || (l.a === link.b && l.b === link.a));
  if (same) return relabelLink(a, same.id, link.label);
  return { ...a, links: [...a.links, { ...link, label: line(link.label, LINK_LABEL_MAX) }].slice(-MAX_LINKS) };
}

export function relabelLink(a: Arrangement, id: string, label: string): Arrangement {
  return { ...a, links: a.links.map((l) => (l.id === id ? { ...l, label: line(label, LINK_LABEL_MAX) } : l)) };
}

export function removeLink(a: Arrangement, id: string): Arrangement {
  return { ...a, links: a.links.filter((l) => l.id !== id) };
}

export function addNote(a: Arrangement, note: Note): Arrangement {
  return { ...a, notes: [...a.notes, { ...note, x: Math.round(note.x), y: Math.round(note.y), text: lines(note.text, NOTE_MAX) }].slice(-MAX_NOTES) };
}

/** A note's words changed — and a note left with no words is gone. */
export function editNote(a: Arrangement, id: string, text: string): Arrangement {
  const t = lines(text, NOTE_MAX);
  return { ...a, notes: t ? a.notes.map((n) => (n.id === id ? { ...n, text: t } : n)) : a.notes.filter((n) => n.id !== id) };
}

export function moveNote(a: Arrangement, id: string, x: number, y: number): Arrangement {
  return { ...a, notes: a.notes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)) };
}

export function removeNote(a: Arrangement, id: string): Arrangement {
  return { ...a, notes: a.notes.filter((n) => n.id !== id) };
}

export function setDisplay(a: Arrangement, patch: Partial<Display>): Arrangement {
  return { ...a, display: displayOf({ ...a.display, ...patch }) };
}

export function setMode(a: Arrangement, mode: HomeMode): Arrangement {
  return { ...a, mode: oneOf(mode, MODES, a.mode) };
}

export function setSort(a: Arrangement, sort: SortBy): Arrangement {
  return { ...a, sort: oneOf(sort, SORTS, a.sort) };
}

/** Which groups are shown; null for all. */
export function setProjects(a: Arrangement, keys: readonly string[] | null): Arrangement {
  return { ...a, projects: keys === null ? null : ids([...keys], MAX_GROUPS) };
}

/** The view as it is now, kept under a name; the same name again replaces it. */
export function saveView(a: Arrangement, id: string, name: string, query: string): Arrangement {
  const n = line(name, VIEW_NAME_MAX);
  if (!n) return a;
  const view: SavedView = { id, name: n, mode: a.mode, sort: a.sort, display: { ...a.display }, projects: a.projects ? [...a.projects] : null, query: line(query, 80) };
  const rest = a.views.filter((v) => v.name.toLowerCase() !== n.toLowerCase());
  return { ...a, views: [...rest, view].slice(-MAX_VIEWS) };
}

/** A saved view put back; its search, if it had one, is the caller's to set. */
export function applyView(a: Arrangement, id: string): Arrangement {
  const v = a.views.find((x) => x.id === id);
  if (!v) return a;
  return { ...a, mode: v.mode, sort: v.sort, display: { ...v.display }, projects: v.projects ? [...v.projects] : null };
}

export function removeView(a: Arrangement, id: string): Arrangement {
  return { ...a, views: a.views.filter((v) => v.id !== id) };
}

/** Everything put back in its group's order — one group, or all; frames stay where they were put. */
export function tidy(a: Arrangement, g?: string): Arrangement {
  const pins: Record<string, Pin> = {};
  if (g) for (const [id, p] of Object.entries(a.pins)) if (p.g !== g) pins[id] = p;
  return { ...a, pins };
}

/** The layout as it was before any of it was arranged: places, frames, and orders. Stars, links, notes and views stay. */
export function resetLayout(a: Arrangement): Arrangement {
  return { ...a, pins: {}, frames: {}, groupOrder: [], order: {}, sort: 'started' };
}

export function markSeen(a: Arrangement, what: 'hint'): Arrangement {
  return a.seen[what] ? a : { ...a, seen: { ...a.seen, [what]: true } };
}

// ── this browser's copy ─────────────────────────────────────────────

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readHome(storage: StorageLike | null | undefined): Arrangement {
  try {
    return parseArrangement(JSON.parse(storage?.getItem(HOME_KEY) || 'null'));
  } catch {
    return emptyArrangement();
  }
}

export function writeHome(storage: StorageLike | null | undefined, a: Arrangement): void {
  try {
    storage?.setItem(HOME_KEY, JSON.stringify(a));
  } catch {
    /* a full or blocked store: the map still works, it is just not remembered here */
  }
}
