// lib/ux-v0/form.ts — a design's shape system: the shapes it is drawn with, derived from its direction.
//
// The order is the mandate's: the direction decides the design, the design the composition, the composition the
// shapes. So a shape system is not chosen from a list of styles. It is a point in eight continuous traits, each
// moved by what the direction already holds:
//
//   curvature    straight edges … fluid outlines
//   order        irregular … precise (symmetry, regular counts)
//   orthogonal   free angles … right angles
//   fragment     whole … cut into fragments
//   radial       linear … radial and concentric
//   depth        flat … layered (silhouettes behind silhouettes, cutouts)
//   energy       still … kinetic (turned, warped, tilted)
//   scale        even … dramatic contrast of sizes
//
// and the things that move them are the designer's own words as the creative reading understood them (refusals
// already read, lib/ux-v0/interpret.ts), a few words about form the reading does not cover, the look the direction
// set (its corners, its grid, its containers, its frames), the Creative DNA (the designer's, the references' and the
// brief's, merged in lib/ux-v0/dna.ts) and the pictures SocriaUX made for the moodboard. Each trait keeps the reasons
// it moved, so a designer can see why their shapes are what they are.
//
// From the traits come the system's VOCABULARY: the two or three constructions (lib/ux-v0/shape.ts) that suit it,
// weighted, and from the vocabulary each shape a part asks for — a picture's mask, a mass behind a title, a small
// echo of the main silhouette, a cut across an edge, a figure for words to wrap around, a section's edge — with its
// parameters drawn from the traits and a seed of its own. Two projects with the same words still differ by seed and
// by every other thing their directions hold; one project's shapes are related to each other, as a family.
//
// The examples a reader might expect ("architecture → structural geometry, fashion → fluid silhouettes") are not
// written anywhere here: they fall out of the traits.

import type { CreativeReading } from './interpret';
import { fillRatio, normalizeRecipe, shapeRings, shapeSeed, figureSignature, type ShapeKind, type ShapeRecipe } from './shape';

export const FORM_TRAITS = ['curvature', 'order', 'orthogonal', 'fragment', 'radial', 'depth', 'energy', 'scale'] as const;
export type FormTrait = (typeof FORM_TRAITS)[number];
export type FormSystem = Record<FormTrait, number> & { seed: number };

export const FORM_META: Record<FormTrait, { label: string; low: string; high: string }> = {
  curvature: { label: 'Curvature', low: 'straight', high: 'fluid' },
  order: { label: 'Order', low: 'irregular', high: 'precise' },
  orthogonal: { label: 'Angles', low: 'free angles', high: 'right angles' },
  fragment: { label: 'Fragmentation', low: 'whole', high: 'fragmented' },
  radial: { label: 'Radiality', low: 'linear', high: 'radial' },
  depth: { label: 'Depth', low: 'flat', high: 'layered' },
  energy: { label: 'Energy', low: 'still', high: 'kinetic' },
  scale: { label: 'Scale', low: 'even', high: 'dramatic' },
};

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A stored system held to its ranges; undefined when there is none. */
export function normalizeForm(v: unknown): FormSystem | undefined {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  if (!r) return undefined;
  const out = {} as FormSystem;
  for (const k of FORM_TRAITS) {
    const n = Math.round(Number(r[k]));
    if (!Number.isFinite(n)) return undefined;
    out[k] = clampN(n, 0, 100);
  }
  const seed = Math.round(Number(r.seed));
  out.seed = Number.isFinite(seed) && seed > 0 ? seed % 2147483646 || 1 : 1;
  return out;
}

export interface FormInput {
  /** the creative reading of the designer's words (refusals already read) */
  reading?: Pick<CreativeReading, 'qualities' | 'refusals' | 'restrictions'> | null;
  /** the designer's words, for the few words about form a reading does not hold */
  words?: string;
  /** the look's own choices */
  radius?: string;
  grid?: string;
  containers?: string;
  frame?: string;
  shapes?: readonly string[];
  motifs?: readonly string[];
  /** the Creative DNA's values, 0–100 (50 where it says nothing) */
  dna?: Partial<Record<'restraint' | 'composition' | 'typography' | 'motion' | 'density' | 'colour' | 'imagery' | 'interaction' | 'information', number>>;
  /** pictures SocriaUX made for the moodboard, by kind */
  art?: readonly string[];
  seed: number;
}

