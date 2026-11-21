// lib/ux-v0/graphics/generative/principles.ts — a design language as principles, not a layout. A style's DNA (or, with
// no style, a direction worked out from the brief) becomes tendencies: how curved, rigid, symmetric, dense, layered and
// quiet it is, how its type makes hierarchy, how it uses colour, what it must never do. From those, weights over the
// engine's spatial principles, operations, material sources and type strategies — weights the concept samples from,
// so a Bauhaus poster leans to rigid partitions and diagonal axes without ever being one fixed Bauhaus arrangement.

import type { Ctx } from '../compose';
import type { CreativeReading } from './reading';
import { hasOpportunity } from './reading';
import { clamp } from './util';

export const ORGS = ['partition', 'field', 'axis', 'orbit', 'flow', 'strata', 'constellation', 'edge', 'layers', 'frame', 'grid', 'centre'] as const;
export type Org = (typeof ORGS)[number];
export const OPS = ['crop', 'rotate', 'repeat', 'layer', 'cut', 'scale', 'mask', 'interrupt', 'echo', 'mirror', 'offset'] as const;
export type Op = (typeof OPS)[number];
export const SOURCES = ['metaphor', 'letterform', 'geometry', 'image', 'pattern', 'organic'] as const;
export type Source = (typeof SOURCES)[number];
export const TYPE_STRATEGIES = ['monumental', 'column', 'axis', 'path', 'vertical', 'quiet', 'echo', 'numeral', 'framed'] as const;
export type TypeStrategy = (typeof TYPE_STRATEGIES)[number];
export const COLOURINGS = ['figure-ground', 'inverse', 'field', 'focal-accent', 'tonal', 'split'] as const;
export type Colouring = (typeof COLOURINGS)[number];

export interface Principles {
  source: 'style' | 'brief';
  id: string | null;
  name: string;
  /** one sentence: what the language asks of a design */
  summary: string;
  geometry: { curvature: number; angularity: number; rigidity: number; complexity: number; repetition: number; symmetry: number; relation: string };
  space: { grid: string; symmetry: number; density: number; negativeSpace: number; layering: number; overlap: number; rhythm: string; focal: string; imageShare: number };
  type: { hierarchy: string; align: string; breaking: string; treatments: string[]; italic: boolean; case: string };
  colour: { scheme: string; contrast: number; saturation: number; gradient: string; groundKind: string };
  imagery: { treatments: string[]; crop: string; mask: string; placement: string };
  ornament: { density: number; border: string; flourish: number };
  texture: string[];
  /** what the language must never do (its own mistakes and overuse), said */
  avoid: string[];
  bias: { org: Record<Org, number>; op: Record<Op, number>; source: Record<Source, number>; type: Record<TypeStrategy, number>; colouring: Record<Colouring, number> };
}

type Raw = Omit<Principles, 'bias'>;

/** The language's principles: the style's DNA where one is chosen, else a direction worked out from the brief. */
export function principlesFor(x: Ctx, reading: CreativeReading): Principles {
  const raw = x.style ? fromStyle(x) : fromBrief(x, reading);
  return { ...raw, bias: biasOf(raw, reading, !!x.brief.images.length) };
}

function fromStyle(x: Ctx): Raw {
  const d = x.style!.dna;
  const tex = (Object.entries(d.texture) as [string, number][]).filter(([, v]) => v >= 40).map(([k]) => k);
  return {
    source: 'style',
    id: d.id,
    name: d.name,
    summary: `${d.name}: ${d.principles.slice(0, 2).join('; ')}`.replace(/\.$/, '') + '.',
    geometry: { curvature: d.geometry.curvature, angularity: d.geometry.angularity, rigidity: d.geometry.rigidity, complexity: d.geometry.complexity, repetition: d.geometry.repetition, symmetry: d.geometry.symmetry, relation: d.geometry.relation },
    space: {
      grid: d.composition.grid,
      symmetry: d.composition.symmetry,
      density: d.composition.density,
      negativeSpace: d.composition.negativeSpace,
      layering: d.composition.layering,
      overlap: d.composition.overlap,
      rhythm: d.composition.rhythm,
      focal: d.composition.focal,
      imageShare: d.composition.imageShare,
    },
    type: { hierarchy: d.typography.hierarchy, align: d.typography.align, breaking: d.typography.breaking, treatments: [...d.typography.treatments], italic: d.typography.display.italic, case: d.typography.display.case },
    colour: { scheme: d.colour.scheme, contrast: d.colour.contrast, saturation: d.colour.saturation, gradient: d.colour.gradient, groundKind: d.colour.groundKind },
    imagery: { treatments: [...d.imagery.treatments], crop: d.imagery.crop, mask: d.imagery.mask, placement: d.imagery.placement },
    ornament: { density: d.ornament.density, border: d.ornament.border, flourish: d.ornament.flourish },
    texture: tex,
    avoid: [...d.constraints.mistakes, ...d.constraints.overuse].slice(0, 8),
  };
}

