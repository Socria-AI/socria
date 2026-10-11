// lib/objects/display-rehearsal.ts — THE REHEARSAL ROOM: practising a conversation before having it.
//
// The person sets up a conversation they are going to have — what they want
// from it, the situation, who it is with — and then has it, in their own
// words, against a simulated counterpart. Socria plays the other side and
// nothing else: it never writes the person's lines, never decides how the
// conversation should go, and every line it gives the counterpart is marked
// as simulated — a possibility to practise against, not a prediction of what
// a real person will say. The person can pause, step back to any line and
// try it another way (a branch — nothing is lost), and change how hard the
// counterpart pushes back.
//
// Feedback is OBSERVABLE, never psychological: counts of what was actually
// said — questions asked, specifics given, words that soften a request,
// reasons offered, how much each side said, which of their own aims they
// have said out loud, questions from the other side their next line did not
// touch. No score, no judgment of how it went, no reading of anyone's mind.
//
// PURE.

import type { Part, ViewDecl } from './core';
import { register } from './core';
import {
  cleanBy,
  cleanId,
  cleanText,
  displayKind,
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
import { cleanLinks, contentWords, linkOps, overlap, REASONING_VERSION, type Basis, type Link } from './reasoning';

export type RehearsalView = 'setup' | 'room' | 'review';
export type Difficulty = 'gentle' | 'realistic' | 'tough';
export type Who = 'you' | 'them';

export interface Counterpart {
  /** what the person calls them — optional */
  name: string;
  /** who they are to the person: "my manager", "my landlord" */
  role: string;
  /** what the person told Socria about them — the person's description, never Socria's reading */
  about: string;
}
export interface Objective {
  id: string;
  text: string;
  by: By;
  /** the person's own call that they got it across */
  met?: boolean;
}
export interface Turn {
  id: string;
  branch: string;
  who: Who;
  text: string;
  by: By;
  /** the person's line: stated; the counterpart's line Socria gave: simulated; one the person scripted for them: stated */
  basis: Basis;
}
export interface Branch {
  id: string;
  label: string;
  /** the line of the branch it was tried from — the conversation up to and including it is shared */
  from?: { branch: string; turn: string };
}
export interface Hint {
  id: string;
  /** the line it is about */
  turn?: string;
  /** a way the person might put something — Socria's, offered, never inserted as theirs */
  text: string;
  by: By;
}

export interface RehearsalState extends DisplayHead {
  version: number;
  view: RehearsalView;
  goal: string;
  goalBy: By;
  situation: string;
  situationBy: By;
  counterpart: Counterpart;
  counterpartBy: By;
  difficulty: Difficulty;
  objectives: Objective[];
  turns: Turn[];
  branches: Branch[];
  current: string;
  paused: boolean;
  hints: Hint[];
  /** the person's own look back — in their words */
  reflection: { went?: string; change?: string; next?: string };
  links: Link[];
}

export const REHEARSAL_LIMITS = { turns: 80, branches: 6, objectives: 6, hints: 30, line: 600, text: 240, long: 400, name: 60 } as const;
const L = REHEARSAL_LIMITS;
const DIFFICULTIES: Difficulty[] = ['gentle', 'realistic', 'tough'];
const VIEWS: RehearsalView[] = ['setup', 'room', 'review'];
export const DIFFICULTY_WORD: Record<Difficulty, string> = { gentle: 'Gentle — open to it', realistic: 'Realistic — some pushback', tough: 'Tough — hard to persuade' };
export const REFLECT_PROMPTS = [
  { id: 'went', ask: 'What went the way you wanted?' },
  { id: 'change', ask: 'What would you say differently?' },
  { id: 'next', ask: 'What will you do before the real conversation?' },
] as const;
type ReflectField = (typeof REFLECT_PROMPTS)[number]['id'];

// ── canonical state ──────────────────────────────────────────────────

const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

export function sanitizeRehearsal(raw: unknown): RehearsalState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const cp = obj(r.counterpart) ?? {};
  const branches: Branch[] = [];
  const bIds = new Set<string>();
  for (const x of arr(r.branches)) {
    if (branches.length >= L.branches) break;
    const o = obj(x);
    let id = cleanId(o?.id);
    if (!id || bIds.has(id)) id = nextId('b', bIds);
    const from = obj(o?.from);
    bIds.add(id);
    branches.push({
      id,
      label: cleanText(o?.label, L.name) || (branches.length ? `Take ${branches.length + 1}` : 'First take'),
      ...(from && typeof from.branch === 'string' && typeof from.turn === 'string' ? { from: { branch: from.branch, turn: from.turn } } : {}),
    });
  }
  if (!branches.length) {
    branches.push({ id: 'b1', label: 'First take' });
    bIds.add('b1');
  }
  const turns: Turn[] = [];
  const tIds = new Set<string>();
  for (const x of arr(r.turns)) {
    if (turns.length >= L.turns) break;
    const o = obj(x);
    const text = cleanText(o?.text, L.line);
    const branch = typeof o?.branch === 'string' && bIds.has(o.branch) ? o.branch : null;
    if (!text || !branch || (o?.who !== 'you' && o?.who !== 'them')) continue;
    let id = cleanId(o?.id);
    if (!id || tIds.has(id)) id = nextId('u', tIds);
    tIds.add(id);
    let by = cleanBy(o?.by);
    // the person's lines are the person's: a "you" line Socria wrote is not kept as one
    if (o.who === 'you' && by !== 'person') continue;
    if (o.who === 'you') by = 'person';
    turns.push({ id, branch, who: o.who, text, by, basis: by === 'person' ? 'stated' : 'simulated' });
  }
  // a branch is tried from a line of the branch it came from — or it starts afresh
  for (const b of branches) {
    if (b.from && !(bIds.has(b.from.branch) && b.from.branch !== b.id && turns.some((t) => t.id === b.from!.turn && t.branch === b.from!.branch))) delete b.from;
  }
  // no branch descends from itself
  for (const b of branches) {
    const seen = new Set<string>([b.id]);
    let at = b.from?.branch;
    while (at) {
      if (seen.has(at)) {
        delete b.from;
        break;
      }
      seen.add(at);
      at = branches.find((x) => x.id === at)?.from?.branch;
    }
  }
  const objectives: Objective[] = [];
  const oIds = new Set<string>();
  for (const x of arr(r.objectives)) {
    if (objectives.length >= L.objectives) break;
    const o = obj(x);
    const text = cleanText(o?.text ?? (typeof x === 'string' ? x : ''), L.text);
    if (!text) continue;
    let id = cleanId(o?.id);
    if (!id || oIds.has(id) || tIds.has(id)) id = nextId('o', [...oIds, ...tIds]);
    oIds.add(id);
    objectives.push({ id, text, by: cleanBy(o?.by), ...(typeof o?.met === 'boolean' ? { met: o.met } : {}) });
  }
  const hints: Hint[] = [];
  for (const x of arr(r.hints)) {
    if (hints.length >= L.hints) break;
    const o = obj(x);
    const text = cleanText(o?.text, L.long);
    if (!text) continue;
    let id = cleanId(o?.id);
    const taken = new Set([...tIds, ...oIds, ...hints.map((h) => h.id)]);
    if (!id || taken.has(id)) id = nextId('h', taken);
    const turn = typeof o?.turn === 'string' && tIds.has(o.turn) ? o.turn : undefined;
    hints.push({ id, ...(turn ? { turn } : {}), text, by: cleanBy(o?.by) });
  }
  const rf = obj(r.reflection) ?? {};
  const reflection: RehearsalState['reflection'] = {};
  for (const p of REFLECT_PROMPTS) {
    const t = cleanText(rf[p.id], L.long);
    if (t) reflection[p.id] = t;
  }
  const current = typeof r.current === 'string' && bIds.has(r.current) ? r.current : branches[0].id;
  return {
    title: cleanText(r.title, 80) || 'Rehearsal',
    version: REASONING_VERSION,
    view: VIEWS.includes(r.view as RehearsalView) ? (r.view as RehearsalView) : 'setup',
    goal: cleanText(r.goal, L.text),
    goalBy: cleanBy(r.goalBy),
    situation: cleanText(r.situation, L.long),
    situationBy: cleanBy(r.situationBy),
    counterpart: { name: cleanText(cp.name, L.name), role: cleanText(cp.role, L.name), about: cleanText(cp.about, L.long) },
    counterpartBy: cleanBy(r.counterpartBy),
    difficulty: DIFFICULTIES.includes(r.difficulty as Difficulty) ? (r.difficulty as Difficulty) : 'realistic',
    objectives,
    turns,
    branches,
    current,
    paused: r.paused === true,
    hints,
    reflection,
    links: cleanLinks(r.links),
  };
}

