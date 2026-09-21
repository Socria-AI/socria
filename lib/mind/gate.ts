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

import { compatibleTypes } from './resolve';
import {
  GENERALISING_TYPES, fingerprintNode, isForgotten, normalize,
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
}

export type GateVerdict =
  | { pass: true; status: 'active' | 'tentative' | 'uncertain' }
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

  // 2. Generalisation. A Belief, Preference or Assumption arrived at by
  //    INFERENCE is held back until a second, independent extraction
  //    proposes it again — at which point the matched node's `seen` is
  //    already 1 and it passes. A STATED preference goes straight in:
  //    somebody saying "I prefer to reason from first principles" is not an
  //    inference, it is a report.
  if (
    GENERALISING_TYPES.has(input.type) &&
    (input.kind === 'inferred' || input.kind === 'hypothesis') &&
    !(input.matchedSeen && input.matchedSeen >= 1)
  ) {
    // Corroborated by an earlier sighting held in `pending`? Then it may be
    // believed now. Otherwise it is refused and the caller records it, so
    // the NEXT sighting can find it here.
    const fp = fingerprintNode(input.type, input.label);
    const seenBefore = input.graph.pending.find((p) => p.fingerprint === fp);
    // Corroborated by a DIFFERENT conversation? Then it may be believed.
    // The same conversation proposing it again is the same evidence.
    const elsewhere = seenBefore
      ? seenBefore.sources.filter((sid) => sid !== (input.conversationId ?? '')).length
      : 0;
    if (elsewhere < 1) {
      return { pass: false, reason: 'generalisation-needs-second-sighting' };
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

  // 4. Forgetting, last and absolute. Nothing above can override it.
  //
  //    Checked across every COMPATIBLE type, not just the one proposed.
  //    Otherwise forgetting "Prompt Limit" as a Concept is undone by the next
  //    extraction calling it a Belief — the two already resolve to one
  //    another, so that would be the same node arriving under a new hat.
  for (const t of compatibleTypes(input.type)) {
    if (isForgotten(input.graph, fingerprintNode(t, input.label))) {
      return { pass: false, reason: 'forgotten' };
    }
  }

  return { pass: true, status: rule.status ?? 'active' };
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
