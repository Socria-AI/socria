// lib/campaign/scene.ts — the relaunch's opening, as numbers: a chat window
// drawn line by line, broken into grains, and the grains carried off into a
// network of nodes, which is what thinking looks like in Logos 5.
//
// THE STORY, IN SECONDS (TIMELINE):
//   0.2–2.0  the chat assembles — its frame, a header, three messages, the
//            input — and the assistant starts "typing…"
//   2.4–2.8  the whole interface turns to grain where it stands
//   2.6–3.9  a wave goes out from the typing dots — the chatbot's voice — and
//            each grain it passes breaks away
//   ≈4.1–5.8 the grains swoop into nodes spread across the screen, and the
//            nodes light as they fill
//   4.5–6.3  the links between them draw in
//   5.2      the headline;  5.8  the field for the code;  6.8  settled
// after which the network breathes and small signals run along its links.
//
// PURE AND DETERMINISTIC. The same size and seed make the same scene, and
// where anything is at time t is a function of t alone — nothing is stepped
// frame by frame. So a resize rebuilds the scene and carries on at the same
// moment, a reload can begin later in the story, reduced motion is simply the
// last frame, and the suite can check the story from both ends: every grain
// starts on the chat and ends in its node. Drawing is the page's
// (components/campaign/Campaign.tsx).

export const TIMELINE = {
  frame: 0.2,
  header: 0.55,
  input: 0.75,
  messages: [0.95, 1.3, 1.65],
  typing: 2.0,
  grain: 2.4,
  dissolve: 2.6,
  wave: 1.3,
  travel: [1.5, 1.95] as const,
  edges: 4.5,
  title: 5.2,
  form: 5.8,
  settled: 6.8,
  signals: 6.3,
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One stroke of the chat as it is drawn, before it breaks. `at` is when it appears; `rise` how far it rises into place. */
export type Shape =
  | { kind: 'rrect'; x: number; y: number; w: number; h: number; r: number; stroke: number; fill: number; at: number; rise: number }
  | { kind: 'bar'; x: number; y: number; w: number; h: number; alpha: number; at: number; rise: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; stroke: number; fill: number; at: number; rise: number }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number; alpha: number; at: number; rise: number }
  | { kind: 'typing'; cx: number; cy: number; gap: number; r: number; at: number; rise: number }
  | { kind: 'send'; cx: number; cy: number; r: number; at: number; rise: number }
  | { kind: 'caret'; x: number; y: number; h: number; at: number; rise: number };

export interface Grain {
  /** where it sits on the chat */
  ox: number;
  oy: number;
  /** the node it ends in */
  node: number;
  /** when the wave reaches it, and how long it flies */
  release: number;
  travel: number;
  /** the burst away from the chat: the first control point */
  c1x: number;
  c1y: number;
  /** which way it swoops into the node (±1), and how wide */
  side: number;
  bow: number;
  /** a small wander in flight */
  wob: number;
  freq: number;
  phase: number;
  size: number;
}

export interface Node {
  x: number;
  y: number;
  r: number;
  hub: boolean;
  /** the side every grain swoops in from, so each node fills from one stream */
  side: number;
  /** when it begins to light: just before its first grain arrives */
  form: number;
  /** its slow drift once settled */
  amp: number;
  w1: number;
  w2: number;
  p1: number;
  p2: number;
  /** how far it moves with the pointer (parallax) */
  depth: number;
}

export interface Edge {
  a: number;
  b: number;
  start: number;
  strong: boolean;
}

export interface Scene {
  w: number;
  h: number;
  /** the scale everything is drawn at, from the viewport: 1 on a laptop */
  unit: number;
  chat: Box;
  shapes: Shape[];
  grains: Grain[];
  nodes: Node[];
  edges: Edge[];
  /** where the dissolve begins: the typing dots */
  wave: { x: number; y: number };
  /** the space kept for the words: nodes thin out and dim inside it */
  words: { x: number; y: number; rx: number; ry: number };
}

// ── small maths ──────────────────────────────────────────────────────

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
export const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

