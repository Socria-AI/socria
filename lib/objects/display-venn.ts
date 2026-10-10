// A VENN DIAGRAM — what two or three sets share, and what each holds alone.
//
// "What do cats and dogs have in common?", "sort these drinks into morning
// and evening", "which skills does each role need?": one state — two or three
// sets and the elements placed in them. An element sits in any combination of
// the sets, or in none of them (it is in the picture, outside every circle).
// The diagram and the table are VIEWS of that state; dragging an element into
// another region is an operation computed here, kept in the history and
// undoable.
//
// What is computed, never asserted: every region — each combination of the
// sets, "in none" among them — with its members and its count; and the
// geometry the diagram is drawn with: equal circles in a unit box, and for
// each region a point for its label that lies inside exactly the circles the
// region is inside (found by measuring, and tested by measuring again).
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
  guardBy,
  guardOwn,
  headOps,
  nextId,
  norm,
  op,
  readView,
  registerDisplay,
  sameAs,
  todayDay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
  type DisplayMeta,
} from './display-base';

export type VennView = 'venn' | 'table';

export interface VennSet {
  id: string;
  name: string;
  by: By;
}

export interface VennElement {
  id: string;
  label: string;
  /** the sets it is in, in the sets' own order; empty: in none of them */
  sets: string[];
  by: By;
}

export interface VennState extends DisplayHead {
  view: VennView;
  sets: VennSet[];
  elements: VennElement[];
}

export const VENN_LIMITS = { minSets: 2, sets: 3, elements: 40, name: 40, label: 60, title: 80 } as const;
const L = VENN_LIMITS;

// ── small helpers (keyOf, claimIds, andList, asking belong in display-base; see the report) ──

const keyOf = (name: string) => norm(name) || name.toLowerCase();
const r6 = (x: number) => Math.round(x * 1e6) / 1e6 || 0;

function andList(xs: readonly string[], max = 6): string {
  if (xs.length > max) return `${xs.slice(0, max).join(', ')} and ${xs.length - max} more`;
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Ids for lists read together: an entry keeps its own when valid and unclaimed; the rest take the next free one with their prefix. */
function claimIds(groups: { raws: Record<string, unknown>[]; prefix: string }[]): string[][] {
  const taken = new Set<string>();
  const own = groups.map((g) =>
    g.raws.map((o) => {
      const id = cleanId(o.id);
      if (!id || taken.has(id)) return null;
      taken.add(id);
      return id;
    })
  );
  return groups.map((g, i) =>
    own[i].map((id) => {
      if (id) return id;
      const fresh = nextId(g.prefix, taken);
      taken.add(fresh);
      return fresh;
    })
  );
}

/** A question about the diagram, not an instruction to change it, is left to the conversation. */
function asking(t: string): boolean {
  return /\?\s*$/.test(t) && !/^\s*(?:can you|could you|would you|will you|please)\b/i.test(t);
}

/** A set's name. Sets are named in a comma-separated list (`addElement`'s `sets`), so a name holds no comma. */
const setNameOf = (v: unknown) => cleanText(typeof v === 'string' ? v.replace(/,/g, ' ') : v, L.name);

const popcount = (m: number) => {
  let n = 0;
  for (let x = m; x; x &= x - 1) n++;
  return n;
};

// ── canonical state ──────────────────────────────────────────────────

interface Named {
  raw: Record<string, unknown>;
  name: string;
}

function namedEntries(list: unknown, cap: number, nameOf: (o: Record<string, unknown>) => string): Named[] {
  const out: Named[] = [];
  const seen = new Set<string>();
  for (const x of (Array.isArray(list) ? list : []).slice(0, cap * 8)) {
    if (out.length >= cap) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = nameOf(o);
    if (!name || seen.has(keyOf(name))) continue;
    seen.add(keyOf(name));
    out.push({ raw: o, name });
  }
  return out;
}

/** Set references — ids or names, as a list or comma-separated — to the sets' ids in the sets' order, and what did not match. */
function resolveSets(sets: readonly VennSet[], raw: unknown): { ids: string[]; unknown: string[] } {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const got = new Set<string>();
  const unknown: string[] = [];
  for (const p of parts.slice(0, 12)) {
    if (typeof p !== 'string' && typeof p !== 'number') continue;
    const ref = String(p).trim();
    if (!ref) continue;
    const s = sets.find((x) => x.id === ref) ?? sets.find((x) => keyOf(x.name) === keyOf(ref));
    if (s) got.add(s.id);
    else unknown.push(cleanText(ref, L.name));
  }
  return { ids: sets.filter((s) => got.has(s.id)).map((s) => s.id), unknown };
}

export function sanitizeVenn(raw: unknown): VennState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const setsIn = namedEntries(r.sets, L.sets, (o) => setNameOf(o.name ?? o.label ?? o.title));
  if (setsIn.length < L.minSets) return null;
  const elsIn = namedEntries(r.elements, L.elements, (o) => cleanText(o.label ?? o.name ?? o.text, L.label));
  const [sIds, eIds] = claimIds([
    { raws: setsIn.map((x) => x.raw), prefix: 's' },
    { raws: elsIn.map((x) => x.raw), prefix: 'e' },
  ]);
  const sets: VennSet[] = setsIn.map((x, i) => ({ id: sIds[i], name: x.name, by: cleanBy(x.raw.by) }));
  // a reference to a set that is not there is dropped: the element is in the sets that are
  const elements: VennElement[] = elsIn.map((x, i) => ({ id: eIds[i], label: x.name, sets: resolveSets(sets, x.raw.sets).ids, by: cleanBy(x.raw.by) }));
  return { title: cleanText(r.title, L.title) || 'Venn diagram', view: r.view === 'table' ? 'table' : 'venn', sets, elements };
}

