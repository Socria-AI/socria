// lib/logos5/diagramLayout.ts — ANYTHING AT ALL, DRAWN: the shapes a subject takes.
//
// The universal Logic Map (Logos 5) draws a subject as well as an argument:
// the stages of the water cycle, a classification, the parts of a cell, how the
// ideas of a field connect, what happened when. Each lens here takes the same
// map and returns the same Layout every other lens does (lib/logos-layout.ts),
// so one renderer draws them all:
//
//   layoutCycle          the stages round a ring, an arc from each to the next,
//                        and the last arc back to the first
//   layoutTree           a hierarchy, top down: a tidy tree, children centred
//                        under their parent, levels evenly spaced
//   layoutParts          what something is made of: each whole a region with
//                        its parts inside, a whole inside a whole one level in
//   layoutConcept        a concept map: the most connected idea at the centre,
//                        the rest in rings by how far they are from it, every
//                        link labelled in words
//   layoutDatedTimeline  events on an axis, spaced by when they happened
//   timeOrder / timeKey  a sortable number for "1789", "c. 3000 BCE", "Day 3"
//
// WHAT EVERY LENS HERE PROMISES
//   • Cards are bare — words only — because the shape already says what each
//     box is; its kind is still there when it is inspected.
//   • Every node is a card exactly once, except a DETAIL (a constraint, a note,
//     anything that `applies_to` a part of the shape), which rides on the card
//     it bears on, in that card's `attached` list, as it does in layoutFlow.
//   • No two cards overlap, and nothing is NaN.
//   • Every connection with both ends drawn is drawn exactly once, keyed
//     `from~to~relation` — the renderer's own edge key, so lighting a card
//     lights its lines — unless the picture already says it: a detail on its
//     card, a part drawn inside its whole.
//   • Nothing is random: the same map always gives the same picture.
//
// PURE: no React, no DOM.

import type { LogosEdge, LogosNode, ThinkingMap } from '../logos';
import { CARD_W, LENSES, RELATION_LABEL, cardH, type Connector, type GroupBox, type Layout, type LensId, type Placed } from '../logos-layout';
import { DETAIL_ROLES, SEQUENCE_RELATIONS, attachmentsOf, orderSpine, type Role } from '../representation';

// NOTE: nothing imported is read at module level — only inside the functions —
// so lib/logos-layout.ts may import this module back without a cycle biting.

// ── sizes ────────────────────────────────────────────────────────────

/** the margin round a diagram, and the frame a lens assumes when it is given none */
const PAD = 40;
const FRAME_W = 900;
/** the widest a card grows for a long label */
const WIDE = 200;
/** room under a card for the count of the details it carries (as layoutFlow) */
const ATTACH_H = 18;
/** the most of a link phrase drawn on a line */
const LABEL_MAX = 28;
/** a connector label's average character width (10.5–11px italic sans) */
const CHAR_W = 5.9;

/** A card or a label, by its centre and size. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const finite = (v: number, d = 0) => (Number.isFinite(v) ? v : d);
const r1 = (v: number) => Math.round(finite(v) * 10) / 10;
const pt = (x: number, y: number) => `${r1(x)} ${r1(y)}`;
const frameOf = (v: number, d: number) => (Number.isFinite(v) && v > 0 ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function captionOf(id: LensId, fallback: string): string {
  return LENSES.find((l) => l.id === id)?.caption ?? fallback;
}

const labelOf = (n: LogosNode): string => (typeof n.label === 'string' ? n.label : String(n.label ?? ''));

/** A card's width: CARD_W, or a little wider when the label needs it, so a long label wraps to two lines rather than five. */
export function diagramCardW(label: string): number {
  for (let w = CARD_W; w < WIDE; w += 10) if (cardH(label, w) <= cardH('', w) + 20) return w;
  return WIDE;
}

/** A bare card's height: a full card's without its kind line. */
export function bareCardH(label: string, w: number): number {
  return Math.max(36, cardH(label, w) - 20);
}

/** A small card that names a region from its corner: one line where it can be. */
function titleW(label: string): number {
  return clamp(Math.ceil(label.length * 7.7 + 30), 96, WIDE);
}

/**
 * How a card is drawn in a diagram: a round stage on a cycle, a dot on a
 * timeline, a pill where a flow starts or ends, a diamond where it divides.
 */
export function diagramShapeFor(node: Pick<LogosNode, 'role'>, lens: string): Placed['shape'] {
  if (lens === 'cycle') return 'stage';
  if (lens === 'timeline') return 'event';
  if (node.role === 'start' || node.role === 'end') return 'pill';
  if (node.role === 'branch') return 'diamond';
  return undefined;
}

// ── geometry ─────────────────────────────────────────────────────────

function overlaps(a: Box, b: Box, gap = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;
}

/** Where the line from a box's centre towards (tx, ty) leaves the box, `m` px beyond its edge. */
function edgePoint(b: Box, tx: number, ty: number, m = 0): [number, number] {
  const dx = tx - b.x;
  const dy = ty - b.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [b.x, b.y];
  const t = Math.min(Math.abs(dx) > 1e-9 ? (b.w / 2 + m) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? (b.h / 2 + m) / Math.abs(dy) : Infinity);
  return [b.x + dx * t, b.y + dy * t];
}

/**
 * A gentle S from one card's side to the other's — the curve the renderer
 * itself draws when a card is dragged (lib/canvas.ts routeBetween), so a line
 * does not change character when its card moves — and the point `t` of the
 * way along it, for a label. `lane` moves the line sideways (in absolute
 * terms, whichever way it runs) so that two lines between the same two cards
 * run side by side rather than one on the other (see lanesOf); the words of a
 * line in a lane go on its own side of it, so two sets of words never meet.
 */
function curveBetween(a: Box, b: Box, arrow: boolean, lane = 0, t = 0.5, text = ''): { d: string; mx: number; my: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tip = arrow ? 4 : 0;
  const horizontal = Math.abs(dx) * (a.h + b.h) > Math.abs(dy) * (a.w + b.w);
  let sx: number, sy: number, ex: number, ey: number, c1x: number, c1y: number, c2x: number, c2y: number;
  if (horizontal) {
    const dir = dx >= 0 ? 1 : -1;
    sx = a.x + (dir * a.w) / 2;
    sy = a.y + clamp(lane * 14, -a.h / 2 + 4, a.h / 2 - 4);
    ex = b.x - dir * (b.w / 2 + tip);
    ey = b.y + clamp(lane * 14, -b.h / 2 + 4, b.h / 2 - 4);
    const bend = Math.max(24, Math.abs(ex - sx) / 2);
    c1x = sx + dir * bend;
    c1y = sy;
    c2x = ex - dir * bend;
    c2y = ey;
  } else {
    const dir = dy >= 0 ? 1 : -1;
    sx = a.x + clamp(lane * 22, -a.w / 2 + 8, a.w / 2 - 8);
    sy = a.y + (dir * a.h) / 2;
    ex = b.x + clamp(lane * 22, -b.w / 2 + 8, b.w / 2 - 8);
    ey = b.y - dir * (b.h / 2 + tip);
    const bend = Math.max(20, Math.abs(ey - sy) / 2);
    c1x = sx;
    c1y = sy + dir * bend;
    c2x = ex;
    c2y = ey - dir * bend;
  }
  const u = 1 - t;
  const k0 = u * u * u;
  const k1 = 3 * u * u * t;
  const k2 = 3 * u * t * t;
  const k3 = t * t * t;
  let mx = k0 * sx + k1 * c1x + k2 * c2x + k3 * ex;
  let my = k0 * sy + k1 * c1y + k2 * c2y + k3 * ey;
  // the words of a line in a lane: beside an upright line, above or below a level one
  // (the renderer sets them 9px above ly, so 20px lower puts them under the line)
  if (lane && text) {
    if (horizontal) my += lane > 0 ? 20 : 0;
    else mx += Math.sign(lane) * (textW(text) / 2 + 4);
  }
  return { d: `M ${pt(sx, sy)} C ${pt(c1x, c1y)} ${pt(c2x, c2y)} ${pt(ex, ey)}`, mx, my };
}

/**
 * Lanes for the lines that share a pair of cards — "fox eats rabbit" and
 * "rabbit is eaten by fox" — so they run side by side, their words at
 * different points along them. A line alone between its cards has lane 0 and
 * its words at the middle.
 */
function lanesOf(edges: readonly LogosEdge[]): Map<string, { lane: number; t: number }> {
  const pairs = new Map<string, LogosEdge[]>();
  for (const e of edges) {
    const k = e.from < e.to ? `${e.from}\u0000${e.to}` : `${e.to}\u0000${e.from}`;
    const list = pairs.get(k);
    if (list) list.push(e);
    else pairs.set(k, [e]);
  }
  const out = new Map<string, { lane: number; t: number }>();
  for (const list of pairs.values()) {
    list.forEach((e, k) => {
      const lane = k - (list.length - 1) / 2;
      // measured from the same end of the pair, whichever way this line runs
      const along = clamp(0.5 + lane * 0.24, 0.26, 0.74);
      out.set(edgeKey(e), { lane, t: e.from < e.to ? along : 1 - along });
    });
  }
  return out;
}

/** The numbers in a path, in order. */
const numbersOf = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Does the cubic M x0 y0 C x1 y1 x2 y2 x3 y3 pass through a box? (sampled: enough for a card's size) */
function bezierHits(n: readonly number[], b: Box): boolean {
  if (n.length < 8) return false;
  for (let k = 1; k < 24; k++) {
    const t = k / 24;
    const u = 1 - t;
    const x = u * u * u * n[0] + 3 * u * u * t * n[2] + 3 * u * t * t * n[4] + t * t * t * n[6];
    const y = u * u * u * n[1] + 3 * u * u * t * n[3] + 3 * u * t * t * n[5] + t * t * t * n[7];
    if (Math.abs(x - b.x) < b.w / 2 - 2 && Math.abs(y - b.y) < b.h / 2 - 2) return true;
  }
  return false;
}

/** A point on a quadratic curve. */
function quadAt(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

const textW = (s: string) => s.length * CHAR_W + 8;

/** Where a connector label's words sit: the renderer draws them centred on lx, 9px above ly. */
function labelBox(lx: number, ly: number, text: string): Box {
  return { x: lx, y: ly - 12, w: textW(text), h: 15 };
}

/** The bounds of a set of boxes, as edges. */
function boundsOf(boxes: readonly Box[]): { x0: number; y0: number; x1: number; y1: number } {
  if (!boxes.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x - b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2);
    x1 = Math.max(x1, b.x + b.w / 2);
    y1 = Math.max(y1, b.y + b.h / 2);
  }
  return { x0, y0, x1, y1 };
}

/** The shift that puts content spanning [x0, x1] × [y0, …] inside the frame: centred across when it fits, from the margin when it does not. */
function settle(b: { x0: number; y0: number; x1: number }, W: number): { dx: number; dy: number } {
  const span = b.x1 - b.x0;
  const dx = span < W - 2 * PAD ? (W - span) / 2 - b.x0 : PAD - b.x0;
  return { dx, dy: PAD - b.y0 };
}

/** clear space between two cards in a row beneath a diagram, across and down */
const ROW_GAP = 24;

/** A row of cards beneath everything else: as many to a line as fit across. */
function rowBeneath(sizes: readonly { w: number; h: number }[], left: number, top: number, across: number): Box[] {
  const out: Box[] = [];
  let x = left;
  let y = top;
  let tall = 0;
  for (const s of sizes) {
    if (x > left && x + s.w > left + across) {
      x = left;
      y += tall + ROW_GAP;
      tall = 0;
    }
    out.push({ x: x + s.w / 2, y: y + s.h / 2, w: s.w, h: s.h });
    x += s.w + ROW_GAP;
    tall = Math.max(tall, s.h);
  }
  return out;
}

// ── the map, made safe to lay out ───────────────────────────────────

interface Graph {
  nodes: LogosNode[];
  edges: LogosEdge[];
  byId: Map<string, LogosNode>;
  order: Map<string, number>;
}

const edgeKey = (e: { from: string; to: string; relation: string }) => `${e.from}~${e.to}~${e.relation}`;

/**
 * The nodes once each (the first of a repeated id), and the edges that can be
 * drawn: both ends on the map, not a loop on one card, and not the same
 * connection twice — what sanitizeMap guarantees, made true for any input.
 */
function graphOf(map: ThinkingMap | null | undefined): Graph {
  const nodes: LogosNode[] = [];
  const byId = new Map<string, LogosNode>();
  for (const n of Array.isArray(map?.nodes) ? map!.nodes : []) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id || byId.has(n.id)) continue;
    byId.set(n.id, n);
    nodes.push(n);
  }
  const edges: LogosEdge[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(map?.edges) ? map!.edges : []) {
    if (!e || typeof e !== 'object' || typeof e.from !== 'string' || typeof e.to !== 'string' || e.from === e.to) continue;
    if (!byId.has(e.from) || !byId.has(e.to) || typeof e.relation !== 'string') continue;
    const k = edgeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push(e);
  }
  return { nodes, edges, byId, order: new Map(nodes.map((n, i) => [n.id, i])) };
}

