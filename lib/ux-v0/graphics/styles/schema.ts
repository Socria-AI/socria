// lib/ux-v0/graphics/styles/schema.ts — Style DNA: a design language described the way it is built.
//
// A style is not a palette and a font. Each profile says how its language is constructed: which faces and how they
// are set (case, tracking, leading, alignment, how lines break), which shapes and how they relate (curvature,
// symmetry, repetition), how the frame is organised (the constructions it builds with, its grid, its density and
// negative space), how colour is used (a convention and how far it may drift, how a brand's colours are mapped into
// it), its surface (grain, paper, misregistration, halftone, metal, glow), how pictures are treated and cropped, how
// much ornament it carries and of what kind, and its constraints: what it cannot do without, what it must never do,
// the mistakes that make it a costume.
//
// Every profile, built in or custom or proposed by a model, is held here to what SocriaUX can actually draw: faces
// Graphics loads (fonts.ts GRAPHIC_FONTS), primitives (geometry.ts), pattern generators (patterns.ts), effects
// (effects.ts) and constructions (compose.ts lays each out). What is unknown is left out and said; numbers are
// clamped; nothing in a profile is ever executed. The schema is versioned: STYLE_SCHEMA rises when a field's meaning
// changes, and older profiles are read forward by normalizeStyleDNA.

import { EFFECT_BY_KIND } from '../effects';
import { PRIMITIVE_BY_KIND } from '../geometry';
import { parseColor } from '../paint';
import { PATTERN_BY_KIND } from '../patterns';
import { GRAPHIC_FONTS, graphicFont } from '../../fonts';
import type { StyleKey } from '../vocabulary';

export const STYLE_SCHEMA = 1;

export const STYLE_CATEGORIES = ['historical', 'contemporary', 'digital', 'print', 'cultural', 'custom'] as const;
export type StyleCategory = (typeof STYLE_CATEGORIES)[number];

/** How the Explorer groups styles beyond their category (a style has several). */
export const STYLE_FACETS = [
  'historical',
  'contemporary',
  'digital',
  'print',
  'experimental',
  'editorial',
  'cultural',
  'geometric',
  'organic',
  'ornamental',
  'minimal',
  'maximal',
  'typographic',
  'retro',
  'futuristic',
  'handmade',
  'luxury',
  'commercial',
] as const;
export type StyleFacet = (typeof STYLE_FACETS)[number];

export const TYPE_CLASSES = [
  'grotesk',
  'geometric-sans',
  'humanist-sans',
  'condensed-sans',
  'wide-sans',
  'rounded',
  'techno',
  'didone',
  'transitional',
  'old-style',
  'inscriptional',
  'slab',
  'fat-face',
  'wood-type',
  'deco',
  'nouveau',
  'blackletter',
  'uncial',
  'script',
  'handwritten',
  'brush',
  'typewriter',
  'mono',
  'pixel',
  'stencil',
  'comic',
  'signage',
  'distressed',
  'glitch',
  'neon',
] as const;
export type TypeClass = (typeof TYPE_CLASSES)[number];

