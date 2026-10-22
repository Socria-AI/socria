// lib/logos5/universe.ts — EVERY CONVERSATION, READ FOR THE UNIVERSAL MAP.
//
// The Universal Map is Logos 5's home: every conversation, as a node on one
// map (spatial.ts lays it out — hubs and ambient dots, grouped by today, by
// week or by subject). This reads each conversation for it: its name, what
// kind of thinking it is, where it stands, its key ideas, the small graph its
// map grew, what it is about (for subjects.ts), and how much it holds. It
// also finds the ideas two or more conversations share, named in their own
// words; one shared by three or more is a recurring theme.
//
// It is read from the conversations as they are. Nothing is made up: where a
// conversation stands is the first line of its latest synthesis or reply; a
// question is "open" only when Socria asked it last and nobody has answered.
//
// PURE.

import { wordsOf } from './linking';
import type { About } from './subjects';

export interface UniverseIn {
  id: string;
  title: string;
  updatedAt: number;
  /** a Logos line of thinking (the default), or a Core chat */
  kind?: 'logos' | 'core';
  projectId?: string | null;
  map?: {
    nodes?: { id: string; label: string; type?: string }[];
    edges?: { from: string; to: string }[];
    context?: string;
    objects?: { objs?: { kind: string; states: unknown[]; at: number }[] };
    /** what the map read the latest turn as being about: the subject in the person's words, and the field */
    ask?: { topic?: string; domain?: string } | null;
    /** the picture it drew */
    viz?: { kind?: string } | null;
  } | null;
  messages?: { role: string; content?: string; at?: number; synthesis?: { title?: string; lede?: string } | null }[];
}

export interface ProjectIn {
  id: string;
  name: string;
  /** Project Home's colour key (lib/project-home.ts PROJECT_COLORS) */
  color?: string | null;
  createdAt?: number;
  archived?: boolean;
}

// ── a conversation, as a tile ────────────────────────────────────────

/** What kind of thinking a conversation is, for its glyph. What was made in it is counted apart (Tile.made). */
export type Look = 'study' | 'deciding' | 'planning' | 'learning' | 'writing' | 'thinking' | 'chat';

export const LOOK_SAID: Record<Look, string> = {
  study: 'Study',
  deciding: 'Deciding',
  planning: 'Planning',
  learning: 'Learning',
  writing: 'Writing',
  thinking: 'Thinking',
  chat: 'Chat',
};

export interface TileIdea {
  id: string;
  label: string;
  /** 'idea' from the map; 'topic' from a study */
  from: 'idea' | 'topic';
  /** its place in the tile's small graph, from the graph's centre, within a radius of 1 */
  x: number;
  y: number;
  /** how many lines meet here */
  degree: number;
}

export interface Tile {
  id: string;
  kind: 'logos' | 'core';
  title: string;
  /** last active */
  at: number;
  /** when it was begun, as near as the conversation says */
  started: number;
  projectId: string | null;
  look: Look;
  /** "Deciding", "Study"… */
  lookSaid: string;
  /** everything its graph holds, drawn or not */
  count: number;
  ideas: TileIdea[];
  edges: { from: string; to: string }[];
  /** the ideas that matter most to it, by how connected they are */
  key: string[];
  /** where it stands, in a line: from its latest synthesis or reply */
  stands: string;
  /** a question Socria asked last that nobody has answered yet */
  open: string | null;
  /** the person's turns in it */
  turns: number;
  /** what Socria made in it: charts, plans, practice… */
  made: number;
  /** a study's files, and the topics they were sorted into; 0 for anything else */
  files: number;
  topics: number;
  /** what it says about what it is about, for its subject (subjects.ts) */
  about: About;
}

const MAX_TILES = 150;
const MAX_IDEAS = 12;

/**
 * What a line of thinking holds to draw: the topics its files were sorted
 * into, then the ideas its map grew — both are its thinking, a study's lead.
 */
