// lib/objects/reasoning.ts — the shared vocabulary of human reasoning the experiences are built from.
//
// Crossroads, Untangle, Common Ground and the Time Machine are four ways of
// working with ONE kind of material: what a person
// thinks — their thoughts and questions, beliefs and assumptions, evidence,
// alternatives, priorities, trade-offs, uncertainties, decisions,
// commitments and reflections — and how it changes. Each experience is an
// object of thought (lib/objects/core.ts), so each is persisted, synced,
// undone and replayed like every other; this file is what they share.
//
// THE RULE THAT MATTERS MOST: where something came from is never lost.
// Every element carries who put it there (`by`) and on what footing
// (`basis`). What the person stated is never confused with what Socria
// suggested, a relationship Socria inferred, a scenario Socria imagined,
// evidence with a source, or a number the workspace computed — and a basis
// is recorded, not claimed: Socria cannot mark its own words as the
// person's, or as evidence.
//
// Elements in different experiences are joined by explicit links (an
// Untangle thought that became a Crossroads decision; a look back started
// from that decision), resolved live where they are drawn — never by copying
// one experience's content into another.
//
// PURE.

import type { OpDef } from './core';
import { cleanBy, cleanId, cleanText, op, type By } from './display-base';

/** The schema version every experience state carries, so a later change can read an earlier state. */
export const REASONING_VERSION = 1;

/** On what footing an element stands. */
export type Basis =
  /** the person said or wrote it */
  | 'stated'
  /** Socria offered it — a possibility to consider, not a fact */
  | 'suggested'
  /** Socria read it from the conversation (a category, a connection) — the person can correct it */
  | 'inferred'
  /** a simulated reply or a hypothetical scenario — a possibility, never a prediction */
  | 'simulated'
  /** something with a source the person gave */
  | 'evidence'
  /** worked out by the workspace from the person's own inputs */
  | 'computed';

export const BASES: readonly Basis[] = ['stated', 'suggested', 'inferred', 'simulated', 'evidence', 'computed'];

export const BASIS_WORD: Record<Basis, string> = {
  stated: 'yours',
  suggested: 'suggested by Socria',
  inferred: 'Socria’s reading — check it',
  simulated: 'simulated — a possibility, not a prediction',
  evidence: 'with a source',
  computed: 'computed from your inputs',
};

/**
 * A basis as it may be recorded. The person's own words are 'stated' (or
 * 'evidence' with a source); Socria's are 'suggested', 'inferred' or
 * 'simulated' — never 'stated', never 'evidence'. Nothing is stored as
 * 'computed': computed values are worked out where they are shown.
 */
export function cleanBasis(v: unknown, by: By, fallback?: Basis): Basis {
  const b = BASES.includes(v as Basis) ? (v as Basis) : (fallback ?? (by === 'person' ? 'stated' : 'suggested'));
  if (by === 'person') return b === 'evidence' ? 'evidence' : 'stated';
  if (b === 'stated' || b === 'evidence' || b === 'computed') return 'suggested';
  return b;
}

/** The kinds of element the experiences hold — each experience uses the ones it needs. */
export type ElementKind =
  | 'thought'
  | 'task'
  | 'idea'
  | 'problem'
  | 'question'
  | 'goal'
  | 'belief'
  | 'assumption'
  | 'evidence'
  | 'alternative'
  | 'priority'
  | 'tradeoff'
  | 'uncertainty'
  | 'decision'
  | 'commitment'
  | 'reflection'
  | 'outside';

export const ELEMENT_WORD: Record<ElementKind, string> = {
  thought: 'Thought',
  task: 'Task',
  idea: 'Idea',
  problem: 'Problem',
  question: 'Question',
  goal: 'Goal',
  belief: 'Belief',
  assumption: 'Assumption',
  evidence: 'Evidence',
  alternative: 'Option',
  priority: 'Priority',
  tradeoff: 'Trade-off',
  uncertainty: 'Uncertain',
  decision: 'Decision',
  commitment: 'Commitment',
  reflection: 'Reflection',
  outside: 'Outside my control',
};

/** An element as most experiences store one: what it says, whose it is, and on what footing. */
export interface Element {
  id: string;
  kind: ElementKind;
  text: string;
  by: By;
  basis: Basis;
  /** a source, for evidence: a link, a book, "my manager said" */
  source?: string;
}

/** A link from an experience to another object in the same workspace — the way experiences connect. */
export interface Link {
  /** the other object's id */
  obj: string;
  /** a part of it (a thought, an option), when the link is to one */
  part?: string;
  /** how they relate: this one was started FROM that one; LED TO it; is ABOUT it; CONTINUES it */
  rel: 'from' | 'led_to' | 'about' | 'continues';
}

export const RELS: readonly Link['rel'][] = ['from', 'led_to', 'about', 'continues'];
export const REL_WORD: Record<Link['rel'], string> = { from: 'Started from', led_to: 'Led to', about: 'About', continues: 'Continues' };