/** Each node's neighbours, either way along any edge, once each, in the order the edges give them. */
function neighbours(g: Graph): Map<string, string[]> {
  const out = new Map<string, string[]>(g.nodes.map((n) => [n.id, []]));
  for (const e of g.edges) {
    const a = out.get(e.from)!;
    const b = out.get(e.to)!;
    if (!a.includes(e.to)) a.push(e.to);
    if (!b.includes(e.from)) b.push(e.from);
  }
  return out;
}

/** The relations that read both ways, drawn without an arrowhead. */
const UNDIRECTED: ReadonlySet<string> = new Set(['relates', 'conflicts', 'equivalent_to']);
const directed = (relation: string) => !UNDIRECTED.has(relation);

const tidyText = (s: string, max = LABEL_MAX) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

/**
 * What a line says: its own link phrase, else the condition it is taken on.
 * A concept map (fallback) also names a typed relation in words — never
 * 'relates', which says nothing — and "supports" in the voice the arrow reads
 * in (RELATION_LABEL says "supported by", read from the other end).
 */
function edgeText(e: LogosEdge, fallback = false): string | undefined {
  const own = (typeof e.label === 'string' && e.label.trim()) || (typeof e.when === 'string' && e.when.trim()) || '';
  if (own) return tidyText(own);
  if (!fallback || e.relation === 'relates') return undefined;
  if (e.relation === 'supports') return 'supports';
  return RELATION_LABEL[e.relation] || undefined;
}

/** A connector for an edge, keyed as the renderer keys edges. */
function connectorOf(e: LogosEdge, path: string, extra: Partial<Connector> = {}): Connector {
  return {
    key: edgeKey(e),
    from: e.from,
    to: e.to,
    path,
    relation: e.relation,
    ...(e.strength ? { strength: e.strength } : {}),
    ...extra,
  };
}

const withLabel = (text: string | undefined, lx: number, ly: number): Partial<Connector> =>
  text ? { label: text, lx: r1(lx), ly: r1(ly) } : {};

// ── details: what rides on a card instead of being one ──────────────

/** A detail: a constraint, a value, a risk, a condition, a note — or anything that applies_to something. */
function isDetailish(n: LogosNode, g: Graph): boolean {
  if (n.role && DETAIL_ROLES.has(n.role as Role)) return true;
  return g.edges.some((e) => e.relation === 'applies_to' && e.from === n.id);
}

/**
 * The details that ride on each host card (lib/representation attachmentsOf),
 * keeping only real details: a node with a part of its own to play in the
 * diagram is a card, whatever it is joined by.
 */
function detailsOn(g: Graph, hosts: ReadonlySet<string>): Map<string, LogosNode[]> {
  const out = new Map<string, LogosNode[]>();
  for (const [host, list] of attachmentsOf({ nodes: g.nodes, edges: g.edges }, new Set(hosts))) {
    const keep = list.filter((d) => !hosts.has(d.id) && isDetailish(d, g));
    if (keep.length) out.set(host, keep);
  }
  return out;
}

const heldBy = (attached: Map<string, LogosNode[]>) => new Set([...attached.values()].flat().map((d) => d.id));

/** A bare card at a box. */
function cardAt(node: LogosNode, b: Box, extra: Partial<Placed> = {}): Placed {
  return { id: node.id, node, x: r1(b.x), y: r1(b.y), w: b.w, h: b.h, bare: true, ...extra };
}

function sizeOf(node: LogosNode, attached?: Map<string, LogosNode[]>): { w: number; h: number } {
  const label = labelOf(node);
  const w = diagramCardW(label);
  return { w, h: bareCardH(label, w) + (attached?.get(node.id)?.length ? ATTACH_H : 0) };
}

// ═════════════════════════════════════════════════════════════════════
// TIME: a sortable number for a time label
// ═════════════════════════════════════════════════════════════════════

/**
 * The kinds of time label, which sort among themselves and not against each
 * other: dates on the calendar; numbered stages (Day 3, Stage II — a day, a
 * week, a month or a year of something counted as the day it starts on, so
 * "Week 2" falls after "Day 3"); days of the year with no year (June 18); and
 * times of day.
 */
export type TimeKind = 'calendar' | 'ordinal' | 'month' | 'clock';
export interface TimeKey {
  order: number;
  kind: TimeKind;
}

/** "Years ago" is counted back from a fixed present, so an order never drifts with the clock. */
const PRESENT = 2000;

const MONTH: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const SEASON: Record<string, number> = { winter: 0.02, spring: 0.3, summer: 0.55, autumn: 0.8, fall: 0.8 };
const NUMBER_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const ORDINAL_WORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty_first'];
const AGO: Record<string, number> = { '': 1, thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9 };
/** a unit of time a stage can count, as the length of one in days */
const UNIT_DAYS: Record<string, number> = { minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30.44, year: 365.25 };
/** things that come in a numbered order without being a length of time */
const STAGE_WORDS: ReadonlySet<string> = new Set([
  'stage', 'step', 'phase', 'round', 'level', 'part', 'chapter', 'act', 'scene', 'episode', 'session', 'lesson', 'unit', 'generation', 'gen',
  'period', 'book', 'volume', 'module', 'wave', 'cycle', 'lap', 'tier', 'grade', 'term', 'semester', 'quarter', 'q', 'sprint', 'iteration',
  'trial', 'game', 'leg', 'section', 'page', 'milestone', 'no', 'number',
]);

type Mod = 'early' | 'mid' | 'late' | null;

function roman(s: string): number | null {
  if (!/^[ivxlc]+$/.test(s)) return null;
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i]];
    const b = i + 1 < s.length ? v[s[i + 1]] : 0;
    total += a < b ? -a : a;
  }
  // only a numeral written the standard way: writing the number back gives the same letters
  const back: [number, string][] = [[100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let n = total;
  let w = '';
  for (const [k, r] of back) while (n >= k) {
    w += r;
    n -= k;
  }
  return total > 0 && w === s ? total : null;
}

/** "3", "4b", "two", "iv", "C" — how many, in a stage's name. A lone i, v or x is a numeral; any other lone letter counts the alphabet. */
function countOf(s: string): number | null {
  const m = s.match(/^(\d{1,4})([a-z])?$/);
  if (m) return +m[1] + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0);
  const w = NUMBER_WORD.indexOf(s);
  if (w >= 0) return w;
  if (/^[a-z]$/.test(s) && !'ivx'.includes(s)) return s.charCodeAt(0) - 96;
  return roman(s);
}

const ymd = (y: number, mo: number, d: number) => y + (mo - 1 + (d - 1) / 31) / 12;
const clockOfYear = (h?: string, m?: string) => (h ? (+h + (m ? +m / 60 : 0)) / 24 / 366 : 0);

