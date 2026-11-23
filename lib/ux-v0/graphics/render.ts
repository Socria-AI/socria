// lib/ux-v0/graphics/render.ts — a graphics document drawn as SVG.
//
// SVG, not a canvas library: text stays text (selectable, exportable, editable), vectors stay exact at any zoom,
// masks and gradients are native, the same markup is the canvas the designer edits and the file they download, and a
// browser rasterises it for PNG and PDF. Every element is generated from a validated document (doc.ts): words are
// escaped, colours are checked hex, paths come from SocriaUX's own parsers, picture addresses are https, data:image or
// an upload's — nothing a document says can become a script.
//
// Each node is drawn in its own box: translate(x, y), rotate about the box's centre, skew and flip about it, then its
// opacity and blend mode. Its effect stack becomes one SVG filter on a group around it (effects.ts); a gradient
// overlay and an extrusion are drawn around the content itself. A group can be clipped to its box, masked by its
// first child (by silhouette or brightness, or the inverse) or be a live boolean of its shapes. Gradients beyond SVG's
// own (conic, mesh-style, linear-light interpolation) are drawn exactly: conic as fine sectors, a mesh as rows blended
// by masks, linear light as interpolated stops. Every node's element carries data-gfx-id, which the canvas selects by.

import { fontStack } from '../fonts';
import { parsePath, shapeRings, svgPath, type Ring } from '../shape';
import type { Artboard, ChartNode, GraphicDoc, GroupNode, ImageNode, Node, Paint, PatternNode, ShapeNode, Stroke, TextNode } from './doc';
import { compileFilter, effectReach, EFFECT_BY_KIND, type Effect } from './effects';
import { pathD, primPath, scalePath, PRIMITIVE_BY_KIND } from './geometry';
import { colorAt, mixColor, type Gradient, type Stop } from './paint';
import { runPattern } from './patterns';
import { approxMeasure, layoutText, runPieces, shownText, styleAt, type Measure } from './text';
import { booleanPath, parseD } from './vectorops';

export interface RenderOptions {
  measure?: Measure;
  /** a picture's address as the renderer may load it (an upload's blob or data address); default: its own src */
  href?: (assetId: string, src: string) => string;
  /** draw the bleed around the trim (print export) */
  bleed?: boolean;
  /** draw the safe area and the trim as guides (the canvas) */
  guides?: boolean;
  /** CSS put in the SVG (font faces, for a file that carries its fonts) */
  fontCss?: string;
  /** a prefix for ids in defs, so two artboards on one page never share one */
  idPrefix?: string;
  /** the editor: each text, chart and line takes the pointer across its whole box, not only where ink is painted */
  hit?: boolean;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** A ring of points (0–100 box) as a path's data. */
const ringPath = (rings: readonly Ring[], smooth: boolean) => svgPath(rings, smooth);

/** A colour's stop: its hex and opacity. */
const stopEl = (at: number, color: string, opacity = 1) => {
  const a = (color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1) * opacity;
  return `<stop offset="${n2(at)}" stop-color="${color.slice(0, 7)}"${a < 0.999 ? ` stop-opacity="${n2(a)}"` : ''}/>`;
};

/** Stops as they should be drawn: interpolated in linear light by extra stops where the gradient asks for it. */
function drawnStops(g: Gradient): Stop[] {
  if (g.space !== 'linear') return g.stops;
  const out: Stop[] = [];
  g.stops.forEach((s, i) => {
    if (i === 0) return out.push(s);
    const p = g.stops[i - 1];
    for (let k = 1; k <= 6; k++) out.push({ at: p.at + ((s.at - p.at) * k) / 6, color: mixColor(p.color, s.color, k / 6, 'linear') });
  });
  return out;
}

class Defs {
  items: string[] = [];
  private seen = new Set<string>();
  constructor(private prefix: string) {}
  id(base: string) {
    return `${this.prefix}${base}`.replace(/[^\w-]/g, '-');
  }
  push(id: string, markup: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.items.push(markup);
  }
  /** A fill as an attribute value; `box` is the user space a conic or mesh gradient is drawn in. */
  paint(p: Paint | null | undefined, key: string, box: { w: number; h: number } = { w: 100, h: 100 }): string {
    if (p === null || p === undefined) return 'none';
    if (typeof p === 'string') return p;
    const id = this.id(`g-${key}`);
    const op = p.opacity ?? 1;
    if (p.type === 'linear' || p.type === 'radial') {
      const stops = drawnStops(p).map((s) => stopEl(s.at, s.color, op)).join('');
      const spread = p.repeat && p.repeat !== 'none' ? ` spreadMethod="${p.repeat}"` : '';
      if (p.type === 'radial') {
        const r = p.repeat && p.repeat !== 'none' ? (p.period ?? 0.25) : (p.r ?? 0.6);
        this.push(id, `<radialGradient id="${id}" cx="${n2(p.cx ?? 0.5)}" cy="${n2(p.cy ?? 0.5)}" r="${n2(r)}"${spread}>${stops}</radialGradient>`);
      } else {
        const half = p.repeat && p.repeat !== 'none' ? (p.period ?? 0.25) / 2 : 0.5;
        this.push(id, `<linearGradient id="${id}" x1="${n2(0.5 - half)}" y1="0" x2="${n2(0.5 + half)}" y2="0" gradientTransform="rotate(${n2(p.angle - 90)} 0.5 0.5)"${spread}>${stops}</linearGradient>`);
      }
      return `url(#${id})`;
    }
    const { w, h } = box;
    if (p.type === 'conic') {
      // fine sectors around the centre, each the colour of its angle (CSS's convention: 0° at the top, clockwise)
      const cx = (p.cx ?? 0.5) * w;
      const cy = (p.cy ?? 0.5) * h;
      const R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 2;
      const N = 144;
      const turns = p.turns ?? 1;
      const parts: string[] = [];
      for (let i = 0; i < N; i++) {
        const a0 = ((p.angle - 90 + (i * 360) / N - 0.4) * Math.PI) / 180;
        const a1 = ((p.angle - 90 + ((i + 1) * 360) / N + 0.4) * Math.PI) / 180;
        const t = (((i + 0.5) / N) * turns) % 1;
        const c = colorAt(p.stops, t, p.space ?? 'srgb');
        const a = (c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1) * op;
        parts.push(`<path d="M${n2(cx)} ${n2(cy)}L${n2(cx + Math.cos(a0) * R)} ${n2(cy + Math.sin(a0) * R)}L${n2(cx + Math.cos(a1) * R)} ${n2(cy + Math.sin(a1) * R)}Z" fill="${c.slice(0, 7)}"${a < 0.999 ? ` fill-opacity="${n2(a)}"` : ''}/>`);
      }
      this.push(id, `<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="0" width="${n2(w)}" height="${n2(h)}">${parts.join('')}</pattern>`);
      return `url(#${id})`;
    }
    // mesh-style: a row of colours per grid row, each row blended into the next by a mask; eased both ways
    const m = p.mesh ?? [];
    const size = m.length === 9 ? 3 : 2;
    const eased = (cols: string[]) => {
      const out: string[] = [];
      for (let i = 0; i < cols.length - 1; i++) for (let k = 0; k < 4; k++) out.push(stopEl((i + k / 4) / (cols.length - 1), mixColor(cols[i], cols[i + 1], smoothstep(k / 4)), op));
      out.push(stopEl(1, cols[cols.length - 1], op));
      return out.join('');
    };
    const parts: string[] = [];
    for (let row = 0; row < size; row++) {
      const gid = `${id}-r${row}`;
      parts.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">${eased(m.slice(row * size, row * size + size))}</linearGradient>`);
      if (row === 0) {
        parts.push(`<rect width="${n2(w)}" height="${n2(h)}" fill="url(#${gid})"/>`);
        continue;
      }
      const from = (row - 1) / (size - 1);
      const to = row / (size - 1);
      const vid = `${id}-v${row}`;
      const ramp = [0, 0.25, 0.5, 0.75, 1].map((k) => `<stop offset="${n2(from + (to - from) * k)}" stop-color="#ffffff" stop-opacity="${n2(smoothstep(k))}"/>`).join('');
      parts.push(`<linearGradient id="${vid}" x1="0" y1="0" x2="0" y2="1">${ramp}</linearGradient><mask id="${vid}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${n2(w)}" height="${n2(h)}" style="mask-type:alpha"><rect width="${n2(w)}" height="${n2(h)}" fill="url(#${vid})"/></mask>`);
      parts.push(`<rect width="${n2(w)}" height="${n2(h)}" fill="url(#${gid})" mask="url(#${vid}m)"/>`);
    }
    this.push(id, `<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="0" width="${n2(w)}" height="${n2(h)}">${parts.join('')}</pattern>`);
    return `url(#${id})`;
  }
}

/** A colour with an alpha channel as fill and fill-opacity. */
function fillAttrs(c: string, attr = 'fill'): string {
  if (c.length === 9) return `${attr}="${c.slice(0, 7)}" ${attr}-opacity="${n2(parseInt(c.slice(7), 16) / 255)}"`;
  return `${attr}="${c}"`;
}
const fillOf = (value: string) => (value.startsWith('#') ? fillAttrs(value) : `fill="${value}"`);

/** The box transform: translate, rotate about the centre, then skew and flip about it (vectorops.nodeMatrix). */
function boxTransform(n: Node): string {
  const parts = [`translate(${n2(n.x)} ${n2(n.y)})`];
  const cx = n2(n.w / 2);
  const cy = n2(n.h / 2);
  if (n.rotation) parts.push(`rotate(${n2(n.rotation)} ${cx} ${cy})`);
  if (n.skewX || n.skewY) parts.push(`translate(${cx} ${cy}) matrix(1 ${n2(Math.tan(((n.skewY ?? 0) * Math.PI) / 180))} ${n2(Math.tan(((n.skewX ?? 0) * Math.PI) / 180))} 1 0 0) translate(${n2(-n.w / 2)} ${n2(-n.h / 2)})`);
  if (n.flipX || n.flipY) parts.push(`translate(${cx} ${cy}) scale(${n.flipX ? -1 : 1} ${n.flipY ? -1 : 1}) translate(${n2(-n.w / 2)} ${n2(-n.h / 2)})`);
  return parts.join(' ');
}

function regularPolygon(w: number, h: number, sides: number, inner?: number): string {
  const pts: string[] = [];
  const count = inner ? sides * 2 : sides;
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const r = inner && i % 2 ? inner : 1;
    pts.push(`${n2(w / 2 + (Math.cos(ang) * r * w) / 2)},${n2(h / 2 + (Math.sin(ang) * r * h) / 2)}`);
  }
  return pts.join(' ');
}

