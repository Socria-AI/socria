// lib/challenge/challenge-gate.ts — THE CHECKS, IN CODE (Logos 6, Phase 1; pure).
//
// Nothing a model says about someone's reasoning reaches them until it has passed these, in order:
//
//   1. QUOTED     every quote must be found in what it points at — their words in this line, a card on the map,
//                 a passage of a document they brought, an earlier position held in memory — after whitespace,
//                 case and quotation marks are set aside. A quote with "…" in it must be found piece by piece,
//                 in order, in one place. A finding left with no quote that holds is dropped: no quote, no
//                 finding. This is what stops a weakness being invented.
//   2. SPECIFIC   the finding must share a content word with what it quotes (or the card it is about), and a
//                 stock phrase — "more research is needed", "consider other perspectives", "it depends on the
//                 context" — must say more than the phrase. What could be said of anything is dropped.
//   3. NEW        the line's considered set (challenge.ts consideredIn: findings raised before, whatever became of
//                 them; finding cards; their own caveats and objections) and Socria's recent replies: a finding
//                 that restates one is dropped — never raised twice — and one that only partly overlaps is kept a
//                 notch less sure (lib/core4/considered.ts classify, the novelty gate Core 4 built).
//   4. CALIBRATED a finding the model is unsure of is said as a question, not a claim.
//   5. CAPPED     the strongest first — how sure, how much rests on what it is about, whether the person's words
//                 leaned on its kind — and no more than the cap (five; the card shows three).
//
// Whatever survives is the challenge. If nothing does, that is the answer: it holds up on what is here.

import { classify, REDUNDANT_AT, PARTIAL_AT } from '../core4/considered';
import { contentWords, matchable } from '../docs/text';
import { FINDING_KINDS, LIMITS, MAX_KEPT, type Anchor, type AnchorFrom, type Confidence, type Finding, type FindingKind } from './challenge';
import type { Targeted } from './challenge-targets';

export interface GateMaterial {
  /** the person's own messages in this line, with their ids */
  said: readonly { id: string; text: string }[];
  /** Socria's recent replies, for "already said" */
  replies?: readonly string[];
  /** the cards on the map */
  ideas: readonly { id: string; label: string; detail?: string }[];
  /** passages of their documents, keyed as the conversation cites them (A3.12) */
  sources?: readonly { key: string; doc?: string; block?: string; text: string }[];
  /** earlier positions from memory: what they held in another conversation */
  earlier?: readonly { id: string; text: string }[];
  /** what this line has already covered (challenge.ts consideredIn) */
  considered: readonly string[];
  /** what the structure shows, found in code (challenge-targets.ts) — already quoted */
  structural?: readonly Targeted[];
  /** how much rests on a card, for ordering (lib/logos6/support.ts weightOf) */
  weightOf?: (id: string) => number;
}

export interface GateOptions {
  cap?: number;
  /** the kinds the person's words leaned on ("what am I assuming?") */
  lean?: readonly FindingKind[];
}

export type DropWhy = 'shape' | 'no-quote' | 'generic' | 'considered' | 'repeat' | 'duplicate' | 'cap';

export interface GateResult {
  findings: Finding[];
  dropped: { text: string; why: DropWhy }[];
}

// ── 1. quoted ──────────────────────────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => matchable(s ?? '');

/** The pieces of a quote, split at an ellipsis; each must be found, in order, in the same text. */
function pieces(quote: string): string[] {
  return quote
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map(norm)
    .filter((p) => p.length >= 4);
}

/** Whether `quote` is in `text`: whole, or piece by piece in order. A quote too slight to mean anything is not. */
export function quoteIn(quote: string, text: string): boolean {
  const ps = pieces(quote);
  if (!ps.length) return false;
  const total = ps.join(' ');
  if (total.length < 12 && contentWords(total).length < 2) return false;
  const t = norm(text);
  let at = 0;
  for (const p of ps) {
    const i = t.indexOf(p, at);
    if (i < 0) return false;
    at = i + p.length;
  }
  return true;
}

interface Pools {
  said: readonly { id: string; text: string }[];
  idea: readonly { id: string; text: string }[];
  source: readonly { id: string; text: string; doc?: string; block?: string }[];
  earlier: readonly { id: string; text: string }[];
}

