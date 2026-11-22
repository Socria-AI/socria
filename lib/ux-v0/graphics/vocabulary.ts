// lib/ux-v0/graphics/vocabulary.ts — the visual vocabulary of one graphic: which shapes, patterns, effects, type and
// picture treatments it speaks in, chosen for its brief before anything is placed.
//
// A brief's words carry style cues ("brutalist", "fluid", "technical", "risograph", "luxury", "generative"…) and a
// direction carries a visual language and an intensity. From those the planner picks one style (the strongest cue,
// the direction's language as a tie-breaker) and builds that style's vocabulary from SocriaUX's own registries:
// primitives (geometry.ts), pattern generators (patterns.ts), effects (effects.ts), gradients (paint.ts) and type
// treatments the renderer draws. Each style has alternatives, chosen by the project, so two projects in one style do
// not wear the same marks; restraint is a style too (a minimal brief gets one mark and nothing else).
//
// Nothing here draws. The composer (compose.ts) places what the vocabulary names; the planner only decides, and says
// why. More is not better: every style carries a complexity and a density the composer keeps to.

import { effectDefaults, normalizeEffects, type Effect } from './effects';
import { normalizePrim, primDefaults, type Prim } from './geometry';
import { normalizePaint, type Gradient } from './paint';
import { normalizePatternParams, patternDefaults } from './patterns';

export const STYLES = ['swiss', 'brutalist', 'luxury', 'experimental', 'minimal', 'maximal', 'organic', 'geometric', 'technical', 'cinematic', 'retro', 'futuristic', 'editorial', 'halftone', 'collage', 'typographic', 'abstract', 'soft', 'angular', 'procedural', 'monochrome', 'scientific', 'playful', 'packaging'] as const;
export type StyleKey = (typeof STYLES)[number];

/** Compositions beyond Graphics 1.0's: the vocabulary may ask for one of these (compose.ts lays each out). */
export const NEW_ARCHETYPES = ['radial', 'diagonal', 'collage', 'layered', 'typographic', 'modular', 'technical', 'organic', 'abstract', 'halftone', 'cinematic', 'procedural'] as const;
export type NewArchetype = (typeof NEW_ARCHETYPES)[number];

export type TypeTreatment = 'plain' | 'oversized' | 'stacked' | 'echo' | 'outline' | 'arc' | 'circle' | 'wave-path' | 'perspective' | 'rise' | 'wave' | 'stagger' | 'vertical' | 'gradient' | 'spaced' | 'italic-mix';
export type InkRole = 'ink' | 'accent' | 'accent2' | 'muted' | 'line' | 'ground';

export interface PatternUse {
  gen: string;
  /** the generator's parameters; lengths (spacing, weights, sizes) are in units of 1% of the artboard's short side */
  params: Record<string, number>;
  inks: InkRole[];
  opacity: number;
  /** where it lies: the whole frame, a band, the free field, behind the headline */
  where: 'full' | 'band' | 'field' | 'behind';
}

export interface VisualVocabulary {
  style: StyleKey;
  /** the other cues read, strongest first */
  cues: StyleKey[];
  /** how strongly the words asked for this style (0: only the direction suggested it) */
  strength: number;
  /** a composition the style asks for, taken by the planner where the kind allows */
  archetype: NewArchetype | 'swiss' | 'minimal' | 'statement' | 'type-poster' | 'image-full' | 'image-split' | null;
  /** the shape language: one to three primitives */
  motifs: Prim[];
  motifPaint: 'accent' | 'ink' | 'accent2' | 'outline' | 'gradient';
  pattern: PatternUse | null;
  type: TypeTreatment;
  /** effects for pictures, for the motifs, for the headline, and a texture over the whole ground */
  image: Effect[];
  marks: Effect[];
  headline: Effect[];
  texture: Effect[];
  /** a gradient the style draws with (a metallic, a holographic sweep, a soft mesh); its colours tinted to the palette */
  gradient: Gradient | null;
  /** how the palette is used */
  palette: 'full' | 'duo' | 'mono';
  /** 0 plain … 100 intricate; 0 empty … 100 dense */
  complexity: number;
  density: number;
  says: string[];
}

// ── reading the cues ──

/** Words that name a style (weighed 3 each, at most two words a style) and words that only suggest one through the
 * subject (weighed 1): "a brutalist poster" asks for brutalism; "a film night" only hints at cinema. The quoted copy
 * (headlines, taglines, names) is never read for style: “Raw, from the Alentejo hills” is honey, not brutalism. */
