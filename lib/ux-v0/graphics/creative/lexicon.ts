// lib/ux-v0/graphics/creative/lexicon.ts — what creative words mean to a designer, as design decisions.
//
// A theme ("cloud themed", "an ocean feel", "make it cosmic") is a subject made visual: the forms it brings, a palette
// in light and dark, a ground, a typographic character, how deep it feels. A quality ("more sophisticated", "premium",
// "futuristic", "alive", "too generic") is a set of moves on decisions that already exist: the palette shifted, the
// type recharacterised, the space opened, the forms made fewer or more abstract, depth added. A typographic character
// is a set of real pairings from the font library. Nothing here places anything: the executor (execute.ts) does.

import { hslHex, hslOf, mix } from '../../color';
import { contrastRatio } from '../../../ux/audit';
import type { FormKind } from './forms';

export interface Palette {
  ground: string;
  ink: string;
  accent: string;
  support: string[];
}

export interface Theme {
  id: string;
  label: string;
  words: RegExp;
  forms: FormKind;
  /** a second, smaller form that belongs with the first (stars with planets, drops with waves) */
  forms2?: FormKind;
  light: Palette;
  dark: Palette;
  /** the theme's own ground: a gradient top → bottom, light and dark */
  sky: { light: [string, string]; dark: [string, string] };
  prefers: 'light' | 'dark';
  type: TypeCharacter;
  abstraction: number;
  depth: number;
  count: number;
  scale: number;
  says: string;
}

const P = (ground: string, ink: string, accent: string, ...support: string[]): Palette => ({ ground, ink, accent, support });