// ── what is computed ─────────────────────────────────────────────────

/** The conversation as one branch has it: what it shares with the branch it was tried from, then its own lines. */
export function lineOf(s: RehearsalState, branch = s.current): Turn[] {
  const b = s.branches.find((x) => x.id === branch);
  if (!b) return [];
  const own = s.turns.filter((t) => t.branch === branch);
  if (!b.from) return own;
  const parent = lineOf(s, b.from.branch);
  const cut = parent.findIndex((t) => t.id === b.from!.turn);
  return [...(cut >= 0 ? parent.slice(0, cut + 1) : parent), ...own];
}

/** Whose turn it is on a branch: the person's when nothing is said or the counterpart spoke last. */
export function whoseTurn(s: RehearsalState, branch = s.current): Who {
  const line = lineOf(s, branch);
  return line.length && line[line.length - 1].who === 'you' ? 'them' : 'you';
}

const HEDGES: [RegExp, string][] = [
  [/\bjust\b/g, 'just'],
  [/\bsorry\b/g, 'sorry'],
  [/\bmaybe\b/g, 'maybe'],
  [/\bi (?:think|guess|suppose)\b/g, 'I think / I guess'],
  [/\b(?:kind|sort) of\b/g, 'kind of / sort of'],
  [/\bi was (?:just )?wondering\b/g, 'I was wondering'],
  [/\bif (?:that'?s|it'?s|that is|it is) (?:ok|okay|alright|all right)\b/g, 'if that’s okay'],
  [/\bpossibly\b/g, 'possibly'],
  [/\ba (?:little|bit)\b/g, 'a little / a bit'],
  [/\bhopefully\b/g, 'hopefully'],
];
const REASONS = /\b(?:because|since|so that|which means|that'?s why|the reason)\b/g;
const SPECIFIC = /(?:[$€£]\s?\d|\d+(?:[.,]\d+)?\s?(?:%|percent|k\b|hours?|days?|weeks?|months?|years?|dollars?)|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,4}\b)/gi;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

