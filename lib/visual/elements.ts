// lib/visual/elements.ts — WHAT ON A PICTURE CAN BE POINTED AT (Logos 6, November 2026).
//
// Every element Socria draws (lib/inline-ui.ts) is made of parts a person or Socria can name: the demand curve, where
// supply meets it, the tangent, the shaded area, a parameter, the third step of a search, a node of a diagram, a
// question of a quiz. This module gives each part an identity that is
//   • stable: read from what the specification says the part IS (its label, its role), never from where it is drawn —
//     no DOM selector, no screen coordinate, no colour — so it survives an ordinary edit that keeps the part;
//   • typed: a curve, a point, a line, a region, a parameter, a vector, a step, a cell, a node, an item, a question;
//   • named: a human-readable label, and the words people call it by ("MR", "marginal revenue");
//   • described: the domain facts that go with it (its formula, its current value, its range, where it is now);
//   • bounded: the visual actions it supports (./actions.ts checks every action against them).
//
// Element ids are conceptual: "curve:demand", "point:equilibrium", "line:tangent", "region:consumer-surplus",
// "param:b", "step:2", "node:glycolysis", "question:4". An artifact is addressed by its key: "<message id>:<n>" for
// the nth element of a reply (the same key artifact-focus uses), "quiz:<object id>" for a quiz.
//
// Pure: no React, no DOM, no clock.

import { compileOver, curveFeatures, fmtPoint, fmtVal, type Feature } from '../inline-math';
import { graphReadings, vectorSum, type DiagramSpec, type EquationSpec, type GraphSpec, type InlineSpec, type InlineState, type SequenceSpec, type SimSpec, type StepsSpec, type TraceSpec, type VectorsSpec } from '../inline-ui';

export const VISUAL_OPS = ['highlight', 'unhighlight', 'focus', 'zoom', 'pan', 'trace', 'animate', 'pause', 'resume', 'replay', 'step', 'compare', 'update_parameter', 'reveal', 'reset'] as const;
export type VisualOp = (typeof VISUAL_OPS)[number];

export type ElementKind = 'curve' | 'point' | 'line' | 'region' | 'param' | 'mark' | 'readout' | 'vector' | 'step' | 'cell' | 'node' | 'edge' | 'item' | 'path' | 'term' | 'question' | 'answer';

export type Meta = Record<string, string | number | boolean | null>;

export interface VisualElement {
  /** stable within its artifact: "curve:demand" */
  id: string;
  kind: ElementKind;
  /** what a person reads it as */
  label: string;
  /** what people call it, lower case, longest first: matched as whole words */
  words: string[];
  /** the facts that go with it, as it is now */
  meta?: Meta;
  /** what can be done to it */
  ops: VisualOp[];
}

export interface VisualArtifact {
  /** "<message id>:<n>", or "quiz:<object id>" */
  key: string;
  /** the specification's type, or "quiz" */
  type: string;
  title: string;
  elements: VisualElement[];
  /** what can be done to the artifact as a whole, with no element named */
  ops: VisualOp[];
}

// ── names ────────────────────────────────────────────────────────────