export const THEMES: readonly Theme[] = [
  {
    id: 'cloud',
    label: 'clouds',
    words: /\b(clouds?|cloudy|cloud-?(themed|inspired|like)|skies|sky|heavenly|cumulus|nimbus|airy sky)\b/,
    forms: 'cloud',
    light: P('#dcebfa', '#1c2a44', '#f0a050', '#ffffff', '#a9c6ea', '#eef5fd'),
    dark: P('#16203b', '#eef3ff', '#f6c56b', '#9fb4dc', '#3a4a78', '#d7e2f6'),
    sky: { light: ['#b9d6f4', '#f1f7fe'], dark: ['#0d1430', '#34467a'] },
    prefers: 'light',
    type: 'soft',
    abstraction: 22,
    depth: 2,
    count: 5,
    scale: 1,
    says: 'soft cumulus clouds drifting around the words over a sky gradient, a warm sunlit accent and soft type',
  },
  {
    id: 'ocean',
    label: 'the ocean',
    words: /\b(ocean|oceans|sea|seas|marine|maritime|waves?|beach|coastal|coast|nautical|tides?|underwater|aquatic|surf)\b/,
    forms: 'wave',
    forms2: 'drop',
    light: P('#e3f2f4', '#0d2e3c', '#ff7a59', '#2a8fa6', '#7cc6d6', '#ffffff'),
    dark: P('#062433', '#e8f6f8', '#ffb347', '#1b6f86', '#0f4a5c', '#7cc6d6'),
    sky: { light: ['#cbe8ef', '#f4fbfc'], dark: ['#03131e', '#0c3b50'] },
    prefers: 'light',
    type: 'humanist',
    abstraction: 40,
    depth: 1,
    count: 3,
    scale: 1,
    says: 'layered waves along the foot, sea blues with a coral accent',
  },
  {
    id: 'forest',
    label: 'the forest',
    words: /\b(forest|forests|woods|woodland|botanical|botany|plants?|leaf|leaves|foliage|jungle|tropical|greenery|nature|natural world)\b/,
    forms: 'leaf',
    light: P('#eef3e5', '#1e2d1b', '#d4703a', '#5e7f3a', '#9cbf6a', '#c8dca8'),
    dark: P('#13200f', '#eef3e5', '#e6a04a', '#3f6a2a', '#7aa354', '#2b4520'),
    sky: { light: ['#e1ebd2', '#f6f9f0'], dark: ['#0b1508', '#1d3315'] },
    prefers: 'light',
    type: 'humanist',
    abstraction: 35,
    depth: 1,
    count: 7,
    scale: 1,
    says: 'leaves framing the edges, greens with a warm earth accent',
  },
  {
    id: 'space',
    label: 'space',
    words: /\b(space|outer space|cosmic|cosmos|galaxy|galaxies|stars|starry|star-?field|universe|planets?|planetary|astronom\w*|celestial|nebula|lunar|moon|orbits?)\b/,
    forms: 'orb',
    forms2: 'sparkle',
    light: P('#eceefe', '#191b3c', '#6b5bd6', '#ff9e5e', '#b9bdf5', '#ffffff'),
    dark: P('#0b0f24', '#f1f3ff', '#ff9e5e', '#6b5bd6', '#2a2f6b', '#c9ccff'),
    sky: { light: ['#dfe2fd', '#f6f7ff'], dark: ['#05071a', '#1d2153'] },
    prefers: 'dark',
    type: 'futuristic',
    abstraction: 45,
    depth: 2,
    count: 3,
    scale: 1,
    says: 'planets and a field of stars on a deep night ground, a warm planet glow',
  },
  {
    id: 'sun',
    label: 'sun and warmth',
    words: /\b(sun|sunny|sunshine|sunset|sunrise|summer|desert|dunes?|golden hour|dusk|dawn|tropics)\b/,
    forms: 'sun',
    forms2: 'mountain',
    light: P('#fdecd6', '#3a1e12', '#e5533d', '#f6a54c', '#f3c99a', '#c2425b'),
    dark: P('#2a1220', '#fde9d6', '#ff8a3d', '#c2425b', '#5a2440', '#f6a54c'),
    sky: { light: ['#f8c48c', '#fdeedd'], dark: ['#1c0b1c', '#5a2440'] },
    prefers: 'light',
    type: 'retro',
    abstraction: 60,
    depth: 1,
    count: 2,
    scale: 1.1,
    says: 'a low sun over soft ridges, the warm oranges and pinks of late light',
  },
  {
    id: 'mountain',
    label: 'mountains',
    words: /\b(mountains?|alpine|peaks?|summits?|hiking|outdoors?|landscape|hills?|valley|ridges?)\b/,
    forms: 'mountain',
    light: P('#e9eff2', '#1a2933', '#df5f3a', '#7f97a6', '#b8c7cf', '#ffffff'),
    dark: P('#131f29', '#eef3f5', '#f2995e', '#4c6576', '#2a3c49', '#b8c7cf'),
    sky: { light: ['#d3e2e9', '#f3f7f9'], dark: ['#0b141c', '#2a3c49'] },
    prefers: 'light',
    type: 'grotesk',
    abstraction: 50,
    depth: 2,
    count: 3,
    scale: 1,
    says: 'layered ridges fading into the distance, cool slate with a summit-orange accent',
  },
  {
    id: 'city',
    label: 'the city',
    words: /\b(city|cities|urban|street|streets|skyline|architecture|architectural|metropolis|downtown|concrete|buildings?)\b/,
    forms: 'block',
    forms2: 'line',
    light: P('#ebeae6', '#151515', '#ff4f2e', '#8a8a86', '#c9c7c0', '#ffffff'),
    dark: P('#121316', '#f2f2ef', '#ffcf3d', '#3d4048', '#6b6f78', '#c9c7c0'),
    sky: { light: ['#dedcd6', '#f4f3f0'], dark: ['#0b0c0e', '#2a2d33'] },
    prefers: 'light',
    type: 'grotesk',
    abstraction: 70,
    depth: 1,
    count: 2,
    scale: 1,
    says: 'a skyline of blocks along the foot, concrete greys with a signal colour',
  },
  {
    id: 'flowers',
    label: 'flowers',
    words: /\b(flowers?|floral|florals|blossoms?|bloom|blooms|blooming|petals?|spring|roses?|botanical garden)\b/,
    forms: 'petal',
    forms2: 'leaf',
    light: P('#fbeef0', '#381a26', '#de4579', '#f4a6be', '#7fae6b', '#ffd36e'),
    dark: P('#2a1420', '#fbeef0', '#ff7aa8', '#9c3d63', '#5d8a4e', '#ffd36e'),
    sky: { light: ['#f9dfe6', '#fdf5f7'], dark: ['#1a0b14', '#4a2034'] },
    prefers: 'light',
    type: 'editorial',
    abstraction: 45,
    depth: 1,
    count: 4,
    scale: 1,
    says: 'open flowers at the edges, blush pinks with leaf greens',
  },
  {
    id: 'autumn',
    label: 'autumn',
    words: /\b(autumn|autumnal|fall season|harvest|october|thanksgiving)\b/,
    forms: 'leaf',
    light: P('#f6ead8', '#2e1a0e', '#c2410c', '#e08a2b', '#8a5a2b', '#d9b26a'),
    dark: P('#22140b', '#f6ead8', '#f08a3c', '#a3501c', '#5b3a1e', '#d9b26a'),
    sky: { light: ['#f1dcc0', '#faf3ea'], dark: ['#140b05', '#3d2412'] },
    prefers: 'light',
    type: 'humanist',
    abstraction: 35,
    depth: 1,
    count: 8,
    scale: 0.9,
    says: 'falling leaves in rust, amber and ochre',
  },
  {
    id: 'fire',
    label: 'fire',
    words: /\b(fire|flames?|fiery|heat|blaze|blazing|lava|volcanic|volcano|burning)\b/,
    forms: 'flame',
    light: P('#fff0e2', '#2a0f08', '#e43f1c', '#ff9a1f', '#ffd27a', '#c2271b'),
    dark: P('#1a0b07', '#fff1e0', '#ff6a1a', '#ffb02e', '#c2271b', '#ffd27a'),
    sky: { light: ['#ffd9b5', '#fff4ea'], dark: ['#0f0503', '#4a1206'] },
    prefers: 'dark',
    type: 'expressive',
    abstraction: 55,
    depth: 2,
    count: 3,
    scale: 1.1,
    says: 'flames rising from the foot, ember reds and oranges on a dark ground',
  },
  {
    id: 'winter',
    label: 'winter',
    words: /\b(winter|wintry|snow|snowy|snowfall|ice|icy|frost|frosty|frozen|arctic|glacier|polar|christmas|festive)\b/,
    forms: 'snow',
    light: P('#eef5fb', '#13233a', '#3b82c4', '#ffffff', '#b9d4ea', '#dbe9f6'),
    dark: P('#0e1a2b', '#eef5fb', '#9fd1ff', '#4b6b8f', '#203550', '#ffffff'),
    sky: { light: ['#d8e8f6', '#f8fbff'], dark: ['#08111d', '#24405f'] },
    prefers: 'light',
    type: 'refined',
    abstraction: 40,
    depth: 2,
    count: 9,
    scale: 1,
    says: 'falling snowflakes, ice blues and white',
  },
  {
    id: 'neon',
    label: 'neon night',
    words: /\b(neon|nightlife|night club|nightclub|club night|synthwave|vaporwave|cyberpunk|electric night|rave)\b/,
    forms: 'ring',
    forms2: 'line',
    light: P('#f3effa', '#140b24', '#ff2fb3', '#2de2e6', '#7b2ff7', '#ffffff'),
    dark: P('#0b0716', '#f7f3ff', '#ff2fb3', '#2de2e6', '#7b2ff7', '#1b1236'),
    sky: { light: ['#e9e1f7', '#f8f5fd'], dark: ['#06030f', '#22104a'] },
    prefers: 'dark',
    type: 'futuristic',
    abstraction: 85,
    depth: 2,
    count: 4,
    scale: 1,
    says: 'glowing rings and lines in magenta and cyan on a near-black night',
  },
  {
    id: 'tech',
    label: 'technology',
    words: /\b(tech|technology|technological|digital|circuits?|data|software|code|coding|network|networks|cyber|ai)\b/,
    forms: 'grid',
    forms2: 'line',
    light: P('#f1f4f9', '#0b1220', '#2f6bff', '#00c2a8', '#c9d3e3', '#ffffff'),
    dark: P('#0a0f1a', '#e8f0ff', '#3df2c4', '#3a7bff', '#1c2a44', '#9fb3d6'),
    sky: { light: ['#e4eaf4', '#f8fafd'], dark: ['#05080f', '#14213a'] },
    prefers: 'dark',
    type: 'futuristic',
    abstraction: 90,
    depth: 1,
    count: 2,
    scale: 1,
    says: 'a fine technical grid and rules, a luminous signal colour on a deep ground',
  },
  {
    id: 'paper',
    label: 'paper and craft',
    words: /\b(paper|papercut|paper-?cut|craft|crafted|handmade|hand-?made|collage|cut-?outs?|origami|kraft|scrapbook)\b/,
    forms: 'organic',
    light: P('#f2eadc', '#2a2118', '#d8573a', '#2f6f73', '#e8b44c', '#f8f3ea'),
    dark: P('#231c15', '#f2eadc', '#f07a52', '#3f8a8e', '#d9a23f', '#3a3027'),
    sky: { light: ['#efe5d4', '#f8f3ea'], dark: ['#17120d', '#3a3027'] },
    prefers: 'light',
    type: 'humanist',
    abstraction: 55,
    depth: 1,
    count: 4,
    scale: 1,
    says: 'cut-paper shapes casting soft shadows, warm paper with ink and clay colours',
  },
  {
    id: 'geometric',
    label: 'geometry',
    words: /\b(geometric|geometry|bauhaus|constructivist|modernist shapes|circles and squares)\b/,
    forms: 'ring',
    forms2: 'block',
    light: P('#f2efe6', '#141414', '#e1251b', '#1f4fa3', '#f2c230', '#ffffff'),
    dark: P('#141414', '#f2efe6', '#f2c230', '#e1251b', '#1f4fa3', '#2a2a2a'),
    sky: { light: ['#f2efe6', '#f2efe6'], dark: ['#141414', '#141414'] },
    prefers: 'light',
    type: 'grotesk',
    abstraction: 92,
    depth: 0,
    count: 3,
    scale: 1.1,
    says: 'primary-coloured circles and blocks, a flat modernist ground',
  },
  {
    id: 'rain',
    label: 'rain',
    words: /\b(rain|rainy|raindrops?|drops|droplets?|bubbles?|drizzle|storm|stormy)\b/,
    forms: 'drop',
    light: P('#e8f0f6', '#13263a', '#2f7fd6', '#9cbcd8', '#ffffff', '#c9dbea'),
    dark: P('#0f1b28', '#e8f0f6', '#7fb6ff', '#2c4a66', '#5d7c99', '#c9dbea'),
    sky: { light: ['#d2e1ee', '#f4f8fb'], dark: ['#09121b', '#24394f'] },
    prefers: 'light',
    type: 'neutral',
    abstraction: 60,
    depth: 2,
    count: 9,
    scale: 0.9,
    says: 'falling drops and rain blues',
  },
];

