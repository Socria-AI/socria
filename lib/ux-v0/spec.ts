// lib/ux-v0/spec.ts — a generated design, as data: tokens and sections.
//
// THE CONTROLLED PIPELINE (docs/SOCRIAUX-V0.md, D3). The model never writes
// HTML or JavaScript. It writes a DesignSpec: design tokens (palette, type
// pair, scale, radius, style) and an ordered list of sections, each one of a
// known kind with a known variant and typed content. lib/ux-v0/render turns
// that into HTML and CSS. So a generated design is always safe to render,
// always inspectable (every element knows the section and field it came
// from), cheap to change (a patch touches one section or one token), and
// deterministic to test.
//
// THE LIBRARY is declared once, below, as data: the same table validates what
// the model returns, describes the library to the model, and is what the
// renderer implements. A kind or field the table does not have cannot reach
// the page.

import { contrastRatio } from '../ux/audit';
import { bodyFont, displayFont, knownFont } from './fonts';
import type { Moodboard, PageType, Platform } from './types';

// ── fields ───────────────────────────────────────────────────────────

type Field =
  | { t: 'text'; max: number; req?: boolean }
  | { t: 'texts'; max: number; n: [number, number]; req?: boolean }
  | { t: 'nums'; n: [number, number]; req?: boolean }
  | { t: 'enum'; values: readonly string[]; req?: boolean }
  | { t: 'bool' }
  | { t: 'list'; n: [number, number]; item: Record<string, Field>; req?: boolean };

export const ICONS = [
  'spark', 'leaf', 'cup', 'clock', 'map', 'shield', 'heart', 'users', 'chart', 'book', 'calendar', 'star',
  'check', 'bolt', 'globe', 'phone', 'mail', 'camera', 'music', 'code', 'layers', 'compass', 'home', 'search',
] as const;

const T = (max: number, req = false): Field => ({ t: 'text', max, req });
const TS = (max: number, min: number, n: number, req = false): Field => ({ t: 'texts', max, n: [min, n], req });

export interface KindDef {
  kind: string;
  label: string;
  pages: readonly PageType[];
  variants: readonly string[];
  /** how many moodboard images it takes */
  images: [number, number];
  fields: Record<string, Field>;
  note: string;
}

const BOTH: readonly PageType[] = ['website', 'app-screen'];
const WEB: readonly PageType[] = ['website'];
const APP: readonly PageType[] = ['app-screen'];

