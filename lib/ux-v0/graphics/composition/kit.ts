// lib/ux-v0/graphics/composition/kit.ts — what the families compose with, and the solver that holds them to the rules.
//
// A family (families-*.ts) is a procedure, not a layout: it reads its parameters, the frame and the content, and places
// the parts by relationship — "the words inside the circle", "the details in the corner opposite the mass", "the
// headline along the band". It composes with the blocks here (the headline fitted to a box, the details stacked, a
// figure of the style's own geometry, a line, a pattern, a picture cut to a shape), states the relationships it relied
// on (rel), and leaves the rules to the solver:
//
//   hard        every essential word inside the safe area and set in full (never cut, never under other words);
//               locked objects untouched (the editor keeps them; the solver never sees them move)
//   soft        figures that a relationship says must avoid the words moved off them; the empty region a plan asks
//               for kept clear of figures
//   aesthetic   edges within a step of each other aligned
//
// Conflicts resolve in that order, predictably: a soft rule never breaks a hard one. Everything deterministic: the
// same plan and seed draw the same design.

import { contrastRatio } from '../../../ux/audit';
import type { Ctx, Kit } from '../compose';
import { newId, type Node, type TextNode } from '../doc';
import { fitSize, layoutText } from '../text';
import { isPxParam, PATTERN_BY_KIND } from '../patterns';
import { hash32 } from '../styles/hash';
import { a3, details, ellipse, mix, on, pathNode, type Box } from '../styles/constructions-kit';
import { ARCH } from '../styles/constructions-kit';
import { FAMILY_BY_ID, type Anchor, type CompositionPlan, type Part, type Priority, type Relation, type RelationKind } from './schema';

export type { Box };

export interface Palette {
  ground: string;
  ink: string;
  accent: string;
  accent2: string;
  accent3: string;
  muted: string;
}

/** The context a family composes in. */
export interface CC {
  k: Kit;
  x: Ctx;
  plan: CompositionPlan;
  W: number;
  H: number;
  m: number;
  u: number;
  /** the safe area: where words and logos must stay */
  safe: Box;
  land: boolean;
  tall: boolean;
  /** the headline's scale as planned (0.8 quiet … 1.15 as large as the frame allows) */
  ts: number;
  /** density, experimentation and symmetry as planned, 0–1 */
  dens: number;
  exp: number;
  sym: number;
  pal: Palette;
  /** a parameter of the family, as planned */
  n: (key: string) => number;
  s: (key: string) => string;
  /** seeded, 0–1, for the plan's own variation */
  r: (salt: string | number) => number;
  between: (salt: string | number, lo: number, hi: number) => number;
  pick: <T>(salt: string | number, list: readonly T[]) => T;
  /** the palette's colours for figures, in a seeded order (never the ground) */
  paint: (i: number) => string;
  out: Node[];
  relations: Relation[];
  rel: (kind: RelationKind, a: Part, b?: Part, o?: { at?: Anchor; value?: number; priority?: Priority }) => void;
  images: string[];
  /** notes for the plan's record (what was done instead, when a family could not do something) */
  notes: string[];
}

