// lib/ux-v0/graphics/logo/concepts.ts — logo concepts reasoned from the brief, never picked from a library. The brief's
// words (values, personality, industry, things it should call to mind) are read for what they can mean; every
// construction method says what it can mean; a concept is a method whose meaning answers the brief, built with its own
// parameters, given a name set in constructed or typeset lettering, a palette from the generated visual language, and
// a written argument: the core idea, the symbolic rationale, the construction, the typography, the geometry strategy,
// its scalability and its weaknesses. An exploration spreads across categories (wordmark, lettermark, monogram,
// abstract, geometric, organic, combination, emblem, mascot, typographic symbol, negative space, minimal, expressive,
// modular, responsive) and across methods, geometry and lettering, and refuses a mark too like one already shown
// (compared by the occupancy of its silhouette, so a recolour is never a new concept). Clichés are refused unless the
// brief asked for them. Deterministic from the brief and the seed.

import { hash32 } from '../styles/hash';
import { languageFor, type LanguagePalette } from '../generative/language';
import { rng, type Rng } from '../generative/util';
import { CATEGORY_LABEL, type LogoBrief, type LogoCategory } from './brief';
import type { Mark } from './geom';
import { letter, supported, type LetteringStyle, type Lettered, type Modification } from './glyphs';
import { inkOf, likeness, occupancy, rasterize } from './raster';
import { buildMark, METHODS, type MethodId } from './symbols';

import type { LockupKind } from './constants';
export type { LockupKind };

export interface WordmarkSpec {
  kind: 'constructed' | 'typeset';
  /** the name exactly as written */
  text: string;
  style?: LetteringStyle;
  modification?: Modification;
  font?: string;
  weight?: number;
  /** thousandths of an em */
  tracking?: number;
  case?: 'upper' | 'lower' | 'none';
  /** why it is set this way */
  why: string;
}

export interface LogoConcept {
  id: string;
  title: string;
  category: LogoCategory;
  method: MethodId | null;
  seed: string;
  coreIdea: string;
  rationale: string;
  construction: string;
  typography: string;
  geometry: string;
  scalability: string;
  weaknesses: string[];
  /** the brief's words it answers */
  addresses: string[];
  wordmark: WordmarkSpec;
  mark: Mark | null;
  palette: LanguagePalette;
  lockup: LockupKind;
  /** 0 sharp … 1 round */
  soft: number;
  /** the stroke weight the symbol was built with (mark units) */
  sw: number;
  status: 'proposed' | 'selected' | 'rejected' | 'approved';
  /** the concepts it came from (a refinement or a combination) */
  parents?: string[];
  /** the request that made it from its parent */
  edit?: string;
  /** the occupancy signature of its silhouette (for diversity) */
  sig?: number[];
}

