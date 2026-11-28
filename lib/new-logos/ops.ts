// lib/new-logos/ops.ts — WHAT CAN BE DONE TO A NODE, and what cannot.
//
// Every write in New Logos goes through here, against a NodeStore (store.ts), scoped to one owner. The rules:
//
//   CONTAINMENT IS A TREE OF OBJECTIVES. Only an objective contains; a node has one parent or none (the top level).
//   A move that would put a node inside itself or inside something it contains is refused (no cycles), and so is a
//   move into an archived objective. There is no depth limit.
//
//   NOTHING IS DELETED BY ACCIDENT. Archiving is the ordinary way to take something away, and it is reversible.
//   Deleting is permanent and allowed only for a node that is already archived and contains nothing — never
//   recursively. A conversation node is the exception the other way: it holds only a placement, so removing it is
//   always allowed and never touches the canonical conversation, which simply returns to the unplaced list.
//
//   A DECISION IS THE PERSON'S ONLY WHEN THEY ACCEPT IT. No create or edit can set a decision to `accepted`; only the
//   accept action does, and it records when (provenance.approvedAt). An AI-proposed decision therefore can never
//   appear as an approved one without the person's act.
//
//   AN ARTIFACT CHANGES BY OPERATIONS. Its content is a composition of primitives (lib/new-logos/primitives.ts),
//   changed through the validated operation vocabulary (artifact-ops.ts) applied to whatever is stored when the batch
//   arrives — so concurrent edits to different primitives both land. A burst of such edits keeps one version (the state
//   before the burst), not one per slider movement.
//
//   EDITS ARE VERSIONED. Each change to what a node says (title, description, content, state, parent) keeps the
//   previous state as a version, the last LIMITS.versionsKept of them. Writes are compare-and-swap on the node's
//   version, so an edit made from a stale copy is refused ("conflict") instead of overwriting a newer one.

import {
  LIMITS,
  TYPE_LABEL,
  cleanId,
  cleanText,
  defaultState,
  isNodeType,
  isRelationKind,
  newId,
  sanitizeContent,
  sanitizeProvenance,
  snapshotOf,
  validState,
  type NodeRow,
  type NodeType,
  type Provenance,
  type RelationRow,
  type VersionRow,
} from './model';
import type { NodeStore } from './store';
import { applyOps, parseOps } from './artifact-ops';
import { mediaIdsOf, sanitizeComposition } from './primitives';

export type NlErrorCode =
  | 'invalid'
  | 'not_found'
  | 'bad_parent'
  | 'cycle'
  | 'archived'
  | 'conflict'
  | 'has_children'
  | 'not_archived'
  | 'needs_acceptance'
  | 'conversation_unknown'
  | 'duplicate'
  | 'limit';

export interface NlError {
  code: NlErrorCode;
  message: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: NlError };
const fail = <T>(code: NlErrorCode, message: string): Result<T> => ({ ok: false, error: { code, message } });
const done = <T>(value: T): Result<T> => ({ ok: true, value });

// ── the tree ─────────────────────────────────────────────────────────

export type NodeIndex = Map<string, NodeRow>;
export const indexNodes = (nodes: NodeRow[]): NodeIndex => new Map(nodes.map((n) => [n.id, n]));

/** A node's ancestors, the top first. Guarded against a damaged chain (never loops). */
export function ancestorsOf(index: NodeIndex, id: string): NodeRow[] {
  const out: NodeRow[] = [];
  const seen = new Set<string>([id]);
  let at = index.get(id)?.parent_id ?? null;
  while (at && !seen.has(at)) {
    seen.add(at);
    const p = index.get(at);
    if (!p) break;
    out.unshift(p);
    at = p.parent_id;
  }
  return out;
}

/** Whether `candidate` is `id` or lies anywhere inside it. */
export function isWithin(index: NodeIndex, candidate: string, id: string): boolean {
  if (candidate === id) return true;
  return ancestorsOf(index, candidate).some((a) => a.id === id);
}

/** Why `nodeId` (null: a new node) cannot be placed in `parentId` (null: the top level), or null when it can. */
export function placementError(index: NodeIndex, nodeId: string | null, parentId: string | null): NlError | null {
  if (parentId === null) return null;
  const parent = index.get(parentId);
  if (!parent) return { code: 'bad_parent', message: 'That objective does not exist.' };
  if (parent.type !== 'objective') return { code: 'bad_parent', message: 'Only an objective can contain other nodes.' };
  if (parent.archived_at !== null) return { code: 'archived', message: 'That objective is archived. Restore it first.' };
  if (nodeId && isWithin(index, parentId, nodeId)) return { code: 'cycle', message: 'A node cannot be placed inside itself or inside something it contains.' };
  return null;
}

