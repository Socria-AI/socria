// lib/docs/ground.ts — what a claim stands on.
//
// Two jobs, both deterministic, neither a second model call:
//
//   SELECTION   which passages of a long document bear on a question —
//               BM25 over content words and numbers, a heading lending some
//               of its weight to its section — so a model sees the parts that
//               matter (lib/docs/render.ts)
//
//   CHECKING    every citation in what a model wrote, against the passage it
//               cites. Each cited sentence is put in one of four grounds:
//                 verbatim        the passage says it, in these words or near
//                                 enough, numbers and all
//                 derived         its numbers are not in the passage but are
//                                 calculated from numbers that are — and it
//                                 says it is a calculation
//                 interpretation  a reading of what the passage says: its
//                                 subject is there, its numbers are there
//                 unsupported     the passage does not hold it — a number it
//                                 does not contain (or of the wrong sign), or
//                                 nothing it talks about; or the citation
//                                 points at nothing
//
// The check is lexical and numerical. It cannot tell a subtle misreading in
// matching words from a faithful one; it can and does catch a number that is
// not in its source, a sign flipped, a quotation that is not a quotation and
// a citation to a passage that does not exist — the failures that matter most
// and that a reader cannot see.
//
// PURE.

import { citeKey, parseKey, type DocRef } from './render';
import { contentWords, coverage, matchable, numbersIn, type NumberToken } from './text';
import type { DocBlock, Ground, SourceDoc } from './types';

// ── selection ───────────────────────────────────────────────────────

const stem = (w: string) => w.replace(/ies$/, 'y').replace(/(?<=\w{3})(es|s)$/, '').replace(/(?<=\w{4})(ing|ed)$/, '');

function terms(text: string): string[] {
  const words = contentWords(text).map(stem);
  const nums = numbersIn(text).map((n) => `#${Math.abs(n.value)}`);
  return [...words, ...nums];
}

function blockText(doc: SourceDoc, b: DocBlock): string {
  if (b.kind === 'table' && b.table) {
    const t = doc.tables.find((x) => x.id === b.table);
    if (t) return `${t.caption ?? ''} ${t.rows.flat().join(' ')}`;
  }
  if (b.kind === 'figure' && b.figure) {
    const f = doc.figures.find((x) => x.id === b.figure);
    if (f) return `${f.caption ?? ''} ${f.alt ?? ''} ${b.text} ${f.described ?? ''}`;
  }
  return b.text;
}

