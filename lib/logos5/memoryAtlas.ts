// lib/logos5/memoryAtlas.ts — WHAT SOCRIA REMEMBERS, AS AN ATLAS OF A MIND.
//
// The Memory view (components/logos5/MemoryView.tsx) draws the memory Socria
// already keeps — the Mind Graph store, read through /api/mind?scope=logos so
// nothing private arrives — as a network of neurons in eight regions. This
// file decides everything about that drawing that can be decided without a
// screen: which region a memory belongs to, what state it is in, where every
// region and every memory sits, how relationships run between them, and where
// the words go.
//
// AN ATLAS, NOT A FORCE LAYOUT. Every region has a fixed home — Identity in
// the middle, the other seven around it, regions that usually relate side by
// side — and only its size follows what it holds. A memory is placed inside
// its region from a seed of its own id, then eased apart from its neighbours
// and leaned toward the regions it connects to. So the same memories land in
// the same places on every visit, adding one moves only its own region, and
// the map can be learned once. Physics would reshuffle it as memories arrive.
//
// NOTHING IS INVENTED. Every state is read from the store's own fields or
// derived from them in the open, below: confirmed or proposed from the change
// record (lib/mind/evolve.ts), "updated this week" from updatedAt, "older"
// from the status, "important" from importance. There is no confidence score
// here and no relationship that is not an edge the store holds.
//
// PURE: no React, no DOM, no clock — the caller passes `now`, and the width of
// words is estimated here unless the caller can measure them.

import { whereFrom, type WhereFrom } from '../mind/types';

// ── the eight regions ────────────────────────────────────────────────

export type RegionId = 'identity' | 'goals' | 'work' | 'learning' | 'people' | 'prefs' | 'recent' | 'questions';

export interface RegionInfo {
  id: RegionId;
  name: string;
  /** the name where room is short: a phone, the edge of an open region */
  short: string;
  /** what lives there, in a few words */
  hint: string;
}

/** In the order the list names them. */
export const REGIONS: readonly RegionInfo[] = [
  { id: 'identity', name: 'Identity', short: 'Identity', hint: 'What you value and hold true' },
  { id: 'goals', name: 'Goals', short: 'Goals', hint: 'Where you are heading' },
  { id: 'work', name: 'Projects & Work', short: 'Work', hint: 'What you are building' },
  { id: 'learning', name: 'Learning', short: 'Learning', hint: 'Ideas and sources you use' },
  { id: 'people', name: 'People & Relationships', short: 'People', hint: 'Who matters, and how' },
  { id: 'prefs', name: 'Preferences', short: 'Preferences', hint: 'How you like things' },
  { id: 'recent', name: 'Recent Context', short: 'Recent', hint: 'What is happening now' },
  { id: 'questions', name: 'Open Questions', short: 'Questions', hint: 'What is still undecided' },
];
export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionInfo>;

const TYPE_REGION: Record<string, RegionId> = {};
const put = (region: RegionId, types: string) => types.split(' ').forEach((t) => (TYPE_REGION[t] = region));
put('identity', 'belief insight assumption value trait pattern tendency characteristic principle identity theme conviction');
put('goals', 'goal plan aim intention ambition aspiration objective target');
put('work', 'project organization organisation decision evidence task deliverable milestone company team product job role work');
put('learning', 'concept source skill topic idea book course method tool framework theory knowledge subject technique resource');
put('people', 'person people friend family colleague mentor relationship contact');
put('prefs', 'preference habit routine like dislike style taste');
put('recent', 'event experience place location meeting trip deadline situation context feeling emotion mood');
put('questions', 'question uncertainty tension problem issue doubt dilemma unknown');

/** The store's own bookkeeping, never drawn as a memory. */
const BOOKKEEPING = new Set(['conversation']);

/**
 * The region a memory belongs to, from the kind the store gave it.
 *
 * `type` is an open string in the store (lib/mind/types.ts), and an unfamiliar
 * one is treated there as a claim about the person — so here it goes to
 * Identity, "what you value and hold true", rather than nowhere.
 */
export function regionOf(type: string): RegionId | null {
  const t = (type || '').trim().toLowerCase();
  if (BOOKKEEPING.has(t)) return null;
  return TYPE_REGION[t] ?? 'identity';
}

// ── a memory, and what state it is in ───────────────────────────────

/** One ground of a memory, as /api/mind gives it — only what is read here. */
export interface ProvIn {
  kind?: string;
  surface?: string;
  at?: number;
  conversationId?: string;
  messageId?: string;
  sourceNodeId?: string;
  note?: string;
  review?: string;
}

/** A memory as /api/mind?scope=logos gives it. */
export interface MemoryIn {
  id: string;
  type: string;
  label: string;
  content?: string;
  status?: string;
  importance?: number;
  seen?: number;
  createdAt?: number;
  updatedAt?: number;
  provenance?: ProvIn[];
}

export interface EdgeIn {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: string;
  provenance?: ProvIn[];
}

export type ChangeKind = 'superseded' | 'conflict' | 'possible-conflict' | 'revised';

/** A change as /api/mind/changes gives it (lib/mind/evolve.ts Change) — what is read here. */
export interface ChangeIn {
  id: string;
  kind: ChangeKind;
  review: 'proposed' | 'confirmed' | 'rejected';
  at: number;
  from: { id: string; type: string; label: string; content: string; status: string };
  to: { id: string; type: string; label: string; content: string; status: string };
  was?: string;
  note?: string;
  surface?: string;
  conversationId?: string;
  affected: { id: string; label: string; distance: number; via: string }[];
  canForget: boolean;
  legacy?: boolean;
}

export interface MemoryState {
  /** a change to it waits for the person, or it is held tentatively — drawn dashed */
  proposed: boolean;
  /** updated in the last seven days — a soft gold ring */
  recent: boolean;
  /** a possible contradiction waiting for them, a tension, or something they said is not right — a triangle */
  warn: null | 'possible' | 'tension' | 'challenged';
  /** an earlier position, historical or archived — faded */
  faded: boolean;
  /** importance at 0.8 or more — a pin */
  pinned: boolean;
}

export interface Memory {
  id: string;
  region: RegionId;
  type: string;
  label: string;
  content: string;
  status: string;
  importance: number;
  seen: number;
  createdAt: number;
  updatedAt: number;
  provenance: ProvIn[];
  state: MemoryState;
  /** how much it should be seen first: what needs them, then what matters */
  prio: number;
}

