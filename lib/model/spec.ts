// lib/model/spec.ts
//
// THE INSTRUCTION A RENDERER CAN CARRY OUT, and the decision about which
// picture to draw at all.
//
// A spec is the middle of the sandwich: below it the model knows what things
// mean, above it the renderer knows how to draw a mesh. Neither knows the
// other. That is what lets the same model have an equation view, a 2D graph, a
// 3D surface, a cross-section and a structural map without any of them being a
// separate feature — they are five specs off one model, and a manipulation
// updates the model, not the pictures.
//
// THE PART THAT IS A JUDGEMENT AND NOT A MECHANISM: chooseRepresentation.
// 3D has to earn its existence. y = x² is a 2D graph and drawing it in a
// perspective box makes it harder to read, not more impressive; a proof
// dependency is a tree; a single-maturity volatility smile is a curve. So the
// chooser returns its REASON along with its answer, the reason is shown, and
// anyone can see when it chose badly.

import { lengthUnit, unitOfSolid } from './solid';
import { extentOf, pointsOf, type P3, type Primitive } from './primitives';
import { buildModel, buildObject, figureOf, type Built } from './compile';
import { viewsFor, type ViewFamily } from './views';
import { unpack } from './unpack';
import { runFor, seriesOf } from './system';
import { shownSpecies } from './pde';
import { byKind, overallFidelity, worstFidelity, type Fidelity, type Model, type ModelObject } from './schema';
import { unitOf, unitOfObject, withUnit } from './units';
import { primaryView } from './views';

// ── coordinates ─────────────────────────────────────────────────────

/**
 * The system a model's numbers are in.
 *
 * The renderer only ever draws Cartesian; this says how to get there. A polar
 * model keeps its own (r, θ) — which is what its equations and its readouts
 * use — and is converted once, at the edge, so nothing in the model has to be
 * rewritten to be drawn and nothing in the drawing has to know.
 */
export type CoordinateSystem =
  | 'cartesian'
  | 'polar'
  | 'cylindrical'
  | 'spherical'
  | 'geographic'
  | 'parametric'
  /** the model's own units, with no spatial meaning at all */
  | 'model';

/**
 * Into Cartesian, for drawing.
 *
 * `geographic` is longitude/latitude/elevation onto a local tangent plane, not
 * a globe: at the scale a figure covers, a plate carrée with the longitude
 * scaled by cos(latitude) is the honest cheap projection, and pretending
 * otherwise would put a projection error into every measurement read off the
 * picture. A model that needs a real projection says so and supplies one.
 */
export function toCartesian(p: P3, system: CoordinateSystem, origin?: P3): P3 {
  switch (system) {
    case 'polar': {
      // (r, θ, z)
      return { x: p.x * Math.cos(p.y), y: p.x * Math.sin(p.y), z: p.z };
    }
    case 'cylindrical': {
      // (ρ, φ, z)
      return { x: p.x * Math.cos(p.y), y: p.x * Math.sin(p.y), z: p.z };
    }
    case 'spherical': {
      // (r, θ polar from +z, φ azimuth)
      const s = Math.sin(p.y);
      return { x: p.x * s * Math.cos(p.z), y: p.x * s * Math.sin(p.z), z: p.x * Math.cos(p.y) };
    }
    case 'geographic': {
      // (lon°, lat°, elevation) → local tangent plane in degrees of longitude
      const lat0 = origin?.y ?? p.y;
      return { x: p.x * Math.cos((lat0 * Math.PI) / 180), y: p.y, z: p.z };
    }
    default:
      return p;
  }
}

export function mapPrimitive(prim: Primitive, system: CoordinateSystem, origin?: P3): Primitive {
  if (system === 'cartesian' || system === 'model' || system === 'parametric') return prim;
  const f = (p: P3) => toCartesian(p, system, origin);
  switch (prim.p) {
    case 'points':
      return { ...prim, at: prim.at.map(f) };
    case 'polyline':
    case 'region':
      return { ...prim, at: prim.at.map(f) };
    case 'vectors':
      return { ...prim, at: prim.at.map(f) };
    case 'label':
      return { ...prim, at: f(prim.at) };
    case 'mesh':
      return { ...prim, rows: prim.rows.map((row) => row.map((v) => (v ? f(v) : null))) };
    case 'axes':
      return prim;
  }
}

// ── the spec ────────────────────────────────────────────────────────

export interface SpecCamera {
  yaw: number;
  pitch: number;
  dist: number;
}

