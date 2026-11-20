// lib/ux-v0/graphics/render.ts — a graphics document drawn as SVG.
//
// SVG, not a canvas library: text stays text (selectable, exportable, editable), vectors stay exact at any zoom,
// masks and gradients are native, the same markup is the canvas the designer edits and the file they download, and a
// browser rasterises it for PNG and PDF. No dependency. Every element is generated from a validated document
// (lib/ux-v0/graphics/doc.ts): words are escaped, colours are checked hex, paths come from SocriaUX's own path parser,
// picture addresses are https, data:image or an upload's — nothing a document says can become a script.
//
// Each node is drawn in its own box: translate(x, y), then rotate about the box's centre, then its opacity. Groups
// nest the same way. Every node's element carries data-gfx-id, which the canvas uses to select it.

import { fontStack } from '../fonts';
import { parsePath, shapeRings, svgPath, type Ring } from '../shape';
import type { Artboard, ChartNode, GraphicDoc, ImageNode, Node, Paint, ShapeNode, TextNode } from './doc';
import { approxMeasure, layoutText, type Measure } from './text';

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

/** A ring of points (0–100 box) as a path's data. */
const ringPath = (rings: readonly Ring[], smooth: boolean) => svgPath(rings, smooth);

class Defs {
  items: string[] = [];
  constructor(private prefix: string) {}
  id(base: string) {
    return `${this.prefix}${base}`.replace(/[^\w-]/g, '-');
  }
  paint(p: Paint | null, key: string): string {
    if (p === null) return 'none';
    if (typeof p === 'string') return p;
    const id = this.id(`g-${key}`);
    const stops = p.stops.map((s) => `<stop offset="${n2(s.at)}" stop-color="${s.color.slice(0, 7)}"${s.color.length === 9 ? ` stop-opacity="${n2(parseInt(s.color.slice(7), 16) / 255)}"` : ''}/>`).join('');
    if (p.type === 'radial') this.items.push(`<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.6">${stops}</radialGradient>`);
    else this.items.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${n2(p.angle - 90)} 0.5 0.5)">${stops}</linearGradient>`);
    return `url(#${id})`;
  }
}

/** A colour with an alpha channel as fill and fill-opacity. */
function fillAttrs(c: string, attr = 'fill'): string {
  if (c.length === 9) return `${attr}="${c.slice(0, 7)}" ${attr}-opacity="${n2(parseInt(c.slice(7), 16) / 255)}"`;
  return `${attr}="${c}"`;
}

