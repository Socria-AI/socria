// lib/model/views.ts
//
// WHAT CAN THIS MODEL BE LOOKED AT AS, AND WHY.
//
// THE PROBLEM THIS ANSWERS. `chooseRepresentation` picks ONE representation and
// lists `alternatives` as bare strings — `['plot2d', 'table']` — with no account
// of whether either is actually available, what it would show, what it would
// need, or how to get it. So a model that has computed a surface, a slope, a
// residual and a dependency graph offers the reader one picture and no way to
// ask for the others. The model contains far more structured information than
// the interface exposes, and that gap is not a rendering problem: nothing
// enumerates the possibilities.
//
// A REPRESENTATION IS A PROJECTION OF THE MODEL, NOT AN ARTEFACT. The canonical
// model is the source of truth; a surface, a table, an equation, a phase
// portrait and a residual plot are all views OF it, and they are available or
// not according to what the model actually contains and what actually computed.
// So availability is DERIVED — from structure and from the operation planner —
// and never from a list somebody wrote down or a language model's idea of what
// charts exist.
//
// THE HONEST HALF IS `unavailable`. "What else could I look at?" has two
// answers: what is available now, and what is not and what it would take. A
// registry that only lists what works reads as a complete catalogue of the
// possible, which is the same failure as an honesty list that omits a class.
//
// EXTENSIBLE BY CONSTRUCTION. A family is added here, with its own availability
// rule; nothing downstream enumerates families, and no renderer is required to
// exist for a family to be declared. A family with no renderer yet reports
// itself as available-but-not-drawn, which is more useful than silence.
//
// NO DOMAIN APPEARS BELOW. A phase portrait is available because a system has
// two or more states, not because the subject is mechanics; a residual view is
// available because a fit produced residuals, not because the subject is
// econometrics.
//
// PURE.

import { runFor } from './system';
import { estimate } from './estimate';
import { route, operationsOn } from './solve';
import { symbolTable, freeInputs, type Quantity } from './symbols';
import { restsOn } from './deps';
import { sweepOf } from './iterate';
import type { Fidelity, Model, ModelObject } from './schema';

/**
 * The families of representation. Not a closed set: adding one is adding a rule
 * below, and nothing downstream switches exhaustively on it.
 */
export type ViewFamily =
  | 'surface'
  | 'curve'
  | 'scatter'
  | 'contour'
  | 'slice'
  | 'field'
  | 'trajectory'
  | 'phase'
  | 'bifurcation'
  | 'section'
  | 'mechanism'
  | 'timeline'
  | 'animation'
  | 'table'
  | 'matrix'
  | 'equation'
  | 'derivative'
  | 'sensitivity'
  | 'residual'
  | 'interval'
  | 'distribution'
  | 'network'
  | 'structure'
  | 'diagnostic'
  | 'text';

/** What a view can be done TO, beyond looking at it. */
export type ViewGesture = 'select' | 'point' | 'slice' | 'rotate' | 'play' | 'drag';

export interface ViewSpec {
  /** stable, so a workspace can remember which views are open */
  id: string;
  family: ViewFamily;
  label: string;
  /**
   * WHAT THIS IS A VIEW OF, in the model's own words — the object's label, a
   * data block's, or '' for a view of the whole model.
   *
   * Split out of `label` because a reader was being made to read it four times.
   * A surface offers four views and every label began with the same thirty
   * characters: "log_wage, as the model implies it", "… — level sets", "… —
   * cross-section", "… — values". The subject is said once and the ways of
   * looking at it are named beside it (`variant`), which is a fact about the
   * registry rather than a trick of the renderer — anything listing views can
   * group them the same way.
   */
  subject: string;
  /**
   * THIS WAY OF LOOKING AT THE SUBJECT, in a word or two: "Surface", "Level
   * sets", "Cross-section", "Values". Derived from the family unless a branch
   * says otherwise, so a family added tomorrow is named rather than blank.
   */
  variant: string;
  /** the model object this is a view of; '' when it is a view of the model */
  of: string;
  dimensionality: 2 | 3;
  /** why it is available, from the model's own structure — arguable, not magic */
  because: string;
  /** what a reader would see in it */
  shows: string;
  /**
   * The fidelity of what it would show, EARNED. A view of something conceptual
   * is a conceptual view however well it is drawn.
   */
  fidelity: Fidelity;
  /** what a person can do in it */
  can: ViewGesture[];
  /**
   * Does this view put MARKS IN A FRAME, or is it something read?
   *
   * The distinction the frame turns on, and it is not the same as the family: a
   * surface, a curve, a field and a trajectory occupy extent; an equation, a
   * table, a model's own account and A CONSTANT SLOPE do not. A frame claimed for
   * a view with no marks is an empty box — the most confident thing this engine
   * can draw and the least honest — so the representation chooser asks this
   * rather than carrying its own list of which families count.
   */
  marks: boolean;
  /** true for the one the engine would choose on its own */
  primary?: boolean;
  /**
   * Declared but not rendered yet. Present so the answer to "what else can I
   * look at" is complete rather than flattering — and so adding a renderer is a
   * change in one place.
   */
  notDrawnYet?: boolean;
}

