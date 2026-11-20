// lib/ux-v0/graphics/styles/constructions-kit.ts — what every style construction shares: the brief's words placed as
// text (never invented, never split: the headline is one text node however it is set), the style's palette, borders,
// arches and stepped frames as editable paths, and a picture placed and cut when the designer gave one.

import { contrastRatio } from '../../../ux/audit';
import { ensureContrast } from '../../spec';
import type { Ctx, Kit, Plan } from '../compose';
import { newId, type Node, type Role, type TextNode } from '../doc';
import { fitToPath, layoutText } from '../text';
import { effectDefaults, type Effect } from '../effects';
import { mixColor, type Paint } from '../paint';
import type { Border } from './schema';
import { hash32 } from './hash';

export type Layout = (x: Ctx, plan: Plan) => Node[];
export type Box = { x: number; y: number; w: number; h: number };

const hashOf = hash32;
/** A number in [0, 1) fixed by the design, the style and a salt: the same design is laid out the same every time. */
export const rand = (x: Ctx, salt: string | number) => (hashOf(`${x.seed}|${x.style?.id ?? ''}|${salt}`) % 10000) / 10000;
export const between = (x: Ctx, salt: string | number, lo: number, hi: number) => lo + (hi - lo) * rand(x, salt);
export const land = (x: Ctx) => x.W / x.H > 1.25;
export const variant = (x: Ctx) => x.style?.variant ?? '';
export const a3 = (x: Ctx) => x.style?.palette.accent3 ?? x.accent2;
export const motifs = (x: Ctx): string[] => x.style?.dna.geometry.motifs ?? [];
export const mix = (a: string, b: string, t: number) => mixColor(a, b, t).slice(0, 7);
/** The text colour that reads on a fill: ink or ground, whichever is stronger, pushed to 4.5:1. */
export const on = (x: Ctx, bg: string, ratio = 4.5) => (contrastRatio(x.ink, bg) >= contrastRatio(x.ground, bg) ? ensureContrast(x.ink, bg, ratio) : ensureContrast(x.ground, bg, ratio));
/** A colour for large type on a fill (3:1, as large type needs). */
export const onLarge = (x: Ctx, fg: string, bg: string) => ensureContrast(fg, bg, 3);
/** A colour of the palette pushed until it reads as text on a fill. */
export const readable = (fg: string, bg: string, ratio = 4.5) => ensureContrast(fg, bg, ratio);
export const small = (k: Kit, x: Ctx, f = 1) => Math.max(k.minText(x), x.u * 2.4 * f);
export const mid = (k: Kit, x: Ctx, f = 1) => Math.max(k.minText(x), x.u * 3.2 * f);

/** An effect with its own parameters, sized and coloured for this design. */
export const fx = (k: Kit, x: Ctx, kind: string, params: Record<string, number> = {}, colors: Partial<Pick<Effect, 'color' | 'color2' | 'color3'>> = {}): Effect[] => {
  const e = effectDefaults(kind);
  if (!e) return [];
  const [placed] = k.paletteFx(x, [{ ...e, params: { ...e.params, ...params } }]);
  return [{ ...placed, ...colors }];
};

/** The headline, exactly as given, as one text node. */
export const head = (k: Kit, x: Ctx, box: Box, s: Partial<TextNode> = {}): TextNode => k.text(x, 'headline', x.brief.content.headline, box, s);

type Item = Parameters<Kit['stack']>[6][number];

/** The other words of the brief (subtitle, details, action, brand) stacked from the top of a box. */
export function details(
  k: Kit,
  x: Ctx,
  box: Box,
  o: {
    color?: string;
    align?: 'left' | 'center' | 'right';
    scale?: number;
    sub?: boolean;
    meta?: boolean;
    metaFrom?: number;
    brand?: boolean;
    cta?: boolean;
    subStyle?: Partial<TextNode>;
    metaStyle?: Partial<TextNode>;
    fromFoot?: boolean;
  } = {},
): Node[] {
  const c = x.brief.content;
  const color = o.color ?? x.ink;
  const align = o.align ?? 'left';
  const f = o.scale ?? 1;
  const meta = o.meta === false ? [] : k.metaLines(x).slice(o.metaFrom ?? 0);
  const items: Item[] = [
    o.sub !== false && c.subhead ? ['subhead', c.subhead, mid(k, x, f), { color, align, ...(o.subStyle ?? {}) }] : null,
    meta.length ? ['meta', meta.join('\n'), small(k, x, f), { color, align, lineHeight: 1.35, ...(o.metaStyle ?? {}) }] : null,
    o.cta !== false && c.cta ? ['cta', `${c.cta} →`, small(k, x, f * 1.1), { weight: 700, color, align }] : null,
    o.brand !== false && c.brand ? ['logo', c.brand, small(k, x, f * 1.05), { weight: 700, case: 'none', tracking: 20, color, align }] : null,
  ];
  const out: Node[] = [];
  if (o.fromFoot) k.stackFromFoot(x, out, box.x, box.w, box.y + box.h, items);
  else k.stack(x, out, box.x, box.y, box.w, box.y + box.h, items);
  return out;
}

