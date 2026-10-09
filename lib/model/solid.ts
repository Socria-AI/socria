// lib/model/solid.ts
//
// A SOLID: A BODY IN SPACE, SIZED BY THE MODEL'S OWN QUANTITIES.
//
// "Model a 2 × 2 × 2 metre cube." "A nose cone 20 cm across and 40 cm tall,
// with sliders for the diameter and the height, and its base area, surface
// area and volume." Before this file, neither had anywhere to land: the engine
// drew z = f(x, y) sheets and parametric surfaces, Live 3D drew fixed shapes
// with no parameters, and a cone proposed as `kind: "cone"` became an
// annotation — "nothing in that is written down as a relationship I can hold".
//
// THE DESIGN, IN ONE PARAGRAPH. A solid is an object of kind `solid` whose
// `solid` block names the shape and whose `defs` hold its dimensions in the
// shape's own names (`r`, `h`, `w`, …). A dimension is an EXPRESSION, so it can
// be a number (`0.4`), a control (`h`) or a formula over controls (`d/2`) —
// which is what makes a slider move the body. Its measures (volume, surface
// area, base and lateral area, slant height) are written out by the engine as
// quantities whose definitions are the textbook formulas in those same
// expressions (`expandSolids`), and evaluated with every other formula
// (formula.ts) — never typed in by whoever proposed the shape, so a slider move
// recomputes them and nothing can claim a volume the dimensions do not give.
//
// ONE SOURCE OF TRUTH, SEVERAL VIEWS. The model panel draws the body as edges
// with labelled dimension lines (`solidPrimitives`); Live 3D draws the same
// body shaded (`sceneOfModel`), DERIVED from the model each time it is read
// rather than copied into a scene of its own — so the two can never disagree,
// and the model's parameters are the only thing either one moves.
//
// THE CATALOGUE is Live 3D's (lib/objects/scene.ts DIMS), in the same names,
// plus the frustum — so anything built here can be opened there.
//
// PURE.

import { compileExpr } from '@/lib/logos-math';
import type { MaterialKind, SceneNode, SceneShape, SceneState } from '@/lib/objects/scene';
import { namesIn } from './deps';
import type { P3, Primitive } from './primitives';
import { SOLID_SHAPES, type Model, type ModelObject, type SolidShape } from './schema';
import { bindings, known, symbolTable } from './symbols';

// ── the shapes' dimensions ──────────────────────────────────────────

export interface SolidDim {
  key: string;
  label: string;
  /** a count (the sides of a prism), not a length */
  count?: boolean;
}

export const SOLID_DIMS: Record<SolidShape, SolidDim[]> = {
  box: [{ key: 'w', label: 'width' }, { key: 'd', label: 'depth' }, { key: 'h', label: 'height' }],
  cylinder: [{ key: 'r', label: 'radius' }, { key: 'h', label: 'height' }],
  cone: [{ key: 'r', label: 'base radius' }, { key: 'h', label: 'height' }],
  frustum: [{ key: 'r1', label: 'bottom radius' }, { key: 'r2', label: 'top radius' }, { key: 'h', label: 'height' }],
  sphere: [{ key: 'r', label: 'radius' }],
  torus: [{ key: 'R', label: 'ring radius' }, { key: 'r', label: 'tube radius' }],
  capsule: [{ key: 'r', label: 'radius' }, { key: 'h', label: 'overall height' }],
  prism: [{ key: 'n', label: 'sides', count: true }, { key: 'r', label: 'circumradius' }, { key: 'h', label: 'height' }],
  ring: [{ key: 'R', label: 'outer radius' }, { key: 'r', label: 'inner radius' }, { key: 'h', label: 'thickness' }],
};

const ROUND: readonly SolidShape[] = ['cylinder', 'cone', 'sphere', 'capsule'];

/**
 * The other names a dimension goes by, and how each becomes the shape's own.
 *
 * Geometry's vocabulary, applied by shape: a round thing's `d` (or
 * `diameter`) is twice its radius, a cube's `s` (or `side`, `edge`, `a`) is all
 * three of a box's sides, a box's `l`/`length` is its width. A box's own `d` is
 * its DEPTH — which is why this is per shape rather than one table.
 */
