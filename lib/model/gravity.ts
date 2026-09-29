// lib/model/gravity.ts
//
// BODIES THAT PULL ON ONE ANOTHER — and the reason there is no solar system in
// this product.
//
// THE FAILURE THIS FILE ANSWERS. Asked to simulate the solar system, Logos
// produced a three-body figure-eight, and the reason was architectural rather
// than a bug: simulations were a FIXED LIST OF FOUR NOUNS (black-hole, orbit,
// oscillator, projectile). "Solar system" is not one of them, so the extractor
// picked the nearest noun — `orbit` — which mounts a gravity surface whose own
// default preset is the figure-eight. Nothing about the request reached the
// physics. The product had answered "which of my demos is this closest to?"
// when it should have asked "what is this system made of?".
//
// So a solar system is not a feature here and never will be. It is:
//
//   bodies + masses + positions + velocities + Newtonian gravity + time
//
// assembled into exactly the state-space system that system.ts already
// integrates. The same assembler produces Earth and Moon, a binary star, a
// three-body figure-eight, a star with five invented planets, and anything else
// somebody can describe in those terms. There is no branch on what it is called.
//
//   dxᵢ/dt  = vxᵢ
//   dvxᵢ/dt = G Σ_{j≠i} mⱼ (xⱼ − xᵢ) / (rᵢⱼ² + ε²)^{3/2}
//
// Written SYMBOLICALLY, so a mass that is a control stays that control in the
// right-hand side and moving it changes the equations rather than requiring a
// reassembly. Softening ε keeps a close pass finite; it is a numerical device
// and is reported as one.
//
// UNITS ARE A CHOICE THE DECLARATION MAKES. Astronomical units, solar masses and
// years give G = 4π², which is both exactly right and numerically well
// conditioned — a year of Earth is a step count a slider can reach. SI is there
// for a system that is not a planetary one. Mixing them silently would be the
// kind of error that produces a plausible picture of nothing.
//
// PURE: a declaration in, a system out. It computes nothing itself; the
// integrator does.

import { compileExpr } from '@/lib/logos-math';
import type { GravityDecl, GravityBodyDecl, Model, ModelObject, SystemDecl } from './schema';
import type { Missing } from './system';

/** G in AU³ / (M☉ · yr²). Exactly 4π² for a circular orbit of one AU in one year. */
export const G_ASTRO = 4 * Math.PI * Math.PI;
/** G in m³ / (kg · s²) — CODATA 2018. */
export const G_SI = 6.6743e-11;

/** How many bodies one system may carry. Pairwise cost is n², and so is the expression. */
export const BODY_CAP = 12;

export interface GravityLayout {
  bodies: {
    id: string;
    label: string;
    /** the state names this body's position and velocity live under */
    states: { x: string; y: string; vx: string; vy: string };
    /** the mass, as written: a number or a control's id */
    mass: string;
    /** where it starts, for the extent the picture is drawn over */
    at: { x: number; y: number };
  }[];
  /** 'astronomical' or 'si', for every label and readout downstream */
  units: 'astronomical' | 'si';
  /** the extent the system occupies at t = 0, in the declaration's own units */
  span: number;
}

const asExpr = (v: number | string | undefined, fallback = '0'): string =>
  v === undefined ? fallback : typeof v === 'number' ? String(v) : `(${v})`;

