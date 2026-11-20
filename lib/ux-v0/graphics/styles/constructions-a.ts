// lib/ux-v0/graphics/styles/constructions-a.ts — the first twenty style constructions (see schema.ts CONSTRUCTIONS).
// Each organises a frame its own way; the style's palette and faces arrive as the direction's tokens, its shapes,
// textures and intensities through x.style. Every word is the designer's; nothing here invents copy.

import { contrastRatio } from '../../../ux/audit';
import { ensureContrast } from '../../spec';
import type { Ctx, Kit } from '../compose';
import { newId, type Node, type TextNode } from '../doc';
import { CHROME } from './apply';
import {
  a3,
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
  P,
  panelAround,
  pathNode,
  picture,
  rand,
  readable,
  small,
  textHeight,
  variant,
  type Layout,
} from './constructions-kit';

export function layoutsA(k: Kit): Record<string, Layout> {
  const stroke = (x: Ctx, color: string, w = x.u * 0.4) => ({
    stroke: { color, width: Math.max(1, w), join: 'round', cap: 'round' },
  });
  /** The web's own vernacular, unstyled: a document in the default flow (Digital Brutalism). */
  const rawDocument = (x: Ctx): Node[] => {
    const out: Node[] = [];
    // the web's own vernacular, unstyled: a document in the default flow — a heading, a rule, a link, a table
    const L = land(x);
    const Wd = x.W - x.m * 2;
    const hair = Math.max(1, x.u * 0.12);
    const c = x.brief.content;
    const t = head(k, x, {
      x: x.m,
      y: x.m,
      w: L ? Wd * 0.62 : Wd,
      h: x.H * (L ? 0.38 : 0.36),
    });
    t.h = Math.min(t.h, textHeight(x, t) + x.u * 2);
    out.push(t);
    let y = t.y + t.h + x.u * 3;
    out.push(block(k, x, { x: x.m, y, w: Wd, h: hair }, x.ink, { name: 'Rule' }));
    y += x.u * 4;
    if (c.subhead) {
      const sb = k.text(
        x,
        'subhead',
        c.subhead,
        { x: x.m, y, w: Wd * 0.8, h: x.u * 8 },
        {
          size: mid(k, x, 1.15),
          color: x.accent,
          decoration: 'underline',
          autoHeight: true,
        },
      );
      out.push(sb);
      y += x.u * 9;
    }
    // the details as the rows of a bordered table
    const size = small(k, x, 1.05);
    const rowH = size * 2.4;
    const tw = L ? Wd * 0.5 : Wd * 0.72;
    for (const line of k.metaLines(x)) {
      out.push(
        block(k, x, { x: x.m, y, w: tw, h: rowH }, null, {
          name: 'Table cell',
          stroke: { color: x.ink, width: hair, join: 'miter' },
        }),
      );
      out.push(
        k.text(
          x,
          'meta',
          line,
          {
            x: x.m + x.u * 1.5,
            y: y + (rowH - size * 1.3) / 2,
            w: tw - x.u * 3,
            h: size * 1.3,
          },
          { size, font: x.dir.tokens.fonts.body },
        ),
      );
      y += rowH - hair;
    }
    y += x.u * 5;
    const img = picture(
      k,
      x,
      L
        ? {
            x: x.m + Wd * 0.66,
            y: t.y + t.h + x.u * 8,
            w: Wd * 0.34,
            h: x.H * 0.5,
          }
        : {
            x: x.m,
            y,
            w: Wd * 0.5,
            h: Math.max(x.u * 10, Math.min(x.H * 0.22, x.H - y - x.m - x.u * 8)),
          },
      null,
      { stroke: { color: x.ink, width: hair } },
    );
    if (img) {
      out.push(img);
      if (!L) y = img.y + img.h + x.u * 4;
    }
    out.push(...details(k, x, { x: x.m, y, w: Wd * 0.6, h: Math.max(x.u * 6, x.H - y - x.m) }, { sub: false, meta: false, color: x.accent }));
    return out;
  };
  return {
    'grid-columns': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const col = (x.W - x.m * 2) / 12;
      const lineC = mix(x.ink, x.ground, 0.82);
      if (v === 'dutch')
        out.push(
          P(
            k,
            x,
            'grid',
            {
              cols: 6,
              rows: Math.max(4, Math.round((6 * (x.H - x.m * 2)) / (x.W - x.m * 2))),
            },
            { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H - x.m * 2 },
            lineC,
            { name: 'Grid', opacity: 0.9 },
          ),
        );
      else if (v === 'classic') for (let i = 0; i <= 4; i++) out.push(block(k, x, { x: x.m + i * col * 3 - 0.5, y: x.m, w: 1, h: x.H - x.m * 2 }, lineC, { name: 'Grid line' }));
      // the one structural colour
      if (v === 'bigtype' || v === 'corporate')
        out.push(
          block(
            k,
            x,
            {
              x: 0,
              y: x.H * (v === 'bigtype' ? 0.6 : 0.7),
              w: x.W,
              h: x.H * (v === 'bigtype' ? 0.4 : 0.3),
            },
            x.accent,
            { name: 'Field' },
          ),
        );
      if (v === 'dutch') {
        // three cells of primary colour, below the headline and clear of the details
        const cell = (x.W - x.m * 2) / 6;
        const rowsMax = Math.floor((x.H - x.m * 2) / cell);
        const r0 = Math.min(rowsMax - 2, Math.ceil((x.u * 2 + x.H * (L ? 0.5 : 0.28)) / cell));
        const cells: [number, number, string][] = L
          ? x.brief.images[0]
            ? []
            : [
                [4, 0, x.accent],
                [5, 1, x.accent2],
              ]
          : [
              [0, r0, x.accent],
              [1, r0 + 1, x.accent2],
              [2, r0, a3(x)],
            ];
        for (const [cx, cy, f] of cells) if (cy >= 0) out.push(block(k, x, { x: x.m + cx * cell, y: x.m + cy * cell, w: cell, h: cell }, f, { name: 'Cell' }));
      }
      const img = picture(k, x, L ? { x: x.m + col * 7, y: x.m, w: col * 5, h: x.H * 0.62 } : { x: x.m, y: x.H * 0.38, w: x.W - x.m * 2, h: x.H * 0.3 });
      if (img && v !== 'bigtype') out.push(img);
      else if (v === 'classic' || v === 'nordic') {
        const m0 = motifs(x)[0] ?? 'circle';
        const d = col * (v === 'nordic' ? 4 : 6);
        out.push(P(k, x, m0 === 'line' ? 'circle' : m0, { start: -90, sweep: 270 }, { x: x.W - x.m - d, y: x.H * (L ? 0.15 : 0.4), w: d, h: d }, v === 'nordic' ? mix(x.accent, x.ground, 0.55) : x.accent, { name: 'Mark' }));
      } else if (v === 'corporate') out.push(P(k, x, 'sector', { start: 0, sweep: 270 }, { x: x.m, y: x.m, w: col * 2.2, h: col * 2.2 }, x.accent, { name: 'Mark' }));
      const top = v === 'corporate' ? x.m + col * 3 : x.m + x.u * 2;
      const hw = L ? col * 7 : v === 'nordic' ? col * 9 : col * 11.5;
      const hh = v === 'bigtype' ? x.H * 0.5 : L ? x.H * 0.5 : x.H * 0.28;
      const h = head(
        k,
        x,
        {
          x: x.m,
          y: v === 'nordic' && img ? x.H * 0.7 : top,
          w: hw,
          h: v === 'nordic' && img ? x.H * 0.12 : hh,
        },
        v === 'bigtype' ? { lineHeight: 0.82 } : {},
      );
      if (v === 'bigtype') k.treat(x, h, 'stacked');
      out.push(h);
      const fieldTop = v === 'bigtype' ? x.H * 0.6 : v === 'corporate' ? x.H * 0.7 : null;
      const infoColor = fieldTop !== null ? on(x, x.accent) : x.ink;
      const infoBox =
        fieldTop !== null
          ? {
              x: x.m,
              y: fieldTop + x.u * 3,
              w: L ? col * 7 : col * 8,
              h: x.H - fieldTop - x.u * 3 - x.m,
            }
          : L
            ? {
                x: x.m + col * 7.6,
                y: x.H * 0.7,
                w: col * 4.4,
                h: x.H * 0.3 - x.m,
              }
            : {
                x: x.m + col * 6,
                y: Math.max(h.y + h.h + x.u * 3, x.H * 0.72),
                w: col * 6,
                h: x.H - Math.max(h.y + h.h + x.u * 3, x.H * 0.72) - x.m,
              };
      out.push(...details(k, x, infoBox, { color: infoColor }));
      return out;
    },

    'bauhaus-asym': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const d = Math.min(x.W, x.H) * 0.62;
      // the headline turned up the left edge when it is short enough, else set flush at the foot
      const words = x.brief.content.headline;
      const turned = words.length <= 22 && !L && v !== 'abstract';
      const colW = x.u * 13;
      const left = turned ? x.m + colW + x.u * 3 : x.m;
      // wide formats: the words in a column on the left, the figures on the right half, so neither crosses the other
      const fieldX = x.W * 0.52;
      if (v === 'abstract') {
        // a modular field of halves and quarters: six cells, each a primitive turned by the grid (on the right half
        // when the format is wide, sized to its height)
        const cw = L ? Math.min((x.W - x.m - fieldX) / 3, (x.H - x.m * 2) / 2) : (x.W - x.m * 2) / 3;
        const x0 = L ? x.W - x.m - cw * 3 : x.m;
        const y0 = L ? (x.H - cw * 2) / 2 : x.m;
        const kinds = ['sector', 'circle', 'sector', 'crescent', 'rounded-rect', 'sector'];
        const fills = [x.accent, x.accent2, a3(x), x.ink, x.accent, x.accent2];
        for (let i = 0; i < 6; i++)
          out.push(
            P(
              k,
              x,
              kinds[i],
              { start: (i % 4) * 90, sweep: 180, phase: 40, radius: 0 },
              {
                x: x0 + (i % 3) * cw,
                y: y0 + Math.floor(i / 3) * cw,
                w: cw,
                h: cw,
              },
              fills[i],
              { name: 'Module' },
            ),
          );
      } else if (L) {
        // the circle, the square and the triangle overlapping one another on the right half, never the words
        const dd = x.H * 0.6;
        const img = picture(k, x, { x: x.W - x.m - dd, y: x.m, w: dd, h: dd }, 'circle');
        out.push(img ?? ellipse(x, { x: x.W - x.m - dd * 0.92, y: x.m, w: dd, h: dd }, x.accent, { name: 'Circle' }));
        out.push(block(k, x, { x: fieldX, y: x.H * 0.4, w: dd * 0.55, h: dd * 0.55 }, x.accent2, { name: 'Square', blend: 'multiply' }));
        out.push(P(k, x, 'triangle', { apex: 50 }, { x: fieldX + dd * 0.42, y: x.H - x.m - dd * 0.5, w: dd * 0.56, h: dd * 0.5 }, a3(x), { name: 'Triangle', rotation: v === 'constructivist' ? -18 : 0 }));
      } else {
        const img = picture(k, x, { x: x.W - x.m - d, y: x.m, w: d, h: d }, 'circle');
        out.push(img ?? ellipse(x, { x: x.W - x.m - d * 0.92, y: x.m, w: d, h: d }, x.accent, { name: 'Circle' }));
        out.push(block(k, x, { x: left, y: x.H * 0.34, w: d * 0.6, h: d * 0.6 }, x.accent2, { name: 'Square', blend: 'multiply' }));
        out.push(
          P(
            k,
            x,
            'triangle',
            { apex: 50 },
            {
              x: Math.max(left + d * 0.36, x.W * 0.44),
              y: x.H * 0.5,
              w: d * 0.46,
              h: d * 0.4,
            },
            a3(x),
            { name: 'Triangle', rotation: v === 'constructivist' ? -18 : 0 },
          ),
        );
        out.push(
          block(
            k,
            x,
            {
              x: left,
              y: x.H * 0.64,
              w: x.W * 0.74 - (left - x.m),
              h: x.u * 2.4,
            },
            x.ink,
            { name: 'Bar', rotation: v === 'constructivist' ? -12 : 0 },
          ),
        );
      }
      if (turned) {
        const len = x.H * 0.62;
        const t = head(k, x, { x: x.m, y: x.H * 0.06, w: len, h: colW });
        t.rotation = -90;
        // a turned box rotates about its centre: put the centre against the left edge
        t.x = x.m + t.h / 2 - len / 2;
        t.y = x.H * 0.06 + len / 2 - t.h / 2;
        out.push(t);
        out.push(
          ...details(k, x, {
            x: Math.max(left, x.W * 0.42),
            y: x.H * 0.72,
            w: x.W - Math.max(left, x.W * 0.42) - x.m,
            h: x.H * 0.28 - x.m,
          }),
        );
      } else if (L) {
        // a column: the headline at the top, the bar beneath its last line, the details beneath the bar
        const cw = fieldX - x.m - x.u * 3;
        const t = head(k, x, { x: x.m, y: x.m + x.u, w: cw, h: x.H * 0.42 });
        t.h = Math.min(t.h, textHeight(x, t) + x.u);
        out.push(t);
        let y = t.y + t.h + x.u * 2;
        if (v !== 'abstract') {
          out.push(block(k, x, { x: x.m, y, w: cw * 0.86, h: x.u * 2.4 }, x.ink, { name: 'Bar' }));
          y += x.u * 2.4 + x.u * 2.4;
        }
        out.push(...details(k, x, { x: x.m, y, w: cw, h: x.H - y - x.m }));
      } else {
        const t = head(k, x, {
          x: x.m,
          y: x.H * (v === 'abstract' ? 0.68 : 0.7),
          w: x.W * 0.8,
          h: x.H * 0.14,
        });
        out.push(t);
        out.push(
          ...details(k, x, {
            x: x.m,
            y: t.y + t.h + x.u * 2,
            w: x.W * 0.6,
            h: x.H - t.y - t.h - x.u * 2 - x.m,
          }),
        );
      }
      return out;
    },

    neoplastic: (x) => {
      const out: Node[] = [];
      const xs = [x.W * between(x, 'v1', 0.26, 0.34), x.W * between(x, 'v2', 0.66, 0.76)];
      const ys = [x.H * between(x, 'h1', 0.18, 0.24), x.H * between(x, 'h2', 0.56, 0.62), x.H * between(x, 'h3', 0.8, 0.86)];
      const bar = [x.u * 2.4, x.u * 1.4, x.u * 1.8];
      // colour planes in three cells, the picture in a fourth when there is one
      out.push(
        block(k, x, { x: 0, y: 0, w: xs[0], h: ys[0] }, x.accent, {
          name: 'Red plane',
        }),
      );
      out.push(block(k, x, { x: xs[1], y: ys[1], w: x.W - xs[1], h: ys[2] - ys[1] }, x.accent2, { name: 'Blue plane' }));
      out.push(
        block(k, x, { x: 0, y: ys[2], w: xs[0], h: x.H - ys[2] }, a3(x), {
          name: 'Yellow plane',
        }),
      );
      const img = picture(k, x, { x: xs[1], y: 0, w: x.W - xs[1], h: ys[0] });
      if (img) out.push(img);
      out.push(
        block(k, x, { x: xs[0] - bar[0] / 2, y: 0, w: bar[0], h: x.H }, x.ink, {
          name: 'Bar',
        }),
      );
      out.push(block(k, x, { x: xs[1] - bar[1] / 2, y: 0, w: bar[1], h: ys[2] }, x.ink, { name: 'Bar' }));
      out.push(
        block(k, x, { x: 0, y: ys[0] - bar[2] / 2, w: x.W, h: bar[2] }, x.ink, {
          name: 'Bar',
        }),
      );
      out.push(block(k, x, { x: xs[0], y: ys[1] - bar[1] / 2, w: x.W - xs[0], h: bar[1] }, x.ink, { name: 'Bar' }));
      out.push(
        block(k, x, { x: 0, y: ys[2] - bar[0] / 2, w: x.W, h: bar[0] }, x.ink, {
          name: 'Bar',
        }),
      );
      // the words in the white cells
      const cx = xs[0] + bar[0];
      const t = head(k, x, {
        x: cx + x.u * 2,
        y: ys[0] + bar[2] + x.u * 2,
        w: xs[1] - cx - x.u * 4,
        h: ys[1] - ys[0] - bar[2] - x.u * 4,
      });
      k.treat(x, t, 'stacked');
      out.push(t);
      out.push(
        ...details(
          k,
          x,
          {
            x: cx + x.u * 2,
            y: ys[1] + bar[1] + x.u * 2,
            w: xs[1] - cx - x.u * 4,
            h: ys[2] - ys[1] - bar[1] - x.u * 3,
          },
          { brand: false },
        ),
      );
      if (x.brief.content.brand)
        out.push(
          k.text(
            x,
            'logo',
            x.brief.content.brand,
            {
              x: xs[0] + bar[0] + x.u * 2,
              y: ys[2] + bar[0] + x.u * 2,
              w: x.W - xs[0] - x.u * 6,
              h: x.H - ys[2] - bar[0] - x.u * 4,
            },
            { size: small(k, x, 1.2), weight: 700, case: 'none' },
          ),
        );
      return out;
    },

    'diagonal-dynamic': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const ang = v === 'speed' ? -12 : v === 'parole' ? -18 : -24;
      if (v === 'speed' || v === 'kinetic') {
        out.push(P(k, x, 'rays', { rays: 64, inner: 6, jitter: 50, seed: x.seed % 99 }, { x: -x.W * 0.4, y: x.H * 0.05, w: x.W * 1.3, h: x.W * 1.3 }, mix(x.ink, x.ground, 0.55), { name: 'Force lines', opacity: 0.8 }));
        for (let i = 0; i < 3; i++)
          out.push(
            P(
              k,
              x,
              'chevron',
              { depth: 40, notch: 40 },
              {
                x: x.W * (0.58 + i * 0.1),
                y: x.H * 0.16,
                w: x.u * 10,
                h: x.u * 12,
              },
              i === 0 ? x.accent : mix(x.accent, x.ground, 0.3 + i * 0.25),
              { name: 'Chevron' },
            ),
          );
      } else if (v === 'parole') {
        out.push(P(k, x, 'rays', { rays: 40, inner: 0, jitter: 70, seed: x.seed % 97 }, { x: x.W * 0.15, y: x.H * 0.1, w: x.W * 0.9, h: x.W * 0.9 }, mix(x.accent, x.ground, 0.25), { name: 'Radiating lines' }));
      } else {
        out.push(P(k, x, 'triangle', { apex: 0 }, { x: -x.W * 0.05, y: x.H * 0.28, w: x.W * 1.1, h: x.H * 0.5 }, x.accent, { name: 'Wedge', rotation: ang / 2 }));
        out.push(
          ellipse(x, { x: x.m, y: x.m, w: x.u * 20, h: x.u * 20 }, x.ink, {
            name: 'Circle',
          }),
        );
        out.push(block(k, x, { x: -x.W * 0.1, y: x.H * 0.6, w: x.W * 1.2, h: x.u * 3 }, x.ink, { name: 'Bar', rotation: ang }));
      }
      const img = picture(k, x, { x: x.W * 0.48, y: x.H * 0.06, w: x.W * 0.46, h: x.H * 0.36 }, v === 'constructivist' ? 'parallelogram' : null, { rotation: ang / 3 });
      if (img) out.push(img);
      const t = head(
        k,
        x,
        {
          x: x.W * 0.04,
          y: x.H * (L ? 0.36 : 0.38),
          w: x.W * 0.92,
          h: x.H * 0.2,
        },
        { rotation: ang },
      );
      if (v === 'parole') {
        mixedFaces(t, x.style?.faces.alt ?? [], [x.accent, x.ink]);
        t.warp = { kind: 'stagger', amount: 45 };
      } else if (v === 'speed') t.warp = { kind: 'rise', amount: 30 };
      // the words cross the wedge and the ground: the wedge takes the shade of its colour the headline reads on, so one
      // colour serves both (a mid-tone accent on a dark ground would otherwise leave no colour that reads on both)
      const wedge = out.find((n) => n.name === 'Wedge');
      if (wedge && wedge.type === 'shape' && typeof wedge.fill === 'string' && contrastRatio(t.color, wedge.fill) < 3.2) wedge.fill = ensureContrast(wedge.fill, t.color, 3.2);
      out.push(t);
      // the details read straight, in a block of their own
      const sub = x.brief.content.subhead;
      if (sub && v === 'parole')
        out.push(
          k.text(
            x,
            'subhead',
            sub,
            { x: x.m, y: x.H * 0.66, w: x.W * 0.6, h: x.u * 9 },
            {
              size: mid(k, x, 1.1),
              rotation: 8,
              font: x.style?.faces.alt[0] ?? x.dir.tokens.fonts.body,
              color: x.accent,
            },
          ),
        );
      out.push(
        ...details(
          k,
          x,
          {
            x: x.W * 0.46,
            y: x.H * 0.74,
            w: x.W * 0.54 - x.m,
            h: x.H * 0.26 - x.m,
          },
          { sub: v !== 'parole' },
        ),
      );
      return out;
    },

    'nouveau-arch': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const inset = x.m * 0.5;
      const frameC = x.ink;
      const panel = {
        x: x.m,
        y: x.m * 1.1,
        w: x.W - x.m * 2,
        h: x.H * (v === 'secession' ? 0.56 : 0.66),
      };
      if (v === 'secession') {
        // a square panel framed twice, a checker band, stylised plants set symmetrically in a grid
        out.push(
          block(k, x, panel, mix(x.accent2, x.ground, 0.78), {
            name: 'Panel',
            ...stroke(x, frameC, x.u * 0.3),
          }),
        );
        out.push(k.patternNode(x, k.pdef('checker', { scale: 2.2 }, ['ink', 'ground']), { x: panel.x, y: panel.y, w: panel.w, h: x.u * 4.4 }, { name: 'Checker band' }));
        const cs = Math.min(panel.w, panel.h) / 3.4;
        for (let i = 0; i < 3; i++) {
          const cxp = panel.x + panel.w / 2 + (i - 1) * cs * 1.05 - cs / 2;
          out.push(ellipse(x, { x: cxp, y: panel.y + panel.h * 0.32, w: cs, h: cs }, i === 1 ? x.accent : mix(x.accent, x.ground, 0.45), { name: 'Flower' }));
          out.push(
            P(
              k,
              x,
              'leaf',
              { width: 45, bend: 0 },
              {
                x: cxp + cs * 0.3,
                y: panel.y + panel.h * 0.32 + cs * 0.9,
                w: cs * 0.4,
                h: cs * 0.9,
              },
              x.accent2,
              { name: 'Leaf' },
            ),
          );
        }
      } else {
        out.push(
          pathNode(x, panel, ARCH, mix(x.accent2, x.ground, 0.72), {
            name: 'Arch',
            ...stroke(x, frameC, x.u * 0.35),
          }),
        );
        const hd = panel.w * 0.62;
        const hx = x.W / 2 - hd / 2;
        const hy = panel.y + panel.h * 0.16;
        out.push(
          P(
            k,
            x,
            'wavy-circle',
            { waves: 24, amplitude: 4 },
            {
              x: hx - hd * 0.06,
              y: hy - hd * 0.06,
              w: hd * 1.12,
              h: hd * 1.12,
            },
            mix(a3(x), x.ground, 0.25),
            { name: 'Halo' },
          ),
        );
        const img = picture(k, x, { x: hx, y: hy, w: hd, h: hd }, 'circle');
        out.push(
          img ??
            P(
              k,
              x,
              'spiral',
              { turns: 4, growth: 0 },
              {
                x: hx + hd * 0.18,
                y: hy + hd * 0.18,
                w: hd * 0.64,
                h: hd * 0.64,
              },
              x.accent,
              { name: 'Medallion' },
            ),
        );
        // tendrils climbing both sides of the arch, mirrored
        const tw = panel.w * 0.24;
        const th = panel.h * 0.62;
        out.push(P(k, x, 'fluid-curve', { seed: (x.seed % 50) + 3, points: 6, sweep: 80 }, { x: panel.x - tw * 0.1, y: panel.y + panel.h * 0.3, w: tw, h: th }, x.accent2, { name: 'Tendril', ...stroke(x, x.accent2, x.u * 0.55) }));
        out.push(
          P(
            k,
            x,
            'fluid-curve',
            { seed: (x.seed % 50) + 3, points: 6, sweep: 80 },
            {
              x: panel.x + panel.w - tw * 0.9,
              y: panel.y + panel.h * 0.3,
              w: tw,
              h: th,
            },
            x.accent2,
            {
              name: 'Tendril',
              flipX: true,
              ...stroke(x, x.accent2, x.u * 0.55),
            },
          ),
        );
        for (const side of [0, 1])
          out.push(
            P(
              k,
              x,
              'leaf',
              { width: 50, bend: side ? -20 : 20 },
              {
                x: side ? panel.x + panel.w - x.u * 12 : panel.x + x.u * 3,
                y: panel.y + panel.h - x.u * 22,
                w: x.u * 9,
                h: x.u * 18,
              },
              x.accent,
              { name: 'Leaf', rotation: side ? 20 : -20 },
            ),
          );
      }
      out.push(...border(k, x, 'frame', frameC, inset));
      // the cartouche holding the words, centred under the panel
      const cy = panel.y + panel.h + x.u * 2;
      const cart = {
        x: x.m * 1.4,
        y: cy,
        w: x.W - x.m * 2.8,
        h: x.H - cy - x.m * 1.1,
      };
      out.push(
        block(k, x, cart, mix(x.ground, '#ffffff', 0.25), {
          name: 'Cartouche',
          radius: x.u * 3,
          ...stroke(x, frameC, x.u * 0.3),
        }),
      );
      const t = head(
        k,
        x,
        {
          x: cart.x + x.u * 3,
          y: cart.y + x.u * 2,
          w: cart.w - x.u * 6,
          h: cart.h * 0.48,
        },
        { align: 'center' },
      );
      out.push(t);
      out.push(
        ...details(
          k,
          x,
          {
            x: cart.x + x.u * 3,
            y: t.y + t.h + x.u * 1.5,
            w: cart.w - x.u * 6,
            h: cart.y + cart.h - t.y - t.h - x.u * 3,
          },
          { align: 'center', scale: 0.9 },
        ),
      );
      return out;
    },

    'deco-axial': (x) => {
      const out: Node[] = [];
      const cx = x.W / 2;
      const gold = x.style?.vocab.gradient ?? x.accent;
      const fanY = x.H * 0.7;
      out.push(
        P(
          k,
          x,
          'rays',
          { rays: 48, inner: 14, jitter: 0, seed: 1 },
          {
            x: cx - x.W * 0.62,
            y: fanY - x.W * 0.62,
            w: x.W * 1.24,
            h: x.W * 1.24,
          },
          x.accent,
          { name: 'Sunburst', opacity: 0.85 },
        ),
      );
      out.push(
        block(k, x, { x: 0, y: fanY, w: x.W, h: x.H - fanY }, x.ground, {
          name: 'Ground below the fan',
        }),
      );
      // the ziggurat rising on the axis
      for (let i = 0; i < 4; i++) {
        const w = x.W * (0.5 - i * 0.1);
        const h = x.u * 4;
        out.push(block(k, x, { x: cx - w / 2, y: fanY - (i + 1) * h, w, h: h + 1 }, i % 2 ? mix(x.accent, x.ground, 0.25) : gold, { name: 'Step' }));
      }
      const img = picture(k, x, { x: cx - x.W * 0.2, y: x.H * 0.36, w: x.W * 0.4, h: x.H * 0.22 }, null, { stroke: { color: x.accent, width: Math.max(1, x.u * 0.4) } });
      if (img) out.push(img);
      out.push(...border(k, x, 'stepped', x.accent));
      for (const side of [-1, 1])
        out.push(
          P(
            k,
            x,
            'chevron',
            { depth: 45, notch: 45 },
            {
              x: cx + side * x.W * 0.2 - x.u * 4,
              y: x.H * 0.31,
              w: x.u * 8,
              h: x.u * 6,
            },
            x.accent,
            { name: 'Chevron', rotation: 90 * side },
          ),
        );
      const t = head(k, x, { x: x.m * 1.6, y: x.m * 1.9, w: x.W - x.m * 3.2, h: x.H * 0.22 }, { align: 'center' });
      out.push(t);
      out.push(k.rule(x, { x: cx - x.W * 0.15, y: t.y + t.h + x.u * 1.5, w: x.W * 0.3 }, x.accent, Math.max(1, x.u * 0.3)));
      out.push(
        ...details(
          k,
          x,
          {
            x: x.m * 1.8,
            y: fanY + x.u * 3,
            w: x.W - x.m * 3.6,
            h: x.H - fanY - x.u * 3 - x.m * 1.6,
          },
          {
            align: 'center',
            subStyle: { case: 'upper', tracking: 160 },
            metaStyle: { tracking: 120 },
          },
        ),
      );
      return out;
    },

    playbill: (x) => {
      const out: Node[] = [];
      const v = variant(x);
      out.push(...border(k, x, 'ornate', x.ink));
      const c = x.brief.content;
      const w = x.W - x.m * 2.6;
      const left = x.m * 1.3;
      let y = x.m * 1.9;
      const alt = x.style?.faces.alt ?? [];
      if (c.brand) {
        const b = k.text(
          x,
          'logo',
          c.brand.toUpperCase(),
          { x: left, y, w, h: x.u * 5 },
          {
            size: small(k, x, 1.15),
            align: 'center',
            tracking: 220,
            weight: 700,
            case: 'none',
            font: x.dir.tokens.fonts.body,
          },
        );
        out.push(b);
        y += b.h + x.u * 2;
      }
      const star = (yy: number) => {
        out.push(k.rule(x, { x: left + w * 0.12, y: yy, w: w * 0.32 }, x.ink, Math.max(1, x.u * 0.25)));
        out.push(P(k, x, 'star', { points: 5, inner: 45 }, { x: x.W / 2 - x.u * 2, y: yy - x.u * 2, w: x.u * 4, h: x.u * 4 }, x.accent, { name: 'Star' }));
        out.push(k.rule(x, { x: left + w * 0.56, y: yy, w: w * 0.32 }, x.ink, Math.max(1, x.u * 0.25)));
      };
      star(y + x.u * 1.5);
      y += x.u * 5;
      const img = picture(k, x, { x: x.W / 2 - x.W * 0.18, y: x.H * 0.5, w: x.W * 0.36, h: x.H * 0.17 }, 'ellipse');
      const t = head(k, x, { x: left, y, w, h: x.H * (img ? 0.26 : 0.32) }, { align: 'center', color: x.accent });
      mixedFaces(t, alt.slice(0, 2), [x.ink]);
      t.h = Math.min(t.h, textHeight(x, t) + x.u * 2);
      out.push(t);
      y = t.y + t.h + x.u * 2;
      if (img) {
        out.push(
          ellipse(
            x,
            {
              x: img.x - x.u,
              y: img.y - x.u,
              w: img.w + x.u * 2,
              h: img.h + x.u * 2,
            },
            null,
            { name: 'Oval', ...stroke(x, x.ink, x.u * 0.3) },
          ),
        );
        out.push(img);
        y = img.y + img.h + x.u * 3;
      }
      // the rest of the bill from the foot up, a star rule under it; an engraved device in whatever room is left
      const footY = x.H - x.m * 1.9;
      const rest = details(
        k,
        x,
        { x: left, y, w, h: footY - x.u * 4 - y },
        {
          align: 'center',
          brand: false,
          fromFoot: true,
          subStyle: {
            italic: true,
            font: x.dir.tokens.fonts.body,
            color: v === 'vintage' ? on(x, x.accent2) : x.ink,
          },
          metaStyle: { case: 'upper', tracking: 160, weight: 700 },
        },
      );
      const restTop = rest.length ? Math.min(...rest.map((n) => n.y)) : footY;
      const sub0 = rest.find((n) => (n as TextNode).role === 'subhead');
      if (v === 'vintage' && sub0)
        out.push(
          P(
            k,
            x,
            'ribbon',
            { seed: 4, twists: 1, amplitude: 10, thickness: 40, taper: 20 },
            {
              x: left + w * 0.05,
              y: sub0.y - x.u * 2,
              w: w * 0.9,
              h: sub0.h + x.u * 4,
            },
            x.accent2,
            { name: 'Banner' },
          ),
        );
      if (!img && restTop - y > x.H * 0.16)
        out.push(
          ...medallion(
            k,
            x,
            {
              x: left + w * 0.2,
              y: y + x.u * 2,
              w: w * 0.6,
              h: restTop - y - x.u * 6,
            },
            'rosette',
            x.ink,
            x.accent,
          ),
        );
      out.push(...rest);
      star(footY);
      return out;
    },

    'masthead-columns': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const c = x.brief.content;
      const W = x.W - x.m * 2;
      const meta = k.metaLines(x);
      const asset = x.brief.images[0];
      const thin = Math.max(1, x.u * 0.25);
      let y = x.m;
      if (v === 'newspaper') {
        // a front page: the rules, a nameplate when there is a name, the dateline from the brief, a banner headline
        out.push(k.rule(x, { x: x.m, y, w: W }, x.ink, x.u * 0.9));
        out.push(k.rule(x, { x: x.m, y: y + x.u * 1.6, w: W }, x.ink, thin));
        y += x.u * 3;
        if (c.brand) {
          const nameplate = k.text(
            x,
            'logo',
            c.brand,
            { x: x.m, y, w: W, h: x.H * 0.09 },
            {
              align: 'center',
              font: x.dir.tokens.fonts.display,
              case: 'none',
              weight: 400,
            },
          );
          out.push(nameplate);
          y = nameplate.y + nameplate.h + x.u;
        }
        out.push(k.rule(x, { x: x.m, y, w: W }, x.ink, thin));
        if (meta[0]) out.push(k.text(x, 'meta', meta[0], { x: x.m, y: y + x.u * 0.8, w: W / 2, h: x.u * 4 }, { size: small(k, x), case: 'upper', tracking: 80 }));
        if (meta[1])
          out.push(
            k.text(
              x,
              'meta',
              meta.slice(1).join('  ·  '),
              { x: x.m + W / 2, y: y + x.u * 0.8, w: W / 2, h: x.u * 4 },
              {
                size: small(k, x),
                case: 'upper',
                tracking: 80,
                align: 'right',
              },
            ),
          );
        y += x.u * 5;
        out.push(k.rule(x, { x: x.m, y, w: W }, x.ink, thin));
        y += x.u * 2.5;
        const groupFrom = out.length;
        const groupTop = y;
        const t = head(k, x, { x: x.m, y, w: W, h: x.H * (asset ? 0.2 : 0.46) }, { align: 'center' });
        if (!asset) k.treat(x, t, 'stacked');
        t.h = Math.min(t.h, textHeight(x, t) + x.u * 2);
        out.push(t);
        y = t.y + t.h + x.u * 2;
        out.push(k.rule(x, { x: x.m, y, w: W }, x.ink, x.u * 0.6));
        out.push(k.rule(x, { x: x.m, y: y + x.u * 1.2, w: W }, x.ink, thin));
        y += x.u * 4;
        if (asset) {
          // a deck in the first column, the photograph across the other two
          const cw = (W - x.u * 4) / 3;
          out.push(block(k, x, { x: x.m + cw + x.u, y, w: 1, h: x.H - y - x.m * 1.4 }, mix(x.ink, x.ground, 0.6), { name: 'Column rule' }));
          out.push({
            ...k.image(x, asset, {
              x: x.m + cw + x.u * 2,
              y,
              w: cw * 2 + x.u * 2,
              h: (x.H - y - x.m) * 0.7,
            }),
            effects: fx(k, x, 'halftone', { size: 4 }),
          } as Node);
          out.push(
            ...details(
              k,
              x,
              { x: x.m, y, w: cw, h: x.H - y - x.m },
              {
                meta: false,
                subStyle: { italic: true, font: x.dir.tokens.fonts.body },
              },
            ),
          );
        } else {
          out.push(
            ...details(
              k,
              x,
              { x: x.m + W * 0.1, y, w: W * 0.8, h: x.H - y - x.m },
              {
                meta: false,
                align: 'center',
                scale: 1.25,
                subStyle: { italic: true, font: x.dir.tokens.fonts.body },
              },
            ),
          );
          // a front page with no photograph: the banner and its deck centred in the page below the dateline
          const group = out.slice(groupFrom);
          const end = Math.max(...group.map((n) => n.y + n.h));
          const shift = Math.max(0, (x.H - x.m - end) / 2 - x.u);
          if (shift > 0) for (const n of group) n.y += shift;
          if (shift > x.u * 8) out.push(k.rule(x, { x: x.m, y: x.H - x.m, w: W }, x.ink, thin), k.rule(x, { x: x.m, y: groupTop + shift - x.u * 2, w: W }, x.ink, thin));
        }
        return out;
      }
      // a title band of the accent, the headline knocked out of it; columns under it
      const band = { x: 0, y: 0, w: x.W, h: x.H * 0.3 };
      out.push(block(k, x, band, x.accent, { name: 'Title band' }));
      const t = head(k, x, { x: x.m, y: x.m, w: W, h: band.h - x.m * 1.4 }, { color: on(x, x.accent) });
      if (v === 'mono') k.treat(x, t, 'italic-mix');
      out.push(t);
      y = band.h + x.u * 3;
      const cw = (W - x.u * 4) / 3;
      for (let i = 1; i < 3; i++)
        out.push(
          block(
            k,
            x,
            {
              x: x.m + i * (cw + x.u * 2) - x.u,
              y,
              w: 1,
              h: x.H - y - x.m * 1.4,
            },
            mix(x.ink, x.ground, 0.6),
            { name: 'Column rule' },
          ),
        );
      const fig = {
        x: x.m + cw + x.u * 2,
        y,
        w: cw * 2 + x.u * 2,
        h: (x.H - y - x.m) * 0.62,
      };
      const img = picture(k, x, fig);
      if (img) out.push(img);
      else {
        // no photograph: a geometric figure of the period across the two columns (a quarter disc, a bar, a square)
        const tint = (c0: string) => (v === 'mono' ? mix(c0, x.ground, 0.35) : c0);
        const q = Math.min(fig.w, fig.h) * 0.86;
        out.push(block(k, x, fig, x.ground, { name: 'Figure ground' }));
        out.push(P(k, x, 'sector', { start: 180, sweep: 90 }, { x: fig.x + fig.w - q, y: fig.y, w: q * 2, h: q * 2 }, tint(x.accent), { name: 'Quarter disc' }));
        out.push(block(k, x, { x: fig.x, y: fig.y + q * 0.62, w: fig.w * 0.72, h: x.u * 3 }, tint(x.ink), { name: 'Bar' }));
        out.push(
          block(
            k,
            x,
            {
              x: fig.x + fig.w * 0.08,
              y: fig.y + q * 0.16,
              w: q * 0.3,
              h: q * 0.3,
            },
            tint(x.accent2),
            { name: 'Square' },
          ),
        );
      }
      out.push(
        ...details(
          k,
          x,
          { x: x.m, y, w: cw, h: x.H - y - x.m },
          {
            metaStyle: { case: 'upper', tracking: 60 },
            subStyle: {
              italic: v !== 'modernist',
              font: x.dir.tokens.fonts.body,
            },
          },
        ),
      );
      out.push(...border(k, x, 'rule', x.ink, x.m * 0.5).slice(1));
      return out;
    },

    'pop-panel': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const lw = x.u * 1.1;
      const gut = x.u * 2.2;
      const ink = '#111111';
      const panels =
        v === 'comic'
          ? L
            ? [
                { x: x.m, y: x.m, w: (x.W - x.m * 2) * 0.58, h: x.H - x.m * 2 },
                {
                  x: x.m + (x.W - x.m * 2) * 0.58 + gut,
                  y: x.m,
                  w: (x.W - x.m * 2) * 0.42 - gut,
                  h: (x.H - x.m * 2) / 2 - gut / 2,
                },
                {
                  x: x.m + (x.W - x.m * 2) * 0.58 + gut,
                  y: x.m + (x.H - x.m * 2) / 2 + gut / 2,
                  w: (x.W - x.m * 2) * 0.42 - gut,
                  h: (x.H - x.m * 2) / 2 - gut / 2,
                },
              ]
            : [
                { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.4 },
                {
                  x: x.m,
                  y: x.m + x.H * 0.4 + gut,
                  w: (x.W - x.m * 2) * 0.58,
                  h: x.H - x.m * 2 - x.H * 0.4 - gut,
                },
                {
                  x: x.m + (x.W - x.m * 2) * 0.58 + gut,
                  y: x.m + x.H * 0.4 + gut,
                  w: (x.W - x.m * 2) * 0.42 - gut,
                  h: x.H - x.m * 2 - x.H * 0.4 - gut,
                },
              ]
          : [{ x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H - x.m * 2 }];
      const fills = [x.accent2, a3(x), x.accent];
      panels.forEach((p, i) => {
        out.push(block(k, x, p, fills[i % 3], { name: 'Panel' }));
        out.push(
          k.patternNode(x, k.pdef(v === 'halftone' ? 'halftone' : 'dots', v === 'halftone' ? { scale: 2.4, field: 1, max: 100 } : { scale: 2.2, size: 38, stagger: 1, shape: 0 }, ['ground']), p, {
            opacity: v === 'halftone' ? 0.55 : 0.32,
            name: 'Ben-Day dots',
          }),
        );
      });
      const img = picture(k, x, {
        x: panels[0].x + lw,
        y: panels[0].y + lw,
        w: panels[0].w - lw * 2,
        h: panels[0].h * (v === 'comic' ? 1 : 0.55) - lw * 2,
      });
      if (img) out.push(img);
      else if (v === 'comic') {
        // no picture: the first panel is all action, lines bursting from a point
        const p0 = panels[0];
        const R = Math.max(p0.w, p0.h) * 1.1;
        out.push({
          id: newId('g'),
          type: 'group',
          name: 'Action lines',
          clip: true,
          x: p0.x,
          y: p0.y,
          w: p0.w,
          h: p0.h,
          rotation: 0,
          opacity: 1,
          children: [P(k, x, 'rays', { rays: 56, inner: 12, jitter: 45, seed: 7 }, { x: p0.w * 0.62 - R, y: p0.h * 0.5 - R, w: R * 2, h: R * 2 }, ink, { name: 'Speed lines', opacity: 0.6 })],
        } as Node);
      }
      for (const p of panels)
        out.push(
          block(k, x, p, null, {
            name: 'Panel border',
            stroke: { color: ink, width: lw, join: 'miter' },
          }),
        );
      const bp = v === 'comic' ? panels[1] : panels[0];
      const bw = bp.w * 0.92;
      const bh = Math.min(bp.h * (img && v !== 'comic' ? 0.48 : 0.7), bw * 0.9);
      const burst = {
        x: bp.x + (bp.w - bw) / 2,
        y: bp.y + bp.h - bh - x.u * 3,
        w: bw,
        h: bh,
      };
      out.push(
        P(k, x, 'burst', { rays: 18, inner: 80 }, burst, '#ffffff', {
          name: 'Burst',
          stroke: { color: ink, width: lw * 0.7, join: 'miter' },
          rotation: -4,
        }),
      );
      const t = head(
        k,
        x,
        {
          x: burst.x + bw * 0.16,
          y: burst.y + bh * 0.24,
          w: bw * 0.68,
          h: bh * 0.52,
        },
        { align: 'center', color: ink, rotation: -6, valign: 'middle' },
      );
      out.push(t);
      const c = x.brief.content;
      if (c.subhead) {
        const sp = v === 'comic' ? panels[2] : { x: x.m * 1.6, y: x.m * 1.6, w: x.W * 0.5, h: x.H * 0.16 };
        const bub = {
          x: sp.x + x.u * 2,
          y: sp.y + x.u * 2,
          w: sp.w - x.u * 4,
          h: Math.min(sp.h - x.u * 4, x.u * 20),
        };
        out.push(P(k, x, 'speech-bubble', { radius: 40, tail: 30, tailSize: 18 }, bub, '#ffffff', { name: 'Balloon', stroke: { color: ink, width: lw * 0.5 } }));
        out.push(
          k.text(
            x,
            'subhead',
            c.subhead,
            {
              x: bub.x + bub.w * 0.1,
              y: bub.y + bub.h * 0.12,
              w: bub.w * 0.8,
              h: bub.h * 0.6,
            },
            {
              align: 'center',
              size: mid(k, x),
              color: ink,
              font: x.dir.tokens.fonts.body,
              weight: 700,
              valign: 'middle',
            },
          ),
        );
      }
      // the caption box, yellow, at the foot
      const cap = {
        x: x.m + x.u * 2,
        y: x.H - x.m - x.u * 11,
        w: x.W * 0.56,
        h: x.u * 9,
      };
      const capWords = details(
        k,
        x,
        {
          x: cap.x + x.u * 1.5,
          y: cap.y + x.u,
          w: cap.w - x.u * 3,
          h: cap.h - x.u * 2,
        },
        { sub: false, color: ink, scale: 0.9, fromFoot: true },
      );
      out.push(panelAround(k, x, capWords, cap, '#ffe65c', { name: 'Caption box', stroke: { color: ink, width: lw * 0.5 } }, x.u * 1.2), ...capWords);
      return out;
    },

    'op-field': (x) => {
      const out: Node[] = [];
      const cx = between(x, 'cx', 38, 62);
      out.push(k.patternNode(x, k.pdef('concentric', { scale: 1.8, weight: 0.85, sides: 0, cx, cy: 40, twin: 1 }, ['ink']), { x: 0, y: 0, w: x.W, h: x.H }, { name: 'Optical field' }));
      out.push(P(k, x, 'concentric', { rings: 22, offset: 70 }, { x: x.W * 0.2, y: x.H * 0.1, w: x.W * 0.6, h: x.W * 0.6 }, x.ink, { name: 'Bulge', ...stroke(x, x.ink, x.u * 0.9) }));
      const img = picture(k, x, { x: x.W * 0.35, y: x.H * 0.2, w: x.W * 0.3, h: x.W * 0.3 }, 'circle');
      if (img) out.push(img);
      const plateBox = {
        x: x.m,
        y: x.H * 0.64,
        w: x.W - x.m * 2,
        h: x.H * 0.36 - x.m,
      };
      out.push(
        block(k, x, plateBox, x.ground, {
          name: 'Plate',
          stroke: { color: x.ink, width: Math.max(1, x.u * 0.6) },
        }),
      );
      const t = head(
        k,
        x,
        {
          x: plateBox.x + x.u * 3,
          y: plateBox.y + x.u * 2.5,
          w: plateBox.w - x.u * 6,
          h: plateBox.h * 0.46,
        },
        { align: 'center' },
      );
      out.push(t);
      out.push(
        ...details(
          k,
          x,
          {
            x: plateBox.x + x.u * 3,
            y: t.y + t.h + x.u * 1.5,
            w: plateBox.w - x.u * 6,
            h: plateBox.y + plateBox.h - t.y - t.h - x.u * 3,
          },
          { align: 'center', scale: 0.9 },
        ),
      );
      return out;
    },

    'psychedelic-flow': (x) => {
      const out: Node[] = [];
      const cx = x.W / 2;
      const d = Math.max(x.W, x.H) * 1.15;
      out.push(P(k, x, 'concentric', { rings: 16, offset: 30 }, { x: cx - d / 2, y: x.H * 0.42 - d / 2, w: d, h: d }, x.accent, { name: 'Pulsing rings', ...stroke(x, x.accent, x.u * 2.4) }));
      const bloom = mix(x.accent2, x.ground, 0.1);
      out.push(P(k, x, 'wavy-circle', { waves: 18, amplitude: 6 }, { x: cx - x.W * 0.42, y: x.H * 0.1, w: x.W * 0.84, h: x.W * 0.84 }, bloom, { name: 'Bloom' }));
      const img = picture(k, x, { x: cx - x.W * 0.26, y: x.H * 0.16, w: x.W * 0.52, h: x.W * 0.52 }, 'circle');
      if (img) out.push(img);
      for (const [px, py, r] of [
        [0, 0, 0],
        [1, 0, 90],
        [1, 1, 180],
        [0, 1, 270],
      ] as const)
        out.push(
          P(
            k,
            x,
            'blob',
            { seed: 11 + px * 3 + py * 5, lobes: 5, irregular: 60 },
            {
              x: px ? x.W - x.u * 26 : -x.u * 6,
              y: py ? x.H - x.u * 26 : -x.u * 6,
              w: x.u * 32,
              h: x.u * 32,
            },
            a3(x),
            { name: 'Blob', rotation: r },
          ),
        );
      // the lettering vibrates against the bloom: the palette colour that reads on it best, outlined
      const fill = [a3(x), x.ink, x.ground, x.accent].reduce((a, b) => (contrastRatio(b, bloom) > contrastRatio(a, bloom) ? b : a));
      const line = contrastRatio(x.ink, fill) > contrastRatio(x.ground, fill) ? x.ink : x.ground;
      const t = head(
        k,
        x,
        { x: x.m * 1.6, y: x.H * 0.2, w: x.W - x.m * 3.2, h: x.H * 0.4 },
        {
          align: 'center',
          color: fill,
          valign: 'middle',
          stroke: { color: line, width: x.u * 0.6 },
        },
      );
      t.warp = { kind: 'bulge', amount: 50 };
      t.size *= 0.82;
      out.push(t);
      const band = { x: 0, y: x.H * 0.74, w: x.W, h: x.H * 0.26 };
      const calm = details(
        k,
        x,
        {
          x: x.m,
          y: band.y + x.u * 3,
          w: x.W - x.m * 2,
          h: band.h - x.u * 3 - x.m * 0.8,
        },
        { align: 'center', color: on(x, x.ink), fromFoot: true },
      );
      out.push(panelAround(k, x, calm, band, x.ink, { name: 'Calm band' }, x.u * 3), ...calm);
      return out;
    },

    'memphis-scatter': (x) => {
      const out: Node[] = [];
      const atomic = variant(x) === 'atomic';
      const L = land(x);
      const box = atomic
        ? L
          ? { x: x.m, y: x.H * 0.46, w: x.W * 0.5, h: x.H * 0.26 }
          : { x: x.m, y: x.H * 0.52, w: x.W * 0.72, h: x.H * 0.2 }
        : L
          ? { x: x.W * 0.22, y: x.H * 0.32, w: x.W * 0.56, h: x.H * 0.3 }
          : { x: x.W * 0.12, y: x.H * 0.36, w: x.W * 0.76, h: x.H * 0.24 };
      const infoBox = atomic
        ? {
            x: x.m,
            y: box.y + box.h + x.u * 5,
            w: x.W * 0.6,
            h: x.H - box.y - box.h - x.u * 5 - x.m,
          }
        : {
            x: x.m,
            y: box.y + box.h + x.u * 6,
            w: L ? x.W * 0.4 : x.W * 0.56,
            h: Math.min(x.u * 18, x.H - box.y - box.h - x.u * 6 - x.m),
          };
      const avoid = [box, infoBox].map((b) => ({
        x: b.x - x.u * 3,
        y: b.y - x.u * 3,
        w: b.w + x.u * 6,
        h: b.h + x.u * 6,
      }));
      const hits = (b: { x: number; y: number; w: number; h: number }) => avoid.some((a) => b.x < a.x + a.w && b.x + b.w > a.x && b.y < a.y + a.h && b.y + b.h > a.y);
      const fills = [x.accent, x.accent2, a3(x), x.ink];
      if (atomic) {
        // the atomic age: an orbit, a starburst and a boomerang clustered above the words
        const s = Math.min(x.W, x.H) * 0.36;
        const orbit = { x: L ? x.W * 0.56 : x.W * 0.08, y: x.m, w: s, h: s };
        for (const r of [0, 60, -60])
          out.push(
            ellipse(x, { x: orbit.x, y: orbit.y + s * 0.32, w: s, h: s * 0.36 }, null, {
              name: 'Orbit',
              rotation: r,
              stroke: { color: x.ink, width: Math.max(1, x.u * 0.45) },
            }),
          );
        out.push(
          ellipse(
            x,
            {
              x: orbit.x + s * 0.4,
              y: orbit.y + s * 0.4,
              w: s * 0.2,
              h: s * 0.2,
            },
            x.accent,
            { name: 'Nucleus' },
          ),
        );
        out.push(
          P(
            k,
            x,
            'sunburst',
            { rays: 12, width: 40 },
            {
              x: L ? x.W * 0.78 : x.W * 0.56,
              y: x.m * 0.8,
              w: s * 0.9,
              h: s * 0.9,
            },
            a3(x),
            { name: 'Starburst' },
          ),
        );
        out.push(
          P(
            k,
            x,
            'crescent',
            { phase: 30, angle: 40 },
            {
              x: L ? x.W * 0.68 : x.W * 0.5,
              y: x.m + s * 0.78,
              w: s * 0.62,
              h: s * 0.62,
            },
            x.accent2,
            { name: 'Boomerang', rotation: -20 },
          ),
        );
        for (let i = 0; i < 5; i++) {
          const ds = x.u * between(x, `ad${i}`, 1.6, 3.2);
          const b = {
            x: between(x, `ax${i}`, x.W * 0.1, x.W - x.m - ds),
            y: between(x, `ay${i}`, x.m, box.y - x.u * 6 - ds),
            w: ds,
            h: ds,
          };
          if (!hits(b)) out.push(ellipse(x, b, fills[i % 4], { name: 'Dot' }));
        }
        // the slanted block runs past the words at both ends by its own slant, so every letter sits on it
        const bh = box.h + x.u * 4;
        const lean = bh * Math.tan((18 * Math.PI) / 180);
        out.push(
          P(
            k,
            x,
            'parallelogram',
            { slant: 18, rounding: 0 },
            {
              x: box.x - x.u * 2 - lean,
              y: box.y - x.u * 2,
              w: box.w + x.u * 4 + lean * 2,
              h: bh,
            },
            x.accent2,
            { name: 'Angled block' },
          ),
        );
      } else {
        // confetti over the whole sheet: a jittered grid of places, each taken by one shape, none over the words
        out.push(k.patternNode(x, k.pdef('dots', { scale: 3.2, size: 30, stagger: 1, shape: 0 }, ['ink']), { x: x.W * 0.62, y: x.m, w: x.W * 0.3, h: x.H * 0.2 }, { name: 'Dots swatch', rotation: 6 }));
        out.push(k.patternNode(x, k.pdef('stripes', { scale: 2.6, ratio: 50 }, ['accent2']), { x: x.W * 0.64, y: x.H * 0.78, w: x.W * 0.3, h: x.H * 0.12 }, { name: 'Stripes swatch', rotation: -8 }));
        const set = ['wave-lines', 'triangle', 'circle', 'cross', 'sector', 'ring', 'triangle', 'circle'];
        const cols = L ? 7 : 5;
        const rows = L ? 4 : 7;
        const cw = x.W / cols;
        const ch = x.H / rows;
        const order = Array.from({ length: cols * rows }, (_, i) => i).sort((a, b) => rand(x, `o${a}`) - rand(x, `o${b}`));
        let n = 0;
        for (const i of order) {
          if (n >= 16) break;
          const kind = set[n % set.length];
          const sz = Math.min(cw, ch) * between(x, `s${i}`, 0.34, 0.62);
          const b = {
            x: (i % cols) * cw + between(x, `x${i}`, 0, cw - sz),
            y: Math.floor(i / cols) * ch + between(x, `y${i}`, 0, ch - sz),
            w: sz,
            h: kind === 'wave-lines' ? sz * 0.5 : sz,
          };
          if (hits(b)) continue;
          const paint = kind === 'wave-lines' || kind === 'cross' ? x.ink : fills[n % 3];
          out.push(
            P(
              k,
              x,
              kind,
              {
                lines: 2,
                amplitude: 30,
                frequency: 3,
                thickness: kind === 'ring' ? 30 : 26,
                start: 0,
                sweep: 90,
                seed: 3 + i,
              },
              b,
              paint,
              {
                name: 'Confetti',
                rotation: Math.round(between(x, `r${i}`, -40, 40)),
                ...(kind === 'wave-lines' ? stroke(x, x.ink, x.u * 0.5) : {}),
              },
            ),
          );
          n++;
        }
        out.push(block(k, x, box, x.ink, { name: 'Text box', rotation: -4 }));
      }
      const t = head(
        k,
        x,
        {
          x: box.x + x.u * 3,
          y: box.y + x.u * 2,
          w: box.w - x.u * 6,
          h: box.h - x.u * 4,
        },
        {
          align: atomic ? 'left' : 'center',
          color: on(x, atomic ? x.accent2 : x.ink),
          rotation: atomic ? 0 : -4,
          valign: 'middle',
        },
      );
      if (atomic) k.treat(x, t, 'italic-mix');
      out.push(t);
      const info = details(k, x, infoBox, {
        color: atomic ? x.ink : '#111111',
        scale: 0.95,
      });
      if (!atomic)
        out.push(
          panelAround(
            k,
            x,
            info,
            {
              x: infoBox.x - x.u,
              y: infoBox.y - x.u,
              w: infoBox.w + x.u * 2,
              h: infoBox.h + x.u * 2,
            },
            '#ffffff',
            {
              name: 'Sticker',
              rotation: 2,
              stroke: { color: x.ink, width: Math.max(1, x.u * 0.35) },
            },
            x.u * 1.5,
          ),
        );
      out.push(...info);
      return out;
    },

    'ransom-collage': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      // scraps of paper, card and print pasted over one another, each torn, turned and shadowed
      const papers =
        v === 'xerox' ? ['#ffffff', '#111111', '#d6d6d1', '#ffffff', '#3a3a3a', '#e8e8e4'] : v === 'dada' ? ['#f4ecd8', '#151515', x.accent, '#e2d6b8', '#151515', '#ffffff'] : ['#ffffff', '#111111', x.accent, '#f4f1e6', a3(x), '#111111'];
      const anchors: [number, number, number, number][] = L
        ? [
            [0.0, 0.02, 0.3, 0.3],
            [0.26, 0.0, 0.26, 0.2],
            [0.6, 0.04, 0.36, 0.26],
            [0.02, 0.62, 0.3, 0.34],
            [0.7, 0.6, 0.3, 0.36],
            [0.4, 0.74, 0.22, 0.24],
          ]
        : [
            [0.0, 0.02, 0.56, 0.15],
            [0.5, 0.0, 0.5, 0.12],
            [0.04, 0.17, 0.4, 0.16],
            [0.56, 0.15, 0.42, 0.2],
            [0.0, 0.36, 0.3, 0.1],
            [0.66, 0.38, 0.34, 0.1],
          ];
      anchors.forEach(([ax, ay, aw, ah], i) => {
        const b = {
          x: x.W * (ax + between(x, `jx${i}`, -0.03, 0.03)),
          y: x.H * (ay + between(x, `jy${i}`, -0.02, 0.02)),
          w: x.W * aw,
          h: x.H * ah,
        };
        out.push(
          P(k, x, 'irregular-polygon', { seed: 20 + i * 7, sides: 6, irregular: 22 }, b, papers[i % papers.length], {
            name: 'Torn paper',
            rotation: Math.round(between(x, `pr${i}`, -12, 12)),
            effects: fx(k, x, 'drop-shadow', {
              dx: 2,
              dy: 3,
              blur: 4,
              opacity: 30,
            }),
          }),
        );
      });
      // a scrap of halftone print, and one of newsprint lines
      out.push(
        k.patternNode(x, k.pdef('halftone', { scale: 1.3, field: 1, angle: 45, max: 110 }, ['ink']), L ? { x: x.W * 0.3, y: x.H * 0.24, w: x.W * 0.24, h: x.H * 0.24 } : { x: x.W * 0.08, y: x.H * 0.2, w: x.W * 0.34, h: x.H * 0.11 }, {
          name: 'Halftone scrap',
          rotation: Math.round(between(x, 'hr', -10, 10)),
        }),
      );
      out.push(
        k.patternNode(x, k.pdef('lines', { scale: 0.7, weight: 0.12 }, ['ink']), L ? { x: x.W * 0.64, y: x.H * 0.1, w: x.W * 0.26, h: x.H * 0.16 } : { x: x.W * 0.6, y: x.H * 0.2, w: x.W * 0.32, h: x.H * 0.1 }, {
          name: 'Newsprint scrap',
          rotation: Math.round(between(x, 'nr', -8, 8)),
          opacity: 0.8,
        }),
      );
      const img = picture(k, x, L ? { x: x.W * 0.56, y: x.H * 0.06, w: x.W * 0.38, h: x.H * 0.5 } : { x: x.W * 0.38, y: x.H * 0.06, w: x.W * 0.54, h: x.H * 0.36 }, 'fragments', { rotation: 4, effects: fx(k, x, 'threshold', { level: 50 }) });
      if (img) out.push(img);
      if (img && v === 'xerox')
        out.push({
          ...img,
          id: `${img.id}c`,
          x: img.x - x.u * 5,
          y: img.y + x.u * 6,
          opacity: 0.45,
          rotation: -3,
        } as Node);
      // the cut-letter headline on its own scrap
      const tb = L ? { x: x.W * 0.08, y: x.H * 0.3, w: x.W * 0.56, h: x.H * 0.3 } : { x: x.m * 0.8, y: x.H * 0.5, w: x.W - x.m * 1.6, h: x.H * 0.22 };
      out.push(
        P(
          k,
          x,
          'irregular-polygon',
          { seed: 41, sides: 7, irregular: 18 },
          {
            x: tb.x - x.u * 2,
            y: tb.y - x.u * 2,
            w: tb.w + x.u * 4,
            h: tb.h + x.u * 4,
          },
          '#ffffff',
          { name: 'Scrap', rotation: -2 },
        ),
      );
      const t = head(k, x, tb, {
        align: 'center',
        valign: 'middle',
        color: '#111111',
      });
      if (v !== 'xerox') {
        mixedFaces(t, x.style?.faces.alt ?? [], ['#111111', readable(x.accent, '#ffffff', 3), '#111111']);
        t.warp = { kind: 'stagger', amount: v === 'dada' ? 60 : 45 };
      } else
        t.repeat = {
          count: 2,
          dx: x.u * 0.8,
          dy: x.u * 0.6,
          fade: 0.6,
          outline: false,
        };
      out.push(t);
      // tape and a marker scrawl
      out.push(block(k, x, { x: tb.x + tb.w * 0.08, y: tb.y - x.u * 4, w: x.u * 12, h: x.u * 4 }, mix(a3(x), '#ffffff', 0.25), { name: 'Tape', rotation: -14, opacity: 0.75 }));
      out.push(
        block(
          k,
          x,
          {
            x: tb.x + tb.w * 0.78,
            y: tb.y + tb.h - x.u,
            w: x.u * 12,
            h: x.u * 4,
          },
          mix(a3(x), '#ffffff', 0.25),
          { name: 'Tape', rotation: 18, opacity: 0.75 },
        ),
      );
      out.push(P(k, x, v === 'dada' ? 'arrow' : 'cross', { shaft: 30, head: 40, double: 0, thickness: 18 }, { x: x.W * 0.72, y: x.H * 0.8, w: x.u * 14, h: x.u * 10 }, x.accent, { name: 'Scrawl', rotation: v === 'dada' ? 160 : 8 }));
      // the details typed plainly on a strip
      const strip = L ? { x: x.W * 0.68, y: x.H * 0.4, w: x.W * 0.28, h: x.H * 0.3 } : { x: x.m, y: x.H * 0.77, w: x.W * 0.58, h: x.H * 0.23 - x.m };
      const typed = details(
        k,
        x,
        {
          x: strip.x + x.u * 2,
          y: strip.y + x.u * 2,
          w: strip.w - x.u * 4,
          h: strip.h - x.u * 3,
        },
        { color: '#111111', scale: 0.9 },
      );
      out.push(
        panelAround(k, x, typed, strip, '#ffffff', {
          name: 'Typed strip',
          rotation: 1,
        }),
        ...typed,
      );
      return out;
    },

    'cut-paper': (x) => {
      const out: Node[] = [];
      const kinds = ['leaf', 'blob', 'irregular-polygon', 'wavy-circle', 'leaf', 'cutout'];
      const fills = [x.accent, x.accent2, a3(x), x.ink, mix(x.accent, a3(x), 0.5), x.accent2];
      const anchors: [number, number][] = land(x)
        ? [
            [0.02, 0.04],
            [0.24, 0.0],
            [0.46, 0.08],
            [0.7, 0.02],
            [0.58, 0.4],
            [0.8, 0.5],
          ]
        : [
            [0.02, 0.03],
            [0.44, 0.0],
            [0.66, 0.14],
            [0.06, 0.24],
            [0.36, 0.2],
            [0.68, 0.38],
          ];
      for (let i = 0; i < 6; i++) {
        const sz = Math.min(x.W, x.H) * between(x, `c${i}`, 0.26, 0.42);
        const [ax, ay] = anchors[i];
        out.push(
          P(
            k,
            x,
            kinds[i],
            {
              seed: 30 + i * 7,
              width: 55,
              bend: 18,
              lobes: 4,
              irregular: 45,
              sides: 6,
              waves: 9,
              amplitude: 9,
              holes: 3,
              radius: 18,
            },
            {
              x: x.W * (ax + between(x, `cx${i}`, -0.04, 0.04)),
              y: x.H * (ay + between(x, `cy${i}`, -0.02, 0.03)),
              w: sz,
              h: sz,
            },
            fills[i],
            {
              name: 'Cut paper',
              rotation: Math.round(between(x, `cr${i}`, -50, 50)),
              effects: fx(k, x, 'drop-shadow', {
                dx: 0,
                dy: 8,
                blur: 14,
                opacity: 22,
              }),
            },
          ),
        );
      }
      const img = picture(k, x, { x: x.W * 0.44, y: x.H * 0.14, w: x.W * 0.46, h: x.W * 0.46 }, x.style?.dna.imagery.mask || 'blob', {
        effects: fx(k, x, 'drop-shadow', {
          dx: 0,
          dy: 8,
          blur: 14,
          opacity: 22,
        }),
      });
      if (img) out.push(img);
      const piece = { x: x.m * 0.8, y: x.H * 0.6, w: x.W * 0.8, h: x.H * 0.34 };
      // the words' own scrap of paper is paper whatever the ground (on an ink ground it is the light colour of the
      // palette, not the ground lightened to grey), and the words take whichever colour reads on it
      const paperOf = contrastRatio(x.ground, '#000000') >= contrastRatio(x.ink, '#000000') ? x.ground : x.ink;
      const paper = mix(paperOf, '#ffffff', 0.5);
      const wordInk = on(x, paper);
      const t = head(
        k,
        x,
        {
          x: piece.x + x.u * 5,
          y: piece.y + x.u * 4,
          w: piece.w - x.u * 10,
          h: piece.h * 0.44,
        },
        { rotation: -3, color: wordInk },
      );
      t.h = Math.min(t.h, textHeight(x, t) + x.u);
      const words = details(
        k,
        x,
        {
          x: piece.x + x.u * 5,
          y: t.y + t.h + x.u * 2,
          w: piece.w - x.u * 10,
          h: Math.max(x.u * 8, x.H - x.m * 0.6 - x.u * 5 - (t.y + t.h + x.u * 2)),
        },
        { scale: 0.9, color: wordInk },
      );
      // then the scrap is cut to hold every word, with room for its slant, and lifted back onto the frame: a scissored
      // quadrilateral, nearly as wide at the top as at the foot, so no word lands off the paper on the ground
      const items = [t, ...words];
      let top = Math.min(...items.map((n) => n.y)) - x.u * 4;
      let bottom = Math.max(...items.map((n) => n.y + n.h)) + x.u * 5;
      const over = bottom - (x.H - x.m * 0.4);
      if (over > 0) {
        for (const n of items) n.y -= over;
        top -= over;
        bottom -= over;
      }
      out.push(
        P(k, x, 'trapezoid', { top: 94, rounding: 0 }, { x: piece.x, y: top, w: piece.w, h: bottom - top }, paper, {
          name: 'Paper for the words',
          rotation: -3,
          effects: fx(k, x, 'drop-shadow', {
            dx: 0,
            dy: 6,
            blur: 12,
            opacity: 20,
          }),
        }),
      );
      out.push(...items);
      return out;
    },

    'surreal-horizon': (x) => {
      const out: Node[] = [];
      const hy = x.H * between(x, 'hz', 0.62, 0.7);
      const sky = x.style?.vocab.gradient ?? {
        type: 'linear',
        angle: 180,
        stops: [
          { at: 0, color: mix(x.accent2, '#ffffff', 0.4) },
          { at: 1, color: x.ground },
        ],
      };
      out.push(groundOf(k, x, sky as never));
      const plain = mix(x.ink, x.ground, 0.62);
      out.push(
        block(k, x, { x: 0, y: hy, w: x.W, h: x.H - hy }, plain, {
          name: 'Plain',
        }),
      );
      const d = x.W * 0.36;
      const ox = x.W * between(x, 'ox', 0.42, 0.62) - d / 2;
      const oy = x.H * 0.24;
      const shadowH = d * 0.2;
      out.push(ellipse(x, { x: ox + d * 0.7, y: hy + x.u * 2, w: d * 1.7, h: shadowH }, mix(x.ink, plain, 0.4), { name: 'Long shadow', opacity: 0.6 }));
      const kind = motifs(x).find((m) => ['circle', 'drop', 'crescent', 'blob'].includes(m)) ?? 'circle';
      const img = picture(k, x, { x: ox, y: oy, w: d, h: d }, kind === 'circle' ? 'circle' : kind);
      out.push(
        img ??
          P(
            k,
            x,
            kind,
            {
              point: 40,
              phase: 35,
              angle: 20,
              seed: 9,
              lobes: 3,
              irregular: 30,
            },
            { x: ox, y: oy, w: d, h: d },
            x.accent,
            { name: 'Floating object' },
          ),
      );
      const t = head(k, x, { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.16 }, { align: 'center', color: on(x, mix(x.accent2, '#ffffff', 0.4)) });
      out.push(t);
      const below = hy + x.u * 2 + shadowH + x.u * 3;
      out.push(...details(k, x, { x: x.m * 2, y: below, w: x.W - x.m * 4, h: x.H - below - x.m }, { align: 'center', color: on(x, plain) }));
      return out;
    },

    'chrome-y2k': (x) => {
      const out: Node[] = [];
      const chromeV = variant(x) === 'chrome';
      const grad = x.style?.vocab.gradient;
      if (chromeV) {
        out.push(k.patternNode(x, k.pdef('scatter', { scale: 3, size: 0.25, shape: 0, clump: 20 }, ['muted']), { x: 0, y: 0, w: x.W, h: x.H }, { name: 'Starfield', opacity: 0.6 }));
        out.push(
          P(
            k,
            x,
            'rays',
            { rays: 36, inner: 22, jitter: 30, seed: 5 },
            {
              x: x.W * 0.5 - x.W * 0.55,
              y: x.H * 0.32 - x.W * 0.55,
              w: x.W * 1.1,
              h: x.W * 1.1,
            },
            mix(x.accent, x.ground, 0.4),
            { name: 'Rays' },
          ),
        );
      } else if (grad) out.push(groundOf(k, x, grad));
      const blobs = chromeV
        ? []
        : [
            {
              k: 'blob',
              b: { x: x.W * 0.48, y: x.H * 0.08, w: x.W * 0.5, h: x.W * 0.44 },
            },
            {
              k: 'capsule',
              b: { x: x.m, y: x.H * 0.5, w: x.W * 0.38, h: x.W * 0.16 },
            },
            {
              k: 'blob',
              b: { x: x.W * 0.06, y: x.H * 0.1, w: x.W * 0.3, h: x.W * 0.28 },
            },
          ];
      blobs.forEach((s, i) =>
        out.push(
          P(k, x, s.k, { seed: 13 + i * 9, lobes: 4, irregular: 45 }, s.b, CHROME, {
            name: 'Chrome form',
            effects: fx(k, x, 'bevel', { depth: 6 }),
            rotation: Math.round(between(x, `br${i}`, -20, 20)),
          }),
        ),
      );
      const img = picture(k, x, { x: x.W * 0.2, y: x.H * 0.16, w: x.W * 0.6, h: x.W * 0.6 }, x.style?.dna.imagery.mask || 'blob');
      if (img) out.push(img);
      const t = head(
        k,
        x,
        {
          x: x.m,
          y: x.H * (chromeV ? 0.3 : 0.56),
          w: x.W - x.m * 2,
          h: x.H * 0.18,
        },
        { align: 'center', fill: CHROME },
      );
      // chrome lettering reads by a firm outline in the ink
      t.stroke = { color: x.ink, width: Math.max(1, t.size * 0.035) };
      for (let i = 0; i < 8; i++) {
        const s = x.u * between(x, `sp${i}`, 3, 8);
        const b = {
          x: between(x, `sx${i}`, x.m, x.W - x.m - s),
          y: between(x, `sy${i}`, x.m, x.H * 0.7),
          w: s,
          h: s,
        };
        // sparkles round the words, never behind them
        if (b.x < t.x + t.w && b.x + b.w > t.x && b.y < t.y + t.h + x.u && b.y + b.h > t.y - x.u) continue;
        out.push(
          P(k, x, 'star', { points: 4, inner: 18 }, b, '#ffffff', {
            name: 'Sparkle',
            effects: fx(k, x, 'glow', { size: 10, opacity: 80 }),
          }),
        );
      }
      out.push(t);
      const pane = {
        x: x.W * 0.14,
        y: x.H * 0.77,
        w: x.W * 0.72,
        h: x.H * 0.2,
      };
      const glossy = details(
        k,
        x,
        {
          x: pane.x + x.u * 5,
          y: pane.y + x.u * 2,
          w: pane.w - x.u * 10,
          h: pane.h - x.u * 3,
        },
        {
          align: 'center',
          color: on(x, mix(x.ground, '#ffffff', 0.55)),
          sub: true,
          scale: 0.85,
          fromFoot: true,
        },
      );
      const paneNode = panelAround(k, x, glossy, pane, mix(x.ground, '#ffffff', 0.55), { name: 'Glossy panel', opacity: 0.85, effects: fx(k, x, 'glass') });
      out.push({ ...paneNode, radius: Math.min(paneNode.h, paneNode.w) / 2 } as Node, ...glossy);
      return out;
    },

    'neon-horizon': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const hy = x.H * (v === 'vapor' ? 0.58 : 0.6);
      const sky = x.style?.vocab.gradient ?? {
        type: 'linear',
        angle: 180,
        stops: [
          { at: 0, color: x.ground },
          { at: 1, color: x.accent },
        ],
      };
      out.push(groundOf(k, x, sky));
      if (v !== 'cyber') {
        const d = x.W * 0.56;
        const sun = { x: x.W / 2 - d / 2, y: hy - d * 0.62, w: d, h: d };
        out.push(
          ellipse(
            x,
            sun,
            {
              type: 'linear',
              angle: 180,
              stops: [
                { at: 0, color: a3(x) },
                { at: 1, color: x.accent },
              ],
            },
            {
              name: 'Sun',
              effects: fx(k, x, 'glow', { size: 18, opacity: 60 }),
            },
          ),
        );
        // the stripes cut through the lower half of the sun
        for (let i = 0; i < 5; i++)
          out.push(
            block(
              k,
              x,
              {
                x: sun.x - 2,
                y: sun.y + d * (0.52 + i * 0.075),
                w: d + 4,
                h: d * (0.012 + i * 0.008),
              },
              mix(x.ground, x.accent, 0.35),
              { name: 'Sun stripe' },
            ),
          );
      }
      out.push(block(k, x, { x: 0, y: hy, w: x.W, h: x.H - hy }, mix(x.ground, '#000000', 0.35), { name: 'Floor' }));
      out.push(
        P(k, x, 'perspective-grid', { horizon: 0, vanish: 50, lines: 22, rows: 10 }, { x: -x.W * 0.2, y: hy, w: x.W * 1.4, h: x.H - hy }, x.accent2, {
          name: 'Laser grid',
          effects: fx(k, x, 'glow', { size: 8, opacity: 70 }),
          ...stroke(x, x.accent2, x.u * 0.3),
        }),
      );
      const img = picture(k, x, { x: x.W * 0.26, y: hy - x.W * 0.48, w: x.W * 0.48, h: x.W * 0.48 }, 'circle');
      if (img && v === 'cyber') out.push(img);
      const t = head(
        k,
        x,
        { x: x.m, y: x.m * 1.2, w: x.W - x.m * 2, h: x.H * 0.2 },
        {
          align: 'center',
          effects: fx(k, x, 'glow', { size: 16, spread: 1, opacity: 80 }),
          ...(v === 'synth'
            ? {
                fill: {
                  type: 'linear',
                  angle: 90,
                  stops: [
                    { at: 0, color: '#ffffff' },
                    { at: 0.5, color: a3(x) },
                    { at: 1, color: x.accent },
                  ],
                },
              }
            : {}),
        },
      );
      if (v === 'vapor') k.treat(x, t, 'spaced');
      out.push(t);
      const floor = mix(x.ground, '#000000', 0.35);
      const pl = {
        x: x.W * 0.12,
        y: hy + (x.H - hy) * 0.36,
        w: x.W * 0.76,
        h: (x.H - hy) * 0.64 - x.m * 0.6,
      };
      const plated = details(
        k,
        x,
        {
          x: pl.x + x.u * 3,
          y: pl.y + x.u * 2.5,
          w: pl.w - x.u * 6,
          h: pl.h - x.u * 4,
        },
        { align: 'center', color: on(x, floor) },
      );
      out.push(
        panelAround(k, x, plated, pl, floor, {
          name: 'Plate',
          opacity: 0.9,
          stroke: { color: x.accent2, width: Math.max(1, x.u * 0.25) },
          effects: fx(k, x, 'glow', { size: 8, opacity: 50 }, { color: x.accent2 }),
        }),
        ...plated,
      );
      return out;
    },

    'hud-frame': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const frame = {
        x: x.m * 0.8,
        y: x.m * 0.8,
        w: x.W - x.m * 1.6,
        h: x.H - x.m * 1.6,
      };
      const cs = x.u * 10;
      const lc = v === 'technical' ? x.ink : x.accent2;
      out.push(
        k.patternNode(
          x,
          k.pdef(v === 'technical' ? 'technical' : 'grid', v === 'technical' ? { scale: 3.2, major: 5, weight: 0.05, labels: 1, marks: 1 } : { scale: 4, weight: 0.05, major: 5, majorWeight: 0.14 }, ['line', 'accent']),
          { x: 0, y: 0, w: x.W, h: x.H },
          {
            name: v === 'technical' ? 'Measured grid' : 'Grid',
            opacity: v === 'technical' ? 0.9 : 0.45,
          },
        ),
      );
      for (const [px, py, r] of [
        [0, 0, 0],
        [1, 0, 90],
        [1, 1, 180],
        [0, 1, 270],
      ] as const)
        out.push(
          P(
            k,
            x,
            'bracket',
            { depth: 40, both: 0 },
            {
              x: px ? frame.x + frame.w - cs : frame.x,
              y: py ? frame.y + frame.h - cs : frame.y,
              w: cs,
              h: cs,
            },
            lc,
            {
              name: 'Corner bracket',
              rotation: r,
              ...stroke(x, lc, x.u * 0.45),
            },
          ),
        );
      // the viewport: a picture, or a reticle
      const vp = L ? { x: x.W * 0.52, y: x.H * 0.18, w: x.W * 0.4, h: x.H * 0.6 } : { x: x.W * 0.16, y: x.H * 0.14, w: x.W * 0.68, h: x.H * 0.36 };
      const img = picture(k, x, vp, null, {
        effects: fx(k, x, v === 'technical' ? 'mono' : 'chromatic', {
          amount: 5,
        }),
      });
      if (img) out.push(img);
      else {
        const rd = Math.min(vp.w, vp.h) * 0.7;
        out.push(
          P(
            k,
            x,
            'ring',
            { thickness: 3 },
            {
              x: vp.x + vp.w / 2 - rd / 2,
              y: vp.y + vp.h / 2 - rd / 2,
              w: rd,
              h: rd,
            },
            lc,
            { name: 'Reticle' },
          ),
        );
        out.push(
          P(
            k,
            x,
            'hexagon',
            { pointy: 0, rounding: 0 },
            {
              x: vp.x + vp.w / 2 - rd * 0.25,
              y: vp.y + vp.h / 2 - rd * 0.25,
              w: rd * 0.5,
              h: rd * 0.5,
            },
            null,
            { name: 'Hexagon', ...stroke(x, x.accent, x.u * 0.35) },
          ),
        );
      }
      out.push(
        block(k, x, vp, null, {
          name: 'Viewport',
          stroke: { color: lc, width: Math.max(1, x.u * 0.3) },
        }),
      );
      out.push(P(k, x, 'annotation', { kind: 0, ticks: 6 }, { x: vp.x, y: vp.y + vp.h + x.u, w: vp.w, h: x.u * 4 }, lc, { name: 'Scale' }));
      const ty = L ? x.H * 0.2 : vp.y + vp.h + x.u * 7;
      const t = head(
        k,
        x,
        {
          x: frame.x + x.u * 3,
          y: ty,
          w: L ? x.W * 0.44 : frame.w - x.u * 6,
          h: x.H * (L ? 0.32 : 0.18),
        },
        {
          effects: v === 'cyber' ? fx(k, x, 'glow', { size: 12, opacity: 70 }) : undefined,
        },
      );
      out.push(t);
      out.push(
        ...details(
          k,
          x,
          {
            x: frame.x + x.u * 3,
            y: t.y + t.h + x.u * 2,
            w: L ? x.W * 0.44 : frame.w * 0.62,
            h: frame.y + frame.h - t.y - t.h - x.u * 4,
          },
          { metaStyle: { font: x.dir.tokens.fonts.body, tracking: 60 } },
        ),
      );
      for (let i = 0; i < 3; i++)
        out.push(
          P(
            k,
            x,
            'chevron',
            { depth: 50, notch: 50 },
            {
              x: frame.x + frame.w - x.u * (6 + i * 4.5),
              y: frame.y + frame.h - x.u * 8,
              w: x.u * 4,
              h: x.u * 5,
            },
            i === 0 ? x.accent : mix(x.accent, x.ground, 0.5),
            { name: 'Chevron', rotation: 90 },
          ),
        );
      return out;
    },

    'raw-document': (x) => rawDocument(x),

    'raw-blocks': (x) => {
      if (variant(x) === 'web') return rawDocument(x);
      const out: Node[] = [];
      const lw = x.u * 0.55;
      const shadow = fx(k, x, 'drop-shadow', { dx: 9, dy: 9, blur: 0, spread: 0, opacity: 100 }, { color: x.ink });
      const boxes = [
        { b: { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.44 }, f: x.accent },
        {
          b: {
            x: x.m,
            y: x.m + x.H * 0.44 + x.u * 3,
            w: (x.W - x.m * 2) * 0.58,
            h: x.H * 0.3,
          },
          f: x.accent2,
        },
        {
          b: {
            x: x.m + (x.W - x.m * 2) * 0.58 + x.u * 3,
            y: x.m + x.H * 0.44 + x.u * 3,
            w: (x.W - x.m * 2) * 0.42 - x.u * 3,
            h: x.H * 0.3,
          },
          f: a3(x),
        },
      ];
      for (const { b, f } of boxes)
        out.push(
          block(k, x, b, f, {
            name: 'Box',
            stroke: { color: x.ink, width: lw, join: 'miter' },
            effects: shadow,
          }),
        );
      const img = picture(k, x, {
        x: boxes[2].b.x + lw * 2,
        y: boxes[2].b.y + lw * 2,
        w: boxes[2].b.w - lw * 4,
        h: boxes[2].b.h - lw * 4,
      });
      if (img) out.push(img);
      else {
        const b = boxes[2].b;
        const s = Math.min(b.w, b.h) * 0.62;
        out.push(P(k, x, 'arrow', { shaft: 38, head: 44, double: 0 }, { x: b.x + (b.w - s) / 2, y: b.y + (b.h - s) / 2, w: s, h: s }, x.ink, { name: 'Arrow', rotation: -35 }));
      }
      const t = head(
        k,
        x,
        {
          x: boxes[0].b.x + x.u * 3,
          y: boxes[0].b.y + x.u * 3,
          w: boxes[0].b.w - x.u * 6,
          h: boxes[0].b.h - x.u * 6,
        },
        { color: on(x, boxes[0].f), valign: 'bottom' },
      );
      out.push(t);
      out.push(
        ...details(
          k,
          x,
          {
            x: boxes[1].b.x + x.u * 3,
            y: boxes[1].b.y + x.u * 3,
            w: boxes[1].b.w - x.u * 6,
            h: boxes[1].b.h - x.u * 5,
          },
          { color: on(x, boxes[1].f), brand: false },
        ),
      );
      const c = x.brief.content;
      if (c.brand) out.push(k.text(x, 'logo', c.brand, { x: x.m, y: x.H - x.m - x.u * 8, w: x.W * 0.6, h: x.u * 6 }, { size: small(k, x, 1.3), weight: 700, case: 'none', color: x.ink }));
      out.push(
        P(
          k,
          x,
          'star',
          { points: 8, inner: 60 },
          {
            x: x.W - x.m - x.u * 16,
            y: x.H - x.m - x.u * 18,
            w: x.u * 16,
            h: x.u * 16,
          },
          a3(x),
          {
            name: 'Sticker',
            rotation: 12,
            stroke: { color: x.ink, width: lw * 0.8 },
          },
        ),
      );
      return out;
    },

    'type-wall': (x) => {
      const out: Node[] = [];
      const v = variant(x);
      const L = land(x);
      const c = x.brief.content;
      if (v === 'flyer') {
        out.push(
          P(
            k,
            x,
            'rays',
            { rays: 60, inner: 10, jitter: 20, seed: 3 },
            {
              x: x.W / 2 - x.W * 0.7,
              y: x.H * 0.25 - x.W * 0.7,
              w: x.W * 1.4,
              h: x.W * 1.4,
            },
            mix(x.accent2, x.ground, 0.55),
            { name: 'Rays' },
          ),
        );
        for (let i = 0; i < 4; i++)
          out.push(
            P(
              k,
              x,
              'star',
              { points: 5, inner: 45 },
              {
                x: between(x, `fx${i}`, x.m, x.W - x.m - x.u * 7),
                y: between(x, `fy${i}`, x.m * 1.4 + x.H * 0.42 + x.u * 2, x.H * 0.66 - x.u * 9),
                w: x.u * 7,
                h: x.u * 7,
              },
              i % 2 ? x.accent : a3(x),
              { name: 'Star' },
            ),
          );
      }
      if (v === 'newwave' || v === 'futurist')
        out.push(
          block(k, x, { x: -x.W * 0.1, y: x.H * 0.3, w: x.W * 1.2, h: x.u * 7 }, x.accent, {
            name: 'Bar',
            rotation: v === 'futurist' ? -14 : -6,
            opacity: 0.9,
          }),
        );
      if (v === 'newwave') out.push(k.patternNode(x, k.pdef('halftone', { scale: 1.8, field: 2, max: 90 }, ['ink']), { x: x.W * 0.45, y: x.H * 0.06, w: x.W * 0.5, h: x.H * 0.3 }, { name: 'Halftone screen', opacity: 0.5 }));
      if (v === 'brutal')
        out.push(
          block(k, x, { x: 0, y: x.H * 0.64, w: x.W, h: x.u * 2.6 }, x.ink, {
            name: 'Rule',
          }),
        );
      const img = picture(k, x, L ? { x: x.W * 0.62, y: x.m, w: x.W * 0.38 - x.m, h: x.H - x.m * 2 } : { x: x.m, y: x.H * 0.66, w: x.W * 0.36, h: x.H * 0.24 }, null, { effects: fx(k, x, 'threshold', { level: 50 }) });
      if (img) out.push(img);
      const hb = {
        x: x.m * (v === 'brutal' ? 0.5 : 1),
        y: x.m * (v === 'flyer' ? 1.4 : 0.8),
        w: (L && img ? x.W * 0.6 : x.W) - x.m * (v === 'brutal' ? 1 : 2),
        h: x.H * (v === 'flyer' ? 0.42 : 0.58),
      };
      const t = head(k, x, hb, v === 'flyer' ? { align: 'center' } : {});
      if (v === 'flyer') {
        t.warp = { kind: 'perspective', amount: 50 };
        t.fill = {
          type: 'linear',
          angle: 90,
          stops: [
            { at: 0, color: '#ffffff' },
            { at: 0.5, color: x.accent },
            { at: 1, color: x.accent2 },
          ],
        };
        t.effects = fx(k, x, 'glow', { size: 14, opacity: 70 });
      } else if (v === 'experimental') {
        k.treat(x, t, 'stacked');
        t.skewX = -10;
        t.repeat = {
          count: 3,
          dx: x.u * 0.8,
          dy: x.u * 0.8,
          fade: 0.7,
          outline: true,
        };
      } else if (v === 'futurist') {
        t.warp = { kind: 'rise', amount: 35 };
        t.rotation = -8;
      } else k.treat(x, t, 'stacked');
      out.push(t);
      const infoTop = Math.max(t.y + t.h + x.u * 3, x.H * (v === 'brutal' ? 0.67 : 0.66));
      const infoBox =
        L && img
          ? { x: x.m, y: infoTop, w: x.W * 0.56, h: x.H - infoTop - x.m }
          : {
              x: img && !L ? x.m + x.W * 0.4 : x.m,
              y: infoTop,
              w: (img && !L ? x.W * 0.6 : x.W) - x.m * 2,
              h: x.H - infoTop - x.m,
            };
      out.push(
        ...details(k, x, infoBox, {
          align: v === 'flyer' ? 'center' : 'left',
          metaStyle: {
            font: x.dir.tokens.fonts.body,
            case: 'upper',
            tracking: 60,
          },
        }),
      );
      if (v === 'flyer' && (c.items?.length ?? 0) === 0 && c.brand) out.push(P(k, x, 'burst', { rays: 16, inner: 78 }, { x: x.W - x.m - x.u * 16, y: x.m * 0.6, w: x.u * 16, h: x.u * 16 }, x.accent, { name: 'Badge', rotation: 12 }));
      return out;
    },
  };
}