export const themeById = (id: string | undefined) => THEMES.find((t) => t.id === id) ?? null;

/** The theme words name, if any ("cloud themed", "give it an ocean feel", "make it cosmic"). */
export function themeIn(words: string): Theme | null {
  const w = words.toLowerCase();
  for (const t of THEMES) if (t.words.test(w)) return t;
  return null;
}

// ── typographic characters: real pairings from the font library ──

export const TYPE_CHARACTERS = ['editorial', 'refined', 'luxury', 'futuristic', 'geometric', 'expressive', 'grotesk', 'humanist', 'soft', 'retro', 'mono', 'classical', 'neutral', 'condensed', 'friendly'] as const;
export type TypeCharacter = (typeof TYPE_CHARACTERS)[number];

export interface TypeSet {
  display: string;
  body: string;
  /** the display weight */
  weight: number;
  case: 'none' | 'upper';
  /** tracking of the display face, in thousandths of an em */
  tracking: number;
}

const T = (display: string, body: string, weight: number, kase: 'none' | 'upper', tracking: number): TypeSet => ({ display, body, weight, case: kase, tracking });

export const TYPE_SETS: Record<TypeCharacter, TypeSet[]> = {
  editorial: [T('Instrument Serif', 'Inter', 400, 'none', -10), T('Newsreader', 'Newsreader', 500, 'none', -15), T('Fraunces', 'Inter', 400, 'none', -20), T('Playfair Display', 'Source Serif 4', 500, 'none', -10)],
  refined: [T('Cormorant Garamond', 'Inter', 500, 'none', 0), T('Bodoni Moda', 'Manrope', 400, 'none', 0), T('Italiana', 'Karla', 400, 'none', 20)],
  luxury: [T('Bodoni Moda', 'Manrope', 400, 'none', 10), T('Cormorant Garamond', 'Manrope', 400, 'upper', 80), T('Cinzel', 'Karla', 400, 'upper', 60)],
  futuristic: [T('Orbitron', 'Space Grotesk', 600, 'upper', 60), T('Unbounded', 'Space Grotesk', 600, 'upper', 20), T('Michroma', 'IBM Plex Mono', 400, 'upper', 40), T('Syncopate', 'Geist Mono', 700, 'upper', 80)],
  geometric: [T('Outfit', 'DM Sans', 700, 'none', -10), T('Sora', 'Inter', 700, 'none', -15), T('Urbanist', 'Manrope', 700, 'none', -10), T('Red Hat Display', 'Inter', 800, 'none', -15)],
  expressive: [T('Anton', 'Work Sans', 400, 'upper', 0), T('Dela Gothic One', 'Archivo', 400, 'upper', -10), T('Bricolage Grotesque', 'Work Sans', 800, 'none', -30), T('Syne', 'Inter', 800, 'upper', -10)],
  grotesk: [T('Archivo Black', 'Archivo', 400, 'upper', -20), T('Familjen Grotesk', 'IBM Plex Sans', 700, 'none', -20), T('Schibsted Grotesk', 'Schibsted Grotesk', 800, 'none', -25)],
  humanist: [T('Fraunces', 'Karla', 600, 'none', -10), T('Young Serif', 'Figtree', 400, 'none', -10), T('DM Serif Display', 'Lora', 400, 'none', -5)],
  soft: [T('Fraunces', 'Figtree', 300, 'none', -10), T('Urbanist', 'Figtree', 300, 'none', 0), T('Figtree', 'Figtree', 500, 'none', -10)],
  retro: [T('Abril Fatface', 'Lora', 400, 'none', 0), T('Young Serif', 'Karla', 400, 'none', -10), T('Alfa Slab One', 'Work Sans', 400, 'none', 0), T('Bricolage Grotesque', 'Lora', 700, 'none', -20)],
  mono: [T('Space Mono', 'Space Mono', 700, 'upper', 20), T('JetBrains Mono', 'IBM Plex Sans', 700, 'upper', 0), T('Martian Mono', 'Geist', 600, 'upper', 10)],
  classical: [T('EB Garamond', 'EB Garamond', 500, 'none', 0), T('Libre Caslon Text', 'Source Serif 4', 400, 'none', 0), T('Cinzel', 'EB Garamond', 400, 'upper', 40)],
  neutral: [T('Inter', 'Inter', 700, 'none', -20), T('Geist', 'Geist', 700, 'none', -20), T('IBM Plex Sans', 'IBM Plex Sans', 700, 'none', -10)],
  condensed: [T('Bebas Neue', 'Barlow Condensed', 400, 'upper', 10), T('Oswald', 'Work Sans', 600, 'upper', 0), T('Big Shoulders Display', 'Inter', 800, 'upper', 0)],
  friendly: [T('Rubik', 'Rubik', 700, 'none', -10), T('Figtree', 'Figtree', 800, 'none', -15), T('Urbanist', 'Figtree', 800, 'none', -10)],
};