/** mulberry32: a seeded random, so a scene is the same every time it is made. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from k, well mixed — for choosing which link a signal runs along. */
export function hash(k: number): number {
  let x = (k + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

// ── the chat ─────────────────────────────────────────────────────────

/** Points every `step` along a closed rounded rectangle. */
function alongRRect(x: number, y: number, w: number, h: number, r: number, step: number): [number, number][] {
  r = Math.min(r, w / 2, h / 2);
  const path: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      path.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(x + w - r, y + r, -Math.PI / 2);
  arc(x + w - r, y + h - r, 0);
  arc(x + r, y + h - r, Math.PI / 2);
  arc(x + r, y + r, Math.PI);
  path.push(path[0]);
  return alongPath(path, step, true);
}

function alongCircle(cx: number, cy: number, r: number, step: number): [number, number][] {
  const n = Math.max(6, Math.round((2 * Math.PI * r) / step));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
}

/** Points every `step` along a polyline. */
function alongPath(path: [number, number][], step: number, closed = false): [number, number][] {
  const out: [number, number][] = [];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let d = carry;
    while (d < len) {
      out.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len]);
      d += step;
    }
    carry = d - len;
  }
  if (!closed) out.push(path[path.length - 1]);
  return out;
}

/** Where every grain of a shape sits. */
function grainsOf(s: Shape, step: number): [number, number][] {
  switch (s.kind) {
    case 'rrect':
      return alongRRect(s.x, s.y, s.w, s.h, s.r, step);
    case 'bar':
      return alongPath(
        [
          [s.x + s.h / 2, s.y + s.h / 2],
          [s.x + s.w - s.h / 2, s.y + s.h / 2],
        ],
        step
      );
    case 'circle':
      return [...alongCircle(s.cx, s.cy, s.r, step), ...(s.fill > 0.3 ? alongCircle(s.cx, s.cy, s.r * 0.5, step) : [])];
    case 'line':
      return alongPath(
        [
          [s.x0, s.y0],
          [s.x1, s.y1],
        ],
        step
      );
    case 'typing':
      return [-1, 0, 1].flatMap((i) => [
        [s.cx + i * s.gap, s.cy] as [number, number],
        [s.cx + i * s.gap - s.r * 0.6, s.cy] as [number, number],
        [s.cx + i * s.gap + s.r * 0.6, s.cy] as [number, number],
      ]);
    case 'send':
      return [
        ...alongCircle(s.cx, s.cy, s.r, step),
        ...alongCircle(s.cx, s.cy, s.r * 0.55, step),
        ...alongPath(
          [
            [s.cx, s.cy + s.r * 0.45],
            [s.cx, s.cy - s.r * 0.45],
          ],
          step
        ),
      ];
    case 'caret':
      return [];
  }
}

/**
 * The chat window: frame, header, the latest messages that fit, the typing
 * dots and the input — sized from the viewport, centred where the words will
 * later stand.
 */