export function makeCC(k: Kit, x: Ctx, plan: CompositionPlan): CC {
  const fam = FAMILY_BY_ID.get(plan.family);
  const defs = Object.fromEntries((fam?.params ?? []).map((p) => [p.key, p.def]));
  const r = (salt: string | number) => (hash32(`${plan.seed}|${plan.family}|${salt}`) % 10000) / 10000;
  const pal: Palette = { ground: x.ground, ink: x.ink, accent: x.accent, accent2: x.accent2, accent3: a3(x), muted: x.muted };
  const figurePaints = [pal.accent, pal.accent2, pal.accent3, pal.ink].filter((v, i, all) => all.indexOf(v) === i && contrastRatio(v, pal.ground) >= 1.15);
  const order = figurePaints.length ? figurePaints : [pal.ink];
  const off = Math.floor(r('paint-order') * order.length);
  const relations: Relation[] = [];
  return {
    k,
    x,
    plan,
    W: x.W,
    H: x.H,
    m: x.m,
    u: x.u,
    safe: { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H - x.m * 2 },
    land: x.W / x.H > 1.25,
    tall: x.H / x.W > 1.45,
    ts: 0.8 + (plan.typography.scale / 100) * 0.35,
    dens: plan.density / 100,
    exp: plan.experimentation / 100,
    sym: plan.symmetry / 100,
    pal,
    n: (key) => {
      const v = plan.params[key] ?? defs[key];
      return typeof v === 'number' ? v : Number(v) || 0;
    },
    s: (key) => String(plan.params[key] ?? defs[key] ?? ''),
    r,
    between: (salt, lo, hi) => lo + (hi - lo) * r(salt),
    pick: (salt, list) => list[Math.floor(r(salt) * list.length) % list.length],
    paint: (i) => order[(i + off) % order.length],
    out: [],
    relations,
    rel: (kind, a, b, o = {}) => void relations.push({ kind, a, ...(b ? { b } : {}), ...(o.at ? { at: o.at } : {}), ...(o.value !== undefined ? { value: Math.round(o.value * 1000) / 1000 } : {}), priority: o.priority ?? 'soft' }),
    images: [...x.brief.images],
    notes: [],
  };
}

// ── boxes and anchors ──

/** The point of a box an anchor names. */
export function pointOf(b: Box, a: Anchor): [number, number] {
  const fx = a[1] === 'l' ? 0 : a[1] === 'c' ? 0.5 : 1;
  const fy = a[0] === 't' ? 0 : a[0] === 'm' ? 0.5 : 1;
  return [b.x + b.w * fx, b.y + b.h * fy];
}

/** A box of size w × h placed at an anchor of an area (its matching corner or centre on the area's). */
export function placeAt(area: Box, a: Anchor, w: number, h: number): Box {
  const fx = a[1] === 'l' ? 0 : a[1] === 'c' ? 0.5 : 1;
  const fy = a[0] === 't' ? 0 : a[0] === 'm' ? 0.5 : 1;
  return { x: area.x + (area.w - w) * fx, y: area.y + (area.h - h) * fy, w, h };
}

