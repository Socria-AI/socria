// lib/workspace/write.ts
//
// THE WRITE PATH. Until this file existed, everything in lib/workspace could
// READ the person's thinking and nothing could let them put something into it
// by hand: objects arrived from extraction, from the map, or from a model, and
// the one thing a person could not do was say "this too, and it depends on
// that one".
//
// Where the writes go is the whole design decision. NOT into a new table: the
// authoritative store for something meant to outlive a session is the Mind
// Graph (lib/mind), the same rows Core reads to build a prompt and the same
// rows the Memory page shows. A parallel store would mean a second answer to
// "what does Socria know", and the honest number of answers is one.
//
// So this file is a translation layer, pure and testable: intents in, a new
// MindGraph out, refusals as VALUES rather than exceptions — because every
// refusal here has something to say to the person ("you forgot this in March",
// "you already have one of those") and an exception would throw that away.
//
// FOUR THINGS IT WILL NOT DO, each of them a rule the graph already lives by:
//
//   1. It will not resurrect something forgotten. A tombstone outranks a
//      create, and only an explicit, deliberate re-assertion by the person
//      clears one — never a convenience default, never a machine.
//   2. It will not make a second copy of something already there. It returns
//      the existing id instead, so the interface can offer to relate to it.
//   3. It will not create a private node by hand. `private` marks material
//      from a weighty Core conversation; a thing the person typed into their
//      own workspace is not that, and pretending otherwise would hide their
//      own object from Logos for reasons they never chose.
//   4. It will not quietly become a machine write. Everything here records
//      provenance {kind:'stated', surface:'user'} — which is what makes these
//      objects immune to being re-typed by the next extraction, via the
//      `locked` fields the Mind adapter derives from exactly that mark.

import {
  MAX_ALIASES,
  MAX_CONTENT,
  MAX_EDGES,
  MAX_LABEL,
  MAX_NODES,
  clamp01,
  clip,
  fingerprintNode,
  isForgotten,
  normalize,
  boundProvenance,
  type MindEdge,
  type MindGraph,
  type MindNode,
  type NodeStatus,
  type Provenance,
  type Relationship,
} from '@/lib/mind/types';

/** Injected, so every test is deterministic and nothing here reads a clock. */
export interface WriteContext {
  now: number;
  nextId: () => string;
  /** the conversation the person was in, for the provenance entry */
  conversationId?: string;
}

export interface CreateRequest {
  type: string;
  label: string;
  content?: string;
  aliases?: string[];
  status?: NodeStatus;
  /** what they said about why they are adding it */
  note?: string;
  /**
   * Re-assert something previously forgotten. Only ever true because the
   * person was told it was forgotten and said to add it anyway.
   */
  reassert?: boolean;
}

export interface RelateRequest {
  sourceId: string;
  targetId: string;
  relationship: Relationship;
  /** why they say these are connected — kept verbatim */
  note?: string;
}

export type Refusal = {
  ok: false;
  /** what stopped it, for the interface to act on */
  reason: 'forgotten' | 'exists' | 'missing' | 'self' | 'full' | 'invalid';
  /** what to tell the person, in their terms */
  say: string;
  /** the thing already there, when that is why */
  id?: string;
};

export type Written<T> = { ok: true; graph: MindGraph; it: T; say: string };

export const HAND_MADE: Pick<Provenance, 'kind' | 'surface'> = { kind: 'stated', surface: 'user' };

function ground(ctx: WriteContext, note?: string): Provenance {
  return {
    ...HAND_MADE,
    at: ctx.now,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
    ...(note ? { note: clip(note, 400) } : {}),
  };
}

/**
 * Add an object by hand.
 *
 * Defaults worth defending: confidence 1 and certainty 1, because the person
 * typing it IS the evidence and anything less would be Socria second-guessing
 * them about their own statement; importance 0.5, because they bothered, but
 * they did not say it was the most important thing they have; activation 0.5,
 * because they are looking at it right now.
 */
