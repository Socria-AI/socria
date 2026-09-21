// lib/mind/apply.ts
//
// Turning candidates into graph changes, without ever losing what was there.
//
// THE RULE THIS FILE ENFORCES: nothing is overwritten. A claim that changes
// produces either a revision that keeps the old text in provenance, or a new
// node joined to the old one by `superseded_by`. A claim that conflicts
// produces two nodes and a `contradicts` edge. What never happens is a row
// quietly becoming a different row, because that is how a memory system
// rewrites somebody's history without anybody noticing — and the brief's
// central requirement is that understanding CHANGES rather than gets
// replaced.
//
// Pure. Takes a graph and candidates, returns a new graph and a report of
// what it did. No clock, no ids of its own: both are passed in, so a test can
// run the whole pipeline deterministically.

import { gate, rank, type Budget, type GateRefusal } from './gate';
import { resolveNode, type Candidate } from './resolve';
import {
  MAX_ALIASES, MAX_CONTENT, MAX_LABEL, MAX_PENDING, PENDING_TTL_MS, UNKNOWN_SOURCE,
  clamp01, clip, fingerprintEdge, fingerprintNode, isForgotten, normalize,
  type MindEdge, type MindGraph, type MindNode, type NodeType,
  type PendingClaim, type Provenance, type Relationship,
} from './types';

/** What the extractor proposes for a node. */
export interface NodeCandidate extends Candidate {
  /** the register it was offered in — see gate.ts */
  kind: Provenance['kind'];
  confidence?: number;
  certainty?: number;
  importance?: number;
  private?: boolean;
  aliases?: string[];
  /**
   * The label of an existing node this REPLACES. Set only when the extractor
   * saw an explicit change of position; guessing it produces false
   * supersessions, which rewrite history silently.
   */
  replaces?: string;
  /** The label of an existing node this DISAGREES with, both staying. */
  conflictsWith?: string;
}

export interface EdgeCandidate {
  sourceLabel: string;
  targetLabel: string;
  relationship: Relationship;
  kind: Provenance['kind'];
  confidence?: number;
}

export interface ApplyOptions {
  now: number;
  /** ids are supplied so a test can be deterministic */
  nextId: () => string;
  budget: Budget;
  provenance: Omit<Provenance, 'kind' | 'at'>;
}

export type NodeAction =
  | 'created' | 'reinforced' | 'revised' | 'superseded' | 'conflicted';

export interface ApplyReport {
  nodes: { label: string; action: NodeAction; id: string }[];
  edges: { relationship: string; created: boolean }[];
  refused: { label: string; reason: GateRefusal | 'over-budget' }[];
}

/** Confidence rises toward, but never reaches, certainty. */
function reinforceConfidence(current: number): number {
  return clamp01(current + (1 - current) * 0.25);
}

