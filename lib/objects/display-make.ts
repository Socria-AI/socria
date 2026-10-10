// lib/objects/display-make.ts — displays that are MADE, not drafted, and the checks a drafted one must pass.
//
// Some displays have no business being written by a language model at all:
//
//   a plan FROM THE MAP     the map's ideas, in its words and its order —
//                           planFromMap computes it;
//   a labeling exercise     over a diagram already in the workspace (or the
//                           map's own ideas): its answers ARE that diagram's
//                           labels, so nothing is invented to grade against —
//                           and a generic quiz about a topic is never made;
//   a worksheet             an accounting template, checked by standard
//                           double-entry rules against a fixed library of
//                           transactions — never a transaction made up to be
//                           graded.
//
// For the kinds a model may draft (a plan, a table, a market…), the seal is
// what its draft must pass beyond the kind's own sanitizer: a table whose
// numbers it calls the person's must hold only numbers the person actually
// wrote or attached; a market's curves not in their words are said to be
// examples; a practice display starts unanswered. What fails is not refused —
// it is labelled for what it is, and the person is told.
//
// PURE.

import { currentOf, kindOf, type ObjectSpace, type ThoughtObject } from './core';
import { cleanText, norm } from './display-base';
import { drawDiagram, type DiagramState } from './display-diagram';
import { exerciseFrom } from './display-exercise';
import { blankBalanceSheet, blankIncomeStatement, journalEntry } from './display-worksheet';
import { LIBRARY } from './display-accounts';
import { readNumber, type DataState } from './display-data';
import type { MarketState } from './display-market';
import type { DisplayRequest } from './display-request';

/** The map's ideas, as much of them as a display made from the map needs. */
export interface MapMaterial {
  nodes: { id: string; label: string; type?: string; role?: string; origin?: string; status?: string }[];
  edges: { from: string; to: string; relation: string }[];
}

// ── a plan made from the map ─────────────────────────────────────────

const SEQUENCE = new Set(['precedes', 'leads_to']);

/**
 * The map's ideas as a plan, computed: every idea in the person's words, in
 * an order the map's own sequence relations allow (a → b where a precedes or
 * leads to b, or b depends on a), with those relations kept as "waits on"
 * links. Questions stay on the map — a plan is things to do or that happen.
 */
export function planFromMap(map: MapMaterial, opts: { title?: string; view?: string } = {}): unknown {
  const nodes = map.nodes.filter((n) => n.type !== 'question' && cleanText(n.label, 120)).slice(0, 40);
  const ids = new Set(nodes.map((n) => n.id));
  const after: [string, string][] = [];
  for (const e of map.edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    if (SEQUENCE.has(e.relation)) after.push([e.from, e.to]);
    else if (e.relation === 'depends') after.push([e.to, e.from]);
  }
  // a stable topological order: the map's order wherever the relations leave a choice
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const [, b] of after) indeg.set(b, (indeg.get(b) ?? 0) + 1);
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < nodes.length) {
    const next = nodes.find((n) => !done.has(n.id) && (indeg.get(n.id) ?? 0) === 0) ?? nodes.find((n) => !done.has(n.id))!;
    done.add(next.id);
    order.push(next.id);
    for (const [a, b] of after) if (a === next.id) indeg.set(b, (indeg.get(b) ?? 1) - 1);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const itemId = new Map(order.map((id, i) => [id, `i${i + 1}`]));
  return {
    title: cleanText(opts.title, 80) || 'From the map',
    view: opts.view ?? 'checklist',
    items: order.map((id) => {
      const n = byId.get(id)!;
      return {
        id: itemId.get(id),
        text: cleanText(n.label, 120),
        ...(n.status === 'resolved' ? { status: 'done' } : {}),
        by: n.origin === 'socria' ? 'socria' : 'person',
      };
    }),
    // the sanitizer drops any link that would close a loop, so a cyclic map still makes a plan
    links: after.map(([a, b]) => ({ from: itemId.get(a), to: itemId.get(b), by: 'person' })),
  };
}

// ── a labeling exercise over what is already here ────────────────────

/**
 * Labeling practice over a diagram in the workspace: every node a part, its
 * label the answer, its note (or its cluster) the cue, and where the diagram
 * draws it the place it is asked about. A diagram Socria drew is said to be
 * unverified — a schematic to practise with, not an authority.
 */
