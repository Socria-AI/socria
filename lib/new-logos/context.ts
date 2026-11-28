// lib/new-logos/context.ts — WHAT A CONVERSATION IS TOLD ABOUT ITS OBJECTIVE.
//
// A conversation placed in an objective, or related to one, is answered with that objective in view. The context is
// SELECTIVE and EXPLICIT: only what the person has put there —
//   • the objective itself (title, outcome, description) and the objectives above it, as a path;
//   • what sits directly in the objective's matrix: sub-objectives, questions, knowledge, decisions, artifacts;
//   • what is related, by a relation the person made, to the conversation or to the objective;
// never other conversations' messages, never the whole tree, never anything archived. Findings from other
// conversations arrive the way the person chose to keep them: as knowledge nodes, with their provenance said.
//
// The shape is the one the existing chat endpoint already accepts as `objective` (lib/logos6/objective.ts
// sanitizeObjectiveTurn), so no change to the assistant is needed: it is re-sanitised there like every other field.
// Decisions the person has not accepted are never given as decided — they are listed as undecided questions.
// Artifacts are said by what they hold and their shared values now (from the composition's structure, never a
// picture of it); the full description of one goes with a question asked about it (Point & Ask: compose.ts).

import { ancestorsOf, indexNodes } from './ops';
import type { NodeRow, RelationRow } from './model';
import { sanitizeComposition } from './primitives';
import { describeComposition, evaluateScope, summarize } from './compose';
import { formatNumber } from './expr';

export interface ContextTurn {
  objective: {
    goal: string;
    outcome?: string;
    source: 'stated';
    threads: string[];
    notes: { k: 'fact' | 'question'; t: string; at: number }[];
    set: number;
    edited: number;
  };
  work: {
    decisions: string[];
    assumptions: string[];
    questions: string[];
    resolved: string[];
    sources: string[];
    artifacts: string[];
    quizzes: never[];
    threads: string[];
    recent: string[];
    ideas: number;
    turns: number;
  };
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** What a knowledge node is, said with where it came from. */
function knowledgeLine(n: NodeRow): string {
  const o = n.provenance?.origin;
  const from = o === 'ai' ? ' (AI-generated)' : o === 'external' ? ` (source: ${n.provenance.source?.label || 'external'})` : ' (their own)';
  return cut(n.title, 70) + from;
}

/** What an artifact is, in a line: its title, what it is made of, and its shared values now. */
export function artifactLine(n: NodeRow): string {
  const c = sanitizeComposition(n.content);
  const vars = c.variables.slice(0, 4).map((v) => `${v.name} = ${v.kind === 'boolean' ? (v.value ? 'on' : 'off') : formatNumber(v.value)}`);
  return `${n.title} (${summarize(c).toLowerCase()}${vars.length ? `; ${vars.join(', ')}` : ''})`;
}

/**
 * What the assistant is told about an artifact a question is asked about (its "this"): what it is made of, then its
 * shared values and each primitive's state in reading order — from the composition's structure, not a picture.
 */
export function artifactFacts(n: NodeRow, max = 12): string[] {
  const c = sanitizeComposition(n.content);
  return [`An artifact made of ${summarize(c).toLowerCase()}`, ...describeComposition(c, evaluateScope(c), max - 1)];
}

/**
 * The context for a conversation, or null when it has none (it is not placed in or related to an objective).
 * `conversationId` is the canonical conversation's id; `turns` how many messages it holds.
 */
export function contextFor(nodes: NodeRow[], relations: RelationRow[], conversationId: string, turns: number): ContextTurn | null {
  const live = nodes.filter((n) => n.archived_at === null);
  const index = indexNodes(live);
  const conv = live.find((n) => n.type === 'conversation' && n.conversation_id === conversationId);
  if (!conv) return null;

  const touching = (id: string) =>
    relations
      .filter((r) => r.from_id === id || r.to_id === id)
      .map((r) => ({ r, other: index.get(r.from_id === id ? r.to_id : r.from_id) }))
      .filter((x): x is { r: RelationRow; other: NodeRow } => !!x.other);

  const container = conv.parent_id ? index.get(conv.parent_id) : undefined;
  const objective =
    (container?.type === 'objective' ? container : undefined) ?? touching(conv.id).find((x) => x.other.type === 'objective')?.other;
  if (!objective) return null;

  // in view: the objective's own matrix, and what is related to the conversation or the objective
  const inView = new Map<string, NodeRow>();
  for (const n of live) if (n.parent_id === objective.id && n.id !== conv.id) inView.set(n.id, n);
  for (const { other } of [...touching(conv.id), ...touching(objective.id)]) if (other.id !== objective.id && other.id !== conv.id) inView.set(other.id, other);
  const of = (t: NodeRow['type']) => [...inView.values()].filter((n) => n.type === t).sort((a, b) => a.position - b.position || a.created_at - b.created_at);

  const decisions = of('decision');
  const questions = of('question');
  const notes: ContextTurn['objective']['notes'] = [];
  const path = ancestorsOf(index, objective.id).filter((a) => a.type === 'objective');
  if (path.length) notes.push({ k: 'fact', t: cut(`This objective is part of: ${path.map((p) => p.title).join(' › ')}`, 220), at: objective.updated_at });
  if (objective.description) notes.push({ k: 'fact', t: cut(objective.description, 220), at: objective.updated_at });
  for (const { r, other } of touching(conv.id))
    if (other.type === 'question' && (r.kind === 'investigates' || r.kind === 'answers' || r.kind === 'related_to'))
      notes.push({ k: 'question', t: cut(`This conversation investigates: ${other.title}`, 220), at: other.updated_at });

  const outcome = str(objective.content?.outcome);
  return {
    objective: {
      goal: cut(objective.title, 100),
      ...(outcome ? { outcome: cut(outcome, 220) } : {}),
      source: 'stated',
      threads: of('objective').map((o) => cut(o.title, 60)).slice(0, 10),
      notes: notes.slice(0, 6),
      set: objective.created_at,
      edited: objective.updated_at,
    },
    work: {
      decisions: decisions
        .filter((d) => d.state === 'accepted')
        .map((d) => cut(str(d.content?.rationale) ? `${d.title} — ${str(d.content.rationale)}` : d.title, 90))
        .slice(0, 8),
      assumptions: [],
      questions: [
        ...questions.filter((q) => q.state === 'open' || q.state === 'exploring').map((q) => cut(q.title, 90)),
        ...decisions.filter((d) => d.state === 'proposed').map((d) => cut(`Undecided: ${d.title}`, 90)),
      ].slice(0, 6),
      resolved: questions
        .filter((q) => q.state === 'resolved')
        .map((q) => cut(str(q.content?.resolution) ? `${q.title} — ${str(q.content.resolution)}` : q.title, 90))
        .slice(0, 6),
      sources: of('knowledge').filter((k) => k.state !== 'superseded').map(knowledgeLine).slice(0, 10),
      artifacts: of('artifact').map((a) => cut(artifactLine(a), 90)).slice(0, 8),
      quizzes: [],
      threads: [],
      recent: [],
      ideas: 0,
      turns: Math.max(0, Math.floor(turns)),
    },
  };
}
