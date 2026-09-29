// lib/model/mechanism.ts
//
// PARTS THAT ASSEMBLE THEMSELVES INTO EQUATIONS.
//
// THE POINT, AND IT IS NOT MECHANICS. A person describes a system as parts and
// connections — three masses, four springs, two dampers, a driving force — and
// that description is not an equation. Somewhere the parts have to become
// M ẍ + C ẋ + K x = F(t), and the question is WHERE. If the renderer does it,
// every new topology is a new component and Logos is a catalogue. If the model
// does it, the topology is data and one code path runs all of them.
//
// So this file is the assembler. In: bodies, springs, dampers, forces. Out: a
// SystemDecl of exactly the kind system.ts already integrates — 2n named states,
// n displacements and n velocities, with right-hand sides written out as
// expressions. Nothing downstream knows a mechanism from a population model,
// which is the property that makes the grammar reusable:
//
//   a body    is anything with inertia          — a mass, an inductor, a stock
//   a spring  is anything restoring             — a stiffness, a capacitance
//   a damper  is anything dissipative           — friction, resistance, decay
//   a force   is anything driving                — a load, a source, an inflow
//
// An RC circuit, an SIR model and a supply chain are written as `system` blocks
// directly because their states are not displacements; the day a second topology
// earns a grammar, it becomes another assembler beside this one and the
// integrator, the router and every representation stay as they are.
//
// WHAT IT REFUSES. A spring to a body that does not exist; a mass that is not a
// number and not an expression; a topology it does not have a grammar for. Each
// comes back as missing STRUCTURE, named, because a mechanism with a dangling
// spring is not a mechanism with a small error in it.
//
// PURE. Expressions in, expressions out. It does no arithmetic itself: the
// stiffness matrix is assembled SYMBOLICALLY, so k₂ stays the parameter k₂ all
// the way into the right-hand side and moving its slider changes the equations
// rather than requiring a re-assembly.

import { compileExpr } from '@/lib/logos-math';
import type { BodyDecl, MechanismDecl, Model, ModelObject, SystemDecl } from './schema';
import type { Missing } from './system';

/** The layout a drawing needs: where each body sits when nothing has moved. */
export interface MechLayout {
  bodies: { id: string; label: string; at: number; mass: string }[];
  links: { id: string; kind: 'spring' | 'damper'; from: string; to: string; value: string; label: string }[];
  forces: { id: string; on: string; expr: string; label: string }[];
  /** the extent the mechanism occupies along its axis, in model units */
  span: [number, number];
}

const asExpr = (v: number | string | undefined, fallback = '0'): string =>
  v === undefined ? fallback : typeof v === 'number' ? String(v) : `(${v})`;

/**
 * Turn parts into a state-space system.
 *
 * THE ASSEMBLY, WRITTEN OUT. For each body i the displacement xᵢ and velocity vᵢ
 * are states; dxᵢ/dt = vᵢ; and
 *
 *     dvᵢ/dt = [ Σ springs on i + Σ dampers on i + Σ forces on i ] / mᵢ
 *
 * where a spring between i and j contributes −k(xᵢ − xⱼ) to i and the negative of
 * that to j, a damper contributes −c(vᵢ − vⱼ) the same way, and 'ground' is a
 * body whose displacement and velocity are identically zero. That is the whole
 * of it: Newton's second law per body, with the connection table deciding the
 * terms — which is exactly what the matrix form is, before anybody arranged it
 * into matrices.
 */
