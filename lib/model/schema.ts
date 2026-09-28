// lib/model/schema.ts
//
// WHAT A THING IS, BEFORE IT IS A PICTURE.
//
// Logos could already draw: a plot renderer for expressions, working surfaces
// for a few simulated objects, a map of somebody's reasoning. Each of those
// knows its own contents, and none of them shares a way of SAYING what a
// contents is. So a second surface meant a second vocabulary, and the
// conversation had to learn each one separately.
//
// This is the vocabulary. A model is a set of objects with meanings, the
// relations between them, and — the part that makes it more than a diagram —
// where each value CAME FROM and how far it may be trusted. The renderer
// (components/model/ModelView.tsx) never reads any of it except the geometry;
// the conversation reads all of it; the two stay in step because both are
// views of this, not of each other.
//
// WHAT THIS FILE IS NOT. It is not a physics engine, a finance library or a
// geographic system. Nothing here knows what a black hole is. A domain is
// expressed by BUILDING one of these — see lib/model/library.ts, where every
// benchmark model is data handed to the same engine — and the day a domain
// needs a bespoke renderer is the day this design has failed.
//
// PURE. No React, no DOM, no clock. Everything here is a function of its
// arguments, which is what lets the suite drive the whole engine without a
// browser.

// ── how a thing came to be known ────────────────────────────────────

/**
 * Where a value came from. Answering "where did this number come from?" is a
 * product promise, and a promise needs a field rather than a convention.
 */
export type Origin =
  /** the person typed it, dragged it, or set it */
  | 'user'
  /** Socria proposed it and nothing has confirmed it */
  | 'inference'
  /** it follows from an equation in this model */
  | 'equation'
  /** a computation ran and produced it */
  | 'computation'
  /** a simulation was stepped and this is its state */
  | 'simulation'
  /** it came from supplied data */
  | 'dataset'
  /** a source outside this product, named */
  | 'source'
  /** nobody chose it; it is the engine's starting value */
  | 'default';

/**
 * HOW REAL IS THIS PICTURE. The distinction the whole system is accountable
 * to, and the one most easily lost: a drawing made to be legible and a
 * numerically integrated result must never read the same.
 *
 * A beautiful visualisation must never be allowed to masquerade as scientific
 * computation, so every object says which of these it is, the state the
 * conversation reads says it in words, and nothing in the engine can produce
 * an object without one.
 */
export type Fidelity =
  /** drawn to make an idea legible. It is a picture, not a result. */
  | 'conceptual'
  /** evaluated from stated mathematical relationships */
  | 'model-derived'
  /** produced by a real numerical method — an integrator, a solver */
  | 'numerically-computed'
  /** taken from supplied data, plotted or summarised */
  | 'data-derived'
  /** stepped forward by a simulation defined in this model */
  | 'simulated';

export const FIDELITY_SAYS: Record<Fidelity, string> = {
  conceptual: 'drawn to make the idea legible; it is not a computed result',
  'model-derived': 'evaluated from the relationships stated in this model',
  'numerically-computed': 'produced by a numerical method — its shape is a result',
  'data-derived': 'taken from the supplied data, not computed here',
  simulated: 'stepped forward by this model’s own simulation',
};

export const ORIGIN_SAYS: Record<Origin, string> = {
  user: 'you set it',
  inference: 'Socria proposed it and nothing has confirmed it',
  equation: 'it follows from an equation in this model',
  computation: 'a computation produced it',
  simulation: 'it is the state of a running simulation',
  dataset: 'it came from the data supplied',
  source: 'it came from a named outside source',
  default: 'nobody chose it; it is where this model opens',
};

// ── what a model can contain ────────────────────────────────────────

/**
 * The kinds of thing a model may hold.
 *
 * Deliberately long and deliberately flat. A short list would push domains
 * into the wrong boxes — a trajectory is not a curve, an assumption is not an
 * annotation — and a hierarchy would make every consumer walk it. Adding a
 * kind is one line here and one case in the renderer's mapping, and nothing
 * else in the engine has to know.
 */
