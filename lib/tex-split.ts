// lib/tex-split.ts
//
// Where the mathematics is in a piece of prose.
//
// Chat replies, map notes and explore panels are prose with notation
// sprinkled through it: $…$ and \(…\) inline, $$…$$ and \[…\] displayed.
// This finds those spans so the renderer can hand each to KaTeX and leave the
// rest as words.
//
// It lives in lib/ rather than beside the component because it is the part
// that can be wrong in ways nobody notices until a sentence comes out
// mangled, and pure functions are the ones a test can hold onto. Two bugs
// that shipped here are worth keeping in view, since both are easy to
// reintroduce:
//
//   1. A rejected span used to re-emit the text BEFORE it as well as itself,
//      so every sentence containing "$0$" printed its own opening twice:
//      "as x approaches  approaches $0$". One slice index.
//
//   2. `$0$`, `$1$` and `$-1$` were all judged to be money and left as
//      literal dollar signs, while "$5 and $10" — the case the judgement
//      exists for — was judged to be mathematics. It was backwards in both
//      directions.

export interface Seg {
  kind: 'text' | 'inline' | 'block';
  body: string;
}

// Ordered so the longer delimiters ($$, \[, \() are tried before the shorter
// ones and never mis-split a $$ as two $.
const PATTERNS: { re: RegExp; kind: 'inline' | 'block' }[] = [
  { re: /\$\$([\s\S]+?)\$\$/, kind: 'block' },
  { re: /\\\[([\s\S]+?)\\\]/, kind: 'block' },
  { re: /\\\(([\s\S]+?)\\\)/, kind: 'inline' },
  // single-$ inline: require a non-space start and a non-space end so a lone
  // "$" in prose cannot open a span that runs to the end of the paragraph.
  { re: /\$(?!\s)([^$\n]*?[^\s$])\$/, kind: 'inline' },
];

/** The single-$ pattern, as a global, for hasMath. Kept beside PATTERNS so
 *  the two can never drift into disagreeing about what a span is. */
const INLINE_G = /\$(?!\s)([^$\n]*?[^\s$])\$/g;

/**
 * Is the body of a single-$ span mathematics, or is it two currency amounts
 * with prose caught between them?
 *
 * The distinguishing fact is that money is written with ONE delimiter and
 * mathematics with two. "it cost $5 and $10" only produces a span at all
 * because the regex finds the opening of the second amount — and the body it
 * captures, "5 and", is a number that trails off into a word. Nothing written
 * as mathematics does that.
 *
 * So a bare number between paired delimiters is mathematics: `$0$` is how the
 * model is asked to write zero, and no one writes a price that way.
 */
export function looksMath(body: string): boolean {
  const t = body.trim();
  if (!t) return false;

  // "5 and", "10 to", "20 or so" — an amount running into prose. This is the
  // whole reason the judgement exists, and it has to be checked first because
  // such a body also contains the letters the last test looks for.
  if (/^[-+]?[\d,.]+\s+[a-z]/i.test(t)) return false;

  // A bare number, signed or not, between two delimiters. Money never is.
  if (/^[-+]?\d[\d,.]*$/.test(t)) return true;

  // A letter, a LaTeX command, a super/subscript, a brace, an equals — or
  // arithmetic between numbers, as in "14 - 6 = 8".
  return /[a-zA-Z\\^_{}=]/.test(t) || /\d\s*[-+*/×÷^]\s*\d/.test(t);
}

/**
 * Cut prose into text and mathematics.
 *
 * The guard is not paranoia: every branch below consumes at least one
 * character of `rest`, but a pattern edited to match empty would loop
 * forever, and this runs on every streamed token.
 */
export function splitMath(input: string): Seg[] {
  const segs: Seg[] = [];
  let rest = input;
  let guard = 0;

  while (rest && guard++ < 400) {
    let best: { index: number; len: number; body: string; kind: 'inline' | 'block' } | null = null;
    for (const { re, kind } of PATTERNS) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, len: m[0].length, body: m[1], kind };
      }
    }
    if (!best) {
      segs.push({ kind: 'text', body: rest });
      break;
    }

    // Whatever came before the span, once.
    if (best.index > 0) segs.push({ kind: 'text', body: rest.slice(0, best.index) });

    if (best.kind === 'inline' && !looksMath(best.body)) {
      // Not mathematics after all. Keep the span verbatim, delimiters and
      // all — and ONLY the span. Slicing from 0 here is what duplicated the
      // sentence in front of it.
      segs.push({ kind: 'text', body: rest.slice(best.index, best.index + best.len) });
    } else {
      segs.push({ kind: best.kind, body: best.body });
    }

    rest = rest.slice(best.index + best.len);
  }

  return segs;
}

/**
 * Whether a string is worth splitting at all — the cheap gate in front of
 * splitMath, so ordinary prose never allocates.
 *
 * Scans EVERY single-$ span rather than the first: "$5 and $10, so $x+2=0$"
 * is mathematics because of the last one, even though the first reads as
 * money. Uses the same judgement as splitMath so the two cannot disagree.
 */
export function hasMath(input: string): boolean {
  if (/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/.test(input)) return true;
  INLINE_G.lastIndex = 0; // a global regex carries state between calls
  for (let m = INLINE_G.exec(input); m; m = INLINE_G.exec(input)) {
    if (looksMath(m[1])) return true;
  }
  return false;
}
