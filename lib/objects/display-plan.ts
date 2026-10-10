// A PLAN — things to do or things that happened, in time or in order.
//
// "Help me organise my semester", "a timeline of the French Revolution", "a
// kanban for my launch", "a checklist for moving house", "a storyboard for my
// short film": one state — items, each with words and optionally a day, an
// end, a status, a lane — and the links between them (B waits on A). The
// timeline, the board, the checklist, the storyboard and the list are VIEWS
// of that state; moving a card between columns is a status change, dragging
// an item along the timeline is a date change, and every one of them is an
// operation computed here, kept in the history and undoable.
//
// What is computed, never asserted: which items now fall before something
// they wait on, how much is done, the span the plan covers. A cycle of
// dependencies cannot be stored.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import {
  addDays,
  cleanBy,
  cleanId,
  cleanText,
  dayDiff,
  displayKind,
  findByLabel,
  guardBy,
  guardOwn,
  headOps,
  isoDay,
  nextId,
  norm,
  op,
  quotedOrAfterColon,
  readDay,
  readShift,
  readView,
  registerDisplay,
  sayDay,
  todayDay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
} from './display-base';

export type PlanView = 'timeline' | 'board' | 'checklist' | 'storyboard' | 'list';
export type Status = 'todo' | 'doing' | 'done';

export interface PlanItem {
  id: string;
  text: string;
  /** the day it happens or is due, YYYY-MM-DD */
  date?: string;
  /** the day it ends, for something that lasts; never before `date` */
  end?: string;
  status?: Status;
  /** a row on the timeline, a swimlane: "Coursework", "Job search" */
  lane?: string;
  note?: string;
  by: By;
}

/** `to` waits on `from`: it cannot sensibly happen before `from` does. */
export interface PlanLink {
  from: string;
  to: string;
  by: By;
}

export interface PlanState extends DisplayHead {
  view: PlanView;
  items: PlanItem[];
  links: PlanLink[];
}

export const PLAN_LIMITS = { items: 40, text: 120, note: 240, lane: 40, lanes: 6, links: 60 } as const;
const STATUSES: Status[] = ['todo', 'doing', 'done'];
export const STATUS_WORD: Record<Status, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };

// ── canonical state ──────────────────────────────────────────────────

/** Would adding from → to close a loop of things waiting on each other? */
function closesLoop(links: readonly PlanLink[], from: string, to: string): boolean {
  // a path from `to` back to `from` already exists
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const l of links) if (l.from === n) stack.push(l.to);
  }
  return false;
}

export function sanitizePlan(raw: unknown): PlanState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rawItems = Array.isArray(r.items) ? r.items : [];
  const items: PlanItem[] = [];
  const ids = new Set<string>();
  const lanes: string[] = [];
  for (const x of rawItems) {
    if (items.length >= PLAN_LIMITS.items) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const text = cleanText(o.text ?? o.title ?? o.label, PLAN_LIMITS.text);
    if (!text) continue;
    let id = cleanId(o.id);
    if (!id || ids.has(id)) id = nextId('i', ids);
    ids.add(id);
    const date = isoDay(o.date) ?? undefined;
    let end = isoDay(o.end) ?? undefined;
    if (end && (!date || dayDiff(date, end) <= 0)) end = undefined;
    const status = STATUSES.includes(o.status as Status) ? (o.status as Status) : undefined;
    let lane = cleanText(o.lane, PLAN_LIMITS.lane) || undefined;
    if (lane && !lanes.includes(lane)) {
      if (lanes.length < PLAN_LIMITS.lanes) lanes.push(lane);
      else lane = undefined;
    }
    const note = cleanText(o.note, PLAN_LIMITS.note) || undefined;
    items.push({
      id,
      text,
      ...(date ? { date } : {}),
      ...(end ? { end } : {}),
      ...(status ? { status } : {}),
      ...(lane ? { lane } : {}),
      ...(note ? { note } : {}),
      by: cleanBy(o.by),
    });
  }
  if (!items.length && !Array.isArray(r.items)) return null;
  const links: PlanLink[] = [];
  for (const x of Array.isArray(r.links) ? r.links : []) {
    if (links.length >= PLAN_LIMITS.links) break;
    const o = x as Record<string, unknown> | null;
    const from = cleanId(o?.from);
    const to = cleanId(o?.to);
    if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) continue;
    if (links.some((l) => l.from === from && l.to === to)) continue;
    if (closesLoop(links, from, to)) continue;
    links.push({ from, to, by: cleanBy(o?.by) });
  }
  const view = (['timeline', 'board', 'checklist', 'storyboard', 'list'] as PlanView[]).includes(r.view as PlanView)
    ? (r.view as PlanView)
    : items.some((i) => i.date)
      ? 'timeline'
      : items.some((i) => i.status)
        ? 'checklist'
        : 'list';
  return { title: cleanText(r.title, 80) || 'Plan', view, items, links };
}

