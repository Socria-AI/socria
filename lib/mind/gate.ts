// lib/mind/gate.ts
//
// What is allowed to become permanent.
//
// This file is the brief's §3 — "do not convert every sentence into permanent
// truth" — expressed as rules rather than as an instruction to the extractor.
// The distinction matters: an instruction in a prompt is followed most of the
// time, and a memory system that is wrong occasionally and confidently is
// worse than one that remembers less.
//
// The risk being defended against is specific. A model reading a transcript
// will happily conclude that somebody who described one bad meeting "finds
// conflict difficult", and will write it down as a fact about their
// character. That claim then follows them into every later conversation,
// shapes how Socria speaks to them, and they never asked for it and cannot
// see why it is there. One afternoon is an Event. A trait needs more.
//
// So four gates, in order, and a candidate must pass all of them:
//
//   1. REGISTER. What kind of utterance was this? A joke persists nothing.
//   2. GENERALISATION. A claim about the person needs a second sighting.
//   3. SUBSTANCE. Empty, tiny or boilerplate candidates are dropped.
//   4. FORGETTING. A tombstoned fingerprint is refused, always, last.
//
// Structure bounds the error; it does not remove it. If the extractor
// systematically misreads register, this holds the line at "fewer wrong
// nodes", not "none". Which is why the Memory page exists.

import { matchesForgotten } from './resolve';
import { UNKNOWN_SOURCE } from './types';
import {
  isGeneralising, claimsAgree, fingerprintClaim, fingerprintNode, normalize,
  type MindGraph, type NodeType, type ProvenanceKind,
} from './types';

/** What a candidate may create, by the register it was offered in. */
interface RegisterRule {
  /** nothing persists at all */
  ephemeral?: boolean;
  /** only these types may be created; undefined means any */
  allow?: string[];
  /** the status a node takes when created from this register */
  status?: 'active' | 'tentative' | 'uncertain';
}

const REGISTER: Record<ProvenanceKind, RegisterRule> = {
  // Said outright. The only registers that may assert anything.
  stated: { status: 'active' },
  established: { status: 'active' },

  // Read between the lines. May record that something HAPPENED or that a
  // subject came up; may not conclude something about the person — that is
  // gate 2's job, and it needs a second sighting.
  // Inference may PROPOSE anything, including a claim about the person.
  // Whether such a claim is believed is gate 2's decision, not this one —
  // register says what kind of utterance it was, not how much corroboration
  // it needs. Blocking traits here as well would make gate 2 unreachable and
  // a real pattern permanently unlearnable.
  inferred: { status: 'tentative' },

  // Socria's own guess, offered as one. Records the question, not an answer.
  hypothesis: { allow: ['Question', 'Uncertainty', 'Assumption'], status: 'uncertain' },

  // A position being tried on rather than held.
  tentative: { status: 'tentative' },

  // Found or computed. May record evidence; may not conclude about a person.
  researched: { allow: ['Evidence', 'Concept', 'Source', 'Insight', 'Organization', 'Place', 'Person'], status: 'active' },
  calculated: { allow: ['Evidence', 'Concept', 'Insight'], status: 'active' },

  // True right now and not after. Belongs to the Cognitive State.
  temporary: { ephemeral: true },

  // Not assertions at all. The three the brief names, and the reason this
  // whole file exists.
  joke: { ephemeral: true },
  hypothetical: { ephemeral: true },
  example: { ephemeral: true },
};

export interface GateInput {
  type: NodeType;
  label: string;
  content: string;
  kind: ProvenanceKind;
  /** candidates the same extraction already proposed, for gate 3 */
  graph: MindGraph;
  /** an existing node this resolved to, if any */
  matchedSeen?: number;
  /** whether it resolved at all — a reinforcement is judged differently */
  matched?: boolean;
  /** which conversation proposed it, for the isolation rule */
  conversationId?: string;
  /**
   * The person has just said this again, in so many words, in this message.
   *
   * Set only by a deterministic read of their own sentence — today that is
   * `nameCandidate`, from "my name is …". It is the one thing allowed past a
   * tombstone, because deleting a memory and volunteering the fact again are
   * both explicit acts and the later one is the person's current instruction.
   * Without it, using the Memory page's delete button on the name node made
   * the name unlearnable for good: the reply said "Got it, Pradeep" (the live
   * text matches), the next conversation said it did not know their name, and
   * nothing the person could type would ever fix it — the exact bug the
   * standing profile was written to end, made permanent.
   */
  restated?: boolean;
}

