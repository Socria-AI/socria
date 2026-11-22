// lib/ux-v0/graphics/logo/build.ts — a logo concept as document objects the editor can change: the symbol's parts as
// Bézier shapes (anchors and handles), cuts as live booleans or masks (the cutters stay editable), ring text as text on
// a circle; the wordmark as stroked letter paths (constructed lettering, the source text kept in the record) or as
// live text in a licensed face. Lockups (horizontal, stacked, symbol, wordmark, emblem) place the two with optical
// rules: a round symbol drawn a little larger than a square one, the wordmark centred on the symbol's optical centre,
// the space between them a share of the cap height, clear space around it all. Colour schemes give the full-colour,
// black, white, grayscale, one-colour and reversed versions; the small version drops details and thickens strokes.

import { advanceEm, knownFont } from '../../fonts';
import { hash32 } from '../styles/hash';
import { mapPath, type BezierPath } from '../geometry';
import type { Artboard, GraphicDoc, GroupNode, Node, ShapeNode, TextNode } from '../doc';
import { asBezierNode } from '../vectorops';
import { luminance } from '../paint';
import type { LockupKind, LogoConcept } from './concepts';
import { lettered } from './concepts';
import { boundsOfParts, S, type Mark, type MarkPart } from './geom';
import { glyphOf } from './glyphs';
import { inkOf, rasterize } from './raster';

import { COLOUR_SCHEMES, type ColourScheme } from './constants';
export { COLOUR_SCHEMES, type ColourScheme };
export const SCHEME_LABEL: Record<ColourScheme, string> = { full: 'Full colour', black: 'Black', white: 'White', grayscale: 'Grayscale', single: 'One colour', reversed: 'Reversed' };

export interface LogoColours {
  /** the symbol's three tones */
  tones: [string, string, string];
  /** the wordmark */
  word: string;
  /** an accent letter */
  accent: string;
  /** what it sits on (null: transparent) */
  ground: string | null;
}