export const LIBRARY: readonly KindDef[] = [
  { kind: 'nav', label: 'Navigation', pages: WEB, variants: ['inline', 'centered', 'minimal'], images: [0, 0], note: 'top bar: brand, up to 6 links, optional button',
    fields: { brand: T(40, true), links: TS(24, 0, 6), cta: T(30) } },
  { kind: 'hero', label: 'Hero', pages: WEB, variants: ['split', 'centered', 'full-bleed', 'editorial', 'statement', 'poster'], images: [0, 1], note: 'the opening statement; full-bleed and split want an image; statement is type alone, very large; poster is huge type with an image set against it',
    fields: { eyebrow: T(48), title: T(120, true), subtitle: T(320), primary: T(30), secondary: T(30), note: T(140) } },
  { kind: 'features', label: 'Features', pages: BOTH, variants: ['grid', 'list', 'numbered', 'index', 'columns'], images: [0, 0], note: '2–8 points, each a title and a sentence, optional icon; index is a ruled table of contents, columns is text set in ruled columns',
    fields: { eyebrow: T(48), title: T(110), intro: T(320), items: { t: 'list', n: [2, 8], req: true, item: { title: T(60, true), text: T(240), icon: { t: 'enum', values: ICONS } } } } },
  { kind: 'split', label: 'Image and text', pages: WEB, variants: ['image-left', 'image-right'], images: [0, 1], note: 'a story beside one image',
    fields: { eyebrow: T(48), title: T(110, true), text: T(600), bullets: TS(110, 0, 6), cta: T(30) } },
  { kind: 'gallery', label: 'Gallery', pages: WEB, variants: ['grid', 'mosaic', 'strip'], images: [2, 8], note: '2–8 moodboard images',
    fields: { eyebrow: T(48), title: T(110), caption: T(220) } },
  { kind: 'quote', label: 'Quote', pages: WEB, variants: ['large', 'with-portrait', 'pull'], images: [0, 1], note: 'one testimonial or statement; pull is a large left-set pull quote',
    fields: { quote: T(420, true), author: T(60, true), role: T(90) } },
  { kind: 'stats', label: 'Figures', pages: WEB, variants: ['row', 'band', 'giant'], images: [0, 0], note: '2–6 figures; giant sets them as huge numerals; unknown figures are [bracketed placeholders]',
    fields: { title: T(110), items: { t: 'list', n: [2, 6], req: true, item: { value: T(18, true), label: T(70, true) } } } },
  { kind: 'logos', label: 'Names', pages: WEB, variants: ['row'], images: [0, 0], note: 'partner or press names, set as words',
    fields: { title: T(80), names: TS(32, 3, 8, true) } },
  { kind: 'pricing', label: 'Pricing', pages: WEB, variants: ['cards'], images: [0, 0], note: '1–4 plans',
    fields: { title: T(110), intro: T(300), plans: { t: 'list', n: [1, 4], req: true, item: { name: T(30, true), price: T(22, true), period: T(22), features: TS(90, 0, 8), cta: T(26), featured: { t: 'bool' } } } } },
  { kind: 'list', label: 'List', pages: BOTH, variants: ['menu', 'schedule', 'simple'], images: [0, 0], note: 'menus, timetables, events, team: groups of named items',
    fields: { eyebrow: T(48), title: T(110), intro: T(300), groups: { t: 'list', n: [1, 6], req: true, item: { title: T(60), items: { t: 'list', n: [1, 12], req: true, item: { name: T(70, true), meta: T(70), price: T(18), text: T(220) } } } } } },
  { kind: 'faq', label: 'Questions', pages: WEB, variants: ['accordion', 'two-column'], images: [0, 0], note: '2–10 questions and answers',
    fields: { title: T(110), items: { t: 'list', n: [2, 10], req: true, item: { q: T(150, true), a: T(520, true) } } } },
  { kind: 'cta', label: 'Call to action', pages: WEB, variants: ['band', 'centered', 'image', 'statement'], images: [0, 1], note: 'one decisive invitation; statement is a very large headline with no box',
    fields: { title: T(120, true), text: T(280), primary: T(30, true), secondary: T(30) } },
  { kind: 'form', label: 'Form', pages: BOTH, variants: ['stacked', 'split'], images: [0, 0], note: 'every field has a visible label',
    fields: { title: T(110, true), intro: T(320), fields: { t: 'list', n: [1, 10], req: true, item: { label: T(48, true), type: { t: 'enum', values: ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'date', 'number'] }, placeholder: T(60), options: TS(40, 0, 8), required: { t: 'bool' } } }, submit: T(30, true), note: T(180) } },
  { kind: 'text', label: 'Text', pages: BOTH, variants: ['narrow', 'two-column', 'lead'], images: [0, 0], note: 'an about or story block; lead sets the first paragraph large',
    fields: { eyebrow: T(48), title: T(120), paragraphs: TS(900, 1, 6, true) } },
  { kind: 'footer', label: 'Footer', pages: WEB, variants: ['simple', 'columns'], images: [0, 0], note: 'brand, columns of links, legal line',
    fields: { brand: T(40, true), tagline: T(160), columns: { t: 'list', n: [0, 4], item: { title: T(30), links: TS(30, 1, 6, true) } }, legal: T(180) } },
  { kind: 'app-nav', label: 'App navigation', pages: APP, variants: ['sidebar', 'topbar', 'tabbar'], images: [0, 0], note: 'the app’s own navigation; tabbar for mobile',
    fields: { brand: T(30, true), items: TS(24, 2, 7, true), active: T(24), user: T(30) } },
  { kind: 'app-header', label: 'Screen header', pages: APP, variants: ['default'], images: [0, 0], note: 'the screen’s title and actions',
    fields: { title: T(80, true), subtitle: T(180), actions: TS(24, 0, 3), search: { t: 'bool' } } },
  { kind: 'stat-cards', label: 'Figures', pages: APP, variants: ['default'], images: [0, 0], note: '2–6 key figures with change',
    fields: { items: { t: 'list', n: [2, 6], req: true, item: { label: T(40, true), value: T(20, true), delta: T(20), trend: { t: 'enum', values: ['up', 'down', 'flat'] } } } } },
  { kind: 'chart', label: 'Chart', pages: APP, variants: ['line', 'bar', 'area'], images: [0, 0], note: 'drawn from its own data',
    fields: { title: T(80, true), labels: TS(14, 2, 14, true), series: { t: 'list', n: [1, 3], req: true, item: { name: T(30, true), values: { t: 'nums', n: [2, 14], req: true } } }, note: T(140) } },
  { kind: 'table', label: 'Table', pages: APP, variants: ['default'], images: [0, 0], note: 'up to 12 rows',
    fields: { title: T(80), columns: TS(30, 2, 7, true), rows: { t: 'list', n: [1, 12], req: true, item: { cells: TS(60, 1, 7, true), status: T(22) } } } },
  { kind: 'feed', label: 'Activity', pages: APP, variants: ['default'], images: [0, 0], note: 'recent events',
    fields: { title: T(80), items: { t: 'list', n: [1, 10], req: true, item: { title: T(110, true), meta: T(60), text: T(220) } } } },
];

export const KINDS = LIBRARY.map((k) => k.kind);

/** The variants drawn around an image, and what each becomes without one. */
export const NEEDS_IMAGE: Record<string, Record<string, string>> = {
  hero: { split: 'centered', 'full-bleed': 'centered' },
  cta: { image: 'band' },
  quote: { 'with-portrait': 'large' },
};
export type SectionKind = string;
const DEF = new Map(LIBRARY.map((k) => [k.kind, k]));
export const kindDef = (kind: string): KindDef | null => DEF.get(kind) ?? null;

// ── tokens ───────────────────────────────────────────────────────────

export interface DesignTokens {
  colors: { background: string; surface: string; text: string; muted: string; accent: string; accentText: string; line: string };
  fonts: { display: string; body: string };
  scale: 'compact' | 'comfortable' | 'spacious';
  radius: 'none' | 'soft' | 'round';
  style: 'editorial' | 'minimal' | 'bold' | 'warm' | 'technical';
  imageTreatment: (typeof TREATMENTS)[number];
}