function chatShapes(w: number, h: number, words: { x: number; y: number }) {
  const T = TIMELINE;
  const phone = w < 600;
  const cw = phone ? Math.min(w - 48, 330) : Math.max(300, Math.min(400, w * 0.28));
  const ch = Math.min(h * 0.66, cw * 1.32);
  const x = words.x - cw / 2;
  const y = Math.max(16, Math.min(h - ch - 16, words.y - ch / 2));
  const k = cw / 380;
  const pad = 22 * k;
  const shapes: Shape[] = [];

  shapes.push({ kind: 'rrect', x, y, w: cw, h: ch, r: 24 * k, stroke: 0.62, fill: 0.025, at: T.frame, rise: 0 });
  // header: an avatar, a name, a rule
  const hy = y + pad + 8 * k;
  shapes.push({ kind: 'circle', cx: x + pad + 9 * k, cy: hy, r: 9 * k, stroke: 0.55, fill: 0, at: T.header, rise: 4 });
  shapes.push({ kind: 'bar', x: x + pad + 28 * k, y: hy - 3.5 * k, w: cw * 0.26, h: 7 * k, alpha: 0.42, at: T.header + 0.06, rise: 4 });
  const rule = hy + 9 * k + pad * 0.85;
  shapes.push({ kind: 'line', x0: x + 1, y0: rule, x1: x + cw - 1, y1: rule, alpha: 0.16, at: T.header + 0.1, rise: 0 });
  // the input, at the foot
  const ih = 42 * k;
  const iy = y + ch - pad - ih;
  shapes.push({ kind: 'rrect', x: x + pad, y: iy, w: cw - 2 * pad, h: ih, r: ih / 2, stroke: 0.46, fill: 0.03, at: T.input, rise: 4 });
  shapes.push({ kind: 'bar', x: x + pad + 18 * k, y: iy + ih / 2 - 3 * k, w: (cw - 2 * pad) * 0.34, h: 6 * k, alpha: 0.22, at: T.input + 0.08, rise: 0 });
  shapes.push({ kind: 'send', cx: x + cw - pad - ih / 2, cy: iy + ih / 2, r: 14 * k, at: T.input + 0.12, rise: 0 });
  shapes.push({ kind: 'caret', x: x + pad + 16 * k, y: iy + ih / 2 - 8 * k, h: 16 * k, at: T.input + 0.2, rise: 0 });

  // the conversation, stacked up from the input: what fits, newest last
  const bubble = (n: number) => 2 * 12 * k + n * 6 * k + (n - 1) * 8 * k;
  const msgs: { mine: boolean; widths: number[]; frac: number; at: number }[] = [
    { mine: false, widths: [0.82, 0.56], frac: 0.66, at: T.messages[0] },
    { mine: true, widths: [0.78], frac: 0.5, at: T.messages[1] },
    { mine: false, widths: [0.9, 0.84, 0.42], frac: 0.76, at: T.messages[2] },
  ];
  const gap = 12 * k;
  let bottom = iy - pad * 0.9;
  const typingH = 30 * k;
  const ty = bottom - typingH;
  shapes.push({ kind: 'rrect', x: x + pad, y: ty, w: 58 * k, h: typingH, r: typingH / 2, stroke: 0.5, fill: 0.02, at: T.typing, rise: 6 });
  const typing = { x: x + pad + 29 * k, y: ty + typingH / 2 };
  shapes.push({ kind: 'typing', cx: typing.x, cy: typing.y, gap: 9 * k, r: 2.6 * k, at: T.typing + 0.05, rise: 6 });
  bottom = ty - gap;
  const top = rule + pad * 0.7;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const bh = bubble(m.widths.length);
    if (bottom - bh < top) break;
    const bw = (cw - 2 * pad) * m.frac;
    const bx = m.mine ? x + cw - pad - bw : x + pad;
    const by = bottom - bh;
    shapes.push({ kind: 'rrect', x: bx, y: by, w: bw, h: bh, r: 15 * k, stroke: m.mine ? 0.34 : 0.5, fill: m.mine ? 0.1 : 0.02, at: m.at, rise: 8 });
    m.widths.forEach((f, j) => {
      shapes.push({ kind: 'bar', x: bx + 14 * k, y: by + 12 * k + j * 14 * k, w: (bw - 28 * k) * f, h: 6 * k, alpha: m.mine ? 0.55 : 0.36, at: m.at + 0.05 + j * 0.04, rise: 8 });
    });
    bottom = by - gap;
  }
  return { chat: { x, y, w: cw, h: ch }, shapes, wave: typing };
}

// ── the network ──────────────────────────────────────────────────────

/**
 * Nodes spread over the whole screen (Poisson-disc, by Bridson), thinning out
 * where the words will stand. The spacing is chosen so that filling the
 * screen gives about `count`; any over are dropped at random, never by the
 * order they were found in — that order grows outward from the first point,
 * and keeping its head would crowd one corner.
 */
