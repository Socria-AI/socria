// lib/logos5/mindgraph.ts — WHAT SOCRIA REMEMBERS, DRAWN AS A MIND.
//
// The Mind Graph (Logos 5) is the person's memory as its own place, kept
// apart from any one line of thinking. It draws the memory Socria already
// keeps (lib/mind: the Mind Graph store, read through /api/mind?scope=logos,
// so nothing private arrives) — a neuron per memory: its cell body sized by
// how much it matters, dendrites for the conversations it was learned in, an
// axon to each memory it now informs.
//
// Memories fall into three regions, by the kind the store gave them:
//   Habits    how you decide — preferences, beliefs, decisions, insights
//   Facts     what you are holding — people, places, events, givens
//   Projects  what you are working on — projects, goals, plans
// Nothing is invented: a memory's words are the store's, its places the
// conversations the store says it was learned in.
//
// Every position is computed here, deterministically.
//
// PURE.

export type MindGroup = 'habit' | 'fact' | 'project';

export const GROUP_LABEL: Record<MindGroup, string> = { habit: 'Habit', fact: 'Fact', project: 'Project' };
export const GROUP_REGION: Record<MindGroup, string> = { habit: 'How you decide', fact: 'What you are holding', project: 'What you are working on' };
export const GROUP_TAB: Record<MindGroup, string> = { habit: 'Habits', fact: 'Facts', project: 'Projects' };

const HABITS = new Set(['preference', 'belief', 'decision', 'insight', 'assumption', 'uncertainty', 'tension', 'theme', 'value', 'pattern', 'idea']);
const PROJECTS = new Set(['project', 'goal', 'plan']);
/** never drawn: the store's own bookkeeping */
const SKIP = new Set(['conversation']);

/** Which region a memory belongs in, from the kind the store gave it; null for what is not a memory. */
export function groupOf(type: string): MindGroup | null {
  const t = (type || '').toLowerCase();
  if (SKIP.has(t)) return null;
  if (PROJECTS.has(t)) return 'project';
  if (HABITS.has(t)) return 'habit';
  return 'fact';
}

/** A memory as /api/mind gives it — only what is drawn. */
export interface MemoryIn {
  id: string;
  type: string;
  label: string;
  content?: string;
  status?: string;
  importance?: number;
  seen?: number;
  confidence?: number;
  createdAt?: number;
  updatedAt?: number;
  provenance?: { surface?: string; kind?: string; at?: number; conversationId?: string }[];
}

export interface EdgeIn {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: string;
}

/** A conversation a memory was learned in. */
export interface PlaceIn {
  id: string;
  title: string;
  surface: 'core' | 'logos';
}

export interface Neuron {
  id: string;
  group: MindGroup;
  label: string;
  content: string;
  /** under the label: "Habit · seen in 3 lines of thinking" */
  sub: string;
  x: number;
  y: number;
  /** the cell body's radius */
  r: number;
  /** the first, most weighty memory of its region is drawn larger and darker */
  lead: boolean;
  /** dendrites: one per conversation it was learned in, at least two, at most five — their angles */
  dendrites: number[];
  /** names written to the left of the cell, not the right */
  left: boolean;
  learnedIn: PlaceIn[];
  informs: string[];
  firstAt: number;
  setByYou: boolean;
}

export interface Axon {
  from: string;
  to: string;
  /** from the lead of a region: drawn stronger */
  strong: boolean;
}

export interface MindDrawing {
  neurons: Neuron[];
  axons: Axon[];
  width: number;
  height: number;
  /** where each region's name is written */
  regions: { group: MindGroup; x: number; y: number }[];
  /** memories left out of the drawing (past the cap): found by search */
  more: number;
}

const MAX_NEURONS = 36;
const W = 1440;
const H = 844;

/** A number from a string, the same every time: for the shapes that should differ but never move. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What is said under a memory's name: how it is known, in a few words. */
export function subOf(group: MindGroup, places: PlaceIn[], setByYou: boolean, firstAt: number, now: number): string {
  const g = GROUP_LABEL[group];
  if (setByYou) return `${g} · set by you`;
  const lines = places.filter((p) => p.surface === 'logos').length;
  if (lines > 1) return `${g} · seen in ${lines} lines of thinking`;
  if (places.length > 1) return `${g} · seen in ${places.length} conversations`;
  if (places.length === 1) return `${g} · ${places[0].title}`;
  if (firstAt && now - firstAt > 30 * 86_400_000) return `${g} · since ${MONTHS[new Date(firstAt).getMonth()]}`;
  return g;
}

