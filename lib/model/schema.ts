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
import { NAME, SLUG, collidesWith } from './ids';
import { canonicalCoefficientId, labelForSlot, placeholdersFor, slotsOf } from './binding';
import type { TermDecl, TermOp } from './terms';

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
  /**
   * Bodies under mutual gravity — see gravity.ts.
   *
   * A SOLAR SYSTEM IS THIS BLOCK, and so is Earth and Moon, a binary star, a
   * three-body figure-eight and a star with five invented planets. There is no
   * branch anywhere on what the system is called: the assembler writes the
   * pairwise equations from the bodies it is given, and the integrator runs them.
   */
  gravity?: GravityDecl;
  /** a specification to be fitted to data — see estimate.ts */
  estimation?: EstimationDecl;
  /**
   * A SYSTEM OF EQUATIONS TO BE SOLVED — see algebra.ts.
   *
   * The fourth declaration, and the one the engine had no way to express at
   * all: `system` is states and their RATES (an ODE), and there was nothing for
   * quantities related by equations that hold at once. A market with a tax, a
   * resistive circuit, a static force balance, a mass balance, two lines
   * crossing — all of them are this, and all of them came back `unsupported`.
   */
  equations?: EquationsDecl;

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
  /**
   * A number, or an expression in the parameters — OR ABSENT.
   *
   * Optional, and that is the fix for a fabrication readSystem's own docstring
   * forbids: "a system with no initial value for one of its states cannot be
   * integrated, and the alternative to saying so is picking a number — which
   * produces a trajectory, and a trajectory is read as a result."
   *
   * The sanitiser was picking the number. An omitted init, null, NaN, '', a
   * bare space or an object all became 0 BEFORE readSystem could object, so
   * the engine drew a flat line at the origin and captioned it Runge–Kutta.
   * Verified on eight variants, every one of which ran and returned zeros.
   *
   * Absent now means the starting value has not been chosen, and readSystem's
   * existing check reports "a starting value for x".
   */
  init?: number | string;
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
  /**
   * Mass, or an expression in the parameters — or absent, meaning the body is
   * there and nobody has said how heavy it is. Same rule as LinkDecl.value:
   * a part with an unchosen value is a part, not an absence.
   */
  mass?: number | string;
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
  /**
   * Stiffness for a spring, damping for a damper — OR ABSENT.
   *
   * Optional, and that is the fix for a real fabrication. A link with no value
   * used to be DELETED by the sanitiser, silently: "a mass on a spring,
   * stiffness to be decided" assembled to v̇ = (0)/(1) — a mass with no forces
   * on it at all — routed runnable, graded `dynamic`, and drew a motionless
   * body at `numerically-computed`. The spring the person asked for was gone
   * without a word, and what they were shown was a computed picture of
   * nothing.
   *
   * Absent now means the connection EXISTS and its value has not been chosen.
   * readMechanism reports "a stiffness for k1" and the model stands as
   * `mathematical` until somebody supplies it.
   */
  value?: number | string;
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

export interface GravityBodyDecl {
  id: string;
  /** mass, or the id of a control */
  mass: number | string;
  /** where it starts, in the declaration's units */
  x?: number | string;
  y?: number | string;
  /** how fast it is going when the clock starts */
  vx?: number | string;
  vy?: number | string;
  label?: string;
  /** where the numbers came from, per body — a source, a dataset, a default */
  from?: Origin;
}

export interface GravityDecl {
  /**
   * Bodies that pull on one another. TWO OR MORE, because one body on its own has
   * nothing to fall toward — see lib/model/gravity.ts, which assembles these into
   * the same state-space system the integrator already runs.
   */
  bodies: GravityBodyDecl[];
  /** the only law implemented. Named, so another can be added beside it. */
  law?: 'newton';
  /**
   * Which units the numbers are in. Astronomical (AU, solar masses, years) gives
   * G = 4π² and is what a planetary system should use; SI is for everything else.
   * Mixing them silently would produce a plausible picture of nothing.
   */
  units?: 'astronomical' | 'si';
  /** override G, for a model working in units of its own */
  G?: number | string;
  /** softening length: a numerical device that keeps a close pass finite */
  softening?: number | string;
  /** the plane the motion is computed in. Stated rather than assumed. */
  plane?: 'xy';
  dt?: number;
  steps?: number;
}

