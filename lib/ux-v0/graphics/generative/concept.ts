// lib/ux-v0/graphics/generative/concept.ts — the creative concept: a central idea worked out for this brief before
// anything is drawn. The concept is assembled, not looked up: an emphasis (what leads), a source of visual material (a
// metaphor from the subject, a letter of the title, the language's geometry, the picture, a pattern, an organic form),
// a motif that draws it, one or two spatial principles (with their own numbers), operations (crop, cut, echo, rotate…),
// a type strategy, a colour relationship and a focal point. Each is sampled from the language's weights, kept
// compatible with the others, and pushed away from what was made before, so one brief yields many independent ideas.

import { DOMAIN_BY_ID, GENERAL, MOTIF_TRAITS, type Metaphor, type MotifKind } from './lexicon';
import { COLOURINGS, OPS, ORGS, SOURCES, TYPE_STRATEGIES, type Colouring, type Op, type Org, type Principles, type Source, type TypeStrategy } from './principles';
import { hasOpportunity, type CreativeReading } from './reading';
import { clamp, rng, type Rng } from './util';

export const EMPHASES = ['type', 'image', 'abstract', 'geometric', 'organic', 'collage', 'data'] as const;
export type Emphasis = (typeof EMPHASES)[number];
export const IMAGERY = ['full', 'masked', 'cut', 'framed', 'inset', 'none'] as const;
export type Imagery = (typeof IMAGERY)[number];

/** What a concept is, structurally, in a few keys: what diversity and memory compare. */
export interface ConceptKey {
  emphasis: Emphasis;
  org: Org;
  org2: Org | null;
  type: TypeStrategy;
  motif: MotifKind | null;
  source: Source;
}

export interface ConceptConstraints {
  /** a spatial principle asked for in words ("use a radial composition") */
  org?: Org;
  type?: TypeStrategy;
  emphasis?: Emphasis;
  /** where the eye should land (0–1 of the frame) */
  focal?: { x: number; y: number };
  /** the type kept as it is: only the rest is reconceived */
  keepType?: boolean;
  unexpected?: boolean;
  unconventional?: boolean;
  imagePrimary?: boolean;
  abstractMotif?: boolean;
  notAiLook?: boolean;
  /** a target for empty space, 0–100 */
  negativeSpace?: number;
  dynamic?: boolean;
  asymmetric?: boolean;
  diagonal?: boolean;
  /** a composition family of the vocabulary, taken as inspiration (its spatial principle and type) */
  family?: string;
  /** 0–100 */
  experimentation?: number;
  /** the headline as the central element */
  headlineCentral?: boolean;
  /** a use of the palette asked for (a Board sibling's turn: the paper, the accent as a field, the ink as ground) */
  colouring?: Colouring;
}

export interface ConceptRequest {
  seed?: number | string;
  emphasis?: Emphasis;
  avoid?: readonly ConceptKey[];
  constraints?: ConceptConstraints;
}

export interface CreativeConcept extends ConceptKey {
  schema: 1;
  seed: number;
  metaphor: { name: string; domain: string; says: string } | null;
  motifParams: Record<string, number>;
  orgParams: Record<string, number>;
  org2Params: Record<string, number>;
  operations: Op[];
  typeParams: Record<string, number>;
  imagery: Imagery;
  colouring: Colouring;
  focal: { x: number; y: number };
  energy: number;
  density: number;
  negativeSpace: number;
  symmetry: number;
  experimentation: number;
  /** the central visual idea, in one sentence */
  idea: string;
  artDirection: string;
  strategies: { typography: string; geometry: string; imagery: string; composition: string; colour: string; texture: string; space: string };
  rationale: string[];
  language: { source: 'style' | 'brief'; name: string };
  constraints: ConceptConstraints;
}

// ── compatibility: what goes with what (weights, never rules: a low weight is still possible) ──

const SOURCE_FOR: Record<Emphasis, Partial<Record<Source, number>>> = {
  type: { letterform: 1.4, metaphor: 0.6, geometry: 0.45 },
  image: { image: 1 },
  abstract: { metaphor: 1.3, pattern: 0.5, geometry: 0.35 },
  geometric: { geometry: 1.3, metaphor: 0.6 },
  organic: { organic: 1.2, metaphor: 0.8 },
  collage: { image: 1, geometry: 0.6, metaphor: 0.5 },
  data: { metaphor: 1 },
};

const ORG_FOR_WANT: Record<'path' | 'centre' | 'zone' | 'edge' | 'image', Partial<Record<Org, number>>> = {
  path: { flow: 1.7, axis: 1.3, strata: 1, field: 0.8, edge: 0.6, partition: 0.6, layers: 0.6, orbit: 0.4, frame: 0.5, grid: 0.4, centre: 0.5, constellation: 0.3 },
  centre: { orbit: 1.6, centre: 1.1, edge: 1.2, field: 1, layers: 0.5, partition: 0.5, axis: 0.6, flow: 0.4, strata: 0.4, frame: 0.7, grid: 0.3, constellation: 0.35 },
  zone: { partition: 1.2, grid: 1.2, field: 1.1, layers: 1, strata: 0.9, edge: 0.9, frame: 0.8, constellation: 0.9, axis: 0.7, centre: 0.7, orbit: 0.5, flow: 0.5 },
  edge: { edge: 1.6, field: 1.2, partition: 0.8, strata: 0.7, layers: 0.7, axis: 0.7, flow: 0.6, orbit: 0.5, frame: 0.5, grid: 0.4, centre: 0.5, constellation: 0.4 },
  image: { partition: 1.3, field: 1.2, frame: 1.1, layers: 1.1, edge: 1.1, grid: 0.9, strata: 0.8, axis: 0.7, centre: 0.8, orbit: 0.5, flow: 0.5, constellation: 0.4 },
};

