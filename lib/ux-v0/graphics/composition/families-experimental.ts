// lib/ux-v0/graphics/composition/families-experimental.ts — the experimental families.
//
// Tension, chaos, fragments, flows, rules made visible. Experimental is not accidental: every one of these keeps its
// words whole and readable (a calm ground, a plate, a clear region) while the rest of the frame takes the risk, and
// every distribution is deterministic (the plan's seed) with numbers a person can change.

import { newId, type Node } from '../doc';
import type { Anchor } from './schema';
import { around, cells, disc, figure, headline, info, inkOn, line, pattern, photo, placeAt, prim, rect, splitH, splitV, squareIn, type Box, type CC, fillForInk } from './kit';

type Family = (c: CC) => void;

/** Points spread by best-candidate sampling: each the furthest from those before (seeded), inside a box. */
function spread(c: CC, box: Box, k: number, avoid: Box[] = [], salt = 'p'): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    let best: [number, number] | null = null;
    let bestD = -1;
    for (let j = 0; j < 14; j++) {
      const p: [number, number] = [box.x + box.w * c.r(`${salt}${i}-${j}x`), box.y + box.h * c.r(`${salt}${i}-${j}y`)];
      if (avoid.some((a) => p[0] > a.x && p[0] < a.x + a.w && p[1] > a.y && p[1] < a.y + a.h)) continue;
      const d = pts.length ? Math.min(...pts.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))) : 1e9;
      if (d > bestD) ((bestD = d), (best = p));
    }
    if (best) pts.push(best);
  }
  return pts;
}

/** The words placed on a calm ground of their own in a box (a plate behind the headline and the details). */
function calmWords(c: CC, box: Box, align: 'left' | 'center' | 'right' = 'left', share = 0.6) {
  const [hb, db] = splitV(box, share, c.u * 2);
  const t = headline(c, hb, { align }, { valign: 'bottom' });
  const d = info(c, db, { align });
  const all = [t, ...d];
  const y0 = Math.min(...all.map((n) => n.y)) - c.u * 2.5;
  const y1 = Math.max(...all.map((n) => n.y + n.h)) + c.u * 2.5;
  c.out.push(rect(c, { x: box.x - c.u * 2.5, y: y0, w: box.w + c.u * 5, h: y1 - y0 }, c.pal.ground, { name: 'Ground for the words' }), t, ...d);
  c.rel('contrast', 'headline', 'figure', { value: 4.5, priority: 'hard' });
}

/** A group of children clipped to its box (children in the group's own coordinates). */
function clipGroup(name: string, box: Box, children: Node[], s: Record<string, unknown> = {}): Node {
  return { id: newId('g'), type: 'group', name, clip: true, x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: 1, children, ...s } as Node;
}

