// lib/objects/display-crossroads.ts — CROSSROADS: a decision the person is working through.
//
// Not a recommender. A decision workspace: the decision in the person's
// words, the options, what matters to them (each a preference with a weight,
// or a constraint an option either meets or does not), how well each option
// serves each priority — the PERSON's rating, never Socria's — the pros,
// cons, unknowns, evidence, risks and opportunities of each, the questions
// still open, the assumptions underneath, hypothetical scenarios, and the
// person's own reflections. When the person decides, the decision is
// recorded with their reason; Socria can never decide.
//
// What is computed is computed here, deterministically, and said for what it
// is: the weighted score of each option is a summary of the person's own
// ratings and weights (the comparison engine, lib/objects/display-compare.ts,
// does the arithmetic — one engine, not two), not an answer; the weight at
// which the order would turn; the trade-offs between two options; which
// assumptions most of the decision rests on; what is still unknown. Scenarios
// are hypothetical, always — nothing here gives a probability or predicts
// anyone's future.
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
  norm,
  op,
  registerDisplay,
  type Args,
  type By,
  type Ctx,
  type DisplayHead,
  type DisplayMeta,
} from './display-base';
import { ranking, sanitizeCompare, sensitivity, totals, type CompareState, type Sensitivity } from './display-compare';
import { cleanBasis, cleanLinks, linkOps, REASONING_VERSION, type Basis, type Link } from './reasoning';

export type CrossroadsView = 'center' | 'priorities' | 'compare' | 'scenarios' | 'reflect';
export type PriorityKind = 'preference' | 'constraint';
export type NoteKind = 'pro' | 'con' | 'unknown' | 'evidence' | 'risk' | 'opportunity';
export type Confidence = 'sure' | 'unsure' | 'guess';
export type Case = 'best' | 'plausible' | 'worst';

export interface Alternative {
  id: string;
  name: string;
  note?: string;
  by: By;
}
export interface Priority {
  id: string;
  name: string;
  /** how much it matters to them, 0..10 — theirs to set */
  weight: number;
  /** a preference is weighed; a constraint is met or not (a commute under an hour, a salary that covers rent) */
  kind: PriorityKind;
  by: By;
  /** the person set the weight themselves — until then it counts as the neutral 5 and is shown as not weighed */
  weighed?: boolean;
}
/** How well an option serves a preference, 0..10 — the person's judgment, never Socria's. */
export interface Rating {
  alt: string;
  pri: string;
  value: number;
}
/** Whether an option meets a constraint — the person's call. */
export interface Meet {
  alt: string;
  pri: string;
  ok: boolean;
}
export interface Note {
  id: string;
  /** the option it is about; absent: about the decision as a whole */
  alt?: string;
  kind: NoteKind;
  text: string;
  source?: string;
  by: By;
  basis: Basis;
}
export interface Question {
  id: string;
  text: string;
  answer?: string;
  by: By;
}
export interface Assumption {
  id: string;
  text: string;
  alt?: string;
  /** the priority it bears on, when it does */
  pri?: string;
  confidence: Confidence;
  by: By;
  basis: Basis;
}
/** A hypothetical — always. Never a forecast. */
export interface Scenario {
  id: string;
  alt: string;
  case: Case;
  text: string;
  by: By;
  basis: Basis;
}
export interface Reflection {
  prompt: string;
  text: string;
}

export interface CrossroadsState extends DisplayHead {
  version: number;
  view: CrossroadsView;
  /** the decision, in the person's words where they gave them */
  decision: string;
  decisionBy: By;
  alternatives: Alternative[];
  /** in the order the person put them — dragging reorders */
  priorities: Priority[];
  ratings: Rating[];
  meets: Meet[];
  notes: Note[];
  questions: Question[];
  assumptions: Assumption[];
  scenarios: Scenario[];
  reflections: Reflection[];
  /** the person's decision and their reason — only ever theirs */
  decided?: { alt: string; why?: string };
  links: Link[];
}

export const CROSSROADS_LIMITS = { alternatives: 6, priorities: 10, notes: 60, questions: 20, assumptions: 20, scenarios: 18, text: 240, long: 400, name: 80 } as const;
const L = CROSSROADS_LIMITS;
const NOTE_KINDS: NoteKind[] = ['pro', 'con', 'unknown', 'evidence', 'risk', 'opportunity'];
const CONFIDENCES: Confidence[] = ['sure', 'unsure', 'guess'];
const CASES: Case[] = ['best', 'plausible', 'worst'];
const VIEWS: CrossroadsView[] = ['center', 'priorities', 'compare', 'scenarios', 'reflect'];

export const NOTE_WORD: Record<NoteKind, string> = {
  pro: 'For it',
  con: 'Against it',
  unknown: 'Unknown',
  evidence: 'Evidence',
  risk: 'Risk',
  opportunity: 'Opportunity',
};
export const CASE_WORD: Record<Case, string> = { best: 'If it goes well', plausible: 'Somewhere in between', worst: 'If it goes badly' };
export const CONFIDENCE_WORD: Record<Confidence, string> = { sure: 'fairly sure', unsure: 'not sure', guess: 'a guess' };

/** The questions Crossroads asks — of the person, to answer in their own words. */
export const PROMPTS: readonly { id: string; ask: string }[] = [
  { id: 'assumption', ask: 'Which assumption matters most?' },
  { id: 'mind', ask: 'What would change your mind?' },
  { id: 'missing', ask: 'What information are you missing?' },
  { id: 'whose', ask: 'Are you prioritizing something because it matters to you, or because others expect it?' },
];

// ── canonical state ──────────────────────────────────────────────────

const int10 = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n * 10) / 10 : null;
};