/** What each word a brief may use can mean, in the vocabulary the methods speak. */
const TERM: Record<string, readonly string[]> = {
  clarity: ['clarity', 'focus', 'openness', 'vision', 'precision'],
  trust: ['trust', 'bond', 'protection', 'partnership', 'support'],
  care: ['care', 'protection', 'nurture', 'comfort', 'wellbeing'],
  community: ['community', 'gathering', 'together', 'unity', 'meeting'],
  craft: ['craft', 'building', 'paper', 'heritage', 'quality'],
  quality: ['quality', 'precision', 'craft', 'heritage'],
  sustainability: ['growth', 'nature', 'cycle', 'earth', 'continuity'],
  transparency: ['clarity', 'openness', 'layers'],
  innovation: ['change', 'breakthrough', 'transformation', 'discovery', 'shift'],
  courage: ['courage', 'breakthrough', 'change'],
  curiosity: ['discovery', 'opening', 'perspective', 'journey'],
  joy: ['joy', 'play', 'energy', 'warmth', 'bloom'],
  inclusion: ['together', 'community', 'gathering', 'openness'],
  safety: ['protection', 'support', 'trust'],
  speed: ['speed', 'momentum', 'forward', 'direction'],
  simplicity: ['essence', 'clarity'],
  honesty: ['clarity', 'directness', 'identity'],
  growth: ['growth', 'ascent', 'progress', 'bloom', 'unfolding'],
  freedom: ['freedom', 'opening', 'movement'],
  connection: ['connection', 'link', 'bond', 'network', 'together'],
  balance: ['balance', 'calm', 'duality'],
  health: ['health', 'wellbeing', 'care', 'growth'],
  learning: ['learning', 'growth', 'opening', 'building', 'discovery'],
  creativity: ['creativity', 'play', 'transformation', 'journey'],
  precision: ['precision', 'order', 'focus', 'system'],
  resilience: ['layers', 'support', 'continuity', 'strength'],
  openness: ['openness', 'opening', 'clarity'],
  heritage: ['heritage', 'tradition', 'craft', 'signature'],
  focus: ['focus', 'vision', 'gathering'],
  calm: ['calm', 'flow', 'layers'],
  energy: ['energy', 'momentum', 'light'],
  play: ['play', 'joy', 'character'],
  access: ['access', 'passage', 'opening'],
  protection: ['protection', 'care'],
  change: ['change', 'shift', 'transformation'],
  discovery: ['discovery', 'unfolding', 'opening'],
  journey: ['journey', 'direction', 'passage'],
  collaboration: ['collaboration', 'together', 'partnership'],
  independence: ['individuality', 'standing out', 'freedom'],
  warm: ['warmth', 'comfort', 'care'],
  bold: ['directness', 'momentum', 'confidence'],
  playful: ['play', 'joy', 'character'],
  refined: ['quality', 'craft', 'signature'],
  modern: ['clarity', 'system', 'shift'],
  classic: ['heritage', 'tradition', 'signature'],
  clever: ['hidden', 'discovery', 'transformation'],
  natural: ['nature', 'growth', 'earth'],
  precise: ['precision', 'order', 'focus'],
  dynamic: ['momentum', 'movement', 'energy'],
  minimal: ['essence', 'clarity'],
  expressive: ['creativity', 'journey', 'play'],
  serious: ['structure', 'order', 'heritage'],
  young: ['play', 'character', 'growth'],
  technology: ['system', 'network', 'signal', 'precision', 'building'],
  music: ['sound', 'rhythm', 'signal', 'flow'],
  art: ['creativity', 'perspective', 'transformation'],
  architecture: ['structure', 'support', 'building', 'passage'],
  nature: ['nature', 'growth', 'earth', 'cycle'],
  water: ['water', 'flow', 'rhythm', 'calm'],
  science: ['discovery', 'focus', 'precision', 'vision'],
  space: ['movement', 'cycle', 'discovery'],
  food: ['warmth', 'nurture', 'gathering', 'craft'],
  sport: ['momentum', 'energy', 'speed', 'forward'],
  film: ['vision', 'perspective', 'focus', 'story'],
  books: ['story', 'layers', 'learning', 'paper'],
  fashion: ['signature', 'identity', 'craft'],
  travel: ['journey', 'passage', 'direction', 'discovery'],
  wellbeing: ['wellbeing', 'calm', 'care', 'growth'],
  finance: ['growth', 'trust', 'precision', 'ascent'],
  celebration: ['joy', 'energy', 'bloom'],
  performance: ['energy', 'perspective', 'story'],
  games: ['play', 'building', 'character'],
  seasons: ['cycle', 'growth', 'continuity'],
  talks: ['voice', 'openness', 'connection'],
  fair: ['gathering', 'community'],
  activism: ['change', 'courage', 'breakthrough'],
  children: ['play', 'character', 'growth'],
  animals: ['character', 'companion', 'nature'],
  mobility: ['movement', 'journey', 'direction'],
  beauty: ['care', 'signature', 'softness'],
  home: ['comfort', 'care', 'support'],
  river: ['water', 'flow', 'journey'],
  sea: ['water', 'flow', 'rhythm'],
  ocean: ['water', 'flow', 'rhythm'],
  wave: ['water', 'flow', 'rhythm'],
  tide: ['water', 'cycle', 'rhythm'],
  mountain: ['ascent', 'landscape', 'strength'],
  sun: ['light', 'energy', 'warmth'],
  light: ['light', 'clarity', 'energy'],
  star: ['light', 'energy'],
  moon: ['calm', 'cycle'],
  seed: ['growth', 'beginning', 'potential'],
  tree: ['growth', 'nature', 'layers'],
  root: ['growth', 'ground', 'heritage'],
  flower: ['bloom', 'growth', 'joy'],
  bloom: ['bloom', 'growth', 'joy'],
  stone: ['strength', 'ground'],
  bread: ['nurture', 'craft', 'warmth'],
  grain: ['nurture', 'growth', 'craft'],
  coffee: ['warmth', 'gathering', 'craft'],
  tea: ['calm', 'warmth', 'craft'],
  book: ['story', 'learning', 'paper'],
  page: ['story', 'paper', 'layers'],
  paper: ['paper', 'craft', 'transformation'],
  thread: ['connection', 'bond', 'craft'],
  knot: ['connection', 'bond', 'craft'],
  bridge: ['connection', 'passage', 'support'],
  door: ['opening', 'access', 'passage'],
  window: ['opening', 'perspective', 'access'],
  path: ['journey', 'direction'],
  road: ['journey', 'direction', 'movement'],
  map: ['journey', 'discovery', 'direction'],
  compass: ['direction', 'journey', 'discovery'],
  key: ['access', 'opening'],
  lens: ['vision', 'focus', 'clarity'],
  eye: ['vision', 'focus', 'perspective'],
  voice: ['voice', 'sound', 'signal'],
  sound: ['sound', 'rhythm', 'signal'],
  signal: ['signal', 'sound', 'connection'],
  spark: ['energy', 'light', 'beginning'],
  flame: ['energy', 'warmth', 'light'],
  wind: ['movement', 'flow'],
  bird: ['freedom', 'movement', 'character'],
  wing: ['freedom', 'movement'],
  feather: ['freedom', 'softness'],
};

