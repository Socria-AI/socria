// lib/runtime/epistemic.ts — EPISTEMIC CONTROL.
//
// What Socria may assert, and on what. Deterministic throughout: a model is
// never asked whether another model told the truth.
//
// BEFORE THE REPLY
//   what the turn asks for — a fact, something current, a reading of their
//   documents, a computation — and what evidence exists for it: the passages
//   of their documents, web sources when Core 4's gate opens (never on a
//   sensitive or off-the-record turn), the engine's results. Sources that
//   disagree with each other are found here and named to the reply.
//
// WHILE IT STREAMS
//   a citation must name evidence that was given. An invented [7], a passage
//   key [C4.2] no attached document has, a deep link no source carried — each
//   is removed from the sentence before the person sees it. A link to a page
//   nobody gave keeps only its site: the address of a page that may not exist
//   is never shown as though it did.
//
// AFTER IT
//   every figure, citation and reference in the reply is labelled:
//     supported      the evidence, their own words or the engine's results carry it
//     qualified      said with the hedge it needs ("about", "as of", "may")
//     unverified     nothing given this turn carries it — knowledge, not a source
//     contradicted   it cites a source that says something else
//   The counts go to the log (`[epistemic] {…}`), content-free, so the rate of
//   unsupported claims can be measured rather than asserted.
//
// WHAT IT DOES NOT DO. It does not gate reasoning, brainstorming or creative
// work: those make no claims of fact to check. And it does not pretend to
// catch every false sentence — only the ones that name a source, carry a
// figure, or invent a reference, which is where fabrication is checkable.
//
// Pure. No model, no network, no clock.

import { webIntent } from '../core4/web';
import type { ExplicitSignals } from '../core4/types';
import { smallTalk } from '../cognition/register';

// ── what the turn asks for ───────────────────────────────────────────

export type ClaimKind = 'fact' | 'current' | 'documents' | 'computation';

/** Time-sensitive: what was true when a model was trained may not be now. */
const CURRENT =
  /\b(?:latest|current(?:ly)?|today|tonight|right now|at the moment|this (?:week|month|year|season|quarter)|recent(?:ly)?|news|breaking|price of|stock price|exchange rate|interest rates?|weather|scores?|who (?:won|is winning|leads)|release date|newest|upcoming|still (?:the|in)|as of)\b|\b20(?:2[4-9]|3\d)\b/i;

const FACT =
  /^(?:what(?:'s|\s+is|\s+are|\s+was|\s+were)|who(?:'s|\s+is|\s+was|\s+were)|when(?:'s|\s+is|\s+was|\s+did)|where(?:'s|\s+is|\s+are)|which|how\s+(?:many|much|long|far|old|big|tall|fast))\b/i;

export interface NeedInput {
  text: string;
  signals: ExplicitSignals;
  /** documents whose passages travel with this turn */
  docs: number;
  /** the accuracy plan read the turn as mathematics, or computed something */
  math: boolean;
  /** what the conversation was established as — a sensitive or off-the-record one is never searched */
  policy?: 'full' | 'conversation_only' | 'none' | 'unknown';
}

export interface Need {
  kinds: ClaimKind[];
  /** Core 4's web gate */
  web: { want: boolean; why: string; kind?: 'search' | 'page'; url?: string };
}

export function assessNeed(i: NeedInput): Need {
  const t = i.text.trim();
  const kinds: ClaimKind[] = [];
  if (i.math) kinds.push('computation');
  if (i.docs) kinds.push('documents');
  // "How are you doing today?" asks after Socria, not after the world: it is
  // not a claim about anything current, and "what's up?" is not a fact.
  const chat = smallTalk(t);
  if (!chat && CURRENT.test(t) && (t.includes('?') || FACT.test(t) || /\b(?:look up|check|find out|search)\b/i.test(t))) kinds.push('current');
  else if (!chat && FACT.test(t)) kinds.push('fact');
  const w = webIntent(t, i.signals, i.policy);
  return { kinds, web: w.want ? { want: true, why: w.why, kind: w.kind, ...(w.url ? { url: w.url } : {}) } : { want: false, why: w.why } };
}

// ── the evidence ─────────────────────────────────────────────────────

export interface Source {
  /** what the reply cites it by: "1" for the web, "A3.12" for a passage */
  id: string;
  kind: 'web' | 'doc' | 'computed';
  text: string;
  url?: string;
  title?: string;
}

export interface Evidence {
  sources: Source[];
  /** web citation numbers that exist this turn */
  web: Set<number>;
  /** whether a passage key names a block of a document that came with the turn */
  hasPassage: (letter: string, block: string) => boolean;
  /** addresses a reply may link to: what the sources carried and what the person wrote */
  urls: Set<string>;
  /** the person's own words in this conversation — a figure they gave is theirs to repeat */
  theirs: string;
}