// ── text ──

const textStyle = (n: TextNode): string => {
  const css: string[] = [];
  if (n.axes && Object.keys(n.axes).length) css.push(`font-variation-settings:${Object.entries(n.axes).map(([k, v]) => `'${k}' ${n2(v)}`).join(',')}`);
  if (n.kerning === 'none') css.push('font-kerning:none');
  const feats = [...(n.features ?? []).map((f) => `'${f}' 1`), ...(n.kerning === 'none' ? ["'kern' 0"] : [])];
  if (feats.length) css.push(`font-feature-settings:${feats.join(',')}`);
  return css.length ? ` style="${esc(css.join(';'))}"` : '';
};

/** Where a text's ink goes: its colour, a gradient, or nothing (an outline). */
function textFill(n: TextNode, defs: Defs): string {
  if (n.fill === null) return 'fill="none"';
  if (n.fill && typeof n.fill === 'object') return `fill="${defs.paint(n.fill, `t-${n.id}`, { w: n.w, h: n.h })}"`;
  return fillAttrs(n.color);
}

/** The path a text is set along, in its box. */
function textPathD(n: TextNode): string {
  const tp = n.path!;
  const { w, h } = n;
  const s = n.size;
  if (tp.kind === 'circle') {
    const outside = tp.side !== 'inside';
    const rx = Math.max(4, w / 2 - (outside ? s * 0.85 : s * 0.15));
    const ry = Math.max(4, h / 2 - (outside ? s * 0.85 : s * 0.15));
    // the path starts opposite the words' centre, so the middle of the path is where they sit (0° at the top)
    const centre = ((tp.start / 100) * 360 - 90) * (Math.PI / 180);
    const a0 = centre + Math.PI;
    const p0 = [w / 2 + Math.cos(a0) * rx, h / 2 + Math.sin(a0) * ry];
    const p1 = [w / 2 - Math.cos(a0) * rx, h / 2 - Math.sin(a0) * ry];
    const sweep = outside ? 1 : 0;
    return `M${n2(p0[0])} ${n2(p0[1])}A${n2(rx)} ${n2(ry)} 0 1 ${sweep} ${n2(p1[0])} ${n2(p1[1])}A${n2(rx)} ${n2(ry)} 0 1 ${sweep} ${n2(p0[0])} ${n2(p0[1])}`;
  }
  if (tp.kind === 'wave') {
    const amp = ((tp.amplitude ?? 40) / 100) * Math.max(0, h / 2 - s * 0.6);
    const cyc = tp.cycles ?? 1.5;
    const base = h / 2 + s * 0.35;
    const pts: string[] = [];
    for (let i = 0; i <= 96; i++) {
      const x = (i / 96) * w;
      pts.push(`${n2(x)} ${n2(base + Math.sin((x / w) * cyc * Math.PI * 2) * amp)}`);
    }
    return `M${pts.join('L')}`;
  }
  if (tp.kind === 'custom') {
    const p = parseD(tp.d ?? '');
    return p ? pathD(scalePath(p, w / 100, h / 100)) : `M0 ${n2(h / 2)}L${n2(w)} ${n2(h / 2)}`;
  }
  // an arc across the box: up (a rainbow) or down (a smile)
  const b = tp.bend;
  if (Math.abs(b) < 1) return `M0 ${n2(h / 2 + s * 0.35)}L${n2(w)} ${n2(h / 2 + s * 0.35)}`;
  const sag = Math.min(Math.max(1, h - s * 1.1), w / 2) * (Math.abs(b) / 100);
  const r = (w * w) / 4 / (2 * sag) + sag / 2;
  const y1 = b > 0 ? h / 2 + sag / 2 + s * 0.35 : h / 2 - sag / 2 + s * 0.35;
  return `M0 ${n2(y1)}A${n2(r)} ${n2(r)} 0 0 ${b > 0 ? 1 : 0} ${n2(w)} ${n2(y1)}`;
}

