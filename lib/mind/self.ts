// lib/mind/self.ts
//
// The person themselves — the one thing the graph could not remember.
//
// THE REPORT. "name is pradeep" → "Got it, Pradeep." Two turns later: "u know
// my name?" → "I don't know your name." And before either: "what do you know
// abt me" → "Not much unless we've talked before."
//
// TRACED. Retrieval seeds lexically off node LABELS (activate.ts), so a node
// labelled "Pradeep" lights up only when a message contains the word
// "pradeep". "Do you know my name?" contains know, my, name — and none of
// those is the label. The name was in the graph and unreachable by the one
// question that asks for it. "What do you know about me" was worse: it names
// no topic at all, so `activate` seeded nothing and returned early with an
// empty subgraph, and the reply was written with no memory attached.
//
// So this is not a missing fact. It is a missing KIND of retrieval: every
// query path assumed the message names its subject, and a question about the
// person names nothing. Two deterministic reads fix it, and both are here
// rather than in the extractor because a model call is the wrong mechanism for
// "did they just tell me their name" — it is a regex, it is free, and it
// cannot be talked out of it by a page of text.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not infer anything. A name is
// recorded only when they state it in a form that means a name ("my name is",
// "call me", "I go by"), never from "I'm tired" or "I'm a student", and the
// self digest surfaces only what the graph already holds. Nothing here mints a
// belief about anybody.

import { normalize, STATUS_WEIGHT, type MindGraph, type MindNode } from './types';

/**
 * The alias every node ABOUT THE PERSON carries.
 *
 * An alias rather than a node type, because the graph already has Person and
 * a person's name is one; what is needed is a way to ask "which of these is
 * THEM", and an alias is the one field retrieval already matches on.
 */
export const SELF_ALIAS = 'me';

/**
 * Only the phrasings that MEAN a name.
 *
 * "I'm Pradeep" is deliberately absent: "I'm tired", "I'm stuck", "I'm a
 * second-year" all match that shape, and a memory system that occasionally
 * decides somebody is called Tired is worse than one that waits to be told
 * plainly. Every form here has a naming word in it.
 *
 * Case-insensitive, because people type their own name in lower case — the
 * report that produced this file said "name is pradeep".
 */
