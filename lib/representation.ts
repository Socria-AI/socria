// lib/representation.ts
//
// WHAT IS THE PERSON TRYING TO BUILD WITH THEIR THINKING?
//
// THE FAILURE THIS ANSWERS. Somebody designing a sequence — the stages a new
// user goes through, the rounds of a hiring loop, the order of a launch — got
// a cloud: "user experience" as a Constraint, "steps involved" as a
// Constraint, "easy access" as a Value. None of those readings was wrong on
// its own. The map was wrong anyway, because it answered "what is this
// about?" and never asked "what is this person MAKING?" The answer to the
// second question is a shape — a process, a timeline, a decision, an argument
// — and the shape is what the representation has to show.
//
// So two readings of every node, kept apart on purpose:
//
//   SEMANTIC TYPE    what the thing IS           (lib/logos.ts NODE_TYPES)
//   STRUCTURAL ROLE  what it DOES in the shape   (ROLES below)
//
// "Sign up" is an action; in a process it is a STEP. "Easy access" is a value;
// in a process it is a CONSTRAINT ON SOME STEPS — a detail that belongs to
// the steps it bears on, not a peer of them on the canvas. "Core or Logos"
// holds two concepts; structurally it is a BRANCH.
//
// AN OPEN REGISTRY, NOT A SET OF MODES. Each grammar below declares what it
// builds, which roles make up its spine, when the structure on the map
// actually satisfies it, and which lens draws it. Nothing is chosen by the
// person up front, nothing is keyed to a subject, and a new grammar is an
// entry here — the extractor's instructions, the inference and the lens
// choice all read this table.
//
// WHERE THE READING COMES FROM. Three sources, in order of authority:
//
//   1. the PERSON — "show this as a process" is an instruction, sticky until
//      they say otherwise;
//   2. the STRUCTURE on the map — sequence edges, branches, options against
//      criteria, claims over evidence — scored here, in code, from canonical
//      state;
//   3. the EXTRACTOR's reading of the conversation, which is the only thing
//      that understands what the words are for. It proposes; the structure
//      confirms or outweighs it.
//
// Mixed structures are normal: a process whose steps carry constraints and
// open questions; a decision that contains a plan. `also` keeps the secondary
// grammars, and attachments keep the details under what they belong to.
//
// PURE. No React, no network.

import type { LogosEdge, LogosNode, ThinkingMap } from './logos';

// ── the grammars ────────────────────────────────────────────────────

export const GRAMMAR_IDS = [
  'process',
  'plan',
  'timeline',
  'system',
  'decision',
  'comparison',
  'argument',
  'research',
  'model',
  'brainstorm',
] as const;
export type GrammarId = (typeof GRAMMAR_IDS)[number];