/** How each face Graphics offers is classified: what a profile's type classes, the evaluator and search read. */
export const FACE_CLASS: Readonly<Record<string, readonly TypeClass[]>> = {
  'Instrument Serif': ['transitional'],
  Fraunces: ['old-style'],
  'Playfair Display': ['didone'],
  'DM Serif Display': ['transitional'],
  'Cormorant Garamond': ['old-style'],
  'Libre Baskerville': ['transitional'],
  Lora: ['old-style'],
  Newsreader: ['transitional'],
  'Source Serif 4': ['transitional'],
  'EB Garamond': ['old-style'],
  'Bodoni Moda': ['didone'],
  'Young Serif': ['old-style'],
  'Old Standard TT': ['didone'],
  Spectral: ['transitional'],
  'IBM Plex Serif': ['transitional'],
  Gloock: ['didone'],
  'Crimson Pro': ['old-style'],
  Literata: ['transitional'],
  'Libre Caslon Text': ['old-style'],
  Cinzel: ['inscriptional'],
  Marcellus: ['inscriptional'],
  Prata: ['didone'],
  Italiana: ['didone'],
  'Abril Fatface': ['fat-face', 'didone'],
  'Roboto Slab': ['slab'],
  'Zilla Slab': ['slab'],
  'Alfa Slab One': ['slab', 'wood-type'],
  Inter: ['grotesk'],
  'DM Sans': ['geometric-sans'],
  Manrope: ['grotesk'],
  'Space Grotesk': ['grotesk'],
  'Work Sans': ['grotesk'],
  'Plus Jakarta Sans': ['geometric-sans'],
  'IBM Plex Sans': ['grotesk'],
  Outfit: ['geometric-sans'],
  Sora: ['geometric-sans'],
  Archivo: ['grotesk'],
  'Public Sans': ['grotesk'],
  Karla: ['grotesk'],
  Syne: ['wide-sans'],
  'Bricolage Grotesque': ['grotesk'],
  Geist: ['grotesk'],
  'Instrument Sans': ['grotesk'],
  'Hanken Grotesk': ['grotesk'],
  'Familjen Grotesk': ['grotesk'],
  Unbounded: ['wide-sans'],
  Anton: ['condensed-sans'],
  'Big Shoulders Display': ['condensed-sans'],
  'Schibsted Grotesk': ['grotesk'],
  'Red Hat Display': ['geometric-sans'],
  Epilogue: ['grotesk'],
  Chivo: ['grotesk'],
  'Darker Grotesque': ['grotesk'],
  Rubik: ['rounded'],
  Urbanist: ['geometric-sans'],
  Onest: ['grotesk'],
  Figtree: ['geometric-sans'],
  Oswald: ['condensed-sans'],
  'Barlow Condensed': ['condensed-sans'],
  'Bebas Neue': ['condensed-sans'],
  'Archivo Black': ['grotesk'],
  'Dela Gothic One': ['wide-sans'],
  Orbitron: ['techno', 'wide-sans'],
  Michroma: ['wide-sans', 'techno'],
  Syncopate: ['wide-sans'],
  'Chakra Petch': ['techno'],
  'IBM Plex Mono': ['mono'],
  'JetBrains Mono': ['mono'],
  'Space Mono': ['mono'],
  'Geist Mono': ['mono'],
  'DM Mono': ['mono'],
  'Martian Mono': ['mono'],
  'Fragment Mono': ['mono'],
  'Rubik Mono One': ['mono', 'wide-sans'],
  Anybody: ['grotesk', 'wide-sans'],
  'Roboto Flex': ['grotesk'],
  Recursive: ['grotesk', 'mono'],
  Federant: ['nouveau'],
  Elsie: ['nouveau', 'didone'],
  'Cormorant Unicase': ['nouveau', 'old-style'],
  Metamorphous: ['nouveau', 'uncial'],
  Limelight: ['deco'],
  'Poiret One': ['deco'],
  Federo: ['deco'],
  'Josefin Sans': ['geometric-sans', 'deco'],
  Jost: ['geometric-sans'],
  Shrikhand: ['neon', 'fat-face'],
  Fascinate: ['deco'],
  Monoton: ['neon', 'deco'],
  Righteous: ['rounded', 'techno'],
  'Gravitas One': ['fat-face', 'didone'],
  Rye: ['wood-type'],
  Sancreek: ['wood-type'],
  'Holtwood One SC': ['wood-type', 'slab'],
  Ultra: ['slab', 'fat-face'],
  Bevan: ['slab'],
  UnifrakturMaguntia: ['blackletter'],
  'Uncial Antiqua': ['uncial'],
  Fondamento: ['script'],
  Bangers: ['comic'],
  'Luckiest Guy': ['comic'],
  'Comic Neue': ['comic', 'rounded'],
  Lobster: ['script'],
  Pacifico: ['script', 'brush'],
  'Special Elite': ['typewriter', 'distressed'],
  'Courier Prime': ['typewriter', 'mono'],
  'Permanent Marker': ['handwritten'],
  'Rock Salt': ['handwritten'],
  'Caveat Brush': ['brush', 'handwritten'],
  'Amatic SC': ['handwritten', 'condensed-sans'],
  'Rubik Distressed': ['distressed'],
  'Rubik Wet Paint': ['distressed'],
  'Rubik Glitch': ['glitch'],
  'Black Ops One': ['stencil'],
  'Saira Stencil One': ['stencil'],
  'Big Shoulders Stencil Display': ['stencil', 'condensed-sans'],
  Audiowide: ['techno', 'wide-sans'],
  'Krona One': ['wide-sans'],
  Rajdhani: ['techno'],
  'Share Tech Mono': ['mono', 'techno'],
  'Major Mono Display': ['mono', 'geometric-sans'],
  Tektur: ['techno'],
  'Exo 2': ['techno'],
  'Russo One': ['geometric-sans'],
  Staatliches: ['condensed-sans'],
  Notable: ['wide-sans'],
  Bungee: ['signage'],
  'Bungee Shade': ['signage'],
  VT323: ['pixel', 'mono'],
  'Press Start 2P': ['pixel'],
  Silkscreen: ['pixel'],
  Nunito: ['rounded', 'humanist-sans'],
  Quicksand: ['rounded', 'geometric-sans'],
  Fredoka: ['rounded'],
  Hind: ['humanist-sans'],
  'Rozha One': ['didone'],
  Teko: ['condensed-sans'],
  Sarpanch: ['wide-sans', 'techno'],
  Kalam: ['handwritten'],
  Khand: ['condensed-sans'],
  'Yeseva One': ['didone'],
  'Fjalla One': ['condensed-sans'],
  'Playfair Display SC': ['didone'],
  'Shippori Mincho': ['old-style'],
};
export const classesOf = (face: string): readonly TypeClass[] => FACE_CLASS[graphicFont(face)?.name ?? face] ?? [];

