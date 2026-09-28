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

import { extentOf, pointsOf, type P3, type Primitive } from './primitives';
import { buildModel, type Built } from './compile';
import { expand } from './mechanism';
import { runFor, seriesOf } from './system';
import { byKind, overallFidelity, type Fidelity, type Model, type ModelObject } from './schema';

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
  /** axis names, for the panel's own labels */
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
  const graph = model.objects.some(
    (o) => (o.kind === 'surface' || o.kind === 'volume') && !!o.definition && !o.defs?.px
  );
  return graph ? 'fit' : 'equal';
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
  const model = expand(modelIn);
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

  const objects = model.objects.filter((o) => built.some((b) => b.of === o.id && b.primitives.length));
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
    fidelity: overallFidelity(objects.length ? objects : model.objects),
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
  return [pick(0, 'x'), pick(1, 'y'), pick(2, 'z')];
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
export function chooseRepresentation(model: Model): Choice {
  const has = (...k: Parameters<typeof byKind>[1][]) => byKind(model, ...k).length > 0;
  const count = (k: Parameters<typeof byKind>[1]) => byKind(model, k).length;

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
      out.push({
        id: `${o.id}:${name}`,
        label: meansOf ? `${name} — ${meansOf}` : name,
        of: o.id,
        x: model.time?.units ? `t (${model.time.units})` : 't',
        y: name,
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
