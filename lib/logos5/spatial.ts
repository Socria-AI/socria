// lib/logos5/spatial.ts — THE UNIVERSAL SPATIAL MAP: HUBS AND AMBIENT DOTS.
//
// Every conversation is a node on one map ("Clearer Structures and UI": past
// study sessions saved on a Universal Spatial Map, not buried in a list).
// A major study session is a hub — a large star with its name beside it; a
// quick one-off question stays a small ambient dot. The same nodes can be
// grouped three ways, and the map moves them between the three:
//   • Today's learning — what today was about, in the middle; around it the
//     earlier conversations it builds on, each joined to the one it leads to;
//     everything else an ambient field further out, by subject;
//   • By week — this week, last week, and back, a cluster for each, newest
//     first; the ideas they share drawn across, so a topic is seen coming
//     back over time;
//   • By subject — each Project, then the courses and fields read from the
//     conversations themselves (subjects.ts) — nothing has to be filed —
//     then everything else. A conversation about a Project's subject that is
//     not filed in it is shown there, marked, for the person to keep or not.
// Inside a cluster the hubs are a constellation joined in the order they
// were begun; the dots sit below them. Ideas shared between conversations
// are named between them, across subjects too, so how topics connect across
// courses can be seen.
//
// Position means something. By subject is the map the person arranges: a
// cluster keeps its place and its order, a new conversation joins the end of
// its cluster and moves nothing already there, and anything put somewhere by
// hand stays (arrange.ts). The other two are arranged by time, by the map.
//
// Every position is computed here, deterministically — no randomness, no
// clock (the time is passed in) — so the same conversations draw the same map
// on every screen.
//
// PURE.

import type { Arrangement, SizeBy } from './arrange';
import { boxAround, freshness, type Box, type ProjectIn, type SharedIdea, type Tile } from './universe';
import { OTHER, sameSubject, subjectOf, subjectOfProject, type Subject } from './subjects';

// ── a conversation, as a node ────────────────────────────────────────

/** How much a conversation holds, 0–1: its turns, its ideas, what was made in it; a study counts for more. */
export function depthOf(t: Pick<Tile, 'turns' | 'count' | 'made' | 'look'>): number {
  const raw = t.turns + t.count * 0.5 + t.made * 2 + (t.look === 'study' ? 4 : 0);
  return Math.max(0, Math.min(1, raw / 14));
}

/**
 * A major session is a hub: a study, something made in it, a conversation of
 * three turns or more, or one whose map grew. Anything less — a quick
 * question asked once — stays an ambient dot. A Core chat is known only by
 * its name, so it is always a dot.
 */
export function isHub(t: Pick<Tile, 'kind' | 'turns' | 'count' | 'made' | 'look'>): boolean {
  if (t.kind === 'core') return false;
  return t.look === 'study' || t.made > 0 || t.turns >= 3 || t.count >= 5;
}

/** How large a node is drawn: a hub by how much it holds (or how recent, or all alike); a dot is small. */
export function radiusOf(t: Pick<Tile, 'kind' | 'turns' | 'count' | 'made' | 'look' | 'at'>, hub: boolean, by: SizeBy, now: number): number {
  if (!hub) return t.kind === 'core' ? 3.5 : 4.5;
  if (by === 'same') return 10;
  const f = by === 'recency' ? freshness(t.at, now) : depthOf(t);
  return Math.round((7 + 7 * f) * 10) / 10;
}

// ── where each conversation lives, by subject ────────────────────────

export type ClusterKind = 'project' | 'course' | 'field' | 'other' | 'week' | 'month' | 'today' | 'ring' | 'rest';

/** A conversation's home by subject. */
export interface Home {
  /** `p:<id>` a Project, `c:…` a course, `f:…` a field, `other` */
  key: string;
  kind: 'project' | 'course' | 'field' | 'other';
  name: string;
  /** a colour key: PROJECT_COLOR_KEYS for a Project, SUBJECT_COLOR_KEYS for the rest; null for everything else */
  color: string | null;
  projectId: string | null;
  subject: Subject | null;
  archived: boolean;
}

/** The six colours a Project can be given (Project Home's own). */
export const PROJECT_COLOR_KEYS = ['moss', 'clay', 'slate', 'ochre', 'plum', 'ink'] as const;
/** A subject read from the conversations gets one of these, by its name, so it never changes. */
export const SUBJECT_COLOR_KEYS = ['teal', 'rose', 'sky', 'sand', 'clay', 'slate', 'ochre', 'plum', 'moss'] as const;

export function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A Project's colour: its own, or one of the six chosen by its id. */
export function projectColor(p: Pick<ProjectIn, 'id' | 'color'>): string {
  return p.color && (PROJECT_COLOR_KEYS as readonly string[]).includes(p.color) ? p.color : PROJECT_COLOR_KEYS[hashOf(p.id) % PROJECT_COLOR_KEYS.length];
}

const subjectColor = (key: string) => SUBJECT_COLOR_KEYS[hashOf(key) % SUBJECT_COLOR_KEYS.length];

const OTHER_HOME: Home = { key: OTHER, kind: 'other', name: 'Everything else', color: null, projectId: null, subject: null, archived: false };

