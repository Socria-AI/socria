// lib/mind/resolve.ts
//
// "Is this the thing we already know about?"
//
// Every candidate the extractor proposes has to be matched against what the
// graph already holds, or the graph fills with variants of one idea: "the
// Berlin offer", "Berlin job offer", "the offer from Berlin", three nodes,
// no edges between them, none of them reinforced.
//
// The matcher is deliberately unclever. Normalised label, then aliases, then
// containment, then token overlap on content — each cheaper and stricter than
// a model call, each explicable when it gets something wrong. Fuzzy semantic
// matching would resolve more and would also, silently and occasionally,
// merge two things that are not the same. A graph that occasionally
// duplicates is repairable from the Memory page; one that occasionally
// conflates is not, because nobody can see what was merged.

import {
  normalize, type MindGraph, type MindNode, type NodeType,
} from './types';

/** How much of a match counts as the same thing. */
export const MATCH_THRESHOLD = 0.62;

/**
 * Types that may resolve to one another.
 *
 * Loose where the boundary is genuinely blurred — a Concept can harden into
 * a Belief, an Assumption can turn out to be one — and strict where it is
 * not. A Person must never resolve to a Project however similar the words.
 */
const COMPATIBLE: Record<string, string[]> = {
  Concept: ['Belief', 'Assumption', 'Insight'],
  Belief: ['Concept', 'Assumption'],
  Assumption: ['Belief', 'Concept', 'Uncertainty'],
  Uncertainty: ['Question', 'Assumption'],
  Question: ['Uncertainty'],
  Insight: ['Concept'],
  Goal: ['Plan'],
  Plan: ['Goal'],
  Event: ['Experience'],
  Experience: ['Event'],
};

export function typesCompatible(a: NodeType, b: NodeType): boolean {
  if (a === b) return true;
  return (COMPATIBLE[a] ?? []).includes(b);
}

/** Every type a label could plausibly come back as, including its own. */
export function compatibleTypes(t: NodeType): NodeType[] {
  return [t, ...(COMPATIBLE[t] ?? [])];
}

/** Is `needle` a contiguous run of words inside `haystack`? */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((t) => t.length > 2));
}

/** Like tokens(), but keeps the short ones. Names are distinguished by them. */
function labelTokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

/** Jaccard overlap, 0..1. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface Candidate {
  type: NodeType;
  label: string;
  content: string;
}

export interface Match {
  node: MindNode;
  /** 0..1 — how sure the matcher is these are the same thing */
  strength: number;
  how: 'label' | 'alias' | 'containment' | 'content';
}

/**
 * The best existing node for a candidate, or null to create a new one.
 *
 * Ordered by how much the match is worth trusting, and it returns on the
 * first confident answer rather than scoring everything: an exact label match
 * is not improved on by anything further down.
 */
export function resolveNode(graph: MindGraph, c: Candidate): Match | null {
  const wanted = normalize(c.label);
  if (!wanted) return null;

  const pool = graph.nodes.filter((n) => typesCompatible(c.type, n.type));
  if (!pool.length) return null;

  // 1. the same name
  for (const n of pool) {
    if (normalize(n.label) === wanted) return { node: n, strength: 1, how: 'label' };
  }

  // 2. a name it has been called before
  for (const n of pool) {
    if (n.aliases.some((a) => normalize(a) === wanted)) {
      return { node: n, strength: 0.92, how: 'alias' };
    }
  }

  // 3. one name inside the other ("Berlin offer" / "the Berlin offer")
  //
  //    On WORD sequences, not substrings. As a substring "thing 1" sits
  //    inside "thing 10", and a version number or a year makes that a
  //    routine way to merge two things that are not the same.
  let best: Match | null = null;
  const wantedWords = wanted.split(' ');
  for (const n of pool) {
    const have = normalize(n.label);
    const haveWords = have.split(' ');
    if (wantedWords.length < 2 && haveWords.length < 2) continue;
    if (!containsSequence(haveWords, wantedWords) && !containsSequence(wantedWords, haveWords)) continue;
    const ratio =
      Math.min(haveWords.length, wantedWords.length) / Math.max(haveWords.length, wantedWords.length);
    const strength = 0.7 + 0.2 * ratio;
    if (!best || strength > best.strength) best = { node: n, strength, how: 'containment' };
  }
  if (best) return best;

  // 4. the same claim in other words
  //
  //    Content alone is not enough. "A distinct concept about topic 3" and
  //    "...about topic 7" share every word that survives tokenising, so a
  //    pure content match would fold a hundred separate things into one. The
  //    label has to agree too: mostly-content similarity, but nothing with an
  //    unrelated name can be rescued by generic phrasing.
  const ct = tokens(c.content);
  const cl = labelTokens(c.label);
  for (const n of pool) {
    // Label tokens keep numbers and short words: "Core 3" and "Core 4" differ
    // only there, and dropping them makes every version of a thing the same
    // thing. Half the name must agree before wording is even consulted.
    const labelScore = overlap(cl, labelTokens(n.label));
    if (labelScore < 0.5) continue;
    const score = 0.55 * labelScore + 0.45 * overlap(ct, tokens(n.content));
    if (score >= MATCH_THRESHOLD && (!best || score > best.strength)) {
      best = { node: n, strength: score, how: 'content' };
    }
  }
  return best;
}

/**
 * Does this candidate CONTRADICT what the matched node says, rather than
 * merely restating it?
 *
 * Deliberately conservative: this only reports a signal the extractor gave
 * us. Guessing contradiction from text alone produces false supersessions,
 * and a false supersession quietly rewrites somebody's history — the exact
 * failure the whole design exists to prevent. When unsure, say no; a genuine
 * change of position recurs and will be stated more plainly next time.
 */
export function looksLikeChange(c: Candidate & { replaces?: string }): boolean {
  return typeof c.replaces === 'string' && c.replaces.length > 0;
}
