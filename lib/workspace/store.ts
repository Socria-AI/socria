// lib/workspace/store.ts
//
// THE WORKSPACE, AND WHY IT IS A LOG.
//
// Five things this expansion asks for turn out to be the same thing:
//
//   undo and redo
//   checkpoints somebody can name
//   time travel
//   a diff between two moments
//   "what changed in my thinking?"
//
// All five are questions about the SEQUENCE of changes, and a store that only
// keeps the current state can answer none of them. So the workspace is a
// materialised state plus the events that produced it, and every one of those
// capabilities is a short function over the log rather than a subsystem.
//
// WHAT IT IS NOT. It is not event sourcing as an ideology: the state is kept
// materialised because every read wants it, and the log is bounded because a
// workspace that grows without limit is one that eventually will not load. No
// user ever sees the word "event".
//
// CORRECTIONS ARE THE POINT OF THE WHOLE FILE. When the person says "that is
// an assumption, not evidence", that is not an apology in chat: it is an
// event that changes the object and LOCKS the field, so the next extraction
// cannot quietly change it back. A tool that argues with somebody about their
// own reasoning has stopped being a tool.

import {
  sanitizeObject,
  sanitizeRelationship,
  type Actor,
  type EpistemicState,
  type LockedField,
  type ObjectType,
  type ProvenanceEntry,
  type Relationship,
  type WObject,
} from './object';

// ── the state ───────────────────────────────────────────────────────

export interface Workspace {
  objects: Map<string, WObject>;
  relationships: Map<string, Relationship>;
  /** object id → relationship ids, both directions, for bounded traversal */
  out: Map<string, string[]>;
  into: Map<string, string[]>;
  /** what has happened, oldest first */
  log: WorkspaceEvent[];
  /** where undo would take us: how many events from the end are undone */
  undone: number;
  checkpoints: Checkpoint[];
  /** the branch this state belongs to; 'main' unless somebody forked */
  branch: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  /** the length of the log at the moment it was taken */
  at: number;
  when: number;
  by?: Actor;
  /** the branch it was taken on */
  branch: string;
}

export function emptyWorkspace(branch = 'main'): Workspace {
  return {
    objects: new Map(),
    relationships: new Map(),
    out: new Map(),
    into: new Map(),
    log: [],
    undone: 0,
    checkpoints: [],
    branch,
  };
}

// ── what can happen ─────────────────────────────────────────────────

/**
 * Every change, as data.
 *
 * Deliberately small. Anything bigger — "Socria restructured the map" — is
 * several of these, which is what makes an AI transformation reviewable one
 * piece at a time rather than as a single opaque act.
 */
export type WorkspaceEvent =
  | { e: 'add'; object: WObject; by: Actor; at: number }
  | { e: 'update'; id: string; patch: Partial<WObject>; before: Partial<WObject>; by: Actor; at: number }
  | { e: 'remove'; object: WObject; relationships: Relationship[]; by: Actor; at: number }
  | { e: 'relate'; relationship: Relationship; by: Actor; at: number }
  | { e: 'unrelate'; relationship: Relationship; by: Actor; at: number }
  /** the person saying what something IS. Outranks inference, and sticks. */
  | {
      e: 'correct';
      id: string;
      field: LockedField;
      to: string;
      from: string;
      note?: string;
      by: Actor;
      at: number;
    }
  | { e: 'checkpoint'; checkpoint: Checkpoint; by: Actor; at: number }
  | { e: 'branch'; from: string; to: string; at: number; by: Actor };

/** A short, plain description of one event, for a history somebody reads. */
export function say(ev: WorkspaceEvent, ws?: Workspace): string {
  const name = (id: string) => ws?.objects.get(id)?.label ?? id;
  switch (ev.e) {
    case 'add':
      return `${ev.by === 'user' ? 'You added' : 'Socria added'} ${ev.object.type} “${ev.object.label}”`;
    case 'update': {
      const fields = Object.keys(ev.patch).filter((k) => k !== 'modifiedAt' && k !== 'modifiedBy');
      return `${ev.by === 'user' ? 'You changed' : 'Socria changed'} ${fields.join(', ') || 'something'} on “${name(ev.id)}”`;
    }
    case 'remove':
      return `${ev.by === 'user' ? 'You removed' : 'Socria removed'} “${ev.object.label}”`;
    case 'relate':
      return `${name(ev.relationship.from)} ${ev.relationship.type.replace(/-/g, ' ')} ${name(ev.relationship.to)}`;
    case 'unrelate':
      return `that ${ev.relationship.type.replace(/-/g, ' ')} link was removed`;
    case 'correct':
      return `You said “${name(ev.id)}” is ${ev.to}, not ${ev.from}`;
    case 'checkpoint':
      return `Checkpoint: ${ev.checkpoint.label}`;
    case 'branch':
      return `Branched ${ev.from} → ${ev.to}`;
  }
}