/** A short noun for each method, for a concept's title. */
const NOUN: Record<MethodId, string> = {
  convergence: 'Meeting point',
  interlock: 'Linked pair',
  modular: 'Built initial',
  negative: 'Hidden letter',
  monogram: 'Monogram',
  radial: 'Ring of forms',
  fold: 'Fold',
  strata: 'Strata',
  orbit: 'Orbit',
  split: 'Shift',
  grid: 'One apart',
  wave: 'Current',
  organic: 'Pebble',
  spiral: 'Unfolding',
  angle: 'Direction',
  emblem: 'Seal',
  mascot: 'Character',
  bridge: 'Arch',
  trace: 'One line',
  steps: 'Ascent',
  aperture: 'Aperture',
  seed: 'Sprout',
  letter: 'Letter symbol',
  pixel: 'Pixel initial',
  frame: 'Open frame',
};

/** What each method looks like to people who see many logos (said as a weakness, never hidden). */
const RESEMBLES: Partial<Record<MethodId, string>> = {
  aperture: 'an aperture is close to a camera iris; it may read as photography',
  seed: 'leaf forms are common in green and wellness brands',
  orbit: 'a body with an orbit can read as a planet',
  mascot: 'a character sets a younger, friendlier register than a symbol',
  grid: 'grids of modules are common in software marks',
  pixel: 'pixel lettering reads as games or retro technology',
  spiral: 'a spiral can read as a shell or a snail',
  radial: 'forms around a centre are close to a flower or a burst',
  steps: 'steps are a familiar picture of growth',
  emblem: 'ring text disappears at small sizes; the small version keeps the centre alone',
  strata: 'stacked rounded bands can read as a list or a menu icon',
  interlock: 'linked rings are a familiar picture of partnership',
  frame: 'a frame with something breaking out is a familiar idea',
};

/** Which methods can make each category's concept. */
const FOR: Record<LogoCategory, readonly MethodId[]> = {
  wordmark: [],
  lettermark: ['monogram', 'modular', 'letter', 'negative'],
  monogram: ['monogram'],
  abstract: ['convergence', 'split', 'fold', 'orbit', 'aperture', 'frame', 'interlock'],
  geometric: ['modular', 'grid', 'strata', 'steps', 'angle', 'bridge', 'convergence', 'aperture', 'fold'],
  organic: ['organic', 'wave', 'spiral', 'seed', 'trace'],
  combination: ['convergence', 'interlock', 'radial', 'fold', 'strata', 'orbit', 'split', 'grid', 'wave', 'organic', 'spiral', 'angle', 'bridge', 'steps', 'aperture', 'seed', 'frame', 'trace'],
  emblem: ['emblem'],
  mascot: ['mascot'],
  typographic: ['letter'],
  negative: ['negative', 'wave', 'organic', 'bridge', 'split'],
  minimal: ['orbit', 'split', 'negative', 'organic', 'bridge'],
  expressive: ['trace', 'spiral', 'angle', 'organic'],
  modular: ['modular', 'grid', 'pixel', 'strata'],
  responsive: ['radial', 'grid', 'convergence', 'modular', 'steps'],
};

/** The order categories are tried in when nothing is asked for: the spread a designer would show first. */
const SPREAD: readonly LogoCategory[] = ['combination', 'wordmark', 'lettermark', 'abstract', 'negative', 'organic', 'geometric', 'typographic', 'expressive', 'monogram', 'minimal', 'modular', 'emblem', 'responsive', 'mascot'];

export const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const words = (b: LogoBrief) => [...b.values, ...b.associations, ...b.personality, ...b.industry];

