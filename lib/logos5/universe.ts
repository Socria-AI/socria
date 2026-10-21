// lib/logos5/universe.ts — EVERY CONVERSATION, ON ONE MAP YOU CAN ARRANGE.
//
// The Universal Map is Logos 5's home. Each conversation is a tile — its
// name, what kind of thinking it is, where it stands, its key ideas, the
// small graph its map grew — and the tiles live in their Project's frame
// (lines of thinking in no Project in one frame, Core chats in another).
//
// Position means something and does not wander:
//   • a Project is a territory: its frame keeps its place, and the frames sit
//     in the order the Projects were made, or the order the person put them;
//   • inside a frame, conversations sit in the order they were begun — a new
//     one joins at the end, so nothing already there moves — or in the
//     person's own order, or by last active, name or size if they ask;
//   • anything the person puts somewhere by hand stays there (arrange.ts).
// The ideas two or more conversations share are drawn between them, by name;
// one shared by three or more is a recurring theme.
//
// It is read from the conversations as they are. Nothing is made up: where a
// conversation stands is the first line of its latest synthesis or reply; a
// question is "open" only when Socria asked it last and nobody has answered.
//
// Every position is computed here, deterministically — no randomness, no
// clock (the time is passed in) — so the same conversations and the same
// arrangement draw the same map on every screen.
//
// PURE.

import { wordsOf } from './linking';
import type { Arrangement, SortBy, SizeBy } from './arrange';

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
}

const MAX_TILES = 150;
const MAX_IDEAS = 12;

/**
 * What a line of thinking holds to draw: the topics its files were sorted
 * into, then the ideas its map grew — both are its thinking, a study's lead.
 */
function graphOf(s: UniverseIn): { nodes: { id: string; label: string; from: TileIdea['from'] }[]; edges: { from: string; to: string }[] } {
  const study = s.map?.objects?.objs?.find((o) => o.kind === 'study');
  const st = study?.states?.[study.at] as { topics?: { id: string; title: string; after?: string[] }[] } | undefined;
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
  };
}

/**
 * Every conversation as a tile: lines of thinking with something in them and
 * Core chats, at most a hundred and fifty, the most recently active kept.
 */
export function tilesOf(conversations: readonly UniverseIn[]): Tile[] {
  return [...conversations]
    .filter((s) => s && typeof s.id === 'string')
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

// ── groups: Projects, and the rest ───────────────────────────────────

export interface Group {
  /** `p:<id>` for a Project, `loose` for lines of thinking in none, `chats` for Core chats in none */
  key: string;
  kind: 'project' | 'loose' | 'chats';
  name: string;
  projectId: string | null;
  /** a Project's colour key, when it has one */
  color: string | null;
  archived: boolean;
  tiles: Tile[];
}

export const LOOSE = 'loose';
export const CHATS = 'chats';
export const projectKey = (id: string) => `p:${id}`;

/** The group a conversation lives in. */
export function groupKeyOf(t: Pick<Tile, 'kind' | 'projectId'>, projectIds: ReadonlySet<string>): string {
  if (t.projectId && projectIds.has(t.projectId)) return projectKey(t.projectId);
  return t.kind === 'core' ? CHATS : LOOSE;
}

/** A group's conversations in the order asked for. */
export function sortTiles(tiles: readonly Tile[], sort: SortBy, own: readonly string[] | undefined): Tile[] {
  const byStart = (a: Tile, b: Tile) => a.started - b.started || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const list = [...tiles];
  if (sort === 'recent') return list.sort((a, b) => b.at - a.at || byStart(a, b));
  if (sort === 'name') return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || byStart(a, b));
  if (sort === 'size') return list.sort((a, b) => b.count - a.count || byStart(a, b));
  if (sort === 'manual' && own?.length) {
    const at = new Map(own.map((id, i) => [id, i]));
    // the person's order first; anything begun since joins at the end, in the order it was begun
    return list.sort((a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity) || byStart(a, b));
  }
  return list.sort(byStart);
}

/**
 * The groups to draw: every Project (an empty one too, so a conversation can
 * be put in it), then lines of thinking in none, then Core chats in none — in
 * the person's order where they gave one. Hidden conversations are left out,
 * Core chats too when the person asked, and groups the person filtered away.
 */
