// lib/math-context.ts
//
// "Is this person doing mathematics right now?" — answered locally, from
// signals already on the client, so it can run on every keystroke without
// costing anything or waiting on anything.
//
// The rule this file exists to enforce is hysteresis. A control that appears
// and vanishes as you type past a "2" is worse than no control: it moves the
// send button under your thumb. So the answer is sticky in both directions —
// it takes a real signal to turn on, and sustained absence plus a cooldown to
// turn off again.
//
// Nothing here calls a model. The extractor already decides, properly and
// with the whole conversation in view, whether the work is mathematical; this
// is the cheap local approximation that runs between those decisions.

/** How confident we are that mathematics is in play. */
export type MathSignal = 'none' | 'weak' | 'strong';

/** Which family of mathematics, when we can tell — used to order the keypad. */
export type MathTopic = 'limits' | 'derivatives' | 'integrals' | 'trig' | 'general';

// Notation that is essentially never prose. A single one of these is enough.
const STRONG = [
  /\blim\b/i,
  /\bd\s*\/\s*d[a-z]\b/i,
  /\bdy\s*\/\s*dx\b/i,
  /[∫∑∏√≤≥≠∞±→]/,
  /\bf\s*'\s*\(/,
  /\b(derivative|integral|antiderivative|riemann|asymptote|tangent line)\b/i,
  /\b(sin|cos|tan|arcsin|arccos|arctan|sinh|cosh|tanh)\s*\(/i,
  /\b(matrix|eigenvalue|eigenvector|determinant)\b/i,
  /\b(factorial|binomial|permutation)\b/i,
  /\$[^$]+\$/, // inline LaTeX
  /\\frac|\\int|\\sum|\\sqrt|\\lim/,
  /\b[a-z]\s*\^\s*\d/i, // x^2
  /\b\d*[a-z]\s*[+\-*/]\s*\d*[a-z]\b/i, // 2x + 3y
  // A coefficient welded to a variable AND followed by an operator: "3x + 4",
  // "2y =". The trailing operator is what keeps "2x faster" and "4k monitor"
  // out — a bare "2x" is far too common in ordinary speech to count.
  /\b\d+[a-z]\s*[+\-*/=]/i,
  /\bsolve\b[^.!?]*=/i,
];

// Words that suggest mathematics but appear in ordinary prose all the time.
// Two of these together count; one alone does not.
const WEAK = [
  /\bgraph\b/i,
  /\bplot\b/i,
  /\bequation\b/i,
  /\bfunction\b/i,
  /\bsolve\b/i,
  /\bvariable\b/i,
  /\bcoefficient\b/i,
  /\bslope\b/i,
  /\bcurve\b/i,
  /\baxis\b/i,
  /\bcalculate\b/i,
  /\bconverge|diverge\b/i,
  /\bprobability\b/i,
  /\btheorem|proof|lemma\b/i,
  /\b\d+\s*[+\-*/^]\s*\d+/, // 3 + 4
];

const TOPIC: [MathTopic, RegExp][] = [
  ['limits', /\blim\b|\bapproach(es|ing)?\b|\bdelta\b|→|\bcontinuous\b|\bdiscontinu/i],
  ['integrals', /∫|\bintegrals?\b|\bintegrat(e|ing|ion)\b|\briemann\b|\barea under\b|\bantiderivative\b|\bdx\b/i],
  ['derivatives', /\bderivative\b|d\s*\/\s*d[a-z]|\bf\s*'\s*\(|\btangent\b|\bslope of\b|\brate of change\b/i],
  ['trig', /\b(sin|cos|tan|arcsin|arccos|arctan)\b|\bradian|\bunit circle\b|\bamplitude\b|\bperiod\b/i],
];

function score(text: string): { strong: number; weak: number } {
  const t = text.slice(0, 4000);
  let strong = 0;
  let weak = 0;
  for (const re of STRONG) if (re.test(t)) strong++;
  for (const re of WEAK) if (re.test(t)) weak++;
  return { strong, weak };
}

export interface MathContextInput {
  /** the map's own reading of the work, when there is one */
  context?: string;
  /** what is in the composer this instant */
  composer: string;
  /** the last few messages, newest last */
  recent: string[];
  /** a scene is on the plot — mathematics is demonstrably in play */
  hasViz?: boolean;
}

/**
 * The raw reading, before hysteresis. Deliberately generous about the map's
 * own verdict — if the extractor has already called this mathematical work,
 * that outranks anything a regex has to say.
 */
export function readMathSignal(input: MathContextInput): MathSignal {
  if (input.context === 'math' || input.hasViz) return 'strong';

  const composer = score(input.composer);
  if (composer.strong >= 1) return 'strong';

  // The conversation carries more weight than the half-typed line: someone
  // three turns into a calculus discussion is doing calculus even while
  // typing "ok so".
  const conv = score(input.recent.slice(-4).join('\n'));
  if (conv.strong >= 2) return 'strong';
  if (conv.strong >= 1) return 'weak';
  if (composer.weak >= 2 || conv.weak >= 3) return 'weak';
  return 'none';
}

/** The topic, for ordering the keypad. Falls back to 'general'. */
export function readMathTopic(input: MathContextInput): MathTopic {
  const hay = `${input.composer}\n${input.recent.slice(-4).join('\n')}`;
  for (const [topic, re] of TOPIC) if (re.test(hay)) return topic;
  return 'general';
}

/**
 * Whether the control should be on screen, given what it was doing a moment
 * ago. This is the anti-flicker rule and the whole reason this is a function
 * rather than a boolean.
 *
 * Appearing needs a strong signal. Disappearing needs the signal to be gone
 * AND enough time to have passed that it cannot be mid-word — someone who has
 * typed "lim" and is now backspacing to fix it should not watch the button
 * blink.
 */
export const MATH_FADE_MS = 12_000;

export function shouldShowMath(
  signal: MathSignal,
  wasShowing: boolean,
  lastStrongAt: number,
  now: number
): boolean {
  if (signal === 'strong') return true;
  if (!wasShowing) return false; // weak alone never opens it
  return now - lastStrongAt < MATH_FADE_MS;
}