function aliased(shape: SolidShape, defs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.keys(defs).find((x) => x === k) ?? Object.keys(defs).find((x) => x.toLowerCase() === k.toLowerCase());
      if (hit && defs[hit] !== undefined && defs[hit] !== '') return defs[hit];
    }
    return undefined;
  };
  const half = (e: string) => `(${e})/2`;
  switch (shape) {
    case 'box': {
      const side = get('s', 'side', 'edge', 'a', 'size');
      const w = defs.w ?? get('width', 'l', 'length') ?? side;
      const d = defs.d ?? get('depth', 'breadth') ?? side;
      const h = defs.h ?? get('height', 'tall') ?? side;
      if (w) out.w = w;
      if (d) out.d = d;
      if (h) out.h = h;
      break;
    }
    case 'cylinder':
    case 'cone':
    case 'capsule': {
      const r = defs.r ?? get('radius', 'rb', 'baseradius');
      const dia = get('d', 'diameter', 'dia', 'basediameter', 'db');
      if (r) out.r = r;
      else if (dia) out.r = half(dia);
      const h = defs.h ?? get('height', 'length', 'l', 'tall');
      if (h) out.h = h;
      break;
    }
    case 'sphere': {
      const r = defs.r ?? get('radius');
      const dia = get('d', 'diameter', 'dia');
      if (r) out.r = r;
      else if (dia) out.r = half(dia);
      break;
    }
    case 'frustum': {
      const r1 = defs.r1 ?? get('rb', 'bottomradius', 'radius1');
      const r2 = defs.r2 ?? get('rt', 'topradius', 'radius2');
      const d1 = get('d1', 'bottomdiameter');
      const d2 = get('d2', 'topdiameter');
      if (r1) out.r1 = r1;
      else if (d1) out.r1 = half(d1);
      if (r2) out.r2 = r2;
      else if (d2) out.r2 = half(d2);
      const h = defs.h ?? get('height', 'tall');
      if (h) out.h = h;
      break;
    }
    case 'torus': {
      // Live 3D's names: R the ring (centre of the tube), r the tube
      const R = defs.R ?? get('ringradius', 'major', 'rmajor');
      const r = defs.r ?? get('tuberadius', 'minor', 'rminor');
      if (R) out.R = R;
      if (r) out.r = r;
      break;
    }
    case 'prism': {
      const n = defs.n ?? get('sides');
      const r = defs.r ?? get('radius', 'circumradius');
      const h = defs.h ?? get('height', 'length');
      if (n) out.n = n;
      if (r) out.r = r;
      if (h) out.h = h;
      break;
    }
    case 'ring': {
      const R = defs.R ?? get('outerradius', 'ro');
      const r = defs.r ?? get('innerradius', 'ri');
      const od = get('od', 'outerdiameter', 'D');
      const id = get('id', 'innerdiameter');
      if (R) out.R = R;
      else if (od) out.R = half(od);
      if (r) out.r = r;
      else if (id) out.r = half(id);
      const h = defs.h ?? get('height', 'thickness', 't', 'length');
      if (h) out.h = h;
      break;
    }
  }
  // position, if any — the centre of the body's base
  for (const k of ['x', 'y', 'z']) if (defs[k]) out[k] = defs[k];
  return out;
}

/** The dimension expressions this solid declares, in the shape's own names. */
export function dimExprs(o: ModelObject): Record<string, string> | null {
  if (o.kind !== 'solid' || !o.solid) return null;
  return aliased(o.solid.shape, o.defs ?? {});
}

/** A dimension the shape needs and the solid does not give. */
export function missingDims(o: ModelObject): SolidDim[] {
  const e = dimExprs(o);
  if (!e || !o.solid) return [];
  return SOLID_DIMS[o.solid.shape].filter((d) => !e[d.key]);
}

// ── evaluating ──────────────────────────────────────────────────────

/** The scope solids are evaluated in: every bound quantity, plus the clock. */
export function solidScope(model: Model): Record<string, number> {
  const scope = bindings(symbolTable(model));
  if (model.time) scope.t = model.time.t;
  return scope;
}

/** Each dimension's value, or null where it does not evaluate to a number. */
export function dimValues(model: Model, o: ModelObject, scope = solidScope(model)): Record<string, number | null> {
  const e = dimExprs(o) ?? {};
  const legal = [...known(symbolTable(model)), 't'];
  const out: Record<string, number | null> = {};
  for (const [k, raw] of Object.entries(e)) {
    const c = compileExpr(raw, legal);
    const v = c ? c.eval(scope) : NaN;
    out[k] = Number.isFinite(v) ? v : null;
  }
  return out;
}

/**
 * Why these dimensions do not make a body, in the person's terms — or null
 * when they do. The geometry's own conditions, said: a ring whose hole is
 * wider than it is, a prism with two sides, a capsule shorter than its caps.
 */
export function shapeTrouble(shape: SolidShape, v: Record<string, number | null>): string | null {
  const need = SOLID_DIMS[shape];
  for (const d of need) {
    const x = v[d.key];
    if (x === null || x === undefined) return null; // missing values are the router's to name
    if (d.count) {
      if (!Number.isInteger(Math.round(x)) || Math.round(x) < 3) return `a prism needs at least three sides (n is ${x})`;
      continue;
    }
    if (shape === 'frustum' && (d.key === 'r1' || d.key === 'r2')) {
      if (x < 0) return `the ${d.label} cannot be negative (it is ${x})`;
      continue;
    }
    if (!(x > 0)) return `the ${d.label} must be greater than zero (it is ${x})`;
  }
  if (shape === 'frustum' && !((v.r1 ?? 0) > 0 || (v.r2 ?? 0) > 0)) return 'a frustum needs one of its two radii to be greater than zero';
  if (shape === 'ring' && (v.r ?? 0) >= (v.R ?? 0)) return `the inner radius (${v.r}) must be smaller than the outer radius (${v.R})`;
  if (shape === 'torus' && (v.r ?? 0) > (v.R ?? 0)) return null; // a self-overlapping torus is drawable; its measures say so
  if (shape === 'capsule' && (v.h ?? 0) < 2 * (v.r ?? 0)) return `a capsule's overall height (${v.h}) cannot be less than its diameter (${2 * (v.r ?? 0)})`;
  return null;
}