/** A subject's name from its key alone, for a subject the person gave a conversation that nothing else is in now. */
function nameOfKey(key: string): string {
  if (key.startsWith('c:')) {
    const m = /^c:([a-z]{2,5})(\d{3,4}[a-z]?)$/.exec(key);
    if (m) return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
  }
  return key
    .slice(2)
    .replace(/-/g, ' ')
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export interface Homes {
  /** conversation id → its home */
  of: Map<string, Home>;
  /** conversations shown in a Project by their subject, not filed there */
  suggested: Set<string>;
  /** every home with something in it — and every Project, an empty one too — in the order they are drawn */
  list: Home[];
  /** what each conversation was read as being about, whatever home it is in */
  read: Map<string, Subject | null>;
}

/**
 * Where every conversation lives by subject:
 *   • filed in a Project: there — the person's own word comes first;
 *   • put in a subject by hand (arrange.ts subjectOf): there;
 *   • about the subject of one of their Projects: shown in that Project,
 *     marked as suggested — never filed without them;
 *   • otherwise the course or field it was read as being about — a field
 *     joins the one course in it, when there is just one;
 *   • otherwise everything else.
 * Projects keep their order (made, or the person's); then courses and fields,
 * the fullest first; everything else last.
 */
export function homesOf(tiles: readonly Tile[], projects: readonly ProjectIn[] | undefined, a: Pick<Arrangement, 'subjectOf' | 'groupOrder'>): Homes {
  const known = (projects ?? []).filter((p) => p && typeof p.id === 'string');
  const byProject = new Map(known.map((p) => [p.id, p]));
  const of = new Map<string, Home>();
  const suggested = new Set<string>();
  const read = new Map<string, Subject | null>();
  for (const t of tiles) read.set(t.id, subjectOf(t.about));

  const projectHome = (p: ProjectIn): Home => ({ key: `p:${p.id}`, kind: 'project', name: p.name, color: projectColor(p), projectId: p.id, subject: null, archived: !!p.archived });
  // what each Project is about: its name, or what most of what is filed in it is about
  const projectSubject = new Map<string, Subject | null>();
  for (const p of known) {
    const members = tiles.filter((t) => t.projectId === p.id).map((t) => read.get(t.id) ?? null);
    projectSubject.set(p.id, subjectOfProject(p.name, members));
  }
  const memberCount = (pid: string) => tiles.filter((t) => t.projectId === pid).length;

  const subjects = new Map<string, Subject>();
  for (const t of tiles) {
    const filed = t.projectId ? byProject.get(t.projectId) : undefined;
    if (filed) {
      of.set(t.id, { ...projectHome(filed), subject: projectSubject.get(filed.id) ?? null });
      continue;
    }
    const given = a.subjectOf[t.id];
    if (given) {
      if (given === OTHER) of.set(t.id, OTHER_HOME);
      else if (given.startsWith('p:') && byProject.has(given.slice(2))) {
        const p = byProject.get(given.slice(2))!;
        of.set(t.id, { ...projectHome(p), subject: projectSubject.get(p.id) ?? null });
      } else if (given.startsWith('c:') || given.startsWith('f:')) {
        const s = read.get(t.id)?.key === given ? read.get(t.id)! : { key: given, name: nameOfKey(given), kind: given.startsWith('c:') ? ('course' as const) : ('field' as const) };
        subjects.set(given, subjects.get(given) ?? s);
        of.set(t.id, { key: given, kind: s.kind, name: s.name, color: subjectColor(given), projectId: null, subject: s, archived: false });
      }
      if (of.has(t.id)) continue;
    }
    const s = read.get(t.id) ?? null;
    if (s) {
      // a Project about the same subject: the fullest, then the first made
      const match = known
        .filter((p) => !p.archived && sameSubject(projectSubject.get(p.id) ?? null, s))
        .sort((x, y) => memberCount(y.id) - memberCount(x.id) || (x.createdAt ?? 0) - (y.createdAt ?? 0))[0];
      if (match) {
        of.set(t.id, { ...projectHome(match), subject: projectSubject.get(match.id) ?? null });
        suggested.add(t.id);
        continue;
      }
      subjects.set(s.key, subjects.get(s.key) ?? s);
      of.set(t.id, { key: s.key, kind: s.kind, name: s.name, color: subjectColor(s.key), projectId: null, subject: s, archived: false });
      continue;
    }
    of.set(t.id, OTHER_HOME);
  }

  // a field with exactly one course in it: what is about the field goes with the course
  const courses = [...subjects.values()].filter((s) => s.kind === 'course');
  for (const [id, h] of of) {
    if (h.kind !== 'field' || a.subjectOf[id]) continue;
    const field = h.key.slice(2);
    const into = courses.filter((c) => c.field === field);
    if (into.length === 1) of.set(id, { key: into[0].key, kind: 'course', name: into[0].name, color: subjectColor(into[0].key), projectId: null, subject: into[0], archived: false });
  }

  // one quick question is not a subject yet: alone in a course or field, a dot waits in everything else
  const byKey = new Map<string, string[]>();
  for (const [id, h] of of) if (h.kind === 'course' || h.kind === 'field') byKey.set(h.key, [...(byKey.get(h.key) ?? []), id]);
  const tileById = new Map(tiles.map((t) => [t.id, t]));
  for (const ids of byKey.values()) {
    if (ids.length !== 1 || a.subjectOf[ids[0]]) continue;
    const t = tileById.get(ids[0]);
    if (t && !isHub(t)) of.set(ids[0], OTHER_HOME);
  }

  // the homes, in their order
  const used = new Map<string, Home>();
  for (const h of of.values()) if (!used.has(h.key)) used.set(h.key, h);
  const count = (key: string) => [...of.values()].filter((h) => h.key === key).length;
  const projectList = [...known]
    .sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0) || x.name.localeCompare(y.name))
    // an archived Project is drawn only while something is still in it
    .filter((p) => !p.archived || used.has(`p:${p.id}`))
    .map((p) => used.get(`p:${p.id}`) ?? { ...projectHome(p), subject: projectSubject.get(p.id) ?? null });
  const rest = [...used.values()].filter((h) => h.kind === 'course' || h.kind === 'field');
  rest.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'course' ? -1 : 1) || count(y.key) - count(x.key) || x.name.localeCompare(y.name));
  const list = [...projectList, ...rest, ...(used.has(OTHER) ? [OTHER_HOME] : [])];
  // the person's order first; a cluster they have not placed keeps its own place after them
  const place = new Map(a.groupOrder.map((k, i) => [k, i]));
  const natural = new Map(list.map((h, i) => [h.key, i]));
  list.sort((x, y) => (place.get(x.key) ?? Infinity) - (place.get(y.key) ?? Infinity) || natural.get(x.key)! - natural.get(y.key)!);
  return { of, suggested, list, read };
}