function placeNodes(w: number, h: number, count: number, words: Scene['words'], rand: () => number) {
  const margin = Math.min(w, h) * 0.05;
  const area = (w - 2 * margin) * (h - 2 * margin);
  const minD = Math.sqrt((0.66 * area) / count);
  const pts: [number, number][] = [];
  const active: number[] = [];
  const inWords = (x: number, y: number) => ((x - words.x) / words.rx) ** 2 + ((y - words.y) / words.ry) ** 2 < 1;
  const ok = (x: number, y: number) => {
    if (x < margin || x > w - margin || y < margin || y > h - margin) return false;
    for (const [px, py] of pts) if ((px - x) ** 2 + (py - y) ** 2 < minD * minD) return false;
    return true;
  };
  const add = (x: number, y: number) => {
    pts.push([x, y]);
    active.push(pts.length - 1);
  };
  add(margin + rand() * (w - 2 * margin), margin + rand() * (h - 2 * margin));
  let guard = 0;
  while (active.length && guard++ < 40000) {
    const ai = Math.floor(rand() * active.length);
    const [ax, ay] = pts[active[ai]];
    let placed = false;
    for (let k = 0; k < 24; k++) {
      const a = rand() * Math.PI * 2;
      const d = minD * (1 + rand());
      const x = ax + Math.cos(a) * d;
      const y = ay + Math.sin(a) * d;
      if (!ok(x, y)) continue;
      // the words keep their room: most points there are turned away
      if (inWords(x, y) && rand() < 0.86) continue;
      add(x, y);
      placed = true;
      break;
    }
    if (!placed) active.splice(ai, 1);
  }
  while (pts.length > count) pts.splice(Math.floor(rand() * pts.length), 1);
  return pts;
}

/** Links: each node to its nearest two (a hub to four), the long ones dropped, and a spanning tree so it is one network. */
function linkNodes(nodes: Node[], w: number, h: number): [number, number][] {
  const n = nodes.length;
  const d2 = (i: number, j: number) => (nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2;
  const key = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  const seen = new Set<string>();
  const out: [number, number][] = [];
  const add = (i: number, j: number) => {
    if (i === j || seen.has(key(i, j))) return;
    seen.add(key(i, j));
    out.push(i < j ? [i, j] : [j, i]);
  };
  const far = (Math.hypot(w, h) * 0.3) ** 2;
  for (let i = 0; i < n; i++) {
    const near = Array.from({ length: n }, (_, j) => j)
      .filter((j) => j !== i)
      .sort((a, b) => d2(i, a) - d2(i, b))
      .slice(0, nodes[i].hub ? 4 : 2);
    for (const j of near) if (d2(i, j) < far) add(i, j);
  }
  // Prim's tree, so nothing floats alone
  if (n > 1) {
    const inTree = new Array(n).fill(false);
    const best = new Array(n).fill(Infinity);
    const from = new Array(n).fill(-1);
    best[0] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      inTree[u] = true;
      if (from[u] >= 0) add(u, from[u]);
      for (let v = 0; v < n; v++) {
        if (inTree[v]) continue;
        const d = d2(u, v);
        if (d < best[v]) {
          best[v] = d;
          from[v] = u;
        }
      }
    }
  }
  return out;
}

// ── the scene ────────────────────────────────────────────────────────

export interface SceneOptions {
  w: number;
  h: number;
  seed?: number;
}

