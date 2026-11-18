// lib/ux-v0/direction.ts — art direction: the decision made before a page is drawn.
//
// WHY THIS EXISTS (docs/SOCRIAUX-ART-DIRECTION.md). Generated designs converged
// because nothing decided what a page should look like before sections were
// filled: every brief met the same stylesheet with a new palette. An art
// direction is that decision, made explicitly and shown to the designer:
// a visual language (how type, grid, surfaces, imagery and motifs behave), a
// palette and a type pair, a concept, a voice for the copy, and what it
// refuses to do. The designer can take one of three, edit any part, lock what
// they have decided, or let SocriaUX choose.
//
// THE ENGINE is deterministic and free: twelve visual languages, each a
// coherent system rather than a theme, scored for fit against the brief and
// the designer's own notes, then chosen for DIFFERENCE — the first is the most
// faithful reading of the brief (its palette and type exactly as approved),
// the second the strongest alternative that is visibly unlike the first, the
// third the most different that still fits. The model, when it is available,
// writes the concept and voice for those three and may refine their faces;
// the engine holds everything it returns to the same rules.
//
// LOCKS are the designer's: a locked group (colours, type, layout, surfaces,
// imagery, motifs, voice) survives asking again, regenerating and refining —
// a change to it is never made silently.

import { contrastRatio } from '../ux/audit';
import { hslHex, hslOf, hueDistance, isDark, mix } from './color';
import { FONTS, knownFont, nearestWeight } from './fonts';
import {
  DEFAULT_TOKENS,
  ensureContrast,
  kindDef,
  lookFromTokens,
  normalizeLook,
  normalizeTokens,
  STILL_MOTION,
  type DesignSpec,
  type DesignTokens,
  type Look,
  type Motion,
  type Pad,
  type Patch,
  type Section,
  type Tone,
} from './spec';
import type { DesignBrief } from './types';
import { motionFor, readMotionWords } from './motion';
import { paletteFromSwatches, type BoardReading } from './references';

// ── the visual languages ─────────────────────────────────────────────

type Alt<T> = readonly T[];
type PaletteStrategy = 'paper' | 'white' | 'dark' | 'tinted' | 'ink';

interface Ctx {
  audience: string;
  what: string;
  mood: string;
}

export interface Language {
  id: string;
  name: string;
  /** one line: what it is, for the designer and the model */
  blurb: string;
  keywords: readonly string[];
  /** broad qualities a designer may say they want to avoid */
  traits: readonly string[];
  display: readonly string[];
  body: readonly string[];
  mono: readonly string[];
  palette: PaletteStrategy;
  scale: Alt<DesignTokens['scale']>;
  radius: Alt<DesignTokens['radius']>;
  treatment: Alt<DesignTokens['imageTreatment']>;
  style: DesignTokens['style'];
  look: {
    ratio: Alt<number>;
    weight: Alt<number>;
    case: Alt<Look['case']>;
    tracking: Alt<Look['tracking']>;
    emphasis: Alt<Look['emphasis']>;
    label: Alt<Look['label']>;
    grid: Alt<Look['grid']>;
    align: Alt<Look['align']>;
    width: Alt<Look['width']>;
    rhythm: Alt<Look['rhythm']>;
    containers: Alt<Look['containers']>;
    rules: Alt<Look['rules']>;
    buttons: Alt<Look['buttons']>;
    frame: Alt<Look['frame']>;
    motifs: Alt<Look['motifs']>;
    shapes: Alt<Look['shapes']>;
  };
  /** a second ink: the accent's hue turned by `turn` degrees at this saturation and lightness (for a light ground), or none */
  accent2: { turn: number; s: number; l: number } | null;
  /** how it moves: the feels that belong to it, best first, and what it does its own way */
  motion: Alt<Motion['feel']>;
  moTweak?: Partial<Motion>;
  /** section variants that speak this language, best first */
  prefer: Record<string, readonly string[]>;
  /** the grounds sections sit on */
  tones: { alternate: boolean; cta?: Tone; stats?: Tone; quote?: Tone; logos?: Tone };
  concept: (c: Ctx) => string;
  voice: string;
  composition: string;
  imagery: string;
  avoid: readonly string[];
}

