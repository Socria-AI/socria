// lib/logos5/seeds.ts — IDEAS TO EXPLORE, IN AN EMPTY LINE OF THINKING.
//
// A new line of thinking opens on a small mind map rather than a blank box:
// a centre ("A new line of thinking") and a few clusters of ideas around it,
// drawn as bubbles (components/logos5/IdeaSeeds.tsx). Pressing one puts its
// question in the chatbox, to be made their own — never sent by itself (the
// same rule as the starters, lib/starters.ts).
//
// Where the ideas come from, most personal first, all deterministic and free:
//   1. LEFT OPEN — a map's unfinished business from their other lines of
//      thinking: an open question, a tension, an assumption never tested.
//   2. GO FURTHER — what they have been thinking about lately, taken a step on.
//   3. SOMETHING NEW — a few big questions and everyday ones, a different few
//      each day, so the map never empties of a way to start.
//
// Pure: no React, no clock (the day is a parameter).

import { isSentence, pendingOpener, topicOf } from '../starters';

export type SeedKind = 'open' | 'further' | 'new';

export interface Seed {
  /** what the bubble says — short */
  label: string;
  /** what goes into the chatbox when it is pressed */
  prompt: string;
  kind: SeedKind;
}

export interface SeedGroup {
  kind: SeedKind;
  name: string;
  seeds: Seed[];
}

export interface SeedInput {
  /** unfinished business on their other maps */
  pending?: { label: string; type: string; updatedAt?: number }[];
  /** their other lines of thinking, by name */
  recent?: { title: string; updatedAt?: number }[];
  /** days since the epoch, to turn the fresh ideas over each day */
  day: number;
}

/** Big questions and everyday ones: a short label for the bubble, the question it asks. */
export const FRESH: readonly [string, string][] = [
  ['Why prices rise', 'Why do prices rise even when nothing about the product changes?'],
  ['What makes an argument convincing', 'What actually makes an argument convincing, rather than just confident?'],
  ['A decision I keep putting off', 'Help me think through a decision I keep putting off.'],
  ['Why we forget what we study', 'How does memory work, and why do we forget what we studied?'],
  ['Is maths invented or discovered?', 'Is maths invented or discovered?'],
  ['The best case against my view', 'Take something I believe and make the strongest case against it.'],
  ['Learning something hard, faster', 'What is the fastest honest way to learn something hard?'],
  ['Why the Roman Republic fell', 'Why did the Roman Republic fall?'],
  ['What a good life needs', 'What does a good life actually need?'],
  ['How a vaccine teaches the body', 'How does a vaccine teach the body to fight something it has never met?'],
  ['Free will and physics', 'Is free will compatible with physics?'],
  ['A hard week, planned', 'Help me plan a hard week without burning out.'],
  ['What makes writing clear', 'What makes a piece of writing clear?'],
  ['Why some ideas spread', 'Why do some ideas spread and others don’t?'],
  ['The edge of a black hole', 'What happens at the edge of a black hole?'],
  ['Is it worth the cost?', 'Help me work out whether something I want to do is worth what it costs.'],
  ['What decides a wage', 'What decides how much a job pays?'],
  ['What the trolley problem shows', 'What does the trolley problem actually show?'],
];

const MAX_LABEL = 44;

