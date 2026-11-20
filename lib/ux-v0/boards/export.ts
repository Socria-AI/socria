// lib/ux-v0/boards/export.ts — a board delivered: its overview as one picture (with or without its notes), the
// design-system overview it shows, the manifest of an export, and the board as a file of its own.
//
// Exporting the OVERVIEW is not exporting the MATERIALS: the overview is the presentation (the board as arranged,
// each material drawn small); the materials go out in their own formats through their own exporters (a poster as
// PNG/PDF/SVG through Graphics, a website through the website export), listed in a manifest by material id. A
// website cannot be drawn into a picture by the browser, so the overview shows it as a schematic of its page (its
// faces, its colours, its opening words), said as such.

import { describeForm, figureFor } from '../form';
import { fontStack } from '../fonts';
import { layoutText, type Measure } from '../graphics/text';
import type { TextNode } from '../graphics/doc';
import { shapeRings, svgPath, type ShapeRecipe } from '../shape';

/** A recipe of the shape system as an SVG path in a 0–100 box. */
const recipeSvg = (r: ShapeRecipe, fill: string) => `<path d="${svgPath(shapeRings(r), ['organic', 'super', 'rings', 'arc'].includes(r.kind))}" fill="${fill}" fill-rule="evenodd"/>`;
import { bounds, normalizeBoard, type BoardState, type Material } from './model';
import type { MasterDesignSystem } from './system';

export const BOARD_FORMAT = 'socriaux.board/1';
export const EXPORT_FORMAT = 'socriaux.board-export/1';
/** The face the board's own words (labels, notes, headings) are set in, in exports. */
export const BOARD_FACE = 'Inter';

const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lines of words wrapped to a width, measured as the face sets them. */
function wrap(text: string, w: number, size: number, measure?: Measure, weight = 400): string[] {
  const t = { id: 't', type: 'text', role: 'body', text, font: BOARD_FACE, weight, size, lineHeight: 1.4, tracking: 0, align: 'left', valign: 'top', color: '#000', x: 0, y: 0, w, h: 10000, rotation: 0, opacity: 1 } as unknown as TextNode;
  return layoutText(t, measure).lines.map((l) => l.text);
}

/** Words set as SVG text lines in a box. */
function textBlock(lines: readonly string[], x: number, y: number, size: number, color: string, weight = 400, face = BOARD_FACE): string {
  return `<text font-family="${esc(fontStack(face))}" font-size="${n2(size)}" font-weight="${weight}" fill="${color}">${lines.map((l, i) => `<tspan x="${n2(x)}" y="${n2(y + size * (1 + i * 1.4))}">${esc(l)}</tspan>`).join('')}</text>`;
}

/** The design system drawn: its palette, its faces, its shapes and its rules (the board's system node, and exports). */
export function systemOverviewSvg(sys: MasterDesignSystem, w: number, h: number, id = 'sys', measure?: Measure): string {
  const c = sys.tokens.colors;
  const pad = w * 0.05;
  const out: string[] = [`<rect width="${n2(w)}" height="${n2(h)}" fill="${c.background}"/>`];
  out.push(textBlock([sys.name], pad, pad * 0.6, w * 0.045, c.text, 700, sys.tokens.fonts.display));
  out.push(textBlock([`${sys.direction.name} · ${sys.direction.language.replace(/-/g, ' ')}`], pad, pad * 0.6 + w * 0.06, w * 0.018, c.muted, 500));
  // the palette
  const sy = h * 0.25;
  const swatches: [string, string][] = [['background', c.background], ['surface', c.surface], ['text', c.text], ['muted', c.muted], ['accent', c.accent], ...(sys.tokens.accent2 ? ([['second accent', sys.tokens.accent2]] as [string, string][]) : []), ['accent text', c.accentText], ['line', c.line]];
  const sw = (w - pad * 2) / swatches.length;
  swatches.forEach(([k, v], i) => {
    out.push(`<rect x="${n2(pad + i * sw)}" y="${n2(sy)}" width="${n2(sw - 8)}" height="${n2(h * 0.16)}" fill="${v}" stroke="${c.line}" stroke-width="1"/>`);
    out.push(textBlock([k, v.toUpperCase()], pad + i * sw, sy + h * 0.16 + 4, Math.max(9, w * 0.0125), c.muted));
  });
  // the faces, two columns: the specimen above, its name and role under it (never beside, where long names collide)
  const ty = h * 0.47;
  const col = (w - pad * 2) / 2;
  const big = Math.min(w * 0.085, h * 0.13);
  const label = Math.max(10, w * 0.017);
  for (const [i, face, weight, role] of [[0, sys.tokens.fonts.display, sys.weights.display, 'headlines'], [1, sys.tokens.fonts.body, sys.weights.body, 'text']] as const) {
    const x = pad + i * col;
    out.push(textBlock(['Aa'], x, ty, big, c.text, weight, face));
    out.push(textBlock([...wrap(`${face} ${weight}`, col - 24, label, measure, 600).slice(0, 2), role], x, ty + big * 1.18, label, c.text, 600));
  }
  // the shapes
  if (sys.shape) {
    const s = Math.min(h * 0.16, (w - pad * 2) / 6);
    for (let i = 0; i < 4; i++) {
      const r = figureFor(sys.shape, (['mass', 'echo', 'cut', 'edge'] as const)[i], i, `overview|${id}`);
      out.push(`<g transform="translate(${n2(pad + i * (s + 18))} ${n2(h * 0.76)})"><svg width="${n2(s)}" height="${n2(s)}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${recipeSvg(r, i % 2 ? c.text : c.accent)}</svg></g>`);
    }
    out.push(textBlock(wrap(describeForm(sys.shape), w * 0.38, Math.max(9, w * 0.014), measure), pad + 4 * (s + 18) + 12, h * 0.76, Math.max(9, w * 0.014), c.muted));
  } else out.push(textBlock(wrap(sys.constraints.slice(0, 2).join(' '), w - pad * 2, Math.max(9, w * 0.014), measure), pad, h * 0.78, Math.max(9, w * 0.014), c.muted));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}" height="${n2(h)}" viewBox="0 0 ${n2(w)} ${n2(h)}" data-board-system="${esc(id)}">${out.join('')}</svg>`;
}

