// lib/ux-v0/graphics/director/frame.ts — the units the creative director works in.
//
// Every artboard is described to the director, and written by it, in one frame: 1000 units wide, as tall as the
// format's proportion makes it (an A3 poster is 1000 × 1414, a square post 1000 × 1000, a wide banner 1000 × 313).
// Sizes of type, strokes, radii and path coordinates are in the same units. So "a headline 160 units tall" means the
// same share of any format, the guidance in the instructions holds everywhere, and nothing the director writes
// depends on whether the artboard is 842 points or 3000 pixels across. Everything is scaled to the artboard's own
// units before the gate (generative/program.ts normalizeProgram) reads it; what is scaled is still untrusted.

import { isPxParam, PATTERN_BY_KIND } from '../patterns';

export const FRAME_W = 1000;

export interface Frame {
  /** units */
  w: number;
  h: number;
  /** artboard units per frame unit */
  k: number;
  /** the keep-out margin for words, in frame units */
  safe: number;
  /** the smallest size words may be set at, in frame units */
  minText: number;
}

export function frameOf(board: { width: number; height: number; safe: number; unit: 'px' | 'pt' }): Frame {
  const k = board.width / FRAME_W;
  const min = board.unit === 'pt' ? 6.5 : Math.max(14, board.width * 0.014);
  return { w: FRAME_W, h: Math.round(board.height / k), k, safe: Math.round(board.safe / k), minText: Math.ceil(min / k) };
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const PX_EFFECT_KEYS = new Set(['dx', 'dy', 'blur', 'spread', 'size', 'width', 'radius', 'distance', 'depth', 'offset', 'amplitude', 'wavelength']);

/** Path data with every coordinate scaled (absolute commands only: every number is a coordinate). */
export const scaleD = (d: string, k: number) => d.slice(0, 20000).replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => String(Math.round(Number(n) * k * 100) / 100));

/** A box as written: {x,y,w,h}, or the [x, y, w, h] the design sheet itself uses for every object. */
export const boxAsObject = (v: unknown): unknown => (Array.isArray(v) && v.length === 4 && v.every(fin) ? { x: v[0], y: v[1], w: v[2], h: v[3] } : v);

const scaleBox = (v: unknown, k: number): unknown => {
  const b = obj(boxAsObject(v));
  if (!b) return v;
  return { ...b, ...(fin(b.x) ? { x: b.x * k } : {}), ...(fin(b.y) ? { y: b.y * k } : {}), ...(fin(b.w) ? { w: b.w * k } : {}), ...(fin(b.h) ? { h: b.h * k } : {}) };
};
const scalePoint = (v: unknown, k: number): unknown => (Array.isArray(v) && v.length === 2 && v.every(fin) ? [v[0] * k, v[1] * k] : v);
const scaleStroke = (v: unknown, k: number): unknown => {
  const s = obj(v);
  if (!s) return v;
  return { ...s, ...(fin(s.width) ? { width: s.width * k } : {}), ...(Array.isArray(s.dash) ? { dash: s.dash.map((n) => (fin(n) ? n * k : n)) } : {}) };
};

/**
 * One instruction as the director wrote it (frame units), in the artboard's units. Unknown fields pass through
 * untouched. `u` is the artboard's own unit (a hundredth of its short side): a pattern's lengths are read by the
 * compiler in that unit, and its spacing as a multiple of the generator's default (composition/kit.ts unitParams).
 */
export function scaleInstruction(raw: unknown, k: number, u = k * 10, depth = 0): unknown {
  const e = obj(raw);
  if (!e || depth > 4) return raw;
  const out: Record<string, unknown> = { ...e };
  if ('box' in e) out.box = scaleBox(e.box, k);
  for (const key of ['size', 'radius', 'width'] as const) if (fin(e[key])) out[key] = (e[key] as number) * k;
  if (Array.isArray(e.dash)) out.dash = e.dash.map((n) => (fin(n) ? n * k : n));
  if ('stroke' in e) out.stroke = scaleStroke(e.stroke, k);
  if (typeof e.d === 'string') out.d = scaleD(e.d, k);
  if ('from' in e) out.from = scalePoint(e.from, k);
  if ('to' in e) out.to = scalePoint(e.to, k);
  const path = obj(e.path);
  if (path && typeof path.d === 'string') out.path = { ...path, d: scaleD(path.d, k) };
  const mask = obj(e.mask);
  if (mask && typeof mask.path === 'string') out.mask = { ...mask, path: scaleD(mask.path, k) };
  if (e.op === 'pattern') {
    const gen = typeof e.gen === 'string' ? e.gen : '';
    const p = obj(e.params) ?? {};
    // the spacing asked for (beside the instruction, or among its parameters), as a multiple of the generator's default
    const spacing = fin(e.scale) ? e.scale : fin(p.scale) ? p.scale : null;
    const def = PATTERN_BY_KIND.get(gen)?.params.find((q) => q.key === 'scale')?.def;
    if (spacing !== null && def) out.scale = (spacing * k * 10) / (def * u);
    else delete out.scale;
    out.params = Object.fromEntries(Object.entries(p).filter(([key]) => key !== 'scale').map(([key, v]) => [key, fin(v) && isPxParam(gen, key) ? (v * k) / u : v]));
  }
  if (Array.isArray(e.fx))
    out.fx = e.fx.map((f) => {
      const fx = obj(f);
      const p = fx ? obj(fx.params) : null;
      return fx && p ? { ...fx, params: Object.fromEntries(Object.entries(p).map(([key, v]) => [key, fin(v) && PX_EFFECT_KEYS.has(key) ? v * k : v])) } : f;
    });
  if (Array.isArray(e.children)) out.children = e.children.slice(0, 120).map((c) => scaleInstruction(c, k, u, depth + 1));
  return out;
}

/** A program as the director wrote it, in the artboard's units, ready for the gate. */
export function scaleProgram(raw: unknown, board: { width: number; height: number; safe: number; unit: 'px' | 'pt' }): Record<string, unknown> {
  const r = obj(raw) ?? {};
  const { k } = frameOf(board);
  const u = Math.min(board.width, board.height) / 100;
  return { schema: 1, frame: { w: board.width, h: board.height }, ground: r.ground ?? 'ground', elements: (Array.isArray(r.elements) ? r.elements : []).slice(0, 400).map((e) => scaleInstruction(e, k, u)) };
}

/** A length of the artboard in frame units (rounded: the director reads whole units). */
export const toFrame = (v: number, f: Frame) => Math.round(v / f.k);
export const fromFrame = (v: number, f: Frame) => v * f.k;
