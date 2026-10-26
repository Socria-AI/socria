// lib/logos5/views.ts — THE FOUR VIEWS (Alex Tran, Logos 5 Comments v2).
//
//   ActiveViewportState = 'chat' | 'content' | 'artifacts' | 'logic_map'
//
// Chat is where a line of thinking opens. Content holds what was brought to
// it (documents, notes, sources). Artifacts holds what was made in it (charts,
// tables, plots, the worked solution, models, 3D, displays, practice, the
// writing), and can be chosen before asking (lib/logos5/make.ts). The Logic
// Map holds the person's own ideas, in the shapes their thinking takes,
// whatever the subject (lib/logos-layout.ts ideaLenses), and opens only when
// structure is asked for.
//
// SPLIT VIEW is two of the views side by side: whichever is open, and one more
// beside it — the conversation, Content, the Logic Map, or Artifacts on the
// artifact chosen. It shows the view as its tab shows it, nothing of its own:
// what is made (a plot, a model, a 3D scene, a display) is in Artifacts, the
// map is the Logic Map, and a model's parameters, history and inspector are
// the model's, inside its artifact (splitMenu, below).
//
// What decides a view is the runtime's reading of the turn (lib/runtime/
// orchestrate.ts routeTurn — Alex's rules A–D); this file turns that reading
// into what the screen does, so the decision and the screen cannot disagree.
//
// Pure: no React, no storage, no clock (time arrives in the input).

import type { TurnRoute, Viewport } from '../runtime/orchestrate';

export type { Viewport };

export const VIEW_ORDER: readonly Viewport[] = ['chat', 'content', 'artifacts', 'logic_map'];

export const VIEW_LABELS: Record<Viewport, string> = {
  chat: 'Chat',
  content: 'Content',
  artifacts: 'Artifacts',
  logic_map: 'Logic Map',
};

/** What can be open beside the view: another of the four views. */
export type BesideId = Viewport;

/** What each view is called when it is beside another. */
export const SPLIT_NAMES: Record<BesideId, string> = {
  chat: 'Conversation',
  content: 'Content',
  artifacts: 'Artifacts',
  logic_map: 'Logic Map',
};

export interface Screen {
  view: Viewport;
  /** the view open beside it; null for nothing */
  beside: BesideId | null;
}

/** Where a line of thinking opens: Chat, with nothing beside it. */
export const OPENING: Screen = { view: 'chat', beside: null };