export interface Unavailable {
  family: ViewFamily;
  /** what the model would have to contain or compute */
  wouldNeed: string;
}

/**
 * The families that occupy extent. Everything else is read rather than looked at.
 *
 * One table, applied once in `add`, so a new family declares this by being in the
 * set or not — and no caller keeps its own copy of the question.
 */
/**
 * THE FAMILIES SOMETHING ACTUALLY RENDERS, and the only place that is recorded.
 *
 * `notDrawnYet` used to be a literal typed onto each declaration by hand, which
 * is the failure this codebase keeps making in different clothes: two copies of
 * one rule, drifting. A table said "declared; no renderer yet" for weeks after
 * the table renderer existed, and a residual view said nothing of the sort while
 * quietly drawing the surface it was a residual OF.
 *
 * So the flag is DERIVED from this, lib/model/viewdata.ts renders exactly these,
 * and adding a renderer is adding a name here. A family absent from this set
 * reports itself declared-but-not-drawn and the frame keeps the picture it had
 * rather than clearing it for something nothing can draw.
 */
export const RENDERED = new Set<ViewFamily>([
  // frames — the compiler's own geometry, narrowed to the object
  'surface', 'curve', 'scatter', 'field', 'trajectory', 'timeline', 'mechanism', 'network',
  // frames — computed here from what already ran
  'contour', 'slice', 'residual', 'interval', 'phase', 'bifurcation', 'section',
  // read
  'equation', 'table', 'matrix', 'structure', 'derivative', 'sensitivity', 'diagnostic', 'text',
]);

/**
 * What each family is CALLED when the thing it is a view of has already been
 * named. Two words at most: these sit side by side under one subject, and a
 * sentence there is the problem this exists to fix.
 */
const FAMILY_TITLE: Record<ViewFamily, string> = {
  surface: 'Surface',
  curve: 'Curve',
  scatter: 'Points',
  contour: 'Level sets',
  slice: 'Cross-section',
  field: 'Field',
  trajectory: 'Path',
  phase: 'Phase portrait',
  bifurcation: 'Bifurcation diagram',
  section: 'Poincaré section',
  mechanism: 'Mechanism',
  timeline: 'Against time',
  animation: 'Over time',
  table: 'Values',
  matrix: 'Design',
  equation: 'The relations',
  derivative: 'Slope',
  sensitivity: 'Sensitivity',
  residual: 'Residuals',
  interval: 'Coefficients',
  distribution: 'Distribution',
  network: 'Structure',
  structure: 'Dependencies',
  diagnostic: 'Diagnostics',
  text: 'Account',
};

const OCCUPIES_EXTENT = new Set<ViewFamily>([
  'surface', 'curve', 'scatter', 'contour', 'slice', 'field', 'trajectory',
  'phase', 'bifurcation', 'section', 'mechanism', 'timeline', 'animation', 'residual', 'interval', 'network',
]);

/**
 * What kind of thing gets what kind of view, for anything the branches above
 * did not already claim.
 *
 * Deliberately a MAP rather than a chain of conditions: a kind that is not here
 * gets no view and that is visible, where a missing `if` is not.
 */
const FAMILY_OF_KIND: Partial<Record<ModelObject['kind'], ViewFamily>> = {
  series: 'timeline',
  distribution: 'distribution',
  dataset: 'scatter',
  measurement: 'scatter',
  point: 'scatter',
  particle: 'scatter',
  scalar: 'table',
  vector: 'field',
  region: 'surface',
  plane: 'surface',
  boundary: 'curve',
  mesh: 'surface',
  node: 'network',
  graph: 'network',
};

const RUNS = (m: Model, o: ModelObject) => route(m, o, 'simulate').status === 'runnable';
const DRAWS = (m: Model, o: ModelObject) => route(m, o, 'evaluate').status === 'runnable';