/** A label as an id: lower case, letters and digits, hyphens between — "Consumer surplus" → "consumer-surplus". */
export function slug(label: string | undefined | null): string {
  return String(label ?? '')
    .replace(/\$|\\[a-z]+|[{}]/gi, ' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
}

/**
 * What a part of a picture is called, both ways: an economics course writes "MR" on the curve and says "marginal
 * revenue" about it. Each row is one thing, every name it goes by.
 */
const SAME: readonly (readonly string[])[] = [
  ['demand', 'demand curve', 'd'],
  ['supply', 'supply curve', 's'],
  ['marginal revenue', 'mr'],
  ['marginal cost', 'mc'],
  ['average total cost', 'average cost', 'atc', 'ac'],
  ['average variable cost', 'avc'],
  ['total revenue', 'revenue', 'tr'],
  ['total cost', 'cost', 'tc'],
  ['marginal benefit', 'mb'],
  ['marginal social cost', 'msc'],
  ['marginal social benefit', 'msb'],
  ['production possibility frontier', 'production possibilities frontier', 'ppf', 'ppc', 'frontier'],
  ['derivative', "f'", 'f prime', "f'(x)", 'slope function'],
  ['consumer surplus', 'cs'],
  ['producer surplus', 'ps'],
  ['deadweight loss', 'dwl', 'deadweight'],
  ['sampling distribution', 'distribution of the mean'],
  ['normal distribution', 'normal curve', 'bell curve'],
  ['resultant', 'net force', 'sum', 'total force', 'the sum'],
  ['velocity', 'v'],
  ['acceleration', 'a'],
];

/** Every name a label goes by: itself, without its brackets, what is in them, and what the same thing is called. */
export function wordsFor(...labels: (string | undefined | null)[]): string[] {
  const out = new Set<string>();
  const add = (w: string) => {
    const t = w.toLowerCase().replace(/\$|\\[a-z]+|[{}*_]/gi, '').replace(/\s+/g, ' ').trim();
    if (t && t.length <= 60) out.add(t);
  };
  for (const raw of labels) {
    if (!raw) continue;
    add(raw);
    const bare = raw.replace(/\([^)]*\)/g, ' ');
    add(bare);
    for (const m of raw.matchAll(/\(([^)]{1,30})\)/g)) add(m[1]);
    for (const part of bare.split(/\s*[,/;]\s*|\s+(?:or|and)\s+/)) if (part.length > 1) add(part);
  }
  for (const w of [...out]) for (const row of SAME) if (row.includes(w)) row.forEach(add);
  return [...out].sort((a, b) => b.length - a.length);
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
/** "first" for 1 … "twelfth" for 12. */
export const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

/** An id not yet used in this artifact: the slug, or the slug with a number after it. */
function uniq(used: Set<string>, id: string): string {
  let out = id;
  for (let i = 2; used.has(out); i++) out = `${id}-${i}`;
  used.add(out);
  return out;
}

// ── a graph ──────────────────────────────────────────────────────────

const CURVE_OPS: VisualOp[] = ['highlight', 'unhighlight', 'focus', 'trace', 'compare'];
const POINT_OPS: VisualOp[] = ['highlight', 'unhighlight', 'focus', 'zoom'];
const LINE_OPS: VisualOp[] = ['highlight', 'unhighlight', 'focus', 'reveal'];
const REGION_OPS: VisualOp[] = ['highlight', 'unhighlight', 'focus', 'reveal'];
const PARAM_OPS: VisualOp[] = ['update_parameter', 'animate', 'reset', 'highlight', 'unhighlight'];

/** Whether a formula uses a parameter (as a whole name: "b" in "a*x+b", not in "abs"). */
export function uses(expr: string | number | undefined, name: string): boolean {
  if (typeof expr !== 'string') return false;
  return new RegExp(`(^|[^A-Za-z_])${name.replace(/[^A-Za-z0-9_]/g, '')}(?![A-Za-z0-9_(])`).test(expr);
}

/** The curves a graph draws, in order: the first (spec.expr), then spec.curves. */
export function graphCurves(spec: GraphSpec): { expr: string; label?: string; id: string }[] {
  const used = new Set<string>();
  const all = [{ expr: spec.expr, label: spec.label }, ...(spec.curves ?? [])];
  return all.map((c, i) => ({ ...c, id: uniq(used, `curve:${slug(c.label) || (all.length === 1 ? 'f' : String(i + 1))}`) }));
}

