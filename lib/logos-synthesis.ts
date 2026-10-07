// lib/logos-synthesis.ts
//
// SYNTHESIS — STRUCTURE → UNDERSTANDING.
//
// Logos turns a conversation into structure. After twenty minutes of that, the
// person needs the other half: to step back and be shown what their thinking
// has become. Not a summary of the chat — the chat is evidence — but a
// reading of the CANONICAL STATE they built: the objects, what kind of thing
// each is, what it does in the shape, how it connects, what is supported,
// what is still open, what pulls against what.
//
// THREE FUNCTIONS, KEPT APART BECAUSE THEY ARE NOT EQUALLY CERTAIN:
//
//   REFLECT   what the structure holds — established, taking shape, open
//   CRITIQUE  where it is weak — a KNOWN PROBLEM the structure itself shows,
//             a RISK worth questioning, a SUGGESTION
//   EXTEND    possibilities the structure does not yet contain
//
// THE DIVISION OF LABOUR.
//
//   digest()            — pure, deterministic. Reads canonical state into a
//                         compact brief: counts, the shape and its spine,
//                         what is established, what is open, the tensions,
//                         and FINDINGS the structure proves on its own (a
//                         contradiction, an unsupported assumption, a branch
//                         with no condition). Grounded in ids.
//   synthesisPrompt()   — asks a model to write the editorial layer over the
//                         digest: the heading, the paragraph, its reading.
//   enforce()           — the model is never trusted on epistemics. Nothing
//                         it calls established may cite an open node; a
//                         "problem" it cannot ground becomes a risk; a
//                         reference to an object that does not exist is
//                         dropped; a possibility the map already holds is
//                         dropped. Lengths are capped whatever the map size.
//   fromStructure()     — the whole synthesis from the digest alone, for when
//                         no model is reachable. Plainer, never wrong.
//
// SYNTHESIS NEVER MUTATES THE MODEL. Nothing here writes to a map. A
// possibility or a principle enters the map only when the person takes it,
// and then it carries `origin: 'socria'` for good.
//
// PURE. No React, no network.

import { objectHistoryLines } from './objects';
import type { LogosEdge, LogosNode, ThinkingMap } from './logos';
import {
  attachmentsOf,
  GRAMMARS,
  orderSpine,
  spineOf,
  transitionsOf,
  type GrammarId,
} from './representation';
import { activeDoc, modelFor } from './model/docs';

// ── what a synthesis is ─────────────────────────────────────────────

export type ScopeKind = 'workspace' | 'selection';

export interface Ref {
  text: string;
  /** the objects this rests on; empty means it is Socria's own reading */
  refs: string[];
  /** structure: read from the map; socria: Socria's interpretation */
  by: 'structure' | 'socria';
}

export type CritiqueLevel = 'problem' | 'risk' | 'suggestion';
export interface Critique {
  level: CritiqueLevel;
  text: string;
  refs: string[];
}

export interface Possibility {
  id: string;
  /** a short node label, if the person takes it onto the map */
  label: string;
  /** the semantic type it would carry */
  type: LogosNode['type'];
  /** one sentence: what it is and why it might matter */
  text: string;
}

export type NextId = 'challenge' | 'resolve' | 'tension' | 'compare' | 'evidence' | 'flow' | 'changed' | 'continue';
export interface Next {
  id: NextId;
  label: string;
  /** what is said when it is taken; empty for 'continue' */
  say: string;
}

export type SectionId = 'established' | 'emerging' | 'tensions' | 'unresolved' | 'reading';

export interface Synthesis {
  v: 1;
  id: string;
  at: number;
  scope: { kind: ScopeKind; ids?: string[] };
  /** the editorial heading */
  title: string;
  /** a short paragraph: what this amounts to */
  lede: string;
  /** the shape, when it has one worth drawing */
  shape?: { kind: GrammarId; label: string; layers: string[][] };
  sections: { id: SectionId; items: Ref[] }[];
  critique: Critique[];
  possibilities: Possibility[];
  /** what changed since the last synthesis, when there was one */
  change?: { said: string; facts: string[] };
  next: Next[];
  /** "7 objects · 2 steps · 4 ideas" */
  counts: string;
  /** the model wrote the editorial layer, or the structure did */
  source: 'model' | 'structure';
  /** the state this was read from — what the next synthesis compares against */
  snapshot: Snapshot;
  /** the person's choices on the possibilities and readings, by id */
  taken?: Record<string, 'added' | 'dismissed'>;
}

/** A compact copy of canonical state, kept with a synthesis so the next one can say what changed. */
export interface Snapshot {
  at: number;
  building?: GrammarId;
  nodes: { id: string; label: string; type: string; role?: string; status?: string }[];
  edges: { from: string; to: string; relation: string }[];
}

export const SYNTH_MARK = '[Socria synthesis]';

// ── the digest: canonical state, read in code ──────────────────────

export interface DigestNode {
  id: string;
  label: string;
  type: string;
  role?: string;
  status: string;
  origin?: string;
  /** how many things support it, and pull against it */
  support: number;
  against: number;
  degree: number;
  /** in the shape, a detail of the shape, or connected to nothing in it */
  place: 'spine' | 'detail' | 'other';
}

export interface Finding {
  kind:
    | 'contradiction'
    | 'unsupported-assumption'
    | 'claim-without-evidence'
    | 'branch-without-condition'
    | 'dead-end'
    | 'disconnected'
    | 'single-option'
    | 'no-criteria'
    | 'constraint-against-goal';
  level: CritiqueLevel;
  text: string;
  refs: string[];
}

export interface Digest {
  scope: ScopeKind;
  topic?: string;
  building?: GrammarId;
  also?: GrammarId[];
  nodes: DigestNode[];
  edges: { from: string; to: string; relation: string; when?: string }[];
  /** the spine in order, as labels, for an ordered shape */
  layers?: string[][];
  established: string[];
  candidates: string[];
  open: string[];
  tensions: { a: string; b?: string; label: string }[];
  values: string[];
  constraints: string[];
  findings: Finding[];
  counts: string;
  /** the model the session holds, if any */
  model?: { title: string; params: string[]; equations: string[]; assumptions: string[] };
  /**
   * THE WORK DONE ON OBJECTS — from their transformation history, not from
   * the chat: every operation, who chose it, what the computation showed, and
   * where each object stands (lib/objects/).
   */
  work?: { did: string[]; open: string[] };
  change?: Change;
}

