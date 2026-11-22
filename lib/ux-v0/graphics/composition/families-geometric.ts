// lib/ux-v0/graphics/composition/families-geometric.ts — the geometric and spatial families.
//
// Each is a procedure on its parameters (schema.ts FAMILIES): the regions first (so the words always have the room they
// need), then the figures of the style's own geometry, then the words, each placed by a relationship it states. A
// landscape frame is composed side by side where a portrait one stacks.

import type { Anchor } from './schema';
import { arch, around, cells, disc, figure, headline, info, inkOn, line, metaLine, pattern, placeAt, prim, rect, splitH, splitV, squareIn, type Box, type CC, widestWord } from './kit';

type Family = (c: CC) => void;

const CENTRES: Record<string, [number, number]> = { mc: [0.5, 0.42], tc: [0.5, 0.3], bc: [0.5, 0.68], tl: [0.06, 0.06], br: [0.94, 0.94], ml: [0.2, 0.5], mr: [0.8, 0.5], tr: [0.94, 0.06], bl: [0.06, 0.94] };

/** The words' region opposite a figure's centre, and the figure's own room. */
function roomFor(c: CC, centre: string, share: number): { fig: Box; text: Box } {
  const S = c.safe;
  const gap = c.u * 3;
  if (c.land || centre === 'ml' || centre === 'mr') {
    const left = centre !== 'mr';
    const [a, b] = splitH(S, share, gap);
    return left ? { fig: a, text: b } : { fig: b, text: a };
  }
  if (centre === 'bc' || centre === 'br' || centre === 'bl') {
    const [a, b] = splitV(S, 1 - share, gap);
    return { fig: b, text: a };
  }
  const [a, b] = splitV(S, share, gap);
  return { fig: a, text: b };
}

