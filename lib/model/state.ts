// lib/model/state.ts
//
// WHERE THE MODEL MEETS THE CONVERSATION.
//
// Logos already has a seam between a picture and the chat (lib/viz-model.ts):
// the picture reports a state, the state goes into the prompt, and a reply may
// come back with a short list of changes that are checked against that same
// state before anything moves. That seam works and is tested; this file makes
// the model engine speak it rather than inventing a second one.
//
// TWO DIRECTIONS, AND THE ASYMMETRY IS DELIBERATE.
//
//   reading  — every object's meaning, how it was actually produced, where its
//              numbers came from, and what is on screen right now.
//   writing  — a small vocabulary of changes, each of which is applied to the
//              MODEL and then propagated: change, recompute what that reached,
//              leave the rest alone, and say what moved.
//
// The asymmetry is that reading is total and writing is narrow. A reply can
// see everything and may touch almost nothing, which is the correct shape for
// a system where the human is the one doing the thinking.

import type { VizEntity, VizModelState, VizOp, VizProvenance } from '@/lib/viz-model';
import { unpack } from './unpack';
import { OPERATIONS, askFor, capabilityOf, missingStructure, plan, route } from './solve';
import { estimate } from './estimate';
import { driftOf, runFor, stateAt } from './system';
import { FIDELITY_SAYS, ORIGIN_SAYS, affectedBy, objectOf, paramOf, setParam, setTime, type ChangeRecord, type Fidelity, type Model } from './schema';
import type { VisualizationSpec } from './spec';

/**
 * Fidelity, in the vocabulary the existing prompt block already speaks.
 *
 * The engine's five levels are finer than the four the chat block knows, so
 * the map is stated here once rather than guessed at each call site. It is
 * lossy in exactly one direction — simulated and numerically-computed both
 * become "integrated" — and never in the direction that would flatter a
 * drawing: conceptual stays illustrative, always.
 */
export function asProvenance(f: Fidelity): VizProvenance {
  switch (f) {
    case 'numerically-computed':
    case 'simulated':
      return 'integrated';
    case 'model-derived':
      return 'closed-form';
    case 'data-derived':
      return 'measured';
    case 'conceptual':
    default:
      return 'illustrative';
  }
}

const KIND_TO_ENTITY: Record<string, VizEntity['type']> = {
  surface: 'surface',
  volume: 'surface',
  mesh: 'surface',
  curve: 'curve',
  line: 'curve',
  ray: 'curve',
  trajectory: 'trajectory',
  field: 'field',
  region: 'region',
  boundary: 'boundary',
  point: 'point',
  particle: 'body',
  node: 'body',
  vector: 'marker',
  graph: 'grid',
  grid: 'grid',
  axis: 'axis',
  annotation: 'label',
  dataset: 'point',
  distribution: 'region',
  measurement: 'point',
  series: 'curve',
};

/**
 * The model, as the conversation reads it.
 *
 * WHAT GOES IN: what each object IS, how the engine actually produced it this
 * time round (the spec's notes, not the model's claims), where its numbers
 * came from, and the live state of the view. WHAT STAYS OUT: the geometry. The
 * conversation does not need four thousand points to answer "what is the blue
 * surface" and would be worse at it for having them.
 */
