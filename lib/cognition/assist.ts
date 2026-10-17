// lib/cognition/assist.ts — THE COGNITIVE INTERACTION ENGINE (Logos 4).
//
// One decision per turn: what kind of help this moment wants. Direct
// information, an explanation, a check of their work, something built for
// them to work with, a challenge, the considerations behind a choice, one
// question, or room to keep going.
//
// WHY THIS IS CODE. Logos's prompt already describes every one of these
// moves and when each is right. What it could not do is SEE the evidence —
// that they asked for the answer in so many words, that the math engine just
// found their step wrong, that two of the last three replies already asked
// something, that their message rests on an assumption their own map marks as
// unexamined, that they came back to a topic after a day away. Those are
// facts about the conversation, read here deterministically, and a move is
// IMPOSED only when one of them settles it. Otherwise the reply model chooses,
// inside the constraints (the question budget above all).
//
// WHAT IS REUSED, NOT REBUILT. Core 4's explicit signals (lib/core4/signals),
// its transcript-priced question budget (lib/core4/budget, questions) and its
// stream gate (lib/core4/stream-gate, applied in the route); the accuracy
// plan (lib/accuracy) for everything mathematical. Core 4's full intervention
// selector is NOT used: it needs a cognitive state from a reader model call
// on every turn, and Logos's map already carries what that reader would infer.
//
// THE PRINCIPLES, WHERE THEY APPLY AND NOWHERE ELSE.
//   adaptive scaffolding   how much support a step gets follows the difficulty
//                          the turn shows (a wrong step, "I don't know", what
//                          they say they are) — never a trait inferred from one
//                          message
//   self-explanation       after a step the engine confirms, in a learning
//                          context, at most one invitation to say why it works
//   metacognition          an assumption doing structural work, a claim the
//                          engine refutes — named plainly
//   active construction    something built is pointed at, not described
//   calibrated reliance    nothing withheld unless they asked or the Answer
//                          Guard is up; "just tell me" is honoured
//   retrieval & spacing    only when learning, only on return after a gap —
//                          one recall question, imposed on nothing else
// These have research support in particular settings. Nothing here claims they
// make anyone smarter; they decide the shape of one reply.
//
// PURE. No model, no network, no clock (time arrives in the input).

import { readSignals } from '@/lib/core4/signals';
import { budgetFrom } from '@/lib/core4/budget';
import { questionPressure, asksAnything } from '@/lib/core4/questions';
import { EMPTY_STATE } from '@/lib/cognition/state';
import { conceptTerms } from '@/lib/core4/considered';
import type { ExplicitSignals } from '@/lib/core4/types';
import type { MapDigest } from './digest';

export { sanitizeDigest, digestOf, type MapDigest } from './digest';

export const ASSIST_MODES = ['inform', 'explain', 'verify', 'construct', 'challenge', 'perspective', 'ask', 'space', 'open'] as const;
export type AssistMode = (typeof ASSIST_MODES)[number];

export type Scaffold = 'none' | 'hint' | 'steps';

/** What the accuracy plan found this turn — the parts the engine reads. */
export interface AccuracyFacts {
  check: boolean;
  pushback: { kind: 'dispute' | 'doubt' } | null;
  /** their claims, checked: verified, refuted (unchecked ones are not here) */
  theirs: { status: string }[];
  /** something was computed for what they asked */
  computed: boolean;
  /** the plan read the turn as mathematics */
  math: boolean;
}

export interface AssistInput {
  lastUserText: string;
  /** the conversation before this turn, oldest first */
  history: readonly { role: 'user' | 'assistant'; content: string }[];
  /** the Answer Guard is up */
  guard: boolean;
  accuracy?: AccuracyFacts | null;
  /** Point & Ask: what they have selected */
  focus?: { kind: string; label: string } | null;
  /** they asked for something to be built or changed: a display, a model, a picture */
  construct?: string | null;
  map?: MapDigest | null;
  /** how long this line of thinking sat untouched before this turn, when it was resumed */
  resumedAfterMs?: number | null;
  /** more than one person is here: the room's own block governs, nothing is imposed */
  group?: boolean;
  /** signals already read by the caller (else read here) */
  signals?: ExplicitSignals;
}

export interface AssistDecision {
  mode: AssistMode;
  /** the evidence settles it: the move is imposed, not suggested */
  forced: boolean;
  /** questions the reply may put to them (enforced by the stream gate) */
  questions: 0 | 1;
  scaffold: Scaffold;
  /** invite them to say why a confirmed step works (one question, inside the budget) */
  selfExplain: boolean;
  /** open with one recall question: they are back to something they were learning */
  retrieval: boolean;
  /** what the move is about — an assumption, a conflict, the selection — in their words */
  target?: string;
  /** machine-readable, content-free reasons (for tests and the trace header) */
  reasons: string[];
}

