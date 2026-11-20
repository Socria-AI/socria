// lib/ux-v0/graphics/svgimport.ts — an SVG file brought in: as editable objects, or whole as a picture.
//
// SVG from elsewhere is untrusted text. It is read here by a small tokenizer of SocriaUX's own (no DOM, no browser
// parser, nothing evaluated): a document type that declares entities is refused outright; scripts, event handlers,
// foreign objects, external references and stylesheets are never carried over. What can be represented exactly
// becomes editable objects: paths, rectangles, circles, ellipses, lines, polylines and polygons become editable
// Bézier paths (their transforms applied, arcs as cubics), text becomes text (its words editable, its face matched to
// the nearest SocriaUX knows), pictures with a data: or https address become pictures, groups stay groups, and
// <use> references are followed. Fills and strokes come across (colours, linear and radial gradients approximately,
// even-odd rules, dashes, caps, joins, opacity). What cannot (filters, masks, clip paths, patterns, styles from a
// stylesheet) is said, one note each — and when a drawing leans on those, embedding it whole as a picture is offered
// instead, so nothing is silently lost.

import { approxMeasure } from './text';
import { graphicFont, FONTS } from '../fonts';
import { mapPath, pathBounds, type BezierPath } from './geometry';
import { parseColor } from './paint';
import { apply, IDENTITY, mul, parseTransform, parseD, transformPath, type Mat } from './vectorops';

interface El {
  name: string;
  attrs: Record<string, string>;
  children: El[];
  text: string;
}

const MAX_ELEMENTS = 800;
const MAX_SOURCE = 4_000_000;

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(0x10ffff, parseInt(h, 16))))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(0x10ffff, Number(d))))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The markup as a tree of elements (see the head of this file); throws on what is refused. */
export function parseSvgXml(src: string): El {
  if (typeof src !== 'string' || src.length > MAX_SOURCE) throw new Error('That file is too large to import.');
  if (/<!DOCTYPE[\s\S]*?\[/i.test(src) && /<!ENTITY/i.test(src)) throw new Error('That file declares entities, which SocriaUX does not read (they can hide content).');
  const root: El = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: El[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[2]) {
      // a closing tag: close up to the matching open element (an unmatched one is ignored)
      const i = stack.map((e) => e.name).lastIndexOf(m[2]);
      if (i > 0) stack.length = i;
    } else if (m[3]) {
      if (++count > MAX_ELEMENTS * 4) break;
      const attrs: Record<string, string> = {};
      const ar = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(m[4] ?? ''))) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      const el: El = { name: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.text += decode(m[6]);
    else if (m[1] !== undefined) top.text += m[1];
  }
  const svg = findSvg(root);
  if (!svg) throw new Error('That is not an SVG drawing.');
  return svg;
}
function findSvg(e: El): El | null {
  if (e.name === 'svg' || e.name.endsWith(':svg')) return e;
  for (const c of e.children) {
    const hit = findSvg(c);
    if (hit) return hit;
  }
  return null;
}

// ── styles: presentation attributes and style="", inherited ──

interface Style {
  fill: string | null | { grad: string };
  stroke: string | null | { grad: string };
  strokeWidth: number;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  rule: 'nonzero' | 'evenodd';
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  anchor: 'start' | 'middle' | 'end';
  hidden: boolean;
}
const ROOT_STYLE: Style = { fill: '#000000', stroke: null, strokeWidth: 1, opacity: 1, fillOpacity: 1, strokeOpacity: 1, rule: 'nonzero', font: 'sans-serif', size: 16, weight: 400, italic: false, anchor: 'start', hidden: false };

