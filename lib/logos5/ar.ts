// lib/logos5/ar.ts — AR MODE: the Logic Map as a thing in front of you.
//
// The Logos 2 benches (app/logos2-test, app/mind-ar) proved the parts: a
// hand read as a pose and a pose as an intention (lib/hand-gestures.ts), a
// camera and MediaPipe loaded at runtime (lib/hand-tracking.ts). What they did
// not have was the person's own map, or anywhere for a move to go. This file
// is the geometry that joins them to Logos 5:
//
//   · a VIEW of the map — panned, zoomed and turned — and the two maps
//     between it and the screen, so a hand or a pointer lands on the card it
//     is over however the map has been turned;
//   · WHERE THE CARDS START: exactly where the Logic Map's graph lens has them
//     (lib/canvas-store.ts — pins first, then where the graph settled), so AR
//     Mode opens on the arrangement the person already knows, and a card put
//     down here is a pin there;
//   · ONE FRAME of hand input, decided — a carry, a pan, a two-handed zoom and
//     turn, a tap that selects — as a pure step, so what a hand does can be
//     tested by feeding it readings, the same way the benches' gestures are;
//   · how a relationship is SAID, for inspecting a card's connections.
//
// PURE. No DOM, no camera, no clock. The view is presentational (like the
// Logic Map's camera, lib/canvas.ts) and never written anywhere; positions are
// world coordinates in the graph lens's own space, so they mean the same thing
// in both views.

import type { LogosEdge, LogosNode, LogosRelation } from '../logos';
import { lensOf, type CanvasDoc } from '../canvas-store';
import { hashUnit } from '../canvas';
import { aimedAt } from '../hand-gestures';

export interface Pt {
  x: number;
  y: number;
}

/**
 * How the map is held: panned by (x, y) px from the stage's centre, zoomed by
 * k, turned by r radians. A world point p lands on the screen at
 *   centre + (x, y) + rotate(r) · (p · k)
 */
export interface ArView {
  x: number;
  y: number;
  k: number;
  r: number;
}

export const AR_ZOOM = { min: 0.25, max: 2.5 } as const;
export const HOME_VIEW: ArView = { x: 0, y: 0, k: 1, r: 0 };
/** The graph lens's spring length (components/ThinkingMap.tsx) — new cards are seeded at its spacing. */
export const SEED_SPACING = 186;

export const clampK = (k: number) => Math.max(AR_ZOOM.min, Math.min(AR_ZOOM.max, k));

