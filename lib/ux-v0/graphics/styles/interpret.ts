// lib/ux-v0/graphics/styles/interpret.ts — creative direction in plain words, read into a style request; and a
// style chosen for a brief that names none.
//
// "Make this look like a 1970s psychedelic concert poster", "Swiss typography with Art Nouveau ornamentation",
// "keep the Bauhaus geometry but introduce Y2K metallic treatments", "an Art Deco composition with contemporary
// minimalist typography": the reader finds each style named (by its names and phrases, never by the quoted copy),
// the dimension each one is asked for, how strongly (“a hint of”, “heavily”), how experimental, how ornate and how
// dense, the medium, the tone, the audience and what the brand insists on. It returns a request; blend.ts turns a
// request into one coherent effective profile.
//
// When nothing is named, selectStyles chooses among all the styles for the brief's subject, occasion, tone and
// medium — contemporary modernism is one candidate among many, never the default — and keeps the choices apart from
// one another and from what this project has already seen. Deterministic: no model is called here. A model's answer,
// where one is ever used, is held to the registry by validateStyleRequest before anything reads it.

import { COLOUR_WORDS } from '../compose';
import { allStyles, searchStyles, styleById } from './registry';
import { DIMENSIONS, type Dimension, type StyleDNA } from './schema';
import type { StyleSelection } from './blend';
import { hash32 } from './hash';

export interface StyleRequest {
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
  /** 0–100: how far the secondary colours the design (the tertiary half as far) */
  strength: number;
  /** dimensions taken wholesale from a named style */
  dims: Partial<Record<Dimension, string>>;
  experimentation: number | null;
  ornament: number | null;
  density: number | null;
  medium: string | null;
  audience: string[];
  tone: string[];
  brand: { colours: string[]; keepColours: boolean; keepFonts: boolean; keepLayout: boolean };
  /** the quoted copy, which is never read for style */
  content: string[];
  references: boolean;
  /** a style was named (not only suggested by a decade or a tone) */
  named: boolean;
  says: string[];
}

const QUOTED = /“[^”]*”|"[^"]*"|‘[^’]*’/g;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DIM_AFTER: readonly [Dimension, RegExp][] = [
  ['typography', /^(typography|typographic|type(faces?)?|lettering|letterforms|fonts?|headlines?)\b/],
  ['geometry', /^(geometry|geometric (forms|shapes)|shapes?|forms|motifs?|figures)\b/],
  ['composition', /^(composition|layout|structure|grid|arrangement|framing)\b/],
  ['colour', /^(colou?rs?|palette|colou?r palette|tones)\b/],
  ['texture', /^(metallic|chrome|textures?|treatments?|finish(es)?|surfaces?|grain|effects?|print texture)\b/],
  ['imagery', /^(imagery|images?|photography|photos?|pictures?|illustrations?)\b/],
  ['ornament', /^(ornament(ation|s)?|decoration|decorative|flourish(es)?|borders?|frames?)\b/],
];
const DIM_BEFORE =
  /(typography|type|lettering|fonts?|geometry|shapes?|composition|layout|colou?rs?|palette|textures?|treatments?|imagery|images?|photography|ornament(ation)?|decoration)\s+(from|of|like|in the style of|inspired by|borrowed from)\s+(the\s+|a\s+|an\s+)?$/;
const DIM_OF: Record<string, Dimension> = {
  typography: 'typography',
  type: 'typography',
  lettering: 'typography',
  font: 'typography',
  fonts: 'typography',
  geometry: 'geometry',
  shape: 'geometry',
  shapes: 'geometry',
  composition: 'composition',
  layout: 'composition',
  colour: 'colour',
  colours: 'colour',
  color: 'colour',
  colors: 'colour',
  palette: 'colour',
  texture: 'texture',
  textures: 'texture',
  treatment: 'texture',
  treatments: 'texture',
  imagery: 'imagery',
  image: 'imagery',
  images: 'imagery',
  photography: 'imagery',
  ornament: 'ornament',
  ornamentation: 'ornament',
  decoration: 'ornament',
};