export const LANGUAGES: readonly Language[] = [
  {
    id: 'broadsheet',
    name: 'Broadsheet',
    blurb: 'a printed review: serif headlines with italic emphasis, heads in a side column, hairline rules, numbered sections, captioned photographs',
    keywords: ['editorial', 'news', 'journal', 'magazine', 'story', 'stories', 'writing', 'writer', 'literary', 'publication', 'essay', 'research', 'report', 'thoughtful', 'considered', 'trusted', 'authority', 'intelligent', 'academic', 'book', 'reading', 'press', 'print', 'archive', 'history', 'heritage', 'serious', 'law', 'policy', 'knowledge', 'insight'],
    traits: ['serif', 'light', 'quiet', 'classic', 'traditional'],
    display: ['Newsreader', 'Source Serif 4', 'Libre Baskerville', 'Playfair Display', 'EB Garamond', 'Spectral'],
    body: ['Source Serif 4', 'Newsreader', 'Public Sans', 'IBM Plex Sans', 'Inter'],
    mono: ['IBM Plex Mono'],
    palette: 'paper',
    scale: ['comfortable'],
    radius: ['none'],
    treatment: ['mono', 'muted'],
    style: 'editorial',
    look: {
      ratio: [1.333, 1.25, 1.414], weight: [500, 400, 600], case: ['sentence'], tracking: ['tight'], emphasis: ['italic'], label: ['rule', 'caps'],
      grid: ['editorial'], align: ['left'], width: ['wide', 'standard'], rhythm: ['even'], containers: ['ruled'], rules: ['hairline', 'heavy'], buttons: ['underline', 'solid'],
      frame: ['plain'], motifs: [['numbering', 'captions', 'pull-quote'], ['captions', 'pull-quote']], shapes: [[]],
    },
    accent2: null,
    motion: ['measured', 'calm'], moTweak: { hover: 'underline', parallax: 0, headline: 'mask', sections: 'none' },
    prefer: { hero: ['editorial', 'statement', 'split'], features: ['index', 'columns', 'numbered'], quote: ['pull', 'large'], stats: ['row'], cta: ['statement', 'band'], text: ['two-column', 'lead'], gallery: ['mosaic', 'grid'], split: ['image-left', 'image-right'], faq: ['two-column', 'accordion'], list: ['simple', 'schedule', 'menu'] },
    tones: { alternate: false },
    concept: (c) => `A considered broadsheet for ${c.audience}: serif headlines, heads set in a side column and hairline rules, so ${c.what} reads like something written, not sold.`,
    voice: 'Measured and exact, like a good editor: short declarative headlines, one idea per paragraph, italics for the word that matters.',
    composition: 'Section heads sit in a narrow left column beside their text; rules divide the page into an index a reader can scan.',
    imagery: 'Documentary photographs, black and white or muted, captioned like plates.',
    avoid: ['a centred hero over a gradient', 'icon cards in rows', 'pill buttons'],
  },
  {
    id: 'swiss',
    name: 'Swiss grid',
    blurb: 'the international typographic style: one grotesk, big flush-left type, a strict column grid, heavy rules, one loud colour',
    keywords: ['modern', 'precise', 'systematic', 'rational', 'architecture', 'architect', 'engineering', 'clear', 'clarity', 'structured', 'structure', 'functional', 'design', 'studio', 'agency', 'confident', 'direct', 'bold', 'graphic', 'typography', 'consultancy', 'objective', 'transport', 'museum', 'exhibition'],
    traits: ['sans', 'light', 'loud', 'minimal', 'corporate', 'graphic'],
    display: ['Archivo', 'Inter', 'Hanken Grotesk', 'Work Sans', 'Instrument Sans', 'Public Sans'],
    body: ['Inter', 'Hanken Grotesk', 'Work Sans', 'Public Sans', 'Archivo'],
    mono: ['JetBrains Mono', 'IBM Plex Mono'],
    palette: 'white',
    scale: ['comfortable'],
    radius: ['none'],
    treatment: ['mono', 'contrast'],
    style: 'bold',
    look: {
      ratio: [1.5, 1.414, 1.618], weight: [700, 600, 800], case: ['sentence'], tracking: ['tight'], emphasis: ['accent', 'none'], label: ['quiet', 'mono'],
      grid: ['swiss'], align: ['left'], width: ['wide'], rhythm: ['dramatic'], containers: ['open'], rules: ['heavy'], buttons: ['block', 'solid'],
      frame: ['plain'], motifs: [['numbering', 'big-numerals'], ['big-numerals']], shapes: [[]],
    },
    accent2: null,
    motion: ['lively', 'measured'], moTweak: { entrance: 'slide', ease: 'snap', hover: 'invert', sections: 'wipe', headline: 'mask', parallax: 0 },
    prefer: { hero: ['statement', 'split', 'editorial'], features: ['columns', 'numbered', 'index'], quote: ['pull'], stats: ['giant', 'row'], cta: ['statement', 'band'], text: ['two-column', 'lead'], gallery: ['grid'], faq: ['two-column'], list: ['simple', 'schedule'] },
    tones: { alternate: false, cta: 'accent' },
    concept: (c) => `A strict typographic system for ${c.audience}: one grotesk, a hard column grid and a single loud colour, so ${c.what} feels exact and certain.`,
    voice: 'Direct and factual. Headlines are statements of fact; numbers carry the argument.',
    composition: 'Everything hangs flush left from one grid; huge headlines, heavy rules over each section, and generous empty columns.',
    imagery: 'Few, large photographs in high-contrast black and white, cropped hard to the grid.',
    avoid: ['rounded corners', 'centred everything', 'decorative icons', 'soft shadows'],
  },
  {
    id: 'quiet-luxury',
    name: 'Quiet luxury',
    blurb: 'a hotel or atelier: light high-contrast serif, centred and slow, wide margins, small spaced capitals, framed photographs, almost no colour',
    keywords: ['luxury', 'luxurious', 'elegant', 'elegance', 'refined', 'premium', 'exclusive', 'hotel', 'resort', 'spa', 'fashion', 'jewellery', 'jewelry', 'atelier', 'boutique', 'timeless', 'understated', 'sophisticated', 'bespoke', 'couture', 'wine', 'fine', 'calm', 'serene', 'private', 'villa', 'wedding', 'perfume', 'beauty'],
    traits: ['serif', 'light', 'quiet', 'classic', 'minimal', 'centred'],
    display: ['Cormorant Garamond', 'Bodoni Moda', 'Instrument Serif', 'Playfair Display'],
    body: ['Instrument Sans', 'Hanken Grotesk', 'Work Sans', 'Karla', 'EB Garamond'],
    mono: ['IBM Plex Mono'],
    palette: 'paper',
    scale: ['spacious'],
    radius: ['none'],
    treatment: ['warm', 'muted'],
    style: 'minimal',
    look: {
      ratio: [1.25, 1.333], weight: [400, 300], case: ['sentence', 'upper'], tracking: ['normal', 'wide'], emphasis: ['italic'], label: ['caps'],
      grid: ['centered'], align: ['center'], width: ['narrow', 'standard'], rhythm: ['even'], containers: ['open'], rules: ['hairline', 'none'], buttons: ['underline', 'outline'],
      frame: ['inset', 'arch'], motifs: [['captions'], []], shapes: [[]],
    },
    accent2: null,
    motion: ['calm'], moTweak: { duration: 1150, ease: 'gentle', entrance: 'fade', headline: 'fade', parallax: 1, hover: 'zoom', distance: 10 },
    prefer: { hero: ['full-bleed', 'centered', 'split'], features: ['columns', 'list'], quote: ['large'], stats: ['row'], cta: ['centered', 'statement'], text: ['narrow', 'lead'], gallery: ['strip', 'mosaic'], split: ['image-left', 'image-right'], faq: ['accordion'], list: ['menu', 'simple'] },
    tones: { alternate: false, quote: 'alt', cta: 'alt' },
    concept: (c) => `Quiet luxury for ${c.audience}: light serif type, wide margins and very little colour, so ${c.what} feels unhurried and certain of its worth.`,
    voice: 'Few words, carefully chosen. Never a superlative, never urgency; describe the experience, not the offer.',
    composition: 'Centred and slow: one idea per screen, generous space above and below, photographs framed with a margin.',
    imagery: 'Warm, natural-light photographs of rooms, materials and details, given room to breathe.',
    avoid: ['bold sans headlines', 'bright colour', 'badges and counters', 'busy grids'],
  },
  {
    id: 'poster',
    name: 'Poster',
    blurb: 'a gig poster or campaign: enormous condensed capitals, colour bands edge to edge, a running marquee, giant numerals, duotone photographs',
    keywords: ['bold', 'loud', 'energetic', 'energy', 'festival', 'event', 'events', 'music', 'gig', 'concert', 'youth', 'young', 'campaign', 'launch', 'sport', 'sports', 'fitness', 'protest', 'activism', 'culture', 'street', 'urban', 'club', 'tickets', 'tour', 'exciting', 'vibrant', 'playful', 'fun', 'loud', 'brave', 'rebellious'],
    traits: ['sans', 'loud', 'colourful', 'playful', 'heavy'],
    display: ['Anton', 'Archivo', 'Big Shoulders Display', 'Bricolage Grotesque', 'Unbounded'],
    body: ['Archivo', 'Inter', 'Space Grotesk', 'Work Sans'],
    mono: ['Space Mono', 'JetBrains Mono'],
    palette: 'white',
    scale: ['comfortable'],
    radius: ['none'],
    treatment: ['duotone', 'contrast'],
    style: 'bold',
    look: {
      ratio: [1.618, 1.5], weight: [800, 900, 700], case: ['upper'], tracking: ['tight'], emphasis: ['highlight', 'accent'], label: ['mono', 'caps'],
      grid: ['poster'], align: ['left'], width: ['wide'], rhythm: ['dramatic'], containers: ['bands'], rules: ['heavy'], buttons: ['block', 'offset'],
      frame: ['plain', 'offset'], motifs: [['marquee', 'big-numerals', 'shapes'], ['marquee', 'big-numerals']], shapes: [['circle', 'square'], ['diamond', 'circle']],
    },
    accent2: { turn: 40, s: 0.85, l: 0.56 },
    motion: ['kinetic', 'lively'], moTweak: { hover: 'invert', sections: 'expand' },
    prefer: { hero: ['poster', 'statement', 'full-bleed'], features: ['numbered', 'index'], quote: ['pull'], stats: ['giant', 'band'], cta: ['statement', 'band'], text: ['lead'], gallery: ['strip', 'grid'], faq: ['accordion'], list: ['schedule', 'simple'] },
    tones: { alternate: true, stats: 'invert', quote: 'accent2', cta: 'accent' },
    concept: (c) => `A poster for ${c.audience}: headlines as big as the screen allows, colour bands edge to edge and a running marquee, so ${c.what} is impossible to scroll past.`,
    voice: 'Short, loud and specific: headlines of three to six words, verbs first, dates and places spelled out.',
    composition: 'Full-width bands of colour, each carrying one huge statement; numbers set as giant numerals; very little body copy.',
    imagery: 'Photographs pushed into two-colour duotone, cropped tight, overlapping the colour fields.',
    avoid: ['small polite headlines', 'thin hairline rules', 'soft pastel cards', 'stock photos left in natural colour'],
  },
  {
    id: 'craft',
    name: 'Hand and table',
    blurb: 'a café, bakery or maker: warm soft serif, cream ground, arched photographs, pill buttons, menus set as ruled lists',
    keywords: ['warm', 'handmade', 'artisan', 'artisanal', 'local', 'cosy', 'cozy', 'coffee', 'cafe', 'café', 'bakery', 'bread', 'food', 'restaurant', 'kitchen', 'community', 'honest', 'craft', 'crafted', 'maker', 'small', 'family', 'friendly', 'neighbourhood', 'neighborhood', 'welcoming', 'homely', 'farm', 'market', 'florist', 'ceramics', 'pottery', 'brewery', 'shop'],
    traits: ['serif', 'light', 'rounded', 'warm', 'playful'],
    display: ['Fraunces', 'Young Serif', 'DM Serif Display', 'Lora'],
    body: ['Karla', 'DM Sans', 'Work Sans', 'Hanken Grotesk'],
    mono: ['Space Mono'],
    palette: 'tinted',
    scale: ['comfortable'],
    radius: ['round'],
    treatment: ['warm', 'natural'],
    style: 'warm',
    look: {
      ratio: [1.333, 1.414], weight: [600, 500], case: ['sentence'], tracking: ['normal', 'tight'], emphasis: ['italic'], label: ['sentence'],
      grid: ['asymmetric'], align: ['left'], width: ['standard'], rhythm: ['even'], containers: ['framed', 'cards'], rules: ['hairline'], buttons: ['pill'],
      frame: ['arch', 'circle'], motifs: [['shapes', 'captions'], ['shapes']], shapes: [['arch', 'circle'], ['circle', 'blob']],
    },
    accent2: { turn: 35, s: 0.5, l: 0.72 },
    motion: ['calm', 'measured'], moTweak: { hover: 'lift', entrance: 'rise', parallax: 1 },
    prefer: { hero: ['split', 'editorial', 'centered'], features: ['list', 'grid'], quote: ['with-portrait', 'large'], stats: ['row'], cta: ['image', 'band'], text: ['narrow', 'lead'], gallery: ['mosaic', 'grid'], list: ['menu', 'schedule'], split: ['image-left', 'image-right'], faq: ['accordion'] },
    tones: { alternate: true, cta: 'accent', quote: 'alt' },
    concept: (c) => `A warm, hand-set page for ${c.audience}: a soft serif, a cream ground and photographs in arched frames, so ${c.what} feels like a place you already know.`,
    voice: 'Warm and plain, like the person behind the counter: specific about what is made, how and when.',
    composition: 'An asymmetric, relaxed layout; arches and circles echo the photographs; the menu or list set out like a printed card.',
    imagery: 'Close, warm natural-light photographs of hands, materials and the place itself.',
    avoid: ['cold blue tech colours', 'hard square boxes', 'stock smiling teams', 'all-caps shouting'],
  },
  {
    id: 'geometric',
    name: 'Geometric paper',
    blurb: 'paper and ink with flat geometric shapes: a scholarly serif for voice, a precise grotesk for everything operated, pill controls, flat colour fields, no shadows or gradients',
    keywords: ['thoughtful', 'intelligent', 'curious', 'learning', 'education', 'school', 'conversation', 'ideas', 'thinking', 'clarity', 'clear', 'friendly', 'product', 'tool', 'software', 'ai', 'platform', 'question', 'questions', 'reasoning', 'calm', 'honest', 'socratic', 'philosophy', 'study', 'students', 'teachers', 'knowledge', 'collaboration', 'creative', 'humane'],
    traits: ['serif', 'light', 'colourful', 'geometric', 'playful'],
    display: ['Cormorant Garamond', 'Old Standard TT', 'Instrument Serif', 'Newsreader'],
    body: ['Geist', 'Instrument Sans', 'Inter', 'Hanken Grotesk'],
    mono: ['Geist Mono', 'IBM Plex Mono'],
    palette: 'paper',
    scale: ['comfortable'],
    radius: ['soft'],
    treatment: ['natural', 'muted'],
    style: 'editorial',
    look: {
      ratio: [1.414, 1.333], weight: [400, 700], case: ['sentence'], tracking: ['tight'], emphasis: ['italic'], label: ['sentence'],
      grid: ['asymmetric', 'editorial'], align: ['left'], width: ['wide'], rhythm: ['dramatic'], containers: ['bands', 'open'], rules: ['hairline'], buttons: ['pill'],
      frame: ['arch', 'circle'], motifs: [['shapes', 'numbering'], ['shapes']], shapes: [['arch', 'circle', 'quarter', 'square', 'diamond'], ['circle', 'quarter', 'square']],
    },
    accent2: { turn: -60, s: 0.78, l: 0.66 },
    motion: ['measured'], moTweak: { duration: 320, stagger: 60, distance: 12, ease: 'out', entrance: 'rise', headline: 'mask', hover: 'lift', parallax: 1, sections: 'none' },
    prefer: { hero: ['statement', 'split', 'editorial'], features: ['columns', 'numbered', 'index'], quote: ['pull', 'large'], stats: ['giant', 'row'], cta: ['statement', 'band'], text: ['lead', 'two-column'], gallery: ['mosaic'], faq: ['two-column', 'accordion'], list: ['simple'] },
    tones: { alternate: false, cta: 'accent', stats: 'accent2', quote: 'alt' },
    concept: (c) => `Paper, ink and a few flat shapes for ${c.audience}: a scholarly serif asks, a precise grotesk answers, so ${c.what} feels thoughtful and open rather than technical.`,
    voice: 'Curious and exact: headlines can be questions; sentences are short and plainly helpful.',
    composition: 'Large serif statements on paper, flat geometric shapes as signposts, whole sections set on flat colour fields.',
    imagery: 'Few photographs, cropped into arches and circles; shapes do the illustrating.',
    avoid: ['gradients and glows', 'drop shadows', 'letter-spaced capitals', 'robot or circuit imagery'],
  },
  {
    id: 'utility',
    name: 'Instrument panel',
    blurb: 'a developer tool or data product: a technical grotesk with mono labels, a modular ruled grid, dense and exact, outline controls',
    keywords: ['technical', 'developer', 'developers', 'data', 'infrastructure', 'api', 'precise', 'engineering', 'efficient', 'saas', 'analytics', 'security', 'tool', 'tools', 'dashboard', 'devops', 'cloud', 'open', 'source', 'code', 'database', 'metrics', 'monitoring', 'automation', 'fintech', 'trading', 'scientific', 'science', 'lab', 'hardware'],
    traits: ['sans', 'mono', 'technical', 'dense', 'corporate'],
    display: ['Space Grotesk', 'IBM Plex Sans', 'Geist', 'Familjen Grotesk', 'Inter'],
    body: ['IBM Plex Sans', 'Inter', 'Geist'],
    mono: ['JetBrains Mono', 'IBM Plex Mono', 'Geist Mono', 'Space Mono'],
    palette: 'white',
    scale: ['compact'],
    radius: ['none', 'soft'],
    treatment: ['mono', 'natural'],
    style: 'technical',
    look: {
      ratio: [1.25, 1.2], weight: [600, 500], case: ['sentence'], tracking: ['tight', 'normal'], emphasis: ['accent'], label: ['mono'],
      grid: ['modular'], align: ['left'], width: ['wide'], rhythm: ['even'], containers: ['ruled', 'framed'], rules: ['hairline'], buttons: ['outline', 'solid'],
      frame: ['plain'], motifs: [['numbering', 'icons'], ['numbering']], shapes: [[]],
    },
    accent2: null,
    motion: ['measured'], moTweak: { duration: 220, stagger: 30, distance: 8, ease: 'snap', entrance: 'fade', headline: 'fade', parallax: 0, hover: 'underline', sections: 'none' },
    prefer: { hero: ['statement', 'split'], features: ['grid', 'index'], quote: ['large'], stats: ['row', 'band'], cta: ['band', 'statement'], text: ['two-column'], faq: ['two-column'], list: ['schedule', 'simple'], gallery: ['grid'] },
    tones: { alternate: false, cta: 'invert' },
    concept: (c) => `An instrument panel for ${c.audience}: mono labels, a modular ruled grid and exact numbers, so ${c.what} reads as something built carefully.`,
    voice: 'Exact and unadorned: say what it does, with numbers; no metaphors.',
    composition: 'A modular grid of ruled cells; labels in mono; dense but ordered, like good documentation.',
    imagery: 'Product interface, diagrams or none at all; never stock photographs of people at laptops.',
    avoid: ['stock photos of people pointing at screens', 'purple-to-blue gradients', 'vague hero claims'],
  },
  {
    id: 'gallery',
    name: 'White cube',
    blurb: 'a gallery or portfolio: images first, small precise type, asymmetric placement, almost no ornament, generous white space',
    keywords: ['art', 'artist', 'gallery', 'photography', 'photographer', 'portfolio', 'architecture', 'architect', 'minimal', 'minimalist', 'curated', 'visual', 'exhibition', 'museum', 'studio', 'design', 'designer', 'interiors', 'interior', 'furniture', 'objects', 'collection', 'film', 'fashion', 'images', 'work', 'projects', 'contemporary'],
    traits: ['sans', 'light', 'minimal', 'quiet', 'image-led'],
    display: ['Syne', 'Instrument Serif', 'Familjen Grotesk', 'Instrument Sans', 'Gloock'],
    body: ['Instrument Sans', 'Inter', 'Work Sans', 'Familjen Grotesk'],
    mono: ['IBM Plex Mono', 'Geist Mono'],
    palette: 'white',
    scale: ['spacious'],
    radius: ['none'],
    treatment: ['natural', 'mono'],
    style: 'minimal',
    look: {
      ratio: [1.25, 1.333], weight: [400, 500], case: ['sentence'], tracking: ['normal', 'tight'], emphasis: ['italic', 'none'], label: ['quiet', 'mono'],
      grid: ['asymmetric'], align: ['left'], width: ['wide'], rhythm: ['dramatic'], containers: ['open'], rules: ['none', 'hairline'], buttons: ['underline'],
      frame: ['plain'], motifs: [['captions'], ['captions', 'numbering']], shapes: [[]],
    },
    accent2: null,
    motion: ['calm', 'still'], moTweak: { duration: 1200, entrance: 'fade', headline: 'fade', parallax: 0, hover: 'none', distance: 0 },
    prefer: { hero: ['full-bleed', 'editorial', 'split'], features: ['columns', 'list'], quote: ['large'], stats: ['row'], cta: ['statement'], text: ['narrow', 'two-column'], gallery: ['mosaic', 'strip', 'grid'], split: ['image-right', 'image-left'], faq: ['accordion'], list: ['simple'] },
    tones: { alternate: false },
    concept: (c) => `A white cube for ${c.audience}: the work at full size, small exact type and asymmetric space, so ${c.what} gets out of the way of what it shows.`,
    voice: 'Spare and precise: titles, dates, materials, places. Let the images speak first.',
    composition: 'Images lead, placed off-centre with wide margins; type is small and exact; nothing boxed.',
    imagery: 'The work itself, large, uncropped where possible, captioned with title and year.',
    avoid: ['buttons that shout', 'coloured backgrounds', 'icons', 'rounded cards'],
  },
  {
    id: 'organic',
    name: 'Soft ground',
    blurb: 'wellness and care: a light humane serif, soft tinted grounds, round forms and circle-framed photographs, unhurried spacing',
    keywords: ['calm', 'natural', 'nature', 'wellness', 'wellbeing', 'health', 'organic', 'gentle', 'care', 'caring', 'sustainable', 'sustainability', 'therapy', 'therapist', 'yoga', 'mindful', 'mindfulness', 'soft', 'healing', 'meditation', 'skincare', 'plants', 'garden', 'eco', 'green', 'nurturing', 'kind', 'safe', 'family', 'children', 'baby', 'pregnancy', 'mental'],
    traits: ['serif', 'light', 'rounded', 'soft', 'quiet'],
    display: ['Fraunces', 'Lora', 'Newsreader', 'Cormorant Garamond'],
    body: ['Manrope', 'DM Sans', 'Hanken Grotesk', 'Karla'],
    mono: ['IBM Plex Mono'],
    palette: 'tinted',
    scale: ['spacious'],
    radius: ['round'],
    treatment: ['warm', 'natural'],
    style: 'warm',
    look: {
      ratio: [1.25, 1.333], weight: [400, 300], case: ['sentence'], tracking: ['normal'], emphasis: ['italic'], label: ['sentence'],
      grid: ['centered', 'asymmetric'], align: ['center', 'left'], width: ['standard'], rhythm: ['even'], containers: ['cards'], rules: ['none'], buttons: ['pill'],
      frame: ['circle', 'arch'], motifs: [['shapes'], ['shapes', 'captions']], shapes: [['blob', 'circle'], ['circle', 'arch']],
    },
    accent2: { turn: 40, s: 0.35, l: 0.8 },
    motion: ['calm'], moTweak: { entrance: 'rise', hover: 'lift', parallax: 1, ease: 'gentle' },
    prefer: { hero: ['split', 'centered'], features: ['grid', 'list'], quote: ['with-portrait', 'large'], stats: ['row'], cta: ['band', 'centered'], text: ['narrow'], faq: ['accordion'], list: ['simple', 'schedule'], gallery: ['grid'], split: ['image-left', 'image-right'] },
    tones: { alternate: true, cta: 'accent' },
    concept: (c) => `Soft ground for ${c.audience}: a light humane serif, tinted grounds and round forms, so ${c.what} feels safe to take a first step on.`,
    voice: 'Gentle and reassuring without being vague: say what happens, who you will meet, what it costs.',
    composition: 'Unhurried, with soft tinted bands and rounded cards; circles and organic shapes frame people and places.',
    imagery: 'Natural light, real people and places, warm and unposed; framed in circles and arches.',
    avoid: ['clinical blue', 'hard black rules', 'aggressive urgency', 'tiny dense type'],
  },
  {
    id: 'civic',
    name: 'Public service',
    blurb: 'a public service: a clear civic sans, strong contrast, plain blocks of colour for what matters, big obvious controls, nothing decorative',
    keywords: ['trustworthy', 'trust', 'accessible', 'accessibility', 'public', 'government', 'council', 'healthcare', 'clinic', 'hospital', 'doctor', 'gp', 'nhs', 'nonprofit', 'non-profit', 'charity', 'service', 'services', 'clear', 'inclusive', 'reliable', 'official', 'benefits', 'library', 'transport', 'emergency', 'patients', 'appointments', 'citizens', 'support', 'help', 'advice', 'legal', 'insurance', 'bank', 'pension'],
    traits: ['sans', 'light', 'plain', 'corporate', 'accessible'],
    display: ['Public Sans', 'IBM Plex Sans', 'Source Serif 4', 'Work Sans'],
    body: ['Public Sans', 'Inter', 'IBM Plex Sans'],
    mono: ['IBM Plex Mono'],
    palette: 'white',
    scale: ['comfortable'],
    radius: ['none', 'soft'],
    treatment: ['natural'],
    style: 'minimal',
    look: {
      ratio: [1.25, 1.2], weight: [700, 600], case: ['sentence'], tracking: ['normal'], emphasis: ['none', 'underline'], label: ['sentence'],
      grid: ['stack', 'modular'], align: ['left'], width: ['standard'], rhythm: ['even'], containers: ['bands', 'framed'], rules: ['heavy'], buttons: ['solid'],
      frame: ['plain'], motifs: [['icons', 'numbering'], ['numbering']], shapes: [[]],
    },
    accent2: null,
    motion: ['still', 'calm'], moTweak: { duration: 300, entrance: 'fade', headline: 'none', parallax: 0, hover: 'underline', sections: 'none' },
    prefer: { hero: ['statement', 'split'], features: ['list', 'grid', 'index'], quote: ['large'], stats: ['row', 'band'], cta: ['band'], text: ['narrow'], faq: ['accordion'], list: ['schedule', 'simple'], form: ['stacked', 'split'], gallery: ['grid'] },
    tones: { alternate: true, cta: 'accent', stats: 'alt' },
    concept: (c) => `A clear public service for ${c.audience}: plain language, strong contrast and big obvious actions, so ${c.what} gets everyone to what they came for.`,
    voice: 'Plain English, second person, active verbs: tell people what to do next and what will happen.',
    composition: 'One clear column with strong headings; key actions on solid colour blocks; nothing decorative between a person and the task.',
    imagery: 'Real places and people only where they help; otherwise none.',
    avoid: ['clever headlines', 'low-contrast grey text', 'decoration', 'hidden actions'],
  },
  {
    id: 'night',
    name: 'After dark',
    blurb: 'cinema and nightlife: a dark ground, light type with wide spacing, a single bright accent, high-contrast photographs, a slow marquee',
    keywords: ['dark', 'night', 'nightlife', 'evening', 'cinematic', 'cinema', 'film', 'moody', 'bar', 'cocktail', 'cocktails', 'club', 'jazz', 'theatre', 'theater', 'gaming', 'game', 'futuristic', 'dramatic', 'mysterious', 'sleek', 'premium', 'audio', 'headphones', 'car', 'cars', 'watch', 'whisky', 'whiskey', 'spirits', 'luxury', 'late'],
    traits: ['dark', 'sans', 'dramatic', 'loud'],
    display: ['Bodoni Moda', 'Syne', 'Space Grotesk', 'Unbounded', 'Gloock'],
    body: ['Space Grotesk', 'Inter', 'Manrope', 'Geist'],
    mono: ['Space Mono', 'Geist Mono'],
    palette: 'dark',
    scale: ['spacious'],
    radius: ['none'],
    treatment: ['contrast', 'duotone'],
    style: 'bold',
    look: {
      ratio: [1.414, 1.5], weight: [400, 700], case: ['upper', 'sentence'], tracking: ['wide', 'tight'], emphasis: ['accent', 'italic'], label: ['mono'],
      grid: ['asymmetric', 'poster'], align: ['left'], width: ['wide'], rhythm: ['dramatic'], containers: ['open'], rules: ['hairline'], buttons: ['outline', 'pill'],
      frame: ['plain'], motifs: [['marquee', 'captions'], ['captions', 'numbering']], shapes: [[]],
    },
    accent2: null,
    motion: ['lively', 'calm'], moTweak: { headline: 'mask', parallax: 2, hover: 'zoom', sections: 'wipe' },
    prefer: { hero: ['full-bleed', 'poster', 'statement'], features: ['index', 'numbered'], quote: ['pull'], stats: ['giant'], cta: ['statement', 'image'], text: ['lead'], gallery: ['strip', 'mosaic'], list: ['menu', 'schedule'], faq: ['accordion'] },
    tones: { alternate: false, cta: 'accent' },
    concept: (c) => `After dark for ${c.audience}: a black ground, light type and one bright accent, so ${c.what} feels like the lights going down.`,
    voice: 'Low-voiced and confident: a few evocative words, then the facts — when, where, how to get in.',
    composition: 'Wide asymmetric spaces on a dark ground; huge light headlines; images bleed to the edges.',
    imagery: 'Low-light, high-contrast photographs with deep blacks; colour only from the light sources.',
    avoid: ['white backgrounds', 'pastels', 'friendly rounded shapes', 'cluttered grids'],
  },
  {
    id: 'retro-print',
    name: 'Two-colour print',
    blurb: 'a riso zine or record sleeve: a chunky serif, newsprint ground, two inks, framed boxes with hard offset shadows, stamps and running text',
    keywords: ['retro', 'vintage', 'playful', 'zine', 'quirky', 'indie', 'independent', 'nostalgic', 'print', 'record', 'records', 'vinyl', 'bookshop', 'bookstore', 'brewery', 'beer', 'comics', 'illustration', 'skate', 'bike', 'cycling', 'radio', 'podcast', 'fun', 'cheeky', 'diy', 'punk', 'collective', 'workshop', 'kids', 'toys'],
    traits: ['serif', 'colourful', 'playful', 'retro', 'loud', 'heavy'],
    display: ['Young Serif', 'DM Serif Display', 'Gloock', 'Bricolage Grotesque'],
    body: ['Karla', 'Work Sans', 'IBM Plex Sans', 'Space Grotesk'],
    mono: ['Space Mono'],
    palette: 'ink',
    scale: ['comfortable'],
    radius: ['none'],
    treatment: ['duotone', 'warm'],
    style: 'bold',
    look: {
      ratio: [1.414, 1.333], weight: [400, 700], case: ['sentence', 'upper'], tracking: ['tight', 'normal'], emphasis: ['highlight'], label: ['mono'],
      grid: ['modular', 'poster'], align: ['left'], width: ['standard'], rhythm: ['even'], containers: ['framed'], rules: ['heavy'], buttons: ['offset'],
      frame: ['offset'], motifs: [['shapes', 'marquee', 'numbering'], ['shapes', 'numbering']], shapes: [['circle', 'diamond'], ['square', 'circle']],
    },
    accent2: { turn: 150, s: 0.7, l: 0.5 },
    motion: ['kinetic', 'lively'], moTweak: { entrance: 'slide', hover: 'invert', sections: 'wipe', ease: 'snap' },
    prefer: { hero: ['poster', 'split', 'statement'], features: ['numbered', 'grid'], quote: ['pull', 'large'], stats: ['giant', 'band'], cta: ['band', 'statement'], text: ['lead'], gallery: ['grid', 'mosaic'], list: ['menu', 'schedule'], faq: ['accordion'] },
    tones: { alternate: false, cta: 'accent', stats: 'accent2', quote: 'invert' },
    concept: (c) => `Two inks on newsprint for ${c.audience}: a chunky serif, framed boxes with hard shadows and a running ticker, so ${c.what} feels made by people, not a template.`,
    voice: 'Cheeky and specific: puns allowed if they are good, facts always.',
    composition: 'Framed boxes on a newsprint ground, hard offset shadows, two inks overprinting; a ticker of running text.',
    imagery: 'Photographs printed in duotone, framed with a hard offset shadow; stickers and stamps.',
    avoid: ['glossy gradients', 'thin light type', 'corporate blue', 'soft drop shadows'],
  },
];

