import 'server-only';
// lib/mind/store.ts
//
// The Mind Graph, to and from Postgres.
//
// Everything above this file is pure — a graph in, a graph out — so this is
// the only place that knows the graph is stored at all. It reads the whole of
// a person's graph, hands it to the pure functions, and writes back what
// changed.
//
// WHOLE-GRAPH READS are fine at this scale and wrong at a larger one. A
// realistic graph is hundreds to low thousands of nodes; reading it costs one
// indexed query and lets activation run in memory over real adjacency rather
// than issuing a query per hop. Past a few thousand nodes this becomes a
// recursive CTE seeded by the matched nodes, and nothing above this file
// changes when it does — which is the point of keeping them separate.
//
// WRITES ARE DIFFS. Not "save the graph": that would rewrite every row on
// every turn, lose concurrent edits from another tab, and make `updated_at`
// meaningless. Only what actually changed is sent.

import { supabaseAdmin } from '../supabase';
import type { ProjectContainer } from './projects';
import {
  EMPTY_GRAPH, classifyStoreError,
  type MindEdge, type MindGraph, type MindNode, type MindStoreFailure,
  type NodeStatus, type PendingClaim,
} from './types';

/**
 * Why the graph could not be read.
 *
 * It used to not say. Every query's `.error` was discarded — `data ?? []` —
 * so a missing table, a wrong key and a person with no memory yet all
 * produced the same empty graph, and the only symptom anywhere was a blank
 * Memory page. Nothing above this file could tell the three apart because
 * nothing below it had preserved the difference.
 *
 * That silence is correct for the CONVERSATION: recall() must never break a
 * reply. It is wrong for the page whose entire job is to show what is stored,
 * and wrong for anyone trying to find out why nothing is. So the failure is
 * carried now, and each caller decides what to do with it.
 *
 * The classifier itself is pure and lives in types.ts, where a test can reach
 * it — the last version of this judgement was wrong in a way no test caught.
 */
export class MindStoreError extends Error {
  constructor(readonly reason: MindStoreFailure, message: string) {
    super(message);
    this.name = 'MindStoreError';
  }
}

/**
 * A person's whole graph.
 *
 * Throws MindStoreError when the store itself is the problem. It does NOT
 * throw for a person who simply has nothing yet — that is an empty graph, and
 * the difference is the whole point of the type above.
 */
export async function loadGraph(userId: string): Promise<MindGraph> {
  const db = supabaseAdmin();
  const [nodes, edges, tombs, pending] = await Promise.all([
    db.from('mind_nodes').select('*').eq('user_id', userId),
    db.from('mind_edges').select('*').eq('user_id', userId),
    db.from('mind_tombstones').select('fingerprint').eq('user_id', userId),
    db.from('mind_pending').select('*').eq('user_id', userId),
  ]);

  for (const [table, res] of [
    ['mind_nodes', nodes], ['mind_edges', edges],
    ['mind_tombstones', tombs], ['mind_pending', pending],
  ] as const) {
    if (!res.error) continue;
    const reason = classifyStoreError(res.error);
    // Logged HERE, once, with the table named. A caller that swallows this
    // still leaves a line in the deployment log saying which table and why,
    // which is the difference between "memory is broken" and a fix.
    console.error(
      `[socria/mind] cannot read ${table} (${reason}): ${res.error.message}` +
        (reason === 'missing-tables' ? ' — has supabase/schema.sql been applied?' : '')
    );
    throw new MindStoreError(reason, `${table}: ${res.error.message}`);
  }

  return {
    nodes: (nodes.data ?? []).map(rowToNode),
    edges: (edges.data ?? []).map(rowToEdge),
    tombstones: (tombs.data ?? []).map((r: { fingerprint: string }) => r.fingerprint),
    pending: (pending.data ?? []).map(rowToPending),
  };
}

