// lib/logos5/bubbles.ts — THE UNIVERSAL MAP, DRAWN AS SUBJECTS.
//
// "Your map, not a list." Today and This week are drawn as the person's own
// design draws them: each subject a large dashed circle, named round its
// upper edge — "ACCOUNTING · ACCT 2301"; inside it each real study session a
// disc in the subject's colour with its name set inside it — the more it
// holds, the larger — touching the session it follows on from, joined to it
// by a short line; and each quick question a small dot on a spoke from the
// session nearest it in time, its words beside it, on the side away from the
// rest of the map. The session to pick up from wears a pale halo.
//
// What joins two subjects is a dashed curve from one session to the other,
// and the one that matters most says why, on a card at the top of its arc:
// a link the person drew first ("You linked these", in their words), then an
// idea both come back to. On Today, a subject worked on lately but not today
// is folded to its name and a few dots; pressed, it opens.
//
// The person's own Projects are always on the map, whichever lens: a Project
// with conversations here is a circle like a subject's (drawn as theirs, in its
// own colour); one with nothing here is folded to its name and how many it
// holds, pressed to open; an empty one waits to be dragged into. Room is kept
// at the end for a new one.
//
// Every position is computed here, deterministically — no randomness, no
// clock (the time is passed in) — so the same conversations draw the same
// map on every screen.
//
// PURE.

import type { OwnLink, SizeBy } from './arrange';
import { boxAround, freshness, type Box, type SharedIdea, type Tile } from './universe';
import { dayStart, depthOf, hashOf, isHub, todayOf, weekStart, type Home, type Homes, type TodayPlan } from './spatial';
import { fieldName, OTHER } from './subjects';

export type BubbleLens = 'today' | 'week';

export interface Pt {
  x: number;
  y: number;
}

export interface BubbleIn {
  lens: BubbleLens;
  /**
   * The conversations to draw from: hidden and filtered ones already left
   * out. Today: all of them — the day and what it builds on are chosen here;
   * This week: the week's.
   */
  tiles: readonly Tile[];
  homes: Homes;
  /** the ideas they share */
  ideas: readonly SharedIdea[];
  /** the links the person drew */
  links: readonly Pick<OwnLink, 'id' | 'a' | 'b' | 'label'>[];
  now: number;
  narrow?: boolean;
  /** This week: the subjects the person folded */
  folded?: ReadonlySet<string>;
  /** Today: the folded subjects the person opened */
  opened?: ReadonlySet<string>;
  /** where to pick up: haloed, when it is drawn */
  resumeId?: string | null;
  /** the link the person pointed at: its card is the one shown */
  cardFor?: string | null;
  /** a session's disc sized by how much it holds (the default), by how recent it is, or all alike */
  size?: SizeBy;
  /** the ideas two subjects share drawn between them (the default); the person's own links always are */
  ideaLinks?: boolean;
  /** every conversation shown, whatever the lens: for how many a Project holds, and its newest when opened (default: tiles) */
  all?: readonly Tile[];
  /** room kept for a new Project, at the end of the folded row */
  canMake?: boolean;
}

export interface BubbleHub {
  id: string;
  /** its subject's key */
  g: string;
  x: number;
  y: number;
  r: number;
  /** the first of its subject here is in the subject's colour; the others a shade lighter */
  shade: 0 | 1;
  /** where to pick up (or the day's newest): a pale halo round it */
  halo: boolean;
  /** one of the day's, on Today */
  focus: boolean;
  /** "today", "yesterday", "Tue", "last week", "Oct 5" */
  when: string;
  /** under its name: when, and what it holds when there is room — "today · 3 files · 7 topics" */
  sub: string;
  /** the size its name is set at, and the lines it may take */
  font: number;
  lines: number;
  /** Today: why it is beside the day's */
  why?: string;
}

export interface BubbleDot {
  id: string;
  g: string;
  x: number;
  y: number;
  r: number;
  /** the session it hangs from; null in a subject with no sessions here */
  hub: string | null;
  /** its words: right of the dot, left of it, or over or under it */
  side: 'right' | 'left' | 'above' | 'below';
  /** which edge of its words is by the dot */
  align: 'start' | 'end' | 'center';
  label: Box;
  /** its words drawn without it being pointed at: there was room for them */
  named: boolean;
  /** Today: why it is beside the day's */
  why?: string;
}

export interface BubbleCluster {
  /** its home's key: `p:<id>`, `c:…`, `f:…`, `other` */
  key: string;
  kind: Home['kind'];
  /** its field, when the name does not already say it: "Accounting" for ACCT 2301 */
  field: string | null;
  name: string;
  color: string | null;
  projectId: string | null;
  /** its circle; a folded one's is the room round its name and dots */
  x: number;
  y: number;
  r: number;
  /** where its name is written: on the circle's upper left, or over its dots when folded */
  label: Box;
  folded: boolean;
  /** folded: a dot for each of a few of its conversations, under its name */
  pips: { x: number; y: number; r: number }[];
  /** how many conversations it has here (folded: how many it would open to) */
  count: number;
  /** not what this lens is about — a subject worked on lately but not today, or a Project with nothing here — so its opening is not kept */
  far: boolean;
  /** a Project with nothing in it yet: there to be dragged into */
  empty: boolean;
  /** shown in a Project for their subject, not filed in it */
  suggested: string[];
  /** what is drawn in it */
  ids: string[];
}

export interface BubbleCard extends Box {
  /** the link it is about */
  link: string;
  title: string;
  /** what joins them, a part of it stressed */
  says: { text: string; em?: boolean }[];
  /** when they were opened */
  note: string;
}

export interface BubbleLink {
  key: string;
  a: string;
  b: string;
  /** drawn by the person, or an idea both come back to */
  kind: 'own' | 'idea';
  /** the person's link, to change its words or take it away */
  own: string | null;
  /** the person's words for it */
  label: string;
  /** the idea, when it is one */
  idea: string | null;
  /** across two subjects */
  across: boolean;
  /** a curve from one disc's edge, bent over, to the other's */
  p0: Pt;
  c: Pt;
  p1: Pt;
}

