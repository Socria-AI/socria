// lib/inline-diagram.ts — WHERE A DIAGRAM'S PARTS GO, AND HOW IT IS SAID.
//
// A diagram (lib/inline-ui.ts DiagramSpec) arrives already checked: a cycle's
// nodes in order round the loop, a tree with one root and every other part
// under one parent, a flow or a causal picture with no way back on itself.
// What is left is placing the parts and saying them in words, and both live
// here so the renderer (components/inline/InlineUI.tsx), the text alternative
// and the history Socria reads back place and say them the same way:
//
//   • a tree is laid out tidily — each leaf its own slot, each parent centred
//     over its children — and read as an indented outline;
//   • a flow, or the causes of something, is laid out in columns by the
//     longest way in (a part comes after everything that leads to it), and in
//     causes the effect is always the last column, so the causes converge on
//     it; within a column a part sits near what leads to it, which keeps the
//     arrows from crossing where that can be helped;
//   • a cycle is its order, and back to the start.
//
// Pure: no DOM, no measuring. The renderer turns slots and columns into
// pixels at the width it actually has.

import type { DiagramNode, DiagramRole, DiagramSpec } from './inline-ui';

/** What a part plays in the causes of something, as a reader is told it (never only by its look). */
export const DIAGRAM_ROLE_SAID: Record<DiagramRole, string> = {
  underlying: 'Underlying cause',
  trigger: 'Trigger',
  amplifier: 'Amplifier',
  effect: 'Effect',
};

const byId = (spec: DiagramSpec) => new Map(spec.nodes.map((n) => [n.id, n]));

/** What leads to a part, and what it leads to: the connections an opened part shows. */
export function linksOf(spec: DiagramSpec, id: string): { from: DiagramNode[]; to: DiagramNode[] } {
  const m = byId(spec);
  return {
    from: spec.edges.filter(([, b]) => b === id).map(([a]) => m.get(a)!).filter(Boolean),
    to: spec.edges.filter(([a]) => a === id).map(([, b]) => m.get(b)!).filter(Boolean),
  };
}

export interface TreeRow {
  id: string;
  depth: number;
}

/** A tree read top to bottom, each part straight after its parent: the indented outline. */
export function treeRows(spec: DiagramSpec): TreeRow[] {
  const kids = (id: string) => spec.edges.filter(([p]) => p === id).map(([, c]) => c);
  const hasParent = new Set(spec.edges.map(([, c]) => c));
  const root = spec.nodes.find((n) => !hasParent.has(n.id))?.id;
  if (!root) return [];
  const out: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, depth });
    for (const c of kids(id)) walk(c, depth + 1);
  };
  walk(root, 0);
  return out;
}

/**
 * A tidy tree: each leaf a slot of its own, left to right in the order the
 * reply gave them, and each parent centred over its first and last child.
 * `slots` is how many leaf slots wide it is; `depth` how many levels below
 * the root it goes.
 */
export function treeLayout(spec: DiagramSpec): { x: Map<string, number>; level: Map<string, number>; slots: number; depth: number } {
  const rows = treeRows(spec);
  const x = new Map<string, number>();
  const level = new Map(rows.map((r) => [r.id, r.depth]));
  const kids = (id: string) => spec.edges.filter(([p]) => p === id).map(([, c]) => c);
  let leaf = 0;
  const place = (id: string): number => {
    const cs = kids(id);
    const at = cs.length ? (() => {
      const xs = cs.map(place);
      return (xs[0] + xs[xs.length - 1]) / 2;
    })() : leaf++;
    x.set(id, at);
    return at;
  };
  if (rows.length) place(rows[0].id);
  return { x, level, slots: Math.max(1, leaf), depth: Math.max(0, ...rows.map((r) => r.depth)) };
}

/**
 * A flow or the causes of something, in columns: each part one column after
 * the furthest part that leads to it. In causes, the effect is pulled to the
 * last column whatever leads to it, so every cause points the same way, into
 * it. Within a column, a part is placed by the average place of what leads to
 * it (ties in the order the reply gave them).
 */