/** What each quality of the reading does to the shapes. */
const QUALITY_FORM: Record<string, Partial<Record<FormTrait, number>>> = {
  monumental: { scale: 26, order: 8, energy: -8 },
  restrained: { energy: -18, depth: -10, fragment: -14, order: 10 },
  minimal: { fragment: -16, depth: -12, energy: -10, order: 12 },
  cinematic: { depth: 20, scale: 18 },
  museum: { order: 18, energy: -16, fragment: -10 },
  architectural: { orthogonal: 30, curvature: -22, order: 10 },
  editorial: { scale: 12, order: 6 },
  experimental: { fragment: 26, order: -22, energy: 10 },
  layered: { depth: 30 },
  asymmetric: { order: -12, energy: 8 },
  immersive: { depth: 22, scale: 10 },
  brutal: { orthogonal: 22, curvature: -26, order: -6, scale: 14 },
  maximal: { depth: 16, energy: 14, fragment: 10, scale: 10 },
  luxurious: { curvature: 10, energy: -14, order: 12, fragment: -12 },
  warm: { curvature: 8 },
  cool: { orthogonal: 6, curvature: -4 },
  playful: { curvature: 18, energy: 22, order: -10 },
  expressive: { energy: 16, scale: 10, order: -8 },
  industrial: { orthogonal: 24, curvature: -18, order: 8 },
  futuristic: { radial: 10, order: 10, energy: 10 },
  organic: { curvature: 30, orthogonal: -22, order: -10 },
  geometric: { order: 22, curvature: -12 },
  abstract: { fragment: 10, curvature: 6 },
  dense: { depth: 8, fragment: 6 },
  airy: { depth: -8, scale: 6 },
  calm: { energy: -22 },
  kinetic: { energy: 26 },
  slow: { energy: -16 },
  precise: { order: 26, curvature: -8, fragment: -10 },
};

/** Words about form a reading does not hold as qualities: each with what it does and how it is said. */
const FORM_WORDS: readonly [RegExp, Partial<Record<FormTrait, number>>, string][] = [
  [/\b(fluid|liquid|flowing|curv(ed|ing|es|y)|wav(e|es|y)|soft forms?|pebbles?|droplets?|petals?|silk(en)?|drap(e|ed|ing)|botanical|floral|bodily|sensual)\b/, { curvature: 22, orthogonal: -12 }, 'fluid'],
  [/\b(radial|concentric|orbit(al|s)?|circular|circles|ripples?|spirals?|sunburst|solar|planet(ary|s)?|cosmic|vinyl|lens(es)?|astronom(y|ical))\b/, { radial: 34 }, 'radial'],
  [/\b(fragment(ed|s)?|broken|shatter(ed)?|collage|cut[- ]ups?|torn|glitch(y)?|splinter(ed)?|deconstruct(ed|ion|ive)?)\b/, { fragment: 30, order: -10 }, 'fragmented'],
  [/\b(structur(al|e)|concrete|steel|beams?|slabs?|blocks?|blocky|stacked|terrace(d|s)?|stairs?|staircase|modular|floor ?plans?|plan views?)\b/, { orthogonal: 22, curvature: -12 }, 'structural'],
  [/\b(scientific|science|research|laborator(y|ies)|lab|data|measure(d|ment|ments)?|diagram(s|matic)?|technical|engineer(ed|ing)?|mathematical|parametric)\b/, { order: 20, radial: 6 }, 'precise'],
  [/\b(diagonal(s)?|slant(ed)?|tilt(ed)?|angled|dynamic|momentum)\b/, { energy: 16, orthogonal: -12 }, 'diagonal'],
  [/\b(depth|dimension(al)?|overlap(ping|s)?|translucen(t|cy)|sculptur(al|e|ed))\b/, { depth: 18 }, 'deep'],
  [/\b(sharp|angular|crystal(line)?|faceted|shards?)\b/, { curvature: -18, fragment: 8 }, 'angular'],
  [/\b(round(ed)?|soft|gentle|friendly|bubbl(y|es?))\b/, { curvature: 14, energy: 4 }, 'soft'],
];
const NEGATION = /\b(not|no|never|nothing|without|avoid(ing)?|less|instead of|rather than|anything but)\b/;