/**
 * The constructions: the spatial grammars a style builds with (compose.ts lays each out). Each is a different way of
 * organising a frame — not a template recoloured — and some carry variants, set by the style that asks for them.
 * `layout` and `rhythm` are what the plan's strategy records; `picture` says whether the construction is built
 * around a picture (it is never required: each has its own way when there is none).
 */
export const CONSTRUCTIONS = {
  'grid-columns': { label: 'Columns on a visible grid', layout: 'column', rhythm: 'regular', variants: ['classic', 'corporate', 'bigtype', 'dutch', 'nordic'] },
  'bauhaus-asym': { label: 'Asymmetric geometric balance', layout: 'asymmetric', rhythm: 'syncopated', variants: ['bauhaus', 'constructivist', 'abstract'] },
  neoplastic: { label: 'Orthogonal bars and primary planes', layout: 'modular', rhythm: 'regular', variants: ['stijl'] },
  'diagonal-dynamic': { label: 'A dynamic diagonal axis', layout: 'diagonal', rhythm: 'syncopated', variants: ['constructivist', 'speed', 'parole', 'kinetic'] },
  'nouveau-arch': { label: 'An ornamental arch and halo', layout: 'centred', rhythm: 'flowing', variants: ['nouveau', 'secession', 'crafts'] },
  'deco-axial': { label: 'A stepped symmetrical axis', layout: 'centred', rhythm: 'radiating', variants: ['deco'] },
  playbill: { label: 'A centred playbill of many faces', layout: 'centred', rhythm: 'stacked', variants: ['victorian', 'vintage'] },
  'masthead-columns': { label: 'A masthead over ruled columns', layout: 'editorial', rhythm: 'regular', variants: ['modernist', 'newspaper', 'mono'] },
  'pop-panel': { label: 'An outlined panel with a burst', layout: 'freeform', rhythm: 'syncopated', variants: ['pop', 'comic', 'halftone'] },
  'op-field': { label: 'An optical field', layout: 'full-bleed', rhythm: 'radiating', variants: ['op'] },
  'psychedelic-flow': { label: 'Warped letters in a pulsing field', layout: 'freeform', rhythm: 'flowing', variants: ['psychedelic'] },
  'memphis-scatter': { label: 'Scattered confetti geometry', layout: 'freeform', rhythm: 'syncopated', variants: ['memphis', 'atomic'] },
  'ransom-collage': { label: 'Cut, pasted and photocopied', layout: 'collage', rhythm: 'syncopated', variants: ['punk', 'dada', 'xerox'] },
  'cut-paper': { label: 'Layered cut-paper shapes', layout: 'layered', rhythm: 'flowing', variants: ['cut'] },
  'surreal-horizon': { label: 'A horizon and a floating object', layout: 'asymmetric', rhythm: 'regular', variants: ['surreal'] },
  'chrome-y2k': { label: 'Chrome forms and sparkles', layout: 'layered', rhythm: 'flowing', variants: ['y2k', 'chrome'] },
  'neon-horizon': { label: 'A neon horizon and a striped sun', layout: 'centred', rhythm: 'radiating', variants: ['synth', 'vapor', 'cyber'] },
  'hud-frame': { label: 'A HUD frame of brackets and readouts', layout: 'modular', rhythm: 'regular', variants: ['cyber', 'technical', 'chrome'] },
  'raw-blocks': { label: 'Outlined blocks with hard shadows', layout: 'modular', rhythm: 'stacked', variants: ['neo', 'web'] },
  'raw-document': { label: 'A raw web document in the default flow', layout: 'column', rhythm: 'stacked', variants: ['web'] },
  'type-wall': { label: 'A wall of type', layout: 'typographic', rhythm: 'stacked', variants: ['brutal', 'swiss', 'newwave', 'experimental', 'flyer', 'futurist'] },
  'window-ui': { label: 'Desktop windows and tiles', layout: 'layered', rhythm: 'syncopated', variants: ['web', 'geocities', 'vapor'] },
  'glitch-slices': { label: 'Sliced and displaced', layout: 'layered', rhythm: 'syncopated', variants: ['glitch'] },
  overprint: { label: 'Overprinted spot inks', layout: 'layered', rhythm: 'syncopated', variants: ['riso', 'print'] },
  'screen-print': { label: 'Flat opaque ink layers', layout: 'layered', rhythm: 'regular', variants: ['screen'] },
  'woodtype-stack': { label: 'Stacked wood type', layout: 'centred', rhythm: 'stacked', variants: ['letterpress', 'hand'] },
  'film-editorial': { label: 'A film frame with edge marks', layout: 'full-bleed', rhythm: 'regular', variants: ['film'] },
  'vertical-axis': { label: 'A vertical axis and one mark', layout: 'asymmetric', rhythm: 'regular', variants: ['japan', 'china'] },
  woodblock: { label: 'Flat planes and a cartouche', layout: 'layered', rhythm: 'flowing', variants: ['ukiyo'] },
  'painted-cinema': { label: 'A painted billboard', layout: 'layered', rhythm: 'radiating', variants: ['cinema'] },
  'concrete-kinetic': { label: 'Systematic progression', layout: 'modular', rhythm: 'radiating', variants: ['concrete'] },
  'flat-symbol': { label: 'One flat symbol', layout: 'centred', rhythm: 'regular', variants: ['indian', 'painterly', 'hand'] },
  'minimal-void': { label: 'A small mark in a large field', layout: 'asymmetric', rhythm: 'regular', variants: ['minimal', 'type', 'nordic'] },
  'luxury-centred': { label: 'A centred, spaced axis', layout: 'centred', rhythm: 'regular', variants: ['editorial', 'product'] },
  'layered-planes': { label: 'Overlapping planes and fragments', layout: 'layered', rhythm: 'syncopated', variants: ['postmodern', 'newwave', 'dada', 'maximal'] },
  'ornate-border': { label: 'An ornamental border', layout: 'centred', rhythm: 'regular', variants: ['crafts', 'victorian'] },
  'organic-arch': { label: 'Arches, leaves and a sun', layout: 'centred', rhythm: 'flowing', variants: ['organic', 'solar'] },
  'soft-glass': { label: 'Glass, gloss and sky', layout: 'layered', rhythm: 'flowing', variants: ['aero', 'holo'] },
  'industrial-hazard': { label: 'Hazard bands and stencils', layout: 'modular', rhythm: 'stacked', variants: ['industrial'] },
  advert: { label: 'An advertisement', layout: 'editorial', rhythm: 'stacked', variants: ['vintage', 'commercial'] },
  'grunge-layers': { label: 'Distressed, layered type', layout: 'layered', rhythm: 'syncopated', variants: ['grunge', 'printmaking'] },
  'editorial-split': { label: 'An asymmetric editorial spread', layout: 'editorial', rhythm: 'syncopated', variants: ['experimental', 'luxury', 'mono'] },
  // compositions SocriaUX already had (Graphics 1.0 and the creative ceiling), which styles may build with too
  collage: { label: 'Pieces cut and laid at angles', layout: 'collage', rhythm: 'syncopated', variants: ['default'] },
  abstract: { label: 'An abstract arrangement of primitives', layout: 'freeform', rhythm: 'regular', variants: ['default'] },
  radial: { label: 'Everything from one centre', layout: 'radial', rhythm: 'radiating', variants: ['default'] },
  technical: { label: 'A measured technical sheet', layout: 'modular', rhythm: 'regular', variants: ['default'] },
  organic: { label: 'Soft forms overlapping', layout: 'freeform', rhythm: 'flowing', variants: ['default'] },
  typographic: { label: 'The words as the composition', layout: 'typographic', rhythm: 'stacked', variants: ['default'] },
  halftone: { label: 'A picture screened into dots', layout: 'image-dominant', rhythm: 'radiating', variants: ['default'] },
} as const;
export type Construction = keyof typeof CONSTRUCTIONS;
export const CONSTRUCTION_IDS = Object.keys(CONSTRUCTIONS) as Construction[];
/** The compositions SocriaUX already laid out before Style Intelligence (compose.ts has them). */
export const EXISTING_CONSTRUCTIONS = ['collage', 'abstract', 'radial', 'technical', 'organic', 'typographic', 'halftone'] as const;
/** The constructions Style Intelligence adds (styles/constructions-*.ts lays each out). */
export type StyleConstruction = Exclude<Construction, (typeof EXISTING_CONSTRUCTIONS)[number]>;
export const STYLE_CONSTRUCTION_IDS = CONSTRUCTION_IDS.filter((c) => !(EXISTING_CONSTRUCTIONS as readonly string[]).includes(c)) as StyleConstruction[];
export const isStyleConstruction = (a: string): a is StyleConstruction => (STYLE_CONSTRUCTION_IDS as readonly string[]).includes(a);

