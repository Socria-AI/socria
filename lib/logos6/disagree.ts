// lib/logos6/disagree.ts — WHERE DO THESE DISAGREE? (Logos 6, Phase 3; pure).
//
// Two or more documents, read for where they cut against each other. Each disagreement is a PAIR of passages —
// one from each document, both quoted — with what kind of disagreement it is, where that can be told:
//
//   direct        the same claim, opposite answers
//   definitions   they mean different things by the same word
//   populations   they are about different people or places, so both can hold
//   periods       they are about different times
//   data          they rest on different data
//   methods       they used different methods
//   tension       they pull against each other, and what settles it is not in the passages
//
// It never picks a winner. Two papers that disagree because they studied different populations are not in conflict
// — they answer different questions — and saying so is the most useful thing it can do (the same rule as the
// workspace's tensions, lib/workspace/trace.ts). Figures the documents give for the same thing are compared in code
// first (lib/runtime/epistemic.ts conflicts, conservative on purpose); a model may find what words alone cannot,
// and each pair it finds stands only if both quotes are really in the passages it names, from two documents.

import { matchable } from '../docs/text';

export const DISAGREE_KINDS = ['direct', 'definitions', 'populations', 'periods', 'data', 'methods', 'tension'] as const;
export type DisagreeKind = (typeof DISAGREE_KINDS)[number];

export const DISAGREE_LABEL: Readonly<Record<DisagreeKind, string>> = {
  direct: 'They say opposite things',
  definitions: 'Different meanings of the same word',
  populations: 'Different people or places',
  periods: 'Different times',
  data: 'Different data',
  methods: 'Different methods',
  tension: 'They pull against each other',
};

/** Kinds that mean both can be true: they answer different questions. */
export const BOTH_CAN_HOLD: ReadonlySet<DisagreeKind> = new Set(['definitions', 'populations', 'periods']);

export interface Side {
  key: string;
  doc: string;
  block: string;
  name: string;
  quote: string;
}

export interface Disagreement {
  id: string;
  kind: DisagreeKind;
  /** what they disagree about, in a few words */
  about: string;
  /** why, where it can be told — never which is right */
  because?: string;
  a: Side;
  b: Side;
  by: 'figures' | 'model';
}

export interface DocCompare {
  id: string;
  at: number;
  docs: { doc: string; name: string }[];
  pairs: Disagreement[];
  /** no model answered: only the figures were compared */
  figuresOnly?: boolean;
  /** what the person did with each pair */
  taken?: Record<string, 'kept' | 'dismissed'>;
}

export interface ComparePassage {
  key: string;
  doc: string;
  block: string;
  name: string;
  text: string;
}

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const quoteIn = (quote: string, text: string) => {
  const q = matchable(quote);
  return q.length >= 10 && matchable(text).includes(q);
};

/** A model's pairs, held to their quotes: both in the passages named, from two different documents. */
export function gateCompare(raw: unknown, passages: readonly ComparePassage[], max = 5): Disagreement[] {
  const byKey = new Map(passages.map((p) => [p.key, p]));
  const drafts = raw && typeof raw === 'object' && Array.isArray((raw as { pairs?: unknown }).pairs) ? ((raw as { pairs: unknown[] }).pairs as Record<string, unknown>[]) : [];
  const out: Disagreement[] = [];
  const side = (s: unknown): Side | null => {
    if (!s || typeof s !== 'object') return null;
    const r = s as Record<string, unknown>;
    const p = typeof r.key === 'string' ? byKey.get(r.key) : undefined;
    const quote = str(r.quote, 240);
    if (!p || !quote || !quoteIn(quote, p.text)) return null;
    return { key: p.key, doc: p.doc, block: p.block, name: p.name, quote };
  };
  for (const d of drafts.slice(0, 10)) {
    if (!d || typeof d !== 'object') continue;
    const a = side(d.a);
    const b = side(d.b);
    if (!a || !b || a.doc === b.doc) continue;
    const kind = DISAGREE_KINDS.includes(d.kind as DisagreeKind) ? (d.kind as DisagreeKind) : 'tension';
    const about = str(d.about, 120);
    if (!about) continue;
    if (out.some((x) => (x.a.key === a.key && x.b.key === b.key) || (x.a.key === b.key && x.b.key === a.key))) continue;
    const because = str(d.because, 220);
    out.push({ id: `d${out.length + 1}`, kind, about, ...(because ? { because } : {}), a, b, by: 'model' });
    if (out.length >= max) break;
  }
  return out;
}

/** Figures compared in code, as pairs: the conflicts lib/runtime/epistemic.ts finds, tied back to their passages. */
export function figurePairs(found: readonly { about: string; a: { source: string; value: string }; b: { source: string; value: string } }[], passages: readonly ComparePassage[]): Disagreement[] {
  const byKey = new Map(passages.map((p) => [p.key, p]));
  const out: Disagreement[] = [];
  for (const c of found) {
    const pa = byKey.get(c.a.source);
    const pb = byKey.get(c.b.source);
    if (!pa || !pb || pa.doc === pb.doc) continue;
    const cut = (p: ComparePassage, v: string) => {
      const i = p.text.indexOf(v);
      const s = Math.max(0, i - 80);
      return (i < 0 ? p.text.slice(0, 200) : p.text.slice(s, i + v.length + 60)).replace(/\s+/g, ' ').trim();
    };
    out.push({
      id: `d${out.length + 1}`,
      kind: 'data',
      about: c.about.slice(0, 120),
      because: `One gives ${c.a.value}, the other ${c.b.value}.`,
      a: { key: pa.key, doc: pa.doc, block: pa.block, name: pa.name, quote: cut(pa, c.a.value) },
      b: { key: pb.key, doc: pb.doc, block: pb.block, name: pb.name, quote: cut(pb, c.b.value) },
      by: 'figures',
    });
  }
  return out;
}