export const SCALES = ['compact', 'comfortable', 'spacious'] as const;
export const RADII = ['none', 'soft', 'round'] as const;
export const STYLES = ['editorial', 'minimal', 'bold', 'warm', 'technical'] as const;
export const TREATMENTS = ['natural', 'muted', 'warm', 'mono', 'duotone', 'contrast'] as const;

export interface Section {
  id: string;
  kind: SectionKind;
  variant: string;
  content: Record<string, any>;
  /** moodboard reference ids */
  images: string[];
  /** the ground it sits on: the page's own, the alternate, the accent, the second accent, or inverted */
  tone?: Tone;
  /** its share of space: small, medium, large */
  pad?: Pad;
  /** chosen by the person (a variant or a tone they set): the layout planner leaves it alone */
  fixed?: boolean;
}

export interface DesignSpec {
  version: number;
  pageType: PageType;
  platform: Platform;
  title: string;
  tokens: DesignTokens;
  /** the art direction's visual language, as the renderer reads it */
  look: Look;
  sections: Section[];
  /** what the pipeline changed on its own (a colour darkened for contrast), said plainly */
  notes: string[];
  /** what produced this version */
  reason: string;
  createdAt: number;
}

// ── small helpers (local: types.ts imports this file) ────────────────

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v).slice(0, max) : '');
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : fallback);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const hx = (v: unknown, fallback: string): string => {
  if (typeof v !== 'string' || !HEX.test(v.trim())) return fallback;
  const h = v.trim().toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};

/** Mix a colour toward black or white, a step at a time, until it meets the ratio against `bg`. */
export function ensureContrast(fg: string, bg: string, ratio: number): string {
  if (contrastRatio(fg, bg) >= ratio) return fg;
  const toward = contrastRatio('#000000', bg) >= contrastRatio('#ffffff', bg) ? 0 : 255;
  const rgb = [1, 3, 5].map((i) => parseInt(fg.slice(i, i + 2), 16));
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const mixed = `#${rgb.map((c) => Math.round(c + (toward - c) * t).toString(16).padStart(2, '0')).join('')}`;
    if (contrastRatio(mixed, bg) >= ratio) return mixed;
  }
  return toward === 0 ? '#000000' : '#ffffff';
}

export const DEFAULT_TOKENS: DesignTokens = {
  colors: { background: '#f6f3ec', surface: '#ffffff', text: '#1d1d1b', muted: '#5c5a52', accent: '#2f3d1e', accentText: '#ffffff', line: '#d9d4c7' },
  fonts: { display: 'Fraunces', body: 'Inter' },
  scale: 'comfortable',
  radius: 'soft',
  style: 'editorial',
  imageTreatment: 'natural',
};