function textBody(n: TextNode, measure: Measure, defs: Defs, override?: { fill: string; stroke: string }): string {
  const L = layoutText(n, measure);
  const anchor = n.align === 'center' ? 'middle' : n.align === 'right' ? 'end' : 'start';
  const ax = n.align === 'center' ? L.boxW / 2 : n.align === 'right' ? L.boxW : 0;
  const top = n.valign === 'middle' ? (L.boxH - L.height) / 2 : n.valign === 'bottom' ? L.boxH - L.height : 0;
  // the first baseline: the line's half-leading above, the face's ascent (about 0.78 em) below the top of the line
  const first = top + (n.size * Math.max(1, n.lineHeight) - n.size) / 2 + n.size * 0.8;
  const fill = override?.fill ?? textFill(n, defs);
  const stroke = override?.stroke ?? (n.stroke ? ` stroke="${n.stroke.color.slice(0, 7)}" stroke-width="${n2(n.stroke.width)}" paint-order="stroke" stroke-linejoin="round"` : '');
  const deco = n.decoration ? ` text-decoration="${n.decoration}"` : '';
  const head = (extra: string) => `<text font-family="${esc(fontStack(n.font))}" font-size="${n2(n.size)}" font-weight="${n.weight}"${n.italic ? ' font-style="italic"' : ''}${extra} ${fill}${stroke}${deco}${textStyle(n)} xml:space="preserve">`;
  // mixed styles (runs) apply only while the shown letters are the written ones, offset for offset
  const runs = !!n.runs?.length && shownText(n).length === n.text.length;
  // a run's own style at an offset, where it differs from the node's: face, weight, slant, colour, decoration
  const runAttrs = (at: number): string => {
    const r = n.runs?.find((x) => at >= x.start && at < x.end);
    if (!r) return '';
    const st = styleAt(n, at);
    return [st.font !== n.font ? ` font-family="${esc(fontStack(st.font))}"` : '', st.weight !== n.weight ? ` font-weight="${st.weight}"` : '', st.italic !== !!n.italic ? ` font-style="${st.italic ? 'italic' : 'normal'}"` : '', st.color && !override ? ` ${fillAttrs(st.color)}` : '', r.decoration ? ` text-decoration="${r.decoration === 'none' ? 'none' : r.decoration}"` : ''].join('');
  };

  // along a path: one line, its anchor at `start` along the path
  if (n.path) {
    const pid = defs.id(`tp-${n.id}`);
    defs.push(pid, `<path id="${pid}" d="${textPathD(n)}"/>`);
    const shown = shownText(n);
    // along the path too, each run keeps its own style
    const words = runs ? runPieces(n, shown, 0).map((p) => (p.run ? `<tspan${runAttrs(p.at)}>${esc(p.text.replace(/\n+/g, ' '))}</tspan>` : esc(p.text.replace(/\n+/g, ' ')))).join('') : esc(shown.replace(/\n+/g, ' '));
    const offset = n.path.kind === 'circle' ? 50 : n.path.start;
    return `${head(` letter-spacing="${n2((n.tracking / 1000) * n.size)}" text-anchor="middle"`)}<textPath href="#${pid}" xlink:href="#${pid}" startOffset="${n2(offset)}%">${words}</textPath></text>`;
  }

  // warped: every letter its own span, shifted, turned or scaled, while the browser still sets each letter's advance
  // from the face itself (so spacing is true to the font) and the line stays one chunk that aligns as a whole; the
  // words stay one text, editable as written
  if (n.warp) {
    const k = n.warp.amount / 100;
    const cyc = n.warp.cycles ?? 1;
    const kind = n.warp.kind;
    const sized = kind === 'perspective' || kind === 'bulge';
    const lines = L.lines.map((l, li) => {
      const chars = [...l.text];
      const N = chars.length;
      // each letter's offset in the words as written (the line is its words joined by single spaces), for its run
      const atOf: number[] = [];
      l.words.forEach((w, wi) => {
        if (wi) atOf.push(w.at - 1);
        let o = w.at;
        for (const ch of w.text) {
          atOf.push(o);
          o += ch.length;
        }
      });
      const base = first + li * L.leading + l.para * L.paraGap;
      const W = Math.max(1, l.width);
      let prev = 0;
      const offs: number[] = [];
      const rots: number[] = [];
      const sizes: number[] = [];
      chars.forEach((_, i) => {
        const t = N > 1 ? i / (N - 1) : 0.5;
        let off = 0;
        let rot = 0;
        let s = 1;
        if (kind === 'wave') {
          const A = k * n.size * 0.6;
          off = A * Math.sin(Math.PI * 2 * cyc * t);
          rot = Math.max(-20, Math.min(20, ((Math.atan(((A * Math.PI * 2 * cyc) / W) * Math.cos(Math.PI * 2 * cyc * t)) * 180) / Math.PI) * 0.5));
        } else if (kind === 'rise') off = -k * n.size * 1.4 * (t - 0.5);
        else if (kind === 'perspective') s = 1 + k * 1.1 * (t - 0.5);
        else if (kind === 'bulge') {
          s = 1 + k * 0.8 * Math.sin(Math.PI * t);
          off = (s - 1) * n.size * 0.36;
        } else if (kind === 'stagger') {
          off = (i % 2 ? 1 : -1) * k * n.size * 0.22;
          rot = (i % 2 ? 1 : -1) * k * 10;
        }
        offs.push(i === 0 ? off : off - prev);
        prev = off;
        rots.push(rot);
        sizes.push(s);
      });
      if (!sized && runs) {
        // shifts and turns with mixed styles: a span for each run's piece, carrying its letters' shifts and turns, the
        // first placing the line, so the line is still one chunk that aligns as a whole and each run keeps its face
        const groups: { key: number; from: number; to: number }[] = [];
        chars.forEach((_, i) => {
          const key = n.runs!.findIndex((x) => atOf[i] >= x.start && atOf[i] < x.end);
          const g = groups[groups.length - 1];
          if (g && g.key === key) g.to = i + 1;
          else groups.push({ key, from: i, to: i + 1 });
        });
        const spans = groups.map((g, gi) => {
          const pos = gi === 0 ? ` x="${n2(ax)}" y="${n2(base + offs[0])}"` : '';
          const ds = offs.slice(g.from, g.to).map((v, j) => (gi === 0 && j === 0 ? 0 : v));
          const dy = ds.some((v) => Math.abs(v) > 0.01) ? ` dy="${ds.map(n2).join(' ')}"` : '';
          const rs = rots.slice(g.from, g.to);
          const rotate = rs.some((v) => Math.abs(v) > 0.05) ? ` rotate="${rs.map(n2).join(' ')}"` : '';
          return `<tspan${pos}${dy}${rotate}${runAttrs(atOf[g.from])}>${esc(chars.slice(g.from, g.to).join(''))}</tspan>`;
        });
        return spans.join('') || `<tspan x="${n2(ax)}" y="${n2(base)}"> </tspan>`;
      }
      if (!sized) {
        // shifts and turns as lists on one span: each letter placed, the line's words kept whole in the file
        const dy = offs.slice(1).some((v) => Math.abs(v) > 0.01) ? ` dy="0 ${offs.slice(1).map(n2).join(' ')}"` : '';
        const rotate = rots.some((v) => Math.abs(v) > 0.05) ? ` rotate="${rots.map(n2).join(' ')}"` : '';
        return `<tspan x="${n2(ax)}" y="${n2(base + offs[0])}"${dy}${rotate}>${esc(l.text) || ' '}</tspan>`;
      }
      // a size for each letter needs a span for each letter
      return chars
        .map((ch, i) => {
          const pos = i === 0 ? ` x="${n2(ax)}" y="${n2(base + offs[0])}"` : Math.abs(offs[i]) > 0.01 ? ` dy="${n2(offs[i])}"` : '';
          return `<tspan${pos}${Math.abs(sizes[i] - 1) > 0.001 ? ` font-size="${n2(n.size * sizes[i])}"` : ''}${runs ? runAttrs(atOf[i]) : ''}>${esc(ch)}</tspan>`;
        })
        .join('');
    });
    return `${head(` letter-spacing="${n2((n.tracking / 1000) * n.size)}" text-anchor="${anchor}" aria-label="${esc(shownText(n).replace(/\n+/g, ' '))}"`)}${lines.join('')}</text>`;
  }

  const track = ` letter-spacing="${n2((n.tracking / 1000) * n.size)}" text-anchor="${anchor}"`;
  const tspans = L.lines
    .map((l, i) => {
      const y = n2(first + i * L.leading + l.para * L.paraGap);
      if (!runs) return `<tspan x="${n2(ax)}" y="${y}">${esc(l.text) || ' '}</tspan>`;
      // mixed styles: each piece of each word in its run's style, the line one chunk so it still aligns as a whole
      const pieces: string[] = [];
      l.words.forEach((w, wi) => {
        if (wi) pieces.push(' ');
        for (const p of runPieces(n, w.text, w.at)) {
          if (!p.run) {
            pieces.push(esc(p.text));
            continue;
          }
          pieces.push(`<tspan${runAttrs(p.at)}>${esc(p.text)}</tspan>`);
        }
      });
      return `<tspan x="${n2(ax)}" y="${y}">${pieces.join('') || ' '}</tspan>`;
    })
    .join('');
  return `${head(track)}${tspans}</text>`;
}