export const OBJECT_KINDS = [
  // quantities
  'scalar', 'variable', 'parameter', 'constant', 'measurement', 'uncertainty',
  // discrete geometry
  'point', 'particle', 'node', 'vector', 'tensor',
  // extended geometry
  'line', 'ray', 'curve', 'trajectory', 'plane', 'surface', 'volume', 'region', 'boundary',
  // continua and structure
  'field', 'mesh', 'graph', 'distribution', 'dataset', 'series',
  // statements
  'equation', 'system', 'constraint', 'objective', 'assumption',
  'initial-condition', 'boundary-condition',
  // mechanism: the parts a dynamic diagram is assembled from. NOT a mechanics
  // feature — a body is any lumped thing with inertia, a spring any restoring
  // relation, a damper any dissipative one, and the same three assemble a
  // circuit, a compartment model or a flow network (see mechanism.ts).
  'body', 'spring', 'damper', 'force', 'joint', 'component',
  // estimation: what a fitted model is made of. A coefficient is a number that
  // CAME FROM data and must never look like one that was chosen.
  'estimator', 'coefficient', 'residual', 'fitted', 'specification',
  // apparatus
  'axis', 'grid', 'annotation', 'source',
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/**
 * How two objects stand to one another.
 *
 * These are the edges the dependency walk follows and the edges a structural
 * view draws, so the list is the product's whole vocabulary for "because".
 * `causes` and `correlates-with` are separate members on purpose: a model
 * that cannot tell them apart will eventually draw one as the other.
 */
export const RELATIONS = [
  'depends-on', 'causes', 'influences', 'constrains', 'intersects', 'contains',
  'bounded-by', 'derived-from', 'transforms-into', 'converges-to', 'approximates',
  'supports', 'contradicts', 'correlates-with', 'connected-to', 'evolves-into',
  'parameterizes', 'satisfies', 'violates',
] as const;
export type Relation = (typeof RELATIONS)[number];

/** Relations that carry a claim about mechanism, and so must not be inferred. */
export const CAUSAL_RELATIONS: readonly Relation[] = ['causes', 'influences'];

export interface Uncertainty {
  /** ± this, in the value's own units */
  plusMinus?: number;
  /** an interval, where it is not symmetric */
  range?: [number, number];
  /** what the interval means: '95% CI', 'one s.d.', 'range across the ensemble' */
  says?: string;
}

/** Where a value came from, said precisely enough to answer for it. */
export interface Provenance {
  origin: Origin;
  /** a citation, a dataset name, an equation id, a solver name */
  detail?: string;
  /** 0–1, and absent rather than invented when nobody measured it */
  confidence?: number;
}

/**
 * One thing in a model.
 *
 * MOST FIELDS ARE OPTIONAL, and that is the design. A scalar the person typed
 * is `{id, kind, label, value, provenance}` and nothing else; a surface with a
 * definition, a domain, units, dependencies and an uncertainty band uses most
 * of it. Requiring more would make the simple case ceremonial, which is how
 * schemas end up bypassed.
 */
export interface ModelObject {
  id: string;
  kind: ObjectKind;
  /** what the reader would call it */
  label: string;
  /** one sentence: what it IS. Never what it proves. */
  meaning?: string;
  /** the subject it belongs to, for a reader and for nothing else */
  domain?: string;
  /** the mathematics, as text: 'z = x² − y²', 'dx/dt = σ(y − x)' */
  definition?: string;
  /**
   * The parts of a definition that need more than one expression: the
   * components of a field (`fx`, `fy`, `fz`), a parametric surface (`px`,
   * `py`, `pz`), the right-hand sides of a system (`dx`, `dy`, `dz`).
   *
   * Strings, in the evaluator's own grammar (lib/logos-math.ts), because a
   * model has to survive being saved, sent to another person and written by a
   * conversation. A closure could not do any of those, and the moment a model
   * holds code rather than text it stops being a document.
   */
  defs?: Record<string, string>;
  /**
   * The extent each free name is taken over: `{ x: [-3, 3], u: [0, 6.2832] }`.
   * Absent names fall back to the model's own controls, and then to the box
   * the view is fitted to.
   */
  over?: Record<string, [number, number]>;
  /** the number, where the object is one */
  value?: number;
  /** what the number is in: 'm', 'K', 'USD', 'per year' */
  units?: string;
  /** control ids this object moves with */
  depends?: string[];
  /** how it stands to other objects */
  relations?: { to: string; as: Relation; why?: string }[];
  provenance?: Provenance;
  uncertainty?: Uncertainty;
  /** HOW REAL. Defaults to conceptual, which is the honest default. */
  fidelity?: Fidelity;
  /** which layer shows and hides it */
  layer?: string;
  /** how to recognise it by eye, including what its colour encodes */
  appearance?: string;
  /** live, and computed: '2 of 6 captured', 'drift 7.2e-5%' */
  state?: string;
  /** how finely to sample: intervals per side, samples along a curve, steps */
  detail?: number;
  /** which block of Model.data this object draws, for data-derived objects */
  data?: string;
  /**
   * A system of ordinary differential equations, with its own named states.
   *
   * THE COMPOSABLE PART OF THE SCHEMA. An object is not forced to be a surface
   * or a trajectory or a dataset; it declares the BLOCK that describes what it
   * is, and the engine routes on which block is present (solve.ts). A domain
   * that needs a new kind of computation adds a block and a solver rather than a
   * component and a renderer — which is the difference between a catalogue of
   * simulations and an engine.
   */
  system?: SystemDecl;
  /** parts that assemble into equations of motion — see mechanism.ts */
  mechanism?: MechanismDecl;
  /** a specification to be fitted to data — see estimate.ts */
  estimation?: EstimationDecl;

  /** anything a domain wants to carry that the engine must not interpret */
  meta?: Record<string, string | number | boolean>;
}

// ── the declaration blocks ──────────────────────────────────────────
//
// Kept here rather than in the modules that read them, so the schema is one
// file and a model can be validated without loading a solver. Their SEMANTICS
// live with their code: system.ts, mechanism.ts, estimate.ts.

export interface StateVarDecl {
  name: string;
  /** a number, or an expression in the parameters */
  init: number | string;
  units?: string;
  means?: string;
}

export interface SystemDecl {
  states: StateVarDecl[];
  /** name → d(name)/dt */
  rhs: Record<string, string>;
  /** integration stops when this turns positive */
  stop?: string;
  dt?: number;
  steps?: number;
  /** quantities computed from the state at every step */
  observe?: Record<string, string>;
  /** a quantity that ought not to change, for the integrator to be judged by */
  invariant?: string;
  method?: 'rk4';
}

export interface BodyDecl {
  id: string;
  /** mass, or an expression in the parameters */
  mass: number | string;
  /** starting displacement from its rest position */
  x0?: number | string;
  /** starting velocity */
  v0?: number | string;
  label?: string;
  /** where it sits when nothing has moved, in model units — for the drawing */
  at?: number;
}

export interface LinkDecl {
  id: string;
  /** the two things it joins. 'ground' is the fixed world. */
  between: [string, string];
  /** stiffness for a spring, damping for a damper */
  value: number | string;
  label?: string;
}

export interface ForceDecl {
  id: string;
  /** the body it acts on */
  on: string;
  /** an expression in t, the states and the parameters */
  expr: string;
  label?: string;
}

export interface MechanismDecl {
  /**
   * What the coordinates mean. 'line' is one translational degree of freedom per
   * body along an axis, which is what a spring–mass chain is; other topologies
   * are declared by writing a `system` directly until a grammar for them exists.
   */
  along?: 'line';
  bodies: BodyDecl[];
  springs?: LinkDecl[];
  dampers?: LinkDecl[];
  forces?: ForceDecl[];
  dt?: number;
  steps?: number;
}

export interface EstimationDecl {
  /**
   * THE METHOD IS THE PERSON'S CHOICE AND IS NEVER FILLED IN BY US.
   *
   * A model with no method declared is not estimated: the router returns the
   * candidates and what each one assumes, and waits. Choosing the specification
   * is the intellectual act in empirical work, and a product that picks it and
   * reports coefficients has taken the reasoning and left the arithmetic.
   */
  method?: 'ols' | 'ols-fe' | 'ols-lag';
  /** the column being explained */
  y: string;
  /** the columns explaining it, in order */
  x: string[];
  /** which block of Model.data holds the columns */
  data: string;
  /** panel: the column identifying the unit */
  unit?: string;
  /** panel and time series: the column identifying the period */
  time?: string;
  /** time series: how many lags of y to include */
  lags?: number;
  /** heteroskedasticity-consistent standard errors instead of classical ones */
  robust?: boolean;
  /** whether to fit an intercept. Default true. */
  intercept?: boolean;
}

/** A control: a number the reader may move, with the range that owns it. */
export interface ModelParam {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  units?: string;
  /** plain words: what moving it does */
  means?: string;
  /** a value the reader has pinned — a held variable in a cross-section */
  held?: boolean;
}

export interface ModelLayer {
  id: string;
  label: string;
  on?: boolean;
}

/** Time, where a model has it. Absent means nothing moves. */
export interface ModelTime {
  t: number;
  min: number;
  max: number;
  /** playback rate; the engine never invents motion, it only replays it */
  rate?: number;
  playing?: boolean;
  units?: string;
}

/**
 * A model: the thing every view is a view OF.
 *
 * The identity that matters is `id` plus `version`. A manipulation produces a
 * new version of the same model rather than a new model, which is what lets
 * comparison mean "these two are the same thing at two settings" instead of
 * "here are two unrelated pictures".
 */
export interface Model {
  id: string;
  title: string;
  /** the subject, for the reader: 'multivariable calculus', 'orbital mechanics' */
  domain?: string;
  /**
   * Whether the axes are the same kind of thing.
   *
   * THE DIFFERENCE BETWEEN A GRAPH AND A SHAPE. z = f(x, y) has a height that
   * is not a length: stretching it to fill the box is what a plot is for, and
   * refusing to would make most surfaces invisible. A torus, an orbit and a
   * ray are geometry, where one unit along x and one along z ARE the same
   * length — stretch those and the shape is a lie, which is how the torus
   * came out as a barrel the first time.
   *
   * Absent, the engine infers it: anything drawn from z = f(x, y) is a graph,
   * anything else is geometry.
   */
  aspect?: 'equal' | 'fit';
  /** what is actually being solved or evaluated, as text */
  equations?: string[];
  /** what it holds fixed, in the reader's words */
  assumptions?: string[];
  objects: ModelObject[];
  params: ModelParam[];
  layers?: ModelLayer[];
  time?: ModelTime;
  /**
   * Measured or supplied numbers, by name.
   *
   * SEPARATE FROM THE OBJECTS, because data is the one thing in a model that
   * is neither a statement nor a drawing: it is what somebody observed, and it
   * must not be mixed into a list where an assumption looks the same as a
   * measurement. An object points at a block by name and says, in its own
   * fidelity, that it is data-derived.
   */
  data?: Record<string, DataBlock>;
  /** bumped by every manipulation; see compare() */
  version?: number;
  /** what changed to get here, for "what did that do?" */
  lastChange?: ChangeRecord;
}

/**
 * Numbers that came from outside the model.
 *
 * Three shapes cover what visualisation actually needs: a grid (a surface of
 * measured values), a set of points (observations, a cloud, a path), and a
 * series (a quantity through time). Anything else is those three with names.
 */
export interface DataBlock {
  /** what these numbers are, and where they came from */
  label?: string;
  source?: string;
  /** a grid: z[j][i] at (xs[i], ys[j]) */
  xs?: number[];
  ys?: number[];
  z?: number[][];
  /** loose points, each [x, y, z] */
  points?: [number, number, number][];
  /** a series through time */
  t?: number[];
  v?: number[];
  /**
   * Named columns — a table, which is how data for a fitted model arrives.
   *
   * Separate from the grid and the points because those are GEOMETRY and this is
   * a dataset: a column called 'gdp' is not an axis and must not be drawn as one
   * unless a model says to.
   */
  columns?: Record<string, number[]>;
  units?: string;
}

/** What one manipulation did, so the conversation can say it without guessing. */
export interface ChangeRecord {
  /** the control or object that moved */
  what: string;
  from?: number | string | boolean;
  to?: number | string | boolean;
  /** object ids that had to be recomputed because of it */
  affected: string[];
  at: number;
}

// ── caps, because a model arrives from anywhere ─────────────────────

export const MODEL_CAPS = {
  objects: 400,
  params: 40,
  layers: 24,
  equations: 12,
  assumptions: 12,
  relations: 12,
} as const;

const ID = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
const text = (v: unknown, n: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function sanitizeObject(raw: unknown): ModelObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 48);
  const label = text(r.label, 80);
  if (!ID.test(id) || !label) return null;
  const kind = (OBJECT_KINDS as readonly string[]).includes(r.kind as string)
    ? (r.kind as ObjectKind)
    : 'annotation';
  const out: ModelObject = { id, kind, label };

  const opt = <K extends keyof ModelObject>(k: K, v: ModelObject[K]) => {
    if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) out[k] = v;
  };
  opt('meaning', text(r.meaning, 300) as ModelObject['meaning']);
  opt('domain', text(r.domain, 60) as ModelObject['domain']);
  opt('definition', text(r.definition, 200) as ModelObject['definition']);
  opt('units', text(r.units, 24) as ModelObject['units']);
  opt('appearance', text(r.appearance, 160) as ModelObject['appearance']);
  opt('state', text(r.state, 160) as ModelObject['state']);
  const layer = text(r.layer, 48);
  if (ID.test(layer)) out.layer = layer;
  const value = num(r.value);
  if (value !== null) out.value = value;

  const detail = num(r.detail);
  if (detail !== null && detail > 0) out.detail = Math.min(4000, Math.floor(detail));
  const dataKey = text(r.data, 48);
  if (ID.test(dataKey)) out.data = dataKey;

  // Component definitions, capped in number and in length like every other
  // string here: a model can be written by a conversation, and an expression
  // is the one field where "arrived from outside" and "will be evaluated"
  // meet. The evaluator itself refuses anything it does not recognise.
  if (r.defs && typeof r.defs === 'object' && !Array.isArray(r.defs)) {
    const defs: Record<string, string> = {};
    // Sixteen, not eight: a four-state system with a position map and four
    // initial conditions is ten, and a cap that silently drops the last two
    // leaves a trajectory starting somewhere nobody asked for. Found by the
    // suite, which is what the orbit benchmark is there to do.
    for (const [k, v] of Object.entries(r.defs as Record<string, unknown>).slice(0, 16)) {
      const key = text(k, 16);
      const val = text(v, 300);
      if (/^[a-z][a-z0-9]{0,15}$/i.test(key) && val) defs[key] = val;
    }
    if (Object.keys(defs).length) out.defs = defs;
  }

  if (r.over && typeof r.over === 'object' && !Array.isArray(r.over)) {
    const over: Record<string, [number, number]> = {};
    for (const [k, v] of Object.entries(r.over as Record<string, unknown>).slice(0, 8)) {
      const key = text(k, 16);
      if (!/^[a-z][a-z0-9]{0,15}$/i.test(key) || !Array.isArray(v) || v.length !== 2) continue;
      const a = num(v[0]);
      const b = num(v[1]);
      if (a === null || b === null || b <= a) continue;
      over[key] = [a, b];
    }
    if (Object.keys(over).length) out.over = over;
  }

  const deps = Array.isArray(r.depends)
    ? r.depends.map((d) => text(d, 48)).filter((d) => ID.test(d)).slice(0, 16)
    : [];
  if (deps.length) out.depends = deps;

  // ── the declaration blocks, sanitised hard ─────────────────────
  //
  // A model can be written by a conversation, so every one of these arrives from
  // outside and every expression in them will be evaluated. Names are bounded
  // and pattern-checked, counts are capped, and anything unrecognised is dropped
  // rather than passed through — the evaluator refuses what it does not know,
  // and this is the layer that stops it ever being asked.
  const expr = (v: unknown) => text(v, 300);
  const nameOk = (k: string) => /^[a-z][a-z0-9_]{0,23}$/i.test(k);
  const initOf = (v: unknown): number | string | null => {
    const n = num(v);
    if (n !== null) return n;
    const e = expr(v);
    return e ? e : null;
  };

  const sys = r.system as Record<string, unknown> | undefined;
  if (sys && typeof sys === 'object' && Array.isArray(sys.states)) {
    const states: StateVarDecl[] = [];
    for (const raw of sys.states.slice(0, 24)) {
      if (!raw || typeof raw !== 'object') continue;
      const q = raw as Record<string, unknown>;
      const name = text(q.name, 24);
      if (!nameOk(name) || states.some((x) => x.name === name)) continue;
      const init = initOf(q.init);
      states.push({
        name,
        init: init === null ? 0 : init,
        ...(text(q.units, 24) ? { units: text(q.units, 24) } : {}),
        ...(text(q.means, 160) ? { means: text(q.means, 160) } : {}),
      });
    }
    const rhs: Record<string, string> = {};
    if (sys.rhs && typeof sys.rhs === 'object') {
      for (const [k, v] of Object.entries(sys.rhs as Record<string, unknown>).slice(0, 24)) {
        const key = text(k, 24);
        const val = expr(v);
        if (nameOk(key) && val) rhs[key] = val;
      }
    }
    const observe: Record<string, string> = {};
    if (sys.observe && typeof sys.observe === 'object') {
      for (const [k, v] of Object.entries(sys.observe as Record<string, unknown>).slice(0, 8)) {
        const key = text(k, 24);
        const val = expr(v);
        if (nameOk(key) && val) observe[key] = val;
      }
    }
    if (states.length && Object.keys(rhs).length) {
      const dt = num(sys.dt);
      const steps = num(sys.steps);
      out.system = {
        states,
        rhs,
        ...(expr(sys.stop) ? { stop: expr(sys.stop) } : {}),
        ...(dt !== null && dt > 0 ? { dt: Math.min(10, dt) } : {}),
        ...(steps !== null && steps > 0 ? { steps: Math.min(20_000, Math.floor(steps)) } : {}),
        ...(Object.keys(observe).length ? { observe } : {}),
        ...(expr(sys.invariant) ? { invariant: expr(sys.invariant) } : {}),
        method: 'rk4',
      };
    }
  }

  const mech = r.mechanism as Record<string, unknown> | undefined;
  if (mech && typeof mech === 'object' && Array.isArray(mech.bodies)) {
    const bodies: BodyDecl[] = [];
    for (const raw of mech.bodies.slice(0, 12)) {
      if (!raw || typeof raw !== 'object') continue;
      const q = raw as Record<string, unknown>;
      const bid = text(q.id, 24);
      if (!nameOk(bid) || bodies.some((b) => b.id === bid)) continue;
      const mass = initOf(q.mass);
      if (mass === null) continue;
      const at = num(q.at);
      bodies.push({
        id: bid,
        mass,
        ...(initOf(q.x0) !== null ? { x0: initOf(q.x0) as number | string } : {}),
        ...(initOf(q.v0) !== null ? { v0: initOf(q.v0) as number | string } : {}),
        ...(text(q.label, 60) ? { label: text(q.label, 60) } : {}),
        ...(at !== null ? { at } : {}),
      });
    }
    const links = (v: unknown): LinkDecl[] => {
      if (!Array.isArray(v)) return [];
      const kept: LinkDecl[] = [];
      for (const raw of v.slice(0, 24)) {
        if (!raw || typeof raw !== 'object') continue;
        const q = raw as Record<string, unknown>;
        const lid = text(q.id, 24);
        const pair = Array.isArray(q.between) ? q.between.map((x) => text(x, 24)) : [];
        const value = initOf(q.value);
        if (!nameOk(lid) || pair.length !== 2 || value === null) continue;
        if (!pair.every((p) => p === 'ground' || nameOk(p))) continue;
        kept.push({
          id: lid,
          between: [pair[0], pair[1]],
          value,
          ...(text(q.label, 60) ? { label: text(q.label, 60) } : {}),
        });
      }
      return kept;
    };
    const forces: ForceDecl[] = Array.isArray(mech.forces)
      ? (mech.forces
          .slice(0, 12)
          .map((raw) => {
            if (!raw || typeof raw !== 'object') return null;
            const q = raw as Record<string, unknown>;
            const fid = text(q.id, 24);
            const on = text(q.on, 24);
            const e = expr(q.expr);
            if (!nameOk(fid) || !nameOk(on) || !e) return null;
            return { id: fid, on, expr: e, ...(text(q.label, 60) ? { label: text(q.label, 60) } : {}) };
          })
          .filter(Boolean) as ForceDecl[])
      : [];
    if (bodies.length) {
      const dt = num(mech.dt);
      const steps = num(mech.steps);
      out.mechanism = {
        along: 'line',
        bodies,
        ...(links(mech.springs).length ? { springs: links(mech.springs) } : {}),
        ...(links(mech.dampers).length ? { dampers: links(mech.dampers) } : {}),
        ...(forces.length ? { forces } : {}),
        ...(dt !== null && dt > 0 ? { dt: Math.min(1, dt) } : {}),
        ...(steps !== null && steps > 0 ? { steps: Math.min(20_000, Math.floor(steps)) } : {}),
      };
    }
  }

  const est = r.estimation as Record<string, unknown> | undefined;
  if (est && typeof est === 'object') {
    const yCol = text(est.y, 40);
    const xs = Array.isArray(est.x) ? est.x.map((c) => text(c, 40)).filter(Boolean).slice(0, 20) : [];
    const dataKey2 = text(est.data, 48);
    const method = est.method;
    if (yCol && xs.length && ID.test(dataKey2)) {
      const lags = num(est.lags);
      out.estimation = {
        y: yCol,
        x: xs,
        data: dataKey2,
        // An unrecognised method is DROPPED, not guessed at: the router then
        // reports the choice as open, which is the honest state.
        ...(method === 'ols' || method === 'ols-fe' || method === 'ols-lag' ? { method } : {}),
        ...(text(est.unit, 40) ? { unit: text(est.unit, 40) } : {}),
        ...(text(est.time, 40) ? { time: text(est.time, 40) } : {}),
        ...(lags !== null && lags > 0 ? { lags: Math.min(12, Math.floor(lags)) } : {}),
        ...(est.robust === true ? { robust: true } : {}),
        ...(est.intercept === false ? { intercept: false } : {}),
      };
    }
  }

  if (Array.isArray(r.relations)) {
    const rel = r.relations
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const y = x as Record<string, unknown>;
        const to = text(y.to, 48);
        const as = y.as as Relation;
        if (!ID.test(to) || !(RELATIONS as readonly string[]).includes(as)) return null;
        const why = text(y.why, 160);
        return why ? { to, as, why } : { to, as };
      })
      .filter(Boolean) as ModelObject['relations'];
    if (rel?.length) out.relations = rel.slice(0, MODEL_CAPS.relations);
  }

  const p = r.provenance as Record<string, unknown> | undefined;
  if (p && typeof p === 'object') {
    const origin = (['user', 'inference', 'equation', 'computation', 'simulation', 'dataset', 'source', 'default'] as Origin[])
      .includes(p.origin as Origin)
      ? (p.origin as Origin)
      : 'default';
    const prov: Provenance = { origin };
    const detail = text(p.detail, 200);
    if (detail) prov.detail = detail;
    const c = num(p.confidence);
    if (c !== null) prov.confidence = Math.min(1, Math.max(0, c));
    out.provenance = prov;
  }

  const u = r.uncertainty as Record<string, unknown> | undefined;
  if (u && typeof u === 'object') {
    const unc: Uncertainty = {};
    const pm = num(u.plusMinus);
    if (pm !== null) unc.plusMinus = Math.abs(pm);
    if (Array.isArray(u.range) && u.range.length === 2) {
      const a = num(u.range[0]);
      const b = num(u.range[1]);
      if (a !== null && b !== null) unc.range = a <= b ? [a, b] : [b, a];
    }
    const says = text(u.says, 80);
    if (says) unc.says = says;
    if (Object.keys(unc).length) out.uncertainty = unc;
  }

  // `meta` is carried through UNINTERPRETED — it is the domain's own note to
  // itself — but it is still bounded and still typed: the engine reads a
  // couple of keys from it (a step, a count), and an unbounded object here
  // would be a way to put anything into a model.
  if (r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)) {
    const meta: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(r.meta as Record<string, unknown>).slice(0, 16)) {
      const key = text(k, 24);
      if (!/^[a-z][a-z0-9_-]{0,23}$/i.test(key)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) meta[key] = v;
      else if (typeof v === 'boolean') meta[key] = v;
      else if (typeof v === 'string') {
        const val = text(v, 80);
        if (val) meta[key] = val;
      }
    }
    if (Object.keys(meta).length) out.meta = meta;
  }

  // AN UNKNOWN FIDELITY IS CONCEPTUAL. The safe direction is the modest one:
  // a drawing mislabelled as a computation is a lie, and a computation
  // mislabelled as a drawing only undersells itself.
  const f = r.fidelity as Fidelity;
  out.fidelity = (['conceptual', 'model-derived', 'numerically-computed', 'data-derived', 'simulated'] as Fidelity[]).includes(f)
    ? f
    : 'conceptual';
  return out;
}

