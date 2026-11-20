// lib/ux-v0/boards/mockup.ts — a material presented in a context: on a phone, framed on a wall, printed on a box,
// on a billboard, on a laptop.
//
// A mockup is drawn, not photographed: a vector scene in the system's colours, with the source design's own SVG
// nested in it (its text still text, at any size). It holds a reference to the source material, never a copy: drawn
// again from the source whenever the source changes, and swapped by pointing it at another material. No picture is
// generated; a photographic mockup would need an image provider SocriaUX does not call.

import type { MasterDesignSystem } from './system';
import type { MockupTemplate } from './model';

export interface MockupSource {
  /** the source artboard as SVG (lib/ux-v0/graphics/render.ts) */
  svg: string;
  w: number;
  h: number;
  /** its ground, for what shows around it when it is fitted whole */
  ground?: string | null;
}

/** The scene size of each template (width × height, in scene units). */
export const SCENE: Record<MockupTemplate, { w: number; h: number }> = {
  phone: { w: 744, h: 1200 },
  'poster-wall': { w: 984, h: 1200 },
  box: { w: 1260, h: 1200 },
  billboard: { w: 1600, h: 940 },
  laptop: { w: 1500, h: 1000 },
};

const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A nested copy of the source SVG placed in a box, fitted whole (meet) or filling it (slice). */
export function nest(src: MockupSource, x: number, y: number, w: number, h: number, fit: 'meet' | 'slice'): string {
  return src.svg.replace(/^<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" preserveAspectRatio="xMidYMid ${fit}"`);
}

/** A colour mixed toward white (k > 0) or black (k < 0). */
function mix(hex: string, k: number): string {
  const v = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!v) return hex;
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  const t = k >= 0 ? 255 : 0;
  const a = Math.abs(k);
  return `#${c.map((x) => Math.round(x + (t - x) * a).toString(16).padStart(2, '0')).join('')}`;
}

const empty = (x: number, y: number, w: number, h: number, ink: string) =>
  `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${mix(ink, 0.9)}"/><text x="${n2(x + w / 2)}" y="${n2(y + h / 2)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${n2(Math.max(14, w / 18))}" fill="${ink}">Choose a design to present</text>`;

/**
 * A mockup scene as SVG (see the head of this file). `id` keeps the scene's gradients and filters apart from any
 * other on the same page. Without a source the scene says it is waiting for one.
 */