export function assemble(
  mech: MechanismDecl
): { ok: true; system: SystemDecl; layout: MechLayout } | { ok: false; missing: Missing[] } {
  const missing: Missing[] = [];
  if (mech.along && mech.along !== 'line') {
    return {
      ok: false,
      missing: [{
        what: `a grammar for '${mech.along}' topologies`,
        unlocks: 'assembly; only bodies on a line have one, and anything else has to be written as a system of equations directly',
      }],
    };
  }
  const bodies = mech.bodies ?? [];
  if (!bodies.length) {
    return { ok: false, missing: [{ what: 'at least one body', unlocks: 'anything: a mechanism with no inertia has no state' }] };
  }

  const known = new Set(bodies.map((b) => b.id));
  const check = (list: { id: string; between: [string, string] }[] | undefined, what: string) => {
    for (const l of list ?? []) {
      for (const end of l.between) {
        if (end !== 'ground' && !known.has(end)) {
          missing.push({
            what: `the body '${end}' that ${what} ${l.id} is attached to`,
            unlocks: 'assembly; a connection to something that is not in the mechanism cannot contribute a force',
          });
        }
      }
    }
  };
  check(mech.springs, 'spring');
  check(mech.dampers, 'damper');
  for (const f of mech.forces ?? []) {
    if (!known.has(f.on)) {
      missing.push({
        what: `the body '${f.on}' that force ${f.id} acts on`,
        unlocks: 'assembly',
      });
    }
  }
  for (const b of bodies) {
    if (b.mass === undefined || (typeof b.mass === 'number' && !(b.mass > 0))) {
      missing.push({ what: `a positive mass for ${b.label ?? b.id}`, unlocks: 'a numerical run; it can stay symbolic until then' });
    }
  }
  if (missing.length) return { ok: false, missing };

  const xOf = (id: string) => (id === 'ground' ? '0' : `x_${id}`);
  const vOf = (id: string) => (id === 'ground' ? '0' : `v_${id}`);

  const states: SystemDecl['states'] = [];
  const rhs: Record<string, string> = {};
  for (const b of bodies) {
    states.push({
      name: xOf(b.id),
      init: b.x0 ?? 0,
      units: 'm',
      means: `displacement of ${b.label ?? b.id} from where it rests`,
    });
    states.push({
      name: vOf(b.id),
      init: b.v0 ?? 0,
      units: 'm/s',
      means: `velocity of ${b.label ?? b.id}`,
    });
    rhs[xOf(b.id)] = vOf(b.id);
  }

  for (const b of bodies) {
    const terms: string[] = [];
    for (const sp of mech.springs ?? []) {
      const [a, c] = sp.between;
      const k = asExpr(sp.value);
      if (a === b.id) terms.push(`-${k} * (${xOf(a)} - ${xOf(c)})`);
      else if (c === b.id) terms.push(`-${k} * (${xOf(c)} - ${xOf(a)})`);
    }
    for (const dp of mech.dampers ?? []) {
      const [a, c] = dp.between;
      const cc = asExpr(dp.value);
      if (a === b.id) terms.push(`-${cc} * (${vOf(a)} - ${vOf(c)})`);
      else if (c === b.id) terms.push(`-${cc} * (${vOf(c)} - ${vOf(a)})`);
    }
    for (const f of mech.forces ?? []) {
      if (f.on === b.id) terms.push(`(${f.expr})`);
    }
    const sum = terms.length ? terms.join(' + ') : '0';
    rhs[vOf(b.id)] = `(${sum}) / (${asExpr(b.mass, '1')})`;
  }

  // Energy, as the integrator's own witness. Kinetic plus the strain energy of
  // every spring; a damped or driven system does not conserve it, and the
  // undamped undriven case is exactly the one where drifting energy means the
  // step is too coarse — which is a fact about the run worth showing.
  const kinetic = bodies.map((b) => `0.5 * (${asExpr(b.mass, '1')}) * ${vOf(b.id)}^2`);
  const strain = (mech.springs ?? []).map(
    (sp) => `0.5 * (${asExpr(sp.value)}) * (${xOf(sp.between[0])} - ${xOf(sp.between[1])})^2`
  );
  const energy = [...kinetic, ...strain].join(' + ') || '0';

  const observe: Record<string, string> = { energy };
  // The first body's displacement and velocity are named plainly as well, so a
  // one-body mechanism reads as x and v in a plot without the reader having to
  // know the assembler's naming.
  if (bodies.length === 1) {
    observe.x = xOf(bodies[0].id);
    observe.v = vOf(bodies[0].id);
  }

  const layout = layoutOf(mech, bodies);

  return {
    ok: true,
    system: {
      states,
      rhs,
      ...(mech.dt ? { dt: mech.dt } : { dt: 0.005 }),
      ...(mech.steps ? { steps: mech.steps } : { steps: 4000 }),
      observe,
      invariant: (mech.dampers?.length ?? 0) || (mech.forces?.length ?? 0) ? undefined : 'energy',
      method: 'rk4',
    },
    layout,
  };
}

