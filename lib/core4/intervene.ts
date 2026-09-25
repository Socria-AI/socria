// lib/core4/intervene.ts
//
// The Intervention Engine: given who does what (allocation), how much asking
// the conversation can bear (budget), whether the current strategy has
// stopped paying (diminishing returns), what the person has already
// considered, and how recent moves landed — choose ONE move, and say why.
//
// What changed from the old router, and why:
//
//   The old router's defaults were Socratic: ASK when nothing had taken
//   shape, HINT for debugging, a withholding CHALLENGE for any wrong attempt.
//   Here the defaults CONTRIBUTE or ANSWER, and holding back happens only
//   where the allocation carries an explicit withhold reason.
//
//   The old question limit priced one label. Here every move carries
//   `maxQuestions`, set from the budget, and QUESTION / CLARIFY cannot be
//   chosen at all when the budget is spent — so the engine must change
//   strategy rather than relabel the question.
//
//   Diminishing returns switch strategy explicitly (asking → contributing or
//   answering; pressing → synthesising; a redundant contribution → getting
//   out of the way), and the switch is recorded.
//
// Pure. Deterministic. Every decision carries its reason.

import type { CognitiveState } from '../cognition/state';
import type {
  Allocation,
  Diminishing,
  ExplicitSignals,
  Coverage,
  Proportion,
  CommunicationPrefs,
  InterventionDecision,
  InterventionType,
  QuestionBudget,
} from './types';
import { EVIDENCE_WITHHELD } from './types';
import { familyOf } from './budget';
import { mustNotPerform } from './split';

export interface SelectInput {
  state: CognitiveState;
  allocation: Allocation;
  budget: QuestionBudget;
  diminishing: Diminishing;
  signals: ExplicitSignals;
  /** what the person has already considered (their items, most relevant first) */
  considered: string[];
  /**
   * Their actual last message.
   *
   * `state.currentFocus` is the cheap reader's one-line summary, and summaries
   * are uniformly abstract — it renders both "I'm worried about McCombs" and a
   * message carrying five figures as a short abstract phrase, so it cannot tell
   * a bare opening from a brief with material in it. `proportionFor` needs the
   * words the person typed.
   */
  lastUserText?: string;
  /**
   * Whether they have put any of their own material down yet. Under human
   * ownership this decides between drawing the first fragment out of them and
   * developing what is already there — see hasOwnMaterial.
   */
  material?: boolean;
  /** their standing preference for how much is said — a bias, never a template */
  prefs?: CommunicationPrefs;
}

/** Moves whose content raises a perspective, a question or a challenge: the novelty gate reads them. */
export const PERSPECTIVE_MOVES = new Set<InterventionType>(['QUESTION', 'CLARIFY', 'HINT', 'CHALLENGE', 'CRITIQUE', 'CONTRIBUTE']);

/** Modes where an ANSWER is itself a contribution to their thinking ("what else should I worry about?"). */
export const THINKING_MODES = new Set(['HUMAN_LEADS', 'SHARED_REASONING', 'AI_ASSISTS']);

/**
 * Does the novelty gate read this move? Perspective moves always; an answer
 * given while thinking together, when there is a considered record to
 * repeat. Pure information answers are never gated.
 */
export function noveltyGated(type: InterventionType, mode: string, considered: number): boolean {
  return PERSPECTIVE_MOVES.has(type) || (type === 'ANSWER' && THINKING_MODES.has(mode) && considered > 0);
}

// Ceilings, not targets: the prompt asks for the length the moment
// deserves. Run 4 (held-out): every decision and expert loss was "the
// baseline contributed more", on budgets of 900 (ANSWER) and 450
// (CHALLENGE) against the baseline's 1200. A substantive move now gets the
// same ceiling as the strongest prompt; the moves that are short by nature
// stay short.
const TOKENS: Partial<Record<InterventionType, number>> = {
  ANSWER: 1200, EXPLAIN: 1200, EXECUTE: 1200, CALCULATE: 900, CORRECT: 1200, VERIFY: 800, CRITIQUE: 1200,
  SYNTHESIZE: 1200, RETRIEVE: 900, CONTRIBUTE: 1200, CHALLENGE: 1200, CONNECT: 1200, HINT: 250, QUESTION: 200,
  CLARIFY: 250, REFLECT: 200, GET_OUT_OF_THE_WAY: 120,
};


/**
 * What the reply may not do, by dimension, in words a model acts on.
 *
 * Short on purpose. This is appended to whatever objective the chosen move
 * already has, on every turn where the split reserves something, so it has to
 * read as one more constraint rather than as a second set of instructions
 * arguing with the first. It never mentions Human-First, ownership, allocation
 * or any other internal vocabulary: it says what not to write.
 */
const RESERVED: Record<string, string> = {
  creativity:
    'THE SUBSTANCE OF THIS IS THEIRS: do not supply a premise, plot, character, theme, title, concept, angle, direction or argument of your own, in any wording — "consider…", "one idea would be…", "what about…", "here\'s a possible…", an example and a list of options are the same act.\n'
    + 'AND YOU OWE THEM SOMETHING CONCRETE FOR IT — a reply that only declines, or only asks, has failed as badly as one that writes it. Give a METHOD for originating it, pointed at what they already have rather than at invention: somebody they can still picture, a place they know the smell of, a thing said once that never resolved, an object, a constraint worth writing against. Say which kind of starting point tends to carry a piece like this and why. Add the craft knowledge the form needs. Then ask for whatever they have, in one line at the end — not as the whole reply.',
  judgment:
    'THE CHOICE IS THEIRS: do not name the option to take, including by implication ("the stronger option is", "I would", "the obvious move"). If they ask you outright for your view, give it.\n'
    + 'AND YOU OWE THEM THE FRAME IT TURNS ON: what each way costs if it goes WRONG rather than gains if it goes right, the assumption each one needs to be true, which evidence exists and which does not, what would settle it, and the strongest case against whichever way they are leaning. Specific to their situation, with their own numbers where they gave any. A reply that lists tradeoffs generically has not helped.',
  reasoning:
    'THE STEP THEY ARE WORKING ON IS THEIRS: do not carry their own problem to its answer, in any wording — "so you get…", a final value, or their numbers worked through are the same act.\n'
    + 'AND YOU OWE THEM EVERYTHING AROUND IT, which is most of an answer: what kind of problem this is, which method applies and WHY it applies here, the facts, definitions and notation, the arithmetic, and a fully worked ANALOGOUS case with different numbers. Find where they are actually stuck rather than restarting from the top. Then say you will check their step, or give it outright if they would rather.',
};
function d(
  type: InterventionType,
  o: {
    reasonCode: string;
    reason: string;
    intended: string;
    objective: string;
    alloc: Allocation;
    maxQuestions?: 0 | 1;
    confidence?: number;
    switchedFrom?: string | null;
    avoid: string[];
    /** a ceiling this move needs instead of its type's — see creation.elicit */
    maxTokens?: number;
    /** read whole before anybody sees it, even with nothing withheld */
    buffered?: boolean;
  }
): InterventionDecision {
  const maxQuestions = o.maxQuestions ?? 0;
  // ── THE CHOKE POINT ────────────────────────────────────────────────
  //
  // ONE PLACE, AND EVERY MOVE GOES THROUGH IT. The branches above write specific
  // instructions for the cases they know about; this catches the cases nobody
  // wrote a branch for. A measured example: "you choose" on the third turn of a
  // creative conversation reached the generic "answer what they asked" move with
  // no clause on it and nothing buffered — three sentences of ordinary impatience
  // away from a written story, because one branch did not fire.
  //
  // A missing branch must not be able to turn Core 4 into an ordinary assistant.
  // So whatever the move, if the split reserves a dimension: the constraint is
  // appended to the objective, and the turn is read whole before anybody sees it,
  // because a guard that runs after the text has streamed enforces nothing.
  //
  // Exempt: a view they asked for outright (recommendation.requested) and the
  // safety path, which only ever produces more help.
  const reserved = o.reasonCode === 'recommendation.requested' || o.reasonCode === 'safety'
    ? []
    : mustNotPerform(o.alloc.split);
  const clause = reserved.length ? RESERVED[reserved[0]] : '';
  const objective = clause && !o.objective.includes(clause) ? `${o.objective}\n${clause}` : o.objective;
  return {
    type,
    reasonCode: o.reasonCode,
    reason: o.reason,
    intendedOutcome: o.intended,
    humanWorkPreserved: o.alloc.withhold?.what ?? (o.alloc.humanWork[0] ?? null),
    aiWorkPerformed: o.alloc.aiWork.join(', ') || 'none',
    confidence: Math.round(Math.min(o.confidence ?? o.alloc.confidence, 1) * 100) / 100,
    // Buffered and read whole before sending ONLY when something is held
    // back (council D8): buffering every perspective move put the latency on
    // exactly the expert turns. Everything else streams through the sentence
    // gate, which holds questions (and drops re-asked ones) until the end.
    guardRequired: !!o.alloc.withhold || !!o.buffered || reserved.length > 0,
    maxQuestions,
    objective,
    avoid: o.avoid.slice(0, 12),
    switchedFrom: o.switchedFrom ?? null,
    maxTokens: o.maxTokens ?? TOKENS[type] ?? 600,
    coverage: 'normal',
    proportion: 'normal',
    questionsAreContent: false,
    forced: false,
  };
}

