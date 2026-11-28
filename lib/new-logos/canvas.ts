// lib/new-logos/canvas.ts — THE SPATIAL LAYER: what a workspace canvas holds, where things sit on it, and how a
// conversation's messages become objects on it.
//
// The data and its presentation are kept apart. A conversation stays one ordered list of messages in the
// conversations table (the existing application reads it as a thread); on a canvas the same messages appear as
// EXCHANGES — a person's turn and the replies to it — placed in space, moved, opened, closed and connected. Where an
// exchange or a node sits, whether it is open, and which object it was asked from, is a canvas LAYOUT: presentation,
// saved per workspace (nl_canvases), never written into a message or a node.
//
// Pure: no I/O.

import type { StoredMessage } from './convo';

// ── layout ───────────────────────────────────────────────────────────

/** Where one object sits on a canvas, whether it is open, and what it was asked from (another object's ref). */
export interface ItemLayout {
  x: number;
  y: number;
  open?: boolean;
  from?: string;
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface CanvasLayout {
  items: Record<string, ItemLayout>;
  view?: View;
}

export const EMPTY_LAYOUT: CanvasLayout = { items: {} };

/** What an object on a canvas refers to: n:<node id> or x:<exchange key>. */
export const REF_RE = /^(n|x):[A-Za-z0-9_-]{1,120}$/;
/** A canvas's key: o:<objective node id>, c:<conversation id>, or a:<artifact node id> (an artifact's camera only:
 *  where its primitives sit is part of the artifact itself). */
export const KEY_RE = /^(o|c|a):[A-Za-z0-9_-]{1,120}$/;

export const CANVAS_LIMITS = { items: 3000, coord: 1_000_000, minZoom: 0.15, maxZoom: 3 } as const;

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
  return Math.max(lo, Math.min(hi, n));
};

export function sanitizeLayout(raw: unknown): CanvasLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const src = (r.items && typeof r.items === 'object' && !Array.isArray(r.items) ? r.items : {}) as Record<string, unknown>;
  const items: Record<string, ItemLayout> = {};
  let n = 0;
  for (const [ref, v] of Object.entries(src)) {
    if (n >= CANVAS_LIMITS.items) break;
    if (!REF_RE.test(ref) || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    const it: ItemLayout = { x: Math.round(num(o.x, -CANVAS_LIMITS.coord, CANVAS_LIMITS.coord, 0)), y: Math.round(num(o.y, -CANVAS_LIMITS.coord, CANVAS_LIMITS.coord, 0)) };
    if (o.open === true) it.open = true;
    if (typeof o.from === 'string' && REF_RE.test(o.from) && o.from !== ref) it.from = o.from;
    items[ref] = it;
    n++;
  }
  const out: CanvasLayout = { items };
  const v = r.view as Record<string, unknown> | undefined;
  if (v && typeof v === 'object' && [v.x, v.y, v.k].every((x) => typeof x === 'number' && Number.isFinite(x))) {
    out.view = {
      x: Math.round(num(v.x, -CANVAS_LIMITS.coord, CANVAS_LIMITS.coord, 0)),
      y: Math.round(num(v.y, -CANVAS_LIMITS.coord, CANVAS_LIMITS.coord, 0)),
      k: Math.round(num(v.k, CANVAS_LIMITS.minZoom, CANVAS_LIMITS.maxZoom, 1) * 1000) / 1000,
    };
  }
  return out;
}

/** A layout with one object's placement changed (or removed, `null`). */
export function withItem(layout: CanvasLayout, ref: string, patch: Partial<ItemLayout> | null): CanvasLayout {
  const items = { ...layout.items };
  if (patch === null) delete items[ref];
  else {
    const was = items[ref];
    const next = { ...(was ?? { x: 0, y: 0 }), ...patch };
    if (!next.open) delete next.open;
    if (!next.from) delete next.from;
    items[ref] = next;
  }
  return { ...layout, items };
}

