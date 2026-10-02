// lib/map-edit.ts
//
// THE MAP, EDITED BY HAND — from the conversation or from a card.
//
// The Thinking Map is drawn by an extractor that reads the conversation, and
// until this file the only way to change it was to say something the
// extractor might act on. "Delete the node about rent" went to a language
// model, which answered in prose, and the node stayed. A map the person
// cannot edit is a map of what Logos thinks they think.
//
// So an edit is a small, deterministic thing, here, with no model in the loop:
//
//   · a COMMAND in the conversation is read locally — "remove the node about
//     rent", "rename 'cost' to 'monthly cost'", "mark the question resolved" —
//     resolved against the labels on the map, and applied before anything is
//     sent anywhere. A sentence that is not plainly a command is not touched;
//     it goes to Logos as it always did.
//   · a card's menu (and a right-click on one) offers the same edits directly.
//
// AND A REMOVAL STAYS REMOVED. The extractor rebuilds the map from the
// transcript every turn, and the transcript still contains whatever put the
// node there. The map carries the labels the person took off (`removed`); the
// extractor is told, and the client drops anything matching on the way in
// regardless of what the extractor did. Trust rule: the person's edit is not
// a suggestion.

import type { LogosNodeStatus, LogosRelation, LogosNode, ThinkingMap } from './logos';

export type MapEdit =
  | { op: 'remove'; id: string }
  | { op: 'rename'; id: string; label: string }
  | { op: 'status'; id: string; status: LogosNodeStatus }
  | { op: 'link'; from: string; to: string; relation?: LogosRelation }
  | { op: 'unlink'; from: string; to: string };

/** The most labels a map remembers removing. Past this the oldest is forgotten. */
export const MAX_REMOVED = 40;
const MAX_LABEL = 160;

/** One label, as it is compared: case, quotes, punctuation and spacing do not count. */
export function keyOf(label: string): string {
  return label
    .toLowerCase()
    .replace(/[“”"'‘’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── applying edits ────────────────────────────────────────────────────

export interface Applied {
  edit: MapEdit;
  /** what was done, as a sentence the conversation can carry */
  said: string;
}

export interface EditOutcome {
  map: ThinkingMap;
  applied: Applied[];
  /** edits that named something not on the map — said, never silently dropped */
  refused: string[];
}

const quote = (s: string) => `“${s}”`;

export function applyMapEdits(map: ThinkingMap, edits: readonly MapEdit[]): EditOutcome {
  let nodes = [...map.nodes];
  let edges = [...map.edges];
  let removed = [...(map.removed ?? [])];
  const applied: Applied[] = [];
  const refused: string[] = [];
  const byId = (id: string) => nodes.find((n) => n.id === id);

  for (const edit of edits) {
    if (edit.op === 'remove') {
      const n = byId(edit.id);
      if (!n) { refused.push(`Nothing on the map has the id ${edit.id}.`); continue; }
      nodes = nodes.filter((x) => x.id !== n.id);
      edges = edges.filter((e) => e.from !== n.id && e.to !== n.id);
      const key = keyOf(n.label);
      if (key && !removed.includes(key)) removed = [...removed, key].slice(-MAX_REMOVED);
      applied.push({ edit, said: `Removed ${quote(n.label)} from the map.` });
    } else if (edit.op === 'rename') {
      const n = byId(edit.id);
      const label = edit.label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
      if (!n) { refused.push(`Nothing on the map has the id ${edit.id}.`); continue; }
      if (!label) { refused.push(`A node cannot be called nothing.`); continue; }
      const was = n.label;
      // The TeX was set for the old wording; a label the person wrote is what
      // they want to see, so the typeset form goes with the old label.
      const { tex: _tex, ...rest } = n;
      nodes = nodes.map((x) => (x.id === n.id ? { ...rest, label } : x));
      applied.push({ edit, said: `Renamed ${quote(was)} to ${quote(label)}.` });
    } else if (edit.op === 'status') {
      const n = byId(edit.id);
      if (!n) { refused.push(`Nothing on the map has the id ${edit.id}.`); continue; }
      nodes = nodes.map((x) => (x.id === n.id ? { ...x, status: edit.status } : x));
      applied.push({
        edit,
        said: edit.status === 'open' ? `Reopened ${quote(n.label)}.` : `Marked ${quote(n.label)} ${edit.status}.`,
      });
    } else if (edit.op === 'link') {
      const a = byId(edit.from), b = byId(edit.to);
      if (!a || !b) { refused.push(`Both ends of a connection have to be on the map.`); continue; }
      if (a.id === b.id) { refused.push(`A node cannot be connected to itself.`); continue; }
      const relation = edit.relation ?? 'relates';
      const dup = edges.some((e) => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id));
      if (!dup) edges = [...edges, { from: a.id, to: b.id, relation, strength: 'normal' }];
      applied.push({ edit, said: dup ? `${quote(a.label)} and ${quote(b.label)} were already connected.` : `Connected ${quote(a.label)} to ${quote(b.label)}.` });
    } else if (edit.op === 'unlink') {
      const a = byId(edit.from), b = byId(edit.to);
      if (!a || !b) { refused.push(`Both ends of a connection have to be on the map.`); continue; }
      const before = edges.length;
      edges = edges.filter((e) => !((e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id)));
      applied.push({ edit, said: edges.length < before ? `Disconnected ${quote(a.label)} from ${quote(b.label)}.` : `${quote(a.label)} and ${quote(b.label)} were not connected.` });
    }
  }

  const out: ThinkingMap = { ...map, nodes, edges };
  if (removed.length) out.removed = removed;
  else delete out.removed;
  return { map: out, applied, refused };
}

/**
 * Take off a map everything the person removed by hand.
 *
 * Run on every map that arrives from the extractor: the transcript still
 * holds whatever put the node there, and a model told "do not put this back"
 * mostly listens. Mostly is not a guarantee; this is. Matched by label key,
 * because the extractor will not reuse an id for a node it no longer sees.
 */
export function dropRemoved(map: ThinkingMap, removed: readonly string[] | undefined): ThinkingMap {
  if (!removed?.length) return map;
  const gone = new Set(removed);
  const nodes = map.nodes.filter((n) => !gone.has(keyOf(n.label)));
  if (nodes.length === map.nodes.length) return { ...map, removed: [...removed] };
  const ids = new Set(nodes.map((n) => n.id));
  return { ...map, nodes, edges: map.edges.filter((e) => ids.has(e.from) && ids.has(e.to)), removed: [...removed] };
}

// ── naming a node ─────────────────────────────────────────────────────

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'that', 'this', 'is', 'it', 'my', 'our', 'node', 'card', 'map', 'about', 'one']);
const tokens = (s: string) => keyOf(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t));