function clip(s: string, max = MAX_LABEL): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\-\s]+$/, '')}…`;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const UNNAMED = /^(new (thought session|line of thinking|chat|conversation)|untitled|conversation|chat|discussion|session)$/i;

/** The fresh ideas for a day: `n` of them, turned over daily, never the same one twice in a day. */
export function freshFor(day: number, n: number): Seed[] {
  const out: Seed[] = [];
  const start = ((Math.floor(day) * 5) % FRESH.length + FRESH.length) % FRESH.length;
  for (let i = 0; i < Math.min(n, FRESH.length); i++) {
    const [label, prompt] = FRESH[(start + i * 7) % FRESH.length];
    if (out.some((s) => s.label === label)) continue;
    out.push({ label, prompt, kind: 'new' });
  }
  return out;
}

/** The groups for an empty line of thinking: at most three, at most eight bubbles in all. */
export function buildSeeds(input: SeedInput): SeedGroup[] {
  const seen = new Set<string>();
  const fresh = (k: string) => {
    if (!k || seen.has(k)) return false;
    for (const s of seen) if (s.includes(k) || k.includes(s)) return false;
    seen.add(k);
    return true;
  };

  const open: Seed[] = [];
  for (const n of [...(input.pending ?? [])].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))) {
    if (open.length >= 3) break;
    const prompt = pendingOpener(n.type, n.label ?? '');
    if (!prompt || !fresh(key(n.label))) continue;
    open.push({ label: clip(n.label), prompt, kind: 'open' });
  }

  const further: Seed[] = [];
  for (const r of [...(input.recent ?? [])].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))) {
    if (further.length >= 2) break;
    const title = (r.title ?? '').trim();
    if (!title || UNNAMED.test(title)) continue;
    const asked = isSentence(title);
    const topic = asked ? topicOf(title) : title;
    if (!topic || !fresh(key(topic))) continue;
    // the bubble says it as they did ("Can I afford to move out?", not "afford to move out")
    further.push({
      label: clip(title),
      prompt: asked
        ? `I asked “${title}” before. What is the question about it I haven’t asked yet?`
        : `I’ve been thinking about “${title.replace(/[.!]+$/, '')}”. What is the question about it I haven’t asked yet?`,
      kind: 'further',
    });
  }

  const personal = open.length + further.length;
  const newCount = Math.max(3, Math.min(5, 8 - personal));
  const news = freshFor(input.day, newCount + 2).filter((s) => fresh(key(s.label))).slice(0, newCount);

  const groups: SeedGroup[] = [];
  if (open.length) groups.push({ kind: 'open', name: 'Left open', seeds: open });
  if (further.length) groups.push({ kind: 'further', name: 'Go further', seeds: further });
  // with nothing personal yet, the fresh ideas are split in two so the map still has a shape
  if (!personal && news.length > 3) {
    const half = Math.ceil(news.length / 2);
    groups.push({ kind: 'new', name: 'Big questions', seeds: news.slice(0, half) });
    groups.push({ kind: 'new', name: 'Something of your own', seeds: news.slice(half) });
  } else if (news.length) {
    groups.push({ kind: 'new', name: 'Something new', seeds: news });
  }
  return groups;
}

// ── the drawing ──────────────────────────────────────────────────────

export interface SeedSpot {
  x: number;
  y: number;
  /** diameter */
  d: number;
}

export interface SeedLayout {
  center: SeedSpot;
  groups: { name: SeedSpot & { label: string }; hub: { x: number; y: number }; bubbles: SeedSpot[] }[];
  /** the bubbles were made smaller to fit a short or narrow box: their words go a size down too */
  small: boolean;
}

/** A bubble's size from how much it says: the longer, the larger, within bounds. */
export function bubbleSize(label: string): number {
  return Math.round(Math.max(112, Math.min(156, 84 + label.length * 1.9)));
}

/** The room a group's name takes, centred on its hub: one line of the label in its pill (seeds.css). */
export function nameBox(label: string): { w: number; h: number } {
  return { w: Math.round(label.length * 8.6 + 40), h: 28 };
}

/**
 * Where everything sits in a box w × h, as a mind map: the centre in the middle, the ideas on a ring around it
 * (an ellipse as wide as the box allows), each group's ideas side by side and the groups spread evenly round the
 * ring, and each group's name in the free space between the centre and its ideas. Spacing is measured between the
 * bubbles themselves, so a long idea takes more of the ring; in a short or narrow box everything is drawn a little
 * smaller rather than crowded. Anything still touching is eased apart, and everything is kept inside the box.
 * Deterministic, so the same ideas sit in the same places.
 */
export function seedLayout(groups: readonly SeedGroup[], w: number, h: number): SeedLayout {
  const GAP = 14;
  const CLUSTER_GAP = 40;
  const cx = w / 2;
  const cy = h / 2;
  const n = groups.length;
  const base = groups.map((g) => g.seeds.map((s) => bubbleSize(s.label)));

  // A group at the side of the ring needs its name's width between the centre and its ideas; one at the top or
  // bottom, its name's height. Two groups sit at the sides; one, or three, put a group at the top or bottom.
  const widestName = Math.max(0, ...groups.map((g) => nameBox(g.name).w));
  const upright = n === 1 || n >= 3;

  // the largest scale at which the ring fits the box, top to bottom and all the way round
  type Ring = { k: number; cd: number; ds: number[][]; maxD: number; rx: number; ry: number; ts: number[] };
  let ring: Ring | null = null;
  for (const k of [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72]) {
    const cd = Math.round(Math.max(136, Math.min(190, Math.min(w, h) * 0.28 * Math.max(k, 0.9))));
    const ds = base.map((g) => g.map((d) => Math.round(d * k)));
    const maxD = Math.max(80, ...ds.flat());
    const needed = ds.flat().reduce((t, d) => t + d + GAP, 0) + n * CLUSTER_GAP;
    const ry = Math.max(cd / 2 + maxD / 2 + (upright ? 50 : 22), h / 2 - maxD / 2 - 10);
    // as wide as a side group's name needs, and as the ideas need to breathe (no more than 70% of the way round)
    const rxMax = Math.max(cd / 2 + maxD / 2 + 56, w / 2 - maxD / 2 - 10);
    let rx = Math.max(cd / 2 + maxD / 2 + widestName + 36, w * 0.22 + 80);
    while (rx < rxMax && ellipsePerimeter(rx, ry) * 0.7 < needed) rx += 8;
    rx = Math.min(rx, rxMax);
    const ts = packRing(ds, rx, ry, GAP, CLUSTER_GAP);
    const tall = ry + maxD / 2 + 8 <= h / 2;
    const round = ts !== null;
    ring = { k, cd, ds, maxD, rx, ry, ts: ts ?? squeezed(ds, GAP, CLUSTER_GAP) };
    if (tall && round) break;
  }
  const { k, cd, ds, maxD, rx, ry, ts } = ring!;
  const center: SeedSpot = { x: cx, y: cy, d: cd };
  const cr = cd / 2;
  const flat: { g: number; d: number }[] = [];
  ds.forEach((g, gi) => g.forEach((d) => flat.push({ g: gi, d })));
  const mid = (g: number) => {
    const mine = ts.filter((_, i) => flat[i].g === g);
    return mine.length ? (mine[0] + mine[mine.length - 1]) / 2 : 0;
  };
  // turn the whole ring so the first group sits where the eye starts: the top for one, the left for two, top left for more
  const want = n <= 1 ? -Math.PI / 2 : n === 2 ? Math.PI : (-5 * Math.PI) / 6;
  const turn = n ? want - mid(0) : 0;
  const at = (t: number) => ({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  const spots: (SeedSpot & { g: number })[] = flat.map((b, i) => ({ ...at(ts[i] + turn), d: b.d, g: b.g }));

  const clamp = (b: SeedSpot) => {
    b.x = Math.max(b.d / 2 + 8, Math.min(w - b.d / 2 - 8, b.x));
    b.y = Math.max(b.d / 2 + 8, Math.min(h - b.d / 2 - 8, b.y));
  };
  spots.forEach(clamp);
  const ease = (names: NameBox[]) => {
    for (let it = 0; it < 200; it++) {
      let moved = false;
      for (let i = 0; i < spots.length; i++) {
        const p = spots[i];
        for (let j = i + 1; j < spots.length; j++) {
          const q = spots[j];
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let dist = Math.hypot(dx, dy);
          const min = (p.d + q.d) / 2 + GAP;
          if (dist >= min) continue;
          if (dist < 0.01) {
            dx = Math.cos(i + j);
            dy = Math.sin(i + j);
            dist = 1;
          }
          const push = (min - dist) / 2 + 0.5;
          p.x -= (dx / dist) * push;
          p.y -= (dy / dist) * push;
          q.x += (dx / dist) * push;
          q.y += (dy / dist) * push;
          moved = true;
        }
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.max(0.01, Math.hypot(dx, dy));
        const min = cr + p.d / 2 + GAP;
        if (dist < min) {
          p.x += (dx / dist) * (min - dist + 0.5);
          p.y += (dy / dist) * (min - dist + 0.5);
          moved = true;
        }
        for (const nm of names) {
          const nx = Math.max(nm.x - nm.w / 2, Math.min(nm.x + nm.w / 2, p.x));
          const ny = Math.max(nm.y - nm.h / 2, Math.min(nm.y + nm.h / 2, p.y));
          let ex = p.x - nx;
          let ey = p.y - ny;
          let e = Math.hypot(ex, ey);
          const room = p.d / 2 + 8;
          if (e >= room) continue;
          if (e < 0.01) {
            ex = p.x - nm.x || 0.01;
            ey = p.y - nm.y || 0.01;
            e = Math.hypot(ex, ey);
            p.x += (ex / e) * (room + Math.max(nm.w, nm.h) / 2);
            p.y += (ey / e) * (room + Math.max(nm.w, nm.h) / 2);
          } else {
            p.x += (ex / e) * (room - e + 0.5);
            p.y += (ey / e) * (room - e + 0.5);
          }
          moved = true;
        }
        clamp(p);
      }
      if (!moved) break;
    }
  };
  ease([]);

  // each group's name: the free spot nearest the middle of the way from the centre to its ideas
  const placed: NameBox[] = [];
  groups.forEach((g, i) => {
    const box = nameBox(g.name);
    const mine = spots.filter((b) => b.g === i);
    const gx = mine.reduce((t, b) => t + b.x, 0) / Math.max(1, mine.length);
    const gy = mine.reduce((t, b) => t + b.y, 0) / Math.max(1, mine.length);
    const ux = gx - cx;
    const uy = gy - cy;
    const len = Math.max(1, Math.hypot(ux, uy));
    const free = (x: number, y: number) =>
      x - box.w / 2 >= 4 &&
      x + box.w / 2 <= w - 4 &&
      y - box.h / 2 >= 4 &&
      y + box.h / 2 <= h - 4 &&
      rectGap(x, y, box, cx, cy) >= cr + 10 &&
      spots.every((b) => rectGap(x, y, box, b.x, b.y) >= b.d / 2 + 8) &&
      placed.every((o) => Math.abs(o.x - x) >= (o.w + box.w) / 2 + 8 || Math.abs(o.y - y) >= (o.h + box.h) / 2 + 8);
    let best: NameBox | null = null;
    // along the way out (nearest the middle first), then a little to either side of it
    search: for (const side of [0, 18, -18, 36, -36, 56, -56, 80, -80, 108, -108, 140, -140]) {
      for (const f of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
        const x = cx + ux * f - (uy / len) * side;
        const y = cy + uy * f + (ux / len) * side;
        if (free(x, y)) {
          best = { x, y, ...box };
          break search;
        }
      }
    }
    if (best) return void placed.push(best);
    // none free: just clear of the centre on the way out, and the ideas make room for it
    let f = 0.3;
    while (f < 1 && rectGap(cx + ux * f, cy + uy * f, box, cx, cy) < cr + 10) f += 0.02;
    placed.push({ x: cx + ux * f, y: cy + uy * f, ...box, forced: true });
  });
  if (placed.some((p) => p.forced)) ease(placed);

  const round = (b: SeedSpot): SeedSpot => ({ x: Math.round(b.x), y: Math.round(b.y), d: b.d });
  return {
    center,
    groups: groups.map((g, i) => ({
      name: { x: Math.round(placed[i].x), y: Math.round(placed[i].y), d: 0, label: g.name },
      hub: { x: Math.round(placed[i].x), y: Math.round(placed[i].y) },
      bubbles: spots.filter((b) => b.g === i).map(round),
    })),
    small: k < 0.9 || maxD < 100,
  };
}

type NameBox = { x: number; y: number; w: number; h: number; forced?: boolean };

/** Ramanujan's approximation of an ellipse's perimeter. */
function ellipsePerimeter(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/** The angle past t at which the ring is `need` away, in a straight line, from where it is at t. */
function ringStep(t: number, need: number, rx: number, ry: number): number {
  const px = Math.cos(t) * rx;
  const py = Math.sin(t) * ry;
  let u = t;
  for (let k = 0; k < 3600; k++) {
    u += 0.002;
    if (Math.hypot(Math.cos(u) * rx - px, Math.sin(u) * ry - py) >= need) break;
  }
  return u;
}

/** Every idea round the ring, packed group by group, with what is left over shared between the groups; null if they do not go round. */
function packRing(ds: number[][], rx: number, ry: number, gap: number, clusterGap: number): number[] | null {
  const flat: { g: number; d: number }[] = [];
  ds.forEach((g, gi) => g.forEach((d) => flat.push({ g: gi, d })));
  if (!flat.length) return [];
  const ts: number[] = [0];
  for (let i = 1; i < flat.length; i++) {
    const prev = flat[i - 1];
    ts.push(ringStep(ts[i - 1], (prev.d + flat[i].d) / 2 + gap + (prev.g !== flat[i].g ? clusterGap : 0), rx, ry));
  }
  const n = ds.filter((g) => g.length).length;
  const last = flat[flat.length - 1];
  const closing = n > 1 ? ringStep(ts[ts.length - 1], (last.d + flat[0].d) / 2 + gap + clusterGap, rx, ry) - ts[ts.length - 1] : 0;
  const used = ts[ts.length - 1] + closing;
  if (used > Math.PI * 2) return null;
  if (n > 1) {
    const share = (Math.PI * 2 - used) / n;
    for (let i = 0; i < ts.length; i++) ts[i] += flat[i].g * share;
  } else if (flat.length > 1) {
    // one group: its ideas spread evenly round the ring rather than bunched on one side
    return flat.map((_, i) => (i / flat.length) * Math.PI * 2);
  }
  return ts;
}

/** When nothing fits: the same order, squeezed into the ring (the easing makes the room). */
function squeezed(ds: number[][], gap: number, clusterGap: number): number[] {
  const flat = ds.flat();
  const total = flat.reduce((t, d) => t + d + gap, 0) + ds.length * clusterGap;
  let acc = 0;
  return flat.map((d) => {
    const t = (acc / total) * Math.PI * 2;
    acc += d + gap;
    return t;
  });
}

/** How far the nearest edge of a name's box (centred at x, y) is from a point. */
function rectGap(x: number, y: number, box: { w: number; h: number }, px: number, py: number): number {
  const nx = Math.max(x - box.w / 2, Math.min(x + box.w / 2, px));
  const ny = Math.max(y - box.h / 2, Math.min(y + box.h / 2, py));
  return Math.hypot(px - nx, py - ny);
}
