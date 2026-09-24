// lib/core4/problem.ts
//
// The problem, as a structure — not the person.
//
// WHAT WAS MISSING, AND WHY IT COST SOMETHING. Core 4 modelled the PERSON in
// detail (learning goal, expertise, directness, stuck, authorship) and the
// problem as loose strings: `positions`, `assumptions`, `tensions`,
// `constraints`, all flat text rebuilt by a cheap model every turn. With that
// representation you can decide HOW to help — and you cannot notice that a
// decision rests on an assumption nobody has evidence for, because "rests on"
// is not something a list of strings can express.
//
// That is the measured weakness. Across six eval runs Core 4 reached parity
// on control (it stopped asking bad questions, stopped leaking withheld
// answers) and never got past parity on CONTRIBUTION — the judges' phrase for
// the losses was "the baseline contributed more non-obvious material". You
// cannot detect a missing variable without modelling the variables.
//
// WHY THIS IS NOT A THIRD DATABASE. The Reasoning Ledger already stores
// exactly these artifacts — claim, assumption, evidence, alternative,
// objection, decision, uncertainty, constraint, option — each with an owner,
// a quote, a stance and a lifecycle. And `LEDGER_RELATIONS` already names
// supports / contradicts / depends_on / assumes / resolves / reopens.
//
// None of those relations was ever written. `linksForTurn` produces exactly
// three: derived_from, rejected_because, responds_to. So the schema could
// already say "this decision depends on that assumption" and nothing in the
// system ever said it, which is why nothing could ever read it.
//
// So a ProblemModel here is a VIEW over the ledger, not a store: same
// sentences, one place, read as a structure instead of a list. What it adds
// is an epistemic reading (what KIND of knowledge each item is) and the
// dependency edges, which the reader now emits and `problemLinks` resolves.
//
//   Reasoning Ledger   every reasoning artifact over time, with attribution
//   ProblemModel       that same set, right now, as a connected structure
//   Mind Graph         relationships across projects, conversations and years
//   CognitiveState     the person: what they want, know, and asked for

import type { LedgerEntry, LedgerKind, LedgerLink, LedgerRelation, Owner } from './types';
import type { CognitiveState } from '../cognition/state';

/**
 * What KIND of knowledge an item is — orthogonal to the ledger's `status`,
 * which records what happened to it socially (active, superseded, disputed).
 * A claim can be active and still be a guess; those are different facts about
 * it and only one of them tells you whether to go and check.
 */
export const EPISTEMIC = [
  'known',
  'user_stated',
  'externally_supported',
  'inferred',
  'assumed',
  'disputed',
  'needs_verification',
  'unknown',
] as const;
export type Epistemic = (typeof EPISTEMIC)[number];

export interface ProblemItem {
  id: string;
  kind: LedgerKind;
  text: string;
  owner: Owner;
  epistemic: Epistemic;
  /** their words, when it rests on them */
  quote: string;
  /**
   * How the entry got here — 'quoted' means their own words support it.
   *
   * Exposed because the measuring stages need it: they assert things back at
   * the person about their own reasoning, and nothing should be asserted that
   * way unless the person actually said it. `epistemicOf` reads basis already;
   * it just never surfaced.
   */
  basis: LedgerEntry['basis'];
  turn: number;
  /** resolved, rejected or superseded: still history, no longer live */
  settled: boolean;
  /** ids this item supports / is supported by / rests on / conflicts with */
  supports: string[];
  supportedBy: string[];
  dependsOn: string[];
  dependedOnBy: string[];
  contradicts: string[];
}

export interface ProblemModel {
  goal: string;
  focus: string;
  items: ProblemItem[];
  /** live items only, indexed by kind — what every detector reads */
  live: ProblemItem[];
  /** the one thing genuinely blocking progress, when the state named one */
  bottleneck: string;
  turn: number;
}

const SETTLED = new Set(['resolved', 'rejected', 'superseded', 'retracted', 'disputed']);

/**
 * What kind of knowledge this is, from what the ledger already records.
 *
 * Derived rather than stored: every input is a column that exists, so this
 * needs no migration and cannot drift out of step with the entry it describes.
 * Order matters — disputed beats everything, because an item somebody has
 * challenged is not evidence for anything until that is settled.
 */
export function epistemicOf(e: LedgerEntry): Epistemic {
  if (e.status === 'disputed') return 'disputed';
  if (e.kind === 'uncertainty' || e.kind === 'question') return 'unknown';
  if (e.kind === 'assumption') return 'assumed';
  if (e.owner === 'external') return 'externally_supported';
  if (e.owner === 'user' && e.basis === 'quoted') return 'user_stated';
  if (e.basis === 'inferred' || e.owner === 'unknown') return 'inferred';
  // Socria's own claim, never checked against anything: the one case worth
  // acting on, because it is the system's own guess wearing a claim's clothes.
  if (e.owner === 'socria' && (e.kind === 'claim' || e.kind === 'conclusion')) return 'needs_verification';
  if (e.owner === 'user') return 'user_stated';
  return 'inferred';
}