export function sanitizeCrossroads(raw: unknown): CrossroadsState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

  const alternatives: Alternative[] = [];
  const aIds = new Set<string>();
  const aNames = new Set<string>();
  for (const x of arr(r.alternatives ?? r.options)) {
    if (alternatives.length >= L.alternatives) break;
    const o = obj(x);
    const name = cleanText(o?.name ?? o?.label ?? (typeof x === 'string' ? x : ''), L.name);
    if (!name || aNames.has(norm(name) || name.toLowerCase())) continue;
    aNames.add(norm(name) || name.toLowerCase());
    let id = cleanId(o?.id);
    if (!id || aIds.has(id)) id = nextId('a', aIds);
    aIds.add(id);
    const note = cleanText(o?.note, L.text) || undefined;
    alternatives.push({ id, name, ...(note ? { note } : {}), by: cleanBy(o?.by) });
  }
  const priorities: Priority[] = [];
  const pIds = new Set<string>();
  const pNames = new Set<string>();
  for (const x of arr(r.priorities)) {
    if (priorities.length >= L.priorities) break;
    const o = obj(x);
    const name = cleanText(o?.name ?? o?.label, L.name);
    if (!name || pNames.has(name.toLowerCase())) continue;
    pNames.add(name.toLowerCase());
    let id = cleanId(o?.id);
    if (!id || pIds.has(id) || aIds.has(id)) id = nextId('p', [...pIds, ...aIds]);
    pIds.add(id);
    const w = int10(o?.weight);
    priorities.push({ id, name, weight: w === null ? 5 : Math.round(w), kind: o?.kind === 'constraint' ? 'constraint' : 'preference', by: cleanBy(o?.by), ...(o?.weighed === true ? { weighed: true } : {}) });
  }
  const kindOfPri = new Map(priorities.map((p) => [p.id, p.kind]));
  const ratings: Rating[] = [];
  for (const x of arr(r.ratings)) {
    const o = obj(x);
    const alt = typeof o?.alt === 'string' && aIds.has(o.alt) ? o.alt : null;
    const pri = typeof o?.pri === 'string' && kindOfPri.get(o.pri) === 'preference' ? o.pri : null;
    const value = int10(o?.value);
    if (!alt || !pri || value === null || ratings.some((q) => q.alt === alt && q.pri === pri)) continue;
    ratings.push({ alt, pri, value });
  }
  const meets: Meet[] = [];
  for (const x of arr(r.meets)) {
    const o = obj(x);
    const alt = typeof o?.alt === 'string' && aIds.has(o.alt) ? o.alt : null;
    const pri = typeof o?.pri === 'string' && kindOfPri.get(o.pri) === 'constraint' ? o.pri : null;
    if (!alt || !pri || typeof o?.ok !== 'boolean' || meets.some((q) => q.alt === alt && q.pri === pri)) continue;
    meets.push({ alt, pri, ok: o.ok });
  }
  const taken = new Set<string>([...aIds, ...pIds]);
  const idFor = (v: unknown, prefix: string) => {
    let id = cleanId(v);
    if (!id || taken.has(id)) id = nextId(prefix, taken);
    taken.add(id);
    return id;
  };
  const altRef = (v: unknown) => (typeof v === 'string' && aIds.has(v) ? v : undefined);
  const notes: Note[] = [];
  for (const x of arr(r.notes)) {
    if (notes.length >= L.notes) break;
    const o = obj(x);
    const text = cleanText(o?.text, L.text);
    if (!text) continue;
    const by = cleanBy(o?.by);
    const source = cleanText(o?.source, 160) || undefined;
    const kind = NOTE_KINDS.includes(o?.kind as NoteKind) ? (o!.kind as NoteKind) : 'pro';
    const alt = altRef(o?.alt);
    notes.push({ id: idFor(o?.id, 'n'), ...(alt ? { alt } : {}), kind, text, ...(source ? { source } : {}), by, basis: cleanBasis(o?.basis, by, by === 'person' && source ? 'evidence' : undefined) });
  }
  const questions: Question[] = [];
  for (const x of arr(r.questions)) {
    if (questions.length >= L.questions) break;
    const o = obj(x);
    const text = cleanText(o?.text ?? (typeof x === 'string' ? x : ''), L.text);
    if (!text) continue;
    const answer = cleanText(o?.answer, L.text) || undefined;
    questions.push({ id: idFor(o?.id, 'q'), text, ...(answer ? { answer } : {}), by: cleanBy(o?.by) });
  }
  const assumptions: Assumption[] = [];
  for (const x of arr(r.assumptions)) {
    if (assumptions.length >= L.assumptions) break;
    const o = obj(x);
    const text = cleanText(o?.text ?? (typeof x === 'string' ? x : ''), L.text);
    if (!text) continue;
    const by = cleanBy(o?.by);
    const alt = altRef(o?.alt);
    const pri = typeof o?.pri === 'string' && pIds.has(o.pri) ? o.pri : undefined;
    assumptions.push({
      id: idFor(o?.id, 's'),
      text,
      ...(alt ? { alt } : {}),
      ...(pri ? { pri } : {}),
      confidence: CONFIDENCES.includes(o?.confidence as Confidence) ? (o!.confidence as Confidence) : 'unsure',
      by,
      basis: cleanBasis(o?.basis, by),
    });
  }
  const scenarios: Scenario[] = [];
  for (const x of arr(r.scenarios)) {
    if (scenarios.length >= L.scenarios) break;
    const o = obj(x);
    const alt = altRef(o?.alt);
    const text = cleanText(o?.text, L.long);
    if (!alt || !text) continue;
    const by = cleanBy(o?.by);
    // a scenario is a hypothetical: the person's (stated) or Socria's (simulated), never evidence
    const basis: Basis = by === 'person' ? 'stated' : 'simulated';
    scenarios.push({ id: idFor(o?.id, 'c'), alt, case: CASES.includes(o?.case as Case) ? (o!.case as Case) : 'plausible', text, by, basis });
  }
  const reflections: Reflection[] = [];
  for (const x of arr(r.reflections)) {
    const o = obj(x);
    const prompt = typeof o?.prompt === 'string' && PROMPTS.some((p) => p.id === o.prompt) ? o.prompt : null;
    const text = cleanText(o?.text, L.long);
    if (!prompt || !text || reflections.some((q) => q.prompt === prompt)) continue;
    reflections.push({ prompt, text });
  }
  const d = obj(r.decided);
  const decided = d && typeof d.alt === 'string' && aIds.has(d.alt) ? { alt: d.alt, ...(cleanText(d.why, L.long) ? { why: cleanText(d.why, L.long) } : {}) } : undefined;
  return {
    title: cleanText(r.title, 80) || 'Crossroads',
    version: REASONING_VERSION,
    view: VIEWS.includes(r.view as CrossroadsView) ? (r.view as CrossroadsView) : 'center',
    decision: cleanText(r.decision, L.text),
    decisionBy: cleanBy(r.decisionBy),
    alternatives,
    priorities,
    ratings,
    meets,
    notes,
    questions,
    assumptions,
    scenarios,
    reflections,
    ...(decided ? { decided } : {}),
    links: cleanLinks(r.links),
  };
}

// ── what is computed ─────────────────────────────────────────────────

/** The options against the preferences, as the comparison engine reads them — the one place weighted scores are worked out. */
export function asComparison(s: CrossroadsState): CompareState | null {
  const prefs = s.priorities.filter((p) => p.kind === 'preference');
  if (s.alternatives.length < 2 || !prefs.length) return null;
  return sanitizeCompare({
    title: s.title,
    options: s.alternatives.map((a) => ({ id: a.id, name: a.name, by: a.by })),
    criteria: prefs.map((p) => ({ id: p.id, name: p.name, weight: p.weight, by: p.by })),
    scores: s.ratings.map((r) => ({ option: r.alt, criterion: r.pri, value: r.value, by: 'person' })),
  });
}

export interface Standing {
  alt: string;
  /** Σ weight × rating ÷ Σ weight over the preferences rated for it — a summary of THEIR ratings, out of 10 */
  total: number | null;
  rated: number;
  unrated: number;
  /** constraints it does not meet, by the person's own call */
  fails: string[];
  /** constraints not yet checked for it */
  unchecked: string[];
}