/** Where the parts sit when nothing has moved — the drawing's skeleton. */
function layoutOf(mech: MechanismDecl, bodies: readonly BodyDecl[]): MechLayout {
  // Evenly spaced unless the model says otherwise. A position is a DRAWING
  // choice and is marked as such wherever it is shown; the displacements that
  // move a body away from it are computed.
  const spacing = 2;
  const placed = bodies.map((b, i) => ({
    id: b.id,
    label: b.label ?? b.id,
    at: b.at ?? (i + 1) * spacing,
    mass: asExpr(b.mass, '1'),
  }));
  const where = (id: string) => (id === 'ground' ? 0 : (placed.find((p) => p.id === id)?.at ?? 0));
  const links: MechLayout['links'] = [
    ...(mech.springs ?? []).map((s) => ({
      id: s.id,
      kind: 'spring' as const,
      from: s.between[0],
      to: s.between[1],
      value: asExpr(s.value),
      label: s.label ?? s.id,
    })),
    ...(mech.dampers ?? []).map((d) => ({
      id: d.id,
      kind: 'damper' as const,
      from: d.between[0],
      to: d.between[1],
      value: asExpr(d.value),
      label: d.label ?? d.id,
    })),
  ];
  const xs = [0, ...placed.map((p) => p.at)];
  const lo = Math.min(...xs) - 1;
  const hi = Math.max(...xs) + 1;
  return {
    bodies: placed,
    links,
    forces: (mech.forces ?? []).map((f) => ({ id: f.id, on: f.on, expr: f.expr, label: f.label ?? f.id })),
    span: [lo, hi],
    // `where` is used by the caller through the bodies list; kept local so the
    // layout stays plain data.
  } as MechLayout & { where?: typeof where };
}

/** Read a mechanism off an object and assemble it, or say what is missing. */
export function readMechanism(
  model: Model,
  o: ModelObject
): { ok: true; system: SystemDecl; layout: MechLayout } | { ok: false; missing: Missing[] } {
  if (!o.mechanism) {
    return { ok: false, missing: [{ what: 'a mechanism declaration', unlocks: 'assembly into equations of motion' }] };
  }
  // A VALUE THE MODEL CANNOT EVALUATE IS MISSING, and saying so HERE is what puts
  // it in the person's terms. `mass: "nope"` assembles perfectly — it is a string
  // where a string is allowed — and then the assembled equations do not compile,
  // so the failure surfaced as "a readable expression for dv_m1/dt", which is
  // true and useless. A mass is a mass; the message should say so.
  const known = [...model.params.map((p) => p.id), 't'];
  const missing: Missing[] = [];
  const check = (value: number | string | undefined, what: string) => {
    // UNDEFINED IS MISSING, NOT FINE. This returned early on undefined, so a
    // part whose value nobody had chosen passed every check — and since the
    // sanitiser used to delete such a part outright, the two together produced
    // an assembled system with the connection simply gone. Both halves are
    // fixed: the part survives sanitising with no value, and it is named here.
    if (value === undefined) {
      missing.push({
        what: `${what} — nobody has chosen one`,
        unlocks: 'a numerical run; the connection is part of the model either way',
      });
      return;
    }
    if (typeof value === 'number') return;
    if (!compileExpr(value, known)) {
      missing.push({
        what: `${what} — “${value}” is neither a number nor one of this model's controls`,
        unlocks: 'a numerical run; it can stay symbolic until then',
      });
    }
  };
  for (const b of o.mechanism.bodies ?? []) check(b.mass, `a mass for ${b.label ?? b.id}`);
  for (const sp of o.mechanism.springs ?? []) check(sp.value, `a stiffness for ${sp.label ?? sp.id}`);
  for (const dp of o.mechanism.dampers ?? []) check(dp.value, `a damping value for ${dp.label ?? dp.id}`);
  if (missing.length) return { ok: false, missing };

  return assemble(o.mechanism);
}

/**
 * The equations, written out for a reader.
 *
 * NOT decoration: this is the assembled system in the notation the person
 * expects, so they can check that what Logos built is what they described. A
 * mechanism whose equations cannot be read is a black box with springs drawn on
 * it.
 */
export function equationsOf(mech: MechanismDecl): string[] {
  const out: string[] = [];
  const assembled = assemble(mech);
  if (!assembled.ok) return out;
  for (const b of mech.bodies) {
    const rhs = assembled.system.rhs[`v_${b.id}`];
    if (rhs) out.push(`${b.mass} · d²x_${b.id}/dt² = ${rhs.replace(/^\(/, '').replace(/\) \/ \(.*\)$/, '')}`);
  }
  return out;
}

// ── the parts become objects ────────────────────────────────────────