export function exerciseFromDiagram(o: ThoughtObject): unknown | null {
  const s = currentOf(o) as DiagramState;
  if (!s?.nodes?.length) return null;
  const drawable: DiagramState = s.view === 'outline' ? { ...s, view: 'concept' } : s;
  const drawing = drawDiagram(drawable, { w: 140, h: 44 });
  const W = Math.max(1, drawing?.width ?? 1);
  const H = Math.max(1, drawing?.height ?? 1);
  const at = new Map((drawing?.boxes ?? []).map((b) => [b.id, b]));
  return exerciseFrom({
    sourceKind: 'diagram',
    sourceTitle: s.title,
    verified: o.origin !== 'socria',
    title: `Label: ${s.title}`.slice(0, 80),
    mode: 'label',
    hide: 'all',
    parts: s.nodes.map((n) => ({ id: n.id, label: n.label, ...(n.note ? { cue: n.note } : n.group ? { cue: `in ${n.group}` } : {}) })),
    structure: {
      nodes: s.nodes.map((n) => {
        const b = at.get(n.id);
        return b ? { id: n.id, x: Math.min(1, Math.max(0, b.x / W)), y: Math.min(1, Math.max(0, b.y / H)) } : { id: n.id };
      }),
      edges: s.edges.map((e) => ({ from: e.from, to: e.to })),
    },
  });
}

/** Recall practice over the map's own ideas: each idea's words the answer, how it bears on another the cue. */
export function exerciseFromMap(map: MapMaterial, title?: string): unknown | null {
  const nodes = map.nodes.filter((n) => n.type !== 'question' && cleanText(n.label, 120)).slice(0, 40);
  if (nodes.length < 2) return null;
  const label = new Map(map.nodes.map((n) => [n.id, n.label]));
  const cueOf = (id: string): string | undefined => {
    const e = map.edges.find((x) => x.from === id && label.has(x.to)) ?? map.edges.find((x) => x.to === id && label.has(x.from));
    if (!e) return undefined;
    const rel = e.relation.replace(/_/g, ' ');
    return e.from === id ? `${rel} “${label.get(e.to)}”` : `“${label.get(e.from)}” ${rel} it`;
  };
  return exerciseFrom({
    sourceKind: 'map',
    sourceTitle: cleanText(title, 80) || 'your map',
    // ideas Socria suggested are on it too: then nothing here vouches for every label
    verified: !nodes.some((n) => n.origin === 'socria'),
    title: `Recall: ${cleanText(title, 60) || 'your map'}`,
    mode: 'recall',
    hide: 'all',
    parts: nodes.map((n) => ({ id: n.id, label: n.label, ...(cueOf(n.id) ? { cue: cueOf(n.id) } : {}) })),
    structure: null,
  });
}

// ── a worksheet from what was asked ──────────────────────────────────

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'business', 'owner', 'cash', 'journal', 'entry', 'make', 'give', 'record']);
const wordsOf = (t: string) => new Set(norm(t).split(' ').filter((w) => w.length >= 4 && !STOP.has(w)));

/**
 * A worksheet from the person's words: an income statement or a journal
 * entry when they say so, else a balance sheet. A journal entry records one
 * of the library's standard transactions — the one their words come closest
 * to; a transaction the library does not hold is said not to be there, and
 * nothing is made up to stand in for it.
 */
export function worksheetFromWords(said: string): { state: unknown; says?: string } {
  const t = norm(said);
  if (/\b(income statement|profit and loss|p l statement|statement of profit)\b/.test(t)) return { state: blankIncomeStatement() };
  if (/\b(journal|t accounts?|debits? and credits?|double entry)\b/.test(t)) {
    const asked = wordsOf(said);
    let best = LIBRARY[0];
    let score = 0;
    for (const tx of LIBRARY) {
      let s = 0;
      for (const w of wordsOf(tx.text)) if (asked.has(w)) s += 1;
      if (s > score) {
        score = s;
        best = tx;
      }
    }
    const state = journalEntry(best.key);
    return score >= 1
      ? { state }
      : { state, says: `The worksheet checks the standard transactions in its library, so it starts with the first: “${best.text}” Name another — paying rent, buying equipment, a bank loan — for that one.` };
  }
  return { state: blankBalanceSheet() };
}

// ── which kinds are made, and how ────────────────────────────────────

export interface MadeDisplay {
  kind: string;
  state: unknown;
  origin: 'socria' | 'person';
  says?: string;
}

/**
 * The display a request makes without a model, or why it cannot be made, or
 * null when this request is one to draft. `space` is the workspace (an
 * exercise is made over the newest diagram in it); `map` the map's ideas.
 */