/** Pairs from the figures and from the model, one per pair of passages, the figures first. */
export function mergePairs(figures: readonly Disagreement[], model: readonly Disagreement[], max = 5): Disagreement[] {
  const out: Disagreement[] = [];
  for (const d of [...figures, ...model]) {
    if (out.some((x) => (x.a.key === d.a.key && x.b.key === d.b.key) || (x.a.key === d.b.key && x.b.key === d.a.key))) continue;
    out.push({ ...d, id: `d${out.length + 1}` });
    if (out.length >= max) break;
  }
  return out;
}

const REF = /^[A-Za-z0-9_.:-]{1,80}$/;
const KEY = /^[A-Z]\d{1,4}\.\d{1,5}$/;

function cleanSide(s: unknown): Side | null {
  if (!s || typeof s !== 'object') return null;
  const r = s as Record<string, unknown>;
  const quote = str(r.quote, 240);
  if (typeof r.key !== 'string' || !KEY.test(r.key) || typeof r.doc !== 'string' || !REF.test(r.doc) || typeof r.block !== 'string' || !REF.test(r.block) || !quote) return null;
  return { key: r.key, doc: r.doc, block: r.block, name: str(r.name, 120), quote };
}

export function sanitizeCompare(raw: unknown): DocCompare | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^dc_[A-Za-z0-9]{1,24}$/.test(r.id) ? r.id : '';
  const at = typeof r.at === 'number' && r.at > 0 ? r.at : 0;
  if (!id || !at) return undefined;
  const docs = (Array.isArray(r.docs) ? r.docs : [])
    .map((d) => (d && typeof d === 'object' && typeof (d as { doc?: unknown }).doc === 'string' && REF.test((d as { doc: string }).doc) ? { doc: (d as { doc: string }).doc, name: str((d as { name?: unknown }).name, 120) } : null))
    .filter((d): d is { doc: string; name: string } => !!d)
    .slice(0, 26);
  const pairs: Disagreement[] = [];
  for (const p of Array.isArray(r.pairs) ? r.pairs.slice(0, 8) : []) {
    if (!p || typeof p !== 'object') continue;
    const x = p as Record<string, unknown>;
    const a = cleanSide(x.a);
    const b = cleanSide(x.b);
    const about = str(x.about, 120);
    if (!a || !b || !about || a.doc === b.doc) continue;
    const because = str(x.because, 220);
    pairs.push({
      id: typeof x.id === 'string' && /^d\d{1,2}$/.test(x.id) ? x.id : `d${pairs.length + 1}`,
      kind: DISAGREE_KINDS.includes(x.kind as DisagreeKind) ? (x.kind as DisagreeKind) : 'tension',
      about,
      ...(because ? { because } : {}),
      a,
      b,
      by: x.by === 'figures' ? 'figures' : 'model',
    });
  }
  const taken: Record<string, 'kept' | 'dismissed'> = {};
  if (r.taken && typeof r.taken === 'object') for (const [k, v] of Object.entries(r.taken as Record<string, unknown>)) if (/^d\d{1,2}$/.test(k) && (v === 'kept' || v === 'dismissed')) taken[k] = v;
  return { id, at, docs, pairs, ...(r.figuresOnly === true ? { figuresOnly: true } : {}), ...(Object.keys(taken).length ? { taken } : {}) };
}

export const COMPARE_MARK = 'Where your sources disagree';

export function compareText(c: DocCompare): string {
  if (!c.pairs.length) return `${COMPARE_MARK}: on what was compared, they do not cut against each other.`;
  return `${COMPARE_MARK}:\n${c.pairs.map((p, i) => `${i + 1}. ${p.about} — ${DISAGREE_LABEL[p.kind]} [${p.a.key}] [${p.b.key}]`).join('\n')}`;
}

/** Words that ask where their documents disagree. */
export function compareAsked(text: string): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 220) return false;
  return (
    /\bwhere\s+do\s+(?:these|my|the|they)\s*(?:sources?|documents?|papers?|readings?|files?|articles?|studies)?\s+(?:disagree|differ|conflict|contradict)\b/i.test(t) ||
    /\b(?:do|does)\s+(?:these|my|the)\s+(?:sources?|documents?|papers?|readings?|files?|articles?|studies)\s+(?:agree|disagree|contradict\s+each\s+other|conflict)\b/i.test(t) ||
    /\b(?:compare|contrast)\s+(?:my|these|the)\s+(?:sources?|documents?|papers?|readings?|files?|articles?|studies)\b/i.test(t) ||
    /\b(?:contradictions?|disagreements?|conflicts?)\s+(?:between|across|among|in)\s+(?:these|my|the)\s+(?:sources?|documents?|papers?|readings?|files?|articles?|studies)\b/i.test(t)
  );
}