/** How much a memory weighs: how important, how often seen, how sure. */
function weightOf(m: MemoryIn): number {
  return (m.importance ?? 0.5) * 2 + Math.log2(1 + (m.seen ?? 1)) + (m.confidence ?? 0.5);
}

/**
 * The places in a region: rings around its centre, the weightiest first. Two
 * rings sit at the region's spread; past that the rings draw in, so the
 * outermost is never further than twice it — and nothing leaves the drawing.
 */
function placeIn(n: number, cx: number, cy: number, spreadX: number, spreadY: number, reach = 2): { x: number; y: number }[] {
  let rings = 0;
  while (1 + 3 * rings * (rings + 1) < n) rings += 1;
  const step = rings <= 1 ? 1 : Math.min(1, reach / rings);
  const out: { x: number; y: number }[] = [{ x: cx, y: cy }];
  let ring = 1;
  while (out.length < n) {
    const k = ring * 6;
    for (let i = 0; i < k && out.length < n; i++) {
      const a = (2 * Math.PI * i) / k + ring * 0.6;
      out.push({ x: cx + Math.cos(a) * spreadX * ring * step, y: cy + Math.sin(a) * spreadY * ring * step });
    }
    ring += 1;
  }
  return out.map((p) => ({ x: Math.min(W - 60, Math.max(60, p.x)), y: Math.min(H - 50, Math.max(50, p.y)) }));
}

/**
 * The drawing: memories in their regions, the weightiest of each at its
 * centre; axons between memories that inform one another; a search or a
 * group narrows what is drawn, and a cap keeps it readable.
 */
export function mindDrawing(memories: readonly MemoryIn[], edges: readonly EdgeIn[], places: ReadonlyMap<string, PlaceIn[]>, opts: { group?: MindGroup | null; now?: number; narrow?: boolean } = {}): MindDrawing {
  const now = opts.now ?? Date.now();
  const kept = memories
    .map((m) => ({ m, g: groupOf(m.type) }))
    .filter((x): x is { m: MemoryIn; g: MindGroup } => !!x.g && x.m.status !== 'archived' && !!x.m.label?.trim())
    .filter((x) => !opts.group || x.g === opts.group)
    .sort((a, b) => weightOf(b.m) - weightOf(a.m) || a.m.id.localeCompare(b.m.id));
  const drawn = kept.slice(0, MAX_NEURONS);
  const ids = new Set(drawn.map((x) => x.m.id));
  const informs = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.sourceId) || !ids.has(e.targetId) || e.sourceId === e.targetId) continue;
    informs.set(e.sourceId, [...(informs.get(e.sourceId) ?? []), e.targetId]);
  }
  // the regions: habits to the left; what is held, above right; what is worked on, below right — one region alone takes the middle
  const groups: MindGroup[] = ['habit', 'fact', 'project'];
  const present = groups.filter((g) => drawn.some((x) => x.g === g));
  if (opts.narrow) return narrowDrawing(drawn, present, informs, places, now, Math.max(0, kept.length - drawn.length));
  const centre: Record<MindGroup, { x: number; y: number; sx: number; sy: number }> =
    present.length === 1
      ? { habit: { x: W / 2, y: H / 2, sx: 230, sy: 170 }, fact: { x: W / 2, y: H / 2, sx: 230, sy: 170 }, project: { x: W / 2, y: H / 2, sx: 230, sy: 170 } }
      : { habit: { x: 400, y: 410, sx: 190, sy: 150 }, fact: { x: 960, y: 235, sx: 210, sy: 105 }, project: { x: 960, y: 640, sx: 210, sy: 105 } };
  // held and worked-on share the right side, one above the other: their rings stay
  // inside a band each, so the name of the lower region has room between them
  const reach: Record<MindGroup, number> = { habit: 2, fact: present.length > 1 ? 1.5 : 2, project: present.length > 1 ? 1.5 : 2 };
  const neurons: Neuron[] = [];
  const tops = new Map<MindGroup, number>();
  for (const g of present) {
    const inG = drawn.filter((x) => x.g === g);
    const spots = placeIn(inG.length, centre[g].x, centre[g].y, centre[g].sx, centre[g].sy, reach[g]);
    tops.set(g, Math.min(...spots.map((p) => p.y)));
    inG.forEach(({ m }, i) => {
      const learnedIn = places.get(m.id) ?? [];
      const firstAt = m.createdAt || m.provenance?.[0]?.at || 0;
      const setByYou = (m.provenance ?? []).some((p) => p.surface === 'user' && p.kind === 'stated');
      const h = hash(m.id);
      const count = Math.max(2, Math.min(5, learnedIn.length + 1));
      const dendrites = Array.from({ length: count }, (_, k) => -150 + ((h >> (k * 3)) % 60) + k * (300 / count));
      const spot = spots[i];
      neurons.push({
        id: m.id,
        group: g,
        label: m.label.trim(),
        content: (m.content ?? '').trim(),
        sub: subOf(g, learnedIn, setByYou, firstAt, now),
        x: Math.round(spot.x),
        y: Math.round(spot.y),
        r: i === 0 ? 30 : Math.round(17 + Math.min(9, weightOf(m) * 2)),
        lead: i === 0,
        dendrites,
        left: g === 'habit' && present.length > 1 ? spot.x <= centre[g].x + 40 : spot.x < centre[g].x - 40,
        learnedIn,
        informs: informs.get(m.id) ?? [],
        firstAt,
        setByYou,
      });
    });
  }
  const leads = new Set(neurons.filter((n) => n.lead).map((n) => n.id));
  const axons: Axon[] = [];
  for (const n of neurons) for (const to of n.informs) axons.push({ from: n.id, to, strong: leads.has(n.id) });
  // a region's name above its highest memory, clear of that memory's dendrites
  const regions = present.map((g) => ({ group: g, x: centre[g].x - 180, y: Math.round(Math.max(36, (tops.get(g) ?? centre[g].y) - 62)) }));
  return { neurons, axons, width: W, height: H, regions, more: Math.max(0, kept.length - drawn.length) };
}