export function applyCandidates(
  graph: MindGraph,
  nodeCandidates: NodeCandidate[],
  edgeCandidates: EdgeCandidate[],
  opts: ApplyOptions
): { graph: MindGraph; report: ApplyReport } {
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  let pending = [...graph.pending];
  const report: ApplyReport = { nodes: [], edges: [], refused: [] };
  const working: MindGraph = { ...graph, nodes, edges };

  const prov = (kind: Provenance['kind'], extra?: Partial<Provenance>): Provenance => ({
    ...opts.provenance,
    kind,
    at: opts.now,
    ...extra,
  });

  const byLabel = (label: string): MindNode | undefined =>
    nodes.find((n) => normalize(n.label) === normalize(label));

  let nodeBudget = opts.budget.nodes;

  for (const c of rank(nodeCandidates)) {
    const label = clip(c.label, MAX_LABEL);
    const content = clip(c.content, MAX_CONTENT);
    const match = resolveNode(working, { type: c.type, label, content });

    // The node this candidate explicitly REPLACES or DISAGREES WITH, found
    // by the name the extractor gave, not by resemblance. A new position
    // rarely resembles the one it replaces — that is what makes it new — so
    // resolving for it would miss almost every real change of mind and
    // quietly create an unconnected second belief instead.
    const replaced = c.replaces ? byLabel(c.replaces) : undefined;
    const conflicted = c.conflictsWith ? byLabel(c.conflictsWith) : undefined;

    const verdict = gate({
      type: c.type,
      label,
      content,
      kind: c.kind,
      graph: working,
      matchedSeen: match?.node.seen,
      matched: !!match,
      conversationId: opts.provenance.conversationId,
    });
    if (!verdict.pass) {
      report.refused.push({ label, reason: verdict.reason });
      // A lone sighting of a claim about the person is REMEMBERED AS A
      // SIGHTING, not as a belief: nowhere retrieval can reach, nothing a
      // prompt ever sees. If the pattern is real it recurs and the next
      // extraction finds it here; if it was one bad afternoon it expires.
      if (verdict.reason === 'generalisation-needs-second-sighting') {
        pending = notePending(pending, c.type, label, content, opts.now, opts.provenance.conversationId);
      }
      continue;
    }

    // ── a stated CHANGE of position ───────────────────────────────
    // The old node stands, marked superseded, and a new one carries the new
    // position. The edge between them records when and on what grounds —
    // the brief's Belief A -> superseded_by -> Belief B, reason attached.
    if (replaced) {
      if (nodeBudget <= 0) {
        report.refused.push({ label, reason: 'over-budget' });
        continue;
      }
      nodeBudget--;
      const i = nodes.indexOf(replaced);
      nodes[i] = { ...replaced, status: 'superseded', updatedAt: opts.now };
      const fresh = makeNode(c, label, content, verdict.status, opts, prov(c.kind));
      nodes.push(fresh);
      edges.push(
        makeEdge(replaced.id, fresh.id, 'superseded_by', opts,
          prov(c.kind, { note: `changed from: ${replaced.content}` }))
      );
      report.nodes.push({ label, action: 'superseded', id: fresh.id });
      continue;
    }

    // ── a conflict: both stand ────────────────────────────────────
    // Nothing is resolved silently. The person settles it from the Memory
    // page, or a later turn states which one holds.
    if (conflicted) {
      if (nodeBudget <= 0) {
        report.refused.push({ label, reason: 'over-budget' });
        continue;
      }
      nodeBudget--;
      const i = nodes.indexOf(conflicted);
      nodes[i] = { ...conflicted, status: 'contradicted', updatedAt: opts.now };
      const fresh = makeNode(c, label, content, 'tentative', opts, prov(c.kind));
      nodes.push({ ...fresh, status: 'contradicted' });
      edges.push(makeEdge(conflicted.id, fresh.id, 'contradicts', opts, prov(c.kind)));
      report.nodes.push({ label, action: 'conflicted', id: fresh.id });
      continue;
    }

    // ── an existing node ──────────────────────────────────────────
    if (match) {
      const n = match.node;
      const i = nodes.indexOf(n);

      // Better words for the same claim: revise, and keep the old text where
      // it can still be read.
      const sameWords = normalize(n.content) === normalize(content);
      const revised = !sameWords && content.length > n.content.length * 1.15;
      nodes[i] = {
        ...n,
        content: revised ? content : n.content,
        aliases:
          normalize(n.label) === normalize(label)
            ? n.aliases
            : [...new Set([...n.aliases, label])].slice(0, MAX_ALIASES),
        seen: n.seen + 1,
        confidence: reinforceConfidence(n.confidence),
        importance: Math.max(n.importance, clamp01(c.importance ?? 0)),
        // A node that was tentative and has now been stated outright is no
        // longer tentative. It never moves the other way here.
        status:
          n.status === 'tentative' && (c.kind === 'stated' || c.kind === 'established')
            ? 'active'
            : n.status,
        provenance: [
          ...n.provenance,
          prov(c.kind, revised ? { note: `was: ${n.content}` } : undefined),
        ].slice(-20),
        updatedAt: opts.now,
        lastAccessed: opts.now,
      };
      report.nodes.push({ label, action: revised ? 'revised' : 'reinforced', id: n.id });
      continue;
    }

    // ── something new ─────────────────────────────────────────────
    if (nodeBudget <= 0) {
      report.refused.push({ label, reason: 'over-budget' });
      continue;
    }
    nodeBudget--;
    const fresh = makeNode(c, label, content, verdict.status, opts, prov(c.kind));
    nodes.push(fresh);
    report.nodes.push({ label, action: 'created', id: fresh.id });
  }

  // ── edges ───────────────────────────────────────────────────────
  let edgeBudget = opts.budget.edges;
  for (const e of edgeCandidates) {
    if (edgeBudget <= 0) break;
    const source = byLabel(e.sourceLabel);
    const target = byLabel(e.targetLabel);
    // An edge to something that did not survive the gate is dropped with it.
    if (!source || !target || source.id === target.id) continue;

    if (isForgotten(working, fingerprintEdge(source.type, source.label, e.relationship, target.type, target.label))) {
      continue;
    }

    const existing = edges.find(
      (x) => x.sourceId === source.id && x.targetId === target.id && x.relationship === e.relationship
    );
    if (existing) {
      const i = edges.indexOf(existing);
      edges[i] = {
        ...existing,
        strength: clamp01(existing.strength + 0.1),
        confidence: reinforceConfidence(existing.confidence),
        provenance: [...existing.provenance, prov(e.kind)].slice(-20),
        updatedAt: opts.now,
        lastReinforced: opts.now,
      };
      report.edges.push({ relationship: e.relationship, created: false });
      continue;
    }
    edgeBudget--;
    edges.push(makeEdge(source.id, target.id, e.relationship, opts, prov(e.kind), e.confidence));
    report.edges.push({ relationship: e.relationship, created: true });
  }

  // A claim that became a node is no longer pending.
  const landed = new Set(report.nodes.map((n) => normalize(n.label)));
  pending = pending.filter(
    (p) => !landed.has(normalize(p.label)) && opts.now - p.lastAt < PENDING_TTL_MS
  );

  return { graph: { ...graph, nodes, edges, pending }, report };
}