export function groupsOf(tiles: readonly Tile[], projects: readonly ProjectIn[] | undefined, a: Pick<Arrangement, 'sort' | 'order' | 'groupOrder' | 'hidden' | 'projects' | 'display'>): Group[] {
  const known = (projects ?? []).filter((p) => p && typeof p.id === 'string');
  const projectIds = new Set(known.map((p) => p.id));
  const hidden = new Set(a.hidden);
  const shown = tiles.filter((t) => !hidden.has(t.id) && (a.display.chats || t.kind !== 'core'));
  const members = new Map<string, Tile[]>();
  for (const t of shown) {
    const k = groupKeyOf(t, projectIds);
    members.set(k, [...(members.get(k) ?? []), t]);
  }
  const ordered = [...known].sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0) || x.name.localeCompare(y.name));
  const groups: Group[] = [];
  for (const p of ordered) {
    const k = projectKey(p.id);
    const list = members.get(k) ?? [];
    // an archived Project is drawn only while something is still in it
    if (p.archived && !list.length) continue;
    groups.push({ key: k, kind: 'project', name: p.name, projectId: p.id, color: p.color ?? null, archived: !!p.archived, tiles: list });
  }
  if (members.get(LOOSE)?.length) groups.push({ key: LOOSE, kind: 'loose', name: known.length ? 'In no Project' : 'Lines of thinking', projectId: null, color: null, archived: false, tiles: members.get(LOOSE)! });
  if (members.get(CHATS)?.length) groups.push({ key: CHATS, kind: 'chats', name: 'Chats', projectId: null, color: null, archived: false, tiles: members.get(CHATS)! });
  const place = new Map(a.groupOrder.map((k, i) => [k, i]));
  const natural = new Map(groups.map((g, i) => [g.key, i]));
  // the person's order first; a group they have not placed keeps its own place after them
  groups.sort((x, y) => (place.get(x.key) ?? Infinity) - (place.get(y.key) ?? Infinity) || natural.get(x.key)! - natural.get(y.key)!);
  const only = a.projects ? new Set(a.projects) : null;
  return groups.filter((g) => !only || only.has(g.key)).map((g) => ({ ...g, tiles: sortTiles(g.tiles, a.sort, a.order[g.key]) }));
}

// ── the map: frames and tiles, placed ────────────────────────────────

export const TILE_W = 236;
export const TILE_H = 128;
/** a Core chat holds no graph: its tile is shorter, in its own frame */
export const CHAT_H = 76;
export const GAP = 16;
export const PAD = 18;
export const HEAD = 54;
const FRAME_GAP = 64;
/** frames sit in rows no wider than this */
const ROW_MAX = 1720;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedTile extends Box {
  id: string;
  g: string;
  pinned: boolean;
  /** inside a folded frame: not drawn, but lines to it end at the frame */
  folded: boolean;
}

export interface PlacedFrame extends Box {
  key: string;
  cols: number;
  collapsed: boolean;
  /** the corner its places are measured from (a pin is relative to it) */
  origin: { x: number; y: number };
  /** the size of one place in it */
  cell: { w: number; h: number };
  empty: boolean;
}

export interface MapLayout {
  tiles: PlacedTile[];
  byId: Map<string, PlacedTile>;
  frames: PlacedFrame[];
  bounds: Box;
}

/** How many conversations across, by how many there are — unless the person gave the frame a width. A phone takes two at most. */
export function colsFor(n: number, set?: number, narrow = false): number {
  if (set) return Math.max(1, Math.min(6, set));
  return n <= 1 ? 1 : n <= 4 || narrow ? 2 : 3;
}

export const cellOf = (g: Pick<Group, 'kind'>) => ({ w: TILE_W, h: g.kind === 'chats' ? CHAT_H : TILE_H });

/** The place `i` in a frame, measured from its corner. */
export function slotAt(i: number, cols: number, cell: { w: number; h: number }): { x: number; y: number } {
  return { x: PAD + (i % cols) * (cell.w + GAP), y: HEAD + Math.floor(i / cols) * (cell.h + GAP) };
}

/** The nearest place on a frame's grid to a point measured from its corner. */
export function snapToSlot(x: number, y: number, cell: { w: number; h: number }): { x: number; y: number } {
  const c = Math.round((x - PAD) / (cell.w + GAP));
  const r = Math.round((y - HEAD) / (cell.h + GAP));
  return { x: PAD + c * (cell.w + GAP), y: HEAD + r * (cell.h + GAP) };
}