/** Every structural role any grammar uses. A role is what a node DOES in the shape. */
export const ROLES = [
  // sequences
  'start',
  'step',
  'state',
  'branch',
  'end',
  // plans
  'goal',
  'action',
  'milestone',
  // time
  'event',
  'period',
  // systems
  'component',
  'flow',
  // choices
  'option',
  'criterion',
  'alternative',
  'dimension',
  // cases
  'claim',
  'evidence',
  'assumption',
  'objection',
  // inquiry
  'question',
  'hypothesis',
  'method',
  'finding',
  // computation
  'variable',
  'parameter',
  'equation',
  // possibilities
  'idea',
  'cluster',
  // DETAILS — what bears on a part of the shape rather than being one
  'constraint',
  'value',
  'risk',
  'condition',
  'note',
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that are, in every grammar, details of something rather than a part of the spine. */
export const DETAIL_ROLES: ReadonlySet<Role> = new Set<Role>(['constraint', 'value', 'risk', 'condition', 'note']);

/** The relations that put one part of a shape before another. */
export const SEQUENCE_RELATIONS: ReadonlySet<LogosEdge['relation']> = new Set<LogosEdge['relation']>(['precedes', 'leads_to']);

export interface Grammar {
  id: GrammarId;
  label: string;
  /** what someone building this is constructing — said to the extractor, in these words */
  builds: string;
  /** the roles that make up the shape itself; anything else is a detail of it */
  spine: readonly Role[];
  /** what each spine role means here, for the extractor */
  roles: Partial<Record<Role, string>>;
  /** how a person might name it when they correct Logos */
  called: readonly string[];
  /** lenses that draw it, best first (lib/logos-layout.ts) */
  draws: readonly string[];
  /** is the dependency order part of the shape? */
  ordered: boolean;
}

export const GRAMMARS: Record<GrammarId, Grammar> = {
  process: {
    id: 'process',
    label: 'Process',
    builds: 'a sequence someone or something moves through — the steps or states, the transitions between them, where it branches and on what condition, where it starts and ends',
    spine: ['start', 'step', 'state', 'branch', 'end'],
    roles: {
      start: 'where it begins',
      step: 'a stage, screen, activity or state something passes through',
      state: 'a condition something is in between steps',
      branch: 'a point where the path divides — a choice, a test, a fork',
      end: 'where a path finishes',
    },
    called: ['process', 'flow', 'flowchart', 'flow chart', 'sequence', 'journey', 'pipeline', 'funnel', 'workflow', 'steps', 'stages', 'state machine'],
    draws: ['flow'],
    ordered: true,
  },
  plan: {
    id: 'plan',
    label: 'Plan',
    builds: 'a way from here to a goal — the goal, the actions, what has to happen before what, the milestones that mark progress',
    spine: ['goal', 'action', 'milestone'],
    roles: {
      goal: 'what the plan is for',
      action: 'something to be done',
      milestone: 'a point that marks progress',
    },
    called: ['plan', 'roadmap', 'project plan', 'schedule', 'checklist'],
    draws: ['flow', 'structure'],
    ordered: true,
  },
  timeline: {
    id: 'timeline',
    label: 'Timeline',
    builds: 'what happened, in order — events and periods, what came before what, and what caused what',
    spine: ['event', 'period'],
    roles: { event: 'something that happened at a point in time', period: 'a stretch of time' },
    called: ['timeline', 'chronology', 'history', 'sequence of events'],
    draws: ['timeline', 'flow'],
    ordered: true,
  },
  system: {
    id: 'system',
    label: 'System',
    builds: 'how the parts of something work together — the components, what flows between them, what depends on what, the loops',
    spine: ['component', 'flow'],
    roles: { component: 'a part of the system', flow: 'something that moves between parts' },
    called: ['system', 'network', 'architecture', 'ecosystem', 'dependency map', 'dependencies'],
    draws: ['graph', 'structure'],
    ordered: false,
  },
  decision: {
    id: 'decision',
    label: 'Decision',
    builds: 'a choice — the options, the criteria they are judged on, the tradeoffs between them, what is still uncertain',
    spine: ['option', 'criterion'],
    roles: { option: 'one of the things they could choose', criterion: 'what an option is judged on' },
    called: ['decision', 'choice', 'options', 'tradeoffs', 'pros and cons'],
    draws: ['matrix', 'tensions', 'structure'],
    ordered: false,
  },
  comparison: {
    id: 'comparison',
    label: 'Comparison',
    builds: 'two or more things set side by side — the alternatives, the dimensions they are compared on, where they agree and where they differ',
    spine: ['alternative', 'dimension'],
    roles: { alternative: 'one of the things being compared', dimension: 'what they are compared on' },
    called: ['comparison', 'side by side', 'table', 'matrix'],
    draws: ['matrix', 'structure'],
    ordered: false,
  },
  argument: {
    id: 'argument',
    label: 'Argument',
    builds: 'a case for something — the claims, the evidence under them, the assumptions they rest on, the objections against them',
    spine: ['claim', 'evidence', 'assumption', 'objection'],
    roles: {
      claim: 'something asserted',
      evidence: 'what a claim rests on',
      assumption: 'what is taken for granted',
      objection: 'what pushes back',
    },
    called: ['argument', 'case', 'essay', 'thesis'],
    draws: ['evidence', 'structure'],
    ordered: false,
  },
  research: {
    id: 'research',
    label: 'Research',
    builds: 'finding something out — the question, the hypotheses, how they would be tested, what the evidence says, what stays uncertain',
    spine: ['question', 'hypothesis', 'method', 'finding'],
    roles: {
      question: 'what is being asked',
      hypothesis: 'a candidate answer to be tested',
      method: 'how it would be tested or measured',
      finding: 'what the evidence says',
    },
    called: ['research', 'study', 'experiment', 'investigation', 'research design'],
    draws: ['structure', 'evidence'],
    ordered: false,
  },
  model: {
    id: 'model',
    label: 'Model',
    builds: 'something to compute — variables, parameters, equations, constraints, and what can be run or changed',
    spine: ['variable', 'parameter', 'equation'],
    roles: { variable: 'a quantity that changes', parameter: 'a quantity that is set', equation: 'a relationship between quantities' },
    called: ['model', 'simulation', 'equation', 'graph', 'plot', 'chart', 'curve'],
    draws: ['plot', 'solve'],
    ordered: false,
  },
  brainstorm: {
    id: 'brainstorm',
    label: 'Brainstorm',
    builds: 'possibilities that are not organised yet — ideas, how they cluster, what pulls against what, the open questions',
    spine: ['idea', 'cluster'],
    roles: { idea: 'a possibility', cluster: 'a group of related possibilities' },
    called: ['brainstorm', 'mind map', 'mindmap', 'concept map', 'ideas', 'cloud'],
    draws: ['graph'],
    ordered: false,
  },
};

// ── what the map records ─────────────────────────────────────────────

export interface Building {
  /** the shape the representation leads with */
  kind: GrammarId;
  /** secondary shapes present in the same thinking */
  also?: GrammarId[];
  /** the person said so, or it was read */
  by: 'person' | 'inferred';
  /** 0–1, how clearly the structure and the conversation agree */
  confidence: number;
  /** one line on why, in the extractor's words or the person's */
  why?: string;
}

export const isGrammar = (v: unknown): v is GrammarId => typeof v === 'string' && (GRAMMAR_IDS as readonly string[]).includes(v);
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** A small table of near misses, so a reasonable word still lands on the right role. */
const ROLE_ALIASES: Record<string, Role> = {
  stage: 'step',
  phase: 'step',
  screen: 'step',
  activity: 'step',
  task: 'action',
  decision: 'branch',
  decision_point: 'branch',
  fork: 'branch',
  gateway: 'branch',
  begin: 'start',
  entry: 'start',
  exit: 'end',
  outcome: 'end',
  objective: 'goal',
  deliverable: 'milestone',
  part: 'component',
  module: 'component',
  choice: 'option',
  factor: 'criterion',
  dimension_: 'dimension',
  counterpoint: 'objection',
  counterargument: 'objection',
  premise: 'assumption',
  procedure: 'method',
  measurement: 'method',
  result: 'finding',
  requirement: 'constraint',
  rule: 'constraint',
  principle: 'value',
  priority: 'value',
  concern: 'risk',
  open_question: 'question',
  unknown: 'question',
};

/** A role from the wire, or nothing. Never throws, never invents one. */
export function sanitizeRole(raw: unknown): Role | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (isRole(t)) return t;
  const a = ROLE_ALIASES[t];
  return a && isRole(a) ? a : undefined;
}

