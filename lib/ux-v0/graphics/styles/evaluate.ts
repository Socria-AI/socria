// lib/ux-v0/graphics/styles/evaluate.ts — how faithfully a design speaks its language, and whether designs repeat.
//
// Fidelity is measured from the document, never asked of a model (a model's opinion is not ground truth): per
// dimension, what the design is made of against what its effective profile says — the faces its words are set in and
// their case and tracking; how much of its colour is the style's palette, and whether a mono or duotone scheme holds;
// whether its composition is one of the style's constructions, and its symmetry, density and quiet space against the
// profile's; whether its shapes are the style's motifs; its surface (texture effects on the ground); its picture
// treatments; its ornament. Then coherence (faces, colours, nothing the style refuses), the brief (its words exact),
// readability (the checks' findings) and editability (native objects, not pictures of them). Each score says why,
// and what only a person can judge is said as a checkpoint, never scored.
//
// Repetition: each design's signature (its construction, a coarse map of where its text, shapes and pictures sit, its
// hierarchy, shapes, ground and gradient use) compared across a set, so a set of designs that share a layout — or
// differ only in colour — is caught. Deterministic and bounded: one pass over each design.

import { checkDoc } from '../check';
import { walk, type GraphicDoc, type Node, type TextNode } from '../doc';
import { mixColor } from '../paint';
import type { Measure } from '../text';
import { effectiveDNA, type StyleSelection } from './blend';
import { TEXTURE_KEYS, type Dimension, type StyleDNA } from './schema';

export interface DimScore {
  score: number;
  notes: string[];
  /** nothing to measure it against (the brief, when no words were given): not counted in the overall, not shown */
  unchecked?: true;
}
export interface Fidelity {
  style: string;
  overall: number;
  dims: Record<Dimension | 'coherence' | 'brief' | 'readability' | 'editability', DimScore>;
  /** what a person should look at: never scored here */
  checkpoints: string[];
}

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt((c || '#000000').slice(i, i + 2), 16)) as [number, number, number];
const dist = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const near = (want: number, got: number, span = 100) => pct(100 - (Math.abs(want - got) / span) * 140);

/** The colours a node shows (fills, strokes, words), as hex. */
function coloursOf(n: Node): string[] {
  const out: string[] = [];
  const paint = (p: unknown) => {
    if (typeof p === 'string') out.push(p.slice(0, 7));
    else if (p && typeof p === 'object' && Array.isArray((p as { stops?: unknown[] }).stops)) for (const s of (p as { stops: { color: string }[] }).stops) out.push(s.color.slice(0, 7));
  };
  if (n.type === 'shape') {
    paint(n.fill);
    if (n.stroke) out.push(n.stroke.color.slice(0, 7));
  } else if (n.type === 'text') {
    if (n.fill && typeof n.fill === 'object') paint(n.fill);
    else out.push(n.color.slice(0, 7));
  } else if (n.type === 'pattern') out.push(...n.colors.map((c) => c.slice(0, 7)));
  return out;
}

