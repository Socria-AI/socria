// lib/model/symbols.ts
//
// ONE AUTHORITATIVE BINDING BETWEEN A MODEL QUANTITY AND AN EXECUTABLE SYMBOL.
//
// THE FAILURE THIS FILE ANSWERS, reproduced before it was written:
//
//   params the UI shows : b0=5, b1=0.7, b2=0.2
//   expression          : spec__b0 + (spec__b1) * x + (spec__b2) * y
//   reports missing     : a value for spec__b0 | spec__b1 | spec__b2
//   primitives drawn    : 0
//
// The interface knew the values. The executor asked for names nothing had.
// Both were correct about their own half, and between them they produced an
// empty three-dimensional box rendered as though the job had succeeded.
//
// THE CAUSE WAS A CONVENTION PRETENDING TO BE A BINDING. `expandEstimation`
// invented canonical ids for coefficients (`spec__b0`, `spec__b1`, …) and then
// resolved each to a control by EXACT ID-STRING EQUALITY against that invented
// convention. Anything named otherwise — `b0`, `beta1`, `intercept` — did not
// bind, the symbol stayed in the expression, and nothing could evaluate it.
// Worse, the author had no way to know the convention: those coefficient
// objects do not exist until the expander runs, so whoever wrote the model
// could not have named a control after one.
//
// DISPLAY NAMES ARE NOT EXECUTION IDENTIFIERS. `β₁`, `\beta_1`, `beta1` and
// `spec__b1` are four ways of writing one quantity, and exactly one of them may
// be what an evaluator is handed. So a quantity is identified by a CANONICAL
// ID, carries a DISPLAY name for people and a MACHINE symbol for expressions,
// and every subsystem resolves through this table rather than inventing its own
// spelling.
//
// A BINDING IS DECLARED, NEVER GUESSED. There are exactly three ways a value
// reaches a quantity, and all three are things somebody wrote down:
//
//   1. the declaration names the control          (`coefficients: {Y_t: 'b1'}`)
//   2. a control's id IS the canonical id          (`params: [{id: 'spec__b1'}]`)
//   3. the quantity itself carries a value         (`defs: {value: '0.7'}`)
//
// There is deliberately NO fuzzy matching — no stripping of prefixes, no
// looking for something that resembles `b1`, no special case for `beta`. A
// binding that guesses is a binding that will one day bind the wrong thing
// silently, which is the same disease in a later costume. What replaces
// guessing is that an unbound quantity is REPORTED, by name, as the thing that
// is missing.
//
// PURE. No evaluation, no clock, no React.

import { NAME } from './ids';
import { inputDomain, type DomainFrom } from './kinds';
import { unitOf } from './units';
import type { Model, ModelObject, Origin, Fidelity } from './schema';

/** What a quantity is FOR, which decides how it may be bound and shown. */
export type SymbolRole = 'parameter' | 'coefficient' | 'variable' | 'state' | 'constant';

/**
 * WHAT SUPPLIES THIS QUANTITY'S VALUES — which is not the same question as what
 * kind of thing it is, and is the one the engine kept getting wrong.
 *
 * THE FAILURE, reproduced before this existed. A wage relationship with the
 * person's own coefficients, asked to be evaluated over education and
 * experience:
 *
 *   says        : "needs observations — wage, education, experience, exper_pow2
 *                  for each case"
 *   surface over: null
 *   sampled over: x ∈ [−3, 3], y ∈ [−3, 3]      ← invented by the engine
 *   box         : ±11.99 in x and y, so the mesh occupied a quarter of it
 *
 * Education from minus three to three years, inside a box four times too wide.
 * Two mistakes with one cause: NOTHING DISTINGUISHED A FREE INPUT FROM AN
 * OBSERVED VARIABLE. A regressor was a column name, so the only way to have
 * values for it was a dataset — and when the picture needed a window anyway, the
 * engine invented one rather than asking for the thing it actually needed.
 *
 * A FREE INPUT NEEDS A DOMAIN, NOT A DATASET. Evaluating z = f(x, y) at
 * chosen values of x and y is a different operation from estimating f's
 * coefficients from observations of x, y and z, and the inputs play a different
 * role in each. This is the distinction, made explicit:
 *
 *   parameter  a quantity the expression USES. β₁ = 2.5. Fixed or manipulable;
 *              moving it changes the function itself.
 *   input      a quantity the expression is evaluated OVER. Free. It needs a
 *              RANGE. Moving it selects a point or a slice within the function.
 *   observed   a quantity whose values come from a dataset. ESTIMATE needs
 *              these; EVALUATE never does.
 *   derived    a quantity computed from others — a fitted coefficient, a solved
 *              unknown, a predicted outcome, a marginal effect.
 *
 * It is not an econometrics distinction. It is the difference between the
 * argument of a function and a measurement of it, and it applies to a demand
 * curve, a stress-strain law, a dose-response relationship and a payoff surface
 * identically.
 */
