// lib/new-logos/rep-layout.ts — WHERE A REPRESENTATION'S ITEMS SIT, the first time they are seen.
//
// An item is placed once, beside what it belongs to, and then stays where it is (or where the person moves it):
// nothing already placed is ever moved to make room. Each kind has a side of its anchor it goes to, so a
// representation reads the same way every time: the people involved above the question; what is known to its left;
// possibilities stacked in a column to its right; the answer, open questions, caveats and any model below. An open
// question about a possibility sits by that possibility. A later question starts below what is there.
//
// The positions are canvas layout (r:<item id>), saved with the rest of the canvas — presentation, never part of the
// representation itself. Pure: no I/O.

import { GAP, placeNear, withItem, type Box, type CanvasLayout } from './canvas';
import { itemById, otherEnd, type RepItem, type RepKind, type Representation } from './representation';

export const repRef = (id: string) => `r:${id}`;
export const isRepRef = (ref: string) => ref.startsWith('r:');

/** Widths by kind (plane units); heights follow the words. */
export const REP_WIDTH: Record<RepKind, number> = {
  question: 420,
  statement: 360,
  hypothesis: 250,
  observation: 280,
  entity: 160,
  unknown: 290,
  caveat: 320,
  metric: 200,
  timeline: 400,
  sequence: 360,
  document: 280,
  equation: 320,
  variable: 300,
  plot: 460,
  matrix: 460,
  diagram: 520,
  media: 360,
};

/** A fair estimate of an item's drawn size before it is measured: its width, and its words wrapped at ~7px a character. */
export function estimateSize(it: RepItem): { w: number; h: number } {
  const w = REP_WIDTH[it.kind];
  const lines = (text: string, fontW = 7.2, pad = 28) => Math.max(1, Math.ceil((text.length * fontW) / Math.max(60, w - pad)));
  switch (it.kind) {
    case 'question':
      return { w, h: 24 + lines(it.text, 9) * 26 };
    case 'entity':
      return { w, h: 40 };
    case 'metric':
      return { w, h: 84 };
    case 'timeline':
      return { w, h: 28 + it.events.length * 44 };
    case 'sequence':
      return { w, h: 36 + it.steps.reduce((n, s) => n + lines(s.text) * 20 + 10, 0) };
    case 'equation':
      return { w, h: it.prim.h || 120 };
    case 'variable':
      return { w, h: 92 };
    case 'plot':
      return { w, h: 320 };
    case 'diagram':
      return { w, h: it.prim.type === 'diagram' ? Math.max(160, ...it.prim.data.shapes.map((sh) => sh.y + sh.h + 24)) + 28 : 260 };
    case 'media':
      return { w, h: 280 };
    case 'matrix':
      return { w, h: 64 + (it.prim.type === 'table' ? it.prim.data.rows.length : 3) * 30 };
    case 'unknown':
      return { w, h: 26 + lines(it.text) * 20 + (it.answer ? lines(it.answer) * 20 + 8 : 0) };
    default:
      return { w, h: 26 + lines(it.text) * 21 };
  }
}

type Side = 'right' | 'left' | 'below' | 'above';
const SIDES: Record<RepKind, Side[]> = {
  question: ['below', 'right'],
  statement: ['below', 'right'],
  hypothesis: ['right', 'below'],
  observation: ['left', 'below'],
  entity: ['above', 'left'],
  unknown: ['below', 'right'],
  caveat: ['below', 'left'],
  metric: ['right', 'below'],
  timeline: ['below', 'right'],
  sequence: ['below', 'right'],
  document: ['left', 'below'],
  equation: ['below', 'right'],
  variable: ['below', 'left'],
  plot: ['below', 'right'],
  matrix: ['below', 'right'],
  diagram: ['below', 'right'],
  media: ['left', 'below'],
};

