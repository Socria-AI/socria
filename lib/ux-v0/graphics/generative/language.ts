// lib/ux-v0/graphics/generative/language.ts — a visual language generated from a brief's temperament rather than
// picked from a list of styles: a palette (an ink, a paper, a primary, a second ink, an accent, a muted tone) whose
// hues, saturations and lightnesses follow the personality the brief describes, and a type pairing from the licensed
// faces SocriaUX serves (Google Fonts, open licences), with a case and a weight. Seeded: the same brief and seed, the
// same language; another seed, a different one in the same temperament. Every pairing is checked for contrast (the
// ink on the paper for reading, the primary for a mark, the paper on the primary for a reversed one). The generic
// technology look (an electric blue or violet, a geometric tech sans) can be ruled out on request.

import { contrastRatio } from '../../../ux/audit';
import { hslHex, hslOf, mix } from '../../color';
import { ensureContrast } from '../../spec';
import { rng } from './util';

export interface LanguagePalette {
  ink: string;
  paper: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
}
export interface VisualLanguage {
  palette: LanguagePalette;
  fonts: { display: string; text: string; displayWeight: number; case: 'upper' | 'lower' | 'none' };
  /** the harmony the palette was built on */
  harmony: 'tonal' | 'analogous' | 'complementary' | 'split' | 'neutral-signal';
  /** what the language is, said plainly (why these hues, why these faces) */
  said: string[];
}

interface Temper {
  hues: number[];
  sat: [number, number];
  light: [number, number];
  harmony: VisualLanguage['harmony'][];
  display: string[];
  text: string[];
  weight: [number, number];
  case: VisualLanguage['fonts']['case'][];
  word: string;
}

