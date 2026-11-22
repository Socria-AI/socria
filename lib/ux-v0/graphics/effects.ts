// lib/ux-v0/graphics/effects.ts — non-destructive effects: a stack on any object, each one typed, ordered, switchable.
//
// An object's effects are a list: each a kind from the registry below, its parameters, its colours, on or off. The
// list is compiled into one SVG filter, the effects chained in order (each takes the result of the one before), so
// the object itself is never changed: switch an effect off, reorder it, remove it, and the object is as it was. Two
// effects are drawn by the renderer rather than a filter (a gradient overlay and an extrusion), because a filter
// cannot paint a gradient or repeat geometry.
//
// Only effects that render are here. Every one is made of standard SVG filter primitives the browser draws (and so
// PNG, JPEG and PDF exports carry, being drawn by the same browser); halftone and ordered dither use a screen drawn
// as an embedded SVG image. What a filter cannot do is not offered: a blur of what lies BEHIND an object (backdrop
// blur) needs the page behind it, which SVG filters cannot read, so it is left out rather than faked.

import { parseColor, rgbOf } from './paint';
import type { ParamSpec } from './geometry';

export interface Effect {
  kind: string;
  on: boolean;
  params: Record<string, number>;
  color?: string;
  color2?: string;
  color3?: string;
}

export type EffectCategory = 'shadow' | 'light' | 'blur' | 'colour' | 'texture' | 'distort' | 'stylize' | 'dimension';
export interface FilterCtx {
  in: string;
  out: string;
  /** a unique prefix for intermediate results */
  u: string;
  w: number;
  h: number;
  color: string;
  color2: string;
  color3: string;
}
export interface EffectSpec {
  kind: string;
  label: string;
  category: EffectCategory;
  keywords: string[];
  params: ParamSpec[];
  colors?: { key: 'color' | 'color2' | 'color3'; label: string; def: string }[];
  /** how far beyond its box it can paint */
  reach?: (p: Record<string, number>) => number;
  filter?: (p: Record<string, number>, c: FilterCtx) => string;
  /** drawn by the renderer itself */
  special?: 'gradient-overlay' | 'extrude';
  says: string;
}

const P = (key: string, label: string, min: number, max: number, def: number, step = 1): ParamSpec => ({ key, label, min, max, step, def });
const n2 = (v: number) => (Math.round(v * 1000) / 1000).toString();
const flood = (hex: string, opacity = 1) => {
  const c = parseColor(hex) ?? '#000000';
  const a = c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1;
  return `flood-color="${c.slice(0, 7)}" flood-opacity="${n2(Math.max(0, Math.min(1, a * opacity)))}"`;
};
const LUM = '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0';
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'exclusion'] as const;
const blendOf = (i: number) => BLENDS[Math.max(0, Math.min(BLENDS.length - 1, Math.round(i)))];
/** A two- or three-colour map of luminance (duotone, tritone, threshold colours). */
function tableMap(colors: string[]): string {
  const rgb = colors.map((c) => rgbOf(c));
  const ch = (i: number) => rgb.map((c) => n2(c[i] / 255)).join(' ');
  return `<feFuncR type="table" tableValues="${ch(0)}"/><feFuncG type="table" tableValues="${ch(1)}"/><feFuncB type="table" tableValues="${ch(2)}"/>`;
}
const dataSvg = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
/** A halftone screen: radial dots at a cell size and angle, white between them, drawn as an image. */
function halftoneScreen(w: number, h: number, s: number, angle: number): string {
  return dataSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}" height="${n2(h)}"><defs><radialGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient><pattern id="p" width="${n2(s)}" height="${n2(s)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${n2(angle)})"><rect width="${n2(s)}" height="${n2(s)}" fill="#fff"/><circle cx="${n2(s / 2)}" cy="${n2(s / 2)}" r="${n2(s * 0.71)}" fill="url(#g)"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`);
}
/** An ordered-dither screen: the 4×4 Bayer matrix as greys, each cell `s` across. */
function bayerScreen(w: number, h: number, s: number): string {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cells = B.map((v, i) => `<rect x="${n2((i % 4) * s)}" y="${n2(Math.floor(i / 4) * s)}" width="${n2(s)}" height="${n2(s)}" fill="rgb(${Math.round(((v + 0.5) / 16) * 255)},${Math.round(((v + 0.5) / 16) * 255)},${Math.round(((v + 0.5) / 16) * 255)})"/>`).join('');
  return dataSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}" height="${n2(h)}"><defs><pattern id="p" width="${n2(s * 4)}" height="${n2(s * 4)}" patternUnits="userSpaceOnUse">${cells}</pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`);
}
/** A displacement map whose red channel is a sine wave along one axis (green held at the middle: no other shift). */
function sineMap(w: number, h: number, wavelength: number, alongX: boolean): string {
  const stops = Array.from({ length: 17 }, (_, i) => {
    const v = Math.round((0.5 + 0.5 * Math.sin((i / 16) * Math.PI * 2)) * 255);
    return `<stop offset="${n2(i / 16)}" stop-color="rgb(${v},128,128)"/>`;
  }).join('');
  const dir = alongX ? `x1="0" y1="0" x2="${n2(wavelength)}" y2="0"` : `x1="0" y1="0" x2="0" y2="${n2(wavelength)}"`;
  return dataSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${n2(w)}" height="${n2(h)}"><defs><linearGradient id="s" gradientUnits="userSpaceOnUse" ${dir} spreadMethod="repeat">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/></svg>`);
}
const twoTone = (c: FilterCtx, inName: string, outName: string) => `<feComponentTransfer in="${inName}" result="${c.u}d"><feFuncR type="discrete" tableValues="0 1"/><feFuncG type="discrete" tableValues="0 1"/><feFuncB type="discrete" tableValues="0 1"/></feComponentTransfer><feComponentTransfer in="${c.u}d" result="${c.u}e">${tableMap([c.color, c.color2])}</feComponentTransfer><feComposite in="${c.u}e" in2="${c.in}" operator="in" result="${outName}"/>`;