/** A cliché a method would fall into for this brief, which the brief avoids: refused outright (a leaf for a green
 * brand). Clichés a method's own builders already avoid (a six-fold hexagon, an infinity loop) are not counted here. */
export function riskApplies(m: MethodId, b: LogoBrief): boolean {
  const risk = METHODS[m].risk;
  return risk === 'leaf' && b.avoid.includes('leaf') && b.industry.some((i) => ['nature', 'wellbeing', 'food', 'seasons'].includes(i));
}

/** How well a method answers the brief: meanings shared with the brief's words, temperament shared with its
 * personality; less for a cliché the brief avoids or a technology look it should not have. */
export function methodFit(m: MethodId, b: LogoBrief): { score: number; meaning: string; term: string; hits: string[] } {
  const spec = METHODS[m];
  let score = 0;
  let best = { meaning: spec.meanings[0], term: '' };
  let bestHit = 0;
  const hits: string[] = [];
  for (const t of words(b)) {
    const means = TERM[t] ?? [t];
    const shared = spec.meanings.filter((x) => means.includes(x) || x === t);
    if (shared.length) {
      hits.push(t);
      score += shared.length;
      if (shared.length > bestHit) {
        bestHit = shared.length;
        best = { meaning: shared[0], term: t };
      }
    }
  }
  score += spec.traits.filter((t) => b.personality.includes(t)).length * 0.6;
  if (spec.risk && b.avoid.includes(spec.risk) && (spec.risk !== 'leaf' || b.industry.some((i) => ['nature', 'wellbeing', 'food'].includes(i)))) score -= 2.5;
  if (spec.tech && b.industry.includes('technology')) score -= 1;
  if (m === 'mascot' && !b.creature && !b.personality.some((p) => ['playful', 'young', 'warm'].includes(p))) score -= 2;
  return { score, meaning: best.meaning, term: best.term, hits };
}

/** How the name is set for a concept: constructed letters or a licensed typeface, the weight, width, spacing and the
 * modification the personality suggests. */
export function letteringFor(b: LogoBrief, r: Rng, opts: { prefer?: 'constructed' | 'typeset'; expressive?: boolean; font?: string; fontCase?: 'upper' | 'lower' | 'none'; weight?: number } = {}): WordmarkSpec {
  const p = new Set(b.personality);
  const can = supported(b.name) && b.name.length <= 18;
  // a name whose own capitalisation is part of it (camel case, a lower-case start before capitals) is set as written
  const mixedCase = /[a-z][A-Z]/.test(b.name) || (/^[a-z]/.test(b.name) && /[A-Z]/.test(b.name));
  const kind = !can || mixedCase ? 'typeset' : (opts.prefer ?? (r.chance(0.5) ? 'constructed' : 'typeset'));
  if (kind === 'constructed') {
    const weight = p.has('bold') ? r.between(0.15, 0.2) : p.has('refined') || p.has('minimal') ? r.between(0.06, 0.09) : r.between(0.09, 0.14);
    const width = p.has('refined') ? r.between(1.05, 1.2) : p.has('bold') || p.has('dynamic') ? r.between(0.84, 0.98) : r.between(0.92, 1.1);
    const tracking = p.has('refined') ? r.between(1.6, 2.2) : p.has('bold') ? r.between(0.75, 1.0) : r.between(0.95, 1.4);
    const soft = p.has('warm') || p.has('playful') || p.has('natural') || p.has('young');
    const slant = p.has('dynamic') || (opts.expressive && r.chance(0.5)) ? r.between(8, 12) : 0;
    const n = b.name.length;
    const options: Modification[] = [{ kind: 'none' }];
    if (opts.expressive || p.has('expressive') || p.has('playful')) options.push({ kind: 'swash' }, { kind: 'lift', at: r.int(1, Math.max(1, n - 2)) });
    if (p.has('clever') || p.has('modern')) options.push({ kind: 'cut', at: r.int(0, n - 1), angle: r.pick([0, 18, -18]) });
    if (p.has('bold') || p.has('classic')) options.push({ kind: 'ligature', at: r.int(0, Math.max(0, n - 2)), height: r.pick(['cap', 'base'] as const) });
    if (p.has('playful') || p.has('warm')) options.push({ kind: 'accent', at: r.int(0, n - 1) });
    if (p.has('refined') || p.has('classic')) options.push({ kind: 'inline' });
    if (opts.expressive && options.length > 1) options.shift();
    const modification = r.pick(options);
    const style: LetteringStyle = { weight, width, tracking, terminal: soft ? 'round' : r.chance(0.5) ? 'square' : 'butt', join: soft ? 'round' : 'miter', slant };
    const what =
      modification.kind === 'none'
        ? 'unmodified'
        : modification.kind === 'cut'
          ? 'cut through one letter'
          : modification.kind === 'ligature'
            ? 'two letters joined'
            : modification.kind === 'swash'
              ? 'ending in a swash'
              : modification.kind === 'lift'
                ? 'one letter lifted off the line'
                : modification.kind === 'accent'
                  ? 'one letter in the accent'
                  : 'drawn with an inline';
    return {
      kind,
      text: b.name,
      style,
      modification,
      why: `Constructed capitals (${weight < 0.1 ? 'light' : weight > 0.15 ? 'heavy' : 'medium'} strokes, ${width > 1.04 ? 'extended' : width < 0.95 ? 'condensed' : 'regular'} width, ${tracking > 1.5 ? 'wide' : tracking < 1 ? 'tight' : 'even'} optical spacing${slant ? ', slanted' : ''}, ${soft ? 'round' : 'square'} terminals), ${what}: letters drawn for this name, not typed.`,
    };
  }
  const lang = languageFor(b.personality, `${b.name}|type|${r.int(0, 9999)}`, { avoidTech: b.avoid.includes('tech') });
  const font = opts.font ?? lang.fonts.display;
  const kase = opts.fontCase ?? (mixedCase ? 'none' : lang.fonts.case);
  const tracking = kase === 'upper' ? Math.round(r.between(60, 180)) : kase === 'lower' ? Math.round(r.between(-40, 0)) : Math.round(r.between(-20, 40));
  const weight = opts.weight ?? lang.fonts.displayWeight;
  return {
    kind: 'typeset',
    text: b.name,
    font,
    weight,
    tracking,
    case: kase,
    why: `Set in ${font} ${weight}${kase === 'upper' ? ', in spaced capitals' : kase === 'lower' ? ', in small letters, tightly spaced' : ''}${mixedCase ? ' (the name’s own mixed case kept)' : ''}: an open-licence face, its kerning used, spacing tuned for the name.`,
  };
}