export interface SpecAnnotation {
  at?: P3;
  text: string;
  of?: string;
}

/**
 * One drawable view of one model.
 *
 * `of` and `version` are what make two specs comparable: same model, two
 * settings. A spec that does not know which model it is a view of cannot be
 * compared, cannot be updated locally, and is a picture again.
 */
export interface VisualizationSpec {
  id: string;
  of: string;
  version: number;
  title: string;
  dimensionality: 2 | 3;
  coordinateSystem: CoordinateSystem;
  primitives: Primitive[];
  /** the extent the box is drawn over, in model units */
  box: { x: [number, number]; y: [number, number]; z: [number, number] };
  axisNames: [string, string, string];
  layers: { id: string; label: string; on: boolean }[];
  camera?: SpecCamera;
  time?: { t: number; min: number; max: number; playing: boolean; rate: number };
  annotations: SpecAnnotation[];
  /** what the engine did per object: the honest account of this picture */
  notes: { of: string; note: string; fidelity: Fidelity; problem?: string }[];
  /** the modest one of everything in it */
  fidelity: Fidelity;
  /** true when this is a projection or a slice rather than the whole thing */
  partial?: string;
  /** whether the box was made cubic; see Model.aspect */
  aspect: 'equal' | 'fit';
  /**
   * Flat, drawn TO SCALE: one unit across is one unit up on the page. A map of
   * a plane — a field over x and y — is a picture of a place, and stretching
   * it to the frame would draw a square as a strip.
   */
  toScale?: boolean;
  /**
   * Secondary views OF THE SAME COMPUTED STATE.
   *
   * THE POINT IS THE WORD 'same'. A mechanism beside a displacement-against-time
   * plot beside an energy plot is one model shown three ways, and the only way
   * that is true rather than decorative is if all three come from ONE run — so
   * they are built here, from the run the main view drew, rather than by
   * integrating again per panel. Change a parameter and all of them move,
   * because there is one computation behind them.
   *
   * Each panel says which object it belongs to, so selecting it selects that
   * object and the conversation knows what was selected.
   */
  panels?: SpecPanel[];
}

export interface SpecPanel {
  id: string;
  label: string;
  /** the model object this is a view of */
  of: string;
  /** the state or observable this is a series of, by its canonical name */
  state: string;
  /** axis names, for the panel's own labels — in units, where the model says */
  x: string;
  y: string;
  /** the series, in the panel's own units */
  at: { x: number; y: number }[];
  /** extent, so the renderer does not have to scan twice */
  range: { x: [number, number]; y: [number, number] };
  fidelity: Fidelity;
  /** what it is, in one line */
  note: string;
}

const DEFAULT_BOX: VisualizationSpec['box'] = { x: [-1, 1], y: [-1, 1], z: [-1, 1] };

/**
 * Whether one unit along each axis is the same thing.
 *
 * A graph's height is a quantity, not a length, so it is stretched to fill
 * the box — that is what makes a shallow surface readable. Geometry is not:
 * a torus whose z was stretched fourfold is a barrel, and a reader has no way
 * to know the drawing did that.
 */
export function aspectOf(model: Model): 'equal' | 'fit' {
  if (model.aspect) return model.aspect;
  // A SOLID IS A LENGTH IN EVERY DIRECTION. A cube drawn in a box stretched to
  // fit is a slab, and nothing about the drawing would say so.
  if (model.objects.some((o) => o.kind === 'solid' && !!o.solid)) return 'equal';
  // A GRAPH IS A GRAPH WHICHEVER WAY IT SAYS SO.
  //
  // This read `definition` only, and a response surface states its mathematics in
  // `defs.z` — so z = f(education, experience) was treated as GEOMETRY and its box
  // was made cubic. Measured: a mesh spanning 6 units in education and 22 in wage
  // came back in a box ±11.99 on every axis, and the surface rendered as a narrow
  // vertical sheet occupying a quarter of it. Equal scales are for pictures where
  // a length is a length; education, experience and currency are three different
  // quantities and forcing them to one scale says nothing true about any of them.
  const graph = model.objects.some(
    (o) =>
      ((o.kind === 'surface' || o.kind === 'volume') && (!!o.definition || !!o.defs?.z) && !o.defs?.px) ||
      // y = f(x) IS A GRAPH TOO. A curve stated as an expression was treated
      // as geometry, so its box was made square about the larger extent:
      // y = 2x + 3 over five units of x sat in the middle half of its frame,
      // and exp(x) over [0, 100] was a box 10⁴³ wide with the curve invisible
      // against its left edge. A parametric curve (px, py) is a shape and keeps
      // equal scales.
      ((o.kind === 'curve' || o.kind === 'line' || o.kind === 'ray') &&
        (!!o.definition || !!o.defs?.f || !!o.defs?.z) &&
        !o.defs?.px)
  );
  // TWO DIFFERENT KINDS OF QUANTITY ON THE TWO AXES IS NOT A GEOMETRY. An
  // equation system's axes are groups of unknowns — quantity against price,
  // current against voltage — and forcing them to the same scale makes one of
  // them unreadable while saying nothing true about either. Equal scales are for
  // pictures where a length is a length.
  const relations = model.objects.some((o) => !!o.equations);
  // a field along a line is drawn as position against time; across a plane it is a map, and a length is a length
  const history = model.objects.some((o) => (!!o.pde && !o.pde.y) || !!o.map);
  return graph || relations || history ? 'fit' : 'equal';
}