const TYPE_FOR_ORG: Record<Org, Partial<Record<TypeStrategy, number>>> = {
  flow: { path: 1.8, monumental: 0.8, column: 0.7, quiet: 0.8, echo: 0.5, axis: 0.6, vertical: 0.4, framed: 0.3, numeral: 0.6 },
  orbit: { path: 1.4, quiet: 1, monumental: 0.8, framed: 0.9, column: 0.6, axis: 0.4, vertical: 0.5, echo: 0.5, numeral: 0.6 },
  axis: { axis: 1.8, monumental: 0.7, column: 0.6, path: 0.3, quiet: 0.8, vertical: 0.6, echo: 0.6, framed: 0.3, numeral: 0.6 },
  partition: { column: 1.2, monumental: 1.2, vertical: 1, quiet: 0.9, echo: 0.7, axis: 0.4, path: 0.2, framed: 0.8, numeral: 0.9 },
  field: { monumental: 1.3, quiet: 1.1, echo: 1, column: 0.8, axis: 0.7, vertical: 0.7, path: 0.5, framed: 0.6, numeral: 1 },
  strata: { monumental: 1.4, column: 0.7, echo: 0.9, quiet: 0.8, axis: 0.5, vertical: 0.4, path: 0.3, framed: 0.5, numeral: 0.8 },
  constellation: { monumental: 1.2, quiet: 1, framed: 0.8, column: 0.7, echo: 0.6, axis: 0.5, path: 0.4, vertical: 0.5, numeral: 0.6 },
  edge: { vertical: 1.3, monumental: 1.1, column: 1, quiet: 0.9, echo: 0.9, axis: 0.6, path: 0.4, framed: 0.5, numeral: 0.8 },
  layers: { monumental: 1.2, framed: 1.1, column: 0.8, axis: 0.8, echo: 0.8, quiet: 0.7, path: 0.3, vertical: 0.5, numeral: 0.6 },
  frame: { framed: 1.5, monumental: 1, quiet: 1, column: 0.8, vertical: 0.5, axis: 0.4, echo: 0.5, path: 0.4, numeral: 0.6 },
  grid: { column: 1.2, monumental: 1.1, quiet: 0.9, vertical: 0.8, echo: 0.6, framed: 0.6, axis: 0.4, path: 0.2, numeral: 1 },
  centre: { framed: 1.2, monumental: 1.2, quiet: 1, path: 0.7, column: 0.6, echo: 0.6, axis: 0.3, vertical: 0.4, numeral: 0.7 },
};

const SECOND_ORG: Record<Org, Partial<Record<Org, number>>> = {
  partition: { flow: 1, constellation: 0.7, orbit: 0.6, axis: 0.8, layers: 0.6 },
  field: { constellation: 1, flow: 0.9, orbit: 0.7, strata: 0.5, axis: 0.6 },
  axis: { strata: 0.9, constellation: 0.7, layers: 0.8, orbit: 0.5 },
  orbit: { constellation: 0.9, layers: 0.6, partition: 0.5, strata: 0.5 },
  flow: { strata: 0.6, constellation: 0.8, partition: 0.7, layers: 0.5 },
  strata: { flow: 0.9, axis: 0.6, orbit: 0.5, constellation: 0.6 },
  constellation: { flow: 0.7, orbit: 0.7, axis: 0.6 },
  edge: { constellation: 0.8, strata: 0.7, flow: 0.7, axis: 0.6 },
  layers: { axis: 0.8, constellation: 0.6, flow: 0.6 },
  frame: { constellation: 0.7, orbit: 0.6, flow: 0.5 },
  grid: { flow: 0.8, orbit: 0.6, axis: 0.6 },
  centre: { orbit: 0.9, constellation: 0.6, strata: 0.6 },
};