export function standings(s: CrossroadsState): { rows: Standing[]; highest: string | null; tooClose: boolean } {
  const c = asComparison(s);
  const tot = c ? new Map(totals(c).map((t) => [t.option, t])) : new Map();
  const rk = c ? ranking(c) : null;
  const constraints = s.priorities.filter((p) => p.kind === 'constraint');
  const prefs = s.priorities.filter((p) => p.kind === 'preference').length;
  const rows = s.alternatives.map((a): Standing => {
    const t = tot.get(a.id);
    const rated = s.ratings.filter((r) => r.alt === a.id).length;
    return {
      alt: a.id,
      total: t?.total ?? null,
      rated,
      unrated: prefs - rated,
      fails: constraints.filter((p) => s.meets.some((m) => m.alt === a.id && m.pri === p.id && !m.ok)).map((p) => p.id),
      unchecked: constraints.filter((p) => !s.meets.some((m) => m.alt === a.id && m.pri === p.id)).map((p) => p.id),
    };
  });
  return { rows, highest: rk?.leader ?? null, tooClose: !!rk?.tooClose };
}

/** For the two highest: how far each preference's weight would have to move for their order to turn. */
export function sensitivityOf(s: CrossroadsState): Sensitivity | null {
  const c = asComparison(s);
  return c ? sensitivity(c) : null;
}

export interface TradeOff {
  pri: string;
  /** which option the person rated higher on it, and by how much */
  better: string;
  worse: string;
  by: number;
  weight: number;
}

/** Where two options pull apart, from the person's ratings: what choosing one gives up of the other. Weightiest first. */
export function tradeoffs(s: CrossroadsState, a: string, b: string): TradeOff[] {
  const out: TradeOff[] = [];
  for (const p of s.priorities) {
    if (p.kind !== 'preference') continue;
    const ra = s.ratings.find((r) => r.alt === a && r.pri === p.id)?.value;
    const rb = s.ratings.find((r) => r.alt === b && r.pri === p.id)?.value;
    if (ra === undefined || rb === undefined || ra === rb) continue;
    out.push({ pri: p.id, better: ra > rb ? a : b, worse: ra > rb ? b : a, by: Math.abs(ra - rb), weight: p.weight });
  }
  return out.sort((x, y) => y.weight * y.by - x.weight * x.by || x.pri.localeCompare(y.pri));
}

const CONF_RANK: Record<Confidence, number> = { guess: 0, unsure: 1, sure: 2 };

/** The assumptions most of the decision rests on: least certain first, then by the weight of what they bear on. */
export function keyAssumptions(s: CrossroadsState): Assumption[] {
  const w = new Map(s.priorities.map((p) => [p.id, p.weight]));
  return [...s.assumptions].sort((x, y) => CONF_RANK[x.confidence] - CONF_RANK[y.confidence] || (w.get(y.pri ?? '') ?? 0) - (w.get(x.pri ?? '') ?? 0) || x.id.localeCompare(y.id));
}

/** What is still not known, counted: ratings not given, constraints not checked, questions open, assumptions not sure. */
export function missing(s: CrossroadsState): { unrated: number; unchecked: number; open: number; unsure: number } {
  const st = standings(s);
  return {
    unrated: st.rows.reduce((n, r) => n + r.unrated, 0),
    unchecked: st.rows.reduce((n, r) => n + r.unchecked.length, 0),
    open: s.questions.filter((q) => !q.answer).length,
    unsure: s.assumptions.filter((a) => a.confidence !== 'sure').length,
  };
}

const nameOf = (s: CrossroadsState, id: string | undefined) => s.alternatives.find((a) => a.id === id)?.name ?? s.priorities.find((p) => p.id === id)?.name ?? id ?? '';
const one = (n: number | null) => (n === null ? '—' : (Math.round(n * 10) / 10).toString());

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<CrossroadsState>[] = [
  { id: 'center', label: 'Decision', shows: 'the decision, its options and what is still open', primary: true, interactions: ['add an option', 'ask a question', 'decide'] },
  { id: 'priorities', label: 'What matters', shows: 'what matters to you, how much, and the trade-offs', interactions: ['reorder', 'weigh', 'mark a must-have'] },
  {
    id: 'compare',
    label: 'Side by side',
    shows: 'each option’s pros, cons, unknowns, evidence, risks and opportunities',
    interactions: ['add a note', 'rate an option'],
    unavailable: (s) => (s.alternatives.length ? null : 'Add an option first.'),
  },
  {
    id: 'scenarios',
    label: 'What if',
    shows: 'hypothetical ways each option could go, the assumptions underneath, and what would change the order',
    interactions: ['add a scenario', 'change an assumption'],
    unavailable: (s) => (s.alternatives.length ? null : 'Add an option first.'),
  },
  { id: 'reflect', label: 'Reflect', shows: 'questions to answer for yourself, and the decision history', interactions: ['answer a prompt'] },
];

type S = CrossroadsState;
const withS = (s: S, patch: Partial<S>): S => sanitizeCrossroads({ ...s, ...patch }) ?? s;
const yours = (ctx: Ctx, what: string): string | null => (ctx?.by === 'socria' ? `${what} — Socria can suggest, but only you set it.` : null);
const alt = (s: S, id: unknown) => s.alternatives.find((a) => a.id === id);
const pri = (s: S, id: unknown) => s.priorities.find((p) => p.id === id);
const textOr = (v: unknown, max: number, said: string): string | null => (cleanText(v, max) ? null : said);
const tooLong = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > max ? `Say it in ${max} characters or fewer.` : null);