/** Two curves that are a market (demand and supply) or a firm's choice (MR and MC): where they meet has a name. */
function meetingName(labels: string[]): { id: string; label: string; words: string[] } {
  const w = labels.map((l) => wordsFor(l));
  const has = (x: string) => w.some((ws) => ws.includes(x));
  if (has('demand') && has('supply')) return { id: 'point:equilibrium', label: 'equilibrium', words: ['market equilibrium', 'equilibrium point', 'equilibrium', 'where they meet', 'where supply meets demand', 'intersection', 'crossing'] };
  if (has('marginal revenue') && has('marginal cost')) return { id: 'point:mr-mc', label: 'where MR = MC', words: ['profit-maximising point', 'profit maximising point', 'where mr meets mc', 'mr = mc', 'mr=mc', 'intersection', 'crossing', 'where they meet'] };
  return { id: 'point:crossing', label: 'where the curves meet', words: ['where the curves meet', 'where they meet', 'intersection', 'crossing', 'meeting point'] };
}

function graphElements(spec: GraphSpec, state?: InlineState): VisualArtifact['elements'] {
  const names = spec.params.map((p) => p.name);
  const values: Record<string, number> = { ...Object.fromEntries(spec.params.map((p) => [p.name, p.value])), ...(state?.values ?? {}) };
  const start = Object.fromEntries(spec.params.map((p) => [p.name, p.value]));
  const used = new Set<string>();
  const out: VisualElement[] = [];
  const curves = graphCurves(spec);
  curves.forEach((c, i) => {
    used.add(c.id);
    const params = names.filter((n) => uses(c.expr, n) && !(spec.at ?? []).includes(n));
    out.push({
      id: c.id,
      kind: 'curve',
      label: c.label || (curves.length === 1 ? `y = ${c.expr}` : `curve ${i + 1}`),
      words: [...wordsFor(c.label), ...(curves.length === 1 ? ['the curve', 'curve', 'the function', 'function', 'the graph', 'graph', 'f(x)', 'f'] : []), ...(i === 0 ? ['first curve'] : i === 1 ? ['second curve'] : ['third curve'])],
      meta: { expr: c.expr, index: i, params: params.join(',') || null },
      ops: params.length ? CURVE_OPS : CURVE_OPS.filter((o) => o !== 'compare'),
    });
  });
  const readings = graphReadings(spec, values);
  if (spec.tangent) {
    const t = readings.tangent;
    out.push({
      id: uniq(used, 'line:tangent'),
      kind: 'line',
      label: t ? `the tangent at x = ${fmtVal(t.x)}` : 'the tangent',
      words: ['tangent line', 'the tangent', 'tangent', 'instantaneous rate', 'slope at the point', 'rate at the point'],
      meta: { at: spec.tangent, x: t ? t.x : null, slope: t && t.slope !== null ? t.slope : null },
      ops: [...LINE_OPS, 'animate'],
    });
  }
  if (spec.chord) {
    const ch = readings.chord;
    out.push({
      id: uniq(used, 'line:secant'),
      kind: 'line',
      label: ch ? `the secant from x = ${fmtVal(ch.a)} to x = ${fmtVal(ch.b)}` : 'the secant',
      words: ['secant line', 'the secant', 'secant', 'the chord', 'chord', 'average rate', 'average slope'],
      meta: { from: spec.chord[0], to: spec.chord[1], slope: ch ? ch.slope : null },
      ops: [...LINE_OPS, 'animate'],
    });
  }
  if (spec.features.includes('crossings') && curves.length > 1) {
    const m = meetingName(curves.map((c) => c.label ?? ''));
    const at = readings.crossings[0];
    const was = graphReadings(spec, start).crossings[0];
    out.push({ id: uniq(used, m.id), kind: 'point', label: m.label, words: m.words, meta: { x: at ? at.x : null, y: at ? at.y : null, at: at ? fmtPoint(at) : null, was: was ? fmtPoint(was) : null }, ops: POINT_OPS });
  }
  const c0 = compileOver(spec.expr, names);
  const feats: Feature[] = c0 ? curveFeatures(c0, values, spec.x[0], spec.x[1], ['turning', 'root', 'intercept']) : [];
  if (spec.features.includes('turning')) {
    const t = feats.find((k) => k.kind === 'turning');
    const kind = t ? (t.max ? 'maximum' : 'minimum') : null;
    out.push({
      id: uniq(used, 'point:turning'),
      kind: 'point',
      label: kind ? `the ${kind}` : 'the turning point',
      words: ['turning point', 'the vertex', 'vertex', 'extremum', 'extreme point', ...(kind === 'maximum' ? ['local maximum', 'maximum', 'the top', 'peak', 'max'] : kind === 'minimum' ? ['local minimum', 'minimum', 'the bottom', 'min', 'trough'] : ['maximum', 'minimum'])],
      meta: { at: t ? fmtPoint(t) : null },
      ops: POINT_OPS,
    });
  }
  if (spec.features.includes('roots')) {
    const r = feats.filter((k) => k.kind === 'root');
    out.push({ id: uniq(used, 'point:root'), kind: 'point', label: r.length > 1 ? 'the roots' : 'the root', words: ['x-intercepts', 'x-intercept', 'the roots', 'roots', 'root', 'zeros', 'zeroes', 'zero', 'crosses the axis'], meta: { at: r.map(fmtPoint).join(', ') || null }, ops: POINT_OPS });
  }
  if (spec.features.includes('intercept')) out.push({ id: uniq(used, 'point:intercept'), kind: 'point', label: 'the y-intercept', words: ['y-intercept', 'intercept'], ops: POINT_OPS });
  (spec.points ?? []).forEach((p, i) => {
    const q = readings.points[i];
    out.push({
      id: uniq(used, `point:${slug(p.label) || (p.open ? 'hole' : String(i + 1))}`),
      kind: 'point',
      label: p.label || (p.open ? 'the hole' : `point ${i + 1}`),
      words: [...wordsFor(p.label), ...(p.open ? ['the hole', 'hole', 'open circle', 'removable discontinuity', 'discontinuity', 'the limit'] : ['the point', 'filled point'])],
      meta: { x: q ? q.x : null, y: q ? q.y : null, open: !!p.open },
      ops: POINT_OPS,
    });
  });
  for (const n of spec.at ?? []) {
    const p = spec.params.find((q) => q.name === n);
    if (!p) continue;
    const x = values[n];
    const y = c0 ? c0.eval({ ...values, x }) : NaN;
    out.push({ id: uniq(used, `point:${slug(n)}`), kind: 'point', label: `the point ${p.label}`, words: [...wordsFor(p.label), `point ${n}`, 'the point', 'point'], meta: { param: n, x, y: Number.isFinite(y) ? y : null }, ops: [...POINT_OPS, 'animate'] });
  }
  if (spec.area) {
    const a = readings.area;
    const rects = spec.area.rects;
    out.push({
      id: uniq(used, `region:${slug(spec.area.label) || 'area'}`),
      kind: 'region',
      label: spec.area.label || 'the shaded area',
      words: [...wordsFor(spec.area.label), 'shaded area', 'shaded region', 'the area', 'area', 'region', 'the integral', 'integral', 'signed area', 'area under the curve'],
      meta: { from: a ? a.from : null, to: a ? a.to : null, value: a ? a.value : null },
      ops: REGION_OPS,
    });
    if (rects) {
      out.push({
        id: uniq(used, 'region:rectangles'),
        kind: 'region',
        label: `${rects.rule === 'mid' ? 'midpoint' : rects.rule} Riemann rectangles`,
        words: ['riemann rectangles', 'riemann sum', 'the rectangles', 'rectangles', 'approximation', 'partition', `${rects.rule} sum`, `${rects.rule === 'mid' ? 'midpoint' : rects.rule} riemann sum`],
        meta: { n: a?.n ?? null, sum: a?.sum ?? null, exact: a ? a.value : null, rule: rects.rule, param: typeof rects.n === 'string' ? rects.n : null },
        ops: REGION_OPS,
      });
    }
  }
  (spec.highlights ?? []).forEach((h, i) => {
    out.push({ id: `mark:${i + 1}`, kind: 'mark', label: h.label, words: [...wordsFor(h.label), `${'①②③④'[i]}`, `highlight ${i + 1}`, `number ${i + 1}`], ops: ['highlight', 'unhighlight', 'focus'] });
  });
  for (const ro of readings.readouts) out.push({ id: uniq(used, `readout:${slug(ro.label) || 'value'}`), kind: 'readout', label: ro.label, words: wordsFor(ro.label), meta: { value: ro.value }, ops: ['highlight', 'unhighlight'] });
  for (const p of spec.params) out.push(paramElement(p, values, curves, spec.at ?? [], spec.area?.rects?.n));
  return out;
}

