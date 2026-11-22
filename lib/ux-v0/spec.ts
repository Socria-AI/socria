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
import { normalizeCompose } from './compose';
import { normalizeForm, type FormSystem } from './form';
import { bodyFont, displayFont, knownFont } from './fonts';
import type { Moodboard, PageType, Platform } from './types';

// ── fields ───────────────────────────────────────────────────────────

type Field =
  | { t: 'text'; max: number; req?: boolean }
  | { t: 'texts'; max: number; n: [number, number]; req?: boolean }
  | { t: 'nums'; n: [number, number]; req?: boolean }
  | { t: 'enum'; values: readonly string[]; req?: boolean }
  | { t: 'bool' }
  | { t: 'list'; n: [number, number]; item: Record<string, Field>; req?: boolean }
  /** a tree of layout pieces (lib/ux-v0/compose.ts), held to its shape there */
  | { t: 'tree'; req?: boolean };

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
/** the objects a scene can draw (lib/ux-v0/scene-runtime.ts), and the materials it shades them in */
/** 'form' is a sculptural form built from the design's own shape system (a supershape: lib/ux-v0/scene-runtime.ts) */
export const SCENE_MODELS = ['vessel', 'bottle', 'sphere', 'torus', 'ring', 'knot', 'monolith', 'form'] as const;
export const SCENE_MATERIALS = ['matte', 'satin', 'gloss', 'metal'] as const;
const WEB: readonly PageType[] = ['website'];
const APP: readonly PageType[] = ['app-screen'];