export interface Feedback {
  lines: number;
  /** of the person's lines, how many asked a question */
  questions: number;
  /** specifics they gave: amounts, dates, numbers */
  specifics: string[];
  /** words that soften a request, with how often */
  softeners: { word: string; n: number }[];
  /** times they gave a reason ("because", "so that") */
  reasons: number;
  /** words each side said */
  balance: { you: number; them: number };
  /** the counterpart's questions, and whether the person's next line shares any words with each */
  theirQuestions: { text: string; touched: boolean }[];
  /** their own aims, and whether something they said shares most of its words */
  objectives: { id: string; text: string; said: boolean; met?: boolean }[];
}

/** Counts of what was said on a branch — observable, never a judgment of how it went or of anyone. */
export function feedback(s: RehearsalState, branch = s.current): Feedback {
  const line = lineOf(s, branch);
  const mine = line.filter((t) => t.who === 'you');
  const all = mine.map((t) => t.text).join('\n');
  const low = all.toLowerCase().replace(/[’]/g, "'");
  const softeners = HEDGES.map(([rx, word]) => ({ word, n: (low.match(rx) ?? []).length })).filter((x) => x.n > 0);
  const specifics = [...new Set((all.match(SPECIFIC) ?? []).map((x) => x.trim()))].slice(0, 12);
  const theirQuestions: Feedback['theirQuestions'] = [];
  line.forEach((t, i) => {
    if (t.who !== 'them' || !/\?/.test(t.text)) return;
    const reply = line.slice(i + 1).find((x) => x.who === 'you');
    if (!reply) return;
    const q = t.text.split(/(?<=[.!?])\s+/).filter((x) => x.includes('?')).pop() ?? t.text;
    theirQuestions.push({ text: q, touched: contentWords(q).size === 0 || overlap(reply.text, q) > 0 });
  });
  return {
    lines: mine.length,
    questions: mine.filter((t) => t.text.includes('?')).length,
    specifics,
    softeners,
    reasons: (low.match(REASONS) ?? []).length,
    balance: { you: mine.reduce((n, t) => n + words(t.text), 0), them: line.filter((t) => t.who === 'them').reduce((n, t) => n + words(t.text), 0) },
    theirQuestions,
    objectives: s.objectives.map((o) => ({ id: o.id, text: o.text, said: mine.some((t) => overlap(t.text, o.text) >= 0.5), ...(o.met !== undefined ? { met: o.met } : {}) })),
  };
}