/** One time expression, its qualifiers already taken off. */
function parseOne(src: string, mod: Mod, nudge: number): TimeKey | null {
  let s = src.trim();
  if (!s) return null;
  const cal = (v: number): TimeKey | null => (Number.isFinite(v) ? { order: v + nudge, kind: 'calendar' } : null);
  const other = (v: number, kind: TimeKind): TimeKey | null => (Number.isFinite(v) ? { order: v + nudge, kind } : null);
  let m: RegExpMatchArray | null;

  // deep time, counted back: 66 million years ago, 4.6 bya, 12,000 BP
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(thousand|million|billion|k|m|bn|b)?\s*(?:years?|yrs?)\s+ago$/))) return cal(PRESENT - +m[1] * AGO[m[2] ?? '']);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(kya|ka|mya|ma|bya|gya|ga|bp)$/))) {
    const n = +m[1];
    const u = m[2];
    return cal(u === 'bp' ? 1950 - n : PRESENT - n * (u === 'kya' || u === 'ka' ? 1e3 : u === 'mya' || u === 'ma' ? 1e6 : 1e9));
  }

  // the era: BCE counts back from the start of the calendar, CE (or none) forward
  let bce = false;
  let era = false;
  if ((m = s.match(/^(.*\d)\s*(bce|bc|ce|ad)$/) ?? s.match(/^(.*\S)\s+(bce|bc|ce|ad)$/))) {
    bce = m[2] === 'bce' || m[2] === 'bc';
    era = true;
    s = m[1].trim();
  } else if ((m = s.match(/^(?:ad|ce)\s*(\d.*)$/))) {
    era = true;
    s = m[1].trim();
  }
  const year = (y: number) => (bce ? -y : y);
  // early, mid, late: a point a little way into a span (a BCE span still runs forward in time)
  const into = (base: number, len: number) => base + (mod === 'early' ? 0.1 : mod === 'mid' ? 0.45 : mod === 'late' ? 0.75 : 0) * len;

  // a year: 1789, 44 (BC), -500; a bare number of one or two digits is a count, not a year
  if ((m = s.match(/^(-?\d{1,6})$/))) {
    const y = +m[1];
    if (era) return cal(into(year(y), 1));
    if (/^-?\d{3,4}$/.test(m[1])) return cal(into(y, 1));
    if (/^\d{1,2}$/.test(m[1]) && !mod) return other(y, 'ordinal');
    return null;
  }
  // the 1960s (a decade), the 1800s (a century)
  if ((m = s.match(/^(\d{2,3}0)'?s$/))) {
    const d = +m[1];
    const len = /00$/.test(m[1]) ? 100 : 10;
    return cal(into(bce ? -(d + len - 1) : d, len));
  }
  // the 19th century, the 5th century BCE, the third millennium BC
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)\s*(century|centuries|cent|c|millennium|millennia)\.?$/) ?? s.match(/^([a-z_]+)\s+(century|millennium)$/))) {
    const n = /^\d/.test(m[1]) ? +m[1] : ORDINAL_WORD.indexOf(m[1]);
    if (n < 1) return null;
    const len = m[2].startsWith('mill') ? 1000 : 100;
    return cal(into(bce ? -n * len : (n - 1) * len, len));
  }

  const mon = (w: string) => MONTH[w.replace(/\.$/, '')] ?? 0;
  // 18 June 1815, 18th of June 1815, 18 June 1815 11:30
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+\.?)\s+(\d{1,4})(?:\s+(\d{1,2}):(\d{2}))?$/)) && mon(m[2]) && +m[1] >= 1 && +m[1] <= 31) {
    return cal(ymd(year(+m[3]), mon(m[2]), +m[1]) + clockOfYear(m[4], m[5]));
  }
  // June 18 1815
  if ((m = s.match(/^([a-z]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,4})$/)) && mon(m[1]) && +m[2] >= 1 && +m[2] <= 31) {
    return cal(ymd(year(+m[3]), mon(m[1]), +m[2]));
  }
  // June 1940, summer 1940 — and June 18, the day of any year
  if ((m = s.match(/^([a-z]+\.?)\s+(\d{1,4})(?:st|nd|rd|th)?$/))) {
    const mo = mon(m[1]);
    const asYear = m[2].length >= 3 || era;
    if (mo && asYear) return cal(ymd(year(+m[2]), mo, 1) + (mod === 'mid' ? 0.04 : mod === 'late' ? 0.06 : 0));
    if (mo) return +m[2] >= 1 && +m[2] <= 31 ? other(mo - 1 + (+m[2] - 1) / 31, 'month') : null;
    if (m[1] in SEASON && asYear) return cal(year(+m[2]) + SEASON[m[1]]);
  }
  // Q3 2024
  if ((m = s.match(/^q([1-4])\s+(\d{3,4})$/))) return cal(year(+m[2]) + (+m[1] - 1) / 4);
  if (era) return null;
  // 18 June, June: the days and months of any one year
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+\.?)$/)) && mon(m[2]) && +m[1] >= 1 && +m[1] <= 31) return other(mon(m[2]) - 1 + (+m[1] - 1) / 31, 'month');
  if (mon(s)) return other(mon(s) - 1, 'month');
  // a time of day: 9:30, 3pm, noon
  if ((m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.?|p\.m\.?)$/)) && +m[1] >= 1 && +m[1] <= 12) {
    return other((+m[1] % 12) + (m[3].startsWith('p') ? 12 : 0) + (m[2] ? +m[2] / 60 : 0), 'clock');
  }
  if ((m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)) && +m[1] < 24 && +m[2] < 60) return other(+m[1] + +m[2] / 60, 'clock');
  if (s === 'noon' || s === 'midday') return other(12, 'clock');
  if (s === 'midnight') return other(0, 'clock');
  // a numbered stage: Day 3, Stage II, Step 4b, Phase one, Week 2, Q3
  const stage = (unitWord: string, n: number | null, digits: string): TimeKey | null => {
    if (n === null) return null;
    const unit = unitWord.replace(/s$/, '');
    if (unit === 'year' && /^\d{3,4}$/.test(digits)) return cal(+digits);
    if (unit in UNIT_DAYS) return other(1 + (n - 1) * UNIT_DAYS[unit], 'ordinal');
    if (STAGE_WORDS.has(unit) || STAGE_WORDS.has(unitWord)) return other(n, 'ordinal');
    return null;
  };
  if ((m = s.match(/^([a-z]+)\.?\s*#?\s*(\d{1,4}[a-z]?)$/))) return stage(m[1], countOf(m[2]), m[2]);
  if ((m = s.match(/^([a-z]+)\.?\s+#?\s*([a-z]+)$/))) return stage(m[1], countOf(m[2]), '');
  // the 3rd day, the second stage
  if ((m = s.match(/^(\d{1,3})(?:st|nd|rd|th)\s+([a-z]+)$/) ?? s.match(/^([a-z_]+)\s+([a-z]+)$/))) {
    const n = /^\d/.test(m[1]) ? +m[1] : ORDINAL_WORD.indexOf(m[1]);
    if (n >= 1) return stage(m[2], n, '');
  }
  return null;
}

/** Qualifiers that say how sure or how near a date is, taken off its front. */
const QUALIFIERS: [RegExp, (st: { mod: Mod; nudge: number; between: boolean }, m: RegExpMatchArray) => void][] = [
  [/^(?:c|ca|circa)\.?\s*(?=\d)/, () => {}],
  [/^(?:circa|approx\.?|approximately|about|around|roughly|est\.?|estimated|in|by|from|since|until|till|the|on|at)\s+/, () => {}],
  [/^[~≈]\s*/, () => {}],
  [/^year\s+(?=\d{3})/, () => {}],
  [/^before\s+/, (st) => (st.nudge = -0.01)],
  [/^after\s+/, (st) => (st.nudge = 0.01)],
  [/^between\s+/, (st) => (st.between = true)],
  [/^(early|mid|late)(?:\s*-\s*|\s+)(?=\d|[a-z_]+\s+(?:century|millennium))/, (st, m) => (st.mod = m[1] as Mod)],
];

/**
 * A time label's place in time, and the kind of label it is — null for
 * anything that is not one. Years ("1789", "1789 CE", "AD 79"), BCE ("c. 3000
 * BCE", "44 BC"), circa and the like, ISO and written dates ("1815-06-18",
 * "June 1940", "18 June 1815"), decades and centuries ("1960s", "19th
 * century", "5th century BCE"), ranges (their start: "1914–1918"), deep time
 * ("66 million years ago") and numbered stages ("Day 3", "Stage 2").
 */
export function timeKey(at: unknown): TimeKey | null {
  if (typeof at !== 'string') return null;
  let s = at
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length > 64) return null;
  s = s
    .replace(/\bb\.\s?c\.\s?e\b\.?/g, 'bce')
    .replace(/\bb\.\s?c\b\.?/g, 'bc')
    .replace(/\ba\.\s?d\b\.?/g, 'ad')
    .replace(/\bc\.\s?e\b\.?/g, 'ce')
    .replace(/^[([{]\s*/, '')
    .replace(/\s*[)\]}]$/, '')
    .replace(/\s*\?+$/, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/,/g, ' ')
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/g, '$1_$2')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
  const st = { mod: null as Mod, nudge: 0, between: false };
  for (let i = 0; i < 6; i++) {
    const hit = QUALIFIERS.find(([re]) => re.test(s));
    if (!hit) break;
    const m = s.match(hit[0])!;
    hit[1](st, m);
    s = s.slice(m[0].length).trim();
  }
  if (!s) return null;
  // numeric dates first: their dashes are not ranges (but "1914-18", no month 18, is one)
  let m = s.match(/^(-?\d{3,4})([-/.])(\d{1,2})(?:\2(\d{1,2}))?(?:[ t](\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (m) {
    const mo = +m[3];
    const d = m[4] ? +m[4] : 1;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { order: ymd(+m[1], mo, d) + clockOfYear(m[5], m[6]) + st.nudge, kind: 'calendar' };
  }
  if ((m = s.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{3,4})$/))) {
    // day first, as written in Britain, unless only the other way makes sense
    let d = +m[1];
    let mo = +m[3];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { order: ymd(+m[4], mo, d) + st.nudge, kind: 'calendar' } : null;
  }
  // a range is placed at its start, borrowing from its end what the start leaves unsaid:
  // "18–20 June 1815", "June–August 1940", "1200–1100 BCE", "5th–4th century BC"
  const range = st.between
    ? s.match(/^(.+?)\s+(?:and|to|-)\s+(.+)$/)
    : s.match(/^(.+?)\s*(?:-|\bto\b|\buntil\b|\btill\b|\bthrough\b|\bthru\b)\s*(.+)$/);
  if (range) {
    const a = range[1].trim();
    const b = range[2].trim();
    const tail = b.replace(/^\S+\s*/, '');
    const hasYear = (x: string) => /\d{3}/.test(x);
    const eraOfB = b.match(/(?:\d|\s)(bce|bc|ce|ad)$/)?.[1];
    const tries: string[] = [];
    if (!hasYear(a) && hasYear(b) && tail) tries.push(`${a} ${tail}`);
    if (eraOfB && !/\b(bce|bc|ce|ad)\b/.test(a)) tries.push(`${a} ${eraOfB}`);
    tries.push(a);
    if (tail) tries.push(`${a} ${tail}`);
    for (const t of tries) {
      const k = parseOne(t, st.mod, st.nudge);
      if (k) return k;
    }
    return null;
  }
  return parseOne(s, st.mod, st.nudge);
}

/** A sortable number for a time label, or null when it is not one (see timeKey for what is read). */
export function timeOrder(at: string): number | null {
  return timeKey(at)?.order ?? null;
}

// ═════════════════════════════════════════════════════════════════════
// THE CYCLE
// ═════════════════════════════════════════════════════════════════════

const CYCLE_ROLES: ReadonlySet<string> = new Set(['stage', 'step', 'state', 'event']);
/** clear space between two stages round the ring */
const RING_GAP = 28;

interface Loop {
  ids: string[];
  /** the edge from each stage to the next, the last one back to the first */
  edges: LogosEdge[];
}

/**
 * The cycle's loop: the longest closed path of sequence edges (precedes,
 * leads_to, becomes, causes) of three or more, the one with more stage-like
 * roles where two tie. It starts at a stage marked as the start, else at the
 * stage a sequence edge from outside the loop leads into (where the loop is
 * entered), else at its stage that comes first on the map. The search is
 * bounded, so a dense knot of edges cannot stall a frame.
 */
function findLoop(g: Graph): Loop | null {
  const next = new Map<string, LogosEdge[]>();
  for (const e of g.edges) {
    if (!SEQUENCE_RELATIONS.has(e.relation)) continue;
    const list = next.get(e.from);
    if (list) list.push(e);
    else next.set(e.from, [e]);
  }
  const at = (id: string) => g.order.get(id) ?? 0;
  const roles = (ids: string[]) => ids.filter((id) => CYCLE_ROLES.has(g.byId.get(id)?.role ?? '')).length;
  const found = { best: null as string[] | null };
  for (const n of g.nodes) {
    const s = n.id;
    if (!next.has(s)) continue;
    // each loop once, from the earliest of its stages: only later nodes are walked through
    let budget = 4000;
    const path = [s];
    const on = new Set([s]);
    const walk = (u: string) => {
      for (const e of next.get(u) ?? []) {
        if (--budget < 0) return;
        const v = e.to;
        if (v === s) {
          const b = found.best;
          if (path.length >= 3 && (!b || path.length > b.length || (path.length === b.length && roles(path) > roles(b)))) found.best = path.slice();
        } else if (!on.has(v) && at(v) > at(s)) {
          path.push(v);
          on.add(v);
          walk(v);
          path.pop();
          on.delete(v);
        }
      }
    };
    walk(s);
  }
  const best = found.best;
  if (!best) return null;
  // where the loop begins: a stage marked as the start; else where the sequence enters it from
  // outside (the sun drives evaporation); else its stage the map gives first (best[0])
  const onLoop = new Set(best);
  const entered = best.filter((id) => g.edges.some((e) => e.to === id && !onLoop.has(e.from) && SEQUENCE_RELATIONS.has(e.relation)));
  const startRole = best.findIndex((id) => g.byId.get(id)?.role === 'start');
  const firstEntered = entered.length ? best.indexOf([...entered].sort((a, b) => at(a) - at(b))[0]) : -1;
  const from = startRole >= 0 ? startRole : Math.max(0, firstEntered);
  const ids = [...best.slice(from), ...best.slice(0, from)];
  const edges = ids.map((id, i) => next.get(id)!.find((e) => e.to === ids[(i + 1) % ids.length])!);
  return { ids, edges };
}

/** Where the circle of radius R (about the origin) crosses a box: the nearest crossings after and before angle `th`, as angles from it. */
function sideAngles(R: number, b: Box, th: number, m: number): { after: number; before: number } {
  const x0 = b.x - b.w / 2 - m;
  const x1 = b.x + b.w / 2 + m;
  const y0 = b.y - b.h / 2 - m;
  const y1 = b.y + b.h / 2 + m;
  const hits: number[] = [];
  for (const x of [x0, x1]) {
    if (Math.abs(x) > R) continue;
    const yy = Math.sqrt(R * R - x * x);
    for (const y of [yy, -yy]) if (y >= y0 && y <= y1) hits.push(Math.atan2(y, x));
  }
  for (const y of [y0, y1]) {
    if (Math.abs(y) > R) continue;
    const xx = Math.sqrt(R * R - y * y);
    for (const x of [xx, -xx]) if (x >= x0 && x <= x1) hits.push(Math.atan2(y, x));
  }
  let after = Infinity;
  let before = Infinity;
  for (const a of hits) {
    let d = a - th;
    while (d <= -Math.PI) d += 2 * Math.PI;
    while (d > Math.PI) d -= 2 * Math.PI;
    if (d > 1e-9) after = Math.min(after, d);
    else if (d < -1e-9) before = Math.min(before, -d);
  }
  const guess = Math.min(Math.PI / 2, (Math.max(b.w, b.h) / 2 + m) / Math.max(R, 1));
  return { after: Number.isFinite(after) ? after : guess, before: Number.isFinite(before) ? before : guess };
}

interface Ring {
  ok: boolean;
  boxes: Box[];
  /** each arc's start and end angle, the last one past 2π */
  arcs: { a1: number; a2: number }[];
  labels: (Box | null)[];
}

/**
 * The stages on a ring of radius R, and whether it works: no two stages near,
 * room on every arc, every label clear — and, when something sits at the
 * centre, the ring clear of it all round.
 */
function ringAt(R: number, cards: readonly { w: number; h: number }[], texts: readonly (string | undefined)[], centre: { w: number; h: number } | null): Ring {
  const n = cards.length;
  const th = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const boxes = cards.map((c, i) => ({ x: R * Math.cos(th(i)), y: R * Math.sin(th(i)), w: c.w, h: c.h }));
  const middle: Box | null = centre ? { x: 0, y: 0, ...centre } : null;
  let ok = !middle || (Math.hypot(middle.w / 2, middle.h / 2) + 18 < R && !boxes.some((b) => overlaps(b, middle, RING_GAP)));
  for (let i = 0; i < n && ok; i++) for (let j = i + 1; j < n && ok; j++) if (overlaps(boxes[i], boxes[j], RING_GAP)) ok = false;
  const arcs: Ring['arcs'] = [];
  const labels: Ring['labels'] = [];
  for (let i = 0; i < n; i++) {
    const a1 = th(i) + sideAngles(R, boxes[i], th(i), 3).after;
    const a2 = th(i + 1) - sideAngles(R, boxes[(i + 1) % n], th(i + 1), 7).before;
    arcs.push({ a1, a2 });
    const text = texts[i];
    if ((a2 - a1) * R < (text ? 44 : 26)) ok = false;
    if (text) {
      const mid = (a1 + a2) / 2;
      const lb = labelBox(R * Math.cos(mid), R * Math.sin(mid), text);
      if (boxes.some((b) => overlaps(b, lb, 3)) || labels.some((o) => !!o && overlaps(o, lb, 2)) || (middle && overlaps(middle, lb, 6))) ok = false;
      labels.push(lb);
    } else labels.push(null);
  }
  return { ok, boxes, arcs, labels };
}

/**
 * A CYCLE. The stages of the loop evenly round a circle from the top,
 * clockwise, the circle as large as it must be for no two stages to come near
 * and every arc to have room for its words. An arc runs along the circle from
 * each stage to the next, arrowed, the link phrase (or the condition) at its
 * middle — the last one closing the loop back to the first. Details ride on
 * their stage. A node joined to three stages or more is what the cycle turns
 * about: it takes the centre, and the ring is sized round it. Whatever else
 * the loop touches sits outside the ring near what it joins; what touches
 * nothing sits in a row beneath.
 */
export function layoutCycle(map: ThinkingMap, w: number, _h: number): Layout {
  const caption = captionOf('cycle', 'Each stage leads to the next, and round again.');
  const g = graphOf(map);
  const loop = findLoop(g);
  if (!loop) return { placed: [], connectors: [], caption, empty: 'A cycle appears when the stages lead back round to the first.' };
  const W = frameOf(w, FRAME_W);
  const stages = new Set(loop.ids);
  const attached = detailsOn(g, stages);
  const held = heldBy(attached);
  const cards = loop.ids.map((id) => sizeOf(g.byId.get(id)!, attached));
  const texts = loop.edges.map((e) => edgeText(e));
  const nb = neighbours(g);
  const others = g.nodes.filter((nd) => !stages.has(nd.id) && !held.has(nd.id));
  // what the cycle turns about — joined to three stages or more — takes the centre, and the ring is sized round it
  const hub = others
    .map((nd) => ({ nd, k: (nb.get(nd.id) ?? []).filter((id) => stages.has(id)).length }))
    .filter((x) => x.k >= 3)
    .sort((a, b) => b.k - a.k || (g.order.get(a.nd.id) ?? 0) - (g.order.get(b.nd.id) ?? 0))[0]?.nd;
  const hubSize = hub ? sizeOf(hub) : null;

  let R = Math.max(110, cards.reduce((s, c) => s + Math.max(c.w, c.h) * 0.9 + 30, 0) / (2 * Math.PI));
  let ring = ringAt(R, cards, texts, hubSize);
  for (let k = 0; k < 400 && !ring.ok; k++) {
    R = R * 1.04 + 3;
    ring = ringAt(R, cards, texts, hubSize);
  }

  // everything is placed about the ring's centre first, then the whole moved into the frame
  const pos = new Map<string, Box>(loop.ids.map((id, i) => [id, ring.boxes[i]]));
  const blocks: Box[] = [...ring.boxes, ...ring.labels.filter((b): b is Box => !!b)];
  if (hub && hubSize) {
    pos.set(hub.id, { x: 0, y: 0, ...hubSize });
    blocks.push(pos.get(hub.id)!);
  }
  const ext = (b: { w: number; h: number }, ux: number, uy: number) => (Math.abs(ux) * b.w) / 2 + (Math.abs(uy) * b.h) / 2;
  const free = (b: Box) => !blocks.some((o) => overlaps(o, b, 24));
  for (let placedOne = true; placedOne; ) {
    placedOne = false;
    for (const nd of others) {
      if (pos.has(nd.id)) continue;
      const near = (nb.get(nd.id) ?? []).filter((id) => pos.has(id));
      if (!near.length) continue;
      const s = sizeOf(nd);
      let spot: Box | null = null;
      let ux = 0;
      let uy = 0;
      for (const id of near) {
        const p = pos.get(id)!;
        const d = Math.hypot(p.x, p.y) || 1;
        ux += p.x / d;
        uy += p.y / d;
      }
      if (Math.hypot(ux, uy) < 1e-6) {
        const p = pos.get(near[0])!;
        ux = p.x || 1;
        uy = p.y;
      }
      const u = Math.hypot(ux, uy) || 1;
      ux /= u;
      uy /= u;
      // from just beyond what it joins, and never inside the ring
      const base = Math.max(
        Math.max(...near.map((id) => Math.hypot(pos.get(id)!.x, pos.get(id)!.y) + ext(pos.get(id)!, ux, uy))) + 40 + ext(s, ux, uy),
        R + 14 + ext(s, ux, uy)
      );
      const a0 = Math.atan2(uy, ux);
      const turns = [0, 1, -1, 2, -2, 3, -3, 4, -4];
      for (let k = 0; k < 3000 && !spot; k++) {
        const rr = base + Math.floor(k / turns.length) * 26;
        const a = a0 + turns[k % turns.length] * 0.16;
        const c: Box = { x: rr * Math.cos(a), y: rr * Math.sin(a), ...s };
        // outside the ring: clear of the circle the arcs run along
        const nearest = Math.hypot(Math.max(0, Math.abs(c.x) - c.w / 2), Math.max(0, Math.abs(c.y) - c.h / 2));
        if (nearest > R + 12 && free(c)) spot = c;
      }
      if (!spot) spot = { x: (base + 9000 + 300 * pos.size) * Math.cos(a0), y: (base + 9000 + 300 * pos.size) * Math.sin(a0), ...s };
      pos.set(nd.id, spot);
      blocks.push(spot);
      placedOne = true;
      break;
    }
  }
  // what touches neither the loop nor anything near it: a row beneath
  const loose = others.filter((nd) => !pos.has(nd.id));
  if (loose.length) {
    const b = boundsOf(blocks);
    const row = rowBeneath(loose.map((nd) => sizeOf(nd)), b.x0, b.y1 + 56, Math.max(b.x1 - b.x0, W - 2 * PAD));
    loose.forEach((nd, i) => pos.set(nd.id, row[i]));
    blocks.push(...row);
  }
  const { dx, dy } = settle(boundsOf(blocks), W);
  const at = (b: Box): Box => ({ ...b, x: b.x + dx, y: b.y + dy });
  const cx = dx;
  const cy = dy;

  const looseIds = new Set(loose.map((nd) => nd.id));
  const placed: Placed[] = g.nodes
    .filter((nd) => pos.has(nd.id))
    .map((nd) => {
      // a stage is round; what sits outside the ring is drawn as it would be anywhere
      const shape = diagramShapeFor(nd, stages.has(nd.id) ? 'cycle' : 'concept');
      return cardAt(nd, at(pos.get(nd.id)!), {
        ...(shape ? { shape } : {}),
        ...(attached.get(nd.id)?.length ? { attached: attached.get(nd.id) } : {}),
        ...(looseIds.has(nd.id) ? { loose: true } : {}),
      });
    });

  const connectors: Connector[] = [];
  const drawn = new Set<string>();
  loop.edges.forEach((e, i) => {
    const { a1, a2 } = ring.arcs[i];
    const mid = (a1 + a2) / 2;
    drawn.add(edgeKey(e));
    connectors.push(
      connectorOf(e, `M ${pt(cx + R * Math.cos(a1), cy + R * Math.sin(a1))} A ${r1(R)} ${r1(R)} 0 0 1 ${pt(cx + R * Math.cos(a2), cy + R * Math.sin(a2))}`, {
        arrow: true,
        ...withLabel(texts[i], cx + R * Math.cos(mid), cy + R * Math.sin(mid)),
      })
    );
  });
  const rest = g.edges.filter((e) => !drawn.has(edgeKey(e)) && pos.has(e.from) && pos.has(e.to));
  const lanes = lanesOf(rest);
  for (const e of rest) {
    const a = at(pos.get(e.from)!);
    const b = at(pos.get(e.to)!);
    const arrow = directed(e.relation);
    const text = edgeText(e);
    const { lane, t } = lanes.get(edgeKey(e)) ?? { lane: 0, t: 0.5 };
    if (stages.has(e.from) && stages.has(e.to)) {
      // across the ring: bowed in towards the centre, clear of the arcs round it (two of them, one further in)
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const pull = 0.35 + lane * 0.22;
      const qx = mx + (cx - mx) * pull;
      const qy = my + (cy - my) * pull;
      const [sx, sy] = edgePoint(a, qx, qy, 2);
      const [ex, ey] = edgePoint(b, qx, qy, arrow ? 5 : 2);
      const [lx, ly] = quadAt(sx, sy, qx, qy, ex, ey, 0.5);
      connectors.push(connectorOf(e, `M ${pt(sx, sy)} Q ${pt(qx, qy)} ${pt(ex, ey)}`, { ...(arrow ? { arrow } : {}), ...withLabel(text, lx, ly) }));
    } else {
      const r = curveBetween(a, b, arrow, lane, t, text);
      connectors.push(connectorOf(e, r.d, { ...(arrow ? { arrow } : {}), ...withLabel(text, r.mx, r.my) }));
    }
  }
  return { placed, connectors, caption };
}

// ═════════════════════════════════════════════════════════════════════
// THE TREE
// ═════════════════════════════════════════════════════════════════════

const SIBLING_GAP = 28;
const TREE_GAP = 56;

/**
 * A TREE. What sits under what, top down: a child is whatever is part_of or
 * is_a its parent. A node with two parents sits under the first, and a link
 * that would make a node its own ancestor is not followed; both are drawn as
 * links across the tree instead. Tidy: each subtree packed against its
 * neighbours level by level, never closer than a gap, each parent centred over
 * its children, the levels evenly spaced. Right-angled lines from a parent's
 * foot to each child's head, with the link phrase above the child. Details
 * (what applies_to a node) ride on it; what is not in the tree sits in a row
 * beneath. A wide tree is let grow wide — the canvas fits it.
 */
export function layoutTree(map: ThinkingMap, w: number, _h: number): Layout {
  const caption = captionOf('tree', 'What sits under what.');
  const g = graphOf(map);
  const W = frameOf(w, FRAME_W);
  const parentOf = new Map<string, string>();
  const treeEdge = new Map<string, LogosEdge>();
  const climbs = (from: string, target: string) => {
    const seen = new Set<string>();
    for (let c: string | undefined = from; c !== undefined && !seen.has(c); c = parentOf.get(c)) {
      if (c === target) return true;
      seen.add(c);
    }
    return false;
  };
  for (const e of g.edges) {
    if (e.relation !== 'part_of' && e.relation !== 'is_a') continue;
    if (parentOf.has(e.from) || climbs(e.to, e.from)) continue;
    parentOf.set(e.from, e.to);
    treeEdge.set(e.from, e);
  }
  if (!parentOf.size) return { placed: [], connectors: [], caption, empty: 'A tree appears when things sit under other things.' };
  const inTree = new Set([...parentOf.keys(), ...parentOf.values()]);
  const attached = detailsOn(g, inTree);
  const held = heldBy(attached);
  const kids = new Map<string, string[]>();
  for (const nd of g.nodes) {
    const p = parentOf.get(nd.id);
    if (p === undefined) continue;
    const list = kids.get(p);
    if (list) list.push(nd.id);
    else kids.set(p, [nd.id]);
  }
  const roots = g.nodes.filter((nd) => inTree.has(nd.id) && !parentOf.has(nd.id)).map((nd) => nd.id);
  const size = new Map(g.nodes.map((nd) => [nd.id, sizeOf(nd, attached)]));
  const text = new Map<string, string | undefined>([...treeEdge].map(([c, e]) => [c, edgeText(e)]));
  // how much of a level a node takes: its card, or its link phrase when that is wider
  const span = (id: string) => Math.max(size.get(id)!.w, text.get(id) ? textW(text.get(id)!) + 10 : 0);

  // each subtree's outline, level by level, relative to its root
  interface Outline {
    l: number[];
    r: number[];
  }
  const rel = new Map<string, number>();
  const pack = (subs: Outline[], gap: number): { offs: number[]; merged: Outline } => {
    const offs: number[] = [];
    const merged: Outline = { l: [], r: [] };
    subs.forEach((s, i) => {
      let off = 0;
      if (i > 0) {
        off = -Infinity;
        for (let d = 0; d < Math.min(merged.r.length, s.l.length); d++) off = Math.max(off, merged.r[d] - s.l[d] + gap);
        if (!Number.isFinite(off)) off = 0;
      }
      offs.push(off);
      for (let d = 0; d < s.l.length; d++) {
        if (d < merged.l.length) {
          merged.l[d] = Math.min(merged.l[d], s.l[d] + off);
          merged.r[d] = Math.max(merged.r[d], s.r[d] + off);
        } else {
          merged.l.push(s.l[d] + off);
          merged.r.push(s.r[d] + off);
        }
      }
    });
    return { offs, merged };
  };
  const outline = (id: string, depth: number): Outline => {
    const half = span(id) / 2;
    const cs = depth > 64 ? [] : kids.get(id) ?? [];
    if (!cs.length) return { l: [-half], r: [half] };
    const { offs, merged } = pack(
      cs.map((c) => outline(c, depth + 1)),
      SIBLING_GAP
    );
    const mid = (offs[0] + offs[offs.length - 1]) / 2;
    cs.forEach((c, i) => rel.set(c, offs[i] - mid));
    return { l: [-half, ...merged.l.map((v) => v - mid)], r: [half, ...merged.r.map((v) => v - mid)] };
  };
  const forest = pack(
    roots.map((r) => outline(r, 0)),
    TREE_GAP
  );
  const xOf = new Map<string, number>();
  const depthOf = new Map<string, number>();
  const walk = (id: string, x: number, d: number) => {
    xOf.set(id, x);
    depthOf.set(id, d);
    for (const c of kids.get(id) ?? []) if (!xOf.has(c)) walk(c, x + (rel.get(c) ?? 0), d + 1);
  };
  roots.forEach((r, i) => walk(r, forest.offs[i], 0));

  const treeIds = g.nodes.filter((nd) => xOf.has(nd.id)).map((nd) => nd.id);
  const tallest = Math.max(...treeIds.map((id) => size.get(id)!.h));
  // more room between the levels when there are words to put there
  const levelGap = g.edges.some((e) => !held.has(e.from) && !held.has(e.to) && edgeText(e)) ? 76 : 56;
  const rowStep = tallest + levelGap;
  const boxes = new Map<string, Box>();
  for (const id of treeIds) boxes.set(id, { x: xOf.get(id)!, y: tallest / 2 + depthOf.get(id)! * rowStep, ...size.get(id)! });
  const loose = g.nodes.filter((nd) => !inTree.has(nd.id) && !held.has(nd.id));
  if (loose.length) {
    const b = boundsOf([...boxes.values()]);
    const row = rowBeneath(loose.map((nd) => size.get(nd.id)!), b.x0, b.y1 + 64, Math.max(b.x1 - b.x0, W - 2 * PAD));
    loose.forEach((nd, i) => boxes.set(nd.id, row[i]));
  }
  const { dx, dy } = settle(boundsOf([...boxes.values()]), W);
  for (const [id, b] of boxes) boxes.set(id, { ...b, x: b.x + dx, y: b.y + dy });

  const looseIds = new Set(loose.map((nd) => nd.id));
  const placed: Placed[] = g.nodes
    .filter((nd) => boxes.has(nd.id))
    .map((nd) =>
      cardAt(nd, boxes.get(nd.id)!, {
        ...(attached.get(nd.id)?.length ? { attached: attached.get(nd.id) } : {}),
        ...(looseIds.has(nd.id) ? { loose: true } : {}),
      })
    );

  const connectors: Connector[] = [];
  const drawn = new Set<string>();
  for (const id of treeIds) {
    const e = treeEdge.get(id);
    if (!e) continue;
    const p = boxes.get(e.to)!;
    const c = boxes.get(id)!;
    const top = p.y + p.h / 2;
    const foot = c.y - c.h / 2;
    // the shared rail halfway between the parent's level and the child's
    const rail = p.y + tallest / 2 + levelGap / 2;
    const run = c.x - p.x;
    const rr = Math.min(8, Math.abs(run) / 2, (rail - top) / 2, (foot - rail) / 2);
    const turn = Math.sign(run);
    // every point written out in full, so the line's ends can be read straight off it
    const path =
      Math.abs(run) < 1
        ? `M ${pt(p.x, top)} L ${pt(p.x, foot)}`
        : `M ${pt(p.x, top)} L ${pt(p.x, rail - rr)} Q ${pt(p.x, rail)} ${pt(p.x + turn * rr, rail)} L ${pt(c.x - turn * rr, rail)} Q ${pt(c.x, rail)} ${pt(c.x, rail + rr)} L ${pt(c.x, foot)}`;
    drawn.add(edgeKey(e));
    connectors.push({ ...connectorOf(e, path, withLabel(text.get(id), c.x, foot - 3)), from: e.to, to: id });
  }
  // links across the tree: a second parent, a loop not followed, any other relation
  const across = g.edges.filter((e) => !drawn.has(edgeKey(e)) && boxes.has(e.from) && boxes.has(e.to));
  const lanes = lanesOf(across);
  for (const e of across) {
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    const arrow = directed(e.relation);
    const { lane, t } = lanes.get(edgeKey(e)) ?? { lane: 0, t: 0.5 };
    if (Math.abs(a.y - b.y) < 1) {
      // two on one level: a dip beneath the level, not a line through whatever stands between them
      const dir = b.x > a.x ? 1 : -1;
      const sx = a.x + dir * Math.min(a.w / 4, 30);
      const ex = b.x - dir * Math.min(b.w / 4, 30);
      const y0 = a.y + a.h / 2;
      const y1 = b.y + b.h / 2 + (arrow ? 4 : 0);
      const low = a.y + Math.max(a.h, b.h, looseIds.has(e.from) ? 0 : tallest) / 2 + clamp(16 + Math.abs(ex - sx) * 0.05 + lane * 8, 12, levelGap / 2 - 6);
      const cy = (low - (y0 + y1) / 8) / 0.75;
      const path = `M ${pt(sx, y0)} C ${pt(sx, cy)} ${pt(ex, cy)} ${pt(ex, y1)}`;
      connectors.push(connectorOf(e, path, { ...(arrow ? { arrow } : {}), ...withLabel(edgeText(e), (sx + ex) / 2, low) }));
      continue;
    }
    const text = edgeText(e);
    const r = curveBetween(a, b, arrow, lane, t, text);
    connectors.push(connectorOf(e, r.d, { ...(arrow ? { arrow } : {}), ...withLabel(text, r.mx, r.my) }));
  }
  return { placed, connectors, caption };
}

// ═════════════════════════════════════════════════════════════════════
// THE PARTS
// ═════════════════════════════════════════════════════════════════════

/** padding inside a region (at least 12 by the contract), and the gaps between what it holds */
const IN = 16;
const CELL_GAP_X = 16;
const CELL_GAP_Y = 14;
const REGION_GAP = 20;
const TOP_GAP = 44;

interface Region {
  key: string;
  label: string;
  /** the node the region is, when it is one: its card names the region from the top-left corner */
  whole?: string;
  depth: number;
  cards: string[];
  inner: Region[];
  // measured
  w: number;
  h: number;
  headH: number;
  head: { w: number; h: number };
  cols: number;
  cellW: number;
  rowsH: number[];
  gridW: number;
  gridH: number;
  innerRows: Region[][];
  // placed (top-left)
  x: number;
  y: number;
}

/**
 * THE PARTS. Each whole — a node something is part_of, or a group name two or
 * more nodes share — is a region, its parts bare cards in a tidy grid inside
 * it, and a part that is itself a whole is a region inside that one (two
 * levels at most: deeper, a whole is a card beside its parts, joined to them).
 *
 * A WHOLE THAT IS A NODE IS NAMED BY ITS OWN CARD. The node's card sits in the
 * region's header, IN (16px) inside its top-left corner — a small bare card,
 * one line where it can be — so the node is still a card exactly once and can
 * still be inspected. GroupBox.label carries the same words, for anything that
 * draws regions without their cards; a renderer drawing the cards should not
 * write the label of a region keyed `whole~<id>` as well, or the name appears
 * twice. A region keyed `group~<name>` is a group name two or more nodes share:
 * it has no card, and its header (36px) is room for its label.
 *
 * A part_of that a region shows is not drawn again as a line; every other
 * connection is — arrowed where it reads one way, with its link phrase.
 * Regions never overlap one another, cards never overlap, and every card sits
 * at least IN (16) inside its region.
 */
export function layoutParts(map: ThinkingMap, w: number, _h: number): Layout {
  const caption = captionOf('parts', 'What it is made of, and what sits inside what.');
  const empty = 'A parts diagram appears when something is made of parts.';
  const g = graphOf(map);
  const W = frameOf(w, FRAME_W);
  const nameOf = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  const norm = (s: string) => s.toLowerCase();
  const groupCount = new Map<string, number>();
  for (const nd of g.nodes) {
    const k = norm(nameOf(nd.group));
    if (k) groupCount.set(k, (groupCount.get(k) ?? 0) + 1);
  }
  const named = new Map<string, string>();
  for (const nd of g.nodes) {
    const k = norm(nameOf(labelOf(nd)));
    if (k && !named.has(k)) named.set(k, nd.id);
  }
  // what is part of the structure is a card, whatever else it is; only the rest may be a detail
  const structural = new Set<string>();
  for (const e of g.edges) if (e.relation === 'part_of') structural.add(e.from).add(e.to);
  for (const nd of g.nodes) {
    const k = norm(nameOf(nd.group));
    if (!k || ((groupCount.get(k) ?? 0) < 2 && !named.has(k))) continue;
    structural.add(nd.id);
    if (named.has(k)) structural.add(named.get(k)!);
  }
  const hosts = new Set(g.nodes.filter((nd) => structural.has(nd.id) || !isDetailish(nd, g)).map((nd) => nd.id));
  const attached = detailsOn(g, hosts);
  const held = heldBy(attached);
  const live = g.nodes.filter((nd) => !held.has(nd.id));

  // the whole each part sits in: its first part_of, never one that would put a whole inside its own part
  const parentNode = new Map<string, string>();
  const climbs = (from: string, target: string) => {
    const seen = new Set<string>();
    for (let c: string | undefined = from; c !== undefined && !seen.has(c); c = parentNode.get(c)) {
      if (c === target) return true;
      seen.add(c);
    }
    return false;
  };
  for (const e of g.edges) {
    if (e.relation !== 'part_of' || held.has(e.from) || held.has(e.to) || parentNode.has(e.from) || climbs(e.to, e.from)) continue;
    parentNode.set(e.from, e.to);
  }
  // groups: a group named after a node is that node's region; otherwise one of its own
  const groupOf = new Map<string, string>();
  const groupRegions: { key: string; label: string; parent?: string }[] = [];
  const byGroup = new Map<string, { label: string; ids: string[] }>();
  for (const nd of live) {
    const label = nameOf(nd.group);
    const k = norm(label);
    if (!k) continue;
    const entry = byGroup.get(k);
    if (entry) entry.ids.push(nd.id);
    else byGroup.set(k, { label, ids: [nd.id] });
  }
  for (const [k, { label, ids }] of byGroup) {
    const whole = named.get(k);
    if (whole !== undefined && !held.has(whole)) {
      for (const m of ids) if (m !== whole && !parentNode.has(m) && !climbs(whole, m)) parentNode.set(m, whole);
      continue;
    }
    if (ids.length < 2) continue;
    const explicit = [...new Set(ids.map((m) => parentNode.get(m)).filter((p): p is string => p !== undefined))];
    // one whole between them, or none: the group sits inside it; members that disagree keep their own wholes
    const parent = explicit.length === 1 ? explicit[0] : undefined;
    const members = ids.filter((m) => (explicit.length <= 1 || !parentNode.has(m)) && m !== parent && (parent === undefined || !climbs(parent, m)));
    if (members.length < 2) continue;
    const key = `group~${k}`;
    groupRegions.push({ key, label, ...(parent !== undefined ? { parent } : {}) });
    for (const m of members) groupOf.set(m, key);
  }
  const containerOf = (id: string): string | undefined => groupOf.get(id) ?? (parentNode.has(id) ? `whole~${parentNode.get(id)}` : undefined);
  const regionParent = new Map<string, string | undefined>();
  for (const nd of live) {
    const c = containerOf(nd.id);
    if (c && !regionParent.has(c)) regionParent.set(c, c.startsWith('whole~') ? containerOf(c.slice(6)) : undefined);
  }
  for (const gr of groupRegions) {
    regionParent.set(gr.key, gr.parent !== undefined ? `whole~${gr.parent}` : undefined);
    if (gr.parent !== undefined) {
      const k = `whole~${gr.parent}`;
      if (!regionParent.has(k)) regionParent.set(k, containerOf(gr.parent));
    }
  }
  // a region's parent is always a region too (a whole with something in it)
  for (let grew = true, pass = 0; grew && pass < 32; pass++) {
    grew = false;
    for (const [, p] of [...regionParent]) {
      if (!p || regionParent.has(p)) continue;
      regionParent.set(p, p.startsWith('whole~') ? containerOf(p.slice(6)) : undefined);
      grew = true;
    }
  }
  // groups at odds with the part_of edges can make a ring of regions each inside the next: cut it where it
  // closes (that region stands on its own, and the part_of it no longer shows is drawn as a line)
  for (const start of [...regionParent.keys()]) {
    const seen = new Set<string>();
    for (let k: string | undefined = start; k !== undefined; k = regionParent.get(k)) {
      if (seen.has(k)) {
        regionParent.set(k, undefined);
        break;
      }
      seen.add(k);
    }
  }
  if (!regionParent.size) return { placed: [], connectors: [], caption, empty };
  const depthMemo = new Map<string, number>();
  const depthOf = (key: string, guard = 0): number => {
    if (depthMemo.has(key)) return depthMemo.get(key)!;
    const p = regionParent.get(key);
    const d = p && guard < 32 ? depthOf(p, guard + 1) + 1 : 0;
    depthMemo.set(key, d);
    return d;
  };
  // two levels are drawn; anything deeper belongs to the level-one region above it
  const drawnRegion = (key: string): string => {
    let k = key;
    for (let i = 0; i < 32 && depthOf(k) > 1; i++) k = regionParent.get(k)!;
    return k;
  };
  const regions = new Map<string, Region>();
  const groupLabel = new Map(groupRegions.map((gr) => [gr.key, gr.label]));
  const regionFor = (key: string): Region => {
    let r = regions.get(key);
    if (!r) {
      const whole = key.startsWith('whole~') ? key.slice(6) : undefined;
      r = {
        key,
        label: whole !== undefined ? labelOf(g.byId.get(whole)!) : groupLabel.get(key) ?? '',
        ...(whole !== undefined ? { whole } : {}),
        depth: depthOf(key),
        cards: [],
        inner: [],
        w: 0, h: 0, headH: 0, head: { w: 0, h: 0 }, cols: 0, cellW: 0, rowsH: [], gridW: 0, gridH: 0, innerRows: [], x: 0, y: 0,
      };
      regions.set(key, r);
    }
    return r;
  };
  // regions in the order their first card appears on the map, so the picture follows the map
  const freeIds: string[] = [];
  for (const nd of live) {
    const own = `whole~${nd.id}`;
    if (regionParent.has(own) && depthOf(own) <= 1) {
      regionFor(own);
      continue;
    }
    const c = containerOf(nd.id);
    if (c) regionFor(drawnRegion(c)).cards.push(nd.id);
    else freeIds.push(nd.id);
  }
  for (const gr of groupRegions) if (depthOf(gr.key) <= 1) regionFor(gr.key);
  for (const r of [...regions.values()]) {
    if (r.depth === 1) {
      const p = regionParent.get(r.key);
      if (p) regionFor(p).inner.push(r);
    }
  }
  const sizes = new Map(live.map((nd) => [nd.id, sizeOf(nd, attached)]));

  const measure = (r: Region) => {
    for (const i of r.inner) measure(i);
    if (r.whole !== undefined) {
      const lab = labelOf(g.byId.get(r.whole)!);
      const hw = titleW(lab);
      r.head = { w: hw, h: bareCardH(lab, hw) + (attached.get(r.whole)?.length ? ATTACH_H : 0) };
      r.headH = IN + r.head.h + 12;
    } else {
      r.head = { w: textW(r.label), h: 14 };
      r.headH = 12 + 14 + 10;
    }
    // the regions inside, three to a row
    r.innerRows = [];
    for (let i = 0; i < r.inner.length; i += 3) r.innerRows.push(r.inner.slice(i, i + 3));
    const innerW = Math.max(0, ...r.innerRows.map((row) => row.reduce((s, x) => s + x.w, 0) + REGION_GAP * (row.length - 1)));
    const innerH = r.innerRows.reduce((s, row) => s + Math.max(...row.map((x) => x.h)), 0) + REGION_GAP * Math.max(0, r.innerRows.length - 1);
    // the parts, in a grid of equal cells
    const n = r.cards.length;
    r.cellW = Math.max(0, ...r.cards.map((id) => sizes.get(id)!.w));
    const gridW = (c: number) => c * r.cellW + (c - 1) * CELL_GAP_X;
    r.cols = n <= 3 ? n : n === 4 ? 2 : Math.min(5, Math.round(Math.sqrt(n * 1.6)));
    while (r.cols < n && innerW > 0 && gridW(r.cols + 1) <= innerW) r.cols++;
    r.rowsH = [];
    for (let i = 0; i < n; i += Math.max(1, r.cols)) r.rowsH.push(Math.max(...r.cards.slice(i, i + r.cols).map((id) => sizes.get(id)!.h)));
    r.gridW = n ? gridW(r.cols) : 0;
    r.gridH = r.rowsH.reduce((s, x) => s + x, 0) + CELL_GAP_Y * Math.max(0, r.rowsH.length - 1);
    const contentW = Math.max(r.gridW, innerW);
    const contentH = r.gridH + (n && r.inner.length ? 18 : 0) + innerH;
    r.w = Math.max(r.head.w + 2 * IN, contentW + 2 * IN, 140);
    r.h = r.headH + contentH + IN;
  };
  const boxes = new Map<string, Box>();
  const place = (r: Region, x: number, y: number) => {
    r.x = x;
    r.y = y;
    if (r.whole !== undefined) boxes.set(r.whole, { x: x + IN + r.head.w / 2, y: y + IN + r.head.h / 2, ...r.head });
    const inside = r.w - 2 * IN;
    let top = y + r.headH;
    const left = x + IN + (inside - r.gridW) / 2;
    r.rowsH.forEach((rowH, ri) => {
      r.cards.slice(ri * r.cols, (ri + 1) * r.cols).forEach((id, ci) => {
        boxes.set(id, { x: left + ci * (r.cellW + CELL_GAP_X) + r.cellW / 2, y: top + rowH / 2, ...sizes.get(id)! });
      });
      top += rowH + CELL_GAP_Y;
    });
    if (r.cards.length) top += 18 - CELL_GAP_Y;
    for (const row of r.innerRows) {
      const rowW = row.reduce((s, i) => s + i.w, 0) + REGION_GAP * (row.length - 1);
      let ix = x + IN + (inside - rowW) / 2;
      for (const i of row) {
        place(i, ix, top);
        ix += i.w + REGION_GAP;
      }
      top += Math.max(...row.map((i) => i.h)) + REGION_GAP;
    }
  };
  const tops = [...regions.values()].filter((r) => r.depth === 0);
  for (const r of tops) measure(r);
  const across = Math.max(W - 2 * PAD, 900);
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const r of tops) {
    if (x > 0 && x + r.w > across) {
      x = 0;
      y += rowH + TOP_GAP;
      rowH = 0;
    }
    place(r, x, y);
    x += r.w + TOP_GAP;
    rowH = Math.max(rowH, r.h);
  }
  // what is in no region and joined to something — what flows in, what comes out — sits beneath,
  // each as near as it can be to under what it joins; what is joined to nothing, a row beneath that
  const nb = neighbours(g);
  const all = [...regions.values()];
  const wholeAt = new Map(all.filter((r) => r.whole !== undefined).map((r) => [r.whole!, r.x + r.w / 2]));
  const joined = freeIds.filter((id) => (nb.get(id) ?? []).some((o) => !held.has(o)));
  const alone = freeIds.filter((id) => !joined.includes(id));
  const widest = Math.max(across, ...tops.map((r) => r.x + r.w));
  let bottom = y + rowH;
  // under what it joins in the regions, as near as the row allows
  const aim = (id: string) => {
    const xs = (nb.get(id) ?? []).map((o) => wholeAt.get(o) ?? boxes.get(o)?.x).filter((v): v is number => v !== undefined);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  };
  const aimed = joined
    .map((id, i) => ({ id, i, at: aim(id) }))
    .filter((a): a is { id: string; i: number; at: number } => a.at !== null)
    .sort((a, b) => a.at - b.at || a.i - b.i);
  if (aimed.length) {
    let top = bottom + 56;
    let next = 0;
    let tall = 0;
    for (const { id, at: want } of aimed) {
      const s = sizes.get(id)!;
      let left = Math.max(next, want - s.w / 2);
      if (next > 0 && left + s.w > widest) {
        top += tall + ROW_GAP;
        tall = 0;
        left = Math.max(0, Math.min(want - s.w / 2, widest - s.w));
      }
      boxes.set(id, { x: left + s.w / 2, y: top + s.h / 2, ...s });
      next = left + s.w + ROW_GAP;
      tall = Math.max(tall, s.h);
    }
    bottom = top + tall;
  }
  // joined only to one another, then joined to nothing (loose): rows beneath
  for (const ids of [joined.filter((id) => !boxes.has(id)), alone]) {
    if (!ids.length) continue;
    const row = rowBeneath(ids.map((id) => sizes.get(id)!), 0, bottom + 50, widest);
    ids.forEach((id, i) => boxes.set(id, row[i]));
    bottom = boundsOf(row).y1;
  }
  const regionBoxes = all.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h }));
  const { dx, dy } = settle(boundsOf([...regionBoxes, ...boxes.values()]), W);
  for (const [id, b] of boxes) boxes.set(id, { ...b, x: b.x + dx, y: b.y + dy });
  const groups: GroupBox[] = all.map((r) => ({ key: r.key, label: r.label, x: r1(r.x + dx), y: r1(r.y + dy), w: r1(r.w), h: r1(r.h), depth: r.depth }));

  const aloneIds = new Set(alone);
  const placed: Placed[] = live
    .filter((nd) => boxes.has(nd.id))
    .map((nd) =>
      cardAt(nd, boxes.get(nd.id)!, {
        ...(attached.get(nd.id)?.length ? { attached: attached.get(nd.id) } : {}),
        ...(aloneIds.has(nd.id) ? { loose: true } : {}),
      })
    );

  // the regions a card is drawn inside, innermost first
  const regionOfCard = new Map<string, string>();
  for (const r of all) {
    if (r.whole !== undefined) regionOfCard.set(r.whole, r.key);
    for (const id of r.cards) regionOfCard.set(id, r.key);
  }
  const insideOf = (id: string): string[] => {
    const out: string[] = [];
    for (let k = regionOfCard.get(id); k !== undefined && out.length < 8; k = regionParent.get(k)) if (regions.has(k)) out.push(k);
    return out;
  };
  // a line to a whole from outside it meets the whole's region, not the small card that names it
  const regionBox = new Map(all.filter((r) => r.whole !== undefined).map((r) => [r.whole!, { x: r.x + dx + r.w / 2, y: r.y + dy + r.h / 2, w: r.w, h: r.h }]));
  const endOf = (id: string, other: string): Box => {
    const rb = regionBox.get(id);
    return rb && !insideOf(other).includes(`whole~${id}`) ? rb : boxes.get(id)!;
  };
  // a part drawn inside its whole needs no line to say so
  const lines = g.edges.filter((e) => boxes.has(e.from) && boxes.has(e.to) && !(e.relation === 'part_of' && insideOf(e.from).includes(`whole~${e.to}`)));
  const lanes = lanesOf(lines);
  const connectors: Connector[] = [];
  for (const e of lines) {
    const arrow = directed(e.relation);
    const { lane, t } = lanes.get(edgeKey(e)) ?? { lane: 0, t: 0.5 };
    const text = edgeText(e);
    const r = curveBetween(endOf(e.from, e.to), endOf(e.to, e.from), arrow, lane, t, text);
    connectors.push(connectorOf(e, r.d, { ...(arrow ? { arrow } : {}), ...withLabel(text, r.mx, r.my) }));
  }
  return { placed, connectors, groups, caption };
}