// ── units ───────────────────────────────────────────────────────────

const LENGTH_UNIT: Record<string, string> = {
  m: 'm', meter: 'm', metre: 'm', meters: 'm', metres: 'm',
  cm: 'cm', centimeter: 'cm', centimetre: 'cm', centimeters: 'cm', centimetres: 'cm',
  mm: 'mm', millimeter: 'mm', millimetre: 'mm', millimeters: 'mm', millimetres: 'mm',
  km: 'km', kilometer: 'km', kilometre: 'km', kilometers: 'km', kilometres: 'km',
  in: 'in', inch: 'in', inches: 'in',
  ft: 'ft', foot: 'ft', feet: 'ft',
  yd: 'yd', yard: 'yd', yards: 'yd',
};
/** metres per unit, for drawing a body in Live 3D at its true size */
export const METRES_PER: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144 };

export function lengthUnit(u: string | undefined | null): string | null {
  if (!u) return null;
  return LENGTH_UNIT[u.trim().toLowerCase()] ?? null;
}

/**
 * The length unit a solid is measured in: its own, else that of the controls
 * its dimensions name. Null when nothing says — then nothing is printed after
 * a number, which is honest, rather than a unit the engine guessed.
 */
export function unitOfSolid(model: Model, o: ModelObject): string | null {
  const own = lengthUnit(o.units);
  if (own) return own;
  for (const e of Object.values(dimExprs(o) ?? {})) {
    for (const n of namesIn(e)) {
      const p = model.params.find((q) => q.id.toLowerCase() === n);
      const u = lengthUnit(p?.units);
      if (u) return u;
    }
  }
  return null;
}

// ── the measures, as formulas ───────────────────────────────────────

export interface SolidMeasure {
  key: string;
  label: string;
  /** what it measures, for its units: length, area or volume */
  dim: 1 | 2 | 3;
  /** the formula, in the shape's dimension expressions */
  formula: (e: Record<string, string>) => string;
}

const p = (x: string) => `(${x})`;

