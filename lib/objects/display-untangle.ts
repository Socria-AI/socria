// lib/objects/display-untangle.ts — UNTANGLE: a messy dump of thoughts, sorted into something a person can act on.
//
// The person writes everything that is on their mind, in any order. Untangle
// keeps that dump exactly as they wrote it — it is never rewritten, by Socria
// or by sorting — and separates it into thoughts: each one their own words,
// with a reading of what kind of thought it is (a task, a question, a worry
// about something outside their control…). The reading is Socria's and says
// so; every reading is the person's to change, and once they have changed it
// Socria does not change it back.
//
// What stays the person's alone:
//   - commitments. A thought becomes a commitment only when the person makes
//     it one; nothing uncertain is quietly turned into a promise.
//   - what is urgent, what is important, how big a thing is, and what is
//     done, parked or dropped. Socria can ask; it never sets them.
//   - connections they confirm. Socria may notice that one thought seems to
//     depend on another; that stays a suggestion until the person confirms it.
//
// What is computed here, deterministically: the splitting of the dump into
// thoughts (sentences, lines and bullets, never paraphrase), the first reading
// of each (plain cues in the words, not a model), the parts of the dump no
// thought holds yet (so nothing is silently lost), the order next steps can
// go in given the connections the person confirmed, and what is blocked.
//
// PURE.

import type { Part, ViewDecl } from './core';
import { register } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
  findByLabel,
  guardBy,
  guardOwn,
  headOps,
  nextId,
  op,
  registerDisplay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
  type DisplayMeta,
} from './display-base';
import { cleanBasis, cleanLinks, contentWords, linkOps, REASONING_VERSION, type Basis, type Link } from './reasoning';

export type UntangleView = 'landscape' | 'list' | 'matrix' | 'source';
export type Category = 'task' | 'idea' | 'problem' | 'question' | 'goal' | 'commitment' | 'uncertainty' | 'outside' | 'note';
export type Status = 'open' | 'next' | 'doing' | 'done' | 'parked' | 'dropped';
export type Effort = 'small' | 'medium' | 'large';
export type TieKind = 'depends' | 'related';

export interface Thought {
  id: string;
  /** the person's words (or Socria's, marked so) */
  text: string;
  /** who wrote the words */
  by: By;
  basis: Basis;
  /** what kind of thought it is — and who said so: a reading of Socria's until the person sets it */
  cat: Category;
  catBy: By;
  status: Status;
  cluster?: string;
  /** the person's own calls — never Socria's */
  urgent?: boolean;
  important?: boolean;
  effort?: Effort;
  /** where in the dump it came from, when it was separated from it: [start, end) */
  span?: [number, number];
}

export interface Cluster {
  id: string;
  name: string;
  by: By;
}

/** `to` depends on `from` (it cannot happen first), or the two are related. Socria's stay unconfirmed until the person confirms them. */
export interface Tie {
  from: string;
  to: string;
  kind: TieKind;
  by: By;
  confirmed: boolean;
}

export interface UntangleState extends DisplayHead {
  version: number;
  view: UntangleView;
  /** what the person wrote, exactly as they wrote it */
  dump: string;
  thoughts: Thought[];
  clusters: Cluster[];
  ties: Tie[];
  links: Link[];
}

export const UNTANGLE_LIMITS = { dump: 3000, thoughts: 60, clusters: 10, ties: 60, text: 240, name: 60 } as const;
const L = UNTANGLE_LIMITS;
export const CATEGORIES: Category[] = ['task', 'idea', 'problem', 'question', 'goal', 'commitment', 'uncertainty', 'outside', 'note'];
export const STATUSES: Status[] = ['open', 'next', 'doing', 'done', 'parked', 'dropped'];
const EFFORTS: Effort[] = ['small', 'medium', 'large'];
const VIEWS: UntangleView[] = ['landscape', 'list', 'matrix', 'source'];

export const CATEGORY_WORD: Record<Category, string> = {
  task: 'Task',
  idea: 'Idea',
  problem: 'Problem',
  question: 'Question',
  goal: 'Goal',
  commitment: 'Commitment',
  uncertainty: 'Not sure',
  outside: 'Outside my control',
  note: 'Unsorted',
};
export const STATUS_WORD: Record<Status, string> = { open: 'Open', next: 'Next', doing: 'Doing', done: 'Done', parked: 'Parked', dropped: 'Let go' };

// ── separating and reading — deterministic, in the person's words ────

const LEAD = /^(?:[-*•·–—>]+|\d{1,2}[.)]|[a-z][.)](?=\s))\s*/i;
const FILLER = /^(?:and\s+also|and\s+then|also|plus|and|oh,?\s+and|then|so)\b[,\s]*/i;

/**
 * The dump separated into thoughts: lines, bullets and sentences, each kept
 * in the person's words with where it came from. Never paraphrased; a very
 * long sentence is kept whole up to the limit and cut at a word.
 */