// ── reading the turn ──────────────────────────────────────────────────

const clean = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').replace(/^\s*>.*$/gm, ' ').replace(/\s+/g, ' ').trim();

/** A question asking ABOUT them, their choice or their opinion — never a question of fact. */
const ABOUT_THEM = /\b(?:should\s+i|do\s+i|am\s+i|can\s+i|would\s+i|will\s+i|what\s+(?:do|would|should)\s+(?:you|i)\s+(?:think|do|pick|choose|recommend)|which\s+(?:one\s+)?(?:should|would)|is\s+it\s+(?:worth|better|a\s+good\s+idea)|what'?s\s+best\s+for\s+me|help\s+me\s+decide|my\s+(?:essay|story|argument|thesis|plan)\b)/i;

/**
 * A question of FACT, or a quick calculation: something with a plain answer
 * that withholding would only make them look up elsewhere. Conservative — a
 * miss leaves the move to the reply model; a false positive would impose an
 * answer on a question that wanted thinking.
 */
export function isFactQuestion(text: string): boolean {
  const t = clean(text).toLowerCase();
  if (!t || t.length > 260 || ABOUT_THEM.test(t)) return false;
  if (/^(?:what(?:'s|\s+is|\s+are|\s+was|\s+were|\s+does|\s+do)|who(?:'s|\s+is|\s+was|\s+were)?|when(?:'s|\s+is|\s+was|\s+did)|where(?:'s|\s+is|\s+are)|which\s+(?:year|country|city|element|planet|is\s+the)|how\s+(?:many|much|long|far|old|big|tall|heavy))\b/.test(t)) {
    // "what is the meaning of my life" is not a fact; "what does X mean" is
    if (/\b(?:my|our)\s+(?:life|purpose|future|career|relationship|goal)/.test(t)) return false;
    return true;
  }
  if (/^(?:define|definition\s+of|meaning\s+of|convert|translate|spell|calculate|compute|what'?s)\b/.test(t)) return true;
  // a bare quick computation: "18% of 340", "12 * 7", "5 km in miles"
  if (/^\s*\d[\d.,]*\s*(?:%\s*of|[+\-*/×÷^])\s*\d[\d.,]*\s*\??$/.test(t)) return true;
  if (/^\s*\d[\d.,]*\s*[a-z°]{1,6}\s+(?:in|to)\s+[a-z°]{1,8}\s*\??$/.test(t)) return true;
  return false;
}

/** They want the reasoning: how or why something works. */
export function wantsExplanation(text: string, s: ExplicitSignals): boolean {
  if (s.explainAsked) return true;
  const t = clean(text).toLowerCase();
  if (ABOUT_THEM.test(t)) return false;
  return /^(?:how\s+(?:does|do|did|is|are|can|come)|why\s+(?:does|do|did|is|are|would|can|was)|explain|walk\s+me\s+through|help\s+me\s+understand|i\s+don'?t\s+(?:get|understand)|what\s+does\s+.+\s+mean)\b/.test(t);
}

/** They asked Socria to make, or weigh, their decision. */
export function asksForDecision(text: string, s: ExplicitSignals): boolean {
  if (s.recommendationRequested) return true;
  return /\b(?:should\s+i\b|which\s+(?:one\s+)?should\s+i|what\s+would\s+you\s+(?:do|pick|choose)|help\s+me\s+decide|is\s+it\s+worth\s+it|what\s+do\s+you\s+recommend)\b/i.test(clean(text));
}

/** They put their own work down to be checked. */
export function offersWork(text: string): boolean {
  return /\b(?:is\s+(?:this|that|my\s+\w+)\s+(?:right|correct)|did\s+i\s+(?:get|do)\s+(?:it|this|that)\s+right|check\s+(?:my|this|it)|here'?s\s+my\s+(?:answer|working|work|solution|attempt)|i\s+got\b|my\s+answer\s+is)\b/i.test(clean(text));
}

/** Mid-flow: another idea, another item, a continuation that wants room rather than a question. */
function continuing(text: string, map: MapDigest | null | undefined): boolean {
  const t = clean(text);
  if (!t || t.includes('?') || t.length > 220) return false;
  const brainstorm = map?.context === 'brainstorming' || map?.context === 'creating' || map?.context === 'reflecting';
  return brainstorm && /^(?:and|also|plus|another|oh,?\s+and|what\s+about|maybe)\b/i.test(t);
}

/** A thing they asked to have BUILT or changed — a model, a picture, a chart — read from their words. */
export function constructAsk(text: string): string | null {
  const t = clean(text).toLowerCase();
  if (/^(?:how|what|why|is|are|does|do|can\s+i)\b/.test(t) && !/^can\s+you\b/.test(t)) return null;
  if (/\b(?:create|build|make|set\s+up|construct)\b[^.?!]{0,60}\bmodel\b/.test(t)) return 'model';
  if (/\b(?:simulate|simulation\s+of|animate)\b/.test(t)) return 'simulation';
  if (/^(?:plot|graph|draw|sketch)\b[^.?!]{0,40}(?:\by\s*=|\bf\s*\(|\bx\s*\^|\bsin|\bcos|\bfunction|\bcurve)/.test(t)) return 'plot';
  return null;
}

// ── the map ───────────────────────────────────────────────────────────

/** Share of a phrase's content words that the message also uses. */
function touches(message: string, phrase: string): number {
  const a = conceptTerms(phrase);
  if (!a.size) return 0;
  const b = conceptTerms(message);
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}

/** Was this already raised in Socria's recent replies? A challenge is made once. */
function raisedRecently(history: AssistInput['history'], phrase: string): boolean {
  const replies = history.filter((m) => m.role === 'assistant').slice(-3);
  return replies.some((m) => touches(m.content, phrase) >= 0.6);
}

/** An unexamined assumption, or a conflict, that this message leans on. */
function challengeTarget(input: AssistInput): { target: string; why: 'assumption' | 'conflict' } | null {
  const m = input.map;
  if (!m) return null;
  const text = input.lastUserText;
  for (const a of m.assumptions) {
    if (touches(text, a) >= 0.5 && !raisedRecently(input.history, a)) return { target: a, why: 'assumption' };
  }
  for (const [x, y] of m.conflicts) {
    const hits = touches(text, x) >= 0.5 ? x : touches(text, y) >= 0.5 ? y : null;
    if (hits && !raisedRecently(input.history, `${x} ${y}`)) return { target: `${x} ↔ ${y}`, why: 'conflict' };
  }
  return null;
}

const LEARNING_CONTEXTS = new Set(['learning', 'math']);
function learning(input: AssistInput, s: ExplicitSignals): boolean {
  if (s.learningGoal === false) return false;
  if (s.learningGoal === true || s.practiceIntent) return true;
  const ctx = input.map?.context ?? null;
  if (ctx === 'math') return input.map?.intent === 'learning';
  return !!ctx && LEARNING_CONTEXTS.has(ctx);
}

/** Did a recent reply already invite them to explain a step? Then not again so soon. */
function askedWhyRecently(history: AssistInput['history']): boolean {
  return history
    .filter((m) => m.role === 'assistant')
    .slice(-3)
    .some((m) => /\b(?:why\s+(?:does|do|did|is)\s+(?:that|it|this)\s+work|explain\s+(?:why|how)\s+you|in\s+your\s+own\s+words)\b/i.test(m.content));
}

/** A day away, roughly: long enough that recalling first is worth one question. */
export const RETRIEVAL_GAP_MS = 20 * 60 * 60 * 1000;

// ── the decision ──────────────────────────────────────────────────────

export function chooseAssist(input: AssistInput): AssistDecision {
  const s = input.signals ?? readSignals(input.lastUserText);
  const reasons: string[] = [];
  const acc = input.accuracy ?? null;
  const learn = learning(input, s);

  // The question budget, priced from what the person actually saw (Core 4).
  // Logos keeps two of Core's limits — never three asking replies in a row,
  // never most of the recent ones — and not the one-in-four ceiling: here a
  // precise question is one of the moves people come for, not a tax on them.
  const { streak, density } = questionPressure([...input.history, { role: 'user', content: input.lastUserText }]);
  const diminishing = { detected: s.redundancy || s.frustration, signals: [], from: null };
  const budget = budgetFrom(EMPTY_STATE, s, streak, density, diminishing, 0);
  let questions: 0 | 1 = budget.allowed;
  if (questions === 0) reasons.push('budget:spent');

  const decide = (mode: AssistMode, forced: boolean, extra: Partial<AssistDecision> = {}): AssistDecision => {
    const q = extra.questions ?? (mode === 'inform' || mode === 'construct' || mode === 'space' ? 0 : questions);
    return {
      mode,
      forced,
      questions: (s.wantsQuestions && !s.stopQuestions && mode !== 'space' ? Math.max(q, 1) : q) as 0 | 1,
      scaffold: extra.scaffold ?? 'none',
      selfExplain: extra.selfExplain ?? false,
      retrieval: extra.retrieval ?? false,
      ...(extra.target ? { target: extra.target } : {}),
      reasons: [...reasons, ...(extra.reasons ?? [])],
    };
  };

  // 1. Safety first: plain, direct help, no questions.
  if (s.safety) return decide('inform', true, { questions: 0, reasons: ['safety'] });

  // 2. Several people: the room's own instructions govern. Only the budget holds.
  if (input.group) return decide('open', false, { reasons: ['group'] });

  // 3. Pushback on something Socria said: re-check and hold ground, or own it.
  if (acc?.pushback) return decide('verify', true, { reasons: [`pushback:${acc.pushback.kind}`] });

  // 4. Coming back to something they were learning, after a gap: recall first.
  //    One question, and only when the budget and their words allow it.
  const resumed = (input.resumedAfterMs ?? 0) >= RETRIEVAL_GAP_MS;
  const priorReplies = input.history.filter((m) => m.role === 'assistant').length;
  if (resumed && learn && priorReplies >= 2 && !s.stopQuestions && s.directness !== 'answer' && !acc?.theirs.length) {
    return decide('ask', true, { questions: 1, retrieval: true, reasons: ['retrieval:resumed'] });
  }

  // 5. Being heard, said explicitly: room, not advice and not a question.
  if (s.vent) return decide('space', true, { questions: 0, reasons: ['vent'] });

  // 6. Something to be built or changed: built, and pointed at.
  if (input.construct) return decide('construct', true, { reasons: [`construct:${input.construct}`] });

  // 7. Their own work, to be checked — by the math engine where it can decide it.
  const checked = acc?.theirs ?? [];
  const wrong = checked.some((v) => v.status === 'refuted');
  const right = checked.some((v) => v.status === 'verified');
  if (checked.length || offersWork(input.lastUserText)) {
    const selfExplain = learn && right && !wrong && questions === 1 && !askedWhyRecently(input.history);
    return decide('verify', true, {
      scaffold: wrong ? (s.expertise === 'novice' || s.dontKnow ? 'steps' : 'hint') : 'none',
      selfExplain,
      reasons: [checked.length ? (wrong ? 'work:wrong' : right ? 'work:right' : 'work:checked') : 'work:offered', ...(selfExplain ? ['self-explain'] : [])],
    });
  }

  // 8. "Just tell me" / "answers only": honoured — unless the Answer Guard is
  //    up, which they set; then the next step, and a word that the guard can be
  //    lowered.
  if (s.directness === 'answer' || s.answersOnly) {
    if (input.guard && (acc?.math || acc?.computed)) return decide('explain', true, { questions: 0, scaffold: 'hint', reasons: ['answer-asked:guarded'] });
    return decide('inform', true, { questions: 0, reasons: ['answer-asked'] });
  }

  // 9. A question of fact, or a quick calculation: answered plainly.
  if (isFactQuestion(input.lastUserText)) {
    if (input.guard && acc?.math) return decide('explain', true, { questions: 0, scaffold: 'hint', reasons: ['fact:guarded'] });
    return decide('inform', true, { reasons: ['fact'] });
  }

  // 10. Point & Ask: the question is about the thing they selected — never "which one?".
  if (input.focus) {
    const mode: AssistMode = wantsExplanation(input.lastUserText, s) ? 'explain' : 'inform';
    return decide(mode, true, { target: input.focus.label, scaffold: learn && mode === 'explain' ? 'steps' : 'none', reasons: [`focus:${input.focus.kind}`] });
  }

  // 11. They want the reasoning.
  if (wantsExplanation(input.lastUserText, s)) {
    const scaffold: Scaffold = s.expertise === 'expert' ? 'none' : learn || s.expertise === 'novice' ? 'steps' : 'none';
    return decide('explain', true, { scaffold, reasons: ['explain'] });
  }

  // 12. "I don't know": a smaller step, not another question.
  if (s.dontKnow) return decide('explain', true, { questions: 0, scaffold: 'steps', reasons: ['dont-know'] });

  // 13. They asked Socria to decide: the considerations and the alternatives; the choice stays theirs.
  if (asksForDecision(input.lastUserText, s)) return decide('perspective', true, { reasons: ['decision-asked'] });

  // 14. Their message leans on an assumption their own map marks as unexamined,
  //     or on one side of a conflict on it: challenge it — once.
  const ch = challengeTarget(input);
  if (ch) return decide('challenge', false, { target: ch.target, reasons: [`challenge:${ch.why}`] });

  // 15. Mid-brainstorm: room.
  if (continuing(input.lastUserText, input.map)) return decide('space', false, { questions: 0, reasons: ['flow'] });

  // 16. Nothing settles it: the reply chooses its move, inside the budget.
  return decide('open', false, { reasons: ['open'] });
}

// ── what the reply is told ────────────────────────────────────────────

const MODE_LINE: Record<AssistMode, string> = {
  inform: 'INFORM. Give the answer or the fact plainly, first, in a sentence or two. Do not turn it into a question, and do not make them work for something they could look up.',
  explain: 'EXPLAIN. Give the reasoning plainly. Understanding is not authorship: explaining a concept takes nothing from them.',
  verify: 'VERIFY. Check what they put down and say plainly what holds and what does not. Where something is wrong, name the FIRST place it goes wrong and help them repair that step — do not silently replace their work with a clean solution.',
  construct: 'CONSTRUCT. What they asked for is being built beside this conversation by the engine. In one or two sentences, point them at what they can change in it (a value to move, a row to add, a part to drag) — let them work it rather than read about it. Do not describe it, and do not claim it exists.',
  challenge: 'CHALLENGE. Push on the point named below — plainly and first, at the reasoning and never the person. Once: if it was already conceded, press somewhere further along instead.',
  perspective: 'PERSPECTIVE. They asked you to decide. Lay out what the decision actually rests on and the one or two alternatives worth holding up against it; if a consideration clearly dominates, you may say so as your read — the decision stays theirs. Do not decide for them and do not refuse to engage.',
  ask: 'ASK. One precise question is the strongest move this turn.',
  space: 'SPACE. They are mid-flow or need to be heard. A short beat that lets them keep going — no advice they did not ask for, and no question.',
  open: '',
};

const SCAFFOLD_LINE: Record<Scaffold, string> = {
  none: '',
  hint: 'SUPPORT: the next step only — a hint that moves them, not the finished answer.',
  steps: 'SUPPORT: smaller steps than usual, one idea at a time, in plain words; check the first step lands before stacking the next.',
};

/** The block appended to the system prompt. '' when nothing is imposed and the budget is open. */
export function renderAssist(d: AssistDecision): string {
  const lines: string[] = [];
  if (d.mode !== 'open') lines.push(`${d.forced ? 'The move this turn' : 'The move this turn, unless you see a clearly stronger one'} — ${MODE_LINE[d.mode]}`);
  if (d.target) lines.push(`ABOUT: "${d.target.slice(0, 160)}"${d.reasons.some((r) => r.startsWith('focus:')) ? ' — what they selected in the workspace; answer about it, never ask which one they mean.' : ''}`);
  const sl = SCAFFOLD_LINE[d.scaffold];
  if (sl) lines.push(sl);
  if (d.reasons.includes('safety')) lines.push('SAFETY: what they wrote may mean they are in danger now. Put everything else aside — the map, the topic, the method. Respond with care, plainly and directly. If they might harm themselves, say you are glad they told you, and urge them to reach someone right now: in the US, call or text 988 (Suicide & Crisis Lifeline); elsewhere, their local emergency number. If someone is in immediate danger, emergency services first.');
  if (d.retrieval) lines.push('THEY ARE BACK after a gap on something they were learning. Before adding anything new, ask them — in one short question — to recall the key idea from last time in their own words. Then stop and let them answer.');
  if (d.selfExplain) lines.push('Their step checks out. Say so in a sentence, then — once — ask them why it works, in their own words. Skip it if they were already asked.');
  if (d.questions === 0) lines.push('QUESTIONS: none this turn. End on a statement — no question, no "want me to…?" offer.');
  else if (d.mode !== 'ask' && !d.retrieval && !d.selfExplain) lines.push('QUESTIONS: at most one, and only if it is the strongest thing to say.');
  if (!lines.length) return '';
  return `\n\n=== How to help on this turn (Socria's own reading of the conversation — never mention it) ===\n${lines.join('\n')}\n`;
}

/** Content-free: the mode, whether it was imposed, the questions allowed, the reasons. */
export function assistTrace(d: AssistDecision): string {
  return `${d.mode};forced=${d.forced ? 1 : 0};q=${d.questions};${d.reasons.join(',')}`.slice(0, 200);
}

/** For a caller holding a finished reply: did it ask anything? (Core 4's own reading.) */
export const replyAsks = asksAnything;
