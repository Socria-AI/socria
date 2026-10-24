// lib/logos5/views.ts — THE FOUR VIEWS (Alex Tran, Logos 5 Comments v2).
//
//   ActiveViewportState = 'chat' | 'content' | 'artifacts' | 'logic_map'
//
// Chat is where a line of thinking opens. Content holds what was brought to
// it (documents, notes, sources). Artifacts holds what was made in it (plots,
// models, 3D, displays, practice, the writing). The Logic Map holds the
// structure of the reasoning, and opens only when structure is asked for.
// "Split View" docks one more panel beside whichever view is open.
//
// What decides a view is the runtime's reading of the turn (lib/runtime/
// orchestrate.ts routeTurn — Alex's rules A–D); this file turns that reading
// into what the screen does, so the decision and the screen cannot disagree.
//
// Pure: no React, no storage, no clock (time arrives in the input).

import type { TurnRoute, Viewport } from '../runtime/orchestrate';
import type { ViewId } from '../workspace/surfaces';

export type { Viewport };

export const VIEW_ORDER: readonly Viewport[] = ['chat', 'content', 'artifacts', 'logic_map'];

export const VIEW_LABELS: Record<Viewport, string> = {
  chat: 'Chat',
  content: 'Content',
  artifacts: 'Artifacts',
  logic_map: 'Logic Map',
};

/** What can be docked beside the open view: the conversation, or one of the workspace's panels. */
export type BesideId = 'chat' | Exclude<ViewId, 'chat'>;

/** Split View's three sections, in Alex's words, over the panels that exist. */
export const SPLIT_SECTIONS: readonly { title: string; items: readonly Exclude<BesideId, 'chat'>[] }[] = [
  { title: 'Visual & Generative Tools', items: ['plot', 'model', 'scene', 'display'] },
  { title: 'Analysis & Structure', items: ['map', 'trace', 'inspector'] },
  { title: 'System & Memory', items: ['mind', 'params'] },
];

export const SPLIT_NAMES: Record<BesideId, string> = {
  chat: 'Conversation',
  plot: 'Math Plotting',
  model: 'Interactive Modeling',
  scene: 'Studio (CAD)',
  display: 'Displays (Tables, Checklists)',
  map: 'Thinking Map Structure',
  trace: 'Trace',
  inspector: 'Inspector',
  mind: 'Mind (Memory History)',
  params: 'Parameters',
};

export interface Screen {
  view: Viewport;
  /** docked beside the view; null for nothing */
  beside: BesideId | null;
}

/** Where a line of thinking opens: Chat, with nothing beside it. */
export const OPENING: Screen = { view: 'chat', beside: null };

/** A phone shows one thing: whatever would have been beside it is not. */
export function fit(s: Screen, narrow: boolean): Screen {
  if (narrow) return { view: s.view, beside: null };
  // the conversation docked beside Chat is Chat itself
  if (s.view === 'chat' && s.beside === 'chat') return { view: 'chat', beside: null };
  return s;
}

/**
 * WHAT A SENT TURN DOES TO THE SCREEN.
 *
 *   A  conversation   it is read in Chat: Chat is the view, or — on a wide
 *                     screen, from another view — the conversation docks
 *                     beside it, so what they were looking at stays.
 *   B  documents      Content fills in the background; the screen does not move.
 *   C  something made Artifacts, with the conversation beside it.
 *   D  structure      the Logic Map, with the conversation beside it.
 *   a command         nothing moves — it was done where they are.
 */
export function afterSend(route: TurnRoute, now: Screen, narrow: boolean): Screen {
  if (route.intent === 'command' || route.intent === 'ingest') {
    // a question can come with documents: it is still read in the conversation
    return route.intent === 'ingest' ? chatVisible(now, narrow) : now;
  }
  if (route.reveal) return fit({ view: route.reveal.view, beside: narrow ? null : route.reveal.beside }, narrow);
  return chatVisible(now, narrow);
}

/** The conversation, where it can be read: as the view, or beside it. */
export function chatVisible(now: Screen, narrow: boolean): Screen {
  if (now.view === 'chat') return { view: 'chat', beside: now.beside === 'chat' ? null : now.beside };
  if (narrow) return { view: 'chat', beside: null };
  return { view: now.view, beside: 'chat' };
}

/**
 * Something the engine made has arrived. It is SHOWN only when the turn asked
 * for something to be made (rule C) — a picture drawn by a map pass in the
 * background, or by the cadence, is not a reason to take the screen away
 * from what they are reading. It is still in Artifacts, counted, and named
 * under the reply.
 */
export function onMade(asked: boolean, now: Screen, narrow: boolean): Screen {
  if (!asked) return now;
  return fit({ view: 'artifacts', beside: narrow ? null : now.view === 'chat' || now.beside === 'chat' ? 'chat' : now.beside }, narrow);
}

/** A view chosen by hand: what was beside it stays, unless it is the view itself. */
export function choose(view: Viewport, now: Screen): Screen {
  if (view === 'chat') return { view, beside: now.beside === 'chat' ? null : now.beside };
  return { view, beside: now.beside };
}

/** Split View: dock a panel beside the view, or take it away. The conversation beside Chat is Chat. */
export function dock(id: BesideId | null, now: Screen): Screen {
  if (id === 'chat' && now.view === 'chat') return { ...now, beside: null };
  return { ...now, beside: now.beside === id ? null : id };
}

// ── time: Alex's Today ───────────────────────────────────────────────

