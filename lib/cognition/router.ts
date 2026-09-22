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
// ── QUESTIONS ARE EARNED ────────────────────────────────────────────
//
// This router used to be the source of Core 4's interrogation habit, and
// not subtly. ASK was the fallback at the bottom of exploring, and the
// default of learning, deciding, creating and debugging whenever the state
// had not recorded a position. It took no history, so a question after a
// question after a question cost nothing. The result was the loop a person
// feels as being interviewed: they answer, Socria acknowledges, Socria asks
// again — and the answer, which usually contained exactly what was needed,
// is never used.
//
// ASK is one intervention among many. It is chosen only when a question is
// EARNED, and what earns one is measured, not assumed:
//
//   - what is genuinely unknown, and whether Socria needs it now
//     (blockingUnknown);
//   - whether producing the answer IS the valuable work — retrieval,
//     prediction, self-explanation (practice);
//   - whether the material that has to come next can only come from them
//     (deciding or creating with nothing on the table).
//
// Against that stands QUESTION PRESSURE: how many of Socria's own recent
// turns in a row have asked something. Each one raises the bar the next
// question has to clear. Not a rule against consecutive questions — a
// necessary one still goes through — but a rising price, so a question has
// to be worth more the more questions have just been asked. And when the
// person has just ANSWERED, the answer is used before anything else is
// asked for.
//
// Pure. No model, no clock, no network.

import type { CognitiveState } from './state';

export const INTERVENTIONS = [
  'LISTEN',     // they want to be heard; say almost nothing
  'OBSERVE',    // one precise observation about what they just said, then stop
  'CONNECT',    // relate this to something they already hold
  'REFINE',     // say their point back more precisely than they did
  'CLARIFY',    // make a distinction or a muddle clear
  'SYNTHESIZE', // pull their own material into a shape
  'CHALLENGE',  // press on what they said — including saying it is wrong
  'ASK',        // one question, when a question is earned
  'HINT',       // the smallest nudge that unblocks without revealing
  'TEACH',      // the prerequisite they are missing, and nothing more
  'EXPLAIN',    // the thing itself, because withholding it helps nobody
  'DIRECT',     // do the mechanical work and hand it over
  'RETRIEVE',   // a fact they could not derive
  'RESEARCH',   // go and find out
  'CALCULATE',  // compute it
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
   * May the reply hand the turn back with a question?
   *
   * False for most moves. A reply that makes its move and stops is complete;
   * a question tacked on the end to keep the conversation going is the habit
   * this whole file exists to break. The person will carry on if they want
   * to. True for ASK, and for HINT and CHALLENGE, which are often best made
   * AS a question ("what happens to the sign?").
   */
  endsOpen: boolean;
  /**
   * Whether the Answer Guard must read the draft before anybody sees it.
   *
   * True when the move's value depends on something being WITHHELD, and for
   * the short moves that must not end in a question — both are things a
   * draft can get wrong that the person should never see. Long moves whose
   * work is legitimately Socria's (explaining, retrieving) stream unguarded.
   */
  guard: boolean;
}

/** The short, question-free moves: cheap to hold back and read before sending. */
const CHECKED_CLOSE = new Set<Intervention>(['OBSERVE', 'CONNECT', 'REFINE', 'CLARIFY', 'SYNTHESIZE']);
const MAY_END_OPEN = new Set<Intervention>(['ASK', 'HINT', 'CHALLENGE']);

const M = (
  intervention: Intervention,
  objective: string,
  withholds: string | null,
  because: string
): Move => {
  const endsOpen = MAY_END_OPEN.has(intervention);
  return {
    intervention,
    objective,
    withholds,
    because,
    endsOpen,
    guard: withholds !== null || CHECKED_CLOSE.has(intervention),
  };
};

// ── question pressure ───────────────────────────────────────────────

export interface History {
  /**
   * How many of Socria's most recent turns IN A ROW asked the person
   * something. Measured from the transcript (questionStreak below), not from
   * a record of which move was chosen: what the person experiences is
   * questions, whatever the move was called.
   */
  questionStreak: number;
}

export const NO_HISTORY: History = { questionStreak: 0 };

/**
 * What a question must be worth, given the questions just asked.
 *
 * Rises with every consecutive question and never stops rising, so there is
 * no count at which asking becomes forbidden and no count at which it stops
 * getting more expensive. The first question of a run needs only a reason;
 * a second needs a good one; a third needs Socria to be genuinely unable to
 * proceed without it, AND the answer to be valuable work.
 */