/** A design's fidelity to its language (see the head of this file). Null when it speaks none. */
export function evaluateStyle(
  doc: GraphicDoc,
  opts: {
    selection?: StyleSelection | null;
    customs?: readonly StyleDNA[];
    measure?: Measure;
    words?: readonly string[];
  } = {},
): Fidelity | null {
  const sel = opts.selection ?? doc.style ?? null;
  if (!sel) return null;
  const eff = effectiveDNA(sel, [...(sel.customs ?? []), ...(opts.customs ?? [])]);
  const d = eff.dna;
  const ab = doc.artboards[0];
  if (!ab) return null;
  const nodes = walk(ab).map((l) => l.node);
  const texts = nodes.filter((n): n is TextNode => n.type === 'text');
  const shapes = nodes.filter((n) => n.type === 'shape');
  const W = ab.width;
  const H = ab.height;

  // typography: faces, case, tracking of the headline
  const faces = new Set([...d.typography.display.faces, ...d.typography.body.faces]);
  const inFaces = texts.filter((t) => faces.has(t.font)).length;
  const head = texts.find((t) => t.role === 'headline');
  const tNotes: string[] = [];
  let typo = texts.length ? (inFaces / texts.length) * 70 : 0;
  if (head) {
    const wantCase = d.typography.display.case === 'upper' ? 'upper' : d.typography.display.case === 'lower' ? 'lower' : 'none';
    if ((head.case ?? 'none') === wantCase) typo += 15;
    else tNotes.push(`the headline’s case is not ${d.name}’s (${wantCase})`);
    if (Math.abs(head.tracking - d.typography.display.tracking) <= 40) typo += 15;
    else tNotes.push(`the headline is tracked ${head.tracking}, the style ${d.typography.display.tracking}`);
  }
  tNotes.unshift(`${inFaces} of ${texts.length} texts in the style’s faces`);

  // colour: share of the design's colour within reach of the palette
  const palette = [d.colour.ground, d.colour.ink, d.colour.accent, d.colour.accent2, d.colour.accent3, doc.tokens.colors.background, doc.tokens.colors.text, doc.tokens.colors.accent, doc.tokens.accent2 ?? d.colour.accent2];
  const used = [...nodes.flatMap(coloursOf), ab.background ?? ''].filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const inPalette = used.filter((c) => palette.some((p) => dist(c, p) < 70 || palette.some((q) => dist(c, mixColor(p, q, 0.5).slice(0, 7)) < 50)));
  let colour = used.length ? (inPalette.length / used.length) * 100 : 50;
  const cNotes = [`${inPalette.length} of ${used.length} colours from the palette or between its colours`];
  const hues = new Set(
    used
      .filter((c) => {
        const [r, g, b] = rgb(c);
        return Math.max(r, g, b) - Math.min(r, g, b) > 40;
      })
      .map((c) => {
        const [r, g, b] = rgb(c);
        const mx = Math.max(r, g, b);
        return mx === r ? 'r' : mx === g ? 'g' : 'b';
      }),
  );
  if ((d.colour.scheme === 'mono' && hues.size > 1) || (d.colour.scheme === 'duotone' && hues.size > 2)) {
    colour -= 20;
    cNotes.push(`a ${d.colour.scheme} scheme holds ${hues.size} hue families`);
  }

  // composition: construction, symmetry, density and quiet space
  const plan = (doc as GraphicDoc & { style?: StyleSelection }).style;
  const coverage = (() => {
    const g = 24;
    const cells = new Uint8Array(g * g);
    for (const n of nodes) {
      if (n.role === 'background' || (n.w >= W * 0.97 && n.h >= H * 0.97)) continue;
      for (let y = Math.max(0, Math.floor((n.y / H) * g)); y < Math.min(g, Math.ceil(((n.y + n.h) / H) * g)); y++) for (let x = Math.max(0, Math.floor((n.x / W) * g)); x < Math.min(g, Math.ceil(((n.x + n.w) / W) * g)); x++) cells[y * g + x] = 1;
    }
    let on = 0;
    let mirror = 0;
    for (let y = 0; y < g; y++)
      for (let x = 0; x < g; x++) {
        on += cells[y * g + x];
        if (cells[y * g + x] === cells[y * g + (g - 1 - x)]) mirror++;
      }
    return { on: on / (g * g), symmetry: mirror / (g * g) };
  })();
  const cmpNotes: string[] = [];
  let comp = 0;
  const symGot = pct((coverage.symmetry - 0.5) * 200);
  comp += near(d.composition.symmetry, symGot) * 0.35;
  comp += near(100 - d.composition.negativeSpace, coverage.on * 100) * 0.35;
  comp += plan?.primary === sel.primary ? 30 : 15;
  cmpNotes.push(`symmetry ${symGot} (style ${d.composition.symmetry}), ${Math.round(coverage.on * 100)}% of the frame occupied (style leaves ${d.composition.negativeSpace}% quiet)`);

  // geometry: the style's motifs among the shapes and patterns — by kind, else by family (a bar is a line, an ellipse
  // a circle, a dot pattern a field of circles); a type-led style with almost no shapes is right to have almost none
  const FAMILY: Record<string, string> = {};
  const fam = (f: string, ks: string[]) => ks.forEach((k) => (FAMILY[k] = f));
  fam('line', ['line', 'line-system', 'arrow-line', 'rays', 'wave-lines', 'grid', 'perspective-grid', 'annotation', 'isometric-grid', 'flow-lines', 'bar', 'rule']);
  fam('circle', ['circle', 'ellipse', 'ring', 'concentric', 'arc', 'sector', 'crescent', 'wavy-circle', 'spiral', 'guilloche', 'dot', 'disc']);
  fam('polygon', ['triangle', 'rhombus', 'diamond', 'hexagon', 'octagon', 'polygon', 'nested-polygons', 'parallelogram', 'trapezoid', 'chevron', 'star', 'burst', 'sunburst', 'cross', 'plus', 'arrow', 'wedge', 'fragments']);
  fam('organic', ['blob', 'drop', 'leaf', 'wave', 'fluid-curve', 'ribbon', 'irregular-polygon', 'cutout', 'contour', 'topographic', 'distorted-ring', 'curved-band', 'path']);
  fam('rect', ['rect', 'rounded-rect', 'capsule', 'superellipse', 'frame', 'bracket', 'rounded-polygon', 'speech-bubble', 'callout', 'corner-ornament', 'border']);
  const PATTERN_KIND: Record<string, string> = {
    dots: 'circle',
    halftone: 'circle',
    scatter: 'circle',
    particles: 'circle',
    concentric: 'concentric',
    radial: 'rays',
    lines: 'line',
    stripes: 'line',
    diagonal: 'line',
    grid: 'grid',
    technical: 'grid',
    checker: 'rect',
    modular: 'rect',
    tessellation: 'polygon',
    truchet: 'arc',
    waves: 'wave-lines',
    contours: 'contour',
    flow: 'flow-lines',
    'noise-dashes': 'line-system',
    spiro: 'guilloche',
    symbols: 'star',
    abstract: 'polygon',
    network: 'line',
    isometric: 'isometric-grid',
  };
  const kindOf = (n: Node): string => {
    if (n.type === 'pattern') return PATTERN_KIND[n.gen] ?? 'pattern';
    if (n.type !== 'shape') return '';
    if (n.shape === 'prim') return n.prim?.kind ?? 'prim';
    if (n.shape === 'ellipse') return 'circle';
    if (n.shape === 'line') return 'line';
    if (n.shape === 'rect') return Math.min(n.w, n.h) < Math.min(W, H) * 0.035 ? 'bar' : (n.radius ?? 0) > 6 ? 'rounded-rect' : n.rotation % 90 ? 'rhombus' : 'rect';
    return n.shape;
  };
  const figures = [...shapes, ...nodes.filter((n) => n.type === 'pattern')].filter((n) => n.role !== 'background' && !(n.w >= W * 0.97 && n.h >= H * 0.97));
  const kinds = figures.map(kindOf).filter(Boolean);
  const motifs = new Set([...d.geometry.motifs, ...d.ornament.motifs]);
  const families = new Set([...motifs].map((m) => FAMILY[m] ?? m));
  const exact = kinds.filter((k) => motifs.has(k) || (k === 'bar' && motifs.has('line')));
  const kin = kinds.filter((k) => !exact.includes(k) && families.has(FAMILY[k] ?? k));
  const typeLed = (d.composition.focal === 'type' || d.geometry.complexity < 15) && kinds.length <= 3;
  const geom = typeLed ? 90 : kinds.length ? pct(30 + ((exact.length + kin.length * 0.6) / kinds.length) * 70) : d.geometry.complexity < 25 ? 85 : 40;
  const gNotes = [typeLed ? 'a type-led language: few shapes, as it should be' : `${exact.length} of ${kinds.length} shapes are the style’s own motifs, ${kin.length} of their family`];

  // texture: the style's surface on the ground (or anywhere)
  const strong = TEXTURE_KEYS.filter((k) => d.texture[k] >= 30);
  const fx = new Set(nodes.flatMap((n) => (n.effects ?? []).map((e) => e.kind)));
  const surfaceFx: Record<string, string[]> = {
    grain: ['grain', 'noise'],
    paper: ['grain', 'noise', 'distress'],
    misregistration: ['misregistration'],
    halftone: ['halftone'],
    noise: ['noise', 'grain'],
    distress: ['distress', 'ink-bleed'],
    metallic: ['bevel', 'glass'],
    gloss: ['glass', 'bevel', 'inner-glow'],
    glow: ['glow', 'inner-glow'],
    scanlines: ['glitch', 'chromatic'],
    inkbleed: ['ink-bleed', 'distress'],
  };
  const present = strong.filter(
    (k) => (surfaceFx[k] ?? []).some((e) => fx.has(e)) || (k === 'halftone' && nodes.some((n) => n.type === 'pattern' && n.gen === 'halftone')) || (k === 'scanlines' && nodes.some((n) => n.type === 'pattern' && n.gen === 'lines')),
  );
  const tex = strong.length ? pct((present.length / strong.length) * 100) : fx.size <= 2 ? 90 : 60;
  const xNotes = [strong.length ? `${present.length} of ${strong.length} surface qualities present (${strong.join(', ')})` : 'a clean surface, as the style asks'];

  // imagery: picture treatments
  const imgs = nodes.filter((n) => n.type === 'image' || (n.type === 'group' && n.children.some((c) => c.type === 'image')));
  const imagery = imgs.length ? pct(50 + (d.imagery.treatments.some((t) => fx.has(t)) ? 50 : 0)) : 100;
  const iNotes = [imgs.length ? `${imgs.length} picture${imgs.length === 1 ? '' : 's'}${d.imagery.treatments.some((t) => fx.has(t)) ? ', treated as the style treats them' : ', not treated as the style would'}` : 'no pictures to treat'];

  // ornament: how much decoration, against the profile
  const ornamental =
    shapes.filter((n) => n.shape === 'prim' && ['corner-ornament', 'border', 'frame', 'star', 'fluid-curve', 'leaf', 'guilloche', 'burst', 'sunburst'].includes(n.prim?.kind ?? '')).length +
    nodes.filter((n) => n.type === 'pattern' && n.gen === 'spiro').length;
  const ornGot = Math.min(100, ornamental * 12);
  const orn = near(eff.ornament, ornGot);
  const oNotes = [`${ornamental} ornamental object${ornamental === 1 ? '' : 's'} (style ${eff.ornament}/100)`];

  // coherence: faces, colours, nothing the style refuses
  const faceCount = new Set(texts.flatMap((t) => [t.font, ...(t.runs ?? []).map((r) => r.font).filter((f): f is string => !!f)])).size;
  const cohNotes: string[] = [];
  let coh = 100;
  if (faceCount > d.typography.maxFaces) ((coh -= 20), cohNotes.push(`${faceCount} faces where the style uses at most ${d.typography.maxFaces}`));
  const gradients = nodes.some((n) => (n.type === 'shape' && n.fill && typeof n.fill === 'object') || (n.type === 'text' && n.fill && typeof n.fill === 'object'));
  if (gradients && (d.constraints.incompatible.includes('gradient') || d.colour.gradient === 'none')) ((coh -= 25), cohNotes.push('gradients where the style is flat'));
  if (fx.has('glow') && d.constraints.incompatible.includes('glow')) ((coh -= 15), cohNotes.push('a glow the style refuses'));
  if (fx.has('drop-shadow') && d.constraints.incompatible.includes('soft-shadow')) ((coh -= 10), cohNotes.push('soft shadows the style refuses'));
  if (!cohNotes.length) cohNotes.push('one language throughout');

  // the brief: its words exact
  const want = (opts.words ?? []).filter(Boolean);
  const present2 = want.filter((w) => texts.some((t) => t.text === w || t.text.includes(w) || t.text.replace(/\s*→$/, '') === w));
  const brief = want.length ? pct((present2.length / want.length) * 100) : 100;

  // readability and editability
  const findings = checkDoc(doc, opts.measure);
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  const readability = pct(100 - high * 30 - medium * 5);
  const native = nodes.filter((n) => n.type !== 'image').length;
  const editability = nodes.length ? pct((native / nodes.length) * 100) : 100;

  const dims: Fidelity['dims'] = {
    typography: { score: pct(typo), notes: tNotes },
    colour: { score: pct(colour), notes: cNotes },
    composition: { score: pct(comp), notes: cmpNotes },
    geometry: { score: geom, notes: gNotes },
    texture: { score: tex, notes: xNotes },
    imagery: { score: imagery, notes: iNotes },
    ornament: { score: orn, notes: oNotes },
    coherence: { score: pct(coh), notes: cohNotes },
    brief: {
      score: brief,
      notes: [want.length ? `${present2.length} of ${want.length} of the brief’s words exact` : 'no words given to check'],
      ...(want.length ? {} : { unchecked: true as const }),
    },
    readability: {
      score: readability,
      notes: [`${high} high and ${medium} medium findings`],
    },
    editability: {
      score: editability,
      notes: [`${native} of ${nodes.length} objects are editable shapes and text`],
    },
  };
  const weights: Record<keyof Fidelity['dims'], number> = {
    typography: 1.2,
    colour: 1,
    composition: 1.2,
    geometry: 0.8,
    texture: 0.6,
    imagery: 0.4,
    ornament: 0.5,
    coherence: 1,
    brief: want.length ? 1 : 0,
    readability: 1.2,
    editability: 0.5,
  };
  const total = Object.entries(dims).reduce((s, [k, v]) => s + v.score * weights[k as keyof typeof weights], 0) / Object.values(weights).reduce((a, b) => a + b, 0);
  return {
    style: d.name,
    overall: pct(total),
    dims,
    checkpoints: [
      `Look at it whole: would a designer who knows ${d.name} recognise it?`,
      `Is anything a cliché of ${d.name} rather than its principles (${d.principles.slice(0, 2).join('; ')})?`,
      ...(d.constraints.authenticity ? [d.constraints.authenticity] : []),
    ],
  };
}