const STYLE_WORDS: Record<StyleKey, RegExp> = {
  swiss: /\b(swiss|international style|modernist|grid-based)\b/g,
  brutalist: /\b(brutalist|brutalism|brutal|anti-design)\b/g,
  luxury: /\b(luxury|luxurious|premium|couture|haute|opulent|refined)\b/g,
  experimental: /\b(experimental|avant-garde|unconventional|radical)\b/g,
  minimal: /\b(minimal|minimalist|restrained|understated)\b/g,
  maximal: /\b(maximalist|maximal|eclectic|clashing)\b/g,
  organic: /\b(organic|fluid|flowing|liquid)\b/g,
  geometric: /\b(geometric|bauhaus|modular|constructivist)\b/g,
  technical: /\b(technical|engineering|blueprint|schematic)\b/g,
  cinematic: /\b(cinematic|dramatic|noir|moody)\b/g,
  retro: /\b(retro|vintage|nostalgic|risograph|riso|[5-8]0s)\b/g,
  futuristic: /\b(futuristic|sci-fi|cyberpunk|cyber|interface-inspired|interface|hud)\b/g,
  editorial: /\b(editorial)\b/g,
  halftone: /\b(halftone|newsprint|comic|pop art|ben-day)\b/g,
  collage: /\b(collage|cut-out|scrapbook|zine|mixed-media)\b/g,
  typographic: /\b(typography-only|type-only|only type|typographic|lettering)\b/g,
  abstract: /\b(abstract)\b/g,
  soft: /\b(soft|gentle|pastel|serene)\b/g,
  angular: /\b(angular|sharp|dynamic|aggressive|kinetic)\b/g,
  procedural: /\b(procedural|generative|algorithmic|line-field|flow field)\b/g,
  monochrome: /\b(monochrome|monochromatic|black and white|single colou?r|one colou?r)\b/g,
  scientific: /\b(scientific)\b/g,
  playful: /\b(playful|fun|joyful|cheerful|whimsical)\b/g,
  packaging: /\b(packaging)\b/g,
};
const SUBJECT_WORDS: Partial<Record<StyleKey, RegExp>> = {
  cinematic: /\b(film|movie|cinema|thriller|trailer)\b/g,
  technical: /\b(conference|infrastructure|systems|software|hardware)\b/g,
  editorial: /\b(magazine|journal|literary|essays?|newspaper)\b/g,
  futuristic: /\b(digital|electronic|techno|tech|robots?)\b/g,
  organic: /\b(botanic(al)?|nature|natural|garden|river|ocean)\b/g,
  scientific: /\b(science|research|data|infographic|study)\b/g,
  luxury: /\b(fashion|jewell?ery|perfume|elegant)\b/g,
  playful: /\b(kids|children|toys?|party)\b/g,
  packaging: /\b(label|jar|bottle|seal)\b/g,
  retro: /\b(drive-in|diner|arcade)\b/g,
  soft: /\b(wellness|sleep|spa|yoga|calm)\b/g,
  minimal: /\b(quiet|simple)\b/g,
  maximal: /\b(loud|busy)\b/g,
};
/** Words that change how a style is used rather than which style it is. */
const MODIFIERS = { mono: /\b(monochrome|monochromatic|black and white|single colou?r|one colou?r)\b/, glitch: /\bglitch(y|ed)?\b/, grain: /\bgrain(y)?\b|\bfilm grain\b/, neon: /\bneon\b/, riso: /\brisograph|\briso\b/ };

/** The direction's visual language as a style, where it suggests one. */
const LANGUAGE_STYLE: Record<string, StyleKey> = {
  swiss: 'swiss',
  brutal: 'brutalist',
  'quiet-luxury': 'luxury',
  gallery: 'minimal',
  maximal: 'maximal',
  organic: 'organic',
  geometric: 'geometric',
  utility: 'technical',
  industrial: 'technical',
  cinema: 'cinematic',
  night: 'cinematic',
  'retro-print': 'retro',
  future: 'futuristic',
  broadsheet: 'editorial',
  poster: 'experimental',
  craft: 'soft',
  civic: 'swiss',
};
const KIND_STYLE: Record<string, [StyleKey, number]> = { label: ['packaging', 4], magazine: ['editorial', 2], infographic: ['scientific', 2], book: ['editorial', 1] };

const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
const QUOTED = /“[^”]*”|"[^"]*"|‘[^’]*’/g;