const gray = (hex: string) => {
  const l = luminance(hex);
  // the gray of the same luminance (sRGB companding)
  const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${c}${c}${c}`;
};

/** The colours of a concept in a scheme. */
export function coloursFor(c: LogoConcept, scheme: ColourScheme, ground?: string | null): LogoColours {
  const p = c.palette;
  const full: LogoColours = { tones: [p.primary, p.secondary, p.accent], word: p.ink, accent: p.accent, ground: ground === undefined ? p.paper : ground };
  if (scheme === 'full') return full;
  if (scheme === 'black') return { tones: ['#111111', '#111111', '#111111'], word: '#111111', accent: '#111111', ground: ground === undefined ? '#ffffff' : ground };
  if (scheme === 'white') return { tones: ['#ffffff', '#ffffff', '#ffffff'], word: '#ffffff', accent: '#ffffff', ground: ground === undefined ? '#111111' : ground };
  if (scheme === 'grayscale') return { tones: [gray(p.primary), gray(p.secondary), gray(p.accent)], word: gray(p.ink), accent: gray(p.accent), ground: ground === undefined ? '#ffffff' : ground };
  if (scheme === 'single') return { tones: [p.primary, p.primary, p.primary], word: p.primary, accent: p.primary, ground: ground === undefined ? p.paper : ground };
  return { tones: [p.paper, p.paper, p.paper], word: p.paper, accent: p.paper, ground: ground === undefined ? p.primary : ground };
}

/** The mark made for small sizes: details left out, ring text dropped (an emblem keeps its centre), strokes heavier. */
export function smallMark(m: Mark): Mark {
  const ring = m.parts.some((p) => p.ringText);
  let parts = m.parts.filter((p) => !p.detail && !p.ringText);
  if (ring) parts = parts.filter((p) => !/ring/i.test(p.name));
  if (!parts.length) parts = m.parts.filter((p) => !p.ringText);
  parts = parts.map((p) => (p.stroke ? { ...p, stroke: { ...p.stroke, width: Math.round(p.stroke.width * 1.3) } } : p));
  return { ...m, parts, notes: [...m.notes, 'small version: details and ring text left out, strokes 30% heavier'] };
}

/** A stand-in symbol for a wordmark-only concept where a symbol is needed (an app icon, a favicon): its initial,
 * drawn in the wordmark's own lettering. */
export function initialMark(c: LogoConcept): Mark {
  const ch = c.wordmark.text.replace(/[^A-Za-z0-9]/g, '')[0]?.toUpperCase() ?? 'S';
  const st = c.wordmark.style ?? { weight: 0.18, width: 1, tracking: 1, terminal: 'round' as const, join: 'round' as const, slant: 0 };
  const g = glyphOf(ch, { ...st, weight: Math.max(0.16, st.weight * 1.4) }, 700) ?? glyphOf('S', { ...st, weight: 0.18 }, 700)!;
  const path = mapPath(g.path, (x, y) => [x + 500 - g.w / 2, y + 150]);
  return {
    method: 'initial',
    params: { letter: ch },
    notes: ['the initial, in the wordmark’s lettering, for small places'],
    parts: [{ name: `Initial ${ch}`, path, tone: 0, stroke: { width: Math.round(Math.max(0.16, st.weight * 1.4) * 700), cap: st.terminal === 'round' ? 'round' : 'square', join: st.join } }],
  };
}

let counter = 0;
const nid = (key: string) => `lg${(hash32(`${key}|${counter++}`) >>> 0).toString(36)}`;

/** One mark part as nodes, in a box: the mark's 1000 units mapped to `scale` px from (ox, oy). */
function partNodes(p: MarkPart, idx: number, key: string, ox: number, oy: number, scale: number, col: LogoColours, font: string): Node[] {
  const colour = col.tones[p.tone];
  const map = (q: BezierPath) => mapPath(q, (x, y) => [ox + x * scale, oy + y * scale]);
  const shape = (q: BezierPath, name: string, extra: Partial<ShapeNode>): ShapeNode | null => {
    const b = asBezierNode(map(q));
    if (!b) return null;
    return { id: nid(`${key}|${idx}|${name}`), type: 'shape', name, role: 'logo', x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0, opacity: 1, shape: 'bezier', bez: b.bez, fill: null, rule: 'evenodd', ...extra } as ShapeNode;
  };
  if (p.ringText) {
    const t = p.ringText;
    const size = t.size * scale;
    const r = t.r * scale;
    const side = 2 * (r + size * 0.5);
    // spaced to run round about four tenths of the ring
    const baseline = Math.max(4, side / 2 - size * 0.85);
    const natural = t.text.length * size * 0.7;
    const tracking = Math.round(Math.max(120, Math.min(900, ((Math.PI * 2 * baseline * 0.42 - natural) / Math.max(1, t.text.length - 1) / size) * 1000)));
    const node: TextNode = {
      id: nid(`${key}|${idx}|ring`),
      type: 'text',
      name: p.name,
      role: 'logo',
      x: ox + t.cx * scale - side / 2,
      y: oy + t.cy * scale - side / 2,
      w: side,
      h: side,
      rotation: 0,
      opacity: 1,
      text: t.text,
      font,
      weight: 600,
      size,
      lineHeight: 1,
      tracking,
      align: 'center',
      valign: 'middle',
      color: colour,
      case: 'upper',
      path: { kind: 'circle', bend: 0, start: 0, side: 'outside' },
    };
    return [node];
  }
  if (p.stroke) {
    const st = { color: colour, width: Math.max(0.5, p.stroke.width * scale), cap: p.stroke.cap, join: p.stroke.join };
    const main = shape(p.path, p.name, { fill: null, stroke: st });
    if (!main) return [];
    if (!p.cuts?.length) return [main];
    // a stroke with cuts: a mask that hides where the cutters are (the cutters stay editable shapes)
    const cutters = p.cuts.map((q, k) => shape(q, `Cut ${k + 1}`, { fill: '#000000' })).filter((n): n is ShapeNode => !!n);
    const all = [main, ...cutters];
    const bx = Math.min(...all.map((n) => n.x));
    const by = Math.min(...all.map((n) => n.y));
    const bw = Math.max(...all.map((n) => n.x + n.w)) - bx;
    const bh = Math.max(...all.map((n) => n.y + n.h)) - by;
    const rel = (n: Node): Node => ({ ...n, x: n.x - bx, y: n.y - by });
    const cutGroup: GroupNode = { id: nid(`${key}|${idx}|cuts`), type: 'group', name: 'Cutters', x: 0, y: 0, w: bw, h: bh, rotation: 0, opacity: 1, children: cutters.map(rel) };
    return [{ id: nid(`${key}|${idx}|masked`), type: 'group', name: p.name, role: 'logo', x: bx, y: by, w: bw, h: bh, rotation: 0, opacity: 1, mask: 'alpha', maskInvert: true, children: [cutGroup, rel(main)] } as GroupNode];
  }
  const main = shape(p.path, p.name, { fill: colour });
  if (!main) return [];
  if (!p.cuts?.length) return [main];
  // a fill with cuts: a live boolean (subtract), drawn in the first shape's paint; every shape stays editable
  const cutters = p.cuts.map((q, k) => shape(q, `Cut ${k + 1}`, { fill: colour })).filter((n): n is ShapeNode => !!n);
  const all = [main, ...cutters];
  const bx = Math.min(...all.map((n) => n.x));
  const by = Math.min(...all.map((n) => n.y));
  const bw = Math.max(...all.map((n) => n.x + n.w)) - bx;
  const bh = Math.max(...all.map((n) => n.y + n.h)) - by;
  return [{ id: nid(`${key}|${idx}|bool`), type: 'group', name: p.name, role: 'logo', x: bx, y: by, w: bw, h: bh, rotation: 0, opacity: 1, boolean: 'subtract', children: all.map((n) => ({ ...n, x: n.x - bx, y: n.y - by })) } as GroupNode];
}

/** How much a symbol's silhouette fills its box (a disc fills about 79%, a square all of it). */
export function fillOfMark(m: Mark): number {
  const b = boundsOfParts(m.parts);
  const ink = inkOf(rasterize(m, 48, b));
  return ink.reduce((s, v) => s + v, 0) / ink.length;
}

export interface Placed {
  nodes: Node[];
  box: { x: number; y: number; w: number; h: number };
}

/** The symbol placed with its bounds at (x, y), `size` px on its larger side. */
export function symbolNodes(c: LogoConcept, mark: Mark, x: number, y: number, size: number, col: LogoColours, font = 'Inter'): Placed {
  const b = boundsOfParts(mark.parts);
  const k = size / Math.max(1, Math.max(b.w, b.h));
  const ox = x - b.x * k + (size - b.w * k) / 2;
  const oy = y - b.y * k + (size - b.h * k) / 2;
  const nodes = mark.parts.flatMap((p, i) => partNodes(p, i, `${c.id}|sym`, ox, oy, k, col, font));
  return { nodes, box: { x: x + (size - b.w * k) / 2, y: y + (size - b.h * k) / 2, w: b.w * k, h: b.h * k } };
}

/** The wordmark's width at a cap height, before it is placed. */
export function wordmarkWidth(c: LogoConcept, cap: number): number {
  const l = lettered(c.wordmark, cap);
  if (l) return l.width;
  const w = c.wordmark;
  const size = cap / 0.7;
  const upper = w.case === 'upper' || w.text === w.text.toUpperCase();
  return (w.text.length * advanceEm(w.font ?? 'Inter', w.weight ?? 500, upper) * size + (w.text.length - 1) * ((w.tracking ?? 0) / 1000) * size) * 1.08;
}

/** The wordmark placed with its cap line at y and its left at x, cap height `cap` px. */
export function wordmarkNodes(c: LogoConcept, x: number, y: number, cap: number, col: LogoColours, align: 'left' | 'center' = 'left'): Placed {
  const l = lettered(c.wordmark, cap);
  const key = `${c.id}|word`;
  if (l) {
    const sw = l.strokeWidth;
    const st = c.wordmark.style!;
    const cap2 = st.terminal === 'round' ? 'round' : st.terminal === 'square' ? 'square' : 'butt';
    const letters: Node[] = [];
    l.letters.forEach((g, i) => {
      if (!g.path.subpaths.length && !g.dots.length) return;
      const colour = l.accent === i ? col.accent : col.word;
      if (g.path.subpaths.length) {
        const b = asBezierNode(mapPath(g.path, (px, py) => [x + px, y + py]));
        if (b) {
          const inline = l.inline
            ? { stroke: { color: col.ground ?? '#ffffff', width: Math.max(0.5, sw * 0.22), cap: cap2 as 'round' | 'square' | 'butt', join: st.join }, strokes: [{ color: colour, width: sw, cap: cap2 as 'round' | 'square' | 'butt', join: st.join }] }
            : { stroke: { color: colour, width: sw, cap: cap2 as 'round' | 'square' | 'butt', join: st.join } };
          letters.push({
            id: nid(`${key}|${i}`),
            type: 'shape',
            name: `Letter ${g.ch}`,
            role: 'logo',
            x: b.x,
            y: b.y,
            w: Math.max(b.w, 1),
            h: Math.max(b.h, 1),
            rotation: 0,
            opacity: 1,
            shape: 'bezier',
            bez: b.bez,
            fill: null,
            ...inline,
          } as ShapeNode);
        }
      }
      for (const [dx, dy] of g.dots)
        letters.push({ id: nid(`${key}|${i}|dot`), type: 'shape', name: `${g.ch} dot`, role: 'logo', x: x + dx - sw / 2, y: y + dy - sw / 2, w: sw, h: sw, rotation: 0, opacity: 1, shape: 'ellipse', fill: colour } as ShapeNode);
    });
    for (const e of l.extras) {
      const b = asBezierNode(mapPath(e.path, (px, py) => [x + px, y + py]));
      if (b)
        letters.push({
          id: nid(`${key}|${e.name}`),
          type: 'shape',
          name: e.name,
          role: 'logo',
          x: b.x,
          y: b.y,
          w: Math.max(b.w, 1),
          h: Math.max(b.h, 1),
          rotation: 0,
          opacity: 1,
          shape: 'bezier',
          bez: b.bez,
          fill: null,
          stroke: { color: col.word, width: sw, cap: cap2, join: st.join },
        } as ShapeNode);
    }
    const box = { x, y: y - sw, w: l.width, h: cap + sw * 2 };
    if (l.cut) {
      // the cut: a band that hides, as the first child of a masking group
      const band: ShapeNode = { id: nid(`${key}|cut`), type: 'shape', name: 'Cut', role: 'logo', x: x + l.cut.x - box.x, y: y + l.cut.y - box.y, w: l.cut.w, h: l.cut.h, rotation: l.cut.angle, opacity: 1, shape: 'rect', fill: '#000000' };
      const rel = letters.map((n) => ({ ...n, x: n.x - box.x, y: n.y - box.y }));
      return { nodes: [{ id: nid(`${key}|g`), type: 'group', name: 'Wordmark', role: 'logo', ...box, rotation: 0, opacity: 1, mask: 'alpha', maskInvert: true, children: [band, ...rel] } as GroupNode], box };
    }
    const rel = letters.map((n) => ({ ...n, x: n.x - box.x, y: n.y - box.y }));
    return { nodes: [{ id: nid(`${key}|g`), type: 'group', name: 'Wordmark', role: 'logo', ...box, rotation: 0, opacity: 1, children: rel } as GroupNode], box };
  }
  const w = c.wordmark;
  const size = cap / 0.7;
  // the box is generous (a face set wider than its measured average never wraps the name)
  const est = wordmarkWidth(c, cap);
  // faces whose widths SocriaUX has measured need little slack; others get more, so the name never wraps
  const width = est * (knownFont(w.font ?? 'Inter') ? 1.12 : 1.4);
  const tx = align === 'center' ? x + est / 2 - width / 2 : x;
  const node: TextNode = {
    id: nid(`${key}|text`),
    type: 'text',
    name: 'Wordmark',
    role: 'logo',
    x: tx,
    y: y - size * 0.24,
    w: width,
    h: size * 1.2,
    rotation: 0,
    opacity: 1,
    text: w.text,
    font: w.font ?? 'Inter',
    weight: w.weight ?? 500,
    size,
    lineHeight: 1.2,
    tracking: w.tracking ?? 0,
    align: align === 'center' ? 'center' : 'left',
    valign: 'top',
    color: col.word,
    ...(w.case && w.case !== 'none' ? { case: w.case } : {}),
  };
  return { nodes: [node], box: { x: align === 'center' ? x : tx, y: y - size * 0.24, w: est, h: size * 1.2 } };
}

export interface LockupLayout {
  kind: LockupKind;
  width: number;
  height: number;
  /** clear space all round, px */
  clear: number;
  /** the smallest height it should be used at, px */
  minHeight: number;
}

/** A lockup built at a cap height: its nodes (one group) and its layout. */
export function lockupNodes(c: LogoConcept, kind: LockupKind, cap: number, col: LogoColours, opts: { small?: boolean; font?: string; x?: number; y?: number } = {}): { group: GroupNode; layout: LockupLayout } {
  const mark0 = c.mark ?? (kind === 'symbol' || kind === 'emblem' ? initialMark(c) : null);
  const mark = mark0 && opts.small ? smallMark(mark0) : mark0;
  const roundness = mark ? 1 + Math.max(0, 0.95 - fillOfMark(mark)) * 0.18 : 1;
  const nodes: Node[] = [];
  let width = 0;
  let height = 0;
  const font = opts.font ?? c.wordmark.font ?? 'Inter';
  if ((kind === 'symbol' || kind === 'emblem') && mark) {
    const size = cap * 4;
    nodes.push(...symbolNodes(c, mark, 0, 0, size, col, font).nodes);
    width = height = size;
  } else if (kind === 'wordmark' || !mark) {
    const wm = wordmarkNodes(c, 0, 0, cap, col);
    nodes.push(...wm.nodes);
    width = wm.box.w;
    height = wm.box.h;
    nodes.forEach((n) => (n.y -= wm.box.y));
  } else if (kind === 'horizontal') {
    // the symbol sized by its height (a wide symbol is not shrunk to fit a square), a round one a touch larger
    const mb = boundsOfParts(mark.parts);
    const size = Math.min(cap * 4.2, cap * 1.9 * roundness * Math.max(1, mb.w / Math.max(1, mb.h)));
    const gap = cap * 0.62;
    const sym = symbolNodes(c, mark, 0, 0, size, col, font);
    // the symbol's own bounds start at the origin
    sym.nodes.forEach((n) => {
      n.x -= sym.box.x;
      n.y -= sym.box.y;
    });
    const top = Math.max(0, cap * 0.6 - sym.box.h / 2);
    sym.nodes.forEach((n) => (n.y += top));
    const wordY = top + sym.box.h / 2 - cap / 2;
    const wm = wordmarkNodes(c, sym.box.w + gap, wordY, cap, col);
    nodes.push(...sym.nodes, ...wm.nodes);
    width = sym.box.w + gap + wm.box.w;
    height = Math.max(top + sym.box.h, wm.box.y + wm.box.h);
  } else {
    const ww = wordmarkWidth(c, cap);
    const mb = boundsOfParts(mark.parts);
    const size = Math.min(Math.max(ww * 1.05, cap * 3.2), cap * 3.2 * roundness * Math.max(1, mb.w / Math.max(1, mb.h)));
    const sym = symbolNodes(c, mark, 0, 0, size, col, font);
    width = Math.max(sym.box.w, ww);
    sym.nodes.forEach((n) => {
      n.x += width / 2 - (sym.box.x + sym.box.w / 2);
      n.y -= sym.box.y;
    });
    const wm = wordmarkNodes(c, width / 2 - ww / 2, sym.box.h + cap * 0.85, cap, col, 'center');
    nodes.push(...sym.nodes, ...wm.nodes);
    height = sym.box.h + cap * 0.85 + cap * 1.25;
  }
  const ox = opts.x ?? 0;
  const oy = opts.y ?? 0;
  const group: GroupNode = { id: nid(`${c.id}|lockup|${kind}`), type: 'group', name: `Logo — ${kind}`, role: 'logo', x: ox, y: oy, w: Math.max(1, width), h: Math.max(1, height), rotation: 0, opacity: 1, children: nodes };
  return { group, layout: { kind, width, height, clear: cap * (kind === 'symbol' ? 0.6 : 1), minHeight: kind === 'symbol' || kind === 'emblem' ? 16 : kind === 'horizontal' ? 20 : 40 } };
}

/** The lockup scaled to fit a box (centred), as one group. */
export function fitLockup(c: LogoConcept, kind: LockupKind, box: { x: number; y: number; w: number; h: number }, col: LogoColours, opts: { small?: boolean; font?: string } = {}): GroupNode {
  const probe = lockupNodes(c, kind, 100, col, opts).layout;
  const k = Math.min(box.w / Math.max(1, probe.width), box.h / Math.max(1, probe.height));
  const cap = 100 * k;
  const { group, layout } = lockupNodes(c, kind, cap, col, opts);
  return { ...group, x: box.x + (box.w - layout.width) / 2, y: box.y + (box.h - layout.height) / 2 };
}

const tokensOf = (c: LogoConcept) => ({
  colors: { background: c.palette.paper, surface: c.palette.paper, text: c.palette.ink, muted: c.palette.muted, accent: c.palette.primary, accentText: c.palette.paper, line: c.palette.muted },
  fonts: { display: c.wordmark.font ?? 'Inter', body: 'Inter' },
});

/** A document holding one lockup on one artboard (for previews, exports and checks). */
export function logoDoc(c: LogoConcept, opts: { kind?: LockupKind; scheme?: ColourScheme; width?: number; height?: number; pad?: number; transparent?: boolean; small?: boolean; name?: string } = {}): GraphicDoc {
  const kind = opts.kind ?? c.lockup;
  const W = opts.width ?? 1200;
  const H = opts.height ?? (kind === 'horizontal' || kind === 'wordmark' ? 600 : 1000);
  const pad = opts.pad ?? Math.min(W, H) * 0.16;
  const col = coloursFor(c, opts.scheme ?? 'full');
  const g = fitLockup(c, kind, { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 }, col, { small: opts.small });
  const board: Artboard = { id: `ab_${c.id}_${kind}`, name: opts.name ?? `${c.wordmark.text} — ${kind}`, width: W, height: H, unit: 'px', dpi: 72, format: 'custom', background: opts.transparent ? null : col.ground, bleed: 0, safe: 0, children: [g] };
  return { schema: 1, id: `doc_${c.id}`, name: `${c.wordmark.text} logo`, tokens: tokensOf(c), artboards: [board], assets: [], revision: 0, updatedAt: 0 };
}

export const markUnits = S;
