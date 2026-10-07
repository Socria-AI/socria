// lib/logos-layout.ts
//
// Lenses over one extraction. Every lens takes the same map and returns the
// same shape — placed cards plus connectors — so a single renderer can draw
// all of them. What differs is the arrangement grammar:
//
//   graph      force-directed, everything at once
//   structure  layered top-down hierarchy with right-angle connectors
//   tensions   opposing pairs facing each other
//   evidence   claims with their support underneath
//
// Pure functions except the force lens, which carries positions between
// frames so the graph settles rather than jumping.

import type {
  LogosEdge,
  LogosEdgeStrength,
  LogosNode,
  LogosRelation,
  ThinkingMap,
} from './logos';
import { compileFunction, type CompiledFn } from './logos-math';
import {
  attachmentsOf,
  backEdges,
  GRAMMARS,
  lensFor,
  orderSpine,
  spineOf,
  transitionsOf,
  type Building,
} from './representation';

export type LensId = 'graph' | 'structure' | 'tensions' | 'evidence' | 'solve' | 'plot' | 'board' | 'matrix' | 'flow' | 'timeline';

export interface Placed {
  id: string;
  node: LogosNode;
  x: number;
  y: number;
  w: number;
  h: number;
  /** the details that hang from this part of the shape — shown on it, not beside it */
  attached?: LogosNode[];
  /** a part of the shape where the path divides */
  branch?: boolean;
  /** on the map, but not yet placed in the shape */
  loose?: boolean;
}

export interface Connector {
  key: string;
  path: string;
  relation: LogosRelation;
  /** a connection that stopped carrying weight is drawn lighter, not removed */
  strength?: LogosEdgeStrength;
  label?: string;
  /** midpoint, for drawing the label */
  lx?: number;
  ly?: number;
  arrow?: boolean;
  double?: boolean;
  /**
   * The cards it joins. A card the person drags out of the lens's own
   * arrangement takes its connections with it — they are re-routed from
   * these, since the lens's path assumed the card was where the lens put it.
   * A connector with only `to` belongs to that card alone (a timeline tick).
   */
  from?: string;
  to?: string;
}

export interface Layout {
  placed: Placed[];
  connectors: Connector[];
  /** the italic line under the map, naming the question this lens answers */
  caption: string;
  /** shown when the lens has nothing to draw yet */
  empty?: string;
}

export const LENSES: { id: LensId; label: string; caption: string }[] = [
  { id: 'flow', label: 'Flow', caption: 'What happens, in what order, and where it branches.' },
  { id: 'timeline', label: 'Timeline', caption: 'What happened, and in what order.' },
  { id: 'graph', label: 'Graph', caption: 'See how everything connects.' },
  { id: 'structure', label: 'Structure', caption: 'What am I trying to accomplish?' },
  { id: 'tensions', label: 'Tensions', caption: 'What’s pulling me in different directions?' },
  { id: 'evidence', label: 'Evidence', caption: 'Why do I believe this?' },
  { id: 'solve', label: 'Solution', caption: 'Follow the work, step by step.' },
  { id: 'plot', label: 'Plot', caption: 'See the function.' },
  { id: 'board', label: 'Board', caption: 'Work it out by hand.' },
  { id: 'matrix', label: 'Compare', caption: 'How does each one do, on what matters?' },
];

export const RELATION_LABEL: Record<LogosRelation, string> = {
  supports: 'supported by',
  conflicts: 'conflicts with',
  depends: 'depends on',
  relates: 'relates to',
  leads_to: 'leads to',
  revises: 'revises',
  precedes: 'comes before',
  part_of: 'sits inside',
  transforms_to: 'becomes',
  implies: 'implies',
  justifies: 'justifies',
  equivalent_to: 'equivalent to',
  applies_to: 'applies to',
};

const CARD_W = 150;
/** a one-line card as drawn: padding, the type line, one line of label */
const CARD_H = 56;
const LINE_H = 19;
const GRAPH_W = 168;

function cardH(label: string, w = CARD_W) {
  // ~7.1px per character at 13.5px Inter, wrapping inside the card's
  // padding. It used to say every card was one or two short lines, and the
  // layouts that trusted it stacked three-line cards on top of each other.
  const perLine = Math.max(8, Math.floor((w - 26) / 7.1));
  const lines = Math.min(5, Math.max(1, Math.ceil((label.length * 1.08) / perLine)));
  return CARD_H + (lines - 1) * LINE_H;
}

/**
 * The lens a map should OPEN on, and — for a free reader, who gets one — the
 * lens that is theirs.
 *
 * Both questions have the same answer, which is why they are one function:
 * whichever view is the point of this particular map. Landing someone on a
 * lens they cannot open, or unlocking one they were never shown, are the two
 * ways of getting that wrong.
 *
 * A SCENE WINS when there is no solution chain. The extractor only emits one
 * when watching the idea move would teach it better than describing it, so a
 * map carrying a scene is a map whose whole answer is a picture — and until
 * this existed, an economics conversation built a supply-and-demand diagram
 * and then opened on a concept map of the words around it, with the diagram
 * one unlabelled tab away and, on the free tier, locked.
 *
 * A solution chain still leads where there is one. Worked algebra is read
 * step by step, and the animation beside it is a second look at the same
 * work rather than a replacement for it.
 */