// ── what is computed ─────────────────────────────────────────────────

export interface Clash {
  item: string;
  waitsOn: string;
  /** days the item falls before what it waits on (positive) */
  by: number;
}

/** Items dated before something they wait on — computed from the dates, never claimed. */
export function clashes(s: PlanState): Clash[] {
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const out: Clash[] = [];
  for (const l of s.links) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a?.date || !b?.date) continue;
    const aEnd = a.end ?? a.date;
    const gap = dayDiff(aEnd, b.date);
    if (gap < 0) out.push({ item: b.id, waitsOn: a.id, by: -gap });
  }
  return out;
}

export function progress(s: PlanState): { done: number; total: number } {
  const tracked = s.items.filter((i) => i.status);
  return { done: tracked.filter((i) => i.status === 'done').length, total: tracked.length || s.items.length };
}

/** The first and last days the plan covers, or null when nothing is dated. */
export function span(s: PlanState): { start: string; end: string; days: number } | null {
  const days = s.items.flatMap((i) => [i.date, i.end].filter(Boolean) as string[]).sort();
  if (!days.length) return null;
  return { start: days[0], end: days[days.length - 1], days: dayDiff(days[0], days[days.length - 1]) };
}

export interface TimelineBar {
  id: string;
  /** 0..1 across the span */
  x0: number;
  x1: number;
  /** the row within its lane, so bars never overlap */
  row: number;
  lane: string;
}

/**
 * Where each dated item sits on a timeline: position along the span, a lane,
 * and a row inside the lane chosen so no two bars overlap (greedy interval
 * packing, in date order). Undated items are left for the list beneath.
 */
export function timelineBars(s: PlanState, minWidth = 0.012): { bars: TimelineBar[]; lanes: string[]; span: ReturnType<typeof span> } {
  const sp = span(s);
  if (!sp) return { bars: [], lanes: [], span: null };
  const total = Math.max(1, sp.days);
  const lanes = [...new Set(s.items.filter((i) => i.date).map((i) => i.lane ?? ''))];
  lanes.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0));
  const dated = s.items.filter((i) => i.date).sort((a, b) => dayDiff(b.date!, a.date!) || a.id.localeCompare(b.id));
  const bars: TimelineBar[] = [];
  const rowEnds = new Map<string, number[]>();
  for (const i of dated) {
    const lane = i.lane ?? '';
    // a one-day item still needs a sliver to be seen; at the end of the span it grows leftwards
    const x0 = Math.min(dayDiff(sp.start, i.date!) / total, 1 - minWidth);
    const x1 = Math.min(1, Math.max(x0 + minWidth, dayDiff(sp.start, i.end ?? i.date!) / total));
    const ends = rowEnds.get(lane) ?? [];
    let row = ends.findIndex((e) => e < x0 - 1e-9);
    if (row < 0) {
      row = ends.length;
      ends.push(x1);
    } else ends[row] = x1;
    rowEnds.set(lane, ends);
    bars.push({ id: i.id, x0, x1, row, lane });
  }
  return { bars, lanes, span: sp };
}