function paramElement(p: { name: string; label: string; min: number; max: number; step: number; value: number; unit?: string }, values: Record<string, number>, curves: { expr: string; id: string }[], at: readonly string[], rectsN?: number | string): VisualElement {
  const on = curves.filter((c) => uses(c.expr, p.name)).map((c) => c.id);
  return {
    id: `param:${p.name}`,
    kind: 'param',
    label: p.label,
    words: [...new Set([...wordsFor(p.label), p.name.toLowerCase(), ...(rectsN === p.name ? ['number of rectangles', 'rectangles', 'n'] : [])])],
    meta: { name: p.name, value: values[p.name] ?? p.value, start: p.value, min: p.min, max: p.max, step: p.step, unit: p.unit ?? null, curves: on.join(',') || null, position: at.includes(p.name) },
    ops: PARAM_OPS,
  };
}

// ── the other kinds ──────────────────────────────────────────────────

function vectorsElements(spec: VectorsSpec, state?: InlineState): VisualElement[] {
  const values: Record<string, number> = { ...Object.fromEntries(spec.params.map((p) => [p.name, p.value])), ...(state?.values ?? {}) };
  const sum = vectorSum(spec, values);
  const used = new Set<string>();
  const out: VisualElement[] = spec.vectors.map((v, i) => ({
    id: uniq(used, `vector:${slug(v.label) || String(i + 1)}`),
    kind: 'vector' as const,
    label: v.label,
    words: [...wordsFor(v.label), `vector ${i + 1}`],
    meta: { mag: sum.parts[i]?.mag ?? null, angle: sum.parts[i]?.angle ?? null, params: spec.params.filter((p) => uses(v.mag, p.name) || uses(v.angle, p.name)).map((p) => p.name).join(',') || null },
    ops: ['highlight', 'unhighlight', 'focus'] as VisualOp[],
  }));
  if (spec.resultant) out.push({ id: uniq(used, 'vector:sum'), kind: 'vector', label: 'the resultant', words: wordsFor('resultant'), meta: { mag: sum.mag, angle: sum.angle }, ops: ['highlight', 'unhighlight', 'focus'] });
  for (const p of spec.params) out.push(paramElement(p, values, spec.vectors.map((v, i) => ({ expr: `${v.mag} ${v.angle}`, id: out[i].id })), []));
  return out;
}