/** The lettered word, when the wordmark is constructed. */
export const lettered = (w: WordmarkSpec, h = 100): Lettered | null => (w.kind === 'constructed' && w.style ? letter(w.text, w.style, h, w.modification) : null);

/** The concept's written argument (idea, rationale, construction) from the method, its parameters and the term. */
function argue(m: MethodId | null, mark: Mark | null, b: LogoBrief, fit: { meaning: string; term: string }, category: LogoCategory, wm: WordmarkSpec): Pick<LogoConcept, 'coreIdea' | 'rationale' | 'construction' | 'geometry'> {
  const term = fit.term || b.values[0] || b.personality[0] || 'the name';
  const p = mark?.params ?? {};
  if (!m) {
    const mod = wm.modification?.kind && wm.modification.kind !== 'none' ? wm.modification.kind : null;
    return {
      coreIdea: `The name alone carries the identity: ${b.name} drawn so its letters ${mod === 'cut' ? 'are cut once, a single decisive line through the word' : mod === 'ligature' ? 'hold hands where two of them meet' : mod === 'swash' ? 'end in a gesture that carries the word on' : mod === 'lift' ? 'step off the line at one point, a small surprise' : mod === 'accent' ? 'carry one accent, the point the eye remembers' : mod === 'inline' ? 'have a line drawn through their strokes, an engraved quietness' : 'speak in their proportions and spacing alone'}.`,
      rationale: `${capital(term)} is said through restraint: no symbol to learn, the name itself recognisable; the ${wm.kind === 'constructed' ? 'drawn letters' : 'chosen face'} give the voice.`,
      construction: wm.why,
      geometry:
        wm.kind === 'constructed'
          ? 'Strokes of one weight on a cap-height grid; rounds overshoot the cap and baseline; spacing by side class (stems, rounds, diagonals) with pair kerning.'
          : 'The face’s own outlines and kerning; tracking set for the name’s length and case.',
    };
  }
  const spec = METHODS[m];
  const pv = (k: string) => p[k];
  const ideas: Record<MethodId, string> = {
    convergence: `${pv('n')} parts meeting at one point and held apart by even gaps: ${fit.meaning} as a shape, ${b.name} the place things come together.`,
    interlock: `Two links passing over and under each other: ${fit.meaning} that holds because neither link is on top all the way round.`,
    modular: `${b.name}’s ${pv('letter')} built from modules on a ${pv('rows')}-row grid: the name as something assembled, ${fit.meaning} piece by piece.`,
    negative: `The ${pv('letter')} is not drawn but left: cut from a solid ${pv('container')}, found in the space — ${fit.meaning} that rewards a second look.`,
    monogram: `${pv('letters')} as one sign, ${pv('mode') === 'share' ? 'sharing a stroke so neither stands alone' : 'one passing in front of the other'}: ${fit.meaning} in two letters.`,
    radial: `${pv('n')} ${pv('kind')} forms turning around a centre: ${fit.meaning} radiating outward, never static.`,
    fold: `A ${pv('variant') === 'facets' ? 'sheet' : 'band'} folded so its other side shows: ${fit.meaning} as a single turn of the material.`,
    strata: `Bands laid like strata, their lengths drawing a ${pv('profile')}: ${fit.meaning} as accumulated layers.`,
    orbit: `${pv('variant') === 'eclipse' ? 'One body passing another' : 'A centre with a path around it'}: ${fit.meaning} as attention that keeps moving around what matters.`,
    split: `A ${pv('base')} cut along one line and shifted: ${fit.meaning} as a single decisive move.`,
    grid: `A grid of ${pv('size')}×${pv('size')} with one cell apart: ${fit.meaning} in the one that does not follow the rule.`,
    wave: `A solid ${pv('base')} opened by ${pv('waves')} current${Number(pv('waves')) > 1 ? 's' : ''} of the ground: ${fit.meaning} running through something steady.`,
    organic: `A smooth form ${pv('variant') === 'pair' ? 'with a smaller companion leaning on it' : 'holding an open space'}: ${fit.meaning}, human and unforced.`,
    spiral: `A ribbon unwinding and thickening as it goes: ${fit.meaning} that builds on itself.`,
    angle: `${pv('variant') === 'zig' ? 'A line that changes direction and arrives' : pv('variant') === 'rising' ? 'Strokes rising from one baseline' : 'One line folded at angles'}: ${fit.meaning} with somewhere to go.`,
    emblem: `A seal with the name around it and a ${pv('inner')} mark at its heart: ${fit.meaning} with a sense of place and permanence.`,
    mascot: `A ${pv('creature')} made of a few geometric parts, its features cut as space: ${fit.meaning} with a face.`,
    bridge: `${pv('variant') === 'keystone' ? 'An arch of blocks held by its keystone' : pv('variant') === 'arcade' ? 'An arcade of openings' : 'An arch standing on two feet'}: ${fit.meaning} that carries weight.`,
    trace: `One line, never lifted: ${fit.meaning} as a continuous gesture.`,
    steps: `${pv('variant') === 'stack' ? 'Blocks stacked in depth' : 'Steps rising'}: ${fit.meaning} taken one stage at a time.`,
    aperture: `${pv('blades')} blades around an opening: ${fit.meaning}, the moment something comes into focus.`,
    seed: `${pv('variant') === 'pod' ? 'A pod holding its seed' : 'Leaf forms arranged as a ' + pv('variant')}: ${fit.meaning} at its beginning.`,
    letter: `${b.name}’s ${pv('letter')} drawn heavy and changed (${pv('variant')}): ${fit.meaning} in the name’s own first sign.`,
    pixel: `The ${pv('letter')} in square pixels with one in the accent: ${fit.meaning}, built at the scale of the screen.`,
    frame: `A frame with something breaking out through its edge: ${fit.meaning} beyond the boundary.`,
  };
  const paramText = Object.entries(p)
    .filter(([k]) => k !== 'seed')
    .slice(0, 5)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  return {
    coreIdea: ideas[m],
    rationale: `${capital(term)} (from the brief) reads as ${fit.meaning}; ${spec.how} is how ${fit.meaning} becomes a form, so the mark argues the brief rather than decorating it.${category === 'negative' ? ' The meaning sits in the space, not the ink.' : ''}`,
    construction: `${capital(spec.how)} (${paramText}). Built as editable Bézier paths; cuts are live booleans.`,
    geometry: `${capital(spec.geometry)} construction; ${spec.traits.join(', ')} in temperament; corners ${mark && mark.parts.some((x) => x.stroke?.cap === 'round') ? 'and terminals rounded' : 'held crisp'}; one stroke weight throughout; optically centred.`,
  };
}

