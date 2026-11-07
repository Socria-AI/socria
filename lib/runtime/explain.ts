// lib/runtime/explain.ts — THE ADAPTIVE EXPLANATION ENGINE (Logos 5.5).
//
// Not only what to explain, but how to make it understood. Twenty strategies
// from the learning-sciences literature, each a behaviour rather than a label:
// what it adds to the reply's shape (an inline element the presentation planner
// already draws, a question within the turn's budget, a first segment and the
// rest offered as ways onward), a short line the reply follows, and a check that
// the reply did it (checkExplanation, for the trace and the tests).
//
//   selection     read in code from the turn: what they asked (why, how it works,
//                 what it is, which, should I, is it true, solve), how much they
//                 know (their words, their mistakes, what they got right, the
//                 learning ledger), how complex it is, and how the last reply
//                 landed ("still don't get it" changes the strategy, not the volume)
//   combination   one primary, at most two in support, at most one question; a
//                 novice on something complex gets more scaffolding, an expert one
//                 strategy — never more than the turn can carry
//   restraint     a direct answer is better for a fact, a hello, an expert, a
//                 hurry, "just tell me": then Essential Insight alone, no quiz, no
//                 visual, and nothing added to the prompt
//   continuity    a learning ledger kept in their browser (topics, when last met,
//                 a Leitner box): what is due comes back once as a recall question,
//                 a topic met before is retrieved before it is retaught
//
// Invisible: no mode, no badge, no setting. Pure: no model call, no network.
// LOGOS_EXPLAIN=off takes it out without a deploy of code.

import type { ExplicitSignals } from '../core4/types';
import type { InlineKind } from '../inline-ui';
import type { Presentation } from './presentation';
import type { TurnState } from './state';

export const STRATEGIES = [
  'insight', // 1 Essential Insight — the one idea that makes the rest make sense, first
  'analogy', // 2 Analogy — a familiar system with the same structure, and where it breaks
  'compare', // 3 Comparative Explanation — side by side on the features that differ
  'worked', // 4 Worked Examples — one complete example, every step with its reason
  'faded', // 5 Faded Guidance — the first steps shown, the last left for them
  'segmented', // 6 Segmented Explanation — the first part now, the rest offered
  'pretrain', // 7 Concept Pretraining — the two or three terms named before the mechanism
  'visual', // 8 Visual-Verbal Explanation — a picture, and words that point into it
  'conceptmap', // 9 Concept Mapping — how the ideas relate, laid out as parts
  'causal', // 10 Causal Explanation — the chain of causes, each link said
  'misconception', // 11 Misconception Correction — the belief, why it tempts, why it fails, the model that replaces it
  'error', // 12 Error-Based Explanation — their slip located, why it seemed right, the rule that fixes it
  'elaborate', // 13 Elaborative Interrogation — "why does that hold?", once
  'selfexplain', // 14 Self-Explanation — they say why a step works, in their words
  'retrieval', // 15 Retrieval Practice — recall before re-reading
  'spaced', // 16 Spaced Reinforcement — what is due comes back, once, briefly
  'interleave', // 17 Interleaved Explanation — practice that mixes kinds, choosing the method first
  'teachback', // 18 Teach-Back — they explain it back in a sentence or two
  'argument', // 19 Argument Mapping — the claim, its reasons, the objections, what it rests on
  'tradeoffs', // 20 Decision Tradeoffs — the options on the criteria that matter, the call theirs
] as const;
export type Strategy = (typeof STRATEGIES)[number];

/** The strategies that put a question to them: at most one a turn, and only within the turn's question budget. */
export const ASKING: ReadonlySet<Strategy> = new Set(['elaborate', 'selfexplain', 'retrieval', 'spaced', 'teachback', 'interleave']);

export type Level = 'novice' | 'intermediate' | 'expert';

/** What the learning ledger holds about one topic (kept in their browser; nothing here is stored on the server). */
export interface LedgerEntry {
  topic: string;
  /** times it came up */
  seen: number;
  right: number;
  wrong: number;
  /** last time it came up, ms */
  last: number;
  /** Leitner box: 0 new or slipped, up to 4 */
  box: number;
}

export interface ExplainInput {
  /** their newest message */
  text: string;
  history: readonly { role: 'user' | 'assistant'; content: string }[];
  signals: ExplicitSignals;
  state: TurnState;
  /** the presentation already planned for the turn */
  presentation: Presentation;
  /** questions the reply may ask this turn, after the engine and MR decided */
  questions: number;
  guard: boolean;
  /** working it out is theirs (Core 4's split) */
  ownReasoning?: boolean;
  /** the decision is theirs (Core 4's split) */
  ownJudgment?: boolean;
  /** what Logos 4's move already asks for: retrieval on return, a why after a right step, a scaffold after a slip */
  assist?: { retrieval?: boolean; selfExplain?: boolean; scaffold?: 'none' | 'hint' | 'steps' };
  /** what they did with checks in the last reply: answers right and not right */
  did?: { right: number; wrong: number };
  /** the learning ledger from their browser, sanitised */
  ledger?: readonly LedgerEntry[] | null;
  /** their chosen reply length */
  length?: 'concise' | 'standard' | 'detailed' | null;
  now: number;
}

