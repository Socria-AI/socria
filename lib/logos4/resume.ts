// lib/logos4/resume.ts — INSTANT RESUME: WHERE THEY WERE, AS THEY LEFT IT.
//
// A session already saves its conversation, map, models and draft space
// whole (lib/logos-sessions.ts, /api/conversations), and the map keeps its
// camera per session (components/ThinkingMap.tsx layoutKey). What a reload
// used to lose is the VIEW: which line of thinking was open, where the thread
// was scrolled to, the half-typed message and the message it was replying
// to, what was selected, which surface a phone had in front, and how far
// into a document they had read.
//
// That is kept here, per session, IN THIS BROWSER: it is about this screen,
// not the thinking — a phone and a laptop each come back to their own view —
// and it costs the database nothing. Everything read back is re-shaped and
// bounded, and anything that no longer exists (a message, a node, a part)
// is dropped quietly by the caller, which checks it against the session.
//
// PURE but for the Storage handed in, so it can be tested without a browser.

import { cleanReplyRef, excerptOf, oneLine, type ReplyRef } from '@/lib/chat-thread';
import type { ThinkingMap } from '@/lib/logos';
import { objOf } from '@/lib/objects';
import { describeFocus, type Focus } from '@/lib/workspace/focus';

export const RESUME_KEY = 'socria.logos4.resume.v1';
export const READING_KEY = 'socria.logos4.reading.v1';

/** how many sessions' views are kept; the least recently touched go first */
export const MAX_VIEWS = 40;
/** a half-typed message longer than this is kept as far as this */
export const MAX_DRAFT = 8000;
/** how many documents remember where they were read to */
export const MAX_READINGS = 60;

export type ScrollAt = { end: true } | { msg: string; offset: number };

export interface SessionView {
  /** when this view was last written */
  at: number;
  /** where the thread was: at its end, or a message at the top and how far into it */
  scroll?: ScrollAt;
  /** the message they had started and not sent */
  draft?: string;
  /** the message that unsent one was replying to */
  replyTo?: ReplyRef;
  /** what was selected in the workspace */
  focus?: Exclude<Focus, null>;
  /** the part of an object of thought selected with it (a row, a cell, a passage) */
  sel?: { obj: string; part: string };
  /** on a phone: the surface in front */
  surface?: 'chat' | 'map';
}

export interface ResumeStore {
  /** the line of thinking open when they left */
  last: string | null;
  views: Record<string, SessionView>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** This browser's storage, or nothing — on the server, in a sandboxed frame, with storage blocked. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const EMPTY: ResumeStore = { last: null, views: {} };
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const PART = /^[A-Za-z0-9_.:|-]{1,120}$/;
const str = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '');
const idOf = (v: unknown): string | null => (typeof v === 'string' && ID.test(v) ? v : null);

/** A stored selection, shaped — or nothing. Whether it still EXISTS is the caller's check. */
export function cleanFocus(v: unknown): Exclude<Focus, null> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if (r.kind === 'node') {
    const id = idOf(r.id);
    return id ? { kind: 'node', id } : undefined;
  }
  if (r.kind === 'param' || r.kind === 'input' || r.kind === 'object') {
    const doc = idOf(r.doc);
    const id = typeof r.id === 'string' && PART.test(r.id) ? r.id : null;
    return doc && id ? { kind: r.kind, doc, id } : undefined;
  }
  if (r.kind === 'part') {
    const obj = idOf(r.obj);
    const part = typeof r.part === 'string' && PART.test(r.part) ? r.part : null;
    return obj && part ? { kind: 'part', obj, part } : undefined;
  }
  if (r.kind === 'expression') {
    const tex = oneLine(str(r.tex, 600), 400);
    return tex ? { kind: 'expression', tex, where: oneLine(str(r.where, 120), 80) || 'the conversation' } : undefined;
  }
  return undefined;
}

function cleanScroll(v: unknown): ScrollAt | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if (r.end === true) return { end: true };
  const msg = idOf(r.msg);
  const offset = typeof r.offset === 'number' && Number.isFinite(r.offset) ? Math.max(-4000, Math.min(4000, Math.round(r.offset))) : 0;
  return msg ? { msg, offset } : undefined;
}

