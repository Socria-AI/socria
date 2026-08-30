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

import { compileExpr, freeNames, taylorCoeffs, type CompiledExpr } from './logos-math';

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
  /** plain language: what moving this slider does. Shown on click. */
  help?: string;
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
  /** many polylines drawn as ONE path — grids, direction fields */
  | { o: 'mesh'; id: string; lines: Pt[][]; tone?: Tone; width?: number }
  | { o: 'vrule'; id: string; at: number; tone?: Tone; dashed?: boolean; label?: string }
  | { o: 'hrule'; id: string; at: number; tone?: Tone; dashed?: boolean; label?: string }
  | { o: 'label'; id: string; x: number; y: number; text: string; tone?: Tone; anchor?: 'start' | 'middle' | 'end'; dy?: number };

/** Semantic colour roles, resolved to the Logos palette by the renderer. */
export type Tone =
  | 'primary'
  | 'accent'
  | 'tension'
  | 'muted'
  | 'ghost'
  /** the reader's own curves, distinct from Socria's teaching objects */
  | 'u1'
  | 'u2'
  | 'u3'
  | 'u4';

export const USER_TONES: Tone[] = ['u1', 'u2', 'u3', 'u4'];

export interface VizReadout {
  id: string;
  /** LaTeX for the quantity itself, e.g. \frac{f(a+h)-f(a)}{h} */
  tex: string;
  /**
   * Plain language: what this quantity IS, for someone who does not yet read
   * the notation. Shown on click. It must describe the quantity and never
   * disclose its value, so it is safe to show while the guard is up.
   */
  help?: string;
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
  /**
   * Plain words for what is happening at this moment, shown beside the plot
   * and changing as it animates — subtitles for the mathematics.
   *
   * Written by the builders, like every other piece of prose here, so it sits
   * next to the thing it describes. It changes on STAGE, not on frame: a line
   * rewritten sixty times a second is not readable, so the story advances a
   * handful of times across a run and holds still in between. And it narrates
   * the MOTION, never the destination — which is what lets it keep talking
   * while the Answer Guard is up.
   */
  narration?: string;
  /** one line under the canvas, describing what is happening right now */
  caption: string;
  /** while the guard is up: the noticing the visual is asking them to do */
  ask?: string;
}

// ── the scene ───────────────────────────────────────────────────────

export const VIZ_KINDS = [
  'function',
  'limit',
  'derivative',
  'riemann',
  'taylor',
  'sequence',
  'vectors',
  'matrix',
  'distribution',
  'ode',
] as const;
export type VizKind = (typeof VIZ_KINDS)[number];

/** The four everyone meets first; the editor leads with these. */
export const CORE_KINDS: VizKind[] = ['function', 'limit', 'derivative', 'riemann'];

/**
 * Kinds where x and y are the SAME kind of quantity, so a unit must render the
 * same length both ways. Under an unequal mapping a rotation looks like a
 * shear and every angle lies — fatal for exactly these pictures.
 */
export const SQUARE_KINDS = new Set<VizKind>(['matrix', 'vectors']);

/** Widen one axis of a viewport about its centre until units match pixels. */
/**
 * How far the window may be scaled before the picture stops meaning anything.
 * Past the lower bound the tick labels are float dust; past the upper one the
 * curve is a horizontal line.
 */
export const VIEW_MIN_SPAN = 1e-7;
export const VIEW_MAX_SPAN = 1e9;

/**
 * Scale a window about a fixed point — the operation behind every zoom, from
 * whichever direction it arrives: the wheel, the +/- buttons, the keyboard,
 * and a two-finger pinch.
 *
 * `factor` is applied to the window, not to the picture, so it reads
 * backwards from the gesture: spreading two fingers apart makes the window
 * SMALLER, and the caller passes a factor below 1.
 *
 * Returns null rather than a repaired window when the result is unusable.
 * Refusing is the right answer because the alternative is applying the part
 * that worked: a window that has collapsed along one axis only is harder to
 * recover from than one that simply did not move.
 */
export function scaleView(
  v: Viewport,
  cx: number,
  cy: number,
  factor: number
): Viewport | null {
  if (!Number.isFinite(factor) || factor <= 0) return null;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const next: Viewport = {
    xMin: cx + (v.xMin - cx) * factor,
    xMax: cx + (v.xMax - cx) * factor,
    yMin: cy + (v.yMin - cy) * factor,
    yMax: cy + (v.yMax - cy) * factor,
  };
  if (![next.xMin, next.xMax, next.yMin, next.yMax].every(Number.isFinite)) return null;
  const w = next.xMax - next.xMin;
  const h = next.yMax - next.yMin;
  if (w < VIEW_MIN_SPAN || h < VIEW_MIN_SPAN) return null;
  if (w > VIEW_MAX_SPAN || h > VIEW_MAX_SPAN) return null;
  return next;
}

export function squareView(view: Viewport, plotW: number, plotH: number): Viewport {
  const ux = plotW / (view.xMax - view.xMin);
  const uy = plotH / (view.yMax - view.yMin);
  if (!Number.isFinite(ux) || !Number.isFinite(uy) || Math.abs(ux - uy) < 1e-9) return view;
  if (ux > uy) {
    const span = plotW / uy;
    const cx = (view.xMin + view.xMax) / 2;
    return { ...view, xMin: cx - span / 2, xMax: cx + span / 2 };
  }
  const span = plotH / ux;
  const cy = (view.yMin + view.yMax) / 2;
  return { ...view, yMin: cy - span / 2, yMax: cy + span / 2 };
}

export const DISTS = ['normal', 'binomial', 'poisson', 'exponential'] as const;
export type DistName = (typeof DISTS)[number];

/**
 * Whether this kind's builder narrates.
 *
 * The layout has to reserve the narration column BEFORE the frame that
 * carries the words exists — the frame needs the viewport, which needs the
 * plot width, which needs to know whether a column was reserved. So the
 * answer comes from the kind rather than from the frame. Every builder
 * narrates today; a future one that does not goes in this set.
 */
const SILENT_KINDS = new Set<VizKind>();
export function kindNarrates(kind: VizKind): boolean {
  return !SILENT_KINDS.has(kind);
}

/** Kinds that draw an expression; the others carry their objects directly. */
export function kindNeedsExpr(kind: VizKind): boolean {
  return kind !== 'vectors' && kind !== 'matrix' && kind !== 'distribution';
}

/**
 * Whether this scene draws a curve of its OWN, as distinct from the reader's
 * overlays. A plain graphing session — "graph x², now add 2x+5" — is a
 * function scene with no expression of its own and everything in the overlay
 * list, so that every curve on it can be removed like any other. Without this
 * the first expression someone graphed would be the one they could never take
 * off again.
 */
export function sceneHasOwnCurve(scene: VizScene): boolean {
  return kindNeedsExpr(scene.kind) && !!scene.expr;
}

/** Is there anything at all to draw? */
export function sceneDraws(scene: VizScene): boolean {
  return sceneHasOwnCurve(scene) || !kindNeedsExpr(scene.kind) || !!scene.overlays?.length;
}

/**
 * A curve the reader put on the plot, as opposed to one the lesson drew.
 *
 * Overlays ride ON TOP of whatever scene is active, which is what makes
 * "also graph x²" additive rather than destructive: asking for a curve while
 * a limit is being demonstrated adds the curve and leaves the demonstration
 * standing. Because they live in the scene, they persist with the
 * conversation for free — the same row, the same sanitizer, the same save.
 */
export interface PlotExpression {
  id: string;
  /** in the evaluator's grammar, over the scene's variable and parameters */
  expr: string;
  /** what to call it in the legend; defaults to the expression itself */
  label?: string;
  visible: boolean;
  /** who put it there — the reader, or Socria while teaching */
  source: 'user' | 'socria';
}

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
  /** matrix: the 2×2 transformation, rows first: [[a, b], [c, d]] */
  matrix?: [[number, number], [number, number]];
  /** vectors: the arrows themselves; with exactly two, s·u + t·v is offered */
  vectors?: { x: number; y: number; label?: string }[];
  /** distribution: which family */
  dist?: DistName;
  /** sequence: also plot the partial sums S_m */
  partial?: boolean;
  /** function: ghost the curve at default parameter values for comparison */
  ghost?: boolean;
  /**
   * Curves the reader added. Additive to the scene's own drawing, never
   * instead of it. Undefined and empty mean different things: undefined is
   * "no opinion, keep what is there", empty is "cleared".
   */
  overlays?: PlotExpression[];
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
/** Ceiling on adaptive refinement, so a pathological curve cannot run away. */
const MAX_SAMPLES = 3200;
/** How many times one segment may be bisected. */
const SUB_DEPTH = 9;

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
  n = SAMPLES,
  view?: Viewport
): Pt[] {
  return sampleAdaptive((x) => fn.eval({ ...scope, [varName]: x }), xMin, xMax, n, view);
}

/**
 * Sample any x → y into a polyline, refining where it moves fastest.
 *
 * Split out from sampleCurve because the curves a builder computes itself —
 * a Taylor polynomial, say — need exactly the same treatment, and having two
 * samplers would mean fixing this twice.
 */
export function sampleAdaptive(
  evalAt: (x: number) => number,
  xMin: number,
  xMax: number,
  n = SAMPLES,
  view?: Viewport
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    pts.push({ x, y: evalAt(x) });
  }
  if (!view) return pts;

  // ── adaptive refinement ───────────────────────────────────────────
  //
  // A fixed number of evenly spaced samples is fine at rest and falls apart
  // when zoomed out. Zoom x² out by sixty notches and the arms leave the top
  // of the frame within a few units of the origin, so of 320 samples only
  // FOUR land anywhere visible — and the parabola renders as a handful of
  // 500-pixel straight segments, a jagged spike rather than a curve.
  //
  // So where a segment climbs more than a fraction of the window's height,
  // bisect it and look again. That puts samples where the curve is actually
  // moving, which is exactly where a polyline needs them, and leaves the flat
  // stretches alone.
  const span = view.yMax - view.yMin;
  if (!(span > 0)) return pts;
  const tol = span / 40; // ≈ 12px on a typical panel: below this the eye cannot tell
  const far = span * 1.5; // beyond here the curve is off-frame and unseeable

  let budget = MAX_SAMPLES - pts.length;
  const out: Pt[] = [];

  const refine = (a: Pt, b: Pt, depth: number) => {
    if (depth <= 0 || budget <= 0) return;
    const af = Number.isFinite(a.y);
    const bf = Number.isFinite(b.y);
    // One end defined and the other not: bisect toward the boundary so the
    // curve actually meets the edge of a pole instead of stopping short.
    const straddlesUndefined = af !== bf;
    if (!straddlesUndefined) {
      if (!af && !bf) return; // both undefined — nothing between them to draw
      // Both far off the same side of the frame: no visible detail between
      // them, so refining would only spend budget on invisible points.
      const aOut = a.y > view.yMax + far ? 1 : a.y < view.yMin - far ? -1 : 0;
      const bOut = b.y > view.yMax + far ? 1 : b.y < view.yMin - far ? -1 : 0;
      if (aOut !== 0 && aOut === bOut) return;
      if (Math.abs(b.y - a.y) <= tol) return; // already smooth enough
    }
    const mx = (a.x + b.x) / 2;
    if (!(mx > a.x && mx < b.x)) return; // float floor: cannot subdivide further
    const m: Pt = { x: mx, y: evalAt(mx) };
    budget--;
    refine(a, m, depth - 1);
    out.push(m);
    refine(m, b, depth - 1);
  };

  for (let i = 0; i < pts.length - 1; i++) {
    out.push(pts[i]);
    refine(pts[i], pts[i + 1], SUB_DEPTH);
  }
  out.push(pts[pts.length - 1]);
  return out;
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