export function questionThreshold(streak: number): number {
  return 1 + 1.5 * Math.max(0, streak);
}

export interface AskCase {
  /** how strongly a question is justified right now */
  worth: number;
  /** what a question would be FOR, if it is asked */
  purpose: string;
  /** the reasons, for the log */
  reasons: string[];
}

/**
 * How much a question is worth, from the state alone.
 *
 * Reasons ADD, because two independent reasons are a stronger case than
 * either.
 */
export function askWorth(s: CognitiveState): AskCase {
  let worth = 0;
  const reasons: string[] = [];
  let purpose = '';

  if (s.blockingUnknown) {
    worth += 2;
    reasons.push('Socria cannot usefully proceed without it');
    purpose = `Ask for exactly this, and nothing else: ${s.blockingUnknown}.`;
  }
  if (s.taskKind === 'learn' && s.practice !== 'none' && s.demonstratedUnderstanding !== 'solid') {
    worth += 2;
    reasons.push(`producing it is the learning (${s.practice})`);
    const verb: Record<string, string> = {
      retrieval: 'recall it themselves',
      prediction: 'predict before being told',
      'self-explanation': 'explain it in their own words',
      application: 'apply it to a case they have not seen',
    };
    purpose ||= `One question that makes them ${verb[s.practice] ?? 'produce it'}. Nothing that answers it for them.`;
  }
  if (s.taskKind === 'learn' && s.demonstratedUnderstanding === 'partial') {
    worth += 1;
    reasons.push('they can reasonably attempt it');
    purpose ||= 'One question whose answer they are capable of producing. It must create useful effort, not test recall of something never covered.';
  }
  if ((s.taskKind === 'decide' || s.taskKind === 'create') && !s.positions.length) {
    worth += 1;
    reasons.push(s.taskKind === 'decide' ? 'the options and the leaning can only come from them' : 'the material has to be theirs');
    purpose ||= s.taskKind === 'decide'
      ? 'Ask what they are actually weighing, or which way they are leaning. Do not enumerate options for them.'
      : 'Find out what they already have — the angle, the draft, the intent — before offering anything of your own.';
  }
  if (s.taskKind === 'debug' && s.attempt === 'none') {
    worth += 1;
    reasons.push('what they have tried is theirs to report');
    purpose ||= 'Ask what they have already tried and what it did. Do not propose a fix yet.';
  }
  if (s.taskKind === 'learn' && s.demonstratedUnderstanding === 'none' && s.attempt === 'none' && !s.confusions.length) {
    worth += 1;
    reasons.push('where they are starting from is not yet known');
    purpose ||= 'One question that finds where they are starting from — what they already know of this.';
  }
  if (s.taskKind === 'explore' && !s.positions.length && !s.assumptions.length && !s.newRelation) {
    worth += 1;
    reasons.push('nothing has taken shape yet');
    purpose ||= 'One question that opens the next layer of what they are exploring.';
  }
  // NOT here: a penalty for having just answered. That is handled by rule 7
  // in route(), which USES an answer before anything else is considered. A
  // penalty in this score only ever bit where rule 7 does not reach — the
  // necessary case, where they answered and something ELSE Socria cannot
  // proceed without remains ("what is the error?" answered; "which
  // version?" still unknown) — and there it blocked exactly the consecutive
  // question that is genuinely needed.

  return { worth, purpose, reasons };
}

/** An ASK, if one is earned against the pressure; otherwise null. */
function askIfEarned(s: CognitiveState, h: History, withholds: string): Move | null {
  const c = askWorth(s);
  const need = questionThreshold(h.questionStreak);
  if (!c.purpose || c.worth < need) return null;
  return M(
    'ASK',
    c.purpose,
    withholds,
    `${c.reasons.join('; ')} (worth ${c.worth} against ${need} after ${h.questionStreak} question${h.questionStreak === 1 ? '' : 's'} in a row)`
  );
}

/** Said in `because` when a question was considered and declined. */
function declined(s: CognitiveState, h: History): string {
  const c = askWorth(s);
  const need = questionThreshold(h.questionStreak);
  return c.purpose
    ? ` — a question was worth ${c.worth}, under the ${need} that ${h.questionStreak} question${h.questionStreak === 1 ? '' : 's'} in a row now require`
    : '';
}

// ── using what they gave ────────────────────────────────────────────

