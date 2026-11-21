// lib/ux-v0/graphics/compose.ts — a graphic composed from a brief and an approved direction, as an editable document.
//
// The same engine makes every format: a poster, a story, a carousel, a cover, a card, a label, an infographic, an
// identity board. What it is for (the brief's kind), how much it says (the content), what it may use (the designer's
// pictures) and the direction (its colours, faces, case and tracking, its shape system, its spatial logic) decide a
// PLAN before any object is placed: the focal point, the hierarchy, the grid, how the colour is used, whether shapes
// appear and what they are. Then one archetype lays the plan out on the artboard's own grid. Every word is text, every
// shape a vector of the direction's own shape system (lib/ux-v0/form.ts), every picture a reference to an asset: the
// result is edited like anything else, nothing is flattened.
//
// The words are the designer's. Where the brief gives none for something the layout needs (a date, a place), a
// bracketed placeholder stands there, and the checks list it to fill: SocriaUX does not invent facts.
//
// Deterministic: the same brief, direction and seed make the same design. No model is called here.

import { contrastRatio } from '../../ux/audit';
import { figureFor, type FormSystem } from '../form';
import { hasItalic, nearestWeight } from '../fonts';
import type { ShapeRecipe } from '../shape';
import { ensureContrast } from '../spec';
import type { Artboard, ChartDatum, GraphicDoc, Node, Role, TextNode, Tokens } from './doc';
import { newId, normalizeDoc, walk } from './doc';
import { formatFromWords, formatOf, type Format } from './formats';
import { approxMeasure, fitSize, layoutText, type Measure } from './text';
import { effectDefaults, type Effect } from './effects';
import { primDefaults, PRIMITIVE_BY_KIND, type Prim } from './geometry';
import { mixColor, tintPreset, type Gradient, type Paint } from './paint';
import { isPxParam, PATTERN_BY_KIND } from './patterns';
import { NEW_ARCHETYPES, vocabularyFor, vocabularyRecord, type InkRole, type PatternUse, type TypeTreatment, type VisualVocabulary } from './vocabulary';
import { runFor, type StyleRun } from './styles/apply';
import type { StyleSelection } from './styles/blend';
import { styleLayouts } from './styles/constructions';
import { CONSTRUCTIONS, isStyleConstruction, type StyleConstruction } from './styles/schema';
import { renderComposition } from './composition/render';
import { refineDoc } from './check';
import { generate, type GenerativeRequest } from './generative/engine';
import type { CreativeConcept } from './generative/concept';
import { conceptRecord } from './generative/record';
import { describePlan, FAMILY_BY_ID, type CompositionPlan, type FamilyInfo } from './composition/schema';

export const GRAPHIC_KINDS = ['poster', 'social', 'carousel', 'ad', 'banner', 'magazine', 'book', 'album', 'card', 'label', 'infographic', 'identity', 'announcement', 'presentation', 'campaign'] as const;
export type GraphicKind = (typeof GRAPHIC_KINDS)[number];

export interface GraphicContent {
  /** the main words, exactly as given */
  headline: string;
  subhead?: string;
  body?: string;
  cta?: string;
  /** small facts: a date, a place, an address, a price */
  meta?: string[];
  /** the brand or author name */
  brand?: string;
  /** points: carousel slides, cover lines, steps, takeaways */
  items?: string[];
  /** numbers to chart, never invented */
  data?: ChartDatum[];
  dataSource?: string;
  dataUnit?: string;
}

export interface GraphicBrief {
  purpose: string;
  kind: GraphicKind;
  /** preset ids: one artboard each (a carousel makes several of its one format) */
  formats: string[];
  content: GraphicContent;
  mood: string[];
  /** the designer's pictures, by asset id */
  images: string[];
}

/** What a direction gives a graphic: its tokens, the parts of its look that shape type and space, its shapes. */
export interface GraphicDirection {
  name: string;
  language: string;
  concept?: string;
  tokens: Tokens;
  look: { case: 'sentence' | 'upper' | 'lower'; tracking: 'tight' | 'normal' | 'wide'; weight: number; motifs?: string[]; frame?: string; buttons?: string; trackingValue?: number; lineHeight?: number };
  form?: FormSystem | null;
  /** the spatial logic (lib/ux-v0/strategy.ts axis) and how loud the type may be */
  axis?: 'orthogonal' | 'diagonal' | 'radial' | 'scattered' | 'layered';
  typeRole?: 'structural' | 'editorial' | 'quiet' | 'functional';
  /** 0 restrained … 100 expressive */
  intensity: number;
  /** the design language the direction is built in (styles/*): its construction, palette, faces and vocabulary */
  style?: StyleSelection;
  /** how it is composed (composition/*): planned apart from the style, so one style can be composed many ways */
  composition?: CompositionPlan;
  /** what the generative engine is asked for (generative/*): a seed, a lead, constraints; the default engine */
  generative?: GenerativeRequest;
  /** 'templates' composes from the stored layouts (an optional starting point); the default is the generative engine */
  engine?: 'generative' | 'templates';
}

export interface Plan {
  archetype: Archetype;
  focal: 'type' | 'image' | 'shape' | 'data';
  /** the order the eye should take */
  hierarchy: Role[];
  colour: 'ground' | 'inverse' | 'accent-field';
  shapes: 'none' | 'motif' | 'mass' | 'pattern' | 'frame';
  /** each decision, with its reason */
  said: string[];
  /** the visual vocabulary chosen for the brief (vocabulary.ts) */
  vocabulary?: VisualVocabulary;
  /** the composition's strategy, decided before placing: what organises it and how full it is */
  strategy?: Strategy;
  /** the design language it is built in, and the construction it builds with */
  style?: { id: string; name: string; construction: string; variant: string };
  /** the style as the composer uses it (not kept with the document) */
  run?: StyleRun;
  /** the brief asked for a pattern in so many words ("generative, procedural", "a halftone pattern"): answered in any
   * language, where the construction leaves room */
  patternAsked?: boolean;
  /** the Composition Plan it is drawn from, when one was planned (composition/schema.ts) */
  composition?: CompositionPlan;
  /** what the generative engine was asked for, and (once drawn) the concept it worked out */
  generativeRequest?: GenerativeRequest;
  generative?: { concept: CreativeConcept; signature: string; trace: string[]; unresolved: string[]; problems: string[]; attempts: number };
}

/** How a composition is organised, said as decisions (the layout system, the type, the picture, the shapes, the
 * colour, the space, the density, the contrast and the rhythm). */
export interface Strategy {
  layout: 'column' | 'modular' | 'asymmetric' | 'radial' | 'diagonal' | 'freeform' | 'editorial' | 'layered' | 'full-bleed' | 'split' | 'collage' | 'typographic' | 'image-dominant' | 'centred';
  type: string;
  image: string;
  shapes: string;
  colour: string;
  space: 'generous' | 'balanced' | 'dense';
  density: number;
  contrast: 'soft' | 'medium' | 'high';
  rhythm: 'regular' | 'syncopated' | 'radiating' | 'flowing' | 'stacked';
}

export const ARCHETYPES = ['type-poster', 'image-full', 'image-split', 'minimal', 'swiss', 'statement', 'masthead', 'book', 'album', 'card', 'label', 'infographic', 'process', 'identity', 'banner', 'carousel', 'composition', 'generative', ...NEW_ARCHETYPES] as const;
export type Archetype = (typeof ARCHETYPES)[number] | StyleConstruction;

// ── reading a graphic brief from words ──

const KIND_WORDS: readonly [RegExp, GraphicKind][] = [
  [/\bcarousel\b/, 'carousel'],
  [/\b(brand (identity|board|presentation)|identity (system|board|presentation)|logo and (palette|colours?))\b/, 'identity'],
  [/\b(infographic|chart|statistic|statistical|data (graphic|visual)|comparison graphic|diagram|timeline|process graphic)\b/, 'infographic'],
  [/\bmagazine\b/, 'magazine'],
  [/\bbook cover\b|\bnovel\b|\bpaperback\b/, 'book'],
  [/\balbum\b|\bep\b|\bsingle cover\b|\bvinyl\b|\bcover art\b/, 'album'],
  [/\bbusiness cards?\b/, 'card'],
  [/\blabel\b|\bpackaging\b|\bjar\b|\bbottle\b/, 'label'],
  [/\bcampaign\b|\bset of (ads|assets|graphics)\b|\bmulti-?format\b/, 'campaign'],
  [/\b(web )?banner\b|\bleaderboard\b|\bheader image\b/, 'banner'],
  [/\b(advert|advertisement|\bad\b|promo(tion)?|product launch)\b/, 'ad'],
  [/\b(slide|presentation|keynote)\b/, 'presentation'],
  [/\b(linkedin|announcement|announcing|we('| a)re hiring|launch post)\b/, 'announcement'],
  [/\b(instagram|social (media )?(post|graphic)|story|stories|tiktok)\b/, 'social'],
  [/\b(poster|flyer|leaflet|event graphic|gig|exhibition|festival|concert)\b/, 'poster'],
];

/** Quoted words, in order: double quotes (curly or straight) pair cleanly; a single quote opens only after a space or
 * the start and closes only before a space or punctuation, so an apostrophe inside a word ("Earth’s") never ends one. */
const QUOTE = /“([^”]{2,160})”|"([^"]{2,160})"|(?<![\p{L}\p{N}])[‘']((?:[^‘’']|[’'](?=\p{L}))+?)[’'](?![\p{L}\p{N}])/gu;
const quoted = (words: string): string[] =>
  [...words.matchAll(QUOTE)]
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? '').trim())
    .filter((s) => s.length > 1);

/** A graphic brief read from a designer's words (see the head of this file): kind, format, wording, mood. */
export function readGraphicBrief(words: string, extra: Partial<GraphicBrief> = {}): GraphicBrief {
  const n = words.toLowerCase();
  const kind = extra.kind ?? KIND_WORDS.find(([re]) => re.test(n))?.[1] ?? 'poster';
  const fmt = formatFromWords(words);
  const defaults: Record<GraphicKind, string[]> = {
    poster: ['a4'],
    social: ['instagram-square'],
    carousel: ['instagram-square'],
    ad: ['instagram-portrait'],
    banner: ['banner-wide'],
    magazine: ['magazine'],
    book: ['book'],
    album: ['album'],
    card: ['business-card'],
    label: ['label'],
    infographic: ['instagram-portrait'],
    identity: ['presentation'],
    announcement: ['linkedin'],
    presentation: ['presentation'],
    campaign: ['instagram-square', 'story', 'landscape', 'a4'],
  };
  const formats = extra.formats?.length ? extra.formats : kind === 'campaign' || !fmt ? defaults[kind] : [fmt.id];
  const q = quoted(words);
  // the headline: the first words in quotes, exactly; else the brief's own subject (its words, not new ones)
  const subject = words
    .replace(QUOTE, '')
    .replace(/^\s*(an?|the|make|create|design|generate)\s+/i, '')
    .replace(/\b(poster|flyer|graphic|post|carousel|advertisement|ad|banner|cover|card|label|infographic|story|for|an?|the|instagram|linkedin|social media)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const headline = extra.content?.headline ?? q[0] ?? (subject ? subject.charAt(0).toUpperCase() + subject.slice(1, 60) : '[Headline]');
  const dates = (words.match(/\b\d{1,2}(?:[–-]\d{1,2})?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:[–-]\d{1,2})?(?:,?\s+\d{4})?\b|\b(?:every|each)\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day(?:\s+in\s+(?:jan|feb|march|april|may|june|july|aug|sept?|oct|nov|dec)[a-z]*)?\b/gi) ?? []).map((d) => d.charAt(0).toUpperCase() + d.slice(1));
  const mood = [...new Set((words.match(/\b(minimal|minimalist|restrained|quiet|luxurious|luxury|bold|loud|experimental|playful|editorial|brutalist|technical|scientific|organic|warm|cinematic|futuristic|retro|corporate|elegant|geometric|maximalist|swiss|calm|raw|daring|premium|friendly|serious)\b/gi) ?? []).map((m) => m.toLowerCase()))];
  return {
    purpose: words.trim().slice(0, 600),
    kind,
    formats,
    content: {
      headline,
      ...(kind === 'carousel' || kind === 'infographic' ? (q.length > 1 ? { items: q.slice(1, 10) } : {}) : { ...(q[1] ? { subhead: q[1] } : {}), ...(q.length > 2 ? { items: q.slice(2, 10) } : {}) }),
      ...(dates.length ? { meta: dates.slice(0, 3) } : {}),
      ...extra.content,
    },
    mood: extra.mood ?? mood,
    images: extra.images ?? [],
  };
}

// ── the accent a graphic's directions start from ──

export const COLOUR_WORDS: readonly [RegExp, string, string][] = [
  [/\b(red|crimson|scarlet)\b/, '#c8102e', 'red'],
  [/\b(vermilion|orange|tangerine)\b/, '#e4572e', 'orange'],
  [/\b(coral|salmon|peach)\b/, '#ef6f57', 'coral'],
  [/\b(pink|magenta|fuchsia)\b/, '#d63384', 'pink'],
  [/\b(gold|golden|mustard|saffron|amber)\b/, '#c9962b', 'gold'],
  [/\b(yellow|lemon)\b/, '#f2c230', 'yellow'],
  [/\b(green|forest|emerald)\b/, '#2f6b45', 'green'],
  [/\b(olive|sage|moss)\b/, '#6b7a3a', 'olive'],
  [/\b(teal|turquoise|aqua)\b/, '#1b8077', 'teal'],
  [/\b(blue|cobalt|azure)\b/, '#2556c4', 'blue'],
  [/\b(navy|indigo)\b/, '#1f2a5c', 'navy'],
  [/\b(purple|violet|lilac|lavender)\b/, '#6a3fb5', 'violet'],
  [/\b(brown|chocolate|walnut)\b/, '#6b4226', 'brown'],
  [/\b(burgundy|wine|maroon|oxblood)\b/, '#7a1f2b', 'burgundy'],
  [/\b(black|monochrome|noir)\b/, '#1a1a1a', 'black'],
  [/\b(grey|gray|silver|concrete)\b/, '#5f6670', 'grey'],
];
const MOOD_HUES: readonly [RegExp, string[], string][] = [
  [/\b(warm|fire|fired|ember|sunset|autumn|harvest|honey|terracotta|clay)\b/, ['#c4552d', '#c9962b', '#9c3d2a'], 'warm'],
  [/\b(luxur\w*|elegant|premium|couture|fashion|jewel\w*)\b/, ['#1a1a1a', '#7a1f2b', '#a4823a'], 'luxury'],
  [/\b(futuris\w*|electronic|neon|cyber|techno|festival)\b/, ['#6a3fe0', '#00a6c8', '#e0287a'], 'electric'],
  [/\b(calm|quiet|serene|soft|gentle|wellness|yoga)\b/, ['#5f7f74', '#7b8fa6', '#a7825b'], 'calm'],
  [/\b(scien\w*|research|data|statistic\w*|academic|university|technical|technology|conference)\b/, ['#1f4fa8', '#14706b', '#24324d'], 'precise'],
  [/\b(playful|fun|kids|children|friendly|joy\w*)\b/, ['#f06449', '#e0a516', '#2b9ed8'], 'playful'],
  [/\b(corporate|business|finance|consult\w*|office)\b/, ['#1d4ed8', '#1f2a44', '#0f766e'], 'corporate'],
  [/\b(organic|natur\w*|botanic\w*|garden|river|water|eco)\b/, ['#2f6b45', '#4d6b2f', '#1b6f8a'], 'natural'],
  [/\b(bold|loud|daring|protest|urgent|awareness)\b/, ['#d7261e', '#ff5a1f', '#1a1a1a'], 'loud'],
  [/\b(experimental|avant|abstract|art|gallery|exhibition)\b/, ['#e4402d', '#2541b2', '#111111'], 'experimental'],
  [/\b(restaurant|food|menu|kitchen|coffee|bakery|wine)\b/, ['#b5472c', '#6b4226', '#7a1f2b'], 'appetite'],
  [/\b(music|album|band|record|night)\b/, ['#4b2bd6', '#d6336c', '#0e7c86'], 'night'],
];
export const SPREAD = ['#d9472b', '#2a4fd6', '#c8901a', '#6b2d5c', '#1c7c74', '#1d1d1b', '#ef6f57', '#2f5d3a', '#3a2fd6', '#7a1f2b', '#e0a516', '#3d4a5c'];
const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 2166136261);

/** The accent a graphic's directions start from, and why: a colour the brief names; else one its mood and subject
 * suggest (one of a few, by the project); else one of a dozen well-spread accents, by the project. The direction
 * engine then gives each visual language its own way with it (lib/ux-v0/direction.ts paletteFor). */
export function accentFor(brief: Pick<GraphicBrief, 'purpose' | 'mood' | 'content'>, salt: string): { hex: string; why: string } {
  const words = `${brief.purpose} ${brief.mood.join(' ')}`.toLowerCase();
  const named = COLOUR_WORDS.find(([re]) => re.test(words));
  if (named) return { hex: named[1], why: `the accent is ${named[2]}, because the brief says so` };
  const h = hashOf(`${salt}|${brief.content.headline}`);
  const mood = MOOD_HUES.find(([re]) => re.test(words));
  if (mood) return { hex: mood[1][h % mood[1].length], why: `the accent follows the brief’s ${mood[2]} character` };
  return { hex: SPREAD[h % SPREAD.length], why: 'the brief names no colour, so the accent is chosen for this project' };
}

// ── from a direction ──

