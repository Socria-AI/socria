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
import {
  binds as econBinds,
  equilibrium as econEquilibrium,
  frontierAt as econFrontierAt,
  marketAt as econMarketAt,
  opportunityCost as econOpportunityCost,
  outputGap as econOutputGap,
  priceAt as econPriceAt,
  shift as econShift,
  taxedSupply as econTaxedSupply,
  taxIncidence as econTaxIncidence,
  welfare as econWelfare,
} from './logos-econ';

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

// ── the open kind's parts ───────────────────────────────────────────
//
// A mirror of VizObject, with two differences: every coordinate may be an
// expression over the scene's parameters, and there is no `id` — ids are
// assigned on the way out, so the extractor cannot collide them or leave one
// out. Curves carry their own `expr` rather than the scene's, which is why
// `diagram` sits in OBJECT_KINDS: the scene as a whole has no single formula.

/** A number, or an expression over the parameters that evaluates to one. */
export type NumOrExpr = number | string;

export type DiagramPart =
  | { o: 'curve'; expr: string; from?: NumOrExpr; to?: NumOrExpr; tone?: Tone; dashed?: boolean; width?: number; label?: string }
  | { o: 'point'; x: NumOrExpr; y: NumOrExpr; tone?: Tone; hollow?: boolean; label?: string }
  | { o: 'segment'; x1: NumOrExpr; y1: NumOrExpr; x2: NumOrExpr; y2: NumOrExpr; tone?: Tone; dashed?: boolean; width?: number }
  | { o: 'line'; x: NumOrExpr; y: NumOrExpr; slope: NumOrExpr; tone?: Tone; dashed?: boolean; width?: number }
  | { o: 'vector'; x1: NumOrExpr; y1: NumOrExpr; x2: NumOrExpr; y2: NumOrExpr; tone?: Tone; label?: string }
  | { o: 'region'; pts: { x: NumOrExpr; y: NumOrExpr }[]; tone?: Tone }
  | { o: 'rects'; bars: { x0: NumOrExpr; x1: NumOrExpr; y: NumOrExpr }[]; tone?: Tone }
  | { o: 'sequence'; pts: { x: NumOrExpr; y: NumOrExpr }[]; tone?: Tone; stems?: boolean }
  | { o: 'vrule'; at: NumOrExpr; tone?: Tone; dashed?: boolean; label?: string }
  | { o: 'hrule'; at: NumOrExpr; tone?: Tone; dashed?: boolean; label?: string }
  | { o: 'label'; x: NumOrExpr; y: NumOrExpr; text: string; tone?: Tone; anchor?: 'start' | 'middle' | 'end'; dy?: number };

export interface DiagramQuantity {
  tex: string;
  expr: string;
  help?: string;
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
  // Introductory economics. Three diagrams carry most of a first course, and
  // all three are drawings you are meant to MOVE — which is exactly what this
  // renderer already does and what a textbook cannot.
  'supply-demand',
  'ppc',
  'ad-as',
  // The open one. Every kind above is a named picture with a builder that
  // knows its mathematics; this is the picture nobody wrote a builder for —
  // a titration curve, a free-body diagram, a phase change, a timeline, a
  // budget line, a food web, whatever the conversation is actually about.
  // The extractor authors the parts itself out of the same primitives the
  // other builders emit, so it is live, zoomable and slider-driven like the
  // rest rather than a picture of a picture.
  'diagram',
] as const;
export type VizKind = (typeof VIZ_KINDS)[number];

/**
 * The economics diagrams, which are NOT mathematics-context work.
 *
 * A supply-and-demand conversation is about markets, and the extractor
 * labels it learning or analysing. Anything deciding whether a scene may
 * exist has to ask which KIND it is rather than what the conversation was
 * called, or these are thrown away in exactly the conversations they are for.
 */
export const ECON_KINDS = new Set<VizKind>(['supply-demand', 'ppc', 'ad-as']);

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
 * How many decimals a slider needs before one step of it is visible.
 *
 * A slider whose step is 0.0006 printed at three decimals reads 0.001, then
 * 0.001, then 0.002 — it looks stuck, and worse, it disagrees with anything
 * else on screen showing the same quantity to more places. Deriving the
 * precision from the step means the number always moves when the handle does.
 */
export function precisionFor(step: number, cap = 6): number {
  if (!Number.isFinite(step) || step <= 0) return 3;
  return Math.min(cap, Math.max(0, Math.ceil(-Math.log10(step))));
}

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
const OBJECT_KINDS = new Set<VizKind>([
  'vectors',
  'matrix',
  'distribution',
  // The economics scenes are parameterised by their curves, not by an
  // expression someone typed: a demand curve is an intercept and a slope.
  'supply-demand',
  'ppc',
  'ad-as',
  // A diagram's curves each carry their own expression; the scene has no
  // single one, so requiring scene.expr would reject every one of them.
  'diagram',
]);