// ── time: today, and the weeks and months back ───────────────────────

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The start of the local day a moment falls in. */
export function dayStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The Monday a moment's week began on (local). */
export function weekStart(at: number): number {
  const d = new Date(dayStart(at));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "Oct 20 – 26", or "Sep 29 – Oct 5" across a month's end. */
export function weekRange(start: number): string {
  const a = new Date(start);
  const b = new Date(start);
  b.setDate(b.getDate() + 6);
  return a.getMonth() === b.getMonth() ? `${MONTHS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}` : `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}`;
}

/** "Tue Oct 14" */
export function dayName(at: number): string {
  const d = new Date(at);
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export interface Period {
  key: string;
  kind: 'week' | 'month';
  name: string;
  kicker: string;
  /** when it began, for its order */
  start: number;
}

/** How many weeks back are told apart before the months take over. */
const WEEKS_SHOWN = 8;

/** The stretch of time a moment is grouped in, seen from `now`: this week, last week, a week a few back, or its month. */
export function periodOf(at: number, now: number): Period {
  const ws = weekStart(at);
  const back = Math.round((weekStart(now) - ws) / (7 * DAY));
  if (back <= 0) return { key: `w:${ymd(ws)}`, kind: 'week', name: 'This week', kicker: weekRange(ws), start: ws };
  if (back === 1) return { key: `w:${ymd(ws)}`, kind: 'week', name: 'Last week', kicker: weekRange(ws), start: ws };
  if (back < WEEKS_SHOWN) return { key: `w:${ymd(ws)}`, kind: 'week', name: weekRange(ws), kicker: `${back} weeks ago`, start: ws };
  const d = new Date(at);
  const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return { key: `m:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, kind: 'month', name: sameYear ? MONTH_NAMES[d.getMonth()] : `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, kicker: 'Earlier', start: first };
}

export interface TodayPlan {
  /** 'today', or the last day anything was worked on when today nothing has been yet */
  when: 'today' | 'last' | 'none';
  /** the start of that day */
  day: number;
  today: Tile[];
  /** the earlier conversations today's build on: each with the one it leads to, and why */
  ring: { tile: Tile; via: string; why: string }[];
  rest: Tile[];
}

/** At most this many earlier conversations are drawn round today's. */
export const RING_MAX = 10;

/**
 * Today's learning: what was worked on today (or, before anything has been
 * today, on the last day something was), the earlier conversations those
 * build on — an idea in common first, then the same subject — and the rest.
 */
export function todayOf(tiles: readonly Tile[], homes: Homes, ideas: readonly SharedIdea[], now: number): TodayPlan {
  if (!tiles.length) return { when: 'none', day: dayStart(now), today: [], ring: [], rest: [] };
  let day = dayStart(now);
  let when: TodayPlan['when'] = 'today';
  if (!tiles.some((t) => t.at >= day)) {
    day = dayStart(Math.max(...tiles.map((t) => t.at)));
    when = 'last';
  }
  // today has no end (a clock a little ahead is still today); the last day worked on does
  const today = tiles.filter((t) => t.at >= day && (when === 'today' || t.at < day + DAY)).sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
  const inToday = new Set(today.map((t) => t.id));
  const order = new Map(today.map((t, i) => [t.id, i]));
  // the strongest reason each earlier conversation has to be beside one of today's
  const best = new Map<string, { via: string; why: string; score: number; tile: Tile }>();
  const offer = (tile: Tile, via: string, why: string, score: number) => {
    const cur = best.get(tile.id);
    if (!cur || score > cur.score || (score === cur.score && (order.get(via) ?? 0) < (order.get(cur.via) ?? 0))) best.set(tile.id, { via, why, score, tile });
  };
  const byId = new Map(tiles.map((t) => [t.id, t]));
  for (const idea of ideas) {
    const here = idea.members.filter((m) => inToday.has(m));
    if (!here.length) continue;
    for (const m of idea.members) {
      const t = byId.get(m);
      if (!t || inToday.has(m)) continue;
      offer(t, here[0], `shares “${idea.says}”`, 3 + (idea.theme ? 1 : 0));
    }
  }
  for (const t of tiles) {
    if (inToday.has(t.id)) continue;
    const h = homes.of.get(t.id);
    if (!h || h.key === OTHER) continue;
    const via = today.find((x) => homes.of.get(x.id)?.key === h.key);
    if (via) offer(t, via.id, h.kind === 'project' ? `also in ${h.name}` : `also ${h.name}`, 2);
  }
  const ring = [...best.values()]
    .sort((a, b) => b.score - a.score || b.tile.at - a.tile.at || (a.tile.id < b.tile.id ? -1 : 1))
    .slice(0, RING_MAX)
    .map(({ tile, via, why }) => ({ tile, via, why }));
  const inRing = new Set(ring.map((r) => r.tile.id));
  const rest = tiles.filter((t) => !inToday.has(t.id) && !inRing.has(t.id)).sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1));
  return { when, day, today, ring, rest };
}

// ── the layout ───────────────────────────────────────────────────────

/** A hub's room: its star, and its name and kind beside it. */
export const HUB = { w: 264, h: 100 };
/** A dot's room. */
export const DOT = { w: 204, h: 38 };
/** a cluster's name, over it */
export const HEAD = 74;
export const PAD = 22;
const GAP_X = 104;
const GAP_Y = 84;
/** clusters sit in rows no wider than this */
const ROW_MAX = 1760;
/** where a hub's star sits in its room, and a dot's */
const HUB_AT = { x: 22, y: 26 };
const DOT_AT = { x: 12, y: 15 };
/** odd rows of hubs are set this far in, so a constellation is not a grid */
const BRICK = Math.round(HUB.w * 0.24);