// ── operations ───────────────────────────────────────────────────────

const views: ViewDecl<RehearsalState>[] = [
  { id: 'setup', label: 'Set up', shows: 'what you want from the conversation, the situation, who it is with, and how hard they push back', primary: true, interactions: ['say what you want', 'describe them', 'choose how hard'] },
  { id: 'room', label: 'Rehearse', shows: 'the conversation, line by line — yours in your words, theirs simulated', interactions: ['say your line', 'pause', 'try a line another way'] },
  {
    id: 'review',
    label: 'Look back',
    shows: 'what was actually said, counted, every take side by side, and your own reflection',
    interactions: ['compare takes', 'reflect'],
    unavailable: (s) => (s.turns.some((t) => t.who === 'you') ? null : 'Say something in the rehearsal first.'),
  },
];

type S = RehearsalState;
const withS = (s: S, patch: Partial<S>): S => sanitizeRehearsal({ ...s, ...patch }) ?? s;
const allIds = (s: S) => [...s.turns.map((t) => t.id), ...s.objectives.map((o) => o.id), ...s.hints.map((h) => h.id)];
const yours = (ctx: Ctx, what: string): string | null => (ctx?.by === 'socria' ? `${what} — only you do that.` : null);

const SETUP_FIELDS = ['goal', 'situation', 'name', 'role', 'about'] as const;