/** The parts of an approved website direction (lib/ux-v0/direction.ts) a graphic uses. */
export function graphicDirectionOf(d: {
  name: string;
  language: string;
  concept?: string;
  tokens: { colors: Tokens['colors'] & Record<string, string>; fonts: Tokens['fonts'] };
  look: { case?: string; tracking?: string; weight?: number; motifs?: string[]; frame?: string; buttons?: string; accent2?: string; form?: FormSystem };
  strategy?: { axis?: string; type?: { role?: string } } | null;
  dna?: Record<string, number> | null;
}): GraphicDirection {
  const c = d.tokens.colors;
  const quietLang = ['gallery', 'quiet-luxury', 'swiss', 'civic', 'utility'].includes(d.language);
  const loudLang = ['poster', 'brutal', 'maximal', 'future', 'night', 'retro-print'].includes(d.language);
  const form = d.look.form ?? null;
  const energy = form ? form.energy : 50;
  const intensity = Math.max(0, Math.min(100, Math.round(energy * 0.5 + (loudLang ? 35 : quietLang ? 0 : 18) + (d.strategy?.type?.role === 'structural' ? 15 : 0))));
  return {
    name: d.name,
    language: d.language,
    ...(d.concept ? { concept: d.concept } : {}),
    tokens: { colors: { background: c.background, surface: c.surface, text: c.text, muted: c.muted, accent: c.accent, accentText: c.accentText, line: c.line }, fonts: { display: d.tokens.fonts.display, body: d.tokens.fonts.body }, ...(d.look.accent2 ? { accent2: d.look.accent2 } : {}) },
    look: { case: d.look.case === 'upper' ? 'upper' : 'sentence', tracking: (['tight', 'normal', 'wide'].includes(d.look.tracking ?? '') ? d.look.tracking : 'normal') as 'tight' | 'normal' | 'wide', weight: d.look.weight ?? 600, motifs: d.look.motifs ?? [], frame: d.look.frame, buttons: d.look.buttons },
    form,
    ...(d.strategy?.axis && ['orthogonal', 'diagonal', 'radial', 'scattered', 'layered'].includes(d.strategy.axis) ? { axis: d.strategy.axis as GraphicDirection['axis'] } : {}),
    ...(d.strategy?.type?.role && ['structural', 'editorial', 'quiet', 'functional'].includes(d.strategy.type.role) ? { typeRole: d.strategy.type.role as GraphicDirection['typeRole'] } : {}),
    intensity,
  };
}

// ── the plan ──

/** The composition decided before anything is placed (see the head of this file). */
/**
 * A composition asked for from outside the planner: a Board's coordinated materials share one system and differ in
 * composition, so a second poster may ask for another archetype or another use of the palette. Only what fits is
 * taken: a picture-led archetype needs a picture, and kinds whose composition the kind decides keep it.
 */
export interface PlanOverride {
  archetype?: Archetype;
  colour?: Plan['colour'];
  /** a vocabulary given from outside the planner (a Board's shared one, or a model's validated plan) */
  vocabulary?: VisualVocabulary;
  /** a Board sibling's turn through its style's constructions (material-specific interpretation) */
  styleIndex?: number;
  /** a Composition Plan to draw (the explorer's candidate, a Board material's own, an edit's) */
  composition?: CompositionPlan;
  /** a request for the generative engine (a Board material's own lead, an edit's constraints, an interpretation) */
  generative?: GenerativeRequest;
  /** 'templates': the stored layouts as the starting point */
  engine?: 'generative' | 'templates';
}

/** Whether a family can compose this brief in this frame: the kind lets the composition be chosen, a very wide frame
 * suits it, the picture it needs is there, the numbers it charts were given. */
export function compositionFits(fam: FamilyInfo, brief: Pick<GraphicBrief, 'kind' | 'images' | 'content'>, aspect: number): boolean {
  // a strip (a leaderboard, a skyscraper) is past what a composition family can express: the strip layouts set those
  return FREE_KINDS.includes(brief.kind) && aspect >= 0.3 && (aspect <= 2.2 || (!!fam.wide && aspect <= 4)) && (fam.image !== 'required' || brief.images.length > 0) && (!fam.data || (brief.content.data?.length ?? 0) > 0);
}
const FREE_ARCHETYPES: readonly Archetype[] = ['type-poster', 'image-full', 'image-split', 'minimal', 'swiss', 'statement'];
const FREE_KINDS: readonly GraphicKind[] = ['poster', 'social', 'ad', 'announcement', 'presentation', 'campaign'];

export function planFor(brief: GraphicBrief, dir: GraphicDirection, f: Format, opts: { slide?: number; over?: PlanOverride } = {}): Plan {
  const said: string[] = [];
  const hasImage = brief.images.length > 0;
  // the brief's own mood outranks the direction's default volume: an experimental brief in a quiet language is not quiet
  const moodQuiet = brief.mood.some((m) => ['minimal', 'minimalist', 'restrained', 'quiet', 'calm', 'elegant'].includes(m));
  const moodLoud = brief.mood.some((m) => ['bold', 'loud', 'experimental', 'brutalist', 'maximalist', 'daring', 'raw'].includes(m));
  const restrained = moodQuiet || (!moodLoud && dir.intensity < 35);
  const loud = moodLoud || (!moodQuiet && dir.intensity >= 62);
  const aspect = f.width / f.height;
  let archetype: Archetype;
  switch (brief.kind) {
    case 'carousel':
      archetype = 'carousel';
      said.push('A carousel: a cover that stops the scroll, one point a slide, an ending that says what to do.');
      break;
    case 'magazine':
      archetype = 'masthead';
      said.push('A magazine cover: the masthead across the top, one picture or field carrying the issue, cover lines down one side.');
      break;
    case 'book':
      archetype = 'book';
      said.push('A book cover: the title as the image, the author named plainly, one shape of the direction as its emblem.');
      break;
    case 'album':
      archetype = 'album';
      said.push('An album cover: an abstract composition of the direction’s shapes; the title small, as a record label would.');
      break;
    case 'card':
      archetype = 'card';
      said.push('A business card: the name first, then the role and how to reach them; the brand on its own side.');
      break;
    case 'label':
      archetype = 'label';
      said.push('A label: an emblem and the product’s name on the axis, the details small and ordered, a frame to hold them.');
      break;
    case 'infographic':
      archetype = brief.content.data?.length ? 'infographic' : 'process';
      said.push(brief.content.data?.length ? 'An infographic: the chart drawn from the numbers given, the takeaway in words, the source said.' : 'A diagram of the steps given, in order, numbered: no numbers were given, so none are drawn.');
      break;
    case 'identity':
      archetype = 'identity';
      said.push('An identity board: the wordmark, the palette, the type and the shape language, each on its own artboard.');
      break;
    case 'banner':
      archetype = 'banner';
      said.push('A banner: the headline held to the left third, the action on the right, read in one glance.');
      break;
    default: {
      // the direction's own language decides the composition first (a white cube is quiet, a Swiss grid shows its
      // grid, a poster language lets the words fill the frame); the brief's mood then moves it within that
      if (aspect > 2.2) archetype = 'banner';
      else if (hasImage && (dir.axis === 'layered' || DARK_LANGS.includes(dir.language))) archetype = 'image-full';
      else if (hasImage) archetype = 'image-split';
      else if ((QUIET_LANGS.includes(dir.language) && !loud) || (restrained && !LOUD_LANGS.includes(dir.language))) archetype = 'minimal';
      else if (GRID_LANGS.includes(dir.language) || (dir.axis === 'orthogonal' && !loud)) archetype = 'swiss';
      else if (LOUD_LANGS.includes(dir.language) || loud || dir.typeRole === 'structural') archetype = brief.kind === 'poster' || brief.kind === 'ad' || brief.kind === 'social' ? 'type-poster' : 'statement';
      else archetype = brief.kind === 'poster' && dir.intensity >= 45 ? 'type-poster' : 'statement';
      said.push(
        archetype === 'image-full'
          ? 'The picture fills the frame (the direction composes in layers); the words sit on a ground of their own over it.'
          : archetype === 'image-split'
            ? 'The picture and the words share the frame on the grid, neither covering the other.'
            : archetype === 'minimal'
              ? 'Restraint: small type, wide margins, one quiet mark. The space is the design.'
              : archetype === 'swiss'
                ? 'A strict grid that shows: flush-left type in columns, rules, one block of colour.'
                : archetype === 'type-poster'
                  ? 'The headline is the image: set to the full width, as large as the words allow.'
                  : 'A statement: the headline large, one supporting line, the brand small.',
      );
    }
  }
  // restraint keeps one quiet mark (minimal is never empty); the rest follow the brief's volume
  // a composition asked for by a Board (another archetype for a second poster): taken where it fits this kind and brief
  const want = opts.over?.archetype;
  if (want && want !== archetype && FREE_ARCHETYPES.includes(want) && FREE_KINDS.includes(brief.kind) && f.width / f.height <= 2.2 && (!want.startsWith('image') || hasImage)) {
    archetype = want;
    said.push(
      want === 'image-full'
        ? 'Composed to differ from its siblings: the picture fills the frame, the words on a ground of their own.'
        : want === 'image-split'
          ? 'Composed to differ from its siblings: the picture and the words share the frame.'
          : want === 'minimal'
            ? 'Composed to differ from its siblings: restraint, one quiet mark, wide margins.'
            : want === 'swiss'
              ? 'Composed to differ from its siblings: a visible grid, flush-left type, one block of colour.'
              : want === 'type-poster'
                ? 'Composed to differ from its siblings: the headline as the image, across the full width.'
                : 'Composed to differ from its siblings: a statement, the headline large and one supporting line.',
    );
  }
  const shapes: Plan['shapes'] = archetype === 'minimal' ? 'motif' : !dir.form || restrained ? (archetype === 'label' ? 'frame' : archetype === 'album' || archetype === 'identity' ? 'mass' : 'none') : archetype === 'album' || archetype === 'book' ? 'mass' : loud ? 'mass' : 'motif';
  if (dir.form && shapes !== 'none') said.push(`Shapes from the direction’s own system (${dir.form.curvature >= 55 ? 'curved' : dir.form.orthogonal >= 60 ? 'right-angled' : 'angular'}), never decoration for its own sake.`);
  // the colour of the ground: a dark language keeps its dark ground; brutal turns to ink; a loud language (or a loud
  // brief in a language that allows it) gives the frame to its accent; the quiet and gridded languages keep their own
  const fieldOk = !['image-full', 'infographic', 'process', 'minimal', 'swiss', 'card', 'label'].includes(archetype);
  let colour: Plan['colour'] = DARK_LANGS.includes(dir.language)
    ? 'ground'
    : dir.language === 'brutal'
      ? 'inverse'
      : fieldOk && (LOUD_LANGS.includes(dir.language) || (loud && !QUIET_LANGS.includes(dir.language) && !GRID_LANGS.includes(dir.language)))
        ? 'accent-field'
        : 'ground';
  // another use of the same palette, asked for by a Board (never a field behind a photograph, a chart or a diagram)
  if (opts.over?.colour && opts.over.colour !== colour && !['image-full', 'infographic', 'process'].includes(archetype)) {
    colour = opts.over.colour;
    said.push(colour === 'accent-field' ? 'The same palette used differently: the accent takes the whole ground here.' : colour === 'inverse' ? 'The same palette used differently: ink for the ground, the paper for the type.' : 'The same palette used differently: the campaign’s own ground, the accent kept for one element.');
  } else if (colour === 'accent-field') said.push('The frame is the direction’s accent: a loud language, given the whole ground.');
  else if (colour === 'inverse') said.push('Ink for the ground and the paper for the type: the direction is raw, in two colours.');
  // the default engine: a design generated from a concept worked out for this brief (generative/*), not a stored layout.
  // A layout chosen by hand (a Board's archetype, a style's construction picked in the explorer, a composition family,
  // the templates engine) is an optional starting point and is honoured as one.
  const engine = opts.over?.engine ?? dir.engine ?? 'generative';
  const handPicked = !!opts.over?.archetype || !!dir.style?.construction || !!(opts.over?.composition ?? dir.composition);
  const generative = engine === 'generative' && !handPicked && FREE_KINDS.includes(brief.kind) && aspect >= 0.3 && aspect <= 4;
  // the visual vocabulary: the style the brief's words (and the direction's language) ask for, and the composition
  // that style wants where the kind allows another (never against a Board's request for a different sibling)
  // a design language chosen for the direction: its construction (where the kind lets the composition be chosen) and
  // its vocabulary; the palette and faces are already the direction's tokens (styles/apply.ts styledDirection)
  const run = dir.style ? runFor(dir.style, { hasImage, index: opts.over?.styleIndex, tokens: { background: dir.tokens.colors.background, text: dir.tokens.colors.text, accent: dir.tokens.colors.accent, accent2: dir.tokens.accent2 }, fonts: dir.tokens.fonts }) : null;
  if (run && generative) {
    said.push(`Set in ${run.name} as principles — its type, colour, geometry, surface and what it avoids — never as a fixed layout.`);
  } else if (run && FREE_KINDS.includes(brief.kind) && aspect <= 2.2) {
    archetype = (isStyleConstruction(run.construction) ? run.construction : run.construction) as Archetype;
    said.push(`Built in ${run.name}: ${run.says[0]}`);
    for (const x of run.says.slice(1, 3)) said.push(x);
  } else if (run) said.push(`Set in ${run.name}: its type, colour, shapes and surface; this kind keeps its own composition.`);
  const briefVocab = () => vocabularyFor({ words: brief.purpose, mood: brief.mood, language: dir.language, intensity: dir.intensity, hasImage, seed: `${brief.content.headline}|${dir.name}`, kind: brief.kind });
  // a brief that names its technique ("generative, procedural", "a halftone pattern") is answered in any language: the
  // style's own pattern where it has one, else the one the words ask for, in the style's inks
  const asked = run ? briefVocab() : null;
  const patternAsked = !!(run && asked && asked.strength >= 2 && asked.pattern);
  const vocab = run ? (patternAsked ? { ...run.vocab, pattern: run.vocab.pattern ?? asked!.pattern } : run.vocab) : (opts.over?.vocabulary ?? briefVocab());
  if (patternAsked) said.push(`The brief asks for ${asked!.style} work: a ${vocab.pattern!.gen} pattern is part of the design, in the language’s colours.`);
  let shapes2: Plan['shapes'] = shapes;
  const wanted = vocab.archetype;
  const kindAllows = FREE_KINDS.includes(brief.kind) || (['album', 'book'].includes(brief.kind) && wanted !== null && ['abstract', 'procedural', 'typographic', 'halftone', 'collage', 'organic', 'radial', 'layered', 'cinematic'].includes(wanted));
  // a composition chosen for its style never drops the designer's picture: with a picture, only one that places it
  const placesPicture = ['image-full', 'image-split', 'cinematic', 'halftone', 'collage'].includes(wanted ?? '');
  if (!generative && !run && vocab.strength >= 2 && wanted && wanted !== archetype && !opts.over?.archetype && kindAllows && aspect <= 2.2 && (!wanted.startsWith('image') || hasImage) && (!hasImage || placesPicture)) {
    archetype = wanted as Archetype;
    said.push(`The composition follows the brief’s ${vocab.style} character: ${vocab.says[0]}`);
    if ((NEW_ARCHETYPES as readonly string[]).includes(wanted)) shapes2 = vocab.pattern ? 'pattern' : vocab.motifs.length ? 'motif' : 'none';
  } else if (!run && vocab.strength >= 1) said.push(`The vocabulary follows the brief’s ${vocab.style} character: ${vocab.says[0]}`);
  // a composition planned for it (composition/*): its family where the kind lets the composition be chosen, drawn by
  // the style's own construction when the plan says that construction is this family in this style
  const cplan = opts.over?.composition ?? dir.composition ?? null;
  const fam = cplan ? FAMILY_BY_ID.get(cplan.family) : undefined;
  const composed = !!(cplan && fam && compositionFits(fam, brief, aspect));
  if (composed && cplan && fam) {
    const own = cplan.renderer.startsWith('construction:') ? cplan.renderer.slice('construction:'.length) : '';
    archetype = (own && run && isStyleConstruction(own as Archetype) ? own : 'composition') as Archetype;
    colour = cplan.colour;
    said.push(`Composed as ${describePlan(cplan)}: ${fam.description}`);
  }
  const genReq = generative ? (opts.over?.generative ?? dir.generative ?? {}) : undefined;
  if (generative) {
    archetype = 'generative';
    // the engine decides how the palette is used (a field, the ink as ground…) as part of the concept
    colour = 'ground';
    for (let i = said.length - 1; i >= 0; i--) if (/^(The frame is the direction’s accent|Ink for the ground|The same palette used differently)/.test(said[i])) said.splice(i, 1);
  }
  if (run && isStyleConstruction(archetype) && !composed) {
    // a Board sibling that comes round to the same construction again takes the palette another way (the paper, then
    // the ink, then the accent as its ground): one language, several uses of it, never the same design twice
    const turn = Math.floor((opts.over?.styleIndex ?? 0) / Math.max(1, run.dna.composition.constructions.length)) % 3;
    colour = turn === 1 ? 'inverse' : turn === 2 ? 'accent-field' : 'ground';
    if (turn) said.push(turn === 1 ? 'Its ink taken as the ground this time, the paper as the ink.' : 'The accent taken as the ground this time.');
  }
  // a cinematic frame is dark; a brutalist wall of type is ink or the accent
  if (archetype === 'cinematic' && !DARK_LANGS.includes(dir.language)) colour = 'inverse';
  if (archetype === 'typographic' && vocab.style === 'brutalist' && colour === 'ground') colour = hashOf(brief.content.headline) % 2 ? 'inverse' : 'accent-field';
  const focal: Plan['focal'] = composed && fam ? (fam.focal === 'pattern' ? 'shape' : fam.focal) : archetype === 'infographic' ? 'data' : archetype === 'album' || archetype === 'abstract' || archetype === 'procedural' ? 'shape' : hasImage && (archetype.startsWith('image') || archetype === 'cinematic' || archetype === 'halftone') ? 'image' : 'type';
  const strategy = strategyOf(archetype, vocab, colour, hasImage);
  return { archetype, focal, hierarchy: ['headline', 'subhead', 'body', 'meta', 'cta', 'logo'], colour, shapes: shapes2, said, vocabulary: vocab, strategy, ...(run ? { run, style: { id: run.id, name: run.name, construction: run.construction, variant: run.variant } } : {}), ...(patternAsked ? { patternAsked: true } : {}), ...(composed && cplan ? { composition: { ...cplan } } : {}), ...(genReq ? { generativeRequest: genReq } : {}) };
}

