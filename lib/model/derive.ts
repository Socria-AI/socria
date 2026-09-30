// lib/model/derive.ts
//
// THE SLOPE OF A RELATIONSHIP, DIFFERENTIATED RATHER THAN DESCRIBED.
//
// WHY THIS IS AN OPERATION AND NOT A FEATURE. The econometrics digest makes
// marginal effects central from chapter 6: "Quadratic terms create nonconstant
// marginal effects" and "Interaction terms make one variable's effect depend on
// another". Both of those are claims about a DERIVATIVE. A quadratic term exists
// precisely because the effect of a variable is not a coefficient, and an
// interaction exists precisely because the effect is not a single number — so a
// system that can report coefficients and cannot report slopes has the arithmetic
// and none of the meaning.
//
// AND IT IS NOT AN ECONOMETRICS FEATURE. The same primitive is a marginal cost, an
// elasticity, a gradient in an optimisation, a velocity from a position, a
// sensitivity in a risk model and a Jacobian in a stability analysis. One
// operation, one backend, every domain.
//
// WHAT MAKES IT HONEST. lib/model/expr.ts differentiates a TREE by the rules, so
// the result is exact where a derivative exists and ABSENT where one does not:
// `floor`, `sign`, `mod`, `max` and `min` come back refused by name. The brief
// that asked for this said, correctly, that if symbolic differentiation is not
// supported the honest thing is to say so rather than to generate a plausible
// derivative. It is supported, and where it is not, it says so.
//
// NO OBSERVATIONS ARE INVOLVED. A derivative is a fact about the expression,
// which is why this sits beside `evaluate` and not beside `estimate`: given
// β₂ = 1.2 and β₃ = −0.03 as the person's own hypotheses, ∂ŵage/∂exper is
// 1.2 − 0.06·exper whether or not anybody has ever measured a wage.
//
// PURE.

import { derivativeOf, namesOf as namesIn, parse, print, rename, substitute, type Expr } from './expr';
import type { Model, ModelObject } from './schema';
import { known, symbolTable } from './symbols';
import { basesOf, isPointwise, termExpr, termLabel, type TermDecl } from './terms';

/** The expression an object carries, whichever way it says it. */
export function expressionOf(o: ModelObject): string | null {
  return o.definition ?? o.defs?.z ?? o.defs?.f ?? o.defs?.y ?? null;
}

export interface Marginal {
  /** what it is the slope with respect to */
  wrt: string;
  /** the derivative, in the grammar the evaluator accepts */
  expr: string;
  /** the tree, for a caller that wants to differentiate again */
  tree: Expr;
  /** true when the slope does not depend on anything — a single number */
  constant: boolean;
  /** how it was produced, for provenance */
  how: string;
}

/**
 * ∂(what this object says)/∂wrt, or a named refusal.
 *
 * `wrt` is a canonical name — the axis a surface is drawn over, the variable a
 * person asked about — resolved through the symbol table like everything else, so
 * a display name never becomes an execution identity here either.
 */
export function marginalOf(
  model: Model,
  o: ModelObject,
  wrt: string
): { ok: true; got: Marginal } | { ok: false; why: string } {
  const raw = expressionOf(o);
  if (!raw) {
    return { ok: false, why: `“${o.label}” carries no expression, so there is nothing to differentiate` };
  }
  const table = symbolTable(model);
  // The legal names are the model's own, plus the axes an expression may use.
  const names = [...known(table), 'x', 'y', 'z', 'u', 'v', 's', 't', 'w'];
  const got = derivativeOf(raw, wrt, names);
  if (!got.ok) return { ok: false, why: got.why };
  // CONSTANT MEANS THE SLOPE DOES NOT VARY OVER THE INPUTS — not that the
  // expression has no letters in it. `b1` is a constant marginal effect: it is a
  // parameter, and a parameter is the same everywhere. `b2 + 2·b3·exper` is not.
  // The first test here asked whether any letter survived, so every slope
  // involving a coefficient was reported as varying, which is the opposite of
  // what "a linear term has a constant marginal effect" means.
  const over = namesIn(got.tree);
  const varies = ['x', 'y', 'z', 'u', 'v', 's'].some((axis) => over.includes(axis));
  const constant = !varies;
  return {
    ok: true,
    got: {
      wrt: wrt.toLowerCase(),
      expr: got.expr,
      tree: got.tree,
      constant,
      how: `differentiated symbolically from “${raw}” by the rules (lib/model/expr.ts), not evaluated numerically and not approximated`,
    },
  };
}