export function leadLens(lenses: LensId[], hasViz: boolean, building?: Building | null): LensId | null {
  if (!lenses.length) return null;
  // A model they are building leads with the model; worked algebra leads with
  // its chain.
  if (building?.kind === 'model' && lenses.includes('plot')) return 'plot';
  if (lenses.includes('solve')) return 'solve';
  // WHAT THEY ARE BUILDING decides the shape, before any of the fallbacks
  // below: a process opens as a flow, a timeline on its axis, a decision as
  // its table. The structure has to be there for the lens to be offered at
  // all (availableLenses), so this never opens an empty frame.
  const shaped = lensFor(building, lenses) as LensId | null;
  if (shaped) return shaped;
  if (hasViz && lenses.includes('plot')) return 'plot';
  // A map that is making a comparison opens on the comparison. Same reasoning
  // as the two above: when the work has a shape of its own, the lens that
  // draws that shape is the one they came for, and a graph of the same thing
  // is the general view they can always step back to.
  if (lenses.includes('matrix')) return 'matrix';
  return lenses[0];
}

/**
 * Is this piece of work quantitative?
 *
 * The extractor's own label when it can tell, plus the presence of a scene —
 * economics conversations come back as "learning" or "analysing" and are
 * quantitative all the same.
 */
function isQuantitative(map: ThinkingMap): boolean {
  // A built model counts: a map carrying a document and no scene led with the
  // concept graph, so the build note said "built" while the surface was a tab
  // away.
  return map.context === 'math' || !!map.viz || !!map.models?.docs?.length;
}

// ── which lenses have anything to show ──────────────────────────────
//
// A tab appears when it has something to say about THIS work, not whenever it
// could technically render. Every lens on screen is a claim that there is a
// worthwhile reading of the reasoning behind it, and five tabs over a
// quadratic — two of them concept maps of the words around the algebra — is
// four claims that are not true.
export function availableLenses(map: ThinkingMap): LensId[] {
  const out: LensId[] = [];
  const quant = isQuantitative(map);

  const shapes: LensId[] = [];
  // THE SHAPES WITH AN ORDER. A flow is offered whenever the map holds a
  // sequence — two parts of a spine joined by a transition — whatever the
  // work is called, because the structure is the evidence, not the label.
  // A timeline when it is events in order, or when the reading says so.
  {
    const kind = map.building?.kind;
    const spine = spineOf(map, kind && GRAMMARS[kind].ordered ? kind : undefined);
    const ordered = spine.size >= 2 && transitionsOf(map, spine).length >= 1;
    const events = map.nodes.some((n) => n.role === 'event' || n.role === 'period');
    if (ordered && kind !== 'timeline') shapes.push('flow');
    if (ordered && (kind === 'timeline' || events)) shapes.push('timeline');
  }

  // The concept views. They read the SHAPE of an argument — what supports
  // what, what sits under what — which is the right question for a decision
  // or an essay and the wrong one for a calculation, where the shape is the
  // chain of steps and the lenses below draw it properly.
  if (!quant) {
    if (map.nodes.length) out.push('graph');
    if (map.nodes.length > 1) out.push('structure');
  }
  // Which tab sorts first is not which lens leads — leadLens decides that
  // from what is being built — but a map with no reading yet keeps its graph
  // first, and one whose reading is an ordered shape shows that shape first.
  if (map.building && GRAMMARS[map.building.kind].ordered) out.unshift(...shapes);
  else out.push(...shapes);

  // A comparison is a table, not a graph, and it is offered whenever the map
  // is already making one — options judged against criteria. Placed ahead of
  // Tensions because when someone IS comparing, the table is the thing they
  // came for.
  if (buildMatrix(map)) out.push('matrix');

  // Contradiction is worth surfacing in any kind of work. Two results that
  // disagree is exactly as important in algebra as in an argument.
  if (
    map.edges.some((e) => e.relation === 'conflicts') ||
    map.nodes.some((n) => n.type === 'tension' || n.type === 'counterpoint')
  ) {
    out.push('tensions');
  }
  // Support means the same thing whether it's evidence under a decision or
  // evidence under a claim in an essay.
  if (map.nodes.some((n) => n.type === 'evidence' || n.type === 'source')) out.push('evidence');

  // A scene earns the Plot lens on its own, whatever the work is called: a
  // supply-and-demand diagram belongs to a conversation about markets, and
  // withholding the lens that draws it because of the name on the
  // conversation made the economics scenes unreachable in exactly the
  // conversations they exist for.
  // A SCENE OR A MODEL. A model document earns the lens as surely as a scene
  // does — more surely, since it is the thing the person can edit — and gating
  // on `viz` alone would have left a built model with nowhere to be drawn.
  if (map.viz || map.models?.docs.length) out.push('plot');

  // The step-by-step readings. A solution chain and a worked Board are about
  // work being DONE — each state of the expression, the move that produced
  // it, and which steps have been checked. That is the map someone doing
  // mathematics actually wants, and it is where a verified tick or a flagged
  // error is legible.
  if (map.context === 'math') {
    const chainNodes = map.nodes.filter((n) => CHAIN_TYPES.has(n.type));
    const chainEdges = map.edges.filter((e) => CHAIN_REL.has(e.relation));
    if (chainNodes.length >= 2 || chainEdges.length >= 1) out.unshift('solve');
    // Without a scene, a plottable node still earns the lens.
    if (!map.viz && !map.models?.docs.length && plottableNodes(map).length) out.push('plot');
    if (map.nodes.length) out.push('board');
  }

  // Never nothing. Quantitative work that has produced no chain, no scene and
  // no board — a question just asked, an economics conversation still in
  // prose — falls back to the concept view rather than an empty panel.
  if (!out.length && map.nodes.length) {
    out.push('graph');
    if (map.nodes.length > 1) out.push('structure');
  }
  return out;
}

const CHAIN_TYPES = new Set<LogosNode['type']>([
  'axiom',
  'lemma',
  'conjecture',
  'counterexample',
  'given',
  'unknown',
  'equation',
  'definition',
  'transformation',
  'theorem',
  'step',
  'inference',
  'verification',
  'result',
  'error',
]);
const CHAIN_REL = new Set<LogosRelation>(['transforms_to', 'implies', 'precedes', 'equivalent_to']);

