// lib/objects/scene-intent.ts
//
// READING A DESCRIPTION INTO SCENE OPERATIONS — deterministically, as the
// person types, so the scene can be previewed before anything is committed.
//
// "a red box 2 m wide, 1 tall and 3 deep, then put a blue sphere of radius
//  0.5 on top of it" →
//    add box (w 2, h 1, d 3, red) · add sphere (r 0.5, blue) on box1
//
// The reader is a grammar, not a guesser. It reads shapes and their
// synonyms, numbers with units, colours and finishes, placements ("on top
// of", "left of", "at (x, y, z)"), edits ("move it left 2", "rotate the
// cone 45° about x", "make it taller by 1", "twice as big", "copy it 3
// times to the right"), arrays ("a row of 5 cubes", "a ring of 8 spheres of
// radius 3", "stack 4 boxes"), and shapes defined by expressions ("a surface
// z = sin(x)·cos(y)", "a tube x = cos t, y = sin t, z = t/4 for t from 0
// to 12", "revolve r = 1 + 0.3 sin(3y) for y from 0 to 4"). Anything it
// cannot read is said back — clause by clause, with the words it skipped —
// rather than filled in. Defaults are used only for sizes nobody gave, and
// they are marked as defaults in the scene.
//
// Each operation is applied as it is read (with the scene kind's own
// operations), so "it" and "them" can mean what an earlier clause made, and
// the preview the person sees is exactly what committing will compute.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import { DIMS, EXPRS, MAX_NODES, NOMINAL_DENSITY, SCENE_OPS, SHAPE_WORD, UNIT_M, fitKey, sceneBox, writePairs, type LengthUnit, type SceneNode, type SceneShape, type SceneState } from './scene';
import { worldBox, type Vec3 } from './scene-geometry';

export interface SceneOp {
  op: string;
  args: Record<string, string | number>;
}

export interface ClauseReading {
  text: string;
  /** what was understood, in plain words */
  understood?: string;
  /** why nothing could be done with it */
  problem?: string;
  /** content words that were not read */
  skipped?: string[];
  /** notes on choices made (a default size, the most recent of two boxes) */
  notes?: string[];
}

export interface Reading {
  ops: SceneOp[];
  clauses: ClauseReading[];
  /** the scene after the operations — exactly what committing computes */
  preview: SceneState;
  changes: { added: string[]; changed: string[]; removed: string[] };
}

export interface ReadContext {
  /** the part the person has selected */
  selected?: string | null;
  /** the part last made or edited */
  last?: string | null;
  /** the part this same description last made or changed — set while reading, not by the caller */
  here?: string | null;
}

// ── vocabulary ──────────────────────────────────────────────────────

const SHAPE_NOUNS: [RegExp, SceneShape, { cube?: true; slab?: true }?][] = [
  [/\bcubes?\b/, 'box', { cube: true }],
  [/\b(?:boxes|box|cuboids?|blocks?|bricks?|crates?|slabs?)\b/, 'box'],
  [/\b(?:spheres?|balls?|orbs?|globes?)\b/, 'sphere'],
  [/\b(?:cylinders?|rods?|columns?|pillars?|posts?|discs?|disks?)\b/, 'cylinder'],
  [/\bpyramids?\b/, 'pyramid' as SceneShape],
  [/\b(?:cones?|spikes?)\b/, 'cone'],
  [/\b(?:tor(?:us|i)|donuts?|doughnuts?)\b/, 'torus'],
  [/\b(?:planes?|floors?|grounds?|sheets?|tiles?)\b/, 'plane'],
  [/\b(?:capsules?|pills?)\b/, 'capsule'],
  [/\b(?:air ?foils?|aerofoils?|wing sections?|wings?)\b/, 'airfoil'],
  [/\bstars?\b/, 'star'],
  [/\b(?:rings?|washers?|annul(?:us|i)|pipes?|hollow cylinders?)\b/, 'ring'],
  [/\b(?:prisms?|hexagons?|pentagons?|octagons?|heptagons?|triangles?|(?:\d+|three|four|five|six|seven|eight|nine|ten|twelve)-?(?:gons?|sided (?:prisms?|columns?|shapes?)))\b/, 'prism'],
];

const POLY_SIDES: Record<string, number> = { triangle: 3, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8 };

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, half: 0.5, couple: 2,
};

const COLORS: Record<string, string> = {
  red: '#d43f3a', green: '#3a9a52', blue: '#3a6fd4', yellow: '#e8c53a', orange: '#e8873a', purple: '#8a4fc4', violet: '#8a4fc4',
  pink: '#e87fb0', magenta: '#d43ab4', cyan: '#3ac4d4', teal: '#2f8f8a', turquoise: '#3ac4b0', white: '#f4f4f0', black: '#1e1e1e',
  gray: '#8a8a8a', grey: '#8a8a8a', silver: '#c0c0c0', gold: '#d4af37', golden: '#d4af37', brown: '#7a5232', beige: '#d8c8a8',
  tan: '#c8a878', navy: '#24306a', maroon: '#7a2430', olive: '#7a7a2a', lime: '#9ad43a', coral: '#e8705a', salmon: '#e8907a',
  crimson: '#c42040', indigo: '#4a3aa4', lavender: '#b4a4e4', mint: '#9ae4c0', copper: '#b87333', bronze: '#cd7f32', brass: '#b5a642',
  steel: '#8a9096', chrome: '#c9ccd1', wooden: '#9c6b3c', wood: '#9c6b3c', ivory: '#f2ead8', charcoal: '#36383a', sand: '#d8c49a',
};
const METALS = new Set(['gold', 'golden', 'silver', 'copper', 'bronze', 'brass', 'steel', 'chrome', 'iron', 'aluminum', 'aluminium', 'metal', 'metallic']);

const UNIT_RE = '(m|meters?|metres?|cm|centimeters?|centimetres?|mm|millimeters?|millimetres?|inch(?:es)?|in(?=\\s*(?:wide|tall|high|deep|long|thick|$|,|\\s+(?:and|by|x)\\b))|"|ft|foot|feet|\')';
const NUM_RE = '(-?\\d+(?:\\.\\d+)?(?:\\s*/\\s*\\d+)?|-?\\.\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half)';