/** A primitive of the geometry registry as a shape. */
export const P = (k: Kit, x: Ctx, kind: string, params: Record<string, number>, box: Box, paint: Paint | null, s: Record<string, unknown> = {}): Node => k.primNode(x, 'motif', k.primOf(kind, params), box, paint, s);
export const block = (k: Kit, x: Ctx, box: Box, fill: Paint | null, s: Record<string, unknown> = {}): Node => k.rect(x, 'motif', box, fill, s);
/** The whole frame's own ground (a field, a sky, a gradient): the texture of the style lands on it. */
export const groundOf = (k: Kit, x: Ctx, fill: Paint, s: Record<string, unknown> = {}): Node =>
  k.rect(x, 'background', { x: 0, y: 0, w: x.W, h: x.H }, fill, {
    name: 'Ground',
    ...s,
  });
export const ellipse = (x: Ctx, box: Box, fill: Paint | null, s: Record<string, unknown> = {}): Node =>
  ({
    id: newId('s'),
    type: 'shape',
    shape: 'ellipse',
    role: 'motif',
    name: 'Disc',
    fill,
    ...box,
    rotation: 0,
    opacity: 1,
    ...s,
  }) as Node;
/** A path in a 0–100 box, drawn in the node's box (an arch, a stepped frame, a band). */
export const pathNode = (x: Ctx, box: Box, d: string, fill: Paint | null, s: Record<string, unknown> = {}, role: Role = 'motif'): Node =>
  ({
    id: newId('s'),
    type: 'shape',
    shape: 'path',
    path: d,
    role,
    name: 'Path',
    fill,
    ...box,
    rotation: 0,
    opacity: 1,
    ...s,
  }) as Node;

export const ARCH = 'M0 100 L0 38 C0 17 22 0 50 0 C78 0 100 17 100 38 L100 100 Z';
/** A frame with stepped (ziggurat) corners, the steps `step` px whatever the box's proportions. */
export function steppedPath(w: number, h: number, step: number): string {
  const sx = (step / w) * 100;
  const sy = (step / h) * 100;
  const n = (v: number) => Math.round(v * 100) / 100;
  const pts: [number, number][] = [
    [2 * sx, 0],
    [100 - 2 * sx, 0],
    [100 - 2 * sx, sy],
    [100 - sx, sy],
    [100 - sx, 2 * sy],
    [100, 2 * sy],
    [100, 100 - 2 * sy],
    [100 - sx, 100 - 2 * sy],
    [100 - sx, 100 - sy],
    [100 - 2 * sx, 100 - sy],
    [100 - 2 * sx, 100],
    [2 * sx, 100],
    [2 * sx, 100 - sy],
    [sx, 100 - sy],
    [sx, 100 - 2 * sy],
    [0, 100 - 2 * sy],
    [0, 2 * sy],
    [sx, 2 * sy],
    [sx, sy],
    [2 * sx, sy],
  ];
  return `M${pts.map(([a, b]) => `${n(a)} ${n(b)}`).join(' L')} Z`;
}