export function normUrl(u: string): string {
  return u
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[)\].,;:!?'"]+$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

const URL_RE = /\bhttps?:\/\/[^\s<>()[\]"']+/gi;

export interface EvidenceInput {
  web?: readonly { n: number; title?: string; url?: string; snippet?: string; text?: string }[];
  docs?: readonly { letter: string; blocks: readonly { id: string; text: string }[] }[];
  computed?: readonly string[];
  /** what the person has written in the conversation, this turn included */
  userTexts?: readonly string[];
}

export function buildEvidence(i: EvidenceInput): Evidence {
  const sources: Source[] = [];
  const web = new Set<number>();
  const urls = new Set<string>();
  for (const s of i.web ?? []) {
    web.add(s.n);
    if (s.url) urls.add(normUrl(s.url));
    sources.push({ id: String(s.n), kind: 'web', text: `${s.title ?? ''} ${s.text || s.snippet || ''}`, ...(s.url ? { url: s.url } : {}), ...(s.title ? { title: s.title } : {}) });
  }
  const blocks = new Map<string, Set<string>>();
  for (const d of i.docs ?? []) {
    blocks.set(d.letter, new Set(d.blocks.map((b) => b.id)));
    for (const b of d.blocks) {
      sources.push({ id: `${d.letter}${b.id.replace(/^p/, '')}`, kind: 'doc', text: b.text });
      for (const u of b.text.match(URL_RE) ?? []) urls.add(normUrl(u));
    }
  }
  for (const [k, c] of (i.computed ?? []).entries()) sources.push({ id: `engine${k + 1}`, kind: 'computed', text: c });
  const theirs = (i.userTexts ?? []).join('\n');
  for (const u of theirs.match(URL_RE) ?? []) urls.add(normUrl(u));
  return { sources, web, hasPassage: (letter, block) => !!blocks.get(letter)?.has(block), urls, theirs };
}

// ── while it streams: citations must name what was given ─────────────

const PASSAGE_LIST = /\[([A-Z]\d{1,4}\.\d{1,5}(?:\s*[,;]\s*[A-Z]\d{1,4}\.\d{1,5})*)\]/g;
const WEB_MARK = /\s?\[(\d{1,2})\](?!\()/g;
const MD_LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g;

function host(u: string): string {
  const m = /^(?:[a-z]+:\/\/)?(?:www\.)?([^/?#\s]+)/i.exec(u.trim());
  return m ? m[1].toLowerCase() : '';
}

function allowedUrl(u: string, ev: Evidence): boolean {
  const n = normUrl(u);
  if (ev.urls.has(n)) return true;
  // the same page with a fragment or a query is the same page
  const bare = n.replace(/[?#].*$/, '');
  for (const ok of ev.urls) if (ok.replace(/[?#].*$/, '') === bare) return true;
  return false;
}

export interface Rewritten {
  text: string;
  /** what was taken out, for the log: "cite:7", "passage:C4.2", "link:example.com" */
  removed: string[];
}

/**
 * One sentence, with every citation that names nothing removed and every
 * unsourced deep link reduced to its site. Code blocks never reach this
 * (the stream gate passes fenced code through whole).
 */
export function rewriteCitations(sentence: string, ev: Evidence): Rewritten {
  const removed: string[] = [];
  let text = sentence.replace(PASSAGE_LIST, (_all, inner: string) => {
    const keys = inner.split(/\s*[,;]\s*/);
    const kept = keys.filter((k) => {
      const m = /^([A-Z])(\d{1,4})\.(\d{1,5})$/.exec(k);
      const ok = !!m && ev.hasPassage(m[1], `p${m[2]}.${m[3]}`);
      if (!ok) removed.push(`passage:${k}`);
      return ok;
    });
    return kept.length ? `[${kept.join(', ')}]` : '';
  });
  text = text.replace(WEB_MARK, (all, n: string) => {
    if (ev.web.has(Number(n))) return all;
    removed.push(`cite:${n}`);
    return '';
  });
  text = text.replace(MD_LINK, (all, label: string, url: string) => {
    if (allowedUrl(url, ev)) return all;
    removed.push(`link:${host(url)}`);
    return host(url) && !label.toLowerCase().includes(host(url)) ? `${label} (${host(url)})` : label;
  });
  text = text.replace(URL_RE, (match) => {
    // the sentence's own full stop is not part of the address
    const trail = /[.,;:!?]+$/.exec(match)?.[0] ?? '';
    const url = trail ? match.slice(0, -trail.length) : match;
    if (allowedUrl(url, ev)) return match;
    const h = host(url);
    removed.push(`link:${h}`);
    return h + trail;
  });
  if (removed.length) text = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');
  return { text, removed };
}

// ── after it: every checkable claim, labelled ────────────────────────

export type Label = 'supported' | 'qualified' | 'unverified' | 'contradicted';

export interface Claim {
  kind: 'figure' | 'citation' | 'reference';
  /** the claim as written, short */
  text: string;
  label: Label;
  /** the source it named, when it named one */
  source?: string;
}

export interface Report {
  claims: Claim[];
  counts: Record<Label, number>;
}

/** A figure worth checking: a percentage, an amount, a measurement, a decimal, a large number, a year. */
const FIGURE =
  /(?:[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion|trillion|thousand))?|\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent|per cent|million|billion|trillion|thousand|km|kg|mph|miles|meters|metres|years?|people|users|deaths|°[cf]?)|\b\d+\.\d+\b|\b\d{1,3}(?:,\d{3})+\b|\b(?:1[5-9]|20)\d{2}\b)/gi;

const HEDGE = /\b(?:about|approximately|approx\.?|roughly|around|an estimated|estimated|nearly|almost|over|under|more than|less than|up to|as of|may|might|could|likely|probably|i think|i believe|if i recall|reportedly|~)\b|~/i;

const REFERENCE = /\(([A-Z][A-Za-z'’-]+(?:\s(?:et al\.?|and|&)\s?[A-Z]?[A-Za-z'’-]*)?),?\s(?:1[89]|20)\d{2}[a-z]?\)|\baccording to (?:a|an|the)\s(?:\d{4}\s)?(?:study|report|survey|paper|analysis|review)\b/gi;

/** A number in text as a value, with its magnitude applied: "4.2 million" → 4200000. */
export function valueOf(raw: string): number | null {
  const m = /(\d[\d,]*(?:\.\d+)?)\s?(k|m|bn|million|billion|trillion|thousand)?/i.exec(raw.replace(/[$€£¥]/g, ''));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mag = (m[2] ?? '').toLowerCase();
  const scale = mag === 'k' || mag === 'thousand' ? 1e3 : mag === 'm' || mag === 'million' ? 1e6 : mag === 'bn' || mag === 'billion' ? 1e9 : mag === 'trillion' ? 1e12 : 1;
  return n * scale;
}

function valuesIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/[$€£¥]?\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion|trillion|thousand)\b)?/gi)) {
    const v = valueOf(m[0]);
    if (v !== null) out.push(v);
  }
  return out;
}

const near = (a: number, b: number) => a === b || (b !== 0 && Math.abs(a - b) / Math.abs(b) <= 0.005);

const sentencesOf = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/**
 * The reply's checkable claims, labelled. `factual` says the turn asked for
 * facts: there, a figure nothing carries is unverified; in a turn that asked
 * for none (a story, a brainstorm), figures are not claims and are not counted.
 */
export function checkReply(reply: string, ev: Evidence, opts: { factual: boolean }): Report {
  const claims: Claim[] = [];
  const all = ev.sources;
  const textOf = (id: string) => all.find((s) => s.id === id)?.text ?? '';
  const theirValues = valuesIn(ev.theirs);
  for (const s of sentencesOf(reply)) {
    const cites = [
      ...[...s.matchAll(/\[(\d{1,2})\](?!\()/g)].map((m) => m[1]),
      ...[...s.matchAll(/\[([A-Z]\d{1,4}\.\d{1,5})\]/g)].map((m) => m[1]),
    ];
    for (const c of cites) {
      const exists = all.some((x) => x.id === c);
      claims.push({ kind: 'citation', text: s.slice(0, 160), label: exists ? 'supported' : 'unverified', source: c });
    }
    for (const m of s.matchAll(REFERENCE)) {
      if (!cites.length) claims.push({ kind: 'reference', text: m[0].slice(0, 120), label: HEDGE.test(s) ? 'qualified' : 'unverified' });
    }
    if (!opts.factual && !cites.length) continue;
    for (const m of s.matchAll(FIGURE)) {
      const v = valueOf(m[0]);
      if (v === null) continue;
      // a bare small count ("two steps", "3 options") is not a claim of fact
      if (v < 10 && !/[%$€£¥.]|million|billion|percent/i.test(m[0])) continue;
      const cited = cites.map(textOf).filter(Boolean);
      const anywhere = all.some((x) => valuesIn(x.text).some((y) => near(v, y))) || theirValues.some((y) => near(v, y));
      let label: Label;
      if (cited.length) {
        const inCited = cited.some((t) => valuesIn(t).some((y) => near(v, y)));
        label = inCited ? 'supported' : 'contradicted';
      } else if (anywhere) label = 'supported';
      else label = HEDGE.test(s) ? 'qualified' : 'unverified';
      claims.push({ kind: 'figure', text: m[0].trim(), label, ...(cites[0] ? { source: cites[0] } : {}) });
    }
  }
  const counts: Record<Label, number> = { supported: 0, qualified: 0, unverified: 0, contradicted: 0 };
  for (const c of claims) counts[c.label]++;
  return { claims, counts };
}

// ── sources that disagree ────────────────────────────────────────────

export interface Conflict {
  /** what the figures are of, in the sources' words */
  about: string;
  a: { source: string; value: string };
  b: { source: string; value: string };
}

const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'to', 'and', 'was', 'were', 'is', 'are', 'by', 'at', 'for', 'from', 'with', 'about', 'around', 'roughly', 'nearly', 'over', 'its', 'their', 'total', 'rose', 'fell', 'grew', 'increased', 'decreased', 'reached']);