/** A box cut in two across: the top `share` of it and the rest, a gap between. */
export function splitV(b: Box, share: number, gap = 0): [Box, Box] {
  const h = (b.h - gap) * share;
  return [
    { x: b.x, y: b.y, w: b.w, h },
    { x: b.x, y: b.y + h + gap, w: b.w, h: b.h - h - gap },
  ];
}
/** A box cut in two side by side: the left `share` of it and the rest, a gap between. */
export function splitH(b: Box, share: number, gap = 0): [Box, Box] {
  const w = (b.w - gap) * share;
  return [
    { x: b.x, y: b.y, w, h: b.h },
    { x: b.x + w + gap, y: b.y, w: b.w - w - gap, h: b.h },
  ];
}
/** The largest square in a box, at an anchor of it. */
export const squareIn = (b: Box, a: Anchor = 'mc'): Box => placeAt(b, a, Math.min(b.w, b.h), Math.min(b.w, b.h));
/** A box divided into rows × columns of cells, a gap between, read across then down. */
export function cells(b: Box, rows: number, cols: number, gap: number): Box[] {
  const cw = (b.w - gap * (cols - 1)) / cols;
  const rh = (b.h - gap * (rows - 1)) / rows;
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) out.push({ x: b.x + q * (cw + gap), y: b.y + r * (rh + gap), w: cw, h: rh });
  return out;
}
/** A box of a given centre and size. */
export const around = (cx: number, cy: number, w: number, h = w): Box => ({ x: cx - w / 2, y: cy - h / 2, w, h });
export const inset = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: Math.max(1, b.w - d * 2), h: Math.max(1, b.h - d * 2) });
export const overlaps = (a: Box, b: Box, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
export const opposite = (a: Anchor): Anchor => `${a[0] === 't' ? 'b' : a[0] === 'b' ? 't' : 'm'}${a[1] === 'l' ? 'r' : a[1] === 'r' ? 'l' : 'c'}` as Anchor;

// ── words ──

/** How tall a text really sets. */
export const setHeight = (c: CC, t: TextNode) => layoutText({ ...t, autoHeight: false }, c.x.measure).height;
/** How wide its widest line sets. */
export const setWidth = (c: CC, t: TextNode) => layoutText({ ...t, autoHeight: false }, c.x.measure).widest;

/** The widest single word of a text as set (what a box can never be narrower than). */
export function widestWord(c: CC, t: TextNode): number {
  const words = (t.case === 'upper' ? t.text.toUpperCase() : t.text).split(/\s+/).filter(Boolean);
  let w = 0;
  for (const word of words) w = Math.max(w, layoutText({ ...t, text: word, runs: undefined, w: 1e5, autoHeight: false }, c.x.measure).widest);
  return w;
}

/** A text set as large as its box allows (up to `max`), whatever its role: how a key figure or a big initial is sized. */
export function fitText(c: CC, t: TextNode, max = c.u * 40): TextNode {
  t.size = Math.max(c.k.minText(c.x), fitSize({ ...t, size: max }, c.x.measure, c.k.minText(c.x)) * 0.88);
  return t;
}

/**
 * The headline fitted to a box (as large as the box allows, the words exact), its box then trimmed to the lines it
 * sets and placed at the top, middle or bottom of the box it was given.
 */
export function headline(c: CC, box: Box, s: Partial<TextNode> = {}, o: { valign?: 'top' | 'middle' | 'bottom'; trim?: boolean } = {}): TextNode {
  const t = c.k.text(c.x, 'headline', c.x.brief.content.headline, box, s);
  if (o.trim !== false && !t.path && !t.vertical) {
    const h = Math.min(box.h, setHeight(c, t) + c.u * 0.6);
    t.y = o.valign === 'middle' ? box.y + (box.h - h) / 2 : o.valign === 'bottom' ? box.y + box.h - h : box.y;
    t.h = h;
  }
  return t;
}

/** The other words (subtitle, details, action, brand), stacked in a box (see styles/constructions-kit details). */
export function info(c: CC, box: Box, o: Parameters<typeof details>[3] = {}): Node[] {
  return details(c.k, c.x, box, o);
}

/** The details on one line, joined as the document reads them back ("12–28 March  ·  Lisbon"), or none. */
export function metaLine(c: CC, box: Box, s: Partial<TextNode> = {}): TextNode | null {
  const meta = c.k.metaLines(c.x);
  if (!meta.length) return null;
  const size = s.size ?? Math.max(c.k.minText(c.x), c.u * 2.3);
  const t = c.k.text(c.x, 'meta', meta.join('  ·  '), box, { size, autoHeight: true, ...s });
  t.h = Math.max(size * 1.3, setHeight(c, t));
  return t;
}

/** The words a text sets on a fill, readable there (the ink or the ground, pushed to 4.5:1). */
export const inkOn = (c: CC, fill: string) => on(c.x, fill);

/**
 * A palette colour the ink still reads on as large type (3.2:1), so a headline can cross from the ground onto the figure
 * in one colour; else a tint of the accent toward the ground that does; else the ground itself.
 */
export function fillForInk(c: CC, i = 0): string {
  const all = [c.pal.accent, c.pal.accent2, c.pal.accent3, c.pal.muted];
  const order = [...all.slice(i % all.length), ...all.slice(0, i % all.length)];
  const ok = order.find((f) => contrastRatio(f, c.pal.ink) >= 3.2 && contrastRatio(f, c.pal.ground) >= 1.25);
  if (ok) return ok;
  for (let k = 0.2; k <= 0.9; k += 0.1) {
    const t = mix(c.pal.accent, c.pal.ground, k);
    if (contrastRatio(t, c.pal.ink) >= 3.2) return t;
  }
  return c.pal.ground;
}

// ── figures ──

/** A figure of the style's own geometry (its i-th motif), else a plain one; in a box, in a paint. */
export function figure(c: CC, i: number, box: Box, paint: string | null, s: Record<string, unknown> = {}): Node {
  const motifs = c.x.vocab?.motifs ?? [];
  if (motifs.length) {
    const m = motifs[i % motifs.length];
    const params: Record<string, number> = { ...m.params };
    if ('seed' in params) params.seed = (c.plan.seed % 900) + 3 + i * 17;
    return c.k.primNode(c.x, 'motif', { kind: m.kind, params }, box, paint, { name: 'Figure', ...s });
  }
  const kinds = ['circle', 'triangle', 'diamond', 'hexagon', 'blob', 'semicircle'];
  const kind = kinds[(i + Math.floor(c.r('fallback') * kinds.length)) % kinds.length];
  if (kind === 'circle') return ellipse(c.x, box, paint, { name: 'Figure', ...s });
  if (kind === 'semicircle') return prim(c, 'sector', { start: 180, sweep: 180 }, box, paint, s);
  return prim(c, kind, kind === 'blob' ? { seed: (c.plan.seed % 900) + i * 7, lobes: 4, irregular: 45 } : {}, box, paint, s);
}

export const prim = (c: CC, kind: string, params: Record<string, number>, box: Box, paint: string | null, s: Record<string, unknown> = {}): Node =>
  c.k.primNode(c.x, 'motif', c.k.primOf(kind, params), box, paint, { name: kind[0].toUpperCase() + kind.slice(1).replace(/-/g, ' '), ...s });
export const rect = (c: CC, box: Box, fill: string | null, s: Record<string, unknown> = {}): Node => c.k.rect(c.x, 'motif', box, fill, s);
export const disc = (c: CC, box: Box, fill: string | null, s: Record<string, unknown> = {}): Node => ellipse(c.x, box, fill, s);
export const arch = (c: CC, box: Box, fill: string | null, s: Record<string, unknown> = {}): Node => pathNode(c.x, box, ARCH, fill, { name: 'Arch', ...s });

/** A straight line between two points (a rule turned to the angle, centred between them). */
export function line(c: CC, x1: number, y1: number, x2: number, y2: number, color: string, width = c.u * 0.35, s: Record<string, unknown> = {}): Node {
  const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const h = Math.max(2, width * 3);
  return {
    id: newId('s'),
    type: 'shape',
    shape: 'line',
    role: 'motif',
    name: 'Line',
    fill: null,
    stroke: { color, width: Math.max(0.5, width) },
    x: (x1 + x2) / 2 - len / 2,
    y: (y1 + y2) / 2 - h / 2,
    w: len,
    h,
    rotation: Math.round(deg * 100) / 100,
    opacity: 1,
    ...s,
  } as Node;
}

/** A procedural pattern: the style's own when it has one and none is named, else the generator named. */
/**
 * A generator's lengths in the design's units. The registry's defaults are set for a frame about a thousand wide, so a
 * tenth of each is a share of the short side (u); a family's `scale` multiplies the spacing, its other numbers are in u.
 */
export function unitParams(gen: string, params: Record<string, number> = {}): Record<string, number> {
  const spec = PATTERN_BY_KIND.get(gen);
  const base: Record<string, number> = Object.fromEntries((spec?.params ?? []).map((q) => [q.key, isPxParam(gen, q.key) ? q.def / 10 : q.def]));
  const { scale = 1, ...rest } = params;
  return { ...base, ...rest, ...(base.scale !== undefined ? { scale: Math.max(0.4, base.scale * scale) } : {}) };
}

/** A pattern over a box: the named generator, or the style's own (gen null); `params.scale` multiplies its spacing. */
export function pattern(c: CC, gen: string | null, box: Box, params: Record<string, number> = {}, inks: ('accent' | 'ink' | 'accent2' | 'muted' | 'line')[] = ['accent'], opacity = 1, s: Record<string, unknown> = {}): Node {
  const own = c.x.vocab?.pattern;
  if (!gen && own) {
    const mult = Math.min(2, Math.max(0.5, params.scale ?? 1));
    return c.k.patternNode(c.x, { ...own, params: { ...own.params, ...(own.params.scale !== undefined ? { scale: own.params.scale * mult } : {}) }, opacity: Math.min(own.opacity, opacity) }, box, { name: 'Pattern', ...s });
  }
  const g = gen ?? 'dots';
  return c.k.patternNode(c.x, c.k.pdef(g, unitParams(g, params), inks, opacity), box, { name: 'Pattern', ...s });
}

/** The full frame's own ground (the style's texture lands on it). */
export const ground = (c: CC, fill: string, s: Record<string, unknown> = {}): Node => c.k.rect(c.x, 'background', { x: 0, y: 0, w: c.W, h: c.H }, fill, { name: 'Ground', ...s });

// ── pictures ──

/** One of the designer's pictures in a box: cut to an ellipse, an arch or a primitive, a part of it cropped. */
export function photo(c: CC, i: number, box: Box, o: { mask?: 'ellipse' | 'arch' | string; crop?: { x: number; y: number; w: number; h: number }; s?: Record<string, unknown> } = {}): Node | null {
  const asset = c.images[i % Math.max(1, c.images.length)];
  if (!asset) return null;
  const s = o.s ?? {};
  if (o.mask === 'arch') {
    const cut = pathNode(c.x, { x: 0, y: 0, w: box.w, h: box.h }, ARCH, '#000000', { name: 'Cut' });
    return {
      id: newId('g'),
      type: 'group',
      name: 'Arched picture',
      mask: 'alpha',
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      rotation: 0,
      opacity: 1,
      children: [cut, { ...c.k.image(c.x, asset, { x: 0, y: 0, w: box.w, h: box.h }), name: 'Picture', ...(o.crop ? { crop: o.crop } : {}) }],
      ...s,
    } as Node;
  }
  if (o.mask && o.mask !== 'ellipse') return c.k.cutPicture(c.x, asset, c.k.primOf(o.mask, { seed: (c.plan.seed % 900) + 5 + i }), box, s);
  const img = c.k.image(c.x, asset, box, o.mask === 'ellipse' ? 'ellipse' : undefined);
  return { ...img, ...(o.crop ? { crop: o.crop } : {}), ...s } as Node;
}

// ── the solver ──

const ESSENTIAL = new Set(['headline', 'subhead', 'body', 'meta', 'cta', 'logo']);
const isText = (n: Node): n is TextNode => n.type === 'text';
const essential = (n: Node): n is TextNode => isText(n) && !!n.role && ESSENTIAL.has(n.role) && !n.decorative && !n.hidden;
const turned = (t: TextNode) => !!t.rotation || !!t.vertical || !!t.path;
const PRIORITY: Record<string, number> = { headline: 0, subhead: 1, meta: 2, body: 3, cta: 4, logo: 5 };

/** The box a node occupies on the frame, its turn included. */
export function footprint(n: Node): Box {
  const rot = ((n.rotation || 0) * Math.PI) / 180;
  if (!rot) return { x: n.x, y: n.y, w: n.w, h: n.h };
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const w = Math.abs(n.w * Math.cos(rot)) + Math.abs(n.h * Math.sin(rot));
  const h = Math.abs(n.w * Math.sin(rot)) + Math.abs(n.h * Math.cos(rot));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Where a text's words really are (its set lines, not its box). */
function wordsBox(c: CC, t: TextNode): Box {
  if (turned(t)) return footprint(t);
  const L = layoutText({ ...t, autoHeight: false }, c.x.measure);
  const w = Math.min(t.w, L.widest);
  const x = t.align === 'center' ? t.x + (t.w - w) / 2 : t.align === 'right' ? t.x + t.w - w : t.x;
  const h = Math.min(Math.max(t.h, L.height), L.height);
  const y = t.valign === 'middle' ? t.y + (t.h - h) / 2 : t.valign === 'bottom' ? t.y + t.h - h : t.y;
  return { x, y, w, h };
}

/**
 * The rules applied to what a family placed (see the head of this file). Returns the nodes, adjusted; every change is
 * a move or a smaller size, never a dropped word.
 */
/** What the hard rules could not settle, in words (an empty list is a plan that held): the feasibility of a plan. */
export function unresolved(c: CC, nodes: Node[]): string[] {
  const S = c.safe;
  const texts = nodes.filter(essential).filter((t) => !t.path);
  const out: string[] = [];
  for (const t of texts) {
    const b = turned(t) ? footprint(t) : wordsBox(c, t);
    if (b.x < S.x - 1 || b.y < S.y - 1 || b.x + b.w > S.x + S.w + 1 || b.y + b.h > S.y + S.h + 1) out.push(`${t.role} outside the safe area`);
    if (!turned(t) && layoutText({ ...t, autoHeight: false }, c.x.measure).brokenWord) out.push(`${t.role} breaks a word`);
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (overlaps(wordsBox(c, texts[i]), wordsBox(c, texts[j]), -c.u * 0.2)) out.push(`${texts[j].role} over ${texts[i].role}`);
  return out;
}

export function solve(c: CC, nodes: Node[]): Node[] {
  const S = c.safe;
  const texts = nodes.filter(essential);
  // hard: every essential word set in full inside the safe area (a turned text by its turned footprint)
  for (const t of texts) {
    if (t.path) continue;
    if (!turned(t)) {
      // the words fit their box: a box too small for them grows downward (autoHeight), else the size steps down
      const need = setHeight(c, t);
      if (need > t.h + 0.5) t.h = need;
      let guard = 0;
      while (setWidth(c, t) > t.w + 0.5 && t.size > c.k.minText(c.x) && guard++ < 12) t.size = Math.max(c.k.minText(c.x), t.size * 0.92);
      // never a word broken: a box narrower than its widest word at the smallest size widens about its alignment
      const wide = widestWord(c, t);
      if (wide > t.w + 0.5) {
        const grow = Math.min(S.w, wide + c.u * 0.5) - t.w;
        t.x -= t.align === 'center' ? grow / 2 : t.align === 'right' ? grow : 0;
        t.w += grow;
        t.h = Math.max(t.h, setHeight(c, t));
      }
      if (t.w > S.w) t.w = S.w;
      t.x = Math.max(S.x, Math.min(t.x, S.x + S.w - t.w));
      if (t.h > S.h) {
        let g2 = 0;
        while (setHeight(c, t) > S.h && t.size > c.k.minText(c.x) && g2++ < 16) t.size = Math.max(c.k.minText(c.x), t.size * 0.9);
        t.h = Math.min(S.h, setHeight(c, t) + c.u * 0.4);
      }
      t.y = Math.max(S.y, Math.min(t.y, S.y + S.h - t.h));
    } else {
      const f = footprint(t);
      const dx = f.x < S.x ? S.x - f.x : f.x + f.w > S.x + S.w ? S.x + S.w - (f.x + f.w) : 0;
      const dy = f.y < S.y ? S.y - f.y : f.y + f.h > S.y + S.h ? S.y + S.h - (f.y + f.h) : 0;
      t.x += dx;
      t.y += dy;
    }
  }
  // hard: no essential words over other essential words (the later in the reading order moves to the nearest free
  // band in its column, then steps down in size; never dropped)
  const ordered = texts.filter((t) => !t.path).sort((a, b) => (PRIORITY[a.role ?? ''] ?? 9) - (PRIORITY[b.role ?? ''] ?? 9));
  const placed: TextNode[] = [];
  for (const t of ordered) {
    let guard = 0;
    while (placed.some((p) => overlaps(wordsBox(c, p), wordsBox(c, t), c.u * 0.6)) && guard++ < 3) {
      const mine = wordsBox(c, t);
      const blockers = placed.map((p) => wordsBox(c, p));
      const fits = (y: number) => {
        const b = { ...mine, y };
        return y >= S.y && y + mine.h <= S.y + S.h && !blockers.some((o) => overlaps(o, b, c.u * 0.6));
      };
      let best: number | null = null;
      for (let d = c.u; d < c.H && best === null; d += c.u) {
        if (fits(mine.y + d)) best = mine.y + d;
        else if (fits(mine.y - d)) best = mine.y - d;
      }
      // no free band in its column: beside the blocker instead (right of it, else left), the smallest move across
      let across: number | null = null;
      if (best === null) {
        const free = (x: number) => x >= S.x - 0.5 && x + mine.w <= S.x + S.w + 0.5 && !blockers.some((o) => overlaps(o, { ...mine, x }, c.u * 0.6));
        const xs = blockers
          .flatMap((o) => [o.x + o.w + c.u * 1.2, o.x - c.u * 1.2 - mine.w])
          .filter(free)
          .sort((p, q) => Math.abs(p - mine.x) - Math.abs(q - mine.x));
        if (xs.length) across = xs[0];
      }
      if (best !== null) t.y += best - mine.y;
      else if (across !== null) t.x += across - mine.x;
      else if (!turned(t)) {
        t.size = Math.max(c.k.minText(c.x), t.size * 0.85);
        t.h = setHeight(c, t) + c.u * 0.4;
      } else break;
    }
    placed.push(t);
  }
  // soft: figures that must avoid the words moved off them (the smallest move, inside the frame)
  const avoid = c.relations.filter((r) => r.kind === 'avoid');
  if (avoid.length) {
    const words = texts.map((t) => wordsBox(c, t));
    for (const n of nodes) {
      if (n.type !== 'shape' || n.role !== 'motif' || n.decorative) continue;
      if (!avoid.some((r) => r.a === 'figure' || r.b === 'figure')) break;
      const f = footprint(n);
      const hit = words.find((w) => overlaps(w, f, c.u));
      if (!hit || f.w > c.W * 0.9 || f.h > c.H * 0.9) continue;
      const moves = [hit.y + hit.h + c.u - f.y, hit.y - c.u - (f.y + f.h), hit.x + hit.w + c.u - f.x, hit.x - c.u - (f.x + f.w)];
      const axis = [1, 1, 0, 0];
      const best = moves.map((d, i) => ({ d, i })).sort((p, q) => Math.abs(p.d) - Math.abs(q.d))[0];
      if (axis[best.i]) n.y += best.d;
      else n.x += best.d;
    }
  }
  // soft: the empty region a plan asks for, kept clear of small figures (they are left out; nothing else moves)
  const cleared = new Set<Node>();
  for (const r of c.relations.filter((q) => q.kind === 'negative-space' && q.at)) {
    const share = Math.max(0.15, Math.min(0.5, r.value ?? 0.3));
    const zone = placeAt({ x: 0, y: 0, w: c.W, h: c.H }, r.at!, c.W * share, c.H * share);
    for (const n of nodes) {
      if (n.type !== 'shape' || n.role !== 'motif') continue;
      const f = footprint(n);
      if (f.w > c.W * 0.5 || f.h > c.H * 0.5 || !overlaps(zone, f)) continue;
      cleared.add(n);
    }
  }
  if (cleared.size) nodes = nodes.filter((n) => !cleared.has(n));
  // aesthetic: left edges within a step of the headline's aligned to it
  const head = texts.find((t) => t.role === 'headline' && !turned(t));
  if (head) for (const t of texts) if (t !== head && !turned(t) && t.align === 'left' && head.align === 'left' && Math.abs(t.x - head.x) < c.u * 1.6) t.x = head.x;
  return nodes;
}