export function separate(dump: string): { text: string; span: [number, number] }[] {
  const out: { text: string; span: [number, number] }[] = [];
  // sentence ends, line breaks and semicolons separate; a full stop inside "e.g." or "3.5" does not
  const re = /[^\n;.!?]+(?:[.!?]+(?=\s|$)|\?|$)?|[^\n;]+$/g;
  const pieces: { s: string; at: number }[] = [];
  for (const line of lineSpans(dump)) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line.s))) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      pieces.push({ s: m[0], at: line.at + m.index });
    }
  }
  for (const p of commaLists(pieces)) {
    let s = p.s;
    let at = p.at;
    const trimStart = (rx: RegExp) => {
      const m = rx.exec(s);
      if (m && m.index === 0) {
        s = s.slice(m[0].length);
        at += m[0].length;
      }
    };
    const ws = /^\s+/.exec(s);
    if (ws) {
      s = s.slice(ws[0].length);
      at += ws[0].length;
    }
    trimStart(LEAD);
    trimStart(FILLER);
    const text = cleanText(s.replace(/[.;,\s]+$/, (x) => (x.includes('?') ? '?' : '')), L.text);
    if (contentWords(text).size === 0 || text.length < 3) continue;
    const end = at + s.replace(/\s+$/, '').length;
    out.push({ text: text.charAt(0).toUpperCase() + text.slice(1), span: [at, end] });
    if (out.length >= L.thoughts) break;
  }
  return out;
}

/**
 * A run-on list — "finish the essay, the car is making a noise, rent is due"
 * — is several thoughts, separated at its commas. Only a sentence with two or
 * more commas is read so, and a piece too small to stand alone ("milk" in
 * "buy eggs, milk, bread") stays with the one before it.
 */
function commaLists(pieces: { s: string; at: number }[]): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = [];
  for (const p of pieces) {
    const commas = (p.s.match(/,/g) ?? []).length;
    if (commas < 2 || p.s.trim().length < 50) {
      out.push(p);
      continue;
    }
    const subs: { s: string; at: number }[] = [];
    let at = 0;
    for (const part of p.s.split(',')) {
      const piece = { s: part, at: p.at + at };
      at += part.length + 1;
      const prev = subs[subs.length - 1];
      if (prev && contentWords(part).size < 2) prev.s += `,${part}`;
      else subs.push(piece);
    }
    // a first piece too small to stand alone joins the one after it
    if (subs.length > 1 && contentWords(subs[0].s).size < 2) {
      subs[1] = { s: `${subs[0].s},${subs[1].s}`, at: subs[0].at };
      subs.shift();
    }
    out.push(...subs);
  }
  return out;
}

function lineSpans(dump: string): { s: string; at: number }[] {
  const out: { s: string; at: number }[] = [];
  let at = 0;
  for (const s of dump.split('\n')) {
    out.push({ s, at });
    at += s.length + 1;
  }
  return out;
}

/**
 * A first reading of what kind of thought something is, from plain cues in
 * its words. A reading, not a judgment: it is shown as Socria's, and the
 * person corrects it. It never reads a commitment (only the person makes
 * one), an emotion or a diagnosis.
 */
export function readCategory(text: string): Category {
  const t = ` ${text.toLowerCase().replace(/[’']/g, '')} `;
  if (/\?\s*$/.test(text) || /^\s*(?:how|what|why|when|where|who|which|should|could|would|can|do|does|is|are|will|am)\b/i.test(text)) return 'question';
  if (/\b(?:out of my (?:control|hands)|cant control|cannot control|up to (?:them|him|her|my \w+)|depends on (?:them|him|her|whether they)|waiting (?:for|on) (?:them|him|her|the|a|my)|not up to me)\b/.test(t)) return 'outside';
  if (/\b(?:not sure|unsure|dont know|no idea|wonder|unclear|undecided|torn between|cant decide)\b/.test(t)) return 'uncertainty';
  if (/\b(?:problem|issue|stuck|broken|broke|struggling|behind on|keeps? (?:\w+ing)|doesnt work|isnt working|wont work|too much|cant afford|running out|overdue|late on|conflict|noise|leak\w*|making a (?:noise|sound))\b/.test(t)) return 'problem';
  if (/\b(?:need to|have to|has to|must|got to|gotta|should|remember to|dont forget to|todo|to-do|is due|are due|due (?:on|by|friday|monday|tomorrow)|deadline|call|email|text|book|buy|pay|send|finish|submit|schedule|renew|fix|clean|pick up|sign up|apply)\b/.test(t)) return 'task';
  if (/\b(?:want to|wanna|hope to|goal|would love to|dream|someday|one day|aim to|plan to|id like to|i would like to)\b/.test(t)) return 'goal';
  if (/\b(?:maybe|what if|idea|could try|might|perhaps|thinking about|what about)\b/.test(t)) return 'idea';
  return 'note';
}

// ── canonical state ──────────────────────────────────────────────────

const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** The dump as kept: control characters out but line breaks kept — it is theirs, exactly. */
function cleanDump(v: unknown): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g, ' ');
  return s.length <= L.dump ? s.trim() : s.slice(0, L.dump).trim();
}

