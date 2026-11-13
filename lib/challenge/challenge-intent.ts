// lib/challenge/challenge-intent.ts — WORDS THAT ASK FOR A CHALLENGE (Logos 6, Phase 1).
//
// "What am I missing?", "poke holes in this", "where is this weak?", "devil's advocate", "what am I assuming?",
// "what could go wrong?", "what else could explain this?", "second-order effects", "stress-test my argument".
// Read in the browser before anything is sent, the way a command to the map is (lib/map-edit.ts): a turn that
// plainly asks to have the person's own reasoning tested goes to the challenge engine and comes back as a card.
//
// It errs toward NOT firing. A miss costs nothing — the turn goes to Socria as it always did, and the reply's
// own rules still push back where there is reason to. A false fire costs a lot: "I'm missing my notes" answered
// with a list of hidden assumptions. So only an explicit request about the person's own thinking counts, never a
// question about the world that happens to share a word ("what am I missing about how photosynthesis works?" is
// a question about photosynthesis).
//
// PURE.

import type { FindingKind } from '../logos6/vocab';

export interface ChallengeAsk {
  /** the kinds the words lean on — "what am I assuming?" leans on assumptions — or none for an open request */
  lean: FindingKind[];
  /** the words were about a document ("where is this source weak?") rather than their own line */
  aboutDocument?: boolean;
}

/** what "this" can be when it is the person's own work */
const WORK = String.raw`(?:argument|reasoning|logic|case|thesis|claim|claims|position|plan|idea|ideas|proposal|pitch|essay|draft|paper|thinking|theory|hypothesis|decision|conclusion|approach|strategy|analysis|story|outline|answer|take|point|model|assumption|assumptions|insight|finding|findings|source|document|article|chapter|reading|study|report)`;
const THIS = String.raw`(?:this|that|it|my|our|the|these|those)`;

interface Rule {
  re: RegExp;
  lean: FindingKind[];
}