export const COLOUR_SCHEMES = ['primary-triad', 'duotone', 'spot', 'mono', 'neon-dark', 'pastel', 'metallic', 'earth', 'jewel', 'complementary', 'muted', 'fluoro', 'natural', 'full'] as const;
export type ColourScheme = (typeof COLOUR_SCHEMES)[number];
export const GROUND_KINDS = ['paper', 'white', 'black', 'dark', 'colour', 'gradient'] as const;
export type GroundKind = (typeof GROUND_KINDS)[number];
export const GRADIENT_USES = ['none', 'subtle', 'feature', 'metallic', 'iridescent', 'neon', 'sunset', 'sky'] as const;
export type GradientUse = (typeof GRADIENT_USES)[number];
export const BORDERS = ['none', 'rule', 'double-rule', 'frame', 'ornate', 'stepped', 'arch', 'botanical', 'dashed', 'thick'] as const;
export type Border = (typeof BORDERS)[number];
export const CROPS = ['full', 'framed', 'cutout', 'circle', 'arch', 'torn', 'band', 'oval', 'strip'] as const;
export type Crop = (typeof CROPS)[number];
export const TEXTURE_KEYS = ['grain', 'paper', 'misregistration', 'halftone', 'noise', 'distress', 'metallic', 'gloss', 'glow', 'scanlines', 'inkbleed'] as const;
export type TextureKey = (typeof TEXTURE_KEYS)[number];
export const DIMENSIONS = ['typography', 'geometry', 'composition', 'colour', 'texture', 'imagery', 'ornament'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface StyleDNA {
  schema: number;
  id: string;
  name: string;
  category: StyleCategory;
  facets: StyleFacet[];
  // ── identity ──
  era: string;
  description: string;
  context: string;
  related: string[];
  principles: string[];
  uses: string[];
  /** words and phrases that name it (what the interpreter and search read) */
  words: string[];
  /** subjects and occasions it suits, and the tones it carries (what selection reads; never a fixed mapping) */
  suits: string[];
  tone: string[];
  /** the nearest of the vocabulary's own styles, for the code paths that speak in those */
  legacy: StyleKey;
  typography: {
    display: { faces: string[]; classes: TypeClass[]; weight: number; case: 'upper' | 'lower' | 'sentence'; tracking: number; lineHeight: number; italic: boolean };
    body: { faces: string[]; weight: number; tracking: number; lineHeight: number };
    /** how the hierarchy is made: by size, by weight, flat, with many sizes, or inverted (small words leading) */
    hierarchy: 'scale' | 'weight' | 'flat' | 'many-sizes' | 'inverted';
    align: 'left' | 'center' | 'justify' | 'right' | 'mixed';
    density: number;
    /** treatments in the vocabulary's terms, then the construction's own */
    treatments: string[];
    breaking: 'natural' | 'word-per-line' | 'stepped' | 'balanced' | 'broken';
    /** how many faces a design in it may use */
    maxFaces: number;
  };
  geometry: {
    families: string[];
    motifs: string[];
    complexity: number;
    symmetry: number;
    curvature: number;
    angularity: number;
    repetition: number;
    /** 0 organic … 100 rigid */
    rigidity: number;
    relation: 'overlapping' | 'interlocking' | 'scattered' | 'aligned' | 'radiating' | 'stacked' | 'framed' | 'floating';
  };
  composition: {
    constructions: Construction[];
    variant: string;
    grid: 'columns' | 'modular' | 'axial' | 'diagonal' | 'radial' | 'free' | 'frame' | 'none';
    symmetry: number;
    density: number;
    negativeSpace: number;
    focal: 'type' | 'shape' | 'image' | 'ornament' | 'pattern';
    imageShare: number;
    layering: number;
    overlap: number;
    rhythm: 'regular' | 'syncopated' | 'radiating' | 'flowing' | 'stacked' | 'chaotic';
  };
  colour: {
    scheme: ColourScheme;
    /** the convention, as hex: a starting point the planner may move within `variation`, never a fixed palette */
    ground: string;
    ink: string;
    accent: string;
    accent2: string;
    accent3: string;
    groundKind: GroundKind;
    contrast: number;
    saturation: number;
    variation: number;
    /** a brand's colours: mapped into the style's range, adopted exactly, or (rarely) set aside */
    brand: 'map' | 'adopt' | 'ignore';
    gradient: GradientUse;
  };
  texture: Record<TextureKey, number>;
  imagery: { photo: number; illustration: number; collage: number; treatments: string[]; crop: Crop; mask: string; placement: 'centre' | 'top' | 'side' | 'scattered' | 'background'; density: number };
  ornament: { density: number; motifs: string[]; border: Border; flourish: number; patterns: string[]; structural: boolean };
  constraints: { essential: string[]; optional: string[]; mistakes: string[]; incompatible: string[]; overuse: string[]; readability: string; authenticity: string };
  /** what generating it needs from SocriaUX (derived from the rest, so it can never disagree with it) */
  generation: { primitives: string[]; effects: string[]; patterns: string[]; constructions: Construction[]; typeOps: string[]; requires: string[]; fallbacks: string[] };
}

/** Incompatibility tags a profile may name (besides effect kinds and style ids). */
export const INCOMPATIBLE_TAGS = [
  'gradient',
  'soft-shadow',
  'rounded',
  'glow',
  'script',
  'serif',
  'sans',
  'ornament',
  'texture',
  'photo',
  'symmetry',
  'asymmetry',
  'pastel',
  'neon',
  'metallic',
  'grid',
  'curves',
  'diagonal',
  'clutter',
  'whitespace',
  'distress',
  'gloss',
] as const;

// ── validation ──

const str = (v: unknown, max: number, d = ''): string =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : d;
const strs = (v: unknown, maxItems: number, maxLen: number): string[] => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, maxLen)).filter(Boolean))].slice(0, maxItems) : []);
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : d);
const hex = (v: unknown, d: string): string => parseColor(v)?.slice(0, 7) ?? d;
const o = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const slugOf = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

