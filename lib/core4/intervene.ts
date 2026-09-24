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
  InterventionDecision,
  InterventionType,
  QuestionBudget,
} from './types';
import { familyOf } from './budget';

export interface SelectInput {
  state: CognitiveState;
  allocation: Allocation;
  budget: QuestionBudget;
  diminishing: Diminishing;
  signals: ExplicitSignals;
  /** what the person has already considered (their items, most relevant first) */
  considered: string[];
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
  }
): InterventionDecision {
  const maxQuestions = o.maxQuestions ?? 0;
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
    guardRequired: !!o.alloc.withhold,
    maxQuestions,
    objective: o.objective,
    avoid: o.avoid.slice(0, 12),
    switchedFrom: o.switchedFrom ?? null,
    maxTokens: TOKENS[type] ?? 600,
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
const FORCING = new Set(['safety', 'practice.bottom_out', 'practice.let_me_try', 'quiz.contract', 'done', 'recommendation.requested', 'retrieve.history', 'reflect.heard', 'reflect.minimal']);

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
  return input.signals.requestsQuestions ? { ...dec, questionsAreContent: true } : dec;
}

function selectMove(input: SelectInput): InterventionDecision {
  const { state: s, allocation: a, budget, diminishing, considered } = input;
  const avoid = considered;
  const can = budget.allowed;
  const switchedFrom = diminishing.detected ? diminishing.from : null;
  const dimNote = diminishing.detected ? ` Strategy changed: ${diminishing.signals.join('; ')}.` : '';
  const consideredNote = avoid.length
    ? ' They have already considered the items listed under "Already on the table" — do not raise any of them as new; go past them.'
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
      // They asked Socria something directly: answer it. Their judgement stays
      // theirs, but withholding a view they asked for is not agency, it is coyness.
      if (s.latest === 'question' || s.latest === 'request') {
        if (a.mode === 'HUMAN_LEADS' && s.work === 'creation' && a.withhold) {
          return d('CRITIQUE', {
            reasonCode: 'creation.critique', reason: a.rationale,
            intended: 'Their work gets better and stays theirs.',
            objective: 'Specific, useful critique of THEIR material: what works, what does not, and why — concrete enough to act on. Options where useful. Do not rewrite it for them.',
            alloc: a, avoid,
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

  // Not forced: constraints only; the model chooses the move (council D1).
  if (!dec.forced) {
    return [
      '\n=== This turn ===',
      'No move is imposed. Reply to what they actually said, as a strong peer would, and help fully: answer what they asked, correct what is wrong, and where you can, add the one thing they have not considered — never manufacture it.',
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
  ];
  if (a.withhold) {
    lines.push(
      `KEEP WITH THEM: ${a.withhold.what}.`,
      `BECAUSE THEY SAID: "${a.withhold.quote}"`,
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
