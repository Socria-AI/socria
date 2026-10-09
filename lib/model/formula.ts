// lib/model/formula.ts
//
// A QUANTITY WRITTEN AS A FORMULA IS COMPUTED.
//
// "Base area = π r²", "volume = base area × h / 3", "mass = density × volume".
// A scalar with a `definition` is a formula over the model's other quantities,
// and until this file nothing evaluated one: the router answered "nothing
// registered computes a scalar", the compiler drew "nothing in this engine
// draws a scalar yet", and the symbol table listed it as a variable with no
// value — so a cone's volume was a label, and a surface written in terms of
// `r = d/2` could not draw because `r` had no number.
//
// WHAT THIS DOES. Every formula quantity is evaluated against the scope the
// compiler uses — the controls, every quantity with a value, each free input at
// its cursor, the clock — in DEPENDENCY ORDER, so a formula naming another
// formula sees its value, and a formula that names itself, directly or round a
// loop, is reported rather than looped on. The value is written into the same
// channels a fit or a solve already uses: `meta.value` (which symbols.ts binds
// as `computed`), provenance `computation` (which makes it a DERIVED quantity,
// not a slider), fidelity `model-derived`. Nothing downstream needed teaching.
//
// REPLACED, NOT SKIPPED, on every pass — the rule for every derived expander
// (equations.ts, derive.ts expandReadouts): a model is unpacked on every build,
// and the value of a formula at last frame's parameters is not its value.
//
// WHAT IT NEVER DOES: accept a number for a formula from anywhere else. A
// `value` typed beside a definition is overridden by the definition, and a
// proposal cannot pre-fill `meta.value` (propose.ts strips it) — so the number
// on screen is always what the formula gives at the current parameters.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import { namesIn } from './deps';
import { inputsOf } from './derive';
import type { Model, ModelObject } from './schema';
import { bindings, known, symbolTable, unbound } from './symbols';

/** Roles an expander writes that are not formulas of this kind: each has its own evaluator. */
const OTHER_ROLES = new Set(['marginal', 'solution', 'response', 'readout']);
const QUANTITY_KINDS = new Set<ModelObject['kind']>(['scalar', 'constant', 'measurement', 'variable']);

/** Is this object a quantity defined by a formula over the others? */
export function isFormula(o: ModelObject): boolean {
  if (!QUANTITY_KINDS.has(o.kind) || !o.definition) return false;
  // anything with a block of its own is computed by that block's solver
  if (o.over || o.data || o.system || o.equations || o.estimation || o.mechanism || o.gravity || o.pde || o.map || o.solid) return false;
  const role = typeof o.meta?.role === 'string' ? (o.meta.role as string) : '';
  if (OTHER_ROLES.has(role)) return false;
  // a specification's own variables are its axes, not formulas
  if (o.kind === 'variable' && (o.meta?.spec || o.meta?.column)) return false;
  // an equation is a relation to solve, not a formula to evaluate
  if (/(^|[^<>=!])=(?!=)/.test(o.definition)) return false;
  return true;
}

function without<T extends Record<string, unknown>>(m: T | undefined, ...keys: string[]): T | undefined {
  if (!m) return m;
  const out = { ...m };
  for (const k of keys) delete out[k];
  return out;
}

export interface FormulaResult {
  value: number | null;
  /** why there is no value, in the person's terms */
  why?: string;
}

/**
 * The value of every formula quantity, in dependency order — exported so the
 * router and the inspector can ask without unpacking.
 */