const MEDIUMS: readonly [RegExp, string][] = [
  [/\b(poster|flyer|leaflet)\b/, 'poster'],
  [/\b(instagram|social|story|stories|post)\b/, 'social'],
  [/\b(banner|header)\b/, 'banner'],
  [/\b(ad|advert|advertisement|advertising|campaign)\b/, 'ad'],
  [/\b(album|record|vinyl|cover art)\b/, 'album'],
  [/\b(magazine|editorial spread|cover)\b/, 'magazine'],
  [/\b(book cover|book)\b/, 'book'],
  [/\b(label|packaging|jar|bottle)\b/, 'label'],
  [/\b(card|business card)\b/, 'card'],
  [/\b(infographic|chart)\b/, 'infographic'],
];
const TONES = [
  'elegant',
  'playful',
  'dark',
  'bold',
  'calm',
  'nostalgic',
  'futuristic',
  'luxurious',
  'rebellious',
  'warm',
  'cold',
  'fun',
  'dramatic',
  'serious',
  'friendly',
  'joyful',
  'moody',
  'gritty',
  'dreamy',
  'minimal',
  'loud',
  'quiet',
  'raw',
  'refined',
  'urgent',
  'optimistic',
  'mysterious',
  'energetic',
  'hopeful',
  'romantic',
  'technical',
  'ironic',
];
const AUDIENCE = /\bfor (kids|children|students|teenagers|teens|families|professionals|investors|developers|designers|artists|engineers|scientists|seniors|everyone|young people|adults|collectors|researchers|academics)\b/g;