export function sanitizeUntangle(raw: unknown): UntangleState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const dump = cleanDump(r.dump);
  const clusters: Cluster[] = [];
  const cIds = new Set<string>();
  for (const x of arr(r.clusters)) {
    if (clusters.length >= L.clusters) break;
    const o = obj(x);
    const name = cleanText(o?.name ?? (typeof x === 'string' ? x : ''), L.name);
    if (!name || clusters.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
    let id = cleanId(o?.id);
    if (!id || cIds.has(id)) id = nextId('g', cIds);
    cIds.add(id);
    clusters.push({ id, name, by: cleanBy(o?.by) });
  }
  const thoughts: Thought[] = [];
  const tIds = new Set<string>(cIds);
  for (const x of arr(r.thoughts)) {
    if (thoughts.length >= L.thoughts) break;
    const o = obj(x);
    const text = cleanText(o?.text ?? (typeof x === 'string' ? x : ''), L.text);
    if (!text) continue;
    let id = cleanId(o?.id);
    if (!id || tIds.has(id)) id = nextId('t', tIds);
    tIds.add(id);
    const by = cleanBy(o?.by);
    const catBy = cleanBy(o?.catBy);
    let cat: Category = CATEGORIES.includes(o?.cat as Category) ? (o!.cat as Category) : 'note';
    // a commitment is the person's to make — one Socria read is not one
    if (cat === 'commitment' && catBy !== 'person') cat = 'task';
    const status: Status = STATUSES.includes(o?.status as Status) ? (o!.status as Status) : 'open';
    const cluster = typeof o?.cluster === 'string' && cIds.has(o.cluster) ? o.cluster : undefined;
    const span = Array.isArray(o?.span) && o!.span.length === 2 && o!.span.every((n: unknown) => Number.isInteger(n)) ? (o!.span as [number, number]) : null;
    const goodSpan = span && span[0] >= 0 && span[1] > span[0] && span[1] <= dump.length ? span : null;
    thoughts.push({
      id,
      text,
      by,
      basis: cleanBasis(o?.basis, by),
      cat,
      catBy,
      status,
      ...(cluster ? { cluster } : {}),
      ...(o?.urgent === true ? { urgent: true } : {}),
      ...(o?.important === true ? { important: true } : {}),
      ...(EFFORTS.includes(o?.effort as Effort) ? { effort: o!.effort as Effort } : {}),
      ...(goodSpan ? { span: goodSpan } : {}),
    });
  }
  const has = new Set(thoughts.map((t) => t.id));
  const ties: Tie[] = [];
  for (const x of arr(r.ties)) {
    if (ties.length >= L.ties) break;
    const o = obj(x);
    const from = typeof o?.from === 'string' && has.has(o.from) ? o.from : null;
    const to = typeof o?.to === 'string' && has.has(o.to) ? o.to : null;
    if (!from || !to || from === to) continue;
    const kind: TieKind = o?.kind === 'related' ? 'related' : 'depends';
    if (ties.some((t) => (t.from === from && t.to === to) || (kind === 'related' && t.kind === 'related' && t.from === to && t.to === from))) continue;
    const by = cleanBy(o?.by);
    ties.push({ from, to, kind, by, confirmed: by === 'person' || o?.confirmed === true });
  }
  return {
    title: cleanText(r.title, 80) || 'Untangle',
    version: REASONING_VERSION,
    view: VIEWS.includes(r.view as UntangleView) ? (r.view as UntangleView) : 'landscape',
    dump,
    thoughts,
    clusters,
    ties: acyclic(ties),
    links: cleanLinks(r.links),
  };
}

/** Dependencies that would go round in a circle are not kept: the later one that closes the circle goes. */
function acyclic(ties: Tie[]): Tie[] {
  const kept: Tie[] = [];
  for (const t of ties) {
    if (t.kind === 'depends' && reaches(kept, t.to, t.from)) continue;
    kept.push(t);
  }
  return kept;
}
function reaches(ties: Tie[], from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const x = stack.pop()!;
    if (x === to) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    for (const t of ties) if (t.kind === 'depends' && t.from === x) stack.push(t.to);
  }
  return false;
}

// ── what is computed ─────────────────────────────────────────────────

/** Sentences of the dump no thought holds yet — so nothing in it is silently lost. */
export function unsorted(s: UntangleState): { text: string; span: [number, number] }[] {
  return separate(s.dump).filter((piece) => {
    if (s.thoughts.some((t) => t.span && t.span[0] < piece.span[1] && piece.span[0] < t.span[1])) return false;
    const words = contentWords(piece.text);
    return !s.thoughts.some((t) => {
      const tw = contentWords(t.text);
      let n = 0;
      for (const w of words) if (tw.has(w)) n++;
      return words.size > 0 && n / words.size >= 0.6;
    });
  });
}

const active = (t: Thought) => t.status !== 'done' && t.status !== 'dropped' && t.status !== 'parked';

/** What each thought waits on, among the connections the person confirmed — and what is not done yet. */
export function blockers(s: UntangleState, id: string): Thought[] {
  return s.ties
    .filter((t) => t.kind === 'depends' && t.confirmed && t.to === id)
    .map((t) => s.thoughts.find((x) => x.id === t.from))
    .filter((t): t is Thought => !!t && t.status !== 'done' && t.status !== 'dropped');
}

/**
 * The next steps the person chose, in an order their confirmed connections
 * allow: nothing before what it depends on; otherwise their own order.
 */