/** Nodes whose label/tex is a plottable single-variable function. */
export function plottableNodes(map: ThinkingMap): { id: string; node: LogosNode; fn: CompiledFn }[] {
  const out: { id: string; node: LogosNode; fn: CompiledFn }[] = [];
  const seen = new Set<string>();
  for (const n of map.nodes) {
    if (n.type === 'error' || n.flag === 'error') continue; // don't plot a wrong line
    if (n.type === 'given' || n.type === 'unknown') continue; // a label, not a curve
    const src = n.tex || n.label;
    // a real function has an operation or a call — a bare "x" or "42" is not
    // worth a graph.
    if (!/[+\-*/^]|\b(sin|cos|tan|ln|log|sqrt|exp|abs)\b/i.test(src)) continue;
    const fn = compileFunction(src);
    if (!fn) continue;
    // dedupe identical expressions so the same equation restated doesn't
    // draw twice.
    const key = src.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: n.id, node: n, fn });
    if (out.length >= 4) break;
  }
  return out;
}

// ── structure: layered top-down tree ────────────────────────────────
// Roots are goals/decisions (or anything nothing points down into). Depth
// comes from a BFS over "downward" relations, so the hierarchy reads as
// goal → the thinking beneath it.
// Which end of an edge sits higher in the hierarchy. "A supports B" and
// "B depends on A" both put B above A — but "A leads to B" is the other way
// round, since a consequence hangs beneath the choice that produced it.
// 'revises' is a timeline relation, not a hierarchy, so it's excluded.
const HIERARCHY: Partial<Record<LogosRelation, 'to-above' | 'from-above'>> = {
  supports: 'to-above',
  depends: 'to-above',
  relates: 'to-above',
  leads_to: 'from-above',
  // a section hangs beneath the piece it belongs to
  part_of: 'to-above',
  // Proofs: the CONCLUSION rises. "A implies B" puts B above A, and "A
  // justifies B" puts the justified step above its justification — so a
  // theorem sits on top of what it rests on, and "what does this depend on?"
  // is answered by reading downward.
  //
  // These were 'from-above', which is the same direction as leads_to and put
  // the axioms on top and the theorem at the bottom — the proof tree upside
  // down. 'to-above' is the direction `supports` already uses, and for the
  // same reason: evidence sits under the claim it holds up.
  implies: 'to-above',
  justifies: 'to-above',
};

export function layoutStructure(map: ThinkingMap, w: number, h: number): Layout {
  const { nodes, edges } = map;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // child → parent, using downward edges pointed at the more abstract node.
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    const dir = HIERARCHY[e.relation];
    if (!dir) continue;
    const parent = dir === 'to-above' ? e.to : e.from;
    const child = dir === 'to-above' ? e.from : e.to;
    if (!byId.has(parent) || !byId.has(child)) continue;
    if (!children.has(parent)) children.set(parent, []);
    if (children.get(parent)!.includes(child)) continue;
    children.get(parent)!.push(child);
    hasParent.add(child);
  }

  // Depth band a node falls into when nothing connects it — keeps orphans
  // from crowding the top row next to the goal.
  const BAND: Record<string, number> = {
    goal: 0,
    theme: 1,
    decision: 1,
    value: 1,
    concept: 1,
    character: 1,
    belief: 2,
    idea: 2,
    claim: 2,
    constraint: 2,
    milestone: 2,
    question: 3,
    tension: 3,
    assumption: 3,
    misconception: 3,
    counterpoint: 3,
    evidence: 4,
    source: 4,
    consequence: 4,
  };

  // Prefer real anchors as roots: whatever the piece is actually about, then
  // choices, then whatever has no parent. Everything else hangs beneath.
  const anchors = nodes.filter(
    (n) => (n.type === 'goal' || n.type === 'theme') && !hasParent.has(n.id)
  );
  const fallback = nodes.filter(
    (n) => (n.type === 'decision' || n.type === 'concept') && !hasParent.has(n.id)
  );
  const roots = (anchors.length ? anchors : fallback.length ? fallback : nodes.filter((n) => !hasParent.has(n.id)));
  if (!roots.length) return emptyLayout('structure', 'Not enough structure yet.');

  // BFS depth assignment (guards against cycles).
  const depth = new Map<string, number>();
  const order: string[][] = [];
  const queue: [string, number][] = roots.map((r) => [r.id, 0]);
  while (queue.length) {
    const [id, d] = queue.shift()!;
    if (depth.has(id)) continue;
    depth.set(id, d);
    (order[d] ||= []).push(id);
    for (const c of children.get(id) || []) {
      if (!depth.has(c)) queue.push([c, d + 1]);
    }
  }
  // Unreached nodes land in the band their type implies, so an unattached
  // tension sits with the other tensions rather than beside the goal.
  for (const n of nodes) {
    if (depth.has(n.id)) continue;
    const d = Math.max(1, BAND[n.type] ?? 3);
    depth.set(n.id, d);
    (order[d] ||= []).push(n.id);
  }

  // A CARD NEVER SITS ON A CARD. Spacing used to shrink with the panel's
  // width until seventy cards in one level overlapped into a single smear.
  // Now a level that will not fit is wrapped onto further lines of its own,
  // and a line may run wider than the panel — the canvas pans and fits.
  const STEP = CARD_W + 16;
  const perLine = Math.max(6, Math.floor((1.6 * (w - 80)) / STEP));
  const rows: string[][] = [];
  for (const level of order.filter(Boolean)) {
    for (let i = 0; i < level.length; i += perLine) rows.push(level.slice(i, i + perLine));
  }
  const topPad = 56;
  const tallest = Math.max(CARD_H, ...nodes.map((n) => cardH(n.label)));
  const rowGap = Math.max(
    Math.max(74, tallest + 22),
    Math.min(112, (h - topPad - 56) / Math.max(rows.length - 1, 1))
  );
  const placed: Placed[] = [];
  const pos = new Map<string, Placed>();

  rows.forEach((row, di) => {
    const y = topPad + di * rowGap;
    const spacing = Math.max(STEP, Math.min(190, (w - 80) / Math.max(row.length, 1)));
    const totalW = spacing * (row.length - 1);
    row.forEach((id, i) => {
      const node = byId.get(id)!;
      const p: Placed = {
        id,
        node,
        x: w / 2 - totalW / 2 + i * spacing,
        y,
        w: CARD_W,
        h: cardH(node.label),
      };
      placed.push(p);
      pos.set(id, p);
    });
  });

  const connectors: Connector[] = [];
  for (const [parent, kids] of children) {
    const p = pos.get(parent);
    if (!p) continue;
    for (const c of kids) {
      const k = pos.get(c);
      if (!k || k.y <= p.y) continue;
      const midY = (p.y + p.h / 2 + (k.y - k.h / 2)) / 2;
      const edge = edges.find(
        (e) => (e.from === c && e.to === parent) || (e.from === parent && e.to === c)
      );
      connectors.push({
        key: `${parent}~${c}`,
        from: parent,
        to: c,
        // right-angle routing, the reference's tree grammar
        path: `M ${p.x} ${p.y + p.h / 2} V ${midY} H ${k.x} V ${k.y - k.h / 2}`,
        relation: edge?.relation || 'relates',
        strength: edge?.strength,
      });
    }
  }

  return { placed, connectors, caption: capOf('structure') };
}