/** Figures in a source, each with the two words before it and the year beside it. */
function facts(text: string): { key: string; year: string; unit: string; raw: string; v: number }[] {
  const out: { key: string; year: string; unit: string; raw: string; v: number }[] = [];
  for (const sentence of sentencesOf(text)) {
    const year = /\b(?:19|20)\d{2}\b/.exec(sentence)?.[0] ?? '';
    for (const m of sentence.matchAll(/([A-Za-z][A-Za-z-]+(?:\s+[A-Za-z][A-Za-z-]+){0,3})\s+(?:\w+\s+){0,2}?([$€£¥]?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|million|billion|thousand|km|kg)?)/g)) {
      const raw = m[2].trim();
      if (/^(?:19|20)\d{2}$/.test(raw)) continue;
      const v = valueOf(raw);
      if (v === null) continue;
      const unit = /%|percent/i.test(raw) ? '%' : /[$€£¥]/.test(raw) ? '$' : /million|billion|thousand/i.test(raw) ? 'n' : /km|kg/i.test(raw) ? raw.replace(/[^a-z]/gi, '').toLowerCase() : '';
      if (!unit) continue;
      const words = m[1].toLowerCase().split(/\s+/).filter((w) => !STOP.has(w));
      if (!words.length) continue;
      out.push({ key: words.slice(-2).join(' '), year, unit, raw, v });
    }
  }
  return out;
}

