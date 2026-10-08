// lib/mind/constellation.ts
//
// THE ATLAS AS A CONSTELLATION: where everything in lib/mind/atlas.ts is
// drawn on the Memory page, and in Logos 3's Mind panel.
//
// The folder graph drew the atlas by TYPE — every Goal in one circle, every
// chat in another — so a line of thinking, its map and its models were spread
// across five folders and the lines between them crossed the page. This draws
// it by what it is: memory in the middle, every chat around it, and between
// the two whatever joins them.
//
//   THE RING      every chat, Logos and Core, grouped into its Project's arc
//                 and newest first within it. A Logos line of thinking is
//                 drawn as its own map in miniature.
//   SATELLITES    what was made in one chat — a model, a plot, an object of
//                 thought — just inside it, tethered to it.
//   FOLDED        an idea on one map only is part of that map's tile, not a
//                 node of its own: it is listed when the chat is opened, and
//                 counted, never dropped.
//   BRIDGES       an idea, plot or model found in two or more chats sits
//                 between them, pulled toward the middle as far as its chats
//                 are apart, with a thread to each. These are the point.
//   THE CORE      what Socria remembers, written in the middle as a block of
//                 words — the most connected at its centre — each with its
//                 dot on the side that faces the chats it was learned in.
//
// The ring is an ellipse, as wide as the page allows: chat titles radiate
// outward from it, and a page is wider than it is tall.
//
// Deterministic: the same atlas at the same size is the same picture. No
// randomness, no clock — a stable hash breaks ties. Collisions are relaxed on
// a grid, so a thousand nodes cost a thousand, not a million.
//
// PURE: no React, no DOM.

import type { Atlas, AtlasNode } from './atlas';

export type Role = 'chat' | 'satellite' | 'bridge' | 'memory' | 'project';

export interface Placed {
  id: string;
  role: Role;
  x: number;
  y: number;
  /** its direction from the centre, radians — chat labels and satellites follow it */
  angle: number;
  /** satellites: the chat node it belongs to */
  chat?: string;
  /** memories: written in the core's block of words, with the label on this side of the dot */
  label?: 'left' | 'right';
}

/** An ellipse's two radii. */
export interface Radii {
  rx: number;
  ry: number;
}

export interface ProjectArc {
  /** the Project's atlas node */
  id: string;
  label: string;
  /** start and end angle, radians, clockwise from the top */
  a0: number;
  a1: number;
}

export type ThreadKind = 'fiber' | 'bridge' | 'tether' | 'mind';

export interface Thread {
  from: string;
  to: string;
  rel: string;
  kind: ThreadKind;
  /** the curve's control point (a quadratic Bézier from `from` to `to`) */
  qx: number;
  qy: number;
}

export interface Constellation {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** the ring of chats */
  ring: Radii;
  /** the memory core */
  core: Radii;
  /** the angle each chat on the ring is given, as a step */
  step: number;
  nodes: Record<string, Placed>;
  /** chat node ids, in ring order */
  ring_order: string[];
  arcs: ProjectArc[];
  threads: Thread[];
  /** single-map ideas, folded into their chat's tile: chat node id → idea node ids */
  folded: Record<string, string[]>;
  /** how many characters of a memory's label the core has room to write */
  memoryLabel: number;
  /** threads left undrawn to stay legible — counted, never silent */
  dropped: number;
}

export interface ConstellationOptions {
  width: number;
  height: number;
  /** the room kept outside the ring for chat titles */
  labelRoom?: number;
  /** a label's width in px, for writing the core; defaults to an estimate */
  measure?: (label: string) => number;
}

/** The core's labels are cut to this many characters. */
export const MEMORY_LABEL = 34;
const ROW = 21;
/** An estimate of an 11px sans label's width, with its dot and a little air. */
const estimate = (label: string) => Math.min(label.length, MEMORY_LABEL) * 6.15 + 22;

/** Threads beyond this are counted in `dropped` rather than drawn. */
export const MAX_THREADS = 4000;

const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const chatNode = (conversationId: string) => `c:${conversationId}`;

/** A point on an ellipse about (cx, cy), `inset` px inside it. */
const onEllipse = (cx: number, cy: number, e: Radii, a: number, inset = 0) => ({
  x: cx + Math.cos(a) * (e.rx - inset),
  y: cy + Math.sin(a) * (e.ry - inset),
});
/** The same at a fraction of its radii. */
const atFraction = (cx: number, cy: number, e: Radii, a: number, f: number) => ({
  x: cx + Math.cos(a) * e.rx * f,
  y: cy + Math.sin(a) * e.ry * f,
});