function textEl(n: TextNode, measure: Measure, defs: Defs): string {
  let body = textBody(n, measure, defs);
  if (n.repeat && n.repeat.count > 0) {
    // the echo: copies behind the words, the furthest first, fading as they go
    const r = n.repeat;
    const copies: string[] = [];
    for (let i = r.count; i >= 1; i--) {
      const op = Math.max(0, 1 - (r.fade * i) / r.count);
      if (op <= 0.01) continue;
      const override = r.outline ? { fill: 'fill="none"', stroke: ` stroke="${(n.fill === null && n.stroke ? n.stroke.color : n.color).slice(0, 7)}" stroke-width="${n2(Math.max(0.75, n.size / 36))}" stroke-linejoin="round"` } : undefined;
      copies.push(`<g transform="translate(${n2(r.dx * i)} ${n2(r.dy * i)})"${op < 1 ? ` opacity="${n2(op)}"` : ''}>${textBody(n, measure, defs, override)}</g>`);
    }
    body = copies.join('') + body;
  }
  return n.vertical ? `<g transform="translate(0 ${n2(n.h)}) rotate(-90)">${body}</g>` : body;
}

// ── shapes ──

const strokeAttrs = (s: Stroke) => ` stroke="${s.color.slice(0, 7)}"${s.color.length === 9 ? ` stroke-opacity="${n2(parseInt(s.color.slice(7), 16) / 255)}"` : ''} stroke-width="${n2(s.width)}"${s.join ? ` stroke-linejoin="${s.join}"` : ''}${s.cap ? ` stroke-linecap="${s.cap}"` : ''}${s.dash?.length ? ` stroke-dasharray="${s.dash.map(n2).join(' ')}"` : ''}`;