export const REHEARSAL_OPS = {
  ...headOps<S>(views, sanitizeRehearsal),
  setup: op<S>(
    'Set up',
    (s, a, ctx) => {
      if (!SETUP_FIELDS.some((f) => a[f] !== undefined) && a.difficulty === undefined) return 'Say what to set.';
      for (const f of SETUP_FIELDS) if (a[f] !== undefined && typeof a[f] !== 'string') return 'Say it in words.';
      if (typeof a.goal === 'string' && a.goal.length > L.text) return `Say what you want in ${L.text} characters or fewer.`;
      if (a.difficulty !== undefined && !DIFFICULTIES.includes(a.difficulty as Difficulty)) return 'Gentle, realistic or tough.';
      if (ctx?.by === 'socria') {
        if (a.difficulty !== undefined) return 'How hard they push back is yours to choose.';
        if (a.goal !== undefined && s.goalBy === 'person' && s.goal) return 'What you want from it is in your words — Socria does not rewrite it.';
        if (a.situation !== undefined && s.situationBy === 'person' && s.situation) return 'The situation is in your words — Socria does not rewrite it.';
        if ((a.name !== undefined || a.role !== undefined || a.about !== undefined) && s.counterpartBy === 'person') return 'You described who it is with — Socria does not change that.';
      }
      return guardBy(a, ctx);
    },
    (s, a) => {
      const person = a.by === 'person';
      return withS(s, {
        ...(a.goal !== undefined ? { goal: cleanText(a.goal, L.text), goalBy: person ? 'person' : 'socria' } : {}),
        ...(a.situation !== undefined ? { situation: cleanText(a.situation, L.long), situationBy: person ? 'person' : 'socria' } : {}),
        ...(a.name !== undefined || a.role !== undefined || a.about !== undefined
          ? {
              counterpart: {
                name: a.name !== undefined ? cleanText(a.name, L.name) : s.counterpart.name,
                role: a.role !== undefined ? cleanText(a.role, L.name) : s.counterpart.role,
                about: a.about !== undefined ? cleanText(a.about, L.long) : s.counterpart.about,
              },
              counterpartBy: person ? 'person' : s.counterpartBy,
            }
          : {}),
        ...(a.difficulty !== undefined ? { difficulty: a.difficulty as Difficulty } : {}),
      });
    },
    (a) => (a.difficulty !== undefined ? `pushback: ${String(a.difficulty)}` : 'set up')
  ),
  addObjective: op<S>(
    'Add something to get across',
    (s, a, ctx) =>
      (cleanText(a.text, L.text) ? null : 'Say what you want to get across.') ??
      (s.objectives.length >= L.objectives ? `A rehearsal holds ${L.objectives} aims.` : null) ??
      guardBy(a, ctx),
    (s, a) => withS(s, { objectives: [...s.objectives, { id: nextId('o', allIds(s)), text: cleanText(a.text, L.text), by: cleanBy(a.by) }] }),
    (a) => `aim: “${cleanText(a.text, 60)}”`
  ),
  removeObjective: op<S>(
    'Remove an aim',
    (s, a, ctx) => {
      const o = s.objectives.find((x) => x.id === a.id);
      return o ? guardOwn(o, ctx, 'That aim') : 'There is no such aim.';
    },
    (s, a) => withS(s, { objectives: s.objectives.filter((o) => o.id !== a.id) }),
    () => 'removed an aim'
  ),
  met: op<S>(
    'Got it across',
    (s, a, ctx) => (s.objectives.some((o) => o.id === a.id) ? null : 'There is no such aim.') ?? (a.ok === 'yes' || a.ok === 'no' || a.ok === '' ? null : 'Yes, no, or not said.') ?? yours(ctx, 'Saying whether you got it across'),
    (s, a) => withS(s, { objectives: s.objectives.map((o) => (o.id === a.id ? { ...o, met: a.ok === '' ? undefined : a.ok === 'yes' } : o)) }),
    (a) => (a.ok === 'yes' ? 'got it across' : a.ok === 'no' ? 'not yet across' : 'cleared')
  ),
  say: op<S>(
    'Say a line',
    (s, a, ctx) => {
      if (a.who !== 'you' && a.who !== 'them') return 'Say whose line it is.';
      if (!cleanText(a.text, L.line)) return 'Say the line.';
      if (typeof a.text === 'string' && a.text.length > L.line) return `A line is at most ${L.line} characters.`;
      if (a.who === 'you' && ctx?.by === 'socria') return 'Your lines are yours to write — Socria only plays the other side.';
      if (s.paused) return 'The rehearsal is paused — carry on when you are ready.';
      if (s.turns.length >= L.turns) return 'This rehearsal is as long as one can be — start a new take from an earlier line.';
      return guardBy(a, ctx);
    },
    (s, a) => {
      const by: By = a.who === 'you' ? 'person' : cleanBy(a.by);
      return withS(s, { turns: [...s.turns, { id: nextId('u', allIds(s)), branch: s.current, who: a.who as Who, text: cleanText(a.text, L.line), by, basis: by === 'person' ? 'stated' : 'simulated' }] });
    },
    (a) => (a.who === 'you' ? `you: “${cleanText(a.text, 60)}”` : `them (${a.by === 'person' ? 'as you scripted it' : 'simulated'}): “${cleanText(a.text, 60)}”`)
  ),
  reword: op<S>(
    'Reword your line',
    (s, a, ctx) => {
      const t = s.turns.find((x) => x.id === a.id);
      if (!t) return 'There is no such line.';
      if (!cleanText(a.text, L.line)) return 'Say the line.';
      return guardOwn(t, ctx, 'That line');
    },
    (s, a) => withS(s, { turns: s.turns.map((t) => (t.id === a.id ? { ...t, text: cleanText(a.text, L.line), ...(a.by === 'person' ? { by: 'person' as By, basis: 'stated' as Basis } : {}) } : t)) }),
    () => 'reworded a line'
  ),
  retract: op<S>(
    'Take back the last line',
    (s, _a, ctx) => {
      const own = s.turns.filter((t) => t.branch === s.current);
      if (!own.length) return 'There is no line on this take to take back.';
      return guardOwn(own[own.length - 1], ctx, 'That line');
    },
    (s) => {
      const own = s.turns.filter((t) => t.branch === s.current);
      const last = own[own.length - 1];
      // a take started from this line keeps its own start: it is not taken back with it
      if (s.branches.some((b) => b.from?.turn === last.id)) return withS(s, { turns: s.turns.filter((t) => t.id !== last.id) });
      return withS(s, { turns: s.turns.filter((t) => t.id !== last.id), hints: s.hints.filter((h) => h.turn !== last.id) });
    },
    () => 'took back the last line'
  ),
  branch: op<S>(
    'Try it another way',
    (s, a, ctx) => {
      if (s.branches.length >= L.branches) return `A rehearsal keeps ${L.branches} takes.`;
      if (a.after !== '' && !lineOf(s).some((t) => t.id === a.after)) return 'Choose a line of this take to try again from.';
      return yours(ctx, 'Starting another take');
    },
    (s, a) => {
      const id = nextId('b', s.branches.map((b) => b.id));
      const line = lineOf(s);
      const after = line.find((t) => t.id === a.after);
      const from = after ? { branch: after.branch, turn: after.id } : undefined;
      return withS(s, { branches: [...s.branches, { id, label: cleanText(a.label, L.name) || `Take ${s.branches.length + 1}`, ...(from ? { from } : {}) }], current: id, paused: false });
    },
    (a) => (a.after ? 'started another take from that line' : 'started a new take from the beginning')
  ),
  switchTo: op<S>(
    'Go to a take',
    (s, a, ctx) => (s.branches.some((b) => b.id === a.branch) ? null : 'There is no such take.') ?? (a.branch === s.current ? 'You are on that take.' : null) ?? yours(ctx, 'Choosing a take'),
    (s, a) => withS(s, { current: String(a.branch) }),
    () => 'went to another take'
  ),
  renameTake: op<S>(
    'Name a take',
    (s, a, ctx) => (s.branches.some((b) => b.id === a.branch) ? null : 'There is no such take.') ?? (cleanText(a.label, L.name) ? null : 'Name it.') ?? yours(ctx, 'Naming a take'),
    (s, a) => withS(s, { branches: s.branches.map((b) => (b.id === a.branch ? { ...b, label: cleanText(a.label, L.name) } : b)) }),
    (a) => `named a take “${cleanText(a.label, L.name)}”`
  ),
  pause: op<S>(
    'Pause',
    (s, a, ctx) => (a.on === 'yes' || a.on === 'no' ? null : 'Pause or carry on.') ?? (s.paused === (a.on === 'yes') ? (s.paused ? 'It is paused.' : 'It is going.') : null) ?? yours(ctx, 'Pausing'),
    (s, a) => withS(s, { paused: a.on === 'yes' }),
    (a) => (a.on === 'yes' ? 'paused' : 'carried on')
  ),
  hint: op<S>(
    'Offer another way to say it',
    (s, a, ctx) =>
      (cleanText(a.text, L.long) ? null : 'Say it.') ??
      (a.turn !== undefined && a.turn !== '' && !s.turns.some((t) => t.id === a.turn) ? 'There is no such line.' : null) ??
      (s.hints.length >= L.hints ? 'There are as many suggestions here as it keeps.' : null) ??
      guardBy(a, ctx),
    (s, a) => withS(s, { hints: [...s.hints, { id: nextId('h', allIds(s)), ...(a.turn ? { turn: String(a.turn) } : {}), text: cleanText(a.text, L.long), by: cleanBy(a.by) }] }),
    () => 'offered another way to say it'
  ),
  removeHint: op<S>(
    'Dismiss a suggestion',
    (s, a) => (s.hints.some((h) => h.id === a.id) ? null : 'There is no such suggestion.'),
    (s, a) => withS(s, { hints: s.hints.filter((h) => h.id !== a.id) }),
    () => 'dismissed a suggestion'
  ),
  reflect: op<S>(
    'Reflect',
    (_s, a, ctx) => (REFLECT_PROMPTS.some((p) => p.id === a.field) ? null : 'There is no such question.') ?? (typeof a.text === 'string' && a.text.length > L.long ? `Say it in ${L.long} characters or fewer.` : null) ?? yours(ctx, 'Your reflection'),
    (s, a) => {
      const reflection = { ...s.reflection };
      const t = cleanText(a.text, L.long);
      if (t) reflection[a.field as ReflectField] = t;
      else delete reflection[a.field as ReflectField];
      return withS(s, { reflection });
    },
    (a) => (cleanText(a.text, L.long) ? 'reflected' : 'cleared a reflection')
  ),
  ...linkOps<S>(sanitizeRehearsal),
};

