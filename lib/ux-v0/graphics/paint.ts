// lib/ux-v0/graphics/paint.ts — colours and gradients: what a fill or a stroke can be, read, checked and mixed.
//
// A paint is a colour (#rrggbb, or #rrggbbaa with its alpha) or a gradient. Gradients are linear (an angle), radial
// (a centre, a radius), conic (a centre and a start angle: drawn as fine sectors, since SVG has no conic gradient),
// or mesh-style (a 2×2 or 3×3 grid of colours blended smoothly across the box). Linear and radial ones can repeat or
// reflect at a period, interpolate in sRGB or in linear light, and carry an opacity. Colours typed as rgb(), rgba(),
// hsl(), hsla() or a CSS colour name are read into hex; everything stored is hex, checked.

export interface Stop {
  at: number;
  color: string;
}
export interface Gradient {
  type: 'linear' | 'radial' | 'conic' | 'mesh';
  /** linear: the direction it runs, as CSS (0 upward, 90 to the right, 180 downward); conic: where the first stop
   * starts (0 at the top, clockwise) */
  angle: number;
  stops: Stop[];
  /** the centre for radial and conic, 0–1 of the box */
  cx?: number;
  cy?: number;
  /** a radial gradient's radius, as a share of the box */
  r?: number;
  /** what happens past the last stop (linear, radial) or how many times the stops go round (conic) */
  repeat?: 'none' | 'repeat' | 'reflect';
  /** a repeating gradient's period, as a share of the box (linear, radial) */
  period?: number;
  /** conic: how many times the stops go round */
  turns?: number;
  /** blend in linear light rather than sRGB */
  space?: 'srgb' | 'linear';
  /** mesh: 4 (2×2) or 9 (3×3) colours, row by row */
  mesh?: string[];
  /** the gradient's own opacity */
  opacity?: number;
}
export type Paint = string | Gradient;
export const GRADIENT_TYPES = ['linear', 'radial', 'conic', 'mesh'] as const;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);

/** The CSS named colours (all 148, exactly as CSS defines them: “red” is #ff0000), for typed and imported values. Words
 * a person uses for a mood of colour (“a warm red”) are the composer's business, not this table's. */
const CSS_NAMES = 'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32';
const NAMED: Record<string, string> = Object.fromEntries([...CSS_NAMES.split(' ').map((p) => p.split(':')).map(([k, v]) => [k, `#${v}`]), ['transparent', '#00000000']]);