export function nextSteps(s: UntangleState): { thought: Thought; blockedBy: Thought[] }[] {
  const chosen = s.thoughts.filter((t) => t.status === 'next' || t.status === 'doing');
  const ids = new Set(chosen.map((t) => t.id));
  const deps = s.ties.filter((t) => t.kind === 'depends' && t.confirmed && ids.has(t.from) && ids.has(t.to));
  const placed: Thought[] = [];
  const done = new Set<string>();
  while (placed.length < chosen.length) {
    const next = chosen.find((t) => !done.has(t.id) && deps.every((d) => d.to !== t.id || done.has(d.from))) ?? chosen.find((t) => !done.has(t.id))!;
    done.add(next.id);
    placed.push(next);
  }
  return placed.map((thought) => ({ thought, blockedBy: blockers(s, thought.id) }));
}

export type Quadrant = 'do' | 'plan' | 'hand' | 'drop';
export const QUADRANT_WORD: Record<Quadrant, string> = {
  do: 'Urgent and important',
  plan: 'Important, not urgent',
  hand: 'Urgent, not important',
  drop: 'Neither',
};
/** Where the person placed each open thought — by their own two calls; one they have not placed is not guessed. */
export function quadrants(s: UntangleState): Record<Quadrant | 'unplaced', Thought[]> {
  const out: Record<Quadrant | 'unplaced', Thought[]> = { do: [], plan: [], hand: [], drop: [], unplaced: [] };
  for (const t of s.thoughts) {
    if (!active(t)) continue;
    if (t.urgent === undefined && t.important === undefined) out.unplaced.push(t);
    else out[t.urgent ? (t.important ? 'do' : 'hand') : t.important ? 'plan' : 'drop'].push(t);
  }
  return out;
}