function specialView(
  scene: VizScene,
  fn: CompiledExpr | null,
  scope: Record<string, number>
): Viewport | null {
  const pad = (lo: number, hi: number): [number, number] => {
    if (hi - lo < 1e-6) return [lo - 1, hi + 1];
    const p = (hi - lo) * 0.12;
    return [lo - p, hi + p];
  };

  if (scene.kind === 'sequence') {
    const mMax = scene.params.find((p) => p.id === 'm')?.max ?? 48;
    if (!fn) return null;
    let lo = 0;
    let hi = 0;
    let S = 0;
    for (let i = 1; i <= mMax; i++) {
      const a = fn.eval({ ...scope, n: i });
      if (Number.isFinite(a)) {
        lo = Math.min(lo, a);
        hi = Math.max(hi, a);
        S += a;
        if (scene.partial) {
          lo = Math.min(lo, S);
          hi = Math.max(hi, S);
        }
      }
    }
    const [yMin, yMax] = pad(lo, hi);
    return { xMin: 0, xMax: mMax + 1, yMin, yMax };
  }

  if (scene.kind === 'vectors') {
    const vs = scene.vectors ?? [];
    if (!vs.length) return null;
    // Room for every vector, and for the combination at full slider throw.
    const reach = vs.length === 2
      ? 2 * (Math.hypot(vs[0].x, vs[0].y) + Math.hypot(vs[1].x, vs[1].y))
      : Math.max(...vs.map((v) => Math.hypot(v.x, v.y)));
    const r = Math.max(1, reach) * 1.15;
    return { xMin: -r, xMax: r, yMin: -r, yMax: r };
  }

  if (scene.kind === 'matrix') {
    const A = scene.matrix;
    if (!A) return null;
    // The 4×4 lattice under A: its corners bound everything drawn.
    const R = 4;
    const corners = [
      { x: R, y: R },
      { x: R, y: -R },
      { x: -R, y: R },
      { x: -R, y: -R },
    ].map((p) => ({ x: A[0][0] * p.x + A[0][1] * p.y, y: A[1][0] * p.x + A[1][1] * p.y }));
    const r = Math.min(14, Math.max(R + 0.5, ...corners.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))));
    return { xMin: -r, xMax: r, yMin: -r, yMax: r };
  }

  if (scene.kind === 'distribution') {
    if (!scene.dist) return null;
    const spec = distSpec(scene.dist, scope);
    if (!spec) return null;
    const [lo, hi] = spec.support;
    let peak = 0;
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const x = spec.discrete ? Math.round(lo + ((hi - lo) * i) / N) : lo + ((hi - lo) * i) / N;
      peak = Math.max(peak, spec.pdf(x));
    }
    const m = spec.discrete ? 0.8 : (hi - lo) * 0.04;
    return { xMin: lo - m, xMax: hi + m, yMin: 0, yMax: Math.max(peak, 1e-6) * 1.15 };
  }

  if (scene.kind === 'ode') {
    // A field needs a fixed frame in BOTH axes; sampling a trajectory to pick
    // one would move the goalposts with y₀.
    return { xMin: scene.view.xMin, xMax: scene.view.xMax, yMin: -4, yMax: 4 };
  }

  return null;
}

export function resolveView(scene: VizScene, fn: CompiledExpr | null): Viewport {
  const { xMin, xMax } = scene.view;
  if (typeof scene.view.yMin === 'number' && typeof scene.view.yMax === 'number') {
    return { xMin, xMax, yMin: scene.view.yMin, yMax: scene.view.yMax };
  }
  const scope = defaults(scene);

  // Kinds whose window is a property of their OBJECTS, not of a sampled
  // curve. Each is computed from the scene's defaults and then holds still,
  // for the same reason as everywhere else: a breathing window hides motion.
  const special = specialView(scene, fn, scope);
  if (special) return special;

  if (!fn) {
    // No curve of its own: the window comes from the reader's overlays alone.
    const ys: number[] = [];
    for (const ov of scene.overlays ?? []) {
      if (!ov.visible) continue;
      const ofn = compileExpr(ov.expr, [scene.varName, ...scene.params.map((p) => p.id)]);
      if (!ofn) continue;
      for (const p of sampleCurve(ofn, scene.varName, scope, xMin, xMax, 160)) {
        if (Number.isFinite(p.y)) ys.push(p.y);
      }
    }
    if (ys.length < 8) return { xMin, xMax, yMin: -5, yMax: 5 };
    ys.sort((a, b) => a - b);
    let lo = Math.min(ys[Math.floor(ys.length * 0.03)], 0);
    let hi = Math.max(ys[Math.floor(ys.length * 0.97)], 0);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const pd = (hi - lo) * 0.12;
    return { xMin, xMax, yMin: lo - pd, yMax: hi + pd };
  }

  // A tangent forming, or two sides of a limit closing, is a LOCAL event. Ask
  // what the function does across the whole window and x^2 on [-1.5, 4] answers
  // "0 to 16", which squashes the action at (1, 1) into the bottom twentieth of
  // the panel. So for the kinds built around a point of interest, the window
  // follows the neighbourhood of that point instead, and the curve is simply
  // allowed to leave the top of the frame — which is what graphs do.
  const focus =
    (scene.kind === 'derivative' || scene.kind === 'limit' || scene.kind === 'taylor') &&
    typeof scene.a === 'number'
      ? scene.a
      : null;
  const halfSpan = (xMax - xMin) / 4;
  let [sMin, sMax] =
    focus === null
      ? [xMin, xMax]
      : [Math.max(xMin, focus - halfSpan), Math.min(xMax, focus + halfSpan)];

  // A secant needs both of its ends. Q starts at a + h, which for a steep
  // function can sit well above a window drawn from the neighbourhood alone —
  // and an opening frame with one end of the construction missing does not
  // read as a construction at all.
  if (scene.kind === 'derivative' && focus !== null) {
    sMax = Math.max(sMax, Math.min(xMax, focus + span(scene, 5, 2.5)));
  }

  const ys = sampleCurve(fn, scene.varName, scope, sMin, sMax, 200)
    .map((p) => p.y)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);

  // A reader's curve that leaves the frame the moment it is added is not much
  // of an answer to "graph this", so visible overlays get a vote on the
  // window — a modest one, via the same percentile clip.
  for (const ov of scene.overlays ?? []) {
    if (!ov.visible) continue;
    const ofn = compileExpr(ov.expr, [scene.varName, ...scene.params.map((p) => p.id)]);
    if (!ofn) continue;
    const oy = sampleCurve(ofn, scene.varName, scope, sMin, sMax, 120)
      .map((p) => p.y)
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    if (oy.length > 8) {
      ys.push(oy[Math.floor(oy.length * 0.1)], oy[Math.floor(oy.length * 0.9)]);
      ys.sort((a, b) => a - b);
    }
  }
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

  // Last word: the construction's own points must be inside the frame. The
  // percentile clip and the recentring above are both heuristics over samples,
  // and either can leave Q just outside the top — so this expands (never
  // shrinks) to take in the points the picture is actually about.
  if (focus !== null) {
    const must: number[] = [fnAt(fn, scene.varName, scope, focus)];
    if (scene.kind === 'derivative') {
      must.push(fnAt(fn, scene.varName, scope, focus + span(scene, 5, 2.5)));
    }
    for (const y of must) {
      if (!Number.isFinite(y)) continue;
      const margin = (yMax - yMin) * 0.06;
      if (y > yMax - margin) yMax = y + margin;
      if (y < yMin + margin) yMin = y - margin;
    }
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return { xMin, xMax, yMin: -5, yMax: 5 };
  return { xMin, xMax, yMin, yMax };
}

function fnAt(
  fn: CompiledExpr,
  varName: string,
  scope: Record<string, number>,
  x: number
): number {
  return fn.eval({ ...scope, [varName]: x });
}

export function defaults(scene: VizScene): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of scene.params) out[p.id] = p.value;
  return out;
}

/**
 * Which part of the story a swept parameter is in. Deliberately coarse: four
 * stages over a whole run, so the words beside the plot change a few times
 * rather than strobing.
 *
 * Measured in the animation's own pacing (sweepProgress), not linearly in the
 * value, so "half way through" means half way through what you are watching —
 * h → 0 moves geometrically and the stages follow it.
 */
export function sweepStage(p: VizParam | null, v: number): 0 | 1 | 2 | 3 {
  if (!p) return 0;
  const t = sweepProgress(p, v);
  return t < 0.18 ? 0 : t < 0.55 ? 1 : t < 0.9 ? 2 : 3;
}

/** The parameter the clock drives, if any. */
export function sweptParam(scene: VizScene): VizParam | null {
  return scene.params.find((p) => p.sweep) ?? null;
}

// ── builders: one per kind, and the only thing a new concept adds ───

type Builder = (
  scene: VizScene,
  fn: CompiledExpr | null,
  vals: Record<string, number>,
  view: Viewport,
  guarded: boolean
) => VizFrame;

const EMPTY_FRAME: VizFrame = { objects: [], readouts: [], caption: '' };

const at = (
  fn: CompiledExpr,
  varName: string,
  vals: Record<string, number>,
  x: number
): number => fn.eval({ ...vals, [varName]: x });

// --- 1. a function, with whatever coefficients are live -------------

