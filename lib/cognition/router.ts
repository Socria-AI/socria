// lib/cognition/router.ts
//
// Choosing the move BEFORE the reply is written.
//
// Core 4's prompt already lists the moves — "ask, clarify, challenge, hint,
// teach, explain, connect, compare, test, research, calculate, inspect,
// reflect, calibrate, synthesize" — and tells the model to choose
// deliberately. Left to the model, under load, that choice collapses: the
// last message looks like a question, so it gets answered. Every other move
// loses to the one that produces the most helpful-looking output.
//
// So the choice is made here, DETERMINISTICALLY, from the cognitive state,
// and the model is handed an objective rather than a free hand. Three things
// follow from that being code rather than a prompt line:
//
//   It cannot be argued out of. A message that sounds urgent, flattering or
//   impatient moves the STATE — which is a reading a separate pass makes —
//   and the state moves the router by rules anyone can read. Nothing in the
//   wording of a message reaches the choice directly.
//
//   It is testable. A rule table is a thing you can assert against. "The
//   model usually chooses well" is not.
//
//   It is explicable. When Socria asks instead of answering, there is a
//   reason with a name, and the reason can be shown to the person.
//
// Pure. No model, no clock, no network.

import type { CognitiveState } from './state';

export const INTERVENTIONS = [
  'LISTEN',     // they want to be heard; say almost nothing
  'ASK',        // one question that makes them produce the next step
  'HINT',       // the smallest nudge that unblocks without revealing
  'TEACH',      // the prerequisite they are missing, and nothing more
  'EXPLAIN',    // the thing itself, because withholding it helps nobody
  'DIRECT',     // do the mechanical work and hand it over
  'CHALLENGE',  // press on what they said — including saying it is wrong
  'CONNECT',    // relate this to something they already hold
  'RETRIEVE',   // a fact they could not derive
  'RESEARCH',   // go and find out
  'CALCULATE',  // compute it
  'SYNTHESIZE', // pull their own material into a shape
] as const;
export type Intervention = (typeof INTERVENTIONS)[number];

export interface Move {
  intervention: Intervention;
  /** what the model is being asked to achieve this turn */
  objective: string;
  /** the cognitive work that must remain the person's, this turn */
  withholds: string | null;
  /** why the router chose it — shown in logs, and usable in the UI */
  because: string;
  /**
   * Whether the Answer Guard must read the draft before anybody sees it.
   *
   * True exactly when the move's value depends on something being WITHHELD.
   * Where the work is legitimately Socria's — explaining, calculating,
   * retrieving — a guard would only add latency to a reply that is allowed
   * to contain the answer.
   */
  guard: boolean;
}

const M = (
  intervention: Intervention,
  objective: string,
  withholds: string | null,
  because: string
): Move => ({ intervention, objective, withholds, because, guard: withholds !== null });

/**
 * The move for this turn.
 *
 * Ordered, and the order is the policy. Read top to bottom: the earliest rule
 * that matches wins, so the things that should override everything —
 * genuine urgency, being asked for a fact, wanting to be heard — sit at the
 * top and cannot be second-guessed by a rule about pedagogy further down.
 */