export interface SkyNode {
  id: string;
  /** the cluster it is drawn in */
  g: string;
  hub: boolean;
  /** its words are drawn without it being hovered */
  named: boolean;
  /** the centre of its star, and its radius */
  x: number;
  y: number;
  r: number;
  /** its words: right of the star, or — round the left of today's ring — left of it */
  side: 'right' | 'left';
  label: Box;
  pinned: boolean;
  /** shown in a Project for its subject, not filed there */
  suggested: boolean;
  /** inside a folded cluster: not drawn; lines to it end at the cluster */
  folded: boolean;
  /** round today: the conversation of today's it leads to, and why */
  via?: { id: string; why: string };
  /** one of today's */
  focus?: boolean;
}

export interface Pt {
  x: number;
  y: number;
}

export interface SkyCluster extends Box {
  key: string;
  kind: ClusterKind;
  name: string;
  kicker: string;
  count: number;
  color: string | null;
  projectId: string | null;
  subject: Subject | null;
  archived: boolean;
  /** where its places are measured from: a pin is relative to it */
  origin: Pt;
  /** the box its name is written in */
  head: Box;
  /** the places a hub and a dot would be put in it, from its origin: for a node put down on the grid */
  cells: { hub: Pt[]; dot: Pt[] };
  suggested: string[];
  collapsed: boolean;
  /** a subject's cluster can be moved and take conversations; time keeps its own */
  movable: boolean;
  /** drawn round its middle (today's ring, the field beyond it), with no box */
  open: boolean;
  empty: boolean;
}

export interface Sector {
  key: string;
  name: string;
  color: string | null;
  x: number;
  y: number;
}

/**
 * The three ways the map can be drawn: today's learning, by week, by subject.
 * The Universal Map draws Today with the first and This week with the last,
 * over that week's conversations; This month and All time are a line through
 * time instead (timeline.ts).
 */
export type SkyLens = 'today' | 'week' | 'subject';

export interface SkyLayout {
  lens: SkyLens;
  nodes: SkyNode[];
  byId: Map<string, SkyNode>;
  clusters: SkyCluster[];
  /** constellation lines: each hub to the next begun in its cluster */
  chains: [string, string][];
  /** the subjects round today's outer field, named where they lie */
  sectors: Sector[];
  bounds: Box;
  /** what the view is fitted to first */
  focus: Box;
  /** today's lens: which day it is about */
  today?: { when: TodayPlan['when']; day: number };
}

export interface SkyIn {
  lens: SkyLens;
  /** the conversations shown: hidden ones and filtered ones already left out */
  tiles: readonly Tile[];
  homes: Homes;
  ideas: readonly SharedIdea[];
  arr: Pick<Arrangement, 'pins' | 'frames' | 'order' | 'sort' | 'display'>;
  now: number;
  narrow?: boolean;
  /** by subject: a Project with nothing in it is drawn too (all of it), or left out (one week) */
  keepEmpty?: boolean;
}

const overlaps = (a: Box, b: Box, air = 0) => a.x < b.x + b.w + air && b.x < a.x + a.w + air && a.y < b.y + b.h + air && b.y < a.y + a.h + air;

/** A small fixed offset for each node, so a cluster reads as stars and not a table; the same every time. */
function jitter(id: string, hub: boolean): Pt {
  const h = hashOf(id);
  return hub ? { x: (h % 23) - 11, y: ((h >> 5) % 19) - 9 } : { x: (h % 9) - 4, y: ((h >> 4) % 7) - 3 };
}

/** How many hubs across, by how many there are. A phone takes two. */
export function hubCols(n: number, narrow = false): number {
  if (n <= 1) return 1;
  if (narrow) return 2;
  return n <= 4 ? 2 : n <= 9 ? 3 : 4;
}

/** The place `i` a hub is put in, from a cluster's origin: rows that turn back on themselves, odd rows set in. */
export function hubCell(i: number, cols: number): Pt {
  const row = Math.floor(i / cols);
  const col = row % 2 === 0 ? i % cols : cols - 1 - (i % cols);
  return { x: col * HUB.w + (row % 2 ? BRICK : 0) + HUB_AT.x, y: row * HUB.h + HUB_AT.y };
}

export function dotCell(i: number, cols: number, top: number): Pt {
  return { x: (i % cols) * DOT.w + DOT_AT.x, y: top + Math.floor(i / cols) * DOT.h + DOT_AT.y };
}

/** Where a node's words go, beside its star — with a line more for why it is where it is, round today. */
function labelOf(x: number, y: number, r: number, hub: boolean, side: 'right' | 'left', why = false): Box {
  const w = hub ? HUB.w - 52 : DOT.w - 26;
  const h = (hub ? 64 : 20) + (why ? 20 : 0);
  const lx = side === 'right' ? x + r + 9 : x - r - 9 - w;
  return { x: Math.round(lx), y: Math.round(y - (hub ? 15 : 10)), w, h };
}

/** A node's star and words, as one box. */
export function nodeBox(n: Pick<SkyNode, 'x' | 'y' | 'r' | 'label' | 'named'>): Box {
  const star = { x: n.x - n.r - 4, y: n.y - n.r - 4, w: 2 * n.r + 8, h: 2 * n.r + 8 };
  return n.named ? boxAround([star, n.label]) : star;
}

interface Member {
  tile: Tile;
  hub: boolean;
  suggested: boolean;
  via?: { id: string; why: string };
}

/** The conversations of a cluster in the order they are placed, by what the person asked for. */
function ordered(members: Member[], sort: Arrangement['sort'], own: readonly string[] | undefined): Member[] {
  const byStart = (a: Member, b: Member) => a.tile.started - b.tile.started || (a.tile.id < b.tile.id ? -1 : a.tile.id > b.tile.id ? 1 : 0);
  const list = [...members];
  if (sort === 'recent') return list.sort((a, b) => b.tile.at - a.tile.at || byStart(a, b));
  if (sort === 'name') return list.sort((a, b) => a.tile.title.localeCompare(b.tile.title, undefined, { sensitivity: 'base' }) || byStart(a, b));
  if (sort === 'size') return list.sort((a, b) => b.tile.count + b.tile.turns - (a.tile.count + a.tile.turns) || byStart(a, b));
  if (sort === 'manual' && own?.length) {
    const at = new Map(own.map((id, i) => [id, i]));
    return list.sort((a, b) => (at.get(a.tile.id) ?? Infinity) - (at.get(b.tile.id) ?? Infinity) || byStart(a, b));
  }
  return list.sort(byStart);
}

