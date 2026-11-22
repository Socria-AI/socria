// lib/logos6/objective.ts — ONE CHAT, ONE OBJECTIVE (Logos 6, November 2026; docs/OBJECTIVES.md).
//
// A conversation is where someone works towards something: "Master Calculus I", "Build SocriaUX", "Prepare for the
// board presentation". This module holds what that means, and nothing else holds it twice:
//   • THE OBJECTIVE itself — a few words, an outcome if one was said, where it came from (their words, Socria's
//     reading of how they began, or an older chat's title). It lives on the conversation's own map (ThinkingMap
//     .objective), so it is saved, synced and restored exactly as the map is: no new table, no new column.
//   • WHAT THE CHAT HOLDS for it, read from what is already there — the Thinking Canvas's decisions, assumptions and
//     questions, the sources brought in, the artifacts and quizzes made, the subjects within it. Derived, never
//     copied, so it cannot go stale and it is there with no model at all.
//   • WHAT CORE IS TOLD each turn: the objective and that digest, and the earlier turns of this conversation that
//     bear on the message (beyond the recent ones Core reads in full) — so a long conversation stays one piece of work
//     and nothing already said is asked for again.
//   • WHEN A MESSAGE STARTS SOMETHING ELSE: a separate objective, read cautiously, so the app can offer a new chat.
//     It is only ever an offer; nothing is split, moved or refused.
//
// Pure: no React, no DOM, no clock (times are passed in).

import { topicTitle } from '../logos5/title';
import { wordsOf } from '../logos5/linking';
import { domainsOf } from '../topic-drift';
import type { MapHistory } from '../map-history';

export const OBJECTIVE_KINDS = ['learn', 'understand', 'build', 'write', 'research', 'prepare', 'decide', 'solve', 'explore'] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];
export const KIND_SAID: Record<ObjectiveKind, string> = {
  learn: 'Learning',
  understand: 'Understanding',
  build: 'Building',
  write: 'Writing',
  research: 'Researching',
  prepare: 'Preparing',
  decide: 'Deciding',
  solve: 'Solving',
  explore: 'Exploring',
};

export const NOTE_KINDS = ['fact', 'decision', 'assumption', 'question', 'preference', 'milestone'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
/** Something the person asked to keep with the objective ("keep in mind that the exam is open-book"). */
export interface ObjectiveNote {
  k: NoteKind;
  t: string;
  at: number;
}

/** A step on the way to the objective: added and ticked off by the person, never by Socria. */
export interface Milestone {
  t: string;
  done?: true;
  at: number;
}

export type ObjectiveSource = 'stated' | 'inferred' | 'title';
export const SOURCE_SAID: Record<ObjectiveSource, string> = {
  stated: 'set by you',
  inferred: 'read from how this chat began',
  title: 'from this chat’s name',
};

export interface Objective {
  /** what they are working towards, in a few words: "Master Calculus I" */
  goal: string;
  /** the outcome they want, when they said one: "pass the final in December" */
  outcome?: string;
  kind?: ObjectiveKind;
  /** their words (stated), Socria's reading of how the chat began (inferred), or an older chat's name (title) */
  source: ObjectiveSource;
  /** subjects that belong to it: derivatives, integrals — read from the work, or kept by them ("Keep it here") */
  threads?: string[];
  /** what they asked to keep in mind for it */
  notes?: ObjectiveNote[];
  /** steps on the way, theirs to add and to tick off (the Omnibox: "Milestone: finish chapter 5") */
  milestones?: Milestone[];
  set: number;
  edited?: number;
}

export const OBJECTIVE_LIMITS = { goal: 100, outcome: 220, threads: 12, thread: 60, notes: 20, note: 220, milestones: 12, milestone: 120 } as const;

const clean = (v: unknown, n: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, n)
        .trim()
    : '';
const when = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e13 ? Math.round(v) : 0);