const buildFunction: Builder = (scene, fn, vals, view) => {
  const objects: VizObject[] = [];
  if (!fn) {
    // Overlays only: the reader's plot. buildFrame appends their curves, so
    // the frame is theirs entirely and this contributes just the caption.
    const n = (scene.overlays ?? []).filter((o) => o.visible).length;
    return {
      objects,
      readouts: [],
      caption: n
        ? `${n} expression${n === 1 ? '' : 's'} on the plot.`
        : 'Nothing plotted yet.',
    };
  }
  // Transformations teach by comparison: when asked to, keep the curve at its
  // default parameters underneath, so "what did my change do" has a referent.
  if (scene.ghost && scene.params.length) {
    const base = defaults(scene);
    if (scene.params.some((p) => base[p.id] !== vals[p.id])) {
      objects.push({
        o: 'curve',
        id: 'ghost',
        pts: sampleCurve(fn, scene.varName, base, view.xMin, view.xMax, SAMPLES, view),
        tone: 'ghost',
        width: 1.4,
        dashed: true,
      });
    }
  }
  objects.push({
    o: 'curve',
    id: 'f',
    pts: sampleCurve(fn, scene.varName, vals, view.xMin, view.xMax, SAMPLES, view),
    tone: 'primary',
    width: 2,
  });
  const readouts: VizReadout[] = scene.params.map((p) => ({
    id: p.id,
    tex: p.id,
    value: fmtParam(p, vals[p.id]),
    help: p.help ?? `The current value of ${p.id}. Drag its slider and watch which part of the shape answers.`,
  }));
  // A marked point is only worth drawing when there is a reason to look there.
  if (typeof scene.a === 'number') {
    const y = at(fn, scene.varName, vals, scene.a);
    if (Number.isFinite(y)) {
      objects.push({ o: 'point', id: 'a', x: scene.a, y, tone: 'accent' });
      readouts.push({
        id: 'fa',
        tex: `f(${fmt(scene.a)})`,
        value: fmt(y),
        help: `The height of the curve at ${scene.varName} = ${fmt(scene.a)} — where the marked point sits.`,
      });
    }
  }
  return {
    objects,
    readouts,
    narration: scene.params.length
      ? 'Each slider is one letter in the expression. Move one and watch which part of the shape answers — and which parts do not.'
      : 'The function, drawn over this window.',
    caption: scene.params.length
      ? 'Move a coefficient and watch the shape answer.'
      : 'The function, drawn.',
  };
};

// --- 2. a limit: approach from both sides ---------------------------

/**
 * A one-sided limit, honestly typed. "The function got big" and "the function
 * never settled" are different answers, and a picture that renders both as
 * "does not exist" teaches less than one that names them.
 */
type SideLimit =
  | { kind: 'value'; v: number }
  | { kind: 'infinite'; sign: 1 | -1 }
  | { kind: 'none' };

function sideText(s: SideLimit): string {
  if (s.kind === 'value') return fmt(s.v, 5);
  if (s.kind === 'infinite') return s.sign > 0 ? '+∞' : '−∞';
  return 'does not exist';
}

/**
 * What f approaches as x → a from one side.
 *
 * This is NOT the same quantity as f(a ± δ) for the δ currently on the
 * slider, and conflating the two was a real bug here: at δ = 2 the reading
 * f(3 − δ) = 7 for 2x + 5, while the left-hand limit is 11. One is a
 * measurement off the graph; the other is where the measurements are going.
 *
 * Probes at shrinking offsets, then Richardson-extrapolates: for error linear
 * in h — the common case, and exact for a linear function — L = (10·y(h/10) −
 * y(h))/9 lands ON the limit rather than near it, so 2x + 5 at 3 reports 11
 * and not 10.999994. The extrapolation is discarded if it disagrees wildly
 * with the last probe, which is what float noise looks like.
 */
function oneSidedLimit(
  fn: CompiledExpr,
  varName: string,
  vals: Record<string, number>,
  a: number,
  side: -1 | 1
): SideLimit {
  const scale = Math.max(1, Math.abs(a));
  const hs = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6].map((h) => h * scale);
  const ys = hs.map((h) => at(fn, varName, vals, a + side * h));

  // Undefined anywhere along the approach: nothing to say about this side.
  if (ys.some((y) => Number.isNaN(y))) return { kind: 'none' };

  const last = ys[ys.length - 1];
  const prev = ys[ys.length - 2];

  // Growing without bound in a consistent direction is a real answer, and a
  // more useful one than "does not exist".
  const sameSign = ys.every((y) => y === 0 || Math.sign(y) === Math.sign(last || prev));
  const blowingUp =
    sameSign && Math.abs(last) > 1e5 * scale && Math.abs(last) > Math.abs(prev) * 2;
  if (blowingUp || !Number.isFinite(last)) {
    const witness = Number.isFinite(last) ? last : prev;
    if (!Number.isFinite(witness)) return { kind: 'none' };
    if (!blowingUp && Number.isFinite(last)) return { kind: 'none' };
    return { kind: 'infinite', sign: witness > 0 ? 1 : -1 };
  }
  if (!ys.every(Number.isFinite)) return { kind: 'none' };

  // Settling: the last probes must agree AND the gaps must be closing.
  // sin(1/x) passes neither test.
  const mag = Math.max(1, Math.abs(last));
  if (Math.abs(last - prev) > 1e-3 * mag) return { kind: 'none' };
  if (Math.abs(ys[2] - ys[3]) < Math.abs(ys[3] - last) * 0.9) return { kind: 'none' };

  const extrap = (10 * last - prev) / 9;
  const v = Number.isFinite(extrap) && Math.abs(extrap - last) < 0.1 * mag ? extrap : last;
  return { kind: 'value', v: Math.abs(v) < 1e-9 * mag ? 0 : Math.round(v * 1e9) / 1e9 };
}

/** The two-sided limit follows from the two sides, and only from them. */
function twoSidedLimit(l: SideLimit, r: SideLimit): SideLimit {
  if (l.kind === 'value' && r.kind === 'value') {
    const tol = 1e-6 * Math.max(1, Math.abs(l.v), Math.abs(r.v));
    return Math.abs(l.v - r.v) <= tol ? { kind: 'value', v: (l.v + r.v) / 2 } : { kind: 'none' };
  }
  if (l.kind === 'infinite' && r.kind === 'infinite' && l.sign === r.sign) return l;
  return { kind: 'none' };
}

const buildLimit: Builder = (scene, fn, vals, view, guarded) => {
  if (!fn) return EMPTY_FRAME;
  const a = scene.a ?? 0;
  const d = Math.abs(vals.d ?? 1);
  const varName = scene.varName;
  const left = a - d;
  const right = a + d;
  const yl = at(fn, varName, vals, left);
  const yr = at(fn, varName, vals, right);

  const objects: VizObject[] = [
    { o: 'curve', id: 'f', pts: sampleCurve(fn, varName, vals, view.xMin, view.xMax, SAMPLES, view), tone: 'primary', width: 2 },
    { o: 'vrule', id: 'a', at: a, tone: 'muted', dashed: true, label: `${varName} = ${fmt(a)}` },
  ];

  // The two sample points and their guides. The horizontal guide runs from the
  // axis out to its own dot and carries the value at its left end, so each
  // reading is legible against the y-axis and directly comparable with the
  // limit line — which is what makes the squeeze visible as a squeeze. Running
  // it only as far as x = a, as this did, left the two readings floating with
  // nothing to measure them against.
  // Formatted ONCE, and used by both the guide label on the plot and the
  // readout below it. Two calls with two precisions is how "13.0007" ends up
  // on the line while "13.00067" sits in the readout — the same number,
  // disagreeing with itself.
  const lTxt = Number.isFinite(yl) ? fmt(yl, 5) : 'undefined';
  const rTxt = Number.isFinite(yr) ? fmt(yr, 5) : 'undefined';

  const span = view.yMax - view.yMin;
  // Once the two readings have all but met, their labels would sit on top of
  // each other and on the limit line. At that point the picture has already
  // made its point and the readouts carry the numbers, so the labels go.
  const converged =
    Number.isFinite(yl) && Number.isFinite(yr) && Math.abs(yl - yr) < span * 0.04;
  const labelX = view.xMin + (view.xMax - view.xMin) * 0.012;

  for (const [id, x, y, txt] of [
    ['L', left, yl, lTxt],
    ['R', right, yr, rTxt],
  ] as const) {
    if (!Number.isFinite(y)) continue;
    const tone: Tone = id === 'L' ? 'accent' : 'tension';
    objects.push({ o: 'segment', id: `drop${id}`, x1: x, y1: 0, x2: x, y2: y, tone: 'ghost', dashed: true });
    objects.push({ o: 'segment', id: `run${id}`, x1: view.xMin, y1: y, x2: x, y2: y, tone: 'ghost', dashed: true });
    if (!converged) {
      objects.push({
        o: 'label',
        id: `val${id}`,
        x: labelX,
        y,
        text: txt,
        tone,
        anchor: 'start',
        dy: -5,
      });
    }
    objects.push({ o: 'point', id: `p${id}`, x, y, tone });
  }

  const fa = at(fn, varName, vals, a);
  const defined = Number.isFinite(fa);
  if (defined) {
    objects.push({ o: 'point', id: 'fa', x: a, y: fa, tone: 'muted', hollow: true });
  }

  const Ln = oneSidedLimit(fn, varName, vals, a, -1);
  const Rn = oneSidedLimit(fn, varName, vals, a, 1);
  const Two = twoSidedLimit(Ln, Rn);

  // FOUR distinct quantities, and the entire point of this lens is that they
  // are not interchangeable: where you are sampling, what you read there,
  // where each side is heading, and whether those two agree.
  const readouts: VizReadout[] = [
    {
      id: 'd',
      tex: '\\delta',
      value: fmt(d, 4),
      help: 'How far out from the point you are sampling. Drag it toward 0 to bring both readings in closer.',
    },
    {
      id: 'fl',
      tex: `f(${fmt(a)} - \\delta)`,
      value: lTxt,
      help: `The height of the curve at ${varName} = ${fmt(a)} − δ, to the left. This is a reading off the graph at the δ you have right now — not the limit. Watch it move as δ shrinks.`,
    },
    {
      id: 'fr',
      tex: `f(${fmt(a)} + \\delta)`,
      value: rTxt,
      help: 'The same reading from the right-hand side. As δ shrinks these two close in on each other — or they do not, which tells you just as much.',
    },
  ];

  // The limits are the answer, so the guard holds all three.
  readouts.push(
    {
      id: 'limL',
      tex: `\\lim_{${varName} \\to ${fmt(a)}^{-}} f(${varName})`,
      value: guarded ? null : sideText(Ln),
      help: 'The single height the curve is heading for as you come in from the left. Not the reading at any particular δ — the value all those readings are closing in on.',
    },
    {
      id: 'limR',
      tex: `\\lim_{${varName} \\to ${fmt(a)}^{+}} f(${varName})`,
      value: guarded ? null : sideText(Rn),
      help: 'The same thing, coming in from the right.',
    },
    {
      id: 'L',
      tex: `\\lim_{${varName} \\to ${fmt(a)}} f(${varName})`,
      value: guarded ? null : sideText(Two),
      help: 'The two-sided limit. It exists only when both sides head for the same place, so it is really the two lines above agreeing with each other.',
    }
  );

  if (!guarded) {
    if (Two.kind === 'value') {
      objects.push({ o: 'hrule', id: 'Lrule', at: Two.v, tone: 'accent', dashed: true, label: `L = ${fmt(Two.v)}` });
      // An open circle at (a, L) is the textbook picture of a removable
      // discontinuity: the limit is there even though the function is not.
      if (!defined) objects.push({ o: 'point', id: 'hole', x: a, y: Two.v, tone: 'accent', hollow: true });
    } else if (Ln.kind === 'value' && Rn.kind === 'value') {
      // A jump: two open circles, which is what makes it read as a jump
      // rather than as a broken drawing.
      objects.push({ o: 'point', id: 'jl', x: a, y: Ln.v, tone: 'accent', hollow: true });
      objects.push({ o: 'point', id: 'jr', x: a, y: Rn.v, tone: 'tension', hollow: true });
    }
  }

  const sidesDiffer = Ln.kind === 'value' && Rn.kind === 'value' && Two.kind === 'none';
  const blowsUp = Ln.kind === 'infinite' || Rn.kind === 'infinite';
  const removable = !defined && Two.kind === 'value';
  const hole = defined && Two.kind === 'value' && Math.abs(fa - Two.v) > 1e-6;

  const stage = sweepStage(scene.params.find((p) => p.id === 'd') ?? null, d);
  const narration =
    stage === 0
      ? `δ is wide, so the two points sit a long way either side of ${varName} = ${fmt(a)}. Their heights are nowhere near each other.`
      : stage === 1
        ? `δ is shrinking. Both points are sliding in toward ${varName} = ${fmt(a)}, and the two heights are moving with them.`
        : stage === 2
          ? 'The gap between the two heights is closing. Keep an eye on it rather than on the points.'
          : sidesDiffer
            ? 'δ is almost nothing, and the two heights have still not met. They are heading for different places.'
            : blowsUp
              ? 'δ is almost nothing, and the curve is still running away. There is no height for it to settle on.'
              : 'δ is almost nothing now, and both sides have arrived at the same place.';

  return {
    objects,
    readouts,
    narration,
    caption: sidesDiffer
      ? 'The two sides are heading to different places. There is nothing for them to agree on.'
      : blowsUp
        ? `The curve runs away near ${varName} = ${fmt(a)}. No finite height to close on.`
        : hole
          ? `Both sides agree — and f(${fmt(a)}) is somewhere else entirely.`
          : removable
            ? `f(${fmt(a)}) is undefined, and the limit does not care.`
            : 'Squeeze δ toward 0 and watch both readings.',
    ask: 'The two readings are moving. What single number are they closing in on?',
  };
};