export function kindNeedsExpr(kind: VizKind): boolean {
  return !OBJECT_KINDS.has(kind);
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

  // ── economics ──
  // Written the way a textbook draws them: price on the vertical axis, so a
  // "curve" here is P as a function of Q. See lib/logos-econ.ts.
  /** supply-demand: the two curves, as P = intercept + slope·Q */
  demand?: { intercept: number; slope: number };
  supply?: { intercept: number; slope: number };
  /** supply-demand: an imposed price, when there is one */
  control?: { kind: 'ceiling' | 'floor'; at: number };
  /**
   * supply-demand: a per-unit tax, in the same money as the prices.
   *
   * Present at all means the diagram is about incidence, and the `t` slider
   * appears. A control and a tax are two different lessons and are not drawn
   * together — a market can have both, but a first course never asks it to,
   * and the diagram would have four prices on it.
   */
  tax?: number;
  /** supply-demand: shade consumer and producer surplus */
  surplus?: boolean;
  /**
   * ppc: the frontier, whether opportunity cost increases along it, and which
   * good the growth control acts on.
   *
   * `grows` is the difference between an economy getting richer and an
   * economy getting better at ONE thing. Uniform growth slides the whole
   * frontier out; growth in a single good pivots it, and the pivot is the
   * more interesting picture — you can now have more guns without giving up
   * any butter, and the opportunity cost of every gun has changed.
   */
  frontier?: { xMax: number; yMax: number; bowed: boolean; grows?: 'both' | 'x' | 'y' };
  // ── the open kind ──
  /**
   * diagram: the parts the extractor drew, in the scene's own coordinates.
   *
   * Every slot that takes a number also takes an EXPRESSION over the scene's
   * parameters, which is what keeps an authored picture live: a point at
   * `{x: 'c', y: 'k*c'}` moves when the c slider moves, so the model can draw
   * a concentration, a force balance or a break-even point and hand the
   * reader the control that makes it mean something.
   */
  parts?: DiagramPart[];
  /**
   * diagram: quantities computed from the parameters and shown beside the
   * picture, the way every other kind's readouts are. `tex` names it, `expr`
   * computes it, `help` says what it is without giving the number away.
   */
  quantities?: DiagramQuantity[];
  /** diagram: the words under and beside it, authored rather than derived */
  says?: { caption?: string; narration?: string; ask?: string };
  /** what the axes are counting — "Guns", "Butter", "Real GDP" */
  axes?: { x: string; y: string };
  /** ad-as: aggregate demand and short-run aggregate supply */
  ad?: { intercept: number; slope: number };
  sras?: { intercept: number; slope: number };
  /** ad-as: potential output — where LRAS stands */
  potential?: number;
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

const xMinOf = (sc: VizScene) => sc.view.xMin;
const xMaxOf = (sc: VizScene) => sc.view.xMax;

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

  // ── the open kind ──
  // A diagram's window is its own contents and nothing else: the parts were
  // authored in whatever units the subject uses, and pH against millilitres
  // or a decade of years would be invisible in the default window a function
  // gets. Computed at the DEFAULT parameters, like every branch here, so
  // moving a slider moves the picture rather than the frame around it.
  if (scene.kind === 'diagram') {
    const names = scene.params.map((q) => q.id);
    const xs: number[] = [];
    const ys: number[] = [];
    const take = (x: number, y: number) => {
      if (Number.isFinite(x)) xs.push(x);
      if (Number.isFinite(y)) ys.push(y);
    };
    const at = (v: NumOrExpr | undefined): number => coord(v, scope, names);
    for (const part of scene.parts ?? []) {
      switch (part.o) {
        case 'point':
        case 'label':
          take(at(part.x), at(part.y));
          break;
        case 'segment':
        case 'vector':
          take(at(part.x1), at(part.y1));
          take(at(part.x2), at(part.y2));
          break;
        case 'region':
        case 'sequence':
          for (const q of part.pts) take(at(q.x), at(q.y));
          break;
        case 'rects':
          for (const b of part.bars) { take(at(b.x0), at(b.y)); take(at(b.x1), 0); }
          break;
        case 'vrule': {
          const a = at(part.at);
          if (Number.isFinite(a)) xs.push(a);
          break;
        }
        case 'hrule': {
          const a = at(part.at);
          if (Number.isFinite(a)) ys.push(a);
          break;
        }
        case 'curve': {
          // Sampled coarsely — this only has to find the extent, and the
          // window must not depend on how finely the curve is later drawn.
          const cf = diagramExpr(part.expr, [scene.varName, ...names, ...ALPHABET]);
          if (!cf) break;
          const cfree = cf.vars.filter((v) => !(v in scope));
          const cvar = cfree.includes(scene.varName) ? scene.varName : (cfree[0] ?? scene.varName);
          const from = part.from === undefined ? xMinOf(scene) : at(part.from);
          const to = part.to === undefined ? xMaxOf(scene) : at(part.to);
          if (!Number.isFinite(from) || !Number.isFinite(to) || to === from) break;
          for (let i = 0; i <= 48; i++) {
            const x = from + ((to - from) * i) / 48;
            take(x, cf.eval({ ...scope, [cvar]: x }));
          }
          break;
        }
        case 'line':
          take(at(part.x), at(part.y));
          break;
      }
    }
    if (xs.length && ys.length) {
      const [xlo, xhi] = pad(Math.min(...xs), Math.max(...xs));
      const [ylo, yhi] = pad(Math.min(...ys), Math.max(...ys));
      return { xMin: xlo, xMax: xhi, yMin: ylo, yMax: yhi };
    }
    // Nothing measurable: fall through to the generic window rather than
    // returning one built from an empty list, which would be NaN on all four
    // sides and take the whole panel down.
    return null;
  }

  // ── economics ──
  // These diagrams live in the first quadrant and nowhere else. Quantity and
  // price are not negative, and a window centred on the origin the way a
  // function's is would spend three quarters of itself on regions the model
  // does not describe. The frame is the curves' own extent, with a margin so
  // the intercepts are not sitting on the axes.
  if (scene.kind === 'supply-demand') {
    const D = scene.demand ?? { intercept: 100, slope: -1 };
    const S = scene.supply ?? { intercept: 20, slope: 1 };
    // Out to where demand hits the axis: past that the model has stopped.
    const qCap = D.slope < 0 ? -D.intercept / D.slope : 100;
    const pCap = Math.max(D.intercept, S.intercept + Math.abs(S.slope) * qCap);
    return { xMin: 0, xMax: qCap * 1.08, yMin: 0, yMax: pCap * 1.1 };
  }

  if (scene.kind === 'ppc') {
    const f = scene.frontier ?? { xMax: 100, yMax: 100, bowed: true };
    // Room for growth to push the frontier outward without it leaving.
    const gMax = scene.params.find((p) => p.id === 'g')?.max ?? 1.25;
    const grows = f.grows ?? 'both';
    // Reserve headroom only on the axis growth can actually move. A pivot in
    // x has no business shrinking the y half of the picture.
    const gx = grows === 'y' ? 1 : gMax;
    const gy = grows === 'x' ? 1 : gMax;
    return { xMin: 0, xMax: f.xMax * gx * 1.04, yMin: 0, yMax: f.yMax * gy * 1.04 };
  }

  if (scene.kind === 'ad-as') {
    const AD = scene.ad ?? { intercept: 140, slope: -1 };
    const SR = scene.sras ?? { intercept: 20, slope: 1 };
    const yp = scene.potential ?? 60;
    const yCap = Math.max(AD.slope < 0 ? -AD.intercept / AD.slope : 100, yp * 1.6);
    const pCap = Math.max(AD.intercept, SR.intercept + Math.abs(SR.slope) * yCap);
    return { xMin: 0, xMax: yCap * 1.05, yMin: 0, yMax: pCap * 1.1 };
  }

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

  // What you read at the δ you have, and where those readings are heading.
  //
  // δ itself is deliberately NOT here: the slider a few pixels away is
  // labelled "δ → 0", shows the value, and carries the same explanation. A
  // second copy of it was one more number to read and — because the two were
  // formatted to different precisions — one that could disagree with itself.
  const readouts: VizReadout[] = [
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

  // The two one-sided limits are shown only when they have something to say.
  //
  // When both sides arrive at the same place — the ordinary case, and every
  // removable hole — they read "4", "4" above a two-sided limit that also
  // reads "4", which is three lines to make one point. When they DISAGREE
  // they are the whole story, because they are the reason the two-sided limit
  // does not exist. So they appear exactly then, and the row stays short the
  // rest of the time.
  const sidesInformative = !(Ln.kind === 'value' && Rn.kind === 'value' && Two.kind === 'value');
  if (sidesInformative) {
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
      }
    );
  }

  // The limit itself is always the answer, so the guard holds it.
  readouts.push(
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

/**
 * A person's own words, made safe to sit inside \text{...}.
 *
 * Axis names come from the model — "Guns", "Consumer goods", "Real GDP" — and
 * go straight into a LaTeX readout. A stray backslash or brace there does not
 * produce a wrong label, it produces a KaTeX parse error where a quantity
 * should be, so the characters that could do that are dropped rather than
 * escaped: none of them belongs in the name of an axis.
 */
function texEscape(s: string): string {
  return s.replace(/[\\{}$&#^_~%]/g, '').slice(0, 40);
}

// --- economics: supply and demand -----------------------------------
//
// The diagram a first course spends the most time in. What it has to make
// visible, in order: where the market lands on its own, what moves when a
// curve shifts, and what a price someone imposed does to the quantity that
// actually changes hands.

const buildSupplyDemand: Builder = (scene, _fn, vals, view, guarded) => {
  const d0 = scene.demand ?? { intercept: 100, slope: -1 };
  const s0 = scene.supply ?? { intercept: 20, slope: 1 };
  const dsh = vals.dsh ?? 0;
  // An INCREASE in supply moves the curve down and to the right, so the
  // intercept falls. Left as-is, dragging the slider marked "more supply" to
  // the right would have reduced supply — technically the truth about an
  // intercept, and the opposite of what the label promises. The sign is
  // flipped here so the control means what it says.
  const ssh = -(vals.ssh ?? 0);
  const D = econShift(d0, dsh);
  const S = econShift(s0, ssh);

  const objects: VizObject[] = [];
  const readouts: VizReadout[] = [];
  /** Welfare figures, appended after the equilibrium — see the note below. */
  const welfare: VizReadout[] = [];
  const qHi = view.xMax;

  const eq = econEquilibrium(D, S);
  const control = scene.control;
  const pc = control ? (vals.pc ?? control.at) : null;
  const bind = eq && control && pc !== null ? econBinds(control.kind, pc, eq.p) : false;

  // A per-unit tax. Drawn as a shift of supply, because that is what it is:
  // sellers need the old price plus the tax for every quantity. The taxed
  // curve is what the market now clears against, and the two prices it
  // produces — one for buyers, one for sellers — are the whole lesson.
  const t = scene.tax != null ? Math.max(0, vals.t ?? scene.tax) : 0;
  const taxOn = t > 1e-9 && !!eq;
  const St = taxOn ? econTaxedSupply(S, t) : S;
  const inc = taxOn ? econTaxIncidence(D, S, t) : null;

  // The curves, drawn across the window rather than sampled: they are lines.
  const seg = (line: { intercept: number; slope: number }, id: string, tone: Tone, label: string) => {
    objects.push({
      o: 'segment',
      id,
      x1: 0,
      y1: econPriceAt(line, 0),
      x2: qHi,
      y2: econPriceAt(line, qHi),
      tone,
      width: 2,
    });
    objects.push({
      o: 'label',
      id: `${id}lab`,
      x: qHi * 0.94,
      y: econPriceAt(line, qHi * 0.94),
      text: label,
      tone,
      anchor: 'end',
      dy: -6,
    });
  };

  // The original positions stay as ghosts once something has moved, so a
  // shift reads as a shift rather than as a different diagram.
  if (dsh !== 0) {
    objects.push({ o: 'segment', id: 'd0', x1: 0, y1: econPriceAt(d0, 0), x2: qHi, y2: econPriceAt(d0, qHi), tone: 'ghost', dashed: true, width: 1.3 });
  }
  if (ssh !== 0) {
    objects.push({ o: 'segment', id: 's0', x1: 0, y1: econPriceAt(s0, 0), x2: qHi, y2: econPriceAt(s0, qHi), tone: 'ghost', dashed: true, width: 1.3 });
  }
  seg(D, 'D', 'accent', 'D');
  seg(S, 'S', 'tension', 'S');
  // The taxed curve sits above the untaxed one by exactly the tax, and both
  // stay on screen: the distance between them IS the tax, and hiding the
  // original would turn the clearest measurement on the diagram into a
  // number in a list.
  if (taxOn) {
    objects.push({
      o: 'segment',
      id: 'St',
      x1: 0,
      y1: econPriceAt(St, 0),
      x2: qHi,
      y2: econPriceAt(St, qHi),
      tone: 'primary',
      width: 2,
    });
    objects.push({
      o: 'label',
      id: 'Stlab',
      x: qHi * 0.94,
      y: econPriceAt(St, qHi * 0.94),
      text: 'S + t',
      tone: 'primary',
      anchor: 'end',
      dy: -6,
    });
  }

  if (eq) {
    // Surplus areas first, so the curves and guides draw over them.
    if (scene.surplus && !guarded) {
      // Three cases, and only the tax has two prices: buyers measure their
      // surplus against what they paid, sellers against what they kept.
      const price = inc ? inc.pricePaid : bind && pc !== null ? pc : eq.p;
      const priceGot = inc ? inc.priceReceived : price;
      const m = econMarketAt(D, S, price);
      const q = inc ? inc.quantity : bind ? m.traded : eq.q;
      objects.push({
        o: 'region',
        id: 'cs',
        pts: [
          { x: 0, y: D.intercept },
          { x: 0, y: price },
          { x: q, y: price },
          { x: q, y: econPriceAt(D, q) },
        ],
        tone: 'accent',
      });
      objects.push({
        o: 'region',
        id: 'ps',
        pts: [
          { x: 0, y: S.intercept },
          { x: 0, y: priceGot },
          { x: q, y: priceGot },
          { x: q, y: econPriceAt(S, q) },
        ],
        tone: 'tension',
      });
      // What the tax collects: the rectangle between the two prices, over
      // every unit still traded. It is drawn because it is not lost — it is
      // the part of the wedge that goes somewhere, and a diagram that shades
      // the loss without shading the revenue makes a tax look like pure
      // destruction.
      if (inc) {
        objects.push({
          o: 'region',
          id: 'rev',
          pts: [
            { x: 0, y: priceGot },
            { x: 0, y: price },
            { x: q, y: price },
            { x: q, y: priceGot },
          ],
          tone: 'primary',
        });
      }
      // The loss, drawn where it is: the wedge between what the next buyer
      // would have paid and what the next seller would have accepted, over
      // the trades that a binding control has made illegal. Naming it in a
      // readout without shading it leaves the most important number on the
      // diagram pointing at nothing.
      if ((bind || inc) && eq && q < eq.q - 1e-9) {
        objects.push({
          o: 'region',
          id: 'dwl',
          pts: [
            { x: q, y: econPriceAt(D, q) },
            { x: eq.q, y: eq.p },
            { x: q, y: econPriceAt(S, q) },
          ],
          tone: 'muted',
        });
      }

      // Held back, not pushed. The shading has to be drawn before the curves,
      // but the NUMBERS belong last: the row is read left to right, and
      // welfare arithmetic arriving before "what is the price" buries the
      // answer behind three figures that only make sense once you have it.
      const w = econWelfare(D, S, q, price, priceGot, inc ? inc.revenue : 0);
      welfare.push(
        { id: 'cs', tex: '\\text{CS}', value: fmt(w.consumer, 4), help: 'Consumer surplus: what buyers were willing to pay, less what they did pay, added up over everyone who bought.' },
        { id: 'ps', tex: '\\text{PS}', value: fmt(w.producer, 4), help: 'Producer surplus: what sellers received, less the least they would have accepted.' }
      );
      if (inc) {
        welfare.push({
          id: 'rev',
          tex: '\\text{revenue}',
          value: fmt(inc.revenue, 4),
          help: 'What the tax collects: the tax on every unit still traded. Not lost — moved.',
        });
      }
      if (w.deadweight > 1e-6) {
        welfare.push({
          id: 'dwl',
          tex: '\\text{DWL}',
          value: fmt(w.deadweight, 4),
          help: inc
            ? 'Deadweight loss: the surplus from trades that no longer happen. Nobody gets this — not the buyers, not the sellers, not the government.'
            : 'Deadweight loss: surplus that simply is not created, because trades both sides would have agreed to are no longer allowed to happen.',
        });
      }
    }

    objects.push({ o: 'point', id: 'eq', x: eq.q, y: eq.p, tone: taxOn ? 'ghost' : 'primary' });
    objects.push({ o: 'segment', id: 'eqv', x1: eq.q, y1: 0, x2: eq.q, y2: eq.p, tone: 'ghost', dashed: true });
    objects.push({ o: 'segment', id: 'eqh', x1: 0, y1: eq.p, x2: eq.q, y2: eq.p, tone: 'ghost', dashed: true });
    readouts.push(
      { id: 'pe', tex: 'P^{*}', value: guarded ? null : fmt(eq.p, 4), help: 'The price where the amount wanted and the amount offered are the same number. Nothing pushes it from there.' },
      { id: 'qe', tex: 'Q^{*}', value: guarded ? null : fmt(eq.q, 4), help: 'The quantity that changes hands at the equilibrium price.' }
    );

    // The wedge. Two points on one vertical line, the tax apart, with the
    // traded quantity dropped to the axis — the picture a course draws.
    if (inc) {
      objects.push({ o: 'point', id: 'pb', x: inc.quantity, y: inc.pricePaid, tone: 'accent' });
      objects.push({ o: 'point', id: 'ps', x: inc.quantity, y: inc.priceReceived, tone: 'tension' });
      objects.push({
        o: 'segment',
        id: 'wedge',
        x1: inc.quantity,
        y1: inc.priceReceived,
        x2: inc.quantity,
        y2: inc.pricePaid,
        tone: 'primary',
        width: 3,
      });
      objects.push({ o: 'segment', id: 'qtv', x1: inc.quantity, y1: 0, x2: inc.quantity, y2: inc.priceReceived, tone: 'ghost', dashed: true });
      readouts.push(
        { id: 'pb', tex: 'P_b', value: guarded ? null : fmt(inc.pricePaid, 4), help: 'What buyers hand over, once the tax is on. Higher than the old price — but by less than the tax.' },
        { id: 'ps', tex: 'P_s', value: guarded ? null : fmt(inc.priceReceived, 4), help: 'What sellers keep. The gap between this and what buyers paid is exactly the tax.' },
        { id: 'qt', tex: 'Q_t', value: guarded ? null : fmt(inc.quantity, 4), help: 'How much still trades. Fewer units than before — that shrinkage is where the loss comes from.' },
        {
          id: 'inc',
          tex: '\\text{buyers}',
          value: guarded ? null : `${fmt((inc.buyerShare / (t || 1)) * 100, 3)}\\%`,
          help: 'The share of the tax buyers carry, as a rise in what they pay. Decided by the slopes, never by who is made to send the money in.',
        }
      );
    }
  }

  // The control, and what it does.
  let imbalance = 0;
  if (control && pc !== null) {
    objects.push({
      o: 'hrule',
      id: 'pc',
      at: pc,
      tone: bind ? 'primary' : 'muted',
      dashed: !bind,
      label: control.kind === 'ceiling' ? 'ceiling' : 'floor',
    });
    const m = econMarketAt(D, S, pc);
    imbalance = m.imbalance;
    if (bind) {
      // The gap between the two sides, drawn AT the control price where the
      // shortage or surplus actually is.
      objects.push({ o: 'segment', id: 'gap', x1: Math.min(m.qd, m.qs), y1: pc, x2: Math.max(m.qd, m.qs), y2: pc, tone: 'tension', width: 3 });
      objects.push({ o: 'point', id: 'qd', x: m.qd, y: pc, tone: 'accent', hollow: true });
      objects.push({ o: 'point', id: 'qs', x: m.qs, y: pc, tone: 'tension', hollow: true });
      readouts.push(
        { id: 'qd', tex: 'Q_d', value: guarded ? null : fmt(m.qd, 4), help: 'How much buyers want at the imposed price.' },
        { id: 'qs', tex: 'Q_s', value: guarded ? null : fmt(m.qs, 4), help: 'How much sellers offer at that price.' },
        {
          id: 'gap',
          tex: imbalance > 0 ? '\\text{shortage}' : '\\text{surplus}',
          value: guarded ? null : fmt(Math.abs(imbalance), 4),
          help: 'The difference between the two. Only the smaller of them actually trades — nobody can be made to buy or sell.',
        }
      );
    }
  }

  // Which curve moved decides what is said. Keying this on the demand slider
  // alone meant that shifting SUPPLY produced a story about demand — the
  // numbers were right and the sentence beside them described a different
  // experiment, which is worse than saying nothing.
  const movedD = dsh !== 0;
  const movedS = ssh !== 0;
  const narration = !eq
    ? 'These two curves do not cross anywhere a market could exist. Shift one until they do.'
    : inc
      ? `The tax opens a gap between two prices that used to be one. Buyers pay ${fmt(inc.pricePaid, 4)} and sellers keep ${fmt(inc.priceReceived, 4)}; the ${fmt(t, 3)} between them is the tax. Buyers carry ${fmt((inc.buyerShare / (t || 1)) * 100, 3)}% of it — and notice that this was decided by the slopes of the two curves, not by which side the law collects from. Fewer units trade than before, and the surplus from those lost trades goes to nobody at all.`
      : taxOn
        ? 'A tax this large closes the market rather than shrinking it: there is no price left at which anyone still trades. Bring it down until the curves cross again.'
        : bind && imbalance > 0
      ? 'The ceiling holds the price below where the market would settle. Buyers want more than sellers will offer, and only the smaller amount trades — that gap is the shortage.'
      : bind && imbalance < 0
        ? 'The floor holds the price above the market price. Sellers offer more than buyers will take, and the unsold difference is the surplus.'
        : !movedD && !movedS
          ? 'The market at rest. Where the two curves cross is the only price at which the amount wanted and the amount offered are the same.'
          : movedD && movedS
            ? 'Both curves have moved. When that happens one of the two — price or quantity — is settled by the shifts and the other depends on which shift was larger; that is the whole difficulty of a double shift.'
            : movedD
              ? dsh > 0
                ? 'More is wanted at every price, so the crossing rides up the supply curve: price and quantity both end higher.'
                : 'Less is wanted at every price. The crossing slides down the supply curve — price and quantity both fall.'
              : ssh < 0
                ? 'Supply has increased: more is offered at every price. The crossing slides down the demand curve, so the price falls while the quantity rises — the two move opposite ways, which is how you tell a supply shift from a demand one.'
                : 'Supply has fallen: less is offered at every price. The crossing rides up the demand curve, so the price rises and the quantity falls.';

  return {
    objects,
    readouts: [...readouts, ...welfare],
    narration,
    caption:
      scene.tax != null
        ? 'Open the tax from zero and watch one price become two.'
        : control
          ? 'Move the control price through the market price and watch the gap open.'
          : 'Shift demand or supply and watch where the market settles.',
    ask:
      scene.tax != null
        ? 'Before you move it — the tax is collected from sellers. Does that mean sellers are the ones who pay it?'
        : 'Before you move anything — if demand rises, which way does the price go, and why?',
  };
};

// --- economics: the production possibilities curve -------------------
//
// Opportunity cost made into a picture. The frontier is what you can have;
// its SLOPE is what the next unit costs, and on a bowed frontier that cost
// climbs as you specialise — which is the whole reason the curve is bowed.

const buildPpc: Builder = (scene, _fn, vals, view, guarded) => {
  const base = scene.frontier ?? { xMax: 100, yMax: 100, bowed: true, grows: 'both' as const };
  const g = vals.g ?? 1;
  const grows = base.grows ?? 'both';
  // Growth in one good PIVOTS the frontier; growth in both slides it out.
  const f = {
    xMax: base.xMax * (grows === 'y' ? 1 : g),
    yMax: base.yMax * (grows === 'x' ? 1 : g),
    bowed: base.bowed,
  };
  const names = scene.axes ?? { x: 'good X', y: 'good Y' };

  const objects: VizObject[] = [];
  const readouts: VizReadout[] = [];

  // The frontier itself, sampled because the bowed one is a curve.
  const pts: Pt[] = [];
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const x = (f.xMax * i) / N;
    const y = econFrontierAt(f, x);
    if (Number.isFinite(y)) pts.push({ x, y });
  }
  objects.push({ o: 'curve', id: 'ppc', pts, tone: 'primary', width: 2.2 });

  // Where it started, once growth has moved it.
  if (Math.abs(g - 1) > 1e-9) {
    const was: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const x = (base.xMax * i) / N;
      const y = econFrontierAt(base, x);
      if (Number.isFinite(y)) was.push({ x, y });
    }
    objects.push({ o: 'curve', id: 'ppc0', pts: was, tone: 'ghost', width: 1.4, dashed: true });
  }

  const q = Math.min(f.xMax, Math.max(0, vals.q ?? 0));
  const y = econFrontierAt(f, q);
  if (Number.isFinite(y)) {
    objects.push({ o: 'point', id: 'on', x: q, y, tone: 'primary' });
    objects.push({ o: 'segment', id: 'gx', x1: q, y1: 0, x2: q, y2: y, tone: 'ghost', dashed: true });
    objects.push({ o: 'segment', id: 'gy', x1: 0, y1: y, x2: q, y2: y, tone: 'ghost', dashed: true });
  }

  // One point inside and one outside, because the frontier only means
  // something against what it rules in and out.
  const inX = f.xMax * 0.35;
  const inY = econFrontierAt(f, inX) * 0.55;
  objects.push({ o: 'point', id: 'ineff', x: inX, y: inY, tone: 'muted', hollow: true, label: 'unused capacity' });
  const outX = f.xMax * 0.62;
  const outY = econFrontierAt(f, outX) * 1.35;
  objects.push({ o: 'point', id: 'unatt', x: outX, y: outY, tone: 'ghost', hollow: true, label: 'out of reach' });

  const oc = econOpportunityCost(f, q);
  readouts.push(
    { id: 'x', tex: `\\text{${texEscape(names.x)}}`, value: guarded ? null : fmt(q, 4), help: `How much of ${names.x} is being produced.` },
    { id: 'y', tex: `\\text{${texEscape(names.y)}}`, value: guarded ? null : fmt(y, 4), help: `What is left over for ${names.y} once that choice is made. The frontier, not preference, is what fixes this.` },
    {
      id: 'oc',
      tex: '\\text{opportunity cost}',
      value: guarded ? null : Number.isFinite(oc) ? fmt(oc, 3) : '\\infty',
      help: `Units of ${names.y} given up for one more unit of ${names.x}. It is the steepness of the frontier where you are standing — which is why a bowed curve makes each extra unit cost more than the last.`,
    }
  );

  const stage = sweepStage(scene.params.find((p) => p.id === 'q') ?? null, q);
  const narration = !base.bowed
    ? 'A straight frontier: every unit of the first good costs the same amount of the second, wherever you stand on it. Resources are equally good at both jobs.'
    : stage === 0
      ? 'Everything is going to the second good. The first unit of the other one is nearly free — the resources moved across are the ones worst suited to what they were doing.'
      : stage === 1
        ? 'Moving along the frontier. Each extra unit costs a little more than the last, because the resources being moved are better and better at the job they are leaving.'
        : stage === 2
          ? 'The curve is steepening. This is increasing opportunity cost, and it is the only thing the bow in the frontier means.'
          : 'Almost everything is going to the first good now, and the last few units are costing enormous amounts of the second. That is why specialising completely is rarely the choice anyone makes.';

  return {
    objects,
    readouts,
    narration,
    caption:
      'Slide along the frontier. Inside it, resources are idle; outside is unattainable — until the frontier itself moves.',
    ask: 'Which costs more: the first unit of X, or the last one? Move the handle and see whether you were right.',
  };
};

// --- economics: aggregate demand and supply --------------------------
//
// The macro picture. Same crossing as a market, with one addition that
// changes what the diagram is FOR: a vertical line at potential output, so
// every equilibrium is read as a distance from it rather than on its own.

const buildAdAs: Builder = (scene, _fn, vals, view, guarded) => {
  const ad0 = scene.ad ?? { intercept: 140, slope: -1 };
  const sr0 = scene.sras ?? { intercept: 20, slope: 1 };
  const AD = econShift(ad0, vals.adsh ?? 0);
  const SR = econShift(sr0, vals.srsh ?? 0);
  const yp = scene.potential ?? 60;

  const objects: VizObject[] = [];
  const readouts: VizReadout[] = [];
  const hi = view.xMax;

  const line = (l: { intercept: number; slope: number }, id: string, tone: Tone, label: string) => {
    objects.push({ o: 'segment', id, x1: 0, y1: econPriceAt(l, 0), x2: hi, y2: econPriceAt(l, hi), tone, width: 2 });
    objects.push({ o: 'label', id: `${id}l`, x: hi * 0.95, y: econPriceAt(l, hi * 0.95), text: label, tone, anchor: 'end', dy: -6 });
  };

  if ((vals.adsh ?? 0) !== 0) {
    objects.push({ o: 'segment', id: 'ad0', x1: 0, y1: econPriceAt(ad0, 0), x2: hi, y2: econPriceAt(ad0, hi), tone: 'ghost', dashed: true, width: 1.3 });
  }
  if ((vals.srsh ?? 0) !== 0) {
    objects.push({ o: 'segment', id: 'sr0', x1: 0, y1: econPriceAt(sr0, 0), x2: hi, y2: econPriceAt(sr0, hi), tone: 'ghost', dashed: true, width: 1.3 });
  }
  line(AD, 'AD', 'accent', 'AD');
  line(SR, 'SRAS', 'tension', 'SRAS');
  objects.push({ o: 'vrule', id: 'lras', at: yp, tone: 'primary', label: 'LRAS' });

  const eq = econEquilibrium(AD, SR);
  let gapKind = 'at potential';
  if (eq) {
    objects.push({ o: 'point', id: 'eq', x: eq.q, y: eq.p, tone: 'primary' });
    objects.push({ o: 'segment', id: 'gh', x1: 0, y1: eq.p, x2: eq.q, y2: eq.p, tone: 'ghost', dashed: true });
    const gap = econOutputGap(eq.q, yp);
    gapKind = gap.kind;
    if (gap.kind !== 'at potential') {
      // The gap itself, drawn along the output axis where it is measured.
      objects.push({ o: 'segment', id: 'gap', x1: Math.min(eq.q, yp), y1: eq.p, x2: Math.max(eq.q, yp), y2: eq.p, tone: 'tension', width: 3 });
    }
    readouts.push(
      { id: 'pl', tex: '\\text{price level}', value: guarded ? null : fmt(eq.p, 4), help: 'The average level of prices, not the price of any one thing. Its rate of change is inflation.' },
      { id: 'y', tex: 'Y', value: guarded ? null : fmt(eq.q, 4), help: 'Real output — what the economy actually produces, corrected for prices.' },
      {
        id: 'gap',
        tex: '\\text{output gap}',
        value: guarded ? null : `${fmt(gap.gap, 3)} (${gap.kind})`,
        help: 'Actual output less potential. Below potential is a recessionary gap and unemployment above its natural rate; above it is an inflationary gap that cannot last.',
      }
    );
  }

  // A shift parameter that opens at 0 in the MIDDLE of its range reads as
  // half-swept, so the stage cannot be used to detect "nothing has happened
  // yet" the way it can for a sweep that starts at one end. Ask the values.
  const moved = (vals.adsh ?? 0) !== 0 || (vals.srsh ?? 0) !== 0;
  const narration = !eq
    ? 'AD and SRAS do not cross in a region that describes an economy. Shift one of them.'
    : gapKind === 'recessionary'
      ? 'Output has settled below potential. LRAS has not moved — the economy is capable of more than it is producing, which is what a recessionary gap is.'
      : gapKind === 'inflationary'
        ? 'Output is above potential. That is not a better economy; it is one running hotter than it can sustain, and the price level is where the pressure shows.'
        : !moved
          ? 'The economy at potential: the crossing sits on LRAS, so what is produced is what can be produced.'
          : 'The curves have moved but output is still at potential. Watch the distance between the crossing and LRAS — that distance is the whole diagnosis.';

  return {
    objects,
    readouts,
    narration,
    caption: 'Shift AD or SRAS. LRAS does not move — it is what the economy can do, not what it is doing.',
    ask: 'If aggregate demand rises with the economy already at potential, what happens to output, and what happens to prices?',
  };
};


// --- the open kind: whatever this conversation is actually about ----
//
// Every builder above knows a subject. This one knows none, and that is the
// point: the extractor authors the parts and this draws them. A titration
// curve, a free-body diagram, a budget line, a cooling curve, a timeline —
// none of them will ever have a builder of their own, and all of them are
// made of the same segments, points, regions and labels the named kinds emit.
//
// What makes it more than a picture is that every coordinate may be an
// EXPRESSION over the scene's parameters. Author a point at (c, k*c) and give
// the reader a c slider, and the diagram moves the way the named kinds move.

/**
 * Compiled expressions, kept between frames.
 *
 * A diagram is rebuilt on every animation tick and its parts do not change
 * between them, so compiling each coordinate sixty times a second is work
 * nobody asked for. Keyed on the source text and the parameter names, because
 * the same text means something different once a slider is renamed.
 */
const diagramExprCache = new Map<string, CompiledExpr | null>();
const DIAGRAM_CACHE_MAX = 512;

function diagramExpr(src: string, names: string[]): CompiledExpr | null {
  const key = `${names.join(',')}|${src}`;
  const hit = diagramExprCache.get(key);
  if (hit !== undefined) return hit;
  const compiled = compileExpr(src, names);
  // Bounded: a long session that keeps rewording its diagram must not grow
  // this without limit. Oldest out, which for a Map is insertion order.
  if (diagramExprCache.size >= DIAGRAM_CACHE_MAX) {
    const oldest = diagramExprCache.keys().next().value;
    if (oldest !== undefined) diagramExprCache.delete(oldest);
  }
  diagramExprCache.set(key, compiled);
  return compiled;
}

/** A coordinate: a number as written, or an expression over the sliders. */
function coord(v: NumOrExpr | undefined, scope: Record<string, number>, names: string[]): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const fn = diagramExpr(v, names);
  return fn ? fn.eval(scope) : NaN;
}