export const LIBRARY: readonly KindDef[] = [
  { kind: 'nav', label: 'Navigation', pages: WEB, variants: ['inline', 'centered', 'minimal', 'menu', 'index', 'rail'], images: [0, 0], note: 'top bar: brand, up to 6 links (each goes to the part of the page it names), optional button; menu keeps the bar to the brand and a Menu button that opens the links full-screen (on a phone every variant does); index numbers the links as chapters; rail stands the navigation upright at the left edge on wide screens',
    fields: { brand: T(40, true), links: TS(24, 0, 6), cta: T(30) } },
  { kind: 'hero', label: 'Hero', pages: WEB, variants: ['split', 'centered', 'full-bleed', 'editorial', 'statement', 'poster'], images: [0, 1], note: 'the opening statement; full-bleed and split want an image; statement is type alone, very large; poster is huge type with an image set against it',
    fields: { eyebrow: T(48), title: T(120, true), subtitle: T(320), primary: T(30), secondary: T(30), note: T(140) } },
  { kind: 'features', label: 'Features', pages: BOTH, variants: ['grid', 'list', 'numbered', 'index', 'columns', 'rail'], images: [0, 0], note: '2–8 points, each a title and a sentence, optional icon; index is a ruled table of contents, columns is text set in ruled columns, rail is a horizontal sequence scrolled sideways (a process, a programme), kept to a column on phones',
    fields: { eyebrow: T(48), title: T(110), intro: T(320), items: { t: 'list', n: [2, 8], req: true, item: { title: T(60, true), text: T(240), icon: { t: 'enum', values: ICONS } } } } },
  { kind: 'split', label: 'Image and text', pages: WEB, variants: ['image-left', 'image-right'], images: [0, 1], note: 'a story beside one image',
    fields: { eyebrow: T(48), title: T(110, true), text: T(600), bullets: TS(110, 0, 6), cta: T(30) } },
  { kind: 'gallery', label: 'Gallery', pages: WEB, variants: ['grid', 'mosaic', 'strip'], images: [2, 8], note: '2–8 moodboard images; opens each picture large; tags (one per picture, in order) add filters when there are two or more kinds',
    fields: { eyebrow: T(48), title: T(110), caption: T(220), tags: TS(24, 0, 8) } },
  { kind: 'quote', label: 'Quote', pages: WEB, variants: ['large', 'with-portrait', 'pull'], images: [0, 1], note: 'one testimonial or statement; pull is a large left-set pull quote',
    fields: { quote: T(420, true), author: T(60, true), role: T(90) } },
  { kind: 'stats', label: 'Figures', pages: WEB, variants: ['row', 'band', 'giant'], images: [0, 0], note: '2–6 figures; giant sets them as huge numerals; unknown figures are [bracketed placeholders]',
    fields: { title: T(110), items: { t: 'list', n: [2, 6], req: true, item: { value: T(18, true), label: T(70, true) } } } },
  { kind: 'compose', label: 'Composed', pages: BOTH, variants: ['free'], images: [0, 6], note: 'a section built from layout pieces (stacks, grids in proportion, boxes, text, figures, pictures, buttons, lists, rules; layers of one piece over another; a 12-column field where each piece is placed by hand and may overlap) when no other section draws the arrangement needed. span: wide or bleed runs it past the page’s column or edge to edge; tall: screen gives it a whole screen',
    fields: { root: { t: 'tree', req: true }, span: { t: 'enum', values: ['wide', 'bleed'] }, tall: { t: 'enum', values: ['screen'] } } },
  { kind: 'logos', label: 'Names', pages: WEB, variants: ['row'], images: [0, 0], note: 'partner or press names, set as words',
    fields: { title: T(80), names: TS(32, 3, 8, true) } },
  { kind: 'pricing', label: 'Pricing', pages: WEB, variants: ['cards'], images: [0, 0], note: '1–4 plans',
    fields: { title: T(110), intro: T(300), plans: { t: 'list', n: [1, 4], req: true, item: { name: T(30, true), price: T(22, true), period: T(22), features: TS(90, 0, 8), cta: T(26), featured: { t: 'bool' } } } } },
  { kind: 'list', label: 'List', pages: BOTH, variants: ['menu', 'schedule', 'simple'], images: [0, 0], note: 'menus, timetables, events, team: groups of named items',
    fields: { eyebrow: T(48), title: T(110), intro: T(300), groups: { t: 'list', n: [1, 6], req: true, item: { title: T(60), items: { t: 'list', n: [1, 12], req: true, item: { name: T(70, true), meta: T(70), price: T(18), text: T(220) } } } } } },
  { kind: 'faq', label: 'Questions', pages: WEB, variants: ['accordion', 'two-column'], images: [0, 0], note: '2–10 questions and answers',
    fields: { title: T(110), items: { t: 'list', n: [2, 10], req: true, item: { q: T(150, true), a: T(520, true) } } } },
  { kind: 'tabs', label: 'Tabs', pages: BOTH, variants: ['top', 'side'], images: [0, 0], note: '2–6 panels of the same kind of thing (services, days of a programme, rooms, plans), one shown at a time: each a short label, a title and a paragraph. Only when the content is truly parallel and a reader wants one at a time',
    fields: { eyebrow: T(48), title: T(110), intro: T(240), items: { t: 'list', n: [2, 6], req: true, item: { label: T(28, true), title: T(90), text: T(420, true) } } } },
  { kind: 'compare', label: 'Before and after', pages: WEB, variants: ['slider', 'side'], images: [2, 2], note: 'two pictures of the same subject, before and after (a restoration, a renovation, a treatment, a retouch): a slider reveals one over the other; side shows them side by side. Only with two pictures that truly compare',
    fields: { eyebrow: T(48), title: T(110), intro: T(240), before: T(24), after: T(24), caption: T(160) } },
  { kind: 'cta', label: 'Call to action', pages: WEB, variants: ['band', 'centered', 'image', 'statement'], images: [0, 1], note: 'one decisive invitation; statement is a very large headline with no box',
    fields: { title: T(120, true), text: T(280), primary: T(30, true), secondary: T(30) } },
  { kind: 'scene', label: '3D scene', pages: BOTH, variants: ['object', 'stage', 'backdrop'], images: [0, 0],
    note: 'a 3D object drawn in the page and turned by hand (drag, arrow keys), shaded in a material, recoloured by a configurator on the page. Only when the brief asks for 3D, a product to look at from every side, or an immersive experience; never as decoration. object: the object beside its words; stage: the object large, its words after it; backdrop: the object turning slowly behind the words',
    fields: { eyebrow: T(48), title: T(110, true), text: T(280), model: { t: 'enum', values: SCENE_MODELS }, material: { t: 'enum', values: SCENE_MATERIALS }, color: T(9), caption: T(160), action: T(40) } },
  { kind: 'configurator', label: 'Configurator', pages: BOTH, variants: ['panel', 'split'], images: [0, 1],
    note: 'a product configured in place: groups of options (a finish with its colour as swatch "#rrggbb", a size…), each with an optional price; the total and the choice update as you choose; one action. A prototype: it says plainly that nothing is ordered',
    fields: { eyebrow: T(48), title: T(110, true), intro: T(240), groups: { t: 'list', n: [1, 4], req: true, item: { name: T(40, true), options: { t: 'list', n: [2, 6], req: true, item: { label: T(40, true), price: T(18), swatch: T(9) } } } }, base: T(18), action: T(40, true), note: T(200) } },
  { kind: 'form', label: 'Form', pages: BOTH, variants: ['stacked', 'split'], images: [0, 0], note: 'every field has a visible label',
    fields: { title: T(110, true), intro: T(320), fields: { t: 'list', n: [1, 10], req: true, item: { label: T(48, true), type: { t: 'enum', values: ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'date', 'number'] }, placeholder: T(60), options: TS(40, 0, 8), required: { t: 'bool' } } }, submit: T(30, true), note: T(180) } },
  { kind: 'booking', label: 'Booking', pages: BOTH, variants: ['strip', 'calendar', 'list', 'split', 'immersive'], images: [0, 1],
    note: 'the booking itself, working: what is booked, its days and times with availability (open, few, full), one confirm action, and the confirmation it leads to. strip: a row of days over a grid of times; calendar: the days as a grid, the times beside; list: every day and its times as one typographic list; split: the choice summarised beside the picker; immersive: one picture, the picker over it',
    fields: { eyebrow: T(48), title: T(110, true), intro: T(240), item: T(80, true), details: TS(60, 0, 5), days: { t: 'list', n: [1, 14], req: true, item: { label: T(24, true), date: T(24), slots: { t: 'list', n: [1, 16], req: true, item: { time: T(20, true), status: { t: 'enum', values: ['open', 'few', 'full'] }, note: T(40) } } } }, action: T(40, true), confirmTitle: T(80), confirmText: T(240), note: T(200) } },
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

