// lib/logos5/spaceMove.ts — MOVING ABOUT THE ONE SPACE, AS ON THE UNIVERSAL MAP (Logos 5.5).
//
// The canvas of a line of thinking (components/logos5/L5Space.tsx) moves the way the Universal Map does: drag the
// empty space to move around it, drag a card to put it somewhere else, Shift-drag to choose several and move them
// together, arrows to go from card to card, Shift and the arrows to move the view, Alt and the arrows to move a card,
// + and − to zoom, 0 to fit. Where a card was put is kept for that conversation, on this device, until "Put back".
//
// These are the rules, kept pure so tests can hold them; the component only measures and draws.

import { nearestWay, type Way } from './universe';

/** How far a card has been put from where the space laid it out, in the space's own units (100%). */
export interface Offset {
  x: number;
  y: number;
}
/** Every card put somewhere else, by its key in the space (`n:` an idea, `c:` brought, `m:` made, the open idea). */
export type Moved = Record<string, Offset>;

export const SPACE_MOVE = {
  /** Shift and an arrow move the view this far (as the Universal Map's KEY_PAN) */
  keyPan: 60,
  /** Alt and an arrow move a card this far; with Shift as well, four times */
  nudge: 16,
  /** a card is never put above or left of the space's corner, where nothing can scroll to it */
  margin: 8,
  /** how far a card can be put at all, so a stored value can never throw the space into the distance */
  reach: 20000,
  /** a stored arrangement keeps at most this many cards */
  most: 400,
  /** a touch held this long on a card picks it up; moved sooner, the space moves */
  holdMs: 380,
} as const;

/** Where a conversation's arrangement is kept on this device. */
export const movedStoreKey = (conversationId: string) => `socria.l5.space-moved.v1:${conversationId}`;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const tidy = (v: number) => Math.round(Math.max(-SPACE_MOVE.reach, Math.min(SPACE_MOVE.reach, v)));

/** What was stored, read back with care: only finite offsets under a sensible key; a card back at 0,0 is not kept. */
export function readMoved(raw: string | null | undefined): Moved {
  if (!raw) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Moved = {};
  let n = 0;
  for (const [k, o] of Object.entries(v as Record<string, unknown>)) {
    if (n >= SPACE_MOVE.most) break;
    if (!k || k.length > 200 || !o || typeof o !== 'object') continue;
    const { x, y } = o as { x?: unknown; y?: unknown };
    if (!finite(x) || !finite(y)) continue;
    const t = { x: tidy(x), y: tidy(y) };
    if (t.x === 0 && t.y === 0) continue;
    out[k] = t;
    n++;
  }
  return out;
}

/** What to store: nothing (null — the key is removed) once every card is back where it was laid out. */
export function writeMoved(m: Moved): string | null {
  const clean = readMoved(JSON.stringify(m));
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

/** These cards moved by dx, dy more. A card brought back to where it was laid out is dropped from the arrangement. */
export function moveBy(m: Moved, keys: readonly string[], dx: number, dy: number): Moved {
  if (!keys.length || (!dx && !dy) || !finite(dx) || !finite(dy)) return m;
  const out: Moved = { ...m };
  for (const k of keys) {
    const o = out[k] ?? { x: 0, y: 0 };
    const next = { x: tidy(o.x + dx), y: tidy(o.y + dy) };
    if (next.x === 0 && next.y === 0) delete out[k];
    else out[k] = next;
  }
  return out;
}

/** The shift of one card as it is drawn now: where it was put, plus the drag carrying it. */
export function shiftOf(m: Moved, key: string, drag: { keys: readonly string[]; dx: number; dy: number } | null): Offset {
  const o = m[key] ?? { x: 0, y: 0 };
  if (drag && drag.keys.includes(key)) return { x: o.x + drag.dx, y: o.y + drag.dy };
  return o;
}

/**
 * A drag held back so that no card it carries goes past the space's top or left edge (nothing can scroll there).
 * `boxes` are the carried cards' left and top as drawn now, in the space's units.
 */
export function clampDrag(dx: number, dy: number, boxes: readonly { l: number; t: number }[]): { dx: number; dy: number } {
  let minX = -Infinity;
  let minY = -Infinity;
  for (const b of boxes) {
    minX = Math.max(minX, SPACE_MOVE.margin - b.l);
    minY = Math.max(minY, SPACE_MOVE.margin - b.t);
  }
  return { dx: Math.max(dx, Math.min(0, minX)), dy: Math.max(dy, Math.min(0, minY)) };
}

/** A rectangle drawn with Shift held: the cards it touches. */
export function cardsIn(
  rect: { x0: number; y0: number; x1: number; y1: number },
  cards: readonly { key: string; l: number; t: number; r: number; b: number }[]
): string[] {
  const l = Math.min(rect.x0, rect.x1);
  const r = Math.max(rect.x0, rect.x1);
  const t = Math.min(rect.y0, rect.y1);
  const b = Math.max(rect.y0, rect.y1);
  if (r - l < 2 && b - t < 2) return [];
  return cards.filter((c) => c.r > l && c.l < r && c.b > t && c.t < b).map((c) => c.key);
}

/** An arrow from a card: the nearest card that way, straight ahead before off to the side (the Universal Map's rule). */
export function nextCard(way: Way, from: string, cards: readonly { key: string; l: number; t: number; r: number; b: number }[]): string | null {
  const box = (c: { l: number; t: number; r: number; b: number }) => ({ x: c.l, y: c.t, w: c.r - c.l, h: c.b - c.t });
  const f = cards.find((c) => c.key === from);
  if (!f) return cards[0]?.key ?? null;
  return nearestWay(way, box(f), cards.filter((c) => c.key !== from).map((c) => ({ id: c.key, ...box(c) })));
}

/** What an arrow key means in the space: go to a card, move the view, or move the card. */
export function arrowIntent(key: string, mods: { shiftKey: boolean; altKey: boolean }, onCard: boolean): { kind: 'card'; way: Way } | { kind: 'pan'; dx: number; dy: number } | { kind: 'nudge'; dx: number; dy: number } | null {
  const ways: Record<string, Way> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const way = ways[key];
  if (!way) return null;
  const ux = way === 'left' ? -1 : way === 'right' ? 1 : 0;
  const uy = way === 'up' ? -1 : way === 'down' ? 1 : 0;
  if (mods.altKey && onCard) {
    const s = SPACE_MOVE.nudge * (mods.shiftKey ? 4 : 1);
    return { kind: 'nudge', dx: ux * s, dy: uy * s };
  }
  // the view moves the way the arrow points: what is that way comes into view
  if (mods.shiftKey || !onCard) return { kind: 'pan', dx: ux * SPACE_MOVE.keyPan, dy: uy * SPACE_MOVE.keyPan };
  return { kind: 'card', way };
}

/** The distance between two pointers (a pinch). */
export const spread = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