function traceElements(spec: TraceSpec): VisualElement[] {
  const out: VisualElement[] = spec.steps.map((s, i) => ({
    id: `step:${i + 1}`,
    kind: 'step' as const,
    label: s.note,
    words: [`step ${i + 1}`, `${ordinal(i + 1)} step`, ...(i === spec.steps.length - 1 ? ['last step', 'final step'] : []), ...(i === 0 ? ['start', 'beginning'] : [])],
    meta: { n: i + 1, of: spec.steps.length, mark: (s.mark ?? []).join(',') || null, done: (s.done ?? []).join(',') || null },
    ops: ['step', 'highlight', 'focus'] as VisualOp[],
  }));
  const width = Math.max(...spec.steps.map((s) => s.cells.length), 0);
  for (let i = 0; i < width; i++) out.push({ id: `cell:${i}`, kind: 'cell', label: `position ${i}`, words: [`position ${i}`, `index ${i}`, `cell ${i}`], ops: ['highlight', 'unhighlight'] });
  return out;
}

function stepsElements(spec: StepsSpec): VisualElement[] {
  return spec.lines.map((l, i) => ({
    id: `step:${i + 1}`,
    kind: 'step' as const,
    label: l.tex,
    words: [`step ${i + 1}`, `line ${i + 1}`, `${ordinal(i + 1)} step`, `${ordinal(i + 1)} line`, ...(i === spec.lines.length - 1 ? ['last step', 'last line'] : [])],
    meta: { n: i + 1, mark: l.mark ?? null },
    ops: ['highlight', 'unhighlight', 'focus'] as VisualOp[],
  }));
}