/** The box made cubic about its own centre, for geometry. */
export function equalise(box: VisualizationSpec['box']): VisualizationSpec['box'] {
  const span = Math.max(box.x[1] - box.x[0], box.y[1] - box.y[0], box.z[1] - box.z[0]);
  const half = span / 2;
  const mid = (r: [number, number]): [number, number] => {
    const c = (r[0] + r[1]) / 2;
    return [c - half, c + half];
  };
  return { x: mid(box.x), y: mid(box.y), z: mid(box.z) };
}

/** The box that holds everything drawn, with a little air. */
export function fitBox(primitives: readonly Primitive[]): VisualizationSpec['box'] {
  const pts: P3[] = [];
  for (const prim of primitives) pts.push(...pointsOf(prim));
  const e = extentOf(pts);
  if (!e) return DEFAULT_BOX;
  const pad = (r: [number, number]): [number, number] => {
    const m = (r[1] - r[0]) * 0.04;
    return [r[0] - m, r[1] + m];
  };
  return { x: pad(e.x), y: pad(e.y), z: pad(e.z) };
}

/**
 * Build the spec for a model, as a whole or for one view of it.
 *
 * `only` passes straight through to the compiler: a spec rebuilt after one
 * control moved recompiles the objects that moved and reuses the rest, which
 * is the difference between a manipulation and a regeneration.
 */
export function buildSpec(
  modelIn: Model,
  opts?: {
    view?: 'auto' | '2d' | '3d';
    coordinateSystem?: CoordinateSystem;
    only?: readonly string[];
    keep?: readonly Built[];
    detail?: number;
    partial?: string;
  }
): VisualizationSpec {
  // Mechanisms become objects first: the representation choice, the notes and the
  // box all have to see the bodies and springs, not the declaration they came
  // from. Idempotent, so building twice adds nothing.
  const model = unpack(modelIn);
  const fresh = buildModel(model, { only: opts?.only, detail: opts?.detail });
  const built: Built[] = opts?.only && opts?.keep
    ? [...opts.keep.filter((b) => !opts.only!.includes(b.of)), ...fresh]
    : fresh;

  const system = opts?.coordinateSystem ?? 'cartesian';
  const primitives = built
    .flatMap((b) => b.primitives)
    .map((prim) => mapPrimitive(prim, system));

  const chosen = opts?.view && opts.view !== 'auto' ? opts.view : chooseRepresentation(model).dimensionality;
  const dimensionality: 2 | 3 = chosen === '3d' || chosen === 3 ? 3 : 2;

  const layers = (model.layers ?? []).map((l) => ({ id: l.id, label: l.label, on: l.on !== false }));
  const notes = built.map((b) => ({
    of: b.of,
    note: b.note,
    fidelity: b.fidelity,
    ...(b.problem ? { problem: b.problem } : {}),
  }));

  const drew = built.filter((b) => b.primitives.length);
  const objects = model.objects.filter((o) => drew.some((b) => b.of === o.id));
  const aspect = aspectOf(model);
  const box = fitBox(primitives);
  return {
    id: `${model.id}-v${model.version ?? 0}`,
    of: model.id,
    version: model.version ?? 0,
    title: model.title,
    dimensionality,
    coordinateSystem: system,
    primitives,
    box: aspect === 'equal' ? equalise(box) : box,
    aspect,
    ...(dimensionality === 2 && model.objects.some((o) => !!o.pde?.y && (!opts?.only || opts.only.includes(o.id))) ? { toScale: true } : {}),
    axisNames: axisNamesFor(model),
    layers,
    ...(model.time
      ? {
          time: {
            t: model.time.t,
            min: model.time.min,
            max: model.time.max,
            playing: !!model.time.playing,
            rate: model.time.rate ?? 1,
          },
        }
      : {}),
    annotations: annotationsFor(model),
    notes,
    // The label the view carries is the modest one of everything IN it: a
    // picture is only as computed as its least computed part.
    //
    // EARNED, NOT DECLARED. This read each object's own `fidelity` field, which
    // most authors and most expanders never set — so a figure whose every mark
    // came out of a solver was captioned "drawn to make the idea legible, not
    // computed", which is the exact sentence that made a correct computation
    // look like a decoration. The compiler already returns what it actually did
    // for each object (Built.fidelity, assigned by the code path taken), and
    // that is what the caption is now made of. Objects that drew nothing do not
    // vote: their absence is reported as a `problem`, not as a fidelity.
    fidelity: drew.length
      ? worstFidelity(drew.map((b) => b.fidelity))
      : overallFidelity(objects.length ? objects : model.objects),
    ...(opts?.partial ? { partial: opts.partial } : {}),
    // Secondary views of the same computed state. Absent when there is no run,
    // rather than present and empty.
    ...(() => {
      const panels = buildPanels(model);
      return panels.length ? { panels } : {};
    })(),
  };
}