export interface EquationsDecl {
  /**
   * What to solve for. Everything else in the equations must already have a
   * value — a control, a constant, a fitted coefficient — and the symbol table
   * decides which is which, so there is no second opinion about what is known.
   */
  unknowns: string[];
  /** each one `left = right`, in the model's own names */
  relations: string[];
  /**
   * What each unknown is measured in, where the author knows.
   *
   * NOT DECORATION: it decides which unknowns share an axis when the system is
   * read as a figure. Two quantities in the same unit are commensurable and
   * belong on one axis; two in different units never are, however the algebra
   * happens to relate them. Where units are absent the figure falls back on the
   * algebraic form of the relations, which is a weaker signal — see
   * `axesFor` in lib/model/equations.ts.
   */
  units?: Record<string, string>;
  /**
   * What the person is investigating, when the relations alone do not say.
   * Free text for a reader; the solver never branches on it.
   */
  about?: string;
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
  /** the columns explaining it, in order. A name here may be a TERM — see `terms`. */
  x: string[];
  /**
   * HOW A REGRESSOR IS BUILT, when it is not simply a column of the data.
   *
   * THE HOLE THIS FILLS, measured exactly. `x` was a list of column names, so
   * the only way to write `wage = β₀ + β₁·educ + β₂·exper + β₃·exper²` was to
   * declare a third, independent regressor called `exper2` — and nothing could
   * ever bind it, because there is no such quantity. The engine then asked for
   * observations of `exper2`, the response surface carried a free symbol, and
   * the picture was empty:
   *
   *   says             : "nothing in it computes yet … needs observations —
   *                       wage, educ, exper, exper2 for each case"
   *   response surface : b0 + (b1) * x + (b2) * y + (b3) * exper2
   *   primitives drawn : 0
   *
   * `exper²` is not a variable. It is a TRANSFORMATION of `exper`, and this is
   * where that is said:
   *
   *   x: ['educ', 'exper', 'exper_pow2'],
   *   terms: { exper_pow2: { op: 'pow', of: 'exper', by: 2 } }
   *
   * ADDITIVE ON PURPOSE. A regressor with no entry here is a plain column,
   * exactly as before, so nothing that worked stops working — and the
   * coefficient binding stays keyed on the regressor's own name, which is the
   * convention the binding fix established.
   *
   * The outcome may be a term too (`terms: { log_wage: … }` with `y:
   * 'log_wage'`), which is how a log-level specification is stated.
   *
   * See lib/model/terms.ts for the operations and, more importantly, for the
   * distinction that decides what can be computed without data: a POINTWISE
   * term is an expression and needs nothing but its inputs; a term OVER THE
   * SAMPLE — a lag, a difference, a within-group mean — is a relationship
   * between observations and cannot exist without them and an index.
   */
  terms?: Record<string, TermDecl>;
  /**
   * WHAT KIND OF QUANTITY EACH VARIABLE IS.
   *
   * THE GAP THIS FILLS, found by a model that stopped drawing. A log-wage
   * relationship in education and a female indicator came back saying
   *
   *   "female is a FREE INPUT here … it needs a range — say what values of
   *    female are worth looking at"
   *
   * and drew nothing. The demand is correct for a continuous input and absurd
   * for this one: an indicator takes two values, and which two is not a
   * modelling decision anybody makes. A SURFACE OVER A RANGE OF FEMALE IS NOT A
   * THING. Its range follows from what it IS.
   *
   * So a variable may say what kind it is, and the kind carries what follows
   * from it. `binary` is 0 or 1 and needs no range. The others are declared
   * because they constrain what may be done rather than what may be drawn — the
   * econometrics digest's chapter on limited dependent variables turns entirely
   * on an outcome being binary, and an engine that cannot represent that cannot
   * refuse an estimator honestly either.
   *
   * NOT GUESSED FROM A NAME. A column called `female` is not assumed to be an
   * indicator, because the next one called `female_share` is not. An `indicator`
   * TERM implies binary without being told, because its own definition says so.
   */
  kinds?: Record<string, 'continuous' | 'binary' | 'categorical' | 'count'>;
  /**
   * Which block of Model.data holds the columns — WHEN THERE IS ONE.
   *
   * OPTIONAL, AND THAT IS THE POINT. A specification is a statement about what
   * explains what; it is complete as a statement before any data exists, and
   * "Wage = β0 + β1·Education + u" is a model somebody can hold, argue with,
   * add a regressor to and remove one from without a single observation. It
   * used to be required, so a specification without data could not be
   * expressed at all — and a request to build one had nowhere to land but a
   * concept node.
   *
   * Absent means SPECIFIED BUT NOT ESTIMATED. The estimator then reports the
   * data as the missing structure, which is exactly what it is, and nothing
   * anywhere is allowed to invent it.
   */
  data?: string;
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
  /**
   * WHICH CONTROL DRIVES WHICH COEFFICIENT, by the regressor's own name, plus
   * "intercept" for β₀.
   *
   * THE BINDING, DECLARED WHERE THE AUTHOR CAN DECLARE IT. The coefficient
   * objects (`spec__b1` and so on) do not exist until the expander runs, so
   * whoever writes a model cannot name a control after one — and the expander
   * used to resolve a coefficient to a control by exact id equality against
   * exactly that unwritable convention. The result was an interface showing
   * β₁ = 0.7 beside an executor asking for a value for `spec__b1`, and an
   * empty three-dimensional box between them.
   *
   *   "coefficients": {"intercept": "b0", "Y_t": "b1", "C_lag": "b2"}
   *
   * Nothing is guessed. A regressor with no entry, and no control named after
   * its canonical id, and no value of its own, is REPORTED as unbound — with
   * its display name — rather than filled in.
   */
  coefficients?: Record<string, string>;
  /**
   * The range each regressor is worth looking at over.
   *
   * A VIEWING WINDOW, NOT A DATUM. Saying "show me education from 8 to 20"
   * asserts nothing about anybody's education; it says where to look. It is
   * kept on the declaration so the deterministic component below has a domain
   * to be evaluated over, and it is absent rather than guessed — a surface
   * with no range reports the range as what it is waiting for, which is a
   * question somebody can answer in one word.
   */
  over?: Record<string, [number, number]>;
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
  /**
   * WHAT THE ENGINE SUPPLIED RATHER THAN WAS GIVEN, so every surface can say so.
   *
   * `value`: a placeholder — nothing gave this control a number, and it stands
   * at 0 (an intercept) or 1 (a slope) so the relationship draws. Cleared the
   * moment somebody moves it (setParam). `range`: the number is theirs, the
   * slider's span around it is not — a control arriving with a value and no
   * min/max used to be thrown away in silence, and the coefficient it carried
   * went unbound. See lib/model/binding.ts.
   */
  assumed?: 'value' | 'range';
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
  /**
   * WHERE EACH FREE INPUT CURRENTLY SITS, by the input's own name.
   *
   * A PARAMETER AND A FREE INPUT ARE MANIPULATED DIFFERENTLY, and the engine had
   * only one kind of control. Moving β₁ changes the FUNCTION; moving education
   * selects a POINT WITHIN it. Both have to be canonical — the model is
   * authoritative and a view is a projection of it — so the cursor lives here and
   * not in the interface, survives a save, and is what `undo` undoes.
   *
   * It is not a window. The window (`over`, the domain) is the modelling claim
   * about what range is worth looking at, and the engine may never invent one.
   * This is where inside that range somebody is currently standing, which has a
   * defensible default — the middle — because it is a question about looking
   * rather than about the model.
   */
  at?: Record<string, number>;
  /**
   * WHAT IS CURRENTLY SELECTED, by canonical object id.
   *
   * CANONICAL, AND THAT IS THE WHOLE POINT OF LINKED VIEWS. A surface, a
   * cross-section, a table, a slope and an inspector are projections of ONE
   * model; clicking a point in any of them means the same thing, and the way
   * they stay in step is that they all read this rather than messaging each
   * other. It lives here and not in a view's own state for the same reason the
   * input cursors do: a view is a projection, and a projection cannot own the
   * thing it projects.
   *
   * It is also what "this" means when somebody asks about it. Chat is handed the
   * selected object's IDENTITY and its structured context — not a description of
   * what a picture looks like near a pixel.
   */
  selected?: string;
  /**
   * WHICH REPRESENTATION IS OPEN, by the id `viewsFor` gives it.
   *
   * CANONICAL FOR THE SAME REASON THE SELECTION IS. A model can be looked at as
   * a surface, its level sets, a cross-section, a table of its values, the
   * relationships it states or its own dependency graph, and which of those
   * somebody is currently looking at is a fact about this session that the
   * conversation can read, a reply can set, `undo` can undo, and a saved
   * document can come back to. Held in a component it would be none of those:
   * the row of views would be a menu whose choices the rest of the system could
   * not see.
   *
   * IT IS NOT A CLAIM ABOUT THE MODEL. Unset means "whichever the engine would
   * choose", which is what `primaryView` answers — so a model that never
   * mentions this still opens on its best representation, and a model whose
   * structure changes under an open view falls back rather than showing an
   * empty frame for a view that no longer exists.
   */
  view?: string;
  /** bumped by every manipulation; see compare() */
  version?: number;
  /** what changed to get here, for "what did that do?" */
  lastChange?: ChangeRecord;
  /**
   * WHAT THE SANITISER REMOVED, in the person's terms.
   *
   * A trust boundary has to bound unbounded input, but trimming a declaration is
   * an edit to the model and an unrecorded one is indistinguishable from the
   * model never having said it. Every cap in `sanitizeModel` writes a line here,
   * the build report carries them, and the conversation reads them — so "why are
   * there only twelve planets?" has an answer.
   */
  dropped?: string[];
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
  /**
   * THE INDEX COLUMNS: what makes an observation locatable.
   *
   * A LAG IS NOT A NAME, IT IS A POSITION. The digest is explicit from chapter
   * 10 on: "Time-indexed variables and lag operators must be structural, not
   * string hacks", and chapters 13–14 add entity indexing on top. A column of
   * numbers with no ordering has no previous value, so `lag(c, 1)` over it is
   * not a quantity that is missing a number — it is a relationship with nothing
   * to hold between.
   *
   * Keyed by DIMENSION rather than by role, so `time`, `entity`, `firm`,
   * `region`, `cohort` and `wave` are all the same kind of thing and a term
   * names which one it runs over. Values may be strings, because an entity is
   * usually a name and a period is often a label.
   *
   *   index: { time: [1990, 1991, 1992, …], entity: ['a', 'a', 'a', 'b', …] }
   */
  index?: Record<string, (number | string)[]>;
  units?: string;
}