/** A building from the wire or storage, trusted for nothing. */
export function sanitizeBuilding(raw: unknown): Building | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const kind = typeof r.kind === 'string' ? r.kind.trim().toLowerCase() : '';
  if (!isGrammar(kind)) return undefined;
  const also = (Array.isArray(r.also) ? r.also : [])
    .map((a) => (typeof a === 'string' ? a.trim().toLowerCase() : ''))
    .filter((a): a is GrammarId => isGrammar(a) && a !== kind)
    .filter((a, i, all) => all.indexOf(a) === i)
    .slice(0, 3);
  const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0.5;
  const why = typeof r.why === 'string' ? r.why.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return {
    kind,
    ...(also.length ? { also } : {}),
    by: r.by === 'person' ? 'person' : 'inferred',
    confidence,
    ...(why ? { why } : {}),
  };
}

// ── the structure on the map ─────────────────────────────────────────

type Mapish = Pick<ThinkingMap, 'nodes' | 'edges'> & Partial<Pick<ThinkingMap, 'models' | 'viz' | 'context'>>;

/** The roles of the grammars whose shape is an order — what a flow can be drawn from. */
const ORDERED_SPINE: ReadonlySet<Role> = new Set<Role>(
  GRAMMAR_IDS.filter((g) => GRAMMARS[g].ordered).flatMap((g) => GRAMMARS[g].spine)
);

/**
 * The parts of the shape, for an ordered grammar: nodes that carry one of its
 * spine roles, and — for a map written before roles existed, or a turn whose
 * extractor left them off — nodes joined by a sequence edge. Details are
 * never spine, whatever edges they carry.
 */