/** Record that a claim about the person was noticed, without believing it. */
function notePending(
  pending: PendingClaim[], type: NodeType, label: string, content: string,
  now: number, conversationId?: string
): PendingClaim[] {
  const fp = fingerprintNode(type, label);
  const sid = conversationId ?? UNKNOWN_SOURCE;
  const i = pending.findIndex((p) => p.fingerprint === fp);
  if (i >= 0) {
    const next = [...pending];
    // The same conversation saying it again adds nothing: it is the same
    // evidence, and counting it would let one afternoon corroborate itself.
    const sources = next[i].sources.includes(sid) ? next[i].sources : [...next[i].sources, sid];
    next[i] = { ...next[i], sources, lastAt: now, content };
    return next;
  }
  return [
    ...pending.slice(-(MAX_PENDING - 1)),
    { fingerprint: fp, type, label, content, sources: [sid], firstAt: now, lastAt: now },
  ];
}

function makeNode(
  c: NodeCandidate, label: string, content: string,
  status: 'active' | 'tentative' | 'uncertain',
  opts: ApplyOptions, p: Provenance
): MindNode {
  return {
    id: opts.nextId(),
    type: c.type,
    label,
    content,
    aliases: (c.aliases ?? []).map((a) => clip(a, MAX_LABEL)).filter(Boolean).slice(0, MAX_ALIASES),
    status,
    confidence: clamp01(c.confidence ?? (c.kind === 'stated' ? 0.8 : 0.45)),
    certainty: clamp01(c.certainty ?? 0.5),
    importance: clamp01(c.importance ?? 0.4),
    activation: 0.2,
    seen: 1,
    private: !!c.private,
    provenance: [p],
    createdAt: opts.now,
    updatedAt: opts.now,
    lastAccessed: opts.now,
  };
}

function makeEdge(
  sourceId: string, targetId: string, relationship: Relationship,
  opts: ApplyOptions, p: Provenance, confidence?: number
): MindEdge {
  return {
    id: opts.nextId(),
    sourceId,
    targetId,
    relationship,
    confidence: clamp01(confidence ?? 0.6),
    strength: 0.5,
    provenance: [p],
    createdAt: opts.now,
    updatedAt: opts.now,
    lastReinforced: opts.now,
  };
}

// ── forgetting ──────────────────────────────────────────────────────

/**
 * Remove a node and everything touching it, and remember that it is gone.
 *
 * The tombstone is the point. Without it the next extraction notices the same
 * thing again and puts it back, and the person deletes it a second time, and
 * concludes — correctly — that deletion does not work here.
 */
export function forgetNode(graph: MindGraph, id: string, at: number, reason?: string): MindGraph {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return graph;
  const fp = fingerprintNode(node.type, node.label);
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
    tombstones: graph.tombstones.includes(fp) ? graph.tombstones : [...graph.tombstones, fp],
    // A forgotten claim must not sit in pending waiting to be re-proposed.
    pending: graph.pending.filter((p) => p.fingerprint !== fp),
  };
}

export function forgetEdge(graph: MindGraph, id: string): MindGraph {
  const edge = graph.edges.find((e) => e.id === id);
  if (!edge) return graph;
  const s = graph.nodes.find((n) => n.id === edge.sourceId);
  const t = graph.nodes.find((n) => n.id === edge.targetId);
  const fp = s && t
    ? fingerprintEdge(s.type, s.label, edge.relationship, t.type, t.label)
    : null;
  return {
    ...graph,
    edges: graph.edges.filter((e) => e.id !== id),
    tombstones: fp && !graph.tombstones.includes(fp) ? [...graph.tombstones, fp] : graph.tombstones,
  };
}

/**
 * The person disagrees. The node stays — marked, with their words attached.
 *
 * Distinct from deleting: a challenged claim is still part of the history of
 * what Socria believed and why it was wrong, and erasing it loses that. The
 * person can still delete it outright if they want it gone.
 */
export function challengeNode(
  graph: MindGraph, id: string, at: number, note: string
): MindGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            status: 'contradicted' as const,
            confidence: clamp01(n.confidence * 0.4),
            provenance: [
              ...n.provenance,
              { kind: 'stated' as const, surface: 'user' as const, at, note: clip(note, 300) },
            ].slice(-20),
            updatedAt: at,
          }
        : n
    ),
  };
}
