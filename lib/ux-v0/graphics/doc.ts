// lib/ux-v0/graphics/doc.ts — the graphics document: what a poster, a carousel, a card or a cover IS, as data.
//
// A graphic is never stored as a picture of itself. It is a versioned, serializable scene graph that no renderer owns:
//
//   document  → artboards (each its own size, units, resolution, background, bleed, safe area)
//             → nodes, in drawing order: text, shape, image, group (nested), chart
//             → assets (pictures, by id) and tokens (the direction's colours and faces)
//
// Every node has a stable id, a role (headline, subhead, body, cta, meta, logo, image, motif, background, data,
// caption, label) that format adaptation and contextual edits read, a box in its parent's coordinates (x, y, w, h,
// rotation about its centre, opacity) and lock and visibility flags. Paths and shape recipes live in a 0–100 box,
// scaled to the node's box (lib/ux-v0/shape.ts). Text is text: exact wording, never a picture of letters.
//
// normalizeDoc() is the only way in. A document from storage, an import or a model is held to its shape: unknown
// node types dropped, numbers clamped, colours checked, ids made unique, references to missing assets removed, and
// what was repaired said. Operations (applyOp) are the only way to change it: each is validated and applied as a
// whole or not at all, so an edit that fails leaves the previous document exactly as it was.

import { fontAxes } from '../fonts';
import { normalizeRecipe, parsePath, type ShapeRecipe } from '../shape';
import { normalizeEffects, EFFECT_BY_KIND, type Effect } from './effects';
import { normalizeBezier, normalizePrim, PRIMITIVE_BY_KIND, type BezierPath, type BoolMode, type Prim } from './geometry';
import { normalizePaint, parseColor, type Gradient, type Paint as PaintV2 } from './paint';
import { isPxParam, normalizePatternParams, PATTERN_BY_KIND } from './patterns';
import { asBezierNode, blendPaths, booleanPath, offsetOutline, shapeBezier, shapeInParent, strokeOutline, nodeMatrix, transformPath } from './vectorops';
import { distortPath, reversePath, simplifyPath, smoothPath, mapPath } from './geometry';
import { normalizeSelection, type StyleSelection } from './styles/blend';
import { normalizeCompositionPlan, normalizeMemory, type CompositionPlan, type MemoryEntry } from './composition/schema';

export const GFX_SCHEMA = 1;

export const ROLES = ['headline', 'subhead', 'body', 'cta', 'meta', 'logo', 'image', 'motif', 'background', 'data', 'caption', 'label'] as const;
export type Role = (typeof ROLES)[number];

export const UNITS = ['px', 'pt'] as const;
export type Unit = (typeof UNITS)[number];

export type { Stop, Gradient } from './paint';
/** A fill: a colour, or a gradient (linear, radial, conic or mesh-style: see paint.ts). */
export type Paint = PaintV2;

export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'exclusion'] as const;
export type BlendMode = (typeof BLENDS)[number];

export interface Base {
  id: string;
  name?: string;
  role?: Role;
  /** the box in the parent's coordinates (an artboard's, or a group's own) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees, about the box's centre */
  rotation: number;
  opacity: number;
  locked?: boolean;
  hidden?: boolean;
  /** how it mixes with what is beneath (normal when absent) */
  blend?: BlendMode;
  /** a non-destructive stack of effects, applied in order (effects.ts) */
  effects?: Effect[];
  /** degrees of slant, about the box's centre */
  skewX?: number;
  skewY?: number;
  /** mirrored about the box's centre */
  flipX?: boolean;
  flipY?: boolean;
  /** drawn as part of the composition, not as content: a cropped echo of the words, a field of figures. The checks
   * read it as decoration (it may run off the frame; the words are elsewhere in full) */
  decorative?: boolean;
}

export interface TextNode extends Base {
  type: 'text';
  /** the exact words; "\n" breaks a line */
  text: string;
  font: string;
  weight: number;
  italic?: boolean;
  size: number;
  /** a multiple of the size */
  lineHeight: number;
  /** thousandths of an em */
  tracking: number;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  color: string;
  case?: 'none' | 'upper' | 'lower';
  /** set on its side (read from bottom to top) */
  vertical?: boolean;
  /** an outline instead of (or around) the fill */
  stroke?: { color: string; width: number };
  /** the box grows to fit its words (the size is kept) rather than the words being checked against the box */
  autoHeight?: boolean;
  /** a gradient fill instead of the colour; null: no fill at all (an outline, with a stroke) */
  fill?: Gradient | null;
  /** set along a path (one line): an arc, a circle, a wave or a path of its own */
  path?: TextPath;
  /** each letter placed by a warp: a wave, a rise, a perspective-style recession, a bulge, a stagger */
  warp?: TextWarp;
  /** variable-font axes beyond weight (width, optical size, slant, softness…), within the family's ranges */
  axes?: Record<string, number>;
  /** kerning switched off (on when absent) */
  kerning?: 'none';
  /** OpenType features (ligatures, small capitals, old-style or tabular figures, stylistic sets) */
  features?: string[];
  /** extra space between paragraphs, in multiples of the size */
  paragraph?: number;
  /** mixed styles: ranges of the words with their own weight, italic, colour, face or decoration */
  runs?: TextRun[];
  /** the words repeated behind themselves (an echo, a stack): copies offset, fading, optionally outlined */
  repeat?: TextRepeat;
  decoration?: 'underline' | 'line-through';
}

export interface TextPath {
  kind: 'arc' | 'circle' | 'wave' | 'custom';
  /** arc: how far it bends (−100 down … 100 up) */
  bend: number;
  /** where the words sit along the path, 0–100 (circle: the angle at their centre, 0 at the top) */
  start: number;
  /** circle: read around the outside (default) or the inside */
  side?: 'outside' | 'inside';
  /** wave: how many waves across, and how tall, 0–100 of the box */
  cycles?: number;
  amplitude?: number;
  /** custom: path data in a 0–100 box */
  d?: string;
}
export interface TextWarp {
  kind: 'wave' | 'rise' | 'perspective' | 'bulge' | 'stagger';
  /** −100 … 100 */
  amount: number;
  /** wave: how many waves along a line */
  cycles?: number;
}
export interface TextRun {
  start: number;
  end: number;
  weight?: number;
  italic?: boolean;
  color?: string;
  font?: string;
  decoration?: 'underline' | 'line-through' | 'none';
}
export interface TextRepeat {
  count: number;
  dx: number;
  dy: number;
  /** how much the last copy has faded (0 none … 1 gone) */
  fade: number;
  /** copies drawn as outlines */
  outline?: boolean;
}

export const SHAPES = ['rect', 'ellipse', 'line', 'polygon', 'star', 'path', 'recipe', 'prim', 'bezier'] as const;
export type ShapeKind = (typeof SHAPES)[number];

export interface ShapeNode extends Base {
  type: 'shape';
  shape: ShapeKind;
  /** a rectangle's corner radius (px) */
  radius?: number;
  /** a polygon's sides, a star's points */
  sides?: number;
  /** a star's inner radius, 0.1–0.95 of the outer */
  inner?: number;
  /** a path in a 0–100 box (M L H V C S Q T Z only) */
  path?: string;
  /** a recipe of SocriaUX's shape grammar, drawn in the node's box */
  recipe?: ShapeRecipe;
  /** a parametric primitive of the geometry registry (geometry.ts), drawn in the node's box */
  prim?: Prim;
  /** an editable Bézier path in a 0–100 box (anchors and handles) */
  bez?: BezierPath;
  fill: Paint | null;
  stroke?: Stroke;
  /** more strokes beneath the main one (a double outline, a keyline around a keyline) */
  strokes?: Stroke[];
  /** a path's fill rule: even-odd makes rings inside rings holes (paths and recipes are always even-odd) */
  rule?: 'evenodd';
}
export interface Stroke {
  color: string;
  width: number;
  join?: 'miter' | 'round' | 'bevel';
  cap?: 'butt' | 'round' | 'square';
  dash?: number[];
}

export interface ImageNode extends Base {
  type: 'image';
  asset: string;
  fit: 'cover' | 'contain';
  /** where the subject is (0–100), kept in view when covering */
  focus?: { x: number; y: number };
  /** a mask: an ellipse, or a recipe of the shape grammar */
  mask?: 'ellipse' | ShapeRecipe | null;
  radius?: number;
  filter?: { grayscale?: number; contrast?: number; brightness?: number; blur?: number };
  /** non-destructive adjustments (−100 … 100 unless said): the original picture is never changed */
  adjust?: ImageAdjust;
  /** the part of the picture used (fractions of it, 0–1), before it is fitted to the box */
  crop?: { x: number; y: number; w: number; h: number };
}
export interface ImageAdjust {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  /** degrees */
  hue?: number;
  temperature?: number;
  /** px */
  blur?: number;
  /** 0–100 */
  vignette?: number;
}

export interface GroupNode extends Base {
  type: 'group';
  children: Node[];
  /** clip the group's children to its box */
  clip?: boolean;
  /** the first child masks the others: by its silhouette (alpha) or its brightness (luminance) */
  mask?: 'alpha' | 'luminance';
  /** the mask hides instead of shows (a cut-out) */
  maskInvert?: boolean;
  /** the children's blend modes mix only with each other, not with what is beneath the group */
  isolate?: boolean;
  /** a live boolean of the group's shapes (they stay editable): drawn with the first shape's fill and stroke */
  boolean?: BoolMode;
}

/** A procedural pattern: a generator of patterns.ts with its parameters and inks, drawn in its box. */
export interface PatternNode extends Base {
  type: 'pattern';
  gen: string;
  params: Record<string, number>;
  /** one to four inks; the first is the main one */
  colors: string[];
  /** where it draws: its box (default), an ellipse in it, or a primitive's outline */
  bound?: 'ellipse' | Prim;
}