// ── tensions: opposing pairs ────────────────────────────────────────
export function layoutTensions(map: ThinkingMap, w: number, h: number): Layout {
  const conflicts = map.edges.filter((e) => e.relation === 'conflicts');
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const tensionNodes = map.nodes.filter(
    (n) => n.type === 'tension' || n.type === 'counterpoint'
  );

  if (!conflicts.length && !tensionNodes.length) {
    return emptyLayout('tensions', 'No tensions surfaced yet.');
  }

  const placed: Placed[] = [];
  const connectors: Connector[] = [];
  const rowGap = 130;
  const topPad = 70;
  const half = Math.max(CARD_W / 2 + 24, Math.min(230, (w - 200) / 2));

  conflicts.forEach((e, i) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return;
    const y = topPad + i * rowGap;
    const pa: Placed = { id: a.id, node: a, x: w / 2 - half, y, w: CARD_W, h: cardH(a.label) };
    const pb: Placed = { id: b.id, node: b, x: w / 2 + half, y, w: CARD_W, h: cardH(b.label) };
    placed.push(pa, pb);
    connectors.push({
      key: `t~${e.from}~${e.to}`,
      from: pa.id,
      to: pb.id,
      path: `M ${pa.x + pa.w / 2} ${y} H ${pb.x - pb.w / 2}`,
      relation: 'conflicts',
      strength: e.strength,
      label: 'pulls against',
      lx: w / 2,
      ly: y,
      double: true,
    });
  });

  // Standalone tension nodes sit beneath, named as the pull itself.
  tensionNodes.forEach((n, i) => {
    if (placed.some((p) => p.id === n.id)) return;
    placed.push({
      id: n.id,
      node: n,
      x: w / 2,
      y: topPad + conflicts.length * rowGap + i * 86,
      w: CARD_W,
      h: cardH(n.label),
    });
  });

  return { placed, connectors, caption: capOf('tensions') };
}

// ── evidence: claims and what supports them ─────────────────────────
export function layoutEvidence(map: ThinkingMap, w: number, h: number): Layout {
  const evidence = map.nodes.filter((n) => n.type === 'evidence' || n.type === 'source');
  if (!evidence.length) return emptyLayout('evidence', 'No evidence offered yet.');

  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  // Claims are whatever the evidence points at.
  const claimIds = new Set<string>();
  const supportOf = new Map<string, string[]>();
  for (const e of map.edges) {
    if (e.relation !== 'supports') continue;
    const fromType = byId.get(e.from)?.type;
    if (fromType !== 'evidence' && fromType !== 'source') continue;
    claimIds.add(e.to);
    if (!supportOf.has(e.to)) supportOf.set(e.to, []);
    supportOf.get(e.to)!.push(e.from);
  }

  const placed: Placed[] = [];
  const connectors: Connector[] = [];
  const claims = [...claimIds].map((id) => byId.get(id)!).filter(Boolean);

  if (!claims.length) {
    // Evidence with nothing attached — lay it out in a simple row.
    const spacing = Math.max(CARD_W + 16, Math.min(190, (w - 80) / Math.max(evidence.length, 1)));
    const total = spacing * (evidence.length - 1);
    evidence.forEach((n, i) => {
      placed.push({
        id: n.id,
        node: n,
        x: w / 2 - total / 2 + i * spacing,
        y: h / 2,
        w: CARD_W,
        h: cardH(n.label),
      });
    });
    return { placed, connectors, caption: capOf('evidence') };
  }

  // Each claim's column is as wide as its evidence needs, never narrower
  // than a card: columns sit side by side, they do not overlap.
  const STEP = CARD_W + 16;
  const baseCol = Math.max(STEP + 8, Math.min(300, (w - 60) / claims.length));
  const colWs = claims.map((c) => Math.max(baseCol, (supportOf.get(c.id)?.length ?? 0) * STEP));
  const span = colWs.reduce((a, b) => a + b, 0);
  let cursor = w / 2 - span / 2;
  // the evidence row sits below the tallest claim, however long its words
  const claimH = Math.max(...claims.map((c) => cardH(c.label)));
  const kidH = Math.max(CARD_H, ...claims.flatMap((c) => (supportOf.get(c.id) || []).map((k) => cardH(byId.get(k)?.label ?? ''))));
  const kidY = Math.max(200, 72 + claimH / 2 + 44 + kidH / 2);
  claims.forEach((claim, ci) => {
    const colW = colWs[ci];
    const cx = cursor + colW / 2;
    cursor += colW;
    const top: Placed = {
      id: claim.id,
      node: claim,
      x: cx,
      y: 72,
      w: CARD_W,
      h: cardH(claim.label),
    };
    placed.push(top);
    const kids = supportOf.get(claim.id) || [];
    const spacing = Math.max(STEP, Math.min(170, colW / Math.max(kids.length, 1)));
    const total = spacing * (kids.length - 1);
    kids.forEach((kid, i) => {
      const n = byId.get(kid);
      if (!n) return;
      const p: Placed = {
        id: kid,
        node: n,
        x: cx - total / 2 + i * spacing,
        y: kidY,
        w: CARD_W,
        h: cardH(n.label),
      };
      placed.push(p);
      const midY = (top.y + top.h / 2 + (p.y - p.h / 2)) / 2;
      connectors.push({
        key: `e~${claim.id}~${kid}`,
        from: claim.id,
        to: kid,
        path: `M ${top.x} ${top.y + top.h / 2} V ${midY} H ${p.x} V ${p.y - p.h / 2}`,
        relation: 'supports',
        strength: map.edges.find(
          (e) =>
            (e.from === kid && e.to === claim.id) || (e.from === claim.id && e.to === kid)
        )?.strength,
      });
    });
  });

  return { placed, connectors, caption: capOf('evidence') };
}

