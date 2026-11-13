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
import { DRAWING_LIMITS, MAP_LABEL_MAX, NODE_TYPES, RELATIONS, mapCaps, sanitizeNodeEvidence, sanitizeNodeFinding } from './logos';
import { withDrawing, type Drawing } from './logos5/drawing';

export type MapEdit =
  | { op: 'remove'; id: string }
  | { op: 'rename'; id: string; label: string }
  | { op: 'status'; id: string; status: LogosNodeStatus }
  | { op: 'link'; from: string; to: string; relation?: LogosRelation }
  | { op: 'unlink'; from: string; to: string }
  /** a node the person chose to take — a Socria suggestion keeps origin 'socria'; a part added to a drawing, 'drawn' */
  | {
      op: 'add';
      node: {
        label: string;
        type: LogosNode['type'];
        role?: LogosNode['role'];
        origin?: LogosNode['origin'];
        detail?: string;
        at?: string;
        group?: string;
        /** Logos 6: a challenge finding the person kept (lib/challenge) */
        finding?: LogosNode['finding'];
        /** Logos 6: put here by hand, so the map pass keeps it (lib/logos6/protect.ts) */
        hand?: true;
        /** Logos 6: the passages it rests on (lib/logos6/evidence.ts) */
        evidence?: LogosNode['evidence'];
      };
      near?: string;
      /** what the line to `near` means (default 'relates'), and whether it runs from `near` to the new card */
      rel?: LogosRelation;
      fromNear?: boolean;
    }
  // ── A DRAWING, EDITED (Logos 5): what a part is, what it says when opened, where it sits, what a line says ──
  /** what kind of thing a card is — a step that is really an event, a concept that is a component */
  | { op: 'retype'; id: string; type: LogosNode['type'] }
  /** what a card says when it is opened (empty clears it) */
  | { op: 'detail'; id: string; detail: string }
  /** when, or in what order, it comes — "1789", "Stage 2" (empty clears it) */
  | { op: 'at'; id: string; at: string }
  /** the region it sits inside — "Nucleus", "Cytoplasm" (empty takes it out) */
  | { op: 'group'; id: string; group: string }
  /**
   * what a connection says, and what kind it is: "evaporates", "is eaten by" (an empty label clears it). The
   * line from `from` to `to` — of kind `was`, when two lines join the same cards — and only failing that the
   * line the other way, for a command that named its ends loosely.
   */
  | { op: 'edge'; from: string; to: string; label?: string; relation?: LogosRelation; was?: LogosRelation }
  /** what the drawing is of — "The water cycle" (empty clears it) */
  | { op: 'title'; title: string }
  /** a drawing put on the map — a reply's diagram opened there (lib/logos5/drawing.ts); the drawing before gives way */
  | { op: 'drawing'; drawing: Drawing };

/** The most labels a map remembers removing. Past this the oldest is forgotten. */
export const MAX_REMOVED = 40;
// What a saved card keeps (lib/logos.ts). It was 160 here and 100 there, so a
// rename of 104 characters was confirmed whole and then stored cut short.
const MAX_LABEL = MAP_LABEL_MAX;

/**
 * One label, as it is compared: case, quotes, punctuation and spacing do not
 * count — but a sign and a comparison do. "x = −3" and "x = 3", "Profit ≤ 0"
 * and "Profit ≥ 0" are different cards: keyed alike, taking one off the map
 * deleted the other at the next landing, and adding it back was refused as a
 * duplicate. A hyphen inside a word ("long-term") is still only a space.
 */