export function diagramColumns(spec: DiagramSpec): string[][] {
  const ids = spec.nodes.map((n) => n.id);
  const given = new Map(ids.map((id, i) => [id, i]));
  const layer = new Map(ids.map((id) => [id, 0]));
  // longest way in: relax every edge until nothing moves (a checked flow has no loop, so this ends)
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const [a, b] of spec.edges) {
      if (layer.get(b)! < layer.get(a)! + 1) {
        layer.set(b, layer.get(a)! + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  if (spec.view === 'causes') {
    const last = Math.max(...layer.values());
    for (const n of spec.nodes) if (n.role === 'effect' && !spec.edges.some(([a]) => a === n.id)) layer.set(n.id, last);
  }
  const cols: string[][] = [];
  for (const id of ids) (cols[layer.get(id)!] ??= []).push(id);
  const dense = cols.filter(Boolean);
  const pos = new Map<string, number>();
  dense.forEach((col, ci) => {
    if (ci > 0) {
      const centre = (id: string) => {
        const ins = spec.edges.filter(([, b]) => b === id).map(([a]) => pos.get(a)).filter((v): v is number => v !== undefined);
        return ins.length ? ins.reduce((t, v) => t + v, 0) / ins.length : Infinity;
      };
      col.sort((p, q) => centre(p) - centre(q) || given.get(p)! - given.get(q)!);
    }
    col.forEach((id, i) => pos.set(id, i - (col.length - 1) / 2));
  });
  return dense;
}

/** Is it one straight chain, each part leading to the next and nothing else? */
export function isChain(spec: DiagramSpec): boolean {
  const cols = diagramColumns(spec);
  return cols.every((c) => c.length === 1) && spec.edges.length === spec.nodes.length - 1;
}

/**
 * The diagram in words: the text alternative a screen reader is given, what is
 * copied, what the history Socria reads back says was shown, and what the
 * accuracy check reads. Every part, its line when it has one, and every
 * connection — what the picture says, nothing it does not.
 */
export function diagramText(spec: DiagramSpec): string {
  const m = byId(spec);
  const said = (id: string) => {
    const n = m.get(id)!;
    return `${n.label}${n.detail ? ` (${n.detail})` : ''}`;
  };
  const head = spec.title ? `${spec.title}\n` : '';
  if (spec.view === 'cycle') return `${head}A cycle: ${spec.nodes.map((n) => said(n.id)).join(' → ')} → back to ${spec.nodes[0].label}`;
  if (spec.view === 'tree') return `${head}${treeRows(spec).map((r) => `${'  '.repeat(r.depth)}${r.depth ? '- ' : ''}${said(r.id)}`).join('\n')}`;
  const order = diagramColumns(spec).flat();
  if (spec.view === 'flow') {
    if (isChain(spec)) return `${head}${order.map(said).join(' → ')}`;
    return `${head}${order.map((id) => {
      const to = linksOf(spec, id).to;
      return `${said(id)}${to.length ? ` → ${to.map((n) => n.label).join(', ')}` : ''}`;
    }).join('\n')}`;
  }
  // causes: the parts by the part they play, then how they connect
  const group = (role: DiagramRole | undefined) => order.filter((id) => m.get(id)!.role === role);
  const lines = [
    ...(['underlying', 'trigger', 'amplifier'] as const).map((r) => [DIAGRAM_ROLE_SAID[r], group(r)] as const),
    ['Also a cause', group(undefined)] as const,
    ['Effect', group('effect')] as const,
  ]
    .filter(([, ids]) => ids.length)
    .map(([k, ids]) => `${k}${ids.length > 1 && k !== 'Also a cause' ? 's' : ''}: ${ids.map(said).join('; ')}`);
  const links = spec.edges.map(([a, b]) => `${m.get(a)!.label} → ${m.get(b)!.label}`).join('; ');
  return `${head}${lines.join('\n')}\nHow they connect: ${links}`;
}

// ── the picture, at a width ──────────────────────────────────────────

/** A part's box, by its centre, in the figure's own pixels. */
export interface DiagramBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}
export interface DiagramFigure {
  W: number;
  H: number;
  boxes: DiagramBox[];
  /** each connection as an SVG path, from the edge of one box to the edge of the next; arrowed but in a tree */
  links: { from: string; to: string; d: string }[];
}

/**
 * The narrowest a part's box may be before the picture stops being readable:
 * below it, the diagram is drawn as its list instead (the phone's form), at
 * any width. A picture squeezed until its words are three letters a line is
 * worse than the list.
 */
export const DIAGRAM_MIN_BOX = { cycle: 92, tree: 88, flow: 104, causes: 104 } as const;

const r1 = (v: number) => Math.round(v * 10) / 10;
const inside = (b: DiagramBox, x: number, y: number, pad = 5) => Math.abs(x - b.cx) <= b.w / 2 + pad && Math.abs(y - b.cy) <= b.h / 2 + pad;
const overlap = (a: DiagramBox, b: DiagramBox, gap: number) => Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + gap && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + gap;

/**
 * Where everything goes at width W, or null when it would not be readable
 * there (the list is drawn instead). Pure, so what is drawn can be tested:
 *   • a cycle: the parts round an ellipse, clockwise from the top, each arc
 *     between neighbours running along it, trimmed to the boxes;
 *   • a tree: the tidy layout, top down, joined by elbows;
 *   • a flow or causes: columns left to right, joined by curves that leave a
 *     box's right side and enter the next one's left.
 */
export function diagramFigure(spec: DiagramSpec, W: number): DiagramFigure | null {
  const min = DIAGRAM_MIN_BOX[spec.view];
  // a part's box: two lines of its label at most in a cycle or a tree, three in a flow; causes add the part it plays
  const h = spec.view === 'causes' ? 60 : 50;
  if (spec.view === 'cycle') {
    const n = spec.nodes.length;
    const H = n <= 4 ? 236 : n <= 6 ? 276 : 316;
    for (let w = 150; w >= min; w -= 4) {
      const rx = W / 2 - w / 2 - 6;
      const ry = H / 2 - h / 2 - 6;
      if (rx <= 0) continue;
      const at = (t: number) => ({ x: W / 2 + rx * Math.cos(t), y: H / 2 + ry * Math.sin(t) });
      const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
      const boxes = spec.nodes.map((nd, i) => ({ id: nd.id, cx: r1(at(angle(i)).x), cy: r1(at(angle(i)).y), w, h }));
      if (boxes.some((b, i) => boxes.some((c, j) => j > i && overlap(b, c, 8)))) continue;
      const links = spec.nodes.map((nd, i) => {
        const j = (i + 1) % n;
        const pts: { x: number; y: number }[] = [];
        for (let k = 0; k <= 40; k++) {
          const p = at(angle(i) + ((2 * Math.PI) / n) * (k / 40));
          if (!inside(boxes[i], p.x, p.y) && !inside(boxes[j], p.x, p.y)) pts.push(p);
        }
        return { from: nd.id, to: spec.nodes[j].id, d: pts.length > 1 ? `M${pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' L')}` : '' };
      });
      // an arc too short to see is not a connection anyone can follow: smaller boxes, or the list
      if (links.some((l) => !l.d)) continue;
      return { W, H, boxes, links };
    }
    return null;
  }
  if (spec.view === 'tree') {
    const t = treeLayout(spec);
    const slotW = W / t.slots;
    const w = Math.min(160, slotW - 10);
    if (w < min) return null;
    const gap = 34;
    const H = (t.depth + 1) * h + t.depth * gap + 4;
    const boxes = spec.nodes.map((nd) => ({ id: nd.id, cx: r1((t.x.get(nd.id)! + 0.5) * slotW), cy: r1(2 + h / 2 + t.level.get(nd.id)! * (h + gap)), w, h }));
    const box = new Map(boxes.map((b) => [b.id, b]));
    const links = spec.edges.map(([a, b]) => {
      const p = box.get(a)!, c = box.get(b)!;
      const mid = r1(p.cy + h / 2 + gap / 2);
      return { from: a, to: b, d: `M${p.cx},${r1(p.cy + h / 2)} V${mid} H${c.cx} V${r1(c.cy - h / 2)}` };
    });
    return { W, H, boxes, links };
  }
  const cols = diagramColumns(spec);
  const colW = W / cols.length;
  const w = Math.min(170, colW - 36);
  if (w < min) return null;
  const rows = Math.max(...cols.map((c) => c.length));
  const gap = 16;
  const body = rows * h + (rows - 1) * gap + 4;
  const colOf = new Map(cols.flatMap((col, ci) => col.map((id) => [id, ci] as const)));
  const place = (top: number): DiagramBox[] => cols.flatMap((col, ci) => col.map((id, i) => ({ id, cx: r1((ci + 0.5) * colW), cy: r1(top + body / 2 + (i - (col.length - 1) / 2) * (h + gap)), w, h })));
  const curve = (p: DiagramBox, c: DiagramBox) => {
    const x1 = r1(p.cx + w / 2), x2 = r1(c.cx - w / 2 - 3);
    const dx = r1((x2 - x1) / 2);
    return { x1, x2, dx, d: `M${x1},${p.cy} C${r1(x1 + dx)},${p.cy} ${r1(x2 - dx)},${c.cy} ${x2},${c.cy}` };
  };
  // A CONNECTION THAT SKIPS A COLUMN (an underlying cause straight into the effect, past the trigger) drawn
  // as the same curve would run under the parts in between — the boxes are drawn over the lines — and read
  // as passing through them: "alliances → assassination → war" where the reply said "alliances → war". So
  // a curve that would cross a part it does not join goes round instead, in a lane above or below every
  // part, leaving and entering in the gaps between columns.
  const first = place(0);
  const firstBox = new Map(first.map((b) => [b.id, b]));
  const crosses = (a: string, b: string) => {
    const p = firstBox.get(a)!, c = firstBox.get(b)!;
    const { x1, x2, dx } = curve(p, c);
    const others = first.filter((o) => o.id !== a && o.id !== b);
    for (let k = 1; k < 40; k++) {
      const t = k / 40, u = 1 - t;
      const x = u * u * u * x1 + 3 * u * u * t * (x1 + dx) + 3 * u * t * t * (x2 - dx) + t * t * t * x2;
      const y = u * u * u * p.cy + 3 * u * u * t * p.cy + 3 * u * t * t * c.cy + t * t * t * c.cy;
      if (others.some((o) => inside(o, x, y, 3))) return true;
    }
    return false;
  };
  const LANE = 12;
  const lanes = new Map<string, { side: 'above' | 'below'; k: number }>();
  let above = 0, below = 0;
  for (const [a, b] of spec.edges) {
    if (colOf.get(b)! - colOf.get(a)! < 2 || !crosses(a, b)) continue;
    const side = (firstBox.get(a)!.cy + firstBox.get(b)!.cy) / 2 <= body / 2 ? 'above' : 'below';
    lanes.set(`${a}\u0000${b}`, { side, k: side === 'above' ? above++ : below++ });
  }
  const top = above * LANE;
  const H = body + (above + below) * LANE;
  const boxes = place(top);
  const box = new Map(boxes.map((b) => [b.id, b]));
  const links = spec.edges.map(([a, b]) => {
    const p = box.get(a)!, c = box.get(b)!;
    const lane = lanes.get(`${a}\u0000${b}`);
    if (!lane) return { from: a, to: b, d: curve(p, c).d };
    const x1 = r1(p.cx + w / 2), x2 = r1(c.cx - w / 2 - 3);
    // out into the gap after its own column, along the lane, and down into the gap before the effect's
    const gx1 = r1((colOf.get(a)! + 1) * colW), gx2 = r1(colOf.get(b)! * colW);
    const y = r1(lane.side === 'above' ? top - 4 - lane.k * LANE : top + body + 4 + lane.k * LANE);
    const s1 = r1((gx1 - x1) / 2), s2 = r1((x2 - gx2) / 2);
    return { from: a, to: b, d: `M${x1},${p.cy} C${r1(x1 + s1)},${p.cy} ${gx1},${r1((p.cy + y) / 2)} ${gx1},${y} H${gx2} C${gx2},${r1((c.cy + y) / 2)} ${r1(x2 - s2)},${c.cy} ${x2},${c.cy}` };
  });
  return { W, H, boxes, links };
}