// ── repetition ──

export interface Signature {
  id: string;
  /** the construction (or archetype) it was built in */
  construction: string;
  /** an 8 × 10 map of where text (t), shapes (s) and pictures (i) sit */
  map: string;
  hierarchy: string;
  shapes: string[];
  ground: string;
  gradient: boolean;
  faces: string[];
  palette: string[];
}

/** A design's signature (its first artboard), for comparing a set. */
export function signatureOf(doc: GraphicDoc, construction = ''): Signature {
  const ab = doc.artboards[0];
  const nodes = ab ? walk(ab).map((l) => l.node) : [];
  const W = ab?.width ?? 1;
  const H = ab?.height ?? 1;
  const cols = 8;
  const rows = 10;
  const grid: string[] = Array.from({ length: cols * rows }, () => '.');
  for (const n of nodes) {
    if (n.role === 'background' || (n.w >= W * 0.97 && n.h >= H * 0.97)) continue;
    const ch = n.type === 'text' ? 't' : n.type === 'image' ? 'i' : n.type === 'group' && n.children.some((c) => c.type === 'image') ? 'i' : 's';
    for (let y = Math.max(0, Math.floor((n.y / H) * rows)); y < Math.min(rows, Math.ceil(((n.y + n.h) / H) * rows)); y++)
      for (let x = Math.max(0, Math.floor((n.x / W) * cols)); x < Math.min(cols, Math.ceil(((n.x + n.w) / W) * cols)); x++) if (grid[y * cols + x] !== 't') grid[y * cols + x] = ch;
  }
  const texts = nodes.filter((n): n is TextNode => n.type === 'text');
  return {
    id: doc.id,
    construction,
    map: grid.join(''),
    hierarchy: texts
      .slice()
      .sort((a, b) => b.size - a.size)
      .map((t) => t.role ?? 'text')
      .filter((r, i, all) => all.indexOf(r) === i)
      .slice(0, 4)
      .join('>'),
    shapes: [...new Set(nodes.filter((n) => n.type === 'shape').map((n) => (n.type === 'shape' && n.shape === 'prim' ? (n.prim?.kind ?? 'prim') : (n as { shape: string }).shape)))].sort(),
    ground: (ab?.background ?? '#ffffff').slice(0, 7),
    gradient: nodes.some((n) => (n.type === 'shape' || n.type === 'text') && !!n.fill && typeof n.fill === 'object'),
    faces: [...new Set(texts.map((t) => t.font))].sort(),
    palette: [...new Set(nodes.flatMap(coloursOf))].slice(0, 8),
  };
}