/**
 * The variants drawn around an image, and what each becomes without one. A hero without its picture becomes
 * the editorial opening (words set to one side), never the centred one: that is the most common opening there is.
 */
export const NEEDS_IMAGE: Record<string, Record<string, string>> = {
  hero: { split: 'editorial', 'full-bleed': 'editorial' },
  cta: { image: 'band' },
  quote: { 'with-portrait': 'large' },
  booking: { immersive: 'split' },
};
export type SectionKind = string;
const DEF = new Map(LIBRARY.map((k) => [k.kind, k]));
export const kindDef = (kind: string): KindDef | null => DEF.get(kind) ?? null;

// ── shapes: how a section is laid out, beyond its variant ──────────────
//
// A variant is the archetype (a booking as a calendar, a hero split around a picture). Its shape is how that
// archetype is set for this design: which side things sit on, the proportion between columns, how times are
// shown, how wide and how large the words are. Every value is bounded, so any combination still works at
// every width (the rendered-page audit checks it). The designer's layout decisions fix some values; the rest
// vary per project within the direction's visual language (lib/ux-v0/layout.ts).

export type ShapeValue = string | number;
export type SectionShape = Record<string, ShapeValue>;
type ShapeField = { t: 'enum'; values: readonly string[] } | { t: 'num'; min: number; max: number };

export const SHAPE_FIELDS: Record<string, Record<string, ShapeField>> = {
  booking: {
    side: { t: 'enum', values: ['start', 'end'] },
    times: { t: 'enum', values: ['tiles', 'rows', 'pills'] },
    summary: { t: 'enum', values: ['card', 'inline', 'bar'] },
    ratio: { t: 'num', min: 0.3, max: 0.62 },
    density: { t: 'enum', values: ['airy', 'even', 'dense'] },
    align: { t: 'enum', values: ['left', 'center'] },
  },
  hero: {
    align: { t: 'enum', values: ['left', 'center'] },
    side: { t: 'enum', values: ['start', 'end'] },
    valign: { t: 'enum', values: ['top', 'middle', 'bottom'] },
    measure: { t: 'num', min: 0.45, max: 1 },
    scale: { t: 'num', min: 0.82, max: 1.25 },
    ratio: { t: 'num', min: 0.36, max: 0.64 },
  },
};

/** The settings each variant actually draws: the others would change nothing you could see. */
export const SHAPE_EFFECTIVE: Record<string, Record<string, readonly string[]>> = {
  booking: {
    strip: ['times', 'summary', 'density', 'align'],
    calendar: ['side', 'ratio', 'times', 'summary', 'density', 'align'],
    list: ['times', 'summary', 'density', 'align'],
    split: ['side', 'ratio', 'times', 'summary', 'density', 'align'],
    immersive: ['side', 'times', 'summary', 'density'],
  },
  hero: {
    centered: ['measure', 'scale'],
    editorial: ['align', 'side', 'measure', 'scale'],
    statement: ['align', 'measure', 'scale'],
    poster: ['scale'],
    split: ['side', 'ratio', 'scale'],
    'full-bleed': ['side', 'valign', 'measure', 'scale'],
  },
};

/** What each setting is when a section has none: how the renderer draws it without a shape. */
export const SHAPE_DEFAULT: Record<string, SectionShape> = {
  booking: { side: 'start', times: 'tiles', summary: 'card', ratio: 0.42, density: 'even', align: 'left' },
  hero: { align: 'left', side: 'start', valign: 'bottom', measure: 1, scale: 1, ratio: 0.48 },
};
/** Where a layout draws a setting otherwise: the immersive booking's panel sits at the end, a list's times are rows. */
const SHAPE_VARIANT_DEFAULT: Record<string, Record<string, SectionShape>> = { booking: { immersive: { side: 'end' }, list: { times: 'rows' } } };