/** The coordinate letters a sampler binds for a shape, whatever the model calls its own. */
export const COORDINATES: readonly string[] = ['x', 'y', 'z', 'u', 'v', 's', 'w', 't'];

/**
 * THE NAMES A RELATIONSHIP IS SAMPLED OVER, taken from the model where it says.
 *
 * `x`, `y` and `z` are COORDINATES, and they were also the only names an
 * expression could use — so `Q = 100 − 2P` over a range of P did not compile and
 * the author had to rename their own variable to `x` before the engine would
 * evaluate it. A display name must not become an execution identity, and neither
 * must a coordinate: the model's own name for a quantity is the name its
 * mathematics is written in.
 *
 * `over` is where a model states its windows, so it is also where it states its
 * variables: `over: {p: [0, 50]}` is a curve in `p`. Only when the model names
 * EXACTLY as many as the shape needs, because a partial naming is ambiguous about
 * which axis is which and guessing the order is how a picture comes out
 * transposed.
 *
 * Lives here, in the leaf, because the ROUTER and the COMPILER both have to agree
 * about it — and every time those two have had their own copy of a rule, they
 * have disagreed and the disagreement has been silent.
 */
export function sampledOver(o: ModelObject, want: number, fallback: readonly string[]): string[] {
  const named = Object.keys(o.over ?? {}).filter((k) => !COORDINATES.includes(k));
  return named.length === want ? named : [...fallback];
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
  /** the PROSE equation list a reader sees. Nothing solves these. */
  equations: 12,
  assumptions: 12,
  relations: 12,
  // ── the caps the SOLVERS also have to know about ──────────────────
  //
  // THESE USED TO BE MAGIC NUMBERS AT THE CALL SITES, and they disagreed with
  // the solvers by a factor of two. The sanitiser trimmed a system to 24 states
  // and a gravity block to 12 bodies; lib/model/system.ts capped the run at 24
  // states while lib/model/gravity.ts admitted 12 bodies, which in the plane is
  // 48. Three numbers for one quantity, none of them aware of the others.
  //
  // system.ts now takes STATE_CAP from here and gravity.ts derives BODY_CAP from
  // that, so the chain is one number: a nine-planet system is 36 states and runs.
  /** states the integrator will run — lib/model/system.ts STATE_CAP is this */
  states: 64,
  /**
   * States the sanitiser KEEPS, deliberately above the run cap.
   *
   * Trimming to exactly the run cap would mean a system that is merely too big
   * arrives at the integrator looking like one that fits, and runs — a different
   * system, silently. Keeping more lets readSystem refuse it with its own true
   * count. The cap still exists, for input that is not a model at all.
   */
  statesKept: 96,
  /** bodies one mechanism or gravity block may declare, before the solver's own cap */
  bodies: 24,
  /** springs, dampers or forces per mechanism */
  parts: 24,
  /** derived observations riding along with a run */
  observe: 8,
  /** unknowns in one equations block */
  unknowns: 24,
  /** relations in one equations block — the ones that are actually solved */
  solveRelations: 24,
  /** regressors in one specification */
  regressors: 20,
  /** keys in `defs`, `over`, `meta` and `depends` */
  keys: 16,
} as const;

/**
 * Take at most `cap`, AND SAY SO when there were more.
 *
 * SILENT TRUNCATION IS AN EDIT TO THE MODEL. Every cap below used to be a bare
 * `.slice(0, n)`, so a thirty-body system became a twelve-body one and a
 * seventy-state system became a twenty-four-state one with nothing anywhere
 * recording it — and the forces in an n-body system are pairwise, so removing
 * bodies changes how every remaining one moves. The model that ran was not the
 * model that was proposed, and "the model is the source of truth" cannot survive
 * the sanitiser quietly rewriting it.
 *
 * The caps stay, because this is a trust boundary and unbounded input has to be
 * bounded somewhere. What changes is that the trim is RECORDED, on the model, in
 * the person's terms — and the solvers refuse a declaration over their own cap
 * rather than running a smaller one.
 */
function capped<T>(list: readonly T[], cap: number, what: string, drop?: (s: string) => void): T[] {
  if (list.length > cap) drop?.(`${what}: ${list.length} given, ${cap} kept`);
  return list.slice(0, cap);
}