/** The style cues in a brief's words and its direction, strongest first (ties: the one named first). */
export function readStyles(words: string, language?: string, kind?: string): { style: StyleKey; score: number }[] {
  const w = words.toLowerCase().replace(QUOTED, ' ');
  const found: { style: StyleKey; score: number; at: number }[] = [];
  for (const style of STYLES) {
    let score = 0;
    let at = Infinity;
    const named = [...w.matchAll(STYLE_WORDS[style])];
    const distinct = [...new Set(named.map((m) => m[0]))];
    score += Math.min(2, distinct.length) * 3;
    if (named.length) at = Math.min(at, named[0].index ?? Infinity);
    const subj = SUBJECT_WORDS[style];
    if (subj) {
      const hits = [...w.matchAll(subj)];
      score += Math.min(2, new Set(hits.map((m) => m[0])).size);
      if (hits.length) at = Math.min(at, (hits[0].index ?? 0) + 10_000);
    }
    if (language && LANGUAGE_STYLE[language] === style) {
      score += 1;
      at = Math.min(at, 20_000);
    }
    if (kind && KIND_STYLE[kind]?.[0] === style) {
      score += KIND_STYLE[kind][1];
      at = Math.min(at, 5_000);
    }
    if (score > 0) found.push({ style, score, at });
  }
  return found.sort((a, b) => b.score - a.score || a.at - b.at).map(({ style, score }) => ({ style, score }));
}

// ── building one style's vocabulary ──

const prim = (kind: string, params: Record<string, number> = {}): Prim => {
  const d = primDefaults(kind);
  if (!d) throw new Error(`unknown primitive ${kind}`);
  return { kind, params: { ...d.params, ...params } };
};
const fx = (kind: string, params: Record<string, number> = {}, colors: Partial<Pick<Effect, 'color' | 'color2' | 'color3'>> = {}): Effect => {
  const e = effectDefaults(kind);
  if (!e) throw new Error(`unknown effect ${kind}`);
  return { ...e, params: { ...e.params, ...params }, ...colors };
};
const pat = (gen: string, params: Record<string, number>, inks: InkRole[], opacity: number, where: PatternUse['where']): PatternUse => {
  const d = patternDefaults(gen);
  if (!d) throw new Error(`unknown pattern ${gen}`);
  return { gen, params: { ...d, ...params }, inks, opacity, where };
};
const GOLD: Gradient = { type: 'linear', angle: 115, stops: [{ at: 0, color: '#8a6a1f' }, { at: 0.3, color: '#f6e29a' }, { at: 0.55, color: '#b88a2c' }, { at: 0.8, color: '#fff3c4' }, { at: 1, color: '#7d5c17' }] };
const HOLO: Gradient = { type: 'conic', angle: 30, cx: 0.5, cy: 0.5, stops: [{ at: 0, color: '#ff9ad5' }, { at: 0.25, color: '#9ae6ff' }, { at: 0.5, color: '#c2ffb5' }, { at: 0.75, color: '#fff3a6' }, { at: 1, color: '#ff9ad5' }] };

interface Ctx {
  h: number;
  pick: <T>(list: readonly T[], salt?: number) => T;
  hasImage: boolean;
  intensity: number;
}
type Recipe = (c: Ctx) => Omit<VisualVocabulary, 'style' | 'cues' | 'strength' | 'says'> & { say: string };

const NONE = { image: [] as Effect[], marks: [] as Effect[], headline: [] as Effect[], texture: [] as Effect[], gradient: null as Gradient | null };

