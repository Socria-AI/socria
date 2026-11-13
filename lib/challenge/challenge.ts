// lib/challenge/challenge.ts — CHALLENGE THAT CAN BE TRUSTED (Logos 6, Phase 1; docs/LOGOS-6.md §2).
//
// One engine for every way of asking "what am I missing?": in words, from the chip above the composer, from a
// card's "Challenge it", from a selection of cards, from a document. What it returns is a FINDING: a short
// claim about the person's own reasoning — a hidden assumption, a logical gap, an unsupported conclusion, a
// contradiction, missing evidence, a decision risk, an alternative explanation, a second-order consequence —
// that QUOTES what it is about.
//
// The quote is the whole point. A frontier assistant can list possible weaknesses on request; what it cannot do
// without help is tie each one to the person's own words, map and sources, leave out what they already
// considered, and keep the record. So every finding is checked in code before anyone sees it
// (challenge-gate.ts): a quote that is not in what it points at, a finding that could be said of anything, one
// the person already raised or already dealt with — each is dropped. If nothing survives, the answer is that the
// reasoning holds up on what is here, which is a first-class answer and never padded with a manufactured flaw.
//
// What the person does with each finding is theirs: keep it on the map, say they have thought about it, say it is
// not relevant, talk it through. The last three put it in the line's considered set, so it is never raised in
// this line again; a kept one becomes a card of Socria's, marked as Socria's for good.
//
// PURE. This file: the shapes, reading them back, the words a challenge leaves in the conversation, a finding as
// a card, and the considered set. The rest: challenge-intent.ts (words that ask), challenge-targets.ts (what the
// structure shows, found in code), challenge-gate.ts (the checks), challenge-prompt.ts (what the model is asked).

import { CHALLENGE_SCOPES, FINDING_KINDS, type ChallengeScopeKind, type FindingKind } from '../logos6/vocab';
import { MAP_LABEL_MAX, type LogosNode, type LogosRelation, type ThinkingMap } from '../logos';

export { FINDING_KINDS, CHALLENGE_SCOPES };
export type { FindingKind, ChallengeScopeKind };

/** What each kind is called on the card. */
export const KIND_LABEL: Readonly<Record<FindingKind, string>> = {
  assumption: 'Hidden assumption',
  gap: 'Logical gap',
  unsupported: 'Unsupported conclusion',
  contradiction: 'Contradiction',
  evidence: 'Missing evidence',
  risk: 'Decision risk',
  alternative: 'Alternative explanation',
  consequence: 'Second-order consequence',
};

/** Where a quote comes from: their words in this line, a card on the map, a passage of a document, an earlier conversation. */
export const ANCHOR_FROM = ['said', 'idea', 'source', 'earlier'] as const;
export type AnchorFrom = (typeof ANCHOR_FROM)[number];

export interface Anchor {
  from: AnchorFrom;
  /** said: the message's id · idea: the card's id · source: the citation key (A3.12) · earlier: the memory's id */
  ref: string;
  /** the words, exactly as they are in what `ref` points at */
  quote: string;
  /** source: the document and the block the key points at */
  doc?: string;
  block?: string;
}

export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export interface Finding {
  /** f1…f5, unique within its challenge */
  id: string;
  kind: FindingKind;
  /** one sentence, to them: the thing worth checking */
  text: string;
  /** at least one, every one found in what it points at (challenge-gate.ts) */
  anchors: Anchor[];
  /** if it's wrong: what moves */
  matters?: string;
  /** to settle it: something they can do */
  settle?: string;
  confidence: Confidence;
  /** the card it is about, when it is about one */
  target?: string;
  /** low confidence: said as a question, not a claim */
  question?: boolean;
  /** found by the structure alone, or by the model (and then checked) */
  by: 'structure' | 'model';
}

export const FINDING_STATES = ['open', 'kept', 'considered', 'dismissed', 'resolved'] as const;
export type FindingState = (typeof FINDING_STATES)[number];