/** A shape's geometry as one element, given its paint attributes (drawn again for each extra stroke). */
function shapeGeometry(n: ShapeNode): ((attrs: string) => string) | null {
  switch (n.shape) {
    case 'rect':
      return (at) => `<rect width="${n2(n.w)}" height="${n2(n.h)}"${n.radius ? ` rx="${n2(Math.min(n.radius, n.w / 2, n.h / 2))}"` : ''} ${at}/>`;
    case 'ellipse':
      return (at) => `<ellipse cx="${n2(n.w / 2)}" cy="${n2(n.h / 2)}" rx="${n2(n.w / 2)}" ry="${n2(n.h / 2)}" ${at}/>`;
    case 'line':
      return (at) => `<line x1="0" y1="${n2(n.h / 2)}" x2="${n2(n.w)}" y2="${n2(n.h / 2)}" ${at}/>`;
    case 'polygon':
      return (at) => `<polygon points="${regularPolygon(n.w, n.h, n.sides ?? 6)}" ${at}/>`;
    case 'star':
      return (at) => `<polygon points="${regularPolygon(n.w, n.h, n.sides ?? 5, n.inner ?? 0.45)}" ${at}/>`;
    case 'path':
    case 'recipe': {
      const rings = n.shape === 'path' ? parsePath(n.path ?? '') : n.recipe ? shapeRings(n.recipe) : null;
      if (!rings || !rings.length) return null;
      const smooth = n.shape === 'recipe' && !!n.recipe && ['organic', 'super', 'rings', 'arc'].includes(n.recipe.kind);
      // drawn in the node's own px space (not a scaled 0–100 box), so gradients and strokes are true to size
      const px = rings.map((r) => r.map(([x, y]) => [(x * n.w) / 100, (y * n.h) / 100] as [number, number]));
      const d = ringPath(px, smooth);
      return (at) => `<path d="${d}" fill-rule="evenodd" ${at}/>`;
    }
    case 'prim': {
      if (!n.prim) return null;
      const d = pathD(primPath(n.prim, n.w, n.h));
      if (!d) return null;
      const evenodd = PRIMITIVE_BY_KIND.get(n.prim.kind)?.evenodd;
      return (at) => `<path d="${d}"${evenodd ? ' fill-rule="evenodd"' : ''} ${at}/>`;
    }
    case 'bezier': {
      if (!n.bez) return null;
      const d = pathD(scalePath(n.bez, n.w / 100, n.h / 100));
      if (!d) return null;
      return (at) => `<path d="${d}"${n.rule === 'evenodd' ? ' fill-rule="evenodd"' : ''} ${at}/>`;
    }
  }
  return null;
}

function shapeEl(n: ShapeNode, defs: Defs): string {
  const geom = shapeGeometry(n);
  if (!geom) return '';
  const fill = n.shape === 'line' ? 'none' : defs.paint(n.fill, n.id, { w: n.w, h: n.h });
  const f = fillOf(fill);
  const main = n.stroke ? strokeAttrs(n.stroke) : n.shape === 'line' ? ' stroke="#111111" stroke-width="2"' : '';
  // extra strokes beneath, widest first as given
  const extra = (n.strokes ?? []).map((s) => geom(`fill="none"${strokeAttrs(s)}`)).join('');
  return `${extra}${geom(`${f}${main}`)}`;
}

/** A live boolean drawn as one path, in the first shape's paint. */
function booleanEl(g: GroupNode, defs: Defs): string {
  const d = pathD(booleanPath(g.children, g.boolean!));
  if (!d) return '';
  const first = g.children.find((c): c is ShapeNode => c.type === 'shape');
  const fill = first ? defs.paint(first.fill, `b-${g.id}`, { w: g.w, h: g.h }) : '#cccccc';
  const strokes = (first?.strokes ?? []).map((s) => `<path d="${d}" fill="none"${strokeAttrs(s)}/>`).join('');
  return `${strokes}<path d="${d}" ${fillOf(fill)}${first?.stroke ? strokeAttrs(first.stroke) : ''}/>`;
}

// ── patterns ──

function patternEl(n: PatternNode, defs: Defs): string {
  const out = runPattern(n.gen, n.params, n.w, n.h, n.colors.length);
  const ink = (i: number) => n.colors[i % n.colors.length] ?? '#111111';
  const marks = out.paths
    .map((p) => (p.stroke !== undefined ? `<path d="${p.d}" fill="none" ${fillAttrs(ink(p.ink), 'stroke')} stroke-width="${n2(p.stroke)}" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="${p.d}" ${fillAttrs(ink(p.ink))}/>`))
    .join('');
  const labels = out.labels.map((l) => `<text x="${n2(l.x)}" y="${n2(l.y)}" font-family="${esc(fontStack('IBM Plex Mono'))}" font-size="${n2(l.size)}" ${fillAttrs(ink(l.ink))}${l.anchor ? ` text-anchor="${l.anchor}"` : ''}>${esc(l.text)}</text>`).join('');
  const cid = defs.id(`pc-${n.id}`);
  let clip = `<rect width="${n2(n.w)}" height="${n2(n.h)}"/>`;
  if (n.bound === 'ellipse') clip = `<ellipse cx="${n2(n.w / 2)}" cy="${n2(n.h / 2)}" rx="${n2(n.w / 2)}" ry="${n2(n.h / 2)}"/>`;
  else if (n.bound && typeof n.bound === 'object') clip = `<path d="${pathD(primPath(n.bound, n.w, n.h))}"${PRIMITIVE_BY_KIND.get(n.bound.kind)?.evenodd ? ' clip-rule="evenodd"' : ''}/>`;
  defs.push(cid, `<clipPath id="${cid}">${clip}</clipPath>`);
  const fr = out.frame;
  const turn = fr.rotation ? ` rotate(${n2(fr.rotation)} ${n2(fr.w / 2)} ${n2(fr.h / 2)})` : '';
  const shift = fr.x || fr.y || turn ? ` transform="translate(${n2(fr.x)} ${n2(fr.y)})${turn}"` : '';
  return `<g clip-path="url(#${cid})"><g${shift}>${marks}${labels}</g></g>`;
}

// ── pictures ──