// ── solve: the solution chain, top to bottom ────────────────────────
// Setup (givens, unknowns, constraints, definitions) across the top; the work
// flows down the centre, one state per row, ordered by how far each is from
// the start; theorems/justifications sit to the right of the step they support;
// the result and any check settle at the bottom. An error step keeps its place
// in the chain — the whole point is to see where it diverged, not hide it.
const SOLVE_W = 236;
const SETUP_TYPES = new Set<LogosNode['type']>(['given', 'unknown', 'constraint']);
const ASIDE_TYPES = new Set<LogosNode['type']>(['theorem', 'definition']);

function solveCardH(n: LogosNode, w: number) {
  const len = (n.tex || n.label).length + (n.note ? n.note.length * 0.5 : 0);
  if (len * 6.6 > (w - 26) * 2) return 76;
  return len * 6.6 > w - 26 ? 58 : 42;
}

export function layoutSolve(map: ThinkingMap, w: number, h: number): Layout {
  const { nodes, edges } = map;
  if (!nodes.length) return emptyLayout('solve', 'The work will appear here as you solve.');
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // A definition/theorem is an "aside" only when it justifies a step; otherwise
  // it's part of the setup.
  const justifies = edges.filter((e) => e.relation === 'justifies');
  const asideOf = new Map<string, string>(); // asideId -> chain node it justifies
  for (const e of justifies) {
    if (ASIDE_TYPES.has(byId.get(e.from)?.type as any) && byId.has(e.to)) asideOf.set(e.from, e.to);
  }

  const setup = nodes.filter(
    (n) => SETUP_TYPES.has(n.type) || (ASIDE_TYPES.has(n.type) && !asideOf.has(n.id))
  );
  const asides = nodes.filter((n) => asideOf.has(n.id));
  const setupIds = new Set(setup.map((n) => n.id));
  const asideIds = new Set(asides.map((n) => n.id));
  const chain = nodes.filter((n) => !setupIds.has(n.id) && !asideIds.has(n.id));
  if (!chain.length) return emptyLayout('solve', 'No worked steps yet.');

  // Longest-path depth along the chain relations.
  const preds = new Map<string, string[]>();
  for (const e of edges) {
    if (!CHAIN_REL.has(e.relation)) continue;
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    (preds.get(e.to) ?? preds.set(e.to, []).get(e.to)!).push(e.from);
  }
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (seen.has(id)) return 0; // cycle guard
    seen.add(id);
    const ps = (preds.get(id) ?? []).filter((p) => !setupIds.has(p) && !asideIds.has(p));
    const d = ps.length ? Math.max(...ps.map((p) => depthOf(p, seen))) + 1 : 0;
    depthMemo.set(id, d);
    return d;
  };
  let maxD = 0;
  for (const n of chain) maxD = Math.max(maxD, depthOf(n.id));
  // Force the ending to the bottom even if edges are missing.
  const rank = (n: LogosNode) =>
    n.type === 'verification' ? maxD + 2 : n.type === 'result' ? maxD + 1 : depthOf(n.id);

  const ordered = [...chain].sort(
    (a, b) => rank(a) - rank(b) || chain.indexOf(a) - chain.indexOf(b)
  );

  const placed: Placed[] = [];
  const pos = new Map<string, Placed>();
  const cx = w / 2;

  // setup row
  const topPad = 44;
  if (setup.length) {
    const gap = Math.min(200, (w - 60) / Math.max(setup.length, 1));
    const total = gap * (setup.length - 1);
    setup.forEach((n, i) => {
      const p: Placed = {
        id: n.id,
        node: n,
        x: cx - total / 2 + i * gap,
        y: topPad,
        w: Math.min(SOLVE_W, gap - 12),
        h: solveCardH(n, Math.min(SOLVE_W, gap - 12)),
      };
      placed.push(p);
      pos.set(n.id, p);
    });
  }

  // the chain, one row per node
  const rowGap = 92;
  const chainTop = topPad + (setup.length ? 96 : 0);
  ordered.forEach((n, i) => {
    const p: Placed = {
      id: n.id,
      node: n,
      x: cx,
      y: chainTop + i * rowGap,
      w: SOLVE_W,
      h: solveCardH(n, SOLVE_W),
    };
    placed.push(p);
    pos.set(n.id, p);
  });

  // asides to the right of the step they justify
  for (const a of asides) {
    const target = pos.get(asideOf.get(a.id)!);
    if (!target) continue;
    const asideW = 168;
    const p: Placed = {
      id: a.id,
      node: a,
      // sit to the right of the step, but never past the map's edge
      x: Math.min(target.x + SOLVE_W / 2 + 40 + asideW / 2, w - asideW / 2 - 10),
      y: target.y,
      w: asideW,
      h: solveCardH(a, asideW),
    };
    placed.push(p);
    pos.set(a.id, p);
  }

  // connectors
  const connectors: Connector[] = [];
  for (const e of edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    if (CHAIN_REL.has(e.relation)) {
      // vertical spine, arrowed, op label to the right of the midpoint
      const y1 = a.y + a.h / 2;
      const y2 = b.y - b.h / 2;
      if (y2 <= y1) continue; // only draw forward/downward
      const midY = (y1 + y2) / 2;
      const path =
        Math.abs(a.x - b.x) < 1
          ? `M ${a.x} ${y1} V ${y2}`
          : `M ${a.x} ${y1} V ${midY} H ${b.x} V ${y2}`;
      connectors.push({
        key: `${e.from}>${e.to}`,
        from: e.from,
        to: e.to,
        path,
        relation: e.relation,
        arrow: true,
        label: e.op || undefined,
        lx: Math.max(a.x, b.x) + 12,
        ly: midY,
      });
    } else if (e.relation === 'justifies') {
      // short horizontal tie from the aside into the step
      const y = (a.y + b.y) / 2;
      connectors.push({
        key: `j~${e.from}~${e.to}`,
        from: e.from,
        to: e.to,
        path: `M ${a.x - a.w / 2} ${a.y} H ${b.x + b.w / 2}`,
        relation: 'justifies',
        strength: e.strength,
      });
    }
  }

  return { placed, connectors, caption: capOf('solve') };
}