export interface ChartDatum {
  label: string;
  value: number;
  series?: string;
}
export interface ChartNode extends Base {
  type: 'chart';
  chart: 'bar' | 'column' | 'line' | 'donut';
  data: ChartDatum[];
  colors: string[];
  /** values written on the chart */
  values: boolean;
  font: string;
  color: string;
  /** where the numbers come from, said under the chart */
  source?: string;
  /** a prefix or suffix for values ("%", "£") */
  unit?: string;
}

export type Node = TextNode | ShapeNode | ImageNode | GroupNode | ChartNode | PatternNode;
export type NodeType = Node['type'];

export interface Artboard {
  id: string;
  name: string;
  width: number;
  height: number;
  /** px for screens; pt (1/72 in) for print */
  unit: Unit;
  /** the resolution a print artboard is exported at */
  dpi: number;
  /** the preset it was made from (formats.ts) */
  format?: string;
  /** null: transparent */
  background: string | null;
  /** print bleed beyond the trim, in the artboard's units */
  bleed: number;
  /** the margin keep-out for words and logos, in the artboard's units */
  safe: number;
  children: Node[];
  locked?: boolean;
  /** how it was composed (composition/schema.ts): a record kept apart from its objects, for exploring and re-composing */
  composition?: CompositionPlan;
}

export interface Asset {
  id: string;
  kind: 'image';
  /** https:, data:image/… or an upload artifact (upload:<id>) */
  src: string;
  width: number;
  height: number;
  name: string;
  credit?: string;
  /** where it came from */
  source: 'upload' | 'library' | 'made' | 'generated';
}

export interface Tokens {
  colors: { background: string; surface: string; text: string; muted: string; accent: string; accentText: string; line: string };
  fonts: { display: string; body: string };
  accent2?: string;
}

export interface GraphicDoc {
  schema: typeof GFX_SCHEMA;
  id: string;
  name: string;
  /** the direction the design was made in */
  direction?: { name: string; language: string } | null;
  tokens: Tokens;
  artboards: Artboard[];
  assets: Asset[];
  /** decisions the designer locked for the whole design: an edit that would change them is refused and said */
  locks?: { colors?: boolean; fonts?: boolean };
  /** colours the designer keeps at hand */
  swatches?: string[];
  /** the visual vocabulary the design was composed with (motif primitives, patterns, effects, type treatments):
   * what edits in words and new artboards keep to */
  vocabulary?: Vocabulary;
  /** the design language the design is built in (styles/*): primary, influences, intensities, lock — kept so a
   * regeneration or a new artboard speaks it, and so the person's own choices survive both */
  style?: StyleSelection;
  /** the compositions shown, chosen and turned down for this design (composition/memory.ts), bounded */
  compositionMemory?: MemoryEntry[];
  revision: number;
  updatedAt: number;
}

export interface Vocabulary {
  motifs: string[];
  patterns: string[];
  effects: string[];
  type: string[];
  /** 0 plain … 100 intricate */
  complexity?: number;
}

// ── holding a document to its shape ──

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const str = (v: unknown, max: number, d = ''): string => (typeof v === 'string' ? v.slice(0, max) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : d);
/** A colour held to hex (#rrggbb, or #rrggbbaa with alpha); typed forms (rgb(), hsl(), CSS names) are read too. */
export function colour(v: unknown, d: string): string {
  return parseColor(v) ?? d;
}