function imageEl(n: ImageNode, doc: GraphicDoc, defs: Defs, opts: RenderOptions): string {
  const asset = doc.assets.find((x) => x.id === n.asset);
  if (!asset) return `<rect width="${n2(n.w)}" height="${n2(n.h)}" fill="#e6e2d8"/><text x="${n2(n.w / 2)}" y="${n2(n.h / 2)}" text-anchor="middle" font-family="system-ui" font-size="14" fill="#5d5a52">Picture missing</text>`;
  const href = opts.href ? opts.href(asset.id, asset.src) : asset.src;
  // the part of the picture used (a crop), then covering (scaled to fill the box, its focus kept in view) or
  // containing (fitted whole)
  const c = n.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const aw = asset.width * c.w;
  const ah = asset.height * c.h;
  const k = n.fit === 'cover' ? Math.max(n.w / aw, n.h / ah) : Math.min(n.w / aw, n.h / ah);
  const rw = aw * k;
  const rh = ah * k;
  const fx = (n.focus?.x ?? 50) / 100;
  const fy = (n.focus?.y ?? 50) / 100;
  const rx = n.fit === 'cover' ? Math.min(0, Math.max(n.w - rw, n.w / 2 - rw * fx)) : (n.w - rw) / 2;
  const ry = n.fit === 'cover' ? Math.min(0, Math.max(n.h - rh, n.h / 2 - rh * fy)) : (n.h - rh) / 2;
  const iw = asset.width * k;
  const ih = asset.height * k;
  const ix = rx - c.x * iw;
  const iy = ry - c.y * ih;
  const clipId = defs.id(`c-${n.id}`);
  let clipShape = `<rect width="${n2(n.w)}" height="${n2(n.h)}"${n.radius ? ` rx="${n2(n.radius)}"` : ''}/>`;
  if (n.mask === 'ellipse') clipShape = `<ellipse cx="${n2(n.w / 2)}" cy="${n2(n.h / 2)}" rx="${n2(n.w / 2)}" ry="${n2(n.h / 2)}"/>`;
  else if (n.mask && typeof n.mask === 'object') {
    const rings = shapeRings(n.mask).map((r) => r.map(([x, y]) => [(x * n.w) / 100, (y * n.h) / 100] as [number, number]));
    clipShape = `<path d="${ringPath(rings, ['organic', 'super', 'rings', 'arc'].includes(n.mask.kind))}" clip-rule="evenodd"/>`;
  }
  defs.push(clipId, `<clipPath id="${clipId}">${clipShape}</clipPath>`);
  // a contained crop shows only its own part of the picture
  let regionOpen = '';
  let regionClose = '';
  if (n.crop && n.fit === 'contain') {
    const rid = defs.id(`cr-${n.id}`);
    defs.push(rid, `<clipPath id="${rid}"><rect x="${n2(rx)}" y="${n2(ry)}" width="${n2(rw)}" height="${n2(rh)}"/></clipPath>`);
    regionOpen = `<g clip-path="url(#${rid})">`;
    regionClose = '</g>';
  }
  const prims: string[] = [];
  const f = n.filter;
  if (f) {
    const g = f.grayscale ?? 0;
    if (g) prims.push(`<feColorMatrix type="saturate" values="${n2(1 - g)}"/>`);
    const cc = f.contrast ?? 1;
    const b = f.brightness ?? 1;
    if (cc !== 1 || b !== 1) {
      const inter = n2((1 - cc) / 2);
      prims.push(`<feComponentTransfer><feFuncR type="linear" slope="${n2(cc * b)}" intercept="${inter}"/><feFuncG type="linear" slope="${n2(cc * b)}" intercept="${inter}"/><feFuncB type="linear" slope="${n2(cc * b)}" intercept="${inter}"/></feComponentTransfer>`);
    }
    if (f.blur) prims.push(`<feGaussianBlur stdDeviation="${n2(f.blur)}"/>`);
  }
  const adj = n.adjust;
  if (adj) {
    if (adj.saturation) prims.push(`<feColorMatrix type="saturate" values="${n2(1 + adj.saturation / 100)}"/>`);
    if (adj.hue) prims.push(`<feColorMatrix type="hueRotate" values="${n2(adj.hue)}"/>`);
    if (adj.temperature) {
      const t = adj.temperature / 100;
      prims.push(`<feColorMatrix type="matrix" values="${n2(1 + 0.14 * t)} 0 0 0 ${n2(0.02 * t)}  0 ${n2(1 + 0.03 * t)} 0 0 0  0 0 ${n2(1 - 0.14 * t)} 0 ${n2(-0.02 * t)}  0 0 0 1 0"/>`);
    }
    if (adj.brightness || adj.contrast) {
      const slope = 1 + (adj.contrast ?? 0) / 100;
      const inter = (1 - slope) / 2 + ((adj.brightness ?? 0) / 100) * 0.3;
      prims.push(`<feComponentTransfer><feFuncR type="linear" slope="${n2(slope)}" intercept="${n2(inter)}"/><feFuncG type="linear" slope="${n2(slope)}" intercept="${n2(inter)}"/><feFuncB type="linear" slope="${n2(slope)}" intercept="${n2(inter)}"/></feComponentTransfer>`);
    }
    if (adj.blur) prims.push(`<feGaussianBlur stdDeviation="${n2(adj.blur)}"/>`);
  }
  let filter = '';
  if (prims.length) {
    const fid = defs.id(`f-${n.id}`);
    defs.push(fid, `<filter id="${fid}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${prims.join('')}</filter>`);
    filter = ` filter="url(#${fid})"`;
  }
  let vignette = '';
  if (adj?.vignette) {
    const vid = defs.id(`vg-${n.id}`);
    defs.push(vid, `<radialGradient id="${vid}" cx="0.5" cy="0.5" r="0.72"><stop offset="0.45" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="${n2(Math.min(1, adj.vignette / 100) * 0.85)}"/></radialGradient>`);
    vignette = `<rect width="${n2(n.w)}" height="${n2(n.h)}" fill="url(#${vid})"/>`;
  }
  return `<g clip-path="url(#${clipId})">${regionOpen}<image href="${esc(href)}" x="${n2(ix)}" y="${n2(iy)}" width="${n2(iw)}" height="${n2(ih)}" preserveAspectRatio="none"${filter}/>${regionClose}${vignette}</g>`;
}