const RECIPES: Record<StyleKey, Recipe> = {
  swiss: (c) => ({
    ...NONE,
    archetype: c.pick(['swiss', 'modular'] as const),
    motifs: [prim(c.pick(['circle', 'sector', 'rounded-rect']))],
    motifPaint: 'accent',
    pattern: c.h % 3 === 0 ? pat('grid', { scale: 6, weight: 0.08, major: 4, majorWeight: 0.2 }, ['line'], 0.7, 'field') : null,
    type: 'plain',
    palette: 'duo',
    complexity: 30,
    density: 40,
    say: 'Swiss: a grid that shows, flush-left type, one geometric mark in the accent; nothing ornamental.',
  }),
  brutalist: (c) => ({
    ...NONE,
    archetype: 'typographic',
    motifs: [prim(c.pick(['arrow', 'cross', 'bracket']))],
    motifPaint: 'ink',
    pattern: c.pick([null, pat('lines', { scale: 1.6, weight: 0.35 }, ['ink'], 1, 'band')]),
    type: c.pick(['stacked', 'oversized'] as const),
    marks: [fx('drop-shadow', { dx: 10, dy: 10, blur: 0, spread: 0, opacity: 100 })],
    palette: 'mono',
    complexity: 55,
    density: 70,
    say: 'Brutalist: type set as a wall, raw rules, hard offset shadows, two colours; legible, never pretty for its own sake.',
  }),
  luxury: (c) => ({
    ...NONE,
    archetype: c.hasImage ? 'image-full' : 'minimal',
    motifs: [c.pick([prim('frame', { thickness: 2, corner: 2 }), prim('corner-ornament'), prim('ring', { thickness: 4 })])],
    motifPaint: 'gradient',
    pattern: null,
    type: 'spaced',
    image: [],
    marks: [],
    gradient: GOLD,
    palette: 'duo',
    complexity: 25,
    density: 15,
    say: 'Luxury: space, a light hand, letters spaced wide, one fine ornament in a metallic gradient; the picture left to speak.',
  }),
  experimental: (c) => ({
    ...NONE,
    archetype: c.pick(['layered', 'diagonal'] as const),
    motifs: [prim(c.pick(['blob', 'fragments', 'spiral', 'distorted-ring']), { seed: (c.h % 900) + 3 })],
    motifPaint: 'accent',
    pattern: c.pick([pat('flow', { scale: 2.4, steps: 60, weight: 0.12, turbulence: 30 }, ['ink'], 0.55, 'full'), pat('noise-dashes', { scale: 1.6, length: 1.6, weight: 0.12, turbulence: 40 }, ['ink'], 0.5, 'full'), pat('contours', { scale: 30, levels: 18, weight: 0.12 }, ['ink'], 0.5, 'full')]),
    type: c.pick(['perspective', 'wave', 'rise'] as const),
    marks: [c.pick([fx('chromatic', { amount: 6 }), fx('misregistration', { offset: 6 })])],
    texture: [fx('grain', { amount: 30 })],
    palette: 'full',
    complexity: 85,
    density: 70,
    say: 'Experimental: the headline warped, a generative field beneath, a shape out of register; layered, not tidy.',
  }),
  minimal: (c) => ({
    ...NONE,
    archetype: 'minimal',
    motifs: [prim(c.pick(['ring', 'circle', 'line']), { thickness: 4 })],
    motifPaint: 'outline',
    pattern: null,
    type: 'plain',
    palette: 'duo',
    complexity: 10,
    density: 10,
    say: 'Minimal: one quiet mark, small type, wide margins. The space is the design.',
  }),
  maximal: (c) => ({
    ...NONE,
    archetype: 'collage',
    motifs: [prim('burst', { rays: 14 }), prim(c.pick(['star', 'wavy-circle', 'blob'])), prim(c.pick(['chevron', 'cross', 'spiral']))],
    motifPaint: 'accent2',
    pattern: pat('symbols', { scale: 6, size: 55, shape: 7, spin: 100, colorVar: 70, jitter: 40 }, ['ink', 'accent', 'accent2'], 0.9, 'full'),
    type: 'echo',
    marks: [fx('outline', { width: 6 }, { color: '#ffffff' }), fx('drop-shadow', { dx: 8, dy: 8, blur: 0, opacity: 90 })],
    palette: 'full',
    complexity: 95,
    density: 92,
    say: 'Maximalist: many shapes, every colour, a pattern under everything, the headline echoed; full, but with one thing to read first.',
  }),
  organic: (c) => ({
    ...NONE,
    archetype: 'organic',
    motifs: [prim(c.pick(['blob', 'wavy-circle', 'drop']), { seed: (c.h % 900) + 5 }), prim(c.pick(['leaf', 'fluid-curve', 'wave']))],
    motifPaint: 'accent',
    pattern: c.pick([pat('waves', { scale: 2.2, amplitude: 2.4, wavelength: 26, weight: 0.12, wobble: 60, ramp: 70, rampDir: 0 }, ['accent'], 0.8, 'band'), pat('flow', { scale: 2.6, steps: 50, weight: 0.12, curl: 40, turbulence: 20 }, ['muted'], 0.5, 'full')]),
    type: c.pick(['plain', 'wave-path'] as const),
    marks: [fx('drop-shadow', { dx: 0, dy: 14, blur: 36, opacity: 18 })],
    gradient: { type: 'mesh', angle: 0, stops: [], mesh: ['#000000', '#000000', '#000000', '#000000'] },
    palette: 'full',
    complexity: 55,
    density: 45,
    say: 'Organic: soft-edged shapes overlapping, a field of waving lines denser toward the foot, a mesh of the palette; nothing ruled.',
  }),
  geometric: (c) => ({
    ...NONE,
    archetype: 'modular',
    motifs: [prim('triangle'), prim('sector', { sweep: 90 }), prim('circle')],
    motifPaint: 'accent',
    pattern: c.pick([pat('modular', { scale: 14, set: c.h % 2 ? 0 : 2, fill: 80, colorVar: 45 }, ['accent', 'ink', 'accent2'], 1, 'field'), pat('tessellation', { scale: 10, tile: 2, gap: 4 }, ['accent', 'ink', 'accent2'], 1, 'field')]),
    type: 'plain',
    palette: 'full',
    complexity: 65,
    density: 60,
    say: 'Geometric: a field of modules (quarter circles, triangles, halves) on a grid, the headline holding the other half.',
  }),
  technical: () => ({
    ...NONE,
    archetype: 'technical',
    motifs: [prim('annotation'), prim('bracket'), prim('arrow-line')],
    motifPaint: 'ink',
    pattern: pat('technical', { scale: 3.2, major: 5, weight: 0.05, labels: 1, marks: 1 }, ['line', 'accent'], 1, 'full'),
    type: 'plain',
    palette: 'duo',
    complexity: 60,
    density: 55,
    say: 'Technical: a measured grid with crosshairs and coordinates, annotations that point, figures set like a specification.',
  }),
  cinematic: (c) => ({
    ...NONE,
    archetype: 'cinematic',
    motifs: [prim('ring', { thickness: 4 })],
    motifPaint: 'accent',
    pattern: null,
    type: 'spaced',
    image: [fx('grain', { amount: 26 })],
    headline: [fx('glow', { size: 22, spread: 0, opacity: 55 })],
    texture: [fx('grain', { amount: 22 })],
    gradient: { type: 'radial', angle: 0, cx: 0.5, cy: 0.42, r: 0.75, stops: [{ at: 0, color: '#3a3a3a' }, { at: 1, color: '#050505' }] },
    palette: 'duo',
    complexity: 50,
    density: 35,
    say: c.hasImage ? 'Cinematic: the picture full-bleed and graded, letterbox bars, the title spaced wide with a glow, a billing block at the foot.' : 'Cinematic: a spotlight in the dark, the title spaced wide with a glow, a billing block at the foot.',
  }),
  retro: (c) => ({
    ...NONE,
    archetype: c.pick(['radial', 'statement'] as const),
    motifs: [prim('sunburst', { rays: 24 })],
    motifPaint: 'accent2',
    pattern: c.pick([pat('radial', { count: 36, inner: 0, taper: 1, cy: 72 }, ['accent'], 0.9, 'full'), pat('stripes', { scale: 7, ratio: 50 }, ['accent'], 0.9, 'band')]),
    type: c.pick(['arc', 'echo'] as const),
    marks: [fx('misregistration', { offset: 4, opacity: 85 })],
    texture: [fx('grain', { amount: 34, size: 3 })],
    palette: 'full',
    complexity: 65,
    density: 60,
    say: 'Retro: rays from a low sun, the title set on an arc, two inks slightly out of register on grainy paper.',
  }),
  futuristic: (c) => ({
    ...NONE,
    archetype: c.pick(['layered', 'technical'] as const),
    motifs: [prim('perspective-grid'), prim(c.pick(['chevron', 'ring', 'hexagon']))],
    motifPaint: 'accent',
    pattern: c.pick([pat('isometric', { scale: 5, mode: 0, weight: 0.06 }, ['accent'], 0.45, 'full'), pat('network', { scale: 9, reach: 1.7, node: 0.4, weight: 0.08 }, ['accent'], 0.6, 'full')]),
    type: c.pick(['spaced', 'perspective'] as const),
    headline: [fx('glow', { size: 18, spread: 1, opacity: 70 })],
    marks: [fx('glow', { size: 14, opacity: 80 })],
    gradient: HOLO,
    palette: 'full',
    complexity: 75,
    density: 60,
    say: 'Futuristic: a receding grid, a lattice of light, neon glow on the title and the marks, a holographic sweep.',
  }),
  editorial: (c) => ({
    ...NONE,
    archetype: c.hasImage ? 'image-split' : 'statement',
    motifs: [prim('line')],
    motifPaint: 'ink',
    pattern: null,
    type: 'italic-mix',
    palette: 'duo',
    complexity: 35,
    density: 40,
    say: 'Editorial: a serif headline with one word turned italic, fine rules, the hierarchy of a printed page.',
  }),
  halftone: () => ({
    ...NONE,
    archetype: 'halftone',
    motifs: [prim('circle')],
    motifPaint: 'accent',
    pattern: pat('halftone', { scale: 2, field: 1, max: 110 }, ['ink'], 1, 'field'),
    type: 'oversized',
    image: [fx('halftone', { size: 9, angle: 45 })],
    palette: 'duo',
    complexity: 55,
    density: 60,
    say: 'Halftone: the image screened into dots in two inks, a dot field swelling from the centre, type set big and flat.',
  }),
  collage: (c) => ({
    ...NONE,
    archetype: 'collage',
    motifs: [prim('fragments', { seed: (c.h % 900) + 11 }), prim('irregular-polygon', { seed: (c.h % 900) + 2 }), prim(c.pick(['blob', 'star']))],
    motifPaint: 'accent2',
    pattern: null,
    type: 'stagger',
    image: [fx('duotone', { amount: 85 })],
    marks: [fx('drop-shadow', { dx: 4, dy: 6, blur: 6, opacity: 30 })],
    texture: [fx('grain', { amount: 30 })],
    palette: 'full',
    complexity: 85,
    density: 75,
    say: 'Collage: pieces cut and laid over each other at angles, pictures in torn shapes, the headline set in a jostle.',
  }),
  typographic: (c) => ({
    ...NONE,
    archetype: 'typographic',
    motifs: [],
    motifPaint: 'ink',
    pattern: null,
    type: c.pick(['stacked', 'echo', 'outline', 'vertical'] as const),
    palette: 'mono',
    complexity: 45,
    density: 55,
    say: 'Typography only: no pictures and no shapes; the words themselves are the composition.',
  }),
  abstract: (c) => ({
    ...NONE,
    archetype: 'abstract',
    motifs: [prim(c.pick(['blob', 'sector', 'crescent']))],
    motifPaint: 'accent',
    pattern: pat('abstract', { count: 16, shapeSize: 30, lineShare: 30, colorVar: 70, jitter: 60 }, ['accent', 'ink', 'accent2'], 1, 'field'),
    type: 'plain',
    palette: 'full',
    complexity: 75,
    density: 55,
    say: 'Abstract: an arrangement of circles, halves, bars and arcs in the palette; the words small, as a label to it.',
  }),
  soft: (c) => ({
    ...NONE,
    archetype: 'organic',
    motifs: [prim(c.pick(['blob', 'capsule', 'wavy-circle']), { seed: (c.h % 900) + 7 }), prim('circle')],
    motifPaint: 'accent2',
    pattern: null,
    type: 'plain',
    marks: [fx('soft', { distance: 10, blur: 28, opacity: 40 })],
    gradient: { type: 'mesh', angle: 0, stops: [], mesh: ['#000000', '#000000', '#000000', '#000000'] },
    palette: 'full',
    complexity: 35,
    density: 30,
    say: 'Soft: rounded shapes with soft light, a mesh of pale colours, nothing hard-edged.',
  }),
  angular: (c) => ({
    ...NONE,
    archetype: 'diagonal',
    motifs: [prim('chevron'), prim(c.pick(['parallelogram', 'triangle']))],
    motifPaint: 'accent',
    pattern: c.pick([pat('diagonal', { scale: 4, ratio: 30 }, ['ink'], 0.9, 'band'), null]),
    type: c.pick(['rise', 'plain'] as const),
    marks: [fx('extrude', { depth: 22, angle: 45, steps: 16 })],
    palette: 'full',
    complexity: 60,
    density: 55,
    say: 'Angular: everything on the diagonal, chevrons and slanted planes with long shadows, the headline rising.',
  }),
  procedural: (c) => ({
    ...NONE,
    archetype: 'procedural',
    motifs: [],
    motifPaint: 'ink',
    pattern: c.pick([
      pat('flow', { scale: 1.6, steps: 90, step: 0.6, weight: 0.1, turbulence: 25, curl: 60, ramp: 60, rampDir: 0 }, ['accent', 'ink'], 1, 'full'),
      pat('waves', { scale: 1.1, amplitude: 3, wavelength: 30, drift: 18, weight: 0.12, ramp: 80, rampDir: 0 }, ['accent'], 1, 'full'),
      pat('radial', { count: 280, inner: 6, weight: 0.08, lengthVar: 40, cy: 60 }, ['accent'], 1, 'full'),
      pat('contours', { scale: 36, levels: 26, weight: 0.12 }, ['accent'], 1, 'full'),
    ]),
    type: 'plain',
    palette: 'duo',
    complexity: 70,
    density: 80,
    say: 'Procedural: a generated line field from a seed fills the frame, denser toward the foot; editable as parameters, redrawn the same every time.',
  }),
  monochrome: (c) => ({
    ...NONE,
    archetype: null,
    motifs: [prim(c.pick(['circle', 'rounded-rect']))],
    motifPaint: 'ink',
    pattern: null,
    type: 'plain',
    image: [fx('mono', { amount: 100 })],
    palette: 'mono',
    complexity: 35,
    density: 40,
    say: 'Monochromatic: one colour in its tints and shades; pictures in the same single colour.',
  }),
  scientific: () => ({
    ...NONE,
    archetype: null,
    motifs: [prim('annotation')],
    motifPaint: 'ink',
    pattern: pat('grid', { scale: 3, weight: 0.05, major: 5, majorWeight: 0.12 }, ['line'], 0.7, 'field'),
    type: 'plain',
    palette: 'duo',
    complexity: 40,
    density: 45,
    say: 'Scientific: a faint measured grid, the figures labelled and sourced, annotations that point at what matters.',
  }),
  playful: (c) => ({
    ...NONE,
    archetype: c.pick(['collage', 'radial'] as const),
    motifs: [prim('star', { points: 5, inner: 50 }), prim('burst', { rays: 12 }), prim(c.pick(['wavy-circle', 'blob']))],
    motifPaint: 'accent2',
    pattern: pat('symbols', { scale: 8, size: 45, shape: 7, spin: 80, colorVar: 80, jitter: 30 }, ['accent', 'accent2', 'ink'], 0.85, 'full'),
    type: 'stagger',
    marks: [fx('drop-shadow', { dx: 5, dy: 5, blur: 0, opacity: 100 })],
    palette: 'full',
    complexity: 75,
    density: 65,
    say: 'Playful: stars and bursts at angles, confetti of symbols, the headline bouncing; colours that clash on purpose.',
  }),
  packaging: (c) => ({
    ...NONE,
    archetype: null,
    motifs: [prim('guilloche', { petals: 14, loops: 3 }), prim('frame', { thickness: 2, corner: c.h % 4 }), prim('corner-ornament')],
    motifPaint: 'gradient',
    pattern: null,
    type: 'circle',
    gradient: GOLD,
    palette: 'duo',
    complexity: 60,
    density: 45,
    say: 'Packaging: a double frame with corner ornaments, a guilloché rosette like a seal, the maker’s name set round it, foil in a metallic gradient.',
  }),
};

