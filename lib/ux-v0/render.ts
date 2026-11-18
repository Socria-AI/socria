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
import { NEEDS_IMAGE, ensureContrast, kindDef, lookFromTokens, type DesignSpec, type DesignTokens, type Look, type Section, type Shape } from './spec';
import { creditText, type MoodboardRef } from './types';
import { kineticHeadline, motionCss, type MotionMode } from './motion';

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
    return `<img class="${cls}" src="${esc(ref.url)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer" ${attr(section.id, `images.${i}`)}>`;
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
    return `<header class="wrap nav-in"><a class="brand" href="#" ${attr(s.id, 'brand')}>${t(c.brand)}</a>${links ? `<nav aria-label="Main"><ul class="nav-links">${links}</ul></nav>` : ''}${c.cta ? btn(s, 'cta', c.cta, 'primary') : ''}</header>`;
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
    const imgs = s.images.map((_, i) => `<figure class="g-item">${im.img(s, i, 'g-img')}${im.cap(s, i)}</figure>`).join('');
    const h = head(s, c, x);
    return `<div class="wrap${h ? ' has-head' : ''}">${h}<div class="g-body"><div class="gallery g-${s.variant} n-${Math.min(8, s.images.length)}">${imgs}</div>${c.caption ? `<p class="small muted caption" ${attr(s.id, 'caption')}>${t(c.caption)}</p>` : ''}</div></div>`;
  },
  quote: (s, c, x) =>
    `<div class="wrap quote q-${s.variant}">${s.variant === 'with-portrait' && x.im.has(s, 0) ? `<div class="q-portrait">${x.im.img(s, 0, 'portrait')}</div>` : ''}<figure><blockquote ${attr(s.id, 'quote')}><p>${t(c.quote)}</p></blockquote><figcaption><span class="q-author" ${attr(s.id, 'author')}>${t(c.author)}</span>${c.role ? `<span class="q-role muted" ${attr(s.id, 'role')}>${t(c.role)}</span>` : ''}</figcaption></figure></div>`,
  stats: (s, c, x) => {
    const h = head(s, c, x);
    return `<div class="wrap${h ? ' has-head' : ''}">${h}<dl class="stats st-${s.variant}">${(c.items as any[])
      .map((it, i) => `<div class="stat"><dt ${attr(s.id, `items.${i}.label`)}>${t(it.label)}</dt><dd ${attr(s.id, `items.${i}.value`)}>${t(it.value)}</dd></div>`)
      .join('')}</dl></div>`;
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
    return `<div class="wrap${h ? ' has-head' : ''}">${h}<div class="lists l-${s.variant} n-${Math.min(3, (c.groups as any[]).length)}">${(c.groups as any[])
      .map(
        (g, gi) =>
          `<div class="list-group">${g.title ? `<h3 class="h-item" ${attr(s.id, `groups.${gi}.title`)}>${t(g.title)}</h3>` : ''}<ul>${(g.items as any[])
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
    const form = `<form class="form" action="#" method="post"><div class="fields">${fields}</div><button type="submit" class="btn btn-primary" ${attr(s.id, 'submit')}>${t(c.submit)}</button>${c.note ? `<p class="small muted" ${attr(s.id, 'note')}>${t(c.note)}</p>` : ''}</form>`;
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
    return `<div class="card table-card">${c.title ? `<h2 class="h-card" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}<div class="table-scroll"><table><thead><tr>${cols.map((h, i) => `<th scope="col" ${attr(s.id, `columns.${i}`)}>${t(h)}</th>`).join('')}${extra ? '<th scope="col">Status</th>' : ''}</tr></thead><tbody>${rows
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
            return `<rect class="bar s${k}" x="${bx.toFixed(1)}" y="${y(Math.max(0, v)).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.abs(y(v) - y(0)).toFixed(1)}" rx="2"/>`;
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
        return `${area}<polyline class="line s${k}${k > 0 ? ' cmp' : ''}" points="${pts}"/>`;
      })
      .reverse()
      .join('');
  }
  const summary = series.map((se) => `${se.name}: ${se.values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`).join('; ');
  // the key draws each series as it is drawn: a swatch for the filled subject, a dashed line for a comparison
  const legend = series.length > 1 ? `<ul class="legend">${series.map((se, k) => `<li><span class="key s${k}${k > 0 && s.variant !== 'bar' ? ' key-line' : ''}" aria-hidden="true"></span>${esc(se.name)}</li>`).join('')}</ul>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${plain(`${c.title}. ${summary}`)}" ${attr(s.id, 'series')}>${grid}${marks}${xl}</svg>${legend}`;
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

  // ── base
  add(`*,*::before,*::after{box-sizing:border-box}
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
.v-centered .nav-in{justify-content:center;flex-wrap:wrap}.v-centered .nav-links{margin:0}.v-minimal .nav-links{display:none}
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

  // one column on a phone, and a column that never grows past the screen: an implicit track would widen to
  // its longest word ("DOWNLOADABLE" in poster capitals), pushing the page sideways; with a zero minimum the
  // headings' break-word takes over instead. The wider layouts below replace it.
  add(`.split,.hero-split,.hs-foot,.hp-row,.features,.lists,.plans,.cta-image,.cta-statement,.cs-row,.form-wrap,.tb-two-column,.q-with-portrait,.foot{grid-template-columns:minmax(0,1fr)}`);

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
.nav-links{display:none}.nav-in .btn{margin-left:auto}
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
  const im = new Images(new Map(refs.filter((r) => r.state !== 'rejected').map((r) => [r.id, r])), look.motifs.includes('captions'));
  const app = spec.pageType === 'app-screen';
  let heroSeen = false;
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
    const cols = s.kind === 'stats' ? ` style="--cols:${Math.min(4, (s.content.items as unknown[]).length)}"` : '';
    const tag = s.kind === 'nav' || s.kind === 'footer' || s.kind === 'app-nav' ? 'div' : 'section';
    const tone = s.tone && s.tone !== 'base' ? ` tone-${s.tone}` : '';
    const pad = s.pad && s.pad !== 'm' ? ` pad-${s.pad}` : '';
    const html = `<${tag} class="sx sx-${s.kind} v-${s.variant}${tone}${pad}" data-ux-section="${esc(s.id)}"${cols}>${fn(s, s.content, { look, first, play, no, turn: turn++, im })}</${tag}>`;
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
  const credits = [...im.used.values()].filter((r) => r.provider !== 'upload').map(creditLine);
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
    const navVariant = navIdx >= 0 ? spec.sections[navIdx].variant : 'sidebar';
    body = `<div class="app nav-${navVariant}${spec.platform === 'mobile' ? ' is-mobile' : ''}">${nav}<main>${rest}${creditHtml ? `<div class="sx">${creditHtml}</div>` : ''}</main></div>`;
  }

  if (spec.tokens.imageTreatment === 'duotone') {
    const c = spec.tokens.colors;
    const darkInk = isDark(c.background) ? c.background : c.text;
    const lightInk = mix(look.accent2 && look.language === 'poster' ? look.accent2 : c.accent, '#ffffff', isDark(c.background) ? 0.1 : 0.35);
    body = `${duotoneFilter(darkInk, lightInk)}\n${body}`;
  }

  const fonts = fontStylesheet([spec.tokens.fonts.display, spec.tokens.fonts.body, ...(look.label === 'mono' ? [look.mono] : [])]);
  const style = [css(spec.tokens, look, headlinesOf(spec)), motionCss(look, mode, { app })].filter(Boolean).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${plain(spec.title)}</title>
${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">` : ''}
<style>${style}</style>
</head>
<body class="s-${spec.tokens.style} look-${esc(look.language)} grid-${look.grid}${look.motion && look.motion.feel !== 'still' ? ` mo mo-${look.motion.feel}` : ''}">
${body}
</body>
</html>`;
  return { html, css: style, credits };
}