export interface Challenge {
  id: string;
  at: number;
  scope: { kind: ChallengeScopeKind; ids?: string[]; doc?: string };
  /** at most MAX_KEPT, the strongest first; the card shows SHOWN of them, the rest a press away */
  findings: Finding[];
  /** nothing passed the checks: it holds up on what is here */
  holds: boolean;
  /** when it holds: one sentence on why */
  why?: string;
  /** when it holds: the weakest point, which is minor */
  weakest?: string;
  /** what was checked, said on the card so it is never generic by appearance either */
  checked: { turns: number; ideas: number; files: number; earlier: number };
  /** no model answered: only what the structure proves */
  structural?: boolean;
  /** Guess first (Phase 4): the part they guessed was weakest, and whether a finding was about it */
  guess?: { id?: string; label: string; hit?: boolean };
  /** what the person did with each finding, by id */
  taken?: Record<string, FindingState>;
}

/** Shown at once; "Show more" opens the rest. */
export const SHOWN = 3;
/** The most a challenge keeps. */
export const MAX_KEPT = 5;

export const LIMITS = { text: 240, matters: 200, settle: 200, quote: 220, why: 240, weakest: 200, label: 120 } as const;

// ── reading one back ───────────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const REF = /^[A-Za-z0-9_.:-]{1,80}$/;
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(999, Math.floor(v))) : 0);

function cleanAnchor(a: unknown): Anchor | null {
  if (!a || typeof a !== 'object') return null;
  const r = a as Record<string, unknown>;
  const from = ANCHOR_FROM.includes(r.from as AnchorFrom) ? (r.from as AnchorFrom) : null;
  const ref = typeof r.ref === 'string' && REF.test(r.ref) ? r.ref : '';
  const quote = str(r.quote, LIMITS.quote);
  if (!from || !ref || !quote) return null;
  const doc = typeof r.doc === 'string' && REF.test(r.doc) ? r.doc : '';
  const block = typeof r.block === 'string' && REF.test(r.block) ? r.block : '';
  return { from, ref, quote, ...(doc ? { doc } : {}), ...(block ? { block } : {}) };
}

function cleanFinding(f: unknown, i: number): Finding | null {
  if (!f || typeof f !== 'object') return null;
  const r = f as Record<string, unknown>;
  const kind = FINDING_KINDS.includes(r.kind as FindingKind) ? (r.kind as FindingKind) : null;
  const text = str(r.text, LIMITS.text);
  const anchors = (Array.isArray(r.anchors) ? r.anchors : []).map(cleanAnchor).filter((a): a is Anchor => !!a).slice(0, 3);
  if (!kind || !text || !anchors.length) return null;
  const id = typeof r.id === 'string' && /^f\d{1,2}$/.test(r.id) ? r.id : `f${i + 1}`;
  const confidence = CONFIDENCES.includes(r.confidence as Confidence) ? (r.confidence as Confidence) : 'medium';
  const matters = str(r.matters, LIMITS.matters);
  const settle = str(r.settle, LIMITS.settle);
  const target = typeof r.target === 'string' && REF.test(r.target) ? r.target : '';
  return {
    id,
    kind,
    text,
    anchors,
    ...(matters ? { matters } : {}),
    ...(settle ? { settle } : {}),
    confidence,
    ...(target ? { target } : {}),
    ...(r.question === true ? { question: true } : {}),
    by: r.by === 'structure' ? 'structure' : 'model',
  };
}

/** A challenge from storage or the wire, trusted for nothing; undefined when it is not one. */
export function sanitizeChallenge(raw: unknown): Challenge | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^ch_[A-Za-z0-9]{1,24}$/.test(r.id) ? r.id : '';
  const at = typeof r.at === 'number' && Number.isFinite(r.at) && r.at > 0 ? r.at : 0;
  if (!id || !at) return undefined;
  const sc = (r.scope && typeof r.scope === 'object' ? r.scope : {}) as Record<string, unknown>;
  const kind = CHALLENGE_SCOPES.includes(sc.kind as ChallengeScopeKind) ? (sc.kind as ChallengeScopeKind) : 'line';
  const ids = (Array.isArray(sc.ids) ? sc.ids : []).filter((x): x is string => typeof x === 'string' && REF.test(x)).slice(0, 40);
  const doc = typeof sc.doc === 'string' && REF.test(sc.doc) ? sc.doc : '';
  const seen = new Set<string>();
  const findings = (Array.isArray(r.findings) ? r.findings : [])
    .map(cleanFinding)
    .filter((f): f is Finding => !!f && !seen.has(f.id) && !!seen.add(f.id))
    .slice(0, MAX_KEPT);
  const ck = (r.checked && typeof r.checked === 'object' ? r.checked : {}) as Record<string, unknown>;
  const why = str(r.why, LIMITS.why);
  const weakest = str(r.weakest, LIMITS.weakest);
  const g = r.guess && typeof r.guess === 'object' ? (r.guess as Record<string, unknown>) : null;
  const guessLabel = g ? str(g.label, LIMITS.label) : '';
  const taken: Record<string, FindingState> = {};
  if (r.taken && typeof r.taken === 'object') {
    for (const [k, v] of Object.entries(r.taken as Record<string, unknown>)) {
      if (/^f\d{1,2}$/.test(k) && FINDING_STATES.includes(v as FindingState)) taken[k] = v as FindingState;
    }
  }
  return {
    id,
    at,
    scope: { kind, ...(ids.length ? { ids } : {}), ...(doc ? { doc } : {}) },
    findings,
    holds: findings.length === 0,
    ...(why && !findings.length ? { why } : {}),
    ...(weakest && !findings.length ? { weakest } : {}),
    checked: { turns: count(ck.turns), ideas: count(ck.ideas), files: count(ck.files), earlier: count(ck.earlier) },
    ...(r.structural === true ? { structural: true } : {}),
    ...(guessLabel ? { guess: { label: guessLabel, ...(typeof g!.id === 'string' && REF.test(g!.id) ? { id: g!.id } : {}), ...(typeof g!.hit === 'boolean' ? { hit: g!.hit } : {}) } } : {}),
    ...(Object.keys(taken).length ? { taken } : {}),
  };
}

