// lib/logos5/oneView.ts — ONE BOARD. THE CHATBOX IS THE CHAT. (Logos 5, VIII · One view.)
//
// On a wide screen a line of thinking is one board, built on the canvas
// (lib/logos5/canvas.ts, components/logos5/L5Board.tsx): the conversation runs
// down the middle, what each turn brought or made sits beside it, wired to its
// turn, and the Logic Map is one card pinned on the left that lights the ideas
// of the turn being read. The newest reply opens in full above the chatbox;
// any turn can be read there. The tabs no longer swap views: they move the
// board's camera. Split View opens one thing large beside the board.
//
// The screen's own rules (lib/logos5/views.ts: what a sent turn does, what
// something made does, a view chosen) are kept as they are — the phone still
// lives by them — and read here: the view they choose is where the camera
// looks. What sits beside the board is the board's own, put there by Split
// View or by opening something; never the conversation, which is the chatbox.

import type { BesideId, Viewport } from './views';

/** Where the board's camera looks: the conversation, what was brought, what was made, the ideas. */
export type Camera = Viewport;

/** The parts of the board a camera brings forward. */
export type BoardPart = 'turns' | 'content' | 'artifacts' | 'map';

/** One view is a wide screen's way of showing a line of thinking that has something in it. */
export function oneViewOn(i: { narrow: boolean; line: boolean; turns: number; busy: boolean }): boolean {
  return !i.narrow && i.line && (i.turns > 0 || i.busy);
}

/** What the camera brings forward: on the conversation, everything; on a tab, its own part, and the rest steps back. */
export function forward(camera: Camera, part: BoardPart): boolean {
  if (camera === 'chat') return true;
  if (camera === 'content') return part === 'content';
  if (camera === 'artifacts') return part === 'artifacts';
  return part === 'map';
}

/** Which part a card on the board belongs to, by its tone. */
export function partOfTone(tone: string): BoardPart {
  if (tone === 'content') return 'content';
  if (tone === 'map') return 'map';
  return 'artifacts';
}

/** What may be opened beside the board: anything but the conversation, which is the chatbox. */
export function besideOnBoard(id: BesideId | Viewport | null | undefined): Exclude<BesideId, 'chat'> | null {
  return id === 'content' || id === 'artifacts' || id === 'logic_map' ? id : null;
}

/** Split View, chosen again: what was beside goes; anything else takes its place. */
export function toggleBeside(now: Exclude<BesideId, 'chat'> | null, id: BesideId | null): Exclude<BesideId, 'chat'> | null {
  const want = besideOnBoard(id);
  return !want || want === now ? null : want;
}

/** The turn the sheet reads: the one chosen, if it is there, else the newest; none when there are no turns. */
export function sheetTurn(count: number, reading: number | null): number | null {
  if (count <= 0) return null;
  return reading !== null && reading >= 0 && reading < count ? reading : count - 1;
}

/** "Turn 2 of 3" */
export function turnOfLabel(at: number, count: number): string {
  return `Turn ${at + 1} of ${count}`;
}

/** ↑ and ↓ in the sheet: up is the turn before, down the turn after; null at either end. */
export function stepTurn(at: number, count: number, dir: 'up' | 'down'): number | null {
  const next = dir === 'up' ? at - 1 : at + 1;
  return next >= 0 && next < count ? next : null;
}

/** The ideas a turn lit: the ones its question or its reply put on the Logic Map (lib/logos5/linking.ts fromMsg). */
export function litBy(turn: { askedId?: string; replyId?: string } | null | undefined, fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!turn || !fromMsg) return out;
  for (const id of [turn.askedId, turn.replyId]) if (id) for (const n of fromMsg.get(id) ?? []) out.add(n);
  return out;
}

export interface IdeaLite {
  id: string;
  type: string;
  label: string;
}

/**
 * The pinned card's ideas: the question first (it frames the rest), then the ideas the turn
 * being read lit, then the others in the map's own order — cut to `max` unless all are wanted
 * (the Logic Map tab opens all of them). `more` is how many are not shown.
 */
export function mapCardIdeas<N extends IdeaLite>(nodes: readonly N[], lit: ReadonlySet<string>, all: boolean, max = 5): { shown: N[]; more: number } {
  const question = nodes.filter((n) => n.type === 'question').slice(0, 1);
  const rest = nodes.filter((n) => !question.includes(n));
  const ordered = [...question, ...rest.filter((n) => lit.has(n.id)), ...rest.filter((n) => !lit.has(n.id))];
  const shown = all ? ordered : ordered.slice(0, Math.max(1, max));
  return { shown, more: nodes.length - shown.length };
}

/** "Pinned · turn 3 lit", "Pinned" when the turn being read lit nothing. */
export function pinnedLabel(at: number | null, lit: number): string {
  return at !== null && lit > 0 ? `Pinned · turn ${at + 1} lit` : 'Pinned';
}

/** The board's zoom: whole at first; a step at a time; fitted when something is open beside it. */
export const BOARD_ZOOM = { min: 0.5, max: 1.25, step: 0.1, start: 1, beside: 0.8 } as const;
export function clampBoardZoom(z: number): number {
  return Math.round(Math.min(BOARD_ZOOM.max, Math.max(BOARD_ZOOM.min, z)) * 100) / 100;
}
/** The zoom at which a board `boardWidth` wide fits `room`, never closer than whole. */
export function fitZoom(boardWidth: number, room: number): number {
  if (!(boardWidth > 0) || !(room > 0)) return BOARD_ZOOM.start;
  return clampBoardZoom(Math.min(1, room / boardWidth));
}

/** Under the reply, the way to what its turn made: "Live graph, beside this turn". */
export function madeLink(noun: string | null | undefined): string | null {
  const n = (noun ?? '').trim();
  return n ? `${n}, beside this turn` : null;
}