/** The traits, and why each moved. Deterministic: the same direction has the same system. */
export function deriveForm(input: FormInput): { form: FormSystem; said: string[] } {
  const t = Object.fromEntries(FORM_TRAITS.map((k) => [k, 50])) as Record<FormTrait, number>;
  const why = Object.fromEntries(FORM_TRAITS.map((k) => [k, [] as string[]])) as Record<FormTrait, string[]>;
  const bump = (k: FormTrait, v: number, because: string) => {
    t[k] += v;
    if (Math.abs(v) >= 6 && because && !why[k].includes(because)) why[k].push(because);
  };
  // 1 · what the designer's words asked of the whole page, as read
  for (const q of input.reading?.qualities ?? []) for (const [k, v] of Object.entries(QUALITY_FORM[q.id] ?? {})) bump(k as FormTrait, v as number, `“${q.said}”`);
  // 2 · words about form; a form word refused pushes the other way
  const words = ` ${(input.words ?? '').toLowerCase()} `;
  for (const [re, deltas, label] of FORM_WORDS) {
    const m = re.exec(words);
    if (!m) continue;
    const before = words.slice(Math.max(0, m.index - 28), m.index);
    const refused = NEGATION.test(before.split(/[.;,]/).pop() ?? '');
    for (const [k, v] of Object.entries(deltas)) bump(k as FormTrait, refused ? -(v as number) * 0.8 : (v as number), refused ? `not ${label} (“${m[0]}” refused)` : `“${m[0]}”`);
  }
  // 3 · the look the direction set
  if (input.radius === 'none') {
    bump('curvature', -14, 'square corners');
    bump('orthogonal', 8, 'square corners');
  } else if (input.radius === 'round') bump('curvature', 14, 'round corners');
  if (input.grid === 'swiss' || input.grid === 'modular') {
    bump('order', 14, `a ${input.grid} grid`);
    bump('orthogonal', 10, `a ${input.grid} grid`);
  } else if (input.grid === 'asymmetric' || input.grid === 'poster') {
    bump('order', -8, `an ${input.grid === 'poster' ? 'poster' : 'asymmetric'} grid`);
    bump('energy', 6, `an ${input.grid === 'poster' ? 'poster' : 'asymmetric'} grid`);
  }
  if (input.containers === 'ruled' || input.containers === 'framed') bump('orthogonal', 6, `${input.containers} sections`);
  if (input.frame === 'arch' || input.frame === 'circle') bump('curvature', 10, `${input.frame} frames`);
  if (input.frame === 'offset') bump('depth', 8, 'offset frames');
  const curved = (input.shapes ?? []).filter((s) => s === 'circle' || s === 'blob' || s === 'arch').length;
  const square = (input.shapes ?? []).filter((s) => s === 'square' || s === 'diamond' || s === 'quarter').length;
  if (curved) bump('curvature', Math.min(12, curved * 6), 'the language’s round marks');
  if (square) bump('orthogonal', Math.min(10, square * 5), 'the language’s square marks');
  if ((input.motifs ?? []).includes('shapes')) bump('depth', 6, 'shapes as a motif');
  // 4 · the Creative DNA
  const d = input.dna ?? {};
  const v = (k: keyof NonNullable<FormInput['dna']>) => (typeof d[k] === 'number' ? (d[k] as number) : 50);
  const c = v('composition');
  bump('order', -(c - 50) * 0.45, c >= 62 ? 'an experimental composition' : c <= 38 ? 'a structured composition' : '');
  bump('fragment', Math.max(0, c - 55) * 0.7, c >= 62 ? 'an experimental composition' : '');
  bump('energy', (c - 50) * 0.2, '');
  const r = v('restraint');
  bump('depth', (r - 50) * 0.35, r >= 64 ? 'an expressive DNA' : r <= 36 ? 'a restrained DNA' : '');
  bump('energy', (r - 50) * 0.25, r >= 64 ? 'an expressive DNA' : r <= 36 ? 'a restrained DNA' : '');
  bump('fragment', (r - 50) * 0.15, '');
  const ty = v('typography');
  bump('scale', (ty - 50) * 0.55, ty >= 64 ? 'statement typography' : ty <= 36 ? 'functional typography' : '');
  const m = v('motion');
  bump('energy', (m - 50) * 0.3, m >= 64 ? 'an immersive motion DNA' : m <= 36 ? 'still motion' : '');
  bump('depth', (m - 50) * 0.15, '');
  const de = v('density');
  bump('fragment', (de - 50) * 0.1, '');
  bump('scale', -(de - 50) * 0.2, de <= 36 ? 'an airy density' : '');
  bump('order', (v('information') - 50) * 0.3, v('information') >= 64 ? 'information first' : '');
  // 5 · the pictures SocriaUX made for the moodboard
  const ART: Record<string, Partial<Record<FormTrait, number>>> = {
    contour: { curvature: 6, radial: 6 },
    orbit: { radial: 14, order: 6 },
    lattice: { order: 10, orthogonal: 6 },
    field: { orthogonal: 6 },
    grain: { depth: 6 },
    render: { curvature: 6 },
  };
  for (const kind of new Set(input.art ?? [])) for (const [k, dv] of Object.entries(ART[kind] ?? {})) bump(k as FormTrait, dv as number, `the moodboard’s ${kind} drawing`);
  const form = {} as FormSystem;
  for (const k of FORM_TRAITS) form[k] = Math.round(clampN(t[k], 6, 94));
  form.seed = input.seed > 0 ? input.seed : 1;
  const said = FORM_TRAITS.filter((k) => Math.abs(form[k] - 50) >= 14 && why[k].length).map((k) => `${FORM_META[k].label} ${form[k] > 50 ? FORM_META[k].high : FORM_META[k].low} (${form[k]}): ${why[k].slice(0, 3).join(', ')}`);
  return { form, said };
}

