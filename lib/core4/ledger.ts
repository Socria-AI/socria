// lib/core4/ledger.ts
//
// The Reasoning Ledger: the structure and evolution of a person's THINKING.
//
// Different from memory. Memory (the Mind Graph) holds what Socria
// understands about the person — who they work with, what they are building,
// what they prefer. The ledger holds the moves of their reasoning: the claims
// they make, the objections they anticipate, the alternatives they name and
// reject (and why), the questions they have already asked themselves, the
// decisions they reach, and what Socria contributed — each attributed, each
// with a status, each correctable.
//
// ATTRIBUTION IS ENFORCED IN CODE (Cognitive Design Council #1, D10):
//   - An entry is the PERSON's only if the verbatim quote it rests on is
//     actually in their message. A paraphrase with strong overlap and no
//     negation mismatch is kept as 'paraphrased'; anything else is recorded
//     with owner 'unknown' — it can suppress repetition, but it is never said
//     back to them as theirs.
//   - What Socria contributes is recorded as Socria's, from the text that was
//     actually sent. Adoption never rewrites ownership: if they take up
//     Socria's idea, a NEW user entry is made from their own words and linked
//     derived_from the Socria entry.
//   - Stance defaults to 'entertains': raising an idea is not holding it.
//
// The already-considered record (considered.ts) is a VIEW over this ledger.
// The shape is deliberately a plain graph (entries + links) so Logos can
// render and edit the same substrate later (toLogosGraph).
//
// Pure.

import type { ConsideredNow } from '../cognition/state';
import type { Basis, InterventionType, LedgerEntry, LedgerKind, LedgerLink, Owner, Stance } from './types';
import { conceptTerms, similarity } from './considered';
import { interrogatives, sentencesOf } from './questions';

const MAX_TEXT = 280;

/**
 * Before anything reaches the ledger (council D10): emails, phone numbers,
 * URLs with query strings and long digit runs are replaced. The ledger is
 * about the shape of their reasoning, not their identifiers.
 */
export function scrubPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/https?:\/\/\S+\?\S+/g, '[link]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => (m.replace(/\D/g, '').length >= 9 ? '[number]' : m))
    .replace(/\b\d{6,}\b/g, '[number]');
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const NEGATION = /^(?:not|no|never|don't|doesn't|didn't|isn't|aren't|wasn't|can't|won't|without|shouldn't|wouldn't)$/;

/**
 * The concepts a text NEGATES: those within three words after a negation.
 * "launch in March, not April" negates April, not the launch — so a
 * paraphrase "launch in March" agrees with it, and "should not launch in
 * March" does not.
 */
function negatedConcepts(text: string): Set<string> {
  const out = new Set<string>();
  // Within the clause: "not April, because…" negates April only.
  for (const clause of text.split(/[,;:.!?()\u2014\u2013]+/)) {
    const words = norm(clause).split(' ');
    words.forEach((w, i) => {
      if (!NEGATION.test(w)) return;
      for (const t of conceptTerms(words.slice(i + 1, i + 4).join(' '))) out.add(t);
    });
  }
  return out;
}

/** Do two texts agree on which of their SHARED concepts are negated? */
function samePolarity(a: string, b: string): boolean {
  const A = conceptTerms(a);
  const B = conceptTerms(b);
  const shared = new Set([...A].filter((t) => B.has(t)));
  const na = [...negatedConcepts(a)].filter((t) => shared.has(t)).sort().join(' ');
  const nb = [...negatedConcepts(b)].filter((t) => shared.has(t)).sort().join(' ');
  return na === nb;
}

/**
 * How firmly an item is grounded in what the person actually wrote.
 *   quoted      the quote appears verbatim (normalised) in their message
 *   paraphrased the text overlaps their message strongly and does not flip a negation
 *   inferred    neither — it is Socria's reading, not their words
 */
export function grounding(item: { text: string; quote: string }, userText: string): Basis {
  const msg = norm(userText);
  const q = norm(item.quote);
  if (q.length >= 8 && msg.includes(q)) return 'quoted';
  // Paraphrase: the best-matching sentence of theirs shares most of the item's
  // concepts and agrees on negation.
  let best = 0;
  let bestSentence = '';
  for (const s of sentencesOf(userText)) {
    const sc = similarity(item.text, s);
    if (sc > best) {
      best = sc;
      bestSentence = s;
    }
  }
  if (best >= 0.5 && samePolarity(item.text, bestSentence)) return 'paraphrased';
  return 'inferred';
}