function axisNamesFor(model: Model): [string, string, string] {
  const axes = byKind(model, 'axis');
  const pick = (n: number, fallback: string) => axes[n]?.label ?? fallback;
  // AN EQUATION SYSTEM NAMES ITS OWN AXES, and it is the only thing that can:
  // the axes are groups of unknowns the algebra put together, so `x` and `y`
  // would be labels for something the model has better names for. Explicit
  // `axis` objects still win, because those are somebody's decision.
  if (!axes.length) {
    const fig = figureOf(model);
    if (fig) {
      const name = (g: { label: string; units?: string }) => (g.units ? `${g.label} (${g.units})` : g.label);
      return [name(fig.h), name(fig.v), pick(2, 'z')];
    }
    // THE DRAWN OBJECT NAMES ITS OWN AXES. A relationship evaluated over
    // named inputs — a response over educ and female, a curve over price —
    // is drawn over those names and in those units, read from the model
    // (lib/model/units.ts). A shape sampled over a parameter (a torus over s
    // and u) has coordinate axes, and keeps the letters.
    const o = drawnObject(model);
    // A SOLID'S AXES ARE LENGTHS IN ITS OWN UNIT: x (cm), y (cm), z (cm).
    if (o?.kind === 'solid') {
      const u = model.objects.map((x) => (x.kind === 'solid' ? unitOfSolid(model, x) : null)).find(Boolean) ?? null;
      return [withUnit('x', u ?? undefined), withUnit('y', u ?? undefined), withUnit('z', u ?? undefined)];
    }
    // A PARAMETRIC SHAPE drawn in the model's own declared unit of length.
    if (o && o.defs?.px && o.defs?.py && o.defs?.pz && !byKind(model, 'axis').length) {
      const u = lengthUnit(model.units?.x) ?? lengthUnit(model.units?.length) ?? null;
      if (u) return [withUnit('x', u), withUnit('y', u), withUnit('z', u)];
    }
    if (o?.map) {
      const st = o.map.states;
      const named = (s: (typeof st)[number]) => withUnit(s.name, s.units ?? unitOf(model, s.name));
      return st.length === 1 ? ['n', named(st[0]), 'z'] : [named(st[0]), named(st[1]), st[2] ? named(st[2]) : 'z'];
    }
    if (o?.pde) {
      const sp = o.pde.species[shownSpecies(o)];
      const value = withUnit(sp?.name ?? 'u', sp?.units ?? unitOf(model, sp?.name ?? ''));
      return o.pde.y
        ? [withUnit('x', unitOf(model, 'x')), withUnit('y', unitOf(model, 'y')), value]
        : [withUnit('x', unitOf(model, 'x')), withUnit('t', model.time?.units ?? unitOf(model, 't')), value];
    }
    if (o) {
      const graph = !!(o.defs?.z || o.defs?.f || o.definition || o.meta?.axes);
      if (graph) {
        const names =
          typeof o.meta?.axes === 'string'
            ? String(o.meta.axes).split(',').map((n) => n.trim()).filter(Boolean)
            : Object.keys(o.over ?? {});
        const named = (n: string) => withUnit(n, unitOf(model, n));
        const outcome = typeof o.meta?.outcome === 'string' ? String(o.meta.outcome) : null;
        const ownUnits = unitOfObject(model, o);
        if (o.kind === 'surface' || o.kind === 'volume') {
          return [named(names[0] ?? 'x'), named(names[1] ?? 'y'), outcome ? withUnit(outcome, ownUnits) : withUnit('z', ownUnits)];
        }
        if (o.kind === 'curve' || o.kind === 'line' || o.kind === 'ray') {
          return [named(names[0] ?? 'x'), outcome ? withUnit(outcome, ownUnits) : withUnit('y', ownUnits), 'z'];
        }
      }
    }
  }
  return [pick(0, 'x'), pick(1, 'y'), pick(2, 'z')];
}