export interface BubbleLayout {
  lens: BubbleLens;
  hubs: BubbleHub[];
  dots: BubbleDot[];
  clusters: BubbleCluster[];
  /** a session to the one it follows on from, edge to edge */
  joins: [string, string][];
  /** a quick question to its session */
  spokes: [string, string][];
  links: BubbleLink[];
  /** the card over the link that matters most; null when nothing joins two subjects */
  card: BubbleCard | null;
  /** where a new Project is made, at the end of the folded row; null when there is no room asked for */
  make: Box | null;
  /** every conversation drawn: where, how big, which subject */
  byId: Map<string, { x: number; y: number; r: number; g: string; hub: boolean }>;
  bounds: Box;
  /** what the view is fitted to first */
  focus: Box;
  /** Today: which day it is about */
  today?: { when: TodayPlan['when']; day: number };
}

// ── measures ─────────────────────────────────────────────────────────

/** A session's disc, smallest to largest; a phone's are smaller. */
export const HUB_R = { min: 46, max: 100 } as const;
const HUB_R_NARROW = { min: 40, max: 80 } as const;
/** one of the day's is never smaller than this, nor the one to pick up */
const FOCUS_R = 60;
const HALO_R = 66;
/** the halo's width, outside the disc */
export const HALO = 12;
/** a quick question's dot; a Core chat's */
export const DOT_R = 5.5;
const CHAT_R = 4.5;
/** between two sessions that touch */
const HUB_GAP = 18;
/** from a session's edge out to its quick questions, nearest first */
const SPOKES = [58, 80, 104, 130, 158];
const SPOKES_NARROW = [46, 64, 84, 106, 130];
/** a quick question's words: one line, or two when long */
const DOT_LABEL_W = 172;
const DOT_LABEL_W_NARROW = 128;
const DOT_LINE = 17;
/** a subject's circle round what is in it, and between two */
const CLUSTER_PAD = 40;
const CLUSTER_GAP = 64;
const CLUSTER_GAP_NARROW = 30;
const CLUSTER_MIN_R = 120;
/** a subject's name: letter-spaced capitals */
const NAME_H = 16;
/** the card over a link: its width, and how far its foot is over the higher of the two sessions */
export const CARD_W = 268;
const CARD_RISE = 34;
const CARD_W_NARROW = 232;
/** on Today, the subjects not worked on today but lately: this many at most, from this far back */
const FAR_MAX = 3;
const FAR_DAYS = 21;
/** a folded subject's dots under its name */
const PIPS = 3;
/** between two folded ones, and from one row of them to the next */
const FOLD_GAP = 56;
const FOLD_ROW = 84;
/** an empty Project: its name, and "Empty — drag one here" under it */
const EMPTY_W = 172;
/** "+ New project" */
export const MAKE_W = 150;
/** a folded subject opened on Today shows its newest few */
const OPENED_MAX = 8;
/** on Today, round each subject drawn, its quick questions of lately: this many at most */
const QUICK_MAX = 3;
/** links drawn across, at most */
const LINKS_MAX = 6;

const DAY = 86_400_000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ── words ────────────────────────────────────────────────────────────

