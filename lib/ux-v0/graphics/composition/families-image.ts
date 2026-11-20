// lib/ux-v0/graphics/composition/families-image.ts — the image-driven families.
//
// The designer's pictures organise the frame: full bleed, split, cut to a shape of the language, in a letterbox, framed,
// collaged, sliced. A picture is only ever referenced (its asset untouched; a crop is a window onto it, a mask a cut of
// it) and kept centred on its subject (cover fit). The planner offers these families only when there is a picture; if
// one is asked for without a picture, a figure of the style stands where the picture would, and the plan says so.

import { contrastRatio } from '../../../ux/audit';
import type { Anchor } from './schema';
import { around, cells, figure, headline, info, inkOn, line, photo, placeAt, rect, splitH, splitV, type Box, type CC } from './kit';
import type { Node } from '../doc';

type Family = (c: CC) => void;

/** A picture in a box, or (with none given) a figure of the style in its place, said in the notes. */
function pic(c: CC, i: number, box: Box, o: Parameters<typeof photo>[3] = {}): Node {
  const p = photo(c, i, box, o);
  if (p) return p;
  if (!c.notes.includes('no picture')) c.notes.push('no picture');
  return figure(c, i, box, c.paint(i));
}

export const IMAGERY: Record<string, Family> = {
  'full-bleed-photography': (c) => {
    const where = c.s('text');
    const overlay = c.s('overlay');
    const S = c.safe;
    c.out.push(pic(c, 0, { x: 0, y: 0, w: c.W, h: c.H }, { s: { role: 'background', name: 'Picture' } }));
    c.rel('contain', 'image', 'artboard', { priority: 'hard' });
    const anchor: Anchor = where === 'band' ? 'bl' : (where as Anchor);
    const box = where === 'band' ? { x: S.x, y: S.y + S.h * (c.land ? 0.5 : 0.62), w: S.w, h: S.h * (c.land ? 0.5 : 0.38) } : placeAt(S, anchor, S.w * (c.land ? 0.5 : 0.84), S.h * (c.land ? 0.62 : 0.4));
    if (where === 'band' || overlay === 'gradient') {
      const top = where === 'band' ? box.y - c.u * 4 : anchor[0] === 't' ? 0 : box.y - c.u * 10;
      const h = where === 'band' ? c.H - top : anchor[0] === 't' ? box.y + box.h + c.u * 10 : c.H - top;
      c.out.push(
        rect(c, { x: 0, y: top, w: c.W, h }, where === 'band' ? c.pal.ground : null, {
          name: 'Ground for the words',
          ...(where === 'band'
            ? { opacity: 0.94 }
            : {
                fill: {
                  type: 'linear',
                  angle: anchor[0] === 't' ? 0 : 180,
                  stops: [
                    { at: 0, color: `${c.pal.ground}00` },
                    { at: 0.55, color: `${c.pal.ground}d9` },
                    { at: 1, color: c.pal.ground },
                  ],
                },
              }),
        }),
      );
    }
    const [hb, db] = splitV(box, 0.62, c.u * 2);
    const align = anchor[1] === 'r' ? 'right' : anchor[1] === 'c' ? 'center' : 'left';
    const t = headline(c, hb, { align }, { valign: 'bottom' });
    const details = info(c, db, { align });
    if (overlay === 'plate' && where !== 'band') {
      const all = [t, ...details];
      const y0 = Math.min(...all.map((n) => n.y)) - c.u * 2.5;
      const y1 = Math.max(...all.map((n) => n.y + n.h)) + c.u * 2.5;
      c.out.push(rect(c, { x: box.x - c.u * 2.5, y: y0, w: box.w + c.u * 5, h: y1 - y0 }, c.pal.ground, { name: 'Plate', opacity: 0.94 }));
    }
    c.out.push(t, ...details);
    c.rel('contrast', 'headline', 'image', { value: 4.5, priority: 'hard' });
    c.rel('anchor', 'headline', 'safe', { at: anchor });
  },

  'split-image': (c) => {
    const side = c.land && (c.s('side') === 'top' || c.s('side') === 'bottom') ? 'left' : c.s('side');
    const ratio = c.n('ratio');
    const vertical = side === 'left' || side === 'right';
    const frame = { x: 0, y: 0, w: c.W, h: c.H };
    const [a, b] = vertical ? splitH(frame, side === 'left' ? ratio : 1 - ratio) : splitV(frame, side === 'top' ? ratio : 1 - ratio);
    const img = side === 'left' || side === 'top' ? a : b;
    const rest = side === 'left' || side === 'top' ? b : a;
    c.out.push(pic(c, 0, img, { s: { name: 'Picture' } }));
    const S = c.safe;
    const room = { x: Math.max(rest.x + c.u * 4, S.x), y: Math.max(rest.y + c.u * 4, S.y), w: 0, h: 0 };
    room.w = Math.min(rest.x + rest.w - c.u * 4, S.x + S.w) - room.x;
    room.h = Math.min(rest.y + rest.h - c.u * 4, S.y + S.h) - room.y;
    const [hb, db] = splitV(room, 0.58, c.u * 3);
    c.out.push(headline(c, hb, { align: 'left' }, { valign: vertical ? 'bottom' : 'top' }), ...info(c, db, { align: 'left' }));
    c.rel('align', 'image', 'frame', { at: side === 'left' ? 'ml' : side === 'right' ? 'mr' : side === 'top' ? 'tc' : 'bc' });
    c.rel('avoid', 'image', 'headline', { priority: 'hard' });
  },

  'image-collage': (c) => {
    const tiles = Math.round(c.n('tiles'));
    const tilt = c.n('tilt');
    const head = c.s('head');
    const S = c.safe;
    const area = c.land ? { x: S.x, y: S.y, w: S.w * 0.62, h: S.h } : { x: S.x, y: S.y, w: S.w, h: S.h * 0.66 };
    for (let i = 0; i < tiles; i++) {
      const w = area.w * (0.42 + c.r(`w${i}`) * 0.22);
      const h = w * (0.7 + c.r(`h${i}`) * 0.5);
      const x = area.x + (area.w - w) * c.r(`x${i}`);
      const y = area.y + (area.h - h) * ((i + c.r(`y${i}`) * 0.6) / Math.max(1, tiles - 0.4));
      const cx = c.r(`cx${i}`) * 0.4;
      const cy = c.r(`cy${i}`) * 0.4;
      c.out.push(
        pic(
          c,
          i,
          { x, y: Math.min(y, area.y + area.h - h), w, h },
          { crop: { x: cx, y: cy, w: 0.6, h: 0.6 }, s: { name: `Cut ${i + 1}`, rotation: (c.r(`r${i}`) - 0.5) * 2 * tilt, effects: c.k.paletteFx(c.x, [{ kind: 'drop-shadow', params: { dx: 0, dy: 6, blur: 12, opacity: 24 } } as never]) } },
        ),
      );
    }
    c.rel('overlap', 'image', 'image');
    c.rel('crop', 'image', undefined, { value: 0.6 });
    if (head === 'band' || c.land) {
      const tb = c.land ? { x: S.x + S.w * 0.66, y: S.y, w: S.w * 0.34, h: S.h } : { x: S.x, y: S.y + S.h * 0.7, w: S.w, h: S.h * 0.3 };
      const [hb, db] = splitV(tb, 0.6, c.u * 2);
      c.out.push(headline(c, hb, { align: 'left' }), ...info(c, db, { align: 'left' }));
    } else {
      const t = headline(c, { x: S.x, y: S.y + S.h * 0.34, w: S.w, h: S.h * 0.3 }, { align: 'left', rotation: -tilt / 2 }, { valign: 'middle' });
      c.out.push(c.k.plateFor(c.x, t, c.u * 1.6), t);
      c.out.push(...info(c, { x: S.x, y: S.y + S.h * 0.72, w: S.w * 0.8, h: S.h * 0.28 }, { align: 'left', fromFoot: true }));
      c.rel('overlap', 'headline', 'image');
    }
  },

  'masked-image': (c) => {
    const mask = c.s('mask');
    const at = c.s('at') as Anchor;
    const size = c.n('size');
    const S = c.safe;
    const d = Math.min(c.land ? S.h : S.w, c.land ? S.w * 0.55 : S.h * 0.6) * size;
    const box = c.land ? placeAt(S, at[1] === 'r' ? 'mr' : 'ml', d, d) : placeAt(S, at === 'ml' ? 'tl' : at === 'mc' ? 'tc' : at, d, d * (mask === 'arch' ? 1.2 : 1));
    c.out.push(pic(c, 0, box, { mask: mask === 'circle' ? 'ellipse' : mask === 'arch' ? 'arch' : mask === 'blob' ? 'blob' : 'hexagon', s: { name: 'Cut picture' } }));
    c.rel('mask', 'image', 'figure', { priority: 'aesthetic' });
    const rest = c.land
      ? at[1] === 'r'
        ? { x: S.x, y: S.y, w: S.w - d - c.u * 4, h: S.h }
        : { x: box.x + d + c.u * 4, y: S.y, w: S.x + S.w - box.x - d - c.u * 4, h: S.h }
      : { x: S.x, y: box.y + box.h + c.u * 4, w: S.w, h: S.y + S.h - (box.y + box.h + c.u * 4) };
    const [hb, db] = splitV(rest, 0.6, c.u * 2);
    const align = !c.land && at === 'tc' ? 'center' : 'left';
    c.out.push(headline(c, hb, { align }), ...info(c, db, { align }));
    c.rel('avoid', 'image', 'headline', { priority: 'hard' });
  },

  'cinematic-focal': (c) => {
    const band = c.s('band');
    const ratio = c.n('ratio');
    const S = c.safe;
    const bh = Math.min(c.W / ratio, c.H * 0.6);
    const by = band === 'top' ? S.y : band === 'bottom' ? S.y + S.h - bh - c.H * 0.18 : (c.H - bh) / 2 - c.H * 0.06;
    c.out.push(pic(c, 0, { x: 0, y: by, w: c.W, h: bh }, { s: { name: 'Picture' } }));
    c.rel('contain', 'image', 'frame', { priority: 'hard' });
    const above = band !== 'top';
    const hb = above ? { x: S.x, y: S.y, w: S.w, h: by - S.y - c.u * 3 } : { x: S.x, y: by + bh + c.u * 4, w: S.w, h: S.h * 0.26 };
    const t = headline(c, { ...hb, h: Math.max(c.u * 10, hb.h) }, { align: 'center' }, { valign: above ? 'bottom' : 'top' });
    c.out.push(t);
    const credits = above ? { x: S.x + S.w * 0.1, y: by + bh + c.u * 4, w: S.w * 0.8, h: S.y + S.h - (by + bh + c.u * 4) } : { x: S.x + S.w * 0.1, y: t.y + t.h + c.u * 3, w: S.w * 0.8, h: S.y + S.h - (t.y + t.h + c.u * 3) };
    c.out.push(...info(c, credits, { align: 'center', scale: 0.85, subStyle: { case: 'upper', tracking: 80 } }));
    c.rel('center', 'headline', 'artboard');
  },

  'multi-image-editorial': (c) => {
    const pat = c.s('pattern');
    const caps = c.s('captions') === 'on';
    const S = c.safe;
    const [imgArea, textArea] = c.land ? splitH(S, 0.62, c.u * 3) : splitV(S, 0.6, c.u * 3);
    const boxes: Box[] =
      pat === 'row'
        ? cells(imgArea, 1, 3, c.u * 1.5)
        : pat === 'grid'
          ? cells(imgArea, 2, 2, c.u * 1.5)
          : [
              { ...imgArea, w: imgArea.w * 0.62 },
              { x: imgArea.x + imgArea.w * 0.65, y: imgArea.y, w: imgArea.w * 0.35, h: imgArea.h * 0.48 },
              { x: imgArea.x + imgArea.w * 0.65, y: imgArea.y + imgArea.h * 0.52, w: imgArea.w * 0.35, h: imgArea.h * 0.48 },
            ];
    boxes.forEach((b, i) => c.out.push(pic(c, i, b, { crop: c.images.length > i ? undefined : { x: (i * 0.23) % 0.5, y: (i * 0.17) % 0.4, w: 0.55, h: 0.6 }, s: { name: `Picture ${i + 1}` } })));
    c.rel('distribute', 'image', undefined, { value: boxes.length });
    c.rel('align', 'image', 'frame', { at: 'tl' });
    const [hb, db] = splitV(textArea, 0.55, c.u * 2);
    c.out.push(headline(c, hb, { align: 'left' }), ...info(c, db, { align: 'left', scale: 0.9 }));
    if (caps) c.out.push(line(c, imgArea.x, imgArea.y + imgArea.h + c.u * 1.5, imgArea.x + imgArea.w, imgArea.y + imgArea.h + c.u * 1.5, c.pal.ink, Math.max(0.5, c.u * 0.15), { name: 'Rule' }));
  },

  'image-with-negative-space': (c) => {
    const corner = c.s('corner') as Anchor;
    const size = c.n('size');
    const S = c.safe;
    const d = Math.min(S.w, S.h) * size;
    const box = placeAt(S, corner, d, d * 1.25);
    c.out.push(pic(c, 0, box, { s: { name: 'Picture' } }));
    c.rel('anchor', 'image', 'safe', { at: corner });
    c.rel('negative-space', 'artboard', undefined, { at: corner === 'mc' ? 'tl' : (`${corner[0] === 't' ? 'b' : 't'}${corner[1] === 'l' ? 'r' : 'l'}` as Anchor), value: 0.35, priority: 'soft' });
    // the words small and exact, on the far side of the quiet field
    const far: Anchor = corner === 'mc' ? 'bl' : (`${corner[0] === 't' ? 'b' : 't'}${corner[1] === 'l' ? 'r' : 'l'}` as Anchor);
    const tb = placeAt(S, far, S.w * (c.land ? 0.42 : 0.6), S.h * 0.32);
    const [hb, db] = splitV(tb, 0.6, c.u * 2);
    const align = far[1] === 'r' ? 'right' : 'left';
    c.out.push(headline(c, hb, { align, size: Math.max(c.k.minText(c.x) * 2.2, c.u * 7.5) * c.ts }, { valign: far[0] === 'b' ? 'bottom' : 'top' }), ...info(c, db, { align, scale: 0.9 }));
  },

  'image-as-background': (c) => {
    const tint = c.n('tint');
    const where = c.s('text') as Anchor;
    const S = c.safe;
    c.out.push(pic(c, 0, { x: 0, y: 0, w: c.W, h: c.H }, { s: { role: 'background', name: 'Picture' } }));
    c.out.push(rect(c, { x: 0, y: 0, w: c.W, h: c.H }, c.pal.ground, { name: 'Tone', opacity: tint, blend: contrastRatio(c.pal.ground, '#000000') > 10 ? 'screen' : 'multiply' }));
    c.rel('overlap', 'headline', 'image');
    const box = placeAt(S, where, S.w * (where === 'mc' ? 0.9 : 0.8), S.h * 0.5);
    const [hb, db] = splitV(box, 0.66, c.u * 2);
    const align = where === 'mc' ? 'center' : 'left';
    const t = headline(c, { ...hb, h: hb.h * c.ts }, { align }, { valign: 'bottom' });
    const details = info(c, db, { align });
    const all = [t, ...details];
    const y0 = Math.min(...all.map((n) => n.y)) - c.u * 2;
    const y1 = Math.max(...all.map((n) => n.y + n.h)) + c.u * 2;
    c.out.push(rect(c, { x: box.x - c.u * 2, y: y0, w: box.w + c.u * 4, h: y1 - y0 }, c.pal.ground, { name: 'Ground for the words', opacity: 0.86 }), t, ...details);
    c.rel('contrast', 'headline', 'image', { value: 3, priority: 'hard' });
  },

  'framed-imagery': (c) => {
    const frame = c.s('frame');
    const caption = c.s('caption');
    const S = c.safe;
    const beside = caption === 'beside' || c.land;
    const [fr, tr] = beside ? splitH(S, 0.6, c.u * 4) : splitV(S, 0.64, c.u * 4);
    const mat = frame === 'mat' ? c.u * 4 : frame === 'thick' ? c.u * 2.5 : c.u * 1.5;
    c.out.push(rect(c, fr, frame === 'mat' ? (c.pal.ground === '#ffffff' ? '#f4f1ea' : c.pal.ground) : c.pal.ink, { name: 'Frame', stroke: { color: c.pal.ink, width: frame === 'double' ? Math.max(1, c.u * 0.3) : Math.max(1, c.u * 0.6) } }));
    if (frame === 'double') c.out.push(rect(c, { x: fr.x + c.u, y: fr.y + c.u, w: fr.w - c.u * 2, h: fr.h - c.u * 2 }, null, { name: 'Inner frame', stroke: { color: c.pal.ink, width: Math.max(1, c.u * 0.3) } }));
    c.out.push(pic(c, 0, { x: fr.x + mat, y: fr.y + mat, w: fr.w - mat * 2, h: fr.h - mat * 2 }, { s: { name: 'Picture' } }));
    c.rel('contain', 'image', 'frame', { priority: 'hard' });
    const [hb, db] = splitV(tr, 0.55, c.u * 2);
    const align = beside ? 'left' : 'center';
    c.out.push(headline(c, hb, { align }, { valign: beside ? 'middle' : 'top' }), ...info(c, db, { align, scale: 0.9 }));
  },

  'fragmented-imagery': (c) => {
    const n = Math.round(c.n('strips'));
    const dir = c.s('dir');
    const off = c.n('offset');
    const S = c.safe;
    const area = c.land ? { x: 0, y: 0, w: c.W * 0.62, h: c.H } : { x: 0, y: 0, w: c.W, h: c.H * 0.64 };
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const slide = (c.r(`s${i}`) - 0.5) * 2 * off;
      const b = dir === 'horizontal' ? { x: area.x + slide * area.w, y: area.y + f * area.h, w: area.w, h: area.h / n } : { x: area.x + f * area.w, y: area.y + slide * area.h, w: area.w / n, h: area.h };
      const crop = dir === 'horizontal' ? { x: 0, y: f, w: 1, h: 1 / n } : { x: f, y: 0, w: 1 / n, h: 1 };
      c.out.push(pic(c, 0, b, { crop, s: { name: `Strip ${i + 1}`, ...(dir === 'diagonal' ? { skewX: -12 } : {}) } }));
    }
    c.rel('crop', 'image', undefined, { value: n });
    c.rel('offset', 'image', undefined, { value: off });
    const tb = c.land ? { x: c.W * 0.66, y: S.y, w: S.x + S.w - c.W * 0.66, h: S.h } : { x: S.x, y: c.H * 0.68, w: S.w, h: S.y + S.h - c.H * 0.68 };
    const [hb, db] = c.land ? splitV(tb, 0.6, c.u * 2) : splitH(tb, 0.6, c.u * 3);
    c.out.push(headline(c, hb, { align: 'left' }), ...info(c, db, { align: 'left', scale: 0.9 }));
    c.rel('avoid', 'image', 'headline', { priority: 'hard' });
  },
};

void around;
void inkOn;