/** A family of the vocabulary as inspiration: the principle and type it leans to (never its procedure). */
const FAMILY_HINT: Record<string, { org?: Org; type?: TypeStrategy; emphasis?: Emphasis }> = {
  radial: { org: 'orbit' },
  concentric: { org: 'orbit' },
  circular: { org: 'orbit', type: 'path' },
  spiral: { org: 'orbit', type: 'path' },
  diagonal: { org: 'axis', type: 'axis' },
  angular: { org: 'axis' },
  axial: { org: 'centre' },
  symmetrical: { org: 'centre' },
  asymmetrical: { org: 'edge' },
  'extreme-asymmetry': { org: 'edge' },
  'modular-grid': { org: 'grid' },
  'column-grid': { org: 'partition', type: 'column' },
  'hierarchical-grid': { org: 'grid' },
  'broken-grid': { org: 'grid' },
  'irregular-modular': { org: 'grid' },
  'layered-geometry': { org: 'layers', emphasis: 'geometric' },
  'typography-dominant': { type: 'monumental', emphasis: 'type' },
  'oversized-cropped-typography': { type: 'echo', emphasis: 'type' },
  'text-as-image': { emphasis: 'type', type: 'monumental' },
  'vertical-typography': { type: 'vertical', emphasis: 'type' },
  'rotational-typography': { type: 'axis', emphasis: 'type' },
  'experimental-line-breaking': { type: 'column', emphasis: 'type' },
  'repeated-typography': { type: 'echo', emphasis: 'type' },
  'minimal-typographic-hierarchy': { type: 'quiet', org: 'field' },
  'full-bleed-photography': { emphasis: 'image', org: 'field' },
  'split-image': { emphasis: 'image', org: 'partition' },
  'image-collage': { emphasis: 'collage', org: 'layers' },
  'masked-image': { emphasis: 'image' },
  'framed-imagery': { emphasis: 'image', org: 'frame' },
  'fragmented-imagery': { emphasis: 'image' },
  'image-with-negative-space': { emphasis: 'image', org: 'field', type: 'quiet' },
  'organic-flow': { org: 'flow', emphasis: 'organic' },
  'controlled-chaos': { org: 'constellation' },
  'layered-collage': { org: 'layers', emphasis: 'collage' },
  fragmented: { emphasis: 'geometric' },
  'visual-interruption': { org: 'strata' },
  'edge-cropped': { org: 'edge' },
  'spatial-tension': { org: 'edge' },
  'pattern-driven': { emphasis: 'abstract' },
  'procedural-composition': { emphasis: 'abstract', org: 'orbit' },
  timeline: { org: 'axis', emphasis: 'data' },
  'presentation-oriented': { org: 'field', type: 'monumental' },
};

const CONVENTIONAL_ORG: Org[] = ['centre', 'frame'];

