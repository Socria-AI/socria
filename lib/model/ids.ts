// lib/model/ids.ts
//
// ONE IDENTIFIER GRAMMAR, for everything that can appear in an expression.
//
// THE FAILURE THIS FILE ANSWERS. The engine had SIX grammars for names, and
// they disagreed:
//
//   lib/model/schema.ts    ^[a-z0-9][a-z0-9_-]{0,47}$   ids: hyphens, leading digits
//   lib/viz-model.ts       ^[a-z0-9][a-z0-9_-]{0,31}$   the browser boundary, 32 chars
//   schema.ts defs/over    ^[a-z][a-z0-9]{0,15}$        no underscore, 16 chars
//   schema.ts state names  ^[a-z][a-z0-9_]{0,23}$       24 chars
//   schema.ts columns      ^[a-z][a-z0-9_]{0,39}$       40 chars
//   lib/logos-math.ts      [a-zA-Z0-9_] after a letter  what can ACTUALLY be evaluated
//
// The last one is the only one that matters, because it is the only one that
// decides whether an expression can be computed. Every other grammar admitting
// something it does not admit is a name the model can hold and nothing can
// evaluate — and the engine reported such names as legal, valued and bindable:
//
//   params: [{ id: 'growth-rate', value: 0.5 }]
//     symbolTable machine symbols  ['growth-rate']
//     known()                      ['growth-rate']
//     bindings()                   { 'growth-rate': 0.5 }
//     resolve('growth-rate')       -> the quantity, value 0.5
//     compileExpr('growth-rate * x', known)   -> null
//     namesIn('growth-rate * x')   -> ['growth', 'rate', 'x']
//     route(evaluate)              -> "something called growth; something called rate"
//     affectedBy(['growth-rate'])  -> []          (the slider marks nothing stale)
//
// Four subsystems, four different wrong answers about one name. So the
// evaluator's grammar becomes the ONE grammar, and anything that cannot be
// written in it is refused at the door rather than admitted and then found
// unusable four layers down.
//
// A MODEL'S OWN ID IS NOT A QUANTITY. `linear-model`, `photon-path` and
// `double-pendulum` are library model ids; they never appear in an expression,
// and narrowing them would break stored work for no gain. `SLUG` is for those.
// Verified before narrowing: of every param and object id in the 19-model
// library, ZERO fail the evaluator's grammar. Nothing real is lost.
//
// PURE.

/**
 * The grammar for anything an expression may mention: a control, an object, a
 * state, a def key, a domain key, a data column.
 *
 * A leading letter because the tokenizer requires one; underscores because the
 * assemblers generate `x_m1` and `vx0`; 48 characters because that is the
 * longest the store already allowed and shortening it would rename existing
 * ids.
 */
export const NAME = /^[a-z][a-z0-9_]{0,47}$/i;

/** A model's own id, which never reaches an evaluator. Hyphens are fine here. */
export const SLUG = /^[a-z0-9][a-z0-9_-]{0,47}$/i;

export function isName(s: unknown): s is string {
  return typeof s === 'string' && NAME.test(s);
}

export function isSlug(s: unknown): s is string {
  return typeof s === 'string' && SLUG.test(s);
}

/**
 * The key two names are THE SAME name under.
 *
 * Case-insensitive, because the evaluator is: `compileExpr` lowercases every
 * token and the run scope is keyed lowercase. Two quantities differing only in
 * case are therefore one quantity to everything that computes, and pretending
 * otherwise produced the worst bug in the audit — two ODE states named `S` and
 * `s` were kept as distinct states by the sanitiser and collapsed into one slot
 * at run time, so the integrator solved a different system from the one
 * declared, with no refusal and no note.
 */
export function sameName(a: string): string {
  return a.toLowerCase();
}

/**
 * Does this set already hold a name that collides with `id`?
 *
 * Used by the sanitisers to REFUSE a collision rather than keep both and let
 * the evaluator pick one. Returns the colliding name so the refusal can say
 * which.
 */
export function collidesWith(taken: Iterable<string>, id: string): string | null {
  const key = sameName(id);
  for (const t of taken) if (sameName(t) === key) return t;
  return null;
}
