// lib/ux-v0/graphics/styles/apply.ts — a style made usable by the composer: its palette, its faces and how they are
// set, the vocabulary the composer speaks, and the construction it builds with.
//
// The palette starts from the style's convention and moves within the profile's own `variation`, seeded by the
// project, so two projects in one style are kin, not twins; a brand's colours are mapped into the style's range
// (or adopted exactly, where the style says so), and a palette or faces the person has locked are never touched.
// Text keeps its contrast whatever the convention: ink is pushed to 4.5:1 (7:1 where the style is high-contrast).

import { contrastRatio } from '../../../ux/audit';
import { nearestWeight } from '../../fonts';
import { ensureContrast } from '../../spec';
import type { GraphicDirection } from '../compose';
import { effectDefaults, type Effect } from '../effects';
import { primDefaults, type Prim } from '../geometry';
import { hslHex, hslOf, mixColor, tintPreset, type Gradient } from '../paint';
import { patternDefaults } from '../patterns';
import type { InkRole, PatternUse, TypeTreatment, VisualVocabulary } from '../vocabulary';
import { effectiveDNA, type Effective, type StyleSelection } from './blend';
import { CONSTRUCTIONS, type Construction, type StyleDNA } from './schema';
import { hash32 } from './hash';

export interface StylePalette {
  ground: string;
  ink: string;
  accent: string;
  accent2: string;
  accent3: string;
  muted: string;
  line: string;
  surface: string;
  accentText: string;
}

export interface StyleRun {
  selection: StyleSelection;
  dna: StyleDNA;
  /** the primary style's id */
  id: string;
  name: string;
  construction: Construction;
  variant: string;
  palette: StylePalette;
  faces: { display: string; body: string; alt: string[] };
  experimentation: number;
  ornament: number;
  density: number;
  seed: number;
  vocab: VisualVocabulary;
  says: string[];
}