/**
 * A specification's expression with its TERMS substituted in.
 *
 * WHY THIS STEP EXISTS. The response surface is written over the axes, so its
 * expression already reads `(b3) * (y^2)` and differentiates correctly. But a
 * specification stated in term NAMES — `b0 + b1*educ + b2*exper + b3*exper_pow2`
 * — would differentiate with respect to `exper` as `b2`, which is true of the
 * text and false of the model: `exper_pow2` IS `exper` squared and contributes
 * `2·b3·exper`. Composition has to happen before differentiation, and it is a
 * tree operation (expr.ts substitute), not a string one.
 */
export function withTermsSubstituted(
  raw: string,
  terms: Readonly<Record<string, TermDecl>>,
  names: readonly string[]
): string | null {
  const tree = parse(raw, names);
  if (!tree) return null;
  const into: Record<string, Expr> = {};
  for (const [name, t] of Object.entries(terms)) {
    if (!isPointwise(t)) continue;
    const e = termExpr(t);
    if (!e) continue;
    const sub = parse(e, names);
    if (sub) into[name.toLowerCase()] = sub;
  }
  return Object.keys(into).length ? print(substitute(tree, into)) : raw;
}

/**
 * The marginal effects of a relationship, as first-class objects.
 *
 * ONE PER VARIABLE THE RELATIONSHIP IS DRAWN OVER, because those are the
 * quantities somebody is holding and moving. A coefficient's derivative is also
 * computable and is not emitted: ∂ŷ/∂β₃ is `exper²`, which is true, useful for
 * sensitivity and not what anybody means by a marginal effect — so it is
 * available through `marginalOf` and not added to the model unasked.
 *
 * Each one carries `origin: 'computation'` and `fidelity: 'model-derived'`,
 * because that is what actually happened: a derivative was computed from the
 * expression. It is NOT `data-derived` — no observation is involved — and it is
 * not `conceptual`, because it was not drawn to make an idea legible.
 */