/** Two layouts joined: everything either holds, `mine` winning where both place the same object. */
export function mergeLayouts(theirs: CanvasLayout, mine: CanvasLayout, changed: Set<string>): CanvasLayout {
  const items = { ...theirs.items };
  for (const ref of changed) {
    if (mine.items[ref]) items[ref] = mine.items[ref];
    else delete items[ref];
  }
  return { items, ...(mine.view ? { view: mine.view } : theirs.view ? { view: theirs.view } : {}) };
}

// ── exchanges ────────────────────────────────────────────────────────

/** A person's turn and the replies to it (or replies with no turn before them, or a turn kept with no reply). */
export interface Exchange {
  key: string;
  /** position of its first message in the conversation */
  index: number;
  ask?: StoredMessage;
  replies: StoredMessage[];
}

/** The conversation's messages as exchanges, in order. Keys are the first message's id, or its position. */
export function exchangesOf(messages: readonly StoredMessage[]): Exchange[] {
  const out: Exchange[] = [];
  let cur: Exchange | null = null;
  messages.forEach((m, i) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
    const key = typeof m.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(m.id) ? m.id : `i${i}`;
    if (m.role === 'user') {
      cur = { key, index: i, ask: m, replies: [] };
      out.push(cur);
    } else if (cur) {
      cur.replies.push(m);
    } else {
      cur = { key, index: i, replies: [m] };
      out.push(cur);
    }
  });
  return out;
}

export const exchangeRef = (e: Exchange | string) => `x:${typeof e === 'string' ? e : e.key}`;
export const nodeRef = (id: string) => `n:${id}`;

// ── placing what has no place yet ───────────────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sizes objects are assumed to have before they are measured. */
export const DEFAULT_SIZE = { w: 300, h: 132 } as const;
export const GAP = 36;

const overlaps = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Places for objects that have none: each next to the object it came from when that one has a place (to its right,
 * then below, left, above, then further out), otherwise in reading order on a grid, never on top of anything already
 * placed. Deterministic: the same inputs give the same places.
 */
export function placeMissing(
  layout: CanvasLayout,
  wanted: readonly { ref: string; near?: string }[],
  sizeOf: (ref: string) => { w: number; h: number } = () => DEFAULT_SIZE,
  opts: { columns?: number; origin?: { x: number; y: number } } = {}
): CanvasLayout {
  const columns = opts.columns ?? 3;
  const origin = opts.origin ?? { x: 0, y: 0 };
  let next = layout;
  const boxes: Box[] = Object.entries(layout.items).map(([ref, it]) => ({ x: it.x, y: it.y, ...sizeOf(ref) }));
  const free = (b: Box) => !boxes.some((o) => overlaps(b, o, GAP / 2));
  let slot = 0;
  for (const { ref, near } of wanted) {
    if (next.items[ref]) continue;
    const size = sizeOf(ref);
    let placed: Box | null = null;
    const anchor = near ? next.items[near] : undefined;
    if (anchor) {
      const a = { x: anchor.x, y: anchor.y, ...sizeOf(near as string) };
      for (let ring = 0; ring < 12 && !placed; ring++) {
        const d = GAP + ring * (GAP + 40);
        const tries: Box[] = [
          { x: a.x + a.w + d, y: a.y, ...size },
          { x: a.x, y: a.y + a.h + d, ...size },
          { x: a.x + a.w + d, y: a.y + a.h + d, ...size },
          { x: a.x - size.w - d, y: a.y, ...size },
          { x: a.x, y: a.y - size.h - d, ...size },
        ];
        placed = tries.find(free) ?? null;
      }
    }
    while (!placed) {
      const col = slot % columns;
      const row = Math.floor(slot / columns);
      const b = { x: origin.x + col * (DEFAULT_SIZE.w + GAP * 2), y: origin.y + row * (DEFAULT_SIZE.h + GAP * 2), ...size };
      slot++;
      if (free(b)) placed = b;
      if (slot > 100000) placed = b;
    }
    boxes.push(placed);
    next = withItem(next, ref, { x: Math.round(placed.x), y: Math.round(placed.y), ...(near && anchor ? { from: near } : {}) });
  }
  return next;
}