export function sanitizeParam(raw: unknown): ModelParam | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 48);
  const value = num(r.value);
  const min = num(r.min);
  const max = num(r.max);
  if (!ID.test(id) || value === null || min === null || max === null || max <= min) return null;
  const out: ModelParam = {
    id,
    label: text(r.label, 48) || id,
    value: Math.min(max, Math.max(min, value)),
    min,
    max,
  };
  const step = num(r.step);
  if (step !== null && step > 0) out.step = step;
  const units = text(r.units, 24);
  if (units) out.units = units;
  const means = text(r.means, 220);
  if (means) out.means = means;
  if (r.held === true) out.held = true;
  return out;
}

/**
 * A model that arrived from outside, made safe.
 *
 * The same discipline every other boundary in this product keeps: a model can
 * be written by a conversation, restored from a saved project or pasted by
 * somebody, and none of those may put an unbounded string in front of the
 * next reader or a relation pointing at an object that is not there.
 */
export function sanitizeModel(raw: unknown): Model | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 48);
  const title = text(r.title, 90);
  if (!ID.test(id) || !title) return null;

  const objects = Array.isArray(r.objects)
    ? (r.objects.map(sanitizeObject).filter(Boolean) as ModelObject[]).slice(0, MODEL_CAPS.objects)
    : [];
  const params = Array.isArray(r.params)
    ? (r.params.map(sanitizeParam).filter(Boolean) as ModelParam[]).slice(0, MODEL_CAPS.params)
    : [];

  // A relation to an object that is not in the model is not a relation. It
  // would draw an edge to nowhere and answer a question with a dangling id.
  const have = new Set(objects.map((o) => o.id));
  for (const o of objects) {
    if (o.relations) {
      const kept = o.relations.filter((x) => have.has(x.to));
      if (kept.length) o.relations = kept;
      else delete o.relations;
    }
  }

  const model: Model = { id, title, objects, params };
  const domain = text(r.domain, 60);
  if (domain) model.domain = domain;
  if (r.aspect === 'equal' || r.aspect === 'fit') model.aspect = r.aspect;
  const list = (v: unknown, n: number, each: number) =>
    Array.isArray(v) ? v.map((x) => text(x, each)).filter(Boolean).slice(0, n) : [];
  const eq = list(r.equations, MODEL_CAPS.equations, 200);
  if (eq.length) model.equations = eq;
  const asm = list(r.assumptions, MODEL_CAPS.assumptions, 240);
  if (asm.length) model.assumptions = asm;

  if (Array.isArray(r.layers)) {
    const layers = r.layers
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const y = x as Record<string, unknown>;
        const lid = text(y.id, 48);
        if (!ID.test(lid)) return null;
        return { id: lid, label: text(y.label, 48) || lid, on: y.on !== false };
      })
      .filter(Boolean) as ModelLayer[];
    if (layers.length) model.layers = layers.slice(0, MODEL_CAPS.layers);
  }

  const t = r.time as Record<string, unknown> | undefined;
  if (t && typeof t === 'object') {
    const now = num(t.t);
    const min = num(t.min);
    const max = num(t.max);
    if (now !== null && min !== null && max !== null && max > min) {
      model.time = {
        t: Math.min(max, Math.max(min, now)),
        min,
        max,
        ...(num(t.rate) !== null ? { rate: num(t.rate)! } : {}),
        ...(t.playing === true ? { playing: true } : {}),
        ...(text(t.units, 24) ? { units: text(t.units, 24) } : {}),
      };
    }
  }
  if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
    const blocks: Record<string, DataBlock> = {};
    for (const [k, raw] of Object.entries(r.data as Record<string, unknown>).slice(0, 12)) {
      if (!ID.test(k) || !raw || typeof raw !== 'object') continue;
      const b = raw as Record<string, unknown>;
      const nums = (v: unknown, cap: number): number[] | undefined => {
        if (!Array.isArray(v)) return undefined;
        const out = v.map(num).filter((x): x is number => x !== null).slice(0, cap);
        return out.length ? out : undefined;
      };
      const block: DataBlock = {};
      const label = text(b.label, 80);
      if (label) block.label = label;
      const source = text(b.source, 160);
      if (source) block.source = source;
      const units = text(b.units, 24);
      if (units) block.units = units;
      block.xs = nums(b.xs, 400);
      block.ys = nums(b.ys, 400);
      block.t = nums(b.t, 4000);
      block.v = nums(b.v, 4000);
      if (Array.isArray(b.z)) {
        const grid = b.z
          .map((row) => nums(row, 400))
          .filter((row): row is number[] => !!row)
          .slice(0, 400);
        if (grid.length) block.z = grid;
      }
      if (Array.isArray(b.points)) {
        const pts = b.points
          .map((pt) => (Array.isArray(pt) ? pt.map(num) : []))
          .filter((pt) => pt.length === 3 && pt.every((x) => x !== null))
          .slice(0, 20_000) as [number, number, number][];
        if (pts.length) block.points = pts;
      }
      // Named columns: a table. Capped in count and in length like the rest, and
      // every column truncated to the SHORTEST one — a fit over ragged columns
      // silently pairs the wrong rows, which is a wrong answer with decimals.
      if (b.columns && typeof b.columns === 'object' && !Array.isArray(b.columns)) {
        const columns: Record<string, number[]> = {};
        for (const [name, v] of Object.entries(b.columns as Record<string, unknown>).slice(0, 24)) {
          const key = text(name, 40);
          const col = nums(v, 20_000);
          if (/^[a-z][a-z0-9_]{0,39}$/i.test(key) && col) columns[key] = col;
        }
        const keys = Object.keys(columns);
        if (keys.length) {
          const shortest = Math.min(...keys.map((k) => columns[k].length));
          for (const k of keys) columns[k] = columns[k].slice(0, shortest);
          block.columns = columns;
        }
      }
      for (const key of ['xs', 'ys', 't', 'v'] as const) if (!block[key]) delete block[key];
      if (Object.keys(block).length) blocks[k] = block;
    }
    if (Object.keys(blocks).length) model.data = blocks;
  }

  const v = num(r.version);
  if (v !== null) model.version = Math.max(0, Math.floor(v));
  return model;
}