/** Just the nodes, for the Memory page's list view and counts. */
export async function graphSize(userId: string): Promise<{ nodes: number; edges: number }> {
  const db = supabaseAdmin();
  const [n, e] = await Promise.all([
    db.from('mind_nodes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('mind_edges').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return { nodes: n.count ?? 0, edges: e.count ?? 0 };
}

/**
 * Write back what changed between two graphs.
 *
 * Compares by id and by `updatedAt`, so a node nobody touched is not
 * rewritten. Deletions are explicit: a node present in `prev` and absent from
 * `next` is removed, along with its edges — which the caller has usually
 * already dropped, but the database is the thing that has to be right.
 */
export async function persistGraph(
  userId: string,
  prev: MindGraph,
  next: MindGraph
): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();

  const prevNodes = new Map(prev.nodes.map((n) => [n.id, n]));
  const prevEdges = new Map(prev.edges.map((e) => [e.id, e]));

  const nodeUpserts = next.nodes
    .filter((n) => {
      const before = prevNodes.get(n.id);
      return !before || before.updatedAt !== n.updatedAt || before.lastAccessed !== n.lastAccessed;
    })
    .map((n) => nodeToRow(userId, n));

  const edgeUpserts = next.edges
    .filter((e) => {
      const before = prevEdges.get(e.id);
      return !before || before.updatedAt !== e.updatedAt || before.lastReinforced !== e.lastReinforced;
    })
    .map((e) => edgeToRow(userId, e));

  const nextNodeIds = new Set(next.nodes.map((n) => n.id));
  const nextEdgeIds = new Set(next.edges.map((e) => e.id));
  const goneNodes = prev.nodes.filter((n) => !nextNodeIds.has(n.id)).map((n) => n.id);
  const goneEdges = prev.edges.filter((e) => !nextEdgeIds.has(e.id)).map((e) => e.id);

  const before = new Set(prev.tombstones);
  const freshTombs = next.tombstones.filter((t) => !before.has(t));

  const prevPending = new Map(prev.pending.map((p) => [p.fingerprint, p]));
  const pendingUpserts = next.pending
    .filter((p) => {
      const b = prevPending.get(p.fingerprint);
      return !b || b.lastAt !== p.lastAt || b.sources.length !== p.sources.length;
    })
    .map((p) => pendingToRow(userId, p));
  const nextPendingFps = new Set(next.pending.map((p) => p.fingerprint));
  const gonePending = prev.pending.filter((p) => !nextPendingFps.has(p.fingerprint)).map((p) => p.fingerprint);

  /**
   * Named, logged, and returned. Until now a write failure was returned as a
   * bare boolean the caller discarded — remember() maps it to
   * `persisted: false` and nothing reads that — so a graph that never saved
   * anything produced no log line at all.
   */
  const fail = (error: { message: string; code?: string }) => {
    console.error(
      `[socria/mind] write failed (${classifyStoreError(error)}): ${error.message}` +
        (classifyStoreError(error) === 'missing-tables' ? ' — has supabase/schema.sql been applied?' : '')
    );
    return { ok: false as const, error: error.message };
  };

  try {
    // Tombstones FIRST. If anything later fails, the record of a deletion is
    // the one thing that must already be durable — a half-written turn must
    // never end with something the person forgot back in the graph.
    if (freshTombs.length) {
      const { error } = await db.from('mind_tombstones').upsert(
        freshTombs.map((fingerprint) => ({ user_id: userId, fingerprint, created_at: Date.now() })),
        { onConflict: 'user_id,fingerprint' }
      );
      if (error) return fail(error);
    }
    if (goneEdges.length) {
      const { error } = await db.from('mind_edges').delete().eq('user_id', userId).in('id', goneEdges);
      if (error) return fail(error);
    }
    if (goneNodes.length) {
      const { error } = await db.from('mind_nodes').delete().eq('user_id', userId).in('id', goneNodes);
      if (error) return fail(error);
    }
    if (nodeUpserts.length) {
      const { error } = await db.from('mind_nodes').upsert(nodeUpserts, { onConflict: 'user_id,id' });
      if (error) return fail(error);
    }
    if (edgeUpserts.length) {
      const { error } = await db.from('mind_edges').upsert(edgeUpserts, { onConflict: 'user_id,id' });
      if (error) return fail(error);
    }
    if (pendingUpserts.length) {
      const { error } = await db.from('mind_pending').upsert(pendingUpserts, { onConflict: 'user_id,fingerprint' });
      if (error) return fail(error);
    }
    if (gonePending.length) {
      await db.from('mind_pending').delete().eq('user_id', userId).in('fingerprint', gonePending);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

/**
 * Recall strengthens memory. Written separately from persistGraph because it
 * happens on a READ and must be cheap and best-effort: a failure here means
 * an activation level is stale, which nothing depends on.
 */
export async function touchNodes(
  userId: string,
  touched: { id: string; activation: number; lastAccessed: number }[]
): Promise<void> {
  if (!touched.length) return;
  // Everything, including supabaseAdmin() itself, which throws synchronously
  // when the environment is not configured. This is called with `void`, so a
  // throw here is an unhandled rejection — and an unhandled rejection in a
  // serverless function can take the whole request with it, which would mean
  // a bookkeeping write breaking a conversation.
  try {
    const db = supabaseAdmin();
    // ONE round trip, not one per node. This fired a separate UPDATE for
    // every activated node, so a large window meant dozens of concurrent
    // writes per turn for bookkeeping nobody reads synchronously — and an
    // over-large subgraph would have turned that into thousands. An upsert
    // of the changed columns does the same job in a single statement.
    //
    // The rows already exist, so this is an update in upsert's clothing;
    // the other columns are left alone because only these two moved.
    await db.from('mind_nodes').upsert(
      touched.map((t) => ({
        user_id: userId,
        id: t.id,
        activation: t.activation,
        last_accessed: t.lastAccessed,
      })),
      { onConflict: 'user_id,id' }
    );
  } catch {
    // An activation level is stale. Nothing depends on it.
  }
}

// ── uploaded files ──────────────────────────────────────────────────

export interface StoredSource {
  id: string;
  name: string;
  bytes: number;
  text: string;
  createdAt: number;
  /** the Project the file was added to, if any — the FILE belongs to it;
   *  what was learned from the file goes wherever it connects */
  projectId?: string | null;
}

/**
 * A column this code expects that the database does not have yet.
 *
 * mind_sources.project_id arrived with Projects, as an idempotent ALTER in
 * supabase/schema.sql. A database that has not re-run it must keep taking
 * files rather than failing every upload, so the write is retried without the
 * column — and the gap is said out loud, once, on the server.
 */
function missingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the '.*' column/i.test(error.message ?? '');
}
let warnedSourceColumn = false;
function warnSourceColumn() {
  if (warnedSourceColumn) return;
  warnedSourceColumn = true;
  console.error(
    '[socria/mind] mind_sources has no project_id column — files cannot be filed under a Project ' +
      'until supabase/schema.sql is re-run. Uploads still work.'
  );
}

export async function saveSource(userId: string, s: StoredSource): Promise<boolean> {
  const row = {
    user_id: userId, id: s.id, name: s.name, bytes: s.bytes, text: s.text, created_at: s.createdAt,
  };
  let { error } = await supabaseAdmin().from('mind_sources').insert({ ...row, project_id: s.projectId ?? null });
  if (error && missingColumn(error)) {
    warnSourceColumn();
    ({ error } = await supabaseAdmin().from('mind_sources').insert(row));
  }
  return !error;
}

export async function readSource(userId: string, id: string): Promise<StoredSource | null> {
  const { data } = await supabaseAdmin()
    .from('mind_sources').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string, name: r.name as string, bytes: Number(r.bytes),
    text: (r.text as string) ?? '', createdAt: Number(r.created_at),
    projectId: (r.project_id as string) ?? null,
  };
}

/** Every file, or only one Project's. Never the text — that can be large. */
export async function listSources(
  userId: string,
  opts: { projectId?: string } = {}
): Promise<Omit<StoredSource, 'text'>[]> {
  const shape = (r: Record<string, unknown>) => ({
    id: r.id as string, name: r.name as string,
    bytes: Number(r.bytes), createdAt: Number(r.created_at),
    projectId: (r.project_id as string) ?? null,
  });
  let q = supabaseAdmin()
    .from('mind_sources').select('id, name, bytes, created_at, project_id').eq('user_id', userId);
  if (opts.projectId) q = q.eq('project_id', opts.projectId);
  // Annotated: the fallback below selects fewer columns, and the two row
  // shapes would otherwise be inferred as incompatible.
  let data: Record<string, unknown>[] | null;
  let error: { code?: string; message: string } | null;
  ({ data, error } = await q.order('created_at', { ascending: false }));
  if (error && missingColumn(error)) {
    warnSourceColumn();
    // Without the column no file is in any Project, which is the truth.
    if (opts.projectId) return [];
    ({ data, error } = await supabaseAdmin()
      .from('mind_sources').select('id, name, bytes, created_at').eq('user_id', userId)
      .order('created_at', { ascending: false }));
  }
  return (data ?? []).map((r: Record<string, unknown>) => shape(r));
}

/**
 * Delete an uploaded file.
 *
 * What it deliberately does NOT do is delete what was learned from it. A
 * claim can be true independently of where it was read, and the
 * `derived_from` edge already records the provenance either way. The Memory
 * page offers the stronger option explicitly rather than performing it
 * silently.
 */
export async function deleteSource(userId: string, id: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('mind_sources').delete().eq('user_id', userId).eq('id', id);
  return !error;
}

// ── Projects ────────────────────────────────────────────────────────
//
// The CONTAINER half of a Project. Its node lives in mind_nodes like every
// other; this row holds only what configures the workspace. See
// lib/mind/projects.ts for why the two are kept apart.

function rowToProject(r: Record<string, unknown>): ProjectContainer {
  return {
    id: r.id as string,
    nodeId: r.node_id as string,
    name: (r.name as string) ?? '',
    description: (r.description as string) ?? '',
    instructions: (r.instructions as string) ?? '',
    archived: !!r.archived,
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
  };
}

/**
 * The Mind Graph tables that hold Socria's own reading of the person, cleared
 * whole by "Forget what Socria worked out". `mind_nodes` is not here because
 * the Project anchors inside it have to survive, and `mind_projects` is not
 * either: a Project's name, description and instructions are the person's own
 * words, and the button promises to keep everything they wrote.
 */
export const MIND_DERIVED_TABLES = ['mind_edges', 'mind_pending', 'mind_sources', 'mind_tombstones'] as const;

/** Every Project, archived included. Throws MindStoreError when the table is missing. */
export async function listProjects(userId: string): Promise<ProjectContainer[]> {
  const { data, error } = await supabaseAdmin()
    .from('mind_projects').select('*').eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    const reason = classifyStoreError(error);
    console.error(`[socria/mind] cannot read mind_projects (${reason}): ${error.message}`);
    throw new MindStoreError(reason, `mind_projects: ${error.message}`);
  }
  return (data ?? []).map((r: Record<string, unknown>) => rowToProject(r));
}

export async function getProject(userId: string, id: string): Promise<ProjectContainer | null> {
  // Scoped to the owner, so an id belonging to anybody else is simply absent.
  const { data, error } = await supabaseAdmin()
    .from('mind_projects').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) {
    const reason = classifyStoreError(error);
    throw new MindStoreError(reason, `mind_projects: ${error.message}`);
  }
  return data ? rowToProject(data as Record<string, unknown>) : null;
}

export async function insertProject(userId: string, p: ProjectContainer): Promise<boolean> {
  const { error } = await supabaseAdmin().from('mind_projects').insert({
    user_id: userId, id: p.id, node_id: p.nodeId, name: p.name, description: p.description,
    instructions: p.instructions, archived: p.archived, created_at: p.createdAt, updated_at: p.updatedAt,
  });
  if (error) console.error('[socria/mind] could not create project:', error.message);
  return !error;
}

export async function updateProject(
  userId: string,
  id: string,
  patch: Partial<Pick<ProjectContainer, 'name' | 'description' | 'instructions' | 'archived'>> & { updatedAt: number }
): Promise<boolean> {
  const row: Record<string, unknown> = { updated_at: patch.updatedAt };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.instructions !== undefined) row.instructions = patch.instructions;
  if (patch.archived !== undefined) row.archived = patch.archived;
  const { error, count } = await supabaseAdmin()
    .from('mind_projects').update(row, { count: 'exact' }).eq('user_id', userId).eq('id', id);
  return !error && !!count;
}