export const SOLID_MEASURES: Record<SolidShape, SolidMeasure[]> = {
  box: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `${p(e.w)}*${p(e.d)}*${p(e.h)}` },
    { key: 'surface_area', label: 'surface area', dim: 2, formula: (e) => `2*(${p(e.w)}*${p(e.d)}+${p(e.w)}*${p(e.h)}+${p(e.d)}*${p(e.h)})` },
  ],
  cylinder: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `pi*${p(e.r)}^2*${p(e.h)}` },
    { key: 'surface_area', label: 'surface area', dim: 2, formula: (e) => `2*pi*${p(e.r)}*(${p(e.r)}+${p(e.h)})` },
    { key: 'base_area', label: 'base area', dim: 2, formula: (e) => `pi*${p(e.r)}^2` },
    { key: 'lateral_area', label: 'lateral area', dim: 2, formula: (e) => `2*pi*${p(e.r)}*${p(e.h)}` },
  ],
  cone: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `pi*${p(e.r)}^2*${p(e.h)}/3` },
    { key: 'surface_area', label: 'surface area', dim: 2, formula: (e) => `pi*${p(e.r)}*(${p(e.r)}+sqrt(${p(e.r)}^2+${p(e.h)}^2))` },
    { key: 'base_area', label: 'base area', dim: 2, formula: (e) => `pi*${p(e.r)}^2` },
    { key: 'lateral_area', label: 'lateral area', dim: 2, formula: (e) => `pi*${p(e.r)}*sqrt(${p(e.r)}^2+${p(e.h)}^2)` },
    { key: 'slant_height', label: 'slant height', dim: 1, formula: (e) => `sqrt(${p(e.r)}^2+${p(e.h)}^2)` },
  ],
  frustum: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `pi*${p(e.h)}*(${p(e.r1)}^2+${p(e.r1)}*${p(e.r2)}+${p(e.r2)}^2)/3` },
    {
      key: 'surface_area', label: 'surface area', dim: 2,
      formula: (e) => `pi*(${p(e.r1)}+${p(e.r2)})*sqrt((${p(e.r1)}-${p(e.r2)})^2+${p(e.h)}^2)+pi*${p(e.r1)}^2+pi*${p(e.r2)}^2`,
    },
    { key: 'base_area', label: 'base area', dim: 2, formula: (e) => `pi*${p(e.r1)}^2` },
    { key: 'top_area', label: 'top area', dim: 2, formula: (e) => `pi*${p(e.r2)}^2` },
    { key: 'lateral_area', label: 'lateral area', dim: 2, formula: (e) => `pi*(${p(e.r1)}+${p(e.r2)})*sqrt((${p(e.r1)}-${p(e.r2)})^2+${p(e.h)}^2)` },
    { key: 'slant_height', label: 'slant height', dim: 1, formula: (e) => `sqrt((${p(e.r1)}-${p(e.r2)})^2+${p(e.h)}^2)` },
  ],
  sphere: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `4/3*pi*${p(e.r)}^3` },
    { key: 'surface_area', label: 'surface area', dim: 2, formula: (e) => `4*pi*${p(e.r)}^2` },
  ],
  torus: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `2*pi^2*${p(e.R)}*${p(e.r)}^2` },
    { key: 'surface_area', label: 'surface area', dim: 2, formula: (e) => `4*pi^2*${p(e.R)}*${p(e.r)}` },
  ],
  capsule: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `pi*${p(e.r)}^2*(${p(e.h)}-2*${p(e.r)})+4/3*pi*${p(e.r)}^3` },
    { key: 'surface_area', label: 'surface area', dim: 2, formula: (e) => `2*pi*${p(e.r)}*(${p(e.h)}-2*${p(e.r)})+4*pi*${p(e.r)}^2` },
  ],
  prism: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `${p(e.n)}/2*${p(e.r)}^2*sin(2*pi/${p(e.n)})*${p(e.h)}` },
    {
      key: 'surface_area', label: 'surface area', dim: 2,
      formula: (e) => `${p(e.n)}*${p(e.r)}^2*sin(2*pi/${p(e.n)})+${p(e.n)}*2*${p(e.r)}*sin(pi/${p(e.n)})*${p(e.h)}`,
    },
    { key: 'base_area', label: 'base area', dim: 2, formula: (e) => `${p(e.n)}/2*${p(e.r)}^2*sin(2*pi/${p(e.n)})` },
    { key: 'lateral_area', label: 'lateral area', dim: 2, formula: (e) => `${p(e.n)}*2*${p(e.r)}*sin(pi/${p(e.n)})*${p(e.h)}` },
  ],
  ring: [
    { key: 'volume', label: 'volume', dim: 3, formula: (e) => `pi*(${p(e.R)}^2-${p(e.r)}^2)*${p(e.h)}` },
    { key: 'surface_area', label: 'surface area', dim: 2, formula: (e) => `2*pi*(${p(e.R)}^2-${p(e.r)}^2)+2*pi*(${p(e.R)}+${p(e.r)})*${p(e.h)}` },
    { key: 'base_area', label: 'face area', dim: 2, formula: (e) => `pi*(${p(e.R)}^2-${p(e.r)}^2)` },
  ],
};

const unitPow = (u: string | null, dim: 1 | 2 | 3) => (!u ? undefined : dim === 1 ? u : `${u}^${dim}`);

/** The generic word a person would use for a measure, for spotting one they already wrote. */
const plain = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/**
 * THE MEASURES, WRITTEN OUT AS QUANTITIES.
 *
 * Each solid gets its volume and surface area — and, for the shapes that have
 * them, base, top and lateral areas and the slant height — as `scalar`
 * objects whose definitions are the textbook formulas in the solid's own
 * dimension expressions. They are then evaluated with every other formula
 * (formula.ts), so they bind, chain, show in the Inspector and recompute on
 * every slider move through the channels a fit or a solve already uses.
 *
 * REPLACED, NOT SKIPPED, on every pass, like every derived expander: a model
 * is unpacked on every build, and a measure of the dimensions as they were is
 * not a measure.
 *
 * A MEASURE THE PROPOSAL ALREADY NAMED — "volume", "the cone's surface area" —
 * is not duplicated, and it is not trusted either. With one solid in the
 * model, a proposed quantity whose name contains the measure's name is taken
 * over: it keeps its id and its label, so every other formula that names it
 * ("mass = density·volume") still finds it, and its definition becomes the
 * closed form for the shape — so a volume can never be a formula somebody
 * proposed and the dimensions do not give. The one exception is a formula the
 * PERSON wrote (provenance `user`): theirs stands, and the engine adds nothing
 * beside it.
 *
 * STABLE ACROSS PASSES: a measure already written for this solid is found by
 * what it measures (`meta.of`, `meta.measure`) and keeps its id, whichever id
 * that is.
 */