export interface WebsiteInfo {
  name: string;
  title: string;
  display: string;
  body: string;
  colors: { background: string; text: string; accent: string; accentText: string; muted: string };
  sections: number;
}

/** A website drawn as a schematic of its page: its frame, its opening words in its face, its colours (said so). */
export function websiteSchematicSvg(info: WebsiteInfo | null, w: number, h: number, mobile: boolean): string {
  const c = info?.colors ?? { background: '#ffffff', text: '#222222', accent: '#888888', accentText: '#ffffff', muted: '#777777' };
  const bar = Math.max(18, h * 0.05);
  const foot = Math.max(20, h * 0.04);
  const out = [`<rect width="${n2(w)}" height="${n2(h)}" rx="${mobile ? 24 : 8}" fill="#1f1f22"/>`, `<rect x="6" y="${n2(bar)}" width="${n2(w - 12)}" height="${n2(h - bar - foot)}" fill="${c.background}"/>`];
  out.push(`<circle cx="${n2(bar * 0.7)}" cy="${n2(bar / 2)}" r="${n2(bar * 0.18)}" fill="#ff5f57"/><circle cx="${n2(bar * 1.3)}" cy="${n2(bar / 2)}" r="${n2(bar * 0.18)}" fill="#febc2e"/><circle cx="${n2(bar * 1.9)}" cy="${n2(bar / 2)}" r="${n2(bar * 0.18)}" fill="#28c840"/>`);
  if (info) {
    const pad = w * 0.07;
    out.push(textBlock([info.name], pad, bar + h * 0.03, Math.max(10, w * 0.022), c.text, 700, info.display));
    const size = Math.max(14, w * (mobile ? 0.1 : 0.06));
    out.push(textBlock(wrap(info.title, w - pad * 2, size, undefined, 700).slice(0, 3), pad, bar + h * 0.16, size, c.text, 700, info.display));
    out.push(`<rect x="${n2(pad)}" y="${n2(h * 0.62)}" width="${n2(Math.min(w * 0.3, 220))}" height="${n2(Math.max(16, h * 0.06))}" rx="4" fill="${c.accent}"/>`);
    for (let i = 0; i < Math.min(4, info.sections - 1); i++) out.push(`<rect x="${n2(pad)}" y="${n2(h * 0.74 + i * h * 0.05)}" width="${n2((w - pad * 2) * (0.9 - i * 0.18))}" height="${n2(h * 0.02)}" fill="${c.muted}" opacity="0.35"/>`);
  }
  const cap = Math.max(9, Math.min(13, foot * 0.5));
  out.push(textBlock([mobile ? 'Schematic of the page' : 'Schematic of the page: the website itself opens in the website editor'], 12, h - foot / 2 - cap * 0.85, cap, '#c9c9cf', 500));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}" height="${n2(h)}" viewBox="0 0 ${n2(w)} ${n2(h)}">${out.join('')}</svg>`;
}

export interface OverviewContext {
  /** a material drawn as SVG for its place on the board (graphics, mockups, website schematics), or null */
  materialSvg: (m: Material, idPrefix: string) => { svg: string; w: number; h: number } | null;
  /** a reference picture's address (a data address, for a file that loads nothing from outside) */
  refHref: (assetId: string) => string;
  annotations: boolean;
  measure?: Measure;
}

/** A nested SVG fitted into a box. */
const fit = (svg: string, x: number, y: number, w: number, h: number) => svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" preserveAspectRatio="xMidYMid meet"`);

/** The board as arranged, as one SVG: headings, materials with their labels, the system, pictures, and (when asked)
 * the notes and their connectors. Returned with its size. */