/** A plain-words direction read into a style request (see the head of this file). */
export function interpretStyle(words: string, opts: { customs?: readonly StyleDNA[] } = {}): StyleRequest {
  const raw = words ?? '';
  const content = [...raw.matchAll(QUOTED)].map((m) => m[0].slice(1, -1));
  const text = ` ${norm(raw.replace(QUOTED, ' ')).replace(/\s+/g, ' ')} `;
  const says: string[] = [];
  // every style named, with where (the longest phrase wins a span; a phrase inside a longer one is not a mention)
  type M = { id: string; at: number; end: number; len: number };
  const found: M[] = [];
  for (const s of allStyles(opts.customs ?? [])) {
    for (const p of [s.name, ...s.words]) {
      const pn = norm(p);
      if (pn.length < 3) continue;
      const re = new RegExp(`(^|[^a-z0-9])(${esc(pn)})(?=[^a-z0-9]|$)`, 'g');
      for (const m of text.matchAll(re)) {
        const at = (m.index ?? 0) + m[1].length;
        found.push({ id: s.id, at, end: at + pn.length, len: pn.length });
      }
    }
  }
  found.sort((a, b) => b.len - a.len || a.at - b.at);
  const kept: M[] = [];
  for (const f of found) if (!kept.some((k) => f.at >= k.at && f.end <= k.end)) kept.push(f);
  const byStyle = new Map<string, M>();
  for (const k of kept.sort((a, b) => a.at - b.at)) if (!byStyle.has(k.id)) byStyle.set(k.id, k);
  const mentions = [...byStyle.values()].sort((a, b) => a.at - b.at);
  // the dimension each mention is asked for
  const dims: Partial<Record<Dimension, string>> = {};
  const dimOf = new Map<string, Dimension[]>();
  for (const m of mentions) {
    const after = text
      .slice(m.end)
      .replace(/^[\s,’'-]+/, '')
      .replace(/^(style|styled|inspired|influenced|era)\s+/, '');
    const before = text.slice(Math.max(0, m.at - 60), m.at);
    const got: Dimension[] = [];
    for (const [d, re] of DIM_AFTER) if (re.test(after)) got.push(d);
    const b = before.match(DIM_BEFORE);
    if (b && DIM_OF[b[1]]) got.push(DIM_OF[b[1]]);
    if (got.length) {
      dimOf.set(m.id, got);
      for (const d of got) dims[d] ??= m.id;
    }
  }
  // the dominant language: the one asked for its composition, else the first named
  const ordered = mentions.map((m) => m.id);
  const compositional = dims.composition ?? null;
  let primary = compositional ?? ordered[0] ?? null;
  const rest = ordered.filter((id) => id !== primary);
  let secondary: string | null = rest[0] ?? null;
  let tertiary: string | null = rest[1] ?? null;
  const named = !!primary;
  // nothing named: a decade or a tone may still point somewhere (a suggestion, not a mention)
  if (!primary) {
    const hit = searchStyles(raw.replace(QUOTED, ' '), { customs: opts.customs ?? [], limit: 3 }).filter((h) => h.score >= 8);
    if (hit[0]) {
      primary = hit[0].style.id;
      says.push(`No style was named; “${hit[0].why.slice(0, 2).join(', ')}” suggests ${hit[0].style.name}.`);
    }
    secondary = null;
    tertiary = null;
  }
  // how strongly the others are asked for
  let strength = secondary ? 45 : 0;
  if (secondary) {
    if (/\b(a (hint|touch|whisper) of|slight(ly)?|subtle|a little|lightly|faint)\b/.test(text)) strength = 25;
    else if (/\b(influences?|inspired|touches of|elements of|accents?)\b/.test(text)) strength = 40;
    if (/\b(heavily|strongly|very|lots of|dominant|a lot of|plenty of)\b/.test(text)) strength = 75;
    if (/\b(equal(ly)?|half and half|fifty-fifty|50\/50)\b/.test(text)) strength = 60;
  }
  const level = (hi: RegExp, lo: RegExp): number | null => (hi.test(text) ? 80 : lo.test(text) ? 22 : null);
  const experimentation = level(/\b(experimental|chaotic|wild|radical|edgy|daring|weird|unexpected|push it|break the rules)\b/, /\b(restrained|calm|quiet|clean|classic|conservative|safe|sober|understated)\b/);
  const ornament = level(/\b(ornate|elaborate|lavish|opulent|highly decorative|more ornament|decorated|ornamental)\b/, /\b(no ornament|unadorned|plain|no decoration|undecorated|stripped back)\b/);
  const density = level(/\b(dense|busy|packed|crowded|maximal|full)\b/, /\b(airy|spacious|sparse|breathing room|lots of space|empty)\b/);
  const medium = MEDIUMS.find(([re]) => re.test(text))?.[1] ?? null;
  const tone = TONES.filter((t) => new RegExp(`\\b${t}\\b`).test(text));
  const audience = [...text.matchAll(AUDIENCE)].map((m) => m[1]);
  const colours: string[] = [];
  for (const [re, hex] of COLOUR_WORDS) if (new RegExp(re.source, re.flags.replace('g', '')).test(text) && !colours.includes(hex)) colours.push(hex);
  const brand = {
    colours: colours.slice(0, 3),
    keepColours: /\b(keep|same|existing|current|our|brand|retain)\s+(the\s+)?colou?rs?\b|\busing the same colou?rs\b|\bkeep the palette\b/.test(text),
    keepFonts: /\b(keep|same|existing|current|our|brand|retain)\s+(the\s+)?(typography|fonts?|type(faces?)?)\b|\btypography unchanged\b/.test(text),
    keepLayout: /\b(keep|preserve|same|existing|current|retain)\s+(the\s+)?(layout|composition|structure)\b|\bwithout changing the layout\b/.test(text),
  };
  const references = /\b(reference|this image|the image i (uploaded|added)|match the (look|visual language))\b/.test(text);
  if (primary) {
    const p = styleById(primary, opts.customs ?? []);
    says.push(named ? `${p?.name ?? primary} leads${compositional ? ' (asked for its composition)' : ''}.` : (says.pop() ?? ''));
  }
  for (const [d, id] of Object.entries(dims)) if (id !== primary || (dimOf.get(id)?.length ?? 0) > 0) says.push(`${capital(d)} from ${styleById(id, opts.customs ?? [])?.name ?? id}.`);
  if (secondary && !Object.values(dims).includes(secondary)) says.push(`${styleById(secondary, opts.customs ?? [])?.name ?? secondary} as an influence (${strength}%).`);
  return { primary, secondary, tertiary, strength, dims, experimentation, ornament, density, medium, audience, tone, brand, content, references, named, says: says.filter(Boolean) };
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A request as a selection blend.ts can use (null when no style could be read). */
export function selectionOf(r: StyleRequest, customs: readonly StyleDNA[] = []): StyleSelection | null {
  if (!r.primary) return null;
  const dims = Object.fromEntries(Object.entries(r.dims).filter(([, id]) => id !== r.primary)) as Partial<Record<Dimension, string>>;
  const used = new Set([r.primary, r.secondary, r.tertiary, ...Object.values(dims)].filter(Boolean) as string[]);
  return {
    primary: r.primary,
    ...(r.secondary ? { secondary: r.secondary } : {}),
    ...(r.tertiary ? { tertiary: r.tertiary } : {}),
    strength: r.secondary ? r.strength : 0,
    ...(Object.keys(dims).length ? { dims } : {}),
    ...(r.experimentation !== null ? { experimentation: r.experimentation } : {}),
    ...(r.ornament !== null ? { ornament: r.ornament } : {}),
    ...(r.density !== null ? { density: r.density } : {}),
    ...(customs.some((c) => used.has(c.id)) ? { customs: customs.filter((c) => used.has(c.id)) } : {}),
  };
}

/** A request from a model, held to the registry: unknown styles and dimensions dropped (each said), numbers clamped. */
export function validateStyleRequest(raw: unknown, customs: readonly StyleDNA[] = []): { request: StyleRequest | null; notes: string[] } {
  const notes: string[] = [];
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id = (v: unknown, what: string): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && styleById(v, customs)) return v;
    notes.push(`A ${what} style SocriaUX does not have (“${String(v).slice(0, 32)}”) was left out.`);
    return null;
  };
  const primary = id(r.primary, 'primary');
  if (!primary) return { request: null, notes: [...notes, 'No style SocriaUX has was asked for.'] };
  const dims: Partial<Record<Dimension, string>> = {};
  for (const [k, v] of Object.entries((r.dims && typeof r.dims === 'object' ? r.dims : {}) as Record<string, unknown>)) {
    if (!(DIMENSIONS as readonly string[]).includes(k)) {
      notes.push(`A dimension SocriaUX does not know (“${k.slice(0, 24)}”) was left out.`);
      continue;
    }
    const s = id(v, k);
    if (s) dims[k as Dimension] = s;
  }
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);
  const strs = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.slice(0, 40))
          .slice(0, max)
      : [];
  const b = (r.brand && typeof r.brand === 'object' ? r.brand : {}) as Record<string, unknown>;
  return {
    request: {
      primary,
      secondary: id(r.secondary, 'secondary'),
      tertiary: id(r.tertiary, 'tertiary'),
      strength: n(r.strength) ?? 45,
      dims,
      experimentation: n(r.experimentation),
      ornament: n(r.ornament),
      density: n(r.density),
      medium: typeof r.medium === 'string' ? r.medium.slice(0, 24) : null,
      audience: strs(r.audience, 4),
      tone: strs(r.tone, 6),
      brand: { colours: strs(b.colours, 3).filter((c) => /^#[0-9a-f]{6}$/i.test(c)), keepColours: b.keepColours === true, keepFonts: b.keepFonts === true, keepLayout: b.keepLayout === true },
      content: [],
      references: false,
      named: true,
      says: [],
    },
    notes,
  };
}

// ── choosing a style for a brief that names none ──

/** Where each kind of graphic tends to find its languages (a lean, never a rule). */
const KIND_FACET: Record<string, Partial<Record<string, number>>> = {
  magazine: { editorial: 4, typographic: 1 },
  book: { editorial: 2, typographic: 2, minimal: 1 },
  album: { experimental: 3, geometric: 2, retro: 1 },
  label: { handmade: 2, ornamental: 3, print: 2 },
  card: { minimal: 2, editorial: 1 },
  infographic: { minimal: 2, geometric: 1 },
  ad: { commercial: 3 },
  social: { digital: 1, contemporary: 1 },
  banner: { minimal: 1, contemporary: 1 },
  poster: {},
  announcement: { editorial: 1 },
  identity: { geometric: 2, minimal: 1 },
};
/** The contemporary corporate cluster: chosen when a brief asks for it, never by default. */
const MODERN_DEFAULTS = new Set(['contemporary-minimalism', 'corporate-modernism', 'premium-product-advertising']);
/** When a brief says nothing that points anywhere: a varied set, never one house look. */
const OPEN_SET = ['swiss-international', 'bauhaus', 'risograph', 'art-deco', 'experimental-typography', 'japanese-modernist', 'memphis', 'neo-brutalism', 'cut-paper-collage', 'constructivism', 'screen-print', 'retro-futurism'];

const hashOf = hash32;

export interface StyleChoice {
  style: StyleDNA;
  score: number;
  why: string[];
}

/**
 * Styles for a brief that names none, best first, `count` of them kept apart (another category or another
 * construction from those already chosen) and away from what the project has `seen`.
 */
export function selectStyles(input: { words: string; mood?: readonly string[]; kind?: string; hasImage?: boolean }, opts: { count?: number; seen?: readonly string[]; salt?: string; customs?: readonly StyleDNA[] } = {}): StyleChoice[] {
  const count = Math.max(1, opts.count ?? 3);
  const text = `${(input.words ?? '').replace(QUOTED, ' ')} ${(input.mood ?? []).join(' ')}`;
  const seen = new Set(opts.seen ?? []);
  const salt = opts.salt ?? text;
  const pool = allStyles(opts.customs ?? []);
  const hits = new Map(searchStyles(text, { customs: opts.customs ?? [], limit: pool.length }).map((h) => [h.style.id, h]));
  const kindLean = KIND_FACET[input.kind ?? ''] ?? {};
  const scored: StyleChoice[] = pool.map((style) => {
    const h = hits.get(style.id);
    let score = h?.score ?? 0;
    const why = [...(h?.why ?? [])];
    for (const [f, w] of Object.entries(kindLean)) if (w && (style.facets.includes(f as never) || style.category === f)) ((score += w), why.push(`suits a ${input.kind}`));
    if (input.hasImage && style.imagery.photo >= 60) score += 1.5;
    if (!input.hasImage && style.composition.focal === 'image') score -= 1.5;
    if (MODERN_DEFAULTS.has(style.id) && !(h?.why ?? []).some((w) => w.startsWith('“'))) score -= 2.5;
    if (seen.has(style.id)) score -= 8;
    score += ((hashOf(`${salt}|${style.id}`) % 1000) / 1000) * 1.5;
    return { style, score: Math.round(score * 100) / 100, why: [...new Set(why)].slice(0, 4) };
  });
  scored.sort((a, b) => b.score - a.score);
  const strong = scored.filter((s) => s.score >= 3.5);
  const picked: StyleChoice[] = [];
  const take = (list: readonly StyleChoice[]) => {
    for (const c of list) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.style.id === c.style.id)) continue;
      const clash = picked.some((p) => p.style.category === c.style.category && p.style.composition.constructions[0] === c.style.composition.constructions[0]);
      if (!clash) picked.push(c);
    }
  };
  take(strong);
  if (picked.length < count) {
    // nothing (or not enough) points anywhere: an open, varied set rotated by the project, still away from `seen`
    const start = hashOf(salt) % OPEN_SET.length;
    const open = [...OPEN_SET.slice(start), ...OPEN_SET.slice(0, start)].map((id) => scored.find((s) => s.style.id === id)).filter((c): c is StyleChoice => !!c && !seen.has(c.style.id));
    take(open.map((c) => ({ ...c, why: c.why.length ? c.why : ['an open choice: the brief names no style'] })));
    take(scored);
  }
  return picked.slice(0, count);
}