export function spineOf(map: Mapish, kind?: GrammarId): Set<string> {
  const roles = kind && GRAMMARS[kind].ordered ? new Set<Role>(GRAMMARS[kind].spine) : ORDERED_SPINE;
  const out = new Set<string>();
  const detail = new Set<string>();
  for (const n of map.nodes) {
    const r = n.role as Role | undefined;
    if (r && DETAIL_ROLES.has(r)) detail.add(n.id);
    else if (r && roles.has(r)) out.add(n.id);
  }
  for (const e of map.edges) {
    if (!SEQUENCE_RELATIONS.has(e.relation)) continue;
    if (!detail.has(e.from)) out.add(e.from);
    if (!detail.has(e.to)) out.add(e.to);
  }
  return out;
}

/** Sequence edges between two spine nodes, as from → to. */
export function transitionsOf(map: Mapish, spine: Set<string>): LogosEdge[] {
  return map.edges.filter((e) => SEQUENCE_RELATIONS.has(e.relation) && spine.has(e.from) && spine.has(e.to));
}

/** The relations a detail hangs from the part it bears on by, in order of preference. */
const ATTACH: readonly LogosEdge['relation'][] = ['applies_to', 'part_of', 'depends', 'supports', 'conflicts', 'relates'];

/**
 * DETAILS UNDER WHAT THEY BELONG TO. Every node that is not part of the spine
 * but is joined to one that is — a constraint that applies to a step, a
 * question about a branch — keyed by the spine node it hangs from. A detail
 * that bears on several steps is listed under each.
 */
export function attachmentsOf(map: Mapish, spine: Set<string>): Map<string, LogosNode[]> {
  const out = new Map<string, LogosNode[]>();
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  for (const rel of ATTACH) {
    for (const e of map.edges) {
      if (e.relation !== rel) continue;
      const pairs: [string, string][] = [];
      if (spine.has(e.to) && !spine.has(e.from)) pairs.push([e.from, e.to]);
      if (spine.has(e.from) && !spine.has(e.to)) pairs.push([e.to, e.from]);
      for (const [detail, host] of pairs) {
        // A detail found through a stronger relation is not listed again
        // through a looser one.
        if (rel !== 'applies_to' && [...out.values()].some((l) => l.some((d) => d.id === detail))) continue;
        const d = byId.get(detail);
        if (!d) continue;
        const list = out.get(host) ?? [];
        if (!list.some((x) => x.id === d.id)) list.push(d);
        out.set(host, list);
      }
    }
  }
  return out;
}

/** The longest chain of sequence edges, ignoring cycles. */
function longestChain(map: Mapish): number {
  const next = new Map<string, string[]>();
  for (const e of map.edges) if (SEQUENCE_RELATIONS.has(e.relation)) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const walk = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let best = 1;
    for (const t of next.get(id) ?? []) best = Math.max(best, 1 + walk(t));
    visiting.delete(id);
    memo.set(id, best);
    return best;
  };
  let best = 0;
  for (const id of next.keys()) best = Math.max(best, walk(id));
  return best;
}

/** Nodes where a sequence divides. */
function branchesOf(map: Mapish): string[] {
  const out = new Map<string, number>();
  for (const e of map.edges) if (SEQUENCE_RELATIONS.has(e.relation)) out.set(e.from, (out.get(e.from) ?? 0) + 1);
  return [...out.entries()].filter(([, k]) => k >= 2).map(([id]) => id);
}

const share = (map: Mapish, roles: readonly Role[], types: readonly string[] = []) => {
  if (!map.nodes.length) return 0;
  const k = map.nodes.filter((n) => (n.role && roles.includes(n.role as Role)) || types.includes(n.type)).length;
  return k / map.nodes.length;
};
const count = (map: Mapish, pred: (n: LogosNode) => boolean) => map.nodes.filter(pred).length;
const rel = (map: Mapish, ...rs: LogosEdge['relation'][]) => map.edges.filter((e) => rs.includes(e.relation)).length;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/**
 * HOW STRONGLY THE STRUCTURE ON THE MAP IS EACH SHAPE — read from canonical
 * state, never from words. Roles count most, because a role is the
 * extractor's claim about what a node does; the edges and node types are
 * what that claim has to agree with.
 */
