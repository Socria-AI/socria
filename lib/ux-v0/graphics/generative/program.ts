// lib/ux-v0/graphics/generative/program.ts — the Design Program: structured, validated design instructions between a
// creative concept and the document. The engine's constructor writes one; a model could write one too, and it would
// pass through exactly the same gate: only known instructions, finite numbers inside sane bounds, colours by palette
// role or as hex, path data of absolute commands only, primitives, patterns and effects from SocriaUX's own registries,
// pictures by the designer's own index, and essential words only by reference to the brief (a program can never write
// its own headline, so the wording is always exactly the brief's). Nothing in a program is ever executed as code.

import { BLENDS, type BlendMode } from '../doc';
import { EFFECTS } from '../effects';
import { PRIMITIVE_BY_KIND } from '../geometry';
import { PATTERN_BY_KIND } from '../patterns';
import { clamp, parseD, segsBox, type Box, type P2 } from './util';

export const PROGRAM_SCHEMA = 1;
export const COLOUR_REFS = ['ground', 'paper', 'ink', 'accent', 'accent2', 'accent3', 'muted', 'auto'] as const;
export type ColourName = (typeof COLOUR_REFS)[number];
/** a palette role, or a hex colour (#rrggbb) */
export type ColourRef = ColourName | `#${string}`;
export type PaintRef = ColourRef | { linear: { angle: number; stops: ColourRef[] } } | { radial: { stops: ColourRef[] } };
export interface StrokeRef {
  color: ColourRef;
  width: number;
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
}
export interface FxRef {
  kind: string;
  params?: Record<string, number>;
}
export const CONTENT = ['headline', 'subhead', 'meta', 'cta', 'brand'] as const;
export type Content = (typeof CONTENT)[number];
export const ECHO_OF = ['headline', 'initial', 'numeral', 'ampersand', 'word'] as const;
export type EchoOf = (typeof ECHO_OF)[number];
export const INKS = ['accent', 'ink', 'accent2', 'muted', 'line'] as const;
export type InkRef = (typeof INKS)[number];
export type TextPathRef = { kind: 'custom'; d: string } | { kind: 'circle'; start: number; side?: 'outside' | 'inside' } | { kind: 'arc'; bend: number } | { kind: 'wave'; cycles: number; amplitude: number };