export const EFFECTS: readonly EffectSpec[] = [
  // ── shadows and light ──
  { kind: 'drop-shadow', label: 'Drop shadow', category: 'shadow', keywords: ['shadow', 'drop shadow', 'depth', 'lift'], params: [P('dx', 'Offset x', -200, 200, 0), P('dy', 'Offset y', -200, 200, 10), P('blur', 'Blur', 0, 120, 18), P('spread', 'Spread', 0, 40, 0), P('opacity', 'Opacity', 0, 100, 30)], colors: [{ key: 'color', label: 'Colour', def: '#000000' }], reach: (p) => Math.abs(p.dx) + Math.abs(p.dy) + p.blur * 1.5 + p.spread + 4, filter: (p, c) => `${p.spread > 0 ? `<feMorphology in="${c.in}" operator="dilate" radius="${n2(p.spread)}" result="${c.u}0"/>` : ''}<feGaussianBlur in="${p.spread > 0 ? `${c.u}0` : c.in}" stdDeviation="${n2(p.blur / 2)}" result="${c.u}1"/><feOffset in="${c.u}1" dx="${n2(p.dx)}" dy="${n2(p.dy)}" result="${c.u}2"/><feFlood ${flood(c.color, p.opacity / 100)} result="${c.u}3"/><feComposite in="${c.u}3" in2="${c.u}2" operator="in" result="${c.u}4"/><feMerge result="${c.out}"><feMergeNode in="${c.u}4"/><feMergeNode in="${c.in}"/></feMerge>`, says: 'a shadow cast beneath it' },
  { kind: 'inner-shadow', label: 'Inner shadow', category: 'shadow', keywords: ['inner shadow', 'inset', 'pressed', 'carved'], params: [P('dx', 'Offset x', -100, 100, 0), P('dy', 'Offset y', -100, 100, 6), P('blur', 'Blur', 0, 80, 10), P('opacity', 'Opacity', 0, 100, 45)], colors: [{ key: 'color', label: 'Colour', def: '#000000' }], filter: (p, c) => `<feComponentTransfer in="${c.in}" result="${c.u}0"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur in="${c.u}0" stdDeviation="${n2(p.blur / 2)}" result="${c.u}1"/><feOffset in="${c.u}1" dx="${n2(p.dx)}" dy="${n2(p.dy)}" result="${c.u}2"/><feFlood ${flood(c.color, p.opacity / 100)} result="${c.u}3"/><feComposite in="${c.u}3" in2="${c.u}2" operator="in" result="${c.u}4"/><feComposite in="${c.u}4" in2="${c.in}" operator="in" result="${c.u}5"/><feMerge result="${c.out}"><feMergeNode in="${c.in}"/><feMergeNode in="${c.u}5"/></feMerge>`, says: 'a shadow inside its edge' },
  { kind: 'glow', label: 'Outer glow', category: 'light', keywords: ['glow', 'neon', 'halo', 'aura', 'light'], params: [P('size', 'Size', 1, 100, 16), P('spread', 'Spread', 0, 30, 2), P('opacity', 'Opacity', 0, 100, 85)], colors: [{ key: 'color', label: 'Colour', def: '#ffd84d' }], reach: (p) => p.size * 2 + p.spread + 4, filter: (p, c) => `<feMorphology in="${c.in}" operator="dilate" radius="${n2(p.spread)}" result="${c.u}0"/><feGaussianBlur in="${c.u}0" stdDeviation="${n2(p.size / 2)}" result="${c.u}1"/><feFlood ${flood(c.color, p.opacity / 100)} result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.u}1" operator="in" result="${c.u}3"/><feMerge result="${c.out}"><feMergeNode in="${c.u}3"/><feMergeNode in="${c.u}3"/><feMergeNode in="${c.in}"/></feMerge>`, says: 'a light glowing around it' },
  { kind: 'inner-glow', label: 'Inner glow', category: 'light', keywords: ['inner glow', 'rim light', 'luminous edge'], params: [P('size', 'Size', 1, 80, 12), P('opacity', 'Opacity', 0, 100, 70)], colors: [{ key: 'color', label: 'Colour', def: '#ffffff' }], filter: (p, c) => `<feComponentTransfer in="${c.in}" result="${c.u}0"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur in="${c.u}0" stdDeviation="${n2(p.size / 2)}" result="${c.u}1"/><feFlood ${flood(c.color, p.opacity / 100)} result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.u}1" operator="in" result="${c.u}3"/><feComposite in="${c.u}3" in2="${c.in}" operator="in" result="${c.u}4"/><feMerge result="${c.out}"><feMergeNode in="${c.in}"/><feMergeNode in="${c.u}4"/></feMerge>`, says: 'a light inside its edge' },
  { kind: 'outline', label: 'Outline', category: 'stylize', keywords: ['outline', 'stroke', 'keyline', 'border', 'sticker'], params: [P('width', 'Width', 0.5, 40, 4, 0.5)], colors: [{ key: 'color', label: 'Colour', def: '#ffffff' }], reach: (p) => p.width + 2, filter: (p, c) => `<feMorphology in="${c.in}" operator="dilate" radius="${n2(p.width)}" result="${c.u}0"/><feFlood ${flood(c.color)} result="${c.u}1"/><feComposite in="${c.u}1" in2="${c.u}0" operator="in" result="${c.u}2"/><feMerge result="${c.out}"><feMergeNode in="${c.u}2"/><feMergeNode in="${c.in}"/></feMerge>`, says: 'an outline around its edge' },
  // ── blur ──
  { kind: 'blur', label: 'Blur', category: 'blur', keywords: ['blur', 'soft focus', 'defocus', 'gaussian'], params: [P('radius', 'Radius', 0, 80, 6, 0.5)], reach: (p) => p.radius * 3, filter: (p, c) => `<feGaussianBlur in="${c.in}" stdDeviation="${n2(p.radius)}" result="${c.out}"/>`, says: 'blurred' },
  { kind: 'motion-blur', label: 'Motion blur', category: 'blur', keywords: ['motion blur', 'speed', 'movement', 'streak'], params: [P('amount', 'Amount', 0, 80, 14, 0.5), P('vertical', 'Vertical', 0, 1, 0)], reach: (p) => p.amount * 3, filter: (p, c) => `<feGaussianBlur in="${c.in}" stdDeviation="${p.vertical >= 0.5 ? `0 ${n2(p.amount)}` : `${n2(p.amount)} 0`}" result="${c.out}"/>`, says: 'blurred along its motion' },
  { kind: 'sharpen', label: 'Sharpen', category: 'blur', keywords: ['sharpen', 'crisp', 'detail'], params: [P('amount', 'Amount', 0, 100, 40)], filter: (p, c) => {
    const a = p.amount / 100;
    return `<feConvolveMatrix in="${c.in}" order="3" kernelMatrix="0 ${n2(-a)} 0 ${n2(-a)} ${n2(1 + 4 * a)} ${n2(-a)} 0 ${n2(-a)} 0" preserveAlpha="true" result="${c.out}"/>`;
  }, says: 'sharpened' },
  // ── colour ──
  { kind: 'color-overlay', label: 'Colour overlay', category: 'colour', keywords: ['colour overlay', 'color overlay', 'tint', 'wash', 'fill colour'], params: [P('opacity', 'Opacity', 0, 100, 60), P('blend', 'Blend (normal, multiply, screen, overlay…)', 0, 11, 0)], colors: [{ key: 'color', label: 'Colour', def: '#e5322d' }], filter: (p, c) => `<feFlood ${flood(c.color, p.opacity / 100)} result="${c.u}0"/><feComposite in="${c.u}0" in2="${c.in}" operator="in" result="${c.u}1"/><feBlend in="${c.u}1" in2="${c.in}" mode="${blendOf(p.blend)}" result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.in}" operator="in" result="${c.out}"/>`, says: 'washed with a colour' },
  { kind: 'gradient-overlay', label: 'Gradient overlay', category: 'colour', keywords: ['gradient overlay', 'gradient wash', 'colour fade'], params: [P('angle', 'Angle', -360, 360, 90), P('opacity', 'Opacity', 0, 100, 70), P('blend', 'Blend (normal, multiply, screen, overlay…)', 0, 11, 0)], colors: [{ key: 'color', label: 'From', def: '#ff5f6d' }, { key: 'color2', label: 'To', def: '#ffc371' }], special: 'gradient-overlay', says: 'washed with a gradient' },
  { kind: 'duotone', label: 'Duotone', category: 'colour', keywords: ['duotone', 'two colour', 'two-tone'], params: [P('amount', 'Amount', 0, 100, 100)], colors: [{ key: 'color', label: 'Shadows', def: '#1b1464' }, { key: 'color2', label: 'Highlights', def: '#ffb36b' }], filter: (p, c) => `<feColorMatrix in="${c.in}" type="matrix" values="${LUM}" result="${c.u}0"/><feComponentTransfer in="${c.u}0" result="${c.u}1">${tableMap([c.color, c.color2])}</feComponentTransfer><feComposite in="${c.u}1" in2="${c.in}" operator="arithmetic" k2="${n2(p.amount / 100)}" k3="${n2(1 - p.amount / 100)}" result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.in}" operator="in" result="${c.out}"/>`, says: 'in two colours' },
  { kind: 'tritone', label: 'Tritone', category: 'colour', keywords: ['tritone', 'three colour', 'gradient map'], params: [P('amount', 'Amount', 0, 100, 100)], colors: [{ key: 'color', label: 'Shadows', def: '#141b3a' }, { key: 'color2', label: 'Midtones', def: '#d0466b' }, { key: 'color3', label: 'Highlights', def: '#ffe6a8' }], filter: (p, c) => `<feColorMatrix in="${c.in}" type="matrix" values="${LUM}" result="${c.u}0"/><feComponentTransfer in="${c.u}0" result="${c.u}1">${tableMap([c.color, c.color2, c.color3])}</feComponentTransfer><feComposite in="${c.u}1" in2="${c.in}" operator="arithmetic" k2="${n2(p.amount / 100)}" k3="${n2(1 - p.amount / 100)}" result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.in}" operator="in" result="${c.out}"/>`, says: 'in three colours' },
  { kind: 'mono', label: 'Monochrome', category: 'colour', keywords: ['monochrome', 'black and white', 'greyscale', 'grayscale', 'monochromatic', 'mono'], params: [P('amount', 'Amount', 0, 100, 100)], colors: [{ key: 'color', label: 'Tint', def: '#ffffff' }], filter: (p, c) => `<feColorMatrix in="${c.in}" type="matrix" values="${LUM}" result="${c.u}0"/><feFlood ${flood(c.color)} result="${c.u}1"/><feBlend in="${c.u}1" in2="${c.u}0" mode="multiply" result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.in}" operator="arithmetic" k2="${n2(p.amount / 100)}" k3="${n2(1 - p.amount / 100)}" result="${c.u}3"/><feComposite in="${c.u}3" in2="${c.in}" operator="in" result="${c.out}"/>`, says: 'in one colour' },
  { kind: 'posterize', label: 'Posterize', category: 'colour', keywords: ['posterize', 'posterise', 'flat colour', 'screenprint', 'reduce colours'], params: [P('levels', 'Levels', 2, 12, 5)], filter: (p, c) => {
    const n = Math.round(p.levels);
    const t = Array.from({ length: n }, (_, i) => n2(i / (n - 1))).join(' ');
    return `<feComponentTransfer in="${c.in}" result="${c.out}"><feFuncR type="discrete" tableValues="${t}"/><feFuncG type="discrete" tableValues="${t}"/><feFuncB type="discrete" tableValues="${t}"/></feComponentTransfer>`;
  }, says: 'reduced to a few flat tones' },
  { kind: 'threshold', label: 'Threshold', category: 'colour', keywords: ['threshold', 'stencil', 'two-tone', 'bitmap'], params: [P('level', 'Level', 0, 100, 50)], colors: [{ key: 'color', label: 'Ink', def: '#111111' }, { key: 'color2', label: 'Paper', def: '#ffffff' }], filter: (p, c) => `<feColorMatrix in="${c.in}" type="matrix" values="${LUM}" result="${c.u}0"/><feComponentTransfer in="${c.u}0" result="${c.u}1"><feFuncR type="linear" slope="1" intercept="${n2(0.5 - p.level / 100)}"/><feFuncG type="linear" slope="1" intercept="${n2(0.5 - p.level / 100)}"/><feFuncB type="linear" slope="1" intercept="${n2(0.5 - p.level / 100)}"/></feComponentTransfer>${twoTone(c, `${c.u}1`, c.out)}`, says: 'cut to two tones' },
  { kind: 'invert', label: 'Invert', category: 'colour', keywords: ['invert', 'negative'], params: [P('amount', 'Amount', 0, 100, 100)], filter: (p, c) => {
    const a = p.amount / 100;
    return `<feComponentTransfer in="${c.in}" result="${c.out}"><feFuncR type="table" tableValues="${n2(a)} ${n2(1 - a)}"/><feFuncG type="table" tableValues="${n2(a)} ${n2(1 - a)}"/><feFuncB type="table" tableValues="${n2(a)} ${n2(1 - a)}"/></feComponentTransfer>`;
  }, says: 'inverted' },
  // ── texture ──
  { kind: 'noise', label: 'Noise', category: 'texture', keywords: ['noise', 'static', 'texture'], params: [P('amount', 'Amount', 0, 100, 45), P('scale', 'Scale', 1, 100, 45), P('seed', 'Seed', 1, 999, 3), P('colour', 'Coloured', 0, 1, 0)], filter: (p, c) => `<feTurbulence type="fractalNoise" baseFrequency="${n2(0.02 + (p.scale / 100) * 1.2)}" numOctaves="2" seed="${Math.round(p.seed)}" stitchTiles="stitch" result="${c.u}0"/>${p.colour >= 0.5 ? '' : `<feColorMatrix in="${c.u}0" type="saturate" values="0" result="${c.u}0"/>`}<feComposite in="${c.u}0" in2="${c.in}" operator="in" result="${c.u}1"/><feBlend in="${c.u}1" in2="${c.in}" mode="overlay" result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.in}" operator="arithmetic" k2="${n2(p.amount / 100)}" k3="${n2(1 - p.amount / 100)}" result="${c.u}3"/><feComposite in="${c.u}3" in2="${c.in}" operator="in" result="${c.out}"/>`, says: 'with noise in it' },
  { kind: 'grain', label: 'Film grain', category: 'texture', keywords: ['grain', 'film grain', 'texture', 'analogue', 'risograph grain', 'paper texture'], params: [P('amount', 'Amount', 0, 100, 28), P('size', 'Size', 1, 10, 3), P('seed', 'Seed', 1, 999, 11)], filter: (p, c) => `<feTurbulence type="fractalNoise" baseFrequency="${n2(1.6 / Math.max(1, p.size))}" numOctaves="3" seed="${Math.round(p.seed)}" stitchTiles="stitch" result="${c.u}0"/><feColorMatrix in="${c.u}0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.1" result="${c.u}1"/><feComposite in="${c.u}1" in2="${c.in}" operator="in" result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.in}" operator="arithmetic" k2="${n2((p.amount / 100) * 0.55)}" k3="1" result="${c.u}3"/><feBlend in="${c.u}2" in2="${c.in}" mode="multiply" result="${c.u}4"/><feComposite in="${c.u}4" in2="${c.in}" operator="arithmetic" k2="${n2(p.amount / 100)}" k3="${n2(1 - p.amount / 100)}" result="${c.u}5"/><feComposite in="${c.u}5" in2="${c.in}" operator="in" result="${c.out}"/>`, says: 'with a fine grain' },
  { kind: 'halftone', label: 'Halftone', category: 'texture', keywords: ['halftone', 'newsprint', 'dots', 'comic', 'screen print', 'ben-day', 'pop art'], params: [P('size', 'Dot size', 2, 48, 8), P('angle', 'Screen angle', 0, 90, 45)], colors: [{ key: 'color', label: 'Ink', def: '#111111' }, { key: 'color2', label: 'Paper', def: '#f4efe4' }], filter: (p, c) => `<feColorMatrix in="${c.in}" type="matrix" values="${LUM}" result="${c.u}0"/><feImage href="${halftoneScreen(c.w, c.h, p.size, p.angle)}" x="0" y="0" width="${n2(c.w)}" height="${n2(c.h)}" preserveAspectRatio="none" result="${c.u}1"/><feComposite in="${c.u}0" in2="${c.u}1" operator="arithmetic" k2="1" k3="1" k4="-0.5" result="${c.u}2"/>${twoTone(c, `${c.u}2`, c.out)}`, says: 'printed as halftone dots' },
  { kind: 'dither', label: 'Ordered dither', category: 'texture', keywords: ['dither', 'bitmap', '1-bit', 'pixel art', 'retro computer'], params: [P('size', 'Cell size', 1, 12, 2)], colors: [{ key: 'color', label: 'Ink', def: '#111111' }, { key: 'color2', label: 'Paper', def: '#e8e4d8' }], filter: (p, c) => `<feColorMatrix in="${c.in}" type="matrix" values="${LUM}" result="${c.u}0"/><feImage href="${bayerScreen(c.w, c.h, p.size)}" x="0" y="0" width="${n2(c.w)}" height="${n2(c.h)}" preserveAspectRatio="none" result="${c.u}1"/><feComposite in="${c.u}0" in2="${c.u}1" operator="arithmetic" k2="1" k3="1" k4="-0.5" result="${c.u}2"/>${twoTone(c, `${c.u}2`, c.out)}`, says: 'dithered to two tones' },
  { kind: 'pixelate', label: 'Pixelate', category: 'texture', keywords: ['pixelate', 'pixel', 'mosaic', '8-bit', 'blocky'], params: [P('size', 'Block size', 2, 80, 12)], filter: (p, c) => {
    const s = Math.max(2, p.size);
    return `<feFlood x="${n2(s / 2 - 0.5)}" y="${n2(s / 2 - 0.5)}" width="1" height="1" flood-color="#000" result="${c.u}0"/><feComposite in="${c.u}0" in2="${c.u}0" operator="over" x="0" y="0" width="${n2(s)}" height="${n2(s)}" result="${c.u}1"/><feTile in="${c.u}1" result="${c.u}2"/><feComposite in="${c.in}" in2="${c.u}2" operator="in" result="${c.u}3"/><feMorphology in="${c.u}3" operator="dilate" radius="${n2(s / 2)}" result="${c.out}"/>`;
  }, says: 'in square blocks' },
  { kind: 'distress', label: 'Distressed', category: 'texture', keywords: ['distressed', 'worn', 'weathered', 'grunge', 'rough print', 'eroded'], params: [P('amount', 'Wear', 0, 100, 35), P('scale', 'Scale', 1, 100, 40), P('seed', 'Seed', 1, 999, 5)], filter: (p, c) => {
    const a = p.amount / 100;
    const steps = 20;
    const table = Array.from({ length: steps }, (_, i) => (i / steps < a * 0.75 ? '0' : '1')).join(' ');
    return `<feTurbulence type="fractalNoise" baseFrequency="${n2(0.01 + (p.scale / 100) * 0.4)}" numOctaves="4" seed="${Math.round(p.seed)}" result="${c.u}0"/><feColorMatrix in="${c.u}0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -0.2" result="${c.u}1"/><feComponentTransfer in="${c.u}1" result="${c.u}2"><feFuncA type="discrete" tableValues="${table}"/></feComponentTransfer><feComposite in="${c.in}" in2="${c.u}2" operator="in" result="${c.out}"/>`;
  }, says: 'worn, as an old print is' },
  { kind: 'ink-bleed', label: 'Ink bleed', category: 'texture', keywords: ['ink', 'bleed', 'letterpress', 'stamp', 'ink spread', 'printed'], params: [P('amount', 'Spread', 0, 100, 40), P('seed', 'Seed', 1, 999, 9)], reach: (p) => p.amount / 10 + 4, filter: (p, c) => `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${Math.round(p.seed)}" result="${c.u}0"/><feDisplacementMap in="${c.in}" in2="${c.u}0" scale="${n2(1 + p.amount / 14)}" xChannelSelector="R" yChannelSelector="G" result="${c.u}1"/><feMorphology in="${c.u}1" operator="dilate" radius="${n2(p.amount / 120)}" result="${c.u}2"/><feGaussianBlur in="${c.u}2" stdDeviation="0.5" result="${c.out}"/>`, says: 'printed with ink that spreads' },
  // ── distortion ──
  { kind: 'chromatic', label: 'Chromatic aberration', category: 'distort', keywords: ['chromatic aberration', 'rgb split', 'channel shift', 'colour fringe', 'lens'], params: [P('amount', 'Shift', 0, 40, 6, 0.5), P('angle', 'Angle', 0, 360, 0)], reach: (p) => p.amount + 2, filter: (p, c) => {
    const dx = Math.cos((p.angle * Math.PI) / 180) * p.amount;
    const dy = Math.sin((p.angle * Math.PI) / 180) * p.amount;
    return `<feColorMatrix in="${c.in}" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="${c.u}r"/><feOffset in="${c.u}r" dx="${n2(-dx)}" dy="${n2(-dy)}" result="${c.u}r2"/><feColorMatrix in="${c.in}" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="${c.u}g"/><feColorMatrix in="${c.in}" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="${c.u}b"/><feOffset in="${c.u}b" dx="${n2(dx)}" dy="${n2(dy)}" result="${c.u}b2"/><feBlend in="${c.u}r2" in2="${c.u}g" mode="screen" result="${c.u}rg"/><feBlend in="${c.u}rg" in2="${c.u}b2" mode="screen" result="${c.out}"/>`;
  }, says: 'with its colour channels split' },
  { kind: 'misregistration', label: 'Misregistration', category: 'distort', keywords: ['misregistration', 'riso', 'risograph', 'print offset', 'overprint', 'two inks'], params: [P('offset', 'Offset', 0, 30, 5, 0.5), P('opacity', 'Ink strength', 0, 100, 85)], colors: [{ key: 'color', label: 'First ink', def: '#ff4f9a' }, { key: 'color2', label: 'Second ink', def: '#1fb7c9' }], reach: (p) => p.offset + 2, filter: (p, c) => `<feColorMatrix in="${c.in}" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1" result="${c.u}0"/><feComposite in="${c.u}0" in2="${c.in}" operator="in" result="${c.u}1"/><feFlood ${flood(c.color, p.opacity / 100)} result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.u}1" operator="in" result="${c.u}3"/><feOffset in="${c.u}3" dx="${n2(p.offset)}" dy="${n2(p.offset * 0.4)}" result="${c.u}4"/><feFlood ${flood(c.color2, p.opacity / 100)} result="${c.u}5"/><feComposite in="${c.u}5" in2="${c.u}1" operator="in" result="${c.u}6"/><feOffset in="${c.u}6" dx="${n2(-p.offset * 0.6)}" dy="${n2(-p.offset * 0.5)}" result="${c.u}7"/><feBlend in="${c.u}4" in2="${c.u}7" mode="multiply" result="${c.out}"/>`, says: 'printed in two inks, slightly out of register' },
  { kind: 'displace', label: 'Displacement', category: 'distort', keywords: ['displace', 'displacement', 'warp', 'liquid', 'melt', 'distort'], params: [P('scale', 'Strength', 0, 200, 30), P('frequency', 'Detail', 1, 100, 12), P('seed', 'Seed', 1, 999, 4)], reach: (p) => p.scale / 2 + 2, filter: (p, c) => `<feTurbulence type="fractalNoise" baseFrequency="${n2(0.001 + (p.frequency / 100) * 0.08)}" numOctaves="3" seed="${Math.round(p.seed)}" result="${c.u}0"/><feDisplacementMap in="${c.in}" in2="${c.u}0" scale="${n2(p.scale)}" xChannelSelector="R" yChannelSelector="G" result="${c.out}"/>`, says: 'warped' },
  { kind: 'wave', label: 'Wave distortion', category: 'distort', keywords: ['wave', 'ripple', 'wavy', 'undulate', 'flag'], params: [P('amplitude', 'Amplitude', 0, 120, 18), P('wavelength', 'Wavelength', 10, 600, 120), P('vertical', 'Along the height', 0, 1, 0)], reach: (p) => p.amplitude / 2 + 2, filter: (p, c) => `<feImage href="${sineMap(c.w, c.h, p.wavelength, p.vertical >= 0.5)}" x="0" y="0" width="${n2(c.w)}" height="${n2(c.h)}" preserveAspectRatio="none" result="${c.u}0"/><feDisplacementMap in="${c.in}" in2="${c.u}0" scale="${n2(p.amplitude)}" xChannelSelector="${p.vertical >= 0.5 ? 'G' : 'R'}" yChannelSelector="${p.vertical >= 0.5 ? 'R' : 'G'}" result="${c.out}"/>`, says: 'rippled in a regular wave' },
  { kind: 'glitch', label: 'Glitch', category: 'distort', keywords: ['glitch', 'digital error', 'corrupted', 'vhs', 'datamosh'], params: [P('amount', 'Amount', 0, 100, 40), P('slices', 'Slices', 1, 100, 30), P('seed', 'Seed', 1, 999, 6)], reach: (p) => p.amount / 2 + 4, filter: (p, c) => `<feTurbulence type="fractalNoise" baseFrequency="0 ${n2(0.004 + (p.slices / 100) * 0.12)}" numOctaves="1" seed="${Math.round(p.seed)}" result="${c.u}0"/><feComponentTransfer in="${c.u}0" result="${c.u}1"><feFuncR type="discrete" tableValues="0.5 0.5 0.2 0.5 0.9 0.5 0.5 0.35 0.5 0.7"/></feComponentTransfer><feDisplacementMap in="${c.in}" in2="${c.u}1" scale="${n2(p.amount)}" xChannelSelector="R" yChannelSelector="A" result="${c.u}2"/><feColorMatrix in="${c.u}2" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="${c.u}r"/><feOffset in="${c.u}r" dx="${n2(p.amount / 12)}" result="${c.u}r2"/><feColorMatrix in="${c.u}2" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="${c.u}gb"/><feBlend in="${c.u}r2" in2="${c.u}gb" mode="screen" result="${c.out}"/>`, says: 'glitched' },
  { kind: 'edges', label: 'Edge detect', category: 'stylize', keywords: ['edges', 'edge detect', 'line art', 'sketch', 'outline drawing'], params: [P('strength', 'Strength', 1, 10, 3), P('invert', 'Dark lines', 0, 1, 1)], filter: (p, c) => `<feConvolveMatrix in="${c.in}" order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" divisor="${n2(1 / p.strength)}" preserveAlpha="true" result="${c.u}0"/>${p.invert >= 0.5 ? `<feComponentTransfer in="${c.u}0" result="${c.out}"><feFuncR type="table" tableValues="1 0"/><feFuncG type="table" tableValues="1 0"/><feFuncB type="table" tableValues="1 0"/></feComponentTransfer>` : `<feMerge result="${c.out}"><feMergeNode in="${c.u}0"/></feMerge>`}`, says: 'drawn as its edges' },
  // ── dimension ──
  { kind: 'bevel', label: 'Bevel', category: 'dimension', keywords: ['bevel', 'raised', '3d edge', 'chiselled', 'button'], params: [P('depth', 'Depth', 1, 20, 5), P('softness', 'Softness', 0, 20, 4), P('angle', 'Light angle', 0, 360, 225), P('highlight', 'Highlight', 0, 100, 70)], filter: (p, c) => `<feGaussianBlur in="${c.in}" stdDeviation="${n2(Math.max(0.5, p.softness))}" result="${c.u}0"/><feSpecularLighting in="${c.u}0" surfaceScale="${n2(p.depth)}" specularConstant="${n2(p.highlight / 80)}" specularExponent="18" lighting-color="#ffffff" result="${c.u}1"><feDistantLight azimuth="${n2(p.angle)}" elevation="40"/></feSpecularLighting><feComposite in="${c.u}1" in2="${c.in}" operator="in" result="${c.u}2"/><feComposite in="${c.in}" in2="${c.u}2" operator="arithmetic" k2="1" k3="1" result="${c.out}"/>`, says: 'bevelled, lit from one side' },
  { kind: 'emboss', label: 'Emboss', category: 'dimension', keywords: ['emboss', 'debossed', 'relief', 'pressed paper', 'letterpress'], params: [P('depth', 'Depth', 1, 20, 4), P('angle', 'Light angle', 0, 360, 135)], filter: (p, c) => `<feGaussianBlur in="${c.in}" stdDeviation="1.5" result="${c.u}0"/><feDiffuseLighting in="${c.u}0" surfaceScale="${n2(p.depth)}" diffuseConstant="1.1" lighting-color="#ffffff" result="${c.u}1"><feDistantLight azimuth="${n2(p.angle)}" elevation="35"/></feDiffuseLighting><feComposite in="${c.u}1" in2="${c.in}" operator="in" result="${c.u}2"/><feBlend in="${c.u}2" in2="${c.in}" mode="multiply" result="${c.u}3"/><feComposite in="${c.u}3" in2="${c.in}" operator="in" result="${c.out}"/>`, says: 'embossed in relief' },
  { kind: 'glass', label: 'Glass', category: 'dimension', keywords: ['glass', 'glassy', 'frosted', 'acrylic', 'glossy'], params: [P('highlight', 'Highlight', 0, 100, 65), P('rim', 'Rim light', 0, 100, 60)], filter: (p, c) => `<feGaussianBlur in="${c.in}" stdDeviation="6" result="${c.u}0"/><feSpecularLighting in="${c.u}0" surfaceScale="6" specularConstant="${n2(p.highlight / 70)}" specularExponent="35" lighting-color="#ffffff" result="${c.u}1"><fePointLight x="${n2(c.w * 0.25)}" y="${n2(-c.h * 0.4)}" z="${n2(Math.max(c.w, c.h))}"/></feSpecularLighting><feComposite in="${c.u}1" in2="${c.in}" operator="in" result="${c.u}2"/><feComponentTransfer in="${c.in}" result="${c.u}3"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur in="${c.u}3" stdDeviation="3" result="${c.u}4"/><feFlood flood-color="#ffffff" flood-opacity="${n2(p.rim / 100)}" result="${c.u}5"/><feComposite in="${c.u}5" in2="${c.u}4" operator="in" result="${c.u}6"/><feComposite in="${c.u}6" in2="${c.in}" operator="in" result="${c.u}7"/><feMerge result="${c.out}"><feMergeNode in="${c.in}"/><feMergeNode in="${c.u}7"/><feMergeNode in="${c.u}2"/></feMerge>`, says: 'like glass, with a highlight and a lit rim' },
  { kind: 'soft', label: 'Soft material', category: 'dimension', keywords: ['soft', 'neumorphic', 'clay', 'soft ui', 'pillowy'], params: [P('distance', 'Distance', 1, 60, 12), P('blur', 'Blur', 1, 80, 24), P('opacity', 'Depth', 0, 100, 45)], colors: [{ key: 'color', label: 'Light', def: '#ffffff' }, { key: 'color2', label: 'Shade', def: '#000000' }], reach: (p) => p.distance + p.blur * 1.5 + 4, filter: (p, c) => `<feGaussianBlur in="${c.in}" stdDeviation="${n2(p.blur / 2)}" result="${c.u}0"/><feOffset in="${c.u}0" dx="${n2(-p.distance)}" dy="${n2(-p.distance)}" result="${c.u}1"/><feFlood ${flood(c.color, p.opacity / 100)} result="${c.u}2"/><feComposite in="${c.u}2" in2="${c.u}1" operator="in" result="${c.u}3"/><feOffset in="${c.u}0" dx="${n2(p.distance)}" dy="${n2(p.distance)}" result="${c.u}4"/><feFlood ${flood(c.color2, p.opacity / 150)} result="${c.u}5"/><feComposite in="${c.u}5" in2="${c.u}4" operator="in" result="${c.u}6"/><feMerge result="${c.out}"><feMergeNode in="${c.u}3"/><feMergeNode in="${c.u}6"/><feMergeNode in="${c.in}"/></feMerge>`, says: 'soft, lit from the top left' },
  { kind: 'extrude', label: 'Extrude', category: 'dimension', keywords: ['extrude', 'long shadow', '3d', 'depth', 'stacked', 'isometric depth'], params: [P('depth', 'Depth', 1, 300, 28), P('angle', 'Angle', 0, 360, 45), P('steps', 'Steps', 2, 60, 18), P('fade', 'Fade out', 0, 1, 0)], colors: [{ key: 'color', label: 'Side colour', def: '#1a1a1a' }], special: 'extrude', says: 'extruded into depth' },
];

