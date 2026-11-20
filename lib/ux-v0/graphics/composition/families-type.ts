// lib/ux-v0/graphics/composition/families-type.ts — the typography-driven families.
//
// The words are the structure here: their size, their turn, their breaks, their repetition and their faces organise
// the frame. The headline is always set once in full and readable (exactly as written); a cropped or repeated copy is
// marked decorative, so the checks read it as an image and the essential words stay whole.

import { contrastRatio } from '../../../ux/audit';
import { mixedFaces } from '../styles/constructions-kit';
import type { Anchor } from './schema';
import { around, figure, headline, info, inkOn, line, pattern, placeAt, prim, rect, setHeight, setWidth, splitH, splitV, type Box, type CC, fillForInk } from './kit';

type Family = (c: CC) => void;

const tone = (c: CC, k: number) => {
  // a quiet version of the accent for an echo: far enough from the ground to show, close enough to sit back
  const [a, g] = [c.pal.accent, c.pal.ground];
  const mixHex = (p: string, q: string, t: number) => {
    const P = [1, 3, 5].map((i) => parseInt(p.slice(i, i + 2), 16));
    const Q = [1, 3, 5].map((i) => parseInt(q.slice(i, i + 2), 16));
    return `#${P.map((v, i) =>
      Math.round(v + (Q[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    ).join('')}`;
  };
  const out = mixHex(a, g, k);
  return contrastRatio(out, g) < 1.15 ? mixHex(c.pal.ink, g, 0.82) : out;
};

/** A decorative copy of the headline (cropped, repeated, set as an image): the essential headline is elsewhere. */
function echo(c: CC, box: Box, s: Record<string, unknown> = {}) {
  const t = c.k.text(c.x, 'label', c.x.brief.content.headline, box, { name: 'Headline, set as an image', decorative: true, ...s } as never);
  return t;
}