// ── applying ────────────────────────────────────────────────────────

const index = (ws: Workspace, r: Relationship, add: boolean) => {
  const push = (m: Map<string, string[]>, k: string) => {
    const list = m.get(k) ?? [];
    if (add) {
      if (!list.includes(r.id)) list.push(r.id);
    } else {
      const i = list.indexOf(r.id);
      if (i >= 0) list.splice(i, 1);
    }
    m.set(k, list);
  };
  push(ws.out, r.from);
  push(ws.into, r.to);
};

/**
 * One event, applied. Returns a NEW workspace — the maps are copied, which is
 * what lets a caller hold the previous state for a comparison without it
 * changing under them.
 *
 * `record: false` replays without logging, which is how undo and time travel
 * rebuild a past state from the same code the present one was built with. Two
 * code paths for "what the state is" would eventually disagree, and the one
 * that disagreed would be the one nobody was watching.
 */
export function apply(ws: Workspace, ev: WorkspaceEvent, record = true): Workspace {
  const next: Workspace = {
    objects: new Map(ws.objects),
    relationships: new Map(ws.relationships),
    out: new Map([...ws.out].map(([k, v]) => [k, [...v]])),
    into: new Map([...ws.into].map(([k, v]) => [k, [...v]])),
    log: record ? [...ws.log.slice(0, ws.log.length - ws.undone), ev] : ws.log,
    undone: record ? 0 : ws.undone,
    checkpoints: ws.checkpoints,
    branch: ws.branch,
  };

  switch (ev.e) {
    case 'add': {
      const o = sanitizeObject(ev.object);
      if (o) next.objects.set(o.id, o);
      break;
    }
    case 'update': {
      const cur = next.objects.get(ev.id);
      if (!cur) break;
      // A LOCKED FIELD IS THE PERSON'S ANSWER. An update from anybody but
      // them leaves it exactly as it is — silently, because the alternative
      // is a product that tells you it disagrees with your own correction.
      const patch: Partial<WObject> = { ...ev.patch };
      if (ev.by !== 'user') {
        for (const f of cur.locked ?? []) delete patch[f];
      }
      const merged = sanitizeObject({ ...cur, ...patch, modifiedBy: ev.by, modifiedAt: ev.at });
      if (merged) next.objects.set(ev.id, merged);
      break;
    }
    case 'remove': {
      next.objects.delete(ev.object.id);
      for (const r of ev.relationships) {
        next.relationships.delete(r.id);
        index(next, r, false);
      }
      next.out.delete(ev.object.id);
      next.into.delete(ev.object.id);
      break;
    }
    case 'relate': {
      const r = sanitizeRelationship(ev.relationship);
      // A relationship to an object that is not here points at nothing, and
      // an edge to nowhere is how a graph starts lying about its own shape.
      if (!r || !next.objects.has(r.from) || !next.objects.has(r.to)) break;
      next.relationships.set(r.id, r);
      index(next, r, true);
      break;
    }
    case 'unrelate': {
      const r = next.relationships.get(ev.relationship.id);
      if (!r) break;
      if (r.locked && ev.by !== 'user') break;
      next.relationships.delete(r.id);
      index(next, r, false);
      break;
    }
    case 'correct': {
      const cur = next.objects.get(ev.id);
      if (!cur) break;
      const patch: Partial<WObject> = {};
      if (ev.field === 'type') patch.type = ev.to as ObjectType;
      else if (ev.field === 'epistemic') patch.epistemic = ev.to as EpistemicState;
      else if (ev.field === 'label') patch.label = ev.to;
      else if (ev.field === 'claimKind') patch.claimKind = ev.to as WObject['claimKind'];
      const locked = [...new Set([...(cur.locked ?? []), ev.field])];
      const correction: ProvenanceEntry = {
        origin: 'user',
        detail: ev.note || `corrected: ${ev.field}`,
        at: ev.at,
      };
      const prov: ProvenanceEntry[] = [...cur.provenance, correction].slice(-8);
      const merged = sanitizeObject({
        ...cur,
        ...patch,
        locked,
        provenance: prov,
        modifiedBy: ev.by,
        modifiedAt: ev.at,
      });
      if (merged) next.objects.set(ev.id, merged);
      break;
    }
    case 'checkpoint': {
      next.checkpoints = [...ws.checkpoints, ev.checkpoint];
      break;
    }
    case 'branch': {
      next.branch = ev.to;
      break;
    }
  }
  return next;
}

