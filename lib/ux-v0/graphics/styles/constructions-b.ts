// lib/ux-v0/graphics/styles/constructions-b.ts — the other twenty-one style constructions (see constructions-a.ts and
// schema.ts CONSTRUCTIONS). The same rules hold: the brief's words only, the headline one text node, the designer's
// picture placed and cut where the style places pictures, and words kept on solid ground or plates.

import { contrastRatio } from '../../../ux/audit';
import type { Ctx, Kit } from '../compose';
import { newId, type Node, type TextNode } from '../doc';
import type { Gradient, Paint } from '../paint';
import { HOLO } from './apply';
import {
  a3,
  alongArc,
  ARCH,
  between,
  block,
  border,
  details,
  ellipse,
  fx,
  groundOf,
  head,
  land,
  medallion,
  mid,
  mix,
  mixedFaces,
  motifs,
  on,
  onLarge,
  P,
  panelAround,
  pathNode,
  picture,
  rand,
  readable,
  small,
  textHeight,
  variant,
  type Box,
  type Layout,
} from './constructions-kit';

export function layoutsB(k: Kit): Record<string, Layout> {
  const stroke = (x: Ctx, color: string, w = x.u * 0.4) => ({
    stroke: { color, width: Math.max(1, w), join: 'round', cap: 'round' },
  });
  const full = (x: Ctx): Box => ({ x: 0, y: 0, w: x.W, h: x.H });
  const group = (name: string, box: Box, children: Node[], s: Record<string, unknown> = {}): Node =>
    ({
      id: newId('g'),
      type: 'group',
      name,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      rotation: 0,
      opacity: 1,
      children,
      ...s,
    }) as Node;
  /** No words under it: a small ornament is placed only where it covers no text. */
  const clearOf = (out: Node[], b: Box, pad: number) => !out.some((n) => n.type === 'text' && b.x < n.x + n.w + pad && b.x + b.w > n.x - pad && b.y < n.y + n.h + pad && b.y + b.h > n.y - pad);
  const sub = (x: Ctx, box: Box, s: Partial<TextNode> = {}): TextNode | null =>
    x.brief.content.subhead
      ? k.text(x, 'subhead', x.brief.content.subhead, box, {
          size: mid(k, x),
          autoHeight: true,
          ...s,
        })
      : null;
  const linear = (angle: number, ...colors: string[]): Gradient => ({
    type: 'linear',
    angle,
    stops: colors.map((color, i) => ({
      at: colors.length > 1 ? i / (colors.length - 1) : 0,
      color,
    })),
  });
  const radial = (cx: number, cy: number, r: number, ...colors: string[]): Gradient => ({
    type: 'radial',
    angle: 0,
    cx,
    cy,
    r,
    stops: colors.map((color, i) => ({
      at: colors.length > 1 ? i / (colors.length - 1) : 0,
      color,
    })),
  });

  return {
    'window-ui': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const geo = v === 'geocities';
      const vap = v === 'vapor';
      const lw = Math.max(1, x.u * 0.28);
      if (vap) {
        const g = x.style?.vocab.gradient;
        if (g) out.push(groundOf(k, x, g));
        const d = Math.min(x.W, x.H) * 0.46;
        out.push(ellipse(x, { x: x.W * 0.62 - d / 2, y: x.H * 0.05, w: d, h: d }, linear(180, a3(x), x.accent), { name: 'Sun' }));
        out.push(k.patternNode(x, k.pdef('grid', { scale: 6, weight: 0.12, major: 0, majorWeight: 0.12 }, ['accent2']), { x: 0, y: x.H * 0.64, w: x.W, h: x.H * 0.36 }, { name: 'Grid floor', opacity: 0.7 }));
      } else if (geo) out.push(k.patternNode(x, k.pdef('scatter', { scale: 2.6, size: 0.22, shape: 0, clump: 30 }, ['ink']), full(x), { name: 'Starfield', opacity: 0.75 }));
      else out.push(k.patternNode(x, k.pdef('dots', { scale: 1.1, size: 16, stagger: 0, shape: 0 }, ['ink']), full(x), { name: 'Desktop', opacity: 0.16 }));
      const body = geo ? mix(x.ground, '#ffffff', 0.92) : '#ffffff';
      const bar = (i: number): Paint => (geo ? linear(90, x.accent, x.accent2) : vap ? (i % 2 ? x.accent2 : x.accent) : x.accent);
      const win = (b: Box, i: number): Box => {
        const barH = Math.max(x.u * 4.4, k.minText(x) * 1.5);
        const shadow = vap ? fx(k, x, 'drop-shadow', { dx: 0, dy: 12, blur: 26, opacity: 22 }) : fx(k, x, 'drop-shadow', { dx: 7, dy: 7, blur: 0, spread: 0, opacity: 100 }, { color: geo ? '#000000' : x.ink });
        out.push(
          block(k, x, b, body, {
            name: 'Window',
            stroke: { color: x.ink, width: lw, join: 'miter' },
            effects: shadow,
            ...(vap ? { opacity: 0.94 } : {}),
          }),
        );
        out.push(
          block(k, x, { x: b.x, y: b.y, w: b.w, h: barH }, bar(i), {
            name: 'Title bar',
            stroke: { color: x.ink, width: lw, join: 'miter' },
          }),
        );
        if (v === 'web')
          out.push(
            k.patternNode(
              x,
              k.pdef('lines', { scale: 0.5, weight: 0.1 }, ['ground']),
              {
                x: b.x + barH * 0.3,
                y: b.y + barH * 0.25,
                w: Math.max(x.u * 4, b.w - barH * 3.4),
                h: barH * 0.5,
              },
              { name: 'Title stripes', opacity: 0.55 },
            ),
          );
        const bs = barH * 0.56;
        for (let j = 0; j < 3; j++)
          out.push(
            block(
              k,
              x,
              {
                x: b.x + b.w - (j + 1) * (bs + barH * 0.2) - barH * 0.05,
                y: b.y + (barH - bs) / 2,
                w: bs,
                h: bs,
              },
              body,
              {
                name: 'Window button',
                stroke: { color: x.ink, width: lw * 0.8, join: 'miter' },
              },
            ),
          );
        return {
          x: b.x + x.u * 2.4,
          y: b.y + barH + x.u * 2.2,
          w: b.w - x.u * 4.8,
          h: b.h - barH - x.u * 4.4,
        };
      };
      const main = L ? { x: x.m, y: x.H * 0.1, w: x.W * 0.52, h: x.H * 0.5 } : { x: x.m, y: x.H * 0.08, w: x.W * 0.8, h: x.H * 0.4 };
      const pic = L ? { x: x.W * 0.6, y: x.H * 0.07, w: x.W * 0.34, h: x.H * 0.5 } : { x: x.W * 0.36, y: x.H * 0.42, w: x.W * 0.58, h: x.H * 0.29 };
      const info = L ? { x: x.W * 0.4, y: x.H * 0.6, w: x.W * 0.52, h: x.H * 0.33 } : { x: x.m * 1.4, y: x.H * 0.66, w: x.W * 0.64, h: x.H * 0.28 };
      const mi = win(main, 0);
      const stop = (L ? info.y : pic.y) - x.u * 2;
      out.push(
        head(
          k,
          x,
          {
            x: mi.x,
            y: mi.y,
            w: mi.w,
            h: Math.max(x.u * 8, Math.min(mi.h, stop - mi.y)),
          },
          { color: on(x, body) },
        ),
      );
      const pi = win(pic, 1);
      const img = picture(k, x, pi, null, geo ? { effects: fx(k, x, 'pixelate', { size: 8 }) } : {});
      if (img) out.push(img);
      else if (v === 'web')
        out.push(
          k.patternNode(x, k.pdef('checker', { scale: 1.6 }, ['muted']), pi, {
            name: 'Empty picture',
            opacity: 0.22,
          }),
        );
      else {
        const d = Math.min(pi.w, pi.h) * 0.8;
        const c = {
          x: pi.x + pi.w / 2 - d / 2,
          y: pi.y + pi.h / 2 - d / 2,
          w: d,
          h: d,
        };
        if (geo) {
          out.push(
            P(k, x, 'concentric', { rings: 7 }, c, x.accent2, {
              name: 'Rings',
            }),
          );
          out.push(
            P(k, x, 'star', { points: 5, inner: 45 }, { x: c.x + d * 0.2, y: c.y + d * 0.2, w: d * 0.6, h: d * 0.6 }, a3(x), {
              name: 'Star',
              effects: fx(k, x, 'glow', { size: 10, opacity: 70 }),
            }),
          );
        } else
          out.push(
            ellipse(x, c, radial(0.35, 0.3, 0.75, '#ffffff', x.accent2), {
              name: 'Sphere',
            }),
          );
      }
      const ii = win(info, 2);
      out.push(
        ...details(k, x, ii, {
          color: on(x, body),
          scale: 0.9,
          metaStyle: { font: x.dir.tokens.fonts.body },
        }),
      );
      if (v === 'web') {
        // the pointer, over the desktop between the windows
        const pb = {
          x: L ? info.x - x.u * 9 : pic.x - x.u * 8,
          y: L ? info.y + x.u * 4 : pic.y + pic.h + x.u * 1,
          w: x.u * 6,
          h: x.u * 9,
        };
        if (clearOf(out, pb, x.u))
          out.push(
            P(k, x, 'arrow', { shaft: 30, head: 52, double: 0 }, pb, '#ffffff', {
              name: 'Pointer',
              rotation: -120,
              stroke: { color: '#000000', width: Math.max(1, x.u * 0.25) },
            }),
          );
      }
      if (geo || vap)
        for (let i = 0; i < 8; i++) {
          const s = x.u * between(x, `st${i}`, 4, 8);
          const b = {
            x: between(x, `sx${i}`, x.m * 0.4, x.W - x.m * 0.4 - s),
            y: between(x, `sy${i}`, x.m * 0.4, x.H - x.m * 0.4 - s),
            w: s,
            h: s,
          };
          if (clearOf(out, b, x.u)) out.push(P(k, x, 'star', { points: geo ? 5 : 4, inner: geo ? 45 : 22 }, b, geo ? a3(x) : '#ffffff', { name: 'Sparkle' }));
        }
      return out;
    },

    'glitch-slices': (x) => {
      const out: Node[] = [];
      const L = land(x);
      const area = L ? { x: x.W * 0.44, y: 0, w: x.W * 0.56, h: x.H } : { x: 0, y: x.H * 0.06, w: x.W, h: x.H * 0.48 };
      const img = picture(k, x, area, null, {
        effects: [...fx(k, x, 'glitch', { amount: 55, slices: 26 }), ...fx(k, x, 'chromatic', { amount: 10 })],
      });
      if (img) out.push(img);
      else {
        // the signal itself, torn: the palette's own colour bars broken by interference
        const top = [x.ink, a3(x), x.accent2, mix(x.accent2, x.accent, 0.5), x.accent, mix(x.accent, x.ground, 0.45), mix(x.ink, x.ground, 0.5)];
        const low = [x.accent2, x.ground, x.accent, x.ground, a3(x), x.ground, x.ink];
        const bw = area.w / top.length;
        const bars = [
          ...top.map((c, i) =>
            block(k, x, { x: i * bw, y: 0, w: bw + 1, h: area.h * 0.74 }, c, {
              name: 'Signal bar',
            }),
          ),
          ...low.map((c, i) => block(k, x, { x: i * bw, y: area.h * 0.74, w: bw + 1, h: area.h * 0.26 }, c, { name: 'Signal bar' })),
        ];
        out.push(
          group('Torn signal', area, bars, {
            clip: true,
            effects: [...fx(k, x, 'glitch', { amount: 70, slices: 30 }), ...fx(k, x, 'chromatic', { amount: 8 })],
          }),
        );
      }
      for (let i = 0; i < 9; i++) {
        const w = x.W * between(x, `gw${i}`, 0.18, 0.7);
        out.push(
          block(
            k,
            x,
            {
              x: between(x, `gx${i}`, -x.W * 0.1, x.W - w * 0.6),
              y: between(x, `gy${i}`, x.H * 0.03, x.H * 0.8),
              w,
              h: x.u * between(x, `gh${i}`, 0.35, 2.4),
            },
            i % 3 === 0 ? x.accent : i % 3 === 1 ? x.accent2 : x.ink,
            { name: 'Displaced slice', blend: 'screen', opacity: 0.85 },
          ),
        );
      }
      const hb = L ? { x: x.m, y: x.H * 0.14, w: x.W * 0.44 - x.m * 2, h: x.H * 0.36 } : { x: x.m, y: x.H * 0.58, w: x.W - x.m * 2, h: x.H * 0.16 };
      out.push(k.patternNode(x, k.pdef('noise-dashes', { scale: 1.1, length: 1.4, turbulence: 45, weight: 0.16 }, ['accent2']), { x: 0, y: hb.y - x.u * 4.5, w: L ? x.W * 0.44 : x.W, h: x.u * 3 }, { name: 'Interference', opacity: 0.8 }));
      const t = head(k, x, hb, {
        effects: fx(k, x, 'chromatic', { amount: 7 }),
      });
      out.push(t);
      const s = sub(x, {
        x: hb.x,
        y: hb.y + hb.h + x.u * 2,
        w: hb.w * 0.8,
        h: x.u * 8,
      });
      if (s) out.push(s);
      out.push(k.patternNode(x, k.pdef('lines', { scale: 0.42, weight: 0.09 }, ['ink']), full(x), { name: 'Scanlines', opacity: 0.08 }));
      const strip = L ? { x: 0, y: x.H * 0.7, w: x.W * 0.44, h: x.H * 0.3 } : { x: 0, y: x.H * 0.84, w: x.W, h: x.H * 0.16 };
      const clean = details(
        k,
        x,
        {
          x: strip.x + x.m,
          y: strip.y + x.u * 2.5,
          w: strip.w - x.m * 2,
          h: strip.h - x.u * 4,
        },
        {
          sub: false,
          color: on(x, x.ink),
          scale: 0.9,
          metaStyle: { font: x.dir.tokens.fonts.body },
          fromFoot: true,
        },
      );
      out.push(panelAround(k, x, clean, strip, x.ink, { name: 'Clean strip' }, x.u * 2.5), ...clean);
      return out;
    },

    overprint: (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const mul = { blend: 'multiply' as const };
      const mis = (o = 4) => fx(k, x, 'misregistration', { offset: o, opacity: 85 });
      if (v === 'print') {
        // carved plates printed one over another: a block of colour, the cut lines, a second plate out of register
        const pb = L ? { x: x.W * 0.46, y: x.m, w: x.W * 0.54 - x.m, h: x.H - x.m * 2 } : { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.54 };
        out.push(
          block(k, x, pb, x.accent, {
            name: 'Plate',
            ...mul,
            effects: fx(k, x, 'distress', { amount: 45, scale: 50 }),
          }),
        );
        const img = picture(
          k,
          x,
          {
            x: pb.x + pb.w * 0.08,
            y: pb.y + pb.h * 0.08,
            w: pb.w * 0.6,
            h: pb.h * 0.62,
          },
          null,
          { ...mul, effects: fx(k, x, 'threshold', { level: 52 }) },
        );
        if (img) out.push(img);
        out.push(
          P(
            k,
            x,
            'topographic',
            { seed: (x.seed % 90) + 3, levels: 14, roughness: 75 },
            {
              x: pb.x + pb.w * 0.05,
              y: pb.y + pb.h * 0.12,
              w: pb.w * 0.9,
              h: pb.h * 0.82,
            },
            x.ink,
            {
              name: 'Carved lines',
              ...mul,
              effects: fx(k, x, 'ink-bleed', { amount: 35 }),
              ...stroke(x, x.ink, x.u * 0.45),
            },
          ),
        );
        const sd = Math.min(pb.w, pb.h) * 0.6;
        out.push(
          ellipse(
            x,
            {
              x: pb.x + pb.w - sd * 0.85,
              y: pb.y + pb.h - sd * 0.9,
              w: sd,
              h: sd,
            },
            x.accent2,
            { name: 'Second plate', ...mul, effects: mis(6) },
          ),
        );
        const tb = L
          ? { x: x.m, y: x.m, w: x.W * 0.4, h: x.H * 0.46 }
          : {
              x: x.m,
              y: pb.y + pb.h + x.u * 3,
              w: x.W - x.m * 2,
              h: x.H * 0.19,
            };
        out.push(
          head(k, x, tb, {
            effects: fx(k, x, 'distress', { amount: 16, scale: 40 }),
          }),
        );
        out.push(
          ...details(
            k,
            x,
            L
              ? {
                  x: x.m,
                  y: tb.y + tb.h + x.u * 3,
                  w: x.W * 0.4,
                  h: x.H - tb.y - tb.h - x.u * 3 - x.m,
                }
              : {
                  x: x.m,
                  y: tb.y + tb.h + x.u * 2,
                  w: x.W * 0.72,
                  h: x.H - tb.y - tb.h - x.u * 2 - x.m,
                },
          ),
        );
        return out;
      }
      // riso: type-led — two or three inks overprinted across the whole sheet, never quite in register, and the
      // headline printed big over them; the event's details set as a small header, the tagline under the headline
      const S = Math.min(x.W, x.H);
      const tint = (c: string) => mix(c, x.ground, 0.35);
      const m0 = motifs(x).find((m) => ['triangle', 'rounded-rect', 'blob', 'sector', 'semicircle', 'arch'].includes(m)) ?? 'blob';
      const kind = m0 === 'arch' || m0 === 'semicircle' ? 'sector' : m0;
      out.push(ellipse(x, { x: x.W - S * 0.66, y: -S * 0.06, w: S * 0.74, h: S * 0.74 }, tint(x.accent), { name: 'First ink', ...mul, effects: mis(5) }));
      out.push(
        P(
          k,
          x,
          kind,
          {
            seed: (x.seed % 80) + 4,
            lobes: 4,
            irregular: 40,
            radius: 50,
            apex: 30,
            start: 180,
            sweep: 180,
          },
          { x: -S * 0.14, y: x.H * (L ? 0.3 : 0.36), w: S * 0.66, h: S * 0.66 },
          tint(x.accent2),
          {
            name: 'Second ink',
            ...mul,
            rotation: Math.round(between(x, 'rr', -20, 20)),
          },
        ),
      );
      out.push(P(k, x, 'blob', { seed: (x.seed % 70) + 9, lobes: 3, irregular: 50 }, { x: x.W * 0.44, y: x.H - S * 0.5, w: S * 0.6, h: S * 0.54 }, tint(a3(x)), { name: 'Third ink', ...mul }));
      const img = picture(k, x, L ? { x: x.W * 0.56, y: x.H * 0.08, w: x.W * 0.36, h: x.H * 0.5 } : { x: x.W * 0.46, y: x.H * 0.07, w: x.W * 0.46, h: x.H * 0.24 }, null, { ...mul, effects: fx(k, x, 'duotone', { amount: 100 }) });
      if (img) out.push(img);
      out.push(
        ...details(
          k,
          x,
          { x: x.m, y: x.m, w: L ? x.W * 0.4 : x.W * 0.42, h: x.H * 0.16 },
          {
            sub: false,
            brand: false,
            cta: false,
            metaStyle: {
              font: x.dir.tokens.fonts.body,
              case: 'upper',
              tracking: 80,
            },
          },
        ),
      );
      out.push(k.patternNode(x, k.pdef('halftone', { scale: 1.2, field: 1, angle: 90, max: 110 }, ['accent']), { x: 0, y: x.H * (L ? 0.33 : 0.3), w: x.W, h: x.u * 3 }, { name: 'Halftone band', ...mul }));
      const tb = L ? { x: x.m, y: x.H * 0.38, w: x.W - x.m * 2, h: x.H * 0.34 } : { x: x.m, y: x.H * 0.34, w: x.W - x.m * 2, h: x.H * 0.3 };
      // printed in the darkest ink that reads on every tint beneath (riso has its black)
      const under = [tint(x.accent), tint(x.accent2), tint(a3(x)), x.ground];
      const printInk = [x.ink, mix(x.ink, '#000000', 0.45), '#111111'].find((c) => under.every((u) => contrastRatio(c, u) >= 3.2)) ?? '#111111';
      const t = head(k, x, tb, { color: printInk, ...mul, effects: mis(4) });
      k.treat(x, t, 'stacked');
      out.push(t);
      const s = sub(
        x,
        { x: x.m, y: tb.y + tb.h + x.u * 2, w: x.W * 0.7, h: x.u * 8 },
        {
          color: [x.ink, '#111111'].find((c) => under.every((u) => contrastRatio(c, u) >= 4.5)) ?? '#111111',
        },
      );
      if (s) out.push(s);
      out.push(
        ...details(
          k,
          x,
          {
            x: x.W * 0.5,
            y: x.H * 0.8,
            w: x.W * 0.5 - x.m,
            h: x.H * 0.2 - x.m,
          },
          { sub: false, meta: false, align: 'right' },
        ),
      );
      return out;
    },

    'screen-print': (x) => {
      const out: Node[] = [];
      const L = land(x);
      // the print: flat opaque layers, pulled one screen at a time, clipped to their sheet
      const art = L ? { x: x.W * 0.45, y: 0, w: x.W * 0.55, h: x.H } : { x: 0, y: 0, w: x.W, h: x.H * (x.H / x.W < 1.15 ? 0.5 : 0.6) };
      const W = art.w;
      const H = art.h;
      const D = Math.min(W, H);
      const ch: Node[] = [block(k, x, { x: 0, y: 0, w: W, h: H }, a3(x), { name: 'Field' })];
      ch.push(
        P(
          k,
          x,
          'sunburst',
          { rays: 18, width: 50 },
          {
            x: W / 2 - D * 0.85,
            y: H * 0.42 - D * 0.85,
            w: D * 1.7,
            h: D * 1.7,
          },
          x.accent,
          { name: 'Burst' },
        ),
      );
      const sd = D * 0.5;
      const sun = { x: W / 2 - sd / 2, y: H * 0.42 - sd / 2, w: sd, h: sd };
      ch.push(ellipse(x, sun, x.ground, { name: 'Sun' }));
      const img = picture(k, x, sun, 'ellipse', {
        effects: fx(k, x, 'duotone'),
      });
      if (img) ch.push(img);
      ch.push(
        P(
          k,
          x,
          'wave',
          {
            amplitude: 18,
            frequency: 2,
            phase: Math.round(between(x, 'ph', 0, 360)),
            level: 30,
          },
          { x: 0, y: H * 0.64, w: W, h: H * 0.36 },
          x.accent2,
          { name: 'Hills' },
        ),
      );
      ch.push(k.patternNode(x, k.pdef('halftone', { scale: 1.1, field: 1, angle: 180, max: 100 }, ['ink']), { x: 0, y: H * 0.8, w: W, h: H * 0.2 }, { name: 'Halftone' }));
      out.push(
        group('Print', art, ch, {
          clip: true,
          effects: fx(k, x, 'distress', { amount: 28, scale: 45 }),
        }),
      );
      const tb = L ? { x: x.m, y: x.m, w: x.W * 0.45 - x.m * 2, h: x.H * 0.5 } : { x: x.m, y: art.h + x.u * 3, w: x.W - x.m * 2, h: x.H * 0.17 };
      const t = head(k, x, tb, { align: L ? 'left' : 'center' });
      k.treat(x, t, 'stacked');
      t.h = Math.min(t.h, textHeight(x, t) + x.u);
      out.push(t);
      const s = sub(x, { x: tb.x, y: tb.y + tb.h + x.u * 1.5, w: tb.w, h: x.u * 8 }, { align: L ? 'left' : 'center' });
      if (s) ((s.y = t.y + t.h + x.u * 1.5), out.push(s));
      const after = (s ? s.y + Math.max(s.h, x.u * 4) : t.y + t.h) + x.u * 3;
      const band = L
        ? { x: 0, y: x.H * 0.74, w: x.W * 0.45, h: x.H * 0.26 }
        : {
            x: 0,
            y: Math.max(after, x.H * 0.88 - x.u * 4),
            w: x.W,
            h: x.H - Math.max(after, x.H * 0.88 - x.u * 4),
          };
      const banded = details(
        k,
        x,
        {
          x: band.x + x.m,
          y: band.y + x.u * 2,
          w: band.w - x.m * 2,
          h: band.h - x.u * 3,
        },
        {
          sub: false,
          color: on(x, x.ink),
          align: L ? 'left' : 'center',
          scale: 0.85,
          fromFoot: true,
        },
      );
      out.push(panelAround(k, x, banded, band, x.ink, { name: 'Band' }), ...banded);
      return out;
    },

    'woodtype-stack': (x) => {
      const out: Node[] = [];
      const hand = variant(x) === 'hand';
      const c = x.brief.content;
      const L = land(x);
      if (hand) {
        // made by hand: a painted sun, leaves and stars round lettering drawn with a brush
        const d = Math.min(x.W, x.H) * 0.32;
        out.push(P(k, x, 'wavy-circle', { waves: 14, amplitude: 9 }, { x: x.W - x.m - d, y: x.m, w: d, h: d }, x.accent, { name: 'Sun', rotation: 8 }));
        out.push(P(k, x, 'blob', { seed: 17, lobes: 4, irregular: 50 }, { x: -d * 0.35, y: x.H - d * 1.05, w: d * 1.3, h: d * 1.2 }, x.accent2, { name: 'Painted shape' }));
        out.push(P(k, x, 'leaf', { width: 50, bend: 18 }, { x: x.m, y: x.m, w: d * 0.34, h: d * 0.78 }, a3(x), { name: 'Leaf', rotation: -24 }));
        out.push(P(k, x, 'leaf', { width: 50, bend: -18 }, { x: x.m + d * 0.32, y: x.m + d * 0.1, w: d * 0.28, h: d * 0.64 }, x.accent2, { name: 'Leaf', rotation: 18 }));
        const img = picture(k, x, L ? { x: x.W * 0.08, y: x.H * 0.2, w: x.W * 0.38, h: x.H * 0.6 } : { x: x.W * 0.18, y: x.H * 0.2, w: x.W * 0.64, h: x.H * 0.3 }, 'blob');
        if (img) out.push(img);
        const tb = L
          ? { x: x.W * 0.5, y: x.H * 0.22, w: x.W * 0.46, h: x.H * 0.3 }
          : {
              x: x.m,
              y: img ? x.H * 0.53 : x.H * 0.26,
              w: x.W - x.m * 2,
              h: x.H * (img ? 0.18 : 0.3),
            };
        const t = head(k, x, tb, {
          align: 'center',
          rotation: -3,
          color: onLarge(x, x.ink, x.ground),
        });
        t.warp = { kind: 'rise', amount: 22 };
        out.push(t);
        out.push(
          P(
            k,
            x,
            'wave-lines',
            { lines: 1, amplitude: 14, frequency: 2.5 },
            {
              x: tb.x + tb.w * 0.2,
              y: tb.y + tb.h + x.u,
              w: tb.w * 0.6,
              h: x.u * 4,
            },
            x.accent,
            { name: 'Brush stroke', ...stroke(x, x.accent, x.u * 0.9) },
          ),
        );
        out.push(
          ...details(
            k,
            x,
            {
              x: tb.x + x.u * 2,
              y: tb.y + tb.h + x.u * 7,
              w: tb.w - x.u * 4,
              h: x.H - tb.y - tb.h - x.u * 7 - x.m,
            },
            { align: 'center' },
          ),
        );
        for (let i = 0; i < 7; i++) {
          const s = x.u * between(x, `hs${i}`, 3, 6);
          const b = {
            x: between(x, `hx${i}`, x.m * 0.5, x.W - x.m * 0.5 - s),
            y: between(x, `hy${i}`, x.m * 0.5, x.H - x.m * 0.5 - s),
            w: s,
            h: s,
          };
          if (clearOf(out, b, x.u))
            out.push(
              P(k, x, 'star', { points: 5, inner: 46, rounding: 20 }, b, i % 2 ? x.accent : a3(x), {
                name: 'Star',
                rotation: Math.round(between(x, `hr${i}`, -30, 30)),
              }),
            );
        }
        return out;
      }
      // letterpress: wood type locked up in a centred stack between rules, the ink pressed into the paper
      out.push(...border(k, x, 'double-rule', x.ink));
      const lw = Math.max(1, x.u * 0.28);
      const left = x.m * 1.4;
      const w = x.W - left * 2;
      let y = x.m * 1.7;
      const ornament = (yy: number) => {
        out.push(k.rule(x, { x: left + w * 0.1, y: yy, w: w * 0.34 }, x.ink, lw));
        out.push(
          P(
            k,
            x,
            'star',
            { points: 5, inner: 45 },
            {
              x: x.W / 2 - x.u * 1.7,
              y: yy - x.u * 1.7,
              w: x.u * 3.4,
              h: x.u * 3.4,
            },
            x.accent,
            { name: 'Star' },
          ),
        );
        out.push(k.rule(x, { x: left + w * 0.56, y: yy, w: w * 0.34 }, x.ink, lw));
      };
      if (c.brand) {
        const b = k.text(
          x,
          'logo',
          c.brand,
          { x: left, y, w, h: x.u * 5 },
          {
            size: small(k, x, 1.1),
            align: 'center',
            tracking: 240,
            weight: 700,
            case: 'upper',
            font: x.dir.tokens.fonts.body,
          },
        );
        out.push(b);
        y += b.h + x.u * 1.5;
      }
      ornament(y + x.u * 1.5);
      y += x.u * 4.5;
      const footY = x.H - x.m * 1.7;
      const rest = details(
        k,
        x,
        { x: left, y, w, h: footY - x.u * 4 - y },
        {
          align: 'center',
          brand: false,
          fromFoot: true,
          subStyle: { italic: true },
          metaStyle: { case: 'upper', tracking: 140, weight: 700 },
        },
      );
      let bottom = rest.length ? Math.min(...rest.map((n) => n.y)) - x.u * 3 : footY - x.u * 4;
      const img = picture(
        k,
        x,
        {
          x: x.W / 2 - w * 0.3,
          y: bottom - x.H * 0.16,
          w: w * 0.6,
          h: x.H * 0.16,
        },
        null,
        {
          effects: fx(k, x, 'threshold', { level: 50 }),
          stroke: { color: x.ink, width: lw },
        },
      );
      if (img) {
        out.push(img);
        bottom = img.y - x.u * 3;
      }
      out.push(k.rule(x, { x: left, y: bottom, w }, x.ink, lw * 2.5));
      const t = head(
        k,
        x,
        { x: left, y, w, h: Math.max(x.u * 10, bottom - y - x.u * 3) },
        {
          align: 'center',
          valign: 'middle',
          effects: fx(k, x, 'ink-bleed', { amount: 28 }),
        },
      );
      k.treat(x, t, 'stacked');
      mixedFaces(t, [], [x.accent, x.ink]);
      const th = textHeight(x, t);
      if (t.h - th > x.H * 0.18) {
        // room to spare: the type at the head of the sheet, an engraved rosette between it and the rule
        const box = {
          x: left + w * 0.2,
          y: t.y + th + x.u * 5,
          w: w * 0.6,
          h: t.y + t.h - th - t.y - x.u * 8,
        };
        t.valign = 'top';
        t.h = th + x.u * 2;
        out.push(...medallion(k, x, box, 'rosette', x.ink, x.accent));
      }
      out.push(t);
      out.push(...rest);
      ornament(footY);
      return out;
    },

    'film-editorial': (x) => {
      const out: Node[] = [];
      const L = land(x);
      const frame = L ? { x: x.m * 0.6, y: x.H * 0.12, w: x.W * 0.6, h: x.H * 0.76 } : { x: 0, y: x.H * 0.075, w: x.W, h: x.H * 0.6 };
      const ch: Node[] = [];
      const img = picture(k, x, { x: 0, y: 0, w: frame.w, h: frame.h }, null, {
        effects: fx(k, x, 'grain', { amount: 30 }),
      });
      // no photograph: a graded frame of the style's warm light, never a fake one
      ch.push(
        img ??
          block(k, x, { x: 0, y: 0, w: frame.w, h: frame.h }, radial(0.42, 0.45, 0.85, mix(x.accent, x.ground, 0.35), mix(x.accent, x.ground, 0.78), mix(x.ground, '#000000', 0.3)), {
            name: 'Graded frame',
            effects: fx(k, x, 'grain', { amount: 35 }),
          }),
      );
      const lr = Math.min(frame.w, frame.h) * 0.8;
      ch.push(
        ellipse(x, { x: frame.w - lr * 0.5, y: -lr * 0.35, w: lr, h: lr }, x.accent, {
          name: 'Light leak',
          blend: 'screen',
          opacity: 0.5,
          effects: fx(k, x, 'blur', { radius: 50 }),
        }),
      );
      out.push(group('Frame', frame, ch, { clip: true }));
      // the sprocket holes of the strip, above and below the frame
      const hole = mix(x.ground, x.ink, 0.45);
      for (const yy of [frame.y - x.u * 2.9, frame.y + frame.h + x.u * 1.6])
        out.push({
          ...k.rule(x, { x: frame.x + x.u * 1.2, y: yy, w: frame.w - x.u * 2.4 }, hole),
          name: 'Sprocket holes',
          stroke: {
            color: hole,
            width: x.u * 1.6,
            dash: [x.u * 2.6, x.u * 3.4],
            cap: 'butt',
          },
        } as Node);
      const tb = L
        ? {
            x: frame.x + frame.w + x.u * 5,
            y: x.H * 0.5,
            w: x.W - frame.x - frame.w - x.u * 5 - x.m,
            h: x.H * 0.2,
          }
        : {
            x: x.m,
            y: frame.y + frame.h + x.u * 6,
            w: x.W * 0.72,
            h: x.H * 0.11,
          };
      const t = head(k, x, tb);
      out.push(t);
      out.push(
        ...details(
          k,
          x,
          L
            ? {
                x: tb.x,
                y: tb.y + tb.h + x.u * 2,
                w: tb.w,
                h: x.H - tb.y - tb.h - x.u * 2 - x.m,
              }
            : {
                x: x.m,
                y: tb.y + tb.h + x.u * 2,
                w: x.W * 0.6,
                h: x.H - tb.y - tb.h - x.u * 2 - x.m,
              },
          { scale: 0.9, metaStyle: { tracking: 80, case: 'upper' } },
        ),
      );
      return out;
    },

    'vertical-axis': (x) => {
      const out: Node[] = [];
      const china = variant(x) === 'china';
      const L = land(x);
      const c = x.brief.content;
      if (china) {
        // a field of square cells (the writing grid): the headline fills cells, a seal in the last one
        const cols = L ? 8 : 4;
        const cell = (x.W - x.m * 2) / cols;
        const rows = Math.max(3, Math.floor((x.H - x.m * 2) / cell));
        const g = {
          x: x.m,
          y: x.m + (x.H - x.m * 2 - rows * cell) / 2,
          w: cell * cols,
          h: cell * rows,
        };
        const cb = (c0: number, r0: number, cw: number, rh: number, pad = x.u * 1.2): Box => ({
          x: g.x + c0 * cell + pad,
          y: g.y + r0 * cell + pad,
          w: cw * cell - pad * 2,
          h: rh * cell - pad * 2,
        });
        const line = mix(x.ink, x.ground, 0.78);
        out.push(
          P(k, x, 'grid', { cols, rows }, g, line, {
            name: 'Square grid',
            ...stroke(x, line, x.u * 0.16),
          }),
        );
        const hc = L ? 5 : cols - 1;
        const hr = L ? 2 : rows >= 5 ? 3 : 2;
        const t = head(k, x, cb(0, 0, hc, hr));
        k.treat(x, t, 'stacked');
        out.push(t);
        const img = picture(k, x, L ? cb(5, 0, 2, 3, 0) : cb(0, hr, 3, Math.max(1, rows - hr - 1), 0));
        if (img) out.push(img);
        const seal = cb(cols - 1, rows - 1, 1, 1, cell * 0.08);
        out.push(block(k, x, seal, x.accent, { name: 'Seal', radius: x.u * 0.6 }));
        const brandInSeal = !!c.brand && c.brand.length <= 12;
        if (brandInSeal)
          out.push(
            k.text(
              x,
              'logo',
              c.brand!,
              {
                x: seal.x + seal.w * 0.1,
                y: seal.y + seal.h * 0.1,
                w: seal.w * 0.8,
                h: seal.h * 0.8,
              },
              {
                align: 'center',
                valign: 'middle',
                color: on(x, x.accent),
                weight: 700,
                case: 'none',
              },
            ),
          );
        const vsub = !!c.subhead && c.subhead.length <= 60;
        if (vsub) out.push(k.text(x, 'subhead', c.subhead!, cb(cols - 1, 0, 1, rows - 1, cell * 0.22), { vertical: true, size: mid(k, x), color: x.ink }));
        out.push(...details(k, x, L ? cb(0, 2, 5, rows - 2) : img ? cb(0, rows - 1, 3, 1) : cb(0, hr, 3, rows - hr), { sub: !vsub, brand: !brandInSeal, scale: 0.9, fromFoot: true }));
        return out;
      }
      // one geometric symbol, large and off-centre; the words on a vertical axis at the edge
      const d = Math.min(x.W, x.H) * (L ? 0.64 : 0.6);
      const kinds = ['circle', 'sector', 'arc', 'crescent'];
      const kind = motifs(x).includes('circle') && rand(x, 'k0') < 0.45 ? 'circle' : kinds[Math.floor(rand(x, 'kind') * kinds.length)];
      const sb = L
        ? { x: x.W * 0.1, y: (x.H - d) / 2, w: d, h: d }
        : {
            x: x.W * between(x, 'sx', 0.08, 0.24),
            y: x.H * between(x, 'sy', 0.1, 0.2),
            w: d,
            h: d,
          };
      const colW = x.u * (L ? 11 : 13);
      const rx = x.W - x.m - colW - x.u * 3;
      out.push(block(k, x, { x: x.m, y: sb.y + d / 2, w: rx - x.m, h: Math.max(1, x.u * 0.12) }, x.ink, { name: 'Horizon' }));
      const img = picture(k, x, sb, 'ellipse');
      if (img) out.push(img);
      else if (kind === 'circle') out.push(ellipse(x, sb, x.accent, { name: 'Sun' }));
      else
        out.push(
          P(
            k,
            x,
            kind,
            {
              start: Math.round(rand(x, 'st') * 4) * 90,
              sweep: kind === 'arc' ? 300 : 180,
              thickness: 16,
              caps: 0,
              phase: 40,
              angle: Math.round(between(x, 'an', -40, 40)),
            },
            sb,
            x.accent,
            { name: 'Symbol' },
          ),
        );
      out.push(block(k, x, { x: rx, y: x.m, w: Math.max(1, x.u * 0.14), h: x.H - x.m * 2 }, x.ink, { name: 'Axis' }));
      const words = c.headline;
      const vertical = words.length <= (L ? 18 : 28);
      if (vertical) out.push(head(k, x, { x: x.W - x.m - colW, y: x.m, w: colW, h: x.H - x.m * 2 }, { vertical: true }));
      else out.push(head(k, x, { x: x.m, y: x.H * 0.7, w: rx - x.m - x.u * 3, h: x.H * 0.12 }, { tracking: 120 }));
      out.push(
        ...details(
          k,
          x,
          L
            ? {
                x: sb.x + d + x.u * 6,
                y: x.H * 0.58,
                w: rx - sb.x - d - x.u * 9,
                h: x.H * 0.42 - x.m,
              }
            : {
                x: x.m,
                y: vertical ? x.H * 0.76 : x.H * 0.84,
                w: rx - x.m - x.u * 4,
                h: x.H * (vertical ? 0.24 : 0.16) - x.m,
              },
          { scale: 0.85 },
        ),
      );
      return out;
    },

    woodblock: (x) => {
      const out: Node[] = [];
      const L = land(x);
      const c = x.brief.content;
      const skyH = x.H * (L ? 0.52 : 0.46);
      out.push(block(k, x, { x: 0, y: 0, w: x.W, h: skyH }, linear(180, x.accent, x.ground), { name: 'Graded sky' }));
      for (let i = 0; i < 2; i++)
        out.push(
          block(
            k,
            x,
            {
              x: between(x, `mx${i}`, -x.W * 0.2, x.W * 0.3),
              y: skyH * (0.34 + i * 0.3),
              w: x.W * between(x, `mw${i}`, 0.5, 0.8),
              h: x.u * 4.5,
            },
            mix(x.ground, '#ffffff', 0.4),
            { name: 'Mist band', radius: x.u * 2.25, opacity: 0.85 },
          ),
        );
      const sd = Math.min(x.W, x.H) * 0.18;
      out.push(
        ellipse(x, { x: x.W * 0.14, y: skyH * 0.26, w: sd, h: sd }, a3(x), {
          name: 'Sun',
        }),
      );
      if (x.brief.images[0])
        out.push(
          k.cutPicture(x, x.brief.images[0], k.primOf('wedge', { start: -60, sweep: 120, inner: 28 }), L ? { x: x.W * 0.3, y: x.m, w: x.H * 0.6, h: x.H * 0.6 } : { x: x.W * 0.24, y: skyH * 0.12, w: x.W * 0.56, h: x.W * 0.56 }, {
            name: 'Fan picture',
          }),
        );
      const wy = x.H * (L ? 0.48 : 0.5);
      out.push(
        P(
          k,
          x,
          'wave',
          { amplitude: 14, frequency: 5, phase: 40, level: 40 },
          {
            x: -x.W * 0.05,
            y: wy - x.u * 4,
            w: x.W * 1.1,
            h: x.H - wy + x.u * 4,
          },
          mix(x.accent, x.ground, 0.45),
          { name: 'Far wave' },
        ),
      );
      out.push(
        P(
          k,
          x,
          'wave',
          { amplitude: 22, frequency: 3, phase: 160, level: 45 },
          {
            x: -x.W * 0.05,
            y: wy + x.u * 5,
            w: x.W * 1.1,
            h: x.H - wy - x.u * 5,
          },
          x.accent,
          {
            name: 'Near wave',
            stroke: {
              color: x.ink,
              width: Math.max(1, x.u * 0.45),
              join: 'round',
            },
          },
        ),
      );
      const foam = mix(x.ground, '#ffffff', 0.3);
      out.push(P(k, x, 'wave-lines', { lines: 5, amplitude: 8, frequency: 3, drift: 40 }, { x: 0, y: wy + x.u * 15, w: x.W, h: x.H * 0.18 }, foam, { name: 'Foam lines', ...stroke(x, foam, x.u * 0.3) }));
      // the title in a cartouche: upright when it is short, as the prints set them
      const short = c.headline.length <= 20;
      const cw = x.u * 12;
      const cart = short ? { x: x.W - x.m - cw, y: x.m, w: cw, h: x.H * (L ? 0.62 : 0.48) } : { x: x.m, y: x.m, w: x.W * 0.56, h: x.H * 0.14 };
      out.push(
        block(k, x, cart, x.ground, {
          name: 'Cartouche',
          stroke: { color: x.ink, width: Math.max(1, x.u * 0.3) },
        }),
      );
      out.push(
        head(
          k,
          x,
          {
            x: cart.x + x.u * 1.6,
            y: cart.y + x.u * 1.8,
            w: cart.w - x.u * 3.2,
            h: cart.h - x.u * 3.6,
          },
          short ? { vertical: true, align: 'center', valign: 'middle' } : { valign: 'middle' },
        ),
      );
      const info = L ? { x: x.m, y: x.H * 0.66, w: x.W * 0.42, h: x.H * 0.34 - x.m } : { x: x.m, y: x.H * 0.77, w: x.W * 0.6, h: x.H * 0.23 - x.m };
      const carted = details(
        k,
        x,
        {
          x: info.x + x.u * 2.4,
          y: info.y + x.u * 2,
          w: info.w - x.u * 4.8,
          h: info.h - x.u * 4,
        },
        { scale: 0.85 },
      );
      out.push(
        panelAround(k, x, carted, info, x.ground, {
          name: 'Cartouche',
          stroke: { color: x.ink, width: Math.max(1, x.u * 0.3) },
        }),
        ...carted,
      );
      out.push(
        block(
          k,
          x,
          {
            x: x.m * 0.35,
            y: x.m * 0.35,
            w: x.W - x.m * 0.7,
            h: x.H - x.m * 0.7,
          },
          null,
          {
            name: 'Frame',
            stroke: { color: x.ink, width: Math.max(1, x.u * 0.25) },
          },
        ),
      );
      return out;
    },

    'painted-cinema': (x) => {
      const out: Node[] = [];
      const L = land(x);
      out.push(groundOf(k, x, x.style?.vocab.gradient ?? linear(180, x.ground, mix(x.accent, x.ground, 0.5))));
      const cx = L ? x.W * 0.3 : x.W / 2;
      const cy = L ? x.H * 0.46 : x.H * 0.31;
      const R = Math.max(x.W, x.H) * 0.75;
      out.push(P(k, x, 'sunburst', { rays: 24, width: 45 }, { x: cx - R, y: cy - R, w: R * 2, h: R * 2 }, a3(x), { name: 'Rays', opacity: 0.28 }));
      const d = Math.min(x.W, x.H) * (L ? 0.64 : 0.5);
      const disc = { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
      out.push(
        ellipse(
          x,
          {
            x: disc.x - x.u * 2,
            y: disc.y - x.u * 2,
            w: d + x.u * 4,
            h: d + x.u * 4,
          },
          null,
          { name: 'Ring', stroke: { color: a3(x), width: x.u * 1.2 } },
        ),
      );
      const img = picture(k, x, disc, 'ellipse');
      if (img) out.push(img);
      else {
        out.push(ellipse(x, disc, x.accent, { name: 'Disc' }));
        out.push(
          ellipse(
            x,
            {
              x: disc.x + d * 0.17,
              y: disc.y + d * 0.17,
              w: d * 0.66,
              h: d * 0.66,
            },
            a3(x),
            { name: 'Inner disc' },
          ),
        );
        out.push(
          P(
            k,
            x,
            'star',
            { points: 8, inner: 48 },
            {
              x: disc.x + d * 0.32,
              y: disc.y + d * 0.32,
              w: d * 0.36,
              h: d * 0.36,
            },
            x.ground,
            { name: 'Star' },
          ),
        );
      }
      // the other pictures, if the designer gave them, in smaller discs either side
      const more = x.brief.images.slice(1, 3);
      more.forEach((asset, i) => {
        const sd = d * 0.42;
        const b = {
          x: i === 0 ? disc.x - sd * 0.62 : disc.x + d - sd * 0.38,
          y: disc.y + d * 0.55,
          w: sd,
          h: sd,
        };
        out.push(ellipse(x, { x: b.x - x.u, y: b.y - x.u, w: sd + x.u * 2, h: sd + x.u * 2 }, a3(x), { name: 'Ring' }));
        out.push(k.image(x, asset, b, 'ellipse'));
      });
      const tb = L ? { x: x.W * 0.56, y: x.m, w: x.W * 0.44 - x.m, h: x.H * 0.46 } : { x: x.m, y: x.H * 0.59, w: x.W - x.m * 2, h: x.H * 0.17 };
      const t = head(k, x, tb, {
        align: 'center',
        fill: linear(180, a3(x), x.accent),
        effects: [...fx(k, x, 'extrude', { depth: 14, angle: 135, steps: 14 }, { color: mix(x.accent, '#000000', 0.55) }), ...fx(k, x, 'outline', { width: 3 })],
      });
      if (x.brief.content.headline.length <= 24 && !L) alongArc(k, x, t, 16);
      out.push(t);
      const cb = L ? { x: x.W * 0.52, y: x.H * 0.6, w: x.W * 0.48, h: x.H * 0.4 } : { x: 0, y: x.H * 0.8, w: x.W, h: x.H * 0.2 };
      out.push(k.patternNode(x, k.pdef('diagonal', { scale: 1.6, ratio: 50 }, ['accent']), { x: cb.x, y: cb.y - x.u * 2.4, w: cb.w, h: x.u * 2.4 }, { name: 'Stripes band' }));
      const dark = mix(x.ground, '#000000', 0.55);
      const credits = details(
        k,
        x,
        {
          x: cb.x + x.m,
          y: cb.y + x.u * 2.4,
          // stacked from the foot of the safe area, not from the trim
          w: cb.w - x.m * 2,
          h: cb.h - x.u * 2.4 - x.m,
        },
        {
          align: 'center',
          color: on(x, dark),
          scale: 0.9,
          subStyle: { case: 'upper', tracking: 60 },
          fromFoot: true,
        },
      );
      out.push(panelAround(k, x, credits, cb, dark, { name: 'Credits band' }, x.u * 2.4), ...credits);
      return out;
    },

    'concrete-kinetic': (x) => {
      const out: Node[] = [];
      const L = land(x);
      const area = L ? { x: x.W * 0.38, y: x.m, w: x.W * 0.62 - x.m, h: x.H - x.m * 2 } : { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.66 };
      const cols = L ? 7 : 6;
      const cell = area.w / cols;
      const rows = Math.max(3, Math.min(L ? 6 : 9, Math.floor(area.h / cell)));
      const oy = area.y + (area.h - rows * cell) / 2;
      const mode = ['turn', 'grow', 'sweep'][Math.floor(rand(x, 'mode') * 3)];
      const figure = motifs(x).find((m) => ['triangle', 'rhombus', 'hexagon', 'diamond', 'sector', 'chevron', 'parallelogram', 'trapezoid'].includes(m)) ?? 'rhombus';
      const inks = [x.accent, x.accent2, a3(x), x.ink];
      // one rule, carried through every module: size, turn or sweep advances along the diagonal, the colour with it
      for (let r = 0; r < rows; r++)
        for (let c0 = 0; c0 < cols; c0++) {
          const t = (c0 + r) / Math.max(1, cols + rows - 2);
          const b = {
            x: area.x + c0 * cell,
            y: oy + r * cell,
            w: cell,
            h: cell,
          };
          const ink = inks[Math.min(3, Math.floor(t * 4))];
          if (mode === 'grow') {
            const s = cell * (0.16 + 0.78 * t);
            out.push(
              ellipse(
                x,
                {
                  x: b.x + (cell - s) / 2,
                  y: b.y + (cell - s) / 2,
                  w: s,
                  h: s,
                },
                ink,
                { name: 'Module' },
              ),
            );
          } else if (mode === 'sweep')
            out.push(
              P(
                k,
                x,
                'sector',
                { start: -90, sweep: Math.round(20 + t * 330) },
                {
                  x: b.x + cell * 0.08,
                  y: b.y + cell * 0.08,
                  w: cell * 0.84,
                  h: cell * 0.84,
                },
                ink,
                { name: 'Module' },
              ),
            );
          else
            out.push(
              P(
                k,
                x,
                figure,
                {
                  apex: 50,
                  skew: 30,
                  start: -90,
                  sweep: 180,
                  sides: 6,
                  rounding: 0,
                },
                {
                  x: b.x + cell * 0.14,
                  y: b.y + cell * 0.14,
                  w: cell * 0.72,
                  h: cell * 0.72,
                },
                ink,
                { name: 'Module', rotation: Math.round(t * 90) },
              ),
            );
        }
      const plane = L
        ? { x: x.m, y: x.m, w: x.W * 0.38 - x.m * 2, h: x.H - x.m * 2 }
        : {
            x: x.m,
            y: oy + rows * cell + x.u * 3,
            w: x.W - x.m * 2,
            h: x.H - oy - rows * cell - x.u * 3 - x.m,
          };
      out.push(
        block(
          k,
          x,
          {
            x: plane.x - x.u,
            y: plane.y - x.u,
            w: plane.w + x.u * 2,
            h: plane.h + x.u * 2,
          },
          x.ground,
          { name: 'Plane' },
        ),
      );
      const t = head(
        k,
        x,
        L
          ? {
              x: plane.x,
              y: plane.y + plane.h * 0.5,
              w: plane.w,
              h: plane.h * 0.24,
            }
          : { x: plane.x, y: plane.y, w: plane.w * 0.58, h: plane.h * 0.62 },
      );
      out.push(t);
      out.push(
        ...details(
          k,
          x,
          L
            ? {
                x: plane.x,
                y: t.y + t.h + x.u * 2,
                w: plane.w,
                h: plane.y + plane.h - t.y - t.h - x.u * 2,
              }
            : {
                x: plane.x + plane.w * 0.62,
                y: plane.y,
                w: plane.w * 0.38,
                h: plane.h,
              },
          { scale: 0.85 },
        ),
      );
      const img = picture(
        k,
        x,
        L
          ? { x: plane.x, y: plane.y, w: plane.w, h: plane.h * 0.42 }
          : {
              x: plane.x,
              y: plane.y + plane.h * 0.66,
              w: plane.w * 0.58,
              h: plane.h * 0.34,
            },
      );
      if (img) out.push(img);
      return out;
    },

    'flat-symbol': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const em = L ? { x: x.W * 0.07, y: x.H * 0.12, w: x.H * 0.76, h: x.H * 0.76 } : { x: x.W * 0.15, y: x.H * 0.07, w: x.W * 0.7, h: x.W * 0.7 };
      const tb = L
        ? {
            x: em.x + em.w + x.u * 6,
            y: x.H * 0.2,
            w: x.W - em.x - em.w - x.u * 6 - x.m,
            h: x.H * 0.3,
          }
        : { x: x.m, y: em.y + em.h + x.u * 4, w: x.W - x.m * 2, h: x.H * 0.15 };
      const align = L ? 'left' : 'center';
      if (v === 'painterly') {
        // one painted form carrying a second meaning: the title brushed above it
        const tb2 = L ? tb : { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.16 };
        const form = L ? em : { x: x.W * 0.16, y: x.H * 0.22, w: x.W * 0.68, h: x.H * 0.5 };
        const img = picture(k, x, form, 'drop');
        if (img) out.push(img);
        else {
          out.push(
            P(k, x, 'drop', { point: 36 }, form, x.ink, {
              name: 'Painted form',
            }),
          );
          const ed = form.w * 0.34;
          const eye = {
            x: form.x + form.w / 2 - ed / 2,
            y: form.y + form.h * 0.56,
            w: ed,
            h: ed * 0.62,
          };
          out.push(ellipse(x, eye, x.ground, { name: 'Eye' }));
          out.push(
            ellipse(
              x,
              {
                x: eye.x + ed * 0.34,
                y: eye.y + eye.h * 0.18,
                w: ed * 0.32,
                h: ed * 0.32 * 1.0,
              },
              x.accent,
              { name: 'Iris' },
            ),
          );
        }
        out.push(
          P(
            k,
            x,
            'wave-lines',
            { lines: 1, amplitude: 22, frequency: 1.5 },
            {
              x: form.x - x.u * 4,
              y: form.y + form.h * 0.92,
              w: form.w + x.u * 8,
              h: x.u * 6,
            },
            x.accent,
            { name: 'Brush stroke', ...stroke(x, x.accent, x.u * 1.4) },
          ),
        );
        const t = head(k, x, tb2, {
          align,
          color: onLarge(x, x.accent, x.ground),
        });
        t.warp = { kind: 'wave', amount: 10, cycles: 1 };
        out.push(t);
        out.push(
          ...details(
            k,
            x,
            L
              ? {
                  x: tb.x,
                  y: tb.y + tb.h + x.u * 3,
                  w: tb.w,
                  h: x.H - tb.y - tb.h - x.u * 3 - x.m,
                }
              : {
                  x: x.m,
                  y: form.y + form.h + x.u * 8,
                  w: x.W - x.m * 2,
                  h: x.H - form.y - form.h - x.u * 8 - x.m,
                },
            { align, scale: 0.9 },
          ),
        );
        return out;
      }
      const cx = em.x + em.w / 2;
      const cy = em.y + em.h / 2;
      if (v === 'hand') {
        out.push(
          P(k, x, 'wavy-circle', { waves: 16, amplitude: 7 }, em, x.accent, {
            name: 'Sun',
          }),
        );
        const id = em.w * 0.56;
        const inner = { x: cx - id / 2, y: cy - id / 2, w: id, h: id };
        const img = picture(k, x, inner, 'ellipse');
        out.push(img ?? ellipse(x, inner, a3(x), { name: 'Inner sun' }));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + rand(x, 'ha') * 0.8;
          const s = x.u * 4.5;
          out.push(
            P(
              k,
              x,
              'star',
              { points: 5, inner: 46, rounding: 25 },
              {
                x: cx + Math.cos(a) * em.w * 0.62 - s / 2,
                y: cy + Math.sin(a) * em.h * 0.62 - s / 2,
                w: s,
                h: s,
              },
              x.accent2,
              { name: 'Star' },
            ),
          );
        }
        const t = head(k, x, tb, { align });
        t.warp = { kind: 'rise', amount: 20 };
        out.push(t);
      } else {
        // an emblem composed of flat forms on one axis: rays, a disc, a crescent, a leaf
        out.push(
          P(k, x, 'sunburst', { rays: 24, width: 46 }, em, x.accent, {
            name: 'Rays',
          }),
        );
        const dd = em.w * 0.58;
        const disc = { x: cx - dd / 2, y: cy - dd / 2, w: dd, h: dd };
        out.push(ellipse(x, disc, x.accent2, { name: 'Disc' }));
        const img = picture(
          k,
          x,
          {
            x: disc.x + dd * 0.08,
            y: disc.y + dd * 0.08,
            w: dd * 0.84,
            h: dd * 0.84,
          },
          'ellipse',
        );
        out.push(
          img ??
            P(
              k,
              x,
              'crescent',
              { phase: 42, angle: -30 },
              {
                x: disc.x + dd * 0.18,
                y: disc.y + dd * 0.18,
                w: dd * 0.64,
                h: dd * 0.64,
              },
              a3(x),
              { name: 'Crescent' },
            ),
        );
        out.push(
          P(
            k,
            x,
            'leaf',
            { width: 46, bend: 0 },
            {
              x: cx - em.w * 0.05,
              y: em.y + em.h * 0.8,
              w: em.w * 0.1,
              h: em.h * 0.22,
            },
            x.ink,
            { name: 'Leaf' },
          ),
        );
        out.push(...border(k, x, 'frame', x.ink));
        out.push(head(k, x, tb, { align }));
      }
      out.push(
        ...details(
          k,
          x,
          {
            x: tb.x,
            y: tb.y + tb.h + x.u * 3,
            w: tb.w,
            h: x.H - tb.y - tb.h - x.u * 3 - x.m * 1.2,
          },
          { align, scale: 0.9 },
        ),
      );
      return out;
    },

    'minimal-void': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const hair = Math.max(1, x.u * 0.12);
      if (v === 'nordic') {
        const ib = L ? { x: x.W * 0.5, y: x.m, w: x.W * 0.5 - x.m, h: x.H - x.m * 2 } : { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.56 };
        const img = picture(k, x, ib);
        if (img) out.push(img);
        else {
          const d = Math.min(ib.w, ib.h) * 0.84;
          out.push(
            ellipse(
              x,
              {
                x: ib.x + (ib.w - d) * 0.62,
                y: ib.y + (ib.h - d) / 2,
                w: d,
                h: d,
              },
              mix(x.accent, x.ground, 0.6),
              { name: 'Soft circle' },
            ),
          );
        }
        const tb = L ? { x: x.m, y: x.H * 0.46, w: x.W * 0.42, h: x.H * 0.24 } : { x: x.m, y: ib.y + ib.h + x.u * 5, w: x.W * 0.82, h: x.H * 0.14 };
        const t = head(k, x, tb);
        out.push(t);
        const colY = tb.y + tb.h + x.u * 3;
        const s = sub(x, {
          x: tb.x,
          y: colY,
          w: (L ? tb.w : x.W - x.m * 2) * 0.48,
          h: x.u * 10,
        });
        if (s) out.push(s);
        out.push(
          ...details(
            k,
            x,
            {
              x: tb.x + (L ? tb.w : x.W - x.m * 2) * 0.54,
              y: colY,
              w: (L ? tb.w : x.W - x.m * 2) * 0.46,
              h: x.H - colY - x.m,
            },
            { sub: false, scale: 0.9 },
          ),
        );
        return out;
      }
      if (v === 'type') {
        // type alone, set on the golden section: one size step, one rule
        const tb = L ? { x: x.m, y: x.H * 0.24, w: x.W * 0.6, h: x.H * 0.3 } : { x: x.m, y: x.H * 0.26, w: x.W - x.m * 2, h: x.H * 0.24 };
        out.push(head(k, x, tb));
        const ry = x.H * 0.618;
        out.push(
          block(k, x, { x: x.m, y: ry, w: x.W - x.m * 2, h: hair }, x.ink, {
            name: 'Rule',
          }),
        );
        const s = sub(x, {
          x: x.m,
          y: ry + x.u * 3,
          w: (x.W - x.m * 2) * 0.48,
          h: x.u * 10,
        });
        if (s) out.push(s);
        out.push(
          ...details(
            k,
            x,
            {
              x: x.m + (x.W - x.m * 2) * 0.56,
              y: ry + x.u * 3,
              w: (x.W - x.m * 2) * 0.44,
              h: x.H - ry - x.u * 3 - x.m,
            },
            { sub: false, scale: 0.9 },
          ),
        );
        return out;
      }
      // minimal: almost nothing, placed exactly; one hairline form at the golden point
      const gx = x.W * 0.618;
      const gy = x.H * 0.382;
      const r = Math.min(x.W, x.H) * 0.2;
      const img = picture(k, x, {
        x: gx - r,
        y: gy - r * 1.3,
        w: r * 2,
        h: r * 2.6,
      });
      if (img) out.push(img);
      else
        out.push(
          ellipse(x, { x: gx - r, y: gy - r, w: r * 2, h: r * 2 }, null, {
            name: 'Hairline circle',
            stroke: { color: x.accent, width: hair },
          }),
        );
      const tb = L ? { x: x.m, y: x.H * 0.68, w: x.W * 0.42, h: x.H * 0.12 } : { x: x.m, y: x.H * 0.74, w: x.W * 0.56, h: x.H * 0.09 };
      const t = head(k, x, tb);
      out.push(t);
      const s = sub(x, { x: tb.x, y: tb.y + tb.h + x.u * 1.5, w: tb.w, h: x.u * 8 }, { size: small(k, x, 1.1) });
      if (s) out.push(s);
      out.push(...details(k, x, { x: x.W * 0.64, y: tb.y, w: x.W * 0.36 - x.m, h: x.H - tb.y - x.m }, { sub: false, scale: 0.8 }));
      return out;
    },

    'luxury-centred': (x) => {
      const out: Node[] = [];
      const product = variant(x) === 'product';
      const L = land(x);
      const asset = x.brief.images[0];
      if (product) {
        // a dark set lit from the centre: the product on its shadow, the words quiet above and below
        out.push(groundOf(k, x, radial(0.5, L ? 0.5 : 0.46, 0.75, mix(x.ground, '#ffffff', 0.2), x.ground)));
        const pd = Math.min(x.W, x.H) * 0.5;
        const pb = {
          x: x.W / 2 - pd / 2,
          y: x.H * (L ? 0.25 : 0.3),
          w: pd,
          h: pd,
        };
        out.push(
          ellipse(
            x,
            {
              x: pb.x + pd * 0.1,
              y: pb.y + pd * 0.93,
              w: pd * 0.8,
              h: pd * 0.12,
            },
            '#000000',
            {
              name: 'Shadow',
              opacity: 0.45,
              effects: fx(k, x, 'blur', { radius: 14 }),
            },
          ),
        );
        if (asset)
          out.push({
            ...k.image(x, asset, pb),
            fit: 'contain',
            name: 'Product',
          } as Node);
        else out.push(ellipse(x, pb, radial(0.36, 0.3, 0.8, '#ffffff', x.accent, mix(x.ground, '#000000', 0.4)), { name: 'Lit sphere' }));
        out.push(
          head(
            k,
            x,
            {
              x: x.m * 2,
              y: x.m * 1.4,
              w: x.W - x.m * 4,
              h: x.H * (L ? 0.16 : 0.13),
            },
            { align: 'center', weight: 300 },
          ),
        );
        out.push(
          ...details(
            k,
            x,
            {
              x: x.m * 2,
              y: pb.y + pd + x.u * 6,
              w: x.W - x.m * 4,
              h: x.H - pb.y - pd - x.u * 6 - x.m,
            },
            {
              align: 'center',
              scale: 0.85,
              metaStyle: { tracking: 120, case: 'upper' },
            },
          ),
        );
        return out;
      }
      // editorial luxury: the photograph whole, the words centred on a plate of the paper; without one, a framed panel
      let area: Box;
      if (asset) {
        out.push({ ...k.image(x, asset, full(x)), name: 'Picture' } as Node);
        area = L ? { x: x.W * 0.56, y: x.m, w: x.W * 0.44 - x.m, h: x.H - x.m * 2 } : { x: x.m, y: x.H * 0.64, w: x.W - x.m * 2, h: x.H * 0.36 - x.m };
        out.push(block(k, x, area, x.ground, { name: 'Plate' }));
      } else {
        const pn = { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H - x.m * 2 };
        out.push(block(k, x, pn, mix(x.accent, x.ground, 0.86), { name: 'Panel' }));
        out.push(
          block(
            k,
            x,
            {
              x: pn.x + x.u * 2,
              y: pn.y + x.u * 2,
              w: pn.w - x.u * 4,
              h: pn.h - x.u * 4,
            },
            null,
            {
              name: 'Hairline frame',
              stroke: { color: x.accent, width: Math.max(1, x.u * 0.12) },
            },
          ),
        );
        out.push(
          P(
            k,
            x,
            'diamond',
            {},
            {
              x: x.W / 2 - x.u * 1.6,
              y: x.H * 0.3,
              w: x.u * 3.2,
              h: x.u * 3.2,
            },
            x.accent,
            { name: 'Diamond' },
          ),
        );
        area = {
          x: x.m * 2.2,
          y: x.H * 0.36,
          w: x.W - x.m * 4.4,
          h: x.H * 0.5,
        };
      }
      const t = head(
        k,
        x,
        {
          x: area.x + x.u * 3,
          y: area.y + x.u * 3,
          w: area.w - x.u * 6,
          h: area.h * (asset ? 0.4 : 0.36),
        },
        { align: 'center' },
      );
      k.treat(x, t, 'spaced');
      out.push(t);
      out.push(
        k.rule(
          x,
          {
            x: x.W / 2 - x.u * 8 + (asset && L ? area.x + area.w / 2 - x.W / 2 : 0),
            y: t.y + t.h + x.u * 2,
            w: x.u * 16,
          },
          x.accent,
          Math.max(1, x.u * 0.15),
        ),
      );
      out.push(
        ...details(
          k,
          x,
          {
            x: area.x + x.u * 3,
            y: t.y + t.h + x.u * 5,
            w: area.w - x.u * 6,
            h: area.y + area.h - t.y - t.h - x.u * 6,
          },
          {
            align: 'center',
            scale: 0.85,
            subStyle: { italic: true },
            metaStyle: { tracking: 140, case: 'upper' },
          },
        ),
      );
      return out;
    },

    'layered-planes': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      if (v === 'maximal') {
        // more is more: patterns on every plane, stickers, the title echoed on its own plate
        const regions: [string, Record<string, number>, ('accent' | 'accent2' | 'ink' | 'ground')[], Box, number][] = [
          ['dots', { scale: 2.2, size: 40, stagger: 1, shape: 0 }, ['accent'], { x: -x.W * 0.05, y: -x.H * 0.04, w: x.W * 0.6, h: x.H * 0.34 }, -6],
          ['stripes', { scale: 2.6, ratio: 50 }, ['accent2'], { x: x.W * 0.5, y: x.H * 0.06, w: x.W * 0.56, h: x.H * 0.3 }, 8],
          ['checker', { scale: 3.4 }, ['ink'], { x: x.W * 0.55, y: x.H * 0.66, w: x.W * 0.5, h: x.H * 0.36 }, -10],
          ['waves', { scale: 1.6, amplitude: 1.2, wavelength: 12, weight: 0.5 }, ['accent'], { x: -x.W * 0.06, y: x.H * 0.7, w: x.W * 0.52, h: x.H * 0.34 }, 5],
        ];
        for (const [gen, params, inks, b, r] of regions)
          out.push(
            k.patternNode(x, k.pdef(gen, params, inks), b, {
              rotation: r,
              name: 'Pattern plane',
            }),
          );
        const img = picture(k, x, { x: x.W * 0.2, y: x.H * 0.1, w: x.W * 0.6, h: x.H * 0.32 }, x.style?.dna.imagery.mask || 'blob', { rotation: -4 });
        if (img) out.push(img);
        for (let i = 0; i < 6; i++) {
          const s = x.u * between(x, `ms${i}`, 9, 16);
          const b = {
            x: between(x, `mx${i}`, 0, x.W - s),
            y: between(x, `my${i}`, 0, x.H - s),
            w: s,
            h: s,
          };
          const kind = ['star', 'burst', 'circle', 'plus', 'wavy-circle', 'triangle'][i];
          out.push(
            P(k, x, kind, { points: 6, inner: 50, rays: 14 }, b, [a3(x), x.accent, x.accent2][i % 3], {
              name: 'Sticker',
              rotation: Math.round(between(x, `mr${i}`, -30, 30)),
              stroke: { color: x.ink, width: Math.max(1, x.u * 0.3) },
            }),
          );
        }
        const pl = {
          x: x.m * 0.8,
          y: x.H * 0.4,
          w: x.W - x.m * 1.6,
          h: x.H * 0.24,
        };
        out.push(
          block(k, x, pl, x.accent, {
            name: 'Title plate',
            rotation: -3,
            stroke: { color: x.ink, width: Math.max(1, x.u * 0.4) },
          }),
        );
        const t = head(
          k,
          x,
          {
            x: pl.x + x.u * 3,
            y: pl.y + x.u * 2,
            w: pl.w - x.u * 6,
            h: pl.h - x.u * 4,
          },
          {
            align: 'center',
            valign: 'middle',
            rotation: -3,
            color: on(x, x.accent),
          },
        );
        t.repeat = {
          count: 2,
          dx: x.u * 0.8,
          dy: x.u * 0.8,
          fade: 0.4,
          outline: true,
        };
        out.push(t);
        const st = { x: x.m, y: x.H * 0.7, w: x.W * 0.6, h: x.H * 0.24 - x.m };
        const stuck = details(
          k,
          x,
          {
            x: st.x + x.u * 3,
            y: st.y + x.u * 2.4,
            w: st.w - x.u * 6,
            h: st.h - x.u * 4,
          },
          { color: '#111111', scale: 0.9 },
        );
        out.push(
          panelAround(
            k,
            x,
            stuck,
            st,
            '#ffffff',
            {
              name: 'Sticker',
              radius: x.u * 3,
              rotation: 2,
              stroke: { color: x.ink, width: Math.max(1, x.u * 0.35) },
            },
            x.u * 2.4,
          ),
          ...stuck,
        );
        return out;
      }
      // postmodern, new wave, dada: translucent planes overlapping at angles, grid fragments, a squiggle, dots
      const planes: [Box, Paint, number][] = [
        [{ x: x.W * 0.06, y: x.H * 0.06, w: x.W * 0.62, h: x.H * 0.4 }, mix(x.accent, '#ffffff', 0.35), -8],
        [{ x: x.W * 0.38, y: x.H * 0.18, w: x.W * 0.56, h: x.H * 0.46 }, linear(135, mix(x.accent2, '#ffffff', 0.3), mix(a3(x), '#ffffff', 0.3)), 6],
        [{ x: x.W * 0.1, y: x.H * 0.5, w: x.W * 0.5, h: x.H * 0.3 }, mix(a3(x), '#ffffff', 0.25), 12],
      ];
      for (const [b, f, r] of planes)
        out.push(
          block(k, x, b, f, {
            name: 'Plane',
            rotation: r,
            opacity: 0.88,
            blend: 'multiply',
          }),
        );
      out.push(P(k, x, 'grid', { cols: 5, rows: 4 }, { x: x.W * 0.62, y: x.H * 0.6, w: x.W * 0.3, h: x.W * 0.24 }, x.ink, { name: 'Grid fragment', ...stroke(x, x.ink, x.u * 0.2) }));
      out.push(P(k, x, 'wave-lines', { lines: 1, amplitude: 32, frequency: 4 }, { x: x.W * 0.08, y: x.H * 0.44, w: x.W * 0.42, h: x.u * 7 }, x.ink, { name: 'Squiggle', ...stroke(x, x.ink, x.u * 0.7) }));
      out.push(k.patternNode(x, k.pdef('dots', { scale: 1.6, size: 34, stagger: 1, shape: 0 }, ['ink']), { x: x.W * 0.7, y: x.H * 0.04, w: x.W * 0.26, h: x.H * 0.16 }, { name: 'Dots' }));
      out.push(P(k, x, 'triangle', { apex: 20 }, { x: x.W * 0.02, y: x.H * 0.3, w: x.u * 14, h: x.u * 12 }, x.accent2, { name: 'Triangle', rotation: 15 }));
      if (v === 'newwave') {
        out.push(block(k, x, { x: -x.W * 0.1, y: x.H * 0.36, w: x.W * 1.2, h: x.u * 2.6 }, x.ink, { name: 'Bar', rotation: -9 }));
        out.push(k.patternNode(x, k.pdef('halftone', { scale: 1.6, field: 2, max: 90 }, ['ink']), { x: x.W * 0.5, y: x.H * 0.66, w: x.W * 0.44, h: x.H * 0.16 }, { name: 'Halftone screen', opacity: 0.6 }));
      }
      const img = picture(k, x, { x: x.W * 0.44, y: x.H * 0.22, w: x.W * 0.46, h: x.H * 0.36 }, null, {
        rotation: 6,
        effects: fx(k, x, v === 'dada' ? 'threshold' : 'duotone'),
      });
      if (img) out.push(img);
      const tb = L ? { x: x.m, y: x.H * 0.3, w: x.W * 0.6, h: x.H * 0.34 } : { x: x.m, y: x.H * 0.6, w: x.W - x.m * 2, h: x.H * 0.17 };
      const t = head(k, x, tb, {
        rotation: v === 'dada' ? -6 : v === 'newwave' ? -3 : 0,
      });
      k.treat(x, t, 'italic-mix');
      out.push(t);
      const pl = { x: x.m, y: x.H * 0.8, w: x.W * 0.62, h: x.H * 0.2 - x.m };
      const plated = details(
        k,
        x,
        {
          x: pl.x + x.u * 2,
          y: pl.y + x.u * 1.6,
          w: pl.w - x.u * 4,
          h: pl.h - x.u * 2.4,
        },
        { scale: 0.85, subStyle: v === 'dada' ? { rotation: 0 } : {} },
      );
      out.push(panelAround(k, x, plated, pl, x.ground, { name: 'Plate', opacity: 0.94 }, x.u * 1.6), ...plated);
      return out;
    },

    'ornate-border': (x) => {
      const out: Node[] = [];
      const vict = variant(x) === 'victorian';
      const c = x.brief.content;
      const lw = Math.max(1, x.u * 0.3);
      if (vict) {
        out.push(
          P(
            k,
            x,
            'border',
            { style: 2, size: 3, inset: 0 },
            {
              x: x.m * 0.35,
              y: x.m * 0.35,
              w: x.W - x.m * 0.7,
              h: x.H - x.m * 0.7,
            },
            x.ink,
            { name: 'Dotted border' },
          ),
        );
        out.push(...border(k, x, 'ornate', x.ink, x.m * 0.75));
      } else {
        // a band border like a private-press page: two rules, a scalloped band between, a vine at head and foot
        const o = x.m * 0.4;
        const bw = x.u * 5;
        out.push(
          block(k, x, { x: o, y: o, w: x.W - o * 2, h: x.H - o * 2 }, null, {
            name: 'Outer rule',
            stroke: { color: x.ink, width: lw * 2.2, join: 'miter' },
          }),
        );
        out.push(
          P(
            k,
            x,
            'border',
            { style: 1, size: 3, inset: 0 },
            {
              x: o + lw * 3,
              y: o + lw * 3,
              w: x.W - (o + lw * 3) * 2,
              h: x.H - (o + lw * 3) * 2,
            },
            x.accent,
            { name: 'Scalloped band' },
          ),
        );
        out.push(
          block(
            k,
            x,
            {
              x: o + bw,
              y: o + bw,
              w: x.W - (o + bw) * 2,
              h: x.H - (o + bw) * 2,
            },
            null,
            {
              name: 'Inner rule',
              stroke: { color: x.ink, width: lw, join: 'miter' },
            },
          ),
        );
        for (const [cx0, cy0] of [
          [o, o],
          [x.W - o - bw, o],
          [x.W - o - bw, x.H - o - bw],
          [o, x.H - o - bw],
        ] as const) {
          out.push(
            block(k, x, { x: cx0, y: cy0, w: bw, h: bw }, x.ground, {
              name: 'Corner block',
              stroke: { color: x.ink, width: lw, join: 'miter' },
            }),
          );
          out.push(
            P(
              k,
              x,
              'star',
              { points: 4, inner: 40, rounding: 30 },
              {
                x: cx0 + bw * 0.15,
                y: cy0 + bw * 0.15,
                w: bw * 0.7,
                h: bw * 0.7,
              },
              x.accent,
              { name: 'Quatrefoil' },
            ),
          );
        }
        for (const [yy, flip] of [
          [o + bw + x.u * 1.5, false],
          [x.H - o - bw - x.u * 9.5, true],
        ] as const)
          for (const side of [-1, 1]) {
            out.push(
              P(
                k,
                x,
                'fluid-curve',
                { seed: 23, points: 5, sweep: 60 },
                {
                  x: x.W / 2 + (side < 0 ? -x.W * 0.3 : x.u * 2),
                  y: yy,
                  w: x.W * 0.28,
                  h: x.u * 8,
                },
                x.accent2,
                {
                  name: 'Vine',
                  flipX: side < 0,
                  flipY: flip,
                  ...stroke(x, x.accent2, x.u * 0.4),
                },
              ),
            );
            for (let i = 0; i < 3; i++)
              out.push(
                P(
                  k,
                  x,
                  'leaf',
                  { width: 50, bend: 12 * side },
                  {
                    x: x.W / 2 + side * x.W * (0.08 + i * 0.08) - x.u * 1.5,
                    y: yy + x.u * (flip ? 0.6 : 1.8),
                    w: x.u * 3,
                    h: x.u * 5.4,
                  },
                  x.accent2,
                  {
                    name: 'Leaf',
                    rotation: side * (50 + i * 15) * (flip ? -1 : 1),
                  },
                ),
              );
          }
      }
      // the page: a picture in an arch, the words centred under it
      const left = x.m * 1.7;
      const w = x.W - left * 2;
      let y = x.m * (vict ? 1.9 : 2.2);
      const img = picture(k, x, { x: x.W / 2 - w * 0.28, y, w: w * 0.56, h: x.H * 0.3 }, vict ? 'ellipse' : 'arch');
      if (img) {
        out.push(img);
        y += x.H * 0.3 + x.u * 3;
      }
      const alt = x.style?.faces.alt ?? [];
      const t = head(
        k,
        x,
        { x: left, y, w, h: x.H * (img ? 0.2 : 0.3) },
        {
          align: 'center',
          color: vict ? x.ink : readable(x.accent, x.ground, 3),
        },
      );
      if (vict) mixedFaces(t, alt.slice(0, 1), [x.accent, x.ink]);
      t.h = Math.min(t.h, textHeight(x, t) + x.u * 2);
      out.push(t);
      y = t.y + t.h + x.u * 2;
      out.push(k.rule(x, { x: x.W / 2 - w * 0.2, y, w: w * 0.4 }, x.ink, lw));
      y += x.u * 3;
      // the words end above the foot vine (crafts) or the star (victorian)
      const footLimit = vict ? x.H - x.m * 2.4 : x.H - x.m * 0.4 - x.u * 17;
      const rest = details(
        k,
        x,
        { x: left, y, w, h: footLimit - y },
        {
          align: 'center',
          fromFoot: true,
          subStyle: { italic: true },
          metaStyle: {
            color: readable(x.accent, x.ground),
            case: 'upper',
            tracking: 120,
          },
        },
      );
      const restTop = rest.length ? Math.min(...rest.map((n) => n.y)) : footLimit;
      if (!img && restTop - y > x.H * 0.16)
        out.push(
          ...medallion(
            k,
            x,
            {
              x: left + w * 0.18,
              y: y + x.u * 2,
              w: w * 0.64,
              h: restTop - y - x.u * 6,
            },
            vict ? 'rosette' : 'flower',
            vict ? x.ink : x.accent,
            vict ? x.accent : x.accent2,
          ),
        );
      out.push(...rest);
      if (c.brand && vict)
        out.push(
          P(
            k,
            x,
            'star',
            { points: 5, inner: 45 },
            {
              x: x.W / 2 - x.u * 1.6,
              y: x.H - x.m * 1.7,
              w: x.u * 3.2,
              h: x.u * 3.2,
            },
            x.accent,
            { name: 'Star' },
          ),
        );
      return out;
    },

    'organic-arch': (x) => {
      const out: Node[] = [];
      const solar = variant(x) === 'solar';
      const L = land(x);
      if (solar) {
        // a symmetrical arch opening onto a sky: the sun inside, hills, leaves growing either side
        const aw = L ? x.H * 0.66 : x.W * 0.7;
        const ah = Math.min(aw * 1.2, x.H * (L ? 0.84 : 0.6));
        const ab = {
          x: (L ? x.W * 0.3 : x.W / 2) - aw / 2,
          y: x.m * 1.2,
          w: aw,
          h: ah,
        };
        const inner: Node[] = [
          pathNode(x, { x: 0, y: 0, w: aw, h: ah }, ARCH, '#000000', {
            name: 'Cut',
          }),
        ];
        inner.push(block(k, x, { x: 0, y: 0, w: aw, h: ah }, linear(180, mix(x.accent2, '#ffffff', 0.35), x.ground), { name: 'Sky' }));
        const sd = aw * 0.36;
        inner.push(
          ellipse(x, { x: aw / 2 - sd / 2, y: ah * 0.2, w: sd, h: sd }, a3(x), {
            name: 'Sun',
          }),
        );
        const asset = x.brief.images[0];
        if (asset)
          inner.push({
            ...k.image(x, asset, { x: 0, y: ah * 0.36, w: aw, h: ah * 0.64 }),
            name: 'Picture',
          } as Node);
        inner.push(P(k, x, 'wave', { amplitude: 16, frequency: 1.5, phase: 90, level: 35 }, { x: 0, y: ah * 0.66, w: aw, h: ah * 0.34 }, x.accent, { name: 'Hills' }));
        out.push(group('Arch', ab, inner, { mask: 'alpha' }));
        out.push(
          pathNode(x, ab, ARCH, null, {
            name: 'Arch line',
            stroke: { color: x.ink, width: Math.max(1, x.u * 0.4) },
          }),
        );
        for (const side of [-1, 1])
          for (let i = 0; i < 3; i++)
            out.push(
              P(
                k,
                x,
                'leaf',
                { width: 48, bend: 14 * side },
                {
                  x: ab.x + (side < 0 ? -x.u * 7 : aw + x.u * 1),
                  y: ab.y + ah * (0.5 + i * 0.15),
                  w: x.u * 6,
                  h: x.u * 11,
                },
                i % 2 ? x.accent : mix(x.accent, x.ground, 0.3),
                {
                  name: 'Leaf',
                  rotation: side * (30 + i * 12),
                  flipX: side < 0,
                },
              ),
            );
        const tb = L ? { x: x.W * 0.58, y: x.H * 0.24, w: x.W * 0.38, h: x.H * 0.28 } : { x: x.m, y: ab.y + ah + x.u * 4, w: x.W - x.m * 2, h: x.H * 0.14 };
        out.push(head(k, x, tb, { align: L ? 'left' : 'center' }));
        out.push(
          ...details(
            k,
            x,
            {
              x: tb.x,
              y: tb.y + tb.h + x.u * 2.5,
              w: tb.w,
              h: x.H - tb.y - tb.h - x.u * 2.5 - x.m,
            },
            { align: L ? 'left' : 'center', scale: 0.9 },
          ),
        );
        return out;
      }
      // organic: a soft arch of colour, a sun rising behind it, leaves and pebbles at its foot
      const ab = L ? { x: x.W * 0.5, y: x.H * 0.08, w: x.W * 0.38, h: x.H * 0.84 } : { x: x.W * 0.34, y: x.H * 0.07, w: x.W * 0.58, h: x.H * 0.56 };
      const sd = ab.w * 0.5;
      out.push(ellipse(x, { x: ab.x - sd * 0.42, y: ab.y + ab.h * 0.06, w: sd, h: sd }, a3(x), { name: 'Sun' }));
      out.push(pathNode(x, ab, ARCH, mix(x.accent2, x.ground, 0.55), { name: 'Arch' }));
      const img = picture(
        k,
        x,
        {
          x: ab.x + ab.w * 0.1,
          y: ab.y + ab.h * 0.1,
          w: ab.w * 0.8,
          h: ab.h * 0.8,
        },
        'arch',
      );
      if (img) out.push(img);
      out.push(
        P(
          k,
          x,
          'leaf',
          { width: 52, bend: 16 },
          {
            x: ab.x - x.u * 4,
            y: ab.y + ab.h - x.u * 22,
            w: x.u * 10,
            h: x.u * 22,
          },
          x.accent,
          { name: 'Leaf', rotation: -18 },
        ),
      );
      out.push(
        P(
          k,
          x,
          'leaf',
          { width: 46, bend: -12 },
          {
            x: ab.x + x.u * 5,
            y: ab.y + ab.h - x.u * 17,
            w: x.u * 8,
            h: x.u * 17,
          },
          mix(x.accent, x.ink, 0.25),
          { name: 'Leaf', rotation: 14 },
        ),
      );
      out.push(
        P(
          k,
          x,
          'blob',
          { seed: 41, lobes: 3, irregular: 35 },
          {
            x: ab.x + ab.w - x.u * 10,
            y: ab.y + ab.h - x.u * 8,
            w: x.u * 16,
            h: x.u * 11,
          },
          x.accent,
          { name: 'Pebble' },
        ),
      );
      const tb = L ? { x: x.m, y: x.H * 0.3, w: x.W * 0.42, h: x.H * 0.3 } : { x: x.m, y: ab.y + ab.h + x.u * 5, w: x.W * 0.84, h: x.H * 0.15 };
      out.push(head(k, x, tb));
      out.push(
        ...details(
          k,
          x,
          {
            x: tb.x,
            y: tb.y + tb.h + x.u * 2.5,
            w: tb.w * 0.8,
            h: x.H - tb.y - tb.h - x.u * 2.5 - x.m,
          },
          { scale: 0.9 },
        ),
      );
      return out;
    },

    'soft-glass': (x) => {
      const out: Node[] = [];
      const holo = variant(x) === 'holo';
      const L = land(x);
      out.push(groundOf(k, x, x.style?.vocab.gradient ?? (holo ? HOLO : linear(180, mix(x.accent, '#ffffff', 0.5), x.ground))));
      if (holo) {
        for (let i = 0; i < 4; i++) {
          const w = x.W * between(x, `cw${i}`, 0.22, 0.46);
          out.push(
            P(
              k,
              x,
              i % 2 ? 'superellipse' : 'capsule',
              { n: 50 },
              {
                x: between(x, `cx${i}`, -w * 0.2, x.W - w * 0.8),
                y: between(x, `cy${i}`, 0, x.H * 0.8),
                w,
                h: i % 2 ? w : w * 0.38,
              },
              linear(between(x, `ca${i}`, 0, 180), mix(x.accent, '#ffffff', 0.4), mix(a3(x), '#ffffff', 0.3), mix(x.accent2, '#ffffff', 0.4)),
              {
                name: 'Glass form',
                rotation: Math.round(between(x, `cr${i}`, -30, 30)),
                opacity: 0.9,
                effects: fx(k, x, 'glass', { highlight: 70, rim: 70 }),
              },
            ),
          );
        }
      } else {
        out.push(P(k, x, 'wave', { amplitude: 14, frequency: 1.5, phase: 30, level: 45 }, { x: 0, y: x.H * 0.78, w: x.W, h: x.H * 0.22 }, linear(180, mix(x.accent2, '#ffffff', 0.25), x.accent2), { name: 'Grass wave' }));
        for (let i = 0; i < 9; i++) {
          const s = x.u * between(x, `bs${i}`, 4, 15);
          out.push(
            ellipse(
              x,
              {
                x: between(x, `bx${i}`, 0, x.W - s),
                y: between(x, `by${i}`, x.m * 0.3, x.H * 0.8 - s),
                w: s,
                h: s,
              },
              radial(0.35, 0.3, 0.75, '#ffffff', mix(x.accent, '#ffffff', 0.55)),
              {
                name: 'Bubble',
                opacity: 0.75,
                effects: fx(k, x, 'glass', { highlight: 80, rim: 70 }),
              },
            ),
          );
        }
      }
      const pn = L ? { x: x.W * 0.48, y: x.H * 0.18, w: x.W * 0.46, h: x.H * 0.64 } : { x: x.W * 0.1, y: x.H * 0.5, w: x.W * 0.8, h: x.H * 0.4 };
      const pd = L ? Math.min(x.W * 0.34, x.H * 0.6) : Math.min(x.W * 0.56, x.H * 0.36);
      const img = picture(k, x, L ? { x: x.W * 0.08, y: (x.H - pd) / 2, w: pd, h: pd } : { x: x.W / 2 - pd / 2, y: x.H * 0.07, w: pd, h: pd }, holo ? 'superellipse' : 'circle', { effects: fx(k, x, 'glass', { highlight: 50, rim: 50 }) });
      if (img) out.push(img);
      const panelInk = on(x, mix(x.ground, '#ffffff', 0.6));
      const t = head(
        k,
        x,
        {
          x: pn.x + x.u * 4,
          y: pn.y + x.u * 4,
          w: pn.w - x.u * 8,
          h: pn.h * 0.4,
        },
        { align: 'center', color: panelInk, ...(holo ? { weight: 300 } : {}) },
      );
      if (holo) k.treat(x, t, 'spaced');
      const frosted = details(
        k,
        x,
        {
          x: pn.x + x.u * 4,
          y: t.y + t.h + x.u * 2,
          w: pn.w - x.u * 8,
          h: pn.y + pn.h - t.y - t.h - x.u * 5,
        },
        { align: 'center', color: panelInk, scale: 0.9 },
      );
      out.push(
        panelAround(
          k,
          x,
          [t, ...frosted],
          pn,
          '#ffffff',
          {
            name: 'Frosted panel',
            radius: x.u * 3.5,
            opacity: 0.6,
            effects: [
              ...fx(k, x, 'glass', { highlight: 60, rim: 60 }),
              ...fx(k, x, 'drop-shadow', {
                dx: 0,
                dy: 14,
                blur: 30,
                opacity: 18,
              }),
            ],
          },
          x.u * 3,
        ),
      );
      out.push(t, ...frosted);
      return out;
    },

    'industrial-hazard': (x) => {
      const out: Node[] = [];
      const L = land(x);
      const bandH = x.u * 6;
      for (const y of [x.m * 0.45, x.H - x.m * 0.45 - bandH]) out.push(k.patternNode(x, k.pdef('diagonal', { scale: 2.6, ratio: 50 }, ['accent']), { x: 0, y, w: x.W, h: bandH }, { name: 'Hazard band' }));
      const top = x.m * 0.45 + bandH + x.u * 4;
      const bottom = x.H - x.m * 0.45 - bandH - x.u * 4;
      const box = L ? { x: x.m, y: top, w: x.W * 0.56, h: bottom - top } : { x: x.m, y: top, w: x.W - x.m * 2, h: x.H * 0.4 };
      out.push(block(k, x, box, x.accent, { name: 'Warning box' }));
      const t = head(
        k,
        x,
        {
          x: box.x + x.u * 3,
          y: box.y + x.u * 3,
          w: box.w - x.u * 6,
          h: box.h - x.u * 6,
        },
        { color: on(x, x.accent) },
      );
      k.treat(x, t, 'stacked');
      out.push(t);
      const vp = L
        ? {
            x: box.x + box.w + x.u * 4,
            y: top,
            w: x.W - box.x - box.w - x.u * 4 - x.m,
            h: (bottom - top) * 0.46,
          }
        : {
            x: x.m,
            y: box.y + box.h + x.u * 4,
            w: x.W * 0.42,
            h: bottom - box.y - box.h - x.u * 4,
          };
      const img = picture(k, x, vp, null, {
        effects: fx(k, x, 'threshold', { level: 50 }),
      });
      if (img) out.push(img);
      else {
        const rd = Math.min(vp.w, vp.h) * 0.6;
        out.push(
          P(
            k,
            x,
            'ring',
            { thickness: 8 },
            {
              x: vp.x + vp.w / 2 - rd / 2,
              y: vp.y + vp.h / 2 - rd / 2,
              w: rd,
              h: rd,
            },
            x.accent,
            { name: 'Reticle' },
          ),
        );
        out.push(
          P(
            k,
            x,
            'plus',
            { thickness: 8 },
            {
              x: vp.x + vp.w / 2 - rd * 0.7,
              y: vp.y + vp.h / 2 - rd * 0.7,
              w: rd * 1.4,
              h: rd * 1.4,
            },
            x.ink,
            { name: 'Crosshair' },
          ),
        );
      }
      out.push(
        block(k, x, vp, null, {
          name: 'Viewport',
          stroke: {
            color: x.ink,
            width: Math.max(1, x.u * 0.35),
            join: 'miter',
          },
        }),
      );
      // the details as stencilled plates: each line in its own box
      const ix = L ? vp.x : vp.x + vp.w + x.u * 4;
      const iw = L ? vp.w : x.W - ix - x.m;
      let y = L ? vp.y + vp.h + x.u * 4 : vp.y;
      const s = sub(x, { x: ix, y, w: iw, h: x.u * 8 });
      if (s) {
        out.push(s);
        y += s.h + x.u * 3;
      }
      const size = small(k, x);
      for (const line of k.metaLines(x)) {
        const h = size * 2.2;
        if (y + h > bottom) break;
        out.push(
          block(k, x, { x: ix, y, w: iw, h }, null, {
            name: 'Plate',
            stroke: {
              color: x.ink,
              width: Math.max(1, x.u * 0.25),
              join: 'miter',
            },
          }),
        );
        out.push(
          k.text(
            x,
            'meta',
            line,
            {
              x: ix + x.u * 1.6,
              y: y + (h - size * 1.3) / 2,
              w: iw - x.u * 3.2,
              h: size * 1.3,
            },
            {
              size,
              case: 'upper',
              tracking: 80,
              font: x.dir.tokens.fonts.body,
            },
          ),
        );
        y += h + x.u * 1.6;
      }
      out.push(...details(k, x, { x: ix, y: y + x.u, w: iw, h: Math.max(x.u * 6, bottom - y - x.u) }, { sub: false, meta: false, scale: 0.9 }));
      for (const [px, py] of [
        [x.m * 0.4, top - x.u * 3],
        [x.W - x.m * 0.4 - x.u * 3, top - x.u * 3],
      ] as const)
        out.push(P(k, x, 'plus', { thickness: 14 }, { x: px, y: py, w: x.u * 3, h: x.u * 3 }, x.ink, { name: 'Mark' }));
      return out;
    },

    advert: (x) => {
      const out: Node[] = [];
      const commercial = variant(x) === 'commercial';
      const L = land(x);
      const c = x.brief.content;
      const meta = k.metaLines(x);
      const asset = x.brief.images[0];
      if (commercial) {
        // high contrast: one block of the brand colour, the headline huge and knocked out of it, the product over the edge
        const blk = L ? { x: x.W * 0.42, y: 0, w: x.W * 0.58, h: x.H } : { x: 0, y: x.H * 0.44, w: x.W, h: x.H * 0.56 };
        // the block slanted, as sales graphics slant it, running past the frame so every word sits on it
        out.push(
          P(
            k,
            x,
            'parallelogram',
            { slant: 12, rounding: 0 },
            L
              ? {
                  x: blk.x - blk.h * 0.12,
                  y: 0,
                  w: blk.w + blk.h * 0.3,
                  h: blk.h,
                }
              : { x: -x.W * 0.2, y: blk.y, w: x.W * 1.4, h: blk.h },
            x.accent,
            { name: 'Colour block' },
          ),
        );
        const pb = L ? { x: x.W * 0.05, y: x.H * 0.1, w: x.W * 0.44, h: x.H * 0.8 } : { x: x.W * 0.16, y: x.H * 0.05, w: x.W * 0.68, h: x.H * 0.46 };
        if (asset)
          out.push({
            ...k.image(x, asset, pb),
            fit: 'contain',
            name: 'Product',
            effects: fx(k, x, 'drop-shadow', {
              dx: 0,
              dy: 18,
              blur: 30,
              opacity: 30,
            }),
          } as Node);
        const ink = on(x, x.accent);
        const tb = L
          ? { x: blk.x + x.m, y: x.m, w: blk.w - x.m * 2, h: x.H * 0.56 }
          : {
              x: x.m,
              y: blk.y + (asset ? x.u * 9 : x.u * 4),
              w: x.W - x.m * 2,
              h: blk.h * 0.48,
            };
        const t = head(k, x, asset || L ? tb : { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.38 }, { color: asset || L ? ink : x.ink });
        k.treat(x, t, 'stacked');
        out.push(t);
        const infoY = asset || L ? t.y + t.h + x.u * 3 : blk.y + x.u * 5;
        out.push(
          ...details(
            k,
            x,
            {
              x: L ? blk.x + x.m : x.m,
              y: infoY,
              w: (L ? blk.w : x.W) - x.m * 2 - x.u * 18,
              h: (L ? x.H : blk.y + blk.h) - infoY - x.m,
            },
            { color: ink, cta: false },
          ),
        );
        out.push(
          P(
            k,
            x,
            'arrow',
            { shaft: 34, head: 42, double: 0 },
            {
              x: x.W - x.m - x.u * 15,
              y: x.H - x.m - x.u * 11,
              w: x.u * 15,
              h: x.u * 11,
            },
            ink,
            { name: 'Arrow' },
          ),
        );
        if (c.cta) {
          const bd = x.u * 18;
          const bb = {
            x: (L ? blk.x : x.W) - bd * 0.6 - (L ? 0 : x.m),
            y: L ? x.H - x.m - bd : blk.y - bd * 0.5,
            w: bd,
            h: bd,
          };
          out.push(
            P(k, x, 'burst', { rays: 16, inner: 82 }, bb, x.ink, {
              name: 'Badge',
              rotation: -12,
            }),
          );
          out.push(
            k.text(
              x,
              'cta',
              c.cta,
              {
                x: bb.x + bd * 0.18,
                y: bb.y + bd * 0.3,
                w: bd * 0.64,
                h: bd * 0.4,
              },
              {
                align: 'center',
                valign: 'middle',
                color: on(x, x.ink),
                weight: 700,
                size: small(k, x, 1.1),
                rotation: -12,
              },
            ),
          );
        }
        return out;
      }
      // vintage: a coupon of the old press, the headline arched, the date in a starburst, the maker in script
      out.push(...border(k, x, 'dashed', x.ink));
      const left = x.m * 1.4;
      const w = x.W - left * 2;
      const t = head(k, x, { x: left, y: x.m * 1.6, w, h: x.H * 0.22 }, { align: 'center' });
      if (c.headline.length <= 24) alongArc(k, x, t, 22);
      out.push(t);
      const ob = {
        x: x.W / 2 - w * 0.3,
        y: t.y + t.h + x.u * 4,
        w: w * 0.6,
        h: x.H * 0.28,
      };
      if (asset) {
        out.push(
          ellipse(
            x,
            {
              x: ob.x - x.u * 1.4,
              y: ob.y - x.u * 1.4,
              w: ob.w + x.u * 2.8,
              h: ob.h + x.u * 2.8,
            },
            null,
            {
              name: 'Oval rule',
              stroke: { color: x.ink, width: Math.max(1, x.u * 0.35) },
            },
          ),
        );
        out.push({ ...k.image(x, asset, ob, 'ellipse') } as Node);
      } else out.push(P(k, x, 'sunburst', { rays: 20, width: 50 }, { x: ob.x + ob.w * 0.1, y: ob.y, w: ob.w * 0.8, h: ob.h }, mix(x.accent, x.ground, 0.55), { name: 'Rays' }));
      let y = ob.y + ob.h + x.u * 4;
      if (c.subhead) {
        const rb = { x: left + w * 0.04, y, w: w * 0.92, h: x.u * 10 };
        out.push(P(k, x, 'ribbon', { seed: 4, twists: 1, amplitude: 10, thickness: 44, taper: 20 }, rb, x.accent, { name: 'Banner' }));
        out.push(
          k.text(
            x,
            'subhead',
            c.subhead,
            {
              x: rb.x + rb.w * 0.12,
              y: rb.y + rb.h * 0.2,
              w: rb.w * 0.76,
              h: rb.h * 0.6,
            },
            {
              align: 'center',
              valign: 'middle',
              color: on(x, x.accent),
              size: mid(k, x),
              weight: 700,
              italic: true,
            },
          ),
        );
        y = rb.y + rb.h + x.u * 3;
      }
      const hasBadge = meta.length > 0;
      if (hasBadge) {
        const bd = x.u * 22;
        const bb = {
          x: x.W - x.m * 1.1 - bd,
          y: ob.y + ob.h * 0.52,
          w: bd,
          h: bd,
        };
        out.push(
          P(k, x, 'burst', { rays: 20, inner: 80 }, bb, a3(x), {
            name: 'Starburst',
            rotation: 10,
            stroke: { color: x.ink, width: Math.max(1, x.u * 0.3) },
          }),
        );
        out.push(
          k.text(
            x,
            'meta',
            meta[0],
            {
              x: bb.x + bd * 0.18,
              y: bb.y + bd * 0.28,
              w: bd * 0.64,
              h: bd * 0.44,
            },
            {
              align: 'center',
              valign: 'middle',
              color: on(x, a3(x)),
              weight: 700,
              size: small(k, x, 0.95),
              rotation: 10,
            },
          ),
        );
      }
      const alt = x.style?.faces.alt.find((f) => /Lobster|Pacifico|script/i.test(f)) ?? x.style?.faces.alt[0];
      out.push(
        ...details(
          k,
          x,
          { x: left, y, w, h: x.H - y - x.m * 1.6 },
          {
            align: 'center',
            sub: false,
            metaFrom: hasBadge ? 1 : 0,
            metaStyle: { case: 'upper', tracking: 100, weight: 700 },
            ...(alt ? { brand: true } : {}),
          },
        ).map((n) =>
          (n as TextNode).role === 'logo' && alt
            ? ({
                ...n,
                font: alt,
                case: 'none',
                size: (n as TextNode).size * 1.5,
                h: (n as TextNode).h * 1.5,
              } as Node)
            : n,
        ),
      );
      return out;
    },

    'grunge-layers': (x) => {
      const out: Node[] = [];
      const pm = variant(x) === 'printmaking';
      const L = land(x);
      for (let i = 0; i < 4; i++) {
        const s = Math.min(x.W, x.H) * between(x, `gs${i}`, 0.3, 0.62);
        const b = {
          x: between(x, `gx${i}`, -s * 0.3, x.W - s * 0.7),
          y: between(x, `gy${i}`, -s * 0.2, x.H - s * 0.8),
          w: s,
          h: s,
        };
        out.push(
          P(k, x, pm ? 'contour' : 'blob', { seed: 30 + i * 11, lobes: 5, irregular: 70, levels: 9 }, b, pm ? x.accent : mix(x.accent, x.ground, 0.35), {
            name: pm ? 'Contours' : 'Stain',
            opacity: pm ? 0.75 : 0.5,
            blend: pm ? 'multiply' : 'screen',
            effects: fx(k, x, 'distress', { amount: 55 }),
          }),
        );
      }
      const img = picture(k, x, L ? { x: x.W * 0.4, y: x.H * 0.08, w: x.W * 0.52, h: x.H * 0.7 } : { x: x.W * 0.18, y: x.H * 0.08, w: x.W * 0.72, h: x.H * 0.46 }, 'irregular-polygon', { opacity: 0.62, effects: fx(k, x, 'threshold', { level: 48 }) });
      if (img) out.push(img);
      out.push(k.patternNode(x, k.pdef('noise-dashes', { scale: 2.2, length: 2.6, turbulence: 60, weight: 0.12 }, ['ink']), full(x), { name: 'Scratches', opacity: 0.18 }));
      const tb = L ? { x: x.m, y: x.H * 0.3, w: x.W * 0.6, h: x.H * 0.34 } : { x: x.m, y: x.H * 0.5, w: x.W - x.m * 2 - x.u * 9, h: x.H * 0.22 };
      const t = head(k, x, tb, { rotation: -4 });
      t.repeat = {
        count: 2,
        dx: x.u * 1.1,
        dy: x.u * 1.1,
        fade: 0.6,
        outline: true,
      };
      out.push(t);
      const c = x.brief.content;
      const vsub = !!c.subhead && c.subhead.length <= 70;
      if (vsub) out.push(k.text(x, 'subhead', c.subhead!, { x: x.W - x.m - x.u * 7, y: x.m, w: x.u * 7, h: x.H * 0.62 }, { vertical: true, size: mid(k, x), color: x.ink }));
      out.push(
        ...details(
          k,
          x,
          {
            x: x.m,
            y: L ? x.H * 0.72 : x.H * 0.78,
            w: x.W * 0.56,
            h: x.H * (L ? 0.28 : 0.22) - x.m,
          },
          { sub: !vsub, scale: 0.9 },
        ),
      );
      return out;
    },

    'editorial-split': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const side = L || v === 'luxury';
      const band = side ? { x: x.W * (L ? 0.55 : 0.5), y: 0, w: x.W * (L ? 0.45 : 0.5), h: x.H } : { x: 0, y: 0, w: x.W, h: x.H * 0.46 };
      const img = picture(k, x, band, null, v === 'mono' ? { effects: fx(k, x, 'duotone') } : {});
      if (img) out.push(img);
      else {
        // no photograph: a field of the second colour, screened, where it would be (never a stand-in picture)
        out.push(block(k, x, band, v === 'mono' ? mix(x.accent, x.ground, 0.45) : mix(x.accent2, x.ground, 0.72), { name: 'Colour band' }));
        out.push(k.patternNode(x, k.pdef('halftone', { scale: 1.4, field: 1, angle: side ? 90 : 180, max: 120 }, ['ink']), band, { name: 'Halftone field', opacity: 0.5 }));
      }
      // the accent block the headline crosses into: beside the photograph, never on it
      const hb = side ? { x: x.m, y: x.H * 0.16, w: band.x - x.m + x.u * 2, h: x.H * 0.34 } : { x: x.m, y: band.h + x.u * 4, w: x.W - x.m * 2, h: x.H * 0.24 };
      let fill = x.accent;
      for (let i = 0; i < 6 && onLarge(x, x.ink, fill) !== x.ink; i++) fill = mix(fill, x.ground, 0.25);
      const ab = side ? { x: x.m * 0.5, y: hb.y + hb.h * 0.42, w: hb.w * 0.36, h: x.H * 0.34 } : { x: 0, y: band.h, w: x.W * 0.38, h: x.H * 0.3 };
      out.push(block(k, x, ab, fill, { name: 'Accent block' }));
      const t = head(k, x, hb, { italic: true });
      out.push(t);
      const ry = Math.max(t.y + t.h, ab.y + ab.h) + x.u * 3;
      out.push(k.rule(x, { x: x.m, y: ry, w: (side ? band.x : x.W) - x.m * 2 }, x.ink, Math.max(1, x.u * 0.15)));
      const colW = side ? (band.x - x.m * 2) * 0.62 : (x.W - x.m * 2) * 0.42;
      out.push(
        ...details(
          k,
          x,
          {
            x: side ? x.m : x.W - x.m - colW,
            y: ry + x.u * 3,
            w: colW,
            h: x.H - ry - x.u * 3 - x.m,
          },
          { scale: 0.88, subStyle: { italic: true } },
        ),
      );
      return out;
    },
  };
}