/** The concept for this brief in this language (see the head of this file). Deterministic for one seed. */
export function conceive(reading: CreativeReading, p: Principles, req: ConceptRequest = {}): CreativeConcept {
  const seed = typeof req.seed === 'number' ? req.seed >>> 0 : (rng(String(req.seed ?? 'concept'))() * 4294967296) >>> 0;
  const r = rng('concept', seed);
  const k = req.constraints ?? {};
  const hint = k.family ? FAMILY_HINT[k.family] : undefined;
  const avoid = req.avoid ?? [];
  const hasImage = reading.constraints.images > 0;
  const expBase = clamp(k.experimentation ?? 30 + p.space.overlap * 0.2 + reading.emotion.tension * 0.3 + (k.unexpected ? 35 : 0) + (k.unconventional ? 20 : 0) + (k.notAiLook ? 10 : 0), 0, 100);
  // unexpected work flattens the weights toward what the language rarely does
  const flatten = <K extends string>(w: Partial<Record<K, number>>): Partial<Record<K, number>> => (k.unexpected ? (Object.fromEntries(Object.entries(w).map(([key, v]) => [key, Math.pow(v as number, 0.35)])) as Partial<Record<K, number>>) : w);
  const penal = <K extends string>(w: Partial<Record<K, number>>, pick: (key: ConceptKey) => K | null, factor: number) => {
    const out = { ...w };
    for (const a of avoid) {
      const v = pick(a);
      if (v && out[v] !== undefined) out[v] = (out[v] as number) * factor;
    }
    return out;
  };

  // ── what leads ──
  const emphW: Partial<Record<Emphasis, number>> = {
    type: 1 + (reading.hierarchy.length === 'short' ? 0.8 : 0) + p.bias.source.letterform * 0.35 + (p.space.focal === 'type' ? 0.4 : 0),
    image: hasImage ? 1.6 + p.space.imageShare / 40 : 0,
    abstract: 1.1 + (reading.subject.domains[0]?.id !== 'general' ? 0.4 : 0),
    geometric: 0.45 + p.geometry.rigidity / 85 + p.geometry.angularity / 160,
    organic: 0.25 + p.geometry.curvature / 60 - p.geometry.rigidity / 190,
    collage: 0.15 + (p.space.layering + p.space.overlap) / 140 + (hasImage ? 0.4 : 0),
    data: reading.constraints.data ? 2.5 : 0,
  };
  let emphasis: Emphasis =
    req.emphasis ??
    k.emphasis ??
    (k.imagePrimary && hasImage ? 'image' : k.abstractMotif ? r.pick(['abstract', 'organic'] as const) : hint?.emphasis && (hint.emphasis !== 'image' || hasImage) ? hint.emphasis : r.weighted(flatten(penal(emphW, (a) => a.emphasis, 0.55))));
  if ((emphasis === 'image' || emphasis === 'collage') && !hasImage) emphasis = 'abstract';
  if (emphasis === 'data' && !reading.constraints.data) emphasis = 'abstract';

  // ── its material ──
  let sourceW = { ...SOURCE_FOR[emphasis] };
  for (const s of SOURCES) if (sourceW[s] !== undefined) sourceW[s] = (sourceW[s] as number) * (p.bias.source[s] || 0.1);
  if (k.abstractMotif) sourceW = { metaphor: 1.2, organic: 0.8, pattern: 0.4 };
  if (k.keepType) delete sourceW.letterform;
  const source: Source = r.weighted(flatten(penal(sourceW, (a) => a.source, 0.7)));

  // the metaphor: one the subject offers, in a form the language can speak
  const metaphors: { m: Metaphor; domain: string; w: number }[] = reading.subject.domains.flatMap((d) => (DOMAIN_BY_ID.get(d.id) ?? GENERAL).metaphors.map((m) => ({ m, domain: d.label, w: d.weight * fitOf(m.motif, p) })));
  if (!metaphors.length) metaphors.push(...GENERAL.metaphors.map((m) => ({ m, domain: GENERAL.label, w: fitOf(m.motif, p) })));
  const mw = Object.fromEntries(metaphors.map((x, i) => [String(i), x.w * (avoid.some((a) => a.motif === x.m.motif) ? 0.4 : 1)]));
  const chosen = metaphors[Number(r.weighted(mw))] ?? metaphors[0];
  let motif: MotifKind | null;
  if (source === 'metaphor') motif = chosen.m.motif;
  else if (source === 'letterform') motif = 'glyph';
  else if (source === 'geometry')
    motif = r.weighted<MotifKind>({
      blocks: 2.2,
      steps: p.geometry.rigidity / 80,
      frames: p.geometry.rigidity / 110,
      sectors: p.geometry.curvature / 90,
      arches: p.geometry.curvature / 120 + (p.ornament.border === 'arch' ? 1 : 0),
      shards: p.geometry.angularity / 90,
    });
  else if (source === 'organic') motif = r.weighted<MotifKind>({ blob: 1.4, contours: 0.9, ribbon: 0.9, leaves: 0.5 + (reading.subject.domains.some((d) => d.id === 'nature') ? 1 : 0), curls: 0.4 });
  else if (source === 'pattern') motif = r.weighted<MotifKind>({ dots: 1, lattice: p.geometry.rigidity / 70, scan: 0.5, weave: 0.4, pixels: 0.4 });
  else motif = r.chance(0.55) ? chosen.m.motif : null;
  if (k.abstractMotif && (motif === 'blocks' || motif === 'glyph' || !motif)) motif = r.pick(['wave', 'contours', 'ribbon', 'network', 'ripple', 'spiral', 'shards'] as MotifKind[]);
  const metaphor = source === 'metaphor' || (source === 'image' && motif === chosen.m.motif) ? { name: chosen.m.name, domain: chosen.domain, says: chosen.m.says } : null;

  // ── its space: a principle (and, often, a second laid over it) ──
  const want = source === 'image' ? 'image' : motif ? MOTIF_TRAITS[motif].wants : 'zone';
  let orgW: Partial<Record<Org, number>> = {};
  for (const o of ORGS) orgW[o] = p.bias.org[o] * (ORG_FOR_WANT[want][o] ?? 0.4);
  if (reading.aspect === 'wide') ((orgW.strata = (orgW.strata ?? 0) * 0.5), (orgW.orbit = (orgW.orbit ?? 0) * 0.6));
  if (k.unconventional || k.notAiLook) for (const o of CONVENTIONAL_ORG) orgW[o] = (orgW[o] ?? 0) * 0.08;
  if (k.asymmetric) ((orgW.centre = 0), (orgW.frame = (orgW.frame ?? 0) * 0.2));
  if (k.dynamic) for (const o of ['axis', 'flow', 'orbit', 'constellation'] as Org[]) orgW[o] = (orgW[o] ?? 0) * 2;
  if (k.diagonal) orgW = { axis: 3, flow: 1 };
  if (k.negativeSpace !== undefined && k.negativeSpace >= 60) ((orgW.field = (orgW.field ?? 0) * 2.2), (orgW.edge = (orgW.edge ?? 0) * 1.6), (orgW.constellation = (orgW.constellation ?? 0) * 0.3), (orgW.grid = (orgW.grid ?? 0) * 0.4));
  if (k.headlineCentral) ((orgW.field = (orgW.field ?? 0) * 1.6), (orgW.centre = (orgW.centre ?? 0) * 1.4), (orgW.orbit = (orgW.orbit ?? 0) * 1.3));
  orgW = penal(orgW, (a) => a.org, 0.3);
  orgW = penal(orgW, (a) => a.org2, 0.75);
  const org: Org = k.org ?? hint?.org ?? r.weighted(flatten(orgW));
  const secondChance = clamp(0.2 + expBase / 180 + p.space.layering / 300 + (k.unexpected ? 0.25 : 0) - (k.negativeSpace !== undefined && k.negativeSpace >= 60 ? 0.3 : 0), 0, 0.85);
  const org2: Org | null = r.chance(secondChance) && !(k.negativeSpace !== undefined && k.negativeSpace >= 60) ? r.weighted(flatten(penal({ ...SECOND_ORG[org] }, (a) => a.org2, 0.5))) : null;

  // ── its type ──
  let typeW: Partial<Record<TypeStrategy, number>> = {};
  for (const t of TYPE_STRATEGIES) typeW[t] = p.bias.type[t] * (TYPE_FOR_ORG[org][t] ?? 0.3);
  if (emphasis === 'type') for (const t of ['monumental', 'echo', 'column', 'axis', 'vertical', 'path'] as TypeStrategy[]) typeW[t] = (typeW[t] ?? 0) * 1.6;
  if (emphasis === 'image' || source === 'letterform') ((typeW.quiet = (typeW.quiet ?? 0) * 1.8), (typeW.echo = (typeW.echo ?? 0) * 0.3));
  // the title kept small only when something else can carry the frame (a picture, a letterform, a strong mass)
  const strongFocal = emphasis === 'image' || source === 'letterform' || (motif !== null && MOTIF_TRAITS[motif].mass && (p.space.negativeSpace >= 55 || emphasis === 'organic'));
  if (!strongFocal) typeW.quiet = (typeW.quiet ?? 0) * 0.12;
  if (emphasis === 'type') typeW.quiet = 0;
  if (reading.hierarchy.chars > 30) ((typeW.path = (typeW.path ?? 0) * 0.2), (typeW.vertical = (typeW.vertical ?? 0) * 0.4), (typeW.echo = (typeW.echo ?? 0) * 0.5));
  if (!hasOpportunity(reading, 'numeral')) typeW.numeral = 0;
  if (k.headlineCentral) ((typeW.monumental = (typeW.monumental ?? 0) * 2.5), (typeW.framed = (typeW.framed ?? 0) * 1.5), (typeW.quiet = 0), (typeW.vertical = (typeW.vertical ?? 0) * 0.3));
  if (k.imagePrimary) ((typeW.quiet = (typeW.quiet ?? 0) * 2), (typeW.monumental = (typeW.monumental ?? 0) * 0.5));
  if (k.diagonal) typeW = { axis: 2, path: 0.6, monumental: 0.4 };
  if (k.unconventional || k.notAiLook) typeW.framed = (typeW.framed ?? 0) * 0.3;
  typeW = penal(typeW, (a) => a.type, 0.5);
  const type: TypeStrategy = k.type ?? hint?.type ?? r.weighted(flatten(typeW));

  // ── its operations ──
  const nOps = clamp(1 + (expBase > 40 ? 1 : 0) + (expBase > 72 ? 1 : 0), 1, 3);
  const opW: Partial<Record<Op, number>> = { ...p.bias.op };
  if (p.space.symmetry < 40 || k.asymmetric) opW.mirror = 0;
  if (!hasImage && motif !== 'glyph') opW.mask = (opW.mask ?? 0) * 0.3;
  if (type === 'echo') opW.echo = 0;
  if (org === 'centre') opW.rotate = (opW.rotate ?? 0) * 0.4;
  if (k.dynamic) ((opW.rotate = (opW.rotate ?? 0) * 2.2), (opW.cut = (opW.cut ?? 0) * 1.6), (opW.offset = (opW.offset ?? 0) * 1.4));
  if (k.notAiLook) ((opW.crop = (opW.crop ?? 0) * 2), (opW.scale = (opW.scale ?? 0) * 1.6));
  const operations: Op[] = [];
  for (let i = 0; i < nOps; i++) {
    const left = Object.fromEntries((Object.entries(opW) as [Op, number][]).filter(([o]) => !operations.includes(o))) as Partial<Record<Op, number>>;
    operations.push(r.weighted(flatten(left)));
  }

  // ── its picture, its colour ──
  const imagery: Imagery = !hasImage
    ? 'none'
    : emphasis === 'image'
      ? r.weighted<Imagery>({ full: 1.2, framed: 0.7 + (p.imagery.crop === 'framed' ? 1 : 0), masked: 0.6 + (p.imagery.mask !== 'none' ? 0.8 : 0) + p.geometry.curvature / 150, cut: 0.4 + p.geometry.angularity / 140 })
      : emphasis === 'collage'
        ? r.weighted<Imagery>({ cut: 1, masked: 0.8, inset: 0.6 })
        : r.weighted<Imagery>({ inset: 1, masked: 0.9, framed: 0.5, full: 0.3 });
  const colW: Partial<Record<Colouring, number>> = { ...p.bias.colouring };
  // a saturated language (primaries, neon, fluoro) keeps its colour: tones of one colour would betray it
  if (p.colour.saturation >= 60 && ['primary-triad', 'neon-dark', 'fluoro', 'full', 'complementary', 'jewel'].includes(p.colour.scheme)) colW.tonal = (colW.tonal ?? 0) * 0.15;
  if (!['partition', 'strata', 'grid', 'layers'].includes(org)) colW.split = 0;
  if (imagery === 'full') ((colW.field = 0), (colW.split = 0));
  if (k.notAiLook) colW.field = (colW.field ?? 0) * 0.6;
  const asked = k.colouring && (k.colouring !== 'split' || ['partition', 'strata', 'grid', 'layers'].includes(org)) && !(imagery === 'full' && (k.colouring === 'field' || k.colouring === 'split')) ? k.colouring : null;
  const colouring: Colouring = asked ?? r.weighted(penal(colW, () => null, 1));

  // ── its numbers ──
  const symmetry = clamp(k.asymmetric ? Math.min(12, p.space.symmetry) : org === 'centre' || org === 'frame' ? Math.max(60, p.space.symmetry) : p.space.symmetry * (k.unconventional ? 0.5 : 1), 0, 100);
  const negativeSpace = clamp(k.negativeSpace ?? p.space.negativeSpace + (emphasis === 'type' ? 5 : 0) - (org2 ? 8 : 0), 5, 92);
  const density = clamp(p.space.density + (org2 ? 10 : 0) - (k.negativeSpace !== undefined ? (k.negativeSpace - 50) * 0.6 : 0) + (reading.complexity - 50) * 0.3, 5, 95);
  const energy = clamp(reading.emotion.energy + (k.dynamic ? 25 : 0) + (k.unexpected ? 10 : 0), 0, 100);
  const focal = k.focal ?? focalFor(r.fork('focal'), org, symmetry, expBase);
  const orgParams = orgParamsFor(r.fork('org'), org, reading, p, { energy, diagonal: !!k.diagonal, focal });
  const org2Params = org2 ? orgParamsFor(r.fork('org2'), org2, reading, p, { energy, diagonal: false, focal: { x: 1 - focal.x, y: 1 - focal.y } }) : {};
  const typeParams: Record<string, number> = {
    scale: Math.round(clamp(0.78 + (emphasis === 'type' ? 0.22 : 0) + (k.headlineCentral ? 0.2 : 0) - (type === 'quiet' ? 0.3 : 0) + r.between(-0.08, 0.08), 0.4, 1.3) * 100) / 100,
    accent: r.chance(0.55) ? 1 : 0,
    align: symmetry >= 60 ? 1 : r.chance(0.18) ? 2 : 0, // 0 left, 1 centre, 2 right
    column: Math.round(r.between(0.38, 0.62) * 100) / 100,
  };
  // room asked for: less material, fewer marks, nothing laid over the structure
  const roomy = k.negativeSpace !== undefined && k.negativeSpace >= 60;
  const motifParams: Record<string, number> = {
    presence: Math.round(clamp((emphasis === 'image' || source === 'letterform' ? r.between(0.25, 0.5) : r.between(0.6, 1)) * (roomy ? 0.55 : 1), 0, 1) * 100) / 100,
    count: Math.max(2, Math.round(r.int(3, 9) * (roomy ? 0.5 : 1))),
    weight: Math.round(r.between(0.6, 1.6) * 100) / 100,
  };

  const concept: CreativeConcept = {
    schema: 1,
    seed,
    emphasis,
    source,
    motif,
    org,
    org2,
    metaphor,
    motifParams,
    orgParams,
    org2Params,
    operations,
    type,
    typeParams,
    imagery,
    colouring,
    focal,
    energy: Math.round(energy),
    density: Math.round(density),
    negativeSpace: Math.round(negativeSpace),
    symmetry: Math.round(symmetry),
    experimentation: Math.round(expBase),
    idea: '',
    artDirection: '',
    strategies: { typography: '', geometry: '', imagery: '', composition: '', colour: '', texture: '', space: '' },
    rationale: [],
    language: { source: p.source, name: p.name },
    constraints: k,
  };
  describe(concept, reading, p);
  return concept;
}