export const EXPERIMENTAL: Record<string, Family> = {
  freeform: (c) => {
    const k = Math.round(c.n('elements'));
    const weighted = c.s('balance') === 'weighted';
    const S = c.safe;
    // the words' region first: the largest of four candidate regions, chosen by the seed
    const regions: Box[] = c.land
      ? [placeAt(S, 'ml', S.w * 0.46, S.h * 0.8), placeAt(S, 'mr', S.w * 0.46, S.h * 0.8)]
      : [placeAt(S, 'tl', S.w * 0.8, S.h * 0.36), placeAt(S, 'bl', S.w * 0.8, S.h * 0.36), placeAt(S, 'ml', S.w * 0.7, S.h * 0.36), placeAt(S, 'tr', S.w * 0.8, S.h * 0.36)];
    const words = c.pick('region', regions);
    const pts = spread(c, { x: 0, y: 0, w: c.W, h: c.H }, k, [words], 'free');
    pts.forEach(([px, py], i) => {
      const d = Math.min(c.W, c.H) * (weighted && i === 0 ? 0.42 : 0.1 + c.r(`d${i}`) * 0.16);
      c.out.push(figure(c, i, around(px, py, d), c.paint(i), { rotation: Math.round((c.r(`rot${i}`) - 0.5) * 60 * c.exp) }));
    });
    c.rel('distribute', 'figure', undefined, { priority: 'aesthetic' });
    c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
    const [hb, db] = splitV(words, 0.62, c.u * 2);
    c.out.push(headline(c, hb, { align: 'left' }), ...info(c, db, { align: 'left' }));
  },

  'controlled-chaos': (c) => {
    const k = Math.round(c.n('count') * (0.6 + c.dens * 0.6));
    const turn = c.n('rotation');
    const plate = c.s('plate') === 'on';
    const S = c.safe;
    const calm = c.land ? placeAt(S, c.pick('calm', ['ml', 'mr'] as Anchor[]), S.w * 0.48, S.h * 0.74) : placeAt(S, c.pick('calm', ['bl', 'ml', 'tl'] as Anchor[]), S.w * 0.86, S.h * 0.38);
    const pts = spread(c, { x: -c.W * 0.05, y: -c.H * 0.05, w: c.W * 1.1, h: c.H * 1.1 }, k, plate ? [] : [calm], 'chaos');
    pts.forEach(([px, py], i) => {
      const d = Math.min(c.W, c.H) * (0.05 + c.r(`s${i}`) * 0.12);
      c.out.push(figure(c, i, around(px, py, d), c.paint(i), { rotation: Math.round((c.r(`t${i}`) - 0.5) * 2 * turn) }));
    });
    c.rel('repeat', 'figure', undefined, { value: k });
    c.rel('rotate', 'figure', undefined, { value: turn });
    if (plate) calmWords(c, calm);
    else {
      const [hb, db] = splitV(calm, 0.62, c.u * 2);
      c.out.push(headline(c, hb, { align: 'left' }, { valign: 'bottom' }), ...info(c, db, { align: 'left' }));
      c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
    }
  },

  fragmented: (c) => {
    const shards = Math.round(c.n('shards'));
    const off = c.n('offset');
    const dir = c.s('dir');
    const S = c.safe;
    // the whole design's figure, cut into shards and slid apart; the words stay whole above it
    const base = (dx: number, dy: number): Node[] => {
      const d = Math.min(c.W, c.H) * 0.78;
      return [
        disc(c, around(c.W * 0.55 - dx, c.H * 0.4 - dy, d), c.paint(0), { name: 'Figure' }),
        rect(c, { x: -dx, y: c.H * 0.52 - dy, w: c.W, h: c.H * 0.12 }, c.paint(1), { name: 'Band' }),
        figure(c, 1, around(c.W * 0.3 - dx, c.H * 0.3 - dy, d * 0.3), c.paint(2)),
      ];
    };
    for (let i = 0; i < shards; i++) {
      const f0 = i / shards;
      const slide = (i % 2 ? 1 : -1) * off * Math.min(c.W, c.H) * (0.5 + c.r(`f${i}`));
      const box: Box = dir === 'horizontal' ? { x: 0, y: f0 * c.H, w: c.W, h: c.H / shards } : { x: f0 * c.W, y: 0, w: c.W / shards, h: c.H };
      const dx = dir === 'horizontal' ? -slide : 0;
      const dy = dir === 'horizontal' ? 0 : -slide;
      c.out.push(clipGroup(`Shard ${i + 1}`, box, base(box.x + dx, box.y + dy), dir === 'diagonal' ? { skewX: -10 } : {}));
    }
    c.rel('crop', 'figure', undefined, { value: shards });
    c.rel('offset', 'figure', undefined, { value: off });
    calmWords(c, c.land ? placeAt(S, 'bl', S.w * 0.5, S.h * 0.5) : placeAt(S, 'bl', S.w * 0.84, S.h * 0.34));
  },

  deconstructed: (c) => {
    const slip = c.n('displace');
    const k = Math.round(c.n('rules'));
    const tilt = c.n('tilt');
    const S = c.safe;
    // the grid's rules, each slipped off its line
    for (let i = 0; i < k; i++) {
      const y = S.y + S.h * ((i + 1) / (k + 1)) + (c.r(`ry${i}`) - 0.5) * S.h * slip;
      const x0 = S.x + (c.r(`rx${i}`) - 0.5) * S.w * slip * 2;
      c.out.push(line(c, x0, y, x0 + S.w * (0.5 + c.r(`rw${i}`) * 0.5), y + (c.r(`rt${i}`) - 0.5) * tilt * c.u, c.pal.ink, Math.max(0.6, c.u * (0.2 + c.r(`rk${i}`) * 0.5)), { name: 'Rule' }));
    }
    // blocks that slipped out of their modules
    const grid = cells(S, 4, c.land ? 4 : 3, c.u * 2);
    [1, 4, 10].forEach((g, j) => {
      const b = grid[g % grid.length];
      c.out.push(rect(c, { x: b.x + (c.r(`bx${j}`) - 0.5) * b.w * slip * 3, y: b.y + (c.r(`by${j}`) - 0.5) * b.h * slip * 3, w: b.w, h: b.h * 0.6 }, c.paint(j), { name: 'Block', rotation: (c.r(`bt${j}`) - 0.5) * tilt }));
    });
    const hb = c.land ? { x: S.x + S.w * slip, y: S.y + S.h * 0.3, w: S.w * 0.62, h: S.h * 0.5 } : { x: S.x + S.w * slip, y: S.y + S.h * 0.3, w: S.w * (0.92 - slip), h: S.h * 0.34 };
    const t = headline(c, hb, { align: 'left', rotation: -tilt / 2 });
    c.out.push(c.k.plateFor(c.x, t, c.u * 1.2), t);
    c.rel('offset', 'headline', 'frame', { value: slip });
    c.rel('rotate', 'headline', undefined, { value: -tilt / 2 });
    c.out.push(...info(c, placeAt(S, 'br', S.w * 0.5, S.h * 0.24), { align: 'right', fromFoot: true }));
  },

  'layered-collage': (c) => {
    const layers = Math.round(c.n('layers'));
    const hard = c.s('shadow') === 'hard';
    const torn = c.s('head') === 'torn';
    const S = c.safe;
    const shadow = (o: number) => c.k.paletteFx(c.x, [{ kind: 'drop-shadow', params: hard ? { dx: 8, dy: 8, blur: 0, opacity: 90 } : { dx: 0, dy: 8, blur: 14, opacity: 24 } } as never]).map((e) => ({ ...e, ...(hard ? { color: c.pal.ink } : {}) }));
    for (let i = 0; i < layers; i++) {
      const w = c.W * (0.5 + c.r(`lw${i}`) * 0.4);
      const h = c.H * (0.22 + c.r(`lh${i}`) * 0.3);
      const x = (c.W - w) * c.r(`lx${i}`);
      const y = c.H * 0.05 + (c.H * 0.6 - h) * (i / Math.max(1, layers - 1));
      const fill = c.paint(i);
      c.out.push(
        i % 2
          ? prim(c, 'irregular-polygon', { seed: (c.plan.seed % 900) + i * 13, sides: 6, irregular: 22 }, { x, y, w, h }, fill, { name: 'Layer', rotation: (c.r(`lr${i}`) - 0.5) * 14, effects: shadow(i) })
          : rect(c, { x, y, w, h }, fill, { name: 'Layer', rotation: (c.r(`lr${i}`) - 0.5) * 10, effects: shadow(i) }),
      );
    }
    c.rel('overlap', 'figure', 'figure');
    const box = c.land ? placeAt(S, 'mr', S.w * 0.46, S.h * 0.7) : placeAt(S, 'bl', S.w * 0.9, S.h * 0.34);
    const [hb, db] = splitV(box, 0.62, c.u * 2);
    const t = headline(c, hb, { align: 'left' }, { valign: 'bottom' });
    const d = info(c, db, { align: 'left' });
    const all = [t, ...d];
    const y0 = Math.min(...all.map((n) => n.y)) - c.u * 3;
    const y1 = Math.max(...all.map((n) => n.y + n.h)) + c.u * 3;
    const top = { x: box.x - c.u * 3, y: y0, w: box.w + c.u * 6, h: y1 - y0 };
    c.out.push(
      torn
        ? prim(c, 'irregular-polygon', { seed: 77, sides: 7, irregular: 10 }, { x: top.x - c.u * 2, y: top.y - c.u * 2, w: top.w + c.u * 4, h: top.h + c.u * 4 }, c.pal.ground, { name: 'Top layer', effects: shadow(9) })
        : rect(c, top, c.pal.ground, { name: 'Top layer', effects: shadow(9) }),
      t,
      ...d,
    );
    c.rel('group', 'headline', 'details');
  },

  'extreme-asymmetry': (c) => {
    const corner = c.s('corner') as Anchor;
    const extent = c.n('extent');
    const S = c.safe;
    const box = placeAt(S, corner, S.w * (c.land ? extent * 0.9 : Math.min(0.74, extent * 2)), S.h * extent);
    const [hb, db] = splitV(box, 0.6, c.u * 2);
    const align = corner[1] === 'r' ? 'right' : 'left';
    c.out.push(headline(c, hb, { align }, { valign: corner[0] === 'b' ? 'bottom' : 'top' }), ...info(c, db, { align, scale: 0.85 }));
    c.out.push(figure(c, 0, placeAt({ ...box, x: box.x, y: corner[0] === 't' ? box.y + box.h + c.u * 2 : box.y - c.u * 12, h: c.u * 10 }, `t${corner[1]}` as Anchor, c.u * 10, c.u * 10), c.paint(0)));
    c.rel('anchor', 'headline', 'safe', { at: corner, priority: 'hard' });
    c.rel('negative-space', 'artboard', undefined, { at: `${corner[0] === 't' ? 'b' : 't'}${corner[1] === 'l' ? 'r' : 'l'}` as Anchor, value: 0.6, priority: 'hard' });
  },

  'visual-interruption': (c) => {
    const kind = c.s('band');
    const at = c.n('at');
    const weight = c.n('weight');
    const S = c.safe;
    // the band in a colour the headline's own ink still reads on (3:1, large type), so the words keep one colour
    const fill = fillForInk(c);
    const thick = Math.min(c.W, c.H) * weight;
    const band =
      kind === 'vertical'
        ? rect(c, { x: c.W * at - thick / 2, y: 0, w: thick, h: c.H }, fill, { name: 'Interruption' })
        : kind === 'diagonal'
          ? rect(c, around(c.W / 2, c.H * at, Math.hypot(c.W, c.H) * 1.2, thick), fill, { name: 'Interruption', rotation: c.H > c.W ? -28 : -14 })
          : rect(c, { x: 0, y: c.H * at - thick / 2, w: c.W, h: thick }, fill, { name: 'Interruption' });
    c.out.push(band);
    // the headline crosses the break: set across it, in a colour that reads on both
    const hb = c.land ? { x: S.x, y: c.H * at - S.h * 0.24, w: S.w * 0.7, h: S.h * 0.48 } : { x: S.x, y: c.H * at - S.h * 0.18, w: S.w, h: S.h * 0.36 };
    const t = headline(c, hb, { align: 'left' }, { valign: 'middle' });
    c.out.push(t);
    c.rel('intersect', 'headline', 'figure', { priority: 'soft' });
    c.rel('contrast', 'headline', 'figure', { value: 3, priority: 'hard' });
    const top = t.y > c.H * 0.45;
    c.out.push(...info(c, top ? placeAt(S, 'tl', S.w * 0.6, Math.max(c.u * 10, t.y - S.y - c.u * 3)) : placeAt(S, 'bl', S.w * 0.6, Math.max(c.u * 10, S.y + S.h - (t.y + t.h) - c.u * 3)), { align: 'left', fromFoot: !top }));
  },

  'optical-illusion': (c) => {
    const kind = c.s('pattern');
    const calm = c.s('calm') as Anchor;
    const S = c.safe;
    const gen = kind === 'concentric' ? 'concentric' : kind === 'stripes' ? 'stripes' : kind === 'checker' ? 'checker' : 'radial';
    c.out.push(
      pattern(c, gen, { x: 0, y: 0, w: c.W, h: c.H }, gen === 'radial' ? { count: 72, taper: 1, inner: 0 } : gen === 'concentric' ? { scale: 1.1, weight: 0.95 } : gen === 'stripes' ? { scale: 0.55, ratio: 50 } : { scale: 0.75 }, ['ink'], 1, {
        name: 'Field',
      }),
    );
    c.rel('surround', 'pattern', 'headline');
    const box = placeAt(S, calm, S.w * (c.land ? 0.5 : 0.86), S.h * (c.land ? 0.6 : 0.36));
    const shape =
      calm === 'mc'
        ? disc(c, around(box.x + box.w / 2, box.y + box.h / 2, Math.max(box.w, box.h) * 1.05), c.pal.ground, { name: 'Calm' })
        : rect(c, { x: box.x - c.u * 3, y: box.y - c.u * 3, w: box.w + c.u * 6, h: box.h + c.u * 6 }, c.pal.ground, { name: 'Calm' });
    c.out.push(shape);
    const [hb, db] = splitV(calm === 'mc' ? { x: box.x + box.w * 0.12, y: box.y + box.h * 0.1, w: box.w * 0.76, h: box.h * 0.8 } : box, 0.6, c.u * 2);
    c.out.push(headline(c, hb, { align: 'center' }, { valign: 'bottom' }), ...info(c, db, { align: 'center' }));
    c.rel('negative-space', 'headline', undefined, { at: calm, value: 0.3, priority: 'hard' });
  },

  'pattern-driven': (c) => {
    const genP = c.s('gen');
    const scale = c.n('scale');
    const mode = c.s('head');
    const S = c.safe;
    const gen = genP === 'style' ? null : genP;
    c.out.push(pattern(c, gen, { x: 0, y: 0, w: c.W, h: c.H }, { scale }, ['accent', 'accent2'], 1, { name: 'Pattern' }));
    c.rel('repeat', 'pattern', undefined, { value: scale });
    if (mode === 'band') {
      const y = S.y + S.h * (c.land ? 0.3 : 0.56);
      const h = S.h * (c.land ? 0.44 : 0.34);
      c.out.push(rect(c, { x: 0, y: y - c.u * 3, w: c.W, h: h + c.u * 6 }, c.pal.ground, { name: 'Band' }));
      const [hb, db] = c.land ? splitH({ x: S.x, y, w: S.w, h }, 0.6, c.u * 4) : splitV({ x: S.x, y, w: S.w, h }, 0.6, c.u * 2);
      c.out.push(headline(c, hb, { align: 'left' }, { valign: 'middle' }), ...info(c, db, { align: 'left' }));
    } else if (mode === 'cutout') {
      const d = Math.min(S.w, S.h) * 0.86;
      const cx = c.W / 2;
      const cy = c.H * (c.land ? 0.5 : 0.46);
      c.out.push(disc(c, around(cx, cy, d), c.pal.ground, { name: 'Cut-out' }));
      const [hb, db] = splitV(around(cx, cy, d * 0.66, d * 0.62), 0.62, c.u * 2);
      c.out.push(headline(c, hb, { align: 'center' }, { valign: 'bottom' }), ...info(c, db, { align: 'center', scale: 0.85 }));
    } else calmWords(c, c.land ? placeAt(S, 'ml', S.w * 0.5, S.h * 0.7) : placeAt(S, 'bl', S.w * 0.86, S.h * 0.36));
    c.rel('contrast', 'headline', 'pattern', { value: 4.5, priority: 'hard' });
  },

  'procedural-composition': (c) => {
    const fn = c.s('fn');
    const k = Math.round(c.n('n') * (0.7 + c.dens * 0.5));
    const S = c.safe;
    const [figRoom, words] = c.land ? splitH(S, 0.56, c.u * 3) : splitV(S, 0.62, c.u * 3);
    const sq = squareIn(figRoom, c.land ? 'ml' : 'tc');
    const cx = sq.x + sq.w / 2;
    const cy = sq.y + sq.h / 2;
    const R = sq.w / 2;
    for (let i = 0; i < k; i++) {
      let px: number;
      let py: number;
      let d: number;
      if (fn === 'phyllotaxis') {
        const a = i * 2.39996;
        const r = R * Math.sqrt(i / k) * 0.95;
        [px, py, d] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r, (R / Math.sqrt(k)) * (0.55 + (i / k) * 0.95)];
      } else if (fn === 'rose') {
        const t = (i / k) * Math.PI * 2;
        const r = R * 0.95 * Math.cos(4 * t);
        [px, py, d] = [cx + Math.cos(t) * r, cy + Math.sin(t) * r, Math.max(c.u * 2, (R * 9) / k)];
      } else if (fn === 'lissajous') {
        const t = (i / k) * Math.PI * 2;
        [px, py, d] = [cx + Math.sin(3 * t + Math.PI / 2) * R * 0.92, cy + Math.sin(2 * t) * R * 0.92, Math.max(c.u * 2, (R * 7) / k)];
      } else {
        const cols = Math.max(4, Math.round(Math.sqrt(k)));
        const q = i % cols;
        const row = Math.floor(i / cols);
        const rows = Math.ceil(k / cols);
        [px, py] = [sq.x + (q + 0.5) * (sq.w / cols), sq.y + (row + 0.5) * (sq.h / rows)];
        d = (sq.w / cols) * (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(q * 0.9 + row * 0.6)));
      }
      c.out.push(figure(c, i % 3, around(px, py, d), c.paint(i % 3)));
    }
    c.rel('follow-path', 'figure', undefined, { priority: 'aesthetic' });
    c.rel('repeat', 'figure', undefined, { value: k });
    const [hb, db] = splitV(words, 0.6, c.u * 2);
    c.out.push(headline(c, hb, { align: 'left' }, { valign: c.land ? 'middle' : 'top' }), ...info(c, db, { align: 'left' }));
    c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
  },

  'organic-flow': (c) => {
    const lines = Math.round(c.n('lines'));
    const flow = c.n('flow');
    const mode = c.s('text');
    const S = c.safe;
    c.out.push(
      prim(c, 'flow-lines', { seed: (c.plan.seed % 900) + 7, lines: Math.max(2, Math.min(40, lines)), bend: Math.round(flow * 100) }, { x: -c.W * 0.05, y: c.H * 0.08, w: c.W * 1.1, h: c.H * 0.6 }, null, {
        name: 'Currents',
        stroke: { color: c.pal.accent, width: Math.max(1, c.u * 0.5) },
      }),
    );
    c.out.push(prim(c, 'blob', { seed: (c.plan.seed % 900) + 3, lobes: 5, irregular: 50 }, around(c.W * (0.3 + c.r('bx') * 0.4), c.H * 0.36, Math.min(c.W, c.H) * 0.4), c.paint(1), { name: 'Form', opacity: 0.9 }));
    c.rel('follow-path', 'figure', 'frame');
    if (mode === 'wave' && c.x.brief.content.headline.length <= 36) {
      const t = c.k.text(c.x, 'headline', c.x.brief.content.headline, { x: S.x, y: S.y + S.h * (c.land ? 0.56 : 0.62), w: S.w, h: S.h * 0.2 }, { align: 'center', path: { kind: 'wave', bend: 0, start: 50, cycles: 1, amplitude: 30 }, size: c.u * 6 });
      c.out.push(t);
      c.rel('follow-path', 'headline', 'figure');
      c.out.push(...info(c, placeAt(S, 'bc', S.w * 0.8, S.h * 0.14), { align: 'center', fromFoot: true }));
    } else {
      const [hb, db] = splitV(placeAt(S, 'bl', S.w * (c.land ? 0.6 : 1), S.h * 0.36), 0.62, c.u * 2);
      c.out.push(headline(c, hb, { align: 'left' }, { valign: 'bottom' }), ...info(c, db, { align: 'left' }));
      c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
    }
  },

  'spatial-tension': (c) => {
    const gap = c.n('gap');
    const dir = c.s('dir');
    const circle = c.s('mass') === 'circle';
    const S = c.safe;
    const d = Math.min(c.W, c.H) * 0.42;
    const g = Math.min(c.W, c.H) * gap;
    const cx = c.W / 2;
    const cy = c.H * (c.land ? 0.5 : 0.36);
    const [a, b] =
      dir === 'h'
        ? [around(cx - d / 2 - g / 2, cy, d), around(cx + d / 2 + g / 2, cy, d * 0.7)]
        : dir === 'v'
          ? [around(cx, cy - d / 2 - g / 2, d * 0.8), around(cx, cy + d / 2 + g / 2 - d * 0.1, d * 0.6)]
          : [around(cx - d * 0.36 - g, cy - d * 0.36 - g, d * 0.9), around(cx + d * 0.3, cy + d * 0.3, d * 0.62)];
    c.out.push(circle ? disc(c, a, c.paint(0), { name: 'Mass' }) : rect(c, a, c.paint(0), { name: 'Mass' }), circle ? disc(c, b, c.paint(1), { name: 'Mass' }) : rect(c, b, c.paint(1), { name: 'Mass' }));
    c.rel('spacing', 'figure', 'figure', { value: gap, priority: 'hard' });
    c.rel('intersect', 'figure', 'figure', { priority: 'aesthetic' });
    const words = c.land ? placeAt(S, 'mr', S.w * 0.34, S.h * 0.8) : placeAt(S, 'bl', S.w, S.h * 0.3);
    const [hb, db] = splitV(words, 0.62, c.u * 2);
    c.out.push(headline(c, hb, { align: 'left' }, { valign: 'bottom' }), ...info(c, db, { align: 'left' }));
    c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
  },

  'edge-cropped': (c) => {
    const edge = c.s('edge');
    const scale = c.n('scale');
    const over = c.s('head') === 'over';
    const S = c.safe;
    const d = Math.min(c.W, c.H) * scale;
    const [fx, fy] = { left: [0, 0.4], right: [1, 0.4], top: [0.5, 0], bottom: [0.5, 1], corner: [1, 0] }[edge] ?? [1, 0.4];
    c.out.push(figure(c, 0, around(c.W * fx, c.H * fy, d), c.paint(0), { name: 'Cropped figure' }));
    c.rel('crop', 'figure', 'artboard', { value: scale });
    const far: Anchor = edge === 'left' ? 'br' : edge === 'right' ? 'bl' : edge === 'top' ? 'bl' : edge === 'bottom' ? 'tl' : 'bl';
    const box = over ? placeAt(S, edge === 'bottom' ? 'tl' : 'bl', S.w * 0.9, S.h * 0.34) : placeAt(S, far, S.w * (c.land ? 0.48 : 0.8), S.h * (c.land ? 0.6 : 0.34));
    const [hb, db] = splitV(box, 0.62, c.u * 2);
    const align = far[1] === 'r' && !over ? 'right' : 'left';
    const t = headline(c, hb, { align }, { valign: 'bottom' });
    if (over) c.out.push(c.k.plateFor(c.x, t, c.u * 1.2));
    c.out.push(t, ...info(c, db, { align }));
    c.rel(over ? 'overlap' : 'avoid', 'figure', 'headline');
    c.rel('negative-space', 'artboard', undefined, { at: far, value: 0.25, priority: 'aesthetic' });
  },

  'irregular-modular': (c) => {
    const splits = Math.round(c.n('splits'));
    const ratio = c.n('ratio');
    const S = c.safe;
    const gap = c.u * 1.4;
    // a box split again and again, alternating direction, each cut at a seeded proportion near the plan's
    const boxes: Box[] = [S];
    for (let i = 0; i < splits; i++) {
      boxes.sort((p, q) => q.w * q.h - p.w * p.h);
      const b = boxes.shift()!;
      const k = Math.max(0.3, Math.min(0.7, ratio + (c.r(`k${i}`) - 0.5) * 0.24));
      const [p, q] = b.w > b.h ? splitH(b, k, gap) : splitV(b, k, gap);
      boxes.push(p, q);
    }
    boxes.sort((p, q) => q.w * q.h - p.w * p.h);
    const [headBox, detailBox, ...rest] = boxes;
    rest.forEach((b, i) => c.out.push(i % 2 ? figure(c, i, squareIn({ x: b.x + b.w * 0.1, y: b.y + b.h * 0.1, w: b.w * 0.8, h: b.h * 0.8 }), c.paint(i)) : rect(c, b, c.paint(i), { name: 'Module' })));
    c.out.push(headline(c, headBox, { align: 'left' }), ...info(c, detailBox, { align: 'left', scale: 0.85 }));
    c.rel('contain', 'headline', 'frame', { priority: 'hard' });
    c.rel('spacing', 'frame', undefined, { value: gap / c.W });
  },

  'mixed-media': (c) => {
    const lead = c.s('order');
    const marks = Math.round(c.n('marks'));
    const S = c.safe;
    const [a, b] = c.land ? splitH(S, 0.55, c.u * 3) : splitV(S, 0.55, c.u * 3);
    // a pattern swatch, a picture or a figure, drawn marks, and the type: each its own technique
    const sw = { x: a.x, y: a.y, w: a.w * 0.62, h: a.h * 0.7 };
    c.out.push(pattern(c, null, sw, { scale: 0.9 }, ['accent'], 1, { name: 'Swatch', rotation: -3 }));
    const p = photo(c, 0, { x: a.x + a.w * 0.42, y: a.y + a.h * 0.3, w: a.w * 0.56, h: a.h * 0.66 }, { s: { rotation: 4, name: 'Picture' } });
    c.out.push(p ?? figure(c, 0, { x: a.x + a.w * 0.46, y: a.y + a.h * 0.32, w: a.w * 0.5, h: a.h * 0.6 }, c.paint(0), { rotation: 4 }));
    for (let i = 0; i < marks; i++) {
      const kind = ['arrow-line', 'wave-lines', 'cross', 'annotation', 'bracket'][i % 5];
      c.out.push(
        prim(c, kind, kind === 'wave-lines' ? { lines: 3, amplitude: 14, frequency: 3 } : {}, around(a.x + a.w * (0.15 + c.r(`mx${i}`) * 0.7), a.y + a.h * (0.15 + c.r(`my${i}`) * 0.7), c.u * 9), null, {
          name: 'Mark',
          stroke: { color: c.pal.ink, width: Math.max(1, c.u * 0.35) },
        }),
      );
    }
    c.rel('overlap', 'image', 'pattern');
    c.rel('group', 'figure', 'image');
    const [hb, db] = splitV(b, lead === 'type' ? 0.66 : 0.56, c.u * 2);
    c.out.push(headline(c, hb, { align: 'left' }, { valign: c.land ? 'middle' : 'top' }), ...info(c, db, { align: 'left' }));
    c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
  },
};

void inkOn;