export interface Change {
  added: string[];
  removed: string[];
  strengthened: string[];
  weakened: string[];
  resolved: string[];
  reopened: string[];
  revised: string[];
  newTensions: string[];
  retyped: string[];
  shape?: { from?: string; to?: string };
}

const PLURAL: Record<string, string> = {
  idea: 'ideas', step: 'steps', value: 'values', constraint: 'constraints', question: 'questions', claim: 'claims',
  evidence: 'pieces of evidence', assumption: 'assumptions', decision: 'decisions', goal: 'goals', tension: 'tensions',
  option: 'options', criterion: 'criteria', branch: 'branches', state: 'states', event: 'events', action: 'actions',
  milestone: 'milestones', hypothesis: 'hypotheses', method: 'methods', finding: 'findings', concept: 'concepts',
  counterpoint: 'counterpoints', source: 'sources', consequence: 'consequences', belief: 'beliefs', equation: 'equations',
  given: 'givens', unknown: 'unknowns', alternative: 'alternatives', dimension: 'dimensions', objection: 'objections',
  component: 'components', variable: 'variables', parameter: 'parameters', start: 'starts', end: 'ends', period: 'periods',
};
const plural = (word: string, n: number) => (n === 1 ? word : PLURAL[word] ?? `${word}s`);

const OPEN_KINDS = new Set(['question', 'unknown', 'conjecture']);
const CANDIDATE_TYPES = new Set(['idea', 'decision', 'conjecture']);
const CANDIDATE_ROLES = new Set(['option', 'alternative', 'hypothesis', 'idea']);
/** What a word says about a node's standing, read from its status alone. */
const settled = (n: Pick<DigestNode, 'status'>) => n.status === 'supported' || n.status === 'resolved';

/** The objects a scope covers, and the edges among them. */
function scoped(map: ThinkingMap, ids?: readonly string[]): ThinkingMap {
  if (!ids?.length) return map;
  const keep = new Set(ids);
  return { ...map, nodes: map.nodes.filter((n) => keep.has(n.id)), edges: map.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
}

export function snapshotOf(map: ThinkingMap, at = Date.now()): Snapshot {
  return {
    at,
    ...(map.building ? { building: map.building.kind } : {}),
    nodes: map.nodes.slice(0, 120).map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      ...(n.role ? { role: n.role } : {}),
      ...(n.status && n.status !== 'open' ? { status: n.status } : {}),
    })),
    edges: map.edges.slice(0, 200).map((e) => ({ from: e.from, to: e.to, relation: e.relation })),
  };
}

/** What changed between two states, in terms of thinking rather than of nodes. */
export function changeBetween(before: Snapshot, after: ThinkingMap): Change | null {
  const was = new Map(before.nodes.map((n) => [n.id, n]));
  const now = new Map(after.nodes.map((n) => [n.id, n]));
  const label = (id: string) => now.get(id)?.label ?? was.get(id)?.label ?? id;
  const c: Change = { added: [], removed: [], strengthened: [], weakened: [], resolved: [], reopened: [], revised: [], newTensions: [], retyped: [] };
  for (const n of after.nodes) {
    const o = was.get(n.id);
    if (!o) {
      // Matched by wording too: an extractor may re-key a node it kept.
      if (!before.nodes.some((b) => b.label.toLowerCase() === n.label.toLowerCase())) c.added.push(n.label);
      continue;
    }
    const s0 = o.status ?? 'open';
    const s1 = n.status ?? 'open';
    if (s0 !== s1) {
      if (s1 === 'resolved') c.resolved.push(n.label);
      else if (s1 === 'supported') c.strengthened.push(n.label);
      else if (s1 === 'revised') c.revised.push(n.label);
      else if (s1 === 'open' && (s0 === 'resolved' || s0 === 'supported')) c.reopened.push(n.label);
    }
    if (o.type !== n.type) c.retyped.push(`${n.label} (${o.type} → ${n.type})`);
  }
  for (const o of before.nodes) {
    if (!now.has(o.id) && !after.nodes.some((n) => n.label.toLowerCase() === o.label.toLowerCase())) c.removed.push(o.label);
  }
  const key = (e: { from: string; to: string; relation: string }) => `${e.from}>${e.to}:${e.relation}`;
  const oldEdges = new Set(before.edges.map(key));
  for (const e of after.edges) {
    if (oldEdges.has(key(e))) continue;
    if (e.relation === 'conflicts') c.newTensions.push(`${label(e.from)} ↔ ${label(e.to)}`);
    if (e.relation === 'supports' && was.has(e.to)) c.strengthened.push(label(e.to));
  }
  for (const e of before.edges) {
    if (e.relation === 'supports' && !after.edges.some((x) => key(x) === key(e)) && now.has(e.to)) c.weakened.push(label(e.to));
  }
  if (before.building !== after.building?.kind && (before.building || after.building)) {
    c.shape = { ...(before.building ? { from: before.building } : {}), ...(after.building ? { to: after.building.kind } : {}) };
  }
  for (const k of Object.keys(c) as (keyof Change)[]) {
    const v = c[k];
    if (Array.isArray(v)) (c as any)[k] = [...new Set(v)].slice(0, 8);
  }
  const any = (Object.values(c) as unknown[]).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
  return any ? c : null;
}

/**
 * READ THE CANONICAL STATE. Everything a synthesis may say about the person's
 * thinking comes from here; the conversation is never consulted.
 */