/** The fidelity a view of this object would carry. Earned from the router. */
export function worth(m: Model, o: ModelObject): Fidelity {
  const ops = operationsOn(m, o);
  if (ops.some((v) => v.operation === 'simulate' && v.routed.status === 'runnable')) return 'numerically-computed';
  if (ops.some((v) => v.operation === 'estimate' && v.routed.status === 'runnable')) return 'data-derived';
  if (ops.some((v) => v.routed.status === 'runnable')) return 'model-derived';
  return o.fidelity ?? 'conceptual';
}

/**
 * Every representation this model can honestly offer, right now.
 *
 * Ordered so the primary comes first and the rest follow by how directly they
 * show the thing: the object itself, then its parts, then the model's structure.
 */
export function viewsFor(model: Model): ViewSpec[] {
  const out: ViewSpec[] = [];

  // ── WHAT TO CALL THE THING A VIEW IS OF ──────────────────────────
  //
  // Its own label, QUALIFIED WHEN THE LABEL ALONE DOES NOT IDENTIFY IT. A model
  // holding two specifications — "y on x₁ and x₂" and "y on x₁ alone" — gives
  // both implied responses the same name, "y, as the model implies it", and
  // both their slopes the same name again. Printing that twice over two
  // different sets of views asks a reader to tell two identical labels apart by
  // what happens to sit under them. The specification each belongs to is on the
  // object (`meta.spec`, or the response it was differentiated from), so the
  // name says it when, and only when, it is needed.
  const seen = new Map<string, number>();
  for (const o of model.objects) seen.set(o.label, (seen.get(o.label) ?? 0) + 1);
  const subjectOf = (id: string): string => {
    const o = model.objects.find((x) => x.id === id);
    if (!o) return id;
    if ((seen.get(o.label) ?? 0) < 2) return o.label;
    const specId =
      (o.meta?.spec as string | undefined) ??
      (model.objects.find((x) => x.id === (o.meta?.of as string | undefined))?.meta?.spec as string | undefined);
    const spec = specId ? model.objects.find((x) => x.id === specId) : null;
    return spec ? `${o.label} · ${spec.label}` : o.label;
  };
  const add = (
    v: Omit<ViewSpec, 'marks' | 'subject' | 'variant'> & {
      marks?: boolean;
      subject?: string;
      variant?: string;
    }
  ) => {
    if (out.some((x) => x.id === v.id)) return;
    const marks = v.marks ?? OCCUPIES_EXTENT.has(v.family);
    // DERIVED, NEVER DECLARED. See RENDERED above for what a hand-written flag
    // cost. A view of a family nothing renders is still listed — the answer to
    // "what else could I look at" is meant to be complete — it just says so.
    const notDrawnYet = RENDERED.has(v.family) ? undefined : true;
    // The object's own name is the subject, found rather than repeated at
    // every call site; a view of the model itself has no subject, and the
    // renderer says so once for the whole group.
    const subject = v.subject ?? (v.of ? subjectOf(v.of) : '');
    const variant = v.variant ?? FAMILY_TITLE[v.family];
    out.push({ ...v, subject, variant, marks, ...(notDrawnYet ? { notDrawnYet } : {}) });
  };
  const table = symbolTable(model);

  for (const o of model.objects) {
    const f = worth(model, o);

    // ── a body with a shape ───────────────────────────────────────
    //
    // A SOLID IS ITS OWN KIND OF PICTURE: the body in three dimensions with its
    // dimensions marked, and the numbers it has — its dimensions and the
    // volume and areas computed from them (solid.ts). Neither is a level set or
    // a cross-section of anything, so neither is offered.
    if (o.kind === 'solid' && o.solid && DRAWS(model, o)) {
      add({
        id: `surface:${o.id}`, family: 'surface', label: o.label, of: o.id, dimensionality: 3, variant: 'Solid',
        because: 'a body with a shape and dimensions, and its dimensions evaluate',
        shows: `${o.label} in three dimensions, its dimensions marked and moving with the controls`,
        fidelity: f, can: ['select', 'rotate'], primary: true,
      });
      add({
        id: `table:${o.id}`, family: 'table', label: `${o.label} — measures`, of: o.id, dimensionality: 2, variant: 'Measures',
        because: `a ${o.solid.shape} has a volume and areas, computed from its dimensions by the formulas for the shape`,
        shows: 'each dimension and each measure at the current values, with how it was worked out',
        fidelity: f, can: ['select'],
      });
    }

    // ── a quantity over two others ────────────────────────────────
    if ((o.kind === 'surface' || o.kind === 'volume') && DRAWS(model, o)) {
      // A PARAMETRIC SURFACE IS A SHAPE, NOT A HEIGHT OVER A PLANE. A cone
      // written as (u, v) ↦ (x, y, z) has no "value at (x, y)" — so level sets,
      // a cross-section at a value of x and a grid of values are views of a
      // relationship it does not state, and offering them drew the wrong thing.
      const shape = !!(o.defs?.px && o.defs?.py && o.defs?.pz);
      add({
        id: `surface:${o.id}`, family: 'surface', label: o.label, of: o.id, dimensionality: 3,
        because: shape ? 'a surface given by its parametric components, and they evaluate' : 'one quantity varies over two others, and it evaluates',
        shows: shape ? `${o.label} as a shape in space, traced from its parameters` : `${o.label} as a surface over its two inputs`,
        fidelity: f, can: ['select', 'point', 'rotate'], primary: true,
      });
    }
    if ((o.kind === 'surface' || o.kind === 'volume') && DRAWS(model, o) && !(o.defs?.px && o.defs?.py && o.defs?.pz)) {
      // Contours and slices are the SAME computation seen differently, and both
      // are already implemented (compile.ts buildContours, buildSlice) — so they
      // are available exactly when the surface is z = f(x, y).
      add({
        id: `contour:${o.id}`, family: 'contour', label: `${o.label} — level sets`, of: o.id, dimensionality: 2,
        because: 'a surface has level sets, computed from the same expression rather than traced off the mesh',
        shows: 'the curves along which the quantity is constant — the plan view of the surface',
        fidelity: f, can: ['select'],
      });
      add({
        id: `slice:${o.id}`, family: 'slice', label: `${o.label} — cross-section`, of: o.id, dimensionality: 2,
        because: 'a surface can be cut at a value of either input, and the cut is computed from the expression',
        shows: 'the curve where one input is held and the other varies — as true as the surface it came from',
        fidelity: f, can: ['select', 'slice', 'drag'],
      });
      add({
        id: `table:${o.id}`, family: 'table', label: `${o.label} — values`, of: o.id, dimensionality: 2,
        because: 'a sampled relationship has values, and a number is sometimes what is wanted',
        shows: 'the computed value at a grid of inputs, and at the point currently selected',
        fidelity: f, can: ['select', 'point'],
      });
    }

    // ── a quantity over one other ─────────────────────────────────
    //
    // A MARGINAL IS NOT LISTED AS A PLAIN CURVE. It is a curve, and its own
    // branch below says what it is — so both branches firing offered the same
    // picture twice under two names, one of which ("∂z/∂x") explained it and
    // one of which did not.
    if (['curve', 'line', 'ray'].includes(o.kind) && o.meta?.role !== 'marginal' && DRAWS(model, o)) {
      add({
        id: `curve:${o.id}`, family: 'curve', label: o.label, of: o.id, dimensionality: 2,
        because: 'a quantity varies over one other, and it evaluates',
        shows: `${o.label} against its input`,
        fidelity: f, can: ['select', 'point', 'drag'], primary: true,
      });
      add({
        id: `table:${o.id}`, family: 'table', label: `${o.label} — values`, of: o.id, dimensionality: 2,
        because: 'a sampled relationship has values',
        shows: 'the computed value at each sampled input',
        fidelity: f, can: ['select', 'point'],
      });
    }

    if (o.kind === 'field' && DRAWS(model, o)) {
      add({
        id: `field:${o.id}`, family: 'field', label: o.label, of: o.id,
        dimensionality: o.defs?.fz ? 3 : 2,
        because: 'the object has components, so it has a direction at every point',
        shows: 'the direction and size of the field across its window',
        fidelity: f, can: ['select', 'point'], primary: true,
      });
    }

    // ── a quantity spread over space, stepped through time ─────────
    if (o.pde && RUNS(model, o)) {
      const line = !o.pde.y;
      add({
        id: `field:${o.id}`, family: 'field', label: o.label, of: o.id, dimensionality: 2,
        variant: line ? 'Over space and time' : 'The field',
        because: 'a quantity at every point, stepped through time by the field solver',
        shows: line
          ? 'the whole run at once: position across, time up, the value as colour — and a line at the clock’s time'
          : 'the plane at the clock’s time, the value as colour; play the clock to replay the run',
        fidelity: 'numerically-computed', can: ['select', 'point', 'play'], primary: true,
      });
      add({
        id: `surface:${o.id}`, family: 'surface', label: o.label, of: o.id, dimensionality: 3,
        variant: line ? 'Surface u(x, t)' : 'Surface u(x, y)',
        because: 'the same values, as heights',
        shows: line ? 'the run as a surface over position and time, to turn and read its slopes' : 'the field at the clock’s time as a surface over the plane',
        fidelity: 'numerically-computed', can: ['select', 'rotate', 'play'],
      });
    }

    // ── a system that steps ───────────────────────────────────────
    if (o.map && RUNS(model, o)) {
      const one = o.map.states.length === 1;
      add({
        id: `trajectory:${o.id}`, family: 'trajectory', label: o.label, of: o.id, dimensionality: 2, variant: 'Iterates',
        because: 'a map, stepped from where it starts',
        shows: one ? 'each step’s value against the step number' : 'the states it visits, in its first two',
        fidelity: 'numerically-computed', can: ['select', 'point'], primary: true,
      });
      if (one) {
        add({
          id: `phase:${o.id}`, family: 'phase', label: `${o.label} — cobweb`, of: o.id, dimensionality: 2, variant: 'Cobweb',
          because: 'a map of one state can be walked between its graph and the diagonal',
          shows: 'the orbit as a walk: up to y = f(x), across to y = x — it spirals into a fixed point, closes on a cycle, or never repeats',
          fidelity: 'numerically-computed', can: ['select'],
        });
      }
      const sw = sweepOf(model, o);
      if (sw && !Object.values(o.map.next).some((e) => /(^|[^A-Za-z0-9_])n([^A-Za-z0-9_(]|$)/.test(e))) {
        add({
          id: `bifurcation:${o.id}`, family: 'bifurcation', label: `${o.label} — as ${sw.label} sweeps`, of: o.id, dimensionality: 2,
          because: `${sw.label} is a control with a range, and the map does not depend on n`,
          shows: `where the map settles at every value of ${sw.label} across its range — one value, two, four, … and chaos`,
          fidelity: 'numerically-computed', can: ['select'],
        });
      }
    }

    // ── something that evolves ────────────────────────────────────
    if ((o.system || o.kind === 'trajectory') && RUNS(model, o)) {
      const states = o.system?.states.length ?? 0;
      add({
        id: `trajectory:${o.id}`, family: 'trajectory', label: o.label, of: o.id,
        dimensionality: states >= 3 || o.defs?.pz ? 3 : 2,
        because: 'a law saying how something changes, integrated',
        shows: 'the path the state actually took',
        fidelity: 'numerically-computed', can: ['select', 'play', 'rotate'], primary: true,
      });
      if (states >= 2) {
        add({
          id: `phase:${o.id}`, family: 'phase', label: `${o.label} — phase portrait`, of: o.id, dimensionality: 2,
          because: `the state has ${states} components, so it has a shape in its own space`,
          shows: 'the states against each other rather than against time — where a system settles, circles or diverges',
          fidelity: 'numerically-computed', can: ['select'],
        });
      }
      // A SECTION ONLY WHERE THE PATH KEEPS COMING BACK: the run's own third state must cross its mean upward at
      // least three times — an epidemic that burns out crosses once, and its section would be an empty frame
      const crossings = (() => {
        const got = states >= 3 ? runFor(model, o) : null;
        if (!got || !got.ok) return 0;
        const z = got.run.y.map((r) => r[2]);
        const mean = z.reduce((a, b) => a + b, 0) / z.length;
        let n = 0;
        for (let i = 1; i < z.length; i++) if (z[i - 1] < mean && z[i] >= mean) n++;
        return n;
      })();
      if (states >= 3 && crossings >= 3 && o.system && !Object.values(o.system.rhs).some((e) => /(^|[^A-Za-z0-9_])t([^A-Za-z0-9_(]|$)/.test(e))) {
        add({
          id: `section:${o.id}`, family: 'section', label: `${o.label} — Poincaré section`, of: o.id, dimensionality: 2,
          because: `the state has ${states} components and its law does not depend on the time, so its path pierces a plane over and over`,
          shows: 'where the path crosses a plane, as dots — a few points are a cycle, a curve a torus, a dust that never repeats a strange attractor',
          fidelity: 'numerically-computed', can: ['select'],
        });
      }
      add({
        id: `timeline:${o.id}`, family: 'timeline', label: `${o.label} — against time`, of: o.id, dimensionality: 2,
        because: 'the run has a time axis, and each state and observable is a series along it',
        shows: 'each quantity against time, from the same run the main view is drawn from',
        fidelity: 'numerically-computed', can: ['select', 'play'],
      });
      if (model.time) {
        add({
          id: `animation:${o.id}`, family: 'animation', label: `${o.label} — over time`, of: o.id, dimensionality: 2,
          because: 'the model carries a clock, and the run covers it',
          shows: 'the state at an instant, moved through — a replay of a computed run rather than a motion drawn by hand',
          fidelity: 'numerically-computed', can: ['play', 'select'],
        });
      }
    }

    if (o.mechanism || o.gravity) {
      add({
        id: `mechanism:${o.id}`, family: 'mechanism', label: o.label, of: o.id, dimensionality: 2,
        because: 'the object has parts that push and pull, placed by the computed state',
        shows: 'the parts where the integration says they are',
        fidelity: worth(model, o), can: ['select', 'play'], primary: true,
      });
    }

    // ── what was differentiated ───────────────────────────────────
    if (o.meta?.role === 'marginal' && !o.meta?.undrawable) {
      add({
        id: `derivative:${o.id}`, family: 'derivative', label: o.label, of: o.id,
        dimensionality: 2,
        // A CONSTANT SLOPE IS A NUMBER. ∂y/∂x in a model linear in x is β₁
        // everywhere: there is nothing to plot, and claiming a frame for it is
        // how an empty box came to be drawn beside a relationship that could not
        // be evaluated at all.
        marks: !o.meta?.constant,
        because: 'the relationship was differentiated symbolically, so its slope exists as a quantity',
        shows: o.meta?.constant
          ? 'the slope, which does not vary — the same everywhere'
          : 'how the slope itself changes across the input',
        fidelity: 'model-derived', can: ['select', 'point'],
      });
    }

    // ── what a fit produced ───────────────────────────────────────
    if (o.estimation) {
      const fit = estimate(model, o);
      if (fit.ok) {
        add({
          id: `residual:${o.id}`, family: 'residual', label: `${o.label} — residuals`, of: o.id, dimensionality: 2,
          because: 'a fit ran, so what it does not explain exists as numbers',
          shows: 'what is left over at each observation — the part of the outcome the relationship does not account for',
          fidelity: 'data-derived', can: ['select', 'point'],
        });
        if (fit.fit.terms.some((t) => !!t.ci95)) {
          add({
            id: `interval:${o.id}`, family: 'interval', label: `${o.label} — coefficients`, of: o.id, dimensionality: 2,
            because: 'the fit produced standard errors and enough degrees of freedom for an interval',
            shows: 'each estimate with its interval — the uncertainty, beside the number',
            fidelity: 'data-derived', can: ['select'],
          });
        }
        if (fit.fit.warnings.length || fit.fit.dropped) {
          add({
            id: `diagnostic:${o.id}`, family: 'diagnostic', label: `${o.label} — diagnostics`, of: o.id, dimensionality: 2,
            because: 'the fit reported something a reader should know before trusting it',
            shows: 'the warnings, the rows left out and why',
            fidelity: 'data-derived', can: ['select'],
          });
        }
      }
    }

    // ── a system of relations ─────────────────────────────────────
    if (o.equations) {
      add({
        id: `equation:${o.id}`, family: 'equation', label: `${o.label} — the relations`, of: o.id, dimensionality: 2,
        because: 'the object states relations that hold at once',
        shows: 'the relations as written, and the values that satisfy them',
        fidelity: worth(model, o), can: ['select'],
      });
      // AND THE FIGURE, WHEN IT SOLVES. A solved system is lines in a plane —
      // each relation drawn from its own coefficients, the solution a point, an
      // offset between two quantities on one axis a segment. That IS marks, and
      // the registry had no entry for it: so a market that solved perfectly and
      // drew its own figure was counted as having nothing to show, and the frame
      // chooser dropped to the equation view over a picture that was there.
      if (route(model, o, 'solve').status === 'runnable') {
        add({
          id: `curve:${o.id}`, family: 'curve', label: o.label, of: o.id, dimensionality: 2,
          variant: 'Figure',
          because: 'the relations solve, so each one is a line in the plane of the quantities they relate',
          shows: 'the relations as lines, the values that satisfy them as a point, and any offset between quantities sharing an axis as a segment',
          fidelity: worth(model, o), can: ['select', 'point'], primary: true,
        });
      }
    }
  }

  // ── ANYTHING ELSE THAT DRAWS, SO THE REGISTRY CANNOT SILENTLY OMIT ──
  //
  // THE FAILURE THIS CLOSES, and it is the empty-frame failure in the other
  // direction. A series with numbers in it draws — the DATA solver reads it
  // straight off the block — and no branch above covers a `series`, so the
  // registry reported NOTHING available and the frame chooser, which now trusts
  // the registry, claimed no extent for a picture that was there.
  //
  // A registry that enumerates by hand omits by hand. So the last word belongs to
  // the ROUTER: if something can run this object, it has a view, and its family
  // comes from what kind of thing it is. A kind added to the schema tomorrow gets
  // a view without anybody remembering to come here.
  for (const o of model.objects) {
    if (out.some((v) => v.of === o.id)) continue;
    // A FORMULA OR A MEASURE IS ONE NUMBER, and a frame each would be a row of
    // one-cell tables. They are read together: a solid's in its measures, the
    // rest in the model's values below.
    if (o.meta?.role === 'measure' || o.meta?.role === 'formula') continue;
    const ops = operationsOn(model, o).filter((v) => v.routed.status === 'runnable');
    if (!ops.length) continue;
    const family = FAMILY_OF_KIND[o.kind];
    if (!family) continue;
    add({
      id: `${family}:${o.id}`, family, label: o.label, of: o.id,
      dimensionality: 2,
      because: `${ops[0].routed.status === 'runnable' ? (ops[0].routed as { solver: { label: string } }).solver.label : 'a solver'} runs this object`,
      shows: o.meaning ?? `${o.label}, as this model holds it`,
      fidelity: worth(model, o), can: ['select', 'point'], primary: true,
    });
  }

  // ── views of the MODEL rather than of one object ────────────────

  // THE VALUES: every quantity worked out from a formula, read together. The
  // primary view when nothing else draws — "base area = π r²" is a model, and
  // its picture is the number.
  const formulas = model.objects.filter((o) => o.meta?.role === 'formula');
  if (formulas.length) {
    add({
      id: 'table:values', family: 'table', label: 'Values', of: '', subject: 'Values', dimensionality: 2,
      because: `${formulas.length} quantit${formulas.length === 1 ? 'y is' : 'ies are'} worked out from formulas over the others`,
      shows: 'each quantity this model holds a number for, at the current values — the controls, and what follows from them',
      fidelity: formulas.some((o) => typeof o.meta?.value === 'number') ? 'model-derived' : 'conceptual',
      can: ['select'],
      primary: !out.some((v) => v.primary),
    });
  }

  const data = Object.entries(model.data ?? {});
  for (const [key, block] of data) {
    if (!block.columns || !Object.keys(block.columns).length) continue;
    add({
      id: `table:data:${key}`, family: 'table', label: block.label ?? key, of: '',
      subject: block.label ?? key, dimensionality: 2,
      because: 'the model carries observations, and a table is what they are',
      shows: 'the supplied numbers, as given — never a fitted line standing in for them',
      fidelity: 'data-derived', can: ['select', 'point'],
    });
    add({
      id: `matrix:data:${key}`, family: 'matrix', label: `${block.label ?? key} — design`, of: '',
      subject: block.label ?? key, dimensionality: 2,
      because: 'the columns a specification uses form a matrix, and its shape is what identification turns on',
      shows: 'the rows and columns a fit would run on, including any built from transformations',
      fidelity: 'data-derived', can: ['select'],
    });
  }

  const nodes = model.objects.filter((o) => ['node', 'graph'].includes(o.kind));
  if (nodes.length > 1) {
    add({
      id: 'network:model', family: 'network', label: 'The structure', of: '', dimensionality: 2,
      because: 'the model is things connected to things',
      shows: 'the nodes and what joins them',
      fidelity: 'conceptual', can: ['select'], primary: true,
    });
  }

  // THE DEPENDENCY GRAPH IS ALWAYS A VIEW OF A MODEL THAT HAS ONE. It is the
  // thing the engine reasons with, and showing it is showing the model's own
  // wiring rather than a picture about it.
  const wired = model.objects.filter((o) => restsOn(model, o.id).objects.length || restsOn(model, o.id).params.length);
  if (wired.length) {
    add({
      id: 'structure:model', family: 'structure', label: 'What depends on what', of: '', dimensionality: 2,
      because: `${wired.length} object${wired.length === 1 ? '' : 's'} in this model rest on something else in it`,
      shows: 'the dependency graph the engine actually uses — what a change reaches, and what it does not',
      fidelity: 'model-derived', can: ['select'],
    });
  }

  // SENSITIVITY: available exactly when there is something to differentiate AND
  // something to differentiate it with respect to. Falls out of the symbolic
  // differentiator rather than being estimated by perturbation.
  const movable = [...table.by.values()].filter((q) => q.supply === 'parameter' && q.boundBy === 'control');
  const differentiable = model.objects.filter((o) => (o.definition || o.defs?.z || o.defs?.f) && o.over);
  if (movable.length && differentiable.length) {
    add({
      id: 'sensitivity:model', family: 'sensitivity', label: 'Sensitivity to the parameters', of: '', dimensionality: 2,
      because: `${movable.length} parameter${movable.length === 1 ? '' : 's'} can be moved, and the relationship can be differentiated with respect to them`,
      shows: 'how much each output moves per unit of each parameter — differentiated, not measured by nudging',
      fidelity: 'model-derived', can: ['select'],
    });
  }

  // EQUATIONS AND TEXT ARE ALWAYS AVAILABLE for a model that states anything,
  // and they are the floor: a model with no computable content still has an
  // account of itself, and that is a representation.
  if (model.objects.some((o) => o.definition || o.defs || o.system || o.mechanism || o.estimation || o.equations)) {
    add({
      id: 'equation:model', family: 'equation', label: 'The relationships', of: '', dimensionality: 2,
      because: 'the model states its mathematics, and the statement is a thing to look at',
      shows: 'every relationship this model holds, as written',
      fidelity: 'model-derived', can: ['select'],
    });
  }
  add({
    id: 'text:model', family: 'text', label: 'What this is', of: '', dimensionality: 2,
    because: 'every model has an account of itself',
    shows: 'what it is, what it holds fixed, what computed and what did not',
    fidelity: 'conceptual', can: ['select'],
  });

  return out;
}

/**
 * What this model CANNOT be looked at as, and what it would take.
 *
 * The half that keeps the other half honest. Bounded to the families a reader
 * might reasonably expect, because a list of every unimplemented possibility is
 * noise rather than an answer.
 */
export function unavailable(model: Model): Unavailable[] {
  const have = new Set(viewsFor(model).map((v) => v.family));
  const out: Unavailable[] = [];
  const want = (family: ViewFamily, wouldNeed: string) => {
    if (!have.has(family)) out.push({ family, wouldNeed });
  };

  want('trajectory', 'a law saying how something CHANGES — states and their rates, parts that push and pull, or bodies that attract. A relationship between quantities at one moment is not one');
  want('phase', 'a system with two or more states, integrated');
  want('surface', 'one quantity written in terms of two others, and a range for each');
  want('residual', 'a fit that ran: a specification, observations, and a method you chose');
  want('interval', 'a fit with enough degrees of freedom for an interval — and a method, which is yours to choose');
  want('distribution', 'a distribution object, or a sampling backend, which this engine does not have');
  want('network', 'things connected to things — nodes and what joins them');
  want('animation', 'a clock on the model and a run that covers it');
  want('derivative', 'a relationship written as an expression, and an input to take the slope with respect to');
  return out;
}

/**
 * The views, gathered under what they are views OF.
 *
 * Here rather than in the panel because it is a statement about the registry:
 * two views share a group exactly when they are two ways of looking at the
 * same thing, and that is what makes it safe to print the subject once and the
 * variants beside it. Views of the MODEL — its dependency graph, its
 * relationships, its account of itself — have no subject and come last, since
 * they are what is left when you stop looking at any one thing.
 *
 * Order within a group is the registry's: the primary first.
 */
export interface ViewGroup {
  /** the model's own words for the thing, or '' for the model itself */
  subject: string;
  views: ViewSpec[];
}

export function groupViews(views: readonly ViewSpec[]): ViewGroup[] {
  // KEYED ON THE OBJECT, not on the name. Two specifications in one model can
  // imply responses with identical labels, and merging those would offer
  // "Surface" and "Curve" side by side as though they were two ways of looking
  // at one thing when they are views of two different things. Data blocks and
  // the model's own views carry no object, so they key on their subject — ''
  // for the model, which is what puts those last.
  const by = new Map<string, ViewGroup>();
  for (const v of views) {
    const key = v.of || v.subject;
    const held = by.get(key);
    if (held) held.views.push(v);
    else by.set(key, { subject: v.subject, views: [v] });
  }
  const groups = [...by.values()];
  return [...groups.filter((g) => g.subject), ...groups.filter((g) => !g.subject)];
}

/** The one the engine would open first, or null when nothing draws. */
export function primaryView(model: Model): ViewSpec | null {
  const all = viewsFor(model);
  return all.find((v) => v.primary && !v.notDrawnYet) ?? all.find((v) => !v.notDrawnYet) ?? all[0] ?? null;
}

/** One line per available view, for the conversation and for a picker. */
export function viewLines(model: Model, limit = 16): string[] {
  return viewsFor(model)
    .slice(0, limit)
    .map(
      (v) =>
        `${v.label} [${v.id}] — ${v.family}, ${v.dimensionality}D, ${v.fidelity}` +
        (v.notDrawnYet ? ' (declared; no renderer yet)' : '') +
        `: ${v.shows}. Available because ${v.because}.`
    );
}

/** Every free input, for a picker that offers points as well as views. */
export function pointsOf(model: Model): Quantity[] {
  return freeInputs(symbolTable(model));
}