interface ClusterIn {
  key: string;
  kind: ClusterKind;
  name: string;
  kicker: string;
  color: string | null;
  projectId: string | null;
  subject: Subject | null;
  archived: boolean;
  members: Member[];
  movable: boolean;
  /** hubs across, when not by how many there are */
  cols?: number;
}

/**
 * One cluster at a corner: its hubs as a constellation, its dots under them,
 * each where the person put it if they did, the rest in the next free place.
 */
function placeCluster(c: ClusterIn, at: Pt, a: SkyIn['arr'], opts: { narrow: boolean; pins: boolean; now: number; named: boolean }): { cluster: SkyCluster; nodes: SkyNode[] } {
  const set = a.frames[c.key];
  const collapsed = !!set?.collapsed;
  const origin = { x: at.x + PAD + (c.movable ? set?.dx ?? 0 : 0), y: at.y + HEAD + (c.movable ? set?.dy ?? 0 : 0) };
  const hubs = c.members.filter((m) => m.hub);
  const dots = c.members.filter((m) => !m.hub);
  const cols = c.cols ?? hubCols(hubs.length, opts.narrow);
  const hubRows = Math.ceil(hubs.length / cols);
  const hubW = hubs.length ? cols * HUB.w + (hubRows > 1 ? BRICK : 0) : 0;
  const dotCols = Math.max(1, Math.min(opts.narrow ? 2 : 4, Math.max(Math.floor(hubW / DOT.w), Math.min(dots.length, opts.narrow ? 2 : dots.length <= 4 ? 2 : 3))));
  const dotTop = hubRows * HUB.h + (hubs.length && dots.length ? 6 : 0);
  const nodes: SkyNode[] = [];
  // a dot is ambient beside hubs; in a cluster of only a few dots, each is named
  const dotsNamed = opts.named || (!hubs.length && dots.length <= 12);
  const cells = {
    hub: Array.from({ length: hubs.length + cols }, (_, i) => hubCell(i, cols)),
    dot: Array.from({ length: dots.length + dotCols }, (_, i) => dotCell(i, dotCols, dotTop)),
  };
  if (collapsed) {
    for (const m of c.members) {
      const r = radiusOf(m.tile, m.hub, a.display.size, opts.now);
      nodes.push({ id: m.tile.id, g: c.key, hub: m.hub, named: false, x: origin.x + 12, y: origin.y - 20, r, side: 'right', label: labelOf(origin.x + 12, origin.y - 20, r, m.hub, 'right'), pinned: false, suggested: m.suggested, folded: true, via: m.via });
    }
  } else {
    const pinnedBoxes: Box[] = [];
    if (opts.pins)
      for (const m of c.members) {
        const p = a.pins[m.tile.id];
        if (!p || p.g !== c.key) continue;
        const r = radiusOf(m.tile, m.hub, a.display.size, opts.now);
        const x = origin.x + p.x;
        const y = origin.y + p.y;
        const n: SkyNode = { id: m.tile.id, g: c.key, hub: m.hub, named: m.hub || dotsNamed, x, y, r, side: 'right', label: labelOf(x, y, r, m.hub, 'right', !!m.via), pinned: true, suggested: m.suggested, folded: false, via: m.via };
        nodes.push(n);
        pinnedBoxes.push(nodeBox({ ...n, named: true }));
      }
    const placed = new Set(nodes.map((n) => n.id));
    const fill = (list: Member[], hub: boolean) => {
      let s = 0;
      for (const m of list) {
        if (placed.has(m.tile.id)) continue;
        const r = radiusOf(m.tile, hub, a.display.size, opts.now);
        let n: SkyNode | null = null;
        // the next place that nothing put by hand is sitting on
        for (let guard = 0; guard < 400; guard++) {
          const cell = hub ? hubCell(s++, cols) : dotCell(s++, dotCols, dotTop);
          const j = jitter(m.tile.id, hub);
          const x = origin.x + cell.x + j.x;
          const y = origin.y + cell.y + j.y;
          const cand: SkyNode = { id: m.tile.id, g: c.key, hub, named: hub || dotsNamed, x, y, r, side: 'right', label: labelOf(x, y, r, hub, 'right', !!m.via), pinned: false, suggested: m.suggested, folded: false, via: m.via };
          n = cand;
          if (!pinnedBoxes.some((q) => overlaps(q, nodeBox({ ...cand, named: true }), -2))) break;
        }
        nodes.push(n!);
      }
    };
    fill(hubs, true);
    fill(dots, false);
  }
  // the cluster holds everything in it, wherever it was put — and an empty one keeps room to drop into
  const head = { x: origin.x - PAD, y: origin.y - HEAD, w: Math.max(hubW, dots.length ? dotCols * DOT.w : 0, 200) + 2 * PAD, h: HEAD - 10 };
  const inner = collapsed
    ? [{ x: origin.x - PAD, y: origin.y - HEAD, w: Math.max(260, c.name.length * 13 + 120), h: HEAD + 8 }]
    : [head, ...nodes.map((n) => nodeBox({ ...n, named: true })), ...(c.members.length ? [] : [{ x: origin.x, y: origin.y, w: 300, h: 76 }])];
  const box = boxAround(inner);
  const x1 = box.x + box.w + (collapsed ? 0 : PAD);
  const y1 = box.y + box.h + (collapsed ? 0 : PAD);
  return {
    cluster: {
      key: c.key,
      kind: c.kind,
      name: c.name,
      kicker: c.kicker,
      count: c.members.length,
      color: c.color,
      projectId: c.projectId,
      subject: c.subject,
      archived: c.archived,
      origin,
      head: { ...head, w: Math.max(head.w, 220) },
      cells,
      suggested: c.members.filter((m) => m.suggested).map((m) => m.tile.id),
      collapsed,
      movable: c.movable,
      open: false,
      empty: !c.members.length,
      x: box.x,
      y: box.y,
      w: x1 - box.x,
      h: y1 - box.y,
    },
    nodes,
  };
}

