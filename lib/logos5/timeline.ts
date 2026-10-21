// lib/logos5/timeline.ts — THE UNIVERSAL MAP IN ORDER: This month and All time.
//
// For the longer stretches the map is not a cloud but a line through time,
// read left to right: the oldest conversation furthest left, the newest
// furthest right. Remembering roughly when a conversation was is enough to
// find it — scroll back towards the left.
//   • EACH STAYS WHERE IT BEGAN. A conversation is placed at its first
//     message and never moves: opening it again does not carry it to the end,
//     so where something is stays something the person can remember.
//   • WHAT FOLLOWED ON IS JOINED. Conversations about the same subject (its
//     home — a Project, or the course or field it was read as being about,
//     spatial.ts homesOf), each begun within a week of the one before, are one
//     thread: beads on a line.
//   • RECENT AND OLD STAY APART. A subject that comes back after a longer gap
//     starts a new thread; no line is drawn across the gap. The new thread
//     carries a mark — ↩ and a date — for the last conversation of its subject
//     before it, so the way back is one press, not a line across months.
//   • A quick question on its own is not a thread: the quick ones sit along
//     the floor, under the threads.
//   • Lanes are worked out over the whole history, in order, so scrolling
//     never moves a thread to another row and nothing that came before is
//     moved by what comes after; a subject keeps to the row it had, when it
//     is free; a lane is used again once the thread in it ends.
//   • A stretch of more than two weeks with nothing begun in it is folded
//     down to one mark, so years of gaps are not years of scrolling.
// Today and This week stay the map (spatial.ts); this is the other two.
//
// PURE: every position is computed here, from the conversations and the time
// passed in.

import { dayStart, depthOf, isHub, weekStart, type Homes } from './spatial';
import { OTHER } from './subjects';
import type { Tile } from './universe';

export type TimeScope = 'month' | 'all';

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Begun within this many days of the one before, about the same subject: joined. */
export const JOIN_DAYS = 7;
/** A stretch longer than this with nothing begun in it is folded down to a mark. */
export const QUIET_DAYS = 14;

/** How big things are drawn: a day's width, a label's, a lane's height. */
export interface TimeSize {
  day: number;
  label: number;
  lane: number;
  /** the first lane's star, from the top: room for the week names and a thread's name */
  top: number;
  /** a folded stretch's width */
  gap: number;
  /** more room over the floor than between two lanes: its name sits over it */
  floor: number;
  /** room before the first day and after today */
  pad: number;
}
export const TIME_WIDE: TimeSize = { day: 120, label: 128, lane: 122, top: 96, gap: 150, pad: 140, floor: 0 };
export const TIME_NARROW: TimeSize = { day: 92, label: 96, lane: 104, top: 88, gap: 110, pad: 70, floor: 26 };
/** the ↩ mark before a thread */
const BACK_W = 84;

export interface TimeBead {
  id: string;
  x: number;
  y: number;
  r: number;
  hub: boolean;
  /** its words: under its star, over it, or only on its card */
  label: 'below' | 'above' | 'none';
  /** -1: the floor */
  lane: number;
  /** the thread it is on, if any */
  thread: string | null;
}

export interface TimeThread {
  key: string;
  /** the subject's key (spatial.ts Home); `other` for a hub about nothing in particular */
  home: string;
  name: string;
  color: string | null;
  lane: number;
  ids: string[];
  x0: number;
  x1: number;
  y: number;
  /** the last conversation of its subject begun before it: where it came back from */
  back: { id: string; at: number } | null;
}

export interface TimeDay {
  at: number;
  x: number;
  w: number;
  /** a Monday, the first of a month, or today */
  mark: 'day' | 'week' | 'month';
  today: boolean;
  /** "Mon 12", "Oct 1", "Today"; short: "M 12" */
  label: string;
  short: string;
}

export interface TimeGap {
  x: number;
  w: number;
  from: number;
  to: number;
  label: string;
}

export interface TimeLayout {
  beads: TimeBead[];
  byId: Map<string, TimeBead>;
  threads: TimeThread[];
  lanes: number;
  floorY: number | null;
  width: number;
  height: number;
  days: TimeDay[];
  gaps: TimeGap[];
  /** where now is, and where this week began */
  nowX: number;
  weekX: number;
  start: number;
  end: number;
}

export interface TimeIn {
  /** the conversations shown: hidden and filtered ones already left out */
  tiles: readonly Tile[];
  homes: Homes;
  now: number;
  /** where the line begins — the first of the month for This month; otherwise the first conversation */
  from?: number | null;
  narrow?: boolean;
}

/** The next local day's start (a day is not always 24 hours). */
function nextDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