const overlaps = (a: Box, b: Box, air = 0) => a.x < b.x + b.w + air && b.x < a.x + a.w + air && a.y < b.y + b.h + air && b.y < a.y + a.h + air;

/** A frame's own size before anything is put elsewhere by hand. */
function autoSize(g: Group, cols: number, collapsed: boolean): { w: number; h: number } {
  const cell = cellOf(g);
  if (collapsed) return { w: cell.w + 2 * PAD, h: HEAD + 22 };
  const n = Math.max(1, g.tiles.length);
  const rows = Math.ceil(n / cols);
  return { w: cols * cell.w + (cols - 1) * GAP + 2 * PAD, h: HEAD + rows * cell.h + (rows - 1) * GAP + PAD };
}

/**
 * The map: frames in rows, in their order; each frame where it was put; each
 * conversation in its place in its frame, or where the person put it — and
 * the next free place for the rest, so nothing lands on anything put by hand.
 */
export function mapLayout(groups: readonly Group[], a: Pick<Arrangement, 'pins' | 'frames'>, opts: { narrow?: boolean } = {}): MapLayout {
  const frames: PlacedFrame[] = [];
  const tiles: PlacedTile[] = [];
  // on a phone the frames go one under another, to be read top to bottom
  const rowMax = opts.narrow ? 560 : ROW_MAX;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const g of groups) {
    const set = a.frames[g.key];
    const collapsed = !!set?.collapsed;
    const cols = colsFor(g.tiles.length, set?.cols, opts.narrow);
    const size = autoSize(g, cols, collapsed);
    if (x > 0 && x + size.w > rowMax) {
      x = 0;
      y += rowH + FRAME_GAP;
      rowH = 0;
    }
    const origin = { x: x + (set?.dx ?? 0), y: y + (set?.dy ?? 0) };
    x += size.w + FRAME_GAP;
    rowH = Math.max(rowH, size.h);
    const cell = cellOf(g);
    const mine: PlacedTile[] = [];
    if (collapsed) {
      for (const t of g.tiles) mine.push({ id: t.id, g: g.key, pinned: false, folded: true, x: origin.x + PAD, y: origin.y + HEAD - 6, w: cell.w, h: 20 });
    } else {
      const pinned: Box[] = [];
      for (const t of g.tiles) {
        const p = a.pins[t.id];
        if (p && p.g === g.key) {
          const b = { x: origin.x + p.x, y: origin.y + p.y, w: cell.w, h: cell.h };
          pinned.push(b);
          mine.push({ id: t.id, g: g.key, pinned: true, folded: false, ...b });
        }
      }
      let s = 0;
      for (const t of g.tiles) {
        if (mine.some((m) => m.id === t.id)) continue;
        let b: Box;
        // the next place in the grid that nothing put by hand is sitting on
        for (let guard = 0; ; guard++) {
          const at = slotAt(s++, cols, cell);
          b = { x: origin.x + at.x, y: origin.y + at.y, w: cell.w, h: cell.h };
          if (guard > 400 || !pinned.some((q) => overlaps(q, b, -4))) break;
        }
        mine.push({ id: t.id, g: g.key, pinned: false, folded: false, ...b! });
      }
    }
    // the frame holds everything in it, wherever it was put
    let x0 = origin.x;
    let y0 = origin.y;
    let x1 = origin.x + size.w;
    let y1 = origin.y + size.h;
    for (const m of mine) {
      if (m.folded) continue;
      x0 = Math.min(x0, m.x - PAD);
      y0 = Math.min(y0, m.y - HEAD);
      x1 = Math.max(x1, m.x + m.w + PAD);
      y1 = Math.max(y1, m.y + m.h + PAD);
    }
    frames.push({ key: g.key, cols, collapsed, origin, cell, empty: !g.tiles.length, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    tiles.push(...mine);
  }
  const bounds = boxAround(frames);
  return { tiles, byId: new Map(tiles.map((t) => [t.id, t])), frames, bounds };
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

/** The frame a point is in, the topmost (last drawn) first. */
export function frameAt(frames: readonly PlacedFrame[], px: number, py: number): PlacedFrame | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (px >= f.x && px <= f.x + f.w && py >= f.y && py <= f.y + f.h) return f;
  }
  return null;
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

export interface PlacedIdea extends SharedIdea, Box {}

/**
 * Where each shared idea is written: between the conversations that share it,
 * at the nearest spot that sits on no conversation and no other idea.
 */
export function placeIdeas(ideas: readonly SharedIdea[], layout: MapLayout): PlacedIdea[] {
  const out: PlacedIdea[] = [];
  // never on a conversation, a frame's name, or the corner a frame is made wider by
  const solid: Box[] = [
    ...layout.tiles.filter((t) => !t.folded),
    ...layout.frames.map((f) => ({ x: f.x, y: f.y, w: f.w, h: HEAD - 8 })),
    ...layout.frames.map((f) => ({ x: f.x + f.w - 34, y: f.y + f.h - 34, w: 34, h: 34 })),
  ];
  for (const idea of ideas) {
    const at = idea.members.map((id) => layout.byId.get(id)).filter((t): t is PlacedTile => !!t);
    if (at.length < 2) continue;
    const cx = at.reduce((s, t) => s + t.x + t.w / 2, 0) / at.length;
    const cy = at.reduce((s, t) => s + t.y + t.h / 2, 0) / at.length;
    const w = Math.round(30 + Math.min(28, idea.says.length) * 7.4 + (idea.theme ? 26 : 0));
    const h = idea.theme ? 30 : 26;
    let spot: Box | null = null;
    for (let r = 0; r <= 900 && !spot; r += 22) {
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

// ── how close you are: what a tile shows at this zoom ────────────────

export type Detail = 'far' | 'mid' | 'near';

/** Far: a name; mid: a name, its kind and key ideas; near: where it stands and its small graph. */
export function detailAt(k: number): Detail {
  return k < 0.62 ? 'far' : k < 1.25 ? 'mid' : 'near';
}

/** 1 for today, falling to 0 at two months: how recently it was worked in. */
export function freshness(at: number, now: number): number {
  const days = Math.max(0, (now - at) / 86_400_000);
  return Math.max(0, Math.min(1, 1 - days / 60));
}

/** How large a tile is drawn in its place, by what the person asked size to mean. */
export function scaleOf(t: Pick<Tile, 'count' | 'at'>, by: SizeBy, now: number): number {
  if (by === 'same') return 1;
  if (by === 'recency') return 0.84 + 0.16 * freshness(t.at, now);
  return 0.84 + 0.16 * Math.min(1, t.count / 10);
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

// ── the timeline: when each was last worked in ───────────────────────

export interface Bucket {
  key: 'older' | 'month' | 'lastweek' | 'week' | 'yesterday' | 'today';
  label: string;
}

/** Oldest to newest, left to right, ending at today. */
export const BUCKETS: readonly Bucket[] = [
  { key: 'older', label: 'Before this month' },
  { key: 'month', label: 'Earlier this month' },
  { key: 'lastweek', label: 'Last week' },
  { key: 'week', label: 'Earlier this week' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'today', label: 'Today' },
];

/** Which stretch of time a moment falls in, seen from `now` (local days; weeks start on Monday). */
export function bucketOf(at: number, now: number): Bucket['key'] {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const today = day.getTime();
  const yesterday = today - 86_400_000;
  const weekStart = today - ((day.getDay() + 6) % 7) * 86_400_000;
  const lastWeekStart = weekStart - 7 * 86_400_000;
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1).getTime();
  if (at >= today) return 'today';
  if (at >= yesterday) return 'yesterday';
  if (at >= weekStart) return 'week';
  if (at >= lastWeekStart) return 'lastweek';
  if (at >= monthStart) return 'month';
  return 'older';
}

export interface Lane {
  key: string;
  cells: Record<Bucket['key'], string[]>;
}

/** Each group a lane, each stretch of time a column; only the columns with something in them. */
export function timelineOf(groups: readonly Group[], now: number): { buckets: Bucket[]; lanes: Lane[] } {
  const used = new Set<Bucket['key']>();
  const lanes = groups
    .filter((g) => g.tiles.length)
    .map((g) => {
      const cells = { older: [], month: [], lastweek: [], week: [], yesterday: [], today: [] } as Record<Bucket['key'], string[]>;
      for (const t of [...g.tiles].sort((x, y) => y.at - x.at)) {
        const b = bucketOf(t.at, now);
        cells[b].push(t.id);
        used.add(b);
      }
      return { key: g.key, cells };
    });
  return { buckets: BUCKETS.filter((b) => used.has(b.key)), lanes };
}