function capOf(id: LensId) {
  return LENSES.find((l) => l.id === id)!.caption;
}
function emptyLayout(id: LensId, empty: string): Layout {
  return { placed: [], connectors: [], caption: capOf(id), empty };
}

export { CARD_W, GRAPH_W, cardH };

// ── the comparison matrix ───────────────────────────────────────────
//
// Every other lens draws a graph. Comparing options against criteria is not a
// graph — it is a table — and almost every field does it: which solvent,
// which algorithm, which treatment, which policy, which reading of a poem,
// which supplier. There was no way to see one.
//
// It invents nothing. The matrix is a PROJECTION of the map that already
// exists: the criteria are the nodes that say what matters, the options are
// the nodes judged against them, and each cell is the edge between the two.
// That means it needs no new node types, no new relations, and no second
// extraction — a map built by talking is already a comparison if the thinking
// was comparative.
//
// The empty cells are the point. A blank is not missing data, it is a
// question nobody has asked yet, and it is the most useful thing on the
// table.

/** Nodes that say what MATTERS — the things options are judged against. */
const CRITERION_TYPES = new Set<LogosNode['type']>(['value', 'constraint', 'goal']);

/** Nodes that are never options: they are the material of an argument, not a
 *  candidate in one. */
const NOT_AN_OPTION = new Set<LogosNode['type']>([
  'value', 'constraint', 'goal', 'evidence', 'source', 'question', 'tension',
]);

export type CellVerdict = 'good' | 'bad' | 'noted' | 'unknown';

export interface MatrixCell {
  verdict: CellVerdict;
  strength?: LogosEdgeStrength;
  /** what was actually said about this pairing, when anything was */
  note?: string;
}

export interface ComparisonMatrix {
  options: LogosNode[];
  criteria: LogosNode[];
  /** cells[option][criterion] */
  cells: MatrixCell[][];
  /** pairings nobody has said anything about — the questions still open */
  unknowns: number;
}

/** Which way an edge reads as a judgement of an option against a criterion. */
const VERDICT: Partial<Record<LogosRelation, CellVerdict>> = {
  supports: 'good',
  justifies: 'good',
  implies: 'good',
  conflicts: 'bad',
  depends: 'noted',
  relates: 'noted',
  leads_to: 'noted',
  part_of: 'noted',
  equivalent_to: 'noted',
};

const MAX_OPTIONS = 8;
const MAX_CRITERIA = 8;

/**
 * The comparison this map is already making, or null if it is not making one.
 *
 * Null rather than an empty table: a lens with nothing in it is worse than a
 * lens that is not offered, and a single option or a single criterion is not
 * a comparison — it is a description.
 */