/** How well a motif suits a language's geometry (curvature and rigidity close to its own). */
function fitOf(m: MotifKind, p: Principles): number {
  const t = MOTIF_TRAITS[m];
  return clamp(1 - Math.abs(t.curvature - p.geometry.curvature) / 150 - Math.abs(t.rigidity - p.geometry.rigidity) / 170, 0.22, 1);
}

/** Where the eye should land: on the axis for a symmetric language, else at a point of tension (thirds, golden
 * sections, near an edge), never one of nine fixed anchors. */
function focalFor(r: Rng, org: Org, symmetry: number, exp: number): { x: number; y: number } {
  if (org === 'centre' || org === 'frame' || symmetry >= 70) return { x: 0.5, y: Math.round(r.between(0.34, 0.56) * 100) / 100 };
  const stops = [0.18, 0.333, 0.382, 0.5, 0.618, 0.667, 0.82];
  const pull = exp > 60 ? [0.1, 0.9, 0.15, 0.85] : [];
  const xs = [...stops, ...pull];
  const x = r.pick(xs) + r.between(-0.04, 0.04);
  const y = r.pick(xs) + r.between(-0.04, 0.04);
  return { x: Math.round(clamp(x, 0.08, 0.92) * 100) / 100, y: Math.round(clamp(y, 0.08, 0.92) * 100) / 100 };
}

