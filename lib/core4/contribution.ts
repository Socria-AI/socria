// lib/core4/contribution.ts
//
// What is missing, that would be worth saying?
//
// THE FAILURE THIS SOLVES. Core 4 chose HOW to intervene — question, explain,
// challenge, get out of the way — and never asked WHAT was absent. Six eval
// runs measured the result: parity on control (it stopped asking bad
// questions, stopped leaking withheld answers) and never better than parity
// on contribution. The judges' sentence, over and over, was a version of
// "both are strong; the baseline contributed more non-obvious material".
//
// A frontier model with a good prompt is already excellent at saying
// something insightful about the message in front of it. What it cannot do is
// notice that the decision you are about to make rests on a number you
// assumed four turns ago and never checked — because that requires holding
// the structure across turns, and a prompt holds a transcript.
//
// So these detectors are deliberately NOT semantic judges. Each is a query
// over the ProblemModel's graph: an unsupported dependency, a live
// contradiction between two turns, a decision with nothing bounding it. They
// cost no model call and no latency, they are exactly reproducible, and they
// fire only on structure the system accumulated.
//
// WHAT IS DELIBERATELY NOT HERE. WRONG_PROBLEM, MISSING_DOMAIN_KNOWLEDGE and
// STRUCTURAL_COMPLEXITY are in the brief and are not implemented, because
// there is no honest deterministic test for them and faking one with a cheap
// model would put a weak judge in front of a strong writer — the failure mode
// experiment E1 already caught once. Those stay the reply model's job; this
// module's job is to hand it the structure it could not have built.

import { classify, conceptTerms } from './considered';
import { ofKind, restsOn, type ProblemItem, type ProblemModel } from './problem';
import type { CognitiveState } from '../cognition/state';

export const MISSING_KINDS = [
  'HIDDEN_ASSUMPTION',
  'MISSING_EVIDENCE',
  'UNVERIFIED_FACT',
  'CONTRADICTION',
  'STALE_BELIEF',
  'MISSING_DECISION_CRITERIA',
  'FALSE_BINARY',
  'REPEATED_LOOP',
  'UNDERWEIGHTED_UNCERTAINTY',
] as const;
export type MissingKind = (typeof MISSING_KINDS)[number];

export interface MissingContribution {
  kind: MissingKind;
  /** the ledger ids this rests on, so the claim can be audited */
  ids: string[];
  /** what to say, in the system's own words — never shown verbatim to the person */
  what: string;
  /**
   * The item texts the finding is ABOUT, so the novelty gate can tell
   * "they already made this point" from "this point is about something they
   * said". Without it every structural finding looks redundant, because a
   * finding necessarily quotes the material it is about.
   */
  subjects?: string[];
  /** why it is worth a sentence of their attention */
  whyItMatters: string;
  confidence: number;
  /** filled by the novelty gate: have they already been here */
  novelty: 'NOVEL' | 'PARTIALLY_NOVEL' | 'REDUNDANT' | 'UNCERTAIN';
  /** what it costs to be wrong about this */
  risk: 'low' | 'medium' | 'high';
}

const DECIDING = new Set(['decision', 'conclusion']);

/**
 * A conclusion resting on something nobody checked.
 *
 * The highest-value one, and the one no single prompt can reach: the
 * assumption is usually several turns back, stated once, agreed to, and never
 * revisited. `restsOn` walks the dependency edges, so two hops count.
 */
function hiddenAssumption(p: ProblemModel): MissingContribution[] {
  const out: MissingContribution[] = [];
  for (const d of ofKind(p, 'decision', 'conclusion')) {
    for (const base of restsOn(p, d.id)) {
      if (base.settled) continue;
      const shaky = base.epistemic === 'assumed' || base.epistemic === 'needs_verification';
      if (!shaky || base.supportedBy.length) continue;
      out.push({
        kind: base.epistemic === 'assumed' ? 'HIDDEN_ASSUMPTION' : 'UNVERIFIED_FACT',
        ids: [d.id, base.id],
        subjects: [d.text, base.text],
        what: `"${d.text}" rests on "${base.text}", which is ${base.epistemic === 'assumed' ? 'assumed' : 'unchecked'} and nothing supports.`,
        whyItMatters: 'If that turns out to be wrong, the conclusion goes with it — and it was never examined.',
        confidence: base.epistemic === 'assumed' ? 0.75 : 0.6,
        novelty: 'UNCERTAIN',
        risk: 'medium',
      });
    }
  }
  return out;
}