function unitOf(raw: string | undefined, fallback: LengthUnit): number {
  if (!raw) return UNIT_M[fallback];
  const u = raw.toLowerCase();
  if (/^(?:m|meters?|metres?)$/.test(u)) return 1;
  if (/^(?:cm|centimet(?:er|re)s?)$/.test(u)) return 0.01;
  if (/^(?:mm|millimet(?:er|re)s?)$/.test(u)) return 0.001;
  if (/^(?:in|inch(?:es)?|")$/.test(u)) return 0.0254;
  if (/^(?:ft|foot|feet|')$/.test(u)) return 0.3048;
  return UNIT_M[fallback];
}

function numOf(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim().toLowerCase();
  if (s in NUMBER_WORDS) return NUMBER_WORDS[s];
  const fr = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+)$/.exec(s);
  if (fr) return Number(fr[1]) / Number(fr[2]);
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** A light or dark shade of a named colour, mixed toward white or black. */
function shade(hex: string, toward: '#ffffff' | '#000000', t: number): string {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(toward.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** "light blue", "dark red": the named colour with its modifier, as the scene stores it. */
function tone(mod: string | undefined, base: string): string {
  return mod === 'light' || mod === 'pale' ? shade(base, '#ffffff', 0.45) : mod === 'dark' || mod === 'deep' ? shade(base, '#000000', 0.4) : base;
}

/** A length in metres, said in the scene's unit: "0.25 m", "25 cm". */
const lengthWord = (m: number, unit: LengthUnit) => `${Number((m / UNIT_M[unit]).toPrecision(3))} ${unit}`;

/** "box" → "boxes", "torus" → "tori", "sphere" → "spheres". */
const plural = (w: string) => (w === 'torus' ? 'tori' : /(?:x|s|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);

// ── a clause, consumed as it is read ────────────────────────────────

class Clause {
  readonly text: string;
  work: string;
  notes: string[] = [];
  constructor(text: string) {
    this.text = text;
    this.work = text;
  }
  /** match a pattern, and blank out what it matched so it is not read twice */
  take(re: RegExp): RegExpMatchArray | null {
    const m = re.exec(this.work);
    if (!m) return null;
    this.work = this.work.slice(0, m.index) + ' '.repeat(m[0].length) + this.work.slice(m.index + m[0].length);
    return m;
  }
  has(re: RegExp) {
    return re.test(this.work);
  }
  /** content words not read */
  leftover(): string[] {
    // the words of a polite request said in the conversation ("can you make it red, thanks") are not content
    const stop = /^(?:a|an|the|and|with|of|to|it|its|that|this|is|be|please|pls|now|also|then|me|i|we|you|your|want|need|like|some|just|make|put|place|add|create|build|draw|give|let|lets|let's|us|have|there|should|would|can|could|over|in|into|onto|on|at|for|from|by|as|so|one|more|very|really|nice|little|big|small|large|tiny|huge|new|another|other|same|which|who|where|here|space|scene|object|objects|thing|things|shape|shapes|part|parts|units?|axis|direction|side|sides|size|ok|okay|thanks|thank|hey)$/;
    return this.work
      .replace(/[(),;:!?=+*/^×]/g, ' ')
      .replace(/(?<!\d)[.-]|\.(?!\d)/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !stop.test(w));
  }
}

// ── reading numbers in context ──────────────────────────────────────

interface DimReading {
  w?: number;
  h?: number;
  d?: number;
  r?: number;
  diameter?: number;
  side?: number;
  R?: number;
  ri?: number;
  tube?: number;
  n?: number;
  depth?: number;
  chord?: number;
  span?: number;
  /** "3 m long": a width for most shapes, the extrusion for an outline */
  long?: number;
}

function readDims(c: Clause, unit: LengthUnit): DimReading {
  const out: DimReading = {};
  const u = (n: string | undefined, un: string | undefined) => {
    const v = numOf(n);
    return v === null ? null : v * unitOf(un, unit);
  };
  // 2 x 3 x 4 (m): length × width × height  →  width (x), depth (z), height (y)
  let m = c.take(new RegExp(`${NUM_RE}\\s*${UNIT_RE}?\\s*(?:x|by)\\s*${NUM_RE}\\s*${UNIT_RE}?\\s*(?:x|by)\\s*${NUM_RE}\\s*${UNIT_RE}?`, 'i'));
  if (m) {
    const un = m[6] ?? m[4] ?? m[2];
    out.w = u(m[1], m[2] ?? un) ?? undefined;
    out.d = u(m[3], m[4] ?? un) ?? undefined;
    out.h = u(m[5], m[6] ?? un) ?? undefined;
    c.notes.push('read “a × b × c” as width × depth × height');
  } else {
    m = c.take(new RegExp(`${NUM_RE}\\s*${UNIT_RE}?\\s*(?:x|by)\\s*${NUM_RE}\\s*${UNIT_RE}?`, 'i'));
    if (m) {
      const un = m[4] ?? m[2];
      out.w = u(m[1], m[2] ?? un) ?? undefined;
      out.d = u(m[3], m[4] ?? un) ?? undefined;
    }
  }
  // NUM UNIT wide / tall / high / deep / long / thick / across / in diameter / in radius
  const adj = new RegExp(`${NUM_RE}\\s*${UNIT_RE}?\\s*(?:-\\s*)?(wide|tall|high|deep|long|thick|across|in diameter|diameter|in radius)\\b`, 'gi');
  let a: RegExpExecArray | null;
  const w0 = c.work;
  while ((a = adj.exec(w0))) {
    const v = u(a[1], a[2]);
    if (v === null) continue;
    const k = a[3].toLowerCase();
    if (k === 'wide') out.w = v;
    else if (k === 'tall' || k === 'high') out.h = v;
    else if (k === 'deep') out.d = v;
    else if (k === 'long') out.w = out.long = v;
    else if (k === 'thick') out.depth = v;
    else if (k === 'across' || k.includes('diameter')) out.diameter = v;
    else if (k.includes('radius')) out.r = v;
  }
  c.work = c.work.replace(adj, (s) => ' '.repeat(s.length));
  // shared unit across "2 m wide, 1 tall and 3 deep": numbers without a unit use the clause's first unit
  const firstUnit = new RegExp(`\\d\\s*${UNIT_RE}`, 'i').exec(c.text)?.[1];
  if (firstUnit && !new RegExp(`${NUM_RE}\\s*${UNIT_RE}\\s*(?:-\\s*)?(?:wide|tall|high|deep|long)`, 'i').test(c.text.replace(new RegExp(`\\d\\s*${UNIT_RE}`, 'i'), ''))) {
    // re-read unit-less adjectives with the first unit
    const re2 = new RegExp(`${NUM_RE}\\s*(wide|tall|high|deep|long|thick)\\b`, 'gi');
    let b: RegExpExecArray | null;
    while ((b = re2.exec(c.text))) {
      const v = u(b[1], firstUnit);
      if (v === null) continue;
      const k = b[2].toLowerCase();
      if (k === 'wide' || k === 'long') out.w = v;
      if (k === 'long') out.long = v;
      if (k === 'tall' || k === 'high') out.h = v;
      if (k === 'deep') out.d = v;
      if (k === 'thick') out.depth = v;
    }
  }
  // named dimension = NUM UNIT
  const named = new RegExp(
    `(outer radius|inner radius|tube radius|ring radius|major radius|minor radius|radius|diameter|width|height|depth|length|thickness|side(?: length)?|size|edge|chord|span)\\s*(?:of|=|:|is|to)?\\s*${NUM_RE}\\s*${UNIT_RE}?`,
    'gi'
  );
  const w1 = c.work;
  while ((a = named.exec(w1))) {
    const v = u(a[2], a[3]);
    if (v === null) continue;
    const k = a[1].toLowerCase();
    if (k === 'outer radius' || k === 'ring radius' || k === 'major radius') out.R = v;
    else if (k === 'inner radius') out.ri = v;
    else if (k === 'tube radius' || k === 'minor radius') out.tube = v;
    else if (k === 'radius') out.r = v;
    else if (k === 'diameter') out.diameter = v;
    else if (k === 'width') out.w = v;
    else if (k === 'length') out.w = out.long = v;
    else if (k === 'height') out.h = v;
    else if (k === 'depth') out.d = v;
    else if (k === 'thickness') out.depth = v;
    else if (k === 'chord') out.chord = v;
    else if (k === 'span') out.span = v;
    else out.side = v;
  }
  c.work = c.work.replace(named, (s) => ' '.repeat(s.length));
  // N sides / N points / N-sided
  const sides = c.take(new RegExp(`(?:with\\s+)?${NUM_RE}\\s*(?:-\\s*)?(?:sides|sided|points|pointed|corners)\\b`, 'i'));
  if (sides) out.n = numOf(sides[1]) ?? undefined;
  return out;
}

// ── colours and finishes ────────────────────────────────────────────

function readLook(c: Clause): { color?: string; mat?: string; opacity?: number; said: string[] } {
  const said: string[] = [];
  const out: { color?: string; mat?: string; opacity?: number } = {};
  const hex = c.take(/#([0-9a-f]{6})\b/i);
  if (hex) {
    out.color = `#${hex[1].toLowerCase()}`;
    said.push(out.color);
  }
  if (!out.color) {
    const names = Object.keys(COLORS).sort((a, b) => b.length - a.length).join('|');
    const m = c.take(new RegExp(`\\b(light|pale|dark|deep)?\\s*(${names})\\b`, 'i'));
    if (m) {
      const base = COLORS[m[2].toLowerCase()];
      const mod = m[1]?.toLowerCase();
      out.color = tone(mod, base);
      said.push(`${mod ? mod + ' ' : ''}${m[2].toLowerCase()}`);
      if (METALS.has(m[2].toLowerCase())) out.mat = 'metal';
    }
  }
  const metal = c.take(/\b(metal(?:lic)?|steel|chrome|iron|alumin(?:i)?um)\b/i);
  if (metal) {
    out.mat = 'metal';
    if (!out.color && COLORS[metal[1].toLowerCase()]) out.color = COLORS[metal[1].toLowerCase()];
    said.push('metal');
  }
  const pct = c.take(/(\d+(?:\.\d+)?)\s*%\s*(transparent|see-through|opaque)/i);
  if (pct) {
    const v = Number(pct[1]) / 100;
    out.opacity = /opaque/i.test(pct[2]) ? Math.max(0.05, v) : Math.max(0.05, 1 - v);
    said.push(`${pct[1]}% ${pct[2]}`);
  }
  if (c.take(/\b(glass(?:y)?|transparent|see-through|clear)\b/i)) {
    out.mat = 'glass';
    said.push('glass');
  }
  if (c.take(/\btranslucent\b/i)) {
    out.opacity = out.opacity ?? 0.6;
    said.push('translucent');
  }
  if (c.take(/\b(opaque|solid)\b/i)) {
    out.opacity = 1;
    said.push('opaque');
  }
  if (c.take(/\b(wire(?:frame|d)?|outlined?)\b/i)) {
    out.mat = 'wire';
    said.push('wireframe');
  }
  if (c.take(/\b(shiny|glossy|plastic)\b/i)) {
    out.mat = out.mat ?? 'plastic';
    said.push('plastic');
  }
  if (c.take(/\b(matte|matt|flat)\b/i)) {
    out.mat = 'matte';
    said.push('matte');
  }
  return { ...out, said };
}

// ── what it is made of ──────────────────────────────────────────────

const MATTER_WORDS = '(stainless steel|steel|iron|alumin(?:i)?um|copper|brass|bronze|titanium|lead|concrete|granite|marble|brick|wooden|wood|oak|pine|water|ice|rubber|pla|abs|nylon|foam|cork)';

/**
 * A material and a density: "steel", "made of oak", "density 7850 kg/m³",
 * "2700 kg/m3". The material word is NOT consumed — it is also a look, and
 * readLook takes it after — while a density is. A named material with no
 * density given takes its nominal one (scene.ts NOMINAL_DENSITY), which the
 * scene says is nominal.
 */
function readMatter(c: Clause): { name?: string; density?: number; said: string } | null {
  const d =
    c.take(new RegExp(`\\bdensity\\s*(?:of|=|:|is)?\\s*${NUM_RE}\\s*(?:kg\\s*\\/\\s*m(?:3|³|\\^3)|kg per cubic met(?:er|re)s?)?`, 'i')) ??
    c.take(new RegExp(`\\b${NUM_RE}\\s*(?:kg\\s*\\/\\s*m(?:3|³|\\^3)|kg per cubic met(?:er|re)s?)`, 'i'));
  const density = d ? numOf(d[1]) ?? undefined : undefined;
  c.take(/\b(?:made (?:of|from|out of))\b/i);
  const w = new RegExp(`\\b${MATTER_WORDS}\\b`, 'i').exec(c.work);
  let name = w ? w[1].toLowerCase() : undefined;
  if (name === 'wooden') name = 'wood';
  if (name === 'aluminum') name = 'aluminium';
  if (!name && density === undefined) return null;
  if (density === undefined && name && NOMINAL_DENSITY[name] === undefined) return null;
  return { ...(name ? { name } : {}), ...(density !== undefined ? { density } : {}), said: [name, density !== undefined ? `${density} kg/m³` : ''].filter(Boolean).join(', ') };
}

// ── which part is meant ─────────────────────────────────────────────

interface Ref {
  ids: string[];
  note?: string;
  said: string;
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
/** "the big box", "the tallest cylinder": which of several, by size — [larger first?, by height or by bulk] */
const SIZE_Q: Record<string, [1 | -1, 'h' | 'v']> = {
  big: [1, 'v'], bigger: [1, 'v'], biggest: [1, 'v'], large: [1, 'v'], larger: [1, 'v'], largest: [1, 'v'], huge: [1, 'v'],
  small: [-1, 'v'], smaller: [-1, 'v'], smallest: [-1, 'v'], little: [-1, 'v'], tiny: [-1, 'v'],
  tall: [1, 'h'], taller: [1, 'h'], tallest: [1, 'h'], short: [-1, 'h'], shorter: [-1, 'h'], shortest: [-1, 'h'],
};
const FINISH_Q: Record<string, string> = { glass: 'glass', glassy: 'glass', metal: 'metal', metallic: 'metal', wire: 'wire', wireframe: 'wire', plastic: 'plastic', matte: 'matte' };
const SHADES = /^(?:light|pale|dark|deep)$/;
const PRONOUN_RE = /^(?:all of them|both of them|this one|that one|the same one|the whole scene|the scene|the copies|the new ones|everything|them|they|those|these|both|it|this|that)(?![a-z0-9])/;

function shapeOfNoun(word: string): SceneShape | null {
  for (const [re, shape] of SHAPE_NOUNS) if (re.test(word)) return shape;
  return null;
}

/** "boxes", "tori", "spheres" — a plural shape noun means all of them. */
const isPluralNoun = (w: string) => /(?:es|[^su]s|i)$/.test(w) && !/^(?:torus|annulus)$/.test(w) && shapeOfNoun(w) !== null;

const idNum = (id: string) => Number(/\d+$/.exec(id)?.[0] ?? 0);

interface RefWords {
  /** characters of the text the reference takes, from its start */
  len: number;
  phrase: string;
  /** a bare noun — no article, no pronoun: "put sphere on box" may be asking for a new one */
  bare: boolean;
  /** followed by "'s", or "its": "the box's height" */
  poss: boolean;
}

/**
 * The words at the start of `text` that name a part — a pronoun, an id, a
 * name in the scene, or qualifiers (ordinal, colour, finish, size) before a
 * shape noun — and no more: in "the big box left 2" they are "the big box".
 */
function refAt(text: string, s: SceneState): RefWords | null {
  const lead = text.length - text.trimStart().length;
  const t = text.slice(lead).toLowerCase();
  const done = (len: number, bare: boolean): RefWords => {
    const poss = /^'s(?![a-z])/.test(t.slice(len));
    return { len: lead + len + (poss ? 2 : 0), phrase: t.slice(0, len).trim(), bare, poss };
  };
  const pro = PRONOUN_RE.exec(t);
  if (pro) return done(pro[0].length, false);
  if (/^its(?![a-z])/.test(t)) return { len: lead + 3, phrase: 'it', bare: false, poss: true };
  const id = /^[a-z]+\d+(?![a-z0-9])/.exec(t);
  if (id && s.nodes.some((n) => n.id === id[0])) return done(id[0].length, false);
  let i = 0;
  let bare = true;
  const q = /^(?:all of the|all the|all|every|each|both|the)\s+/.exec(t);
  if (q) {
    i = q[0].length;
    bare = false;
  }
  // a name the person gave wins over reading its words as qualifiers: a part called "big box"
  const names = [...new Set(s.nodes.map((n) => n.name.toLowerCase()))].sort((a, b) => b.length - a.length);
  const nameAt = (k: number) => names.find((nm) => t.startsWith(nm, k) && !/[a-z0-9]/.test(t.charAt(k + nm.length)));
  let quals = 0;
  for (;;) {
    const nm = nameAt(i);
    if (nm) return done(i + nm.length, bare && !quals);
    const w = /^([a-z]+)(?:\s+|(?=[^a-z]|$))/.exec(t.slice(i));
    if (!w) break;
    const word = w[1];
    if (word in ORDINALS || /^(?:last|latest|newest|new|other)$/.test(word) || word in COLORS || SHADES.test(word) || word in FINISH_Q || word in SIZE_Q) {
      i += w[0].length;
      quals++;
      continue;
    }
    break;
  }
  const rest = t.slice(i);
  for (const [re] of SHAPE_NOUNS) {
    const m = new RegExp(`^(?:${re.source})`).exec(rest);
    if (!m) continue;
    let end = i + m[0].length;
    // "box 2" — the noun and its number, when that is what a part is called
    const num = /^\s+\d+(?![\d.])/.exec(t.slice(end));
    if (num && names.includes(`${t.slice(i, end)} ${num[0].trim()}`)) end += num[0].length;
    return done(end, bare && !quals);
  }
  if (quals && /^ones?(?![a-z])/.test(rest)) return done(i + (/^ones/.test(rest) ? 4 : 3), false);
  return null;
}

/**
 * A reference — "it", "them", "everything", "the red box", "the second
 * sphere", "the biggest box", "all the cubes", "box 2", "the tower" —
 * against the scene as it stands. "It" is what this same description last
 * made or changed, else the selected part, else the part last made.
 */
function resolve(phrase: string, s: SceneState, ctx: ReadContext, recent: string[]): Ref | null {
  const raw = phrase.trim().toLowerCase();
  if (!s.nodes.length) return null;
  const has = (id: string | null | undefined): id is string => !!id && s.nodes.some((n) => n.id === id);
  const nameOf = (id: string) => s.nodes.find((n) => n.id === id)!.name;
  if (/^(?:it|this|that|this one|that one|the same|the same one)$/.test(raw)) {
    const id = has(ctx.here) ? ctx.here : has(ctx.selected) ? ctx.selected : has(ctx.last) ? ctx.last : s.nodes[s.nodes.length - 1].id;
    return { ids: [id], said: nameOf(id) };
  }
  if (/^(?:them|they|those|these|both|both of them|all of them|the copies|the new ones)$/.test(raw)) {
    const ids = recent.filter(has);
    if (ids.length > 1) return { ids, said: `the ${ids.length} just made` };
    return { ids: s.nodes.map((n) => n.id), said: 'everything' };
  }
  if (/^(?:everything|all|the whole scene|the scene)$/.test(raw)) return { ids: s.nodes.map((n) => n.id), said: 'everything' };
  const chosen = (n: SceneNode) => n.name.toLowerCase() !== SHAPE_WORD[n.shape];
  const exact = s.nodes.find((n) => n.id === raw || ((n.name.toLowerCase() === raw || `the ${n.name.toLowerCase()}` === raw) && chosen(n)));
  if (exact) return { ids: [exact.id], said: exact.name };
  let p = raw;
  let all = false;
  const q = /^(?:all of the|all the|all|every|each|both|the)\s+/.exec(p);
  if (q) {
    all = !/^the\s+$/.test(q[0]);
    p = p.slice(q[0].length);
  }
  const words = p.split(/\s+/).filter(Boolean);
  let ordinal: number | null = null;
  let last = false;
  let color: string | null = null;
  let mat: string | null = null;
  let size: [1 | -1, 'h' | 'v'] | null = null;
  const rest: string[] = [];
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w in ORDINALS) ordinal = ORDINALS[w];
    else if (/^(?:last|latest|newest|new)$/.test(w)) last = true;
    else if (SHADES.test(w) && words[k + 1] in COLORS) {
      color = tone(w, COLORS[words[k + 1]]);
      k++;
    } else if (w in COLORS) color = COLORS[w];
    else if (w in FINISH_Q) mat = FINISH_Q[w];
    else if (w in SIZE_Q) size = SIZE_Q[w];
    else if (w !== 'other') rest.push(w);
  }
  let noun = rest.join(' ');
  let plural = all;
  if (/^ones?$/.test(noun)) {
    plural = plural || noun === 'ones';
    noun = '';
  }
  if (!noun && !color && !mat && ordinal === null && !size) return null;
  const head = noun.split(' ').pop() ?? '';
  if (head && isPluralNoun(head)) plural = true;
  const sh = noun ? shapeOfNoun(noun) : null;
  const singular = noun.replace(/(?:es|s)$/, '');
  let cands = s.nodes.filter((n) => {
    if (noun) {
      const nm = n.name.toLowerCase();
      const bare = nm.replace(/ \d+$/, '');
      const byName = nm === noun || bare === noun || nm === singular || bare === singular;
      if (!byName && !(sh && n.shape === sh)) return false;
    }
    if (color && n.color !== color) return false;
    if (mat && n.mat !== mat) return false;
    return true;
  });
  // "the cube": a box whose sides are equal, when there is one
  if (/^cubes?$/.test(head)) {
    const cubes = cands.filter((n) => n.shape === 'box' && sizeOfBox(n).every((v, _i, a) => Math.abs(v - a[0]) <= 1e-9 * Math.max(1, a[0])));
    if (cubes.length) cands = cubes;
  }
  if (!cands.length) return null;
  const what = noun || (color ? 'parts of that colour' : 'parts');
  if (size) {
    const by = size;
    const m = (n: SceneNode) => {
      const b = worldBox(n);
      if (!b) return 0;
      return by[1] === 'h' ? b.max[1] - b.min[1] : (b.max[0] - b.min[0]) * Math.max(1e-9, b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
    };
    cands = [...cands].sort((a, b) => by[0] * (m(b) - m(a)) || idNum(a.id) - idNum(b.id));
    const pick = cands[(ordinal ?? 1) - 1];
    if (!pick) return null;
    const tie = cands.filter((n) => Math.abs(m(n) - m(pick)) <= 1e-9 * Math.max(1, m(pick)));
    return { ids: [pick.id], said: pick.name, ...(tie.length > 1 ? { note: `${tie.length} ${what} are the same size — took ${pick.name}` } : {}) };
  }
  cands.sort((a, b) => idNum(a.id) - idNum(b.id));
  if (ordinal !== null) {
    const pick = cands[ordinal - 1];
    return pick ? { ids: [pick.id], said: pick.name } : null;
  }
  if (plural) return { ids: cands.map((n) => n.id), said: cands.length === 1 ? cands[0].name : `${all ? 'all ' : 'the '}${cands.length} ${what}` };
  if (last || cands.length === 1) {
    const pick = cands[cands.length - 1];
    return { ids: [pick.id], said: pick.name };
  }
  // more than one: what this description just touched, else the selected one, else the most recent — and say so
  const here = ctx.here ? cands.find((n) => n.id === ctx.here) : null;
  const sel = ctx.selected ? cands.find((n) => n.id === ctx.selected) : null;
  const pick = here ?? sel ?? cands[cands.length - 1];
  return { ids: [pick.id], said: pick.name, note: `${cands.length} parts match “${phrase.trim()}” — took ${here ? 'the one just made' : sel ? 'the selected one' : 'the most recent'}, ${pick.name}` };
}

const sizeOfBox = (n: SceneNode): number[] => [n.dims.w * n.scale[0], n.dims.h * n.scale[1], n.dims.d * n.scale[2]];

// ── placements ──────────────────────────────────────────────────────

const REL = '(on top of|on to|onto|on|upon|under|underneath|beneath|below|next to|beside|by|to the left of|left of|to the right of|right of|in front of|behind|above|over)';
/** relations a distance can qualify: "2 m left of the box" — not "on", where nothing rests at a distance */
const DIR_REL = '(under|underneath|beneath|below|next to|beside|to the left of|left of|to the right of|right of|in front of|behind|above|over)';

function sideOf(rel: string): string {
  const r = rel.toLowerCase();
  if (/^(?:on top of|on to|onto|on|upon)$/.test(r)) return 'top';
  if (/^(?:under|underneath|beneath|below)$/.test(r)) return 'bottom';
  if (/left/.test(r)) return 'left';
  if (/right|next to|beside|by/.test(r)) return 'right';
  if (/front/.test(r)) return 'front';
  if (/behind/.test(r)) return 'back';
  if (/above|over/.test(r)) return 'above';
  return 'top';
}

interface Placement {
  target?: string;
  side?: string;
  gap?: number;
  at?: [number | null, number | null, number | null];
  said: string;
  note?: string;
}

function readPlacement(c: Clause, s: SceneState, ctx: ReadContext, recent: string[], unit: LengthUnit): Placement | null | { problem: string } {
  const at = c.take(/\bat\s*\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+))?\s*\)?/i);
  if (at) {
    const k = unitOf(undefined, unit);
    const nums = [at[1], at[2], at[3]].map((v) => (v === undefined ? null : Number(v) * k));
    // two numbers: x and z on the floor
    const pos: [number | null, number | null, number | null] = nums[2] === null ? [nums[0], null, nums[1]] : [nums[0], nums[1], nums[2]];
    return { at: pos, said: `at (${[at[1], at[2], at[3]].filter((v) => v !== undefined).join(', ')})` };
  }
  const axes = c.take(/\bat\s+((?:[xyz]\s*=\s*-?[\d.]+[\s,and]*){1,3})/i);
  if (axes) {
    const k = unitOf(undefined, unit);
    const get = (ax: string) => {
      const m = new RegExp(`${ax}\\s*=\\s*(-?[\\d.]+)`, 'i').exec(axes[1]);
      return m ? Number(m[1]) * k : null;
    };
    return { at: [get('x'), get('y'), get('z')], said: `at ${axes[1].trim()}` };
  }
  if (c.take(/\bat\s+the\s+(?:origin|centre|center|middle)\b/i)) return { at: [0, null, 0], said: 'at the centre' };
  if (c.take(/\b(?:on|onto|to)\s+(?:the\s+)?(?:floor|ground)\b/i)) return { target: 'ground', side: 'ground', said: 'on the floor' };
  // a relation, then the part it is relative to — the first such pair whose words name a part
  let unknown: { rel: string; what: string } | null = null;
  for (const [re, withGap] of [
    [new RegExp(`\\b${NUM_RE}\\s*${UNIT_RE}?\\s+${DIR_REL}(?![a-z])`, 'gi'), true],
    [new RegExp(`\\b${REL}(?![a-z])`, 'gi'), false],
  ] as const) {
    let m: RegExpExecArray | null;
    const work = c.work;
    while ((m = re.exec(work))) {
      const relWord = withGap ? m[3] : m[1];
      const words = refAt(work.slice(m.index + m[0].length), s);
      if (!words) {
        // "on the dragon": a definite thing the scene does not have — unless it is a direction ("on the left of …")
        const def = /^\s*(?:the|that|this)\s+([a-z]+)/.exec(work.slice(m.index + m[0].length));
        if (def && !unknown && !/^(?:left|right|front|back|top|bottom|side|middle|centre|center|floor|ground|same|other)$/.test(def[1])) unknown = { rel: relWord, what: def[1] };
        continue;
      }
      const end = m.index + m[0].length + words.len;
      c.work = work.slice(0, m.index) + ' '.repeat(end - m.index) + work.slice(end);
      const ref = resolve(words.phrase, s, ctx, recent);
      if (!ref) return { problem: s.nodes.length ? `There is nothing called “${words.phrase.replace(/^(?:the|all the|all|every|each)\s+/, '')}” to put it ${relWord}.` : 'There is nothing in the scene yet to put it next to.' };
      const gap = withGap ? (numOf(m[1]) ?? 0) * unitOf(m[2], unit) : 0;
      let side = sideOf(relWord);
      if (side === 'above') {
        side = 'top';
        const g = gap || UNIT_M[unit];
        return { target: ref.ids[0], side, gap: g, said: `${relWord} ${ref.said}`, note: gap ? ref.note : `above it with a 1 ${unit} gap (no distance given)` };
      }
      return { target: ref.ids[0], side, gap, said: `${relWord} ${ref.said}`, note: ref.note };
    }
  }
  if (unknown) return { problem: s.nodes.length ? `There is nothing called “${unknown.what}” to put it ${unknown.rel}.` : `There is nothing in the scene yet to put it ${unknown.rel}.` };
  return null;
}

// ── shapes from expressions ─────────────────────────────────────────

function readRange(text: string, v: string): [number, number] | null {
  const m =
    new RegExp(`\\b${v}\\s*(?:from|in|=|between|∈)\\s*\\[?\\s*(-?[\\d.]+(?:\\s*\\*?\\s*pi)?)\\s*(?:to|\\.\\.|,|and)\\s*(-?[\\d.]+(?:\\s*\\*?\\s*pi)?)\\s*\\]?`, 'i').exec(text) ??
    new RegExp(`(-?[\\d.]+(?:\\s*\\*?\\s*pi)?)\\s*<=?\\s*${v}\\s*<=?\\s*(-?[\\d.]+(?:\\s*\\*?\\s*pi)?)`, 'i').exec(text);
  if (!m) return null;
  const val = (t: string) => {
    const pi = /pi/i.test(t);
    const n = Number(t.replace(/\s*\*?\s*pi/i, '') || (pi ? 1 : NaN));
    return pi ? (Number.isFinite(n) ? n : 1) * Math.PI : n;
  };
  const a = val(m[1]);
  const b = val(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

/** "z = …", "r = …", "x = …, y = …, z = …" — the expression ends at a range phrase or the clause's end. */
function exprAfter(text: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*(?:\\(\\s*[a-z,\\s]*\\))?\\s*=\\s*(.+?)(?=\\s*(?:,\\s*[a-z]\\s*(?:\\([^)]*\\))?\\s*=|\\s+(?:for|over|with|where|on|from|in the range)\\b|\\s+[a-z]\\s+(?:from|in|between)\\b|$))`, 'i').exec(text);
  return m ? m[1].trim().replace(/[.;]$/, '') : null;
}

function readParametric(c: Clause, unit: LengthUnit): { shape: SceneShape; dims: Record<string, number>; exprs: Record<string, string>; said: string } | { problem: string } | null {
  const t = c.text;
  const zf = /\bz\s*(?:\(\s*x\s*,\s*y\s*\))?\s*=/i.test(t) && !/\bx\s*=.*\by\s*=.*\bz\s*=/i.test(t);
  if (zf) {
    const f = exprAfter(t, 'z');
    if (!f || !compileExpr(f, ['x', 'y'])) return { problem: `“${f ?? t}” could not be read as z in terms of x and y.` };
    const xr = readRange(t, 'x');
    const yr = readRange(t, 'y');
    const both = /\b(?:x\s*,\s*y|x and y)\s*(?:from|in|between)\s*\[?\s*(-?[\d.]+)\s*(?:to|\.\.|,|and)\s*(-?[\d.]+)/i.exec(t);
    const xs = xr ?? (both ? [Number(both[1]), Number(both[2])] : [-2, 2]);
    const ys = yr ?? (both ? [Number(both[1]), Number(both[2])] : [-2, 2]);
    c.work = ' '.repeat(c.work.length);
    if (!xr && !both) c.notes.push('x and y run from −2 to 2 (no range given)');
    if (unit !== 'm') c.notes.push('x, y and z are read in metres');
    return { shape: 'surface', dims: { x0: xs[0], x1: xs[1], y0: ys[0], y1: ys[1], n: 48 }, exprs: { f }, said: `the surface z = ${f}` };
  }
  if (/\bx\s*(?:\(\s*t\s*\))?\s*=/i.test(t) && /\by\s*(?:\(\s*t\s*\))?\s*=/i.test(t) && /\bz\s*(?:\(\s*t\s*\))?\s*=/i.test(t)) {
    const ex = exprAfter(t, 'x');
    const ey = exprAfter(t, 'y');
    const ez = exprAfter(t, 'z');
    if (!ex || !ey || !ez || ![ex, ey, ez].every((e) => compileExpr(e, ['t']))) return { problem: 'The curve’s x, y and z must each be an expression in t.' };
    const tr = readRange(t, 't') ?? [0, 2 * Math.PI];
    if (!readRange(t, 't')) c.notes.push('t runs from 0 to 2π (no range given)');
    const rad = /(?:tube\s+)?(?:radius|thickness)\s*(?:of|=)?\s*(-?[\d.]+)\s*(m|cm|mm)?/i.exec(t);
    const r = rad ? Number(rad[1]) * unitOf(rad[2], unit) : 0.05;
    if (!rad) c.notes.push('tube radius 0.05 m (none given)');
    c.work = ' '.repeat(c.work.length);
    return { shape: 'tube', dims: { t0: tr[0], t1: tr[1], r, n: 240 }, exprs: { x: ex, y: ey, z: ez }, said: `a tube along (${ex}, ${ey}, ${ez})` };
  }
  if (/\b(?:revolve|revolved|lathe|turned|vase|bowl|goblet|vessel|bottle)\b/i.test(t) || /\br\s*(?:\(\s*y\s*\))?\s*=/i.test(t)) {
    const r = exprAfter(t, 'r');
    if (!r) return /\b(?:revolve|lathe)\b/i.test(t) ? { problem: 'Give its radius as an expression in height, like “r = 1 + 0.3 sin(3y) for y from 0 to 4”.' } : null;
    if (!compileExpr(r, ['y'])) return { problem: `“${r}” could not be read as a radius in terms of y.` };
    const yr = readRange(t, 'y') ?? readRange(t, 'h') ?? [0, 2];
    if (!readRange(t, 'y') && !readRange(t, 'h')) c.notes.push('heights from 0 to 2 (no range given)');
    c.work = ' '.repeat(c.work.length);
    if (unit !== 'm') c.notes.push('r and y are read in metres');
    return { shape: 'revolve', dims: { y0: yr[0], y1: yr[1], n: 96 }, exprs: { r }, said: `a shape turned from r = ${r}` };
  }
  const pts = /\b(?:corners?|points?|through|vertices)\s*:?\s*((?:\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)[\s,]*){3,})/i.exec(t);
  if (pts) {
    const k = unitOf(undefined, unit);
    const list = [...pts[1].matchAll(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g)].map((m) => `${Number(m[1]) * k},${Number(m[2]) * k}`);
    c.take(new RegExp(pts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return { shape: 'polygon', dims: {}, exprs: { pts: list.join('|') }, said: `a shape with ${list.length} corners` };
  }
  return null;
}

// ── clause readers ──────────────────────────────────────────────────

interface Ctx {
  s: SceneState;
  ctx: ReadContext;
  recent: string[];
  ops: SceneOp[];
  unit: LengthUnit;
}

/** Apply an operation to the running preview, as the kind will on commit. */
function run(st: Ctx, op: string, args: SceneOp['args']): string | null {
  const def = SCENE_OPS[op];
  const why = def.check(st.s, args);
  if (why) return why;
  st.s = def.apply(st.s, args);
  st.ops.push({ op, args });
  return null;
}

const lastAdded = (before: SceneState, after: SceneState) => after.nodes.filter((n) => !before.nodes.some((b) => b.id === n.id)).map((n) => n.id);

function dimArgs(shape: SceneShape, d: DimReading, cube: boolean): { dims: Record<string, number>; notes: string[] } {
  const dims: Record<string, number> = {};
  const notes: string[] = [];
  const r = d.r ?? (d.diameter !== undefined ? d.diameter / 2 : undefined);
  switch (shape) {
    case 'box': {
      const side = d.side ?? (cube ? (d.w ?? d.h ?? d.d) : undefined);
      if (side !== undefined && cube) {
        dims.w = dims.h = dims.d = side;
      } else {
        if (d.w !== undefined) dims.w = d.w;
        if (d.h !== undefined) dims.h = d.h;
        else if (d.depth !== undefined) dims.h = d.depth;
        if (d.d !== undefined) dims.d = d.d;
        if (d.side !== undefined) dims.w = dims.h = dims.d = d.side;
      }
      break;
    }
    case 'sphere':
      if (r !== undefined) dims.r = r;
      else if (d.side !== undefined) dims.r = d.side / 2;
      break;
    case 'cylinder':
    case 'cone':
    case 'capsule':
    case 'pyramid' as SceneShape:
      if (r !== undefined) dims.r = r;
      else if (d.w !== undefined) dims.r = d.w / 2;
      if (d.h !== undefined) dims.h = d.h;
      else if (d.depth !== undefined) dims.h = d.depth;
      if (d.n !== undefined && (shape as string) === 'pyramid') dims.n = d.n;
      break;
    case 'torus':
      if (d.R !== undefined) dims.R = d.R;
      else if (r !== undefined) dims.R = r;
      if (d.tube !== undefined) dims.r = d.tube;
      else if (d.depth !== undefined) dims.r = d.depth / 2;
      break;
    case 'plane':
      if (d.w !== undefined) dims.w = d.w;
      if (d.d !== undefined) dims.d = d.d;
      if (d.side !== undefined) dims.w = dims.d = d.side;
      break;
    case 'prism':
      if (d.n !== undefined) dims.n = d.n;
      if (r !== undefined) dims.r = r;
      else if (d.side !== undefined && d.n) dims.r = d.side / (2 * Math.sin(Math.PI / d.n));
      if (d.h !== undefined) dims.h = d.h;
      else if (d.depth !== undefined) dims.h = d.depth;
      break;
    case 'star':
      if (d.n !== undefined) dims.n = d.n;
      if (d.R !== undefined) dims.r = d.R;
      else if (r !== undefined) dims.r = r;
      if (d.ri !== undefined) dims.ri = d.ri;
      if (d.depth !== undefined) dims.h = d.depth;
      else if (d.h !== undefined) dims.h = d.h;
      break;
    case 'ring':
      if (d.R !== undefined) dims.R = d.R;
      else if (r !== undefined) dims.R = r;
      if (d.ri !== undefined) dims.r = d.ri;
      if (d.depth !== undefined) dims.h = d.depth;
      else if (d.h !== undefined) dims.h = d.h;
      break;
    case 'polygon':
      // an outline is extruded: "0.02 thick", "2 tall" or — for a section about to be laid down as a beam — "3 long"
      if (d.depth !== undefined) dims.h = d.depth;
      else if (d.h !== undefined) dims.h = d.h;
      else if (d.long !== undefined) dims.h = d.long;
      break;
    case 'airfoil':
      if (d.chord !== undefined) dims.c = d.chord;
      else if (d.w !== undefined) dims.c = d.w;
      if (d.span !== undefined) dims.h = d.span;
      else if (d.d !== undefined) dims.h = d.d;
      break;
  }
  return { dims, notes };
}

const PLURAL_NOUNS = '(?:cubes|boxes|spheres|balls|cylinders|cones|tori|stars|rings|prisms|blocks|bricks|columns|pillars|discs|disks|capsules|posts|rods|orbs|tiles|crates)';

/**
 * The shape a creation is about: the earliest shape noun in the clause that
 * is not a reference to a part already there ("a cone left of THE BOX" is a
 * cone). If every noun is introduced as a reference, the earliest.
 */
function nounIn(work: string): { index: number; text: string; shape: SceneShape; opts?: { cube?: true; slab?: true } } | null {
  const hits: { index: number; text: string; shape: SceneShape; opts?: { cube?: true; slab?: true }; definite: boolean }[] = [];
  for (const [re, shape, opts] of SHAPE_NOUNS) {
    const g = new RegExp(re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(work))) {
      const before = work.slice(0, m.index).trimEnd().split(/\s+/);
      // walk back over qualifiers to the word that introduces the phrase
      let k = before.length - 1;
      while (k >= 0 && (before[k] in COLORS || SHADES.test(before[k]) || before[k] in FINISH_Q || before[k] in SIZE_Q || before[k] in ORDINALS || /^(?:last|other|same)$/.test(before[k]))) k--;
      const definite = k >= 0 && /^(?:the|this|that|its|their|those|these)$/.test(before[k]);
      hits.push({ index: m.index, text: m[0], shape, ...(opts ? { opts } : {}), definite });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.index - b.index);
  const pick = hits.find((h) => !h.definite) ?? (CREATE_VERB.test(work) ? hits[0] : null);
  return pick ? { index: pick.index, text: pick.text, shape: pick.shape, ...(pick.opts ? { opts: pick.opts } : {}) } : null;
}

// said in the conversation, a request comes with its courtesies — "could you build me a ring of 9 balls" — and
// the count after them is still the count
const CREATE_VERB = /^\s*(?:(?:please|now|also|and|then|ok|okay|just|so|hey)\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?(?:(?:add|make|create|build|draw|put|place|set|stack|pile|insert|drop|lay|stand|show)(?:\s+(?:me|us)(?![a-z]))?|give (?:me|us)|i want|i need|i'd like|let'?s have|let'?s add|there is|there's|we need)(?![a-z])\s*/i;
/** "a hexagonal prism": sides from the adjective */
const POLY_ADJ: Record<string, number> = { triangular: 3, square: 4, pentagonal: 5, hexagonal: 6, heptagonal: 7, octagonal: 8 };

function readCreate(c: Clause, st: Ctx): string | null {
  const before = st.s;
  const t = c.text;
  // what shape, and how many
  // what it is made of first: a shape given by an equation consumes the rest of the clause
  const matter = readMatter(c);
  // …and its name: a shape given by an equation reads to the end of the clause, and "called pulley" after
  // "r = … for y from 0 to 0.04" was swallowed with it — the part came out named "revolved shape"
  // the name ends where the clause, a comma, a "with/at/on/and" or the equation itself ("x = …", "r(y) = …") begins
  const NAMED = /\b(?:called|named)\s+["“]?([a-z][\w ]{0,30}?)["”]?(?=$|\s*[,;]|\s+(?:with|at|on|and)\b|\s+[a-z]\w*\s*(?:\(\s*[a-z]\s*\))?\s*=)/i;
  const earlyName = c.take(NAMED)?.[1];
  const param = readParametric(c, st.unit);
  if (param && 'problem' in param) return param.problem;
  // an outline given by its corners is still called something, and is extruded by a length read below
  if (param?.shape === 'polygon') c.take(/\b(?:polygon|outline|section|profile|plate|extrusion)\b/i);
  let shape: SceneShape | null = param ? param.shape : null;
  let opts: { cube?: true; slab?: true } | undefined;
  let sidesFromNoun: number | undefined;
  // "a ring of 8 spheres" is spheres, arranged: the arrangement is read before the noun
  const arrangedAs = param
    ? null
    : c.take(new RegExp(`\\b(?:a|an)?\\s*(row|line|column|stack|tower|pile|ring|circle|grid)\\s+of(?=\\s+(?:${NUM_RE}|several|a couple of|some)\\b|\\s+(?:[a-z]+\\s+){0,2}${PLURAL_NOUNS}\\b)`, 'i'))?.[1]?.toLowerCase() ?? null;
  if (!shape) {
    const found = nounIn(c.work);
    if (found) {
      c.work = c.work.slice(0, found.index) + ' '.repeat(found.text.length) + c.work.slice(found.index + found.text.length);
      shape = found.shape;
      opts = found.opts;
      const w = found.text.toLowerCase().replace(/s$/, '');
      if (w in POLY_SIDES) sidesFromNoun = POLY_SIDES[w];
      const ng = /(\d+|three|four|five|six|seven|eight|nine|ten|twelve)-?(?:gon|sided)/.exec(w);
      if (ng) sidesFromNoun = numOf(ng[1]) ?? undefined;
    }
  }
  if (!shape) return null;
  if ((shape as string) === 'pyramid') return 'Pyramids are not one of this scene’s shapes yet — try a cone, or a 4-sided prism.';
  const stackVerb = /^\s*(?:(?:please|now|also|and|then|just)\s+)*(?:stack|pile)(?![a-z])/i.test(c.work);
  c.take(CREATE_VERB);
  const arrangement = arrangedAs ?? (stackVerb ? 'stack' : null);
  const countM = c.take(new RegExp(`^\\s*(?:(?:please|now|also|and)\\s+)*(?:${NUM_RE}|a couple of|several|another|a|an)(?![a-z0-9])`, 'i'));
  let count = 1;
  if (countM) {
    const w = countM[0].trim().toLowerCase().replace(/^(?:(?:please|now|also|and)\s+)+/, '');
    count = w === 'a couple of' ? 2 : w === 'several' ? 3 : w === 'another' || w === 'a' || w === 'an' ? 1 : Math.max(1, Math.round(numOf(countM[1] ?? '1') ?? 1));
    if (w === 'several') c.notes.push('“several” read as 3');
  } else {
    const inline = new RegExp(`\\b${NUM_RE}\\s+(?:[a-z]+\\s+){0,3}?(?:cubes|boxes|spheres|balls|cylinders|cones|tori|stars|rings|prisms|pyramids|blocks|bricks|columns|pillars|discs|disks|capsules)\\b`, 'i').exec(t);
    if (inline) {
      count = Math.max(1, Math.round(numOf(inline[1]) ?? 1));
      // the count was read, so it is not left over as a word nobody understood
      const at = inline.index;
      const len = inline[1].length;
      if (c.work.slice(at, at + len) === t.slice(at, at + len)) c.work = c.work.slice(0, at) + ' '.repeat(len) + c.work.slice(at + len);
    }
  }
  if (count > MAX_NODES) return `A scene holds at most ${MAX_NODES} parts.`;
  const name = earlyName ?? c.take(NAMED)?.[1];
  const look = readLook(c);
  if (shape === 'prism') {
    const adj = c.take(/\b(triangular|square|pentagonal|hexagonal|heptagonal|octagonal)\b/i);
    if (adj && sidesFromNoun === undefined) sidesFromNoun = POLY_ADJ[adj[1].toLowerCase()];
  }
  // "NACA 2412": camber 2% at 40% of the chord, 12% thick — the four digits are the section
  let naca: Record<string, number> | null = null;
  if (shape === 'airfoil') {
    const nm = c.take(/\bnaca[\s-]*(\d)(\d)(\d{2})\b/i);
    if (nm) naca = { m: Number(nm[1]), p: Number(nm[2]), t: Number(nm[3]) };
    else if (c.take(/\bsymmetric(?:al)?\b/i)) naca = { m: 0, p: 0 };
    if (naca && naca.m > 0 && naca.p === 0) return `NACA ${nm![1]}${nm![2]}${nm![3]} is not a section: a cambered one needs where its camber peaks (the second digit).`;
  }
  // centre to centre ("spaced 0.25 apart", "0.25 m apart"), or edge to edge ("with a gap of 0.01")
  const spacing =
    c.take(new RegExp(`\\b(?:spaced|every|apart by|spacing(?: of)?)\\s*${NUM_RE}\\s*${UNIT_RE}?(?:\\s+apart)?`, 'i')) ??
    c.take(new RegExp(`${NUM_RE}\\s*${UNIT_RE}?\\s+apart\\b`, 'i'));
  const gapM = spacing ? null : c.take(new RegExp(`\\b(?:with\\s+)?(?:a\\s+)?(?:gap|space|clearance)\\s+(?:of\\s+)?${NUM_RE}\\s*${UNIT_RE}?(?:\\s+between\\s+(?:them|each(?:\\s+one)?))?`, 'i'));
  const along = c.take(/\b(?:along|in)\s+(?:the\s+)?([xyz])(?:[\s-]?(?:axis|direction))?\b/i)?.[1]?.toLowerCase();
  const ringR = arrangement === 'ring' || arrangement === 'circle' ? c.take(new RegExp(`\\b(?:with\\s+(?:a\\s+)?)?radius\\s*(?:of)?\\s*${NUM_RE}\\s*${UNIT_RE}?`, 'i')) : null;
  // "a ring of 9 balls … around the inner race", "… around the origin": where the ring is centred
  let ringAt: [number, number] | null = null;
  const aroundM = arrangement === 'ring' || arrangement === 'circle' ? /\baround\b/i.exec(c.work) : null;
  if (aroundM) {
    const after = aroundM.index + aroundM[0].length;
    const lead = c.work.slice(after).search(/\S|$/);
    const rest = c.work.slice(after + lead);
    const origin = /^(?:the\s+)?(?:origin|centre|center|middle)\b/i.exec(rest);
    let len = 0;
    if (origin) {
      ringAt = [0, 0];
      len = origin[0].length;
    } else {
      const words = refAt(rest, st.s);
      if (!words) return 'Around what? Name a part already there, or say “around the origin”.';
      const ref = resolve(words.phrase, st.s, st.ctx, st.recent);
      if (!ref) return missing(st, words.phrase);
      const at = st.s.nodes.find((n) => n.id === ref.ids[0])!;
      ringAt = [at.pos[0], at.pos[2]];
      len = words.len;
    }
    c.work = c.work.slice(0, aroundM.index) + ' '.repeat(after + lead + len - aroundM.index) + c.work.slice(after + lead + len);
  }
  // sizes before places: in "a sphere of radius 0.5 on top of it" the 0.5 is the sphere's
  const d = param && param.shape !== 'polygon' ? ({} as DimReading) : readDims(c, st.unit);
  const place = readPlacement(c, st.s, st.ctx, st.recent, st.unit);
  if (place && 'problem' in place) return place.problem;
  if (sidesFromNoun !== undefined && d.n === undefined) d.n = sidesFromNoun;
  const { dims } = param
    ? { dims: param.shape === 'polygon' ? { ...param.dims, ...dimArgs('polygon', d, false).dims } : param.dims }
    : dimArgs(shape, d, !!opts?.cube);
  if (naca) Object.assign(dims, naca);
  const args: SceneOp['args'] = { shape };
  if (Object.keys(dims).length) args.dims = writePairs(dims);
  if (param) args.exprs = Object.entries(param.exprs).map(([k, v]) => `${k}=${v}`).join(';');
  if (name) args.name = name.trim();
  const lookPairs: Record<string, string | number> = {};
  if (look.color) lookPairs.color = look.color;
  if (look.mat) lookPairs.mat = look.mat;
  if (look.opacity !== undefined) lookPairs.opacity = look.opacity;
  if (Object.keys(lookPairs).length) args.look = writePairs(lookPairs);
  if (place) {
    if (place.at) {
      const [x, y, z] = place.at;
      args.at = `${x ?? 0},${y ?? 0},${z ?? 0}`;
      if (y === null) args.free = 'y';
    } else if (place.target) {
      args.place = writePairs({ on: place.target, side: place.side ?? 'top', gap: place.gap ?? 0 });
    }
    if (place.note) c.notes.push(place.note);
  } else if (param && param.shape !== 'polygon') {
    // a shape given by its equation stands at its own coordinates, so a point on it reads true
    args.at = `0,${shape === 'revolve' ? (param.dims.y0 + param.dims.y1) / 2 : 0},0`;
    c.notes.push('placed at its own coordinates rather than stood on the floor, so its points read true');
  }
  const why = run(st, 'add', args);
  if (why) return why;
  const made = lastAdded(before, st.s);
  let first = st.s.nodes.find((n) => n.id === made[0])!;
  if (matter) {
    const w0 = run(st, 'matter', { id: first.id, ...(matter.name ? { name: matter.name } : {}), ...(matter.density !== undefined ? { density: matter.density } : {}) });
    if (w0) return w0;
    first = st.s.nodes.find((n) => n.id === made[0])!;
    if (matter.density === undefined) c.notes.push(`${matter.name}: a nominal density of ${NOMINAL_DENSITY[matter.name!]} kg/m³ — a typical value; give a measured one to replace it`);
  }
  let beside = false;
  if (!place && !param && !ringAt && before.nodes.length) {
    // nowhere given, and the scene is not empty: beside what is there, on the floor, rather than inside it
    const sb = sceneBox(before);
    const fb = worldBox(first);
    if (sb && fb) {
      const x = sb.max[0] + 0.5 * UNIT_M[st.unit] + (first.pos[0] - fb.min[0]);
      const w1 = run(st, 'moveTo', { id: first.id, x, z: (sb.min[2] + sb.max[2]) / 2 });
      if (w1) return w1;
      first = st.s.nodes.find((n) => n.id === made[0])!;
      beside = true;
      c.notes.push('placed beside what is already there (no place given)');
    }
  }
  // more than one: an arrangement
  if (count > 1) {
    const b = worldBox(first)!;
    const ext: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const gap = gapM ? (numOf(gapM[1]) ?? 0) * unitOf(gapM[2], st.unit) : 0.25 * UNIT_M[st.unit];
    // a gap given is edge to edge, so the step is the part's own extent plus it
    const along_ = along === 'z' ? 2 : 0;
    const step = spacing ? (numOf(spacing[1]) ?? 1) * unitOf(spacing[2], st.unit) : gapM ? ext[along_] + gap : null;
    if (arrangement === 'ring' || arrangement === 'circle') {
      const R = ringR ? (numOf(ringR[1]) ?? 2) * unitOf(ringR[2], st.unit) : Math.max(1, (count * (ext[0] + gap)) / (2 * Math.PI));
      if (!ringR) c.notes.push(`ring radius ${lengthWord(R, st.unit)}, so they do not touch (none given)`);
      // the first goes on the circle at angle 0 about where it was put — or about the part or
      // point it was asked to go around — or, put beside the scene, the whole ring does, its
      // near edge where the first part stood
      const cx = ringAt ? ringAt[0] : first.pos[0] + (beside ? R : 0);
      const cz = ringAt ? ringAt[1] : first.pos[2];
      const w1 = run(st, 'moveTo', { id: first.id, x: cx + R, z: cz });
      if (w1) return w1;
      const w2 = run(st, 'copy', { id: first.id, count: count - 1, ring: R, cx, cz });
      if (w2) return w2;
    } else if (arrangement === 'stack' || arrangement === 'tower' || arrangement === 'pile' || arrangement === 'column' || along === 'y') {
      const w2 = run(st, 'copy', { id: first.id, count: count - 1, dy: ext[1], stack: 'y' });
      if (w2) return w2;
    } else if (arrangement === 'grid') {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const sx = step ?? ext[0] + gap;
      const sz = step ?? ext[2] + gap;
      if (!step) c.notes.push(`${cols} by ${rows}, ${lengthWord(sx, st.unit)} apart across and ${lengthWord(sz, st.unit)} deep, centre to centre (no spacing given)`);
      if (cols > 1) {
        const w2 = run(st, 'copy', { id: first.id, count: cols - 1, dx: sx });
        if (w2) return w2;
      }
      const row = lastAdded(before, st.s);
      for (let r = 1; r < rows; r++)
        for (let j = 0; j < cols && r * cols + j < count; j++) {
          const w3 = run(st, 'copy', { id: row[j], count: 1, dz: r * sz });
          if (w3) return w3;
        }
    } else {
      const ax = along === 'z' ? 'dz' : 'dx';
      const extent = along === 'z' ? ext[2] : ext[0];
      const dxv = step ?? extent + gap;
      if (!step) c.notes.push(`spaced ${lengthWord(dxv, st.unit)} apart, centre to centre (no spacing given)`);
      const w2 = run(st, 'copy', { id: first.id, count: count - 1, [ax]: dxv });
      if (w2) return w2;
    }
    // A ROW OR A GRID PUT ON TOP OF SOMETHING IS CENTRED ON IT: "ten fins on top of the base"
    // stand across the base, not from its middle outward
    const flatLayout = arrangement !== 'ring' && arrangement !== 'circle' && arrangement !== 'stack' && arrangement !== 'tower' && arrangement !== 'pile' && arrangement !== 'column' && along !== 'y';
    const sup = place?.target && place.target !== 'ground' && (place.side ?? 'top') === 'top' ? st.s.nodes.find((n) => n.id === place.target) : null;
    if (flatLayout && sup) {
      const made = lastAdded(before, st.s).map((id) => st.s.nodes.find((n) => n.id === id)!);
      const mid = (v: number[]) => (Math.min(...v) + Math.max(...v)) / 2;
      const dx = sup.pos[0] - mid(made.map((n) => n.pos[0]));
      const dz = sup.pos[2] - mid(made.map((n) => n.pos[2]));
      if (Math.abs(dx) > 1e-12 || Math.abs(dz) > 1e-12) {
        for (const n of made) {
          const w4 = run(st, 'moveTo', { id: n.id, x: n.pos[0] + dx, z: n.pos[2] + dz });
          if (w4) return w4;
        }
        c.notes.push(`centred on ${sup.name}`);
      }
    }
  }
  st.recent = lastAdded(before, st.s);
  st.ctx = { ...st.ctx, here: st.recent[st.recent.length - 1] ?? st.ctx.here };
  const sizeWords = Object.keys(dims).length ? '' : ' (default size)';
  c.notes.push(...(first.assumed?.length && Object.keys(dims).length ? [`${first.assumed.map((k) => DIMS[first.shape].find((x) => x.key === k)?.label ?? k).join(', ')}: default`] : []));
  const lookSaid = look.said.length ? `${look.said.join(' ')} ` : '';
  const word = opts?.cube ? 'cube' : SHAPE_WORD[first.shape];
  const named = naca ? `NACA ${naca.m}${naca.p}${String(naca.t ?? 12).padStart(2, '0')} ${word}` : word;
  const phrase = `${lookSaid}${count > 1 ? plural(named) : named}`;
  const what = param ? param.said : `${count > 1 ? `${count} ` : /^[aeiou]/i.test(phrase) ? 'an ' : 'a '}${phrase}`;
  const arranged = count > 1 && arrangement ? ` in a ${arrangement === 'circle' ? 'ring' : arrangement === 'tower' || arrangement === 'pile' || arrangement === 'column' ? 'stack' : arrangement === 'line' ? 'row' : arrangement}` : '';
  return `✓add ${what}${arranged}${sizeWords}${place ? ` ${place.said}` : ''}`;
}

/** A verb at the start of the clause and the part it names — read, not yet consumed. */
interface VerbRef {
  verb: string;
  words: RefWords;
  /** null when the words name nothing in the scene */
  ref: Ref | null;
  /** the clause's unread text after the reference */
  after: string;
  /** consume the verb and the reference */
  take: () => void;
}

const LEAD = '^\\s*(?:(?:please|now|and|also|then|ok|okay|just)\\s+)*';

function verbRef(c: Clause, verbs: string, st: Ctx): VerbRef | null {
  const m = new RegExp(`${LEAD}(${verbs})(?![a-z])`, 'i').exec(c.work);
  if (!m) return null;
  const words = refAt(c.work.slice(m[0].length), st.s);
  if (!words) return null;
  const end = m[0].length + words.len;
  const ref = resolve(words.phrase, st.s, st.ctx, st.recent);
  return {
    verb: m[1].toLowerCase(),
    words,
    ref,
    after: c.work.slice(end),
    take: () => {
      c.work = ' '.repeat(end) + c.work.slice(end);
      if (ref?.note) c.notes.push(ref.note);
    },
  };
}

const missing = (st: Ctx, phrase: string) =>
  st.s.nodes.length ? `There is nothing called “${phrase.replace(/^(?:the|all the|all|every|each)\s+/, '')}” in the scene.` : 'The scene is empty — describe something to build first.';

const DIM_WORD = '(outer radius|inner radius|tube radius|ring radius|radius|diameter|width|height|depth|length|thickness|sides|points|chord|span)';

/** Verbs that only ever change what is there — a clause led by one never makes something new. */
const EDIT_ONLY = new RegExp(`${LEAD}(?:move|shift|slide|push|pull|nudge|lift|raise|lower|rotate|turn|spin|tilt|twist|roll|flip|scale|resize|grow|shrink|enlarge|double|halve|triple|colou?r|paint|tint|dye|delete|remove|erase|duplicate|copy|clone|repeat|rename|call|name|change)(?![a-z])`, 'i');

function readEdit(c: Clause, st: Ctx): string | null {
  const t = c.text;
  const touch = (ids: string[]) => {
    st.recent = ids;
    st.ctx = { ...st.ctx, here: ids[ids.length - 1] ?? st.ctx.here };
  };
  // clear
  if (/^(?:(?:please|now)\s+)?(?:clear|reset|empty|wipe)(?:\s+(?:the|this))?(?:\s+(?:scene|everything|all))?$|^start (?:over|again)$|^(?:delete|remove|erase) (?:everything|all(?: parts)?)$/i.test(t)) {
    c.work = '';
    const why = run(st, 'clear', {});
    return why ?? '✓clear the scene';
  }
  // display unit
  const unitM = /^(?:use|show|measure|work|switch)(?:\s+(?:lengths|everything|it))?(?:\s+to|\s+in)?\s+(cm|mm|m|meters|metres|inches|inch|in|feet|foot|ft)$/i.exec(t);
  if (unitM) {
    c.work = '';
    const map: Record<string, string> = { cm: 'cm', mm: 'mm', m: 'm', meters: 'm', metres: 'm', inches: 'in', inch: 'in', in: 'in', feet: 'ft', foot: 'ft', ft: 'ft' };
    const why = run(st, 'unit', { unit: map[unitM[1].toLowerCase()] });
    return why ?? `✓show lengths in ${map[unitM[1].toLowerCase()]}`;
  }
  // remove
  let v = verbRef(c, 'delete|remove|erase|get rid of|take away|take out', st);
  if (v) {
    if (!v.ref) return missing(st, v.words.phrase);
    v.take();
    for (const id of v.ref.ids) {
      const why = run(st, 'remove', { id });
      if (why) return why;
    }
    st.recent = [];
    return `✓remove ${v.ref.said}`;
  }
  // rename
  v = verbRef(c, 'rename|call|name', st);
  if (v) {
    const nm = /^\s*(?:to\s+|as\s+)?["“']?([a-z][\w ]{0,30}?)["”']?\s*$/i.exec(v.after);
    if (nm) {
      if (!v.ref) return missing(st, v.words.phrase);
      v.take();
      c.work = ' '.repeat(c.work.length);
      const why = run(st, 'rename', { id: v.ref.ids[0], name: nm[1] });
      if (why) return why;
      touch(v.ref.ids);
      return `✓call ${v.ref.said} “${nm[1]}”`;
    }
  }
  // copies: "make 4 copies of the box along z spaced 2", "copy it 3 times to the right"
  let copyRef: Ref | null = null;
  let copies = 1;
  const many = new RegExp(`${LEAD}(?:make|create|add)\\s+${NUM_RE}\\s+(?:more\\s+)?(?:copies|duplicates|clones)\\s+of(?![a-z])`, 'i').exec(c.work);
  if (many) {
    const words = refAt(c.work.slice(many[0].length), st.s);
    if (!words) return 'Copies of what? Name the part: “4 copies of the box”.';
    const ref = resolve(words.phrase, st.s, st.ctx, st.recent);
    if (!ref) return missing(st, words.phrase);
    const end = many[0].length + words.len;
    c.work = ' '.repeat(end) + c.work.slice(end);
    if (ref.note) c.notes.push(ref.note);
    copyRef = ref;
    copies = Math.max(1, Math.round(numOf(many[1]) ?? 1));
  } else {
    v = verbRef(c, 'duplicate|copy|clone|repeat', st);
    if (v) {
      if (!v.ref) return missing(st, v.words.phrase);
      v.take();
      const times = c.take(new RegExp(`^\\s*(?:${NUM_RE}\\s+(?:more\\s+)?times?|twice|thrice)(?![a-z])`, 'i'));
      if (times) copies = /twice/i.test(times[0]) ? 2 : /thrice/i.test(times[0]) ? 3 : Math.max(1, Math.round(numOf(times[1]) ?? 1));
      copyRef = v.ref;
    }
  }
  if (copyRef) {
    const id = copyRef.ids[0];
    const node = st.s.nodes.find((n) => n.id === id)!;
    // AROUND A CIRCLE: "copy it 6 times around a circle of radius 0.4", "… around the origin",
    // "… around the crankcase" — each copy turned to face the same way about the centre
    const around = c.take(/\baround\b/i);
    if (around) {
      let cx: number | null = null;
      let cz: number | null = null;
      let R: number | null = null;
      const withR = c.take(new RegExp(`^\\s*(?:a\\s+circle\\s+)?(?:of|with)\\s+(?:a\\s+)?radius\\s*(?:of)?\\s*${NUM_RE}\\s*${UNIT_RE}?`, 'i'));
      const origin = !withR && c.take(/^\s*(?:a\s+circle\s+)?(?:about\s+)?(?:the\s+)?(?:origin|centre|center|middle|vertical(?:\s+axis)?|y[\s-]axis)\b/i);
      if (withR) R = (numOf(withR[1]) ?? NaN) * unitOf(withR[2], st.unit);
      else if (origin) {
        cx = 0;
        cz = 0;
      } else {
        const rest = c.work.slice(c.work.search(/\S|$/));
        const words = refAt(rest, st.s);
        if (words) {
          const ref = resolve(words.phrase, st.s, st.ctx, st.recent);
          if (!ref) return missing(st, words.phrase);
          const at = st.s.nodes.find((n) => n.id === ref.ids[0])!;
          cx = at.pos[0];
          cz = at.pos[2];
          const start = c.work.search(/\S/);
          c.work = c.work.slice(0, start) + ' '.repeat(words.len) + c.work.slice(start + words.len);
        } else {
          c.take(/^\s*a\s+circle\b/i);
          cx = 0;
          cz = 0;
        }
      }
      if (R === null) R = Math.hypot(node.pos[0] - cx!, node.pos[2] - cz!);
      if (!(R > 1e-9)) return 'It stands at the centre of that circle — move it out first, or give the circle’s radius.';
      const args: SceneOp['args'] = { id, count: copies, ring: R, ...(cx !== null ? { cx, cz: cz! } : {}) };
      const before = st.s;
      const why = run(st, 'copy', args);
      if (why) return why;
      touch(lastAdded(before, st.s));
      return `✓copy ${copyRef.said} ×${copies} around a circle of radius ${lengthWord(R, st.unit)}`;
    }
    const b = worldBox(node)!;
    const ext: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    // an edge-to-edge gap, read before the directions so its number is not taken for a distance
    const gapM = c.take(new RegExp(`\\b(?:with\\s+)?(?:a\\s+)?(?:gap|space|clearance)\\s+(?:of\\s+)?${NUM_RE}\\s*${UNIT_RE}?(?:\\s+between\\s+(?:them|each(?:\\s+one)?))?`, 'i'));
    const gapGiven = gapM ? (numOf(gapM[1]) ?? 0) * unitOf(gapM[2], st.unit) : null;
    const dir = readDirections(c, st.unit);
    const spacing = c.take(new RegExp(`\\b(?:spaced|every|apart by|spacing(?: of)?)\\s*${NUM_RE}\\s*${UNIT_RE}?(?:\\s+apart)?`, 'i'));
    const along = c.take(/\b(?:along|in)\s+(?:the\s+)?([xyz])(?:[\s-]?(?:axis|direction))?\b/i)?.[1]?.toLowerCase();
    const gapStep = (k: number) => (spacing ? (numOf(spacing[1]) ?? 1) * unitOf(spacing[2], st.unit) : ext[k] + (gapGiven ?? 0.25 * UNIT_M[st.unit]));
    const before = st.s;
    let args: SceneOp['args'];
    if (dir.moved) {
      args = { id, count: copies, dx: dir.d[0] || 0, dy: dir.d[1] || 0, dz: dir.d[2] || 0 };
      // a direction without a distance: step by the part's own size plus a little
      for (const k of dir.unsized) args[['dx', 'dy', 'dz'][k]] = gapStep(k) * dir.sign[k];
      if (dir.unsized.length && !spacing && gapGiven === null) c.notes.push(`each copy one size further on, with a ${lengthWord(0.25 * UNIT_M[st.unit], st.unit)} gap`);
      if (dir.d[1] !== 0 && !dir.d[0] && !dir.d[2] && dir.sign[1] > 0) args.stack = 'y';
    } else {
      const k = along === 'y' ? 1 : along === 'z' ? 2 : 0;
      if (!spacing && gapGiven === null) c.notes.push(`copies placed along ${['x', 'y', 'z'][k]}, one size apart with a ${lengthWord(0.25 * UNIT_M[st.unit], st.unit)} gap`);
      args = { id, count: copies, [['dx', 'dy', 'dz'][k]]: gapStep(k) };
      if (k === 1) args.stack = 'y';
    }
    const why = run(st, 'copy', args);
    if (why) return why;
    touch(lastAdded(before, st.s));
    return `✓copy ${copyRef.said} ×${copies}`;
  }
  // stack existing parts one on another: "stack the boxes", "stack them"
  v = verbRef(c, 'stack|pile', st);
  if (v && v.ref && v.ref.ids.length > 1 && !readPlacement(new Clause(v.after), st.s, st.ctx, st.recent, st.unit)) {
    v.take();
    const ids = v.ref.ids;
    for (let k = 1; k < ids.length; k++) {
      const why = run(st, 'place', { id: ids[k], target: ids[k - 1], side: 'top', gap: 0 });
      if (why) return why;
    }
    touch(ids);
    return `✓stack ${v.ref.said}, each on the one before`;
  }
  // place an existing part relative to another, or at a point
  v = verbRef(c, 'put|place|set|stack|pile|sit|rest|move|bring|drop|lay|stand', st);
  if (v && readPlacement(new Clause(v.after), st.s, st.ctx, st.recent, st.unit)) {
    if (!v.ref) {
      // "put sphere on the box" with no sphere: a request for one, which the creation reader takes
      if (v.words.bare && v.verb !== 'move') return null;
      return missing(st, v.words.phrase);
    }
    v.take();
    const place = readPlacement(c, st.s, st.ctx, st.recent, st.unit)!;
    if ('problem' in place) return place.problem;
    const ids = v.ref.ids.filter((id) => id !== place.target);
    if (!ids.length) return 'A part cannot be placed relative to itself.';
    for (const id of ids) {
      let why: string | null;
      if (place.at) {
        const [x, y, z] = place.at;
        why = run(st, 'moveTo', { id, ...(x !== null ? { x } : {}), ...(y !== null ? { y } : {}), ...(z !== null ? { z } : {}) });
      } else why = run(st, 'place', { id, target: place.target ?? 'ground', side: place.side ?? 'top', gap: place.gap ?? 0 });
      if (why) return why;
    }
    if (place.note) c.notes.push(place.note);
    touch(ids);
    return `✓put ${v.ref.said} ${place.said}`;
  }
  // set the X of Y to N: "set the radius of the sphere to 2", "change the height to 3 m"
  const setM = new RegExp(`${LEAD}(?:set|change|make)\\s+(?:the\\s+)?${DIM_WORD}(?:\\s+of)?(?![a-z])`, 'i').exec(c.work);
  if (setM) {
    const tail = c.work.slice(setM[0].length);
    const words = refAt(tail, st.s);
    const valM = new RegExp(`^\\s*(?:to|=|be|:|is)?\\s*${NUM_RE}\\s*${UNIT_RE}?`, 'i').exec(words ? tail.slice(words.len) : tail);
    if (valM) {
      const ref = resolve(words ? words.phrase : 'it', st.s, st.ctx, st.recent);
      if (!ref) return words ? missing(st, words.phrase) : 'The scene is empty — describe something to build first.';
      const end = setM[0].length + (words?.len ?? 0) + valM[0].length;
      c.work = ' '.repeat(end) + c.work.slice(end);
      if (ref.note) c.notes.push(ref.note);
      const key = setM[1].toLowerCase();
      const val = (numOf(valM[1]) ?? NaN) * (/sides|points/.test(key) ? 1 : unitOf(valM[2], st.unit));
      return applyNamedDim(st, ref, key, val, touch);
    }
  }
  // a possessive: "the box's height to 3", "make its radius 2", "set the cone's height to 1 m"
  {
    const lead = new RegExp(`${LEAD}(?:(?:set|change|make)\\s+)?`, 'i').exec(c.work)!;
    const words = refAt(c.work.slice(lead[0].length), st.s);
    if (words?.poss) {
      const tail = c.work.slice(lead[0].length + words.len);
      const dm = new RegExp(`^\\s*${DIM_WORD}\\s*(?:to|=|is|should be|be|:)?\\s*${NUM_RE}\\s*${UNIT_RE}?`, 'i').exec(tail);
      if (dm) {
        const ref = resolve(words.phrase, st.s, st.ctx, st.recent);
        if (!ref) return missing(st, words.phrase);
        const end = lead[0].length + words.len + dm[0].length;
        c.work = ' '.repeat(end) + c.work.slice(end);
        if (ref.note) c.notes.push(ref.note);
        const key = dm[1].toLowerCase();
        const val = (numOf(dm[2]) ?? NaN) * (/sides|points/.test(key) ? 1 : unitOf(dm[3], st.unit));
        return applyNamedDim(st, ref, key, val, touch);
      }
    }
  }
  // move
  v = verbRef(c, 'move|shift|slide|push|pull|nudge|bring|lift|raise|lower', st);
  if (v) {
    if (!v.ref) return missing(st, v.words.phrase);
    v.take();
    const ref = v.ref;
    const to = c.take(/\bto\s*\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+))?\s*\)?/i);
    if (to) {
      const k = unitOf(undefined, st.unit);
      const n3 = to[3] !== undefined;
      for (const id of ref.ids) {
        const why = run(st, 'moveTo', n3 ? { id, x: Number(to[1]) * k, y: Number(to[2]) * k, z: Number(to[3]) * k } : { id, x: Number(to[1]) * k, z: Number(to[2]) * k });
        if (why) return why;
      }
      touch(ref.ids);
      return `✓move ${ref.said} to (${[to[1], to[2], to[3]].filter((x) => x !== undefined).join(', ')})`;
    }
    const dir = readDirections(c, st.unit);
    if (!dir.moved) {
      if (v.verb === 'lift' || v.verb === 'raise' || v.verb === 'lower') {
        const amount = c.take(new RegExp(`(?:by\\s+)?${NUM_RE}\\s*${UNIT_RE}?`, 'i'));
        const dist = amount ? (numOf(amount[1]) ?? 1) * unitOf(amount[2], st.unit) : UNIT_M[st.unit];
        if (!amount) c.notes.push(`by 1 ${st.unit} (no distance given)`);
        dir.d[1] = v.verb === 'lower' ? -dist : dist;
        dir.said.push(`${v.verb === 'lower' ? 'down' : 'up'} ${lengthWord(dist, st.unit)}`);
        dir.moved = true;
      } else return 'Move it which way? Say left, right, up, down, forward or back — and how far.';
    }
    if (dir.unsized.length) c.notes.push(`by 1 ${st.unit} (no distance given)`);
    for (const id of ref.ids) {
      const why = run(st, 'move', { id, dx: dir.d[0], dy: dir.d[1], dz: dir.d[2] });
      if (why) return why;
    }
    touch(ref.ids);
    return `✓move ${ref.said} ${dir.said.join(' and ')}`;
  }
  // rotate — or "turn it red", which is not a rotation
  v = verbRef(c, 'rotate|turn|spin|tilt|twist|roll|flip', st);
  if (v) {
    if (!v.ref) return missing(st, v.words.phrase);
    const ref = v.ref;
    const turning = /\d|degrees?|\brad|quarter|half|around|about|upside|side\b|clockwise|axis|\b[xyz]\b|vertical|horizontal/i.test(v.after);
    v.take();
    if (v.verb === 'turn' && !turning) return readMakeIt(c, st, ref, touch);
    let axis: 'x' | 'y' | 'z' = v.verb === 'tilt' ? 'x' : v.verb === 'roll' ? 'z' : v.verb === 'flip' ? 'x' : 'y';
    let deg: number | null = null;
    if (c.take(/\bupside[\s-]down\b/i)) {
      axis = 'x';
      deg = 180;
    } else if (c.take(/\bon(?:to)? its side\b/i)) {
      axis = 'z';
      deg = 90;
    }
    const ax = c.take(/\b(?:around|about|on|along|in)\s+(?:the\s+)?(x|y|z|vertical|horizontal|up)(?:[\s-]?axis)?\b/i);
    if (ax) axis = ax[1].toLowerCase() === 'vertical' || ax[1].toLowerCase() === 'up' ? 'y' : ax[1].toLowerCase() === 'horizontal' ? 'x' : (ax[1].toLowerCase() as 'x' | 'y' | 'z');
    const ang = c.take(/(?:by\s+)?(-?\d+(?:\.\d+)?)\s*(deg(?:rees?)?|°|rad(?:ians?)?)?/i);
    if (ang) deg = Number(ang[1]) * (/rad/i.test(ang[2] ?? '') ? 180 / Math.PI : 1);
    if (c.take(/\ba quarter(?: turn)?\b/i)) deg = 90;
    if (c.take(/\b(?:half a turn|a half turn)\b/i)) deg = 180;
    if (deg === null && c.take(/\baround\b/i)) deg = 180;
    if (deg === null && v.verb === 'flip') deg = 180;
    if (c.take(/\bclockwise\b/i) && deg !== null && !/counter|anti/i.test(t)) deg = -Math.abs(deg);
    c.take(/\b(?:counter|anti)[\s-]?clockwise\b/i);
    if (deg === null) return 'Rotate it by how much? Give an angle, like “45 degrees”.';
    for (const id of ref.ids) {
      const why = run(st, 'rotate', { id, axis, deg });
      if (why) return why;
    }
    touch(ref.ids);
    return `✓rotate ${ref.said} ${Number(deg.toPrecision(6))}° about ${axis}`;
  }
  // scale
  v = verbRef(c, 'scale|resize|grow|shrink|enlarge|double|halve|triple', st);
  if (v) {
    if (!v.ref) return missing(st, v.words.phrase);
    v.take();
    const ref = v.ref;
    let f: number | null = v.verb === 'double' ? 2 : v.verb === 'halve' ? 0.5 : v.verb === 'triple' ? 3 : null;
    const by = c.take(/(?:by|to)?\s*(?:a factor of\s*)?(\d+(?:\.\d+)?)\s*(x|times|%)?/i);
    if (by) {
      const n = Number(by[1]);
      f = by[2] === '%' ? (/to\s/i.test(by[0]) ? n / 100 : v.verb === 'shrink' ? 1 - n / 100 : 1 + n / 100) : v.verb === 'shrink' && n > 1 ? 1 / n : n;
    }
    if (f === null) {
      f = v.verb === 'shrink' ? 0.8 : 1.25;
      c.notes.push(v.verb === 'shrink' ? 'by 20% (no amount given)' : 'by 25% (no amount given)');
    }
    const axisOnly = c.take(/\b(?:along|in)\s+(?:the\s+)?([xyz])\b|\b(vertically|horizontally|in height|in width|in depth)\b/i);
    const k = axisOnly ? (axisOnly[1] ? { x: 0, y: 1, z: 2 }[axisOnly[1].toLowerCase() as 'x'] : /vert|height/i.test(axisOnly[2]) ? 1 : /depth/i.test(axisOnly[2]) ? 2 : 0) : null;
    for (const id of ref.ids) {
      const why = run(st, 'scale', k === null ? { id, sx: f, sy: f, sz: f } : { id, sx: k === 0 ? f : 1, sy: k === 1 ? f : 1, sz: k === 2 ? f : 1 });
      if (why) return why;
    }
    touch(ref.ids);
    return `✓scale ${ref.said} ×${Number(f.toPrecision(4))}${k !== null ? ` along ${['x', 'y', 'z'][k]}` : ''}`;
  }
  // colour / paint
  v = verbRef(c, 'colou?r|paint|tint|dye', st);
  if (v) {
    if (!v.ref) return missing(st, v.words.phrase);
    v.take();
    const look = readLook(c);
    if (!look.color && !look.mat) return 'What colour?';
    for (const id of v.ref.ids) {
      const why = run(st, 'look', { id, ...(look.color ? { color: look.color } : {}), ...(look.mat ? { mat: look.mat } : {}) });
      if (why) return why;
    }
    touch(v.ref.ids);
    return `✓make ${v.ref.said} ${look.said.join(', ')}`;
  }
  // make IT …
  v = verbRef(c, 'make|turn|set|change|give', st);
  if (v) {
    // "make box" is asking for one; "make the box red" is about the one there
    if (v.words.bare && (v.verb === 'make' || v.verb === 'give')) return null;
    if (!v.ref) return v.words.bare ? null : missing(st, v.words.phrase);
    v.take();
    return readMakeIt(c, st, v.ref, touch);
  }
  return null;
}

function applyNamedDim(st: Ctx, ref: Ref, key: string, v: number, touch: (ids: string[]) => void): string {
  if (!Number.isFinite(v)) return 'That needs a number.';
  for (const id of ref.ids) {
    const n = st.s.nodes.find((x) => x.id === id)!;
    const has = (k: string) => DIMS[n.shape].some((d) => d.key === k);
    let dimKey: string | null = null;
    let val = v;
    if (key === 'radius') dimKey = has('r') ? 'r' : has('R') ? 'R' : null;
    else if (key === 'diameter') {
      dimKey = has('r') ? 'r' : has('R') ? 'R' : null;
      val = v / 2;
    } else if (key === 'outer radius' || key === 'ring radius') dimKey = has('R') ? 'R' : has('r') ? 'r' : null;
    else if (key === 'inner radius') dimKey = has('ri') ? 'ri' : n.shape === 'ring' ? 'r' : null;
    else if (key === 'tube radius') dimKey = n.shape === 'torus' || n.shape === 'tube' ? 'r' : null;
    else if (key === 'sides' || key === 'points') dimKey = has('n') ? 'n' : null;
    else if (key === 'thickness') dimKey = has('h') && n.shape !== 'airfoil' ? 'h' : null;
    else if (key === 'chord') dimKey = has('c') ? 'c' : null;
    else if (key === 'span') dimKey = n.shape === 'airfoil' ? 'h' : null;
    if (dimKey) {
      const why = run(st, 'set', { id, key: dimKey, value: val });
      if (why) return why;
      continue;
    }
    const axis = key === 'width' || key === 'length' ? 'x' : key === 'height' ? 'y' : key === 'depth' ? 'z' : null;
    if (!axis) return `A ${SHAPE_WORD[n.shape]} has no ${key}.`;
    const why = run(st, 'fit', { id, axis, size: val });
    if (why) return why;
  }
  touch(ref.ids);
  return `✓set the ${key} of ${ref.said} to ${Number(v.toPrecision(4))}`;
}

const SIZE_ADJ: Record<string, ['x' | 'y' | 'z', 1 | -1]> = {
  taller: ['y', 1], higher: ['y', 1], shorter: ['y', -1], lower: ['y', -1],
  wider: ['x', 1], narrower: ['x', -1], longer: ['x', 1],
  deeper: ['z', 1], shallower: ['z', -1],
  thicker: ['y', 1], thinner: ['y', -1],
};

function readMakeIt(c: Clause, st: Ctx, ref: Ref, touch: (ids: string[]) => void): string {
  const said: string[] = [];
  const matter = readMatter(c);
  if (matter) {
    for (const id of ref.ids) {
      const why = run(st, 'matter', { id, ...(matter.name ? { name: matter.name } : {}), ...(matter.density !== undefined ? { density: matter.density } : {}) });
      if (why) return why;
    }
    said.push(matter.said);
    if (matter.density === undefined) c.notes.push(`${matter.name}: a nominal density of ${NOMINAL_DENSITY[matter.name!]} kg/m³ — a typical value; give a measured one to replace it`);
  }
  const look = readLook(c);
  for (const id of ref.ids) {
    if (look.color || look.mat || look.opacity !== undefined) {
      const why = run(st, 'look', { id, ...(look.color ? { color: look.color } : {}), ...(look.mat ? { mat: look.mat } : {}), ...(look.opacity !== undefined ? { opacity: look.opacity } : {}) });
      if (why) return why;
    }
  }
  if (look.said.length) said.push(look.said.join(', '));
  // NUM UNIT tall/wide/deep — an absolute extent
  const abs = new RegExp(`${NUM_RE}\\s*${UNIT_RE}?\\s*(tall|high|wide|deep|long|thick)\\b`, 'gi');
  let m: RegExpExecArray | null;
  const w0 = c.work;
  while ((m = abs.exec(w0))) {
    const v = (numOf(m[1]) ?? NaN) * unitOf(m[2], st.unit);
    const word = m[3].toLowerCase();
    const key = word === 'tall' || word === 'high' ? 'height' : word === 'wide' || word === 'long' ? 'width' : word === 'deep' ? 'depth' : 'thickness';
    const r = applyNamedDim(st, ref, key, v, touch);
    if (!r.startsWith('✓')) return r;
    said.push(`${Number(v.toPrecision(4))} m ${word}`);
  }
  c.work = c.work.replace(abs, (s) => ' '.repeat(s.length));
  // twice / N times as big / half the size
  const times = c.take(new RegExp(`\\b(twice|three times|four times|${NUM_RE}\\s*(?:x|times))\\s+(?:as\\s+)?(big|large|tall|wide|long|deep|high)(?:\\s+as\\s+(?:it is|before))?`, 'i'));
  const half = c.take(/\bhalf\s+(?:the\s+size|as\s+(big|large|tall|wide|long|deep|high))\b/i);
  if (times || half) {
    const f = times ? (/twice/i.test(times[1]) ? 2 : /three/i.test(times[1]) ? 3 : /four/i.test(times[1]) ? 4 : numOf(times[2]) ?? 2) : 0.5;
    const word = (times ? times[3] : half![1] ?? 'big').toLowerCase();
    const k = word === 'tall' || word === 'high' ? 1 : word === 'wide' || word === 'long' ? 0 : word === 'deep' ? 2 : null;
    for (const id of ref.ids) {
      const why = run(st, 'scale', k === null ? { id, sx: f, sy: f, sz: f } : { id, sx: k === 0 ? f : 1, sy: k === 1 ? f : 1, sz: k === 2 ? f : 1 });
      if (why) return why;
    }
    said.push(`×${f}${k !== null ? ` in ${word === 'tall' || word === 'high' ? 'height' : word === 'deep' ? 'depth' : 'width'}` : ''}`);
  }
  // bigger / smaller (by N%)
  const bigger = c.take(/\b(bigger|larger|smaller)\b(?:\s+by\s+(\d+(?:\.\d+)?)\s*(%|x|times)?)?/i);
  if (bigger) {
    const up = /bigger|larger/i.test(bigger[1]);
    let f = up ? 1.25 : 0.8;
    if (bigger[2]) f = bigger[3] === '%' || !bigger[3] ? (up ? 1 + Number(bigger[2]) / 100 : 1 - Number(bigger[2]) / 100) : up ? Number(bigger[2]) : 1 / Number(bigger[2]);
    else c.notes.push(up ? 'by 25% (no amount given)' : 'by 20% (no amount given)');
    for (const id of ref.ids) {
      const why = run(st, 'scale', { id, sx: f, sy: f, sz: f });
      if (why) return why;
    }
    said.push(`×${Number(f.toPrecision(3))}`);
  }
  // taller / wider (by N | to N)
  const rel = new RegExp(`\\b(taller|higher|shorter|lower|wider|narrower|longer|deeper|shallower|thicker|thinner)\\b(?:\\s+(by|to)\\s+${NUM_RE}\\s*${UNIT_RE}?)?`, 'i');
  let rm: RegExpMatchArray | null;
  while ((rm = c.take(rel))) {
    const [axis, sign] = SIZE_ADJ[rm[1].toLowerCase()];
    const k = { x: 0, y: 1, z: 2 }[axis];
    for (const id of ref.ids) {
      const n = st.s.nodes.find((x) => x.id === id)!;
      const b = worldBox({ ...n, rot: [0, 0, 0] })!;
      const cur = b.max[k] - b.min[k];
      let size: number;
      if (rm[2] && rm[3]) {
        const v = (numOf(rm[3]) ?? NaN) * unitOf(rm[4], st.unit);
        size = rm[2].toLowerCase() === 'to' ? v : cur + sign * v;
      } else {
        size = cur * (sign > 0 ? 1.25 : 0.8);
        if (id === ref.ids[0]) c.notes.push(sign > 0 ? 'by 25% (no amount given)' : 'by 20% (no amount given)');
      }
      if (!(size > 0)) return 'That would make it nothing.';
      const why = run(st, 'fit', { id, axis, size });
      if (why) return why;
    }
    said.push(rm[0].trim());
  }
  // radius 2 / 6 sides / diameter 3
  const d = readDims(c, st.unit);
  const named: [string, number | undefined][] = [
    ['radius', d.r],
    ['diameter', d.diameter],
    ['outer radius', d.R],
    ['inner radius', d.ri],
    ['tube radius', d.tube],
    ['sides', d.n],
    ['width', d.w],
    ['height', d.h],
    ['depth', d.d],
    ['thickness', d.depth],
    ['chord', d.chord],
    ['span', d.span],
  ];
  if (d.side !== undefined) {
    // "make the cube side 2": every edge of a box, the two of a plane
    for (const id of ref.ids) {
      const n = st.s.nodes.find((x) => x.id === id)!;
      if (n.shape !== 'box' && n.shape !== 'plane') return `A ${SHAPE_WORD[n.shape]} has no side length — give its radius, height or width instead.`;
    }
    for (const key of ['width', 'depth', ...(ref.ids.every((id) => st.s.nodes.find((x) => x.id === id)!.shape === 'box') ? ['height'] : [])]) {
      const r = applyNamedDim(st, ref, key, d.side, touch);
      if (!r.startsWith('✓')) return r;
    }
    said.push(`sides ${lengthWord(d.side, st.unit)}`);
  }
  for (const [key, v] of named) {
    if (v === undefined) continue;
    const r = applyNamedDim(st, ref, key, v, touch);
    if (!r.startsWith('✓')) return r;
    said.push(`${key} ${Number(v.toPrecision(4))}`);
  }
  if (!said.length) return 'Make it what? A colour, a size (“2 m tall”, “wider by 1”, “twice as big”), or a finish (glass, metal, wireframe).';
  touch(ref.ids);
  return `✓make ${ref.said} ${said.join(', ')}`;
}

interface Directions {
  d: Vec3;
  moved: boolean;
  /** axes given a direction with no distance — the caller decides the step */
  unsized: number[];
  sign: Vec3;
  said: string[];
}

function readDirections(c: Clause, unit: LengthUnit): Directions {
  const out: Directions = { d: [0, 0, 0], moved: false, unsized: [], sign: [1, 1, 1], said: [] };
  const re = new RegExp(`(?:(?:by\\s+)?${NUM_RE}\\s*${UNIT_RE}?\\s+)?(?:to the\\s+|towards?\\s+the\\s+)?(left|right|up|upwards?|down|downwards?|forwards?|backwards?|back|toward(?:s)? (?:me|the camera|the viewer)|away(?: from me)?)(?:\\s+(?:by\\s+)?${NUM_RE}\\s*${UNIT_RE}?)?`, 'gi');
  let m: RegExpExecArray | null;
  const w0 = c.work;
  while ((m = re.exec(w0))) {
    const dirw = m[3].toLowerCase();
    const k = /left|right/.test(dirw) ? 0 : /up|down/.test(dirw) ? 1 : 2;
    const sign = /left|down|back|away/.test(dirw) ? -1 : 1;
    const amountRaw = m[1] ?? m[4];
    const unitRaw = m[1] ? m[2] : m[5];
    out.sign[k] = sign as 1 | -1;
    if (amountRaw !== undefined) {
      const v = (numOf(amountRaw) ?? 1) * unitOf(unitRaw, unit);
      out.d[k] += sign * v;
      out.said.push(`${Number((v / UNIT_M[unit]).toPrecision(4))} ${unit} ${dirw}`);
    } else {
      out.d[k] += sign * UNIT_M[unit];
      out.unsized.push(k);
      out.said.push(dirw);
    }
    out.moved = true;
  }
  c.work = c.work.replace(re, (s) => ' '.repeat(s.length));
  return out;
}

// ── the reader ──────────────────────────────────────────────────────

const VERBS = 'add|put|place|make|create|build|draw|insert|move|shift|slide|push|pull|nudge|lift|raise|lower|rotate|turn|spin|tilt|twist|roll|flip|scale|resize|grow|shrink|enlarge|double|halve|triple|colou?r|paint|tint|delete|remove|erase|duplicate|copy|clone|repeat|rename|call|name|set|change|stack|clear|reset';

/** Split a description into clauses: sentences, "then", and "and"/"," before a new verb or article. */
export function clausesOf(text: string): string[] {
  const t = text
    .replace(/[−–—]/g, '-')
    .replace(/×/g, ' x ')
    .replace(/°/g, ' degrees ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return [];
  const parts: string[] = [];
  for (const sentence of t.split(/(?<!\d)[.;!?]+(?!\d)\s*|\s*\b(?:and then|then|after that|next(?!\s+to\b))\b\s*/i)) {
    if (!sentence?.trim()) continue;
    // split before a verb or an article that starts something new — but not inside an equation
    const pieces = sentence.split(new RegExp(`\\s*(?:,\\s*(?:and\\s+)?|\\s+and\\s+)(?=(?:${VERBS}|a|an|another|two|three|four|five|six|seven|eight|nine|ten|\\d+\\s+(?:more\\s+)?(?:cubes?|boxes|spheres|balls|cylinders|cones|rings|stars|prisms|blocks|copies))\\b)(?![^()]*\\))`, 'i'));
    for (const p of pieces) {
      const piece = p.trim().replace(/^[,:]+\s*|\s*[,:]+$/g, '');
      if (piece) parts.push(piece);
    }
  }
  return parts;
}

/**
 * Whether a message starts the way a description of the scene does: with a verb the reader knows ("add",
 * "make", "move", "there's"), or with a thing ("a", "two", "3 cubes"), and not asked as a question. Said
 * in the conversation, a message that only MENTIONS a shape is not a description of one: "what is the
 * volume of a sphere of radius 2?" reads in part as "add a sphere", and is a question. A request put
 * politely ("could you add a sphere") still starts with its verb once the courtesy is set aside.
 */
export function readsAsDescription(text: string): boolean {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t || /\?\s*$/.test(t)) return false;
  const rest = t.replace(/^(?:(?:please|pls|now|and|also|then|ok|okay|so|just|hey|hi)[,!\s]+)*(?:(?:can|could|would|will) you\s+(?:please\s+)?)?/, '');
  return new RegExp(`^(?:${VERBS}|give me|i want|i need|i'd like|let'?s|there is|there's|we need|show|stack|pile|drop|lay|stand|a|an|another|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)(?![a-z'])`).test(rest);
}

export function readScene(text: string, state: SceneState, ctx: ReadContext = {}): Reading {
  const st: Ctx = { s: state, ctx: { ...ctx }, recent: [], ops: [], unit: state.unit };
  const clauses: ClauseReading[] = [];
  for (const raw of clausesOf(text)) {
    const c = new Clause(raw.toLowerCase());
    const opsBefore = st.ops.length;
    const saved = { s: st.s, ctx: st.ctx, recent: st.recent, unit: st.unit };
    let result = readEdit(c, st);
    // a clause led by an edit verb is never read as a request for something new
    if (result === null && !EDIT_ONLY.test(c.work)) result = readCreate(c, st);
    else if (result === null) result = `Not read as an edit — say which part (it, the red box, box 2) and what to do to it.`;
    const reading: ClauseReading = { text: raw };
    if (result === null) {
      reading.problem = 'Not read — name a shape (box, sphere, cylinder, cone, torus, prism, star, ring, plane, or a surface z = …) or an edit (move, rotate, scale, make it …, copy, remove).';
    } else if (result.startsWith('✓')) {
      reading.understood = result.slice(1);
      const left = c.leftover();
      if (left.length) reading.skipped = left;
    } else {
      reading.problem = result;
      // a clause that failed part-way leaves nothing behind — not in the
      // operations, and not in the scene later clauses are read against
      st.ops.length = opsBefore;
      Object.assign(st, saved);
    }
    if (c.notes.length) reading.notes = [...new Set(c.notes)];
    clauses.push(reading);
  }
  // the preview is recomputed from the kept operations, so a failed clause leaves no trace
  let preview = state;
  for (const o of st.ops) {
    const def = SCENE_OPS[o.op];
    if (!def.check(preview, o.args)) preview = def.apply(preview, o.args);
  }
  const added = preview.nodes.filter((n) => !state.nodes.some((b) => b.id === n.id)).map((n) => n.id);
  const removed = state.nodes.filter((b) => !preview.nodes.some((n) => n.id === b.id)).map((n) => n.id);
  const changed = preview.nodes
    .filter((n) => {
      const b = state.nodes.find((x) => x.id === n.id);
      return b && JSON.stringify(b) !== JSON.stringify(n);
    })
    .map((n) => n.id);
  return { ops: st.ops, clauses, preview, changes: { added, changed, removed } };
}

/** For the conversation: the scene's nodes as short tags, for the composer's "about" line. */
export const nodeTag = (n: SceneNode) => `${n.name} (${SHAPE_WORD[n.shape]})`;

export { fitKey };