/** Find a quote where it says it is from, then anywhere it could honestly be from. */
function anchorOf(q: { from?: unknown; ref?: unknown; quote?: unknown }, pools: Pools): Anchor | null {
  const quote = typeof q.quote === 'string' ? q.quote.replace(/\s+/g, ' ').trim().replace(/^["“']|["”']$/g, '').slice(0, LIMITS.quote) : '';
  if (!quote) return null;
  const said = typeof q.from === 'string' ? (q.from as AnchorFrom) : undefined;
  const ref = typeof q.ref === 'string' ? q.ref : typeof q.ref === 'number' ? String(q.ref) : '';
  const order: AnchorFrom[] = said && said in pools ? [said, ...(['said', 'idea', 'source', 'earlier'] as AnchorFrom[]).filter((x) => x !== said)] : ['said', 'idea', 'source', 'earlier'];
  for (const from of order) {
    const pool = pools[from];
    const named = pool.find((x) => x.id === ref || (from === 'said' && /^m?\d+$/.test(ref) && x.id === `m${ref.replace(/^m/, '')}`));
    const hit = named && quoteIn(quote, named.text) ? named : pool.find((x) => quoteIn(quote, x.text));
    if (!hit) continue;
    const src = hit as { id: string; doc?: string; block?: string };
    return { from, ref: hit.id, quote, ...(from === 'source' && src.doc ? { doc: src.doc } : {}), ...(from === 'source' && src.block ? { block: src.block } : {}) };
  }
  return null;
}

// ── 2. specific ────────────────────────────────────────────────────────────────────────────────────────────────

/** Stock phrases that fit any reasoning. One that says nothing more than this is not a finding. */
const GENERIC =
  /\b(?:more research (?:is|may be) needed|further research|consider (?:other|different|alternative|multiple) (?:perspectives|viewpoints|angles|options)|(?:it|this) (?:all )?depends on (?:the )?(?:context|situation|circumstances)|there (?:may|might|could) be (?:other|some) factors|correlation (?:is not|does not (?:imply|equal)|≠) causation|could be biased|might not be (?:accurate|reliable)|think (?:more )?(?:carefully|critically) about|be careful (?:with|about)|the evidence (?:may|might) be limited|not everyone (?:will|would) agree|there are (?:many|other) ways)\b/i;

/** A word's stem, crudely: "charge", "charges", "charged", "charging" are one word here. */
const stemW = (w: string) =>
  w
    .replace(/ies$/, 'y')
    .replace(/(?<=\w{3})(?:es|s)$/, '')
    .replace(/(?<=\w{3})(?:ing|ed)$/, '')
    .replace(/(?<=\w{3})e$/, '');
const wordsOf = (s: string) => new Set(contentWords(s).map(stemW));

function shared(text: string, against: string): number {
  const a = wordsOf(text);
  const b = wordsOf(against);
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

// ── the gate ───────────────────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const CONF: Confidence[] = ['high', 'medium', 'low'];
const lower = (c: Confidence): Confidence => (c === 'high' ? 'medium' : 'low');
const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/** Run a model's draft findings, and the structure's, through the checks. */
export function gate(raw: unknown, m: GateMaterial, opts: GateOptions = {}): GateResult {
  const cap = Math.max(1, Math.min(MAX_KEPT, opts.cap ?? MAX_KEPT));
  const lean = new Set(opts.lean ?? []);
  const pools: Pools = {
    said: m.said,
    idea: m.ideas.map((n) => ({ id: n.id, text: `${n.label}${n.detail ? ` — ${n.detail}` : ''}` })),
    source: (m.sources ?? []).map((s) => ({ id: s.key, text: s.text, doc: s.doc, block: s.block })),
    earlier: m.earlier ?? [],
  };
  const ideaLabel = new Map(m.ideas.map((n) => [n.id, n.label]));
  const dropped: GateResult['dropped'] = [];
  const replySentences = (m.replies ?? []).flatMap((r) => r.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 20));

  type Cand = Finding & { score: number };
  const kept: Cand[] = [];

  const novelty = (text: string): 'new' | 'partial' | 'considered' | 'repeat' => {
    if (m.considered.length) {
      const v = classify(text, m.considered);
      if (v.verdict === 'REDUNDANT' || v.score >= REDUNDANT_AT) return 'considered';
      if (v.verdict === 'UNCERTAIN' || v.score >= PARTIAL_AT) {
        // partly covered; still worth saying, a notch less sure
        if (replySentences.length && classify(text, replySentences).score >= REDUNDANT_AT) return 'repeat';
        return 'partial';
      }
    }
    if (replySentences.length && classify(text, replySentences).score >= REDUNDANT_AT) return 'repeat';
    return 'new';
  };

  const scoreOf = (f: Finding) => {
    const w = f.target && m.weightOf ? Math.min(6, m.weightOf(f.target)) : 0;
    return RANK[f.confidence] * 10 + w * 3 + (f.by === 'structure' ? 2 : 0) + (lean.has(f.kind) ? 4 : 0);
  };

  // the structure's first: quoted by construction, still held to novelty
  for (const s of m.structural ?? []) {
    const nv = novelty(s.text);
    if (nv === 'considered' || nv === 'repeat') {
      dropped.push({ text: s.text, why: nv });
      continue;
    }
    const f: Finding = { ...s, confidence: nv === 'partial' ? lower(s.confidence) : s.confidence };
    delete (f as Partial<Targeted>).weight;
    kept.push({ ...f, score: scoreOf(f) + Math.min(6, s.weight) });
  }

  const drafts = raw && typeof raw === 'object' && Array.isArray((raw as { findings?: unknown }).findings) ? ((raw as { findings: unknown[] }).findings as unknown[]) : [];
  for (const d of drafts.slice(0, 12)) {
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    const kind = FINDING_KINDS.includes(r.kind as FindingKind) ? (r.kind as FindingKind) : null;
    let text = str(r.text, LIMITS.text);
    if (!kind || text.length < 12) {
      dropped.push({ text: text || '(empty)', why: 'shape' });
      continue;
    }
    // 1. quoted
    const qs = Array.isArray(r.quotes) ? r.quotes : Array.isArray(r.anchors) ? r.anchors : [];
    const anchors: Anchor[] = [];
    for (const q of qs.slice(0, 4)) {
      const a = q && typeof q === 'object' ? anchorOf(q as Record<string, unknown>, pools) : null;
      if (a && !anchors.some((x) => x.from === a.from && x.ref === a.ref && x.quote === a.quote)) anchors.push(a);
    }
    if (!anchors.length) {
      dropped.push({ text, why: 'no-quote' });
      continue;
    }
    // what it is about: the card it names, or the card it quotes
    const named = typeof r.target === 'string' && ideaLabel.has(r.target) ? r.target : undefined;
    const target = named ?? anchors.find((a) => a.from === 'idea')?.ref;
    // 2. specific
    const against = [...anchors.map((a) => a.quote), target ? ideaLabel.get(target) ?? '' : ''].join(' ');
    const overlap = shared(text, against);
    if (overlap === 0 || (GENERIC.test(text) && overlap < 2)) {
      dropped.push({ text, why: 'generic' });
      continue;
    }
    // 3. new
    const nv = novelty(text);
    if (nv === 'considered' || nv === 'repeat') {
      dropped.push({ text, why: nv });
      continue;
    }
    // 4. calibrated
    let confidence: Confidence = CONF.includes(r.confidence as Confidence) ? (r.confidence as Confidence) : 'medium';
    if (nv === 'partial') confidence = lower(confidence);
    let question = false;
    if (confidence === 'low') {
      question = true;
      const ask = str(r.ask, LIMITS.text);
      if (ask.endsWith('?') && shared(ask, against) > 0) text = ask;
    }
    const matters = str(r.matters, LIMITS.matters);
    let settle = str(r.settle, LIMITS.settle);
    if (GENERIC.test(settle) && shared(settle, against) === 0) settle = '';
    const f: Finding = {
      id: '',
      kind,
      text,
      anchors: anchors.slice(0, 3),
      ...(matters ? { matters } : {}),
      ...(settle ? { settle } : {}),
      confidence,
      ...(target ? { target } : {}),
      ...(question ? { question: true } : {}),
      by: 'model',
    };
    // the same point as one already kept: the better-worded one stays, with both sets of quotes
    const twin = kept.find((k) => (k.target && k.target === f.target && k.kind === f.kind) || classify(f.text, [k.text]).score >= REDUNDANT_AT);
    if (twin) {
      if (twin.by === 'structure' && f.confidence !== 'low') {
        twin.text = f.text;
        if (f.matters && !twin.matters) twin.matters = f.matters;
        if (f.settle) twin.settle = f.settle;
        for (const a of f.anchors) if (twin.anchors.length < 3 && !twin.anchors.some((x) => x.quote === a.quote)) twin.anchors.push(a);
      }
      dropped.push({ text: f.text, why: 'duplicate' });
      continue;
    }
    kept.push({ ...f, score: scoreOf(f) });
  }

  kept.sort((a, b) => b.score - a.score);
  for (const k of kept.slice(cap)) dropped.push({ text: k.text, why: 'cap' });
  const findings = kept.slice(0, cap).map(({ score: _s, ...f }, i) => ({ ...f, id: `f${i + 1}` }));
  return { findings, dropped };
}