let seq = 0;
export function ledgerId(prefix: string, now: number): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}_${now.toString(36)}_${seq.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export interface TurnContext {
  conversationId: string;
  projectId: string | null;
  turn: number;
  now: number;
}

/** Entries from what the person raised this turn — owner decided by grounding, not by the reader's say-so. */
/**
 * Is this item an echo of what SOCRIA just said (council D10)? Then taking it
 * up is accepting Socria's idea — it is never recorded or shown as theirs.
 */
export function echoesSocria(item: { text: string; quote: string }, socriaText: string): boolean {
  if (!socriaText.trim()) return false;
  return sentencesOf(socriaText).some((s) => similarity(item.quote || item.text, s) >= 0.6 || similarity(item.text, s) >= 0.6);
}

export function entriesFromPerson(items: ConsideredNow[], userText: string, ctx: TurnContext, socriaBefore = ''): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const it of items) {
    const echo = echoesSocria(it, socriaBefore);
    const basis = echo ? 'inferred' : grounding(it, userText);
    const owner: Owner = basis === 'inferred' ? 'unknown' : 'user';
    out.push({
      id: ledgerId('le', ctx.now),
      kind: it.kind,
      text: scrubPII(it.text).slice(0, MAX_TEXT),
      owner,
      // An ungrounded item cannot carry a stance it never showed.
      stance: owner === 'user' ? it.stance : 'entertains',
      basis,
      quote: basis === 'quoted' ? scrubPII(it.quote).slice(0, 200) : '',
      reason: scrubPII(it.reason).slice(0, 200),
      status: it.stance === 'rejects' ? 'rejected' : it.stance === 'resolved' ? 'resolved' : 'active',
      confidence: basis === 'quoted' ? 0.9 : basis === 'paraphrased' ? 0.7 : 0.4,
      conversationId: ctx.conversationId,
      projectId: ctx.projectId,
      turn: ctx.turn,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      revisions: [{ at: ctx.now, by: 'system', change: 'created' }],
    });
  }
  return out;
}

const SOCRIA_KIND: Partial<Record<InterventionType, LedgerKind>> = {
  CHALLENGE: 'objection',
  CRITIQUE: 'objection',
  CONTRIBUTE: 'claim',
  CONNECT: 'claim',
  SYNTHESIZE: 'conclusion',
  QUESTION: 'question',
  CLARIFY: 'question',
};

/**
 * What Socria actually said that the person might otherwise hear again: its
 * questions, challenges and contributions — recorded as SOCRIA's, from the
 * text that was sent.
 */
export function entriesFromSocria(sent: string, type: InterventionType, ctx: TurnContext): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const add = (kind: LedgerKind, text: string) =>
    out.push({
      id: ledgerId('ls', ctx.now),
      kind,
      text: scrubPII(text.trim()).slice(0, MAX_TEXT),
      owner: 'socria',
      stance: kind === 'question' ? 'asks' : 'asserts',
      basis: 'quoted',
      quote: scrubPII(text.trim()).slice(0, 200),
      reason: '',
      status: 'active',
      confidence: 0.9,
      conversationId: ctx.conversationId,
      projectId: ctx.projectId,
      turn: ctx.turn,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      revisions: [{ at: ctx.now, by: 'system', change: 'created' }],
    });
  const q = interrogatives(sent);
  for (const s of [...q.explicit, ...q.disguised].slice(0, 2)) add('question', s);
  const kind = SOCRIA_KIND[type];
  if (kind && kind !== 'question') {
    const first = sentencesOf(sent).map((s) => s.trim()).find((s) => s.split(/\s+/).length >= 5 && !/\?\s*$/.test(s));
    if (first) add(kind, first);
  }
  return out;
}

/**
 * Merge new entries into the ledger: a new entry that says the same thing as
 * an existing ACTIVE one of the same owner reinforces it instead of
 * duplicating it (updatedAt moves, confidence rises a little).
 */