export function modelStateFrom(
  modelIn: Model,
  spec: VisualizationSpec,
  opts?: { selected?: string | null; can?: VizModelState['can']; readouts?: string[] }
): VizModelState {
  // The same expansion the compiler does, so the conversation sees every body,
  // spring and damper as its own object — with its own meaning, its own
  // dependencies and its own computed state — rather than as anonymous shapes
  // inside one "mechanism" entity that could answer nothing about them.
  const model = unpack(modelIn);
  const noteOf = new Map(spec.notes.map((n) => [n.of, n]));

  const entities: VizEntity[] = model.objects.map((o) => {
    const n = noteOf.get(o.id);
    const fidelity = n?.fidelity ?? o.fidelity ?? 'conceptual';
    const bits: string[] = [];
    if (n?.note) bits.push(n.note);
    if (n?.problem) bits.push(`not drawn: ${n.problem}`);
    if (o.state) bits.push(o.state);
    if (o.value !== undefined) bits.push(`= ${o.value}${o.units ? ` ${o.units}` : ''}`);
    if (o.uncertainty?.plusMinus !== undefined) {
      bits.push(`± ${o.uncertainty.plusMinus}${o.uncertainty.says ? ` (${o.uncertainty.says})` : ''}`);
    }

    // WHY SOMETHING IS NOT THERE, which is as much a fact about the model as
    // what is. An object a solver would handle but cannot run yet says what it
    // needs, in the person's terms, rather than being silently absent.
    const routed = route(model, o);
    if (routed.status === 'incomplete') {
      bits.push(
        `not computed yet — needs ${routed.missing.map((m) => m.what).join(', ')} (${routed.solver.label} would run it)`
      );
    } else if (routed.status === 'unsupported' && o.kind !== 'annotation' && o.kind !== 'axis') {
      bits.push(`nothing here computes this: ${routed.why}`);
    }

    // A mechanism part's LIVE numbers, read off the run at the clock's instant.
    if (['body', 'spring', 'damper', 'force'].includes(o.kind) && typeof o.meta?.mech === 'string') {
      const parent = objectOf(model, o.meta.mech);
      if (parent?.system) {
        const got = runFor(model, parent);
        if (got.ok) {
          const now = stateAt(got.run, model.time?.t ?? 0);
          const part = String(o.meta.part ?? '');
          if (o.kind === 'body') {
            const x = now[`x_${part}`];
            const v = now[`v_${part}`];
            if (x !== undefined) bits.push(`at t = ${(model.time?.t ?? 0).toFixed(2)}: displacement ${x.toFixed(4)} m, velocity ${(v ?? 0).toFixed(4)} m/s`);
          } else if (o.kind === 'spring' || o.kind === 'damper') {
            const a = String(o.meta.from ?? '');
            const b = String(o.meta.to ?? '');
            const xa = a === 'ground' ? 0 : (now[`x_${a}`] ?? 0);
            const xb = b === 'ground' ? 0 : (now[`x_${b}`] ?? 0);
            bits.push(`extension ${(xb - xa).toFixed(4)} m at t = ${(model.time?.t ?? 0).toFixed(2)}`);
          }
        }
      }
    }

    // A fitted specification's actual numbers, or the choice it is waiting on.
    if (o.estimation) {
      const got = estimate(model, o);
      if (got.ok) {
        bits.push(
          `${got.fit.says}: ${got.fit.terms
            .map((t) => `${t.name} = ${t.value.toFixed(4)} (se ${t.se.toFixed(4)})`)
            .join(', ')}; R² ${got.fit.r2.toFixed(3)} on ${got.fit.n} observations, ${got.fit.se} standard errors`
        );
        for (const w of got.fit.warnings.slice(0, 3)) bits.push(w);
      } else if ('choice' in got) {
        bits.push(
          `no method chosen, so nothing is fitted. ${got.choice.says} Candidates: ${got.choice.candidates
            .map((c) => c.label)
            .join('; ')}`
        );
      }
    }

    const relations: string[] = [];
    if (o.provenance) {
      relations.push(
        `Where it came from: ${ORIGIN_SAYS[o.provenance.origin]}${o.provenance.detail ? ` — ${o.provenance.detail}` : ''}.`
      );
    }
    // The fidelity said in words as well as carried as a code, because the
    // whole point is that a reader of the reply can tell a drawing from a
    // result without knowing this system's vocabulary.
    relations.push(`How it was produced: ${FIDELITY_SAYS[fidelity]}.`);
    for (const r of o.relations ?? []) {
      const other = objectOf(model, r.to);
      if (other) relations.push(`${r.as.replace(/-/g, ' ')} ${other.label}${r.why ? ` — ${r.why}` : ''}.`);
    }

    return {
      id: o.id,
      type: KIND_TO_ENTITY[o.kind] ?? 'marker',
      label: o.label,
      meaning: o.meaning || o.definition || `a ${o.kind} in this model`,
      from: asProvenance(fidelity),
      ...(o.definition ? { model: o.definition } : {}),
      ...(o.depends?.length ? { depends: o.depends } : {}),
      ...(o.appearance ? { appearance: o.appearance } : {}),
      ...(o.layer ? { layer: o.layer } : {}),
      ...(bits.length ? { state: bits.join('; ') } : {}),
      ...(relations.length ? { relations: relations.slice(0, 5) } : {}),
    };
  });

  const readouts = [...(opts?.readouts ?? [])];
  if (spec.partial) readouts.push(spec.partial);
  readouts.push(`This view: ${FIDELITY_SAYS[spec.fidelity]}.`);

  // WHAT THIS MODEL CAN HONESTLY DO, in the readouts the conversation reads
  // verbatim. A model that is structural says so; one that is integrating says
  // so; and what the next level would take is named rather than implied.
  const cap = capabilityOf(model);
  readouts.push(cap.says);

  // The integrator marking its own work, where the model declared an invariant.
  for (const o of model.objects) {
    if (!o.system?.invariant) continue;
    const got = runFor(model, o);
    if (!got.ok) continue;
    const drift = driftOf(got.run, o.system.invariant);
    if (drift) {
      readouts.push(
        `${o.system.invariant} drifted ${(drift.relative * 100).toFixed(3)}% over the run — the integration's own error, not a result`
      );
    }
  }

  // ── WHAT THIS MODEL CURRENTLY IS, AND IS NOT ────────────────────
  //
  // The conversation is told this because it is the difference between
  // "I have specified Wage on Education; nothing is estimated because there is
  // no data" and "here are your coefficients". The reply used to have no way
  // to know which of those it was looking at, so it described whichever one
  // sounded more finished — and a specified model was routinely talked about
  // as though it had been fitted.
  //
  // Reuses `science`, which is already the field for "the model in its own
  // words", is already capped and sanitised, and is already rendered to the
  // conversation under a heading that means exactly this.
  const able = capabilityOf(model);
  const gaps = missingStructure(model);
  const status: string[] = [
    `This model is ${able.level}${able.because.length ? `: ${able.because[able.because.length - 1]}` : ''}.`,
    // WHAT CAN BE DONE WITH IT, OPERATION BY OPERATION — and not one verdict.
    // A model can be unestimated and evaluable at the same time, and saying
    // only "nothing computes yet" about such a model is how a correctly built
    // wage equation with two hypothetical coefficients was described as
    // computing nothing while its surface was being drawn.
    ...plan(model).map((p) => `You can ${p.says}.`),
    // …AND THE ONES NOTHING CAN DO, with what such a model would have to
    // contain. `plan` lists what is live and omits the rest, so "can you run
    // this forward?" had no answer at all rather than an honest no.
    ...OPERATIONS.filter((op) => askFor(model, op).status === 'unsupported')
      .map((op) => askFor(model, op).says)
      .slice(0, 4),
    ...gaps.map(
      (g) =>
        `${g.label} is NOT computed: it needs ${g.missing
          .map((m) => m.what)
          .join(', ')}. Say so plainly if asked; do not supply it and do not describe what it would show.`
    ),
    ...model.objects
      .filter((o) => !!o.estimation)
      .map((o) =>
        o.estimation!.data
          ? `“${o.label}” is a specification with data attached${o.estimation!.method ? `, fitted by ${o.estimation!.method}` : ', with no method chosen — the method is theirs to choose'}.`
          : `“${o.label}” is SPECIFIED BUT NOT ESTIMATED: ${o.estimation!.y} explained by ${o.estimation!.x.join(', ')}, with no observations attached. There is no fitted line, no R², no standard error and no p-value, and inventing one would be the worst thing you could do here.`
      ),
    // …AND WHAT THE UNESTIMATED MODEL CAN STILL SHOW. A surface drawn at
    // coefficient values somebody set as hypotheses is a real computation of
    // what the model says — and describing it as an estimate, a prediction or
    // a fit would be exactly the lie the sentence above is guarding against.
    ...model.objects
      .filter((o) => o.meta?.role === 'response')
      .map(
        (o) =>
          `“${o.label}” is the model's own deterministic component, computed at ${o.meta!.basis}. ` +
          `It is NOT estimated, NOT a prediction, NOT a fit and NOT a conditional expectation — ` +
          `reading it as the last of those needs an assumption about the error term nobody here has stated. ` +
          `Moving a coefficient moves this surface because the surface IS the equation.`
      ),
  ];

  return {
    // The id the chat state is keyed by. A hyphen and not a colon: that field
    // is checked against an id pattern on the way back in (lib/viz-model.ts),
    // and a state the server refuses is a conversation with no picture in it.
    surface: `m-${model.id}`.slice(0, 32),
    title: model.title,
    model: model.domain ? `${model.domain}` : '',
    science: status,
    assumptions: model.assumptions ?? [],
    equations: model.equations ?? [],
    entities,
    params: model.params.map((p) => ({
      id: p.id,
      label: p.label,
      value: p.value,
      read: `${p.value}${p.units ? ` ${p.units}` : ''}${p.held ? ' (held)' : ''}`,
      min: p.min,
      max: p.max,
      ...(p.means ? { means: p.means } : {}),
    })),
    layers: (model.layers ?? []).map((l) => ({ id: l.id, label: l.label, on: l.on !== false })),
    ...(spec.camera ? { camera: spec.camera } : {}),
    ...(model.time
      ? { clock: { t: model.time.t, playing: !!model.time.playing, rate: model.time.rate ?? 1 } }
      : {}),
    readouts,
    selected: opts?.selected ?? null,
    can: opts?.can ?? ['slice', 'view', 'time', 'compare'],
  };
}