export const CROSSROADS_OPS = {
  ...headOps<S>(views, sanitizeCrossroads),
  decision: op<S>(
    'State the decision',
    (s, a, ctx) => textOr(a.text, L.text, 'Say what you are deciding.') ?? tooLong(a.text, L.text) ?? (ctx?.by === 'socria' && s.decisionBy === 'person' ? 'The decision is in your words — Socria does not rewrite it.' : null) ?? guardBy(a, ctx),
    (s, a) => withS(s, { decision: cleanText(a.text, L.text), decisionBy: a.by === 'person' ? 'person' : s.decisionBy }),
    (a) => `decision: “${cleanText(a.text, 80)}”`
  ),
  addAlt: op<S>(
    'Add an option',
    (s, a, ctx) =>
      textOr(a.name, L.name, 'Name the option.') ??
      (s.alternatives.length >= L.alternatives ? `Crossroads holds ${L.alternatives} options at most.` : null) ??
      (s.alternatives.some((x) => x.name.toLowerCase() === cleanText(a.name, L.name).toLowerCase()) ? 'There is already an option by that name.' : null) ??
      guardBy(a, ctx),
    (s, a) => withS(s, { alternatives: [...s.alternatives, { id: nextId('a', allIds(s)), name: cleanText(a.name, L.name), ...(cleanText(a.note, L.text) ? { note: cleanText(a.note, L.text) } : {}), by: cleanBy(a.by) }] }),
    (a) => `added the option “${cleanText(a.name, L.name)}”`
  ),
  renameAlt: op<S>(
    'Rename an option',
    (s, a, ctx) => (alt(s, a.id) ? null : 'There is no such option.') ?? textOr(a.name, L.name, 'Name the option.') ?? guardOwn(alt(s, a.id), ctx, 'That option'),
    (s, a) => withS(s, { alternatives: s.alternatives.map((x) => (x.id === a.id ? { ...x, name: cleanText(a.name, L.name), by: a.by === 'person' ? 'person' : x.by } : x)) }),
    (a) => `renamed an option “${cleanText(a.name, L.name)}”`
  ),
  removeAlt: op<S>(
    'Remove an option',
    (s, a, ctx) => (alt(s, a.id) ? null : 'There is no such option.') ?? guardOwn(alt(s, a.id), ctx, 'That option') ?? (s.decided?.alt === a.id ? 'You decided on this option — undo the decision first.' : null),
    (s, a) =>
      withS(s, {
        alternatives: s.alternatives.filter((x) => x.id !== a.id),
        ratings: s.ratings.filter((r) => r.alt !== a.id),
        meets: s.meets.filter((r) => r.alt !== a.id),
        notes: s.notes.filter((n) => n.alt !== a.id),
        scenarios: s.scenarios.filter((c) => c.alt !== a.id),
        assumptions: s.assumptions.map((x) => (x.alt === a.id ? { ...x, alt: undefined } : x)),
      }),
    () => 'removed an option'
  ),
  addPri: op<S>(
    'Add what matters',
    (s, a, ctx) =>
      textOr(a.name, L.name, 'Say what matters.') ??
      (s.priorities.length >= L.priorities ? `Crossroads holds ${L.priorities} priorities at most.` : null) ??
      (s.priorities.some((p) => p.name.toLowerCase() === cleanText(a.name, L.name).toLowerCase()) ? 'That is already on the list.' : null) ??
      (a.weight !== undefined && a.weight !== '' && int10(a.weight) === null ? 'A weight is from 0 to 10.' : null) ??
      (a.weight !== undefined && a.weight !== '' && ctx?.by === 'socria' ? 'How much it matters is yours to set — Socria can add it unweighed.' : null) ??
      guardBy(a, ctx),
    (s, a) =>
      withS(s, {
        priorities: [
          ...s.priorities,
          {
            id: nextId('p', allIds(s)),
            name: cleanText(a.name, L.name),
            weight: Math.round(int10(a.weight) ?? 5),
            kind: a.kind === 'constraint' ? 'constraint' : 'preference',
            by: cleanBy(a.by),
            ...(a.weight !== undefined && a.weight !== '' && cleanBy(a.by) === 'person' ? { weighed: true } : {}),
          },
        ],
      }),
    (a) => `added “${cleanText(a.name, L.name)}”${a.kind === 'constraint' ? ' as a must-have' : ''}`
  ),
  renamePri: op<S>(
    'Rename what matters',
    (s, a, ctx) => (pri(s, a.id) ? null : 'There is no such priority.') ?? textOr(a.name, L.name, 'Say what matters.') ?? guardOwn(pri(s, a.id), ctx, 'That priority'),
    (s, a) => withS(s, { priorities: s.priorities.map((p) => (p.id === a.id ? { ...p, name: cleanText(a.name, L.name), by: a.by === 'person' ? 'person' : p.by } : p)) }),
    (a) => `renamed to “${cleanText(a.name, L.name)}”`
  ),
  weight: op<S>(
    'Weigh',
    (s, a, ctx) => (pri(s, a.id) ? null : 'There is no such priority.') ?? (int10(a.weight) === null ? 'A weight is from 0 to 10.' : null) ?? yours(ctx, 'How much something matters to you'),
    // weighing it makes it theirs: what they weighed, Socria does not touch
    (s, a) => withS(s, { priorities: s.priorities.map((p) => (p.id === a.id ? { ...p, weight: Math.round(int10(a.weight)!), by: 'person', weighed: true } : p)) }),
    (a) => `weight set to ${Math.round(int10(a.weight) ?? 0)}`
  ),
  priKind: op<S>(
    'Must-have or preference',
    (s, a, ctx) => (pri(s, a.id) ? null : 'There is no such priority.') ?? (a.kind === 'constraint' || a.kind === 'preference' ? null : 'It is a preference or a must-have.') ?? yours(ctx, 'Whether something is a must-have'),
    (s, a) =>
      withS(s, {
        priorities: s.priorities.map((p) => (p.id === a.id ? { ...p, kind: a.kind as PriorityKind, by: 'person' } : p)),
        // a rating means nothing for a must-have, and a met/not-met means nothing for a preference
        ratings: a.kind === 'constraint' ? s.ratings.filter((r) => r.pri !== a.id) : s.ratings,
        meets: a.kind === 'preference' ? s.meets.filter((m) => m.pri !== a.id) : s.meets,
      }),
    (a) => (a.kind === 'constraint' ? 'made a must-have' : 'made a preference')
  ),
  movePri: op<S>(
    'Reorder',
    (s, a, ctx) => {
      if (!pri(s, a.id)) return 'There is no such priority.';
      const to = Number(a.to);
      if (!Number.isInteger(to) || to < 0 || to >= s.priorities.length) return 'There is no such place.';
      return yours(ctx, 'The order of what matters');
    },
    (s, a) => {
      const list = s.priorities.slice();
      const [p] = list.splice(list.findIndex((x) => x.id === a.id), 1);
      list.splice(Number(a.to), 0, p);
      return withS(s, { priorities: list });
    },
    (a) => `moved to place ${Number(a.to) + 1}`
  ),
  removePri: op<S>(
    'Remove what matters',
    (s, a, ctx) => (pri(s, a.id) ? null : 'There is no such priority.') ?? guardOwn(pri(s, a.id), ctx, 'That priority'),
    (s, a) =>
      withS(s, {
        priorities: s.priorities.filter((p) => p.id !== a.id),
        ratings: s.ratings.filter((r) => r.pri !== a.id),
        meets: s.meets.filter((m) => m.pri !== a.id),
        assumptions: s.assumptions.map((x) => (x.pri === a.id ? { ...x, pri: undefined } : x)),
      }),
    () => 'removed a priority'
  ),
  rate: op<S>(
    'Rate',
    (s, a, ctx) => {
      if (!alt(s, a.alt)) return 'There is no such option.';
      const p = pri(s, a.pri);
      if (!p) return 'There is no such priority.';
      if (p.kind !== 'preference') return 'A must-have is met or not — it is not rated.';
      if (a.value !== '' && int10(a.value) === null) return 'A rating is from 0 to 10.';
      return yours(ctx, 'How well an option serves what matters to you');
    },
    (s, a) => {
      const rest = s.ratings.filter((r) => !(r.alt === a.alt && r.pri === a.pri));
      return withS(s, { ratings: a.value === '' ? rest : [...rest, { alt: String(a.alt), pri: String(a.pri), value: int10(a.value)! }] });
    },
    (a) => (a.value === '' ? 'rating cleared' : `rated ${int10(a.value)}`)
  ),
  meet: op<S>(
    'Meets the must-have',
    (s, a, ctx) => {
      if (!alt(s, a.alt)) return 'There is no such option.';
      const p = pri(s, a.pri);
      if (!p) return 'There is no such priority.';
      if (p.kind !== 'constraint') return 'Only a must-have is met or not.';
      if (a.ok !== 'yes' && a.ok !== 'no' && a.ok !== '') return 'Say yes, no, or clear it.';
      return yours(ctx, 'Whether an option meets a must-have');
    },
    (s, a) => {
      const rest = s.meets.filter((m) => !(m.alt === a.alt && m.pri === a.pri));
      return withS(s, { meets: a.ok === '' ? rest : [...rest, { alt: String(a.alt), pri: String(a.pri), ok: a.ok === 'yes' }] });
    },
    (a) => (a.ok === '' ? 'cleared' : a.ok === 'yes' ? 'meets it' : 'does not meet it')
  ),
  addNote: op<S>(
    'Add a note',
    (s, a, ctx) =>
      textOr(a.text, L.text, 'Say what the note says.') ??
      tooLong(a.text, L.text) ??
      (NOTE_KINDS.includes(a.kind as NoteKind) ? null : 'A note is for, against, unknown, evidence, a risk or an opportunity.') ??
      (a.alt !== undefined && a.alt !== '' && !alt(s, a.alt) ? 'There is no such option.' : null) ??
      (s.notes.length >= L.notes ? 'Crossroads holds as many notes as it can.' : null) ??
      guardBy(a, ctx),
    (s, a) =>
      withS(s, {
        notes: [
          ...s.notes,
          {
            id: nextId('n', allIds(s)),
            ...(a.alt ? { alt: String(a.alt) } : {}),
            kind: a.kind as NoteKind,
            text: cleanText(a.text, L.text),
            ...(cleanText(a.source, 160) ? { source: cleanText(a.source, 160) } : {}),
            by: cleanBy(a.by),
            basis: cleanBasis(undefined, cleanBy(a.by), cleanBy(a.by) === 'person' && cleanText(a.source, 160) ? 'evidence' : undefined),
          },
        ],
      }),
    (a) => `noted (${NOTE_WORD[a.kind as NoteKind]?.toLowerCase() ?? a.kind}): “${cleanText(a.text, 60)}”`
  ),
  editNote: op<S>(
    'Edit a note',
    (s, a, ctx) => {
      const n = s.notes.find((x) => x.id === a.id);
      if (!n) return 'There is no such note.';
      return textOr(a.text, L.text, 'Say what the note says.') ?? guardOwn(n, ctx, 'That note');
    },
    (s, a) =>
      withS(s, {
        notes: s.notes.map((n) => {
          if (n.id !== a.id) return n;
          const by: By = a.by === 'person' ? 'person' : n.by;
          const source = a.source === undefined ? n.source : cleanText(a.source, 160) || undefined;
          return { ...n, text: cleanText(a.text, L.text), ...(source ? { source } : { source: undefined }), by, basis: cleanBasis(undefined, by, by === 'person' && source ? 'evidence' : undefined) };
        }),
      }),
    () => 'edited a note'
  ),
  removeNote: op<S>(
    'Remove a note',
    (s, a, ctx) => {
      const n = s.notes.find((x) => x.id === a.id);
      return n ? guardOwn(n, ctx, 'That note') : 'There is no such note.';
    },
    (s, a) => withS(s, { notes: s.notes.filter((n) => n.id !== a.id) }),
    () => 'removed a note'
  ),
  addQuestion: op<S>(
    'Ask a question',
    (s, a, ctx) => textOr(a.text, L.text, 'Say the question.') ?? tooLong(a.text, L.text) ?? (s.questions.length >= L.questions ? 'Crossroads holds as many questions as it can.' : null) ?? guardBy(a, ctx),
    (s, a) => withS(s, { questions: [...s.questions, { id: nextId('q', allIds(s)), text: cleanText(a.text, L.text), by: cleanBy(a.by) }] }),
    (a) => `asked: “${cleanText(a.text, 60)}”`
  ),
  answer: op<S>(
    'Answer a question',
    (s, a, ctx) => (s.questions.some((q) => q.id === a.id) ? null : 'There is no such question.') ?? tooLong(a.answer, L.text) ?? yours(ctx, 'The answer to your question'),
    (s, a) => withS(s, { questions: s.questions.map((q) => (q.id === a.id ? { ...q, answer: cleanText(a.answer, L.text) || undefined } : q)) }),
    (a) => (cleanText(a.answer, L.text) ? 'answered a question' : 'reopened a question')
  ),
  removeQuestion: op<S>(
    'Remove a question',
    (s, a, ctx) => {
      const q = s.questions.find((x) => x.id === a.id);
      return q ? guardOwn(q, ctx, 'That question') : 'There is no such question.';
    },
    (s, a) => withS(s, { questions: s.questions.filter((q) => q.id !== a.id) }),
    () => 'removed a question'
  ),
  addAssumption: op<S>(
    'Name an assumption',
    (s, a, ctx) =>
      textOr(a.text, L.text, 'Say the assumption.') ??
      tooLong(a.text, L.text) ??
      (s.assumptions.length >= L.assumptions ? 'Crossroads holds as many assumptions as it can.' : null) ??
      (a.alt !== undefined && a.alt !== '' && !alt(s, a.alt) ? 'There is no such option.' : null) ??
      (a.pri !== undefined && a.pri !== '' && !pri(s, a.pri) ? 'There is no such priority.' : null) ??
      guardBy(a, ctx),
    (s, a) =>
      withS(s, {
        assumptions: [
          ...s.assumptions,
          {
            id: nextId('s', allIds(s)),
            text: cleanText(a.text, L.text),
            ...(a.alt ? { alt: String(a.alt) } : {}),
            ...(a.pri ? { pri: String(a.pri) } : {}),
            confidence: CONFIDENCES.includes(a.confidence as Confidence) ? (a.confidence as Confidence) : 'unsure',
            by: cleanBy(a.by),
            basis: cleanBasis(undefined, cleanBy(a.by)),
          },
        ],
      }),
    (a) => `assumed: “${cleanText(a.text, 60)}”`
  ),
  assumption: op<S>(
    'Change an assumption',
    (s, a, ctx) => {
      const x = s.assumptions.find((y) => y.id === a.id);
      if (!x) return 'There is no such assumption.';
      if (a.text !== undefined && !cleanText(a.text, L.text)) return 'Say the assumption.';
      if (a.confidence !== undefined && !CONFIDENCES.includes(a.confidence as Confidence)) return 'Fairly sure, not sure, or a guess.';
      if (a.pri !== undefined && a.pri !== '' && !pri(s, a.pri)) return 'There is no such priority.';
      // how sure the person is, is theirs; what Socria suggested it may reword
      if (a.confidence !== undefined && ctx?.by === 'socria') return 'How sure you are is yours to say.';
      return guardOwn(x, ctx, 'That assumption');
    },
    (s, a) =>
      withS(s, {
        assumptions: s.assumptions.map((x) => {
          if (x.id !== a.id) return x;
          const by: By = a.by === 'person' ? 'person' : x.by;
          return {
            ...x,
            ...(a.text !== undefined ? { text: cleanText(a.text, L.text) } : {}),
            ...(a.confidence !== undefined ? { confidence: a.confidence as Confidence } : {}),
            ...(a.pri !== undefined ? { pri: a.pri ? String(a.pri) : undefined } : {}),
            by,
            basis: cleanBasis(undefined, by),
          };
        }),
      }),
    (a) => (a.confidence !== undefined ? `now ${CONFIDENCE_WORD[a.confidence as Confidence] ?? a.confidence}` : 'assumption changed')
  ),
  removeAssumption: op<S>(
    'Remove an assumption',
    (s, a, ctx) => {
      const x = s.assumptions.find((y) => y.id === a.id);
      return x ? guardOwn(x, ctx, 'That assumption') : 'There is no such assumption.';
    },
    (s, a) => withS(s, { assumptions: s.assumptions.filter((x) => x.id !== a.id) }),
    () => 'removed an assumption'
  ),
  addScenario: op<S>(
    'Imagine how it goes',
    (s, a, ctx) =>
      (alt(s, a.alt) ? null : 'Say which option.') ??
      (CASES.includes(a.case as Case) ? null : 'Well, in between, or badly.') ??
      textOr(a.text, L.long, 'Say how it might go.') ??
      tooLong(a.text, L.long) ??
      (s.scenarios.length >= L.scenarios ? 'Crossroads holds as many scenarios as it can.' : null) ??
      guardBy(a, ctx),
    (s, a) =>
      withS(s, {
        scenarios: [...s.scenarios, { id: nextId('c', allIds(s)), alt: String(a.alt), case: a.case as Case, text: cleanText(a.text, L.long), by: cleanBy(a.by), basis: cleanBy(a.by) === 'person' ? 'stated' : 'simulated' }],
      }),
    (a) => `imagined: ${CASE_WORD[a.case as Case]?.toLowerCase() ?? a.case}`
  ),
  editScenario: op<S>(
    'Change a scenario',
    (s, a, ctx) => {
      const c = s.scenarios.find((x) => x.id === a.id);
      if (!c) return 'There is no such scenario.';
      return textOr(a.text, L.long, 'Say how it might go.') ?? guardOwn(c, ctx, 'That scenario');
    },
    (s, a) => withS(s, { scenarios: s.scenarios.map((c) => (c.id === a.id ? { ...c, text: cleanText(a.text, L.long), ...(a.by === 'person' ? { by: 'person' as By, basis: 'stated' as Basis } : {}) } : c)) }),
    () => 'changed a scenario'
  ),
  removeScenario: op<S>(
    'Remove a scenario',
    (s, a, ctx) => {
      const c = s.scenarios.find((x) => x.id === a.id);
      return c ? guardOwn(c, ctx, 'That scenario') : 'There is no such scenario.';
    },
    (s, a) => withS(s, { scenarios: s.scenarios.filter((c) => c.id !== a.id) }),
    () => 'removed a scenario'
  ),
  reflect: op<S>(
    'Reflect',
    (_s, a, ctx) => (PROMPTS.some((p) => p.id === a.prompt) ? null : 'There is no such prompt.') ?? tooLong(a.text, L.long) ?? yours(ctx, 'A reflection'),
    (s, a) => {
      const rest = s.reflections.filter((r) => r.prompt !== a.prompt);
      const text = cleanText(a.text, L.long);
      return withS(s, { reflections: text ? [...rest, { prompt: String(a.prompt), text }] : rest });
    },
    (a) => (cleanText(a.text, L.long) ? `reflected: ${PROMPTS.find((p) => p.id === a.prompt)?.ask ?? ''}` : 'reflection cleared')
  ),
  decide: op<S>(
    'Decide',
    (s, a, ctx) => (ctx?.by === 'socria' ? 'The decision is yours. Socria never makes it.' : null) ?? (alt(s, a.alt) ? null : 'Say which option.') ?? tooLong(a.why, L.long),
    (s, a) => withS(s, { decided: { alt: String(a.alt), ...(cleanText(a.why, L.long) ? { why: cleanText(a.why, L.long) } : {}) } }),
    (a) => `decided${cleanText(a.why, 60) ? `, because ${cleanText(a.why, 60)}` : ''}`
  ),
  undecide: op<S>(
    'Reopen the decision',
    (s, _a, ctx) => (ctx?.by === 'socria' ? 'Only you reopen your decision.' : null) ?? (s.decided ? null : 'Nothing is decided yet.'),
    (s) => {
      const { decided: _d, ...rest } = s;
      return sanitizeCrossroads(rest) ?? s;
    },
    () => 'reopened the decision'
  ),
  ...linkOps<S>(sanitizeCrossroads),
};