/** Clusters in rows, in their order; each where it was put. How big each is depends on what is in it, so they are placed one by one. */
function rows(list: ClusterIn[], a: SkyIn['arr'], opts: { narrow: boolean; pins: boolean; now: number; named?: boolean }): { clusters: SkyCluster[]; nodes: SkyNode[] } {
  const clusters: SkyCluster[] = [];
  const nodes: SkyNode[] = [];
  // on a phone the clusters go one under another, to be read top to bottom
  const rowMax = opts.narrow ? 600 : ROW_MAX;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const c of list) {
    // its size as it would be drawn, measured where it would sit
    const trial = placeCluster(c, { x: 0, y: 0 }, { ...a, frames: { ...a.frames, [c.key]: { ...(a.frames[c.key] ?? { dx: 0, dy: 0 }), dx: 0, dy: 0 } } }, { ...opts, pins: false, named: !!opts.named });
    const w = trial.cluster.w;
    const h = trial.cluster.h;
    if (x > 0 && x + w > rowMax) {
      x = 0;
      y += rowH + GAP_Y;
      rowH = 0;
    }
    const placed = placeCluster(c, { x, y }, a, { ...opts, named: !!opts.named });
    clusters.push(placed.cluster);
    nodes.push(...placed.nodes);
    x += w + GAP_X;
    rowH = Math.max(rowH, h);
  }
  return { clusters, nodes };
}

/** Each hub joined to the next one begun in its cluster: the cluster's constellation, in the order it grew. */
function chainsOf(clusters: readonly ClusterIn[], by: 'started' | 'at'): [string, string][] {
  const out: [string, string][] = [];
  for (const c of clusters) {
    const hubs = c.members.filter((m) => m.hub).map((m) => m.tile);
    hubs.sort((a, b) => (by === 'at' ? a.at - b.at : a.started - b.started) || (a.id < b.id ? -1 : 1));
    for (let i = 1; i < hubs.length; i++) out.push([hubs[i - 1].id, hubs[i].id]);
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** By subject: every Project, then the subjects read from the conversations, then everything else. */
function bySubject(input: SkyIn): SkyLayout {
  const { tiles, homes, arr, now } = input;
  const narrow = !!input.narrow;
  const members = new Map<string, Member[]>();
  for (const t of tiles) {
    const h = homes.of.get(t.id);
    if (!h) continue;
    members.set(h.key, [...(members.get(h.key) ?? []), { tile: t, hub: isHub(t), suggested: homes.suggested.has(t.id) }]);
  }
  const list: ClusterIn[] = homes.list
    .filter((h) => (h.kind === 'project' && input.keepEmpty !== false) || members.get(h.key)?.length)
    .map((h) => {
      const ms = ordered(members.get(h.key) ?? [], arr.sort, arr.order[h.key]);
      const n = ms.length;
      const kicker = h.kind === 'project' ? `Project · ${n}` : h.kind === 'course' ? `Course · ${n}` : h.kind === 'field' ? `Subject · ${n}` : `Mixed · ${n}`;
      return { key: h.key, kind: h.kind, name: h.archived ? `${h.name} · archived` : h.name, kicker, color: h.color, projectId: h.projectId, subject: h.subject, archived: h.archived, members: ms, movable: true };
    });
  const { clusters, nodes } = rows(list, arr, { narrow, pins: true, now });
  const bounds = boxAround(clusters);
  return { lens: 'subject', nodes, byId: new Map(nodes.map((n) => [n.id, n])), clusters, chains: chainsOf(list, 'started'), sectors: [], bounds, focus: bounds };
}

/** By week: this week, last week, a few weeks back, then months; newest first. */
function byWeek(input: SkyIn): SkyLayout {
  const { tiles, arr, now } = input;
  const narrow = !!input.narrow;
  const periods = new Map<string, { p: Period; members: Member[] }>();
  for (const t of [...tiles].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1))) {
    const p = periodOf(t.at, now);
    const cur = periods.get(p.key) ?? { p, members: [] };
    cur.members.push({ tile: t, hub: isHub(t), suggested: false });
    periods.set(p.key, cur);
  }
  const list: ClusterIn[] = [...periods.values()]
    .sort((x, y) => y.p.start - x.p.start)
    .map(({ p, members }) => ({ key: p.key, kind: p.kind, name: p.name, kicker: `${p.kicker} · ${members.length}`, color: null, projectId: null, subject: null, archived: false, members, movable: false }));
  const { clusters, nodes } = rows(list, arr, { narrow, pins: false, now });
  const bounds = boxAround(clusters);
  return { lens: 'week', nodes, byId: new Map(nodes.map((n) => [n.id, n])), clusters, chains: chainsOf(list, 'at'), sectors: [], bounds, focus: bounds };
}

/**
 * Today's learning. On a wide screen: today's conversations in the middle;
 * the earlier ones they build on in a ring round them, each joined to its
 * own; everything else an ambient field beyond, a sector to each subject.
 * On a phone the three are read one under another.
 */