export function structuralScores(map: Mapish): Record<GrammarId, number> {
  const chain = longestChain(map);
  const forks = branchesOf(map).length;
  const seq = chain >= 2 ? clamp((chain - 1) / 4) : 0;
  const roleOf = (g: GrammarId) => share(map, GRAMMARS[g].spine);
  const options = count(map, (n) => n.role === 'option' || n.type === 'decision');
  const criteria = count(map, (n) => n.role === 'criterion' || n.type === 'value' || n.type === 'goal');
  const alts = count(map, (n) => n.role === 'alternative');
  const dims = count(map, (n) => n.role === 'dimension');
  const claims = count(map, (n) => n.role === 'claim' || n.type === 'claim' || n.type === 'counterpoint');
  const support = count(map, (n) => n.type === 'evidence' || n.type === 'source' || n.role === 'evidence') + rel(map, 'supports');
  const inquiry = count(map, (n) => n.role === 'hypothesis' || n.role === 'method' || n.type === 'conjecture');
  const quantities = count(map, (n) => ['given', 'unknown', 'equation'].includes(n.type) || ['variable', 'parameter', 'equation'].includes(n.role ?? ''));
  const ideas = count(map, (n) => n.type === 'idea' || n.role === 'idea');
  const typedEdges = map.edges.filter((e) => e.relation !== 'relates').length;
  return {
    process: clamp(roleOf('process') * 0.9 + seq * 0.5 + (forks ? 0.15 : 0)),
    plan: clamp(roleOf('plan') * 0.9 + count(map, (n) => n.type === 'milestone') * 0.12 + seq * 0.15 + (rel(map, 'depends') >= 2 ? 0.15 : 0)),
    timeline: clamp(roleOf('timeline') * 1.1 + seq * 0.2),
    system: clamp(roleOf('system') * 1.1 + (rel(map, 'depends', 'leads_to') >= 4 && !chain ? 0.15 : 0)),
    decision: clamp((options >= 2 && criteria >= 1 ? 0.55 : 0) + count(map, (n) => n.type === 'decision') * 0.1 + roleOf('decision') * 0.6 + (count(map, (n) => n.type === 'tension') ? 0.1 : 0)),
    comparison: clamp((alts >= 2 ? 0.45 : 0) + (dims >= 1 ? 0.25 : 0) + roleOf('comparison') * 0.4),
    argument: clamp((claims >= 1 && support >= 1 ? 0.45 : 0) + roleOf('argument') * 0.6 + rel(map, 'conflicts') * 0.04),
    research: clamp(roleOf('research') * 0.9 + (inquiry ? 0.3 : 0) + (count(map, (n) => n.type === 'question') && support ? 0.1 : 0)),
    model: clamp((map.models?.docs?.length ? 0.9 : 0) + (map.viz ? 0.6 : 0) + (map.context === 'math' ? 0.4 : 0) + clamp(quantities / 4) * 0.4),
    brainstorm: clamp(map.nodes.length >= 3 ? share(map, ['idea', 'cluster'], ['idea']) * 0.8 + (typedEdges <= 1 ? 0.15 : 0) + (ideas >= 4 ? 0.1 : 0) : 0),
  };
}

/** Does the structure on the map actually hold this shape? What the repair pass checks. */
export function satisfies(map: Mapish, kind: GrammarId): boolean {
  const g = GRAMMARS[kind];
  if (g.ordered) {
    const spine = spineOf(map, kind);
    return spine.size >= 2 && transitionsOf(map, spine).length >= 1;
  }
  switch (kind) {
    case 'decision':
      return count(map, (n) => n.role === 'option' || n.type === 'decision') >= 2 || (count(map, (n) => n.role === 'option') >= 1 && count(map, (n) => n.role === 'criterion') >= 1);
    case 'comparison':
      return count(map, (n) => n.role === 'alternative') >= 2;
    case 'argument':
      return count(map, (n) => n.role === 'claim' || n.type === 'claim') >= 1 && (rel(map, 'supports', 'conflicts') >= 1);
    case 'research':
      return count(map, (n) => n.role === 'question' || n.role === 'hypothesis' || n.type === 'question' || n.type === 'conjecture') >= 1;
    case 'model':
      return !!map.models?.docs?.length || !!map.viz || count(map, (n) => ['variable', 'parameter', 'equation'].includes(n.role ?? '') || n.type === 'equation') >= 1;
    case 'system':
      return count(map, (n) => n.role === 'component') >= 3;
    case 'brainstorm':
      return map.nodes.length >= 1;
    default:
      return false;
  }
}

// ── the reading ──────────────────────────────────────────────────────