/** Places on one side of an anchor, in reading order: a column to the right or left, rows below or above. */
function* spotsBeside(a: Box, s: { w: number; h: number }, side: Side): Generator<{ x: number; y: number }> {
  const g = GAP;
  if (side === 'right') for (let c = 0; c < 3; c++) for (let r = 0; r < 10; r++) yield { x: a.x + a.w + g * 1.5 + c * (s.w + g), y: a.y + r * (s.h + g / 2) };
  if (side === 'left') for (let c = 0; c < 3; c++) for (let r = 0; r < 10; r++) yield { x: a.x - s.w - g * 1.5 - c * (s.w + g), y: a.y + r * (s.h + g / 2) };
  if (side === 'below') for (let r = 0; r < 10; r++) for (let c = 0; c < 4; c++) yield { x: a.x + c * (s.w + g / 2), y: a.y + a.h + g + r * (s.h + g / 2) };
  if (side === 'above') for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) yield { x: a.x + c * (s.w + g / 2), y: a.y - s.h - g - r * (s.h + g / 2) };
}

/**
 * What a new item belongs beside: the item the assistant named; for an open question or a piece of evidence, the
 * possibility it bears on; otherwise the question it is connected to, or the latest question; otherwise anything it
 * is connected to. Only items already placed count.
 */
export function anchorFor(rep: Representation, id: string, near: ReadonlyMap<string, string>, placed: (id: string) => boolean): string | null {
  const it = itemById(rep, id);
  if (!it) return null;
  const n = near.get(id);
  if (n && n !== id && placed(n)) return n;
  const linked = rep.relations.filter((r) => r.from === id || r.to === id).map((r) => otherEnd(r, id)).filter(placed);
  const kindOf = (x: string) => itemById(rep, x)?.kind;
  if (it.kind === 'unknown' || it.kind === 'observation') {
    const h = linked.find((x) => kindOf(x) === 'hypothesis');
    if (h && it.kind === 'unknown') return h;
  }
  const q = linked.find((x) => kindOf(x) === 'question');
  if (q) return q;
  const qs = rep.items.filter((i) => i.kind === 'question' && i.id !== id && placed(i.id));
  if (qs.length && it.kind !== 'question') return qs[qs.length - 1].id;
  return linked[0] ?? (qs.length ? qs[qs.length - 1].id : null);
}

/**
 * Places for the items in `ids` that have none, in the representation's order, each beside its anchor on its kind's
 * side, never over anything already on the canvas (of any kind). Deterministic: the same inputs give the same places.
 */
export function placeRep(
  layout: CanvasLayout,
  rep: Representation,
  ids: readonly string[],
  near: readonly [string, string][],
  sizeOf: (ref: string) => { w: number; h: number },
  origin: { x: number; y: number } = { x: 0, y: 0 }
): CanvasLayout {
  let next = layout;
  const want = new Set(ids);
  const nearMap = new Map(near);
  const boxes: Box[] = Object.entries(layout.items).map(([ref, it]) => ({ x: it.x, y: it.y, ...sizeOf(ref) }));
  const free = (b: Box) => !boxes.some((o) => b.x < o.x + o.w + GAP / 2 && o.x < b.x + b.w + GAP / 2 && b.y < o.y + o.h + GAP / 2 && o.y < b.y + b.h + GAP / 2);
  const placed = (id: string) => !!next.items[repRef(id)];
  for (const it of rep.items) {
    if (!want.has(it.id) || placed(it.id)) continue;
    const ref = repRef(it.id);
    const size = sizeOf(ref);
    let spot: { x: number; y: number } | null = null;
    const anchor = anchorFor(rep, it.id, nearMap, placed);
    if (anchor) {
      const at = next.items[repRef(anchor)];
      const a = { x: at.x, y: at.y, ...sizeOf(repRef(anchor)) };
      for (const side of SIDES[it.kind]) {
        for (const p of spotsBeside(a, size, side))
          if (free({ ...p, ...size })) {
            spot = p;
            break;
          }
        if (spot) break;
      }
      if (!spot) spot = placeNear(next, { x: a.x + a.w + GAP, y: a.y }, size, sizeOf);
    } else if (!boxes.length) {
      spot = origin;
    } else {
      // a new beginning: below everything there is, at its left edge
      const minX = Math.min(...boxes.map((b) => b.x));
      const maxY = Math.max(...boxes.map((b) => b.y + b.h));
      spot = placeNear(next, { x: minX, y: maxY + GAP * 2 }, size, sizeOf);
    }
    const b = { x: Math.round(spot.x), y: Math.round(spot.y), ...size };
    boxes.push(b);
    next = withItem(next, ref, { x: b.x, y: b.y });
  }
  return next;
}