/**
 * The person has just put something on the table — often exactly what was
 * asked for. Do something WITH it.
 *
 * Ordered by how much the material itself asks for: a contradiction must be
 * named; a connection they have made should be made explicit; a shift in
 * position is worth noticing; a point can usually be put more precisely than
 * they put it; several threads can be pulled together. And when none of that
 * applies, one precise observation — and then stop.
 */
function useWhatTheyGave(s: CognitiveState, why: string): Move {
  if (s.tensions.length) {
    return M('CHALLENGE', `Name the tension between the things they have said — ${s.tensions[0]} — and hold them to it. Do not resolve it for them.`, 'which way to resolve it', `their own statements pull against each other${why}`);
  }
  if (s.newRelation) {
    return M('CONNECT', `They have just made a connection: ${s.newRelation}. Make it explicit and say what it changes — it is not a general point any more, it is about them. Do not ask them to elaborate on what they have just said.`, 'the conclusion', `their answer connects things already on the table${why}`);
  }
  if (s.recentChanges.length) {
    const c = s.recentChanges[0];
    return M('OBSERVE', `Their position on ${c.what} has moved (${c.from} → ${c.to}). Say what the move is, precisely, and stop.`, null, `their position moved${why}`);
  }
  if (s.positions.length >= 3) {
    return M('SYNTHESIZE', 'Pull what they have said into one shape — how the pieces bear on each other. Their material, not yours.', 'an alternative of your own invention', `they have several pieces on the table${why}`);
  }
  if (s.positions.length) {
    return M('REFINE', 'Say their latest point back more precisely than they did — what, specifically, it is and is not claiming. Then stop.', null, `what they said can be put more precisely${why}`);
  }
  return M('OBSERVE', 'One precise observation about what they just said: what it means, or what it changes. Then stop.', null, `they gave something to work with${why}`);
}

/**
 * The move for this turn.
 *
 * Ordered, and the order is the policy. Read top to bottom: the earliest rule
 * that matches wins, so the things that should override everything —
 * genuine urgency, being asked for a fact, wanting to be heard — sit at the
 * top and cannot be second-guessed by a rule about pedagogy further down.
 */
