// lib/ux-v0/dsi/colour.ts — every colour a design system may be written in, read exactly: hex (3, 4, 6, 8), named,
// rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch(), color(srgb | srgb-linear | display-p3 …), and the W3C DTCG
// colour object ({ colorSpace, components, alpha, hex }). A token keeps the colour as the source wrote it; products
// read it as sRGB hex through hexOf (out-of-gamut colours are clipped, and that is said).

import { parseColor } from '../graphics/paint';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
  clipped?: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const h2 = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');
const gamma = (c: number) => (Math.abs(c) <= 0.0031308 ? 12.92 * c : Math.sign(c) * (1.055 * Math.abs(c) ** (1 / 2.4) - 0.055));
const linear = (c: number) => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4);
const mul3 = (m: number[][], v: number[]) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

const P3_TO_SRGB = [
  [1.2249401, -0.2249404, 0.0],
  [-0.0420569, 1.0420571, 0.0],
  [-0.0196376, -0.0786361, 1.0982735],
];
const D50_TO_D65 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
const XYZ_TO_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

function fromLinear(lin: number[], a: number): Rgba {
  const g = lin.map(gamma);
  const clipped = g.some((c) => c < -0.002 || c > 1.002);
  return { r: clamp01(g[0]), g: clamp01(g[1]), b: clamp01(g[2]), a: clamp01(a), ...(clipped ? { clipped: true } : {}) };
}

function oklabToRgb(L: number, A: number, B: number, alpha: number): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return fromLinear([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s], alpha);
}

function labToRgb(L: number, A: number, B: number, alpha: number): Rgba {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const fy = (L + 16) / 116;
  const fx = fy + A / 500;
  const fz = fy - B / 200;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const d65 = mul3(D50_TO_D65, [xr * 0.96422, yr, zr * 0.82521]);
  return fromLinear(mul3(XYZ_TO_SRGB, d65), alpha);
}

/** A number from a CSS colour argument: a percentage scaled to `pct`, "none" as 0, an angle in degrees. */
function arg(s: string | undefined, pct: number): number {
  if (s === undefined || s === 'none') return 0;
  if (s.endsWith('%')) return (parseFloat(s) / 100) * pct;
  if (s.endsWith('deg')) return parseFloat(s);
  if (s.endsWith('turn')) return parseFloat(s) * 360;
  if (s.endsWith('rad')) return (parseFloat(s) * 180) / Math.PI;
  return parseFloat(s);
}

/** Any CSS or DTCG colour as RGBA (0–1), or null when it is not a colour SocriaUX can read. */
export function parseColour(input: unknown): Rgba | null {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const s = colourFromDtcg(input as Record<string, unknown>);
    return s ? parseColour(s) : null;
  }
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s || s.length > 120) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const basic = parseColor(s);
  if (basic) {
    const hx = basic.slice(1);
    return { r: parseInt(hx.slice(0, 2), 16) / 255, g: parseInt(hx.slice(2, 4), 16) / 255, b: parseInt(hx.slice(4, 6), 16) / 255, a: hx.length === 8 ? parseInt(hx.slice(6, 8), 16) / 255 : 1 };
  }
  const fn = s.match(/^(oklch|oklab|lch|lab|hwb|color)\(\s*([^)]*)\)$/);
  if (!fn) return null;
  const [main, alphaPart] = fn[2].split('/');
  const parts = main.trim().split(/[\s,]+/).filter(Boolean);
  const alpha = alphaPart === undefined ? 1 : arg(alphaPart.trim(), 1);
  if (!Number.isFinite(alpha)) return null;
  let out: Rgba | null = null;
  switch (fn[1]) {
    case 'oklch': {
      const [L, C, H] = [arg(parts[0], 1), arg(parts[1], 0.4), arg(parts[2], 1)];
      out = oklabToRgb(L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180), alpha);
      break;
    }
    case 'oklab':
      out = oklabToRgb(arg(parts[0], 1), arg(parts[1], 0.4), arg(parts[2], 0.4), alpha);
      break;
    case 'lch': {
      const [L, C, H] = [arg(parts[0], 100), arg(parts[1], 150), arg(parts[2], 1)];
      out = labToRgb(L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180), alpha);
      break;
    }
    case 'lab':
      out = labToRgb(arg(parts[0], 100), arg(parts[1], 125), arg(parts[2], 125), alpha);
      break;
    case 'hwb': {
      const h = ((arg(parts[0], 1) % 360) + 360) % 360;
      let w = arg(parts[1], 1);
      let bl = arg(parts[2], 1);
      if (w + bl > 1) [w, bl] = [w / (w + bl), bl / (w + bl)];
      const base = parseColour(`hsl(${h} 100% 50%)`);
      if (!base) return null;
      const f = (c: number) => c * (1 - w - bl) + w;
      out = { r: f(base.r), g: f(base.g), b: f(base.b), a: clamp01(alpha) };
      break;
    }
    case 'color': {
      const space = parts.shift();
      const v = parts.slice(0, 3).map((p) => arg(p, 1));
      if (v.length < 3) return null;
      if (space === 'srgb') out = { r: clamp01(v[0]), g: clamp01(v[1]), b: clamp01(v[2]), a: clamp01(alpha), ...(v.some((c) => c < 0 || c > 1) ? { clipped: true } : {}) };
      else if (space === 'srgb-linear') out = fromLinear(v, alpha);
      else if (space === 'display-p3') out = fromLinear(mul3(P3_TO_SRGB, v.map(linear)), alpha);
      else if (space === 'xyz' || space === 'xyz-d65') out = fromLinear(mul3(XYZ_TO_SRGB, v), alpha);
      else if (space === 'xyz-d50') out = fromLinear(mul3(XYZ_TO_SRGB, mul3(D50_TO_D65, v)), alpha);
      else return null;
      break;
    }
  }
  if (!out || ![out.r, out.g, out.b, out.a].every(Number.isFinite)) return null;
  return out;
}