export function mockupSvg(template: MockupTemplate, src: MockupSource | null, sys: MasterDesignSystem | null, id: string): { svg: string; w: number; h: number } {
  const { w: W, h: H } = SCENE[template];
  const c = sys?.tokens.colors ?? { background: '#f2efe8', surface: '#ffffff', text: '#1b1a17', muted: '#6b675e', accent: '#3a5a40', accentText: '#ffffff', line: '#d9d4c7' };
  const p = id.replace(/[^\w-]/g, '');
  const defs: string[] = [`<filter id="${p}-sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>`];
  const body: string[] = [];
  if (template === 'phone') {
    defs.push(`<linearGradient id="${p}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c.background, 0.15)}"/><stop offset="1" stop-color="${mix(c.background, -0.08)}"/></linearGradient>`);
    body.push(`<rect width="${W}" height="${H}" fill="url(#${p}-bg)"/>`);
    const px = 172, py = 96, pw = 400, ph = 840, r = 62;
    body.push(`<rect x="${px + 14}" y="${py + 40}" width="${pw}" height="${ph}" rx="${r}" fill="#000" opacity="0.28" filter="url(#${p}-sh)"/>`);
    body.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${r}" fill="#17171a"/><rect x="${px + 3}" y="${py + 3}" width="${pw - 6}" height="${ph - 6}" rx="${r - 3}" fill="none" stroke="#3a3a40" stroke-width="2"/>`);
    const sx = px + 16, sy = py + 16, sw = pw - 32, sh = ph - 32;
    defs.push(`<clipPath id="${p}-screen"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${r - 16}"/></clipPath>`);
    body.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${r - 16}" fill="${src?.ground ?? '#ffffff'}"/>`);
    // the design across the screen's width, centred in its height (a post shown as the app shows it)
    const fitH = src ? Math.min(sh, (sw * src.h) / src.w) : sh;
    body.push(`<g clip-path="url(#${p}-screen)">${src ? nest(src, sx, sy + (sh - fitH) / 2, sw, fitH, 'meet') : empty(sx, sy, sw, sh, c.text)}</g>`);
    body.push(`<rect x="${px + pw / 2 - 52}" y="${py + 26}" width="104" height="26" rx="13" fill="#17171a"/>`);
  } else if (template === 'poster-wall') {
    body.push(`<rect width="${W}" height="${H}" fill="${mix(c.surface === '#ffffff' ? c.background : c.surface, -0.04)}"/>`);
    body.push(`<rect y="${H * 0.86}" width="${W}" height="${H * 0.14}" fill="${mix(c.background, -0.18)}"/>`);
    const fw = 560, fh = src ? Math.min(820, (fw * src.h) / src.w + 80) : 780;
    const fx = (W - fw) / 2, fy = H * 0.86 - fh - 70;
    body.push(`<rect x="${fx + 18}" y="${fy + 30}" width="${fw}" height="${fh}" fill="#000" opacity="0.26" filter="url(#${p}-sh)"/>`);
    body.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="#1d1c1a"/><rect x="${fx + 12}" y="${fy + 12}" width="${fw - 24}" height="${fh - 24}" fill="#fbfaf7"/>`);
    const ix = fx + 40, iy = fy + 40, iw = fw - 80, ih = fh - 80;
    body.push(src ? nest(src, ix, iy, iw, ih, 'meet') : empty(ix, iy, iw, ih, c.text));
  } else if (template === 'box') {
    defs.push(`<linearGradient id="${p}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c.background, 0.2)}"/><stop offset="1" stop-color="${mix(c.background, -0.06)}"/></linearGradient>`);
    body.push(`<rect width="${W}" height="${H}" fill="url(#${p}-bg)"/>`);
    // an upright box seen from the front left: the label on the front face, the side and the top in the system's colours
    const fw = 470, fh = src ? Math.max(420, Math.min(720, (fw * src.h) / src.w)) : 640;
    const x0 = 300, y0 = H - 150 - fh - 0.18 * fw, slope = 0.18, sw = 300, rise = 0.32;
    body.push(`<ellipse cx="${x0 + fw * 0.75}" cy="${H - 120}" rx="${fw * 0.95}" ry="46" fill="#000" opacity="0.22" filter="url(#${p}-sh)"/>`);
    const front = `M${x0} ${y0} L${x0 + fw} ${y0 + slope * fw} L${x0 + fw} ${y0 + slope * fw + fh} L${x0} ${y0 + fh} Z`;
    const side = `M${x0 + fw} ${y0 + slope * fw} L${x0 + fw + sw} ${y0 + slope * fw - rise * sw} L${x0 + fw + sw} ${y0 + slope * fw - rise * sw + fh} L${x0 + fw} ${y0 + slope * fw + fh} Z`;
    const top = `M${x0} ${y0} L${x0 + sw} ${y0 - rise * sw} L${x0 + fw + sw} ${y0 + slope * fw - rise * sw} L${x0 + fw} ${y0 + slope * fw} Z`;
    body.push(`<path d="${side}" fill="${mix(c.accent, -0.25)}"/><path d="${top}" fill="${mix(c.accent, 0.25)}"/><path d="${front}" fill="${src?.ground ?? c.surface}"/>`);
    if (src) {
      // the label mapped onto the front face: x runs along its top edge, y straight down
      body.push(`<g transform="matrix(${n2(fw / src.w)} ${n2((slope * fw) / src.w)} 0 ${n2(fh / src.h)} ${x0} ${y0})">${nest(src, 0, 0, src.w, src.h, 'meet')}</g>`);
    } else body.push(`<g transform="matrix(1 ${slope} 0 1 0 0)">${empty(x0, y0 - slope * x0, fw, fh, c.text)}</g>`);
    body.push(`<path d="${front}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="2"/><path d="${side}" fill="#000" opacity="0.08"/>`);
  } else if (template === 'billboard') {
    defs.push(`<linearGradient id="${p}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0ec"/><stop offset="1" stop-color="#eef3f6"/></linearGradient>`);
    body.push(`<rect width="${W}" height="${H}" fill="url(#${p}-sky)"/><rect y="${H * 0.84}" width="${W}" height="${H * 0.16}" fill="#b9b8ae"/>`);
    const bw = 1200, bh = 520, bx = (W - bw) / 2, by = 110;
    body.push(`<rect x="${bx + bw * 0.22}" y="${by + bh}" width="26" height="${H * 0.84 - by - bh}" fill="#55534c"/><rect x="${bx + bw * 0.76}" y="${by + bh}" width="26" height="${H * 0.84 - by - bh}" fill="#55534c"/>`);
    body.push(`<rect x="${bx - 18}" y="${by - 18}" width="${bw + 36}" height="${bh + 36}" fill="#2b2a27"/><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${src?.ground ?? c.surface}"/>`);
    body.push(src ? nest(src, bx, by, bw, bh, 'meet') : empty(bx, by, bw, bh, c.text));
  } else {
    defs.push(`<linearGradient id="${p}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c.background, 0.12)}"/><stop offset="1" stop-color="${mix(c.background, -0.06)}"/></linearGradient>`);
    body.push(`<rect width="${W}" height="${H}" fill="url(#${p}-bg)"/>`);
    const lw = 1060, lh = 660, lx = (W - lw) / 2, ly = 110;
    body.push(`<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="28" fill="#1c1c1f"/>`);
    const sx = lx + 30, sy = ly + 30, sw = lw - 60, sh = lh - 60;
    body.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="${src?.ground ?? '#ffffff'}"/>`);
    body.push(src ? nest(src, sx, sy, sw, sh, 'meet') : empty(sx, sy, sw, sh, c.text));
    body.push(`<path d="M${lx - 120} ${ly + lh + 10} L${lx + lw + 120} ${ly + lh + 10} L${lx + lw + 70} ${ly + lh + 62} L${lx - 70} ${ly + lh + 62} Z" fill="#c9c8c4"/><rect x="${lx + lw / 2 - 90}" y="${ly + lh + 10}" width="180" height="12" rx="6" fill="#b2b1ac"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-mockup="${esc(template)}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
  return { svg, w: W, h: H };
}