export interface ExplainPlan {
  /** primary first; at most three */
  strategies: Strategy[];
  level: Level;
  /** 1 a sentence answers it, 2 it has parts, 3 a mechanism with several parts or new terms */
  complexity: 1 | 2 | 3;
  /** what kind of question it is */
  ask: AskKind;
  /** the topic, in a few words — what the ledger keys on */
  topic: string | null;
  /** a direct answer is better: nothing forced, nothing added */
  direct: boolean;
  /** the inline elements the strategies call for, merged into the presentation where they fit */
  forms: InlineKind[];
  /** the one question the reply ends on, if any */
  question: Strategy | null;
  /** the topics due for review that this turn brings back */
  due: string[];
  /** the turn is learning: the client notes the topic in the ledger */
  learning: boolean;
  /** content-free reasons */
  reasons: string[];
}

export type AskKind = 'why' | 'how' | 'what' | 'compare' | 'decide' | 'claim' | 'solve' | 'procedure' | 'relate' | 'practice' | 'other';

// ── reading the turn ──────────────────────────────────────────────────

const lc = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const LEAD = /^(?:(?:so|ok(?:ay)?|hey|hi|hello|please|honestly|um+|well|right|quick question|question),?\s+)+/;

const WHY = /^(?:why\b|what\s+(?:causes|caused|makes|made|leads?\s+to|drives?)\b|how\s+come\b)|\bwhat\s+(?:causes|caused|leads?\s+to|drives?)\b|\b(?:the\s+)?(?:cause|causes|reason)\s+(?:of|for|behind)\b|\beffects?\s+of\b/;
const HOW_WORKS = /^how\s+(?:does|do|did|is|are|can|could)\s+(?!(?:i|we|you|u)\b)(?:the\s+|a\s+|an\s+)?[a-z][\w-]*(?:\s+[a-z][\w-]*){0,3}\s+[a-z]{3,}|\bhow\s+(?:does|do|did|is|are|can)\s+.{2,80}?\b(?:work|works|happen|happens|form|forms|function|functions|spread|grow|move|run|operate)\b|\bhow\s+.{2,40}\s+works?\b|\bwhat\s+happens\s+(?:when|if|in|during)\b|\bexplain\s+(?:how|the\s+process)\b|\bthe\s+process\s+of\b/;
const WHAT_IS = /^(?:what(?:'s|\s+is|\s+are)\s+(?:a|an|the)?\s*\w|what\s+does\s+.+\s+mean|define\b|meaning\s+of\b|explain\s+(?!how|why)\w)/;
const COMPARE = /\b(?:difference|differences|differ)\s+(?:between|from)\b|\bvs\.?\b|\bversus\b|\bcompared?\s+(?:to|with)\b|\bcompare\b|\bsame\s+(?:thing\s+)?as\b|\bmix(?:ing)?\s+up\b|\bconfuse\b.*\band\b/;
const DECIDE = /\b(?:should\s+i|should\s+we|which\s+(?:one\s+)?should|help\s+me\s+(?:decide|choose|pick)|is\s+it\s+worth|better\s+(?:option|choice)|trade-?offs?)\b/;
const CLAIM = /^(?:is\s+it\s+(?:true|right|correct)\s+that|is\s+(?:this|that)\s+(?:true|right|correct|a\s+good\s+argument)|does\s+(?:this|my)\s+argument|(?:my|the)\s+(?:argument|thesis|claim)\b)|\b(?:argue|argument\s+(?:for|against)|counter-?argument|debate|is\s+(?:the|this)\s+claim)\b/;
const SOLVE = /\b(?:solve|calculate|compute|work\s+out|find\s+(?:the|x|y)|simplify|differentiate|integrate|derive|factori[sz]e|expand|evaluate)\b|[=]\s*\d|\d\s*[x×*+^/-]\s*\d|\bx\s*[+\-=^]/;
const PROCEDURE = /^(?:how\s+(?:do|can|would|should)\s+(?:i|we|you)\b|walk\s+me\s+through|show\s+me\s+how|what\s+are\s+the\s+steps)/;
const RELATE = /\bhow\s+(?:do|does|are)\s+.{2,80}?\b(?:relate|connect|fit\s+together|link|interact)\b|\b(?:relationship|connection)s?\s+between\b|\bbig\s+picture\b|\boverview\s+of\b|\bmap\s+(?:out|of)\b/;
const PRACTICE = /\b(?:quiz\s+me|test\s+me|practi[cs]e|give\s+me\s+(?:a|some|another|more)\s+(?:problem|question|example|exercise)s?|let\s+me\s+try|more\s+problems|drill)\b/;
const REVIEW = /\b(?:what\s+should\s+i\s+(?:review|revise|study)|help\s+me\s+(?:review|revise)|revision|revise\s+for|exam\s+(?:is|on|tomorrow|next)|test\s+(?:on|tomorrow|next|is))\b/;

const NOVICE_SAID = /\b(?:eli5|explain\s+like|in\s+simple\s+terms|simply\b|plain\s+english|i'?m\s+(?:new|a\s+beginner)|beginner|for\s+dummies|from\s+scratch|never\s+(?:learned|studied|done)|no\s+idea\s+(?:what|how)|basic(?:s|ally)?\b)/;
const EXPERT_SAID = /\b(?:formally|rigorous(?:ly)?|the\s+proof|derivation|technically|in\s+depth|at\s+a\s+graduate|i'?m\s+(?:a|an)\s+(?:engineer|developer|doctor|physicist|mathematician|researcher|professor|phd))\b/;
const CONFUSED = /\b(?:still\s+(?:don'?t|do\s+not|confused|lost|not\s+getting)|(?:i'?m|i\s+am)\s+(?:so\s+|still\s+)?(?:confused|lost)|doesn'?t\s+make\s+sense|makes\s+no\s+sense|i\s+don'?t\s+(?:get|understand)\s+(?:it|this|that|why|how)|what\??$|huh\??$|not\s+following)\b/;
const GOT_IT = /\b(?:(?:oh,?\s+)?(?:i\s+(?:get|got)\s+it(?:\s+now)?|that\s+(?:makes\s+sense|clicks|helps)|makes\s+sense(?:\s+now)?|i\s+see\s+now|ah+\s+i\s+see|now\s+i\s+(?:get|understand)))\b/;
const SIMPLER = /\b(?:too\s+(?:long|much|complicated|complex|technical)|simpler|shorter|tl;?dr|in\s+(?:one|a)\s+(?:sentence|line)|keep\s+it\s+short)\b/;
const BELIEF = /\b(?:i\s+(?:always\s+)?thought|i\s+(?:was\s+)?told|my\s+(?:teacher|friend|dad|mum|mom|boss)\s+(?:said|says)|isn'?t\s+it\s+(?:true\s+)?that|doesn'?t\s+(?:that|it)\s+mean|i\s+assumed|so\s+(?:basically|it'?s\s+just))\b/;
const JUST_ANSWER = /\b(?:just\s+(?:tell|give)\s+me|quick(?:ly)?\s+answer|no\s+(?:need\s+to\s+)?explain|skip\s+the\s+explanation|tl;?dr)\b/;
const TERM = /\b[a-z]{4,}(?:tion|sis|ism|ity|ance|ence|ment|ics|ology|ase|ide|ate|ine|ium|um|us|al)\b/g;

/** What kind of question it is, read from how it is asked. */
export function askKind(text: string): AskKind {
  const t = lc(text).replace(LEAD, '');
  if (!t) return 'other';
  if (PRACTICE.test(t) || REVIEW.test(t)) return 'practice';
  if (DECIDE.test(t)) return 'decide';
  if (COMPARE.test(t)) return 'compare';
  if (CLAIM.test(t)) return 'claim';
  if (RELATE.test(t)) return 'relate';
  if (WHY.test(t)) return 'why';
  if (HOW_WORKS.test(t)) return 'how';
  if (SOLVE.test(t) && !/^(?:what|why|how\s+does)\b/.test(t)) return 'solve';
  if (PROCEDURE.test(t)) return 'procedure';
  if (WHAT_IS.test(t)) return 'what';
  return 'other';
}

const STOP = new Set('a an the of to in on for and or but is are was were be been it its this that these those how why what which when where who whom does do did can could would should will i me my we our you your they them their about into from with as at by so than then there here really actually exactly just please explain tell show help understand mean means work works happen happens difference between versus vs compare is it true like simple simply terms eli5 kid five year old way review revise revision exam exams test tests tomorrow today tonight week study studying learn learning quiz practice question questions problem problems need want know get got still now some more again also'.split(' '));

/** The topic, in a few words: the content words of the question, lower-cased. What the ledger keys on. */
export function topicOf(text: string): string | null {
  const words = lc(text)
    .replace(LEAD, '')
    .replace(/[^a-z0-9' -]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  if (!words.length) return null;
  return words.slice(0, 4).join(' ').slice(0, 48);
}

/** How many terms in it a newcomer may not know: long, Latinate words that are not everyday ones. */
export function termCount(text: string): number {
  const seen = new Set((lc(text).match(TERM) ?? []).filter((w) => !/^(?:question|information|attention|situation|important|different|actually|personal|national|general|total|usual|natural|position|education|statement|moment|government|condition|decision|explanation|mention|function)$/.test(w)));
  return seen.size;
}

/** What the last reply did, read from its own text: the strategies it already used. */
export function usedBefore(history: ExplainInput['history']): Set<Strategy> {
  const prev = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const used = new Set<Strategy>();
  if (!prev) return used;
  if (/\b(?:think\s+of\s+(?:it|this|them)\s+(?:as|like)|it'?s\s+like\s+(?:a|an|the)|imagine\s+(?:a|an|you)|is\s+like\s+(?:a|an)|works\s+like\s+(?:a|an)|as\s+if)\b/i.test(prev)) used.add('analogy');
  if (/```ui\s*\n\s*\{"type":"steps"/.test(prev)) used.add('worked');
  if (/```ui\s*\n\s*\{"type":"compare"/.test(prev)) used.add('compare');
  if (/```ui\s*\n\s*\{"type":"(?:diagram|graph|sim)"/.test(prev)) used.add('visual');
  if (/```ui\s*\n\s*\{"type":"check"/.test(prev)) used.add('retrieval');
  if (/\bin\s+your\s+own\s+words\b/i.test(prev)) used.add('teachback');
  return used;
}

/** How much they know about this, from what they said and showed — never a label kept about them. */
export function levelOf(i: Pick<ExplainInput, 'text' | 'signals' | 'state' | 'did' | 'ledger'>, topic: string | null): Level {
  const t = lc(i.text);
  const ex = i.signals.expertise ?? i.state.preferences.expertise;
  const wrong = i.state.understanding.wrong + (i.did?.wrong ?? 0);
  const right = i.state.understanding.right + (i.did?.right ?? 0);
  if (ex === 'novice' || NOVICE_SAID.test(t) || i.state.understanding.saidStuck || i.signals.dontKnow) return 'novice';
  if (ex === 'expert' || EXPERT_SAID.test(t)) return 'expert';
  const known = topic ? (i.ledger ?? []).find((e) => sameTopic(e.topic, topic)) : undefined;
  if (wrong > right) return 'novice';
  if (known && known.box >= 3 && known.right > known.wrong) return 'expert';
  if (right > 0 || (known && known.box >= 1)) return 'intermediate';
  return 'intermediate';
}

/** How much there is to it. */
export function complexityOf(text: string, kind: AskKind): 1 | 2 | 3 {
  const t = lc(text);
  const words = t.split(' ').filter(Boolean).length;
  const terms = termCount(text);
  const parts = (t.match(/\?/g) ?? []).length + (t.match(/\b(?:and\s+(?:also|then|how|why|what)|also)\b/g) ?? []).length;
  let c = 1;
  if (kind === 'relate' || kind === 'solve' || kind === 'compare' || kind === 'claim' || kind === 'decide' || ((kind === 'how' || kind === 'why') && (terms >= 1 || words >= 9))) c = 2;
  if (terms >= 2 || parts >= 2 || words >= 40 || (kind === 'relate' && terms >= 1) || (kind === 'how' && terms >= 1)) c = Math.max(c, 2);
  if ((terms >= 3 && (kind === 'how' || kind === 'why' || kind === 'relate')) || parts >= 3 || words >= 70) c = 3;
  return c as 1 | 2 | 3;
}

// ── the ledger: continuity across conversations ───────────────────────

/** Days until a topic in each box is due again (Leitner, expanding). */
export const INTERVAL_DAYS = [1, 3, 7, 16, 35] as const;
const DAY = 86_400_000;
const LEDGER_MAX = 40;

export function sameTopic(a: string, b: string): boolean {
  const A = new Set(a.split(' ').filter((w) => w.length > 3));
  const B = b.split(' ').filter((w) => w.length > 3);
  if (!A.size || !B.length) return a === b;
  const shared = B.filter((w) => A.has(w)).length;
  return shared >= Math.min(2, Math.min(A.size, B.length));
}

/** A topic met again: counted, its box moved by how it went (right up a box, a slip back to the first). */
export function noteTopic(ledger: readonly LedgerEntry[], topic: string, outcome: { right?: number; wrong?: number }, at: number): LedgerEntry[] {
  const i = ledger.findIndex((e) => sameTopic(e.topic, topic));
  const right = Math.max(0, outcome.right ?? 0);
  const wrong = Math.max(0, outcome.wrong ?? 0);
  const prev = i >= 0 ? ledger[i] : { topic, seen: 0, right: 0, wrong: 0, last: at, box: 0 };
  const box = wrong > 0 ? 0 : right > 0 ? Math.min(INTERVAL_DAYS.length - 1, prev.box + 1) : prev.box;
  const next: LedgerEntry = { topic: prev.topic, seen: prev.seen + 1, right: prev.right + right, wrong: prev.wrong + wrong, last: at, box };
  const rest = ledger.filter((_, j) => j !== i);
  return [next, ...rest].slice(0, LEDGER_MAX);
}

/** What is due for review now: met before, at least a day ago, and past its box's interval. Oldest-due first. */
export function dueTopics(ledger: readonly LedgerEntry[], now: number): LedgerEntry[] {
  return ledger
    .filter((e) => e.seen >= 1 && now - e.last >= DAY && now - e.last >= INTERVAL_DAYS[Math.min(e.box, INTERVAL_DAYS.length - 1)] * DAY)
    .sort((a, b) => a.last + INTERVAL_DAYS[a.box] * DAY - (b.last + INTERVAL_DAYS[b.box] * DAY));
}

/** The ledger as it came from a browser: shaped, clipped, forty at most — context, trusted for nothing else. */
export function sanitizeLedger(raw: unknown, now: number): LedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LedgerEntry[] = [];
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  for (const v of raw.slice(0, LEDGER_MAX)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    const topic = typeof o?.topic === 'string' ? o.topic.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48) : '';
    const last = n(o?.last, now);
    if (!topic || !last) continue;
    out.push({ topic, seen: n(o?.seen, 9999), right: n(o?.right, 9999), wrong: n(o?.wrong, 9999), last, box: n(o?.box, INTERVAL_DAYS.length - 1) });
  }
  return out;
}

/** The outcomes of the checks they answered, from what they did ("… — right", "… — not right"). */
export function outcomesOf(did: readonly { said: string }[] | undefined): { right: number; wrong: number } {
  let right = 0;
  let wrong = 0;
  for (const d of did ?? []) {
    if (/—\s*not right\b/.test(d.said)) wrong++;
    else if (/—\s*right\b/.test(d.said)) right++;
  }
  return { right, wrong };
}

// ── choosing ──────────────────────────────────────────────────────────

/** Strategies that do the same job: never two of one group in a turn. */
const GROUPS: Strategy[][] = [
  ['worked', 'faded', 'error'],
  ['compare', 'tradeoffs'],
  ['conceptmap', 'argument'],
];
/** The forms each strategy carries its work in, best first (the planner's own elements). */
const FORMS: Partial<Record<Strategy, InlineKind[]>> = {
  compare: ['compare'],
  tradeoffs: ['decide'],
  worked: ['steps'],
  causal: ['diagram'],
  visual: ['diagram'],
  conceptmap: ['concepts'],
  argument: ['claim'],
  segmented: ['paths'],
  interleave: ['check'],
};

export function planExplanation(i: ExplainInput): ExplainPlan {
  const raw = i.text.trim();
  const t = lc(raw);
  const kind = askKind(raw);
  const topic = topicOf(raw);
  const level = levelOf(i, topic);
  const complexity = complexityOf(raw, kind);
  const x = i.state.exchange.kind;
  const work = i.state.work;
  const reasons: string[] = [`ask:${kind}`, `level:${level}`, `complexity:${complexity}`];
  const before = usedBefore(i.history);
  const confused = CONFUSED.test(t);
  const gotIt = GOT_IT.test(t);
  const simpler = SIMPLER.test(t) || !!i.signals.redundancy;
  const did = i.did ?? { right: 0, wrong: 0 };
  const wrongNow = i.state.understanding.wrong + did.wrong > 0 || i.assist?.scaffold === 'steps' || i.assist?.scaffold === 'hint';
  const rightNow = i.state.understanding.right + did.right > 0;
  const metBefore = topic ? (i.ledger ?? []).find((e) => sameTopic(e.topic, topic)) : undefined;
  const learning =
    !i.state.sensitive &&
    !i.signals.offRecord &&
    (i.signals.learningGoal === true || i.state.preferences.learning === true || i.state.domain === 'learning' || i.state.domain === 'math' || work === 'practice' || kind === 'practice' || REVIEW.test(t) || NOVICE_SAID.test(t) || confused || gotIt || rightNow || wrongNow || !!metBefore);
  const forms: InlineKind[] = [];
  const base = (direct: boolean, strategies: Strategy[], question: Strategy | null = null, due: string[] = []): ExplainPlan => ({
    strategies,
    level,
    complexity,
    ask: kind,
    topic,
    direct,
    forms: [...new Set(forms)],
    question,
    due,
    learning: learning && !!topic && !direct,
    reasons,
  });

  // ── RESTRAINT: a direct answer is better ──
  // something said that an explanation can answer: a question of a kind, a belief, being lost, getting it, a check answered
  const substantive = kind !== 'other' || BELIEF.test(t) || confused || gotIt || wrongNow || rightNow;
  // a hello, a joke, something personal, a write-up for Content, a thing to build: not an explanation at all
  if (x === 'social' || x === 'playful' || x === 'personal' || (x === 'conversation' && !substantive)) return (reasons.push(`direct:talk:${x}`), base(true, []));
  if (i.presentation.place === 'content' || i.state.intent !== 'conversation') return (reasons.push('direct:view'), base(true, []));
  if (work === 'creation' || work === 'execution' || work === 'research' || (work === 'reflection' && !substantive)) return (reasons.push(`direct:work:${work}`), base(true, ['insight']));
  // "just tell me", a hurry, a plain fact asked by someone not learning it, or one sentence's worth for an expert
  const hurried = JUST_ANSWER.test(t) || i.signals.directness === 'answer' || i.signals.answersOnly || i.signals.urgent;
  const fact = work === 'information' && complexity === 1 && kind !== 'compare' && kind !== 'why' && kind !== 'how';
  if (hurried || (fact && !learning) || (level === 'expert' && complexity === 1)) {
    reasons.push(hurried ? 'direct:asked' : fact ? 'direct:fact' : 'direct:expert');
    return base(true, ['insight']);
  }

  // ── what could help, scored ──
  const score = new Map<Strategy, number>();
  const add = (s: Strategy, n: number, why: string) => {
    score.set(s, (score.get(s) ?? 0) + n);
    reasons.push(`${s}:${why}`);
  };
  const forms0 = i.presentation.forms;
  const mayDraw = !i.guard;
  const mayWork = !i.guard && !i.ownReasoning;

  // the one idea first — always the spine of an explanation
  add('insight', simpler || level === 'expert' ? 3 : 1, simpler ? 'simpler' : level === 'expert' ? 'expert' : 'spine');

  // what the question asks for
  if (kind === 'compare' || forms0.includes('compare')) add('compare', 4, 'asked');
  // a choice that is theirs to weigh — the planner's decision, or judgment asked for; never "how long should I boil an egg?"
  if (forms0.includes('decide') || (kind === 'decide' && work === 'judgment')) add('tradeoffs', 4, i.ownJudgment ? 'theirs' : 'asked');
  if (kind === 'claim' || forms0.includes('claim')) add('argument', 3.5, 'claim');
  if (kind === 'why') add('causal', 3.5, 'why');
  if (kind === 'how') add('causal', 2, 'mechanism');
  if (kind === 'how' || forms0.includes('diagram') || forms0.includes('graph') || forms0.includes('sim')) add('visual', kind === 'how' ? 2.5 : 2, forms0.length ? 'drawn' : 'process');
  if (kind === 'relate' || forms0.includes('concepts')) add('conceptmap', 3.5, 'relations');
  if ((kind === 'solve' || kind === 'procedure') && mayWork) add(rightNow || before.has('worked') ? 'faded' : 'worked', 3.5, rightNow || before.has('worked') ? 'after-example' : 'example');
  if ((kind === 'solve' || kind === 'procedure') && !mayWork) add('faded', 3.5, 'theirs-to-finish');

  // how much they know
  if (level === 'novice' && (kind === 'what' || kind === 'how' || kind === 'why') && !before.has('analogy')) add('analogy', 2.5, 'novice');
  if (NOVICE_SAID.test(t) && !before.has('analogy')) add('analogy', 1.5, 'asked-simple');
  if (level === 'novice' && termCount(raw) >= 2 && complexity >= 2 && kind !== 'solve') add('pretrain', 2.5, 'new-terms');
  if (complexity === 3 || (level === 'novice' && complexity >= 2 && i.length !== 'detailed')) add('segmented', complexity === 3 ? 2.5 : 1.5, complexity === 3 ? 'complex' : 'novice');

  // how the last reply landed: a different way in, not more of the same
  if (confused) {
    if (before.has('analogy')) {
      add(mayWork ? 'worked' : 'faded', 3, 'confused-after-analogy');
      if (mayDraw) add('visual', 2, 'confused-after-analogy');
    } else add('analogy', 3, 'confused');
    if (before.has('worked') && mayDraw) add('visual', 2, 'confused-after-example');
    add('segmented', 1, 'confused');
  }

  // mistakes, and beliefs that will not hold
  if (wrongNow) add('error', 4.5, 'their-slip');
  if (BELIEF.test(t) || (i.state.understanding.wrong > 0 && kind !== 'solve')) add('misconception', 4, 'belief');

  // practice, and what they already showed
  const mayAsk = i.questions > 0 && !i.signals.stopQuestions && i.signals.directness !== 'answer' && !i.signals.frustration;
  const due = dueTopics(i.ledger ?? [], i.now);
  const dueHere = topic ? due.filter((e) => !sameTopic(e.topic, topic)) : due;
  if (mayAsk && learning) {
    if (i.assist?.retrieval) add('retrieval', 5, 'resumed');
    else if (metBefore && i.now - metBefore.last >= DAY && i.history.length <= 2 && kind !== 'practice') add('retrieval', 3.5, 'met-before');
    if (i.assist?.selfExplain || (did.right > 0 && before.has('worked'))) add('selfexplain', 4, 'right-step');
    else if (rightNow && kind !== 'practice') add('elaborate', 2.5, 'right');
    if (gotIt || (i.state.understanding.right + did.right >= 2 && !wrongNow)) add('teachback', 3, gotIt ? 'got-it' : 'two-right');
    if (kind === 'practice' || REVIEW.test(t)) {
      const kinds = new Set((i.ledger ?? []).filter((e) => i.now - e.last < 30 * DAY).map((e) => e.topic));
      if (kinds.size >= 2 || REVIEW.test(t)) add('interleave', 3.5, 'mixed-practice');
      if (dueHere.length && REVIEW.test(t)) add('spaced', 4, 'review-due');
    }
    if (dueHere.length && complexity <= 2 && !confused && !wrongNow && kind !== 'practice') add('spaced', 1.5, 'due');
    if (kind === 'why' || kind === 'what') {
      if (level !== 'novice' && !wrongNow) add('elaborate', 1, 'why-holds');
    }
  }

  // ── combining, without overwhelming ──
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || STRATEGIES.indexOf(a[0]) - STRATEGIES.indexOf(b[0]));
  const cap = level === 'expert' ? 1 : level === 'novice' && complexity >= 2 ? 3 : 2;
  const chosen: Strategy[] = [];
  let question: Strategy | null = null;
  for (const [s, n] of ranked) {
    if (chosen.length >= cap) break;
    if (chosen.length && n < 1.5) continue;
    if (chosen.includes(s)) continue;
    if (GROUPS.some((g) => g.includes(s) && g.some((o) => o !== s && chosen.includes(o)))) continue;
    // under the guard, nothing that shows the answer they are working toward
    if (i.guard && s === 'worked') continue;
    if (ASKING.has(s)) {
      // practice that mixes kinds can carry the recall of what is due: one question still
      if (question && !(s === 'interleave' && question === 'spaced')) continue;
      if (question) {
        chosen.push(s);
        continue;
      }
      // a question is the end of a reply, never its point, unless it is a return to something learned
      if (!chosen.length && cap > 1 && s !== 'retrieval' && s !== 'spaced' && s !== 'interleave') chosen.push('insight');
      question = s;
    }
    chosen.push(s);
  }
  if (!chosen.length) chosen.push('insight');
  // insight is the spine: kept when there is room, never at the cost of what the turn needs
  if (!chosen.includes('insight') && chosen.length < cap && !question) chosen.push('insight');

  // the forms they carry their work in, where the planner has room and the turn allows drawing
  for (const s of chosen) {
    for (const k of FORMS[s] ?? []) {
      if (!mayDraw && k !== 'paths') continue;
      if (k === 'steps' && !mayWork) continue;
      if (k === 'diagram' && !forms0.includes('diagram') && (!((kind === 'how' && complexity >= 2) || (kind === 'why' && complexity === 3)) || forms0.some((f) => f === 'sequence' || f === 'steps' || f === 'graph' || f === 'sim' || f === 'concepts' || f === 'slider'))) continue;
      if (k === 'check' && !(i.questions > 0)) continue;
      forms.push(k);
      break;
    }
  }
  // a picture is pointed into only where one is drawn: no line about a visual the reply will not have
  const VISUAL_FORMS: readonly InlineKind[] = ['diagram', 'graph', 'sim', 'slider', 'concepts', 'sequence', 'chart'];
  if (chosen.includes('visual') && !forms.includes('diagram') && !forms0.some((k) => VISUAL_FORMS.includes(k))) {
    chosen.splice(chosen.indexOf('visual'), 1);
    reasons.push('visual:nothing-drawn');
    if (!chosen.includes('insight') && chosen.length < cap) chosen.push('insight');
    if (!chosen.length) chosen.push('insight');
  }
  return base(false, chosen, question, question === 'spaced' || chosen.includes('spaced') ? dueHere.slice(0, 2).map((e) => e.topic) : []);
}

// ── folding into the presentation ─────────────────────────────────────

const LIVE: readonly InlineKind[] = ['graph', 'sim', 'slider', 'decide', 'steps', 'claim'];

/**
 * The strategies' forms merged into the turn's presentation by the planner's own rules: two elements at most,
 * one live element, nothing drawn under the guard, a write-up untouched. What the strategy needs most leads.
 */
export function applyExplanation(p: Presentation, plan: ExplainPlan): Presentation {
  if (plan.direct || p.place === 'content') return p;
  const forms = [...p.forms];
  const strong = [...(p.strong ?? [])];
  const reasons = [...p.reasons];
  for (const k of plan.forms) {
    if (forms.includes(k)) {
      if (!strong.includes(k) && k !== 'paths') strong.push(k);
      continue;
    }
    if (p.guard && k !== 'paths') continue;
    if (forms.length >= 2) {
      // a way onward gives its place to what explains
      const pi = forms.indexOf('paths');
      if (pi >= 0 && k !== 'paths') forms.splice(pi, 1);
      else continue;
    }
    if (LIVE.includes(k) && forms.some((f) => LIVE.includes(f))) continue;
    forms.push(k);
    if (k !== 'paths') strong.push(k);
    reasons.push(`explain:${k}`);
  }
  const diagram = forms.includes('diagram') && !p.diagram ? (plan.ask === 'why' ? 'causes' : 'flow') : p.diagram;
  return {
    ...p,
    forms,
    reasons,
    ...(strong.filter((k) => forms.includes(k)).length ? { strong: [...new Set(strong.filter((k) => forms.includes(k)))] } : {}),
    ...(diagram ? { diagram } : {}),
  };
}

// ── what the reply is told ────────────────────────────────────────────
//
// One short line per strategy, said as what to do — the behaviour, never its name.
// Nothing at all for a direct answer, or for Essential Insight alone (the core
// already leads with the point): most turns add no tokens.

const DO: Record<Strategy, (p: ExplainPlan) => string> = {
  insight: () => 'Open with the one idea that makes the rest make sense, in a sentence.',
  analogy: () => 'Give one everyday analogy with the same structure, then say in a clause where it stops holding.',
  compare: () => 'Set them side by side on the few features that actually differ; say what follows from the difference.',
  worked: () => 'Work one complete example with their numbers or a close one, each step with its reason.',
  faded: () => 'Show the first steps with reasons, then stop and leave the last step for them, saying what it needs.',
  segmented: () => 'Give only the first part, in a few sentences; offer the next parts as ways onward rather than writing them.',
  pretrain: () => 'Before the mechanism, name the two or three terms it uses, each in a few plain words.',
  visual: () => 'Let the picture carry the structure; your words point to its parts by name, not describe it again.',
  conceptmap: () => 'Lay out how the ideas relate, each with its link to the others; the parts first, detail on demand.',
  causal: () => 'Give the chain of causes in order, each link said with why it leads to the next.',
  misconception: () => 'Name the belief plainly, say why it is tempting, show the one fact it cannot survive, then the accurate model.',
  error: () => 'Point to the exact step that went wrong, say why it seemed right, give the rule that fixes it; do not redo all of it for them.',
  elaborate: () => 'End by asking, once, why that holds — in their words.',
  selfexplain: () => 'Confirm the step in a sentence, then ask them, once, why it works.',
  retrieval: () => 'Before adding anything, ask them to recall the key idea from before in one short question, and stop.',
  spaced: (p) =>
    p.strategies.includes('interleave')
      ? `Bring back ${p.due.length ? p.due.map((d) => `“${d}”`).join(' and ') : 'what they met before'} in the practice: one question, mixed with today's.`
      : `Close with one quick recall of ${p.due.length ? `“${p.due[0]}”` : 'what they met before'}, a single question.`,
  interleave: (p) => (p.question === 'interleave' ? 'Mix kinds of problem rather than repeating one; ask which method fits before solving.' : 'Mix the kinds of problem; ask which method fits before solving.'),
  teachback: () => 'End by asking them, once, to explain it back in a sentence or two, as if to a friend.',
  argument: () => 'Lay out the claim, the reasons it rests on, the strongest objection, and the assumption it all depends on.',
  tradeoffs: (p) => `Weigh the options on the criteria that matter to them; ${p.reasons.includes('tradeoffs:theirs') ? 'the call stays theirs.' : 'end on what would tip it.'}`,
};

export function renderExplanation(plan: ExplainPlan | null, said: { retrieval?: boolean; selfExplain?: boolean } = {}): string {
  if (!plan || plan.direct) return '';
  const lines = plan.strategies
    .filter((s) => !(s === 'insight' && plan.strategies.length === 1))
    // what Logos 4's move already said is not said twice
    .filter((s) => !(s === 'retrieval' && said.retrieval) && !(s === 'selfexplain' && said.selfExplain))
    .map((s) => `- ${DO[s](plan)}`);
  if (!lines.length) return '';
  const who = plan.level === 'novice' ? 'They are new to this: plain words, no unexplained terms.' : plan.level === 'expert' ? 'They know the field: skip the basics.' : '';
  return `\n\nHOW TO MAKE IT UNDERSTOOD${who ? ` — ${who}` : ''}\n${lines.join('\n')}\n`;
}

/** Content-free, for the response header and the trace. */
export function explainTrace(plan: ExplainPlan | null): string {
  if (!plan) return 'off';
  return [plan.direct ? 'direct' : plan.strategies.join('+') || 'none', plan.level, `c${plan.complexity}`, plan.ask, ...(plan.question ? [`q=${plan.question}`] : []), ...(plan.learning ? ['learn'] : [])].join(';');
}

// ── did the reply do it ───────────────────────────────────────────────

/** Whether a reply carried out each strategy, read from its text and elements. For the trace, the evals and the tests. */
export function checkExplanation(reply: string, plan: ExplainPlan): Record<Strategy, boolean> {
  const prose = reply.replace(/```[\s\S]*?```/g, ' ').trim();
  const has = (type: string) => new RegExp('```ui\\s*\\n\\s*\\{"type":"' + type + '"').test(reply);
  const first = prose.split(/(?<=[.!?])\s/)[0] ?? '';
  const endsAsking = /\?\s*(?:\*\*)?\s*$/.test(prose);
  const out = {} as Record<Strategy, boolean>;
  for (const s of plan.strategies) {
    out[s] = (() => {
      switch (s) {
        case 'insight':
          return first.split(/\s+/).length <= 25;
        case 'analogy':
          return /\b(?:like\s+(?:a|an|the)|think\s+of|imagine|as\s+if|works\s+like|is\s+like)\b/i.test(prose);
        case 'compare':
          return has('compare') || /\|.*\|/.test(prose) || /\bwhereas\b|\bwhile\b.*\b(?:instead|but)\b/i.test(prose);
        case 'worked':
          return has('steps') || (prose.match(/^\s*(?:\d+[.)]|step\s+\d)/gim) ?? []).length >= 2;
        case 'faded':
          return /\b(?:your\s+turn|over\s+to\s+you|now\s+you|you\s+finish|last\s+step\s+is\s+yours|try\s+the\s+(?:last|next))\b|_{3,}|\?\s*$/i.test(prose);
        case 'segmented':
          return prose.split(/\s+/).length <= 180 && (has('paths') || /\b(?:next|want\s+(?:me\s+to|the\s+next)|shall\s+we)\b/i.test(prose));
        case 'pretrain':
          return (prose.slice(0, 400).match(/\*\*[^*]{2,40}\*\*/g) ?? []).length >= 1 || /\b(?:means|is\s+the\s+name\s+for|refers\s+to)\b/i.test(prose.slice(0, 400));
        case 'visual':
          return has('diagram') || has('graph') || has('sim') || has('concepts') || has('sequence');
        case 'conceptmap':
          return has('concepts') || has('diagram') || /→|->/.test(prose);
        case 'causal':
          return has('diagram') || /→|->|\bwhich\s+(?:causes|leads\s+to|means)\b|\bso\b.*\bso\b|\bbecause\b/i.test(prose);
        case 'misconception':
          return /\b(?:common|tempting|many\s+people|it\s+(?:looks|seems)\s+like|you\s+might\s+think|actually|in\s+fact|not\s+quite)\b/i.test(prose);
        case 'error':
          return /\b(?:step|line|where|slip|went\s+wrong|instead\s+of|should\s+be|mistake)\b/i.test(prose);
        case 'elaborate':
        case 'selfexplain':
        case 'retrieval':
        case 'spaced':
        case 'teachback':
          return endsAsking || has('check');
        case 'interleave':
          return has('check') || /\bwhich\s+(?:method|approach|rule)\b/i.test(prose);
        case 'argument':
          return has('claim') || (/\bbecause\b|\brests\s+on\b|\bassum/i.test(prose) && /\bobjection|\bbut\b|\bhowever\b/i.test(prose));
        case 'tradeoffs':
          return has('decide') || has('compare') || /\btrade-?off|\bon\s+the\s+other\s+hand\b|\bif\s+.+\bmatters\b/i.test(prose);
      }
    })();
  }
  return out;
}
