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

import type { LogosEdge, LogosNode, LogosRelation, ThinkingMap } from './logos';

export type LensId = 'graph' | 'structure' | 'tensions' | 'evidence';

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
];

export const RELATION_LABEL: Record<LogosRelation, string> = {
  supports: 'supported by',
  conflicts: 'conflicts with',
  depends: 'depends on',
  relates: 'relates to',
  leads_to: 'leads to',
  revises: 'revises',
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
    map.nodes.some((n) => n.type === 'tension')
  ) {
    out.push('tensions');
  }
  if (map.nodes.some((n) => n.type === 'evidence')) out.push('evidence');
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
    decision: 1,
    value: 1,
    belief: 2,
    idea: 2,
    question: 3,
    tension: 3,
    assumption: 3,
    evidence: 4,
    consequence: 4,
  };

  // Prefer real anchors as roots: goals, else decisions, else whatever has
  // no parent. Everything else hangs beneath rather than sitting alongside.
  const anchors = nodes.filter((n) => n.type === 'goal' && !hasParent.has(n.id));
  const fallback = nodes.filter((n) => n.type === 'decision' && !hasParent.has(n.id));
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
      const rel =
        edges.find(
          (e) =>
            (e.from === c && e.to === parent) || (e.from === parent && e.to === c)
        )?.relation || 'relates';
      connectors.push({
        key: `${parent}~${c}`,
        // right-angle routing, the reference's tree grammar
        path: `M ${p.x} ${p.y + p.h / 2} V ${midY} H ${k.x} V ${k.y - k.h / 2}`,
        relation: rel,
      });
    }
  }

  return { placed, connectors, caption: capOf('structure') };
}

// ── tensions: opposing pairs ────────────────────────────────────────
export function layoutTensions(map: ThinkingMap, w: number, h: number): Layout {
  const conflicts = map.edges.filter((e) => e.relation === 'conflicts');
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const tensionNodes = map.nodes.filter((n) => n.type === 'tension');

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
  const evidence = map.nodes.filter((n) => n.type === 'evidence');
  if (!evidence.length) return emptyLayout('evidence', 'No evidence offered yet.');

  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  // Claims are whatever the evidence points at.
  const claimIds = new Set<string>();
  const supportOf = new Map<string, string[]>();
  for (const e of map.edges) {
    if (e.relation !== 'supports') continue;
    if (byId.get(e.from)?.type !== 'evidence') continue;
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
      });
    });
  });

  return { placed, connectors, caption: capOf('evidence') };
}

function capOf(id: LensId) {
  return LENSES.find((l) => l.id === id)!.caption;
}
function emptyLayout(id: LensId, empty: string): Layout {
  return { placed: [], connectors: [], caption: capOf(id), empty };
}

export { CARD_W, GRAPH_W, cardH };