// ── what is computed: the regions ────────────────────────────────────

/** An element's region as bits over the sets in order: bit i is sets[i]; 0 is in none. */
export function maskOf(s: VennState, e: VennElement): number {
  return s.sets.reduce((m, x, i) => (e.sets.includes(x.id) ? m | (1 << i) : m), 0);
}

/** Every region for n sets — each set alone, then each pair, then all three, then none — as masks. */
export function regionOrder(n: number): number[] {
  return Array.from({ length: 1 << n }, (_, m) => m).sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : popcount(a) - popcount(b) || a - b));
}

/** A region in words: "only in Morning", "in Morning and Evening, not Weekend", "in all three", "in neither". */
export function regionWords(s: VennState, mask: number): string {
  const names = s.sets.map((x) => x.name);
  const inside = names.filter((_, i) => mask & (1 << i));
  if (!inside.length) return names.length === 2 ? 'in neither' : 'in none of them';
  if (inside.length === names.length) return names.length === 2 ? `in both ${names[0]} and ${names[1]}` : 'in all three';
  if (inside.length === 1) return `only in ${inside[0]}`;
  return `in ${andList(inside)}, not ${andList(names.filter((_, i) => !(mask & (1 << i))))}`;
}

export interface VennRegion {
  /** which sets, as bits over the sets in order: bit i is sets[i]; 0 is in none */
  mask: number;
  /** the sets this region is inside — it is outside all the others */
  sets: string[];
  label: string;
  /** element ids, in the elements' order */
  members: string[];
  count: number;
}

/** Every combination of the sets, "in none" among them, with what is in it — empty regions too. */
export function vennRegions(s: VennState): VennRegion[] {
  return regionOrder(s.sets.length).map((mask) => {
    const members = s.elements.filter((e) => maskOf(s, e) === mask).map((e) => e.id);
    return { mask, sets: s.sets.filter((_, i) => mask & (1 << i)).map((x) => x.id), label: regionWords(s, mask), members, count: members.length };
  });
}

/** How many elements each set holds, and how many of them are in it alone. */
export function setCounts(s: VennState): { set: string; count: number; only: number }[] {
  return s.sets.map((x) => ({
    set: x.id,
    count: s.elements.filter((e) => e.sets.includes(x.id)).length,
    only: s.elements.filter((e) => e.sets.length === 1 && e.sets[0] === x.id).length,
  }));
}

// ── geometry, in a unit box ──────────────────────────────────────────

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** Every circle's radius. Centres are one radius apart, so every region is roomy. */
export const VENN_RADIUS = 0.25;

/**
 * Equal circles in the unit box [0,1]²: two side by side; three with their
 * centres on an equilateral triangle (two above, one below), centred in the
 * box. Each circle fits inside the box with room around it for the names and
 * for "in none".
 */
export function vennCircles(n: number): Circle[] {
  const r = VENN_RADIUS;
  if (n === 2) return [{ cx: 0.375, cy: 0.5, r }, { cx: 0.625, cy: 0.5, r }];
  if (n === 3) {
    const h = r6((r * Math.sqrt(3)) / 2);
    const top = r6(0.5 - h / 2);
    return [
      { cx: 0.375, cy: top, r },
      { cx: 0.625, cy: top, r },
      { cx: 0.5, cy: r6(top + h), r },
    ];
  }
  return [];
}

/** Which circles a point is inside, as bits. */
export function maskAt(circles: readonly Circle[], x: number, y: number): number {
  let m = 0;
  circles.forEach((c, i) => {
    const dx = x - c.cx;
    const dy = y - c.cy;
    if (dx * dx + dy * dy < c.r * c.r) m |= 1 << i;
  });
  return m;
}

export interface Anchor {
  mask: number;
  x: number;
  y: number;
  /** how far the point is from the nearest circle's edge or the box's: the room a label has */
  clearance: number;
}

const ANCHORS = new Map<number, Anchor[]>();

/**
 * Where each region's label goes: the point of the region farthest from every
 * edge — every circle's and the box's — found on a 201 × 201 grid. It lies
 * inside exactly the circles its region is inside. The geometry is fixed for
 * two and for three sets, so it is measured once for each.
 */
