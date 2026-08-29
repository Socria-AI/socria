// lib/logos-viz.ts
//
// Dynamic Visualisation — the shared machinery behind an animated Graph.
//
// The point of this file is that a new mathematical visualisation should be a
// SMALL amount of new code, not a new feature. Everything that is hard —
// evaluating expressions safely, resolving a viewport, running the clock,
// drawing, laying out controls, honouring the Answer Guard — lives once, in
// the renderer and here. A new concept is one entry in KINDS: a builder that
// turns (scene, parameter values) into a frame of objects and readouts.
//
// The vocabulary, in the order the data flows:
//
//   VizScene     what to show: an expression, a viewport, some parameters,
//                and a kind that says how to read them.
//   VizParam     a number the person can move — h, a, n, t, a coefficient.
//                One may be swept by the animation clock.
//   VizObject    a thing on the canvas: curve, point, segment, line, vector,
//                rectangles, region, sequence, rule, label. The renderer knows
//                these and nothing else, so builders compose rather than draw.
//   VizReadout   a number worth watching, in LaTeX. The Answer Guard works
//                here: a withheld readout has value === null and never reaches
//                the DOM at all.
//   VizFrame     one moment: objects + readouts + caption. Pure function of
//                (scene, values, guarded).
//
// Nothing in this file touches React, the network, or time. Frames are
// deterministic, which is what makes the whole surface testable.

import { compileExpr, freeNames, type CompiledExpr } from './logos-math';

// ── parameters ──────────────────────────────────────────────────────

export interface VizParam {
  /** the name as it appears in the expression: 'h', 'a', 'n', 't', 'k' */
  id: string;
  min: number;
  max: number;
  step: number;
  /** where it starts, and where "reset" returns to */
  value: number;
  /** n is a count; halves of a rectangle are not a thing */
  integer?: boolean;
  /**
   * The animation drives this one. 'down' runs max → min (h → 0), 'up' runs
   * min → max (n → ∞). At most one parameter in a scene sweeps.
   */
  sweep?: 'down' | 'up';
  /** rendered beside the slider: the "0" in "h → 0" */
  toward?: string;
  /** LaTeX to show instead of the id, where the two differ (id 'd' → δ) */
  symbol?: string;
}

/** Where a sweeping parameter sits at progress p ∈ [0,1]. */
export function sweepValue(p: VizParam, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  if (p.sweep === 'down') {
    // Geometric, not linear. h → 0 should decelerate the way a limit does:
    // linear interpolation spends most of the animation on values so large
    // the secant is visibly wrong, then skips the interesting part.
    const from = p.max;
    const to = p.min;
    const v = to > 0 ? from * Math.pow(to / from, u) : from * (1 - u);
    return snap(p, v);
  }
  // Rising counts want the early terms to breathe — the difference between
  // n = 2 and n = 6 is the whole idea, and between n = 70 and n = 80 is none.
  const v = p.min + (p.max - p.min) * u * u;
  return snap(p, v);
}

function snap(p: VizParam, v: number): number {
  const clamped = Math.min(p.max, Math.max(p.min, v));
  if (p.integer) return Math.round(clamped);
  const stepped = Math.round(clamped / p.step) * p.step;
  // step is a decimal like 0.05; rounding kills the float dust it leaves
  return Math.round(stepped * 1e6) / 1e6;
}

