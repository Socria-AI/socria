// lib/workspace/adapters.ts
//
// THE PART THAT MAKES THIS A UNIFICATION AND NOT A FOURTH STORE.
//
// Socria already keeps intellectual objects in three places, and none of them
// is going away:
//
//   the Reasoning Ledger   the careful one — owner, stance, basis, revisions
//   the Thinking Map       the visible one — typed nodes, drawn edges
//   the model engine       the computed one — definitions, fidelity, params
//
// Each stays authoritative for what it holds. These adapters PROJECT them into
// the shared vocabulary, keeping their own ids, so a person can select a thing
// from any of them and ask the same six questions. Nothing here copies data
// back; nothing here becomes the truth. The surfaces remain the truth.
//
// THE TRANSLATIONS THAT MATTER, and they are all about not losing a
// distinction that one store makes and another does not:
//
//   owner + basis → provenance + epistemic state.  A ledger entry owned by
//     the person and quoted is user-asserted; the same kind of entry inferred
//     by the reader is inferred, and the gap between those two is the whole
//     reason the ledger records basis at all.
//   fidelity → epistemic state.  An integrated trajectory is `computed`; a
//     drawing made to be legible is `illustrative`. The engine earned those
//     labels by the code path (lib/model/compile.ts) and they survive here.
//   a map node with no other evidence → inferred, not asserted.  The map is
//     extracted from conversation, and extraction is a guess until somebody
//     says otherwise.

import type { LedgerEntry, LedgerLink } from '@/lib/core4/types';
import type { LogosEdge, LogosNode, ThinkingMap } from '@/lib/logos';
import type { Model, ModelObject } from '@/lib/model/schema';
import {
  type EpistemicState,
  type ObjectType,
  type ProvenanceEntry,
  type RelationType,
  type Relationship,
  type WObject,
} from './object';
import { add, relate, type Workspace } from './store';

// ── the reasoning ledger ────────────────────────────────────────────

const LEDGER_TYPE: Record<string, ObjectType> = {
  claim: 'claim', assumption: 'assumption', evidence: 'evidence', question: 'question',
  hypothesis: 'hypothesis', alternative: 'alternative', objection: 'objection',
  decision: 'decision', uncertainty: 'uncertainty', conclusion: 'conclusion',
  constraint: 'constraint', option: 'option',
};

const LEDGER_REL: Record<string, RelationType> = {
  supports: 'supports', contradicts: 'contradicts', depends_on: 'depends-on',
  assumes: 'assumes', responds_to: 'responds-to', rejected_because: 'rejected-because',
  changed_because: 'changed-because', resolves: 'resolves', reopens: 'reopens',
  derived_from: 'derived-from',
};

/**
 * Owner and basis, into provenance and standing.
 *
 * THE TABLE IS THE ARGUMENT. A ledger entry carries who introduced it and how
 * well it is grounded in their words, and those two facts answer two different
 * questions — where it came from, and how firmly it is held. Collapsing them
 * would make "the person said this, exactly" and "we think they meant this"
 * look identical, which is the mistake the ledger was built to avoid.
 */
function standingOf(e: Pick<LedgerEntry, 'owner' | 'basis' | 'stance' | 'status'>): EpistemicState {
  if (e.status === 'disputed') return 'disputed';
  if (e.owner === 'user') {
    if (e.basis === 'inferred') return 'inferred';
    return e.stance === 'asserts' ? 'user-asserted' : e.stance === 'asks' ? 'unknown' : 'assumed';
  }
  if (e.owner === 'external') return 'source-supported';
  if (e.owner === 'socria') return 'inferred';
  return 'unknown';
}

export function fromLedgerEntry(e: LedgerEntry): WObject {
  const provenance: ProvenanceEntry[] = [];
  if (e.owner === 'user') {
    provenance.push({ origin: 'user', at: e.createdAt, ...(e.quote ? { quote: e.quote } : {}) });
  } else if (e.owner === 'socria') {
    provenance.push({ origin: e.basis === 'inferred' ? 'socria-inference' : 'socria-generated', at: e.createdAt });
  } else if (e.owner === 'external') {
    provenance.push({ origin: 'research-source', at: e.createdAt, ...(e.reason ? { detail: e.reason } : {}) });
  } else {
    provenance.push({ origin: 'system', at: e.createdAt });
  }

  return {
    id: e.id,
    type: LEDGER_TYPE[e.kind] ?? 'idea',
    label: e.text.slice(0, 300),
    provenance,
    epistemic: standingOf(e),
    surface: 'ledger',
    surfaceId: e.id,
    createdBy: e.owner === 'user' ? 'user' : e.owner === 'socria' ? 'socria' : 'system',
    createdAt: e.createdAt,
    modifiedAt: e.updatedAt,
    // A corrected entry is a decided entry: the ledger records corrections in
    // its revisions, and a field the person has settled must not be re-typed
    // by the next extraction.
    ...(e.revisions?.some((r) => r.change === 'corrected' && r.by === 'user')
      ? { locked: ['type' as const] }
      : {}),
    ...(e.reason ? { meaning: e.reason } : {}),
  };
}