/** A claim a decision leans on, with no evidence of any kind behind it. */
function missingEvidence(p: ProblemModel): MissingContribution[] {
  const evidence = ofKind(p, 'evidence');
  const out: MissingContribution[] = [];
  for (const c of ofKind(p, 'claim')) {
    if (c.supportedBy.length || !c.dependedOnBy.length) continue;
    if (!c.dependedOnBy.some((id) => DECIDING.has(p.items.find((i) => i.id === id)?.kind ?? ''))) continue;
    out.push({
      kind: 'MISSING_EVIDENCE',
      ids: [c.id],
      subjects: [c.text],
      what: `"${c.text}" is carrying a decision and has nothing behind it${evidence.length ? '' : ' (no evidence has been put on the table at all)'}.`,
      whyItMatters: 'It is the load-bearing claim, so it is the one worth checking first.',
      confidence: 0.6,
      novelty: 'UNCERTAIN',
      risk: 'medium',
    });
  }
  return out;
}

/**
 * Two live items that contradict each other, from DIFFERENT turns.
 *
 * Same-message tensions are already handled by the CHALLENGE branch in
 * intervene.ts and by `state.tensions`; repeating them here would be a second
 * system saying the same thing. What that cannot see is a claim from turn two
 * that the person quietly contradicted at turn nine.
 */
function contradiction(p: ProblemModel): MissingContribution[] {
  const out: MissingContribution[] = [];
  const seen = new Set<string>();
  for (const a of p.live) {
    for (const bId of a.contradicts) {
      const b = p.items.find((i) => i.id === bId);
      if (!b || b.settled) continue;
      const key = [a.id, b.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.abs(a.turn - b.turn) < 1) continue;
      out.push({
        kind: 'CONTRADICTION',
        ids: [a.id, b.id],
        subjects: [a.text, b.text],
        what: `"${a.text}" (turn ${a.turn}) and "${b.text}" (turn ${b.turn}) cannot both hold.`,
        whyItMatters: 'Both are still being used as if settled, and they are far enough apart that nobody has put them side by side.',
        confidence: 0.8,
        novelty: 'UNCERTAIN',
        risk: 'low',
      });
    }
  }
  return out;
}

/** Still leaning on something that has since been superseded or ruled out. */
function staleBelief(p: ProblemModel): MissingContribution[] {
  const out: MissingContribution[] = [];
  for (const i of p.live) {
    for (const depId of [...i.dependsOn, ...i.supportedBy]) {
      const dep = p.items.find((x) => x.id === depId);
      if (!dep || !dep.settled) continue;
      out.push({
        kind: 'STALE_BELIEF',
        ids: [i.id, dep.id],
        subjects: [i.text, dep.text],
        what: `"${i.text}" still rests on "${dep.text}", which has since been dropped.`,
        whyItMatters: 'The support was withdrawn and the thing it was holding up was never revisited.',
        confidence: 0.7,
        novelty: 'UNCERTAIN',
        risk: 'medium',
      });
    }
  }
  return out;
}

/** A decision with nothing bounding it: no constraint, no criterion, no stated tradeoff. */
function missingCriteria(p: ProblemModel, state: Pick<CognitiveState, 'taskKind' | 'work'>): MissingContribution[] {
  const deciding = state.taskKind === 'decide' || state.work === 'judgment';
  if (!deciding) return [];
  const decisions = ofKind(p, 'decision');
  if (!decisions.length) return [];
  if (ofKind(p, 'constraint').length) return [];
  return [{
    kind: 'MISSING_DECISION_CRITERIA',
    ids: decisions.map((d) => d.id).slice(0, 2),
    subjects: decisions.map((d) => d.text).slice(0, 2),
    what: 'A decision is being weighed and nothing has been said about what would make one option better than another.',
    whyItMatters: 'Without a criterion the comparison cannot close, and the conversation circles.',
    confidence: 0.55,
    novelty: 'UNCERTAIN',
    risk: 'low',
  }];
}

/** Exactly two options on the table, and a decision pending between them. */
function falseBinary(p: ProblemModel, state: Pick<CognitiveState, 'taskKind' | 'work'>): MissingContribution[] {
  if (state.taskKind !== 'decide' && state.work !== 'judgment') return [];
  const options = ofKind(p, 'alternative', 'option');
  if (options.length !== 2) return [];
  return [{
    kind: 'FALSE_BINARY',
    ids: options.map((o) => o.id),
    subjects: options.map((o) => o.text),
    what: `The choice is being treated as "${options[0].text}" or "${options[1].text}" and no third path has been put on the table.`,
    whyItMatters: 'Two-option framings are usually inherited from how the question was first asked, not from the problem.',
    confidence: 0.45,
    novelty: 'UNCERTAIN',
    risk: 'low',
  }];
}

/** The same open question, still open, several turns later. */
function repeatedLoop(p: ProblemModel): MissingContribution[] {
  const out: MissingContribution[] = [];
  for (const q of ofKind(p, 'question', 'uncertainty')) {
    const age = p.turn - q.turn;
    if (age < 3) continue;
    out.push({
      kind: 'REPEATED_LOOP',
      ids: [q.id],
      subjects: [q.text],
      what: `"${q.text}" was open ${age} turns ago and is still open.`,
      whyItMatters: 'Everything since has been built on top of a question nobody closed.',
      confidence: 0.5,
      novelty: 'UNCERTAIN',
      risk: 'low',
    });
  }
  return out;
}