/** The person's calendar day around `now`, in their own time zone: 00:00:00.000 to 23:59:59.999. */
export function dayBounds(now: number): { start: number; end: number } {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  return { start, end };
}

/** A plausible creation time: 2020 to 2100. */
const plausible = (t: number) => Number.isFinite(t) && t > 1_577_836_800_000 && t < 4_102_444_800_000;

/**
 * WHEN A LINE OF THINKING BEGAN. Logos session ids end with the time they
 * were made (lib/logos-sessions.ts newSessionId: `lg_` + random + time in
 * base 36); a conversation from elsewhere is known by its first turn; the
 * last change is the last resort.
 */
export function startedAt(s: { id: string; updatedAt: number; messages?: readonly { at?: number }[] }): number {
  if (s.id.startsWith('lg_') && s.id.length >= 11) {
    const t = parseInt(s.id.slice(-8), 36);
    if (plausible(t)) return t;
  }
  const first = s.messages?.find((m) => typeof m.at === 'number')?.at;
  if (first && plausible(first)) return first;
  return s.updatedAt;
}

/** Today, exactly: begun on this calendar day, local time — nothing earlier, however related. */
export function begunToday<T extends { id: string; updatedAt: number; messages?: readonly { at?: number }[] }>(sessions: readonly T[], now: number): T[] {
  const { start, end } = dayBounds(now);
  return sessions.filter((s) => {
    const t = startedAt(s);
    return t >= start && t <= end;
  });
}

/** What the Today lens shows when nothing was begun today. */
export const TODAY_EMPTY = 'No sessions recorded today. Start a chat to begin a new map node.';

// ── a surface asked for by name ──────────────────────────────────────

/** Where each of the workspace's surfaces is, among the four views: what is made is in Artifacts, the rest docks beside. */
const MADE = new Set(['model', 'scene', 'display']);
const BESIDE_OF: Record<string, BesideId> = {
  map: 'map',
  model: 'model',
  scene: 'scene',
  display: 'display',
  params: 'params',
  inspector: 'inspector',
  trace: 'trace',
  mind: 'mind',
  chat: 'chat',
};

/**
 * "Open the display", "show the model beside the map", "close the 3D view"
 * (lib/workspace/interface-request.ts), on the four views: the map is the
 * Logic Map, a plot or anything made is Artifacts (on it), a second surface
 * named docks beside, and a tool (parameters, trace, inspector, memory) docks
 * beside whatever is open. Closing takes away what is beside when it is
 * named; Chat is never closed.
 */
export function screenForRequest(
  req: { op: string; surfaces: readonly string[]; lens?: string },
  now: Screen,
  narrow: boolean
): { screen: Screen; artifact: 'model' | 'scene' | 'display' | 'plot' | null } {
  const plot = req.lens === 'plot';
  const named = req.surfaces.map((s) => (s === 'map' && plot ? 'plot' : BESIDE_OF[s])).filter(Boolean) as BesideId[];
  if (req.op === 'close') {
    if (now.beside && (named.includes(now.beside) || req.surfaces.length > 2)) return { screen: { ...now, beside: null }, artifact: null };
    if (now.view === 'logic_map' && named.includes('map')) return { screen: { view: 'chat', beside: null }, artifact: null };
    return { screen: now, artifact: null };
  }
  const [first, second] = req.surfaces;
  const besideOf = (s: string | undefined): BesideId | null => (s ? BESIDE_OF[s] ?? null : null);
  let next: Screen;
  let artifact: 'model' | 'scene' | 'display' | 'plot' | null = null;
  if (first === 'chat') next = chatVisible(now, narrow);
  else if (first === 'map' && plot) {
    artifact = 'plot';
    next = { view: 'artifacts', beside: besideOf(second) ?? (req.op === 'only' ? null : now.beside) };
  } else if (first === 'map') next = { view: 'logic_map', beside: besideOf(second) ?? (req.op === 'only' || now.beside === 'map' ? null : now.beside) };
  else if (first && MADE.has(first)) {
    artifact = first as 'model' | 'scene' | 'display';
    next = { view: 'artifacts', beside: besideOf(second) ?? (req.op === 'only' ? null : now.beside) };
  } else if (first) next = { view: now.view, beside: besideOf(first) };
  else next = now;
  // a panel beside that is the view itself is not a second panel
  if (next.view === 'logic_map' && next.beside === 'map') next = { ...next, beside: null };
  return { screen: fit(next, narrow), artifact };
}

// ── Split View's width ───────────────────────────────────────────────

const BESIDE_KEY = 'socria.logos5.beside.v1';
export const DEFAULT_BESIDE = 0.4;
export const clampShare = (s: number) => Math.min(0.6, Math.max(0.28, s));

/** The panel beside's share of the width, per browser. */
export function readBesideShare(storage: Pick<Storage, 'getItem'> | null | undefined): number {
  try {
    const v = Number(JSON.parse(storage?.getItem(BESIDE_KEY) || 'null'));
    return Number.isFinite(v) && v > 0 ? clampShare(v) : DEFAULT_BESIDE;
  } catch {
    return DEFAULT_BESIDE;
  }
}

export function writeBesideShare(storage: Pick<Storage, 'setItem'> | null | undefined, share: number): void {
  try {
    storage?.setItem(BESIDE_KEY, JSON.stringify(Math.round(clampShare(share) * 1000) / 1000));
  } catch {
    /* kept for this visit only */
  }
}
