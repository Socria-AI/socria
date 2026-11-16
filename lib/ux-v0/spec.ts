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
import { bodyFont, displayFont } from './fonts';
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
  { kind: 'hero', label: 'Hero', pages: WEB, variants: ['split', 'centered', 'full-bleed', 'editorial'], images: [0, 1], note: 'the opening statement; full-bleed and split want an image',
    fields: { eyebrow: T(48), title: T(120, true), subtitle: T(320), primary: T(30), secondary: T(30), note: T(140) } },
  { kind: 'features', label: 'Features', pages: BOTH, variants: ['grid', 'list', 'numbered'], images: [0, 0], note: '2–8 points, each a title and a sentence, optional icon',
    fields: { eyebrow: T(48), title: T(110), intro: T(320), items: { t: 'list', n: [2, 8], req: true, item: { title: T(60, true), text: T(240), icon: { t: 'enum', values: ICONS } } } } },
  { kind: 'split', label: 'Image and text', pages: WEB, variants: ['image-left', 'image-right'], images: [0, 1], note: 'a story beside one image',
    fields: { eyebrow: T(48), title: T(110, true), text: T(600), bullets: TS(110, 0, 6), cta: T(30) } },
  { kind: 'gallery', label: 'Gallery', pages: WEB, variants: ['grid', 'mosaic', 'strip'], images: [2, 8], note: '2–8 moodboard images',
    fields: { eyebrow: T(48), title: T(110), caption: T(220) } },
  { kind: 'quote', label: 'Quote', pages: WEB, variants: ['large', 'with-portrait'], images: [0, 1], note: 'one testimonial or statement',
    fields: { quote: T(420, true), author: T(60, true), role: T(90) } },
  { kind: 'stats', label: 'Figures', pages: WEB, variants: ['row', 'band'], images: [0, 0], note: '2–6 figures; unknown figures are [bracketed placeholders]',
    fields: { title: T(110), items: { t: 'list', n: [2, 6], req: true, item: { value: T(18, true), label: T(70, true) } } } },
  { kind: 'logos', label: 'Names', pages: WEB, variants: ['row'], images: [0, 0], note: 'partner or press names, set as words',
    fields: { title: T(80), names: TS(32, 3, 8, true) } },
  { kind: 'pricing', label: 'Pricing', pages: WEB, variants: ['cards'], images: [0, 0], note: '1–4 plans',
    fields: { title: T(110), intro: T(300), plans: { t: 'list', n: [1, 4], req: true, item: { name: T(30, true), price: T(22, true), period: T(22), features: TS(90, 0, 8), cta: T(26), featured: { t: 'bool' } } } } },
  { kind: 'list', label: 'List', pages: BOTH, variants: ['menu', 'schedule', 'simple'], images: [0, 0], note: 'menus, timetables, events, team: groups of named items',
    fields: { eyebrow: T(48), title: T(110), intro: T(300), groups: { t: 'list', n: [1, 6], req: true, item: { title: T(60), items: { t: 'list', n: [1, 12], req: true, item: { name: T(70, true), meta: T(70), price: T(18), text: T(220) } } } } } },
  { kind: 'faq', label: 'Questions', pages: WEB, variants: ['accordion', 'two-column'], images: [0, 0], note: '2–10 questions and answers',
    fields: { title: T(110), items: { t: 'list', n: [2, 10], req: true, item: { q: T(150, true), a: T(520, true) } } } },
  { kind: 'cta', label: 'Call to action', pages: WEB, variants: ['band', 'centered', 'image'], images: [0, 1], note: 'one decisive invitation',
    fields: { title: T(120, true), text: T(280), primary: T(30, true), secondary: T(30) } },
  { kind: 'form', label: 'Form', pages: BOTH, variants: ['stacked', 'split'], images: [0, 0], note: 'every field has a visible label',
    fields: { title: T(110, true), intro: T(320), fields: { t: 'list', n: [1, 10], req: true, item: { label: T(48, true), type: { t: 'enum', values: ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'date', 'number'] }, placeholder: T(60), options: TS(40, 0, 8), required: { t: 'bool' } } }, submit: T(30, true), note: T(180) } },
  { kind: 'text', label: 'Text', pages: BOTH, variants: ['narrow', 'two-column'], images: [0, 0], note: 'an about or story block',
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
  imageTreatment: 'natural' | 'muted' | 'warm' | 'mono';
}

export const SCALES = ['compact', 'comfortable', 'spacious'] as const;
export const RADII = ['none', 'soft', 'round'] as const;
export const STYLES = ['editorial', 'minimal', 'bold', 'warm', 'technical'] as const;
export const TREATMENTS = ['natural', 'muted', 'warm', 'mono'] as const;

export interface Section {
  id: string;
  kind: SectionKind;
  variant: string;
  content: Record<string, any>;
  /** moodboard reference ids */
  images: string[];
}

export interface DesignSpec {
  version: number;
  pageType: PageType;
  platform: Platform;
  title: string;
  tokens: DesignTokens;
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
  return { id, kind: def.kind, variant, content, images };
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
    sections,
    notes: [...new Set(notes)].slice(0, 8),
    reason: s(r.reason, 200),
    createdAt: typeof r.createdAt === 'number' && r.createdAt > 0 ? Math.round(r.createdAt) : Date.now(),
  };
}

// ── patches: iteration that touches only what was asked ───────────────

export type PatchOp = 'tokens' | 'content' | 'variant' | 'replace' | 'add' | 'remove' | 'move' | 'images' | 'none';
export const PATCH_OPS: readonly PatchOp[] = ['tokens', 'content', 'variant', 'replace', 'add', 'remove', 'move', 'images', 'none'];

export interface Patch {
  op: PatchOp;
  sectionId?: string;
  tokens?: Record<string, any>;
  content?: Record<string, any>;
  variant?: string;
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
  const next = (sections: Section[], tokens: DesignTokens = spec.tokens, notes: string[] = spec.notes, touched: string[] = []): PatchResult => ({
    ok: true,
    spec: { ...spec, sections, tokens, notes, version: spec.version + 1, reason: p.summary || p.op, createdAt: Date.now() },
    touched,
  });
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
      return next(spec.sections.map((x, i) => (i === idx ? sec : x)), undefined, undefined, [sec.id]);
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
  const body = spec.sections
    .map((x, i) => `${i + 1}. [${x.id}] ${x.kind}/${x.variant}${x.images.length ? ` images: ${x.images.join(', ')}` : ''} content: ${JSON.stringify(x.content).slice(0, 900)}`)
    .join('\n');
  return `${head}\nSections:\n${body}`;
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
