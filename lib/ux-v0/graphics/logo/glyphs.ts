// lib/ux-v0/graphics/logo/glyphs.ts — constructed lettering: a geometric alphabet drawn as stroke skeletons, so a
// wordmark can be custom letters rather than a name typed in a font. Each letter is a set of strokes (lines, arcs,
// curves) on a cap-height grid; a lettering style sets the weight, the width, the terminals, the slant and the
// spacing; round letters overshoot the cap and baseline a little (as drawn letters must, to look the same size);
// spacing is optical (a round side sits closer than a straight one, diagonals tuck under each other) with kerning by
// side class and by pair; and a modification makes the word its own (a cut through it, two letters joined, a swash, a
// letter lifted off the baseline, one letter in the accent, an inline). Letters come out as editable Bézier paths
// (anchors and handles: the centrelines a stroke draws), so the person can move any node. The word is built from its
// exact spelling and can be checked letter by letter; a character the alphabet does not draw is said, and the word is
// then set in a licensed typeface instead.

import { arcNodes, type BezierPath, type BNode, type Subpath } from '../geometry';

type P2 = [number, number];
type GStroke = { kind: 'line'; a: P2; b: P2 } | { kind: 'arc'; c: P2; rx: number; ry: number; a0: number; a1: number } | { kind: 'cubic'; p0: P2; p1: P2; p2: P2; p3: P2 } | { kind: 'dot'; c: P2 };
type Cls = 'v' | 'o' | 'd' | 'a';

interface Glyph {
  /** width in cap-height units, before the style's width (0: a single stem) */
  w: number;
  /** its strokes, in runs: the strokes of a run are drawn end to end as one path */
  runs: GStroke[][];
  /** the classes of its two sides, for spacing: v a straight stem, o round, d diagonal, a an open arm */
  side: [Cls, Cls];
  round?: boolean;
  /** where its counter is (a closed or nearly closed space), in glyph units, for letter symbols */
  counter?: P2;
}

