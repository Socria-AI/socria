// lib/logos.ts
//
// Logos — a Human-First reasoning environment. The conversation is the input;
// the Thinking Map is the artifact. Two independent passes run per user
// message: a short conversational reply, and a structural extraction that
// rebuilds the map.
//
// Prototype scope is deliberately narrow: six node types, four relations,
// no editing, no persistence.

export const LOGOS_MODEL = 'gpt-5.6-sol';
// If the Sol id is ever rejected as unknown, the routes retry with this so a
// demo never dies mid-sentence.
export const LOGOS_FALLBACK_MODEL = 'gpt-4o';

export const NODE_TYPES = [
  'goal',
  'idea',
  'assumption',
  'evidence',
  'question',
  'tension',
] as const;
export type LogosNodeType = (typeof NODE_TYPES)[number];

export const RELATIONS = ['supports', 'conflicts', 'depends', 'relates'] as const;
export type LogosRelation = (typeof RELATIONS)[number];

export interface LogosNode {
  id: string;
  type: LogosNodeType;
  label: string;
}

export interface LogosEdge {
  from: string;
  to: string;
  relation: LogosRelation;
}

export interface ThinkingMap {
  nodes: LogosNode[];
  edges: LogosEdge[];
}

export const EMPTY_MAP: ThinkingMap = { nodes: [], edges: [] };

// Keep the map legible. Past ~14 nodes it stops being a thinking aid and
// starts being a diagram, so the extractor is told to merge rather than grow.
const MAX_NODES = 14;
const MAX_EDGES = 22;
const MAX_LABEL = 60;

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
      return id && type && label ? { id, type, label } : null;
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
      return from && to && relation ? { from, to, relation } : null;
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

// ===== Map extraction =====

export function buildMapPrompt(current: ThinkingMap): string {
  const currentBlock =
    current.nodes.length > 0
      ? `Current map (evolve it — do not start over):
nodes:
${current.nodes.map((n) => `  ${n.id} [${n.type}] ${n.label}`).join('\n')}
edges:
${
  current.edges.length
    ? current.edges.map((e) => `  ${e.from} --${e.relation}--> ${e.to}`).join('\n')
    : '  (none yet)'
}`
      : 'The map is empty. Build the first version from this conversation.';

  return `You extract the STRUCTURE of a person's reasoning from a conversation and maintain it as a small graph. You never talk to the user.

${currentBlock}

Return ONLY JSON, exactly this shape:
{
  "nodes": [{"id": "short_snake_case_id", "type": "goal|idea|assumption|evidence|question|tension", "label": "a short phrase in the user's own framing"}],
  "edges": [{"from": "node_id", "to": "node_id", "relation": "supports|conflicts|depends|relates"}]
}

Rules:
- Return the COMPLETE updated map every time, not a diff.
- REUSE the exact existing id for any node that persists. Only mint a new id for genuinely new thinking. Stable ids keep the map from jumping around.
- Node types mean: goal = what they're trying to achieve; idea = a possible path or option; assumption = something taken as true but unexamined; evidence = a fact or observation they offered; question = something genuinely unresolved; tension = two things pulling against each other.
- Labels are short phrases (2–8 words) in THEIR language, not yours. Never full sentences.
- Maximum 14 nodes. When it would grow past that, merge or drop the least load-bearing node instead. A small sharp map beats a big one.
- Only include what the conversation actually supports. Never invent reasoning they haven't expressed.
- Connect nodes wherever a real relationship exists — an unconnected node is usually a sign the map is wrong.
- If the latest message adds nothing structural, return the current map unchanged.`;
}