/** The strategy a composition follows (see Strategy), from its archetype and its vocabulary. */
function strategyOf(a: Archetype, v: VisualVocabulary, colour: Plan['colour'], hasImage: boolean): Strategy {
  const built = isStyleConstruction(a) ? CONSTRUCTIONS[a] : null;
  const layout: Strategy['layout'] = built ? (built.layout as Strategy['layout']) :
    a === 'swiss' || a === 'infographic' || a === 'process' ? 'column' : a === 'modular' || a === 'technical' ? 'modular' : a === 'radial' ? 'radial' : a === 'diagonal' ? 'diagonal' : a === 'collage' ? 'collage' : a === 'layered' || a === 'procedural' ? 'layered' : a === 'typographic' || a === 'type-poster' ? 'typographic' : a === 'image-full' || a === 'cinematic' || a === 'halftone' ? (hasImage ? 'image-dominant' : 'full-bleed') : a === 'image-split' || a === 'banner' ? 'split' : a === 'masthead' ? 'editorial' : a === 'book' || a === 'label' || a === 'card' ? 'centred' : a === 'organic' || a === 'abstract' ? 'freeform' : 'asymmetric';
  return {
    layout,
    type: v.type === 'plain' ? 'set plainly, the hierarchy by size and weight' : `treated: ${v.type.replace(/-/g, ' ')}`,
    image: hasImage ? (v.image.length ? `pictures treated: ${v.image.map((e) => e.kind).join(', ')}` : 'pictures as they are') : 'no pictures',
    shapes: v.motifs.length ? `${v.motifs.map((m) => m.kind).join(', ')}${v.pattern ? `; a ${v.pattern.gen} pattern` : ''}` : v.pattern ? `a ${v.pattern.gen} pattern` : 'none',
    colour: colour === 'accent-field' ? 'the accent as the ground' : colour === 'inverse' ? 'ink as the ground' : `${v.palette === 'mono' ? 'one colour' : v.palette === 'duo' ? 'two colours' : 'the full palette'} on the ground`,
    space: v.density >= 70 ? 'dense' : v.density <= 25 ? 'generous' : 'balanced',
    density: v.density,
    contrast: v.style === 'soft' || v.style === 'minimal' ? 'soft' : ['brutalist', 'cinematic', 'halftone', 'maximal', 'experimental'].includes(v.style) ? 'high' : 'medium',
    rhythm: built ? (built.rhythm as Strategy['rhythm']) : layout === 'radial' ? 'radiating' : layout === 'freeform' || v.style === 'organic' || v.style === 'procedural' ? 'flowing' : layout === 'typographic' ? 'stacked' : layout === 'collage' || layout === 'diagonal' || layout === 'layered' ? 'syncopated' : 'regular',
  };
}

/** The visual languages of the direction engine (lib/ux-v0/direction.ts LANGUAGES), by how they compose a graphic. */
export const QUIET_LANGS = ['gallery', 'quiet-luxury'];
export const GRID_LANGS = ['swiss', 'utility', 'civic', 'industrial'];
export const LOUD_LANGS = ['poster', 'retro-print', 'maximal', 'brutal'];
export const DARK_LANGS = ['night', 'cinema', 'future'];

// ── the layout ──

export interface Ctx {
  W: number;
  H: number;
  m: number;
  u: number;
  dir: GraphicDirection;
  brief: GraphicBrief;
  f: Format;
  measure: Measure;
  seed: number;
  ground: string;
  ink: string;
  accent: string;
  accentInk: string;
  muted: string;
  print: boolean;
  /** the visual vocabulary (null: Graphics 1.0's own shapes only) */
  vocab: VisualVocabulary | null;
  /** a second colour that reads against the ground */
  accent2: string;
  /** the design language (null: none chosen) */
  style: StyleRun | null;
}

const TRACK: Record<GraphicDirection['look']['tracking'], number> = { tight: -25, normal: 0, wide: 90 };

function contextFor(brief: GraphicBrief, dir: GraphicDirection, f: Format, plan: Plan, measure: Measure, seed: number): Ctx {
  const c = dir.tokens.colors;
  const field = plan.colour === 'accent-field';
  const inverse = plan.colour === 'inverse';
  const ground = field ? c.accent : inverse ? c.text : c.background;
  const ink = ensureContrast(field ? c.accentText : inverse ? c.background : c.text, ground, 4.5);
  const accentBase = field ? (dir.tokens.accent2 ?? c.background) : c.accent;
  const accent = contrastRatio(accentBase, ground) >= 1.6 ? accentBase : ink;
  return {
    W: f.width,
    H: f.height,
    m: f.safe,
    u: Math.min(f.width, f.height) / 100,
    dir,
    brief,
    f,
    measure,
    seed,
    ground,
    ink,
    accent,
    accentInk: ensureContrast(c.accentText, accent, 4.5),
    muted: ensureContrast(field ? c.accentText : inverse ? c.line : c.muted, ground, 4.5),
    print: f.unit === 'pt',
    vocab: plan.vocabulary && plan.vocabulary.strength >= 1 ? plan.vocabulary : null,
    accent2: ((a2) => (contrastRatio(a2, ground) >= 1.5 ? a2 : ensureContrast(a2, ground, 2)))(dir.tokens.accent2 ?? (field ? c.background : mixColor(c.accent, c.text, 0.45).slice(0, 7))),
    style: plan.run ?? null,
  };
}

/** The smallest text a format reads at: print in points, screens relative to their width. */
const minText = (x: Ctx) => (x.print ? 6.5 : Math.max(14, x.W * 0.014));

function text(x: Ctx, role: Role, words: string, box: { x: number; y: number; w: number; h: number }, s: Partial<TextNode> = {}): TextNode {
  const display = role === 'headline' || role === 'logo';
  const node: TextNode = {
    id: newId('t'),
    type: 'text',
    role,
    name: role.charAt(0).toUpperCase() + role.slice(1),
    x: box.x,
    y: box.y,
    w: Math.max(8, box.w),
    h: Math.max(8, box.h),
    rotation: 0,
    opacity: 1,
    text: words,
    font: display ? x.dir.tokens.fonts.display : x.dir.tokens.fonts.body,
    weight: display ? Math.min(900, Math.max(300, x.dir.look.weight)) : role === 'meta' || role === 'cta' || role === 'label' ? 600 : 400,
    size: Math.max(minText(x), s.size ?? x.u * 3),
    lineHeight: display ? x.dir.look.lineHeight ?? 0.95 : 1.35,
    tracking: display ? x.dir.look.trackingValue ?? TRACK[x.dir.look.tracking] : role === 'label' || role === 'meta' ? 40 : 0,
    align: 'left',
    valign: 'top',
    color: x.ink,
    ...(display && x.dir.look.case === 'upper' ? { case: 'upper' as const } : display && x.dir.look.case === 'lower' ? { case: 'lower' as const } : {}),
    ...s,
  };
  // the weight the face really has: within a variable family's range, or the nearest of a static family's weights
  node.weight = nearestWeight(node.font, node.weight);
  if (display && s.size === undefined) node.size = fitSize({ ...node, size: x.u * 30 }, x.measure, minText(x)) * 0.94;
  return node;
}

function shape(x: Ctx, role: Role, recipe: ShapeRecipe, box: { x: number; y: number; w: number; h: number }, fill: string | null, s: Partial<Node> = {}): Node {
  return { id: newId('s'), type: 'shape', shape: 'recipe', recipe, role, name: role === 'background' ? 'Field' : 'Shape', fill, x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: 1, ...(s as object) } as Node;
}

function rect(x: Ctx, role: Role, box: { x: number; y: number; w: number; h: number }, fill: Paint | null, s: Record<string, unknown> = {}): Node {
  return { id: newId('s'), type: 'shape', shape: 'rect', role, name: role === 'background' ? 'Field' : 'Block', fill, x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: 1, ...s } as Node;
}

function rule(x: Ctx, box: { x: number; y: number; w: number }, color: string, weight?: number): Node {
  return { id: newId('s'), type: 'shape', shape: 'line', role: 'motif', name: 'Rule', fill: null, stroke: { color, width: weight ?? Math.max(1, x.u * 0.35) }, x: box.x, y: box.y, w: box.w, h: Math.max(2, x.u), rotation: 0, opacity: 1 } as Node;
}

function image(x: Ctx, asset: string, box: { x: number; y: number; w: number; h: number }, mask?: ShapeRecipe | 'ellipse'): Node {
  return { id: newId('i'), type: 'image', role: 'image', name: 'Picture', asset, fit: 'cover', x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: 1, ...(mask ? { mask } : {}) } as Node;
}

const fig = (x: Ctx, role: Parameters<typeof figureFor>[1], k = 0): ShapeRecipe | null => (x.dir.form ? figureFor(x.dir.form, role, k, `${x.brief.kind}|${x.seed}`) : null);

/** A colour for a shape the words cross: the ink reads on it (3:1, as large type needs), and it is not the ground. */
function fillUnder(x: Ctx, ink = x.ink): string | null {
  const c = x.dir.tokens.colors;
  return [x.accent, x.dir.tokens.accent2, c.background, c.surface, c.line, c.text, c.muted].filter((v): v is string => !!v).find((f) => contrastRatio(ink, f) >= 3 && contrastRatio(f, x.ground) >= 1.3) ?? null;
}

/** Where the foot (the details on the left, the brand on the right) begins: everything else stays above it. */
function footTop(x: Ctx): number {
  const meta = metaLines(x);
  const size = Math.max(minText(x), x.u * 2.4);
  const h = Math.max(meta.length ? size * 1.4 * meta.length : 0, x.brief.content.brand ? size * 1.5 : 0);
  return x.H - x.m - h - (h ? x.u * 3 : 0);
}

type StackItem = [Role, string, number, Partial<TextNode>] | null;

/** Words set one under another from `top`, each measured as it is set, stopping before `end`. */
function stack(x: Ctx, out: Node[], left: number, top: number, w: number, end: number, items: readonly StackItem[]): number {
  let y = top;
  for (const it of items) {
    if (!it) continue;
    const [role, words, size, s] = it;
    const n = text(x, role, words, { x: left, y, w, h: Math.max(size * 1.4, end - y) }, { size, autoHeight: true, ...s });
    n.h = Math.max(size * 1.2, layoutText(n, x.measure).height);
    out.push(n);
    y += n.h + x.u * 2.5;
  }
  return y;
}

/** Words set one under another so the last ends at `end` (the foot): returns where the first begins. */
function stackFromFoot(x: Ctx, out: Node[], left: number, w: number, end: number, items: readonly StackItem[]): number {
  const made = items.filter((i): i is NonNullable<StackItem> => !!i).map(([role, words, size, s]) => {
    const n = text(x, role, words, { x: left, y: 0, w, h: size * 6 }, { size, autoHeight: true, ...s });
    n.h = Math.max(size * 1.2, layoutText(n, x.measure).height);
    return n;
  });
  let y = end;
  for (const n of made.reverse()) {
    y -= n.h;
    n.y = y;
    y -= x.u * 2.5;
    out.push(n);
  }
  return y + x.u * 2.5;
}

/** Meta lines, the placeholders said as placeholders. */
const metaLines = (x: Ctx): string[] => (x.brief.content.meta?.length ? x.brief.content.meta : x.brief.kind === 'poster' || x.brief.kind === 'announcement' ? ['[Date]', '[Place]'] : []);

/** The bottom block every composition shares: meta on the left, the brand on the right. */
function foot(x: Ctx, color = x.ink): Node[] {
  const out: Node[] = [];
  const meta = metaLines(x);
  const size = Math.max(minText(x), x.u * 2.4);
  const metaH = size * 1.4 * meta.length;
  if (meta.length) out.push(text(x, 'meta', meta.join('\n'), { x: x.m, y: x.H - x.m - metaH, w: (x.W - x.m * 2) * 0.55, h: metaH }, { size, lineHeight: 1.35, color, autoHeight: true }));
  if (x.brief.content.brand) out.push(text(x, 'logo', x.brief.content.brand, { x: x.W * 0.5, y: x.H - x.m - size * 1.5, w: x.W * 0.5 - x.m, h: size * 1.5 }, { size: size * 1.05, align: 'right', color, weight: 700, case: 'none', tracking: 20 }));
  return out;
}

type Layout = (x: Ctx, plan: Plan) => Node[];

/** What the style constructions (styles/constructions-*.ts) build with: the composer's own helpers, handed over
 * rather than imported, so the constructions stay a module of their own. */
export interface Kit {
  text: typeof text;
  rect: typeof rect;
  rule: typeof rule;
  image: typeof image;
  foot: typeof foot;
  stack: typeof stack;
  stackFromFoot: typeof stackFromFoot;
  footTop: typeof footTop;
  metaLines: (x: Ctx) => string[];
  minText: (x: Ctx) => number;
  primNode: typeof primNode;
  patternNode: typeof patternNode;
  cutPicture: typeof cutPicture;
  plateFor: typeof plateFor;
  treat: typeof treat;
  paletteFx: typeof paletteFx;
  inkOf: (x: Ctx, r: InkRole) => string;
  pdef: (gen: string, params: Record<string, number>, inks: InkRole[], opacity?: number) => PatternUse;
  primOf: (kind: string, params?: Record<string, number>) => Prim;
}
const KIT: Kit = {
  text: (...a) => text(...a),
  rect: (...a) => rect(...a),
  rule: (...a) => rule(...a),
  image: (...a) => image(...a),
  foot: (...a) => foot(...a),
  stack: (...a) => stack(...a),
  stackFromFoot: (...a) => stackFromFoot(...a),
  footTop: (...a) => footTop(...a),
  metaLines: (x) => metaLines(x),
  minText: (x) => minText(x),
  primNode: (...a) => primNode(...a),
  patternNode: (...a) => patternNode(...a),
  cutPicture: (...a) => cutPicture(...a),
  plateFor: (...a) => plateFor(...a),
  treat: (...a) => treat(...a),
  paletteFx: (...a) => paletteFx(...a),
  inkOf: (x, r) => inkOf(x, r),
  pdef: (gen, params, inks, opacity) => pdef(gen, params, inks, opacity),
  primOf: (kind, params) => primOf(kind, params),
};

