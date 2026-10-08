// lib/science/flight.ts
//
// SIMPLIFIED FLIGHT MECHANICS, with every unit checked and every coefficient
// accounted for.
//
//   wing loading     W/S = m g / S                     (N/m²)
//   aspect ratio     AR  = b² / S                      (dimensionless — checked)
//   lift, drag       L = ½ ρ V² S C_L,  D = ½ ρ V² S C_D
//   Reynolds number  Re = ρ V c / μ                    (dimensionless — checked)
//   level speed      V = √(2 m g / (ρ S C_L))          the speed at which lift equals weight
//
// These are the textbook relationships, not a model of a bird: coefficients
// depend on Reynolds number, geometry, angle of attack, flapping and flow
// regime. So a coefficient is either MEASURED (with a source) or ASSUMED —
// and anything computed from an assumed one is labelled hypothetical. A
// gliding estimate says it is one; nothing here predicts flapping flight.
//
// Quantities carry their units as written ('cm', 'g', 'm^2'); every formula
// converts through lib/numeric/dimensional.ts and refuses a combination whose
// dimensions do not work out — a wingspan in cm against an area in cm² is
// fine, an "area" in m is not.
//
// PURE.

import { parseUnit, dimsText, type Dims } from '../numeric/dimensional';

export interface Quantity {
  value: number;
  unit: string;
}

export interface Coefficient {
  value: number;
  /** measured (and from where), or assumed (and why) — never silent */
  basis: 'measured' | 'assumed';
  source?: string;
  note?: string;
}

/** Standard gravity, m/s² (CGPM 1901). */
export const G0 = 9.80665;
/** ISA sea-level air density, kg/m³, and dynamic viscosity, Pa·s — defaults the result names when used. */
export const ISA_RHO = 1.225;
export const ISA_MU = 1.789e-5;

const add = (a: Dims, b: Dims, k = 1) => a.map((v, i) => v + k * b[i]) as Dims;
const zero: Dims = [0, 0, 0, 0, 0, 0, 0];
const same = (a: Dims, b: Dims) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

/** A quantity in SI with its dimensions, or an error naming the unit that could not be read. */
export function si(q: Quantity): { value: number; dims: Dims } {
  const u = parseUnit(q.unit);
  if (!u) throw new Error(`cannot read the unit "${q.unit}"`);
  if (!Number.isFinite(q.value)) throw new Error('the value must be a finite number');
  return { value: q.value * u.si, dims: u.dims };
}

function expect(q: Quantity, want: string, what: string): number {
  const v = si(q);
  const w = parseUnit(want)!;
  if (!same(v.dims, w.dims)) throw new Error(`${what} must have the dimensions of ${want} (${dimsText(w.dims)}); "${q.unit}" is ${dimsText(v.dims)}`);
  return v.value;
}

export function wingLoading(mass: Quantity, area: Quantity, g = G0) {
  const m = expect(mass, 'kg', 'mass');
  const S = expect(area, 'm^2', 'wing area');
  if (!(m > 0 && S > 0)) throw new Error('mass and wing area must be positive');
  return { newtonsPerM2: (m * g) / S, kgPerM2: m / S, assumptions: [`g = ${g} m/s²`] };
}

/** b²/S, with the dimensional check made explicit in the result. */
export function aspectRatio(span: Quantity, area: Quantity) {
  const b = si(span), S = si(area);
  const dims = add(add(zero, b.dims, 2), S.dims, -1);
  if (!same(dims, zero)) throw new Error(`span²/area is not dimensionless: it has dimensions ${dimsText(dims)}`);
  if (!(b.value > 0 && S.value > 0)) throw new Error('span and area must be positive');
  return { value: (b.value * b.value) / S.value, dims: dimsText(dims) };
}

export function reynolds(rho: Quantity, speed: Quantity, chord: Quantity, mu: Quantity) {
  const r = si(rho), v = si(speed), c = si(chord), m = si(mu);
  const dims = add(add(add(r.dims, v.dims), c.dims), m.dims, -1);
  if (!same(dims, zero)) throw new Error(`ρVc/μ is not dimensionless: ${dimsText(dims)}`);
  return { value: (r.value * v.value * c.value) / m.value };
}

function assumptionsOf(name: string, c: Coefficient): string {
  return c.basis === 'measured'
    ? `${name} = ${c.value} (measured${c.source ? ': ' + c.source : ''})`
    : `${name} = ${c.value} (ASSUMED${c.note ? ' — ' + c.note : ''}; hypothetical, not a measured value)`;
}

/** ½ ρ V² S C — lift or drag. */
export function aeroForce(rho: Quantity, speed: Quantity, area: Quantity, coefficient: Coefficient, name: 'C_L' | 'C_D' = 'C_L') {
  const r = expect(rho, 'kg/m^3', 'air density');
  const v = expect(speed, 'm/s', 'speed');
  const S = expect(area, 'm^2', 'wing area');
  return {
    newtons: 0.5 * r * v * v * S * coefficient.value,
    hypothetical: coefficient.basis !== 'measured',
    assumptions: [assumptionsOf(name, coefficient), 'steady, attached flow; no flapping'],
  };
}

/** The speed at which lift equals weight, for a gliding wing at a given C_L. */
export function levelSpeed(mass: Quantity, area: Quantity, rho: Quantity, cl: Coefficient, g = G0) {
  const m = expect(mass, 'kg', 'mass');
  const S = expect(area, 'm^2', 'wing area');
  const r = expect(rho, 'kg/m^3', 'air density');
  if (!(cl.value > 0)) throw new Error('C_L must be positive');
  return {
    metersPerSecond: Math.sqrt((2 * m * g) / (r * S * cl.value)),
    hypothetical: cl.basis !== 'measured',
    assumptions: [assumptionsOf('C_L', cl), `g = ${g} m/s²`, 'gliding: lift balances weight; thrust and flapping are not modelled'],
  };
}

/**
 * One geometric parameter varied, everything derived recomputed: span or area
 * across a range, with wing loading, aspect ratio and (given C_L) level speed
 * at each step.
 */
export function varyGeometry(
  base: { mass: Quantity; span: Quantity; area: Quantity; rho?: Quantity; cl?: Coefficient },
  vary: 'span' | 'area',
  values: readonly number[]
) {
  return values.map((v) => {
    const geom = { ...base, [vary]: { value: v, unit: base[vary].unit } };
    const wl = wingLoading(geom.mass, geom.area);
    const ar = aspectRatio(geom.span, geom.area);
    const speed = base.cl ? levelSpeed(geom.mass, geom.area, base.rho ?? { value: ISA_RHO, unit: 'kg/m^3' }, base.cl).metersPerSecond : null;
    return { [vary]: v, wingLoading: wl.newtonsPerM2, aspectRatio: ar.value, levelSpeed: speed } as Record<string, number | null>;
  });
}
