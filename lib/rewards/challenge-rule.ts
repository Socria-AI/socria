// lib/rewards/challenge-rule.ts
//
// THE 5-NODE CHALLENGE — what counts, decided from the map Logos stored.
//
//   Create a mind map with at least five meaningful, connected nodes in Socria
//   Logos and unlock seven days of Socria One.
//
// It is meant to be easy: one real line of thinking does it. So the rule asks
// for exactly three things, all read from the session as the server holds it
// (conversations.map and conversations.messages), never from anything the
// browser says about itself:
//
//   MEANINGFUL. A node's label has real content: letters (or, for a step of
//   working, numbers and an operator), not a placeholder ("New node",
//   "Untitled", "Idea 3"), and not the same words as another node. Labels are
//   compared after folding case, punctuation and a trailing number, so five
//   copies of one thought are one node.
//
//   CONNECTED. The five sit in one connected piece of the map — the edges
//   Logos drew between them, read in either direction. The central node is a
//   node like any other and counts toward the five.
//
//   THEIRS. Logos draws a map FROM the conversation, so the person's part is
//   what they said. A node counts when it came from them (no `origin`) or is a
//   suggestion of Socria's they chose to keep (`origin: 'socria'`); material
//   they attached ('source') and what the engine computed ('computed') can
//   connect the map but do not count toward the five. And the session must
//   hold a few words they wrote themselves — a starting card pressed and sent
//   unchanged is not their words (an edited one is).
//
// No minimum of branches, counterarguments or length; no waiting period; no
// model call. A historical map qualifies exactly as a new one does.
//
// PURE.

import { OPENINGS, MODEL_OPENING, SCENARIO_STARTS } from '../first-session';
import { ROLES } from '../onboarding-roles';

export interface ChallengeNode {
  id: string;
  label?: string;
  tex?: string;
  origin?: string;
}
export interface ChallengeEdge {
  from: string;
  to: string;
}
export interface ChallengeMsg {
  role: string;
  content: string;
}
export interface ChallengeSession {
  id: string;
  map: { nodes?: ChallengeNode[]; edges?: ChallengeEdge[] } | null;
  messages: ChallengeMsg[];
}

/** Labels that say nothing yet. Compared after normalising (see labelKey). */
const PLACEHOLDERS = new Set([
  'node', 'new node', 'untitled', 'untitled node', 'idea', 'new idea', 'main idea', 'central idea',
  'topic', 'new topic', 'main topic', 'central topic', 'placeholder', 'todo', 'tbd', 'text', 'label',
  'item', 'thing', 'things', 'something', 'stuff', 'test', 'testing', 'asdf', 'qwerty', 'lorem ipsum',
  'n a', 'na', 'none', 'empty', 'blank', 'question', 'answer', 'note', 'new note', 'root', 'center',
  'centre', 'child', 'branch', 'sub topic', 'subtopic', 'option', 'step', 'point', 'xxx', 'abc',
]);