const L = (x1: number, y1: number, x2: number, y2: number): GStroke => ({ kind: 'line', a: [x1, y1], b: [x2, y2] });
const A = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): GStroke => ({ kind: 'arc', c: [cx, cy], rx, ry, a0, a1 });
const C = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): GStroke => ({ kind: 'cubic', p0: [x0, y0], p1: [x1, y1], p2: [x2, y2], p3: [x3, y3] });
const D = (cx: number, cy: number): GStroke => ({ kind: 'dot', c: [cx, cy] });
const poly = (...pts: number[]): GStroke[] => {
  const out: GStroke[] = [];
  for (let i = 0; i + 3 < pts.length; i += 2) out.push(L(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
  return out;
};

/** Geometric capitals, figures and a few marks (y downward: 0 the cap line, 1 the baseline). */
const GLYPHS: Record<string, Glyph> = {
  A: { w: 0.9, runs: [poly(0, 1, 0.45, 0, 0.9, 1), [L(0.19, 0.64, 0.71, 0.64)]], side: ['d', 'd'], counter: [0.45, 0.42] },
  B: { w: 0.66, runs: [[L(0, 0, 0, 1)], [L(0, 0, 0.36, 0), A(0.36, 0.24, 0.24, 0.24, -90, 90), L(0.36, 0.48, 0, 0.48)], [L(0, 0.48, 0.4, 0.48), A(0.4, 0.74, 0.26, 0.26, -90, 90), L(0.4, 1, 0, 1)]], side: ['v', 'o'], counter: [0.28, 0.24] },
  C: { w: 0.86, runs: [[A(0.5, 0.5, 0.5, 0.5, -42, -318)]], side: ['o', 'a'], round: true, counter: [0.5, 0.5] },
  D: { w: 0.8, runs: [[L(0, 0, 0, 1)], [L(0, 0, 0.3, 0), A(0.3, 0.5, 0.5, 0.5, -90, 90), L(0.3, 1, 0, 1)]], side: ['v', 'o'], round: true, counter: [0.38, 0.5] },
  E: { w: 0.6, runs: [poly(0.6, 0, 0, 0, 0, 1, 0.6, 1), [L(0, 0.5, 0.5, 0.5)]], side: ['v', 'a'] },
  F: { w: 0.56, runs: [poly(0.56, 0, 0, 0, 0, 1), [L(0, 0.5, 0.46, 0.5)]], side: ['v', 'a'] },
  G: { w: 0.9, runs: [[A(0.45, 0.5, 0.45, 0.5, -40, -360)], [L(0.9, 0.5, 0.5, 0.5)]], side: ['o', 'o'], round: true, counter: [0.42, 0.5] },
  H: { w: 0.76, runs: [[L(0, 0, 0, 1)], [L(0.76, 0, 0.76, 1)], [L(0, 0.5, 0.76, 0.5)]], side: ['v', 'v'] },
  I: { w: 0, runs: [[L(0, 0, 0, 1)]], side: ['v', 'v'] },
  J: { w: 0.5, runs: [[L(0.5, 0, 0.5, 0.72), A(0.25, 0.72, 0.25, 0.28, 0, 180)]], side: ['a', 'v'] },
  K: { w: 0.7, runs: [[L(0, 0, 0, 1)], [L(0.7, 0, 0, 0.62)], [L(0.25, 0.42, 0.72, 1)]], side: ['v', 'd'] },
  L: { w: 0.54, runs: [poly(0, 0, 0, 1, 0.54, 1)], side: ['v', 'a'] },
  M: { w: 0.96, runs: [poly(0, 1, 0, 0, 0.48, 0.72, 0.96, 0, 0.96, 1)], side: ['v', 'v'] },
  N: { w: 0.78, runs: [poly(0, 1, 0, 0, 0.78, 1, 0.78, 0)], side: ['v', 'v'] },
  O: { w: 1, runs: [[A(0.5, 0.5, 0.5, 0.5, 0, 360)]], side: ['o', 'o'], round: true, counter: [0.5, 0.5] },
  P: { w: 0.66, runs: [[L(0, 1, 0, 0), L(0, 0, 0.36, 0), A(0.36, 0.27, 0.27, 0.27, -90, 90), L(0.36, 0.54, 0, 0.54)]], side: ['v', 'o'], counter: [0.3, 0.27] },
  Q: { w: 1, runs: [[A(0.5, 0.5, 0.5, 0.5, 0, 360)], [L(0.62, 0.66, 1, 1.04)]], side: ['o', 'o'], round: true, counter: [0.5, 0.5] },
  R: { w: 0.68, runs: [[L(0, 1, 0, 0), L(0, 0, 0.36, 0), A(0.36, 0.27, 0.27, 0.27, -90, 90), L(0.36, 0.54, 0, 0.54)], [L(0.32, 0.54, 0.68, 1)]], side: ['v', 'd'], counter: [0.3, 0.27] },
  S: { w: 0.64, runs: [[A(0.32, 0.25, 0.3, 0.25, -30, -270), A(0.32, 0.75, 0.32, 0.25, -90, 150)]], side: ['o', 'o'], round: true },
  T: { w: 0.72, runs: [[L(0, 0, 0.72, 0)], [L(0.36, 0, 0.36, 1)]], side: ['a', 'a'] },
  U: { w: 0.76, runs: [[L(0, 0, 0, 0.62), A(0.38, 0.62, 0.38, 0.38, 180, 0), L(0.76, 0.62, 0.76, 0)]], side: ['v', 'v'], counter: [0.38, 0.5] },
  V: { w: 0.84, runs: [poly(0, 0, 0.42, 1, 0.84, 0)], side: ['d', 'd'] },
  W: { w: 1.24, runs: [poly(0, 0, 0.3, 1, 0.62, 0.24, 0.94, 1, 1.24, 0)], side: ['d', 'd'] },
  X: { w: 0.8, runs: [[L(0, 0, 0.8, 1)], [L(0.8, 0, 0, 1)]], side: ['d', 'd'] },
  Y: { w: 0.8, runs: [poly(0, 0, 0.4, 0.52, 0.8, 0), [L(0.4, 0.52, 0.4, 1)]], side: ['d', 'd'] },
  Z: { w: 0.7, runs: [poly(0, 0, 0.7, 0, 0, 1, 0.7, 1)], side: ['a', 'a'] },
  '0': { w: 0.66, runs: [[A(0.33, 0.5, 0.33, 0.5, 0, 360)]], side: ['o', 'o'], round: true, counter: [0.33, 0.5] },
  '1': { w: 0.36, runs: [poly(0.04, 0.2, 0.32, 0, 0.32, 1)], side: ['a', 'v'] },
  '2': { w: 0.62, runs: [[A(0.31, 0.27, 0.29, 0.27, 200, 360), L(0.6, 0.27, 0, 1), L(0, 1, 0.62, 1)]], side: ['o', 'a'] },
  '3': { w: 0.62, runs: [[A(0.3, 0.25, 0.28, 0.25, 200, 450), A(0.3, 0.75, 0.32, 0.25, 270, 510)]], side: ['o', 'o'], round: true },
  '4': { w: 0.7, runs: [poly(0.5, 1, 0.5, 0, 0, 0.68, 0.7, 0.68)], side: ['a', 'v'] },
  '5': { w: 0.62, runs: [[L(0.6, 0, 0.1, 0), L(0.1, 0, 0.073, 0.507), A(0.31, 0.7, 0.31, 0.3, 220, 500)]], side: ['v', 'o'] },
  '6': { w: 0.64, runs: [[A(0.32, 0.68, 0.32, 0.32, 0, 360)], [C(0.02, 0.62, 0.04, 0.24, 0.26, 0, 0.56, 0.04)]], side: ['o', 'o'], round: true, counter: [0.32, 0.68] },
  '7': { w: 0.62, runs: [poly(0, 0, 0.62, 0, 0.18, 1)], side: ['a', 'd'] },
  '8': { w: 0.62, runs: [[A(0.31, 0.25, 0.25, 0.25, 0, 360)], [A(0.31, 0.74, 0.31, 0.26, 0, 360)]], side: ['o', 'o'], round: true },
  '9': { w: 0.64, runs: [[A(0.32, 0.32, 0.32, 0.32, 0, 360)], [C(0.62, 0.38, 0.6, 0.76, 0.38, 1, 0.08, 0.96)]], side: ['o', 'o'], round: true, counter: [0.32, 0.32] },
  '&': {
    w: 0.78,
    runs: [
      [
        C(0.76, 1, 0.5, 0.72, 0.1, 0.44, 0.12, 0.22),
        C(0.12, 0.22, 0.13, 0.06, 0.24, 0, 0.34, 0),
        C(0.34, 0, 0.46, 0, 0.56, 0.12, 0.5, 0.26),
        C(0.5, 0.26, 0.44, 0.4, 0.04, 0.54, 0.04, 0.76),
        C(0.04, 0.76, 0.04, 0.92, 0.18, 1, 0.34, 1),
        C(0.34, 1, 0.54, 1, 0.68, 0.84, 0.76, 0.58),
      ],
    ],
    side: ['o', 'd'],
  },
  '.': { w: 0, runs: [[D(0, 1)]], side: ['v', 'v'] },
  '-': { w: 0.3, runs: [[L(0, 0.58, 0.3, 0.58)]], side: ['a', 'a'] },
  "'": { w: 0, runs: [[L(0, 0, 0, 0.22)]], side: ['v', 'v'] },
  '!': { w: 0, runs: [[L(0, 0, 0, 0.68)], [D(0, 1)]], side: ['v', 'v'] },
  ' ': { w: 0.36, runs: [], side: ['v', 'v'] },
};

/** Kerning by the classes of the two facing sides (cap-height units): rounds close up, diagonals tuck in. */
const KERN: Record<string, number> = { vv: 0, vo: -0.02, ov: -0.02, oo: -0.05, vd: -0.02, dv: -0.02, dd: -0.12, od: -0.05, do: -0.05, aa: -0.04, ao: -0.08, oa: -0.04, ad: -0.1, da: -0.08, av: -0.02, va: -0.02 };
/** Pairs that need more than their classes give (the arm of an L over a diagonal, a T over a round). */
const PAIRS: Record<string, number> = { LT: -0.1, LV: -0.1, LW: -0.08, LY: -0.1, TA: -0.08, AT: -0.08, AV: -0.04, VA: -0.04, AW: -0.03, WA: -0.03, AY: -0.04, YA: -0.04, FA: -0.06, PA: -0.06, TO: -0.04, OT: -0.04 };

export interface LetteringStyle {
  /** stroke weight, a share of the cap height (0.06 hairline … 0.22 heavy) */
  weight: number;
  /** horizontal scale (0.75 condensed … 1.3 extended) */
  width: number;
  /** spacing factor (0.6 tight … 2.4 wide) */
  tracking: number;
  terminal: 'round' | 'square' | 'butt';
  join: 'round' | 'miter';
  /** degrees of slant (positive leans right) */
  slant: number;
}

import { MODIFICATIONS, type ModificationKind } from './constants';
export { MODIFICATIONS, type ModificationKind };
export type Modification =
  | { kind: 'none' }
  | { kind: 'cut'; at: number; angle: number }
  | { kind: 'ligature'; at: number; height: 'cap' | 'base' }
  | { kind: 'swash' }
  | { kind: 'lift'; at: number }
  | { kind: 'accent'; at: number }
  | { kind: 'inline' };

export interface Letter {
  ch: string;
  /** the letter's centrelines as an editable path, in the word's coordinates (cap height = the word's height) */
  path: BezierPath;
  x: number;
  w: number;
  dots: P2[];
}
export interface Lettered {
  letters: Letter[];
  /** extra strokes the modification adds (a ligature bar, a swash), in the same weight */
  extras: { name: string; path: BezierPath }[];
  /** a cut through the word (a band in the word's coordinates), drawn as a mask that hides */
  cut: { x: number; y: number; w: number; h: number; angle: number } | null;
  /** the index of a letter set in the accent */
  accent: number | null;
  /** an inline: a thin line of the ground drawn inside each stroke */
  inline: boolean;
  width: number;
  height: number;
  strokeWidth: number;
  /** characters the alphabet cannot draw (the word is then set in a typeface instead) */
  missing: string[];
  /** the text as given */
  text: string;
  /** the characters drawn, in order (the spelling check compares this with the text, in capitals) */
  spelled: string;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rad = (d: number) => (d * Math.PI) / 180;

/** A run of strokes as subpaths of editable nodes (joined end to end where they meet), mapped by an affine map. */
function runToSubs(run: readonly GStroke[], map: (p: P2) => P2): Subpath[] {
  const subs: Subpath[] = [];
  let cur: BNode[] = [];
  let last: P2 | null = null;
  const mapNode = (nd: BNode): BNode => {
    const [x, y] = map([nd.x, nd.y]);
    const o: BNode = { x: r3(x), y: r3(y) };
    if (nd.in) o.in = map(nd.in).map(r3) as P2;
    if (nd.out) o.out = map(nd.out).map(r3) as P2;
    if (nd.smooth) o.smooth = true;
    return o;
  };
  const flush = () => {
    if (cur.length > 1) subs.push({ closed: false, nodes: cur });
    cur = [];
  };
  for (const s of run) {
    if (s.kind === 'dot') continue;
    const nodes: BNode[] =
      s.kind === 'line'
        ? [
            { x: s.a[0], y: s.a[1] },
            { x: s.b[0], y: s.b[1] },
          ]
        : s.kind === 'arc'
          ? arcNodes(s.c[0], s.c[1], s.rx, s.ry, rad(s.a0), rad(s.a1))
          : [
              { x: s.p0[0], y: s.p0[1], out: s.p1 },
              { x: s.p3[0], y: s.p3[1], in: s.p2 },
            ];
    const gap = last ? Math.hypot(nodes[0].x - last[0], nodes[0].y - last[1]) : Infinity;
    if (cur.length && gap < 1e-3) {
      // the stroke continues the last: its first node merges into the last node (keeping both handles)
      const m = mapNode(nodes[0]);
      if (m.out) cur[cur.length - 1].out = m.out;
      cur.push(...nodes.slice(1).map(mapNode));
    } else if (cur.length && gap < 0.06) cur.push(...nodes.map(mapNode));
    else {
      flush();
      cur = nodes.map(mapNode);
    }
    last = [nodes[nodes.length - 1].x, nodes[nodes.length - 1].y];
  }
  flush();
  // a run that ends where it starts (a whole round) is closed
  for (const sp of subs) {
    const a = sp.nodes[0];
    const b = sp.nodes[sp.nodes.length - 1];
    if (sp.nodes.length > 2 && Math.hypot(a.x - b.x, a.y - b.y) < 0.01) {
      if (b.in) a.in = b.in;
      a.smooth = !!(a.in && a.out);
      sp.nodes.pop();
      sp.closed = true;
    }
  }
  return subs;
}

/** The word set in constructed letters (see the head of this file), cap height h. */
export function letter(text: string, st: LetteringStyle, h: number, mod: Modification = { kind: 'none' }): Lettered {
  const chars = [...text.toUpperCase()];
  const missing = [...new Set(chars.filter((ch) => !GLYPHS[ch]))];
  const sw = st.weight * h;
  // centrelines inset by half the stroke, so the drawn letters stand exactly a cap high; rounds overshoot a little
  const inset = sw / 2;
  const tan = Math.tan(rad(st.slant));
  const letters: Letter[] = [];
  let x = 0;
  let prev: Glyph | null = null;
  const base = (0.07 + st.weight * 0.62) * st.tracking;
  chars.forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    if (prev) x += h * (base + (KERN[`${prev.side[1]}${g.side[0]}`] ?? 0) + (PAIRS[`${chars[i - 1]}${ch}`] ?? 0) * Math.min(1.4, st.tracking + 0.3) + (chars[i - 1] === ' ' || ch === ' ' ? 0.05 : 0));
    const gw = g.w * st.width * h;
    const over = g.round ? h * 0.015 : 0;
    const lift = mod.kind === 'lift' && mod.at === i ? -sw * 1.6 : 0;
    const x0 = x;
    const map = (p: P2): P2 => {
      const y = lift + inset - over + p[1] * (h - sw + over * 2);
      return [x0 + inset + p[0] * Math.max(0, gw - (g.w ? sw : 0)) + (h - y) * tan, y];
    };
    const subpaths = g.runs.flatMap((run) => runToSubs(run, map));
    const dots = g.runs.flat().flatMap((s) => (s.kind === 'dot' ? [map(s.c)] : []));
    const w = gw + (g.w ? 0 : sw);
    letters.push({ ch, path: { subpaths }, x: x0, w, dots });
    x += w;
    prev = g;
  });
  const extras: Lettered['extras'] = [];
  let cut: Lettered['cut'] = null;
  const sl = (yy: number) => (h - yy) * tan;
  if (mod.kind === 'ligature' && letters[mod.at] && letters[mod.at + 1]) {
    // two letters joined at the cap line or the baseline: a bar across the space between them
    const a = letters[mod.at];
    const b = letters[mod.at + 1];
    const y = mod.height === 'cap' ? sw / 2 : h - sw / 2;
    extras.push({
      name: 'Ligature',
      path: {
        subpaths: [
          {
            closed: false,
            nodes: [
              { x: r3(a.x + a.w - sw / 2 + sl(y)), y: r3(y) },
              { x: r3(b.x + sw / 2 + sl(y)), y: r3(y) },
            ],
          },
        ],
      },
    });
  } else if (mod.kind === 'swash' && letters.length) {
    const z = letters[letters.length - 1];
    const x1 = z.x + z.w - sw / 2;
    const y1 = h - sw / 2;
    extras.push({
      name: 'Swash',
      path: {
        subpaths: [
          {
            closed: false,
            nodes: [
              { x: r3(x1), y: r3(y1), out: [r3(x1 + h * 0.3), r3(y1)] },
              { x: r3(x1 + h * 0.62), y: r3(h * 0.55), in: [r3(x1 + h * 0.5), r3(h * 0.75)] },
            ],
          },
        ],
      },
    });
  } else if (mod.kind === 'cut') {
    const l = letters[Math.min(letters.length - 1, Math.max(0, mod.at))];
    if (l) cut = { x: l.x + l.w / 2 - sw * 0.35 + sl(h / 2), y: -h * 0.2, w: Math.max(1, sw * 0.7), h: h * 1.4, angle: mod.angle };
  }
  const width = x + (mod.kind === 'swash' ? h * 0.62 : 0) + Math.max(0, h * tan);
  return {
    letters,
    extras,
    cut,
    accent: mod.kind === 'accent' ? Math.min(letters.length - 1, Math.max(0, mod.at)) : null,
    inline: mod.kind === 'inline',
    width,
    height: h,
    strokeWidth: sw,
    missing,
    text,
    spelled: letters.map((l) => l.ch).join(''),
  };
}

/** Whether the alphabet draws every character of the text. */
export const supported = (text: string) => [...text.toUpperCase()].every((ch) => !!GLYPHS[ch]);
/** Whether a lettered word spells its text exactly (in capitals, as constructed lettering sets it). */
export const spelledExactly = (l: Lettered) => !l.missing.length && l.spelled === l.text.toUpperCase();
/** One letter's centrelines and box (for a lettermark, a monogram or a letter symbol), cap height h. */
export function glyphOf(ch: string, st: LetteringStyle, h: number): Letter | null {
  if (!GLYPHS[ch.toUpperCase()]) return null;
  return letter(ch, { ...st, tracking: 1 }, h).letters[0] ?? null;
}
/** A letter's counter (the centre of its enclosed space), in the letter's own box (0–1), if it has one. */
export function counterOf(ch: string): P2 | null {
  const g = GLYPHS[ch.toUpperCase()];
  return g?.counter ? [g.w ? g.counter[0] / g.w : 0.5, g.counter[1]] : null;
}
/** A letter's side classes (v straight, o round, d diagonal, a open arm). */
export const sidesOf = (ch: string): [Cls, Cls] | null => GLYPHS[ch.toUpperCase()]?.side ?? null;