const itemSaid = (s: PlanState, id: string) => `‘${s.items.find((i) => i.id === id)?.text ?? id}’`;

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<PlanState>[] = [
  {
    id: 'timeline',
    label: 'Timeline',
    shows: 'when things happen, side by side in time, with what waits on what',
    interactions: ['drag an item to change its day', 'drag its end to change how long it lasts'],
    unavailable: (s) => (s.items.some((i) => i.date) ? null : 'Nothing in it has a date yet — give items dates and they line up in time.'),
  },
  { id: 'board', label: 'Board', shows: 'what is to do, in progress and done', interactions: ['move a card to another column'] },
  { id: 'checklist', label: 'Checklist', shows: 'how much is done', interactions: ['tick an item off'] },
  { id: 'storyboard', label: 'Storyboard', shows: 'the sequence as frames, one after another', interactions: ['reorder frames'] },
  { id: 'list', label: 'List', shows: 'everything, in order, with its details', primary: true, interactions: ['edit an item'] },
];

const VIEW_WORDS: Record<string, string[]> = {
  timeline: ['timeline', 'gantt', 'schedule'],
  board: ['board', 'kanban', 'columns'],
  checklist: ['checklist', 'check list', 'todo list', 'to do list'],
  storyboard: ['storyboard', 'story board', 'frames'],
  list: ['list'],
};

const find = (s: PlanState, id: unknown) => s.items.find((i) => i.id === id);
const need = (s: PlanState, id: unknown): string | null => (find(s, id) ? null : 'There is no such item in the plan.');

function withItems(s: PlanState, items: PlanItem[], links = s.links): PlanState {
  return sanitizePlan({ ...s, items, links }) ?? s;
}