/** The numbers of a spatial principle for this concept (angles, ratios, centres, counts): continuous, not presets. */
export function orgParamsFor(r: Rng, org: Org, reading: CreativeReading, p: Principles, o: { energy: number; diagonal: boolean; focal: { x: number; y: number } }): Record<string, number> {
  const R = (v: number) => Math.round(v * 1000) / 1000;
  const ratios = [0.618, 0.382, 0.5, 0.333, 0.667, 0.707, 0.293, 0.75, 0.25];
  switch (org) {
    case 'partition':
      return {
        depth: r.int(1, p.space.density > 55 ? 3 : 2),
        ratio: R(r.pick(ratios) + r.between(-0.03, 0.03)),
        vertical: r.chance(reading.aspect === 'landscape' || reading.aspect === 'wide' ? 0.7 : 0.4) ? 1 : 0,
        gutter: r.chance(0.35) ? 1 : 0,
        seed: r.int(1, 9999),
      };
    case 'axis': {
      const steep = o.diagonal || p.space.grid === 'diagonal' || o.energy > 60;
      const a = r.chance(0.12) && !o.diagonal ? 90 : (r.chance(0.5) ? -1 : 1) * (steep ? r.between(22, 52) : r.between(8, 30));
      return { angle: R(a), offset: R(r.between(-0.18, 0.18)) };
    }
    case 'orbit': {
      const off = r.chance(0.45);
      const cx = off ? (r.chance(0.5) ? r.between(-0.12, 0.2) : r.between(0.8, 1.12)) : r.between(0.35, 0.65);
      const cy = off ? r.between(-0.1, 1.1) : r.between(0.3, 0.6);
      return { cx: R(cx), cy: R(cy), rings: r.int(3, 9), growth: R(r.between(1.12, 1.5)), tilt: R(r.chance(0.3) ? r.between(0.45, 0.8) : 1) };
    }
    case 'flow':
      return { from: r.int(0, 3), to: r.int(0, 3), bend: R(r.between(-1, 1)), bend2: R(r.between(-1, 1)), weight: R(r.between(0.05, 0.22)) };
    case 'strata':
      return { bands: r.int(3, 7), rhythm: r.int(0, 3), vertical: reading.aspect === 'wide' || (reading.aspect === 'landscape' && r.chance(0.5)) ? 1 : 0, seed: r.int(1, 9999) };
    case 'constellation':
      return { count: r.int(12, Math.round(18 + p.space.density * 0.4)), gradient: R(r.between(0, 360)), spread: R(r.between(0.5, 1)) };
    case 'edge':
      return { side: r.int(0, 7), extent: R(r.between(0.45, 0.9)), along: R(r.between(0.15, 0.85)) };
    case 'layers':
      return { planes: r.int(2, 4), spread: R(r.between(2, 14) * (p.geometry.angularity / 60 + 0.3)), offset: R(r.between(0.03, 0.09)) };
    case 'frame':
      return { inset: R(r.between(0.05, 0.14)), broken: r.chance(0.45) ? 1 : 0, arch: r.chance(p.geometry.curvature / 160 + (p.ornament.border === 'arch' ? 0.5 : 0)) ? 1 : 0, double: r.chance(0.3) ? 1 : 0 };
    case 'grid':
      return { cols: r.int(3, 6), rows: r.int(4, 8), merges: r.int(1, 4), seed: r.int(1, 9999) };
    case 'centre':
      return { drop: R(r.between(-0.08, 0.1)), mirrored: r.chance(0.6) ? 1 : 0 };
    default:
      return { size: R(r.between(0.4, 0.85)) };
  }
}

