// lib/easter-eggs.ts
//
// The one joke in the product, and it is not really a joke.
//
// In I, Robot, Detective Spooner tries to put Sonny in his place: "Can a robot
// write a symphony? Can a robot turn a canvas into a beautiful masterpiece?"
// Sonny answers with two words, and they are the best two words in the film:
//
//   "Can you?"
//
// It belongs here more than it belongs in most products. Socria's whole
// argument is that the interesting question is never what the machine can do —
// it is what you can do, and whether handing the first question to a machine
// quietly costs you the second. Somebody who arrives to test Socria with that
// line has set up the exact move the product exists to make, and answering it
// straight would be the one wrong reply.
//
// So this is a real answer in Socria's voice, not a gag. It asks before it
// answers, it hands nothing over, and it is exactly the length it should be.
//
// PURE, and deliberately so: no React, no network, no clock. Both chat routes
// consult it, and the suite can hold it to the one rule that matters — that it
// fires on the film's line and on nothing else somebody might sincerely type.

export interface EasterEgg {
  /** stable id, for analytics or a future second egg */
  id: string;
  /** exactly what Socria says, on every surface */
  reply: string;
}

/**
 * Sonny's answer. Two words, a question, and the end of the conversation the
 * asker thought they were starting.
 */
export const SONNY: EasterEgg = {
  id: 'can-you',
  reply: 'Can you?',
};

/**
 * Down to the shape of the sentence.
 *
 * Case, punctuation and the curly apostrophes a phone inserts all go, and runs
 * of whitespace collapse — so the line matches whether it arrives as one
 * question, two, shouted, or pasted with the film's full punctuation.
 */
function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The two halves of Spooner's challenge.
 *
 * Either one alone is enough — people quote the symphony half far more often
 * than both — but each has to arrive in close to the film's shape. That is the
 * point of spelling the patterns out rather than looking for "robot" near
 * "symphony": a sentence that merely mentions both is somebody thinking about
 * music and machines, and interrupting THAT with a catchphrase would be the
 * product showing off in the middle of someone's actual question.
 *
 * `a robot` widens to the machines people substitute — an android, an AI, a
 * computer, and Socria itself, which is the version a visitor here is most
 * likely to reach for.
 *
 * `you` is deliberately NOT in that list, and the suite holds the line. "Can
 * you write a symphony?" is a direct request far more often than it is the
 * quote, and answering a request with "Can you?" is a refusal wearing a joke —
 * the single worst thing this feature could do. Naming the machine in the
 * third person is what makes it a quotation.
 */
const SUBJECT = '(?:a |an )?(?:robot|android|machine|computer|ai|socria)';

const LINES: RegExp[] = [
  // "Can a robot write a symphony?"  (also compose / create)
  new RegExp(`\\bcan ${SUBJECT} (?:write|compose|create|make) an? symphony\\b`),
  // "Can a robot turn a canvas into a beautiful masterpiece?"
  new RegExp(
    `\\bcan ${SUBJECT} turn an? (?:blank )?canvas into an? (?:beautiful )?masterpiece\\b`
  ),
];

/**
 * The egg for a message, or null — which is the answer almost every time.
 *
 * Anything that is not a non-empty string is null rather than a throw: this
 * runs on the request path of every chat turn, and an easter egg is never
 * worth a 500.
 */
export function eggFor(input: unknown): EasterEgg | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const text = normalise(input);
  // A whole essay that happens to contain the line is somebody writing about
  // the film, not somebody quoting it at Socria. The quote is short; so is the
  // window it is allowed to arrive in.
  if (text.length > 240) return null;
  return LINES.some((re) => re.test(text)) ? SONNY : null;
}