/** The object the primary view is of, when there is one. */
function drawnObject(model: Model): ModelObject | null {
  const v = primaryView(model);
  if (!v?.of) return null;
  return model.objects.find((o) => o.id === v.of) ?? null;
}

function annotationsFor(model: Model): SpecAnnotation[] {
  return byKind(model, 'annotation')
    .slice(0, 12)
    .map((o) => ({ text: o.label, of: o.id }));
}

// ── which picture, and why ──────────────────────────────────────────

export type Representation =
  | 'text'
  /** parts placed by computed state: bodies, springs, dampers, forces */
  | 'mechanism'
  | 'equation'
  | 'table'
  | 'plot2d'
  | 'surface3d'
  | 'field'
  | 'graph'
  | 'timeline'
  | 'map'
  | 'simulation';

export interface Choice {
  kind: Representation;
  dimensionality: 2 | 3;
  /** the sentence a reader could argue with */
  why: string;
  /** what else would have worked, so the choice is visibly a choice */
  alternatives: Representation[];
}

/**
 * What to draw, given what the model contains.
 *
 * THE RULE THIS ENCODES: the representation that makes the relevant structure
 * easiest to perceive and manipulate — not the most impressive one. So three
 * dimensions are chosen when a quantity genuinely varies over two others, and
 * refused when it does not, however good the 3D would look.
 *
 * It is a heuristic over the model's own contents and it says so. A caller may
 * override it — "show this in 3D" is a legitimate request — and the override
 * is remembered on the spec rather than argued with.
 */
/** A view family, in the older vocabulary the frame speaks. */
const AS_REPRESENTATION: Partial<Record<ViewFamily, Representation>> = {
  surface: 'surface3d',
  curve: 'plot2d',
  contour: 'plot2d',
  slice: 'plot2d',
  derivative: 'plot2d',
  residual: 'plot2d',
  interval: 'plot2d',
  field: 'field',
  trajectory: 'simulation',
  phase: 'plot2d',
  bifurcation: 'plot2d',
  section: 'plot2d',
  timeline: 'timeline',
  animation: 'simulation',
  mechanism: 'mechanism',
  network: 'graph',
  structure: 'graph',
  matrix: 'table',
  table: 'table',
  equation: 'equation',
  distribution: 'plot2d',
  diagnostic: 'table',
  sensitivity: 'table',
  text: 'text',
};

