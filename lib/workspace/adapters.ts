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
//   a Mind node's provenance kinds → one standing, with STATED WINNING.  A
//     claim first inferred from a remark and later said outright is asserted,
//     not inferred: a statement is not undone by an earlier guess. Status
//     overrides where it says something the kinds cannot — `superseded` is a
//     change of mind, not a dispute.

import type { LedgerEntry, LedgerLink } from '@/lib/core4/types';
import type { LogosEdge, LogosNode, ThinkingMap } from '@/lib/logos';
import type { Model, ModelObject } from '@/lib/model/schema';
import {
  normalize,
  type MindEdge,
  type MindGraph,
  type MindNode,
  type NodeStatus,
  type ProvenanceKind,
} from '@/lib/mind/types';
import {
  OBJECT_TYPES,
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

// ── durable memory ──────────────────────────────────────────────────
//
// THIS IS WHAT MAKES THE WORKSPACE OUTLIVE ONE MAP.
//
// The Mind Graph (lib/mind) is the only store here that persists across
// sessions: rows in mind_nodes and mind_edges, the same rows Core reads to
// build a prompt and the same rows the Memory page shows. Projecting it means
// a trace that starts on a node drawn ten minutes ago can reach something the
// person said in March, without either store copying the other.
//
// PRIVACY IS NOT A PREFERENCE HERE. A node marked private came from a weighty
// Core conversation and has never been allowed into Logos, whose map can be
// exported as an image (invariant 3 in lib/mind/types.ts). `excludePrivate`
// keeps that true through the projection, and every caller that hands a
// workspace to Logos or to an export must pass it.

const MIND_TYPE: Record<string, ObjectType> = {
  person: 'person', organization: 'organization', project: 'project', place: 'place',
  concept: 'concept', goal: 'goal', plan: 'plan', decision: 'decision',
  preference: 'preference', belief: 'belief', assumption: 'assumption',
  question: 'question', uncertainty: 'uncertainty', insight: 'insight',
  evidence: 'evidence', source: 'source', event: 'event',
  experience: 'experience', conversation: 'conversation',
};

/**
 * Mind relationships, some of them turned around.
 *
 * `invert` is the interesting column. "A is used_by B" and "B uses A" are the
 * same fact, and the workspace already has the second, so the projection
 * turns the arrow rather than inventing a synonym — which also puts A upstream
 * of B, where a dependency belongs. Adding a mirrored relation type instead
 * would have made every traversal check two names for one thing.
 */
const MIND_REL: Record<string, { type: RelationType; invert?: boolean; why?: string }> = {
  supports: { type: 'supports' },
  contradicts: { type: 'contradicts' },
  depends_on: { type: 'depends-on' },
  part_of: { type: 'part-of' },
  belongs_to: { type: 'part-of' },
  caused: { type: 'causes' },
  resulted_in: { type: 'causes' },
  evidence_for: { type: 'evidence-for' },
  derived_from: { type: 'derived-from' },
  learned_from: { type: 'derived-from', why: 'learned from' },
  version_of: { type: 'derived-from', why: 'a version of' },
  changed_into: { type: 'transforms-into' },
  superseded_by: { type: 'transforms-into', why: 'superseded by' },
  constrained_by: { type: 'constrains', invert: true, why: 'constrains it' },
  motivated_by: { type: 'motivated-by' },
  used_by: { type: 'uses', invert: true, why: 'uses it' },
  associated_with: { type: 'relates-to' },
  works_on: { type: 'relates-to', why: 'works on' },
  mentioned_in: { type: 'relates-to', why: 'mentioned in' },
  relevant_to: { type: 'relates-to', why: 'relevant to' },
  created_in: { type: 'relates-to', why: 'created in' },
  discussed_in: { type: 'relates-to', why: 'discussed in' },
  shared_with: { type: 'relates-to', why: 'shared with' },
};

const KIND_STATE: Record<ProvenanceKind, EpistemicState> = {
  stated: 'user-asserted',
  established: 'user-asserted',
  inferred: 'inferred',
  hypothesis: 'uncertain',
  tentative: 'uncertain',
  hypothetical: 'assumed',
  temporary: 'illustrative',
  joke: 'illustrative',
  example: 'illustrative',
  researched: 'source-supported',
  calculated: 'computed',
};

/** Where a ground came from, by the surface that recorded it. */
function mindOrigin(p: { kind: ProvenanceKind; surface: string }): ProvenanceEntry['origin'] {
  if (p.surface === 'file') return 'uploaded-source';
  if (p.surface === 'import') return 'imported';
  if (p.surface === 'tool') return 'connected-source';
  if (p.surface === 'user') return 'user';
  if (p.kind === 'stated' || p.kind === 'established') return 'user';
  if (p.kind === 'researched') return 'research-source';
  if (p.kind === 'calculated') return 'computation';
  if (p.kind === 'hypothesis') return 'socria-generated';
  return 'socria-inference';
}

/** What a status says that the grounds cannot. */
const STATUS_STATE: Partial<Record<NodeStatus, EpistemicState>> = {
  contradicted: 'disputed',
  superseded: 'superseded',
  uncertain: 'uncertain',
  tentative: 'uncertain',
};

/**
 * A Mind type, into a workspace type.
 *
 * The table first, then the shared vocabulary BY NAME, then 'concept'. The
 * middle step matters more than it looks: Mind types are open strings and the
 * extractor invents them freely, so a node typed Constraint or Criterion —
 * words this vocabulary already has — would otherwise arrive as a generic
 * concept and stop being traceable as what it is.
 */
function mindType(raw: string): ObjectType {
  const key = normalize(raw);
  const known = MIND_TYPE[key];
  if (known) return known;
  const hyphenated = key.replace(/\s+/g, '-');
  if ((OBJECT_TYPES as readonly string[]).includes(hyphenated)) return hyphenated as ObjectType;
  return 'concept';
}

export function fromMindNode(n: MindNode): WObject {
  const provenance: ProvenanceEntry[] = n.provenance.map((p) => ({
    origin: mindOrigin(p),
    at: p.at,
    ...(p.note ? { detail: p.note } : {}),
    ...(p.sourceNodeId ? { from: `mind:${p.sourceNodeId}` } : {}),
  }));
  if (!provenance.length) provenance.push({ origin: 'system', at: n.createdAt });

  // Stated wins over inferred whenever both are on the record; otherwise the
  // most recent ground decides, because grounds accumulate in order.
  const kinds = n.provenance.map((p) => p.kind);
  const said = kinds.includes('stated') || kinds.includes('established');
  const last = kinds.length ? kinds[kinds.length - 1] : undefined;
  const fromKinds: EpistemicState = said
    ? 'user-asserted'
    : last
      ? (KIND_STATE[last] ?? 'unknown')
      : 'unknown';

  // The person having spoken about it at all settles what it IS. Extraction
  // may keep adding grounds; it may not re-title or re-type their own words.
  const touched = n.provenance.some((p) => p.surface === 'user');

  return {
    id: `mind:${n.id}`,
    type: mindType(n.type),
    label: n.label.slice(0, 300),
    provenance,
    epistemic: STATUS_STATE[n.status] ?? fromKinds,
    ...(n.content ? { content: n.content } : {}),
    surface: 'mind',
    surfaceId: n.id,
    createdBy: said ? 'user' : 'socria',
    createdAt: n.createdAt,
    modifiedAt: n.updatedAt,
    ...(touched ? { locked: ['label' as const, 'type' as const] } : {}),
    meta: {
      status: n.status,
      seen: n.seen,
      // Carried so an export or a Logos-bound projection can be checked
      // rather than trusted. Private nodes should never be in one at all.
      ...(n.private ? { private: true } : {}),
    },
  };
}

export function fromMindEdge(e: MindEdge): Relationship {
  const m = MIND_REL[normalize(e.relationship).replace(/\s+/g, '_')] ?? {
    type: 'relates-to' as RelationType,
    why: e.relationship,
  };
  const from = `mind:${m.invert ? e.targetId : e.sourceId}`;
  const to = `mind:${m.invert ? e.sourceId : e.targetId}`;
  const note = [...e.provenance].reverse().find((p) => p.note)?.note;
  const stated = e.provenance.some((p) => p.kind === 'stated' || p.surface === 'user');
  return {
    id: `mind:${e.id}`,
    type: m.type,
    from,
    to,
    provenance: e.provenance.length
      ? e.provenance.map((p) => ({
          origin: mindOrigin(p),
          at: p.at,
          ...(p.note ? { detail: p.note } : {}),
        }))
      : [{ origin: 'system', at: e.createdAt }],
    ...(note ?? m.why ? { why: note ?? m.why } : {}),
    createdBy: stated ? 'user' : 'socria',
    createdAt: e.createdAt,
  };
}

export interface ProjectMindOptions {
  /**
   * Leave out nodes from weighty Core conversations. Required for anything
   * Logos or an export will see — see the note above.
   */
  excludePrivate?: boolean;
}

/**
 * Durable memory, projected.
 *
 * Edges whose endpoints did not survive the projection are dropped rather than
 * left dangling: an edge to a private node would otherwise tell a reader that
 * something is there and refuse to say what, which is worse than silence.
 */
export function projectMind(ws: Workspace, graph: MindGraph, opts?: ProjectMindOptions): Workspace {
  let next = ws;
  const kept = new Set<string>();
  for (const n of graph.nodes) {
    if (opts?.excludePrivate && n.private) continue;
    kept.add(n.id);
    const o = fromMindNode(n);
    next = add(next, o, o.createdBy === 'user' ? 'user' : 'socria', n.createdAt);
  }
  for (const e of graph.edges) {
    if (!kept.has(e.sourceId) || !kept.has(e.targetId)) continue;
    const r = fromMindEdge(e);
    next = relate(next, r, r.createdBy === 'user' ? 'user' : 'socria', e.createdAt);
  }
  return next;
}

/**
 * Join the surfaces where they are talking about the same thing.
 *
 * Matching is by normalised label, the same key durable memory already uses
 * for identity and for tombstones (fingerprintNode) — so this agrees with what
 * the store itself thinks is one thing, rather than inventing a second notion
 * of sameness. It only ever links ACROSS surfaces: two nodes in one map with
 * the same words are that map's business.
 *
 * Nothing is merged. A merge would have to pick a winner, and the reason to
 * keep both is that the durable one carries months of grounds while the
 * session one carries where the person is right now.
 */
export function bridgeSurfaces(ws: Workspace, at = 0): Workspace {
  const byLabel = new Map<string, WObject[]>();
  for (const o of ws.objects.values()) {
    const key = normalize(o.label);
    if (!key) continue;
    const list = byLabel.get(key);
    if (list) list.push(o);
    else byLabel.set(key, [o]);
  }

  let next = ws;
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    const durable = group.find((o) => o.surface === 'mind');
    if (!durable) continue;
    for (const o of group) {
      if (o.id === durable.id || o.surface === 'mind') continue;
      next = relate(next, sameAs(o.id, durable.id, 'the same thing, remembered'), 'system', at);
    }
  }
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
    type: 'same-as',
    from: a,
    to: b,
    provenance: [{ origin: 'system', detail: why }],
    why,
    createdBy: 'system',
  };
}