export const CHARACTER_LABEL: Record<TypeCharacter, string> = {
  editorial: 'editorial',
  refined: 'refined',
  luxury: 'luxurious',
  futuristic: 'futuristic',
  geometric: 'geometric',
  expressive: 'expressive',
  grotesk: 'grotesk',
  humanist: 'warm, humanist',
  soft: 'soft',
  retro: 'retro',
  mono: 'technical monospace',
  classical: 'classical',
  neutral: 'neutral',
  condensed: 'condensed poster',
  friendly: 'friendly, rounded',
};

const CHARACTER_WORDS: readonly [RegExp, TypeCharacter][] = [
  [/\beditorial|magazine|literary\b/, 'editorial'],
  [/\b(refined|elegant|sophisticat\w*|graceful|delicate)\b/, 'refined'],
  [/\b(luxur\w*|premium|high-?end|upscale|exclusive|couture)\b/, 'luxury'],
  [/\b(futuris\w*|sci-?fi|space-?age|technical|techy)\b/, 'futuristic'],
  [/\b(geometric|modern|contemporary|clean)\b/, 'geometric'],
  [/\b(expressive|loud|shouty|bold|punchy|impactful)\b/, 'expressive'],
  [/\b(grotesk|brutal\w*|raw|industrial|gritty)\b/, 'grotesk'],
  [/\b(humanist|warm|human|organic|natural)\b/, 'humanist'],
  [/\b(soft|gentle|light|airy|delicate)\b/, 'soft'],
  [/\b(retro|vintage|nostalgic|70s|seventies|60s|sixties)\b/, 'retro'],
  [/\b(mono|monospaced?|typewriter|code|coder)\b/, 'mono'],
  [/\b(classical|classic|timeless|heritage|traditional|bookish)\b/, 'classical'],
  [/\b(neutral|plain|corporate|professional|swiss)\b/, 'neutral'],
  [/\b(condensed|narrow|tall|compressed|poster)\b/, 'condensed'],
  [/\b(friendly|rounded|round|playful|fun|cheerful)\b/, 'friendly'],
];