export function constellation(atlas: Atlas, opts: ConstellationOptions): Constellation {
  const { width, height } = opts;
  const measure = opts.measure ?? estimate;
  const cx = width / 2;
  const cy = height / 2;
  const room = opts.labelRoom ?? Math.min(175, Math.min(width, height) * 0.22);
  const ring: Radii = { rx: Math.max(90, width / 2 - room), ry: Math.max(80, height / 2 - room) };
  const core: Radii = { rx: ring.rx * 0.5, ry: ring.ry * 0.52 };

  const byId = new Map(atlas.nodes.map((n) => [n.id, n]));
  const nodes: Record<string, Placed> = {};

  // ── the ring: chats, grouped by Project, newest first ─────────────
  const chats = atlas.nodes.filter((n) => n.kind === 'chat');
  const projectOf = new Map<string, string>();
  for (const e of atlas.edges) {
    if (e.rel === 'filed_in' && byId.get(e.from)?.kind === 'chat' && byId.get(e.to)?.kind === 'project') projectOf.set(e.from, e.to);
  }
  const groups = new Map<string, AtlasNode[]>();
  for (const c of chats) {
    const g = projectOf.get(c.id) ?? '';
    const list = groups.get(g);
    if (list) list.push(c);
    else groups.set(g, [c]);
  }
  const newest = (list: AtlasNode[]) => Math.max(...list.map((c) => c.at ?? 0));
  const ordered = [...groups.entries()]
    .map(([g, list]) => ({ g, list: [...list].sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || a.id.localeCompare(b.id)) }))
    // Projects first, most recently active first; chats in no Project close the ring.
    .sort((a, b) => (a.g === '' ? 1 : 0) - (b.g === '' ? 1 : 0) || newest(b.list) - newest(a.list) || a.g.localeCompare(b.g));
  const gaps = ordered.length > 1 ? ordered.length : 0;
  const slots = Math.max(1, chats.length + gaps);
  const step = TAU / slots;
  const ringOrder: string[] = [];
  const arcs: ProjectArc[] = [];
  let slot = 0;
  for (const { g, list } of ordered) {
    const first = slot;
    for (const c of list) {
      const a = TOP + step * (slot + 0.5);
      nodes[c.id] = { id: c.id, role: 'chat', ...onEllipse(cx, cy, ring, a), angle: a };
      ringOrder.push(c.id);
      slot++;
    }
    if (g) {
      const p = byId.get(g);
      arcs.push({ id: g, label: p?.label ?? 'Project', a0: TOP + step * (first + 0.12), a1: TOP + step * (slot - 0.12) });
    }
    if (gaps) slot++;
  }
  const angleOfChat = (conversationId: string) => nodes[chatNode(conversationId)]?.angle;

  /** The mean of the directions of a node's chats — its length says how much they agree. */
  const lean = (n: AtlasNode) => {
    let x = 0;
    let y = 0;
    let k = 0;
    for (const c of n.chats) {
      const a = angleOfChat(c);
      if (a === undefined) continue;
      x += Math.cos(a);
      y += Math.sin(a);
      k++;
    }
    return k ? { x: x / k, y: y / k, k } : null;
  };

  // ── what was made in, or noticed on, the maps ─────────────────────
  const folded: Record<string, string[]> = {};
  const satellites = new Map<string, string[]>();
  const bridges: AtlasNode[] = [];
  for (const n of atlas.nodes) {
    if (n.kind !== 'idea' && n.kind !== 'plot' && n.kind !== 'model' && n.kind !== 'object') continue;
    const placedChats = n.chats.filter((c) => nodes[chatNode(c)]);
    if (placedChats.length >= 2) {
      bridges.push(n);
    } else if (placedChats.length === 1) {
      const host = chatNode(placedChats[0]);
      if (n.kind === 'idea') (folded[host] ??= []).push(n.id);
      else {
        const list = satellites.get(host);
        if (list) list.push(n.id);
        else satellites.set(host, [n.id]);
      }
    }
  }

  // Satellites: inward from their chat, clear of the Project arc and its
  // name, two abreast when there are several.
  const SAT = 38;
  for (const [host, ids] of satellites) {
    const h = nodes[host];
    const two = ids.length > 2;
    ids.forEach((id, j) => {
      const depth = two ? Math.floor(j / 2) : j;
      const side = two ? (j % 2 ? 1 : -1) : 0;
      const a = h.angle + side * Math.min(step * 0.22, 0.05);
      nodes[id] = { id, role: 'satellite', ...onEllipse(cx, cy, ring, a, SAT + depth * 14), angle: a, chat: host };
    });
  }

  // Bridges: between their chats, nearer the middle the further apart those
  // are — between the core and the satellites, as fractions of the ring.
  const satFrac = 1 - (SAT + 30) / Math.min(ring.rx, ring.ry);
  const bridgeIn = Math.min(0.66, satFrac - 0.04);
  const bridgeOut = Math.max(bridgeIn + 0.02, satFrac);
  for (const n of bridges) {
    const l = lean(n)!;
    const len = Math.hypot(l.x, l.y);
    const a = len > 1e-6 ? Math.atan2(l.y, l.x) : TOP + hash(n.id) * TAU;
    const f = bridgeIn + (bridgeOut - bridgeIn) * Math.min(1, Math.max(0, (len - 0.15) / 0.8));
    nodes[n.id] = { id: n.id, role: 'bridge', ...atFraction(cx, cy, ring, a, f), angle: a };
  }

  // ── the core: what Socria remembers, written as a block of words ──
  const memories = atlas.nodes
    .filter((n) => n.kind === 'memory' || (n.kind === 'project' && !arcs.some((p) => p.id === n.id)))
    // the most connected at the centre of the block
    .sort((a, b) => b.chats.length - a.chats.length || a.label.localeCompare(b.label));
  const rows = Math.max(1, Math.floor((core.ry * 2) / ROW));
  // a label is cut to what the widest row can hold, so a small picture still
  // writes its memories rather than turning them all into dots
  const cap = Math.max(10, Math.min(MEMORY_LABEL, Math.floor((2 * core.rx - 22) / 6.15)));
  const cut = (label: string) => (label.length > cap ? label.slice(0, cap) : label);
  // the middle row first, then above and below it in turn
  const mid = Math.floor((rows - 1) / 2);
  const rowOrder: number[] = [mid];
  for (let d = 1; rowOrder.length < rows; d++) {
    if (mid - d >= 0) rowOrder.push(mid - d);
    if (mid + d < rows) rowOrder.push(mid + d);
  }
  const top = cy - (rows * ROW) / 2 + ROW / 2;
  const queue = [...memories];
  const overflow: AtlasNode[] = [];
  for (const r of rowOrder) {
    if (!queue.length) break;
    const y = top + r * ROW;
    const t = (y - cy) / core.ry;
    const span = 2 * core.rx * Math.sqrt(Math.max(0, 1 - t * t));
    const line: { n: AtlasNode; w: number }[] = [];
    let used = 0;
    for (let i = 0; i < queue.length && line.length < 4; ) {
      const w = measure(cut(queue[i].label));
      if (used + w <= span) {
        line.push({ n: queue[i], w });
        used += w;
        queue.splice(i, 1);
      } else if (!line.length && w > span) {
        // too long for any row that is left: it goes to the edge, unwritten
        overflow.push(queue.splice(i, 1)[0]);
      } else i++;
    }
    let x = cx - used / 2;
    for (const { n, w } of line) {
      const l = lean(n);
      // the dot on the side that faces where it was learned
      const right = l ? l.x >= 0 : true;
      const dx = right ? x + w - 8 : x + 8;
      nodes[n.id] = {
        id: n.id,
        role: n.kind === 'project' ? 'project' : 'memory',
        x: dx,
        y,
        angle: Math.atan2(y - cy, dx - cx),
        label: right ? 'left' : 'right',
      };
      x += w;
    }
  }
  // what did not fit: dots around the edge of the core, toward their chats
  for (const n of [...queue, ...overflow]) {
    const l = lean(n);
    const a = l && Math.hypot(l.x, l.y) > 1e-6 ? Math.atan2(l.y, l.x) : TOP + hash(n.id) * TAU;
    nodes[n.id] = { id: n.id, role: n.kind === 'project' ? 'project' : 'memory', ...atFraction(cx, cy, core, a, 1.12), angle: a };
  }

  // ── room: push apart what landed on top of each other ─────────────
  relax(
    Object.values(nodes).filter((p) => p.role === 'bridge' || ((p.role === 'memory' || p.role === 'project') && !p.label)),
    { cx, cy, gap: 18, ring, bands: { memory: [1.02, 1.3], project: [1.02, 1.3], bridge: [bridgeIn - 0.03, bridgeOut + 0.03] }, core }
  );

  // ── the threads ───────────────────────────────────────────────────
  // An edge to a folded idea is an edge to its chat; an edge to a Project
  // drawn as an arc is not drawn (the arc says it).
  const foldedTo = new Map<string, string>();
  for (const [host, ids] of Object.entries(folded)) for (const id of ids) foldedTo.set(id, host);
  const end = (id: string) => (nodes[id] ? id : foldedTo.get(id) ?? null);
  const seen = new Set<string>();
  const threads: Thread[] = [];
  let dropped = 0;
  for (const e of atlas.edges) {
    const a = end(e.from);
    const b = end(e.to);
    if (!a || !b || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pa = nodes[a];
    const pb = nodes[b];
    const kind = threadKind(pa, pb);
    if (!kind) continue;
    if (threads.length >= MAX_THREADS) {
      dropped++;
      continue;
    }
    // The bow: a long thread bends a little toward the middle — enough to
    // read as a bundle, not so much that every one crosses the core's words;
    // a tether to a satellite is straight; the core's own edges barely bend.
    const pull = kind === 'tether' ? 0 : kind === 'mind' ? 0.25 : kind === 'bridge' ? 0.4 : 0.3;
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    threads.push({ from: a, to: b, rel: e.rel, kind, qx: mx + (cx - mx) * pull, qy: my + (cy - my) * pull });
  }

  return { width, height, cx, cy, ring, core, step, nodes, ring_order: ringOrder, arcs, threads, folded, dropped, memoryLabel: cap };
}