const LEGACY: readonly StyleKey[] = [
  'swiss',
  'brutalist',
  'luxury',
  'experimental',
  'minimal',
  'maximal',
  'organic',
  'geometric',
  'technical',
  'cinematic',
  'retro',
  'futuristic',
  'editorial',
  'halftone',
  'collage',
  'typographic',
  'abstract',
  'soft',
  'angular',
  'procedural',
  'monochrome',
  'scientific',
  'playful',
  'packaging',
];

/** The first face Graphics offers in a class: what a profile falls back to when its named faces are unknown. */
function faceOfClass(classes: readonly TypeClass[], body: boolean): string {
  for (const c of classes) {
    const f = GRAPHIC_FONTS.find((g) => (FACE_CLASS[g.name] ?? []).includes(c) && (!body || !g.displayOnly));
    if (f) return f.name;
  }
  return body ? 'Inter' : 'Inter';
}

const faceList = (v: unknown, notes: string[], body: boolean): string[] => {
  const out: string[] = [];
  for (const f of strs(v, 6, 60)) {
    const g = graphicFont(f);
    if (!g) notes.push(`A face SocriaUX cannot load (“${f}”) was left out.`);
    else if (body && g.displayOnly) notes.push(`${g.name} is drawn for headlines only, so it is not used for text.`);
    else out.push(g.name);
  }
  return [...new Set(out)];
};
const known = (v: unknown, has: (k: string) => boolean, what: string, notes: string[], max = 12): string[] => {
  const out: string[] = [];
  for (const k of strs(v, max * 2, 40)) {
    if (has(k)) out.push(k);
    else notes.push(`${what} SocriaUX does not have (“${k}”) was left out.`);
  }
  return [...new Set(out)].slice(0, max);
};