function allIds(s: S): string[] {
  return [...s.alternatives.map((x) => x.id), ...s.priorities.map((x) => x.id), ...s.notes.map((x) => x.id), ...s.questions.map((x) => x.id), ...s.assumptions.map((x) => x.id), ...s.scenarios.map((x) => x.id)];
}

// ── words → an operation ─────────────────────────────────────────────

export function readCrossroadsOp(text: string, s: S): { op: string; args: Args } | null {
  const t = text.trim().replace(/[.!]+$/, '');
  if (!t || t.length > 300 || /\?$/.test(t)) return null;
  let m = /^(?:please\s+)?(?:add|include)\s+(?:an?\s+|another\s+)?(?:option|alternative|choice)\s*[:—-]?\s*(.+)$/i.exec(t) ?? /^(?:please\s+)?add\s+(.+?)\s+as\s+(?:an?\s+|another\s+)?(?:option|alternative|choice)$/i.exec(t);
  if (m) return { op: 'addAlt', args: { name: cleanText(m[1].replace(/^["“']|["”']$/g, ''), L.name), by: 'person' } };
  m = /^(?:please\s+)?add\s+(?:a\s+)?(must[- ]have|dealbreaker|deal[- ]breaker|requirement|priority)\s*[:—-]?\s*(.+)$/i.exec(t);
  if (m) return { op: 'addPri', args: { name: cleanText(m[2], L.name), kind: /priority/i.test(m[1]) ? 'preference' : 'constraint', by: 'person' } };
  m = /^(.+?)\s+is\s+an?\s+(?:must|must[- ]have|dealbreaker|deal[- ]breaker|requirement)$/i.exec(t);
  if (m) {
    const p = findByLabel(s.priorities, (x) => x.name, m[1]);
    if (p) return { op: 'priKind', args: { id: p.id, kind: 'constraint' } };
  }
  m = /^(?:set|make|give)\s+(?:the\s+weight\s+of\s+)?(.+?)(?:'s|’s)?\s+(?:weight\s+)?(?:to\s+|a\s+)?(\d+(?:\.\d+)?)(?:\s*\/\s*10)?(?:\s+out\s+of\s+10)?$/i.exec(t);
  if (m) {
    const p = findByLabel(s.priorities, (x) => x.name, m[1]);
    if (p && int10(m[2]) !== null) return { op: 'weight', args: { id: p.id, weight: Math.round(int10(m[2])!) } };
  }
  m = /^(?:rate|score|give)\s+(.+?)\s+(?:an?\s+)?(\d+(?:\.\d+)?)(?:\s*\/\s*10|\s+out\s+of\s+10)?\s+(?:on|for)\s+(.+)$/i.exec(t);
  if (m) {
    const a = findByLabel(s.alternatives, (x) => x.name, m[1]);
    const p = findByLabel(s.priorities.filter((x) => x.kind === 'preference'), (x) => x.name, m[3]);
    if (a && p && int10(m[2]) !== null) return { op: 'rate', args: { alt: a.id, pri: p.id, value: int10(m[2])! } };
  }
  m = /^(?:add\s+(?:a\s+)?question|i\s+need\s+to\s+find\s+out|i\s+(?:still\s+)?need\s+to\s+know)\s*[:—-]?\s*(.+)$/i.exec(t);
  if (m) return { op: 'addQuestion', args: { text: cleanText(m[1], L.text), by: 'person' } };
  m = /^(?:add\s+(?:an\s+)?assumption|i(?:'m|’m|\s+am)\s+assuming(?:\s+that)?)\s*[:—-]?\s*(.+)$/i.exec(t);
  if (m) return { op: 'addAssumption', args: { text: cleanText(m[1], L.text), by: 'person' } };
  m = /^(?:i(?:'ve|’ve|\s+have)?\s+decided(?:\s+on|\s+to\s+go\s+with)?|i\s+choose|i(?:'ll|’ll|\s+will)\s+go\s+with)\s+(.+?)(?:\s+because\s+(.+))?$/i.exec(t);
  if (m) {
    const a = findByLabel(s.alternatives, (x) => x.name, m[1]);
    if (a) return { op: 'decide', args: { alt: a.id, ...(m[2] ? { why: cleanText(m[2], L.long) } : {}) } };
  }
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

function factsOf(s: S): string[] {
  const out = [`${s.title}: the person is deciding “${s.decision || '(not yet stated)'}” between ${s.alternatives.map((a) => a.name).join(', ') || 'no options yet'}.`];
  const prefs = s.priorities.filter((p) => p.kind === 'preference');
  const musts = s.priorities.filter((p) => p.kind === 'constraint');
  if (prefs.length) out.push(`What matters to them (their weights, 0–10): ${prefs.map((p) => `${p.name} ${p.weight}`).join(', ')}.`);
  if (musts.length) out.push(`Must-haves: ${musts.map((p) => p.name).join(', ')}.`);
  const st = standings(s);
  const scored = st.rows.filter((r) => r.total !== null);
  if (scored.length) {
    out.push(
      `Weighted scores computed from THEIR OWN ratings and weights (a summary of their inputs, not a recommendation): ${scored.map((r) => `${nameOf(s, r.alt)} ${one(r.total)}${r.unrated ? ` (${r.unrated} not rated)` : ''}`).join(', ')}.${st.tooClose ? ' The top two are too close to call.' : ''}`
    );
  }
  for (const r of st.rows) if (r.fails.length) out.push(`${nameOf(s, r.alt)} does not meet: ${r.fails.map((p) => nameOf(s, p)).join(', ')} (their call).`);
  const ks = keyAssumptions(s).slice(0, 3);
  if (ks.length) out.push(`Assumptions it rests on: ${ks.map((a) => `“${a.text}” (${CONFIDENCE_WORD[a.confidence]})`).join('; ')}.`);
  const open = s.questions.filter((q) => !q.answer);
  if (open.length) out.push(`Open questions: ${open.map((q) => q.text).join('; ')}.`);
  if (s.scenarios.length) out.push(`${s.scenarios.length} hypothetical scenario${s.scenarios.length === 1 ? '' : 's'} — imagined, not forecasts.`);
  out.push(s.decided ? `They decided on ${nameOf(s, s.decided.alt)}${s.decided.why ? `, because ${s.decided.why}` : ''}.` : 'Nothing is decided — the decision is theirs.');
  return out;
}

function textOf(s: S): string {
  const lines = [`CROSSROADS “${s.title}” — ${s.decision}`];
  for (const a of s.alternatives) {
    lines.push(`Option ${a.name}${a.by === 'socria' ? ' (suggested)' : ''}${a.note ? ` — ${a.note}` : ''}`);
    for (const n of s.notes.filter((x) => x.alt === a.id)) lines.push(`  ${NOTE_WORD[n.kind]}: ${n.text}${n.source ? ` [source: ${n.source}]` : ''}${n.by === 'socria' ? ' (suggested)' : ''}`);
    for (const c of s.scenarios.filter((x) => x.alt === a.id)) lines.push(`  Hypothetical — ${CASE_WORD[c.case]}: ${c.text}`);
  }
  for (const p of s.priorities) lines.push(`${p.kind === 'constraint' ? 'Must-have' : `Matters (${p.weight}/10)`}: ${p.name}`);
  for (const r of s.ratings) lines.push(`Their rating: ${nameOf(s, r.alt)} on ${nameOf(s, r.pri)} = ${r.value}/10`);
  for (const q of s.questions) lines.push(`Question: ${q.text}${q.answer ? ` — answered: ${q.answer}` : ''}`);
  for (const a of s.assumptions) lines.push(`Assumption (${CONFIDENCE_WORD[a.confidence]}): ${a.text}${a.by === 'socria' ? ' (suggested)' : ''}`);
  for (const r of s.reflections) lines.push(`Their reflection — ${PROMPTS.find((p) => p.id === r.prompt)?.ask}: ${r.text}`);
  return lines.join('\n').slice(0, 2600);
}

export const CROSSROADS = displayKind<S>({
  kind: 'crossroads',
  label: 'Crossroads',
  sanitize: sanitizeCrossroads,
  ops: CROSSROADS_OPS,
  readOp: (text, s) => readCrossroadsOp(text, s),
  consequence: (before, after, step) => {
    const a = standings(before);
    const b = standings(after);
    if (step.op === 'decide') return `Recorded as your decision: ${nameOf(after, after.decided?.alt)}. It stays yours to revisit.`;
    if (a.highest !== b.highest && b.highest) return `From your ratings and weights, ${nameOf(after, b.highest)} now has the highest weighted score — a summary of your inputs, not a verdict.`;
    if (!a.tooClose && b.tooClose) return 'The top two are now too close to call on your ratings.';
    return null;
  },
  facts: (s) => factsOf(s),
  text: textOf,
  parts: (s): Part[] => [...s.alternatives.map((a) => ({ id: a.id, label: a.name })), ...s.priorities.map((p) => ({ id: p.id, label: p.name }))],
  views,
  maxStates: 30,
  argLimits: { count: 12, length: 400 },
  size: (s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 760, h: Math.min(720, 380 + 40 * s.alternatives.length) }),
  shape: (s) => `decision · ${s.alternatives.length} option${s.alternatives.length === 1 ? '' : 's'}${s.decided ? ' · decided' : ''}`,
});

// ── made from the person's words ─────────────────────────────────────

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const optionWords = (x: string) => cleanText(x.replace(/^(?:to\s+|just\s+|either\s+)/i, '').replace(/[?.!,;:]+$/g, '').replace(/\s+(?:instead|or not|either)$/i, ''), L.name);

/**
 * A decision from how the person put it — "should I take the job in Austin or
 * stay in Dallas?", "I'm torn between economics, CS and math" — with their
 * options in their words, and what they said matters to them. Null when the
 * words hold no options; the proposal pass may then draft one, sealed.
 */
export function crossroadsFromWords(said: string): CrossroadsState | null {
  const text = cleanText(said, 600);
  const sentence = text.split(/(?<=[.?!])\s+/).find((x) => /\bshould i\b.+\bor\b|\b(?:between|whether)\b/i.test(x)) ?? text;
  let options: string[] = [];
  let m = /\bshould i\s+(.+?)\s*\??$/i.exec(sentence);
  if (m) {
    const body = m[1].replace(/\?.*$/, '');
    if (/\s+or\s+not$/i.test(body)) {
      const a = optionWords(body.replace(/\s+or\s+not$/i, ''));
      options = a ? [a, `Not ${a}`] : [];
    } else options = body.split(/\s*,\s*(?:or\s+)?|\s+or\s+/i).map(optionWords);
  } else {
    m = /\b(?:between|choose from|choosing from)\s+(.+?)(?:[.?!]|$)/i.exec(sentence);
    if (m) options = m[1].split(/\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/i).map(optionWords);
    else {
      m = /\bwhether\s+(?:to\s+|i\s+should\s+)?(.+?)(?:\s+or\s+not)?(?:[.?!]|$)/i.exec(sentence);
      if (m) {
        const a = optionWords(m[1].split(/\s+or\s+/i)[0]);
        const b = m[1].split(/\s+or\s+/i)[1];
        options = a ? [a, b ? optionWords(b) : `Not ${a}`] : [];
      }
    }
  }
  options = [...new Map(options.filter((o) => o && o.length >= 2).map((o) => [o.toLowerCase(), cap(o)])).values()].slice(0, L.alternatives);
  if (options.length < 2) return null;
  const pri: string[] = [];
  const mm = /\b(?:i care about|what matters (?:to me )?(?:is|are)|important to me (?:is|are)|i(?:'m| am) worried about|i value)\s+(.+?)(?:[.?!]|$)/i.exec(text);
  if (mm) pri.push(...mm[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map((x) => cleanText(x.replace(/[.!?]+$/, ''), L.name)).filter((x) => x.length >= 2));
  return sanitizeCrossroads({
    title: cleanText(options.slice(0, 2).join(' or '), 80),
    decision: cleanText(sentence, L.text),
    decisionBy: 'person',
    alternatives: options.map((name) => ({ name, by: 'person' })),
    priorities: [...new Set(pri)].slice(0, L.priorities).map((name) => ({ name: cap(name), kind: 'preference', by: 'person' })),
  });
}

/**
 * A drafted decision, held to what is the person's: no ratings, no weights,
 * no must-have calls, no scenarios, reflections or decision from a draft —
 * and an option, priority or the decision itself is theirs only where it is
 * in their own words.
 */
export function sealCrossroads(raw: CrossroadsState, said: string): { state: CrossroadsState; gaps: string[] } {
  const theirs = ` ${norm(said)} `;
  const inTheirWords = (x: string) => norm(x).length >= 2 && theirs.includes(` ${norm(x)} `);
  const state = sanitizeCrossroads({
    ...raw,
    decisionBy: inTheirWords(raw.decision) ? 'person' : 'socria',
    alternatives: raw.alternatives.map((a) => ({ ...a, by: inTheirWords(a.name) ? 'person' : 'socria' })),
    priorities: raw.priorities.map((p) => ({ id: p.id, name: p.name, kind: p.kind, weight: 5, by: inTheirWords(p.name) ? 'person' : 'socria' })),
    ratings: [],
    meets: [],
    scenarios: [],
    reflections: [],
    decided: undefined,
  })!;
  return { state, gaps: state.priorities.length ? ['nothing is weighed or rated yet — that is yours to do'] : [] };
}

export const CROSSROADS_META: DisplayMeta = {
  kind: 'crossroads',
  noun: 'decision',
  handle: 'CR',
  about: 'A decision you are working through: the options, what matters to you and how much, how each option serves it, the trade-offs, what you are assuming and what is still unknown. You decide; it never does.',
  called: [{ words: ['crossroads', 'decision workspace', 'decision board'] }],
  intents: [
    /^(?:so\s+)?should i\b.+\bor\b/,
    /\bhelp me (?:decide|choose|make (?:a|this|the) (?:decision|choice))\b/,
    /\b(?:im|i am) (?:trying to )?(?:decide|deciding|choosing|torn) (?:between|whether)\b/,
    /\b(?:cant|cannot|can not) decide (?:between|whether)\b/,
    /\b(?:decide|choose) between\b/,
  ],
  experience: true,
  prompts: ['Should I take the job in Austin or stay in Dallas?', 'Help me decide between a used Civic, a Model 3 and keeping my car', 'I’m torn between majoring in economics and computer science'],
  spec: `{"title": "short", "decision": "what they are deciding, in their words", "alternatives": [{"id": "a1", "name": "an option they named"}], "priorities": [{"id": "p1", "name": "something they said matters", "kind": "preference|constraint"}], "questions": [{"id": "q1", "text": "something they said they do not know yet"}], "assumptions": [{"id": "s1", "text": "something the decision rests on that they said or plainly implied", "confidence": "sure|unsure|guess"}], "notes": [{"id": "n1", "alt": "a1", "kind": "pro|con|unknown|evidence|risk|opportunity", "text": "what they said for or against it", "source": "only a source they gave"}]}
  Only options, priorities and points the conversation gives. Never write a rating, a weight, a scenario, a recommendation or a decision — those are the person's. A "constraint" is a must-have an option either meets or does not.`,
  example: {
    title: 'Austin or Dallas',
    decision: 'Whether to take the job in Austin or stay in Dallas',
    alternatives: [
      { id: 'a1', name: 'Take the Austin job' },
      { id: 'a2', name: 'Stay in Dallas' },
    ],
    priorities: [
      { id: 'p1', name: 'Salary', kind: 'preference' },
      { id: 'p2', name: 'Near family', kind: 'preference' },
    ],
    questions: [{ id: 'q1', text: 'Is the Austin offer negotiable?' }],
  },
  tell: () =>
    `A CROSSROADS is the person's own decision. Never make it, never recommend an option, never rate or weigh for them. The weighted scores above are arithmetic on THEIR ratings and weights — say so if you mention them, and say when the top two are too close to call. Scenarios are hypothetical, never forecasts; give no probabilities. Help them see their own trade-offs, assumptions and unknowns — ask, more than tell.`,
};

register(CROSSROADS);
registerDisplay(CROSSROADS_META);
