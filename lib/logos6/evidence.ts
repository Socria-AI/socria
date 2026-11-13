// lib/logos6/evidence.ts — WHAT AN IDEA RESTS ON IN THEIR DOCUMENTS (Logos 6, Phase 3; pure).
//
// Two jobs, both answered from the passages themselves:
//
//   LINKING   a card's words, found in a passage of a document they brought: BM25 to find the candidates
//             (lib/docs/ground.ts selectPassages), then the share of the card's content words the passage holds.
//             Deterministic, in the browser where the documents live — no model, no tokens, and the text never
//             leaves the device. A link says only "your source says this, in these words"; it is not a verdict.
//
//   CHECKING  "Check against my sources": each claim, against the passages that bear on it, gets one of
//               supported      the passage says it (verbatim, or its numbers derived from the passage's)
//               partly         the passage is about it and says some of it
//               contradicted   the passage gives a different number for the same thing, or (model) says the
//                              opposite — and quotes where
//               not found      no passage holds it
//             The checks in code come first (lib/docs/ground.ts groundOf, the reply-citation checker). A model
//             may judge what the words alone cannot, but its verdict stands only with a quote that is really in
//             the passage it names; otherwise the claim is "not found". Nothing is ever "supported" without a
//             matched passage.

import { groundOf, selectPassages, sourceText } from '../docs/ground';
import { citeKey, type DocRef } from '../docs/render';
import { contentWords, coverage, matchable, numbersIn } from '../docs/text';
import type { NodeEvidence } from '../logos';

export interface Passage {
  /** the citation key, A3.12 */
  key: string;
  doc: string;
  block: string;
  /** the document's name, for the person */
  name: string;
  text: string;
}

export interface Linked extends Passage {
  /** the passage's own words that match, cut from it */
  quote: string;
  /** share of the card's content words the passage holds, 0..1 */
  score: number;
}

const sentencesOf = (t: string) => t.split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter(Boolean);

/** The passage's sentence that holds most of `words`, cut to a readable length. */
export function bestSentence(words: string, text: string, max = 240): string {
  let best = '';
  let score = -1;
  for (const s of sentencesOf(text)) {
    const c = coverage(words, s);
    if (c > score) {
      score = c;
      best = s;
    }
  }
  const q = best || text;
  return q.length > max ? `${q.slice(0, max - 1).trimEnd()}…` : q;
}