export function buildMatrix(map: ThinkingMap): ComparisonMatrix | null {
  const criteria = map.nodes.filter((n) => CRITERION_TYPES.has(n.type)).slice(0, MAX_CRITERIA);
  if (criteria.length < 2) return null;
  const criterionIds = new Set(criteria.map((c) => c.id));

  // An option is anything judged against at least one criterion. Deriving it
  // from the EDGES rather than from a type keeps the table to what is actually
  // being compared, instead of every node that happens to be lying around.
  const judged = new Map<string, Map<string, MatrixCell>>();
  for (const e of map.edges) {
    const verdict = VERDICT[e.relation];
    if (!verdict) continue;
    const [optId, critId] = criterionIds.has(e.to) ? [e.from, e.to] : criterionIds.has(e.from) ? [e.to, e.from] : [null, null];
    if (!optId || !critId || criterionIds.has(optId)) continue;
    const node = map.nodes.find((n) => n.id === optId);
    if (!node || NOT_AN_OPTION.has(node.type)) continue;
    if (!judged.has(optId)) judged.set(optId, new Map());
    const row = judged.get(optId)!;
    const had = row.get(critId);
    // Two edges about the same pairing that disagree is a real state, and
    // "mixed" would hide it — the stronger claim wins, and a tie keeps the
    // first, which is the one the conversation reached first.
    if (!had || rank(verdict, e.strength) > rank(had.verdict, had.strength)) {
      row.set(critId, { verdict, strength: e.strength, ...(e.op ? { note: e.op } : {}) });
    }
  }

  const options = map.nodes
    .filter((n) => judged.has(n.id))
    .slice(0, MAX_OPTIONS);
  if (options.length < 2) return null;

  let unknowns = 0;
  const cells = options.map((o) => {
    const row = judged.get(o.id)!;
    return criteria.map((c) => {
      const cell = row.get(c.id);
      if (!cell) { unknowns++; return { verdict: 'unknown' as CellVerdict }; }
      return cell;
    });
  });

  return { options, criteria, cells, unknowns };
}

/** How much weight a cell carries, for resolving two claims about one pairing. */
function rank(v: CellVerdict, s?: LogosEdgeStrength): number {
  const base = v === 'unknown' ? 0 : v === 'noted' ? 1 : 2;
  const w = s === 'strong' ? 2 : s === 'weak' ? 0 : 1;
  return base * 3 + w;
}


// ── the shapes with an order: flow and timeline ─────────────────────

const FLOW_W = 168;
const FLOW_GAP_X = 70;
const FLOW_GAP_Y = 30;
const FLOW_PAD = 40;
/** room under a card for the count of what hangs from it */
const ATTACH_H = 18;

/**
 * A FLOW. The spine in order — each part in the column after the latest thing
 * that comes before it — so a sequence reads left to right and a branch is
 * the paths it opens, stacked in the next column. Details are not cards on the
 * canvas: they ride on the step they apply to, and are listed when it is
 * opened. Whatever is on the map but not yet placed in the shape sits in a row
 * beneath it, so nothing the person thought is hidden by the shape.
 *
 * Narrow panels run it top to bottom instead.
 */
export function layoutFlow(map: ThinkingMap, w: number, h: number): Layout {
  const cap = capOf('flow');
  const kind = map.building?.kind;
  const spine = spineOf(map, kind && GRAMMARS[kind].ordered ? kind : undefined);
  if (spine.size < 2) return emptyLayout('flow', 'A flow appears when there are steps in an order.');
  const layers = orderSpine(map, spine);
  const attached = attachmentsOf(map, spine);
  const held = new Set([...attached.values()].flat().map((n) => n.id));
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const across = w >= 640;
  const forks = new Map<string, number>();
  for (const e of transitionsOf(map, spine)) forks.set(e.from, (forks.get(e.from) ?? 0) + 1);

  const placed: Placed[] = [];
  const at = new Map<string, Placed>();
  const cardOf = (id: string) => {
    const node = byId.get(id)!;
    const extra = attached.get(id)?.length ? ATTACH_H : 0;
    return { node, h: cardH(node.label, FLOW_W) + extra };
  };

  // The extent of each layer, to centre the paths of a branch on one another.
  const layerSpan = layers.map((l) => l.reduce((sum, id) => sum + cardOf(id).h, 0) + FLOW_GAP_Y * (l.length - 1));
  // A LONG FLOW WRAPS, like a line of text: as many steps as fit across, then
  // the next row continues from the left. Scrolling sideways through eleven
  // steps to find where the path divides is the opposite of seeing it.
  const perRow = Math.max(2, Math.floor((w - FLOW_PAD * 2 + FLOW_GAP_X) / (FLOW_W + FLOW_GAP_X)));
  const rowOf = (li: number) => Math.floor(li / perRow);
  const rows = Math.ceil(layers.length / perRow);
  const rowSpan = Array.from({ length: rows }, (_, r) => Math.max(...layerSpan.slice(r * perRow, (r + 1) * perRow)));
  const rowTop: number[] = [];
  rowSpan.forEach((span, r) => rowTop.push(r === 0 ? FLOW_PAD : rowTop[r - 1] + rowSpan[r - 1] + FLOW_GAP_Y + 56));
  layers.forEach((layer, li) => {
    let offset = -layerSpan[li] / 2;
    const r = rowOf(li);
    for (const id of layer) {
      const { node, h: ch } = cardOf(id);
      const along = FLOW_PAD + (li % perRow) * (across ? FLOW_W + FLOW_GAP_X : 0) + (across ? FLOW_W / 2 : 0);
      const cross = offset + ch / 2;
      const x = across ? along : w / 2 + 0;
      const y = across ? rowTop[r] + rowSpan[r] / 2 + cross : FLOW_PAD + ch / 2;
      const p: Placed = {
        id,
        node,
        x,
        y,
        w: FLOW_W,
        h: ch,
        ...(attached.get(id)?.length ? { attached: attached.get(id) } : {}),
        ...((forks.get(id) ?? 0) >= 2 || node.role === 'branch' ? { branch: true } : {}),
      };
      placed.push(p);
      at.set(id, p);
      offset += ch + FLOW_GAP_Y;
    }
  });
  // Top to bottom: lay the layers down the page, each layer's paths side by side.
  if (!across) {
    let y = FLOW_PAD;
    for (const layer of layers) {
      const tall = Math.max(...layer.map((id) => at.get(id)!.h));
      const span = layer.length * FLOW_W + (layer.length - 1) * 24;
      layer.forEach((id, i) => {
        const p = at.get(id)!;
        p.x = w / 2 - span / 2 + FLOW_W / 2 + i * (FLOW_W + 24);
        p.y = y + tall / 2;
      });
      y += tall + FLOW_GAP_Y + 10;
    }
  }

  // Loose: on the map, not in the shape, and hanging from nothing in it.
  const loose = map.nodes.filter((n) => !spine.has(n.id) && !held.has(n.id));
  const bottom = Math.max(...placed.map((p) => p.y + p.h / 2)) + 54;
  const looseStep = Math.max(CARD_H + LINE_H, ...loose.map((n) => cardH(n.label))) + 16;
  loose.forEach((node, i) => {
    const per = Math.max(1, Math.floor((Math.max(w, FLOW_W * 2) - FLOW_PAD) / (CARD_W + 20)));
    const ch = cardH(node.label);
    const p: Placed = {
      id: node.id,
      node,
      x: FLOW_PAD + CARD_W / 2 + (i % per) * (CARD_W + 20),
      y: bottom + ch / 2 + Math.floor(i / per) * looseStep,
      w: CARD_W,
      h: ch,
      loose: true,
    };
    placed.push(p);
    at.set(node.id, p);
  });

  const back = backEdges(map, spine);
  const connectors: Connector[] = transitionsOf(map, spine).map((e) => {
    const a = at.get(e.from)!;
    const b = at.get(e.to)!;
    const returns = back.has(`${e.from}>${e.to}`);
    let path: string;
    let lx: number;
    let ly: number;
    if (returns) {
      // A loop back runs under the cards it returns across.
      const low = Math.max(a.y + a.h / 2, b.y + b.h / 2) + 26;
      path = `M${a.x},${a.y + a.h / 2} C${a.x},${low} ${b.x},${low} ${b.x},${b.y + b.h / 2}`;
      lx = (a.x + b.x) / 2;
      ly = low;
    } else if (across && b.y - b.h / 2 > a.y + a.h / 2 + 20 && b.x < a.x) {
      // Onto the next row: down from the end of this one, back to the start.
      const y1 = a.y + a.h / 2;
      const y2 = b.y - b.h / 2;
      const my = (y1 + y2) / 2;
      path = `M${a.x},${y1} C${a.x},${my + 10} ${b.x},${my - 10} ${b.x},${y2}`;
      lx = b.x;
      ly = y2 - 6;
    } else if (across) {
      const x1 = a.x + a.w / 2;
      const x2 = b.x - b.w / 2;
      const mx = (x1 + x2) / 2;
      path = `M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}`;
      // The condition sits by the path it opens, not where two paths cross.
      lx = (mx + x2) / 2;
      ly = b.y - 4;
    } else {
      const y1 = a.y + a.h / 2;
      const y2 = b.y - b.h / 2;
      const my = (y1 + y2) / 2;
      path = `M${a.x},${y1} C${a.x},${my} ${b.x},${my} ${b.x},${y2}`;
      lx = b.x;
      ly = y2 - 2;
    }
    return {
      key: `${e.from}~${e.to}~${e.relation}`,
      from: e.from,
      to: e.to,
      path,
      relation: e.relation,
      strength: e.strength,
      arrow: true,
      ...(e.when ? { label: e.when.length > 26 ? e.when.slice(0, 25) + '…' : e.when, lx, ly } : {}),
    };
  });
  return { placed, connectors, caption: cap };
}