/** The inverse of sweepValue — where the playhead sits for a hand-set value. */
export function sweepProgress(p: VizParam, v: number): number {
  if (p.sweep === 'down') {
    const from = p.max, to = p.min;
    if (to > 0 && from > 0 && v > 0) {
      return clamp01(Math.log(v / from) / Math.log(to / from));
    }
    return clamp01((from - v) / (from - to || 1));
  }
  return clamp01(Math.sqrt((v - p.min) / (p.max - p.min || 1)));
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// ── objects the renderer knows how to draw ──────────────────────────

export interface Pt {
  x: number;
  y: number;
}

export type VizObject =
  /** a sampled path; NaN y breaks the pen, which is how asymptotes work */
  | { o: 'curve'; id: string; pts: Pt[]; tone?: Tone; dashed?: boolean; width?: number }
  | { o: 'point'; id: string; x: number; y: number; tone?: Tone; hollow?: boolean; label?: string }
  | { o: 'segment'; id: string; x1: number; y1: number; x2: number; y2: number; tone?: Tone; dashed?: boolean; width?: number }
  /** an unbounded line, drawn to the edges of the viewport */
  | { o: 'line'; id: string; x: number; y: number; slope: number; tone?: Tone; dashed?: boolean; width?: number }
  | { o: 'vector'; id: string; x1: number; y1: number; x2: number; y2: number; tone?: Tone; label?: string }
  /** Riemann bars and anything else made of upright boxes */
  | { o: 'rects'; id: string; bars: { x0: number; x1: number; y: number }[]; tone?: Tone }
  /** the area between a curve and the axis, over an interval */
  | { o: 'region'; id: string; pts: Pt[]; tone?: Tone }
  /** discrete terms: a sequence, a set of partial sums */
  | { o: 'sequence'; id: string; pts: Pt[]; tone?: Tone; stems?: boolean }
  | { o: 'vrule'; id: string; at: number; tone?: Tone; dashed?: boolean; label?: string }
  | { o: 'hrule'; id: string; at: number; tone?: Tone; dashed?: boolean; label?: string }
  | { o: 'label'; id: string; x: number; y: number; text: string; tone?: Tone; anchor?: 'start' | 'middle' | 'end'; dy?: number };

/** Semantic colour roles, resolved to the Logos palette by the renderer. */
export type Tone = 'primary' | 'accent' | 'tension' | 'muted' | 'ghost';

export interface VizReadout {
  id: string;
  /** LaTeX for the quantity itself, e.g. \frac{f(a+h)-f(a)}{h} */
  tex: string;
  /**
   * The value, already formatted. `null` means the Answer Guard is holding it
   * back — the renderer draws a placeholder and the number never enters the
   * document, so it cannot be read out of the DOM either.
   */
  value: string | null;
}

export interface VizFrame {
  objects: VizObject[];
  readouts: VizReadout[];
  /** one line under the canvas, describing what is happening right now */
  caption: string;
  /** while the guard is up: the noticing the visual is asking them to do */
  ask?: string;
}

// ── the scene ───────────────────────────────────────────────────────

export const VIZ_KINDS = ['function', 'limit', 'derivative', 'riemann'] as const;
export type VizKind = (typeof VIZ_KINDS)[number];

export interface VizScene {
  kind: VizKind;
  /** the function under study, in the evaluator's grammar */
  expr: string;
  /** the free variable, almost always 'x' */
  varName: string;
  view: { xMin: number; xMax: number; yMin?: number; yMax?: number };
  params: VizParam[];
  /** the point of interest: the a in lim(x→a), the f'(a), the left end of ∫ */
  a?: number;
  /** the right end of an interval */
  b?: number;
  /** which corner of each Riemann bar sits on the curve */
  rule?: 'left' | 'right' | 'midpoint';
  /** a short title, in the person's own framing */
  title?: string;
}

// ── formatting ──────────────────────────────────────────────────────

/** Numbers a person reads, not numbers a float prints. */
export function fmt(n: number, places = 3): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < 5e-7) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e5 || abs < 1e-4) return n.toExponential(2).replace('e', '×10^');
  const r = Number(n.toFixed(places));
  return String(r);
}

function fmtParam(p: VizParam, v: number): string {
  return p.integer ? String(Math.round(v)) : fmt(v, p.step < 0.01 ? 4 : 3);
}

// ── sampling ────────────────────────────────────────────────────────

const SAMPLES = 320;

/**
 * Sample f over [xMin,xMax] with the given scope. Non-finite values are kept
 * as NaN rather than dropped: the renderer needs to know WHERE the curve broke
 * to lift the pen, and a silently shortened array would join across a pole.
 */
