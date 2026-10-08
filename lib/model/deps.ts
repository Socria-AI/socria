// lib/model/deps.ts
//
// WHAT A CHANGE REACHES — derived from the mathematics, not declared by anybody.
//
// THE FAILURE THIS FILE ANSWERS. `affectedBy` walked two things: an object's
// `depends` array, and three relation types. Executed against the extraction
// prompt's own SIR shape:
//
//   SIR (a system, capability `dynamic`):  depends = null
//     setParam(beta)  -> affected: []
//     setTime(10)     -> affected: []
//
// Changing the infection rate of an epidemic model recomputed NOTHING. And on
// a spring-mass mechanism, `setParam(c)` reached the damper object and reached
// neither the carrier that owns the integration nor the body whose motion
// actually changed.
//
// Two causes, both structural:
//
//   · `depends` IS UNVALIDATED LANGUAGE-MODEL OUTPUT. It is whatever the
//     extractor chose to write, it is absent from every realistic proposal,
//     and `depends: ['nonexistent']` is stored and followed. A dependency
//     graph that a model writes for us is not a dependency graph.
//   · THE RELATIONS FOLLOWED ARE NOT THE RELATIONS EMITTED. It followed
//     `depends-on`, `derived-from` and `parameterizes`; the expanders emit
//     `contains`, `influences` and `correlates-with`. Of the relations that
//     actually exist on a built model, exactly one was ever followed.
//
// SO DEPENDENCIES ARE READ OUT OF THE EXPRESSIONS. A system whose right-hand
// side mentions `beta` depends on `beta` because it says so in the only place
// that cannot be wrong — the mathematics that will be evaluated. Nothing has
// to be declared, nothing can drift, and a model that arrived with no
// `depends` at all propagates correctly.
//
// AND A CARRIER'S PARTS MOVE WITH IT. A body is drawn from its carrier's run,
// so a change that reaches the carrier reaches every part expanded out of it —
// which is what `contains` means and why it is now followed, in the direction
// from the whole to the part.
//
// PURE. No evaluation, no clock, no React.

import type { Model, ModelObject, Relation } from './schema';

/**
 * The identifier grammar, and it is the SCHEMA'S OWN.
 *
 * `freeNames` in lib/logos-math.ts exists and does nearly this, but its token
 * pattern is `[a-z][a-z0-9]*` with no underscore — so `v_m1` reads as `v` and
 * `m1`, and every assembled mechanism state is invisible to it. Matching the
 * grammar ids are actually validated against (`^[a-z][a-z0-9_]{0,23}$`) is the
 * whole difference between this working and not.
 */
const NAME = /[a-z][a-z0-9_]*/gi;

/**
 * Names that are the language rather than the model.
 *
 * Deliberately small. A false positive costs one spurious edge in the graph —
 * something recomputes that did not need to — and a false negative costs a
 * stale picture presented as current, which is the failure mode worth avoiding.
 */
const LANGUAGE = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'asinh', 'acosh', 'atanh', 'arcsinh', 'arccosh', 'arctanh',
  'sec', 'csc', 'cot',
  'exp', 'log', 'ln', 'log2', 'log10', 'lg', 'logbase', 'sqrt', 'cbrt', 'abs', 'sign', 'floor', 'ceil', 'round',
  'step', 'heaviside', 'min', 'max', 'pow', 'mod', 'hypot',
  'pi', 'e', 'tau', 'inf',
]);

/** A number with an exponent, which is not a name: `1e3` used to yield the name `e3`. */
const EXPONENT = /\b\d+(?:\.\d+)?e[+-]?\d+\b/gi;

/** Every name an expression mentions, by the model's own grammar. */
export function namesIn(expr: unknown): string[] {
  if (typeof expr === 'number') return [];
  if (typeof expr !== 'string' || !expr) return [];
  const out = new Set<string>();
  for (const m of expr.replace(EXPONENT, ' ').match(NAME) ?? []) {
    const w = m.toLowerCase();
    if (!LANGUAGE.has(w)) out.add(w);
  }
  return [...out];
}

/**
 * Everything this object's mathematics refers to.
 *
 * Walks every place an expression can live on an object, including inside each
 * declaration block. A block the engine gains later is one clause here, and
 * missing that clause degrades to "this object does not propagate" rather than
 * to a wrong answer.
 */