/**
 * A TIMELINE. The same order as a flow, set along one axis: each moment in
 * its place, alternating above and below the line so neighbours never
 * collide, with things that happened together stacked on the same tick.
 */
export function layoutTimeline(map: ThinkingMap, w: number, h: number): Layout {
  const cap = capOf('timeline');
  const spine = spineOf(map, 'timeline');
  if (spine.size < 2) return emptyLayout('timeline', 'A timeline appears when there are events in an order.');
  const layers = orderSpine(map, spine);
  const attached = attachmentsOf(map, spine);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const step = Math.max(FLOW_W + 24, (w - FLOW_PAD * 2) / Math.max(1, layers.length));
  const axis = Math.max(h / 2, 180);
  const placed: Placed[] = [];
  const at = new Map<string, Placed>();
  // one tier is as tall as the tallest card on the line, so stacked cards never touch
  const tierH = Math.max(
    CARD_H + LINE_H,
    ...layers.flat().map((id) => cardH(byId.get(id)!.label, FLOW_W) + (attached.get(id)?.length ? ATTACH_H : 0))
  );
  layers.forEach((layer, li) => {
    layer.forEach((id, k) => {
      const node = byId.get(id)!;
      const ch = cardH(node.label, FLOW_W) + (attached.get(id)?.length ? ATTACH_H : 0);
      const above = (li + k) % 2 === 0;
      const tier = 40 + k * (tierH + 18);
      const p: Placed = {
        id,
        node,
        x: FLOW_PAD + FLOW_W / 2 + li * step,
        y: above ? axis - tier - ch / 2 : axis + tier + ch / 2,
        w: FLOW_W,
        h: ch,
        ...(attached.get(id)?.length ? { attached: attached.get(id) } : {}),
      };
      placed.push(p);
      at.set(id, p);
    });
  });
  const first = placed[0];
  const last = placed[placed.length - 1];
  const connectors: Connector[] = [
    {
      key: 'timeline-axis',
      path: `M${first.x - FLOW_W / 2},${axis} L${last.x + FLOW_W / 2},${axis}`,
      relation: 'precedes',
      arrow: true,
    },
    ...placed.map((p) => ({
      key: `tick~${p.id}`,
      to: p.id,
      path: `M${p.x},${axis} L${p.x},${p.y + (p.y < axis ? p.h / 2 : -p.h / 2)}`,
      relation: 'part_of' as const,
    })),
  ];
  return { placed, connectors, caption: cap };
}