// THE ONE GRAMMAR for anything an expression can mention — see lib/model/ids.ts
// for the six that disagreed and what that cost. A MODEL's own id keeps the
// permissive form, because it never reaches an evaluator and `linear-model`
// is a real stored id.
const ID = NAME;
const MODEL_ID = SLUG;
/** `family:object` and `family:data:key` — see Model.view. */
const VIEW_ID = /^[A-Za-z_][A-Za-z0-9_]*(:[A-Za-z_][A-Za-z0-9_]*){1,3}$/;
const text = (v: unknown, n: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
/** An expression as written, with a stated left-hand side ("y =", "f(x) =") removed; refused and recorded when it is too long to keep whole. */
const expression = (v: unknown, n: number, what: string, drop?: (s: string) => void): string => {
  if (typeof v !== 'string') return '';
  const whole = v.replace(/\s+/g, ' ').trim();
  if (!whole) return '';
  if (whole.length > n) {
    drop?.(`${what} is ${whole.length} characters, longer than the ${n} an expression may be, and is not in the model`);
    return '';
  }
  // One stated side only — `a = b = c` and `==` are left alone.
  const m = whole.match(/^([a-z][a-z0-9_]*)\s*(\([^()]*\))?\s*=(?!=)\s*(.+)$/i);
  if (m && !/=/.test(m[3])) return m[3].trim();
  return whole;
};

export function sanitizeObject(
  raw: unknown,
  drop?: (what: string) => void,
  /** a control the object's own declaration implies — a numeric coefficient becomes one */
  want?: (p: ModelParam) => void
): ModelObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 48);
  const label = text(r.label, 80);
  if (!ID.test(id) || !label) return null;
  const known = (OBJECT_KINDS as readonly string[]).includes(r.kind as string);
  // AN UNKNOWN KIND IS SAID. It became an annotation in silence, so a typo —
  // `surfce` — produced a note on the model instead of a surface, and nothing
  // anywhere said why there was no picture.
  if (!known && r.kind !== undefined) {
    drop?.(`${id} has a kind this engine does not know (${String(r.kind).slice(0, 24)}) and is kept as an annotation`);
  }
  const kind = known ? (r.kind as ObjectKind) : 'annotation';
  const out: ModelObject = { id, kind, label };

  const opt = <K extends keyof ModelObject>(k: K, v: ModelObject[K]) => {
    if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) out[k] = v;
  };
  opt('meaning', text(r.meaning, 300) as ModelObject['meaning']);
  opt('domain', text(r.domain, 60) as ModelObject['domain']);
  // AN EXPRESSION IS NOT TRUNCATED. `text()` slices to 200, and a polynomial
  // cut mid-term still compiles — to a different function, drawn with no
  // account anywhere. Too long is refused and recorded. And "y = x^2" or
  // "f(x) = x^2" is how people and extractors write a definition; the
  // evaluator wants the right-hand side, so that is what is kept.
  opt('definition', expression(r.definition, 200, `the definition of ${id}`, drop) as ModelObject['definition']);
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
    for (const [k, v] of capped(Object.entries(r.defs as Record<string, unknown>), MODEL_CAPS.keys, `definitions on ${id}`, drop)) {
      const key = text(k, 16);
      const val = expression(v, 300, `${key} on ${id}`, drop);
      if (/^[a-z][a-z0-9]{0,15}$/i.test(key) && val) defs[key] = val;
    }
    if (Object.keys(defs).length) out.defs = defs;
  }

  if (r.over && typeof r.over === 'object' && !Array.isArray(r.over)) {
    const over: Record<string, [number, number]> = {};
    for (const [k, v] of capped(Object.entries(r.over as Record<string, unknown>), MODEL_CAPS.observe, `extents on ${id}`, drop)) {
      const key = text(k, 16);
      if (!/^[a-z][a-z0-9_]{0,15}$/i.test(key) || !Array.isArray(v) || v.length !== 2) {
        drop?.(`an extent on ${id} was not understood and is not in the model: ${String(k).slice(0, 16)} — ${JSON.stringify(v).slice(0, 40)}`);
        continue;
      }
      const a = num(v[0]);
      const b = num(v[1]);
      // A REVERSED OR EMPTY WINDOW IS NOT A WINDOW, and it used to vanish in
      // silence — so `over: {x: [5, -5]}` drew over the engine's own default
      // with nothing anywhere saying the stated range had been thrown away.
      // Reversed is read the way it was meant; empty is refused and recorded.
      if (a === null || b === null) {
        drop?.(`an extent on ${id} is not two numbers and is not in the model: ${key}`);
        continue;
      }
      if (a === b) {
        drop?.(`an extent on ${id} is empty and is not in the model: ${key} from ${a} to ${b}`);
        continue;
      }
      over[key] = a < b ? [a, b] : [b, a];
    }
    if (Object.keys(over).length) out.over = over;
  }

  const deps = Array.isArray(r.depends)
    ? capped(r.depends.map((d) => text(d, 48)).filter((d) => ID.test(d)), MODEL_CAPS.keys, `dependencies on ${id}`, drop)
    : [];
  if (deps.length) out.depends = deps;

  // ── the declaration blocks, sanitised hard ─────────────────────
  //
  // A model can be written by a conversation, so every one of these arrives from
  // outside and every expression in them will be evaluated. Names are bounded
  // and pattern-checked, counts are capped, and anything unrecognised is dropped
  // rather than passed through — the evaluator refuses what it does not know,
  // and this is the layer that stops it ever being asked.
  // 1,200 rather than 300: a hand-written three-body right-hand side is already
  // past 300, and the assemblers generate longer ones still (see the note in
  // lib/logos-math.ts). Bounded, not unbounded.
  const expr = (v: unknown) => text(v, 1200);
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
    for (const raw of capped(sys.states, MODEL_CAPS.statesKept, `states in ${id}`, drop)) {
      if (!raw || typeof raw !== 'object') continue;
      const q = raw as Record<string, unknown>;
      const name = text(q.name, 24);
      // CASE-INSENSITIVE, because the evaluator is. This dedupe compared
      // exactly, so states named `S` and `s` were both kept — and then
      // collapsed into one slot at run time, because system.ts writes each
      // state under both its own spelling and its lowercase one and
      // compileExpr lowercases every token. The integrator solved a DIFFERENT
      // system from the one declared: verified, `S' = -S` with a second state
      // `s` evaluated `-s` instead, so S lost 0.37 over a step where it should
      // have lost 63.2. No refusal, no note.
      if (!nameOk(name) || collidesWith(states.map((x) => x.name), name)) continue;
      // NOT DEFAULTED. See StateVarDecl.init — picking a number here is what
      // turned "nobody said where this starts" into a computed trajectory.
      const init = initOf(q.init);
      states.push({
        name,
        ...(init !== null ? { init } : {}),
        ...(text(q.units, 24) ? { units: text(q.units, 24) } : {}),
        ...(text(q.means, 160) ? { means: text(q.means, 160) } : {}),
      });
    }
    const rhs: Record<string, string> = {};
    if (sys.rhs && typeof sys.rhs === 'object') {
      for (const [k, v] of capped(Object.entries(sys.rhs as Record<string, unknown>), MODEL_CAPS.statesKept, `right-hand sides in ${id}`, drop)) {
        const key = text(k, 24);
        const val = expr(v);
        if (nameOk(key) && val) rhs[key] = val;
      }
    }
    const observe: Record<string, string> = {};
    if (sys.observe && typeof sys.observe === 'object') {
      for (const [k, v] of capped(Object.entries(sys.observe as Record<string, unknown>), MODEL_CAPS.observe, `observations in ${id}`, drop)) {
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
    for (const raw of capped(mech.bodies, MODEL_CAPS.bodies, `bodies in ${id}`, drop)) {
      if (!raw || typeof raw !== 'object') continue;
      const q = raw as Record<string, unknown>;
      const bid = text(q.id, 24);
      if (!nameOk(bid) || bodies.some((b) => b.id === bid)) continue;
      // A BODY IS ITS IDENTITY. An unchosen mass is a question, not a reason to
      // delete the body — readMechanism names it and the model waits.
      const mass = initOf(q.mass);
      const at = num(q.at);
      bodies.push({
        id: bid,
        ...(mass !== null ? { mass } : {}),
        ...(initOf(q.x0) !== null ? { x0: initOf(q.x0) as number | string } : {}),
        ...(initOf(q.v0) !== null ? { v0: initOf(q.v0) as number | string } : {}),
        ...(text(q.label, 60) ? { label: text(q.label, 60) } : {}),
        ...(at !== null ? { at } : {}),
      });
    }
    const links = (v: unknown): LinkDecl[] => {
      if (!Array.isArray(v)) return [];
      const kept: LinkDecl[] = [];
      for (const raw of capped(v, MODEL_CAPS.parts, `connections in ${id}`, drop)) {
        if (!raw || typeof raw !== 'object') continue;
        const q = raw as Record<string, unknown>;
        const lid = text(q.id, 24);
        const pair = Array.isArray(q.between) ? q.between.map((x) => text(x, 24)) : [];
        // A LINK IS ITS TWO ENDS. The value may be missing — see LinkDecl.value
        // for what deleting it used to produce — so only an unusable id or a
        // pair that is not two named ends drops the connection.
        const value = initOf(q.value);
        if (!nameOk(lid) || pair.length !== 2) continue;
        if (!pair.every((p) => p === 'ground' || nameOk(p))) continue;
        kept.push({
          id: lid,
          between: [pair[0], pair[1]],
          ...(value !== null ? { value } : {}),
          ...(text(q.label, 60) ? { label: text(q.label, 60) } : {}),
        });
      }
      return kept;
    };
    const forces: ForceDecl[] = Array.isArray(mech.forces)
      ? (capped(mech.forces, MODEL_CAPS.parts, `forces in ${id}`, drop)
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

  const grav = r.gravity as Record<string, unknown> | undefined;
  if (grav && typeof grav === 'object' && Array.isArray(grav.bodies)) {
    const bodies: GravityBodyDecl[] = [];
    for (const raw2 of capped(grav.bodies, MODEL_CAPS.bodies, `gravitating bodies in ${id}`, drop)) {
      if (!raw2 || typeof raw2 !== 'object') continue;
      const q = raw2 as Record<string, unknown>;
      const bid = text(q.id, 24);
      if (!nameOk(bid) || bodies.some((b) => b.id === bid)) continue;
      const mass = initOf(q.mass);
      if (mass === null) continue;
      const at = (k: string) => initOf(q[k]);
      // Where this body's numbers came from — a source, a dataset, a default, the
      // person. Checked against the one list of origins rather than trusted, and
      // absent rather than guessed: a mass with no stated origin reads as the
      // model's inference, which is what it is.
      const origin = q.from && (q.from as string) in ORIGIN_SAYS ? (q.from as Origin) : null;
      bodies.push({
        id: bid,
        mass,
        ...(at('x') !== null ? { x: at('x') as number | string } : {}),
        ...(at('y') !== null ? { y: at('y') as number | string } : {}),
        ...(at('vx') !== null ? { vx: at('vx') as number | string } : {}),
        ...(at('vy') !== null ? { vy: at('vy') as number | string } : {}),
        ...(text(q.label, 60) ? { label: text(q.label, 60) } : {}),
        ...(origin ? { from: origin } : {}),
      });
    }
    if (bodies.length >= 2) {
      const dt = num(grav.dt);
      const steps = num(grav.steps);
      out.gravity = {
        bodies,
        law: 'newton',
        units: grav.units === 'si' ? 'si' : 'astronomical',
        plane: 'xy',
        ...(initOf(grav.G) !== null ? { G: initOf(grav.G) as number | string } : {}),
        ...(initOf(grav.softening) !== null ? { softening: initOf(grav.softening) as number | string } : {}),
        ...(dt !== null && dt > 0 ? { dt } : {}),
        ...(steps !== null && steps > 0 ? { steps: Math.min(20_000, Math.floor(steps)) } : {}),
      };
    }
  }

  const eqs = r.equations as Record<string, unknown> | undefined;
  if (eqs && typeof eqs === 'object') {
    const unknowns = Array.isArray(eqs.unknowns)
      ? capped(eqs.unknowns.map((u) => text(u, 48)).filter((u) => ID.test(u)), MODEL_CAPS.unknowns, `unknowns in ${id}`, drop)
      : [];
    const relations = Array.isArray(eqs.relations)
      ? capped(eqs.relations.map((e) => expr(e)).filter((e) => e.includes('=')), MODEL_CAPS.solveRelations, `relations in ${id}`, drop)
      : [];
    // BOTH OR NEITHER. Unknowns with nothing relating them, or relations with
    // nothing named to solve for, is not a system — and admitting half of one
    // produces an object that routes somewhere and answers nothing.
    if (unknowns.length && relations.length) {
      // Units are kept only for unknowns that exist, so a stray key cannot
      // quietly create a group of its own in the figure.
      const named = new Set(unknowns);
      const rawUnits = eqs.units as Record<string, unknown> | undefined;
      const units: Record<string, string> = {};
      if (rawUnits && typeof rawUnits === 'object') {
        for (const [k, v] of Object.entries(rawUnits)) {
          const key = text(k, 48);
          const unit = text(v, 24);
          if (named.has(key) && unit) units[key] = unit;
        }
      }
      out.equations = {
        unknowns: [...new Set(unknowns.map((u) => u))],
        relations,
        ...(Object.keys(units).length ? { units } : {}),
        ...(text(eqs.about, 160) ? { about: text(eqs.about, 160) } : {}),
      };
    }
  }

  const est = r.estimation as Record<string, unknown> | undefined;
  if (est && typeof est === 'object') {
    const yCol = text(est.y, 40);
    const xs = Array.isArray(est.x) ? capped(est.x.map((c) => text(c, 40)).filter(Boolean), MODEL_CAPS.regressors, `regressors in ${id}`, drop) : [];

    // ── HOW EACH REGRESSOR IS BUILT ─────────────────────────────────
    //
    // Recursive, and bounded: a term's source may be another term — `lag` of a
    // `diff`, an `interact` of a `log` with an indicator — which is what the
    // digest's chapters 6, 7, 11, 13 and 14 actually ask for. The depth cap is
    // there because this arrives from a language model and a self-referential
    // structure would otherwise spin.
    const TERM_OPS: readonly TermOp[] = [
      'ref', 'pow', 'log', 'exp', 'sqrt', 'inverse', 'interact', 'lag', 'lead', 'diff', 'demean', 'indicator',
    ];
    const termOf = (raw: unknown, depth = 0): TermDecl | null => {
      if (depth > 4 || !raw || typeof raw !== 'object') return null;
      const q = raw as Record<string, unknown>;
      const op = TERM_OPS.includes(q.op as TermOp) ? (q.op as TermOp) : null;
      if (!op) return null;
      const src = (v: unknown): string | TermDecl | null => {
        const nm = text(v, 48);
        if (nm && ID.test(nm)) return nm;
        return termOf(v, depth + 1);
      };
      const of = q.of === undefined ? null : src(q.of);
      const withList = Array.isArray(q.with)
        ? (q.with.map((v) => src(v)).filter(Boolean) as (string | TermDecl)[]).slice(0, 4)
        : [];

      // AN INTERACTION IS ITS OPERANDS, HOWEVER THEY ARE SPELT.
      //
      // `with: ['educ', 'female']` is the canonical form and the only one this
      // accepted — so `{op: 'interact', of: 'educ', with: ['female']}`, which
      // is how anybody writes "educ interacted with female" and how the
      // extractor actually wrote it, was refused. The term vanished, the
      // interaction column became a free input nobody could give a range to,
      // and a fully specified wage model drew an empty frame with
      // "educ_x_female — needs a range" under it.
      //
      // `of` is simply the first operand when it is there. Both spellings mean
      // the same product, and one grammar that accepts both is better than two
      // that disagree about which is real.
      const operands: (string | TermDecl)[] =
        op === 'interact' ? [...(of ? [of] : []), ...withList].slice(0, 4) : withList;
      // A term with nothing to act on is not a term. Refused here rather than
      // admitted and reported empty later.
      if (op === 'interact' ? operands.length < 2 : !of) return null;
      const by = num(q.by);
      const over = text(q.over, 40);
      const level = text(q.level, 40);
      return {
        op,
        // An interaction carries its operands in `with` and nothing in `of`,
        // whichever way they arrived — so everything downstream (basesOf,
        // termExpr, termLabel) reads one shape.
        ...(of && op !== 'interact' ? { of } : {}),
        ...(op === 'interact' ? { with: operands } : withList.length ? { with: withList } : {}),
        ...(by !== null ? { by } : {}),
        ...(over && ID.test(over) ? { over } : {}),
        ...(level ? { level } : {}),
        ...(text(q.label, 60) ? { label: text(q.label, 60) } : {}),
      };
    };
    const terms: Record<string, TermDecl> = {};
    if (est.terms && typeof est.terms === 'object') {
      for (const [k, v] of capped(
        Object.entries(est.terms as Record<string, unknown>),
        MODEL_CAPS.regressors + 4,
        `terms in ${id}`,
        drop
      )) {
        const key = text(k, 48);
        if (!ID.test(key)) {
          drop?.(`a term in ${id} has a name an expression cannot contain: ${String(k).slice(0, 40)}`);
          continue;
        }
        const t = termOf(v);
        // NOT IN SILENCE. A refused term used to disappear with no record, so
        // the column it defined turned into a free input the person was asked
        // to supply a range for — and nothing anywhere said the transformation
        // had been thrown away. Whatever else is wrong, it is now visible.
        if (!t) {
          drop?.(
            `a term in ${id} was not understood and is not in the model: ${key} — ${JSON.stringify(v).slice(0, 80)}`
          );
          continue;
        }
        terms[key] = t;
      }
    }
    const dataKey2 = text(est.data, 48);
    const method = est.method;
    // A SPECIFICATION IS ENOUGH: an outcome and at least one thing explaining
    // it. The data block is kept when it names one and dropped when it does
    // not — the specification then exists unfitted, which is a real state and
    // the one most requests to "build me a model" actually land in. Requiring
    // it here is what used to make an unfitted model inexpressible.
    if (yCol && xs.length) {
      const lags = num(est.lags);
      const KINDS = ['continuous', 'binary', 'categorical', 'count'] as const;
      const kinds: Record<string, (typeof KINDS)[number]> = {};
      const rawKinds = est.kinds as Record<string, unknown> | undefined;
      if (rawKinds && typeof rawKinds === 'object') {
        for (const [k, v] of Object.entries(rawKinds).slice(0, 32)) {
          const key = text(k, 48);
          if (ID.test(key) && KINDS.includes(v as (typeof KINDS)[number])) {
            kinds[key] = v as (typeof KINDS)[number];
          }
        }
      }
      out.estimation = {
        y: yCol,
        x: xs,
        ...(Object.keys(terms).length ? { terms } : {}),
        ...(Object.keys(kinds).length ? { kinds } : {}),
        ...(ID.test(dataKey2) ? { data: dataKey2 } : {}),
        // An unrecognised method is DROPPED, not guessed at: the router then
        // reports the choice as open, which is the honest state.
        ...(method === 'ols' || method === 'ols-fe' || method === 'ols-lag' ? { method } : {}),
        ...(text(est.unit, 40) ? { unit: text(est.unit, 40) } : {}),
        ...(text(est.time, 40) ? { time: text(est.time, 40) } : {}),
        ...(lags !== null && lags > 0 ? { lags: Math.min(12, Math.floor(lags)) } : {}),
        ...(est.robust === true ? { robust: true } : {}),
        ...(est.intercept === false ? { intercept: false } : {}),
        ...(() => {
          const raw = est.coefficients as Record<string, unknown> | undefined;
          if (!raw || typeof raw !== 'object') return {};
          const c: Record<string, string> = {};
          const slots = slotsOf({ x: xs, intercept: est.intercept === false ? false : undefined });
          for (const [k, v] of Object.entries(raw).slice(0, 24)) {
            const key = text(k, 40);
            if (!key) continue;
            // A NUMBER IS A VALUE, AND A VALUE IS A CONTROL. "coefficients":
            // {"educ": 0.08} used to be dropped because 0.08 is not an id — so the
            // one place the prompt invites a person's numbers refused them. It
            // becomes the control for that slot, with the number as its value and
            // the range around it assumed (and said).
            const n = num(v);
            if (n !== null) {
              const slot = slots.find((x) => x.regressor === key)?.slot;
              if (slot === undefined) {
                drop?.(`a coefficient in ${id} names no regressor of it and is not in the model: ${key}`);
                continue;
              }
              const cid = canonicalCoefficientId(id, slot);
              const label = labelForSlot(slot);
              want?.({
                id: cid,
                label,
                value: n,
                ...spanAround(n),
                step: 0.01,
                assumed: 'range',
                means: `${label} = ${n}, as you gave it; the slider's range around it is assumed`,
              });
              c[key] = cid;
              continue;
            }
            const val = text(v, 48);
            if (ID.test(val)) c[key] = val;
            else drop?.(`a coefficient binding in ${id} was not understood and is not in the model: ${key} — ${String(v).slice(0, 40)}`);
          }
          return Object.keys(c).length ? { coefficients: c } : {};
        })(),
        ...(() => {
          const raw = est.over as Record<string, unknown> | undefined;
          if (!raw || typeof raw !== 'object') return {};
          const over: Record<string, [number, number]> = {};
          for (const [k, v] of Object.entries(raw).slice(0, 20)) {
            if (!Array.isArray(v) || v.length !== 2) continue;
            const lo = num(v[0]);
            const hi = num(v[1]);
            if (lo === null || hi === null || !(hi > lo)) continue;
            over[k] = [lo, hi];
          }
          return Object.keys(over).length ? { over } : {};
        })(),
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
    for (const [k, v] of capped(Object.entries(r.meta as Record<string, unknown>), MODEL_CAPS.keys, `metadata on ${id}`, drop)) {
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

/** The slider span around a number nobody gave a range for: wide enough to double it either way, never narrower than ±1. */
export function spanAround(value: number): { min: number; max: number } {
  const half = Math.max(Math.abs(value) * 2, 1);
  return { min: value - half, max: value + half };
}

export function sanitizeParam(raw: unknown, drop?: (what: string) => void): ModelParam | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 48);
  if (!ID.test(id)) {
    drop?.(`a control had no usable id and is not in the model: ${String(r.id ?? r.label ?? '?').slice(0, 40)}`);
    return null;
  }
  const given = num(r.value);
  let min = num(r.min);
  let max = num(r.max);
  const ranged = min !== null && max !== null && max > min;
  // A CONTROL WITH A VALUE AND NO RANGE WAS THROWN AWAY, SILENTLY. The
  // extractor writes {"id": "b1", "value": 0.08} often enough that this was
  // the commonest way a stated coefficient went missing — and with it the
  // binding, the surface, the whole picture. The value is the thing somebody
  // chose; the span of a slider is not a modelling decision, and it is said
  // (`assumed: 'range'`).
  let assumed: ModelParam['assumed'] | undefined =
    r.assumed === 'value' || r.assumed === 'range' ? r.assumed : undefined;
  let value: number;
  if (given !== null && !ranged) {
    ({ min, max } = spanAround(given));
    value = given;
    assumed = assumed ?? 'range';
  } else if (given === null && ranged) {
    // A range and no value: it stands in the middle until somebody sets it.
    value = (min! + max!) / 2;
    assumed = 'value';
  } else if (given === null && !ranged) {
    // A name alone. Still a control — a placeholder at 1, wide, and said.
    value = 1;
    ({ min, max } = spanAround(10));
    assumed = 'value';
  } else {
    value = given!;
  }
  const out: ModelParam = {
    id,
    label: text(r.label, 48) || id,
    value: Math.min(max!, Math.max(min!, value)),
    min: min!,
    max: max!,
  };
  if (assumed) out.assumed = assumed;
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
  // A MODEL's id, not a quantity's: it never reaches an evaluator, and
  // `linear-model` and `photon-path` are real stored ids.
  if (!MODEL_ID.test(id) || !title) return null;

  // WHAT THIS SANITISER REMOVED, CARRIED ON THE MODEL.
  //
  // `map(sanitizeObject)` was also passing the array index as the second
  // argument, which was harmless only for as long as sanitizeObject took one
  // parameter — the compiler caught it the moment it took two. Written out, so
  // it cannot quietly bind something else again.
  const notes: string[] = [];
  const drop = (what: string) => {
    if (notes.length < 12 && !notes.includes(what)) notes.push(what);
  };
  // A `dropped` record already on the input survives, because a model is
  // re-sanitised on every save and the second pass has nothing left to trim —
  // so recomputing it would erase the account of the first.
  if (Array.isArray(r.dropped)) {
    for (const d of r.dropped) {
      const t = text(d, 160);
      if (t) drop(t);
    }
  }

  // Controls a declaration implies — a numeric coefficient — arrive here from
  // sanitizeObject and join the list, after the ones the author wrote.
  const implied: ModelParam[] = [];
  const objects = Array.isArray(r.objects)
    ? capped(
        r.objects.map((o) => sanitizeObject(o, drop, (p) => implied.push(p))).filter(Boolean) as ModelObject[],
        MODEL_CAPS.objects,
        'objects',
        drop
      )
    : [];
  const written = Array.isArray(r.params)
    ? (r.params.map((p) => sanitizeParam(p, drop)).filter(Boolean) as ModelParam[])
    : [];
  // ONE CONTROL PER NAME, and names are case-insensitive to the evaluator:
  // `k` and `K` are one symbol in a scope, so the later one silently overwrote
  // the earlier one's value. The first is kept and the rest are recorded.
  const seenParam = new Set<string>();
  const unique = [...written, ...implied].filter((p) => {
    const key = p.id.toLowerCase();
    if (seenParam.has(key)) {
      drop?.(`a second control named ${p.id} is not in the model — ${key} is already a control`);
      return false;
    }
    seenParam.add(key);
    return true;
  });
  const params = capped(unique, MODEL_CAPS.params, 'controls', drop);
  // ── A COEFFICIENT NOTHING BINDS GETS A PLACEHOLDER CONTROL ──────
  //
  // Here, on the stored model, so the slider persists, an edit to it persists,
  // and the expander binds it through the ordinary canonical-id path. A second
  // sanitise finds the control already present and adds nothing. See
  // lib/model/binding.ts for the rule and the reason.
  for (const p of placeholdersFor({ objects, params })) {
    if (params.length >= MODEL_CAPS.params) {
      drop?.(`${p.label} has no value and no room is left for a placeholder control`);
      continue;
    }
    params.push(p);
  }

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

  const model: Model = { id, title, objects, params, ...(notes.length ? { dropped: notes } : {}) };
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
      // COLUMNS ARE ROWS. Compacting each column on its own — dropping its
      // nulls — shifted every later value against the other columns, so one
      // missing x paired 4 with 30, and the fit was wrong with decimals. A row
      // with a hole anywhere is dropped from every column, and counted.
      const table = (raw: Record<string, unknown>): { columns: Record<string, number[]>; dropped: number } | null => {
        const cols: Record<string, (number | null)[]> = {};
        for (const [name, v] of Object.entries(raw).slice(0, 24)) {
          const key = text(name, 40);
          if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key) || !Array.isArray(v)) continue;
          cols[key] = v.slice(0, 20_000).map(num);
        }
        const keys = Object.keys(cols);
        if (!keys.length) return null;
        const length = Math.min(...keys.map((k) => cols[k].length));
        const whole = Array.from({ length }, (_, i) => i).filter((i) => keys.every((k) => cols[k][i] !== null));
        if (!whole.length) return null;
        const columns: Record<string, number[]> = {};
        for (const k of keys) columns[k] = whole.map((i) => cols[k][i] as number);
        return { columns, dropped: length - whole.length };
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
        const got = table(b.columns as Record<string, unknown>);
        if (got) {
          if (got.dropped) drop?.(`${got.dropped} row${got.dropped === 1 ? '' : 's'} of ${k} had a missing value and ${got.dropped === 1 ? 'is' : 'are'} left out of every column`);
          block.columns = got.columns;
        }
      }
      // THE INDEX COLUMNS, which make an observation locatable rather than
      // merely present. Strings are kept, because an entity is usually a name.
      // Truncated to the same length as the data columns, for the same reason:
      // a lag taken along an index that is longer than the data pairs the wrong
      // rows, and a wrong pairing here is a wrong answer with decimals.
      if (b.index && typeof b.index === 'object' && !Array.isArray(b.index)) {
        const index: Record<string, (number | string)[]> = {};
        const rows = block.columns ? Object.values(block.columns)[0]?.length : undefined;
        for (const [name, v] of capped(
          Object.entries(b.index as Record<string, unknown>),
          6,
          `index dimensions in ${k}`,
          drop
        )) {
          const key = text(name, 40);
          if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key) || !Array.isArray(v)) continue;
          const col = v
            .map((q) => (typeof q === 'number' && Number.isFinite(q) ? q : text(q, 40)))
            .filter((q) => q !== '')
            .slice(0, 20_000);
          if (col.length) index[key] = rows === undefined ? col : col.slice(0, rows);
        }
        if (Object.keys(index).length) block.index = index;
      }
      for (const key of ['xs', 'ys', 't', 'v'] as const) if (!block[key]) delete block[key];
      if (Object.keys(block).length) blocks[k] = block;
    }
    if (Object.keys(blocks).length) model.data = blocks;
  }

  // THE LAST CHANGE SURVIVES A ROUND TRIP. It was dropped here, so after any
  // save the inspector's "Changed:" line vanished and nothing could tell a
  // revision what moved. Bounded like everything else.
  if (r.lastChange && typeof r.lastChange === 'object') {
    const lc = r.lastChange as Record<string, unknown>;
    const what = text(lc.what, 80);
    const scalar = (v: unknown): number | string | boolean | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? v : typeof v === 'string' ? v.slice(0, 80) : undefined;
    if (what) {
      model.lastChange = {
        what,
        ...(scalar(lc.from) !== undefined ? { from: scalar(lc.from) } : {}),
        ...(scalar(lc.to) !== undefined ? { to: scalar(lc.to) } : {}),
        affected: Array.isArray(lc.affected) ? lc.affected.map((a) => text(a, 48)).filter((a) => ID.test(a)).slice(0, 64) : [],
        at: typeof lc.at === 'number' && Number.isFinite(lc.at) ? lc.at : 0,
      };
    }
  }
  const sel = text(r.selected, 48);
  if (sel && ID.test(sel)) model.selected = sel;

  // A VIEW ID IS NOT AN EXPRESSION ID. `viewsFor` composes ids as
  // `family:object` and `family:data:key`, so the one grammar for anything an
  // evaluator sees would reject every one of them. This is the grammar for THAT
  // — segments of the ordinary id shape joined by colons — and it is checked
  // rather than trusted, because it arrives from outside like everything else.
  const vw = text(r.view, 96);
  if (vw && VIEW_ID.test(vw)) model.view = vw;

  // The cursor for each free input, clamped to nothing here: the domain that
  // bounds it lives on the specification, and re-clamping against a stale copy
  // is how two truths about one range come to disagree.
  if (r.at && typeof r.at === 'object' && !Array.isArray(r.at)) {
    const at: Record<string, number> = {};
    for (const [k, v] of capped(Object.entries(r.at as Record<string, unknown>), MODEL_CAPS.params, 'input cursors', drop)) {
      const key = text(k, 48);
      const value = num(v);
      if (ID.test(key) && value !== null) at[key] = value;
    }
    if (Object.keys(at).length) model.at = at;
  }

  const v = num(r.version);
  if (v !== null) model.version = Math.max(0, Math.floor(v));
  // THE ACCOUNT OF WHAT WAS CUT, ATTACHED LAST. `dropped` was written onto the
  // model when the objects and controls were assembled — before the data,
  // the time and the rest were read — so a row left out of a data block for a
  // missing value was counted and never said.
  if (notes.length) model.dropped = [...notes];
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
 * Everything a change to `ids` reaches — RE-EXPORTED FROM ./deps.
 *
 * It lived here and walked `depends` plus three relation types, and it did not
 * work: `depends` is unvalidated language-model output and is absent from
 * essentially every real proposal, and the three relations it followed were
 * not the three the expanders emit. Executed against a standard SIR model,
 * changing the infection rate recomputed nothing at all.
 *
 * lib/model/deps.ts derives the graph from the expressions instead — the one
 * place that cannot drift, because it is what will be evaluated. Re-exported
 * from here so every existing caller keeps its import.
 */