function sigOf(mark: Mark | null, wm: WordmarkSpec): number[] {
  if (mark) return occupancy(inkOf(rasterize(mark, 64, { x: 0, y: 0, w: 1000, h: 1000 })), 64, 10);
  const l = lettered(wm, 100);
  if (!l) return [];
  const asMark: Mark = { method: 'wordmark', params: {}, notes: [], parts: l.letters.map((x) => ({ name: x.ch, path: x.path, tone: 0 as const, stroke: { width: l.strokeWidth, cap: 'round' as const, join: 'round' as const } })) };
  return occupancy(inkOf(rasterize(asMark, 64, { x: -10, y: -l.width / 2 + 50, w: l.width + 20, h: l.width + 20 })), 64, 10);
}

/** One concept made (the method built, the name lettered, the argument written). */
export function makeConcept(
  b: LogoBrief,
  category: LogoCategory,
  method: MethodId | null,
  seed: string,
  opts: { soft?: number; sw?: number; lettering?: WordmarkSpec; palette?: LanguagePalette; lockup?: LockupKind; parents?: string[]; edit?: string; expressive?: boolean } = {},
): LogoConcept {
  const r = rng('concept', b.name, seed, category, method ?? 'wordmark');
  const p = new Set(b.personality);
  // rounded before building, so the record (which keeps them rounded) rebuilds exactly this mark
  const soft =
    Math.round((opts.soft ?? (p.has('warm') || p.has('playful') || p.has('natural') || p.has('young') ? r.between(0.55, 0.9) : p.has('precise') || p.has('bold') || p.has('serious') ? r.between(0.05, 0.35) : r.between(0.15, 0.7))) * 100) / 100;
  const sw = Math.round(opts.sw ?? (p.has('bold') ? r.between(120, 160) : p.has('refined') || p.has('minimal') ? r.between(65, 95) : r.between(85, 130)));
  const mark = method ? buildMark(method, seed, { name: b.name, initials: b.initials, sw, soft, avoid: new Set(b.avoid), ...(b.creature ? { creature: b.creature } : {}) }) : null;
  const fit = method ? methodFit(method, b) : { meaning: 'voice', term: b.personality[0] ?? b.values[0] ?? '', score: 0, hits: [] };
  const wm = opts.lettering ?? letteringFor(b, r.fork('type'), { expressive: opts.expressive || category === 'expressive', prefer: category === 'wordmark' && supported(b.name) ? (r.chance(0.65) ? 'constructed' : 'typeset') : undefined });
  const lang = opts.palette ?? languageFor(b.personality.length ? b.personality : ['modern'], `${b.name}|${seed}|${category}`, { avoidTech: b.avoid.includes('tech'), things: [...b.associations, ...b.industry] }).palette;
  const lockup: LockupKind =
    opts.lockup ??
    (category === 'wordmark'
      ? 'wordmark'
      : category === 'emblem'
        ? 'symbol'
        : category === 'lettermark' || category === 'monogram' || category === 'typographic'
          ? r.pick(['stacked', 'horizontal'] as const)
          : r.pick(['horizontal', 'horizontal', 'stacked'] as const));
  const arg = argue(method, mark, b, fit, category, wm);
  const weak: string[] = [];
  if (method && RESEMBLES[method]) weak.push(capital(RESEMBLES[method]!) + '.');
  if (method && METHODS[method].tech) weak.push('Reads as a technology aesthetic.');
  if (wm.kind === 'typeset') weak.push(`The wordmark relies on ${wm.font}, an open-licence face others can also use; its distinctiveness comes from the setting, not the letters.`);
  if (wm.kind === 'constructed' && b.name.length > 12) weak.push('A long name in constructed capitals runs wide; the stacked lockup suits narrow places better.');
  const id = `lc_${(hash32(`${b.name}|${category}|${method}|${seed}|${wm.kind}|${wm.font ?? ''}|${opts.edit ?? ''}`) >>> 0).toString(36)}`;
  const title = method
    ? `${NOUN[method]} — ${fit.meaning}`
    : `${wm.kind === 'constructed' ? 'Drawn' : 'Set'} wordmark — ${wm.modification && wm.modification.kind !== 'none' ? wm.modification.kind : wm.case === 'upper' ? 'spaced capitals' : 'the name alone'}`;
  return {
    id,
    title,
    category,
    method,
    seed,
    ...arg,
    typography: wm.why,
    scalability: '',
    weaknesses: weak,
    addresses: method ? methodFit(method, b).hits.slice(0, 5) : b.personality.slice(0, 3),
    wordmark: wm,
    mark,
    palette: lang,
    lockup,
    soft,
    sw,
    status: 'proposed',
    ...(opts.parents ? { parents: opts.parents } : {}),
    ...(opts.edit ? { edit: opts.edit } : {}),
    sig: sigOf(mark, wm),
  };
}