const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** A colour from what a person types or a file holds (hex, rgb(), rgba(), hsl(), hsla(), a CSS name) as hex; null when unread. */
export function parseColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (HEX.test(s)) {
    if (s.length === 4 || s.length === 5) return `#${[...s.slice(1)].map((c) => c + c).join('')}`.replace(/^(#[0-9a-f]{6})ff$/, '$1');
    return s.replace(/^(#[0-9a-f]{6})ff$/, '$1');
  }
  if (NAMED[s]) return NAMED[s];
  const fn = s.match(/^(rgba?|hsla?)\(\s*([^)]*)\)$/);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const val = (p: string, scale: number) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const alpha = parts[3] !== undefined ? clamp(val(parts[3], 1), 0, 1) : 1;
  let r: number;
  let g: number;
  let b: number;
  if (fn[1].startsWith('rgb')) {
    [r, g, b] = parts.slice(0, 3).map((p) => val(p, 255));
  } else {
    const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
    const sat = clamp(val(parts[1], 1) > 1 ? val(parts[1], 1) / 100 : val(parts[1], 1), 0, 1);
    const l = clamp(val(parts[2], 1) > 1 ? val(parts[2], 1) / 100 : val(parts[2], 1), 0, 1);
    [r, g, b] = hslToRgb(h, sat, l);
  }
  if (![r, g, b].every(Number.isFinite)) return null;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha < 1 ? hex2(alpha * 255) : ''}`;
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function rgbOf(hex: string): [number, number, number, number] {
  const h = (parseColor(hex) ?? '#000000').slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
}

export function hslOf(hex: string): [number, number, number] {
  const [r0, g0, b0] = rgbOf(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h / 6) * 360, s, l];
}

export const hslHex = (h: number, s: number, l: number) => {
  const [r, g, b] = hslToRgb((((h % 360) + 360) % 360) / 360, clamp(s, 0, 1), clamp(l, 0, 1));
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
};

/** Two colours mixed (t = 0 the first … 1 the second), in sRGB or in linear light. */
export function mixColor(a: string, b: string, t: number, space: 'srgb' | 'linear' = 'srgb'): string {
  const A = rgbOf(a);
  const B = rgbOf(b);
  const lin = (c: number) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4);
  const del = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
  const ch = (i: number) => (space === 'linear' ? del(lin(A[i]) + (lin(B[i]) - lin(A[i])) * t) : A[i] + (B[i] - A[i]) * t);
  const alpha = A[3] + (B[3] - A[3]) * t;
  return `#${hex2(ch(0))}${hex2(ch(1))}${hex2(ch(2))}${alpha < 0.999 ? hex2(alpha * 255) : ''}`;
}

/** The colour a set of stops gives at t (0–1). */
export function colorAt(stops: readonly Stop[], t: number, space: 'srgb' | 'linear' = 'srgb'): string {
  if (!stops.length) return '#000000';
  if (t <= stops[0].at) return stops[0].color;
  for (let i = 1; i < stops.length; i++) if (t <= stops[i].at) return mixColor(stops[i - 1].color, stops[i].color, (t - stops[i - 1].at) / Math.max(1e-6, stops[i].at - stops[i - 1].at), space);
  return stops[stops.length - 1].color;
}

/** Colours that go with one: complementary, analogous, triadic, split-complementary, tetradic, monochromatic. */
export function harmonies(base: string): Record<'complementary' | 'analogous' | 'triadic' | 'split' | 'tetradic' | 'monochromatic', string[]> {
  const [h, s, l] = hslOf(base);
  const at = (dh: number, ds = 0, dl = 0) => hslHex(h + dh, s + ds, l + dl);
  return {
    complementary: [base, at(180)],
    analogous: [at(-30), base, at(30)],
    triadic: [base, at(120), at(240)],
    split: [base, at(150), at(210)],
    tetradic: [base, at(90), at(180), at(270)],
    monochromatic: [at(0, 0, -0.3), at(0, 0, -0.15), base, at(0, -0.1, 0.15), at(0, -0.2, 0.3)],
  };
}

/** A paint held to its shape (unknown kinds and broken colours refused; stops sorted, at most 16). */
export function normalizePaint(v: unknown, d: Paint | null): Paint | null {
  if (v === null) return null;
  if (typeof v === 'string') return parseColor(v) ?? (typeof d === 'string' ? d : '#000000');
  const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  if (!(GRADIENT_TYPES as readonly string[]).includes(r.type as string)) return d;
  const type = r.type as Gradient['type'];
  const stops = (Array.isArray(r.stops) ? r.stops : [])
    .map((s) => {
      const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
      return { at: num(o.at, 0, 1, 0), color: parseColor(o.color) ?? '' };
    })
    .filter((s) => s.color)
    .slice(0, 16)
    .sort((a, b) => a.at - b.at);
  const mesh = Array.isArray(r.mesh) ? r.mesh.map((c) => parseColor(c)).filter((c): c is string => !!c) : [];
  if (type === 'mesh' ? mesh.length !== 4 && mesh.length !== 9 : stops.length < 2) return d;
  const g: Gradient = { type, angle: num(r.angle, -360, 360, type === 'linear' ? 90 : 0), stops: type === 'mesh' ? [] : stops };
  if (type === 'radial' || type === 'conic') {
    g.cx = num(r.cx, -1, 2, 0.5);
    g.cy = num(r.cy, -1, 2, 0.5);
  }
  if (type === 'radial') g.r = num(r.r, 0.05, 3, 0.6);
  if ((type === 'linear' || type === 'radial') && (r.repeat === 'repeat' || r.repeat === 'reflect')) {
    g.repeat = r.repeat;
    g.period = num(r.period, 0.02, 1, 0.25);
  }
  if (type === 'conic' && r.turns !== undefined) g.turns = Math.round(num(r.turns, 1, 12, 1));
  if (r.space === 'linear') g.space = 'linear';
  if (type === 'mesh') g.mesh = mesh;
  if (r.opacity !== undefined && num(r.opacity, 0, 1, 1) < 1) g.opacity = num(r.opacity, 0, 1, 1);
  return g;
}

/** Gradients ready to use (and the starting point of a designer's own). */
export const GRADIENT_PRESETS: readonly { id: string; label: string; paint: Gradient }[] = [
  { id: 'gold', label: 'Metallic gold', paint: { type: 'linear', angle: 115, stops: [{ at: 0, color: '#8a6a1f' }, { at: 0.28, color: '#f6e29a' }, { at: 0.5, color: '#b88a2c' }, { at: 0.74, color: '#fff3c4' }, { at: 1, color: '#7d5c17' }] } },
  { id: 'silver', label: 'Brushed silver', paint: { type: 'linear', angle: 100, stops: [{ at: 0, color: '#8e959c' }, { at: 0.3, color: '#f3f5f7' }, { at: 0.55, color: '#a7aeb5' }, { at: 0.8, color: '#e9ecef' }, { at: 1, color: '#7b828a' }] } },
  { id: 'bronze', label: 'Bronze', paint: { type: 'linear', angle: 120, stops: [{ at: 0, color: '#5a3216' }, { at: 0.35, color: '#d08a4f' }, { at: 0.6, color: '#7a4421' }, { at: 1, color: '#e3a66b' }] } },
  { id: 'chrome', label: 'Chrome', paint: { type: 'linear', angle: 90, stops: [{ at: 0, color: '#f7f9fb' }, { at: 0.45, color: '#9aa4ae' }, { at: 0.5, color: '#2d343b' }, { at: 0.62, color: '#c9d1d8' }, { at: 1, color: '#ffffff' }] } },
  { id: 'holographic', label: 'Holographic', paint: { type: 'conic', angle: 0, cx: 0.5, cy: 0.5, stops: [{ at: 0, color: '#ff9ad5' }, { at: 0.25, color: '#9ae6ff' }, { at: 0.5, color: '#c2ffb5' }, { at: 0.75, color: '#fff3a6' }, { at: 1, color: '#ff9ad5' }] } },
  { id: 'sunset', label: 'Sunset', paint: { type: 'linear', angle: 90, stops: [{ at: 0, color: '#2b1a57' }, { at: 0.5, color: '#e0457b' }, { at: 1, color: '#ffb35c' }] } },
  { id: 'aurora', label: 'Aurora mesh', paint: { type: 'mesh', angle: 0, stops: [], mesh: ['#0f2b46', '#2ad1a3', '#6a3df0', '#0b1a2b', '#7cf0c9', '#1b8ad6', '#271a4f', '#3d7cf0', '#0d2238'] } },
  { id: 'pastel', label: 'Pastel mesh', paint: { type: 'mesh', angle: 0, stops: [], mesh: ['#ffd6e0', '#c9f2ff', '#fff4c2', '#d7ffd9'] } },
  { id: 'ink-fade', label: 'Ink fade', paint: { type: 'linear', angle: 90, stops: [{ at: 0, color: '#111111' }, { at: 1, color: '#11111100' }] } },
  { id: 'spotlight', label: 'Spotlight', paint: { type: 'radial', angle: 0, cx: 0.5, cy: 0.35, r: 0.7, stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: '#1a1a1a' }] } },
  { id: 'stripes', label: 'Repeating bands', paint: { type: 'linear', angle: 45, repeat: 'repeat', period: 0.12, stops: [{ at: 0, color: '#111111' }, { at: 0.5, color: '#111111' }, { at: 0.5, color: '#f2efe6' }, { at: 1, color: '#f2efe6' }] } },
  { id: 'sonar', label: 'Sonar rings', paint: { type: 'radial', angle: 0, cx: 0.5, cy: 0.5, r: 0.8, repeat: 'reflect', period: 0.15, stops: [{ at: 0, color: '#0c2a3a' }, { at: 1, color: '#2fd1c8' }] } },
];

/** A gradient's stops brought into a designer's palette: each preset stop moved to the nearest palette colour's hue,
 * keeping its lightness (a metallic in the brand's own hue). */
export function tintPreset(g: Gradient, hue: string): Gradient {
  const [h, s] = hslOf(hue);
  const re = (c: string) => {
    const [, , l] = hslOf(c);
    const a = rgbOf(c)[3];
    return `${hslHex(h, Math.min(1, s * 0.9 + 0.1), l)}${a < 1 ? hex2(a * 255) : ''}`;
  };
  return { ...g, stops: g.stops.map((st) => ({ ...st, color: re(st.color) })), ...(g.mesh ? { mesh: g.mesh.map(re) } : {}) };
}

/** Relative luminance (WCAG), for contrast decisions. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((c, i) => (i < 3 ? (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4) : c));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