function studyOf(s: UniverseIn): { course?: unknown; files?: unknown[]; topics?: { id: string; title: string; after?: string[] }[] } | undefined {
  const study = s.map?.objects?.objs?.find((o) => o.kind === 'study');
  return study?.states?.[study.at] as { course?: unknown; files?: unknown[]; topics?: { id: string; title: string; after?: string[] }[] } | undefined;
}

function graphOf(s: UniverseIn): { nodes: { id: string; label: string; from: TileIdea['from'] }[]; edges: { from: string; to: string }[] } {
  const st = studyOf(s);
  const topics = (st?.topics ?? []).filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string');
  const ideas = (s.map?.nodes ?? []).filter((n) => n && typeof n.id === 'string' && typeof n.label === 'string' && n.label.trim());
  const ids = new Set(ideas.map((n) => n.id));
  // a topic's id ("t1") is kept apart from a card's, so the two never meet by accident
  return {
    nodes: [...topics.map((t) => ({ id: `topic:${t.id}`, label: t.title, from: 'topic' as const })), ...ideas.map((n) => ({ id: n.id, label: n.label, from: 'idea' as const }))],
    edges: [
      ...topics.flatMap((t) => (t.after ?? []).filter((a) => topics.some((x) => x.id === a)).map((a) => ({ from: `topic:${a}`, to: `topic:${t.id}` }))),
      ...(s.map?.edges ?? []).filter((e) => ids.has(e.from) && ids.has(e.to)),
    ],
  };
}

/**
 * A small graph in a circle of radius 1: the most connected idea at the
 * middle, the rest on rings around it in order of how connected they are.
 */
function layoutGraph(nodes: { id: string; label: string; from: TileIdea['from'] }[], edges: { from: string; to: string }[]): TileIdea[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const order = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || nodes.indexOf(a) - nodes.indexOf(b));
  const out: TileIdea[] = [];
  const hub = order.length > 2 && (degree.get(order[0].id) ?? 0) > 1;
  if (hub) out.push({ ...order[0], x: 0, y: 0, degree: degree.get(order[0].id) ?? 0 });
  const rest = hub ? order.slice(1) : order;
  const inner = Math.min(rest.length, 6);
  rest.forEach((n, i) => {
    const ring = i < inner ? 0 : 1;
    const k = ring === 0 ? inner : rest.length - inner;
    const at = ring === 0 ? i : i - inner;
    const radius = rest.length === 1 ? 0 : ring === 0 ? (rest.length > 6 ? 0.5 : 0.66) : 0.94;
    const turn = (2 * Math.PI * at) / Math.max(1, k) - Math.PI / 2 + (ring ? Math.PI / Math.max(1, k) : 0);
    out.push({ ...n, x: Math.round(Math.cos(turn) * radius * 1000) / 1000, y: Math.round(Math.sin(turn) * radius * 1000) / 1000, degree: degree.get(n.id) ?? 0 });
  });
  return out;
}

/** Words as read: no markdown, no citations, no fenced code or maths, one line. */
export function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\[[A-Z]\d+(?:\.\d+)?\]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);

/** The sentences of a text, as read. */
function sentencesOf(text: string): string[] {
  return (plain(text).match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? []).map((x) => x.trim()).filter(Boolean);
}

/** The first thing a text says that is not a question, in a line. */
export function firstSaid(text: string, max = 120): string {
  const s = sentencesOf(text).find((x) => !x.endsWith('?') && x.length > 3);
  return s ? clip(s, max) : '';
}

/** The question a text ends on, if it ends on one. */
export function endsAsking(text: string): string | null {
  const paras = text.trim().split(/\n\s*\n/);
  const last = sentencesOf(paras[paras.length - 1] ?? '');
  const q = last[last.length - 1];
  return q && q.endsWith('?') && q.length >= 12 ? clip(q, 160) : null;
}

const LOOK_OF_CONTEXT: Record<string, Look> = {
  deciding: 'deciding',
  planning: 'planning',
  learning: 'learning',
  math: 'learning',
  writing: 'writing',
  creating: 'writing',
};

