// lib/logos.ts
//
// Logos — a Human-First reasoning environment. The conversation is the input;
// the Thinking Map is the artifact. Two independent passes run per user
// message: a short conversational reply, and a structural extraction that
// rebuilds the map.
//
// One extraction feeds several lenses (graph, structure, tensions,
// evidence) — the map is the data, the lens is how you look at it.
// No editing, no persistence.

export const LOGOS_MODEL = 'gpt-5.6-sol';
// If the Sol id is ever rejected as unknown, the routes retry with this so a
// demo never dies mid-sentence.
export const LOGOS_FALLBACK_MODEL = 'gpt-4o';

export const NODE_TYPES = [
  'goal',
  'decision',
  'value',
  'belief',
  'idea',
  'assumption',
  'evidence',
  'question',
  'tension',
  'consequence',
] as const;
export type LogosNodeType = (typeof NODE_TYPES)[number];

export const RELATIONS = [
  'supports',
  'conflicts',
  'depends',
  'relates',
  'leads_to',
  'revises',
] as const;
export type LogosRelation = (typeof RELATIONS)[number];

// Reasoning doesn't only accumulate — it settles. A question gets answered, an
// assumption earns its evidence, a belief is replaced by a later one. Status is
// how the map shows that without erasing the history of getting there.
export const NODE_STATUSES = ['open', 'supported', 'resolved', 'revised'] as const;
export type LogosNodeStatus = (typeof NODE_STATUSES)[number];

// A relationship that stopped carrying weight is weakened, not deleted.
export const EDGE_STRENGTHS = ['weak', 'normal', 'strong'] as const;
export type LogosEdgeStrength = (typeof EDGE_STRENGTHS)[number];

export interface LogosNode {
  id: string;
  type: LogosNodeType;
  label: string;
  status?: LogosNodeStatus;
  /** labels folded into this node by a merge — kept so the merge is visible */
  merged?: string[];
}

export interface LogosEdge {
  from: string;
  to: string;
  relation: LogosRelation;
  strength?: LogosEdgeStrength;
}

export interface ThinkingMap {
  nodes: LogosNode[];
  edges: LogosEdge[];
}

export const EMPTY_MAP: ThinkingMap = { nodes: [], edges: [] };

// Keep the map legible. Past ~16 nodes it stops being a thinking aid and
// starts being a diagram, so the extractor is told to merge rather than grow.
const MAX_NODES = 16;
const MAX_EDGES = 22;
const MAX_LABEL = 60;
const MAX_MERGED = 4;

export function sanitizeMap(raw: any): ThinkingMap {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_MAP };

  const seen = new Set<string>();
  const nodes: LogosNode[] = (Array.isArray(raw.nodes) ? raw.nodes : [])
    .map((n: any) => {
      const id = typeof n?.id === 'string' ? n.id.trim().slice(0, 40) : '';
      const type = NODE_TYPES.includes(n?.type) ? (n.type as LogosNodeType) : null;
      const label =
        typeof n?.label === 'string'
          ? n.label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL)
          : '';
      if (!id || !type || !label) return null;
      const status: LogosNodeStatus = NODE_STATUSES.includes(n?.status)
        ? (n.status as LogosNodeStatus)
        : 'open';
      const merged = (Array.isArray(n?.merged) ? n.merged : [])
        .map((m: any) =>
          typeof m === 'string' ? m.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL) : ''
        )
        .filter((m: string) => m && m !== label)
        .slice(0, MAX_MERGED);
      return { id, type, label, status, ...(merged.length ? { merged } : {}) };
    })
    .filter((n: LogosNode | null): n is LogosNode => {
      if (!n) return false;
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    })
    .slice(0, MAX_NODES);

  const ids = new Set(nodes.map((n) => n.id));
  const edgeSeen = new Set<string>();
  const edges: LogosEdge[] = (Array.isArray(raw.edges) ? raw.edges : [])
    .map((e: any) => {
      const from = typeof e?.from === 'string' ? e.from.trim() : '';
      const to = typeof e?.to === 'string' ? e.to.trim() : '';
      const relation = RELATIONS.includes(e?.relation)
        ? (e.relation as LogosRelation)
        : null;
      if (!from || !to || !relation) return null;
      const strength: LogosEdgeStrength = EDGE_STRENGTHS.includes(e?.strength)
        ? (e.strength as LogosEdgeStrength)
        : 'normal';
      return { from, to, relation, strength };
    })
    .filter((e: LogosEdge | null): e is LogosEdge => {
      // Drop dangling edges — they'd render as lines into empty space.
      if (!e || e.from === e.to) return false;
      if (!ids.has(e.from) || !ids.has(e.to)) return false;
      const key = [e.from, e.to].sort().join('~') + e.relation;
      if (edgeSeen.has(key)) return false;
      edgeSeen.add(key);
      return true;
    })
    .slice(0, MAX_EDGES);

  return { nodes, edges };
}