export function referencesOf(o: ModelObject): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    for (const n of namesIn(v)) out.add(n);
  };

  add(o.definition);
  for (const v of Object.values(o.defs ?? {})) add(v);
  add(o.value);

  // A system: its states' starting values, its right-hand sides, its
  // observables. The state NAMES are themselves references, because a change to
  // one state's law changes every state coupled to it.
  if (o.system) {
    for (const st of o.system.states ?? []) {
      out.add(st.name.toLowerCase());
      add(st.init);
    }
    for (const rhs of Object.values(o.system.rhs ?? {})) add(rhs);
    for (const obs of Object.values(o.system.observe ?? {})) add(obs);
  }

  // A mechanism: masses, stiffnesses, damping values and driving forces.
  if (o.mechanism) {
    for (const b of o.mechanism.bodies ?? []) {
      add(b.mass);
      add(b.x0);
      add(b.v0);
    }
    for (const l of [...(o.mechanism.springs ?? []), ...(o.mechanism.dampers ?? [])]) add(l.value);
    for (const f of o.mechanism.forces ?? []) add(f.expr);
  }

  // Gravity: masses, positions, velocities, and the constants that scale them.
  if (o.gravity) {
    for (const b of o.gravity.bodies ?? []) {
      add(b.mass);
      add(b.x);
      add(b.y);
      add(b.vx);
      add(b.vy);
    }
    add(o.gravity.G);
    add(o.gravity.softening);
  }

  // A field: how each species starts and spreads, what carries it, how it
  // reacts, what its ends or edges hold, and how long it runs. The species are
  // references in their own right, as a system's states are.
  if (o.pde) {
    for (const sp of o.pde.species ?? []) {
      out.add(sp.name.toLowerCase());
      add(sp.init);
      add(sp.D);
      add(sp.flux);
      add(sp.edge);
      for (const e of [sp.left, sp.right]) {
        add(e?.value);
        add(e?.flux);
      }
    }
    for (const r of Object.values(o.pde.react ?? {})) add(r);
    for (const e of [o.pde.left, o.pde.right]) {
      add(e?.value);
      add(e?.flux);
    }
    add(o.pde.tEnd);
  }

  // A SYSTEM OF EQUATIONS refers to everything its relations mention, and to
  // its own unknowns. Without this a control appearing only inside the
  // relations reached nothing: verified, changing the tax in a market with a
  // tax marked NOTHING stale, so the equilibrium on screen stayed the old one.
  if (o.equations) {
    for (const r of o.equations.relations) add(r);
    for (const u of o.equations.unknowns) out.add(u.toLowerCase());
  }

  // A specification refers to its columns and its data block by name.
  if (o.estimation) {
    out.add(o.estimation.y.toLowerCase());
    for (const x of o.estimation.x) out.add(x.toLowerCase());
    if (o.estimation.data) out.add(o.estimation.data.toLowerCase());
    if (o.estimation.unit) out.add(o.estimation.unit.toLowerCase());
    if (o.estimation.time) out.add(o.estimation.time.toLowerCase());
  }

  if (o.data) out.add(o.data.toLowerCase());

  // THE CONTROL DRIVING THIS QUANTITY. A coefficient bound to a slider does not
  // mention that slider in any expression — the binding lives on `meta.control`
  // — so without this the graph could not see that moving the control changes
  // the coefficient. Verified: `affectedBy(model, ['b1'])` reached the surface
  // (whose expression names b1) and NOT the coefficient b1 drives.
  if (typeof o.meta?.control === 'string') out.add(o.meta.control.toLowerCase());

  // A declared `depends` is KEPT, as a hint and never as the source of truth.
  // It is whatever a language model chose to write; it may name something that
  // does not exist, and it is absent from essentially every real proposal. It
  // can only add edges, and the derived ones above stand on their own.
  for (const d of o.depends ?? []) out.add(d.toLowerCase());

  return out;
}

/**
 * The relations a change travels along.
 *
 * `contains` is here and it is the one that was missing: a part expanded out of
 * a carrier is drawn from the carrier's run, so a change reaching the carrier
 * reaches the part. It is followed FROM THE WHOLE TO THE PART, which is why it
 * is handled separately below rather than added to this list — the relation is
 * written on the part and points at the carrier, so following it naively would
 * propagate the wrong way.
 */