/** Tokens the page can be drawn with: valid colours, known fonts, and text that can be read. */
export function normalizeTokens(v: unknown, notes: string[] = []): DesignTokens {
  const r = o(v);
  const c = o(r.colors);
  const d = DEFAULT_TOKENS.colors;
  const background = hx(c.background, d.background);
  const surface = hx(c.surface, contrastRatio(background, '#ffffff') < 1.08 ? '#f2efe8' : '#ffffff');
  const rawText = hx(c.text, d.text);
  const text = ensureContrast(rawText, background, 7);
  if (text !== rawText) notes.push(`Body text darkened from ${rawText} to ${text} so it reads at 7:1 on the background.`);
  const rawMuted = hx(c.muted, d.muted);
  const muted = ensureContrast(rawMuted, background, 4.5);
  if (muted !== rawMuted) notes.push(`Secondary text adjusted from ${rawMuted} to ${muted} to meet 4.5:1.`);
  const accent = hx(c.accent, d.accent);
  const rawAccentText = hx(c.accentText, contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111');
  const accentText = contrastRatio(rawAccentText, accent) >= 4.5 ? rawAccentText : contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111';
  if (accentText !== rawAccentText) notes.push(`Button text set to ${accentText} so labels read on the accent colour.`);
  if (contrastRatio(accent, background) < 3) notes.push(`The accent ${accent} is faint against the background (${contrastRatio(accent, background).toFixed(1)}:1); it is used for fills, not for text.`);
  const f = o(r.fonts);
  return {
    colors: { background, surface, text, muted, accent, accentText, line: hx(c.line, d.line) },
    fonts: { display: displayFont(f.display), body: bodyFont(f.body) },
    scale: pick(r.scale, SCALES, 'comfortable'),
    radius: pick(r.radius, RADII, 'soft'),
    style: pick(r.style, STYLES, 'editorial'),
    imageTreatment: pick(r.imageTreatment, TREATMENTS, 'natural'),
  };
}

// ── the look: how the page is composed, not just coloured ─────────────
//
// Tokens say which colours and faces; the look says what the page does with
// them — the type scale and its case, the grid the sections sit on, whether
// things are boxed, ruled or open, what a button is, how pictures are framed,
// and the few motifs that make a page recognisably one thing. An art
// direction (lib/ux-v0/direction.ts) writes it; the renderer reads nothing
// else. A spec from before looks existed is drawn with lookFromTokens: the
// "classic" look, the renderer it was made with.

export const GRIDS = ['stack', 'editorial', 'swiss', 'centered', 'asymmetric', 'poster', 'modular'] as const;
export const ALIGNS = ['left', 'center'] as const;
export const WIDTHS = ['narrow', 'standard', 'wide'] as const;
export const RHYTHMS = ['even', 'dramatic'] as const;
export const CASES = ['sentence', 'upper'] as const;
export const TRACKINGS = ['tight', 'normal', 'wide'] as const;
export const EMPHASES = ['italic', 'accent', 'underline', 'highlight', 'none'] as const;
export const LABELS = ['caps', 'sentence', 'mono', 'rule', 'quiet'] as const;
export const CONTAINERS = ['open', 'ruled', 'cards', 'bands', 'framed'] as const;
export const RULES = ['none', 'hairline', 'heavy'] as const;
export const BUTTONS = ['solid', 'pill', 'outline', 'underline', 'block', 'offset'] as const;
export const FRAMES = ['plain', 'inset', 'arch', 'circle', 'offset'] as const;
export const MOTIFS = ['numbering', 'shapes', 'marquee', 'captions', 'big-numerals', 'pull-quote', 'icons'] as const;
export const SHAPES = ['circle', 'arch', 'square', 'quarter', 'diamond', 'blob'] as const;
export const TONES = ['base', 'alt', 'accent', 'accent2', 'invert'] as const;
export const PADS = ['s', 'm', 'l'] as const;

// ── motion: how the page moves, as part of its look ──────────────────
// Written by the renderer as CSS only (lib/ux-v0/motion.ts): no scripts, so it
// plays in the sealed preview and in the exported page alike, and every rule
// has a reduced-motion alternative.

export const MOTION_FEELS = ['still', 'calm', 'measured', 'lively', 'kinetic'] as const;
/** how content arrives as it scrolls into view */
export const ENTRANCES = ['none', 'fade', 'rise', 'slide', 'scale', 'mask'] as const;
/** how the opening headline arrives: kinetic typography */
export const HEADLINES = ['none', 'fade', 'mask', 'words', 'letters'] as const;
export const HOVERS = ['none', 'lift', 'underline', 'invert', 'zoom'] as const;
export const EASES = ['gentle', 'out', 'expo', 'snap', 'linear'] as const;
/** how coloured sections arrive */
export const SECTION_MOTIONS = ['none', 'wipe', 'expand'] as const;

export interface Motion {
  feel: (typeof MOTION_FEELS)[number];
  /** how long an arrival takes, ms */
  duration: number;
  /** between words, letters and items in a row, ms */
  stagger: number;
  /** how far things travel as they arrive, px */
  distance: number;
  ease: (typeof EASES)[number];
  entrance: (typeof ENTRANCES)[number];
  headline: (typeof HEADLINES)[number];
  /** arrivals follow the scroll (CSS scroll-driven animation) rather than only the first screen */
  scroll: boolean;
  /** depth of layered parallax on pictures and shapes, 0–3 */
  parallax: number;
  hover: (typeof HOVERS)[number];
  sections: (typeof SECTION_MOTIONS)[number];
  /** the navigation stays and condenses as the page scrolls */
  nav: boolean;
}

/** No motion: what older designs, and anything that asks for stillness, are drawn with. */
export const STILL_MOTION: Motion = { feel: 'still', duration: 0, stagger: 0, distance: 0, ease: 'out', entrance: 'none', headline: 'none', scroll: false, parallax: 0, hover: 'none', sections: 'none', nav: false };

export function normalizeMotion(v: unknown, base: Motion = STILL_MOTION): Motion {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const n = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.max(lo, Math.min(hi, x))) : d);
  const p = <T extends string>(x: unknown, allowed: readonly T[], d: T): T => ((allowed as readonly string[]).includes(x as string) ? (x as T) : d);
  return {
    feel: p(r.feel, MOTION_FEELS, base.feel),
    duration: n(r.duration, 0, 1800, base.duration),
    stagger: n(r.stagger, 0, 240, base.stagger),
    distance: n(r.distance, 0, 80, base.distance),
    ease: p(r.ease, EASES, base.ease),
    entrance: p(r.entrance, ENTRANCES, base.entrance),
    headline: p(r.headline, HEADLINES, base.headline),
    scroll: typeof r.scroll === 'boolean' ? r.scroll : base.scroll,
    parallax: n(r.parallax, 0, 3, base.parallax),
    hover: p(r.hover, HOVERS, base.hover),
    sections: p(r.sections, SECTION_MOTIONS, base.sections),
    nav: typeof r.nav === 'boolean' ? r.nav : base.nav,
  };
}

export type Grid = (typeof GRIDS)[number];
export type Motif = (typeof MOTIFS)[number];
export type Shape = (typeof SHAPES)[number];
export type Tone = (typeof TONES)[number];
export type Pad = (typeof PADS)[number];