export function counts(s: UntangleState): Record<Category, number> & { open: number; done: number; readings: number } {
  const c = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<Category, number>;
  for (const t of s.thoughts) c[t.cat]++;
  return { ...c, open: s.thoughts.filter(active).length, done: s.thoughts.filter((t) => t.status === 'done').length, readings: s.thoughts.filter((t) => t.catBy === 'socria').length };
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<UntangleState>[] = [
  { id: 'landscape', label: 'Landscape', shows: 'every thought, in the groups you made, with what kind of thought each is', primary: true, interactions: ['group', 'connect', 'choose next steps'] },
  { id: 'list', label: 'By kind', shows: 'tasks, questions, problems, goals and the rest, each with where it stands', interactions: ['mark done', 'park', 'let go'] },
  { id: 'matrix', label: 'Urgent / important', shows: 'what you called urgent and important, in four quarters', interactions: ['place a thought'] },
  { id: 'source', label: 'What you wrote', shows: 'your dump exactly as you wrote it, and what of it is not sorted yet', interactions: ['edit the dump', 'separate it into thoughts'] },
];

type S = UntangleState;
const withS = (s: S, patch: Partial<S>): S => sanitizeUntangle({ ...s, ...patch }) ?? s;
const yours = (ctx: Ctx, what: string): string | null => (ctx?.by === 'socria' ? `${what} is yours to say — Socria can ask, never set it.` : null);
const th = (s: S, id: unknown) => s.thoughts.find((t) => t.id === id);
const allIds = (s: S) => [...s.thoughts.map((t) => t.id), ...s.clusters.map((c) => c.id)];
const bool = (v: unknown): boolean | null | undefined => (v === 'yes' || v === 1 || v === 'true' ? true : v === 'no' || v === 0 || v === 'false' ? false : v === '' ? null : undefined);

export const UNTANGLE_OPS = {
  ...headOps<S>(views, sanitizeUntangle),
  dump: op<S>(
    'Write it out',
    (_s, a, ctx) =>
      (typeof a.text === 'string' ? null : 'Write what is on your mind.') ??
      (typeof a.text === 'string' && a.text.length > L.dump ? `The dump holds ${L.dump} characters.` : null) ??
      (ctx?.by === 'socria' ? 'What you wrote is yours — Socria never rewrites it.' : null),
    (s, a) => withS(s, { dump: cleanDump(a.text) }),
    () => 'wrote it out'
  ),
  separate: op<S>(
    'Separate into thoughts',
    (s) => (s.dump ? null : 'Write something first.') ?? (unsorted(s).length ? null : 'Everything you wrote is already a thought here.') ?? (s.thoughts.length >= L.thoughts ? 'Untangle holds as many thoughts as it can.' : null),
    (s) => {
      const taken = allIds(s);
      const add: Thought[] = [];
      for (const piece of unsorted(s)) {
        if (s.thoughts.length + add.length >= L.thoughts) break;
        const id = nextId('t', [...taken, ...add.map((t) => t.id)]);
        // their words; Socria's first reading of what kind of thought it is
        add.push({ id, text: piece.text, by: 'person', basis: 'stated', cat: readCategory(piece.text), catBy: 'socria', status: 'open', span: piece.span });
      }
      return withS(s, { thoughts: [...s.thoughts, ...add] });
    },
    () => 'separated what you wrote into thoughts'
  ),
  add: op<S>(
    'Add a thought',
    (s, a, ctx) =>
      (cleanText(a.text, L.text) ? null : 'Say the thought.') ??
      (s.thoughts.length >= L.thoughts ? 'Untangle holds as many thoughts as it can.' : null) ??
      (a.cat !== undefined && !CATEGORIES.includes(a.cat as Category) ? 'That is not a kind of thought here.' : null) ??
      (a.cat === 'commitment' && ctx?.by === 'socria' ? 'Only you make something a commitment.' : null) ??
      (a.cluster !== undefined && a.cluster !== '' && !s.clusters.some((c) => c.id === a.cluster) ? 'There is no such group.' : null) ??
      guardBy(a, ctx),
    (s, a) => {
      const by = cleanBy(a.by);
      const text = cleanText(a.text, L.text);
      const given = CATEGORIES.includes(a.cat as Category) ? (a.cat as Category) : null;
      return withS(s, {
        thoughts: [
          ...s.thoughts,
          {
            id: nextId('t', allIds(s)),
            text,
            by,
            basis: cleanBasis(undefined, by),
            cat: given ?? readCategory(text),
            catBy: given ? by : 'socria',
            status: 'open',
            ...(a.cluster ? { cluster: String(a.cluster) } : {}),
          },
        ],
      });
    },
    (a) => `added “${cleanText(a.text, 60)}”`
  ),
  edit: op<S>(
    'Reword',
    (s, a, ctx) => (th(s, a.id) ? null : 'There is no such thought.') ?? (cleanText(a.text, L.text) ? null : 'Say the thought.') ?? guardOwn(th(s, a.id), ctx, 'That thought'),
    (s, a) =>
      withS(s, {
        thoughts: s.thoughts.map((t) => (t.id === a.id ? { ...t, text: cleanText(a.text, L.text), ...(a.by === 'person' ? { by: 'person' as By, basis: 'stated' as Basis } : {}) } : t)),
      }),
    (a) => `reworded “${cleanText(a.text, 60)}”`
  ),
  cat: op<S>(
    'What kind of thought',
    (s, a, ctx) => {
      const t = th(s, a.id);
      if (!t) return 'There is no such thought.';
      if (!CATEGORIES.includes(a.cat as Category)) return 'That is not a kind of thought here.';
      if (ctx?.by === 'socria') {
        if (a.cat === 'commitment') return 'Only you make something a commitment.';
        if (t.catBy === 'person') return 'You said what kind of thought that is — Socria does not change it.';
      }
      return null;
    },
    (s, a) => withS(s, { thoughts: s.thoughts.map((t) => (t.id === a.id ? { ...t, cat: a.cat as Category, catBy: a.by === 'socria' ? 'socria' : 'person' } : t)) }),
    (a) => `called it: ${CATEGORY_WORD[a.cat as Category]?.toLowerCase() ?? a.cat}`
  ),
  status: op<S>(
    'Where it stands',
    (s, a, ctx) => (th(s, a.id) ? null : 'There is no such thought.') ?? (STATUSES.includes(a.status as Status) ? null : 'Open, next, doing, done, parked or let go.') ?? yours(ctx, 'Where a thought stands'),
    (s, a) => withS(s, { thoughts: s.thoughts.map((t) => (t.id === a.id ? { ...t, status: a.status as Status } : t)) }),
    (a) => (STATUS_WORD[a.status as Status] ?? String(a.status)).toLowerCase()
  ),
  flag: op<S>(
    'Urgent, important, how big',
    (s, a, ctx) => {
      if (!th(s, a.id)) return 'There is no such thought.';
      if (a.urgent !== undefined && bool(a.urgent) === undefined) return 'Urgent: yes, no, or not said.';
      if (a.important !== undefined && bool(a.important) === undefined) return 'Important: yes, no, or not said.';
      if (a.effort !== undefined && a.effort !== '' && !EFFORTS.includes(a.effort as Effort)) return 'Small, medium or large.';
      if (a.urgent === undefined && a.important === undefined && a.effort === undefined) return 'Say what to set.';
      return yours(ctx, 'What is urgent, important or big');
    },
    (s, a) =>
      withS(s, {
        thoughts: s.thoughts.map((t) => {
          if (t.id !== a.id) return t;
          const next = { ...t };
          if (a.urgent !== undefined) {
            const v = bool(a.urgent);
            if (v === null) delete next.urgent;
            else next.urgent = !!v;
          }
          if (a.important !== undefined) {
            const v = bool(a.important);
            if (v === null) delete next.important;
            else next.important = !!v;
          }
          if (a.effort !== undefined) {
            if (a.effort === '') delete next.effort;
            else next.effort = a.effort as Effort;
          }
          return next;
        }),
      }),
    (a) => [a.urgent !== undefined ? (bool(a.urgent) ? 'urgent' : bool(a.urgent) === false ? 'not urgent' : 'urgency cleared') : '', a.important !== undefined ? (bool(a.important) ? 'important' : bool(a.important) === false ? 'not important' : 'importance cleared') : '', a.effort ? `${a.effort}` : ''].filter(Boolean).join(', ')
  ),
  place: op<S>(
    'Group',
    (s, a, ctx) => {
      const t = th(s, a.id);
      if (!t) return 'There is no such thought.';
      if (a.cluster !== '' && !s.clusters.some((c) => c.id === a.cluster)) return 'There is no such group.';
      // where the person put a thought, they put it; Socria may group what is still ungrouped
      if (ctx?.by === 'socria' && t.cluster) return 'That thought is already in a group — Socria does not move it.';
      return null;
    },
    (s, a) => withS(s, { thoughts: s.thoughts.map((t) => (t.id === a.id ? { ...t, cluster: a.cluster ? String(a.cluster) : undefined } : t)) }),
    (a) => (a.cluster ? 'grouped' : 'taken out of its group')
  ),
  addCluster: op<S>(
    'Make a group',
    (s, a, ctx) =>
      (cleanText(a.name, L.name) ? null : 'Name the group.') ??
      (s.clusters.length >= L.clusters ? `Untangle holds ${L.clusters} groups.` : null) ??
      (s.clusters.some((c) => c.name.toLowerCase() === cleanText(a.name, L.name).toLowerCase()) ? 'There is a group by that name.' : null) ??
      guardBy(a, ctx),
    (s, a) => withS(s, { clusters: [...s.clusters, { id: a.id && cleanId(a.id) && !allIds(s).includes(String(a.id)) ? String(a.id) : nextId('g', allIds(s)), name: cleanText(a.name, L.name), by: cleanBy(a.by) }] }),
    (a) => `made the group “${cleanText(a.name, L.name)}”`
  ),
  renameCluster: op<S>(
    'Rename a group',
    (s, a, ctx) => {
      const c = s.clusters.find((x) => x.id === a.id);
      return (c ? null : 'There is no such group.') ?? (cleanText(a.name, L.name) ? null : 'Name the group.') ?? guardOwn(c, ctx, 'That group');
    },
    (s, a) => withS(s, { clusters: s.clusters.map((c) => (c.id === a.id ? { ...c, name: cleanText(a.name, L.name), ...(a.by === 'person' ? { by: 'person' as By } : {}) } : c)) }),
    (a) => `renamed a group “${cleanText(a.name, L.name)}”`
  ),
  removeCluster: op<S>(
    'Remove a group',
    (s, a, ctx) => {
      const c = s.clusters.find((x) => x.id === a.id);
      return (c ? null : 'There is no such group.') ?? guardOwn(c, ctx, 'That group');
    },
    // the thoughts stay — only the grouping goes
    (s, a) => withS(s, { clusters: s.clusters.filter((c) => c.id !== a.id), thoughts: s.thoughts.map((t) => (t.cluster === a.id ? { ...t, cluster: undefined } : t)) }),
    () => 'removed a group (its thoughts stay)'
  ),
  tie: op<S>(
    'Connect two thoughts',
    (s, a, ctx) => {
      if (!th(s, a.from) || !th(s, a.to)) return 'Say which two thoughts.';
      if (a.from === a.to) return 'A thought cannot depend on itself.';
      if (a.kind !== 'depends' && a.kind !== 'related') return 'One depends on the other, or they are related.';
      if (s.ties.some((t) => (t.from === a.from && t.to === a.to) || (t.from === a.to && t.to === a.from && (t.kind === 'related' || a.kind === 'related')))) return 'They are already connected.';
      if (a.kind === 'depends' && reaches(s.ties, String(a.to), String(a.from))) return 'That would go round in a circle — one of them already depends on the other.';
      if (s.ties.length >= L.ties) return 'Untangle holds as many connections as it can.';
      return guardBy(a, ctx);
    },
    (s, a) => withS(s, { ties: [...s.ties, { from: String(a.from), to: String(a.to), kind: a.kind as TieKind, by: cleanBy(a.by), confirmed: cleanBy(a.by) === 'person' }] }),
    (a) => (a.kind === 'depends' ? 'connected: one waits on the other' : 'connected as related')
  ),
  confirmTie: op<S>(
    'Confirm a connection',
    (s, a, ctx) => (s.ties.some((t) => t.from === a.from && t.to === a.to) ? null : 'There is no such connection.') ?? yours(ctx, 'Whether a connection holds'),
    (s, a) => withS(s, { ties: s.ties.map((t) => (t.from === a.from && t.to === a.to ? { ...t, confirmed: true } : t)) }),
    () => 'confirmed a connection'
  ),
  untie: op<S>(
    'Remove a connection',
    (s, a, ctx) => {
      const t = s.ties.find((x) => x.from === a.from && x.to === a.to);
      return t ? guardOwn(t.confirmed ? { by: 'person' } : t, ctx, 'That connection') : 'There is no such connection.';
    },
    (s, a) => withS(s, { ties: s.ties.filter((t) => !(t.from === a.from && t.to === a.to)) }),
    () => 'removed a connection'
  ),
  remove: op<S>(
    'Remove a thought',
    (s, a, ctx) => (th(s, a.id) ? null : 'There is no such thought.') ?? guardOwn(th(s, a.id), ctx, 'That thought'),
    (s, a) => withS(s, { thoughts: s.thoughts.filter((t) => t.id !== a.id), ties: s.ties.filter((t) => t.from !== a.id && t.to !== a.id) }),
    () => 'removed a thought (what you wrote stays in the dump)'
  ),
  ...linkOps<S>(sanitizeUntangle),
};

// ── words → an operation ─────────────────────────────────────────────

const CAT_WORDS: [RegExp, Category][] = [
  [/^(?:a\s+)?tasks?$/, 'task'],
  [/^(?:an?\s+)?ideas?$/, 'idea'],
  [/^(?:a\s+)?problems?$/, 'problem'],
  [/^(?:a\s+)?questions?$/, 'question'],
  [/^(?:a\s+)?goals?$/, 'goal'],
  [/^(?:a\s+)?commitments?$/, 'commitment'],
  [/^(?:something\s+)?(?:outside|out of)\s+my\s+control$/, 'outside'],
  [/^(?:an?\s+)?(?:uncertain(?:ty)?|unsure|not sure)$/, 'uncertainty'],
];

export function readUntangleOp(text: string, s: S): { op: string; args: Args } | null {
  const t = text.trim().replace(/[.!]+$/, '');
  if (!t || t.length > 300 || /\?$/.test(t)) return null;
  const find = (words: string) => findByLabel(s.thoughts, (x) => x.text, words);
  let m = /^(?:add\s+(?:a\s+)?thought|i\s+also\s+need\s+to)\s*[:—-]?\s*(.+)$/i.exec(t);
  if (m) return { op: 'add', args: { text: cleanText(/^i\s+also\s+need\s+to/i.test(t) ? `Need to ${m[1]}` : m[1], L.text), by: 'person' } };
  m = /^(?:mark\s+)?(.+?)\s+(?:is\s+|as\s+)?(done|finished|complete|completed)$/i.exec(t);
  if (m) {
    const x = find(m[1]);
    if (x) return { op: 'status', args: { id: x.id, status: 'done' } };
  }
  m = /^(park|drop|let go of|forget about|start|do)\s+(.+?)(?:\s+(?:for now|next))?$/i.exec(t);
  if (m) {
    const x = find(m[2]);
    const verb = m[1].toLowerCase();
    if (x) return { op: 'status', args: { id: x.id, status: verb === 'park' ? 'parked' : verb === 'start' ? 'doing' : verb === 'do' ? 'next' : 'dropped' } };
  }
  m = /^(.+?)\s+is\s+(?:my\s+)?next$/i.exec(t);
  if (m) {
    const x = find(m[1]);
    if (x) return { op: 'status', args: { id: x.id, status: 'next' } };
  }
  m = /^(?:make\s+)?(.+?)\s+(?:is\s+|as\s+)(urgent|important|not urgent|not important)$/i.exec(t);
  if (m) {
    const x = find(m[1]);
    const w = m[2].toLowerCase();
    if (x) return { op: 'flag', args: { id: x.id, ...(w.includes('urgent') ? { urgent: w.startsWith('not') ? 'no' : 'yes' } : { important: w.startsWith('not') ? 'no' : 'yes' }) } };
  }
  m = /^(.+?)\s+(?:depends on|waits on|comes after|needs)\s+(.+)$/i.exec(t);
  if (m) {
    const a = find(m[1]);
    const b = find(m[2]);
    if (a && b && a.id !== b.id) return { op: 'tie', args: { from: b.id, to: a.id, kind: 'depends', by: 'person' } };
  }
  m = /^(?:put|move|group)\s+(.+?)\s+(?:in|into|under)\s+(.+)$/i.exec(t);
  if (m) {
    const x = find(m[1]);
    const c = findByLabel(s.clusters, (g) => g.name, m[2]);
    if (x && c) return { op: 'place', args: { id: x.id, cluster: c.id } };
  }
  m = /^(?:make\s+(.+?)\s+an?\s+|(.+?)\s+is\s+(?:an?\s+|something\s+)?)(task|idea|problem|question|goal|commitment|outside my control|out of my control|uncertain|not sure)$/i.exec(t);
  if (m) {
    const x = find(m[1] ?? m[2]);
    const cat = CAT_WORDS.find(([rx]) => rx.test(m![3].toLowerCase()))?.[1];
    if (x && cat) return { op: 'cat', args: { id: x.id, cat, by: 'person' } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

function factsOf(s: S): string[] {
  const c = counts(s);
  const out = [
    `${s.title}: ${s.thoughts.length} thought${s.thoughts.length === 1 ? '' : 's'} separated from what the person wrote (${CATEGORIES.filter((k) => c[k]).map((k) => `${c[k]} ${CATEGORY_WORD[k].toLowerCase()}`).join(', ') || 'none yet'}).`,
  ];
  if (c.readings) out.push(`${c.readings} of those kinds are Socria’s reading, not yet confirmed by the person.`);
  const left = unsorted(s).length;
  if (left) out.push(`${left} part${left === 1 ? '' : 's'} of what they wrote ${left === 1 ? 'is' : 'are'} not a thought here yet.`);
  const nx = nextSteps(s);
  if (nx.length) out.push(`Next steps they chose: ${nx.map((n) => `${n.thought.text}${n.blockedBy.length ? ` (waits on ${n.blockedBy.map((b) => b.text).join(', ')})` : ''}`).join('; ')}.`);
  const commitments = s.thoughts.filter((t) => t.cat === 'commitment');
  if (commitments.length) out.push(`Their commitments: ${commitments.map((t) => t.text).join('; ')}.`);
  if (s.clusters.length) out.push(`Groups: ${s.clusters.map((g) => `${g.name}${g.by === 'socria' ? ' (suggested)' : ''}`).join(', ')}.`);
  return out;
}

function textOf(s: S): string {
  const lines = [`UNTANGLE “${s.title}”`];
  for (const t of s.thoughts) {
    const g = s.clusters.find((c) => c.id === t.cluster);
    lines.push(`- [${CATEGORY_WORD[t.cat]}${t.catBy === 'socria' ? ', Socria’s reading' : ''}] ${t.text}${t.by === 'socria' ? ' (Socria’s words)' : ''} · ${STATUS_WORD[t.status]}${g ? ` · group: ${g.name}` : ''}${t.urgent ? ' · urgent' : ''}${t.important ? ' · important' : ''}`);
  }
  for (const x of s.ties) {
    const a = th(s, x.from)?.text;
    const b = th(s, x.to)?.text;
    lines.push(`${x.kind === 'depends' ? `“${b}” waits on “${a}”` : `“${a}” relates to “${b}”`}${x.confirmed ? '' : ' (suggested, unconfirmed)'}`);
  }
  return lines.join('\n').slice(0, 2600);
}

export const UNTANGLE = displayKind<S>({
  kind: 'untangle',
  label: 'Untangle',
  sanitize: sanitizeUntangle,
  ops: UNTANGLE_OPS,
  readOp: readUntangleOp,
  consequence: (before, after, step) => {
    if (step.op === 'separate') {
      const n = after.thoughts.length - before.thoughts.length;
      return `${n} thought${n === 1 ? '' : 's'} separated from what you wrote, in your words. The kinds are Socria’s first reading — change any of them.`;
    }
    const bn = nextSteps(before).filter((x) => x.blockedBy.length).length;
    const an = nextSteps(after).filter((x) => x.blockedBy.length).length;
    if (an > bn) return `${an} of your next steps now wait on something not done yet.`;
    if (bn && !an) return 'None of your next steps is waiting on anything now.';
    return null;
  },
  facts: (s) => factsOf(s),
  text: textOf,
  parts: (s): Part[] => [...s.thoughts.map((t) => ({ id: t.id, label: t.text })), ...s.clusters.map((c) => ({ id: c.id, label: c.name }))],
  views,
  maxStates: 16,
  argLimits: { count: 12, length: L.dump },
  size: (s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 760, h: Math.min(720, 360 + 22 * s.thoughts.length) }),
  shape: (s) => `${s.thoughts.length} thought${s.thoughts.length === 1 ? '' : 's'}${s.clusters.length ? ` in ${s.clusters.length} group${s.clusters.length === 1 ? '' : 's'}` : ''}`,
});

// ── made from the person's words ─────────────────────────────────────

/**
 * An Untangle from what the person wrote: the dump kept exactly, separated
 * into thoughts in their words, each with a first reading of its kind that
 * is marked as Socria's. Nothing is drafted by a model.
 */
export function untangleFromWords(dump: string, title?: string): UntangleState | null {
  const base = sanitizeUntangle({ title: cleanText(title, 80) || 'Untangle', dump });
  if (!base) return null;
  if (!base.dump) return base;
  return UNTANGLE_OPS.separate.check(base, {}) ? base : UNTANGLE_OPS.separate.apply(base, {});
}

export const UNTANGLE_META: DisplayMeta = {
  kind: 'untangle',
  noun: 'untangle',
  handle: 'UT',
  about: 'Everything on your mind, written out and separated into thoughts in your own words — tasks, questions, problems, goals — that you group, connect and choose next steps from.',
  called: [{ words: ['untangle', 'brain dump', 'thought dump', 'brain-dump'] }],
  intents: [
    /\b(?:help me )?untangle\b/,
    /\b(?:brain ?dump|thought dump|dump (?:everything|it all|my thoughts))\b/,
    /\b(?:sort|organi[sz]e) (?:out )?(?:my|these|all (?:my|these)) (?:thoughts|mess|head)\b/,
    /\bso much (?:on my mind|going on)\b/,
    /\b(?:my head is|my mind is|i(?:m| am)) (?:a mess|all over the place|overwhelmed)\b/,
  ],
  experience: true,
  prompts: [
    'Untangle this: I need to finish the essay, my car is making a noise, mom’s birthday is Friday, not sure if I should drop chem, rent is due',
    'Help me untangle everything on my mind about the move',
    'Brain dump: ',
  ],
  tell: () =>
    'An UNTANGLE holds what the person wrote, exactly, separated into thoughts in their words. Kinds marked as Socria’s reading are guesses they can correct. Only the person makes a commitment, decides what is urgent or important, or marks something done — never call an uncertain thought a commitment, and never infer how they feel. Help them see the shape of it; do not hand them a finished plan.',
};

register(UNTANGLE);
registerDisplay(UNTANGLE_META);