const RULES: Rule[] = [
  // what am I missing? / what did I miss? / am I missing something (here)?
  { re: /^(?:so,?\s+|ok(?:ay)?,?\s+|and\s+|but\s+|hmm,?\s+)?what(?:'s|\s+is|\s+am\s+i|\s+are\s+we|\s+did\s+i|\s+have\s+i)\s+(?:missing|missed|miss|overlooking|overlooked|not\s+seeing|getting\s+wrong)(?:\s+(?:here|in\s+(?:this|my|our|the)\b[^?]{0,60}))?\s*\??$/i, lean: [] },
  { re: /^(?:am|are)\s+(?:i|we)\s+missing\s+(?:something|anything)(?:\s+(?:here|obvious|important|big))?(?:\s+in\s+(?:this|my|our)\b[^?]{0,60})?\s*\??$/i, lean: [] },
  { re: /\bwhat\s+(?:am\s+i|are\s+we)\s+(?:missing|overlooking)\s+(?:in|about|with)\s+(?:this|my|our)\s+(?:argument|reasoning|plan|thesis|case|essay|draft|decision|proposal|pitch|logic|idea|approach)\b/i, lean: [] },
  // poke holes / pick holes / find holes / tear it apart
  { re: new RegExp(String.raw`\b(?:poke|pick|find|punch|shoot)\s+holes\s+in\b`, 'i'), lean: ['gap'] },
  { re: new RegExp(String.raw`\b(?:tear|rip|pull)\s+(?:${THIS}\s+)?(?:${WORK}\s+)?apart\b`, 'i'), lean: ['gap'] },
  // where is this weak / what are the weaknesses / find the weak points / limitations
  { re: new RegExp(String.raw`\bwhere\s+(?:is|are|'s)\s+(?:${THIS}\s+)?(?:${WORK}\s+)?(?:weak|weakest|wrong|flawed|thin|shaky|vulnerable)\b`, 'i'), lean: ['gap', 'unsupported'] },
  { re: new RegExp(String.raw`\b(?:what(?:'s|\s+is|\s+are)|find|show\s+me|list|spot|identify)\s+(?:the\s+|my\s+|any\s+)?(?:weak(?:est)?\s+(?:points?|spots?|links?|parts?)|weaknesses|flaws|holes|limitations|blind\s*spots?)(?:\s+(?:in|of|with)\s+${THIS}\b[^?.!]{0,60})?\s*[?.!]?$`, 'i'), lean: ['gap'] },
  // devil's advocate / argue against / steelman the other side / push back / challenge me
  { re: /\b(?:play\s+)?devil'?s\s+advocate\b/i, lean: ['alternative', 'gap'] },
  { re: new RegExp(String.raw`\b(?:argue|make\s+the\s+case)\s+against\s+(?:me|${THIS}\b)`, 'i'), lean: ['alternative', 'gap'] },
  { re: /\bsteel-?man\s+the\s+(?:other|opposite|opposing)\s+(?:side|view|case|position)\b/i, lean: ['alternative'] },
  { re: new RegExp(String.raw`\b(?:challenge|push\s+back\s+on|test|question)\s+(?:me|my\s+(?:thinking|reasoning|argument|logic|assumptions?|plan|thesis|idea|decision)|${THIS}\s+${WORK})\b`, 'i'), lean: [] },
  { re: /^challenge\s+(?:this|that|it)\s*[.!?]?$/i, lean: [] },
  // stress-test / audit (asked as a test of their own work)
  { re: new RegExp(String.raw`\bstress[- ]?test\s+(?:${THIS}\b|me\b)`, 'i'), lean: ['gap', 'risk'] },
  // what am I assuming / what are my assumptions / hidden assumptions
  { re: /\bwhat\s+(?:am\s+i|are\s+we)\s+(?:assuming|taking\s+for\s+granted)\b/i, lean: ['assumption'] },
  { re: new RegExp(String.raw`\b(?:what|which)\s+(?:assumptions?|premises?)\s+(?:am\s+i|are\s+we|is\s+${THIS}(?:\s+${WORK})?|does\s+${THIS}(?:\s+${WORK})?|do(?:es)?\s+(?:my|our)\s+${WORK})\s+(?:making|relying|resting|depending|built|based|make|rely|rest|depend|assume)\b`, 'i'), lean: ['assumption'] },
  { re: new RegExp(String.raw`\b(?:identify|find|surface|spot|list|show\s+me)\s+(?:the\s+|my\s+|any\s+)?(?:hidden\s+|unstated\s+|implicit\s+|underlying\s+)?assumptions\b`, 'i'), lean: ['assumption'] },
  { re: /\b(?:hidden|unstated|implicit)\s+assumptions\b/i, lean: ['assumption'] },
  // what could go wrong / what are the risks of this decision / premortem
  { re: /^(?:so,?\s+|ok(?:ay)?,?\s+|and\s+)?what\s+(?:could|might|can|would)\s+go\s+wrong(?:\s+(?:here|with\s+(?:this|that|it|my|our)\b[^?]{0,60}))?\s*\??$/i, lean: ['risk', 'consequence'] },
  { re: new RegExp(String.raw`\bwhat\s+are\s+the\s+(?:risks|downsides)\s+(?:of|in|with)\s+(?:this|that|my|our)\s+(?:plan|decision|choice|approach|idea|proposal|strategy|option)\b`, 'i'), lean: ['risk'] },
  { re: /\b(?:run\s+a\s+|do\s+a\s+)?pre-?mortem\b/i, lean: ['risk', 'consequence'] },
  // what else could explain this / other explanations
  { re: /\bwhat\s+else\s+(?:could|might|would|can)\s+(?:explain|account\s+for|cause)\s+(?:this|that|it|these|those)\b/i, lean: ['alternative'] },
  { re: /\b(?:any\s+)?(?:alternative|other|competing|rival)\s+explanations?\s*(?:for\s+(?:this|that|it)\b|\?|$)/i, lean: ['alternative'] },
  // second-order effects / knock-on effects / unintended consequences
  { re: /\b(?:second[- ]order|knock[- ]on|downstream|unintended)\s+(?:effects?|consequences?|impacts?)\b/i, lean: ['consequence'] },
];

/** Never a challenge: a person talking about their own things going missing, or a question about the world. */
const NEVER = [
  /\b(?:i'?m|i\s+am|we'?re)\s+missing\s+(?:my|our|the|a|an)\b/i,
  /\bwhat\s+(?:am\s+i|are\s+we)\s+missing\s+(?:at|from)\s+(?:the|a|an)\s+(?:party|game|show|meeting|event|class|lecture|concert)\b/i,
  /\bwhat\s+am\s+i\s+missing\s+about\s+(?:how|why|what|the\s+way)\b/i,
  /\bmissing\s+(?:you|her|him|them|home)\b/i,
];

/**
 * Whether these words ask for the person's own reasoning to be tested, and what they lean on. Null for anything
 * else — including a long message that only mentions a weakness in passing (the words must be a request, not a
 * topic), unless the request stands as its own last sentence.
 */
export function challengeAsked(text: string, opts: { docFocused?: boolean } = {}): ChallengeAsk | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 2000) return null;
  if (NEVER.some((re) => re.test(t))) return null;
  // the request is the message, or its last sentence (an essay pasted, then "what am I missing?")
  const parts = t.split(/(?<=[.!?])\s+/);
  const last = parts[parts.length - 1] ?? t;
  const candidates = t.length <= 220 ? [t, last] : [last];
  for (const c of candidates) {
    if (c.length > 220) continue;
    for (const r of RULES) {
      if (r.re.test(c)) {
        const aboutDocument = !!opts.docFocused && /\b(?:this|the)\s+(?:source|document|paper|article|chapter|reading|study|report|pdf|file|text)\b/i.test(c);
        return { lean: r.lean, ...(aboutDocument || (opts.docFocused && /^where\s+is\s+this\s+weak/i.test(c)) ? { aboutDocument: true } : {}) };
      }
    }
  }
  return null;
}