/**
 * Expand a mechanism into first-class model objects.
 *
 * THE MOVE THAT MAKES SELECTION SEMANTIC WITHOUT A LINE OF NEW UI. A mechanism
 * could have been drawn as one object with its parts as anonymous shapes inside
 * it, and then "what is this?" about a spring would have had nothing to answer
 * from. Instead the assembler emits a REAL ModelObject per body, spring, damper
 * and force — with a kind, a meaning, its own parameter dependencies and typed
 * relations to what it connects — and every mechanism afterwards is handled by
 * machinery that already existed: entities for the conversation, dependency
 * propagation on a parameter change, the trace walk, provenance.
 *
 * Idempotent: expanding twice adds nothing, because a model is expanded on every
 * build and a build happens on every frame.
 */
export function expand(model: Model): Model {
  const carriers = model.objects.filter((o) => !!o.mechanism);
  if (!carriers.length) return model;

  const have = new Set(model.objects.map((o) => o.id));
  const added: ModelObject[] = [];
  const patched = new Map<string, ModelObject>();

  for (const carrier of carriers) {
    const built = assemble(carrier.mechanism!);
    if (!built.ok) continue;

    // The carrier gains the assembled system, so the ODE solver runs it with no
    // knowledge that it came from parts.
    if (!carrier.system) {
      patched.set(carrier.id, { ...carrier, kind: 'system', system: built.system });
    }

    const paramsIn = (expr: string) =>
      model.params.filter((p) => new RegExp(`\\b${p.id}\\b`).test(expr)).map((p) => p.id);

    for (const b of built.layout.bodies) {
      const id = `${carrier.id}__${b.id}`;
      if (have.has(id)) continue;
      added.push({
        id,
        kind: 'body',
        label: b.label,
        meaning: `a body with mass ${b.mass}; its displacement and velocity are states of ${carrier.label}`,
        units: 'm',
        depends: paramsIn(b.mass),
        relations: [{ to: carrier.id, as: 'contains', why: 'it is one of the bodies this mechanism is assembled from' }],
        meta: { mech: carrier.id, part: b.id, at: b.at, role: 'body' },
      });
    }
    for (const l of built.layout.links) {
      const id = `${carrier.id}__${l.id}`;
      if (have.has(id)) continue;
      const ends = [l.from, l.to].filter((e) => e !== 'ground');
      added.push({
        id,
        kind: l.kind === 'spring' ? 'spring' : 'damper',
        label: l.label,
        meaning:
          l.kind === 'spring'
            ? `a restoring connection of stiffness ${l.value} between ${l.from} and ${l.to}: it contributes −k(x₁ − x₂) to each`
            : `a dissipative connection of coefficient ${l.value} between ${l.from} and ${l.to}: it contributes −c(v₁ − v₂) to each`,
        units: l.kind === 'spring' ? 'N/m' : 'N·s/m',
        depends: paramsIn(l.value),
        relations: [
          { to: carrier.id, as: 'contains', why: 'it is one of the connections this mechanism is assembled from' },
          ...ends.map((e) => ({
            to: `${carrier.id}__${e}`,
            as: l.kind === 'spring' ? ('constrains' as const) : ('influences' as const),
            why: l.kind === 'spring' ? 'its extension is a force on this body' : 'its rate is a force on this body',
          })),
        ],
        meta: { mech: carrier.id, part: l.id, role: l.kind, from: l.from, to: l.to },
      });
    }
    for (const f of built.layout.forces) {
      const id = `${carrier.id}__${f.id}`;
      if (have.has(id)) continue;
      added.push({
        id,
        kind: 'force',
        label: f.label,
        meaning: `an external force ${f.expr} applied to ${f.on}`,
        units: 'N',
        depends: paramsIn(f.expr),
        relations: [{ to: `${carrier.id}__${f.on}`, as: 'influences', why: 'it drives this body' }],
        meta: { mech: carrier.id, part: f.id, role: 'force', on: f.on },
      });
    }
  }

  if (!added.length && !patched.size) return model;
  return {
    ...model,
    objects: [...model.objects.map((o) => patched.get(o.id) ?? o), ...added],
  };
}

/** Where a part sits when nothing has moved, from the expanded object's own note. */
export function restOf(o: ModelObject): number {
  const at = o.meta?.at;
  return typeof at === 'number' ? at : 0;
}

/** The state name carrying a body's displacement, and its velocity. */
export function statesOf(part: string): { x: string; v: string } {
  return { x: `x_${part}`, v: `v_${part}` };
}