export function sampleCurve(
  fn: CompiledExpr,
  varName: string,
  scope: Record<string, number>,
  xMin: number,
  xMax: number,
  n = SAMPLES
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    pts.push({ x, y: fn.eval({ ...scope, [varName]: x }) });
  }
  return pts;
}

/**
 * A viewport that holds still. Computed once from the scene's DEFAULT
 * parameter values, never per frame — a window that rescales as h shrinks
 * would hide the very motion the animation exists to show.
 */
export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function resolveView(scene: VizScene, fn: CompiledExpr): Viewport {
  const { xMin, xMax } = scene.view;
  if (typeof scene.view.yMin === 'number' && typeof scene.view.yMax === 'number') {
    return { xMin, xMax, yMin: scene.view.yMin, yMax: scene.view.yMax };
  }
  const scope = defaults(scene);

  // A tangent forming, or two sides of a limit closing, is a LOCAL event. Ask
  // what the function does across the whole window and x^2 on [-1.5, 4] answers
  // "0 to 16", which squashes the action at (1, 1) into the bottom twentieth of
  // the panel. So for the kinds built around a point of interest, the window
  // follows the neighbourhood of that point instead, and the curve is simply
  // allowed to leave the top of the frame — which is what graphs do.
  const focus =
    (scene.kind === 'derivative' || scene.kind === 'limit') && typeof scene.a === 'number'
      ? scene.a
      : null;
  const halfSpan = (xMax - xMin) / 4;
  const [sMin, sMax] =
    focus === null
      ? [xMin, xMax]
      : [Math.max(xMin, focus - halfSpan), Math.min(xMax, focus + halfSpan)];

  const ys = sampleCurve(fn, scene.varName, scope, sMin, sMax, 200)
    .map((p) => p.y)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  if (ys.length < 4) return { xMin, xMax, yMin: -5, yMax: 5 };
  // Clip the tails so one asymptote does not flatten everything else.
  const lo = ys[Math.floor(ys.length * 0.02)];
  const hi = ys[Math.floor(ys.length * 0.98)];
  let yMin = Math.min(lo, 0);
  let yMax = Math.max(hi, 0);
  if (yMax - yMin < 1e-6) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.12;
  yMin -= pad;
  yMax += pad;

  // Whatever the sampling concluded, the point being studied has to sit
  // comfortably inside the frame rather than on its edge.
  if (focus !== null) {
    const fa = fn.eval({ ...scope, [scene.varName]: focus });
    if (Number.isFinite(fa)) {
      const span = yMax - yMin;
      const lowest = yMin + span * 0.18;
      const highest = yMax - span * 0.18;
      if (fa < lowest || fa > highest) {
        yMin = fa - span / 2;
        yMax = fa + span / 2;
      }
    }
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return { xMin, xMax, yMin: -5, yMax: 5 };
  return { xMin, xMax, yMin, yMax };
}

export function defaults(scene: VizScene): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of scene.params) out[p.id] = p.value;
  return out;
}

/** The parameter the clock drives, if any. */
export function sweptParam(scene: VizScene): VizParam | null {
  return scene.params.find((p) => p.sweep) ?? null;
}

// ── builders: one per kind, and the only thing a new concept adds ───

type Builder = (
  scene: VizScene,
  fn: CompiledExpr,
  vals: Record<string, number>,
  view: Viewport,
  guarded: boolean
) => VizFrame;

const at = (
  fn: CompiledExpr,
  varName: string,
  vals: Record<string, number>,
  x: number
): number => fn.eval({ ...vals, [varName]: x });

// --- 1. a function, with whatever coefficients are live -------------