/** The vocabulary for a brief and a direction (see the head of this file). */
export function vocabularyFor(input: { words: string; mood: readonly string[]; language: string; intensity: number; hasImage: boolean; seed: string; kind?: string }): VisualVocabulary {
  const text = `${input.words} ${input.mood.join(' ')}`;
  const read0 = readStyles(text, input.language, input.kind);
  // monochrome is how a palette is used: with another style named it modifies that style, alone it is the style
  const mono = MODIFIERS.mono.test(text.toLowerCase().replace(QUOTED, ' '));
  const read = mono && read0.some((r) => r.style !== 'monochrome' && r.score >= 3) ? read0.filter((r) => r.style !== 'monochrome') : read0;
  // no cue at all: the direction's intensity decides between restraint and a geometric default
  const style: StyleKey = read[0]?.style ?? (input.intensity < 35 ? 'minimal' : input.intensity > 70 ? 'experimental' : 'swiss');
  const strength = read[0] ? read[0].score : 0;
  const h = hashOf(`${input.seed}|${style}`);
  const ctx: Ctx = { h, pick: (list, salt = 0) => list[(h + salt * 7919) % list.length], hasImage: input.hasImage, intensity: input.intensity };
  const { say, ...rest } = RECIPES[style](ctx);
  const v: VisualVocabulary = { style, cues: read.slice(1, 4).map((x) => x.style), strength, ...rest, says: [say] };
  if (read[0] && read[0].score <= 1 && LANGUAGE_STYLE[input.language] === style) v.says.push(`No style was named; the direction’s ${input.language} language suggests it.`);
  else if (!read[0]) v.says.push('No style was named and the direction suggests none: chosen from its intensity.');
  // the modifiers the words ask for
  const lw = text.toLowerCase().replace(QUOTED, ' ');
  if (mono && style !== 'monochrome') {
    v.palette = 'mono';
    v.image = [fx('mono', { amount: 100 })];
    v.says.push('Monochrome: one colour in its tints and shades, the pictures in it too.');
  }
  if (MODIFIERS.glitch.test(lw)) {
    v.headline = [...v.headline.filter((e) => e.kind !== 'glitch'), fx('glitch', { amount: 34, slices: 40 })];
    v.says.push('Glitched: the headline torn into slices, its channels shifted.');
  }
  if (MODIFIERS.grain.test(lw) && !v.texture.some((e) => e.kind === 'grain')) v.texture = [...v.texture, fx('grain', { amount: 32 })];
  if (MODIFIERS.neon.test(lw) && !v.headline.some((e) => e.kind === 'glow')) v.headline = [...v.headline, fx('glow', { size: 18, spread: 1, opacity: 80 })];
  if (MODIFIERS.riso.test(lw) && !v.marks.some((e) => e.kind === 'misregistration')) v.marks = [...v.marks, fx('misregistration', { offset: 4 })];
  return v;
}

