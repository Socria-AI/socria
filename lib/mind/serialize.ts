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
import { MEMBERSHIP_RELATIONSHIPS } from './projects';
import type { MindEdge, MindNode } from './types';

/** How many relationships one node may show. A hub is not more relevant
 *  for having more edges, and one unbounded block defeats the ceiling. */
export const MAX_RELATIONSHIPS_PER_NODE = 12;

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
  // A Project tie's note is bookkeeping ("first came up in this project"),
  // not a reason, and read outside that Project "this project" points at
  // nothing.
  if (MEMBERSHIP_RELATIONSHIPS.has(e.relationship)) return '';
  const withNote = [...e.provenance].reverse().find((p) => p.note);
  return withNote?.note ? ` — ${withNote.note}` : '';
}

export interface SerializeOptions {
  now: number;
  /** hard ceiling; sections are dropped from the least-scoring end */
  maxTokens: number;
  scores?: Record<string, number>;
  /**
   * Node id → the Project it surfaced from, for nodes that came from a
   * Project other than the current one. Rendered as a tag on the node's own
   * line, so Core can say "from your Calculus work" instead of presenting a
   * memory from elsewhere as though it belonged to this conversation.
   */
  origin?: Record<string, string>;
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
    const from = opts.origin?.[n.id] ? ` [from project: ${opts.origin[n.id]}]` : '';
    lines.push(`${n.type}${statusNote(n, opts.now)}: ${n.label} — ${n.content}${from}`);

    let shown = 0;
    for (const e of sub.edges) {
      // A node with hundreds of edges would otherwise produce one enormous
      // block that the whole-block trim cannot reduce.
      if (shown >= MAX_RELATIONSHIPS_PER_NODE) break;
      if (e.sourceId === n.id) {
        const t = byId.get(e.targetId);
        if (t) { lines.push(`  ${e.relationship} -> ${t.label}${edgeNote(e)}`); shown++; }
      } else if (e.targetId === n.id) {
        const s = byId.get(e.sourceId);
        if (s) { lines.push(`  ${e.relationship} <- ${s.label}${edgeNote(e)}`); shown++; }
      }
    }
    blocks.push(lines.join('\n'));
  }

  // Trim from the bottom — the least relevant — until it fits.
  //
  // A single block is bounded too. Trimming whole blocks cannot go below one,
  // and one block is a node plus every relationship it has: a hub node alone
  // could blow the ceiling by an order of magnitude and the loop would exit
  // reporting success. So a block's relationship lines are capped first.
  let body = blocks.join('\n');
  while (blocks.length > 1 && approxTokens(body) > opts.maxTokens) {
    blocks.pop();
    body = blocks.join('\n');
  }
  if (approxTokens(body) > opts.maxTokens) {
    const lines = body.split('\n');
    const room = Math.max(1, Math.floor((opts.maxTokens * 4) / 60));
    body = lines.slice(0, room).join('\n');
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