/** "revenue" and "company revenue" are one thing; "unemployment rate" and "interest rate" are two. */
function sameThing(a: string, b: string): boolean {
  const x = a.split(' ');
  const y = b.split(' ');
  return x.every((w) => y.includes(w)) || y.every((w) => x.includes(w));
}

/**
 * Two sources giving different figures for the same thing — the same words
 * before it, the same unit, the same year (or none). Conservative on purpose:
 * a conflict named to the reply has to be real, or it teaches the reply to
 * hedge things that agree.
 */
export function conflicts(sources: readonly Source[]): Conflict[] {
  const seen = sources.filter((s) => s.kind !== 'computed').map((s) => ({ s, f: facts(s.text) }));
  const out: Conflict[] = [];
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      if (seen[i].s.id === seen[j].s.id) continue;
      for (const x of seen[i].f) {
        const y = seen[j].f.find((z) => sameThing(z.key, x.key) && z.unit === x.unit && z.year === x.year && !near(z.v, x.v));
        if (y && !out.some((c) => c.about === x.key)) {
          out.push({ about: `${x.key}${x.year ? ` (${x.year})` : ''}`, a: { source: seen[i].s.id, value: x.raw }, b: { source: seen[j].s.id, value: y.raw } });
        }
      }
    }
  }
  return out.slice(0, 3);
}

/** What the reply is told about disagreeing sources. '' when they agree. */
export function renderConflicts(c: readonly Conflict[]): string {
  if (!c.length) return '';
  const cite = (id: string) => (/^\d+$/.test(id) ? `[${id}]` : `[${id}]`);
  return `\n\n=== Your sources disagree ===\n${c
    .map((x) => `- ${x.about}: ${cite(x.a.source)} gives ${x.a.value}; ${cite(x.b.source)} gives ${x.b.value}.`)
    .join('\n')}\nIf the answer turns on one of these, say that the sources disagree and what each says. Do not pick one silently.\n`;
}

/** What the reply is told when the turn asks for something current and no live source was checked. */
export const UNCHECKED_CURRENT = `\n\n=== Nothing current was checked this turn ===\nThis question is about something that changes. No live source was checked, so what you know may be out of date: answer from what you know, say plainly that it may have changed, and name where to check. Never present it as current.\n`;

/** The log line for one reply: counts, never content. */
export function epistemicLog(route: string, r: Report, removed: number, extra: Record<string, string | number> = {}): string {
  return `[epistemic] ${JSON.stringify({ route, ...r.counts, removed, ...extra })}`;
}
