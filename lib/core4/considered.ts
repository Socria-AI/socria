// lib/core4/considered.ts
//
// The already-considered record, and the novelty gate that reads it.
//
// THE CHURN THIS TARGETS. A sophisticated user left because Socria kept
// asking him questions he already asks himself. The fix is not better
// questions; it is knowing what territory the person has already covered —
// the objections they raised, the alternatives they named, the checks they
// ran — and never handing that territory back to them as if it were new.
//
// The record itself is a VIEW over the reasoning ledger (ledger.ts): entries
// the person raised, plus what Socria already said (so Socria does not repeat
// itself either). This file owns the matching: given a sentence Socria is
// about to deliver, is its substance already on the table?
//
// Two matchers, cheapest first:
//   lexical — content words with light stemming and a small synonym map,
//             scored as overlap of the shorter side. Decides the clear cases
//             in microseconds.
//   model   — the Answer Guard's cheap-model pass judges the sentences the
//             lexical matcher leaves UNCERTAIN (paraphrase, same idea in other
//             words). See guard2.ts.
//
// Pure.

import type { Novelty, NoveltyVerdict } from './types';
import { sentencesOf, interrogatives } from './questions';

const STOP = new Set(
  (
    'a an the and or but if then so of to in on at for with from by as is are was were be been being it its this that these ' +
    'those there here what which who whom whose when where why how do does did done have has had having i you he she we they ' +
    'me him her us them my your his our their not no yes can could would should will shall may might must just also very ' +
    'really about into over under out up down than too more most much many some any all each every other such only own same ' +
    'again further once both few one two get got make made thing things way ways lot bit consider considered considering ' +
    'think thought whether maybe perhaps still even well like'
  ).split(' ')
);

// A deliberately small synonym map: words that stand for the same concept in
// the domains Socria sees most. Anything subtler is the model matcher's job.
const SYNONYMS: Record<string, string> = {
  competitor: 'compet', competition: 'compet', rival: 'compet', incumbent: 'compet',
  copy: 'copi', clone: 'copi', replicate: 'copi', imitate: 'copi',
  cost: 'cost', price: 'cost', expense: 'cost', pricing: 'cost',
  risk: 'risk', danger: 'risk', downside: 'risk',
  sample: 'sampl', samples: 'sampl', n: 'sampl',
  confound: 'confound', confounder: 'confound', confounding: 'confound',
  cause: 'caus', causal: 'caus', causation: 'caus', causality: 'caus',
  correlation: 'correl', correlated: 'correl', association: 'correl',
  bias: 'bias', biased: 'bias',
  runway: 'runway', burn: 'runway', cash: 'runway',
  hire: 'hire', hiring: 'hire', recruit: 'hire',
  temperature: 'temp', temp: 'temp',
  dilution: 'dilut', diluted: 'dilut',
};

function stem(w: string): string {
  if (SYNONYMS[w]) return SYNONYMS[w];
  let s = w;
  for (const suf of ['ational', 'ization', 'isation', 'ations', 'ation', 'ments', 'ment', 'ities', 'ity', 'ness', 'ings', 'ing', 'edly', 'ed', 'ies', 'es', 's', 'ly']) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return SYNONYMS[s] ?? s;
}

export function conceptTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)) {
    if (!raw || STOP.has(raw) || raw.length < 3) continue;
    out.add(stem(raw));
  }
  return out;
}

/** 0..1: how much of the shorter text's concepts the longer one shares. */
export function similarity(a: string, b: string): number {
  const A = conceptTerms(a);
  const B = conceptTerms(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  const small = Math.min(A.size, B.size);
  // A one-concept text, or a two-concept one matching on one shared word, is
  // weak evidence. Two concepts, both shared, is not.
  const damp = small === 1 || (small === 2 && n < 2) ? 0.75 : 1;
  return (n / small) * damp;
}

export const REDUNDANT_AT = 0.6;
export const PARTIAL_AT = 0.34;

export function classify(sentence: string, considered: readonly string[]): NoveltyVerdict {
  let best = 0;
  let match: string | null = null;
  for (const c of considered) {
    const sc = similarity(sentence, c);
    if (sc > best) {
      best = sc;
      match = c;
    }
  }
  const verdict: Novelty = best >= REDUNDANT_AT ? 'REDUNDANT' : best >= PARTIAL_AT ? 'UNCERTAIN' : 'NOVEL';
  return { sentence, verdict, match: verdict === 'NOVEL' ? null : match, score: Math.round(best * 100) / 100, method: 'lexical' };
}

/** Phrases that raise a perspective, an objection or an alternative. */
const PERSPECTIVE = /^(?:have you (?:considered|thought about|looked at)|what about|how about|another (?:option|possibility|angle|way)|one (?:objection|concern|risk|alternative|possibility)|an alternative|alternatively|you (?:might|could|may) (?:also )?(?:consider|want to)|it(?:'s| is) worth (?:considering|noting)|don'?t forget|keep in mind|the (?:obvious |main |real |key )?(?:risk|objection|counterargument|concern|question) (?:is|here))/i;

/**
 * The sentences in a draft the novelty gate must read: every question
 * (explicit or disguised), and every sentence that raises a perspective, an
 * objection or an alternative. With `whole` (a contribution, or an answer
 * given while thinking together), every sentence.
 */
export function gateCandidates(draft: string, whole = false): string[] {
  const q = interrogatives(draft);
  const out = new Set<string>([...q.explicit, ...q.disguised]);
  const sents = sentencesOf(draft).map((s) => s.trim()).filter(Boolean);
  for (const s of sents) if (PERSPECTIVE.test(s.replace(/^[-*•\d.)\s]+/, ''))) out.add(s);
  if (whole) for (const s of sents) out.add(s);
  // Building PAST something they covered names it on purpose: "you've
  // already ruled out X; what's left is Y" is not a re-raise.
  return [...out].filter((s) => !ACKNOWLEDGES.test(s));
}

/** A sentence that credits what they already covered rather than raising it. */
const ACKNOWLEDGES = /\b(you(?:'ve| have)? already|you (?:ruled out|mentioned|said|raised|covered|noted|pointed out)|as you (?:said|noted|mentioned|pointed out)|beyond (?:the|your) )/i;