function diagramElements(spec: DiagramSpec): VisualElement[] {
  const label = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const nodes: VisualElement[] = spec.nodes.map((n, i) => ({ id: `node:${slug(n.id) || String(i + 1)}`, kind: 'node' as const, label: n.label, words: [...wordsFor(n.label), `node ${i + 1}`, `${ordinal(i + 1)} node`], meta: { role: n.role ?? null }, ops: ['highlight', 'unhighlight', 'focus'] as VisualOp[] }));
  const edges: VisualElement[] = spec.edges.map(([a, b, rel]) => ({ id: `edge:${slug(a)}>${slug(b)}`, kind: 'edge' as const, label: `${label.get(a) ?? a} → ${label.get(b) ?? b}`, words: [`${(label.get(a) ?? a).toLowerCase()} to ${(label.get(b) ?? b).toLowerCase()}`], meta: { rel: rel ?? null }, ops: ['highlight', 'unhighlight'] as VisualOp[] }));
  return [...nodes, ...edges];
}

function sequenceElements(spec: SequenceSpec): VisualElement[] {
  return spec.items.map((x, i) => ({ id: `item:${i + 1}`, kind: 'item' as const, label: x.label, words: [...wordsFor(x.label, x.when), `${spec.kind === 'timeline' ? 'event' : 'step'} ${i + 1}`, `${ordinal(i + 1)} ${spec.kind === 'timeline' ? 'event' : 'step'}`], meta: { when: x.when ?? null }, ops: ['highlight', 'unhighlight', 'focus', 'step'] as VisualOp[] }));
}

function simElements(spec: SimSpec, state?: InlineState): VisualElement[] {
  const values: Record<string, number> = { ...Object.fromEntries(spec.params.map((p) => [p.name, p.value])), ...(state?.values ?? {}) };
  return [
    { id: 'path:trajectory', kind: 'path', label: 'the path', words: ['trajectory', 'the path', 'path', 'motion', 'flight', 'the motion'], meta: { x: spec.x, y: spec.y }, ops: ['highlight', 'unhighlight', 'trace'] },
    ...spec.params.map((p) => paramElement(p, values, [{ expr: `${spec.x} ${spec.y} ${spec.t.join(' ')}`, id: 'path:trajectory' }], [])),
  ];
}

function equationElements(spec: EquationSpec): VisualElement[] {
  const used = new Set<string>();
  return (spec.terms ?? []).map((t) => ({ id: uniq(used, `term:${slug(t.sym) || 'term'}`), kind: 'term' as const, label: t.sym, words: wordsFor(t.sym, t.means), meta: { means: t.means }, ops: ['highlight', 'unhighlight'] as VisualOp[] }));
}

/** The title an artifact goes by. */
export function titleOf(spec: InlineSpec): string {
  const t = (spec as { title?: string }).title;
  if (t) return t;
  if (spec.type === 'graph') return spec.label ? `${spec.label}, y = ${spec.expr}` : `y = ${spec.expr}`;
  if (spec.type === 'balance') return spec.subject;
  return spec.type;
}

