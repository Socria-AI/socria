// lib/logos5/spatial.ts — WHERE EACH CONVERSATION LIVES, AND WHAT TODAY IS.
//
// Every conversation is on the Universal Map ("Clearer Structures and UI":
// past study sessions saved on a map, not buried in a list). This says what
// the map is drawn from:
//   • a major study session is a hub, a quick one-off question a dot;
//   • each conversation's home by subject — a Project first (the person's own
//     word), then a subject they gave it by hand, then a Project about the
//     same subject (shown there, marked, never filed without them), then the
//     course or field read from the conversation itself (subjects.ts) —
//     nothing has to be filed — then everything else;
//   • Today: what was worked on today (or, before anything has been, the last
//     day something was) and the earlier conversations it builds on.
// bubbles.ts draws Today and This week from these, each subject a circle;
// timeline.ts draws This month and All time as a line through time.
//
// Deterministic — no randomness, no clock (the time is passed in) — so the
// same conversations draw the same map on every screen.
//
// PURE.

import type { Arrangement } from './arrange';
import type { ProjectIn, SharedIdea, Tile } from './universe';
import { OTHER, sameSubject, subjectOf, subjectOfProject, type Subject } from './subjects';

// ── a conversation: a session, or a quick question ───────────────────

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

// ── where each conversation lives, by subject ────────────────────────

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

// ── time: the day, the week, and today ───────────────────────────────

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

/** "Tue Oct 14" */
export function dayName(at: number): string {
  const d = new Date(at);
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
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
 * build on — one the person linked to one of today's first, then an idea in
 * common, then the same subject — and the rest.
 */
export function todayOf(tiles: readonly Tile[], homes: Homes, ideas: readonly SharedIdea[], now: number, links: readonly { a: string; b: string }[] = []): TodayPlan {
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
  // what the person linked to one of today's, first of all
  for (const l of links) {
    const [here, there] = inToday.has(l.a) ? [l.a, l.b] : [l.b, l.a];
    const t = byId.get(there);
    if (inToday.has(here) && t && !inToday.has(there)) offer(t, here, 'you linked these', 5);
  }
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