export const GEOMETRIC: Record<string, Family> = {
  radial: (c) => {
    const centre = c.s('center');
    const count = Math.round(c.n('count'));
    const mode = c.s('text');
    const kind = c.s('figure');
    const corner = ['tl', 'br', 'tr', 'bl'].includes(centre);
    const long = c.x.brief.content.headline.length > 30;
    const ringText = mode === 'ring' && !long && !c.land;
    const inside = mode === 'inside' && !corner;
    // the figure's room: large and bleeding from a corner, or a square in its share of the frame
    const room = roomFor(c, centre, inside ? 0.78 : 0.6);
    const sq = corner ? null : squareIn(room.fig, centre === 'bc' ? 'bc' : centre === 'ml' ? 'ml' : centre === 'mr' ? 'mr' : 'tc');
    const [fx, fy] = CENTRES[centre] ?? CENTRES.mc;
    const R = corner ? Math.min(c.W, c.H) * (0.6 + c.dens * 0.25) : (sq!.w / 2) * (ringText ? 0.82 : 0.98);
    const cx = corner ? c.W * fx : sq!.x + sq!.w / 2;
    const cy = corner ? c.H * fy : sq!.y + sq!.h / 2;
    const fb = around(cx, cy, R * 2);
    if (kind === 'sectors') {
      c.out.push(prim(c, 'sunburst', { rays: Math.max(4, Math.min(48, count)), width: 50 }, fb, c.paint(0), { name: 'Sectors' }));
      c.out.push(disc(c, around(cx, cy, R * 0.62), c.paint(1), { name: 'Core' }));
    } else if (kind === 'rays') {
      c.out.push(prim(c, 'rays', { rays: Math.max(8, count * 4), inner: 22, jitter: Math.round(c.exp * 40), seed: (c.plan.seed % 900) + 1 }, fb, c.paint(0), { name: 'Rays' }));
      c.out.push(disc(c, around(cx, cy, R * 0.5), c.paint(1), { name: 'Core' }));
    } else if (kind === 'dots') {
      for (const [ring, k] of [
        [0.86, count],
        [0.58, Math.max(4, Math.round(count * 0.66))],
      ] as const)
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2 + (ring === 0.58 ? Math.PI / k : 0);
          const d = R * (ring === 0.86 ? 0.2 : 0.16);
          c.out.push(figure(c, i, around(cx + Math.cos(a) * R * ring, cy + Math.sin(a) * R * ring, d), c.paint(i % 3)));
        }
      c.out.push(disc(c, around(cx, cy, R * 0.62), c.paint(3), { name: 'Core' }));
    } else {
      for (let i = 0; i < Math.min(count, 16); i++) {
        const deg = (i / Math.min(count, 16)) * 360;
        const a = (deg * Math.PI) / 180;
        c.out.push(prim(c, 'leaf', { width: 48, bend: 0 }, around(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, R * 0.32, R * 0.9), c.paint(i % 2), { name: 'Petal', rotation: deg + 90 }));
      }
      c.out.push(disc(c, around(cx, cy, R * 0.5), c.paint(2), { name: 'Core' }));
    }
    c.rel('center', 'figure', corner ? 'frame' : 'artboard', { at: centre as Anchor });
    c.rel('repeat', 'figure', undefined, { value: count });
    const core = c.out[c.out.length - 1];
    const coreFill = typeof (core as { fill?: unknown }).fill === 'string' ? ((core as { fill: string }).fill as string) : c.pal.ground;
    // the words in the core only where the core holds them legibly (on a card or a badge it may not): else beside it
    let held = false;
    if (inside && !corner) {
      const r = (core.w / 2) * 0.86;
      const t = headline(c, around(cx, cy, r * 1.4, r * 1.1), { align: 'center', color: inkOn(c, coreFill) }, { valign: 'middle' });
      held = t.size >= Math.max(c.k.minText(c.x) * 1.8, c.u * 3.2) && widestWord(c, t) <= t.w + 0.5;
      if (held) {
        c.out.push(t);
        c.rel('contain', 'headline', 'figure', { priority: 'hard' });
        c.out.push(...info(c, room.text, { align: c.land ? 'left' : 'center' }));
      } else c.notes.push('the core is too small to hold the words: they are set beside the figure');
    }
    if (held) {
      // set above
    } else if (ringText) {
      const t = c.k.text(c.x, 'headline', c.x.brief.content.headline, around(cx, cy, R * 2.24), { size: c.u * 5, align: 'center', path: { kind: 'circle', bend: 0, start: 0, side: 'outside' } });
      c.out.push(t);
      c.rel('surround', 'headline', 'figure', { priority: 'soft' });
      c.rel('follow-path', 'headline', 'figure');
      c.out.push(...info(c, room.text, { align: 'center' }));
    } else {
      const [hb, db] = c.land ? splitV(room.text, 0.62, c.u * 2) : splitV(room.text, 0.58, c.u * 2);
      const align = c.land || centre === 'ml' ? 'left' : centre === 'mr' ? 'right' : centre === 'br' || centre === 'tl' ? (centre === 'tl' ? 'right' : 'left') : 'center';
      const textBox = corner ? (centre === 'tl' || centre === 'tr' ? { x: c.safe.x, y: c.H * 0.5, w: c.safe.w, h: c.safe.y + c.safe.h - c.H * 0.5 } : { x: c.safe.x, y: c.safe.y, w: c.safe.w, h: c.H * 0.46 - c.safe.y }) : null;
      if (textBox) {
        const [h2, d2] = splitV(textBox, 0.6, c.u * 2);
        c.out.push(headline(c, h2, { align: centre === 'tl' || centre === 'tr' ? 'right' : 'left' }, { valign: centre === 'tl' ? 'bottom' : 'top' }));
        c.out.push(...info(c, d2, { align: centre === 'tl' || centre === 'tr' ? 'right' : 'left' }));
      } else {
        c.out.push(headline(c, { ...hb, h: hb.h * c.ts }, { align }, { valign: centre === 'bc' ? 'bottom' : 'top' }));
        c.out.push(...info(c, db, { align }));
      }
      c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
    }
  },

  concentric: (c) => {
    const rings = Math.round(c.n('rings'));
    const centre = c.s('center');
    const ring = c.s('ring');
    const mode = c.s('text');
    const corner = ['tl', 'br'].includes(centre);
    const room = roomFor(c, centre, mode === 'core' ? 0.8 : 0.62);
    const sq = squareIn(room.fig, centre === 'bc' ? 'bc' : centre === 'ml' ? 'ml' : centre === 'mr' ? 'mr' : 'tc');
    const [fx, fy] = CENTRES[centre] ?? CENTRES.mc;
    const R = corner ? Math.min(c.W, c.H) * 0.75 : sq.w / 2;
    const cx = corner ? c.W * fx : sq.x + sq.w / 2;
    const cy = corner ? c.H * fy : sq.y + sq.h / 2;
    for (let i = 0; i < rings; i++) {
      const k = 1 - i / rings;
      const b = around(cx, cy, R * 2 * k);
      const paint = c.paint(i);
      const node = ring === 'circle' ? disc(c, b, paint, { name: 'Ring' }) : ring === 'square' ? rect(c, b, paint, { name: 'Ring', rotation: c.exp > 0.5 ? i * 4 : 0 }) : prim(c, 'polygon', { sides: 6, rotation: i * 6 }, b, paint, { name: 'Ring' });
      c.out.push(node);
    }
    c.rel('center', 'figure', 'artboard', { at: centre as Anchor });
    c.rel('repeat', 'figure', undefined, { value: rings });
    const innerFill = c.paint(rings - 1);
    if (mode === 'core' && !corner) {
      const r = (R * 2) / rings;
      c.out.push(headline(c, around(cx, cy, Math.max(r * 1.25, R * 0.75), Math.max(r, R * 0.5)), { align: 'center', color: inkOn(c, innerFill) }, { valign: 'middle' }));
      c.rel('contain', 'headline', 'figure', { priority: 'hard' });
      c.out.push(...info(c, room.text, { align: 'center' }));
    } else if (mode === 'crossing' && !c.land) {
      // the headline across the rings on a band of the ground: it crosses them and reads
      const hb = { x: c.safe.x, y: cy - R * 0.22, w: c.safe.w, h: R * 0.44 };
      const t = headline(c, hb, { align: 'center' }, { valign: 'middle' });
      c.out.push(rect(c, { x: 0, y: t.y - c.u * 1.5, w: c.W, h: t.h + c.u * 3 }, c.pal.ground, { name: 'Band' }), t);
      c.rel('intersect', 'headline', 'figure');
      c.out.push(...info(c, room.text, { align: 'center' }));
    } else {
      const tb = corner ? (centre === 'tl' ? { x: c.safe.x + c.safe.w * 0.3, y: c.H * 0.58, w: c.safe.w * 0.7, h: c.safe.y + c.safe.h - c.H * 0.58 } : { x: c.safe.x, y: c.safe.y, w: c.safe.w * 0.66, h: c.H * 0.4 - c.safe.y }) : room.text;
      const [hb, db] = splitV(tb, 0.6, c.u * 2);
      const align = centre === 'tl' ? 'right' : c.land || corner ? 'left' : 'center';
      c.out.push(headline(c, hb, { align }, { valign: centre === 'tl' ? 'bottom' : 'top' }), ...info(c, db, { align }));
      c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
    }
  },

  diagonal: (c) => {
    const ang = c.n('angle') || -24;
    const bands = Math.round(c.n('bands'));
    const mode = c.s('text');
    const len = Math.hypot(c.W, c.H) * 1.3;
    const thick = Math.min(c.W, c.H) * (0.14 + c.dens * 0.08);
    for (let i = 0; i < bands; i++) {
      const off = (i - (bands - 1) / 2) * thick * 1.9;
      const cx = c.W / 2 - Math.sin((ang * Math.PI) / 180) * off;
      const cy = c.H * 0.46 + Math.cos((ang * Math.PI) / 180) * off;
      c.out.push(rect(c, around(cx, cy, len, i === 0 ? thick : thick * 0.45), c.paint(i), { name: 'Band', rotation: ang }));
    }
    c.rel('rotate', 'figure', undefined, { value: ang });
    const fill = c.paint(0);
    if (mode === 'along') {
      const w = Math.min(c.W, c.H) * 1.05;
      const t = c.k.text(c.x, 'headline', c.x.brief.content.headline, around(c.W / 2, c.H * 0.46, w * c.ts, thick * 0.84), { align: 'center', valign: 'middle', rotation: ang, color: inkOn(c, fill) });
      c.out.push(t);
      c.rel('align', 'headline', 'figure', { value: ang });
      c.rel('rotate', 'headline', undefined, { value: ang });
      const corner: Anchor = ang < 0 ? 'bl' : 'br';
      const db = placeAt(c.safe, corner, c.safe.w * 0.56, c.H * 0.18);
      c.out.push(...info(c, db, { align: corner === 'br' ? 'right' : 'left', fromFoot: true }));
      c.rel('anchor', 'details', 'safe', { at: corner });
    } else if (mode === 'across') {
      // straight across the slant: the words set level, crossing the bands on a plate of the ground
      const hb = c.land ? placeAt(c.safe, 'ml', c.safe.w * 0.55, c.safe.h * 0.7) : placeAt(c.safe, 'tl', c.safe.w, c.safe.h * 0.36);
      const t = headline(c, hb, { align: 'left' }, { valign: 'top' });
      c.out.push(c.k.plateFor(c.x, t, c.u * 2), t);
      c.rel('intersect', 'headline', 'figure');
      const db = placeAt(c.safe, c.land ? 'br' : 'bl', c.safe.w * (c.land ? 0.4 : 0.6), c.H * 0.2);
      c.out.push(...info(c, db, { align: c.land ? 'right' : 'left', fromFoot: true }));
    } else {
      // corner: the words in the two corners the bands leave free
      const top: Anchor = ang < 0 ? 'tl' : 'tr';
      const hb = placeAt(c.safe, top, c.safe.w * (c.land ? 0.5 : 0.78), c.safe.h * (c.land ? 0.5 : 0.3));
      c.out.push(headline(c, hb, { align: top === 'tl' ? 'left' : 'right' }));
      const bottom: Anchor = ang < 0 ? 'br' : 'bl';
      c.out.push(...info(c, placeAt(c.safe, bottom, c.safe.w * 0.55, c.H * 0.2), { align: bottom === 'br' ? 'right' : 'left', fromFoot: true }));
      c.rel('anchor', 'headline', 'safe', { at: top, priority: 'hard' });
      c.rel('avoid', 'figure', 'headline');
    }
  },

  axial: (c) => {
    const vertical = c.s('axis') === 'vertical' && !c.land;
    const at = c.n('at');
    const rhythm = c.s('rhythm');
    const S = c.safe;
    if (vertical) {
      const ax = S.x + S.w * at;
      c.out.push(line(c, ax, S.y, ax, S.y + S.h, c.pal.ink, Math.max(1, c.u * 0.5), { name: 'Axis' }));
      // the headline hangs from the axis: to its right, or both sides when mirrored
      const right = { x: ax + c.u * 3, y: S.y, w: S.x + S.w - ax - c.u * 3, h: S.h * 0.42 };
      const left = { x: S.x, y: S.y + S.h * 0.46, w: ax - S.x - c.u * 3, h: S.h * 0.5 };
      c.out.push(headline(c, { ...right, h: right.h * c.ts }, { align: 'left' }));
      const details = info(c, rhythm === 'one-side' ? { x: right.x, y: S.y + S.h * 0.5, w: right.w, h: S.h * 0.5 } : left, { align: rhythm === 'one-side' ? 'left' : 'right', fromFoot: rhythm !== 'one-side' });
      c.out.push(...details);
      // figures on the axis, alternating sides
      const k = 3 + Math.round(c.dens * 3);
      for (let i = 0; i < k; i++) {
        const y = S.y + S.h * (0.08 + (i / k) * 0.86);
        const d = c.u * (4 + ((i * 7) % 5));
        const side = rhythm === 'mirrored' ? 0 : rhythm === 'alternate' ? (i % 2 ? 1 : -1) : -1;
        const cxp = side === 0 ? ax : ax + side * (d * 0.9 + c.u * 2);
        if (side === 0 || side === -1 || i > 1) c.out.push(figure(c, i, around(cxp, y, d), c.paint(i % 3)));
      }
      c.rel('align', 'headline', 'figure', { at: 'ml' });
    } else {
      const ay = S.y + S.h * at;
      c.out.push(line(c, S.x, ay, S.x + S.w, ay, c.pal.ink, Math.max(1, c.u * 0.5), { name: 'Axis' }));
      const above = { x: S.x, y: S.y, w: S.w * (c.land ? 0.7 : 1), h: ay - S.y - c.u * 3 };
      const below = { x: S.x + (rhythm === 'alternate' ? S.w * 0.35 : 0), y: ay + c.u * 3, w: S.w * (rhythm === 'alternate' ? 0.65 : 1), h: S.y + S.h - ay - c.u * 3 };
      c.out.push(headline(c, { ...above, h: above.h * c.ts }, { align: 'left' }, { valign: 'bottom' }), ...info(c, below, { align: rhythm === 'alternate' ? 'right' : 'left' }));
      const k = 4 + Math.round(c.dens * 4);
      for (let i = 0; i < k; i++) {
        const x = S.x + S.w * ((i + 0.5) / k);
        const d = c.u * (3 + (i % 3) * 1.5);
        if (rhythm !== 'one-side' || i % 2 === 0) c.out.push(figure(c, i, around(x, ay, d), c.paint(i % 3)));
      }
      c.rel('align', 'headline', 'figure', { at: 'bl' });
    }
    c.rel('distribute', 'figure', undefined, { priority: 'aesthetic' });
  },

  symmetrical: (c) => {
    const frame = c.s('frame');
    const at = c.s('head');
    const motif = c.s('motif');
    const S = c.safe;
    if (frame === 'arch') c.out.push(arch(c, { x: S.x + S.w * 0.08, y: S.y, w: S.w * 0.84, h: S.h * 0.94 }, null, { stroke: { color: c.pal.ink, width: Math.max(1, c.u * 0.5) }, name: 'Arch' }));
    else if (frame === 'border') c.out.push(prim(c, 'frame', { thickness: 2, corner: 1 }, { x: c.m * 0.5, y: c.m * 0.5, w: c.W - c.m, h: c.H - c.m }, c.pal.ink, { name: 'Frame' }));
    else if (frame === 'medallion')
      c.out.push(
        prim(c, 'guilloche', { petals: 12, loops: 3, depth: 45 }, around(c.W / 2, at === 'top' ? c.H * 0.66 : c.H * 0.3, Math.min(c.W, c.H) * 0.42), null, { name: 'Medallion', stroke: { color: c.pal.accent, width: Math.max(1, c.u * 0.3) } }),
      );
    // figures in mirrored pairs (or crowning or underpinning the words, on the axis)
    const d = Math.min(c.W, c.H) * (0.12 + c.dens * 0.08);
    const ys = at === 'top' ? [0.62, 0.8] : at === 'bottom' ? [0.18, 0.34] : [0.16, 0.84];
    if (motif === 'pair') for (const [i, y] of ys.entries()) for (const side of [-1, 1]) c.out.push(figure(c, i, around(c.W / 2 + side * S.w * 0.3, c.H * y, d), c.paint(i), side > 0 ? { flipX: true } : {}));
    else if (motif === 'crown') c.out.push(figure(c, 0, around(c.W / 2, at === 'top' ? c.H * 0.56 : S.y + d * 0.8, d * 1.6), c.paint(0)));
    else c.out.push(figure(c, 1, around(c.W / 2, at === 'bottom' ? S.y + d : S.y + S.h - d * 0.9, d * 1.8, d * 1.2), c.paint(1)));
    c.rel('mirror', 'figure', 'artboard', { priority: 'aesthetic' });
    const hb =
      at === 'top'
        ? { x: S.x + S.w * 0.12, y: S.y + S.h * 0.08, w: S.w * 0.76, h: S.h * 0.3 }
        : at === 'bottom'
          ? { x: S.x + S.w * 0.12, y: S.y + S.h * 0.5, w: S.w * 0.76, h: S.h * 0.28 }
          : { x: S.x + S.w * 0.12, y: S.y + S.h * 0.3, w: S.w * 0.76, h: S.h * 0.3 };
    const t = headline(c, { ...hb, h: hb.h * c.ts }, { align: 'center' }, { valign: 'middle' });
    c.out.push(t);
    const db = at === 'bottom' ? { x: S.x + S.w * 0.15, y: t.y + t.h + c.u * 3, w: S.w * 0.7, h: S.y + S.h - (t.y + t.h + c.u * 3) } : { x: S.x + S.w * 0.15, y: t.y + t.h + c.u * 3, w: S.w * 0.7, h: S.h * 0.3 };
    c.out.push(...info(c, db, { align: 'center' }));
    c.rel('center', 'headline', 'artboard', { priority: 'hard' });
    c.rel('align', 'details', 'headline', { at: 'tc' });
  },

  asymmetrical: (c) => {
    const side = c.s('mass');
    const size = c.n('size');
    const at = c.s('head') as Anchor;
    const S = c.safe;
    const d = Math.min(c.W, c.H) * size;
    // one large mass in a third, bleeding past the edge on its side
    const mx = side === 'left' ? c.W * 0.18 : side === 'right' ? c.W * 0.82 : c.W * 0.55;
    const my = side === 'top' ? c.H * 0.2 : side === 'bottom' ? c.H * 0.82 : c.H * 0.4;
    c.out.push(figure(c, 0, around(mx, my, d), c.paint(0), { name: 'Mass' }));
    c.out.push(figure(c, 1, around(mx + (side === 'left' ? d * 0.42 : -d * 0.42), my + d * 0.36, d * 0.34), c.paint(1), { name: 'Counterweight' }));
    c.rel('anchor', 'figure', 'artboard', { at: side === 'left' ? 'ml' : side === 'right' ? 'mr' : side === 'top' ? 'tc' : 'bc' });
    // the words in the corner furthest from the mass
    const far: Anchor = side === 'left' ? (at[0] === 't' ? 'tr' : 'br') : side === 'right' ? (at[0] === 't' ? 'tl' : 'bl') : side === 'top' ? (at[1] === 'l' ? 'bl' : 'br') : at[1] === 'l' ? 'tl' : 'tr';
    const hb = placeAt(S, far, S.w * (c.land ? 0.48 : 0.7) * c.ts, S.h * (c.land ? 0.62 : 0.34));
    const align = far[1] === 'r' ? 'right' : 'left';
    const t = headline(c, hb, { align }, { valign: far[0] === 'b' ? 'bottom' : 'top' });
    c.out.push(t);
    const dbY = far[0] === 't' ? t.y + t.h + c.u * 3 : S.y + (c.land ? 0 : S.h * 0.08);
    const db = far[0] === 't' ? { x: hb.x, y: dbY, w: hb.w, h: S.h * 0.3 } : { x: hb.x, y: Math.max(S.y, t.y - S.h * 0.26), w: hb.w, h: Math.max(c.u * 8, t.y - c.u * 3 - Math.max(S.y, t.y - S.h * 0.26)) };
    c.out.push(...info(c, db, { align, fromFoot: far[0] === 'b' }));
    c.rel('anchor', 'headline', 'safe', { at: far, priority: 'hard' });
    c.rel('avoid', 'figure', 'headline');
    c.rel('negative-space', 'artboard', undefined, { at: side === 'left' ? 'mr' : 'ml', value: 0.2, priority: 'aesthetic' });
  },

  'modular-grid': (c) => {
    const rows = Math.round(c.n('rows'));
    const cols = Math.max(2, Math.round(c.n('cols')) + (c.land ? 1 : 0));
    const span = c.s('span');
    const fill = c.n('fill');
    const gap = c.u * 1.4;
    const grid = cells(c.safe, rows, cols, gap);
    const at = (r: number, q: number) => grid[r * cols + q];
    const merge = (r0: number, q0: number, r1: number, q1: number): Box => {
      const a = at(r0, q0);
      const b = at(r1, q1);
      return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
    };
    const hr = c.s('span') === 'corner' ? rows - 2 : 0;
    const head = span === 'wide' ? merge(0, 0, Math.min(1, rows - 1), cols - 1) : span === 'tall' ? merge(0, 0, rows - 2, Math.max(0, Math.floor(cols / 2) - (cols > 2 ? 0 : 1))) : merge(Math.max(0, hr), 0, rows - 1, cols - 2);
    const taken = new Set<number>();
    grid.forEach((g, i) => {
      if (g.x >= head.x - 1 && g.y >= head.y - 1 && g.x + g.w <= head.x + head.w + 1 && g.y + g.h <= head.y + head.h + 1) taken.add(i);
    });
    // the details take the last free module; colour and figures fill a share of the rest
    const free = grid.map((_, i) => i).filter((i) => !taken.has(i));
    const detailCell = free[free.length - 1];
    free.forEach((i, k) => {
      if (i === detailCell) return;
      if (c.r(`m${i}`) > fill) return;
      const g = grid[i];
      if (k % 3 === 2) c.out.push(figure(c, k, { x: g.x + g.w * 0.1, y: g.y + g.h * 0.1, w: g.w * 0.8, h: g.h * 0.8 }, c.paint(k)));
      else c.out.push(rect(c, g, c.paint(k), { name: 'Module' }));
    });
    c.out.push(headline(c, head, { align: 'left' }));
    c.out.push(...info(c, grid[detailCell] ?? at(rows - 1, cols - 1), { align: 'left', scale: 0.85 }));
    c.rel('contain', 'headline', 'frame', { priority: 'hard' });
    c.rel('spacing', 'figure', undefined, { value: gap / c.W });
    c.rel('align', 'headline', 'figure', { at: 'tl' });
  },

  'column-grid': (c) => {
    const cols = Math.round(c.n('cols')) + (c.land ? 2 : 0);
    const start = Math.min(cols - 2, Math.round(c.n('start')));
    const rules = c.s('rules') === 'on';
    const at = c.s('head');
    const gap = c.u * 2;
    const S = c.safe;
    const cw = (S.w - gap * (cols - 1)) / cols;
    const colX = (i: number) => S.x + i * (cw + gap);
    if (rules) for (let i = 1; i < cols; i++) c.out.push(line(c, colX(i) - gap / 2, S.y, colX(i) - gap / 2, S.y + S.h, c.pal.muted, Math.max(0.5, c.u * 0.12), { name: 'Column rule' }));
    const spanCols = Math.max(2, cols - start - (cols > 4 ? 1 : 0));
    const hw = spanCols * cw + (spanCols - 1) * gap;
    const hy = at === 'top' ? S.y : at === 'middle' ? S.y + S.h * 0.32 : S.y + S.h * 0.5;
    const t = headline(c, { x: colX(start), y: hy, w: hw, h: S.h * 0.4 * c.ts }, { align: 'left' }, { valign: at === 'bottom' ? 'bottom' : 'top' });
    c.out.push(t);
    // the details keep to one column; a block of the accent marks another
    const dcol = start === 0 ? cols - 1 : 0;
    const dTop = at === 'top' ? t.y + t.h + c.u * 4 : S.y;
    c.out.push(...info(c, { x: colX(dcol), y: dTop, w: Math.max(cw, cols > 4 ? cw * 2 + gap : cw), h: S.y + S.h - dTop }, { align: 'left', scale: 0.85, fromFoot: at !== 'top' }));
    const bc = start === 0 ? Math.max(1, cols - 2) : 1;
    c.out.push(rect(c, { x: colX(bc), y: at === 'top' ? S.y + S.h * 0.72 : S.y, w: cw, h: S.h * 0.22 }, c.paint(0), { name: 'Block' }));
    c.rel('align', 'headline', 'frame', { at: 'tl', priority: 'hard' });
    c.rel('align', 'details', 'frame', { at: 'tl' });
    c.rel('spacing', 'frame', undefined, { value: gap / c.W });
  },

  'hierarchical-grid': (c) => {
    const split = c.n('split');
    const rows = c.s('orient') === 'rows' && !c.land;
    const lead = c.s('lead');
    const gap = c.u * 2;
    const [a, b] = rows ? splitV(c.safe, split, gap) : splitH(c.safe, split, gap);
    const [b1, b2] = rows ? splitH(b, 0.5, gap) : splitV(b, 0.55, gap);
    if (lead === 'type') {
      c.out.push(headline(c, a, { align: 'left' }, { valign: rows ? 'bottom' : 'top' }));
      c.out.push(rect(c, b1, c.paint(0), { name: 'Panel' }), figure(c, 0, squareIn({ x: b1.x + b1.w * 0.15, y: b1.y + b1.h * 0.15, w: b1.w * 0.7, h: b1.h * 0.7 }), inkOn(c, c.paint(0))));
      c.out.push(...info(c, b2, { align: 'left' }));
    } else {
      c.out.push(rect(c, a, c.paint(0), { name: 'Field' }), figure(c, 0, squareIn({ x: a.x + a.w * 0.12, y: a.y + a.h * 0.12, w: a.w * 0.76, h: a.h * 0.76 }), c.paint(1)));
      c.out.push(headline(c, b1, { align: 'left' }, { valign: 'top' }));
      c.out.push(...info(c, b2, { align: 'left' }));
    }
    c.rel('contain', 'headline', 'frame', { priority: 'hard' });
    c.rel('hierarchy', 'headline', 'details', { value: split });
    c.rel('align', 'headline', 'details', { at: 'tl' });
  },

  'broken-grid': (c) => {
    const cols = Math.round(c.n('cols')) + (c.land ? 1 : 0);
    const brk = c.s('break');
    const off = c.n('offset');
    const S = c.safe;
    const gap = c.u * 2;
    const grid = cells(S, 4, cols, gap);
    // the grid kept: a row of modules and a column of rules
    for (let q = 0; q < cols; q++) if (q % 2 === 0) c.out.push(rect(c, grid[(c.land ? 0 : 2) * cols + q], c.paint(q), { name: 'Module' }));
    for (let q = 1; q < cols; q++) c.out.push(line(c, grid[q].x - gap / 2, S.y, grid[q].x - gap / 2, S.y + S.h, c.pal.muted, Math.max(0.5, c.u * 0.12), { name: 'Rule' }));
    // and broken: the headline pushed off its column across the others; a figure off its row
    const dx = S.w * off;
    const t = headline(c, { x: S.x + (brk !== 'figure' ? dx : 0), y: S.y + S.h * (c.land ? 0.42 : 0.06), w: S.w * 0.8 * c.ts, h: S.h * (c.land ? 0.5 : 0.36) }, { align: 'left' });
    c.out.push(c.k.plateFor(c.x, t, c.u * 1.2), t);
    if (brk !== 'headline') {
      const g = grid[(c.land ? 1 : 1) * cols + cols - 1];
      c.out.push(figure(c, 1, { x: g.x - dx, y: g.y + g.h * off, w: g.w * 1.6, h: g.w * 1.6 }, c.paint(1)));
    }
    c.out.push(...info(c, { x: S.x, y: S.y + S.h * 0.76, w: S.w * 0.6, h: S.h * 0.24 }, { align: 'left', fromFoot: true }));
    c.rel('offset', 'headline', 'frame', { value: off });
    c.rel('overlap', 'headline', 'figure');
    c.rel('align', 'details', 'frame', { at: 'bl' });
  },

  isometric: (c) => {
    const cubes = Math.round(c.n('cubes'));
    const mode = c.s('head');
    const lean = c.s('tilt') === 'left' ? -1 : 1;
    const S = c.safe;
    const [figRoom, textRoom] = c.land ? splitH(S, 0.55, c.u * 3) : mode === 'above' ? (splitV(S, 0.42, c.u * 3).reverse() as [Box, Box]) : splitV(S, 0.6, c.u * 3);
    c.out.push(prim(c, 'isometric-grid', { cells: 8 + Math.round(c.dens * 8) }, figRoom, null, { name: 'Isometric grid', stroke: { color: c.pal.muted, width: Math.max(0.5, c.u * 0.1) }, opacity: 0.6 }));
    // blocks stacked on the grid: each a top and two sides in three tones of the palette
    const s = Math.min(figRoom.w, figRoom.h) / (3.2 + cubes * 0.25);
    for (let i = 0; i < cubes; i++) {
      const gx = figRoom.x + figRoom.w / 2 + lean * ((i % 3) - 1) * s * 0.9;
      const gy = figRoom.y + figRoom.h * 0.62 - Math.floor(i / 3) * s * 0.55 - (i % 3) * s * 0.26;
      const w = s;
      c.out.push(prim(c, 'parallelogram', { slant: -30 }, { x: gx - w / 2, y: gy - w * 0.5, w, h: w * 0.29 }, c.paint(0), { name: 'Top', skewX: 0 }));
      c.out.push(prim(c, 'parallelogram', { slant: 0 }, { x: gx - w / 2, y: gy - w * 0.21, w: w / 2, h: w * 0.58 }, c.paint(1), { name: 'Side', skewY: 30 }));
      c.out.push(prim(c, 'parallelogram', { slant: 0 }, { x: gx, y: gy - w * 0.21, w: w / 2, h: w * 0.58 }, c.paint(2), { name: 'Side', skewY: -30 }));
    }
    c.rel('repeat', 'figure', undefined, { value: cubes });
    if (mode === 'plane' && !c.land) {
      const t = headline(c, { x: textRoom.x, y: textRoom.y, w: textRoom.w * 0.9, h: textRoom.h * 0.5 }, { align: 'left', skewY: lean * -12 });
      c.out.push(t);
      c.rel('rotate', 'headline', undefined, { value: lean * -12 });
    } else c.out.push(headline(c, { ...textRoom, h: textRoom.h * 0.55 }, { align: 'left' }, { valign: mode === 'above' ? 'top' : 'top' }));
    const last = c.out[c.out.length - 1];
    c.out.push(...info(c, { x: textRoom.x, y: last.y + last.h + c.u * 3, w: textRoom.w, h: textRoom.y + textRoom.h - (last.y + last.h + c.u * 3) }, { align: 'left' }));
    c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
  },

  spiral: (c) => {
    const turns = c.n('turns');
    const eye = c.s('center');
    const mode = c.s('text');
    const S = c.safe;
    const big = Math.min(c.W, c.H) * (eye === 'mc' ? 0.82 : 1.1);
    const [ex, ey] = { mc: [0.5, 0.42], tl: [0.28, 0.24], br: [0.72, 0.74], bl: [0.28, 0.76], tr: [0.72, 0.26] }[eye] ?? [0.5, 0.42];
    const cx = c.W * ex;
    const cy = c.H * ey;
    // figures along a spiral (golden angle), growing outward
    const k = Math.round(14 + c.dens * 22);
    for (let i = 1; i <= k; i++) {
      const tt = i / k;
      const a = tt * turns * Math.PI * 2;
      const r = tt * big * 0.5;
      const d = c.u * (1.4 + tt * 7);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (px < -d || py < -d || px > c.W + d || py > c.H + d) continue;
      c.out.push(figure(c, i, around(px, py, d), c.paint(i % 3)));
    }
    c.out.push(prim(c, 'spiral', { turns: Math.round(turns), growth: 0 }, around(cx, cy, big), null, { name: 'Spiral line', stroke: { color: c.pal.muted, width: Math.max(0.5, c.u * 0.2) }, opacity: 0.8 }));
    c.rel('follow-path', 'figure', 'frame');
    if (mode === 'center') {
      c.out.push(disc(c, around(cx, cy, big * 0.34), c.pal.ground, { name: 'Eye' }));
      c.out.push(headline(c, around(cx, cy, big * 0.3, big * 0.22), { align: 'center' }, { valign: 'middle' }));
      c.rel('center', 'headline', 'figure', { priority: 'hard' });
      c.out.push(...info(c, placeAt(S, ey < 0.5 ? 'bc' : 'tc', S.w * 0.8, S.h * 0.2), { align: 'center', fromFoot: ey < 0.5 }));
    } else {
      const far: Anchor = ey < 0.5 ? (ex < 0.5 ? 'br' : 'bl') : ex < 0.5 ? 'tr' : 'tl';
      const box = eye === 'mc' ? placeAt(S, 'bl', S.w, S.h * 0.26) : placeAt(S, far, S.w * 0.62, S.h * 0.4);
      const t = headline(c, { ...box, h: box.h * 0.66 }, { align: far[1] === 'r' ? 'right' : 'left' }, { valign: 'top' });
      c.out.push(c.k.plateFor(c.x, t, c.u * 1.2), t);
      c.out.push(...info(c, { x: box.x, y: t.y + t.h + c.u * 2, w: box.w, h: box.y + box.h - (t.y + t.h + c.u * 2) }, { align: far[1] === 'r' ? 'right' : 'left' }));
      c.rel('anchor', 'headline', 'safe', { at: far });
    }
  },

  circular: (c) => {
    const size = c.n('size');
    const at = c.s('at');
    const mode = c.s('text');
    const S = c.safe;
    const d = Math.min(S.w, S.h) * size;
    const cx = c.W / 2;
    const cy = at === 'tc' ? S.y + d / 2 : at === 'bc' ? S.y + S.h - d / 2 : c.H / 2;
    const fill = c.paint(0);
    c.out.push(disc(c, around(cx, cy, d), fill, { name: 'Circle' }));
    c.rel('contain', 'headline', 'figure', { priority: 'hard' });
    const ink = inkOn(c, fill);
    const long = c.x.brief.content.headline.length > 32;
    if ((mode === 'arc' || mode === 'both') && !long) {
      c.out.push(c.k.text(c.x, 'headline', c.x.brief.content.headline, around(cx, cy, d * 0.78), { size: c.u * 4.5, align: 'center', color: ink, path: { kind: 'circle', bend: 0, start: 0, side: 'inside' } }));
      c.rel('follow-path', 'headline', 'figure');
      if (mode === 'both') c.out.push(figure(c, 1, around(cx, cy, d * 0.3), c.paint(1)));
      c.out.push(...info(c, around(cx, cy, d * 0.42, d * 0.3), { align: 'center', color: ink, scale: 0.85 }));
    } else {
      c.out.push(headline(c, around(cx, cy - d * 0.08, d * 0.62, d * 0.34), { align: 'center', color: ink }, { valign: 'middle' }));
      const last = c.out[c.out.length - 1];
      c.out.push(...info(c, { x: cx - d * 0.3, y: last.y + last.h + c.u * 2, w: d * 0.6, h: d * 0.24 }, { align: 'center', color: ink, scale: 0.85 }));
    }
    // the corners outside the circle hold the smallest marks
    c.out.push(figure(c, 2, placeAt(S, at === 'bc' ? 'tr' : 'br', c.u * 8, c.u * 8), c.paint(2)));
    c.rel('surround', 'frame', 'figure', { priority: 'aesthetic' });
  },

  angular: (c) => {
    const planes = Math.round(c.n('planes'));
    const ang = c.n('angle');
    const mode = c.s('head');
    for (let i = 0; i < planes; i++) {
      const t = (i + 1) / (planes + 1);
      const pts = i % 2 === 0 ? `M0 ${Math.round(100 * t)} L100 ${Math.round(100 * t - ang)} L100 100 L0 100 Z` : `M0 0 L${Math.round(100 * t + ang / 2)} 0 L${Math.round(100 * t - ang / 2)} 100 L0 100 Z`;
      c.out.push({ ...rect(c, { x: 0, y: 0, w: c.W, h: c.H }, null), shape: 'path', path: pts, fill: c.paint(i), name: 'Plane', opacity: i === 0 ? 1 : 0.88 } as never);
    }
    c.rel('intersect', 'figure', 'frame');
    const S = c.safe;
    const box = mode === 'plane' ? placeAt(S, 'bl', S.w * (c.land ? 0.55 : 0.86), S.h * (c.land ? 0.5 : 0.3)) : placeAt(S, 'tl', S.w * (c.land ? 0.5 : 0.8), S.h * (c.land ? 0.5 : 0.28));
    const t = headline(c, box, { align: 'left', rotation: mode === 'plane' ? -Math.min(14, ang / 2) : 0 }, { valign: mode === 'plane' ? 'bottom' : 'top' });
    c.out.push(c.k.plateFor(c.x, t, c.u * 1.4), t);
    c.rel('rotate', 'headline', undefined, { value: mode === 'plane' ? -Math.min(14, ang / 2) : 0 });
    c.out.push(...info(c, placeAt(S, mode === 'plane' ? 'tr' : 'br', S.w * 0.5, S.h * 0.22), { align: 'right', fromFoot: mode !== 'plane' }));
  },

  'layered-geometry': (c) => {
    const planes = Math.round(c.n('planes'));
    const off = c.n('offset');
    const blend = c.s('blend');
    const mode = c.s('head');
    const S = c.safe;
    const [figRoom, textRoom] = mode === 'over' && !c.land ? [S, S] : c.land ? splitH(S, 0.52, c.u * 3) : splitV(S, 0.56, c.u * 3);
    const base = Math.min(figRoom.w, figRoom.h) * 0.62;
    for (let i = 0; i < planes; i++) {
      const dx = (i - planes / 2) * figRoom.w * off;
      const dy = (i - planes / 2) * figRoom.h * off * 0.8;
      const b = around(figRoom.x + figRoom.w / 2 + dx, figRoom.y + figRoom.h * 0.45 + dy, base * (1 - i * 0.06));
      c.out.push(
        i % 2
          ? figure(c, i, b, c.paint(i), { blend: blend === 'multiply' ? 'multiply' : undefined, opacity: 0.9 })
          : rect(c, b, c.paint(i), { name: 'Plane', blend: blend === 'multiply' ? 'multiply' : undefined, opacity: 0.9, rotation: c.exp > 0.4 ? i * 7 : 0 }),
      );
    }
    c.rel('overlap', 'figure', 'figure');
    c.rel('offset', 'figure', undefined, { value: off });
    if (mode === 'over' && !c.land) {
      const t = headline(c, placeAt(S, 'bl', S.w, S.h * 0.32 * c.ts), { align: 'left' }, { valign: 'bottom' });
      c.out.push(c.k.plateFor(c.x, t, c.u * 1.4), t);
      c.out.push(...info(c, placeAt(S, 'tl', S.w * 0.5, S.h * 0.2), { align: 'left' }));
      c.rel('overlap', 'headline', 'figure');
    } else {
      const [hb, db] = splitV(textRoom, 0.6, c.u * 2);
      c.out.push(headline(c, hb, { align: 'left' }, { valign: c.land ? 'middle' : 'top' }), ...info(c, db, { align: 'left' }));
      c.rel('avoid', 'figure', 'headline', { priority: 'hard' });
    }
  },
};

void pattern;
void metaLine;