export const PLAN_OPS = {
  ...headOps<PlanState>(views, sanitizePlan),
  add: op<PlanState>(
    'Add an item',
    (s, a, ctx) => {
      if (!cleanText(a.text, PLAN_LIMITS.text)) return 'Say what the item is.';
      if (s.items.length >= PLAN_LIMITS.items) return `A plan holds ${PLAN_LIMITS.items} items at most.`;
      if (a.date !== undefined && a.date !== '' && !isoDay(a.date)) return 'That is not a calendar day.';
      if (a.after !== undefined && !find(s, a.after)) return 'There is no such item to put it after.';
      return guardBy(a, ctx);
    },
    (s, a) => {
      const id = nextId('i', s.items.map((i) => i.id));
      const item: PlanItem = {
        id,
        text: cleanText(a.text, PLAN_LIMITS.text),
        ...(isoDay(a.date) ? { date: String(a.date) } : {}),
        ...(isoDay(a.end) ? { end: String(a.end) } : {}),
        ...(STATUSES.includes(a.status as Status) ? { status: a.status as Status } : {}),
        ...(cleanText(a.lane, PLAN_LIMITS.lane) ? { lane: cleanText(a.lane, PLAN_LIMITS.lane) } : {}),
        ...(cleanText(a.note, PLAN_LIMITS.note) ? { note: cleanText(a.note, PLAN_LIMITS.note) } : {}),
        by: cleanBy(a.by),
      };
      const at = a.after !== undefined ? s.items.findIndex((i) => i.id === a.after) + 1 : s.items.length;
      return withItems(s, [...s.items.slice(0, at), item, ...s.items.slice(at)]);
    },
    (a) => `added “${cleanText(a.text, PLAN_LIMITS.text)}”${isoDay(a.date) ? ` on ${sayDay(String(a.date))}` : ''}`
  ),
  text: op<PlanState>(
    'Reword',
    (s, a, ctx) => need(s, a.id) ?? (cleanText(a.text, PLAN_LIMITS.text) ? null : 'Say what it should read.') ?? guardOwn(find(s, a.id), ctx),
    (s, a) => withItems(s, s.items.map((i) => (i.id === a.id ? { ...i, text: cleanText(a.text, PLAN_LIMITS.text) } : i))),
    (a) => `reworded to “${cleanText(a.text, PLAN_LIMITS.text)}”`
  ),
  date: op<PlanState>(
    'Set the day',
    (s, a, ctx) => {
      const miss = need(s, a.id);
      if (miss) return miss;
      if (a.date !== '' && !isoDay(a.date)) return 'That is not a calendar day.';
      if (a.end !== undefined && a.end !== '' && (!isoDay(a.end) || !isoDay(a.date) || dayDiff(String(a.date), String(a.end)) <= 0)) {
        return 'It cannot end before it starts.';
      }
      return guardOwn(find(s, a.id), ctx);
    },
    (s, a) =>
      withItems(
        s,
        s.items.map((i) => {
          if (i.id !== a.id) return i;
          const { date: _d, end: _e, ...rest } = i;
          const date = isoDay(a.date);
          if (!date) return rest;
          // a duration is kept when only the start moves, unless a new end is given
          const kept = a.end === undefined && i.date && i.end ? addDays(date, dayDiff(i.date, i.end)) : undefined;
          const end = isoDay(a.end) ?? kept;
          return { ...rest, date, ...(end ? { end } : {}) };
        })
      ),
    (a) => (isoDay(a.date) ? `moved to ${sayDay(String(a.date))}${isoDay(a.end) ? `–${sayDay(String(a.end))}` : ''}` : 'undated')
  ),
  shift: op<PlanState>(
    'Move in time',
    (s, a, ctx) => {
      const days = Number(a.days);
      if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 3660) return 'Say how many days to move it.';
      if (a.id === '*') {
        if (!s.items.some((i) => i.date)) return 'Nothing in the plan has a date to move.';
        if (ctx?.by === 'socria' && s.items.some((i) => i.date && i.by === 'person')) return guardOwn({ by: 'person' }, ctx, 'Your items are yours');
        return null;
      }
      const miss = need(s, a.id);
      if (miss) return miss;
      if (!find(s, a.id)!.date) return `${itemSaid(s, String(a.id))} has no day yet — give it one first.`;
      return guardOwn(find(s, a.id), ctx);
    },
    (s, a) => {
      const days = Number(a.days);
      return withItems(
        s,
        s.items.map((i) =>
          (a.id === '*' || i.id === a.id) && i.date
            ? { ...i, date: addDays(i.date, days), ...(i.end ? { end: addDays(i.end, days) } : {}) }
            : i
        )
      );
    },
    (a) => {
      const d = Number(a.days);
      const n = Math.abs(d);
      const amount = n % 7 === 0 ? `${n / 7} week${n === 7 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'}`;
      return `${a.id === '*' ? 'everything ' : ''}moved ${amount} ${d > 0 ? 'later' : 'earlier'}`;
    }
  ),
  status: op<PlanState>(
    'Set the status',
    (s, a, ctx) => need(s, a.id) ?? (STATUSES.includes(a.status as Status) ? null : 'A status is to do, doing or done.') ?? guardOwn(find(s, a.id), ctx),
    (s, a) => withItems(s, s.items.map((i) => (i.id === a.id ? { ...i, status: a.status as Status } : i))),
    (a) => `marked ${STATUS_WORD[a.status as Status]?.toLowerCase() ?? a.status}`
  ),
  lane: op<PlanState>(
    'Put in a lane',
    (s, a, ctx) => {
      const miss = need(s, a.id);
      if (miss) return miss;
      const lane = cleanText(a.lane, PLAN_LIMITS.lane);
      const lanes = new Set(s.items.map((i) => i.lane).filter(Boolean));
      if (lane && !lanes.has(lane) && lanes.size >= PLAN_LIMITS.lanes) return `A plan has ${PLAN_LIMITS.lanes} lanes at most.`;
      return guardOwn(find(s, a.id), ctx);
    },
    (s, a) =>
      withItems(
        s,
        s.items.map((i) => {
          if (i.id !== a.id) return i;
          const { lane: _l, ...rest } = i;
          const lane = cleanText(a.lane, PLAN_LIMITS.lane);
          return lane ? { ...rest, lane } : rest;
        })
      ),
    (a) => (cleanText(a.lane, PLAN_LIMITS.lane) ? `put in ${cleanText(a.lane, PLAN_LIMITS.lane)}` : 'taken out of its lane')
  ),
  note: op<PlanState>(
    'Note',
    (s, a, ctx) => need(s, a.id) ?? guardOwn(find(s, a.id), ctx),
    (s, a) =>
      withItems(
        s,
        s.items.map((i) => {
          if (i.id !== a.id) return i;
          const { note: _n, ...rest } = i;
          const note = cleanText(a.note, PLAN_LIMITS.note);
          return note ? { ...rest, note } : rest;
        })
      ),
    (a) => (cleanText(a.note, PLAN_LIMITS.note) ? 'noted' : 'note cleared')
  ),
  move: op<PlanState>(
    'Reorder',
    (s, a, ctx) => {
      const miss = need(s, a.id);
      if (miss) return miss;
      const to = Number(a.to);
      if (!Number.isInteger(to) || to < 0 || to >= s.items.length) return 'There is no such place in the order.';
      return guardOwn(find(s, a.id), ctx);
    },
    (s, a) => {
      const from = s.items.findIndex((i) => i.id === a.id);
      const items = s.items.slice();
      const [it] = items.splice(from, 1);
      items.splice(Number(a.to), 0, it);
      return withItems(s, items);
    },
    (a) => `moved to place ${Number(a.to) + 1}`
  ),
  remove: op<PlanState>(
    'Remove',
    (s, a, ctx) => need(s, a.id) ?? guardOwn(find(s, a.id), ctx),
    (s, a) => withItems(s, s.items.filter((i) => i.id !== a.id), s.links.filter((l) => l.from !== a.id && l.to !== a.id)),
    () => 'removed'
  ),
  link: op<PlanState>(
    'Waits on',
    (s, a, ctx) => {
      if (!find(s, a.from) || !find(s, a.to)) return 'There is no such item in the plan.';
      if (a.from === a.to) return 'Something cannot wait on itself.';
      if (s.links.some((l) => l.from === a.from && l.to === a.to)) return 'It already waits on that.';
      if (closesLoop(s.links, String(a.from), String(a.to))) return 'That would make things wait on each other in a circle.';
      if (s.links.length >= PLAN_LIMITS.links) return 'The plan has as many links as it can hold.';
      return guardBy(a, ctx);
    },
    (s, a) => withItems(s, s.items, [...s.links, { from: String(a.from), to: String(a.to), by: cleanBy(a.by) }]),
    () => 'now waits on it'
  ),
  unlink: op<PlanState>(
    'No longer waits on',
    (s, a, ctx) => {
      const l = s.links.find((x) => x.from === a.from && x.to === a.to);
      if (!l) return 'It does not wait on that.';
      return guardOwn(l, ctx, 'That link');
    },
    (s, a) => withItems(s, s.items, s.links.filter((l) => !(l.from === a.from && l.to === a.to))),
    () => 'no longer waits on it'
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const STATUS_WORDS: [RegExp, Status][] = [
  [/\b(done|complete|completed|finished|ticked|checked off)\b/, 'done'],
  [/\b(in progress|doing|started|underway|working on)\b/, 'doing'],
  [/\b(to do|todo|not started|not done|undone|unticked)\b/, 'todo'],
];

/** Strip the words that are not an item's name, so "move the essay to next week" finds "essay". */
function labelOf(s: PlanState, text: string): PlanItem | null {
  return findByLabel(s.items, (i) => i.text, text);
}

/**
 * An operation the words plainly ask for. Conservative by design: this runs
 * on every message while a plan is in the workspace, so it answers only when
 * the words name an item of THIS plan (or clearly add one), and otherwise
 * leaves the message to the conversation.
 */
export function readPlanOp(text: string, s: PlanState, today: string): { op: string; args: Args } | null {
  const t = text.trim();
  if (!t || t.length > 200) return null;
  const low = ` ${norm(t)} `;

  const view = readView(t, views, VIEW_WORDS);
  if (view && t.length <= 60 && !labelOf(s, t)) return { op: 'view', args: { view } };

  // "push everything back a week"
  if (/\b(everything|all of it|the whole plan|all the dates)\b/.test(low) && /\b(move|push|shift|delay|bring)\b/.test(low)) {
    const d = readShift(t) ?? (/\bnext week\b/.test(low) ? 7 : null);
    if (d) return { op: 'shift', args: { id: '*', days: d } };
  }

  const item = labelOf(s, t);

  if (item) {
    // status: "mark the essay done", "I finished the reading", "check off rent"
    if (/\b(mark|set|tick|check off|finished|done with|completed|started|move)\b/.test(low)) {
      for (const [re, st] of STATUS_WORDS) {
        // the status word must not be part of the item's own name
        const rest = low.replace(` ${norm(item.text)} `, ' ');
        if (re.test(rest) && !(st === 'doing' && /\b(move|push|shift)\b/.test(low) && readDay(rest, today))) {
          return { op: 'status', args: { id: item.id, status: st } };
        }
      }
    }
    // remove: "remove the field trip", "delete rent"
    if (/^(please\s+)?(remove|delete|drop|cancel|take out)\b/.test(norm(t))) return { op: 'remove', args: { id: item.id } };
    // rename: "rename essay to essay draft"
    const rn = /\brename\b.+?\bto\b\s+(.+)$/i.exec(t);
    if (rn) return { op: 'text', args: { id: item.id, text: rn[1].replace(/[.!]+$/, '') } };
    // time: "move the essay to next week", "push the midterm back two days", "move rent to Oct 20"
    if (/\b(move|push|shift|reschedule|postpone|delay|bring|change)\b/.test(low)) {
      const rest = low.replace(` ${norm(item.text)} `, ' ');
      const shift = readShift(rest);
      if (shift) return item.date ? { op: 'shift', args: { id: item.id, days: shift } } : null;
      if (/\bnext week\b/.test(rest)) {
        return item.date ? { op: 'shift', args: { id: item.id, days: 7 } } : { op: 'date', args: { id: item.id, date: addDays(today, 7) } };
      }
      const day = readDay(rest, today);
      if (day) return { op: 'date', args: { id: item.id, date: day } };
    }
    // dependency: "the essay depends on the research", "research before the essay"
    const dep = /^(.+?)\s+(?:depends on|waits on|waits for|needs|requires|comes after|is after)\s+(.+)$/i.exec(t);
    if (dep) {
      const a = labelOf(s, dep[2]);
      const b = labelOf(s, dep[1]);
      if (a && b && a.id !== b.id) return { op: 'link', args: { from: a.id, to: b.id, by: 'person' } };
    }
    const before = /^(.+?)\s+(?:before|comes before|has to come before)\s+(.+)$/i.exec(t);
    if (before) {
      const a = labelOf(s, before[1]);
      const b = labelOf(s, before[2]);
      if (a && b && a.id !== b.id) return { op: 'link', args: { from: a.id, to: b.id, by: 'person' } };
    }
  }

  // add: "add a deadline: lab report on Nov 3", "add 'call the landlord' on Friday"
  const add = /^(?:please\s+)?(?:add|put|schedule|include)\b\s*(.*)$/i.exec(t);
  if (add) {
    const body = quotedOrAfterColon(add[1]) ?? add[1];
    const date = readDay(body, today);
    const planWord = /\b(task|item|event|deadline|step|milestone|reminder|meeting|exam|frame|scene|card)\b/i.test(add[1]);
    if (!date && !planWord) return null;
    let words = body
      .replace(/\b(?:on|by|due|for|at)\s+(?:the\s+)?[^,]*$/i, (m) => (readDay(m, today) ? '' : m))
      .replace(/^(?:a|an|the|new)\s+(?:task|item|event|deadline|step|milestone|reminder|frame|scene|card)\s*(?:called|named|for|to)?\s*/i, '')
      .replace(/[.!]+$/, '')
      .trim();
    if (!words) return null;
    words = words.replace(/^[“"']|[”"']$/g, '');
    return { op: 'add', args: { text: words, ...(date ? { date } : {}), by: 'person' } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

function factsOf(s: PlanState): string[] {
  const out: string[] = [`${s.title}: a plan of ${s.items.length} item${s.items.length === 1 ? '' : 's'}, shown as ${s.view}.`];
  const sp = span(s);
  if (sp) out.push(`It runs from ${sayDay(sp.start)} to ${sayDay(sp.end)} (${sp.days} days); ${s.items.filter((i) => i.date).length} of its items are dated.`);
  const p = progress(s);
  if (s.items.some((i) => i.status)) out.push(`${p.done} of ${p.total} done.`);
  for (const c of clashes(s).slice(0, 4)) {
    out.push(`${itemSaid(s, c.item)} is dated ${c.by} day${c.by === 1 ? '' : 's'} before ${itemSaid(s, c.waitsOn)}, which it waits on.`);
  }
  const mine = s.items.filter((i) => i.by === 'person').length;
  if (mine) out.push(`${mine} item${mine === 1 ? ' is' : 's are'} the person’s own; Socria does not change those.`);
  return out;
}

function textOf(s: PlanState): string {
  const lines = s.items.map((i, n) => {
    const when = i.date ? ` [${i.date}${i.end ? `→${i.end}` : ''}]` : '';
    const st = i.status ? ` (${STATUS_WORD[i.status].toLowerCase()})` : '';
    const lane = i.lane ? ` {${i.lane}}` : '';
    return `${n + 1}. ${i.text}${when}${st}${lane}${i.by === 'person' ? ' · theirs' : ''}`;
  });
  const deps = s.links.map((l) => `${itemSaid(s, l.to)} waits on ${itemSaid(s, l.from)}`);
  return [`PLAN “${s.title}”`, ...lines, ...(deps.length ? ['Dependencies:', ...deps] : [])].join('\n').slice(0, 2400);
}

export const PLAN = displayKind<PlanState>({
  kind: 'plan',
  label: 'Plan',
  sanitize: sanitizePlan,
  ops: PLAN_OPS,
  readOp: (text, s) => readPlanOp(text, s, todayDay()),
  consequence: (before, after) => {
    const was = new Set(clashes(before).map((c) => `${c.item}<${c.waitsOn}`));
    const now = clashes(after);
    const fresh = now.find((c) => !was.has(`${c.item}<${c.waitsOn}`));
    if (fresh) return `${itemSaid(after, fresh.item)} now falls ${fresh.by} day${fresh.by === 1 ? '' : 's'} before ${itemSaid(after, fresh.waitsOn)}, which it waits on.`;
    if (was.size > now.length) return 'That clears a clash: nothing it waits on comes after it now.';
    const pb = progress(before);
    const pa = progress(after);
    if (pa.done !== pb.done && after.items.some((i) => i.status)) return `${pa.done} of ${pa.total} done.`;
    return null;
  },
  facts: (s) => factsOf(s),
  text: textOf,
  parts: (s): Part[] => s.items.map((i) => ({ id: i.id, label: i.text })),
  partFacts: (s, part) => {
    const i = find(s, part);
    if (!i) return null;
    const waits = s.links.filter((l) => l.to === i.id).map((l) => itemSaid(s, l.from));
    const before = s.links.filter((l) => l.from === i.id).map((l) => itemSaid(s, l.to));
    return [
      i.text,
      ...(i.date ? [`on ${sayDay(i.date)}${i.end ? ` until ${sayDay(i.end)}` : ''}`] : ['no day yet']),
      ...(i.status ? [STATUS_WORD[i.status]] : []),
      ...(waits.length ? [`waits on ${waits.join(', ')}`] : []),
      ...(before.length ? [`${before.join(', ')} wait${before.length === 1 ? 's' : ''} on it`] : []),
      i.by === 'person' ? 'yours' : 'from Socria',
    ];
  },
  views,
  size: (s, mode) =>
    mode === 'card'
      ? { w: 260, h: 150 }
      : mode === 'trail'
        ? { w: 200, h: 110 }
        : { w: 680, h: Math.min(620, 150 + 30 * Math.max(3, s.items.length)) },
  shape: (s) => `${s.view === 'list' ? 'plan' : s.view} · ${s.items.length} item${s.items.length === 1 ? '' : 's'}`,
});

register(PLAN);
registerDisplay({ kind: 'plan', noun: 'plan', handle: 'P', about: 'Things to do or that happened, in time or in order — a timeline, a board, a checklist, a storyboard.' });