export async function deleteProjectRow(userId: string, id: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from('mind_projects').delete().eq('user_id', userId).eq('id', id);
  return !error;
}

/** A Project's conversations, newest first — titles only, never messages. */
export async function listProjectConversations(
  userId: string,
  projectId: string
): Promise<{ id: string; title: string; updatedAt: number }[]> {
  const { data, error } = await supabaseAdmin()
    .from('conversations').select('id, title, updated_at')
    .eq('user_id', userId).eq('project_id', projectId)
    .order('updated_at', { ascending: false }).limit(200);
  if (error) {
    if (missingColumn(error)) {
      console.error('[socria/mind] conversations has no project_id column — re-run supabase/schema.sql.');
      return [];
    }
    throw new MindStoreError(classifyStoreError(error), `conversations: ${error.message}`);
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, title: (r.title as string) ?? '', updatedAt: Number(r.updated_at),
  }));
}

/**
 * Take a deleted Project's conversations and files out of it.
 *
 * DETACHED, not deleted. Somebody deleting a Project is tidying a workspace;
 * silently deleting every conversation they ever had inside it would be the
 * single most destructive thing this code could do, and the least expected.
 * Their chats move back to the ordinary list, whole.
 */
export async function detachFromProject(
  userId: string,
  projectId: string,
  files: 'keep' | 'delete'
): Promise<{ ok: boolean; conversations: number; files: number }> {
  const db = supabaseAdmin();
  const convo = await db.from('conversations').update({ project_id: null }, { count: 'exact' })
    .eq('user_id', userId).eq('project_id', projectId);
  if (convo.error && !missingColumn(convo.error)) return { ok: false, conversations: 0, files: 0 };

  const src = files === 'delete'
    ? await db.from('mind_sources').delete({ count: 'exact' }).eq('user_id', userId).eq('project_id', projectId)
    : await db.from('mind_sources').update({ project_id: null }, { count: 'exact' })
        .eq('user_id', userId).eq('project_id', projectId);
  if (src.error && !missingColumn(src.error)) return { ok: false, conversations: convo.count ?? 0, files: 0 };

  return { ok: true, conversations: convo.count ?? 0, files: src.count ?? 0 };
}