/** What a view is showing, beyond the model itself. */
export interface ViewState {
  as?: '2d' | '3d';
  slice?: { axis: 'x' | 'y'; at: number } | null;
  selected?: string | null;
  comparing?: boolean;
}

export interface Applied {
  model: Model;
  view: ViewState;
  /** every change, in order, for "what did that do?" */
  changes: ChangeRecord[];
  /** object ids whose primitives must be rebuilt; everything else is kept */
  recompute: string[];
}

/**
 * CHANGE → PROPAGATE → OBSERVE, as one function.
 *
 * The ops have already been checked against the state that was sent
 * (lib/viz-model.ts parseVizOps), so this applies them. What it adds is the
 * middle step: after each change it asks the model what that change REACHED,
 * and the caller rebuilds only those objects. A picture that rebuilt itself
 * entirely would lose the camera, the selection and a second of somebody's
 * attention, every time a slider moved by one step.
 */
export function applyOps(model: Model, ops: readonly VizOp[], view: ViewState = {}, at = 0): Applied {
  let next = model;
  const nextView: ViewState = { ...view };
  const changes: ChangeRecord[] = [];
  const recompute = new Set<string>();

  const record = (c: ChangeRecord | undefined) => {
    if (!c) return;
    changes.push(c);
    for (const id of c.affected) recompute.add(id);
  };

  for (const op of ops) {
    switch (op.op) {
      case 'set': {
        const before = paramOf(next, op.id);
        next = setParam(next, op.id, op.value, at);
        if (before && next.lastChange?.what === op.id) record(next.lastChange);
        break;
      }
      case 'time': {
        const before = next.time?.t;
        next = setTime(next, op.value, at);
        if (before !== next.time?.t) record(next.lastChange);
        break;
      }
      case 'play':
      case 'pause': {
        if (!next.time) break;
        const playing = op.op === 'play';
        if (!!next.time.playing === playing) break;
        next = { ...next, time: { ...next.time, playing }, version: (next.version ?? 0) + 1 };
        changes.push({ what: 'clock', from: !playing, to: playing, affected: [], at });
        break;
      }
      case 'layer': {
        const layers = next.layers ?? [];
        if (!layers.some((l) => l.id === op.id)) break;
        next = {
          ...next,
          version: (next.version ?? 0) + 1,
          layers: layers.map((l) => (l.id === op.id ? { ...l, on: op.on } : l)),
        };
        // A layer is visibility, not arithmetic: nothing is recomputed, which
        // is why hiding something is instant and changing a control is not.
        changes.push({ what: `layer ${op.id}`, from: !op.on, to: op.on, affected: [], at });
        break;
      }
      case 'select': {
        nextView.selected = op.id;
        break;
      }
      case 'slice': {
        nextView.slice = { axis: op.axis, at: op.at };
        changes.push({ what: 'slice', to: `${op.axis} = ${op.at}`, affected: [], at });
        break;
      }
      case 'unslice': {
        nextView.slice = null;
        changes.push({ what: 'slice', to: 'off', affected: [], at });
        break;
      }
      case 'view': {
        nextView.as = op.as;
        changes.push({ what: 'view', to: op.as, affected: [], at });
        break;
      }
      case 'compare': {
        nextView.comparing = op.on;
        changes.push({ what: 'compare', to: op.on, affected: [], at });
        break;
      }
      case 'reset': {
        // Back to where the model opened. The VIEW is not reset with it: the
        // camera and the selection are the reader's window onto the thing,
        // not part of the thing, and taking them away is a small betrayal.
        next = {
          ...model,
          version: (next.version ?? 0) + 1,
          lastChange: { what: 'reset', affected: model.objects.map((o) => o.id), at },
        };
        for (const o of model.objects) recompute.add(o.id);
        changes.push(next.lastChange!);
        break;
      }
      case 'camera':
        // The camera belongs to the renderer; nothing in the model moves.
        break;
    }
  }

  return { model: next, view: nextView, changes, recompute: [...recompute] };
}