/**
 * No style named: a direction from the brief itself — the direction's own language (its tokens are already chosen from
 * the brief) moved by what the reading found: an energetic subject gets density and angles, a warm one curves, a tense
 * one asymmetry and overlap, a serious one symmetry and room. Not contemporary-minimal by default: each brief its own.
 */
function fromBrief(x: Ctx, r: CreativeReading): Raw {
  const lang = x.dir.language;
  const e = r.emotion;
  const base: Record<string, Partial<Raw['space'] & Raw['geometry']>> = {
    gallery: { negativeSpace: 78, density: 22, symmetry: 45, rigidity: 70, curvature: 35 },
    'quiet-luxury': { negativeSpace: 80, density: 18, symmetry: 60, rigidity: 65, curvature: 40 },
    swiss: { grid: 'columns', negativeSpace: 50, density: 45, symmetry: 22, rigidity: 88, curvature: 20 },
    utility: { grid: 'modular', negativeSpace: 40, density: 55, symmetry: 30, rigidity: 90, curvature: 10 },
    civic: { grid: 'columns', negativeSpace: 45, density: 50, symmetry: 40, rigidity: 80, curvature: 25 },
    industrial: { grid: 'modular', negativeSpace: 30, density: 65, symmetry: 25, rigidity: 92, curvature: 8 },
    poster: { negativeSpace: 30, density: 65, symmetry: 30, rigidity: 55, curvature: 45 },
    'retro-print': { negativeSpace: 35, density: 60, symmetry: 40, rigidity: 50, curvature: 55 },
    maximal: { negativeSpace: 12, density: 85, symmetry: 25, rigidity: 35, curvature: 60 },
    brutal: { grid: 'modular', negativeSpace: 20, density: 75, symmetry: 15, rigidity: 85, curvature: 10 },
    night: { negativeSpace: 45, density: 50, symmetry: 35, rigidity: 50, curvature: 55 },
    cinema: { negativeSpace: 50, density: 40, symmetry: 50, rigidity: 60, curvature: 35 },
    future: { negativeSpace: 40, density: 55, symmetry: 35, rigidity: 60, curvature: 50 },
  };
  const b = base[lang] ?? { negativeSpace: 45, density: 50, symmetry: 35, rigidity: 60, curvature: 40 };
  const grid = b.grid ?? (x.dir.axis === 'orthogonal' ? 'columns' : x.dir.axis === 'diagonal' ? 'diagonal' : x.dir.axis === 'radial' ? 'radial' : x.dir.axis === 'scattered' ? 'free' : x.dir.axis === 'layered' ? 'free' : 'none');
  const curvature = clamp((b.curvature ?? 40) + (e.warmth - 50) * 0.5 + (e.play - 50) * 0.3, 0, 100);
  const rigidity = clamp((b.rigidity ?? 60) - (e.warmth - 50) * 0.3 - (e.play - 50) * 0.25 + (e.gravity - 50) * 0.3, 0, 100);
  const symmetry = clamp((b.symmetry ?? 35) + (e.gravity - 50) * 0.5 - (e.tension - 30) * 0.5, 0, 100);
  const density = clamp((b.density ?? 50) + (e.energy - 50) * 0.5 + (r.complexity - 50) * 0.3, 0, 100);
  const negativeSpace = clamp((b.negativeSpace ?? 45) - (e.energy - 50) * 0.4 + (e.gravity - 50) * 0.2, 0, 100);
  const layering = clamp(20 + (x.dir.axis === 'layered' ? 45 : 0) + (e.energy - 50) * 0.3 + (e.tension - 30) * 0.3, 0, 100);
  const angularity = clamp(40 + (e.energy - 50) * 0.5 + (e.tension - 30) * 0.4 - (curvature - 50) * 0.4, 0, 100);
  const temperament = e.energy >= 65 ? 'charged' : e.energy <= 35 ? 'calm' : 'measured';
  const temp = e.warmth >= 62 ? 'warm' : e.warmth <= 38 ? 'cool' : 'even';
  const structure = rigidity >= 70 ? 'built on a grid' : curvature >= 60 ? 'in flowing forms' : symmetry >= 60 ? 'set on an axis' : 'freely balanced';
  const subject = r.subject.domains[0]?.label ?? 'the subject';
  return {
    source: 'brief',
    id: null,
    name: `${temperament[0].toUpperCase()}${temperament.slice(1)}, ${temp} ${subject}`,
    summary: `A direction drawn from the brief: ${temperament} and ${temp}, ${structure}, in the ${lang.replace(/-/g, ' ')} palette and type the brief suggested.`,
    geometry: {
      curvature,
      angularity,
      rigidity,
      complexity: clamp(r.complexity, 0, 100),
      repetition: clamp(30 + (e.energy - 50) * 0.4 + (e.play - 50) * 0.3, 0, 100),
      symmetry,
      relation: curvature >= 60 ? 'floating' : rigidity >= 75 ? 'aligned' : 'overlapping',
    },
    space: {
      grid,
      symmetry,
      density,
      negativeSpace,
      layering,
      overlap: clamp(layering * 0.8, 0, 100),
      rhythm: e.energy >= 70 ? 'syncopated' : curvature >= 60 ? 'flowing' : rigidity >= 75 ? 'regular' : 'syncopated',
      focal: x.brief.images.length ? 'image' : 'type',
      imageShare: x.brief.images.length ? 55 : 0,
    },
    type: { hierarchy: e.gravity >= 60 ? 'weight' : 'scale', align: symmetry >= 60 ? 'center' : 'left', breaking: e.tension >= 55 ? 'broken' : 'natural', treatments: [], italic: false, case: x.dir.look.case },
    colour: { scheme: 'full', contrast: clamp(55 + (e.energy - 50) * 0.5, 20, 100), saturation: clamp(50 + (e.energy - 50) * 0.6 + (e.play - 50) * 0.3, 0, 100), gradient: 'none', groundKind: 'paper' },
    imagery: { treatments: [], crop: 'full', mask: 'none', placement: 'side' },
    ornament: { density: clamp((e.play - 50) * 0.6 + 20, 0, 100), border: 'none', flourish: 0 },
    texture: [],
    avoid: ['default centred stacking', 'decoration without a reason in the brief', 'a gradient or glow standing in for an idea'],
  };
}