function boxTransform(n: Node): string {
  const parts = [`translate(${n2(n.x)} ${n2(n.y)})`];
  if (n.rotation) parts.push(`rotate(${n2(n.rotation)} ${n2(n.w / 2)} ${n2(n.h / 2)})`);
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

function textEl(n: TextNode, measure: Measure): string {
  const L = layoutText(n, measure);
  const anchor = n.align === 'center' ? 'middle' : n.align === 'right' ? 'end' : 'start';
  const ax = n.align === 'center' ? L.boxW / 2 : n.align === 'right' ? L.boxW : 0;
  const top = n.valign === 'middle' ? (L.boxH - L.height) / 2 : n.valign === 'bottom' ? L.boxH - L.height : 0;
  // the first baseline: the line's half-leading above, the face's ascent (about 0.78 em) below the top of the line
  const first = top + (n.size * Math.max(1, n.lineHeight) - n.size) / 2 + n.size * 0.8;
  const tspans = L.lines.map((l, i) => `<tspan x="${n2(ax)}" y="${n2(first + i * L.leading)}">${esc(l.text) || ' '}</tspan>`).join('');
  const stroke = n.stroke ? ` stroke="${n.stroke.color.slice(0, 7)}" stroke-width="${n2(n.stroke.width)}" paint-order="stroke" stroke-linejoin="round"` : '';
  const body = `<text font-family="${esc(fontStack(n.font))}" font-size="${n2(n.size)}" font-weight="${n.weight}"${n.italic ? ' font-style="italic"' : ''} letter-spacing="${n2((n.tracking / 1000) * n.size)}" text-anchor="${anchor}" ${fillAttrs(n.color)}${stroke} xml:space="preserve">${tspans}</text>`;
  return n.vertical ? `<g transform="translate(0 ${n2(n.h)}) rotate(-90)">${body}</g>` : body;
}

function shapeEl(n: ShapeNode, defs: Defs): string {
  const fill = n.shape === 'line' ? 'none' : defs.paint(n.fill, n.id);
  const s = n.stroke;
  const stroke = s ? ` stroke="${s.color.slice(0, 7)}"${s.color.length === 9 ? ` stroke-opacity="${n2(parseInt(s.color.slice(7), 16) / 255)}"` : ''} stroke-width="${n2(s.width)}"${s.join ? ` stroke-linejoin="${s.join}"` : ''}${s.cap ? ` stroke-linecap="${s.cap}"` : ''}${s.dash?.length ? ` stroke-dasharray="${s.dash.map(n2).join(' ')}"` : ''}` : '';
  const f = fill.startsWith('#') && fill.length === 9 ? fillAttrs(fill) : `fill="${fill}"`;
  switch (n.shape) {
    case 'rect':
      return `<rect width="${n2(n.w)}" height="${n2(n.h)}"${n.radius ? ` rx="${n2(Math.min(n.radius, n.w / 2, n.h / 2))}"` : ''} ${f}${stroke}/>`;
    case 'ellipse':
      return `<ellipse cx="${n2(n.w / 2)}" cy="${n2(n.h / 2)}" rx="${n2(n.w / 2)}" ry="${n2(n.h / 2)}" ${f}${stroke}/>`;
    case 'line':
      return `<line x1="0" y1="${n2(n.h / 2)}" x2="${n2(n.w)}" y2="${n2(n.h / 2)}"${stroke || ' stroke="#111111" stroke-width="2"'}/>`;
    case 'polygon':
      return `<polygon points="${regularPolygon(n.w, n.h, n.sides ?? 6)}" ${f}${stroke}/>`;
    case 'star':
      return `<polygon points="${regularPolygon(n.w, n.h, n.sides ?? 5, n.inner ?? 0.45)}" ${f}${stroke}/>`;
    case 'path':
    case 'recipe': {
      const rings = n.shape === 'path' ? parsePath(n.path ?? '') : n.recipe ? shapeRings(n.recipe) : null;
      if (!rings || !rings.length) return '';
      const smooth = n.shape === 'recipe' && !!n.recipe && ['organic', 'super', 'rings', 'arc'].includes(n.recipe.kind);
      return `<path d="${ringPath(rings, smooth)}" fill-rule="evenodd" transform="scale(${n2(n.w / 100)} ${n2(n.h / 100)})" ${f}${stroke}${stroke ? ' vector-effect="non-scaling-stroke"' : ''}/>`;
    }
  }
}

function imageEl(n: ImageNode, doc: GraphicDoc, defs: Defs, opts: RenderOptions): string {
  const asset = doc.assets.find((x) => x.id === n.asset);
  if (!asset) return `<rect width="${n2(n.w)}" height="${n2(n.h)}" fill="#e6e2d8"/><text x="${n2(n.w / 2)}" y="${n2(n.h / 2)}" text-anchor="middle" font-family="system-ui" font-size="14" fill="#5d5a52">Picture missing</text>`;
  const href = opts.href ? opts.href(asset.id, asset.src) : asset.src;
  // covering: the picture scaled to fill the box, its focus kept in view; containing: fitted whole
  const k = n.fit === 'cover' ? Math.max(n.w / asset.width, n.h / asset.height) : Math.min(n.w / asset.width, n.h / asset.height);
  const iw = asset.width * k;
  const ih = asset.height * k;
  const fx = (n.focus?.x ?? 50) / 100;
  const fy = (n.focus?.y ?? 50) / 100;
  const ix = n.fit === 'cover' ? Math.min(0, Math.max(n.w - iw, n.w / 2 - iw * fx)) : (n.w - iw) / 2;
  const iy = n.fit === 'cover' ? Math.min(0, Math.max(n.h - ih, n.h / 2 - ih * fy)) : (n.h - ih) / 2;
  const clipId = defs.id(`c-${n.id}`);
  let clipShape = `<rect width="${n2(n.w)}" height="${n2(n.h)}"${n.radius ? ` rx="${n2(n.radius)}"` : ''}/>`;
  if (n.mask === 'ellipse') clipShape = `<ellipse cx="${n2(n.w / 2)}" cy="${n2(n.h / 2)}" rx="${n2(n.w / 2)}" ry="${n2(n.h / 2)}"/>`;
  else if (n.mask && typeof n.mask === 'object') {
    const rings = shapeRings(n.mask);
    clipShape = `<path d="${ringPath(rings, ['organic', 'super', 'rings', 'arc'].includes(n.mask.kind))}" clip-rule="evenodd" transform="scale(${n2(n.w / 100)} ${n2(n.h / 100)})"/>`;
  }
  defs.items.push(`<clipPath id="${clipId}">${clipShape}</clipPath>`);
  let filter = '';
  const f = n.filter;
  if (f && (f.grayscale || (f.contrast && f.contrast !== 1) || (f.brightness && f.brightness !== 1) || f.blur)) {
    const fid = defs.id(`f-${n.id}`);
    const g = f.grayscale ?? 0;
    const sat = n2(1 - g);
    const c = f.contrast ?? 1;
    const b = f.brightness ?? 1;
    const inter = n2((1 - c) / 2);
    defs.items.push(
      `<filter id="${fid}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${g ? `<feColorMatrix type="saturate" values="${sat}"/>` : ''}${c !== 1 || b !== 1 ? `<feComponentTransfer><feFuncR type="linear" slope="${n2(c * b)}" intercept="${inter}"/><feFuncG type="linear" slope="${n2(c * b)}" intercept="${inter}"/><feFuncB type="linear" slope="${n2(c * b)}" intercept="${inter}"/></feComponentTransfer>` : ''}${f.blur ? `<feGaussianBlur stdDeviation="${n2(f.blur)}"/>` : ''}</filter>`,
    );
    filter = ` filter="url(#${fid})"`;
  }
  return `<g clip-path="url(#${clipId})"><image href="${esc(href)}" x="${n2(ix)}" y="${n2(iy)}" width="${n2(iw)}" height="${n2(ih)}" preserveAspectRatio="none"${filter}/></g>`;
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

function nodeEl(n: Node, doc: GraphicDoc, defs: Defs, opts: RenderOptions, measure: Measure): string {
  if (n.hidden) return '';
  const op = n.opacity < 1 ? ` opacity="${n2(n.opacity)}"` : '';
  const hit = opts.hit && (n.type === 'text' || n.type === 'chart' || (n.type === 'shape' && (n.shape === 'line' || n.fill === null))) ? `<rect width="${n2(n.w)}" height="${n2(Math.max(n.h, 4))}" fill="none" pointer-events="all"/>` : '';
  const open = `<g data-gfx-id="${esc(n.id)}" transform="${boxTransform(n)}"${op}>${hit}`;
  switch (n.type) {
    case 'text':
      return `${open}${textEl(n, measure)}</g>`;
    case 'shape':
      return `${open}${shapeEl(n, defs)}</g>`;
    case 'image':
      return `${open}${imageEl(n, doc, defs, opts)}</g>`;
    case 'chart':
      return `${open}${chartEl(n, doc)}</g>`;
    case 'group': {
      let clip = '';
      if (n.clip) {
        const cid = defs.id(`gc-${n.id}`);
        defs.items.push(`<clipPath id="${cid}"><rect width="${n2(n.w)}" height="${n2(n.h)}"/></clipPath>`);
        clip = ` clip-path="url(#${cid})"`;
      }
      return `${open}<g${clip}>${n.children.map((c) => nodeEl(c, doc, defs, opts, measure)).join('')}</g></g>`;
    }
  }
}

/** One artboard as an SVG document (see the head of this file). */
export function renderArtboard(doc: GraphicDoc, board: Artboard, opts: RenderOptions = {}): string {
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
