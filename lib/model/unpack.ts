// lib/model/unpack.ts
//
// A DECLARATION IS A COMPACT WAY TO WRITE DOWN OBJECTS. This is where they are
// written out.
//
// THE PATTERN, and it is now the rule rather than three special cases. A model
// may carry declarations — `mechanism`, `gravity`, `estimation` — each of which
// is a short way of saying something that has parts:
//
//   mechanism    bodies, springs, dampers, forces   → an assembled system
//   gravity      bodies under mutual attraction     → an assembled system
//   estimation   an outcome, regressors, an error   → a specification's parts
//
// Every one of them expands into first-class ModelObjects with ids, meanings,
// provenance and typed relations — and from that point on nothing downstream
// knows a declaration was involved. Selection, the trace walk, dependency
// propagation on a parameter change, undo, the conversation's entity list: all
// of it already works on objects, and none of it needed teaching.
//
// WHY ONE FILE. Each expander lives beside the thing it understands, because
// that is where the knowledge is. But every caller wants all of them, and
// before this each caller picked which ones to run — so a model could reach the
// compiler with its mechanism unpacked and its specification still folded up,
// and whether you could select a coefficient depended on which function had
// touched the model last. One entry point, called everywhere, and that class of
// bug is gone.
//
// ORDER MATTERS ONCE: mechanism and gravity both produce a `system` on their
// carrier, so they run before anything that reads systems. They do not interact
// with each other — an object carries at most one declaration in practice, and
// an object carrying two is expanded by both, which is correct.
//
// IDEMPOTENT, and every expander enforces that itself by id: a model is
// unpacked on every build, and a build happens on every frame.
//
// PURE.

import { expandMarginals } from './derive';
import { expandEquations } from './equations';
import { expandEstimation } from './estimate';
import { expandGravity } from './gravity';
import { expand as expandMechanism } from './mechanism';
import type { Model } from './schema';

/**
 * Every declaration in this model, written out as objects.
 *
 * Cheap on a model with no declarations: each expander returns the model
 * unchanged by identity when it finds no carriers.
 */
export function unpack(model: Model): Model {
  // `equations` runs LAST, and that is the one ordering constraint here: a
  // solved system's knowns come from the symbol table, so everything that
  // produces a valued quantity — a fitted coefficient, a control — has to be
  // in place before the solve reads them.
  // `equations` runs last of the SOLVERS' expanders; `marginals` runs after all
  // of them, because a slope is differentiated from a relationship that one of
  // them wrote — the response surface a specification produces does not exist
  // until expandEstimation has run.
  return expandMarginals(expandEquations(expandEstimation(expandGravity(expandMechanism(model)))));
}
