// lib/ux-v0/color.ts — small colour arithmetic for art direction and the renderer.
//
// Hex in, hex out. HSL for moving a hue or a lightness the way a designer
// thinks about it; plain RGB mixing for tints. Nothing here decides whether
// text can be read — that is ensureContrast (spec.ts) and contrastRatio
// (lib/ux/audit), which every palette passes through afterwards.

export const HEX6 = /^#[0-9a-f]{6}$/i;

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export function rgbOf(hex: string): [number, number, number] {
  const h = HEX6.test(hex) ? hex : '#000000';
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function hexOf(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

/** `a` moved toward `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hexOf(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** [hue 0–360, saturation 0–1, lightness 0–1] */
export function hslOf(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function hslHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s);
  l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hexOf((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Relative lightness, 0 (black) to 1 (white), as the eye roughly sees it. */
export function lightness(hex: string): number {
  return hslOf(hex)[2];
}

export const isDark = (hex: string) => {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.42;
};

/** How far apart two hues are, 0 (same) to 1 (opposite); greys count as far from everything. */
export function hueDistance(a: string, b: string): number {
  const [h1, s1] = hslOf(a);
  const [h2, s2] = hslOf(b);
  if (s1 < 0.12 || s2 < 0.12) return s1 < 0.12 && s2 < 0.12 ? 0 : 0.6;
  const d = Math.abs(h1 - h2) % 360;
  return Math.min(d, 360 - d) / 180;
}