/** What became of a finding: what the person did with it, or open. */
export const stateOf = (c: Challenge, findingId: string): FindingState => c.taken?.[findingId] ?? 'open';

// ── the words it leaves in the conversation ──────────────────────────────────────────────────────────────────

/** The first line every challenge's words begin with — how a later turn, and a search, knows one for what it is. */
export const CHALLENGE_MARK = 'Worth checking';

/**
 * A challenge as text: what the conversation carries for it, what the next reply reads in the history, what the
 * search index holds. Short, and the findings in order — never the quotes twice.
 */
export function challengeText(c: Challenge): string {
  if (!c.findings.length) {
    return [`${CHALLENGE_MARK}: this holds up on what's here.`, c.why, c.weakest ? `The weakest point, and it is minor: ${c.weakest}` : '']
      .filter(Boolean)
      .join(' ');
  }
  const lines = c.findings.map((f, i) => `${i + 1}. ${KIND_LABEL[f.kind]}: ${f.text}`);
  return `${CHALLENGE_MARK}:\n${lines.join('\n')}`;
}

export const isChallengeText = (s: string) => typeof s === 'string' && s.startsWith(`${CHALLENGE_MARK}:`);

/** Plain words for what was checked: "this conversation · 14 ideas · 2 files". */
export function checkedLine(c: Challenge): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [
    'this conversation',
    c.checked.ideas ? n(c.checked.ideas, 'idea', 'ideas') : '',
    c.checked.files ? n(c.checked.files, 'file', 'files') : '',
    c.checked.earlier ? n(c.checked.earlier, 'earlier conversation', 'earlier conversations') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── a finding, kept on the map ─────────────────────────────────────────────────────────────────────────────────

/** The card a kept finding becomes, and how it joins the card it is about. */
const AS_CARD: Readonly<Record<FindingKind, { type: LogosNode['type']; rel: LogosRelation; fromTarget: boolean }>> = {
  // the target rests on the assumption
  assumption: { type: 'assumption', rel: 'depends', fromTarget: true },
  gap: { type: 'tension', rel: 'conflicts', fromTarget: false },
  unsupported: { type: 'question', rel: 'applies_to', fromTarget: false },
  contradiction: { type: 'tension', rel: 'conflicts', fromTarget: false },
  evidence: { type: 'question', rel: 'applies_to', fromTarget: false },
  // the target leads to the risk, or to the consequence
  risk: { type: 'consequence', rel: 'leads_to', fromTarget: true },
  alternative: { type: 'counterpoint', rel: 'conflicts', fromTarget: false },
  consequence: { type: 'consequence', rel: 'leads_to', fromTarget: true },
};

export interface NodeFinding {
  kind: FindingKind;
  /** the challenge it came from */
  from: string;
  /** the first quote it rested on */
  quote?: string;
}

/** The card for a kept finding: its type, its words, and the line to the card it is about (when that is on the map). */
export function findingCard(f: Finding, challengeId: string, map: Pick<ThinkingMap, 'nodes'>): {
  node: { label: string; type: LogosNode['type']; origin: 'socria'; detail?: string; finding: NodeFinding };
  near?: string;
  rel?: LogosRelation;
  fromNear?: boolean;
} {
  const shape = AS_CARD[f.kind];
  // cut where the map cuts a card's words (lib/logos.ts), so the card kept is the card found again
  const label = f.text.length > MAP_LABEL_MAX ? `${f.text.slice(0, MAP_LABEL_MAX - 1).trimEnd()}…` : f.text;
  const detail = [f.matters ? `If it's wrong: ${f.matters}` : '', f.settle ? `To settle it: ${f.settle}` : ''].filter(Boolean).join(' ');
  const target = f.target && map.nodes.some((n) => n.id === f.target) ? f.target : undefined;
  return {
    node: {
      label,
      type: shape.type,
      origin: 'socria',
      ...(detail ? { detail } : {}),
      finding: { kind: f.kind, from: challengeId, ...(f.anchors[0]?.quote ? { quote: f.anchors[0].quote } : {}) },
    },
    ...(target ? { near: target, rel: shape.rel, fromNear: shape.fromTarget } : {}),
  };
}

// ── the considered set ─────────────────────────────────────────────────────────────────────────────────────────

/** A sentence of theirs that raises a consideration of their own — an objection, a risk, a caveat, an alternative. */
const CONSIDERING =
  /\b(?:i know|i'?m aware|admittedly|granted|although|though|the (?:risk|downside|catch|problem|worry|concern|objection|counter-?argument|limitation) (?:is|here)|one (?:risk|concern|worry|objection|limitation|caveat)|on the other hand|unless|assuming|i'?ve (?:considered|thought about|checked)|i (?:considered|checked|accounted for)|might be wrong|could be wrong|counter-?point|alternatively|the other (?:side|explanation|view))\b/i;

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

/**
 * What this line has already covered, for the novelty check: every finding raised in it before (whatever became
 * of it), every finding card on the map, and the person's own sentences that raise a consideration themselves.
 * Their claims are NOT in it — a finding is meant to quote those.
 */
export function consideredIn(
  messages: readonly { role: string; content: string; challenge?: Challenge }[],
  map: Pick<ThinkingMap, 'nodes'>
): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (m.challenge) for (const f of m.challenge.findings) out.push(f.text);
    else if (m.role === 'user') for (const s of sentences(m.content)) if (CONSIDERING.test(s)) out.push(s.slice(0, 300));
  }
  for (const n of map.nodes) if ((n as LogosNode & { finding?: unknown }).finding) out.push(n.label);
  return out.slice(-80);
}

