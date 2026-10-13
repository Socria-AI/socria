// lib/accuracy/pushback.ts
//
// WHEN SOMEBODY SAYS "ARE YOU SURE?", SOMETHING HAS TO BE RE-EXAMINED.
//
// Core 4's signals (lib/core4/signals.ts) already notice one kind of
// correction: "that's not what I meant" — a misreading of THEM. They did not
// notice the other kind: "isn't it positive?", "my textbook says csc x cot x",
// "you forgot the minus sign" — a dispute about a CLAIM. With nothing marking
// that turn, the reply model met it with whatever it does by default under
// social pressure, which is to agree. That is how a correct derivative got
// abandoned and a wrong one kept, depending only on who spoke last.
//
// This reads pushback from their words alone. What happens next — the
// re-check, and the instruction to neither cave nor dig in — is in
// lib/accuracy/turn.ts.
//
// Deliberately narrow: a question that merely asks WHY ("why is it
// negative?") is a request for an explanation, not a dispute, and treating it
// as one would make the reply defensive about something nobody contested.
//
// PURE.

export interface Pushback {
  /** "that's wrong" / "it should be …" (dispute) or "are you sure?" (doubt) */
  kind: 'dispute' | 'doubt';
  /** methods they invoke — "the quotient rule" — which may be valid alternatives */
  methods: string[];
  /** their words, trimmed, to quote back */
  quote: string;
}

const DOUBT = new RegExp(
  [
    String.raw`\bare you (?:sure|certain|positive)\b`,
    String.raw`\byou sure\b`,
    String.raw`\bis (?:that|this) (?:right|correct|accurate)\b`,
    String.raw`\b(?:re-?check|double[- ]?check)\b`,
    String.raw`\bcheck (?:that|this|it) again\b`,
    String.raw`\bcheck your (?:work|answer|math|maths|calculation|arithmetic|algebra)\b`,
    String.raw`\b(?:that|this) (?:doesn'?t|does not) (?:look|seem|sound) right\b`,
    String.raw`\b(?:that|this) (?:seems|looks|sounds) (?:off|wrong|incorrect)\b`,
    String.raw`\bi'?m not (?:sure|convinced) (?:that'?s right|about that|that'?s correct)\b`,
    String.raw`\bi don'?t think (?:so|that'?s (?:right|correct|true))\b`,
    String.raw`^\s*really\s*\?`,
  ].join('|'),
  'i'
);

// What follows a phrase that MIGHT be pushback, when it is a claim about the
// mathematics rather than small talk or their own reflection.
const MATH_AFTER = String.raw`(?=[^.?!\n]{0,60}(?:\d|[=+*/^()]|\b(?:positive|negative|minus|plus|zero|sin|cos|tan|sec|csc|cot|ln|log|sqrt|x)\b))`;
const NOTATION_AFTER = String.raw`(?=[^.?!\n]{0,40}(?:[=+*/^]|\\[a-z]|\b(?:sin|cos|tan|sec|csc|cot|ln|log|sqrt|exp)\b|\b(?:positive|negative|minus)\b))`;
const CLAIM_AFTER = String.raw`(?=[^.?!\n]{0,48}(?:\d|[=+*/^()]|\b(?:positive|negative|minus|zero|equal|same|correct|right|wrong|true|false|supposed|sin|cos|tan|sec|csc|cot|ln|log|sqrt|x)\b))`;