export function fromLedgerLink(l: LedgerLink): Relationship {
  return {
    id: l.id,
    type: LEDGER_REL[l.rel] ?? 'relates-to',
    from: l.from,
    to: l.to,
    provenance: [
      {
        origin: l.owner === 'user' ? 'user' : l.owner === 'socria' ? 'socria-inference' : 'system',
        at: l.createdAt,
        ...(l.reason ? { detail: l.reason } : {}),
      },
    ],
    ...(l.reason ? { why: l.reason } : {}),
    createdBy: l.owner === 'user' ? 'user' : l.owner === 'socria' ? 'socria' : 'system',
    createdAt: l.createdAt,
  };
}

// ── the thinking map ────────────────────────────────────────────────

const MAP_TYPE: Record<string, ObjectType> = {
  goal: 'goal', decision: 'decision', value: 'value', belief: 'belief', idea: 'idea',
  assumption: 'assumption', evidence: 'evidence', question: 'question', tension: 'tension',
  consequence: 'consequence', claim: 'claim', counterpoint: 'objection', source: 'source',
  concept: 'concept', misconception: 'misconception',
};

const MAP_REL: Record<string, RelationType> = {
  supports: 'supports', conflicts: 'contradicts', depends: 'depends-on', relates: 'relates-to',
};

/**
 * A map node.
 *
 * INFERRED UNLESS THE MAP SAYS OTHERWISE. The Thinking Map is extracted from
 * what somebody said, and an extraction is Socria's reading of them — so a
 * node arrives as `socria-inference` and becomes theirs only when they touch
 * it. Marking extracted nodes as the person's assertions would put words in
 * their mouth at the exact place this product promises not to.
 */
export function fromMapNode(n: LogosNode, opts?: { at?: number }): WObject {
  const byUser = !!n.by;
  return {
    id: `map:${n.id}`,
    type: MAP_TYPE[n.type] ?? 'idea',
    label: n.label.slice(0, 300),
    provenance: [
      byUser
        ? { origin: 'user', at: opts?.at }
        : { origin: 'socria-inference', detail: 'extracted from the conversation', at: opts?.at },
    ],
    epistemic: byUser ? 'user-asserted' : 'inferred',
    surface: 'map',
    surfaceId: n.id,
    createdBy: byUser ? 'user' : 'socria',
    ...(n.note ? { meaning: n.note } : {}),
    ...(n.status ? { meta: { status: String(n.status) } } : {}),
  };
}

export function fromMapEdge(e: LogosEdge, opts?: { at?: number }): Relationship {
  return {
    id: `map:${e.from}->${e.to}:${e.relation}`,
    type: MAP_REL[e.relation] ?? 'relates-to',
    from: `map:${e.from}`,
    to: `map:${e.to}`,
    provenance: [{ origin: 'socria-inference', detail: 'drawn from the conversation', at: opts?.at }],
    createdBy: 'socria',
    ...(e.op ? { why: e.op } : {}),
  };
}

// ── the model engine ────────────────────────────────────────────────

const MODEL_TYPE: Record<string, ObjectType> = {
  surface: 'visual-object', volume: 'visual-object', curve: 'visual-object',
  trajectory: 'simulation-run', field: 'visual-object', point: 'datapoint',
  particle: 'component', node: 'component', vector: 'visual-object',
  dataset: 'dataset', measurement: 'observation', equation: 'equation',
  system: 'model', constraint: 'constraint', objective: 'criterion',
  assumption: 'assumption', 'initial-condition': 'parameter',
  'boundary-condition': 'parameter', annotation: 'annotation', source: 'source',
  scalar: 'variable', variable: 'variable', parameter: 'parameter', constant: 'definition',
  distribution: 'dataset', series: 'dataset', region: 'visual-object', boundary: 'visual-object',
  mesh: 'visual-object', graph: 'model', axis: 'annotation', grid: 'annotation',
  line: 'visual-object', ray: 'visual-object', plane: 'visual-object', tensor: 'variable',
  uncertainty: 'uncertainty',
};

/** Fidelity, which the engine EARNED by its code path, becomes standing. */
const FIDELITY_STATE: Record<string, EpistemicState> = {
  'numerically-computed': 'computed',
  simulated: 'simulated',
  'model-derived': 'computed',
  'data-derived': 'observed',
  conceptual: 'illustrative',
};