/** A new id for a challenge. */
export const challengeId = (at: number, salt = Math.random().toString(36).slice(2, 6)) => `ch_${at.toString(36)}${salt.replace(/[^a-z0-9]/gi, '').slice(0, 6)}`;

// ── when the chip is offered ───────────────────────────────────────────────────────────────────────────────────

const REASONING = new Set(['claim', 'assumption', 'belief', 'decision', 'evidence', 'value', 'goal', 'consequence', 'constraint']);

/**
 * Whether this line has something to test, so the "What am I missing?" chip may be offered: two or more of the
 * person's own claims or assumptions, a decision with two options, or a draft's worth of their words — and no
 * challenge in it yet (once used, the chip has done its job; words and the card's menu are always there).
 */
export function challengeReady(
  messages: readonly { role: string; content: string; challenge?: unknown }[],
  map: Pick<ThinkingMap, 'nodes'>
): boolean {
  if (messages.some((m) => m.challenge)) return false;
  const theirs = messages.filter((m) => m.role === 'user');
  if (theirs.length < 2) return false;
  const own = map.nodes.filter((n) => n.origin !== 'drawn' && n.origin !== 'source' && n.origin !== 'computed' && !(n as { finding?: unknown }).finding);
  const claims = own.filter((n) => n.type === 'claim' || n.type === 'assumption' || n.role === 'claim').length;
  const options = own.filter((n) => n.role === 'option' || n.role === 'alternative' || n.type === 'decision').length;
  const reasoning = own.filter((n) => REASONING.has(n.type)).length;
  const words = theirs.reduce((s, m) => s + m.content.split(/\s+/).filter(Boolean).length, 0);
  return claims >= 2 || options >= 2 || (reasoning >= 3 && words >= 60) || words >= 220;
}
