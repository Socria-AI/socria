// lib/ux-v0/render.ts — a DesignSpec, drawn as a real page.
//
// Deterministic: the same spec always gives the same HTML. Semantic: headings
// in order, real buttons and links, every form field with a visible label.
// Responsive: one stylesheet, mobile first. Inspectable: every element carries
// data-ux-section (its section's id) and data-ux-path (the field it shows), so
// a selection in the canvas knows exactly what in the spec it touches, and
// iteration can change only that.
//
// DRAWN FROM THE LOOK. The stylesheet is not one design recoloured: the art
// direction's look (spec.ts, direction.ts) decides the type scale and its
// case, the grid the sections hang from, whether things are open, ruled,
// boxed or set on bands of colour, what a button is, how photographs are
// framed and treated, and which motifs appear (section numbers, flat shapes,
// a running marquee, captions, giant numerals, pull quotes). Only the rules a
// look uses are written, so two directions give two different stylesheets.
//
// Every ground a section can sit on (its tone) carries its own text, muted,
// rule and accent-ink colours, each checked to read at 4.5:1 or better on it.
//
// Images come only from the moodboard (by reference id); each one used is
// credited on the page itself, as its licence asks. Unknown facts the model
// left as [bracketed placeholders] are drawn as visible placeholders, never
// filled in.

import { contrastRatio } from '../ux/audit';
import { isDark, mix, rgbOf } from './color';
import { advanceEm, fontStack, fontStylesheet, hasItalic, knownFont, nearestWeight } from './fonts';
import { BREAKPOINTS, BREAKPOINT_QUERY, NEEDS_IMAGE, SCENE_MATERIALS, SCENE_MODELS, SHAPE_EFFECTIVE, ensureContrast, kindDef, lookFromTokens, type DesignSpec, type DesignTokens, type Look, type Section, type Shape } from './spec';
import { fieldLayers, type Piece } from './compose';

/**
 * A section's shape, as the page draws it: each setting its variant uses becomes a class (sh-side-end,
 * sh-times-rows…) or a variable (--sh-measure, and --sh-a/--sh-b for the proportion between two columns).
 */
export function shapeAttrs(s: Pick<Section, 'kind' | 'variant' | 'shape'>): { cls: string; vars: string } {
  const sh = s.shape;
  if (!sh) return { cls: '', vars: '' };
  const cls: string[] = [];
  const vars: string[] = [];
  for (const k of SHAPE_EFFECTIVE[s.kind]?.[s.variant] ?? []) {
    const v = sh[k];
    if (v === undefined) continue;
    if (typeof v === 'number') {
      if (k === 'ratio') {
        const a = Math.round(v * 100);
        cls.push('sh-ratio');
        vars.push(`--sh-a:${a}fr`, `--sh-b:${100 - a}fr`);
      } else {
        // the class says the setting is there, so a design without it draws exactly as it always did
        cls.push(`sh-${k}`);
        vars.push(`--sh-${k}:${v}`);
      }
    } else cls.push(`sh-${k}-${v}`);
  }
  return { cls: cls.length ? ` ${cls.join(' ')}` : '', vars: vars.join(';') };
}
import { creditText, type MoodboardRef } from './types';
import { BEHAVIOR_SOURCE } from './behaviors';
import { kineticHeadline, motionCss, scriptedMarks, type MotionMode } from './motion';
import { MOTION_RUNTIME } from './motion-runtime';
import { SCENE_RUNTIME } from './scene-runtime';
import { proceduralUri } from './assets';

export interface Credit {
  id: string;
  text: string;
  url: string;
  license: string;
}

export interface Rendered {
  html: string;
  css: string;
  credits: Credit[];
}

export interface RenderOptions {
  /**
   * How motion is written: `static` (the default: the canvas, specimens and the
   * checks see the page at rest, hovers only), `play` (the preview and the
   * exported page), or `reduced` (the reduced-motion alternative, to preview it).
   */
  motion?: MotionMode;
  /**
   * Inline SocriaUX's behaviour runtime (lib/ux-v0/behaviors.ts) in the page: for an exported page,
   * which has no sandbox to add it. The canvas, the preview and the checks add it by nonce instead.
   */
  runtime?: boolean;
}

// ── text ─────────────────────────────────────────────────────────────

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Escaped text, with [placeholders] marked so nobody mistakes them for
 * content, and *a word* the copy emphasises set as the look sets emphasis.
 */
const t = (v: unknown): string =>
  esc(v)
    .replace(/\[([^\]\n]{2,40})\]/g, '<span class="ph" title="Placeholder — fill this in">[$1]</span>')
    .replace(/\*([^*\n<>]{1,80})\*/g, '<em class="em">$1</em>');

/** Text for an attribute: no markup, no emphasis marks. */
const plain = (v: unknown): string => esc(String(v ?? '').replace(/\*([^*\n]{1,80})\*/g, '$1'));

const attr = (section: string, path: string) => `data-ux-section="${esc(section)}" data-ux-path="${esc(path)}"`;

// ── icons: a small stroke set, drawn inline ───────────────────────────

const ICON_PATHS: Record<string, string> = {
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  leaf: 'M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7',
  cup: 'M5 9h11v5a5 5 0 01-5 5H10a5 5 0 01-5-5V9zM16 10h2a2 2 0 010 4h-2M8 3c0 1.5 1 1.5 1 3M11 3c0 1.5 1 1.5 1 3',
  clock: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a5.5 5.5 0 013.5 6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  check: 'M4 12.5l5 5L20 6.5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  globe: 'M12 3a9 9 0 110 18 9 9 0 010-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  compass: 'M12 3a9 9 0 110 18 9 9 0 010-18zM15.5 8.5l-2 5-5 2 2-5 5-2z',
  home: 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6',
  search: 'M11 4a7 7 0 110 14 7 7 0 010-14zM21 21l-5-5',
};

const icon = (name: string) =>
  ICON_PATHS[name] ? `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICON_PATHS[name]}"/></svg>` : '';

// ── the accent as ink ────────────────────────────────────────────────
// The accent fills buttons and bands at any lightness; where it colours text (an eyebrow, a numeral,
// a rising figure) it is moved toward black or white, keeping its hue, until it reads at 4.5:1 on
// both the background and the surface.
export function accentInk(c: DesignTokens['colors']): string {
  const onBg = ensureContrast(c.accent, c.background, 4.5);
  return contrastRatio(onBg, c.surface) >= 4.5 ? onBg : ensureContrast(onBg, c.surface, 4.5);
}

// ── grounds: every tone a section can sit on, with colours that read on it ──

interface Ground {
  bg: string;
  text: string;
  muted: string;
  line: string;
  ink: string;
  card: string;
  btnBg: string;
  btnFg: string;
  /** three inks for flat shapes, each visible on this ground */
  inks: [string, string, string];
}

/** Inks that show on a ground: the candidates that stand apart from it, best first. */
function inksOn(bg: string, candidates: string[]): [string, string, string] {
  const seen = new Set<string>();
  const usable = candidates.filter((c) => c && !seen.has(c) && (seen.add(c), contrastRatio(c, bg) >= 1.6));
  while (usable.length < 3) usable.push(usable[usable.length % Math.max(1, usable.length)] ?? mix(bg, '#000000', 0.4));
  return [usable[0], usable[1], usable[2]];
}

const best = (bg: string) => (contrastRatio('#ffffff', bg) >= contrastRatio('#111111', bg) ? '#ffffff' : '#111111');

/** A card's surface on a ground: a quiet tint that keeps the ground's text and muted text readable, else the ground itself. */
function cardOn(bg: string, text: string, muted: string, prefer: string[] = []): string {
  const away = isDark(text) ? '#ffffff' : '#000000';
  const tries = [...prefer, mix(bg, text, 0.08), mix(bg, away, 0.12), mix(bg, away, 0.06)];
  return tries.find((c) => contrastRatio(text, c) >= 4.5 && contrastRatio(muted, c) >= 4.5 && Math.abs(contrastRatio(c, bg) - 1) > 0.03) ?? bg;
}

export function grounds(c: DesignTokens['colors'], accent2: string): Record<string, Ground> {
  const dark = isDark(c.background);
  const two = accent2 || '';
  const base: Ground = { bg: c.background, text: c.text, muted: c.muted, line: c.line, ink: accentInk(c), card: c.surface, btnBg: c.accent, btnFg: c.accentText, inks: inksOn(c.background, [c.accent, two, c.text, accentInk(c)]) };
  const altBg = Math.abs(contrastRatio(c.surface, c.background) - 1) > 0.06 ? c.surface : mix(c.background, c.text, dark ? 0.07 : 0.045);
  const alt: Ground = {
    bg: altBg,
    text: ensureContrast(c.text, altBg, 7),
    muted: ensureContrast(c.muted, altBg, 4.5),
    line: mix(altBg, c.text, 0.16),
    ink: ensureContrast(c.accent, altBg, 4.5),
    card: cardOn(altBg, ensureContrast(c.text, altBg, 7), ensureContrast(c.muted, altBg, 4.5), [c.background]),
    btnBg: c.accent,
    btnFg: c.accentText,
    inks: inksOn(altBg, [c.accent, two, c.text]),
  };
  const accent: Ground = {
    bg: c.accent,
    text: c.accentText,
    muted: ensureContrast(mix(c.accentText, c.accent, 0.22), c.accent, 4.5),
    line: mix(c.accent, c.accentText, 0.32),
    ink: c.accentText,
    card: cardOn(c.accent, c.accentText, ensureContrast(mix(c.accentText, c.accent, 0.22), c.accent, 4.5)),
    btnBg: c.accentText,
    btnFg: c.accent,
    inks: inksOn(c.accent, [c.accentText, two, c.background, c.text]),
  };
  const a2 = accent2 || c.accent;
  const a2Text = best(a2);
  const accent2G: Ground = {
    bg: a2,
    text: a2Text,
    muted: ensureContrast(mix(a2Text, a2, 0.22), a2, 4.5),
    line: mix(a2, a2Text, 0.32),
    ink: a2Text,
    card: cardOn(a2, a2Text, ensureContrast(mix(a2Text, a2, 0.22), a2, 4.5)),
    btnBg: a2Text,
    btnFg: a2,
    inks: inksOn(a2, [a2Text, c.accent, c.background, c.text]),
  };
  const invBg = c.text;
  const invText = ensureContrast(c.background, invBg, 7);
  const invAccentOk = contrastRatio(c.accent, invBg) >= 3;
  const invert: Ground = {
    bg: invBg,
    text: invText,
    muted: ensureContrast(mix(invText, invBg, 0.3), invBg, 4.5),
    line: mix(invBg, invText, 0.22),
    ink: ensureContrast(c.accent, invBg, 4.5),
    card: cardOn(invBg, invText, ensureContrast(mix(invText, invBg, 0.3), invBg, 4.5)),
    btnBg: invAccentOk ? c.accent : invText,
    btnFg: invAccentOk ? c.accentText : invBg,
    inks: inksOn(invBg, [c.accent, two, invText]),
  };
  return { base, alt, accent, accent2: accent2G, invert };
}

const groundVars = (g: Ground) => `--bg:${g.bg};--text:${g.text};--muted:${g.muted};--line:${g.line};--accent-ink:${g.ink};--surface:${g.card};--btn-bg:${g.btnBg};--btn-fg:${g.btnFg};--ink1:${g.inks[0]};--ink2:${g.inks[1]};--ink3:${g.inks[2]}`;

// ── images ───────────────────────────────────────────────────────────

class Images {
  used = new Map<string, MoodboardRef>();
  figures = 0;
  constructor(private refs: Map<string, MoodboardRef>, private captions: boolean) {}
  img(section: Section, i: number, cls: string, eager = false): string {
    const id = section.images[i];
    const ref = id ? this.refs.get(id) : undefined;
    if (!ref) return `<div class="${cls} img-missing" ${attr(section.id, `images.${i}`)} role="img" aria-label="Image to come"></div>`;
    this.used.set(ref.id, ref);
    const alt = ref.title && !/^(untitled|image|photo)$/i.test(ref.title) ? ref.title : '';
    // its subject stays in view however the layout crops it (whole percentages, checked where the picture is kept)
    const focus = ref.focus ? ` style="object-position:${ref.focus.x}% ${ref.focus.y}%"` : '';
    return `<img class="${cls}" src="${esc(ref.url)}" alt="${esc(alt)}"${focus} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer" ${attr(section.id, `images.${i}`)}>`;
  }
  /** a caption for a picture, when the look captions them: "Fig. 2 — Morning counter" */
  cap(section: Section, i: number): string {
    if (!this.captions) return '';
    const ref = this.refs.get(section.images[i] ?? '');
    if (!ref) return '';
    this.figures++;
    const title = ref.title && !/^(untitled|image|photo|img[_ -]?\d*)$/i.test(ref.title) ? ref.title : ref.query || '';
    return `<figcaption class="fig-cap"><span class="fig-no">Fig. ${this.figures}</span>${title ? ` ${esc(title.slice(0, 80))}` : ''}</figcaption>`;
  }
  has(section: Section, i: number) {
    const id = section.images[i];
    return !!(id && this.refs.get(id));
  }
}

// ── a scene's silhouette: what stands in for the 3D object where it cannot be drawn ──

const SCENE_PROFILES: Record<string, [number, number][]> = {
  vessel: [[0, -1], [0.5, -1], [0.6, -0.9], [0.7, -0.45], [0.68, 0.05], [0.5, 0.48], [0.3, 0.74], [0.27, 0.92], [0.33, 1]],
  bottle: [[0, -1.05], [0.42, -1.05], [0.46, -0.98], [0.47, 0.25], [0.4, 0.45], [0.17, 0.62], [0.15, 0.95], [0.18, 1.05], [0, 1.05]],
};
export function scenePoster(model: string): string {
  const cx = 100;
  const cy = 100;
  const k = 78;
  let mark: string;
  const prof = SCENE_PROFILES[model];
  if (prof) {
    const right = prof.map(([r, y]) => `${(cx + r * k).toFixed(1)},${(cy - y * k).toFixed(1)}`);
    const left = [...prof].reverse().map(([r, y]) => `${(cx - r * k).toFixed(1)},${(cy - y * k).toFixed(1)}`);
    mark = `<polygon points="${[...right, ...left].join(' ')}" fill="currentColor"/><polygon points="${prof.map(([r, y]) => `${(cx - r * k * 0.55).toFixed(1)},${(cy - y * k).toFixed(1)}`).join(' ')} ${[...prof].reverse().map(([r, y]) => `${(cx - r * k * 0.2).toFixed(1)},${(cy - y * k).toFixed(1)}`).join(' ')}" fill="#fff" opacity=".16"/>`;
  } else if (model === 'torus' || model === 'ring') {
    const w = model === 'ring' ? 0.12 : 0.34;
    mark = `<path fill="currentColor" fill-rule="evenodd" d="M${cx - 80} ${cy}a80 34 0 1 0 160 0a80 34 0 1 0 -160 0ZM${cx - 80 * (1 - w)} ${cy}a${(80 * (1 - w)).toFixed(1)} ${(34 * (1 - w * 1.6)).toFixed(1)} 0 1 0 ${(160 * (1 - w)).toFixed(1)} 0a${(80 * (1 - w)).toFixed(1)} ${(34 * (1 - w * 1.6)).toFixed(1)} 0 1 0 -${(160 * (1 - w)).toFixed(1)} 0Z"/>`;
  } else if (model === 'monolith') mark = `<rect x="${cx - 24}" y="${cy - 74}" width="48" height="148" fill="currentColor"/><rect x="${cx - 24}" y="${cy - 74}" width="14" height="148" fill="#fff" opacity=".16"/>`;
  else if (model === 'knot') mark = `<circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="currentColor" stroke-width="22"/><circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="currentColor" stroke-width="14" opacity=".7"/>`;
  else mark = `<circle cx="${cx}" cy="${cy}" r="70" fill="currentColor"/><ellipse cx="${cx - 26}" cy="${cy - 30}" rx="22" ry="14" fill="#fff" opacity=".22"/>`;
  return `<svg class="sc-poster" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${mark}</svg>`;
}

// ── shapes: flat geometry, for looks that use it ──────────────────────

const SHAPE_SVG: Record<Shape, (x: number, y: number, s: number, fill: string) => string> = {
  circle: (x, y, s, f) => `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="${f}"/>`,
  arch: (x, y, s, f) => `<path d="M${x} ${y + s}V${y + s / 2}A${s / 2} ${s / 2} 0 0 1 ${x + s} ${y + s / 2}V${y + s}Z" fill="${f}"/>`,
  square: (x, y, s, f) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${f}"/>`,
  quarter: (x, y, s, f) => `<path d="M${x} ${y + s}V${y}A${s} ${s} 0 0 1 ${x + s} ${y + s}Z" fill="${f}"/>`,
  diamond: (x, y, s, f) => `<path d="M${x + s / 2} ${y}L${x + s} ${y + s / 2}L${x + s / 2} ${y + s}L${x} ${y + s / 2}Z" fill="${f}"/>`,
  blob: (x, y, s, f) =>
    `<path d="M${x + s * 0.52} ${y + s * 0.04}C${x + s * 0.82} ${y + s * 0.02} ${x + s * 0.99} ${y + s * 0.3} ${x + s * 0.96} ${y + s * 0.56}C${x + s * 0.93} ${y + s * 0.84} ${x + s * 0.66} ${y + s * 0.99} ${x + s * 0.42} ${y + s * 0.95}C${x + s * 0.16} ${y + s * 0.9} ${x + s * 0.01} ${y + s * 0.7} ${x + s * 0.05} ${y + s * 0.44}C${x + s * 0.09} ${y + s * 0.18} ${x + s * 0.26} ${y + s * 0.06} ${x + s * 0.52} ${y + s * 0.04}Z" fill="${f}"/>`,
};

/** A small composition of the look's shapes in its inks; `turn` varies it per place. */
function shapeArt(look: Look, turn: number, cls = 'art'): string {
  if (!look.motifs.includes('shapes') || !look.shapes.length) return '';
  const inks = ['var(--ink1)', 'var(--ink2)', 'var(--ink3)'];
  const cells: [number, number][] = [
    [0, 0],
    [120, 0],
    [0, 120],
    [120, 120],
  ];
  const n = Math.min(4, Math.max(3, look.shapes.length));
  const marks = cells
    .map(([x, y], i) => {
      if (n === 3 && i === turn % 4) return '';
      const shape = look.shapes[(i + turn) % look.shapes.length];
      return SHAPE_SVG[shape](x, y, 120, inks[(i + turn) % 3]);
    })
    .join('');
  return `<div class="${cls}" aria-hidden="true"><svg viewBox="0 0 240 240" focusable="false">${marks}</svg></div>`;
}

// ── sections ─────────────────────────────────────────────────────────