// ── words → an operation ─────────────────────────────────────────────

export function readRehearsalOp(text: string, s: S): { op: string; args: Args } | null {
  const t = text.trim().replace(/[.!]+$/, '').toLowerCase();
  if (!t || t.length > 200) return null;
  if (/^(?:pause|pause (?:it|the rehearsal)|hold on|stop for a (?:moment|second))$/.test(t) && !s.paused) return { op: 'pause', args: { on: 'yes' } };
  if (/^(?:resume|carry on|continue|keep going|unpause)(?: the rehearsal)?$/.test(t) && s.paused) return { op: 'pause', args: { on: 'no' } };
  if (/^make (?:it|them|him|her) (?:tougher|harder|more difficult|push back more)$/.test(t)) return s.difficulty === 'tough' ? null : { op: 'setup', args: { difficulty: s.difficulty === 'gentle' ? 'realistic' : 'tough', by: 'person' } };
  if (/^make (?:it|them|him|her) (?:gentler|easier|softer|push back less)$/.test(t)) return s.difficulty === 'gentle' ? null : { op: 'setup', args: { difficulty: s.difficulty === 'tough' ? 'realistic' : 'gentle', by: 'person' } };
  if (/^(?:start over|start again|new take|try it again from the (?:start|beginning))$/.test(t)) return { op: 'branch', args: { after: '' } };
  return null;
}