/** Each temperament's range: hues, how vivid, how deep, the harmonies and the faces that suit it. */
const TEMPER: Record<string, Temper> = {
  warm: {
    hues: [12, 22, 32, 44],
    sat: [0.5, 0.72],
    light: [0.38, 0.5],
    harmony: ['analogous', 'complementary'],
    display: ['Fraunces', 'DM Serif Display', 'Young Serif', 'Hanken Grotesk', 'Figtree'],
    text: ['Hanken Grotesk', 'Figtree', 'Lora'],
    weight: [500, 700],
    case: ['none', 'lower'],
    word: 'warm earth and clay',
  },
  natural: {
    hues: [88, 105, 140, 34, 28],
    sat: [0.28, 0.48],
    light: [0.28, 0.4],
    harmony: ['analogous', 'tonal'],
    display: ['Fraunces', 'Lora', 'Work Sans', 'Hanken Grotesk'],
    text: ['Work Sans', 'Lora', 'Hanken Grotesk'],
    weight: [400, 600],
    case: ['none', 'lower'],
    word: 'moss, olive and soil',
  },
  calm: {
    hues: [172, 188, 200, 214],
    sat: [0.3, 0.5],
    light: [0.26, 0.38],
    harmony: ['tonal', 'analogous'],
    display: ['Manrope', 'Instrument Sans', 'Lora', 'Newsreader'],
    text: ['Manrope', 'Inter', 'Source Serif 4'],
    weight: [400, 600],
    case: ['none', 'lower'],
    word: 'deep, quiet water tones',
  },
  trust: {
    hues: [205, 218, 168, 350],
    sat: [0.32, 0.52],
    light: [0.22, 0.34],
    harmony: ['tonal', 'analogous'],
    display: ['Public Sans', 'Source Serif 4', 'Instrument Sans', 'Libre Baskerville'],
    text: ['Public Sans', 'Inter', 'Source Serif 4'],
    weight: [500, 700],
    case: ['none', 'upper'],
    word: 'steady navy, forest and oxblood',
  },
  playful: {
    hues: [338, 12, 46, 158, 262],
    sat: [0.68, 0.88],
    light: [0.5, 0.58],
    harmony: ['complementary', 'split'],
    display: ['Fredoka', 'Bricolage Grotesque', 'Rubik', 'Nunito', 'Righteous'],
    text: ['Rubik', 'Nunito', 'Figtree'],
    weight: [600, 800],
    case: ['lower', 'none'],
    word: 'bright, clashing pairs',
  },
  refined: {
    hues: [345, 158, 38, 222, 18],
    sat: [0.18, 0.38],
    light: [0.2, 0.3],
    harmony: ['tonal', 'neutral-signal'],
    display: ['Cormorant Garamond', 'Bodoni Moda', 'Prata', 'Gloock', 'Marcellus', 'Italiana'],
    text: ['Source Serif 4', 'Inter', 'EB Garamond'],
    weight: [400, 500],
    case: ['upper', 'none'],
    word: 'deep, quiet colour on ivory',
  },
  bold: {
    hues: [2, 14, 226, 48, 284],
    sat: [0.74, 0.94],
    light: [0.44, 0.54],
    harmony: ['complementary', 'neutral-signal'],
    display: ['Archivo Black', 'Anton', 'Bricolage Grotesque', 'Syne', 'Dela Gothic One', 'Unbounded'],
    text: ['Archivo', 'Inter', 'Schibsted Grotesk'],
    weight: [700, 900],
    case: ['upper', 'none'],
    word: 'saturated primaries',
  },
  precise: {
    hues: [210, 220, 200],
    sat: [0.06, 0.2],
    light: [0.16, 0.26],
    harmony: ['neutral-signal'],
    display: ['Instrument Sans', 'IBM Plex Sans', 'Geist', 'Inter'],
    text: ['Inter', 'IBM Plex Sans', 'Geist Mono'],
    weight: [500, 600],
    case: ['none', 'upper'],
    word: 'cool neutrals with one signal colour',
  },
  expressive: {
    hues: [302, 76, 16, 186, 52],
    sat: [0.6, 0.85],
    light: [0.42, 0.56],
    harmony: ['split', 'complementary'],
    display: ['Syne', 'Bricolage Grotesque', 'Familjen Grotesk', 'Darker Grotesque', 'Anybody'],
    text: ['Familjen Grotesk', 'Epilogue', 'Karla'],
    weight: [600, 800],
    case: ['lower', 'upper'],
    word: 'unexpected, clashing colour',
  },
  serious: {
    hues: [214, 228, 160, 352],
    sat: [0.28, 0.48],
    light: [0.18, 0.28],
    harmony: ['tonal', 'neutral-signal'],
    display: ['Libre Baskerville', 'Source Serif 4', 'Public Sans', 'IBM Plex Serif'],
    text: ['Public Sans', 'Source Serif 4'],
    weight: [500, 700],
    case: ['none', 'upper'],
    word: 'institutional deep colour',
  },
  classic: {
    hues: [356, 214, 150, 30],
    sat: [0.38, 0.58],
    light: [0.24, 0.34],
    harmony: ['tonal', 'analogous'],
    display: ['Libre Caslon Text', 'Playfair Display', 'EB Garamond', 'Cinzel', 'DM Serif Display'],
    text: ['Libre Caslon Text', 'Source Serif 4', 'Lora'],
    weight: [400, 700],
    case: ['none', 'upper'],
    word: 'oxblood, navy and forest',
  },
  modern: {
    hues: [8, 150, 200, 260, 36, 330],
    sat: [0.48, 0.68],
    light: [0.4, 0.5],
    harmony: ['analogous', 'complementary', 'neutral-signal'],
    display: ['Manrope', 'Outfit', 'Plus Jakarta Sans', 'DM Sans', 'Urbanist', 'Instrument Sans'],
    text: ['Inter', 'DM Sans', 'Manrope'],
    weight: [500, 700],
    case: ['lower', 'none'],
    word: 'clear, contemporary colour',
  },
  clever: {
    hues: [16, 172, 48, 280],
    sat: [0.5, 0.7],
    light: [0.38, 0.5],
    harmony: ['complementary', 'analogous'],
    display: ['Space Grotesk', 'Familjen Grotesk', 'Instrument Sans', 'Bricolage Grotesque'],
    text: ['Inter', 'Karla'],
    weight: [500, 700],
    case: ['lower', 'none'],
    word: 'crisp colour with a twist',
  },
  dynamic: {
    hues: [8, 24, 196, 340, 60],
    sat: [0.66, 0.86],
    light: [0.44, 0.54],
    harmony: ['complementary', 'split'],
    display: ['Archivo', 'Chivo', 'Epilogue', 'Schibsted Grotesk', 'Big Shoulders Display'],
    text: ['Archivo', 'Inter'],
    weight: [700, 900],
    case: ['upper', 'none'],
    word: 'energetic, saturated colour',
  },
  minimal: {
    hues: [0, 30, 210],
    sat: [0, 0.12],
    light: [0.1, 0.18],
    harmony: ['neutral-signal'],
    display: ['Inter', 'Instrument Sans', 'Geist', 'Work Sans'],
    text: ['Inter', 'Geist'],
    weight: [400, 600],
    case: ['lower', 'none'],
    word: 'black and paper with one accent',
  },
  young: {
    hues: [46, 330, 190, 12],
    sat: [0.7, 0.9],
    light: [0.52, 0.6],
    harmony: ['split', 'complementary'],
    display: ['Fredoka', 'Nunito', 'Luckiest Guy', 'Rubik'],
    text: ['Nunito', 'Rubik'],
    weight: [600, 800],
    case: ['lower', 'none'],
    word: 'sunny, primary colour',
  },
};