function byToday(input: SkyIn): SkyLayout {
  const { tiles, homes, ideas, arr, now } = input;
  const narrow = !!input.narrow;
  const plan = todayOf(tiles, homes, ideas, now);
  const kicker = plan.when === 'today' ? `Today · ${dayName(plan.day)}` : plan.when === 'last' ? `Last worked on · ${dayName(plan.day)}` : 'Today';
  const name = plan.when === 'last' ? 'Where you left off' : 'Today’s learning';
  const todayIn: ClusterIn = {
    key: 't:today',
    kind: 'today',
    name,
    kicker,
    color: null,
    projectId: null,
    subject: null,
    archived: false,
    // today's are all drawn as stars with their names: they are what the view is about
    members: plan.today.map((t) => ({ tile: t, hub: true, suggested: false })),
    movable: false,
    // a day's few side by side
    cols: narrow ? hubCols(plan.today.length, true) : plan.today.length <= 3 ? Math.max(1, plan.today.length) : plan.today.length <= 6 ? 3 : 4,
  };
  const ringMembers: Member[] = plan.ring.map((r) => ({ tile: r.tile, hub: isHub(r.tile), suggested: false, via: { id: r.via, why: r.why } }));
  const restMembers: Member[] = plan.rest.map((t) => ({ tile: t, hub: isHub(t), suggested: false }));

  if (narrow) {
    const list: ClusterIn[] = [todayIn];
    if (ringMembers.length) list.push({ key: 't:ring', kind: 'ring', name: 'What it builds on', kicker: `Earlier · ${ringMembers.length}`, color: null, projectId: null, subject: null, archived: false, members: ringMembers, movable: false });
    if (restMembers.length) list.push({ key: 't:rest', kind: 'rest', name: 'Everything else', kicker: `${plural(restMembers.length, 'conversation', 'conversations')}`, color: null, projectId: null, subject: null, archived: false, members: restMembers.map((m) => ({ ...m, hub: false })), movable: false });
    const { clusters, nodes } = rows(list, { ...arr, frames: {} }, { narrow, pins: false, now });
    for (const n of nodes) {
      if (n.g === 't:today') n.focus = true;
      // the field of everything else is ambient: named only when pointed at
      if (n.g === 't:rest') n.named = false;
    }
    const bounds = boxAround(clusters);
    const top = clusters.filter((c) => c.key !== 't:rest');
    return { lens: 'today', nodes, byId: new Map(nodes.map((n) => [n.id, n])), clusters, chains: [], sectors: [], bounds, focus: boxAround(top.length ? top : clusters), today: { when: plan.when, day: plan.day } };
  }

  // the middle: today's, a few across, centred on the origin
  const cols = todayIn.cols ?? 1;
  const rowsN = Math.max(1, Math.ceil(todayIn.members.length / cols));
  const blockW = cols * HUB.w + (rowsN > 1 ? BRICK : 0);
  const blockH = rowsN * HUB.h;
  const middle = placeCluster(todayIn, { x: -blockW / 2 - PAD, y: -blockH / 2 - HEAD }, { ...arr, frames: {} }, { narrow: false, pins: false, now, named: true });
  for (const n of middle.nodes) n.focus = true;
  const nodes: SkyNode[] = [...middle.nodes];
  const clusters: SkyCluster[] = [middle.cluster];
  const mid = { x: middle.cluster.x + middle.cluster.w / 2, y: middle.cluster.y + middle.cluster.h / 2 };

  // the ring: each earlier conversation as near the direction of its own as the ring allows
  const rx = Math.max(560, middle.cluster.w / 2 + 330);
  const ry = Math.max(300, middle.cluster.h / 2 + 200);
  const at = new Map(middle.nodes.map((n) => [n.id, n]));
  const want = ringMembers.map((m) => {
    const v = m.via ? at.get(m.via.id) : undefined;
    const ang = v ? Math.atan2((v.y - mid.y) / ry, (v.x - mid.x) / rx) : -Math.PI / 2;
    return { m, ang };
  });
  want.sort((p, q) => p.ang - q.ang || (p.m.tile.id < q.m.tile.id ? -1 : 1));
  const k = want.length;
  // the slots, evenly round, turned so the first lands nearest where the first wants to be
  const step = k ? (2 * Math.PI) / k : 0;
  const turn = k ? want[0].ang : 0;
  const ringNodes: SkyNode[] = want.map(({ m }, i) => {
    const ang = turn + i * step;
    const x = Math.round(mid.x + Math.cos(ang) * rx);
    const y = Math.round(mid.y + Math.sin(ang) * ry);
    const r = radiusOf(m.tile, m.hub, arr.display.size, now);
    const side: 'right' | 'left' = x < mid.x - 40 ? 'left' : 'right';
    return { id: m.tile.id, g: 't:ring', hub: m.hub, named: true, x, y, r, side, label: labelOf(x, y, r, m.hub, side, true), pinned: false, suggested: false, folded: false, via: m.via };
  });
  nodes.push(...ringNodes);
  const ringBox = boxAround(ringNodes.map((n) => nodeBox(n)));
  if (ringNodes.length)
    clusters.push({
      key: 't:ring',
      kind: 'ring',
      name: 'What it builds on',
      kicker: `Earlier · ${ringNodes.length}`,
      count: ringNodes.length,
      color: null,
      projectId: null,
      subject: null,
      archived: false,
      origin: { x: ringBox.x, y: ringBox.y },
      // the ring needs no name: each in it says why it is there
      head: { x: 0, y: 0, w: 0, h: 0 },
      cells: { hub: [], dot: [] },
      suggested: [],
      collapsed: false,
      movable: false,
      open: true,
      empty: false,
      ...ringBox,
    });

  // everything else: a field beyond the ring, a sector to each subject, the newest nearest
  const sectors: Sector[] = [];
  if (restMembers.length) {
    const bySubjectKey = new Map<string, Member[]>();
    for (const m of restMembers) {
      const key = homes.of.get(m.tile.id)?.key ?? OTHER;
      bySubjectKey.set(key, [...(bySubjectKey.get(key) ?? []), m]);
    }
    const order = homes.list.map((h) => h.key).filter((key) => bySubjectKey.has(key));
    const total = restMembers.length;
    const minShare = Math.min(0.12, 1 / order.length);
    const shares = order.map((key) => Math.max(minShare, bySubjectKey.get(key)!.length / total));
    const sum = shares.reduce((s, v) => s + v, 0);
    const rx0 = rx + 280;
    const ry0 = ry + 200;
    let ang0 = -Math.PI / 2;
    const restNodes: SkyNode[] = [];
    order.forEach((key, si) => {
      const span = (shares[si] / sum) * 2 * Math.PI;
      const list = bySubjectKey.get(key)!;
      // inner arcs first; on each, as many as fit with room between them
      let ring = 0;
      let placedN = 0;
      while (placedN < list.length && ring < 40) {
        const a = rx0 + ring * 34;
        const b = ry0 + ring * 26;
        const arc = span * Math.sqrt((a * a + b * b) / 2);
        const fit = Math.max(1, Math.floor(arc / 30));
        const here = list.slice(placedN, placedN + fit);
        here.forEach((m, j) => {
          const ang = ang0 + ((j + 0.5) / Math.max(here.length, fit)) * span;
          const jt = jitter(m.tile.id, false);
          const x = Math.round(mid.x + Math.cos(ang) * a + jt.x);
          const y = Math.round(mid.y + Math.sin(ang) * b + jt.y);
          const r = m.hub ? 5 : 3;
          const side: 'right' | 'left' = x < mid.x - 40 ? 'left' : 'right';
          restNodes.push({ id: m.tile.id, g: 't:rest', hub: m.hub, named: false, x, y, r, side, label: labelOf(x, y, r, false, side), pinned: false, suggested: false, folded: false });
        });
        placedN += here.length;
        ring++;
      }
      const h = homes.list.find((x) => x.key === key)!;
      const la = ang0 + span / 2;
      const ra = rx0 + ring * 34 + 40;
      const rb = ry0 + ring * 26 + 34;
      sectors.push({ key, name: h.name, color: h.color, x: Math.round(mid.x + Math.cos(la) * ra), y: Math.round(mid.y + Math.sin(la) * rb) });
      ang0 += span;
    });
    nodes.push(...restNodes);
    const restBox = boxAround(restNodes.map((n) => nodeBox(n)));
    clusters.push({
      key: 't:rest',
      kind: 'rest',
      name: 'Everything else',
      kicker: plural(restNodes.length, 'conversation', 'conversations'),
      count: restNodes.length,
      color: null,
      projectId: null,
      subject: null,
      archived: false,
      origin: { x: restBox.x, y: restBox.y },
      head: { x: 0, y: 0, w: 0, h: 0 },
      cells: { hub: [], dot: [] },
      suggested: [],
      collapsed: false,
      movable: false,
      open: true,
      empty: false,
      ...restBox,
    });
  }
  const focus = boxAround([middle.cluster, ...(ringNodes.length ? [ringBox] : []), ...clusters.filter((c) => c.key === 't:ring').map((c) => c.head)]);
  const bounds = boxAround([...clusters, ...sectors.map((s) => ({ x: s.x - 80, y: s.y - 12, w: 160, h: 24 }))]);
  return { lens: 'today', nodes, byId: new Map(nodes.map((n) => [n.id, n])), clusters, chains: [], sectors, bounds, focus, today: { when: plan.when, day: plan.day } };
}

