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
import type { Fidelity, Model, ModelObject } from './schema';

/**
 * The families of representation. Not a closed set: adding one is adding a rule
 * below, and nothing downstream switches exhaustively on it.
 */
export type ViewFamily =
  | 'surface'
  | 'curve'
  | 'contour'
  | 'slice'
  | 'field'
  | 'trajectory'
  | 'phase'
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
  const add = (v: ViewSpec) => {
    if (!out.some((x) => x.id === v.id)) out.push(v);
  };
  const table = symbolTable(model);

  for (const o of model.objects) {
    const f = worth(model, o);

    // ── a quantity over two others ────────────────────────────────
    if ((o.kind === 'surface' || o.kind === 'volume') && DRAWS(model, o)) {
      add({
        id: `surface:${o.id}`, family: 'surface', label: o.label, of: o.id, dimensionality: 3,
        because: 'one quantity varies over two others, and it evaluates',
        shows: `${o.label} as a surface over its two inputs`,
        fidelity: f, can: ['select', 'point', 'rotate'], primary: true,
      });
      // Contours and slices are the SAME computation seen differently, and both
      // are already implemented (compile.ts buildContours, buildSlice) — so they
      // are available exactly when the surface is.
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
        fidelity: f, can: ['select', 'point'], notDrawnYet: true,
      });
    }

    // ── a quantity over one other ─────────────────────────────────
    if (['curve', 'line', 'ray'].includes(o.kind) && DRAWS(model, o)) {
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
        fidelity: f, can: ['select', 'point'], notDrawnYet: true,
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
            fidelity: 'data-derived', can: ['select'], notDrawnYet: true,
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
    }
  }

  // ── views of the MODEL rather than of one object ────────────────
  const data = Object.entries(model.data ?? {});
  for (const [key, block] of data) {
    if (!block.columns || !Object.keys(block.columns).length) continue;
    add({
      id: `table:data:${key}`, family: 'table', label: block.label ?? key, of: '', dimensionality: 2,
      because: 'the model carries observations, and a table is what they are',
      shows: 'the supplied numbers, as given — never a fitted line standing in for them',
      fidelity: 'data-derived', can: ['select', 'point'], notDrawnYet: true,
    });
    add({
      id: `matrix:data:${key}`, family: 'matrix', label: `${block.label ?? key} — design`, of: '', dimensionality: 2,
      because: 'the columns a specification uses form a matrix, and its shape is what identification turns on',
      shows: 'the rows and columns a fit would run on, including any built from transformations',
      fidelity: 'data-derived', can: ['select'], notDrawnYet: true,
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
      fidelity: 'model-derived', can: ['select'], notDrawnYet: true,
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
      fidelity: 'model-derived', can: ['select'], notDrawnYet: true,
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