const SIGNS: [RegExp, string][] = [
  [/≤|<=/g, ' le '],
  [/≥|>=/g, ' ge '],
  [/≠|!=/g, ' ne '],
  [/≈/g, ' approx '],
  [/</g, ' lt '],
  [/>/g, ' gt '],
  [/=/g, ' eq '],
  [/[−–](?=\s*[\p{N}.(\p{L}])/gu, ' minus '],
  [/(^|[\s=(+×*/^])-(?=\s*[\p{N}.(\p{L}])/gu, '$1 minus '],
  [/(\p{N})\s*-\s*(?=\p{N})/gu, '$1 minus '],
  [/\+/g, ' plus '],
  [/[×*]/g, ' times '],
  [/÷|\//g, ' over '],
  [/\^/g, ' pow '],
  [/%/g, ' pct '],
];
export function keyOf(label: string): string {
  let t = label.toLowerCase().replace(/[“”"'‘’`]/g, '');
  for (const [re, word] of SIGNS) t = t.replace(re, word);
  return t
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
  const caps = mapCaps(map);
  /** what the edits set on the map itself (its title, and the shape a drawing put on it) */
  const out0: { title?: string; building?: ThinkingMap['building'] } = { title: map.title, building: map.building };
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
      // A card renamed to wording once taken off the map is not taken off again
      // at the next landing: they chose this wording, now (as an add does).
      removed = removed.filter((r) => r !== keyOf(label));
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
      if (!dup && edges.length >= caps.edges) { refused.push(`The map holds ${caps.edges} connections, and has them. Cut one first, and this one can go in.`); continue; }
      if (!dup) edges = [...edges, { from: a.id, to: b.id, relation, strength: 'normal' }];
      applied.push({ edit, said: dup ? `${quote(a.label)} and ${quote(b.label)} were already connected.` : `Connected ${quote(a.label)} to ${quote(b.label)}.` });
    } else if (edit.op === 'add') {
      const label = edit.node.label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
      if (!label) { refused.push(`A node cannot be called nothing.`); continue; }
      if (nodes.some((x) => keyOf(x.label) === keyOf(label))) { refused.push(`${quote(label)} is already on the map.`); continue; }
      // At the limit a card added would be dropped by the next save, silently.
      // Say so now, while it can still be acted on.
      if (nodes.length >= caps.nodes) { refused.push(`The map holds ${caps.nodes} cards, and has them. Take one off or merge two, and ${quote(label)} can go in.`); continue; }
      let id = 'n_' + keyOf(label).replace(/\s+/g, '_').slice(0, 24);
      while (byId(id)) id += '_';
      const extra: Partial<LogosNode> = {};
      for (const f of ['detail', 'at', 'group'] as const) {
        const v = String(edit.node[f] ?? '').replace(/\s+/g, ' ').trim().slice(0, DRAWING_LIMITS[f]);
        if (v && !(f === 'detail' && keyOf(v) === keyOf(label))) extra[f] = v;
      }
      // LOGOS 6: a kept finding is Socria's for good; a card added by hand is marked so the map pass keeps it
      const finding = edit.node.finding && edit.node.origin === 'socria' ? sanitizeNodeFinding(edit.node.finding) : undefined;
      const evidence = sanitizeNodeEvidence(edit.node.evidence);
      nodes = [...nodes, { id, type: edit.node.type, label, status: 'open', ...(edit.node.role ? { role: edit.node.role } : {}), ...(edit.node.origin ? { origin: edit.node.origin } : {}), ...extra, ...(finding ? { finding } : {}), ...(edit.node.hand ? { hand: true as const } : {}), ...(evidence ? { evidence } : {}) }];
      // A removal of the same wording is forgotten: they asked for it back.
      removed = removed.filter((r) => r !== keyOf(label));
      if (edit.near && byId(edit.near)) {
        const relation: LogosRelation = edit.rel && (RELATIONS as readonly string[]).includes(edit.rel) ? edit.rel : 'relates';
        edges = [...edges, edit.fromNear ? { from: edit.near, to: id, relation, strength: 'normal' } : { from: id, to: edit.near, relation, strength: 'normal' }];
      }
      applied.push({ edit, said: `Added ${quote(label)} to the map${edit.node.origin === 'socria' ? ', marked as Socria’s suggestion' : ''}.` });
    } else if (edit.op === 'unlink') {
      const a = byId(edit.from), b = byId(edit.to);
      if (!a || !b) { refused.push(`Both ends of a connection have to be on the map.`); continue; }
      const before = edges.length;
      edges = edges.filter((e) => !((e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id)));
      applied.push({ edit, said: edges.length < before ? `Disconnected ${quote(a.label)} from ${quote(b.label)}.` : `${quote(a.label)} and ${quote(b.label)} were not connected.` });
    } else if (edit.op === 'retype') {
      const n = byId(edit.id);
      if (!n) { refused.push(`Nothing on the map has the id ${edit.id}.`); continue; }
      if (!(NODE_TYPES as readonly string[]).includes(edit.type)) { refused.push(`A card cannot be a ${String(edit.type)}.`); continue; }
      nodes = nodes.map((x) => (x.id === n.id ? { ...x, type: edit.type } : x));
      applied.push({ edit, said: n.type === edit.type ? `${quote(n.label)} was already a ${edit.type}.` : `${quote(n.label)} is now a ${edit.type}.` });
    } else if (edit.op === 'detail' || edit.op === 'at' || edit.op === 'group') {
      const n = byId(edit.id);
      if (!n) { refused.push(`Nothing on the map has the id ${edit.id}.`); continue; }
      const field = edit.op;
      const raw = edit.op === 'detail' ? edit.detail : edit.op === 'at' ? edit.at : edit.group;
      const value = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, DRAWING_LIMITS[field]);
      // a card's detail that only repeats its label says nothing more (lib/logos.ts sanitizeMap drops it too)
      const empty = !value || (field === 'detail' && keyOf(value) === keyOf(n.label));
      nodes = nodes.map((x) => {
        if (x.id !== n.id) return x;
        const { [field]: _gone, ...rest } = x;
        return empty ? (rest as LogosNode) : { ...rest, [field]: value };
      });
      const what = field === 'detail' ? 'what it says when opened' : field === 'at' ? 'when it comes' : 'where it sits';
      applied.push({ edit, said: empty ? `Cleared ${what} on ${quote(n.label)}.` : field === 'group' ? `Put ${quote(n.label)} in ${quote(value)}.` : field === 'at' ? `${quote(n.label)} now comes at ${quote(value)}.` : `Set ${what} on ${quote(n.label)}.` });
    } else if (edit.op === 'edge') {
      const a = byId(edit.from), b = byId(edit.to);
      if (!a || !b) { refused.push(`Both ends of a connection have to be on the map.`); continue; }
      const kindOk = (e: (typeof edges)[number]) => !edit.was || e.relation === edit.was;
      let at = edges.findIndex((e) => e.from === a.id && e.to === b.id && kindOk(e));
      if (at < 0) at = edges.findIndex((e) => e.from === b.id && e.to === a.id && kindOk(e));
      if (at < 0) { refused.push(`${quote(a.label)} and ${quote(b.label)} are not connected.`); continue; }
      const relation = edit.relation === undefined ? undefined : (RELATIONS as readonly string[]).includes(edit.relation) ? edit.relation : null;
      if (edit.relation !== undefined && !relation) { refused.push(`A connection cannot be a ${String(edit.relation)}.`); continue; }
      const e0 = edges[at];
      let e1 = { ...e0, ...(relation ? { relation } : {}) };
      if (edit.label !== undefined) {
        const label = edit.label.replace(/\s+/g, ' ').trim().slice(0, DRAWING_LIMITS.edgeLabel);
        const { label: _old, ...rest } = e1;
        e1 = label ? { ...rest, label } : rest;
      }
      edges = edges.map((e, i) => (i === at ? e1 : e));
      const says = e1.label ? `now says ${quote(e1.label)}` : edit.label !== undefined ? 'says nothing now' : `is now ${e1.relation.replace(/_/g, ' ')}`;
      applied.push({ edit, said: `The line from ${quote(a.label)} to ${quote(b.label)} ${says}.` });
    } else if (edit.op === 'drawing') {
      const put = withDrawing({ ...map, nodes, edges, removed, title: out0.title, building: out0.building }, edit.drawing);
      if ('refused' in put) { refused.push(put.refused); continue; }
      nodes = put.map.nodes;
      edges = put.map.edges;
      removed = put.map.removed ?? [];
      out0.title = put.map.title;
      out0.building = put.map.building;
      const what = edit.drawing.title ? quote(edit.drawing.title) : 'the diagram';
      applied.push({ edit, said: `Drew ${what} on the Logic Map.` });
    } else if (edit.op === 'title') {
      const title = edit.title.replace(/\s+/g, ' ').trim().slice(0, DRAWING_LIMITS.title);
      out0.title = title || undefined;
      applied.push({ edit, said: title ? `Called the drawing ${quote(title)}.` : 'Took the title off the drawing.' });
    }
  }

  const out: ThinkingMap = { ...map, nodes, edges };
  if (removed.length) out.removed = removed;
  else delete out.removed;
  if (out0.title) out.title = out0.title;
  else delete out.title;
  if (out0.building) out.building = out0.building;
  else delete out.building;
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
  /**
   * The command, with `{}` where the missing words go — "add a branch called {}"
   * — when what was refused only lacked them: the next short turn fills it in
   * (components/LogosApp.tsx), so "add a branch" … "cost" is one edit.
   */
  fill?: string;
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

// ── adding, and "that" ────────────────────────────────────────────────
//
// "Add a branch called cost", "add another branch about time", "add a
// question: why is rent so high?" — the map's own `add` edit, said in words.
// A branch hangs from something: the idea named ("…to the budget"), else the
// one last touched in the conversation; "another" makes a sibling of the last
// one added. Typed or spoken, through the same reader.

/** The idea last touched by a command or a selection — what "that", "it" and "another" mean. */
export interface Touched {
  id: string;
  label: string;
  /** the idea it hangs from, when it was added as a branch */
  near?: string;
}

// "Add" takes any of the map's words; "make" and "create" only the ones that
// can mean nothing but the map — "make a question about photosynthesis" asks
// Socria to write a question, it does not put one on the map.
const ADD_WORDS = String.raw`(?:add|put)\s+(?:a\s+|an\s+|another\s+|one more\s+)?(?:new\s+)?(node|idea|branch|card|point|question|claim|bubble|sub ?idea|child)`;
const MAKE_WORDS = String.raw`(?:create|make)\s+(?:a\s+|an\s+|another\s+|one more\s+)?(?:new\s+)?(node|branch|card|bubble|sub ?idea|child)`;
const ADD_REST = String.raw`\b\s*(?:(?:called|named|about|saying|that says|for|on)\s+|:\s*|,\s*)?["“']?(.*?)["”']?(?:\s+(?:to|under|from|off|onto|beside|next to|connected to|linked to|branching (?:off|from))\s+(?:the\s+)?(?:node\s+|idea\s+|branch\s+)?["“']?(.+?)["”']?)?\s*[.!]?$`;
const ADD = new RegExp(String.raw`^(?:please\s+|can you\s+|could you\s+|now\s+|and\s+)*(?:${ADD_WORDS}|${MAKE_WORDS})${ADD_REST}`, 'i');

/** The idea everything else hangs from: the one with the most connections, or the first. */
function hubOf(map: ThinkingMap): LogosNode | null {
  if (!map.nodes.length) return null;
  const degree = new Map<string, number>();
  for (const e of map.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  return [...map.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];
}

/** An idea to add, in words: what it says, what kind, and what it hangs from. */
export function readMapAdd(text: string, map: ThinkingMap, recent?: Touched | null): Command | Refusal | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > 220) return null;
  const r = ADD.exec(t);
  if (!r) return null;
  // the word (from "add …" or from "make …"), what it says, and what it hangs from
  const m = [r[0], r[1] ?? r[2], r[3], r[4]] as const;
  const word = m[1].toLowerCase().replace(/\s+/g, '');
  const label = (m[2] ?? '').replace(/[.!]+$/, '').trim();
  const another = /\b(?:another|one more)\b/i.test(t);
  if (!label)
    return {
      refused: `What should the new ${word === 'question' ? 'question' : word === 'branch' ? 'branch' : 'idea'} say?`,
      fill: `add ${another ? 'another' : 'a'} ${word} called {}${m[3] ? ` to ${m[3]}` : ''}`,
    };
  let near: LogosNode | null = null;
  if (m[3]) {
    const f = findNode(map, m[3]);
    if (f && 'ambiguous' in f) return { refused: `${quote(m[3])} could mean more than one thing on the map: ${f.ambiguous.map((n) => quote(n.label)).join(', ')}. Which one?` };
    if (!f) return { refused: `Nothing on the map is called ${quote(m[3])}.` };
    near = f.node;
  } else if (word === 'branch' || word === 'subidea' || word === 'child' || another) {
    const anchor = another ? (recent?.near ?? recent?.id) : recent?.id;
    near = (anchor ? map.nodes.find((n) => n.id === anchor) : null) ?? hubOf(map);
  }
  const type: LogosNode['type'] = word === 'question' || /\?\s*$/.test(label) ? 'question' : word === 'claim' ? 'claim' : 'idea';
  const clean = label.replace(/\?\s*$/, type === 'question' ? '?' : '');
  return {
    // the person's own idea: no origin is theirs (a Socria suggestion carries 'socria')
    edits: [{ op: 'add', node: { label: clean, type, hand: true }, ...(near ? { near: near.id } : {}) }],
    said: `Added ${quote(clean)} to the map${near ? `, from ${quote(near.label)}` : ''}.`,
  };
}

/**
 * "Rename that to housing", "remove it", "mark that as resolved": the idea
 * last touched, named. The word for it is the whole of what the command is
 * about — "remove this idea about rent" names its idea, and is read as it is.
 */
const VERBS = 'rename|relabel|reword|call|remove|delete|drop|erase|mark|set|flag|resolve|reopen|close|connect|link|disconnect|unlink';
const THAT = String.raw`(?:that|it|this|that one|this one|the last one|that (?:node|idea|branch|card)|this (?:node|idea|branch|card))`;
const REFERS = new RegExp(
  String.raw`^((?:(?:please|can you|could you|now|and)\s+)*(?:${VERBS})\s+)${THAT}(?=\s*(?:$|[.!?]|to\b|as\b|into\b|from\b|and\b|with\b|resolved|done|answered|settled|closed|supported|open|reopened|revised))`,
  'i'
);

/** A map command whose "that" or "it" means the idea last touched — read with that idea named. */
export function readMapCommandAbout(text: string, map: ThinkingMap, recent?: Touched | null): Command | Refusal | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = REFERS.exec(t);
  // "that" with nothing touched is not guessed at: it is not a label to look for
  if (!m) return readMapCommand(t, map);
  if (!recent || !map.nodes.some((n) => n.id === recent.id)) return null;
  const named = t.replace(REFERS, `$1“${recent.label}”`);
  const read = readMapCommand(named, map);
  if (read) return read;
  // "rename that" — what to: asked, and the next words answer it
  if (/^(?:rename|relabel|reword|call)$/i.test(m[1].trim().split(/\s+/).pop() ?? '')) {
    return { refused: `What should “${recent.label}” be called?`, fill: `rename “${recent.label}” to {}` };
  }
  return null;
}

/**
 * A change to the map, made on the map as it is now: `from` and `to` are the
 * map before and after it, and what differs between them is done to `now` —
 * the ideas it added or took away, their wording and status, the connections.
 * Undo is the change from after to before; Redo is before to after. The map
 * may have moved on since (the map pass draws after every answer), so an idea
 * changed since is left as it is now, and an idea taken away stays taken away
 * from the extractor too, as a removal by hand always does (`removed`).
 */
/**
 * `personWins`: the change from→to is the person's own, made after `now` was
 * computed from `from` — an extraction that was in flight while they edited.
 * Their rename or status then stands even where `now` reworded the same card,
 * and a card they touched that `now` dropped comes back: what they said last
 * is what they meant. Without it (undo), a card changed since is left alone.
 */
export function replayMapChange(now: ThinkingMap, from: ThinkingMap, to: ThinkingMap, opts: { personWins?: boolean } = {}): { map: ThinkingMap; changed: number } {
  const inFrom = new Map(from.nodes.map((n) => [n.id, n]));
  const inTo = new Map(to.nodes.map((n) => [n.id, n]));
  let nodes = [...now.nodes];
  let edges = [...now.edges];
  let removed = [...(now.removed ?? [])];
  let changed = 0;
  for (const n of from.nodes) {
    if (inTo.has(n.id) || !nodes.some((x) => x.id === n.id)) continue;
    nodes = nodes.filter((x) => x.id !== n.id);
    edges = edges.filter((e) => e.from !== n.id && e.to !== n.id);
    const k = keyOf(n.label);
    if (k && !removed.includes(k)) removed = [...removed, k].slice(-MAX_REMOVED);
    changed++;
  }
  for (const n of to.nodes) {
    if (inFrom.has(n.id) || nodes.some((x) => x.id === n.id || keyOf(x.label) === keyOf(n.label))) continue;
    nodes = [...nodes, n];
    removed = removed.filter((r) => r !== keyOf(n.label));
    changed++;
  }
  for (const b of to.nodes) {
    const a = inFrom.get(b.id);
    if (!a || (a.label === b.label && a.status === b.status && a.type === b.type)) continue;
    const i = nodes.findIndex((x) => x.id === b.id);
    if (i < 0 && opts.personWins && !nodes.some((x) => keyOf(x.label) === keyOf(b.label))) {
      nodes = [...nodes, b];
      removed = removed.filter((r) => r !== keyOf(b.label));
      changed++;
      continue;
    }
    if (i < 0 || (!opts.personWins && (nodes[i].label !== a.label || nodes[i].status !== a.status))) continue;
    const { tex: _tex, ...rest } = nodes[i];
    nodes[i] = { ...rest, label: b.label, status: b.status, type: b.type, ...(b.tex ? { tex: b.tex } : {}) };
    changed++;
  }
  const ek = (e: { from: string; to: string }) => [e.from, e.to].sort().join('|');
  const fromE = new Set(from.edges.map(ek));
  const toE = new Set(to.edges.map(ek));
  for (const e of from.edges) {
    if (toE.has(ek(e))) continue;
    const n = edges.length;
    edges = edges.filter((x) => ek(x) !== ek(e));
    if (edges.length < n) changed++;
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of to.edges) {
    if (fromE.has(ek(e)) || !ids.has(e.from) || !ids.has(e.to) || edges.some((x) => ek(x) === ek(e))) continue;
    edges = [...edges, e];
    changed++;
  }
  const map: ThinkingMap = { ...now, nodes, edges };
  if (removed.length) map.removed = removed;
  else delete map.removed;
  return { map, changed };
}

/**
 * "Select the rent idea", "focus on cost": the card in hand, as a press on it
 * would put it — so what is asked next ("challenge this", "why does this one
 * matter?") is about it (Point & Ask), and "that" means it.
 */
const SELECT =
  /^(?:(?:please|can you|could you|now|and)\s+)*(?:select|focus on|point at|point to|pick|highlight)\s+(?:the\s+)?(?:(?:node|idea|card|branch|question|claim)\s+)?(?:(?:called|named|about|on)\s+)?["“']?(.+?)["”']?(?:\s+(node|idea|card|branch))?\s*[.!]?$/i;

export function readMapSelect(text: string, map: ThinkingMap): { node: LogosNode } | Refusal | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > 160 || !map.nodes.length) return null;
  const m = SELECT.exec(t);
  if (!m) return null;
  const f = findNode(map, m[1]);
  if (f && 'node' in f) return { node: f.node };
  if (f && 'ambiguous' in f) return { refused: `${quote(m[1])} could mean more than one thing on the map: ${f.ambiguous.map((n) => quote(n.label)).join(', ')}. Which one?` };
  return EXPLICIT.test(t) || m[2] ? { refused: `Nothing on the map is called ${quote(m[1])}.` } : null;
}

/**
 * Two copies of one map, the second written from an older view of it —
 * another tab, another device, or a save of this one that landed late.
 * Nothing either holds is lost: every card and connection in the stored copy
 * stays as it is, and the older copy's cards and connections that the stored
 * one lacks are added — except a card the person took off, which stays off.
 * The rest of the map (its picture, models, objects, history) is the stored
 * copy's: it is the newer of the two. (app/api/conversations PUT)
 */
export function mergeStaleMap(stored: ThinkingMap, older: ThinkingMap): ThinkingMap {
  const gone = new Set(stored.removed ?? []);
  const ids = new Set(stored.nodes.map((n) => n.id));
  const keys = new Set(stored.nodes.map((n) => keyOf(n.label)));
  const add = older.nodes.filter((n) => !ids.has(n.id) && !keys.has(keyOf(n.label)) && !gone.has(keyOf(n.label)));
  const nodes = [...stored.nodes, ...add];
  const live = new Set(nodes.map((n) => n.id));
  const ek = (e: { from: string; to: string }) => [e.from, e.to].sort().join('|');
  const have = new Set(stored.edges.map(ek));
  const edges = [...stored.edges, ...older.edges.filter((e) => !have.has(ek(e)) && live.has(e.from) && live.has(e.to))];
  return { ...stored, nodes, edges };
}