const FOLLOWED: readonly Relation[] = [
  'depends-on', 'derived-from', 'parameterizes', 'influences', 'constrains',
  'evolves-into', 'transforms-into', 'bounded-by',
];

/**
 * Everything a change to `ids` reaches, transitively.
 *
 * `ids` may name controls, objects, states or data blocks — anything the
 * mathematics can mention. Cycles are normal in a model of a system, so the
 * visited set is the termination condition rather than an assumption.
 */
export function affectedBy(model: Model, ids: readonly string[]): string[] {
  const lower = ids.map((i) => i.toLowerCase());
  const refs = new Map<string, Set<string>>();
  for (const o of model.objects) refs.set(o.id, referencesOf(o));

  // Which parts belong to which carrier, from the relation the expanders write.
  const partsOf = new Map<string, string[]>();
  for (const o of model.objects) {
    for (const r of o.relations ?? []) {
      if (r.as !== 'contains') continue;
      const list = partsOf.get(r.to) ?? [];
      list.push(o.id);
      partsOf.set(r.to, list);
    }
  }

  const out = new Set<string>();
  let frontier = [...lower];

  // THE CLOCK. Nothing writes `t` into an expression a body is drawn from —
  // mechanism parts and gravity bodies are placed at stateAt(run, t), and a
  // system or trajectory is a function of t by construction — so setTime
  // reported `affected: []` on a free spring-mass system while everything
  // moved. Objects whose place depends on the clock are reached directly.
  if (lower.includes('t')) {
    for (const o of model.objects) {
      const clocked =
        !!o.system || !!o.mechanism || !!o.gravity || !!o.pde || o.kind === 'trajectory' ||
        typeof o.meta?.mech === 'string' || typeof o.meta?.gravity === 'string' ||
        (typeof o.meta?.of === 'string' && model.objects.some((c) => c.id === o.meta?.of && (!!c.system || !!c.mechanism || !!c.gravity)));
      if (clocked && !out.has(o.id)) {
        out.add(o.id);
        frontier.push(o.id.toLowerCase());
      }
    }
  }

  while (frontier.length) {
    const next: string[] = [];
    const reached = (id: string) => {
      if (out.has(id)) return;
      out.add(id);
      next.push(id.toLowerCase());
      // Down the containment edge, immediately: a part has no independent
      // existence to reach later.
      for (const part of partsOf.get(id) ?? []) {
        if (!out.has(part)) {
          out.add(part);
          next.push(part.toLowerCase());
        }
      }
    };

    for (const o of model.objects) {
      if (out.has(o.id)) continue;
      const mine = refs.get(o.id)!;
      const viaExpression = frontier.some((f) => mine.has(f));
      // AN OBJECT THAT STATES ITS OWN MATHEMATICS DEPENDS ON WHAT IT STATES.
      //
      // The relation edge is for objects with no mathematics of their own — a
      // body placed by its carrier's run, a spring drawn from it. An object that
      // carries an expression already declares its dependencies IN the
      // expression, and following the relation as well over-reports.
      //
      // Measured: ∂wage/∂educ is `b1`, and moving β₃ marked it stale — because
      // it is `derived-from` the surface, and the surface names β₃. The brief
      // that asked for this was explicit: changing β₃ must invalidate the
      // marginal effects INVOLVING β₃ and not the others. It is one edge, and
      // it is the difference between a dependency graph and a broadcast.
      const statesItsOwn = !!o.definition || !!(o.defs && Object.keys(o.defs).length);
      const viaRelation =
        !statesItsOwn &&
        (o.relations ?? []).some((r) => FOLLOWED.includes(r.as) && frontier.includes(r.to.toLowerCase()));
      if (viaExpression || viaRelation) reached(o.id);
    }
    frontier = next;
  }

  return [...out];
}

/**
 * What this object rests on, for "why is this here?".
 *
 * The inverse view of the same derived graph: the controls and objects whose
 * names appear in this one's mathematics.
 */
export function restsOn(model: Model, id: string): { params: string[]; objects: string[] } {
  const o = model.objects.find((x) => x.id === id);
  if (!o) return { params: [], objects: [] };
  const refs = referencesOf(o);
  return {
    params: model.params.filter((p) => refs.has(p.id.toLowerCase())).map((p) => p.id),
    objects: model.objects
      .filter((x) => x.id !== id && refs.has(x.id.toLowerCase()))
      .map((x) => x.id),
  };
}