/** The vocabulary as a record a document keeps (doc.ts Vocabulary): what edits in words and new artboards keep to. */
export function vocabularyRecord(v: VisualVocabulary): { motifs: string[]; patterns: string[]; effects: string[]; type: string[]; complexity: number } {
  return {
    motifs: v.motifs.map((m) => m.kind),
    patterns: v.pattern ? [v.pattern.gen] : [],
    effects: [...new Set([...v.image, ...v.marks, ...v.headline, ...v.texture].map((e) => e.kind))],
    type: [v.type === 'plain' ? 'plain' : v.type.replace(/-/g, ' '), v.style],
    complexity: v.complexity,
  };
}

// ── a vocabulary from storage or a model, held to the registries ──

const TYPE_TREATMENTS: readonly TypeTreatment[] = ['plain', 'oversized', 'stacked', 'echo', 'outline', 'arc', 'circle', 'wave-path', 'perspective', 'rise', 'wave', 'stagger', 'vertical', 'gradient', 'spaced', 'italic-mix'];
const INK_ROLES: readonly InkRole[] = ['ink', 'accent', 'accent2', 'muted', 'line', 'ground'];
const ARCHES = ['swiss', 'minimal', 'statement', 'type-poster', 'image-full', 'image-split', ...NEW_ARCHETYPES] as const;

