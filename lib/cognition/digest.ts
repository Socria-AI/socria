// lib/cognition/digest.ts — a few facts about the person's own map, for the engine.
//
// The browser sends this with each Logos turn so the Cognitive Interaction
// Engine (lib/cognition/assist.ts) can ground a challenge in what the person's
// own map marks as unexamined or in conflict. Labels only, bounded, and
// re-sanitised on the server like every other field that arrives from a
// browser. Kept apart from assist.ts so the browser bundle carries this and
// nothing of the engine.
//
// PURE.

/** A few facts about the person's own map, sent with the turn (and re-sanitised). */
export interface MapDigest {
  /** the kind of thinking the map reflects: deciding, learning, math, … */
  context: string | null;
  /** for mathematics: learning, verification, utility, exploration */
  intent: string | null;
  /** assumptions on the map nobody has resolved */
  assumptions: string[];
  /** pairs of things on the map that conflict */
  conflicts: [string, string][];
  /** open questions on the map */
  open: string[];
}


const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** A digest that arrived from a browser, cleaned like every other field that does. */
export function sanitizeDigest(raw: unknown): MapDigest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 90)).filter(Boolean).slice(0, 6) : []);
  const conflicts = (Array.isArray(r.conflicts) ? r.conflicts : [])
    .filter((p): p is unknown[] => Array.isArray(p) && p.length === 2)
    .map((p) => [str(p[0], 90), str(p[1], 90)] as [string, string])
    .filter(([a, b]) => a && b)
    .slice(0, 4);
  const digest: MapDigest = { context: str(r.context, 20) || null, intent: str(r.intent, 20) || null, assumptions: list(r.assumptions), conflicts, open: list(r.open) };
  return digest.context || digest.assumptions.length || digest.conflicts.length || digest.open.length ? digest : null;
}

/** The digest of a map, for the browser to send: labels only, bounded. */
export function digestOf(map: {
  nodes: readonly { id: string; type: string; label: string; status?: string }[];
  edges: readonly { from: string; to: string; relation: string }[];
  context?: string;
  intent?: string;
} | null | undefined): MapDigest | null {
  if (!map || !Array.isArray(map.nodes)) return null;
  const label = (id: string) => map.nodes.find((n) => n.id === id)?.label ?? '';
  return sanitizeDigest({
    context: map.context ?? null,
    intent: map.intent ?? null,
    assumptions: map.nodes.filter((n) => n.type === 'assumption' && n.status !== 'resolved' && n.status !== 'supported').map((n) => n.label),
    conflicts: map.edges.filter((e) => e.relation === 'conflicts').map((e) => [label(e.from), label(e.to)]),
    open: map.nodes.filter((n) => n.type === 'question' && (n.status ?? 'open') === 'open').map((n) => n.label),
  });
}