// --- 3. the derivative: secant → tangent ----------------------------

const buildDerivative: Builder = (scene, fn, vals, view, guarded) => {
  if (!fn) return EMPTY_FRAME;
  const varName = scene.varName;
  const a = scene.a ?? 0;
  const h = vals.h ?? 1;
  const ya = at(fn, varName, vals, a);
  const xq = a + h;
  const yq = at(fn, varName, vals, xq);
  const slope = (yq - ya) / h;

  const objects: VizObject[] = [
    { o: 'curve', id: 'f', pts: sampleCurve(fn, varName, vals, view.xMin, view.xMax, SAMPLES, view), tone: 'primary', width: 2 },
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
    {
      id: 'h',
      tex: 'h',
      value: fmt(h, 4),
      help: 'The horizontal gap from P to Q. It is the only thing moving here.',
    },
    {
      id: 'slope',
      // The secant slope is theirs — it is the arithmetic the picture is
      // teaching them to do, computed from two points they can both see.
      tex: `\\frac{f(${fmt(a)}+h)-f(${fmt(a)})}{h}`,
      value: Number.isFinite(slope) ? fmt(slope) : '—',
      help: 'Rise over run between the two points: how steep the straight line through P and Q is. This is the average rate of change across the gap, not the rate at P.',
    },
  ];
  const d = derivativeAt(fn, varName, vals, a);
  readouts.push({
    id: 'fprime',
    tex: `f'(${fmt(a)})`,
    value: guarded ? null : d === null ? '—' : fmt(d),
    help: `The derivative at ${fmt(a)}: how steep the curve is at that exact point, with no gap at all. It is what the rise-over-run above is closing in on.`,
  });

  const dstage = sweepStage(scene.params.find((p) => p.id === 'h') ?? null, h);
  return {
    objects,
    readouts,
    narration:
      dstage === 0
        ? 'Q is far from P, so the straight line through them cuts right across the curve. Its steepness is an average over that whole gap.'
        : dstage === 1
          ? 'h is shrinking, so Q is sliding down the curve toward P. The line is pivoting as it goes.'
          : dstage === 2
            ? 'The two points are close now, and the line barely cuts across the curve any more. Watch the number, not the line.'
            : 'Q has all but landed on P. The line has stopped turning — whatever its steepness is now, that is what it was heading for.',
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
  if (!fn) return EMPTY_FRAME;
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
    { o: 'curve', id: 'f', pts: sampleCurve(fn, varName, vals, view.xMin, view.xMax, SAMPLES, view), tone: 'primary', width: 2 },
    { o: 'vrule', id: 'a', at: a, tone: 'muted', dashed: true, label: `${varName} = ${fmt(a)}` },
    { o: 'vrule', id: 'b', at: b, tone: 'muted', dashed: true, label: `${varName} = ${fmt(b)}` },
  ];

  const readouts: VizReadout[] = [
    { id: 'n', tex: 'n', value: String(n), help: 'How many rectangles the interval is cut into.' },
    {
      id: 'w',
      tex: '\\Delta x',
      value: fmt(w, 4),
      help: 'The width of one rectangle — the interval divided by n.',
    },
    {
      id: 'sum',
      tex: `S_{n}`,
      value: Number.isFinite(sum) ? fmt(sum, 4) : '—',
      help: 'Add up every rectangle: height times width, n times over. An estimate of the area, and one you could do by hand.',
    },
  ];

  // Simpson's rule on a fine grid: the exact value, and therefore the answer.
  const exact = integrate(fn, varName, vals, a, b);
  readouts.push({
    id: 'exact',
    tex: `\\int_{${fmt(a)}}^{${fmt(b)}} f(${varName})\\,d${varName}`,
    value: guarded ? null : exact === null ? '—' : fmt(exact, 4),
    help: 'The exact area under the curve between the two ends — what the rectangle total is closing in on as n grows.',
  });

  const rstage = sweepStage(scene.params.find((p) => p.id === 'n') ?? null, n);
  return {
    objects,
    readouts,
    // No live counter in the words: interpolating n would rewrite the same
    // sentence on every step of the sweep, which reads as a flicker rather
    // than as a line of commentary. The count is in the readout below.
    narration:
      rstage === 0
        ? 'Only a few rectangles, and each one is wide. Look along the top — every rectangle misses a good deal of the curve.'
        : rstage === 1
          ? 'More rectangles now, each thinner than the last. The staircase is following the curve more closely.'
          : rstage === 2
            ? 'The steps are small, and the gaps along the top are getting hard to see. The running total is barely moving.'
            : 'The rectangles are so thin the staircase is hard to tell from the curve itself. The total has all but stopped changing.',
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

// --- 5. Taylor: the polynomial closing on the function ---------------

const buildTaylor: Builder = (scene, fn, vals, view, guarded) => {
  if (!fn) return EMPTY_FRAME;
  const varName = scene.varName;
  const a = scene.a ?? 0;
  const rawK = vals.k;
  // Math.round propagates NaN, and a NaN k must degrade to the empty picture,
  // not crash the frame builder.
  const k = Number.isFinite(rawK) ? Math.max(0, Math.round(rawK)) : 1;
  const scope: Record<string, number> = {};
  for (const p of scene.params) if (p.id !== 'k') scope[p.id] = vals[p.id];

  // Exact coefficients via series AD — never finite differences.
  const coeffs = taylorCoeffs(scene.expr, varName, scope, a, k);
  const objects: VizObject[] = [
    { o: 'curve', id: 'f', pts: sampleCurve(fn, varName, vals, view.xMin, view.xMax, SAMPLES, view), tone: 'primary', width: 2 },
  ];
  const readouts: VizReadout[] = [
    { id: 'k', tex: 'k', value: String(k), help: 'The degree: the highest power the polynomial is allowed to use.' },
  ];

  if (coeffs) {
    const P = (x: number) => {
      let acc = 0;
      for (let i = coeffs.length - 1; i >= 0; i--) acc = acc * (x - a) + coeffs[i];
      return acc;
    };
    // Through the same adaptive sampler as every other curve: a high-degree
    // polynomial leaves the frame even faster than the function it is chasing,
    // and drawn on a uniform grid it comes out as the same jagged spike.
    const pts = sampleAdaptive(P, view.xMin, view.xMax, SAMPLES, view);
    let worst = 0;
    for (const pt of pts) {
      const fy = at(fn, varName, vals, pt.x);
      if (Number.isFinite(fy) && Number.isFinite(pt.y)) worst = Math.max(worst, Math.abs(fy - pt.y));
    }
    objects.push({ o: 'curve', id: 'P', pts, tone: 'accent', width: 1.8 });
    const fa = at(fn, varName, vals, a);
    if (Number.isFinite(fa)) objects.push({ o: 'point', id: 'a', x: a, y: fa, tone: 'muted' });

    // The error is the convergence story; the coefficient is the answer.
    readouts.push({
      id: 'err',
      tex: `\\max\\,|f - P_{${k}}|`,
      value: Number.isFinite(worst) ? fmt(worst, 4) : '—',
      help: 'The widest gap between the real function and the polynomial anywhere in this window. Near the centre it is tiny; the gap is what opens up as you move away.',
    });
    readouts.push({
      id: 'ck',
      tex: `c_{${k}}`,
      value: guarded ? null : fmt(coeffs[k], 5),
      help: 'The number multiplying the newest term. It comes from the k-th derivative at the centre, divided by k factorial.',
    });
  }

  const tstage = sweepStage(scene.params.find((p) => p.id === 'k') ?? null, k);
  return {
    objects,
    readouts,
    narration: !coeffs
      ? 'This function has no polynomial like this at that point, so there is nothing to build.'
      : tstage === 0
        ? `Low degree. It is exactly right at ${varName} = ${fmt(a)} and starts drifting away almost immediately.`
        : tstage === 1
          ? 'Each new term buys a little more of the curve on either side of the centre.'
          : tstage === 2
            ? 'The polynomial is tracking the function well across the middle now, and still peels off at the edges.'
            : 'It follows the function a long way before it leaves — but it always leaves eventually. The centre is all it ever knew.',
    caption: coeffs
      ? `Degree ${k}. The polynomial only knows the function through the point ${varName} = ${fmt(a)}.`
      : 'This function has no Taylor series at that point.',
    ask: 'Raise the degree. Where does the polynomial stop lying?',
  };
};

// --- 6. Sequences and series ----------------------------------------

const buildSequence: Builder = (scene, fn, vals, view, guarded) => {
  if (!fn) return EMPTY_FRAME;
  const m = Math.max(1, Math.round(vals.m ?? 6));
  const scope: Record<string, number> = {};
  for (const p of scene.params) if (p.id !== 'm') scope[p.id] = vals[p.id];

  const terms: Pt[] = [];
  const sums: Pt[] = [];
  let S = 0;
  for (let i = 1; i <= m; i++) {
    const a = fn.eval({ ...scope, n: i });
    terms.push({ x: i, y: a });
    if (Number.isFinite(a)) S += a;
    sums.push({ x: i, y: S });
  }
  const last = terms[m - 1]?.y;

  const objects: VizObject[] = [
    { o: 'hrule', id: 'zero', at: 0, tone: 'ghost' },
    { o: 'sequence', id: 'a', pts: terms, tone: 'primary', stems: true },
  ];
  if (scene.partial) objects.push({ o: 'sequence', id: 'S', pts: sums, tone: 'accent' });

  const readouts: VizReadout[] = [
    { id: 'm', tex: 'm', value: String(m), help: 'How many terms are on screen.' },
    {
      id: 'am',
      tex: `a_{${m}}`,
      value: Number.isFinite(last) ? fmt(last, 5) : '—',
      help: 'The last term shown — the height of the rightmost stem.',
    },
  ];
  if (scene.partial) {
    readouts.push({
      id: 'Sm',
      tex: `S_{${m}}`,
      value: Number.isFinite(S) ? fmt(S, 5) : '—',
      help: 'Every term so far, added up — the height of the rightmost dot. Terms can shrink to nothing while this total still grows.',
    });
    // Where the series is heading is the answer; estimated only when the
    // partial sums have already visibly settled, and withheld under guard.
    const est = estimateSeries(fn, scope);
    readouts.push({
      id: 'lim',
      tex: '\\sum_{n=1}^{\\infty} a_n',
      value: guarded ? null : est === null ? 'not settling' : `≈ ${fmt(est, 4)}`,
      help: 'What the running total heads toward if you never stop adding. "Not settling" means the dots keep moving instead of homing in.',
    });
  } else {
    const est = estimateSequenceLimit(fn, scope);
    // A tail probe is an estimate: n^(1/n) at n = 8000 still reads 1.00112,
    // and printing that to five unqualified decimals asserts digits the
    // method does not have. Three decimals behind an ≈ is what it knows.
    readouts.push({
      id: 'lim',
      tex: '\\lim_{n \\to \\infty} a_n',
      value: guarded ? null : est === null ? 'no limit' : `≈ ${fmt(est, 3)}`,
      help: 'What the terms themselves settle down to far out. "No limit" means they never settle — they may oscillate or run away.',
    });
  }

  const mstage = sweepStage(scene.params.find((p) => p.id === 'm') ?? null, m);
  return {
    objects,
    readouts,
    narration:
      mstage === 0
        ? 'Only the first few terms. Too early to tell what they are doing.'
        : mstage === 1
          ? scene.partial
            ? 'More terms. The stems are getting shorter — but watch the dots, which are the running total.'
            : 'More terms now. A pattern should be starting to show.'
          : mstage === 2
            ? scene.partial
              ? 'The stems are nearly flat, so each new term adds very little. The dots are barely climbing.'
              : 'The terms are settling into whatever they are going to do.'
            : scene.partial
              ? 'Far out now. The dots have almost stopped moving, even though terms are still being added.'
              : 'Far out now. Whatever the terms were heading for, this is it.',
    caption: scene.partial
      ? `${m} term${m === 1 ? '' : 's'}: each stem is a term, each dot the running total.`
      : `The first ${m} term${m === 1 ? '' : 's'}.`,
    ask: scene.partial
      ? 'Follow the dots, not the stems. Where are they piling up?'
      : 'Push m out. What are the terms doing?',
  };
};

/**
 * Conservative tail probe: a value only when late terms agree.
 *
 * Two ways an estimator like this gets fooled, both guarded against:
 * parity — (−1)^n agrees with itself perfectly on any all-even sample — and
 * grid aliasing: a verifier caught cos(πn/1000) reporting limit 1, because
 * every probe on a round-numbered grid sat within one index of a peak of the
 * period-2000 wave. The probes are primes scattered across [2k, 8k], which no
 * period expressible in this grammar's round constants lines up with, and the
 * tail must also be locally flat — consecutive terms agreeing — not merely
 * flat at the probe points.
 */
function estimateSequenceLimit(fn: CompiledExpr, scope: Record<string, number>): number | null {
  const probes = [1999, 2477, 3163, 4001, 5711, 7919, 7920, 8000].map((n) =>
    fn.eval({ ...scope, n })
  );
  if (!probes.every(Number.isFinite)) return null;
  const scale = Math.max(1, ...probes.map(Math.abs));
  const last = probes[probes.length - 1];
  if (probes.some((v) => Math.abs(v - last) > 5e-3 * scale)) return null;
  if (Math.abs(probes[7] - probes[3]) > 1e-3 * scale) return null;
  return Math.round(last * 1e6) / 1e6;
}

/**
 * Partial sums to two depths; a value only when they already agree. The
 * depths are primes for the same anti-aliasing reason as above (2000 and
 * 4000 are whole periods of cos(πn/1000), so its wildly swinging partial
 * sums agreed at exactly those two points), and the terms themselves must be
 * vanishing at the tail — the necessary condition for convergence, checked
 * directly rather than inferred.
 */
function estimateSeries(fn: CompiledExpr, scope: Record<string, number>): number | null {
  let s1 = 0;
  let s2 = 0;
  let tail = 0;
  for (let i = 1; i <= 4001; i++) {
    const a = fn.eval({ ...scope, n: i });
    if (!Number.isFinite(a)) return null;
    if (i <= 1733) s1 += a;
    s2 += a;
    if (i > 3990) tail = Math.max(tail, Math.abs(a));
  }
  const scale = Math.max(1, Math.abs(s2));
  if (tail > 1e-3 * scale) return null; // terms not going to zero
  if (Math.abs(s2 - s1) > 2e-3 * scale) return null;
  return Math.round(s2 * 1e6) / 1e6;
}

// --- 7. Vectors and linear combination ------------------------------

const buildVectors: Builder = (scene, _fn, vals, _view, guarded) => {
  const vs = scene.vectors ?? [];
  if (!vs.length) return EMPTY_FRAME;
  const tones: Tone[] = ['primary', 'accent', 'muted', 'muted'];
  const objects: VizObject[] = vs.map((v, i) => ({
    o: 'vector',
    id: `v${i}`,
    x1: 0,
    y1: 0,
    x2: v.x,
    y2: v.y,
    tone: tones[i] ?? 'muted',
    label: v.label ?? (i === 0 ? 'u' : i === 1 ? 'v' : undefined),
  }));
  const readouts: VizReadout[] = [];

  // With exactly two vectors, the picture is the linear combination — the
  // heart of span, basis and dependence, all in one draggable object.
  if (vs.length === 2 && typeof vals.s === 'number' && typeof vals.t === 'number') {
    const [u, v] = vs;
    const cx = vals.s * u.x + vals.t * v.x;
    const cy = vals.s * u.y + vals.t * v.y;
    objects.push(
      { o: 'segment', id: 'p1', x1: vals.s * u.x, y1: vals.s * u.y, x2: cx, y2: cy, tone: 'ghost', dashed: true },
      { o: 'segment', id: 'p2', x1: vals.t * v.x, y1: vals.t * v.y, x2: cx, y2: cy, tone: 'ghost', dashed: true },
      { o: 'vector', id: 'su', x1: 0, y1: 0, x2: vals.s * u.x, y2: vals.s * u.y, tone: 'ghost' },
      { o: 'vector', id: 'tv', x1: 0, y1: 0, x2: vals.t * v.x, y2: vals.t * v.y, tone: 'ghost' },
      { o: 'vector', id: 'combo', x1: 0, y1: 0, x2: cx, y2: cy, tone: 'tension', label: 'su+tv' }
    );
    readouts.push(
      { id: 's', tex: 's', value: fmt(vals.s), help: 'How many copies of u to lay down.' },
      { id: 't', tex: 't', value: fmt(vals.t), help: 'How many copies of v to lay down.' },
      {
        id: 'combo',
        tex: 's\\mathbf{u} + t\\mathbf{v}',
        // "Work out 3u − 2v" is a real exercise, and its answer is exactly
        // this pair of numbers. The arrow itself stays drawn — reading a
        // vector off the grid is the skill — but the coordinates are the
        // thing being asked for, so they guard like every other answer.
        value: guarded ? null : `(${fmt(cx)}, ${fmt(cy)})`,
        help: 'Where you land after walking s of the way along u and then t along v. Sweep both sliders and the set of places you can reach is the span.',
      }
    );
  }

  return {
    objects,
    readouts,
    narration:
      vs.length === 2
        ? 'Two arrows, and a third made by taking s of the first and t of the second. Sweep both sliders: every point that third arrow can reach is the span.'
        : 'The vectors, drawn from the origin.',
    caption:
      vs.length === 2
        ? 'Slide s and t. Everything the combination can reach is the span.'
        : 'The vectors, from the origin.',
  };
};

// --- 8. Matrix transformation ---------------------------------------

/** Real eigen-decomposition of a 2×2, closed form; null when complex. */
export function eigen2x2(
  M: [[number, number], [number, number]]
): { values: [number, number]; vectors: [Pt, Pt] } | null {
  const [[a, b], [c, d]] = M;
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc < 0) return null;
  const r = Math.sqrt(disc);
  const l1 = (tr + r) / 2;
  const l2 = (tr - r) / 2;
  const vecFor = (l: number): Pt => {
    // (A − λI)v = 0: take the larger row for numerical stability.
    if (Math.abs(b) > 1e-12) return norm({ x: b, y: l - a });
    if (Math.abs(c) > 1e-12) return norm({ x: l - d, y: c });
    // diagonal matrix: axis directions
    return Math.abs(a - l) < Math.abs(d - l) ? { x: 1, y: 0 } : { x: 0, y: 1 };
  };
  return { values: [l1, l2], vectors: [vecFor(l1), vecFor(l2)] };
}
function norm(p: Pt): Pt {
  const m = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / m, y: p.y / m };
}