/** Several events as one step, so an AI transformation undoes as one act. */
export function applyAll(ws: Workspace, events: readonly WorkspaceEvent[]): Workspace {
  return events.reduce((s, e) => apply(s, e), ws);
}

// ── rebuilding, undoing, travelling ─────────────────────────────────

/**
 * The state after the first `n` events of a log.
 *
 * The one function undo, redo, checkpoints and time travel are all built on.
 * It replays rather than reversing: an inverse for every event is a second
 * implementation of the semantics, and the day the two disagree is the day
 * somebody loses work.
 */
export function replay(log: readonly WorkspaceEvent[], n = log.length, branch = 'main'): Workspace {
  let ws = emptyWorkspace(branch);
  for (const ev of log.slice(0, Math.max(0, Math.min(n, log.length)))) {
    ws = apply(ws, ev, false);
    if (ev.e === 'checkpoint') ws = { ...ws, checkpoints: [...ws.checkpoints, ev.checkpoint] };
  }
  return { ...ws, log: [...log], undone: Math.max(0, log.length - n) };
}

export function canUndo(ws: Workspace): boolean {
  return ws.log.length - ws.undone > 0;
}
export function canRedo(ws: Workspace): boolean {
  return ws.undone > 0;
}

export function undo(ws: Workspace): Workspace {
  if (!canUndo(ws)) return ws;
  const to = ws.log.length - ws.undone - 1;
  return { ...replay(ws.log, to, ws.branch), checkpoints: ws.checkpoints };
}

export function redo(ws: Workspace): Workspace {
  if (!canRedo(ws)) return ws;
  const to = ws.log.length - ws.undone + 1;
  return { ...replay(ws.log, to, ws.branch), checkpoints: ws.checkpoints };
}

/** The workspace as it stood at a checkpoint. */
export function at(ws: Workspace, checkpointId: string): Workspace | null {
  const cp = ws.checkpoints.find((c) => c.id === checkpointId);
  if (!cp) return null;
  return { ...replay(ws.log, cp.at, cp.branch), checkpoints: ws.checkpoints };
}

// ── the verbs a surface calls ───────────────────────────────────────

const stamp = (at?: number) => at ?? 0;

export function add(ws: Workspace, object: WObject, by: Actor = 'user', at?: number): Workspace {
  return apply(ws, { e: 'add', object, by, at: stamp(at) });
}

export function update(
  ws: Workspace,
  id: string,
  patch: Partial<WObject>,
  by: Actor = 'user',
  at?: number
): Workspace {
  const cur = ws.objects.get(id);
  if (!cur) return ws;
  const before: Partial<WObject> = {};
  for (const k of Object.keys(patch) as (keyof WObject)[]) {
    (before as Record<string, unknown>)[k] = cur[k];
  }
  return apply(ws, { e: 'update', id, patch, before, by, at: stamp(at) });
}

export function remove(ws: Workspace, id: string, by: Actor = 'user', at?: number): Workspace {
  const object = ws.objects.get(id);
  if (!object) return ws;
  const ids = [...(ws.out.get(id) ?? []), ...(ws.into.get(id) ?? [])];
  const relationships = ids
    .map((rid) => ws.relationships.get(rid))
    .filter(Boolean) as Relationship[];
  return apply(ws, { e: 'remove', object, relationships, by, at: stamp(at) });
}