export function regionAnchors(n: number): Anchor[] {
  const known = ANCHORS.get(n);
  if (known) return known.map((a) => ({ ...a }));
  const cs = vennCircles(n);
  const N = 200;
  const best = new Map<number, Anchor>();
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      const y = j / N;
      let mask = 0;
      let room = Math.min(x, 1 - x, y, 1 - y);
      for (let k = 0; k < cs.length; k++) {
        const dx = x - cs[k].cx;
        const dy = y - cs[k].cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < cs[k].r * cs[k].r) mask |= 1 << k;
        room = Math.min(room, Math.abs(Math.sqrt(d2) - cs[k].r));
      }
      const b = best.get(mask);
      if (!b || room > b.clearance + 1e-12) best.set(mask, { mask, x, y, clearance: room });
    }
  }
  const out = [...best.values()].sort((a, b) => a.mask - b.mask).map((a) => ({ ...a, clearance: r6(a.clearance) }));
  ANCHORS.set(n, out);
  return out.map((a) => ({ ...a }));
}

/** Where each set's name goes: just outside its circle — above it, or below for the third circle of three. */
export function nameAnchors(n: number): { x: number; y: number }[] {
  const gap = 0.06;
  return vennCircles(n).map((c, i) => (n === 3 && i === 2 ? { x: c.cx, y: r6(c.cy + c.r + gap) } : { x: c.cx, y: r6(c.cy - c.r - gap) }));
}

export interface VennLayout {
  circles: (Circle & { set: string; name: string; label: { x: number; y: number } })[];
  regions: (VennRegion & { x: number; y: number; clearance: number })[];
}