const rot = (p: Pt, r: number): Pt => {
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

/** A world point on a stage of w × h. */
export function toScreen(p: Pt, v: ArView, w: number, h: number): Pt {
  const q = rot({ x: p.x * v.k, y: p.y * v.k }, v.r);
  return { x: w / 2 + v.x + q.x, y: h / 2 + v.y + q.y };
}

/** A stage point back in the world — the inverse of toScreen. */
export function toWorld(s: Pt, v: ArView, w: number, h: number): Pt {
  const q = rot({ x: s.x - w / 2 - v.x, y: s.y - h / 2 - v.y }, -v.r);
  return { x: q.x / v.k, y: q.y / v.k };
}

/** The pan that puts world point p at stage point s, for a given zoom and turn. */
function panFor(p: Pt, s: Pt, k: number, r: number, w: number, h: number): Pt {
  const q = rot({ x: p.x * k, y: p.y * k }, r);
  return { x: s.x - w / 2 - q.x, y: s.y - h / 2 - q.y };
}

export function panBy(v: ArView, dx: number, dy: number): ArView {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/** Zoom by `factor`, keeping whatever is under (sx, sy) where it is — as a wheel or a pinch does. */
export function zoomAbout(v: ArView, factor: number, sx: number, sy: number, w: number, h: number): ArView {
  if (!(factor > 0) || !Number.isFinite(factor)) return v;
  const p = toWorld({ x: sx, y: sy }, v, w, h);
  const k = clampK(v.k * factor);
  const pan = panFor(p, { x: sx, y: sy }, k, v.r, w, h);
  return { x: pan.x, y: pan.y, k, r: v.r };
}

/** Turn by `dr` radians about (sx, sy). */
export function rotateAbout(v: ArView, dr: number, sx: number, sy: number, w: number, h: number): ArView {
  if (!Number.isFinite(dr)) return v;
  const p = toWorld({ x: sx, y: sy }, v, w, h);
  const r = normAngle(v.r + dr);
  const pan = panFor(p, { x: sx, y: sy }, v.k, r, w, h);
  return { x: pan.x, y: pan.y, k: v.k, r };
}

export function normAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

/**
 * Two hands, applied: the map scaled and turned about where the hands WERE,
 * then carried to where they ARE — so the point between your hands stays
 * between your hands, which is what holding something with both hands means.
 * `mid` and `move` in stage px (the tracker's are fractions; the caller maps
 * them).
 */
export function twoHandView(
  v: ArView,
  step: { scale: number; roll: number; mid: Pt; move: Pt },
  w: number,
  h: number
): ArView {
  const before = { x: step.mid.x - step.move.x, y: step.mid.y - step.move.y };
  const p = toWorld(before, v, w, h);
  const scale = Number.isFinite(step.scale) && step.scale > 0 ? step.scale : 1;
  const k = clampK(v.k * scale);
  const r = normAngle(v.r + (Number.isFinite(step.roll) ? step.roll : 0));
  const pan = panFor(p, step.mid, k, r, w, h);
  return { x: pan.x, y: pan.y, k, r };
}

/**
 * The view that shows every point with `pad` px to spare, upright, at no more than full size — inside
 * the part of the stage nothing covers: `inset` is how much a bar along the top and a panel docked along
 * the bottom take (a phone's waitlist or intro spans the width), so no card is fitted under them.
 */
export function fitView(points: readonly Pt[], w: number, h: number, pad = 72, inset: { top?: number; bottom?: number } = {}): ArView {
  if (!points.length || w <= 0 || h <= 0) return { ...HOME_VIEW };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  const top = Math.max(0, inset.top ?? 0);
  const bottom = Math.max(0, inset.bottom ?? 0);
  const room = Math.max(60, h - top - bottom - pad * 2);
  // a card is wider than a point: leave room for the one at each edge
  const bw = Math.max(1, x1 - x0 + 220);
  const bh = Math.max(1, y1 - y0 + 90);
  const k = clampK(Math.min(1, (w - pad * 2) / bw, room / bh));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: -cx * k, y: -cy * k + (top - bottom) / 2, k, r: 0 };
}

// ── where the cards start ────────────────────────────────────────────

/**
 * Every card's starting place, in the graph lens's world coordinates — the
 * same order of preference the Logic Map itself uses (components/ThinkingMap
 * .tsx, its graph lens): where the PERSON put it (pins), else where the graph
 * came to rest (settled), else beside a neighbour already placed, else on a
 * sunflower spiral around what is there. So AR Mode opens on the arrangement
 * the person already knows, and a card new since then lands where the Logic
 * Map would put it.
 */
export function seedPositions(
  nodes: readonly Pick<LogosNode, 'id'>[],
  edges: readonly Pick<LogosEdge, 'from' | 'to'>[],
  doc: CanvasDoc | null | undefined
): { pos: Record<string, Pt>; pinned: Set<string>; remembered: Set<string> } {
  const lay = doc ? lensOf(doc, 'graph') : { pins: {} as Record<string, [number, number]>, settled: undefined };
  const pos: Record<string, Pt> = {};
  const pinned = new Set<string>();
  /** placed by the person (pinned) or by the Logic Map's own settling — an arrangement to keep, not to tidy */
  const remembered = new Set<string>();
  const waiting: string[] = [];
  for (const n of nodes) {
    const p = lay.pins[n.id];
    if (p) {
      pos[n.id] = { x: p[0], y: p[1] };
      pinned.add(n.id);
      remembered.add(n.id);
      continue;
    }
    const s = lay.settled?.[n.id];
    if (s) {
      pos[n.id] = { x: s[0], y: s[1] };
      remembered.add(n.id);
      continue;
    }
    waiting.push(n.id);
  }
  const placed = Object.values(pos);
  let cx = 0;
  let cy = 0;
  if (placed.length) {
    for (const p of placed) {
      cx += p.x;
      cy += p.y;
    }
    cx /= placed.length;
    cy /= placed.length;
  }
  let spiral = 0;
  const before = placed.length;
  for (const id of waiting) {
    const e = edges.find((x) => (x.from === id && pos[x.to]) || (x.to === id && pos[x.from]));
    const anchor = e ? pos[e.from === id ? e.to : e.from] : null;
    if (anchor) {
      const a = hashUnit(id) * Math.PI * 2;
      pos[id] = { x: anchor.x + Math.cos(a) * SEED_SPACING * 0.85, y: anchor.y + Math.sin(a) * SEED_SPACING * 0.85 };
    } else {
      const i = before + spiral++;
      const r = 96 * Math.sqrt(i + 0.5);
      const a = i * 2.399963;
      pos[id] = { x: cx + Math.cos(a) * r * 1.5, y: cy + Math.sin(a) * r };
    }
  }
  return { pos, pinned, remembered };
}

/** The room a card takes on the stage at full size, with a little air: AR Mode's cards are the Logic Map's. */
export const CARD_BOX = { w: 248, h: 100 } as const;

/**
 * Cards that would sit on top of each other, moved apart until none do.
 *
 * The Logic Map spreads its cards with a running simulation; AR Mode has no
 * simulation — it opens on the arrangement the Logic Map left (seedPositions)
 * and moves only what a hand or a pointer moves. A card that has no place
 * there yet (new since the map was last looked at, or a map never opened in
 * the Logic Map at all) is put beside a neighbour at the graph's spacing,
 * which is closer than a card is wide — so those cards, and only those, are
 * pushed apart here, each pair along whichever way they overlap least. What
 * the person placed and what the Logic Map settled stays exactly where it is:
 * an obstacle, never moved. Deterministic, so the same map opens the same way.
 */
export function separate(
  pos: Readonly<Record<string, Pt>>,
  movable: ReadonlySet<string>,
  box: { w: number; h: number } = CARD_BOX,
  rounds = 160
): Record<string, Pt> {
  const ids = Object.keys(pos).sort();
  const out: Record<string, Pt> = {};
  for (const id of ids) out[id] = { x: pos[id].x, y: pos[id].y };
  if (!ids.some((id) => movable.has(id))) return out;
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const ma = movable.has(ids[i]);
        const mb = movable.has(ids[j]);
        if (!ma && !mb) continue;
        const a = out[ids[i]];
        const b = out[ids[j]];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const ox = box.w - Math.abs(dx);
        const oy = box.h - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // two cards on one spot: part them by a direction their ids choose, so it is always the same
        if (dx === 0 && dy === 0) {
          const t = hashUnit(`${ids[i]}|${ids[j]}`) * Math.PI * 2;
          dx = Math.cos(t);
          dy = Math.sin(t);
        }
        const share = ma && mb ? 0.5 : 1;
        if (ox / box.w < oy / box.h) {
          const push = (ox + 1) * share * (dx >= 0 ? 1 : -1);
          if (ma) a.x -= push;
          if (mb) b.x += push;
        } else {
          const push = (oy + 1) * share * (dy >= 0 ? 1 : -1);
          if (ma) a.y -= push;
          if (mb) b.y += push;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

// ── one frame of hands ───────────────────────────────────────────────

/** What a hand is holding between frames. */
export type ArHold =
  | { kind: 'node'; id: string; offset: Pt }
  | { kind: 'pan'; last: Pt }
  | null;

export interface ArFrame {
  /** the first hand, as the gesture tracker read it — aim in stage px */
  one: { aim: Pt; grabbing: boolean } | null;
  /** both hands pinching: the change since the last frame, in stage px */
  both: { scale: number; roll: number; mid: Pt; move: Pt } | null;
  /** a pinch that opened again without travelling — a select — in stage px */
  tap: Pt | null;
}

export interface ArStepOut {
  view: ArView;
  hold: ArHold;
  /** a card moved this frame: where it is now, in the world */
  moved: { id: string; at: Pt } | null;
  /** a card put down this frame — the moment to keep it where it was put */
  dropped: string | null;
  /** a tap this frame: the card it selected, or null for empty space (which clears the selection) */
  select: { id: string | null } | null;
}

/**
 * A frame of hand input, decided. In order of precedence:
 *
 *   · BOTH HANDS PINCHING hold the map: it scales, turns and travels with
 *     them. Whatever one hand was carrying is put down first — two hands on
 *     the map are not also one hand on a card.
 *   · ONE HAND PINCHING picks up what it closed on: a card, which then follows
 *     the pinch (kept at the offset it was caught at, so it does not jump to
 *     the fingertips), or empty space, which pans the map.
 *   · THE PINCH OPENING puts down what it held.
 *   · A TAP — a pinch opened again without travelling — selects the card it
 *     was over, or clears the selection over empty space.
 *
 * Nothing here is destructive: carrying is undone by putting back, and a pan
 * or a zoom is only the view. Research, challenge and taking a card off the
 * map go through the gesture tracker's arm-then-thumbs-up (lib/hand-gestures
 * .ts), never through this step.
 */
export function arStep(
  view: ArView,
  hold: ArHold,
  frame: ArFrame,
  cards: readonly { id: string; x: number; y: number; world: Pt }[],
  w: number,
  h: number,
  radius = 64
): ArStepOut {
  const out: ArStepOut = { view, hold, moved: null, dropped: null, select: null };

  if (frame.both) {
    if (hold?.kind === 'node') out.dropped = hold.id;
    out.hold = null;
    out.view = twoHandView(view, frame.both, w, h);
  } else if (frame.one?.grabbing) {
    const aim = frame.one.aim;
    let held = hold;
    if (!held) {
      const over = aimedAt(cards, aim, radius);
      if (over) {
        const at = toWorld(aim, view, w, h);
        held = { kind: 'node', id: over.id, offset: { x: over.world.x - at.x, y: over.world.y - at.y } };
      } else {
        held = { kind: 'pan', last: aim };
      }
    }
    if (held.kind === 'node') {
      const at = toWorld(aim, view, w, h);
      out.moved = { id: held.id, at: { x: at.x + held.offset.x, y: at.y + held.offset.y } };
      out.hold = held;
    } else {
      out.view = panBy(view, aim.x - held.last.x, aim.y - held.last.y);
      out.hold = { kind: 'pan', last: aim };
    }
  } else {
    if (hold?.kind === 'node') out.dropped = hold.id;
    out.hold = null;
  }

  if (frame.tap) {
    const over = aimedAt(cards, frame.tap, radius);
    out.select = { id: over?.id ?? null };
  }
  return out;
}

/**
 * Where a point in the camera's frame (MediaPipe's 0…1) is on the stage, when
 * the video is drawn object-fit: cover and mirrored for a front camera — the
 * same mapping app/mind-ar uses, so a fingertip lands on what it is in front
 * of.
 */
export function videoToStage(
  p: Pt,
  video: { w: number; h: number },
  stage: { w: number; h: number },
  mirror: boolean
): Pt {
  const vw = video.w || 1;
  const vh = video.h || 1;
  const s = Math.max(stage.w / vw, stage.h / vh);
  const ox = (stage.w - vw * s) / 2;
  const oy = (stage.h - vh * s) / 2;
  return { x: ox + (mirror ? 1 - p.x : p.x) * vw * s, y: oy + p.y * vh * s };
}

// ── how a relationship is said ───────────────────────────────────────

/** Each relation read from either end: [from the source's side, from the target's side]. */
export const RELATION_WORDS: Record<LogosRelation, [string, string]> = {
  supports: ['supports', 'is supported by'],
  conflicts: ['conflicts with', 'conflicts with'],
  depends: ['depends on', 'is what this rests on for'],
  relates: ['relates to', 'relates to'],
  leads_to: ['leads to', 'follows from'],
  revises: ['revises', 'is revised by'],
  precedes: ['comes before', 'comes after'],
  part_of: ['is part of', 'contains'],
  transforms_to: ['becomes', 'comes from'],
  implies: ['implies', 'is implied by'],
  justifies: ['justifies', 'is justified by'],
  equivalent_to: ['is equivalent to', 'is equivalent to'],
  applies_to: ['applies to', 'is shaped by'],
  // the universal Logic Map's connections (Logos 5): read in AR Mode the same way
  causes: ['causes', 'is caused by'],
  inhibits: ['holds back', 'is held back by'],
  is_a: ['is a kind of', 'includes'],
  flows_to: ['flows to', 'receives from'],
  becomes: ['becomes', 'comes from'],
};

export interface ArRelation {
  other: { id: string; label: string; type: string };
  relation: LogosRelation;
  /** 'out' when this card is the edge's source */
  direction: 'out' | 'in';
  /** the relation as a phrase read from this card: "supports", "is supported by" */
  phrase: string;
  op?: string;
  when?: string;
}

/** A card's connections, read from the card: what it supports, what it rests on, what pulls against it. */
export function relationsOf(
  nodes: readonly Pick<LogosNode, 'id' | 'label' | 'type'>[],
  edges: readonly LogosEdge[],
  id: string
): ArRelation[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: ArRelation[] = [];
  for (const e of edges) {
    const dir: 'out' | 'in' | null = e.from === id ? 'out' : e.to === id ? 'in' : null;
    if (!dir) continue;
    const other = byId.get(dir === 'out' ? e.to : e.from);
    if (!other) continue;
    const words = RELATION_WORDS[e.relation] ?? ['relates to', 'relates to'];
    out.push({
      other: { id: other.id, label: other.label, type: other.type },
      relation: e.relation,
      direction: dir,
      phrase: dir === 'out' ? words[0] : words[1],
      ...(e.op ? { op: e.op } : {}),
      ...(e.when ? { when: e.when } : {}),
    });
  }
  // what pulls against it first — that is what inspecting a claim is for — then what holds it up
  const rank = (r: ArRelation) => (r.relation === 'conflicts' ? 0 : r.relation === 'supports' || r.relation === 'justifies' ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** The words a person reads for each move AR Mode offers on a card (lib/hand-gestures.ts GESTURE + Logos 5's own). */
export const AR_HELP: { gesture: string; does: string }[] = [
  { gesture: 'Pinch a card', does: 'Pick it up and move it. Open your fingers to put it down — it stays there in the Logic Map too.' },
  { gesture: 'Quick pinch', does: 'Select a card to inspect it: what it is, what it supports, what pulls against it.' },
  { gesture: 'Pinch empty space', does: 'Move the whole map.' },
  { gesture: 'Pinch with both hands', does: 'Pull apart or together to zoom; turn your hands to rotate.' },
  { gesture: 'Two fingers at a card', does: 'Ask to research it. Thumbs up to do it.' },
  { gesture: 'Three fingers', does: 'Ask to challenge it. Thumbs up to do it.' },
  { gesture: 'Closed hand', does: 'Ask to take it off the map. Nothing goes until you give a thumbs up; an open hand calls it off.' },
];

/**
 * The map the preview shows a visitor who has none of their own yet — the
 * Logos 2 bench's decision (app/logos2-test), in Logos 5's shapes. Labelled a
 * sample wherever it is shown; never kept, never sent.
 */
export const AR_SAMPLE: { nodes: LogosNode[]; edges: LogosEdge[] } = {
  nodes: [
    { id: 'g', type: 'decision', label: 'Take the Berlin role?' },
    { id: 'b1', type: 'belief', label: 'I have felt unchallenged for a year' },
    { id: 'a1', type: 'assumption', label: 'The offer is what opened the question' },
    { id: 'e1', type: 'evidence', label: 'Two friends moved and stayed' },
    { id: 'c1', type: 'tension', label: 'Smaller team, bigger say' },
    { id: 'q1', type: 'question', label: 'Which of these is actually deciding?' },
  ],
  edges: [
    { from: 'b1', to: 'g', relation: 'supports' },
    { from: 'a1', to: 'g', relation: 'relates' },
    { from: 'e1', to: 'b1', relation: 'supports' },
    { from: 'c1', to: 'g', relation: 'conflicts' },
    { from: 'q1', to: 'a1', relation: 'applies_to' },
  ],
};