export function evaluateFormulas(model: Model): Map<string, FormulaResult> {
  const formulas = model.objects.filter(isFormula);
  const out = new Map<string, FormulaResult>();
  if (!formulas.length) return out;
  // The formulas' own previous values must not feed the evaluation: a stale
  // `meta.value` would answer for a formula whose inputs just moved.
  const clean: Model = {
    ...model,
    objects: model.objects.map((o) => (isFormula(o) && o.meta && 'value' in o.meta ? { ...o, meta: without(o.meta, 'value') } : o)),
  };
  const table = symbolTable(clean);
  const scope = bindings(table);
  for (const q of inputsOf(clean)) scope[q.id.toLowerCase()] = q.at;
  for (const [k, v] of Object.entries(model.at ?? {})) if (Number.isFinite(v)) scope[k.toLowerCase()] = v;
  if (model.time) scope.t = model.time.t;
  const legal = [...known(table), 't'];

  const byName = new Map(formulas.map((o) => [o.id.toLowerCase(), o]));
  const pending = new Map(formulas.map((o) => [o.id, o]));
  for (let pass = 0; pass <= formulas.length && pending.size; pass++) {
    let moved = false;
    for (const [id, o] of [...pending]) {
      const mentions = namesIn(o.definition);
      if (mentions.includes(id.toLowerCase())) {
        out.set(id, { value: null, why: 'it is defined in terms of itself' });
        pending.delete(id);
        moved = true;
        continue;
      }
      // wait until every formula it names has been evaluated
      if (mentions.some((n) => byName.has(n) && pending.has(byName.get(n)!.id))) continue;
      // A NAME THE MODEL DOES NOT HAVE is said as that, before compiling: the
      // compiler refuses a name it was not given, and "not an expression this
      // engine can read" about `nowhere * 2` blames the arithmetic.
      const strangers = mentions.filter((n) => !legal.includes(n));
      const c = strangers.length ? null : compileExpr(o.definition!, legal);
      const v = c ? c.eval(scope) : NaN;
      if (Number.isFinite(v)) {
        out.set(id, { value: v });
        scope[id.toLowerCase()] = v;
      } else {
        const gaps = c ? unbound(table, mentions).filter((q) => !Number.isFinite(scope[q.machine] ?? NaN)) : [];
        out.set(id, {
          value: null,
          why: strangers.length
            ? `it names ${strangers.join(', ')}, which ${strangers.length === 1 ? 'is' : 'are'} not in this model`
            : !c
              ? `“${o.definition}” is not an expression this engine can read`
              : gaps.length
                ? `nothing has given ${gaps.map((q) => q.display).join(', ')} a value yet`
                : 'at the current values it has no real value (a square root of a negative, a division by zero)',
        });
      }
      pending.delete(id);
      moved = true;
    }
    if (!moved) break;
  }
  for (const [id] of pending) out.set(id, { value: null, why: 'it depends on itself through other formulas' });
  return out;
}

/** Every formula quantity, evaluated and written into the channels a computation's results live in. */
export function expandFormulas(model: Model): Model {
  const results = evaluateFormulas(model);
  if (!results.size) return model;
  return {
    ...model,
    objects: model.objects.map((o) => {
      const r = results.get(o.id);
      if (!r) return o;
      const meta: Record<string, string | number | boolean> = { ...(without(o.meta, 'value', 'unevaluated') ?? {}) };
      if (meta.role !== 'measure') meta.role = 'formula';
      if (r.value !== null) meta.value = r.value;
      else meta.unevaluated = (r.why ?? 'something it names has no value').slice(0, 80);
      // WHERE THE VALUE CAME FROM is the engine; where the FORMULA came from is
      // whoever wrote it, and that is kept on the object's own note. A solid's
      // measure already says where its formula came from (solid.ts), and that
      // sentence is kept rather than written over.
      const wrote = o.provenance && o.provenance.origin !== 'computation' ? o.provenance.origin : null;
      const AT = 'evaluated at the current values';
      const detail =
        meta.role === 'measure' && o.provenance?.origin === 'computation' && o.provenance.detail
          ? o.provenance.detail.endsWith(AT) ? o.provenance.detail : `${o.provenance.detail}; ${AT}`
          : `evaluated from “${o.definition}” at the current values${wrote ? ` — the formula itself is ${wrote === 'user' ? 'yours' : wrote === 'inference' ? 'proposed from the conversation' : `from ${wrote}`}` : ''}`;
      return {
        ...o,
        meta,
        provenance: { origin: 'computation', detail },
        // A formula with no value is a statement, not a result — whatever the
        // object claimed before it reached the evaluator.
        fidelity: r.value !== null ? 'model-derived' : 'conceptual',
      };
    }),
  };
}