const num = (v: number | string | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Turn bodies into a state-space system.
 *
 * Two states per body per axis: position and velocity, in the plane. The plane is
 * not a simplification hidden in the code — `plane` is in the declaration, the
 * layout carries it, and the science block says the solar system is very nearly
 * coplanar and that this model treats it as exactly so.
 */
export function assembleGravity(
  decl: GravityDecl
): { ok: true; system: SystemDecl; layout: GravityLayout } | { ok: false; missing: Missing[] } {
  const missing: Missing[] = [];
  const bodies = (decl.bodies ?? []).slice(0, BODY_CAP);
  if (bodies.length < 2) {
    return {
      ok: false,
      missing: [
        {
          what: 'at least two bodies',
          unlocks: 'gravity: one body on its own has nothing to fall toward, so there is no motion to integrate',
        },
      ],
    };
  }

  const seen = new Set<string>();
  bodies.forEach((b: GravityBodyDecl, i: number) => {
    if (!b.id || seen.has(b.id)) {
      missing.push({ what: `a distinct name for body ${i + 1}`, unlocks: 'assembly; two bodies cannot share one name' });
    }
    seen.add(b.id);
    if (b.mass === undefined) {
      missing.push({ what: `a mass for ${b.label ?? b.id}`, unlocks: 'the force it exerts, which is what makes it part of the system' });
    }
    // A POSITION AND A VELOCITY ARE NOT OPTIONAL, and this is the check that made
    // the difference between constructing the requested system and substituting a
    // nearby one. A body with no initial state cannot be integrated, and picking
    // a number for it would be inventing the answer.
    if (num(b.x) === null && typeof b.x !== 'string') {
      missing.push({ what: `a starting position for ${b.label ?? b.id}`, unlocks: 'a numerical run; the structure can stay symbolic until then' });
    }
    if (num(b.vx) === null && typeof b.vx !== 'string' && num(b.vy) === null && typeof b.vy !== 'string') {
      missing.push({ what: `a starting velocity for ${b.label ?? b.id}`, unlocks: 'a numerical run: without it the body simply falls straight in' });
    }
  });
  if (missing.length) return { ok: false, missing };

  const units = decl.units === 'si' ? 'si' : 'astronomical';
  const G = asExpr(decl.G ?? (units === 'si' ? G_SI : G_ASTRO));
  // Softening, as a fraction of the system's own extent unless the declaration
  // says otherwise: a hard-coded length in AU is wrong in metres and vice versa.
  const extent = Math.max(
    1e-9,
    ...bodies.map((b: GravityBodyDecl) => Math.hypot(num(b.x) ?? 0, num(b.y) ?? 0))
  );
  const eps = asExpr(decl.softening ?? extent * 1e-3);

  const X = (i: number) => `x${i}`;
  const Y = (i: number) => `y${i}`;
  const VX = (i: number) => `vx${i}`;
  const VY = (i: number) => `vy${i}`;

  const states: SystemDecl['states'] = [];
  const rhs: Record<string, string> = {};

  bodies.forEach((b: GravityBodyDecl, i: number) => {
    const name = b.label ?? b.id;
    states.push(
      { name: X(i), init: b.x ?? 0, units: units === 'si' ? 'm' : 'AU', means: `${name}: position across` },
      { name: Y(i), init: b.y ?? 0, units: units === 'si' ? 'm' : 'AU', means: `${name}: position up` },
      { name: VX(i), init: b.vx ?? 0, units: units === 'si' ? 'm/s' : 'AU/yr', means: `${name}: velocity across` },
      { name: VY(i), init: b.vy ?? 0, units: units === 'si' ? 'm/s' : 'AU/yr', means: `${name}: velocity up` }
    );
    rhs[X(i)] = VX(i);
    rhs[Y(i)] = VY(i);
  });

  // The pairwise sum, written once per body per axis. Newton's law, and nothing
  // else: no drag, no radiation, no relativity — every one of which the science
  // block lists as absent rather than leaving to be discovered.
  bodies.forEach((b: GravityBodyDecl, i: number) => {
    const ax: string[] = [];
    const ay: string[] = [];
    bodies.forEach((other: GravityBodyDecl, j: number) => {
      if (i === j) return;
      const m = asExpr(other.mass, '0');
      const dx = `(${X(j)}-${X(i)})`;
      const dy = `(${Y(j)}-${Y(i)})`;
      const r3 = `((${dx}^2+${dy}^2+${eps}^2)^1.5)`;
      ax.push(`${m}*${dx}/${r3}`);
      ay.push(`${m}*${dy}/${r3}`);
    });
    rhs[VX(i)] = `${G}*(${ax.join('+')})`;
    rhs[VY(i)] = `${G}*(${ay.join('+')})`;
  });

  // ── the diagnostics that say whether to believe the run ───────────
  //
  // Energy and momentum are conserved by the equations and only approximately by
  // the integration, so their drift is the integrator marking its own work. This
  // is the same idea the gravity surface already showed for its presets,
  // generalised: any system this assembler builds gets it.
  const kinetic = bodies.map((b: GravityBodyDecl, i: number) => `0.5*${asExpr(b.mass, '0')}*(${VX(i)}^2+${VY(i)}^2)`);
  const potential: string[] = [];
  bodies.forEach((b: GravityBodyDecl, i: number) => {
    bodies.forEach((other: GravityBodyDecl, j: number) => {
      if (j <= i) return;
      const dx = `(${X(j)}-${X(i)})`;
      const dy = `(${Y(j)}-${Y(i)})`;
      potential.push(
        `${asExpr(b.mass, '0')}*${asExpr(other.mass, '0')}/((${dx}^2+${dy}^2+${eps}^2)^0.5)`
      );
    });
  });
  const energy = `${kinetic.join('+')}${potential.length ? `-${G}*(${potential.join('+')})` : ''}`;
  const px = bodies.map((b: GravityBodyDecl, i: number) => `${asExpr(b.mass, '0')}*${VX(i)}`).join('+');
  const py = bodies.map((b: GravityBodyDecl, i: number) => `${asExpr(b.mass, '0')}*${VY(i)}`).join('+');

  const observe: Record<string, string> = {
    energy,
    momentum: `((${px})^2+(${py})^2)^0.5`,
  };
  // The separation of the first two bodies, because "how far apart are they?" is
  // the question a two-body system is usually about and a plot of it is the
  // second view somebody asks for.
  if (bodies.length >= 2) {
    observe.separation = `((${X(1)}-${X(0)})^2+(${Y(1)}-${Y(0)})^2)^0.5`;
  }

  const layout: GravityLayout = {
    bodies: bodies.map((b: GravityBodyDecl, i: number) => ({
      id: b.id,
      label: b.label ?? b.id,
      states: { x: X(i), y: Y(i), vx: VX(i), vy: VY(i) },
      mass: asExpr(b.mass, '0'),
      at: { x: num(b.x) ?? 0, y: num(b.y) ?? 0 },
    })),
    units,
    span: extent * 1.25,
  };

  return {
    ok: true,
    system: {
      states,
      rhs,
      observe,
      // Energy is conserved by these equations, so its drift is the integration's
      // error and nothing else. Declared, so the readout appears without anybody
      // asking for it.
      invariant: 'energy',
      dt: decl.dt ?? (units === 'si' ? 3600 * 6 : 0.005),
      steps: decl.steps ?? 4000,
      method: 'rk4',
    },
    layout,
  };
}

/** Read a gravitational system off an object, checking it against the model that will evaluate it. */
export function readGravity(
  model: Model,
  o: ModelObject
): { ok: true; system: SystemDecl; layout: GravityLayout } | { ok: false; missing: Missing[] } {
  if (!o.gravity) {
    return { ok: false, missing: [{ what: 'a gravitational system: bodies with masses, positions and velocities', unlocks: 'assembly into equations of motion' }] };
  }
  // A value the model cannot evaluate is missing, said as what it IS — the same
  // rule as readMechanism, and for the same reason: "a readable expression for
  // dvx3/dt" is true and useless where "a mass for Jupiter" is neither.
  const known = [...model.params.map((p) => p.id), 't'];
  const missing: Missing[] = [];
  const check = (v: number | string | undefined, what: string) => {
    if (v === undefined || typeof v === 'number') return;
    if (!compileExpr(v, known)) {
      missing.push({
        what: `${what} — “${v}” is neither a number nor one of this model's controls`,
        unlocks: 'a numerical run; it can stay symbolic until then',
      });
    }
  };
  for (const b of o.gravity.bodies ?? []) {
    const name = b.label ?? b.id;
    check(b.mass, `a mass for ${name}`);
    check(b.x, `a position for ${name}`);
    check(b.y, `a position for ${name}`);
    check(b.vx, `a velocity for ${name}`);
    check(b.vy, `a velocity for ${name}`);
  }
  if (missing.length) return { ok: false, missing };
  return assembleGravity(o.gravity);
}

/**
 * Expand a gravitational system into first-class objects — one per body.
 *
 * The same move the mechanism grammar makes, and for the same reason: a planet
 * has to be a thing the person can select, ask about, change and DELETE, and that
 * is only true if it is a model object rather than a shape in a drawing. Every
 * downstream capability then arrives for free — the inspector, the dependency
 * walk, Trace, the edit verbs.
 */
export function expandGravity(model: Model): Model {
  const carriers = model.objects.filter((o) => !!o.gravity);
  if (!carriers.length) return model;

  const have = new Set(model.objects.map((o) => o.id));
  const added: ModelObject[] = [];
  const patched = new Map<string, ModelObject>();

  for (const carrier of carriers) {
    const built = assembleGravity(carrier.gravity!);
    if (!built.ok) continue;
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
        meaning:
          `a body of mass ${b.mass}, pulled by every other body in ${carrier.label} and pulling on each of them; ` +
          `its position and velocity are four states of the integrated system`,
        units: built.layout.units === 'si' ? 'm' : 'AU',
        depends: paramsIn(b.mass),
        relations: [
          { to: carrier.id, as: 'contains', why: 'it is one of the bodies this system is assembled from' },
          ...built.layout.bodies
            .filter((other) => other.id !== b.id)
            .slice(0, 6)
            .map((other) => ({
              to: `${carrier.id}__${other.id}`,
              as: 'influences' as const,
              why: 'they attract one another, and each appears in the other’s acceleration',
            })),
        ],
        meta: {
          gravity: carrier.id,
          part: b.id,
          sx: b.states.x,
          sy: b.states.y,
          svx: b.states.vx,
          svy: b.states.vy,
          mass: b.mass,
        },
      });
    }
  }

  if (!added.length && !patched.size) return model;
  return { ...model, objects: [...model.objects.map((o) => patched.get(o.id) ?? o), ...added] };
}

/** The equations, for a reader who wants to check what was assembled. */
export function gravityEquations(decl: GravityDecl): string[] {
  const built = assembleGravity(decl);
  if (!built.ok) return [];
  const n = built.layout.bodies.length;
  return [
    'dxᵢ/dt = vᵢ',
    'dvᵢ/dt = G Σ_{j≠i} mⱼ (rⱼ − rᵢ) / (|rⱼ − rᵢ|² + ε²)^{3/2}',
    `${n} bodies, ${4 * n} states, in ${built.layout.units === 'si' ? 'SI units' : 'AU, solar masses and years (G = 4π²)'}`,
  ];
}