const LANG = new Map(LANGUAGES.map((l) => [l.id, l]));
export const languageOf = (id: string): Language | null => LANG.get(id) ?? null;

/** Briefs a language would be wrong for: a surprise is welcome, an inappropriate one is not. */
const CLASHES: Record<string, readonly string[]> = {
  broadsheet: ['kids', 'children', 'toys', 'party', 'nightlife', 'club'],
  swiss: ['cosy', 'cozy', 'handmade', 'rustic', 'baby', 'spa'],
  'quiet-luxury': ['kids', 'children', 'toys', 'budget', 'cheap', 'discount', 'developer', 'api', 'festival', 'punk'],
  poster: ['luxury', 'calm', 'clinic', 'patients', 'therapy', 'legal', 'spa', 'funeral', 'pension', 'bank', 'meditation'],
  craft: ['developer', 'api', 'infrastructure', 'security', 'enterprise', 'legal', 'bank', 'government'],
  geometric: ['funeral'],
  utility: ['coffee', 'cafe', 'café', 'bakery', 'food', 'restaurant', 'wedding', 'spa', 'yoga', 'children', 'kids', 'fashion', 'luxury', 'hotel', 'florist'],
  gallery: ['patients', 'benefits', 'council', 'emergency', 'appointments', 'pension'],
  organic: ['developer', 'api', 'infrastructure', 'gaming', 'club', 'nightlife', 'punk', 'festival', 'bar', 'cocktail', 'cocktails', 'whisky'],
  civic: ['nightlife', 'club', 'fashion', 'luxury', 'perfume', 'gallery', 'festival', 'gig', 'bar', 'cocktail', 'cocktails', 'jazz'],
  night: ['clinic', 'patients', 'children', 'kids', 'baby', 'school', 'pension', 'council', 'accessible', 'appointments', 'bakery', 'breakfast', 'morning', 'mornings', 'yoga', 'pregnancy'],
  'retro-print': ['luxury', 'clinic', 'patients', 'legal', 'bank', 'funeral', 'pension', 'hotel', 'spa', 'enterprise'],
};