/** Everything the diagram draws, in the unit box: the circles with their names, and every region at its label point with its members. */
export function vennLayout(s: VennState): VennLayout {
  const n = s.sets.length;
  const cs = vennCircles(n);
  const names = nameAnchors(n);
  const anchors = regionAnchors(n);
  return {
    circles: s.sets.map((x, i) => ({ ...cs[i], set: x.id, name: x.name, label: names[i] })),
    regions: vennRegions(s).map((r) => {
      const a = anchors.find((x) => x.mask === r.mask)!;
      return { ...r, x: a.x, y: a.y, clearance: a.clearance };
    }),
  };
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<VennState>[] = [
  {
    id: 'venn',
    label: 'Venn diagram',
    shows: 'the sets as overlapping circles, each element in the region it belongs to',
    primary: true,
    interactions: ['drag an element into another region', 'rename a set'],
    unavailable: (s) => (s.sets.length >= L.minSets && s.sets.length <= L.sets ? null : 'A Venn diagram is drawn for two or three sets.'),
  },
  { id: 'table', label: 'Table', shows: 'every element with a mark for each set it is in, and the count in each region', interactions: ['tick or untick a set for an element'] },
];

const VIEW_WORDS: Record<string, string[]> = {
  venn: ['venn', 'venn diagram', 'diagram', 'circles'],
  table: ['table', 'grid', 'list'],
};

const setOf = (s: VennState, id: unknown) => s.sets.find((x) => x.id === id);
const elOf = (s: VennState, id: unknown) => s.elements.find((e) => e.id === id);
const noSet = (s: VennState, id: unknown) => (setOf(s, id) ? null : 'There is no such set in the diagram.');
const noEl = (s: VennState, id: unknown) => (elOf(s, id) ? null : 'There is no such element in the diagram.');
const allIds = (s: VennState) => [...s.sets.map((x) => x.id), ...s.elements.map((e) => e.id)];
const namesOf = (s: VennState, ids: readonly string[]) => s.sets.filter((x) => ids.includes(x.id)).map((x) => x.name).join(', ');

/** What the person changes becomes theirs — a change carries `by`, checked against who applied it; Socria's own changes leave ownership as it was. */
const claim = (a: Args, was: By): By => (a.by === 'person' ? 'person' : was);

function withState(s: VennState, patch: Partial<VennState>): VennState {
  return sanitizeVenn({ ...s, ...patch }) ?? s;
}

/** Where a set list puts an element, in words, for a step's record: "in Morning and Evening", "in none of the sets". */
function whereSaid(sets: unknown): string {
  const names = String(sets ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return names.length ? `in ${andList(names)}` : 'in none of the sets';
}

/** Socria removing a set would move the person's elements out of it. */
function guardTheirElements(s: VennState, set: string, ctx: Ctx): string | null {
  if (ctx?.by === 'socria' && s.elements.some((e) => e.by === 'person' && e.sets.includes(set))) {
    return 'Your elements are in it — Socria does not move what you placed. It can suggest removing the set for you to do.';
  }
  return null;
}

export const VENN_OPS = {
  ...headOps<VennState>(views, sanitizeVenn),
  addSet: op<VennState>(
    'Add a set',
    (s, a, ctx) => {
      const name = setNameOf(a.name);
      if (!name) return 'Say what the set is.';
      if (s.sets.length >= L.sets) return `A Venn diagram here holds ${L.sets} sets at most.`;
      if (s.sets.some((x) => keyOf(x.name) === keyOf(name))) return `There is already a set called ‘${name}’.`;
      return guardBy(a, ctx);
    },
    (s, a) => withState(s, { sets: [...s.sets, { id: nextId('s', allIds(s)), name: setNameOf(a.name), by: cleanBy(a.by) }] }),
    (a) => `added the set “${setNameOf(a.name)}”`
  ),
  renameSet: op<VennState>(
    'Rename a set',
    (s, a, ctx) => {
      const miss = noSet(s, a.id);
      if (miss) return miss;
      const name = setNameOf(a.name);
      if (!name) return 'Say what it should be called.';
      if (setOf(s, a.id)!.name === name) return 'It is already called that.';
      if (s.sets.some((x) => x.id !== a.id && keyOf(x.name) === keyOf(name))) return `There is already a set called ‘${name}’.`;
      return guardOwn(setOf(s, a.id), ctx) ?? guardBy(a, ctx);
    },
    (s, a) => withState(s, { sets: s.sets.map((x) => (x.id === a.id ? { ...x, name: setNameOf(a.name), by: claim(a, x.by) } : x)) }),
    (a) => `renamed “${setNameOf(a.name)}”`
  ),
  removeSet: op<VennState>(
    'Remove a set',
    (s, a, ctx) => {
      const miss = noSet(s, a.id);
      if (miss) return miss;
      if (s.sets.length <= L.minSets) return `A Venn diagram needs at least ${L.minSets} sets.`;
      return guardOwn(setOf(s, a.id), ctx) ?? guardTheirElements(s, String(a.id), ctx);
    },
    // its elements stay, and lose only that membership
    (s, a) => withState(s, { sets: s.sets.filter((x) => x.id !== a.id), elements: s.elements.map((e) => ({ ...e, sets: e.sets.filter((id) => id !== a.id) })) }),
    () => 'removed a set'
  ),
  addElement: op<VennState>(
    'Add an element',
    (s, a, ctx) => {
      const label = cleanText(a.label, L.label);
      if (!label) return 'Say what the element is.';
      if (s.elements.length >= L.elements) return `A Venn diagram holds ${L.elements} elements at most.`;
      const same = s.elements.find((e) => keyOf(e.label) === keyOf(label));
      if (same) return `‘${same.label}’ is already in it — move it instead.`;
      const { unknown } = resolveSets(s.sets, a.sets ?? '');
      if (unknown.length) return `There is no set called ‘${unknown[0]}’ in it.`;
      return guardBy(a, ctx);
    },
    (s, a) =>
      withState(s, { elements: [...s.elements, { id: nextId('e', allIds(s)), label: cleanText(a.label, L.label), sets: resolveSets(s.sets, a.sets ?? '').ids, by: cleanBy(a.by) }] }),
    (a) => `added “${cleanText(a.label, L.label)}” ${whereSaid(a.sets)}`
  ),
  setsOf: op<VennState>(
    'Place',
    (s, a, ctx) => {
      const miss = noEl(s, a.id);
      if (miss) return miss;
      if (a.sets === undefined) return 'Say which sets it goes in — or none of them.';
      const { ids, unknown } = resolveSets(s.sets, a.sets);
      if (unknown.length) return `There is no set called ‘${unknown[0]}’ in it.`;
      const e = elOf(s, a.id)!;
      const own = guardOwn(e, ctx) ?? guardBy(a, ctx);
      if (own) return own;
      // a step that changes nothing the person can see is not a step
      if (sameAs(ids, e.sets)) return `‘${e.label}’ is already ${regionWords(s, maskOf(s, e))}.`;
      return null;
    },
    (s, a) => withState(s, { elements: s.elements.map((e) => (e.id === a.id ? { ...e, sets: resolveSets(s.sets, a.sets ?? '').ids, by: claim(a, e.by) } : e)) }),
    (a) => `placed ${whereSaid(a.sets)}`
  ),
  renameElement: op<VennState>(
    'Rename an element',
    (s, a, ctx) => {
      const miss = noEl(s, a.id);
      if (miss) return miss;
      const label = cleanText(a.label, L.label);
      if (!label) return 'Say what it should be called.';
      if (elOf(s, a.id)!.label === label) return 'It is already called that.';
      const same = s.elements.find((e) => e.id !== a.id && keyOf(e.label) === keyOf(label));
      if (same) return `‘${same.label}’ is already in it.`;
      return guardOwn(elOf(s, a.id), ctx) ?? guardBy(a, ctx);
    },
    (s, a) => withState(s, { elements: s.elements.map((e) => (e.id === a.id ? { ...e, label: cleanText(a.label, L.label), by: claim(a, e.by) } : e)) }),
    (a) => `renamed “${cleanText(a.label, L.label)}”`
  ),
  removeElement: op<VennState>(
    'Remove an element',
    (s, a, ctx) => noEl(s, a.id) ?? guardOwn(elOf(s, a.id), ctx),
    (s, a) => withState(s, { elements: s.elements.filter((e) => e.id !== a.id) }),
    () => 'removed'
  ),
};

// ── words → an operation ─────────────────────────────────────────────

const unS = (t: string) => t.replace(/(\w)[’']s\b/g, '$1');
const stripQuotes = (t: string) => t.trim().replace(/^[“"']|[”"']$/g, '').trim();

const NONE_WORDS = /^(?:neither|none|nowhere|no set|no sets|no circle|no circles|none of them|neither of them|neither set|neither circle|none of the sets|outside|outside them|outside them all|outside all|outside all of them|outside every set|outside both|outside the circles|not in any)$/;
const ANY_WORDS = /^(?:any|any of them|either|either of them|any set|either set|any of the sets|either one)$/;
const BOTH_WORDS = /^(?:both|both of them|both sets|both circles)$/;
const ALL_WORDS = /^(?:all|all three|all 3|all of them|all the sets|all sets|every set|each of them|every one of them|all three sets|all three circles)$/;
const FILLER = new Set(['and', 'or', 'plus', 'only', 'just', 'alone', 'solely', 'both', 'the', 'set', 'sets', 'circle', 'circles', 'too', 'also', 'as', 'well', 'of', 'them', 'group', 'groups']);

/**
 * The sets a phrase names — "Morning and Evening", "both", "Morning only",
 * "neither" — or null when it names anything besides sets and the words that
 * join them. `only`: the element goes exactly there; `any`: "either", which
 * names no set in particular.
 */
function setsSaid(s: VennState, phrase: string): { ids: string[]; only: boolean; any: boolean } | null {
  const p = norm(unS(phrase));
  if (!p) return null;
  const only = /\b(?:only|just|alone|solely)\b/.test(p);
  const core = p.replace(/\b(?:only|just|alone|solely)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (NONE_WORDS.test(core)) return { ids: [], only: true, any: false };
  if (ANY_WORDS.test(core)) return { ids: [], only: false, any: true };
  if (BOTH_WORDS.test(core)) return s.sets.length === 2 ? { ids: s.sets.map((x) => x.id), only: true, any: false } : null;
  if (ALL_WORDS.test(core)) return { ids: s.sets.map((x) => x.id), only: true, any: false };
  let said = ` ${core} `;
  const got = new Set<string>();
  for (const x of [...s.sets].sort((a, b) => norm(b.name).length - norm(a.name).length)) {
    const l = norm(unS(x.name));
    if (l && said.includes(` ${l} `)) {
      got.add(x.id);
      said = said.split(` ${l} `).join('  ');
    }
  }
  if (!got.size || said.split(' ').some((w) => w && !FILLER.has(w))) return null;
  return { ids: s.sets.filter((x) => got.has(x.id)).map((x) => x.id), only, any: false };
}

/** An element named exactly — "the coffee", "coffee" — never from part of a label: "iced coffee" is not "coffee". */
function elementCalled(s: VennState, words: string): VennElement | null {
  const w = norm(unS(stripQuotes(words)));
  if (!w) return null;
  const bare = w.replace(/\s+(?:element|item|entry|one)$/, '');
  return s.elements.find((e) => norm(unS(e.label)) === w) ?? s.elements.find((e) => norm(unS(e.label)) === bare) ?? null;
}

/** A set named exactly, with or without the word "set": "Morning", "the Morning set", "set Morning". */
function setCalled(s: VennState, words: string): VennSet | null {
  const w = norm(unS(stripQuotes(words)));
  if (!w) return null;
  const bare = w.replace(/\s+(?:set|circle|group|category)$/, '').replace(/^(?:set|circle|group|category)\s+/, '');
  return s.sets.find((x) => norm(unS(x.name)) === w) ?? s.sets.find((x) => norm(unS(x.name)) === bare) ?? null;
}

/** Whether the words name any set or element of this diagram by its whole name. */
function mentions(s: VennState, text: string): boolean {
  const said = ` ${norm(unS(text))} `;
  return [...s.sets.map((x) => x.name), ...s.elements.map((e) => e.label)].some((n) => {
    const l = norm(unS(n));
    return l.length >= 2 && said.includes(` ${l} `);
  });
}

/** The element's sets after a placement: exactly where it was put, or — "also", "add … to" — added to where it already is. */
function placed(s: VennState, e: VennElement | null, where: string[], union: boolean): string[] {
  if (!e || !union) return where;
  return s.sets.map((x) => x.id).filter((id) => e.sets.includes(id) || where.includes(id));
}

/**
 * An operation the words plainly ask for. Conservative by design: this runs
 * on every message while the diagram is in the workspace, so it answers only
 * when the words name an element or set of THIS diagram exactly (or clearly
 * add one), and otherwise leaves the message to the conversation. Nothing in
 * a Venn diagram depends on the day; `today` is taken so every display's
 * reader has the same shape.
 */
export function readVennOp(text: string, s: VennState, _today?: string): { op: string; args: Args } | null {
  const said = text.trim();
  if (!said || said.length > 200 || asking(said)) return null;
  // "can you put tea in Evening?" is "put tea in Evening"
  const t = said.replace(/^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i, '').replace(/\?+\s*$/, '').trim();
  if (!t) return null;

  // a view: "show it as a table", "back to the diagram"
  const view = readView(t, views, VIEW_WORDS);
  if (view && t.length <= 60 && !mentions(s, t)) return { op: 'view', args: { view } };
  const bare = /^(?:(?:go\s+)?back\s+to\s+)?(?:the\s+)?(venn diagram|venn|diagram|circles|table)\s*[.!]?$/i.exec(t);
  if (bare) return { op: 'view', args: { view: /table/i.test(bare[1]) ? 'table' : 'venn' } };

  // rename: "rename Morning to Mornings", "rename coffee to espresso"
  const rn = /^(?:please\s+)?rename\s+(.+?)\s+(?:to|as)\s+(.+?)[.!]*$/i.exec(t);
  if (rn) {
    const set = setCalled(s, rn[1]);
    const el = elementCalled(s, rn[1]);
    const name = stripQuotes(rn[2]);
    if (set && !el) return setNameOf(name) ? { op: 'renameSet', args: { id: set.id, name: setNameOf(name), by: 'person' } } : null;
    if (el && !set) return cleanText(name, L.label) ? { op: 'renameElement', args: { id: el.id, label: cleanText(name, L.label), by: 'person' } } : null;
    return null;
  }

  // between sets: "move coffee from Morning to Evening"
  const mv = /^(?:please\s+)?move\s+(.+?)\s+from\s+(.+?)\s+(?:to|into|in|over to)\s+(.+?)[.!]*$/i.exec(t);
  if (mv) {
    const el = elementCalled(s, mv[1]);
    const from = el ? setsSaid(s, mv[2]) : null;
    const to = el ? setsSaid(s, mv[3]) : null;
    if (!el || !from || !to || from.any || to.any) return null;
    const ids = s.sets.map((x) => x.id).filter((id) => (el.sets.includes(id) && !from.ids.includes(id)) || to.ids.includes(id));
    return { op: 'setsOf', args: { id: el.id, sets: namesOf(s, ids), by: 'person' } };
  }

  // out of a set: "take coffee out of Morning", "remove coffee from Evening"
  const out = /^(?:please\s+)?(?:take|remove|pull|move|get|drop)\s+(.+?)\s+(?:out of|from|off)\s+(.+?)[.!]*$/i.exec(t);
  if (out) {
    const el = elementCalled(s, out[1]);
    const set = setCalled(s, out[1]);
    const whole = /^(?:the\s+)?(?:diagram|venn|venn diagram|list|table|picture|it|this)$/i.test(out[2].trim());
    if (whole && el && !set) return { op: 'removeElement', args: { id: el.id } };
    if (whole && set && !el) return { op: 'removeSet', args: { id: set.id } };
    const from = el ? setsSaid(s, out[2]) : null;
    if (el && from && !from.any && from.ids.length) return { op: 'setsOf', args: { id: el.id, sets: namesOf(s, el.sets.filter((id) => !from.ids.includes(id))), by: 'person' } };
    if (el || set) return null;
  }

  // remove: "remove coffee", "delete the Evening set"
  const rm = /^(?:please\s+)?(?:remove|delete|drop|get rid of|take out|cross off|scrap)\s+(.+?)[.!]*$/i.exec(t);
  if (rm) {
    const el = elementCalled(s, rm[1]);
    const set = setCalled(s, rm[1]);
    const typedSet = /\b(?:set|circle|group|category)\b/i.test(rm[1]);
    if (set && (!el || typedSet)) return { op: 'removeSet', args: { id: set.id } };
    if (el && !set) return { op: 'removeElement', args: { id: el.id } };
    if (el && set) return null; // an element and a set with one name, and no word to say which
  }

  // a new set: "add a set: Weekend", "add a third circle called Weekend"
  const ns = /^(?:please\s+)?(?:add|make|create|include|draw)\s+(?:a|an|another|a third|a new|one more|new|the)?\s*(?:set|circle|group|category)\b\s*(?:called|named|for|of)?\s*:?\s*(.+?)[.!]*$/i.exec(t);
  if (ns) {
    const name = setNameOf(stripQuotes(ns[1].replace(/\s+(?:to|in)\s+(?:it|this|the diagram|the venn(?: diagram)?)$/i, '')));
    if (!name || name.split(' ').length > 6) return null;
    return { op: 'addSet', args: { name, by: 'person' } };
  }

  // place: "put coffee in Morning and Evening", "add tea to Morning only", "move coffee to both"
  const pv = /^(?:please\s+)?(?:(also)\s+)?(put|place|add|move|drop|file|sort|stick)\s+(.+?)[.!]*$/i.exec(t);
  if (pv) {
    const verb = pv[2].toLowerCase();
    const body = pv[3];
    // the first place the sentence can be cut so that what follows is a set phrase
    for (const m of body.matchAll(/\s(?:in|into|to|under|inside|onto)\s/gi)) {
      const where = setsSaid(s, body.slice(m.index! + m[0].length));
      if (!where) continue;
      if (where.any) return null;
      const who = body.slice(0, m.index).trim();
      const union = !where.only && (verb === 'add' || !!pv[1] || /\b(?:too|as well)\b/i.test(t));
      const el = elementCalled(s, who);
      if (el) return { op: 'setsOf', args: { id: el.id, sets: namesOf(s, placed(s, el, where.ids, union)), by: 'person' } };
      // a new element — only words that are plainly one name: not a pronoun, not a list, not a set
      if (verb === 'move') return null;
      const quoted = /^[“"'](.+)[”"']$/.exec(who);
      const label = cleanText(quoted ? quoted[1] : who.replace(/^(?:a|an|the|some)\s+/i, ''), L.label);
      if (!label || label.split(' ').length > 6) return null;
      if (!quoted && (/\b(?:and|or)\b|,/i.test(label) || /^(?:it|that|this|them|these|those|one|everything|something|anything|more)$/i.test(label))) return null;
      if (setCalled(s, label)) return null;
      return { op: 'addElement', args: { label, sets: namesOf(s, where.ids), by: 'person' } };
    }
  }

  // a statement about an element that is here: "coffee is in neither", "coffee goes in both", "tea is also in Evening".
  // Saying where something IS adds to where it is ("coffee is in Evening" does not take it out of Morning);
  // saying where it GOES or BELONGS puts it exactly there; "only", "neither", "both" and "all" are always exact.
  const st = /^(.+?)\s+(is|are|sits|sit|fits|fit|falls|fall|goes|go|belongs|belong)\s+(?:(also|only|just)\s+)?(?:in|into|under|inside|to)\s+(.+?)(?:\s+(too|as well))?[.!]*$/i.exec(t);
  if (st) {
    const el = elementCalled(s, st[1]);
    const where = el ? setsSaid(s, st[4]) : null;
    if (el && where && !where.any) {
      const directive = /^(?:goes|go|belongs|belong)$/i.test(st[2]);
      const exact = where.only || /^(?:only|just)$/i.test(st[3] ?? '');
      const union = !exact && (!directive || /^also$/i.test(st[3] ?? '') || !!st[5]);
      return { op: 'setsOf', args: { id: el.id, sets: namesOf(s, placed(s, el, where.ids, union)), by: 'person' } };
    }
  }

  // "coffee is not in Morning", "coffee isn't in any of them"
  const ng = /^(.+?)\s+(?:is not|isn['’]?t|is no longer|are not|aren['’]?t|does not belong|doesn['’]?t belong|do not belong|don['’]?t belong)\s+(?:in|to)\s+(.+?)[.!]*$/i.exec(t);
  if (ng) {
    const el = elementCalled(s, ng[1]);
    const where = el ? setsSaid(s, ng[2]) : null;
    if (el && where) {
      const ids = where.any || !where.ids.length ? [] : el.sets.filter((id) => !where.ids.includes(id));
      return { op: 'setsOf', args: { id: el.id, sets: namesOf(s, ids), by: 'person' } };
    }
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function factsOf(s: VennState): string[] {
  const n = s.sets.length;
  const m = s.elements.length;
  const label = (id: string) => s.elements.find((e) => e.id === id)?.label ?? id;
  const out = [`${s.title}: a Venn diagram of ${n} sets (${andList(s.sets.map((x) => x.name))}) holding ${m} element${m === 1 ? '' : 's'}, shown as ${s.view === 'venn' ? 'the diagram' : 'a table'}.`];
  out.push(`${setCounts(s).map((c) => `${setOf(s, c.set)!.name} holds ${c.count}${c.count ? ` (${c.only} only there)` : ''}`).join('; ')}.`);
  const regs = vennRegions(s);
  for (const r of regs.filter((x) => popcount(x.mask) >= 2 && x.count)) out.push(`${capFirst(r.label)}: ${r.count} — ${andList(r.members.map(label))}.`);
  const none = regs.find((x) => x.mask === 0)!;
  if (none.count) out.push(`${capFirst(none.label)}: ${none.count} — ${andList(none.members.map(label))}.`);
  const empty = regs.filter((x) => x.mask !== 0 && !x.count).map((x) => x.label);
  if (m && empty.length) out.push(`Empty: ${empty.join('; ')}.`);
  const mine = s.sets.filter((x) => x.by === 'person').length + s.elements.filter((e) => e.by === 'person').length;
  if (mine) out.push(`${mine} of its sets and elements are the person’s own; Socria does not move or change those.`);
  return out;
}

function textOf(s: VennState): string {
  const theirs = (x: { by: By }) => (x.by === 'person' ? ' · theirs' : '');
  const lines = [`VENN DIAGRAM “${s.title}” (shown as ${s.view === 'venn' ? 'the diagram' : 'a table'})`, `Sets: ${s.sets.map((x) => `${x.name}${theirs(x)}`).join('; ')}`];
  for (const r of vennRegions(s)) {
    const members = r.members.map((id) => s.elements.find((e) => e.id === id)!).map((e) => `${e.label}${theirs(e)}`);
    lines.push(`${capFirst(r.label)} (${r.count}): ${members.length ? members.join(', ') : '—'}`);
  }
  return lines.join('\n').slice(0, 2400);
}

export const VENN = displayKind<VennState>({
  kind: 'venn',
  label: 'Venn diagram',
  sanitize: sanitizeVenn,
  ops: VENN_OPS,
  readOp: (text, s) => readVennOp(text, s, todayDay()),
  consequence: (before, after) => {
    if (before.sets.length !== after.sets.length) {
      const gone = before.sets.find((x) => !after.sets.some((y) => y.id === x.id));
      if (!gone) return null;
      const had = before.elements.filter((e) => e.sets.includes(gone.id));
      if (!had.length) return null;
      const outside = after.elements.filter((e) => !e.sets.length && had.some((h) => h.id === e.id)).length;
      return `${had.length} element${had.length === 1 ? ' was' : 's were'} in ${gone.name}${outside ? `; ${outside} ${outside === 1 ? 'is' : 'are'} now in none of the sets` : ''}.`;
    }
    const moved = after.elements.filter((e) => {
      const b = before.elements.find((x) => x.id === e.id);
      return !b || !sameAs(b.sets, e.sets);
    });
    if (moved.length !== 1) return null;
    const e = moved[0];
    const mask = maskOf(after, e);
    const count = after.elements.filter((x) => maskOf(after, x) === mask).length;
    return `‘${e.label}’ is ${regionWords(after, mask)} — ${count === 1 ? 'the only one there' : `${count} there now`}.`;
  },
  facts: (s) => factsOf(s),
  text: textOf,
  parts: (s): Part[] => [...s.sets.map((x) => ({ id: x.id, label: x.name })), ...s.elements.map((e) => ({ id: e.id, label: e.label }))],
  partFacts: (s, part) => {
    const set = setOf(s, part);
    if (set) {
      const c = setCounts(s).find((x) => x.set === set.id)!;
      return [set.name, `${c.count} in it, ${c.only} only there`, set.by === 'person' ? 'yours' : 'from Socria'];
    }
    const e = elOf(s, part);
    if (!e) return null;
    return [e.label, regionWords(s, maskOf(s, e)), e.by === 'person' ? 'yours' : 'from Socria'];
  },
  views,
  size: (s, mode) => {
    if (mode === 'card') return { w: 260, h: 150 };
    if (mode === 'trail') return { w: 200, h: 110 };
    if (s.view === 'table') return { w: 560, h: Math.min(640, 130 + 28 * Math.max(4, s.elements.length)) };
    const most = Math.max(0, ...vennRegions(s).map((r) => r.count));
    return { w: 560, h: Math.min(640, 480 + 12 * Math.max(0, most - 6)) };
  },
  shape: (s) => `${s.view === 'venn' ? 'Venn diagram' : 'table'} · ${s.sets.length} sets, ${s.elements.length} element${s.elements.length === 1 ? '' : 's'}`,
});

export const VENN_META: DisplayMeta = {
  kind: 'venn',
  noun: 'Venn diagram',
  handle: 'V',
  about: 'Two or three sets and what each holds — what they share, what is only in one, and what is in none.',
  called: [{ words: ['venn diagram', 'venn', 'set diagram'], view: 'venn' }],
  spec: `{"title": "short", "view": "venn|table", "sets": [{"id": "s1", "name": "Has fur"}], "elements": [{"id": "e1", "label": "Platypus", "sets": ["s1", "s2"]}]}
  Two or three sets. Put an element only in the sets the conversation places it in; one that belongs to none of them has "sets": [].`,
  example: {
    title: 'Animals',
    view: 'venn',
    sets: [
      { id: 'f', name: 'Has fur' },
      { id: 'e', name: 'Lays eggs' },
    ],
    elements: [
      { id: 'e1', label: 'Cat', sets: ['f'] },
      { id: 'e2', label: 'Chicken', sets: ['e'] },
      { id: 'e3', label: 'Platypus', sets: ['f', 'e'] },
    ],
  },
  tell: () =>
    'A VENN DIAGRAM’s regions and counts are computed from where each element is placed — use them. Where an element sits is a claim the person can check: if a placement looks wrong, say so; never quietly correct it.',
};

register(VENN);
registerDisplay(VENN_META);