/** An uncertainty nothing has answered, while a decision is being made anyway. */
function underweightedUncertainty(p: ProblemModel): MissingContribution[] {
  const open = ofKind(p, 'uncertainty').filter((u) => !u.supportedBy.length && !u.dependedOnBy.length);
  const decisions = ofKind(p, 'decision');
  if (!open.length || !decisions.length) return [];
  return [{
    kind: 'UNDERWEIGHTED_UNCERTAINTY',
    ids: [open[0].id, decisions[0].id],
    subjects: [open[0].text, decisions[0].text],
    what: `"${open[0].text}" is unresolved and the decision is proceeding around it rather than through it.`,
    whyItMatters: 'It is the part of the problem with the widest range, so it dominates the outcome.',
    confidence: 0.5,
    novelty: 'UNCERTAIN',
    risk: 'low',
  }];
}

/**
 * Everything absent that the structure can see, best first.
 *
 * Pure and total: no model call, no I/O, no clock. Given the same ledger it
 * returns the same list, which is what makes it testable and what stops it
 * drifting into a second opinion about the conversation.
 */
export function detectMissing(
  p: ProblemModel,
  state: Pick<CognitiveState, 'taskKind' | 'work'>
): MissingContribution[] {
  const all = [
    ...hiddenAssumption(p),
    ...contradiction(p),
    ...staleBelief(p),
    ...missingEvidence(p),
    ...missingCriteria(p, state),
    ...falseBinary(p, state),
    ...repeatedLoop(p),
    ...underweightedUncertainty(p),
  ];
  // One per kind: three variations of "something is assumed" is one point.
  const best = new Map<MissingKind, MissingContribution>();
  for (const c of all) {
    const prev = best.get(c.kind);
    if (!prev || c.confidence > prev.confidence) best.set(c.kind, c);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Drop what they have already been told, and what is not worth their time.
 *
 * Reuses the novelty classifier the Answer Guard already runs on drafts, so
 * "have they been here before" is answered the same way in both places. The
 * difference is when: the guard asks after the draft exists, which can only
 * delete. Asking before the move is chosen means the reply can be about
 * something else instead.
 *
 * Expertise raises the bar rather than changing the kind. For someone who
 * knows the domain, a 0.45-confidence "have you considered a third option"
 * is the generic advice that makes a product feel stupid; for a novice the
 * same sentence is useful. This is the one place expertise changes WHAT gets
 * said rather than how much scaffolding wraps it.
 */
export function gateContributions(
  found: readonly MissingContribution[],
  considered: readonly string[],
  expertise: 'novice' | 'intermediate' | 'expert' | 'unknown'
): MissingContribution[] {
  const floor = expertise === 'expert' ? 0.7 : expertise === 'intermediate' ? 0.55 : 0.4;
  const out: MissingContribution[] = [];
  for (const c of found) {
    // Compare against what they have said EXCEPT the very items this finding
    // is about. A finding quotes its subjects, so classifying it against a
    // list containing those subjects marks almost everything redundant — the
    // end-to-end test caught exactly that: "their churn figure is carrying
    // the decision and has nothing behind it" read as already-said, because
    // they had indeed said the churn figure.
    // Exclude only the lines that ARE the subject, not the lines that make a
    // point about it. "Monthly churn is 4.1%" is the subject and must not
    // silence a finding about it; "nothing supports the churn figure and the
    // decision rests on it" IS the finding's point and must silence it. The
    // test is whether the line says anything beyond the subject — same
    // concepts, or one more, is a restatement.
    const subjects = c.subjects ?? [];
    const isJustTheSubject = (line: string) =>
      subjects.some((s) => classify(line, [s]).verdict === 'REDUNDANT' && conceptTerms(line).size <= conceptTerms(s).size + 1);
    const others = considered.filter((line) => !isJustTheSubject(line));
    const verdict = classify(c.what, others).verdict;
    if (verdict === 'REDUNDANT') continue;
    if (c.confidence < floor) continue;
    out.push({ ...c, novelty: verdict });
  }
  return out;
}

/** What the move block says about it. Empty when there is nothing worth raising. */
export function renderMissing(found: readonly MissingContribution[]): string {
  const top = found.slice(0, 2);
  if (!top.length) return '';
  const lines = top.map((c) => `  - ${c.what} (${c.whyItMatters})`);
  return `\n=== Noticed in the structure of their problem, across turns ===\n${lines.join('\n')}\nRaise at most ONE of these, only if it genuinely matters here, in your own words and woven into the reply — never as a list, never as "have you considered". If it does not fit what they asked for, leave it.\n`;
}