function threadKind(a: Placed, b: Placed): ThreadKind | null {
  const r = [a.role, b.role].sort().join('+');
  switch (r) {
    case 'chat+memory':
    case 'chat+project':
      return 'fiber';
    case 'bridge+chat':
      return 'bridge';
    case 'chat+satellite':
      return 'tether';
    case 'memory+memory':
    case 'memory+project':
    case 'project+project':
    case 'bridge+memory':
    case 'bridge+bridge':
    case 'bridge+project':
    case 'memory+satellite':
    case 'bridge+satellite':
      return 'mind';
    default:
      // chat+chat (not an atlas edge) and anything unforeseen: not drawn
      return null;
  }
}

/**
 * Pushes overlapping points apart, keeping each inside its band of radii.
 * A grid of cells one gap wide means each point only meets its neighbours.
 */
function relax(
  pts: Placed[],
  o: { cx: number; cy: number; gap: number; ring: Radii; core: Radii; bands: Partial<Record<Role, [number, number]>> }
) {
  const { cx, cy, gap } = o;
  for (let it = 0; it < 48; it++) {
    const grid = new Map<string, Placed[]>();
    const cell = (p: Placed) => `${Math.floor(p.x / gap)},${Math.floor(p.y / gap)}`;
    for (const p of pts) {
      const k = cell(p);
      const list = grid.get(k);
      if (list) list.push(p);
      else grid.set(k, [p]);
    }
    let moved = false;
    for (const p of pts) {
      const gx = Math.floor(p.x / gap);
      const gy = Math.floor(p.y / gap);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const list = grid.get(`${gx + dx},${gy + dy}`);
          if (!list) continue;
          for (const q of list) {
            if (q === p || q.id < p.id) continue;
            let vx = q.x - p.x;
            let vy = q.y - p.y;
            let d = Math.hypot(vx, vy);
            if (d >= gap) continue;
            if (d < 1e-6) {
              const a = hash(`${p.id}|${q.id}`) * TAU;
              vx = Math.cos(a);
              vy = Math.sin(a);
              d = 1;
            } else {
              vx /= d;
              vy /= d;
            }
            const push = (gap - Math.min(d, gap)) / 2 + 0.01;
            p.x -= vx * push;
            p.y -= vy * push;
            q.x += vx * push;
            q.y += vy * push;
            moved = true;
          }
        }
    }
    // back inside the bands, measured as a fraction of the ellipse they belong to
    for (const p of pts) {
      const band = o.bands[p.role];
      if (!band) continue;
      const e = p.role === 'bridge' ? o.ring : o.core;
      const ux = (p.x - cx) / e.rx;
      const uy = (p.y - cy) / e.ry;
      const f = Math.hypot(ux, uy);
      const a = Math.atan2(uy, ux);
      const want = Math.min(band[1], Math.max(band[0], f));
      if (Math.abs(want - f) > 1e-9) {
        p.x = cx + Math.cos(a) * e.rx * want;
        p.y = cy + Math.sin(a) * e.ry * want;
      }
      p.angle = Math.atan2(p.y - cy, p.x - cx);
    }
    if (!moved) break;
  }
}

/** What a chat holds, from the atlas: for the panel when a chat is opened. */
export interface ChatContents {
  ideas: AtlasNode[];
  models: AtlasNode[];
  plots: AtlasNode[];
  objects: AtlasNode[];
  memories: AtlasNode[];
}

export function contentsOf(atlas: Atlas, conversationId: string): ChatContents {
  const out: ChatContents = { ideas: [], models: [], plots: [], objects: [], memories: [] };
  for (const n of atlas.nodes) {
    if (!n.chats.includes(conversationId)) continue;
    if (n.kind === 'idea') out.ideas.push(n);
    else if (n.kind === 'model') out.models.push(n);
    else if (n.kind === 'plot') out.plots.push(n);
    else if (n.kind === 'object') out.objects.push(n);
    else if (n.kind === 'memory') out.memories.push(n);
  }
  // what other chats share first — the bridges are why this view exists
  const shared = (n: AtlasNode) => (n.chats.length > 1 ? 0 : 1);
  out.ideas.sort((a, b) => shared(a) - shared(b) || a.label.localeCompare(b.label));
  return out;
}