// ── the kind ─────────────────────────────────────────────────────────

const whoThey = (s: S) => s.counterpart.name || s.counterpart.role || 'the other person';

function factsOf(s: S): string[] {
  const line = lineOf(s);
  const out = [
    `${s.title}: the person is rehearsing a conversation with ${whoThey(s)}${s.goal ? ` — what they want from it: “${s.goal}”` : ''}. Pushback: ${s.difficulty}.`,
    'Socria plays only the other side; its lines are simulated possibilities, not predictions of what the real person will say.',
  ];
  if (line.length) {
    const f = feedback(s);
    out.push(`This take: ${f.lines} line${f.lines === 1 ? '' : 's'} from the person, ${line.length - f.lines} from the other side. Counts: ${f.questions} question${f.questions === 1 ? '' : 's'} asked, ${f.reasons} reason${f.reasons === 1 ? '' : 's'} given, ${f.specifics.length} specific${f.specifics.length === 1 ? '' : 's'}.`);
    const unsaid = f.objectives.filter((o) => !o.said);
    if (unsaid.length) out.push(`Aims not yet said out loud: ${unsaid.map((o) => o.text).join('; ')}.`);
  }
  if (s.branches.length > 1) out.push(`${s.branches.length} takes so far.`);
  if (s.paused) out.push('Paused.');
  return out;
}

function textOf(s: S): string {
  const lines = [`REHEARSAL “${s.title}” with ${whoThey(s)}${s.counterpart.role && s.counterpart.name ? ` (${s.counterpart.role})` : ''}`];
  if (s.goal) lines.push(`Wants: ${s.goal}${s.goalBy === 'socria' ? ' (Socria’s wording)' : ''}`);
  if (s.situation) lines.push(`Situation: ${s.situation}`);
  if (s.counterpart.about) lines.push(`They said of them: ${s.counterpart.about}`);
  for (const o of s.objectives) lines.push(`Aim: ${o.text}`);
  for (const t of lineOf(s)) lines.push(`${t.who === 'you' ? 'THE PERSON' : `${whoThey(s).toUpperCase()} (${t.by === 'socria' ? 'simulated' : 'scripted by the person'})`}: ${t.text}`);
  return lines.join('\n').slice(0, 2600);
}

