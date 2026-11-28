// lib/ux-v0/design/contrast.ts — the contrast of words against what is really behind them, measured on the picture.
//
// A design is HTML over gradients, pictures, overlays and pseudo-elements: what sits behind a line of words cannot be
// read from the styles. It can be measured: the frame says where each run of words is drawn and in what colour
// (frame.ts), the artboard is drawn as a picture with its words left out (export.ts artboardPixels), and the pixels
// inside each box are exactly what is behind them. The ratio is WCAG's; what is reported is a measurement, never a
// guess, and only where it falls short of the accessible minimum for words of that size.
//
// Over a flat ground the ratio is against its colour (the middle of what was sampled). Over a picture or a gradient
// it is the ratio at the quarter of the area nearest the words' own lightness — where they are hardest to read — and
// said as such.

import { parseColour } from '../dsi/colour';

export interface TextBox {
  id: string;
  /** in artboard pixels, from the artboard's corner */
  x: number;
  y: number;
  w: number;
  h: number;
  /** the computed colour (rgb(), rgba()) */
  color: string;
  /** font size in artboard pixels, and weight */
  size: number;
  weight: number;
  text: string;
}

/** The artboard drawn without its words: what is behind them. */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
  /** picture pixels per artboard pixel */
  scale: number;
}

export interface ContrastFact {
  id: string;
  text: string;
  /** measured, to one decimal */
  ratio: number;
  /** the accessible minimum for words of this size (WCAG AA: 4.5, or 3 for large) */
  needs: number;
  large: boolean;
  /** what is behind the words: one colour, or something that varies (a picture, a gradient) */
  over: 'flat' | 'varied';
}

const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** Relative luminance (WCAG) of a colour given as 0–255 channels. */
export const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
export const ratioOf = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];

/**
 * Where words fall short of the accessible minimum, measured (see the head of this file). `points` turns a size in
 * artboard pixels into points (print sheets are not 96 to the inch); by default a pixel is three quarters of a point.
 */
export function contrastFacts(texts: readonly TextBox[], px: Pixels, points: (size: number) => number = (s) => s * 0.75): ContrastFact[] {
  const out: ContrastFact[] = [];
  for (const t of texts) {
    const c = parseColour(t.color);
    if (!c || c.a < 0.9 || t.w < 2 || t.h < 2) continue;
    const fg: [number, number, number] = [c.r * 255, c.g * 255, c.b * 255];
    const x0 = Math.max(0, Math.floor(t.x * px.scale));
    const y0 = Math.max(0, Math.floor(t.y * px.scale));
    const x1 = Math.min(px.width, Math.ceil((t.x + t.w) * px.scale));
    const y1 = Math.min(px.height, Math.ceil((t.y + t.h) * px.scale));
    if (x1 - x0 < 3 || y1 - y0 < 3) continue;
    const stepX = Math.max(1, Math.floor((x1 - x0) / 40));
    const stepY = Math.max(1, Math.floor((y1 - y0) / 16));
    const behind: number[] = [];
    for (let y = y0; y < y1; y += stepY) {
      for (let x = x0; x < x1; x += stepX) {
        const i = (y * px.width + x) * 4;
        behind.push(luminance(px.data[i], px.data[i + 1], px.data[i + 2]));
      }
    }
    if (behind.length < 12) continue;
    const fl = luminance(fg[0], fg[1], fg[2]);
    behind.sort((a, b) => a - b);
    const lo = quantile(behind, 0.25);
    const mid = quantile(behind, 0.5);
    const hi = quantile(behind, 0.75);
    const over: ContrastFact['over'] = ratioOf(hi, lo) > 1.6 ? 'varied' : 'flat';
    // over something that varies, the quarter where the words are hardest to read (nearest their own lightness)
    const worst = Math.abs(lo - fl) < Math.abs(hi - fl) ? lo : hi;
    const ratio = over === 'varied' ? ratioOf(fl, worst) : ratioOf(fl, mid);
    const pt = points(t.size);
    const large = pt >= 18 || (pt >= 14 && t.weight >= 700);
    const needs = large ? 3 : 4.5;
    if (ratio + 0.05 < needs) out.push({ id: t.id, text: t.text, ratio: Math.round(ratio * 10) / 10, needs, large, over });
  }
  return out.sort((a, b) => a.ratio / a.needs - b.ratio / b.needs).slice(0, 6);
}

/** A measurement in words, for the designer and for a review. */
export const contrastSaid = (f: ContrastFact): string =>
  `low contrast, measured: “${f.text.slice(0, 48)}” (data-sx="${f.id}") is ${f.ratio}:1 against ${f.over === 'varied' ? 'the weaker part of the picture or gradient behind it' : 'what is behind it'}; words ${f.large ? 'this large' : 'this size'} need ${f.needs}:1 to be read by everyone (leave it only if it is decoration, not something to read)`;