/** Fold a label to what it says: case, accents' compatibility forms, punctuation, a trailing number. */
export function labelKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.normalize('NFKC').toLowerCase();
  // LaTeX-ish markup and math delimiters say nothing about distinctness
  s = s.replace(/\\[a-z]+/g, ' ').replace(/[$`]/g, ' ');
  s = s.replace(/[^\p{L}\p{N}=+\-*/^<>.]+/gu, ' ');
  // a full stop is punctuation unless it is a decimal point
  s = s.replace(/(?<!\p{N})\.|\.(?!\p{N})/gu, ' ').replace(/\s+/g, ' ').trim();
  // "Idea 3", "Option ii", "step 4." → the same as "idea", "option", "step". Not for a line of
  // working: "x = 4" and "x = 5" are different steps, and their numbers are the difference.
  if (!/[=+*/^<>]/.test(s)) s = s.replace(/(?:\s+|^)(?:\d+|[ivx]{1,5})\.?$/u, '').trim();
  return s;
}

/** Whether a label has content enough to be a thought. */
export function meaningfulLabel(raw: unknown): boolean {
  const key = labelKey(raw);
  if (key.length < 3) return false;
  if (PLACEHOLDERS.has(key)) return false;
  const letters = (key.match(/\p{L}/gu) || []).length;
  const digits = /\p{N}/u.test(key);
  // one character repeated ("aaaa", "....") is not a label
  if (/^(.)\1+$/u.test(key.replace(/\s/g, ''))) return false;
  if (letters >= 2) return true;
  // a step of working: "2x + 6 = 14" has one letter, digits and an operator
  return digits && /[=+\-*/^<>]/.test(key) && key.replace(/\s/g, '').length >= 3;
}

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Every starting text Socria puts in somebody's box — sent unchanged, they are not that person's words. */
export const STARTER_TEXTS: ReadonlySet<string> = new Set(
  [
    ...OPENINGS.map((o) => o.message),
    MODEL_OPENING.message,
    ...Object.values(SCENARIO_STARTS),
    ...ROLES.flatMap((r) => Object.values(r.ways).map((w) => w.eg)),
  ].map(norm)
);

export function isStarterText(text: string): boolean {
  return STARTER_TEXTS.has(norm(text));
}

/** Words the person wrote themselves in a conversation: their messages, minus starters sent unchanged. */
export function ownWords(messages: ChallengeMsg[]): number {
  let n = 0;
  for (const m of messages ?? []) {
    if (!m || m.role !== 'user' || typeof m.content !== 'string') continue;
    if (isStarterText(m.content)) continue;
    n += (m.content.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  }
  return n;
}

const counts = (n: ChallengeNode) => n.origin === undefined || n.origin === null || n.origin === 'socria';

/**
 * The size of the largest connected piece of the map, in distinct meaningful
 * nodes that are the person's. Nodes with the same words are one node; the
 * person's nodes may be connected through attached or computed ones.
 */
export function connectedCount(map: ChallengeSession['map']): number {
  const nodes = Array.isArray(map?.nodes) ? map!.nodes! : [];
  const edges = Array.isArray(map?.edges) ? map!.edges! : [];
  // one representative per distinct label: duplicates merge into the first
  const rep = new Map<string, string>(); // node id → representative id
  const byKey = new Map<string, string>(); // label key → representative id
  const counted = new Set<string>(); // representatives that count toward the five
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string') continue;
    const label = typeof n.label === 'string' && n.label.trim() ? n.label : n.tex;
    if (!meaningfulLabel(label)) continue;
    const key = labelKey(label);
    const r = byKey.get(key) ?? n.id;
    if (!byKey.has(key)) byKey.set(key, n.id);
    rep.set(n.id, r);
    if (counts(n)) counted.add(r);
  }
  // union–find over representatives, edges in either direction
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  for (const e of edges) {
    const a = e && typeof e.from === 'string' ? rep.get(e.from) : undefined;
    const b = e && typeof e.to === 'string' ? rep.get(e.to) : undefined;
    if (!a || !b || a === b) continue;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const size = new Map<string, number>();
  for (const r of counted) {
    const root = find(r);
    size.set(root, (size.get(root) ?? 0) + 1);
  }
  let best = 0;
  for (const v of size.values()) best = Math.max(best, v);
  return best;
}

export interface ChallengeEvaluation {
  /** the best progress any one of their maps shows, capped at the target */
  progress: number;
  target: number;
  qualifies: boolean;
  /** the session that comes closest, so the UI can say which map */
  sessionId: string | null;
  /**
   * A map that has the nodes but none of the person's own words — one sent
   * from a starting card unchanged. The UI says what to do about it.
   */
  needsOwnWords: boolean;
}

export function evaluateChallenge(
  sessions: ChallengeSession[],
  cfg: { nodes: number; minOwnWords: number }
): ChallengeEvaluation {
  let best = 0;
  let bestId: string | null = null;
  let blockedBest = 0;
  for (const s of sessions ?? []) {
    if (!s || !s.map) continue;
    const n = connectedCount(s.map);
    if (n === 0) continue;
    if (ownWords(s.messages) >= cfg.minOwnWords) {
      if (n > best) {
        best = n;
        bestId = s.id;
      }
    } else blockedBest = Math.max(blockedBest, n);
  }
  return {
    progress: Math.min(best, cfg.nodes),
    target: cfg.nodes,
    qualifies: best >= cfg.nodes,
    sessionId: bestId,
    needsOwnWords: best < cfg.nodes && blockedBest > best,
  };
}