export interface ExploreOptions {
  count?: number;
  seed?: string | number;
  /** concepts already shown (their structures are not repeated) */
  prior?: readonly LogoConcept[];
  /** a category to lead with */
  wanted?: LogoCategory;
  /** only these categories */
  only?: readonly LogoCategory[];
  /** methods to avoid where another will do (those already shown): used again only, with a new structure, when every
   * other is spent */
  notMethods?: readonly MethodId[];
  /** methods never to use here (the one being moved away from) */
  exclude?: readonly MethodId[];
  /** prefer geometric construction (a new geometric idea) */
  geometric?: boolean;
  /** prefer symbols over wordmarks */
  symbolLed?: boolean;
  /** push away from the expected (less conventional) */
  unconventional?: boolean;
}

/** The likeness above which two marks count as the same structure. */
export const SAME_MARK = 0.84;

/** An exploration: `count` concepts, genuinely different (see the head of this file). */
export function exploreLogos(b: LogoBrief, o: ExploreOptions = {}): LogoConcept[] {
  const count = Math.max(1, Math.min(16, o.count ?? 10));
  const r = rng('explore', b.name, String(o.seed ?? 0));
  const prior = o.prior ?? [];
  const used = new Set<MethodId>([...(o.notMethods ?? []), ...prior.map((c) => c.method).filter((m): m is MethodId => !!m)]);
  const sigs = prior.map((c) => c.sig).filter((s): s is number[] => !!s?.length);
  // the categories: the one asked for leads (about four in ten), the rest spread
  let cats: LogoCategory[] = [];
  const wanted = o.wanted ?? b.wanted;
  const pool = (o.only?.length ? SPREAD.filter((c) => o.only!.includes(c)) : SPREAD).filter((c) => !(o.symbolLed && c === 'wordmark'));
  if (wanted) for (let i = 0; i < Math.max(1, Math.round(count * 0.4)); i++) cats.push(wanted);
  let i = 0;
  while (cats.length < count * 2 && i < count * 6) {
    const c = pool[(i + (o.unconventional ? 3 : 0)) % pool.length];
    if ((c !== 'mascot' || b.creature || b.personality.some((p) => ['playful', 'young'].includes(p))) && (c !== 'monogram' || b.initials.length >= 2)) cats.push(c);
    i++;
  }
  if (o.geometric) cats = cats.map((c) => (['organic', 'expressive', 'mascot', 'emblem'].includes(c) ? 'geometric' : c));
  const out: LogoConcept[] = [];
  let wordmarks = 0;
  // first every category with a method not yet shown; only when those are spent, a method again with a new structure
  for (const reuse of [false, true]) {
    cats.forEach((cat, k) => {
      if (out.length >= count) return;
      for (let attempt = 0; attempt < 5; attempt++) {
        const seed = `${String(o.seed ?? 0)}.${k}.${attempt}${reuse ? '.r' : ''}`;
        let method: MethodId | null = null;
        if (cat !== 'wordmark') {
          const hard = new Set(o.exclude ?? []);
          const allowed = FOR[cat].filter((m) => (m !== 'monogram' || b.initials.length >= 2) && !hard.has(m) && !riskApplies(m, b) && !(o.geometric && METHODS[m].geometry === 'organic'));
          const options = reuse ? allowed : allowed.filter((m) => !used.has(m));
          if (!options.length) break;
          const ranked = options
            .map((m) => ({ m, s: methodFit(m, b).score + (o.unconventional ? (METHODS[m].meanings.length ? r.between(0, 2.5) : 0) : r.between(0, 0.8)) + (o.geometric && METHODS[m].geometry === 'geometric' ? 1.5 : 0) - (used.has(m) ? 3 : 0) }))
            .sort((x, y) => y.s - x.s);
          method = ranked[Math.min(ranked.length - 1, attempt)].m;
        } else if (reuse || (wordmarks >= 2 && attempt === 0)) break;
        const c = makeConcept(b, cat, method, seed, { expressive: cat === 'expressive' || !!o.unconventional });
        // a structure already shown (by likeness of silhouette, so a recolour never counts) is refused
        const close = c.sig?.length ? Math.max(0, ...sigs.filter((s) => s.length === c.sig!.length).map((s) => likeness(s, c.sig!))) : 0;
        if (close >= SAME_MARK && attempt < 4) continue;
        if (close >= SAME_MARK) break;
        if (method) used.add(method);
        else wordmarks++;
        if (c.sig?.length) sigs.push(c.sig);
        out.push(c);
        break;
      }
    });
    if (out.length >= count) break;
  }
  return out;
}

export const categoryLabel = (c: LogoCategory) => CATEGORY_LABEL[c];