/** The typographic character words name ("more editorial typography", "a futuristic face"), if any. */
export function characterIn(words: string): TypeCharacter | null {
  const w = words.toLowerCase();
  for (const [re, c] of CHARACTER_WORDS) if (re.test(w)) return c;
  return null;
}

/** A pairing of the character, different from the faces in use (the next one along, so asking again moves on). */
export function typeSetFor(character: TypeCharacter, current: { display: string; body: string }, turn = 0): TypeSet {
  const sets = TYPE_SETS[character];
  const fresh = sets.filter((s) => s.display !== current.display);
  const list = fresh.length ? fresh : sets;
  return list[Math.abs(turn) % list.length];
}

/** The character a face reads as (for describing a concept's type). */
export function characterOfFace(face: string): TypeCharacter {
  for (const c of TYPE_CHARACTERS) if (TYPE_SETS[c].some((s) => s.display === face)) return c;
  if (/serif|garamond|caslon|baskerville|lora|spectral|literata|crimson/i.test(face)) return 'editorial';
  if (/mono/i.test(face)) return 'mono';
  return 'neutral';
}

// ── qualities: moves on decisions ──

export const PALETTE_SHIFTS = ['warmer', 'cooler', 'darker', 'lighter', 'muted', 'vivid', 'contrast', 'monochrome', 'restrained', 'metallic', 'pastel', 'neon', 'vintage', 'earthy', 'richer'] as const;
export type PaletteShift = (typeof PALETTE_SHIFTS)[number];

export interface Quality {
  id: string;
  label: string;
  words: RegExp;
  palette?: PaletteShift[];
  type?: TypeCharacter;
  /** the composition: more room, fuller, asymmetric, or a concept away from the current one */
  composition?: 'airy' | 'denser' | 'asymmetric' | 'unexpected';
  /** the forms: their kind when there are none yet, and how they change */
  /** kind: the forms it brings when there are none (or in place of those there, when it replaces) */
  forms?: { kind?: FormKind; replace?: boolean; abstraction?: number; count?: number; scale?: number };
  depth?: number;
  background?: 'gradient' | 'flat' | 'texture';
  says: string;
}