const buildDiagram: Builder = (scene, _fn, vals, view, guarded) => {
  const names = scene.params.map((p) => p.id);
  const scope: Record<string, number> = {};
  for (const p of scene.params) scope[p.id] = vals[p.id] ?? p.value;
  const at = (v: NumOrExpr | undefined) => coord(v, scope, names);
  const ok = (...ns: number[]) => ns.every((n) => Number.isFinite(n));

  const objects: VizObject[] = [];
  const parts = scene.parts ?? [];

  parts.forEach((part, i) => {
    const id = `d${i}`;
    const tone = part.tone;
    switch (part.o) {
      case 'curve': {
        // The curve's variable is whichever free name is NOT a slider.
        //
        // It cannot simply be scene.varName. A diagram authored for a subject
        // uses the subject's letter — population against t, pressure against
        // v, pH against the volume added — and a scene that did not declare
        // varName defaults to x. Compiling `5 + 3*sin(b*t)` against x and b
        // leaves t free, every sample comes back NaN, and the curve silently
        // does not appear: a titled picture with a working slider over blank
        // space, which is exactly how this was found.
        const fn = diagramExpr(part.expr, [scene.varName, ...names, ...ALPHABET]);
        if (!fn) return;
        const free = fn.vars.filter((v) => !(v in scope));
        const xVar = free.includes(scene.varName) ? scene.varName : (free[0] ?? scene.varName);
        const from = part.from === undefined ? view.xMin : at(part.from);
        const to = part.to === undefined ? view.xMax : at(part.to);
        const lo = Math.max(view.xMin, Math.min(from, to));
        const hi = Math.min(view.xMax, Math.max(from, to));
        if (!ok(lo, hi) || !(hi > lo)) return;
        const pts = sampleAdaptive((x) => fn.eval({ ...scope, [xVar]: x }), lo, hi, SAMPLES, view);
        if (pts.length) {
          objects.push({ o: 'curve', id, pts, tone, dashed: part.dashed, width: part.width });
          if (part.label) {
            // At the curve's high point rather than its right-hand end.
            //
            // The end is where every OTHER label already is — an hrule's name,
            // the next curve's, the axis itself — and on anything periodic it
            // is also an arbitrary place to point at. Two population cycles
            // and a mean line came out as "mprey" stacked on the right margin.
            // The maximum is on the curve, is usually in clear air, and is
            // where a curve is easiest to tell apart from its neighbour.
            let best = null as Pt | null;
            for (const q of pts) {
              if (!Number.isFinite(q.y)) continue;
              if (q.y > view.yMax || q.y < view.yMin) continue;
              if (!best || q.y > best.y) best = q;
            }
            const anchor = best && best.x > (view.xMin + view.xMax) / 2 ? 'end' : 'start';
            if (best) objects.push({ o: 'label', id: `${id}l`, x: best.x, y: best.y, text: part.label, tone, anchor, dy: -8 });
          }
        }
        return;
      }
      case 'point': {
        const x = at(part.x), y = at(part.y);
        if (ok(x, y)) objects.push({ o: 'point', id, x, y, tone, hollow: part.hollow, label: part.label });
        return;
      }
      case 'segment': {
        const x1 = at(part.x1), y1 = at(part.y1), x2 = at(part.x2), y2 = at(part.y2);
        if (ok(x1, y1, x2, y2)) objects.push({ o: 'segment', id, x1, y1, x2, y2, tone, dashed: part.dashed, width: part.width });
        return;
      }
      case 'line': {
        const x = at(part.x), y = at(part.y), slope = at(part.slope);
        if (ok(x, y, slope)) objects.push({ o: 'line', id, x, y, slope, tone, dashed: part.dashed, width: part.width });
        return;
      }
      case 'vector': {
        const x1 = at(part.x1), y1 = at(part.y1), x2 = at(part.x2), y2 = at(part.y2);
        if (ok(x1, y1, x2, y2)) objects.push({ o: 'vector', id, x1, y1, x2, y2, tone, label: part.label });
        return;
      }
      case 'region': {
        const pts = (part.pts ?? []).map((q) => ({ x: at(q.x), y: at(q.y) })).filter((q) => ok(q.x, q.y));
        // Two points enclose nothing; drawing it would be a line pretending
        // to be an area.
        if (pts.length >= 3) objects.push({ o: 'region', id, pts, tone });
        return;
      }
      case 'rects': {
        const bars = (part.bars ?? [])
          .map((b) => ({ x0: at(b.x0), x1: at(b.x1), y: at(b.y) }))
          .filter((b) => ok(b.x0, b.x1, b.y));
        if (bars.length) objects.push({ o: 'rects', id, bars, tone });
        return;
      }
      case 'sequence': {
        const pts = (part.pts ?? []).map((q) => ({ x: at(q.x), y: at(q.y) })).filter((q) => ok(q.x, q.y));
        if (pts.length) objects.push({ o: 'sequence', id, pts, tone, stems: part.stems });
        return;
      }
      case 'vrule': {
        const a = at(part.at);
        if (ok(a)) objects.push({ o: 'vrule', id, at: a, tone, dashed: part.dashed, label: part.label });
        return;
      }
      case 'hrule': {
        const a = at(part.at);
        if (ok(a)) objects.push({ o: 'hrule', id, at: a, tone, dashed: part.dashed, label: part.label });
        return;
      }
      case 'label': {
        const x = at(part.x), y = at(part.y);
        if (ok(x, y)) objects.push({ o: 'label', id, x, y, text: part.text, tone, anchor: part.anchor, dy: part.dy });
        return;
      }
    }
  });

  // Authored quantities, computed live. Withheld by the guard like every
  // other number on a Logos diagram — the name and the help still show, so
  // the reader knows what is being asked of them.
  const readouts: VizReadout[] = [];
  for (const [i, q] of (scene.quantities ?? []).entries()) {
    const fn = diagramExpr(q.expr, names);
    if (!fn) continue;
    const v = fn.eval(scope);
    if (!Number.isFinite(v)) continue;
    readouts.push({ id: `q${i}`, tex: q.tex, value: guarded ? null : fmt(v, 4), help: q.help });
  }

  const says = scene.says ?? {};
  // Nothing came out despite every part passing its checks — a coordinate
  // that divided by zero, a curve entirely outside the window. Say so. An
  // inviting caption over blank space is worse than no picture, because it
  // reads as a control that is not working.
  if (!objects.length) {
    return {
      objects,
      readouts,
      caption: 'This one could not be drawn. Say what should be on the axes and it will be redrawn.',
    };
  }
  return {
    objects,
    readouts,
    narration: says.narration,
    caption: says.caption ?? (scene.params.length ? 'Move a control and watch what depends on it.' : 'A diagram of what you are working through.'),
    ask: says.ask,
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
  'supply-demand': buildSupplyDemand,
  ppc: buildPpc,
  'ad-as': buildAdAs,
  diagram: buildDiagram,
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
  // Nothing is implied for a diagram: its controls are the ones the picture
  // is about, and inventing one would put a slider under a drawing that has
  // nothing to move.
  diagram: () => [],
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
  // ── economics ──
  // Each of these opens at 0 — the undisturbed diagram — and sweeps UP, so
  // pressing play performs a shift rather than undoing one. A student is
  // being shown "what happens when demand rises", and the first frame has to
  // be the market before it did.
  'supply-demand': (sc) => {
    const p: VizParam[] = [
      {
        id: 'dsh',
        symbol: '\\Delta D',
        min: -30,
        max: 30,
        step: 0.5,
        value: 0,
        // Only one parameter may be swept, and on a tax scene the tax is the
        // subject: pressing play should open the wedge, not shift demand
        // while the wedge sits still. Said here rather than left to the
        // tie-break in withRequired, which keeps whichever comes first and
        // would silently drop the tax's own sweep.
        ...(sc.tax != null ? {} : { sweep: 'up' as const }),
        help: 'Shifts the whole demand curve. Right and up is an increase — more wanted at every price — from income, tastes, or the price of a substitute.',
      },
      {
        id: 'ssh',
        symbol: '\\Delta S',
        min: -30,
        max: 30,
        step: 0.5,
        value: 0,
        help: 'Shifts supply. Down and right is an increase — more offered at every price — from cheaper inputs or better technology.',
      },
    ];
    if (sc.tax != null) {
      p.push({
        id: 't',
        symbol: 't',
        min: 0,
        max: Math.max(5, Math.abs((sc.demand?.intercept ?? 100) - (sc.supply?.intercept ?? 20)) * 0.9),
        step: 0.5,
        value: sc.tax,
        sweep: 'up',
        help: 'A tax of this much on every unit sold. Open it from zero and watch the two prices come apart — buyers pay more, sellers keep less, and the gap between them is the tax.',
      });
    }
    if (sc.control) {
      p.push({
        id: 'pc',
        symbol: 'P_c',
        min: 0,
        max: Math.max(10, (sc.demand?.intercept ?? 100) * 1.05),
        step: 0.5,
        value: sc.control.at,
        help:
          sc.control.kind === 'ceiling'
            ? 'The legal maximum price. Above the market price it does nothing at all; below it, buyers want more than sellers will offer.'
            : 'The legal minimum price. Below the market price it does nothing; above it, sellers offer more than buyers will take.',
      });
    }
    return p;
  },
  ppc: (sc) => [
    {
      id: 'q',
      min: 0,
      max: sc.frontier?.xMax ?? 100,
      step: (sc.frontier?.xMax ?? 100) / 200,
      value: 0,
      sweep: 'up',
      help: 'How much of the first good you choose to make. Everything else follows: the frontier fixes how much of the other good you can still have.',
    },
    {
      // The range is deliberately narrow. The window has to hold the frontier
      // at its LARGEST — it is fixed once, because a window that resizes as
      // you drag hides the very motion you are dragging to see — so every bit
      // of headroom reserved for growth is width taken from the diagram at
      // rest. 1.25 is enough for growth to read as growth.
      id: 'g',
      min: 0.75,
      max: 1.25,
      step: 0.01,
      value: 1,
      help:
        (sc.frontier?.grows ?? 'both') === 'both'
          ? 'Growth. Slides the whole frontier outward — more resources, or better technology across the board — which is the only way to reach a point that was unattainable.'
          : `Growth in ${(sc.frontier?.grows === 'x' ? sc.axes?.x : sc.axes?.y) ?? 'one good'} only. The frontier pivots rather than sliding: you can have more of that good without giving up any of the other, and every opportunity cost along the curve changes with it.`,
    },
  ],
  'ad-as': () => [
    {
      id: 'adsh',
      symbol: '\\Delta AD',
      min: -40,
      max: 40,
      step: 0.5,
      value: 0,
      sweep: 'up',
      help: 'Shifts aggregate demand — spending, investment, government purchases, net exports. Right is an increase.',
    },
    {
      id: 'srsh',
      symbol: '\\Delta SRAS',
      min: -40,
      max: 40,
      step: 0.5,
      value: 0,
      help: 'Shifts short-run aggregate supply. Left is a negative supply shock: input costs up, output down and prices up together.',
    },
  ],
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
  'supply-demand': 'dsh',
  ppc: 'q',
  'ad-as': 'adsh',
  // A diagram's parameters are whatever the picture is about, so none of them
  // is reserved and the editor may offer every name.
  diagram: null,
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
  'supply-demand': 'Supply & demand',
  ppc: 'Production frontier',
  'ad-as': 'AD–AS',
  ode: 'Field',
  diagram: 'Diagram',
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

/**
 * The economics half of a scene, read out of untrusted JSON.
 *
 * Signs are IMPOSED rather than validated. A demand curve must slope down and
 * a supply curve up — that is not a convention, it is what makes the picture
 * mean what it is drawn to mean — so a model that hands over a positive
 * demand slope has its magnitude kept and its sign corrected. Rejecting the
 * scene would leave the reader with nothing over a mistake that has an
 * obvious right answer.
 */

// --- the open kind, sanitized ---------------------------------------
//
// Everything here arrives from a language model, so every field is checked
// and anything unrecognised is dropped rather than repaired. The parts are
// the one place a model authors DRAWING instructions rather than parameters
// to a builder, which is exactly why the checking is strictest here: a bad
// coordinate must become a missing part, never a broken picture.

const DIAGRAM_TONES = new Set<Tone>(['primary', 'accent', 'tension', 'muted', 'ghost', 'u1', 'u2', 'u3', 'u4']);
const MAX_PARTS = 40;
const MAX_PART_PTS = 64;
const MAX_QUANTITIES = 4;

/** A coordinate slot: a finite number, or an expression short enough to trust. */
function numOrExpr(v: any): NumOrExpr | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(1e6, Math.max(-1e6, v));
  if (typeof v === 'string') {
    const t = v.trim();
    // Compiled against no names here — this only proves it PARSES. Whether
    // its free names are actual sliders is decided at draw time, where an
    // unknown name evaluates to NaN and the part is simply not drawn.
    if (t && t.length <= 120 && compileExpr(t, ALPHABET)) return t;
  }
  return null;
}

/** Every single letter, so a coordinate expression may name any slider. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

const tone = (v: any): Tone | undefined =>
  typeof v === 'string' && DIAGRAM_TONES.has(v as Tone) ? (v as Tone) : undefined;

const text = (v: any, n: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, n) : undefined;

function pointList(v: any): { x: NumOrExpr; y: NumOrExpr }[] {
  if (!Array.isArray(v)) return [];
  const out: { x: NumOrExpr; y: NumOrExpr }[] = [];
  for (const q of v.slice(0, MAX_PART_PTS)) {
    const x = numOrExpr(q?.x);
    const y = numOrExpr(q?.y);
    if (x !== null && y !== null) out.push({ x, y });
  }
  return out;
}

function diagramPart(raw: any): DiagramPart | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = tone(raw.tone);
  const dashed = raw.dashed === true;
  const width = typeof raw.width === 'number' && Number.isFinite(raw.width)
    ? Math.min(4, Math.max(0.5, raw.width))
    : undefined;
  const n = (k: string) => numOrExpr(raw[k]);

  switch (raw.o) {
    case 'curve': {
      const expr = text(raw.expr, 400);
      if (!expr || !compileExpr(expr, ALPHABET)) return null;
      const from = raw.from === undefined ? undefined : numOrExpr(raw.from);
      const to = raw.to === undefined ? undefined : numOrExpr(raw.to);
      return { o: 'curve', expr, ...(from !== null && from !== undefined ? { from } : {}), ...(to !== null && to !== undefined ? { to } : {}), tone: t, dashed, width, label: text(raw.label, 24) };
    }
    case 'point': {
      const x = n('x'), y = n('y');
      if (x === null || y === null) return null;
      return { o: 'point', x, y, tone: t, hollow: raw.hollow === true, label: text(raw.label, 24) };
    }
    case 'segment': {
      const x1 = n('x1'), y1 = n('y1'), x2 = n('x2'), y2 = n('y2');
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return { o: 'segment', x1, y1, x2, y2, tone: t, dashed, width };
    }
    case 'line': {
      const x = n('x'), y = n('y'), slope = n('slope');
      if (x === null || y === null || slope === null) return null;
      return { o: 'line', x, y, slope, tone: t, dashed, width };
    }
    case 'vector': {
      const x1 = n('x1'), y1 = n('y1'), x2 = n('x2'), y2 = n('y2');
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return { o: 'vector', x1, y1, x2, y2, tone: t, label: text(raw.label, 24) };
    }
    case 'region': {
      const pts = pointList(raw.pts);
      return pts.length >= 3 ? { o: 'region', pts, tone: t } : null;
    }
    case 'sequence': {
      const pts = pointList(raw.pts);
      return pts.length ? { o: 'sequence', pts, tone: t, stems: raw.stems === true } : null;
    }
    case 'rects': {
      if (!Array.isArray(raw.bars)) return null;
      const bars: { x0: NumOrExpr; x1: NumOrExpr; y: NumOrExpr }[] = [];
      for (const b of raw.bars.slice(0, MAX_PART_PTS)) {
        const x0 = numOrExpr(b?.x0), x1 = numOrExpr(b?.x1), y = numOrExpr(b?.y);
        if (x0 !== null && x1 !== null && y !== null) bars.push({ x0, x1, y });
      }
      return bars.length ? { o: 'rects', bars, tone: t } : null;
    }
    case 'vrule':
    case 'hrule': {
      const a = numOrExpr(raw.at);
      if (a === null) return null;
      return { o: raw.o, at: a, tone: t, dashed, label: text(raw.label, 24) };
    }
    case 'label': {
      const x = n('x'), y = n('y');
      const body = text(raw.text, 48);
      if (x === null || y === null || !body) return null;
      const anchor = raw.anchor === 'start' || raw.anchor === 'end' || raw.anchor === 'middle' ? raw.anchor : undefined;
      const dy = typeof raw.dy === 'number' && Number.isFinite(raw.dy) ? Math.min(40, Math.max(-40, raw.dy)) : undefined;
      return { o: 'label', x, y, text: body, tone: t, anchor, dy };
    }
    default:
      return null;
  }
}

/**
 * Could this part ever draw, given the names that will have values?
 *
 * A coordinate naming a letter that is not a slider evaluates to NaN, and the
 * part is dropped at draw time — silently, which is how a titled picture with
 * a working slider over blank space happened. A curve is allowed exactly one
 * such name, because that one is its variable; everything else must be known.
 */
function partIsDrawable(part: DiagramPart, known: Set<string>): boolean {
  const exprs: string[] = [];
  const add = (v: unknown) => { if (typeof v === 'string') exprs.push(v); };
  switch (part.o) {
    case 'curve': {
      const free = freeNames(part.expr).filter((n) => !known.has(n));
      // At most the variable may be unknown.
      if (free.length > 1) return false;
      add(part.from); add(part.to);
      break;
    }
    case 'point': case 'label': add(part.x); add(part.y); break;
    case 'segment': case 'vector': add(part.x1); add(part.y1); add(part.x2); add(part.y2); break;
    case 'line': add(part.x); add(part.y); add(part.slope); break;
    case 'region': case 'sequence': for (const q of part.pts) { add(q.x); add(q.y); } break;
    case 'rects': for (const b of part.bars) { add(b.x0); add(b.x1); add(b.y); } break;
    case 'vrule': case 'hrule': add(part.at); break;
  }
  return exprs.every((e) => freeNames(e).every((n) => known.has(n)));
}

function diagramFields(raw: any): Partial<VizScene> {
  const parsed = (Array.isArray(raw?.parts) ? raw.parts : [])
    .slice(0, MAX_PARTS)
    .map(diagramPart)
    .filter(Boolean) as DiagramPart[];

  // What will have a value when this is drawn: the sliders, plus whatever the
  // scene calls its variable. Checked here rather than at draw time so a part
  // that can never appear is refused while there is still something to say
  // about it, instead of vanishing from the picture.
  const known = new Set<string>([
    ...(Array.isArray(raw?.params) ? raw.params : [])
      .map((q: any) => (typeof q?.id === 'string' ? q.id.trim().toLowerCase() : ''))
      .filter(Boolean),
    typeof raw?.varName === 'string' ? raw.varName.trim().toLowerCase() : 'x',
  ]);
  const parts = parsed.filter((part) => partIsDrawable(part, known));

  const quantities = (Array.isArray(raw?.quantities) ? raw.quantities : [])
    .slice(0, MAX_QUANTITIES)
    .map((q: any) => {
      const tex = text(q?.tex, 40);
      const expr = text(q?.expr, 200);
      if (!tex || !expr || !compileExpr(expr, ALPHABET)) return null;
      return { tex, expr, ...(text(q?.help, 300) ? { help: text(q?.help, 300) } : {}) };
    })
    .filter(Boolean) as DiagramQuantity[];

  const says = raw?.says && typeof raw.says === 'object'
    ? {
        ...(text(raw.says.caption, 120) ? { caption: text(raw.says.caption, 120) } : {}),
        ...(text(raw.says.narration, 400) ? { narration: text(raw.says.narration, 400) } : {}),
        ...(text(raw.says.ask, 200) ? { ask: text(raw.says.ask, 200) } : {}),
      }
    : undefined;

  return {
    parts,
    ...(quantities.length ? { quantities } : {}),
    ...(says && Object.keys(says).length ? { says } : {}),
  };
}

function econFields(kind: VizKind, raw: any): Partial<VizScene> {
  const priceLine = (r: any, fallbackInt: number, sign: -1 | 1) => ({
    intercept: num(r?.intercept, 0, 1e5, fallbackInt),
    slope: sign * (Math.abs(num(r?.slope, -1e4, 1e4, 1)) || 1),
  });

  const out: Partial<VizScene> = {};

  if (kind === 'supply-demand') {
    out.demand = priceLine(raw?.demand, 100, -1);
    out.supply = priceLine(raw?.supply, 20, 1);
    if (raw?.control && (raw.control.kind === 'ceiling' || raw.control.kind === 'floor')) {
      out.control = {
        kind: raw.control.kind,
        at: num(raw.control.at, 0, 1e5, out.demand.intercept / 2),
      };
    }
    if (raw?.surplus === true) out.surplus = true;
    // A tax and a price control are two different lessons; the control wins
    // when a scene asks for both, because it is the one that was drawn first
    // and a diagram carrying four prices teaches neither.
    if (!out.control && raw?.tax != null) {
      out.tax = num(raw.tax, 0, 1e5, out.demand.intercept / 10);
    }
  }

  if (kind === 'ppc') {
    const grows = raw?.frontier?.grows;
    out.frontier = {
      xMax: num(raw?.frontier?.xMax, 1e-3, 1e5, 100),
      yMax: num(raw?.frontier?.yMax, 1e-3, 1e5, 100),
      // Bowed unless told otherwise: increasing opportunity cost is what the
      // curve exists to show, and a straight frontier is the special case.
      bowed: raw?.frontier?.bowed !== false,
      grows: grows === 'x' || grows === 'y' ? grows : 'both',
    };
  }

  if (kind === 'ad-as') {
    out.ad = priceLine(raw?.ad, 140, -1);
    out.sras = priceLine(raw?.sras, 20, 1);
    out.potential = num(raw?.potential, 1e-3, 1e5, 60);
  }

  if (raw?.axes && typeof raw.axes === 'object') {
    const nm = (v: any, d: string) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : d;
    out.axes = { x: nm(raw.axes.x, 'good X'), y: nm(raw.axes.y, 'good Y') };
  }

  return out;
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
    // The economics fields have to be INSIDE this literal, not assigned to
    // the scene afterwards: withRequired() reads them to build the sliders —
    // the control price for a price ceiling, the frontier's width for the
    // production slider's range — and it runs on the object as constructed.
    // Setting them later left a ceiling with no handle to move it, under a
    // caption inviting the reader to move it.
    ...econFields(kind, raw),
    ...(kind === 'diagram' ? diagramFields(raw) : {}),
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
  // A diagram IS its parts. One that arrived with none — or whose every part
  // failed its checks — is an empty frame with a title, which is worse than
  // no picture at all: it takes the panel and says nothing.
  if (scene.kind === 'diagram' && !scene.parts?.length) return null;


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