// ── reading a model ─────────────────────────────────────────────────

export function objectOf(model: Model, id: string): ModelObject | null {
  return model.objects.find((o) => o.id === id) ?? null;
}

export function paramOf(model: Model, id: string): ModelParam | null {
  return model.params.find((p) => p.id === id) ?? null;
}

export function byKind(model: Model, ...kinds: ObjectKind[]): ModelObject[] {
  const want = new Set(kinds);
  return model.objects.filter((o) => want.has(o.kind));
}

/**
 * Everything a change to `ids` reaches.
 *
 * THE POINT OF THE WHOLE DEPENDENCY FIELD. Moving one control must not
 * rebuild the picture: it must rebuild the part of the picture that moved.
 * This walks `depends` (a control) and `depends-on` / `derived-from` (an
 * object built out of another) transitively, and is the list the renderer
 * recomputes and the conversation is allowed to say changed.
 *
 * Cycles are normal in a model of a system, so the visited set is the
 * termination condition rather than an assumption of acyclicity.
 */
export function affectedBy(model: Model, ids: readonly string[]): string[] {
  const seed = new Set(ids);
  const out = new Set<string>();
  let frontier = [...seed];
  const follows: readonly Relation[] = ['depends-on', 'derived-from', 'parameterizes'];

  while (frontier.length) {
    const next: string[] = [];
    for (const o of model.objects) {
      if (out.has(o.id)) continue;
      const viaDepends = (o.depends ?? []).some((d) => frontier.includes(d));
      const viaRelation = (o.relations ?? []).some(
        (r) => follows.includes(r.as) && frontier.includes(r.to)
      );
      if (viaDepends || viaRelation) {
        out.add(o.id);
        next.push(o.id);
      }
    }
    frontier = next;
  }
  return [...out];
}