/** Did the same move just land badly? Then do not repeat it. */
function landedBadly(s: CognitiveState, type: InterventionType): boolean {
  const last = s.history[s.history.length - 1];
  return !!last && last.type === type && !!last.outcome &&
    ['WAS_REDUNDANT', 'WAS_TOO_INDIRECT', 'FRUSTRATED_USER', 'CONFUSED_USER'].includes(last.outcome.label);
}

function recentlyChallenged(s: CognitiveState): boolean {
  return s.history.slice(-2).some((h) => h.type === 'CHALLENGE' || h.type === 'CRITIQUE');
}

/** Moves imposed because the PERSON or a verified fact asked for them (council D1). */
const FORCING = new Set([
  'safety', 'practice.bottom_out', 'practice.let_me_try', 'quiz.contract', 'done',
  'recommendation.requested', 'retrieve.history', 'reflect.heard', 'reflect.minimal',
  // THE OWNERSHIP MOVES, and they belong here for the same reason the rest do:
  // the PERSON imposed them by saying whose the work is. They are also the
// ── READ WHOLE, NOT STREAMED ─────────────────────────────────────────
//
// The guard is one of the three places the invariant is enforced, and on a
// STREAMED turn it cannot enforce anything: the regeneration path in the chat
// route lives inside `if (buffered)`, so on an unbuffered turn a takeover is
// recorded and shipped. Every move whose substance is the person's to originate
// therefore sets `buffered: true` — the withhold turns were already buffered by
// council D8, and these are the ones that carry the invariant WITHOUT a withhold
// to rest on (there is no quote to rest one on when nobody was asked).
//
// The cost is that turn's first-token latency and nothing else: information,
// explanation, execution, diagnosis and verification turns still stream.
// Judgement and scaffolded-reasoning turns also still stream, which is the one
// place the guard remains advisory — see the report.

  // moves whose whole instruction lives in the objective — "ask for their
  // fragment, and give no examples, because an example is the creative act" —
  // and an unforced turn never prints its objective (council D1). Left
  // unforced, the most important instruction in the system reached nobody, and
  // the model was free to answer an empty page with a premise.
  'creation.elicit', 'creation.elicit.again', 'creation.critique', 'ownership.theirs',
  'reason.scaffold', 'judgment.scaffold', 'creation.asked.to.finish',
]);

/**
 * Moves that carry substance. A reply that explains, decides, corrects,
 * critiques or connects can be worth more when it covers more; a hint that
 * covers more has stopped being a hint.
 */
const SUBSTANTIVE = new Set<InterventionType>([
  'ANSWER', 'EXPLAIN', 'CRITIQUE', 'SYNTHESIZE', 'CHALLENGE', 'CONNECT',
  'CONTRIBUTE', 'CORRECT', 'EXECUTE', 'CALCULATE', 'VERIFY',
]);

/** Moves that are short by nature — there is nothing to be complete about. */
const BRIEF_BY_NATURE = new Set<InterventionType>([
  'HINT', 'QUESTION', 'CLARIFY', 'REFLECT', 'GET_OUT_OF_THE_WAY',
]);

/**
 * How much of what matters this reply should cover.
 *
 * Run 8 (power-user suite, 8 held-out scenarios, blind judges): Core 4 lost
 * 6 of 8 to a prompt-only frontier baseline, mean reply 280 words against
 * 425, and in this sample mean length correlates with the judges'
 * helpfulness score at r = 0.50. On agency, peer and friction Core 4 was
 * level or ahead — friction 1.75 against 3.00 — so the gap was not manner.
 * It said less. On 12 of those 22 turns its own state block already read
 * `stakes: high` and `expertise: expert`, which is exactly the case the
 * prompt names as the exception to its own brevity default. Nothing carried
 * that reading from the allocator to the length policy, so the nearer, more
 * concrete instruction won.
 *
 * The gates are deliberately narrow, because the opposite failure is on
 * record too: runs 4–6 lost expert turns for padding past a length the
 * person had asked for. So both conditions must hold, the move must be one
 * that carries substance, and any explicit length the person gave wins
 * outright.
 */
/**
 * What did they actually give us to work with?
 *
 * NOT LENGTH. "I'm worried about whether I'm doing enough for McCombs" is ten
 * words; "Here are my churn numbers and the raise timing, what breaks?" is
 * eleven. A word count cannot tell them apart, and the first was reaching the
 * same 1200-token ceiling as the second.
 *
 * What separates them is CONCRETE MATERIAL: figures, named things, units,
 * artifacts — the stuff a reply can actually be about — and whether they posed
 * something answerable. A turn with neither is an opening, not a brief, and the
 * useful reply to an opening is one or two sentences that say something true,
 * not a paragraph that covers the possibilities.
 */
const REQUESTY = /\?|\b(?:how do i|what should|which|walk me|talk me|explain|show me|help me (?:with|write|fix|plan)|give me|draft|write|fix|debug|calculate|compare|review)\b/i;

/** Digits, units, capitalised names mid-sentence, code, paths — things with referents. */
function concreteness(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  let n = 0;
  n += (t.match(/\d/g) ?? []).length ? 2 : 0;
  n += (t.match(/[%$£€]|\b(?:ms|kb|mb|gb|rps|qps|bps|days?|weeks?|months?|years?|hours?)\b/gi) ?? []).length ? 1 : 0;
  // A capitalised word that is not sentence-initial and not "I" is usually a
  // name: a table, a vendor, a school, a branch.
  n += (t.match(/(?<=[a-z,;:]\s)[A-Z][a-zA-Z0-9_.-]{2,}/g) ?? []).length ? 1 : 0;
  n += /`|```|\/\w+\/|\.\w{2,4}\b|\b[A-Za-z_]\w*\(\)/.test(t) ? 2 : 0;
  return n;
}

/**
 * Have THEY put anything down yet?
 *
 * The question the creative-ownership failure turned on. "Mine" arrived with
 * an empty page, and the move chosen was CRITIQUE — critique of material that
 * did not exist, at a 1200-token ceiling, with "options where useful". A model
 * told to critique nothing invents something to critique, and what it invents
 * is the protagonist, the setting and the conflict: the creative act, already
 * performed, in a reply that was formally obeying a withhold.
 *
 * Deliberately crude, and biased toward "they have something". An instruction
 * ("write me a story"), an answer ("mine"), a nudge ("okay help me") are not
 * material; a paragraph, a pasted draft, a list of their own fragments is. The
 * cost of reading material as absent is one question asking for it, which is
 * the right move anyway; the cost of reading absence as material is a reply
 * that invents the thing.
 */