/** A chart drawn from its data: nothing on it is a value the data does not hold. */
function chartEl(n: ChartNode, doc: GraphicDoc): string {
  const palette = n.colors.length ? n.colors : [doc.tokens.colors.accent, doc.tokens.accent2 ?? doc.tokens.colors.text, doc.tokens.colors.muted, doc.tokens.colors.line];
  const fs = Math.max(9, Math.min(28, Math.min(n.w, n.h) / 18));
  const font = esc(fontStack(n.font));
  const txt = (x: number, y: number, s: string, anchor = 'start', weight = 400, size = fs) => `<text x="${n2(x)}" y="${n2(y)}" font-family="${font}" font-size="${n2(size)}" font-weight="${weight}" text-anchor="${anchor}" fill="${n.color}">${esc(s)}</text>`;
  const fmt = (v: number) => {
    const s = Math.abs(v) >= 1000 ? v.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : String(Math.round(v * 10) / 10);
    return n.unit ? (/^[£$€¥]/.test(n.unit) ? `${n.unit}${s}` : `${s}${n.unit}`) : s;
  };
  const foot = n.source ? fs * 1.8 : 0;
  const out: string[] = [];
  const max = Math.max(...n.data.map((d) => d.value), 0);
  const min = Math.min(...n.data.map((d) => d.value), 0);
  const span = max - min || 1;
  if (n.chart === 'donut') {
    const total = n.data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    const r = Math.min(n.w * 0.5, n.h - foot) / 2.1;
    const cx = r * 1.05;
    const cy = (n.h - foot) / 2;
    let a0 = -Math.PI / 2;
    n.data.forEach((d, i) => {
      const a1 = a0 + (Math.max(0, d.value) / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rr: number) => `${n2(cx + Math.cos(a) * rr)} ${n2(cy + Math.sin(a) * rr)}`;
      out.push(`<path d="M${p(a0, r)} A${n2(r)} ${n2(r)} 0 ${large} 1 ${p(a1, r)} L${p(a1, r * 0.58)} A${n2(r * 0.58)} ${n2(r * 0.58)} 0 ${large} 0 ${p(a0, r * 0.58)} Z" fill="${palette[i % palette.length].slice(0, 7)}"/>`);
      a0 = a1;
    });
    n.data.forEach((d, i) => {
      const y = cy - (n.data.length * fs * 1.6) / 2 + i * fs * 1.6 + fs;
      out.push(`<rect x="${n2(cx * 2 + fs)}" y="${n2(y - fs * 0.8)}" width="${n2(fs * 0.8)}" height="${n2(fs * 0.8)}" fill="${palette[i % palette.length].slice(0, 7)}"/>`);
      out.push(txt(cx * 2 + fs * 2.2, y, `${d.label}${n.values ? `  ${fmt(d.value)}` : ''}`));
    });
  } else if (n.chart === 'line') {
    const left = fs * 0.5;
    const plotH = n.h - foot - fs * 2.4;
    const step = n.data.length > 1 ? (n.w - left * 2) / (n.data.length - 1) : 0;
    const pt = (i: number, v: number) => [left + i * step, fs * 1.2 + plotH - ((v - min) / span) * plotH] as const;
    const d = n.data.map((x, i) => `${i ? 'L' : 'M'}${n2(pt(i, x.value)[0])} ${n2(pt(i, x.value)[1])}`).join(' ');
    out.push(`<line x1="${n2(left)}" y1="${n2(fs * 1.2 + plotH)}" x2="${n2(n.w - left)}" y2="${n2(fs * 1.2 + plotH)}" stroke="${n.color}" stroke-opacity="0.35" stroke-width="1"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${palette[0].slice(0, 7)}" stroke-width="${n2(Math.max(2, fs / 5))}" stroke-linejoin="round" stroke-linecap="round"/>`);
    n.data.forEach((x, i) => {
      const [px, py] = pt(i, x.value);
      out.push(`<circle cx="${n2(px)}" cy="${n2(py)}" r="${n2(Math.max(3, fs / 4))}" fill="${palette[0].slice(0, 7)}"/>`);
      if (n.values) out.push(txt(px, py - fs * 0.6, fmt(x.value), 'middle', 600));
      out.push(txt(px, fs * 1.2 + plotH + fs * 1.3, x.label, 'middle'));
    });
  } else if (n.chart === 'bar') {
    const labelW = Math.min(n.w * 0.34, Math.max(...n.data.map((d) => d.label.length)) * fs * 0.6 + fs);
    const rowH = (n.h - foot) / n.data.length;
    n.data.forEach((d, i) => {
      const bw = ((Math.max(0, d.value) - Math.max(0, min)) / (span || 1)) * (n.w - labelW - fs * 4);
      const y = i * rowH;
      out.push(txt(0, y + rowH / 2 + fs * 0.35, d.label));
      out.push(`<rect x="${n2(labelW)}" y="${n2(y + rowH * 0.18)}" width="${n2(Math.max(1, bw))}" height="${n2(rowH * 0.64)}" fill="${palette[i % palette.length].slice(0, 7)}"/>`);
      if (n.values) out.push(txt(labelW + bw + fs * 0.4, y + rowH / 2 + fs * 0.35, fmt(d.value), 'start', 600));
    });
  } else {
    const plotH = n.h - foot - fs * 3;
    const colW = n.w / n.data.length;
    n.data.forEach((d, i) => {
      const bh = ((Math.max(0, d.value) - Math.max(0, min)) / (span || 1)) * plotH;
      const x = i * colW;
      out.push(`<rect x="${n2(x + colW * 0.15)}" y="${n2(fs * 1.5 + plotH - bh)}" width="${n2(colW * 0.7)}" height="${n2(Math.max(1, bh))}" fill="${palette[i % palette.length].slice(0, 7)}"/>`);
      if (n.values) out.push(txt(x + colW / 2, fs * 1.5 + plotH - bh - fs * 0.4, fmt(d.value), 'middle', 600));
      out.push(txt(x + colW / 2, fs * 1.5 + plotH + fs * 1.2, d.label, 'middle'));
    });
  }
  if (n.source) out.push(txt(0, n.h - fs * 0.4, `Source: ${n.source}`, 'start', 400, fs * 0.8));
  return out.join('');
}

// ── the effect stack around a node's content ──

const BLEND_INDEX = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'exclusion'];

/** The content wrapped in its effects: an extrusion behind it, a gradient overlay over it, the filter chain around
 * both (see the head of this file). */
function withEffects(n: Node, content: string, defs: Defs): string {
  const live = (n.effects ?? []).filter((e) => e.on && EFFECT_BY_KIND.has(e.kind));
  if (!live.length) return content;
  const specials = live.filter((e) => EFFECT_BY_KIND.get(e.kind)!.special);
  let inner = content;
  if (specials.length) {
    const cid = defs.id(`c-${n.id}`);
    let behind = '';
    let over = '';
    for (const e of specials) {
      const spec = EFFECT_BY_KIND.get(e.kind)!;
      if (spec.special === 'extrude') behind += extrudeEl(n, e, cid, defs);
      else over += overlayEl(n, e, cid, defs);
    }
    inner = `${behind}<g id="${cid}">${content}</g>${over}`;
  }
  const fid = defs.id(`fx-${n.id}`);
  const filter = compileFilter(live, fid, n.w, n.h);
  if (!filter) return inner;
  defs.push(fid, filter);
  return `<g filter="url(#${fid})">${inner}</g>`;
}

function extrudeEl(n: Node, e: Effect, cid: string, defs: Defs): string {
  const steps = Math.round(e.params.steps ?? 18);
  const depth = e.params.depth ?? 28;
  const ang = ((e.params.angle ?? 45) * Math.PI) / 180;
  const sid = defs.id(`xs-${n.id}`);
  const c = e.color ?? '#1a1a1a';
  defs.push(sid, `<filter id="${sid}" filterUnits="userSpaceOnUse" x="${n2(-depth - n.w)}" y="${n2(-depth - n.h)}" width="${n2(n.w * 3 + depth * 2)}" height="${n2(n.h * 3 + depth * 2)}" color-interpolation-filters="sRGB"><feFlood flood-color="${c.slice(0, 7)}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
  const copies: string[] = [];
  for (let i = steps; i >= 1; i--) {
    const d = (depth * i) / steps;
    const op = e.params.fade >= 0.5 ? 1 - (i - 1) / steps : 1;
    copies.push(`<use href="#${cid}" xlink:href="#${cid}" transform="translate(${n2(Math.cos(ang) * d)} ${n2(Math.sin(ang) * d)})"${op < 1 ? ` opacity="${n2(op)}"` : ''}/>`);
  }
  return `<g filter="url(#${sid})">${copies.join('')}</g>`;
}

function overlayEl(n: Node, e: Effect, cid: string, defs: Defs): string {
  const gid = defs.id(`go-${n.id}`);
  const mid = defs.id(`gm-${n.id}`);
  const pad = 4;
  defs.push(gid, `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${n2((e.params.angle ?? 90) - 90)} 0.5 0.5)">${stopEl(0, e.color ?? '#ff5f6d')}${stopEl(1, e.color2 ?? '#ffc371')}</linearGradient>`);
  defs.push(mid, `<mask id="${mid}" maskUnits="userSpaceOnUse" x="${-pad}" y="${-pad}" width="${n2(n.w + pad * 2)}" height="${n2(n.h + pad * 2)}" style="mask-type:alpha"><use href="#${cid}" xlink:href="#${cid}"/></mask>`);
  const blend = BLEND_INDEX[Math.max(0, Math.min(11, Math.round(e.params.blend ?? 0)))];
  return `<rect x="${-pad}" y="${-pad}" width="${n2(n.w + pad * 2)}" height="${n2(n.h + pad * 2)}" fill="url(#${gid})" mask="url(#${mid})" opacity="${n2((e.params.opacity ?? 70) / 100)}"${blend !== 'normal' ? ` style="mix-blend-mode:${blend}"` : ''}/>`;
}