export interface Look {
  /** the visual language it came from (lib/ux-v0/direction.ts), or "classic" */
  language: string;
  /** the modular type scale: each step is this times the one below */
  ratio: number;
  /** the display face's weight */
  weight: number;
  case: (typeof CASES)[number];
  tracking: (typeof TRACKINGS)[number];
  /** how a *word* the copy emphasises is set */
  emphasis: (typeof EMPHASES)[number];
  /** how small labels (eyebrows, figure labels) are set */
  label: (typeof LABELS)[number];
  /** the mono face labels use when label is "mono" */
  mono: string;
  grid: Grid;
  align: (typeof ALIGNS)[number];
  width: (typeof WIDTHS)[number];
  rhythm: (typeof RHYTHMS)[number];
  containers: (typeof CONTAINERS)[number];
  rules: (typeof RULES)[number];
  buttons: (typeof BUTTONS)[number];
  frame: (typeof FRAMES)[number];
  motifs: Motif[];
  shapes: Shape[];
  /** a second ink, for languages that print in two colours; "" for none */
  accent2: string;
  /** how it moves */
  motion: Motion;
}

/** The renderer as it was before looks: what an older spec is drawn with. */
export function lookFromTokens(tk: DesignTokens): Look {
  return {
    language: 'classic',
    ratio: 1.36,
    weight: tk.style === 'bold' ? 700 : tk.style === 'minimal' || tk.style === 'technical' ? 500 : 400,
    case: 'sentence',
    tracking: 'tight',
    emphasis: 'accent',
    label: tk.style === 'technical' ? 'mono' : 'caps',
    mono: 'IBM Plex Mono',
    grid: 'stack',
    align: 'left',
    width: 'standard',
    rhythm: 'even',
    containers: tk.style === 'warm' ? 'bands' : tk.style === 'editorial' ? 'ruled' : 'open',
    rules: 'hairline',
    buttons: tk.radius === 'round' ? 'pill' : 'solid',
    frame: 'plain',
    motifs: ['icons'],
    shapes: [],
    accent2: '',
    motion: { ...STILL_MOTION },
  };
}

const LANG_ID = /^[a-z][a-z0-9-]{1,30}$/;

/** Any value into a look the renderer can draw, filling gaps from `base`. */
export function normalizeLook(v: unknown, base: Look): Look {
  const r = o(v);
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
  const list = <T extends string>(x: unknown, allowed: readonly T[], d: T[]): T[] =>
    Array.isArray(x) ? [...new Set(x.filter((y): y is T => (allowed as readonly string[]).includes(y as string)))].slice(0, allowed.length) : d;
  const mono = typeof r.mono === 'string' && /mono/i.test(r.mono) && knownFont(r.mono) ? knownFont(r.mono)!.name : base.mono;
  return {
    language: typeof r.language === 'string' && LANG_ID.test(r.language) ? r.language : base.language,
    ratio: Math.round(num(r.ratio, 1.15, 1.7, base.ratio) * 1000) / 1000,
    weight: Math.round(num(r.weight, 100, 900, base.weight) / 50) * 50,
    case: pick(r.case, CASES, base.case),
    tracking: pick(r.tracking, TRACKINGS, base.tracking),
    emphasis: pick(r.emphasis, EMPHASES, base.emphasis),
    label: pick(r.label, LABELS, base.label),
    mono,
    grid: pick(r.grid, GRIDS, base.grid),
    align: pick(r.align, ALIGNS, base.align),
    width: pick(r.width, WIDTHS, base.width),
    rhythm: pick(r.rhythm, RHYTHMS, base.rhythm),
    containers: pick(r.containers, CONTAINERS, base.containers),
    rules: pick(r.rules, RULES, base.rules),
    buttons: pick(r.buttons, BUTTONS, base.buttons),
    frame: pick(r.frame, FRAMES, base.frame),
    motifs: list(r.motifs, MOTIFS, base.motifs),
    shapes: list(r.shapes, SHAPES, base.shapes),
    accent2: r.accent2 === '' ? '' : hx(r.accent2, base.accent2 || '') ,
    motion: normalizeMotion(r.motion, base.motion ?? STILL_MOTION),
  };
}

// ── validating content against the library ───────────────────────────

function readField(f: Field, v: unknown): unknown {
  switch (f.t) {
    case 'text':
      return s(v, f.max);
    case 'texts': {
      const out = a(v).map((x) => s(x, f.max)).filter(Boolean).slice(0, f.n[1]);
      return out;
    }
    case 'nums':
      return a(v)
        .map((x) => (typeof x === 'number' ? x : parseFloat(String(x))))
        .filter((x) => Number.isFinite(x))
        .map((x) => Math.round(x * 100) / 100)
        .slice(0, f.n[1]);
    case 'enum':
      return (f.values as readonly string[]).includes(v as string) ? v : '';
    case 'bool':
      return v === true;
    case 'list':
      return a(v)
        .map((item) => readFields(f.item, item))
        .filter((x): x is Record<string, unknown> => !!x)
        .slice(0, f.n[1]);
  }
}

function ok(f: Field, v: unknown): boolean {
  switch (f.t) {
    case 'text':
      return !f.req || !!v;
    case 'texts':
    case 'nums':
    case 'list':
      return (v as unknown[]).length >= (f.req ? Math.max(1, f.n[0]) : f.n[0]) || (!f.req && (v as unknown[]).length === 0);
    default:
      return true;
  }
}