// ── the vocabulary: the constructions that suit the system ─────────────

/** The two or three constructions this system draws with, strongest first. */
export function vocabulary(f: FormSystem): { kind: ShapeKind; weight: number }[] {
  const cv = f.curvature / 100;
  const or = f.order / 100;
  const og = f.orthogonal / 100;
  const fr = f.fragment / 100;
  const ra = f.radial / 100;
  const en = f.energy / 100;
  // fragments and radiality are departures: a neutral system (50) has none of either
  const past = (x: number) => Math.max(0, (x - 0.5) / 0.5);
  const raw: [ShapeKind, number][] = [
    ['organic', cv * cv * (1 - og) * (1.25 - or * 0.6)],
    ['super', (cv * 0.6 + 0.25) * or * or * (1 - og * 0.6)],
    ['poly', (1 - cv) * (1 - og * 0.55) * (0.55 + (1 - or) * 0.35)],
    ['stepped', og * og * (1 - cv) * 1.6],
    ['radial', Math.pow(past(ra), 1.2) * (0.5 + (1 - cv) * 0.5) * 1.6],
    ['rings', Math.pow(past(ra), 1.2) * (0.4 + or * 0.6) * 1.5],
    ['shards', Math.pow(past(fr), 1.5) * 1.7],
    ['arc', cv * (0.3 + past(ra) * 0.4 + en * 0.3) * 0.55],
  ];
  const sorted = raw.sort((a, b) => b[1] - a[1]);
  const top = sorted[0][1] || 1;
  return sorted
    .filter(([, w], i) => i === 0 || w >= top * 0.45)
    .slice(0, 3)
    .map(([kind, w]) => ({ kind, weight: Math.round((w / top) * 100) / 100 }));
}

/** What a shape is for, which decides what it may be. */
export const FIGURE_ROLES = ['mask', 'mass', 'echo', 'cut', 'wrap', 'fragments', 'edge'] as const;
export type FigureRole = (typeof FIGURE_ROLES)[number];