function lookOf(s: UniverseIn): { look: Look; made: number } {
  if (s.kind === 'core') return { look: 'chat', made: 0 };
  const objs = s.map?.objects?.objs ?? [];
  const made = objs.filter((o) => o.kind !== 'study').length;
  if (objs.some((o) => o.kind === 'study')) return { look: 'study', made };
  return { look: LOOK_OF_CONTEXT[s.map?.context ?? ''] ?? 'thinking', made };
}

/** One conversation, read for its tile. */
export function tileOf(s: UniverseIn): Tile {
  const kind = s.kind === 'core' ? 'core' : 'logos';
  const g = kind === 'core' ? { nodes: [], edges: [] } : graphOf(s);
  const kept = g.nodes.slice(0, MAX_IDEAS);
  const keptIds = new Set(kept.map((n) => n.id));
  const edges = g.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
  const ideas = layoutGraph(kept, edges);
  const title = (s.title || '').trim() || (kind === 'core' ? 'A chat' : 'A line of thinking');
  const msgs = s.messages ?? [];
  const { look, made } = lookOf(s);
  // where it stands: its latest synthesis, else the latest reply, else what was asked
  let stands = '';
  const synth = [...msgs].reverse().find((m) => m.role === 'assistant' && m.synthesis && (m.synthesis.lede || m.synthesis.title));
  if (synth?.synthesis) stands = firstSaid(synth.synthesis.lede || synth.synthesis.title || '');
  if (!stands) {
    const reply = [...msgs].reverse().find((m) => m.role === 'assistant' && (m.content ?? '').trim());
    if (reply) stands = firstSaid(reply.content ?? '');
  }
  if (!stands) {
    const asked = [...msgs].reverse().find((m) => m.role === 'user' && (m.content ?? '').trim());
    if (asked) {
      const said = clip(plain(asked.content ?? ''), 96);
      if (said && said.toLowerCase() !== title.toLowerCase()) stands = `“${said}”`;
    }
  }
  const last = msgs[msgs.length - 1];
  const open = last && last.role === 'assistant' ? endsAsking(last.content ?? '') : null;
  const firstAt = msgs.find((m) => typeof m.at === 'number' && (m.at as number) > 0)?.at;
  const started = typeof firstAt === 'number' ? firstAt : s.updatedAt || 0;
  const t = title.toLowerCase();
  const key = [...ideas]
    .filter((n) => n.label.trim().toLowerCase() !== t)
    .sort((a, b) => b.degree - a.degree || ideas.indexOf(a) - ideas.indexOf(b))
    .slice(0, 3)
    .map((n) => clip(n.label.trim(), 40));
  const text = (v: unknown, max: number) => (typeof v === 'string' ? clip(plain(v), max) : '');
  const asked = msgs.find((m) => m.role === 'user' && (m.content ?? '').trim());
  const st = kind === 'core' ? undefined : studyOf(s);
  const about: About = {
    title,
    course: text(st?.course, 60),
    domain: text(s.map?.ask?.domain, 40),
    topic: text(s.map?.ask?.topic, 120),
    viz: text(s.map?.viz?.kind, 30),
    asked: asked ? text(asked.content, 240) : '',
    ideas: [...ideas].sort((a, b) => b.degree - a.degree).slice(0, 8).map((n) => n.label),
    stands,
  };
  return {
    id: s.id,
    kind,
    title,
    at: s.updatedAt || 0,
    started,
    projectId: s.projectId ?? null,
    look,
    lookSaid: LOOK_SAID[look],
    count: g.nodes.length,
    ideas,
    edges,
    key,
    stands,
    open,
    turns: msgs.filter((m) => m.role === 'user').length,
    made,
    files: Array.isArray(st?.files) ? st.files.length : 0,
    topics: Array.isArray(st?.topics) ? st.topics.filter((t) => t && typeof t.title === 'string').length : 0,
    about,
  };
}