/** A phone shows one thing: whatever would have been beside it is not. A view is never beside itself. */
export function fit(s: Screen, narrow: boolean): Screen {
  if (narrow || s.beside === s.view) return { view: s.view, beside: null };
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

/**
 * A view chosen by hand: what was beside it stays. The view that was beside,
 * chosen, changes places with the one that was open — both stay on screen.
 */
export function choose(view: Viewport, now: Screen): Screen {
  if (view === now.view) return now;
  if (view === now.beside) return { view, beside: now.view };
  return { view, beside: now.beside };
}

/** Split View: open a view beside the one open, or take it away. A view is never beside itself. */
export function dock(id: BesideId | null, now: Screen): Screen {
  if (!id || id === now.view) return { ...now, beside: null };
  return { ...now, beside: now.beside === id ? null : id };
}

/** One of Split View's choices: a view to open beside, or an artifact to open beside on. */
export interface SplitChoice {
  /** what is opened beside */
  beside: BesideId;
  /** the artifact Artifacts opens on, for an artifact chosen by name */
  artifact?: string;
  label: string;
  /** what it holds, in a few words */
  says: string;
  /** what is beside now */
  on: boolean;
}

/**
 * WHAT SPLIT VIEW OFFERS: only what this line of thinking has open in its
 * tabs. The conversation (unless it is the view); Content, when something was
 * brought; the Logic Map, when it holds ideas; and every artifact by name —
 * choosing one opens Artifacts beside, on it, as its own tab shows it. A view
 * with nothing in it is not offered: there is nothing to put beside.
 */
export function splitMenu(i: {
  view: Viewport;
  beside: BesideId | null;
  /** the artifacts here, in Artifacts' own order, and the one Artifacts has open */
  artifacts: readonly { key: string; kind: string; title: string }[];
  open: string | null;
  /** cards in Content, ideas on the map */
  content: number;
  ideas: number;
}): { views: SplitChoice[]; artifacts: SplitChoice[] } {
  const views: SplitChoice[] = [];
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (i.view !== 'chat') views.push({ beside: 'chat', label: SPLIT_NAMES.chat, says: 'the thread and the composer', on: i.beside === 'chat' });
  if (i.view !== 'content' && i.content > 0) views.push({ beside: 'content', label: SPLIT_NAMES.content, says: n(i.content, 'thing brought', 'things brought'), on: i.beside === 'content' });
  if (i.view !== 'logic_map' && i.ideas > 0) views.push({ beside: 'logic_map', label: SPLIT_NAMES.logic_map, says: n(i.ideas, 'idea', 'ideas'), on: i.beside === 'logic_map' });
  // Artifacts open as the view already shows them; beside another view, each is offered by name
  const artifacts: SplitChoice[] =
    i.view === 'artifacts'
      ? []
      : i.artifacts.map((a) => ({
          beside: 'artifacts' as const,
          artifact: a.key,
          label: a.title,
          says: a.kind,
          on: i.beside === 'artifacts' && (i.open ?? i.artifacts[i.artifacts.length - 1]?.key) === a.key,
        }));
  return { views, artifacts };
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

/** A model's own tools, inside its artifact: its parameters, its inspector, its history. */
export type ModelTool = 'params' | 'inspector' | 'trace';
const TOOLS = new Set<string>(['params', 'inspector', 'trace']);
/** Where each of the workspace's surfaces is, among the four views: the map is the Logic Map; what is made, and a model's tools, are Artifacts'. */
const VIEW_OF: Record<string, BesideId> = {
  chat: 'chat',
  map: 'logic_map',
  model: 'artifacts',
  scene: 'artifacts',
  display: 'artifacts',
  params: 'artifacts',
  inspector: 'artifacts',
  trace: 'artifacts',
};
const ARTIFACT_OF: Record<string, 'model' | 'scene' | 'display'> = { model: 'model', scene: 'scene', display: 'display', params: 'model', inspector: 'model', trace: 'model' };

/**
 * "Open the display", "show the model beside the map", "close the 3D view"
 * (lib/workspace/interface-request.ts), on the four views: the map is the
 * Logic Map; a plot, anything made and a model's tools are Artifacts, on it;
 * a second surface named opens beside. Closing takes away what is beside when
 * it is named, and a tool closes inside its model; Chat is never closed.
 * Memory is the account's own place (`memory`), not a view here.
 */
export function screenForRequest(
  req: { op: string; surfaces: readonly string[]; lens?: string },
  now: Screen,
  narrow: boolean
): { screen: Screen; artifact: 'model' | 'scene' | 'display' | 'plot' | null; tool?: ModelTool | null; memory?: boolean } {
  const plot = req.lens === 'plot';
  const viewOf = (s: string | undefined): BesideId | null => (s === 'map' && plot ? 'artifacts' : s ? (VIEW_OF[s] ?? null) : null);
  const artifactOf = (s: string | undefined): 'model' | 'scene' | 'display' | 'plot' | null => (s === 'map' && plot ? 'plot' : s ? (ARTIFACT_OF[s] ?? null) : null);
  const tool = req.surfaces.find((s) => TOOLS.has(s)) as ModelTool | undefined;
  if (req.op === 'close') {
    if (tool && req.surfaces.every((s) => TOOLS.has(s))) return { screen: now, artifact: null, tool: null };
    const named = req.surfaces.map(viewOf).filter(Boolean) as BesideId[];
    if (now.beside && (named.includes(now.beside) || req.surfaces.length > 2)) return { screen: { ...now, beside: null }, artifact: null };
    if (now.view === 'logic_map' && named.includes('logic_map')) return { screen: { view: 'chat', beside: null }, artifact: null };
    return { screen: now, artifact: null };
  }
  const [first, second] = req.surfaces.filter((s) => s !== 'mind');
  if (!first) return { screen: now, artifact: null, ...(req.surfaces.includes('mind') ? { memory: true } : {}) };
  let next: Screen;
  if (first === 'chat') next = chatVisible(now, narrow);
  else {
    const view = viewOf(first);
    if (!view) return { screen: now, artifact: null };
    const beside = viewOf(second);
    next = { view, beside: beside && beside !== view ? beside : req.op === 'only' ? null : now.beside };
  }
  return { screen: fit(next, narrow), artifact: artifactOf(first) ?? artifactOf(second), ...(tool ? { tool } : {}) };
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