export type Supply = 'parameter' | 'input' | 'observed' | 'derived' | 'unbound';

export interface Quantity {
  /** the one identity: stable, and what every subsystem keys on */
  id: string;
  /** what a person is shown — may be β₁, may hold characters no evaluator accepts */
  display: string;
  /** what an expression may contain. Always a legal identifier. */
  machine: string;
  role: SymbolRole;
  /** the value, when something has given it one */
  value?: number;
  units?: string;
  origin?: Origin;
  fidelity?: Fidelity;
  /**
   * HOW it got its value, which is not the same as where the value came from.
   * `control` means a slider drives it and moving that slider changes the model.
   */
  boundBy: 'control' | 'declared' | 'computed' | 'unbound';
  /** the control driving it, when one does */
  control?: string;
  /** what it is, for a reader and for the missing-structure sentence */
  means?: string;
  /** WHAT SUPPLIES ITS VALUES — see Supply. Derived from the model's structure. */
  supply: Supply;
  /**
   * The range a FREE INPUT is evaluated over, when the model states one.
   *
   * ABSENT IS A REAL STATE and the one the failure above turned into a guess: an
   * input with no domain is not an input to be sampled over [−3, 3], it is an
   * input whose range nobody has chosen, and choosing it is a modelling act.
   */
  domain?: [number, number];
  /** where the domain came from, so a reader can tell a choice from a default — see lib/model/kinds.ts */
  domainFrom?: DomainFrom;
}

export interface SymbolTable {
  /** every quantity, by canonical id */
  by: Map<string, Quantity>;
  /** machine symbol → canonical id, for resolving what an expression mentions */
  fromMachine: Map<string, string>;
  /** display name → canonical id, for resolving what a person or a model typed */
  fromDisplay: Map<string, string>;
}

/**
 * The machine symbol for an id.
 *
 * Lowercased because the evaluator's scope is lowercased (compile.ts scopeOf),
 * and that mismatch is its own version of this bug — an expression naming a
 * mixed-case control binding in one place and not another.
 */
export function machineOf(id: string): string {
  return id.toLowerCase();
}