const buildFunction: Builder = (scene, fn, vals, view) => {
  const objects: VizObject[] = [
    { o: 'curve', id: 'f', pts: sampleCurve(fn, scene.varName, vals, view.xMin, view.xMax), tone: 'primary', width: 2 },
  ];
  const readouts: VizReadout[] = scene.params.map((p) => ({
    id: p.id,
    tex: p.id,
    value: fmtParam(p, vals[p.id]),
  }));
  // A marked point is only worth drawing when there is a reason to look there.
  if (typeof scene.a === 'number') {
    const y = at(fn, scene.varName, vals, scene.a);
    if (Number.isFinite(y)) {
      objects.push({ o: 'point', id: 'a', x: scene.a, y, tone: 'accent' });
      readouts.push({ id: 'fa', tex: `f(${fmt(scene.a)})`, value: fmt(y) });
    }
  }
  return {
    objects,
    readouts,
    caption: scene.params.length
      ? 'Move a coefficient and watch the shape answer.'
      : 'The function, drawn.',
  };
};

// --- 2. a limit: approach from both sides ---------------------------

const buildLimit: Builder = (scene, fn, vals, view, guarded) => {
  const a = scene.a ?? 0;
  const d = Math.abs(vals.d ?? 1);
  const varName = scene.varName;
  const left = a - d;
  const right = a + d;
  const yl = at(fn, varName, vals, left);
  const yr = at(fn, varName, vals, right);

  const objects: VizObject[] = [
    { o: 'curve', id: 'f', pts: sampleCurve(fn, varName, vals, view.xMin, view.xMax), tone: 'primary', width: 2 },
    { o: 'vrule', id: 'a', at: a, tone: 'muted', dashed: true, label: `${varName} = ${fmt(a)}` },
  ];

  // The two approaching points, and the drop lines that make "the value at
  // this x" a thing you can see rather than infer.
  for (const [id, x, y] of [
    ['L', left, yl],
    ['R', right, yr],
  ] as const) {
    if (!Number.isFinite(y)) continue;
    objects.push({ o: 'segment', id: `drop${id}`, x1: x, y1: 0, x2: x, y2: y, tone: 'ghost', dashed: true });
    objects.push({ o: 'segment', id: `run${id}`, x1: x, y1: y, x2: a, y2: y, tone: 'ghost', dashed: true });
    objects.push({ o: 'point', id: `p${id}`, x, y, tone: id === 'L' ? 'accent' : 'tension' });
  }

  const fa = at(fn, varName, vals, a);
  const defined = Number.isFinite(fa);
  // The distinction the whole picture exists to make: a hole is where the
  // limit and the value disagree. Drawn as a hollow point either way, because
  // whether f(a) exists is not the answer to "what is the limit".
  if (defined) {
    objects.push({ o: 'point', id: 'fa', x: a, y: fa, tone: 'muted', hollow: true });
  }

  const readouts: VizReadout[] = [
    { id: 'd', tex: '\\delta', value: fmt(d, 4) },
    { id: 'fl', tex: `f(${fmt(a)}^{-})`, value: Number.isFinite(yl) ? fmt(yl) : 'undefined' },
    { id: 'fr', tex: `f(${fmt(a)}^{+})`, value: Number.isFinite(yr) ? fmt(yr) : 'undefined' },
  ];

  // The limit itself is the answer. Estimated, not asserted: a numeric probe
  // agrees with a limit only when one exists, so we only ever draw it when the
  // two sides have already visibly met.
  const L = estimateLimit(fn, varName, vals, a);
  if (!guarded) {
    readouts.push({
      id: 'L',
      tex: `\\lim_{${varName} \\to ${fmt(a)}} f(${varName})`,
      value: L === null ? 'does not exist' : fmt(L),
    });
    if (L !== null) {
      objects.push({ o: 'hrule', id: 'Lrule', at: L, tone: 'accent', dashed: true, label: `L = ${fmt(L)}` });
    }
  } else {
    readouts.push({ id: 'L', tex: `\\lim_{${varName} \\to ${fmt(a)}} f(${varName})`, value: null });
  }

  const hole = defined && L !== null && Math.abs(fa - L) > 1e-6;
  return {
    objects,
    readouts,
    caption: hole
      ? `Both sides agree — and f(${fmt(a)}) is somewhere else entirely.`
      : defined
        ? `Squeeze δ toward 0 and watch both sides.`
        : `f(${fmt(a)}) is undefined. The limit need not be.`,
    ask: 'Both sides are heading somewhere. What value?',
  };
};