export function digest(map: ThinkingMap, opts: { scope?: ScopeKind; ids?: string[]; since?: Snapshot | null } = {}): Digest {
  const work = objectHistoryLines(map.objects, false);
  const scope: ScopeKind = opts.scope === 'selection' && opts.ids?.length ? 'selection' : 'workspace';
  const m = scoped(map, scope === 'selection' ? opts.ids : undefined);
  const kind = map.building?.kind;
  const ordered = !!kind && GRAMMARS[kind].ordered;
  const spine = scope === 'workspace' ? spineOf(m, ordered ? kind : undefined) : new Set<string>();
  const hasOrder = spine.size >= 2 && transitionsOf(m, spine).length >= 1;
  const detailOf = hasOrder ? attachmentsOf(m, spine) : new Map<string, LogosNode[]>();
  const details = new Set([...detailOf.values()].flat().map((n) => n.id));

  const support = new Map<string, number>();
  const against = new Map<string, number>();
  const degree = new Map<string, number>();
  for (const e of m.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    if (e.relation === 'supports' || e.relation === 'justifies') support.set(e.to, (support.get(e.to) ?? 0) + 1);
    if (e.relation === 'conflicts') {
      against.set(e.to, (against.get(e.to) ?? 0) + 1);
      against.set(e.from, (against.get(e.from) ?? 0) + 1);
    }
  }
  const nodes: DigestNode[] = m.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
    ...(n.role ? { role: n.role } : {}),
    status: n.status ?? 'open',
    ...((n as LogosNode & { origin?: string }).origin ? { origin: (n as LogosNode & { origin?: string }).origin } : {}),
    support: support.get(n.id) ?? 0,
    against: against.get(n.id) ?? 0,
    degree: degree.get(n.id) ?? 0,
    place: spine.has(n.id) ? 'spine' : details.has(n.id) ? 'detail' : 'other',
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const L = (id: string) => byId.get(id)?.label ?? id;

  const established = nodes.filter((n) => settled(n) && n.type !== 'question').map((n) => n.id);
  const open = nodes
    .filter((n) => (OPEN_KINDS.has(n.type) || n.role === 'question') && n.status !== 'resolved' && n.status !== 'revised')
    .map((n) => n.id);
  const candidates = nodes
    .filter((n) => !settled(n) && n.status !== 'revised' && (CANDIDATE_TYPES.has(n.type) || CANDIDATE_ROLES.has(n.role ?? '')) && !open.includes(n.id) && n.place !== 'spine')
    .map((n) => n.id);
  const values = nodes.filter((n) => n.type === 'value' || n.role === 'value' || n.role === 'criterion').map((n) => n.id);
  const constraints = nodes.filter((n) => n.type === 'constraint' || n.role === 'constraint').map((n) => n.id);

  const tensions: Digest['tensions'] = [];
  for (const e of m.edges) {
    if (e.relation === 'conflicts') tensions.push({ a: e.from, b: e.to, label: `${L(e.from)} pulls against ${L(e.to)}` });
  }
  for (const n of nodes) {
    if (n.type === 'tension' && n.status !== 'resolved') tensions.push({ a: n.id, label: n.label });
  }

  // ── FINDINGS: what the structure itself shows, needing no interpretation ──
  const findings: Finding[] = [];
  for (const e of m.edges) {
    if (e.relation !== 'conflicts') continue;
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    if (settled(a) && settled(b)) {
      findings.push({ kind: 'contradiction', level: 'problem', text: `“${a.label}” and “${b.label}” are both treated as settled, and the map says they pull against each other.`, refs: [a.id, b.id] });
    } else if ((a.type === 'constraint' || a.role === 'constraint') && (b.type === 'goal' || b.role === 'goal' || b.type === 'value')) {
      findings.push({ kind: 'constraint-against-goal', level: 'problem', text: `The constraint “${a.label}” works against “${b.label}”, something you want.`, refs: [a.id, b.id] });
    }
  }
  for (const n of nodes) {
    if (n.type === 'assumption' && n.support === 0 && n.status === 'open' && n.degree > 0) {
      findings.push({ kind: 'unsupported-assumption', level: 'problem', text: `“${n.label}” is an assumption with nothing under it yet.`, refs: [n.id] });
    }
    if ((n.type === 'claim' || n.role === 'claim') && n.support === 0 && n.status === 'open' && (kind === 'argument' || kind === 'research')) {
      findings.push({ kind: 'claim-without-evidence', level: 'problem', text: `The claim “${n.label}” has no evidence attached.`, refs: [n.id] });
    }
  }
  if (hasOrder) {
    const out = new Map<string, LogosEdge[]>();
    for (const e of transitionsOf(m, spine)) out.set(e.from, [...(out.get(e.from) ?? []), e]);
    for (const [from, es] of out) {
      if (es.length >= 2 && es.some((e) => !e.when)) {
        findings.push({ kind: 'branch-without-condition', level: 'risk', text: `The path divides at “${L(from)}”, but not every way out says when it is taken.`, refs: [from, ...es.map((e) => e.to)] });
      }
    }
    const layersIds = orderSpine(m, spine);
    const last = new Set(layersIds[layersIds.length - 1] ?? []);
    for (const id of spine) {
      const n = byId.get(id)!;
      if (!out.has(id) && !last.has(id) && n.role !== 'end') {
        findings.push({ kind: 'dead-end', level: 'risk', text: `Nothing follows “${n.label}” — is it an end, or a missing transition?`, refs: [id] });
      }
    }
  }
  const disconnected = nodes.filter((n) => n.degree === 0);
  if (disconnected.length && m.nodes.length >= 4) {
    findings.push({
      kind: 'disconnected',
      level: 'risk',
      text: `${disconnected.length === 1 ? `“${disconnected[0].label}” is` : `${disconnected.length} objects are`} not connected to anything else yet.`,
      refs: disconnected.slice(0, 6).map((n) => n.id),
    });
  }
  if (kind === 'decision' || kind === 'comparison') {
    const options = nodes.filter((n) => n.role === 'option' || n.role === 'alternative' || (n.type === 'decision' && n.role !== 'branch'));
    if (options.length === 1) findings.push({ kind: 'single-option', level: 'risk', text: `Only one option is on the table: “${options[0].label}”. A choice needs something to choose against.`, refs: [options[0].id] });
    if (options.length >= 2 && !values.length) findings.push({ kind: 'no-criteria', level: 'problem', text: 'The options are there, but nothing says what they should be judged on.', refs: options.map((o) => o.id).slice(0, 4) });
  }

  // ── counts, by what things DO when they have a role, else by what they are ──
  const tally = new Map<string, number>();
  for (const n of nodes) {
    const k = n.role && n.role !== 'note' ? n.role : n.type;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const parts = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${v} ${plural(k, v)}`);
  const counts = [`${nodes.length} ${nodes.length === 1 ? 'object' : 'objects'}`, ...parts].join(' · ');

  let model: Digest['model'];
  const doc = map.models ? activeDoc(map.models) ?? map.models.docs[map.models.docs.length - 1] ?? null : null;
  if (doc && scope === 'workspace') {
    try {
      const md = modelFor(doc);
      model = {
        title: md.title,
        params: (md.params ?? []).slice(0, 8).map((p) => `${p.label ?? p.id} = ${p.value}`),
        equations: (md.equations ?? []).slice(0, 4),
        assumptions: (md.assumptions ?? []).slice(0, 4),
      };
    } catch {}
  }

  const change = scope === 'workspace' && opts.since ? changeBetween(opts.since, map) ?? undefined : undefined;

  return {
    scope,
    ...(map.ask?.topic ? { topic: String(map.ask.topic).slice(0, 80) } : {}),
    ...(kind ? { building: kind } : {}),
    ...(map.building?.also?.length ? { also: map.building.also } : {}),
    nodes,
    edges: m.edges.map((e) => ({ from: e.from, to: e.to, relation: e.relation, ...(e.when ? { when: e.when } : {}) })),
    ...(hasOrder ? { layers: orderSpine(m, spine).map((l) => l.map(L)) } : {}),
    established,
    candidates,
    open,
    tensions: tensions.slice(0, 8),
    values,
    constraints,
    findings: findings.slice(0, 8),
    counts,
    ...(model ? { model } : {}),
    ...(work.did.length || work.open.length ? { work: { did: work.did.slice(-8), open: work.open.slice(0, 4) } } : {}),
    ...(change ? { change } : {}),
  };
}

// ── what a model is asked ──────────────────────────────────────────

/** The most load-bearing objects first, so a 100-node map still fits in a brief. */
function ranked(d: Digest, cap = 60): DigestNode[] {
  const keep = new Set([...d.established, ...d.open, ...d.values, ...d.constraints, ...d.tensions.flatMap((t) => [t.a, t.b ?? ''])]);
  return [...d.nodes]
    .sort((a, b) => Number(keep.has(b.id)) - Number(keep.has(a.id)) || Number(b.place === 'spine') - Number(a.place === 'spine') || b.degree - a.degree)
    .slice(0, cap);
}

export function synthesisPrompt(d: Digest, context: string): string {
  const shown = ranked(d);
  const ids = new Set(shown.map((n) => n.id));
  const line = (n: DigestNode) =>
    `  ${n.id} [${n.type}${n.role && n.role !== n.type ? `, role ${n.role}` : ''}${n.status !== 'open' ? `, ${n.status}` : ''}${n.support ? `, ${n.support} supporting` : ''}${n.against ? `, ${n.against} against` : ''}${n.origin === 'socria' ? ', suggested by Socria' : ''}${n.place === 'detail' ? ', detail of a step' : ''}] ${n.label}`;
  const grammar = d.building ? GRAMMARS[d.building] : null;
  return `You write a SYNTHESIS of a person's thinking in Logos. You never talk to them directly; you write a brief they read.

WHAT YOU ARE SYNTHESISING is the structure they have built — below — not the conversation. The conversation excerpt at the end is evidence for what the structure means; it is never the subject, and nothing may be stated as their thinking that the structure does not hold.

${d.scope === 'selection' ? `SCOPE: only the ${d.nodes.length} objects they selected. Say what these amount to TOGETHER — how they relate, whether they compete, complement or depend on one another.` : 'SCOPE: the whole workspace.'}
${grammar ? `WHAT THEY ARE BUILDING: ${grammar.label.toLowerCase()} — ${grammar.builds}.${d.also?.length ? ` Also present: ${d.also.join(', ')}.` : ''}` : 'WHAT THEY ARE BUILDING: not yet clear from the structure.'}
${d.topic ? `SUBJECT: ${d.topic}` : ''}
${d.layers ? `THE SHAPE, IN ORDER: ${d.layers.map((l) => l.join(' | ')).join(' → ')}` : ''}

OBJECTS (${d.counts}${shown.length < d.nodes.length ? `; the ${shown.length} most load-bearing shown` : ''}):
${shown.map(line).join('\n')}

${d.work ? `WORK DONE ON THE OBJECTS THEMSELVES (computed by the workspace; who chose each step is recorded — say it as theirs when it was theirs):\n${d.work.did.map((x) => `  ${x}`).join('\n')}${d.work.open.length ? `\nWhere the objects stand: ${d.work.open.join('; ')}` : ''}\n` : ''}
RELATIONSHIPS:
${d.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).slice(0, 80).map((e) => `  ${e.from} --${e.relation}${e.when ? ` [when ${e.when}]` : ''}--> ${e.to}`).join('\n') || '  (none)'}

WHAT THE STRUCTURE ALREADY SHOWS (computed, certain):
${d.findings.map((f) => `  - ${f.level.toUpperCase()}: ${f.text} [${f.refs.join(', ')}]`).join('\n') || '  (nothing)'}
${d.model ? `\nTHE MODEL THEY BUILT: ${d.model.title}. ${d.model.equations.length ? `Equations: ${d.model.equations.join('; ')}. ` : ''}${d.model.params.length ? `Parameters: ${d.model.params.join(', ')}. ` : ''}${d.model.assumptions.length ? `It assumes: ${d.model.assumptions.join('; ')}.` : ''}` : ''}
${d.change ? `\nSINCE THE LAST SYNTHESIS: ${JSON.stringify(d.change)}` : ''}

HOW TO READ TYPES AND ROLES — they mean different things, never list them as equals:
- steps, states, branches, events, actions are the SHAPE — what happens, in what order
- values and criteria say what the shape should optimise for
- constraints limit what designs are acceptable
- ideas, options and hypotheses are CANDIDATES — they are not decisions until the structure says so
- questions, unknowns and open tensions are UNRESOLVED and stay unresolved
- status "supported" or "resolved" is the ONLY thing that makes something established

EPISTEMIC HONESTY — beautiful is not the same as coherent:
- Never turn an idea into a decision, a hypothesis into a fact, a question into an assumption, a possible step into a committed one.
- If something is weakly supported, say so. If two parts conflict, name the tension. If the structure does not justify a conclusion, do not manufacture one.
- Your own reading (a principle two values jointly suggest, what the direction favours) goes ONLY in "reading", with the ids it rests on. Never present it as theirs.
- Disagree where there is a real reason: if the structure works against its own stated values or constraints, say so plainly. Do not flatter. Do not invent criticism to look sharp.

CRITIQUE LEVELS — never the same certainty:
- "problem": the structure itself is contradictory or unsupported (cite the ids — the computed findings above are problems)
- "risk": something reasonable to question
- "suggestion": an improvement
Domain matters: a process may miss a step, a failure state, a transition; a decision may miss an alternative or a criterion; an argument may ignore a counterargument; research may have a confound or an untested alternative hypothesis; a model may miss a variable or rest on an unsupported parameter.

POSSIBILITIES — what the structure does not contain and might: at most 3, each one genuinely useful, each phrased as a possibility or a question, never a verdict. None if nothing is worth adding.

CONCISION: this compresses. Each item one short line. No section longer than 4 items. The paragraph is 2–3 sentences. Leave a section out rather than fill it.

Return ONLY JSON:
{
  "title": "a short editorial heading in their terms, e.g. 'Your onboarding direction' — never 'Summary'",
  "lede": "2–3 sentences: what this thinking currently amounts to, including its central tension if there is one",
  "established": [{"text": "…", "refs": ["id"]}],
  "emerging": [{"text": "…", "refs": ["id"]}],
  "tensions": [{"text": "…", "refs": ["id"]}],
  "unresolved": [{"text": "a question, phrased as one", "refs": ["id"]}],
  "reading": [{"text": "Socria's interpretation", "refs": ["id"]}],
  "critique": [{"level": "problem|risk|suggestion", "text": "…", "refs": ["id"]}],
  "possibilities": [{"label": "2–5 word node label", "type": "idea|question|step|constraint|value|goal|assumption|evidence", "text": "one sentence"}],
  ${d.change ? '"change": "one or two sentences on how the thinking MOVED since the last synthesis — the meaning of the change, not a count. Only what the facts support.",\n  ' : ''}"next": ["two or three of: challenge, resolve, tension, compare, evidence, flow — the moves that actually follow"]
}

CONVERSATION EXCERPT (evidence only):
${context || '(none)'}`;
}

// ── enforcement: the model is never trusted on epistemics ──────────

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const LIMIT = { title: 70, lede: 460, item: 170, items: 4, critique: 4, possibilities: 3 };
const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const POSSIBILITY_TYPES = new Set(['idea', 'question', 'step', 'constraint', 'value', 'goal', 'assumption', 'evidence', 'milestone', 'concept']);

function refsOf(raw: unknown, d: Digest): string[] {
  const ids = new Set(d.nodes.map((n) => n.id));
  return (Array.isArray(raw) ? raw : []).filter((r): r is string => typeof r === 'string' && ids.has(r)).slice(0, 6);
}

function items(raw: unknown, d: Digest, keep: (refs: string[]) => boolean): Ref[] {
  return (Array.isArray(raw) ? raw : [])
    .map((x: any) => {
      const text = clip(x?.text, LIMIT.item);
      const refs = refsOf(x?.refs, d);
      return text ? { text, refs, by: refs.length ? ('structure' as const) : ('socria' as const) } : null;
    })
    .filter((x): x is Ref => !!x && keep(x.refs))
    .slice(0, LIMIT.items);
}

/**
 * THE MODEL'S DRAFT, HELD TO THE STRUCTURE. Whatever it wrote:
 * - an "established" item must rest only on settled objects; otherwise it
 *   moves to "taking shape" (if grounded) or is dropped;
 * - "taking shape" must be grounded;
 * - a "problem" it cannot ground in a computed finding becomes a risk;
 * - the computed findings are always there, as problems or risks;
 * - a possibility the map already holds is dropped;
 * - next moves are only ones that apply, at most three.
 */
export function enforce(raw: any, d: Digest, base: Pick<Synthesis, 'id' | 'at' | 'scope' | 'snapshot'>): Synthesis {
  const fallback = fromStructure(d, base);
  if (!raw || typeof raw !== 'object') return fallback;
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const isSettled = (id: string) => {
    const n = byId.get(id);
    return !!n && settled(n) && n.type !== 'question';
  };

  const claimedEstablished = items(raw.established, d, () => true);
  const established = claimedEstablished.filter((r) => r.refs.length && r.refs.every(isSettled));
  const demoted = claimedEstablished.filter((r) => r.refs.length && !r.refs.every(isSettled));
  const emerging = [...items(raw.emerging, d, (refs) => refs.length > 0), ...demoted].slice(0, LIMIT.items);
  const tensions = items(raw.tensions, d, (refs) => refs.length > 0 || d.tensions.length > 0);
  const unresolved = items(raw.unresolved, d, () => true).map((r) => ({ ...r, text: /\?$/.test(r.text) ? r.text : r.text }));
  const reading = items(raw.reading, d, () => true).map((r) => ({ ...r, by: 'socria' as const }));

  const grounded = new Set(d.findings.map((f) => f.refs.slice().sort().join(',')));
  const fromModel: Critique[] = (Array.isArray(raw.critique) ? raw.critique : [])
    .map((x: any) => {
      const text = clip(x?.text, LIMIT.item);
      const refs = refsOf(x?.refs, d);
      let level: CritiqueLevel = x?.level === 'problem' || x?.level === 'risk' || x?.level === 'suggestion' ? x.level : 'risk';
      // A KNOWN PROBLEM is one the structure shows. Anything else is a risk.
      if (level === 'problem' && !(refs.length && grounded.has(refs.slice().sort().join(',')))) level = 'risk';
      return text ? { level, text, refs } : null;
    })
    .filter((x: Critique | null): x is Critique => !!x);
  const critique = dedupeCritique([...d.findings.map((f) => ({ level: f.level, text: f.text, refs: f.refs })), ...fromModel]).slice(0, LIMIT.critique);

  const existing = new Set(d.nodes.map((n) => keyOf(n.label)));
  const possibilities: Possibility[] = (Array.isArray(raw.possibilities) ? raw.possibilities : [])
    .map((x: any, i: number) => {
      const label = clip(x?.label, 60);
      const text = clip(x?.text, LIMIT.item);
      const type = POSSIBILITY_TYPES.has(x?.type) ? x.type : 'idea';
      return label && text && !existing.has(keyOf(label)) ? { id: `p${i + 1}`, label, type, text } : null;
    })
    .filter((x: Possibility | null): x is Possibility => !!x)
    .slice(0, LIMIT.possibilities);

  const sections: Synthesis['sections'] = [
    { id: 'established' as const, items: established },
    { id: 'emerging' as const, items: emerging },
    { id: 'tensions' as const, items: tensions },
    { id: 'unresolved' as const, items: unresolved },
    { id: 'reading' as const, items: reading },
  ].filter((s) => s.items.length);

  const title = clip(raw.title, LIMIT.title);
  const lede = clip(raw.lede, LIMIT.lede);
  if (!title || !lede || !sections.length) return { ...fallback, critique: critique.length ? critique : fallback.critique, possibilities };

  const asked = (Array.isArray(raw.next) ? raw.next : []).filter((x: unknown): x is NextId => typeof x === 'string');
  return {
    ...fallback,
    title,
    lede,
    sections,
    critique,
    possibilities,
    ...(fallback.change ? { change: { ...fallback.change, said: clip(raw.change, 320) || fallback.change.said } } : {}),
    next: chooseNext(d, asked),
    source: 'model',
  };
}

function dedupeCritique(list: Critique[]): Critique[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = c.refs.length ? `${c.level}:${c.refs.slice().sort().join(',')}` : keyOf(c.text);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── the moves that follow ──────────────────────────────────────────

/**
 * Two or three next moves, chosen from what the structure holds — never the
 * same row every time. The model may rank them; it may not add one that does
 * not apply.
 */
export function chooseNext(d: Digest, asked: NextId[] = []): Next[] {
  const L = (id: string) => d.nodes.find((n) => n.id === id)?.label ?? '';
  const candidates: Next[] = [];
  const openQs = d.open.map(L).filter(Boolean);
  const options = d.nodes.filter((n) => n.role === 'option' || n.role === 'alternative' || (n.type === 'decision' && n.role !== 'branch')).map((n) => n.label);
  const unsupported = d.findings.find((f) => f.kind === 'unsupported-assumption' || f.kind === 'claim-without-evidence');
  if (d.tensions.length) candidates.push({ id: 'tension', label: 'Work through the tension', say: `Help me work through this tension: ${d.tensions[0].label}.` });
  if (openQs.length >= 2) candidates.push({ id: 'resolve', label: 'Resolve open questions', say: `Let's work through what's still open: ${openQs.slice(0, 3).join('; ')}.` });
  if (unsupported) candidates.push({ id: 'evidence', label: 'Find what it rests on', say: `What would it take to support this: ${L(unsupported.refs[0])}?` });
  if (options.length >= 2) candidates.push({ id: 'compare', label: 'Compare the alternatives', say: `Compare ${options.slice(0, 3).join(' and ')} against what matters to me.` });
  if (!d.layers && d.nodes.some((n) => ['step', 'action', 'state'].includes(n.role ?? n.type)) && d.nodes.length >= 3) {
    candidates.push({ id: 'flow', label: 'Lay it out as a flow', say: 'Show this as a process.' });
  }
  if (d.established.length || d.nodes.length >= 5) candidates.push({ id: 'challenge', label: 'Challenge this', say: 'Challenge my current thinking — where is it weakest?' });
  const rank = (n: Next) => {
    const i = asked.indexOf(n.id);
    return i < 0 ? 10 + candidates.indexOf(n) : i;
  };
  const chosen = candidates.sort((a, b) => rank(a) - rank(b)).slice(0, 2);
  chosen.push({ id: 'continue', label: 'Keep thinking', say: '' });
  return chosen;
}

// ── the synthesis from structure alone ─────────────────────────────

const HEADING: Record<GrammarId, string> = {
  process: 'The process you’re designing',
  plan: 'Your plan so far',
  timeline: 'The sequence as it stands',
  system: 'The system you’re mapping',
  decision: 'The choice you’re weighing',
  comparison: 'What you’re comparing',
  argument: 'The case you’re building',
  research: 'What you’re investigating',
  model: 'The model you’ve built',
  brainstorm: 'What you’re exploring',
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A synthesis written from the digest alone: plainer than a model's, never less honest. */
export function fromStructure(d: Digest, base: Pick<Synthesis, 'id' | 'at' | 'scope' | 'snapshot'>): Synthesis {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const L = (id: string) => byId.get(id)?.label ?? id;
  const ref = (ids: string[], text: string): Ref => ({ text, refs: ids, by: 'structure' });

  const title =
    d.scope === 'selection'
      ? `${d.nodes.length} objects, together`
      : d.topic
        ? `${titleCase(d.topic)}${d.building ? ` — ${GRAMMARS[d.building].label.toLowerCase()}` : ''}`
        : d.building
          ? HEADING[d.building]
          : 'Where your thinking stands';

  // A plain paragraph from the shape: what it is, what shapes it, what is open.
  const bits: string[] = [];
  // The work done ON an object leads: it is what they did, in their order.
  if (d.work?.did.length) {
    const last = d.work.did[d.work.did.length - 1];
    bits.push(`${d.work.did.length === 1 ? last : `${d.work.did.length} steps taken; the last: ${last.replace(/^You chose /, 'you chose ')}`}.`);
    if (d.work.open.length) bits.push(`${d.work.open[0].replace(/^(\w+): /, '$1 — ')}.`);
  }
  if (d.scope === 'selection') {
    const types = [...new Set(d.nodes.map((n) => n.role ?? n.type))];
    bits.push(
      types.length === 1
        ? `${d.nodes.length} ${plural(types[0], d.nodes.length)} side by side${d.edges.length ? `, ${d.edges.length} ${d.edges.length === 1 ? 'connection' : 'connections'} between them` : ', not yet connected to one another'}.`
        : `A mix of ${types.slice(0, 4).map((t) => plural(t, 2)).join(', ')}${d.edges.length ? ', connected' : ', not yet connected'}.`
    );
  } else if (d.layers) {
    const steps = d.layers.flat().length;
    const forks = d.layers.filter((l) => l.length > 1).length;
    bits.push(`${steps} ${d.building === 'timeline' ? 'moments' : 'steps'} in order${forks ? `, dividing ${forks === 1 ? 'once' : `${forks} times`}` : ''}.`);
  } else if (d.model) {
    bits.push(`A model, “${d.model.title}”${d.model.params.length ? `, with ${d.model.params.length} ${d.model.params.length === 1 ? 'parameter' : 'parameters'} you can move` : ''}.`);
  } else if (d.building) {
    bits.push(`The beginnings of ${/^[aeiou]/i.test(GRAMMARS[d.building].label) ? 'an' : 'a'} ${GRAMMARS[d.building].label.toLowerCase()}.`);
  }
  if (d.values.length || d.constraints.length) {
    bits.push(
      `It is shaped by ${[
        d.values.length ? `${d.values.length === 1 ? `one value (“${L(d.values[0])}”)` : `${d.values.length} values`}` : '',
        d.constraints.length ? `${d.constraints.length === 1 ? `one constraint (“${L(d.constraints[0])}”)` : `${d.constraints.length} constraints`}` : '',
      ].filter(Boolean).join(' and ')}.`
    );
  }
  const settledN = d.established.length;
  const openN = d.open.length + d.tensions.length;
  bits.push(
    settledN === 0
      ? `Nothing in it is settled yet${openN ? `, and ${openN} ${openN === 1 ? 'thing is' : 'things are'} explicitly open` : ''}.`
      : `${settledN} ${settledN === 1 ? 'thing has' : 'things have'} support behind ${settledN === 1 ? 'it' : 'them'}${openN ? `; ${openN} ${openN === 1 ? 'remains' : 'remain'} open` : ''}.`
  );

  const sections: Synthesis['sections'] = [];
  if (d.work?.did.length) sections.push({ id: 'established', items: d.work.did.slice(-LIMIT.items).map((x) => ref([], x)) });
  if (d.work?.open.length) sections.push({ id: 'unresolved', items: d.work.open.slice(0, LIMIT.items).map((x) => ref([], x)) });
  const est = d.established.slice(0, LIMIT.items).map((id) => ref([id], L(id)));
  if (est.length) {
    const had = sections.find((x) => x.id === 'established');
    if (had) had.items.push(...est);
    else sections.push({ id: 'established', items: est });
  }
  const cand = d.candidates
    .map((id) => byId.get(id)!)
    .sort((a, b) => b.support - a.support || b.degree - a.degree)
    .slice(0, LIMIT.items)
    .map((n) => ref([n.id], n.support ? `${n.label} — some support` : n.label));
  if (cand.length) sections.push({ id: 'emerging', items: cand });
  const ten = d.tensions.slice(0, LIMIT.items).map((t) => ref([t.a, ...(t.b ? [t.b] : [])], t.label));
  if (ten.length) sections.push({ id: 'tensions', items: ten });
  const un = d.open.slice(0, LIMIT.items).map((id) => ref([id], /\?$/.test(L(id)) ? L(id) : `${L(id)}?`));
  if (un.length) {
    const had = sections.find((x) => x.id === 'unresolved');
    if (had) had.items.push(...un);
    else sections.push({ id: 'unresolved', items: un });
  }
  if (!sections.length && d.nodes.length) {
    sections.push({ id: 'emerging', items: d.nodes.slice(0, LIMIT.items).map((n) => ref([n.id], n.label)) });
  }

  const change = d.change ? { said: changeSentence(d.change), facts: changeFacts(d.change) } : undefined;

  return {
    v: 1,
    ...base,
    title: clip(title, LIMIT.title),
    lede: clip(bits.join(' '), LIMIT.lede),
    ...(d.layers && d.building ? { shape: { kind: d.building, label: GRAMMARS[d.building].label, layers: d.layers.slice(0, 14) } } : {}),
    sections,
    critique: d.findings.slice(0, LIMIT.critique).map((f) => ({ level: f.level, text: f.text, refs: f.refs })),
    possibilities: [],
    ...(change ? { change } : {}),
    next: chooseNext(d),
    counts: d.counts,
    source: 'structure',
  };
}

function changeFacts(c: Change): string[] {
  const f: string[] = [];
  const list = (xs: string[]) => xs.slice(0, 3).map((x) => `“${x}”`).join(', ') + (xs.length > 3 ? ` and ${xs.length - 3} more` : '');
  if (c.shape?.to) f.push(`now read as ${/^[aeiou]/i.test(c.shape.to) ? 'an' : 'a'} ${c.shape.to}${c.shape.from ? ` (was ${c.shape.from})` : ''}`);
  if (c.added.length) f.push(`added ${list(c.added)}`);
  if (c.resolved.length) f.push(`resolved ${list(c.resolved)}`);
  if (c.strengthened.length) f.push(`more support for ${list(c.strengthened)}`);
  if (c.revised.length) f.push(`revised ${list(c.revised)}`);
  if (c.newTensions.length) f.push(`new tension: ${list(c.newTensions)}`);
  if (c.reopened.length) f.push(`reopened ${list(c.reopened)}`);
  if (c.weakened.length) f.push(`less support for ${list(c.weakened)}`);
  if (c.removed.length) f.push(`set aside ${list(c.removed)}`);
  return f.slice(0, 6);
}

function changeSentence(c: Change): string {
  const f = changeFacts(c);
  return f.length ? `Since the last synthesis you have ${f.slice(0, 3).join('; ')}.` : 'Little has changed since the last synthesis.';
}

// ── the text a synthesis leaves in the conversation ────────────────

const SECTION_LABEL: Record<SectionId, string> = {
  established: 'What seems established',
  emerging: 'Taking shape',
  tensions: 'Tensions',
  unresolved: 'Still open',
  reading: 'Socria’s reading',
};
export const sectionLabel = (id: SectionId) => SECTION_LABEL[id];

/**
 * The plain text kept as the message's content — what the reply model reads
 * as history, so a correction ("that isn't quite right") has something to be
 * about. Marked, so the map extractor never maps Socria's reading as the
 * person's thinking.
 */
export function synthesisText(s: Synthesis): string {
  const out = [`${SYNTH_MARK} ${s.title}`, s.lede];
  if (s.shape) out.push(`Shape: ${s.shape.layers.map((l) => l.join(' | ')).join(' → ')}`);
  for (const sec of s.sections) out.push(`${SECTION_LABEL[sec.id]}: ${sec.items.map((i) => i.text).join('; ')}`);
  if (s.critique.length) out.push(`What I'd question: ${s.critique.map((c) => `(${c.level}) ${c.text}`).join(' ')}`);
  if (s.possibilities.length) out.push(`Possibilities (Socria's, not yours): ${s.possibilities.map((p) => p.label).join('; ')}`);
  if (s.change) out.push(`Since last time: ${s.change.said}`);
  return out.join('\n').slice(0, 2400);
}

