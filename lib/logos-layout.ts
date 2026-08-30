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

export type LensId = 'graph' | 'structure' | 'tensions' | 'evidence' | 'solve' | 'plot' | 'board';

export interface Placed {
  id: string;
  node: LogosNode;
  x: number;
  y: number;
  w: number;
  h: number;
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
  { id: 'graph', label: 'Graph', caption: 'See how everything connects.' },
  { id: 'structure', label: 'Structure', caption: 'What am I trying to accomplish?' },
  { id: 'tensions', label: 'Tensions', caption: 'What’s pulling me in different directions?' },
  { id: 'evidence', label: 'Evidence', caption: 'Why do I believe this?' },
  { id: 'solve', label: 'Solution', caption: 'Follow the work, step by step.' },
  { id: 'plot', label: 'Plot', caption: 'See the function.' },
  { id: 'board', label: 'Board', caption: 'Work it out by hand.' },
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
};

const CARD_W = 150;
const CARD_H = 42;
const CARD_H2 = 58; // two-line
const GRAPH_W = 168;

function cardH(label: string, w = CARD_W) {
  // ~7.1px per character at 13.5px Inter; wrap past the card width.
  return label.length * 7.1 > w - 26 ? CARD_H2 : CARD_H;
}

// ── which lenses have anything to show ──────────────────────────────
export function availableLenses(map: ThinkingMap): LensId[] {
  const out: LensId[] = [];
  if (map.nodes.length) out.push('graph');
  if (map.nodes.length > 1) out.push('structure');
  if (
    map.edges.some((e) => e.relation === 'conflicts') ||
    map.nodes.some((n) => n.type === 'tension' || n.type === 'counterpoint')
  ) {
    out.push('tensions');
  }
  // Support means the same thing whether it's evidence under a decision or
  // evidence under a claim in an essay.
  if (map.nodes.some((n) => n.type === 'evidence' || n.type === 'source')) out.push('evidence');

  // Mathematics gets its own two lenses, offered only for math work.
  if (map.context === 'math') {
    const chainNodes = map.nodes.filter((n) => CHAIN_TYPES.has(n.type));
    const chainEdges = map.edges.filter((e) => CHAIN_REL.has(e.relation));
    if (chainNodes.length >= 2 || chainEdges.length >= 1) out.unshift('solve');
    // A dynamic scene earns the lens on its own: the interesting cases —
    // a limit, a secant closing on a tangent, rectangles under a curve — are
    // often stated in prose with no plottable node anywhere in the map.
    if (map.viz || plottableNodes(map).length) out.push('plot');
    if (map.nodes.length) out.push('board');
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
  // proofs: what a statement implies or justifies sits above it, so a theorem
  // rises to the top and its dependencies trace downward — the shape a
  // dependency question ("what does this rest on?") is answered by reading.
  implies: 'from-above',
  justifies: 'from-above',
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

  const rows = order.filter(Boolean);
  const topPad = 56;
  const rowGap = Math.max(
    74,
    Math.min(112, (h - topPad - 56) / Math.max(rows.length - 1, 1))
  );
  const placed: Placed[] = [];
  const pos = new Map<string, Placed>();

  rows.forEach((row, di) => {
    const y = topPad + di * rowGap;
    const spacing = Math.min(190, (w - 80) / Math.max(row.length, 1));
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
  const half = Math.min(230, (w - 200) / 2);

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
    const spacing = Math.min(190, (w - 80) / Math.max(evidence.length, 1));
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

  const colW = Math.min(300, (w - 60) / claims.length);
  claims.forEach((claim, ci) => {
    const cx = w / 2 - (colW * (claims.length - 1)) / 2 + ci * colW;
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
    const spacing = Math.min(170, colW / Math.max(kids.length, 1));
    const total = spacing * (kids.length - 1);
    kids.forEach((kid, i) => {
      const n = byId.get(kid);
      if (!n) return;
      const p: Placed = {
        id: kid,
        node: n,
        x: cx - total / 2 + i * spacing,
        y: 200,
        w: CARD_W,
        h: cardH(n.label),
      };
      placed.push(p);
      const midY = (top.y + top.h / 2 + (p.y - p.h / 2)) / 2;
      connectors.push({
        key: `e~${claim.id}~${kid}`,
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