const TECH_FACES = new Set(['Space Grotesk', 'Sora', 'Orbitron', 'Michroma', 'Audiowide', 'Chakra Petch', 'Rajdhani', 'Tektur', 'Exo 2', 'Share Tech Mono', 'Geist', 'Geist Mono', 'Outfit', 'Urbanist']);
const isTechHue = (h: number, s: number) => h >= 185 && h <= 285 && s > 0.5;

/** Hues the things a brief names suggest (bread is warm, the sea is blue-green): a lean, never a rule. */
const THING_HUES: Record<string, number[]> = {
  bread: [32, 38, 26],
  grain: [40, 46, 34],
  coffee: [22, 28],
  tea: [88, 40],
  morning: [40, 30, 18],
  light: [44, 50],
  sun: [40, 28],
  water: [192, 200, 182],
  sea: [196, 186],
  ocean: [206, 196],
  river: [188, 172],
  tide: [194, 204],
  wave: [196, 186],
  rain: [208, 200],
  forest: [140, 150],
  tree: [120, 140],
  leaf: [96, 110],
  garden: [104, 132],
  moss: [80, 92],
  mountain: [210, 26],
  stone: [30, 210],
  night: [232, 248],
  moon: [226, 240],
  star: [48, 230],
  fire: [12, 20],
  flame: [14, 24],
  spark: [40, 18],
  wine: [348, 340],
  berry: [330, 342],
  clay: [16, 24],
  earth: [28, 34],
  sand: [38, 42],
  ice: [196, 204],
  flower: [334, 350, 40],
  bloom: [338, 20],
  honey: [42, 36],
  citrus: [48, 34],
};

/** A visual language for a temperament (see the head of this file). `things` are the brief's named things, whose
 * hues it leans toward. */