const DAY = 86_400_000;
export const RECENT_DAYS = 7;
export const PIN_AT = 0.8;
const FADED = new Set(['historical', 'superseded', 'archived']);

/** Is this the note of a correction the person made, rather than an edit? */
const challengeNote = (p: ProvIn) => p.surface === 'user' && !!p.note && p.note !== 'edited by hand' && !p.note.startsWith('kept the earlier');

/**
 * The memories as the view draws them, with their states — derived from the
 * store's fields and its change record, and nothing else. Bookkeeping and
 * nameless entries are left out.
 */
export function memoriesOf(nodes: readonly MemoryIn[], edges: readonly EdgeIn[], changes: readonly ChangeIn[], now: number): Memory[] {
  // a change that waits for the person, on the claim it would put in place
  const waiting = new Set<string>();
  for (const c of changes) if (c.review === 'proposed' && (c.kind === 'superseded' || c.kind === 'revised' || c.kind === 'conflict')) waiting.add(c.to.id);
  // the triangle: a possible contradiction waiting for them outranks a settled tension
  const warn = new Map<string, 'possible' | 'tension'>();
  for (const e of edges) {
    if (e.relationship !== 'contradicts') continue;
    const p = e.provenance?.[0];
    const possible = p?.kind === 'inferred' && /possible contradiction/.test(p?.note ?? '') && p?.review === 'proposed';
    for (const id of [e.sourceId, e.targetId]) {
      if (possible) warn.set(id, 'possible');
      else if (!warn.has(id)) warn.set(id, 'tension');
    }
  }
  const out: Memory[] = [];
  for (const n of nodes) {
    const region = regionOf(n.type);
    const label = (n.label ?? '').trim();
    if (!region || !label) continue;
    const status = n.status || 'active';
    const importance = clamp01(n.importance ?? 0.5);
    const provenance = Array.isArray(n.provenance) ? n.provenance : [];
    const updatedAt = n.updatedAt || n.createdAt || 0;
    const w = warn.get(n.id) ?? (status === 'contradicted' && provenance.some(challengeNote) ? 'challenged' : status === 'contradicted' ? 'tension' : null);
    const state: MemoryState = {
      proposed: waiting.has(n.id) || status === 'tentative',
      recent: !!updatedAt && now - updatedAt >= 0 && now - updatedAt < RECENT_DAYS * DAY,
      warn: w,
      faded: FADED.has(status),
      pinned: importance >= PIN_AT,
    };
    const m: Memory = {
      id: n.id,
      region,
      type: n.type || 'Memory',
      label,
      content: (n.content ?? '').trim(),
      status,
      importance,
      seen: Math.max(1, n.seen ?? 1),
      createdAt: n.createdAt || provenance[0]?.at || 0,
      updatedAt,
      provenance,
      state,
      prio: 0,
    };
    m.prio = prioOf(m);
    out.push(m);
  }
  return out.sort((a, b) => b.prio - a.prio || a.id.localeCompare(b.id));
}

export function prioOf(m: Pick<Memory, 'state' | 'importance' | 'seen'>): number {
  const s = m.state;
  return (s.pinned ? 3 : 0) + (s.warn || s.proposed ? 2.2 : 0) + (s.recent ? 1.4 : 0) + m.importance + Math.min(1, Math.log2(m.seen) / 4) - (s.faded ? 1.2 : 0);
}

/** Does a memory need the person: a change to decide, or a possible contradiction? */
export const waitsForThem = (m: Pick<Memory, 'state'>) => m.state.proposed || m.state.warn === 'possible';

export type MemoryFilter = 'all' | 'waiting' | 'week' | 'important';

export function passes(m: Memory, filter: MemoryFilter, q: string): boolean {
  if (filter === 'waiting' && !waitsForThem(m)) return false;
  if (filter === 'week' && !m.state.recent) return false;
  if (filter === 'important' && !m.state.pinned) return false;
  const t = q.trim().toLowerCase();
  return !t || m.label.toLowerCase().includes(t) || m.content.toLowerCase().includes(t) || m.type.toLowerCase().includes(t);
}