export function chooseRepresentation(model: Model): Choice {
  // ── THE REGISTRY DECIDES, BECAUSE IT KNOWS WHAT CAN ACTUALLY BE DRAWN ──
  //
  // THIS FUNCTION AND `primaryView` WERE TWO ANSWERS TO ONE QUESTION, and they
  // disagreed exactly where it mattered. A log-wage relationship whose second
  // input had no range: `viewsFor` correctly offered only structure, sensitivity,
  // equation and text — the surface refuses, because a surface over a quantity
  // with no range is not a thing — while this function looked at OBJECT KINDS,
  // saw a `surface`, and returned `surface3d` in three dimensions.
  //
  // The result was an EMPTY 3D CARTESIAN CUBE. The same failure this whole line
  // of work began with, arrived at from the opposite direction: not because
  // nothing could compute, but because the frame was chosen by what the model
  // CONTAINS rather than by what it can SHOW.
  //
  // So the registry chooses. It is derived from structure AND from the operation
  // planner, which is the difference. The kind-based rules below remain as the
  // floor — they still decide between several drawable views, and they still
  // carry the sentences a reader can argue with.
  const drawable = viewsFor(model).filter((v) => !v.notDrawnYet);
  const nothingDraws = !drawable.some((v) => v.marks);
  if (nothingDraws) {
    const best = drawable.find((v) => v.primary) ?? drawable[0];
    const family = best?.family ?? 'text';
    return {
      kind: AS_REPRESENTATION[family] ?? 'text',
      // NEVER THREE DIMENSIONS FOR SOMETHING WITH NO EXTENT. An empty box is the
      // most confident thing this engine can draw and the least honest.
      dimensionality: 2,
      why:
        best?.because ??
        'nothing in this model can be drawn yet, so the statement of it is what there is to look at',
      alternatives: drawable.slice(0, 3).map((v) => AS_REPRESENTATION[v.family] ?? 'text'),
    };
  }

  const has = (...k: Parameters<typeof byKind>[1][]) => byKind(model, ...k).length > 0;
  const count = (k: Parameters<typeof byKind>[1]) => byKind(model, k).length;

  // A FIELD IS SEEN FLAT FIRST: along a line, the whole history at once —
  // position across, time up, the value as colour; across a plane, the plane at
  // the clock's time. Either can be turned into its surface; the plane is what
  // is read.
  // A MAP IS SEEN IN THE PLANE: one state against its step number, or two against each other.
  const stepped = model.objects.find((o) => !!o.map);
  if (stepped) {
    const one = stepped.map!.states.length === 1;
    return {
      kind: 'simulation',
      dimensionality: 2,
      why: one ? 'one quantity, stepped: its value against the step number shows the whole orbit' : 'a map of several states: the states it visits, in its first two, are its attractor',
      alternatives: ['plot2d'],
    };
  }

  const field = model.objects.find((o) => !!o.pde);
  if (field) {
    const line = !field.pde!.y;
    return {
      kind: 'field',
      dimensionality: 2,
      why: line
        ? 'a quantity along a line, through time: position across, time up and the value as colour shows the whole run at once'
        : 'a quantity over a plane: the plane, coloured by the value, at the clock’s time',
      alternatives: ['surface3d', 'timeline'],
    };
  }

  // A graph of relationships is a graph. Putting a dependency structure in a
  // perspective box makes the edges cross more, not less.
  if (has('graph') || count('node') > 2) {
    return {
      kind: 'graph',
      dimensionality: 2,
      why: 'the structure is which things connect to which, and that reads better as a graph than as geometry',
      alternatives: ['table', 'text'],
    };
  }

  // Geography is a map, in the coordinates it was measured in.
  if (model.objects.some((o) => o.meta?.coordinates === 'geographic')) {
    return {
      kind: 'map',
      dimensionality: has('surface') ? 3 : 2,
      why: 'the quantities are located on the Earth, so the map is the coordinate system rather than a decoration',
      alternatives: ['plot2d', 'table'],
    };
  }

  // A SYSTEM OF EQUATIONS IS READ IN THE PLANE. Several unknowns related to
  // each other is not several spatial dimensions — the relationships are what
  // there is to see, and each one is a line or a curve in whichever two
  // quantities the person is investigating. Three dimensions add a third axis
  // nothing varies along.
  //
  // This is the "the number of variables does not determine the number of
  // visual dimensions" rule, applied by the structure rather than by a count.
  //
  // IT YIELDS TO SOMETHING GENUINELY THREE-DIMENSIONAL, and only to that: a
  // surface that will actually evaluate is one quantity varying over two others,
  // which is what the third axis is for. A surface object with nothing to
  // evaluate is not — and that was the shape of the original failure, three
  // dimensions chosen from a kind label over two `surface` objects that had no
  // expression between them.
  // A PARAMETRIC SURFACE (px, py, pz) AND A SOLID ARE THREE-DIMENSIONAL TOO.
  // Only z = f(x, y) was counted, so a cone written as a parametric surface,
  // or a part with a solid block, was flattened to a 2D plot of equation lines
  // the moment any equations block sat beside it.
  const drawableSurface = model.objects.some(
    (o) =>
      ((o.kind === 'surface' || o.kind === 'volume') &&
        (!!o.definition || !!o.defs?.z || !!o.data || !!(o.defs?.px && o.defs?.py && o.defs?.pz))) ||
      (o.kind === 'solid' && !!o.solid)
  );
  if (!drawableSurface && model.objects.some((o) => !!o.equations)) {
    return {
      kind: 'plot2d',
      dimensionality: 2,
      why: 'quantities related to one another by equations: the relationships are lines in the plane, and a third axis would be one nothing varies along',
      alternatives: ['table', 'equation'],
    };
  }

  // A BODY IN SPACE: three dimensions, equal scales, the case a drawing of a
  // part needs. Before anything that would read its measures as a graph.
  if (has('solid')) {
    return {
      kind: 'surface3d',
      dimensionality: 3,
      why: 'a solid is a shape in space — its width, depth and height are lengths, drawn at one scale',
      alternatives: ['table'],
    };
  }

  // A quantity over two others: the case three dimensions are FOR.
  if (has('surface')) {
    return {
      kind: 'surface3d',
      dimensionality: 3,
      why: 'one quantity varies over two others, which is the shape three dimensions exist to show',
      alternatives: ['plot2d', 'table'],
    };
  }

  // A MECHANISM IS 2D, AND 3D WOULD BE WORSE. Bodies on a line with springs
  // between them are read along one axis; a perspective box makes the near
  // spring longer than the far one and buries the thing the picture is for.
  // This is the "3D must earn its existence" rule, applied by the model rather
  // than by a preference.
  if (has('body') || model.objects.some((o) => !!o.mechanism)) {
    return {
      kind: 'mechanism',
      dimensionality: 2,
      why: 'the parts lie along one axis and move along it, so the plane shows the whole of the motion and a box would only add perspective error',
      alternatives: ['plot2d', 'timeline', 'equation'],
    };
  }

  // A SYSTEM'S SHAPE IS ITS PHASE PORTRAIT — and how many dimensions that needs
  // is a fact about the system, not a taste. Two states are a plane curve; three
  // or more get three axes and a note saying which three (projectionNote).
  if (has('system')) {
    const widest = Math.max(
      ...byKind(model, 'system').map((o) => o.system?.states.length ?? 0),
      0
    );
    const mapped = byKind(model, 'system').some((o) => !!o.defs?.pz);
    const threeD = mapped || widest >= 3;
    return {
      kind: 'simulation',
      dimensionality: threeD ? 3 : 2,
      why: threeD
        ? `the state has ${widest} components, so the path through the first three is a curve in space and the rest are held`
        : 'the state has two components, so the path through them is a plane curve and the plane is enough',
      alternatives: threeD ? ['plot2d', 'timeline'] : ['timeline', 'plot2d'],
    };
  }

  if (has('trajectory')) {
    const threeD = model.objects.some((o) => o.kind === 'trajectory' && !!o.defs?.dz);
    return {
      kind: 'simulation',
      dimensionality: threeD ? 3 : 2,
      why: threeD
        ? 'the state has three components, so the path through them is a curve in space'
        : 'the state has two components, so the path through them is a plane curve and the plane is enough',
      alternatives: ['plot2d', 'timeline'],
    };
  }

  if (has('field')) {
    const threeD = model.objects.some((o) => o.kind === 'field' && !!o.defs?.fz);
    return {
      kind: 'field',
      dimensionality: threeD ? 3 : 2,
      why: threeD
        ? 'the field has a component out of the plane, so the plane cannot show its direction'
        : 'the field lies in a plane, and a plane of arrows is read more easily than a box of them',
      alternatives: ['plot2d'],
    };
  }

  if (has('series') || (model.time && has('measurement'))) {
    return {
      kind: 'timeline',
      dimensionality: 2,
      why: 'the quantity varies with one thing — time — and a line against it is the clearest form that has',
      alternatives: ['table', 'plot2d'],
    };
  }

  if (has('curve')) {
    return {
      kind: 'plot2d',
      dimensionality: 2,
      why: 'a quantity against one other is a plane curve; a perspective box would make equal quantities look unequal',
      alternatives: ['equation', 'table'],
    };
  }

  if (has('dataset') || has('distribution')) {
    return {
      kind: 'plot2d',
      dimensionality: 2,
      why: 'the data is one or two dimensional, so the plane shows all of it',
      alternatives: ['table', 'surface3d'],
    };
  }

  if (has('equation') || has('system')) {
    return {
      kind: 'equation',
      dimensionality: 2,
      why: 'what there is to look at is the statement itself; nothing here has an extent to draw',
      alternatives: ['text'],
    };
  }

  return {
    kind: 'text',
    dimensionality: 2,
    why: 'nothing in this model has a geometry, so a picture of it would be decoration',
    alternatives: ['table'],
  };
}