/** Everything the opening draws, for a viewport of w × h CSS pixels. */
export function buildScene({ w, h, seed = 20261029 }: SceneOptions): Scene {
  const T = TIMELINE;
  const rand = rng(seed);
  const phone = w < 600;
  const unit = Math.max(0.6, Math.min(1.4, Math.min(w, h) / 860));
  // the room kept for the line and the field beneath it
  const words = { x: w / 2, y: h * (phone ? 0.45 : 0.48), rx: phone ? w * 0.56 : Math.min(w * 0.42, 620), ry: phone ? h * 0.19 : Math.min(h * 0.21, 190) };
  const { chat, shapes, wave } = chatShapes(w, h, words);

  // the grains, as dense as the screen allows
  const cap = phone ? 1300 : 2200;
  let step = phone ? 3.2 : 3;
  let spots = shapes.flatMap((s) => grainsOf(s, step));
  // wider spacing until it fits (the small shapes keep a floor of grains, so once may not be enough)
  for (let i = 0; spots.length > cap && i < 12; i++) {
    step *= Math.max(1.02, spots.length / cap);
    spots = shapes.flatMap((s) => grainsOf(s, step));
  }
  if (spots.length > cap) spots = spots.filter((_, i) => i % Math.ceil(spots.length / cap) === 0);

  // the nodes, and when each lights
  const count = phone ? 38 : w > 1600 ? 72 : 64;
  const pts = placeNodes(w, h, count, words, rand);
  const nodes: Node[] = pts.map(([x, y]) => {
    const hub = rand() < 0.12;
    return {
      x,
      y,
      hub,
      side: rand() < 0.5 ? -1 : 1,
      r: hub ? 3 + rand() * 1.4 : 1.3 + rand() * 1.1,
      form: Infinity,
      amp: (2 + rand() * 4) * unit,
      w1: 0.18 + rand() * 0.22,
      w2: 0.16 + rand() * 0.24,
      p1: rand() * Math.PI * 2,
      p2: rand() * Math.PI * 2,
      depth: 0.006 + rand() * 0.018,
    };
  });

  // each grain to a node in its own direction from the chat, so the window opens outward
  const cx = chat.x + chat.w / 2;
  const cy = chat.y + chat.h / 2;
  const angle = (x: number, y: number) => Math.atan2(y - cy, x - cx);
  const nodeAngles = nodes.map((n) => angle(n.x, n.y));
  const maxDist = Math.max(...spots.map(([x, y]) => Math.hypot(x - wave.x, y - wave.y)), 1);
  const grains: Grain[] = spots.map(([ox, oy]) => {
    let node = -1;
    if (nodes.length) {
      const a = angle(ox, oy);
      const near = nodeAngles
        .map((na, i) => [Math.abs(Math.atan2(Math.sin(na - a), Math.cos(na - a))), i] as [number, number])
        .sort((p, q) => p[0] - q[0])
        .slice(0, 6);
      node = near[Math.floor(rand() * near.length)][1];
    }
    let ux = ox - wave.x;
    let uy = oy - wave.y;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    // a short, even burst away from the dying voice — so a stroke leaves as a thread, not a spray
    const burst = (42 + rand() * 40) * unit;
    const sway = (rand() * 2 - 1) * 14 * unit;
    const release = T.dissolve + (ul / maxDist) * T.wave + rand() * 0.14;
    const travel = T.travel[0] + rand() * (T.travel[1] - T.travel[0]);
    return {
      ox,
      oy,
      node,
      release,
      travel,
      c1x: ox + ux * burst - uy * sway,
      c1y: oy + uy * burst + ux * sway,
      side: node >= 0 ? nodes[node].side : 1,
      bow: 0.17 + rand() * 0.12,
      wob: (2 + rand() * 4) * unit,
      freq: 0.6 + rand() * 0.7,
      phase: rand() * Math.PI * 2,
      size: 1.15 + rand() * 0.6,
    };
  });
  for (const g of grains) if (g.node >= 0) nodes[g.node].form = Math.min(nodes[g.node].form, g.release + g.travel * 0.82);
  for (const n of nodes) if (!Number.isFinite(n.form)) n.form = T.edges + rand() * 0.9;

  const edges: Edge[] = linkNodes(nodes, w, h).map(([a, b]) => ({
    a,
    b,
    start: Math.min(T.edges + 1.4, Math.max(T.edges, Math.max(nodes[a].form, nodes[b].form) + 0.3 + rand() * 0.35)),
    strong: nodes[a].hub || nodes[b].hub,
  }));

  return { w, h, unit, chat, shapes, grains, nodes, edges, wave, words };
}

// ── where things are at time t ───────────────────────────────────────

/** A node's place at t: still until the network settles, then a slow drift (and the pointer's parallax, px/py). */
export function nodeAt(n: Node, t: number, px = 0, py = 0): { x: number; y: number } {
  const a = smooth(TIMELINE.title - 0.4, TIMELINE.settled + 0.6, t) * n.amp;
  return {
    x: n.x + Math.sin(t * n.w1 + n.p1) * a + px * n.depth,
    y: n.y + Math.cos(t * n.w2 + n.p2) * a + py * n.depth,
  };
}

/** How lit a node is at t (0–1), and its radius. */
export function nodeLight(n: Node, t: number): { alpha: number; r: number } {
  const u = smooth(n.form, n.form + 0.9, t);
  return { alpha: u, r: n.r * (0.35 + 0.65 * easeOut(u)) };
}