export type GateVerdict =
  | {
      pass: true;
      status: 'active' | 'tentative' | 'uncertain';
      /**
       * Whether this candidate may REPLACE the words of a node it matched.
       *
       * False for an uncorroborated claim about the person. Such a claim may
       * still record that the subject came up again — that is honest — but it
       * may not put its own wording in place of what somebody actually said.
       * Without this the corroboration rule was bypassable by reinforcement
       * rather than by creation: a single inferred remark rewrote a stated
       * node and the graph then asserted it as settled.
       */
      mayRewrite: boolean;
    }
  | { pass: false; reason: GateRefusal };

export type GateRefusal =
  | 'ephemeral-register'
  | 'type-not-allowed-for-register'
  | 'generalisation-needs-second-sighting'
  | 'no-substance'
  | 'forgotten';

const MIN_CONTENT_WORDS = 3;

export function gate(input: GateInput): GateVerdict {
  const rule = REGISTER[input.kind];

  // 1. Register.
  if (!rule || rule.ephemeral) {
    return { pass: false, reason: 'ephemeral-register' };
  }
  if (rule.allow && !rule.allow.includes(input.type)) {
    return { pass: false, reason: 'type-not-allowed-for-register' };
  }

  // 2. Generalisation. A claim ABOUT THE PERSON arrived at by INFERENCE is
  //    held back until a DIFFERENT conversation proposes it too. A stated
  //    preference goes straight in: somebody saying "I prefer to reason from
  //    first principles" is not an inference, it is a report.
  //
  //    `matchedSeen` used to short-circuit this, and the reasoning was wrong.
  //    The comment here said a second sighting would find the matched node's
  //    `seen` already at 1 and pass — but a FIRST inferred generalisation
  //    creates no node at all; it is refused into `pending`. So the only way
  //    matchedSeen could be set for an uncorroborated claim was that some
  //    OTHER register had created a node the fuzzy matcher treats as the same
  //    thing. Since every node is born with seen = 1, the clause read as
  //    "any compatible neighbour authorises this" — and because Belief,
  //    Concept and Assumption all resolve to one another, gate 2 got WEAKER
  //    the more the graph knew, which is exactly backwards.
  //
  //    Reproduced before the fix, inside one conversation: a stated Concept
  //    "Deadlines" let an inferred Belief rewrite it into "they resent
  //    deadlines... a fixed part of how they work", still typed Concept,
  //    still marked active, and therefore rendered into every later prompt as
  //    settled context with no status marker on it.
  //
  //    Corroboration now comes from the pending ledger and nowhere else.
  const generalising =
    isGeneralising(input.type) &&
    (input.kind === 'inferred' || input.kind === 'hypothesis');
  let mayRewrite = true;
  // WHAT THEY DID NOT STATE MAY NOT REWRITE WHAT THEY DID.
  //
  // Gate 2 covers 'inferred' and 'hypothesis' and stops them landing at all.
  // 'tentative' is a third thing — a position being tried on — and it is also
  // what a model response lands on when it omits `kind` at all, so the case
  // the failure above describes was open through the widest door in the file:
  // a stated Concept "Deadlines" ("deadlines help them focus") revised in place
  // by a longer, opposite claim, still marked active, rendered into every later
  // prompt as settled. It may persist, marked 'tentative'. It may not overwrite
  // their own words. Nor may 'researched' or 'calculated' — a source and a sum
  // are not the person.
  if (isGeneralising(input.type) && input.kind !== 'stated' && input.kind !== 'established') mayRewrite = false;
  if (generalising) {
    // Corroborated by an earlier sighting held in `pending`? Then it may be
    // believed now. Otherwise it is refused and the caller records it, so
    // the NEXT sighting can find it here.
    // WITHOUT A CONVERSATION ID, NOTHING IS CORROBORATED.
    //
    // Isolation is per conversation, so with no id there is nothing to
    // compare and no way to tell a pattern from one afternoon read twice.
    // This failed open once: notePending stored a missing id as '?' while
    // this compared against '', so '?' !== '' counted as "a different
    // conversation" and a second sighting in the SAME one was believed. The
    // unit test passed because it supplied an id; the live path did not send
    // one. A rule that depends on every caller remembering is not a rule.
    const here = input.conversationId;
    if (!here) {
      if (!input.matched) {
        return { pass: false, reason: 'generalisation-needs-second-sighting' };
      }
      mayRewrite = false;
    }
    const fp = fingerprintClaim(input.label);
    const prior = here ? input.graph.pending.find((p) => p.fingerprint === fp) : undefined;
    // A sighting only corroborates if it is the same CLAIM, not merely the
    // same name. Two different things called "Deadlines" must not vouch for
    // each other.
    const seenBefore = prior && claimsAgree(prior.content, input.content) ? prior : undefined;
    const elsewhere = seenBefore
      ? seenBefore.sources.filter((sid) => sid && sid !== UNKNOWN_SOURCE && sid !== here).length
      : 0;
    if (elsewhere < 1) {
      // Uncorroborated. It may not be CREATED — the caller records the
      // sighting instead — and if it matched something that already exists it
      // may not rewrite it either.
      if (!input.matched) {
        return { pass: false, reason: 'generalisation-needs-second-sighting' };
      }
      mayRewrite = false;
    }
  }

  // 3. Substance — for CREATION only.
  //
  //    A thin candidate that resolves to a node we already hold is not junk,
  //    it is somebody saying "yeah, that offer". Refusing it would throw away
  //    a real reinforcement signal and leave the graph's `seen` counts
  //    understating how often something actually comes up — which gate 2
  //    depends on. Substance is what stops thin junk becoming a NEW node.
  const label = normalize(input.label);
  if (!label) return { pass: false, reason: 'no-substance' };
  if (!input.matched) {
    const words = normalize(input.content).split(' ').filter(Boolean);
    if (words.length < MIN_CONTENT_WORDS) {
      return { pass: false, reason: 'no-substance' };
    }
  }

  // 4. Forgetting, last and absolute. Nothing above can override it — except
  //    the person saying the thing again themselves (`restated`, below).
  //
  //    Checked across every COMPATIBLE type, not just the one proposed.
  //    Otherwise forgetting "Prompt Limit" as a Concept is undone by the next
  //    extraction calling it a Belief — the two already resolve to one
  //    another, so that would be the same node arriving under a new hat.
  //    Asked the way RESOLUTION asks it, not by exact fingerprint. The exact
  //    check catches only an identical re-proposal; anything the matcher
  //    would have merged with the forgotten node has to be refused too, or
  //    "the Berlin offer" walks straight past a tombstone for "Berlin offer".
  if (!input.restated && matchesForgotten(input.graph.tombstones, {
    type: input.type,
    label: input.label,
    content: input.content,
  })) {
    return { pass: false, reason: 'forgotten' };
  }

  return { pass: true, status: rule.status ?? 'active', mayRewrite };
}