/** Normalised display key, so β₁ and `β₁ ` resolve alike without fuzzy matching. */
function displayKey(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * Every formal quantity in this model, with one binding each.
 *
 * Built from the model alone, so any caller — the compiler, the router, the
 * inspector, the conversation, Trace — gets the same answer.
 */
export function symbolTable(model: Model): SymbolTable {
  const by = new Map<string, Quantity>();
  const fromMachine = new Map<string, string>();
  const fromDisplay = new Map<string, string>();

  const put = (q: Quantity) => {
    by.set(q.id, q);
    if (!fromMachine.has(q.machine)) fromMachine.set(q.machine, q.id);
    const d = displayKey(q.display);
    if (d && !fromDisplay.has(d)) fromDisplay.set(d, q.id);
  };

  // CONTROLS FIRST. A control is a quantity in its own right and is also what
  // most other quantities are bound BY, so it has to be in the table before
  // anything resolves against it.
  for (const p of model.params) {
    put({
      id: p.id,
      display: p.label || p.id,
      machine: machineOf(p.id),
      role: 'parameter',
      value: p.value,
      ...(p.units ? { units: p.units } : {}),
      origin: 'user',
      boundBy: 'control',
      control: p.id,
      supply: 'parameter',
      ...(p.means ? { means: p.means } : {}),
    });
  }

  // …then every object that is a quantity rather than a shape.
  for (const o of model.objects) {
    if (by.has(o.id)) continue;
    const role = roleOf(o);
    if (!role) continue;
    const bound = bindingFor(model, o);
    put({
      id: o.id,
      display: o.label || o.id,
      // A FREE INPUT'S OWN NAME IS ITS EXECUTION IDENTITY.
      //
      // The object is `wage_spec__x0` and the quantity is `education`, and an
      // expression that reads a value at a point writes `education` — because
      // that is what it is called. Keying only on the object id meant the
      // readout "wage at education = 12" compiled over a name list that did not
      // contain `education`, evaluated to NaN, and reported the input it was
      // standing on as a quantity with no value.
      //
      // This is the same rule as everywhere else in this file, applied one step
      // further: a display name is not an execution identity, and neither is an
      // internal id — the CANONICAL name is, and for a column of a
      // specification the canonical name is the column.
      machine: columnName(o) ?? machineOf(o.id),
      role,
      ...(bound.value !== undefined ? { value: bound.value } : {}),
      // Its own units first; otherwise what the model says about the name it
      // stands for — a specification's column, the dictionary — so an input
      // the engine made from a declaration still prints "educ (years)".
      ...(() => {
        const u = o.units ?? unitOf(model, columnName(o) ?? o.id) ?? (o.label ? unitOf(model, o.label) : undefined);
        return u ? { units: u } : {};
      })(),
      ...(o.provenance?.origin ? { origin: o.provenance.origin } : {}),
      ...(o.fidelity ? { fidelity: o.fidelity } : {}),
      boundBy: bound.how,
      ...(bound.control ? { control: bound.control } : {}),
      ...supplyOf(model, o),
      ...(o.meaning ? { means: o.meaning } : {}),
    });
  }

  return { by, fromMachine, fromDisplay };
}

/**
 * WHAT SUPPLIES THIS OBJECT'S VALUES, AND OVER WHAT RANGE — from the structure.
 *
 * DERIVED, NEVER DECLARED, for the same reason fidelity is: a model that could
 * announce its own roles would announce the flattering ones. Every branch below
 * reads something the model already says.
 *
 * The order is the order of certainty. A quantity a computation produced is
 * derived whatever else it looks like; one whose values are in an attached
 * dataset is observed; a regressor of a specification with NO data is a FREE
 * INPUT, because that is exactly what it is — the relationship is stated over it
 * and nobody has measured it.
 */
function supplyOf(model: Model, o: ModelObject): { supply: Supply; domain?: [number, number]; domainFrom?: Quantity['domainFrom'] } {
  const role = typeof o.meta?.role === 'string' ? (o.meta.role as string) : '';

  // 1. PRODUCED BY A COMPUTATION. A fitted coefficient, a solved unknown, a
  //    predicted outcome, a marginal effect.
  if (['response', 'marginal', 'solution'].includes(role)) return { supply: 'derived' };
  if (o.provenance?.origin === 'computation' || o.fidelity === 'data-derived') return { supply: 'derived' };

  // 2. A COEFFICIENT IS A PARAMETER, valued or not. It is a quantity the
  //    expression USES, and moving it changes the function — which is the
  //    definition. Whether anything has given it a number yet is a separate
  //    question, answered by `boundBy`.
  if (role === 'coefficient' || role === 'intercept') return { supply: 'parameter' };

  // 3. THE VALUES ARE IN A DATASET. Observed: what ESTIMATE needs and EVALUATE
  //    never does.
  const column = typeof o.meta?.column === 'string' ? (o.meta.column as string) : o.id;
  const carrier = typeof o.meta?.spec === 'string' ? (o.meta.spec as string) : null;
  const spec = carrier ? model.objects.find((x) => x.id === carrier)?.estimation : undefined;
  const block = spec?.data ? model.data?.[spec.data] : undefined;
  const measured = block?.columns?.[column];
  if (measured || block?.index?.[column]) {
    // OBSERVATIONS CARRY THEIR OWN DOMAIN, and it is the right one. A fitted
    // relationship is drawn over the range of the data it was fitted to — that
    // is not a window the engine invented, it is the extent of what was actually
    // measured, and drawing outside it is extrapolation nobody asked for.
    //
    // Without this the response surface of every fitted model in the library
    // started refusing for want of a range, on data whose range is right there.
    const finite = (measured ?? []).filter((v) => Number.isFinite(v));
    return {
      supply: 'observed',
      ...(finite.length >= 2
        ? { domain: [Math.min(...finite), Math.max(...finite)] as [number, number], domainFrom: 'data' as const }
        : {}),
    };
  }

  // 4. THE OUTCOME IS DERIVED, NOT AN INPUT. `wage_hat` is what the relationship
  //    COMPUTES; it is the left-hand side. Classifying it as a free input asked
  //    for a range to evaluate wage over, which is the question backwards — and
  //    with a dataset attached it is observed, which is case 3 above.
  if (role === 'outcome') return { supply: 'derived' };

  // 5. A REGRESSOR THAT IS A TERM IS DERIVED FROM ITS BASES. `exper²` is not a
  //    quantity anybody supplies or chooses a range for; it is `exper` squared,
  //    and `exper` is the free input. Asking for a domain for `exper²` is the
  //    same category error as asking for observations of it.
  if (spec?.terms?.[column]) return { supply: 'derived' };

  // 6. A VARIABLE OF A SPECIFICATION WITH NO DATA IS A FREE INPUT. The
  //    relationship is stated over it and nothing has measured it, which is a
  //    complete and ordinary state — and the one the engine used to call
  //    "needs observations".
  if (spec && ['regressor', 'variable', 'input'].includes(role)) {
    return { supply: 'input', ...domainFor(model, o, spec, column) };
  }

  // 4. A QUANTITY AN EXPRESSION IS EVALUATED OVER, said by the object's own
  //    window. `over: {p: [0, 50]}` is a curve in p, so p is a free input.
  if (o.over && Object.keys(o.over).length && (o.kind === 'variable' || o.kind === 'measurement')) {
    const own = Object.entries(o.over)[0];
    return { supply: 'input', domain: own[1] as [number, number], domainFrom: 'object' };
  }

  // 5. Anything with a value that nothing above claimed is a parameter: a
  //    constant, a coefficient somebody set, a quantity written into the model.
  const has = o.value !== undefined || o.defs?.value !== undefined || typeof o.meta?.value === 'number';
  return { supply: has || o.kind === 'parameter' || o.kind === 'constant' ? 'parameter' : 'unbound' };
}

/**
 * The range a free input is evaluated over, and where it came from.
 *
 * ONE RULE, SHARED WITH THE EXPANDER — lib/model/kinds.ts inputDomain. It
 * always answers now: a declared kind, a written window, a control, the data,
 * the NAME (an indicator by convention is read as 0 or 1 and says so), and
 * otherwise an assumed window that is said wherever it is shown. The refusal
 * this used to end in — "nobody may invent one" — produced an empty frame in
 * the product every time the extractor forgot a `kinds` or an `over`, and a
 * stated default a person can see and change is worth more than a blank.
 */
function domainFor(
  model: Model,
  o: ModelObject,
  spec: NonNullable<ModelObject['estimation']>,
  column: string
): { domain?: [number, number]; domainFrom?: Quantity['domainFrom'] } {
  const d = inputDomain(model, spec, column, o.over);
  return { domain: d.domain, domainFrom: d.from };
}

/**
 * Every FREE INPUT in this model, with its domain or the absence of one.
 *
 * What the readiness layer asks for, what the conversation lists, and what the
 * interface turns into a control — from one place, so all three agree.
 */
export function freeInputs(table: SymbolTable): Quantity[] {
  return [...table.by.values()].filter((q) => q.supply === 'input');
}

/** The free inputs nothing has given a range to. A domain is missing, not data. */
export function withoutDomain(table: SymbolTable): Quantity[] {
  return freeInputs(table).filter((q) => !q.domain);
}

/**
 * The column a quantity IS, when it is one — a legal identifier or nothing.
 *
 * Only for objects a specification named, because those are the ones whose
 * canonical name is the column rather than the generated id.
 */
function columnName(o: ModelObject): string | null {
  const column = typeof o.meta?.column === 'string' ? (o.meta.column as string) : null;
  if (!column) return null;
  return NAME.test(column) ? column.toLowerCase() : null;
}

/** Which objects are quantities. A surface is not; a coefficient is. */
function roleOf(o: ModelObject): SymbolRole | null {
  switch (o.kind) {
    case 'coefficient':
      return 'coefficient';
    case 'parameter':
      return 'parameter';
    case 'constant':
      return 'constant';
    case 'scalar':
    case 'measurement':
      return 'variable';
    case 'variable':
      return 'variable';
    default:
      return null;
  }
}

/**
 * How this object gets its value — declared, never guessed.
 *
 * The three ways, in the order that lets a person override the model: a control
 * the author bound to it, a control whose id IS its id, then a value written on
 * the object itself. Nothing else. An object none of those reach is `unbound`,
 * and being unbound is reported rather than filled in.
 */
function bindingFor(
  model: Model,
  o: ModelObject
): { value?: number; how: Quantity['boundBy']; control?: string } {
  // 1. the declaration named a control for it (meta.control is written by the
  //    expander from the declaration's own binding map).
  const named = typeof o.meta?.control === 'string' ? o.meta.control : null;
  if (named) {
    const p = model.params.find((q) => q.id === named);
    if (p) return { value: p.value, how: 'control', control: p.id };
  }

  // 2. a control whose id IS this quantity's id.
  const same = model.params.find((q) => q.id === o.id);
  if (same) return { value: same.value, how: 'control', control: same.id };

  // 3. a value on the object. `meta.value` is what a fit writes; `defs.value`
  //    is what an edit writes; `o.value` is what a declaration writes.
  const metaValue = typeof o.meta?.value === 'number' ? o.meta.value : undefined;
  if (metaValue !== undefined) return { value: metaValue, how: 'computed' };
  const defValue = o.defs?.value !== undefined ? Number(o.defs.value) : undefined;
  if (defValue !== undefined && Number.isFinite(defValue)) return { value: defValue, how: 'declared' };
  if (typeof o.value === 'number') return { value: o.value, how: 'declared' };

  return { how: 'unbound' };
}

/**
 * Every machine symbol an evaluator may bind, with its number.
 *
 * THE ONE PLACE A SCOPE IS BUILT. compile.ts built its own from `model.params`
 * alone, which is exactly why a coefficient carrying a perfectly good value was
 * invisible to it.
 */
export function bindings(table: SymbolTable): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of table.by.values()) {
    if (q.value !== undefined && Number.isFinite(q.value)) out[q.machine] = q.value;
  }
  return out;
}