/**
 * A numeric estimate of the limit, or null if the sides disagree.
 *
 * Deliberately conservative: it probes closer and closer from both sides and
 * only reports a value when the two agree to a tight tolerance. It is a check
 * on what the picture already shows, never a substitute for it — and its
 * result is only ever shown once the guard is down.
 */
function estimateLimit(
  fn: CompiledExpr,
  varName: string,
  vals: Record<string, number>,
  a: number
): number | null {
  const probe = (sign: number) => {
    const out: number[] = [];
    for (let k = 3; k <= 7; k++) {
      const y = at(fn, varName, vals, a + sign * Math.pow(10, -k));
      if (Number.isFinite(y)) out.push(y);
    }
    return out;
  };
  const l = probe(-1);
  const r = probe(1);
  if (l.length < 3 || r.length < 3) return null;
  const lv = l[l.length - 1];
  const rv = r[r.length - 1];
  const scale = Math.max(1, Math.abs(lv), Math.abs(rv));
  if (Math.abs(lv - rv) > 1e-4 * scale) return null; // sides disagree
  // and it must be settling, not drifting
  if (Math.abs(l[0] - lv) > 0.5 * scale && Math.abs(l[1] - lv) > 0.4 * scale) return null;
  const mean = (lv + rv) / 2;
  const near = Math.round(mean * 1e6) / 1e6;
  return Number.isFinite(near) ? near : null;
}

// --- 3. the derivative: secant → tangent ----------------------------

const buildDerivative: Builder = (scene, fn, vals, view, guarded) => {
  const varName = scene.varName;
  const a = scene.a ?? 0;
  const h = vals.h ?? 1;
  const ya = at(fn, varName, vals, a);
  const xq = a + h;
  const yq = at(fn, varName, vals, xq);
  const slope = (yq - ya) / h;

  const objects: VizObject[] = [
    { o: 'curve', id: 'f', pts: sampleCurve(fn, varName, vals, view.xMin, view.xMax), tone: 'primary', width: 2 },
  ];

  // The rise and run, drawn as the two legs of the difference quotient. This
  // is the part that makes the formula stop being a formula.
  if (Number.isFinite(ya) && Number.isFinite(yq)) {
    objects.push({ o: 'segment', id: 'run', x1: a, y1: ya, x2: xq, y2: ya, tone: 'ghost', dashed: true });
    objects.push({ o: 'segment', id: 'rise', x1: xq, y1: ya, x2: xq, y2: yq, tone: 'ghost', dashed: true });
    objects.push({ o: 'label', id: 'hlab', x: (a + xq) / 2, y: ya, text: `h = ${fmt(h, 4)}`, tone: 'muted', anchor: 'middle', dy: 14 });
  }

  // The tangent is the ANSWER, so under the guard it is not drawn. What is
  // drawn is the secant, converging on it — the mechanism, without the result.
  if (!guarded && Number.isFinite(ya)) {
    const d = derivativeAt(fn, varName, vals, a);
    if (d !== null) {
      objects.push({ o: 'line', id: 'tangent', x: a, y: ya, slope: d, tone: 'accent', width: 2 });
    }
  }
  if (Number.isFinite(ya) && Number.isFinite(yq)) {
    objects.push({ o: 'line', id: 'secant', x: a, y: ya, slope, tone: 'tension', width: 1.5, dashed: guarded });
  }
  if (Number.isFinite(ya)) objects.push({ o: 'point', id: 'P', x: a, y: ya, tone: 'primary', label: 'P' });
  if (Number.isFinite(yq)) objects.push({ o: 'point', id: 'Q', x: xq, y: yq, tone: 'tension', label: 'Q' });

  const readouts: VizReadout[] = [
    { id: 'h', tex: 'h', value: fmt(h, 4) },
    {
      id: 'slope',
      // The secant slope is theirs — it is the arithmetic the picture is
      // teaching them to do, computed from two points they can both see.
      tex: `\\frac{f(${fmt(a)}+h)-f(${fmt(a)})}{h}`,
      value: Number.isFinite(slope) ? fmt(slope) : '—',
    },
  ];
  const d = derivativeAt(fn, varName, vals, a);
  readouts.push({
    id: 'fprime',
    tex: `f'(${fmt(a)})`,
    value: guarded ? null : d === null ? '—' : fmt(d),
  });

  return {
    objects,
    readouts,
    caption: `Q slides toward P. The secant has to become something.`,
    ask: 'Watch the slope, not the line. What number is it settling on?',
  };
};

