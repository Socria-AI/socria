// lib/viz-model.ts
//
// THE MODEL BEHIND THE PICTURE — the one state that the conversation, the
// simulation and the drawing all refer to.
//
// WHY THIS EXISTS. Somebody asked a black hole "is this realistic? what's the
// blue" and Socria answered "if you're seeing blue, it might represent…". It
// had drawn the thing. The blue is the accretion disc, and it is blue because
// the code computed a temperature of about 125,000 K and converted that
// temperature to its blackbody colour — a fact the program held and the
// conversation could not reach. Two halves of one system were talking past
// each other, and the half that was guessing was the half doing the talking.
//
// The fix is not to show the model a screenshot of its own output. It is to
// give the picture a STATE the conversation can read: what is being modelled,
// what objects are on screen, what each one means, where every control stands,
// which layers are on, what is selected, and — the part that keeps everyone
// honest — how each object was obtained. A geodesic that was integrated and a
// curve that was drawn to illustrate an idea must never read the same, because
// then a plausible drawing can be described as a result.
//
// WHAT LIVES HERE: the types, the sanitiser (this state crosses the network
// from a browser, so it is untrusted like anything else that does), the prompt
// block, and the small command language that lets a reply change the picture
// instead of describing a change to it.
//
// WHAT DOES NOT: anything about black holes. A surface declares its own
// objects (lib/viz-semantics.ts) and the frame composes the state
// (components/surfaces/Surface3D.tsx). This module never learns a domain.

/**
 * How an object's geometry was arrived at. The whole point of the field is
 * that "we integrated this" and "we drew this so you could see the idea" are
 * different claims, and the second one must never be reported as the first.
 */
export type VizProvenance =
  /** stepped or integrated numerically: a result, not a shape */
  | 'integrated'
  /** evaluated from an exact expression — a radius, a curve, a boundary */
  | 'closed-form'
  /** real data that was measured or supplied, not produced here */
  | 'measured'
  /** drawn to make something legible; it is a picture, not a computation */
  | 'illustrative';

export const PROVENANCE_SAYS: Record<VizProvenance, string> = {
  integrated: 'computed by numerical integration — its shape is a result',
  'closed-form': 'evaluated from an exact expression',
  measured: 'taken from supplied data, not computed here',
  illustrative: 'drawn to make the idea legible; it is not a computed result',
};

/**
 * One thing on the screen, with its meaning attached.
 *
 * `appearance` is what somebody without the vocabulary would point at — "the
 * pale blue ellipse", "the dashed gold circle". It exists so that "what's the
 * blue?" and "what are the green lines?" resolve to an object instead of to a
 * guess, which was the entire failure this file was written for.
 */
export interface VizEntity {
  id: string;
  type:
    | 'body'
    | 'boundary'
    | 'surface'
    | 'trajectory'
    | 'region'
    | 'field'
    | 'marker'
    | 'grid'
    | 'axis'
    | 'label'
    | 'curve'
    | 'point';
  /** what the reader would call it */
  label: string;
  /** one sentence: what it IS. Never what it proves. */
  meaning: string;
  /** how its geometry was obtained */
  from: VizProvenance;
  /** the model it belongs to, where more than one is in play */
  model?: string;
  /** control ids that move it */
  depends?: string[];
  /** how to recognise it by eye, including what its colour encodes */
  appearance?: string;
  /** the layer toggle that shows and hides it */
  layer?: string;
  /** live, and computed: "2 of 6 captured", "crossed the horizon at t = 3.1 s" */
  state?: string;
  /** how it stands to the others: "inside the ISCO", "the boundary of the region" */
  relations?: string[];
}

export interface VizParamState {
  id: string;
  label: string;
  /** the number the simulation is actually using */
  value: number;
  /** that number as the panel shows it, units and all */
  read: string;
  min: number;
  max: number;
  /** what moving it does, in plain words */
  means?: string;
}

export interface VizLayerState {
  id: string;
  label: string;
  on: boolean;
}

/**
 * The whole state of one picture, as the conversation sees it.
 *
 * Deliberately flat and serialisable: it goes from the surface to the chat
 * client to the server in a JSON body, and anything clever in here would be a
 * thing that has to survive that trip.
 */