/** A phone's width, in the drawing's units: one to one with the screen. */
export const NARROW_W = 390;

/**
 * The drawing on a phone: the regions one under another, a memory to a row —
 * its name beside it, readable at the phone's own size — the cells stepping
 * left and right a little, so it still reads as tissue rather than as a list.
 * The page scrolls; nothing is shrunk to fit.
 */
function narrowDrawing(drawn: { m: MemoryIn; g: MindGroup }[], present: MindGroup[], informs: Map<string, string[]>, places: ReadonlyMap<string, PlaceIn[]>, now: number, more: number): MindDrawing {
  const neurons: Neuron[] = [];
  const regions: MindDrawing['regions'] = [];
  let y = 18;
  for (const g of present) {
    regions.push({ group: g, x: 20, y: y + 14 });
    y += 80;
    drawn
      .filter((x) => x.g === g)
      .forEach(({ m }, i) => {
        const learnedIn = places.get(m.id) ?? [];
        const firstAt = m.createdAt || m.provenance?.[0]?.at || 0;
        const setByYou = (m.provenance ?? []).some((p) => p.surface === 'user' && p.kind === 'stated');
        const h = hash(m.id);
        const count = Math.max(2, Math.min(5, learnedIn.length + 1));
        const r = i === 0 ? 24 : Math.round(14 + Math.min(6, weightOf(m) * 1.5));
        neurons.push({
          id: m.id,
          group: g,
          label: m.label.trim(),
          content: (m.content ?? '').trim(),
          sub: subOf(g, learnedIn, setByYou, firstAt, now),
          x: i % 2 ? 84 : 52,
          y,
          r,
          lead: i === 0,
          dendrites: Array.from({ length: count }, (_, k) => -150 + ((h >> (k * 3)) % 60) + k * (300 / count)),
          left: false,
          learnedIn,
          informs: informs.get(m.id) ?? [],
          firstAt,
          setByYou,
        });
        y += 84;
      });
    y += 18;
  }
  const leads = new Set(neurons.filter((n) => n.lead).map((n) => n.id));
  const axons: Axon[] = [];
  for (const n of neurons) for (const to of n.informs) axons.push({ from: n.id, to, strong: leads.has(n.id) });
  return { neurons, axons, width: NARROW_W, height: y + 24, regions, more };
}

/** Does a memory answer a search: its name or its words. */
export function memoryMatches(n: Pick<Neuron, 'label' | 'content'>, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || n.label.toLowerCase().includes(t) || n.content.toLowerCase().includes(t);
}