/** The style's border, inset from the edge (each kind drawn as editable shapes). */
export function border(k: Kit, x: Ctx, kind: Border, color = x.ink, inset = x.m * 0.45): Node[] {
  const box = { x: inset, y: inset, w: x.W - inset * 2, h: x.H - inset * 2 };
  const lw = Math.max(1, x.u * 0.32);
  const stroke = (w = lw, extra: Record<string, unknown> = {}) => ({
    stroke: { color, width: w, join: 'miter', ...extra },
  });
  switch (kind) {
    case 'rule':
      return [k.rule(x, { x: box.x, y: box.y, w: box.w }, color, lw), k.rule(x, { x: box.x, y: box.y + box.h, w: box.w }, color, lw)];
    case 'double-rule':
      return [
        k.rule(x, { x: box.x, y: box.y, w: box.w }, color, lw * 3),
        k.rule(x, { x: box.x, y: box.y + lw * 5, w: box.w }, color, lw),
        k.rule(x, { x: box.x, y: box.y + box.h - lw * 5, w: box.w }, color, lw),
        k.rule(x, { x: box.x, y: box.y + box.h, w: box.w }, color, lw * 3),
      ];
    case 'frame':
      return [
        block(k, x, box, null, { name: 'Frame', ...stroke() }),
        block(
          k,
          x,
          {
            x: box.x + lw * 4,
            y: box.y + lw * 4,
            w: box.w - lw * 8,
            h: box.h - lw * 8,
          },
          null,
          { name: 'Inner frame', ...stroke(lw * 0.5) },
        ),
      ];
    case 'thick':
      return [block(k, x, box, null, { name: 'Frame', ...stroke(x.u * 1.4) })];
    case 'dashed':
      return [
        block(k, x, box, null, {
          name: 'Coupon border',
          ...stroke(lw * 1.2, { dash: [x.u * 1.6, x.u * 1.1] }),
        }),
      ];
    case 'stepped':
      return [
        pathNode(x, box, steppedPath(box.w, box.h, x.u * 3), null, {
          name: 'Stepped frame',
          ...stroke(),
        }),
        pathNode(
          x,
          {
            x: box.x + x.u * 1.4,
            y: box.y + x.u * 1.4,
            w: box.w - x.u * 2.8,
            h: box.h - x.u * 2.8,
          },
          steppedPath(box.w - x.u * 2.8, box.h - x.u * 2.8, x.u * 3),
          null,
          { name: 'Inner stepped frame', ...stroke(lw * 0.5) },
        ),
      ];
    case 'arch':
      return [pathNode(x, box, ARCH, null, { name: 'Arch', ...stroke() })];
    case 'ornate':
    case 'botanical': {
      const out: Node[] = [
        P(k, x, 'frame', { thickness: 2, corner: 3 }, box, color, {
          name: 'Frame',
        }),
      ];
      const c = x.u * 9;
      const corners: [number, number, number][] = [
        [box.x + lw * 6, box.y + lw * 6, 0],
        [box.x + box.w - c - lw * 6, box.y + lw * 6, 90],
        [box.x + box.w - c - lw * 6, box.y + box.h - c - lw * 6, 180],
        [box.x + lw * 6, box.y + box.h - c - lw * 6, 270],
      ];
      for (const [cx, cy, r] of corners)
        out.push(
          P(k, x, kind === 'botanical' ? 'fluid-curve' : 'corner-ornament', kind === 'botanical' ? { seed: 7, points: 5, sweep: 70 } : { curl: 70, lines: 2 }, { x: cx, y: cy, w: c, h: c }, color, {
            rotation: r,
            name: kind === 'botanical' ? 'Tendril' : 'Corner ornament',
          }),
        );
      return out;
    }
    default:
      return [];
  }
}

/** The designer's first picture in a box, cut to a shape where the style crops that way (null: there is none). */
export function picture(k: Kit, x: Ctx, box: Box, cut?: string | 'ellipse' | 'arch' | null, s: Record<string, unknown> = {}): Node | null {
  const asset = x.brief.images[0];
  if (!asset) return null;
  if (!cut) return { ...k.image(x, asset, box), ...s } as Node;
  if (cut === 'ellipse') return { ...k.image(x, asset, box, 'ellipse'), ...s } as Node;
  if (cut === 'arch') {
    const mask = pathNode(x, { x: 0, y: 0, w: box.w, h: box.h }, ARCH, '#000000', { name: 'Cut' });
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
      children: [
        mask,
        {
          ...k.image(x, asset, { x: 0, y: 0, w: box.w, h: box.h }),
          name: 'Picture',
        },
      ],
      ...s,
    } as Node;
  }
  return k.cutPicture(x, asset, k.primOf(cut, { seed: (x.seed % 900) + 5 }), box, s);
}