export interface VizModelState {
  /** which surface this is: 'black-hole', 'big-bang', 'orbit', 'plot' */
  surface: string;
  title: string;
  /** the model actually running: "Kerr geometry (equatorial)" */
  model: string;
  /** what it holds fixed, in the reader's words */
  assumptions: string[];
  /** the relations being solved, as text */
  equations: string[];
  /**
   * The model's own account of itself: coordinates, units, the observer, the
   * solver and its settings, what each output's fidelity is, what a mark must
   * NOT be taken for, and the limitations — from lib/model/science.ts via
   * lib/surface-science.ts.
   *
   * SEPARATE FROM `model` AND `assumptions`, which are one line and a short
   * list. This is the part that lets an answer be specific about HOW something
   * was obtained: that the rays were integrated by RK4 in Boyer–Lindquist and
   * checked against the weak-field series, that the grid is a representation of
   * geometry rather than a surface around the hole, that the disc image does not
   * ray-trace. A reader asking "why is that there?" is owed that, and a model
   * with no science block simply has none of it to give.
   */
  science?: string[];
  entities: VizEntity[];
  params: VizParamState[];
  layers: VizLayerState[];
  camera?: { yaw: number; pitch: number; dist: number };
  clock?: { t: number; playing: boolean; rate?: number };
  /** the readouts printed on and under the picture, verbatim */
  readouts: string[];
  /** what the reader last clicked, if anything — what "this" means */
  selected: string | null;
  /**
   * Verbs this view supports beyond the universal ones.
   *
   * A working surface offers the controls it was built with and nothing else;
   * a view backed by a model (lib/model/) can also be sliced, flattened,
   * moved through time and compared, because those are operations on the
   * model rather than on the picture. Absent means the old set exactly, which
   * is what keeps every existing surface behaving as it did.
   */
  can?: readonly ('slice' | 'view' | 'time' | 'compare')[];
}

// ── sanitising ───────────────────────────────────────────────────────
//
// This arrives from a browser. Everything below assumes it was written by
// somebody hostile, because the alternative is a prompt-injection surface
// shaped exactly like a description of a picture.

const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const TYPES = new Set<VizEntity['type']>([
  'body', 'boundary', 'surface', 'trajectory', 'region', 'field',
  'marker', 'grid', 'axis', 'label', 'curve', 'point',
]);
const PROVENANCES = new Set<VizProvenance>(['integrated', 'closed-form', 'measured', 'illustrative']);

const text = (v: unknown, n: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const list = (v: unknown, n: number, each: number): string[] =>
  Array.isArray(v) ? v.map((x) => text(x, each)).filter(Boolean).slice(0, n) : [];

export const VIZ_CAPS = {
  entities: 48,
  params: 24,
  layers: 16,
  assumptions: 10,
  equations: 8,
  science: 30,
  readouts: 6,
} as const;

function sanitizeEntity(raw: unknown): VizEntity | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 32);
  if (!ID.test(id)) return null;
  const label = text(r.label, 60);
  const meaning = text(r.meaning, 260);
  if (!label || !meaning) return null;
  const type = TYPES.has(r.type as VizEntity['type']) ? (r.type as VizEntity['type']) : 'marker';
  const from = PROVENANCES.has(r.from as VizProvenance) ? (r.from as VizProvenance) : 'illustrative';
  const out: VizEntity = { id, type, label, meaning, from };
  const model = text(r.model, 120);
  if (model) out.model = model;
  const appearance = text(r.appearance, 120);
  if (appearance) out.appearance = appearance;
  const layer = text(r.layer, 32);
  if (ID.test(layer)) out.layer = layer;
  const state = text(r.state, 120);
  if (state) out.state = state;
  const depends = list(r.depends, 8, 32).filter((d) => ID.test(d));
  if (depends.length) out.depends = depends;
  const relations = list(r.relations, 5, 140);
  if (relations.length) out.relations = relations;
  return out;
}

function sanitizeParam(raw: unknown): VizParamState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 32);
  const value = num(r.value);
  const min = num(r.min);
  const max = num(r.max);
  if (!ID.test(id) || value === null || min === null || max === null || max <= min) return null;
  const out: VizParamState = {
    id,
    label: text(r.label, 40) || id,
    value: Math.min(max, Math.max(min, value)),
    read: text(r.read, 60),
    min,
    max,
  };
  const means = text(r.means, 200);
  if (means) out.means = means;
  return out;
}

function sanitizeLayer(raw: unknown): VizLayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 32);
  if (!ID.test(id)) return null;
  return { id, label: text(r.label, 40) || id, on: r.on !== false };
}