export function route(s: CognitiveState, h: History = NO_HISTORY): Move {
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

  // 6. Socria genuinely cannot proceed. The strongest case for a question —
  //    and still priced against the questions just asked.
  if (s.blockingUnknown) {
    const ask = askIfEarned(s, h, 'guesses at what they have not told you');
    if (ask) return ask;
  }

  if (s.taskKind === 'learn') {
    // Repeated failure with nothing shown is not productive struggle.
    // Missing prerequisite knowledge is the one case where asking is
    // cruelty: they cannot derive what they were never given.
    if (s.demonstratedUnderstanding === 'none' && s.confusions.length >= 2) {
      return M('TEACH', 'Supply the one prerequisite they are missing, as briefly as it can be said. Then stop — do not apply it to their problem for them.', 'applying it to their own problem', 'they lack the prerequisite, so asking would be asking them to derive what they were never given');
    }
    if (s.demonstratedUnderstanding === 'solid') {
      return M('CHALLENGE', 'They have it. Press on the edge of it — the case their understanding does not yet cover.', 'the answer to the harder case', 'they have shown they understand it');
    }
    // They got it right. Say so, plainly and specifically — Core 4's prompt
    // asks for clear evaluative feedback, and a correct answer met with the
    // next question teaches that being right changes nothing.
    if (s.attempt === 'right') {
      return M('OBSERVE', 'Tell them plainly that it is right, and what exactly makes it right. Then stop.', null, 'their attempt is correct, and that deserves saying before anything else');
    }
    // Producing it themselves is the learning: here a question is the point,
    // not a way of keeping the conversation going.
    const ask = askIfEarned(s, h, 'the answer, and the reasoning that reaches it');
    if (ask) return ask;
    // The next rung of Core 4's own ladder — question → hint → partial →
    // explanation — rather than yet another question.
    return s.demonstratedUnderstanding === 'partial'
      ? M('HINT', 'One nudge toward the next step. The smallest thing that moves them. Nothing after it.', 'the step itself', `they have been asked enough; the ladder's next rung is a hint${declined(s, h)}`)
      : M('TEACH', 'Give the one piece they need next, briefly. Then stop — do not apply it to their problem for them.', 'applying it to their own problem', `they have been asked enough; what they need now is something to work with${declined(s, h)}`);
  }

  // 7. THEY JUST ANSWERED. The question did its job; the answer is on the
  //    table. Use it — this is the rule the old router did not have, and its
  //    absence is what turned every answer into the occasion for the next
  //    question.
  if (s.resolved || s.newRelation) {
    return useWhatTheyGave(s, declined(s, h));
  }

  if (s.taskKind === 'decide') {
    if (s.tensions.length) {
      return M('CHALLENGE', 'Name the tension between the things they have said and hold them to it. Do not resolve it for them.', 'which way to resolve it', 'their own statements pull against each other');
    }
    if (!s.positions.length) {
      return askIfEarned(s, h, 'the decision, and the options they have not named')
        ?? useWhatTheyGave(s, declined(s, h));
    }
    return M('CHALLENGE', 'Test the position they hold: the assumption under it, the case it does not survive.', 'a recommendation', 'they hold a position worth testing');
  }

  if (s.taskKind === 'create') {
    if (!s.positions.length) {
      return askIfEarned(s, h, 'a version of your own')
        ?? M('OBSERVE', 'Say back, precisely, what they have said they want to make — the one thing it has to do. Then stop; do not draft it.', 'a version of your own', `they have not brought material yet${declined(s, h)}`);
    }
    return M('SYNTHESIZE', 'Work from what THEY produced. Develop, sharpen or structure their material; do not substitute yours.', 'an alternative of your own invention', 'they have material of their own to build on');
  }

  if (s.taskKind === 'debug') {
    if (s.attempt === 'none') {
      return askIfEarned(s, h, 'the diagnosis')
        ?? M('HINT', 'Point at where to look first, not at what the fix is.', 'the fix itself', `they have been asked enough; where to look is more use than another question${declined(s, h)}`);
    }
    return M('HINT', 'Point at where to look, not at what the fix is.', 'the fix itself', 'they are working it and need direction, not an answer');
  }

  // 8. Exploring. They asked Socria something: answer it. They put material
  //    down: do something with it. Nothing has taken shape: a question may
  //    open it — once. And otherwise, a single observation is a complete
  //    reply.
  if (s.latest === 'question') {
    return M('EXPLAIN', 'Answer what they asked, plainly and specifically to them. Then stop.', null, 'they asked, and exploring is not a reason to withhold an answer');
  }
  if (s.positions.length || s.assumptions.length) {
    return s.latest === 'information' || s.latest === 'answer' || s.latest === 'reaction'
      ? useWhatTheyGave(s, '')
      : M('CONNECT', 'Relate what they just said to something they already hold. Do not conclude.', 'the conclusion', 'they have material that relates to this');
  }
  return askIfEarned(s, h, 'a direction of your own')
    ?? useWhatTheyGave(s, declined(s, h));
}

// ── what the transcript says about questions ────────────────────────

/**
 * Does this reply ask the person something?
 *
 * Code and quotations are set aside first: a question inside a code block or
 * a quoted example is not one being put to them.
 */
export function asksQuestion(text: string): boolean {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[“"][^”"\n]{0,300}[”"]/g, ' ');
  return /\?(\s|$|[)*_"'’”])/.test(plain);
}

/**
 * How many of Socria's most recent replies in a row asked something.
 *
 * Read from the transcript the client sent, so it needs no stored record of
 * past moves and cannot drift from what the person actually saw — a CHALLENGE
 * phrased as a question is a question to the person reading it.
 */
export function questionStreak(messages: readonly { role: string; content: string }[]): number {
  let streak = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    if (!asksQuestion(m.content)) break;
    streak++;
  }
  return streak;
}

// ── the block the model receives ────────────────────────────────────

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
  if (m.intervention === 'ASK') {
    lines.push(
      '',
      'Ask ONE question, and only the one this objective calls for. Do not',
      'acknowledge-then-ask by habit, and do not add a second question.'
    );
  } else if (!m.endsOpen) {
    lines.push(
      '',
      'End when the move is made. Do not close with a question, an offer, or',
      'an invitation to say more — the person will carry on if they want to,',
      'and a question added to keep the conversation going is the habit this',
      'move replaces. One sentence can be the whole reply.'
    );
  }
  lines.push(
    '',
    'Choosing this move is done. Do not narrate it, name it, or explain why',
    'you are doing it. Reply as the move, in Socria’s voice, at the length',
    'the moment deserves.'
  );
  return lines.join('\n') + '\n';
}