// ═════════════════════════════════════════════════════════════════════
// THE CONCEPT MAP
// ═════════════════════════════════════════════════════════════════════

/** the least clear space between two ideas */
const CONCEPT_GAP = 20;

/**
 * One connected cluster of ideas laid out about its hub (at the origin): in
 * rings by how many links away each idea is, each idea's share of the circle
 * its share of the ideas beyond it, siblings ordered so that subtrees linked
 * to each other sit side by side; each idea as far out from the one it hangs
 * from as their cards and the words between them need, and further where its
 * ring is crowded. Then a few deterministic passes push apart anything closer
 * than the gap, and a last pass moves each idea outward from the hub until it
 * is clear of every idea before it — so the result never overlaps, whatever
 * the passes left.
 */
function radialCluster(
  ids: readonly string[],
  hub: string,
  g: Graph,
  nb: Map<string, string[]>,
  size: Map<string, { w: number; h: number }>,
  room: (a: string, b: string) => number
): Map<string, Box> {
  const member = new Set(ids);
  const depth = new Map<string, number>([[hub, 0]]);
  const parent = new Map<string, string>();
  const kids = new Map<string, string[]>();
  const order = [hub];
  for (let i = 0; i < order.length; i++) {
    const u = order[i];
    const next = (nb.get(u) ?? []).filter((v) => member.has(v) && !depth.has(v)).sort((a, b) => (g.order.get(a) ?? 0) - (g.order.get(b) ?? 0));
    for (const v of next) {
      depth.set(v, depth.get(u)! + 1);
      parent.set(v, u);
      order.push(v);
      const list = kids.get(u);
      if (list) list.push(v);
      else kids.set(u, [v]);
    }
  }
  // what hangs under each idea, to see which subtrees are linked across
  const under = new Map<string, Set<string>>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const all = new Set([id]);
    for (const k of kids.get(id) ?? []) for (const x of under.get(k)!) all.add(x);
    under.set(id, all);
  }
  const links = (a: string, b: string) => {
    const B = under.get(b)!;
    let n = 0;
    for (const x of under.get(a)!) for (const y of nb.get(x) ?? []) if (B.has(y)) n++;
    return n;
  };
  // siblings in a chain, each beside the one it is most linked to; one linked to the first is
  // kept for last, since round the hub the chain closes on itself
  for (const [u, ks] of kids) {
    if (ks.length < 3) continue;
    const chain = [ks[0]];
    const rest = ks.slice(1);
    while (rest.length) {
      const last = chain[chain.length - 1];
      let pick = 0;
      let most = -1;
      rest.forEach((k, i) => {
        const n = links(last, k);
        if (n > most) {
          most = n;
          pick = i;
        }
      });
      if (most === 0) {
        let fewest = Infinity;
        rest.forEach((k, i) => {
          const n = links(chain[0], k);
          if (n < fewest) {
            fewest = n;
            pick = i;
          }
        });
      }
      chain.push(rest.splice(pick, 1)[0]);
    }
    kids.set(u, chain);
  }
  const leaves = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const ks = kids.get(order[i]) ?? [];
    leaves.set(order[i], ks.length ? ks.reduce((s, k) => s + leaves.get(k)!, 0) : 1);
  }
  const angle = new Map<string, number>([[hub, -Math.PI / 2]]);
  const spans = new Map<string, [number, number]>();
  // the first idea out from the hub straight above it
  const first = (kids.get(hub) ?? [])[0];
  const lead = first ? (Math.PI * leaves.get(first)!) / leaves.get(hub)! : 0;
  spans.set(hub, [-Math.PI / 2 - lead, (3 * Math.PI) / 2 - lead]);
  for (const id of order) {
    const [a0, a1] = spans.get(id)!;
    if (id !== hub) angle.set(id, (a0 + a1) / 2);
    let a = a0;
    for (const k of kids.get(id) ?? []) {
      const span = ((a1 - a0) * leaves.get(k)!) / leaves.get(id)!;
      spans.set(k, [a, a + span]);
      a += span;
    }
  }

  const ext = (id: string, a: number, radial: boolean) => {
    const s = size.get(id)!;
    const c = Math.abs(Math.cos(a));
    const si = Math.abs(Math.sin(a));
    return radial ? (c * s.w) / 2 + (si * s.h) / 2 : (si * s.w) / 2 + (c * s.h) / 2;
  };
  const rad = new Map<string, number>([[hub, 0]]);
  const deepest = Math.max(...depth.values());
  for (let d = 1; d <= deepest; d++) {
    const on = order.filter((id) => depth.get(id) === d).sort((a, b) => angle.get(a)! - angle.get(b)!);
    const out = new Map(
      on.map((id) => {
        const p = parent.get(id)!;
        const a = angle.get(id)!;
        return [id, rad.get(p)! + ext(p, a, true) + ext(id, a, true) + room(p, id)];
      })
    );
    // where neighbours on the ring are close in angle, far enough out that their cards clear each other
    const crowd = new Map<string, number>(on.map((id) => [id, 0]));
    for (let i = 0; on.length > 1 && i < on.length; i++) {
      const a = on[i];
      const b = on[(i + 1) % on.length];
      let gap = angle.get(b)! - angle.get(a)!;
      if (i === on.length - 1) gap += 2 * Math.PI;
      if (gap >= Math.PI) continue;
      const need = (ext(a, angle.get(a)!, false) + ext(b, angle.get(b)!, false) + CONCEPT_GAP + 4) / (2 * Math.sin(Math.max(gap, 1e-3) / 2));
      crowd.set(a, Math.max(crowd.get(a)!, need));
      crowd.set(b, Math.max(crowd.get(b)!, need));
    }
    // a crowded ring is not let fly off: the passes below settle what is left
    for (const id of on) rad.set(id, Math.max(out.get(id)!, Math.min(crowd.get(id)!, out.get(id)! + 260)));
  }
  const box = new Map<string, Box>();
  for (const id of order) {
    const r = rad.get(id)!;
    const a = angle.get(id)!;
    box.set(id, { x: r * Math.cos(a), y: r * Math.sin(a), ...size.get(id)! });
  }
  // push apart what is too close, along whichever way is the shorter way out; the hub stays put
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = box.get(order[i])!;
        const b = box.get(order[j])!;
        if (!overlaps(a, b, CONCEPT_GAP)) continue;
        const ox = (a.w + b.w) / 2 + CONCEPT_GAP - Math.abs(a.x - b.x) + 0.5;
        const oy = (a.h + b.h) / 2 + CONCEPT_GAP - Math.abs(a.y - b.y) + 0.5;
        const split = order[i] === hub ? [0, 1] : [0.5, 0.5];
        if (ox < oy) {
          const s = b.x > a.x || (b.x === a.x && j % 2 === 0) ? 1 : -1;
          a.x -= s * ox * split[0];
          b.x += s * ox * split[1];
        } else {
          const s = b.y > a.y || (b.y === a.y && j % 2 === 0) ? 1 : -1;
          a.y -= s * oy * split[0];
          b.y += s * oy * split[1];
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  // the guarantee: each idea, in turn, outward from the hub until it is clear of all before it
  for (let k = 1; k < order.length; k++) {
    const b = box.get(order[k])!;
    let ux = b.x;
    let uy = b.y;
    if (Math.hypot(ux, uy) < 1e-6) {
      const a = angle.get(order[k]) ?? 0;
      ux = Math.cos(a);
      uy = Math.sin(a);
    }
    const u = Math.hypot(ux, uy);
    for (let step = 0; step < 2000 && order.slice(0, k).some((id) => overlaps(box.get(id)!, b, CONCEPT_GAP)); step++) {
      b.x += (ux / u) * 10;
      b.y += (uy / u) * 10;
    }
  }
  return box;
}