export function relate(ws: Workspace, relationship: Relationship, by: Actor = 'user', at?: number): Workspace {
  return apply(ws, { e: 'relate', relationship, by, at: stamp(at) });
}

export function unrelate(ws: Workspace, id: string, by: Actor = 'user', at?: number): Workspace {
  const relationship = ws.relationships.get(id);
  if (!relationship) return ws;
  return apply(ws, { e: 'unrelate', relationship, by, at: stamp(at) });
}

/**
 * The person saying what something is.
 *
 * "No, that's an assumption." One call, and three things happen: the object
 * changes, the field is locked against later inference, and the correction is
 * added to the provenance so the history says who decided.
 */
export function correct(
  ws: Workspace,
  id: string,
  field: LockedField,
  to: string,
  opts?: { note?: string; at?: number; by?: Actor }
): Workspace {
  const cur = ws.objects.get(id);
  if (!cur) return ws;
  const from = String(cur[field] ?? '');
  if (from === to) return ws;
  return apply(ws, {
    e: 'correct',
    id,
    field,
    to,
    from,
    ...(opts?.note ? { note: opts.note } : {}),
    by: opts?.by ?? 'user',
    at: stamp(opts?.at),
  });
}

export function checkpoint(ws: Workspace, label: string, opts?: { at?: number; by?: Actor }): Workspace {
  const cp: Checkpoint = {
    id: `cp-${ws.log.length}-${label.slice(0, 24).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    label: label.slice(0, 120),
    at: ws.log.length - ws.undone,
    when: stamp(opts?.at),
    by: opts?.by ?? 'user',
    branch: ws.branch,
  };
  return apply(ws, { e: 'checkpoint', checkpoint: cp, by: opts?.by ?? 'user', at: stamp(opts?.at) });
}

/**
 * A branch: the same history, continued separately.
 *
 * ANCESTRY IS THE WHOLE POINT. A fork that forgets where it came from cannot
 * be compared with its parent afterwards, and comparing them is the reason
 * anybody branches reasoning — "what does this look like without that
 * assumption?" is a question about two states of ONE line of thought.
 */
export function branch(ws: Workspace, name: string, opts?: { at?: number; by?: Actor }): Workspace {
  const to = name.slice(0, 60).replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'branch';
  return apply(ws, { e: 'branch', from: ws.branch, to, by: opts?.by ?? 'user', at: stamp(opts?.at) });
}

// ── comparing two moments ───────────────────────────────────────────

export interface Difference {
  added: WObject[];
  removed: WObject[];
  changed: { before: WObject; after: WObject; fields: string[] }[];
  relationsAdded: Relationship[];
  relationsRemoved: Relationship[];
}

const FIELDS: (keyof WObject)[] = [
  'type', 'label', 'content', 'meaning', 'epistemic', 'claimKind',
  'question', 'value', 'units',
];

/**
 * What is different between two workspaces.
 *
 * MEANINGFUL FIELDS ONLY. `modifiedAt` differs on everything somebody has
 * touched and says nothing; a diff that reports it buries the two changes
 * that matter under forty that do not.
 */
export function diff(a: Workspace, b: Workspace): Difference {
  const added: WObject[] = [];
  const removed: WObject[] = [];
  const changed: Difference['changed'] = [];

  for (const [id, after] of b.objects) {
    const before = a.objects.get(id);
    if (!before) {
      added.push(after);
      continue;
    }
    const fields = FIELDS.filter((f) => before[f] !== after[f]);
    // Provenance grows as a thing gains support, and that IS a change worth
    // seeing: "you wrote it" becoming "you wrote it, and two sources support
    // it" is the shape of somebody's thinking moving.
    if (before.provenance.length !== after.provenance.length) fields.push('provenance');
    if (fields.length) changed.push({ before, after, fields: fields as string[] });
  }
  for (const [id, before] of a.objects) if (!b.objects.has(id)) removed.push(before);

  const relationsAdded = [...b.relationships.values()].filter((r) => !a.relationships.has(r.id));
  const relationsRemoved = [...a.relationships.values()].filter((r) => !b.relationships.has(r.id));
  return { added, removed, changed, relationsAdded, relationsRemoved };
}

/**
 * What changed in the thinking, said in sentences.
 *
 * GROUNDED, AND ONLY GROUNDED. Every line is produced from a state change
 * that actually happened — an assumption that gained a source, a claim whose
 * type the person corrected, a question that closed. Nothing here reads
 * character, infers a trend, or tells anybody they are becoming a better
 * thinker; those are not facts about the workspace, and this function can
 * only see the workspace.
 */
export function whatChanged(a: Workspace, b: Workspace, limit = 12): string[] {
  const d = diff(a, b);
  const lines: string[] = [];

  for (const c of d.changed) {
    if (c.fields.includes('type')) {
      lines.push(`“${c.after.label}” went from ${c.before.type} to ${c.after.type}.`);
    }
    if (c.fields.includes('epistemic')) {
      lines.push(`“${c.after.label}” went from ${c.before.epistemic.replace(/-/g, ' ')} to ${c.after.epistemic.replace(/-/g, ' ')}.`);
    }
    if (c.fields.includes('provenance') && c.after.provenance.length > c.before.provenance.length) {
      const gained = c.after.provenance.slice(c.before.provenance.length);
      lines.push(`“${c.after.label}” picked up ${gained.length} more ${gained.length === 1 ? 'source of support' : 'sources of support'}.`);
    }
    if (c.fields.includes('question') && c.after.question) {
      lines.push(`The question “${c.after.label}” is now ${c.after.question.replace(/-/g, ' ')}.`);
    }
    if (c.fields.includes('value')) {
      lines.push(`${c.after.label} moved from ${c.before.value} to ${c.after.value}.`);
    }
  }
  for (const o of d.added) {
    if (o.type === 'assumption' || o.type === 'question' || o.type === 'evidence') {
      lines.push(`A new ${o.type}: “${o.label}”.`);
    }
  }
  for (const o of d.removed) lines.push(`“${o.label}” is no longer here.`);
  for (const r of d.relationsRemoved) {
    lines.push(`The ${r.type.replace(/-/g, ' ')} link between two things was dropped.`);
  }
  return lines.slice(0, limit);
}

// ── keeping it loadable ─────────────────────────────────────────────

/**
 * The log, bounded.
 *
 * A workspace somebody works in for a year cannot keep every event forever,
 * and the honest way to bound it is to fold the oldest ones into the state
 * they produced: the objects survive exactly as they are, and what is lost is
 * the ability to undo back past the fold. Checkpoints are kept, so the coarse
 * history outlives the fine one.
 *
 * WHAT IT PROMISES, PRECISELY: afterwards the log is the current state plus
 * the last `keep` events — NOT that it is shorter. A workspace of four
 * thousand objects created one at a time cannot be folded below four thousand
 * events, because those events ARE the state, and a compaction that "shrank"
 * it would be one that lost objects. Where the fold would not pay for itself,
 * nothing happens.
 */
export function compact(ws: Workspace, keep = 500): Workspace {
  if (ws.log.length <= keep) return ws;
  if (ws.objects.size + ws.relationships.size + keep >= ws.log.length) return ws;
  const foldTo = ws.log.length - keep;
  const base = replay(ws.log, foldTo, ws.branch);
  const seed: WorkspaceEvent[] = [...base.objects.values()].map((object) => ({
    e: 'add' as const,
    object,
    by: (object.createdBy ?? 'system') as Actor,
    at: object.createdAt ?? 0,
  }));
  const links: WorkspaceEvent[] = [...base.relationships.values()].map((relationship) => ({
    e: 'relate' as const,
    relationship,
    by: (relationship.createdBy ?? 'system') as Actor,
    at: relationship.createdAt ?? 0,
  }));
  const log = [...seed, ...links, ...ws.log.slice(foldTo)];
  return {
    ...replay(log, log.length, ws.branch),
    checkpoints: ws.checkpoints.map((c) => ({ ...c, at: Math.max(0, c.at - foldTo + seed.length + links.length) })),
  };
}

/** The whole workspace as something that can be written down. */
export function serialize(ws: Workspace): {
  version: number;
  branch: string;
  objects: WObject[];
  relationships: Relationship[];
  checkpoints: Checkpoint[];
} {
  return {
    version: 1,
    branch: ws.branch,
    objects: [...ws.objects.values()],
    relationships: [...ws.relationships.values()],
    checkpoints: ws.checkpoints,
  };
}