/** The settings a section of this kind and layout is drawn with when it has none of its own. */
export function shapeDefault(kind: string, variant: string): SectionShape {
  return { ...(SHAPE_DEFAULT[kind] ?? {}), ...(SHAPE_VARIANT_DEFAULT[kind]?.[variant] ?? {}) };
}

/** A shape held to its fields: unknown keys dropped, numbers clamped and rounded. */
export function normalizeShape(kind: string, v: unknown): SectionShape | undefined {
  const fields = SHAPE_FIELDS[kind];
  if (!fields || !v || typeof v !== 'object') return undefined;
  const out: SectionShape = {};
  for (const [k, f] of Object.entries(fields)) {
    const x = (v as Record<string, unknown>)[k];
    if (f.t === 'enum' && typeof x === 'string' && f.values.includes(x)) out[k] = x;
    if (f.t === 'num' && typeof x === 'number' && Number.isFinite(x)) out[k] = Math.round(Math.min(f.max, Math.max(f.min, x)) * 100) / 100;
  }
  return Object.keys(out).length ? out : undefined;
}

/** What a shape draws, as words a structure can be compared by: its effective settings, numbers in three bands. */
export function shapeSignature(kind: string, variant: string, shape: SectionShape | undefined): string {
  if (!shape) return '';
  const keys = SHAPE_EFFECTIVE[kind]?.[variant] ?? [];
  const band = (k: string, n: number) => {
    const f = SHAPE_FIELDS[kind]?.[k];
    if (!f || f.t !== 'num') return String(n);
    const at = (n - f.min) / (f.max - f.min);
    return at < 0.34 ? 'low' : at > 0.66 ? 'high' : 'mid';
  };
  return keys
    .filter((k) => shape[k] !== undefined)
    .map((k) => `${k}=${typeof shape[k] === 'number' ? band(k, shape[k] as number) : shape[k]}`)
    .join(',');
}

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
  /**
   * LOCKED by the designer: kept exactly as it is. A model's change to it is asked about first, a new
   * generation carries it over unchanged, and the automatic repairs leave it alone (lib/ux-v0/edit.ts).
   */
  locked?: boolean;
  /** how this section's variant is set: sides, proportions, how its parts are shown (SHAPE_FIELDS) */
  shape?: SectionShape;
  /** what the designer set apart for tablets or phones: hidden there, aligned, spaced, its picture's place */
  responsive?: Responsive;
  /** a sequence of points the designer chose to tell as the page's pinned story (one section at most) */
  story?: true;
  /**
   * A composed part whose COMPOSITION the designer approved (lib/ux-v0/composer.ts): where things stand is held —
   * its words, pictures, ground and per-width rules can still change; a change to its arrangement is asked about
   * first, a new generation carries it over, the automatic repairs and the strategy leave it alone.
   */
  held?: true;
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
  /** the site around the design: set by the designer, never by the model (see SiteSettings) */
  site?: SiteSettings;
}

/**
 * The site around a design: what search results and link previews read, where its forms send, where its buttons
 * go. Every value is the designer's: SocriaUX never invents an address, a form service or a description of the
 * business. Unset, the page's own words stand in where they can (lib/ux-v0/render.ts head) and the rest is said
 * plainly as not set up (lib/ux-v0/links.ts, the checks, the export's README).
 */
export interface SiteSettings {
  /** one or two sentences for search results and link previews */
  description?: string;
  /** the address the site will live at (https): canonical links, link previews, the sitemap */
  url?: string;
  /** where the forms send their answers: an https form endpoint, or a mailto: address */
  formAction?: string;
  /** the language of the page's words (BCP 47: "en", "fr-CA") */
  lang?: string;
  /** destinations the designer set for buttons and links, by "sectionId:path" (lib/ux-v0/links.ts) */
  links?: Record<string, string>;
}