/**
 * A profile held to the schema and to what SocriaUX can draw (see the head of this file). Idempotent: a normalized
 * profile normalizes to itself. Returns null when there is not even a name to call it by.
 */
export function normalizeStyleDNA(raw: unknown, notes: string[] = []): StyleDNA | null {
  const r = o(raw);
  const name = str(r.name, 60);
  if (!name) {
    notes.push('A style without a name was not used.');
    return null;
  }
  const id = slugOf(str(r.id, 48) || name) || 'style';
  const t = o(r.typography);
  const td = o(t.display);
  const tb = o(t.body);
  const g = o(r.geometry);
  const c = o(r.composition);
  const col = o(r.colour);
  const tx = o(r.texture);
  const im = o(r.imagery);
  const orn = o(r.ornament);
  const con = o(r.constraints);
  const gen = o(r.generation);
  const classes = strs(td.classes, 4, 20).filter((x): x is TypeClass => (TYPE_CLASSES as readonly string[]).includes(x));
  const display = faceList(td.faces, notes, false);
  if (!display.length) display.push(faceOfClass(classes.length ? classes : ['grotesk'], false));
  const body = faceList(tb.faces, notes, true);
  if (!body.length) body.push(faceOfClass(['grotesk'], true));
  const constructions = known(c.constructions, (k) => k in CONSTRUCTIONS, 'A construction', notes, 4) as Construction[];
  if (!constructions.length) constructions.push('grid-columns');
  const allVariants = constructions.flatMap((k) => CONSTRUCTIONS[k].variants as readonly string[]);
  const motifs = known(g.motifs, (k) => PRIMITIVE_BY_KIND.has(k), 'A shape', notes, 8);
  const ornMotifs = known(orn.motifs, (k) => PRIMITIVE_BY_KIND.has(k), 'An ornament shape', notes, 6);
  const patterns = known(orn.patterns, (k) => PATTERN_BY_KIND.has(k), 'A pattern', notes, 4);
  const treatments = known(im.treatments, (k) => EFFECT_BY_KIND.has(k), 'A picture treatment', notes, 4);
  const texture = Object.fromEntries(TEXTURE_KEYS.map((k) => [k, num(o(tx)[k], 0, 100, 0)])) as Record<TextureKey, number>;
  const incompatible = strs(con.incompatible, 16, 40).filter((k) => (INCOMPATIBLE_TAGS as readonly string[]).includes(k) || EFFECT_BY_KIND.has(k) || /^[a-z0-9-]{2,48}$/.test(k));
  const effects = [...new Set([...treatments, ...textureEffects(texture)])];
  const dna: StyleDNA = {
    schema: STYLE_SCHEMA,
    id,
    name,
    category: pick(r.category, STYLE_CATEGORIES, 'custom'),
    facets: strs(r.facets, 6, 20).filter((x): x is StyleFacet => (STYLE_FACETS as readonly string[]).includes(x)),
    era: str(r.era, 80),
    description: str(r.description, 240),
    context: str(r.context, 480),
    related: strs(r.related, 6, 48).map(slugOf),
    principles: strs(r.principles, 6, 200),
    uses: strs(r.uses, 6, 120),
    words: strs(r.words, 16, 48).map((w) => w.toLowerCase()),
    suits: strs(r.suits, 24, 32).map((w) => w.toLowerCase()),
    tone: strs(r.tone, 8, 24).map((w) => w.toLowerCase()),
    legacy: pick(r.legacy, LEGACY, 'experimental'),
    typography: {
      display: {
        faces: display,
        classes: classes.length ? classes : [...classesOf(display[0])].slice(0, 2),
        weight: num(td.weight, 100, 1000, 600),
        case: pick(td.case, ['upper', 'lower', 'sentence'] as const, 'sentence'),
        tracking: num(td.tracking, -80, 400, 0),
        lineHeight: num(td.lineHeight, 0.7, 1.6, 0.95),
        italic: td.italic === true,
      },
      body: { faces: body, weight: num(tb.weight, 100, 900, 400), tracking: num(tb.tracking, -40, 200, 0), lineHeight: num(tb.lineHeight, 0.9, 2, 1.35) },
      hierarchy: pick(t.hierarchy, ['scale', 'weight', 'flat', 'many-sizes', 'inverted'] as const, 'scale'),
      align: pick(t.align, ['left', 'center', 'justify', 'right', 'mixed'] as const, 'left'),
      density: num(t.density, 0, 100, 40),
      treatments: strs(t.treatments, 6, 24),
      breaking: pick(t.breaking, ['natural', 'word-per-line', 'stepped', 'balanced', 'broken'] as const, 'natural'),
      maxFaces: num(t.maxFaces, 1, 5, 2),
    },
    geometry: {
      families: strs(g.families, 5, 20).filter((x) => ['basic', 'geometric', 'organic', 'decorative', 'technical'].includes(x)),
      motifs,
      complexity: num(g.complexity, 0, 100, 40),
      symmetry: num(g.symmetry, 0, 100, 50),
      curvature: num(g.curvature, 0, 100, 50),
      angularity: num(g.angularity, 0, 100, 50),
      repetition: num(g.repetition, 0, 100, 30),
      rigidity: num(g.rigidity, 0, 100, 50),
      relation: pick(g.relation, ['overlapping', 'interlocking', 'scattered', 'aligned', 'radiating', 'stacked', 'framed', 'floating'] as const, 'aligned'),
    },
    composition: {
      constructions,
      variant: allVariants.includes(str(c.variant, 24)) ? str(c.variant, 24) : allVariants[0],
      grid: pick(c.grid, ['columns', 'modular', 'axial', 'diagonal', 'radial', 'free', 'frame', 'none'] as const, 'columns'),
      symmetry: num(c.symmetry, 0, 100, 40),
      density: num(c.density, 0, 100, 45),
      negativeSpace: num(c.negativeSpace, 0, 100, 40),
      focal: pick(c.focal, ['type', 'shape', 'image', 'ornament', 'pattern'] as const, 'type'),
      imageShare: num(c.imageShare, 0, 100, 40),
      layering: num(c.layering, 0, 100, 30),
      overlap: num(c.overlap, 0, 100, 20),
      rhythm: pick(c.rhythm, ['regular', 'syncopated', 'radiating', 'flowing', 'stacked', 'chaotic'] as const, 'regular'),
    },
    colour: {
      scheme: pick(col.scheme, COLOUR_SCHEMES, 'full'),
      ground: hex(col.ground, '#f4f1ea'),
      ink: hex(col.ink, '#161512'),
      accent: hex(col.accent, '#d9472b'),
      accent2: hex(col.accent2, '#2a4fd6'),
      accent3: hex(col.accent3, hex(col.accent2, '#2a4fd6')),
      groundKind: pick(col.groundKind, GROUND_KINDS, 'paper'),
      contrast: num(col.contrast, 0, 100, 70),
      saturation: num(col.saturation, 0, 100, 60),
      variation: num(col.variation, 0, 100, 20),
      brand: pick(col.brand, ['map', 'adopt', 'ignore'] as const, 'map'),
      gradient: pick(col.gradient, GRADIENT_USES, 'none'),
    },
    texture,
    imagery: {
      photo: num(im.photo, 0, 100, 50),
      illustration: num(im.illustration, 0, 100, 30),
      collage: num(im.collage, 0, 100, 10),
      treatments,
      crop: pick(im.crop, CROPS, 'full'),
      mask: PRIMITIVE_BY_KIND.has(str(im.mask, 40)) ? str(im.mask, 40) : '',
      placement: pick(im.placement, ['centre', 'top', 'side', 'scattered', 'background'] as const, 'top'),
      density: num(im.density, 0, 100, 30),
    },
    ornament: { density: num(orn.density, 0, 100, 10), motifs: ornMotifs, border: pick(orn.border, BORDERS, 'none'), flourish: num(orn.flourish, 0, 100, 0), patterns, structural: orn.structural !== false },
    constraints: {
      essential: strs(con.essential, 6, 200),
      optional: strs(con.optional, 6, 200),
      mistakes: strs(con.mistakes, 6, 200),
      incompatible,
      overuse: strs(con.overuse, 4, 200),
      readability: str(con.readability, 240),
      authenticity: str(con.authenticity, 300),
    },
    generation: {
      primitives: [...new Set([...motifs, ...ornMotifs])],
      effects,
      patterns,
      constructions,
      typeOps: [
        ...new Set([
          ...strs(t.treatments, 6, 24),
          td.case === 'upper' ? 'uppercase' : td.case === 'lower' ? 'lowercase' : 'sentence case',
          num(td.tracking, -80, 400, 0) >= 120 ? 'wide tracking' : num(td.tracking, -80, 400, 0) <= -20 ? 'tight tracking' : 'normal tracking',
        ]),
      ],
      requires: [...new Set(['svg text', ...(effects.length ? ['svg filters'] : []), ...(patterns.length ? ['pattern generators'] : []), ...(display.some((f) => !['Inter'].includes(f)) ? ['web fonts'] : [])])],
      fallbacks: strs(gen.fallbacks, 4, 200),
    },
  };
  return dna;
}