// ── the concept said ──

// each principle said with its own numbers (the second principle's are its own, not the first's)
const ORG_SAYS: Record<Org, (c: CreativeConcept, p?: Record<string, number>) => string> = {
  partition: (c, p = c.orgParams) => `dividing the frame into unequal fields (${Math.round((p.ratio ?? 0.6) * 100)} : ${100 - Math.round((p.ratio ?? 0.6) * 100)})`,
  field: () => 'set against a wide, quiet field',
  axis: (c, p = c.orgParams) => (Math.abs(p.angle ?? 0) >= 80 ? 'hung on a vertical axis' : `along a ${Math.abs(p.angle ?? 0) > 30 ? 'steep' : 'shallow'} axis of ${Math.round(Math.abs(p.angle ?? 0))}°`),
  orbit: (c, p = c.orgParams) => ((p.cx ?? 0.5) < 0 || (p.cx ?? 0.5) > 1 || (p.cy ?? 0.5) < 0 || (p.cy ?? 0.5) > 1 ? 'orbiting a centre outside the frame' : 'turning about one centre'),
  flow: () => 'carried across the frame on one curve',
  strata: (c, p = c.orgParams) => `in ${p.vertical ? 'vertical' : 'horizontal'} strata of uneven depth`,
  constellation: () => 'scattered as a constellation that thins toward the words',
  edge: () => 'pressed against an edge and running off it',
  layers: (c, p = c.orgParams) => `in ${p.planes ?? 3} overlapping planes`,
  frame: (c, p = c.orgParams) => (p.broken ? 'inside a frame the words break out of' : p.arch ? 'under an arch' : 'held in a frame'),
  grid: (c, p = c.orgParams) => `on a ${p.cols ?? 4}×${p.rows ?? 6} modular grid with merged cells`,
  centre: () => 'built about a central axis',
};
const TYPE_SAYS: Record<TypeStrategy, string> = {
  monumental: 'the title set monumental, the largest thing in the frame',
  column: 'the title broken into a narrow column, a word or two a line',
  axis: 'the title turned onto the axis',
  path: 'the title riding the curve',
  vertical: 'the title running vertically along the structure',
  quiet: 'the title small and exact, letting the image speak',
  echo: 'the title echoed far larger behind itself, cropped by the frame',
  numeral: 'the date’s numbers drawn huge as a shape, the title beside them',
  framed: 'the title held inside a form',
};
const OP_SAYS: Record<Op, string> = {
  crop: 'cropped hard by the edge',
  rotate: 'turned off the grid',
  repeat: 'repeated in a rhythm',
  layer: 'layered with offsets',
  cut: 'cut and slid apart',
  scale: 'with an extreme jump in scale',
  mask: 'masked into another form',
  interrupt: 'interrupted by a band',
  echo: 'echoed in outline',
  mirror: 'mirrored about its axis',
  offset: 'printed slightly out of register',
};
const COLOUR_SAYS: Record<Colouring, string> = {
  'figure-ground': 'figures in the palette’s colours on the ground',
  inverse: 'the ink taken as the ground, the paper as the type',
  field: 'the accent laid as a whole field',
  'focal-accent': 'the accent kept for the focal point alone, everything else in ink and ground',
  tonal: 'tones of one colour, quiet and close',
  split: 'each field of the division in its own colour',
};