/** A symmetric difference quotient at a tiny h — accurate and cheap. */
function derivativeAt(
  fn: CompiledExpr,
  varName: string,
  vals: Record<string, number>,
  a: number
): number | null {
  const step = Math.max(1e-6, Math.abs(a) * 1e-6);
  const f1 = at(fn, varName, vals, a + step);
  const f0 = at(fn, varName, vals, a - step);
  if (!Number.isFinite(f1) || !Number.isFinite(f0)) return null;
  const d = (f1 - f0) / (2 * step);
  if (!Number.isFinite(d)) return null;
  return Math.abs(d) < 1e-7 ? 0 : Math.round(d * 1e6) / 1e6;
}

// --- 4. Riemann sums → the definite integral ------------------------

const buildRiemann: Builder = (scene, fn, vals, view, guarded) => {
  const varName = scene.varName;
  const a = scene.a ?? view.xMin;
  const b = scene.b ?? view.xMax;
  const n = Math.max(1, Math.round(vals.n ?? 4));
  const rule = scene.rule ?? 'left';
  const w = (b - a) / n;

  const bars: { x0: number; x1: number; y: number }[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x0 = a + i * w;
    const x1 = x0 + w;
    const sx = rule === 'left' ? x0 : rule === 'right' ? x1 : (x0 + x1) / 2;
    const y = at(fn, varName, vals, sx);
    if (!Number.isFinite(y)) continue;
    bars.push({ x0, x1, y });
    sum += y * w;
  }

  const objects: VizObject[] = [
    { o: 'rects', id: 'bars', bars, tone: 'accent' },
    { o: 'curve', id: 'f', pts: sampleCurve(fn, varName, vals, view.xMin, view.xMax), tone: 'primary', width: 2 },
    { o: 'vrule', id: 'a', at: a, tone: 'muted', dashed: true, label: `${varName} = ${fmt(a)}` },
    { o: 'vrule', id: 'b', at: b, tone: 'muted', dashed: true, label: `${varName} = ${fmt(b)}` },
  ];

  const readouts: VizReadout[] = [
    { id: 'n', tex: 'n', value: String(n) },
    { id: 'w', tex: '\\Delta x', value: fmt(w, 4) },
    { id: 'sum', tex: `S_{n}`, value: Number.isFinite(sum) ? fmt(sum, 4) : '—' },
  ];

  // Simpson's rule on a fine grid: the exact value, and therefore the answer.
  const exact = integrate(fn, varName, vals, a, b);
  readouts.push({
    id: 'exact',
    tex: `\\int_{${fmt(a)}}^{${fmt(b)}} f(${varName})\\,d${varName}`,
    value: guarded ? null : exact === null ? '—' : fmt(exact, 4),
  });

  return {
    objects,
    readouts,
    caption: `${n} rectangle${n === 1 ? '' : 's'}, ${rule === 'midpoint' ? 'sampled at the middle' : `touching at the ${rule}`}.`,
    ask: 'Push n higher. What is the running total closing in on?',
  };
};