function props(e: El): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'display', 'visibility']) if (e.attrs[k] !== undefined) out[k] = e.attrs[k];
  for (const part of (e.attrs.style ?? '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}
const paintOf = (v: string, cur: Style['fill']): Style['fill'] => {
  const t = v.trim();
  if (t === 'none' || t === 'transparent') return null;
  if (t === 'currentColor' || t === 'inherit') return cur;
  const url = t.match(/^url\(\s*['"]?#([^'")]+)['"]?\s*\)/);
  if (url) return { grad: url[1] };
  return parseColor(t) ?? cur;
};
const numOf = (v: string | undefined, d: number) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : d;
};
function styleOf(e: El, parent: Style): Style {
  const p = props(e);
  const s: Style = { ...parent, opacity: 1 };
  if (p.fill !== undefined) s.fill = paintOf(p.fill, parent.fill);
  if (p.stroke !== undefined) s.stroke = paintOf(p.stroke, parent.stroke);
  if (p['stroke-width'] !== undefined) s.strokeWidth = Math.max(0, numOf(p['stroke-width'], parent.strokeWidth));
  if (p.opacity !== undefined) s.opacity = Math.max(0, Math.min(1, numOf(p.opacity, 1)));
  if (p['fill-opacity'] !== undefined) s.fillOpacity = Math.max(0, Math.min(1, numOf(p['fill-opacity'], 1)));
  if (p['stroke-opacity'] !== undefined) s.strokeOpacity = Math.max(0, Math.min(1, numOf(p['stroke-opacity'], 1)));
  if (p['fill-rule'] === 'evenodd') s.rule = 'evenodd';
  else if (p['fill-rule'] === 'nonzero') s.rule = 'nonzero';
  if (p['stroke-dasharray'] !== undefined) {
    const d = p['stroke-dasharray'].split(/[\s,]+/).map(Number).filter((x) => Number.isFinite(x) && x >= 0);
    s.dash = d.length && d.some((x) => x > 0) ? d.slice(0, 6) : undefined;
  }
  if (['butt', 'round', 'square'].includes(p['stroke-linecap'])) s.cap = p['stroke-linecap'] as Style['cap'];
  if (['miter', 'round', 'bevel'].includes(p['stroke-linejoin'])) s.join = p['stroke-linejoin'] as Style['join'];
  if (p['font-family']) s.font = p['font-family'];
  if (p['font-size']) s.size = Math.max(1, numOf(p['font-size'], parent.size));
  if (p['font-weight']) s.weight = p['font-weight'] === 'bold' ? 700 : p['font-weight'] === 'normal' ? 400 : Math.max(100, Math.min(900, Math.round(numOf(p['font-weight'], 400) / 100) * 100));
  if (p['font-style']) s.italic = p['font-style'] === 'italic' || p['font-style'] === 'oblique';
  if (['start', 'middle', 'end'].includes(p['text-anchor'])) s.anchor = p['text-anchor'] as Style['anchor'];
  s.hidden = parent.hidden || p.display === 'none' || p.visibility === 'hidden';
  return s;
}

/** A face SocriaUX knows for a font-family list: the first it knows by name, else the default of the list's kind. */
export function matchFont(family: string): string {
  const names = family.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
  for (const n of names) {
    const k = graphicFont(n);
    if (k) return k.name;
  }
  const generic = names.join(' ').toLowerCase();
  if (/mono|courier|consol/.test(generic)) return FONTS.find((f) => f.kind === 'mono')?.name ?? 'IBM Plex Mono';
  if (/serif/.test(generic) && !/sans/.test(generic)) return 'Source Serif 4';
  if (/times|georgia|garamond|baskerville/.test(generic)) return 'Source Serif 4';
  return 'Inter';
}

// ── the drawing as objects ──

export interface SvgImport {
  /** the objects, in the target's coordinates, ready to add (one group holding them all) */
  group: Record<string, unknown> | null;
  /** pictures the drawing carries (added as assets first) */
  assets: Record<string, unknown>[];
  notes: string[];
  stats: { paths: number; texts: number; images: number; groups: number; skipped: number };
  /** the drawing leans on what cannot be edited here (filters, masks, clip paths, patterns): embedding it is better */
  preferEmbed: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The SVG drawn as editable objects fitted into `target` (uniformly scaled, centred). */
export function importSvg(src: string, target: { x: number; y: number; w: number; h: number }, opts: { name?: string; idPrefix?: string } = {}): SvgImport {
  const notes = new Set<string>();
  const stats = { paths: 0, texts: 0, images: 0, groups: 0, skipped: 0 };
  const assets: Record<string, unknown>[] = [];
  let unsupported = 0;
  const svg = parseSvgXml(src);
  const ids = new Map<string, El>();
  const index = (e: El) => {
    if (e.attrs.id) ids.set(e.attrs.id, e);
    e.children.forEach(index);
  };
  index(svg);
  // the drawing's own coordinates → the target box
  const vb = (svg.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  const W = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 ? vb[2] : numOf(svg.attrs.width, 0) || 0;
  const H = vb.length === 4 && vb.every(Number.isFinite) && vb[3] > 0 ? vb[3] : numOf(svg.attrs.height, 0) || 0;
  const ox = vb.length === 4 && vb.every(Number.isFinite) ? vb[0] : 0;
  const oy = vb.length === 4 && vb.every(Number.isFinite) ? vb[1] : 0;
  const pre = opts.idPrefix ?? 'sv';
  let serial = 0;
  const nid = (k: string) => `${pre}${k}${(serial++).toString(36)}`;

  const gradientOf = (id: string, box: { x: number; y: number; w: number; h: number }, m: Mat): unknown => {
    const g = ids.get(id);
    if (!g) return null;
    const own = g.children.filter((c) => c.name === 'stop');
    const linked = g.attrs.href ?? g.attrs['xlink:href'];
    const stopsEl = own.length ? own : linked ? (ids.get(linked.replace(/^#/, ''))?.children.filter((c) => c.name === 'stop') ?? []) : [];
    const stops = stopsEl
      .map((s) => {
        const p = props(s);
        const off = s.attrs.offset ?? '0';
        const at = off.endsWith('%') ? parseFloat(off) / 100 : parseFloat(off);
        const c = parseColor(p['stop-color'] ?? s.attrs['stop-color'] ?? '#000000') ?? '#000000';
        const op = numOf(p['stop-opacity'] ?? s.attrs['stop-opacity'], 1);
        const alpha = Math.round(Math.max(0, Math.min(1, op)) * 255);
        return { at: Math.max(0, Math.min(1, Number.isFinite(at) ? at : 0)), color: alpha < 255 ? `${c.slice(0, 7)}${alpha.toString(16).padStart(2, '0')}` : c.slice(0, 7) };
      })
      .slice(0, 16);
    if (stops.length < 2) return stops[0]?.color ?? null;
    const user = g.attrs.gradientUnits === 'userSpaceOnUse';
    const frac = (v: string | undefined, d: number, size: number, origin: number) => {
      if (v === undefined) return d;
      const n = v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v);
      if (!Number.isFinite(n)) return d;
      return user && !v.endsWith('%') ? (n - origin) / (size || 1) : n;
    };
    if (g.name === 'radialGradient') {
      const [cx, cy] = user ? apply(m, numOf(g.attrs.cx, 0), numOf(g.attrs.cy, 0)) : [0, 0];
      return { type: 'radial', angle: 0, stops, cx: user ? (cx - box.x) / (box.w || 1) : frac(g.attrs.cx, 0.5, 1, 0), cy: user ? (cy - box.y) / (box.h || 1) : frac(g.attrs.cy, 0.5, 1, 0), r: user ? (numOf(g.attrs.r, 0) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))) / Math.max(1, Math.max(box.w, box.h)) : frac(g.attrs.r, 0.5, 1, 0) };
    }
    let x1 = frac(g.attrs.x1, 0, 1, 0);
    let y1 = frac(g.attrs.y1, 0, 1, 0);
    let x2 = frac(g.attrs.x2, 1, 1, 0);
    let y2 = frac(g.attrs.y2, 0, 1, 0);
    if (user) {
      const a = apply(m, numOf(g.attrs.x1, 0), numOf(g.attrs.y1, 0));
      const b = apply(m, numOf(g.attrs.x2, 1), numOf(g.attrs.y2, 0));
      x1 = (a[0] - box.x) / (box.w || 1);
      y1 = (a[1] - box.y) / (box.h || 1);
      x2 = (b[0] - box.x) / (box.w || 1);
      y2 = (b[1] - box.y) / (box.h || 1);
    }
    // the direction as CSS's angle (0 up, 90 right); its extent is approximated by the box
    const angle = Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90);
    notes.add('Gradients came across with their colours and direction; their exact extent is approximated.');
    return { type: 'linear', angle, stops };
  };

  const paint = (p: Style['fill'], box: { x: number; y: number; w: number; h: number }, m: Mat, alpha: number): unknown => {
    if (p === null) return null;
    if (typeof p === 'string') {
      if (alpha >= 0.999) return p;
      const base = p.slice(0, 7);
      const a0 = p.length === 9 ? parseInt(p.slice(7), 16) / 255 : 1;
      return `${base}${Math.round(a0 * alpha * 255).toString(16).padStart(2, '0')}`;
    }
    const g = ids.get(p.grad);
    if (g && g.name === 'pattern') {
      notes.add('Pattern fills were replaced by a flat colour (SocriaUX patterns are its own generators).');
      unsupported++;
      return '#888888';
    }
    return gradientOf(p.grad, box, m) ?? '#000000';
  };

  const shapeNode = (path: BezierPath, st: Style, m: Mat, name: string): Record<string, unknown> | null => {
    const placed = transformPath(path, m);
    const b = pathBounds(placed);
    if (!(b.w > 0.01) && !(b.h > 0.01)) return null;
    const w = Math.max(1, b.w);
    const h = Math.max(1, b.h);
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    const fill = paint(st.fill, b, m, st.fillOpacity);
    const stroke = st.stroke !== null && st.strokeWidth > 0 ? paint(st.stroke, b, m, st.strokeOpacity) : null;
    if (fill === null && (stroke === null || typeof stroke !== 'string')) {
      if (stroke && typeof stroke === 'object') notes.add('A gradient on a stroke became its first colour.');
      else return null;
    }
    stats.paths++;
    const strokeColour = typeof stroke === 'string' ? stroke : stroke && typeof stroke === 'object' ? ((stroke as { stops?: { color: string }[] }).stops?.[0]?.color ?? '#000000') : null;
    return {
      id: nid('s'),
      type: 'shape',
      shape: 'bezier',
      name,
      x: b.x,
      y: b.y,
      w,
      h,
      bez: mapPath(placed, (px, py) => [((px - b.x) / w) * 100, ((py - b.y) / h) * 100]),
      fill,
      ...(st.rule === 'evenodd' ? { rule: 'evenodd' } : {}),
      ...(strokeColour ? { stroke: { color: strokeColour, width: r2(Math.max(0.25, st.strokeWidth * k)), ...(st.cap ? { cap: st.cap } : {}), ...(st.join ? { join: st.join } : {}), ...(st.dash ? { dash: st.dash.map((d) => r2(d * k)) } : {}) } } : {}),
      ...(st.opacity < 1 ? { opacity: st.opacity } : {}),
    };
  };

  const rectPath = (x: number, y: number, w: number, h: number, rx: number, ry: number): BezierPath | null => {
    if (!(w > 0) || !(h > 0)) return null;
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);
    if (rx <= 0 || ry <= 0) return parseD(`M${x} ${y}H${x + w}V${y + h}H${x}Z`);
    return parseD(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
  };
  const ellipsePath = (cx: number, cy: number, rx: number, ry: number) => (rx > 0 && ry > 0 ? parseD(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`) : null);
  const pointsPath = (pts: string, closed: boolean) => {
    const v = pts.split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (v.length < 4) return null;
    let d = `M${v[0]} ${v[1]}`;
    for (let i = 2; i + 1 < v.length; i += 2) d += `L${v[i]} ${v[i + 1]}`;
    return parseD(closed ? `${d}Z` : d);
  };

  let elements = 0;
  const walk = (e: El, st0: Style, m0: Mat, depth: number, useDepth = 0): Record<string, unknown>[] => {
    if (++elements > MAX_ELEMENTS) {
      notes.add(`Only the first ${MAX_ELEMENTS} elements were imported.`);
      return [];
    }
    const name = e.name.replace(/^svg:/, '');
    if (['script', 'foreignObject', 'style', 'metadata', 'title', 'desc', 'defs', 'symbol', 'linearGradient', 'radialGradient', 'clipPath', 'mask', 'pattern', 'filter', 'marker', 'animate', 'animateTransform', 'set'].includes(name)) {
      if (name === 'script' || name === 'foreignObject') notes.add('Scripts and embedded web content were left out.');
      if (name === 'style') notes.add('Styles from a stylesheet were not applied (only an element’s own attributes and style are read).');
      return [];
    }
    const st = styleOf(e, st0);
    if (st.hidden) return [];
    const m = mul(m0, parseTransform(e.attrs.transform));
    if (e.attrs.filter || e.attrs.mask || e.attrs['clip-path'] || /filter|mask|clip-path/.test(e.attrs.style ?? '')) {
      unsupported++;
      notes.add('Filters, masks and clip paths in the file were not carried over (use SocriaUX’s own effects and masks, or embed the file).');
    }
    const label = e.attrs.id ?? name;
    const withOpacity = (n: Record<string, unknown> | null) => (n && st.opacity < 1 && n.type !== 'shape' ? { ...n, opacity: st.opacity } : n);
    switch (name) {
      case 'svg':
      case 'g':
      case 'a':
      case 'switch': {
        const kids = e.children.flatMap((c) => walk(c, { ...st, opacity: 1 }, name === 'svg' && depth > 0 ? mul(m, [1, 0, 0, 1, numOf(e.attrs.x, 0), numOf(e.attrs.y, 0)]) : m, depth + 1, useDepth));
        if (!kids.length) return [];
        if (depth >= 5 || kids.length === 1) return kids.map((k) => (st.opacity < 1 ? { ...k, opacity: ((k.opacity as number | undefined) ?? 1) * st.opacity } : k));
        stats.groups++;
        const box = boundsOf(kids);
        return [{ id: nid('g'), type: 'group', name: e.attrs.id ?? 'Group', x: box.x, y: box.y, w: box.w, h: box.h, ...(st.opacity < 1 ? { opacity: st.opacity } : {}), children: kids.map((k) => offset(k, -box.x, -box.y)) }];
      }
      case 'use': {
        const ref = (e.attrs.href ?? e.attrs['xlink:href'] ?? '').replace(/^#/, '');
        const target = ids.get(ref);
        if (!target || useDepth > 3 || /^https?:/.test(e.attrs.href ?? e.attrs['xlink:href'] ?? '')) {
          stats.skipped++;
          return [];
        }
        return walk(target.name === 'symbol' ? { ...target, name: 'g' } : target, st, mul(m, [1, 0, 0, 1, numOf(e.attrs.x, 0), numOf(e.attrs.y, 0)]), depth, useDepth + 1);
      }
      case 'path': {
        const p = parseD(e.attrs.d ?? '');
        if (!p) {
          stats.skipped++;
          return [];
        }
        const n = shapeNode(p, st, m, label);
        return n ? [n] : [];
      }
      case 'rect': {
        const rx = numOf(e.attrs.rx, numOf(e.attrs.ry, 0));
        const p = rectPath(numOf(e.attrs.x, 0), numOf(e.attrs.y, 0), numOf(e.attrs.width, 0), numOf(e.attrs.height, 0), rx, numOf(e.attrs.ry, rx));
        const n = p ? shapeNode(p, st, m, label) : null;
        return n ? [n] : [];
      }
      case 'circle':
      case 'ellipse': {
        const r = numOf(e.attrs.r, 0);
        const p = ellipsePath(numOf(e.attrs.cx, 0), numOf(e.attrs.cy, 0), name === 'circle' ? r : numOf(e.attrs.rx, 0), name === 'circle' ? r : numOf(e.attrs.ry, 0));
        const n = p ? shapeNode(p, st, m, label) : null;
        return n ? [n] : [];
      }
      case 'line': {
        const p = parseD(`M${numOf(e.attrs.x1, 0)} ${numOf(e.attrs.y1, 0)}L${numOf(e.attrs.x2, 0)} ${numOf(e.attrs.y2, 0)}`);
        const n = p ? shapeNode(p, { ...st, fill: null }, m, label) : null;
        return n ? [n] : [];
      }
      case 'polyline':
      case 'polygon': {
        const p = pointsPath(e.attrs.points ?? '', name === 'polygon');
        const n = p ? shapeNode(p, name === 'polyline' ? { ...st, fill: st.stroke ? null : st.fill } : st, m, label) : null;
        return n ? [n] : [];
      }
      case 'text': {
        const words = textOf(e).replace(/\s+/g, ' ').trim();
        if (!words) return [];
        const first = e.children.find((c) => c.name === 'tspan');
        const x = numOf(e.attrs.x ?? first?.attrs.x, 0);
        const y = numOf(e.attrs.y ?? first?.attrs.y, 0);
        const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
        const size = Math.max(4, st.size * k);
        const font = matchFont(st.font);
        if (font !== st.font.split(',')[0].trim().replace(/^['"]|['"]$/g, '')) notes.add('Typefaces SocriaUX does not have were matched to the nearest it does.');
        const width = approxMeasure(words, font, st.weight, size, st.italic) + size * 0.4;
        const [bx, by] = apply(m, x, y);
        const left = st.anchor === 'middle' ? bx - width / 2 : st.anchor === 'end' ? bx - width : bx;
        const rot = Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI);
        stats.texts++;
        const colour = typeof st.fill === 'string' ? st.fill : '#000000';
        return [
          withOpacity({
            id: nid('t'),
            type: 'text',
            name: e.attrs.id ?? words.slice(0, 28),
            text: words,
            font,
            weight: st.weight,
            ...(st.italic ? { italic: true } : {}),
            size: r2(size),
            lineHeight: 1.2,
            tracking: 0,
            align: st.anchor === 'middle' ? 'center' : st.anchor === 'end' ? 'right' : 'left',
            valign: 'top',
            color: colour.slice(0, 7),
            x: left,
            y: by - size * 0.95,
            w: Math.max(8, width),
            h: size * 1.25,
            ...(rot ? { rotation: rot } : {}),
          }),
        ].filter((n): n is Record<string, unknown> => !!n);
      }
      case 'image': {
        const href = e.attrs.href ?? e.attrs['xlink:href'] ?? '';
        if (!/^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/.test(href) && !/^https:\/\//.test(href)) {
          notes.add('Pictures linked from local files or insecure addresses were left out.');
          stats.skipped++;
          return [];
        }
        const w = numOf(e.attrs.width, 0);
        const h = numOf(e.attrs.height, 0);
        if (!(w > 0) || !(h > 0)) return [];
        const [ax, ay] = apply(m, numOf(e.attrs.x, 0), numOf(e.attrs.y, 0));
        const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
        const asset = nid('a');
        assets.push({ id: asset, kind: 'image', src: href, width: w, height: h, name: e.attrs.id ?? 'Imported picture', source: 'upload' });
        stats.images++;
        const rot = Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI);
        return [withOpacity({ id: nid('i'), type: 'image', asset, fit: 'contain', x: ax, y: ay, w: w * k, h: h * k, ...(rot ? { rotation: rot } : {}) })].filter((n): n is Record<string, unknown> => !!n);
      }
      default:
        stats.skipped++;
        return [];
    }
  };

  const kids = svg.children.flatMap((c) => walk(c, ROOT_STYLE, IDENTITY, 1));
  if (!kids.length) return { group: null, assets, notes: [...notes, 'Nothing in that file could be drawn.'], stats, preferEmbed: unsupported > 0 };
  // fitted into the target, uniformly, centred: by the drawing's declared size, else by its content
  const content = boundsOf(kids);
  const dw = W || content.x + content.w - (ox || 0);
  const dh = H || content.y + content.h - (oy || 0);
  const k = Math.min(target.w / Math.max(1, dw), target.h / Math.max(1, dh));
  const gx = target.x + (target.w - dw * k) / 2;
  const gy = target.y + (target.h - dh * k) / 2;
  const scaled = kids.map((n) => scaleRaw(offset(n, -(ox || 0), -(oy || 0)), k));
  const box = boundsOf(scaled);
  return {
    group: { id: nid('g'), type: 'group', name: opts.name?.slice(0, 60) || 'Imported SVG', x: gx + box.x, y: gy + box.y, w: Math.max(1, box.w), h: Math.max(1, box.h), children: scaled.map((n) => offset(n, -box.x, -box.y)) },
    assets,
    notes: [...notes],
    stats,
    preferEmbed: unsupported > 2 || unsupported > (stats.paths + stats.texts) / 4,
  };
}

function textOf(e: El): string {
  return e.text + e.children.map((c) => (c.name === 'tspan' || c.name === 'textPath' || c.name === 'a' ? ` ${textOf(c)}` : '')).join('');
}
function boundsOf(nodes: Record<string, unknown>[]) {
  const xs = nodes.map((n) => n.x as number);
  const ys = nodes.map((n) => n.y as number);
  const x1 = nodes.map((n) => (n.x as number) + (n.w as number));
  const y1 = nodes.map((n) => (n.y as number) + (n.h as number));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...x1) - x, h: Math.max(...y1) - y };
}
const offset = (n: Record<string, unknown>, dx: number, dy: number) => ({ ...n, x: (n.x as number) + dx, y: (n.y as number) + dy });
/** A raw imported node scaled about the origin (its box, its type and strokes in proportion). */
function scaleRaw(n: Record<string, unknown>, k: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...n, x: (n.x as number) * k, y: (n.y as number) * k, w: Math.max(1, (n.w as number) * k), h: Math.max(1, (n.h as number) * k) };
  if (n.type === 'text') out.size = Math.max(4, (n.size as number) * k);
  if (n.type === 'shape' && n.stroke) {
    const s = n.stroke as { width: number; dash?: number[] };
    out.stroke = { ...s, width: Math.max(0.25, s.width * k), ...(s.dash ? { dash: s.dash.map((d) => d * k) } : {}) };
  }
  if (n.type === 'group') out.children = (n.children as Record<string, unknown>[]).map((c) => scaleRaw(c, k));
  return out;
}

/** The SVG whole, as a picture (what cannot be edited here is kept exactly as drawn); scripts, handlers and external
 * references removed first. A picture in SVG is drawn by the browser as an image, which never runs scripts. */
export function embedSvg(src: string): { src: string; width: number; height: number } {
  const svg = parseSvgXml(src);
  const vb = (svg.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  const width = numOf(svg.attrs.width, vb.length === 4 ? vb[2] : 600) || 600;
  const height = numOf(svg.attrs.height, vb.length === 4 ? vb[3] : 400) || 400;
  const clean = src
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*)("|')\s*(?:javascript|https?|file):[^"']*\2/gi, '$1$2#$2');
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`, width: Math.round(width), height: Math.round(height) };
}
