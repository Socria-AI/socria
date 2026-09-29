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

import type { Model, ModelObject, Origin, Fidelity } from './schema';

/** What a quantity is FOR, which decides how it may be bound and shown. */
export type SymbolRole = 'parameter' | 'coefficient' | 'variable' | 'state' | 'constant';

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
      machine: machineOf(o.id),
      role,
      ...(bound.value !== undefined ? { value: bound.value } : {}),
      ...(o.units ? { units: o.units } : {}),
      ...(o.provenance?.origin ? { origin: o.provenance.origin } : {}),
      ...(o.fidelity ? { fidelity: o.fidelity } : {}),
      boundBy: bound.how,
      ...(bound.control ? { control: bound.control } : {}),
      ...(o.meaning ? { means: o.meaning } : {}),
    });
  }

  return { by, fromMachine, fromDisplay };
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