export function languageFor(traits: readonly string[], seed: string, opts: { avoidTech?: boolean; preferDark?: boolean; things?: readonly string[] } = {}): VisualLanguage {
  const r = rng('language', seed, traits.join(','));
  const known = traits.filter((t) => TEMPER[t]);
  const tempers = (known.length ? known : ['modern']).map((t) => TEMPER[t]);
  // the first temperament the brief names leads more often than the others
  const lead = tempers.length > 1 && r.chance(0.4) ? r.pick(tempers.slice(1)) : tempers[0];
  const second = tempers.length > 1 ? r.pick(tempers.filter((t) => t !== lead)) : lead;
  // the hue from the leading temperament (or from the things named), its vividness and depth blended with the second
  const hinted = (opts.things ?? []).flatMap((t) => THING_HUES[t.split(' ').pop() ?? t] ?? THING_HUES[t] ?? []);
  let hue = (hinted.length && r.chance(0.7) ? r.pick(hinted) : r.pick(lead.hues)) + r.between(-9, 9);
  const sat = (r.between(...lead.sat) * 2 + r.between(...second.sat)) / 3;
  const light = (r.between(...lead.light) * 2 + r.between(...second.light)) / 3;
  if (opts.avoidTech && isTechHue(((hue % 360) + 360) % 360, sat)) hue = r.pick([14, 28, 40, 150, 340]);
  const harmony = r.pick(lead.harmony);
  const paperWarm = r.chance(lead === TEMPER.calm || lead === TEMPER.precise ? 0.3 : 0.75);
  const paper = opts.preferDark ? hslHex(hue, Math.min(0.3, sat), 0.1) : hslHex(paperWarm ? r.between(36, 48) : r.between(196, 220), r.between(0.18, 0.4), r.between(0.945, 0.97));
  const ink0 = opts.preferDark ? hslHex(paperWarm ? 42 : 210, 0.25, 0.94) : hslHex(hue, Math.min(0.35, sat * 0.5 + 0.08), r.between(0.1, 0.15));
  const ink = ensureContrast(ink0, paper, 7);
  const primary = ensureContrast(hslHex(hue, sat, light), paper, harmony === 'neutral-signal' ? 7 : 3.2);
  const secHue = harmony === 'tonal' ? hue : harmony === 'analogous' ? hue + r.pick([-38, 34, 52]) : harmony === 'complementary' ? hue + 180 + r.between(-12, 12) : harmony === 'split' ? hue + r.pick([150, 210]) : hue;
  const secondary = ensureContrast(harmony === 'tonal' ? hslHex(secHue, sat * 0.75, Math.min(0.62, light + 0.18)) : hslHex(secHue, Math.min(0.9, sat * 0.9), light + r.between(-0.04, 0.08)), paper, 2.4);
  const accentHue = harmony === 'neutral-signal' ? r.pick([18, 74, 352, 44]) : hue + r.pick([150, 180, 210, 120]);
  const accent = ensureContrast(hslHex(accentHue, Math.max(0.62, Math.min(0.92, sat + 0.25)), r.between(0.5, 0.58)), paper, 2);
  const muted = mix(ink, paper, 0.45);
  const faces = (lst: string[]) => (opts.avoidTech ? lst.filter((f) => !TECH_FACES.has(f)) : lst);
  const displayList = faces([...lead.display, ...second.display.slice(0, 2)]);
  const display = r.pick(displayList.length ? displayList : ['Fraunces']);
  const textList = faces(lead.text).filter((f) => f !== display);
  const text = r.pick(textList.length ? textList : ['Inter']);
  const weight = Math.round(r.between(...lead.weight) / 100) * 100;
  const kase = r.pick(lead.case);
  const [h1] = hslOf(primary);
  return {
    palette: { ink, paper, primary, secondary, accent, muted },
    fonts: { display, text, displayWeight: weight, case: kase },
    harmony,
    said: [
      `${lead.word[0].toUpperCase()}${lead.word.slice(1)}${second !== lead ? `, leaning toward ${second.word}` : ''}: a ${harmony.replace('-', ' and ')} palette around a hue of ${Math.round(h1)}°.`,
      `${display} for display${kase === 'upper' ? ' in capitals' : kase === 'lower' ? ' in small letters' : ''}, ${text} for reading (both open-licence faces SocriaUX serves).`,
      `Contrast held: ink on paper ${contrastRatio(ink, paper).toFixed(1)}:1, the primary on paper ${contrastRatio(primary, paper).toFixed(1)}:1.`,
    ],
  };
}

