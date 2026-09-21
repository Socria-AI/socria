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
import {
  EMPTY_GRAPH,
  type MindEdge, type MindGraph, type MindNode, type NodeStatus, type PendingClaim,
} from './types';

/** A person's whole graph. Missing tables read as an empty graph. */
export async function loadGraph(userId: string): Promise<MindGraph> {
  const db = supabaseAdmin();
  const [nodes, edges, tombs, pending] = await Promise.all([
    db.from('mind_nodes').select('*').eq('user_id', userId),
    db.from('mind_edges').select('*').eq('user_id', userId),
    db.from('mind_tombstones').select('fingerprint').eq('user_id', userId),
    db.from('mind_pending').select('*').eq('user_id', userId),
  ]);

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

  try {
    // Tombstones FIRST. If anything later fails, the record of a deletion is
    // the one thing that must already be durable — a half-written turn must
    // never end with something the person forgot back in the graph.
    if (freshTombs.length) {
      const { error } = await db.from('mind_tombstones').upsert(
        freshTombs.map((fingerprint) => ({ user_id: userId, fingerprint, created_at: Date.now() })),
        { onConflict: 'user_id,fingerprint' }
      );
      if (error) return { ok: false, error: error.message };
    }
    if (goneEdges.length) {
      const { error } = await db.from('mind_edges').delete().eq('user_id', userId).in('id', goneEdges);
      if (error) return { ok: false, error: error.message };
    }
    if (goneNodes.length) {
      const { error } = await db.from('mind_nodes').delete().eq('user_id', userId).in('id', goneNodes);
      if (error) return { ok: false, error: error.message };
    }
    if (nodeUpserts.length) {
      const { error } = await db.from('mind_nodes').upsert(nodeUpserts, { onConflict: 'user_id,id' });
      if (error) return { ok: false, error: error.message };
    }
    if (edgeUpserts.length) {
      const { error } = await db.from('mind_edges').upsert(edgeUpserts, { onConflict: 'user_id,id' });
      if (error) return { ok: false, error: error.message };
    }
    if (pendingUpserts.length) {
      const { error } = await db.from('mind_pending').upsert(pendingUpserts, { onConflict: 'user_id,fingerprint' });
      if (error) return { ok: false, error: error.message };
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
  const db = supabaseAdmin();
  await Promise.all(
    touched.map((t) =>
      db.from('mind_nodes')
        .update({ activation: t.activation, last_accessed: t.lastAccessed })
        .eq('user_id', userId)
        .eq('id', t.id)
    )
  ).catch(() => {});
}

// ── uploaded files ──────────────────────────────────────────────────

export interface StoredSource {
  id: string;
  name: string;
  bytes: number;
  text: string;
  createdAt: number;
}

export async function saveSource(userId: string, s: StoredSource): Promise<boolean> {
  const { error } = await supabaseAdmin().from('mind_sources').insert({
    user_id: userId, id: s.id, name: s.name, bytes: s.bytes, text: s.text, created_at: s.createdAt,
  });
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
  };
}

export async function listSources(userId: string): Promise<Omit<StoredSource, 'text'>[]> {
  const { data } = await supabaseAdmin()
    .from('mind_sources').select('id, name, bytes, created_at').eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, name: r.name as string,
    bytes: Number(r.bytes), createdAt: Number(r.created_at),
  }));
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