/**
 * Every conversation as a tile: lines of thinking with something in them and
 * Core chats, at most a hundred and fifty, the most recently active kept.
 */
export function tilesOf(conversations: readonly UniverseIn[]): Tile[] {
  // ONE TILE PER CONVERSATION. A Core chat this surface also holds as a
  // conversation of its own is that conversation — its words and its map —
  // not a second tile beside it with only its name (lib/logos5/merge.ts).
  const byId = new Map<string, UniverseIn>();
  for (const s of conversations) {
    if (!s || typeof s.id !== 'string') continue;
    const had = byId.get(s.id);
    if (!had || (had.kind === 'core' && s.kind !== 'core')) byId.set(s.id, s);
  }
  return [...byId.values()]
    // a line of thinking with nothing said in it holds nothing to show
    .filter((s) => s.kind === 'core' || (s.messages ?? []).length > 0 || (s.map?.nodes ?? []).length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_TILES)
    .map(tileOf);
}

/** The line of thinking last worked in: where to pick up. */
export function resumeOf(tiles: readonly Tile[]): Tile | null {
  let best: Tile | null = null;
  for (const t of tiles) if (t.kind === 'logos' && t.turns > 0 && (!best || t.at > best.at)) best = t;
  return best;
}

// ── boxes ────────────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The box around boxes; an empty one at the origin when there are none. */
export function boxAround(boxes: readonly Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A note's room on the map, from its words. */
export function noteBox(n: { x: number; y: number; text: string }): Box {
  const rows = n.text.split('\n');
  const widest = Math.max(4, ...rows.map((r) => r.length));
  return { x: n.x, y: n.y, w: Math.min(520, 40 + widest * 12.5), h: 18 + rows.length * 34 };
}

// ── shared ideas, between conversations ──────────────────────────────

/** Two labels that share an idea: most of the shorter one's meaningful words in the other. */
export function shared(a: string, b: string): string | null {
  return sharedWords([...new Set(wordsOf(a))], new Set(wordsOf(b)));
}

function sharedWords(wa: readonly string[], wb: ReadonlySet<string>): string | null {
  if (!wa.length || !wb.size) return null;
  const both = wa.filter((w) => wb.has(w));
  const least = Math.min(wa.length, wb.size);
  if (!both.length || both.length / least < 0.6) return null;
  // one short common word is not a shared idea
  if (both.length === 1 && both[0].length < 6) return null;
  return both.join(' ');
}

export interface SharedIdea {
  /** the shared words, in order: the same idea found again has the same key */
  key: string;
  /** what it is called: the shortest of the conversations' own names for it */
  says: string;
  /** the conversations that share it */
  members: string[];
  /** shared by three or more: a theme that keeps coming back */
  theme: boolean;
}

/** A word in more handles than this is too common to say anything shared. */
const COMMON = 40;

/**
 * The ideas conversations share: an idea in one whose meaningful words are
 * mostly in an idea of another (a Core chat is matched by its name, but two
 * chats are never joined by their names alone). The same shared words found
 * again add to the same idea; most shared first.
 */
export function sharedIdeas(tiles: readonly Tile[], cap = 24): SharedIdea[] {
  const handles: { tile: number; core: boolean; label: string; words: string[]; set: Set<string> }[] = [];
  tiles.forEach((t, i) => {
    const labels = t.kind === 'core' ? [t.title] : t.ideas.map((n) => n.label);
    for (const label of labels) {
      const words = [...new Set(wordsOf(label))];
      if (words.length) handles.push({ tile: i, core: t.kind === 'core', label, words, set: new Set(words) });
    }
  });
  const index = new Map<string, number[]>();
  handles.forEach((h, hi) => {
    for (const w of h.words) index.set(w, [...(index.get(w) ?? []), hi]);
  });
  const seen = new Set<string>();
  const found = new Map<string, { says: string; members: Set<number>; names: Set<string> }>();
  const pairs = new Set<string>();
  for (const [, list] of [...index.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (list.length > COMMON) continue;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const A = handles[list[i]];
        const B = handles[list[j]];
        if (A.tile === B.tile || (A.core && B.core)) continue;
        const pk = list[i] < list[j] ? `${list[i]}|${list[j]}` : `${list[j]}|${list[i]}`;
        if (seen.has(pk)) continue;
        seen.add(pk);
        const says = sharedWords(A.words, B.set) ?? sharedWords(B.words, A.set);
        if (!says) continue;
        // one shared idea per pair of conversations, so a pair never draws a tangle
        const tp = A.tile < B.tile ? `${A.tile}|${B.tile}` : `${B.tile}|${A.tile}`;
        const key = says.split(' ').sort().join(' ');
        const cur = found.get(key);
        if (pairs.has(tp) && !cur) continue;
        pairs.add(tp);
        if (cur) {
          cur.members.add(A.tile);
          cur.members.add(B.tile);
          cur.names.add(A.label.trim());
          cur.names.add(B.label.trim());
        } else found.set(key, { says, members: new Set([A.tile, B.tile]), names: new Set([A.label.trim(), B.label.trim()]) });
      }
  }
  // called by its own words, not the folded ones it was matched by: the shortest name it goes by
  const nameOf = (v: { says: string; names: Set<string> }) => [...v.names].filter((x) => x.length <= 40).sort((x, y) => x.length - y.length || (x < y ? -1 : 1))[0] ?? v.says;
  return [...found.entries()]
    .map(([key, v]) => ({ key, says: nameOf(v), members: [...v.members].sort((x, y) => x - y).map((i) => tiles[i].id), theme: v.members.size >= 3 }))
    .sort((x, y) => y.members.length - x.members.length || (x.key < y.key ? -1 : 1))
    .slice(0, cap);
}

// ── how close you are: what a tile shows at this zoom ────────────────

export type Detail = 'far' | 'mid' | 'near';

/** Far: a hub's name; mid: its kind and when too; near: where it stands, and a dot's name. */
export function detailAt(k: number): Detail {
  return k < 0.62 ? 'far' : k < 1.25 ? 'mid' : 'near';
}

/** 1 for today, falling to 0 at two months: how recently it was worked in. */
export function freshness(at: number, now: number): number {
  const days = Math.max(0, (now - at) / 86_400_000);
  return Math.max(0, Math.min(1, 1 - days / 60));
}

// ── keys: the nearest conversation that way ──────────────────────────

export type Way = 'left' | 'right' | 'up' | 'down';

/** From one place, the nearest other that way: straight ahead before off to the side. */
export function nearestWay(way: Way, from: Box, among: readonly (Box & { id: string })[]): string | null {
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const c of among) {
    const dx = c.x + c.w / 2 - fx;
    const dy = c.y + c.h / 2 - fy;
    const ahead = way === 'right' ? dx : way === 'left' ? -dx : way === 'down' ? dy : -dy;
    const side = way === 'right' || way === 'left' ? Math.abs(dy) : Math.abs(dx);
    if (ahead <= 4) continue;
    const score = ahead + side * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = c.id;
    }
  }
  return best;
}

// ── search ───────────────────────────────────────────────────────────

export interface Match {
  why: 'title' | 'idea' | 'said';
  /** what matched, when it was not the name */
  said: string;
}

/** Does a conversation answer a search: its name, an idea or topic in it, or where it stands. */
export function tileMatch(t: Pick<Tile, 'title' | 'ideas' | 'stands'>, query: string): Match | null {
  const q = query.trim().toLowerCase();
  if (!q) return { why: 'title', said: '' };
  if (t.title.toLowerCase().includes(q)) return { why: 'title', said: '' };
  const idea = t.ideas.find((n) => n.label.toLowerCase().includes(q));
  if (idea) return { why: 'idea', said: idea.label };
  if (t.stands.toLowerCase().includes(q)) return { why: 'said', said: t.stands };
  return null;
}