/** The passages of a document that bear most on a question, best first. */
export function selectPassages(doc: SourceDoc, query: string, n: number): { block: DocBlock; score: number }[] {
  const q = [...new Set(terms(query))];
  if (!q.length) return [];
  const blocks = doc.blocks.filter((b) => b.kind !== 'header' && b.kind !== 'footer');
  const docs = blocks.map((b) => terms(blockText(doc, b)));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length || 1;
  const avg = docs.reduce((s, d) => s + d.length, 0) / N || 1;
  const k1 = 1.2;
  const bb = 0.75;
  const wantsTable = /\b(table|data|numbers?|values?|rows?|columns?|figures?)\b/i.test(query);
  const wantsMath = /\b(equation|formula|derivation|expression|math)\b/i.test(query);
  const wantsFigure = /\b(figure|chart|graph|plot|image|diagram|picture)\b/i.test(query);
  const raw = docs.map((d, i) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - bb + (bb * d.length) / avg)));
    }
    const k = blocks[i].kind;
    if (s > 0 && ((wantsTable && k === 'table') || (wantsMath && k === 'equation') || (wantsFigure && k === 'figure'))) s *= 1.5;
    return s;
  });
  // a heading that matches lends a share of its weight to its section
  const scores = [...raw];
  let headingScore = 0;
  blocks.forEach((b, i) => {
    if (b.kind === 'heading' || b.kind === 'title') headingScore = raw[i];
    else scores[i] += headingScore * 0.3;
  });
  return blocks
    .map((block, i) => ({ block, score: scores[i] }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ── citations ───────────────────────────────────────────────────────

export interface Cite {
  key: string;
  letter: string;
  block: string;
  /** where the key sits in the text */
  at: number;
  end: number;
}

/** Every citation key in a text: [A3.12], [A3.12, A4.2], [A3.12; 3.14] (a bare page.n keeps the letter before it). */
export function citesIn(text: string): Cite[] {
  const out: Cite[] = [];
  const re = /\[\s*([A-Z]\d{1,4}\.\d{1,5}(?:\s*[,;]\s*[A-Z]?\d{1,4}\.\d{1,5})*)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let letter = '';
    for (const part of m[1].split(/\s*[,;]\s*/)) {
      const withLetter = /^[A-Z]/.test(part) ? part : `${letter}${part}`;
      const k = parseKey(withLetter);
      if (!k) continue;
      letter = k.letter;
      out.push({ key: withLetter, letter: k.letter, block: k.block, at: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** Text with its citation keys taken out — what a reader reads as the claim. */
export const withoutCites = (text: string) => text.replace(/\s*\[\s*[A-Z]\d{1,4}\.\d{1,5}(?:\s*[,;]\s*[A-Z]?\d{1,4}\.\d{1,5})*\s*\]/g, '').replace(/\s+([.,;:!?])/g, '$1');

/**
 * Sentences of a text, with where each starts and ends. A decimal point
 * ("12.5"), an abbreviation ("e.g.", "Fig. 3") or an initial does not end
 * one; a citation just after a full stop belongs to the sentence before it.
 */
function sentences(text: string): { text: string; at: number; end: number }[] {
  const out: { text: string; at: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let end = -1;
    if (ch === '\n') end = i + 1;
    else if (ch === '.' || ch === '!' || ch === '?') {
      const next = text[i + 1];
      const closes = next === undefined || /[\s)"”’\]]/.test(next);
      const abbreviation = ch === '.' && /(?:\b(?:e\.g|i\.e|etc|vs|cf|fig|figs|eq|eqs|no|p|pp|al|approx|dr|mr|mrs|ms|st|vol|ch|sec)|\b[A-Z])$/i.test(text.slice(start, i));
      if (closes && !abbreviation) end = i + 1;
    }
    if (end < 0) continue;
    const cite = /^\s*\[\s*[A-Z]\d{1,4}\.\d{1,5}[^\]]*\]/.exec(text.slice(end));
    if (cite) end += cite[0].length;
    if (text.slice(start, end).trim()) out.push({ text: text.slice(start, end), at: start, end });
    start = end;
    i = end - 1;
  }
  if (text.slice(start).trim()) out.push({ text: text.slice(start), at: start, end: text.length });
  return out;
}

// ── grounds ─────────────────────────────────────────────────────────

/** A number used as a reference (page 3, table 2, figure 4, step 1), not a value. */
function isReference(text: string, n: NumberToken): boolean {
  const before = text.slice(Math.max(0, n.at - 14), n.at).toLowerCase();
  return /\b(page|pages|p\.|pp\.|table|figure|fig\.|section|§|eq\.|equation|slide|step|item|chapter|appendix|row|column|line|no\.|number|#)\s*$/.test(before);
}

const decimals = (raw: string) => (/\.(\d+)/.exec(raw.replace(/,/g, ''))?.[1].length ?? 0);

/** Whether a claimed number is a source number as written, or rounded to the claim's precision. */
function sameValue(claim: NumberToken, src: number): boolean {
  const c = Math.abs(claim.value);
  const s = Math.abs(src);
  const tol = 0.5 * Math.pow(10, -decimals(claim.raw)) + 1e-9;
  if (Math.abs(c - s) <= tol) return true;
  // 40% and 0.4 are one number
  if (claim.unit === '%' && Math.abs(c - s * 100) <= tol) return true;
  return false;
}

const DIRECTION = /\b(fell|fall|falls|falling|drop|dropped|drops|declin\w*|decreas\w*|down|lower|less|reduc\w*|lost|loss|shrank|shrunk|cut|negative|minus|below|deficit|deficits)\b/i;
const CALCULATION = /\b(differ\w*|total\w*|sum|summed|average\w*|mean|median|ratio|times|twice|half|percent(?:age)? (?:change|point)|change of|increase of|decrease of|grew by|rose by|fell by|dropped by|combined|altogether|per|share of|accounts? for|margin|net|gap|calculat\w*|comput\w*|works? out|that is|i\.e\.)\b|[=×÷]/i;

/** The calculation, if any, that yields a claimed number from source numbers. */
function derive(claim: NumberToken, src: number[]): string | null {
  const nums = [...new Set(src)].slice(0, 60);
  const target = Math.abs(claim.value);
  const tol = Math.max(0.5 * Math.pow(10, -decimals(claim.raw)), target * 0.001);
  const near = (v: number) => Number.isFinite(v) && Math.abs(Math.abs(v) - target) <= tol;
  const fmt = (v: number) => String(Number(v.toPrecision(6)));
  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (i === j) continue;
      const a = nums[i];
      const b = nums[j];
      if (j > i && near(a + b)) return `${fmt(a)} + ${fmt(b)} = ${fmt(a + b)}`;
      if (near(a - b)) return `${fmt(a)} − ${fmt(b)} = ${fmt(a - b)}`;
      if (j > i && near(a * b)) return `${fmt(a)} × ${fmt(b)} = ${fmt(a * b)}`;
      if (b !== 0 && near(a / b)) return `${fmt(a)} ÷ ${fmt(b)} = ${fmt(a / b)}`;
      if (b !== 0 && near(((a - b) / b) * 100)) return `(${fmt(a)} − ${fmt(b)}) ÷ ${fmt(b)} = ${fmt(((a - b) / b) * 100)}%`;
      if (b !== 0 && near((a / b) * 100)) return `${fmt(a)} ÷ ${fmt(b)} = ${fmt((a / b) * 100)}%`;
    }
  }
  if (nums.length >= 2 && nums.length <= 60) {
    const sum = nums.reduce((s, v) => s + v, 0);
    if (near(sum)) return `the sum of ${nums.length} numbers = ${fmt(sum)}`;
    if (near(sum / nums.length)) return `the mean of ${nums.length} numbers = ${fmt(sum / nums.length)}`;
  }
  return null;
}

export interface Grounding {
  ground: Ground;
  /** why, in a sentence a person can read */
  why: string;
  /** for a derived claim: how each number was calculated */
  calc?: string[];
}

/** What a claim stands on, against the text of the passages it cites. */
export function groundOf(claim: string, sources: string[]): Grounding {
  const text = withoutCites(claim);
  const src = sources.join('\n');
  if (!src.trim()) return { ground: 'unsupported', why: 'It cites a passage that holds no text.' };
  const srcNums = numbersIn(src).map((n) => n.value);
  const claimNums = numbersIn(text).filter((n) => !isReference(text, n));
  const calc: string[] = [];
  for (const c of claimNums) {
    const exact = srcNums.filter((s) => sameValue(c, s));
    if (exact.length) {
      // a sign the claim does not keep, and does not say in words, is a different number
      const signOk = exact.some((s) => Math.sign(s) === Math.sign(c.value) || s === 0) || (c.value > 0 && exact.some((s) => s < 0) && DIRECTION.test(text));
      if (!signOk) return { ground: 'unsupported', why: `The passage has ${exact[0]}, not ${c.raw}: the sign differs.` };
      continue;
    }
    const how = CALCULATION.test(text) ? derive(c, srcNums) : null;
    if (how) {
      calc.push(how);
      continue;
    }
    return { ground: 'unsupported', why: `${c.raw} is not in the cited passage${CALCULATION.test(text) ? ', and is not a calculation from its numbers' : ''}.` };
  }
  // quotations must be the passage's words
  const quotes = [...text.matchAll(/[“"]([^”"]{8,})[”"]/g)].map((m) => matchable(m[1]));
  const srcPlain = matchable(src);
  const badQuote = quotes.find((q) => !srcPlain.includes(q));
  if (badQuote) return { ground: 'unsupported', why: 'It quotes words the cited passage does not contain.' };
  if (calc.length) return { ground: 'derived', why: 'Its numbers are calculated from the passage’s.', calc };
  const cov = coverage(text, src);
  if (quotes.length || cov >= 0.8) return { ground: 'verbatim', why: quotes.length ? 'It quotes the passage.' : 'The passage says this.' };
  if (cov >= 0.2 || (claimNums.length && cov >= 0.1)) return { ground: 'interpretation', why: 'A reading of the passage, in other words.' };
  return { ground: 'unsupported', why: 'The cited passage does not talk about this.' };
}

// ── checking a reply ────────────────────────────────────────────────

export interface CiteCheck {
  key: string;
  /** the document's id and the block's, when the key points at something */
  doc?: string;
  block?: string;
  page?: number;
  ok: boolean;
}

export interface ClaimCheck {
  /** the sentence, citations taken out */
  text: string;
  keys: string[];
  ground: Ground;
  why: string;
  calc?: string[];
}

/** The text a block holds, tables and figures included, for checking a claim against. */
export function sourceText(doc: SourceDoc, blockId: string): string | null {
  const b = doc.blocks.find((x) => x.id === blockId);
  return b ? blockText(doc, b) : null;
}

/**
 * Every citation in a reply, checked: does it point at a passage, and does
 * the sentence it supports stand on that passage?
 */
export function checkReply(text: string, refs: DocRef[]): { cites: CiteCheck[]; claims: ClaimCheck[] } {
  const byLetter = new Map(refs.map((r) => [r.letter, r.doc]));
  const cites = citesIn(text);
  const checked: CiteCheck[] = cites.map((c) => {
    const doc = byLetter.get(c.letter);
    const b = doc?.blocks.find((x) => x.id === c.block);
    return { key: c.key, ok: !!b, ...(doc ? { doc: doc.id } : {}), ...(b ? { block: b.id, page: b.page } : {}) };
  });
  const claims: ClaimCheck[] = [];
  for (const s of sentences(text)) {
    const inside = cites.filter((c) => c.at >= s.at && c.at < s.end);
    if (!inside.length) continue;
    const sources = inside.map((c) => {
      const doc = byLetter.get(c.letter);
      return doc ? sourceText(doc, c.block) : null;
    });
    const keys = [...new Set(inside.map((c) => c.key))];
    if (sources.every((x) => x === null)) {
      claims.push({ text: withoutCites(s.text).trim(), keys, ground: 'unsupported', why: 'It cites a passage that does not exist.' });
      continue;
    }
    const g = groundOf(s.text, sources.filter((x): x is string => x !== null));
    claims.push({ text: withoutCites(s.text).trim(), keys, ...g, ...(sources.some((x) => x === null) && g.ground !== 'unsupported' ? { why: `${g.why} One of its citations points at nothing.` } : {}) });
  }
  return { cites: checked, claims };
}

/** The key for a block of a document in a conversation, for linking back: document id + block id → "A3.12". */
export function keyFor(refs: DocRef[], docId: string, blockId: string): string | null {
  const r = refs.find((x) => x.doc.id === docId);
  return r ? citeKey(r.letter, blockId) : null;
}