export const TYPOGRAPHIC: Record<string, Family> = {
  'typography-dominant': (c) => {
    const at = c.s('at');
    const align = c.s('align') as 'left' | 'center' | 'right';
    const acc = c.s('figure');
    const S = c.safe;
    const share = 0.62 * c.ts;
    const hb = at === 'top' ? { x: S.x, y: S.y, w: S.w, h: S.h * share } : at === 'bottom' ? { x: S.x, y: S.y + S.h * (1 - share), w: S.w, h: S.h * share } : { x: S.x, y: S.y + S.h * (0.5 - share / 2) - S.h * 0.04, w: S.w, h: S.h * share };
    const t = headline(c, hb, { align }, { valign: at === 'bottom' ? 'bottom' : at === 'middle' ? 'middle' : 'top' });
    c.out.push(t);
    c.rel('hierarchy', 'headline', 'details', { value: 8, priority: 'hard' });
    c.rel('anchor', 'headline', 'safe', { at: ((at === 'top' ? 't' : at === 'bottom' ? 'b' : 'm') + (align === 'left' ? 'l' : align === 'right' ? 'r' : 'c')) as Anchor });
    const below = at !== 'bottom';
    const db = below ? { x: S.x, y: t.y + t.h + c.u * 3, w: S.w * (c.land ? 0.6 : 0.8), h: S.y + S.h - (t.y + t.h + c.u * 3) } : { x: S.x, y: S.y, w: S.w * 0.8, h: Math.max(c.u * 8, t.y - c.u * 3 - S.y) };
    const dbAligned = align === 'right' ? { ...db, x: S.x + S.w - db.w } : align === 'center' ? { ...db, x: S.x + (S.w - db.w) / 2 } : db;
    if (acc === 'rule') c.out.push(line(c, dbAligned.x, below ? t.y + t.h + c.u * 1.5 : t.y - c.u * 1.5, dbAligned.x + dbAligned.w * 0.5, below ? t.y + t.h + c.u * 1.5 : t.y - c.u * 1.5, c.pal.accent, Math.max(1, c.u * 0.6), { name: 'Rule' }));
    if (acc === 'small') c.out.push(figure(c, 0, placeAt(S, below ? (align === 'right' ? 'tl' : 'tr') : align === 'right' ? 'bl' : 'br', c.u * 9, c.u * 9), c.paint(0)));
    c.out.push(...info(c, dbAligned, { align, fromFoot: at === 'middle' }));
  },

  'oversized-cropped-typography': (c) => {
    const edge = c.s('edge');
    const scale = c.n('scale');
    const real = c.s('real');
    const S = c.safe;
    // the image: the headline far larger than the frame, cut by one edge
    const words = c.x.brief.content.headline;
    const big = Math.min(c.W, c.H) * 0.26 * scale;
    const e = echo(c, { x: 0, y: 0, w: c.W * 4, h: big * 1.4 }, { size: big, lineHeight: 0.9, color: tone(c, 0.35), align: 'left' });
    e.w = Math.max(c.W * 0.8, setWidth(c, e) + c.u * 2);
    e.h = setHeight(c, e);
    if (edge === 'left') Object.assign(e, { x: -e.w * 0.32, y: c.H * 0.3 });
    else if (edge === 'right') Object.assign(e, { x: c.W - e.w * 0.68, y: c.H * 0.24 });
    else if (edge === 'top') Object.assign(e, { x: -c.u * 2, y: -e.h * 0.42 });
    else Object.assign(e, { x: -c.u * 2, y: c.H - e.h * 0.58 });
    c.out.push(e);
    c.rel('crop', 'headline', 'artboard', { value: scale });
    c.rel('scale', 'headline', undefined, { value: scale });
    // set again, whole, to be read
    const box: Box =
      real === 'corner'
        ? placeAt(S, edge === 'top' ? 'bl' : 'tl', S.w * 0.62, S.h * 0.26)
        : real === 'beneath'
          ? edge === 'bottom'
            ? { x: S.x, y: S.y, w: S.w, h: S.h * 0.3 }
            : { x: S.x, y: Math.min(S.y + S.h * 0.66, e.y + e.h + c.u * 3), w: S.w, h: S.h * 0.22 }
          : placeAt(S, edge === 'left' ? 'tr' : 'tl', S.w * 0.5, S.h * 0.36);
    const t = headline(c, box, { align: real === 'beside' && edge === 'left' ? 'right' : 'left', color: c.pal.ink }, { valign: 'top' });
    c.out.push(c.k.plateFor(c.x, t, c.u * 1.2), t);
    c.rel('hierarchy', 'headline', 'details', { priority: 'hard' });
    const dAnchor: Anchor = edge === 'bottom' ? 'tr' : 'br';
    c.out.push(...info(c, placeAt(S, dAnchor, S.w * 0.5, S.h * 0.24), { align: 'right', fromFoot: dAnchor[0] === 'b' }));
  },

  'text-as-image': (c) => {
    const treat = c.s('treatment');
    const at = c.s('at');
    const S = c.safe;
    const hb = at === 'top' ? { x: S.x, y: S.y, w: S.w, h: S.h * 0.5 } : at === 'bottom' ? { x: S.x, y: S.y + S.h * 0.4, w: S.w, h: S.h * 0.46 } : { x: S.x, y: S.y + S.h * 0.18, w: S.w, h: S.h * 0.5 };
    let t = headline(c, hb, { align: 'center' }, { valign: at === 'bottom' ? 'bottom' : 'middle' });
    if (treat === 'pattern-fill') {
      // a field of the style's pattern behind the letters; the letters drawn in the ground with an outline
      c.out.push(pattern(c, null, { x: 0, y: t.y - c.u * 4, w: c.W, h: t.h + c.u * 8 }, { scale: 1.2 }, ['accent', 'accent2'], 1, { name: 'Field' }));
      t = { ...t, color: c.pal.ground, stroke: { color: c.pal.ink, width: Math.max(1.5, t.size * 0.035) } };
      c.out.push(rect(c, { x: 0, y: t.y - c.u * 4, w: c.W, h: t.h + c.u * 8 }, null, { name: 'Edge', stroke: { color: c.pal.ink, width: Math.max(1, c.u * 0.3) } }));
    } else if (treat === 'outline-stack') {
      t = { ...t, repeat: { count: 4, dx: 0, dy: -Math.round(t.size * 0.28), fade: 0.5, outline: true } } as typeof t;
      t.y += t.size * 0.9;
    } else if (treat === 'extrude') {
      t = { ...t, color: c.pal.accent, effects: c.k.paletteFx(c.x, [{ kind: 'extrude', params: { depth: 12, angle: 135, steps: 12 }, color: c.pal.ink } as never]) };
    } else {
      t = {
        ...t,
        fill: {
          type: 'linear',
          angle: 90,
          stops: [
            { at: 0, color: c.pal.accent },
            { at: 1, color: c.pal.accent2 },
          ],
        } as never,
      };
    }
    c.out.push(t);
    c.rel('hierarchy', 'headline', 'details', { priority: 'hard' });
    c.rel('mask', 'headline', 'pattern', { priority: 'aesthetic' });
    const below = at !== 'bottom';
    const db = below ? { x: S.x + S.w * 0.15, y: Math.min(S.y + S.h - S.h * 0.2, t.y + t.h + c.u * (treat === 'pattern-fill' ? 7 : 3)), w: S.w * 0.7, h: S.h * 0.22 } : { x: S.x + S.w * 0.15, y: S.y, w: S.w * 0.7, h: S.h * 0.3 };
    c.out.push(...info(c, db, { align: 'center' }));
  },

  'vertical-typography': (c) => {
    const edge = c.s('edge');
    const where = c.s('details');
    const S = c.safe;
    const colW = Math.min(S.w * 0.34, c.u * 26) * c.ts;
    const box = { x: edge === 'left' ? S.x : S.x + S.w - colW, y: S.y, w: colW, h: S.h };
    const t = c.k.text(c.x, 'headline', c.x.brief.content.headline, box, { vertical: true, align: 'left' });
    c.out.push(t);
    c.rel('rotate', 'headline', undefined, { value: -90 });
    c.rel('anchor', 'headline', 'safe', { at: edge === 'left' ? 'ml' : 'mr', priority: 'hard' });
    const rest = { x: edge === 'left' ? S.x + colW + c.u * 4 : S.x, y: S.y, w: S.w - colW - c.u * 4, h: S.h };
    c.out.push(line(c, edge === 'left' ? rest.x - c.u * 2 : rest.x + rest.w + c.u * 2, S.y, edge === 'left' ? rest.x - c.u * 2 : rest.x + rest.w + c.u * 2, S.y + S.h, c.pal.ink, Math.max(1, c.u * 0.35), { name: 'Rule' }));
    const fig = where === 'beside' ? { x: rest.x, y: rest.y, w: rest.w, h: rest.h * 0.55 } : where === 'top' ? { x: rest.x, y: rest.y + rest.h * 0.42, w: rest.w, h: rest.h * 0.58 } : { x: rest.x, y: rest.y, w: rest.w, h: rest.h * 0.6 };
    c.out.push(figure(c, 0, { x: fig.x + fig.w * 0.08, y: fig.y + fig.h * 0.08, w: Math.min(fig.w, fig.h) * 0.84, h: Math.min(fig.w, fig.h) * 0.84 }, c.paint(0)));
    const db = where === 'top' ? { x: rest.x, y: rest.y, w: rest.w, h: rest.h * 0.38 } : { x: rest.x, y: rest.y + rest.h * 0.64, w: rest.w, h: rest.h * 0.36 };
    c.out.push(...info(c, db, { align: edge === 'left' ? 'left' : 'right', fromFoot: where !== 'top' }));
    c.rel('align', 'details', 'headline', { at: where === 'top' ? 'tl' : 'bl' });
  },

  'rotational-typography': (c) => {
    const ang = Number(c.s('angle')) || -45;
    const cross = c.s('echo') === 'cross';
    const at = c.s('at');
    const S = c.safe;
    const [px, py] = at === 'tl' ? [0.42, 0.36] : at === 'br' ? [0.58, 0.6] : [0.5, 0.46];
    const span = Math.abs(ang) >= 80 ? c.H * 0.86 : Math.abs(ang) >= 40 ? Math.min(c.W, c.H) * 1.15 : Math.min(c.W * 0.95, c.H);
    const thick = Math.min(c.W, c.H) * 0.28 * c.ts;
    const t = c.k.text(c.x, 'headline', c.x.brief.content.headline, around(c.W * px, c.H * py, span, thick), { align: 'center', valign: 'middle', rotation: ang });
    // the turned words run past the figure onto the ground: the figure takes a colour the ink reads on, so one colour serves both
    c.out.push(figure(c, 0, around(c.W * px, c.H * py, Math.min(c.W, c.H) * 0.5), fillForInk(c), { opacity: 0.9 }), t);
    t.color = c.pal.ink;
    c.rel('rotate', 'headline', undefined, { value: ang });
    c.rel('center', 'headline', 'figure');
    const sub = c.x.brief.content.subhead;
    if (cross && sub) {
      const st = c.k.text(c.x, 'subhead', sub, around(c.W * px, c.H * py + thick * 0.2, span * 0.9, c.u * 6), {
        size: Math.max(c.k.minText(c.x), c.u * 3),
        align: 'center',
        valign: 'middle',
        rotation: ang + (ang < 0 ? 90 : -90) > 90 ? ang - 90 : ang + 90,
        autoHeight: true,
      });
      c.out.push(st);
      c.rel('intersect', 'subhead', 'headline');
    }
    const corner: Anchor = at === 'br' ? 'tl' : 'br';
    c.out.push(...info(c, placeAt(S, corner, S.w * 0.5, S.h * 0.22), { align: corner === 'br' ? 'right' : 'left', fromFoot: corner === 'br', sub: !cross }));
  },

  'experimental-line-breaking': (c) => {
    const width = c.n('width');
    const align = c.s('align') as 'left' | 'center' | 'right';
    const at = c.s('at') as Anchor;
    const S = c.safe;
    // a narrow column, the words broken one to a line by its width, set large
    const w = Math.max(c.u * 18, S.w * width * (c.land ? 0.8 : 1));
    const box = placeAt(S, at, w, S.h * (c.land ? 0.96 : 0.74));
    const t = headline(c, box, { align, lineHeight: 0.86 }, { valign: at[0] === 'b' ? 'bottom' : at[0] === 'm' ? 'middle' : 'top' });
    // one word turned to the accent, in italic where the face has it: the break made visible
    const words = [...t.text.matchAll(/\S+/g)];
    if (words.length > 1) {
      const pickW = words[Math.floor(c.r('emph') * words.length)];
      t.runs = [{ start: pickW.index!, end: pickW.index! + pickW[0].length, color: c.pal.accent, italic: true }];
    }
    c.out.push(t);
    c.rel('anchor', 'headline', 'safe', { at, priority: 'hard' });
    c.rel('negative-space', 'artboard', undefined, { at: (at[1] === 'r' ? 'ml' : 'mr') as Anchor, value: 0.3, priority: 'aesthetic' });
    const other = { x: at[1] === 'r' || (at[1] === 'c' && align === 'right') ? S.x : S.x + w + c.u * 4, y: S.y, w: S.w - w - c.u * 4, h: S.h };
    c.out.push(...info(c, at[0] === 'b' ? { ...other, h: S.h * 0.4 } : { ...other, y: S.y + S.h * 0.55, h: S.h * 0.45 }, { align: at[1] === 'r' ? 'left' : 'right', fromFoot: at[0] !== 'b' }));
    c.out.push(line(c, other.x, at[0] === 'b' ? S.y + S.h * 0.45 : S.y + S.h * 0.5, other.x + other.w * 0.4, at[0] === 'b' ? S.y + S.h * 0.45 : S.y + S.h * 0.5, c.pal.accent, Math.max(1, c.u * 0.5), { name: 'Rule' }));
  },

  'typographic-collage': (c) => {
    const nFaces = Math.round(c.n('faces'));
    const plates = c.s('plates') === 'on';
    const tilt = c.n('tilt');
    const S = c.safe;
    const alt = (c.x.style?.faces.alt ?? [])
      .concat(['Alfa Slab One', 'Abril Fatface', 'Bebas Neue', 'Space Mono', 'Playfair Display'])
      .filter((f, i, all) => all.indexOf(f) === i)
      .slice(0, nFaces);
    const hb = c.land ? { x: S.x, y: S.y + S.h * 0.08, w: S.w * 0.66, h: S.h * 0.7 } : { x: S.x, y: S.y + S.h * 0.18, w: S.w, h: S.h * 0.46 };
    if (plates)
      for (let i = 0; i < 3; i++) {
        const b = { x: hb.x + hb.w * (0.04 + i * 0.28), y: hb.y + hb.h * (0.1 + (i % 2) * 0.32), w: hb.w * 0.42, h: hb.h * 0.42 };
        c.out.push(
          prim(c, 'irregular-polygon', { seed: (c.plan.seed % 900) + i * 11, sides: 5, irregular: 18 }, b, i === 1 ? c.paint(0) : c.pal.ground === '#ffffff' ? '#f2efe8' : c.paint(2), {
            name: 'Paper',
            rotation: (i - 1) * tilt,
            effects: c.k.paletteFx(c.x, [{ kind: 'drop-shadow', params: { dx: 0, dy: 6, blur: 10, opacity: 22 } } as never]),
          }),
        );
      }
    const t = headline(c, hb, { align: 'left', rotation: -tilt / 3 }, { valign: 'middle' });
    mixedFaces(t, alt, [c.pal.accent, c.pal.ink, c.pal.accent2]);
    c.out.push(t);
    c.rel('group', 'headline', 'figure');
    c.rel('overlap', 'headline', 'figure');
    c.out.push(...info(c, c.land ? { x: S.x + S.w * 0.7, y: S.y, w: S.w * 0.3, h: S.h } : { x: S.x, y: S.y + S.h * 0.7, w: S.w * 0.7, h: S.h * 0.3 }, { align: 'left', fromFoot: !c.land }));
  },

  'repeated-typography': (c) => {
    const count = Math.round(c.n('count'));
    const dir = c.s('dir');
    const fade = c.n('fade');
    const S = c.safe;
    const hb = dir === 'down' ? { x: S.x, y: S.y, w: S.w, h: S.h * 0.22 } : dir === 'across' ? { x: S.x, y: S.y + S.h * 0.36, w: S.w * 0.7, h: S.h * 0.24 } : { x: S.x, y: S.y + S.h * 0.02, w: S.w * 0.86, h: S.h * 0.22 };
    const t = headline(c, hb, { align: 'left' });
    const step = dir === 'down' ? { dx: 0, dy: Math.round(t.h * 0.82) } : dir === 'across' ? { dx: Math.round(c.u * 3), dy: Math.round(c.u * 2) } : { dx: Math.round(c.u * 2.2), dy: Math.round(t.h * 0.72) };
    // the copies run ahead of the original (down or across), fading; the original stays first and full
    t.repeat = { count, dx: step.dx, dy: step.dy, fade, outline: c.r('outline') > 0.5 } as never;
    c.out.push(t);
    c.rel('repeat', 'headline', undefined, { value: count });
    c.rel('hierarchy', 'headline', 'details', { priority: 'hard' });
    const reach = t.y + t.h + step.dy * count;
    const db = dir === 'across' ? { x: S.x, y: Math.min(S.y + S.h * 0.75, reach + c.u * 3), w: S.w * 0.7, h: S.h * 0.25 } : { x: S.x + S.w * 0.5, y: S.y + S.h * 0.66, w: S.w * 0.5, h: S.h * 0.34 };
    c.out.push(...info(c, db, { align: dir === 'across' ? 'left' : 'right', fromFoot: dir !== 'across' }));
  },

  'minimal-typographic-hierarchy': (c) => {
    const corner = c.s('corner') as Anchor;
    const size = c.n('size');
    const mark = c.s('mark');
    const S = c.safe;
    const box = placeAt(S, corner, S.w * size * (c.land ? 0.7 : 1), S.h * 0.3);
    const t = headline(
      c,
      box,
      { align: corner[1] === 'r' ? 'right' : 'left', size: Math.max(c.k.minText(c.x) * 1.6, Math.min(c.u * 7, box.w / Math.max(6, c.x.brief.content.headline.length * 0.42))) },
      { valign: corner[0] === 'b' ? 'bottom' : 'top' },
    );
    c.out.push(t);
    c.rel('anchor', 'headline', 'safe', { at: corner, priority: 'hard' });
    c.rel('negative-space', 'artboard', undefined, { at: corner === 'tl' ? 'br' : corner === 'tr' ? 'bl' : corner === 'bl' ? 'tr' : 'tl', value: 0.5, priority: 'soft' });
    // the details on the opposite edge, small and exact
    const dCorner: Anchor = `${corner[0] === 't' ? 'b' : 't'}${corner[1]}` as Anchor;
    c.out.push(...info(c, placeAt(S, dCorner, S.w * 0.5, S.h * 0.24), { align: corner[1] === 'r' ? 'right' : 'left', scale: 0.85, fromFoot: dCorner[0] === 'b' }));
    if (mark === 'dot') c.out.push(figure(c, 0, around(c.W * (corner[1] === 'l' ? 0.7 : 0.3), c.H * (corner[0] === 't' ? 0.62 : 0.38), c.u * 5), c.paint(0)));
    else if (mark === 'rule') c.out.push(line(c, t.x, corner[0] === 't' ? t.y + t.h + c.u * 2 : t.y - c.u * 2, t.x + c.u * 12, corner[0] === 't' ? t.y + t.h + c.u * 2 : t.y - c.u * 2, c.pal.accent, Math.max(1, c.u * 0.5), { name: 'Rule' }));
  },

  'dense-editorial-typography': (c) => {
    const cols = Math.round(c.n('cols')) + (c.land ? 1 : 0);
    const heavy = c.s('rules') === 'heavy';
    const mast = c.s('head') === 'masthead';
    const S = c.safe;
    const gap = c.u * 2;
    const rw = heavy ? Math.max(2, c.u * 0.8) : Math.max(0.6, c.u * 0.15);
    let top: number;
    if (mast) {
      const t = headline(c, { x: S.x, y: S.y, w: S.w, h: S.h * 0.3 * c.ts }, { align: 'left' });
      c.out.push(t);
      top = t.y + t.h + c.u * 2;
      c.out.push(line(c, S.x, top, S.x + S.w, top, c.pal.ink, rw, { name: 'Rule' }));
      top += c.u * 2.5;
    } else top = S.y;
    const area = { x: S.x, y: top, w: S.w, h: S.y + S.h - top };
    const cw = (area.w - gap * (cols - 1)) / cols;
    for (let i = 1; i < cols; i++) c.out.push(line(c, area.x + i * (cw + gap) - gap / 2, area.y, area.x + i * (cw + gap) - gap / 2, area.y + area.h, c.pal.ink, Math.max(0.5, rw * 0.5), { name: 'Column rule' }));
    const col = (i: number, y = area.y, h = area.h): Box => ({ x: area.x + i * (cw + gap), y, w: cw, h });
    if (!mast) {
      const t = headline(c, { x: area.x, y: area.y, w: cw * Math.min(2, cols - 1) + gap * (Math.min(2, cols - 1) - 1), h: area.h * 0.5 }, { align: 'left' });
      c.out.push(t);
      c.out.push(line(c, t.x, t.y + t.h + c.u * 1.5, t.x + t.w, t.y + t.h + c.u * 1.5, c.pal.ink, rw, { name: 'Rule' }));
      c.out.push(...info(c, { x: t.x, y: t.y + t.h + c.u * 3.5, w: t.w, h: area.y + area.h - (t.y + t.h + c.u * 3.5) }, { align: 'left', meta: false, cta: false, brand: false }));
      c.out.push(...info(c, col(cols - 1), { align: 'left', sub: false, scale: 0.85 }));
    } else {
      c.out.push(...info(c, col(0), { align: 'left', meta: false, cta: false, brand: false }));
      c.out.push(...info(c, col(cols - 1), { align: 'left', sub: false, scale: 0.85 }));
      if (cols > 2) c.out.push(figure(c, 0, { x: col(1).x, y: area.y, w: cw, h: cw }, c.paint(0)));
    }
    c.rel('align', 'details', 'frame', { at: 'tl', priority: 'hard' });
    c.rel('distribute', 'details', undefined, { value: cols });
    c.rel('spacing', 'details', undefined, { value: gap / c.W });
  },
};

void splitH;
void splitV;
void inkOn;