/** A matrix's members: the active nodes directly inside `parentId`, in their order. */
export function childrenOf(nodes: NodeRow[], parentId: string | null, opts: { archived?: boolean } = {}): NodeRow[] {
  return nodes
    .filter((n) => n.parent_id === parentId && (opts.archived ? true : n.archived_at === null))
    .sort((a, b) => a.position - b.position || a.created_at - b.created_at);
}

const nextPosition = (nodes: NodeRow[], parentId: string | null) =>
  nodes.filter((n) => n.parent_id === parentId).reduce((m, n) => Math.max(m, n.position), 0) + 1;

// ── create ───────────────────────────────────────────────────────────

export interface CreateInput {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  parentId?: unknown;
  conversationId?: unknown;
  content?: unknown;
  state?: unknown;
  provenance?: unknown;
}

const parentOf = (v: unknown): string | null | undefined => (v === null || v === undefined || v === '' ? null : cleanId(v) ?? undefined);

/**
 * Make a node. For a conversation this PLACES the canonical conversation: if it already has a node (archived or not)
 * that node is moved and restored rather than a second one made — one conversation, one placement.
 */
export async function createNode(store: NodeStore, userId: string, input: CreateInput, now: number): Promise<Result<NodeRow>> {
  if (!isNodeType(input.type)) return fail('invalid', 'Unknown node type.');
  const type: NodeType = input.type;
  const parentId = parentOf(input.parentId);
  if (parentId === undefined) return fail('invalid', 'Invalid parent.');
  const nodes = await store.nodes(userId);
  const index = indexNodes(nodes);
  const bad = placementError(index, null, parentId);
  if (bad) return { ok: false, error: bad };

  if (type === 'conversation') {
    const conversationId = cleanId(input.conversationId);
    if (!conversationId) return fail('invalid', 'A conversation node needs a conversation.');
    if (!(await store.ownsConversation(userId, conversationId))) return fail('conversation_unknown', 'That conversation was not found on this account.');
    const existing = nodes.find((n) => n.conversation_id === conversationId);
    if (existing) {
      const ok = await store.updateNode(userId, existing.id, existing.version, {
        parent_id: parentId,
        archived_at: null,
        position: nextPosition(nodes, parentId),
        version: existing.version + 1,
        updated_at: now,
      });
      if (!ok) return fail('conflict', 'This conversation was just placed somewhere else. Reload and try again.');
      return done({ ...existing, parent_id: parentId, archived_at: null, version: existing.version + 1, updated_at: now });
    }
    if (nodes.length >= LIMITS.nodesPerUser) return fail('limit', 'This account has reached the node limit.');
    const row: NodeRow = {
      id: newId('n'),
      user_id: userId,
      type,
      title: '',
      description: cleanText(input.description, LIMITS.description, { multiline: true }),
      parent_id: parentId,
      conversation_id: conversationId,
      content: {},
      state: 'active',
      provenance: { origin: 'human' },
      position: nextPosition(nodes, parentId),
      archived_at: null,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    await store.insertNode(row);
    return done(row);
  }

  if (nodes.length >= LIMITS.nodesPerUser) return fail('limit', 'This account has reached the node limit.');
  const title = cleanText(input.title, LIMITS.title) || `Untitled ${TYPE_LABEL[type].one.toLowerCase()}`;
  // a decision always begins as a proposal: accepting is its own act (acceptDecision)
  const state = type === 'decision' ? 'proposed' : validState(type, input.state) ? (input.state as string) : defaultState(type);
  const provenance = sanitizeProvenance(input.provenance, 'human');
  delete provenance.approvedAt;
  const row: NodeRow = {
    id: newId('n'),
    user_id: userId,
    type,
    title,
    description: cleanText(input.description, LIMITS.description, { multiline: true }),
    parent_id: parentId,
    conversation_id: null,
    content: sanitizeContent(type, input.content),
    state,
    provenance,
    position: nextPosition(nodes, parentId),
    archived_at: null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  await store.insertNode(row);
  return done(row);
}

// ── edit ─────────────────────────────────────────────────────────────

export interface UpdateInput {
  version?: unknown;
  title?: unknown;
  description?: unknown;
  content?: unknown;
  state?: unknown;
  provenance?: unknown;
}

async function load(store: NodeStore, userId: string, id: unknown): Promise<Result<{ node: NodeRow; nodes: NodeRow[] }>> {
  const nid = cleanId(id);
  if (!nid) return fail('invalid', 'Invalid node.');
  const nodes = await store.nodes(userId);
  const node = nodes.find((n) => n.id === nid);
  if (!node) return fail('not_found', 'That node was not found.');
  return done({ node, nodes });
}

const versionOf = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

/** Write a change, keeping the previous state as a version. */
async function commit(store: NodeStore, node: NodeRow, expected: number, patch: Partial<NodeRow>, now: number, keep: boolean): Promise<Result<NodeRow>> {
  if (expected !== node.version) return fail('conflict', 'This changed somewhere else. Reload to see the latest.');
  const next = node.version + 1;
  const ok = await store.updateNode(node.user_id, node.id, node.version, { ...patch, version: next, updated_at: now });
  if (!ok) return fail('conflict', 'This changed somewhere else. Reload to see the latest.');
  if (keep) {
    const v: VersionRow = { id: newId('v'), node_id: node.id, user_id: node.user_id, version: node.version, snapshot: snapshotOf(node), created_at: now };
    await store.insertVersion(v);
    if (node.version - LIMITS.versionsKept > 0) await store.pruneVersions(node.user_id, node.id, node.version - LIMITS.versionsKept + 1);
  }
  return done({ ...node, ...patch, version: next, updated_at: now });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function updateNode(store: NodeStore, userId: string, id: unknown, input: UpdateInput, now: number): Promise<Result<NodeRow>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node } = got.value;
  const expected = versionOf(input.version);
  if (expected === null) return fail('invalid', 'The version being edited is required.');
  if (node.archived_at !== null) return fail('archived', 'Archived nodes cannot be edited. Restore it first.');
  const patch: Partial<NodeRow> = {};
  if (input.title !== undefined) {
    if (node.type === 'conversation') return fail('invalid', "A conversation's title is renamed on the conversation itself.");
    const t = cleanText(input.title, LIMITS.title);
    if (!t) return fail('invalid', 'A title cannot be empty.');
    if (t !== node.title) patch.title = t;
  }
  if (input.description !== undefined) {
    const d = cleanText(input.description, LIMITS.description, { multiline: true });
    if (d !== node.description) patch.description = d;
  }
  if (input.content !== undefined) {
    const c = sanitizeContent(node.type, { ...node.content, ...(input.content && typeof input.content === 'object' ? (input.content as object) : {}) });
    if (!same(c, node.content)) patch.content = c;
  }
  if (input.state !== undefined) {
    if (!validState(node.type, input.state)) return fail('invalid', 'That state does not apply to this node.');
    if (node.type === 'decision' && (input.state === 'accepted' || node.state === 'accepted') && input.state !== node.state)
      return fail('needs_acceptance', 'A decision is accepted or reopened with its own action.');
    if (input.state !== node.state) patch.state = input.state as string;
  }
  if (input.provenance !== undefined) {
    // where it came from may be corrected (a finding that was really from a source); approval never comes this way
    const p: Provenance = sanitizeProvenance(input.provenance, node.provenance.origin);
    if (node.provenance.approvedAt) p.approvedAt = node.provenance.approvedAt;
    else delete p.approvedAt;
    if (!same(p, node.provenance)) patch.provenance = p;
  }
  if (!Object.keys(patch).length) return done(node);
  return commit(store, node, expected, patch, now, true);
}

/** How long an artifact must be left alone before its next operation keeps a version of what it was. */
export const OPS_VERSION_QUIET_MS = 60_000;

/**
 * Apply a batch of operations to an artifact's composition. The batch is applied to what is stored NOW (re-read and
 * re-applied if another write lands in between), never to a copy the browser held, so it needs no version from the
 * caller. Operations whose target is already gone are skipped and listed.
 */
export async function applyArtifactOps(store: NodeStore, userId: string, id: unknown, rawOps: unknown, now: number): Promise<Result<{ node: NodeRow; skipped: number[] }>> {
  const parsed = parseOps(rawOps);
  if (!parsed.ok) return fail('invalid', parsed.error);
  for (let attempt = 0; attempt < 4; attempt++) {
    const got = await load(store, userId, id);
    if (!got.ok) return got;
    const { node } = got.value;
    if (node.type !== 'artifact') return fail('invalid', 'Only an artifact holds primitives.');
    if (node.archived_at !== null) return fail('archived', 'Archived nodes cannot be edited. Restore it first.');
    const current = sanitizeComposition(node.content);
    const r = applyOps(current, parsed.ops);
    if (!r.ok) return fail(r.code === 'limit' ? 'limit' : 'invalid', r.error ?? 'Those changes cannot be made.');
    if (same(r.comp, current) && same(current, node.content)) return done({ node, skipped: r.skipped });
    const res = await commit(store, node, node.version, { content: r.comp as unknown as Record<string, unknown> }, now, now - node.updated_at > OPS_VERSION_QUIET_MS);
    if (res.ok) return done({ node: res.value, skipped: r.skipped });
    // another write landed between reading and writing: read again and apply to that
  }
  return fail('conflict', 'This artifact is being changed quickly somewhere else. Try again in a moment.');
}

/** Every uploaded picture a node's content, or any of its kept versions, shows. */
export function nodeMediaIds(node: NodeRow, versions: readonly VersionRow[] = []): string[] {
  if (node.type !== 'artifact') return [];
  const ids = new Set(mediaIdsOf(sanitizeComposition(node.content)));
  for (const v of versions) for (const m of mediaIdsOf(sanitizeComposition(v.snapshot?.content))) ids.add(m);
  return [...ids];
}

export async function moveNode(store: NodeStore, userId: string, id: unknown, parent: unknown, version: unknown, now: number): Promise<Result<NodeRow>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node, nodes } = got.value;
  const expected = versionOf(version);
  if (expected === null) return fail('invalid', 'The version being moved is required.');
  if (node.archived_at !== null) return fail('archived', 'Archived nodes cannot be moved. Restore it first.');
  const parentId = parentOf(parent);
  if (parentId === undefined) return fail('invalid', 'Invalid destination.');
  const bad = placementError(indexNodes(nodes), node.id, parentId);
  if (bad) return { ok: false, error: bad };
  if (parentId === node.parent_id) return done(node);
  return commit(store, node, expected, { parent_id: parentId, position: nextPosition(nodes, parentId) }, now, true);
}