const said = (at: number) => {
  const d = new Date(at);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

interface Seg {
  from: number;
  to: number;
  x: number;
  w: number;
  folded: boolean;
}

/** The radius of a conversation's star. */
function radiusOf(t: Tile, hub: boolean): number {
  return hub ? Math.round((8 + 3 * depthOf(t)) * 10) / 10 : 4.5;
}

/** How wide a thread's name is drawn: 10px capitals, spaced. */
const nameW = (name: string) => Math.round(name.length * 8.6 + 14);

export function timeLayout(input: TimeIn): TimeLayout {
  const { homes, now } = input;
  const S = input.narrow ? TIME_NARROW : TIME_WIDE;
  // when it began: its first message; without one, when it was last worked on; never after now
  const tiles = input.tiles.map((t) => ({ ...t, started: Math.min(now, t.started > 0 ? t.started : t.at > 0 ? t.at : now) }));
  const today = dayStart(now);
  const end = nextDay(today);
  const first = tiles.length ? Math.min(...tiles.map((t) => t.started)) : now;
  const start = Math.min(dayStart(input.from ?? first), today);

  // ── the line: a day after another, a long quiet stretch folded ──
  const active = new Set(tiles.map((t) => dayStart(Math.max(start, Math.min(t.started, now)))));
  active.add(today);
  const segs: Seg[] = [];
  let x = S.pad;
  for (let d = start; d < end; ) {
    if (!active.has(d)) {
      let e = d;
      let n = 0;
      while (e < end && !active.has(e)) {
        e = nextDay(e);
        n++;
      }
      if (n > QUIET_DAYS) {
        segs.push({ from: d, to: e, x, w: S.gap, folded: true });
        x += S.gap;
        d = e;
        continue;
      }
    }
    const nd = nextDay(d);
    segs.push({ from: d, to: nd, x, w: S.day, folded: false });
    x += S.day;
    d = nd;
  }
  const width = x + S.pad;
  const xOf = (at: number): number => {
    const t = Math.max(start, Math.min(at, end - 1));
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].from <= t) lo = mid;
      else hi = mid - 1;
    }
    const s = segs[lo];
    return Math.round((s.x + ((t - s.from) / (s.to - s.from)) * s.w) * 10) / 10;
  };

  // ── threads: a subject's conversations, each begun within a week of the one before ──
  const sorted = [...tiles].sort((a, b) => a.started - b.started || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const homeOf = (t: Tile) => {
    const h = homes.of.get(t.id);
    return h && h.key !== OTHER ? h : null;
  };
  const bySubject = new Map<string, Tile[]>();
  for (const t of sorted) {
    const h = homeOf(t);
    if (h) bySubject.set(h.key, [...(bySubject.get(h.key) ?? []), t]);
  }
  interface Run {
    home: string;
    name: string;
    color: string | null;
    tiles: Tile[];
    back: Tile | null;
  }
  const runs: Run[] = [];
  const loose: Tile[] = [];
  for (const [key, list] of bySubject) {
    const h = homes.of.get(list[0].id)!;
    let cur: Run | null = null;
    for (const t of list) {
      if (cur && t.started - cur.tiles[cur.tiles.length - 1].started <= JOIN_DAYS * DAY) cur.tiles.push(t);
      else {
        const before: Tile | null = cur ? cur.tiles[cur.tiles.length - 1] : null;
        cur = { home: key, name: h.name, color: h.color, tiles: [t], back: before };
        runs.push(cur);
      }
    }
  }
  // a quick question on its own is not a thread; a conversation about nothing in particular stands alone, or on the floor
  const threadsIn: Run[] = [];
  for (const r of runs) {
    if (r.tiles.length === 1 && !isHub(r.tiles[0])) loose.push(r.tiles[0]);
    else threadsIn.push(r);
  }
  for (const t of sorted) {
    if (homeOf(t)) continue;
    if (isHub(t)) threadsIn.push({ home: OTHER, name: '', color: null, tiles: [t], back: null });
    else loose.push(t);
  }

  // ── each thread's stars, in time, never on top of one another ──
  const beads: TimeBead[] = [];
  const placed = threadsIn.map((r, i) => {
    const key = `${r.home}#${i}`;
    let prev: { x: number; r: number } | null = null;
    const bs = r.tiles.map((t) => {
      const hub = isHub(t);
      const rad = radiusOf(t, hub);
      let bx = xOf(t.started);
      if (prev && bx < prev.x + prev.r + rad + 12) bx = prev.x + prev.r + rad + 12;
      prev = { x: bx, r: rad };
      return { id: t.id, x: bx, y: 0, r: rad, hub, label: 'below' as TimeBead['label'], lane: 0, thread: key };
    });
    return { r, key, bs, x0: bs[0].x, x1: bs[bs.length - 1].x };
  });

  // ── lanes, over the whole history, in order: what came before is placed first, so nothing
  // after it can move it. A thread takes the lane its subject had last, when that is free —
  // a subject keeps to its row — and otherwise the highest lane free for its span ──
  const half = S.label / 2 + 10;
  const laneEnds: number[] = [];
  const laneOf = new Map<string, number>();
  for (const p of [...placed].sort((a, b) => a.x0 - b.x0 || (a.key < b.key ? -1 : 1))) {
    const from = p.x0 - half - (p.r.back ? BACK_W : 0);
    const to = p.x1 + half;
    const own = p.r.home !== OTHER ? laneOf.get(p.r.home) : undefined;
    let lane = own !== undefined && laneEnds[own] + 14 < from ? own : laneEnds.findIndex((e) => e + 14 < from);
    if (lane < 0) {
      laneEnds.push(to);
      lane = laneEnds.length - 1;
    } else laneEnds[lane] = to;
    if (p.r.home !== OTHER) laneOf.set(p.r.home, lane);
    const y = S.top + lane * S.lane;
    for (const b of p.bs) {
      b.lane = lane;
      b.y = y;
    }
  }
  const lanes = laneEnds.length;
  const threads: TimeThread[] = placed.map((p) => ({
    key: p.key,
    home: p.r.home,
    name: p.r.name,
    color: p.r.color,
    lane: p.bs[0].lane,
    ids: p.bs.map((b) => b.id),
    x0: p.x0,
    x1: p.x1,
    y: p.bs[0].y,
    back: p.r.back ? { id: p.r.back.id, at: p.r.back.started } : null,
  }));
  for (const p of placed) beads.push(...p.bs);

  // ── the floor: quick questions, in time ──
  const floorY = loose.length ? S.top + lanes * S.lane + (lanes ? S.floor : 0) : null;
  let prevFloor = -Infinity;
  for (const t of [...loose].sort((a, b) => a.started - b.started || (a.id < b.id ? -1 : 1))) {
    let bx = xOf(t.started);
    if (bx < prevFloor + 18) bx = prevFloor + 18;
    prevFloor = bx;
    beads.push({ id: t.id, x: bx, y: floorY!, r: radiusOf(t, false), hub: false, label: 'below', lane: -1, thread: null });
  }

  // ── words: under the star, or over it, or only on its card. Given out by what matters most —
  // a long conversation before a quick one, then the one worked on last — so what was being
  // done today is always named, and a name never sits on another: not under the same lane,
  // not on the lane below's names over their stars, not on a thread's name ──
  const nameBox = new Map<number, { x0: number; x1: number }[]>();
  for (const t of threads) if (t.name && t.ids.length > 1) nameBox.set(t.lane, [...(nameBox.get(t.lane) ?? []), { x0: t.x0 - 9, x1: t.x0 - 9 + nameW(t.name) }]);
  const row = (b: TimeBead) => (b.lane < 0 ? lanes : b.lane);
  const under = new Map<number, number[]>();
  const over = new Map<number, number[]>();
  const clash = (xs: number[] | undefined, x: number) => !!xs && xs.some((ux) => Math.abs(ux - x) < S.label + 6);
  const atOf = new Map(tiles.map((t) => [t.id, t.at]));
  const byWorth = [...beads].sort((a, b) => Number(b.hub) - Number(a.hub) || (atOf.get(b.id) ?? 0) - (atOf.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1));
  for (const b of byWorth) {
    const r = row(b);
    const named = (nameBox.get(r) ?? []).some((n) => b.x + S.label / 2 > n.x0 && b.x - S.label / 2 < n.x1);
    if (!clash(under.get(r), b.x) && !clash(over.get(r + 1), b.x)) {
      b.label = 'below';
      under.set(r, [...(under.get(r) ?? []), b.x]);
    } else if (!clash(over.get(r), b.x) && !clash(under.get(r - 1), b.x) && !named) {
      b.label = 'above';
      over.set(r, [...(over.get(r) ?? []), b.x]);
    } else b.label = 'none';
  }

  // ── what is drawn under it all: the days, the folded stretches ──
  const days: TimeDay[] = [];
  const gaps: TimeGap[] = [];
  for (const s of segs) {
    if (s.folded) {
      gaps.push({ x: s.x, w: s.w, from: s.from, to: s.to, label: `${said(s.from)} – ${said(dayStart(s.to - 1))}` });
      continue;
    }
    const d = new Date(s.from);
    const isToday = s.from === today;
    const mark: TimeDay['mark'] = d.getDate() === 1 ? 'month' : d.getDay() === 1 ? 'week' : 'day';
    days.push({
      at: s.from,
      x: s.x,
      w: s.w,
      mark,
      today: isToday,
      label: isToday ? 'Today' : mark === 'month' ? said(s.from) : `${DAYS[d.getDay()]} ${d.getDate()}`,
      short: isToday ? 'Today' : mark === 'month' ? said(s.from) : `${DAYS[d.getDay()][0]} ${d.getDate()}`,
    });
  }

  const lowest = floorY ?? (lanes ? S.top + (lanes - 1) * S.lane : S.top);
  return {
    beads,
    byId: new Map(beads.map((b) => [b.id, b])),
    threads,
    lanes,
    floorY,
    width,
    height: lowest + 92,
    days,
    gaps,
    nowX: xOf(now),
    weekX: xOf(Math.max(start, weekStart(now))),
    start,
    end,
  };
}

/** The first of the month a moment falls in (local). */
export function monthStart(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