/** Runs that set each word after the first in the next of several faces (and colours): many faces, one text node. */
export function mixedFaces(t: TextNode, faces: readonly string[], colors: readonly string[] = []): void {
  if (!faces.length && !colors.length) return;
  const runs: NonNullable<TextNode['runs']> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(t.text))) {
    if (i > 0) {
      const f = faces.length ? faces[(i - 1) % faces.length] : undefined;
      const c = colors.length ? colors[(i - 1) % colors.length] : undefined;
      runs.push({
        start: m.index,
        end: m.index + m[0].length,
        ...(f ? { font: f } : {}),
        ...(c ? { color: c } : {}),
      });
    }
    i++;
  }
  if (runs.length) t.runs = runs;
}

/** How tall a text really sets (its lines, not its box). */
export const textHeight = (x: Ctx, t: TextNode): number => layoutText({ ...t, autoHeight: false }, x.measure).height;

/** An engraved device for a page with room to spare: a rosette, a flower or a star, centred in a box (null: no room). */
export function medallion(k: Kit, x: Ctx, box: Box, kind: 'rosette' | 'flower' | 'star', color: string, color2: string): Node[] {
  const d = Math.min(box.w, box.h);
  if (d < x.u * 10) return [];
  const b = {
    x: box.x + (box.w - d) / 2,
    y: box.y + (box.h - d) / 2,
    w: d,
    h: d,
  };
  const inset = (f: number) => ({
    x: b.x + (d * (1 - f)) / 2,
    y: b.y + (d * (1 - f)) / 2,
    w: d * f,
    h: d * f,
  });
  if (kind === 'rosette')
    // an engraved rosette: a spirograph of fine lines, as the old jobbing printers' stock blocks were cut
    return [
      {
        ...k.patternNode(x, k.pdef('spiro', { curve: 0, a: 7, b: 3, c: 70, copies: 6, weight: 0.075, size: 92 }, ['ink']), b, { name: 'Rosette' }),
        colors: [color],
      } as Node,
      ellipse(x, inset(0.12), color2, { name: 'Boss' }),
    ];
  if (kind === 'flower')
    return [
      P(k, x, 'star', { points: 8, inner: 62, rounding: 40 }, b, color, {
        name: 'Flower',
      }),
      P(k, x, 'star', { points: 8, inner: 62, rounding: 40, rotation: 22 }, inset(0.62), color2, { name: 'Flower' }),
      ellipse(x, inset(0.24), color, { name: 'Heart' }),
    ];
  return [P(k, x, 'star', { points: 16, inner: 38 }, b, color, { name: 'Star' }), ellipse(x, inset(0.3), color2, { name: 'Boss' })];
}

/**
 * A panel (a band, a plate, a strip) sized to the words set on it: grown to hold every one of them, and — when they
 * would run past the bottom of the frame — lifted back onto it with them. So a brief with more words (a brand, an
 * action) never pushes them off their ground.
 */
export function panelAround(k: Kit, x: Ctx, items: readonly Node[], box: Box, fill: Paint | null, s: Record<string, unknown> = {}, pad = x.u * 2): Node {
  if (!items.length) return block(k, x, box, fill, s);
  let top = Math.min(box.y, ...items.map((n) => n.y - pad));
  let bottom = Math.max(box.y + box.h, ...items.map((n) => n.y + n.h + pad));
  const over = bottom - x.H;
  if (over > 0) {
    for (const n of items) n.y -= over;
    top -= over;
    bottom = x.H;
  }
  top = Math.max(0, top);
  return block(k, x, { x: box.x, y: top, w: box.w, h: bottom - top }, fill, s);
}

/** A headline set along an arc, its size brought down until the words fit the arc (never clipped by it). */
export function alongArc(k: Kit, x: Ctx, t: TextNode, bend: number): void {
  t.path = { kind: 'arc', bend, start: 50 };
  t.size = fitToPath(t, x.measure, k.minText(x));
}

/** A plate of a fill behind a text node (words over a pattern or a picture keep their contrast). */
export const plate = (k: Kit, x: Ctx, t: TextNode, fill: string, pad = x.u * 1.6, s: Record<string, unknown> = {}): Node => ({ ...k.plateFor(x, t, pad), fill, name: 'Plate', ...s }) as Node;