const LAYOUTS: Record<Archetype, Layout> = {
  'type-poster': (x, plan) => {
    const out: Node[] = [];
    const diag = x.dir.axis === 'diagonal';
    // the headline crosses from the ground onto the shape: the shape takes a colour the ink reads on
    const massFill = fillUnder(x);
    const mass = plan.shapes !== 'none' && massFill ? fig(x, 'mass') : null;
    if (mass && massFill) out.push(shape(x, 'motif', mass, { x: x.W * 0.42, y: -x.H * 0.06, w: x.W * 0.7, h: x.W * 0.7 }, massFill));
    const head = text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.H * 0.16, w: x.W - x.m * 2, h: x.H * 0.5 }, diag ? { rotation: -7 } : {});
    out.push(head);
    out.push(rule(x, { x: x.m, y: head.y + head.h + x.u * 2, w: x.W - x.m * 2 }, x.ink));
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m, y: head.y + head.h + x.u * 6, w: (x.W - x.m * 2) * 0.62, h: x.u * 14 }, { size: Math.max(minText(x), x.u * 3.6), autoHeight: true }));
    if (x.dir.look.case === 'upper' && x.brief.content.brand) out.push(text(x, 'label', x.brief.content.brand.toUpperCase(), { x: x.W - x.m - x.u * 4, y: x.m, w: x.u * 4, h: x.H * 0.4 }, { size: Math.max(minText(x), x.u * 2), vertical: true, weight: 700, tracking: 140 }));
    return [...out, ...foot(x)];
  },
  'image-full': (x) => {
    const out: Node[] = [];
    out.push({ ...image(x, x.brief.images[0], { x: 0, y: 0, w: x.W, h: x.H }), role: 'background' } as Node);
    // the words' own ground over the picture: a band of the direction's colour (never words straight on a photograph)
    const bandH = x.H * 0.4;
    out.push(rect(x, 'background', { x: 0, y: x.H - bandH, w: x.W, h: bandH }, x.ground));
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.H - bandH + x.m * 0.8, w: x.W - x.m * 2, h: bandH * 0.52 }));
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m, y: x.H - bandH * 0.4, w: (x.W - x.m * 2) * 0.7, h: x.u * 10 }, { size: Math.max(minText(x), x.u * 3), autoHeight: true }));
    return [...out, ...foot(x)];
  },
  'image-split': (x) => {
    const out: Node[] = [];
    const c = x.brief.content;
    const land = x.W > x.H;
    const mask = x.dir.form && x.dir.look.frame === 'shaped' ? fig(x, 'mask') ?? undefined : undefined;
    const end = footTop(x);
    const accentInk = x.accent === x.ground ? x.ink : ensureContrast(x.accent, x.ground, 4.5);
    const rest: StackItem[] = [c.subhead ? ['subhead', c.subhead, Math.max(minText(x), x.u * 3), {}] : null, c.cta ? ['cta', `${c.cta} →`, Math.max(minText(x), x.u * 2.8), { weight: 700, color: accentInk }] : null];
    if (land) {
      out.push(image(x, x.brief.images[0], { x: x.W * 0.48, y: 0, w: x.W * 0.52, h: x.H }, mask));
      const tw = x.W * 0.48 - x.m * 2;
      const restTop = stackFromFoot(x, out, x.m, tw, end, rest);
      out.push(text(x, 'headline', c.headline, { x: x.m, y: x.m * 1.4, w: tw, h: Math.max(x.u * 8, restTop - x.u * 2 - x.m * 1.4) }));
    } else {
      // a square leaves the words a little more room than a portrait does
      const imgH = x.H * (x.W / x.H >= 0.95 ? 0.5 : 0.56);
      out.push(image(x, x.brief.images[0], { x: 0, y: 0, w: x.W, h: imgH }, mask));
      const tw = x.W - x.m * 2;
      const restTop = stackFromFoot(x, out, x.m, tw * 0.9, end, rest);
      const ty = imgH + x.m * 0.7;
      out.push(text(x, 'headline', c.headline, { x: x.m, y: ty, w: tw, h: Math.max(x.u * 8, restTop - x.u * 2 - ty) }));
    }
    return [...out, ...foot(x)];
  },
  minimal: (x, plan) => {
    const out: Node[] = [];
    // one quiet mark, large enough to hold the space and drawn in a single line: a figure of the direction where it has
    // one, else a circle; above the words, never behind them
    const mark = plan.shapes !== 'none' ? fig(x, 'echo') : null;
    const d = Math.min(x.W - x.m * 2, x.H * 0.5) * 0.62;
    const line = { stroke: { color: x.accent, width: Math.max(1, x.u * 0.45) } } as Partial<Node>;
    const at = { x: x.W - x.m - d, y: x.m + x.u * 2, w: d, h: d };
    if (mark) out.push(shape(x, 'motif', mark, at, null, line));
    else out.push({ id: newId('s'), type: 'shape', shape: 'ellipse', role: 'motif', name: 'Mark', fill: null, ...line, ...at, rotation: 0, opacity: 1 } as Node);
    out.push({ id: newId('s'), type: 'shape', shape: 'ellipse', role: 'motif', name: 'Point', fill: x.accent, x: at.x + d * 0.5 - x.u * 1.2, y: at.y + d * 0.5 - x.u * 1.2, w: x.u * 2.4, h: x.u * 2.4, rotation: 0, opacity: 1 } as Node);
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.H * 0.58, w: (x.W - x.m * 2) * 0.72, h: x.H * 0.2 }, { size: Math.max(minText(x) * 1.6, x.u * 7.4), lineHeight: 1.05 }));
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m, y: x.H * 0.6 + x.H * 0.19, w: (x.W - x.m * 2) * 0.5, h: x.u * 8 }, { size: Math.max(minText(x), x.u * 2.4), color: x.muted, autoHeight: true }));
    return [...out, ...foot(x, x.muted)];
  },
  swiss: (x) => {
    const out: Node[] = [];
    const c = x.brief.content;
    const col = (x.W - x.m * 2) / 12;
    const land = x.W / x.H > 1.3;
    // the one block of colour, varied by the project and the direction so two Swiss designs do not wear the same mark,
    // and never taller than a fifth of the artboard
    const v = hashOf(`${x.seed}|${x.dir.name}`) % 4;
    const figure = x.dir.form ? fig(x, 'echo') : null;
    const block = Math.min(col * 3, x.H * 0.2);
    const bar = Math.min(col * 1.1, x.H * 0.07);
    if (v === 0) out.push(rect(x, 'motif', { x: x.W - x.m - block, y: x.m, w: block, h: block }, x.accent));
    else if (v === 1) out.push(rect(x, 'motif', { x: x.m, y: x.m, w: x.W - x.m * 2, h: bar }, x.accent));
    else if (v === 2) out.push(figure ? shape(x, 'motif', figure, { x: x.m, y: x.m, w: block, h: block }, x.accent) : ({ id: newId('s'), type: 'shape', shape: 'ellipse', role: 'motif', name: 'Disc', fill: x.accent, x: x.m, y: x.m, w: block, h: block, rotation: 0, opacity: 1 } as Node));
    else out.push(rect(x, 'motif', { x: x.W - x.m - col, y: x.m, w: col, h: block }, x.accent));
    const ruleY = x.m + (v === 1 ? bar : block) + x.u * 2;
    out.push(rule(x, { x: x.m, y: ruleY, w: x.W - x.m * 2 }, x.ink));
    const top = ruleY + x.u * 3;
    const end = footTop(x);
    const accentInk = x.accent === x.ground ? x.ink : ensureContrast(x.accent, x.ground, 4.5);
    if (land) {
      // landscape: the headline across seven columns; the subtitle, the text and the action in the last four, from its top
      out.push(text(x, 'headline', c.headline, { x: x.m, y: top, w: col * 7.4, h: end - top }, { lineHeight: 0.92 }));
      stack(x, out, x.m + col * 8, top, col * 4, end, [
        c.subhead ? ['subhead', c.subhead, Math.max(minText(x), x.u * 3.2), {}] : null,
        c.body ? ['body', c.body, Math.max(minText(x), x.u * 2.4), {}] : null,
        c.cta ? ['cta', `${c.cta} →`, Math.max(minText(x), x.u * 3), { weight: 700, color: accentInk }] : null,
      ]);
    } else {
      // portrait and square: the headline across nine columns; under it, the subtitle on the right, the text on the left
      const head = text(x, 'headline', c.headline, { x: x.m, y: top, w: col * 9, h: Math.max(x.u * 10, Math.min(x.H * 0.4, end - top - x.u * 16)) }, { lineHeight: 0.92 });
      out.push(head);
      const below = head.y + Math.min(head.h, layoutText(head, x.measure).height) + x.u * 4;
      stack(x, out, x.m + col * 6, below, col * 6, end, [
        c.subhead ? ['subhead', c.subhead, Math.max(minText(x), x.u * 2.8), {}] : null,
        c.cta ? ['cta', `${c.cta} →`, Math.max(minText(x), x.u * 2.8), { weight: 700, color: accentInk }] : null,
      ]);
      if (c.body) stack(x, out, x.m, below, col * 5, end, [['body', c.body, Math.max(minText(x), x.u * 2.2), {}]]);
    }
    return [...out, ...foot(x)];
  },
  statement: (x, plan) => {
    const out: Node[] = [];
    const motifFill = plan.shapes === 'mass' ? fillUnder(x) : x.accent;
    const motif = plan.shapes !== 'none' && motifFill ? fig(x, plan.shapes === 'mass' ? 'mass' : 'edge') : null;
    if (motif && motifFill) out.push(shape(x, 'motif', motif, plan.shapes === 'mass' ? { x: x.W * 0.55, y: x.H * 0.5, w: x.W * 0.62, h: x.W * 0.62 } : { x: 0, y: x.H * 0.86, w: x.W, h: x.H * 0.14 }, motifFill));
    if (x.brief.content.brand) out.push(text(x, 'logo', x.brief.content.brand, { x: x.m, y: x.m, w: x.W * 0.6, h: x.u * 6 }, { size: Math.max(minText(x), x.u * 3), weight: 700, case: 'none', tracking: 10 }));
    const head = text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.H * 0.22, w: x.W - x.m * 2, h: x.H * 0.42 });
    out.push(head);
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m, y: head.y + head.h + x.u * 3, w: (x.W - x.m * 2) * 0.78, h: x.u * 12 }, { size: Math.max(minText(x), x.u * 3.4), autoHeight: true }));
    if (x.brief.content.cta) out.push(text(x, 'cta', `${x.brief.content.cta} →`, { x: x.m, y: x.H - x.m - x.u * 8, w: x.W * 0.6, h: x.u * 6 }, { size: Math.max(minText(x), x.u * 3), weight: 700, color: x.accent === x.ground ? x.ink : ensureContrast(x.accent, x.ground, 4.5) }));
    const meta = metaLines(x);
    if (meta.length) out.push(text(x, 'meta', meta.join('  ·  '), { x: x.m, y: x.H - x.m - x.u * 3, w: x.W - x.m * 2, h: x.u * 3 }, { size: Math.max(minText(x), x.u * 2.2), color: x.muted, autoHeight: true }));
    return out;
  },
  masthead: (x) => {
    const out: Node[] = [];
    if (x.brief.images[0]) out.push({ ...image(x, x.brief.images[0], { x: 0, y: x.H * 0.18, w: x.W, h: x.H * 0.82 }), role: 'background' } as Node);
    else if (fig(x, 'mass') && fillUnder(x)) out.push(shape(x, 'motif', fig(x, 'mass')!, { x: x.W * 0.1, y: x.H * 0.24, w: x.W * 0.95, h: x.W * 0.95 }, fillUnder(x)!));
    out.push(text(x, 'logo', x.brief.content.brand || '[Masthead]', { x: x.m, y: x.m * 0.6, w: x.W - x.m * 2, h: x.H * 0.14 }, { size: undefined, font: x.dir.tokens.fonts.display, weight: Math.max(700, x.dir.look.weight), lineHeight: 0.9, case: 'upper', tracking: -20 }));
    const meta = metaLines(x);
    out.push(text(x, 'meta', meta.length ? meta.join('  ·  ') : '[Issue] · [Date]', { x: x.m, y: x.H * 0.165, w: x.W - x.m * 2, h: x.u * 2.4 }, { size: Math.max(minText(x), x.u * 1.9), weight: 600, tracking: 80, case: 'upper' }));
    const lines = x.brief.content.items ?? [];
    const band = x.brief.images[0] ? rect(x, 'background', { x: x.m * 0.6, y: x.H * 0.56, w: x.W * 0.58, h: x.H * 0.4 }, x.ground) : null;
    if (band) out.push(band);
    const deck = x.brief.content.subhead;
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.H * 0.58, w: x.W * 0.52, h: deck ? x.H * 0.15 : x.H * 0.2 }));
    if (deck) out.push(text(x, 'subhead', deck, { x: x.m, y: x.H * 0.735, w: x.W * 0.52, h: x.u * 4 }, { size: Math.max(minText(x), x.u * 2.6), autoHeight: true, italic: hasItalic(x.dir.tokens.fonts.body) ? true : undefined }));
    lines.slice(0, 4).forEach((l, i) => out.push(text(x, 'body', l, { x: x.m, y: x.H * 0.8 + i * x.u * 3.4, w: x.W * 0.52, h: x.u * 3.2 }, { size: Math.max(minText(x), x.u * 2.2), weight: i === 0 ? 700 : 400, autoHeight: true })));
    return out;
  },
  book: (x, plan) => {
    const out: Node[] = [];
    const m1 = fig(x, 'mass');
    const m2 = fig(x, 'echo', 1);
    if (m1 && plan.shapes !== 'none') out.push(shape(x, 'motif', m1, { x: x.W * 0.12, y: x.H * 0.3, w: x.W * 0.76, h: x.W * 0.76 }, x.accent));
    if (m2 && plan.shapes !== 'none') out.push(shape(x, 'motif', m2, { x: x.W * 0.3, y: x.H * 0.42, w: x.W * 0.5, h: x.W * 0.5 }, null, { stroke: { color: x.ink, width: Math.max(1, x.u * 0.4) } } as Partial<Node>));
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.m * 1.6, w: x.W - x.m * 2, h: x.H * 0.24 }, { align: 'center' }));
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m, y: x.m * 1.6 + x.H * 0.25, w: x.W - x.m * 2, h: x.u * 6 }, { size: Math.max(minText(x), x.u * 3), align: 'center', autoHeight: true }));
    out.push(text(x, 'logo', x.brief.content.brand || '[Author]', { x: x.m, y: x.H - x.m * 2.2, w: x.W - x.m * 2, h: x.u * 6 }, { size: Math.max(minText(x), x.u * 3.8), align: 'center', font: x.dir.tokens.fonts.body, weight: 600, tracking: 120, case: 'upper' }));
    return out;
  },
  album: (x) => {
    const out: Node[] = [];
    const roles: [Parameters<typeof figureFor>[1], string | null, number][] = [
      ['mass', x.accent, 0.78],
      ['echo', null, 0.56],
      ['cut', x.ink, 0.3],
    ];
    // the field the shapes may fill: everything above the title's band
    const fieldH = x.H - x.m * 2 - x.u * 14;
    roles.forEach(([r, fill, k], i) => {
      const rec = fig(x, r, i) ?? { kind: 'super', seed: x.seed + i, n: 5, irregular: 30, curve: 60, turn: 0, cut: 0, warp: 0 } as ShapeRecipe;
      const s = Math.min(x.W - x.m * 2, fieldH) * k;
      out.push(shape(x, 'motif', rec, { x: (x.W - s) / 2 + (i - 1) * x.u * 6, y: x.m + (fieldH - s) / 2 - i * x.u * 3, w: s, h: s }, fill, fill === null ? ({ stroke: { color: x.ink, width: Math.max(2, x.u * 0.5) } } as Partial<Node>) : {}));
    });
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.H - x.m - x.u * 9, w: x.W * 0.6, h: x.u * 5 }, { size: Math.max(minText(x), x.u * 3.6), lineHeight: 1.1 }));
    out.push(text(x, 'logo', x.brief.content.brand || '[Artist]', { x: x.m, y: x.H - x.m - x.u * 3.6, w: x.W * 0.6, h: x.u * 3.4 }, { size: Math.max(minText(x), x.u * 2.4), font: x.dir.tokens.fonts.body, weight: 500, case: 'none', tracking: 40 }));
    return out;
  },
  card: (x) => {
    const out: Node[] = [];
    const brand = x.brief.content.brand ?? '';
    if (brand && brand.toLowerCase() !== x.brief.content.headline.toLowerCase()) out.push(text(x, 'logo', brand, { x: x.m, y: x.m, w: x.W * 0.6, h: x.H * 0.14 }, { size: Math.max(minText(x) * 1.2, x.H * 0.085), weight: 700, case: 'none', tracking: 10 }));
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.H * 0.44, w: x.W - x.m * 2, h: x.H * 0.16 }, { size: Math.max(minText(x) * 1.6, x.H * 0.11), lineHeight: 1.05 }));
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m, y: x.H * 0.6, w: x.W - x.m * 2, h: x.H * 0.08 }, { size: Math.max(minText(x), x.H * 0.06), color: x.muted, autoHeight: true }));
    const meta = metaLines(x).length ? metaLines(x) : ['[Email]', '[Phone]'];
    out.push(text(x, 'meta', meta.join('\n'), { x: x.m, y: x.H * 0.74, w: x.W * 0.7, h: x.H * 0.2 }, { size: Math.max(minText(x), x.H * 0.052), lineHeight: 1.4, autoHeight: true }));
    const mark = fig(x, 'echo');
    if (mark) out.push(shape(x, 'motif', mark, { x: x.W - x.m - x.H * 0.22, y: x.m, w: x.H * 0.22, h: x.H * 0.22 }, x.accent));
    return out;
  },
  label: (x) => {
    const out: Node[] = [];
    const inset = x.m * 0.8;
    out.push(rect(x, 'motif', { x: inset, y: inset, w: x.W - inset * 2, h: x.H - inset * 2 }, null, { stroke: { color: x.ink, width: Math.max(0.75, x.u * 0.6) }, radius: x.u * 3 }));
    const em = fig(x, 'mass') ?? ({ kind: 'radial', seed: x.seed, n: 12, irregular: 10, curve: 40, turn: 0, cut: 0, warp: 0 } as ShapeRecipe);
    const maker = x.brief.content.brand;
    if (maker) out.push(text(x, 'logo', maker, { x: x.m * 1.6, y: x.m * 1.4, w: x.W - x.m * 3.2, h: x.u * 5 }, { size: Math.max(minText(x), x.u * 3), align: 'center', weight: 700, case: 'upper', tracking: 160, font: x.dir.tokens.fonts.body }));
    out.push(shape(x, 'motif', em, { x: x.W * 0.32, y: maker ? x.H * 0.15 : x.H * 0.12, w: x.W * 0.36, h: x.W * 0.36 }, x.accent));
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m * 1.6, y: x.H * 0.44, w: x.W - x.m * 3.2, h: x.H * 0.2 }, { align: 'center' }));
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m * 1.6, y: x.H * 0.66, w: x.W - x.m * 3.2, h: x.H * 0.06 }, { size: Math.max(minText(x), x.u * 4), align: 'center', autoHeight: true }));
    const meta = metaLines(x).length ? metaLines(x) : ['[Net weight]', '[Ingredients]'];
    out.push(text(x, 'meta', meta.join('\n'), { x: x.m * 1.6, y: x.H * 0.78, w: x.W - x.m * 3.2, h: x.H * 0.12 }, { size: Math.max(minText(x), x.u * 3), align: 'center', lineHeight: 1.4, autoHeight: true }));
    return out;
  },
  infographic: (x) => {
    const out: Node[] = [];
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.16 }, { size: undefined, lineHeight: 1 }));
    if (x.brief.content.subhead) out.push(text(x, 'subhead', x.brief.content.subhead, { x: x.m, y: x.m + x.H * 0.17, w: x.W - x.m * 2, h: x.u * 8 }, { size: Math.max(minText(x), x.u * 3), color: x.muted, autoHeight: true }));
    const data = x.brief.content.data ?? [];
    const kind = data.length > 7 ? 'bar' : data.every((d) => /^\d{4}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(d.label)) ? 'line' : data.length <= 4 && data.every((d) => d.value >= 0) && Math.abs(data.reduce((s, d) => s + d.value, 0) - 100) < 1.5 ? 'donut' : 'column';
    out.push({ id: newId('c'), type: 'chart', role: 'data', name: 'Chart', chart: kind, data, colors: [x.accent, x.dir.tokens.accent2 ?? x.ink, x.muted], values: true, font: x.dir.tokens.fonts.body, color: x.ink, ...(x.brief.content.dataSource ? { source: x.brief.content.dataSource } : {}), ...(x.brief.content.dataUnit ? { unit: x.brief.content.dataUnit } : {}), x: x.m, y: x.H * 0.3, w: x.W - x.m * 2, h: x.H * 0.46, rotation: 0, opacity: 1 } as Node);
    // the takeaways in the designer's exact words; when there are several, each is numbered by a label of its own
    const takeaways = (x.brief.content.items ?? []).slice(0, 3);
    const numbered = takeaways.length > 1;
    const indent = numbered ? x.u * 4 : 0;
    takeaways.forEach((t, i) => {
      const y = x.H * 0.8 + i * x.u * 4;
      if (numbered) out.push(text(x, 'label', String(i + 1), { x: x.m, y, w: x.u * 3, h: x.u * 3.6 }, { size: Math.max(minText(x), x.u * 2.4), weight: 700, color: x.accent === x.ground ? x.ink : ensureContrast(x.accent, x.ground, 3), case: 'none', tracking: 0 }));
      out.push(text(x, 'body', t, { x: x.m + indent, y, w: x.W - x.m * 2 - indent, h: x.u * 3.6 }, { size: Math.max(minText(x), x.u * 2.4), autoHeight: true }));
    });
    if (!x.brief.content.dataSource) out.push(text(x, 'caption', 'Source: [say where the numbers come from]', { x: x.m, y: x.H - x.m - x.u * 2.4, w: x.W - x.m * 2, h: x.u * 2.4 }, { size: Math.max(minText(x), x.u * 1.8), color: x.muted }));
    return out;
  },
  process: (x) => {
    const out: Node[] = [];
    out.push(text(x, 'headline', x.brief.content.headline, { x: x.m, y: x.m, w: x.W - x.m * 2, h: x.H * 0.16 }, { lineHeight: 1 }));
    const steps = x.brief.content.items?.length ? x.brief.content.items : ['[Step one]', '[Step two]', '[Step three]'];
    const top = x.H * 0.28;
    const rowH = (x.H - top - x.m * 1.5) / steps.length;
    steps.slice(0, 6).forEach((s, i) => {
      const y = top + i * rowH;
      const d = Math.min(rowH * 0.62, x.u * 11);
      out.push({ id: newId('s'), type: 'shape', shape: 'ellipse', role: 'motif', name: `Step ${i + 1}`, fill: x.accent, x: x.m, y, w: d, h: d, rotation: 0, opacity: 1 } as Node);
      out.push(text(x, 'label', String(i + 1), { x: x.m, y: y + d * 0.18, w: d, h: d * 0.7 }, { size: d * 0.46, align: 'center', weight: 700, color: x.accentInk, font: x.dir.tokens.fonts.display, case: 'none', tracking: 0 }));
      out.push(text(x, 'body', s, { x: x.m + d + x.u * 3, y: y + d * 0.12, w: x.W - x.m * 2 - d - x.u * 3, h: rowH * 0.8 }, { size: Math.max(minText(x), x.u * 3), autoHeight: true }));
      if (i < steps.length - 1) out.push({ id: newId('s'), type: 'shape', shape: 'line', role: 'motif', name: 'Connector', fill: null, stroke: { color: x.accent, width: Math.max(1, x.u * 0.4) }, x: x.m + d / 2 - rowH * 0.2, y: y + d + (rowH - d) / 2, w: rowH * 0.4, h: 2, rotation: 90, opacity: 1 } as Node);
    });
    return out;
  },
  identity: (x) => LAYOUTS.statement(x, { archetype: 'statement', focal: 'type', hierarchy: [], colour: 'ground', shapes: 'mass', said: [] }),
  banner: (x, plan) => {
    const out: Node[] = [];
    const c = x.brief.content;
    const motif = plan.shapes !== 'none' ? fig(x, 'mass') : null;
    if (x.brief.images[0]) out.push(image(x, x.brief.images[0], { x: x.W * 0.62, y: 0, w: x.W * 0.38, h: x.H }));
    else if (motif) out.push(shape(x, 'motif', motif, { x: x.W * 0.66, y: -x.H * 0.3, w: x.H * 1.6, h: x.H * 1.6 }, x.accent));
    const inner = x.H - x.m * 2;
    const textW = c.cta ? x.W * 0.4 : x.W * 0.54;
    let top = x.m;
    if (c.brand) {
      out.push(text(x, 'logo', c.brand, { x: x.m, y: top, w: textW, h: inner * 0.14 }, { size: Math.max(minText(x), inner * 0.1), weight: 700, case: 'none', tracking: 20 }));
      top += inner * 0.18;
    }
    const sub = c.subhead;
    const room = x.H - x.m - top;
    out.push(text(x, 'headline', c.headline, { x: x.m, y: top, w: textW, h: sub ? room * 0.64 : room }, { valign: sub ? 'bottom' : 'middle', lineHeight: 0.95 }));
    if (sub) out.push(text(x, 'subhead', sub, { x: x.m, y: top + room * 0.7, w: textW, h: room * 0.3 }, { size: Math.max(minText(x), room * 0.13), autoHeight: true }));
    if (c.cta) {
      // the action in the space between the words and the picture, centred in it
      const gapL = x.m + textW + x.u * 4;
      const gapR = x.W * 0.62 - x.u * 4;
      const bw = Math.min(gapR - gapL, x.u * 60);
      const bh = Math.min(x.H * 0.3, x.u * 16);
      const bx = gapL + (gapR - gapL - bw) / 2;
      out.push(rect(x, 'cta', { x: bx, y: (x.H - bh) / 2, w: bw, h: bh }, x.ink, { radius: x.dir.look.buttons === 'pill' ? bh / 2 : x.dir.look.buttons === 'square' ? 0 : bh * 0.12 }));
      out.push(text(x, 'cta', c.cta, { x: bx, y: (x.H - bh) / 2, w: bw, h: bh }, { size: Math.max(minText(x), bh * 0.32), align: 'center', valign: 'middle', weight: 700, color: ensureContrast(x.ground, x.ink, 4.5) }));
    }
    return out;
  },
  carousel: (x, plan) => LAYOUTS.statement(x, plan),
  // a Composition Plan drawn by its family's procedure and held to the rules (composition/render.ts); the relationships
  // it relied on are kept with the plan's record on the artboard
  generative: (x, plan) => {
    const g0 = generate(KIT, x, plan.generativeRequest ?? {});
    // the engine's own readability pass: the document's checks and their bounded repairs (a plate where words straddle
    // grounds no one colour reads on, words fitted to their path), so a generated design leaves here already clean
    // (the designer's pictures stand in by reference, so the normaliser keeps the objects that show them)
    const stand = x.brief.images.filter((id) => /^[A-Za-z][\w-]{0,47}$/.test(id)).map((id) => ({ id, kind: 'image', src: `upload:${id.slice(0, 96)}`, width: 1000, height: 1000, name: id }));
    const tmp = normalizeDoc({ name: 'generated', tokens: x.dir.tokens, assets: stand, artboards: [{ id: 'gen', name: 'gen', width: x.W, height: x.H, unit: x.f.unit, dpi: x.f.dpi, safe: x.f.safe, bleed: x.f.bleed, format: x.f.id, background: x.ground, children: g0.nodes }] });
    const repaired = tmp ? refineDoc(tmp, x.measure).doc.artboards[0]?.children : null;
    const g = { ...g0, nodes: repaired?.length ? repaired : g0.nodes };
    plan.generative = { concept: g.concept, signature: g.signature, trace: g.trace, unresolved: g.unresolved, problems: g.problems, attempts: g.attempts };
    plan.said.push(`Concept: ${g.concept.idea}`, g.concept.artDirection, ...g.reading.said.slice(0, 2));
    if (g.unresolved.length) plan.said.push(`Tight at this size (${g.unresolved.slice(0, 2).join('; ')}); the checks below say what remains.`);
    return g.nodes;
  },
  composition: (x, plan) => {
    if (!plan.composition) return LAYOUTS.statement(x, plan);
    const r = renderComposition(KIT, x, plan.composition);
    plan.composition = { ...plan.composition, relations: r.relations };
    if (r.notes.includes('no picture')) plan.said.push('No picture was given for this picture-led composition: a figure of the language stands where it would be.');
    if (r.unresolved.length) plan.said.push(`The ${FAMILY_BY_ID.get(plan.composition.family)?.label.toLowerCase() ?? 'chosen'} composition is tight at this size (${r.unresolved.slice(0, 2).join('; ')}); the checks below say what remains.`);
    return r.nodes;
  },
  ...newLayouts(),
  ...styleLayouts(KIT),
};