/** How far a new reading must beat the standing one before the shape changes. */
export const HYSTERESIS = 0.12;
const ALSO_AT = 0.35;

/**
 * WHAT IS BEING BUILT, read from everything that knows.
 *
 * The person's word wins outright and stays until they say otherwise. Without
 * it, the extractor's reading of the conversation and the structure on the map
 * are weighed together; a standing reading only gives way to a clearly better
 * one, so a single ambiguous turn does not throw a flow back into a cloud.
 */
export function readBuilding(input: {
  map: Mapish;
  /** what the extractor proposed this turn */
  proposed?: Building | null;
  /** what the person asked for this turn */
  stated?: GrammarId | null;
  /** the reading the map arrived with */
  prev?: Building | null;
}): Building | null {
  const { map, proposed, stated, prev } = input;
  if (stated) {
    return { kind: stated, ...(proposed?.also?.length ? { also: proposed.also.filter((a) => a !== stated) } : {}), by: 'person', confidence: 1, why: 'you asked to see it this way' };
  }
  if (prev?.by === 'person') return prev;
  if (!map.nodes.length && !map.models?.docs?.length && !map.viz) return proposed ?? null;
  const s = structuralScores(map);
  const combined = {} as Record<GrammarId, number>;
  for (const g of GRAMMAR_IDS) {
    const said = proposed?.kind === g ? 1 : proposed?.also?.includes(g) ? 0.5 : 0;
    combined[g] = clamp((proposed ? 0.55 * said : 0) + (proposed ? 0.45 : 1) * s[g]);
  }
  let best = GRAMMAR_IDS.reduce((a, b) => (combined[b] > combined[a] ? b : a), GRAMMAR_IDS[0]);
  if (combined[best] < 0.2) return proposed ?? prev ?? null;
  // A standing shape gives way only to one that is clearly better AND that the
  // structure itself bears out — one turn's reading cannot turn a flow with a
  // dozen ordered steps into something the map does not hold.
  if (prev && prev.kind !== best && (combined[best] - (combined[prev.kind] ?? 0) < HYSTERESIS || s[best] < 0.3)) best = prev.kind;
  // Secondary shapes: whatever the extractor named in the conversation, and
  // whatever the structure clearly holds besides the primary.
  const also = [
    ...(proposed?.also ?? []).filter((g) => g !== best),
    ...GRAMMAR_IDS.filter((g) => g !== best && combined[g] >= ALSO_AT).sort((a, b) => combined[b] - combined[a]),
  ]
    .filter((g, i, all) => all.indexOf(g) === i)
    .slice(0, 2);
  const why = proposed?.kind === best ? proposed.why : prev?.kind === best ? prev.why : undefined;
  return {
    kind: best,
    ...(also.length ? { also } : {}),
    by: 'inferred',
    confidence: Math.round(combined[best] * 100) / 100,
    ...(why ? { why } : {}),
  };
}

/** The lens that draws this shape, among the ones the map can show. */
export function lensFor(building: Building | null | undefined, available: readonly string[]): string | null {
  if (!building) return null;
  for (const l of GRAMMARS[building.kind].draws) if (available.includes(l)) return l;
  return null;
}

// ── the person's correction ─────────────────────────────────────────

const VERB = /\b(show|draw|see|view|display|lay|map|make|turn|treat|structure|organi[sz]e|arrange|present|represent|render|think\s+of|read)\b/;

/**
 * "Actually, show this as a process." — an instruction about the SHAPE, and
 * the only place the shape is read from words. It names a grammar in the
 * person's terms (each grammar's `called` list) after a verb of showing, or
 * says outright that the thing IS one ("this is really a timeline"). A
 * subject that merely mentions a process is not a correction.
 */
export function statedBuilding(text: unknown): GrammarId | null {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 400);
  for (const g of GRAMMAR_IDS) {
    for (const name of GRAMMARS[g].called) {
      const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const asA = new RegExp(`\\bas (?:a |an |the )?${n}\\b`);
      const isA = new RegExp(`\\b(?:this|it|that)(?: is|'s| should be| would be)(?: really| more| more like| actually| basically)? (?:a |an )?${n}\\b`);
      const into = new RegExp(`\\b(?:into|in) (?:a |an )?${n}(?: view| form| shape)?\\b`);
      if (asA.test(t) && VERB.test(t)) return g;
      if (isA.test(t) && !/\?\s*$/.test(t)) return g;
      if (into.test(t) && /\b(turn|make|put|lay|organi[sz]e|restructure|reshape|convert)\b/.test(t)) return g;
    }
  }
  return null;
}