// ── nodes ──

function nodeEl(n: Node, doc: GraphicDoc, defs: Defs, opts: RenderOptions, measure: Measure): string {
  if (n.hidden) return '';
  const op = n.opacity < 1 ? ` opacity="${n2(n.opacity)}"` : '';
  const css: string[] = [];
  if (n.blend && n.blend !== 'normal') css.push(`mix-blend-mode:${n.blend}`);
  if (n.type === 'group' && n.isolate) css.push('isolation:isolate');
  if (n.effects?.some((e) => e.on && e.kind === 'gradient-overlay' && (e.params.blend ?? 0) !== 0)) css.push('isolation:isolate');
  const style = css.length ? ` style="${[...new Set(css)].join(';')}"` : '';
  const wantsHit = opts.hit && (n.type === 'text' || n.type === 'chart' || n.type === 'pattern' || (n.type === 'shape' && (n.shape === 'line' || n.fill === null)));
  const hit = wantsHit ? `<rect width="${n2(n.w)}" height="${n2(Math.max(n.h, 4))}" fill="none" pointer-events="all"/>` : '';
  const open = `<g data-gfx-id="${esc(n.id)}" transform="${boxTransform(n)}"${op}${style}>${hit}`;
  let content: string;
  switch (n.type) {
    case 'text':
      content = textEl(n, measure, defs);
      break;
    case 'shape':
      content = shapeEl(n, defs);
      break;
    case 'image':
      content = imageEl(n, doc, defs, opts);
      break;
    case 'chart':
      content = chartEl(n, doc);
      break;
    case 'pattern':
      content = patternEl(n, defs);
      break;
    case 'group': {
      if (n.boolean) {
        content = booleanEl(n, defs);
        break;
      }
      let clip = '';
      if (n.clip) {
        const cid = defs.id(`gc-${n.id}`);
        defs.push(cid, `<clipPath id="${cid}"><rect width="${n2(n.w)}" height="${n2(n.h)}"/></clipPath>`);
        clip = ` clip-path="url(#${cid})"`;
      }
      if (n.mask && n.children.length > 1) {
        // the first child masks the rest: its silhouette (alpha) or its brightness (luminance), or the inverse
        const mid = defs.id(`gm-${n.id}`);
        const src = nodeEl(n.children[0], doc, defs, { ...opts, hit: false }, measure);
        const region = `maskUnits="userSpaceOnUse" x="${n2(-n.w)}" y="${n2(-n.h)}" width="${n2(n.w * 3)}" height="${n2(n.h * 3)}"`;
        let body = src;
        let type = n.mask === 'alpha' ? 'alpha' : 'luminance';
        if (n.maskInvert) {
          const tid = defs.id(`gmi-${n.id}`);
          const matrix = n.mask === 'alpha' ? '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0' : '-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0';
          defs.push(tid, `<filter id="${tid}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${matrix}"/></filter>`);
          body = `<rect x="${n2(-n.w)}" y="${n2(-n.h)}" width="${n2(n.w * 3)}" height="${n2(n.h * 3)}" fill="#ffffff"/><g filter="url(#${tid})">${src}</g>`;
          type = 'luminance';
        }
        defs.push(mid, `<mask id="${mid}" ${region} style="mask-type:${type}">${body}</mask>`);
        content = `<g${clip}><g mask="url(#${mid})">${n.children
          .slice(1)
          .map((c) => nodeEl(c, doc, defs, opts, measure))
          .join('')}</g></g>`;
        break;
      }
      content = `<g${clip}>${n.children.map((c) => nodeEl(c, doc, defs, opts, measure)).join('')}</g>`;
      break;
    }
  }
  return `${open}${withEffects(n, content, defs)}</g>`;
}

/** One artboard as an SVG document (see the head of this file). */
export function renderArtboard(doc0: GraphicDoc, board: Artboard, opts: RenderOptions = {}): string {
  // an artboard with a visual language of its own is drawn in its own tokens (a chart's colours, when it names none)
  const doc = board.tokens ? { ...doc0, tokens: board.tokens } : doc0;
  const measure = opts.measure ?? approxMeasure;
  const defs = new Defs(opts.idPrefix ?? `${board.id}-`);
  const b = opts.bleed ? board.bleed : 0;
  const body = board.children.map((c) => nodeEl(c, doc, defs, opts, measure)).join('');
  const unit = board.unit === 'pt' ? 'pt' : '';
  const W = board.width + b * 2;
  const H = board.height + b * 2;
  const bg = board.background ? `<rect x="${n2(-b)}" y="${n2(-b)}" width="${n2(W)}" height="${n2(H)}" ${fillAttrs(board.background)}/>` : '';
  const guides = opts.guides
    ? `<g pointer-events="none" data-gfx-guides=""><rect x="${n2(board.safe)}" y="${n2(board.safe)}" width="${n2(board.width - board.safe * 2)}" height="${n2(board.height - board.safe * 2)}" fill="none" stroke="#2f80ed" stroke-opacity="0.45" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>${board.bleed ? `<rect x="0" y="0" width="${n2(board.width)}" height="${n2(board.height)}" fill="none" stroke="#e5484d" stroke-opacity="0.5" vector-effect="non-scaling-stroke"/>` : ''}</g>`
    : '';
  const style = opts.fontCss ? `<style>${opts.fontCss.replace(/<\/?style[^>]*>/gi, '')}</style>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n2(W)}${unit}" height="${n2(H)}${unit}" viewBox="${n2(-b)} ${n2(-b)} ${n2(W)} ${n2(H)}" data-gfx-board="${esc(board.id)}">${style}<defs>${defs.items.join('')}</defs>${bg}${body}${guides}</svg>`;
}

/** How far a node's effects paint beyond its box (for hit areas and export margins). */
export const nodeReach = (n: Node) => effectReach(n.effects ?? []);