/** What can be done to an artifact of this kind as a whole. */
function artifactOps(spec: InlineSpec): VisualOp[] {
  switch (spec.type) {
    case 'graph':
      return ['zoom', 'pan', 'focus', 'reset', ...(spec.params.length ? (['animate', 'pause', 'resume', 'replay', 'compare'] as VisualOp[]) : [])];
    case 'sim':
      return ['trace', 'animate', 'pause', 'resume', 'replay', 'reset'];
    case 'vectors':
      return spec.params.length ? ['animate', 'pause', 'resume', 'replay', 'reset'] : [];
    case 'trace':
      return ['step', 'animate', 'pause', 'resume', 'replay', 'reset'];
    case 'sequence':
      return ['step', 'reset'];
    default:
      return [];
  }
}

/** Every part of one artifact that can be pointed at, as it now stands. Empty for a kind with no parts to name. */
export function elementsOf(spec: InlineSpec, state?: InlineState): VisualElement[] {
  switch (spec.type) {
    case 'graph':
      return graphElements(spec, state);
    case 'vectors':
      return vectorsElements(spec, state);
    case 'trace':
      return traceElements(spec);
    case 'steps':
      return stepsElements(spec);
    case 'diagram':
      return diagramElements(spec);
    case 'sequence':
      return sequenceElements(spec);
    case 'sim':
      return simElements(spec, state);
    case 'equation':
      return equationElements(spec);
    default:
      return [];
  }
}

/** One artifact, addressable: its key, what it is, its parts, what can be done to it. */
export function visualArtifact(key: string, spec: InlineSpec, state?: InlineState): VisualArtifact {
  return { key, type: spec.type, title: titleOf(spec), elements: elementsOf(spec, state), ops: artifactOps(spec) };
}

// ── a quiz, reviewed ─────────────────────────────────────────────────

/** A quiz's review as parts: each question, and the answer they gave where it was wrong (lib/quiz/review.ts). */
export function quizArtifact(key: string, title: string, items: readonly { n: number; topic: string; outcome: string; yours: string | null; correct: string | null }[]): VisualArtifact {
  const out: VisualElement[] = [];
  for (const it of items) {
    const wrong = it.outcome !== 'right';
    out.push({ id: `question:${it.n}`, kind: 'question', label: `Question ${it.n} (${it.topic})`, words: [`question ${it.n}`, `q${it.n}`, `${ordinal(it.n)} question`, ...wordsFor(it.topic)], meta: { n: it.n, outcome: it.outcome, topic: it.topic }, ops: ['highlight', 'unhighlight', 'focus'] });
    if (it.yours !== null) out.push({ id: `question:${it.n}/yours`, kind: 'answer', label: `your answer to question ${it.n}`, words: [`your answer to question ${it.n}`], meta: { n: it.n, wrong, answer: it.yours.slice(0, 120) }, ops: ['highlight', 'unhighlight', 'focus'] });
  }
  return { key, type: 'quiz', title, elements: out, ops: [] };
}

/** An element of an artifact by its id: exactly, or by the words of its name when the id was spelled another way. */
export function findElement(art: Pick<VisualArtifact, 'elements'>, ref: string): VisualElement | null {
  const r = ref.trim().toLowerCase();
  const exact = art.elements.find((e) => e.id === r);
  if (exact) return exact;
  const m = /^([a-z]+):(.+)$/.exec(r);
  if (!m) return null;
  const [, kind, rest] = m;
  const said = rest.replace(/-/g, ' ');
  const sameKind = art.elements.filter((e) => e.id.startsWith(`${kind}:`) || e.kind === kind);
  return sameKind.find((e) => e.words.includes(said)) ?? sameKind.find((e) => slug(e.label) === slug(said)) ?? null;
}
