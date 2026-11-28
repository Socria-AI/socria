// lib/ux-v0/company/read.ts — statements a company makes about itself, found in something the person imported.
//
// A page of a company's own writing (its site, a charter, a brand note) usually says what it is for, what it believes
// and who it speaks to. This reads such text for sentences that say so — by the words that mark them ("our mission",
// "we believe", "for people who") — and offers each as a candidate, with the kind it looks like and where it came
// from. It does not summarize, rephrase or infer: a candidate is the company's own sentence, quoted. Nothing found
// here is a fact until the person confirms it (schema.ts addFact with source 'imported').

import type { FactKind } from './schema';

export interface Candidate {
  kind: FactKind;
  text: string;
}

const CUES: [FactKind, RegExp][] = [
  ['mission', /\b(our mission|mission is|we exist to|our purpose|purpose is|we(?:'re| are) (?:here|building|making|on a mission) to|we (?:build|make|help) [a-z ]{3,60} (?:so that|to))\b/i],
  ['avoid', /\b(we (?:never|do not|don't|won't|will not|refuse to)|never (?:use|show|say|write)|no (?:stock|dark patterns|jargon|hype|gradients?)|not (?:a|another) )\b/i],
  ['philosophy', /\b(we believe|we think|we hold|our (?:belief|philosophy|principle|conviction)|the idea (?:is|that)|should (?:never|always)|is (?:not|more than) (?:a|an|just))\b/i],
  ['audience', /\b(for (?:people|students|teams|designers|developers|teachers|writers|founders|companies|anyone|those) who|our (?:users|customers|audience|readers|members) (?:are|is)|built for|made for|designed for)\b/i],
  ['principle', /\b(our (?:voice|tone)|we (?:write|speak|say|sound)|plain (?:words|language|english)|in our (?:writing|copy)|tone of voice)\b/i],
  ['positioning', /\b(the (?:only|first)|unlike (?:other|most)|instead of|rather than|is an? [a-z -]{3,50} (?:for|that)|an alternative to)\b/i],
];

/** Sentences of a text that say what the company is, offered by kind (the first cue that fits), at most `max`. */
export function candidatesFrom(text: string, max = 16): Candidate[] {
  const clean = String(text ?? '')
    .replace(/\r/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]+/g, '')
    .replace(/[ \t]+/g, ' ');
  const sentences = clean
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z“"'])|\n(?=[-•–] )/)
    .map((s) => s.replace(/^[-•–]\s*/, '').replace(/\s*\n\s*/g, ' ').trim())
    .filter((s) => s.length >= 24 && s.length <= 320 && /[a-z]/.test(s) && s.split(' ').length >= 5);
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    const hit = CUES.find(([, re]) => re.test(s));
    if (!hit) continue;
    const key = s.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: hit[0], text: s });
    if (out.length >= max) break;
  }
  return out;
}