export function expandSolids(model: Model): Model {
  const solids = model.objects.filter((o) => o.kind === 'solid' && o.solid);
  if (!solids.length) return model;
  const engine = (o: ModelObject) => o.meta?.role === 'measure';
  const written = model.objects.filter((o) => !engine(o) && o.kind === 'scalar' && !!o.definition);
  const named = (o: ModelObject, m: SolidMeasure) => (` ${plain(o.label)} `).includes(` ${plain(m.label)} `);
  const made = new Map<string, ModelObject>();
  const taken = new Set<string>();
  for (const s of solids) {
    const e = dimExprs(s)!;
    if (missingDims(s).length) continue;
    const unit = unitOfSolid(model, s);
    const shape = s.solid!.shape;
    for (const m of SOLID_MEASURES[shape]) {
      const before = model.objects.find((o) => engine(o) && o.meta?.of === s.id && o.meta?.measure === m.key);
      const proposed = !before && solids.length === 1 ? written.find((o) => !taken.has(o.id) && named(o, m)) : undefined;
      // the person's own formula is theirs: it stands, and nothing is added beside it
      if (proposed?.provenance?.origin === 'user') continue;
      const id = before?.id ?? proposed?.id ?? `${s.id}__${m.key}`.slice(0, 48);
      taken.add(id);
      const units = unitPow(unit, m.dim) ?? proposed?.units;
      made.set(id, {
        id,
        kind: 'scalar',
        label: proposed?.label ?? before?.label ?? `${s.label} ${m.label}`,
        ...(units ? { units } : {}),
        meaning: `the ${m.label} of ${s.label}, computed from its dimensions by the formula for a ${shape}`,
        definition: m.formula(e),
        relations: [{ to: s.id, as: 'derived-from', why: `the ${m.label} of this ${shape}` }],
        provenance: {
          origin: 'computation',
          detail: proposed || before?.meta?.adopted
            ? `the ${m.label} of a ${shape}, from its dimensions — the closed form, in place of the formula proposed for it`
            : `the ${m.label} of a ${shape}, from its dimensions`,
        },
        fidelity: 'model-derived',
        meta: { of: s.id, role: 'measure', measure: m.key, ...(proposed || before?.meta?.adopted ? { adopted: true } : {}) },
      });
    }
  }
  // Stale measures of a solid that changed shape or lost a dimension go, too —
  // except one taken over from the proposal, which other formulas may name: it
  // stays, and says why it has no value until the solid is whole again.
  const kept = model.objects.filter((o) => !engine(o) || made.has(o.id) || !!o.meta?.adopted).map((o) => made.get(o.id) ?? o);
  const fresh = [...made.values()].filter((o) => !model.objects.some((x) => x.id === o.id));
  if (!fresh.length && kept.length === model.objects.length && kept.every((o, i) => o === model.objects[i])) return model;
  return { ...model, objects: [...kept, ...fresh] };
}

// ── drawing it ──────────────────────────────────────────────────────

const pt = (x: number, y: number, z: number): P3 => ({ x, y, z });

/** A closed ring of radius r at height z about (cx, cy), as n+1 points. */
function circle(cx: number, cy: number, z: number, r: number, n: number, phase = 0): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = phase + (2 * Math.PI * i) / n;
    out.push(pt(cx + r * Math.cos(a), cy + r * Math.sin(a), z));
  }
  return out;
}

/** A body of revolution about the z axis: rings at each (z, r) of the profile, joined by generators. */
function revolved(of: string, profile: [number, number][], cx: number, cy: number, z0: number, seg: number): Primitive {
  return { p: 'mesh', of, rows: profile.map(([z, r]) => circle(cx, cy, z0 + z, Math.max(0, r), seg)), tone: 'primary' };
}

/** A number for a label: a few significant figures, no trailing noise. */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a !== 0 && (a < 1e-3 || a >= 1e6) ? v.toExponential(3) : Number(v.toPrecision(4)).toString();
  return s;
}

/**
 * A DIMENSION LINE: dashed, offset from the body, with end ticks and a label
 * reading what the dimension IS — "h = 40 cm", "⌀ 20 cm" — computed from the
 * current parameters, so it moves when a slider does. The label is the
 * control's own name when the dimension is a control, so it reads like the
 * slider that drives it.
 */
function dimension(of: string, a: P3, b: P3, tick: P3, text: string): Primitive[] {
  const t = (q: P3, s: number): P3 => pt(q.x + tick.x * s, q.y + tick.y * s, q.z + tick.z * s);
  return [
    { p: 'polyline', of, at: [a, b], dashed: true, width: 1, tone: 'muted' },
    { p: 'polyline', of, at: [t(a, -1), t(a, 1)], width: 1, tone: 'muted' },
    { p: 'polyline', of, at: [t(b, -1), t(b, 1)], width: 1, tone: 'muted' },
    { p: 'label', of, at: pt((a.x + b.x) / 2 + tick.x * 1.6, (a.y + b.y) / 2 + tick.y * 1.6, (a.z + b.z) / 2 + tick.z * 1.6), text, anchor: 'middle', tone: 'muted' },
  ];
}