export const isSynthesisText = (content: unknown) => typeof content === 'string' && content.startsWith(SYNTH_MARK);

// ── storage: a synthesis from a browser is trusted for nothing ──────

export function sanitizeSynthesis(raw: unknown): Synthesis | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as any;
  if (r.v !== 1 || typeof r.title !== 'string') return undefined;
  const ref = (x: any): Ref | null => {
    const text = clip(x?.text, LIMIT.item);
    return text ? { text, refs: (Array.isArray(x?.refs) ? x.refs : []).filter((y: unknown) => typeof y === 'string').map((y: string) => y.slice(0, 40)).slice(0, 6), by: x?.by === 'socria' ? 'socria' : 'structure' } : null;
  };
  const sectionIds = new Set<SectionId>(['established', 'emerging', 'tensions', 'unresolved', 'reading']);
  const nextIds = new Set<NextId>(['challenge', 'resolve', 'tension', 'compare', 'evidence', 'flow', 'changed', 'continue']);
  const snap = r.snapshot && typeof r.snapshot === 'object' ? r.snapshot : {};
  return {
    v: 1,
    id: clip(r.id, 40) || 'syn',
    at: Number(r.at) || 0,
    scope: { kind: r.scope?.kind === 'selection' ? 'selection' : 'workspace', ...(Array.isArray(r.scope?.ids) ? { ids: r.scope.ids.filter((x: unknown) => typeof x === 'string').slice(0, 40) } : {}) },
    title: clip(r.title, LIMIT.title),
    lede: clip(r.lede, LIMIT.lede),
    ...(r.shape && GRAMMARS[r.shape.kind as GrammarId] && Array.isArray(r.shape.layers)
      ? { shape: { kind: r.shape.kind, label: clip(r.shape.label, 30), layers: r.shape.layers.slice(0, 14).map((l: unknown) => (Array.isArray(l) ? l.slice(0, 4).map((x) => clip(x, 80)) : [])) } }
      : {}),
    sections: (Array.isArray(r.sections) ? r.sections : [])
      .filter((s: any) => sectionIds.has(s?.id))
      .map((s: any) => ({ id: s.id, items: (Array.isArray(s.items) ? s.items : []).map(ref).filter(Boolean).slice(0, 8) }))
      .slice(0, 6),
    critique: (Array.isArray(r.critique) ? r.critique : [])
      .map((c: any) => (clip(c?.text, LIMIT.item) ? { level: ['problem', 'risk', 'suggestion'].includes(c.level) ? c.level : 'risk', text: clip(c.text, LIMIT.item), refs: (Array.isArray(c.refs) ? c.refs : []).filter((y: unknown) => typeof y === 'string').slice(0, 6) } : null))
      .filter(Boolean)
      .slice(0, 6),
    possibilities: (Array.isArray(r.possibilities) ? r.possibilities : [])
      .map((p: any) => (clip(p?.label, 60) ? { id: clip(p.id, 12) || 'p', label: clip(p.label, 60), type: POSSIBILITY_TYPES.has(p.type) ? p.type : 'idea', text: clip(p.text, LIMIT.item) } : null))
      .filter(Boolean)
      .slice(0, 4),
    ...(r.change && typeof r.change.said === 'string' ? { change: { said: clip(r.change.said, 320), facts: (Array.isArray(r.change.facts) ? r.change.facts : []).map((f: unknown) => clip(f, 160)).filter(Boolean).slice(0, 6) } } : {}),
    next: (Array.isArray(r.next) ? r.next : []).filter((n: any) => nextIds.has(n?.id)).map((n: any) => ({ id: n.id, label: clip(n.label, 40), say: clip(n.say, 300) })).slice(0, 3),
    counts: clip(r.counts, 160),
    source: r.source === 'model' ? 'model' : 'structure',
    snapshot: {
      at: Number(snap.at) || 0,
      ...(GRAMMARS[snap.building as GrammarId] ? { building: snap.building } : {}),
      nodes: (Array.isArray(snap.nodes) ? snap.nodes : [])
        .filter((n: any) => typeof n?.id === 'string' && typeof n?.label === 'string')
        .slice(0, 120)
        .map((n: any) => ({ id: n.id.slice(0, 40), label: clip(n.label, 100), type: clip(n.type, 24) || 'idea', ...(typeof n.role === 'string' ? { role: n.role.slice(0, 24) } : {}), ...(typeof n.status === 'string' ? { status: n.status.slice(0, 12) } : {}) })),
      edges: (Array.isArray(snap.edges) ? snap.edges : [])
        .filter((e: any) => typeof e?.from === 'string' && typeof e?.to === 'string')
        .slice(0, 200)
        .map((e: any) => ({ from: e.from.slice(0, 40), to: e.to.slice(0, 40), relation: clip(e.relation, 20) || 'relates' })),
    },
    ...(r.taken && typeof r.taken === 'object'
      ? { taken: Object.fromEntries(Object.entries(r.taken).filter(([, v]) => v === 'added' || v === 'dismissed').slice(0, 20)) as Record<string, 'added' | 'dismissed'> }
      : {}),
  };
}