function describe(c: CreativeConcept, reading: CreativeReading, p: Principles) {
  const head = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const material =
    c.source === 'metaphor' && c.metaphor
      ? c.metaphor.says
      : c.source === 'letterform'
        ? `the title’s ${hasOpportunity(reading, 'ampersand') && c.motifParams.count % 2 ? 'ampersand' : 'first letter'} enlarged into architecture`
        : c.source === 'geometry'
          ? `${p.source === 'style' ? `${p.name}’s` : 'the language’s'} own geometry as structural weights`
          : c.source === 'image'
            ? 'the photograph as the field the design is built on'
            : c.source === 'organic'
              ? 'one organic form that sets the hierarchy'
              : 'a procedural field';
  const ops = c.operations.map((o) => OP_SAYS[o]).slice(0, 2);
  c.idea = `${head(material)}, ${ORG_SAYS[c.org](c)}${c.org2 ? ` and ${ORG_SAYS[c.org2](c, c.org2Params).replace(/^set against /, 'over ')}` : ''}; ${TYPE_SAYS[c.type]}${ops.length ? `, ${ops.join(' and ')}` : ''}.`;
  c.artDirection = `${p.source === 'style' ? p.name : 'A direction from the brief'} — ${c.emphasis === 'type' ? 'type-led' : c.emphasis === 'image' ? 'image-led' : c.emphasis === 'collage' ? 'collage' : c.emphasis === 'organic' ? 'organic' : c.emphasis === 'geometric' ? 'geometric' : c.emphasis === 'data' ? 'data-led' : 'abstract'}, ${c.energy >= 65 ? 'charged' : c.energy <= 35 ? 'calm' : 'measured'}, ${c.symmetry >= 60 ? 'symmetrical' : c.symmetry <= 20 ? 'strongly asymmetrical' : 'asymmetrical'}, ${c.negativeSpace >= 60 ? 'with a great deal of room' : c.density >= 70 ? 'dense' : 'balanced in density'}.`;
  c.strategies = {
    typography: head(TYPE_SAYS[c.type]) + '.',
    geometry: c.motif
      ? `${head(c.motif === 'glyph' ? 'a letterform' : c.motif)} drawn procedurally${c.metaphor ? ` (the ${c.metaphor.name})` : ''}, in the language’s ${p.geometry.curvature >= 60 ? 'curves' : p.geometry.rigidity >= 70 ? 'hard edges' : 'forms'}.`
      : 'No added geometry: the picture and the words carry it.',
    imagery:
      c.imagery === 'none'
        ? 'No picture.'
        : `The picture ${c.imagery === 'full' ? 'full-bleed' : c.imagery === 'masked' ? 'masked into the motif’s form' : c.imagery === 'cut' ? 'cut into pieces and re-set' : c.imagery === 'framed' ? 'framed like a print' : 'set as an inset'}.`,
    composition: head(ORG_SAYS[c.org](c)) + (c.org2 ? `, with ${ORG_SAYS[c.org2](c, c.org2Params)} laid over it` : '') + '.',
    colour: head(COLOUR_SAYS[c.colouring]) + '.',
    texture: p.texture.length ? `The language’s surface: ${p.texture.slice(0, 3).join(', ')}.` : 'A clean surface.',
    space: `Focus at ${Math.round(c.focal.x * 100)}% across and ${Math.round(c.focal.y * 100)}% down; about ${c.negativeSpace}% of the frame left empty.`,
  };
  c.rationale = [
    `Led by ${c.emphasis === 'type' ? 'the type' : c.emphasis === 'image' ? 'the picture' : c.emphasis === 'data' ? 'the numbers' : 'an image made for it'}${reading.hierarchy.length === 'short' && c.emphasis === 'type' ? ': the title is short enough to carry the frame' : hasOpportunity(reading, 'image') && c.emphasis === 'image' ? ': there is a picture to build on' : ''}.`,
    ...(c.metaphor ? [`The ${c.metaphor.name} comes from the subject (${c.metaphor.domain}).`] : []),
    `${head(c.org)} suits ${p.source === 'style' ? p.name : 'this direction'}: ${p.space.grid !== 'none' ? `its ${p.space.grid} structure` : 'its free structure'}, ${p.geometry.curvature >= 60 ? 'its curves' : p.geometry.rigidity >= 70 ? 'its rigour' : 'its balance'}.`,
    ...(Object.keys(c.constraints).length
      ? [
          `Asked for: ${Object.entries(c.constraints)
            .map(([key, v]) => (typeof v === 'boolean' ? key : `${key} ${typeof v === 'object' ? JSON.stringify(v) : v}`))
            .join(', ')}.`,
        ]
      : []),
  ];
}

/** A concept's structural keys (what diversity and memory compare). */
export const keyOf = (c: Pick<CreativeConcept, keyof ConceptKey>): ConceptKey => ({ emphasis: c.emphasis, org: c.org, org2: c.org2, type: c.type, motif: c.motif, source: c.source });

/** A key read back from its encoding in memory ("e:type|o:axis|o2:-|t:axis|m:wave|s:metaphor"). */
export function decodeKey(s: string): ConceptKey | null {
  const m = Object.fromEntries(s.split('|').map((p) => p.split(':') as [string, string]));
  const emphasis = (EMPHASES as readonly string[]).includes(m.e) ? (m.e as Emphasis) : null;
  const org = (ORGS as readonly string[]).includes(m.o) ? (m.o as Org) : null;
  const type = (TYPE_STRATEGIES as readonly string[]).includes(m.t) ? (m.t as TypeStrategy) : null;
  const source = (SOURCES as readonly string[]).includes(m.s) ? (m.s as Source) : null;
  if (!emphasis || !org || !type || !source) return null;
  return { emphasis, org, org2: (ORGS as readonly string[]).includes(m.o2) ? (m.o2 as Org) : null, type, motif: m.m && m.m !== '-' ? (m.m as MotifKind) : null, source };
}
export const encodeKey = (k: ConceptKey) => `e:${k.emphasis}|o:${k.org}|o2:${k.org2 ?? '-'}|t:${k.type}|m:${k.motif ?? '-'}|s:${k.source}`;

export { COLOURINGS, OPS };