/**
 * What changed, in a sentence a reply can use without inventing anything.
 *
 * Deliberately flat and deliberately boring. The conversation is welcome to
 * say what the change MEANS — that is the interesting half and it is the
 * model's to interpret — but what physically moved is a fact, and a fact
 * should come from the code that moved it.
 */
export function describeChanges(model: Model, changes: readonly ChangeRecord[]): string {
  if (!changes.length) return '';
  const parts = changes.map((c) => {
    const p = paramOf(model, String(c.what));
    const name = p ? p.label : c.what;
    const value = c.to !== undefined ? ` to ${c.to}` : '';
    const reached = c.affected.length
      ? ` — ${c.affected
          .map((id) => objectOf(model, id)?.label ?? id)
          .slice(0, 4)
          .join(', ')} recomputed`
      : '';
    return `${name}${value}${reached}`;
  });
  return parts.join('; ');
}

/**
 * The two states a comparison is between.
 *
 * Kept as whole models rather than as a diff, because the interesting question
 * — "what did that change?" — is answered by asking both of them the same
 * question, and a diff computed up front decides in advance what was worth
 * noticing.
 */
export interface Comparison {
  a: Model;
  b: Model;
  /** controls whose values differ, with both values */
  differs: { id: string; label: string; a: number; b: number }[];
  /** objects a reader should expect to look different */
  affected: string[];
}

export function compare(a: Model, b: Model): Comparison {
  const differs: Comparison['differs'] = [];
  for (const pa of a.params) {
    const pb = paramOf(b, pa.id);
    if (pb && pb.value !== pa.value) {
      differs.push({ id: pa.id, label: pa.label, a: pa.value, b: pb.value });
    }
  }
  return { a, b, differs, affected: affectedBy(b, differs.map((d) => d.id)) };
}