/**
 * Secondary series from the runs the main view already computed.
 *
 * Bounded deliberately: at most four panels, at most 400 points each, and only
 * for objects that actually integrated. A model with no dynamics has no panels —
 * not empty ones.
 */
export function buildPanels(model: Model): SpecPanel[] {
  const out: SpecPanel[] = [];

  // ── A MARGINAL EFFECT IS A DIFFERENT PLOT, NOT ANOTHER MARK ───────
  //
  // ∂wage/∂exper is a curve in currency-per-year against experience. The surface
  // it came from is currency against education and experience. They share one
  // axis and nothing else, and drawing both in one frame put them in one box:
  // measured, a surface spanning 20 units of education came back in a box 43.2
  // wide, because the slope curve reached out to experience = 40 along the same
  // x. The mesh then filled under half its own frame.
  //
  // The digest's rule, and it is about truthfulness rather than tidiness:
  // "linked views can be more truthful" than one scene. So a slope goes in its
  // own panel, with its own extent, beside the surface rather than inside it.
  for (const o of model.objects) {
    if (o.meta?.role !== 'marginal' || o.meta?.constant === true || o.meta?.undrawable) continue;
    const built = buildObject(model, o, { panel: true });
    const line = built.primitives.find((p) => p.p === 'polyline');
    if (!line || line.at.length < 2) continue;
    const at = line.at.map((q) => ({ x: q.x, y: q.y }));
    const ys = at.map((q) => q.y);
    const wrt = String(o.meta?.wrt ?? 'x');
    out.push({
      id: `${o.id}:slope`,
      label: o.label,
      of: o.id,
      state: o.id,
      // In units: the input's on x, the slope's own — the outcome's per the
      // input's, as derive.ts worked it out — on y.
      x: withUnit(wrt, unitOf(model, wrt)),
      y: withUnit(o.label, o.units),
      at,
      range: { x: [at[0].x, at[at.length - 1].x], y: [Math.min(...ys), Math.max(...ys)] },
      fidelity: 'model-derived',
      note: `${o.meta?.expr} — differentiated symbolically from the relationship this is drawn beside, and plotted on its own axes because it is a different quantity`,
    });
    if (out.length >= 4) return out;
  }

  for (const o of model.objects) {
    if (!o.system) continue;
    const got = runFor(model, o);
    if (!got.ok) continue;
    const run = got.run;
    // Which series: the states the model declared first, then its observations.
    // A mechanism's displacements come first because that is what somebody
    // watching the bodies move is comparing against.
    const wanted = [
      ...run.names.filter((n) => n.startsWith('x_')).slice(0, 2),
      ...run.names.filter((n) => !n.startsWith('x_')).slice(0, 2),
      ...Object.keys(run.observed).slice(0, 2),
    ].slice(0, 4);
    for (const name of wanted) {
      const s = seriesOf(run, name);
      if (!s) continue;
      const stride = Math.max(1, Math.ceil(s.t.length / 400));
      const at: { x: number; y: number }[] = [];
      for (let i = 0; i < s.t.length; i += stride) at.push({ x: s.t[i], y: s.v[i] });
      if (at.length < 2) continue;
      const ys = at.map((q) => q.y);
      const meansOf = o.system.states.find((v) => v.name === name)?.means;
      const stateUnits = o.system.states.find((v) => v.name === name)?.units ?? unitOf(model, name);
      out.push({
        id: `${o.id}:${name}`,
        label: meansOf ? `${name} — ${meansOf}` : name,
        of: o.id,
        state: name,
        x: withUnit('t', model.time?.units),
        y: withUnit(name, stateUnits),
        at,
        range: {
          x: [at[0].x, at[at.length - 1].x],
          y: [Math.min(...ys), Math.max(...ys)],
        },
        fidelity: 'numerically-computed',
        note: `${name} against time, from the same run the main view is drawn from`,
      });
      if (out.length >= 4) return out;
    }
  }
  return out;
}

/**
 * The sentence a projection has to carry.
 *
 * A ten-dimensional optimisation shown in three is not the space; it is three
 * of its axes. Saying which three, every time, is the difference between a
 * useful projection and a false claim about dimension.
 */
export function projectionNote(shown: readonly string[], total: number): string | null {
  if (total <= shown.length) return null;
  return `A ${shown.length}-dimensional projection of a ${total}-dimensional space, along ${shown.join(', ')}. The other ${total - shown.length} are held, not shown.`;
}