/**
 * Take whatever arrived and return a state, or nothing.
 *
 * Nothing is a perfectly good answer: a turn with no picture beside it, or a
 * picture that reported no objects, should add no block at all rather than a
 * block that says almost nothing. A description of a picture pushed in front
 * of every message has the model reaching for it when nobody asked.
 */
export function sanitizeModelState(raw: unknown): VizModelState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const surface = text(r.surface, 32);
  if (!ID.test(surface)) return null;
  const entities = Array.isArray(r.entities)
    ? (r.entities.map(sanitizeEntity).filter(Boolean) as VizEntity[]).slice(0, VIZ_CAPS.entities)
    : [];
  if (!entities.length) return null;

  const params = Array.isArray(r.params)
    ? (r.params.map(sanitizeParam).filter(Boolean) as VizParamState[]).slice(0, VIZ_CAPS.params)
    : [];
  const layers = Array.isArray(r.layers)
    ? (r.layers.map(sanitizeLayer).filter(Boolean) as VizLayerState[]).slice(0, VIZ_CAPS.layers)
    : [];

  const cam = r.camera && typeof r.camera === 'object' ? (r.camera as Record<string, unknown>) : null;
  const camera =
    cam && num(cam.yaw) !== null && num(cam.pitch) !== null && num(cam.dist) !== null
      ? { yaw: num(cam.yaw)!, pitch: num(cam.pitch)!, dist: num(cam.dist)! }
      : undefined;

  const ck = r.clock && typeof r.clock === 'object' ? (r.clock as Record<string, unknown>) : null;
  const clock =
    ck && num(ck.t) !== null
      ? {
          t: Math.max(0, num(ck.t)!),
          playing: ck.playing === true,
          ...(num(ck.rate) !== null ? { rate: num(ck.rate)! } : {}),
        }
      : undefined;

  const selRaw = text(r.selected, 32);
  const selected = selRaw && entities.some((e) => e.id === selRaw) ? selRaw : null;

  const CAN = ['slice', 'view', 'time', 'compare'] as const;
  const can = Array.isArray(r.can)
    ? (r.can.filter((c): c is (typeof CAN)[number] => CAN.includes(c as never)) as (typeof CAN)[number][])
    : [];

  return {
    surface,
    title: text(r.title, 90),
    model: text(r.model, 140),
    assumptions: list(r.assumptions, VIZ_CAPS.assumptions, 200),
    equations: list(r.equations, VIZ_CAPS.equations, 140),
    ...(Array.isArray(r.science) && r.science.length
      ? { science: list(r.science, VIZ_CAPS.science, 320) }
      : {}),
    entities,
    params,
    layers,
    ...(camera ? { camera } : {}),
    ...(clock ? { clock } : {}),
    readouts: list(r.readouts, VIZ_CAPS.readouts, 200),
    selected,
    ...(can.length ? { can } : {}),
  };
}

// ── the command language ─────────────────────────────────────────────
//
// "Increase the mass" should move the mass, not produce a paragraph about what
// moving the mass would do. The reply carries a small block of lines, the
// client strips it before anything is shown, and every line is checked against
// the state that was sent — so a control that does not exist cannot be moved
// and a value outside a physical range is clamped to it, exactly as the slider
// would clamp it. The model is allowed to ASK for a change; it is not allowed
// to invent what the picture can do.

export type VizOp =
  | { op: 'set'; id: string; value: number }
  | { op: 'layer'; id: string; on: boolean }
  | { op: 'select'; id: string | null }
  | { op: 'play' }
  | { op: 'pause' }
  | { op: 'reset' }
  | { op: 'camera'; field: 'yaw' | 'pitch' | 'dist'; value: number }
  // ── the verbs a model-backed view adds ──────────────────────────
  //
  // These reach the MODEL rather than the drawing, which is why they are
  // here and not in the renderer: "hold y at 1" is a statement about the
  // thing being looked at, and the 2D curve it produces is as true as the
  // surface it was cut from (lib/model/compile.ts buildSlice). A surface
  // that has no model behind it never offers them — see `can` on the state.
  /** cut a cross-section: the curve where the object meets a plane */
  | { op: 'slice'; axis: 'x' | 'y'; at: number }
  /** put the slice away and look at the whole thing again */
  | { op: 'unslice' }
  /** ask for a dimensionality rather than accepting the chosen one */
  | { op: 'view'; as: '2d' | '3d' }
  /** move to an instant; time is a dimension of the model, not a control */
  | { op: 'time'; value: number }
  /** keep the state as it stands, to put the next one beside it */
  | { op: 'compare'; on: boolean };