export function makeFromRequest(
  req: DisplayRequest,
  ctx: { said: string; map: MapMaterial | null; space: ObjectSpace; topic?: string }
): MadeDisplay | { why: string } | null {
  const kind = req.kind;
  if (kind === 'plan' && req.fromMap) {
    if (!ctx.map?.nodes.length) return { why: 'There is nothing on the map yet to make that from.' };
    return { kind: 'plan', state: planFromMap(ctx.map, { title: ctx.topic, view: req.view }), origin: 'person' };
  }
  if (kind === 'exercise') {
    const diagram = [...ctx.space.objs].reverse().find((o) => o.kind === 'diagram' && (currentOf(o) as DiagramState)?.nodes?.length);
    if (diagram && !req.fromMap) {
      const state = exerciseFromDiagram(diagram);
      if (state) return { kind: 'exercise', state, origin: diagram.origin === 'socria' ? 'socria' : 'person', says: undefined };
    }
    const fromMap = ctx.map ? exerciseFromMap(ctx.map, ctx.topic) : null;
    if (fromMap) return { kind: 'exercise', state: fromMap, origin: 'person' };
    return {
      why: 'An exercise is made from something already here — a diagram or the ideas on your map — and there is not enough of either yet. Make a diagram (or talk it through) first.',
    };
  }
  if (kind === 'worksheet') {
    const w = worksheetFromWords(ctx.said);
    return { kind: 'worksheet', state: w.state, origin: 'socria', ...(w.says ? { says: w.says } : {}) };
  }
  return null;
}

// ── what a drafted display must pass ─────────────────────────────────

/** Every number written in some text, read the way a table's cells are read ("1,200", "$5", "12%"). */
export function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  // a number ends on a digit: "400," at the end of a clause is 400, not a malformed "400,"
  for (const m of text.matchAll(/\(?[-−+]?[$€£¥]?\d(?:[\d,]*\d)?(?:\.\d+)?%?\)?/g)) {
    const n = readNumber(m[0]);
    if (n !== null) out.add(n);
    const bare = readNumber(m[0].replace(/[()]/g, ''));
    if (bare !== null) out.add(bare);
  }
  return out;
}

export interface Sealed {
  state: unknown;
  gaps: string[];
}

/**
 * What a drafted display of each kind must pass, given what the person said
 * (their own turns, with what they attached). Numbers called theirs must be
 * theirs; examples are named as examples; practice starts unanswered.
 */
const SEALS: Record<string, (state: unknown, said: string) => Sealed> = {
  data: (raw, said) => {
    const s = raw as DataState;
    const gaps: string[] = [];
    const theirs = numbersIn(said);
    const numeric = s.columns.map((c, i) => (c.type === 'number' ? i : -1)).filter((i) => i >= 0);
    const strangers = s.rows.flatMap((r) => numeric.map((i) => r.cells[i])).filter((v): v is number => typeof v === 'number' && !theirs.has(v));
    let basis = s.basis;
    if ((basis === 'given' || basis === 'source') && strangers.length) {
      basis = 'illustrative';
      gaps.push(`${strangers.length} of its numbers ${strangers.length === 1 ? 'is' : 'are'} not in what you wrote or attached, so it is marked as example numbers — give the real ones and they will be used`);
    } else if (basis === 'illustrative') {
      gaps.push('these are example numbers, not yours — give yours and they will replace them');
    }
    return { state: { ...s, basis }, gaps };
  },
  market: (raw, said) => {
    const s = raw as MarketState;
    // practice starts fresh: nothing predicted, revealed or scored on anyone's word
    const { prediction: _p, pending: _q, log: _l, ...rest } = s as MarketState & Record<string, unknown>;
    const theirs = numbersIn(said);
    const given = [s.demand.intercept, s.demand.slope, s.supply.intercept, s.supply.slope].every((v) => theirs.has(v) || theirs.has(Math.abs(v)));
    return {
      state: { ...rest, revealed: false, log: [] },
      gaps: given ? [] : ['the demand and supply curves are example numbers — say yours (for example “demand P = 100 − 2Q”) and they will be used'],
    };
  },
};

/** The seal a drafted display of this kind must pass, or none. */
export function sealDraft(kind: string, state: unknown, said: string): Sealed {
  const seal = SEALS[kind];
  if (!seal) return { state, gaps: [] };
  const out = seal(state, said);
  // what the seal returns is read back through the kind, so it can never leave a state the kind would not keep
  const kept = kindOf(kind)?.sanitize(out.state);
  return kept ? { state: kept, gaps: out.gaps } : { state, gaps: out.gaps };
}