/** Words people use for a language, by its id. */
const SYNONYMS: Record<string, readonly string[]> = {
  broadsheet: ['newspaper', 'broadsheet', 'editorial', 'magazine', 'literary', 'journal'],
  swiss: ['swiss', 'helvetica', 'international style', 'modernist', 'grid-based', 'bauhaus'],
  'quiet-luxury': ['luxury', 'luxe', 'high-end', 'upscale', 'hotel', 'quiet luxury', 'aesop'],
  poster: ['poster', 'brutalist', 'loud', 'campaign', 'gig poster', 'maximal', 'maximalist'],
  craft: ['handmade', 'cosy', 'cozy', 'rustic', 'artisan', 'warm'],
  geometric: ['geometric', 'shapes', 'socria', 'paper and ink', 'bauhaus'],
  utility: ['technical', 'developer', 'terminal', 'mono', 'dashboard', 'engineering'],
  gallery: ['gallery', 'minimal', 'minimalist', 'white space', 'portfolio', 'museum'],
  organic: ['organic', 'soft', 'calming', 'natural', 'wellness'],
  civic: ['accessible', 'government', 'gov.uk', 'plain', 'public service'],
  night: ['dark', 'dark mode', 'night', 'moody', 'cinematic', 'neon', 'black'],
  'retro-print': ['retro', 'vintage', 'risograph', 'riso', 'zine', 'seventies', '70s', 'print'],
};

// ── the direction ────────────────────────────────────────────────────

export const LOCK_GROUPS = ['palette', 'type', 'layout', 'surface', 'imagery', 'motifs', 'motion', 'voice'] as const;
export type LockGroup = (typeof LOCK_GROUPS)[number];
export const LOCK_LABEL: Record<LockGroup, string> = { palette: 'Colours', type: 'Type', layout: 'Layout', surface: 'Surfaces', imagery: 'Imagery', motifs: 'Motifs', motion: 'Motion', voice: 'Voice' };

export interface ArtDirection {
  id: string;
  /** a short evocative name for this direction, for this brand */
  name: string;
  /** the visual language it speaks */
  language: string;
  /** one sentence: the idea the whole page follows */
  concept: string;
  /** why it fits the brief */
  rationale: string[];
  /** how the copy should speak */
  voice: string;
  /** how the page is laid out and paced */
  composition: string;
  /** what pictures, treated how */
  imagery: string;
  /** what this direction refuses to do */
  avoid: string[];
  tokens: DesignTokens;
  look: Look;
  /** groups the designer decided: kept through asking again, regenerating and refining */
  locks: LockGroup[];
  /** who wrote it last */
  source: 'engine' | 'model' | 'person';
}

export interface DirectionState {
  options: ArtDirection[];
  /** the direction the design follows, once approved */
  chosen: ArtDirection | null;
  approved: boolean;
  /** the designer's own creative direction, in words */
  notes: string;
  /** what they do not want */
  avoid: string;
  /** how many times they asked for others */
  round: number;
  /** languages already offered, so asking again shows new ones */
  seen: string[];
  /** the brief the options were made for (briefKey): a changed brief brings new ones */
  forBrief: string;
}

export const EMPTY_DIRECTION: DirectionState = { options: [], chosen: null, approved: false, notes: '', avoid: '', round: 0, seen: [], forBrief: '' };

/** A short fingerprint of a brief, to know when directions were made for an older one. */
export function briefKey(b: DesignBrief): string {
  return hash(JSON.stringify([b.objective, b.audience, b.personality, b.visualDirection, b.layoutDirection, b.palette, b.typography, b.pageType])).toString(36);
}

// ── helpers ──────────────────────────────────────────────────────────

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strs = (v: unknown, max: number, n: number): string[] => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same brief and round always give the same directions. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9#\-\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

function briefText(b: DesignBrief): string {
  return [b.objective, b.audience, b.personality.join(' '), b.visualDirection, b.layoutDirection, b.userGoals.join(' '), b.functionalRequirements.join(' ')].join(' ');
}

const roleOf = (b: DesignBrief | null, role: string, d: string) => b?.palette.find((p) => p.role === role)?.hex ?? d;