/** Composite Simpson's rule. Even panel count, so the pairs come out whole. */
function integrate(
  fn: CompiledExpr,
  varName: string,
  vals: Record<string, number>,
  a: number,
  b: number
): number | null {
  const n = 1000;
  const h = (b - a) / n;
  if (!Number.isFinite(h) || h === 0) return null;
  let total = 0;
  for (let i = 0; i <= n; i++) {
    const y = at(fn, varName, vals, a + i * h);
    if (!Number.isFinite(y)) return null; // a pole inside the interval
    total += y * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  const v = (total * h) / 3;
  return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
}

const KINDS: Record<VizKind, Builder> = {
  function: buildFunction,
  limit: buildLimit,
  derivative: buildDerivative,
  riemann: buildRiemann,
};

/**
 * One frame. Pure: the same scene and values always give the same picture,
 * which is what lets the animation be a clock over this rather than a pile of
 * mutable state.
 */
export function buildFrame(
  scene: VizScene,
  fn: CompiledExpr,
  vals: Record<string, number>,
  view: Viewport,
  guarded: boolean
): VizFrame {
  return KINDS[scene.kind](scene, fn, vals, view, guarded);
}

/** Compile a scene's expression over its variable and every parameter. */
export function compileScene(scene: VizScene): CompiledExpr | null {
  return compileExpr(scene.expr, [scene.varName, ...scene.params.map((p) => p.id)]);
}

// ── defaults ────────────────────────────────────────────────────────
//
// A model that says `{kind:'derivative', expr:'x^2', a:1}` and nothing else
// should get a correct, well-proportioned animation. Every kind's own
// parameter is filled in here when it is missing, so the extractor can stay
// terse and still be right.

const REQUIRED: Record<VizKind, (scene: VizScene) => VizParam[]> = {
  function: () => [],
  // δ and h open at a fraction of the window rather than a fixed 2. The second
  // point has to be ON SCREEN in the first frame: with a tight window around
  // the point of interest, a fixed starting h puts Q above the top edge and
  // the opening frame shows a line going nowhere.
  limit: (sc) => {
    const max = span(sc, 4, 2);
    return [{ id: 'd', symbol: '\\delta', min: max / 1500, max, step: max / 2000, value: max, sweep: 'down', toward: '0' }];
  },
  derivative: (sc) => {
    const max = span(sc, 5, 2.5);
    return [{ id: 'h', min: max / 1200, max, step: max / 2000, value: max, sweep: 'down', toward: '0' }];
  },
  riemann: () => [{ id: 'n', min: 1, max: 80, step: 1, value: 4, integer: true, sweep: 'up', toward: '\\infty' }],
};

/** A fraction of the x-window, capped, and never absurdly small. */
function span(scene: VizScene, divisor: number, cap: number): number {
  const w = scene.view.xMax - scene.view.xMin;
  return Math.max(0.05, Math.min(cap, w / divisor));
}

function withRequired(scene: VizScene): VizScene {
  const need = REQUIRED[scene.kind](scene);
  const have = new Set(scene.params.map((p) => p.id));
  const params = [...scene.params];
  for (const p of need) if (!have.has(p.id)) params.push(p);
  // Exactly one parameter may be swept, or the clock has two masters. The
  // kind's own parameter wins, since it is the one the animation is about.
  const swept = params.filter((p) => p.sweep);
  if (swept.length > 1) {
    const keep = need[0]?.id ?? swept[0].id;
    for (const p of params) if (p.sweep && p.id !== keep) delete p.sweep;
  }
  return { ...scene, params };
}

// ── sanitizer ───────────────────────────────────────────────────────

const MAX_PARAMS = 4;
const MAX_TITLE = 80;
const MAX_EXPR = 200;

const num = (v: any, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * Turn whatever the model returned into a scene we are willing to draw, or
 * null. Every path out of here is either a scene that compiles and renders, or
 * nothing — there is no partially-valid state for the renderer to cope with.
 *
 * Note what is NOT accepted: any prose the model wants shown. Captions and the
 * guard's question are generated by the builders, so the surface cannot be
 * talked into narrating an answer that Chat is withholding.
 */
export function sanitizeViz(raw: any): VizScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind: VizKind | null = VIZ_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) return null;

  const expr = typeof raw.expr === 'string' ? raw.expr.trim().slice(0, MAX_EXPR) : '';
  if (!expr) return null;

  const varName =
    typeof raw.varName === 'string' && /^[a-z]$/i.test(raw.varName.trim())
      ? raw.varName.trim().toLowerCase()
      : 'x';

  const rawParams: VizParam[] = (Array.isArray(raw.params) ? raw.params : [])
    .map((p: any): VizParam | null => {
      const id = typeof p?.id === 'string' ? p.id.trim().toLowerCase() : '';
      if (!/^[a-z][a-z0-9]?$/.test(id) || id === varName) return null;
      const min = num(p?.min, -1e4, 1e4, 0);
      const max = num(p?.max, -1e4, 1e4, 1);
      if (!(max > min)) return null;
      const integer = p?.integer === true;
      const step = integer ? 1 : num(p?.step, 1e-6, Math.max(1e-6, max - min), (max - min) / 100);
      return {
        id,
        min,
        max,
        step,
        value: num(p?.value, min, max, integer ? Math.round((min + max) / 2) : max),
        ...(integer ? { integer } : {}),
        ...(p?.sweep === 'down' || p?.sweep === 'up' ? { sweep: p.sweep } : {}),
        ...(typeof p?.toward === 'string' ? { toward: p.toward.slice(0, 12) } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_PARAMS) as VizParam[];

  // Dedupe by id — two sliders for the same name is a broken control surface.
  const seen = new Set<string>();
  const params = rawParams.filter((p) => !seen.has(p.id) && (seen.add(p.id), true));

  const xMin = num(raw?.view?.xMin, -1e4, 1e4, -6);
  const xMax = num(raw?.view?.xMax, -1e4, 1e4, 6);
  if (!(xMax > xMin)) return null;
  const yMin = typeof raw?.view?.yMin === 'number' ? num(raw.view.yMin, -1e5, 1e5, 0) : undefined;
  const yMax = typeof raw?.view?.yMax === 'number' ? num(raw.view.yMax, -1e5, 1e5, 0) : undefined;

  const scene: VizScene = withRequired({
    kind,
    expr,
    varName,
    view: {
      xMin,
      xMax,
      ...(typeof yMin === 'number' && typeof yMax === 'number' && yMax > yMin ? { yMin, yMax } : {}),
    },
    params,
    ...(typeof raw.a === 'number' && Number.isFinite(raw.a) ? { a: num(raw.a, -1e4, 1e4, 0) } : {}),
    ...(typeof raw.b === 'number' && Number.isFinite(raw.b) ? { b: num(raw.b, -1e4, 1e4, 1) } : {}),
    ...(raw.rule === 'left' || raw.rule === 'right' || raw.rule === 'midpoint' ? { rule: raw.rule } : {}),
    ...(typeof raw.title === 'string' && raw.title.trim()
      ? { title: raw.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) }
      : {}),
  });

  // The expression must compile over exactly the names we are prepared to
  // bind. An expression mentioning a name with no slider would evaluate to NaN
  // forever and draw an empty canvas, so it is rejected here instead.
  const known = new Set([scene.varName, ...scene.params.map((p) => p.id)]);
  if (freeNames(scene.expr).some((nm) => !known.has(nm))) return null;
  const fn = compileScene(scene);
  if (!fn) return null;
  if (!fn.vars.includes(scene.varName)) return null; // a constant is not a curve

  // An interval kind needs a real interval.
  if (scene.kind === 'riemann') {
    const a = scene.a ?? scene.view.xMin;
    const b = scene.b ?? scene.view.xMax;
    if (!(b > a)) return null;
    scene.a = a;
    scene.b = b;
  }
  if ((scene.kind === 'limit' || scene.kind === 'derivative') && typeof scene.a !== 'number') {
    scene.a = 0;
  }

  // Finally: it has to actually draw. A scene whose viewport comes out
  // degenerate would render NaN coordinates.
  const view = resolveView(scene, fn);
  if (!Number.isFinite(view.yMin) || !Number.isFinite(view.yMax) || !(view.yMax > view.yMin)) {
    return null;
  }
  return scene;
}