function rng(seed: number) {
  let a = (seed || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The parameters a construction takes in this system, drawn per shape. */
function paramsFor(f: FormSystem, kind: ShapeKind, R: () => number, seed: number): ShapeRecipe {
  const j = (n: number) => (R() - 0.5) * 2 * n;
  const irregular = Math.round(clampN(100 - f.order * 0.85 + f.fragment * 0.25 + j(12), 0, 100));
  const curve = Math.round(clampN(f.curvature + j(12), 0, 100));
  // right angles stay right angles unless the system has the energy to tilt them
  const tilt = f.orthogonal >= 60 ? (f.energy >= 62 ? j((f.energy - 50) / 4) : 0) : j(f.energy * 0.35);
  const warp = Math.round(clampN((f.energy - 45) * 0.5 + f.fragment * 0.25 - f.order * 0.15 + j(8), 0, 100));
  let n = 5;
  let cut = 0;
  if (kind === 'poly') n = f.order >= 60 ? 3 + Math.floor(R() * 4) : 5 + Math.floor(R() * 5);
  else if (kind === 'super') n = [4, 6, 8, 3, 12, 2][Math.min(5, Math.floor(R() * (f.order >= 60 ? 3 : 6)))];
  else if (kind === 'radial') {
    n = 5 + Math.floor((f.energy / 100) * 12 + R() * 4);
    cut = R() < 0.4 ? Math.round(20 + R() * 40) : 0;
  } else if (kind === 'rings') n = 2 + Math.floor((f.depth / 100) * 3 + R());
  else if (kind === 'shards') {
    n = 1 + Math.floor((f.fragment / 100) * 4 + R());
    cut = Math.round(clampN(18 + f.fragment * 0.4 + j(8), 0, 100));
  } else if (kind === 'stepped') {
    n = 2 + Math.floor(((100 - f.order) / 100) * 4 + R() * 2);
    cut = f.depth >= 55 ? Math.round(40 + R() * 40) : Math.round(R() * 30);
  } else if (kind === 'organic') n = 2 + Math.floor(R() * 4);
  else if (kind === 'arc') n = Math.floor(R() * 8);
  else if (kind === 'edge') n = f.orthogonal >= 60 ? 3 + Math.floor(R() * 4) : 2 + Math.floor(R() * 6);
  const mirror = f.order >= 62 && (kind === 'poly' || kind === 'organic' || kind === 'super');
  return normalizeRecipe({ kind, seed, n, irregular, curve, turn: Math.round(tilt), cut, warp, ...(mirror ? { mirror: true } : {}) })!;
}

/** The edge a section's ground takes: a wave, steps, teeth or a tear, by the system's traits. */
function edgeFor(f: FormSystem, R: () => number, seed: number): ShapeRecipe {
  const curve = f.curvature >= 60 ? 70 + Math.round(R() * 25) : f.orthogonal >= 60 ? Math.round(R() * 20) : 30 + Math.round(R() * 25);
  const irregular = f.fragment >= 60 ? 70 + Math.round(R() * 25) : f.orthogonal >= 60 ? Math.round(R() * 30) : 30 + Math.round(R() * 25);
  const n = f.orthogonal >= 60 ? 3 + Math.floor(R() * 4) : f.energy >= 60 ? 8 + Math.floor(R() * 8) : 2 + Math.floor(R() * 4);
  return normalizeRecipe({ kind: 'edge', seed, n, irregular, curve, turn: 0, cut: 40, warp: 0 })!;
}

const MASKABLE: readonly ShapeKind[] = ['poly', 'organic', 'super', 'stepped', 'radial', 'rings', 'shards'];

/**
 * A shape for a part of the page, in this system: `k` numbers the place (the third picture, the second mass), so
 * places differ while staying one family. A picture's mask and a figure for words to wrap must keep most of their
 * box (a picture cut to a thin star is no longer a picture); a section's edge is a band.
 */
export function figureFor(f: FormSystem, role: FigureRole, k = 0, salt = ''): ShapeRecipe {
  const seed = shapeSeed(f.seed, role, k, salt);
  const R = rng(seed);
  if (role === 'edge') return edgeFor(f, R, seed);
  const vocab = vocabulary(f);
  if (role === 'fragments') {
    const s = paramsFor(f, 'shards', R, seed);
    return { ...s, n: Math.max(2, s.n), curve: f.curvature >= 55 ? 70 : 10 };
  }
  // a weighted draw from the vocabulary; the echo keeps to the strongest construction, so it reads as its echo
  const draw = () => {
    if (role === 'echo') return vocab[0].kind;
    const total = vocab.reduce((s, x) => s + x.weight, 0);
    let pick = R() * total;
    for (const x of vocab) if ((pick -= x.weight) <= 0) return x.kind;
    return vocab[0].kind;
  };
  const minFill = role === 'mask' ? 0.55 : role === 'wrap' ? 0.55 : role === 'cut' ? 0.25 : 0.3;
  for (let attempt = 0; attempt < 6; attempt++) {
    let kind = draw();
    if ((role === 'mask' || role === 'wrap') && !MASKABLE.includes(kind)) kind = f.curvature >= 50 ? 'organic' : f.orthogonal >= 55 ? 'stepped' : 'poly';
    if ((role === 'mask' || role === 'wrap') && kind === 'radial' && f.energy < 55) kind = f.order >= 55 ? 'rings' : 'super';
    if (role === 'wrap' && (kind === 'shards' || kind === 'rings')) kind = f.curvature >= 50 ? 'super' : 'poly';
    if (role === 'cut' && kind === 'rings') kind = 'arc';
    const s = paramsFor(f, kind, R, shapeSeed(seed, attempt));
    if (fillRatio(shapeRings(s)) >= minFill) return s;
  }
  // nothing in the vocabulary keeps enough of the box: the plainest figure of the system's curvature
  return paramsFor(f, f.curvature >= 50 ? 'super' : 'poly', rng(seed + 1), seed + 1);
}

/** The system in a line, for the designer and the generator: what it draws with and how. */
export function describeForm(f: FormSystem): string {
  const NAMES: Record<ShapeKind, string> = {
    poly: f.order >= 60 ? 'regular polygons' : 'irregular polygons',
    organic: 'organic silhouettes',
    super: f.curvature >= 55 ? 'rounded parametric figures' : 'parametric stars and petals',
    stepped: 'stepped, structural outlines',
    radial: 'radial rays and cut sectors',
    rings: f.order >= 55 ? 'concentric rings' : 'eccentric rings',
    shards: 'fragments cut and pulled apart',
    arc: 'thick, tapering arcs',
    edge: 'shaped edges',
    custom: 'drawn outlines',
  };
  const kinds = vocabulary(f).map((v) => NAMES[v.kind]);
  const how = [
    f.curvature <= 30 ? 'hard corners' : f.curvature >= 70 ? 'fluid edges' : '',
    f.orthogonal >= 66 ? 'at right angles' : '',
    f.energy >= 66 ? 'turned and warped' : f.energy <= 30 ? 'held still' : '',
    f.depth >= 64 ? 'layered silhouette over silhouette' : '',
    f.scale >= 66 ? 'in strong contrasts of size' : '',
  ].filter(Boolean);
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}` : kinds[0];
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}${how.length ? `; ${how.join(', ')}` : ''}.`;
}

/** The system's shapes as a few written examples for the generator: recipes it may use as they are, or vary. */
export function formExamples(f: FormSystem): ShapeRecipe[] {
  return [figureFor(f, 'mask', 0), figureFor(f, 'mass', 0), figureFor(f, 'echo', 0)];
}

/** How alike two shapes are as ideas (their signatures), for the repetition measures: 1 the same move. */
export function figureLike(a: ShapeRecipe, b: ShapeRecipe): number {
  if (a.kind !== b.kind) return 0;
  const x = figureSignature(a).split('/');
  const y = figureSignature(b).split('/');
  const same = x.filter((p, i) => p === y[i]).length;
  return same / Math.max(x.length, y.length);
}