/** When a conversation was last worked on, as the map says it: "today", "yesterday", "Tue", "last week", "Oct 5". */
export function whenSaid(at: number, now: number): string {
  const d0 = dayStart(now);
  if (at >= d0) return 'today';
  if (at >= d0 - DAY) return 'yesterday';
  const w0 = weekStart(now);
  if (at >= w0) return DAYS[new Date(at).getDay()];
  if (at >= w0 - 7 * DAY) return 'last week';
  const d = new Date(at);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** The day two were opened together, in a sentence: "today", "yesterday", "on Tuesday", "on Oct 5". */
function daySaid(at: number, now: number): string {
  const d0 = dayStart(now);
  if (at >= d0) return 'today';
  if (at >= d0 - DAY) return 'yesterday';
  if (at >= d0 - 6 * DAY) return `on ${DAY_NAMES[new Date(at).getDay()]}`;
  const d = new Date(at);
  return `on ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a session holds, said under its name when there is room: its files and topics, or its ideas. */
function holds(t: Tile): string[] {
  const out: string[] = [];
  if (t.files) out.push(plural(t.files, 'file'));
  if (t.topics) out.push(plural(t.topics, 'topic'));
  else if (t.count >= 3) out.push(plural(t.count, 'idea'));
  return out;
}

/**
 * A subject's name as its circle says it: its field and its own name —
 * "Accounting · ACCT 2301" — or its name alone when that already says it.
 */
export function subjectWords(h: Pick<Home, 'kind' | 'name' | 'subject'>): { field: string | null; name: string } {
  if (h.kind === 'other') return { field: null, name: 'Everything else' };
  const s = h.subject;
  let field: string | null = null;
  if (s) field = s.kind === 'course' ? (s.field ? fieldName(s.field) : null) : h.kind === 'project' ? s.name : null;
  if (field && h.name.toLowerCase().includes(field.toLowerCase())) field = null;
  return { field, name: h.name };
}

/** A line of capitals, letter-spaced, at 11px: how wide it is drawn. */
const capsW = (s: string) => Math.round(s.length * 8.7 + 10);
/** A quick question's words at 13px, as wide as they are drawn — about, and a little over rather than under. */
const wordsW = (s: string) => s.length * 7.1;

// ── geometry ─────────────────────────────────────────────────────────

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const overlaps = (a: Box, b: Box, air = 0) => a.x < b.x + b.w + air && b.x < a.x + a.w + air && a.y < b.y + b.h + air && b.y < a.y + a.h + air;
/** A circle and a box touch (or come within `air` of each other). */
function circleHitsBox(c: Pt, r: number, b: Box, air = 0): boolean {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - nx, c.y - ny) < r + air;
}
const rad = (deg: number) => (deg * Math.PI) / 180;
/** How far a point is from a line between two others. */
function toSegment(c: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * vx + (c.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(c.x - (a.x + t * vx), c.y - (a.y + t * vy));
}
/** The smaller angle between two directions, in degrees. */
function apart(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}
const round = (n: number) => Math.round(n * 10) / 10;

/** The middle of the smallest circle round some points, near enough: stepped towards the furthest, less each time (Bădoiu–Clarkson). */
function enclosing(pts: readonly Pt[]): Pt {
  if (!pts.length) return { x: 0, y: 0 };
  let c = { x: pts[0].x, y: pts[0].y };
  for (let i = 1; i <= 240; i++) {
    let f = pts[0];
    let fd = -1;
    for (const p of pts) {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d > fd) {
        fd = d;
        f = p;
      }
    }
    c = { x: c.x + (f.x - c.x) / (i + 1), y: c.y + (f.y - c.y) / (i + 1) };
  }
  return { x: round(c.x), y: round(c.y) };
}

// ── one subject, round its first session ─────────────────────────────

interface Member {
  tile: Tile;
  hub: boolean;
  focus: boolean;
  halo: boolean;
  /** Today: why an earlier one is drawn beside the day's — "shares “Accrual basis”", "you linked these" */
  why?: string;
}

interface Local {
  hubs: BubbleHub[];
  dots: BubbleDot[];
  joins: [string, string][];
  spokes: [string, string][];
  /** the circle round all of it, in its own frame */
  c: Pt;
  r: number;
}

/** How big a session's disc is: by how much it holds (or how recent it is, or all alike); one of the day's, and the one to pick up, never small. */
export function hubRadius(t: Pick<Tile, 'turns' | 'count' | 'made' | 'look' | 'at'>, o: { narrow?: boolean; focus?: boolean; halo?: boolean; by?: SizeBy; now?: number } = {}): number {
  const R = o.narrow ? HUB_R_NARROW : HUB_R;
  const f = o.by === 'recency' ? freshness(t.at, o.now ?? t.at) : o.by === 'same' ? 0.3 : depthOf(t);
  let r = R.min + (R.max - R.min) * f;
  const k = o.narrow ? R.max / HUB_R.max : 1;
  if (o.focus) r = Math.max(r, FOCUS_R * k);
  if (o.halo) r = Math.max(r, HALO_R * k);
  return Math.round(r);
}

/** The size a session's name is set at inside its disc, and how many lines it may take. */
function typeOf(r: number): { font: number; lines: number } {
  return { font: Math.max(13, Math.min(22, Math.round(9 + r * 0.125))), lines: r >= 64 ? 3 : 2 };
}

/** The places a session is tried beside the one it follows on from: right and a little down first, as drawn. */
const HUB_ANGLES = [18, -24, 162, -156, 62, -64, 118, -116, 40, -42, 140, -138, 90, -90, 0, 180];
/** The ways a quick question can hang from its session, round the clock from the upper left. */
const DOT_ANGLES = Array.from({ length: 24 }, (_, i) => -135 + i * 15);

/**
 * One subject: its sessions as touching discs round the first, each beside
 * the one closest to it in time; its quick questions on spokes, away from
 * the other sessions and from the way the rest of the map lies (`away`).
 */
function layOut(members: readonly Member[], now: number, narrow: boolean, away: readonly number[], by: SizeBy = 'ideas'): Local {
  const hubsIn = members.filter((m) => m.hub);
  const dotsIn = members.filter((m) => !m.hub);
  // the halo first, then the day's, then the newest
  hubsIn.sort((a, b) => Number(b.halo) - Number(a.halo) || Number(b.focus) - Number(a.focus) || b.tile.at - a.tile.at || byId(a.tile, b.tile));
  const hubs: BubbleHub[] = [];
  const joins: [string, string][] = [];
  const room = (h: BubbleHub) => h.r + (h.halo ? HALO : 0);
  hubsIn.forEach((m, i) => {
    const r = hubRadius(m.tile, { narrow, focus: m.focus, halo: m.halo, by, now });
    const { font, lines } = typeOf(r);
    const when = whenSaid(m.tile.at, now);
    const sub = [when, ...(r >= 78 ? holds(m.tile) : [])].join(' · ');
    const hub: BubbleHub = { id: m.tile.id, g: '', x: 0, y: 0, r, shade: i === 0 ? 0 : 1, halo: m.halo, focus: m.focus, when, sub, font, lines, ...(m.why ? { why: m.why } : {}) };
    if (i > 0) {
      // beside the one closest to it in time, as near the first as there is room
      const parent = hubs.reduce((best, h) => {
        const t = members.find((x) => x.tile.id === h.id)!.tile;
        const bt = members.find((x) => x.tile.id === best.id)!.tile;
        return Math.abs(t.started - m.tile.started) < Math.abs(bt.started - m.tile.started) ? h : best;
      }, hubs[0]);
      let at: Pt | null = null;
      for (let ring = 0; ring < 8 && !at; ring++) {
        let best: { p: Pt; cost: number } | null = null;
        for (const deg of HUB_ANGLES) {
          const d = room(parent) + r + HUB_GAP + ring * 34;
          const p = { x: round(parent.x + Math.cos(rad(deg)) * d), y: round(parent.y + Math.sin(rad(deg)) * d) };
          if (hubs.some((h) => dist(h, p) < room(h) + r + HUB_GAP - 0.5)) continue;
          const cost = Math.hypot(p.x, p.y);
          if (!best || cost < best.cost - 0.5) best = { p, cost };
        }
        at = best?.p ?? null;
      }
      hub.x = at?.x ?? 0;
      hub.y = at?.y ?? (i * 2 * r);
      joins.push([parent.id, hub.id]);
    }
    hubs.push(hub);
  });

  // the quick questions, newest first, each from the session nearest it in time
  const dots: BubbleDot[] = [];
  const spokes: [string, string][] = [];
  const labels: Box[] = [];
  const maxW = narrow ? DOT_LABEL_W_NARROW : DOT_LABEL_W;
  const spokesAt = narrow ? SPOKES_NARROW : SPOKES;
  const sorted = [...dotsIn].sort((a, b) => b.tile.at - a.tile.at || byId(a.tile, b.tile));
  const hangs = new Map<string, number[]>();
  for (const m of sorted) {
    const r = m.tile.kind === 'core' ? CHAT_R : DOT_R;
    const words = m.tile.title;
    const w1 = wordsW(words);
    const w = Math.round(Math.min(maxW, w1 + 4));
    const h = w1 > maxW ? DOT_LINE * 2 : DOT_LINE;
    let anchor: BubbleHub | null = null;
    for (const hb of hubs) {
      const t = members.find((x) => x.tile.id === hb.id)!.tile;
      if (!anchor) anchor = hb;
      else {
        const at = members.find((x) => x.tile.id === anchor!.id)!.tile;
        if (Math.abs(t.at - m.tile.at) < Math.abs(at.at - m.tile.at)) anchor = hb;
      }
    }
    const from: Pt = anchor ?? { x: 0, y: 0 };
    const base = anchor ? room(anchor) : 0;
    // the ways not to hang it: towards the other sessions, the other quick questions of this one, and the rest of the map
    const blocked = [
      ...(anchor ? hubs.filter((x) => x !== anchor).map((x) => (Math.atan2(x.y - anchor!.y, x.x - anchor!.x) * 180) / Math.PI) : []),
      ...(hangs.get(anchor?.id ?? '') ?? []),
      ...away,
    ];
    // away from all of that; on a wide screen the diagonals, as drawn; on a phone over and under, to keep it narrow
    const pref = (deg: number) => Math.min(70, blocked.length ? Math.min(...blocked.map((b) => apart(deg, b))) : 70) + (narrow ? 26 * Math.abs(Math.sin(rad(deg))) : 10 * Math.abs(Math.sin(rad(2 * deg))));
    const ways = [...DOT_ANGLES].sort((a, b) => pref(b) - pref(a));
    const place = (deg: number, spoke: number) => {
      const p = { x: round(from.x + Math.cos(rad(deg)) * (base + spoke)), y: round(from.y + Math.sin(rad(deg)) * (base + spoke)) };
      const cos = Math.cos(rad(deg));
      const sin = Math.sin(rad(deg));
      let side: BubbleDot['side'];
      let align: BubbleDot['align'];
      let label: Box;
      if (cos > 0.42) {
        side = 'right';
        align = 'start';
        label = { x: p.x + r + 7, y: p.y - h / 2, w, h };
      } else if (cos < -0.92) {
        side = 'left';
        align = 'end';
        label = { x: p.x - r - 7 - w, y: p.y - h / 2, w, h };
      } else {
        side = sin < 0 ? 'above' : 'below';
        // on the left, the words end a little past the dot; straight up or down, they are centred on it
        align = cos < -0.25 ? 'end' : 'center';
        const x = align === 'end' ? p.x + 32 - w : p.x - w / 2;
        label = { x, y: side === 'above' ? p.y - r - 6 - h : p.y + r + 6, w, h };
      }
      label = { x: round(label.x), y: round(label.y), w: label.w, h: label.h };
      return { p, side, align, label };
    };
    const free = (p: Pt, label: Box | null) => {
      if (hubs.some((x) => dist(x, p) < room(x) + r + 8)) return false;
      // its spoke crosses no other session
      if (anchor && hubs.some((x) => x !== anchor && toSegment(x, anchor!, p) < room(x) + 3)) return false;
      if (dots.some((d) => dist(d, p) < d.r + r + 10)) return false;
      if (labels.some((b) => circleHitsBox(p, r, b, 5))) return false;
      if (!label) return true;
      if (hubs.some((x) => circleHitsBox(x, room(x), label, 6))) return false;
      if (dots.some((d) => circleHitsBox(d, d.r, label, 5))) return false;
      return !labels.some((b) => overlaps(b, label, 4));
    };
    let chosen: (ReturnType<typeof place> & { named: boolean }) | null = null;
    // a little longer or shorter by the question itself, so those round a session are not on one ring
    const vary = (hashOf(m.tile.id) % 3) * 11;
    for (const spoke of spokesAt) {
      for (const deg of ways) {
        const c = place(deg, spoke + vary);
        if (free(c.p, c.label)) {
          chosen = { ...c, named: true };
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen)
      // no room for its words: the dot alone, its words when it is pointed at
      for (const spoke of spokesAt)
        for (const deg of ways) {
          const c = place(deg, spoke);
          if (!chosen && free(c.p, null)) chosen = { ...c, named: false };
        }
    if (!chosen) chosen = { ...place(ways[0], spokesAt[spokesAt.length - 1] + 30 * dots.length), named: false };
    const deg = (Math.atan2(chosen.p.y - from.y, chosen.p.x - from.x) * 180) / Math.PI;
    if (anchor) hangs.set(anchor.id, [...(hangs.get(anchor.id) ?? []), deg]);
    dots.push({ id: m.tile.id, g: '', x: chosen.p.x, y: chosen.p.y, r, hub: anchor?.id ?? null, side: chosen.side, align: chosen.align, label: chosen.label, named: chosen.named, ...(m.why ? { why: m.why } : {}) });
    if (chosen.named) labels.push(chosen.label);
    if (anchor) spokes.push([m.tile.id, anchor.id]);
  }

  // the circle round all of it: as small as holds everything drawn, and a little air
  const pts: Pt[] = [];
  for (const x of hubs) for (let k = 0; k < 16; k++) pts.push({ x: x.x + Math.cos((k * Math.PI) / 8) * room(x), y: x.y + Math.sin((k * Math.PI) / 8) * room(x) });
  for (const d of dots) {
    pts.push({ x: d.x - d.r, y: d.y - d.r }, { x: d.x + d.r, y: d.y + d.r });
    if (d.named) pts.push({ x: d.label.x, y: d.label.y }, { x: d.label.x + d.label.w, y: d.label.y }, { x: d.label.x, y: d.label.y + d.label.h }, { x: d.label.x + d.label.w, y: d.label.y + d.label.h });
  }
  const c = enclosing(pts);
  const far = Math.max(0, ...pts.map((p) => dist(c, p)));
  return { hubs, dots, joins, spokes, c, r: Math.max(narrow ? CLUSTER_MIN_R * 0.8 : CLUSTER_MIN_R, Math.round(far + CLUSTER_PAD)) };
}

// ── subjects side by side ────────────────────────────────────────────

/**
 * Circles packed round the first, each touching one placed before it (or
 * two), as near the first as there is room — wider than tall on a wide
 * screen, one under another on a phone.
 */
export function packCircles(rs: readonly number[], o: { gap: number; narrow?: boolean }): Pt[] {
  const out: Pt[] = [];
  const ax = o.narrow ? 1 : 1.8;
  const ay = o.narrow ? 2.6 : 1;
  rs.forEach((r, i) => {
    if (i === 0) return void out.push({ x: 0, y: 0 });
    const cands: Pt[] = [];
    for (let j = 0; j < i; j++) {
      const dj = rs[j] + r + o.gap;
      for (let k = 0; k < 36; k++) cands.push({ x: out[j].x + Math.cos(rad(k * 10)) * dj, y: out[j].y + Math.sin(rad(k * 10)) * dj });
      // touching two at once
      for (let k = j + 1; k < i; k++) {
        const dk = rs[k] + r + o.gap;
        const d = dist(out[j], out[k]);
        if (d > dj + dk || d < Math.abs(dj - dk) || d === 0) continue;
        const a = (dj * dj - dk * dk + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, dj * dj - a * a));
        const mx = out[j].x + (a * (out[k].x - out[j].x)) / d;
        const my = out[j].y + (a * (out[k].y - out[j].y)) / d;
        cands.push({ x: mx + (h * (out[k].y - out[j].y)) / d, y: my - (h * (out[k].x - out[j].x)) / d });
        cands.push({ x: mx - (h * (out[k].y - out[j].y)) / d, y: my + (h * (out[k].x - out[j].x)) / d });
      }
    }
    let best: Pt | null = null;
    let bestCost = Infinity;
    for (const p of cands) {
      if (out.some((q, m) => dist(p, q) < rs[m] + r + o.gap - 0.5)) continue;
      // when it is all the same: right before left, and a little up before down — on a phone, down, to be read from the top
      const cost = (p.x / ax) ** 2 + (p.y / ay) ** 2 - p.x * 0.01 + (o.narrow ? -p.y : p.y) * 0.004;
      if (cost < bestCost - 1e-6) {
        bestCost = cost;
        best = p;
      }
    }
    out.push(best ? { x: round(best.x), y: round(best.y) } : { x: 0, y: out.length * 1000 });
  });
  return out;
}

// ── what is drawn, by lens ───────────────────────────────────────────

interface Group {
  home: Home;
  members: Member[];
  folded: boolean;
  far: boolean;
  /** folded: how many it holds */
  count: number;
}

/**
 * What each lens draws, subject by subject: Today, the day and what it builds
 * on, and a few subjects folded; This week, the week — and, either way, every
 * Project of the person's, folded when it has nothing here.
 */
function groupsOf(input: BubbleIn): { groups: Group[]; today?: BubbleLayout['today'] } {
  const { tiles, homes, now } = input;
  const homeOf = (id: string): Home => homes.of.get(id) ?? homes.list.find((h) => h.key === OTHER) ?? { key: OTHER, kind: 'other', name: 'Everything else', color: null, projectId: null, subject: null, archived: false };
  const groups = new Map<string, Group>();
  const add = (t: Tile, focus: boolean, halo: boolean, hub: boolean, why?: string) => {
    const home = homeOf(t.id);
    const g = groups.get(home.key) ?? { home, members: [], folded: false, far: false, count: 0 };
    g.members.push({ tile: t, hub, focus, halo, ...(why ? { why } : {}) });
    g.count = g.members.length;
    groups.set(home.key, g);
  };
  const newestFirst = (a: Tile, b: Tile) => b.at - a.at || byId(a, b);
  /** one not otherwise drawn here: folded, saying how many it holds — or, opened by the person, its newest few */
  const elsewhere = (home: Home, list: readonly Tile[]): Group => {
    const mine = [...list].sort(newestFirst);
    const open = !!input.opened?.has(home.key) && mine.length > 0;
    const g: Group = { home, members: [], folded: !open, far: true, count: mine.length };
    for (const t of mine.slice(0, open ? OPENED_MAX : PIPS + 2)) g.members.push({ tile: t, hub: isHub(t), focus: false, halo: false });
    if (open && !g.members.some((m) => m.hub)) g.members[0].hub = true;
    return g;
  };
  /** every Project of the person's not drawn already — an empty one too — in their order */
  const projectsAway = (): Group[] => {
    const pool = input.all ?? tiles;
    return homes.list.filter((h) => h.kind === 'project' && !h.archived && !groups.has(h.key)).map((h) => elsewhere(h, pool.filter((t) => homeOf(t.id).key === h.key)));
  };

  if (input.lens === 'week') {
    const haloId = input.resumeId && tiles.some((t) => t.id === input.resumeId) ? input.resumeId : null;
    for (const t of [...tiles].sort(newestFirst)) add(t, false, t.id === haloId, isHub(t) || t.id === haloId);
    for (const g of groups.values()) g.folded = !!input.folded?.has(g.home.key);
    const away = projectsAway();
    return { groups: [...order([...groups.values()]), ...away] };
  }

  const plan = todayOf(tiles, homes, input.ideas, now, input.links);
  const drawn = new Set([...plan.today, ...plan.ring.map((r) => r.tile)].map((t) => t.id));
  const haloId = input.resumeId && drawn.has(input.resumeId) ? input.resumeId : plan.today[0]?.id ?? null;
  const day = new Set(plan.today.map((t) => t.id));
  for (const t of plan.today) add(t, true, t.id === haloId, isHub(t) || t.id === haloId);
  for (const r of plan.ring) add(r.tile, false, r.tile.id === haloId, isHub(r.tile) || r.tile.id === haloId, r.why);
  // round each subject drawn, the quick questions asked in it lately
  const asked = new Map<string, number>();
  for (const t of plan.rest) {
    const key = homeOf(t.id).key;
    const g = groups.get(key);
    if (!g || key === OTHER || isHub(t) || t.at < now - FAR_DAYS * DAY || (asked.get(key) ?? 0) >= QUICK_MAX) continue;
    asked.set(key, (asked.get(key) ?? 0) + 1);
    g.members.push({ tile: t, hub: false, focus: false, halo: false });
    g.count = g.members.length;
  }
  // a subject of the day's with no session in it: its newest of the day is one
  for (const g of groups.values())
    if (!g.members.some((m) => m.hub)) {
      const first = g.members.filter((m) => day.has(m.tile.id)).sort((a, b) => newestFirst(a.tile, b.tile))[0];
      if (first) first.hub = true;
    }
  const away = projectsAway();
  // the subjects (not Projects: those are all there already) worked on lately but not today, the newest first
  const later = new Map<string, Tile[]>();
  for (const t of plan.rest) {
    const h = homeOf(t.id);
    if (h.key === OTHER || h.kind === 'project' || groups.has(h.key) || t.at < now - FAR_DAYS * DAY) continue;
    later.set(h.key, [...(later.get(h.key) ?? []), t]);
  }
  const far = [...later.entries()]
    .sort((a, b) => Math.max(...b[1].map((t) => t.at)) - Math.max(...a[1].map((t) => t.at)) || (a[0] < b[0] ? -1 : 1))
    .slice(0, FAR_MAX)
    .map(([key]) => elsewhere(homeOf(later.get(key)![0].id), plan.rest.filter((t) => homeOf(t.id).key === key)));
  return { groups: [...order([...groups.values()]), ...away, ...far], today: { when: plan.when, day: plan.day } };
}

/** The subjects in the order they are packed: the one with the halo first, then the fullest, then the newest. */
function order(groups: Group[]): Group[] {
  const newest = (g: Group) => Math.max(0, ...g.members.map((m) => m.tile.at));
  return groups.sort(
    (a, b) =>
      Number(b.members.some((m) => m.halo)) - Number(a.members.some((m) => m.halo)) ||
      b.members.filter((m) => m.focus).length - a.members.filter((m) => m.focus).length ||
      b.members.length - a.members.length ||
      newest(b) - newest(a) ||
      (a.home.key < b.home.key ? -1 : 1)
  );
}

// ── the whole map ────────────────────────────────────────────────────

/** Today or This week, drawn as subjects. */
export function bubbleLayout(input: BubbleIn): BubbleLayout {
  const narrow = !!input.narrow;
  const { groups, today } = groupsOf(input);
  const open = groups.filter((g) => !g.folded && g.members.length);
  const folded = groups.filter((g) => g.folded);
  const gap = narrow ? CLUSTER_GAP_NARROW : CLUSTER_GAP;

  // first the sessions alone, packed, to know which way the rest of the map lies from each subject; then with the quick questions, away from it
  const by = input.size ?? 'ideas';
  const rough = open.map((g) => layOut(g.members.filter((m) => m.hub), input.now, narrow, [], by).r + (g.members.some((m) => !m.hub) ? 70 : 0));
  const roughAt = packCircles(rough, { gap, narrow });
  const locals = open.map((g, i) => {
    // on a phone the subjects are one under another, and what hangs from them goes over and under, not out to the sides
    const away = narrow ? [] : roughAt.flatMap((p, j) => (j === i ? [] : [(Math.atan2(p.y - roughAt[i].y, p.x - roughAt[i].x) * 180) / Math.PI]));
    return layOut(g.members, input.now, narrow, away, by);
  });
  const at = packCircles(locals.map((l) => l.r), { gap, narrow });

  const hubs: BubbleHub[] = [];
  const dots: BubbleDot[] = [];
  const joins: [string, string][] = [];
  const spokes: [string, string][] = [];
  const clusters: BubbleCluster[] = [];
  open.forEach((g, i) => {
    const L = locals[i];
    // the circle's centre goes where it was packed, and everything in it with it
    const dx = at[i].x - L.c.x;
    const dy = at[i].y - L.c.y;
    for (const h of L.hubs) hubs.push({ ...h, g: g.home.key, x: round(h.x + dx), y: round(h.y + dy) });
    for (const d of L.dots) dots.push({ ...d, g: g.home.key, x: round(d.x + dx), y: round(d.y + dy), label: { ...d.label, x: round(d.label.x + dx), y: round(d.label.y + dy) } });
    joins.push(...L.joins);
    spokes.push(...L.spokes);
    const words = subjectWords(g.home);
    const said = words.field ? `${words.field} · ${words.name}` : words.name;
    clusters.push({
      key: g.home.key,
      kind: g.home.kind,
      field: words.field,
      name: words.name,
      color: g.home.color,
      projectId: g.home.projectId,
      x: at[i].x,
      y: at[i].y,
      r: L.r,
      // on the circle's upper left, its edge running through the name, as drawn
      label: { x: round(at[i].x - 0.86 * L.r), y: round(at[i].y - 0.855 * L.r - NAME_H / 2), w: capsW(said), h: NAME_H },
      folded: false,
      pips: [],
      count: g.members.length,
      far: g.far,
      empty: false,
      suggested: g.members.filter((m) => input.homes.suggested.has(m.tile.id)).map((m) => m.tile.id),
      ids: g.members.map((m) => m.tile.id),
    });
  });

  // the folded ones in rows under the rest — the Projects first, in the person's order — and room for a new Project after them
  const openBox = boxAround(clusters.map((c) => ({ x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r })));
  type Room = { g: Group | null; words: { field: string | null; name: string } | null; n: number; w: number; lw: number };
  const rooms: Room[] = folded.map((g) => {
    const words = subjectWords(g.home);
    const n = Math.min(PIPS, g.members.length);
    // a Project's name has its colour's dot before it; one with something in it, an arrow after
    const lw = capsW(`${words.field ? `${words.field} · ${words.name}` : words.name}${n ? ' →' : ''}`) + (g.home.kind === 'project' ? 16 : 0);
    return { g, words, n, lw, w: Math.max(lw, n ? 26 + (n - 1) * 36 + 20 : EMPTY_W) };
  });
  if (input.canMake) rooms.push({ g: null, words: null, n: 0, lw: MAKE_W, w: MAKE_W });
  const rowMax = narrow ? 340 : Math.max(900, openBox.w);
  const lines: Room[][] = [];
  for (const r of rooms) {
    const line = lines[lines.length - 1];
    if (line && line.reduce((sum, x) => sum + x.w + FOLD_GAP, 0) + r.w <= rowMax) line.push(r);
    else lines.push([r]);
  }
  let make: Box | null = null;
  const top = clusters.length ? Math.round(openBox.y + openBox.h + (narrow ? 26 : 34)) : 0;
  const mid = clusters.length ? openBox.x + openBox.w / 2 : 0;
  lines.forEach((line, li) => {
    const fy = top + li * FOLD_ROW;
    let fx = Math.round(mid - (line.reduce((sum, x) => sum + x.w, 0) + (line.length - 1) * FOLD_GAP) / 2);
    for (const f of line) {
      if (!f.g || !f.words) {
        make = { x: fx, y: fy, w: f.w, h: NAME_H + 40 };
        fx += f.w + FOLD_GAP;
        continue;
      }
      // a few dots under its name: its newest session in the middle, larger and a little lower, as drawn
      const newest = [...f.g.members].sort((a, b) => Number(b.hub) - Number(a.hub) || b.tile.at - a.tile.at || byId(a.tile, b.tile));
      const ms = newest.slice(0, f.n);
      const row = f.n === 3 ? [ms[1], ms[0], ms[2]] : f.n === 2 ? [ms[1], ms[0]] : ms;
      const pips = row.map((m, k) => {
        const big = m === ms[0] && m.hub;
        return { x: fx + 26 + k * 36, y: fy + NAME_H + 22 + (big ? 16 : 0), r: big ? 9.5 : 5.5 };
      });
      clusters.push({
        key: f.g.home.key,
        kind: f.g.home.kind,
        field: f.words.field,
        name: f.words.name,
        color: f.g.home.color,
        projectId: f.g.home.projectId,
        x: Math.round(fx + f.w / 2),
        y: Math.round(fy + 30),
        r: Math.round(f.w / 2),
        label: { x: fx, y: fy, w: f.lw, h: NAME_H },
        folded: true,
        pips,
        count: f.g.count,
        far: f.g.far,
        empty: f.g.home.kind === 'project' && f.g.count === 0,
        suggested: [],
        ids: [],
      });
      fx += f.w + FOLD_GAP;
    }
  });

  const placed = new Map<string, { x: number; y: number; r: number; g: string; hub: boolean }>();
  for (const h of hubs) placed.set(h.id, { x: h.x, y: h.y, r: h.r + (h.halo ? HALO : 0), g: h.g, hub: true });
  for (const d of dots) placed.set(d.id, { x: d.x, y: d.y, r: d.r, g: d.g, hub: false });

  // ── what joins two subjects ──
  const tileOf = new Map(input.tiles.map((t) => [t.id, t]));
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const own: BubbleLink[] = [];
  const done = new Set<string>();
  for (const l of input.links) {
    const p = placed.get(l.a);
    const q = placed.get(l.b);
    if (!p || !q || l.a === l.b || done.has(pairKey(l.a, l.b))) continue;
    done.add(pairKey(l.a, l.b));
    own.push({ key: `own:${l.id}`, a: l.a, b: l.b, kind: 'own', own: l.id, label: l.label, idea: null, across: p.g !== q.g, ...curve(p, q, narrow) });
  }
  // an idea two subjects both come back to: once for any two subjects, between their sessions first, the newest
  const joined = new Set(own.filter((l) => l.across).map((l) => pairKey(placed.get(l.a)!.g, placed.get(l.b)!.g)));
  const ideaLinks: BubbleLink[] = [];
  for (const idea of input.ideaLinks === false ? [] : input.ideas) {
    const here = idea.members.filter((id) => placed.has(id));
    let best: { a: string; b: string; score: number } | null = null;
    for (let i = 0; i < here.length; i++)
      for (let j = i + 1; j < here.length; j++) {
        const p = placed.get(here[i])!;
        const q = placed.get(here[j])!;
        if (p.g === q.g || joined.has(pairKey(p.g, q.g)) || done.has(pairKey(here[i], here[j]))) continue;
        const score = (p.hub ? 2 : 0) + (q.hub ? 2 : 0) + Math.max(tileOf.get(here[i])?.at ?? 0, tileOf.get(here[j])?.at ?? 0) / 1e14;
        if (!best || score > best.score) best = { a: here[i], b: here[j], score };
      }
    if (!best) continue;
    const p = placed.get(best.a)!;
    const q = placed.get(best.b)!;
    joined.add(pairKey(p.g, q.g));
    done.add(pairKey(best.a, best.b));
    ideaLinks.push({ key: `idea:${idea.key}`, a: best.a, b: best.b, kind: 'idea', own: null, label: '', idea: idea.says, across: true, ...curve(p, q, narrow) });
  }
  const links = [...own, ...ideaLinks.slice(0, Math.max(0, LINKS_MAX - own.length))];

  // ── the card over the one that matters most, its curve rising to meet it ──
  const card = cardOver(links, { hubs, dots, clusters, placed, tileOf, homes: input.homes, now: input.now, narrow, haloId: hubs.find((h) => h.halo)?.id ?? null, chosen: input.cardFor ?? null });
  if (card) {
    const l = links.find((x) => x.key === card.link)!;
    const p = placed.get(l.a)!;
    const q = placed.get(l.b)!;
    const stacked = Math.abs(q.x - p.x) < Math.abs(q.y - p.y) * 0.6;
    // over the arc: its top tucked just under the card's foot; one over the other: through the card
    Object.assign(l, curveThrough(p, q, stacked ? { x: card.x + card.w / 2, y: card.y + card.h / 2 } : { x: card.x + card.w / 2, y: card.y + card.h - 6 }));
  }

  const bounds = boxAround([
    ...clusters.map((c) => (c.folded ? foldedBox(c) : { x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r })),
    ...(card ? [card] : []),
    ...(make ? [make] : []),
  ]);
  return { lens: input.lens, hubs, dots, clusters, joins, spokes, links, card, make, byId: placed, bounds, focus: bounds, ...(today ? { today } : {}) };
}

/** A folded one's room: its name and the dots under it — or, empty, the words that say so. */
export function foldedBox(c: Pick<BubbleCluster, 'label' | 'pips' | 'empty'>): Box {
  return boxAround([c.label, ...c.pips.map((p) => ({ x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, h: 2 * p.r })), ...(c.empty ? [{ x: c.label.x, y: c.label.y, w: EMPTY_W, h: NAME_H + 26 }] : [])]);
}

/** From one disc's edge to the other's, bent over the line between them — or, one over the other, out to the right. */
function curve(p: { x: number; y: number; r: number }, q: { x: number; y: number; r: number }, narrow: boolean): Pick<BubbleLink, 'p0' | 'c' | 'p1'> {
  const d = dist(p, q);
  const lift = Math.min(narrow ? 160 : 260, Math.max(60, d * 0.42));
  const side = Math.abs(q.x - p.x) < Math.abs(q.y - p.y) * 0.6;
  return edgeCurve(p, q, { x: round((p.x + q.x) / 2 + (side ? lift : 0)), y: round((p.y + q.y) / 2 - (side ? 0 : lift)) });
}

/** The curve from edge to edge with this bend. */
function edgeCurve(p: { x: number; y: number; r: number }, q: { x: number; y: number; r: number }, c: Pt): Pick<BubbleLink, 'p0' | 'c' | 'p1'> {
  const toward = (from: { x: number; y: number; r: number }) => {
    const d = Math.max(1, dist(from, c));
    return { x: round(from.x + ((c.x - from.x) / d) * from.r), y: round(from.y + ((c.y - from.y) / d) * from.r) };
  };
  return { p0: toward(p), c, p1: toward(q) };
}

/** The curve from edge to edge whose middle passes through a point (the card's foot). */
function curveThrough(p: { x: number; y: number; r: number }, q: { x: number; y: number; r: number }, apex: Pt): Pick<BubbleLink, 'p0' | 'c' | 'p1'> {
  // a quadratic's middle is a quarter of each end and half its bend; its ends move with the bend, so twice over
  let c = { x: 2 * apex.x - (p.x + q.x) / 2, y: 2 * apex.y - (p.y + q.y) / 2 };
  for (let k = 0; k < 3; k++) {
    const e = edgeCurve(p, q, c);
    c = { x: round(2 * apex.x - (e.p0.x + e.p1.x) / 2), y: round(2 * apex.y - (e.p0.y + e.p1.y) / 2) };
  }
  return edgeCurve(p, q, c);
}

/** What the card says and where it goes: over the arc of the link that matters most, clear of every disc, dot and name. */
function cardOver(
  links: readonly BubbleLink[],
  o: {
    hubs: readonly BubbleHub[];
    dots: readonly BubbleDot[];
    clusters: readonly BubbleCluster[];
    placed: Map<string, { x: number; y: number; r: number; g: string; hub: boolean }>;
    tileOf: Map<string, Tile>;
    homes: Homes;
    now: number;
    narrow: boolean;
    haloId: string | null;
    chosen: string | null;
  }
): BubbleCard | null {
  // the person's own across two subjects, then an idea across two, then the person's own within one; the one by the halo, then the newest
  const rank = (l: BubbleLink) => (l.kind === 'own' ? (l.across ? 4 : 2) : 3) + (o.haloId && (l.a === o.haloId || l.b === o.haloId) ? 0.5 : 0);
  const newest = (l: BubbleLink) => Math.max(o.tileOf.get(l.a)?.at ?? 0, o.tileOf.get(l.b)?.at ?? 0);
  const pick = links.find((l) => l.key === o.chosen) ?? [...links].filter((l) => l.across || l.kind === 'own').sort((a, b) => rank(b) - rank(a) || newest(b) - newest(a) || (a.key < b.key ? -1 : 1))[0];
  const A = pick && o.tileOf.get(pick.a);
  const B = pick && o.tileOf.get(pick.b);
  if (!pick || !A || !B) return null;
  // a course is said by its field in a sentence: "Accounting and Economics"
  const subjectName = (id: string) => {
    const h = o.homes.of.get(id);
    if (!h) return '';
    const w = subjectWords(h);
    return w.field ?? w.name;
  };
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  let title: string;
  let says: BubbleCard['says'];
  if (pick.kind === 'own') {
    title = 'You linked these';
    const label = pick.label.trim();
    says = label ? [{ text: /[.!?…]$/.test(label) ? label : `${label}.` }] : [{ text: `“${clip(A.title, 44)}” and “${clip(B.title, 44)}”.` }];
  } else {
    title = 'One idea, two subjects';
    const an = subjectName(pick.a);
    const bn = subjectName(pick.b);
    says = [{ text: an && bn && an !== bn ? `${an} and ${bn} both come back to ` : 'Both come back to ' }, { text: pick.idea ?? '', em: true }, { text: '.' }];
  }
  const note = dayStart(A.at) === dayStart(B.at) ? `Opened together ${daySaid(A.at, o.now)}.` : `Last opened ${whenSaid(Math.max(A.at, B.at), o.now)} and ${whenSaid(Math.min(A.at, B.at), o.now)}.`;
  const w = o.narrow ? CARD_W_NARROW : CARD_W;
  const perLine = Math.floor((w - 36) / 6.6);
  const lines = (s: string) => Math.max(1, Math.ceil(s.length / perLine));
  const h = Math.round(16 + 26 + 4 + lines(`${says.map((x) => x.text).join('')} ${note}`) * 21 + 16);
  // its arc's top, raised until the card sits clear of everything drawn
  const p = o.placed.get(pick.a)!;
  const q = o.placed.get(pick.b)!;
  const solid = (b: Box) =>
    o.hubs.some((x) => circleHitsBox(x, x.r + (x.halo ? HALO : 0), b, 10)) ||
    o.dots.some((d) => circleHitsBox(d, d.r, b, 8) || (d.named && overlaps(d.label, b, 6))) ||
    o.clusters.some((c) => overlaps(c.label, b, 6) || c.pips.some((pp) => circleHitsBox(pp, pp.r, b, 8)));
  const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const stacked = Math.abs(q.x - p.x) < Math.abs(q.y - p.y) * 0.6;
  let box: Box | null = null;
  if (!stacked)
    // over the arc, raised until it is clear
    for (let step = 0; step < 48 && !box; step++) {
      const b = { x: Math.round(mid.x - w / 2), y: Math.round(Math.min(p.y - p.r, q.y - q.r) - CARD_RISE - h - step * 14), w, h };
      if (!solid(b)) box = b;
    }
  else
    // one over the other: the nearest clear place to the middle between them, keeping to the column
    for (let ring = 0; ring < 40 && !box; ring++)
      for (const [kx, ky] of ring ? [[0, -1], [0, 1], [-0.6, -1], [0.6, -1], [-0.6, 1], [0.6, 1], [-1, 0], [1, 0]] : [[0, 0]]) {
        const b = { x: Math.round(mid.x - w / 2 + kx * ring * 16), y: Math.round(mid.y - h / 2 + ky * ring * 16), w, h };
        if (!solid(b)) {
          box = b;
          break;
        }
      }
  box ??= { x: Math.round(mid.x - w / 2), y: Math.round(Math.min(p.y - p.r, q.y - q.r) - h - 40), w, h };
  return { ...box, link: pick.key, title, says, note };
}