// ── what the extractor is told ──────────────────────────────────────

/** The grammars as the extractor reads them — generated from the table, never written twice. */
export function grammarGuide(): string {
  return GRAMMAR_IDS.map((g) => {
    const x = GRAMMARS[g];
    const roles = x.spine.map((r) => `${r} (${x.roles[r] ?? r})`).join(', ');
    return `  ${g.padEnd(11)}${x.builds}.\n${' '.repeat(13)}spine roles: ${roles}`;
  }).join('\n');
}

/** What the extractor is told about the reading the map already carries. */
export function buildingLine(b: Building | null | undefined): string {
  if (!b) return 'Not yet read — decide it from the conversation.';
  if (b.by === 'person') {
    return `THE PERSON ASKED TO SEE THIS AS A ${GRAMMARS[b.kind].label.toUpperCase()}. Keep "kind": "${b.kind}" until they say otherwise, and make the structure one: give every node its role in that shape, put the transitions/relations in, and keep every idea already on the map — restructure, never discard.`;
  }
  return `Last read as: ${b.kind}${b.also?.length ? ` (with ${b.also.join(', ')})` : ''}. Keep it unless what they are building has genuinely changed.`;
}

/**
 * THE REPAIR PROMPT. The reading says one shape and the structure on the map
 * is not that shape — a process with no transitions, a decision with one
 * option. Asked once, for the restructure alone; nothing may be dropped.
 */