// ── how much may land in one turn ───────────────────────────────────

export interface Budget {
  nodes: number;
  edges: number;
}

/**
 * An ordinary turn may add a little; a file may add a lot.
 *
 * Over budget, candidates are RANKED and the remainder dropped rather than
 * queued. A queue of half-remembered candidates is its own kind of mess, and
 * anything genuinely important recurs — that is what gate 2 is counting on
 * anyway.
 */
export const TURN_BUDGET: Budget = { nodes: 5, edges: 10 };
export const FILE_BUDGET: Budget = { nodes: 60, edges: 150 };

/** Which candidates survive the budget: the most substantial first. */
export function rank<T extends { type: NodeType; content: string; kind: ProvenanceKind }>(
  candidates: T[]
): T[] {
  const weight = (c: T): number => {
    let w = 0;
    if (c.kind === 'stated' || c.kind === 'established') w += 3;
    if (c.kind === 'researched' || c.kind === 'calculated') w += 2;
    // A decision or a goal outranks an association, all else equal.
    if (['Decision', 'Goal', 'Project', 'Person', 'Belief'].includes(c.type)) w += 2;
    if (['Event', 'Experience', 'Insight', 'Question'].includes(c.type)) w += 1;
    w += Math.min(normalize(c.content).split(' ').length, 30) / 30;
    return w;
  };
  return [...candidates].sort((a, b) => weight(b) - weight(a));
}