export const QUALITIES: readonly Quality[] = [
  { id: 'futuristic', label: 'futuristic', words: /\b(futuris\w*|sci-?fi|space-?age|tomorrow|cyber|high-?tech|techno)\b/, palette: ['cooler', 'darker', 'neon'], type: 'futuristic', forms: { kind: 'grid', abstraction: 30 }, depth: 1, background: 'gradient', says: 'a cool dark ground, a luminous accent, wide geometric capitals and fine technical lines' },
  { id: 'editorial', label: 'editorial', words: /\b(editorial|magazine|literary|journalistic)\b/, palette: ['restrained'], type: 'editorial', composition: 'airy', forms: { count: -0.3 }, says: 'an editorial serif in sentence case, a restrained palette and more room' },
  { id: 'sophisticated', label: 'sophisticated', words: /\b(sophisticat\w*|elegant|elegance|refined|classy|tasteful|grown-?up|subtle|understated|mature)\b/, palette: ['muted', 'restrained'], type: 'refined', composition: 'airy', forms: { abstraction: 25, count: -0.4, scale: -0.15 }, depth: 0, says: 'a muted, restrained palette, a refined face, fewer and more abstract forms, more air' },
  { id: 'premium', label: 'premium', words: /\b(premium|luxur\w*|high-?end|upscale|exclusive|prestig\w*|opulent|couture|boutique)\b/, palette: ['darker', 'metallic', 'restrained'], type: 'luxury', composition: 'airy', forms: { abstraction: 20, count: -0.5 }, depth: 1, background: 'gradient', says: 'a deep ground with a metallic accent, a luxurious face set with space around it, fewer forms' },
  { id: 'expressive', label: 'expressive', words: /\b(expressive|express itself|bolder|bold|loud|punchy|energetic|impactful|striking|wild|pop|pops|stand out|stands out|eye-?catching|attention-?grabbing)\b/, palette: ['vivid', 'contrast'], type: 'expressive', composition: 'asymmetric', forms: { count: 0.2, scale: 0.35 }, says: 'vivid contrast, heavy expressive type and larger, freer forms' },
  { id: 'depth', label: 'deeper', words: /\b(depth|dimension\w*|layered|layers|3d|three-?dimensional|deeper)\b/, depth: 1, background: 'gradient', forms: { count: 0.25 }, says: 'layered forms with shadows and distance, a graded ground' },
  { id: 'alive', label: 'alive', words: /\b(alive|lively|vibrant|living|dynamic|energy|energised|energized|fresh|vital|buzzing|animated)\b/, palette: ['vivid', 'warmer'], composition: 'asymmetric', forms: { count: 0.5, scale: 0.1 }, depth: 1, says: 'warmer, more vivid colour, more forms moving through the space, a little depth' },
  { id: 'dramatic', label: 'dramatic', words: /\b(dramatic|drama|intense|cinematic|powerful|theatrical|moody)\b/, palette: ['darker', 'contrast', 'richer'], type: 'expressive', forms: { scale: 0.4 }, depth: 2, says: 'a dark, high-contrast ground, heavier type and larger forms with deep shadow' },
  { id: 'original', label: 'original', words: /\b(original|unique|distinctive|less generic|not generic|too generic|generic|unexpected|surprising|fresh idea|unusual|one of a kind|different)\b/, composition: 'unexpected', forms: { abstraction: 30 }, says: 'a concept away from the usual arrangement, an unexpected type character and form' },
  { id: 'minimal', label: 'minimal', words: /\b(minimal\w*|simpler|simple|cleaner|clean|calmer|quieter|less busy|declutter\w*|strip\w* back|pared back)\b/, palette: ['restrained'], composition: 'airy', forms: { count: -0.6, abstraction: 20 }, depth: -1, says: 'fewer elements, a restrained palette and generous space' },
  { id: 'playful', label: 'playful', words: /\b(playful|fun|funny|friendly|joyful|cheerful|whimsical|quirky|happy)\b/, palette: ['vivid', 'pastel'], type: 'friendly', forms: { kind: 'organic', count: 0.3, scale: 0.1 }, says: 'bright, friendly colour, rounded type and bouncy organic forms' },
  { id: 'calm', label: 'calm', words: /\b(calm|serene|peaceful|tranquil|gentle|soothing|relaxed|relaxing|soft|softer|dreamy|ethereal)\b/, palette: ['muted', 'pastel', 'cooler'], type: 'soft', forms: { abstraction: 20, count: -0.2 }, depth: 1, says: 'soft, cool, muted colour, soft type, gentle forms and atmospheric depth' },
  { id: 'warm', label: 'warmer', words: /\b(warm|warmer|cosy|cozy|inviting)\b/, palette: ['warmer'], says: 'warmer colour' },
  { id: 'cool', label: 'cooler', words: /\b(cool|cooler|icy|crisp|fresh blue)\b/, palette: ['cooler'], says: 'cooler colour' },
  { id: 'dark', label: 'darker', words: /\b(dark|darker|night|nocturnal|dark mode|after dark|moodier)\b/, palette: ['darker'], says: 'a dark ground, light words' },
  { id: 'light', label: 'lighter', words: /\b(lighter|brighter|bright|daylight|sunnier|airier|airy)\b/, palette: ['lighter'], says: 'a light ground, dark words' },
  { id: 'colourful', label: 'more colourful', words: /\b(colou?rful|more colou?r|saturated|vivid|punchier colou?rs?)\b/, palette: ['vivid'], says: 'more vivid colour' },
  { id: 'muted', label: 'more muted', words: /\b(muted|desaturat\w*|toned down|dusty|washed)\b/, palette: ['muted'], says: 'muted colour' },
  { id: 'mono', label: 'monochrome', words: /\b(monochrom\w*|black and white|b&w|greyscale|grayscale|one colou?r)\b/, palette: ['monochrome'], says: 'one colour and its shades' },
  { id: 'retro', label: 'retro', words: /\b(retro|vintage|nostalgic|old-?school|70s|seventies|60s|sixties|80s|eighties)\b/, palette: ['vintage'], type: 'retro', background: 'texture', depth: 0, says: 'faded vintage colour, a retro face and a printed grain' },
  { id: 'raw', label: 'raw', words: /\b(raw|brutal\w*|gritty|edgy|punk|grunge|industrial|underground)\b/, palette: ['monochrome', 'contrast'], type: 'grotesk', depth: -2, background: 'flat', says: 'stark contrast, heavy grotesk capitals, no polish' },
  { id: 'modern', label: 'modern', words: /\b(modern|contemporary|current|up to date|updated)\b/, palette: ['restrained'], type: 'geometric', says: 'a contemporary geometric face and a restrained palette' },
  { id: 'corporate', label: 'professional', words: /\b(corporate|professional|business-?like|trustworthy|credible|serious)\b/, palette: ['restrained', 'cooler'], type: 'neutral', forms: { count: -0.5 }, depth: 0, says: 'a neutral face, a cool restrained palette, fewer forms' },
  { id: 'organic', label: 'organic', words: /\b(organic|earthy|natural|handmade|hand-made|botanical feel)\b/, palette: ['earthy'], type: 'humanist', forms: { kind: 'organic', replace: true, abstraction: 15 }, says: 'earthy colour, a warm humanist face and organic forms' },
  { id: 'classic', label: 'classic', words: /\b(classic|classical|timeless|heritage|traditional|historic)\b/, palette: ['restrained', 'muted'], type: 'classical', says: 'a classical face and a quiet palette' },
];