/** The whole map, for a lens. */
export function skyLayout(input: SkyIn): SkyLayout {
  if (input.lens === 'week') return byWeek(input);
  if (input.lens === 'today') return byToday(input);
  return bySubject(input);
}

// ── shared ideas, named between the conversations ────────────────────

export interface PlacedIdea extends SharedIdea, Box {}

/**
 * Where each shared idea is written: between the conversations that share it,
 * at the nearest spot that sits on no star, no name and no other idea.
 */
export function placeSkyIdeas(ideas: readonly SharedIdea[], layout: SkyLayout): PlacedIdea[] {
  const out: PlacedIdea[] = [];
  const solid: Box[] = [
    ...layout.nodes.filter((n) => !n.folded).map((n) => nodeBox(n)),
    ...layout.clusters.filter((c) => !c.open).map((c) => c.head),
    // an empty Project keeps its room to be dropped into
    ...layout.clusters.filter((c) => c.empty).map((c) => ({ x: c.origin.x, y: c.origin.y, w: 300, h: 76 })),
  ];
  for (const idea of ideas) {
    const at = idea.members.map((id) => layout.byId.get(id)).filter((n): n is SkyNode => !!n && !n.folded);
    if (at.length < 2) continue;
    const cx = at.reduce((s, n) => s + n.x, 0) / at.length;
    const cy = at.reduce((s, n) => s + n.y, 0) / at.length;
    const w = Math.round(30 + Math.min(28, idea.says.length) * 7.2 + (idea.theme ? 26 : 0));
    const h = idea.theme ? 28 : 24;
    let spot: Box | null = null;
    for (let r = 0; r <= 900 && !spot; r += 20) {
      const turns = r === 0 ? 1 : Math.max(8, Math.round(r / 14));
      for (let k = 0; k < turns; k++) {
        const ang = -Math.PI / 2 + (2 * Math.PI * k) / turns;
        const b = { x: Math.round(cx + Math.cos(ang) * r - w / 2), y: Math.round(cy + Math.sin(ang) * r * 0.7 - h / 2), w, h };
        if (!solid.some((t) => overlaps(t, b, 6)) && !out.some((o) => overlaps(o, b, 8))) {
          spot = b;
          break;
        }
      }
    }
    if (spot) out.push({ ...idea, ...spot });
  }
  return out;
}

// ── putting a node down ──────────────────────────────────────────────

/** The cluster a point is in — one that takes conversations — the topmost first. */
export function clusterAt(clusters: readonly SkyCluster[], px: number, py: number): SkyCluster | null {
  for (let i = clusters.length - 1; i >= 0; i--) {
    const c = clusters[i];
    if (!c.movable) continue;
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
  }
  return null;
}

/** The nearest place on a cluster's grid to a point measured from its origin: a hub's place for a hub, a dot's for a dot. */
export function snapToCell(c: Pick<SkyCluster, 'cells'>, x: number, y: number, hub: boolean): Pt {
  const list = hub ? c.cells.hub : c.cells.dot;
  let best: Pt = { x, y };
  let d = Infinity;
  for (const p of list) {
    const e = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (e < d) {
      d = e;
      best = p;
    }
  }
  return { x: best.x, y: best.y };
}