/**
 * The problem as it stands: the live ledger, read as a connected structure.
 *
 * SCOPE IS PART OF CORRECTNESS, not a detail. The ledger loads recent entries
 * across the whole account, so an unscoped build makes a decision in one
 * conversation appear to rest on an assumption from an unrelated one — wrong,
 * and a leak of one piece of work into another. Caught by the end-to-end test
 * before it shipped: a brand-new conversation about Postgres was handed the
 * structure of a fundraising conversation.
 *
 * So: this conversation, plus the same Project when there is one, because a
 * Project is an explicit statement by the person that these are one body of
 * work. And never a private entry outside the conversation it was made in —
 * the same rule consideredView already applies (council D14/D15).
 */
export function buildProblem(
  entries: readonly LedgerEntry[],
  links: readonly LedgerLink[],
  state: Pick<CognitiveState, 'currentGoal' | 'currentFocus' | 'blockingUnknown' | 'turn'>,
  scope?: { conversationId: string; projectId: string | null }
): ProblemModel {
  const inScope = (e: LedgerEntry): boolean => {
    if (!scope) return true;
    const here = e.conversationId === scope.conversationId;
    if (e.private) return here;
    return here || (!!scope.projectId && e.projectId === scope.projectId);
  };
  const items = new Map<string, ProblemItem>();
  for (const e of entries) {
    if (e.status === 'retracted' || !inScope(e)) continue;
    items.set(e.id, {
      id: e.id,
      kind: e.kind,
      text: e.text,
      owner: e.owner,
      epistemic: epistemicOf(e),
      quote: e.quote ?? '',
      basis: e.basis,
      turn: e.turn,
      settled: SETTLED.has(e.status),
      supports: [],
      supportedBy: [],
      dependsOn: [],
      dependedOnBy: [],
      contradicts: [],
    });
  }
  const join = (rel: LedgerRelation, from: string, to: string) => {
    const a = items.get(from);
    const b = items.get(to);
    if (!a || !b || a === b) return;
    if (rel === 'supports') {
      if (!a.supports.includes(b.id)) a.supports.push(b.id);
      if (!b.supportedBy.includes(a.id)) b.supportedBy.push(a.id);
    } else if (rel === 'depends_on' || rel === 'assumes') {
      if (!a.dependsOn.includes(b.id)) a.dependsOn.push(b.id);
      if (!b.dependedOnBy.includes(a.id)) b.dependedOnBy.push(a.id);
    } else if (rel === 'contradicts') {
      if (!a.contradicts.includes(b.id)) a.contradicts.push(b.id);
      if (!b.contradicts.includes(a.id)) b.contradicts.push(a.id);
    }
  };
  for (const l of links) join(l.rel, l.from, l.to);

  const all = [...items.values()];
  return {
    goal: state.currentGoal ?? '',
    focus: state.currentFocus ?? '',
    items: all,
    live: all.filter((i) => !i.settled),
    bottleneck: state.blockingUnknown ?? '',
    turn: state.turn ?? 0,
  };
}

export const ofKind = (p: ProblemModel, ...kinds: LedgerKind[]): ProblemItem[] =>
  p.live.filter((i) => kinds.includes(i.kind));

/** Nothing anywhere supports it — not "unsupported by evidence", literally nothing. */
export const unsupported = (i: ProblemItem): boolean => i.supportedBy.length === 0;

/**
 * Where a conclusion actually rests: everything it depends on, transitively.
 *
 * The point of the whole structure. "Your Series A timing depends on the
 * churn number, and the churn number is an assumption nobody has checked" is
 * two hops, and two hops is exactly what a flat list of strings cannot hold.
 */
export function restsOn(p: ProblemModel, id: string, depth = 3): ProblemItem[] {
  const seen = new Set<string>([id]);
  const out: ProblemItem[] = [];
  let frontier = [id];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const cur of frontier) {
      const item = p.items.find((i) => i.id === cur);
      if (!item) continue;
      for (const dep of [...item.dependsOn, ...item.supportedBy]) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        const found = p.items.find((i) => i.id === dep);
        if (found) {
          out.push(found);
          next.push(dep);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * The part of the structure the state block cannot already say.
 *
 * Deliberately NOT a dump of the problem: the state block already lists
 * positions, assumptions, constraints and open threads as flat lines, and
 * printing them again would pay tokens twice for the same sentences. What no
 * flat list can express is what RESTS ON what, so that is all this renders —
 * and nothing at all when no edges exist, which is most early turns.
 */
export function renderProblem(p: ProblemModel): string {
  const withEdges = p.live.filter((i) => i.dependsOn.length || i.contradicts.length);
  if (!withEdges.length) return '';
  const text = (id: string) => p.items.find((i) => i.id === id)?.text ?? '';
  const lines: string[] = [];
  for (const i of withEdges.slice(0, 6)) {
    for (const d of i.dependsOn.slice(0, 2)) {
      const dep = p.items.find((x) => x.id === d);
      if (!dep) continue;
      const mark = dep.epistemic === 'assumed' ? ' — assumed' : dep.epistemic === 'needs_verification' ? ' — unchecked' : dep.settled ? ' — since dropped' : '';
      lines.push(`  - "${i.text}" rests on "${dep.text}"${mark}`);
    }
    for (const c of i.contradicts.slice(0, 1)) {
      if (text(c)) lines.push(`  - "${i.text}" conflicts with "${text(c)}"`);
    }
  }
  if (!lines.length) return '';
  return `\n=== What rests on what (built across this conversation) ===\n${lines.slice(0, 8).join('\n')}\n`;
}