/** The passages of their documents that bear on `query`, best first, across every document. */
export function passagesFor(query: string, refs: readonly DocRef[], max = 6): Passage[] {
  if (!refs.length || !query.trim()) return [];
  const per = Math.max(2, Math.ceil(max / refs.length));
  const scored: { p: Passage; score: number }[] = [];
  for (const r of refs) {
    for (const { block, score } of selectPassages(r.doc, query, per)) {
      const text = sourceText(r.doc, block.id);
      if (text && text.trim()) scored.push({ p: { key: citeKey(r.letter, block.id), doc: r.doc.id, block: block.id, name: r.doc.title || r.doc.name, text: text.slice(0, 1600) }, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.p);
}

/**
 * The passage a card's words plainly come from, or null. "Plainly": the card says something (three content
 * words or more) and one passage holds at least `min` of them.
 */
export function linkEvidence(label: string, refs: readonly DocRef[], min = 0.6): Linked | null {
  if (contentWords(label).length < 3) return null;
  let best: Linked | null = null;
  for (const p of passagesFor(label, refs, 6)) {
    const score = coverage(label, p.text);
    if (score >= min && (!best || score > best.score)) best = { ...p, quote: bestSentence(label, p.text), score };
  }
  return best;
}

/** A link, as a card keeps it: a pointer and the passage's own words. */
export const asEvidence = (l: Pick<Linked, 'doc' | 'block' | 'quote'>, verdict?: NodeEvidence['verdict']): NodeEvidence => ({
  doc: l.doc,
  block: l.block,
  quote: l.quote,
  ...(verdict ? { verdict } : {}),
});

// ── checking ───────────────────────────────────────────────────────────────────────────────────────────────────

export const VERDICTS = ['supported', 'partly', 'contradicted', 'not-found'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Checked {
  id: string;
  /** the claim, as they wrote it */
  claim: string;
  /** the card it is, when it is one */
  node?: string;
  verdict: Verdict;
  /** the passage the verdict rests on — always, unless not found */
  passage?: Pick<Passage, 'key' | 'doc' | 'block' | 'name'> & { quote: string };
  /** why, in a sentence */
  why: string;
  /** decided by the words alone, or by a model and then held to its quote */
  by: 'words' | 'model';
}

/** What checking a claim against one passage finds, in code. */
export function checkInCode(claim: string, p: Passage): { verdict: Verdict; why: string } {
  const g = groundOf(claim, [p.text]);
  if (g.ground === 'verbatim' || g.ground === 'derived') return { verdict: 'supported', why: g.why };
  // the same thing, a different number: the passage cuts against it
  const onTopic = coverage(claim.replace(/[\d.,%]+/g, ' '), p.text) >= 0.5;
  if (g.ground === 'unsupported' && onTopic && numbersIn(claim).length && /not in the cited passage|the sign differs/.test(g.why)) {
    return { verdict: 'contradicted', why: `Your source gives a different figure. ${g.why}` };
  }
  if (g.ground === 'interpretation') return { verdict: 'partly', why: 'Your source is about this and says some of it, in other words.' };
  return { verdict: 'not-found', why: 'None of the passages that bear on it says this.' };
}

const RANK: Record<Verdict, number> = { contradicted: 4, supported: 3, partly: 2, 'not-found': 1 };

/** Every claim against its passages, in code: the strongest verdict any passage gives, with that passage. */
export function checkAll(claims: readonly { id: string; text: string; node?: string }[], passagesOf: (claimId: string) => readonly Passage[]): Checked[] {
  return claims.map((c) => {
    let best: Checked = { id: c.id, claim: c.text, ...(c.node ? { node: c.node } : {}), verdict: 'not-found', why: 'None of the passages that bear on it says this.', by: 'words' };
    for (const p of passagesOf(c.id)) {
      const r = checkInCode(c.text, p);
      if (RANK[r.verdict] > RANK[best.verdict]) {
        best = { ...best, verdict: r.verdict, why: r.why, passage: { key: p.key, doc: p.doc, block: p.block, name: p.name, quote: bestSentence(c.text, p.text) } };
      }
    }
    return best;
  });
}

const quoteIn = (quote: string, text: string) => {
  const q = matchable(quote);
  return q.length >= 12 && matchable(text).includes(q);
};

/**
 * A model's verdicts, held to their quotes: one stands only when it names a passage that bears on the claim and
 * quotes words really in it. The code's verdict stands wherever the model's does not, and a model never turns a
 * verdict the words found into "not found".
 */
export function gateChecks(raw: unknown, inCode: readonly Checked[], passagesOf: (claimId: string) => readonly Passage[]): Checked[] {
  const drafts = raw && typeof raw === 'object' && Array.isArray((raw as { checks?: unknown }).checks) ? ((raw as { checks: unknown[] }).checks as Record<string, unknown>[]) : [];
  return inCode.map((c) => {
    const d = drafts.find((x) => x && x.id === c.id);
    if (!d) return c;
    const verdict = VERDICTS.includes(d.verdict as Verdict) ? (d.verdict as Verdict) : null;
    if (!verdict || verdict === 'not-found') return c;
    const p = passagesOf(c.id).find((x) => x.key === d.key);
    const quote = typeof d.quote === 'string' ? d.quote.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
    if (!p || !quoteIn(quote, p.text)) return c;
    // the code found it supported or contradicted in the words: the words stand
    if (c.by === 'words' && (c.verdict === 'supported' || c.verdict === 'contradicted') && verdict !== c.verdict) return c;
    const why = typeof d.why === 'string' ? d.why.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    return { ...c, verdict, why: why || c.why, passage: { key: p.key, doc: p.doc, block: p.block, name: p.name, quote }, by: 'model' };
  });
}

// ── a check, as the conversation keeps it ──────────────────────────────────────────────────────────────────────

export interface SourceCheck {
  id: string;
  at: number;
  results: Checked[];
  /** how many documents were read */
  docs: number;
  /** no model answered: what the words alone found */
  wordsOnly?: boolean;
  /** what the person did with each: linked to its card */
  taken?: Record<string, 'linked'>;
}

const REF = /^[A-Za-z0-9_.:-]{1,80}$/;
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export function sanitizeSourceCheck(raw: unknown): SourceCheck | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^sc_[A-Za-z0-9]{1,24}$/.test(r.id) ? r.id : '';
  const at = typeof r.at === 'number' && r.at > 0 ? r.at : 0;
  if (!id || !at) return undefined;
  const results: Checked[] = [];
  for (const x of Array.isArray(r.results) ? r.results.slice(0, 16) : []) {
    if (!x || typeof x !== 'object') continue;
    const c = x as Record<string, unknown>;
    const verdict = VERDICTS.includes(c.verdict as Verdict) ? (c.verdict as Verdict) : null;
    const claim = str(c.claim, 300);
    const cid = typeof c.id === 'string' && REF.test(c.id) ? c.id : '';
    if (!verdict || !claim || !cid) continue;
    const pr = c.passage && typeof c.passage === 'object' ? (c.passage as Record<string, unknown>) : null;
    const passage =
      pr && typeof pr.key === 'string' && /^[A-Z]\d{1,4}\.\d{1,5}$/.test(pr.key) && typeof pr.doc === 'string' && REF.test(pr.doc) && typeof pr.block === 'string' && REF.test(pr.block) && str(pr.quote, 240)
        ? { key: pr.key, doc: pr.doc, block: pr.block, name: str(pr.name, 120), quote: str(pr.quote, 240) }
        : undefined;
    // a verdict other than "not found" without its passage is not kept as one
    const v: Verdict = verdict !== 'not-found' && !passage ? 'not-found' : verdict;
    results.push({ id: cid, claim, ...(typeof c.node === 'string' && REF.test(c.node) ? { node: c.node } : {}), verdict: v, ...(passage && v !== 'not-found' ? { passage } : {}), why: str(c.why, 200) || '', by: c.by === 'model' ? 'model' : 'words' });
  }
  if (!results.length) return undefined;
  const taken: Record<string, 'linked'> = {};
  if (r.taken && typeof r.taken === 'object') for (const [k, v] of Object.entries(r.taken as Record<string, unknown>)) if (REF.test(k) && v === 'linked') taken[k] = 'linked';
  return {
    id,
    at,
    results,
    docs: typeof r.docs === 'number' && Number.isFinite(r.docs) ? Math.max(0, Math.min(26, Math.floor(r.docs))) : 0,
    ...(r.wordsOnly === true ? { wordsOnly: true } : {}),
    ...(Object.keys(taken).length ? { taken } : {}),
  };
}

export const CHECK_MARK = 'Checked against your sources';
const VERDICT_WORD: Record<Verdict, string> = { supported: 'supported', partly: 'partly supported', contradicted: 'contradicted', 'not-found': 'not found' };

export function checkText(c: SourceCheck): string {
  return `${CHECK_MARK}:\n${c.results.map((r, i) => `${i + 1}. ${VERDICT_WORD[r.verdict]}: ${r.claim}${r.passage ? ` [${r.passage.key}]` : ''}`).join('\n')}`;
}

/** Words that ask to check their claims against their documents. */
export function checkAsked(text: string): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 220) return false;
  return (
    /\b(?:check|test|verify|fact-?check)\s+(?:this|that|it|these|my\s+(?:draft|claims?|argument|essay|paragraph|notes?|map|ideas?))\s+(?:against|with)\s+(?:my|the|these|our)\s+(?:sources?|documents?|files?|readings?|papers?)\b/i.test(t) ||
    /\b(?:is|are)\s+(?:this|that|it|these|my\s+claims?)\s+(?:supported|backed\s+up|borne\s+out)\s+by\s+(?:my|the|these)\s+(?:sources?|documents?|files?|readings?|papers?)\b/i.test(t) ||
    /\bwhat\s+do\s+my\s+(?:sources?|documents?|files?|readings?)\s+say\s+about\s+(?:this|that|it|these)\b/i.test(t)
  );
}