/** "h = 40 cm" when the dimension is a control, "h 40 cm" otherwise — what the line measures. */
function dimLabel(model: Model, expr: string | undefined, symbol: string, value: number, unit: string | null, diameter = false): string {
  const u = unit ? ` ${unit}` : '';
  const bare = (expr ?? '').trim();
  // a radius stated as half a control (`d/2`, `(d)/2`) is that control's diameter
  const halfOf = diameter ? bare.match(/^\(?\s*\(?\s*([a-z][a-z0-9_]*)\s*\)?\s*\/\s*2\s*\)?$/i) : null;
  const control = halfOf ? halfOf[1] : /^[a-z][a-z0-9_]*$/i.test(bare) ? bare : null;
  const param = control ? model.params.find((q) => q.id.toLowerCase() === control.toLowerCase()) : null;
  const shown = diameter ? 2 * value : value;
  if (param && (!diameter || halfOf)) return `${param.id} = ${fmt(shown)}${u}`;
  return `${diameter ? '⌀' : symbol} ${fmt(shown)}${u}`;
}

/**
 * The body as edges and labelled dimension lines, in model space with z up and
 * the base on z = 0 (moved by `defs.x/y/z` where given). Edges rather than a
 * dense wireframe, because a drawing of a part reads by its outline.
 */
export function solidPrimitives(model: Model, o: ModelObject, v: Record<string, number | null>): Primitive[] {
  if (!o.solid) return [];
  const shape = o.solid.shape;
  const n = (k: string) => v[k] ?? 0;
  const cx = n('x'), cy = n('y'), z0 = n('z');
  const unit = unitOfSolid(model, o);
  const e = dimExprs(o) ?? {};
  const of = o.id;
  const out: Primitive[] = [];
  const SEG = 32;

  switch (shape) {
    case 'box': {
      const w = n('w'), d = n('d'), h = n('h');
      const c = (sx: number, sy: number, z: number) => pt(cx + (sx * w) / 2, cy + (sy * d) / 2, z0 + z);
      const loop = (z: number) => [c(-1, -1, z), c(1, -1, z), c(1, 1, z), c(-1, 1, z), c(-1, -1, z)];
      out.push({ p: 'polyline', of, at: loop(0), width: 1.6, tone: 'primary' });
      out.push({ p: 'polyline', of, at: loop(h), width: 1.6, tone: 'primary' });
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push({ p: 'polyline', of, at: [c(sx, sy, 0), c(sx, sy, h)], width: 1.6, tone: 'primary' });
      const g = Math.max(w, d, h) * 0.12;
      out.push(...dimension(of, pt(cx - w / 2, cy - d / 2 - g, z0), pt(cx + w / 2, cy - d / 2 - g, z0), pt(0, -g * 0.25, 0), dimLabel(model, e.w, 'w', w, unit)));
      out.push(...dimension(of, pt(cx + w / 2 + g, cy - d / 2, z0), pt(cx + w / 2 + g, cy + d / 2, z0), pt(g * 0.25, 0, 0), dimLabel(model, e.d, 'd', d, unit)));
      out.push(...dimension(of, pt(cx - w / 2 - g, cy - d / 2, z0), pt(cx - w / 2 - g, cy - d / 2, z0 + h), pt(-g * 0.25, 0, 0), dimLabel(model, e.h, 'h', h, unit)));
      break;
    }
    case 'cylinder':
    case 'cone':
    case 'frustum': {
      const h = n('h');
      const r1 = shape === 'frustum' ? n('r1') : n('r');
      const r2 = shape === 'cylinder' ? n('r') : shape === 'cone' ? 0 : n('r2');
      out.push(revolved(of, [[0, r1], [h, r2]], cx, cy, z0, SEG));
      const R = Math.max(r1, r2);
      const g = Math.max(R, h) * 0.14;
      out.push(...dimension(of, pt(cx - R - g, cy, z0), pt(cx - R - g, cy, z0 + h), pt(-g * 0.25, 0, 0), dimLabel(model, e.h, 'h', h, unit)));
      out.push(...dimension(of, pt(cx - r1, cy - R - g, z0), pt(cx + r1, cy - R - g, z0), pt(0, -g * 0.25, 0), dimLabel(model, shape === 'frustum' ? e.r1 : e.r, '⌀', r1, unit, true)));
      if (shape === 'frustum' && r2 > 0) {
        out.push(...dimension(of, pt(cx - r2, cy - R - g, z0 + h), pt(cx + r2, cy - R - g, z0 + h), pt(0, -g * 0.25, 0), dimLabel(model, e.r2, '⌀', r2, unit, true)));
      }
      break;
    }
    case 'capsule': {
      const r = n('r'), h = n('h');
      const prof: [number, number][] = [];
      const k = 6;
      for (let i = 0; i <= k; i++) {
        const a = -Math.PI / 2 + (Math.PI / 2) * (i / k);
        prof.push([r + r * Math.sin(a), r * Math.cos(a)]);
      }
      for (let i = 0; i <= k; i++) {
        const a = (Math.PI / 2) * (i / k);
        prof.push([h - r + r * Math.sin(a), r * Math.cos(a)]);
      }
      out.push(revolved(of, prof, cx, cy, z0, 16));
      const g = Math.max(r, h) * 0.14;
      out.push(...dimension(of, pt(cx - r - g, cy, z0), pt(cx - r - g, cy, z0 + h), pt(-g * 0.25, 0, 0), dimLabel(model, e.h, 'h', h, unit)));
      out.push(...dimension(of, pt(cx - r, cy - r - g, z0 + h / 2), pt(cx + r, cy - r - g, z0 + h / 2), pt(0, -g * 0.25, 0), dimLabel(model, e.r, '⌀', r, unit, true)));
      break;
    }
    case 'sphere': {
      const r = n('r');
      const prof: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 12;
        prof.push([r + r * Math.sin(a), r * Math.cos(a)]);
      }
      out.push(revolved(of, prof, cx, cy, z0, 24));
      const g = r * 0.14;
      out.push(...dimension(of, pt(cx - r - g, cy, z0), pt(cx - r - g, cy, z0 + 2 * r), pt(-g * 0.25, 0, 0), dimLabel(model, e.r, '⌀', r, unit, true)));
      break;
    }
    case 'torus': {
      const R = n('R'), r = n('r');
      const U = 32, V = 12;
      const rows: (P3 | null)[][] = [];
      for (let j = 0; j <= V; j++) {
        const b = (2 * Math.PI * j) / V;
        const row: P3[] = [];
        for (let i = 0; i <= U; i++) {
          const a = (2 * Math.PI * i) / U;
          row.push(pt(cx + (R + r * Math.cos(b)) * Math.cos(a), cy + (R + r * Math.cos(b)) * Math.sin(a), z0 + r + r * Math.sin(b)));
        }
        rows.push(row);
      }
      out.push({ p: 'mesh', of, rows, tone: 'primary' });
      const g = (R + r) * 0.14;
      out.push(...dimension(of, pt(cx - R - r, cy - R - r - g, z0), pt(cx + R + r, cy - R - r - g, z0), pt(0, -g * 0.25, 0), `⌀ ${fmt(2 * (R + r))}${unit ? ` ${unit}` : ''}`));
      break;
    }
    case 'prism': {
      const sides = Math.max(3, Math.round(n('n'))), r = n('r'), h = n('h');
      out.push({ p: 'mesh', of, rows: [circle(cx, cy, z0, r, sides, Math.PI / 2), circle(cx, cy, z0 + h, r, sides, Math.PI / 2)], tone: 'primary' });
      const g = Math.max(r, h) * 0.14;
      out.push(...dimension(of, pt(cx - r - g, cy, z0), pt(cx - r - g, cy, z0 + h), pt(-g * 0.25, 0, 0), dimLabel(model, e.h, 'h', h, unit)));
      break;
    }
    case 'ring': {
      const R = n('R'), r = n('r'), h = n('h');
      out.push(revolved(of, [[0, R], [h, R]], cx, cy, z0, SEG));
      out.push(revolved(of, [[0, r], [h, r]], cx, cy, z0, SEG));
      const g = Math.max(R, h) * 0.14;
      out.push(...dimension(of, pt(cx - R, cy - R - g, z0), pt(cx + R, cy - R - g, z0), pt(0, -g * 0.25, 0), dimLabel(model, e.R, '⌀', R, unit, true)));
      out.push(...dimension(of, pt(cx - R - g, cy, z0), pt(cx - R - g, cy, z0 + h), pt(-g * 0.25, 0, 0), dimLabel(model, e.h, 'h', h, unit)));
      break;
    }
  }
  return out;
}