/** Put a node before another in the same matrix (or at the end, `before` null). Order only: not versioned. */
export async function reorderNode(store: NodeStore, userId: string, id: unknown, before: unknown, version: unknown, now: number): Promise<Result<NodeRow>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node, nodes } = got.value;
  const expected = versionOf(version);
  if (expected === null) return fail('invalid', 'The version being moved is required.');
  const siblings = childrenOf(nodes, node.parent_id).filter((n) => n.id !== node.id);
  const beforeId = before === null || before === undefined ? null : cleanId(before);
  const at = beforeId ? siblings.findIndex((n) => n.id === beforeId) : -1;
  if (beforeId && at === -1) return fail('invalid', 'That node is not in the same matrix.');
  const prev = at === -1 ? siblings[siblings.length - 1] : siblings[at - 1];
  const next = at === -1 ? undefined : siblings[at];
  const position = next ? ((prev?.position ?? next.position - 2) + next.position) / 2 : (prev?.position ?? 0) + 1;
  return commit(store, node, expected, { position }, now, false);
}

export async function archiveNode(store: NodeStore, userId: string, id: unknown, version: unknown, now: number): Promise<Result<NodeRow>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node } = got.value;
  const expected = versionOf(version);
  if (expected === null) return fail('invalid', 'The version is required.');
  if (node.archived_at !== null) return done(node);
  return commit(store, node, expected, { archived_at: now }, now, false);
}