interface Common {
  name?: string;
  rotation?: number;
  opacity?: number;
  blend?: BlendMode;
  fx?: FxRef[];
  /** drawn as part of the composition, not content (only shapes, echoes, patterns and groups of them) */
  decorative?: boolean;
  skewX?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export type Instruction =
  | ({ op: 'rect'; box: Box; fill: PaintRef | null; stroke?: StrokeRef; radius?: number; role?: 'motif' | 'background' | 'plate' } & Common)
  | ({ op: 'ellipse'; box: Box; fill: PaintRef | null; stroke?: StrokeRef } & Common)
  | ({ op: 'path'; d: string; fill: PaintRef | null; stroke?: StrokeRef } & Common)
  | ({ op: 'prim'; kind: string; params?: Record<string, number>; box: Box; fill: PaintRef | null; stroke?: StrokeRef } & Common)
  | ({ op: 'line'; from: P2; to: P2; color: ColourRef; width: number; dash?: number[]; cap?: 'butt' | 'round' | 'square' } & Common)
  | ({
      op: 'text';
      content: Content;
      box: Box;
      /** px; absent: as large as the box allows */
      size?: number;
      align?: 'left' | 'center' | 'right';
      valign?: 'top' | 'middle' | 'bottom';
      color?: ColourRef;
      font?: 'display' | 'body';
      weight?: number;
      tracking?: number;
      lineHeight?: number;
      case?: 'upper' | 'lower' | 'none';
      italic?: boolean;
      vertical?: boolean;
      path?: TextPathRef;
      /** one word turned to the accent (its index among the words) */
      accentWord?: number;
      outline?: boolean;
      /** a gradient fill for the letters (a chrome or iridescent language), its stops by palette role */
      gradient?: ColourRef[];
    } & Common)
  | ({ op: 'echo'; of: EchoOf; word?: number; box: Box; size: number; color: ColourRef; outline?: boolean; align?: 'left' | 'center' | 'right'; font?: 'display' | 'body'; weight?: number } & Common)
  | ({ op: 'details'; box: Box; align: 'left' | 'center' | 'right'; fromFoot?: boolean; scale?: number; color?: ColourRef; sub?: boolean } & Common)
  /** the brief's numbers drawn as a chart (the data comes from the brief alone: a program can never supply numbers) */
  | ({ op: 'chart'; box: Box; chart: 'bar' | 'column' | 'line' | 'donut'; color?: ColourRef } & Common)
  /** the brief's points (items) set as a list, numbered or not (the words come from the brief alone) */
  | ({ op: 'list'; box: Box; numbered?: boolean; size?: number; align?: 'left' | 'center' | 'right'; color?: ColourRef } & Common)
  | ({ op: 'image'; asset: number; box: Box; mask?: { ellipse: true } | { path: string } | { prim: string; params?: Record<string, number> }; crop?: { x: number; y: number; w: number; h: number }; focus?: { x: number; y: number } } & Common)
  | ({ op: 'pattern'; gen: string | null; box: Box; scale?: number; params?: Record<string, number>; inks: InkRef[]; bound?: 'ellipse' } & Common)
  | ({ op: 'group'; box: Box; children: Instruction[]; clip?: boolean } & Common);

export interface DesignProgram {
  schema: typeof PROGRAM_SCHEMA;
  frame: { w: number; h: number };
  ground: PaintRef;
  elements: Instruction[];
}

export const MAX_ELEMENTS = 240;
const MAX_DEPTH = 3;
const HEX = /^#[0-9a-f]{6}$/i;
const EFFECT_KINDS = new Set(EFFECTS.map((e) => e.kind));

const o = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const name = (v: unknown) => (typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').slice(0, 60) : undefined);

export function colourRef(v: unknown): ColourRef | null {
  if (typeof v !== 'string') return null;
  if ((COLOUR_REFS as readonly string[]).includes(v)) return v as ColourRef;
  return HEX.test(v) ? (v.toLowerCase() as ColourRef) : null;
}
export function paintRef(v: unknown): PaintRef | null {
  const c = colourRef(v);
  if (c) return c;
  const r = o(v);
  const lin = o(r.linear);
  const rad = o(r.radial);
  const stops = (s: unknown) =>
    Array.isArray(s)
      ? s
          .map(colourRef)
          .filter((x): x is ColourRef => !!x)
          .slice(0, 6)
      : [];
  if (Array.isArray(lin.stops)) {
    const st = stops(lin.stops);
    return st.length >= 2 ? { linear: { angle: fin(lin.angle) ? clamp(lin.angle, -360, 360) : 90, stops: st } } : null;
  }
  if (Array.isArray(rad.stops)) {
    const st = stops(rad.stops);
    return st.length >= 2 ? { radial: { stops: st } } : null;
  }
  return null;
}

/** A program held to its shape (see the head of this file): what is invalid is dropped and said, never guessed. */
export function normalizeProgram(raw: unknown, ctx: { images: number }): { program: DesignProgram | null; problems: string[] } {
  const problems: string[] = [];
  const r = o(raw);
  const fr = o(r.frame);
  if (r.schema !== PROGRAM_SCHEMA) problems.push(`schema ${String(r.schema)} is not ${PROGRAM_SCHEMA}`);
  if (!fin(fr.w) || !fin(fr.h) || fr.w < 16 || fr.h < 16 || fr.w > 20000 || fr.h > 20000) return { program: null, problems: [...problems, 'the frame has no valid size'] };
  const W = fr.w;
  const H = fr.h;
  const M = Math.max(W, H);
  const num = (v: unknown, lo: number, hi: number, def?: number): number | undefined => (fin(v) ? clamp(v, lo, hi) : def);
  const box = (v: unknown): Box | null => {
    const b = o(v);
    if (![b.x, b.y, b.w, b.h].every(fin)) return null;
    const out = { x: clamp(b.x as number, -M, M * 2), y: clamp(b.y as number, -M, M * 2), w: clamp(b.w as number, 0.5, M * 3), h: clamp(b.h as number, 0.5, M * 3) };
    return out;
  };
  const stroke = (v: unknown): StrokeRef | undefined => {
    const s = o(v);
    const color = colourRef(s.color);
    if (!color || !fin(s.width)) return undefined;
    return {
      color,
      width: clamp(s.width, 0, M * 0.25),
      ...(Array.isArray(s.dash)
        ? {
            dash: s.dash
              .filter(fin)
              .slice(0, 8)
              .map((d) => clamp(d, 0, M)),
          }
        : {}),
      ...(s.cap === 'round' || s.cap === 'square' || s.cap === 'butt' ? { cap: s.cap } : {}),
    };
  };
  const fx = (v: unknown): FxRef[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out = v
      .map((e) => o(e))
      .filter((e) => typeof e.kind === 'string' && EFFECT_KINDS.has(e.kind))
      .slice(0, 4)
      .map((e) => ({
        kind: e.kind as string,
        ...(e.params
          ? {
              params: Object.fromEntries(
                Object.entries(o(e.params))
                  .filter(([, n]) => fin(n))
                  .slice(0, 12)
                  .map(([k, n]) => [k.slice(0, 24), clamp(n as number, -1000, 1000)]),
              ),
            }
          : {}),
      }));
    return out.length ? out : undefined;
  };
  const common = (e: Record<string, unknown>) => ({
    ...(name(e.name) ? { name: name(e.name) } : {}),
    ...(fin(e.rotation) ? { rotation: clamp(e.rotation, -360, 360) } : {}),
    ...(fin(e.opacity) ? { opacity: clamp(e.opacity, 0, 1) } : {}),
    ...(typeof e.blend === 'string' && (BLENDS as readonly string[]).includes(e.blend) ? { blend: e.blend as BlendMode } : {}),
    ...(fx(e.fx) ? { fx: fx(e.fx) } : {}),
    ...(fin(e.skewX) ? { skewX: clamp(e.skewX, -60, 60) } : {}),
    ...(e.flipX === true ? { flipX: true } : {}),
    ...(e.flipY === true ? { flipY: true } : {}),
  });
  let count = 0;
  let over = false;
  const one = (raw0: unknown, depth: number, where: string): Instruction | null => {
    const e = o(raw0);
    // the bound never drops the brief's own words: only drawn material past it is left out
    const words = e.op === 'text' || e.op === 'details' || e.op === 'list' || e.op === 'chart';
    if (!words && ++count > MAX_ELEMENTS) {
      if (!over) problems.push(`more than ${MAX_ELEMENTS} drawn instructions: the rest are left out (the words are always kept)`);
      over = true;
      return null;
    }
    const op = e.op;
    const deco = e.decorative === true ? { decorative: true as const } : {};
    switch (op) {
      case 'rect':
      case 'ellipse':
      case 'prim': {
        const b = box(e.box);
        const fill = e.fill === null ? null : paintRef(e.fill);
        const st = stroke(e.stroke);
        if (!b) return (problems.push(`${where}: ${/^[aeiou]/.test(op) ? 'an' : 'a'} ${op} without a valid box`), null);
        if (fill === null && !st && e.fill !== null) return (problems.push(`${where}: a ${op} with neither a valid fill nor a stroke`), null);
        if (op === 'prim') {
          if (typeof e.kind !== 'string' || !PRIMITIVE_BY_KIND.has(e.kind)) return (problems.push(`${where}: “${String(e.kind)}” is not a primitive SocriaUX draws`), null);
          const params = Object.fromEntries(
            Object.entries(o(e.params))
              .filter(([, v]) => fin(v))
              .slice(0, 16)
              .map(([k, v]) => [k.slice(0, 24), clamp(v as number, -100000, 100000)]),
          );
          return { op, kind: e.kind, params, box: b, fill: fill ?? null, ...(st ? { stroke: st } : {}), ...common(e), ...deco };
        }
        if (op === 'rect')
          return { op, box: b, fill: fill ?? null, ...(st ? { stroke: st } : {}), ...(fin(e.radius) ? { radius: clamp(e.radius, 0, M) } : {}), ...(e.role === 'background' || e.role === 'plate' ? { role: e.role } : {}), ...common(e), ...deco };
        return { op, box: b, fill: fill ?? null, ...(st ? { stroke: st } : {}), ...common(e), ...deco };
      }
      case 'path': {
        if (typeof e.d !== 'string' || !parseD(e.d)) return (problems.push(`${where}: path data that is not absolute M L H V C S Q T Z commands`), null);
        const fill = e.fill === null ? null : paintRef(e.fill);
        const st = stroke(e.stroke);
        if (!fill && !st) return (problems.push(`${where}: a path with neither fill nor stroke`), null);
        return { op, d: e.d, fill: fill ?? null, ...(st ? { stroke: st } : {}), ...common(e), ...deco };
      }
      case 'line': {
        const from = Array.isArray(e.from) && e.from.length === 2 && e.from.every(fin) ? ([clamp(e.from[0] as number, -M, M * 2), clamp(e.from[1] as number, -M, M * 2)] as P2) : null;
        const to = Array.isArray(e.to) && e.to.length === 2 && e.to.every(fin) ? ([clamp(e.to[0] as number, -M, M * 2), clamp(e.to[1] as number, -M, M * 2)] as P2) : null;
        const color = colourRef(e.color);
        if (!from || !to || !color || !fin(e.width)) return (problems.push(`${where}: a line needs from, to, a colour and a width`), null);
        return {
          op,
          from,
          to,
          color,
          width: clamp(e.width, 0.1, M * 0.2),
          ...(Array.isArray(e.dash) ? { dash: e.dash.filter(fin).slice(0, 8) as number[] } : {}),
          ...(e.cap === 'round' || e.cap === 'square' || e.cap === 'butt' ? { cap: e.cap } : {}),
          ...common(e),
          ...deco,
        };
      }
      case 'text': {
        if (typeof e.content !== 'string' || !(CONTENT as readonly string[]).includes(e.content)) return (problems.push(`${where}: text must name the brief’s content (headline, subhead, meta, cta, brand), never its own words`), null);
        if (e.decorative === true) return (problems.push(`${where}: the brief’s words cannot be decoration (use an echo)`), null);
        const b = box(e.box);
        if (!b) return (problems.push(`${where}: text without a valid box`), null);
        let path: TextPathRef | undefined;
        const p = o(e.path);
        if (p.kind === 'custom' && typeof p.d === 'string' && parseD(p.d)) path = { kind: 'custom', d: p.d };
        else if (p.kind === 'circle') path = { kind: 'circle', start: num(p.start, 0, 100, 0)!, ...(p.side === 'inside' ? { side: 'inside' as const } : {}) };
        else if (p.kind === 'arc') path = { kind: 'arc', bend: num(p.bend, -100, 100, 40)! };
        else if (p.kind === 'wave') path = { kind: 'wave', cycles: num(p.cycles, 0.5, 6, 1.5)!, amplitude: num(p.amplitude, 0, 100, 30)! };
        return {
          op,
          content: e.content as Content,
          box: b,
          ...(fin(e.size) ? { size: clamp(e.size, 1, M) } : {}),
          ...(e.align === 'left' || e.align === 'center' || e.align === 'right' ? { align: e.align } : {}),
          ...(e.valign === 'top' || e.valign === 'middle' || e.valign === 'bottom' ? { valign: e.valign } : {}),
          ...(colourRef(e.color) ? { color: colourRef(e.color)! } : {}),
          ...(e.font === 'display' || e.font === 'body' ? { font: e.font } : {}),
          ...(fin(e.weight) ? { weight: clamp(Math.round(e.weight / 100) * 100, 100, 900) } : {}),
          ...(fin(e.tracking) ? { tracking: clamp(e.tracking, -200, 600) } : {}),
          ...(fin(e.lineHeight) ? { lineHeight: clamp(e.lineHeight, 0.6, 3) } : {}),
          ...(e.case === 'upper' || e.case === 'lower' || e.case === 'none' ? { case: e.case } : {}),
          ...(e.italic === true ? { italic: true } : {}),
          ...(e.vertical === true ? { vertical: true } : {}),
          ...(path ? { path } : {}),
          ...(fin(e.accentWord) ? { accentWord: clamp(Math.round(e.accentWord), 0, 40) } : {}),
          ...(e.outline === true ? { outline: true } : {}),
          ...((g) => (g.length >= 2 ? { gradient: g } : {}))(
            Array.isArray(e.gradient)
              ? e.gradient
                  .map(colourRef)
                  .filter((x): x is ColourRef => !!x)
                  .slice(0, 4)
              : [],
          ),
          ...common(e),
        };
      }
      case 'echo': {
        const b = box(e.box);
        const color = colourRef(e.color);
        if (!b || !color || !fin(e.size) || typeof e.of !== 'string' || !(ECHO_OF as readonly string[]).includes(e.of)) return (problems.push(`${where}: an echo needs what it echoes, a box, a size and a colour`), null);
        return {
          op,
          of: e.of as EchoOf,
          box: b,
          size: clamp(e.size, 1, M * 3),
          color,
          ...(fin(e.word) ? { word: clamp(Math.round(e.word), 0, 40) } : {}),
          ...(e.outline === true ? { outline: true } : {}),
          ...(e.align === 'left' || e.align === 'center' || e.align === 'right' ? { align: e.align } : {}),
          ...(e.font === 'display' || e.font === 'body' ? { font: e.font } : {}),
          ...(fin(e.weight) ? { weight: clamp(Math.round(e.weight / 100) * 100, 100, 900) } : {}),
          ...common(e),
          decorative: true,
        };
      }
      case 'chart': {
        const b = box(e.box);
        if (!b) return (problems.push(`${where}: a chart without a valid box`), null);
        return { op, box: b, chart: e.chart === 'column' || e.chart === 'line' || e.chart === 'donut' ? e.chart : 'bar', ...(colourRef(e.color) ? { color: colourRef(e.color)! } : {}), ...common(e) };
      }
      case 'list': {
        const b = box(e.box);
        if (!b) return (problems.push(`${where}: a list without a valid box`), null);
        return { op, box: b, ...(e.numbered === true ? { numbered: true } : {}), ...(fin(e.size) ? { size: clamp(e.size, 4, M) } : {}), ...(e.align === 'center' || e.align === 'right' ? { align: e.align } : {}), ...(colourRef(e.color) ? { color: colourRef(e.color)! } : {}), ...common(e) };
      }
      case 'details': {
        const b = box(e.box);
        if (!b) return (problems.push(`${where}: details without a valid box`), null);
        return {
          op,
          box: b,
          align: e.align === 'center' || e.align === 'right' ? e.align : 'left',
          ...(e.fromFoot === true ? { fromFoot: true } : {}),
          ...(fin(e.scale) ? { scale: clamp(e.scale, 0.5, 2) } : {}),
          ...(colourRef(e.color) ? { color: colourRef(e.color)! } : {}),
          ...(e.sub === false ? { sub: false } : {}),
          ...common(e),
        };
      }
      case 'image': {
        const b = box(e.box);
        if (!b || !fin(e.asset) || e.asset < 0 || e.asset >= ctx.images) return (problems.push(`${where}: a picture the designer did not give`), null);
        const mk = o(e.mask);
        const mask =
          mk.ellipse === true
            ? { ellipse: true as const }
            : typeof mk.path === 'string' && parseD(mk.path)
              ? { path: mk.path }
              : typeof mk.prim === 'string' && PRIMITIVE_BY_KIND.has(mk.prim)
                ? {
                    prim: mk.prim,
                    params: Object.fromEntries(
                      Object.entries(o(mk.params))
                        .filter(([, v]) => fin(v))
                        .slice(0, 12),
                    ) as Record<string, number>,
                  }
                : undefined;
        const cr = o(e.crop);
        const crop = [cr.x, cr.y, cr.w, cr.h].every(fin) ? { x: clamp(cr.x as number, 0, 1), y: clamp(cr.y as number, 0, 1), w: clamp(cr.w as number, 0.05, 1), h: clamp(cr.h as number, 0.05, 1) } : undefined;
        const fo = o(e.focus);
        return { op, asset: Math.floor(e.asset), box: b, ...(mask ? { mask } : {}), ...(crop ? { crop } : {}), ...(fin(fo.x) && fin(fo.y) ? { focus: { x: clamp(fo.x, 0, 100), y: clamp(fo.y, 0, 100) } } : {}), ...common(e), ...deco };
      }
      case 'pattern': {
        const b = box(e.box);
        if (!b) return (problems.push(`${where}: a pattern without a box`), null);
        if (e.gen !== null && (typeof e.gen !== 'string' || !PATTERN_BY_KIND.has(e.gen))) return (problems.push(`${where}: “${String(e.gen)}” is not a pattern SocriaUX generates`), null);
        const inks = Array.isArray(e.inks) ? e.inks.filter((i): i is InkRef => typeof i === 'string' && (INKS as readonly string[]).includes(i)).slice(0, 4) : [];
        return {
          op,
          gen: (e.gen as string | null) ?? null,
          box: b,
          inks: inks.length ? inks : ['accent'],
          ...(fin(e.scale) ? { scale: clamp(e.scale, 0.3, 3) } : {}),
          ...(e.params
            ? {
                params: Object.fromEntries(
                  Object.entries(o(e.params))
                    .filter(([, v]) => fin(v))
                    .slice(0, 12),
                ) as Record<string, number>,
              }
            : {}),
          ...(e.bound === 'ellipse' ? { bound: 'ellipse' as const } : {}),
          ...common(e),
          ...deco,
        };
      }
      case 'group': {
        const b = box(e.box);
        if (!b || !Array.isArray(e.children)) return (problems.push(`${where}: a group needs a box and children`), null);
        if (depth >= MAX_DEPTH) return (problems.push(`${where}: groups nested deeper than ${MAX_DEPTH}`), null);
        const children = e.children.map((c, i) => one(c, depth + 1, `${where}.${i}`)).filter((c): c is Instruction => !!c);
        if (!children.length) return (problems.push(`${where}: an empty group`), null);
        if (children.some((c) => c.op === 'text' || c.op === 'details' || c.op === 'list' || c.op === 'chart')) return (problems.push(`${where}: the brief’s words stay at the top level (they are read back and edited there)`), null);
        return { op, box: b, children, ...(e.clip === true ? { clip: true } : {}), ...common(e), ...deco };
      }
      default:
        return (problems.push(`${where}: “${String(op)}” is not an instruction`), null);
    }
  };
  const list = Array.isArray(r.elements) ? r.elements : [];
  const elements = list.map((e, i) => one(e, 0, `#${i}`)).filter((e): e is Instruction => !!e);
  if (!elements.some((e) => e.op === 'text' && e.content === 'headline')) problems.push('no headline: the brief’s title must be set');
  const ground = paintRef(r.ground) ?? 'ground';
  return { program: { schema: PROGRAM_SCHEMA, frame: { w: W, h: H }, ground, elements }, problems };
}

/** Instructions, flattened (a group's children counted), for checks and statistics. */
export function flatten(list: readonly Instruction[]): Instruction[] {
  return list.flatMap((e) => (e.op === 'group' ? [e, ...flatten(e.children)] : [e]));
}

/** The box an instruction covers, in the frame's coordinates (a path by its points, a line by its ends). */
export function instructionBox(e: Instruction): Box {
  switch (e.op) {
    case 'path': {
      const segs = parseD(e.d);
      return segs ? segsBox(segs, e.stroke ? e.stroke.width / 2 : 0) : { x: 0, y: 0, w: 1, h: 1 };
    }
    case 'line':
      return { x: Math.min(e.from[0], e.to[0]), y: Math.min(e.from[1], e.to[1]), w: Math.max(1, Math.abs(e.to[0] - e.from[0])), h: Math.max(1, Math.abs(e.to[1] - e.from[1])) };
    default:
      return e.box;
  }
}

/** The box around several instructions. */
export function boxAround(list: readonly Instruction[]): Box {
  const bs = list.map(instructionBox);
  if (!bs.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