export function expandMarginals(model: Model): Model {
  const add: ModelObject[] = [];
  const have = new Set(model.objects.map((o) => o.id));

  for (const o of model.objects) {
    // The relationships worth differentiating are the ones a model states as a
    // dependent quantity over named inputs. `over` is how an object says which
    // inputs those are, so it is also the list of slopes worth having.
    const raw = expressionOf(o);
    if (!raw || !o.over) continue;
    if (o.meta?.role === 'marginal') continue;
    const axes = ['x', 'y', 'z'].filter((k) => !!o.over?.[k]);
    if (!axes.length) continue;
    // What the axes are CALLED, so the object reads as ∂wage/∂exper rather than
    // ∂z/∂y. A response surface records this; anything else falls back to the
    // axis letter, which is still true.
    const namedAxes = typeof o.meta?.axes === 'string' ? String(o.meta.axes).split(',').map((s) => s.trim()) : [];
    const outcome = typeof o.meta?.outcome === 'string' ? (o.meta.outcome as string) : o.label;

    for (const [i, axis] of axes.entries()) {
      const got = marginalOf(model, o, axis);
      const called = namedAxes[i] || axis;
      const id = `${o.id}__d_${called.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`.slice(0, 48);
      if (have.has(id)) continue;
      have.add(id);

      if (!got.ok) {
        // REFUSED, AND KEPT AS AN OBJECT. A slope that cannot be produced is a
        // fact about the model worth having in it — the alternative is silence,
        // and silence about a derivative reads as "there isn't one".
        add.push({
          id,
          kind: 'annotation',
          label: `∂${outcome} / ∂${called}`,
          meaning: `not differentiated: ${got.why}`,
          relations: [{ to: o.id, as: 'derived-from', why: 'it would be the slope of this relationship' }],
          fidelity: 'conceptual',
          provenance: { origin: 'equation', detail: got.why },
          meta: { of: o.id, role: 'marginal', wrt: called, unsupported: true },
        });
        continue;
      }

      const m = got.got;
      // ── THE SLOPE, WRITTEN OVER ITS OWN AXIS ────────────────────────
      //
      // The surface is written over `x` and `y`, so its derivative is too — and a
      // curve is sampled over `x`. A slope with respect to the SECOND axis
      // therefore comes back mentioning `y`, which as a curve's expression is a
      // free name nothing binds: it would compile and evaluate to nothing.
      //
      // So the axis being differentiated with respect to becomes `x`, and any
      // OTHER axis becomes its own base name. That second rename is not tidiness:
      // in an interaction model ∂ŷ/∂educ is `β₁ + β₃·exper`, and writing it over
      // `exper` is what makes the engine say — correctly — that this slope is
      // only a curve once experience is fixed. A marginal effect that depends on
      // another variable is the thing an interaction term is FOR, and hiding that
      // behind an axis letter would hide it.
      const onto: Record<string, string> = { [axis]: 'x' };
      axes.forEach((other, j) => {
        if (other !== axis) onto[other] = (namedAxes[j] || other).toLowerCase();
      });
      const written = print(rename(m.tree, onto));

      // ── A SLOPE THAT CANNOT BE DRAWN IS STILL A SLOPE ───────────────
      //
      // Two ways a marginal effect ends up unevaluable, and both are real facts
      // about the model rather than failures:
      //
      //   it mentions the OTHER variable. ∂ŷ/∂educ in a model with an
      //   interaction is β₁ + β₃·exper — the effect of education DEPENDS on
      //   experience, which is the entire reason an interaction term exists. As a
      //   curve over education it is only defined once experience is fixed, and
      //   nothing has fixed it.
      //
      //   it will not compile over the names a curve is sampled with. The
      //   derivative of a two-variable surface mentions both, and a curve is
      //   sampled over one.
      //
      // Either way the derivative is KEPT — recorded symbolically, so `derive`
      // still answers and Trace can still explain it — and the object does not
      // claim to be drawable. Emitting `defs` here is what made three library
      // surfaces report "would not compile" underneath a picture that was fine.
      const legal = [...known(symbolTable(model)), 'x'];
      const free = namesIn(parse(written, [...legal, ...axes, ...namedAxes.map((n) => n.toLowerCase())]) ?? { k: 'num', v: 0 })
        .filter((n) => n !== 'x' && !legal.includes(n));
      const drawable = !m.constant && free.length === 0 && !!parse(written, legal);
      if (!m.constant && !drawable) {
        add.push({
          id,
          kind: 'annotation',
          label: `∂${outcome} / ∂${called}`,
          meaning:
            free.length
              ? `the marginal effect of ${called} is ${written} — it DEPENDS on ${free.join(', ')}, so it is not one curve but a family of them, and drawing it needs ${free.length === 1 ? free[0] : 'those'} fixed at a value somebody chooses. That dependence is what an interaction term is for.`
              : `the marginal effect of ${called} is ${written}, which this engine can differentiate and cannot sample over one axis`,
          relations: [{ to: o.id, as: 'derived-from', why: 'it is the slope of this relationship' }],
          fidelity: 'model-derived',
          provenance: { origin: 'computation', detail: m.how },
          meta: { of: o.id, role: 'marginal', wrt: called, expr: written, constant: false, undrawable: true },
        });
        continue;
      }

      add.push({
        id,
        // A CONSTANT SLOPE IS A NUMBER AND A VARYING ONE IS A CURVE, and the
        // difference is the whole content of "a quadratic term makes the
        // marginal effect nonconstant". Drawing a constant as a flat line would
        // be true and would hide the point.
        kind: m.constant ? 'scalar' : 'curve',
        label: `∂${outcome} / ∂${called}`,
        meaning:
          `the marginal effect of ${called}: how much ${outcome} changes per unit of ${called}. ` +
          (m.constant
            ? 'It does not depend on anything, so the effect is the same everywhere.'
            : `It varies with ${called}, so the effect is not a single number — which is what a squared or interacted term is for.`),
        ...(m.constant ? {} : { defs: { f: written }, over: { x: o.over[axis] as [number, number] } }),
        ...(m.constant ? { definition: written } : {}),
        relations: [{ to: o.id, as: 'derived-from', why: 'it is the slope of this relationship' }],
        fidelity: 'model-derived',
        provenance: { origin: 'computation', detail: m.how },
        meta: { of: o.id, role: 'marginal', wrt: called, expr: written, constant: m.constant },
      });
    }
  }

  if (!add.length) return model;
  return { ...model, objects: [...model.objects, ...add] };
}

/** One line per marginal effect, for the inspector, Trace and the conversation. */
export function marginalLines(model: Model): string[] {
  return model.objects
    .filter((o) => o.meta?.role === 'marginal')
    .map((o) =>
      o.meta?.unsupported
        ? `${o.label} — ${o.meaning}`
        : `${o.label} = ${o.meta?.expr}${o.meta?.constant ? ' (constant)' : ' (varies)'} — ${o.provenance?.detail ?? ''}`
    );
}

/**
 * WHERE A FREE INPUT CURRENTLY SITS, given the model's cursor and its domain.
 *
 * The middle of the stated range until somebody moves it. That default is about
 * LOOKING, not about the model: the range is the modelling claim and the engine
 * may never invent one, but where inside it you are standing is a view question
 * with a defensible answer.
 */
export function cursorFor(model: Model, name: string, domain: [number, number]): number {
  const set = model.at?.[name] ?? model.at?.[name.toLowerCase()];
  if (typeof set === 'number' && Number.isFinite(set)) {
    return Math.min(Math.max(set, Math.min(...domain)), Math.max(...domain));
  }
  return (domain[0] + domain[1]) / 2;
}

