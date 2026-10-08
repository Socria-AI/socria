// lib/logos-structure.ts
//
// THE STRUCTURE, IN DETAIL — the Structure lens of Logos 3 as a document
// rather than a canvas of small cards. It takes the whole panel and says
// everything the map knows about each part: what it is, where it sits, what
// it rests on and what it pulls against, its note, whether it is settled.
//
// Two readings of one map:
//
//   an argument, a decision, a plan   the hierarchy as an outline — the goal
//                                     at the top, what serves it beneath,
//                                     what supports each part beneath that
//                                     (the same parent → child rules the
//                                     card layout uses: HIERARCHY)
//   mathematics                       the parts of a problem, in the order a
//                                     person works it: what is given, what
//                                     is asked, what is used, the working in
//                                     sequence, the checks, the result
//
// Everything the hierarchy does not place is still shown — under "Not
// connected yet" when the map has a goal it does not reach, so a gap in the
// reasoning is visible rather than hidden.
//
// PURE.

import type { LogosEdge, LogosNode, LogosNodeType, LogosRelation, ThinkingMap } from './logos';
import { HIERARCHY } from './logos-layout';

export interface StructLink {
  relation: LogosRelation;
  /** read from this part's side: "supported by", "conflicts with", "leads to" */
  phrase: string;
  other: { id: string; label: string; type: LogosNodeType };
  /** a math step: the operation that turned one into the other */
  op?: string;
}

export interface StructItem {
  node: LogosNode;
  /** how it hangs from its parent, read from its own side ("supports", "depends on") */
  via: string | null;
  children: StructItem[];
  /** every other relation it has, not drawn as nesting */
  links: StructLink[];
}

export interface StructSection {
  key: string;
  title: string;
  /** a line under the title — what this group is, in the person's terms */
  blurb?: string;
  items: StructItem[];
}

export interface StructureOutline {
  kind: 'hierarchy' | 'working';
  sections: StructSection[];
  /** "2 goals · 4 claims · 1 open question" */
  summary: string;
  /** questions and tensions still open — the work left */
  open: number;
  total: number;
}

// ── reading a relation from either end ──────────────────────────────

const OUT: Record<LogosRelation, string> = {
  supports: 'supports',
  conflicts: 'conflicts with',
  depends: 'depends on',
  relates: 'relates to',
  leads_to: 'leads to',
  revises: 'revises',
  precedes: 'comes before',
  part_of: 'is part of',
  transforms_to: 'becomes',
  implies: 'implies',
  justifies: 'justifies',
  equivalent_to: 'equivalent to',
  applies_to: 'applies to',
};
const IN: Record<LogosRelation, string> = {
  supports: 'supported by',
  conflicts: 'conflicts with',
  depends: 'needed by',
  relates: 'relates to',
  leads_to: 'follows from',
  revises: 'revised by',
  precedes: 'comes after',
  part_of: 'contains',
  transforms_to: 'comes from',
  implies: 'implied by',
  justifies: 'justified by',
  equivalent_to: 'equivalent to',
  applies_to: 'applied by',
};

/** A relation as the node at one end would say it. */
export function phraseOf(relation: LogosRelation, fromThisSide: boolean): string {
  return (fromThisSide ? OUT : IN)[relation] ?? 'relates to';
}

// ── names ───────────────────────────────────────────────────────────

const PLURAL: Partial<Record<LogosNodeType, string>> = {
  evidence: 'evidence',
  consequence: 'consequences',
  misconception: 'misconceptions',
  given: 'givens',
  unknown: 'unknowns',
  inference: 'inferences',
  verification: 'checks',
  axiom: 'axioms',
  counterexample: 'counterexamples',
  theorem: 'theorems',
  source: 'sources',
};
export function countOf(type: LogosNodeType, n: number): string {
  const word = n === 1 ? (type === 'verification' ? 'check' : type) : (PLURAL[type] ?? `${type}s`);
  return `${n} ${word}`;
}

/** The kinds of part that are work still to do while they are open. */
const OPENING = new Set<LogosNodeType>(['question', 'tension', 'unknown', 'conjecture', 'error']);
const isOpenWork = (n: LogosNode) => OPENING.has(n.type) && n.status !== 'resolved' && n.status !== 'supported';