export const REHEARSAL = displayKind<S>({
  kind: 'rehearsal',
  label: 'Rehearsal Room',
  sanitize: sanitizeRehearsal,
  ops: REHEARSAL_OPS,
  readOp: readRehearsalOp,
  consequence: (before, after, step) => {
    if (step.op === 'branch') return 'A new take. The earlier one is kept — go back to it any time.';
    if (step.op !== 'say' || step.args.who !== 'you') return null;
    const a = feedback(before).objectives.filter((o) => o.said).length;
    const b = feedback(after).objectives.filter((o) => o.said).length;
    return b > a ? 'One of your aims is now said out loud — whether it landed is yours to judge.' : null;
  },
  facts: (s) => factsOf(s),
  text: textOf,
  parts: (s): Part[] => [...s.objectives.map((o) => ({ id: o.id, label: o.text })), ...lineOf(s).map((t) => ({ id: t.id, label: `${t.who === 'you' ? 'You' : whoThey(s)}: ${t.text.slice(0, 60)}` }))],
  views,
  maxStates: 30,
  argLimits: { count: 12, length: L.line },
  size: (s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 720, h: Math.min(760, 420 + 18 * lineOf(s).length) }),
  shape: (s) => `rehearsal with ${whoThey(s)} · ${lineOf(s).length} line${lineOf(s).length === 1 ? '' : 's'}${s.branches.length > 1 ? ` · ${s.branches.length} takes` : ''}`,
});

// ── made from the person's words ─────────────────────────────────────

/**
 * A rehearsal set up from how the person asked for it: what they want from
 * the conversation in their own words, and who it is with as they named
 * them. Nothing about the other person is invented.
 */
export function rehearsalFromWords(said: string): RehearsalState | null {
  const t = cleanText(said, 600);
  const m =
    /\b(?:rehears(?:e|ing)|practi[cs](?:e|ing)|role[- ]?play(?:ing)?|prepare (?:me )?for|get ready for)\s+(?:for\s+)?(?:a |the |my |an )?(.+?)(?:[.?!]|$)/i.exec(t) ?? null;
  const goalRaw = m ? m[1] : '';
  const goal = cleanText(goalRaw.replace(/^(?:conversation|talk|chat)\s+(?:with|about)\s+/i, (x) => x), 240);
  const who = /\b(?:with|ask(?:ing)?|tell(?:ing)?|convince|convincing|confront(?:ing)?|negotiat(?:e|ing) with|talk(?:ing)? to)\s+(my\s+[a-z][a-z' -]{1,40}?|[A-Z][a-z]+)(?=\s+(?:for|about|that|to|if|whether|why|how|i|we)\b|[,.?!]|$)/.exec(t);
  const role = who ? cleanText(who[1].replace(/^my\s+/i, 'my '), 60) : '';
  const named = role && /^[A-Z]/.test(role) && !/^my\b/i.test(role) ? role : '';
  return sanitizeRehearsal({
    title: goal ? cleanText(goal.charAt(0).toUpperCase() + goal.slice(1), 60) : 'Rehearsal',
    view: 'setup',
    goal,
    goalBy: goal ? 'person' : 'socria',
    counterpart: { name: named, role: named ? '' : role, about: '' },
    counterpartBy: role ? 'person' : 'socria',
  });
}

export const REHEARSAL_META: DisplayMeta = {
  kind: 'rehearsal',
  noun: 'rehearsal',
  handle: 'RR',
  about: 'A conversation you are going to have, practised first: you say your lines in your own words, Socria plays the other side as a possibility to practise against, and you can pause, try a line another way, and look back at what was said.',
  called: [{ words: ['rehearsal room', 'rehearsal', 'role play', 'roleplay', 'role-play'] }],
  intents: [
    /\b(?:rehearse|role ?play|roleplay)\b/,
    /\bpracti[cs]e (?:a |the |my |an )?(?:conversation|talk|asking|telling|saying|negotiat\w*|pitch|interview|breaking up|confronting|bringing up|raise)\b/,
    /\bprepare (?:me )?for (?:a |the |my |an )?(?:hard |difficult |tough |awkward )?(?:conversation|talk|interview|negotiation|meeting) with\b/,
  ],
  experience: true,
  prompts: ['Rehearse asking my manager for a raise', 'Practice telling my roommate I’m moving out', 'Role-play a salary negotiation with a recruiter'],
  tell: () =>
    'A REHEARSAL is the person practising a real conversation. In the room Socria plays only the other side, and those lines are simulated — never present them as what the real person will say, and never write the person’s lines for them. The feedback shown is counts of what was said, not a judgment; do not psychoanalyse them or the other person. If they ask how it went, ask what they noticed first.',
};

register(REHEARSAL);
registerDisplay(REHEARSAL_META);