const hashOf = hash32;
const unit = (s: string) => (hashOf(s) % 2001) / 1000 - 1;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The style's convention moved within its variation (see the head of this file). */
export function paletteFor(dna: StyleDNA, opts: { seed: string; brand?: readonly string[]; keep?: { background: string; text: string; accent: string; accent2?: string } | null } = { seed: '' }): StylePalette {
  const c = dna.colour;
  const v = c.variation / 100;
  const key = `${opts.seed}|${dna.id}`;
  const shift = (hex: string, role: string, deg: number, light = 0.04) => {
    const [h, s, l] = hslOf(hex);
    if (s < 0.06) return hslHex(h, s, clamp(l + unit(`${key}|${role}|l`) * light * v, 0, 1));
    return hslHex(h + unit(`${key}|${role}|h`) * deg * v, clamp(s + unit(`${key}|${role}|s`) * 0.08 * v, 0, 1), clamp(l + unit(`${key}|${role}|l`) * light * v, 0, 1));
  };
  let ground = c.ground;
  let ink = c.ink;
  let accent = c.accent;
  let accent2 = c.accent2;
  let accent3 = c.accent3;
  if (opts.keep) {
    ground = opts.keep.background;
    ink = opts.keep.text;
    accent = opts.keep.accent;
    accent2 = opts.keep.accent2 ?? accent2;
  } else if (c.scheme === 'mono') {
    // one hue in its tints and shades: the whole family turns together
    const d = unit(`${key}|mono`) * 60 * v;
    const turn = (hex: string) => {
      const [h, s, l] = hslOf(hex);
      return s < 0.06 ? hex : hslHex(h + d, s, l);
    };
    ground = turn(ground);
    ink = turn(ink);
    accent = turn(accent);
    accent2 = turn(accent2);
    accent3 = turn(accent3);
  } else {
    ground = shift(ground, 'ground', 8, 0.03);
    accent = shift(accent, 'accent', 30);
    accent2 = shift(accent2, 'accent2', 30);
    accent3 = shift(accent3, 'accent3', 30);
  }
  const brand = (opts.brand ?? []).filter((b) => /^#[0-9a-f]{6}$/i.test(b));
  if (!opts.keep && brand.length && c.brand !== 'ignore') {
    const into = (b: string, conv: string) => {
      if (c.brand === 'adopt') return b;
      const [bh, bs, bl] = hslOf(b);
      const [, cs, cl] = hslOf(conv);
      return hslHex(bh, clamp(bs, Math.max(0, cs - 0.25), Math.min(1, cs + 0.25)), clamp(bl, Math.max(0, cl - 0.15), Math.min(1, cl + 0.15)));
    };
    accent = into(brand[0], c.accent);
    if (brand[1]) accent2 = into(brand[1], c.accent2);
  }
  const strong = c.contrast >= 80 ? 7 : 4.5;
  ink = ensureContrast(ink, ground, strong);
  const dark = hslOf(ground)[2] < 0.45;
  const muted = ensureContrast(mixColor(ink, ground, 0.35).slice(0, 7), ground, 4.5);
  const line = mixColor(ink, ground, 0.72).slice(0, 7);
  const surface = (dark ? mixColor(ground, ink, 0.1) : mixColor(ground, '#ffffff', 0.45)).slice(0, 7);
  const accentText = contrastRatio(ground, accent) >= contrastRatio(ink, accent) ? ensureContrast(ground, accent, 4.5) : ensureContrast(ink, accent, 4.5);
  return { ground, ink, accent, accent2, accent3, muted, line, surface, accentText };
}

/** The faces for a style: one of its first two display faces (by project), its body face, the rest for mixing. */
export function facesFor(dna: StyleDNA, seed: string, keep?: { display: string; body: string } | null): { display: string; body: string; alt: string[] } {
  if (keep) return { display: keep.display, body: keep.body, alt: dna.typography.display.faces.filter((f) => f !== keep.display) };
  const d = dna.typography.display.faces;
  const pick = d.length > 1 && hashOf(`${seed}|${dna.id}|face`) % 3 === 2 ? 1 : 0;
  const display = d[pick] ?? d[0];
  return { display, body: dna.typography.body.faces[0], alt: d.filter((f) => f !== display) };
}

const prim = (kind: string, params: Record<string, number> = {}): Prim | null => {
  const d = primDefaults(kind);
  return d ? { kind, params: { ...d.params, ...params } } : null;
};
const fx = (kind: string, params: Record<string, number> = {}): Effect | null => {
  const e = effectDefaults(kind);
  return e ? { ...e, params: { ...e.params, ...params } } : null;
};
const TYPE_TREATMENTS = ['plain', 'oversized', 'stacked', 'echo', 'outline', 'arc', 'circle', 'wave-path', 'perspective', 'rise', 'wave', 'stagger', 'vertical', 'gradient', 'spaced', 'italic-mix'];

export const GOLD: Gradient = {
  type: 'linear',
  angle: 115,
  stops: [
    { at: 0, color: '#8a6a1f' },
    { at: 0.3, color: '#f6e29a' },
    { at: 0.55, color: '#b88a2c' },
    { at: 0.8, color: '#fff3c4' },
    { at: 1, color: '#7d5c17' },
  ],
};
export const CHROME: Gradient = {
  type: 'linear',
  angle: 90,
  stops: [
    { at: 0, color: '#f7f9fc' },
    { at: 0.42, color: '#9aa4b2' },
    { at: 0.5, color: '#2a3040' },
    { at: 0.58, color: '#c9d2df' },
    { at: 1, color: '#ffffff' },
  ],
};
export const HOLO: Gradient = {
  type: 'conic',
  angle: 30,
  cx: 0.5,
  cy: 0.5,
  stops: [
    { at: 0, color: '#ff9ad5' },
    { at: 0.25, color: '#9ae6ff' },
    { at: 0.5, color: '#c2ffb5' },
    { at: 0.75, color: '#fff3a6' },
    { at: 1, color: '#ff9ad5' },
  ],
};

/** The gradient a style draws with, in its own colours (null: it draws flat). */
export function gradientOf(dna: StyleDNA, p: StylePalette): Gradient | null {
  switch (dna.colour.gradient) {
    case 'metallic':
      return hslOf(p.accent)[1] < 0.2 ? CHROME : (tintPreset(GOLD, p.accent) as Gradient);
    case 'iridescent':
      return HOLO;
    case 'sunset':
      return {
        type: 'linear',
        angle: 180,
        stops: [
          { at: 0, color: p.ground },
          { at: 0.55, color: p.accent },
          { at: 1, color: p.accent3 },
        ],
      };
    case 'sky':
      return {
        type: 'linear',
        angle: 180,
        stops: [
          { at: 0, color: mixColor(p.accent2, '#ffffff', 0.35).slice(0, 7) },
          { at: 1, color: p.ground },
        ],
      };
    case 'neon':
      return {
        type: 'linear',
        angle: 90,
        stops: [
          { at: 0, color: p.accent },
          { at: 1, color: p.accent2 },
        ],
      };
    case 'feature':
      return {
        type: 'linear',
        angle: 160,
        stops: [
          { at: 0, color: p.accent },
          { at: 0.5, color: p.ground },
          { at: 1, color: p.accent2 },
        ],
      };
    case 'subtle':
      return {
        type: 'radial',
        angle: 0,
        cx: 0.5,
        cy: 0.4,
        r: 0.8,
        stops: [
          { at: 0, color: mixColor(p.ground, '#ffffff', 0.18).slice(0, 7) },
          { at: 1, color: p.ground },
        ],
      };
    default:
      return null;
  }
}

/** The vocabulary the composer speaks, from a profile: shapes, a pattern, a type treatment, effects, a gradient. */
export function vocabOf(dna: StyleDNA, p: StylePalette, seed: number, hasImage: boolean): VisualVocabulary {
  const t = dna.texture;
  const motifs = dna.geometry.motifs
    .slice(0, 3)
    .map((k, i) => prim(k, { seed: (seed % 900) + 3 + i * 17 }))
    .filter((m): m is Prim => !!m);
  const gen = dna.ornament.patterns[0];
  const pd = gen ? patternDefaults(gen) : null;
  const pattern: PatternUse | null =
    gen && pd ? { gen, params: { ...pd }, inks: (['accent', 'ink', 'accent2'] as InkRole[]).slice(0, Math.max(1, Math.min(3, Math.round(dna.composition.density / 35)))), opacity: 0.8, where: dna.composition.density >= 60 ? 'full' : 'field' } : null;
  const type = (dna.typography.treatments.find((x) => TYPE_TREATMENTS.includes(x)) ?? 'plain') as TypeTreatment;
  const list = (...xs: (Effect | null | false)[]) => xs.filter((e): e is Effect => !!e);
  const grain = Math.max(t.grain, Math.round(t.paper * 0.5));
  return {
    style: dna.legacy,
    cues: [],
    strength: 5,
    archetype: null,
    motifs,
    motifPaint: dna.colour.gradient === 'metallic' ? 'gradient' : dna.geometry.families.includes('technical') && !dna.geometry.families.includes('geometric') ? 'ink' : 'accent',
    pattern,
    type,
    image: dna.imagery.treatments
      .slice(0, 2)
      .map((k) => fx(k, k === 'halftone' ? { size: 8 } : {}))
      .filter((e): e is Effect => !!e),
    marks: list(
      t.misregistration >= 30 && fx('misregistration', { offset: Math.round(2 + t.misregistration / 15) }),
      t.gloss >= 40 && fx('glass'),
      t.glow >= 40 && fx('glow', { size: 14, opacity: 70 }),
      t.distress >= 35 && fx('distress', { amount: Math.round(t.distress * 0.6) }),
    ),
    headline: list(
      t.glow >= 40 && fx('glow', { size: 18, spread: 1, opacity: 75 }),
      t.misregistration >= 50 && fx('misregistration', { offset: 3 }),
      t.distress >= 45 && fx('distress', { amount: Math.round(t.distress * 0.5) }),
      t.inkbleed >= 30 && fx('ink-bleed'),
    ),
    texture: list(grain >= 12 && fx('grain', { amount: Math.round(Math.min(45, grain * 0.7)) }), t.noise >= 20 && fx('noise', { amount: Math.round(Math.min(40, t.noise * 0.6)) })),
    gradient: gradientOf(dna, p),
    palette: dna.colour.scheme === 'mono' ? 'mono' : ['duotone', 'spot'].includes(dna.colour.scheme) ? 'duo' : 'full',
    complexity: dna.geometry.complexity,
    density: dna.composition.density,
    says: [`${dna.name}: ${dna.description}`],
  };
}

/** The construction a style builds with here: one chosen by hand, a sibling's turn on a Board, else its first. */
/** A style's variant named for one construction, read in another it also uses: the nearest variant there (a
 * contemporary-swiss poster set as a type wall is the swiss wall, not the brutal one). */
const VARIANT_KIN: Record<string, readonly string[]> = {
  bigtype: ['swiss'],
  dutch: ['swiss'],
  china: ['swiss'],
  parole: ['futurist', 'constructivist'],
  speed: ['futurist'],
  corporate: ['commercial'],
  product: ['commercial'],
  editorial: ['luxury'],
  y2k: ['geocities'],
  print: ['printmaking'],
  secession: ['crafts'],
};

export function constructionFor(dna: StyleDNA, opts: { manual?: string; index?: number } = {}): { construction: Construction; variant: string } {
  const list = dna.composition.constructions;
  const c = (opts.manual && (list as readonly string[]).includes(opts.manual) ? opts.manual : list[(opts.index ?? 0) % list.length]) as Construction;
  const variants = CONSTRUCTIONS[c].variants as readonly string[];
  const own = dna.composition.variant;
  if (variants.includes(own)) return { construction: c, variant: own };
  return { construction: c, variant: (VARIANT_KIN[own] ?? []).find((v) => variants.includes(v)) ?? variants[0] };
}

/** Everything the composer needs to build in a style (see the head of this file). */
export function runFor(
  sel: StyleSelection,
  opts: {
    seed?: string;
    hasImage?: boolean;
    index?: number;
    brand?: readonly string[];
    tokens?: { background: string; text: string; accent: string; accent2?: string } | null;
    fonts?: { display: string; body: string } | null;
    customs?: readonly StyleDNA[];
  } = {},
): StyleRun {
  const eff: Effective = effectiveDNA(sel, opts.customs ?? []);
  const seedKey = sel.seedKey ?? opts.seed ?? '';
  const palette = paletteFor(eff.dna, { seed: seedKey, brand: opts.brand, keep: opts.tokens ?? null });
  const faces = facesFor(eff.dna, seedKey, opts.fonts ?? null);
  const seed = hashOf(`${seedKey}|${eff.dna.id}`);
  const { construction, variant } = constructionFor(eff.dna, { manual: sel.construction, index: opts.index });
  return {
    selection: sel,
    dna: eff.dna,
    id: sel.primary,
    name: eff.dna.name,
    construction,
    variant,
    palette,
    faces,
    experimentation: eff.experimentation,
    ornament: eff.ornament,
    density: eff.density,
    seed,
    vocab: vocabOf(eff.dna, palette, seed, !!opts.hasImage),
    says: [`${eff.dna.name}: ${CONSTRUCTIONS[construction].label.toLowerCase()} — ${eff.dna.principles.slice(0, 2).join('; ').toLowerCase()}.`, ...eff.says],
  };
}

const AXIS: Record<string, GraphicDirection['axis']> = { columns: 'orthogonal', modular: 'orthogonal', axial: 'orthogonal', diagonal: 'diagonal', radial: 'radial', free: 'scattered', frame: 'orthogonal', none: 'layered' };

/**
 * A direction dressed in a style: its tokens (palette and faces) and the parts of its look that set type, from the
 * effective profile — unless the person locked the palette or the faces, which stay as they are.
 */
export function styledDirection(dir: GraphicDirection, sel: StyleSelection, opts: { brand?: readonly string[]; keepColours?: boolean; keepFonts?: boolean; customs?: readonly StyleDNA[]; seed?: string } = {}): GraphicDirection {
  const seedKey = sel.seedKey ?? opts.seed ?? dir.name;
  const s: StyleSelection = { ...sel, seedKey };
  const c = dir.tokens.colors;
  const run = runFor(s, { brand: opts.brand, tokens: opts.keepColours ? { background: c.background, text: c.text, accent: c.accent, accent2: dir.tokens.accent2 } : null, fonts: opts.keepFonts ? dir.tokens.fonts : null, customs: opts.customs });
  const p = run.palette;
  const td = run.dna.typography.display;
  return {
    ...dir,
    // the language it speaks names it; the engine's colour language stays underneath (fixed kinds still read it)
    name: run.name.slice(0, 80),
    concept: run.dna.description.slice(0, 300),
    tokens: { colors: { background: p.ground, surface: p.surface, text: p.ink, muted: p.muted, accent: p.accent, accentText: p.accentText, line: p.line }, fonts: { display: run.faces.display, body: run.faces.body }, accent2: p.accent2 },
    look: {
      ...dir.look,
      case: td.case === 'upper' ? 'upper' : td.case === 'lower' ? 'lower' : 'sentence',
      tracking: td.tracking >= 80 ? 'wide' : td.tracking <= -20 ? 'tight' : 'normal',
      trackingValue: td.tracking,
      weight: nearestWeight(run.faces.display, td.weight),
      lineHeight: td.lineHeight,
    },
    axis: AXIS[run.dna.composition.grid] ?? dir.axis,
    intensity: run.experimentation,
    style: s,
  };
}