const DISPUTE = new RegExp(
  [
    String.raw`\b(?:that'?s|that is|this is|it'?s) (?:wrong|incorrect|not (?:quite )?(?:right|correct|true|accurate))\b`,
    String.raw`\byou(?:'re| are) (?:wrong|mistaken|incorrect)\b`,
    String.raw`\byou (?:made|have) (?:a|an) (?:mistake|error|typo)\b`,
    String.raw`\b(?:a|an) (?:mistake|error) in (?:your|that|the) (?:answer|reply|derivation|calculation|working|math|maths|sign)\b`,
    String.raw`^\s*(?:no|nope|wrong)\b[,.!]?\s+(?:it'?s|it is|that'?s|the)\b`,
    String.raw`\bactually,? (?:it'?s|it is|the answer is)\b${MATH_AFTER}`,
    String.raw`\b(?:shouldn'?t|wouldn'?t) (?:it|that|this|there|the \w+) be\b`,
    String.raw`\bisn'?t (?:it|that|this|the \w+)\b${CLAIM_AFTER}`,
    String.raw`\b(?:doesn'?t|wouldn'?t) (?:it|that|this) (?:give|equal|make|come out|end up)\b`,
    String.raw`\bi (?:got|get|keep getting|am getting|'m getting) (?:a )?(?:different|another|something else)\b`,
    String.raw`\byou (?:forgot|dropped|missed|lost) (?:the|a) (?:sign|negative|minus|factor|term|constant|chain rule)\b`,
    String.raw`\b(?:missing|forgot) (?:a|the) (?:negative|minus|sign)\b`,
    String.raw`\bwhat about the (?:negative|minus|sign|chain rule|quotient rule|product rule)\b`,
    String.raw`\bthe sign (?:is|was|looks) wrong\b`,
    // "I think …" is a dispute only when it takes a position against the
    // answer: "I think it was the right call" is a reflection, and "I think
    // that's a capacity thing" is their own hypothesis.
    String.raw`\bi (?:think|believe) (?:you(?:'re| are) (?:wrong|mistaken)|it'?s actually)\b`,
    String.raw`\bi (?:think|believe) (?:the answer is|it should be)\b${NOTATION_AFTER}`,
    String.raw`\bi thought it was\b${MATH_AFTER}`,
    // "I think it's csc(x)cot(x)": a position, when what follows is notation.
    String.raw`\bi (?:think|believe) it'?s\b${NOTATION_AFTER}`,
    // The challenge that started all this: "doesn't the quotient rule apply?"
    String.raw`\b(?:doesn'?t|wouldn'?t|shouldn'?t|can'?t|couldn'?t|does|would|can|should) (?:the |you )?(?:use )?(?:the )?(?:quotient|product|chain|power) rule (?:apply|work|give|be used|change)\b`,
    String.raw`\b(?:but|so|and) (?:what about |using |with )?the (?:quotient|product|chain|power) rule\b[^.?!\n]{0,40}\?`,
  ].join('|'),
  'i'
);

// "My textbook says …" disputes when what it says is mathematics, or when
// they set it against the reply — not when they are asking about it.
const SOURCE_SAYS = /\b(?:my|the|our) (?:book|textbook|teacher|professor|prof|notes?|calculator|tutor|answer key|lecturer|ta|solutions?|solution manual|key)\b[^.?!\n]{0,30}?\b(?:says|said|gives|gave|shows|has|had|got)\b/i;
const SOURCE_CLAIM = new RegExp(String.raw`(?:says|said|gives|gave|shows|has|had|got)\b${MATH_AFTER}`, 'i');
const CONTRAST = /\b(?:but|however|whereas|instead|different|disagrees?|contradicts?|not what you|you said)\b/i;

const METHOD = /\b(quotient rule|product rule|chain rule|power rule|reciprocal rule|sum rule|l['’]?h[oô]pital'?s?(?: rule)?|u-?substitution|substitution|integration by parts|partial fractions|completing the square|quadratic formula|factoring|implicit differentiation|logarithmic differentiation|first principles|limit definition|definition of the derivative)\b/gi;

/**
 * Pushback on the previous reply, read from their latest message. Null when
 * there is no previous reply to push back on, or when nothing in their words
 * disputes or doubts it.
 */
export function readPushback(lastUserText: string, previousReply: string | null): Pushback | null {
  if (!previousReply || !previousReply.trim()) return null;
  const t = (lastUserText ?? '').replace(/[’‘]/g, "'").slice(0, 2000);
  if (!t.trim()) return null;
  const sourceSays = SOURCE_SAYS.test(t) && (SOURCE_CLAIM.test(t.slice(t.search(SOURCE_SAYS))) || CONTRAST.test(t));
  const dispute = DISPUTE.test(t) || sourceSays;
  const doubt = !dispute && DOUBT.test(t);
  if (!dispute && !doubt) return null;
  const methods = [...new Set([...t.matchAll(METHOD)].map((m) => m[1].toLowerCase().replace(/['’]/g, "'")))];
  const quote = t.replace(/\s+/g, ' ').trim().slice(0, 280);
  return { kind: dispute ? 'dispute' : 'doubt', methods, quote };
}

/** Methods a message names, whether or not it pushes back. */
export function methodsIn(text: string): string[] {
  return [...new Set([...(text ?? '').matchAll(METHOD)].map((m) => m[1].toLowerCase()))];
}