/** Restore an archived node. If what contained it is gone or archived, it comes back at the top level. */
export async function restoreNode(store: NodeStore, userId: string, id: unknown, version: unknown, now: number): Promise<Result<NodeRow>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node, nodes } = got.value;
  const expected = versionOf(version);
  if (expected === null) return fail('invalid', 'The version is required.');
  if (node.archived_at === null) return done(node);
  const parent = node.parent_id ? nodes.find((n) => n.id === node.parent_id) : null;
  const parentOk = !node.parent_id || (parent && parent.archived_at === null);
  if (node.type === 'conversation' && nodes.some((n) => n.id !== node.id && n.conversation_id === node.conversation_id && n.archived_at === null))
    return fail('duplicate', 'This conversation is already placed elsewhere.');
  return commit(store, node, expected, { archived_at: null, ...(parentOk ? {} : { parent_id: null, position: nextPosition(nodes, null) }) }, now, false);
}

/** The person accepts a decision as theirs. The only way a decision becomes `accepted`. */
export async function decide(store: NodeStore, userId: string, id: unknown, verdict: 'accept' | 'reject' | 'reopen', version: unknown, now: number): Promise<Result<NodeRow>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node } = got.value;
  if (node.type !== 'decision') return fail('invalid', 'Only a decision can be accepted.');
  if (node.archived_at !== null) return fail('archived', 'Archived nodes cannot be changed. Restore it first.');
  const expected = versionOf(version);
  if (expected === null) return fail('invalid', 'The version is required.');
  const provenance: Provenance = { ...node.provenance };
  if (verdict === 'accept') provenance.approvedAt = now;
  else delete provenance.approvedAt;
  const state = verdict === 'accept' ? 'accepted' : verdict === 'reject' ? 'rejected' : 'proposed';
  if (state === node.state && same(provenance, node.provenance)) return done(node);
  return commit(store, node, expected, { state, provenance }, now, true);
}