/** An objective as stored or sent: shaped, clipped, bounded; null when it has no goal. */
export function sanitizeObjective(raw: unknown): Objective | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const goal = clean(r.goal, OBJECTIVE_LIMITS.goal);
  if (goal.length < 2) return null;
  const outcome = clean(r.outcome, OBJECTIVE_LIMITS.outcome);
  const kind = OBJECTIVE_KINDS.includes(r.kind as ObjectiveKind) ? (r.kind as ObjectiveKind) : undefined;
  const source: ObjectiveSource = r.source === 'stated' || r.source === 'title' ? r.source : 'inferred';
  const threads = Array.isArray(r.threads)
    ? [...new Set(r.threads.map((t) => clean(t, OBJECTIVE_LIMITS.thread).toLowerCase()).filter((t) => t.length > 1))].slice(0, OBJECTIVE_LIMITS.threads)
    : [];
  const notes = Array.isArray(r.notes)
    ? r.notes
        .map((n) => {
          const o = n && typeof n === 'object' ? (n as Record<string, unknown>) : {};
          const t = clean(o.t, OBJECTIVE_LIMITS.note);
          const k = NOTE_KINDS.includes(o.k as NoteKind) ? (o.k as NoteKind) : 'fact';
          return t ? { k, t, at: when(o.at) } : null;
        })
        .filter((n): n is ObjectiveNote => !!n)
        .slice(-OBJECTIVE_LIMITS.notes)
    : [];
  const milestones = Array.isArray(r.milestones)
    ? r.milestones
        .map((m) => {
          const o = m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
          const t = clean(o.t, OBJECTIVE_LIMITS.milestone);
          return t ? { t, ...(o.done === true ? { done: true as const } : {}), at: when(o.at) } : null;
        })
        .filter((m): m is Milestone => !!m)
        .slice(0, OBJECTIVE_LIMITS.milestones)
    : [];
  const set = when(r.set);
  const edited = when(r.edited);
  return {
    goal,
    ...(outcome ? { outcome } : {}),
    ...(kind ? { kind } : {}),
    source,
    ...(threads.length ? { threads } : {}),
    ...(notes.length ? { notes } : {}),
    ...(milestones.length ? { milestones } : {}),
    set,
    ...(edited ? { edited } : {}),
  };
}

// ── reading an objective from how a chat begins ─────────────────────

const VERB_KIND: [RegExp, ObjectiveKind][] = [
  [/^(?:master|learn|study|revise|review|practi[cs]e|memori[sz]e|get better at|get good at|improve (?:my|at))\b/i, 'learn'],
  [/^(?:understand|figure out|make sense of|get my head around|wrap my head around|grasp)\b/i, 'understand'],
  [/^(?:build|make|create|design|develop|code|ship|launch|set up|start)\b/i, 'build'],
  [/^(?:write|draft|edit|rewrite|outline)\b/i, 'write'],
  [/^(?:research|investigate|look into|compare|analy[sz]e|explore the research)\b/i, 'research'],
  [/^(?:prepare|prep|get ready|plan|organi[sz]e)\b/i, 'prepare'],
  [/^(?:decide|choose|pick|weigh|work out whether)\b/i, 'decide'],
  [/^(?:fix|debug|solve|resolve|troubleshoot)\b/i, 'solve'],
];