/** The qualities words name, in the order they are said ("more sophisticated", "too generic", "alive"). */
export function qualitiesIn(words: string): Quality[] {
  const w = words.toLowerCase();
  const hits: { q: Quality; at: number }[] = [];
  for (const q of QUALITIES) {
    const m = w.match(q.words);
    if (m && m.index !== undefined) hits.push({ q, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.q);
}

export const qualityById = (id: string) => QUALITIES.find((q) => q.id === id) ?? null;

// ── palettes: shifted, made readable, turned into tokens ──

const shiftHue = (hex: string, toward: number, by: number) => {
  const [h, s, l] = hslOf(hex);
  const d = ((((toward - h) % 360) + 540) % 360) - 180;
  return hslHex(h + Math.sign(d) * Math.min(Math.abs(d), by), s, l);
};
/** A temperature for a ground: a grey has no hue worth keeping, so it takes the new one outright, faintly tinted. */
const temper = (hex: string, toward: number, by: number) => {
  const [, s, l] = hslOf(hex);
  return s < 0.14 ? hslHex(toward, Math.max(s, l < 0.5 ? 0.22 : 0.16), l) : shiftHue(hex, toward, by);
};
const withHsl = (hex: string, f: (h: number, s: number, l: number) => [number, number, number]) => {
  const [h, s, l] = hslOf(hex);
  const [a, b, c] = f(h, s, l);
  return hslHex(a, b, c);
};

/** One colour moved by a shift, on its own (an object's colour changed without the rest of the palette). */
export function nudgeColour(hex: string, shift: PaletteShift): string {
  if (!/^#[0-9a-f]{6}/i.test(hex)) return hex;
  const c = hex.slice(0, 7).toLowerCase();
  switch (shift) {
    case 'warmer':
      return shiftHue(c, 30, 24);
    case 'cooler':
      return shiftHue(c, 215, 30);
    case 'darker':
      return withHsl(c, (h, s, l) => [h, s, Math.max(0.06, l * 0.72)]);
    case 'lighter':
      return withHsl(c, (h, s, l) => [h, s, Math.min(0.94, l + (1 - l) * 0.35)]);
    case 'vivid':
    case 'neon':
      return withHsl(c, (h, s, l) => [h, Math.min(1, Math.max(0.6, s * 1.4)), Math.min(0.6, Math.max(0.4, l))]);
    case 'muted':
    case 'restrained':
      return withHsl(c, (h, s, l) => [h, s * 0.5, l]);
    case 'pastel':
      return withHsl(c, (h, s) => [h, Math.min(0.55, s), 0.8]);
    case 'monochrome':
      return withHsl(c, (h, _s, l) => [h, 0.04, l]);
    case 'richer':
      return withHsl(c, (h, s, l) => [h, Math.min(1, s * 1.15), Math.max(0.12, l * 0.85)]);
    case 'earthy':
      return withHsl(shiftHue(c, 30, 30), (h, s, l) => [h, s * 0.6, l * 0.9]);
    case 'vintage':
      return withHsl(c, (h, s, l) => [h, s * 0.65, Math.min(0.9, l * 1.05)]);
    case 'metallic':
      return hslOf(c)[2] < 0.5 ? '#a8843e' : '#c9a86a';
    case 'contrast':
      return withHsl(c, (h, s, l) => [h, s, l < 0.5 ? Math.max(0.05, l * 0.6) : Math.min(0.97, l + (1 - l) * 0.5)]);
  }
  return c;
}

/** A palette moved by one shift, the way a designer would move it. */
export function shiftPalette(p: Palette, shift: PaletteShift): Palette {
  const all = (f: (c: string) => string): Palette => ({ ground: f(p.ground), ink: f(p.ink), accent: f(p.accent), support: p.support.map(f) });
  switch (shift) {
    case 'warmer':
      return { ground: temper(p.ground, 35, 18), ink: p.ink, accent: shiftHue(p.accent, 20, 30), support: p.support.map((c) => shiftHue(c, 35, 25)) };
    case 'cooler':
      return { ground: temper(p.ground, 222, 18), ink: p.ink, accent: shiftHue(p.accent, 210, 40), support: p.support.map((c) => shiftHue(c, 215, 30)) };
    case 'darker': {
      const [h, s] = hslOf(p.ground);
      // a grey ground stays a grey (a hue it never had is not invented); a tinted one keeps its tint, deepened
      return { ground: hslHex(h, s < 0.06 ? s : Math.min(0.45, s * 0.8 + 0.08), 0.11), ink: withHsl(p.ink, (hh, ss) => [hh, ss * 0.3, 0.94]), accent: withHsl(p.accent, (hh, ss, ll) => [hh, Math.max(0.55, ss), Math.max(0.58, ll)]), support: p.support.map((c) => withHsl(c, (hh, ss, ll) => [hh, ss * 0.8, Math.min(0.45, ll * 0.6 + 0.12)])) };
    }
    case 'lighter': {
      const [h, s] = hslOf(p.ground);
      return { ground: hslHex(h, Math.min(0.35, s), 0.95), ink: withHsl(p.ink, (hh, ss) => [hh, ss * 0.5, 0.13]), accent: withHsl(p.accent, (hh, ss, ll) => [hh, ss, Math.min(0.52, ll)]), support: p.support.map((c) => withHsl(c, (hh, ss, ll) => [hh, ss * 0.8, Math.max(0.72, ll)])) };
    }
    case 'muted':
      return all((c) => (c === p.ink ? c : withHsl(c, (h, s, l) => [h, s * 0.5, l])));
    case 'vivid':
      return { ground: p.ground, ink: p.ink, accent: withHsl(p.accent, (h, s, l) => [h, Math.max(0.78, Math.min(1, s * 1.35)), Math.min(0.58, Math.max(0.45, l))]), support: p.support.map((c) => withHsl(c, (h, s, l) => [h, Math.min(1, Math.max(0.6, s * 1.3)), l])) };
    case 'contrast':
      return { ...p, ink: contrastRatio(p.ink, p.ground) >= 7 ? p.ink : hslOf(p.ground)[2] > 0.5 ? '#111111' : '#f7f7f5' };
    case 'monochrome': {
      const [h] = hslOf(p.ink);
      return { ground: hslHex(h, 0.04, hslOf(p.ground)[2]), ink: hslHex(h, 0.06, hslOf(p.ink)[2]), accent: hslHex(h, 0.06, hslOf(p.ground)[2] > 0.5 ? 0.22 : 0.82), support: [hslHex(h, 0.04, 0.55), hslHex(h, 0.04, hslOf(p.ground)[2] > 0.5 ? 0.82 : 0.3)] };
    }
    case 'restrained':
      return { ground: p.ground, ink: p.ink, accent: withHsl(p.accent, (h, s, l) => [h, s * 0.85, l]), support: p.support.slice(0, 1).map((c) => mix(c, p.ground, 0.35)) };
    case 'metallic': {
      const dark = hslOf(p.ground)[2] < 0.5;
      const gold = dark ? '#c9a86a' : '#a8843e';
      return { ...p, accent: gold, support: [dark ? '#8a7448' : '#d8c08a', ...p.support.slice(0, 1)] };
    }
    case 'pastel':
      return { ground: withHsl(p.ground, (h, s) => [h, Math.min(0.5, s + 0.1), 0.95]), ink: p.ink, accent: withHsl(p.accent, (h, s) => [h, Math.min(0.6, s), 0.68]), support: p.support.map((c) => withHsl(c, (h, s) => [h, Math.min(0.55, s), 0.8])) };
    case 'neon': {
      const dark = hslOf(p.ground)[2] < 0.5;
      const [h] = hslOf(p.accent);
      const hue = h > 60 && h < 250 ? 175 : 320;
      return { ...p, accent: hslHex(hue, 1, dark ? 0.6 : 0.45), support: [hslHex(hue === 175 ? 285 : 190, 0.95, dark ? 0.62 : 0.5), ...p.support.slice(0, 1)] };
    }
    case 'vintage':
      return { ground: withHsl(shiftHue(p.ground, 40, 25), (h, s, l) => [h, Math.min(0.4, s * 0.7 + 0.12), l > 0.5 ? 0.9 : l]), ink: withHsl(p.ink, (h, s, l) => [h, s * 0.6, l]), accent: withHsl(shiftHue(p.accent, 20, 20), (h, s, l) => [h, s * 0.7, l]), support: p.support.map((c) => withHsl(shiftHue(c, 40, 20), (h, s, l) => [h, s * 0.65, l])) };
    case 'earthy':
      return { ground: withHsl(shiftHue(p.ground, 40, 30), (h, s, l) => [h, Math.min(0.3, s), l]), ink: p.ink, accent: withHsl(shiftHue(p.accent, 25, 45), (h, s, l) => [h, Math.min(0.62, s), Math.min(0.48, l)]), support: p.support.map((c) => withHsl(shiftHue(c, 80, 40), (h, s, l) => [h, Math.min(0.4, s), l])) };
    case 'richer':
      return { ...p, accent: withHsl(p.accent, (h, s, l) => [h, Math.min(1, s * 1.15 + 0.05), Math.max(0.36, l * 0.88)]) };
  }
}

const readable = (ink: string, ground: string, ratio: number) => {
  if (contrastRatio(ink, ground) >= ratio) return ink;
  const light = hslOf(ground)[2] < 0.5;
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const c = mix(ink, light ? '#ffffff' : '#000000', t);
    if (contrastRatio(c, ground) >= ratio) return c;
  }
  return light ? '#ffffff' : '#111111';
};

/** A palette as the document's tokens: text that reads on the ground, a muted tone, a line, the accent's own text. */
export function tokensOf(p: Palette): { colors: { background: string; surface: string; text: string; muted: string; accent: string; accentText: string; line: string }; accent2?: string } {
  const text = readable(p.ink, p.ground, 7);
  const muted = readable(mix(text, p.ground, 0.38), p.ground, 4.5);
  const accentText = contrastRatio('#ffffff', p.accent) >= contrastRatio('#111111', p.accent) ? '#ffffff' : '#111111';
  return {
    colors: { background: p.ground, surface: mix(p.ground, text, 0.05), text, muted, accent: p.accent, accentText, line: mix(text, p.ground, 0.82) },
    ...(p.support[0] ? { accent2: p.support[0] } : {}),
  };
}