// The order kinds are listed in, wherever a list of kinds is made: what the
// work is for first, what it rests on last.
const KIND_ORDER: LogosNodeType[] = [
  'goal', 'theme', 'decision', 'value', 'concept', 'character', 'milestone', 'constraint',
  'belief', 'claim', 'idea', 'assumption', 'question', 'tension', 'counterpoint', 'misconception',
  'consequence', 'evidence', 'source',
  'given', 'unknown', 'definition', 'axiom', 'theorem', 'lemma', 'equation', 'transformation',
  'step', 'inference', 'conjecture', 'verification', 'error', 'counterexample', 'result',
];
const kindRank = (t: LogosNodeType) => {
  const i = KIND_ORDER.indexOf(t);
  return i < 0 ? KIND_ORDER.length : i;
};

// ── the outline ─────────────────────────────────────────────────────

export function structureOutline(map: ThinkingMap): StructureOutline {
  const nodes = map.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (map.edges ?? []).filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);
  const order = new Map(nodes.map((n, i) => [n.id, i]));

  const counts = new Map<LogosNodeType, number>();
  for (const n of nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  const open = nodes.filter(isOpenWork).length;
  const summary = [
    ...[...counts.entries()].sort((a, b) => kindRank(a[0]) - kindRank(b[0])).slice(0, 5).map(([t, n]) => countOf(t, n)),
    ...(open ? [`${open} still open`] : []),
  ].join(' · ');

  const working = map.context === 'math' || nodes.some((n) => n.type === 'given' || n.type === 'unknown' || n.type === 'result');
  const sections = working ? workingSections(nodes, edges, order) : hierarchySections(nodes, edges, order);
  return { kind: working ? 'working' : 'hierarchy', sections: sections.filter((s) => s.items.length), summary, open, total: nodes.length };
}

/** Every relation of a node, read from its side, leaving out the ones drawn as nesting. */
function linksOf(id: string, edges: readonly LogosEdge[], byId: Map<string, LogosNode>, nested: Set<string>): StructLink[] {
  const out: StructLink[] = [];
  for (const e of edges) {
    if (e.from !== id && e.to !== id) continue;
    if (nested.has(`${e.from}~${e.to}`)) continue;
    const mine = e.from === id;
    const o = byId.get(mine ? e.to : e.from)!;
    out.push({ relation: e.relation, phrase: phraseOf(e.relation, mine), other: { id: o.id, label: o.label, type: o.type }, ...(e.op ? { op: e.op } : {}) });
  }
  // what it pulls against first — the part a reader most needs to see
  return out.sort((a, b) => Number(b.relation === 'conflicts') - Number(a.relation === 'conflicts'));
}

function hierarchySections(nodes: LogosNode[], edges: LogosEdge[], order: Map<string, number>): StructSection[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // parent → children, by the same rules the card layout uses
  const kids = new Map<string, { id: string; via: string }[]>();
  const parentOf = new Map<string, string>();
  const nested = new Set<string>();
  for (const e of edges) {
    const dir = HIERARCHY[e.relation];
    if (!dir) continue;
    const parent = dir === 'to-above' ? e.to : e.from;
    const child = dir === 'to-above' ? e.from : e.to;
    if (parentOf.has(child)) continue; // one place in the outline; the rest are links
    if (wouldCycle(parent, child, parentOf)) continue;
    parentOf.set(child, parent);
    nested.add(`${e.from}~${e.to}`);
    // how the child hangs from its parent, said from the child's side
    const via = phraseOf(e.relation, e.from === child);
    (kids.get(parent) ?? kids.set(parent, []).get(parent)!).push({ id: child, via });
  }
  const sortIds = (a: string, b: string) => kindRank(byId.get(a)!.type) - kindRank(byId.get(b)!.type) || order.get(a)! - order.get(b)!;
  const build = (id: string, via: string | null): StructItem => ({
    node: byId.get(id)!,
    via,
    children: (kids.get(id) ?? []).sort((a, b) => sortIds(a.id, b.id)).map((k) => build(k.id, k.via)),
    links: linksOf(id, edges, byId, nested),
  });

  const roots = nodes.filter((n) => !parentOf.has(n.id)).map((n) => n.id).sort(sortIds);
  const anchored = (id: string) => ['goal', 'theme', 'decision'].includes(byId.get(id)!.type);
  const anchors = roots.filter(anchored);
  if (!anchors.length) {
    return [{ key: 'all', title: 'The structure', items: roots.map((id) => build(id, null)) }];
  }
  const rest = roots.filter((id) => !anchored(id));
  return [
    { key: 'main', title: 'What this is for', items: anchors.map((id) => build(id, null)) },
    {
      key: 'loose',
      title: 'Not connected yet',
      blurb: 'On the map, but not yet tied to what this is for.',
      items: rest.map((id) => build(id, null)),
    },
  ];
}