// "I want to master calculus", "help me prepare for my presentation", "my goal is to ship SocriaUX"
const STATED = [
  /\b(?:my (?:goal|objective|aim) (?:is|here is) to|the (?:goal|objective|aim) (?:is|here is) to|i(?:'m| am) (?:trying|hoping|aiming|working|preparing|studying|getting ready) (?:to|for|on)|i (?:want|need|would like|'d like|hope|plan|intend|have) to|help me(?: to)?|can you help me(?: to)?|could you help me(?: to)?|i(?:'m| am) here to|let(?:'s| us)|we need to|i(?:'ve| have) got to)\s+(.{3,120})/i,
  /^(?:objective|goal|aim)\s*[:\-–]\s*(.{3,120})/i,
];

const TAIL_CUT = /\s+(?:so (?:that|i)|because|but|since|as i|which|and (?:i|then)|before (?:my|the|next|this)|by (?:next|this|the end)|(?:on|by|this|next) (?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|tonight|today|this (?:week|weekend|month|term|semester)|next (?:week|month|term)|asap|please|thanks|thank you)\b.*$/i;

/** The few words that name what they want, cut where the sentence moves on. */
function phraseOf(s: string): string {
  let p = s
    .split(/[.!?;\n]|,\s(?=(?:and|but|so|because|i|it|which)\b)/i)[0]
    .replace(TAIL_CUT, '')
    .replace(/\s+(?:with|for) (?:me|this|it)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = p.split(' ');
  if (words.length > 9) p = words.slice(0, 9).join(' ');
  return p.replace(/[,:;\-–]+$/, '').trim();
}

const kindOf = (phrase: string): ObjectiveKind | undefined => VERB_KIND.find(([re]) => re.test(phrase))?.[1];

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * What a chat is for, read from its first message: a goal they stated ("help me prepare for the board presentation"
 * → "Prepare for the board presentation"), or else what it is about ("Why is the PPF bowed out?" → its topic, as
 * understanding). Null when there is nothing to read. Never more than their words say.
 */
export function inferObjective(text: string, now: number): Objective | null {
  const t = String(text ?? '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[`*_#>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  if (!t) return null;
  for (const re of STATED) {
    const m = t.match(re);
    if (!m) continue;
    let phrase = phraseOf(m[1]).replace(/^(?:to|with|on|for)\s+/i, '');
    // "help me with my calculus homework" names a subject, not a verb: work on it
    if (/^(?:with|on)\s/i.test(m[1]) && !kindOf(phrase)) phrase = `Work on ${phrase}`;
    if (phrase.split(' ').length < 2 && !kindOf(phrase)) continue;
    const kind = kindOf(phrase) ?? (/\b(?:exam|test|final|midterm|interview|presentation|pitch)\b/i.test(phrase) ? 'prepare' : undefined);
    if (phrase.length >= 4) return { goal: cap(phrase).slice(0, OBJECTIVE_LIMITS.goal), ...(kind ? { kind } : {}), source: 'inferred', set: now };
  }
  // a leading imperative: "Build a landing page for SocriaUX", "Explain derivatives to me"
  const lead = phraseOf(t);
  const leadKind = kindOf(lead);
  if (leadKind && lead.split(' ').length >= 2) return { goal: cap(lead).slice(0, OBJECTIVE_LIMITS.goal), kind: leadKind, source: 'inferred', set: now };
  // otherwise: what it is about
  const topic = topicTitle(t);
  if (!topic) return null;
  const asks = /\?|^(?:why|how|what|when|where|who|which|is|are|does|do|can|explain)\b/i.test(t);
  return { goal: topic, kind: asks ? 'understand' : 'explore', source: 'inferred', set: now };
}

/** A goal the model phrased (after the first reply): held to the same limits; null when it is not a goal. */
export function acceptGoal(suggested: unknown): string | null {
  const g = clean(typeof suggested === 'string' ? suggested.replace(/["“”]/g, '').replace(/[.!?]+$/, '') : '', OBJECTIVE_LIMITS.goal);
  if (g.length < 4 || g.split(' ').length > 12) return null;
  if (/^(?:none|n\/a|unknown|null|general|chat|conversation|question)$/i.test(g)) return null;
  return cap(g);
}

interface SessionLike {
  title?: string;
  messages: readonly { role: string; content?: unknown }[];
  map?: { objective?: unknown } | null;
}

/**
 * The objective of a chat as it stands: the one it holds; or, for a chat from before objectives (or one not yet
 * saved with one), read from its first message, else its own name. Null for an empty, untitled chat: nothing is
 * made up.
 */
export function objectiveOf(s: SessionLike, now: number, untitled = 'New line of thinking'): Objective | null {
  const held = sanitizeObjective(s.map?.objective);
  if (held) return held;
  const first = s.messages.find((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim());
  const read = first ? inferObjective(String(first.content), now) : null;
  if (read) return read;
  const title = clean(s.title, OBJECTIVE_LIMITS.goal);
  if (title && title !== untitled) return { goal: title, source: 'title', set: now };
  return null;
}

/** Socria's better phrasing of an objective it read (after the first reply): only while it is still its reading. */
export function refineGoal(o: Objective, goal: string): Objective {
  if (o.source !== 'inferred' || o.edited) return o;
  const g = acceptGoal(goal);
  return g ? { ...o, goal: g, kind: kindOf(g) ?? o.kind } : o;
}

/** The objective changed by the person: their words, kept as theirs from now on. */
export function restate(prev: Objective | null, goal: string, now: number, outcome?: string): Objective | null {
  const g = clean(goal, OBJECTIVE_LIMITS.goal);
  if (g.length < 2) return null;
  const kind = kindOf(g);
  return {
    ...(prev ?? {}),
    goal: cap(g),
    ...(outcome !== undefined ? { outcome: clean(outcome, OBJECTIVE_LIMITS.outcome) || undefined } : {}),
    kind: kind ?? prev?.kind,
    source: 'stated',
    set: prev?.set || now,
    edited: now,
  } as Objective;
}

/** A subject kept as part of the objective ("Keep it here"): never offered as separate again. */
export function keepThread(o: Objective, thread: string): Objective {
  const t = clean(thread, OBJECTIVE_LIMITS.thread).toLowerCase();
  if (!t) return o;
  return { ...o, threads: [...new Set([...(o.threads ?? []), t])].slice(-OBJECTIVE_LIMITS.threads) };
}

/** A milestone added by the person (once, however it is cased); null when there is no room. */
export function addMilestone(o: Objective, t: string, now: number): Objective | null {
  const text = clean(t, OBJECTIVE_LIMITS.milestone);
  if (!text) return null;
  const list = o.milestones ?? [];
  if (list.some((m) => m.t.toLowerCase() === text.toLowerCase())) return o;
  if (list.length >= OBJECTIVE_LIMITS.milestones) return null;
  return { ...o, milestones: [...list, { t: text, at: now }] };
}

/** A milestone ticked off (or back on) by the person: the one whose words fit best; null when none does. */
export function tickMilestone(o: Objective, t: string, now: number, done = true): Objective | null {
  const list = o.milestones ?? [];
  const want = new Set(wordsOf(t));
  let best = -1,
    score = 0;
  list.forEach((m, i) => {
    const words = wordsOf(m.t);
    const s = m.t.toLowerCase() === t.trim().toLowerCase() ? 99 : words.filter((w) => want.has(w)).length / Math.max(1, words.length);
    if (s > score) (score = s), (best = i);
  });
  if (best < 0 || score < 0.5) return null;
  return { ...o, milestones: list.map((m, i) => (i === best ? (done ? { t: m.t, done: true as const, at: now } : { t: m.t, at: now }) : m)) };
}

/** Something to keep in mind for the objective, said by the person. */
export function addNote(o: Objective, k: NoteKind, t: string, now: number): Objective {
  const text = clean(t, OBJECTIVE_LIMITS.note);
  if (!text) return o;
  return { ...o, notes: [...(o.notes ?? []).filter((n) => n.t.toLowerCase() !== text.toLowerCase()), { k, t: text, at: now }].slice(-OBJECTIVE_LIMITS.notes) };
}

// ── the person changing it in words ─────────────────────────────────

const RESTATE = /^(?:please\s+)?(?:(?:change|set|update|rename|make|switch)\s+(?:the|our|my|this(?: chat'?s)?)\s+(?:objective|goal|aim)\s+(?:to|as|:)|(?:our|my|the|this chat'?s)\s+(?:objective|goal|aim)\s+is\s+(?:now\s+)?(?:to\s+)?|new\s+(?:objective|goal)\s*[:\-–])\s*(.{3,120})$/i;
// one sentence, and only these words: "remember …" belongs to Socria's memory of the person, not to one chat
const KEEP_IN_MIND = /^(?:please\s+)?(?:keep in mind|bear in mind|note for this (?:chat|objective))(?: that)?\s*[:,-]?\s*([^.?!\n]{4,220})[.!]?$/i;

/** "Change the objective to passing the final", "Our goal is now to ship v2": the new goal, or null. */
export function readRestate(text: string): string | null {
  const m = String(text ?? '').trim().replace(/[.!]+$/, '').match(RESTATE);
  if (!m) return null;
  const g = m[1].replace(/^to\s+/i, '').trim();
  return g.length >= 3 ? g : null;
}

/** "Keep in mind that the exam is open-book": what to keep, or null (only with an objective in place). */
export function readKeepInMind(text: string): string | null {
  const m = String(text ?? '').trim().match(KEEP_IN_MIND);
  return m ? m[1].replace(/[.!]+$/, '').trim() : null;
}

// ── what the chat holds for it, read from what is already there ─────

interface NodeLike {
  id: string;
  type: string;
  label: string;
  status?: string;
  group?: string;
}
interface ObjLike {
  kind: string;
  name: string;
  states?: unknown[];
  at?: number;
}
interface MsgLike {
  role: string;
  content?: unknown;
  attachments?: readonly { name?: string; kind?: string }[];
  sources?: { list?: readonly { title?: string }[] };
}

export interface QuizDone {
  title: string;
  right: number;
  total: number;
  /** topics of the questions they missed */
  missed: string[];
  finished: boolean;
}

/** What one chat holds for its objective — every list bounded, everything derived. */
export interface ObjectiveWork {
  decisions: string[];
  assumptions: string[];
  questions: string[];
  resolved: string[];
  sources: string[];
  artifacts: string[];
  quizzes: QuizDone[];
  threads: string[];
  /** the map's own record of what changed lately, newest first, in words (recentChanges) */
  recent: string[];
  ideas: number;
  turns: number;
}

const uniq = (xs: string[], n: number) => [...new Set(xs.map((x) => clean(x, 90)).filter(Boolean))].slice(0, n);

/** A quiz's standing, read from its state without the quiz engine: graded attempts only. */
export function quizOf(o: ObjLike): QuizDone | null {
  const s = (o.states?.[Math.min(o.at ?? 0, (o.states?.length ?? 1) - 1)] ?? null) as {
    title?: string;
    asked?: string[];
    records?: Record<string, { attempts?: { graded?: { grade?: string } | null }[] }>;
    pool?: { id: string; topic?: string }[];
    phase?: string;
  } | null;
  if (!s || !Array.isArray(s.asked)) return null;
  let right = 0,
    total = 0;
  const missed: string[] = [];
  for (const id of s.asked) {
    const last = (s.records?.[id]?.attempts ?? []).filter((a) => a?.graded?.grade).pop();
    if (!last) continue;
    total++;
    const g = last.graded!.grade;
    if (g === 'right' || g === 'close') right++;
    else {
      const topic = s.pool?.find((q) => q.id === id)?.topic;
      if (topic) missed.push(topic);
    }
  }
  return { title: clean(s.title ?? o.name, 80) || 'Quiz', right, total, missed: uniq(missed, 5), finished: s.phase === 'review' };
}

export const KIND_NOUN: Record<string, string> = { quiz: 'Quiz', study: 'Study', matrix: 'Matrix', fn: 'Function', diagram: 'Diagram', chart: 'Chart', table: 'Table', doc: 'Document', model: 'Model' };

/**
 * What a chat holds: the canvas's decisions, assumptions, open and settled questions and its subjects; the sources
 * brought in (documents, images, notes, pages read); the artifacts and quizzes made. From the chat itself — works
 * with no model, and is never out of date.
 */
export function workOf(s: {
  messages: readonly MsgLike[];
  map?: { nodes?: readonly NodeLike[]; objects?: { objs?: readonly ObjLike[] } | null; objective?: unknown; history?: MapHistory | null } | null;
}): ObjectiveWork {
  const nodes = s.map?.nodes ?? [];
  const open = (n: NodeLike) => (n.status ?? 'open') === 'open';
  const objs = s.map?.objects?.objs ?? [];
  const quizzes = objs.filter((o) => o.kind === 'quiz').map(quizOf).filter((q): q is QuizDone => !!q);
  const sources: string[] = [];
  for (const m of s.messages) {
    for (const a of m.attachments ?? []) if (a?.name) sources.push(a.name);
    for (const w of m.sources?.list ?? []) if (w?.title) sources.push(w.title);
  }
  const held = sanitizeObjective(s.map?.objective);
  return {
    decisions: uniq(nodes.filter((n) => n.type === 'decision' || n.type === 'option' && n.status === 'resolved').map((n) => n.label), 8),
    assumptions: uniq(nodes.filter((n) => n.type === 'assumption' && n.status !== 'resolved' && n.status !== 'supported').map((n) => n.label), 6),
    questions: uniq(nodes.filter((n) => n.type === 'question' && open(n)).map((n) => n.label), 6),
    resolved: uniq(nodes.filter((n) => n.status === 'resolved').map((n) => n.label), 6),
    sources: uniq(sources.reverse(), 10),
    artifacts: uniq(objs.filter((o) => o.kind !== 'quiz').map((o) => `${KIND_NOUN[o.kind] ?? cap(o.kind)}: ${o.name}`), 8),
    quizzes: quizzes.slice(-4),
    threads: uniq([...(held?.threads ?? []), ...nodes.map((n) => n.group ?? '').filter(Boolean)], 10),
    recent: recentChanges(s.map?.history ?? null),
    ideas: nodes.length,
    turns: s.messages.filter((m) => m.role === 'user').length,
  };
}

/** How the work reads in a line of counts ("6 ideas · 2 open questions · 3 sources · 1 quiz"), '' when empty. */
export function workCounts(w: ObjectiveWork): string {
  const n = (k: number, one: string, many = `${one}s`) => (k ? `${k} ${k === 1 ? one : many}` : '');
  return [
    n(w.ideas, 'idea'),
    n(w.decisions.length, 'decision'),
    n(w.questions.length, 'open question'),
    n(w.sources.length, 'source'),
    n(w.artifacts.length, 'artifact'),
    n(w.quizzes.length, 'quiz', 'quizzes'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The map's own record of what changed lately, newest first, in words: "added “X”, “Y” (by them)". */
export function recentChanges(history: MapHistory | null | undefined, max = 4): string[] {
  const changes = history?.changes ?? [];
  return changes
    .slice(-max)
    .reverse()
    .map((c) => {
      const bits = [
        c.added.length ? `added ${c.added.slice(0, 4).map((x) => q(x.label)).join(', ')}${c.added.length > 4 ? ` and ${c.added.length - 4} more` : ''}` : '',
        c.removed.length ? `took off ${c.removed.slice(0, 3).map((x) => q(x.label)).join(', ')}` : '',
        c.renamed.length ? `renamed ${c.renamed.slice(0, 2).map((r) => `${q(r.from)} to ${q(r.to)}`).join(', ')}` : '',
      ].filter(Boolean);
      return bits.length ? `${bits.join('; ')} (${c.cause === 'edit' ? 'by them' : 'from a turn'})` : '';
    })
    .filter(Boolean);
}

// ── what Core is told ───────────────────────────────────────────────

/** The objective and its work as sent with a turn (and re-sanitised on the server). */
export interface ObjectiveTurn {
  objective: Objective;
  work: ObjectiveWork;
  /** the message may start a different objective: what it reads as */
  drift?: string;
}

/** An objective turn that arrived from a browser: everything clipped and bounded; null without a goal. */
export function sanitizeObjectiveTurn(raw: unknown): ObjectiveTurn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const objective = sanitizeObjective(r.objective);
  if (!objective) return null;
  const w = (r.work && typeof r.work === 'object' ? r.work : {}) as Record<string, unknown>;
  const list = (v: unknown, n: number) => (Array.isArray(v) ? uniq(v.map((x) => String(x ?? '')), n) : []);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 100000) : 0);
  const quizzes = (Array.isArray(w.quizzes) ? w.quizzes : [])
    .slice(0, 4)
    .map((q) => {
      const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>;
      const total = num(o.total);
      return { title: clean(o.title, 80) || 'Quiz', right: Math.min(num(o.right), total), total, missed: list(o.missed, 5), finished: o.finished === true };
    });
  const drift = clean(r.drift, OBJECTIVE_LIMITS.goal);
  return {
    objective,
    work: {
      decisions: list(w.decisions, 8),
      assumptions: list(w.assumptions, 6),
      questions: list(w.questions, 6),
      resolved: list(w.resolved, 6),
      sources: list(w.sources, 10),
      artifacts: list(w.artifacts, 8),
      quizzes,
      threads: list(w.threads, 10),
      recent: list(w.recent, 4),
      ideas: num(w.ideas),
      turns: num(w.turns),
    },
    ...(drift ? { drift } : {}),
  };
}

const q = (s: string) => `“${s}”`;
const join = (xs: string[]) => xs.map(q).join('; ');

/** The objective as Core reads it: one block, context only, never the person's words. '' when there is none. */
export function objectiveBlock(t: ObjectiveTurn | null): string {
  if (!t) return '';
  const { objective: o, work: w } = t;
  const lines: string[] = [];
  lines.push(`THIS CONVERSATION'S OBJECTIVE — what the person is working towards in this chat: ${q(o.goal)}${o.kind ? ` (${KIND_SAID[o.kind].toLowerCase()})` : ''}, ${SOURCE_SAID[o.source]}.`);
  if (o.outcome) lines.push(`The outcome they want: ${q(o.outcome)}.`);
  const held: string[] = [];
  if (w.threads.length) held.push(`subjects within it — ${w.threads.join(', ')}`);
  if (w.decisions.length) held.push(`decided — ${join(w.decisions)}`);
  if (w.assumptions.length) held.push(`assumed, not yet checked — ${join(w.assumptions)}`);
  if (w.questions.length) held.push(`open questions — ${join(w.questions)}`);
  if (w.resolved.length) held.push(`settled — ${join(w.resolved)}`);
  if (w.sources.length) held.push(`their sources — ${w.sources.join(', ')}`);
  if (w.artifacts.length) held.push(`made here — ${w.artifacts.join(', ')}`);
  for (const z of w.quizzes) if (z.total) held.push(`quiz ${q(z.title)}: ${z.right}/${z.total}${z.missed.length ? `, missed on ${z.missed.join(', ')}` : ''}${z.finished ? '' : ' (in progress)'}`);
  if (held.length) lines.push(`What this chat holds for it so far: ${held.join('. ')}.`);
  if (w.recent.length) lines.push(`Recent changes on their map, newest first (from its record — "what changed?" is answered from this): ${w.recent.join('; ')}.`);
  if (o.notes?.length) lines.push(`They asked to keep in mind: ${o.notes.map((n) => q(n.t)).join('; ')}.`);
  if (o.milestones?.length) {
    const done = o.milestones.filter((m) => m.done), left = o.milestones.filter((m) => !m.done);
    lines.push(`Their milestones: ${[...done.map((m) => `${q(m.t)} (done)`), ...left.map((m) => `${q(m.t)} (not yet)`)].join('; ')}. Only they tick one off — never say one is reached.`);
  }
  lines.push(
    'Treat this turn as part of that objective: connect it to the earlier work in this chat when that genuinely helps (a mistake from a quiz, a source they gave, a decision made, a question left open), and never ask again for anything stated here or earlier in the conversation. Several subjects can serve one objective. Do not steer them back to it, police the topic, or refuse what lies outside it.'
  );
  if (t.drift)
    lines.push(
      `Their message may start a different objective (${q(t.drift)}). Answer it fully on its own terms — do not tie it to the objective above. The app offers them a separate chat for it; do not suggest one yourself.`
    );
  return `\n\n${lines.join('\n')}\n`;
}

// ── the earlier turns that bear on this message ─────────────────────

export interface Recalled {
  /** its position in the conversation, from 1 */
  turn: number;
  role: 'user' | 'assistant';
  text: string;
  score: number;
}

/**
 * From the turns older than those Core reads in full: the few that bear on this message — by the meaningful words
 * they share with it (and with the objective) — each cut to the sentences that matter. So "what was the mistake I
 * kept making with the chain rule?" finds the turn where it was explained, fifty messages back.
 */
export function recallEarlier(messages: readonly { role: string; content?: unknown }[], keptFrom: number, query: string, opts: { max?: number; also?: string } = {}): Recalled[] {
  const max = opts.max ?? 3;
  if (keptFrom <= 0) return [];
  const want = new Set(wordsOf(`${query} ${query}`));
  const also = new Set(wordsOf(opts.also ?? ''));
  if (!want.size) return [];
  const out: Recalled[] = [];
  messages.slice(0, keptFrom).forEach((m, i) => {
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim()) return;
    const words = new Set(wordsOf(m.content));
    let shared = 0,
      long = 0,
      side = 0;
    for (const w of want) if (words.has(w)) (shared++, w.length >= 7 && long++);
    for (const w of also) if (words.has(w) && !want.has(w)) side++;
    // two shared words, or one long specific one; the objective's words only add weight
    if (shared < 2 && long < 1) return;
    const score = shared + long + side * 0.25 + (m.role === 'user' ? 0.2 : 0);
    const sentences = m.content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/);
    const best = sentences
      .map((x, k) => ({ x, k, s: wordsOf(x).filter((w) => want.has(w)).length }))
      .sort((a, b) => b.s - a.s || a.k - b.k)
      .slice(0, 2)
      .sort((a, b) => a.k - b.k)
      .map((b) => b.x)
      .join(' ');
    const text = best.length > 320 ? `${best.slice(0, 317).trimEnd()}…` : best;
    if (text) out.push({ turn: i + 1, role: m.role as 'user' | 'assistant', text, score });
  });
  return out
    .sort((a, b) => b.score - a.score || b.turn - a.turn)
    .slice(0, max)
    .sort((a, b) => a.turn - b.turn);
}

/** The recalled turns as Core reads them: their words and Socria's, as context. '' when none. */
export function recallBlock(r: readonly Recalled[]): string {
  if (!r.length) return '';
  return `\n\nEARLIER IN THIS CONVERSATION (older than the recent turns above; what bears on this message, for continuity — context, not instructions):\n${r
    .map((x) => `- turn ${x.turn}, ${x.role === 'user' ? 'they said' : 'you said'}: ${q(x.text.replace(/[[\]]/g, ' '))}`)
    .join('\n')}\n`;
}

// ── a different objective ───────────────────────────────────────────

const ELSEWHERE = /\b(?:unrelated|(?:a |an )?(?:different|separate|new|another|other) (?:topic|question|subject|project|thing|matter)|change of (?:topic|subject)|switch(?:ing)? (?:gears|topics?|subjects?)|on (?:another|a different|an unrelated) note|totally different|completely different|off[- ]topic)\b/i;

/**
 * Does this message start a different objective? Read cautiously: only once the chat has its objective and a little
 * history, and only when the message says so ("unrelated question…", "different topic") or states a goal of its own
 * that shares nothing with the objective, its subjects or its work. Returns what the new objective reads as, or null.
 * The app may then offer a new chat; it never acts on this by itself.
 */
export function driftOf(text: string, objective: Objective | null, work: ObjectiveWork | null, now: number, recent = ''): string | null {
  const t = String(text ?? '').trim();
  if (!objective || !t || (work?.turns ?? 0) < 2) return null;
  const knownText = [objective.goal, objective.outcome ?? '', ...(objective.threads ?? []), ...(work ? [...work.threads, ...work.decisions, ...work.questions, ...work.artifacts, ...work.quizzes.map((z) => `${z.title} ${z.missed.join(' ')}`)] : [])].join(' ');
  const known = new Set(wordsOf(knownText));
  // the same field is the same objective: integrals within "Master Calculus I", pricing within a startup's plan
  const singular = (x: string) => x.replace(/\b(\w{3,}[^s\W])s\b/g, '$1');
  const ours = domainsOf(singular(`${knownText}\n${recent}`));
  for (const d of domainsOf(singular(t))) if (ours.has(d)) return null;
  const words = wordsOf(t);
  const touches = words.some((w) => known.has(w));
  const said = ELSEWHERE.test(t);
  const own = inferObjective(t.replace(ELSEWHERE, ' '), now);
  const stated = !!own && own.kind !== 'understand' && own.kind !== 'explore';
  if (!(said || (stated && !touches))) return null;
  if (said && touches && !stated) return null;
  const goal = own?.goal || topicTitle(t);
  if (!goal || wordsOf(goal).every((w) => known.has(w))) return null;
  return goal;
}

/** Whether a message is still part of the objective after "Keep it here": its subject is one of the threads. */
export function keptHere(text: string, objective: Objective | null): boolean {
  if (!objective?.threads?.length) return false;
  const words = new Set(wordsOf(text));
  return objective.threads.some((th) => {
    const tw = wordsOf(th);
    return tw.length > 0 && tw.filter((w) => words.has(w)).length / tw.length >= 0.6;
  });
}