/** The artboard for one format (one slide of a carousel), composed (see the head of this file). */
function composeBoard(brief: GraphicBrief, dir: GraphicDirection, f: Format, measure: Measure, seed: number, slide?: { index: number; total: number; point?: string }, over?: PlanOverride): { board: Artboard; plan: Plan } {
  const plan0 = planFor(brief, dir, f, { over });
  const plan = slide && slide.index > 0 ? { ...plan0, archetype: 'statement' as Archetype, shapes: 'motif' as const } : plan0;
  const x = contextFor(brief, dir, f, plan, measure, seed + (slide?.index ?? 0));
  let children: Node[];
  if (slide && slide.index > 0) {
    // a slide after the cover: its number, its one point, the progress, the brand
    const last = slide.index === slide.total - 1;
    const words = last ? brief.content.cta ?? brief.content.headline : slide.point ?? '';
    children = [
      text(x, 'label', `${String(slide.index).padStart(2, '0')} / ${String(slide.total - 1).padStart(2, '0')}`, { x: x.m, y: x.m, w: x.W * 0.4, h: x.u * 4 }, { size: Math.max(minText(x), x.u * 2.4), weight: 600, color: x.muted }),
      text(x, last ? 'cta' : 'body', words, { x: x.m, y: x.H * 0.28, w: x.W - x.m * 2, h: x.H * 0.44 }, { size: undefined, font: x.dir.tokens.fonts.display, weight: Math.min(800, x.dir.look.weight), lineHeight: 1.05 }),
      ...(fig(x, 'edge', slide.index) ? [shape(x, 'motif', fig(x, 'edge', slide.index)!, { x: 0, y: x.H * 0.88, w: x.W, h: x.H * 0.12 }, x.accent)] : []),
      ...(brief.content.brand ? [text(x, 'logo', brief.content.brand, { x: x.W * 0.5, y: x.m, w: x.W * 0.5 - x.m, h: x.u * 4 }, { size: Math.max(minText(x), x.u * 2.4), align: 'right', weight: 700, case: 'none', tracking: 10 })] : []),
    ];
    // a display text fitted at its natural size, not left at the minimum
    const main = children[1] as TextNode;
    main.size = fitSize({ ...main, size: x.u * 17 }, measure, minText(x)) * 0.96;
  } else children = dress(x, plan, ensureWords(x, LAYOUTS[plan.archetype](x, plan), slide ? 'cover' : brief.kind));
  // a carousel's cover says there is more, as its slides do: the same edge, and an arrow
  if (slide && slide.index === 0) {
    const edge = fig(x, 'edge', 0);
    if (edge && plan.shapes !== 'none') children.push(shape(x, 'motif', edge, { x: 0, y: x.H * 0.88, w: x.W, h: x.H * 0.12 }, x.accent));
    children.push(text(x, 'label', '→', { x: x.W - x.m - x.u * 10, y: x.H - x.m - x.u * 10, w: x.u * 10, h: x.u * 10 }, { size: x.u * 8, align: 'right', weight: 700, font: x.dir.tokens.fonts.body, case: 'none', tracking: 0, color: x.ink }));
  }
  const board: Artboard = {
    id: newId('ab'),
    name: slide ? (slide.index === 0 ? 'Cover' : slide.index === slide.total - 1 ? 'End' : `Slide ${slide.index}`) : f.label,
    width: f.width,
    height: f.height,
    unit: f.unit,
    dpi: f.dpi,
    format: f.id,
    // a generated design lays its own ground (the paper, the accent as a field, the ink): the artboard takes it
    background: plan.archetype === 'generative' ? ((g) => (g && g.type === 'shape' && typeof g.fill === 'string' ? g.fill.slice(0, 7) : x.ground))(children.find((n) => n.role === 'background' && n.type === 'shape' && n.w >= x.W * 0.98 && n.h >= x.H * 0.98 && typeof (n as { fill?: unknown }).fill === 'string' && (n as { name?: string }).name === 'Ground')) : x.ground,
    bleed: f.bleed,
    safe: f.safe,
    children,
    ...(plan.composition ? { composition: plan.composition } : {}),
    ...(plan.generative ? { concept: conceptRecord(plan.generative.concept, plan.generative.signature, { seed: String(plan.generativeRequest?.seed ?? plan.generative.concept.seed), ...(plan.generativeRequest?.emphasis ? { emphasis: plan.generativeRequest.emphasis } : {}), ...(plan.generativeRequest?.constraints ? { constraints: plan.generativeRequest.constraints } : {}) }) } : {}),
  };
  return { board, plan };
}

/**
 * Every word the brief gives, on the design: a layout with no place for one (a call to action, a subtitle, the body,
 * the brand, a detail, a point) gets it in the first free band of the artboard, never on top of other words. The
 * exact wording is the designer's; the composition may only decide where it goes.
 */
function ensureWords(x: Ctx, out: Node[], kind: GraphicKind | 'cover'): Node[] {
  const c = x.brief.content;
  const texts = () => out.filter((n): n is TextNode => n.type === 'text').map((n) => n.text.replace(/\s*→$/, ''));
  const has = (w: string) => texts().some((t) => t === w || t.split(/\n|\s{2}·\s{2}/).includes(w) || t.includes(w));
  const busy = (n: Node) => (n.type === 'text' || n.type === 'image' || n.type === 'chart') && n.role !== 'background' && !n.hidden;
  const head = out.find((n) => n.type === 'text' && (n.role === 'headline' || n.role === 'logo'));
  const bottom = x.H - x.m;
  const free = (h: number, w: number, from: number, to: number, upward = false, offPictures = false): number | null => {
    const boxes = out.filter((n) => busy(n) || (offPictures && n.type === 'image')).map((n) => ({ x0: n.x, x1: n.x + n.w, y0: n.y, y1: n.y + n.h }));
    const fits = (y: number) => !boxes.some((o) => y < o.y1 && y + h > o.y0 && x.m < o.x1 && x.m + w > o.x0);
    if (upward) {
      for (let y = to - h; y >= from; y -= x.u) if (fits(y)) return y;
    } else for (let y = from; y + h <= to; y += x.u) if (fits(y)) return y;
    return null;
  };
  const place = (role: Role, words: string, size: number, s: Partial<TextNode>, opts: { upward?: boolean; from?: number } = {}) => {
    const lines = Math.max(1, words.split('\n').length);
    for (const k of [0.62, 1]) {
      const w = (x.W - x.m * 2) * k;
      const h = size * 1.4 * lines;
      const y = free(h, w, opts.from ?? (head ? head.y + head.h + x.u * 2 : x.m), bottom, opts.upward) ?? free(h, w, x.m, bottom, opts.upward, true);
      if (y !== null) return void out.push(text(x, role, words, { x: x.m, y, w, h }, { size, autoHeight: true, ...s }));
    }
    // no free band anywhere: placed at the foot all the same (the checks then say it collides; it is never dropped)
    out.push(text(x, role, words, { x: x.m, y: bottom - size * 1.4 * lines, w: (x.W - x.m * 2) * 0.62, h: size * 1.4 * lines }, { size, autoHeight: true, ...s }));
  };
  const small = Math.max(minText(x), x.u * 2.4);
  if (c.subhead && !has(c.subhead)) place('subhead', c.subhead, Math.max(minText(x), x.u * 3), {});
  if (c.body && !has(c.body)) place('body', c.body, small, {});
  if (c.cta && !has(c.cta)) place('cta', `${c.cta} →`, Math.max(minText(x), x.u * 2.8), { weight: 700, color: x.accent === x.ground ? x.ink : ensureContrast(x.accent, x.ground, 4.5) }, { upward: true });
  const missingMeta = (c.meta ?? []).filter((m) => !has(m));
  if (missingMeta.length) place('meta', missingMeta.join('\n'), small, { lineHeight: 1.35 }, { upward: true });
  if (c.brand && !has(c.brand)) place('logo', c.brand, small, { weight: 700, case: 'none', tracking: 20 }, { from: x.m });
  // points, where the layout is not built on them (a carousel's slides, an infographic's takeaways, a magazine's lines)
  if (!['carousel', 'cover', 'infographic', 'magazine'].includes(kind)) for (const it of (c.items ?? []).filter((i) => !has(i))) place('body', it, small, {});
  return out;
}