/**
 * A CONCEPT MAP. The most connected idea at the centre (a question breaks a
 * tie, then an idea marked as a concept, then the map's order), the rest in
 * rings by how many links away they are, spread so that linked ideas sit
 * together, never closer than 20px. Every link is a line — straight, or bowed
 * apart where two ideas are linked more than once — with its link phrase at
 * its middle (or the relation in words, for a typed relation other than
 * 'relates'), arrowed unless it reads both ways (relates, conflicts,
 * equivalent_to). A separate cluster of linked ideas is laid out the same way
 * beside the first; ideas linked to nothing sit in a row beneath.
 */
export function layoutConcept(map: ThinkingMap, w: number, _h: number): Layout {
  const caption = captionOf('concept', 'How the ideas connect, in words.');
  const g = graphOf(map);
  if (!g.nodes.length) return { placed: [], connectors: [], caption, empty: 'A concept map appears when there are ideas to connect.' };
  const W = frameOf(w, FRAME_W);
  const nb = neighbours(g);
  const size = new Map(g.nodes.map((nd) => [nd.id, sizeOf(nd)]));
  const deg = (id: string) => nb.get(id)?.length ?? 0;
  const before = (a: string, b: string) => {
    const na = g.byId.get(a)!;
    const nbb = g.byId.get(b)!;
    return (
      deg(b) - deg(a) ||
      Number(nbb.type === 'question') - Number(na.type === 'question') ||
      Number(nbb.role === 'concept') - Number(na.role === 'concept') ||
      (g.order.get(a) ?? 0) - (g.order.get(b) ?? 0)
    );
  };
  // the clusters of linked ideas
  const seen = new Set<string>();
  const clusters: string[][] = [];
  const alone: string[] = [];
  for (const nd of g.nodes) {
    if (seen.has(nd.id)) continue;
    const list = [nd.id];
    seen.add(nd.id);
    for (let i = 0; i < list.length; i++) for (const v of nb.get(list[i]) ?? []) if (!seen.has(v)) {
      seen.add(v);
      list.push(v);
    }
    if (list.length > 1) clusters.push(list);
    else alone.push(nd.id);
  }
  const hubOf = (c: string[]) => [...c].sort(before)[0];
  // the cluster with the most connected idea first, then the larger ones
  const main = clusters.length ? clusters.reduce((best, c) => (before(hubOf(c), hubOf(best)) < 0 ? c : best)) : null;
  const rest = clusters.filter((c) => c !== main).sort((a, b) => b.length - a.length || (g.order.get(hubOf(a)) ?? 0) - (g.order.get(hubOf(b)) ?? 0));
  const texts = new Map(g.edges.map((e) => [edgeKey(e), edgeText(e, true)]));
  // the room an idea leaves to the one it hangs from: enough for the words on the links between them
  const wordsBetween = new Map<string, number>();
  for (const e of g.edges) {
    const text = texts.get(edgeKey(e));
    if (!text) continue;
    const k = e.from < e.to ? `${e.from}\u0000${e.to}` : `${e.to}\u0000${e.from}`;
    wordsBetween.set(k, Math.max(wordsBetween.get(k) ?? 0, textW(text)));
  }
  const room = (a: string, b: string) => {
    const words = wordsBetween.get(a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
    return words ? clamp(words + 24, 48, 190) : 44;
  };
  const boxes = new Map<string, Box>();
  // each cluster laid out on its own, then set side by side, tops level, the main one first
  let right = 0;
  for (const c of main ? [main, ...rest] : []) {
    const local = radialCluster(c, hubOf(c), g, nb, size, room);
    const b = boundsOf([...local.values()]);
    const sx = (boxes.size ? right + 90 : 0) - b.x0;
    for (const [id, bx] of local) boxes.set(id, { ...bx, x: bx.x + sx, y: bx.y - b.y0 });
    right = boundsOf([...boxes.values()]).x1;
  }
  if (alone.length) {
    const b = boundsOf([...boxes.values()]);
    const row = rowBeneath(alone.map((id) => size.get(id)!), boxes.size ? b.x0 : 0, boxes.size ? b.y1 + 60 : 0, Math.max(boxes.size ? b.x1 - b.x0 : 0, W - 2 * PAD));
    alone.forEach((id, i) => boxes.set(id, row[i]));
  }
  const { dx, dy } = settle(boundsOf([...boxes.values()]), W);
  for (const [id, b] of boxes) boxes.set(id, { ...b, x: b.x + dx, y: b.y + dy });
  const aloneIds = new Set(alone);
  const placed: Placed[] = g.nodes.map((nd) => {
    const shape = diagramShapeFor(nd, 'concept');
    return cardAt(nd, boxes.get(nd.id)!, { ...(shape ? { shape } : {}), ...(aloneIds.has(nd.id) ? { loose: true } : {}) });
  });

  // every link: straight, or bowed apart where the same two ideas are linked more than once
  const pairs = new Map<string, LogosEdge[]>();
  for (const e of g.edges) {
    const k = [e.from, e.to].sort().join('\u0000');
    const list = pairs.get(k);
    if (list) list.push(e);
    else pairs.set(k, [e]);
  }
  const cards = [...boxes.values()];
  const labels: Box[] = [];
  const connectors: Connector[] = [];
  for (const e of g.edges) {
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    const arrow = directed(e.relation);
    const twins = pairs.get([e.from, e.to].sort().join('\u0000'))!;
    const k = twins.indexOf(e);
    // the bend is measured one way for the pair, whichever way each edge runs
    const [p, q] = e.from < e.to ? [a, b] : [b, a];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const bend = (k - (twins.length - 1) / 2) * 34;
    const mx = (a.x + b.x) / 2 + nx * bend * 2;
    const my = (a.y + b.y) / 2 + ny * bend * 2;
    const [sx, sy] = bend ? edgePoint(a, mx, my, 2) : edgePoint(a, b.x, b.y, 2);
    const [ex, ey] = bend ? edgePoint(b, mx, my, arrow ? 5 : 2) : edgePoint(b, a.x, a.y, arrow ? 5 : 2);
    const path = bend ? `M ${pt(sx, sy)} Q ${pt(mx, my)} ${pt(ex, ey)}` : `M ${pt(sx, sy)} L ${pt(ex, ey)}`;
    const text = texts.get(edgeKey(e));
    let lx = (sx + ex) / 2;
    let ly = (sy + ey) / 2;
    if (bend) [lx, ly] = quadAt(sx, sy, mx, my, ex, ey, 0.5);
    if (text) {
      // the words at the middle of the line, or a little along it where the middle is taken
      for (const t of [0.5, 0.4, 0.6, 0.32, 0.68]) {
        const [cx, cy] = bend ? quadAt(sx, sy, mx, my, ex, ey, t) : [sx + (ex - sx) * t, sy + (ey - sy) * t];
        const lb = labelBox(cx, cy, text);
        if (!cards.some((c) => overlaps(c, lb, 2)) && !labels.some((o) => overlaps(o, lb, 2))) {
          lx = cx;
          ly = cy;
          break;
        }
      }
      labels.push(labelBox(lx, ly, text));
    }
    connectors.push(connectorOf(e, path, { ...(arrow ? { arrow } : {}), ...withLabel(text, lx, ly) }));
  }
  return { placed, connectors, caption };
}

// ═════════════════════════════════════════════════════════════════════
// THE DATED TIMELINE
// ═════════════════════════════════════════════════════════════════════

/** the least distance between two dots on the axis */
const DOT_GAP = 26;
/** clear space between two cards on the same side of the axis */
const SAME_SIDE_GAP = 24;
/** from the axis to the nearest edge of a card: room for the date on the other side */
const TICK = 40;
/** how far a stretched axis may misplace an event, as a share of its length, and still read as in proportion */
const DISTORTION = 0.1;

/**
 * A DATED TIMELINE. When two or more nodes carry a time label that reads (see
 * timeKey — in the kind most of them are written in), they go along an axis in
 * time order, in proportion to the time between them where the spread allows:
 * close events are nudged apart only as far as their cards need, and when
 * that would misplace them (a few events millennia apart from the rest) they
 * are evenly spaced instead. Cards alternate above and below the axis, each
 * a dot on it ('event') with a tick up or down to its card; the tick carries
 * the time label as written — lx the dot's x, ly putting the words on the far
 * side of the axis from the card, so they never sit on the tick.
 *
 * An undated node sits where its sequence puts it — after the latest dated
 * event that leads to it, or before the earliest it leads to — or, joined to
 * no dated event, after the dated ones, in sequence order. A detail rides on
 * the event it bears on. A sequence edge between neighbours on the axis runs
 * along it, between their dots. Any other edge between two cards on one side
 * arcs round the outside of the cards between them; one across the axis is a
 * gentle S, or — when that would run through a card — keeps to the clear
 * channel between the axis and the cards and crosses beside its far end.
 *
 * Null when fewer than two dates read: the caller draws layoutTimeline.
 */
export function layoutDatedTimeline(map: ThinkingMap, w: number, _h: number): Layout | null {
  const g = graphOf(map);
  const keys = new Map<string, TimeKey>();
  for (const nd of g.nodes) {
    const k = timeKey(nd.at);
    if (k) keys.set(nd.id, k);
  }
  const counts = new Map<TimeKind, number>();
  for (const k of keys.values()) counts.set(k.kind, (counts.get(k.kind) ?? 0) + 1);
  let kind: TimeKind | null = null;
  for (const k of ['calendar', 'ordinal', 'month', 'clock'] as TimeKind[]) if ((counts.get(k) ?? 0) > (kind ? counts.get(kind) ?? 0 : 0)) kind = k;
  if (!kind || (counts.get(kind) ?? 0) < 2) return null;
  const dated = new Set([...keys].filter(([, k]) => k.kind === kind).map(([id]) => id));
  const W = frameOf(w, FRAME_W);

  const hosts = new Set(g.nodes.filter((nd) => dated.has(nd.id) || !isDetailish(nd, g)).map((nd) => nd.id));
  const attached = detailsOn(g, hosts);
  const held = heldBy(attached);
  const events = g.nodes.filter((nd) => !held.has(nd.id));
  const eventIds = new Set(events.map((nd) => nd.id));
  const seq = orderSpine({ nodes: g.nodes, edges: g.edges }, eventIds).flat();
  const seqRank = new Map(seq.map((id, i) => [id, i]));
  const rank = (id: string) => seqRank.get(id) ?? seq.length + (g.order.get(id) ?? 0);
  const tOf = (id: string) => keys.get(id)!.order;
  const datedSorted = events
    .filter((nd) => dated.has(nd.id))
    .map((nd) => nd.id)
    .sort((a, b) => tOf(a) - tOf(b) || rank(a) - rank(b) || (g.order.get(a) ?? 0) - (g.order.get(b) ?? 0));
  const slot = new Map(datedSorted.map((id, i) => [id, i]));
  // where the sequence puts an undated event: after the latest dated event that leads to it, else before the earliest it leads to
  const next = new Map<string, string[]>();
  const prev = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!SEQUENCE_RELATIONS.has(e.relation) || !eventIds.has(e.from) || !eventIds.has(e.to)) continue;
    next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
    prev.set(e.to, [...(prev.get(e.to) ?? []), e.from]);
  }
  const reach = (start: string, step: Map<string, string[]>): string[] => {
    const out: string[] = [];
    const seenR = new Set([start]);
    for (let i = -1; i < out.length; i++) {
      for (const v of step.get(i < 0 ? start : out[i]) ?? []) if (!seenR.has(v)) {
        seenR.add(v);
        out.push(v);
      }
    }
    return out;
  };
  for (const nd of events) {
    if (dated.has(nd.id)) continue;
    const after = reach(nd.id, prev).filter((id) => slot.has(id) && dated.has(id)).map((id) => slot.get(id)!);
    const beforeIdx = reach(nd.id, next).filter((id) => slot.has(id) && dated.has(id)).map((id) => slot.get(id)!);
    slot.set(nd.id, after.length ? Math.max(...after) + 0.5 : beforeIdx.length ? Math.min(...beforeIdx) - 0.5 : datedSorted.length + 0.5);
  }
  const items = events
    .map((nd) => nd.id)
    .sort((a, b) => slot.get(a)! - slot.get(b)! || (dated.has(a) && dated.has(b) ? 0 : rank(a) - rank(b)) || (g.order.get(a) ?? 0) - (g.order.get(b) ?? 0));
  const N = items.length;
  const sz = items.map((id) => sizeOf(g.byId.get(id)!, attached));
  const isDated = items.map((id) => dated.has(id));
  // two apart, the cards share a side of the axis: they need their half-widths and a gap between them
  const sameSide = (i: number, j: number) => (sz[i].w + sz[j].w) / 2 + SAME_SIDE_GAP;
  let stepEven = DOT_GAP;
  for (let i = 0; i + 2 < N; i++) stepEven = Math.max(stepEven, sameSide(i, i + 2) / 2);
  const W0 = Math.max(420, W - 2 * PAD);
  const T = Math.max(W0, (N - 1) * stepEven);
  const dIdx = items.map((_, i) => i).filter((i) => isDated[i]);
  const t = (i: number) => tOf(items[i]);
  const t0 = t(dIdx[0]);
  const spanT = t(dIdx[dIdx.length - 1]) - t0;

  const ideal = (scale: number): number[] => {
    const out = items.map((_, i) => (isDated[i] ? (t(i) - t0) * scale : NaN));
    for (let i = 0; i < N; i++) {
      if (isDated[i]) continue;
      let a = i - 1;
      while (a >= 0 && !isDated[a]) a--;
      let b = i + 1;
      while (b < N && !isDated[b]) b++;
      if (a >= 0 && b < N) out[i] = out[a] + ((i - a) / (b - a)) * (out[b] - out[a]);
      else if (a >= 0) out[i] = out[a] + (i - a) * stepEven;
      else out[i] = out[b] - (b - i) * stepEven;
    }
    return out;
  };
  // never closer than the dots and the cards allow, pushing later events along where needed
  const packed = (want: number[]): number[] => {
    const xs = want.slice();
    for (let i = 1; i < N; i++) {
      xs[i] = Math.max(xs[i], xs[i - 1] + DOT_GAP);
      if (i >= 2) xs[i] = Math.max(xs[i], xs[i - 2] + sameSide(i - 2, i));
    }
    return xs;
  };
  const misplaced = (xs: number[]): number => {
    const a = xs[dIdx[0]];
    const b = xs[dIdx[dIdx.length - 1]];
    if (!(b - a > 0) || !(spanT > 0)) return Infinity;
    let worst = 0;
    for (const i of dIdx) worst = Math.max(worst, Math.abs((xs[i] - a) / (b - a) - (t(i) - t0) / spanT));
    return worst;
  };
  let xs: number[] | null = null;
  if (spanT > 0) {
    for (const stretch of [1, 1.25, 1.5625]) {
      const tryXs = packed(ideal((T * stretch) / spanT));
      if (misplaced(tryXs) <= DISTORTION) {
        xs = tryXs;
        break;
      }
    }
  }
  if (!xs) {
    const step = Math.min(Math.max(stepEven, W0 / Math.max(1, N - 1)), Math.max(stepEven, 230));
    xs = packed(items.map((_, i) => i * step));
  }
  const above = (i: number) => i % 2 === 0;
  const highest = Math.max(0, ...sz.filter((_, i) => above(i)).map((s) => s.h));
  const axis = highest + TICK;
  const boxes: Box[] = items.map((_, i) => ({ x: xs![i], y: above(i) ? axis - TICK - sz[i].h / 2 : axis + TICK + sz[i].h / 2, ...sz[i] }));
  const { dx, dy } = settle(boundsOf(boxes), W);
  for (const b of boxes) {
    b.x += dx;
    b.y += dy;
  }
  const ay = axis + dy;
  const box = new Map(items.map((id, i) => [id, boxes[i]]));
  const posOf = new Map(items.map((id, i) => [id, i]));
  const placed: Placed[] = items.map((id, i) => {
    const nd = g.byId.get(id)!;
    return cardAt(nd, boxes[i], { shape: 'event', ...(attached.get(id)?.length ? { attached: attached.get(id) } : {}) });
  });
  const x0 = boxes[0].x;
  const x1 = boxes[N - 1].x;
  const connectors: Connector[] = [{ key: 'timeline-axis', path: `M ${pt(x0 - 24, ay)} L ${pt(x1 + 30, ay)}`, relation: 'precedes', arrow: true }];
  items.forEach((id, i) => {
    const b = boxes[i];
    const at = isDated[i] ? tidyText(String(g.byId.get(id)!.at ?? ''), 24) : '';
    connectors.push({
      key: `tick~${id}`,
      to: id,
      path: `M ${pt(b.x, ay)} L ${pt(b.x, above(i) ? b.y + b.h / 2 : b.y - b.h / 2)}`,
      relation: 'part_of',
      ...(at ? { label: at, lx: r1(b.x), ly: r1(above(i) ? ay + 26 : ay - 1) } : {}),
    });
  });
  const alongAxis = (e: LogosEdge) => SEQUENCE_RELATIONS.has(e.relation) && posOf.get(e.to) === posOf.get(e.from)! + 1;
  const lanes = lanesOf(g.edges.filter((e) => box.has(e.from) && box.has(e.to) && !alongAxis(e)));
  for (const e of g.edges) {
    const a = box.get(e.from);
    const b = box.get(e.to);
    if (!a || !b) continue;
    const arrow = directed(e.relation);
    const text = edgeText(e);
    if (alongAxis(e)) {
      // neighbours in order: along the axis, dot to dot
      const sx = a.x + 5;
      const ex = b.x - 7;
      connectors.push(connectorOf(e, `M ${pt(sx, ay)} L ${pt(Math.max(ex, sx + 1), ay)}`, { arrow: true, ...withLabel(text, (sx + ex) / 2, ay - 1) }));
      continue;
    }
    const { lane, t } = lanes.get(edgeKey(e)) ?? { lane: 0, t: 0.5 };
    const i = posOf.get(e.from)!;
    const j = posOf.get(e.to)!;
    if (above(i) === above(j)) {
      // both on one side of the axis: an arc round the outside of every card on that side between them
      const out = above(i) ? -1 : 1;
      let edge = out < 0 ? Infinity : -Infinity;
      for (let k = Math.min(i, j); k <= Math.max(i, j); k++) {
        if (above(k) !== above(i)) continue;
        edge = out < 0 ? Math.min(edge, boxes[k].y - boxes[k].h / 2) : Math.max(edge, boxes[k].y + boxes[k].h / 2);
      }
      const peak = edge + out * (22 + Math.max(0, lane) * 12 + Math.max(0, -lane) * 6);
      const dir = b.x > a.x ? 1 : -1;
      const sx = a.x + dir * Math.min(a.w / 4, 30);
      const sy = a.y + (out * a.h) / 2;
      const ex = b.x - dir * Math.min(b.w / 4, 30);
      const ey = b.y + out * (b.h / 2 + (arrow ? 4 : 0));
      const cy = (peak - (sy + ey) / 8) / 0.75;
      connectors.push(connectorOf(e, `M ${pt(sx, sy)} C ${pt(sx, cy)} ${pt(ex, cy)} ${pt(ex, ey)}`, { ...(arrow ? { arrow } : {}), ...withLabel(text, (sx + ex) / 2, peak) }));
      continue;
    }
    const r = curveBetween(a, b, arrow, lane, t, text);
    // across the axis: the gentle S, unless it would run through a card on the way — then along
    // the clear channel between the axis and the cards on this side, over the axis beside the other
    const nums = numbersOf(r.d);
    const crosses = boxes.some((c) => c !== a && c !== b && bezierHits(nums, c));
    if (!crosses) {
      connectors.push(connectorOf(e, r.d, { ...(arrow ? { arrow } : {}), ...withLabel(text, r.mx, r.my) }));
      continue;
    }
    const side = above(i) ? -1 : 1;
    const dir = b.x > a.x ? 1 : -1;
    const sx = a.x + dir * Math.min(a.w / 4, 24);
    const sy = a.y - (side * a.h) / 2;
    const ex = b.x - dir * Math.min(b.w / 4, 24);
    const ey = b.y + (side * b.h) / 2 + side * (arrow ? 4 : 0);
    const cy = ay + side * (TICK - 12 + lane * 6);
    const rr = Math.min(8, Math.abs(ex - sx) / 2);
    const path = `M ${pt(sx, sy)} L ${pt(sx, cy + side * rr)} Q ${pt(sx, cy)} ${pt(sx + dir * rr, cy)} L ${pt(ex - dir * rr, cy)} Q ${pt(ex, cy)} ${pt(ex, cy - side * rr)} L ${pt(ex, ey)}`;
    connectors.push(connectorOf(e, path, { ...(arrow ? { arrow } : {}), ...withLabel(text, (sx + ex) / 2, cy) }));
  }
  return { placed, connectors, caption: 'What happened, and when.' };
}