export const EFFECT_BY_KIND = new Map(EFFECTS.map((e) => [e.kind, e]));
export const EFFECT_CATEGORIES: readonly { id: EffectCategory; label: string }[] = [
  { id: 'shadow', label: 'Shadows' },
  { id: 'light', label: 'Light' },
  { id: 'blur', label: 'Blur & sharpen' },
  { id: 'colour', label: 'Colour' },
  { id: 'texture', label: 'Texture & print' },
  { id: 'distort', label: 'Distortion' },
  { id: 'stylize', label: 'Stylize' },
  { id: 'dimension', label: 'Dimension' },
];

/** An effect with its defaults. */
export function effectDefaults(kind: string): Effect | null {
  const s = EFFECT_BY_KIND.get(kind);
  if (!s) return null;
  const e: Effect = { kind, on: true, params: Object.fromEntries(s.params.map((q) => [q.key, q.def])) };
  for (const c of s.colors ?? []) e[c.key] = c.def;
  return e;
}

/** An effect list from storage or a model held to the registry: unknown kinds dropped (said), parameters clamped,
 * colours read; at most 12. */
export function normalizeEffects(v: unknown, notes?: string[]): Effect[] {
  if (!Array.isArray(v)) return [];
  const out: Effect[] = [];
  for (const raw of v.slice(0, 12)) {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const spec = typeof r.kind === 'string' ? EFFECT_BY_KIND.get(r.kind) : undefined;
    if (!spec) {
      notes?.push(`An effect SocriaUX cannot draw (“${String(r.kind ?? '').slice(0, 24)}”) was left out.`);
      continue;
    }
    const given = r.params && typeof r.params === 'object' ? (r.params as Record<string, unknown>) : {};
    const params: Record<string, number> = {};
    for (const q of spec.params) {
      const x = given[q.key];
      const n = typeof x === 'number' && Number.isFinite(x) ? x : q.def;
      params[q.key] = Math.max(q.min, Math.min(q.max, q.step >= 1 ? Math.round(n) : n));
    }
    const e: Effect = { kind: spec.kind, on: r.on !== false, params };
    for (const c of spec.colors ?? []) e[c.key] = parseColor(r[c.key]) ?? c.def;
    out.push(e);
  }
  return out;
}