/** A destination a link may have: a part of the page, the top, an https address, an email or a phone number. */
export function safeHref(v: unknown): string {
  if (typeof v !== 'string') return '';
  const h = v.trim();
  if (/^#(top|s-[\w-]{1,60})$/.test(h)) return h;
  if (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d{2,5})?(?:[/?#][^\s"'<>`]*)?$/i.test(h) && h.length <= 500) return h;
  if (/^mailto:[^\s"'<>@?]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i.test(h) && h.length <= 260) return h;
  if (/^tel:\+?[\d\s().-]{5,30}$/.test(h)) return h.replace(/\s+/g, '');
  return '';
}

/** The site settings held to their shape: anything that is not a well-formed value is dropped, never guessed. */
export function normalizeSite(v: unknown): SiteSettings | undefined {
  const r = o(v);
  const out: SiteSettings = {};
  const description = s(r.description, 300);
  if (description) out.description = description;
  const url = safeHref(r.url);
  if (url.startsWith('https://')) out.url = url.replace(/#.*$/, '');
  const formAction = safeHref(r.formAction);
  if (formAction.startsWith('https://') || formAction.startsWith('mailto:')) out.formAction = formAction;
  if (typeof r.lang === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/i.test(r.lang.trim())) out.lang = r.lang.trim();
  const links: Record<string, string> = {};
  for (const [k, val] of Object.entries(o(r.links)).slice(0, 80)) {
    const href = safeHref(val);
    if (href && /^[\w-]{1,48}:[\w.]{1,80}$/.test(k)) links[k] = href;
  }
  if (Object.keys(links).length) out.links = links;
  return Object.keys(out).length ? out : undefined;
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
export const FRAMES = ['plain', 'inset', 'arch', 'circle', 'offset', 'shaped'] as const;
/** where grounds of different tones meet: a straight line, or an edge cut from the design's shapes */
export const EDGES = ['straight', 'shaped'] as const;
export const MOTIFS = ['numbering', 'shapes', 'marquee', 'captions', 'big-numerals', 'pull-quote', 'icons'] as const;
export const SHAPES = ['circle', 'arch', 'square', 'quarter', 'diamond', 'blob'] as const;
export const TONES = ['base', 'alt', 'accent', 'accent2', 'invert'] as const;
export const PADS = ['s', 'm', 'l'] as const;

// ── a part set apart at a width: what the designer changed for tablets or phones ──
// The page is designed at the desktop width and every layout reflows on its own; these are the designer's own
// decisions at the narrower widths, kept with the section and written by the renderer as media queries. Tablet is
// 760–1099 px and phone up to 759 px: the widths the renderer's own layouts already change at.
export const BREAKPOINTS = ['tablet', 'mobile'] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];
export const BREAKPOINT_LABEL: Record<Breakpoint, string> = { tablet: 'On tablets', mobile: 'On phones' };
export const BREAKPOINT_QUERY: Record<Breakpoint, string> = { tablet: '(min-width:760px) and (max-width:1099px)', mobile: '(max-width:759px)' };
export const BP_ALIGNS = ['start', 'center'] as const;
export const BP_MEDIA = ['first', 'last'] as const;
export const BP_TYPES = ['s', 'l'] as const;
export const BP_CROPS = ['wide', 'square', 'tall'] as const;
export interface BreakpointRule {
  /** not shown at this width */
  hide?: boolean;
  /** its words set to the left, or centred, here */
  align?: (typeof BP_ALIGNS)[number];
  /** its share of space here */
  pad?: Pad;
  /** where its picture sits once its parts stack: before the words, or after them */
  media?: (typeof BP_MEDIA)[number];
  /** its headings set smaller, or larger, here */
  type?: (typeof BP_TYPES)[number];
  /** its pictures cropped for this width: wide, square or tall */
  crop?: (typeof BP_CROPS)[number];
}
export type Responsive = Partial<Record<Breakpoint, BreakpointRule>>;

/** A part's rules at each width, kept only where something is set. */
export function normalizeResponsive(v: unknown): Responsive | undefined {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
  const out: Responsive = {};
  for (const bp of BREAKPOINTS) {
    const x = r[bp] && typeof r[bp] === 'object' && !Array.isArray(r[bp]) ? (r[bp] as Record<string, unknown>) : null;
    if (!x) continue;
    const rule: BreakpointRule = {};
    if (x.hide === true) rule.hide = true;
    if ((BP_ALIGNS as readonly string[]).includes(x.align as string)) rule.align = x.align as BreakpointRule['align'];
    if ((PADS as readonly string[]).includes(x.pad as string)) rule.pad = x.pad as Pad;
    if ((BP_MEDIA as readonly string[]).includes(x.media as string)) rule.media = x.media as BreakpointRule['media'];
    if ((BP_TYPES as readonly string[]).includes(x.type as string)) rule.type = x.type as BreakpointRule['type'];
    if ((BP_CROPS as readonly string[]).includes(x.crop as string)) rule.crop = x.crop as BreakpointRule['crop'];
    if (Object.keys(rule).length) out[bp] = rule;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Whether a part has a picture beside its words, one that stacks above or below them as the width narrows. */
export function stacksPicture(sec: Pick<Section, 'kind' | 'images'>): boolean {
  return ['hero', 'split', 'cta', 'configurator', 'scene', 'booking', 'quote'].includes(sec.kind) && (sec.images.length > 0 || sec.kind === 'scene' || sec.kind === 'configurator');
}

/** What a part's rules say, in words, for the editor and a version's summary. */
export function describeResponsive(r: Responsive | undefined): string[] {
  const out: string[] = [];
  for (const bp of BREAKPOINTS) {
    const x = r?.[bp];
    if (!x) continue;
    const said = [
      x.hide ? 'hidden' : '',
      x.align ? (x.align === 'center' ? 'centred' : 'set left') : '',
      x.pad ? `${{ s: 'tight', m: 'even', l: 'generous' }[x.pad]} spacing` : '',
      x.media ? `picture ${x.media === 'first' ? 'before' : 'after'} the words` : '',
      x.type ? `headings ${x.type === 's' ? 'smaller' : 'larger'}` : '',
      x.crop ? `pictures cropped ${x.crop}` : '',
    ].filter(Boolean);
    if (said.length) out.push(`${BREAKPOINT_LABEL[bp]}: ${said.join(', ')}`);
  }
  return out;
}

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
/** how pictures arrive as they scroll in: as they are, through a mask, or settling from a larger scale */
export const MEDIA_MOTIONS = ['none', 'mask', 'scale'] as const;
/** what follows a fine pointer: nothing, pictures and cards tilting toward it */
export const CURSORS = ['none', 'tilt'] as const;

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
  /**
   * The scripted layer (lib/ux-v0/motion-runtime.ts), where the page plays (preview, export): the opening
   * transformed by the scroll (0 none, 1 gentle, 2 pronounced); one sequence of points pinned and told step by
   * step as the page scrolls; pictures arriving through a mask or settling in scale; buttons drawn toward a
   * fine pointer; pictures and cards tilting toward it; line art drawing itself. All of it is off under
   * prefers-reduced-motion, and none of it on phones except the arrivals.
   */
  scrub?: number;
  story?: boolean;
  media?: (typeof MEDIA_MOTIONS)[number];
  magnetic?: boolean;
  cursor?: (typeof CURSORS)[number];
  draw?: boolean;
}

/** No motion: what older designs, and anything that asks for stillness, are drawn with. */
export const STILL_MOTION: Motion = { feel: 'still', duration: 0, stagger: 0, distance: 0, ease: 'out', entrance: 'none', headline: 'none', scroll: false, parallax: 0, hover: 'none', sections: 'none', nav: false, scrub: 0, story: false, media: 'none', magnetic: false, cursor: 'none', draw: false };

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
    scrub: n(r.scrub, 0, 2, base.scrub ?? 0),
    story: typeof r.story === 'boolean' ? r.story : base.story ?? false,
    media: p(r.media, MEDIA_MOTIONS, base.media ?? 'none'),
    magnetic: typeof r.magnetic === 'boolean' ? r.magnetic : base.magnetic ?? false,
    cursor: p(r.cursor, CURSORS, base.cursor ?? 'none'),
    draw: typeof r.draw === 'boolean' ? r.draw : base.draw ?? false,
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
  /**
   * The design's shape system (lib/ux-v0/form.ts), derived from its direction: the shapes its pictures are cut to
   * when the frame is "shaped", its section edges, its motif's marks. None on a design made before it existed.
   */
  form?: FormSystem;
  /** where grounds of different tones meet */
  edges?: (typeof EDGES)[number];
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
    // a system written as null is taken away; one not mentioned is kept
    ...(r.form === null ? {} : normalizeForm(r.form) ?? base.form ? { form: normalizeForm(r.form) ?? base.form } : {}),
    ...((EDGES as readonly string[]).includes(r.edges as string) ? (r.edges === 'shaped' ? { edges: 'shaped' as const } : {}) : base.edges === 'shaped' && r.edges === undefined ? { edges: 'shaped' as const } : {}),
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
    case 'tree':
      return normalizeCompose(v);
  }
}

function ok(f: Field, v: unknown): boolean {
  switch (f.t) {
    case 'text':
    case 'tree':
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
  if (r.locked === true) (sec.locked = true), (sec.fixed = true);
  const shape = normalizeShape(def.kind, r.shape);
  if (shape) sec.shape = shape;
  const responsive = normalizeResponsive(r.responsive);
  if (responsive) sec.responsive = responsive;
  if (r.story === true && def.kind === 'features') sec.story = true;
  if (r.held === true && def.kind === 'compose') (sec.held = true), (sec.fixed = true);
  return sec;
}

/**
 * The ids a spec's sections may draw on: pictures on the moodboard that may
 * appear in the design. References inspire; a picture is placed only when the
 * designer marks it as content (references kept before that distinction stay
 * usable, so older designs keep their pictures). Moving references, ones to
 * steer away from and removed ones never are.
 */
export function usableImages(m: Moodboard | null | undefined): Set<string> | null {
  if (!m) return null;
  return new Set(
    m.refs
      .filter((x) => x.state !== 'rejected' && x.media !== 'video' && !x.avoid && x.asContent !== false && (x.provider !== 'upload' || x.asContent === true))
      .map((x) => x.id)
  );
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
    ...((site) => (site ? { site } : {}))(normalizeSite(r.site)),
  };
}

// ── patches: iteration that touches only what was asked ───────────────

export type PatchOp = 'tokens' | 'look' | 'content' | 'variant' | 'tone' | 'shape' | 'responsive' | 'story' | 'replace' | 'add' | 'remove' | 'move' | 'images' | 'site' | 'none';
export const PATCH_OPS: readonly PatchOp[] = ['tokens', 'look', 'content', 'variant', 'tone', 'shape', 'responsive', 'story', 'replace', 'add', 'remove', 'move', 'images', 'site', 'none'];

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
  /** a "shape" patch: the settings to change on one section (SHAPE_FIELDS), the others kept */
  shape?: Record<string, unknown>;
  /** a "responsive" patch: the width it is for, and the rules to set there (null or false clears one) */
  breakpoint?: Breakpoint;
  rule?: Record<string, unknown>;
  /** a "story" patch: this sequence is (true) or is no longer (false) the one told as the pinned story */
  story?: boolean;
  /** a "site" patch (the designer's only, never the model's): settings to set; "" or null clears one, and in
   * `links` a key set to "" or null clears that destination */
  site?: Record<string, unknown>;
  /** one line: what the change is */
  summary: string;
}

export function normalizePatch(v: unknown): Patch {
  const r = o(v);
  const op = pick(r.op, PATCH_OPS, 'none');
  return {
    op,
    sectionId: typeof r.sectionId === 'string' ? r.sectionId.slice(0, 48) : undefined,
    shape: r.shape && typeof r.shape === 'object' ? o(r.shape) : undefined,
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
    breakpoint: (BREAKPOINTS as readonly string[]).includes(r.breakpoint) ? (r.breakpoint as Breakpoint) : r.breakpoint === 'phone' ? 'mobile' : undefined,
    rule: r.rule && typeof r.rule === 'object' && !Array.isArray(r.rule) ? o(r.rule) : undefined,
    story: typeof r.story === 'boolean' ? r.story : undefined,
    site: r.site && typeof r.site === 'object' && !Array.isArray(r.site) ? o(r.site) : undefined,
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
  const held = (sec: Section, from: Section): Section => ({ ...sec, tone: sec.tone ?? from.tone, pad: sec.pad ?? from.pad, fixed: true, ...(from.locked ? { locked: true } : {}) });
  const needTarget = (): PatchResult | null => (target ? null : { ok: false, error: 'That section is not in the design.' });

  switch (p.op) {
    case 'none':
      return { ok: false, error: 'No change was asked for.' };
    case 'site': {
      if (!p.site) return { ok: false, error: 'No site setting to change.' };
      const was: Record<string, unknown> = { ...(spec.site ?? {}) };
      const links: Record<string, unknown> = { ...(spec.site?.links ?? {}) };
      for (const [k, val] of Object.entries(p.site)) {
        if (k === 'links') {
          for (const [lk, lv] of Object.entries(o(val))) {
            if (lv === '' || lv === null) delete links[lk];
            else links[lk] = lv;
          }
        } else if (val === '' || val === null) delete was[k];
        else was[k] = val;
      }
      const site = normalizeSite({ ...was, links });
      const { site: _drop, ...rest } = spec;
      return { ok: true, spec: { ...rest, ...(site ? { site } : {}), version: spec.version + 1, reason: p.summary || 'Site settings', createdAt: Date.now() }, touched: [] };
    }
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
    case 'shape': {
      const miss = needTarget();
      if (miss) return miss;
      if (!SHAPE_FIELDS[target!.kind]) return { ok: false, error: `${kindDef(target!.kind)?.label ?? 'That section'} has no layout settings to change.` };
      const asked = normalizeShape(target!.kind, p.shape);
      if (!asked) return { ok: false, error: 'No layout setting to change.' };
      // the settings asked for, the rest kept; what the designer set is theirs: the planner leaves it alone
      const sec: Section = { ...target!, shape: normalizeShape(target!.kind, { ...(target!.shape ?? {}), ...asked }), fixed: true };
      return next(spec.sections.map((x, i) => (i === idx ? sec : x)), undefined, undefined, [sec.id]);
    }
    case 'story': {
      const miss = needTarget();
      if (miss) return miss;
      const n = Array.isArray(target!.content.items) ? (target!.content.items as unknown[]).length : 0;
      if (target!.kind !== 'features' || n < 3 || n > 6) return { ok: false, error: 'A story is a sequence of three to six points.' };
      if (typeof p.story !== 'boolean') return { ok: false, error: 'Tell it as the story, or not?' };
      // one story to a page: choosing this sequence releases any other
      const sections = spec.sections.map((x, i) => {
        const { story: _was, ...rest } = x;
        return i === idx && p.story ? ({ ...rest, story: true as const, fixed: true } as Section) : (rest as Section);
      });
      return next(sections, undefined, undefined, [target!.id]);
    }
    case 'responsive': {
      const miss = needTarget();
      if (miss) return miss;
      if (!p.breakpoint) return { ok: false, error: 'Which width is this for: tablets or phones?' };
      if (!p.rule || !Object.keys(p.rule).length) return { ok: false, error: 'Nothing to set at that width.' };
      // the rules asked for, the others at that width kept; null, false or "" takes one back to the desktop's
      const merged: Record<string, unknown> = { ...(target!.responsive?.[p.breakpoint] ?? {}) };
      for (const [k, v] of Object.entries(p.rule)) {
        if (v === null || v === false || v === '') delete merged[k];
        else merged[k] = v;
      }
      const asked = normalizeResponsive({ [p.breakpoint]: p.rule })?.[p.breakpoint] ?? {};
      const cleared = Object.values(p.rule).some((v) => v === null || v === false || v === '');
      if (!Object.keys(asked).length && !cleared) return { ok: false, error: 'That is not something a part can be set to at that width.' };
      const responsive = normalizeResponsive({ ...(target!.responsive ?? {}), [p.breakpoint]: merged });
      // the desktop width always shows it: a part not wanted anywhere is taken out, not hidden
      const sec: Section = { ...target!, fixed: true };
      if (responsive) sec.responsive = responsive;
      else delete sec.responsive;
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
    case 'tree':
      return 'one piece* — {"t":"stack","dir":"row|col","gap":"s|m|l","align":"start|center|end|stretch","children":[pieces],"pin":true to hold a column in view while the one beside it scrolls} | {"t":"grid","cols":[2–4 whole numbers 1–12: the columns\' proportion, e.g. [5,7]],"gap","align","children":[pieces]} | {"t":"box","tone":"base|alt|accent|invert","pad":"s|m|l","children":[pieces]} | {"t":"layer","place":"top-start|top|top-end|start|center|end|bottom-start|bottom|bottom-end","inset":"s|m|l","children":[the ground first (a picture or a box), then what sits over it]} | {"t":"field","rows":"s|m|l" (row height),"children":[pieces, each with "cell":[first column 1–12, columns spanned, first row 1–8, rows spanned]]} — a field places pieces by hand on twelve columns: they may overlap, sit off-axis, leave columns empty; words that meet a picture are drawn above it on a plate | {"t":"text","role":"eyebrow|title|heading|lead|body|caption|quote","text","size":"l|xl|giant" (a title, heading or quote at display size),"align":"center|end","over":"lines" (a title that crosses a picture, set line by line on strips of the ground),"orient":"vertical" (short words standing upright),"rotate":−12…12 (degrees, not running text),"stroke":true (outline, display sizes),"vary":"weight" (its weight sweeps as it passes)} | {"t":"figure","value","label","stroke":true} | {"t":"image","at":its index in this section\'s images,"ratio":"1:1|4:3|3:2|16:9|21:9|3:4|2:3","fill":true to fill its cell,"mask":SHAPE (the picture cut to it),"fragments":SHAPE (the picture broken by its cuts),"morph":true (arrives as a plain frame that becomes its mask)} | {"t":"shape","form":SHAPE,"tone":"accent|ink|tint|line|ground|accent2","z":"under|over" (beneath pictures, or over them as a cut),"ratio","keep":true (kept on phones)} | {"t":"flow","side":"start|end","form":SHAPE,"at":a picture cut to the shape (optional),"tone","children":[words that wrap around the shape]} | {"t":"button","label","style":"primary|secondary|link"} | {"t":"list","items":[…],"marker":"none|number|rule"} | {"t":"rule"}; SHAPE = {"kind":"poly|organic|super|stepped|radial|rings|shards|arc|custom","n":2–24 (corners, lobes, rays, rings, cuts or steps),"irregular":0–100,"curve":0–100,"turn":−180…180,"cut":0–100 (a void, notch or gap),"warp":0–100,"mirror":true,"seed":any whole number, or for custom "points":[[x,y]…] or "path":"M… (lines and curves, no arcs)" in a 0–100 box}; at most 4 levels deep and 48 pieces (a field 12 children); one title';
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