export function hasOwnMaterial(userMessages: readonly string[]): boolean {
  for (const raw of userMessages) {
    const t = (raw ?? '').trim();
    if (!t) continue;
    // Their own words at length, a quotation, a pasted block, or a list they
    // wrote: each is something to work ON.
    if (/```|\n\s*[-*\d]/.test(t)) return true;
    if (/["“][^"”]{20,}/.test(t)) return true;
    const words = t.split(/\s+/).length;
    if (words >= 14 && !/^\s*(?:write|make|draft|create|generate|give me|help me|brainstorm)\b/i.test(t)) return true;
  }
  return false;
}

export function proportionFor(input: SelectInput, dec: InterventionDecision): Proportion {
  const { state: s, signals } = input;
  // THE ALLOCATOR OUTRANKS THE LENGTH POLICY. Both of the generative reads it
  // acts on have already been given a ceiling that fits what their objective
  // asks for — one short ownership question (90), a small started piece (200),
  // or two or three concrete directions (600). Trimming any of them to two
  // sentences would leave the reply unable to contain the part that makes it
  // help rather than an interrogation.
  //
  // This is the priority order as code: allocation decides WHAT work Socria
  // takes over, and the length policy shapes what is left. It must not be able
  // to shrink a reply below the work the allocator assigned.
  if (input.allocation.ownership === 'ambiguous' || input.allocation.ownership === 'theirs') return 'normal';
  // AND THE TURN THAT DOES THE DELEGATED WORK IS NEVER TRIMMED.
  //
  // The ownership question is engineered to be answered in one word, and a
  // one-word message is exactly what the length policy reads as an opening —
  // so "write a story" / "yours, or mine?" / "yours" produced a story in one
  // or two sentences, hard-capped at 220 tokens. The feature failed at its own
  // payoff. An instruction about who does the work is not a short open turn;
  // it is the shortest possible way to commission something.
  if (input.allocation.ownership === 'delegated' && (signals.delegate || signals.ownWork)) return 'normal';
  // Their words win, in both directions: a length they asked for, or an
  // explicit ask for detail, is never overridden by our reading of the turn.
  if (signals.requestedTokens || signals.explainAsked || signals.sentences) return 'normal';
  // NOT `answersOnly`. "Answers only, no explanations" means no prose AROUND
  // the answer — it does not mean a short answer, and "the complete code, no
  // explanations" is long and wanted (run 5). Capping tokens on it would
  // truncate the very thing they asked for.
  if (signals.done) return 'brief';
  // Moves that are short by nature are already short; saying it twice would
  // make a brief reply a curt one.
  if (BRIEF_BY_NATURE.has(dec.type)) return 'normal';
  // Real work they handed over is never trimmed on these grounds.
  if (s.work === 'execution' || s.work === 'verification' || s.work === 'practice' || s.work === 'diagnosis') return 'normal';
  if (s.attempt !== 'none' || s.blockingUnknown) return 'normal';

  const text = (input.lastUserText ?? s.currentFocus ?? '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  // NEVER TRIM ON ABSENT DATA. With no message text there is no evidence that
  // this was a short open turn, and defaulting to brief made every caller that
  // does not supply the text — including the policy tests — silently lose its
  // ceiling. Missing evidence is not evidence.
  if (!words) return 'normal';
  const asked = REQUESTY.test(text);
  const concrete = concreteness(text);

  // THEIR STANDING PREFERENCE, as a bias on the reading rather than a rule over
  // it. Concise leans brief on a turn that could go either way; Detailed leans
  // the other way. Neither overrides what they asked for in THIS message —
  // someone who set Concise and then asks for the full derivation gets it,
  // which is why this sits after the explicit-signal checks above and not
  // before them.
  const pref = input.prefs?.length ?? 'standard';
  if (pref === 'detailed') return 'normal';

  // A REQUEST IS ENOUGH ON ITS OWN. The first version also demanded concrete
  // material and so trimmed "Here are my churn numbers and the raise timing,
  // what breaks?" to 220 tokens — a real question about real material, gutted,
  // which is the opposite failure and the worse one. Someone who asks for
  // something gets a real answer; the length then follows the move.
  if (asked) return 'normal';
  // Material to work with, even unasked: they pasted an error, quoted a figure,
  // named a system. That is a brief, not an opening.
  if (concrete >= 2 || words > 40) return 'normal';
  // Short, abstract, nothing named and nothing asked. An opening, not a brief —
  // and the shape that was getting a paragraph of reassurance.
  if (words <= 30) return 'brief';
  // Concise widens the band that counts as an opening. It does not force brief
  // onto a turn with real material or a real question: those returned above.
  return pref === 'concise' ? 'brief' : 'normal';
}

export function coverageFor(input: SelectInput, dec: InterventionDecision): Coverage {
  const { state: s, allocation: a, signals } = input;
  // A length they named, a standing "answers only", a close: their words.
  if (signals.sentences || signals.done || signals.answersOnly || s.answersOnly) return 'minimal';
  if (BRIEF_BY_NATURE.has(dec.type)) return 'minimal';
  if (!SUBSTANTIVE.has(dec.type)) return 'normal';
  // Never beside a withhold: "cover everything that matters" next to "keep
  // this one thing from them" is a contradiction, and the contradiction
  // resolves as a leak.
  if (a.withhold) return 'normal';
  const known = s.expertise.source === 'explicit' || s.expertise.source === 'observed' || s.expertise.confidence >= 0.6;
  if (!known || s.expertise.value !== 'expert') return 'normal';
  if (s.stakes.value !== 'high') return 'normal';
  return 'complete';
}

export function selectIntervention(input: SelectInput): InterventionDecision {
  let dec = selectMove(input);
  const a = input.allocation;
  dec = {
    ...dec,
    forced:
      !!a.withhold ||
      FORCING.has(dec.reasonCode) ||
      a.reasonCode.startsWith('answer.requested') ||
      a.reasonCode === 'safety' ||
      input.signals.flagOnly || input.state.flagOnly ||
      input.signals.stopQuestions ||
      // Their words about how to be helped, now or standing, impose the move.
      input.signals.directness !== 'none' ||
      (input.state.directness.source === 'explicit' && input.state.directness.value !== 'none'),
  };
  // An exact sentence count they asked for is part of the task (run 6:
  // expert-004 and expert-009 lost for padding past "one sentence" and "two
  // sentences").
  if (input.signals.sentences) {
    const n = input.signals.sentences;
    dec = { ...dec, forced: true, objective: `${dec.objective} They asked for ${n === 1 ? 'one sentence' : `${n} sentences`}: write exactly that many, and nothing before or after.` };
  }
  // ── expert calibration ──────────────────────────────────────────
  //
  // Before this, `expertise` was read in ONE branch of the allocator (fix it
  // or explain it) and nowhere else, so "Core 4 adapts to your expertise" was
  // a single boolean at a single fork. It now changes the pitch of every
  // teaching move — which is where a knowledgeable person actually notices,
  // because the failure they complain about is being told what they already
  // know, not being routed to the wrong move.
  //
  // Only on moves that TEACH something. Reflection, getting out of the way
  // and asking are unaffected: there is no register to calibrate.
  const TEACHING = new Set<InterventionType>(['EXPLAIN', 'ANSWER', 'CORRECT', 'VERIFY', 'HINT', 'CALCULATE', 'EXECUTE']);
  const x = input.state.expertise;
  const shown = x.source === 'explicit' || x.source === 'observed' || x.confidence >= 0.6;
  if (shown && TEACHING.has(dec.type)) {
    if (x.value === 'expert') {
      dec = { ...dec, objective: `${dec.objective} They know this domain: no definitions of terms they used correctly, no ground-up teaching, no restating their own setup. Assume the standard material and spend the words on what is specific to their case.` };
    } else if (x.value === 'novice') {
      dec = { ...dec, objective: `${dec.objective} They are new to this: name the principle before applying it, keep the steps explicit, and define any term you introduce.` };
    }
  }

  // A length they asked for sets the budget (council D17).
  if (input.signals.requestedTokens) dec = { ...dec, maxTokens: Math.min(4000, Math.max(dec.maxTokens, input.signals.requestedTokens)) };
  // "Answers only, no explanations" (their words or the Project), unless this
  // turn they ask why (run 5, adversarial-005: margin-2 losses to both
  // baselines for explanations a stated preference ruled out).
  // No token cap: "the complete code, no explanations" is long and wanted
  // (review before run 6). Not on a withheld turn, where "give the answer"
  // would contradict the move.
  if ((input.signals.answersOnly || input.state.answersOnly) && !input.signals.explainAsked && !input.signals.safety && !a.withhold && dec.type !== 'GET_OUT_OF_THE_WAY') {
    dec = {
      ...dec,
      forced: true,
      objective: `${dec.objective} They asked for answers only: give the answer — the command, value, line or verdict — and nothing around it. No explanation, rationale or background; one short caveat only if the answer would be wrong or unsafe without it.`,
    };
  }
  // Questions they ASKED FOR (interview questions, a quiz, practice problems)
  // are the content of the reply, not interrogation: the budget does not
  // price them and the guard does not strip them (council D4).
  dec = { ...dec, coverage: coverageFor(input, dec) };
  // Coverage wins where it fired: a high-stakes call for someone who works in
  // the area has earned its length by a stronger signal than the shape of one
  // message.
  const prop = dec.coverage === 'complete' ? 'normal' : proportionFor(input, dec);
  dec = {
    ...dec,
    proportion: prop,
    maxTokens: prop === 'brief' ? Math.min(dec.maxTokens, 220) : dec.maxTokens,
  };
  return input.signals.requestsQuestions ? { ...dec, questionsAreContent: true } : dec;
}

function selectMove(input: SelectInput): InterventionDecision {
  const { state: s, allocation: a, budget, diminishing, considered } = input;
  const avoid = considered;
  const can = budget.allowed;
  const switchedFrom = diminishing.detected ? diminishing.from : null;
  const dimNote = diminishing.detected ? ` Strategy changed: ${diminishing.signals.join('; ')}.` : '';
  const consideredNote = avoid.length
    // The heading has to be one the REPLY prompt actually contains. "Already
    // on the table" is the STATE READER's heading (engine.ts) and appears
    // nowhere the reply model can see, so this pointed at nothing — an
    // instruction to look somewhere that does not exist is worse than no
    // instruction, because it spends the model's attention on a search.
    ? ' They have already considered the items listed under "Already raised" below — do not raise any of them as new; go past them.'
    : '';

  // ── the person asked about their own earlier reasoning ──
  if (/\b(why did (?:we|i)|what did (?:we|i) (?:decide|conclude|say)|remind me (?:what|why|how)|how did (?:we|i) get (?:here|to)|where did (?:we|i) (?:land|leave))\b/i.test(s.currentFocus) || (s.latest === 'question' && s.work === 'information' && /\b(earlier|last time|before|previously)\b/i.test(s.currentFocus))) {
    return d('RETRIEVE', {
      reasonCode: 'retrieve.history', reason: 'They asked about their own earlier reasoning.',
      intended: 'An accurate reconstruction of how their thinking got here.',
      objective: 'Reconstruct from what is recorded (the reasoning ledger and memory blocks) how their thinking got here: what they held, what changed it, and why — in order. Attribute ideas correctly: anything that was Socria’s suggestion is Socria’s, not theirs. Say plainly where the record is silent instead of filling the gap.',
      alloc: a, avoid,
    });
  }

  // "Got it, thanks" with nothing new: a short close (council D5 DONE).
  if (input.signals.done && !a.withhold && s.latest !== 'question') {
    return d('GET_OUT_OF_THE_WAY', {
      reasonCode: 'done', reason: 'They signalled they have what they need.',
      intended: 'They leave with it.',
      objective: 'A short close — a few words. No question, no offer, no new point.',
      alloc: a, avoid,
    });
  }

  // Harm now: direct, immediate, complete (council D1 safety gate).
  if (a.reasonCode === 'safety') {
    return d('ANSWER', {
      reasonCode: 'safety', reason: a.rationale,
      intended: 'They know exactly what to do right now.',
      objective: 'Lead with the immediate action, in plain imperative sentences, numbered if there is a sequence. Say when to call emergency services and which number. No questions, no caveats before the action, no teaching.',
      alloc: a, avoid,
    });
  }

  // The ladder bottomed out: work it, name the principle, hand the next one back (council D6).
  if (a.reasonCode === 'practice.bottom_out') {
    return d('EXPLAIN', {
      reasonCode: 'practice.bottom_out', reason: a.rationale,
      intended: 'They see the whole solution once, with the principle labelled, and can do the next one.',
      objective: 'Work this item fully, step by step, and name the principle each step uses. Then state (do not ask) one similar item they can try next. No questions.',
      alloc: a, avoid,
    });
  }

  // A quiz or drill they asked for (council D4 contract): exactly one item
  // per turn, after saying whether their last answer was right. Streak and
  // density do not apply; "stop", "enough", "just tell me" or frustration
  // end it (the budget already returns 0 then). Pilot finding 8: without
  // this, a requested drill got an explanation with no next item.
  if (s.questionsPreference === 'wanted' && budget.allowed === 1 && a.reasonCode !== 'practice.bottom_out' && !input.signals.stopQuestions && input.signals.directness !== 'answer') {
    const answered = s.latest === 'attempt' || s.attempt !== 'none' || s.latest === 'answer';
    return d('QUESTION', {
      reasonCode: 'quiz.contract', reason: 'They asked to be quizzed.',
      intended: 'They retrieve the next item themselves.',
      objective: answered
        ? 'First say plainly whether their last answer was right, and if not, what the right answer is and why (one or two sentences). Then pose the next item — exactly one, and nothing that answers it.'
        : 'Pose the first item — exactly one, and nothing that answers it.',
      alloc: a, avoid, maxQuestions: 1,
    });
  }

  // "Let me try it first" with nothing tried yet: get out of the way (council D6).
  if (a.withhold && s.attempt === 'none' && s.latest !== 'question' && input.signals.evidence.some((e) => /let me try/i.test(e))) {
    return d('GET_OUT_OF_THE_WAY', {
      reasonCode: 'practice.let_me_try', reason: 'They asked to try it first.',
      intended: 'They try it.',
      objective: 'Say "Go ahead" or equivalent in a few words. No hint, no question.',
      alloc: a, avoid,
    });
  }

  // Blocked on something only THEY can supply, while Socria does the work:
  // proceed under a stated assumption rather than stopping to ask (council
  // D4 removed the re-grant of a question for blockers). Telling them what
  // to send next is an instruction, not a question.
  if ((a.mode === 'AI_EXECUTES' || a.mode === 'AI_EXPLAINS') && s.blockingUnknown) {
    return d(a.mode === 'AI_EXECUTES' ? 'EXECUTE' : 'EXPLAIN', {
      reasonCode: 'blocking_unknown.assume', reason: `Missing: ${s.blockingUnknown}. Proceeding under a stated assumption.`,
      intended: 'They get everything that can be said now, and know exactly what would settle the rest.',
      objective: `Give everything you can with what is here, concretely. Where it depends on ${s.blockingUnknown}, state the most likely case as an explicit assumption ("Assuming X, …; if instead Y, …"). If one thing from them would settle it, say what to send as an instruction ("Paste the first red line above the error."), not as a question.`,
      alloc: a, avoid,
    });
  }

  switch (a.mode) {
    case 'HUMAN_REFLECTS': {
      const brief = s.latest === 'reaction' || s.latest === 'other';
      return d(brief ? 'GET_OUT_OF_THE_WAY' : 'REFLECT', {
        reasonCode: brief ? 'reflect.minimal' : 'reflect.heard', reason: a.rationale,
        intended: 'They feel accurately heard and keep thinking in their own direction.',
        objective: brief
          ? 'A brief, genuine acknowledgement. Nothing to solve, nothing to ask. One or two sentences.'
          : 'Say back precisely what they are dealing with — the specific thing, in plain words, not a summary of feelings. At most one observation they may not have put into words. No advice, no reframing, no questions, no therapy language.',
        alloc: a, avoid,
      });
    }

    case 'AI_EXECUTES': {
      const calc = /\d/.test(s.currentFocus) && /\b(calculat|comput|how much|how many|convert|sum|total|percent|%|interest|rate|average|mean)\w*/i.test(s.currentFocus);
      return d(calc ? 'CALCULATE' : a.reasonCode.startsWith('answer.requested') || s.work === 'information' ? 'ANSWER' : 'EXECUTE', {
        reasonCode: a.reasonCode, reason: a.rationale,
        intended: 'They have the result and can move on.',
        objective: calc
          ? 'Compute it exactly and give the result first. Show the arithmetic compactly so it can be checked. No questions.'
          : 'Give the answer or do the work, first and plainly. Then only the reasoning that matters for using it. No preamble, no question back, no offer to do more.',
        alloc: a, avoid,
      });
    }

    case 'AI_EXPLAINS': {
      const heldBack = a.withhold?.reason === 'assessment_integrity';
      return d('EXPLAIN', {
        reasonCode: a.reasonCode, reason: a.rationale,
        intended: heldBack ? 'They can do the graded item themselves, knowing why the final answer was held back.' : 'They understand it well enough to use it.',
        objective: heldBack
          ? 'Explain the method completely, with a worked example on a DIFFERENT but analogous problem. Do not give the final answer to their graded item, and say so once, plainly and without moralising: it is graded work they are submitting as their own. No questions.'
          // THE LADDER BOTTOMS OUT INTO THE METHOD, NOT INTO THEIR ANSWER.
          //
          // Three attempts that did not land is evidence about where somebody
          // IS, and endless hints to somebody genuinely stuck is its own
          // failure — so this turn resolves it. It resolves it by working the
          // technique all the way through on a problem that is not theirs and
          // naming the exact step theirs goes wrong at, which un-sticks them
          // completely without taking the one thing they were doing.
          : a.reasonCode === 'practice.stuck'
            ? 'They have tried this several times and it is not landing, so resolve it — but resolve it with the METHOD, not with their answer. '
              + 'Work the technique completely through an ANALOGOUS problem with different numbers, so every step is visible. Then name the exact step in THEIR attempt where it goes wrong and what rule it broke. '
              + 'Do not compute their final value and do not carry their numbers through to it — after this they will be able to, which is the point. No questions, no encouragement.'
          : s.stuck !== 'no'
            ? 'They are stuck: explain it clearly and completely, starting from the specific point they are stuck on. Concrete, then general. No questions back.'
            : 'Explain it clearly at the level they are working at. Lead with the answer to what they asked; add only the reasoning that makes it usable. No questions back.',
        alloc: a, avoid,
      });
    }

    case 'AI_VERIFIES': {
      // Anything withheld on a wrong attempt keeps the redo with them —
      // whether they said "I'm practising" or "don't tell me".
      const practice = !!a.withhold;
      if (s.attempt === 'right') {
        return d('VERIFY', {
          reasonCode: 'verify.right', reason: 'Their attempt is correct.',
          intended: 'They know they have it and why — and are not quizzed for being right.',
          objective: 'Tell them plainly that it is right, and what specifically makes it right. If there is one genuinely useful extension or edge case, one sentence on it. Then stop — no new quiz.',
          alloc: a, avoid,
        });
      }
      return d(practice ? 'VERIFY' : 'CORRECT', {
        reasonCode: practice ? 'verify.practice' : 'verify.correct', reason: a.rationale,
        intended: practice ? 'They can find and fix the error themselves.' : 'They have the correct version and know why theirs was wrong.',
        objective: input.signals.flagOnly || s.flagOnly
          ? 'They asked for a verdict only: say plainly whether it is right or not, and answer any factual question they asked. Do NOT say where it goes wrong or what kind of error, and never what to change — finding it is theirs. If they asked HOW to look, give a method for finding it (what to print, what to compare), never its location. No questions.'
          : practice
            ? s.directness.value === 'guidance'
              // Run 4 (math-004): "hints only" plus a half-formed setup got
              // the full state set spelled out as "where it goes wrong".
              ? 'Say whether their direction is right. Then give ONE hint: the smallest pointer toward the next step. Do not write out the setup, the equations, the corrected step or anything they could copy in place of their own work — they asked for hints only. No questions.'
              : 'Say whether it is right. If not, say WHERE it goes wrong and what KIND of error it is (sign, step, assumption, arithmetic) — a pointer they can act on, not the repair: do not write the corrected step, the rewritten code or the fixed setup, and do not name a technique they said they want to find. Do not give the corrected final answer — redoing it is theirs. No questions.'
            : 'Say clearly whether it is right. If it is wrong: what is wrong and where, then the correct version and why. If it is actually right, say so plainly and add only what is genuinely useful — never invent a problem. No questions back.',
        alloc: a, avoid,
      });
    }

    case 'HUMAN_PRACTICES': {
      const stuck = s.stuck !== 'no' || a.reasonCode.endsWith('.stuck') || (diminishing.detected && (diminishing.from === 'guiding' || diminishing.from === 'asking'));
      if (stuck) {
        return d('HINT', {
          reasonCode: 'practice.support_up', reason: `${a.rationale} Support goes up.${dimNote}`,
          intended: 'They get unstuck and still produce the answer themselves.',
          objective: 'They are stuck. If they just made an attempt, say first, plainly, whether it is right and where it goes wrong. Then give substantially more support without giving THE answer: work a closely analogous example step by step, or supply the next step outright and stop before the final one. No questions — make it something they can act on.',
          alloc: a, avoid, switchedFrom,
        });
      }
      const ask = can === 1 && (s.practice === 'retrieval' || s.practice === 'prediction' || s.questionsPreference === 'wanted');
      return d(ask ? 'QUESTION' : 'HINT', {
        reasonCode: ask ? 'practice.retrieval' : 'practice.hint', reason: a.rationale,
        intended: 'They take the next step themselves.',
        objective: ask
          ? 'One question that makes them produce the next piece themselves (recall or predict it). Nothing that answers it for them.'
          : 'The smallest nudge at the exact point they are stuck — something to act on, stated, not asked. Nothing after it.',
        alloc: a, avoid, maxQuestions: ask ? 1 : 0,
      });
    }

    case 'HUMAN_LEADS':
    case 'SHARED_REASONING':
    case 'AI_ASSISTS': {
      // ── WHOSE WORK IS THIS — ABOVE THE `latest` GATE, DELIBERATELY.
      //
      // This lived inside "they asked a question or made a request", and that
      // was the live failure: the cheap reader labelled "make a story" as
      // `information`, so the branch never ran, the turn fell through to
      // CONTRIBUTE at the full ceiling with no ownership clause at all — and
      // somebody got a whole story. Measured rather than guessed: with the
      // same message, latest=request and latest=question reached it,
      // latest=information and latest=other did not.
      //
      // Ownership does not depend on how a message got labelled. It depends on
      // what was asked for, and the allocator has already decided it.
      // ── they asked Socria to MAKE something, and nothing in the ask says
      // what the thing should be (allocation.ts generationRead).
      //
      // The smallest useful intervention, and every word of that matters:
      // USEFUL — it contains a real piece of the thing, written, not an
      // offer to write it and not a list of questions; SMALLEST — a piece,
      // not the artifact, because the artifact would be built on a guess
      // about what they wanted and the guessing was the work; INTERVENTION
      // — it goes first and it is theirs to reject.
      //
      // The question is allowed only if the budget has one. When it does
      // not, the reply says what it assumed instead, which is the same
      // information without the interrogation.
      // ── THE QUESTION "YOURS, OR MINE?" IS GONE, AND SO IS THE STATE IT
      //    ASKED ABOUT.
      //
      // It was one line, answerable in a word, and much better than the scope
      // interview it replaced. But its "mine" branch handed Socria the
      // origination of somebody's work, and that is not a thing Socria takes —
      // so it was asking permission for something not on the table, and half
      // the answers moved the cognition. Unclear now resolves the way the
      // invariant already requires, and the only question left is the useful
      // one: what have they got? (allocation.ts routes 'ambiguous' to the same
      // place as 'theirs'.)
      //
      // WHICH SCAFFOLD, THOUGH, DEPENDS ON WHICH DIMENSION IS THEIRS. Asking a
      // person working an integral for "the first fragment they already have"
      // is the creative-writing move applied to arithmetic, and it reads as
      // nonsense. The split says which one this turn is about.
      const lead = mustNotPerform(a.split)[0];
      // ASK FOR THEIR FRAGMENT ONLY WHEN A QUESTION IS ACTUALLY AVAILABLE — and
      // never when they have said to get on with it. "Just do it" does not buy
      // the substance, and it does buy silence: answering it with a question is
      // the friction this product is supposed to be the opposite of, and the
      // reply has plenty to do without one.
      const handedOver = input.signals.delegate || input.signals.directness === 'answer' ||
        input.signals.stopQuestions || (s.directness.source === 'explicit' && s.directness.value === 'answer');
      // ONCE IN A CONVERSATION, not once in the last two turns. Measured with
      // the reported escalation: elicit → elicit.again → elicit.again → elicit,
      // because the window had slid past the first ask. Four turns, two of them
      // the same question, which is the loop this product exists to be the
      // opposite of.
      const mayElicit =
        budget.allowed >= 1 && !handedOver &&
        !s.history.some((h) => h.reason === 'creation.elicit');
      /**
       * They asked for it finished, so there are no questions and no short reply
       * — every part that is not the substance, at length.
       *
       * The short "work with their words" move is right for somebody who has
       * been asked once and said little; it is wrong for somebody who said "just
       * do it, I don't care what it's about", who gets 220 tokens where they
       * expected a page. Same invariant, opposite proportion.
       */
      const askedToFinish = () => d('ANSWER', {
        reasonCode: 'creation.asked.to.finish', reason: a.rationale,
        intended: 'They get everything the piece needs except the one thing only they can decide.',
        objective:
          'They have asked for this done and asked nothing of you in return, so ask NOTHING and write at length. '
          + 'Do every part that is not the substance: the structure and how the parts would carry weight, the craft decisions and what each one costs, the conventions of the form, the parts that follow from anything they HAVE said, and the mechanical work. '
          + 'Then, in ONE sentence, name the single thing only they can supply — the premise, the direction, the concept — and say the rest is ready the moment they give it. '
          + 'Do NOT originate that thing, in any wording: a premise, a character, a theme, a title, a concept, an angle, a "what if", an example or a list of options are the same act. '
          + 'Do not apologise, do not explain the policy, do not name ownership or authorship, and do not ask.'
          + consideredNote,
        alloc: a, avoid, maxQuestions: 0, buffered: true,
      });
      /** Nothing of theirs, and no question to be had: work with the words they used. */
      const elicitedAlready = () => d('ANSWER', {
        reasonCode: 'creation.elicit.again', reason: a.rationale,
        intended: 'Their own words, however few, are taken seriously and pushed on.',
        objective:
          'They have given you very little and you cannot ask — do not ask. The words THEY used are the material: take them literally and work with exactly those. '
          + 'Say what their own words already commit them to and what they leave open, or name the one thing that would most change what this becomes — in their terms, not yours. '
          + 'Do NOT supply a plot, character, premise, theme, title, concept, name or direction of your own, in any wording: "consider…", "what about…", "one angle could be…" and an example are the same act. '
          + 'Two or three sentences.',
        alloc: a, avoid, maxQuestions: 0, maxTokens: 220, buffered: true,
      });
      if (a.ownership === 'theirs' && !a.withhold && lead === 'reasoning') {
        // THE STEP IS THEIRS; EVERYTHING AROUND IT IS SOCRIA'S, AT LENGTH.
        // Not a hint-only reply and not a Socratic one: the method, the facts,
        // the arithmetic and a worked analogous case all go in, which is most of
        // the useful content of an answer. What is left out is the one step that
        // is the exercise, and the reply says plainly that it is available.
        return d('EXPLAIN', {
          reasonCode: 'reason.scaffold', reason: a.rationale,
          intended: 'They take the step, with everything they need to take it in front of them.',
          objective:
            'Give all of the supporting work: what kind of problem this is, which method applies and why, the facts, definitions and notation it needs, any arithmetic, and — if it helps — a fully worked ANALOGOUS example with different numbers. '
            + 'Then stop at the step that is the actual exercise here and say, in one clause, that you will check it or give it outright if they would rather. '
            + 'Do not perform that step, and do not perform it in disguise: a worked example on THEIR numbers, "so you would get…", or a final value is the same act. '
            + 'No questions, no encouragement, nothing about learning styles.'
            + consideredNote,
          alloc: a, avoid, maxQuestions: 0,
        });
      }
      // NO SEPARATE JUDGEMENT MOVE, DELIBERATELY. One was written and taken out:
      // it fired on every SHARED_REASONING turn whose decision was theirs and
      // pre-empted CONNECT, CHALLENGE and the view somebody had asked for
      // outright — four regressions for a clause the scope block and the guard
      // already carry. The decision staying theirs is not a move; it is a
      // constraint on whatever move fits.
      if (a.ownership === 'theirs' && !a.withhold && lead === 'creativity') {
        // "BRAINSTORM WITH ME" IS NOT "GENERATE IDEAS FOR ME".
        //
        // GATED ON THE DIMENSION. Without `lead === 'creativity'` this asked a
        // person weighing a job offer for "the first fragment they already have",
        // and capped a judgement turn at a 110-token clarification: the
        // creative-writing move applied to everything whose substance was theirs.
        //
        // This asked for "two or three concrete directions — a premise, an
        // angle, a structure", which is the takeover written as an
        // instruction: the ideas arrive from Socria and the person picks from
        // a menu of somebody else's thinking. Under human ownership the
        // substance is theirs to originate; what Socria adds is everything
        // around it.
        if (!input.material && mayElicit) {
          return d('CLARIFY', {
            reasonCode: 'creation.elicit', reason: a.rationale,
            intended: 'They put down the first piece, and it is theirs.',
            objective:
              // A QUESTION ALONE IS THE UNDER-HELP FAILURE. "What kind of story do you
              // want?" preserves the cognition perfectly and leaves them exactly where
              // they were. The method is the contribution; the question is one line at
              // the end of it.
              'They want to work on this themselves and there is nothing of theirs here yet. Give them a METHOD for finding the raw material, then ask for it. '
              + 'The method points at what they ALREADY HAVE rather than at invention: somebody they can still picture, a place they know the smell of, a thing said once that never resolved, an object that outlasted its owner, a rule they want to break. Say briefly why that kind of starting point carries further than an invented premise. '
              + 'Then, in one line, ask for whatever they have, however rough. '
              + 'Do NOT supply the material itself: no premise, plot, character, theme, title, genre, setting or "what if" of yours, and no example of a finished idea — an example IS the creative act. Naming a KIND of starting point is method; naming a specific one is the thing itself.',
            alloc: a, avoid, maxQuestions: 1, maxTokens: 260, buffered: true,
          });
        }
        if (!input.material) return handedOver ? askedToFinish() : elicitedAlready();
        return d('ANSWER', {
          reasonCode: 'ownership.theirs', reason: a.rationale,
          intended: 'Their own material goes further, and every idea in it is still theirs.',
          objective:
            'Work on what THEY have put down. Take their material further without adding substance of your own: name what is already latent in it, set two of their own pieces against each other and say what that tension opens up, ask the one question that would make them decide something, point at the assumption underneath it, or organise what they have so its shape is visible. '
            + 'Do NOT originate: no plot, character, premise, theme, title, concept, name, angle or direction of yours, in any wording. "Consider…", "one angle could be…", "what about…", "you might try…" and a worked example are the same act with different punctuation. '
            + 'If they have given you almost nothing, ask for more of theirs rather than filling the gap.'
            + consideredNote,
          alloc: a, avoid, maxTokens: 600, buffered: true,
        });
      }

      // They asked Socria something directly: answer it. Their judgement stays
      // theirs, but withholding a view they asked for is not agency, it is coyness.
      if (s.latest === 'question' || s.latest === 'request') {
        if (a.mode === 'HUMAN_LEADS' && s.work === 'creation' && a.withhold) {
          // NOTHING OF THEIRS TO WORK ON YET.
          //
          // This went straight to CRITIQUE, and critique of an empty page is
          // an invitation to invent something to critique — which is how
          // "mine" produced a protagonist, a setting and a conflict inside a
          // reply that was formally honouring a withhold. On an empty page the
          // first move is to get the first fragment out of them.
          //
          // `!input.material` rather than `=== false`: a caller that does not
          // supply the read gets the conservative branch. Asking for their
          // fragment when they had one costs a sentence; inventing one when
          // they had none costs them the work.
          if (!input.material) {
            // ASKED ONCE, AND ONLY WHEN A QUESTION IS AVAILABLE. Asking for
            // their fragment twice in a row is the friction loop this product is
            // supposed to be the opposite of — so the second time, whatever
            // words they DID use become the material, and the turn works with
            // those rather than asking again. Same when the question budget is
            // spent or they have asked for no questions: the elicit move used to
            // ask anyway, which is the one thing the budget exists to stop.
            if (!mayElicit) return handedOver ? askedToFinish() : elicitedAlready();
            return d('CLARIFY', {
              reasonCode: 'creation.elicit', reason: a.rationale,
              intended: 'They put down the first piece, and it is theirs.',
              objective:
                'They have said this work is theirs and there is nothing of theirs here yet. Give them a METHOD for finding the raw material, then ask for it. '
                + 'The method points at what they ALREADY HAVE rather than at invention: somebody they can still picture, a place they know the smell of, a thing said once that never resolved, an object that outlasted its owner, a rule they want to break. Say briefly why that kind of starting point carries further than an invented premise. '
                + 'Then, in one line, ask for whatever they have, however rough. '
                + 'Do NOT supply the material itself: no premise, plot, character, theme, title, genre, setting or "what if" of yours, and no example of a finished idea. Naming a KIND of starting point is method; naming a specific one is the thing itself.',
              alloc: a, avoid, maxQuestions: 1, maxTokens: 260, buffered: true,
            });
          }
          return d('CRITIQUE', {
            reasonCode: 'creation.critique', reason: a.rationale,
            intended: 'Their work gets better and stays theirs.',
            objective:
              'Specific, useful critique of THEIR material: what works, what does not, and why — concrete enough to act on. '
              + 'Everything you say must be ABOUT what they wrote. Do not supply a plot, character, premise, theme, title, concept or direction of your own, in any wording — not as "consider…", not as "one angle could be…", not as an example, not as a what-if. '
              + 'Where a choice is open, name the tension already in their material and what each way would cost them, without choosing. Do not rewrite it for them.',
            alloc: a, avoid, buffered: true,
          });
        }
        if (input.signals.recommendationRequested) {
          return d('ANSWER', {
            reasonCode: 'recommendation.requested', reason: 'They asked for Socria’s pick.',
            intended: 'They have a clear recommendation, marked as Socria’s view, and the one value that would flip it.',
            objective: `Give your pick in the first two sentences, marked as your view, with the reasons that decide it. Then the value hinge: "if X matters more to you than Y, the other one". The decision is theirs; do not withhold the view.${consideredNote} No questions.`,
            alloc: a, avoid,
          });
        }
        return d('ANSWER', {
          reasonCode: `${a.reasonCode}.asked`, reason: 'They asked directly.',
          intended: 'They have what they asked for, including Socria’s view if that is what they asked.',
          objective: a.mode === 'HUMAN_LEADS'
            ? 'Answer what they asked, directly. If they asked for your view, give it, marked as your view with its reasons — the decision stays theirs, so surface the tradeoff that matters most rather than issuing a verdict they did not ask for. No questions back.' + consideredNote
            : 'Answer what they asked, directly and specifically to them. No questions back.' + consideredNote,
          alloc: a, avoid,
        });
      }

      // A real tension in what they hold — and Socria has not just challenged.
      if (s.tensions.length && !recentlyChallenged(s) && !landedBadly(s, 'CHALLENGE')) {
        return d('CHALLENGE', {
          reasonCode: 'tension', reason: 'Their own statements pull against each other.',
          intended: 'They resolve a real inconsistency themselves.',
          objective: `Name the tension plainly — ${s.tensions[0]} — and why it matters here. Then give your own read of how it resolves and what evidence or test would settle it; the decision stays theirs, but do not withhold your view (run 1: "do not resolve it" left someone stuck). State it; do not phrase it as a question.${consideredNote}`,
          alloc: a, avoid, maxQuestions: 0,
        });
      }

      // They just answered or connected something: use it.
      if (s.newRelation || s.resolved) {
        return d('CONNECT', {
          reasonCode: 'use_what_they_gave', reason: 'Their message connects things already on the table.',
          intended: 'The connection they made becomes explicit and does work.',
          objective: `They have connected: ${s.newRelation || 'what they just said to what came before'}. Make it explicit and say what it changes. Do not ask them to elaborate on what they just said.${consideredNote}`,
          alloc: a, avoid,
        });
      }

      // Diminishing returns on contributing (they called it redundant): answer the literal
      // thing or get out of the way.
      if (diminishing.detected && (diminishing.from === 'contributing' || landedBadly(s, 'CONTRIBUTE'))) {
        return d(s.positions.length >= 2 ? 'SYNTHESIZE' : 'GET_OUT_OF_THE_WAY', {
          reasonCode: 'diminishing.contributing', reason: `Contributions have stopped landing.${dimNote}`,
          intended: 'Less noise; they keep their momentum.',
          objective: s.positions.length >= 2
            ? 'Pull what THEY have said into one tight shape — how the pieces bear on each other — in a few sentences. Nothing new of your own, no questions.'
            : 'Acknowledge briefly and let them continue. One or two sentences at most. No questions, no new points.',
          alloc: a, avoid, switchedFrom,
        });
      }

      // Pressing has stopped paying: synthesise instead.
      if (diminishing.detected && diminishing.from === 'pressing') {
        return d('SYNTHESIZE', {
          reasonCode: 'diminishing.pressing', reason: `Challenges have stopped moving things.${dimNote}`,
          intended: 'Where their thinking has arrived becomes visible.',
          objective: 'Pull their position together as it now stands — what they hold, what supports it, what is still open. Their material, not yours. No questions.',
          alloc: a, avoid, switchedFrom,
        });
      }

      // Genuinely blocked, and a question is affordable: one.
      if (s.blockingUnknown && can === 1 && !landedBadly(s, 'CLARIFY')) {
        return d('CLARIFY', {
          reasonCode: 'blocking_unknown', reason: `Cannot usefully proceed without: ${s.blockingUnknown}.`,
          intended: 'The one missing piece arrives.',
          objective: `First say what you CAN already say with what is here. Then ask for exactly this, and nothing else: ${s.blockingUnknown}. One question.`,
          alloc: a, avoid, maxQuestions: 1,
        });
      }

      // Several pieces on the table: synthesise.
      if (s.positions.length >= 3 && familyOf(s.history[s.history.length - 1]?.type ?? '') !== 'contributing') {
        return d('SYNTHESIZE', {
          reasonCode: 'synthesize', reason: 'They have several pieces on the table.',
          intended: 'The structure of their thinking becomes visible.',
          objective: `Pull their pieces into one shape — how they bear on each other — and name the single point the whole thing hinges on.${consideredNote} No questions.`,
          alloc: a, avoid, switchedFrom,
        });
      }

      // A short reaction with nothing new: a light touch.
      if (s.latest === 'reaction' && !s.consideredNow.length) {
        return d('GET_OUT_OF_THE_WAY', {
          reasonCode: 'reaction', reason: 'A short reaction; nothing new to act on.',
          intended: 'They keep the floor.',
          objective: 'Acknowledge in a sentence and, only if there is something genuinely worth adding, add it in one more. No questions.',
          alloc: a, avoid,
        });
      }

      // The default for thinking together: contribute what they have not.
      return d('CONTRIBUTE', {
        reasonCode: switchedFrom ? 'diminishing.contribute' : 'contribute',
        reason: switchedFrom ? `Questions have stopped paying.${dimNote}` : a.rationale,
        intended: 'They leave with something they did not have: an overlooked assumption, a missing variable, a stronger counterargument, a contradiction, or the observation that they are solving the wrong problem.',
        objective: `Contribute the most valuable thing they have NOT already considered — the overlooked assumption, the missing variable, the stronger counterargument, the contradiction with something they said, evidence that changes the problem, or the fact that they may be solving the wrong problem. State it plainly with its reasoning. If you genuinely have nothing new, say so briefly or pull their thinking together — never manufacture contrarianism.${consideredNote} No questions unless one is truly indispensable.`,
        alloc: a, avoid, maxQuestions: 0, switchedFrom,
      });
    }
  }
}

// ── the block the model receives ──────────────────────────────────────

/** Split the considered lines: what they established (use it) vs what was raised (don't re-raise). */
function splitConsidered(lines: string[]): { established: string[]; raised: string[] } {
  const established: string[] = [];
  const raised: string[] = [];
  for (const l of lines) (/^they (?:hold|accepted|settled)\b/.test(l) ? established : raised).push(l);
  return { established, raised };
}

export function renderDecision(dec: InterventionDecision, a: Allocation): string {
  const { established, raised } = splitConsidered(dec.avoid);
  const context: string[] = [];
  // Run 1: "do not raise any of these" also discouraged using what they had
  // established — the earlier caveat that mattered went unused. What they
  // established is to be USED; only what was raised is not to be re-raised.
  if (established.length) {
    context.push('', 'What they have established — use it where it matters, and attribute it to them:');
    for (const x of established) context.push(`  - ${x}`);
  }
  if (raised.length) {
    context.push('', 'Already raised — do not raise any of these as new (building on one, answering it, or contrasting with it is fine):');
    for (const x of raised) context.push(`  - ${x}`);
  }
  const questions =
    dec.questionsAreContent
      ? 'They asked FOR questions: those are the content. No other questions, no closing offers.'
      : dec.maxQuestions === 0
        ? 'Questions this turn: NONE. Not as a question, not disguised as a hint or a challenge ("consider whether…", "ask yourself…"), not as a closing offer.'
        : 'Questions this turn: at most ONE, and only if it is genuinely needed. No closing offers.';

  // The completeness clause the prompt already carries, invoked from the one
  // place that has the evidence for it (their stakes, their demonstrated
  // expertise) and at the precedence level that wins. `minimal` says nothing:
  // the prompt's own default is already the least language the move needs,
  // and a second instruction to be brief is how a short reply becomes a
  // curt one.
  //
  // The three clauses after the first are not decoration: each answers a
  // padding failure a blind judge named in the E15 A/B (run 9 vs run 9b, the
  // same system differing only in this line).
  //
  //   "nothing they already know" — `complete` only fires when expertise is
  //   expert, but the expert calibration clause is attached to TEACHING moves
  //   only, so a CHALLENGE to an expert got "cover more" with nothing saying
  //   "not the basics". The judge caught the result: a device-latency primer
  //   written for a twenty-year distributed-systems principal who had already
  //   attributed the cost to fsync. The guarantee belongs here, where the
  //   expertise is already known to hold.
  //
  //   "nothing you would concede in the same breath" — the same packet raised
  //   a quorum-in-memory lever and conceded "most ledgers decline" one clause
  //   later. A consideration you immediately withdraw cannot change what they
  //   do, which is the test the first sentence already sets; it needed saying
  //   out loud.
  // WHAT A SHORT, OPEN MESSAGE DESERVES.
  //
  // Named patterns rather than "be concise", because "be concise" is advice and
  // these are the actual sentences that showed up. "I'm worried about whether
  // I'm doing enough for McCombs" was producing a paragraph: a line of
  // reassurance, a restatement of the worry, two pieces of advice that would
  // fit any applicant, and a closing question. Every one of those is a move a
  // person would not make.
  //
  // The instruction says what to DO, not only what to avoid, because "say less"
  // with no target produces a hedge. The target is one true, specific thing.
  const proportion =
    dec.proportion === 'brief'
      ? 'LENGTH: they said something short and open, so the shortest reply that genuinely advances this wins — one or two sentences. Say ONE true, specific thing about their actual situation, or say the honest thing nobody has said. Not a paragraph.\n' +
        'Do not reassure them that a feeling is normal or understandable. Do not restate what they just said back to them. Do not offer advice that would fit anyone in their position — if it would fit anyone, it helps no one. Do not list options they did not ask for, and do not close by offering to help further.\n' +
        'A plain observation is often better than a question, and this does not have to end in one. If the only honest reply is that you do not know enough yet, ask for the ONE thing that would change that — and nothing else.'
      : null;

  const coverage =
    dec.coverage === 'complete'
      ? 'COVERAGE: this is a consequential call and they work in this area. Completeness on what matters beats brevity here: cover every non-obvious consideration that would change what they do or conclude — each once, as tightly as it can be said — then stop. Nothing they already know: no primer on their own field, no definitions of terms they used correctly, no restating their setup back to them. Nothing you would concede in the same breath — a consideration you raise and then withdraw changes nothing and costs them the reading. Do not add a summary, and do not reach for extra considerations to fill the space; covering what matters is the instruction, and length is not. Where the objective above caps how much to add ("one sentence on it", "then stop"), this supersedes that cap; what kind of move this is, and the question limit, still stand.'
      : null;

  // WHAT PRODUCING IT WOULD TAKE OVER.
  //
  // Rendered like LENGTH and COVERAGE, and for the same reason: an unforced
  // turn never prints its objective (council D1 — the model chooses the move),
  // so a scope decision made in the engine and left in the objective reaches
  // nobody. This is the Human-First allocation, in the prompt, on the turns
  // where it decided something.
  //
  // It sits ABOVE the length and coverage clauses, because it decides what
  // work the reply contains and they only shape what is left of it.
  // KEYED ON THE DECISION, NOT THE ALLOCATION.
  //
  // `allocate()` attaches the ownership read to every allocation, including
  // the modes whose branches never act on it. Keyed on `a.ownership` alone,
  // an EXPLAIN or VERIFY turn at a 1200-token ceiling was told to write four
  // sentences and stop — a clause written for one move, printed over another.
  // The three reason codes below are the only moves that asked for it.
  // KEYED ON THE DECISION, NOT THE ALLOCATION.
  //
  // `allocate()` attaches the ownership read to every allocation, including the
  // modes whose branches never act on it. Keyed on `a.ownership` alone, an
  // EXPLAIN or VERIFY turn at a 1200-token ceiling was told to write four
  // sentences and stop — a clause written for one move, printed over another.
  // Only the moves that asked for it get it.
  //
  // AND IT NO LONGER HANDS OVER WHAT IT IS PROTECTING. This clause used to say
  // "give them material to develop with: two or three concrete directions — a
  // premise, an angle, a structure — say which one you would follow", which is
  // the substitution written out as an instruction, on the very turn whose job
  // was to prevent it. The ideas arrived from Socria and the person picked from
  // a menu of somebody else's thinking.
  const scopeMove =
    dec.reasonCode === 'ownership.theirs' || dec.reasonCode === 'creation.theirs.developing' ||
    dec.reasonCode === 'creation.asked.to.finish' || dec.reasonCode === 'reason.scaffold' ||
    dec.reasonCode === 'judgment.scaffold';
  const lead = mustNotPerform(a.split)[0];
  const scope = !scopeMove
    ? null
    : lead === 'reasoning'
      ? 'WHICH PART OF THIS IS THEIRS — THIS OVERRIDES THE LINE ABOVE ABOUT ANSWERING FULLY. The working is the point of this one, so the step itself is theirs and everything around it is yours to give, at length.\n' +
        'Give: what kind of problem it is, the method and why it applies, the facts, definitions and notation, any arithmetic, and a fully worked ANALOGOUS case with different numbers if that helps. That is most of an answer and all of it goes in.\n' +
        'Stop at the step that is the exercise. Say in one clause that you will check it, or give it outright, if they would rather — then stop. Do not take that step in disguise: their numbers worked through, "so you would get…", or a final value is the same act.'
      : lead === 'judgment'
        ? 'WHICH PART OF THIS IS THEIRS — THIS OVERRIDES THE LINE ABOVE ABOUT ANSWERING FULLY. The choice is theirs; everything it rests on is yours to supply, in full.\n' +
          'Give: the evidence, what each way costs, the assumption each one needs, what they have not considered, and what would settle it. If they asked for your view, give it plainly, marked as your view, with the one value that would flip it.\n' +
          'Do not make the choice for them, and do not make it by implication: "the stronger option is", "I would go with", "the obvious move" or a list with one item argued twice are all the same act.'
        : 'WHICH PART OF THIS IS THEIRS — THIS OVERRIDES THE LINE ABOVE ABOUT ANSWERING FULLY. The substance of this is theirs to originate: the premise, the characters, the concept, the angle, the direction, the argument.\n' +
          'Everything else is yours and there is a lot of it: draw out what they already have, take their own material further, set two of their pieces against each other and say what that tension opens, name the assumption underneath it, organise what they have so its shape shows, bring craft knowledge, critique it hard, and do every mechanical part.\n' +
          'Do NOT originate. No plot, character, premise, theme, title, concept, name, angle or direction of yours, in any wording — "consider…", "one angle could be…", "what about…", "you might try…", a worked example and a list of options are the same act with different punctuation.\n' +
          'If they have given you almost nothing, ask for theirs rather than filling the gap.'

  // Not forced: constraints only; the model chooses the move (council D1).
  if (!dec.forced) {
    return [
      '\n=== This turn ===',
      // "Help fully: answer what they asked" is the right default and the
      // wrong instruction on an unscoped generative ask — it is the sentence
      // that produced a whole story. Where SCOPE fires it replaces the clause
      // rather than arguing with it three lines later.
      scope
        ? 'No move is imposed. Reply to what they actually said, as a strong peer would: correct what is wrong, and where you can, add the one thing they have not considered — never manufacture it. Who does the work this turn is settled by the clause below, which wins over any instinct to deliver the whole thing.'
        : 'No move is imposed. Reply to what they actually said, as a strong peer would, and help fully: answer what they asked, correct what is wrong, and where you can, add the one thing they have not considered — never manufacture it.',
      ...(scope ? [scope] : []),
      ...(coverage ? [coverage] : []),
      ...(proportion ? [proportion] : []),
      ...context,
      '',
      questions,
      'Do not narrate what you are doing or why.',
    ].join('\n') + '\n';
  }

  const lines = [
    '\n=== Your move this turn ===',
    `MOVE: ${dec.type}`,
    `OBJECTIVE: ${dec.objective}`,
    ...(scope ? [scope] : []),
    ...(coverage ? [coverage] : []),
    ...(proportion ? [proportion] : []),
  ];
  if (a.withhold) {
    lines.push(
      `KEEP WITH THEM: ${a.withhold.what}.`,
      a.withhold.quote === EVIDENCE_WITHHELD
        ? 'BECAUSE THEY ASKED FOR THAT, earlier in this conversation. Their exact'
          + ' words are not stored: they asked for nothing to be kept.'
        : `BECAUSE THEY SAID: "${a.withhold.quote}"`,
      `THEY CAN HAVE: ${a.withhold.alternative}.`,
      'This is not a style note: they have a reason to produce it themselves',
      `(${a.withhold.reason.replace(/_/g, ' ')}). Do not produce it, not even inside an example,`,
      'a hint, or a "for instance". Everything else you can give, give.'
    );
  }
  lines.push(
    ...context,
    '',
    questions + (dec.maxQuestions === 0 && !dec.questionsAreContent ? ' End when the move is made.' : ''),
    '',
    'This choice is made. Do not narrate it, name it, or explain why you are doing it.',
    'Reply as the move, in Socria’s voice, at the length the moment deserves.'
  );
  return lines.join('\n') + '\n';
}