/** How far an effect stack can paint beyond the object's box. */
export function effectReach(effects: readonly Effect[]): number {
  return effects.reduce((m, e) => (e.on ? Math.max(m, EFFECT_BY_KIND.get(e.kind)?.reach?.(e.params) ?? 0) : m), 0);
}

/** The enabled filter effects of a stack compiled into one SVG filter (null when there are none). The filter works in
 * the object's own box (0–w, 0–h), grown by the stack's reach. */
export function compileFilter(effects: readonly Effect[], id: string, w: number, h: number): string | null {
  const live = effects.filter((e) => e.on && EFFECT_BY_KIND.get(e.kind)?.filter);
  if (!live.length) return null;
  const pad = Math.ceil(effectReach(live) + 2);
  let input = 'SourceGraphic';
  const body: string[] = [];
  live.forEach((e, i) => {
    const spec = EFFECT_BY_KIND.get(e.kind)!;
    const out = i === live.length - 1 ? `${id}out` : `${id}r${i}`;
    body.push(spec.filter!(e.params, { in: input, out, u: `${id}e${i}`, w, h, color: e.color ?? spec.colors?.[0]?.def ?? '#000000', color2: e.color2 ?? spec.colors?.[1]?.def ?? '#ffffff', color3: e.color3 ?? spec.colors?.[2]?.def ?? '#ffffff' }));
    input = out;
  });
  return `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="${-pad}" y="${-pad}" width="${n2(w + pad * 2)}" height="${n2(h + pad * 2)}" color-interpolation-filters="sRGB">${body.join('')}</filter>`;
}