/** How alike two layouts are: the share of the map's cells that agree, among cells either one uses (0–1). */
export function layoutSimilarity(a: Signature, b: Signature): number {
  let agree = 0;
  let used = 0;
  for (let i = 0; i < a.map.length; i++) {
    if (a.map[i] === '.' && b.map[i] === '.') continue;
    used++;
    if (a.map[i] === b.map[i]) agree++;
  }
  return used ? agree / used : 1;
}

export interface RepetitionReport {
  /** pairs whose layouts agree on at least `threshold` of their cells */
  sameLayout: [string, string, number][];
  /** pairs built in one construction */
  sameConstruction: [string, string][];
  /** pairs that differ in colour more than in anything else (the same layout, faces and shapes) */
  colourOnly: [string, string][];
  /** how many different constructions, hierarchies, face sets and shape sets */
  distinct: {
    constructions: number;
    hierarchies: number;
    faces: number;
    shapes: number;
    grounds: number;
  };
  /** the mean layout similarity over all pairs (0–1): low is varied */
  meanSimilarity: number;
}

/** A set of designs compared for repetition (see the head of this file). Bounded: n² over the set's signatures. */
export function repetition(sigs: readonly Signature[], threshold = 0.82): RepetitionReport {
  const sameLayout: RepetitionReport['sameLayout'] = [];
  const sameConstruction: RepetitionReport['sameConstruction'] = [];
  const colourOnly: RepetitionReport['colourOnly'] = [];
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sigs.length; i++)
    for (let j = i + 1; j < sigs.length; j++) {
      const a = sigs[i];
      const b = sigs[j];
      const sim = layoutSimilarity(a, b);
      sum += sim;
      pairs++;
      if (sim >= threshold) sameLayout.push([a.id, b.id, Math.round(sim * 100) / 100]);
      if (a.construction && a.construction === b.construction) sameConstruction.push([a.id, b.id]);
      if (sim >= threshold && a.faces.join() === b.faces.join() && a.shapes.join() === b.shapes.join() && a.palette.join() !== b.palette.join()) colourOnly.push([a.id, b.id]);
    }
  const distinct = (f: (s: Signature) => string) => new Set(sigs.map(f)).size;
  return {
    sameLayout,
    sameConstruction,
    colourOnly,
    distinct: {
      constructions: distinct((s) => s.construction),
      hierarchies: distinct((s) => s.hierarchy),
      faces: distinct((s) => s.faces.join('+')),
      shapes: distinct((s) => s.shapes.join('+')),
      grounds: distinct((s) => s.ground),
    },
    meanSimilarity: pairs ? Math.round((sum / pairs) * 1000) / 1000 : 0,
  };
}
