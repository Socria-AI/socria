// lib/ux-v0/graphics/styles/reference.ts — a reference picture read for its design language, never copied.
//
// The picture's pixels (drawn small in the browser, as the moodboard does) are measured by ref-dna.ts: negative space,
// detail, contrast, key, colourfulness and hue families, the run of its lines, symmetry, rhythm, grain. Its palette is
// sampled here. From those, each dimension of a profile is read where pixels can say it (composition density and
// symmetry, colour, texture, geometry's square or diagonal habit, how much it repeats); what pixels cannot say
// (typography, ornament's meaning, a period) is borrowed from the nearest of the library's styles and said so. The
// result is a custom profile in the same schema as the library's, so it can be used whole ("use this as the style,
// keep my content"), as a visual language without its layout, or a dimension at a time ("typography from A, colour
// from B"). Nothing is copied: no positions, no text, no logos — only where the picture sits on each scale.
// Deterministic arithmetic; no model is called.

import { measurePixels, type Pixels, type RefMeasures } from '../../ref-dna';
import { hslOf, hslHex } from '../paint';
import type { StyleSelection } from './blend';
import { builtInStyles } from './registry';
import { normalizeStyleDNA, slugOf, type Dimension, type StyleDNA } from './schema';

export interface ReferenceReading {
  measures: RefMeasures;
  /** the picture's own colours, most present first (at most six) */
  palette: string[];
  /** each dimension as read, in words */
  reads: Partial<Record<Dimension, string>> & {
    density: string;
    influences: string[];
  };
  /** the library's nearest styles, closest first */
  nearest: { id: string; name: string; score: number; why: string[] }[];
  /** the profile the picture gives (category custom) */
  dna: StyleDNA;
  /** what was borrowed rather than read, and what was not copied */
  notes: string[];
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const lum = (c: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** The picture's palette: its colours binned (4 bits a channel), merged where close, most present first. */
export function paletteOf(px: Pixels, max = 6): string[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  const { data } = px;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n++;
    bin.r += data[i];
    bin.g += data[i + 1];
    bin.b += data[i + 2];
    bins.set(key, bin);
  }
  const ranked = [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .map((b) => ({
      n: b.n,
      c: [b.r / b.n, b.g / b.n, b.b / b.n] as [number, number, number],
    }));
  const out: { n: number; c: [number, number, number] }[] = [];
  for (const r of ranked) {
    const near = out.find((o) => Math.hypot(o.c[0] - r.c[0], o.c[1] - r.c[1], o.c[2] - r.c[2]) < 48);
    if (near) {
      const t = r.n / (near.n + r.n);
      near.c = [near.c[0] + (r.c[0] - near.c[0]) * t, near.c[1] + (r.c[1] - near.c[1]) * t, near.c[2] + (r.c[2] - near.c[2]) * t];
      near.n += r.n;
    } else if (out.length < 24) out.push({ ...r, c: [...r.c] as [number, number, number] });
  }
  return out
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((o) => hex(...o.c));
}

/** How close a style sits to what was measured (0–100), and why. */
function closeness(s: StyleDNA, m: RefMeasures, palette: readonly string[]): { score: number; why: string[] } {
  const why: string[] = [];
  const d = (want: number, got: number, w: number, what: string) => {
    const gap = Math.abs(want - got) / 100;
    if (gap < 0.15) why.push(what);
    return gap * w;
  };
  const density = Math.round(Math.min(1, m.edges * 3.2) * 100);
  const neg = Math.round(m.quiet * 100);
  const sym = Math.round((1 - m.asymmetry) * 100);
  const sat = Math.round(Math.min(1, m.colourfulness / 70) * 100);
  const contr = Math.round(Math.min(1, m.contrast / 0.32) * 100);
  const grain = Math.round(m.grain * 100);
  const reg = Math.round(m.regularity * 100);
  const groundDark = palette[0] ? lum(palette[0]) < 0.2 : m.luminance < 0.35;
  let dist = 0;
  dist += d(s.composition.density, density, 1.2, 'its density');
  dist += d(s.composition.negativeSpace, neg, 1.2, 'its negative space');
  dist += d(s.composition.symmetry, sym, 1.0, 'its symmetry');
  dist += d(s.colour.saturation, sat, 1.0, 'its colourfulness');
  dist += d(s.colour.contrast, contr, 0.8, 'its contrast');
  dist += d(Math.max(s.texture.grain, s.texture.paper, s.texture.noise, s.texture.distress), grain, 0.9, 'its surface');
  dist += d(s.geometry.repetition, reg, 0.6, 'its rhythm');
  dist += d(s.geometry.angularity, Math.round(m.diagonal * 100), 0.7, 'the run of its lines');
  if (groundDark !== lum(s.colour.ground) < 0.2) dist += 0.6;
  else why.push(groundDark ? 'a dark ground' : 'a light ground');
  if (m.hues <= 1 && s.colour.scheme !== 'mono' && s.colour.scheme !== 'duotone') dist += 0.4;
  // the picture's most colourful colour against the style's accent, by hue
  const accent = palette.map((c) => ({ c, s: hslOf(c)[1] })).sort((a, b) => b.s - a.s)[0];
  if (accent && accent.s > 0.25) {
    const dh = Math.abs(hslOf(accent.c)[0] - hslOf(s.colour.accent)[0]);
    const gap = Math.min(dh, 360 - dh) / 180;
    dist += gap * 0.5;
    if (gap < 0.12) why.push('its accent');
  }
  return {
    score: Math.max(0, Math.round(100 - dist * 14)),
    why: why.slice(0, 4),
  };
}

/**
 * A reference read (see the head of this file). `name` names the profile; `customs` join the library for the nearest
 * search. Throws only when the picture is too small to measure.
 */
export function readReference(px: Pixels, opts: { name?: string; customs?: readonly StyleDNA[] } = {}): ReferenceReading {
  const m = measurePixels(px);
  const palette = paletteOf(px);
  const pool = [...builtInStyles(), ...(opts.customs ?? [])].filter((s) => s.category !== 'custom' || (opts.customs ?? []).includes(s));
  const nearest = pool
    .map((s) => ({ s, ...closeness(s, m, palette) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => ({ id: x.s.id, name: x.s.name, score: x.score, why: x.why }));
  const base = pool.find((s) => s.id === nearest[0]?.id) ?? builtInStyles()[0];
  // the colours: the most present is the ground, the colour that reads most strongly on it the ink, the most chromatic the accent
  const ground = palette[0] ?? base.colour.ground;
  const rest = palette.slice(1);
  const ink = [...rest, '#111111', '#f5f5f5'].reduce((a, b) => (contrast(b, ground) > contrast(a, ground) ? b : a));
  const chromatic = rest.filter((c) => c !== ink).sort((a, b) => hslOf(b)[1] - hslOf(a)[1]);
  const accent = chromatic[0] ?? base.colour.accent;
  const accent2 = chromatic[1] ?? hslHex(hslOf(accent)[0] + 150, Math.max(0.35, hslOf(accent)[1]), 0.5);
  const accent3 = chromatic[2] ?? hslHex(hslOf(accent)[0] + 60, Math.max(0.35, hslOf(accent)[1]), 0.55);
  const density = Math.round(Math.min(1, m.edges * 3.2) * 100);
  const neg = Math.round(m.quiet * 100);
  const sym = Math.round((1 - m.asymmetry) * 100);
  const sat = Math.round(Math.min(1, m.colourfulness / 70) * 100);
  const grain = Math.round(m.grain * 100);
  const scheme = m.hues <= 0 || sat < 8 ? 'mono' : m.hues === 1 ? (rest.length ? 'duotone' : 'mono') : m.hues === 2 ? 'complementary' : m.hues >= 4 ? 'polychrome' : 'triadic';
  const name = (opts.name ?? 'From a reference').slice(0, 60);
  const raw = {
    ...base,
    id: slugOf(name) || 'reference',
    name,
    category: 'custom',
    era: base.era,
    description: `Read from a reference picture: ${[density >= 60 ? 'dense' : density <= 25 ? 'sparse' : 'balanced', sym >= 65 ? 'symmetric' : 'asymmetric', m.luminance < 0.35 ? 'dark' : 'light', sat >= 55 ? 'colourful' : sat <= 15 ? 'near-monochrome' : 'measured colour'].join(', ')}, nearest to ${base.name}.`,
    related: nearest.slice(0, 3).map((n) => n.id),
    // found by its own name, never by the words of the style it was nearest to
    words: [name.toLowerCase()],
    composition: {
      ...base.composition,
      density,
      negativeSpace: neg,
      symmetry: sym,
      rhythm: m.regularity > 0.6 ? 'regular' : m.diagonal > 0.45 ? 'syncopated' : base.composition.rhythm,
    },
    colour: {
      ...base.colour,
      scheme,
      ground,
      ink,
      accent,
      accent2,
      accent3,
      contrast: Math.round(Math.min(1, m.contrast / 0.32) * 100),
      saturation: sat,
      variation: 20,
      brand: 'map',
    },
    texture: {
      ...base.texture,
      grain: Math.max(base.texture.grain * 0.5, grain),
      noise: Math.round(grain * 0.4),
      paper: m.warmth > 0.2 ? Math.max(base.texture.paper, Math.round(grain * 0.6)) : base.texture.paper,
    },
    geometry: {
      ...base.geometry,
      angularity: Math.round(Math.max(m.diagonal, m.square * 0.6) * 100),
      curvature: Math.round(Math.max(0, 1 - m.square - m.diagonal) * 100),
      repetition: Math.round(m.regularity * 100),
      symmetry: sym,
    },
    generation: {
      fallbacks: ['typography and ornament are borrowed from ' + base.name + ': a picture cannot say them'],
    },
  };
  const notes: string[] = [];
  const dna = normalizeStyleDNA(raw, notes) ?? base;
  const reads: ReferenceReading['reads'] = {
    composition: `${density >= 60 ? 'dense' : density <= 25 ? 'open' : 'balanced'}, ${neg}% quiet space, ${sym >= 65 ? 'symmetric' : sym <= 35 ? 'strongly asymmetric' : 'off-balance'}${m.offCentre > 0.35 ? ', its weight off-centre' : ''}`,
    colour: `${scheme}, ${m.luminance < 0.35 ? 'dark' : m.luminance > 0.7 ? 'light' : 'mid'}-keyed, ${sat >= 55 ? 'saturated' : sat <= 15 ? 'muted' : 'moderate'} (${palette.slice(0, 4).join(' ')})`,
    texture: grain >= 30 ? `grainy (${grain}): a printed or photographic surface` : 'clean, flat surfaces',
    geometry: m.diagonal > 0.45 ? 'diagonal lines lead' : m.square > 0.5 ? 'square, orthogonal lines' : 'curving, organic lines',
    imagery: m.edges > 0.25 && m.colourfulness > 30 ? 'photographic or richly illustrated' : 'flat or graphic',
    typography: `not readable from pixels — taken from ${base.name}`,
    ornament: `not readable from pixels — taken from ${base.name}`,
    density: `${density}/100`,
    influences: nearest.slice(0, 3).map((n) => `${n.name} (${n.score})`),
  };
  return {
    measures: m,
    palette,
    reads,
    nearest,
    dna,
    notes: [
      `Typography and ornament are ${base.name}’s: a picture cannot show which faces or what ornament mean, only how they sit.`,
      'Nothing was copied: no layout, positions, words or marks of the reference — only where it sits on each scale.',
      ...notes,
    ],
  };
}

/**
 * A selection from references as the person asked: the reference as the style (content kept, as every style keeps
 * it), its visual language without its layout (the composition stays the current style's), or a dimension each from
 * several ("typography from A, colours from B").
 */
export function selectionFromReferences(parts: readonly { dna: StyleDNA; dims?: readonly Dimension[] }[], current: StyleSelection | null, how: 'all' | 'not-layout' | 'dims' = 'all'): StyleSelection | null {
  const refs = parts.map((p) => ({
    ...p,
    dna: { ...p.dna, category: 'custom' as const },
  }));
  const customs = [...(current?.customs ?? []).filter((c) => !refs.some((r) => r.dna.id === c.id)), ...refs.map((r) => r.dna)].slice(-6);
  if (!refs.length) return current;
  if (how === 'all')
    return {
      primary: refs[0].dna.id,
      strength: 0,
      customs,
      ...(current?.seedKey ? { seedKey: current.seedKey } : {}),
    };
  if (how === 'not-layout') {
    // the reference's language everywhere but the composition, which stays where it was
    const keep = current?.primary;
    return {
      primary: refs[0].dna.id,
      strength: 0,
      customs: current?.customs?.length ? [...customs] : customs,
      ...(keep ? { dims: { composition: keep } } : {}),
      ...(current?.seedKey ? { seedKey: current.seedKey } : {}),
    };
  }
  if (!current) return { primary: refs[0].dna.id, strength: 0, customs };
  const dims: Partial<Record<Dimension, string>> = { ...(current.dims ?? {}) };
  for (const r of refs) for (const d of r.dims ?? []) dims[d] = r.dna.id;
  return { ...current, dims, customs };
}