// ── rows ────────────────────────────────────────────────────────────

function rowToNode(r: Record<string, unknown>): MindNode {
  return {
    id: r.id as string,
    type: r.type as string,
    label: (r.label as string) ?? '',
    content: (r.content as string) ?? '',
    aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    status: ((r.status as string) ?? 'active') as NodeStatus,
    confidence: Number(r.confidence ?? 0.5),
    certainty: Number(r.certainty ?? 0.5),
    importance: Number(r.importance ?? 0.4),
    activation: Number(r.activation ?? 0.2),
    seen: Number(r.seen ?? 1),
    private: !!r.private,
    provenance: Array.isArray(r.provenance) ? (r.provenance as MindNode['provenance']) : [],
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
    lastAccessed: Number(r.last_accessed ?? 0),
  };
}

function nodeToRow(userId: string, n: MindNode) {
  return {
    user_id: userId, id: n.id, type: n.type, label: n.label, content: n.content,
    aliases: n.aliases, status: n.status, confidence: n.confidence, certainty: n.certainty,
    importance: n.importance, activation: n.activation, seen: n.seen, private: n.private,
    provenance: n.provenance, created_at: n.createdAt, updated_at: n.updatedAt,
    last_accessed: n.lastAccessed,
  };
}

function rowToEdge(r: Record<string, unknown>): MindEdge {
  return {
    id: r.id as string,
    sourceId: r.source_id as string,
    targetId: r.target_id as string,
    relationship: r.relationship as string,
    confidence: Number(r.confidence ?? 0.6),
    strength: Number(r.strength ?? 0.5),
    provenance: Array.isArray(r.provenance) ? (r.provenance as MindEdge['provenance']) : [],
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
    lastReinforced: Number(r.last_reinforced ?? 0),
  };
}

function edgeToRow(userId: string, e: MindEdge) {
  return {
    user_id: userId, id: e.id, source_id: e.sourceId, target_id: e.targetId,
    relationship: e.relationship, confidence: e.confidence, strength: e.strength,
    provenance: e.provenance, created_at: e.createdAt, updated_at: e.updatedAt,
    last_reinforced: e.lastReinforced,
  };
}

function rowToPending(r: Record<string, unknown>): PendingClaim {
  return {
    fingerprint: r.fingerprint as string,
    type: r.type as string,
    label: (r.label as string) ?? '',
    content: (r.content as string) ?? '',
    sources: Array.isArray(r.sources) ? (r.sources as string[]) : [],
    firstAt: Number(r.first_at ?? 0),
    lastAt: Number(r.last_at ?? 0),
  };
}

function pendingToRow(userId: string, p: PendingClaim) {
  return {
    user_id: userId, fingerprint: p.fingerprint, type: p.type, label: p.label,
    content: p.content, sources: p.sources, first_at: p.firstAt, last_at: p.lastAt,
  };
}

export { EMPTY_GRAPH };
// Re-exported so callers of the store do not need to know the classifier
// lives in the pure module.
export type { MindStoreFailure };