export function createNode(
  graph: MindGraph,
  req: CreateRequest,
  ctx: WriteContext
): Written<MindNode> | Refusal {
  const label = clip(req.label, MAX_LABEL);
  const type = clip(req.type, MAX_LABEL);
  if (!label) return { ok: false, reason: 'invalid', say: 'It needs a name.' };
  if (!type) return { ok: false, reason: 'invalid', say: 'What kind of thing is it?' };

  const fp = fingerprintNode(type, label);

  // Identity, the same way the store already decides it: normalised type and
  // label. An alias counts too — if they once told us "the lease thing" is
  // this, typing that again is the same object arriving by another name.
  const key = normalize(label);
  const existing = graph.nodes.find(
    (n) =>
      (normalize(n.type) === normalize(type) && normalize(n.label) === key) ||
      n.aliases.some((a) => normalize(a) === key)
  );
  if (existing) {
    return {
      ok: false,
      reason: 'exists',
      id: existing.id,
      say: `You already have “${existing.label}”. Relate to that one instead?`,
    };
  }

  if (isForgotten(graph, fp) && !req.reassert) {
    return {
      ok: false,
      reason: 'forgotten',
      say: `You forgot “${label}” before. Add it again?`,
    };
  }

  if (graph.nodes.length >= MAX_NODES) {
    return { ok: false, reason: 'full', say: 'Your graph is at its limit. Forget something first.' };
  }

  const p = ground(
    ctx,
    req.reassert ? [req.note, 'added again after forgetting it'].filter(Boolean).join(' — ') : req.note
  );
  const node: MindNode = {
    id: ctx.nextId(),
    type,
    label,
    content: clip(req.content ?? '', MAX_CONTENT),
    aliases: (req.aliases ?? []).map((a) => clip(a, MAX_LABEL)).filter(Boolean).slice(0, MAX_ALIASES),
    status: req.status ?? 'active',
    confidence: 1,
    certainty: 1,
    importance: 0.5,
    activation: 0.5,
    seen: 1,
    // Never by hand — see rule 3 in the header.
    private: false,
    provenance: [p],
    createdAt: ctx.now,
    updatedAt: ctx.now,
    lastAccessed: ctx.now,
  };

  // A deliberate re-assertion clears the tombstone, because leaving it would
  // mean the next extraction quietly refuses to reinforce the thing the person
  // just asked for. Nothing but this path clears one.
  const tombstones = req.reassert ? graph.tombstones.filter((t) => t !== fp) : graph.tombstones;

  return {
    ok: true,
    graph: { ...graph, nodes: [...graph.nodes, node], tombstones },
    it: node,
    say: `Added “${label}”.`,
  };
}

/**
 * Connect two objects by hand.
 *
 * A second identical relationship is not an error and not a duplicate row: it
 * is the person saying it again, which is reinforcement. Strength rises, the
 * ground is appended, and the edge keeps its history.
 */
export function relateNodes(
  graph: MindGraph,
  req: RelateRequest,
  ctx: WriteContext
): Written<MindEdge> | Refusal {
  const rel = clip(String(req.relationship ?? ''), 40);
  if (!rel) return { ok: false, reason: 'invalid', say: 'How are they related?' };
  if (req.sourceId === req.targetId) {
    return { ok: false, reason: 'self', say: 'A thing cannot depend on itself.' };
  }
  const from = graph.nodes.find((n) => n.id === req.sourceId);
  const to = graph.nodes.find((n) => n.id === req.targetId);
  if (!from || !to) {
    return { ok: false, reason: 'missing', say: 'One of those is no longer there.' };
  }

  const p = ground(ctx, req.note);
  const same = graph.edges.find(
    (e) => e.sourceId === from.id && e.targetId === to.id && normalize(e.relationship) === normalize(rel)
  );
  if (same) {
    const edge: MindEdge = {
      ...same,
      confidence: 1,
      strength: clamp01(same.strength + 0.2),
      provenance: boundProvenance([...same.provenance, p]),
      updatedAt: ctx.now,
      lastReinforced: ctx.now,
    };
    return {
      ok: true,
      graph: { ...graph, edges: graph.edges.map((e) => (e.id === same.id ? edge : e)) },
      it: edge,
      say: `Already connected — kept, and stronger for you saying it again.`,
    };
  }

  if (graph.edges.length >= MAX_EDGES) {
    return { ok: false, reason: 'full', say: 'Too many connections already.' };
  }

  const edge: MindEdge = {
    id: ctx.nextId(),
    sourceId: from.id,
    targetId: to.id,
    relationship: rel,
    confidence: 1,
    strength: 0.7,
    provenance: [p],
    createdAt: ctx.now,
    updatedAt: ctx.now,
    lastReinforced: ctx.now,
  };
  return {
    ok: true,
    graph: { ...graph, edges: [...graph.edges, edge] },
    it: edge,
    say: `“${from.label}” ${rel.replace(/_/g, ' ')} “${to.label}”.`,
  };
}

/**
 * Keep something from a session surface.
 *
 * The bridge between "I am thinking about this now" and "remember this". It
 * takes a label and a type from wherever the person was looking — a map node,
 * a ledger claim, a model's parameter — and writes it as an ordinary durable
 * object, recording the surface it came from so the trail back exists.
 *
 * `from` is the id ON THAT SURFACE, kept in the provenance entry rather than in
 * a field of its own, because durable memory does not model Logos's ids and
 * should not start to.
 */
export function keep(
  graph: MindGraph,
  it: { type: string; label: string; content?: string; surface: string; id?: string; note?: string },
  ctx: WriteContext
): Written<MindNode> | Refusal {
  const where = clip(it.surface, 24) || 'logos';
  const detail = [`kept from ${where}`, it.id ? `(${clip(it.id, 64)})` : '', it.note]
    .filter(Boolean)
    .join(' ');
  return createNode(
    graph,
    { type: it.type, label: it.label, content: it.content, note: detail },
    ctx
  );
}