/** The last synthesis in a conversation, if any — what "what changed" compares against. */
export function lastSynthesis(messages: readonly { synthesis?: Synthesis }[]): Synthesis | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].synthesis) return messages[i].synthesis!;
  return null;
}

/** Enough to synthesise: two objects, or a model. */
export const canSynthesize = (map: ThinkingMap) => map.nodes.length >= 2 || !!map.models?.docs?.length;

/**
 * THE CORRECTION RULE, for the reply model. A reply to a synthesis may correct
 * Socria's READING or change the person's THINKING, and the two are handled
 * differently.
 */
export const SYNTHESIS_CORRECTION = `

THE LAST THING SOCRIA SHOWED WAS A SYNTHESIS — its reading of the person's map, marked "${SYNTH_MARK}". If this turn responds to it, decide which of two things they are doing:
1. CORRECTING SOCRIA'S INTERPRETATION ("that's not what I meant", "you've overstated X", "I never decided Y"): acknowledge plainly, restate the corrected reading in a sentence, and do NOT say their thinking or the map changed — only Socria's reading was wrong.
2. CHANGING THEIR THINKING ("actually ease of access matters more than personalization", "drop the tutorial idea"): treat it as their new position — say what it changes in their structure, briefly — because it is theirs to change.
If it is genuinely unclear which, ask in one short line. Never defend the synthesis against them; it is a mirror, not a claim.`;