export const VIZ_FENCE = 'socria-viz';
/** No reply needs more than a handful; a long list is a runaway, not an edit. */
export const MAX_OPS = 8;

const FENCE_OPEN = /```[ \t]*socria-viz[ \t]*\r?\n?/i;

/**
 * The reply as the reader should see it: everything except the command block.
 *
 * Written to work on a PARTIAL reply, because it runs on every chunk of a
 * stream. Once the opening fence appears the rest is withheld until the block
 * closes — so the reader never watches `set m 8` being typed out, and a reply
 * that is cut off mid-block does not leave its guts on the screen.
 */
export function stripVizOps(reply: string): string {
  if (typeof reply !== 'string' || !reply) return '';
  const open = reply.match(FENCE_OPEN);
  if (!open || open.index === undefined) return reply;
  const head = reply.slice(0, open.index);
  const rest = reply.slice(open.index + open[0].length);
  const close = rest.indexOf('```');
  const tail = close === -1 ? '' : rest.slice(close + 3);
  return (head + tail).replace(/\n{3,}/g, '\n\n').trim();
}

/** The block's contents, or '' — exported for the tests and for tracing. */
export function vizOpsSource(reply: string): string {
  const open = typeof reply === 'string' ? reply.match(FENCE_OPEN) : null;
  if (!open || open.index === undefined) return '';
  const rest = reply.slice(open.index + open[0].length);
  const close = rest.indexOf('```');
  return close === -1 ? '' : rest.slice(0, close);
}

/**
 * Parse the block against the state it is allowed to touch.
 *
 * Every id is checked against what was actually on the screen and every value
 * against that control's real range. There is no path here by which a reply
 * can name a control the surface does not have, or push one past a limit the
 * physics owns.
 */
export function parseVizOps(reply: string, state: VizModelState | null | undefined): VizOp[] {
  const src = vizOpsSource(reply);
  if (!src || !state) return [];
  const params = new Map(state.params.map((p) => [p.id, p]));
  const layers = new Set(state.layers.map((l) => l.id));
  const entities = new Set(state.entities.map((e) => e.id));
  const out: VizOp[] = [];

  for (const raw of src.split(/\r?\n/)) {
    if (out.length >= MAX_OPS) break;
    const line = raw.trim().replace(/[;,]+$/, '');
    if (!line || line.startsWith('#')) continue;
    const bits = line.split(/[\s=:]+/).filter(Boolean);
    const verb = (bits[0] ?? '').toLowerCase();

    if (verb === 'play' || verb === 'pause' || verb === 'reset') {
      out.push({ op: verb } as VizOp);
      continue;
    }
    if (verb === 'set' && bits.length >= 3) {
      const p = params.get(bits[1]);
      const v = Number(bits[2]);
      if (!p || !Number.isFinite(v)) continue;
      out.push({ op: 'set', id: p.id, value: Math.min(p.max, Math.max(p.min, v)) });
      continue;
    }
    if (verb === 'layer' && bits.length >= 3) {
      const id = bits[1];
      const on = /^(on|true|show|1)$/i.test(bits[2]);
      const off = /^(off|false|hide|0)$/i.test(bits[2]);
      if (!layers.has(id) || (!on && !off)) continue;
      out.push({ op: 'layer', id, on });
      continue;
    }
    if (verb === 'select' && bits.length >= 2) {
      const id = bits[1];
      if (/^(none|null|clear)$/i.test(id)) out.push({ op: 'select', id: null });
      else if (entities.has(id)) out.push({ op: 'select', id });
      continue;
    }
    // The model-backed verbs. Checked against `can` rather than always
    // accepted: a working surface with no model behind it cannot be sliced,
    // and an op it would silently ignore is worse than one that is dropped
    // here — the reply would have described a change that never happened.
    const allows = (v: 'slice' | 'view' | 'time' | 'compare') => (state.can ?? []).includes(v);

    if (verb === 'slice' && bits.length >= 3 && allows('slice')) {
      const axis = bits[1].toLowerCase();
      const v = Number(bits[2]);
      if ((axis === 'x' || axis === 'y') && Number.isFinite(v)) {
        out.push({ op: 'slice', axis, at: v });
      }
      continue;
    }
    if ((verb === 'unslice' || (verb === 'slice' && /^(off|none|clear)$/i.test(bits[1] ?? ''))) && allows('slice')) {
      out.push({ op: 'unslice' });
      continue;
    }
    if (verb === 'view' && bits.length >= 2 && allows('view')) {
      const as = bits[1].toLowerCase();
      if (as === '2d' || as === '3d') out.push({ op: 'view', as });
      continue;
    }
    if (verb === 'time' && bits.length >= 2 && allows('time')) {
      const v = Number(bits[1]);
      if (Number.isFinite(v)) out.push({ op: 'time', value: v });
      continue;
    }
    if (verb === 'compare' && bits.length >= 2 && allows('compare')) {
      const on = /^(on|true|keep|1)$/i.test(bits[1]);
      const off = /^(off|false|clear|0)$/i.test(bits[1]);
      if (on || off) out.push({ op: 'compare', on });
      continue;
    }

    if (verb === 'camera' && bits.length >= 3) {
      const field = bits[1].toLowerCase();
      const v = Number(bits[2]);
      if (!Number.isFinite(v)) continue;
      if (field === 'yaw' || field === 'pitch') {
        out.push({ op: 'camera', field, value: Math.min(1.45, Math.max(-1.45, v)) });
      } else if (field === 'dist' || field === 'distance' || field === 'zoom') {
        // The frame clamps this to the surface's own range; a bound here would
        // be a second, wronger copy of it.
        out.push({ op: 'camera', field: 'dist', value: v });
      }
    }
  }
  return out;
}