/** Effects ready to use together. */
export const EFFECT_PRESETS: readonly { id: string; label: string; effects: Effect[] }[] = [
  { id: 'soft-shadow', label: 'Soft shadow', effects: [{ kind: 'drop-shadow', on: true, params: { dx: 0, dy: 14, blur: 32, spread: 0, opacity: 22 }, color: '#000000' }] },
  { id: 'long-shadow', label: 'Long shadow', effects: [{ kind: 'extrude', on: true, params: { depth: 140, angle: 45, steps: 40, fade: 1 }, color: '#000000' }] },
  { id: 'neon', label: 'Neon', effects: [{ kind: 'glow', on: true, params: { size: 18, spread: 2, opacity: 90 }, color: '#ff3df2' }, { kind: 'glow', on: true, params: { size: 44, spread: 0, opacity: 55 }, color: '#7a5cff' }] },
  { id: 'risograph', label: 'Risograph', effects: [{ kind: 'misregistration', on: true, params: { offset: 4, opacity: 80 }, color: '#ff4f9a', color2: '#1fb7c9' }, { kind: 'grain', on: true, params: { amount: 35, size: 2, seed: 8 } }] },
  { id: 'newsprint', label: 'Newsprint', effects: [{ kind: 'halftone', on: true, params: { size: 7, angle: 45 }, color: '#151515', color2: '#efe9da' }, { kind: 'grain', on: true, params: { amount: 20, size: 2, seed: 3 } }] },
  { id: 'glitch', label: 'Glitch', effects: [{ kind: 'glitch', on: true, params: { amount: 46, slices: 36, seed: 6 } }, { kind: 'chromatic', on: true, params: { amount: 5, angle: 0 } }] },
  { id: 'vintage', label: 'Vintage print', effects: [{ kind: 'posterize', on: true, params: { levels: 5 } }, { kind: 'duotone', on: true, params: { amount: 80 }, color: '#2b1d14', color2: '#f2d9a6' }, { kind: 'grain', on: true, params: { amount: 30, size: 3, seed: 2 } }] },
  { id: 'embossed', label: 'Embossed paper', effects: [{ kind: 'emboss', on: true, params: { depth: 4, angle: 135 } }] },
  { id: 'glass', label: 'Glass', effects: [{ kind: 'glass', on: true, params: { highlight: 65, rim: 60 } }, { kind: 'drop-shadow', on: true, params: { dx: 0, dy: 18, blur: 40, spread: 0, opacity: 18 }, color: '#000000' }] },
  { id: 'distressed', label: 'Distressed', effects: [{ kind: 'distress', on: true, params: { amount: 34, scale: 45, seed: 5 } }, { kind: 'grain', on: true, params: { amount: 22, size: 3, seed: 4 } }] },
  { id: 'ink', label: 'Letterpress ink', effects: [{ kind: 'ink-bleed', on: true, params: { amount: 40, seed: 9 } }] },
  { id: 'soft-ui', label: 'Soft material', effects: [{ kind: 'soft', on: true, params: { distance: 12, blur: 26, opacity: 50 }, color: '#ffffff', color2: '#000000' }] },
];
