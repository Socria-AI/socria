// lib/ux-v0/graphics/styles/registry.ts — every style SocriaUX knows, found by name, by facet or in words.
//
// The built-in library (library-*.ts) is normalized once and kept; custom styles (a person's own, custom.ts) are
// passed in by whoever holds them and normalized the same way, so a custom style is used exactly like a built-in
// one. Search reads plain words — "vintage music poster", "elegant 1920s", "old internet aesthetic" — against each
// profile's names, phrases, tones, occasions, facets and decades. Nothing here is sent anywhere: styleMenu() is the
// compact, retrieved slice a model would be shown, never the whole library.

import { CONTEMPORARY } from './library-contemporary';
import { CULTURAL } from './library-cultural';
import { DIGITAL } from './library-digital';
import { HISTORICAL } from './library-historical';
import { PRINT } from './library-print';
import { normalizeStyleDNA, STYLE_CATEGORIES, type StyleCategory, type StyleDNA, type StyleInput } from './schema';

export const STYLE_SOURCES: Readonly<Record<Exclude<StyleCategory, 'custom'>, readonly StyleInput[]>> = { historical: HISTORICAL, contemporary: CONTEMPORARY, digital: DIGITAL, print: PRINT, cultural: CULTURAL };

let builtIn: readonly StyleDNA[] | null = null;
const notesOf: Record<string, string[]> = {};

/** The built-in styles, normalized once (a profile that loses anything to normalization says so in builtInNotes). */
export function builtInStyles(): readonly StyleDNA[] {
  if (builtIn) return builtIn;
  const out: StyleDNA[] = [];
  for (const cat of STYLE_CATEGORIES) {
    if (cat === 'custom') continue;
    for (const raw of STYLE_SOURCES[cat]) {
      const notes: string[] = [];
      const dna = normalizeStyleDNA({ ...raw, category: cat }, notes);
      if (!dna) continue;
      if (notes.length) notesOf[dna.id] = notes;
      out.push(dna);
    }
  }
  builtIn = out;
  return out;
}
/** What normalization had to leave out of a built-in profile (empty for every profile as shipped: a test holds it). */
export const builtInNotes = (): Readonly<Record<string, string[]>> => (builtInStyles(), notesOf);

const byId = (): Map<string, StyleDNA> => {
  const m = new Map<string, StyleDNA>();
  for (const s of builtInStyles()) m.set(s.id, s);
  return m;
};
let index: Map<string, StyleDNA> | null = null;

/** A style by id: a custom one given in `customs` first (so a person's own version wins), else a built-in one. */
export function styleById(id: string | null | undefined, customs: readonly StyleDNA[] = []): StyleDNA | null {
  if (!id) return null;
  const c = customs.find((s) => s.id === id);
  if (c) return c;
  index ??= byId();
  return index.get(id) ?? null;
}

/** Every style: built-in first, then custom ones (normalized; duplicates of a built-in id are the custom version). */
export function allStyles(customs: readonly StyleDNA[] = []): StyleDNA[] {
  const ids = new Set(customs.map((c) => c.id));
  return [...builtInStyles().filter((s) => !ids.has(s.id)), ...customs];
}