// ── what the model is told ───────────────────────────────────────────

const bullet = (s: string) => `- ${s}`;

function entityLine(e: VizEntity, layers: Map<string, boolean>): string {
  const bits = [`${e.label} [${e.id}] — ${e.meaning}`];
  bits.push(`(${e.type}; ${PROVENANCE_SAYS[e.from]}${e.model ? `; ${e.model}` : ''})`);
  if (e.appearance) bits.push(`Seen as: ${e.appearance}.`);
  if (e.state) bits.push(`Right now: ${e.state}.`);
  if (e.relations?.length) bits.push(e.relations.join(' '));
  if (e.depends?.length) bits.push(`Moves with: ${e.depends.join(', ')}.`);
  if (e.layer && layers.get(e.layer) === false) bits.push('Its layer is OFF — it is not on screen at the moment.');
  return bullet(bits.join(' '));
}

/**
 * The block that goes in the system prompt when a picture is up.
 *
 * It is long, and it is long on purpose: every line of it replaces something
 * the model would otherwise have to guess at, and guessing at it is the bug.
 * It ends with the two rules that matter most — answer what was asked, and
 * never describe something that is not in the list above.
 */
export function vizModelBlock(state: VizModelState | null | undefined): string {
  if (!state) return '';
  const layerOn = new Map(state.layers.map((l) => [l.id, l.on]));
  const lines: string[] = [];

  lines.push('=== THE PICTURE BESIDE THIS CONVERSATION ===');
  lines.push(
    `You made this and you can read its state. It is ${state.title || 'a working surface'}${
      state.model ? `, running ${state.model}` : ''
    }. What follows is the picture's OWN state as of the moment they pressed send — not a guess, not a screenshot, and not something they typed.`
  );

  lines.push('');
  lines.push('WHAT IS ON SCREEN — every object, and what each one is:');
  for (const e of state.entities) lines.push(entityLine(e, layerOn));

  if (state.params.length) {
    lines.push('');
    lines.push('CONTROLS, and where they stand right now:');
    for (const p of state.params) {
      lines.push(
        bullet(
          `${p.label} [${p.id}] = ${p.read || p.value} (range ${p.min} to ${p.max})${
            p.means ? ` — ${p.means}` : ''
          }`
        )
      );
    }
  }

  if (state.layers.length) {
    lines.push('');
    lines.push(
      `LAYERS: ${state.layers.map((l) => `${l.label} [${l.id}] ${l.on ? 'on' : 'off'}`).join(', ')}.`
    );
  }

  if (state.clock) {
    lines.push(
      `CLOCK: ${state.clock.t.toFixed(1)} s of surface time, ${
        state.clock.playing ? 'running' : 'paused'
      }${state.clock.rate !== undefined ? `, at ×${state.clock.rate}` : ''}.`
    );
  }

  if (state.readouts.length) {
    lines.push(`READOUTS, exactly as printed: ${state.readouts.join(' · ')}`);
  }

  if (state.assumptions.length) {
    lines.push('');
    lines.push('WHAT THE MODEL HOLDS FIXED:');
    for (const a of state.assumptions) lines.push(bullet(a));
  }
  if (state.equations.length) {
    lines.push(`WHAT IT SOLVES: ${state.equations.join(' · ')}`);
  }

  if (state.science?.length) {
    lines.push('');
    lines.push('THE MODEL, IN ITS OWN WORDS — coordinates, solver, what each output is, and what each mark is NOT:');
    for (const l of state.science) lines.push(bullet(l));
  }

  if (state.selected) {
    const sel = state.entities.find((e) => e.id === state.selected);
    if (sel) {
      lines.push('');
      lines.push(
        `THEY HAVE SELECTED: ${sel.label} [${sel.id}]. An unanchored "this", "that" or "it" in their next message means THIS unless they clearly mean something else.`
      );
    }
  }

  lines.push('');
  lines.push('HOW TO USE IT:');
  lines.push(
    bullet(
      'A plain question about what they can see gets a plain answer. "What is the blue?" is answered with what the blue is — not with "it might represent…", and not with a question back. Withholding a fact they can see is not depth; it is the surface failing to know its own contents.'
    )
  );
  lines.push(
    bullet(
      'Answer from the list above and nothing else. If something they describe is not in it, say you cannot see it in the picture and ask what they are pointing at. Never invent an object, a colour, a value or a behaviour that is not listed — a confident answer about something that is not there is worse than no answer.'
    )
  );
  lines.push(
    bullet(
      'Say how something was obtained when it matters, in the model\u2019s own terms: which of these numbers an integrator produced, which follow from a formula, and which are drawn to be legible. Where the model says a mark is NOT something — a coordinate grid is not a surface around the object, a drawn thickness is not to scale — say that plainly if they ask what it is. Never upgrade a drawing to a computation; never describe a computed result as an illustration.'
    )
  );
  lines.push(
    bullet(
      'A question about WHY a computed thing came out as it did is answered from the model\u2019s own numbers — the value it was given, the threshold it was compared against, what the solver did. Not from a general account of the subject, and never from a plausible-sounding mechanism the readouts do not support.'
    )
  );
  lines.push(
    bullet(
      'Keep the provenance straight. Say "integrated" only of what was integrated. Something marked illustrative is a drawing made to be legible, and calling it a result would be a lie about what the program did.'
    )
  );
  lines.push(
    bullet(
      'The Answer Guard is unchanged. Reading the picture tells you what they are looking at, never what they should conclude from it; if they are working something out, seeing their screen is not a reason to finish it for them.'
    )
  );
  lines.push(bullet('Do not narrate the picture back to them unprompted. They are looking at it.'));

  lines.push('');
  lines.push(vizOpsHelp(state));

  return `\n\n${lines.join('\n')}\n`;
}