export type Found = { node: LogosNode } | { ambiguous: LogosNode[] } | null;

/**
 * Which node a phrase means. Exact label, then id, then containment, then the
 * node whose label holds every content word of the phrase. Two equally good
 * candidates are returned as a question rather than guessed between.
 */
export function findNode(map: ThinkingMap, phrase: string): Found {
  const key = keyOf(phrase);
  if (!key) return null;
  const exact = map.nodes.filter((n) => keyOf(n.label) === key);
  if (exact.length === 1) return { node: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };
  const byId = map.nodes.find((n) => n.id === phrase.trim());
  if (byId) return { node: byId };
  const contains = map.nodes.filter((n) => {
    const k = keyOf(n.label);
    return k.includes(key) || (key.length >= 8 && key.includes(k));
  });
  if (contains.length === 1) return { node: contains[0] };
  if (contains.length > 1) return { ambiguous: contains };
  const want = tokens(phrase);
  if (!want.length) return null;
  const scored = map.nodes
    .map((n) => {
      // The type counts as a word of the label: "the Berlin question" names
      // a question about Berlin, and the card says "question" on its face.
      const have = new Set([...tokens(n.label), n.type]);
      const hit = want.filter((t) => have.has(t)).length;
      return { n, hit, ratio: hit / want.length };
    })
    .filter((s) => s.hit > 0 && s.ratio >= (want.length === 1 ? 1 : 0.6))
    .sort((a, b) => b.ratio - a.ratio || b.hit - a.hit);
  if (!scored.length) return null;
  const best = scored.filter((s) => s.ratio === scored[0].ratio && s.hit === scored[0].hit);
  return best.length === 1 ? { node: best[0].n } : { ambiguous: best.map((s) => s.n) };
}

// ── reading a command from the conversation ───────────────────────────

export interface Command {
  edits: MapEdit[];
  /** the sentence the conversation carries back, built before applying — the names are the map's */
  said: string;
}
export interface Refusal {
  refused: string;
}

const Q = `["“”'‘’]?`;
const THING = `(?:the\\s+|this\\s+|that\\s+|my\\s+)?(?:node|card|idea|point|bubble|box|one)?\\s*(?:about|called|named|labell?ed|on|for|that says|saying|reading)?\\s*`;
const TAIL = `\\s*(?:from (?:the|my|this) map)?\\s*[.!]*\\s*$`;
const RX = {
  remove: new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(?:delete|remove|drop|erase|get rid of|take (?:off|out|away|down)|forget)\\s+${THING}${Q}(.+?)${Q}${TAIL}`, 'i'),
  rename: new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(?:rename|relabel|reword|call)\\s+${THING}${Q}(.+?)${Q}\\s+(?:to|as)\\s+${Q}(.+?)${Q}\\s*[.!]*\\s*$`, 'i'),
  mark: new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(?:mark|set|flag)\\s+${THING}${Q}(.+?)${Q}\\s+(?:as\\s+)?(resolved|done|answered|settled|closed|supported|open|reopened|revised)${TAIL}`, 'i'),
  resolve: new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(resolve|reopen|close)\\s+${THING}${Q}(.+?)${Q}${TAIL}`, 'i'),
  link: new RegExp(`^(?:please\\s+|can you\\s+|could you\\s+)?(connect|link|disconnect|unlink)\\s+${THING}${Q}(.+?)${Q}\\s+(?:to|and|with|from)\\s+${Q}(.+?)${Q}${TAIL}`, 'i'),
};
const STATUS: Record<string, LogosNodeStatus> = {
  resolved: 'resolved', done: 'resolved', answered: 'resolved', settled: 'resolved', closed: 'resolved',
  supported: 'supported', open: 'open', reopened: 'open', revised: 'revised',
};
/** The text names the map or a node on it outright — then a miss is answered, not forwarded. */
const EXPLICIT = /\b(node|card|map|bubble)\b/i;