/**
 * A grain at t: where it is, how bright, how big. Before the interface turns
 * to grain it is not there; then it sits on the chat; once the wave reaches
 * it, it flies a curve — out from the chat, round, and into its node — and
 * fades into the node as it lands.
 */
export function grainAt(scene: Scene, g: Grain, t: number, px = 0, py = 0): { x: number; y: number; alpha: number; size: number } {
  const T = TIMELINE;
  const shown = smooth(T.grain, T.grain + 0.32, t);
  if (t <= g.release || g.node < 0) {
    const gone = g.node < 0 ? smooth(g.release, g.release + 0.8, t) : 0;
    return { x: g.ox, y: g.oy, alpha: 0.82 * shown * (1 - gone), size: g.size };
  }
  const u = clamp01((t - g.release) / g.travel);
  const s = easeInOut(u);
  const target = nodeAt(scene.nodes[g.node], t, px, py);
  // the swoop in: back from the node, bowed to one side
  const dx = target.x - g.c1x;
  const dy = target.y - g.c1y;
  const c2x = target.x - dx * 0.35 - dy * g.bow * g.side;
  const c2y = target.y - dy * 0.35 + dx * g.bow * g.side;
  const m = 1 - s;
  let x = m * m * m * g.ox + 3 * m * m * s * g.c1x + 3 * m * s * s * c2x + s * s * s * target.x;
  let y = m * m * m * g.oy + 3 * m * m * s * g.c1y + 3 * m * s * s * c2y + s * s * s * target.y;
  // a small wander, gone again by the time it lands
  const wander = Math.sin(Math.PI * u) * g.wob * Math.sin(t * g.freq * Math.PI * 2 + g.phase);
  const len = Math.hypot(dx, dy) || 1;
  x += (-dy / len) * wander;
  y += (dx / len) * wander;
  return { x, y, alpha: shown * (0.82 + 0.18 * Math.sin(Math.PI * u)) * (1 - smooth(0.78, 1, u)), size: g.size * (1 - 0.3 * u) };
}

/** How much of a link is drawn at t (0–1). */
export function edgeGrown(e: Edge, t: number): number {
  return easeOut(clamp01((t - e.start) / 0.75));
}

/**
 * The signals running along the network once it has settled: which link,
 * which way, how far along (0–1). A pure function of t, so every frame
 * agrees with the last.
 */
export function signalsAt(scene: Scene, t: number): { edge: number; along: number; reverse: boolean }[] {
  const T = TIMELINE;
  if (t < T.signals || !scene.edges.length) return [];
  const every = 0.45;
  const span = 1.7;
  const out: { edge: number; along: number; reverse: boolean }[] = [];
  const last = Math.floor((t - T.signals) / every);
  for (let k = Math.max(0, last - Math.ceil(span / every)); k <= last; k++) {
    const hk = hash(k);
    const start = T.signals + k * every + ((hk % 100) / 100) * 0.2;
    const dur = 1.1 + ((hk >>> 8) % 60) / 100;
    const along = (t - start) / dur;
    if (along < 0 || along > 1) continue;
    out.push({ edge: hash(k * 7 + 3) % scene.edges.length, along, reverse: (hk & 1) === 1 });
  }
  return out;
}

/**
 * How much of the network shows at a point, once the words are up: little
 * in the middle of them, all of it away from them. 1 before the headline.
 */
export function wordsDim(scene: Scene, x: number, y: number, t: number): number {
  const k = smooth(TIMELINE.title - 0.4, TIMELINE.title + 0.5, t);
  if (k <= 0) return 1;
  const { words } = scene;
  const e = ((x - words.x) / words.rx) ** 2 + ((y - words.y) / words.ry) ** 2;
  return 1 - k * (1 - (0.18 + 0.82 * smooth(0.15, 1.6, e)));
}

/** The chat's own opacity: whole until it turns to grain, then gone. */
export function chatAlpha(t: number): number {
  return 1 - smooth(TIMELINE.grain + 0.05, TIMELINE.grain + 0.4, t);
}