/** Identity boards: the wordmark, the palette, the type, the shape language. */
function identityBoards(brief: GraphicBrief, dir: GraphicDirection, f: Format, measure: Measure, seed: number): Artboard[] {
  const base = composeBoard({ ...brief, kind: 'announcement' }, dir, f, measure, seed).board;
  const vocab = planFor(brief, dir, f).vocabulary;
  const x = contextFor(brief, dir, f, { archetype: 'identity', focal: 'type', hierarchy: [], colour: 'ground', shapes: 'mass', said: [], ...(vocab ? { vocabulary: vocab } : {}) }, measure, seed);
  const strong = !!x.vocab && x.vocab.strength >= 2 && x.vocab.motifs.length > 0;
  const name = brief.content.brand || brief.content.headline;
  const mark = strong ? motifNode(x, 0, { x: x.W / 2 - x.u * 8, y: x.H * 0.12, w: x.u * 16, h: x.u * 16 }) : fig(x, 'echo') ? shape(x, 'motif', fig(x, 'echo')!, { x: x.W / 2 - x.u * 8, y: x.H * 0.12, w: x.u * 16, h: x.u * 16 }, x.accent) : null;
  const wordmark: Artboard = { ...base, id: newId('ab'), name: 'Wordmark', children: [
    text(x, 'logo', name, { x: x.m, y: x.H * 0.3, w: x.W - x.m * 2, h: x.H * 0.3 }, { align: 'center', size: undefined, weight: Math.max(600, dir.look.weight) }),
    ...(mark ? [mark] : []),
    // the designer's own line under the wordmark, when they gave one (never a sentence SocriaUX wrote)
    ...(brief.content.subhead ? [text(x, 'subhead', brief.content.subhead, { x: x.m, y: x.H * 0.64, w: x.W - x.m * 2, h: x.u * 5 }, { align: 'center', size: Math.max(minText(x), x.u * 2.6), color: x.muted, autoHeight: true })] : []),
  ] };
  const colours = Object.entries(dir.tokens.colors).filter(([k]) => ['background', 'text', 'accent', 'muted', 'line'].includes(k));
  const sw = (x.W - x.m * 2) / colours.length;
  const palette: Artboard = { ...base, id: newId('ab'), name: 'Palette', children: [
    text(x, 'headline', 'Colour', { x: x.m, y: x.m, w: x.W * 0.5, h: x.u * 10 }, { size: Math.max(minText(x) * 2, x.u * 7), case: 'none' }),
    ...colours.flatMap(([k, v], i) => [
      rect(x, 'motif', { x: x.m + i * sw, y: x.H * 0.3, w: sw - x.u, h: x.H * 0.45 }, v, { stroke: { color: x.dir.tokens.colors.line, width: 1 } }),
      text(x, 'caption', `${k}\n${v.toUpperCase()}`, { x: x.m + i * sw, y: x.H * 0.78, w: sw - x.u, h: x.u * 7 }, { size: Math.max(minText(x), x.u * 2), lineHeight: 1.4, autoHeight: true }),
    ]),
  ] };
  const type: Artboard = { ...base, id: newId('ab'), name: 'Typography', children: [
    text(x, 'headline', 'Aa', { x: x.m, y: x.H * 0.14, w: x.W * 0.4, h: x.H * 0.55 }, { size: x.H * 0.42, case: 'none', lineHeight: 1 }),
    text(x, 'subhead', `${dir.tokens.fonts.display}\nfor headlines`, { x: x.W * 0.48, y: x.H * 0.2, w: x.W * 0.48 - x.m, h: x.u * 12 }, { size: Math.max(minText(x), x.u * 4), font: dir.tokens.fonts.display, lineHeight: 1.15, autoHeight: true }),
    text(x, 'body', `${dir.tokens.fonts.body} for text — the quick brown fox jumps over the lazy dog, 0123456789.`, { x: x.W * 0.48, y: x.H * 0.5, w: x.W * 0.48 - x.m, h: x.u * 14 }, { size: Math.max(minText(x), x.u * 2.6), autoHeight: true }),
  ] };
  const shapes: Node[] = [];
  if (strong) {
    // the vocabulary's shapes, each in three of its own variations: the shape language the brief asked for
    const c4 = (x.W - x.m * 2) / 4;
    const r3 = (x.H - x.m * 2 - x.u * 12) / 3;
    for (let i = 0; i < 12; i++) {
      const base0 = x.vocab!.motifs[i % x.vocab!.motifs.length];
      const spec = PRIMITIVE_BY_KIND.get(base0.kind);
      const varied: Prim = { kind: base0.kind, params: { ...base0.params } };
      // a variation: each numeric parameter moved within its range by the cell
      for (const q of spec?.params ?? []) if (q.key !== 'seed' && i >= x.vocab!.motifs.length) varied.params[q.key] = Math.max(q.min, Math.min(q.max, q.def + ((q.max - q.min) * (((i * 37 + q.key.length * 11) % 7) - 3)) / 14));
      if (spec?.params.some((q) => q.key === 'seed')) varied.params.seed = seed + i * 13;
      const paint = i % 3 === 0 ? x.accent : i % 3 === 1 ? x.ink : null;
      shapes.push(primNode(x, 'motif', varied, { x: x.m + (i % 4) * c4 + c4 * 0.12, y: x.m + x.u * 12 + Math.floor(i / 4) * r3 + r3 * 0.1, w: c4 * 0.76, h: r3 * 0.8 }, paint));
    }
  } else if (dir.form) for (let i = 0; i < 12; i++) {
    const r = figureFor(dir.form, (['mass', 'echo', 'cut', 'edge'] as const)[i % 4], i, `identity|${seed}`);
    const c = (x.W - x.m * 2) / 4;
    const rr = (x.H - x.m * 2 - x.u * 12) / 3;
    shapes.push(shape(x, 'motif', r, { x: x.m + (i % 4) * c + c * 0.12, y: x.m + x.u * 12 + Math.floor(i / 4) * rr + rr * 0.1, w: c * 0.76, h: rr * 0.8 }, i % 3 === 0 ? x.accent : i % 3 === 1 ? x.ink : null, i % 3 === 2 ? ({ stroke: { color: x.ink, width: Math.max(1, x.u * 0.3) } } as Partial<Node>) : {}));
  }
  const motifs: Artboard = { ...base, id: newId('ab'), name: 'Shape language', children: [text(x, 'headline', 'Shapes', { x: x.m, y: x.m, w: x.W * 0.5, h: x.u * 10 }, { size: Math.max(minText(x) * 2, x.u * 7), case: 'none' }), ...shapes] };
  // the vocabulary's pattern, as the identity's own surface
  const surface: Artboard[] = x.vocab?.pattern && x.vocab.strength >= 2 ? [{ ...base, id: newId('ab'), name: 'Pattern', children: [patternNode(x, x.vocab.pattern, { x: 0, y: 0, w: x.W, h: x.H }), text(x, 'label', 'Pattern', { x: x.m, y: x.H - x.m - x.u * 5, w: x.W * 0.4, h: x.u * 5 }, { size: Math.max(minText(x), x.u * 2.4), weight: 700, case: 'upper', tracking: 120 })] }] : [];
  return [wordmark, palette, type, ...(dir.form || strong ? [motifs] : []), ...surface, { ...base, name: 'Application' }];
}

export interface Composed {
  doc: GraphicDoc;
  plans: Plan[];
  /** placeholders the brief left to fill */
  placeholders: string[];
}

/** A graphic composed from a brief and a direction (see the head of this file). */
export function composeGraphic(brief: GraphicBrief, dir: GraphicDirection, opts: { measure?: Measure; seed?: number; assets?: GraphicDoc['assets']; name?: string; over?: PlanOverride } = {}): Composed {
  const measure = opts.measure ?? approxMeasure;
  const seed = opts.seed ?? 7;
  const plans: Plan[] = [];
  const boards: Artboard[] = [];
  const fmts = brief.formats.map((id) => formatOf(id)).filter((f): f is Format => !!f);
  if (!fmts.length) fmts.push(formatOf('instagram-square')!);
  if (brief.kind === 'identity') {
    boards.push(...identityBoards(brief, dir, fmts[0], measure, seed));
    plans.push({ ...planFor(brief, dir, fmts[0]), archetype: 'identity' });
  }
  else if (brief.kind === 'carousel') {
    const points = brief.content.items?.length ? brief.content.items : ['[First point]', '[Second point]', '[Third point]'];
    const total = points.length + 2;
    for (let i = 0; i < total; i++) {
      const r = composeBoard(brief, dir, fmts[0], measure, seed, { index: i, total, point: points[i - 1] });
      boards.push(r.board);
      plans.push(r.plan);
    }
  } else if (brief.kind === 'card') {
    const front = composeBoard(brief, dir, fmts[0], measure, seed, undefined, opts.over);
    boards.push({ ...front.board, name: 'Front' });
    plans.push(front.plan);
    const x = contextFor(brief, dir, fmts[0], { ...front.plan, colour: 'accent-field' }, measure, seed);
    boards.push({ ...front.board, id: newId('ab'), name: 'Back', background: x.ground, children: [text(x, 'logo', brief.content.brand || '[Brand]', { x: x.m, y: x.H * 0.32, w: x.W - x.m * 2, h: x.H * 0.36 }, { align: 'center', valign: 'middle', size: undefined, weight: 700, case: 'none' }), ...(fig(x, 'edge') ? [shape(x, 'motif', fig(x, 'edge')!, { x: 0, y: x.H * 0.8, w: x.W, h: x.H * 0.2 }, x.accent)] : [])] });
  } else
    for (const f of fmts) {
      const r = composeBoard(brief, dir, f, measure, seed, undefined, opts.over);
      boards.push(r.board);
      plans.push(r.plan);
    }
  const vocab = plans.find((p) => p.vocabulary && p.vocabulary.strength >= 1)?.vocabulary;
  const raw = { schema: 1, id: newId('gd'), name: opts.name ?? brief.content.headline.slice(0, 60), direction: { name: dir.name, language: dir.language }, tokens: dir.tokens, artboards: boards, assets: opts.assets ?? [], revision: 1, updatedAt: Date.now(), ...(vocab ? { vocabulary: vocabularyRecord(vocab) } : {}), ...(dir.style ? { style: dir.style } : {}) };
  const doc = normalizeDoc(raw);
  if (!doc) throw new Error('The composition could not be held to the document’s shape.');
  const placeholders = [...new Set(doc.artboards.flatMap((b) => b.children.flatMap((n) => (n.type === 'text' ? n.text.match(/\[[^\]]+\]/g) ?? [] : []))))];
  return { doc, plans, placeholders };
}

/** Content read back from a composed artboard by role: what format adaptation carries to another size. */
export function contentOf(board: Artboard): { content: GraphicContent; images: string[]; styles: Partial<Record<Role, Partial<TextNode>>> } {
  const texts = board.children.filter((n): n is TextNode => n.type === 'text');
  const by = (r: Role) => texts.find((t) => t.role === r);
  const style = (t?: TextNode): Partial<TextNode> | undefined => (t ? { font: t.font, weight: t.weight, color: t.color, case: t.case, tracking: t.tracking, italic: t.italic } : undefined);
  // every picture, wherever the composition put it (a masked or cut picture sits in a group)
  const images = [...new Set(walk(board).filter((l) => l.node.type === 'image').map((l) => (l.node as { asset: string }).asset))] as string[];
  // every detail, wherever the composition set it (one block, or a station each on a timeline)
  const meta = texts
    .filter((t) => t.role === 'meta')
    .flatMap((t) => t.text.split('\n').flatMap((l) => l.split('  ·  ')))
    .filter(Boolean);
  return {
    content: {
      headline: by('headline')?.text ?? by('logo')?.text ?? '',
      ...(by('subhead') ? { subhead: by('subhead')!.text } : {}),
      ...(by('body') ? { body: by('body')!.text } : {}),
      ...(by('cta') ? { cta: by('cta')!.text.replace(/\s*→$/, '') } : {}),
      ...(meta?.length ? { meta } : {}),
      ...(by('logo') ? { brand: by('logo')!.text } : {}),
    },
    images,
    styles: Object.fromEntries((['headline', 'subhead', 'body', 'meta', 'logo', 'cta'] as Role[]).map((r) => [r, style(by(r))]).filter(([, v]) => v)) as Partial<Record<Role, Partial<TextNode>>>,
  };
}

/**
 * A composition carried to another format: its words exactly, its pictures, its type styles, re-laid on the new
 * artboard's own grid by the same plan (never stretched or cropped). The new artboard is returned to add beside the
 * original.
 */
export function adaptBoard(doc: GraphicDoc, boardId: string, formatId: string, dir: GraphicDirection, opts: { measure?: Measure; kind?: GraphicKind } = {}): Artboard | null {
  const board = doc.artboards.find((b) => b.id === boardId);
  const f = formatOf(formatId);
  if (!board || !f) return null;
  const read = contentOf(board);
  if (!read.content.headline) return null;
  const brief: GraphicBrief = { purpose: 'adapted', kind: opts.kind ?? (f.width / f.height > 2.2 ? 'banner' : 'poster'), formats: [f.id], content: read.content, mood: [], images: read.images };
  const { board: next } = composeBoard(brief, { ...dir, tokens: doc.tokens }, f, opts.measure ?? approxMeasure, 11);
  // the type styles the designer set, kept (sizes are the new format's own)
  for (const n of next.children) {
    if (n.type !== 'text' || !n.role) continue;
    const s = read.styles[n.role];
    if (s) Object.assign(n, Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)));
  }
  // with its words' styles, the headline is fitted again to its new box
  const head = next.children.find((n): n is TextNode => n.type === 'text' && n.role === 'headline');
  if (head) head.size = Math.min(head.size, fitSize({ ...head, size: head.size * 1.4 }, opts.measure ?? approxMeasure, 6) * 0.95);
  return { ...next, name: `${f.label} (from ${board.name})`, background: board.background };
}

// ── the vocabulary, placed (vocabulary.ts decides; these place) ──

type Box = { x: number; y: number; w: number; h: number };

const inkOf = (x: Ctx, r: InkRole): string => (r === 'accent' ? x.accent : r === 'accent2' ? x.accent2 : r === 'muted' ? x.muted : r === 'line' ? ensureContrast(x.dir.tokens.colors.line, x.ground, 1.5) : r === 'ground' ? x.ground : x.ink);

/** Effects sized to this artboard (their lengths were chosen for one about a thousand pixels across) and coloured
 * from its palette (a glow in the accent, two riso inks from the accents, a halftone in ink on the ground). */
const PX_FX = new Set(['dx', 'dy', 'blur', 'spread', 'size', 'width', 'radius', 'distance', 'depth', 'offset', 'amplitude', 'wavelength']);
function paletteFx(x: Ctx, effects: readonly Effect[]): Effect[] {
  const k = x.u / 10.8;
  return effects.map((e0) => {
    const e: Effect = { ...e0, params: Object.fromEntries(Object.entries(e0.params).map(([key, v]) => [key, PX_FX.has(key) && !(e0.kind === 'grain' && key === 'size') ? Math.round(v * k * 100) / 100 : v])) };
    switch (e.kind) {
      case 'glow':
      case 'inner-glow':
        return { ...e, color: x.accent };
      case 'misregistration':
        return { ...e, color: x.accent, color2: x.accent2 };
      case 'halftone':
      case 'dither':
      case 'threshold':
        return { ...e, color: x.ink, color2: x.ground };
      case 'duotone':
        return { ...e, color: x.ink, color2: mixColor(x.accent, '#ffffff', 0.35).slice(0, 7) };
      case 'tritone':
        return { ...e, color: x.ink, color2: x.accent, color3: mixColor(x.accent2, '#ffffff', 0.6).slice(0, 7) };
      case 'mono':
        return x.vocab?.style === 'monochrome' ? { ...e, color: mixColor(x.accent, '#ffffff', 0.55).slice(0, 7) } : e;
      case 'outline':
        return { ...e, color: x.ground };
      case 'extrude':
        return { ...e, color: x.ink };
      default:
        return e;
    }
  });
}

/** A pattern of the vocabulary in a box: its lengths given in units of the artboard become px. */
function patternNode(x: Ctx, use: PatternUse, box: Box, s: Record<string, unknown> = {}): Node {
  const params = Object.fromEntries(Object.entries(use.params).map(([k, v]) => [k, isPxParam(use.gen, k) ? Math.round(v * x.u * 100) / 100 : v]));
  return { id: newId('p'), type: 'pattern', role: 'motif', name: PATTERN_BY_KIND.get(use.gen)?.label ?? 'Pattern', gen: use.gen, params, colors: use.inks.map((r) => inkOf(x, r)), x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: use.opacity, ...s } as Node;
}
const pdef = (gen: string, params: Record<string, number>, inks: InkRole[], opacity = 1): PatternUse => ({ gen, params: { ...Object.fromEntries(Object.entries(PATTERN_BY_KIND.get(gen) ? Object.fromEntries((PATTERN_BY_KIND.get(gen)!.params ?? []).map((q) => [q.key, q.def])) : {})), ...params }, inks, opacity, where: 'full' });
const primOf = (kind: string, params: Record<string, number> = {}): Prim => ({ kind, params: { ...(primDefaults(kind)?.params ?? {}), ...params } });

/** A primitive as a shape: drawn as lines where the primitive is a line drawing. */
function primNode(x: Ctx, role: Role, p: Prim, box: Box, paint: Paint | null, s: Record<string, unknown> = {}): Node {
  const spec = PRIMITIVE_BY_KIND.get(p.kind);
  const stroked = !!spec?.stroked || paint === null;
  const strokeColour = typeof paint === 'string' ? paint : x.accent;
  return { id: newId('s'), type: 'shape', shape: 'prim', prim: p, role, name: spec?.label ?? 'Shape', fill: stroked ? null : paint, ...(stroked ? { stroke: { color: strokeColour, width: Math.max(1.2, x.u * 0.4), cap: 'round', join: 'round' } } : {}), x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: 1, ...s } as Node;
}

/** The vocabulary's motif k (cycling) as a shape, painted as the vocabulary says, with its effects. */
function motifNode(x: Ctx, k: number, box: Box, s: Record<string, unknown> = {}): Node | null {
  const v = x.vocab;
  if (!v?.motifs.length) return null;
  const p = v.motifs[k % v.motifs.length];
  const paint: Paint | null =
    v.motifPaint === 'ink' ? x.ink : v.motifPaint === 'accent2' ? (k % 2 ? x.accent : x.accent2) : v.motifPaint === 'outline' ? null : v.motifPaint === 'gradient' ? (v.gradient ? tintPreset(v.gradient, x.accent) : x.accent) : k % 3 === 2 ? x.accent2 : x.accent;
  return primNode(x, 'motif', p, box, paint, { ...(v.marks.length ? { effects: paletteFx(x, v.marks) } : {}), ...s });
}

/** A group whose first child (a primitive's silhouette) masks a picture: a picture cut into a shape. */
function cutPicture(x: Ctx, asset: string, p: Prim, box: Box, s: Record<string, unknown> = {}): Node {
  return { id: newId('g'), type: 'group', name: 'Cut picture', mask: 'alpha', x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0, opacity: 1, children: [primNode(x, 'motif', p, { x: 0, y: 0, w: box.w, h: box.h }, '#000000', { name: 'Cut' }), { ...image(x, asset, { x: 0, y: 0, w: box.w, h: box.h }), ...(x.vocab?.image.length ? { effects: paletteFx(x, x.vocab.image) } : {}) }], ...s } as Node;
}