interface Ctx {
  look: Look;
  first: boolean;
  /** drawn inside an app screen's own layout (no page wrapper) */
  app?: boolean;
  /** the screen's leading heading: nothing above it is a hero or a screen header */
  lead?: boolean;
  /** motion plays: the opening headline may be set as kinetic type */
  play: boolean;
  /** the section's number, when the look numbers sections */
  no: string;
  turn: number;
  im: Images;
}

type R = (s: Section, c: Record<string, any>, x: Ctx) => string;

const eyebrow = (s: Section, v: unknown) => (v ? `<p class="eyebrow" ${attr(s.id, 'eyebrow')}>${t(v)}</p>` : '');
const secNo = (x: Ctx) => (x.no ? `<span class="sec-no" aria-hidden="true">${x.no}</span>` : '');
const head = (s: Section, c: Record<string, any>, x: Ctx, cls = '') =>
  c.title || c.eyebrow || c.intro || x.no
    ? `<div class="section-head${cls ? ` ${cls}` : ''}">${secNo(x)}${eyebrow(s, c.eyebrow)}${c.title ? `<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}${c.intro ? `<p class="lede" ${attr(s.id, 'intro')}>${t(c.intro)}</p>` : ''}</div>`
    : '';
const btn = (s: Section, path: string, label: unknown, kind: 'primary' | 'secondary') =>
  label ? `<a class="btn btn-${kind}" href="#" ${attr(s.id, path)}>${t(label)}</a>` : '';
const actions = (s: Section, c: Record<string, any>, a = 'primary', b = 'secondary') =>
  c[a] || c[b] ? `<div class="actions">${btn(s, a, c[a], 'primary')}${btn(s, b, c[b], 'secondary')}</div>` : '';
const num = (i: number) => String(i + 1).padStart(2, '0');

const SECTIONS: Record<string, R> = {
  nav: (s, c) => {
    const links = (c.links as string[]).map((l, i) => `<li><a href="#" ${attr(s.id, `links.${i}`)}>${t(l)}</a></li>`).join('');
    // where the links are not shown in the bar (on a phone; always, in the "menu" variant) a Menu button opens them
    // full-screen. The button appears only once SocriaUX's behaviour runtime has bound it (lib/ux-v0/behaviors.ts), so a
    // page without scripts never shows a control that does nothing
    const big = (c.links as string[]).map((l) => `<li><a href="#">${t(l)}</a></li>`).join('');
    const menu = links
      ? `<button type="button" class="nav-menu" data-ux-menu aria-expanded="false" aria-controls="${esc(s.id)}-menu" hidden>Menu</button><div class="nav-over" id="${esc(s.id)}-menu" data-ux-menu-panel role="dialog" aria-modal="true" aria-label="Menu" hidden><button type="button" class="nav-close" data-ux-menu-close>Close</button><ul class="nav-over-links">${big}</ul>${c.cta ? `<a class="btn btn-primary" href="#">${t(c.cta)}</a>` : ''}</div>`
      : '';
    return `<header class="wrap nav-in"><a class="brand" href="#" ${attr(s.id, 'brand')}>${t(c.brand)}</a>${links ? `<nav aria-label="Main"><ul class="nav-links">${links}</ul></nav>` : ''}${c.cta ? btn(s, 'cta', c.cta, 'primary') : ''}${menu}</header>`;
  },
  hero: (s, c, x) => {
    const { im, look } = x;
    const sub = c.subtitle ? `<p class="hero-sub" ${attr(s.id, 'subtitle')}>${t(c.subtitle)}</p>` : '';
    const note = c.note ? `<p class="small muted hero-note" ${attr(s.id, 'note')}>${t(c.note)}</p>` : '';
    const kinetic = x.play && x.first && (look.motion?.headline === 'words' || look.motion?.headline === 'letters') ? look.motion.headline : null;
    const words = kinetic ? kineticHeadline(t(c.title), kinetic) : t(c.title);
    const h1 = (cls = '') => `<h1 class="h-hero${cls}" ${attr(s.id, 'title')}${kinetic ? ` aria-label="${plain(c.title)}"` : ''}>${words}</h1>`;
    const text = `<div class="hero-text">${eyebrow(s, c.eyebrow)}${h1()}${sub}${actions(s, c)}${note}</div>`;
    const fig = (cls: string, imgCls: string) => `<figure class="${cls}">${im.img(s, 0, imgCls, true)}${im.cap(s, 0)}</figure>`;
    if (s.variant === 'full-bleed' && im.has(s, 0)) return `<div class="hero-bleed">${im.img(s, 0, 'bleed-img', true)}<div class="bleed-shade scrim"></div><div class="wrap">${text}</div></div>`;
    if (s.variant === 'split' && im.has(s, 0)) return `<div class="wrap hero-split">${text}${fig('hero-media', 'media-img')}</div>`;
    if (s.variant === 'statement') {
      const art = shapeArt(look, x.turn);
      return `<div class="wrap hero-statement${art ? ' has-art' : ''}"><div class="hs-top"><div class="hs-words">${eyebrow(s, c.eyebrow)}${h1()}</div>${art}</div><div class="hs-foot">${sub}<div class="hs-act">${actions(s, c)}${note}</div></div>${im.has(s, 0) ? fig('hero-wide', 'media-img') : ''}</div>`;
    }
    if (s.variant === 'poster') {
      const art = im.has(s, 0) ? '' : shapeArt(look, x.turn, 'art art-poster');
      return `<div class="wrap hero-poster">${eyebrow(s, c.eyebrow)}${h1(' h-poster')}<div class="hp-row${im.has(s, 0) ? ' has-media' : ''}"><div class="hp-text">${sub}${actions(s, c)}${note}</div>${im.has(s, 0) ? fig('hp-media', 'media-img') : art}</div></div>`;
    }
    if (s.variant === 'editorial') return `<div class="wrap hero-editorial">${text}${im.has(s, 0) ? fig('hero-wide', 'media-img') : shapeArt(look, x.turn, 'art art-wide')}</div>`;
    return `<div class="wrap hero-centered">${text}${im.has(s, 0) ? fig('hero-wide', 'media-img') : ''}</div>`;
  },
  features: (s, c, x) => {
    const showIcons = x.look.motifs.includes('icons');
    const items = (c.items as any[])
      .map((it, i) => {
        const lead = s.variant === 'numbered' || s.variant === 'index' ? `<span class="num" aria-hidden="true">${num(i)}</span>` : showIcons && it.icon && s.variant !== 'columns' ? icon(it.icon) : '';
        return `<li class="feature">${lead}<h3 class="h-item" ${attr(s.id, `items.${i}.title`)}>${t(it.title)}</h3>${it.text ? `<p ${attr(s.id, `items.${i}.text`)}>${t(it.text)}</p>` : ''}</li>`;
      })
      .join('');
    const tag = s.variant === 'index' || s.variant === 'numbered' ? 'ol' : 'ul';
    const h = head(s, c, x);
    return `<div class="wrap${h ? ' has-head' : ''}">${h}<${tag} class="features f-${s.variant} n-${Math.min(4, (c.items as any[]).length)}">${items}</${tag}></div>`;
  },
  split: (s, c, x) => {
    const { im } = x;
    const bullets = (c.bullets as string[]).length ? `<ul class="ticks">${(c.bullets as string[]).map((b, i) => `<li ${attr(s.id, `bullets.${i}`)}>${icon('check')}<span>${t(b)}</span></li>`).join('')}</ul>` : '';
    const text = `<div class="split-text">${secNo(x)}${eyebrow(s, c.eyebrow)}<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>${c.text ? `<p class="body-lg" ${attr(s.id, 'text')}>${t(c.text)}</p>` : ''}${bullets}${c.cta ? `<div class="actions">${btn(s, 'cta', c.cta, 'secondary')}</div>` : ''}</div>`;
    const media = im.has(s, 0) ? `<figure class="split-media">${im.img(s, 0, 'media-img')}${im.cap(s, 0)}</figure>` : '';
    return `<div class="wrap split ${s.variant === 'image-left' ? 'is-left' : ''} ${media ? '' : 'no-media'}">${s.variant === 'image-left' ? media + text : text + media}</div>`;
  },
  gallery: (s, c, x) => {
    const { im } = x;
    const tags = (Array.isArray(c.tags) ? (c.tags as string[]) : []).slice(0, s.images.length);
    const kinds = [...new Set(tags.filter(Boolean).map((g) => String(g).trim()))];
    const filters = kinds.length >= 2 ? `<div class="ux-chips" role="group" aria-label="Show" data-ux-filters><button type="button" class="ux-chip" aria-pressed="true" data-ux-filter="">All</button>${kinds.map((k) => `<button type="button" class="ux-chip" aria-pressed="false" data-ux-filter="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : '';
    const imgs = s.images.map((_, i) => `<figure class="g-item"${tags[i] ? ` data-tag="${esc(String(tags[i]).trim())}"` : ''} data-ux-open="">${im.img(s, i, 'g-img')}${im.cap(s, i)}</figure>`).join('');
    const h = head(s, c, x);
    return `<div class="wrap${h ? ' has-head' : ''}" data-ux-gallery>${h}${filters}<div class="g-body"><div class="gallery g-${s.variant} n-${Math.min(8, s.images.length)}">${imgs}</div>${c.caption ? `<p class="small muted caption" ${attr(s.id, 'caption')}>${t(c.caption)}</p>` : ''}</div></div>`;
  },
  quote: (s, c, x) =>
    `<div class="wrap quote q-${s.variant}">${s.variant === 'with-portrait' && x.im.has(s, 0) ? `<div class="q-portrait">${x.im.img(s, 0, 'portrait')}</div>` : ''}<figure><blockquote ${attr(s.id, 'quote')}><p>${t(c.quote)}</p></blockquote><figcaption><span class="q-author" ${attr(s.id, 'author')}>${t(c.author)}</span>${c.role ? `<span class="q-role muted" ${attr(s.id, 'role')}>${t(c.role)}</span>` : ''}</figcaption></figure></div>`,
  stats: (s, c, x) => {
    const h = head(s, c, x);
    return `<div class="wrap${h ? ' has-head' : ''}">${h}<dl class="stats st-${s.variant}">${(c.items as any[])
      .map((it, i) => `<div class="stat"><dt ${attr(s.id, `items.${i}.label`)}>${t(it.label)}</dt><dd ${attr(s.id, `items.${i}.value`)}>${t(it.value)}</dd></div>`)
      .join('')}</dl></div>`;
  },
  // a section composed from layout pieces (lib/ux-v0/compose.ts): every class from this renderer's own set,
  // every proportion a whole number the normaliser checked, every word escaped
  compose: (s, c, x) => {
    const piece = (p: Piece, path: string): string => {
      switch (p.t) {
        case 'stack':
          return `<div class="cp-stack cp-${p.dir} cp-gap-${p.gap} cp-al-${p.align}${p.pin ? ' cp-pin' : ''}">${p.children.map((ch, i) => piece(ch, `${path}.children.${i}`)).join('')}</div>`;
        case 'grid': {
          const cols = p.cols.map((n) => `minmax(0,${Math.max(1, Math.min(12, Math.round(n)))}fr)`).join(' ');
          return `<div class="cp-grid cp-gap-${p.gap} cp-al-${p.align}" style="--cp-cols:${cols}">${p.children.map((ch, i) => piece(ch, `${path}.children.${i}`)).join('')}</div>`;
        }
        case 'box':
          // a box wears the page's own grounds (tone-alt, tone-accent, tone-invert): their words, lines and buttons
          // already read on them
          return `<div class="cp-box ${p.tone === 'base' ? 'cp-tone-base' : `tone-${p.tone}`} cp-pad-${p.pad}">${p.children.map((ch, i) => piece(ch, `${path}.children.${i}`)).join('')}</div>`;
        case 'text': {
          const a = attr(s.id, `${path}.text`);
          const set = `${p.size ? ` cp-sz-${p.size}` : ''}${p.align ? ` cp-ta-${p.align}` : ''}`;
          // the page's opening (no hero before it): its title is the page's h1
          // set on strips of the ground: the words ride above every strip, so a strip never clips the line before it
          const ink = p.over === 'lines' ? `<span class="cp-ink">${t(p.text)}</span>` : t(p.text);
          if (p.role === 'title') return x.first || x.lead ? `<h1 class="h-hero cp-title${set}" ${a}>${ink}</h1>` : `<h2 class="h-section cp-title${set}" ${a}>${ink}</h2>`;
          if (p.role === 'heading') return `<h3 class="h-item cp-heading${set}" ${a}>${t(p.text)}</h3>`;
          if (p.role === 'eyebrow') return `<p class="eyebrow" ${a}>${t(p.text)}</p>`;
          if (p.role === 'lead') return `<p class="body-lg cp-lead${set}" ${a}>${t(p.text)}</p>`;
          if (p.role === 'caption') return `<p class="small cp-caption" ${a}>${t(p.text)}</p>`;
          if (p.role === 'quote') return `<blockquote class="cp-quote${set}" ${a}><p>${t(p.text)}</p></blockquote>`;
          return `<p class="cp-body${set}" ${a}>${t(p.text)}</p>`;
        }
        case 'figure':
          return `<div class="cp-figure"><span class="cp-fig-v" ${attr(s.id, `${path}.value`)}>${t(p.value)}</span>${p.label ? `<span class="cp-fig-l" ${attr(s.id, `${path}.label`)}>${t(p.label)}</span>` : ''}</div>`;
        case 'image':
          return x.im.has(s, p.at) ? `<figure class="cp-img cp-r-${p.ratio.replace(':', 'x')}${p.fill ? ' cp-fill' : ''}">${x.im.img(s, p.at, 'cp-im', !!(x.first || x.lead))}${x.im.cap(s, p.at)}</figure>` : '';
        case 'button':
          return p.style === 'link' ? `<a class="cp-link" href="#" ${attr(s.id, `${path}.label`)}>${t(p.label)}</a>` : btn(s, `${path}.label`, p.label, p.style);
        case 'list': {
          const tag = p.marker === 'number' ? 'ol' : 'ul';
          return `<${tag} class="cp-list cp-m-${p.marker}">${p.items.map((it, i) => `<li ${attr(s.id, `${path}.items.${i}`)}>${t(it)}</li>`).join('')}</${tag}>`;
        }
        case 'rule':
          return '<hr class="cp-rule">';
        case 'layer': {
          // the first piece is the ground; the rest sit over it, anchored. Over a picture the words are light on a
          // shade (as an opening over a full picture is); over a box they wear the box's own ground
          const ground = p.children[0];
          const onImage = ground.t === 'image' && x.im.has(s, ground.at);
          const g = piece(ground.t === 'image' ? { ...ground, fill: true } : ground, `${path}.children.0`);
          if (!g) return p.children.slice(1).map((ch, i) => piece(ch, `${path}.children.${i + 1}`)).join('');
          return `<div class="cp-layer cp-at-${p.place} cp-inset-${p.inset}${onImage ? ' cp-on-img' : ''}"><div class="cp-ground">${g}${onImage ? '<div class="cp-shade"></div>' : ''}</div>${p.children.slice(1).map((ch, i) => `<div class="cp-over${onImage ? ' scrim' : ''}">${piece(ch, `${path}.children.${i + 1}`)}</div>`).join('')}</div>`;
        }
        case 'field': {
          const how = fieldLayers(p);
          return `<div class="cp-field cp-rows-${p.rows}">${p.children.map((ch, i) => { const k = p.cells[i]; const h = how[i]; return `<div class="cp-cell${h.media ? ' cp-media' : ''}${h.over ? (h.lines ? ' cp-lines' : ' cp-plate') : ''}" style="--c:${k.col};--s:${k.span};--r:${k.row};--rs:${k.rows}">${piece(ch, `${path}.children.${i}`)}</div>`; }).join('')}</div>`;
        }
      }
    };
    const span = c.span === 'wide' || c.span === 'bleed' ? ` cp-span-${c.span}` : '';
    return `<div class="wrap cp${span}${c.tall === 'screen' ? ' cp-tall' : ''}">${piece(c.root as Piece, 'root')}</div>`;
  },
  logos: (s, c) =>
    `<div class="wrap logos">${c.title ? `<p class="eyebrow" ${attr(s.id, 'title')}>${t(c.title)}</p>` : ''}<ul class="names">${(c.names as string[]).map((n, i) => `<li ${attr(s.id, `names.${i}`)}>${t(n)}</li>`).join('')}</ul></div>`,
  pricing: (s, c, x) => {
    const h = head(s, c, x, 'center');
    return `<div class="wrap${h ? ' has-head' : ''}">${h}<div class="plans n-${(c.plans as any[]).length}">${(c.plans as any[])
      .map(
        (p, i) =>
          `<article class="plan${p.featured ? ' is-featured' : ''}"><h3 class="h-item" ${attr(s.id, `plans.${i}.name`)}>${t(p.name)}</h3><p class="price"><span ${attr(s.id, `plans.${i}.price`)}>${t(p.price)}</span>${p.period ? `<span class="muted small" ${attr(s.id, `plans.${i}.period`)}> ${t(p.period)}</span>` : ''}</p>${(p.features as string[]).length ? `<ul class="ticks">${(p.features as string[]).map((f, j) => `<li ${attr(s.id, `plans.${i}.features.${j}`)}>${icon('check')}<span>${t(f)}</span></li>`).join('')}</ul>` : ''}${p.cta ? btn(s, `plans.${i}.cta`, p.cta, p.featured ? 'primary' : 'secondary') : ''}</article>`
      )
      .join('')}</div></div>`;
  },
  list: (s, c, x) => {
    const h = head(s, c, x);
    const named = (c.groups as any[]).map((g) => String(g.title ?? '').trim()).filter(Boolean);
    const filters = named.length >= 3 && named.length === (c.groups as any[]).length ? `<div class="ux-chips" role="group" aria-label="Show" data-ux-filters><button type="button" class="ux-chip" aria-pressed="true" data-ux-filter="">All</button>${named.map((k) => `<button type="button" class="ux-chip" aria-pressed="false" data-ux-filter="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : '';
    return `<div class="wrap${h ? ' has-head' : ''}">${h}${filters}<div class="lists l-${s.variant} n-${Math.min(3, (c.groups as any[]).length)}">${(c.groups as any[])
      .map(
        (g, gi) =>
          `<div class="list-group"${g.title ? ` data-tag="${esc(String(g.title).trim())}"` : ''}>${g.title ? `<h3 class="h-item" ${attr(s.id, `groups.${gi}.title`)}>${t(g.title)}</h3>` : ''}<ul>${(g.items as any[])
            .map(
              (it, ii) =>
                `<li class="list-item"><div class="li-main"><span class="li-name" ${attr(s.id, `groups.${gi}.items.${ii}.name`)}>${t(it.name)}</span>${it.meta ? `<span class="li-meta muted" ${attr(s.id, `groups.${gi}.items.${ii}.meta`)}>${t(it.meta)}</span>` : ''}</div>${it.price ? `<span class="li-price" ${attr(s.id, `groups.${gi}.items.${ii}.price`)}>${t(it.price)}</span>` : ''}${it.text ? `<p class="li-text muted" ${attr(s.id, `groups.${gi}.items.${ii}.text`)}>${t(it.text)}</p>` : ''}</li>`
            )
            .join('')}</ul></div>`
      )
      .join('')}</div></div>`;
  },
  faq: (s, c, x) => {
    const h = head(s, c, x);
    return `<div class="wrap faq fq-${s.variant}${h ? ' has-head' : ''}">${h}<div class="faq-items">${(c.items as any[])
      .map((it, i) => `<details class="qa"${i === 0 ? ' open' : ''}><summary ${attr(s.id, `items.${i}.q`)}>${t(it.q)}</summary><p ${attr(s.id, `items.${i}.a`)}>${t(it.a)}</p></details>`)
      .join('')}</div></div>`;
  },
  cta: (s, c, x) => {
    const { im, look } = x;
    const text = c.text ? `<p class="body-lg" ${attr(s.id, 'text')}>${t(c.text)}</p>` : '';
    if (s.variant === 'statement') {
      const art = shapeArt(look, x.turn + 1);
      return `<div class="wrap cta-statement${art ? ' has-art' : ''}"><div class="cs-main"><h2 class="h-giant" ${attr(s.id, 'title')}>${t(c.title)}</h2><div class="cs-row">${text}${actions(s, c)}</div></div>${art}</div>`;
    }
    const inner = `<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>${text}${actions(s, c)}`;
    if (s.variant === 'image' && im.has(s, 0)) return `<div class="wrap cta-image"><figure class="cta-media">${im.img(s, 0, 'media-img')}${im.cap(s, 0)}</figure><div class="cta-text">${inner}</div></div>`;
    return `<div class="wrap"><div class="cta-box c-${s.variant}">${inner}</div></div>`;
  },
  // THE BOOKING ITSELF: what is booked, its days and times with availability, one confirm action and the
  // confirmation. Real radio inputs, so it is keyboard- and screen-reader-operable before any script; the
  // behaviour runtime (lib/ux-v0/behaviors.ts) adds the state: the chosen day's times, the chosen time
  // summarised, the confirm action enabled, a loading state, and the confirmation. Five compositions.
  booking: (s, c, x) => {
    const sid = s.id;
    const days = (c.days as any[]).slice(0, 14);
    const stOf = (v: unknown): 'open' | 'few' | 'full' => (v === 'full' ? 'full' : v === 'few' ? 'few' : 'open');
    const SAY = { open: 'Available', few: 'Few places left', full: 'Full' } as const;
    const list = s.variant === 'list';
    const openIn = (d: any) => (d.slots as any[]).filter((tm) => stOf(tm.status) !== 'full').length;
    const firstDay = Math.max(0, days.findIndex((d) => openIn(d) > 0));
    const H = x.lead ? 'h1' : 'h2';
    const head = `<div class="bk-head">${secNo(x)}${eyebrow(s, c.eyebrow)}<${H} class="h-section bk-title" ${attr(sid, 'title')}>${t(c.title)}</${H}>${c.intro ? `<p class="lede" ${attr(sid, 'intro')}>${t(c.intro)}</p>` : ''}</div>`;
    const details = (c.details as string[]) ?? [];
    // the summary as a bar: the choice sits with the confirm action, at the end, instead of under the item
    const bar = s.shape?.summary === 'bar' && (SHAPE_EFFECTIVE.booking[s.variant] ?? []).includes('summary');
    const choice = `<p class="bk-choice" data-ux-bind="choice" aria-live="polite">No time chosen yet</p>`;
    const item = `<div class="bk-item"><p class="bk-kicker">Booking</p><p class="bk-item-name" ${attr(sid, 'item')}>${t(c.item)}</p>${details.length ? `<ul class="bk-details">${details.map((d, i) => `<li ${attr(sid, `details.${i}`)}>${t(d)}</li>`).join('')}</ul>` : ''}${bar ? '' : choice}</div>`;
    const dayPicker = list
      ? ''
      : `<fieldset class="bk-days"><legend class="bk-legend">Day</legend><div class="bk-day-row">${days
          .map((d, i) => {
            const n = openIn(d);
            return `<label class="bk-day${n ? '' : ' is-closed'}"><input type="radio" name="${sid}-day" value="${i}"${i === firstDay ? ' checked' : ''}${n ? '' : ' disabled'}><span class="bk-day-label" ${attr(sid, `days.${i}.label`)}>${t(d.label)}</span>${d.date ? `<span class="bk-day-date" ${attr(sid, `days.${i}.date`)}>${t(d.date)}</span>` : ''}<span class="bk-day-count">${n ? `${n} ${n === 1 ? 'time' : 'times'}` : 'Full'}</span></label>`;
          })
          .join('')}</div></fieldset>`;
    const times = days
      .map((d, i) => {
        const slots = (d.slots as any[])
          .map((tm, j) => {
            const st = stOf(tm.status);
            return `<label class="bk-slot is-${st}"><input type="radio" name="${sid}-time" value="${i}:${j}" data-day-label="${plain(d.label)}" data-time="${plain(tm.time)}"${st === 'full' ? ' disabled' : ''}><span class="bk-time" ${attr(sid, `days.${i}.slots.${j}.time`)}>${t(tm.time)}</span><span class="bk-status">${tm.note ? t(tm.note) : SAY[st]}</span></label>`;
          })
          .join('');
        const legend = list ? `<span ${attr(sid, `days.${i}.label`)}>${t(d.label)}</span>${d.date ? ` <span class="bk-day-date">${t(d.date)}</span>` : ''}` : `Times, ${plain(d.label)}`;
        return `<fieldset class="bk-times" data-day="${i}"${!list && i !== firstDay ? ' hidden' : ''}><legend class="bk-legend">${legend}</legend><div class="bk-slot-grid">${slots}</div></fieldset>`;
      })
      .join('');
    const form = `<form class="bk-form" data-ux-booking-form novalidate>${dayPicker}<div class="bk-times-wrap">${times}</div><p class="bk-error" data-ux-error role="alert" hidden>Choose a time first.</p><div class="bk-actions${bar ? ' bk-bar' : ''}">${bar ? choice : ''}<button type="submit" class="btn btn-primary bk-action" data-ux-confirm ${attr(sid, 'action')}>${t(c.action)}</button></div>${c.note ? `<p class="bk-note small muted" ${attr(sid, 'note')}>${t(c.note)}</p>` : ''}</form>`;
    const done = `<div class="bk-done" data-ux-done role="status" tabindex="-1" hidden><p class="bk-done-title" ${attr(sid, 'confirmTitle')}>${t(c.confirmTitle || 'Booked')}</p><p class="bk-done-summary" data-ux-bind="summary"></p>${c.confirmText ? `<p class="bk-done-text" ${attr(sid, 'confirmText')}>${t(c.confirmText)}</p>` : ''}<p class="bk-proto small muted">A prototype: no booking was made.</p><button type="button" class="btn btn-secondary bk-change" data-ux-change>Change the time</button></div>`;
    const media = s.variant === 'immersive' && x.im.has(s, 0) ? `<figure class="bk-media">${x.im.img(s, 0, 'bk-img', true)}${x.im.cap(s, 0)}</figure>` : '';
    const body = `<div class="bk-body">${item}<div class="bk-flow">${form}${done}</div></div>`;
    return `<div class="${x.app ? '' : 'wrap '}bk bk-${s.variant}" data-ux-booking>${media}<div class="bk-panel">${head}${body}</div></div>`;
  },
  // a 3D object drawn in the page by the scene runtime (lib/ux-v0/scene-runtime.ts); its silhouette, drawn here,
  // stands in wherever scripts or WebGL are not (the direction studies, an old browser), so the page is complete
  scene: (s, c, x) => {
    const model = (SCENE_MODELS as readonly string[]).includes(c.model) ? (c.model as string) : 'vessel';
    const material = (SCENE_MATERIALS as readonly string[]).includes(c.material) ? (c.material as string) : 'satin';
    const color = typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color.trim()) ? c.color.trim() : '';
    const h = x.lead ? 'h1' : 'h2';
    const text = `<div class="sc-text">${eyebrow(s, c.eyebrow)}<${h} class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</${h}>${c.text ? `<p class="body-lg" ${attr(s.id, 'text')}>${t(c.text)}</p>` : ''}${c.action ? `<div class="actions">${btn(s, 'action', c.action, 'primary')}</div>` : ''}</div>`;
    const said = `${plain(String(c.title ?? ''))}: a ${model} in ${material}, shown in three dimensions. Drag it, or use the arrow keys, to turn it.`;
    const figure = `<figure class="sc-fig"><div class="scene" data-ux-scene data-model="${model}" data-material="${material}"${color ? ` data-color="${color}"` : ''} role="img" aria-label="${esc(said)}" tabindex="0"${color ? ` style="--scene:${color}"` : ''}><canvas class="sc-canvas"></canvas>${scenePoster(model)}</div>${c.caption ? `<figcaption class="small muted fig-cap" ${attr(s.id, 'caption')}>${t(c.caption)}</figcaption>` : ''}</figure>`;
    return `<div class="wrap sc sc-${s.variant}">${s.variant === 'stage' ? figure + text : text + figure}</div>`;
  },
  configurator: (s, c, x) => {
    const h = head(s, c, x);
    const num = (v: unknown) => {
      const m = String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
      const n = parseFloat(m);
      return Number.isFinite(n) ? n : 0;
    };
    const cur = (String(c.base ?? '').match(/[^\d\s.,-]+/) ?? [String((c.groups as any[]).flatMap((g) => g.options).find((o: any) => o.price)?.price ?? '').match(/[^\d\s.,+-]+/)?.[0] ?? ''])[0];
    const swatch = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : '');
    const groups = (c.groups as any[])
      .map(
        (g, gi) =>
          `<fieldset class="cfg-group"><legend class="cfg-legend" ${attr(s.id, `groups.${gi}.name`)}>${t(g.name)}</legend><div class="cfg-opts">${(g.options as any[])
            .map((o, oi) => {
              const sw = swatch(o.swatch);
              return `<label class="cfg-opt"><input type="radio" name="${esc(s.id)}-g${gi}" value="${oi}" data-price="${num(o.price)}" data-label="${esc(String(o.label))}"${sw ? ` data-swatch="${sw}"` : ''}${oi === 0 ? ' checked' : ''}><span class="cfg-o-l">${sw ? `<i class="cfg-dot" style="background:${sw}" aria-hidden="true"></i>` : ''}<span ${attr(s.id, `groups.${gi}.options.${oi}.label`)}>${t(o.label)}</span></span>${o.price ? `<span class="cfg-o-p" ${attr(s.id, `groups.${gi}.options.${oi}.price`)}>${t(o.price)}</span>` : ''}</label>`;
            })
            .join('')}</div></fieldset>`
      )
      .join('');
    const first = (c.groups as any[]).map((g) => g.options[0]);
    const total = num(c.base) + first.reduce((a, o) => a + num(o.price), 0);
    const firstSwatch = first.map((o) => swatch(o.swatch)).find(Boolean) ?? '';
    const media = x.im.has(s, 0) ? x.im.img(s, 0, 'cfg-img') : `<div class="cfg-swatch" aria-hidden="true"></div>`;
    return `<div class="wrap${h ? ' has-head' : ''}">${h}<div class="cfg cfg-${s.variant}" data-ux-config${firstSwatch ? ` style="--cfg:${firstSwatch}"` : ''}><div class="cfg-preview">${media}</div><form class="cfg-form" data-ux-config-form novalidate>${groups}<div class="cfg-sum" role="status" aria-live="polite"><span class="cfg-choice" data-ux-config-choice>${esc(first.map((o) => String(o.label)).join(' · '))}</span><b class="cfg-total" data-ux-config-total data-base="${num(c.base)}" data-cur="${esc(cur)}">${esc(cur)}${total.toLocaleString('en-GB')}</b></div><div class="actions"><button type="submit" class="btn btn-primary" data-ux-config-go ${attr(s.id, 'action')}>${t(c.action)}</button></div><p class="small cfg-done" data-ux-config-done hidden tabindex="-1">A prototype: nothing was ordered. Your choice: <span data-ux-config-said></span>.</p>${c.note ? `<p class="small muted" ${attr(s.id, 'note')}>${t(c.note)}</p>` : ''}</form></div></div>`;
  },
  form: (s, c, x) => {
    const fields = (c.fields as any[])
      .map((f, i) => {
        const id = `${s.id}-f${i}`;
        const req = f.required ? ' required' : '';
        const label = `<label for="${id}" ${attr(s.id, `fields.${i}.label`)}>${t(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>`;
        const ph = f.placeholder ? ` placeholder="${plain(f.placeholder)}"` : '';
        if (f.type === 'checkbox') return `<div class="field is-check"><input id="${id}" type="checkbox"${req}>${label}</div>`;
        if (f.type === 'textarea') return `<div class="field">${label}<textarea id="${id}" rows="4"${ph}${req}></textarea></div>`;
        if (f.type === 'select') return `<div class="field">${label}<select id="${id}"${req}>${((f.options as string[]).length ? (f.options as string[]) : ['Choose one']).map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>`;
        return `<div class="field">${label}<input id="${id}" type="${esc(f.type || 'text')}"${ph}${req}></div>`;
      })
      .join('');
    const form = `<form class="form" action="#" method="post" data-ux-form novalidate><div class="fields">${fields}</div><button type="submit" class="btn btn-primary" ${attr(s.id, 'submit')}>${t(c.submit)}</button>${c.note ? `<p class="small muted" ${attr(s.id, 'note')}>${t(c.note)}</p>` : ''}<p class="fm-done" data-ux-done role="status" tabindex="-1" hidden>Sent. <span class="muted">A prototype: nothing was sent.</span></p></form>`;
    return `<div class="wrap form-wrap fm-${s.variant}"><div class="form-head">${secNo(x)}<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>${c.intro ? `<p class="body-lg" ${attr(s.id, 'intro')}>${t(c.intro)}</p>` : ''}</div>${form}</div>`;
  },
  text: (s, c, x) =>
    `<div class="wrap text-block tb-${s.variant}"><div class="tb-head">${secNo(x)}${eyebrow(s, c.eyebrow)}${c.title ? `<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}</div><div class="tb-body">${(c.paragraphs as string[]).map((p, i) => `<p ${attr(s.id, `paragraphs.${i}`)}${i === 0 && s.variant === 'lead' ? ' class="lead-p"' : ''}>${t(p)}</p>`).join('')}</div></div>`,
  footer: (s, c) =>
    `<footer class="wrap foot">${`<div class="foot-brand"><p class="brand" ${attr(s.id, 'brand')}>${t(c.brand)}</p>${c.tagline ? `<p class="muted" ${attr(s.id, 'tagline')}>${t(c.tagline)}</p>` : ''}</div>`}${(c.columns as any[]).length ? `<div class="foot-cols">${(c.columns as any[])
      .map(
        (col, i) =>
          `<div>${col.title ? `<p class="foot-title" ${attr(s.id, `columns.${i}.title`)}>${t(col.title)}</p>` : ''}<ul>${(col.links as string[]).map((l, j) => `<li><a href="#" ${attr(s.id, `columns.${i}.links.${j}`)}>${t(l)}</a></li>`).join('')}</ul></div>`
      )
      .join('')}</div>` : ''}${c.legal ? `<p class="legal small muted" ${attr(s.id, 'legal')}>${t(c.legal)}</p>` : ''}<!--credits--></footer>`,
  'app-nav': (s, c) =>
    `<div class="appnav an-${s.variant}"><p class="brand" ${attr(s.id, 'brand')}>${t(c.brand)}</p><nav aria-label="App"><ul>${(c.items as string[])
      .map((it, i) => `<li><a href="#"${it === c.active || (!c.active && i === 0) ? ' aria-current="page"' : ''} ${attr(s.id, `items.${i}`)}>${icon(['home', 'chart', 'users', 'calendar', 'layers', 'book', 'compass'][i % 7])}<span>${t(it)}</span></a></li>`)
      .join('')}</ul></nav>${c.user ? `<p class="an-user muted small" ${attr(s.id, 'user')}>${t(c.user)}</p>` : ''}</div>`,
  'app-header': (s, c) =>
    `<div class="apphead"><div><h1 class="h-app" ${attr(s.id, 'title')}>${t(c.title)}</h1>${c.subtitle ? `<p class="muted" ${attr(s.id, 'subtitle')}>${t(c.subtitle)}</p>` : ''}</div><div class="apphead-acts">${c.search ? `<label class="search"><span class="vh">Search</span>${icon('search')}<input type="search" placeholder="Search"></label>` : ''}${(c.actions as string[]).map((a, i) => btn(s, `actions.${i}`, a, i === 0 ? 'primary' : 'secondary')).join('')}</div></div>`,
  'stat-cards': (s, c) =>
    `<div class="cards-row">${(c.items as any[])
      .map(
        (it, i) =>
          `<div class="card stat-card"><p class="muted small" ${attr(s.id, `items.${i}.label`)}>${t(it.label)}</p><p class="stat-value" ${attr(s.id, `items.${i}.value`)}>${t(it.value)}</p>${it.delta ? `<p class="delta d-${it.trend || 'flat'}" ${attr(s.id, `items.${i}.delta`)}>${it.trend === 'down' ? '↓' : it.trend === 'up' ? '↑' : '→'} ${t(it.delta)}</p>` : ''}</div>`
      )
      .join('')}</div>`,
  chart: (s, c) => `<div class="card chart-card"><h2 class="h-card" ${attr(s.id, 'title')}>${t(c.title)}</h2>${chartSvg(s, c)}${c.note ? `<p class="small muted" ${attr(s.id, 'note')}>${t(c.note)}</p>` : ''}</div>`,
  table: (s, c) => {
    const cols = c.columns as string[];
    const rows = c.rows as any[];
    const hasStatus = rows.some((r) => r.status);
    // a column already called "Status" holds the status; otherwise the status gets a column of its own
    const statusCol = hasStatus ? cols.findIndex((h) => /^\s*status\s*$/i.test(String(h))) : -1;
    const extra = hasStatus && statusCol < 0;
    const pill = (r: any, i: number) => (r.status ? `<span class="status" ${attr(s.id, `rows.${i}.status`)}><span class="dot" aria-hidden="true"></span>${t(r.status)}</span>` : '');
    const find = rows.length >= 6 ? `<input class="ux-find" type="search" placeholder="Filter the rows" aria-label="Filter the rows of ${plain(String(c.title || 'the table'))}" data-ux-table-filter>` : '';
    return `<div class="card table-card">${c.title ? `<h2 class="h-card" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}${find}<div class="table-scroll"><table><thead><tr>${cols.map((h, i) => `<th scope="col" ${attr(s.id, `columns.${i}`)}>${t(h)}</th>`).join('')}${extra ? '<th scope="col">Status</th>' : ''}</tr></thead><tbody>${rows
      .map(
        (r, i) =>
          `<tr>${cols
            .map((_, j) => {
              const cell = (r.cells as string[])[j] ?? '';
              return j === statusCol && !String(cell).trim() ? `<td>${pill(r, i)}</td>` : `<td ${attr(s.id, `rows.${i}.cells.${j}`)}>${t(cell)}</td>`;
            })
            .join('')}${extra ? `<td>${pill(r, i)}</td>` : ''}</tr>`
      )
      .join('')}</tbody></table></div></div>`;
  },
  feed: (s, c) =>
    `<div class="card feed-card">${c.title ? `<h2 class="h-card" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}<ol class="feed">${(c.items as any[])
      .map((it, i) => `<li><p class="feed-title" ${attr(s.id, `items.${i}.title`)}>${t(it.title)}</p>${it.meta ? `<p class="small muted" ${attr(s.id, `items.${i}.meta`)}>${t(it.meta)}</p>` : ''}${it.text ? `<p class="small" ${attr(s.id, `items.${i}.text`)}>${t(it.text)}</p>` : ''}</li>`)
      .join('')}</ol></div>`,
};

function chartSvg(s: Section, c: Record<string, any>): string {
  const labels = c.labels as string[];
  const series = (c.series as any[]).map((x) => ({ name: x.name as string, values: (x.values as number[]).slice(0, labels.length) }));
  const W = 640;
  const H = 240;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const all = series.flatMap((x) => x.values);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const n = Math.max(2, labels.length);
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / (n - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / span);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = min + span * f;
      return `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${pad.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(Math.round(v))}</text>`;
    })
    .join('');
  const xl = labels.map((l, i) => `<text class="axis" x="${(s.variant === 'bar' ? pad.l + ((W - pad.l - pad.r) * (i + 0.5)) / labels.length : x(i)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`).join('');
  let marks = '';
  if (s.variant === 'bar') {
    const groupW = (W - pad.l - pad.r) / labels.length;
    const barW = Math.max(4, (groupW * 0.64) / series.length);
    marks = series
      .map((se, k) =>
        se.values
          .map((v, i) => {
            const bx = pad.l + groupW * i + groupW * 0.18 + barW * k;
            // each bar says its value where a pointer or a screen reader rests on it
            return `<rect class="bar s${k}" x="${bx.toFixed(1)}" y="${y(Math.max(0, v)).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.abs(y(v) - y(0)).toFixed(1)}" rx="2"><title>${esc(`${se.name}, ${labels[i]}: ${v}`)}</title></rect>`;
          })
          .join('')
      )
      .join('');
  } else {
    // the first series is the subject: only it is filled, and it is drawn last, on top; the others are
    // comparisons, drawn as dashed lines beneath it (two overlapping fills read as one muddy shape)
    marks = series
      .map((se, k) => {
        const pts = se.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        const area = s.variant === 'area' && k === 0 ? `<polygon class="area s${k}" points="${x(0).toFixed(1)},${y(min).toFixed(1)} ${pts} ${x(se.values.length - 1).toFixed(1)},${y(min).toFixed(1)}"/>` : '';
        // each reading is a point that says its value where a pointer rests on it
        const dots = se.values.length <= 24 ? se.values.map((v, i) => `<circle class="pt s${k}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5"><title>${esc(`${se.name}, ${labels[i]}: ${v}`)}</title></circle>`).join('') : '';
        return `<g class="series s${k}">${area}<polyline class="line s${k}${k > 0 ? ' cmp' : ''}" points="${pts}"/>${dots}</g>`;
      })
      .reverse()
      .join('');
  }
  const summary = series.map((se) => `${se.name}: ${se.values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`).join('; ');
  // the key draws each series as it is drawn: a swatch for the filled subject, a dashed line for a comparison
  // …and, with more than one series, each can be shown or hidden (the behaviour runtime)
  const legend = series.length > 1 ? `<ul class="legend" data-ux-legend>${series.map((se, k) => `<li><button type="button" class="lg-btn" aria-pressed="true" data-ux-series="${k}"><span class="key s${k}${k > 0 && s.variant !== 'bar' ? ' key-line' : ''}" aria-hidden="true"></span>${esc(se.name)}</button></li>`).join('')}</ul>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${plain(`${c.title}. ${summary}`)}" ${attr(s.id, 'series')}>${grid}${marks}${xl}</svg>${legend}`;
}

// ── a part set apart at a width (lib/ux-v0/spec.ts Responsive) ─────────
// One class per rule on the section ("rs-m-hide", "rs-t-center"…), and the rules written once each, only for what
// the page uses, at the end of the stylesheet so they are the last word at their width. Names, never values,
// reach the CSS: a rule is one of a fixed few.

const BP_SHORT = { tablet: 't', mobile: 'm' } as const;
const RS_MEDIA = '.split-media,.hero-media,.hp-media,.cta-media,.cfg-preview,.sc-fig,.bk-media,.q-portrait';
const RS_TEXT = 'h1,h2,h3,h4,p,blockquote,figcaption,.eyebrow,.sec-no';

function responsiveClasses(s: Section): string {
  const r = s.responsive;
  if (!r) return '';
  const out: string[] = [];
  for (const bp of BREAKPOINTS) {
    const x = r[bp];
    if (!x) continue;
    const b = BP_SHORT[bp];
    if (x.hide) out.push(`rs-${b}-hide`);
    if (x.align) out.push(`rs-${b}-${x.align}`);
    if (x.pad) out.push(`rs-${b}-pad-${x.pad}`);
    if (x.media) out.push(`rs-${b}-media-${x.media}`);
    if (x.type) out.push(`rs-${b}-type-${x.type}`);
    if (x.crop) out.push(`rs-${b}-crop-${x.crop}`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

export function responsiveCss(sections: readonly Section[]): string {
  const used = new Set(sections.flatMap((s) => responsiveClasses(s).trim().split(' ').filter(Boolean)));
  if (!used.size) return '';
  const out: string[] = [];
  for (const bp of BREAKPOINTS) {
    const b = BP_SHORT[bp];
    const rules: string[] = [];
    const has = (c: string) => used.has(`rs-${b}-${c}`);
    if (has('hide')) rules.push(`.sx.rs-${b}-hide{display:none!important}`);
    if (has('center')) rules.push(`.sx.rs-${b}-center,.sx.rs-${b}-center :is(${RS_TEXT}){text-align:center}.sx.rs-${b}-center :is(${RS_TEXT}){margin-inline:auto}.sx.rs-${b}-center :is(.actions,.ticks,.ux-chips,.legend){justify-content:center}.sx.rs-${b}-center :is(.hero-text,.split-text,.sc-text,.cta-text){align-items:center}`);
    if (has('start')) rules.push(`.sx.rs-${b}-start,.sx.rs-${b}-start :is(${RS_TEXT}){text-align:start}.sx.rs-${b}-start :is(${RS_TEXT}){margin-inline:0}.sx.rs-${b}-start :is(.actions,.ticks,.ux-chips,.legend){justify-content:flex-start}.sx.rs-${b}-start :is(.hero-text,.split-text,.sc-text,.cta-text){align-items:flex-start}`);
    if (has('pad-s')) rules.push(`.sx.rs-${b}-pad-s{padding-block:calc(var(--space) * .55)}`);
    if (has('pad-m')) rules.push(`.sx.rs-${b}-pad-m{padding-block:var(--space)}`);
    if (has('pad-l')) rules.push(`.sx.rs-${b}-pad-l{padding-block:calc(var(--space) * 1.25)}`);
    if (has('media-first')) rules.push(`.sx.rs-${b}-media-first :is(${RS_MEDIA}){order:-1}`);
    if (has('media-last')) rules.push(`.sx.rs-${b}-media-last :is(${RS_MEDIA}){order:9}`);
    if (has('type-s')) rules.push(`.sx.rs-${b}-type-s .h-hero{font-size:calc(min(var(--fs-hero),var(--fit-hero,999px)) * .82)}.sx.rs-${b}-type-s .h-section{font-size:calc(min(var(--fs-h2),var(--fit-h2,999px)) * .85)}`);
    if (has('type-l')) rules.push(`.sx.rs-${b}-type-l .h-hero{font-size:calc(min(var(--fs-hero),var(--fit-hero,999px)) * 1.12)}.sx.rs-${b}-type-l .h-section{font-size:calc(min(var(--fs-h2),var(--fit-h2,999px)) * 1.12)}`);
    // its pictures cropped for this width (their focal point keeps the subject in view)
    for (const [c, ratio] of [['wide', '16/9'], ['square', '1/1'], ['tall', '3/4']] as const) if (has(`crop-${c}`)) rules.push(`.sx.rs-${b}-crop-${c} figure img,.sx.rs-${b}-crop-${c} .bleed-img{aspect-ratio:${ratio};height:auto;min-height:0;object-fit:cover}`);
    if (rules.length) out.push(`@media ${BREAKPOINT_QUERY[bp]}{${rules.join('')}}`);
  }
  return out.join('\n');
}

// ── the stylesheet ───────────────────────────────────────────────────

const px = (v: number) => `${Math.round(v * 10) / 10}px`;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** a size that grows with the viewport to `max` at 1320px wide, never under `min` */
const fluid = (min: number, max: number) => (max <= min ? px(max) : `clamp(${px(min)}, ${((max / 1320) * 100).toFixed(2)}vw, ${px(max)})`);

/** The two-colour filter a duotone look prints photographs through. */
function duotoneFilter(dark: string, light: string): string {
  const [r1, g1, b1] = rgbOf(dark).map((v) => (v / 255).toFixed(3));
  const [r2, g2, b2] = rgbOf(light).map((v) => (v / 255).toFixed(3));
  return `<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute"><filter id="ux-duo" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${r1} ${r2}"/><feFuncG type="table" tableValues="${g1} ${g2}"/><feFuncB type="table" tableValues="${b1} ${b2}"/></feComponentTransfer></filter></svg>`;
}

/** The headlines a design sets, by size: their longest words decide how large each size may be. */
interface Headlines {
  hero: readonly string[];
  section: readonly string[];
  giant: readonly string[];
}
const NO_HEADLINES: Headlines = { hero: [], section: [], giant: [] };
const longestWord = (text: unknown) => Math.max(0, ...String(text ?? '').replace(/<[^>]+>/g, '').replace(/[*_~`]/g, '').split(/\s+/).map((w) => [...w].length));

/** The headlines of a spec, sorted into the three sizes they are set at. */
function headlinesOf(spec: DesignSpec): Headlines {
  const hero: string[] = [];
  const section: string[] = [];
  const giant: string[] = [];
  for (const s of spec.sections) {
    const title = (s.content as Record<string, unknown>)?.title;
    if (typeof title !== 'string' || !title) continue;
    if (s.kind === 'hero') hero.push(title);
    else if (s.kind === 'cta' && s.variant === 'statement') giant.push(title);
    else if (!/^(nav|footer|app-|stat-cards|chart|table|feed)/.test(s.kind)) section.push(title);
  }
  return { hero, section, giant };
}

function css(tk: DesignTokens, look: Look, heads: Headlines = NO_HEADLINES): string {
  const c = tk.colors;
  const g = grounds(c, look.accent2);
  const dark = isDark(c.background);
  const L = look;
  const corner = tk.radius === 'none' ? 0 : tk.radius === 'round' ? 20 : 8;
  const btnR = L.buttons === 'pill' || (L.buttons === 'solid' && tk.radius === 'round') ? '999px' : L.buttons === 'block' || L.buttons === 'offset' ? '0px' : `${Math.min(corner, 10)}px`;
  const base = tk.scale === 'compact' ? 16 : tk.scale === 'spacious' ? 18 : 17;
  const R = L.ratio;
  const step = (n: number) => base * Math.pow(R, n);
  const poster = L.grid === 'poster';
  const upper = L.case === 'upper';
  const displayKind = knownFont(tk.fonts.display)?.kind ?? 'serif';
  const condensed = /Anton|Big Shoulders|Instrument Serif/.test(tk.fonts.display);
  const wideFace = /Unbounded|Syne|Archivo|Sora/.test(tk.fonts.display) && upper;
  const fit = wideFace ? 0.78 : condensed ? 1.12 : 1;
  const heroMax = clampN(step(poster ? 6 : 5) * fit, 44, poster ? 176 : 128);
  const heroMin = clampN(heroMax * 0.4, 38, poster ? 54 : 50);
  const h2Max = clampN(step(poster ? 3.6 : 3) * fit, 28, poster ? 92 : 72);
  const h2Min = clampN(h2Max * 0.6, 26, 42);
  const giantMax = clampN(step(4.4) * fit, 52, 150);
  const h3 = clampN(step(1.15), 19, 30);
  const lede = clampN(step(0.5), 18, 23);
  const weight = nearestWeight(tk.fonts.display, L.weight);
  const itemWeight = nearestWeight(tk.fonts.display, Math.min(L.weight, displayKind === 'serif' ? 600 : 700));
  // the size at which a headline's longest word still fits: capitals of a wide face at poster scale can be
  // wider than a phone, and a word must never break in the middle. Measured advances (lib/ux-v0/fonts.ts),
  // a margin for the widest letters, and the page's 40px of gutters.
  const perChar = advanceEm(tk.fonts.display, weight, upper);
  const wordEms = (titles: readonly string[], tr: number) => {
    const n = Math.max(0, ...titles.map(longestWord));
    return n ? n * (perChar + tr) * 1.1 : 0;
  };
  const heavy = weight >= 700;
  const track =
    L.tracking === 'tight' ? (upper ? -0.01 : heavy ? -0.035 : -0.025) : L.tracking === 'wide' ? (upper ? 0.06 : 0.015) : upper ? 0.02 : -0.01;
  const trackH2 = L.tracking === 'tight' ? (upper ? 0 : -0.018) : L.tracking === 'wide' ? (upper ? 0.05 : 0.01) : upper ? 0.02 : -0.005;
  const lhHero = upper ? 0.94 : R >= 1.5 ? 0.98 : R >= 1.4 ? 1.02 : displayKind === 'serif' ? 1.06 : 1.04;
  const filter =
    tk.imageTreatment === 'muted' ? 'saturate(.7) contrast(.96)' : tk.imageTreatment === 'warm' ? 'sepia(.16) saturate(1.08)' : tk.imageTreatment === 'mono' ? 'grayscale(1) contrast(1.05)' : tk.imageTreatment === 'contrast' ? 'grayscale(1) contrast(1.35) brightness(.96)' : tk.imageTreatment === 'duotone' ? 'url(#ux-duo)' : 'none';
  const space = tk.scale === 'compact' ? 'clamp(44px, 6vw, 72px)' : tk.scale === 'spacious' ? 'clamp(72px, 11vw, 160px)' : 'clamp(56px, 8.5vw, 116px)';
  const wrap = L.width === 'narrow' ? 1000 : L.width === 'wide' ? 1320 : 1200;
  const ruleW = L.rules === 'heavy' ? '3px' : L.rules === 'none' ? '0px' : '1px';
  const ruleC = L.rules === 'heavy' ? 'var(--text)' : 'var(--line)';
  const emItalic = L.emphasis === 'italic' && hasItalic(tk.fonts.display);
  const labelFont = L.label === 'mono' ? fontStack(L.mono) : 'var(--body)';
  const out: string[] = [];
  const add = (s: string) => out.push(s);
  // a spec from before looks keeps the sizes it was drawn with
  const classic = L.language === 'classic';
  const heroSize = classic ? (tk.scale === 'compact' ? 'clamp(2.3rem, 4.8vw, 3.8rem)' : tk.scale === 'spacious' ? 'clamp(2.8rem, 7.4vw, 6.4rem)' : 'clamp(2.5rem, 6vw, 5rem)') : fluid(heroMin, heroMax);
  const h2Size = classic ? (tk.scale === 'compact' ? 'clamp(1.6rem, 2.8vw, 2.3rem)' : 'clamp(1.8rem, 3.6vw, 3rem)') : fluid(h2Min, h2Max);

  const fitHero = wordEms(heads.hero, track);
  const fitH2 = wordEms(heads.section, trackH2);
  const fitGiant = wordEms(heads.giant, track);
  const fitVars = [
    fitHero ? `--fit-hero:calc((100vw - 40px) / ${fitHero.toFixed(2)})` : '',
    fitH2 ? `--fit-h2:calc((100vw - 40px) / ${fitH2.toFixed(2)});--fit-h2-col:calc((min(var(--wrap), 100vw - 40px) - clamp(32px, 5vw, 88px)) / 3 / ${fitH2.toFixed(2)})` : '',
    fitGiant ? `--fit-giant:calc((100vw - 40px) / ${fitGiant.toFixed(2)})` : '',
  ].filter(Boolean).map((v) => `${v};`).join('');

  // ── tokens
  add(`:root{${groundVars(g.base)};--accent:${c.accent};--accent2:${L.accent2 || c.accent};--on-accent:${c.accentText};
--display:${fontStack(tk.fonts.display)};--body:${fontStack(tk.fonts.body)};--mono:${fontStack(L.mono)};--label-font:${labelFont};
--r:${corner}px;--btn-r:${btnR};--space:${space};--wrap:${wrap}px;--rule-w:${ruleW};--rule-c:${ruleC};
--fs:${classic ? 17 : base}px;--fs-lede:${classic ? '1.15rem' : px(lede)};--fs-h3:${classic ? '1.25rem' : px(h3)};--fs-h2:${h2Size};--fs-hero:${heroSize};--fs-giant:${fluid(clampN(giantMax * 0.4, 40, 56), giantMax)};${fitVars}
--hw:${weight};--iw:${classic ? weight : itemWeight};--track:${classic ? -0.025 : track}em;--track-h2:${classic ? -0.018 : trackH2}em;--lh-hero:${classic ? 1.02 : lhHero};--img:${filter};color-scheme:${dark ? 'dark' : 'light'}}`);
  for (const [name, gr] of Object.entries(g)) if (name !== 'base') add(`.tone-${name}{${groundVars(gr)};background:var(--bg);color:var(--text)}`);
  // a composed box on the page's own ground, wherever it sits
  add(`.cp-tone-base{${groundVars(g.base)};background:var(--bg);color:var(--text)}`);

  // ── base
  add(`*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.app.nav-none main{width:min(100%,1200px);margin-inline:auto}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);font-size:var(--fs);line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-kerning:normal}
img{display:block;max-width:100%}
figure{margin:0}
a{color:inherit}
:focus-visible{outline:2px solid var(--accent-ink);outline-offset:3px}
.wrap{width:min(var(--wrap),100% - 40px);margin-inline:auto}
.sx{padding-block:var(--space)}
.sx.pad-s{padding-block:calc(var(--space) * .55)}.sx.pad-l{padding-block:calc(var(--space) * 1.25)}
.sx-nav{padding-block:18px!important}
.sx-footer{padding-block:56px 40px!important;border-top:1px solid var(--line)}
.ph{text-decoration:underline dotted;text-underline-offset:3px;color:var(--muted)}
.muted{color:var(--muted)}.small{font-size:.875rem;line-height:1.5}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.defs{position:absolute;width:0;height:0;overflow:hidden}`);

  // ── type
  add(`.h-hero,.h-section,.h-item,.h-app,.h-card,.h-giant,.brand,.price,.stat dd,.stat-value,blockquote,.lead-p{font-family:var(--display)}
.h-hero,.h-section,.h-giant,.stat dd,.price,blockquote{font-weight:var(--hw)}
.h-item,.h-card,.h-app,.brand{font-weight:var(--iw)}
.h-hero{margin:0;font-size:min(var(--fs-hero),var(--fit-hero,999px));line-height:var(--lh-hero);letter-spacing:var(--track);text-wrap:balance;overflow-wrap:break-word;hyphens:manual}
.h-section{margin:0 0 16px;font-size:min(var(--fs-h2),var(--fit-h2,999px));line-height:1.08;letter-spacing:var(--track-h2);text-wrap:balance;overflow-wrap:break-word}
.h-giant{margin:0;font-size:min(var(--fs-giant),var(--fit-giant,999px));line-height:${upper ? 0.95 : 1.02};letter-spacing:var(--track);text-wrap:balance;overflow-wrap:break-word}
.h-item{margin:0 0 8px;font-size:var(--fs-h3);line-height:1.22;letter-spacing:${upper ? '0.01em' : '-0.005em'}}
.lede,.body-lg,.hero-sub{font-size:var(--fs-lede);line-height:1.55;color:var(--muted);max-width:60ch}
.hero-sub{margin:24px 0 0}
p{max-width:68ch}
.em{font-style:${emItalic ? 'italic' : 'normal'}}`);
  if (upper) add(`.h-hero,.h-section,.h-giant,.h-item{text-transform:uppercase}`);
  if (L.emphasis === 'accent' || (L.emphasis === 'italic' && !emItalic)) add(`.em{color:var(--accent-ink)}`);
  if (L.emphasis === 'underline') add(`.em{text-decoration:underline;text-decoration-color:var(--accent-ink);text-decoration-thickness:.08em;text-underline-offset:.12em}`);
  if (L.emphasis === 'highlight') add(`.em{background:color-mix(in srgb,var(--accent) 32%,transparent);padding:0 .1em;-webkit-box-decoration-break:clone;box-decoration-break:clone}`);

  // ── labels
  const label =
    L.label === 'caps'
      ? 'font-size:.74rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)'
      : L.label === 'mono'
        ? 'font-size:.8rem;font-weight:500;letter-spacing:.02em;color:var(--muted)'
        : L.label === 'rule'
          ? 'font-size:.92rem;font-weight:500;color:var(--text);display:flex;align-items:center;gap:12px'
          : L.label === 'sentence'
            ? 'font-size:.98rem;font-weight:500;color:var(--accent-ink)'
            : 'font-size:.92rem;font-weight:400;color:var(--muted)';
  add(`.eyebrow,.sec-no,.fig-cap,.foot-title{font-family:var(--label-font)}
.eyebrow{margin:0 0 16px;${label}}
.fig-cap{margin-top:10px;font-size:.8rem;color:var(--muted);line-height:1.4}.fig-no{color:var(--text);font-weight:600;margin-right:6px}
.sec-no{display:block;margin:0 0 14px;font-size:.82rem;font-weight:600;color:var(--accent-ink);font-variant-numeric:tabular-nums}`);
  if (L.label === 'rule') add(`.eyebrow::before{content:"";width:32px;height:var(--rule-w,1px);min-height:1px;background:currentColor;flex:none}.center .eyebrow,.hero-centered .eyebrow{justify-content:center}`);
  if (L.motifs.includes('big-numerals')) add(`.sec-no{font-family:var(--display);font-weight:var(--hw);font-size:var(--fs-h3);line-height:1;color:var(--accent-ink);margin-bottom:18px}`);

  // ── buttons
  add(`.actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;margin-top:30px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;min-height:48px;padding:0 24px;border-radius:var(--btn-r);font:inherit;font-size:1rem;font-weight:600;text-decoration:none;cursor:pointer;border:1.5px solid transparent;transition:background-color .2s,color .2s,box-shadow .2s,transform .2s;-webkit-tap-highlight-color:transparent}
.btn-primary{background:var(--btn-bg);color:var(--btn-fg)}
.btn-primary:hover{background:color-mix(in srgb,var(--btn-bg) 86%,var(--text))}
.btn-secondary{background:transparent;color:var(--text);border-color:currentColor}`);
  if (L.buttons === 'outline') add(`.btn-primary{background:transparent;color:var(--text);border-color:var(--text)}.btn-primary:hover{background:var(--text);color:var(--bg)}.btn-secondary{border-color:transparent;text-decoration:underline;text-underline-offset:.3em;padding-inline:4px}`);
  if (L.buttons === 'underline')
    add(`.btn{padding:0 2px;border:0;border-radius:0;background:none!important;color:var(--text)!important;text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:.35em;font-weight:500}.btn-primary::after{content:"→";text-decoration:none;display:inline-block;transition:transform .2s}.btn-primary:hover::after{transform:translateX(4px)}.btn-secondary{color:var(--muted)!important}`);
  if (L.buttons === 'block') add(`.btn{min-height:56px;padding:0 30px;font-weight:700;letter-spacing:.01em}.btn-secondary{border-width:2px}`);
  if (L.buttons === 'offset') add(`.btn{border:2px solid var(--text);box-shadow:4px 4px 0 var(--text);font-weight:700}.btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--text)}.btn-secondary{background:var(--surface)}`);

  add(`.ic{width:26px;height:26px;fill:none;stroke:var(--accent-ink);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ticks{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:10px}.ticks li{display:flex;gap:10px;align-items:flex-start}.ticks .ic{width:20px;height:20px;flex:none;margin-top:3px}`);

  // ── nav and footer
  add(`.nav-in{display:flex;align-items:center;gap:28px}.brand{margin:0;font-size:1.4rem;text-decoration:none;letter-spacing:-.01em;line-height:1.1}
.nav-links{display:flex;gap:26px;list-style:none;margin:0 0 0 auto;padding:0}.nav-links a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;text-decoration:none;font-size:.95rem;color:var(--muted)}.nav-links a:hover{color:var(--text)}
.v-centered .nav-in{justify-content:center;flex-wrap:wrap}.v-centered .nav-links{margin:0}.v-minimal .nav-links{display:none}.v-menu .nav-links{display:none}
.nav-menu{display:none;font:inherit;font-weight:600;min-height:44px;padding:0 14px;border:var(--rule-w,1px) solid currentColor;border-radius:var(--r-pill,999px);background:transparent;color:inherit;cursor:pointer;margin-left:auto}
.ux-js .v-menu .nav-menu:not([hidden]){display:inline-flex;align-items:center}.v-menu .nav-in .btn{margin-left:0}
.nav-over{position:fixed;inset:0;z-index:60;background:var(--bg);color:var(--text);display:grid;align-content:center;justify-items:start;gap:clamp(20px,4vh,40px);padding:clamp(24px,8vw,96px);overflow:auto}.nav-over[hidden]{display:none}
.nav-over-links{list-style:none;margin:0;padding:0;display:grid;gap:clamp(6px,1.6vh,18px)}.nav-over-links a{font-family:var(--display);font-size:clamp(2rem,7vw,4.6rem);line-height:1.05;color:inherit;text-decoration:none;display:inline-flex;min-height:48px;align-items:center}.nav-over-links a:hover,.nav-over-links a:focus-visible{text-decoration:underline;text-underline-offset:.12em}
.nav-close{position:absolute;top:clamp(16px,4vw,32px);right:clamp(16px,4vw,32px);font:inherit;font-weight:600;min-height:44px;padding:0 14px;border:var(--rule-w,1px) solid currentColor;border-radius:var(--r-pill,999px);background:transparent;color:inherit;cursor:pointer}
.nav-in .btn{min-height:44px;padding:0 18px;font-size:.92rem}.nav-in .brand{display:inline-flex;align-items:center;min-height:44px;min-width:44px}.v-inline .nav-in .btn,.v-minimal .nav-in .btn{margin-left:auto}.v-inline .nav-links~.btn{margin-left:0}
.foot{display:grid;gap:36px}.foot ul{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:4px}.foot a{display:inline-flex;align-items:center;min-height:44px;min-width:44px;text-decoration:none;color:var(--muted)}@media (min-width:760px){.foot a{min-height:32px}}.foot a:hover{color:var(--text)}
.foot-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.foot-title{margin:0;font-weight:600;font-size:.9rem}.legal{margin:0}
.credits{margin:0;font-size:.78rem;line-height:1.5;color:var(--muted)}.credits a{color:inherit}`);
  if (L.grid === 'swiss' || L.grid === 'poster' || L.language === 'geometric') add(`.foot-brand .brand{font-size:var(--fs-h2);line-height:1;letter-spacing:var(--track-h2)}`);
  if (upper && (L.grid === 'poster' || L.language === 'night')) add(`.brand{text-transform:uppercase;letter-spacing:.02em}`);

  // ── section heads
  add(`.section-head{max-width:760px;margin-bottom:clamp(28px,4vw,52px)}.section-head .lede{margin:0}.section-head.center{margin-inline:auto;text-align:center}.section-head.center .lede{margin-inline:auto}`);

  // ── hero
  add(`.hero-text{max-width:820px}.hero-centered{text-align:center}.hero-centered .hero-text{margin-inline:auto}.hero-centered .hero-sub{margin-inline:auto}.hero-centered .actions{justify-content:center}
.hero-wide{margin-top:clamp(40px,6vw,72px)}.hero-wide .media-img{width:100%;aspect-ratio:16/8;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.hero-editorial .h-hero{max-width:16ch}
.hero-split{display:grid;gap:clamp(28px,5vw,72px);align-items:center}
.hero-media .media-img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.hero-note{margin-top:18px}
.sx-hero.v-full-bleed{padding:0!important}
.hero-bleed{position:relative;overflow:hidden;min-height:min(86vh,820px);display:flex;align-items:flex-end;color:#fff}
.bleed-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:var(--img)}
.bleed-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(0,0,0,.3) 100%)}
.hero-bleed .wrap{position:relative;z-index:1;padding-block:clamp(48px,8vw,96px)}.hero-bleed .wrap::before{content:"";position:absolute;z-index:-1;inset:-140px -100vw 0;background:linear-gradient(180deg,rgba(0,0,0,0) 0,rgba(0,0,0,.58) 140px,rgba(0,0,0,.68) 100%)}/* over the image every word is white */.hero-bleed .wrap{--text:#fff;--muted:#fff;--accent-ink:#fff;--line:rgba(255,255,255,.5);--surface:#141414}.hero-bleed .hero-text :is(.hero-sub,.eyebrow,.muted,.h-hero){color:#fff}.hero-bleed .em{color:inherit}
.hero-statement .hs-top{position:relative}.hero-statement .h-hero{max-width:${upper ? '15ch' : R >= 1.45 ? '16ch' : R >= 1.3 ? '19ch' : '24ch'}}
.hs-foot{display:grid;gap:24px;margin-top:clamp(28px,4vw,48px);padding-top:24px;border-top:var(--rule-w) solid var(--rule-c)}.hs-foot .hero-sub{margin:0}.hs-act .actions{margin-top:0}
.art{width:clamp(120px,22vw,300px);flex:none}.art svg{display:block;width:100%;height:auto}
.hero-statement.has-art .hs-top{display:grid;gap:28px}.hs-words{min-width:0}
.hero-poster .h-poster{max-width:none;font-size:min(var(--fs-hero),var(--fit-hero,999px))}
.hp-row{display:grid;gap:clamp(24px,4vw,56px);margin-top:clamp(28px,4vw,52px);align-items:start}.hp-text .hero-sub{margin-top:0}
.hp-media .media-img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.art-poster{justify-self:end}.art-wide{margin-top:clamp(36px,5vw,64px);width:clamp(140px,30vw,360px)}`);

  // ── features
  add(`.features{list-style:none;margin:0;padding:0;display:grid;gap:clamp(24px,3vw,44px)}
.feature p{margin:0;color:var(--muted)}.feature .ic{margin-bottom:16px}
.f-list .feature{display:grid;grid-template-columns:minmax(0,1fr);column-gap:18px;padding-top:22px;border-top:1px solid var(--line)}.f-list .feature:has(> .ic){grid-template-columns:auto minmax(0,1fr)}.f-list .feature .ic{grid-row:span 2;margin:2px 0 0}
.f-numbered .feature{padding-top:20px;border-top:var(--rule-w) solid var(--rule-c)}
.num{display:block;font-family:var(--display);font-weight:var(--hw);font-size:1.6rem;line-height:1;color:var(--accent-ink);margin-bottom:12px;font-variant-numeric:tabular-nums}
.f-index{gap:0;border-top:var(--rule-w) solid var(--rule-c)}.f-index .feature{display:grid;grid-template-columns:3.2em 1fr;column-gap:20px;padding:22px 0;border-bottom:1px solid var(--line)}.f-index .num{grid-row:span 2;font-size:1.15rem;margin:4px 0 0}.f-index .h-item{margin-bottom:4px}
.f-columns .feature{padding-left:20px;border-left:var(--rule-w) solid var(--rule-c)}`);
  if (L.motifs.includes('big-numerals')) add(`.f-numbered .num{font-size:var(--fs-giant);margin-bottom:18px;letter-spacing:-.03em}`);

  // ── split, gallery, quote, stats, names
  add(`.split{display:grid;gap:clamp(28px,5vw,80px);align-items:center}
.split-media .media-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.split-text .body-lg{margin:0}
.gallery{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.g-item{margin:0}
.g-img{width:100%;height:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.g-strip{grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);grid-template-columns:none;overflow-x:auto}.g-strip .g-img{aspect-ratio:3/4}
@media (max-width:759px){.gallery:not(.g-strip):is(.n-1,.n-3,.n-5,.n-7) .g-item:first-child{grid-column:1/-1}.gallery:not(.g-strip):is(.n-1,.n-3,.n-5,.n-7) .g-item:first-child .g-img{aspect-ratio:3/2}}
.caption{margin-top:14px}
.quote figure{margin:0;max-width:940px}.quote blockquote{margin:0}.quote blockquote p{margin:0;max-width:none;font-size:clamp(1.6rem,3.4vw,2.7rem);line-height:1.18;letter-spacing:var(--track-h2);text-wrap:balance}
.quote figcaption{margin-top:24px;display:flex;flex-direction:column;gap:2px}.q-author{font-weight:600}
.q-large{text-align:center}.q-large figure{margin-inline:auto}.q-with-portrait{display:grid;gap:32px;align-items:center}
.q-pull blockquote{position:relative}.q-pull blockquote p{font-size:var(--fs-h2);line-height:1.12}
.q-pull figcaption{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:4px 12px;padding-top:16px;border-top:var(--rule-w) solid var(--rule-c);max-width:420px}
.portrait{width:100%;max-width:340px;aspect-ratio:1;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.stats{display:grid;gap:24px;margin:0;grid-template-columns:repeat(2,minmax(0,1fr))}.stat{border-top:var(--rule-w) solid var(--rule-c);padding-top:18px}
.stat dd{margin:0;order:-1;font-size:clamp(2.2rem,4.6vw,3.4rem);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}.stat dd .ph{text-decoration-thickness:1px}.stat{display:flex;flex-direction:column;gap:10px}.stat dt{color:var(--muted)}
.st-band{${groundVars(g.accent)};background:var(--bg);color:var(--text);padding:clamp(24px,3vw,40px);border-radius:var(--r)}.st-band .stat{border-color:var(--line)}
.st-giant{gap:28px 40px}.st-giant .stat{border-top:0;padding-top:0}.st-giant dd{font-size:var(--fs-giant);letter-spacing:-.035em}.st-giant dt{font-size:.95rem;max-width:22ch}
.logos{text-align:center}.names{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:14px 48px}.names li{font-family:var(--display);font-size:1.35rem;color:var(--muted)}`);
  if (L.motifs.includes('pull-quote')) add(`.quote blockquote::before{content:"“";display:block;font-family:var(--display);font-size:calc(var(--fs-h2) * 2.2);line-height:.7;height:.42em;color:var(--accent-ink)}.q-large blockquote::before{margin-inline:auto}`);
  if (L.motifs.includes('big-numerals')) add(`.stat dd{font-size:var(--fs-giant);letter-spacing:-.035em}`);

  // ── pricing, lists, faq, cta, forms, text
  add(`.plans{display:grid;gap:20px}.plan{display:flex;flex-direction:column;gap:6px;padding:28px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.plan.is-featured{border-color:var(--accent-ink);box-shadow:0 0 0 1px var(--accent-ink)}.price{margin:6px 0 4px;font-size:2.4rem;line-height:1}.plan .ticks{margin-bottom:22px}.plan .btn{margin-top:auto}
.lists{display:grid;gap:clamp(28px,4vw,56px)}.list-group ul{list-style:none;margin:10px 0 0;padding:0}
.list-item{display:grid;grid-template-columns:1fr auto;gap:2px 18px;padding:14px 0;border-bottom:1px solid var(--line)}
.li-main{display:flex;flex-direction:column}.li-name{font-weight:600}.li-price{font-variant-numeric:tabular-nums;font-weight:600}.li-text{grid-column:1/-1;margin:2px 0 0;font-size:.95rem}
.l-menu .li-main{flex-direction:row;align-items:baseline;gap:10px}.l-schedule .li-meta{order:-1;font-variant-numeric:tabular-nums}
.faq-items{border-top:var(--rule-w) solid var(--rule-c)}.qa{border-bottom:1px solid var(--line);padding:6px 0}
.qa summary{cursor:pointer;font-weight:600;font-size:1.08rem;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:48px}.qa summary::after{content:"+";color:var(--muted);font-size:1.3em;line-height:1}.qa[open] summary::after{content:"−"}.qa summary::-webkit-details-marker{display:none}.qa p{margin:4px 0 14px;color:var(--muted);max-width:70ch}
.cta-box{padding:clamp(36px,6vw,80px);border-radius:var(--r);text-align:center}.cta-box .actions{justify-content:center}.cta-box .body-lg{margin-inline:auto}
.c-band{${groundVars(g.accent)};background:var(--bg);color:var(--text)}.c-band .body-lg{color:var(--muted)}
.c-centered{background:var(--surface);border:1px solid var(--line)}
.cta-image{display:grid;gap:clamp(28px,5vw,64px);align-items:center}.cta-media .media-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.cta-statement{display:grid;gap:32px;align-items:end}.cta-statement .h-giant{max-width:${upper ? '14ch' : '16ch'}}.cs-row{display:grid;gap:8px;margin-top:clamp(24px,3vw,40px)}.cs-row .body-lg{margin:0}.cs-row .actions{margin-top:18px}
.form-wrap{display:grid;gap:clamp(24px,4vw,56px)}.form{display:grid;gap:18px;max-width:620px}.fields{display:grid;gap:16px}
.field{display:flex;flex-direction:column;gap:6px}.field label{font-weight:600;font-size:.95rem}.req{color:var(--accent-ink)}
.field input:not([type=checkbox]),.field textarea,.field select{width:100%;min-height:48px;padding:12px 14px;border:1.5px solid color-mix(in srgb,var(--text) 32%,transparent);border-radius:${Math.min(corner, 10)}px;background:var(--surface);color:var(--text);font:inherit}
.field.is-check{flex-direction:row;align-items:center;gap:10px}.field.is-check label{display:flex;align-items:center;min-height:44px;cursor:pointer}.field.is-check input{width:22px;height:22px;accent-color:var(--accent)}
.form .btn{justify-self:start}
.tb-narrow{max-width:760px}.tb-body p{margin:0 0 1.1em;font-size:1.08rem;max-width:66ch}.tb-two-column{display:grid;gap:clamp(24px,4vw,64px)}
.tb-lead .lead-p{font-size:var(--fs-lede);font-size:clamp(1.3rem,2.2vw,1.75rem);line-height:1.4;max-width:34ch;color:var(--text);font-weight:${nearestWeight(tk.fonts.display, 400)}}.tb-lead .tb-body{max-width:760px}`);

  // ── containers: open, ruled, boxed, banded, framed
  if (L.containers === 'ruled') add(`.f-grid .feature,.f-columns .feature{padding-top:22px;border-top:var(--rule-w) solid var(--rule-c)}.f-columns .feature{border-left:0;padding-left:0}`);
  if (L.containers === 'cards') add(`.f-grid .feature,.f-columns .feature,.f-numbered .feature,.list-group{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:clamp(22px,2.5vw,32px)}.f-columns .feature{border-left:1px solid var(--line)}.f-numbered .feature{border-top:1px solid var(--line)}.list-group ul{margin-top:4px}.list-item:last-child{border-bottom:0}`);
  if (L.containers === 'framed')
    add(`.f-grid .feature,.f-columns .feature,.f-numbered .feature,.list-group,.plan{border:var(--rule-w) solid var(--rule-c);border-radius:var(--r);padding:clamp(22px,2.5vw,30px)}.f-columns .feature{padding-left:clamp(22px,2.5vw,30px)}${L.buttons === 'offset' ? '.f-grid .feature,.f-numbered .feature,.plan,.list-group{box-shadow:5px 5px 0 var(--text);background:var(--surface)}' : ''}`);
  if (L.containers !== 'cards' && L.containers !== 'framed') add(`.plan{background:transparent;border:0;border-top:var(--rule-w) solid var(--rule-c);border-radius:0;padding:22px 0 0}.plan.is-featured{box-shadow:none;border-top-color:var(--accent-ink);border-top-width:3px}`);
  if (L.containers === 'open') add(`.f-numbered .feature,.f-list .feature{border-top:0;padding-top:0}`);

  // ── the booking: drawn in the design's own tokens, so each direction draws it in its own language
  add(`.bk{display:grid;gap:clamp(20px,3vw,36px)}.bk-panel{display:grid;gap:clamp(20px,3vw,36px);min-width:0}.bk fieldset{border:0;margin:0;padding:0;min-width:0}
.bk-head .h-section{margin-bottom:6px}.bk-head .lede{margin:0}
.bk-legend{display:block;padding:0;margin:0 0 10px;font-size:.82rem;color:var(--muted)}
.bk-body{display:grid;gap:clamp(18px,2.5vw,28px);min-width:0}.bk-item{display:grid;gap:6px;align-content:start}.bk-item p{margin:0}
.bk-kicker{font-size:.8rem;color:var(--muted)}.bk-item-name{font-family:var(--display);font-weight:var(--iw);font-size:var(--fs-h3);line-height:1.15}
.bk-details{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 18px;color:var(--muted);font-size:.95rem}
.bk-choice{margin-top:6px!important;font-weight:600}
.bk label{position:relative;cursor:pointer;-webkit-tap-highlight-color:transparent}.bk input[type=radio]{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}
.bk-day-row{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}
.bk-day{flex:none;display:grid;gap:2px;align-content:center;min-width:88px;min-height:64px;padding:10px 14px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--surface);transition:border-color .16s ease,background-color .16s ease,color .16s ease}
.bk-day-label{font-weight:600}.bk-day-date,.bk-day-count{font-size:.8rem;color:var(--muted)}
.bk-day:has(input:checked){border-color:var(--text);background:var(--text);color:var(--bg)}.bk-day:has(input:checked) :is(.bk-day-date,.bk-day-count){color:inherit;opacity:.8}
.bk-day:hover:not(.is-closed),.bk-slot:hover:not(.is-full){border-color:var(--text)}
.bk-day:has(input:focus-visible),.bk-slot:has(input:focus-visible){outline:2px solid var(--accent-ink);outline-offset:3px}
.bk-day.is-closed,.bk-slot.is-full{opacity:.42;cursor:not-allowed}.bk-slot.is-full .bk-time{text-decoration:line-through}
.bk-times-wrap{display:grid;gap:18px;margin-top:18px}
.bk-slot-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,118px),1fr));gap:8px}
.bk-slot{display:grid;gap:2px;align-content:center;min-height:58px;padding:10px 14px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--surface);transition:border-color .16s ease,background-color .16s ease,color .16s ease}
.bk-time{font-size:1.12rem;font-weight:600;font-variant-numeric:tabular-nums}.bk-status{font-size:.78rem;color:var(--muted)}.bk-slot.is-few .bk-status{color:var(--accent-ink);font-weight:600}
.bk-slot:has(input:checked){border-color:var(--accent);background:var(--accent);color:var(--on-accent)}.bk-slot:has(input:checked) .bk-status{color:inherit}
.bk-error{margin:14px 0 0;font-weight:600;color:var(--accent-ink)}
.bk-actions{margin-top:22px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}.bk-action{min-width:min(100%,220px)}
.bk-action[aria-disabled=true]{opacity:.5}.bk-action[aria-busy=true]{cursor:progress;opacity:.75}
.bk-note{margin:14px 0 0}
.bk-done{display:grid;gap:10px;padding:clamp(22px,3vw,34px);border:1.5px solid var(--text);border-radius:var(--r);background:var(--surface)}.bk-done p{margin:0}.bk-done:focus{outline:none}
.bk-done-title{font-family:var(--display);font-weight:var(--iw);font-size:var(--fs-h3);line-height:1.15}.bk-done-summary{font-weight:600}.bk-change{justify-self:start;margin-top:6px}
.bk-done{transition:opacity .32s cubic-bezier(.2,.7,.2,1),transform .32s cubic-bezier(.2,.7,.2,1)}.bk-done.is-arriving{opacity:0;transform:translateY(8px)}
.fm-done{margin:14px 0 0;font-weight:600}.field.is-invalid :is(input,textarea,select){border-color:var(--accent-ink)}.fm-error{margin:6px 0 0;font-size:.85rem;color:var(--accent-ink);font-weight:600}
th .th-sort{all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;min-height:36px}th .th-sort:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}@media (max-width:720px),(pointer:coarse){th .th-sort{min-width:44px;min-height:44px}}
@media (prefers-reduced-motion:reduce){.bk-day,.bk-slot,.bk-done{transition:none}}
/* calendar: the days as a grid, the times beside */
.bk-calendar .bk-day-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,124px),1fr));overflow:visible}.bk-day-label{overflow-wrap:anywhere}
@media (min-width:900px){.bk-calendar .bk-form{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);column-gap:clamp(24px,4vw,56px);align-items:start}.bk-calendar .bk-days{grid-row:1/span 4}.bk-calendar .bk-day{min-height:104px;align-content:space-between}.bk-calendar .bk-day-label{font-family:var(--display);font-size:1.15rem}.bk-calendar .bk-times-wrap{margin-top:0}.bk-calendar .bk-slot-grid{grid-template-columns:1fr 1fr}}
/* list: every day and time as one typographic list */
.bk-list .bk-times{padding-top:18px;border-top:var(--rule-w) solid var(--rule-c)}.bk-list .bk-times-wrap{gap:28px}
.bk-list .bk-legend{font-family:var(--display);font-weight:var(--iw);font-size:var(--fs-h3);color:var(--text)}
.bk-list .bk-slot-grid{grid-template-columns:1fr;gap:0}
.bk-list .bk-slot{grid-template-columns:8ch minmax(0,1fr);align-items:baseline;gap:16px;min-height:54px;padding:12px 4px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:none}
.bk-list .bk-time{font-family:var(--display);font-size:1.45rem;font-weight:var(--iw)}
.bk-list .bk-slot:has(input:checked){background:none;color:var(--text);box-shadow:inset 3px 0 0 var(--accent);padding-left:16px}.bk-list .bk-slot:has(input:checked) .bk-status{color:var(--accent-ink);font-weight:600}
/* split: the choice summarised beside the picker */
@media (min-width:900px){.bk-split .bk-body{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(28px,5vw,72px);align-items:start}.bk-split .bk-item{position:sticky;top:24px;padding:clamp(22px,2.6vw,34px);background:var(--surface);border:1px solid var(--line);border-radius:var(--r)}.bk-split .bk-item-name{font-size:var(--fs-h2)}}
/* strip: the days as one row over the times */
.bk-strip .bk-item{grid-auto-flow:row}@media (min-width:900px){.bk-strip .bk-item{grid-template-columns:auto 1fr;column-gap:24px;align-items:baseline}.bk-strip .bk-kicker{grid-column:1/-1}.bk-strip .bk-choice{grid-column:1/-1}}
/* immersive: one picture, the picker over it */
.bk-immersive{position:relative}.bk-media{margin:0}.bk-media img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--r);filter:var(--img)}
@media (min-width:900px){.bk-immersive{min-height:min(90vh,780px);padding-block:clamp(28px,5vw,64px)}.bk-immersive .bk-media{position:absolute;inset:0}.bk-immersive .bk-media img{height:100%;aspect-ratio:auto;border-radius:0}.bk-immersive .bk-media figcaption{position:absolute;left:16px;bottom:12px;max-width:calc(100% - 32px);padding:3px 8px;background:rgba(0,0,0,.6);color:#fff;font-size:.75rem}.bk-immersive .bk-media figcaption .fig-no{color:inherit}.bk-immersive .bk-panel{position:relative;width:min(100%,600px);margin-left:auto;padding:clamp(24px,3vw,40px);background:var(--bg);border-radius:var(--r);box-shadow:0 24px 64px rgba(0,0,0,.22)}}`);

  // ── shapes: each booking and opening as its own settings set it (spec.ts SHAPE_FIELDS). A class only when the
  // setting is there, so a design without one draws exactly as before; every value keeps 44 px targets.
  // composed sections: stacks, grids in proportion, boxes on a ground, figures, pictures; one column on a phone
  add(`.cp{display:block;container-type:inline-size}.cp-grid>*{container-type:inline-size}
.cp .cp-title.h-hero{font-size:min(var(--fs-hero),11cqi);overflow-wrap:break-word}.cp .cp-title.h-section{font-size:min(var(--fs-h2,2.4rem),8cqi)}.cp :is(.cp-title,.cp-heading,.cp-lead,.cp-body,.cp-caption,.cp-quote,.cp-fig-v){overflow-wrap:break-word}
.cp-stack{display:flex;flex-direction:column;min-width:0}.cp-stack.cp-row{flex-direction:row;flex-wrap:wrap}.cp-stack>*,.cp-grid>*{min-width:0}
.cp-gap-s{gap:12px}.cp-gap-m{gap:clamp(16px,2.2vw,28px)}.cp-gap-l{gap:clamp(24px,4.4vw,64px)}
.cp-stack.cp-col.cp-al-start{align-items:flex-start}.cp-stack.cp-col.cp-al-center{align-items:center;text-align:center}.cp-stack.cp-col.cp-al-end{align-items:flex-end;text-align:right}.cp-stack.cp-col.cp-al-stretch{align-items:stretch}
.cp-stack.cp-row.cp-al-start{align-items:flex-start}.cp-stack.cp-row.cp-al-center{align-items:center}.cp-stack.cp-row.cp-al-end{align-items:flex-end}.cp-stack.cp-row.cp-al-stretch{align-items:stretch}
.cp-grid{display:grid;grid-template-columns:var(--cp-cols,minmax(0,1fr) minmax(0,1fr))}.cp-grid.cp-al-start{align-items:start}.cp-grid.cp-al-center{align-items:center}.cp-grid.cp-al-end{align-items:end}.cp-grid.cp-al-stretch{align-items:stretch}
@media (max-width:720px){.cp-grid{grid-template-columns:minmax(0,1fr)}.cp-stack.cp-col.cp-al-end{align-items:flex-start;text-align:left}}
.cp-box{border-radius:var(--r)}.cp-pad-s{padding:16px}.cp-pad-m{padding:clamp(20px,3vw,32px)}.cp-pad-l{padding:clamp(28px,5vw,56px)}
.cp-box{background:var(--bg);color:var(--text)}
.cp-title,.cp-heading,.cp-lead,.cp-body,.cp-caption{margin:0;max-width:62ch}.cp-caption{color:var(--muted)}
.cp-quote{margin:0;font-family:var(--display);font-size:var(--fs-h3);line-height:1.3}.cp-quote p{margin:0}
.cp-figure{display:grid;gap:6px}.cp-fig-v{font-family:var(--display);font-size:min(clamp(3rem,9vw,7rem),24cqi);line-height:.9;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.cp-fig-l{color:var(--muted);font-size:.95rem}
.cp-img{margin:0}.cp-img img{display:block;width:100%;height:auto;object-fit:cover;border-radius:var(--r)}
.cp-r-1x1 img{aspect-ratio:1/1}.cp-r-4x3 img{aspect-ratio:4/3}.cp-r-3x2 img{aspect-ratio:3/2}.cp-r-16x9 img{aspect-ratio:16/9}.cp-r-3x4 img{aspect-ratio:3/4}.cp-r-2x3 img{aspect-ratio:2/3}.cp-r-21x9 img{aspect-ratio:21/9}
.cp-link{color:inherit;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:inline-flex;align-items:center}
.cp-list{margin:0;padding-left:1.2em;display:grid;gap:8px}.cp-m-none{list-style:none;padding-left:0}.cp-m-rule{list-style:none;padding-left:0;gap:0}.cp-m-rule li{padding:10px 0;border-top:1px solid var(--line)}
.cp-rule{width:100%;border:0;border-top:var(--rule-w,1px) solid var(--rule-c,var(--line));margin:0}
.wrap.cp-span-wide{width:min(1680px,100% - 40px)}.wrap.cp-span-bleed{width:100%}
.sx-compose:has(>.cp-span-bleed>.cp-layer){padding-block:0}.cp-tall{min-height:min(100vh,1080px);display:grid;align-content:center}.cp-tall>.cp-layer{min-height:min(100vh,1080px)}
.cp-sz-l.cp-title.h-hero,.cp .cp-sz-l.cp-title.h-hero{font-size:min(calc(var(--fs-hero) * 1.25),14cqi)}.cp .cp-sz-xl.cp-title{font-size:min(calc(var(--fs-hero) * 1.6),17cqi);line-height:.98}.cp .cp-sz-giant.cp-title{font-size:min(calc(var(--fs-hero) * 2.2),21cqi);line-height:.92;letter-spacing:-.03em}
.cp .cp-sz-l.cp-heading,.cp .cp-sz-l.cp-quote{font-size:min(var(--fs-h2),9cqi);line-height:1.1}.cp .cp-sz-xl.cp-heading,.cp .cp-sz-xl.cp-quote{font-size:min(calc(var(--fs-h2) * 1.4),11cqi);line-height:1.05}.cp .cp-sz-giant.cp-heading,.cp .cp-sz-giant.cp-quote{font-size:min(var(--fs-hero),13cqi);line-height:1}
.cp :is(.cp-sz-l,.cp-sz-xl,.cp-sz-giant){max-width:none}.cp :is(.cp-sz-xl,.cp-sz-giant){padding-bottom:.16em}
.cp-ta-center{text-align:center;margin-inline:auto}.cp-ta-end{text-align:right;margin-left:auto}
.cp-layer{display:grid;position:relative;isolation:isolate;container-type:inline-size}.cp-layer>*{grid-area:1/1;min-width:0}
.cp-ground{position:relative;display:grid;min-height:0}.cp-ground>*{min-width:0}.cp-shade{position:absolute;inset:0;background:rgba(0,0,0,.36);border-radius:var(--r);pointer-events:none}
.cp-over{z-index:1;display:grid;gap:12px;max-width:min(100%,64ch);height:max-content}
.cp-inset-s>.cp-over{padding:14px}.cp-inset-m>.cp-over{padding:clamp(18px,3cqi,40px)}.cp-inset-l>.cp-over{padding:clamp(28px,6cqi,88px)}
.cp-at-top-start>.cp-over{place-self:start start}.cp-at-top>.cp-over{place-self:start center;text-align:center}.cp-at-top-end>.cp-over{place-self:start end;text-align:right}
.cp-at-start>.cp-over{place-self:center start}.cp-at-center>.cp-over{place-self:center;text-align:center}.cp-at-end>.cp-over{place-self:center end;text-align:right}
.cp-at-bottom-start>.cp-over{place-self:end start}.cp-at-bottom>.cp-over{place-self:end center;text-align:center}.cp-at-bottom-end>.cp-over{place-self:end end;text-align:right}
.cp-on-img>.cp-over{--text:#fff;--muted:#fff;--accent-ink:#fff;--line:rgba(255,255,255,.5);color:#fff}.cp-on-img>.cp-over .em{color:inherit}.cp-on-img>.cp-over .cp-caption,.cp-on-img>.cp-over .eyebrow{color:#fff}
.cp-on-img>.cp-over .btn-secondary{color:#fff;border-color:rgba(255,255,255,.7)}
.cp-fill{height:100%;display:grid}.cp-fill img{height:100%;min-height:clamp(280px,52vh,760px);aspect-ratio:auto}.cp-tall .cp-fill img{min-height:min(100vh,1080px)}.cp-span-bleed .cp-fill img,.cp-span-bleed>.cp-layer>.cp-ground .cp-shade{border-radius:0}
.cp-pin{position:sticky;top:clamp(16px,6vh,72px);align-self:start}
.cp-field{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:clamp(12px,1.6vw,28px);row-gap:clamp(8px,1.2vw,20px);grid-auto-rows:minmax(var(--cp-row,72px),auto)}
.cp-rows-s{--cp-row:clamp(28px,4vw,56px)}.cp-rows-m{--cp-row:clamp(44px,6.5vw,96px)}.cp-rows-l{--cp-row:clamp(64px,10vw,150px)}
.cp-cell{grid-column:var(--c)/span var(--s);grid-row:var(--r)/span var(--rs);min-width:0;z-index:2;align-self:start;container-type:inline-size}.cp-cell.cp-media{z-index:1;align-self:stretch}
.cp-cell.cp-media>.cp-img{height:100%}.cp-cell.cp-media>.cp-fill img{min-height:0}
.cp-plate{background:var(--bg);color:var(--text);padding:clamp(12px,1.8vw,26px);align-self:end}
.cp-lines{align-self:center}.cp .cp-lines>.cp-title{display:inline;background:var(--bg);color:var(--text);padding:.08em .14em;line-height:1.1;-webkit-box-decoration-break:clone;box-decoration-break:clone}
@media (max-width:899px){.cp-field{display:flex;flex-direction:column;gap:clamp(16px,4vw,28px)}.cp-field>.cp-cell{align-self:stretch}.cp-plate{padding:0;background:none}.cp-ink{position:relative}.cp .cp-lines>.cp-title{display:block;background:none;padding:0;line-height:1.02}.cp-pin{position:static}.cp-cell.cp-media>.cp-fill img{min-height:0;aspect-ratio:4/3}
.cp-span-bleed>.cp-field>.cp-cell:not(.cp-media),.cp-span-bleed>.cp-grid>*:not(.cp-img),.cp-span-bleed>.cp-stack>*:not(.cp-img){padding-inline:20px}.cp-ta-end{text-align:left;margin-left:0}}
@media (max-width:720px){.cp-layer .cp-over{max-width:100%}.cp-at-end>.cp-over,.cp-at-top-end>.cp-over,.cp-at-bottom-end>.cp-over{text-align:left;justify-self:start}}`);
  add(`.sh-align-center .bk-head{text-align:center;margin-inline:auto;max-width:760px}.sh-align-center .bk-head .lede{margin-inline:auto}
.sh-density-airy .bk-panel,.sh-density-airy .bk-body{gap:clamp(28px,4vw,52px)}.sh-density-airy .bk-slot-grid{gap:12px}.sh-density-airy .bk-slot{min-height:68px;padding:14px 18px}.sh-density-airy .bk-day{min-height:72px;padding:12px 18px}
.sh-density-dense .bk-panel,.sh-density-dense .bk-body{gap:clamp(14px,2vw,20px)}.sh-density-dense .bk-slot-grid{gap:6px}.sh-density-dense .bk-slot{min-height:48px;padding:8px 12px}.sh-density-dense .bk-day{min-height:52px;min-width:76px;padding:8px 12px}.sh-density-dense .bk-times-wrap{margin-top:12px}
.sh-times-rows .bk-slot-grid{grid-template-columns:1fr;gap:0}
.sh-times-rows .bk-slot{grid-template-columns:8ch minmax(0,1fr);align-items:baseline;gap:16px;min-height:52px;padding:12px 4px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:none}
.sh-times-rows .bk-slot:has(input:checked){background:none;color:var(--text);box-shadow:inset 3px 0 0 var(--accent);padding-left:16px}.sh-times-rows .bk-slot:has(input:checked) .bk-status{color:var(--accent-ink);font-weight:600}
.sh-times-pills .bk-slot-grid{display:flex;flex-wrap:wrap;gap:8px}
.sh-times-pills .bk-slot{display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:8px 18px;border-radius:999px}.sh-times-pills .bk-time{font-size:1rem}
.sh-times-tiles.v-list .bk-slot-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,118px),1fr));gap:8px}.sh-times-tiles.v-list .bk-slot{grid-template-columns:none;align-items:start;gap:2px;min-height:58px;padding:10px 14px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--surface)}
.sh-times-pills.v-list .bk-slot{border:1.5px solid var(--line);background:var(--surface)}
.sh-times-tiles.v-list .bk-time,.sh-times-pills.v-list .bk-time{font-family:inherit;font-size:1.05rem;font-weight:600}
.sh-times-tiles.v-list .bk-slot:has(input:checked),.sh-times-pills.v-list .bk-slot:has(input:checked){border-color:var(--accent);background:var(--accent);color:var(--on-accent);box-shadow:none}.sh-times-tiles.v-list .bk-slot:has(input:checked){padding-left:14px}.sh-times-pills.v-list .bk-slot:has(input:checked){padding-left:18px}
.sh-times-tiles.v-list .bk-slot:has(input:checked) .bk-status,.sh-times-pills.v-list .bk-slot:has(input:checked) .bk-status{color:inherit}
.sh-summary-card .bk-item{padding:clamp(18px,2.4vw,30px);background:var(--surface);border:1px solid var(--line);border-radius:var(--r)}
.sh-summary-inline .bk-item{padding:0;background:none;border:0;position:static}
.bk-bar{position:sticky;bottom:12px;z-index:2;justify-content:space-between;padding:10px 10px 10px 20px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r)}.bk-bar .bk-choice{margin:0;font-weight:600}
@media (min-width:900px){
.sh-ratio.v-split .bk-body{grid-template-columns:minmax(0,var(--sh-a)) minmax(0,var(--sh-b))}
.sh-side-end.v-split .bk-body{grid-template-columns:minmax(0,var(--sh-b,7fr)) minmax(0,var(--sh-a,5fr))}.sh-side-end.v-split .bk-item{order:2}
.sh-ratio.v-calendar .bk-form{grid-template-columns:minmax(0,var(--sh-b)) minmax(0,var(--sh-a))}
.sh-side-end.v-calendar .bk-form{grid-template-columns:minmax(0,var(--sh-a,5fr)) minmax(0,var(--sh-b,7fr))}.sh-side-end.v-calendar .bk-days{grid-column:2;grid-row:1/span 4}.sh-side-end.v-calendar .bk-form>:not(.bk-days){grid-column:1}
.sh-side-start.v-immersive .bk-panel{margin-left:0;margin-right:auto}
}
.sh-align-center .hero-text,.sh-align-center .hs-words{text-align:center;margin-inline:auto}.sh-align-center .hero-sub,.sh-align-center .h-hero{margin-inline:auto}.sh-align-center .actions{justify-content:center}.sh-align-center .hs-foot{justify-items:center;text-align:center}
.sh-measure .hero-text,.sh-measure .hs-words{max-width:calc(var(--sh-measure) * 100%)}
.sh-scale .h-hero,.sh-scale .hero-poster .h-poster{font-size:min(calc(var(--fs-hero) * var(--sh-scale)),var(--fit-hero,999px))}
.sh-side-end.v-editorial .hero-text,.sh-side-end.v-full-bleed .hero-text{margin-left:auto}
.sh-valign-top .hero-bleed{align-items:flex-start}.sh-valign-middle .hero-bleed{align-items:center}
.sh-valign-top .hero-bleed .wrap::before{inset:0 -100vw -140px;background:linear-gradient(0deg,rgba(0,0,0,0) 0,rgba(0,0,0,.58) 140px,rgba(0,0,0,.68) 100%)}
.sh-valign-middle .hero-bleed .wrap::before{inset:-80px -100vw;background:linear-gradient(180deg,rgba(0,0,0,0) 0,rgba(0,0,0,.62) 80px,rgba(0,0,0,.62) calc(100% - 80px),rgba(0,0,0,0) 100%)}
@media (min-width:1100px){.sh-ratio.v-split .hero-split{grid-template-columns:minmax(0,var(--sh-a)) minmax(0,var(--sh-b))}.sh-side-end.v-split .hero-split{grid-template-columns:minmax(0,var(--sh-b,10fr)) minmax(0,var(--sh-a,11fr))}.sh-side-end.v-split .hero-text{order:2}}`);

  // one column on a phone, and a column that never grows past the screen: an implicit track would widen to
  // its longest word ("DOWNLOADABLE" in poster capitals), pushing the page sideways; with a zero minimum the
  // headings' break-word takes over instead. The wider layouts below replace it.
  add(`.split,.hero-split,.hs-foot,.hp-row,.features,.lists,.plans,.cta-image,.cta-statement,.cs-row,.form-wrap,.tb-two-column,.q-with-portrait,.foot,.bk-body{grid-template-columns:minmax(0,1fr)}`);

  // ── the grid the page hangs from
  add(`@media (min-width:1000px){`);
  if (L.grid === 'editorial') add(`.has-head{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,8fr);column-gap:clamp(32px,5vw,88px);align-items:start;padding-top:24px;border-top:var(--rule-w) solid var(--rule-c)}.has-head>.section-head{position:sticky;top:28px;margin:0;text-align:left}.has-head>.section-head .h-section{font-size:min(calc(var(--fs-h2) * .82),var(--fit-h2-col,999px))}.has-head>:not(.section-head){grid-column:2}.text-block.tb-two-column,.form-wrap.fm-split{padding-top:24px;border-top:var(--rule-w) solid var(--rule-c)}`);
  if (L.grid === 'swiss') add(`.sx:not(.sx-nav):not(.sx-hero):not(.sx-footer)>.wrap{border-top:var(--rule-w) solid var(--rule-c);padding-top:28px}.section-head{max-width:none;display:grid;grid-template-columns:2fr 10fr;column-gap:24px}.section-head>*{grid-column:2}.section-head>.sec-no{grid-column:1;grid-row:1/span 3}.section-head .h-section{max-width:18ch}.section-head.center{text-align:left}`);
  if (L.grid === 'asymmetric') add(`.sx:nth-of-type(even) .section-head{margin-left:calc(100% / 12 * 4)}.sx:nth-of-type(odd) .has-head>:not(.section-head){margin-left:calc(100% / 12 * 2)}.section-head.center{text-align:left;margin-inline:0}.sx:nth-of-type(even) .section-head.center{margin-left:calc(100% / 12 * 4)}`);
  if (L.grid === 'poster') add(`.section-head{max-width:none}.section-head .h-section{font-size:min(var(--fs-h2),var(--fit-h2,999px));max-width:18ch}.section-head.center{text-align:left}`);
  if (L.grid === 'modular') add(`.features.f-grid,.features.f-columns{gap:0;border-top:1px solid var(--line);border-left:1px solid var(--line)}.features.f-grid .feature,.features.f-columns .feature{border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0;padding:28px;box-shadow:none}.section-head{max-width:none;display:flex;flex-wrap:wrap;align-items:baseline;column-gap:24px}.section-head .h-section{flex:1 1 420px;margin:0}.section-head .lede{flex:1 1 320px}.section-head .eyebrow,.section-head .sec-no{flex-basis:100%}.section-head.center{text-align:left}`);
  if (L.grid === 'centered' || L.align === 'center') add(`.section-head{margin-inline:auto;text-align:center}.section-head .lede{margin-inline:auto}.f-columns .feature,.f-grid .feature{text-align:center}.f-columns .feature{border-left:0;padding-left:0}.f-grid .ic{margin-inline:auto}.split-text{text-align:left}`);
  add(`}`);
  if (L.grid === 'centered' || L.align === 'center') add(`.section-head{text-align:center;margin-inline:auto}.section-head .lede{margin-inline:auto}`);

  // ── image frames
  if (L.frame === 'inset') add(`.media-img,.g-img,.portrait{padding:clamp(8px,1vw,14px);background:var(--surface);border:1px solid var(--line);border-radius:0}`);
  if (L.frame === 'arch') add(`.hero-media .media-img,.split-media .media-img,.cta-media .media-img,.portrait{border-radius:999px 999px var(--r) var(--r)}.split-media .media-img,.cta-media .media-img{aspect-ratio:4/5}`);
  if (L.frame === 'circle') add(`.hero-media .media-img,.split-media .media-img,.cta-media .media-img,.portrait{aspect-ratio:1;border-radius:50%}`);
  if (L.frame === 'offset') add(`.media-img,.g-img,.portrait{border:2px solid var(--text);box-shadow:10px 10px 0 var(--accent2);border-radius:0}.gallery{gap:24px}`);

  // ── marquee
  if (L.motifs.includes('marquee')) add(`.marquee{${groundVars(g.accent)};background:var(--bg);color:var(--text);overflow:hidden;white-space:nowrap;border-block:var(--rule-w) solid var(--rule-c);padding-block:clamp(10px,1.4vw,18px)}.mq-track{display:flex;align-items:center;gap:clamp(18px,2.4vw,36px);width:max-content;font-family:var(--display);font-weight:var(--hw);font-size:clamp(1.4rem,3.2vw,2.6rem);line-height:1;${upper ? 'text-transform:uppercase;' : ''}letter-spacing:var(--track-h2)}.mq-dot{width:.42em;height:.42em;flex:none;background:currentColor;border-radius:${L.shapes.includes('square') || L.shapes.includes('diamond') ? '0' : '50%'};${L.shapes.includes('diamond') ? 'transform:rotate(45deg);' : ''}}`);

  // ── breakpoints
  add(`@media (min-width:760px){
.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}.g-mosaic .g-item:first-child{grid-column:span 2;grid-row:span 2}
.gallery.n-1:not(.g-strip){grid-template-columns:1fr}.gallery.n-1:not(.g-strip) .g-item:first-child{grid-column:auto;grid-row:auto}.gallery.n-1:not(.g-strip) .g-img{aspect-ratio:16/9}
.g-grid:not(.n-1){grid-template-columns:repeat(6,minmax(0,1fr))}.g-grid .g-item{grid-column:span 2}
.g-grid.n-2 .g-item,.g-grid.n-4 .g-item,.g-grid.n-5 .g-item:nth-child(n+4),.g-grid.n-7 .g-item:nth-child(n+4),.g-grid.n-8 .g-item:nth-child(n+7){grid-column:span 3}
.g-grid.n-2 .g-img,.g-grid.n-4 .g-img,.g-grid.n-5 .g-item:nth-child(n+4) .g-img,.g-grid.n-7 .g-item:nth-child(n+4) .g-img,.g-grid.n-8 .g-item:nth-child(n+7) .g-img{aspect-ratio:3/2}
.g-mosaic.n-2{grid-template-columns:2fr 1fr}.g-mosaic.n-2 .g-item:first-child{grid-column:auto;grid-row:auto}.g-mosaic.n-2 .g-item:first-child .g-img{aspect-ratio:4/3}
.g-mosaic.n-4 .g-item:nth-child(4),.g-mosaic.n-7 .g-item:nth-child(7){grid-column:1/-1}.g-mosaic.n-4 .g-item:nth-child(4) .g-img,.g-mosaic.n-7 .g-item:nth-child(7) .g-img{aspect-ratio:3/1}
.g-mosaic.n-5 .g-item:nth-child(4),.g-mosaic.n-8 .g-item:nth-child(7){grid-column:span 2}.g-mosaic.n-5 .g-item:nth-child(4) .g-img,.g-mosaic.n-8 .g-item:nth-child(7) .g-img{aspect-ratio:2/1}
.stats{grid-template-columns:repeat(var(--cols,4),minmax(0,1fr))}
.features.n-2{grid-template-columns:repeat(2,minmax(0,1fr))}.features.n-3,.features.n-4{grid-template-columns:repeat(2,minmax(0,1fr))}
.f-index.features{grid-template-columns:1fr!important}.f-index .feature{grid-template-columns:4em minmax(0,5fr) minmax(0,7fr);align-items:baseline}.f-index .num{grid-row:auto}.f-index .feature p{grid-column:3}
.lists.n-2,.lists.n-3{grid-template-columns:repeat(2,minmax(0,1fr))}
.plans.n-2{grid-template-columns:repeat(2,minmax(0,1fr))}.plans.n-3,.plans.n-4{grid-template-columns:repeat(2,minmax(0,1fr))}
.foot{grid-template-columns:1.2fr 2fr}.foot-cols{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.legal,.credits{grid-column:1/-1}
.fq-two-column .faq-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px}
.hs-foot{grid-template-columns:minmax(0,7fr) minmax(0,5fr);align-items:start}
.hp-row{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}.hp-row:not(.has-media){grid-template-columns:1fr auto}
.hero-statement.has-art .hs-top{grid-template-columns:minmax(0,1fr) auto;align-items:end}
.cta-statement.has-art{grid-template-columns:minmax(0,1fr) auto}
.cs-row{grid-template-columns:minmax(0,1fr) auto;align-items:end;column-gap:48px}.cs-row .actions{margin-top:0}
}
@media (min-width:1100px){
.hero-split{grid-template-columns:1.1fr 1fr}.split{grid-template-columns:1fr 1fr}.cta-image{grid-template-columns:1fr 1fr}
.q-with-portrait{grid-template-columns:340px 1fr}.form-wrap.fm-split{grid-template-columns:1fr 1.2fr}.tb-two-column{grid-template-columns:1fr 1.6fr}
.features.n-3{grid-template-columns:repeat(3,minmax(0,1fr))}.features.n-4{grid-template-columns:repeat(4,minmax(0,1fr))}.f-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.lists.n-3{grid-template-columns:repeat(3,minmax(0,1fr))}.plans.n-3{grid-template-columns:repeat(3,minmax(0,1fr))}.plans.n-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.gallery.g-grid.n-4{grid-template-columns:repeat(4,minmax(0,1fr))}.gallery.g-grid.n-4 .g-item{grid-column:auto}.gallery.g-grid.n-4 .g-img{aspect-ratio:1}
.app.nav-sidebar{grid-template-columns:248px 1fr}
.app main{grid-template-columns:repeat(12,minmax(0,1fr))}.app main>*{grid-column:1/-1}.app main>.sx-chart:has(+.sx-feed),.app main>.sx-feed+.sx-chart{grid-column:span 8}.app main>.sx-chart+.sx-feed,.app main>.sx-feed:has(+.sx-chart){grid-column:span 4}
}
@media (max-width:759px){
.nav-links{display:none}.nav-in .btn{margin-left:auto}.ux-js .nav-menu:not([hidden]){display:inline-flex;align-items:center;margin-left:8px}.ux-js .nav-in:has(.nav-menu:not([hidden]))>.btn{display:none}
.app.nav-sidebar .appnav{flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--line);overflow-x:auto}.app.nav-sidebar .appnav ul{display:flex}.app.nav-sidebar .an-user{display:none}
.art{width:clamp(96px,30vw,140px)}.hero-statement.has-art .art{order:-1}
.st-giant{grid-template-columns:1fr}
}`);
  if (L.grid === 'asymmetric') add(`@media (min-width:1100px){.split{grid-template-columns:7fr 5fr}.split.is-left{grid-template-columns:5fr 7fr}.hero-split{grid-template-columns:7fr 5fr}}`);
  if (L.grid === 'swiss' || L.grid === 'poster') add(`@media (min-width:1100px){.split{grid-template-columns:5fr 7fr}.split.is-left{grid-template-columns:7fr 5fr}}`);

  // ── app screens
  add(`.app{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr);background:var(--bg)}.app>*{min-width:0}.appnav{min-width:0;max-width:100%}.app main{min-width:0;padding:clamp(18px,3vw,36px);display:grid;gap:22px;align-content:start}@media (max-width:1099px){.app main{grid-template-columns:minmax(0,1fr)}}.app main>*{min-width:0}.apphead-acts input{max-width:100%;min-width:0}
.app .sx{padding:0}.appnav{padding:20px;display:flex;flex-direction:column;gap:22px;background:var(--surface);border-right:1px solid var(--line)}
.appnav ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}.appnav a{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:${Math.min(corner, 10)}px;text-decoration:none;color:var(--muted);font-weight:500}
.appnav a[aria-current=page]{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--text)}.appnav .ic{width:20px;height:20px;stroke:currentColor}.an-user{margin-top:auto}
.app.nav-topbar{grid-template-rows:auto 1fr}.nav-topbar .appnav{flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--line);padding:10px 20px}.nav-topbar .appnav{overflow-x:auto}.nav-topbar .appnav ul{display:flex}.nav-topbar .appnav a,.nav-sidebar .appnav a{white-space:nowrap}.nav-topbar .an-user{margin:0 0 0 auto}
.app.nav-tabbar{grid-template-rows:1fr auto}.nav-tabbar .appnav{order:2;position:sticky;bottom:0;flex-direction:row;padding:6px 8px;border-right:0;border-top:1px solid var(--line)}.nav-tabbar .appnav .brand,.nav-tabbar .an-user{display:none}
.nav-tabbar .appnav ul{display:flex;width:100%;justify-content:space-around}.nav-tabbar .appnav a{flex-direction:column;gap:2px;min-height:52px;font-size:.72rem;padding:4px 8px}
.app.is-mobile{max-width:430px;margin-inline:auto;border-inline:1px solid var(--line)}
.apphead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px}.h-app{margin:0;font-size:clamp(1.6rem,2.6vw,2.2rem);line-height:1.1}.apphead p{margin:6px 0 0}
.apphead-acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.apphead .btn{min-height:44px;padding:0 18px;font-size:.92rem}
.search{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1.5px solid var(--line);border-radius:${btnR};background:var(--surface)}.search .ic{width:18px;height:18px;stroke:var(--muted)}.search input{align-self:stretch;border:0;background:none;font:inherit;color:var(--text);outline:none;min-width:0;flex:1}
.cards-row{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}@media (max-width:759px){.cards-row{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cards-row>.stat-card:last-child:nth-child(odd){grid-column:1/-1}.stat-card{padding:16px}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:20px}.h-card{margin:0 0 14px;font-size:1.15rem}
.stat-card p{margin:0}.stat-value{font-size:2rem;line-height:1.1;margin:6px 0 4px!important;letter-spacing:-.02em}.delta{font-size:.875rem;font-weight:600}.d-up{color:var(--accent-ink)}.d-down{color:var(--muted)}
.chart{width:100%;height:auto;overflow:visible}.chart .grid{stroke:var(--line);stroke-width:1}.chart .axis{fill:var(--muted);font-size:11px;font-family:var(--body)}
.chart .line{fill:none;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}.chart .area{opacity:.14}
.s0{stroke:var(--accent);fill:var(--accent);background:var(--accent)}.s1{stroke:var(--muted);fill:var(--muted);background:var(--muted)}.s2{stroke:var(--text);fill:var(--text);background:var(--text)}
.line.s0,.line.s1,.line.s2{fill:none}.chart .cmp{stroke-dasharray:6 5;stroke-width:2}.key-line{width:16px;height:0;background:none!important;border-top:2px dashed var(--muted);border-radius:0;vertical-align:middle}.key-line.s2{border-top-color:var(--text)}.legend{display:flex;gap:16px;list-style:none;margin:10px 0 0;padding:0;font-size:.85rem;color:var(--muted)}.key{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.94rem}th{text-align:left;font-weight:600;color:var(--muted);font-size:.82rem;padding:10px 12px;border-bottom:1px solid var(--line)}td{padding:12px;border-bottom:1px solid var(--line)}
.status{display:inline-flex;align-items:center;gap:6px}.status .dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
/* interactions (lib/ux-v0/behaviors.ts): filters, the picture opened large, a chart's series and readings, a table's filter, a configurator */
.ux-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}.ux-chip{font:inherit;font-size:.86rem;min-height:36px;padding:6px 14px;border:1px solid var(--line);border-radius:var(--r-pill,999px);background:transparent;color:var(--text);cursor:pointer}.ux-chip[aria-pressed=true]{background:var(--text);color:var(--bg);border-color:var(--text)}.ux-chip:focus-visible,.lg-btn:focus-visible,.cfg-opt input:focus-visible+span{outline:2px solid var(--accent-ink);outline-offset:2px}
[data-ux-open]{cursor:zoom-in}.g-item[hidden],.list-group[hidden]{display:none!important}
.ux-lb{position:fixed;inset:0;z-index:80;display:grid;grid-template-rows:1fr auto;gap:12px;padding:clamp(12px,4vw,40px);background:color-mix(in srgb,var(--bg) 94%,transparent)}.ux-lb[hidden]{display:none}.ux-lb img{width:100%;height:100%;max-height:78vh;object-fit:contain}.ux-lb-bar{display:flex;align-items:center;gap:12px;justify-content:space-between;color:var(--text);font-size:.9rem}.ux-lb-bar button{font:inherit;padding:8px 14px;border:1px solid var(--line);border-radius:var(--r-pill,999px);background:var(--bg);color:var(--text);cursor:pointer}
.lg-btn{font:inherit;display:inline-flex;align-items:center;min-height:32px;padding:0;border:0;background:none;color:inherit;cursor:pointer}.lg-btn[aria-pressed=false]{opacity:.45;text-decoration:line-through}.chart .is-off{display:none}.chart .pt{stroke:var(--surface);stroke-width:1.5}
.ux-find{font:inherit;font-size:.9rem;width:min(320px,100%);min-height:40px;margin:0 0 12px;padding:8px 12px;border:1px solid var(--line);border-radius:var(--r);background:var(--bg);color:var(--text)}tr[hidden]{display:none}
@media (max-width:1099px){.ux-chip,.lg-btn,.ux-find{min-height:44px}.lg-btn{padding:0 4px}}
.cfg{display:grid;gap:clamp(20px,4vw,48px);grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}.cfg-panel{grid-template-columns:minmax(0,1fr)}.cfg-preview{position:relative;min-height:240px;border-radius:var(--r);overflow:hidden;background:var(--surface);border:1px solid var(--line)}.cfg-swatch{position:absolute;inset:18%;border-radius:var(--r);background:var(--cfg,var(--accent));transition:background .4s}.cfg-img{width:100%;height:100%;object-fit:cover;display:block}.cfg-form{display:grid;gap:18px}.cfg-group{border:0;margin:0;padding:0}.cfg-legend{font-weight:600;margin:0 0 8px;padding:0}.cfg-opts{display:flex;flex-wrap:wrap;gap:8px}.cfg-opt{position:relative;display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--line);border-radius:var(--r);cursor:pointer}.cfg-opt input{position:absolute;opacity:0;width:1px;height:1px}.cfg-opt:has(input:checked){border-color:var(--text);box-shadow:inset 0 0 0 1px var(--text)}.cfg-o-l{display:inline-flex;align-items:center;gap:8px}.cfg-dot{width:14px;height:14px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}.cfg-o-p{color:var(--muted);font-size:.86rem}.cfg-sum{display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding-top:12px;border-top:1px solid var(--line)}.cfg-total{font-size:1.4rem}.cfg-done{padding:10px 14px;border:1px solid var(--line);border-radius:var(--r)}
@media (max-width:760px){.cfg{grid-template-columns:minmax(0,1fr)}}
.sc{display:grid;gap:clamp(24px,4vw,56px);align-items:center;grid-template-columns:minmax(0,5fr) minmax(0,7fr)}.sc-stage{grid-template-columns:minmax(0,1fr)}.sc-stage .scene{aspect-ratio:16/9}.sc-backdrop{position:relative;grid-template-columns:minmax(0,1fr);min-height:70vh;align-content:center}.sc-backdrop .sc-fig{position:absolute;inset:0}.sc-backdrop .scene{height:100%;aspect-ratio:auto}.sc-backdrop .sc-text{position:relative;z-index:1;max-width:44ch;pointer-events:none}.sc-backdrop .sc-text .actions{pointer-events:auto}
.sc-fig{margin:0}.scene{position:relative;width:100%;aspect-ratio:1/1;color:var(--scene,var(--accent))}.scene:focus-visible{outline:2px solid var(--accent-ink);outline-offset:4px}.sc-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y}.sc-canvas:active{cursor:grabbing}.sc-poster{position:absolute;inset:8%;width:84%;height:84%}.sc-live .sc-poster{display:none}
@media (max-width:760px){.sc{grid-template-columns:minmax(0,1fr)}.sc-backdrop{min-height:56vh}}
.feed{list-style:none;margin:0;padding:0;display:grid}.feed li{padding:12px 0;border-bottom:1px solid var(--line)}.feed p{margin:0}.feed-title{font-weight:600}
.img-missing{background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--line) 60%,transparent) 0 10px,transparent 10px 20px);min-height:200px;border-radius:var(--r)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`);
  // the classic look keeps the touches its styles had
  if (L.language === 'classic') {
    add(`.eyebrow{margin-bottom:14px}.hero-sub{margin-top:20px;font-size:clamp(1.1rem,1.6vw,1.3rem)}.lede,.body-lg,.hero-sub{line-height:1.6}.actions{margin-top:28px}.h-section{margin-bottom:14px;line-height:1.1}.hero-text{max-width:780px}`);
    if (tk.style === 'editorial') add(`.sx+.sx:not(.sx-footer):not(.sx-cta){border-top:1px solid var(--line)}.eyebrow{color:var(--accent-ink)}`);
    if (tk.style === 'bold') add(`.h-hero{letter-spacing:-.035em;line-height:.98}.eyebrow{color:var(--accent-ink)}`);
    if (tk.style === 'warm') add(`.sx:nth-of-type(even):not(.sx-footer):not(.sx-nav):not([class*=tone-]){background:var(--surface)}`);
    if (tk.style === 'technical') add(`.eyebrow,.axis,.li-meta{font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}`);
  }
  return out.join('\n');
}

// ── the page ─────────────────────────────────────────────────────────

/**
 * The variant a section can really be drawn as. An image can leave the
 * moodboard after the spec named it; a variant built around that image then
 * falls back — in its markup and its class alike — instead of drawing the
 * image's empty place.
 */
function effective(s: Section, im: Images): Section {
  const fallback = NEEDS_IMAGE[s.kind]?.[s.variant];
  return fallback && !im.has(s, 0) ? { ...s, variant: fallback } : s;
}

function creditLine(ref: MoodboardRef): Credit {
  return { id: ref.id, text: creditText(ref), url: ref.sourceUrl || ref.creatorUrl, license: ref.license };
}

const NUMBERED = new Set(['features', 'split', 'gallery', 'stats', 'pricing', 'list', 'faq', 'text', 'form']);

/** The words a marquee runs: names the page lists, else its links, else its opening words. */
function marqueeWords(spec: DesignSpec): string[] {
  const logos = spec.sections.find((s) => s.kind === 'logos');
  if (logos && (logos.content.names as string[]).length >= 3) return logos.content.names as string[];
  const nav = spec.sections.find((s) => s.kind === 'nav');
  if (nav && (nav.content.links as string[]).length >= 3) return nav.content.links as string[];
  const hero = spec.sections.find((s) => s.kind === 'hero');
  const words = [hero?.content.eyebrow, nav?.content.brand, spec.title].filter((x): x is string => typeof x === 'string' && !!x.trim());
  return words.length ? words : [spec.title];
}

/** Draw a spec. `refs`: the project's moodboard references. */
export function renderDesign(spec: DesignSpec, refs: readonly MoodboardRef[], opts: RenderOptions = {}): Rendered {
  const look = spec.look ?? lookFromTokens(spec.tokens);
  const mode: MotionMode = opts.motion ?? 'static';
  const play = mode === 'play' && (look.motion?.feel ?? 'still') !== 'still';
  // a picture SocriaUX made is drawn from its recipe here, wherever the page is shown (lib/ux-v0/assets.ts)
  const im = new Images(new Map(refs.filter((r) => r.state !== 'rejected').map((r) => [r.id, r.provider === 'socriaux' && r.proc && !r.url ? { ...r, url: proceduralUri(r.proc) } : r])), look.motifs.includes('captions'));
  const app = spec.pageType === 'app-screen';
  let heroSeen = false;
  // the screen's leading heading: the first content section, when no hero or screen header leads
  const leadId = spec.sections.some((x) => x.kind === 'hero' || x.kind === 'app-header') ? null : (spec.sections.find((x) => !['nav', 'app-nav', 'footer'].includes(x.kind))?.id ?? null);
  let counter = 0;
  let turn = 0;
  let marqueeDone = !look.motifs.includes('marquee') || app;
  const blocks = spec.sections.map((s0) => {
    const s = effective(s0, im);
    const fn = SECTIONS[s.kind];
    if (!fn || !kindDef(s.kind)) return '';
    const first = s.kind === 'hero' && !heroSeen;
    if (s.kind === 'hero') heroSeen = true;
    const numbered = look.motifs.includes('numbering') && NUMBERED.has(s.kind) && !app;
    const no = numbered ? String(++counter).padStart(2, '0') : '';
    const sh = shapeAttrs(s);
    const style = [s.kind === 'stats' ? `--cols:${Math.min(4, (s.content.items as unknown[]).length)}` : '', sh.vars].filter(Boolean).join(';');
    const cols = style ? ` style="${style}"` : '';
    const tag = s.kind === 'nav' || s.kind === 'footer' || s.kind === 'app-nav' ? 'div' : 'section';
    const tone = s.tone && s.tone !== 'base' ? ` tone-${s.tone}` : '';
    const pad = s.pad && s.pad !== 'm' ? ` pad-${s.pad}` : '';
    const html = `<${tag} class="sx sx-${s.kind} v-${s.variant}${tone}${pad}${sh.cls}${responsiveClasses(s)}" data-ux-section="${esc(s.id)}"${cols}>${fn(s, s.content, { look, first, play, no, turn: turn++, im, app, lead: s.id === leadId })}</${tag}>`;
    // a running marquee follows the opening statement
    if (!marqueeDone && s.kind === 'hero') {
      marqueeDone = true;
      const words = marqueeWords(spec).map((w) => esc(String(w).replace(/\*/g, '').slice(0, 40)));
      const run = Array.from({ length: Math.max(2, Math.ceil(10 / words.length)) }, () => words.map((w) => `<span>${w}</span><i class="mq-dot"></i>`).join('')).join('');
      // when it runs, the strip is written twice so the loop is seamless
      return `${html}\n<div class="marquee" aria-hidden="true"><div class="mq-track">${play ? run + run : run}</div></div>`;
    }
    return html;
  });
  // the designer's own pictures need no credit on the page
  const credits = [...im.used.values()].filter((r) => r.provider !== 'upload' && r.provider !== 'socriaux').map(creditLine);
  const creditHtml = credits.length
    ? `<p class="credits">Images: ${credits.map((c) => (c.url ? `<a href="${esc(c.url)}" rel="noreferrer">${esc(c.text)}</a>` : esc(c.text))).join(' · ')}</p>`
    : '';
  let body = blocks.join('\n');
  if (creditHtml) body = body.includes('<!--credits-->') ? body.replace('<!--credits-->', creditHtml) : `${body}\n<div class="sx sx-credits"><div class="wrap">${creditHtml}</div></div>`;
  else body = body.replace('<!--credits-->', '');

  if (app) {
    const navIdx = spec.sections.findIndex((s) => s.kind === 'app-nav');
    const nav = navIdx >= 0 ? blocks[navIdx] : '';
    const rest = blocks.filter((_, i) => i !== navIdx).join('\n');
    // a screen with no app navigation has no sidebar column: its content is the whole screen (it used to
    // default to "sidebar" and sit in the 248px column a navigation would have had)
    const navVariant = navIdx >= 0 ? spec.sections[navIdx].variant : 'none';
    body = `<div class="app nav-${navVariant}${spec.platform === 'mobile' ? ' is-mobile' : ''}">${nav}<main>${rest}${creditHtml ? `<div class="sx">${creditHtml}</div>` : ''}</main></div>`;
  }

  if (spec.tokens.imageTreatment === 'duotone') {
    const c = spec.tokens.colors;
    const darkInk = isDark(c.background) ? c.background : c.text;
    const lightInk = mix(look.accent2 && look.language === 'poster' ? look.accent2 : c.accent, '#ffffff', isDark(c.background) ? 0.1 : 0.35);
    body = `${duotoneFilter(darkInk, lightInk)}\n${body}`;
  }

  // the scripted layer of the motion (lib/ux-v0/motion-runtime.ts), where the page plays: one sequence of points
  // pinned as a story, pictures arriving as they come into view, pictures that tilt, a chart's line drawing itself
  const marks = play ? scriptedMarks(look.motion) : { body: '', story: false, media: false, tilt: false, draw: false };
  if (marks.story && !app) {
    // the sequence the designer chose to tell as the story, else the first that can be one
    const tellable = (x: Section, i: number) => i > 0 && x.kind === 'features' && Array.isArray(x.content.items) && (x.content.items as unknown[]).length >= 3 && (x.content.items as unknown[]).length <= 6;
    const story = spec.sections.find((x, i) => x.story && tellable(x, i)) ?? spec.sections.find(tellable);
    if (story) {
      const at = `data-ux-section="${esc(story.id)}"`;
      const i0 = body.indexOf(at);
      const open = i0 >= 0 ? body.lastIndexOf('<section class="', i0) : -1;
      const end = i0 >= 0 ? body.indexOf('</section>', i0) : -1;
      if (open >= 0 && end > i0) {
        const sec = body.slice(open, end).replace('<section class="', '<section class="mo-story ').replace(/<li class="feature">/g, '<li class="feature" data-mo-step="">');
        body = body.slice(0, open) + sec + body.slice(end);
      }
    }
  }
  if (marks.media) body = body.replace(/<figure class="(g-item|split-media|cta-media|hp-media)/g, '<figure data-mo-in="" class="$1');
  if (marks.tilt) body = body.replace(/<figure (data-mo-in="" )?class="(g-item|split-media)/g, (_m, a = '', c) => `<figure ${a}data-mo-tilt="" class="${c}`);
  if (marks.draw) body = body.replace(/<svg class="chart"/g, '<svg data-mo-in="" class="chart"').replace(/<polyline class="line /g, '<polyline pathLength="1" class="mo-draw line ');

  const fonts = fontStylesheet([spec.tokens.fonts.display, spec.tokens.fonts.body, ...(look.label === 'mono' ? [look.mono] : [])]);
  const style = [css(spec.tokens, look, headlinesOf(spec)), motionCss(look, mode, { app }), responsiveCss(spec.sections)].filter(Boolean).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${plain(spec.title)}</title>
${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">` : ''}
<style>${style}</style>
</head>
<body class="s-${spec.tokens.style} look-${esc(look.language)} grid-${look.grid}${look.motion && look.motion.feel !== 'still' ? ` mo mo-${look.motion.feel}` : ''}"${marks.body}>
${body}${opts.runtime ? `\n<script>${BEHAVIOR_SOURCE}</script>\n<script>${MOTION_RUNTIME}</script>${spec.sections.some((x) => x.kind === 'scene') ? `\n<script>${SCENE_RUNTIME}</script>` : ''}` : ''}
</body>
</html>`;
  return { html, css: style, credits };
}