export function fromModelObject(m: Model, o: ModelObject): WObject {
  const prov: ProvenanceEntry[] = [];
  const origin = o.provenance?.origin;
  if (origin === 'user') prov.push({ origin: 'user' });
  else if (origin === 'inference') prov.push({ origin: 'socria-inference' });
  else if (origin === 'computation') prov.push({ origin: 'computation', ...(o.provenance?.detail ? { detail: o.provenance.detail } : {}) });
  else if (origin === 'simulation') prov.push({ origin: 'simulation' });
  else if (origin === 'dataset') prov.push({ origin: 'dataset' });
  else if (origin === 'source') prov.push({ origin: 'research-source', ...(o.provenance?.detail ? { detail: o.provenance.detail } : {}) });
  else prov.push({ origin: 'system', detail: 'the model states it' });

  return {
    id: `model:${m.id}:${o.id}`,
    type: MODEL_TYPE[o.kind] ?? 'visual-object',
    label: o.label,
    provenance: prov,
    epistemic: FIDELITY_STATE[o.fidelity ?? 'conceptual'] ?? 'illustrative',
    surface: 'model',
    surfaceId: o.id,
    ...(o.meaning ? { meaning: o.meaning } : {}),
    ...(o.definition ? { content: o.definition } : {}),
    ...(o.value !== undefined ? { value: o.value } : {}),
    ...(o.units ? { units: o.units } : {}),
    ...(o.uncertainty ? { uncertainty: o.uncertainty } : {}),
    meta: { model: m.id, kind: o.kind },
  };
}

/** A model's controls are objects too: they are what somebody manipulates. */
export function fromModelParam(m: Model, p: Model['params'][number]): WObject {
  return {
    id: `model:${m.id}:param:${p.id}`,
    type: 'parameter',
    label: p.label,
    provenance: [{ origin: 'user', detail: 'a control of this model' }],
    epistemic: 'user-asserted',
    value: p.value,
    ...(p.units ? { units: p.units } : {}),
    ...(p.means ? { meaning: p.means } : {}),
    surface: 'model',
    surfaceId: p.id,
    meta: { model: m.id, min: p.min, max: p.max },
  };
}

// ── projecting a whole surface ──────────────────────────────────────

/**
 * A model, projected: its objects, its controls, and the dependencies it
 * already declares.
 *
 * The dependency edges are not invented here — the engine's objects already
 * say which controls they move with, which is what makes "what would change if
 * I moved this?" answerable across surfaces rather than only inside the model.
 */
export function projectModel(ws: Workspace, m: Model, at = 0): Workspace {
  let next = ws;
  for (const p of m.params) next = add(next, fromModelParam(m, p), 'user', at);
  for (const o of m.objects) next = add(next, fromModelObject(m, o), 'socria', at);
  for (const o of m.objects) {
    for (const d of o.depends ?? []) {
      const from = `model:${m.id}:${o.id}`;
      const to = `model:${m.id}:param:${d}`;
      if (!next.objects.has(to)) continue;
      next = relate(
        next,
        {
          id: `${from}~depends~${to}`,
          type: 'depends-on',
          from,
          to,
          provenance: [{ origin: 'system', detail: 'declared by the model' }],
          createdBy: 'system',
          createdAt: at,
        },
        'system',
        at
      );
    }
    for (const r of o.relations ?? []) {
      const from = `model:${m.id}:${o.id}`;
      const to = `model:${m.id}:${r.to}`;
      if (!next.objects.has(to)) continue;
      next = relate(
        next,
        {
          id: `${from}~${r.as}~${to}`,
          type: (r.as as RelationType) ?? 'relates-to',
          from,
          to,
          provenance: [{ origin: 'system', detail: 'declared by the model' }],
          ...(r.why ? { why: r.why } : {}),
          createdBy: 'system',
          createdAt: at,
        },
        'system',
        at
      );
    }
  }
  return next;
}

/** A Thinking Map, projected. Ids are prefixed, so a round trip is exact. */
export function projectMap(ws: Workspace, map: ThinkingMap, at = 0): Workspace {
  let next = ws;
  for (const n of map.nodes) next = add(next, fromMapNode(n, { at }), n.by ? 'user' : 'socria', at);
  for (const e of map.edges) next = relate(next, fromMapEdge(e, { at }), 'socria', at);
  return next;
}

/** A ledger, projected. */
export function projectLedger(
  ws: Workspace,
  entries: readonly LedgerEntry[],
  links: readonly LedgerLink[],
  at = 0
): Workspace {
  let next = ws;
  for (const e of entries) {
    if (e.status === 'retracted') continue;
    next = add(next, fromLedgerEntry(e), e.owner === 'user' ? 'user' : 'socria', at);
  }
  for (const l of links) next = relate(next, fromLedgerLink(l), l.owner === 'user' ? 'user' : 'socria', at);
  return next;
}

/**
 * The same thing in two surfaces.
 *
 * A claim in the ledger and the node the map drew for it are one object to the
 * person looking at them. `sameAs` records that, so a trace of either reaches
 * the other's evidence — and it is a RELATIONSHIP rather than a merge, because
 * merging would mean deciding which surface's copy is the real one, and both
 * are real on their own terms.
 */
export function sameAs(a: string, b: string, why = 'the same thing on two surfaces'): Relationship {
  return {
    id: `${a}~same~${b}`,
    type: 'relates-to',
    from: a,
    to: b,
    provenance: [{ origin: 'system', detail: why }],
    why,
    createdBy: 'system',
  };
}