/** A vocabulary held to what SocriaUX can draw: unknown styles, shapes, generators, effects and treatments are left
 * out (each said in `notes`), numbers clamped. Null when nothing usable is left. */
export function normalizeVocabulary(v: unknown, notes: string[] = []): VisualVocabulary | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const style = (STYLES as readonly string[]).includes(r.style as string) ? (r.style as StyleKey) : null;
  if (!style) {
    notes.push(`A style SocriaUX does not know (“${String(r.style ?? '').slice(0, 24)}”) was not used.`);
    return null;
  }
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
  const motifs: Prim[] = [];
  for (const m of Array.isArray(r.motifs) ? r.motifs.slice(0, 4) : []) {
    const p = normalizePrimLoose(m);
    if (p) motifs.push(p);
    else notes.push(`A shape SocriaUX does not have (“${String((m as { kind?: unknown })?.kind ?? '').slice(0, 24)}”) was left out.`);
  }
  let pattern: PatternUse | null = null;
  if (r.pattern && typeof r.pattern === 'object') {
    const p = r.pattern as Record<string, unknown>;
    const params = typeof p.gen === 'string' ? normalizePatternParams(p.gen, p.params) : null;
    if (params) pattern = { gen: p.gen as string, params, inks: (Array.isArray(p.inks) ? p.inks : ['ink']).filter((x): x is InkRole => (INK_ROLES as readonly string[]).includes(x as string)).slice(0, 4), opacity: num(p.opacity, 0.05, 1, 1), where: (['full', 'band', 'field', 'behind'] as const).find((w) => w === p.where) ?? 'field' };
    else notes.push(`A pattern SocriaUX cannot generate (“${String(p.gen ?? '').slice(0, 24)}”) was left out.`);
    if (pattern && !pattern.inks.length) pattern.inks = ['ink'];
  }
  const fxList = (x: unknown) => normalizeEffects(x, notes);
  const gradient = r.gradient ? normalizePaint(r.gradient, null) : null;
  return {
    style,
    cues: (Array.isArray(r.cues) ? r.cues : []).filter((c): c is StyleKey => (STYLES as readonly string[]).includes(c as string)).slice(0, 3),
    strength: num(r.strength, 0, 20, 3),
    archetype: (ARCHES as readonly string[]).includes(r.archetype as string) ? (r.archetype as VisualVocabulary['archetype']) : null,
    motifs,
    motifPaint: (['accent', 'ink', 'accent2', 'outline', 'gradient'] as const).find((p) => p === r.motifPaint) ?? 'accent',
    pattern,
    type: (TYPE_TREATMENTS as readonly string[]).includes(r.type as string) ? (r.type as TypeTreatment) : 'plain',
    image: fxList(r.image),
    marks: fxList(r.marks),
    headline: fxList(r.headline),
    texture: fxList(r.texture),
    gradient: gradient && typeof gradient === 'object' ? gradient : null,
    palette: (['full', 'duo', 'mono'] as const).find((p) => p === r.palette) ?? 'full',
    complexity: Math.round(num(r.complexity, 0, 100, 50)),
    density: Math.round(num(r.density, 0, 100, 50)),
    says: (Array.isArray(r.says) ? r.says : []).filter((s): s is string => typeof s === 'string').map((s) => s.slice(0, 300)).slice(0, 4),
  };
}
const normalizePrimLoose = (m: unknown): Prim | null => normalizePrim(m);