/** A link as an operation carries it, checked: an object id in this workspace's form, a part, a relation. */
export function linkArgsOk(a: Record<string, string | number>): string | null {
  if (typeof a.obj !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(a.obj)) return 'Connect it to something in this workspace.';
  if (a.part !== undefined && a.part !== '' && !cleanId(a.part)) return 'There is no such part.';
  if (a.rel !== undefined && !RELS.includes(a.rel as Link['rel'])) return 'That is not a way two things relate here.';
  return null;
}

/** The link an operation describes. */
export function linkFrom(a: Record<string, string | number>): Link {
  const part = cleanId(a.part) ?? undefined;
  return { obj: String(a.obj), ...(part ? { part } : {}), rel: RELS.includes(a.rel as Link['rel']) ? (a.rel as Link['rel']) : 'about' };
}

export function cleanLinks(raw: unknown, max = 12): Link[] {
  const out: Link[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    if (out.length >= max) break;
    const o = x as Record<string, unknown> | null;
    const obj = typeof o?.obj === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(o.obj) ? o.obj : null;
    if (!obj) continue;
    const part = cleanId(o?.part) ?? undefined;
    const rel = RELS.includes(o?.rel as Link['rel']) ? (o!.rel as Link['rel']) : 'about';
    if (out.some((l) => l.obj === obj && l.part === part && l.rel === rel)) continue;
    out.push({ obj, ...(part ? { part } : {}), rel });
  }
  return out;
}

const sameLink = (a: Link, b: Link) => a.obj === b.obj && (a.part ?? '') === (b.part ?? '') && a.rel === b.rel;

/**
 * Connecting an experience to another object, and taking the connection away:
 * the person's to make — Socria may suggest a connection, never draw one.
 * Every experience state has `links` and shares these two operations.
 */
export function linkOps<S extends { links: Link[] }>(sanitize: (raw: unknown) => S | null): Record<'link' | 'unlink', OpDef<S>> {
  return {
    link: op<S>(
      'Connect',
      (s, a, ctx) =>
        linkArgsOk(a) ??
        (s.links.some((l) => sameLink(l, linkFrom(a))) ? 'They are already connected.' : null) ??
        (s.links.length >= 12 ? 'It is connected to as much as it can hold.' : null) ??
        (ctx?.by === 'socria' ? 'What it is connected to is yours to say — Socria can suggest it.' : null),
      (s, a) => sanitize({ ...s, links: [...s.links, linkFrom(a)] }) ?? s,
      (a) => `${REL_WORD[linkFrom(a).rel].toLowerCase()} ${String(a.obj)}`
    ),
    unlink: op<S>(
      'Disconnect',
      (s, a, ctx) => linkArgsOk(a) ?? (s.links.some((l) => sameLink(l, linkFrom(a))) ? null : 'They are not connected.') ?? (ctx?.by === 'socria' ? 'Only you disconnect it.' : null),
      (s, a) => sanitize({ ...s, links: s.links.filter((l) => !sameLink(l, linkFrom(a))) }) ?? s,
      (a) => `disconnected from ${String(a.obj)}`
    ),
  };
}

/** An element read from raw input: text required, kind from the allowed list, provenance recorded. */
export function cleanElement(raw: unknown, opts: { kinds: readonly ElementKind[]; fallbackKind: ElementKind; max: number; taken: Set<string>; prefix: string }): Element | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = cleanText(o.text ?? o.label, opts.max);
  if (!text) return null;
  let id = cleanId(o.id);
  if (!id || opts.taken.has(id)) {
    let n = opts.taken.size + 1;
    while (opts.taken.has(`${opts.prefix}${n}`)) n++;
    id = `${opts.prefix}${n}`;
  }
  opts.taken.add(id);
  const kind = opts.kinds.includes(o.kind as ElementKind) ? (o.kind as ElementKind) : opts.fallbackKind;
  const by = cleanBy(o.by);
  const source = cleanText(o.source, 160) || undefined;
  const basis = cleanBasis(o.basis, by, by === 'person' && source ? 'evidence' : undefined);
  return { id, kind, text, by, basis, ...(source ? { source } : {}) };
}

/** Words that carry meaning, for the overlap measures the experiences compute (never for judging a person). */
const STOP = new Set(
  'a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its just me my of on or our she so than that the their them then there these they this to too up us was we were what when where which who why will with would you your yours i’m im don’t dont it’s its i’d id'.split(' ')
);
export function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[’']/g, '')
      .split(/[^a-z0-9$%]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

/** How much of `b`'s meaning-bearing words appear in `a`, 0..1. */
export function overlap(a: string, b: string): number {
  const A = contentWords(a);
  const B = contentWords(b);
  if (!B.size) return 0;
  let n = 0;
  for (const w of B) if (A.has(w)) n++;
  return n / B.size;
}