const NAMED = [
  /\bmy name(?:'s| is|:)\s+([\p{L}][\p{L}'’-]{1,24}(?:\s+[\p{L}][\p{L}'’-]{1,24})?)/iu,
  /(?:^|[.!?]\s*|\n)\s*name(?:'s| is|:)\s+([\p{L}][\p{L}'’-]{1,24}(?:\s+[\p{L}][\p{L}'’-]{1,24})?)/iu,
  /\b(?:call me|i go by|i'?m called|they call me)\s+([\p{L}][\p{L}'’-]{1,24}(?:\s+[\p{L}][\p{L}'’-]{1,24})?)/iu,
];

/** Words that are never somebody's name, however the sentence is shaped. */
const NOT_A_NAME = new Set([
  'not', 'no', 'none', 'nothing', 'it', 'the', 'a', 'an', 'my', 'your', 'his',
  'her', 'their', 'that', 'this', 'what', 'who', 'sorry', 'just', 'still',
  'actually', 'really', 'literally', 'irrelevant', 'private', 'secret',
]);

/**
 * Words that end a name rather than continue it.
 *
 * The capture takes up to two words so "Sarah Chen" survives, and a sentence
 * carries on afterwards: "I go by Raj at work", "my name is Ana and I have a
 * question". Without this the second word was swallowed and somebody was
 * recorded as "Raj At".
 */
const NOT_A_SURNAME = new Set([
  'at', 'in', 'on', 'for', 'and', 'but', 'to', 'from', 'with', 'by', 'here',
  'there', 'now', 'today', 'because', 'so', 'when', 'while', 'the', 'a', 'an',
  'my', 'i', 'if', 'though', 'since', 'thanks', 'please', 'btw', 'anyway',
]);

/** Their name, as they typed it, or null. */
export function nameFrom(text: string): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  for (const re of NAMED) {
    const m = t.match(re);
    const raw = m?.[1]?.trim();
    if (!raw) continue;
    const first = raw.split(/\s+/)[0].toLowerCase();
    if (NOT_A_NAME.has(first)) continue;
    const parts = raw.split(/\s+/);
    if (parts.length > 1 && NOT_A_SURNAME.has(parts[1].toLowerCase())) parts.length = 1;
    // Title case for display, because "pradeep" typed in a hurry is still a
    // name and writing it back in lower case reads as carelessness.
    return parts
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .slice(0, 60);
  }
  return null;
}

/**
 * They are asking specifically what they are CALLED.
 *
 * Kept apart from the broader "about me" question on purpose. "Do you know my
 * name?" has one honest answer when the graph holds no name — no — and
 * answering it by reciting the most important thing in the graph would be a
 * different and stranger failure than the one being fixed.
 */
const ASKS_NAME = /\b(?:my name|who am i|what am i called)\b/i;

/** Is this message about the PERSON, rather than about a topic? */
const ABOUT_THEM =
  /\b(?:what do you (?:know|remember|have)|do you (?:know|remember)|tell me what you know)\b[^?.!]{0,40}\b(?:about me|me|who i am)\b|\bwho am i\b|\bremember me\b|\bwhat have you got on me\b|\bwhat do you know abt me\b/i;

/**
 * They are asking what was said BEFORE — "remind me", "where did we leave
 * off", "what did we talk about last time".
 *
 * Its own class because it is the one question association cannot answer
 * either: it names no topic, and the answer is "whatever was most recent",
 * which no lexical seed can produce.
 */
const ASKS_RECALL = /\b(?:remind me|where (?:did|were) we (?:leave|left|get to)|what did we (?:talk|discuss|cover|say)|last time|earlier you said|we were talking about|pick(?:ing)? up where|catch me up)\b/i;

export function asksRecall(text: string): boolean {
  return ASKS_RECALL.test((text ?? '').trim());
}

export function asksName(text: string): boolean {
  return ASKS_NAME.test((text ?? '').trim());
}

/**
 * A question whose subject is the person asking it.
 *
 * This is the class that returned nothing: it names no topic, so a lexical
 * seeder has nothing to match, and the early return meant the reply was
 * written with no memory attached at all.
 */
export function aboutThem(text: string): boolean {
  return ABOUT_THEM.test((text ?? '').trim());
}

/** Do they refer to themselves at all? Cheap, and it gates the self seeding. */
export function selfReferential(text: string): boolean {
  return /\b(?:i|i'?m|i'?ve|me|my|myself|mine)\b/i.test((text ?? '').trim());
}

/** The nodes that are about them: the ones carrying the self alias. */
export function selfNodes(nodes: readonly MindNode[]): MindNode[] {
  return nodes.filter((n) => n.aliases.some((a) => normalize(a) === SELF_ALIAS));
}

/**
 * The candidate written when somebody states their name.
 *
 * `stated`, because they said it outright — gate.ts lets a stated claim
 * through without corroboration, which is correct here and is the whole
 * difference between a fact somebody gave you and one you inferred about them.
 */
export function nameCandidate(name: string) {
  return {
    type: 'Person' as const,
    label: name,
    content: `Their name. They said it themselves: "${name}".`,
    kind: 'stated' as const,
    confidence: 1,
    certainty: 1,
    importance: 0.95,
    aliases: [SELF_ALIAS, 'my name', 'their name'],
  };
}

// ── THE STANDING PROFILE ─────────────────────────────────────────────
//
// Retrieval is associative: it lights what the message touches. That is the
// right design for a memory and the wrong one for an INTRODUCTION, and the
// difference is what "it forgot me in a new chat" actually means. Somebody
// opening a new conversation with "hey" or "quick question" has touched
// nothing, so nothing lights, so Socria meets them as a stranger — however
// much it holds about them.
//
// So a handful of standing facts travel on EVERY turn, whatever the message
// says. Not the graph: a short, stable header — who they are, what they are
// working on, how they have asked to be dealt with. It is the part of memory a
// person actually notices, and it is the part association can never supply,
// because you do not mention your own name.
//
// SMALL ON PURPOSE. Six lines. A profile that grows without bound becomes a
// preamble the model reads past on every turn, and the associative retrieval
// below it is what handles depth.

/**
 * Types that describe a person's standing situation rather than a topic.
 *
 * `Person` is NOT on this list, and the reason is a test that caught it: their
 * tutor, their colleague and their sister are all Person nodes, and a profile
 * built from the type would have introduced every conversation with somebody
 * else's professor. The only Person who belongs here is THEM, and they are
 * reached by the self alias instead.
 */
const STANDING = new Set(['Goal', 'Plan', 'Preference', 'Project', 'Organization', 'Decision']);

/** How many standing lines travel on every turn. */
export const PROFILE_LINES = 6;

/**
 * The few things worth knowing before reading anything they say.
 *
 * Ordered by how load-bearing each is, not by recency: their name first
 * (nothing else in a conversation supplies it), then what they are doing and
 * how they have asked to be treated. Status still discounts — a superseded
 * goal is not who they are now — and a private node never leaves a surface
 * that excludes private material.
 */
export function standingProfile(
  graph: Pick<MindGraph, 'nodes'>,
  opts: {
    now: number;
    excludePrivate?: boolean;
    limit?: number;
    /**
     * Nodes belonging to a Project other than the one this turn is in.
     *
     * Project isolation is a promise the product makes, and a header that
     * travels on every turn is exactly the thing that would quietly break it:
     * without this, a Calculus tutor's office hours introduced a conversation
     * inside Socria. The caller computes it (pipeline.ts), because only the
     * caller knows which Project is current.
     */
    elsewhere?: ReadonlySet<string>;
  } = { now: Date.now() }
): MindNode[] {
  const limit = opts.limit ?? PROFILE_LINES;
  const usable = graph.nodes.filter(
    (n) =>
      (!opts.excludePrivate || !n.private) &&
      !opts.elsewhere?.has(n.id) &&
      n.status !== 'archived' &&
      n.status !== 'superseded' &&
      n.status !== 'contradicted'
  );
  const isSelf = (n: MindNode) => n.aliases.some((a) => normalize(a) === SELF_ALIAS);
  const score = (n: MindNode) => {
    // Their identity outranks everything: it is the one fact no message ever
    // supplies and the one whose absence reads as amnesia.
    const identity = isSelf(n) ? 2 : 0;
    const kind = STANDING.has(String(n.type)) ? 0.6 : 0;
    // Weeks, not minutes: a standing fact should not be reshuffled by what was
    // touched an hour ago, but something a year stale should fall off.
    const age = Math.max(0, (opts.now - n.updatedAt) / (30 * 86_400_000));
    return identity + kind + n.importance + Math.max(0, 0.5 - age * 0.1) + (STATUS_WEIGHT[n.status] ?? 0.5) * 0.3;
  };
  return usable
    .filter((n) => isSelf(n) || (STANDING.has(String(n.type)) && n.importance >= 0.45))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

/**
 * The header, or nothing.
 *
 * Deliberately NOT framed as facts to recite. The failure mode of a standing
 * profile is a model that opens every reply by telling somebody their own name
 * back to them, which is worse than forgetting it.
 */
export function renderProfile(nodes: readonly MindNode[]): string {
  if (!nodes.length) return '';
  const lines = nodes.map((n) => {
    const status = n.status === 'active' ? '' : ` [${n.status}]`;
    return `- ${n.type}: ${n.label}${status} — ${n.content}`;
  });
  return (
    '\n=== Who you are talking to ===\n' +
    'Standing context, carried into every conversation because it is true between them. ' +
    'Use it the way you would use knowing somebody: it changes how you answer, and you do not announce it. ' +
    'Do not open by telling them what you know about them, do not list it back, and do not thank them for it. ' +
    'If something here is wrong, what they say now wins — they can correct any of it on the memory page.\n' +
    lines.join('\n') +
    '\n'
  );
}