export function boardOverviewSvg(b: BoardState, ctx: OverviewContext): { svg: string; w: number; h: number } {
  const shown = b.nodes.filter((n) => ctx.annotations || n.type !== 'note');
  const bb = bounds(shown);
  const pad = 120;
  const ox = pad - bb.x;
  const oy = pad - bb.y;
  const W = Math.max(400, bb.w + pad * 2);
  const H = Math.max(300, bb.h + pad * 2 + 60);
  const ink = '#1d1c19';
  const out: string[] = [`<rect width="${n2(W)}" height="${n2(H)}" fill="${b.background.color}"/>`];
  const at = (id: string) => b.nodes.find((n) => n.id === id);
  // an arrow to a note goes with the notes; one between two things on the board stays
  for (const c of b.connectors) {
    const p = at(c.from);
    const q = at(c.to);
    if (!p || !q || !shown.includes(p) || !shown.includes(q)) continue;
    const x1 = p.x + p.w / 2 + ox;
    const y1 = p.y + oy;
    const x2 = q.x + q.w / 2 + ox;
    const y2 = q.y + q.h + oy + 46;
    out.push(`<path d="M${n2(x1)} ${n2(y1)} L${n2(x2)} ${n2(y2)}" stroke="${ink}" stroke-opacity="0.45" stroke-width="2" fill="none" marker-end="url(#bd-arrow)"/>`);
  }
  for (const n of shown) {
    const x = n.x + ox;
    const y = n.y + oy;
    if (n.type === 'heading') out.push(textBlock([n.text], x, y, n.level === 1 ? 64 : 30, ink, n.level === 1 ? 700 : 600));
    else if (n.type === 'material') {
      const m = b.materials.find((mm) => mm.id === n.material);
      if (!m) continue;
      const drawn = ctx.materialSvg(m, `ov-${n.id}-`);
      out.push(`<rect x="${n2(x + 6)}" y="${n2(y + 10)}" width="${n2(n.w)}" height="${n2(n.h)}" fill="#000" opacity="0.08"/>`);
      out.push(drawn ? fit(drawn.svg, x, y, n.w, n.h) : `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(n.w)}" height="${n2(n.h)}" fill="#ffffff" stroke="#c9c6bd"/>`);
      out.push(textBlock([m.name], x, y + n.h + 10, 18, ink, 600));
    } else if (n.type === 'system' && b.system) out.push(fit(systemOverviewSvg(b.system, n.w, n.h, `ov-${n.id}`, ctx.measure), x, y, n.w, n.h));
    else if (n.type === 'reference') {
      const href = ctx.refHref(n.asset);
      if (href) out.push(`<image href="${esc(href)}" x="${n2(x)}" y="${n2(y)}" width="${n2(n.w)}" height="${n2(n.h)}" preserveAspectRatio="xMidYMid slice"/>`);
      if (n.caption) out.push(textBlock([n.caption], x, y + n.h + 8, 15, ink));
    } else if (n.type === 'note') {
      const lines = wrap(n.text, n.w - 32, 15, ctx.measure);
      const nh = Math.max(n.h, lines.length * 21 + 32);
      out.push(`<rect x="${n2(x)}" y="${n2(y)}" width="${n2(n.w)}" height="${n2(nh)}" rx="6" fill="${n.generated ? '#fffdf5' : '#fff7d6'}" stroke="#d8d0b4"/>`);
      out.push(textBlock(lines, x + 16, y + 10, 15, ink));
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n2(W)}" height="${n2(H)}" viewBox="0 0 ${n2(W)} ${n2(H)}"><defs><marker id="bd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${ink}" fill-opacity="0.55"/></marker></defs>${out.join('')}</svg>`;
  return { svg, w: W, h: H };
}

export interface ManifestEntry {
  file: string;
  /** the material it is, by id (the board overview and the board file have none) */
  material?: string;
  name: string;
  kind: string;
  format?: string;
  width?: number;
  height?: number;
  unit?: string;
}

/** What an export holds: every file, the material it comes from, and the system they share. */
export function manifestOf(b: BoardState, files: readonly ManifestEntry[], now = Date.now()) {
  return {
    format: EXPORT_FORMAT,
    board: b.brief?.name ?? b.system?.name ?? 'Board',
    exportedAt: new Date(now).toISOString(),
    system: b.system ? { name: b.system.name, direction: b.system.direction.name, colors: b.system.tokens.colors, fonts: b.system.tokens.fonts, weights: b.system.weights } : null,
    files,
  };
}

/** The board as a file of its own: open it here again. */
export function boardFile(b: BoardState): string {
  return `${JSON.stringify({ format: BOARD_FORMAT, savedAt: new Date().toISOString(), board: b }, null, 1)}\n`;
}

/** A board file opened (held to its shape); null when it is not one. */
export function openBoardFile(text: string): BoardState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (r.format !== BOARD_FORMAT) return null;
  return normalizeBoard(r.board);
}