/**
 * The half of the block that says how to change the picture.
 *
 * Only the ids that exist, listed by name, because a grammar without a
 * vocabulary is an invitation to invent one. Anything the model writes is
 * checked against this same state on the way back, so the list is a courtesy
 * rather than the guarantee — but a model that is told the truth guesses less.
 */
export function vizOpsHelp(state: VizModelState): string {
  const p = state.params.map((x) => x.id);
  const l = state.layers.map((x) => x.id);
  const lines = [
    'CHANGING IT — you can move the picture rather than describing a move.',
    'When they ask for a change ("increase the mass", "hide the disc", "slow it down", "show the photon paths", "reset it"), DO it: put a fenced block at the very END of your reply, after your words, and write your reply as though the change has already happened, because it has.',
    '```' + VIZ_FENCE,
    p.length ? `set <control> <number>      controls: ${p.join(', ')}` : '',
    l.length ? `layer <layer> on|off        layers: ${l.join(', ')}` : '',
    'select <object>|none        objects: by the id in brackets above',
    'play | pause | reset',
    state.camera ? 'camera yaw|pitch|dist <number>' : '',
    (state.can ?? []).includes('slice') ? 'slice x|y <number> | unslice     a cross-section, computed from the definition' : '',
    (state.can ?? []).includes('view') ? 'view 2d|3d                       the same model, drawn flat or in space' : '',
    (state.can ?? []).includes('time') ? 'time <number>                    move to an instant' : '',
    (state.can ?? []).includes('compare') ? 'compare on|off                   hold this state beside the next one' : '',
    '```',
    `At most ${MAX_OPS} lines. Only those ids; anything else is dropped. Values outside a control's range are clamped to it, because the range belongs to the physics and not to the conversation.`,
    'No block at all when they did not ask for a change — an answer to "what is this?" moves nothing.',
  ];
  return lines.filter(Boolean).join('\n');
}