/** "a cone 20 cm across and 40 cm tall" — what the body is, from its current dimensions. */
export function solidSays(model: Model, o: ModelObject, v: Record<string, number | null>): string {
  if (!o.solid) return '';
  const u = unitOfSolid(model, o);
  const L = (x: number | null | undefined) => `${fmt(x ?? NaN)}${u ? ` ${u}` : ''}`;
  switch (o.solid.shape) {
    case 'box':
      return v.w === v.d && v.d === v.h ? `a cube ${L(v.w)} on a side` : `a box ${L(v.w)} wide, ${L(v.d)} deep and ${L(v.h)} tall`;
    case 'cylinder':
      return `a cylinder ${L(2 * (v.r ?? NaN))} across and ${L(v.h)} tall`;
    case 'cone':
      return `a cone ${L(2 * (v.r ?? NaN))} across the base and ${L(v.h)} tall`;
    case 'frustum':
      return `a frustum ${L(2 * (v.r1 ?? NaN))} across the base, ${L(2 * (v.r2 ?? NaN))} across the top and ${L(v.h)} tall`;
    case 'sphere':
      return `a sphere ${L(2 * (v.r ?? NaN))} across`;
    case 'torus':
      return `a torus with a ring radius of ${L(v.R)} and a tube radius of ${L(v.r)}`;
    case 'capsule':
      return `a capsule ${L(2 * (v.r ?? NaN))} across and ${L(v.h)} long`;
    case 'prism':
      return `a ${Math.round(v.n ?? 0)}-sided prism ${L(v.r)} to its corners and ${L(v.h)} tall`;
    case 'ring':
      return `a ring ${L(2 * (v.R ?? NaN))} across with a ${L(2 * (v.r ?? NaN))} hole, ${L(v.h)} thick`;
  }
}