/** The weights a language puts on the engine's choices (see the head of this file). Floors keep every option open. */
function biasOf(p: Raw, r: CreativeReading, hasImage: boolean): Principles['bias'] {
  const g = p.geometry;
  const s = p.space;
  const t = p.type;
  const gridIs = (...k: string[]) => (k.includes(s.grid) ? 1 : 0);
  const treat = (...k: string[]) => (t.treatments.some((x) => k.some((y) => x.includes(y))) ? 1 : 0);
  const org: Record<Org, number> = {
    partition: 0.8 + gridIs('columns', 'modular') * 1.2 + g.rigidity / 95 - (s.rhythm === 'flowing' ? 0.5 : 0),
    grid: 0.4 + gridIs('modular') * 1.8 + gridIs('columns') * 0.8 + g.rigidity / 130 + g.repetition / 160,
    field: 0.9 + s.negativeSpace / 70 + gridIs('none', 'free') * 0.5,
    axis: 0.7 + gridIs('diagonal') * 2.2 + gridIs('axial') * 0.9 + g.angularity / 110,
    orbit: 0.5 + gridIs('radial') * 2.4 + (s.rhythm === 'radiating' ? 1.2 : 0) + g.curvature / 130,
    flow: 0.4 + g.curvature / 60 + (s.rhythm === 'flowing' ? 1.6 : 0) - g.rigidity / 160,
    strata: 0.6 + (s.rhythm === 'stacked' ? 1.5 : 0) + (s.rhythm === 'syncopated' ? 0.5 : 0) + gridIs('columns') * 0.4,
    constellation: 0.4 + s.density / 90 + (s.rhythm === 'chaotic' ? 1.4 : 0) + g.repetition / 150 - s.symmetry / 160,
    edge: 0.7 + (100 - s.symmetry) / 110 + s.negativeSpace / 170,
    layers: 0.4 + s.layering / 45 + s.overlap / 85,
    frame: 0.3 + gridIs('frame') * 2.4 + (p.ornament.border !== 'none' ? 0.8 : 0) + s.symmetry / 150,
    centre: 0.3 + s.symmetry / 38 + gridIs('axial') * 1.4,
  };
  // a symmetric language leans to its axis and its frame; an asymmetric one away from them
  if (s.symmetry >= 60) for (const k of ['edge', 'constellation'] as Org[]) org[k] *= 0.6;
  if (s.symmetry <= 30) org.centre *= 0.45;
  const op: Record<Op, number> = {
    crop: 0.6 + (100 - s.symmetry) / 120 + s.negativeSpace / 220,
    rotate: 0.25 + g.angularity / 70 + gridIs('diagonal') * 0.9,
    repeat: 0.25 + g.repetition / 60,
    layer: 0.25 + s.layering / 50,
    cut: 0.15 + g.angularity / 120 + (p.texture.includes('distress') ? 0.4 : 0),
    scale: 0.7 + (t.hierarchy === 'scale' ? 0.8 : 0),
    mask: 0.3 + (p.imagery.mask && p.imagery.mask !== 'none' ? 0.8 : 0) + (hasImage ? 0.4 : 0),
    interrupt: 0.2 + s.overlap / 90,
    echo: 0.15 + treat('outline', 'echo', 'stack', 'repeat') * 0.9 + g.repetition / 220,
    mirror: 0.08 + s.symmetry / 70,
    offset: 0.25 + s.overlap / 100 + (p.texture.includes('misregistration') ? 0.9 : 0),
  };
  const source: Record<Source, number> = {
    metaphor: 1.4,
    letterform: 0.45 + (s.focal === 'type' ? 0.9 : 0) + (t.hierarchy === 'scale' ? 0.4 : 0) + (hasOpportunity(r, 'monumental') ? 0.4 : 0),
    geometry: 0.5 + g.rigidity / 140 + (s.focal === 'shape' ? 0.9 : 0) + (g.complexity >= 50 ? 0.3 : 0),
    image: hasImage ? 1.4 + s.imageShare / 45 : 0,
    pattern: 0.2 + (s.focal === 'pattern' ? 1.3 : 0) + (p.ornament.density >= 50 ? 0.5 : 0),
    organic: 0.25 + g.curvature / 75 - g.rigidity / 170,
  };
  const type: Record<TypeStrategy, number> = {
    monumental: 1 + (t.hierarchy === 'scale' ? 0.7 : 0) + (r.hierarchy.length === 'short' ? 0.6 : 0) - (r.hierarchy.length === 'long' ? 0.5 : 0),
    column: 0.6 + (['word-per-line', 'stepped', 'broken'].includes(t.breaking) ? 1 : 0) + (r.hierarchy.words >= 2 ? 0.3 : -0.4),
    axis: 0.35 + g.angularity / 90 + treat('rotate', 'diagonal', 'tilt') * 0.8,
    path: 0.25 + g.curvature / 95 + treat('arc', 'circle', 'wave', 'path') * 1 - (r.hierarchy.chars > 26 ? 0.5 : 0),
    vertical: 0.25 + treat('vertical') * 1.1 + (r.aspect === 'tall' ? 0.3 : 0),
    quiet: 0.35 + s.negativeSpace / 85 + (t.hierarchy === 'inverted' ? 1 : 0) + (hasImage ? 0.5 : 0),
    echo: 0.15 + treat('outline', 'echo', 'stack', 'repeat') * 0.9 + (r.hierarchy.length === 'short' ? 0.3 : 0),
    numeral: hasOpportunity(r, 'numeral') ? 0.35 : 0,
    framed: 0.25 + gridIs('frame') * 1 + s.symmetry / 160,
  };
  const dark = ['black', 'dark'].includes(p.colour.groundKind);
  const colouring: Record<Colouring, number> = {
    'figure-ground': 1.2,
    inverse: 0.25 + (dark ? 1.1 : 0) + r.emotion.tension / 200,
    field: 0.25 + (p.colour.saturation >= 60 ? 0.5 : 0) + (p.colour.groundKind === 'colour' ? 0.9 : 0) + r.emotion.energy / 220,
    'focal-accent': 0.4 + s.negativeSpace / 110,
    tonal: 0.25 + (['mono', 'muted', 'earth', 'natural'].includes(p.colour.scheme) ? 0.7 : 0) + r.emotion.gravity / 230,
    split: 0.25 + gridIs('columns', 'modular') * 0.6 + (p.colour.contrast >= 70 ? 0.3 : 0),
  };
  const floor = <K extends string>(w: Record<K, number>, lo: number) => Object.fromEntries((Object.entries(w) as [K, number][]).map(([k, v]) => [k, Math.max(lo, Math.round(v * 100) / 100)])) as Record<K, number>;
  return { org: floor(org, 0.12), op: floor(op, 0.08), source: { ...floor(source, 0.1), image: source.image }, type: { ...floor(type, 0.1), numeral: type.numeral }, colouring: floor(colouring, 0.1) };
}
