// lib/mind/serialize.ts
//
// The activated subgraph, as text a model reads.
//
// This is where the design either pays off or does not. A flat memory store
// serializes to a list of sentences, and a list of sentences cannot say that
// one of them caused another. What goes out from here keeps the edges, so
// Core can see that the limit MOTIVATED the move rather than merely that both
// happened.
//
// Two things it is careful about. Status is always visible: a superseded
// belief is reachable on purpose (see activate.ts) and presenting it
// unlabelled would be worse than omitting it. And nothing here is
// provider-specific — it is plain text with a fixed shape, so swapping the
// frontier model changes nothing about what is stored or retrieved.

import type { ActivatedSubgraph } from './activate';
import type { MindEdge, MindNode } from './types';

/** Roughly four characters to the token. */
export function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function statusNote(n: MindNode, now: number): string {
  if (n.status === 'active') return '';
  const when = n.updatedAt
    ? new Date(n.updatedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '';
  return ` (${n.status}${when ? `, ${when}` : ''})`;
}

/** The reason a change happened, if an edge recorded one. */
function edgeNote(e: MindEdge): string {
  const withNote = [...e.provenance].reverse().find((p) => p.note);
  return withNote?.note ? ` — ${withNote.note}` : '';
}

export interface SerializeOptions {
  now: number;
  /** hard ceiling; sections are dropped from the least-scoring end */
  maxTokens: number;
  scores?: Record<string, number>;
}

/**
 * Render the subgraph.
 *
 * Grouped by node, with that node's relationships beneath it, because the
 * relationships are the point. Ordered by score so that if the budget bites,
 * what is lost is what mattered least.
 */
export function serializeSubgraph(
  sub: ActivatedSubgraph,
  opts: SerializeOptions
): string {
  if (!sub.nodes.length) return '';

  const score = (n: MindNode) => opts.scores?.[n.id] ?? sub.scores[n.id] ?? 0;
  const ordered = [...sub.nodes].sort((a, b) => score(b) - score(a));
  const byId = new Map(sub.nodes.map((n) => [n.id, n]));

  const blocks: string[] = [];
  for (const n of ordered) {
    const lines: string[] = [];
    lines.push(`${n.type}${statusNote(n, opts.now)}: ${n.label} — ${n.content}`);

    for (const e of sub.edges) {
      if (e.sourceId === n.id) {
        const t = byId.get(e.targetId);
        if (t) lines.push(`  ${e.relationship} -> ${t.label}${edgeNote(e)}`);
      } else if (e.targetId === n.id) {
        const s = byId.get(e.sourceId);
        if (s) lines.push(`  ${e.relationship} <- ${s.label}${edgeNote(e)}`);
      }
    }
    blocks.push(lines.join('\n'));
  }

  // Trim from the bottom — the least relevant — until it fits.
  let body = blocks.join('\n');
  while (blocks.length > 1 && approxTokens(body) > opts.maxTokens) {
    blocks.pop();
    body = blocks.join('\n');
  }

  return body;
}

/**
 * The block as it appears in the system prompt.
 *
 * The framing sentence matters as much as the content. Core 4's own Semantic
 * Continuity section already says memory is context rather than
 * unquestionable truth and that current information takes precedence — this
 * says the same thing at the point of use, because a model reading a
 * confident-looking list of facts about somebody tends to treat them as
 * settled.
 */
export const MIND_GRAPH_INSTRUCTION = `

=== Mind Graph: what Socria understands about this person ===
The region below was activated by what they just said — nodes and the
relationships between them, drawn from everything across their conversations.
Read the relationships, not only the claims: they are how these things
actually connect.

Statuses are marked and they matter. A superseded or historical item is what
they USED to think, kept because how understanding changed is often the most
useful thing here; do not present it as current. A tentative or uncertain item
is a reading, not a fact. A contradicted item is in dispute and should be
treated as open.

This is context, not truth. What they say now takes precedence over anything
here, and if something below is wrong, believe them and move on.

`;

export function renderMindGraph(sub: ActivatedSubgraph, opts: SerializeOptions): string {
  const body = serializeSubgraph(sub, opts);
  return body ? MIND_GRAPH_INSTRUCTION + body + '\n' : '';
}
