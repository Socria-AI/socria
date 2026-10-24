// lib/logos5/contentBoard.ts — THE CONTENT VIEW'S CANVAS.
//
// Alex Tran: Content is not a rigid grid of blocks. Its cards — the
// documents, notes and sources brought to a line of thinking — are placed by
// hand: dragged anywhere on the canvas, reordered by being moved, and nested
// by being dropped onto one another (a stack). Every one of those moves has a
// keyboard and menu equivalent in the component; this file is only the model.
//
// Where they are is this person's arrangement, on this device, per line of
// thinking — like the Universal Map's arrangement. The documents themselves
// are not touched.
//
// Pure (storage is passed in).

export interface Spot {
  x: number;
  y: number;
}

export interface Stack {
  id: string;
  /** card ids, top first */
  items: string[];
}

export interface Board {
  v: 1;
  pos: Record<string, Spot>;
  stacks: Stack[];
}

export const EMPTY_BOARD: Board = { v: 1, pos: {}, stacks: [] };

export const CARD = { w: 232, h: 132, gap: 20 } as const;
const GRID = 8;
const KEY = 'socria.logos5.content.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const snap = (n: number) => Math.max(0, Math.round(n / GRID) * GRID);
const okId = (s: unknown): s is string => typeof s === 'string' && /^[\w.:#-]{1,120}$/.test(s);

export function sanitizeBoard(raw: unknown): Board {
  if (!raw || typeof raw !== 'object') return EMPTY_BOARD;
  const r = raw as { pos?: unknown; stacks?: unknown };
  const pos: Record<string, Spot> = {};
  if (r.pos && typeof r.pos === 'object') {
    for (const [k, v] of Object.entries(r.pos as Record<string, unknown>).slice(0, 400)) {
      const p = v as { x?: unknown; y?: unknown } | null;
      if (okId(k) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) pos[k] = { x: snap(Number(p.x)), y: snap(Number(p.y)) };
    }
  }
  const seen = new Set<string>();
  const stacks: Stack[] = [];
  for (const s of Array.isArray(r.stacks) ? r.stacks.slice(0, 100) : []) {
    const st = s as { id?: unknown; items?: unknown } | null;
    if (!st || !okId(st.id) || !Array.isArray(st.items)) continue;
    const items = st.items.filter((x): x is string => okId(x) && !seen.has(x));
    items.forEach((x) => seen.add(x));
    if (items.length >= 2) stacks.push({ id: st.id, items });
  }
  return { v: 1, pos, stacks };
}

export function readBoard(storage: StorageLike | null | undefined, session: string): Board {
  try {
    const all = JSON.parse(storage?.getItem(KEY) || '{}') as Record<string, unknown>;
    return sanitizeBoard(all?.[session]);
  } catch {
    return EMPTY_BOARD;
  }
}

export function writeBoard(storage: StorageLike | null | undefined, session: string, board: Board): void {
  try {
    const all = JSON.parse(storage?.getItem(KEY) || '{}') as Record<string, unknown>;
    const next: Record<string, unknown> = { ...(all && typeof all === 'object' ? all : {}), [session]: board };
    // the newest few dozen lines of thinking only
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete next[k];
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a full or blocked storage keeps the arrangement for this visit only */
  }
}

/** The stack a card is in, if any. */
export function stackOf(board: Board, id: string): Stack | null {
  return board.stacks.find((s) => s.items.includes(id)) ?? null;
}

/** Only cards that still exist: a document taken away takes its place and its stacking with it. */
export function prune(board: Board, ids: readonly string[]): Board {
  const live = new Set(ids);
  const pos = Object.fromEntries(Object.entries(board.pos).filter(([k]) => live.has(k)));
  const stacks = board.stacks.map((s) => ({ ...s, items: s.items.filter((x) => live.has(x)) })).filter((s) => s.items.length >= 2);
  return { v: 1, pos, stacks };
}

export interface Placed {
  /** a card, or a stack drawn as its top card */
  id: string;
  x: number;
  y: number;
  /** the stack it stands for, when it is one */
  stack?: Stack;
}

/**
 * Where everything is drawn: cards placed by hand where they were put; the
 * rest in reading order, left to right, wrapping at the canvas width, below
 * anything placed. A stack is drawn once, where its top card is.
 */
export function placeAll(board: Board, ids: readonly string[], width: number): Placed[] {
  const inStack = new Map<string, Stack>();
  for (const s of board.stacks) for (const x of s.items) inStack.set(x, s);
  const out: Placed[] = [];
  const drawn = new Set<string>();
  const cols = Math.max(1, Math.floor((Math.max(width, CARD.w) + CARD.gap) / (CARD.w + CARD.gap)));
  let floor = 0;
  for (const p of Object.values(board.pos)) floor = Math.max(floor, p.y + CARD.h + CARD.gap);
  let k = 0;
  for (const id of ids) {
    const s = inStack.get(id);
    const key = s ? s.items[0] : id;
    if (drawn.has(key)) continue;
    drawn.add(key);
    const at = board.pos[key] ?? (s ? s.items.map((x) => board.pos[x]).find(Boolean) : undefined);
    if (at) out.push({ id: key, x: at.x, y: at.y, ...(s ? { stack: s } : {}) });
    else {
      out.push({ id: key, x: (k % cols) * (CARD.w + CARD.gap), y: floor + Math.floor(k / cols) * (CARD.h + CARD.gap), ...(s ? { stack: s } : {}) });
      k++;
    }
  }
  return out;
}

/** A card put somewhere: on the grid, never off the canvas's top or left. A stack moves as one. */
export function moveTo(board: Board, id: string, x: number, y: number): Board {
  const s = stackOf(board, id);
  const pos = { ...board.pos };
  for (const x2 of s ? s.items : [id]) delete pos[x2];
  pos[s ? s.items[0] : id] = { x: snap(x), y: snap(y) };
  return { ...board, pos };
}

/** A card moved by a step — the keyboard's way of dragging. */
export function nudge(board: Board, id: string, at: Spot, dx: number, dy: number): Board {
  return moveTo(board, id, at.x + dx, at.y + dy);
}

/**
 * A card dropped onto another: nested. Onto a stack, it joins on top; onto a
 * single card, the two become a stack where the target stood. A card is in one
 * stack at a time.
 */
export function stackOnto(board: Board, card: string, target: string): Board {
  if (card === target) return board;
  const into = stackOf(board, target);
  if (into?.items.includes(card)) return board;
  // out of wherever it was
  let stacks = board.stacks.map((s) => ({ ...s, items: s.items.filter((x) => x !== card) })).filter((s) => s.items.length >= 2);
  const pos = { ...board.pos };
  delete pos[card];
  const anchor = into ? into.items[0] : target;
  const where = pos[anchor];
  if (into) {
    stacks = stacks.map((s) => (s.id === into.id ? { ...s, items: [card, ...s.items] } : s));
  } else {
    stacks = [...stacks, { id: `st_${target}`, items: [card, target] }];
  }
  if (where) {
    delete pos[anchor];
    pos[card] = where;
  }
  return { v: 1, pos, stacks };
}

/** Taken out of its stack, and set down beside it. */
export function unstack(board: Board, card: string, beside?: Spot): Board {
  const s = stackOf(board, card);
  if (!s) return board;
  const rest = s.items.filter((x) => x !== card);
  const pos = { ...board.pos };
  const top = pos[s.items[0]];
  if (s.items[0] === card && top && rest[0]) {
    delete pos[card];
    pos[rest[0]] = top;
  }
  const at = beside ?? top;
  if (at) pos[card] = { x: snap(at.x + CARD.w + CARD.gap), y: snap(at.y) };
  const stacks = board.stacks.map((x) => (x.id === s.id ? { ...x, items: rest } : x)).filter((x) => x.items.length >= 2);
  return { v: 1, pos, stacks };
}