export function cleanView(v: unknown): SessionView | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const at = typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0 ? r.at : 0;
  if (!at) return null;
  const scroll = cleanScroll(r.scroll);
  const draft = typeof r.draft === 'string' && r.draft.trim() ? r.draft.slice(0, MAX_DRAFT) : '';
  const replyTo = cleanReplyRef(r.replyTo);
  const focus = cleanFocus(r.focus);
  const so = r.sel && typeof r.sel === 'object' ? (r.sel as Record<string, unknown>) : null;
  const sel = so && idOf(so.obj) && typeof so.part === 'string' && PART.test(so.part) ? { obj: so.obj as string, part: so.part } : undefined;
  const surface = r.surface === 'map' ? 'map' : r.surface === 'chat' ? 'chat' : undefined;
  return {
    at,
    ...(scroll ? { scroll } : {}),
    ...(draft ? { draft } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(focus ? { focus } : {}),
    ...(sel ? { sel } : {}),
    ...(surface ? { surface } : {}),
  };
}

/** Everything kept, re-shaped. A store that cannot be read is an empty one. */
export function readResume(storage: StorageLike | null | undefined): ResumeStore {
  if (!storage) return { ...EMPTY, views: {} };
  try {
    const raw = JSON.parse(storage.getItem(RESUME_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...EMPTY, views: {} };
    const views: Record<string, SessionView> = {};
    const src = raw.views && typeof raw.views === 'object' ? (raw.views as Record<string, unknown>) : {};
    for (const [id, v] of Object.entries(src).slice(0, MAX_VIEWS * 2)) {
      const view = ID.test(id) ? cleanView(v) : null;
      if (view) views[id] = view;
    }
    return { last: idOf(raw.last), views: prune(views) };
  } catch {
    return { ...EMPTY, views: {} };
  }
}

function prune(views: Record<string, SessionView>): Record<string, SessionView> {
  const ids = Object.keys(views);
  if (ids.length <= MAX_VIEWS) return views;
  const keep = ids.sort((a, b) => views[b].at - views[a].at).slice(0, MAX_VIEWS);
  return Object.fromEntries(keep.map((id) => [id, views[id]]));
}

/** A view with nothing in it is not worth a byte: just "they were at the end". */
const isBare = (v: SessionView): boolean => !v.draft && !v.replyTo && !v.focus && !v.sel && !v.surface && (!v.scroll || 'end' in v.scroll);

/**
 * Keep this session's view, and that it is the one open. Returns the store
 * written. Never throws: a full or blocked storage just means no resume.
 */
export function writeView(storage: StorageLike | null | undefined, id: string, view: Omit<SessionView, 'at'>, now = Date.now()): ResumeStore {
  const store = readResume(storage);
  if (!ID.test(id)) return store;
  const clean = cleanView({ ...view, at: now });
  const views = { ...store.views };
  if (clean && !isBare(clean)) views[id] = clean;
  else delete views[id];
  const next: ResumeStore = { last: id, views: prune(views) };
  try {
    storage?.setItem(RESUME_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: nothing to resume, nothing broken */
  }
  return next;
}

/** A line of thinking deleted: its view goes with it. */
export function forgetView(storage: StorageLike | null | undefined, id: string): void {
  const store = readResume(storage);
  if (!(id in store.views) && store.last !== id) return;
  const views = { ...store.views };
  delete views[id];
  try {
    storage?.setItem(RESUME_KEY, JSON.stringify({ last: store.last === id ? null : store.last, views }));
  } catch {}
}

// ── does what was selected still exist? ───────────────────────────────

const BLOCK = /^p\d{1,4}\.\d{1,5}$/;

/**
 * Whether a kept selection still points at something in this session: the
 * card, the model's part, the chart's cell, the document's passage, the
 * expression in a reply. A document's reading may still be loading from the
 * device, so a passage stands if its document's display does.
 */
export function selectionStands(f: Exclude<Focus, null>, map: ThinkingMap, messages: readonly { role: string; content: string }[]): boolean {
  if (f.kind === 'expression') return messages.some((m) => m.role === 'assistant' && m.content.includes(f.tex));
  if (f.kind === 'part') return partStands(f, map);
  return !!describeFocus(f, map);
}

/** The same, for the part of an object of thought selected with it. */
export function partStands(sel: { obj: string; part: string }, map: ThinkingMap): boolean {
  const o = objOf(map.objects, sel.obj);
  if (!o) return false;
  if (o.kind === 'document') return BLOCK.test(sel.part);
  return !!describeFocus({ kind: 'part', obj: sel.obj, part: sel.part }, map);
}

// ── where the thread was ──────────────────────────────────────────────

/**
 * The thread's position, as something that survives a different screen size:
 * the first message whose bottom is below the top of the thread, and how far
 * its top sits above that edge. `rects` are the messages in order, measured
 * against the thread's own top (top/bottom in px), with the thread's height.
 */
export function anchorOf(rects: readonly { id: string; top: number; bottom: number }[], atEnd: boolean): ScrollAt | undefined {
  if (atEnd) return { end: true };
  const first = rects.find((r) => r.bottom > 0);
  return first && ID.test(first.id) ? { msg: first.id, offset: Math.round(first.top) } : undefined;
}

// ── what is waiting on them ───────────────────────────────────────────

export interface PickUp {
  id: string;
  title: string;
  /** the question Socria left them with, or the message they had started */
  waiting: string;
  kind: 'question' | 'draft';
  at: number;
}

/** The question a reply ends on, if it ends on one — its last sentence, as words. */
export function endingQuestion(text: string): string | null {
  const plain = excerptOf(String(text ?? '').slice(-900), 900);
  if (!/\?\s*["”’)]*$/.test(plain)) return null;
  const sentences = plain.match(/[^.!?]*[.!?]+["”’)]*/g) ?? [plain];
  const last = sentences[sentences.length - 1]?.trim() ?? '';
  return last.endsWith('?') || /\?["”’)]+$/.test(last) ? oneLine(last, 180) : null;
}

interface SessionLike {
  id: string;
  title: string;
  updatedAt: number;
  messages: readonly { role: 'user' | 'assistant'; content: string; synthesis?: unknown }[];
}

/**
 * The most recent line of thinking left unfinished — a message they started
 * and did not send, or a question Socria asked that is still waiting on them —
 * to offer when they begin a new one. Never the one open, never one older
 * than `within`, and nothing at all when nothing is waiting.
 */
export function pickUp(sessions: readonly SessionLike[], store: ResumeStore, opts: { except?: string | null; now?: number; within?: number; skip?: (id: string) => boolean } = {}): PickUp | null {
  const now = opts.now ?? Date.now();
  const within = opts.within ?? 14 * 86_400_000;
  const found: PickUp[] = [];
  for (const s of sessions) {
    if (s.id === opts.except || opts.skip?.(s.id)) continue;
    const view = store.views[s.id];
    const at = Math.max(s.updatedAt || 0, view?.at ?? 0);
    if (!at || now - at > within) continue;
    if (view?.draft) {
      found.push({ id: s.id, title: s.title, waiting: oneLine(view.draft, 180), kind: 'draft', at });
      continue;
    }
    const said = s.messages.filter((m) => !m.synthesis);
    const last = said[said.length - 1];
    const q = last?.role === 'assistant' ? endingQuestion(last.content) : null;
    if (q) found.push({ id: s.id, title: s.title, waiting: q, kind: 'question', at });
  }
  return found.sort((a, b) => b.at - a.at)[0] ?? null;
}

// ── how far into a document ───────────────────────────────────────────

/** The passage a document view was read to, by the display it is open in. */
export function readingAt(storage: StorageLike | null | undefined, obj: string): string | null {
  try {
    const raw = JSON.parse(storage?.getItem(READING_KEY) || 'null');
    const v = raw && typeof raw === 'object' ? raw[obj] : null;
    return v && typeof v.block === 'string' && /^p\d{1,4}\.\d{1,5}$/.test(v.block) ? v.block : null;
  } catch {
    return null;
  }
}

export function rememberReading(storage: StorageLike | null | undefined, obj: string, block: string, now = Date.now()): void {
  if (!ID.test(obj) || !/^p\d{1,4}\.\d{1,5}$/.test(block)) return;
  try {
    const raw = JSON.parse(storage?.getItem(READING_KEY) || 'null');
    const all: Record<string, { block: string; at: number }> = raw && typeof raw === 'object' ? raw : {};
    if (all[obj]?.block === block) return;
    all[obj] = { block, at: now };
    const ids = Object.keys(all).filter((k) => all[k] && typeof all[k].at === 'number');
    const keep = ids.sort((a, b) => all[b].at - all[a].at).slice(0, MAX_READINGS);
    storage?.setItem(READING_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))));
  } catch {}
}