/**
 * Is this message a command to edit the map? If so, which edits.
 *
 * Null means "not a command — send it to Logos". A command that names nothing
 * on the map is a refusal (a sentence to show) only when it plainly meant the
 * map; "drop the formality" is not about the map and goes through untouched.
 * Short messages only: a paragraph that happens to start with "remove" is
 * prose.
 */
export function readMapCommand(text: string, map: ThinkingMap): Command | Refusal | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > 220 || !map.nodes.length) return null;
  const explicit = EXPLICIT.test(t);
  const miss = (phrase: string, f: Found): Refusal | null => {
    if (f && 'ambiguous' in f) {
      return { refused: `${quote(phrase)} could mean more than one thing on the map: ${f.ambiguous.map((n) => quote(n.label)).join(', ')}. Which one?` };
    }
    return explicit ? { refused: `Nothing on the map is called ${quote(phrase)}.` } : null;
  };

  let m: RegExpMatchArray | null;
  if ((m = t.match(RX.rename))) {
    const f = findNode(map, m[1]);
    if (!f || !('node' in f)) return miss(m[1], f);
    return { edits: [{ op: 'rename', id: f.node.id, label: m[2] }], said: `Renamed ${quote(f.node.label)} to ${quote(m[2].trim())}.` };
  }
  if ((m = t.match(RX.link))) {
    const a = findNode(map, m[2]), b = findNode(map, m[3]);
    if (!a || !('node' in a)) return miss(m[2], a);
    if (!b || !('node' in b)) return miss(m[3], b);
    const off = /^(disconnect|unlink)$/i.test(m[1]);
    return {
      edits: [off ? { op: 'unlink', from: a.node.id, to: b.node.id } : { op: 'link', from: a.node.id, to: b.node.id }],
      said: `${off ? 'Disconnected' : 'Connected'} ${quote(a.node.label)} ${off ? 'from' : 'to'} ${quote(b.node.label)}.`,
    };
  }
  if ((m = t.match(RX.mark))) {
    const f = findNode(map, m[1]);
    if (!f || !('node' in f)) return miss(m[1], f);
    const status = STATUS[m[2].toLowerCase()];
    return { edits: [{ op: 'status', id: f.node.id, status }], said: status === 'open' ? `Reopened ${quote(f.node.label)}.` : `Marked ${quote(f.node.label)} ${status}.` };
  }
  if ((m = t.match(RX.resolve))) {
    const f = findNode(map, m[2]);
    if (!f || !('node' in f)) return miss(m[2], f);
    const status: LogosNodeStatus = /^reopen$/i.test(m[1]) ? 'open' : 'resolved';
    return { edits: [{ op: 'status', id: f.node.id, status }], said: status === 'open' ? `Reopened ${quote(f.node.label)}.` : `Marked ${quote(f.node.label)} resolved.` };
  }
  if ((m = t.match(RX.remove))) {
    // "remove X and Y" takes both off. The split is tried first and wins
    // when every part names a node; otherwise the phrase is one name, which
    // may itself contain an "and".
    const whole = findNode(map, m[1]);
    const split = m[1].split(/\s*(?:,|\band\b)\s*/i).filter(Boolean);
    const splitFound = split.length > 1 ? split.map((p) => [p, findNode(map, p)] as const) : [];
    const allParts = splitFound.length > 0 && splitFound.every(([, f]) => f && 'node' in f);
    const found = allParts ? splitFound : ([[m[1], whole]] as (readonly [string, Found])[]);
    const hit = found.filter(([, f]) => f && 'node' in f) as [string, { node: LogosNode }][];
    if (!hit.length) return miss(m[1], whole);
    const seen = new Set<string>();
    const nodes = hit.map(([, f]) => f.node).filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
    return {
      edits: nodes.map((n) => ({ op: 'remove' as const, id: n.id })),
      said: `Removed ${nodes.map((n) => quote(n.label)).join(' and ')} from the map.`,
    };
  }
  return null;
}