const buildMatrix: Builder = (scene, _fn, vals, view, guarded) => {
  const M0 = scene.matrix;
  if (!M0) return EMPTY_FRAME;
  // Entries become live when sliders named a, b, c, d exist.
  const A: [[number, number], [number, number]] = [
    [vals.a ?? M0[0][0], vals.b ?? M0[0][1]],
    [vals.c ?? M0[1][0], vals.d ?? M0[1][1]],
  ];
  const t = Math.min(1, Math.max(0, vals.t ?? 0));
  // M(t) walks the identity to A, so the space is seen MOVING, not swapped.
  const M: [[number, number], [number, number]] = [
    [1 + (A[0][0] - 1) * t, A[0][1] * t],
    [A[1][0] * t, 1 + (A[1][1] - 1) * t],
  ];
  const apply = (p: Pt): Pt => ({ x: M[0][0] * p.x + M[0][1] * p.y, y: M[1][0] * p.x + M[1][1] * p.y });

  // The transformed lattice, as one mesh. A linear map keeps lines straight,
  // so two points per line are enough.
  const R = 4;
  const lines: Pt[][] = [];
  for (let i = -R; i <= R; i++) {
    lines.push([apply({ x: -R, y: i }), apply({ x: R, y: i })]);
    lines.push([apply({ x: i, y: -R }), apply({ x: i, y: R })]);
  }
  const e1 = apply({ x: 1, y: 0 });
  const e2 = apply({ x: 0, y: 1 });

  const objects: VizObject[] = [
    { o: 'mesh', id: 'grid', lines, tone: 'accent', width: 0.8 },
    { o: 'vector', id: 'e1', x1: 0, y1: 0, x2: e1.x, y2: e1.y, tone: 'primary', label: 'e₁' },
    { o: 'vector', id: 'e2', x1: 0, y1: 0, x2: e2.x, y2: e2.y, tone: 'tension', label: 'e₂' },
  ];

  const eig = eigen2x2(A);
  // Eigen-directions are the ANSWER a student is usually after, so under the
  // guard they are not drawn — the invariant lines are there to be noticed in
  // the motion, not printed over it.
  if (!guarded && eig) {
    for (const [i, v] of eig.vectors.entries()) {
      objects.push({
        o: 'segment',
        id: `eig${i}`,
        x1: -v.x * R * 2,
        y1: -v.y * R * 2,
        x2: v.x * R * 2,
        y2: v.y * R * 2,
        tone: 'muted',
        dashed: true,
      });
    }
  }

  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const readouts: VizReadout[] = [
    { id: 't', tex: 't', value: fmt(t, 2), help: 'How far through the transformation you are: 0 is before, 1 is after.' },
    {
      id: 'det',
      tex: '\\det A',
      value: guarded ? null : fmt(det, 4),
      help: 'The area factor. A unit square becomes a shape this many times bigger; a negative value means the plane was flipped over, and zero means it was squashed flat onto a line.',
    },
    {
      id: 'eig',
      tex: '\\lambda_{1,2}',
      value: guarded ? null : eig ? `${fmt(eig.values[0], 3)}, ${fmt(eig.values[1], 3)}` : 'complex',
      help: 'The stretch factors along the special directions that stay on their own line through the transformation. "Complex" means no direction survives — the map rotates everything.',
    },
  ];

  const mxstage = sweepStage(scene.params.find((p) => p.id === 't') ?? null, t);
  return {
    objects,
    readouts,
    narration:
      mxstage === 0
        ? 'The plane before A touches it. Every square is a square, and the two arrows are the ordinary axes.'
        : mxstage === 1
          ? 'A is being applied. The whole grid moves at once — notice that the lines stay straight and evenly spaced.'
          : mxstage === 2
            ? 'Most of the way through. Some directions have swung a long way round; others have barely turned at all.'
            : 'The plane after A. The origin never moved, and every straight line is still straight — but almost every direction now points somewhere new.',
    caption: t === 0 ? 'The untouched plane. Press play to apply A.' : t === 1 ? 'The plane under A.' : `Part way: M(t) at t = ${fmt(t, 2)}.`,
    ask: 'Watch the grid go. Which directions never leave their own line?',
  };
};