// ── search ──

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'for',
  'to',
  'in',
  'on',
  'with',
  'make',
  'it',
  'this',
  'look',
  'like',
  'use',
  'feel',
  'style',
  'styled',
  'design',
  'aesthetic',
  'poster',
  'graphic',
  'something',
  'some',
  'very',
  'more',
  'less',
  'give',
  'me',
  'my',
  'our',
  'that',
  'is',
  'be',
  'as',
  'by',
]);
const tokensOf = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9’'-]+/)
    .map((t) => t.replace(/[’']s$/, '').replace(/(?<=\w{3})s$/, ''))
    .filter((t) => t && !STOP.has(t));

/** Words that point at a facet without naming it. */
const FACET_WORDS: Record<string, string[]> = {
  retro: ['vintage', 'retro', 'old', 'nostalgic', 'nostalgia', 'classic', 'throwback', 'oldschool'],
  experimental: ['experimental', 'chaotic', 'wild', 'weird', 'radical', 'avant-garde', 'edgy', 'unconventional', 'chaos'],
  minimal: ['minimal', 'minimalist', 'clean', 'simple', 'sparse', 'quiet', 'calm'],
  maximal: ['maximal', 'maximalist', 'busy', 'loud', 'dense', 'everything'],
  luxury: ['luxury', 'luxurious', 'premium', 'elegant', 'refined', 'upscale', 'glamorous'],
  editorial: ['editorial', 'magazine', 'journal', 'publication'],
  print: ['print', 'printed', 'ink', 'press', 'paper'],
  digital: ['digital', 'internet', 'web', 'online', 'computer', 'screen', 'cyber'],
  futuristic: ['futuristic', 'future', 'sci-fi', 'space', 'tech'],
  handmade: ['handmade', 'handcrafted', 'crafted', 'hand-drawn', 'diy', 'artisanal'],
  ornamental: ['ornate', 'ornamental', 'decorative', 'ornament', 'elaborate', 'flourish'],
  typographic: ['typographic', 'typography', 'type', 'lettering', 'letters'],
  geometric: ['geometric', 'geometry', 'shapes'],
  organic: ['organic', 'natural', 'botanical', 'flowing', 'fluid', 'nature'],
  cultural: ['traditional', 'tradition', 'heritage', 'cultural'],
};
/** An occasion said one way and suited under another name (“a music poster” suits gigs, concerts and records). */
const SUIT_SYNONYMS: Record<string, string[]> = {
  music: ['gig', 'concert', 'band', 'record', 'album'],
  gig: ['music', 'concert', 'band'],
  concert: ['music', 'gig', 'band', 'orchestra'],
  tech: ['technology'],
  technology: ['tech'],
  conference: ['symposium', 'summit', 'lecture'],
  academic: ['conference', 'lecture', 'symposium', 'research'],
  party: ['club', 'celebration'],
  club: ['party', 'rave', 'dj'],
  rave: ['club', 'dj', 'techno'],
  exhibition: ['gallery', 'museum'],
  gallery: ['exhibition', 'art'],
  food: ['café', 'bakery', 'diner'],
  fashion: ['beauty', 'couture'],
  perfume: ['beauty', 'fragrance'],
  film: ['cinema', 'screening'],
  book: ['publishing', 'reading', 'literary'],
};
/** Decades, as the styles that belong to them (weight). */
const DECADES: readonly [RegExp, Record<string, number>][] = [
  [/\b(1890s|1900s|fin de siecle|belle epoque)\b/, { 'art-nouveau': 6, jugendstil: 4, 'arts-and-crafts': 3, victorian: 3 }],
  [/\b(1910s)\b/, { futurism: 5, dada: 4, 'italian-futurist-typography': 4, 'de-stijl': 3 }],
  [/\b(1920s|twenties|20s|roaring twenties)\b/, { 'art-deco': 6, constructivism: 4, bauhaus: 4, 'de-stijl': 2 }],
  [/\b(1930s|thirties|30s)\b/, { 'art-deco': 4, 'early-modernist-editorial': 4, bauhaus: 3 }],
  [/\b(1940s|forties|40s)\b/, { 'vintage-advertising': 4, 'retro-comic': 4, 'early-modernist-editorial': 2 }],
  [/\b(1950s|fifties|50s)\b/, { 'mid-century-modern': 6, 'retro-futurism': 4, 'vintage-advertising': 3, 'swiss-international': 2 }],
  [/\b(1960s|sixties|60s)\b/, { psychedelic: 5, 'pop-art': 5, 'op-art': 4, 'swiss-international': 3, 'mid-century-modern': 2, 'polish-poster-school': 2, 'japanese-modernist': 2 }],
  [/\b(1970s|seventies|70s)\b/, { psychedelic: 5, 'new-wave-typography': 3, 'screen-print': 2, 'punk-zine': 3, 'indian-modernist': 2 }],
  [/\b(1980s|eighties|80s)\b/, { memphis: 5, synthwave: 5, postmodernism: 4, 'new-wave-typography': 3, 'chrome-futurism': 3 }],
  [/\b(1990s|nineties|90s)\b/, { grunge: 5, 'underground-music-flyer': 5, webcore: 4, 'experimental-editorial': 3, 'techno-industrial': 3 }],
  [/\b(2000s|noughties|00s|early 2000s|y2k era)\b/, { y2k: 6, 'frutiger-aero': 4, 'early-internet-nostalgia': 5 }],
  [/\b(2010s)\b/, { vaporwave: 4, 'contemporary-minimalism': 3, risograph: 3 }],
];

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
const bounded = (t: string) => new RegExp(`(^|[^a-z0-9])${norm(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
const compiled = new WeakMap<StyleDNA, { name: RegExp | null; words: [string, RegExp][] }>();
/** A profile's name and phrases as word-bounded patterns, compiled once per profile. */
function phrasesOf(s: StyleDNA): { name: RegExp | null; words: [string, RegExp][] } {
  let c = compiled.get(s);
  if (!c) {
    c = { name: s.name.length > 3 ? bounded(s.name) : null, words: s.words.map((w) => [w, bounded(w)] as [string, RegExp]) };
    compiled.set(s, c);
  }
  return c;
}

export interface StyleHit {
  style: StyleDNA;
  score: number;
  why: string[];
}

/** Styles that answer plain words, best first (see the head of this file). */
export function searchStyles(query: string, opts: { customs?: readonly StyleDNA[]; limit?: number; category?: StyleCategory | null; facet?: string | null } = {}): StyleHit[] {
  const q = ` ${query.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()} `;
  const qt = new Set(tokensOf(query));
  const pool = allStyles(opts.customs ?? []).filter((s) => (!opts.category || s.category === opts.category) && (!opts.facet || s.facets.includes(opts.facet as never) || s.category === opts.facet));
  if (!qt.size && q.trim() === '') return pool.map((style) => ({ style, score: 0, why: [] })).slice(0, opts.limit ?? pool.length);
  const expanded = new Set([...qt].flatMap((t) => [t, ...(SUIT_SYNONYMS[t] ?? [])]));
  const decadeBoost: Record<string, number> = {};
  for (const [re, w] of DECADES) if (re.test(q)) for (const [id, v] of Object.entries(w)) decadeBoost[id] = (decadeBoost[id] ?? 0) + v;
  const hits: StyleHit[] = [];
  for (const s of pool) {
    let score = 0;
    const why: string[] = [];
    const re = phrasesOf(s);
    if (re.name && re.name.test(q)) ((score += 14), why.push('named'));
    re.words.forEach(([w, r]) => {
      if (!r.test(q)) return;
      score += 6 + w.split(' ').length * 3;
      why.push(`“${w}”`);
    });
    let suited = 0;
    for (const t of expanded) if (s.suits.includes(t) && suited < 4) (suited++, (score += 2.5), why.push(`suits ${t}`));
    for (const t of qt) {
      if (s.tone.includes(t)) ((score += 4), why.push(`${t} in tone`));
      for (const [facet, words] of Object.entries(FACET_WORDS)) if (words.includes(t) && (s.facets.includes(facet as never) || s.category === facet)) ((score += 3), why.push(facet));
    }
    if (decadeBoost[s.id]) ((score += decadeBoost[s.id]), why.push('the decade'));
    // the description and principles, lightly (a word the profile uses about itself)
    const own = new Set(tokensOf(`${s.description} ${s.principles.join(' ')} ${s.era}`));
    let soft = 0;
    for (const t of qt) if (own.has(t)) soft += 0.75;
    score += Math.min(3, soft);
    if (score > 0) hits.push({ style: s, score: Math.round(score * 100) / 100, why: [...new Set(why)].slice(0, 4) });
  }
  return hits.sort((a, b) => b.score - a.score || a.style.name.localeCompare(b.style.name)).slice(0, opts.limit ?? 12);
}

/** The styles a model would be shown for a request: the few that answer it, each as one compact line — never the
 * whole library (cost, and the model can only choose among what it is shown). */
export function styleMenu(query: string, k = 6, customs: readonly StyleDNA[] = []): string {
  const hits = searchStyles(query, { customs, limit: k });
  const list = hits.length ? hits.map((h) => h.style) : builtInStyles().slice(0, k);
  return list.map((s) => `${s.id}: ${s.name} — ${s.description} Builds with ${s.composition.constructions.join(', ')}; type ${s.typography.display.faces[0]} ${s.typography.display.case}; colour ${s.colour.scheme}.`).join('\n');
}