export function mergeEntries(existing: LedgerEntry[], incoming: LedgerEntry[], now: number): { entries: LedgerEntry[]; created: LedgerEntry[]; touched: LedgerEntry[] } {
  const entries = [...existing];
  const created: LedgerEntry[] = [];
  const touched: LedgerEntry[] = [];
  for (const e of incoming) {
    const twin = entries.find(
      (x) => x.owner === e.owner && x.status !== 'retracted' && x.kind === e.kind && similarity(x.text, e.text) >= 0.8 && samePolarity(x.text, e.text)
    );
    if (twin) {
      // The same position restated: their latest wording is the one they hold.
      if (e.owner === 'user' && e.basis !== 'inferred' && e.text !== twin.text) {
        twin.revisions.push({ at: now, by: 'user', change: 'text', from: twin.text.slice(0, 200), to: e.text.slice(0, 200) });
        twin.text = e.text;
        if (e.quote) twin.quote = e.quote;
      }
      twin.updatedAt = now;
      twin.confidence = Math.min(0.95, twin.confidence + 0.05);
      if (e.stance !== twin.stance && e.owner === 'user' && e.basis !== 'inferred') {
        twin.revisions.push({ at: now, by: 'user', change: 'status', from: twin.stance, to: e.stance, reason: e.reason || undefined });
        twin.stance = e.stance;
        if (e.stance === 'rejects') twin.status = 'rejected';
      }
      touched.push(twin);
    } else {
      entries.push(e);
      created.push(e);
    }
  }
  return { entries, created, touched };
}

/**
 * "That's not what I meant." The person's entries from the turn being
 * corrected are marked DISPUTED — kept (the correction itself is history),
 * never again rendered as theirs until they restate them.
 */
export function disputeTurn(entries: LedgerEntry[], conversationId: string, turn: number, now: number, note: string): LedgerEntry[] {
  const changed: LedgerEntry[] = [];
  for (const e of entries) {
    if (e.conversationId === conversationId && e.turn === turn && e.owner === 'user' && e.status !== 'disputed') {
      e.revisions.push({ at: now, by: 'user', change: 'corrected', from: e.status, to: 'disputed', reason: note.slice(0, 200) });
      e.status = 'disputed';
      e.updatedAt = now;
      changed.push(e);
    }
  }
  return changed;
}

/**
 * A position they restate replaces the one they held before (run 4,
 * learning-012: after a student rewrote "the deflator includes imports" as
 * "…but not imports", the move block still said they HELD the old version).
 * Their earlier positions in this conversation that something they said this
 * turn restates on the same point (similar, but not the same wording, or of
 * opposite polarity) are marked SUPERSEDED, kept as history, and no longer
 * shown as held. A restatement that echoes Socria's correction counts: the
 * old version is still no longer theirs.
 */
const POSITIONS = new Set<LedgerKind>(['claim', 'assumption', 'hypothesis', 'decision', 'conclusion']);
export function supersedeRestated(
  entries: LedgerEntry[],
  now: readonly { kind: LedgerKind; text: string }[],
  conversationId: string,
  turn: number,
  at: number
): LedgerEntry[] {
  const changed: LedgerEntry[] = [];
  const fresh = now.filter((n) => POSITIONS.has(n.kind));
  if (!fresh.length) return changed;
  for (const e of entries) {
    if (e.owner !== 'user' || e.conversationId !== conversationId || e.turn >= turn || e.status !== 'active' || !POSITIONS.has(e.kind)) continue;
    const by = fresh.find((n) => {
      const sim = similarity(e.text, n.text);
      return sim >= 0.5 && (sim < 0.8 || !samePolarity(e.text, n.text));
    });
    if (!by) continue;
    e.revisions.push({ at, by: 'user', change: 'status', from: 'active', to: 'superseded', reason: `restated: ${by.text}`.slice(0, 200) });
    e.status = 'superseded';
    e.updatedAt = at;
    changed.push(e);
  }
  return changed;
}