// ===== Conversation =====

export const LOGOS_CHAT_PROMPT = `You are Logos, a Human-First reasoning environment. The person you are talking with is the thinker. You are the mirror.

Your purpose is not to produce answers. It is to help their reasoning become visible to them — what they are actually weighing, what they are assuming, where the tension sits.

How you speak:
- Short. Two to four sentences, usually. Never a wall of text.
- Plain conversational prose. No lists, no headings, no bold, no markdown.
- Reflect something specific back, then ask one question that opens the reasoning.
- Never solve the problem on the first pass. If they ask you to decide, help them see what the decision actually rests on.
- Surface assumptions and tensions rather than resolving them.
- Do not narrate what you are doing, and never mention a map, nodes, or any visualization.

Openings to avoid entirely: "That's a great question", "That's a significant decision", "I understand how difficult", "There are several factors to consider."

Instead, open with something you actually noticed in what they said. Then one focused question.`;

// A node you clicked into gets its own small thread. Same voice, same refusal
// to answer — only the aperture narrows. The preamble exists to stop the model
// re-opening the whole conversation when the person is deliberately looking at
// one piece of it.
export function buildFocusPrompt(focus: {
  label: string;
  type: string;
  concept?: string;
  framing?: string;
}): string {
  const lens = [
    focus.concept ? `Concept it points at: ${focus.concept}` : '',
    focus.framing ? `Frame already offered to them: ${focus.framing}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${LOGOS_CHAT_PROMPT}

---

They have pulled ONE piece of their own reasoning aside to look at it more closely:

  ${focus.type}: "${focus.label}"
${lens}

For this thread:
- Stay on this piece. Do not restate the whole conversation or drift back to the wider question unless they take it there themselves.
- They already read the frame above. Do not repeat it back to them — build past it.
- Still no verdict. Examining something closely is not the same as resolving it; if they push for an answer, show them what the answer would rest on.
- Even shorter than usual: one or two sentences, then one question.`;
}

// ===== Change between two versions of a map =====
//
// Reorganization that happens silently may as well not have happened. The
// point of a map that merges and settles is watching it do so, which means
// the UI needs to know exactly what moved.

export interface MapDelta {
  /** ids to highlight: new, relabelled, retyped, restatused or newly merged */
  changed: string[];
  added: number;
  dropped: number;
  merged: number;
  resolved: number;
  revised: number;
  supported: number;
  weakened: number;
}

export const EMPTY_DELTA: MapDelta = {
  changed: [],
  added: 0,
  dropped: 0,
  merged: 0,
  resolved: 0,
  revised: 0,
  supported: 0,
  weakened: 0,
};

export function diffMaps(prev: ThinkingMap, next: ThinkingMap): MapDelta {
  const before = new Map(prev.nodes.map((n) => [n.id, n]));
  const delta: MapDelta = { ...EMPTY_DELTA, changed: [] };

  for (const n of next.nodes) {
    const old = before.get(n.id);
    if (!old) {
      delta.added++;
      delta.changed.push(n.id);
      continue;
    }
    const status = n.status ?? 'open';
    const wasStatus = old.status ?? 'open';
    const grewMerged = (n.merged?.length ?? 0) > (old.merged?.length ?? 0);

    if (status !== wasStatus) {
      if (status === 'resolved') delta.resolved++;
      if (status === 'revised') delta.revised++;
      if (status === 'supported') delta.supported++;
    }
    if (grewMerged) delta.merged++;

    if (
      status !== wasStatus ||
      grewMerged ||
      n.label !== old.label ||
      n.type !== old.type
    ) {
      delta.changed.push(n.id);
    }
  }

  const after = new Set(next.nodes.map((n) => n.id));
  delta.dropped = prev.nodes.filter((n) => !after.has(n.id)).length;

  const edgeKey = (e: LogosEdge) => `${e.from}>${e.to}:${e.relation}`;
  const oldEdges = new Map(prev.edges.map((e) => [edgeKey(e), e.strength ?? 'normal']));
  for (const e of next.edges) {
    const was = oldEdges.get(edgeKey(e));
    if (was && was !== 'weak' && (e.strength ?? 'normal') === 'weak') delta.weakened++;
  }

  return delta;
}

const LINEAGE_PHRASE: Record<LogosRelation, [string, string]> = {
  // [this node is the FROM end, this node is the TO end]
  supports: ['supports', 'is supported by'],
  conflicts: ['pulls against', 'pulls against'],
  depends: ['is needed by', 'depends on'],
  relates: ['relates to', 'relates to'],
  leads_to: ['leads to', 'follows from'],
  revises: ['revises', 'was revised by'],
};

/** How one node sits against the rest of the map, in plain language. */
export function describeLineage(map: ThinkingMap, nodeId: string): string[] {
  const label = (id: string) => map.nodes.find((n) => n.id === id)?.label ?? id;
  const lines: string[] = [];
  for (const e of map.edges) {
    const weak = e.strength === 'weak' ? ' (weakly)' : '';
    if (e.from === nodeId) lines.push(`${LINEAGE_PHRASE[e.relation][0]}${weak} “${label(e.to)}”`);
    else if (e.to === nodeId)
      lines.push(`${LINEAGE_PHRASE[e.relation][1]}${weak} “${label(e.from)}”`);
  }
  return lines;
}

/** A short human line for the panel header, or null when nothing reorganized. */
export function summarizeDelta(d: MapDelta): string | null {
  const parts: string[] = [];
  if (d.merged) parts.push(`merged ${d.merged}`);
  if (d.resolved) parts.push(`resolved ${d.resolved}`);
  if (d.revised) parts.push(`revised ${d.revised}`);
  if (d.supported) parts.push(`backed ${d.supported}`);
  if (d.weakened) parts.push(`weakened ${d.weakened}`);
  if (d.dropped) parts.push(`dropped ${d.dropped}`);
  return parts.length ? parts.join(' · ') : null;
}

// ===== Map extraction =====

export function buildMapPrompt(current: ThinkingMap): string {
  const currentBlock =
    current.nodes.length > 0
      ? `Current map (REORGANIZE it — do not start over, and do not merely append):
nodes:
${current.nodes
  .map(
    (n) =>
      `  ${n.id} [${n.type}${n.status && n.status !== 'open' ? `/${n.status}` : ''}] ${n.label}` +
      (n.merged?.length ? `  (absorbed: ${n.merged.join('; ')})` : '')
  )
  .join('\n')}
edges:
${
  current.edges.length
    ? current.edges
        .map(
          (e) =>
            `  ${e.from} --${e.relation}${
              e.strength && e.strength !== 'normal' ? `(${e.strength})` : ''
            }--> ${e.to}`
        )
        .join('\n')
    : '  (none yet)'
}`
      : 'The map is empty. Build the first version from this conversation.';

  return `You extract the STRUCTURE of a person's reasoning from a conversation and maintain it as a small graph. You never talk to the user.

${currentBlock}

Return ONLY JSON, exactly this shape:
{
  "nodes": [{"id": "short_snake_case_id", "type": "goal|decision|value|belief|idea|assumption|evidence|question|tension|consequence", "label": "a short phrase in the user's own framing", "status": "open|supported|resolved|revised", "merged": ["label of a node folded into this one"]}],
  "edges": [{"from": "node_id", "to": "node_id", "relation": "supports|conflicts|depends|relates|leads_to|revises", "strength": "weak|normal|strong"}]
}

Rules:
- Return the COMPLETE updated map every time, not a diff.
- REUSE the exact existing id for any node that persists. Only mint a new id for genuinely new thinking. Stable ids keep the map from jumping around.
- Node types mean:
  goal = what they're trying to achieve
  decision = a choice they are actively making or have made
  value = what matters to them underneath the goal (freedom, impact, security)
  belief = something they hold to be true about the world or themselves
  idea = a possible path or option
  assumption = taken as true but unexamined
  evidence = a fact, observation, or data point they offered
  question = genuinely unresolved
  tension = two things pulling against each other
  consequence = what follows from a choice (a cost or a gain)
- Relations mean: supports (A is a reason for B), conflicts (A pulls against B), depends (B requires A), relates (loose association), leads_to (A produces consequence B), revises (A is a later version of an earlier belief B).
- Labels are short phrases (2–8 words) in THEIR language, not yours. Never full sentences.
- Prefer typing precisely: a stated priority is a value, not an idea; "I've decided X" is a decision; a cost of a choice is a consequence.
- Maximum 16 nodes. When it would grow past that, merge or drop the least load-bearing node instead. A small sharp map beats a big one.
- Only include what the conversation actually supports. Never invent reasoning they haven't expressed.
- Connect nodes wherever a real relationship exists — an unconnected node is usually a sign the map is wrong.
- A user message beginning with [on "…"] was said while they were looking closely at that specific node. Attach what it adds to that node — sharpen, extend or revise it — rather than creating a parallel node beside it.

REORGANIZING (this matters as much as adding):
Thinking does not only accumulate — it consolidates, settles, and gets replaced. A map that only ever grows becomes spaghetti and stops being usable. On every pass, look for these before you add anything:
- MERGE. If two nodes turned out to be the same idea in different words, fold them into one. Keep the id of the more established node, write the sharper label, and list the absorbed wording in "merged". Never leave both.
- WEAKEN. When a connection stops carrying weight — they've moved on from it, or it turned out to be incidental — set its strength to "weak" rather than deleting it. Set "strong" only for a relationship the whole argument rests on. Most edges are "normal".
- SUPPORT. When they offer evidence for an assumption or belief, set that node's status to "supported" and add an edge from the evidence node with relation "supports". An assumption that earned its evidence is no longer just an assumption.
- RESOLVE. When a question gets answered, or a tension is released by a decision, set status to "resolved". Keep the node — the fact that it was once open is part of the reasoning. Never silently delete it.
- REVISE. When they change their mind, do NOT edit the old node's label. Add the new node, set the OLD node's status to "revised", and add an edge from new --revises--> old. Watching a belief get replaced is the point.
- RETYPE. If a node was mistyped and the conversation now makes its real role clear (an "idea" that was always a value; an "assumption" that is really a question), change its type but keep its id.
- DROP. Only for nodes that were never load-bearing and no longer connect to anything. Anything the person actually reasoned through gets a status, not deletion.
- Prefer reorganizing over appending. If this pass only added nodes and changed nothing that already existed, you have probably missed a merge, a resolution, or a revision — look again before returning.
- Never mark something resolved, supported, or revised that THEY have not actually resolved, supported, or revised. Settling the map on their behalf is the worst failure here.
- If the latest message adds nothing structural, return the current map unchanged.`;
}