function readFields(fields: Record<string, Field>, v: unknown): Record<string, unknown> | null {
  const r = o(v);
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(fields)) {
    const val = readField(f, r[k]);
    if (!ok(f, val)) return null;
    out[k] = val;
  }
  return out;
}

const SECTION_ID = /^[a-z][a-z0-9-]{0,40}$/;

/** One section, made valid — or null with nothing to draw. `imageIds`: the references it may use. */
export function normalizeSection(v: unknown, pageType: PageType, imageIds: ReadonlySet<string> | null, taken: Set<string> = new Set()): Section | null {
  const r = o(v);
  const def = kindDef(s(r.kind, 30));
  if (!def || !def.pages.includes(pageType)) return null;
  const content = readFields(def.fields, r.content);
  if (!content) return null;
  let images = a(r.images)
    .filter((x): x is string => typeof x === 'string' && (!imageIds || imageIds.has(x)))
    .slice(0, def.images[1]);
  images = [...new Set(images)];
  if (images.length < def.images[0]) return null;
  let variant = pick(r.variant, def.variants, def.variants[0]);
  // a variant built around an image it does not have falls back to one that needs none — by kind,
  // so a form's "split" (its intro beside the fields) is never mistaken for a hero's
  const fallback = NEEDS_IMAGE[def.kind]?.[variant];
  if (!images.length && fallback) variant = fallback;
  let id = SECTION_ID.test(String(r.id ?? '')) ? String(r.id) : def.kind;
  if (taken.has(id)) {
    let n = 2;
    while (taken.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  taken.add(id);
  const sec: Section = { id, kind: def.kind, variant, content, images };
  if ((TONES as readonly string[]).includes(r.tone)) sec.tone = r.tone as Tone;
  if ((PADS as readonly string[]).includes(r.pad)) sec.pad = r.pad as Pad;
  if (r.fixed === true) sec.fixed = true;
  return sec;
}

/** The ids a spec's sections may draw on: references on the moodboard that were not rejected. */
export function usableImages(m: Moodboard | null | undefined): Set<string> | null {
  if (!m) return null;
  return new Set(m.refs.filter((x) => x.state !== 'rejected').map((x) => x.id));
}

/** Any document into a spec the renderer can draw — or null when there is nothing valid to draw. */
export function normalizeSpec(v: unknown, moodboard?: Moodboard | null): DesignSpec | null {
  const r = o(v);
  const pageType = pick(r.pageType, ['website', 'app-screen'] as const, 'website');
  const notes = a(r.notes).map((x) => s(x, 240)).filter(Boolean).slice(0, 8);
  const tokens = normalizeTokens(r.tokens, notes);
  const taken = new Set<string>();
  const ids = usableImages(moodboard);
  let sections = a(r.sections)
    .slice(0, 16)
    .map((x) => normalizeSection(x, pageType, ids, taken))
    .filter((x): x is Section => !!x);
  if (!sections.length) return null;
  // structure the reader expects: navigation first, footer last
  const first = pageType === 'website' ? 'nav' : 'app-nav';
  const navs = sections.filter((x) => x.kind === first).slice(0, 1);
  const footers = sections.filter((x) => x.kind === 'footer').slice(0, 1);
  sections = [...navs, ...sections.filter((x) => x.kind !== first && x.kind !== 'footer'), ...footers];
  return {
    version: Math.max(1, Math.round(Number(r.version) || 1)),
    pageType,
    platform: pick(r.platform, ['web', 'mobile'] as const, pageType === 'app-screen' && r.platform === 'mobile' ? 'mobile' : 'web'),
    title: s(r.title, 100) || 'Untitled design',
    tokens,
    look: r.look && typeof r.look === 'object' ? normalizeLook(r.look, lookFromTokens(tokens)) : lookFromTokens(tokens),
    sections,
    notes: [...new Set(notes)].slice(0, 8),
    reason: s(r.reason, 200),
    createdAt: typeof r.createdAt === 'number' && r.createdAt > 0 ? Math.round(r.createdAt) : Date.now(),
  };
}

// ── patches: iteration that touches only what was asked ───────────────

export type PatchOp = 'tokens' | 'look' | 'content' | 'variant' | 'tone' | 'replace' | 'add' | 'remove' | 'move' | 'images' | 'none';
export const PATCH_OPS: readonly PatchOp[] = ['tokens', 'look', 'content', 'variant', 'tone', 'replace', 'add', 'remove', 'move', 'images', 'none'];

export interface Patch {
  op: PatchOp;
  sectionId?: string;
  tokens?: Record<string, any>;
  look?: Record<string, any>;
  content?: Record<string, any>;
  variant?: string;
  tone?: string;
  pad?: string;
  section?: Record<string, any>;
  after?: string | null;
  to?: number;
  images?: string[];
  /** one line: what the change is */
  summary: string;
}

export function normalizePatch(v: unknown): Patch {
  const r = o(v);
  const op = pick(r.op, PATCH_OPS, 'none');
  return {
    op,
    sectionId: typeof r.sectionId === 'string' ? r.sectionId.slice(0, 48) : undefined,
    tokens: r.tokens && typeof r.tokens === 'object' ? o(r.tokens) : undefined,
    look: r.look && typeof r.look === 'object' ? o(r.look) : undefined,
    tone: typeof r.tone === 'string' ? r.tone.slice(0, 12) : undefined,
    pad: typeof r.pad === 'string' ? r.pad.slice(0, 2) : undefined,
    content: r.content && typeof r.content === 'object' ? o(r.content) : undefined,
    variant: typeof r.variant === 'string' ? r.variant.slice(0, 30) : undefined,
    section: r.section && typeof r.section === 'object' ? o(r.section) : undefined,
    after: typeof r.after === 'string' ? r.after.slice(0, 48) : r.after === null ? null : undefined,
    to: typeof r.to === 'number' && Number.isFinite(r.to) ? Math.round(r.to) : undefined,
    images: Array.isArray(r.images) ? r.images.filter((x: unknown): x is string => typeof x === 'string').slice(0, 8) : undefined,
    summary: s(r.summary, 200),
  };
}

export type PatchResult = { ok: true; spec: DesignSpec; touched: string[] } | { ok: false; error: string };

/**
 * Apply one patch, deterministically. Returns the next version, or why it could
 * not be applied (the version shown does not change).
 */
export function applyPatch(spec: DesignSpec, patchIn: Patch, moodboard?: Moodboard | null): PatchResult {
  const p = normalizePatch(patchIn);
  const ids = usableImages(moodboard);
  const idx = p.sectionId ? spec.sections.findIndex((x) => x.id === p.sectionId) : -1;
  const target = idx >= 0 ? spec.sections[idx] : null;
  const next = (sections: Section[], tokens: DesignTokens = spec.tokens, notes: string[] = spec.notes, touched: string[] = [], look: Look = spec.look ?? lookFromTokens(spec.tokens)): PatchResult => ({
    ok: true,
    spec: { ...spec, sections, tokens, look, notes, version: spec.version + 1, reason: p.summary || p.op, createdAt: Date.now() },
    touched,
  });
  // a section the person changed keeps what they chose: the layout planner leaves it alone
  const held = (sec: Section, from: Section): Section => ({ ...sec, tone: sec.tone ?? from.tone, pad: sec.pad ?? from.pad, fixed: true });
  const needTarget = (): PatchResult | null => (target ? null : { ok: false, error: 'That section is not in the design.' });

  switch (p.op) {
    case 'none':
      return { ok: false, error: 'No change was asked for.' };
    case 'tokens': {
      if (!p.tokens) return { ok: false, error: 'No tokens to change.' };
      const notes: string[] = [];
      const merged = normalizeTokens(
        {
          ...spec.tokens,
          ...p.tokens,
          colors: { ...spec.tokens.colors, ...o(p.tokens.colors) },
          fonts: { ...spec.tokens.fonts, ...o(p.tokens.fonts) },
        },
        notes
      );
      return next(spec.sections, merged, [...new Set([...spec.notes, ...notes])].slice(-8), []);
    }
    case 'look': {
      if (!p.look) return { ok: false, error: 'No look to change.' };
      const base = spec.look ?? lookFromTokens(spec.tokens);
      const look = normalizeLook({ ...base, ...p.look }, base);
      return next(spec.sections, undefined, undefined, [], look);
    }
    case 'content': {
      const miss = needTarget();
      if (miss) return miss;
      const sec = normalizeSection({ ...target, content: { ...target!.content, ...o(p.content) } }, spec.pageType, ids, new Set());
      if (!sec) return { ok: false, error: 'The changed content does not fit that section.' };
      sec.id = target!.id;
      return next(spec.sections.map((x, i) => (i === idx ? sec : x)), undefined, undefined, [sec.id]);
    }
    case 'variant': {
      const miss = needTarget();
      if (miss) return miss;
      const def = kindDef(target!.kind)!;
      if (!p.variant || !def.variants.includes(p.variant)) return { ok: false, error: `${def.label} has no "${p.variant ?? ''}" variant.` };
      const sec = normalizeSection({ ...target, variant: p.variant }, spec.pageType, ids, new Set());
      if (!sec) return { ok: false, error: 'That variant does not fit the section.' };
      sec.id = target!.id;
      return next(spec.sections.map((x, i) => (i === idx ? held(sec, target!) : x)), undefined, undefined, [sec.id]);
    }
    case 'tone': {
      const miss = needTarget();
      if (miss) return miss;
      const tone = (TONES as readonly string[]).includes(p.tone ?? '') ? (p.tone as Tone) : undefined;
      const pad = (PADS as readonly string[]).includes(p.pad ?? '') ? (p.pad as Pad) : undefined;
      if (!tone && !pad) return { ok: false, error: 'No tone or spacing to change.' };
      const sec: Section = { ...target!, tone: tone ?? target!.tone, pad: pad ?? target!.pad, fixed: true };
      return next(spec.sections.map((x, i) => (i === idx ? sec : x)), undefined, undefined, [sec.id]);
    }
    case 'images': {
      const miss = needTarget();
      if (miss) return miss;
      const sec = normalizeSection({ ...target, images: p.images ?? [] }, spec.pageType, ids, new Set());
      if (!sec) return { ok: false, error: 'Those images do not fit the section.' };
      sec.id = target!.id;
      return next(spec.sections.map((x, i) => (i === idx ? sec : x)), undefined, undefined, [sec.id]);
    }
    case 'replace': {
      const miss = needTarget();
      if (miss) return miss;
      const sec = normalizeSection({ ...p.section, id: target!.id }, spec.pageType, ids, new Set());
      if (!sec) return { ok: false, error: 'The new section is not valid.' };
      sec.id = target!.id;
      return next(spec.sections.map((x, i) => (i === idx ? held(sec, target!) : x)), undefined, undefined, [sec.id]);
    }
    case 'add': {
      const taken = new Set(spec.sections.map((x) => x.id));
      const sec = normalizeSection(p.section, spec.pageType, ids, taken);
      if (!sec) return { ok: false, error: 'The new section is not valid.' };
      const at = p.after ? spec.sections.findIndex((x) => x.id === p.after) : -1;
      const footer = spec.sections.findIndex((x) => x.kind === 'footer');
      const pos = at >= 0 ? at + 1 : footer >= 0 ? footer : spec.sections.length;
      const sections = [...spec.sections.slice(0, pos), sec, ...spec.sections.slice(pos)];
      return next(sections, undefined, undefined, [sec.id]);
    }
    case 'remove': {
      const miss = needTarget();
      if (miss) return miss;
      if (spec.sections.length <= 1) return { ok: false, error: 'A design needs at least one section.' };
      return next(spec.sections.filter((_, i) => i !== idx), undefined, undefined, [target!.id]);
    }
    case 'move': {
      const miss = needTarget();
      if (miss) return miss;
      const to = Math.max(0, Math.min(spec.sections.length - 1, p.to ?? idx));
      if (to === idx) return { ok: false, error: 'It is already there.' };
      const rest = spec.sections.filter((_, i) => i !== idx);
      const sections = [...rest.slice(0, to), target!, ...rest.slice(to)];
      return next(sections, undefined, undefined, [target!.id]);
    }
  }
}

// ── describing the library to the model ───────────────────────────────

function describeField(f: Field): string {
  switch (f.t) {
    case 'text':
      return `text≤${f.max}${f.req ? '*' : ''}`;
    case 'texts':
      return `[text≤${f.max}] ${f.n[0]}–${f.n[1]}${f.req ? '*' : ''}`;
    case 'nums':
      return `[number] ${f.n[0]}–${f.n[1]}${f.req ? '*' : ''}`;
    case 'enum':
      return f.values.length > 8 ? `one of ${f.values.slice(0, 8).join('|')}|…` : `one of ${f.values.join('|')}`;
    case 'bool':
      return 'true|false';
    case 'list':
      return `[{${Object.entries(f.item)
        .map(([k, x]) => `${k}: ${describeField(x)}`)
        .join(', ')}}] ${f.n[0]}–${f.n[1]}${f.req ? '*' : ''}`;
  }
}

/** The library, compactly, for a prompt: one line per kind usable on this page type. */
export function libraryMenu(pageType: PageType): string {
  return LIBRARY.filter((k) => k.pages.includes(pageType))
    .map(
      (k) =>
        `- ${k.kind} (${k.note}) variants: ${k.variants.join('|')}; images: ${k.images[0]}–${k.images[1]}; content: {${Object.entries(k.fields)
          .map(([name, f]) => `${name}: ${describeField(f)}`)
          .join(', ')}}`
    )
    .join('\n');
}

/** The spec, compactly, for a prompt about changing it. */
export function specDigest(spec: DesignSpec): string {
  const t = spec.tokens;
  const head = `Page "${spec.title}" (${spec.pageType}, ${spec.platform}). Tokens: background ${t.colors.background}, surface ${t.colors.surface}, text ${t.colors.text}, muted ${t.colors.muted}, accent ${t.colors.accent} (labels ${t.colors.accentText}), line ${t.colors.line}; fonts ${t.fonts.display} / ${t.fonts.body}; scale ${t.scale}; radius ${t.radius}; style ${t.style}; images ${t.imageTreatment}.`;
  const l = spec.look ?? lookFromTokens(t);
  const look = `Look (${l.language}): type ratio ${l.ratio}, weight ${l.weight}, case ${l.case}, tracking ${l.tracking}, emphasis ${l.emphasis}, labels ${l.label}; grid ${l.grid}, align ${l.align}, width ${l.width}, rhythm ${l.rhythm}; containers ${l.containers}, rules ${l.rules}, buttons ${l.buttons}, image frame ${l.frame}; motifs ${l.motifs.join(', ') || 'none'}${l.shapes.length ? `; shapes ${l.shapes.join(', ')}` : ''}${l.accent2 ? `; second ink ${l.accent2}` : ''}.`;
  const body = spec.sections
    .map((x, i) => `${i + 1}. [${x.id}] ${x.kind}/${x.variant}${x.tone && x.tone !== 'base' ? ` on ${x.tone}` : ''}${x.images.length ? ` images: ${x.images.join(', ')}` : ''} content: ${JSON.stringify(x.content).slice(0, 900)}`)
    .join('\n');
  return `${head}\n${look}\nSections:\n${body}`;
}

/** Bracketed placeholders the model left for facts it did not have: "[Opening hours]". */
export function placeholdersIn(spec: DesignSpec): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(/\[[^\]\n]{2,40}\]/g)) found.add(m[0]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  spec.sections.forEach((x) => walk(x.content));
  return [...found];
}