/** The effects a texture asks for (what generation needs; the composer places them, styles/apply.ts). */
export function textureEffects(t: Partial<Record<TextureKey, number>>): string[] {
  const out: string[] = [];
  if ((t.grain ?? 0) >= 15 || (t.paper ?? 0) >= 40) out.push('grain');
  if ((t.noise ?? 0) >= 15) out.push('noise');
  if ((t.misregistration ?? 0) >= 15) out.push('misregistration');
  if ((t.halftone ?? 0) >= 30) out.push('halftone');
  if ((t.distress ?? 0) >= 20) out.push('distress');
  if ((t.inkbleed ?? 0) >= 20) out.push('ink-bleed');
  if ((t.glow ?? 0) >= 20) out.push('glow');
  if ((t.gloss ?? 0) >= 30) out.push('glass');
  return out;
}

/** Whether a profile is fully drawable as written: nothing in it had to be left out. */
export function validateStyleDNA(raw: unknown): { ok: boolean; dna: StyleDNA | null; notes: string[] } {
  const notes: string[] = [];
  const dna = normalizeStyleDNA(raw, notes);
  return { ok: !!dna && !notes.length, dna, notes };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly (infer U)[] ? readonly U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
/** A profile as it is written (styles/library-*.ts, custom styles): every field optional, enums typed, held to the
 * schema by normalizeStyleDNA. */
export type StyleInput = DeepPartial<Omit<StyleDNA, 'schema' | 'generation'>> & { generation?: { fallbacks?: readonly string[] } };