/**
 * The free place nearest a point, for something about to be put there: the point itself when nothing is in the way,
 * otherwise the closest spot on widening rings around it that overlaps nothing already placed.
 */
export function placeNear(
  layout: CanvasLayout,
  at: { x: number; y: number },
  size: { w: number; h: number },
  sizeOf: (ref: string) => { w: number; h: number } = () => DEFAULT_SIZE,
  except?: string
): { x: number; y: number } {
  const boxes: Box[] = Object.entries(layout.items)
    .filter(([ref]) => ref !== except)
    .map(([ref, it]) => ({ x: it.x, y: it.y, ...sizeOf(ref) }));
  const free = (b: Box) => !boxes.some((o) => overlaps(b, o, GAP / 2));
  const start = { x: Math.round(at.x), y: Math.round(at.y) };
  if (free({ ...start, ...size })) return start;
  for (let ring = 1; ring <= 40; ring++) {
    const r = ring * 48;
    const steps = 8 + ring * 4;
    let best: { x: number; y: number; d: number } | null = null;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const c = { x: Math.round(start.x + Math.cos(a) * r), y: Math.round(start.y + Math.sin(a) * r) };
      if (free({ ...c, ...size })) {
        const d = Math.hypot(c.x - start.x, c.y - start.y);
        if (!best || d < best.d) best = { ...c, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return start;
}

/** The view that shows every box, with a margin, inside a viewport of the given size. */
export function fitView(boxes: readonly Box[], width: number, height: number, margin = 48, maxZoom = 1): View {
  if (!boxes.length || width <= 0 || height <= 0) return { x: width / 2, y: height / 3, k: 1 };
  const minX = Math.min(...boxes.map((b) => b.x)), minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)), maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const k = Math.max(CANVAS_LIMITS.minZoom, Math.min(maxZoom, (width - margin * 2) / Math.max(1, maxX - minX), (height - margin * 2) / Math.max(1, maxY - minY)));
  return { x: Math.round(width / 2 - ((minX + maxX) / 2) * k), y: Math.round(height / 2 - ((minY + maxY) / 2) * k), k: Math.round(k * 1000) / 1000 };
}

/** The point on the edge of `a` facing `b`, and the middle of the visible part of the line: for drawing a connection. */
export function connector(a: Box, b: Box): { x1: number; y1: number; x2: number; y2: number; mx: number; my: number } {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const exit = (w: number, h: number) => Math.min(Math.abs(ux) > 1e-6 ? w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? h / 2 / Math.abs(uy) : Infinity);
  const ea = Math.min(exit(a.w, a.h), len / 2), eb = Math.min(exit(b.w, b.h), len / 2);
  const x1 = ax + ux * ea, y1 = ay + uy * ea, x2 = bx - ux * eb, y2 = by - uy * eb;
  return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

/** The first line of a text, without Markdown marks, cut to `n` characters. */
export function excerpt(text: string, n = 140): string {
  const line =
    (text || '')
      .split('\n')
      .map((l) => l.replace(/^#+\s*|^[-*+]\s+|^\d+[.)]\s+|^>\s*/, '').replace(/[*_`$]/g, '').trim())
      .find(Boolean) ?? '';
  return line.length > n ? `${line.slice(0, n - 1).trimEnd()}…` : line;
}

/** A few lines of a text, for telling the assistant what an object says (the focus brief's facts). */
export function factLines(text: string, max = 4, width = 160): string[] {
  return (text || '')
    .split('\n')
    .map((l) => l.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, max)
    .map((l) => (l.length > width ? `${l.slice(0, width - 1)}…` : l));
}