/** The longest word's width at size 100, for setting type to a measure. */
const wordW = (x: Ctx, n: TextNode, w: string) => x.measure(n.case === 'upper' ? w.toUpperCase() : w, n.font, n.weight, 100, !!n.italic) / 100 + (n.tracking / 1000) * Math.max(0, w.length - 1);

/** A type treatment applied to a headline: its words never change (warps, paths, echoes and runs are how it is set). */
function treat(x: Ctx, head: TextNode, t: TypeTreatment): void {
  const fits = (n: TextNode) => {
    const L = layoutText({ ...n, autoHeight: false }, x.measure);
    return !L.overflow && !L.brokenWord;
  };
  const shrinkToFit = () => {
    for (let i = 0; i < 30 && !fits(head) && head.size > minText(x); i++) head.size = Math.max(minText(x), head.size * 0.94);
  };
  const words = head.text.split(/\s+/).filter(Boolean);
  switch (t) {
    case 'oversized':
      head.size = Math.max(head.size, fitSize({ ...head, size: head.size * 1.5 }, x.measure, minText(x)));
      break;
    case 'stacked': {
      // each word on its own line: the size that sets the longest word across the box, then as large as the height allows
      const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '');
      head.lineHeight = 0.86;
      head.size = Math.min((head.w * 0.97) / Math.max(0.1, wordW(x, head, longest)), head.size * 2.4);
      shrinkToFit();
      // the weights alternate down the stack where the face has a range
      const light = nearestWeight(head.font, 300);
      if (words.length > 1 && light < head.weight - 150) {
        const runs: NonNullable<TextNode['runs']> = [];
        const re = /\S+/g;
        let m: RegExpExecArray | null;
        let i = 0;
        while ((m = re.exec(head.text))) if (i++ % 2 === 1) runs.push({ start: m.index, end: m.index + m[0].length, weight: light });
        if (runs.length) head.runs = runs;
      }
      break;
    }
    case 'echo':
      head.repeat = { count: 5, dx: x.u * 0.8, dy: x.u * 0.8, fade: 0.85, outline: true };
      head.w = Math.max(8, head.w - x.u * 4);
      head.h = Math.max(8, head.h - x.u * 4);
      shrinkToFit();
      break;
    case 'outline':
      head.fill = null;
      head.stroke = { color: head.color, width: Math.max(1, head.size / 34) };
      break;
    case 'arc':
    case 'wave-path':
    case 'circle': {
      // one line along a path: the size that lets the words run along about nine tenths of it
      head.path = t === 'arc' ? { kind: 'arc', bend: 55, start: 50 } : t === 'circle' ? { kind: 'circle', bend: 0, start: 0 } : { kind: 'wave', bend: 0, start: 50, cycles: 1.2, amplitude: 45 };
      const line = head.text.replace(/\s+/g, ' ');
      for (let i = 0; i < 40; i++) {
        const s0 = head.size;
        const sag = Math.min(Math.max(1, head.h - s0 * 1.1), head.w / 2) * 0.55;
        const len = t === 'arc' ? head.w * (1 + (8 / 3) * (sag / head.w) ** 2) : t === 'circle' ? Math.PI * (head.w + head.h) / 2 - Math.PI * s0 * 1.7 : head.w * 1.12;
        const width = x.measure(head.case === 'upper' ? line.toUpperCase() : line, head.font, head.weight, s0, !!head.italic) + (head.tracking / 1000) * s0 * line.length;
        if (width <= len * (t === 'circle' ? 0.96 : 0.9) || s0 <= minText(x)) break;
        head.size = Math.max(minText(x), s0 * 0.93);
      }
      break;
    }
    case 'perspective':
    case 'rise':
    case 'wave':
    case 'stagger':
      head.warp = { kind: t, amount: t === 'perspective' ? 55 : t === 'rise' ? 40 : t === 'wave' ? 45 : 55, ...(t === 'wave' ? { cycles: 1 } : {}) };
      head.size = Math.max(minText(x), head.size * (t === 'perspective' ? 0.84 : 0.92));
      break;
    case 'gradient':
      if (contrastRatio(x.accent, x.ground) >= 3 && contrastRatio(x.accent2, x.ground) >= 3) head.fill = { type: 'linear', angle: 90, stops: [{ at: 0, color: x.accent }, { at: 1, color: x.accent2 }] };
      break;
    case 'spaced':
      head.tracking = 260;
      head.case = 'upper';
      head.weight = nearestWeight(head.font, 300);
      head.size = fitSize({ ...head, size: head.size }, x.measure, minText(x)) * 0.94;
      break;
    case 'italic-mix': {
      if (!hasItalic(head.font) || words.length < 2) break;
      const last = head.text.match(/\S+\s*$/);
      if (last?.index !== undefined) head.runs = [{ start: last.index, end: last.index + last[0].trimEnd().length, italic: true }];
      break;
    }
    default:
      break;
  }
}

/** A box where little else is: a band at the foot or the head, or the quarter the words leave most free. */
function freeRegion(x: Ctx, out: readonly Node[], where: PatternUse['where']): Box | null {
  const busy = out.filter((n) => (n.type === 'text' || n.type === 'image' || n.type === 'chart') && n.role !== 'background' && !n.hidden).map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const covered = (b: Box) => busy.reduce((sum, t) => sum + Math.max(0, Math.min(b.x + b.w, t.x + t.w) - Math.max(b.x, t.x)) * Math.max(0, Math.min(b.y + b.h, t.y + t.h) - Math.max(b.y, t.y)), 0) / (b.w * b.h);
  const W = x.W;
  const H = x.H;
  const cands: Box[] =
    where === 'full'
      ? [{ x: 0, y: 0, w: W, h: H }]
      : where === 'band'
        ? [{ x: 0, y: H * 0.72, w: W, h: H * 0.16 }, { x: 0, y: 0, w: W, h: H * 0.16 }, { x: 0, y: H * 0.5, w: W, h: H * 0.2 }]
        : [{ x: W / 2, y: 0, w: W / 2, h: H / 2 }, { x: 0, y: H / 2, w: W / 2, h: H / 2 }, { x: W / 2, y: H / 2, w: W / 2, h: H / 2 }, { x: 0, y: 0, w: W / 2, h: H / 2 }, { x: W * 0.62, y: 0, w: W * 0.38, h: H }];
  if (where === 'full') return cands[0];
  const best = cands.map((b) => ({ b, c: covered(b) })).sort((p, q) => p.c - q.c)[0];
  return best && best.c <= 0.12 ? best.b : null;
}

/** The vocabulary on a composition of Graphics 1.0's own archetypes (the new archetypes place their own): the
 * headline treated, pictures treated, the direction's figures turned into the vocabulary's shapes where the words
 * asked for this style, a pattern where there is room, a texture over the ground. */
function dress(x: Ctx, plan: Plan, out: Node[]): Node[] {
  const v = x.vocab;
  if (!v) return out;
  const own = (NEW_ARCHETYPES as readonly string[]).includes(plan.archetype) || isStyleConstruction(plan.archetype) || plan.archetype === 'composition' || plan.archetype === 'generative';
  const strong = v.strength >= 2;
  const fixedKinds = ['infographic', 'process', 'card', 'masthead', 'banner', 'carousel', 'identity', 'label'];
  const head = out.find((n): n is TextNode => n.type === 'text' && n.role === 'headline');
  if (head && !own && strong && !fixedKinds.includes(plan.archetype) && v.type !== 'vertical') treat(x, head, v.type);
  if (head && v.headline.length && !head.effects?.length) head.effects = paletteFx(x, v.headline);
  if (v.image.length) for (const n of out) if (n.type === 'image' && !n.effects?.length) (n as Node).effects = paletteFx(x, v.image);
  if (strong && v.motifs.length && !own) {
    let k = 0;
    out.forEach((n, i) => {
      if (n.type !== 'shape' || n.role !== 'motif' || n.shape !== 'recipe') return;
      const p = v.motifs[k++ % v.motifs.length];
      const spec = PRIMITIVE_BY_KIND.get(p.kind);
      const next = { ...n, shape: 'prim', prim: p, name: spec?.label ?? n.name } as Record<string, unknown>;
      delete next.recipe;
      if (spec?.stroked) Object.assign(next, { fill: null, stroke: { color: typeof n.fill === 'string' ? n.fill : x.accent, width: Math.max(1.2, x.u * 0.4), cap: 'round', join: 'round' } });
      else if (v.motifPaint === 'gradient' && v.gradient && n.fill !== null) next.fill = tintPreset(v.gradient, x.accent);
      out[i] = next as unknown as Node;
    });
  }
  if (v.marks.length && !own)
    out
      .filter((n) => n.type === 'shape' && n.role === 'motif' && n.shape !== 'line' && !n.effects?.length && n.w > x.u * 6)
      .sort((p, q) => q.w * q.h - p.w * p.h)
      .slice(0, 2)
      .forEach((n) => (n.effects = paletteFx(x, v.marks)));
  if (v.pattern && !own && !fixedKinds.includes(plan.archetype) && !out.some((n) => n.type === 'image' && n.role === 'background')) {
    const region = freeRegion(x, out, v.pattern.where);
    if (region) {
      const at = out.findIndex((n) => !(n.role === 'background'));
      out.splice(Math.max(0, at), 0, patternNode(x, v.pattern, region, v.pattern.where === 'full' ? { opacity: Math.min(v.pattern.opacity, 0.35) } : {}));
    }
  } else if (v.pattern && own && plan.patternAsked && !out.some((n) => n.type === 'pattern') && !out.some((n) => n.type === 'image' && n.role === 'background')) {
    // a construction that drew no pattern, for a brief that asked for one: where it leaves room, else quietly under
    // the whole frame (the shapes and plates of the construction above it, the checks keeping the words readable)
    const region = freeRegion(x, out, v.pattern.where);
    const at = out.findIndex((n) => !(n.role === 'background'));
    out.splice(Math.max(0, at), 0, patternNode(x, v.pattern, region ?? { x: 0, y: 0, w: x.W, h: x.H }, region && v.pattern.where !== 'full' ? {} : { opacity: Math.min(v.pattern.opacity, 0.3) }));
  }
  if (plan.archetype === 'label' && v.type === 'circle' && strong) {
    const logo = out.find((n): n is TextNode => n.type === 'text' && n.role === 'logo');
    const em = out.filter((n) => n.type === 'shape' && n.role === 'motif' && n.w < x.W * 0.6).sort((p, q) => q.w * q.h - p.w * p.h)[0];
    if (logo && em) {
      // the emblem a seal, the maker's name round it
      const pad = x.u * 6;
      Object.assign(logo, { x: em.x - pad, y: em.y - pad, w: em.w + pad * 2, h: em.h + pad * 2, align: 'center', valign: 'middle' });
      treat(x, logo, 'circle');
    }
  }
  if (v.texture.length && !out.some((n) => n.type === 'image' && n.role === 'background' && n.w >= x.W * 0.95 && n.h >= x.H * 0.95)) {
    // a construction that lays its own ground (a gradient sky, a field of colour) takes the texture on that ground,
    // where it shows; otherwise a paper layer of the ground's own colour carries it
    const field = out.find((n) => n.type === 'shape' && n.role === 'background' && n.x <= 1 && n.y <= 1 && n.w >= x.W * 0.98 && n.h >= x.H * 0.98 && !n.effects?.length);
    if (field && x.style) (field as Node).effects = paletteFx(x, v.texture);
    else out.unshift(rect(x, 'background', { x: 0, y: 0, w: x.W, h: x.H }, x.ground, { name: 'Paper', effects: paletteFx(x, v.texture) }));
  }
  return out;
}

/** A plate of the ground behind words that sit over a pattern or a picture: the words never lose their contrast. */
function plateFor(x: Ctx, t: TextNode, pad = x.u * 1.6): Node {
  const L = layoutText(t, x.measure);
  const w = Math.min(t.w, L.widest) + pad * 2;
  const left = t.align === 'center' ? t.x + (t.w - w + pad * 2) / 2 - pad : t.align === 'right' ? t.x + t.w - w + pad : t.x - pad;
  return rect(x, 'background', { x: left, y: t.y - pad, w, h: Math.min(t.h, L.height) + pad * 2 }, x.ground, { name: 'Plate' });
}