// ── saying it in words ───────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "21 Oct", or "21 Oct 2025" when it was another year. */
export function dayOf(at: number, now: number): string {
  if (!at) return '';
  const d = new Date(at);
  const y = new Date(now).getUTCFullYear();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() === y ? '' : ` ${d.getUTCFullYear()}`}`;
}

export function agoOf(at: number, now: number): string {
  const days = Math.floor((now - at) / DAY);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `on ${dayOf(at, now)}`;
}

/** Every state a memory is in, as words — the marks are never colour alone. */
export function stateWords(m: Memory, now: number): string[] {
  const s = m.state;
  const out: string[] = [];
  if (s.warn === 'possible') out.push('Possible contradiction');
  else if (s.warn === 'tension') out.push('In tension');
  else if (s.warn === 'challenged') out.push('You said this isn’t right');
  if (s.proposed) out.push(m.status === 'tentative' ? 'Held lightly' : 'Proposed change');
  if (s.recent) out.push(`Updated ${agoOf(m.updatedAt, now)}`);
  if (s.faded) out.push(m.status === 'superseded' ? 'An earlier position' : m.status === 'archived' ? 'Archived' : 'Older');
  if (s.pinned) out.push('Important');
  // how it stands, truthfully: "Confirmed" only for what they confirmed or wrote themselves
  if (!out.length || (!s.proposed && !s.warn && !s.faded)) out.unshift(STANDS[whereFrom(m)]);
  return out;
}

/** A memory with nothing pending, in a word that is true of it (lib/mind/types.ts whereFrom). */
const STANDS: Record<WhereFrom, string> = {
  confirmed: 'Confirmed',
  said: 'In your words',
  file: 'From your file',
  source: 'From a source',
  reading: 'Socria’s reading',
};

/** How Socria came to know it, from the record's first ground — "You said it" only when they did. */
export function knownBy(m: Memory): string {
  const first = m.provenance[0];
  const yours = m.provenance.some((p) => p.surface === 'user' && !p.note);
  if (yours && first?.surface === 'user') return 'You added it';
  if (first?.surface === 'file') return 'From your file';
  if (first?.surface === 'import') return 'Imported';
  if (first?.kind === 'researched' || first?.surface === 'tool') return 'From a source';
  if (first?.kind === 'calculated') return 'Worked out';
  if ((first?.kind === 'stated' || first?.kind === 'established') && (first.surface === 'core' || first.surface === 'logos')) return 'You said it';
  return 'Socria noticed it';
}

/** A relationship, read as plain words — from the memory at one end, toward the other. */
const REL_OUT: Record<string, string> = {
  supports: 'supports', contradicts: 'in tension with', depends_on: 'depends on', part_of: 'part of', caused: 'caused',
  motivated_by: 'motivated by', constrained_by: 'constrained by', changed_into: 'changed into', superseded_by: 'replaced by',
  evidence_for: 'evidence for', associated_with: 'related to', belongs_to: 'belongs to', resulted_in: 'resulted in',
  version_of: 'a version of', works_on: 'works on', learned_from: 'learned from', mentioned_in: 'mentioned in',
  derived_from: 'derived from', relevant_to: 'bears on', created_in: 'made in', discussed_in: 'discussed in',
  used_by: 'used by', shared_with: 'shared with',
};
const REL_IN: Record<string, string> = {
  supports: 'supported by', contradicts: 'in tension with', depends_on: 'depended on by', part_of: 'includes', caused: 'caused by',
  motivated_by: 'motivates', constrained_by: 'constrains', changed_into: 'changed from', superseded_by: 'replaced',
  evidence_for: 'backed by', associated_with: 'related to', belongs_to: 'holds', resulted_in: 'came from',
  version_of: 'has a version', works_on: 'worked on by', learned_from: 'taught', mentioned_in: 'mentions',
  derived_from: 'source of', relevant_to: 'touched by', created_in: 'where it was made', discussed_in: 'where it was discussed',
  used_by: 'uses', shared_with: 'shared with',
};
export function relWord(rel: string, outward = true): string {
  const r = (rel || '').toLowerCase();
  return (outward ? REL_OUT[r] : REL_IN[r]) ?? r.replace(/_/g, ' ');
}

export const CHANGE_KIND: Record<ChangeKind, string> = {
  superseded: 'Changed position',
  conflict: 'In tension',
  'possible-conflict': 'Possible contradiction',
  revised: 'Reworded',
};

// ── small things ─────────────────────────────────────────────────────

/** A number from a string, the same every time: for what should differ but never move. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const unit = (s: string) => hash(s) / 4294967296;
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp01(v: number) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const f = (v: number) => r1(v).toString();

/**
 * How wide a line of words is, estimated for Inter: close enough to keep
 * labels apart, a little generous so they never touch. The view measures with
 * the real font when it can and passes that in instead.
 */
export type Measure = (text: string, px: number, weight?: number) => number;
const NARROW_CH = new Set([...'iljtf.,:;\'!|()[] ']);
const WIDE_CH = new Set([...'mwMW@%']);
export const estimate: Measure = (text, px, weight = 500) => {
  let em = 0;
  for (const ch of text) {
    if (NARROW_CH.has(ch)) em += 0.3;
    else if (WIDE_CH.has(ch)) em += 0.86;
    else if (ch >= 'A' && ch <= 'Z') em += 0.66;
    else if (ch >= '0' && ch <= '9') em += 0.58;
    else em += 0.55;
  }
  return em * px * (weight >= 600 ? 1.06 : 1.02);
};

export function ellipsis(text: string, most: number): string {
  return text.length > most ? `${text.slice(0, most - 1).trimEnd()}…` : text;
}

// ── the atlas: where each region lives ──────────────────────────────

export interface Home {
  id: RegionId;
  cx: number;
  cy: number;
  /** its size: grows with what it holds, to a limit */
  R: number;
  sx: number;
  sy: number;
  /** which way it lies from the middle (for where its name goes) */
  ux: number;
  uy: number;
  centre: boolean;
}

/** The drawing's own space; the view fits it to the screen and zooms within it. */
export const WORLD = { w: 1180, h: 828 } as const;
export const NARROW_WORLD = { w: 390, h: 600 } as const;

/** Identity in the middle; the others around it, regions that usually relate side by side. */
export const RING: readonly RegionId[] = ['goals', 'questions', 'work', 'people', 'prefs', 'learning', 'recent'];

/** The desktop atlas folded into two columns for a phone: the same neighbours, two abreast. */
const NARROW_AT: Record<RegionId, [number, number]> = {
  goals: [210, 63], recent: [90, 149], questions: [300, 149], identity: [195, 266],
  learning: [86, 384], work: [298, 384], prefs: [120, 495], people: [286, 503],
};

/** Where every region lives. Only R depends on the memories; the homes never move. */
export function atlasHomes(counts: Partial<Record<RegionId, number>>, narrow = false): Record<RegionId, Home> {
  const out = {} as Record<RegionId, Home>;
  if (narrow) {
    for (const r of REGIONS) {
      const [x, y] = NARROW_AT[r.id];
      const n = clamp(counts[r.id] ?? 0, 1, 9);
      out[r.id] = { id: r.id, cx: x, cy: y, R: 25.5 * Math.sqrt(n), sx: 1, sy: 0.9, ux: (x - 195) / 195, uy: r.id === 'prefs' || r.id === 'people' ? 1 : -1, centre: r.id === 'identity' };
    }
    return out;
  }
  const cx = 578, cy = 418, a = 396, b = 250;
  const R = (id: RegionId) => clamp(46 * Math.sqrt(clamp(counts[id] ?? 0, 1, 9)), 52, 138);
  out.identity = { id: 'identity', cx, cy, R: R('identity'), sx: 1, sy: 0.9, ux: 0, uy: -1, centre: true };
  RING.forEach((id, i) => {
    const t = -Math.PI / 2 + (i / RING.length) * Math.PI * 2;
    out[id] = { id, cx: cx + Math.cos(t) * a, cy: cy + Math.sin(t) * b, R: R(id), sx: 1, sy: 0.9, ux: Math.cos(t), uy: Math.sin(t), centre: false };
  });
  return out;
}

/** A region's soft lobe — not a circle — the same shape every time. */
export function blobPath(cx: number, cy: number, R: number, seed: number, sx = 1, sy = 0.9): string {
  const r = rng(seed);
  const a1 = r() * 6.283, a2 = r() * 6.283, a3 = r() * 6.283;
  const N = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const m = 1 + 0.07 * Math.sin(3 * t + a1) + 0.045 * Math.sin(5 * t + a2) + 0.035 * Math.cos(2 * t + a3);
    pts.push([cx + Math.cos(t) * R * m * sx, cy + Math.sin(t) * R * m * sy]);
  }
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

// ── memories inside a region ────────────────────────────────────────

export interface Cell {
  id: string;
  region: RegionId;
  x: number;
  y: number;
  /** the cell body's radius, sized by importance */
  r: number;
  /** from a region at the edge, shown because it connects to the open one */
  ghost?: boolean;
}

/** A cell body's radius, sized by how much the memory matters. */
export const radiusOf = (m: Pick<Memory, 'importance'>, k = 1) => (4.6 + 10 * m.importance) * k;

/**
 * Lay a region's memories out inside it: each from a seed of its own id (so it
 * starts where it started last time), nudged toward the regions it connects
 * to, eased apart from its neighbours, and kept inside the lobe. Order is by id,
 * so a memory added or removed relaxes its neighbours and nothing else.
 */
export function placeIn(
  list: readonly Memory[],
  home: Pick<Home, 'cx' | 'cy' | 'R' | 'sx' | 'sy'>,
  o: { k?: number; gap?: number; fill?: number; pull?: ReadonlyMap<string, [number, number]>; hole?: { w: number; h: number; dy: number }; iters?: number; rk?: number } = {}
): Cell[] {
  const k = o.k ?? 1;
  const gap = (o.gap ?? 30) * k;
  const fill = o.fill ?? 0.72;
  const sy = home.sy * 0.96, sx = home.sx;
  const R = home.R;
  const ordered = [...list].sort((a, b) => a.id.localeCompare(b.id));
  const cells = ordered.map((m) => {
    const t = unit(m.id) * Math.PI * 2;
    const rf = (0.12 + 0.88 * Math.sqrt(unit(`${m.id}·r`))) * (1 - 0.35 * m.importance);
    return { m, x: home.cx + Math.cos(t) * rf * R * fill * sx, y: home.cy + Math.sin(t) * rf * R * fill * sy, r: radiusOf(m, o.rk ?? k) };
  });
  const N = o.iters ?? 160;
  for (let it = 0; it < N; it++) {
    const heat = 1 - it / N;
    if (o.pull) for (const c of cells) {
      const u = o.pull.get(c.m.id);
      if (u) {
        c.x += u[0] * 1.1 * heat * k;
        c.y += u[1] * 1.1 * heat * k;
      }
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i], b = cells[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          // two seeds in one spot: part them along a direction of their own
          const t = unit(`${a.m.id}|${b.m.id}`) * Math.PI * 2;
          dx = Math.cos(t);
          dy = Math.sin(t);
          d = 1;
        }
        const min = a.r + b.r + gap;
        if (d < min) {
          const p = (min - d) / 2;
          a.x -= (dx / d) * p;
          a.y -= (dy / d) * p;
          b.x += (dx / d) * p;
          b.y += (dy / d) * p;
        }
      }
    }
    for (const c of cells) {
      const dx = (c.x - home.cx) / sx, dy = (c.y - home.cy) / sy, d = Math.hypot(dx, dy);
      const lim = Math.max(1, R * fill - c.r);
      if (d > lim) {
        c.x = home.cx + (dx / d) * lim * sx;
        c.y = home.cy + (dy / d) * lim * sy;
      }
    }
    if (o.hole) for (const c of cells) {
      const hx = o.hole.w / 2 + c.r + 4, hy = o.hole.h / 2 + c.r + 4;
      const dx = c.x - home.cx, dy = c.y - (home.cy + o.hole.dy);
      if (Math.abs(dx) < hx && Math.abs(dy) < hy) c.y = home.cy + o.hole.dy + (dy < 0 || (dy === 0 && hash(c.m.id) % 2) ? -hy : hy);
    }
  }
  return cells.map((c) => ({ id: c.m.id, region: c.m.region, x: r1(c.x), y: r1(c.y), r: r1(c.r) }));
}

/** Which way each memory leans: toward the regions it has relationships with. */
export function pullsOf(memories: readonly Memory[], edges: readonly EdgeIn[], homes: Record<RegionId, Pick<Home, 'cx' | 'cy'>>): Map<string, [number, number]> {
  const byId = new Map(memories.map((m) => [m.id, m]));
  const sum = new Map<string, [number, number]>();
  for (const e of edges) {
    const A = byId.get(e.sourceId), B = byId.get(e.targetId);
    if (!A || !B || A.region === B.region) continue;
    for (const [n, o] of [[A, B], [B, A]] as const) {
      const c = homes[n.region], t = homes[o.region];
      const dx = t.cx - c.cx, dy = t.cy - c.cy, d = Math.hypot(dx, dy) || 1;
      const v = sum.get(n.id) ?? [0, 0];
      sum.set(n.id, [v[0] + dx / d, v[1] + dy / d]);
    }
  }
  for (const [id, [x, y]] of sum) {
    const d = Math.hypot(x, y) || 1;
    sum.set(id, [x / d, y / d]);
  }
  return sum;
}

// ── relationships: fibres within a region, bundled tracts between ───

export interface Fibre {
  id: string;
  a: string;
  b: string;
  rel: string;
  /** between two regions — drawn bundled, in ink rather than a region's colour */
  inter: boolean;
  conflict: boolean;
  /** a change that waits for the person — drawn dashed */
  proposed: boolean;
  /** a cubic: start, two controls, end */
  p: [[number, number], [number, number], [number, number], [number, number]];
}

export const fibrePath = (fb: Pick<Fibre, 'p'>) => `M${f(fb.p[0][0])},${f(fb.p[0][1])} C${f(fb.p[1][0])},${f(fb.p[1][1])} ${f(fb.p[2][0])},${f(fb.p[2][1])} ${f(fb.p[3][0])},${f(fb.p[3][1])}`;

/** A point along a fibre, t from 0 to 1. */
export function pointOn(fb: Pick<Fibre, 'p'>, t: number): [number, number] {
  const [a, b, c, d] = fb.p;
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
}

interface RegionPlace {
  id: RegionId;
  cx: number;
  cy: number;
  R: number;
  sy: number;
}

/**
 * The points where a bundle leaves each lobe, toward the other region — so
 * the fibres between two regions gather into one tract, and a tract bends
 * around the middle region rather than through it.
 */
function portsOf(ra: RegionId, rb: RegionId, places: Partial<Record<RegionId, RegionPlace>>, centre: RegionPlace | null, k = 0.72, clear = 44): [[number, number], [number, number]] | null {
  const [r1n, r2n] = ra < rb ? [ra, rb] : [rb, ra];
  const A = places[r1n], B = places[r2n];
  if (!A || !B) return null;
  const dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  let bow = (hash(r1n + r2n) % 2 ? 1 : -1) * Math.min(30, d * 0.06);
  if (centre && r1n !== centre.id && r2n !== centre.id) {
    const sd = (centre.cx - A.cx) * -uy + (centre.cy - A.cy) * ux;
    const along = ((centre.cx - A.cx) * ux + (centre.cy - A.cy) * uy) / d;
    const room = centre.R + clear;
    if (along > 0.08 && along < 0.92 && Math.abs(sd) < room) bow = -(Math.sign(sd) || (hash(r1n + r2n) % 2 ? 1 : -1)) * (room - Math.abs(sd)) / 0.75;
  }
  const p1: [number, number] = [A.cx + ux * A.R * k - uy * bow, A.cy + uy * A.R * k * A.sy + ux * bow];
  const p2: [number, number] = [B.cx - ux * B.R * k - uy * bow, B.cy - uy * B.R * k * B.sy + ux * bow];
  return ra === r1n ? [p1, p2] : [p2, p1];
}

function curved(a: Cell, b: Cell, bend: number): Fibre['p'] {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const o = d * bend * (hash(`${a.id}${b.id}`) % 2 ? 1 : -1);
  const q: [number, number] = [mx - (dy / d) * o, my + (dx / d) * o];
  return [
    [a.x, a.y],
    [a.x + (2 / 3) * (q[0] - a.x), a.y + (2 / 3) * (q[1] - a.y)],
    [b.x + (2 / 3) * (q[0] - b.x), b.y + (2 / 3) * (q[1] - b.y)],
    [b.x, b.y],
  ];
}

const reviewOfEdge = (e: EdgeIn) => e.provenance?.[0]?.review;

/** The relationships between memories that are drawn, as fibres. */
export function fibresOf(cells: readonly Cell[], edges: readonly EdgeIn[], o: { places?: Partial<Record<RegionId, RegionPlace>>; centre?: RegionPlace | null; bend?: number; bundle?: boolean; only?: RegionId | null } = {}): Fibre[] {
  const at = new Map(cells.map((c) => [c.id, c]));
  const out: Fibre[] = [];
  for (const e of edges) {
    const a = at.get(e.sourceId), b = at.get(e.targetId);
    if (!a || !b || a.id === b.id) continue;
    if (o.only && a.region !== o.only && b.region !== o.only) continue;
    const inter = a.region !== b.region;
    let p: Fibre['p'] = curved(a, b, o.bend ?? 0.16);
    if (inter && o.bundle && o.places) {
      const ports = portsOf(a.region, b.region, o.places, o.centre ?? null);
      if (ports) p = [[a.x, a.y], ports[0], ports[1], [b.x, b.y]];
    }
    out.push({ id: e.id, a: a.id, b: b.id, rel: e.relationship, inter, conflict: e.relationship === 'contradicts', proposed: reviewOfEdge(e) === 'proposed', p });
  }
  return out;
}

export interface Tract {
  a: RegionId;
  b: RegionId;
  weight: number;
  /** the ribbon, closed */
  d: string;
  /** the gradient runs between these, fading in from each lobe */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  inA: number;
  inB: number;
}

/** How many relationships run between each pair of regions — the store's own edges, counted. */
export function regionWeights(memories: readonly Memory[], edges: readonly EdgeIn[]): Map<string, number> {
  const region = new Map(memories.map((m) => [m.id, m.region]));
  const w = new Map<string, number>();
  for (const e of edges) {
    const a = region.get(e.sourceId), b = region.get(e.targetId);
    if (!a || !b || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    w.set(key, (w.get(key) ?? 0) + 1);
  }
  return w;
}

/** At a distance, the relationships between two regions drawn as one tapering tract. */
export function tractsOf(weights: ReadonlyMap<string, number>, places: Partial<Record<RegionId, RegionPlace>>, centre: RegionPlace | null, o: { min?: number; w0?: number; wk?: number; portK?: number; clear?: number } = {}): Tract[] {
  const out: Tract[] = [];
  for (const [key, w] of weights) {
    if (w < (o.min ?? 1)) continue;
    const [ra, rb] = key.split('|') as [RegionId, RegionId];
    const A = places[ra], B = places[rb];
    const ports = portsOf(ra, rb, places, centre, o.portK ?? 0.7, o.clear ?? 16);
    if (!A || !B || !ports) continue;
    const [q1, q2] = ports;
    const rim = (C: RegionPlace, q: [number, number]): [number, number] => {
      const dx = q[0] - C.cx, dy = (q[1] - C.cy) / C.sy, d = Math.hypot(dx, dy) || 1;
      return [C.cx + (dx / d) * C.R * 0.55, C.cy + (dy / d) * C.R * 0.55 * C.sy];
    };
    const a = rim(A, q1), b = rim(B, q2);
    const mx = (q1[0] + q2[0]) / 2, my = (q1[1] + q2[1]) / 2;
    const c = [2 * mx - (a[0] + b[0]) / 2, 2 * my - (a[1] + b[1]) / 2];
    const w0 = (o.w0 ?? 4) + w * (o.wk ?? 2.6);
    const N = 28, left: [number, number][] = [], right: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
      const tx = 2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), ty = 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
      const tl = Math.hypot(tx, ty) || 1;
      const hw = (w0 / 2) * (0.62 + 0.38 * Math.pow(2 * t - 1, 2));
      left.push([x - (ty / tl) * hw, y + (tx / tl) * hw]);
      right.push([x + (ty / tl) * hw, y - (tx / tl) * hw]);
    }
    const ring = left.concat(right.reverse());
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push({
      a: ra,
      b: rb,
      weight: w,
      d: `M${ring.map((q) => `${f(q[0])},${f(q[1])}`).join(' L')} Z`,
      x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]),
      inA: Math.min(0.45, (A.R * 0.5) / span),
      inB: Math.min(0.45, (B.R * 0.5) / span),
    });
  }
  return out.sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b));
}

/** A few quiet processes from a cell body, the same every time: the neuron, kept quiet. */
export function dendritesOf(id: string, x: number, y: number, r: number): { d: string; fine: boolean }[] {
  if (r < 6.5) return [];
  const rr = rng(hash(id));
  const k = 3 + (hash(id) % 3);
  const out: { d: string; fine: boolean }[] = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + rr() * 0.9;
    const len = r * (1.25 + rr() * 0.9);
    const x0 = x + Math.cos(a) * r * 0.92, y0 = y + Math.sin(a) * r * 0.92;
    const bend = (rr() - 0.5) * 0.9;
    const x1 = x + Math.cos(a + bend * 0.35) * (r + len), y1 = y + Math.sin(a + bend * 0.35) * (r + len);
    const qx = x + Math.cos(a + bend * 0.2) * (r + len * 0.55), qy = y + Math.sin(a + bend * 0.2) * (r + len * 0.55);
    out.push({ d: `M${f(x0)},${f(y0)} Q${f(qx)},${f(qy)} ${f(x1)},${f(y1)}`, fine: false });
    if (rr() > 0.55) {
      const fa = a + (rr() > 0.5 ? 0.5 : -0.5);
      out.push({ d: `M${f(qx)},${f(qy)} L${f(qx + Math.cos(fa) * len * 0.42)},${f(qy + Math.sin(fa) * len * 0.42)}`, fine: true });
    }
  }
  return out;
}

// ── scenes: what is drawn at each distance ──────────────────────────

export interface SceneRegion {
  id: RegionId;
  cx: number;
  cy: number;
  R: number;
  sx: number;
  sy: number;
  d: string;
  /** how many memories it holds, and how many are not drawn at this distance */
  count: number;
  more: number;
  /** drawn quieter: a region at the edge of an open one */
  quiet?: boolean;
  /** the open region: its lobe a little stronger */
  strong?: boolean;
  /** on a phone, the name is written inside the lobe, where a thumb aims */
  inner?: boolean;
  ux: number;
  uy: number;
  centre: boolean;
}

export interface Scene {
  w: number;
  h: number;
  regions: SceneRegion[];
  cells: Cell[];
  fibres: Fibre[];
  tracts: Tract[];
  /** the region the scene is open on, if any */
  open: RegionId | null;
  /** what cannot be drawn at this distance, by region — found in the list */
  hidden: number;
}

/** How many memories a region shows from a distance; the rest are in its list. */
export const OVERVIEW_CAP = 24;
export const NARROW_OVERVIEW_CAP = 30;
/** How many an open region shows. */
export const OPEN_CAP = 36;
export const NARROW_OPEN_CAP = 20;

function countsOf(memories: readonly Memory[]): Record<RegionId, number> {
  const c = Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as Record<RegionId, number>;
  for (const m of memories) c[m.region] += 1;
  return c;
}

/**
 * Every region and the memories that matter most in each, from far enough
 * away to see the whole mind. On a phone the regions are named inside their
 * lobes and only their strongest tracts show; zooming in reveals the rest.
 */
export function overviewScene(memories: readonly Memory[], edges: readonly EdgeIn[], o: { narrow?: boolean } = {}): Scene {
  const narrow = !!o.narrow;
  const counts = countsOf(memories);
  const shownCounts = Object.fromEntries(REGIONS.map((r) => [r.id, Math.min(counts[r.id], narrow ? NARROW_OVERVIEW_CAP : OVERVIEW_CAP)])) as Record<RegionId, number>;
  const homes = atlasHomes(shownCounts, narrow);
  const pull = narrow ? undefined : pullsOf(memories, edges, homes);
  const regions: SceneRegion[] = [];
  const cells: Cell[] = [];
  let hidden = 0;
  for (const r of REGIONS) {
    const h = homes[r.id];
    const mine = memories.filter((m) => m.region === r.id);
    const shown = mine.slice(0, narrow ? NARROW_OVERVIEW_CAP : OVERVIEW_CAP); // memoriesOf sorts by priority
    hidden += mine.length - shown.length;
    regions.push({ id: r.id, cx: r1(h.cx), cy: r1(h.cy), R: r1(h.R), sx: h.sx, sy: h.sy, d: blobPath(h.cx, h.cy, h.R, hash(r.id), h.sx, h.sy), count: mine.length, more: mine.length - shown.length, inner: narrow, ux: h.ux, uy: h.uy, centre: h.centre });
    if (narrow) {
      // the cells keep clear of the name, which is what a thumb aims for
      const hole = { w: estimate(r.short, 12, 600) + 6, h: 32, dy: 2 };
      for (const c of placeIn(shown, h, { k: 0.5, gap: 22, fill: 0.86, hole })) cells.push({ ...c, r: r1(2.8 + 3.6 * (shown.find((m) => m.id === c.id)?.importance ?? 0.5)) });
    } else {
      const dense = shown.length > 12;
      cells.push(...placeIn(shown, h, { k: 1, gap: dense ? Math.max(12, 30 * Math.sqrt(12 / shown.length)) : 30, rk: dense ? 0.82 : 1, pull }));
    }
  }
  const places: Partial<Record<RegionId, RegionPlace>> = Object.fromEntries(regions.map((r) => [r.id, { id: r.id, cx: r.cx, cy: r.cy, R: r.R, sy: r.sy }]));
  const centre = places.identity ?? null;
  const w = narrow ? NARROW_WORLD : WORLD;
  if (narrow) {
    const weights = regionWeights(memories, edges);
    const strongest = Math.max(0, ...weights.values());
    return { w: w.w, h: w.h, regions, cells, fibres: [], tracts: tractsOf(weights, places, centre, { min: strongest >= 4 ? 2 : 1 }), open: null, hidden };
  }
  return { w: w.w, h: w.h, regions, cells, fibres: fibresOf(cells, edges, { places, centre, bundle: true }), tracts: [], open: null, hidden };
}

/**
 * One region opened in place: its memories drawn larger with room for their
 * words, and every other region pushed to the edge in the direction it lies,
 * showing only the memories that connect here.
 */
export function regionScene(memories: readonly Memory[], edges: readonly EdgeIn[], open: RegionId, o: { narrow?: boolean; w?: number; h?: number } = {}): Scene {
  const narrow = !!o.narrow;
  const W = o.w ?? (narrow ? NARROW_WORLD.w : WORLD.w);
  const H = o.h ?? (narrow ? NARROW_WORLD.h : WORLD.h);
  const mine = memories.filter((m) => m.region === open);
  const shown = mine.slice(0, narrow ? NARROW_OPEN_CAP : OPEN_CAP);
  const ids = new Set(shown.map((m) => m.id));
  const cx = W / 2, cy = H / 2 + (narrow ? 0 : 8);
  const k = narrow ? Math.min(W, H) / 640 : 1;
  const R = (narrow ? 300 : 330) * k;
  const home = { cx, cy, R, sx: narrow ? 1.05 : 1.12, sy: narrow ? 0.95 : 0.82 };
  const counts = countsOf(memories);
  const homes = atlasHomes(counts, false);
  const pull = pullsOf(memories, edges, homes);
  const gap = narrow ? 34 : shown.length > 18 ? 46 : 64;
  const cells: Cell[] = placeIn(shown, home, { k: narrow ? 0.9 : 1, rk: narrow ? 1 : 1.18, gap, fill: 0.86, pull, iters: 200 });
  const regions: SceneRegion[] = [
    { id: open, cx: r1(cx), cy: r1(cy + 6 * k), R: r1(R), sx: home.sx, sy: home.sy, d: blobPath(cx, cy + 6 * k, R, hash(open), home.sx, home.sy), count: mine.length, more: mine.length - shown.length, strong: true, ux: 0, uy: -1, centre: false },
  ];
  if (!narrow) {
    // the others, at the edge, keeping the direction they had on the overview
    const c0 = homes[open];
    const others = REGIONS.filter((r) => r.id !== open).map((r) => ({ id: r.id, a: Math.atan2(homes[r.id].cy - c0.cy, homes[r.id].cx - c0.cx) }));
    others.sort((a, b) => a.a - b.a);
    const min = ((Math.PI * 2) / others.length) * 0.8;
    for (let it = 0; it < 300; it++) {
      for (let i = 0; i < others.length; i++) {
        const A = others[i], B = others[(i + 1) % others.length];
        let g = B.a - A.a;
        if (i === others.length - 1) g += Math.PI * 2;
        if (g < min) {
          const p = (min - g) / 2;
          A.a -= p;
          B.a += p;
        }
      }
    }
    const linksHere = (m: Memory) => edges.some((e) => (e.sourceId === m.id && ids.has(e.targetId)) || (e.targetId === m.id && ids.has(e.sourceId)));
    const Rp = 128, out = 16;
    for (const r of others) {
      const ux = Math.cos(r.a), uy = Math.sin(r.a);
      const ex = W / 2 + out, ey = H / 2 + out;
      const t = 1 / Math.pow(Math.pow(Math.abs(ux) / ex, 4) + Math.pow(Math.abs(uy) / ey, 4), 0.25);
      const lx = W / 2 + ux * t, ly = H / 2 + uy * t;
      const ghosts = memories.filter((m) => m.region === r.id && linksHere(m)).slice(0, 4);
      regions.push({ id: r.id, cx: r1(lx), cy: r1(ly), R: Rp, sx: 1, sy: 0.9, d: blobPath(lx, ly, Rp, hash(r.id), 1, 0.9), count: counts[r.id], more: 0, quiet: true, ux, uy, centre: false });
      ghosts.forEach((m, i) => {
        const off = (i - (ghosts.length - 1) / 2) * 64;
        const gx = clamp(lx - ux * Rp * 0.52 - uy * off, 44, W - 44);
        const gy = clamp(ly - uy * Rp * 0.52 * 0.9 + ux * off, 44, H - 44);
        cells.push({ id: m.id, region: m.region, x: r1(gx), y: r1(gy), r: r1(radiusOf(m, 0.86)), ghost: true });
      });
    }
  }
  const fibres = fibresOf(cells, edges, { bend: 0.12, only: open });
  return { w: W, h: H, regions, cells, fibres, tracts: [], open, hidden: mine.length - shown.length };
}

// ── words: placed where they collide with nothing, or left out ──────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hits = (a: Box, b: Box) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

export interface Label {
  id: string;
  text: string;
  /** the type, above the name, in an open region */
  kicker?: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  fs: number;
  /** how strong its ink: the most important read first */
  tier: 1 | 2 | 3;
  box: Box;
}

export interface RegionName {
  id: RegionId;
  text: string;
  count: string;
  x: number;
  y: number;
  fs: number;
  /** where the count starts */
  cx: number;
  quiet?: boolean;
  box: Box;
}

/**
 * Where the words go, at one zoom: region names first (where no relationship
 * runs through them), then each memory's name in the order it matters, beside
 * it where it touches nothing — never over another word, a cell or a control.
 * A name with nowhere to go is left out and found by moving closer, in the
 * list, or by selecting it; a memory that must be named (the selected one)
 * is named at its first place regardless.
 *
 * `scale` is how much the world is magnified on screen: words are set at a
 * constant size on screen, so closer in, they are smaller in the world and
 * more of them fit.
 */
export function placeWords(scene: Scene, memories: ReadonlyMap<string, Memory>, o: { scale?: number; measure?: Measure; avoid?: Box[]; must?: ReadonlySet<string>; kickers?: boolean; most?: number; regionNames?: boolean } = {}): { labels: Label[]; names: RegionName[] } {
  const k = 1 / (o.scale ?? 1);
  const measure = o.measure ?? estimate;
  const W = scene.w, H = scene.h;
  const boxes: Box[] = [...(o.avoid ?? [])];
  const inside = (b: Box) => b.x >= 4 && b.x + b.w <= W - 4 && b.y >= 4 && b.y + b.h <= H - 4;
  const free = (b: Box) => !boxes.some((x) => hits(x, b));
  for (const c of scene.cells) boxes.push({ x: c.x - c.r - 2 * k, y: c.y - c.r - 2 * k, w: (c.r + 2 * k) * 2, h: (c.r + 2 * k) * 2 });

  // region names
  const names: RegionName[] = [];
  if (o.regionNames !== false) {
    const dots: [number, number][] = [];
    for (const fb of scene.fibres) for (let t = 0; t <= 1; t += 0.04) dots.push(pointOn(fb, t));
    for (const r of scene.regions) {
      if (r.strong || r.inner) continue;
      const info = REGION[r.id];
      const fs = 10.5 * k;
      const text = (r.quiet ? info.short : info.name).toUpperCase();
      const nameW = measure(text, fs, 600) + text.length * fs * 0.14;
      const count = String(r.count);
      const cw = measure(count, fs, 500) + 7 * k;
      const tw = nameW + cw;
      const top = r.cy - r.R * r.sy * 1.06 - 9 * k, bottom = r.cy + r.R * r.sy * 1.06 + fs + 7 * k;
      const spots: [number, number][] = r.quiet
        ? [0.3, 0.55, 0.8, 0.95].flatMap((kk) => [0, -60, 60, -115, 115].map((off): [number, number] => [r.cx - r.ux * r.R * kk - r.uy * off, r.cy - r.uy * r.R * kk * 0.9 + r.ux * off + 4]))
        : r.centre
          ? [[r.cx, top], [r.cx, r.cy - r.R * r.sy * 0.78]]
          : r.uy > 0.3
            ? [[r.cx, bottom], [r.cx, top]]
            : [[r.cx, top], [r.cx, bottom]];
      const fit = ([x, y]: [number, number]): [number, number] => [clamp(x, tw / 2 + 12 * k, W - tw / 2 - 12 * k), clamp(y, fs + 12 * k, H - 10 * k)];
      const boxAt = (p: [number, number]): Box => {
        const [x, y] = fit(p);
        return { x: x - tw / 2 - 5 * k, y: y - fs - 3 * k, w: tw + 10 * k, h: fs + 8 * k };
      };
      const crosses = (b: Box) => dots.some(([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
      const at = spots.find((p) => inside(boxAt(p)) && free(boxAt(p)) && !crosses(boxAt(p))) ?? spots.find((p) => inside(boxAt(p)) && free(boxAt(p))) ?? spots[0];
      const box = boxAt(at);
      boxes.push(box);
      const [x, y] = fit(at);
      names.push({ id: r.id, text, count, x: r1(x - tw / 2), y: r1(y), fs, cx: r1(x - tw / 2 + nameW + 7 * k), quiet: r.quiet, box });
    }
  }

  // memory names, the most important first
  const labels: Label[] = [];
  const most = o.most ?? 30;
  const order = scene.cells
    .map((c) => ({ c, m: memories.get(c.id) }))
    .filter((x): x is { c: Cell; m: Memory } => !!x.m)
    .sort((a, b) => (o.must?.has(b.c.id) ? 1 : 0) - (o.must?.has(a.c.id) ? 1 : 0) || b.m.prio - a.m.prio || a.c.id.localeCompare(b.c.id));
  for (const { c, m } of order) {
    const big = !!o.kickers && !c.ghost;
    const fs = (big ? 12.5 : 11.5) * k;
    const text = ellipsis(m.label, big ? most + 6 : most);
    const w = measure(text, fs, big ? 550 : 500);
    const kicker = big ? m.type.toUpperCase() : undefined;
    const kw = kicker ? measure(kicker, 9.5 * k, 600) + kicker.length * 0.95 * k : 0;
    const hh = kicker ? fs + 14 * k : fs + 3 * k;
    const ww = Math.max(w, kw);
    const pad = c.r + (m.state.recent ? 8 : 5) * k;
    const cands = ['below', 'above', 'right', 'left'] as const;
    const boxFor = (cand: (typeof cands)[number]) => {
      let bx: number, by: number;
      if (cand === 'below') [bx, by] = [c.x - ww / 2, c.y + pad + k];
      else if (cand === 'above') [bx, by] = [c.x - ww / 2, c.y - pad - hh - k];
      else if (cand === 'right') [bx, by] = [c.x + pad + 4 * k, c.y - hh / 2];
      else [bx, by] = [c.x - pad - 4 * k - ww, c.y - hh / 2];
      return { cand, bx, by, box: { x: bx - 3 * k, y: by - 2 * k, w: ww + 6 * k, h: hh + 4 * k } };
    };
    let chosen = cands.map(boxFor).find((t) => inside(t.box) && free(t.box)) ?? null;
    if (!chosen && o.must?.has(c.id)) chosen = boxFor('below');
    if (!chosen) continue;
    boxes.push(chosen.box);
    const anchor = chosen.cand === 'right' ? 'start' : chosen.cand === 'left' ? 'end' : 'middle';
    const ax = chosen.cand === 'right' ? chosen.bx : chosen.cand === 'left' ? chosen.bx + ww : c.x;
    const y = chosen.by + (kicker ? 10 * k : 0) + (kicker ? fs + 3.5 * k : fs - k);
    labels.push({ id: c.id, text, kicker, x: r1(ax), y: r1(y), anchor, fs, tier: m.prio >= 2.4 ? 1 : m.prio >= 1.3 ? 2 : 3, box: chosen.box });
  }
  return { labels, names };
}

/** Where a relationship's word sits on its fibre — on a small plate, where there is room for it. */
export function placeRelWords(fibres: readonly Fibre[], taken: readonly Box[], o: { scale?: number; measure?: Measure; w: number; h: number; words: (fb: Fibre) => string }): { id: string; text: string; x: number; y: number; box: Box }[] {
  const k = 1 / (o.scale ?? 1);
  const measure = o.measure ?? estimate;
  const boxes = [...taken];
  const out: { id: string; text: string; x: number; y: number; box: Box }[] = [];
  for (const fb of fibres) {
    const text = o.words(fb);
    if (!text) continue;
    const w = measure(text, 12.5 * k, 400) * 0.92 + 14 * k;
    for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73]) {
      const [x, y] = pointOn(fb, t);
      const box = { x: x - w / 2, y: y - 10 * k, w, h: 19 * k };
      if (box.x < 4 || box.y < 4 || box.x + box.w > o.w - 4 || box.y + box.h > o.h - 4) continue;
      if (boxes.some((b) => hits(b, box))) continue;
      boxes.push(box);
      out.push({ id: fb.id, text, x: r1(x), y: r1(y), box });
      break;
    }
  }
  return out;
}

/**
 * Walking along relationships with the arrow keys: from a memory, the
 * neighbour lying most nearly in the direction pressed.
 */
export function neighbourToward(from: Cell, cells: readonly Cell[], fibres: readonly Fibre[], dir: 'left' | 'right' | 'up' | 'down'): string | null {
  const want = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[dir];
  const at = new Map(cells.map((c) => [c.id, c]));
  let best: { id: string; score: number } | null = null;
  for (const fb of fibres) {
    const other = fb.a === from.id ? fb.b : fb.b === from.id ? fb.a : null;
    const c = other ? at.get(other) : null;
    if (!c) continue;
    let d = Math.atan2(c.y - from.y, c.x - from.x) - want;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > Math.PI / 2) continue;
    const score = Math.abs(d) * 200 + Math.hypot(c.x - from.x, c.y - from.y) * 0.1;
    if (!best || score < best.score) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

/** The changes that touch each region: a change counts in the regions of both its sides. */
export function changeCounts(changes: readonly ChangeIn[], memories: ReadonlyMap<string, Memory>, which: 'all' | 'proposed'): Record<RegionId, number> {
  const out = Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as Record<RegionId, number>;
  for (const c of changes) {
    if (which === 'proposed' && c.review !== 'proposed') continue;
    const rs = new Set<RegionId>();
    for (const id of [c.from.id, c.to.id]) {
      const m = memories.get(id);
      const r = m?.region ?? regionOf(id === c.from.id ? c.from.type : c.to.type);
      if (r) rs.add(r);
    }
    for (const r of rs) out[r] += 1;
  }
  return out;
}