function wouldCycle(parent: string, child: string, parentOf: Map<string, string>): boolean {
  for (let at: string | undefined = parent, i = 0; at && i < 10_000; at = parentOf.get(at), i++) if (at === child) return true;
  return false;
}

const WORK_GROUPS: { key: string; title: string; blurb?: string; types: LogosNodeType[] }[] = [
  { key: 'given', title: 'What you are given', types: ['given', 'definition', 'axiom', 'assumption'] },
  { key: 'asked', title: 'What you are solving for', types: ['unknown', 'goal', 'question'] },
  { key: 'used', title: 'What it uses', types: ['theorem', 'lemma', 'concept'] },
  { key: 'working', title: 'The working', blurb: 'In the order it was done.', types: ['equation', 'transformation', 'step', 'inference', 'conjecture', 'claim', 'idea'] },
  { key: 'checks', title: 'Checks', types: ['verification', 'error', 'counterexample', 'misconception'] },
  { key: 'result', title: 'Where it lands', types: ['result'] },
];
const SEQUENCE = new Set<LogosRelation>(['transforms_to', 'leads_to', 'implies', 'precedes', 'justifies']);

function workingSections(nodes: LogosNode[], edges: LogosEdge[], order: Map<string, number>): StructSection[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const none = new Set<string>();
  // the working in the order it was done: a topological order over the
  // step-to-step relations, ties and anything unordered by when it arrived
  const seq = edges.filter((e) => SEQUENCE.has(e.relation));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of seq) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const ready = nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  const rank = new Map<string, number>();
  while (ready.length) {
    ready.sort((a, b) => order.get(a)! - order.get(b)!);
    const id = ready.shift()!;
    rank.set(id, rank.size);
    for (const e of seq) {
      if (e.from !== id) continue;
      const d = (indeg.get(e.to) ?? 1) - 1;
      indeg.set(e.to, d);
      if (d === 0) ready.push(e.to);
    }
  }
  for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, rank.size + order.get(n.id)!); // a cycle keeps arrival order

  const placed = new Set<string>();
  const sections: StructSection[] = WORK_GROUPS.map((g) => {
    const ids = nodes.filter((n) => g.types.includes(n.type)).map((n) => n.id).sort((a, b) => rank.get(a)! - rank.get(b)!);
    ids.forEach((id) => placed.add(id));
    return { key: g.key, title: g.title, blurb: g.blurb, items: ids.map((id) => ({ node: byId.get(id)!, via: null, children: [], links: linksOf(id, edges, byId, none) })) };
  });
  const other = nodes.filter((n) => !placed.has(n.id)).map((n) => n.id).sort((a, b) => kindRank(byId.get(a)!.type) - kindRank(byId.get(b)!.type) || order.get(a)! - order.get(b)!);
  sections.push({ key: 'other', title: 'Also on the map', items: other.map((id) => ({ node: byId.get(id)!, via: null, children: [], links: linksOf(id, edges, byId, none) })) });
  return sections;
}

/** Every item in an outline, depth first — for counting and for tests. */
export function flatten(outline: StructureOutline): StructItem[] {
  const out: StructItem[] = [];
  const walk = (it: StructItem) => {
    out.push(it);
    it.children.forEach(walk);
  };
  outline.sections.forEach((s) => s.items.forEach(walk));
  return out;
}