export { affectedBy } from './deps';
// …and imported for this module's own use, since two helpers below walk it.
import { affectedBy } from './deps';

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
  return worstFidelity(objects.map((o) => o.fidelity ?? 'conceptual'));
}

/**
 * The most modest of a set of fidelities.
 *
 * Separated from `overallFidelity` because the honest input is often not what
 * the objects CLAIM but what the compiler EARNED — see spec.ts, where the
 * view's label is the worst of what actually drew rather than the worst of what
 * was declared. A model whose author wrote no fidelity at all is not thereby
 * conceptual, and calling it that put "drawn to make the idea legible, not
 * computed" under a figure whose every mark came out of a solver.
 */
export function worstFidelity(fidelities: readonly Fidelity[]): Fidelity {
  const rank: Fidelity[] = [
    'conceptual', 'data-derived', 'model-derived', 'simulated', 'numerically-computed',
  ];
  let worst: Fidelity | null = null;
  for (const f of fidelities) {
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
    // A placeholder somebody moved is theirs now; an assumed RANGE stays
    // assumed, because moving the handle says nothing about the span.
    params: model.params.map((q) => {
      if (q.id !== id) return q;
      const { assumed, ...rest } = q;
      return assumed === 'value' ? { ...rest, value: next } : { ...q, value: next };
    }),
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
