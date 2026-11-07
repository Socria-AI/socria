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

/**
 * The one view is how a line of thinking that has something in it is shown — on a wide screen as three
 * columns, on a phone as the same three side by side, swiped between (Logos 5.5). `narrow` is kept for the
 * callers that say it; it no longer decides.
 */
export function oneViewOn(i: { narrow: boolean; line: boolean; turns: number; busy: boolean }): boolean {
  return i.line && (i.turns > 0 || i.busy);
}

/** On a phone the page is three panels side by side: which one each header tab brings into view. */
export type PagePanel = 0 | 1 | 2;
export function panelOf(camera: Camera): PagePanel {
  return camera === 'logic_map' ? 0 : camera === 'chat' ? 1 : 2;
}
/** And back: the tab a swipe to a panel chooses — keeping Files or Artifacts when the third panel was already theirs. */
export function cameraOfPanel(p: PagePanel, now: Camera): Camera {
  if (p === 0) return 'logic_map';
  if (p === 1) return 'chat';
  return now === 'content' || now === 'artifacts' ? now : 'artifacts';
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

// ── Revision II: the one view set as a page ──────────────────────────

/** A turn's numeral, as the page sets it: 1 → "i", 4 → "iv", 12 → "xii". Lowercase roman; plain digits past 3999. */
export function roman(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return '';
  if (n >= 4000) return String(n);
  const table: readonly [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  let left = n;
  for (const [v, s] of table) while (left >= v) (out += s), (left -= v);
  return out;
}

/** "Reading turn iii of iii" */
export function readingLabel(at: number | null, count: number): string {
  return at === null || count <= 0 ? '' : `Reading turn ${roman(at + 1)} of ${roman(count)}`;
}

export type StepState = 'done' | 'now' | 'ahead';

/**
 * Where each step on the Logic Map stands, read from the turn being read: the
 * last step it lit is "now", the steps before it are done, the ones after it
 * are ahead (drawn dashed — they have not come up yet). With no step lit,
 * every step is done: nothing says the person is anywhere in particular.
 */
export function stepStates(steps: readonly { id: string }[], lit: ReadonlySet<string>): Map<string, StepState> {
  const out = new Map<string, StepState>();
  let now = -1;
  steps.forEach((s, i) => {
    if (lit.has(s.id)) now = i;
  });
  steps.forEach((s, i) => out.set(s.id, now < 0 || i < now ? 'done' : i === now ? 'now' : 'ahead'));
  return out;
}

/**
 * The ideas that have not come up yet when turn `at` is read: those first put
 * on the map by a later turn. They are drawn dashed. An idea no turn can be
 * traced to is never "ahead" — it is simply on the map.
 */
export function aheadOf(
  turns: readonly { askedId?: string; replyId?: string }[],
  fromMsg: ReadonlyMap<string, readonly string[]> | null | undefined,
  at: number | null
): Set<string> {
  const out = new Set<string>();
  if (!fromMsg || at === null) return out;
  const seen = new Set<string>();
  turns.forEach((t, i) => {
    for (const id of litBy(t, fromMsg)) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (i > at) out.add(id);
    }
  });
  return out;
}

/**
 * What an idea does to another, in a line under it on the page — the one
 * relation that says most: a conflict first, then what it rests on, then what
 * it supports. Steps say nothing (the rail already shows their order). Null
 * when it does none of these.
 */
const REL_SAID: Record<string, string> = { conflicts: 'conflicts with', depends: 'rests on', supports: 'supports', justifies: 'supports', implies: 'implies' };
const REL_RANK = ['conflicts', 'depends', 'supports', 'justifies', 'implies'];
export function relationLine(
  id: string,
  edges: readonly { from: string; to: string; relation: string }[],
  labelOf: (id: string) => string | undefined,
  max = 48
): { said: string; to: string } | null {
  let best: { rank: number; to: string; relation: string } | null = null;
  for (const e of edges) {
    let other: string | null = null;
    let relation = e.relation;
    if (e.from === id) other = e.to;
    else if (e.to === id && e.relation === 'conflicts') other = e.from; // a conflict runs both ways
    if (!other || other === id) continue;
    const rank = REL_RANK.indexOf(relation);
    if (rank < 0) continue;
    if (!best || rank < best.rank) best = { rank, to: other, relation };
  }
  if (!best) return null;
  const label = (labelOf(best.to) ?? '').trim();
  if (!label) return null;
  return { said: REL_SAID[best.relation], to: label.length > max ? `${label.slice(0, max).replace(/\s+\S*$/, '')}…` : label };
}

/** What a Logic Map idea is on the page: the question, a given, a step on the way, or an idea of any other kind. */
export type IdeaShelf = 'question' | 'given' | 'step' | 'idea';
const STEP_TYPES = new Set(['step', 'transformation', 'equation', 'inference', 'verification', 'result']);
const STEP_ROLES = new Set(['start', 'step', 'end']);
export function shelfOf(n: { type: string; role?: string | null }): IdeaShelf {
  if (n.type === 'question') return 'question';
  if (n.type === 'given' || n.type === 'unknown') return 'given';
  if (STEP_TYPES.has(n.type) || (n.role && STEP_ROLES.has(n.role))) return 'step';
  return 'idea';
}