/** What this object rests on: the answer to "why is this here?". */
export function dependenciesOf(model: Model, id: string): {
  params: ModelParam[];
  objects: ModelObject[];
} {
  const o = objectOf(model, id);
  if (!o) return { params: [], objects: [] };
  const params = (o.depends ?? []).map((d) => paramOf(model, d)).filter(Boolean) as ModelParam[];
  const objects = (o.relations ?? [])
    .filter((r) => r.as === 'depends-on' || r.as === 'derived-from')
    .map((r) => objectOf(model, r.to))
    .filter(Boolean) as ModelObject[];
  return { params, objects };
}

/**
 * The most modest fidelity in a set of objects.
 *
 * A picture is only as computed as its least computed part, and a view built
 * from one integrated trajectory and four drawn guides is not "numerically
 * computed". Used for the one-line label a view carries.
 */
export function overallFidelity(objects: readonly ModelObject[]): Fidelity {
  const rank: Fidelity[] = [
    'conceptual', 'data-derived', 'model-derived', 'simulated', 'numerically-computed',
  ];
  let worst: Fidelity | null = null;
  for (const o of objects) {
    const f = o.fidelity ?? 'conceptual';
    if (worst === null || rank.indexOf(f) < rank.indexOf(worst)) worst = f;
  }
  return worst ?? 'conceptual';
}

/** A model with one control moved, and a record of what that reached. */
export function setParam(model: Model, id: string, value: number, at = 0): Model {
  const p = paramOf(model, id);
  if (!p) return model;
  const next = Math.min(p.max, Math.max(p.min, value));
  if (next === p.value) return model;
  return {
    ...model,
    version: (model.version ?? 0) + 1,
    params: model.params.map((q) => (q.id === id ? { ...q, value: next } : q)),
    lastChange: {
      what: id,
      from: p.value,
      to: next,
      affected: affectedBy(model, [id]),
      at,
    },
  };
}

/** A model at a different instant. Time is a dimension, not a control. */
export function setTime(model: Model, t: number, at = 0): Model {
  if (!model.time) return model;
  const next = Math.min(model.time.max, Math.max(model.time.min, t));
  if (next === model.time.t) return model;
  return {
    ...model,
    version: (model.version ?? 0) + 1,
    time: { ...model.time, t: next },
    lastChange: {
      what: 'time',
      from: model.time.t,
      to: next,
      // Everything that moves with time is everything with a time dependency
      // declared; a model whose objects do not say so does not animate.
      affected: affectedBy(model, ['t', 'time']),
      at,
    },
  };
}