// --- 9. Probability distributions -----------------------------------

/** Most bars worth drawing; beyond this they are thinner than a pixel. */
const MAX_BARS = 400;

function lnFact(n: number): number {
  let acc = 0;
  for (let i = 2; i <= n; i++) acc += Math.log(i);
  return acc;
}

/** pdf/pmf, mean, sd, and discreteness for the supported families. */
export function distSpec(
  dist: DistName,
  vals: Record<string, number>
): {
  pdf: (x: number) => number;
  mean: number;
  sd: number;
  discrete: boolean;
  support: [number, number];
  /** where the pdf is actually defined and smooth — quadrature must not cross its edge */
  domain: [number, number];
} | null {
  if (dist === 'normal') {
    const mu = vals.u ?? 0;
    const sig = Math.abs(vals.s ?? 1) || 1e-9;
    return {
      pdf: (x) => Math.exp(-((x - mu) ** 2) / (2 * sig * sig)) / (sig * Math.sqrt(2 * Math.PI)),
      mean: mu,
      sd: sig,
      discrete: false,
      support: [mu - 4 * sig, mu + 4 * sig],
      domain: [-Infinity, Infinity],
    };
  }
  if (dist === 'exponential') {
    const l = Math.abs(vals.l ?? 1) || 1e-9;
    return {
      pdf: (x) => (x < 0 ? 0 : l * Math.exp(-l * x)),
      mean: 1 / l,
      sd: 1 / l,
      discrete: false,
      support: [0, 5 / l],
      domain: [0, Infinity],
    };
  }
  if (dist === 'binomial') {
    const n = Math.max(1, Math.round(vals.n ?? 10));
    const p = Math.min(0.99, Math.max(0.01, vals.p ?? 0.5));
    const lnC = (k: number) => lnFact(n) - lnFact(k) - lnFact(n - k);
    return {
      pdf: (x) => {
        const k = Math.round(x);
        if (k < 0 || k > n || Math.abs(x - k) > 1e-9) return 0;
        return Math.exp(lnC(k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
      },
      mean: n * p,
      sd: Math.sqrt(n * p * (1 - p)),
      discrete: true,
      support: [0, n],
      domain: [0, n],
    };
  }
  // poisson
  const l = Math.max(0.05, vals.l ?? 4);
  return {
    pdf: (x) => {
      const k = Math.round(x);
      if (k < 0 || Math.abs(x - k) > 1e-9) return 0;
      return Math.exp(k * Math.log(l) - l - lnFact(k));
    },
    mean: l,
    sd: Math.sqrt(l),
    discrete: true,
    support: [0, Math.ceil(l + 4 * Math.sqrt(l) + 4)],
    domain: [0, Infinity],
  };
}

const buildDistribution: Builder = (scene, _fn, vals, view, guarded) => {
  if (!scene.dist) return EMPTY_FRAME;
  const spec = distSpec(scene.dist, vals);
  if (!spec) return EMPTY_FRAME;
  const objects: VizObject[] = [];
  const readouts: VizReadout[] = scene.params.map((p) => ({
    id: p.id,
    tex: p.symbol || p.id,
    value: p.integer ? String(Math.round(vals[p.id] ?? p.value)) : fmt(vals[p.id] ?? p.value),
    help: p.help,
  }));

  // The interval whose probability is being asked about, if the scene set one.
  const hasWindow = typeof scene.a === 'number' && typeof scene.b === 'number' && scene.b >= scene.a;

  let prob: number | null = null;
  if (spec.discrete) {
    // Bounded, because the window is the READER's: zooming out to the
    // renderer's 1e9 span would otherwise run this loop a billion times per
    // frame and hang the tab. Past a few hundred bars they are sub-pixel
    // anyway, so nothing visible is lost by stopping.
    const lo = Math.max(0, Math.floor(view.xMin));
    const hi = Math.min(lo + MAX_BARS, Math.ceil(view.xMax));
    const bars: { x0: number; x1: number; y: number }[] = [];
    const hot: { x0: number; x1: number; y: number }[] = [];
    for (let k = lo; k <= hi; k++) {
      const y = spec.pdf(k);
      if (y < 1e-9) continue;
      const bar = { x0: k - 0.38, x1: k + 0.38, y };
      const inside = hasWindow && k >= scene.a! && k <= scene.b!;
      (inside ? hot : bars).push(bar);
    }
    objects.push({ o: 'rects', id: 'pmf', bars, tone: 'primary' });
    if (hot.length) objects.push({ o: 'rects', id: 'hot', bars: hot, tone: 'tension' });

    // The probability is summed over the INTERVAL, not over whatever is on
    // screen. Accumulating it inside the drawing loop tied the answer to the
    // window, so scrolling the plot would have quietly changed it — and
    // capping that loop, as it now is, would have truncated it outright.
    if (hasWindow) {
      const from = Math.max(Math.ceil(scene.a! - 1e-9), spec.domain[0]);
      const to = Math.min(Math.floor(scene.b! + 1e-9), spec.domain[1]);
      let acc = 0;
      for (let k = from; k <= to; k++) acc += spec.pdf(k);
      prob = Number.isFinite(acc) ? acc : null;
    }
  } else {
    const pts: Pt[] = [];
    const N = 320;
    for (let i = 0; i <= N; i++) {
      const x = view.xMin + ((view.xMax - view.xMin) * i) / N;
      pts.push({ x, y: spec.pdf(x) });
    }
    objects.push({ o: 'curve', id: 'pdf', pts, tone: 'primary', width: 2 });
    if (hasWindow) {
      // Clamp to where the pdf is defined and smooth. Simpson's rule assumes
      // smoothness; run it across the exponential's jump at 0 and the panels
      // straddling the edge average the cliff — P(−1 ≤ X ≤ 1) comes out
      // visibly wrong. Outside the domain the probability is exactly zero, so
      // clipping the interval IS the correct integral, not an approximation.
      const a = Math.max(scene.a!, spec.domain[0]);
      const b = Math.min(scene.b!, spec.domain[1]);
      if (b > a) {
        const region: Pt[] = [{ x: a, y: 0 }];
        const M = 120;
        let acc = 0;
        for (let i = 0; i <= M; i++) {
          const x = a + ((b - a) * i) / M;
          region.push({ x, y: spec.pdf(x) });
          // Simpson weights over the same samples
          acc += spec.pdf(x) * (i === 0 || i === M ? 1 : i % 2 ? 4 : 2);
        }
        region.push({ x: b, y: 0 });
        objects.push({ o: 'region', id: 'P', pts: region, tone: 'tension' });
        prob = (acc * ((b - a) / M)) / 3;
      } else {
        prob = 0;
      }
    }
  }

  // The marker IS the mean — a labelled position is as legible as a printed
  // number, so under guard it must go wherever the readout goes. The normal
  // keeps it (its mean is the μ slider, already in the person's hand).
  if (!guarded || scene.dist === 'normal') {
    objects.push({ o: 'vrule', id: 'mean', at: spec.mean, tone: 'muted', dashed: true, label: 'mean' });
  }

  // Mean and sd are what a problem set asks FOR; inputs stay, answers guard.
  // Except where the "answer" restates a slider digit for digit — the
  // normal's mean and sd ARE μ and σ, and the poisson's mean IS λ.
  // Withholding a number the person is holding in their hand is not a
  // guard, it is a tease.
  if (scene.dist !== 'normal' && scene.dist !== 'poisson') {
    readouts.push({
      id: 'mu',
      tex: '\\mathbb{E}[X]',
      value: guarded ? null : fmt(spec.mean, 4),
      help: 'The long-run average: repeat the experiment forever and this is what the outcomes average out to. It need not be an outcome you could actually get.',
    });
  }
  if (scene.dist !== 'normal') {
    readouts.push({
      id: 'sd',
      tex: '\\sigma_X',
      value: guarded ? null : fmt(spec.sd, 4),
      help: 'Typical distance from the average — a measure of how spread out the outcomes are.',
    });
  }
  if (prob !== null) {
    readouts.push({
      id: 'prob',
      tex: `P(${fmt(scene.a!)} \\le X \\le ${fmt(scene.b!)})`,
      value: guarded ? null : fmt(prob, 4),
      help: 'The chance the outcome lands between those two numbers. It is the shaded share of the total — and the whole area is 1, so it is a fraction of everything.',
    });
  }

  return {
    objects,
    readouts,
    narration: spec.discrete
      ? `Each bar is one outcome, and its height is how likely that outcome is. All the heights together come to 1.${hasWindow ? ' The darker bars are the ones being asked about.' : ''}`
      : `The curve is not a probability by itself — area is. The whole area underneath comes to 1.${hasWindow ? ' The shaded piece is the part being asked about.' : ''}`,
    caption: spec.discrete ? 'Each bar is one outcome; heights sum to 1.' : 'The whole area under the curve is 1.',
    ask: hasWindow
      ? 'The shaded share of the total area is the probability. Roughly how much of it is shaded?'
      : 'Move a parameter and watch where the mass goes.',
  };
};

// --- 10. First-order ODE: direction field + trajectory ---------------

/** RK4 both ways from (x0, y0), stopping when the solution leaves the world. */
export function rk4Trajectory(
  f: (x: number, y: number) => number,
  x0: number,
  y0: number,
  view: Viewport,
  steps = 400
): Pt[] {
  const run = (dir: 1 | -1): Pt[] => {
    const h = ((view.xMax - view.xMin) / steps) * dir;
    const out: Pt[] = [];
    let x = x0;
    let y = y0;
    const ySpan = view.yMax - view.yMin;
    for (let i = 0; i < steps; i++) {
      const k1 = f(x, y);
      const k2 = f(x + h / 2, y + (h / 2) * k1);
      const k3 = f(x + h / 2, y + (h / 2) * k2);
      const k4 = f(x + h, y + h * k3);
      if (![k1, k2, k3, k4].every(Number.isFinite)) break;
      y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      x += h;
      if (!Number.isFinite(y) || x < view.xMin - 1e-9 || x > view.xMax + 1e-9) break;
      if (y < view.yMin - ySpan || y > view.yMax + ySpan) break; // ran away
      out.push({ x, y });
    }
    return out;
  };
  const fwd = run(1);
  const back = run(-1).reverse();
  return [...back, { x: x0, y: y0 }, ...fwd];
}

const buildOde: Builder = (scene, fn, vals, view, guarded) => {
  if (!fn) return EMPTY_FRAME;
  const scope: Record<string, number> = {};
  for (const p of scene.params) if (p.id !== 'y0') scope[p.id] = vals[p.id];
  const f = (x: number, y: number) => fn.eval({ ...scope, [scene.varName]: x, y });

  // The direction field: a short unit-length dash of slope f(x, y) at each
  // lattice point, all drawn as one mesh.
  const NX = 20;
  const NY = 14;
  const dx = (view.xMax - view.xMin) / NX;
  const dy = (view.yMax - view.yMin) / NY;
  const len = Math.min(dx, dy) * 0.42;
  const aspect = dy / dx; // slopes live in data space; normalise the dash there
  const lines: Pt[][] = [];
  for (let i = 0; i <= NX; i++) {
    for (let j = 0; j <= NY; j++) {
      const x = view.xMin + i * dx;
      const y = view.yMin + j * dy;
      const m = f(x, y);
      if (!Number.isFinite(m)) continue;
      const norm = Math.hypot(1, m / aspect) || 1;
      const ux = (len / norm) * 1;
      const uy = (len / norm) * (m / aspect) * aspect;
      lines.push([{ x: x - ux / 2, y: y - uy / 2 }, { x: x + ux / 2, y: y + uy / 2 }]);
    }
  }

  const x0 = scene.a ?? (view.xMin + view.xMax) / 2;
  const y0 = vals.y0 ?? 1;
  const traj = rk4Trajectory(f, x0, y0, view);

  const objects: VizObject[] = [
    { o: 'mesh', id: 'field', lines, tone: 'ghost', width: 1 },
    { o: 'curve', id: 'traj', pts: traj, tone: 'primary', width: 2.2 },
    { o: 'point', id: 'ic', x: x0, y: y0, tone: 'accent', label: `(${fmt(x0)}, ${fmt(y0)})` },
  ];

  const readouts: VizReadout[] = [
    {
      id: 'y0',
      tex: 'y_0',
      value: fmt(y0, 3),
      help: 'The starting height. The equation only fixes the slope at each point; this picks which of the many curves through that field you actually follow.',
    },
  ];
  for (const p of scene.params) {
    if (p.id === 'y0') continue;
    readouts.push({
      id: p.id,
      tex: p.symbol || p.id,
      value: fmt(vals[p.id] ?? p.value, 3),
      help: p.help ?? `A constant in the equation. Change it and the whole field of slopes changes with it.`,
    });
  }

  return {
    objects,
    readouts,
    narration:
      'The little dashes are the equation itself: at every point it says which way to head. The curve is what you get by starting at the dot and always following them. Move y₀ and you pick a different starting point — and a different curve.',
    caption: 'One solution, threaded through the field its equation defines.',
    ask: 'Slide y₀. Which starting points end up together, and which never meet?',
  };
};

const KINDS: Record<VizKind, Builder> = {
  function: buildFunction,
  limit: buildLimit,
  derivative: buildDerivative,
  riemann: buildRiemann,
  taylor: buildTaylor,
  sequence: buildSequence,
  vectors: buildVectors,
  matrix: buildMatrix,
  distribution: buildDistribution,
  ode: buildOde,
};

/**
 * One frame. Pure: the same scene and values always give the same picture,
 * which is what lets the animation be a clock over this rather than a pile of
 * mutable state.
 */
export function buildFrame(
  scene: VizScene,
  fn: CompiledExpr | null,
  vals: Record<string, number>,
  view: Viewport,
  guarded: boolean
): VizFrame {
  const frame = KINDS[scene.kind](scene, fn, vals, view, guarded);
  const extra = overlayObjects(scene, vals, view);
  const objects = extra.length ? [...frame.objects, ...extra] : frame.objects;
  // Ids become React keys, and a duplicate key silently drops a mark from the
  // screen. Builders compose their ids from parameter names — an expression
  // with a coefficient called `fa` collides with the `fa` readout — so rather
  // than asking every builder to be careful, uniqueness is enforced once,
  // here, on the one path every frame takes.
  return { ...frame, objects: uniqueById(objects), readouts: uniqueById(frame.readouts) };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((it) => {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      return it;
    }
    let n = 2;
    while (seen.has(`${it.id}_${n}`)) n++;
    seen.add(`${it.id}_${n}`);
    return { ...it, id: `${it.id}_${n}` };
  });
}

/**
 * The reader's curves, drawn after the lesson's objects so they sit on top
 * without displacing anything. Compiled per call rather than cached: an
 * overlay is a handful of samples, and correctness under a changing parameter
 * matters more here than saving a compile.
 */
function overlayObjects(
  scene: VizScene,
  vals: Record<string, number>,
  view: Viewport
): VizObject[] {
  const out: VizObject[] = [];
  let slot = 0;
  for (const ov of scene.overlays ?? []) {
    if (!ov.visible) {
      slot++; // a hidden curve keeps its colour, so showing it again is the same curve
      continue;
    }
    const fn = compileExpr(ov.expr, [scene.varName, ...scene.params.map((p) => p.id)]);
    if (!fn) {
      slot++;
      continue;
    }
    out.push({
      o: 'curve',
      id: `ov_${ov.id}`,
      pts: sampleCurve(fn, scene.varName, vals, view.xMin, view.xMax, SAMPLES, view),
      tone: USER_TONES[slot % USER_TONES.length],
      width: 1.8,
    });
    slot++;
  }
  return out;
}

/** Every overlay that currently draws, with the colour it draws in. */
export function overlayLegend(
  scene: VizScene
): { ov: PlotExpression; tone: Tone; ok: boolean }[] {
  return (scene.overlays ?? []).map((ov, i) => ({
    ov,
    tone: USER_TONES[i % USER_TONES.length],
    ok: !!compileExpr(ov.expr, [scene.varName, ...scene.params.map((p) => p.id)]),
  }));
}

/** A stable id for a new overlay, derived from the expression rather than a clock. */
export function overlayId(expr: string, taken: Set<string>): string {
  const base = expr.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10) || 'expr';
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}${n++}`;
  return id;
}

/** Compile a scene's expression over its variable and every parameter. */
export function compileScene(scene: VizScene): CompiledExpr | null {
  if (!sceneHasOwnCurve(scene)) return null;
  const names = [scene.varName, ...scene.params.map((p) => p.id)];
  if (scene.kind === 'ode') names.push('y'); // dy/dx = f(x, y)
  return compileExpr(scene.expr, names);
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
    return [{ id: 'd', symbol: '\\delta', min: max / 1500, max, step: max / 2000, value: max, sweep: 'down', toward: '0', help: 'How far either side of the point you are looking. Smaller δ means both sample points sit closer in.' }];
  },
  derivative: (sc) => {
    const max = span(sc, 5, 2.5);
    return [{ id: 'h', min: max / 1200, max, step: max / 2000, value: max, sweep: 'down', toward: '0', help: 'The gap between the two points on the curve. Shrink it and the line through them stops being a shortcut and starts being a tangent.' }];
  },
  riemann: () => [{ id: 'n', min: 1, max: 80, step: 1, value: 4, integer: true, sweep: 'up', toward: '\\infty', help: 'How many rectangles the area is chopped into. More rectangles, thinner each, closer to the true area.' }],
  taylor: () => [{ id: 'k', min: 0, max: 10, step: 1, value: 1, integer: true, sweep: 'up', toward: '\\infty', help: 'The degree of the polynomial: how many terms it is allowed. Each extra term buys accuracy further from the centre.' }],
  sequence: (sc) => [
    { id: 'm', min: 1, max: 48, step: 1, value: sc.partial ? 4 : 8, integer: true, sweep: 'up', toward: '\\infty', help: 'How many terms of the sequence to show. Push it out to see what happens in the long run.' },
  ],
  vectors: (sc) =>
    (sc.vectors?.length ?? 0) === 2
      ? [
          { id: 's', min: -2, max: 2, step: 0.05, value: 1, help: 'How much of the first vector to take. Negative flips it around.' },
          { id: 't', min: -2, max: 2, step: 0.05, value: 1, help: 'How much of the second vector to take. Every point you can reach with s and t together is the span.' },
        ]
      : [],
  matrix: () => [{ id: 't', min: 0, max: 1, step: 0.01, value: 0, sweep: 'up', toward: '1', help: 'How far through the transformation you are. 0 is the untouched plane, 1 is the plane after A has acted on it.' }],
  distribution: (sc) => {
    switch (sc.dist) {
      case 'normal':
        return [
          { id: 'u', symbol: '\\mu', min: -6, max: 6, step: 0.1, value: 0, help: 'The centre of the bell. Sliding it moves the whole shape left or right without changing it.' },
          { id: 's', symbol: '\\sigma', min: 0.3, max: 3, step: 0.05, value: 1, help: 'How spread out the bell is. Bigger σ makes it wider and flatter — the total area stays 1 either way.' },
        ];
      case 'binomial':
        return [
          { id: 'n', min: 1, max: 60, step: 1, value: 12, integer: true, help: 'How many independent tries there are.' },
          { id: 'p', min: 0.05, max: 0.95, step: 0.01, value: 0.5, help: 'The chance of success on any single try.' },
        ];
      case 'exponential':
        return [{ id: 'l', symbol: '\\lambda', min: 0.2, max: 4, step: 0.05, value: 1, help: 'The rate things happen at. Higher rate means shorter waits, so the curve piles up near zero.' }];
      default: // poisson
        return [{ id: 'l', symbol: '\\lambda', min: 0.5, max: 20, step: 0.5, value: 4, help: 'The average count per interval. It is both the centre of the distribution and its name.' }];
    }
  },
  // y₀'s range tracks the window so the slider always reaches something the
  // person can see.
  ode: (sc) => {
    const lo = typeof sc.view.yMin === 'number' ? sc.view.yMin : -4;
    const hi = typeof sc.view.yMax === 'number' ? sc.view.yMax : 4;
    return [
      { id: 'y0', symbol: 'y_0', min: lo, max: hi, step: (hi - lo) / 100, value: Math.min(hi, Math.max(lo, 1)), help: 'Where the solution starts. The equation fixes the slope everywhere; this picks which single curve you are riding.' },
    ];
  },
};

/**
 * The parameter each kind owns and drives with the clock. Reserved: a
 * coefficient slider must never be auto-created for one of these names, or it
 * would take the animation's parameter away from it.
 */
/** The free letters in an expression — re-exported so the editor can reason
 *  about what a person has typed without importing the evaluator directly. */
export function freeNamesOf(expr: string): string[] {
  return freeNames(expr);
}

export const RESERVED_PARAM: Record<VizKind, string | null> = {
  function: null,
  limit: 'd',
  derivative: 'h',
  riemann: 'n',
  taylor: 'k',
  sequence: 'm',
  vectors: null,
  matrix: 't',
  distribution: null,
  ode: 'y0',
};

export const KIND_LABEL: Record<VizKind, string> = {
  function: 'Function',
  limit: 'Limit',
  derivative: 'Derivative',
  riemann: 'Integral',
  taylor: 'Taylor',
  sequence: 'Series',
  vectors: 'Vectors',
  matrix: 'Matrix',
  distribution: 'Distribution',
  ode: 'Field',
};

/**
 * The sliders an expression implies.
 *
 * Every letter that is not the variable, and not the kind's own animated
 * parameter, becomes something you can move — type "a*x^2 + b" and you get an
 * a and a b, which is the behaviour anyone who has used a graphing calculator
 * expects. An existing slider for the same letter is kept as it is, so
 * retyping the expression does not throw away a range you had set.
 */
export function autoParams(
  expr: string,
  varName: string,
  kind: VizKind,
  existing: VizParam[] = []
): VizParam[] {
  const reserved = RESERVED_PARAM[kind];
  const by = new Map(existing.map((p) => [p.id, p]));
  const out: VizParam[] = [];
  for (const name of freeNames(expr)) {
    if (name === varName || name === reserved) continue;
    if (kind === 'ode' && name === 'y') continue; // the solution, not a knob
    if (name.length > 2) continue; // not a coefficient; the sanitizer rejects it anyway
    const had = by.get(name);
    out.push(had ?? { id: name, min: -5, max: 5, step: 0.1, value: 1 });
    if (out.length >= MAX_PARAMS) break;
  }
  return out;
}

/**
 * A content signature. Scene objects arrive fresh from JSON on every
 * extraction, so identity says nothing about whether the picture changed —
 * and resetting a running animation because an unrelated message arrived would
 * be maddening.
 */
export function sceneSignature(scene: VizScene | null | undefined): string {
  return scene ? JSON.stringify(scene) : '';
}

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
const MAX_OVERLAYS = 6;

/**
 * The reader's curves, validated. Each must compile over the scene's own
 * variable and parameters, because an overlay that evaluates to NaN forever
 * is an invisible entry in a legend that claims something is drawn.
 */
function sanitizeOverlays(
  raw: any,
  varName: string,
  paramIds: string[]
): PlotExpression[] | undefined {
  // Undefined and empty are DIFFERENT: undefined means the extractor had no
  // opinion this turn and whatever is on the plot should stay; empty means
  // clear it. Collapsing them would let a distracted turn wipe the plot.
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const known = [varName, ...paramIds];
  const seen = new Set<string>();
  const out: PlotExpression[] = [];
  for (const o of raw) {
    const expr = typeof o?.expr === 'string' ? o.expr.trim().slice(0, MAX_EXPR) : '';
    if (!expr) continue;
    if (freeNames(expr).some((nm) => !known.includes(nm))) continue;
    const fn = compileExpr(expr, known);
    if (!fn) continue;
    const id =
      typeof o?.id === 'string' && /^[a-z0-9_]{1,24}$/i.test(o.id)
        ? o.id.toLowerCase()
        : overlayId(expr, seen);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      expr,
      ...(typeof o?.label === 'string' && o.label.trim()
        ? { label: o.label.replace(/\s+/g, ' ').trim().slice(0, 40) }
        : {}),
      visible: o?.visible !== false,
      source: o?.source === 'socria' ? 'socria' : 'user',
    });
    if (out.length >= MAX_OVERLAYS) break;
  }
  return out;
}

function sanitizeMatrix(raw: any): [[number, number], [number, number]] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const row = (r: any): [number, number] | null =>
    Array.isArray(r) && r.length === 2 && r.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100)
      ? [r[0], r[1]]
      : null;
  const r0 = row(raw[0]);
  const r1 = row(raw[1]);
  if (!r0 || !r1) return null;
  // The zero matrix flattens the lattice to a point — true, but nothing to see.
  if (r0[0] === 0 && r0[1] === 0 && r1[0] === 0 && r1[1] === 0) return null;
  return [r0, r1];
}

function sanitizeVectors(raw: any): { x: number; y: number; label?: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .map((v: any) =>
      v && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y) && Math.hypot(v.x, v.y) > 1e-9 && Math.abs(v.x) <= 1e3 && Math.abs(v.y) <= 1e3
        ? {
            x: v.x,
            y: v.y,
            // A label is a NAME — u, v, e1 — and nothing else. Free text here
            // would be the one channel by which model prose reaches a guarded
            // frame, and "= 5" fits comfortably in twelve characters.
            ...(typeof v.label === 'string' && /^[A-Za-z][A-Za-z0-9]{0,5}$/.test(v.label.trim())
              ? { label: v.label.trim() }
              : {}),
          }
        : null
    )
    .filter(Boolean) as { x: number; y: number; label?: string }[];
  return out.length ? out.slice(0, 4) : null;
}

export function sanitizeViz(raw: any): VizScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind: VizKind | null = VIZ_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) return null;

  const needsExpr = kindNeedsExpr(kind);
  const expr = typeof raw.expr === 'string' ? raw.expr.trim().slice(0, MAX_EXPR) : '';
  // A bare function scene may have no expression of its own, provided the
  // reader has put something on it — that is the conversational graphing case.
  const overlayCount = Array.isArray(raw.overlays) ? raw.overlays.length : 0;
  if (needsExpr && !expr && !(kind === 'function' && overlayCount > 0)) return null;

  // A sequence is indexed by n, always; the ODE's second name is y, always.
  const varName =
    kind === 'sequence'
      ? 'n'
      : typeof raw.varName === 'string' && /^[a-z]$/i.test(raw.varName.trim())
        ? raw.varName.trim().toLowerCase()
        : 'x';
  if (kind === 'ode' && varName === 'y') return null;

  const rawParams: VizParam[] = (Array.isArray(raw.params) ? raw.params : [])
    .map((p: any): VizParam | null => {
      const id = typeof p?.id === 'string' ? p.id.trim().toLowerCase() : '';
      if (!/^[a-z][a-z0-9]?$/.test(id) || id === varName) return null;
      if (kind === 'ode' && id === 'y') return null; // y is the solution, not a slider
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
    ...(kind === 'matrix' ? { matrix: sanitizeMatrix(raw.matrix) ?? undefined } : {}),
    ...(kind === 'vectors' ? { vectors: sanitizeVectors(raw.vectors) ?? undefined } : {}),
    ...(kind === 'distribution' && DISTS.includes(raw.dist) ? { dist: raw.dist as DistName } : {}),
    ...(kind === 'sequence' && raw.partial !== false ? { partial: true } : {}),
    ...(raw.ghost === true ? { ghost: true } : {}),
    ...(() => {
      const ov = sanitizeOverlays(raw.overlays, varName, params.map((p) => p.id));
      return ov ? { overlays: ov } : {};
    })(),
    ...(typeof raw.title === 'string' && raw.title.trim()
      ? { title: raw.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) }
      : {}),
  });

  // Kinds that carry their objects directly stand or fall on those objects.
  if (scene.kind === 'matrix' && !scene.matrix) return null;
  if (scene.kind === 'vectors' && !scene.vectors?.length) return null;
  if (scene.kind === 'distribution' && !scene.dist) return null;

  // The expression must compile over exactly the names we are prepared to
  // bind. An expression mentioning a name with no slider would evaluate to NaN
  // forever and draw an empty canvas, so it is rejected here instead.
  let fn: CompiledExpr | null = null;
  if (needsExpr && scene.expr) {
    const known = new Set([scene.varName, ...scene.params.map((p) => p.id)]);
    if (scene.kind === 'ode') known.add('y');
    if (freeNames(scene.expr).some((nm) => !known.has(nm))) return null;
    fn = compileScene(scene);
    if (!fn) return null;
    // A constant is not a curve — except in an ODE, where dy/dx = k is a
    // perfectly good field, and y may appear with or without x.
    if (scene.kind !== 'ode' && !fn.vars.includes(scene.varName)) return null;
  }

  // An interval kind needs a real interval.
  if (scene.kind === 'riemann') {
    const a = scene.a ?? scene.view.xMin;
    const b = scene.b ?? scene.view.xMax;
    if (!(b > a)) return null;
    scene.a = a;
    scene.b = b;
  }
  if (
    (scene.kind === 'limit' || scene.kind === 'derivative' || scene.kind === 'taylor') &&
    typeof scene.a !== 'number'
  ) {
    scene.a = 0;
  }

  // A Taylor scene must actually HAVE a series at its centre — abs(x), a pole,
  // a log of a negative — otherwise the lens would open onto an apology.
  if (scene.kind === 'taylor') {
    const scope: Record<string, number> = {};
    for (const pm of scene.params) if (pm.id !== 'k') scope[pm.id] = pm.value;
    if (!taylorCoeffs(scene.expr, scene.varName, scope, scene.a ?? 0, 2)) return null;
  }

  if (!sceneDraws(scene)) return null;

  // Finally: it has to actually draw. A scene whose viewport comes out
  // degenerate would render NaN coordinates.
  const view = resolveView(scene, fn);
  if (!Number.isFinite(view.yMin) || !Number.isFinite(view.yMax) || !(view.yMax > view.yMin)) {
    return null;
  }
  return scene;
}