/** A fresh id: short, unique enough within a document, safe in SVG ids. */
export function newId(prefix = 'n'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

const MAX_NODES = 800;
const MAX_DEPTH = 6;
const LIMIT = 100_000;

const paint = (v: unknown, d: Paint | null): Paint | null => normalizePaint(v, d);

function strokeOf(v: unknown, d: string): Stroke {
  const st = o(v);
  return {
    color: colour(st.color, d),
    width: num(st.width, 0.25, 200, 1),
    ...(['miter', 'round', 'bevel'].includes(st.join) ? { join: st.join } : {}),
    ...(['butt', 'round', 'square'].includes(st.cap) ? { cap: st.cap } : {}),
    ...(Array.isArray(st.dash) && st.dash.length ? { dash: st.dash.map((x: unknown) => num(x, 0, 500, 4)).slice(0, 6) } : {}),
  };
}

const FEATURES = new Set(['liga', 'dlig', 'smcp', 'c2sc', 'onum', 'lnum', 'tnum', 'pnum', 'frac', 'ss01', 'ss02', 'ss03', 'ss04', 'ss05', 'swsh', 'salt', 'case', 'zero', 'calt']);
const DECOR = ['underline', 'line-through'] as const;

function textPathOf(v: unknown): TextPath | null {
  const r = o(v);
  const kind = pick(r.kind, ['arc', 'circle', 'wave', 'custom'] as const, 'arc');
  if (!v || typeof v !== 'object') return null;
  if (kind === 'custom' && !(typeof r.d === 'string' && parsePath(r.d)?.length)) return null;
  return {
    kind,
    bend: num(r.bend, -100, 100, 40),
    start: num(r.start, 0, 100, kind === 'circle' ? 0 : 50),
    ...(kind === 'circle' && r.side === 'inside' ? { side: 'inside' as const } : {}),
    ...(kind === 'wave' ? { cycles: num(r.cycles, 0.5, 8, 1.5), amplitude: num(r.amplitude, 0, 100, 40) } : {}),
    ...(kind === 'custom' ? { d: String(r.d).slice(0, 8000) } : {}),
  };
}

function runsOf(v: unknown, length: number): TextRun[] {
  const out: TextRun[] = [];
  for (const x of a(v).slice(0, 60)) {
    const r = o(x);
    const start = Math.round(num(r.start, 0, length, 0));
    const end = Math.round(num(r.end, 0, length, 0));
    if (end <= start) continue;
    const run: TextRun = { start, end };
    if (r.weight !== undefined) run.weight = Math.round(num(r.weight, 100, 900, 400) / 100) * 100;
    if (typeof r.italic === 'boolean') run.italic = r.italic;
    if (parseColor(r.color)) run.color = parseColor(r.color)!;
    if (typeof r.font === 'string' && r.font.trim()) run.font = r.font.trim().slice(0, 60);
    if (r.decoration === 'underline' || r.decoration === 'line-through' || r.decoration === 'none') run.decoration = r.decoration;
    if (Object.keys(run).length > 2) out.push(run);
  }
  // in order, never overlapping (a later range gives way to an earlier one)
  out.sort((p, q) => p.start - q.start);
  const clean: TextRun[] = [];
  for (const r of out) {
    const prev = clean[clean.length - 1];
    if (prev && r.start < prev.end) {
      if (r.end <= prev.end) continue;
      r.start = prev.end;
    }
    clean.push(r);
  }
  return clean;
}

function adjustOf(v: unknown): ImageAdjust | null {
  const r = o(v);
  const out: ImageAdjust = {};
  for (const k of ['brightness', 'contrast', 'saturation', 'temperature'] as const) if (r[k] !== undefined && num(r[k], -100, 100, 0) !== 0) out[k] = num(r[k], -100, 100, 0);
  if (r.hue !== undefined && num(r.hue, -180, 180, 0) !== 0) out.hue = num(r.hue, -180, 180, 0);
  if (r.blur !== undefined && num(r.blur, 0, 60, 0) > 0) out.blur = num(r.blur, 0, 60, 0);
  if (r.vignette !== undefined && num(r.vignette, 0, 100, 0) > 0) out.vignette = num(r.vignette, 0, 100, 0);
  return Object.keys(out).length ? out : null;
}

function vocabularyOf(v: unknown): Vocabulary | null {
  if (!v || typeof v !== 'object') return null;
  const r = o(v);
  const list = (x: unknown, ok: (s: string) => boolean, max: number) => [...new Set(a(x).filter((s): s is string => typeof s === 'string' && ok(s)))].slice(0, max);
  const out: Vocabulary = {
    motifs: list(r.motifs, (s) => PRIMITIVE_BY_KIND.has(s), 12),
    patterns: list(r.patterns, (s) => PATTERN_BY_KIND.has(s), 8),
    effects: list(r.effects, (s) => EFFECT_BY_KIND.has(s), 12),
    type: list(r.type, (s) => /^[a-z][a-z -]{1,30}$/.test(s), 8),
    ...(r.complexity !== undefined ? { complexity: Math.round(num(r.complexity, 0, 100, 50)) } : {}),
  };
  return out.motifs.length || out.patterns.length || out.effects.length || out.type.length ? out : null;
}

export interface Repair {
  /** what was dropped or changed, said once each */
  notes: string[];
}

function baseOf(r: Record<string, any>, seen: Set<string>, prefix: string): Base {
  let id = typeof r.id === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(r.id) ? r.id : newId(prefix);
  while (seen.has(id)) id = newId(prefix);
  seen.add(id);
  return {
    id,
    ...(typeof r.name === 'string' && r.name.trim() ? { name: r.name.trim().slice(0, 60) } : {}),
    ...((ROLES as readonly string[]).includes(r.role) ? { role: r.role as Role } : {}),
    x: num(r.x, -LIMIT, LIMIT, 0),
    y: num(r.y, -LIMIT, LIMIT, 0),
    w: num(r.w, 1, LIMIT, 100),
    h: num(r.h, 1, LIMIT, 100),
    rotation: num(r.rotation, -360, 360, 0),
    opacity: num(r.opacity, 0, 1, 1),
    ...(r.locked === true ? { locked: true } : {}),
    ...(r.hidden === true ? { hidden: true } : {}),
    ...(typeof r.blend === 'string' && r.blend !== 'normal' && (BLENDS as readonly string[]).includes(r.blend) ? { blend: r.blend as BlendMode } : {}),
    ...((e) => (e.length ? { effects: e } : {}))(normalizeEffects(r.effects)),
    ...(num(r.skewX, -70, 70, 0) ? { skewX: num(r.skewX, -70, 70, 0) } : {}),
    ...(num(r.skewY, -70, 70, 0) ? { skewY: num(r.skewY, -70, 70, 0) } : {}),
    ...(r.flipX === true ? { flipX: true } : {}),
    ...(r.flipY === true ? { flipY: true } : {}),
    ...(r.decorative === true ? { decorative: true } : {}),
  };
}

/** A text's typographic extras held to their shapes (each optional; absent when it would do nothing). */
function textExtras(r: Record<string, any>, text: string): Partial<TextNode> {
  const out: Partial<TextNode> = {};
  if (r.fill === null) out.fill = null;
  else if (typeof r.fill === 'string') {
    // a plain colour given as a fill is the text's colour
    const c = parseColor(r.fill);
    if (c) out.color = c;
  } else if (r.fill && typeof r.fill === 'object') {
    const g = normalizePaint(r.fill, null);
    if (g && typeof g === 'object') out.fill = g;
  }
  const tp = r.path ? textPathOf(r.path) : null;
  if (tp) out.path = tp;
  if (r.warp && typeof r.warp === 'object') {
    const w = o(r.warp);
    const kind = pick(w.kind, ['wave', 'rise', 'perspective', 'bulge', 'stagger'] as const, 'wave');
    const amount = num(w.amount, -100, 100, 0);
    if (amount) out.warp = { kind, amount, ...(kind === 'wave' ? { cycles: num(w.cycles, 0.25, 8, 1) } : {}) };
  }
  if (r.axes && typeof r.axes === 'object') {
    const ranges = fontAxes(str(r.font, 60, 'Inter') || 'Inter');
    const axes: Record<string, number> = {};
    for (const [k, v] of Object.entries(o(r.axes)).slice(0, 8)) {
      if (k === 'wght' && typeof v === 'number') axes.wght = num(v, 1, 1000, 400);
      else if (ranges[k] && typeof v === 'number') axes[k] = num(v, ranges[k][0], ranges[k][1], ranges[k][0]);
    }
    if (Object.keys(axes).length) out.axes = axes;
  }
  if (r.kerning === 'none') out.kerning = 'none';
  const feats = a(r.features).filter((f): f is string => typeof f === 'string' && FEATURES.has(f));
  if (feats.length) out.features = [...new Set(feats)].slice(0, 8);
  if (num(r.paragraph, 0, 4, 0) > 0) out.paragraph = num(r.paragraph, 0, 4, 0);
  const runs = runsOf(r.runs, text.length);
  if (runs.length) out.runs = runs;
  if (r.repeat && typeof r.repeat === 'object') {
    const q = o(r.repeat);
    const count = Math.round(num(q.count, 0, 40, 0));
    if (count > 0) out.repeat = { count, dx: num(q.dx, -2000, 2000, 6), dy: num(q.dy, -2000, 2000, 6), fade: num(q.fade, 0, 1, 0.6), ...(q.outline === true ? { outline: true } : {}) };
  }
  if ((DECOR as readonly string[]).includes(r.decoration)) out.decoration = r.decoration;
  return out;
}

function nodeOf(v: unknown, seen: Set<string>, assets: ReadonlySet<string>, rep: Repair, depth: number, count: { n: number }): Node | null {
  const r = o(v);
  if (count.n >= MAX_NODES) {
    rep.notes.push(`More than ${MAX_NODES} objects: the rest were left out.`);
    return null;
  }
  count.n++;
  switch (r.type) {
    case 'text': {
      const text = str(r.text, 4000);
      if (!text.trim()) {
        rep.notes.push('An empty text was left out.');
        return null;
      }
      return {
        ...baseOf(r, seen, 't'),
        type: 'text',
        text,
        font: str(r.font, 60, 'Inter') || 'Inter',
        weight: Math.round(num(r.weight, 100, 900, 400) / 100) * 100,
        ...(r.italic === true ? { italic: true } : {}),
        size: num(r.size, 4, 2000, 24),
        lineHeight: num(r.lineHeight, 0.7, 3, 1.2),
        tracking: num(r.tracking, -200, 800, 0),
        align: pick(r.align, ['left', 'center', 'right'] as const, 'left'),
        valign: pick(r.valign, ['top', 'middle', 'bottom'] as const, 'top'),
        color: colour(r.color, '#111111'),
        ...(r.case === 'upper' || r.case === 'lower' ? { case: r.case } : {}),
        ...(r.vertical === true ? { vertical: true } : {}),
        ...(r.stroke && typeof r.stroke === 'object' ? { stroke: { color: colour(o(r.stroke).color, '#111111'), width: num(o(r.stroke).width, 0.25, 40, 1) } } : {}),
        ...(r.autoHeight === true ? { autoHeight: true } : {}),
        ...textExtras(r, text),
      };
    }
    case 'shape': {
      const shape = pick(r.shape, SHAPES, 'rect');
      let path: string | undefined;
      if (shape === 'path') {
        const rings = typeof r.path === 'string' ? parsePath(r.path) : null;
        if (!rings || !rings.length) {
          rep.notes.push('A path that could not be read safely was left out.');
          return null;
        }
        path = r.path.slice(0, 20000);
      }
      const recipe = shape === 'recipe' ? normalizeRecipe(r.recipe) : null;
      if (shape === 'recipe' && !recipe) {
        rep.notes.push('A shape recipe that could not be read was left out.');
        return null;
      }
      const prim = shape === 'prim' ? normalizePrim(r.prim) : null;
      if (shape === 'prim' && !prim) {
        rep.notes.push(`A shape SocriaUX does not know (“${String(o(r.prim).kind ?? '').slice(0, 24)}”) was left out.`);
        return null;
      }
      const bez = shape === 'bezier' ? normalizeBezier(r.bez) : null;
      if (shape === 'bezier' && !bez) {
        rep.notes.push('A path with no readable nodes was left out.');
        return null;
      }
      const stroked = !!prim && !!PRIMITIVE_BY_KIND.get(prim.kind)?.stroked;
      const st = o(r.stroke);
      return {
        ...baseOf(r, seen, 's'),
        type: 'shape',
        shape,
        ...(shape === 'rect' && r.radius !== undefined ? { radius: num(r.radius, 0, 10000, 0) } : {}),
        ...(shape === 'polygon' || shape === 'star' ? { sides: Math.round(num(r.sides, 3, 24, shape === 'star' ? 5 : 6)) } : {}),
        ...(shape === 'star' ? { inner: num(r.inner, 0.1, 0.95, 0.45) } : {}),
        ...(path ? { path } : {}),
        ...(recipe ? { recipe } : {}),
        ...(prim ? { prim } : {}),
        ...(bez ? { bez } : {}),
        ...(shape === 'bezier' && r.rule === 'evenodd' ? { rule: 'evenodd' as const } : {}),
        fill: shape === 'line' || stroked ? null : paint(r.fill, '#cccccc'),
        ...(r.stroke && typeof r.stroke === 'object'
          ? { stroke: strokeOf(st, '#111111') }
          : shape === 'line'
            ? { stroke: { color: '#111111', width: 2 } }
            : stroked
              ? { stroke: { color: typeof r.fill === 'string' ? colour(r.fill, '#111111') : '#111111', width: 2, join: 'round' as const, cap: 'round' as const } }
              : {}),
        ...((list) => (list.length ? { strokes: list } : {}))(a(r.strokes).slice(0, 4).filter((x) => x && typeof x === 'object').map((x) => strokeOf(x, '#111111'))),
      };
    }
    case 'image': {
      const asset = str(r.asset, 80);
      if (!assets.has(asset)) {
        rep.notes.push('A picture whose file is missing was left out.');
        return null;
      }
      const f = o(r.filter);
      const mask = r.mask === 'ellipse' ? 'ellipse' : r.mask ? normalizeRecipe(r.mask) : null;
      return {
        ...baseOf(r, seen, 'i'),
        type: 'image',
        asset,
        fit: pick(r.fit, ['cover', 'contain'] as const, 'cover'),
        ...(r.focus ? { focus: { x: num(o(r.focus).x, 0, 100, 50), y: num(o(r.focus).y, 0, 100, 50) } } : {}),
        ...(mask ? { mask } : {}),
        ...(r.radius !== undefined ? { radius: num(r.radius, 0, 10000, 0) } : {}),
        ...(r.filter ? { filter: { ...(f.grayscale !== undefined ? { grayscale: num(f.grayscale, 0, 1, 0) } : {}), ...(f.contrast !== undefined ? { contrast: num(f.contrast, 0.2, 3, 1) } : {}), ...(f.brightness !== undefined ? { brightness: num(f.brightness, 0.2, 3, 1) } : {}), ...(f.blur !== undefined ? { blur: num(f.blur, 0, 60, 0) } : {}) } } : {}),
        ...((adj) => (adj ? { adjust: adj } : {}))(adjustOf(r.adjust)),
        ...(r.crop && typeof r.crop === 'object'
          ? ((c) => {
              const x = num(c.x, 0, 0.98, 0);
              const y = num(c.y, 0, 0.98, 0);
              const w = num(c.w, 0.02, 1 - x, 1 - x);
              const h = num(c.h, 0.02, 1 - y, 1 - y);
              return x === 0 && y === 0 && w >= 0.999 && h >= 0.999 ? {} : { crop: { x, y, w, h } };
            })(o(r.crop))
          : {}),
      };
    }
    case 'group': {
      if (depth >= MAX_DEPTH) {
        rep.notes.push(`Groups nested deeper than ${MAX_DEPTH} were flattened away.`);
        return null;
      }
      const children = a(r.children)
        .map((c) => nodeOf(c, seen, assets, rep, depth + 1, count))
        .filter((c): c is Node => !!c);
      if (!children.length) return null;
      return {
        ...baseOf(r, seen, 'g'),
        type: 'group',
        children,
        ...(r.clip === true ? { clip: true } : {}),
        ...(r.mask === 'alpha' || r.mask === 'luminance' ? { mask: r.mask } : {}),
        ...((r.mask === 'alpha' || r.mask === 'luminance') && r.maskInvert === true ? { maskInvert: true } : {}),
        ...(r.isolate === true ? { isolate: true } : {}),
        ...(['union', 'subtract', 'intersect', 'exclude'].includes(r.boolean) ? { boolean: r.boolean as BoolMode } : {}),
      };
    }
    case 'chart': {
      const data = a(r.data)
        .map((d) => ({ label: str(o(d).label, 60).trim(), value: num(o(d).value, -1e12, 1e12, NaN), ...(typeof o(d).series === 'string' ? { series: str(o(d).series, 40) } : {}) }))
        .filter((d) => d.label && Number.isFinite(d.value))
        .slice(0, 40);
      if (!data.length) {
        rep.notes.push('A chart with no readable data was left out (SocriaUX does not invent numbers).');
        return null;
      }
      return {
        ...baseOf(r, seen, 'c'),
        type: 'chart',
        chart: pick(r.chart, ['bar', 'column', 'line', 'donut'] as const, 'column'),
        data,
        colors: a(r.colors)
          .map((c) => colour(c, ''))
          .filter(Boolean)
          .slice(0, 12),
        values: r.values !== false,
        font: str(r.font, 60, 'Inter') || 'Inter',
        color: colour(r.color, '#111111'),
        ...(typeof r.source === 'string' && r.source.trim() ? { source: r.source.trim().slice(0, 160) } : {}),
        ...(typeof r.unit === 'string' && r.unit.trim() ? { unit: r.unit.trim().slice(0, 6) } : {}),
      };
    }
    case 'pattern': {
      const gen = typeof r.gen === 'string' && PATTERN_BY_KIND.has(r.gen) ? r.gen : '';
      if (!gen) {
        rep.notes.push(`A pattern SocriaUX cannot generate (“${String(r.gen ?? '').slice(0, 24)}”) was left out.`);
        return null;
      }
      const colors = a(r.colors)
        .map((c) => parseColor(c))
        .filter((c): c is string => !!c)
        .slice(0, 4);
      const bound = r.bound === 'ellipse' ? 'ellipse' : r.bound && typeof r.bound === 'object' ? normalizePrim(r.bound) : null;
      return {
        ...baseOf(r, seen, 'p'),
        type: 'pattern',
        gen,
        params: normalizePatternParams(gen, r.params)!,
        colors: colors.length ? colors : ['#111111'],
        ...(bound ? { bound } : {}),
      };
    }
    default:
      if (r.type !== undefined) rep.notes.push(`An object of an unknown kind (“${String(r.type).slice(0, 20)}”) was left out.`);
      return null;
  }
}

const DEFAULT_TOKENS: Tokens = {
  colors: { background: '#f5f2ea', surface: '#ffffff', text: '#161512', muted: '#5d5a52', accent: '#2f3d1e', accentText: '#ffffff', line: '#d8d3c6' },
  fonts: { display: 'Fraunces', body: 'Inter' },
};

/** A document held to its shape (see the head of this file); null only when nothing usable is left. */
/** One picture record held to its shape; null for an address SocriaUX will not load (said in the notes). Only https,
 * data:image and the browser's own uploads are pictures; anything else (javascript:, file:, http:) is refused. */
export function normalizeAsset(x: unknown, rep: Repair = { notes: [] }): Asset | null {
  const s = o(x);
  const id = typeof s.id === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(s.id) ? s.id : '';
  const src = typeof s.src === 'string' ? s.src : '';
  const safe = /^https:\/\/[^\s"'<>`]+$/.test(src) || /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/.test(src) || /^upload:[\w-]{1,96}$/.test(src);
  if (!id || !safe) {
    if (id) rep.notes.push(`A picture with an address SocriaUX will not load (“${src.slice(0, 30)}”) was left out.`);
    return null;
  }
  return { id, kind: 'image', src: src.slice(0, 6_000_000), width: num(s.width, 1, 40000, 1000), height: num(s.height, 1, 40000, 1000), name: str(s.name, 120, 'Picture') || 'Picture', ...(typeof s.credit === 'string' ? { credit: s.credit.slice(0, 200) } : {}), source: pick(s.source, ['upload', 'library', 'made', 'generated'] as const, 'upload') };
}

export function normalizeDoc(v: unknown, rep: Repair = { notes: [] }): GraphicDoc | null {
  const r = o(v);
  if (r.schema !== undefined && r.schema !== GFX_SCHEMA) {
    const migrated = migrate(r, rep);
    if (!migrated) return null;
    return normalizeDoc(migrated, rep);
  }
  const t = o(r.tokens);
  const tc = o(t.colors);
  const tokens: Tokens = {
    colors: {
      background: colour(tc.background, DEFAULT_TOKENS.colors.background),
      surface: colour(tc.surface, DEFAULT_TOKENS.colors.surface),
      text: colour(tc.text, DEFAULT_TOKENS.colors.text),
      muted: colour(tc.muted, DEFAULT_TOKENS.colors.muted),
      accent: colour(tc.accent, DEFAULT_TOKENS.colors.accent),
      accentText: colour(tc.accentText, DEFAULT_TOKENS.colors.accentText),
      line: colour(tc.line, DEFAULT_TOKENS.colors.line),
    },
    fonts: { display: str(o(t.fonts).display, 60) || DEFAULT_TOKENS.fonts.display, body: str(o(t.fonts).body, 60) || DEFAULT_TOKENS.fonts.body },
    ...(colour(t.accent2, '') ? { accent2: colour(t.accent2, '') } : {}),
  };
  const assetIds = new Set<string>();
  const assets: Asset[] = [];
  for (const x of a(r.assets).slice(0, 200)) {
    const asset = normalizeAsset(x, rep);
    if (!asset || assetIds.has(asset.id)) continue;
    assetIds.add(asset.id);
    assets.push(asset);
  }
  const seen = new Set<string>();
  const count = { n: 0 };
  const artboards: Artboard[] = [];
  for (const x of a(r.artboards).slice(0, 60)) {
    const b = o(x);
    let id = typeof b.id === 'string' && /^[A-Za-z][\w-]{0,47}$/.test(b.id) ? b.id : newId('ab');
    while (seen.has(id)) id = newId('ab');
    seen.add(id);
    const unit = pick(b.unit, UNITS, 'px');
    const width = num(b.width, 16, 20000, 1080);
    const height = num(b.height, 16, 20000, 1080);
    artboards.push({
      id,
      name: str(b.name, 60, '').trim() || `Artboard ${artboards.length + 1}`,
      width,
      height,
      unit,
      dpi: num(b.dpi, 72, 1200, unit === 'pt' ? 300 : 72),
      ...(typeof b.format === 'string' ? { format: b.format.slice(0, 40) } : {}),
      background: b.background === null ? null : colour(b.background, tokens.colors.background),
      bleed: num(b.bleed, 0, Math.min(width, height) / 4, 0),
      safe: num(b.safe, 0, Math.min(width, height) / 3, Math.round(Math.min(width, height) * 0.06)),
      children: a(b.children)
        .map((c) => nodeOf(c, seen, assetIds, rep, 0, count))
        .filter((c): c is Node => !!c),
      ...(b.locked === true ? { locked: true } : {}),
      ...((cp) => (cp ? { composition: cp } : {}))(b.composition ? normalizeCompositionPlan(b.composition) : null),
    });
  }
  if (!artboards.length) return null;
  return {
    schema: GFX_SCHEMA,
    id: typeof r.id === 'string' && /^[\w-]{1,96}$/.test(r.id) ? r.id : newId('gd'),
    name: str(r.name, 100, '').trim() || 'Untitled graphic',
    ...(r.direction && typeof r.direction === 'object' ? { direction: { name: str(o(r.direction).name, 80), language: str(o(r.direction).language, 40) } } : {}),
    tokens,
    artboards,
    assets,
    ...((l) => (l.colors || l.fonts ? { locks: { ...(l.colors ? { colors: true } : {}), ...(l.fonts ? { fonts: true } : {}) } } : {}))({ colors: o(r.locks).colors === true, fonts: o(r.locks).fonts === true }),
    ...((sw) => (sw.length ? { swatches: sw } : {}))([...new Set(a(r.swatches).map((c) => parseColor(c)).filter((c): c is string => !!c))].slice(0, 32)),
    ...((v) => (v ? { vocabulary: v } : {}))(vocabularyOf(r.vocabulary)),
    ...((v) => (v ? { style: v } : {}))(normalizeSelection(r.style)),
    ...((m) => (m.length ? { compositionMemory: m } : {}))(normalizeMemory(r.compositionMemory)),
    revision: Math.round(num(r.revision, 0, 1e9, 0)),
    updatedAt: typeof r.updatedAt === 'number' && r.updatedAt > 0 ? Math.round(r.updatedAt) : Date.now(),
  };
}

/** A document of another schema brought to this one; null when it cannot be (said in the repair notes). */
export function migrate(r: Record<string, any>, rep: Repair): Record<string, any> | null {
  // schema 0 (unversioned drafts): the same shape without a schema number
  if (r.schema === 0) return { ...r, schema: GFX_SCHEMA };
  rep.notes.push(`A document of schema ${String(r.schema).slice(0, 8)} is newer than this version of SocriaUX can read.`);
  return null;
}

// ── finding things ──

export interface Located {
  node: Node;
  artboard: Artboard;
  /** the chain of groups above it, outermost first */
  parents: GroupNode[];
  /** its index among its siblings */
  index: number;
}

/** Every node of an artboard, depth first in drawing order, with where it is. */
export function walk(board: Artboard): Located[] {
  const out: Located[] = [];
  const go = (list: Node[], parents: GroupNode[]) =>
    list.forEach((node, index) => {
      out.push({ node, artboard: board, parents, index });
      if (node.type === 'group') go(node.children, [...parents, node]);
    });
  go(board.children, []);
  return out;
}

export function locate(doc: GraphicDoc, id: string): Located | null {
  for (const b of doc.artboards) for (const l of walk(b)) if (l.node.id === id) return l;
  return null;
}

/** A node's box in its artboard's coordinates (groups' offsets added; rotation not applied to the box). */
export function boxOnBoard(l: Located): { x: number; y: number; w: number; h: number } {
  const ox = l.parents.reduce((n, g) => n + g.x, 0);
  const oy = l.parents.reduce((n, g) => n + g.y, 0);
  return { x: l.node.x + ox, y: l.node.y + oy, w: l.node.w, h: l.node.h };
}

/** Whether a node or anything above it (a group, its artboard) is locked. */
export function isLocked(l: Located): boolean {
  return !!l.node.locked || !!l.artboard.locked || l.parents.some((g) => g.locked);
}

// ── operations: the only way a document changes ──

export type Op =
  | { op: 'add'; artboard: string; node: unknown; parent?: string; index?: number }
  | { op: 'update'; id: string; set: Record<string, unknown> }
  | { op: 'move'; id: string; dx: number; dy: number }
  | { op: 'resize'; id: string; x?: number; y?: number; w: number; h: number }
  | { op: 'remove'; id: string }
  | { op: 'reorder'; id: string; to: number }
  | { op: 'group'; ids: string[]; name?: string }
  | { op: 'ungroup'; id: string }
  | { op: 'duplicate'; id: string; dx?: number; dy?: number }
  | { op: 'asset'; asset: unknown }
  | { op: 'artboard-add'; artboard: unknown; after?: string }
  | { op: 'artboard-update'; id: string; set: Record<string, unknown> }
  | { op: 'artboard-duplicate'; id: string; name?: string }
  | { op: 'artboard-remove'; id: string }
  | { op: 'artboard-reorder'; id: string; to: number }
  | { op: 'tokens'; set: Record<string, unknown> }
  | { op: 'locks'; colors?: boolean; fonts?: boolean }
  // vector operations (vectorops.ts)
  | { op: 'boolean'; ids: string[]; mode: BoolMode; name?: string }
  | { op: 'flatten'; id: string }
  | { op: 'outline-stroke'; id: string }
  | { op: 'offset'; id: string; d: number }
  | { op: 'path'; id: string; action: 'simplify' | 'smooth' | 'reverse' | 'roughen' | 'close' | 'open'; amount?: number; seed?: number }
  | { op: 'combine'; ids: string[] }
  | { op: 'blend'; from: string; to: string; steps: number }
  | { op: 'repeat'; id: string; mode: 'linear' | 'radial' | 'grid'; count: number; dx?: number; dy?: number; rotate?: number; scale?: number; fade?: number; cols?: number; radius?: number }
  | { op: 'mirror'; id: string; axis: 'x' | 'y'; copy?: boolean }
  // arranging
  | { op: 'align'; ids: string[]; edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'; to?: 'selection' | 'parent' }
  | { op: 'distribute'; ids: string[]; axis: 'x' | 'y'; gap?: number }
  // compositing
  | { op: 'mask'; ids: string[]; mode: 'alpha' | 'luminance'; invert?: boolean; name?: string }
  // the document's own palette and vocabulary
  | { op: 'swatches'; set: string[] }
  | { op: 'vocabulary'; set: unknown }
  // the design language (null clears it)
  | { op: 'style'; set: unknown }
  // the compositions shown, chosen and turned down (composition/memory.ts), held to their bound
  | { op: 'composition-memory'; entries: unknown };

export type OpResult = { ok: true; doc: GraphicDoc; touched: string[]; notes: string[] } | { ok: false; error: string; locked?: string[] };

/** Fields an update may set on a node (its id, type and children change only through other operations). */
const FIXED = new Set(['id', 'type', 'children']);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A node's box as its parent sees it: the bounds of the turned box (rotation, skew and flip applied). */
export function outerBox(n: Node): { x: number; y: number; w: number; h: number } {
  if (!n.rotation && !n.skewX && !n.skewY) return { x: n.x, y: n.y, w: n.w, h: n.h };
  const m = nodeMatrix(n);
  const pts = [[0, 0], [n.w, 0], [n.w, n.h], [0, n.h]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const mixHex = (p: string, q: string, t: number): string => {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(p, i) + (c(q, i) - c(p, i)) * t).toString(16).padStart(2, '0')).join('')}`;
};
const interpolate = (a0: BezierPath, b0: BezierPath, t: number): BezierPath | null => {
  // node by node where the two paths share their structure, else both resampled to a common one
  if (a0.subpaths.length === b0.subpaths.length && a0.subpaths.every((s, i) => s.nodes.length === b0.subpaths[i].nodes.length)) {
    return {
      subpaths: a0.subpaths.map((s, i) => ({
        closed: s.closed,
        nodes: s.nodes.map((nd, k) => {
          const q = b0.subpaths[i].nodes[k];
          const mixP = (u: [number, number] | undefined, v: [number, number] | undefined, du: [number, number], dv: [number, number]): [number, number] | undefined => (u || v ? [(u ?? du)[0] + ((v ?? dv)[0] - (u ?? du)[0]) * t, (u ?? du)[1] + ((v ?? dv)[1] - (u ?? du)[1]) * t] : undefined);
          const o2: { x: number; y: number; in?: [number, number]; out?: [number, number] } = { x: nd.x + (q.x - nd.x) * t, y: nd.y + (q.y - nd.y) * t };
          const i2 = mixP(nd.in, q.in, [nd.x, nd.y], [q.x, q.y]);
          const o3 = mixP(nd.out, q.out, [nd.x, nd.y], [q.x, q.y]);
          if (i2) o2.in = i2;
          if (o3) o2.out = o3;
          return o2;
        }),
      })),
    };
  }
  return blendPaths(a0, b0, t);
};

function reId(n: Node, seen: Set<string>): Node {
  let id = newId(n.id.charAt(0));
  while (seen.has(id)) id = newId(n.id.charAt(0));
  seen.add(id);
  return n.type === 'group' ? { ...n, id, children: n.children.map((c) => reId(c, seen)) } : { ...n, id };
}

const allIds = (doc: GraphicDoc): Set<string> => new Set(doc.artboards.flatMap((b) => [b.id, ...walk(b).map((l) => l.node.id)]));

/** The list a node lives in (an artboard's children or a group's), to change in place on a cloned document. */
function siblings(doc: GraphicDoc, id: string): { list: Node[]; index: number; board: Artboard } | null {
  for (const b of doc.artboards) {
    const find = (list: Node[]): { list: Node[]; index: number } | null => {
      const i = list.findIndex((n) => n.id === id);
      if (i >= 0) return { list, index: i };
      for (const n of list) if (n.type === 'group') {
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    const hit = find(b.children);
    if (hit) return { ...hit, board: b };
  }
  return null;
}

/**
 * One operation, validated and applied as a whole (or not at all). `force` lets an operation touch what is locked:
 * only ever passed when the designer said so.
 */
export function applyOp(doc0: GraphicDoc, op: Op, opts: { force?: boolean } = {}): OpResult {
  const doc = clone(doc0);
  const notes: string[] = [];
  const lockedHit = (id: string): string | null => {
    const l = locate(doc, id);
    return l && isLocked(l) && !opts.force ? (l.node.name ?? l.node.role ?? l.node.type) : null;
  };
  const done = (touched: string[]): OpResult => {
    const rep: Repair = { notes: [] };
    const checked = normalizeDoc({ ...doc, revision: doc0.revision + 1, updatedAt: Date.now() }, rep);
    if (!checked) return { ok: false, error: 'The change would leave the design empty.' };
    return { ok: true, doc: checked, touched, notes: [...notes, ...rep.notes] };
  };
  /** Objects side by side in one layer gathered into a new group (in drawing order, the bottom one first). */
  const gatherGroup = (ids0: string[], extra: Partial<GroupNode>, check?: (n: Node) => string | null): { id: string } | { ok: false; error: string; locked?: string[] } => {
    const ids = [...new Set(ids0)];
    if (ids.length < 2) return { ok: false, error: 'This needs two objects or more.' };
    const first = siblings(doc, ids[0]);
    if (!first) return { ok: false, error: 'Those objects are not in the design.' };
    const members = ids.map((id) => siblings(doc, id));
    if (members.some((m) => !m || m.list !== first.list)) return { ok: false, error: 'Only objects side by side in the same layer can be combined this way.' };
    const locked = ids.map(lockedHit).filter((x): x is string => !!x);
    if (locked.length) return { ok: false, error: `${locked.map((x) => `“${x}”`).join(', ')} ${locked.length > 1 ? 'are' : 'is'} locked.`, locked };
    const nodes = members.map((m) => m!.list[m!.index]).sort((p, q) => first.list.indexOf(p) - first.list.indexOf(q));
    for (const n of nodes) {
      const why = check?.(n);
      if (why) return { ok: false, error: why };
    }
    const bounds = nodes.map((n) => outerBox(n));
    const x = Math.min(...bounds.map((b) => b.x));
    const y = Math.min(...bounds.map((b) => b.y));
    const w = Math.max(...bounds.map((b) => b.x + b.w)) - x;
    const h = Math.max(...bounds.map((b) => b.y + b.h)) - y;
    const at = Math.min(...nodes.map((n) => first.list.indexOf(n)));
    const group: GroupNode = { id: newId('g'), type: 'group', name: 'Group', x, y, w: Math.max(1, w), h: Math.max(1, h), rotation: 0, opacity: 1, ...extra, children: nodes.map((n) => ({ ...n, x: n.x - x, y: n.y - y }) as Node) };
    for (const n of nodes) first.list.splice(first.list.indexOf(n), 1);
    first.list.splice(at, 0, group);
    return { id: group.id };
  };
  /** A shape (or a live boolean group) replaced by, or joined by, a path node. */
  const pathNode = (base: Node, path: BezierPath | null, extra: Partial<ShapeNode> = {}): ShapeNode | null => {
    const placed = path ? asBezierNode(path) : null;
    if (!placed) return null;
    const keep = base as unknown as Record<string, unknown>;
    const node: Record<string, unknown> = { ...keep, type: 'shape', shape: 'bezier', ...placed, rotation: 0 };
    for (const k of ['radius', 'sides', 'inner', 'path', 'recipe', 'prim', 'skewX', 'skewY', 'flipX', 'flipY', 'children', 'boolean', 'clip', 'mask', 'maskInvert', 'isolate']) delete node[k];
    Object.assign(node, extra);
    if (node.fill === undefined) node.fill = '#cccccc';
    return node as unknown as ShapeNode;
  };
  const shapeAt = (id: string): { s: NonNullable<ReturnType<typeof siblings>>; n: ShapeNode } | { ok: false; error: string; locked?: string[] } => {
    const hit = lockedHit(id);
    if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
    const s = siblings(doc, id);
    if (!s) return { ok: false, error: 'That object is not in the design.' };
    const n = s.list[s.index];
    if (n.type !== 'shape') return { ok: false, error: n.type === 'text' ? 'Text stays text in SocriaUX (its words remain editable); this works on shapes.' : 'This works on shapes.' };
    return { s, n };
  };
  switch (op.op) {
    case 'add': {
      const board = doc.artboards.find((b) => b.id === op.artboard);
      if (!board) return { ok: false, error: 'That artboard is not in the design.' };
      if (board.locked && !opts.force) return { ok: false, error: 'That artboard is locked.', locked: [board.name] };
      const rep: Repair = { notes: [] };
      const node = nodeOf(op.node, allIds(doc), new Set(doc.assets.map((x) => x.id)), rep, 0, { n: 0 });
      if (!node) return { ok: false, error: rep.notes[0] ?? 'That object is not valid.' };
      let list = board.children;
      if (op.parent) {
        const g = locate(doc, op.parent);
        if (!g || g.node.type !== 'group') return { ok: false, error: 'That group is not in the design.' };
        list = g.node.children;
      }
      const at = op.index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.round(op.index)));
      list.splice(at, 0, node);
      return done([node.id]);
    }
    case 'update': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      if (!opts.force && doc.locks?.colors && ['color', 'fill', 'stroke', 'strokes', 'colors'].some((k) => k in op.set)) return { ok: false, error: 'The colours are locked for this design.', locked: ['the colours'] };
      if (!opts.force && doc.locks?.fonts && (['font', 'weight', 'italic'].some((k) => k in op.set) || a(op.set.runs).some((x) => typeof o(x).font === 'string'))) return { ok: false, error: 'The typefaces are locked for this design.', locked: ['the typefaces'] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const cur = s.list[s.index] as unknown as Record<string, unknown>;
      const next: Record<string, unknown> = { ...cur };
      for (const [k, v] of Object.entries(op.set)) {
        if (FIXED.has(k)) continue;
        if (v === null && k !== 'fill' && k !== 'mask' && k !== 'background') delete next[k];
        else next[k] = v;
      }
      const rep: Repair = { notes: [] };
      const others = allIds(doc);
      others.delete(op.id);
      const node = nodeOf(next, others, new Set(doc.assets.map((x) => x.id)), rep, 0, { n: 0 });
      if (!node || node.id !== op.id) return { ok: false, error: rep.notes[0] ?? 'That change would make the object invalid.' };
      s.list[s.index] = node;
      notes.push(...rep.notes);
      return done([op.id]);
    }
    case 'move': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const n = s.list[s.index];
      s.list[s.index] = { ...n, x: n.x + (Number(op.dx) || 0), y: n.y + (Number(op.dy) || 0) } as Node;
      return done([op.id]);
    }
    case 'resize': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const n = s.list[s.index];
      const w = Math.max(1, Number(op.w) || n.w);
      const h = Math.max(1, Number(op.h) || n.h);
      // a group's children scale with it
      const scaled = n.type === 'group' ? { ...n, children: n.children.map((c) => scaleNode(c, w / n.w, h / n.h)) } : n;
      s.list[s.index] = { ...scaled, x: op.x ?? n.x, y: op.y ?? n.y, w, h } as Node;
      return done([op.id]);
    }
    case 'remove': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      s.list.splice(s.index, 1);
      return done([op.id]);
    }
    case 'reorder': {
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const [n] = s.list.splice(s.index, 1);
      s.list.splice(Math.max(0, Math.min(s.list.length, Math.round(op.to))), 0, n);
      return done([op.id]);
    }
    case 'group': {
      const g = gatherGroup(op.ids, { name: op.name?.slice(0, 60) || 'Group' });
      return 'error' in g ? g : done([g.id]);
    }
    case 'ungroup': {
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That group is not in the design.' };
      const g = s.list[s.index];
      if (g.type !== 'group') return { ok: false, error: 'That is not a group.' };
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      s.list.splice(s.index, 1, ...g.children.map((c) => ({ ...c, x: c.x + g.x, y: c.y + g.y, opacity: c.opacity * g.opacity }) as Node));
      return done(g.children.map((c) => c.id));
    }
    case 'duplicate': {
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const copy = reId(clone(s.list[s.index]), allIds(doc));
      const placed = { ...copy, x: copy.x + (op.dx ?? 24), y: copy.y + (op.dy ?? 24), locked: undefined } as Node;
      delete (placed as Partial<Base>).locked;
      s.list.splice(s.index + 1, 0, placed);
      return done([placed.id]);
    }
    case 'asset': {
      const tmp = normalizeDoc({ ...doc, assets: [...doc.assets, op.asset] }, { notes: [] });
      if (!tmp || tmp.assets.length !== doc.assets.length + 1) return { ok: false, error: 'That picture could not be added (its address or kind is not one SocriaUX loads).' };
      doc.assets = tmp.assets;
      return done([tmp.assets[tmp.assets.length - 1].id]);
    }
    case 'artboard-add': {
      const tmp = normalizeDoc({ ...doc, artboards: [op.artboard] }, { notes: [] });
      if (!tmp) return { ok: false, error: 'That artboard is not valid.' };
      const ids = allIds(doc);
      const board = { ...tmp.artboards[0], id: ids.has(tmp.artboards[0].id) ? newId('ab') : tmp.artboards[0].id, children: tmp.artboards[0].children.map((c) => reId(c, ids)) };
      const at = op.after ? doc.artboards.findIndex((b) => b.id === op.after) + 1 : doc.artboards.length;
      doc.artboards.splice(at > 0 ? at : doc.artboards.length, 0, board);
      return done([board.id]);
    }
    case 'artboard-update': {
      const b = doc.artboards.find((x) => x.id === op.id);
      if (!b) return { ok: false, error: 'That artboard is not in the design.' };
      const allowed = ['name', 'width', 'height', 'background', 'bleed', 'safe', 'dpi', 'locked', 'format', 'unit'];
      for (const [k, v] of Object.entries(op.set)) if (allowed.includes(k)) (b as unknown as Record<string, unknown>)[k] = v;
      // the record of how it was composed: held to the composition schema, or removed
      if ('composition' in op.set) {
        const cp = op.set.composition === null ? null : normalizeCompositionPlan(op.set.composition);
        if (op.set.composition !== null && !cp) return { ok: false, error: 'That is not a composition plan SocriaUX can use.' };
        if (cp) b.composition = cp;
        else delete b.composition;
      }
      return done([b.id]);
    }
    case 'artboard-duplicate': {
      const b = doc.artboards.find((x) => x.id === op.id);
      if (!b) return { ok: false, error: 'That artboard is not in the design.' };
      const ids = allIds(doc);
      const copy: Artboard = { ...clone(b), id: newId('ab'), name: op.name?.slice(0, 60) || `${b.name} copy`, children: clone(b.children).map((c) => reId(c, ids)) };
      delete copy.locked;
      doc.artboards.splice(doc.artboards.indexOf(b) + 1, 0, copy);
      return done([copy.id]);
    }
    case 'artboard-remove': {
      if (doc.artboards.length < 2) return { ok: false, error: 'A design keeps at least one artboard.' };
      const i = doc.artboards.findIndex((x) => x.id === op.id);
      if (i < 0) return { ok: false, error: 'That artboard is not in the design.' };
      if (doc.artboards[i].locked && !opts.force) return { ok: false, error: 'That artboard is locked.', locked: [doc.artboards[i].name] };
      doc.artboards.splice(i, 1);
      return done([op.id]);
    }
    case 'artboard-reorder': {
      const i = doc.artboards.findIndex((x) => x.id === op.id);
      if (i < 0) return { ok: false, error: 'That artboard is not in the design.' };
      const [b] = doc.artboards.splice(i, 1);
      doc.artboards.splice(Math.max(0, Math.min(doc.artboards.length, Math.round(op.to))), 0, b);
      return done([op.id]);
    }
    case 'tokens': {
      const s = o(op.set);
      if (!opts.force && ((doc.locks?.colors && s.colors) || (doc.locks?.fonts && s.fonts))) return { ok: false, error: 'That part of the design system is locked.', locked: [doc.locks?.colors && s.colors ? 'the colours' : 'the typefaces'] };
      doc.tokens = { ...doc.tokens, ...(s.colors ? { colors: { ...doc.tokens.colors, ...o(s.colors) } } : {}), ...(s.fonts ? { fonts: { ...doc.tokens.fonts, ...o(s.fonts) } } : {}) } as Tokens;
      return done([]);
    }
    case 'locks': {
      doc.locks = { ...(doc.locks ?? {}), ...(op.colors !== undefined ? { colors: op.colors } : {}), ...(op.fonts !== undefined ? { fonts: op.fonts } : {}) };
      return done([]);
    }
    case 'boolean': {
      if (!['union', 'subtract', 'intersect', 'exclude'].includes(op.mode)) return { ok: false, error: 'A boolean is a union, a subtraction, an intersection or an exclusion.' };
      const g = gatherGroup(op.ids, { name: op.name?.slice(0, 60) || ({ union: 'Union', subtract: 'Subtraction', intersect: 'Intersection', exclude: 'Exclusion' } as const)[op.mode], boolean: op.mode }, (n) => (n.type === 'shape' || (n.type === 'group' && n.boolean) ? null : 'Booleans combine shapes; text, pictures and charts take no part.'));
      if ('error' in g) return g;
      const made = locate(doc, g.id)!.node as GroupNode;
      if (!booleanPath(made.children, op.mode).subpaths.length) notes.push('The shapes do not overlap in a way that leaves anything for this boolean.');
      return done([g.id]);
    }
    case 'flatten': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const n = s.list[s.index];
      if (n.type === 'group' && n.boolean) {
        const firstShape = n.children.find((c): c is ShapeNode => c.type === 'shape');
        const path = transformPath(booleanPath(n.children, n.boolean), nodeMatrix(n));
        const node = pathNode(n, path, { fill: firstShape?.fill ?? '#cccccc', ...(firstShape?.stroke ? { stroke: firstShape.stroke } : {}), ...(firstShape?.strokes ? { strokes: firstShape.strokes } : {}) });
        if (!node) return { ok: false, error: 'The boolean leaves nothing to keep.' };
        s.list[s.index] = node;
        return done([op.id]);
      }
      if (n.type !== 'shape') return { ok: false, error: n.type === 'text' ? 'Text stays text in SocriaUX (its words remain editable); converting letters to outlines is not offered.' : 'Only shapes and booleans become paths.' };
      if (n.shape === 'bezier' && !n.rotation && !n.skewX && !n.skewY && !n.flipX && !n.flipY) return done([op.id]);
      const prim = n.prim ? PRIMITIVE_BY_KIND.get(n.prim.kind) : undefined;
      const evenodd = n.shape === 'path' || n.shape === 'recipe' || !!prim?.evenodd;
      const node = pathNode(n, shapeInParent(n), evenodd ? { rule: 'evenodd' } : {});
      if (!node) return { ok: false, error: 'That shape has no outline to convert.' };
      s.list[s.index] = node;
      return done([op.id]);
    }
    case 'outline-stroke': {
      const t = shapeAt(op.id);
      if ('error' in t) return t;
      const { s, n } = t;
      if (!n.stroke) return { ok: false, error: 'That shape has no stroke to outline.' };
      const outline = pathNode(n, strokeOutline(n), { fill: n.stroke.color, name: `${n.name ?? 'Shape'} outline`.slice(0, 60) });
      if (!outline) return { ok: false, error: 'The stroke could not be outlined.' };
      delete (outline as Partial<ShapeNode>).stroke;
      delete (outline as Partial<ShapeNode>).strokes;
      if (n.fill === null) {
        s.list[s.index] = outline;
        return done([op.id]);
      }
      outline.id = newId('s');
      const kept = { ...n } as ShapeNode;
      delete kept.stroke;
      s.list.splice(s.index, 1, kept, outline);
      return done([n.id, outline.id]);
    }
    case 'offset': {
      const t = shapeAt(op.id);
      if ('error' in t) return t;
      const { s, n } = t;
      const d = Math.max(-2000, Math.min(2000, Number(op.d) || 0));
      if (!d) return { ok: false, error: 'An offset needs a distance.' };
      const made = pathNode(n, offsetOutline(n, d), { id: newId('s'), name: `${n.name ?? 'Shape'} offset`.slice(0, 60), fill: n.fill ?? n.stroke?.color ?? '#cccccc' });
      if (!made) return { ok: false, error: 'That offset leaves nothing (the shape is smaller than the inset).' };
      delete (made as Partial<ShapeNode>).locked;
      s.list.splice(d > 0 ? s.index : s.index + 1, 0, made);
      return done([made.id]);
    }
    case 'path': {
      const t = shapeAt(op.id);
      if ('error' in t) return t;
      const { s, n } = t;
      const local = shapeBezier(n);
      if (!local) return { ok: false, error: 'That shape has no outline to edit.' };
      let p = local;
      const amt = Number(op.amount);
      if (op.action === 'simplify') p = simplifyPath(p, Number.isFinite(amt) && amt > 0 ? Math.min(200, amt) : 1.5);
      else if (op.action === 'smooth') p = smoothPath(p);
      else if (op.action === 'reverse') p = reversePath(p);
      else if (op.action === 'roughen') p = distortPath(p, Number.isFinite(amt) && amt > 0 ? Math.min(400, amt) : Math.max(2, Math.min(n.w, n.h) * 0.04), 6, Math.round(Number(op.seed) || 3));
      else if (op.action === 'close') p = { subpaths: p.subpaths.map((x) => ({ ...x, closed: x.nodes.length >= 3 })) };
      else if (op.action === 'open') p = { subpaths: p.subpaths.map((x) => ({ ...x, closed: false })) };
      else return { ok: false, error: 'That path operation is not one SocriaUX knows.' };
      const prim = n.prim ? PRIMITIVE_BY_KIND.get(n.prim.kind) : undefined;
      const turned = !!(n.rotation || n.skewX || n.skewY || n.flipX || n.flipY);
      const b = asBezierNode(p);
      if (!b) return { ok: false, error: 'That would leave the path empty.' };
      const next = { ...n, shape: 'bezier', bez: turned ? mapPath(p, (x, y) => [(x / n.w) * 100, (y / n.h) * 100]) : b.bez, ...(turned ? {} : { x: n.x + b.x, y: n.y + b.y, w: b.w, h: b.h }), ...(n.shape === 'path' || n.shape === 'recipe' || prim?.evenodd ? { rule: 'evenodd' } : {}) } as ShapeNode;
      for (const k of ['radius', 'sides', 'inner', 'path', 'recipe', 'prim'] as const) delete (next as Partial<ShapeNode>)[k];
      s.list[s.index] = next;
      return done([op.id]);
    }
    case 'combine': {
      const ids = [...new Set(op.ids)];
      if (ids.length < 2) return { ok: false, error: 'Combining needs two shapes or more.' };
      const first = siblings(doc, ids[0]);
      const members = ids.map((id) => siblings(doc, id));
      if (!first || members.some((m) => !m || m.list !== first.list)) return { ok: false, error: 'Only shapes side by side in the same layer can be combined.' };
      const locked = ids.map(lockedHit).filter((x): x is string => !!x);
      if (locked.length) return { ok: false, error: `${locked.map((x) => `“${x}”`).join(', ')} ${locked.length > 1 ? 'are' : 'is'} locked.`, locked };
      const nodes = members.map((m) => m!.list[m!.index]).sort((p, q) => first.list.indexOf(p) - first.list.indexOf(q));
      if (nodes.some((n) => n.type !== 'shape')) return { ok: false, error: 'Only shapes can be combined into one path.' };
      const subpaths = nodes.flatMap((n) => shapeInParent(n as ShapeNode)?.subpaths ?? []);
      const made = pathNode(nodes[0], { subpaths }, { rule: 'evenodd' });
      if (!made) return { ok: false, error: 'Those shapes have no outlines to combine.' };
      const at = first.list.indexOf(nodes[0]);
      for (const n of nodes) first.list.splice(first.list.indexOf(n), 1);
      first.list.splice(at, 0, made);
      return done([made.id]);
    }
    case 'blend': {
      const A = siblings(doc, op.from);
      const B = siblings(doc, op.to);
      if (!A || !B || A.list !== B.list) return { ok: false, error: 'A blend runs between two shapes side by side in the same layer.' };
      const na = A.list[A.index];
      const nb = B.list[B.index];
      if (na.type !== 'shape' || nb.type !== 'shape') return { ok: false, error: 'A blend runs between two shapes.' };
      const pa = shapeInParent(na);
      const pb = shapeInParent(nb);
      if (!pa || !pb) return { ok: false, error: 'Those shapes have no outlines to blend.' };
      const steps = Math.max(1, Math.min(60, Math.round(Number(op.steps) || 5)));
      const kids: Node[] = [];
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        const path = interpolate(pa, pb, t);
        const fill = typeof na.fill === 'string' && typeof nb.fill === 'string' ? mixHex(na.fill, nb.fill, t) : na.fill;
        const made = pathNode(na, path, { id: newId('s'), name: `Blend step ${i}`, fill, opacity: na.opacity + (nb.opacity - na.opacity) * t, ...(na.stroke ? { stroke: { ...na.stroke, ...(nb.stroke ? { width: na.stroke.width + (nb.stroke.width - na.stroke.width) * t, color: mixHex(na.stroke.color, nb.stroke.color, t) } : {}) } } : {}) });
        if (made) {
          delete (made as Partial<ShapeNode>).locked;
          kids.push(made);
        }
      }
      if (!kids.length) return { ok: false, error: 'Those shapes could not be blended.' };
      const bounds = kids.map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h }));
      const gx = Math.min(...bounds.map((b) => b.x));
      const gy = Math.min(...bounds.map((b) => b.y));
      const group: GroupNode = { id: newId('g'), type: 'group', name: 'Blend', x: gx, y: gy, w: Math.max(1, Math.max(...bounds.map((b) => b.x + b.w)) - gx), h: Math.max(1, Math.max(...bounds.map((b) => b.y + b.h)) - gy), rotation: 0, opacity: 1, children: kids.map((k) => ({ ...k, x: k.x - gx, y: k.y - gy }) as Node) };
      A.list.splice(Math.min(A.index, B.index) + 1, 0, group);
      return done([group.id]);
    }
    case 'repeat': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const n = s.list[s.index];
      const count = Math.max(1, Math.min(op.mode === 'grid' ? 400 : 120, Math.round(Number(op.count) || 4)));
      const ids = allIds(doc);
      const kids: Node[] = [n];
      const cx0 = n.x + n.w / 2;
      const cy0 = n.y + n.h / 2;
      const R = Number.isFinite(op.radius) ? Number(op.radius) : Math.max(n.w, n.h) * 1.2;
      const fade = Math.max(0, Math.min(1, Number(op.fade) || 0));
      for (let i = 1; i < count; i++) {
        let copy = reId(clone(n), ids);
        delete (copy as Partial<Base>).locked;
        if (op.mode === 'radial') {
          const ang = (i / count) * Math.PI * 2;
          const c = [cx0 - cx0, cy0 - (cy0 + R)];
          const rx = c[0] * Math.cos(ang) - c[1] * Math.sin(ang);
          const ry = c[0] * Math.sin(ang) + c[1] * Math.cos(ang);
          copy = { ...copy, x: cx0 + rx - n.w / 2, y: cy0 + R + ry - n.h / 2, rotation: ((n.rotation + (ang * 180) / Math.PI + 540) % 360) - 180 } as Node;
        } else if (op.mode === 'grid') {
          const cols = Math.max(1, Math.round(Number(op.cols) || Math.ceil(Math.sqrt(count))));
          copy = { ...copy, x: n.x + (i % cols) * (Number(op.dx) || n.w * 1.25), y: n.y + Math.floor(i / cols) * (Number(op.dy) || n.h * 1.25) } as Node;
        } else {
          const k = Math.pow(Math.max(0.2, Math.min(3, Number(op.scale) || 1)), i);
          const scaled = k !== 1 ? scaleNode(copy, k, k) : copy;
          const w = scaled.w;
          const h = scaled.h;
          copy = { ...scaled, x: cx0 + (Number(op.dx) || 0) * i - w / 2, y: cy0 + (Number(op.dy) || 0) * i - h / 2, rotation: ((n.rotation + (Number(op.rotate) || 0) * i + 540) % 360) - 180 } as Node;
          if (!op.dx && !op.dy && !op.rotate && (Number(op.scale) || 1) === 1) copy = { ...copy, x: n.x + n.w * 1.2 * i } as Node;
        }
        if (fade) copy = { ...copy, opacity: Math.max(0, n.opacity * (1 - (fade * i) / Math.max(1, count - 1))) } as Node;
        kids.push(copy);
      }
      const bounds = kids.map(outerBox);
      const gx = Math.min(...bounds.map((b) => b.x));
      const gy = Math.min(...bounds.map((b) => b.y));
      const group: GroupNode = { id: newId('g'), type: 'group', name: op.mode === 'radial' ? 'Radial repeat' : op.mode === 'grid' ? 'Grid repeat' : 'Repeat', x: gx, y: gy, w: Math.max(1, Math.max(...bounds.map((b) => b.x + b.w)) - gx), h: Math.max(1, Math.max(...bounds.map((b) => b.y + b.h)) - gy), rotation: 0, opacity: 1, children: kids.map((k) => ({ ...k, x: k.x - gx, y: k.y - gy }) as Node) };
      s.list.splice(s.index, 1, group);
      return done([group.id]);
    }
    case 'mirror': {
      const hit = lockedHit(op.id);
      if (hit) return { ok: false, error: `“${hit}” is locked.`, locked: [hit] };
      const s = siblings(doc, op.id);
      if (!s) return { ok: false, error: 'That object is not in the design.' };
      const n = s.list[s.index];
      const key = op.axis === 'y' ? 'flipY' : 'flipX';
      if (!op.copy) {
        s.list[s.index] = { ...n, [key]: !(n as Base)[key] } as Node;
        return done([op.id]);
      }
      const copy = reId(clone(n), allIds(doc));
      delete (copy as Partial<Base>).locked;
      const placed = { ...copy, [key]: !(n as Base)[key], ...(op.axis === 'y' ? { y: n.y + n.h } : { x: n.x + n.w }) } as Node;
      s.list.splice(s.index + 1, 0, placed);
      return done([placed.id]);
    }
    case 'align':
    case 'distribute': {
      const ids = [...new Set(op.ids)];
      const first = ids.length ? siblings(doc, ids[0]) : null;
      if (!first) return { ok: false, error: 'Those objects are not in the design.' };
      const members = ids.map((id) => siblings(doc, id));
      if (members.some((m) => !m || m.list !== first.list)) return { ok: false, error: 'Only objects in the same layer can be lined up together.' };
      const nodes = members.map((m) => m!.list[m!.index]);
      const free = nodes.filter((n) => !lockedHit(n.id));
      if (!free.length) return { ok: false, error: 'Those objects are locked.', locked: nodes.map((n) => n.name ?? n.type) };
      const parent = (() => {
        for (const b of doc.artboards) if (b.children === first.list) return { x: 0, y: 0, w: b.width, h: b.height };
        const g = walk(first.board).find((l) => l.node.type === 'group' && l.node.children === first.list)?.node;
        return { x: 0, y: 0, w: g?.w ?? 0, h: g?.h ?? 0 };
      })();
      const set = (n: Node, x: number, y: number) => {
        const i = first.list.indexOf(n);
        first.list[i] = { ...n, x, y } as Node;
      };
      if (op.op === 'align') {
        const ref = op.to === 'parent' || nodes.length < 2 ? parent : { x: Math.min(...nodes.map((n) => n.x)), y: Math.min(...nodes.map((n) => n.y)), w: Math.max(...nodes.map((n) => n.x + n.w)) - Math.min(...nodes.map((n) => n.x)), h: Math.max(...nodes.map((n) => n.y + n.h)) - Math.min(...nodes.map((n) => n.y)) };
        for (const n of free) {
          const x = op.edge === 'left' ? ref.x : op.edge === 'center' ? ref.x + (ref.w - n.w) / 2 : op.edge === 'right' ? ref.x + ref.w - n.w : n.x;
          const y = op.edge === 'top' ? ref.y : op.edge === 'middle' ? ref.y + (ref.h - n.h) / 2 : op.edge === 'bottom' ? ref.y + ref.h - n.h : n.y;
          set(n, x, y);
        }
        return done(free.map((n) => n.id));
      }
      if (nodes.length < 3 && op.gap === undefined) return { ok: false, error: 'Spacing evenly needs three objects or more.' };
      const ax = op.axis === 'y' ? 'y' : 'x';
      const size = ax === 'x' ? 'w' : 'h';
      const sorted = [...nodes].sort((p, q) => p[ax] - q[ax]);
      const span = sorted[sorted.length - 1][ax] + sorted[sorted.length - 1][size] - sorted[0][ax];
      const gap = op.gap !== undefined && Number.isFinite(op.gap) ? Number(op.gap) : (span - sorted.reduce((t, n) => t + n[size], 0)) / (sorted.length - 1);
      let at = sorted[0][ax];
      for (const n of sorted) {
        if (!lockedHit(n.id)) set(n, ax === 'x' ? at : n.x, ax === 'y' ? at : n.y);
        at += n[size] + gap;
      }
      return done(free.map((n) => n.id));
    }
    case 'mask': {
      const g = gatherGroup(op.ids, { name: op.name?.slice(0, 60) || 'Mask group', mask: op.mode === 'luminance' ? 'luminance' : 'alpha', ...(op.invert ? { maskInvert: true } : {}) });
      return 'error' in g ? g : done([g.id]);
    }
    case 'swatches': {
      doc.swatches = a(op.set).map((c) => parseColor(c)).filter((c): c is string => !!c).slice(0, 32);
      return done([]);
    }
    case 'vocabulary': {
      const v = vocabularyOf(op.set);
      if (v) doc.vocabulary = v;
      else delete doc.vocabulary;
      return done([]);
    }
    case 'composition-memory': {
      const m = normalizeMemory(op.entries);
      if (m.length) doc.compositionMemory = m;
      else delete doc.compositionMemory;
      return done([]);
    }
    case 'style': {
      if (op.set === null) {
        delete doc.style;
        return done([]);
      }
      const v = normalizeSelection(op.set);
      if (!v) return { ok: false, error: 'That is not a style SocriaUX has.' };
      doc.style = v;
      return done([]);
    }
  }
  return { ok: false, error: 'That operation is not one SocriaUX knows.' };
}

/** Several operations as one change: all applied, or none (the first failure is said, the document unchanged). */
export function applyOps(doc: GraphicDoc, ops: readonly Op[], opts: { force?: boolean } = {}): OpResult {
  let cur = doc;
  const touched: string[] = [];
  const notes: string[] = [];
  for (const op of ops) {
    const r = applyOp(cur, op, opts);
    if (!r.ok) return r;
    cur = r.doc;
    touched.push(...r.touched);
    notes.push(...r.notes);
  }
  return { ok: true, doc: { ...cur, revision: doc.revision + 1 }, touched, notes };
}

/** A node scaled by (sx, sy) about its parent's origin: its box, its text and strokes in proportion. */
const PX_EFFECT_KEYS = new Set(['dx', 'dy', 'blur', 'spread', 'size', 'width', 'radius', 'distance', 'depth', 'offset', 'amplitude', 'wavelength']);
const scaleEffects = (effects: Effect[] | undefined, k: number) => effects?.map((e) => ({ ...e, params: Object.fromEntries(Object.entries(e.params).map(([key, v]) => [key, PX_EFFECT_KEYS.has(key) ? v * k : v])) }));

export function scaleNode(n: Node, sx: number, sy: number): Node {
  const k = Math.sqrt(Math.abs(sx * sy)) || 1;
  const base = { ...n, x: n.x * sx, y: n.y * sy, w: Math.max(1, n.w * sx), h: Math.max(1, n.h * sy), ...(n.effects ? { effects: scaleEffects(n.effects, k) } : {}) };
  if (n.type === 'text') return { ...(base as TextNode), size: Math.max(4, n.size * k), ...(n.stroke ? { stroke: { ...n.stroke, width: n.stroke.width * k } } : {}), ...(n.repeat ? { repeat: { ...n.repeat, dx: n.repeat.dx * k, dy: n.repeat.dy * k } } : {}) };
  if (n.type === 'shape') return { ...(base as ShapeNode), ...(n.stroke ? { stroke: { ...n.stroke, width: Math.max(0.25, n.stroke.width * k) } } : {}), ...(n.strokes ? { strokes: n.strokes.map((x) => ({ ...x, width: Math.max(0.25, x.width * k) })) } : {}) };
  if (n.type === 'group') return { ...(base as GroupNode), children: n.children.map((c) => scaleNode(c, sx, sy)) };
  if (n.type === 'pattern') return { ...(base as PatternNode), params: Object.fromEntries(Object.entries(n.params).map(([key, v]) => [key, isPxParam(n.gen, key) ? v * k : v])) };
  return base as Node;
}

/** Every text of a document, by id, exactly as written: what format adaptation and edits must keep. */
export function wordsOf(doc: GraphicDoc): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of doc.artboards) for (const l of walk(b)) if (l.node.type === 'text') out.set(l.node.id, l.node.text);
  return out;
}