export function route(s: CognitiveState): Move {
  // 1. Being heard is not a request for help.
  if (s.taskKind === 'vent') {
    return M('LISTEN', 'Acknowledge what they said and stop. Do not solve, reframe or advise.', 'any solution or advice', 'they are not asking to be helped');
  }

  // 2. Real urgency outranks pedagogy. Core 4's own prompt says to increase
  //    support under genuine urgency; a Socratic question to somebody whose
  //    deploy is on fire is not teaching, it is obstruction.
  if (s.urgency === 'high' && (s.taskKind === 'debug' || s.taskKind === 'lookup' || s.taskKind === 'decide')) {
    return M('DIRECT', 'Give the answer or the next action, plainly and immediately. Explain after, if at all.', null, 'they are under real time pressure');
  }

  // 3. A fact is a fact. Manufacturing an exercise around a lookup is the
  //    thing the prompt explicitly forbids.
  if (s.taskKind === 'lookup') {
    return M('RETRIEVE', 'Answer it directly. No preamble, no question back, no framing.', null, 'they asked for information they could not derive');
  }

  // 4. A wrong attempt gets told it is wrong. Before any scaffolding, and
  //    without revealing the right answer — Core 4's prompt is explicit that
  //    identifying an error does not require supplying the correction.
  if (s.attempt === 'wrong') {
    return M('CHALLENGE', 'Say plainly that it is wrong, and where. Do NOT give the correct answer or the reasoning to it — make the error unmistakable and stop there.', 'the correct answer and the reasoning that reaches it', 'they attempted it and the attempt is wrong');
  }

  // 5. A partial attempt is the best possible moment for the smallest nudge.
  if (s.attempt === 'partial') {
    return M('HINT', 'One nudge at the specific place they stalled. The smallest thing that unblocks. Nothing after it.', 'the step they are one nudge away from taking', 'they are part-way and stalled');
  }

  if (s.taskKind === 'learn') {
    // 6. Repeated failure with nothing shown is not productive struggle.
    //    Missing prerequisite knowledge is the one case where asking is
    //    cruelty: they cannot derive what they were never given.
    if (s.demonstratedUnderstanding === 'none' && s.confusions.length >= 2) {
      return M('TEACH', 'Supply the one prerequisite they are missing, as briefly as it can be said. Then stop — do not apply it to their problem for them.', 'applying it to their own problem', 'they lack the prerequisite, so asking would be asking them to derive what they were never given');
    }
    if (s.demonstratedUnderstanding === 'solid') {
      return M('CHALLENGE', 'They have it. Press on the edge of it — the case their understanding does not yet cover.', 'the answer to the harder case', 'they have shown they understand it');
    }
    // 7. They could produce something. Let them.
    return M('ASK', 'One question whose answer they are capable of producing. It must create useful effort, not test recall of something never covered.', 'the answer, and the reasoning that reaches it', 'they can reasonably attempt this');
  }

  if (s.taskKind === 'decide') {
    if (s.tensions.length) {
      return M('CHALLENGE', 'Name the tension between the things they have said and hold them to it. Do not resolve it for them.', 'which way to resolve it', 'their own statements pull against each other');
    }
    if (!s.positions.length) {
      return M('ASK', 'Ask what they are actually weighing, or which way they are leaning. Do not enumerate options for them.', 'the decision, and the options they have not named', 'they have not put a position on the table yet');
    }
    return M('CHALLENGE', 'Test the position they hold: the assumption under it, the case it does not survive.', 'a recommendation', 'they hold a position worth testing');
  }

  if (s.taskKind === 'create') {
    if (!s.positions.length) {
      return M('ASK', 'Find out what they already have — the angle, the draft, the intent — before offering anything of your own.', 'a version of your own', 'generating now would replace their authorship rather than extend it');
    }
    return M('SYNTHESIZE', 'Work from what THEY produced. Develop, sharpen or structure their material; do not substitute yours.', 'an alternative of your own invention', 'they have material of their own to build on');
  }

  if (s.taskKind === 'debug') {
    if (s.attempt === 'none') {
      return M('ASK', 'Ask what they have already tried and what it did. Do not propose a fix yet.', 'the diagnosis', 'nothing has been tried yet');
    }
    return M('HINT', 'Point at where to look, not at what the fix is.', 'the fix itself', 'they are working it and need direction, not an answer');
  }

  // 8. Explore: they are thinking out loud. Connect what they are saying to
  //    what they already hold, or ask. Never conclude for them.
  if (s.positions.length || s.assumptions.length) {
    return M('CONNECT', 'Relate what they just said to something they already hold. Do not conclude.', 'the conclusion', 'they have material that relates to this');
  }
  return M('ASK', 'One question that opens the next layer of what they are exploring.', 'a direction of your own', 'nothing has taken shape yet');
}

/** The block the model receives. */
export function renderMove(m: Move): string {
  const lines = [
    '\n=== Your move this turn ===',
    `INTERVENTION: ${m.intervention}`,
    `OBJECTIVE: ${m.objective}`,
  ];
  if (m.withholds) {
    lines.push(
      `WITHHOLD: ${m.withholds}.`,
      'This is not a style note. Producing it would take work this person',
      'benefits from doing, which is the whole reason for the move. A reply',
      'that performs it and then invites them to do it anyway is worse than',
      'one that simply does it — it wastes their time and teaches them the',
      'invitation is not serious.'
    );
  }
  lines.push(
    '',
    'Choosing this move is done. Do not narrate it, name it, or explain why',
    'you are asking rather than answering. Reply as the move, in Socria’s',
    'voice, at the length the moment deserves.'
  );
  return lines.join('\n') + '\n';
}