// ── the same body in Live 3D ────────────────────────────────────────

const LIVE_SHAPE: Record<SolidShape, SceneShape> = {
  box: 'box', cylinder: 'cylinder', cone: 'cone', frustum: 'revolve', sphere: 'sphere',
  torus: 'torus', capsule: 'capsule', prism: 'prism', ring: 'ring',
};

const MATERIAL_LOOK: [RegExp, MaterialKind][] = [
  [/steel|iron|alumin|copper|brass|bronze|titan|metal|chrome|gold|silver/i, 'metal'],
  [/glass|acrylic|perspex/i, 'glass'],
  [/plastic|pla|abs|nylon|resin/i, 'plastic'],
];

/**
 * EVERY SOLID IN THE MODEL AS A LIVE 3D SCENE — derived, never stored.
 *
 * The scene is computed from the model's CURRENT parameters each time it is
 * asked for, so the Live 3D view of a model and the model panel cannot
 * disagree, and a slider moved in either place moves the body in both. Sizes
 * are converted to metres from the solid's unit (Live 3D works in metres and
 * shows them in a unit of its own); a model with no length unit is drawn as
 * though in metres. Model space is z-up with the base on z = 0; Live 3D is
 * y-up with each shape centred on its origin, so each part is lifted by half
 * its height to sit on the floor.
 */
export function sceneOfModel(model: Model): SceneState {
  const nodes: SceneNode[] = [];
  const scope = solidScope(model);
  let unit: string | null = null;
  for (const o of model.objects) {
    if (o.kind !== 'solid' || !o.solid) continue;
    const v = dimValues(model, o, scope);
    if (missingDims(o).length || shapeTrouble(o.solid.shape, v)) continue;
    const u = unitOfSolid(model, o);
    unit = unit ?? u;
    const k = METRES_PER[u ?? 'm'] ?? 1;
    const m = (key: string) => (v[key] ?? 0) * k;
    const shape = o.solid.shape;
    const dims: Record<string, number> = {};
    let exprs: Record<string, string> | undefined;
    let height = 0;
    switch (shape) {
      case 'box':
        dims.w = m('w'); dims.h = m('h'); dims.d = m('d'); height = dims.h;
        break;
      case 'cylinder': case 'cone': case 'capsule':
        dims.r = m('r'); dims.h = m('h'); height = dims.h;
        break;
      case 'sphere':
        dims.r = m('r'); height = 2 * dims.r;
        break;
      case 'torus':
        dims.R = m('R'); dims.r = m('r'); height = 2 * dims.r;
        break;
      case 'prism':
        dims.n = Math.max(3, Math.round(v.n ?? 3)); dims.r = m('r'); dims.h = m('h'); height = dims.h;
        break;
      case 'ring':
        dims.R = m('R'); dims.r = m('r'); dims.h = m('h'); height = dims.h;
        break;
      case 'frustum': {
        const h = m('h'), r1 = m('r1'), r2 = m('r2');
        dims.y0 = -h / 2; dims.y1 = h / 2; dims.n = 64; height = h;
        // r(y) along the axis, linear from the bottom radius to the top
        exprs = { r: `${r1} + (${r2} - ${r1}) * (y + ${h / 2}) / ${h}` };
        break;
      }
    }
    const mat = o.solid.material ?? '';
    const look = MATERIAL_LOOK.find(([re]) => re.test(mat))?.[1] ?? 'matte';
    nodes.push({
      id: o.id,
      name: o.label,
      shape: LIVE_SHAPE[shape],
      dims,
      ...(exprs ? { exprs } : {}),
      // model (x, y, z-up) → Live 3D (x, y-up, z): the base centre sits on the floor
      pos: [m('x'), m('z') + height / 2, -m('y')],
      rot: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#7f9a5a',
      mat: look,
      opacity: 1,
      on: 'ground',
      ...(mat ? { material: mat } : {}),
    });
  }
  const shown = (['m', 'cm', 'mm', 'in', 'ft'] as const).find((x) => x === unit) ?? 'm';
  return { nodes, next: nodes.length + 1, unit: shown };
}

/** Whether a model holds any solid at all — the fact the workspace opens Live 3D on. */
export function hasSolids(model: Model | null | undefined): boolean {
  return !!model?.objects.some((o) => o.kind === 'solid' && !!o.solid);
}

export { SOLID_SHAPES };