/** Links for this turn: what the person's entries responded to, and adoption of Socria's ideas. */
export function linksForTurn(created: LedgerEntry[], previousSocria: LedgerEntry[], now: number): LedgerLink[] {
  const links: LedgerLink[] = [];
  const mine = created.filter((e) => e.owner === 'user');
  for (const e of mine) {
    const best = previousSocria
      .map((s) => ({ s, sc: similarity(e.text, s.text) }))
      .sort((a, b) => b.sc - a.sc)[0];
    if (!best || best.sc < 0.3) continue;
    const adopted = best.sc >= 0.55 && (e.stance === 'asserts' || e.stance === 'accepts');
    links.push({
      id: ledgerId('ll', now),
      from: e.id,
      to: best.s.id,
      rel: adopted ? 'derived_from' : e.stance === 'rejects' ? 'rejected_because' : 'responds_to',
      owner: 'user',
      reason: e.reason,
      createdAt: now,
    });
  }
  return links;
}

const STANCE_WORD: Record<Stance, string> = {
  asserts: 'hold',
  entertains: 'raised the possibility',
  asks: 'asked',
  rejects: 'ruled out',
  accepts: 'accepted',
  resolved: 'settled',
};

/**
 * The already-considered VIEW: what the person has covered (and what Socria
 * already said), most relevant first, rendered compactly with stance so the
 * generator and the novelty gate can tell "raised" from "ruled out".
 */
export function consideredView(
  entries: LedgerEntry[],
  opts: { focus: string; conversationId: string; projectId: string | null; limit?: number }
): { lines: string[]; items: string[]; gate: string[] } {
  // Private entries (a sensitive or conversation-only conversation) are
  // never shown outside their own conversation (council D14/D15).
  const live = entries.filter((e) => e.status !== 'retracted' && e.status !== 'disputed' && e.status !== 'superseded' && (!e.private || e.conversationId === opts.conversationId));
  const scored = live
    .map((e) => {
      const here = e.conversationId === opts.conversationId ? 0.5 : 0;
      const proj = opts.projectId && e.projectId === opts.projectId ? 0.25 : 0;
      const rel = opts.focus ? similarity(e.text, opts.focus) : 0;
      return { e, score: here + proj + rel + (e.owner === 'user' ? 0.2 : 0) };
    })
    .filter((x) => x.score >= 0.25 || x.e.conversationId === opts.conversationId)
    .sort((a, b) => b.score - a.score || b.e.updatedAt - a.e.updatedAt)
    .slice(0, opts.limit ?? 16);
  const lines = scored.map(({ e }) => {
    const who = e.owner === 'user' ? `they ${STANCE_WORD[e.stance]}` : e.owner === 'socria' ? 'Socria already said' : 'already on the table';
    const why = e.reason ? ` (because: ${e.reason})` : '';
    return `${who}: ${e.text}${why}`;
  });
  return {
    lines,
    items: scored.map(({ e }) => e.text),
    gate: scored.filter(({ e }) => raisable(e.kind, e.owner)).map(({ e }) => e.text),
  };
}

/**
 * What the novelty gate may delete a sentence for repeating: things that
 * can be RAISED — objections, alternatives, questions, assumptions,
 * hypotheses, uncertainties (theirs, or Socria's own objections and
 * questions). A claim, a piece of evidence or a decision they hold is
 * context: a reply that USES "$40M is pledged to buses" to compute
 * something is not re-raising it, and the pilot showed a gate that treated
 * it so deleting the most valuable sentence of the reply
 * (docs/CORE-4-EVALS.md, pilot finding 2).
 */
const RAISABLE = new Set<LedgerKind>(['objection', 'alternative', 'question', 'assumption', 'hypothesis', 'uncertainty']);
export function raisable(kind: LedgerKind, owner: Owner): boolean {
  if (owner === 'socria') return kind === 'objection' || kind === 'question';
  return RAISABLE.has(kind);
}

/** The same substrate as Logos would render it: nodes and edges, attribution intact. */
export function toLogosGraph(entries: LedgerEntry[], links: LedgerLink[]) {
  return {
    nodes: entries.map((e) => ({
      id: e.id,
      type: e.kind,
      label: e.text.length > 60 ? e.text.slice(0, 57) + '…' : e.text,
      content: e.text,
      owner: e.owner,
      stance: e.stance,
      status: e.status,
      confidence: e.confidence,
    })),
    edges: links.map((l) => ({ id: l.id, from: l.from, to: l.to, type: l.rel, owner: l.owner, note: l.reason })),
  };
}