/**
 * WHAT THE RELATIONSHIP SAYS AT THE POINT SOMEBODY IS STANDING ON.
 *
 * THE OPERATION THE BRIEF CALLS PREDICT, and the thing the person originally
 * asked for in so many words: "compute predicted wage directly from the specified
 * equation". A surface answers it everywhere at once, which is not the same as
 * answering it — you cannot read a number off a mesh.
 *
 * It is a DERIVED quantity: computed from the parameters and the cursor, with no
 * observation anywhere near it, and it moves when either moves. The distinction
 * the brief insists on is exactly visible here — changing β₃ changes the
 * FUNCTION and so changes this; changing the education cursor changes WHERE ON
 * the function this is read, and changes it too, for a different reason.
 */
export function expandReadouts(model: Model): Model {
  // REPLACED, NOT SKIPPED — the second expander for which that is true, and for
  // the same reason as the first (lib/model/equations.ts).
  //
  // A readout is derived from the parameters AND from where the cursor is
  // standing, so an existing one is not "already done", it is "done from the
  // state as it was". And `buildProposal` stores the EXPANDED model, so the
  // readout is already present in the document from the moment it is opened:
  // skipping by id meant moving the education cursor to 12 left the readout
  // reading "wage at education = 10" on a document that had faithfully recorded
  // the move.
  const made = new Map<string, ModelObject>();

  for (const o of model.objects) {
    const raw = expressionOf(o);
    if (!raw || !o.over) continue;
    if (o.meta?.role === 'marginal' || o.meta?.role === 'readout') continue;
    const axes = ['x', 'y', 'z'].filter((k) => !!o.over?.[k]);
    if (!axes.length) continue;
    const named = typeof o.meta?.axes === 'string' ? String(o.meta.axes).split(',').map((s) => s.trim()) : [];
    // ONLY FOR NAMED INPUTS. A surface over anonymous coordinates has no point
    // worth reading off: "f at x = 0" is not a fact anybody asked for, and a
    // readout for every library surface would be noise rather than an answer.
    if (named.length !== axes.length) continue;

    const id = `${o.id}__at`.slice(0, 48);
    if (made.has(id)) continue;

    const tree = parse(raw, [...known(symbolTable(model)), ...axes]);
    if (!tree) continue;
    const onto: Record<string, string> = {};
    const at: Record<string, number> = {};
    axes.forEach((axis, i) => {
      const name = (named[i] || axis).toLowerCase();
      onto[axis] = name;
      at[name] = cursorFor(model, name, o.over![axis] as [number, number]);
    });
    const outcome = typeof o.meta?.outcome === 'string' ? (o.meta.outcome as string) : o.label;
    const where = Object.entries(at).map(([k, v]) => `${k} = ${Number(v.toPrecision(6))}`);

    made.set(id, {
      id,
      kind: 'scalar',
      label: `${outcome} at ${where.join(', ')}`,
      meaning:
        `what the relationship gives at the point currently selected. ` +
        `Computed from the coefficients and from where each input is standing — no observation is involved, and this is not a prediction about anything measured.`,
      definition: print(rename(tree, onto)),
      relations: [{ to: o.id, as: 'derived-from', why: 'it is this relationship read at one point' }],
      fidelity: 'model-derived',
      provenance: {
        origin: 'computation',
        detail: `evaluated from “${raw}” at ${where.join(', ')} — the expression sampler, at one point rather than over a grid`,
      },
      meta: { of: o.id, role: 'readout', at: where.join(', '), outcome },
    });
  }

  if (!made.size) return model;
  const kept = model.objects.map((o) => made.get(o.id) ?? o);
  const fresh = [...made.entries()].filter(([id]) => !model.objects.some((o) => o.id === id));
  return { ...model, objects: [...kept, ...fresh.map(([, o]) => o)] };
}

/** Every free input this model states, with its range and where it is standing. */
export function inputsOf(model: Model): { id: string; label: string; min: number; max: number; at: number; units?: string }[] {
  const table = symbolTable(model);
  const out: { id: string; label: string; min: number; max: number; at: number; units?: string }[] = [];
  for (const q of table.by.values()) {
    if (q.supply !== 'input' || !q.domain) continue;
    const name = (typeof q.means === 'string' ? q.id : q.id).toLowerCase();
    const column = q.display.toLowerCase();
    const [lo, hi] = q.domain;
    out.push({
      id: column,
      label: q.display,
      min: Math.min(lo, hi),
      max: Math.max(lo, hi),
      at: cursorFor(model, column, q.domain),
      ...(q.units ? { units: q.units } : {}),
    });
  }
  return out;
}