function ctxOf(b: DesignBrief): Ctx {
  const whole = (b.audience || '').split(/[.;:—–(]/)[0].trim();
  // the first clause when the rest is qualification ("…, not the speed")
  const first = whole.split(',')[0].trim();
  const aud = first.length >= 12 ? first : whole;
  const short = (aud.length > 64 ? aud.slice(0, 64).replace(/\s+\S*$/, '') : aud).replace(/[,\s]+$/, '');
  return {
    audience: short ? short.charAt(0).toLowerCase() + short.slice(1) : 'the people it is for',
    what: b.pageType === 'app-screen' ? 'the app' : 'the site',
    mood: b.personality.slice(0, 2).join(' and ').toLowerCase(),
  };
}

// ── fit ──────────────────────────────────────────────────────────────

export interface Fit {
  id: string;
  score: number;
  /** words in the brief or notes that matched */
  matched: string[];
}

function stemHit(w: string, k: string): boolean {
  if (w === k) return true;
  if (k.length >= 5 && w.length >= 5) return w.startsWith(k.slice(0, Math.max(5, k.length - 2))) || k.startsWith(w.slice(0, Math.max(5, w.length - 2)));
  return false;
}

/** How well each language answers the brief, the notes and what to avoid: higher fits better. */
export function fitScores(brief: DesignBrief, notes = '', avoid = ''): Fit[] {
  // what the brief says about the look counts most; who the clients are, least
  const weighted: [string[], number][] = [
    [words(brief.visualDirection), 2],
    [words(brief.layoutDirection), 1.2],
    [words(brief.objective), 1],
    [words([brief.userGoals.join(' '), brief.functionalRequirements.join(' ')].join(' ')), 0.6],
    [words(brief.audience), 0.5],
  ];
  const bw = words(briefText(brief));
  const pw = words(brief.personality.join(' '));
  const nw = words(notes);
  const notesLow = notes.toLowerCase();
  const avoidLow = avoid.toLowerCase();
  const aw = words(avoid);
  const bgDark = isDark(roleOf(brief, 'background', '#ffffff'));
  const wantsLoud = /\b(loud|louder|bold|bolder|bigger|punchy|striking|more colou?r)\b/.test(notesLow);
  const wantsQuiet = /\b(quiet|quieter|calm|calmer|minimal|restrained|subtle|understated)\b/.test(notesLow);
  return LANGUAGES.map((l) => {
    const matched = new Set<string>();
    let score = 0;
    for (const k of l.keywords) {
      const hit = weighted.reduce((m, [ws, wt]) => (ws.some((w) => stemHit(w, k)) ? Math.max(m, wt) : m), 0);
      if (hit) {
        score += hit;
        matched.add(k);
      }
      if (pw.some((w) => stemHit(w, k))) score += 1.2;
      if (nw.some((w) => stemHit(w, k))) {
        score += 4;
        matched.add(k);
      }
    }
    let asked = nw.some((w) => l.keywords.some((k) => stemHit(w, k)));
    for (const s of SYNONYMS[l.id] ?? []) {
      if (notesLow.includes(s)) (score += 8), (asked = true);
      if (avoidLow.includes(s)) score -= 12;
    }
    if (avoidLow.includes(l.name.toLowerCase()) || avoidLow.includes(l.id)) score -= 20;
    for (const t of l.traits) if (aw.some((w) => stemHit(w, t))) score -= 4;
    // louder or quieter, in so many words, rules out the opposite
    if (wantsLoud && l.traits.includes('quiet')) score -= 5;
    if (wantsQuiet && l.traits.includes('loud')) score -= 5;
    // the designer's own words outrank a clash with the brief
    if (!asked && (CLASHES[l.id] ?? []).some((k) => bw.some((w) => stemHit(w, k)))) score -= 6;
    if (l.display.includes(brief.typography.display)) score += 1.5;
    if (l.palette === 'dark' && bgDark) score += 4;
    if (l.palette === 'dark' && !bgDark) score -= 1.5;
    return { id: l.id, score: Math.round(score * 100) / 100, matched: [...matched].slice(0, 6) };
  }).sort((a, b) => b.score - a.score);
}

// ── palettes ─────────────────────────────────────────────────────────

/** The brief's palette as tokens' colours, with defaults for missing roles. */
export function briefColors(brief: DesignBrief | null): DesignTokens['colors'] {
  const d = DEFAULT_TOKENS.colors;
  return {
    background: roleOf(brief, 'background', d.background),
    surface: roleOf(brief, 'surface', d.surface),
    text: roleOf(brief, 'text', d.text),
    muted: roleOf(brief, 'muted', d.muted),
    accent: roleOf(brief, 'accent', d.accent),
    accentText: roleOf(brief, 'accent-text', d.accentText),
    line: roleOf(brief, 'line', d.line),
  };
}

const onAccent = (accent: string) => (contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111');

/** A language's way with colour, applied to the brief's own hues. */
export function paletteFor(strategy: PaletteStrategy, base: DesignTokens['colors']): DesignTokens['colors'] {
  const [ah, as] = hslOf(base.accent);
  const [bh, bs, bl] = hslOf(base.background);
  const hue = as > 0.12 ? ah : bh;
  let bg: string, text: string, accent = base.accent;
  switch (strategy) {
    case 'paper':
      bg = bl > 0.9 && bs < 0.4 ? base.background : hslHex(bs > 0.08 ? bh : 42, Math.min(0.3, Math.max(0.16, bs)), 0.955);
      text = hslHex(hue, 0.18, 0.11);
      break;
    case 'white':
      bg = hslHex(hue, 0.06, 0.985);
      text = '#121212';
      accent = as > 0.12 ? hslHex(ah, Math.max(as, 0.72), Math.min(0.5, Math.max(0.4, hslOf(base.accent)[2]))) : base.accent;
      break;
    case 'dark':
      bg = hslHex(hue, Math.min(0.3, as * 0.5 + 0.06), 0.075);
      text = hslHex(bh, Math.min(0.2, bs), 0.94);
      accent = hslOf(base.accent)[2] < 0.55 ? hslHex(ah, Math.max(as, 0.65), 0.62) : base.accent;
      break;
    case 'tinted':
      bg = hslHex(hue, Math.min(0.42, Math.max(0.22, as * 0.5)), 0.93);
      text = hslHex(hue, 0.32, 0.12);
      break;
    case 'ink':
      bg = hslHex(46, 0.38, 0.9);
      text = hslHex(hue, 0.4, 0.13);
      accent = as > 0.12 ? hslHex(ah, Math.max(as, 0.7), 0.47) : '#d2452d';
      break;
  }
  // a button's label must read on the accent: the accent moves (keeping its hue) until it does
  const label = onAccent(accent);
  accent = ensureContrast(accent, label, 4.6);
  const dark = isDark(bg);
  const surface = dark ? mix(bg, '#ffffff', 0.07) : mix(bg, '#ffffff', strategy === 'white' ? 0.0 : 0.55);
  const muted = ensureContrast(mix(text, bg, 0.38), bg, 4.6);
  const line = mix(bg, text, dark ? 0.2 : 0.16);
  return { background: bg, surface: surface === bg ? (dark ? mix(bg, '#ffffff', 0.07) : mix(bg, text, 0.035)) : surface, text, muted, accent, accentText: label, line };
}

/** A second ink in a set relation to the first: turned round the wheel, at the language's own strength. */
function secondInk(accent: string, a2: { turn: number; s: number; l: number }, bg: string): string {
  const [h, s] = hslOf(accent);
  const hue = s < 0.12 ? 28 : h + a2.turn; // a grey accent takes a warm second ink
  return hslHex(hue, a2.s, isDark(bg) ? Math.max(0.55, a2.l) : a2.l);
}

// ── building a direction ─────────────────────────────────────────────

/** What the designer's words ask for directly, applied to every option. */
interface Directives {
  dark?: boolean;
  serif?: boolean;
  upper?: boolean;
  corners?: DesignTokens['radius'];
  noImages?: boolean;
  colourful?: boolean;
  minimal?: boolean;
  loud?: boolean;
  accent?: string;
  /** what the words say about motion */
  motion?: Motion['feel'];
  parallax?: boolean;
  /** a composition the designer's references ask for */
  grid?: Look['grid'];
  density?: 'airy' | 'dense';
  fonts: string[];
  said: string[];
}

export function readDirectives(notes: string, avoid: string): Directives {
  const n = ` ${notes.toLowerCase()} `;
  const a = ` ${avoid.toLowerCase()} `;
  const d: Directives = { fonts: [], said: [] };
  const say = (s: string) => d.said.push(s);
  if (/\b(dark|darker|black background|night|nighttime|night-time|dark mode|moody|after dark)\b/.test(n) && !/\b(not|no) dark\b/.test(n)) (d.dark = true), say('a dark ground');
  if (/\b(dark|black)\b/.test(a) || /\b(light|bright|white background)\b/.test(n)) (d.dark = false), say('a light ground');
  if (/\b(no|not|without) serifs?\b/.test(n) || /\bserifs?\b/.test(a)) (d.serif = false), say('sans-serif headlines');
  else if (/\bserif\b/.test(n) && !/\bsans\b/.test(n)) (d.serif = true), say('serif headlines');
  else if (/\bsans\b/.test(n)) (d.serif = false), say('sans-serif headlines');
  if (/\b(uppercase|all caps|capitals)\b/.test(n)) (d.upper = true), say('capitals for headlines');
  if (/\b(uppercase|all caps|capitals|caps)\b/.test(a)) (d.upper = false), say('no capitals');
  if (/\b(rounded|round|soft corners|friendly shapes)\b/.test(n)) (d.corners = 'round'), say('rounded corners');
  if (/\b(sharp|square|hard edges|no rounded)\b/.test(n) || /\b(rounded|round corners)\b/.test(a)) (d.corners = 'none'), say('square corners');
  if (/\b(no (photos|images|photography|pictures)|type only|typographic only)\b/.test(n) || /\b(photos|images|photography|stock)\b/.test(a)) (d.noImages = true), say('type before pictures');
  if (/\b(colou?rful|vibrant|bright colou?rs|multicolou?r)\b/.test(n)) (d.colourful = true), say('more colour');
  if (/\b(minimal|minimalist|spare|restrained|quiet)\b/.test(n)) (d.minimal = true), say('restraint');
  if (/\b(bold|loud|big type|huge type|punchy|striking)\b/.test(n)) (d.loud = true), say('bigger, bolder type');
  const mo = readMotionWords(notes);
  if (mo.feel) d.motion = mo.feel;
  if (mo.parallax !== undefined) d.parallax = mo.parallax;
  if (/\b(motion|animation|animations|moving)\b/.test(a)) (d.motion = 'still'), mo.said.splice(0, mo.said.length, 'no motion');
  if (/\bparallax\b/.test(a)) (d.parallax = false), mo.said.includes('no parallax') || mo.said.push('no parallax');
  for (const x of mo.said) say(x);
  const hexes = notes.match(/#[0-9a-f]{6}\b/i);
  if (hexes) (d.accent = hexes[0].toLowerCase()), say(`${d.accent} as the accent`);
  for (const f of FONTS) if (n.includes(f.name.toLowerCase())) d.fonts.push(f.name);
  if (d.fonts.length) say(d.fonts.join(' and '));
  return d;
}

const nth = <T,>(xs: readonly T[], r: () => number, faithful: boolean): T => (faithful || xs.length === 1 ? xs[0] : xs[Math.floor(r() * xs.length) % xs.length]);

function fontFor(list: readonly string[], r: () => number, faithful: boolean, avoidNames: Set<string>, wantSerif?: boolean): string {
  let pool = list.filter((f) => !avoidNames.has(f));
  if (wantSerif !== undefined) {
    const kinded = pool.filter((f) => (knownFont(f)?.kind === 'serif') === wantSerif);
    if (kinded.length) pool = kinded;
    else {
      // the language has none of the asked kind: borrow the closest from the list
      const any = FONTS.filter((f) => (f.kind === 'serif') === wantSerif && f.kind !== 'mono').map((f) => f.name);
      pool = any.filter((f) => !avoidNames.has(f));
    }
  }
  if (!pool.length) pool = [...list];
  return nth(pool, r, faithful);
}

export interface BuildOptions {
  seed: number;
  /** the most faithful reading: the brief's palette and type exactly as approved */
  faithful: boolean;
  directives?: Directives;
  /** faces already used by other options, avoided where possible */
  usedFonts?: Set<string>;
  /** the designer's own words, for saying why it fits */
  notes?: string;
  /** colours to start from instead of the brief's (sampled from references kept for their colour) */
  baseColors?: Partial<DesignTokens['colors']>;
  /** where those colours came from, for saying why */
  colorNote?: string;
}

/** One direction, from a language and the brief. Deterministic for a seed. */
export function buildDirection(lang: Language, brief: DesignBrief, opt: BuildOptions): ArtDirection {
  const r = rng(opt.seed ^ hash(lang.id));
  const d = opt.directives ?? { fonts: [], said: [] };
  const f = opt.faithful;
  const L = lang.look;
  // colour: the brief's own palette for the faithful reading; the language's way with those hues otherwise
  let strategy: PaletteStrategy = lang.palette;
  if (d.dark === true) strategy = 'dark';
  if (d.dark === false && strategy === 'dark') strategy = 'paper';
  const base = { ...briefColors(brief), ...(opt.baseColors ?? {}) };
  if (d.accent) base.accent = d.accent;
  let colors = (f && d.dark === undefined) || opt.baseColors ? { ...base, accentText: base.accentText } : paletteFor(strategy, base);
  if (f && d.dark === true && !isDark(colors.background)) colors = paletteFor('dark', base);
  // type
  const used = opt.usedFonts ?? new Set<string>();
  const wantSerif = d.serif;
  let display = f ? brief.typography.display : fontFor(lang.display, r, false, used, wantSerif);
  let body = f ? brief.typography.body : fontFor(lang.body, r, false, new Set([display]), undefined);
  if (f && wantSerif !== undefined && (knownFont(display)?.kind === 'serif') !== wantSerif) display = fontFor(lang.display, r, true, new Set(), wantSerif);
  if (d.fonts.length) {
    display = d.fonts[0];
    if (d.fonts[1] && !knownFont(d.fonts[1])?.displayOnly) body = d.fonts[1];
  }
  if (knownFont(body)?.displayOnly) body = lang.body[0];
  const monoName = nth(lang.mono, r, f);
  let weight = nth(L.weight, r, f);
  let ratio = nth(L.ratio, r, f);
  if (d.loud) {
    weight = Math.max(weight, 700);
    ratio = Math.max(ratio, 1.5);
  }
  if (d.minimal) ratio = Math.min(ratio, 1.333);
  weight = nearestWeight(display, weight);
  let motifs = [...nth(L.motifs, r, f)];
  if (d.minimal) motifs = motifs.filter((m) => m === 'numbering' || m === 'captions');
  let shapes = [...nth(L.shapes, r, f)];
  if (d.colourful && !motifs.includes('shapes')) {
    motifs.push('shapes');
    if (!shapes.length) shapes = ['circle', 'square'];
  }
  if (!motifs.includes('shapes')) shapes = [];
  // motion: the language's own feel, unless the words ask for another; restraint and loudness move it a step
  let feel: Motion['feel'] = d.motion ?? nth(lang.motion, r, f);
  if (!d.motion && d.minimal) feel = feel === 'kinetic' ? 'measured' : feel === 'lively' ? 'calm' : feel;
  if (!d.motion && d.loud && feel !== 'still') feel = feel === 'calm' ? 'measured' : feel === 'measured' ? 'lively' : 'kinetic';
  // the language's own way of moving applies to its own feels; a feel the designer asks for that it does not have comes as itself
  const motion: Motion = feel === 'still' ? { ...STILL_MOTION } : (lang.motion as readonly string[]).includes(feel) ? motionFor(feel, lang.moTweak) : motionFor(feel);
  if (feel !== 'still' && d.parallax !== undefined) motion.parallax = d.parallax ? Math.max(1, motion.parallax) : 0;
  let containers = nth(L.containers, r, f);
  if (d.colourful && containers === 'open') containers = 'bands';
  const turn = lang.accent2 ?? (d.colourful ? { turn: 150, s: 0.6, l: 0.6 } : null);
  const look = normalizeLook(
    {
      language: lang.id,
      ratio,
      weight,
      case: d.upper === true ? 'upper' : d.upper === false ? 'sentence' : nth(L.case, r, f),
      tracking: nth(L.tracking, r, f),
      emphasis: nth(L.emphasis, r, f),
      label: d.upper === false && nth(L.label, r, f) === 'caps' ? 'sentence' : nth(L.label, r, f),
      mono: monoName,
      grid: d.grid ?? nth(L.grid, r, f),
      align: nth(L.align, r, f),
      width: nth(L.width, r, f),
      rhythm: nth(L.rhythm, r, f),
      containers,
      rules: nth(L.rules, r, f),
      buttons: nth(L.buttons, r, f),
      frame: d.noImages ? 'plain' : nth(L.frame, r, f),
      motifs,
      shapes,
      accent2: turn === null ? '' : secondInk(colors.accent, turn, colors.background),
      motion,
    },
    lookFromTokens(DEFAULT_TOKENS)
  );
  // uppercase display reads better with a little air
  if (look.case === 'upper' && look.tracking === 'tight' && knownFont(display)?.kind === 'serif') look.tracking = 'normal';
  const notes: string[] = [];
  const tokens = normalizeTokens(
    {
      colors,
      fonts: { display, body },
      scale: d.density === 'airy' ? 'spacious' : d.density === 'dense' ? 'compact' : nth(lang.scale, r, f),
      radius: d.corners ?? nth(lang.radius, r, f),
      style: lang.style,
      imageTreatment: nth(lang.treatment, r, f),
    },
    notes
  );
  const c = ctxOf(brief);
  const fit = fitScores(brief, opt.notes ?? '').find((x) => x.id === lang.id);
  const rationale = [
    fit && fit.matched.length ? `${opt.notes ? 'Your brief and notes speak' : 'The brief speaks'} of ${fit.matched.slice(0, 3).join(', ')}; ${lang.name.toLowerCase()} is a language built for that.` : `A deliberate contrast to the obvious reading of the brief: ${lang.blurb.split(':')[0]}.`,
    f && d.dark === undefined && !d.accent ? 'Keeps the palette and type pair you approved in the brief exactly as they are.' : f ? `Keeps your brief’s type; its colours move ${d.dark ? 'onto a dark ground' : 'to the accent you named'}, as your notes ask.` : `Takes the brief’s accent into ${strategy === 'dark' ? 'a dark ground' : strategy === 'tinted' ? 'a tinted ground of its own hue' : strategy === 'ink' ? 'two inks on newsprint' : strategy === 'white' ? 'a white page with the colour turned up' : 'a paper ground with deep ink'}, set in ${display} and ${body}.`,
    ...(d.said.length ? [`From your notes: ${d.said.join(', ')}.`] : []),
    ...(opt.colorNote ? [opt.colorNote] : []),
  ];
  return {
    id: `dir_${lang.id}_${(opt.seed >>> 0).toString(36)}`,
    name: lang.name,
    language: lang.id,
    concept: lang.concept(c),
    rationale,
    voice: lang.voice,
    composition: lang.composition,
    imagery: d.noImages ? 'Type does the work; photographs only where a real place or person must be shown.' : lang.imagery,
    avoid: [...lang.avoid],
    tokens,
    look,
    locks: [],
    source: 'engine',
  };
}

// ── difference ───────────────────────────────────────────────────────

const WEIGHT_BAND = (w: number) => (w <= 400 ? 0 : w < 700 ? 1 : 2);

/** How different two directions look, 0 (the same) to 1 (nothing in common). */
export function directionDistance(a: ArtDirection, b: ArtDirection): number {
  const A = a.look;
  const B = b.look;
  const ne = (x: unknown, y: unknown) => (x === y ? 0 : 1);
  const kind = (n: string) => knownFont(n)?.kind ?? 'sans';
  const jac = (x: readonly string[], y: readonly string[]) => {
    const u = new Set([...x, ...y]);
    if (!u.size) return 0;
    return 1 - x.filter((v) => y.includes(v)).length / u.size;
  };
  const parts: [number, number][] = [
    [3, ne(A.grid, B.grid)],
    [1.5, ne(A.align, B.align)],
    [2, ne(A.containers, B.containers)],
    [1.5, ne(A.buttons, B.buttons)],
    [1, ne(A.label, B.label)],
    [1.5, ne(A.case, B.case)],
    [0.5, ne(A.emphasis, B.emphasis)],
    [1, ne(A.rules, B.rules)],
    [1, ne(A.frame, B.frame)],
    [2, ne(kind(a.tokens.fonts.display), kind(b.tokens.fonts.display))],
    [1, ne(a.tokens.fonts.display, b.tokens.fonts.display)],
    [1.5, Math.abs(WEIGHT_BAND(A.weight) - WEIGHT_BAND(B.weight)) / 2],
    [2, Math.min(1, Math.abs(A.ratio - B.ratio) / 0.3)],
    [2.5, ne(isDark(a.tokens.colors.background), isDark(b.tokens.colors.background))],
    [1, Math.min(1, Math.abs(hslOf(a.tokens.colors.background)[1] - hslOf(b.tokens.colors.background)[1]) * 3)],
    [1, ne(a.tokens.radius, b.tokens.radius)],
    [1, ne(a.tokens.scale, b.tokens.scale)],
    [1, ne(a.tokens.imageTreatment, b.tokens.imageTreatment)],
    [2, jac(A.motifs, B.motifs)],
    [1.5, hueDistance(a.tokens.colors.accent, b.tokens.colors.accent)],
    [1.5, ne(A.motion?.feel ?? 'still', B.motion?.feel ?? 'still')],
  ];
  const total = parts.reduce((s, [w]) => s + w, 0);
  return Math.round((parts.reduce((s, [w, v]) => s + w * v, 0) / total) * 1000) / 1000;
}

// ── locks ────────────────────────────────────────────────────────────

/** Copy the groups `from` has locked onto `to`; `to` keeps those locks. */
export function applyLocks(to: ArtDirection, from: ArtDirection | null | undefined): ArtDirection {
  if (!from || !from.locks.length) return to;
  const out: ArtDirection = { ...to, tokens: { ...to.tokens, colors: { ...to.tokens.colors }, fonts: { ...to.tokens.fonts } }, look: { ...to.look }, locks: [...from.locks] };
  for (const g of from.locks) {
    switch (g) {
      case 'palette':
        out.tokens.colors = { ...from.tokens.colors };
        out.look.accent2 = from.look.accent2;
        break;
      case 'type':
        out.tokens.fonts = { ...from.tokens.fonts };
        for (const k of ['ratio', 'weight', 'case', 'tracking', 'emphasis', 'label', 'mono'] as const) (out.look as any)[k] = from.look[k];
        break;
      case 'layout':
        out.tokens.scale = from.tokens.scale;
        for (const k of ['grid', 'align', 'width', 'rhythm'] as const) (out.look as any)[k] = from.look[k];
        break;
      case 'surface':
        out.tokens.radius = from.tokens.radius;
        for (const k of ['containers', 'rules', 'buttons'] as const) (out.look as any)[k] = from.look[k];
        break;
      case 'imagery':
        out.tokens.imageTreatment = from.tokens.imageTreatment;
        out.look.frame = from.look.frame;
        out.imagery = from.imagery;
        break;
      case 'motifs':
        out.look.motifs = [...from.look.motifs];
        out.look.shapes = [...from.look.shapes];
        break;
      case 'motion':
        out.look.motion = { ...from.look.motion };
        break;
      case 'voice':
        out.voice = from.voice;
        break;
    }
  }
  return out;
}

const TOKEN_GROUP: Record<string, LockGroup> = { colors: 'palette', fonts: 'type', scale: 'layout', radius: 'surface', imageTreatment: 'imagery', style: 'surface' };
const LOOK_GROUP: Record<string, LockGroup> = {
  accent2: 'palette', ratio: 'type', weight: 'type', case: 'type', tracking: 'type', emphasis: 'type', label: 'type', mono: 'type',
  grid: 'layout', align: 'layout', width: 'layout', rhythm: 'layout', containers: 'surface', rules: 'surface', buttons: 'surface', frame: 'imagery', motifs: 'motifs', shapes: 'motifs', motion: 'motion',
};

/** The locked groups a patch would change: a change to any of them waits for the designer. */
export function lockedChanges(spec: DesignSpec, patch: Patch, locks: readonly LockGroup[]): LockGroup[] {
  if (!locks.length) return [];
  const hit = new Set<LockGroup>();
  if (patch.op === 'tokens' && patch.tokens) {
    for (const [k, v] of Object.entries(patch.tokens)) {
      const g = TOKEN_GROUP[k];
      if (!g || !locks.includes(g)) continue;
      const now = (spec.tokens as any)[k];
      if (v && typeof v === 'object') {
        if (Object.entries(v as Record<string, unknown>).some(([kk, vv]) => String(now?.[kk] ?? '').toLowerCase() !== String(vv ?? '').toLowerCase())) hit.add(g);
      } else if (v !== now) hit.add(g);
    }
  }
  if (patch.op === 'look' && patch.look) {
    for (const [k, v] of Object.entries(patch.look)) {
      const g = LOOK_GROUP[k];
      if (g && locks.includes(g) && JSON.stringify(v) !== JSON.stringify((spec.look as any)?.[k])) hit.add(g);
    }
  }
  return [...hit];
}

/** The tokens and look a design takes from its direction. */
export function designFromDirection(dir: ArtDirection): { tokens: DesignTokens; look: Look } {
  return { tokens: { ...dir.tokens, colors: { ...dir.tokens.colors }, fonts: { ...dir.tokens.fonts } }, look: { ...dir.look, motifs: [...dir.look.motifs], shapes: [...dir.look.shapes], motion: { ...(dir.look.motion ?? STILL_MOTION) } } };
}

// ── proposing ────────────────────────────────────────────────────────

export interface DirectionAsk {
  brief: DesignBrief;
  notes?: string;
  avoid?: string;
  /** the direction being revised: its locked groups carry over to every option */
  base?: ArtDirection | null;
  round?: number;
  /** languages already shown: asking again prefers new ones */
  seen?: readonly string[];
  count?: number;
  /** what the moodboard says (lib/ux-v0/references.ts): the designer's notes on references, colours, motion, composition */
  board?: BoardReading;
}

/**
 * Three directions that each fit the brief and differ from one another as much
 * as fit allows. The first is the faithful reading; the others are chosen by
 * fit and by their distance from those already chosen.
 */
export function proposeDirections(ask: DirectionAsk): ArtDirection[] {
  const { brief } = ask;
  const board = ask.board;
  // the designer's own words: their notes for the direction, then what they wrote on their references
  const notes = [ask.notes ?? '', board?.words ?? ''].filter(Boolean).join('. ');
  const avoid = [ask.avoid ?? '', board?.avoid ?? ''].filter(Boolean).join('. ');
  const round = Math.max(0, ask.round ?? 0);
  const count = Math.max(1, Math.min(4, ask.count ?? 3));
  const seen = new Set(ask.seen ?? []);
  const seed = hash(`${briefText(brief)}|${notes}|${avoid}|${round}`);
  const directives = readDirectives(notes, avoid);
  if (board) {
    // what the references show, where the words did not already say
    if (board.serif !== undefined && directives.serif === undefined) directives.serif = board.serif;
    if (board.motion && !directives.motion) (directives.motion = board.motion), directives.said.push(`${board.motion} motion, from your moving references`);
    if (board.parallax !== undefined && directives.parallax === undefined) directives.parallax = board.parallax;
    if (board.grid) (directives.grid = board.grid), directives.said.push(`a ${board.grid} composition, from your references`);
    if (board.density) (directives.density = board.density), directives.said.push(board.density === 'airy' ? 'generous space, from your references' : 'a denser page, from your references');
  }
  const fromRefs = board?.colours.length ? paletteFromSwatches(board.colours) : null;
  const fits = fitScores(brief, notes, avoid);
  const top = Math.max(1, fits[0].score);
  // asking again: what was shown steps back, so new languages come forward
  const adjusted = fits.map((x) => ({ ...x, adj: x.score - (seen.has(x.id) ? top + 1 : 0) })).sort((a, b) => b.adj - a.adj);
  const maxAdj = Math.max(1, adjusted[0].adj);
  const chosen: ArtDirection[] = [];
  const usedFonts = new Set<string>();
  const usedIds = new Set<string>();
  const make = (id: string, faithful: boolean) => {
    // the second option takes its colours from the references kept for their colour, when there are any (and colour is not locked)
    const refColours = chosen.length === 1 && fromRefs && !(ask.base && ask.base.locks.includes('palette'));
    const d = buildDirection(languageOf(id)!, brief, {
      seed: seed + chosen.length * 7919,
      faithful,
      directives,
      usedFonts,
      notes,
      ...(refColours ? { baseColors: fromRefs!, colorNote: `Colours sampled from your references (${(board!.colourFrom.slice(0, 2).map((t) => `“${t}”`).join(' and ')) || 'the moodboard'}).` } : {}),
    });
    usedFonts.add(d.tokens.fonts.display);
    return d;
  };
  // the faithful reading first (only on the first round: asking again means "show me others")
  const firstId = adjusted[0].id;
  chosen.push(make(firstId, round === 0 && !(ask.base && ask.base.locks.includes('palette'))));
  usedIds.add(firstId);
  while (chosen.length < count) {
    let best: { id: string; v: number } | null = null;
    const wantFit = chosen.length === 1 ? 0.45 : 0.35;
    for (const x of adjusted) {
      if (usedIds.has(x.id)) continue;
      const fitN = Math.max(0, x.adj) / maxAdj;
      if (x.adj < -4) continue; // the designer asked to avoid it
      const trial = buildDirection(languageOf(x.id)!, brief, { seed: seed + chosen.length * 7919, faithful: false, directives, usedFonts });
      const dist = Math.min(...chosen.map((c) => directionDistance(c, trial)));
      const v = wantFit * fitN + (1 - wantFit) * dist;
      if (!best || v > best.v) best = { id: x.id, v };
    }
    if (!best) break;
    usedIds.add(best.id);
    chosen.push(make(best.id, false));
  }
  return chosen.map((d, i) => {
    const locked = applyLocks(d, ask.base);
    return { ...locked, id: `dir_${d.language}_${round}_${i}` };
  });
}

/** SocriaUX's own choice, when the designer leaves it: the faithful reading. */
export function autoDirection(brief: DesignBrief, notes = '', avoid = ''): ArtDirection {
  return proposeDirections({ brief, notes, avoid, count: 1 })[0];
}

/** A direction revised in words ("darker, more like a bar"), keeping what is locked. */
export function reviseDirection(base: ArtDirection, brief: DesignBrief, words: string, avoid = ''): ArtDirection {
  const options = proposeDirections({ brief, notes: words, avoid, base, count: 3 });
  // the language the words point at, or the one closest to where the designer already was
  const fits = fitScores(brief, words, avoid);
  const wanted = options.find((o) => o.language === fits[0].id) ?? options[0];
  return { ...wanted, source: base.source === 'person' ? 'person' : wanted.source };
}

// ── validating a direction (from the model, from storage, from the person) ──

const LOCKS = new Set<string>(LOCK_GROUPS);

export function normalizeDirection(v: unknown): ArtDirection | null {
  const r = o(v);
  const lang = languageOf(str(r.language, 40));
  if (!lang) return null;
  const notes: string[] = [];
  const tokens = normalizeTokens(r.tokens, notes);
  const look = normalizeLook({ ...o(r.look), language: lang.id }, { ...lookFromTokens(tokens), language: lang.id });
  return {
    id: /^[a-z0-9_\-]{1,64}$/i.test(String(r.id ?? '')) ? String(r.id) : `dir_${lang.id}`,
    name: str(r.name, 60) || lang.name,
    language: lang.id,
    concept: str(r.concept, 320) || lang.blurb,
    rationale: strs(r.rationale, 240, 4),
    voice: str(r.voice, 280) || lang.voice,
    composition: str(r.composition, 280) || lang.composition,
    imagery: str(r.imagery, 280) || lang.imagery,
    avoid: strs(r.avoid, 120, 6),
    tokens,
    look,
    locks: Array.isArray(r.locks) ? [...new Set(r.locks.filter((x: unknown): x is LockGroup => typeof x === 'string' && LOCKS.has(x)))] : [],
    source: r.source === 'model' || r.source === 'person' ? r.source : 'engine',
  };
}

export function normalizeDirectionState(v: unknown): DirectionState {
  const r = o(v);
  const options = (Array.isArray(r.options) ? r.options : []).map(normalizeDirection).filter((x): x is ArtDirection => !!x).slice(0, 4);
  const chosen = r.chosen ? normalizeDirection(r.chosen) : null;
  return {
    options,
    chosen,
    approved: !!chosen && r.approved === true,
    notes: str(r.notes, 1200),
    avoid: str(r.avoid, 400),
    round: Math.max(0, Math.min(99, Math.round(Number(r.round) || 0))),
    seen: strs(r.seen, 40, 24).filter((x) => LANG.has(x)),
    forBrief: str(r.forBrief, 16),
  };
}

// ── the model's part: writing the three, never choosing outside the rules ──

export function directSystem(): string {
  const catalogue = LANGUAGES.map((l) => `- ${l.id}: ${l.blurb}`).join('\n');
  return `You are SocriaUX's art director. Before any page is drawn, you write three art directions for the designer to choose from. Each is a distinct visual language, not a colour change: type, grid, surfaces, imagery and motifs all follow from one idea.

The catalogue of visual languages:
${catalogue}

You are given three candidates the engine chose for fit and for difference. For each, write:
- name: 2–4 words, evocative and specific to THIS brand (never the language's catalogue name, never "Modern", "Clean" or "Minimal").
- concept: one sentence — the single idea the whole page follows, concrete enough to draw.
- rationale: 2–3 short reasons, each tied to something in the brief (its audience, objective or personality).
- voice: how the copy speaks, then one example headline in that voice (under 90 characters).
- composition: one sentence on layout and pacing.
- imagery: one sentence — what pictures and how they are treated, or why there are none.
- avoid: 2–4 specific things this direction refuses (generic AI-design habits included).
- fonts: optionally {"display", "body"} from this list only, to serve the concept better; omit to keep the candidate's.

Rules: honour the designer's own notes and what they want to avoid above everything else. Keep the three directions clearly different from one another. You may change a candidate's "language" to another catalogue id only when the designer's notes ask for it, and the three must stay different languages. Do not touch groups the designer locked. No hype words, no emoji.
Respond with ONE JSON object: {"directions": [{"candidate": 1, "language": "...", "name": "...", "concept": "...", "rationale": ["..."], "voice": "...", "composition": "...", "imagery": "...", "avoid": ["..."], "fonts": {"display": "...", "body": "..."}}, ...]}`;
}

export function directUser(ask: DirectionAsk, options: readonly ArtDirection[]): string {
  const b = ask.brief;
  return [
    `THE BRIEF: objective — ${b.objective}; audience — ${b.audience}; personality — ${b.personality.join(', ')}; visual direction — ${b.visualDirection}; layout — ${b.layoutDirection}; page — ${b.pageType} (${b.platform}).`,
    ask.notes ? `THE DESIGNER'S OWN DIRECTION: “${ask.notes}”` : 'THE DESIGNER GAVE NO DIRECTION OF THEIR OWN.',
    ask.avoid ? `THEY DO NOT WANT: “${ask.avoid}”` : '',
    ask.base?.locks.length ? `LOCKED BY THE DESIGNER (keep as they are): ${ask.base.locks.map((g) => LOCK_LABEL[g]).join(', ')}.` : '',
    `FONTS YOU MAY NAME: ${FONTS.map((f) => f.name).join(', ')}.`,
    `THE CANDIDATES:\n${options.map((d, i) => `${i + 1}. ${d.language} — ${languageOf(d.language)?.blurb}; fonts ${d.tokens.fonts.display} / ${d.tokens.fonts.body}; ground ${d.tokens.colors.background}, accent ${d.tokens.colors.accent}.`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The model's words laid over the engine's directions; anything outside the rules is dropped. */
export function parseDirections(raw: unknown, ask: DirectionAsk, options: readonly ArtDirection[]): ArtDirection[] {
  const list = Array.isArray(o(raw).directions) ? (o(raw).directions as unknown[]) : [];
  const out: ArtDirection[] = options.map((d) => ({ ...d }));
  const taken = new Set(out.map((d) => d.language));
  const directives = readDirectives(ask.notes ?? '', ask.avoid ?? '');
  list.slice(0, 6).forEach((item, j) => {
    const m = o(item);
    const i = Number.isInteger(m.candidate) && m.candidate >= 1 && m.candidate <= out.length ? m.candidate - 1 : j;
    if (i >= out.length) return;
    let d = out[i];
    const lang = languageOf(str(m.language, 40));
    if (lang && lang.id !== d.language && !taken.has(lang.id) && (ask.notes ?? '').trim()) {
      taken.delete(d.language);
      taken.add(lang.id);
      d = applyLocks({ ...buildDirection(lang, ask.brief, { seed: hash(`${lang.id}|${ask.round ?? 0}`), faithful: false, directives }), id: d.id }, ask.base);
    }
    const typeLocked = d.locks.includes('type');
    const fonts = o(m.fonts);
    const display = knownFont(fonts.display);
    const body = knownFont(fonts.body);
    const tokens = typeLocked
      ? d.tokens
      : { ...d.tokens, fonts: { display: display ? display.name : d.tokens.fonts.display, body: body && !body.displayOnly ? body.name : d.tokens.fonts.body } };
    const look = typeLocked ? d.look : { ...d.look, weight: nearestWeight(tokens.fonts.display, d.look.weight) };
    out[i] = {
      ...d,
      tokens,
      look,
      name: str(m.name, 60) || d.name,
      concept: str(m.concept, 320) || d.concept,
      rationale: strs(m.rationale, 240, 3).length ? strs(m.rationale, 240, 3) : d.rationale,
      voice: d.locks.includes('voice') ? d.voice : str(m.voice, 280) || d.voice,
      composition: str(m.composition, 280) || d.composition,
      imagery: d.locks.includes('imagery') ? d.imagery : str(m.imagery, 280) || d.imagery,
      avoid: strs(m.avoid, 120, 4).length ? strs(m.avoid, 120, 4) : d.avoid,
      source: 'model',
    };
  });
  return out;
}

// ── telling the generator what was decided ───────────────────────────

/** The approved direction, in words the generator works from. */
export function directionBrief(dir: ArtDirection, pageType: 'website' | 'app-screen'): string {
  const lang = languageOf(dir.language);
  const prefer = lang
    ? Object.entries(lang.prefer)
        .filter(([k]) => kindDef(k)?.pages.includes(pageType))
        .map(([k, v]) => `${k}: ${v.join(' > ')}`)
        .join('; ')
    : '';
  const L = dir.look;
  return [
    `THE APPROVED ART DIRECTION — “${dir.name}” (${lang?.name ?? dir.language}): ${dir.concept}`,
    `Voice: ${dir.voice}`,
    `Composition: ${dir.composition}`,
    `Imagery: ${dir.imagery}`,
    dir.avoid.length ? `This direction refuses: ${dir.avoid.join('; ')}.` : '',
    `The renderer already draws the look from this direction (${dir.tokens.fonts.display} and ${dir.tokens.fonts.body}; ${L.grid} grid; ${L.containers} surfaces; ${L.buttons} buttons; ${L.case === 'upper' ? 'capital' : 'sentence-case'} headlines; motifs: ${L.motifs.join(', ') || 'none'}). You do not choose tokens: you choose sections, variants and copy that serve it.`,
    prefer ? `Variants that speak this language (best first): ${prefer}.` : '',
    L.motifs.includes('icons') ? '' : 'Icons are not part of this language: leave feature icons out.',
    motionBrief(L.motion),
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the approved motion asks of the words: the renderer plays it, but copy written for it moves better. */
function motionBrief(m: Motion | undefined): string {
  if (!m || m.feel === 'still') return 'Motion: still. Nothing on the page animates, so the order and hierarchy alone must carry it.';
  const head =
    m.headline === 'letters'
      ? 'The opening headline arrives letter by letter: keep it to six words or fewer, every letter earning its place.'
      : m.headline === 'words'
        ? 'The opening headline arrives word by word: write it so each word lands on its own, ten words at most.'
        : m.headline === 'mask'
          ? 'The opening headline rises through a mask: a short, confident statement reads best.'
          : '';
  return `Motion (${m.feel}): the renderer plays it as CSS. ${head} ${m.scroll ? 'Sections arrive as they scroll in, so give each one a single clear idea.' : ''}`.replace(/\s+/g, ' ').trim();
}

// ── planning the page's rhythm ───────────────────────────────────────

const SHAPE_OF: Record<string, string> = {
  'features/grid': 'grid', 'features/numbered': 'grid', 'features/list': 'rows', 'features/index': 'rows', 'features/columns': 'cols',
  'pricing/cards': 'grid', 'stats/row': 'cols', 'stats/band': 'band', 'stats/giant': 'giant', 'list/menu': 'rows', 'list/schedule': 'rows', 'list/simple': 'rows',
  'faq/accordion': 'rows', 'faq/two-column': 'rows', 'gallery/grid': 'media', 'gallery/mosaic': 'media', 'gallery/strip': 'media',
  'split/image-left': 'split', 'split/image-right': 'split', 'cta/band': 'band', 'cta/centered': 'box', 'cta/image': 'split', 'cta/statement': 'giant',
  'quote/large': 'quote', 'quote/with-portrait': 'split', 'quote/pull': 'quote', 'text/narrow': 'prose', 'text/two-column': 'prose', 'text/lead': 'prose',
  'form/stacked': 'form', 'form/split': 'form', 'logos/row': 'names',
};
const shapeOf = (s: Section) => SHAPE_OF[`${s.kind}/${s.variant}`] ?? s.kind;
/** the variants that draw a section's picture */
const IMAGE_VARIANTS: Record<string, readonly string[]> = {
  hero: ['split', 'full-bleed', 'editorial', 'centered', 'statement', 'poster'],
  cta: ['image'],
  quote: ['with-portrait'],
  split: ['image-left', 'image-right'],
  gallery: ['grid', 'mosaic', 'strip'],
};
const FRAME_KINDS = new Set(['nav', 'footer', 'app-nav', 'app-header', 'stat-cards', 'chart', 'table', 'feed']);

/**
 * Give the page a rhythm: no two neighbouring sections built the same way, at
 * most two grids of cards, the language's own variants where the model left a
 * choice, and grounds and spacing that move. Sections the designer fixed are
 * left exactly as they are.
 */
export function planLayout(spec: DesignSpec): DesignSpec {
  if (spec.pageType !== 'website') return spec;
  const look = spec.look;
  const lang = languageOf(look?.language ?? '');
  if (!lang) return spec;
  const sections = spec.sections.map((s) => ({ ...s }));
  const content = sections.filter((s) => !FRAME_KINDS.has(s.kind));
  // 1 · variants: the language's preference where nothing else decided, then no repeated shapes
  let grids = 0;
  let prev = '';
  for (const s of content) {
    if (s.fixed) {
      prev = shapeOf(s);
      continue;
    }
    const def = kindDef(s.kind);
    const pref = (lang.prefer[s.kind] ?? []).filter((v) => def?.variants.includes(v));
    const showsPicture = (v: string) => s.images.length > 0 && (IMAGE_VARIANTS[s.kind] ?? []).includes(v);
    const usable = (v: string) =>
      !(s.kind === 'hero' && (v === 'split' || v === 'full-bleed') && !s.images.length) &&
      !(s.kind === 'cta' && v === 'image' && !s.images.length) &&
      !(s.kind === 'quote' && v === 'with-portrait' && !s.images.length) &&
      // a picture the section carries is never dropped by a change of variant
      !(showsPicture(s.variant) && !showsPicture(v));
    if (pref.length && !pref.includes(s.variant) && usable(pref[0])) s.variant = pref.find(usable) ?? s.variant;
    let shape = shapeOf(s);
    const tooManyGrids = shape === 'grid' && grids >= 2;
    if ((shape === prev && shape !== 'prose') || tooManyGrids) {
      const alt = [...pref, ...(def?.variants ?? [])].find((v) => v !== s.variant && usable(v) && SHAPE_OF[`${s.kind}/${v}`] !== prev && SHAPE_OF[`${s.kind}/${v}`] !== (tooManyGrids ? 'grid' : '__'));
      if (alt) s.variant = alt;
      shape = shapeOf(s);
    }
    if (shape === 'grid') grids++;
    prev = shape;
  }
  // the masthead follows the language too
  const nav = sections.find((s) => s.kind === 'nav');
  if (nav && !nav.fixed) nav.variant = look.align === 'center' && lang.id === 'quiet-luxury' ? 'centered' : nav.variant === 'centered' && look.align !== 'center' ? 'inline' : nav.variant;
  // 2 · grounds
  let alt = false;
  for (const s of sections) {
    if (s.fixed && s.tone) continue;
    let tone: Tone = 'base';
    if (s.kind === 'nav' || s.kind === 'hero') tone = 'base';
    else if (s.kind === 'footer') tone = lang.tones.alternate || look.containers === 'bands' ? 'alt' : 'base';
    else if (s.kind === 'cta' && lang.tones.cta) tone = lang.tones.cta;
    else if (s.kind === 'stats' && lang.tones.stats) tone = lang.tones.stats;
    else if (s.kind === 'quote' && lang.tones.quote) tone = lang.tones.quote;
    else if (s.kind === 'logos' && lang.tones.logos) tone = lang.tones.logos;
    else if (lang.tones.alternate || look.containers === 'bands') {
      tone = alt ? 'alt' : 'base';
      alt = !alt;
    }
    if (tone === 'accent2' && !look.accent2) tone = 'invert';
    // the image hero carries its own ground
    if (s.kind === 'hero' && s.variant === 'full-bleed') tone = 'base';
    s.tone = tone;
  }
  // two neighbours on the same strong ground merge into one block: give the second the page's own
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1];
    const b = sections[i];
    if (!b.fixed && a.tone && a.tone === b.tone && a.tone !== 'base' && a.tone !== 'alt') b.tone = 'base';
  }
  // 3 · spacing
  for (const s of sections) {
    if (s.fixed && s.pad) continue;
    let pad: Pad = 'm';
    if (look.rhythm === 'dramatic') {
      if (s.kind === 'hero' || s.kind === 'quote' || (s.kind === 'cta' && s.variant === 'statement')) pad = 'l';
      else if (s.kind === 'logos' || s.kind === 'stats') pad = 's';
    } else if (s.kind === 'logos') pad = 's';
    s.pad = pad;
  }
  return { ...spec, sections };
}