export function buildRestructurePrompt(map: Mapish, kind: GrammarId): string {
  const g = GRAMMARS[kind];
  const lines = map.nodes.map((n) => `  ${n.id} [${n.type}${n.role ? `, role ${n.role}` : ''}] ${n.label}`).join('\n');
  const edges = map.edges.map((e) => `  ${e.from} --${e.relation}${e.when ? ` (when ${e.when})` : ''}--> ${e.to}`).join('\n') || '  (none)';
  return `You restructure a map of someone's thinking into the SHAPE they are building. You never talk to the user.

They are building ${/^[aeiou]/i.test(g.label) ? 'an' : 'a'} ${g.label.toUpperCase()}: ${g.builds}.

The map as it stands:
nodes:
${lines}
edges:
${edges}

It does not have that shape yet. Restructure it from the conversation:
- Give every node a "role". The spine of this shape is: ${g.spine.map((r) => `${r} (${g.roles[r] ?? r})`).join(', ')}. Anything that bears on a part of the shape rather than being one — a constraint, a value, a risk, an open question, a goal of one step — gets role constraint, value, risk, question, goal or note and an "applies_to" edge FROM it TO each spine node it bears on.
${g.ordered ? `- Put the spine in order with "precedes" edges, from the earlier to the later. Where the path divides, the dividing node gets role "branch" and one "precedes" edge to each path, with the condition in "when" ("passed the check", "has an account"). Where a statement constrains the ORDER ("no payment before the trial ends"), the order obeys it.\n- Steps the conversation implies but nobody named may be added only when the order cannot be read without them; label them in the person's terms.` : `- Connect the spine with the relations this shape uses (supports, conflicts, depends, part_of, leads_to).`}
- KEEP EVERY NODE. Restructuring changes roles and edges; it never discards what they thought. Keep every id.
- Keep each node's "type" — the semantic type is what the thing IS; the role is what it DOES here.

Return ONLY JSON: {"nodes": [{"id", "type", "role", "label", "status", "note"}], "edges": [{"from", "to", "relation", "when"}]}`;
}

/**
 * Did the restructure keep everything? Every id that was on the map is still
 * on it, or was folded into a node that lists its label as merged.
 */
export function keptEverything(before: Mapish, after: Mapish): boolean {
  const ids = new Set(after.nodes.map((n) => n.id));
  const merged = new Set(after.nodes.flatMap((n) => (n.merged ?? []).map((m) => m.toLowerCase())));
  return before.nodes.every((n) => ids.has(n.id) || merged.has(n.label.toLowerCase()));
}

// ── what the reply is told ──────────────────────────────────────────

export interface BuildingBrief {
  kind: GrammarId;
  /** the spine in order, when the shape is ordered */
  spine: string[];
  by: 'person' | 'inferred';
}

/** The shape and its spine, for the reply — small, plain and built from canonical state. */
export function briefOf(map: Mapish & { building?: Building }): BuildingBrief | null {
  const b = map.building;
  if (!b) return null;
  const g = GRAMMARS[b.kind];
  let spine: string[] = [];
  if (g.ordered) {
    const ids = spineOf(map, b.kind);
    const order = orderSpine(map, ids);
    const byId = new Map(map.nodes.map((n) => [n.id, n]));
    spine = order.flat().map((id) => byId.get(id)?.label ?? '').filter(Boolean);
  } else {
    spine = map.nodes.filter((n) => n.role && g.spine.includes(n.role as Role)).map((n) => n.label);
  }
  return { kind: b.kind, spine: spine.slice(0, 16), by: b.by };
}

export function sanitizeBrief(raw: unknown): BuildingBrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isGrammar(r.kind)) return null;
  const spine = (Array.isArray(r.spine) ? r.spine : [])
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 16);
  return { kind: r.kind, spine, by: r.by === 'person' ? 'person' : 'inferred' };
}

/** The block the reply route adds: what they are building, so the reply talks in its terms. */
export function buildingBlock(b: BuildingBrief | null): string {
  if (!b) return '';
  const g = GRAMMARS[b.kind];
  return `

WHAT THEY ARE BUILDING: ${/^[aeiou]/i.test(g.label) ? 'an' : 'a'} ${g.label.toLowerCase()} — ${g.builds}.${
    b.spine.length ? `\nAs it stands${g.ordered ? ', in order' : ''}: ${b.spine.join(g.ordered ? ' → ' : '; ')}.` : ''
  }
Talk about it in those terms — ${g.spine.slice(0, 4).join(', ')} — and when what they say changes the shape (moves a step, adds a branch, constrains an order), say what changed in it. Never call it by a different shape than this one unless they do.`;
}

// ── ordering ────────────────────────────────────────────────────────

/**
 * The spine in LAYERS: each node in the layer after the latest thing that
 * comes before it. Cycles are broken at the edge that closes them, so a loop
 * back ("progressive discovery returns to the product") does not make a flow
 * impossible to lay out. Within a layer, nodes keep the order they were
 * mentioned in.
 */
export function orderSpine(map: Mapish, spine: Set<string>): string[][] {
  const ids = map.nodes.map((n) => n.id).filter((id) => spine.has(id));
  const out = new Map<string, string[]>();
  for (const e of transitionsOf(map, spine)) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  // Drop the back edges found by a depth-first walk from the earliest nodes.
  const back = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const dfs = (id: string) => {
    state.set(id, 1);
    for (const t of out.get(id) ?? []) {
      if (state.get(t) === 1) back.add(`${id}>${t}`);
      else if (!state.has(t)) dfs(t);
    }
    state.set(id, 2);
  };
  const incoming = new Set(transitionsOf(map, spine).map((e) => e.to));
  for (const id of ids) if (!incoming.has(id) && !state.has(id)) dfs(id);
  for (const id of ids) if (!state.has(id)) dfs(id);
  const layer = new Map<string, number>();
  const prevs = new Map<string, string[]>();
  for (const e of transitionsOf(map, spine)) {
    if (back.has(`${e.from}>${e.to}`)) continue;
    prevs.set(e.to, [...(prevs.get(e.to) ?? []), e.from]);
  }
  const depth = (id: string, seen = new Set<string>()): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(-1, ...(prevs.get(id) ?? []).map((p) => depth(p, seen))) + 1;
    layer.set(id, d);
    return d;
  };
  for (const id of ids) depth(id);
  const layers: string[][] = [];
  for (const id of ids) {
    const d = layer.get(id) ?? 0;
    (layers[d] ??= []).push(id);
  }
  return layers.filter((l) => l && l.length);
}

/** The edges that close a loop, as "from>to" — drawn as returns rather than forward steps. */
export function backEdges(map: Mapish, spine: Set<string>): Set<string> {
  const layers = orderSpine(map, spine);
  const at = new Map<string, number>();
  layers.forEach((l, i) => l.forEach((id) => at.set(id, i)));
  return new Set(
    transitionsOf(map, spine)
      .filter((e) => (at.get(e.to) ?? 0) <= (at.get(e.from) ?? 0))
      .map((e) => `${e.from}>${e.to}`)
  );
}