/** Whether a palette reads as the generic technology look (an electric blue or violet primary). */
export function looksTech(p: Pick<LanguagePalette, 'primary' | 'secondary'>): boolean {
  const [h, s] = hslOf(p.primary);
  const [h2, s2] = hslOf(p.secondary);
  return isTechHue(h, s) || (isTechHue(h2, s2) && isTechHue(h, s * 1.2));
}
export const isTechFace = (f: string) => TECH_FACES.has(f);

/** The temperaments a brief's mood words name (for a language generated from the brief). */
export function tempersOf(words: string): string[] {
  const w = words.toLowerCase();
  const map: [RegExp, string][] = [
    [/\b(warm|friendly|cosy|cozy|human|welcoming|kind)\b/, 'warm'],
    [/\b(natural|organic|earthy|green|botanical|sustainable)\b/, 'natural'],
    [/\b(calm|quiet|serene|soft|gentle|minimal|restrained)\b/, 'calm'],
    [/\b(playful|fun|joyful|cheerful|quirky|bright)\b/, 'playful'],
    [/\b(luxur\w*|elegant|premium|refined|sophisticated)\b/, 'refined'],
    [/\b(bold|loud|daring|strong|brutalist|raw)\b/, 'bold'],
    [/\b(technical|scientific|precise|engineered|data)\b/, 'precise'],
    [/\b(experimental|expressive|artistic|edgy|weird)\b/, 'expressive'],
    [/\b(serious|corporate|institutional|formal)\b/, 'serious'],
    [/\b(classic|heritage|vintage|retro|traditional)\b/, 'classic'],
    [/\b(energetic|dynamic|fast|kinetic|festival|sport)\b/, 'dynamic'],
    [/\b(modern|contemporary|clean|fresh)\b/, 'modern'],
  ];
  return [...new Set(map.filter(([re]) => re.test(w)).map(([, t]) => t))];
}

/** A direction whose language is generated from the brief itself (no style profile): its palette and faces from the
 * temperament the brief's words describe and the things it names, its weight and case from the same reading. The
 * generative engine composes in it from principles read from the brief. */
export function languageDirection(words: string, mood: readonly string[], seed: string, things: readonly string[] = []): import('../compose').GraphicDirection {
  const traits = [...new Set([...tempersOf([words, ...mood].join(' ')), ...mood.flatMap((m) => tempersOf(m))])];
  const lang = languageFor(traits.length ? traits : ['modern'], `dir|${seed}`, { things });
  const p = lang.palette;
  const intensity = traits.includes('bold') || traits.includes('dynamic') || traits.includes('expressive') ? 70 : traits.includes('calm') || traits.includes('refined') ? 25 : 45;
  const name = `${(traits[0] ?? 'modern').replace(/^./, (c) => c.toUpperCase())} language, from the brief`;
  return {
    name,
    language: traits.includes('calm') || traits.includes('refined') ? 'gallery' : traits.includes('bold') ? 'poster' : traits.includes('precise') ? 'swiss' : 'editorial',
    concept: `${lang.said[0]} ${lang.said[1]}`.slice(0, 400),
    tokens: {
      colors: { background: p.paper, surface: mix(p.paper, '#ffffff', 0.5), text: p.ink, muted: p.muted, accent: p.primary, accentText: contrastRatio(p.paper, p.primary) >= 4.5 ? p.paper : p.ink, line: mix(p.ink, p.paper, 0.8) },
      fonts: { display: lang.fonts.display, body: lang.fonts.text },
      accent2: p.accent,
    },
    look: { case: lang.fonts.case === 'upper' ? 'upper' : lang.fonts.case === 'lower' ? 'lower' : 'sentence', tracking: lang.fonts.case === 'upper' ? 'wide' : 'normal', weight: lang.fonts.displayWeight, motifs: [] },
    form: null,
    intensity,
    generative: { seed: `gen|${seed}` },
    origin: 'generated',
  };
}