/** Bring back a version's words (title, description, content). State, place and provenance stay as they are now. */
export async function restoreVersion(store: NodeStore, userId: string, id: unknown, versionNo: unknown, version: unknown, now: number): Promise<Result<NodeRow>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node } = got.value;
  if (node.archived_at !== null) return fail('archived', 'Archived nodes cannot be edited. Restore it first.');
  const n = versionOf(versionNo);
  const expected = versionOf(version);
  if (n === null || expected === null) return fail('invalid', 'Which version, and the current one, are required.');
  const v = (await store.versions(userId, node.id)).find((x) => x.version === n);
  if (!v) return fail('not_found', 'That version is no longer kept.');
  const patch: Partial<NodeRow> = {
    ...(node.type === 'conversation' ? {} : { title: cleanText(v.snapshot.title, LIMITS.title) || node.title }),
    description: cleanText(v.snapshot.description, LIMITS.description, { multiline: true }),
    content: sanitizeContent(node.type, v.snapshot.content),
  };
  return commit(store, node, expected, patch, now, true);
}

/**
 * Delete for good. A conversation node (only a placement) may always go, and its conversation is untouched. Any other
 * node must be archived first and contain nothing — never recursive.
 */
export async function deleteNode(store: NodeStore, userId: string, id: unknown): Promise<Result<{ id: string; conversationId: string | null }>> {
  const got = await load(store, userId, id);
  if (!got.ok) return got;
  const { node, nodes } = got.value;
  if (nodes.some((n) => n.parent_id === node.id)) return fail('has_children', 'It still contains other nodes. Move or delete them first.');
  if (node.type !== 'conversation' && node.archived_at === null) return fail('not_archived', 'Archive it first. Deleting is permanent.');
  await store.deleteNode(userId, node.id);
  return done({ id: node.id, conversationId: node.conversation_id });
}

// ── relations ────────────────────────────────────────────────────────

export async function linkNodes(
  store: NodeStore,
  userId: string,
  input: { fromId?: unknown; toId?: unknown; kind?: unknown; note?: unknown; provenance?: unknown },
  now: number
): Promise<Result<RelationRow>> {
  const from = cleanId(input.fromId);
  const to = cleanId(input.toId);
  if (!from || !to) return fail('invalid', 'Both ends are required.');
  if (from === to) return fail('invalid', 'A node cannot be related to itself.');
  if (!isRelationKind(input.kind)) return fail('invalid', 'Unknown relationship.');
  const nodes = await store.nodes(userId);
  if (!nodes.some((n) => n.id === from) || !nodes.some((n) => n.id === to)) return fail('not_found', 'One of those nodes was not found.');
  const rels = await store.relations(userId);
  if (rels.some((r) => r.from_id === from && r.to_id === to && r.kind === input.kind)) return fail('duplicate', 'That relationship already exists.');
  if (rels.length >= LIMITS.relationsPerUser) return fail('limit', 'This account has reached the relationship limit.');
  const provenance = sanitizeProvenance(input.provenance, 'human');
  delete provenance.approvedAt;
  const row: RelationRow = {
    id: newId('r'),
    user_id: userId,
    from_id: from,
    to_id: to,
    kind: input.kind,
    note: cleanText(input.note, LIMITS.note),
    provenance,
    created_at: now,
  };
  await store.insertRelation(row);
  return done(row);
}

export async function unlinkNodes(store: NodeStore, userId: string, id: unknown): Promise<Result<{ id: string }>> {
  const rid = cleanId(id);
  if (!rid) return fail('invalid', 'Invalid relationship.');
  if (!(await store.deleteRelation(userId, rid))) return fail('not_found', 'That relationship was not found.');
  return done({ id: rid });
}

/** HTTP status for an error code. */
export function statusOf(code: NlErrorCode): number {
  switch (code) {
    case 'not_found':
    case 'conversation_unknown':
      return 404;
    case 'conflict':
    case 'duplicate':
    case 'has_children':
    case 'not_archived':
    case 'archived':
    case 'cycle':
    case 'needs_acceptance':
      return 409;
    case 'limit':
      return 429;
    default:
      return 400;
  }
}