/** The twelve compositions the vocabulary adds (see vocabulary.ts NEW_ARCHETYPES). */
function newLayouts(): Record<(typeof NEW_ARCHETYPES)[number], Layout> {
  const footBand = (x: Ctx): Node => {
    const top = footTop(x) - x.u * 2;
    return rect(x, 'background', { x: 0, y: top, w: x.W, h: x.H - top }, x.ground, { name: 'Foot band' });
  };
  return {
    // rays from a low sun: the title above, on an arc where the vocabulary sets it so
    radial: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const top = x.H * 0.4;
      const rays = v?.pattern?.gen === 'radial' ? v.pattern : pdef('radial', { count: 36, inner: 0, taper: 1 }, ['accent'], 0.9);
      out.push(patternNode(x, { ...rays, params: { ...rays.params, cx: 50, cy: 80 } }, { x: 0, y: top, w: x.W, h: x.H - top }));
      const d = Math.min(x.W * 0.56, (x.H - top) * 0.72);
      const cy = top + (x.H - top) * 0.8;
      out.push(motifNode(x, 0, { x: (x.W - d) / 2, y: cy - d / 2, w: d, h: d }) ?? primNode(x, 'motif', primOf('circle'), { x: (x.W - d) / 2, y: cy - d / 2, w: d, h: d }, x.accent2));
      out.push(footBand(x));
      const head = text(x, 'headline', c.headline, { x: x.m, y: x.m, w: x.W - x.m * 2, h: top - x.m - (c.subhead ? x.u * 10 : x.u * 3) }, { align: 'center' });
      treat(x, head, v?.type === 'arc' || v?.type === 'echo' ? v.type : 'plain');
      out.push(head);
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.m * 2, y: top - x.u * 8.5, w: x.W - x.m * 4, h: x.u * 5 }, { size: Math.max(minText(x), x.u * 2.8), align: 'center', autoHeight: true }));
      return [...out, ...foot(x)];
    },
    // a slanted plane across the frame, chevrons stepping up beside it, the headline rising above
    diagonal: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const plane = v?.motifs.find((m) => ['parallelogram', 'triangle'].includes(m.kind)) ?? primOf('parallelogram', { slant: 30 });
      out.push(primNode(x, 'motif', plane.kind === 'triangle' ? primOf('parallelogram', { slant: 30 }) : plane, { x: -x.W * 0.12, y: x.H * 0.46, w: x.W * 1.24, h: x.H * 0.22 }, x.accent, { rotation: -10, ...(v?.marks.length ? { effects: paletteFx(x, v.marks) } : {}) }));
      const ch = Math.min(x.W, x.H) * 0.11;
      const chev = v?.motifs.find((m) => m.kind === 'chevron') ?? primOf('chevron');
      for (let i = 0; i < 3; i++) out.push(primNode(x, 'motif', chev, { x: x.W - x.m - ch * (3.2 - i * 0.95), y: x.H * 0.3 - i * ch * 0.35, w: ch, h: ch }, i === 1 ? x.accent2 : x.ink, { rotation: -10 }));
      const head = text(x, 'headline', c.headline, { x: x.m, y: x.m + x.u * 2, w: (x.W - x.m * 2) * 0.86, h: x.H * 0.24 }, { lineHeight: 0.92 });
      if (v?.type === 'rise') treat(x, head, 'rise');
      else head.rotation = -6;
      out.push(head);
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.W * 0.5, y: Math.max(x.H * 0.74, footTop(x) - x.u * 12), w: x.W * 0.5 - x.m, h: x.u * 8 }, { size: Math.max(minText(x), x.u * 3), autoHeight: true }));
      if (v?.pattern && ['diagonal', 'stripes', 'lines'].includes(v.pattern.gen)) out.push(patternNode(x, { ...v.pattern, params: { ...v.pattern.params, rotation: 45 } }, { x: x.m, y: x.H * 0.71, w: x.W * 0.32, h: Math.max(x.u * 4, footTop(x) - x.H * 0.71 - x.u * 3) }));
      return [...out, ...foot(x)];
    },
    // pieces laid over each other at angles: paper shapes, a picture cut into a shape, tape, the headline on its own slip
    collage: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const W = x.W;
      const H = x.H;
      if (v?.pattern && v.pattern.where === 'full') out.push(patternNode(x, v.pattern, { x: 0, y: 0, w: W, h: H }, { opacity: Math.min(0.45, v.pattern.opacity) }));
      const pieces: [Box, number, string][] = [
        [{ x: W * 0.06, y: H * 0.08, w: W * 0.56, h: H * 0.4 }, -6, x.accent2],
        [{ x: W * 0.42, y: H * 0.24, w: W * 0.5, h: H * 0.36 }, 7, x.accent],
        [{ x: W * 0.18, y: H * 0.44, w: W * 0.32, h: H * 0.18 }, -3, x.ink],
      ];
      pieces.forEach(([b, rot, col], i) => {
        const n = motifNode(x, i, b, { rotation: rot }) ?? primNode(x, 'motif', primOf('irregular-polygon', { seed: x.seed + i }), b, col, { rotation: rot });
        if (n.type === 'shape' && n.fill !== null && v?.motifPaint !== 'gradient') n.fill = col;
        out.push(n);
      });
      const img = x.brief.images[0];
      if (img) out.push(cutPicture(x, img, primOf(v?.motifs.find((m) => ['blob', 'irregular-polygon', 'fragments'].includes(m.kind))?.kind ?? 'blob', { seed: x.seed + 3 }), { x: W * 0.36, y: H * 0.1, w: W * 0.5, h: H * 0.42 }, { rotation: 4, effects: paletteFx(x, [effectDefaults('drop-shadow')!]) }));
      // tape over two corners: translucent strips of the ground
      out.push(rect(x, 'motif', { x: W * 0.02, y: H * 0.08, w: x.u * 18, h: x.u * 5 }, `${x.ground.slice(0, 7)}cc`, { rotation: -32, name: 'Tape' }));
      out.push(rect(x, 'motif', { x: W * 0.78, y: H * 0.52, w: x.u * 18, h: x.u * 5 }, `${x.ground.slice(0, 7)}cc`, { rotation: 28, name: 'Tape' }));
      // the headline on a slip of paper of its own (a ground it always reads on)
      const slip: Box = { x: x.m * 0.8, y: H * 0.62, w: W - x.m * 1.6, h: Math.max(x.u * 10, footTop(x) - H * 0.62 - x.u * 3) };
      out.push(rect(x, 'background', slip, x.ground, { rotation: -2, name: 'Slip', effects: paletteFx(x, [{ ...effectDefaults('drop-shadow')!, params: { dx: 0, dy: 6, blur: 14, spread: 0, opacity: 28 } }]) }));
      const head = text(x, 'headline', c.headline, { x: slip.x + x.u * 2, y: slip.y + x.u * 1.5, w: slip.w - x.u * 4, h: slip.h - x.u * (c.subhead ? 9 : 3) }, { rotation: -2 });
      if (v?.type === 'stagger') treat(x, head, 'stagger');
      out.push(head);
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: slip.x + x.u * 2, y: slip.y + slip.h - x.u * 7, w: slip.w * 0.8, h: x.u * 5 }, { size: Math.max(minText(x), x.u * 2.6), rotation: -2, autoHeight: true }));
      return [...out, ...foot(x)];
    },
    // layers: a generative field, a great shape mixing with it, the headline across both
    layered: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      if (v?.pattern) out.push(patternNode(x, v.pattern, { x: 0, y: 0, w: x.W, h: x.H }, { opacity: Math.min(0.5, v.pattern.opacity) }));
      const d = Math.max(x.W, x.H) * 0.74;
      const dark = contrastRatio(x.ground, '#000000') < contrastRatio(x.ground, '#ffffff');
      const under = fillUnder(x) ?? x.accent;
      const mass = motifNode(x, 0, { x: x.W * 0.4, y: x.H * 0.14, w: d, h: d }, { blend: dark ? 'screen' : 'multiply' });
      if (mass && mass.type === 'shape' && mass.fill !== null) mass.fill = under;
      if (mass) out.push(mass);
      const echo = motifNode(x, 1, { x: x.W * 0.3, y: x.H * 0.24, w: d * 0.62, h: d * 0.62 }, { effects: [] });
      if (echo && echo.type === 'shape') {
        echo.fill = null;
        echo.stroke = { color: x.ink, width: Math.max(1, x.u * 0.3) };
        out.push(echo);
      }
      const head = text(x, 'headline', c.headline, { x: x.m, y: x.H * 0.36, w: x.W - x.m * 2, h: x.H * 0.32 });
      treat(x, head, v && ['perspective', 'wave', 'rise'].includes(v.type) ? v.type : 'plain');
      out.push(head);
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.m, y: x.m, w: (x.W - x.m * 2) * 0.46, h: x.u * 10 }, { size: Math.max(minText(x), x.u * 2.6), autoHeight: true }));
      return [...out, ...foot(x)];
    },
    // words only: the headline as the whole composition, ruled top and bottom
    typographic: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const t = x.vocab?.type ?? 'stacked';
      const heavy = Math.max(2, x.u * 1.1);
      out.push(rule(x, { x: x.m, y: x.m, w: x.W - x.m * 2 }, x.ink, heavy));
      const end = footTop(x) - x.u * 3;
      if (t === 'vertical') {
        const colW = x.W * 0.4;
        const head = text(x, 'headline', c.headline, { x: x.m, y: x.m + x.u * 3, w: colW, h: end - x.m - x.u * 3 }, { vertical: true, lineHeight: 0.86 });
        head.size = fitSize({ ...head, size: x.u * 40 }, x.measure, minText(x)) * 0.96;
        out.push(head);
        if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.m + colW + x.u * 4, y: x.m + x.u * 6, w: x.W - x.m * 2 - colW - x.u * 4, h: x.u * 16 }, { size: Math.max(minText(x), x.u * 3.4), autoHeight: true }));
      } else {
        const subH = c.subhead ? x.u * 12 : 0;
        const head = text(x, 'headline', c.headline, { x: x.m, y: x.m + x.u * 4, w: x.W - x.m * 2, h: end - x.m - x.u * 4 - subH }, { lineHeight: 0.86 });
        treat(x, head, t === 'outline' || t === 'echo' || t === 'oversized' ? t : 'stacked');
        const used = Math.min(head.h, layoutText(head, x.measure).height);
        // the block sits in the middle of the room it has, not hanging from the top rule
        head.y += Math.max(0, (head.h - used) / 2);
        head.h = used + x.u;
        out.push(head);
        out.push(rule(x, { x: x.m, y: head.y + used + x.u * 2.5, w: x.W - x.m * 2 }, x.ink, heavy));
        if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.W * 0.42, y: head.y + used + x.u * 5, w: x.W * 0.58 - x.m, h: x.u * 10 }, { size: Math.max(minText(x), x.u * 3), autoHeight: true }));
      }
      return [...out, ...foot(x)];
    },
    // a field of modules beneath, the headline in the grid above
    modular: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const end = footTop(x) - x.u * 3;
      const head = text(x, 'headline', c.headline, { x: x.m, y: x.m, w: (x.W - x.m * 2) * 0.86, h: x.H * 0.4 }, { lineHeight: 0.92 });
      head.h = Math.min(head.h, layoutText(head, x.measure).height + x.u);
      out.push(head);
      let below = head.y + head.h + x.u * 3;
      if (c.subhead) {
        const sub = text(x, 'subhead', c.subhead, { x: x.m, y: below, w: (x.W - x.m * 2) * 0.6, h: x.u * 8 }, { size: Math.max(minText(x), x.u * 2.6), autoHeight: true });
        sub.h = layoutText(sub, x.measure).height;
        out.push(sub);
        below = sub.y + sub.h + x.u * 3;
      }
      // the field of modules from beneath the words to the foot, a whole number of modules across
      const cols = x.W >= x.H ? 8 : 5;
      const size = (x.W - x.m * 2) / cols;
      const rows = Math.max(1, Math.floor((end - below) / size));
      const field: Box = { x: x.m, y: end - rows * size, w: x.W - x.m * 2, h: rows * size };
      const use = v?.pattern && ['modular', 'tessellation'].includes(v.pattern.gen) ? v.pattern : pdef('modular', { set: 2, fill: 85, colorVar: 50 }, ['accent', 'ink', 'accent2']);
      out.unshift(patternNode(x, { ...use, params: { ...use.params, scale: size / x.u } }, field));
      return [...out, ...foot(x)];
    },
    // a measured grid with crosshairs, the headline on a plate, annotations that point, a figure in perspective
    technical: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const grid = v?.pattern?.gen === 'technical' ? v.pattern : pdef('technical', { scale: 3.2, major: 5, weight: 0.05, labels: 1, marks: 1 }, ['line', 'accent']);
      out.push(patternNode(x, grid, { x: 0, y: 0, w: x.W, h: x.H }));
      const head = text(x, 'headline', c.headline, { x: x.m, y: x.m + x.u * 7, w: (x.W - x.m * 2) * 0.86, h: x.H * 0.32 }, { lineHeight: 0.95 });
      head.h = Math.min(head.h, layoutText(head, x.measure).height + x.u);
      out.push(plateFor(x, head), head);
      const ann = v?.motifs.find((m) => m.kind === 'annotation') ?? primOf('annotation');
      out.push(primNode(x, 'motif', ann, { x: x.m, y: head.y + head.h + x.u * 3, w: (x.W - x.m * 2) * 0.48, h: x.u * 5 }, x.accent));
      const figure = v?.motifs.find((m) => ['perspective-grid', 'isometric-grid', 'grid'].includes(m.kind)) ?? primOf('perspective-grid');
      const figTop = Math.max(head.y + head.h + x.u * 12, x.H * 0.5);
      const figH = Math.max(x.u * 10, footTop(x) - figTop - x.u * 5);
      out.push(primNode(x, 'motif', figure, { x: x.W * 0.42, y: figTop, w: x.W * 0.58 - x.m, h: figH }, x.accent, { ...(v?.marks.length ? { effects: paletteFx(x, v.marks) } : {}) }));
      if (c.subhead) {
        const sub = text(x, 'subhead', c.subhead, { x: x.m + x.u * 4, y: figTop, w: x.W * 0.34, h: x.u * 12 }, { size: Math.max(minText(x), x.u * 2.6), autoHeight: true });
        sub.h = layoutText(sub, x.measure).height;
        out.push(plateFor(x, sub, x.u), sub);
        out.push(primNode(x, 'motif', v?.motifs.find((m) => m.kind === 'bracket') ?? primOf('bracket'), { x: x.m, y: sub.y - x.u, w: x.W * 0.34 + x.u * 8, h: sub.h + x.u * 2 }, x.ink));
      }
      out.push(footBand(x));
      return [...out, ...foot(x)];
    },
    // soft shapes overlapping on a mesh of the palette, waves gathering toward the foot
    organic: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const mesh: Gradient = { type: 'mesh', angle: 0, stops: [], mesh: [x.ground, mixColor(x.ground, x.accent, 0.22).slice(0, 7), mixColor(x.ground, x.accent2, 0.28).slice(0, 7), mixColor(x.ground, x.muted, 0.14).slice(0, 7)] };
      out.push(rect(x, 'background', { x: 0, y: 0, w: x.W, h: x.H }, mesh, { name: 'Mesh' }));
      const d1 = Math.min(x.W, x.H) * 0.64;
      const a = motifNode(x, 0, { x: x.W - d1 * 0.82, y: -d1 * 0.12, w: d1, h: d1 * 0.92 }, { opacity: 0.94 });
      if (a) out.push(a);
      const b = motifNode(x, 1, { x: x.W * 0.5, y: x.H * 0.3, w: d1 * 0.5, h: d1 * 0.5 }, { opacity: 0.9, blend: 'multiply' });
      if (b) out.push(b);
      const bandTop = x.H * 0.68;
      if (v?.pattern) out.push(patternNode(x, v.pattern, v.pattern.where === 'band' ? { x: 0, y: bandTop, w: x.W, h: Math.max(x.u * 6, footTop(x) - bandTop - x.u * 3) } : { x: 0, y: 0, w: x.W, h: x.H }, v.pattern.where === 'band' ? {} : { opacity: Math.min(0.45, v.pattern.opacity) }));
      const head = text(x, 'headline', c.headline, { x: x.m, y: x.H * 0.36, w: (x.W - x.m * 2) * 0.74, h: x.H * 0.22 });
      if (v?.type === 'wave-path') treat(x, head, 'wave-path');
      out.push(head);
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.m, y: x.H * 0.36 + x.H * 0.23, w: (x.W - x.m * 2) * 0.6, h: x.u * 7 }, { size: Math.max(minText(x), x.u * 2.8), autoHeight: true }));
      return [...out, ...foot(x)];
    },
    // the composition is the picture: an arrangement of the palette's shapes; the words small beneath, as its label
    abstract: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const fieldH = x.H * 0.62;
      out.push(patternNode(x, v?.pattern?.gen === 'abstract' ? v.pattern : pdef('abstract', { count: 16, shapeSize: 30, lineShare: 30, colorVar: 70, jitter: 60 }, ['accent', 'ink', 'accent2']), { x: x.m, y: x.m, w: x.W - x.m * 2, h: fieldH - x.m }));
      const head = text(x, 'headline', c.headline, { x: x.m, y: fieldH + x.u * 4, w: (x.W - x.m * 2) * 0.72, h: x.H * 0.13 }, { lineHeight: 1 });
      head.size = Math.min(head.size, x.u * 8);
      out.push(head);
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.m, y: fieldH + x.u * 4 + x.H * 0.13 + x.u, w: (x.W - x.m * 2) * 0.6, h: x.u * 6 }, { size: Math.max(minText(x), x.u * 2.4), color: x.muted, autoHeight: true }));
      return [...out, ...foot(x)];
    },
    // screened into dots: the picture (or a dot field swelling from the centre), the headline big and flat beneath
    halftone: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const topH = x.H * 0.6;
      const img = x.brief.images[0];
      if (img) out.push({ ...image(x, img, { x: 0, y: 0, w: x.W, h: topH }), effects: paletteFx(x, v?.image.length ? v.image : [effectDefaults('halftone')!]) } as Node);
      else out.push(patternNode(x, v?.pattern?.gen === 'halftone' ? v.pattern : pdef('halftone', { scale: 2, field: 1, max: 110 }, ['ink']), { x: (x.W - Math.min(x.W, topH * 1.1)) / 2, y: x.m * 0.5, w: Math.min(x.W, topH * 1.1), h: topH }, { bound: 'ellipse' }));
      const head = text(x, 'headline', c.headline, { x: x.m, y: topH + x.u * 3, w: x.W - x.m * 2, h: Math.max(x.u * 8, footTop(x) - topH - x.u * (c.subhead ? 12 : 5)) }, { lineHeight: 0.9 });
      treat(x, head, 'oversized');
      out.push(head);
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.m, y: footTop(x) - x.u * 8, w: (x.W - x.m * 2) * 0.7, h: x.u * 5 }, { size: Math.max(minText(x), x.u * 2.6), autoHeight: true }));
      return [...out, ...foot(x)];
    },
    // a frame from a film: the picture graded (or a spotlight in the dark), letterbox bars, the title spaced and glowing,
    // a billing block at the foot
    cinematic: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      const img = x.brief.images[0];
      if (img) {
        out.push({ ...image(x, img, { x: 0, y: 0, w: x.W, h: x.H }), role: 'background', adjust: { contrast: 22, saturation: -30, vignette: 75 }, ...(v?.image.length ? { effects: paletteFx(x, v.image) } : {}) } as Node);
        // a scrim so the words never sit on the bare photograph
        out.push(rect(x, 'background', { x: 0, y: x.H * 0.45, w: x.W, h: x.H * 0.55 }, { type: 'linear', angle: 180, stops: [{ at: 0, color: `${x.ground.slice(0, 7)}00` }, { at: 0.55, color: `${x.ground.slice(0, 7)}d9` }, { at: 1, color: x.ground.slice(0, 7) }] }, { name: 'Scrim' }));
        out.push(rect(x, 'motif', { x: 0, y: 0, w: x.W, h: x.H * 0.07 }, '#000000', { name: 'Letterbox' }), rect(x, 'motif', { x: 0, y: x.H * 0.93, w: x.W, h: x.H * 0.07 }, '#000000', { name: 'Letterbox' }));
      } else {
        out.push(rect(x, 'background', { x: 0, y: 0, w: x.W, h: x.H }, { type: 'radial', angle: 0, cx: 0.5, cy: 0.38, r: 0.75, stops: [{ at: 0, color: mixColor(x.ground, x.accent, 0.38).slice(0, 7) }, { at: 1, color: x.ground.slice(0, 7) }] }, { name: 'Spotlight' }));
        const d = Math.min(x.W, x.H) * 0.46;
        const ring = motifNode(x, 0, { x: (x.W - d) / 2, y: x.H * 0.14, w: d, h: d }, { effects: paletteFx(x, [effectDefaults('glow')!]) });
        if (ring) out.push(ring);
      }
      const titleY = x.H * 0.6;
      if (c.subhead) out.push(text(x, 'subhead', c.subhead, { x: x.m, y: titleY - x.u * 7, w: x.W - x.m * 2, h: x.u * 4 }, { size: Math.max(minText(x), x.u * 2.2), align: 'center', case: 'upper', tracking: 220, autoHeight: true }));
      const head = text(x, 'headline', c.headline, { x: x.m, y: titleY, w: x.W - x.m * 2, h: x.H * 0.16 }, { align: 'center' });
      treat(x, head, 'spaced');
      if (v?.headline.length) head.effects = paletteFx(x, v.headline);
      out.push(head);
      const billing = [...(c.meta ?? []), ...(c.brand ? [c.brand] : [])];
      if (billing.length) out.push(text(x, 'meta', billing.join('   ·   '), { x: x.m, y: x.H * (img ? 0.84 : 0.86), w: x.W - x.m * 2, h: x.u * 6 }, { size: Math.max(minText(x), x.u * 1.9), align: 'center', case: 'upper', tracking: 160, lineHeight: 1.5, color: x.muted, autoHeight: true }));
      return out;
    },
    // a generated line field from a seed fills the frame; the words on a clear plate above it
    procedural: (x) => {
      const out: Node[] = [];
      const c = x.brief.content;
      const v = x.vocab;
      out.push(patternNode(x, v?.pattern ?? pdef('flow', { scale: 1.6, steps: 90, step: 0.6, weight: 0.1, turbulence: 25, curl: 60, ramp: 60, rampDir: 0 }, ['accent', 'ink']), { x: 0, y: 0, w: x.W, h: x.H }));
      const head = text(x, 'headline', c.headline, { x: x.m, y: x.m, w: (x.W - x.m * 2) * 0.8, h: x.H * 0.3 });
      head.h = Math.min(head.h, layoutText(head, x.measure).height + x.u);
      out.push(plateFor(x, head), head);
      if (c.subhead) {
        const sub = text(x, 'subhead', c.subhead, { x: x.m, y: head.y + head.h + x.u * 4, w: (x.W - x.m * 2) * 0.62, h: x.u * 10 }, { size: Math.max(minText(x), x.u * 2.6), autoHeight: true });
        sub.h = layoutText(sub, x.measure).height;
        out.push(plateFor(x, sub, x.u), sub);
      }
      out.push(footBand(x));
      return [...out, ...foot(x)];
    },
  };
}