/** The W3C DTCG colour object as a CSS colour string SocriaUX keeps (lossless for its space), or null. */
export function colourFromDtcg(v: Record<string, unknown>): string | null {
  const space = typeof v.colorSpace === 'string' ? v.colorSpace.toLowerCase() : '';
  const comps = Array.isArray(v.components) ? v.components.map((c) => (c === 'none' ? 0 : Number(c))) : [];
  const alpha = typeof v.alpha === 'number' && Number.isFinite(v.alpha) ? clamp01(v.alpha) : 1;
  if (typeof v.hex === 'string' && /^#[0-9a-f]{6}$/i.test(v.hex) && (!space || space === 'srgb')) return alpha < 1 ? `${v.hex.toLowerCase()}${h2(alpha)}` : v.hex.toLowerCase();
  if (comps.length !== 3 || !comps.every(Number.isFinite)) return typeof v.hex === 'string' && /^#[0-9a-f]{6}$/i.test(v.hex) ? v.hex.toLowerCase() : null;
  const a = alpha < 1 ? ` / ${Math.round(alpha * 1000) / 1000}` : '';
  const n = (x: number) => String(Math.round(x * 100000) / 100000);
  switch (space) {
    case 'srgb':
      return alpha < 1 ? `#${comps.map(h2).join('')}${h2(alpha)}` : `#${comps.map(h2).join('')}`;
    case 'oklch':
      return `oklch(${n(comps[0])} ${n(comps[1])} ${n(comps[2])}${a})`;
    case 'oklab':
      return `oklab(${n(comps[0])} ${n(comps[1])} ${n(comps[2])}${a})`;
    case 'lab':
    case 'cielab':
      return `lab(${n(comps[0])} ${n(comps[1])} ${n(comps[2])}${a})`;
    case 'lch':
      return `lch(${n(comps[0])} ${n(comps[1])} ${n(comps[2])}${a})`;
    case 'hsl':
      return `hsl(${n(comps[0])} ${n(comps[1])}% ${n(comps[2])}%${a})`;
    case 'hwb':
      return `hwb(${n(comps[0])} ${n(comps[1])}% ${n(comps[2])}%${a})`;
    case 'display-p3':
    case 'srgb-linear':
    case 'xyz-d65':
    case 'xyz-d50':
      return `color(${space} ${comps.map(n).join(' ')}${a})`;
    default:
      return null;
  }
}

/** The colour as sRGB hex (#rrggbb, or #rrggbbaa when not opaque); null when it is not a colour. */
export function hexA(v: unknown): string | null {
  const c = parseColour(v);
  if (!c) return null;
  return `#${h2(c.r)}${h2(c.g)}${h2(c.b)}${c.a < 0.999 ? h2(c.a) : ''}`;
}

/** The colour as opaque sRGB hex (#rrggbb): what the products draw with. */
export function hexOf(v: unknown): string | null {
  const c = parseColour(v);
  return c ? `#${h2(c.r)}${h2(c.g)}${h2(c.b)}` : null;
}

export const isColour = (v: unknown) => parseColour(v) !== null;

/** The colour as a DTCG 2025 colour object (sRGB). */
export function dtcgColour(v: unknown): { colorSpace: 'srgb'; components: [number, number, number]; alpha?: number; hex: string } | null {
  const c = parseColour(v);
  if (!c) return null;
  const r3 = (x: number) => Math.round(x * 10000) / 10000;
  return { colorSpace: 'srgb', components: [r3(c.r), r3(c.g), r3(c.b)], ...(c.a < 0.999 ? { alpha: r3(c.a) } : {}), hex: `#${h2(c.r)}${h2(c.g)}${h2(c.b)}` };
}

/** Euclidean distance in sRGB (0–441): only for saying how near two colours are, never for linking them. */
export function rgbDistance(a: string, b: string): number {
  const p = parseColour(a);
  const q = parseColour(b);
  if (!p || !q) return 999;
  return Math.hypot((p.r - q.r) * 255, (p.g - q.g) * 255, (p.b - q.b) * 255);
}