/** Every machine symbol that exists, bound or not — the legal names. */
export function known(table: SymbolTable): string[] {
  return [...table.fromMachine.keys()];
}

/**
 * Resolve anything somebody might write to the one quantity it means.
 *
 * A canonical id, a machine symbol, or a display name. Exact matches only,
 * after whitespace and case are normalised — a resolver that reaches further
 * than that is guessing, and a wrong guess here is a number attached to the
 * wrong thing.
 */
export function resolve(table: SymbolTable, ref: string): Quantity | null {
  const direct = table.by.get(ref);
  if (direct) return direct;
  const viaMachine = table.fromMachine.get(machineOf(ref));
  if (viaMachine) return table.by.get(viaMachine) ?? null;
  const viaDisplay = table.fromDisplay.get(displayKey(ref));
  if (viaDisplay) return table.by.get(viaDisplay) ?? null;
  return null;
}

/**
 * The quantities an expression mentions that nothing has bound.
 *
 * What the missing-structure sentence is made of: not "something is missing"
 * but "β₁ (the income coefficient) has no value, and nothing is driving it".
 */
export function unbound(table: SymbolTable, mentioned: readonly string[]): Quantity[] {
  const out: Quantity[] = [];
  for (const name of mentioned) {
    const q = resolve(table, name);
    if (q && q.value === undefined) out.push(q);
  }
  return out;
}

/** One line per quantity, for an inspector, for Trace and for the conversation. */
export function symbolLines(table: SymbolTable, limit = 24): string[] {
  const out: string[] = [];
  for (const q of table.by.values()) {
    if (out.length >= limit) break;
    const where =
      q.boundBy === 'control'
        ? `driven by the control ${q.control}`
        : q.boundBy === 'computed'
          ? 'produced by a computation'
          : q.boundBy === 'declared'
            ? 'written into the model'
            : 'NOT BOUND — nothing has given it a value';
    out.push(
      `${q.display} [${q.id}] — ${q.role}, ${q.value !== undefined ? `= ${q.value}${q.units ? ` ${q.units}` : ''}` : 'no value'}, ${where}`
    );
  }
  return out;
}
