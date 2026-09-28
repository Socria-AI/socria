// lib/workspace/trace.ts
//
// TRACE: the one interaction that works on anything.
//
// A person clicks a thing — a claim on the map, a parameter in a model, a
// source, a trajectory — and asks one of six questions:
//
//   what is this?          where did it come from?     what supports it?
//   what contradicts it?   what does it rest on?       what rests on it?
//
// Before this, each surface answered some of those for its own objects and
// none of them for anybody else's. This answers all six for any object in the
// workspace, and does it by walking the relationships rather than by asking a
// model — so the answer is a fact about the state rather than a plausible
// sentence about it.
//
// EVERYTHING HERE IS BOUNDED. A dissertation's worth of reasoning is a graph
// with cycles in it, and "what depends on this?" over ten thousand objects
// must not be the question that freezes the application. Depth and breadth are
// capped, the caps are reported, and a truncated answer says it was truncated
// rather than looking complete.
//
// PROGRESSIVE DISCLOSURE IS A PROPERTY OF THE DATA, NOT THE PANEL. `trace()`
// returns the short answer with the deeper structure beside it; a caller shows
// the first paragraph and lets somebody open the rest. A modal that dumps
// every field is what this replaces.

import {
  EPISTEMIC_SAYS,
  OPPOSING,
  SUPPORTING,
  UNSETTLED,
  UPSTREAM_RELATIONS,
  isInferred,
  isUsers,
  originLine,
  type RelationType,
  type Relationship,
  type WObject,
} from './object';
import type { Workspace } from './store';

export interface TraceLimits {
  depth: number;
  breadth: number;
  shown: number;
}

export const TRACE_LIMITS: TraceLimits = {
  /** how far a dependency walk goes before it stops and says so */
  depth: 6,
  /** how many objects one walk may collect */
  breadth: 200,
  /** how many of each kind the short answer carries */
  shown: 8,
};

export interface Linked {
  object: WObject;
  via: Relationship;
  /** how many steps away; 1 is directly attached */
  distance: number;
}

export interface Trace {
  object: WObject;
  /** one sentence: what it is */
  what: string;
  /** one sentence: where it came from */
  origin: string;
  /** one sentence: how well it is held */
  standing: string;
  supports: Linked[];
  contradicts: Linked[];
  /** what it rests on, nearest first */
  upstream: Linked[];
  /** what would be affected if it changed */
  downstream: Linked[];
  /** the assumptions anywhere upstream of it */
  assumptions: WObject[];
  /** the sources anywhere upstream of it, or attached to it */
  sources: WObject[];
  /** every change that touched it, newest first */
  history: { at: number; said: string }[];
  /** true where a walk hit a cap */
  truncated: boolean;
}

const rel = (ws: Workspace, id: string): Relationship | undefined => ws.relationships.get(id);

/** Relationships leaving an object, as links. */
function edgesFrom(ws: Workspace, id: string): { r: Relationship; other: WObject }[] {
  return (ws.out.get(id) ?? [])
    .map((rid) => rel(ws, rid))
    .filter(Boolean)
    .map((r) => ({ r: r as Relationship, other: ws.objects.get((r as Relationship).to) }))
    .filter((x) => !!x.other) as { r: Relationship; other: WObject }[];
}

/** Relationships arriving at an object. */
function edgesTo(ws: Workspace, id: string): { r: Relationship; other: WObject }[] {
  return (ws.into.get(id) ?? [])
    .map((rid) => rel(ws, rid))
    .filter(Boolean)
    .map((r) => ({ r: r as Relationship, other: ws.objects.get((r as Relationship).from) }))
    .filter((x) => !!x.other) as { r: Relationship; other: WObject }[];
}

/**
 * A bounded walk in one direction.
 *
 * Breadth-first, visited-set, capped in depth and count. Cycles are normal in
 * a model of a system — a feedback loop IS a cycle — so the visited set is the
 * termination condition rather than an assumption that the graph is a tree.
 */
function walk(
  ws: Workspace,
  start: string,
  direction: 'up' | 'down',
  follow: readonly RelationType[] | null,
  limits = TRACE_LIMITS
): { found: Linked[]; truncated: boolean } {
  const seen = new Set<string>([start]);
  const found: Linked[] = [];
  let frontier = [start];
  let truncated = false;

  for (let depth = 1; depth <= limits.depth && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      // Upstream means "what this rests on": follow the edges this object
      // sends out under a resting-on relation, and the edges that come IN
      // under a supporting one — evidence points at the claim it supports, so
      // a claim's support is upstream of it while the arrow runs the other way.
      const outward = edgesFrom(ws, id);
      const inward = edgesTo(ws, id);
      const candidates =
        direction === 'up'
          ? [
              ...outward.filter((e) => (follow ?? UPSTREAM_RELATIONS).includes(e.r.type)),
              ...inward.filter((e) => SUPPORTING.includes(e.r.type) || OPPOSING.includes(e.r.type)),
            ]
          : [
              ...inward.filter((e) => (follow ?? UPSTREAM_RELATIONS).includes(e.r.type)),
              ...outward.filter((e) => SUPPORTING.includes(e.r.type) || OPPOSING.includes(e.r.type)),
            ];

      for (const e of candidates) {
        if (seen.has(e.other.id)) continue;
        seen.add(e.other.id);
        found.push({ object: e.other, via: e.r, distance: depth });
        next.push(e.other.id);
        if (found.length >= limits.breadth) return { found, truncated: true };
      }
    }
    frontier = next;
    if (depth === limits.depth && next.length) truncated = true;
  }
  return { found, truncated };
}

/** What this rests on. */
export function upstream(ws: Workspace, id: string, limits = TRACE_LIMITS): Linked[] {
  return walk(ws, id, 'up', null, limits).found;
}

/** What rests on this — the answer to "what happens if I change it?". */
export function downstream(ws: Workspace, id: string, limits = TRACE_LIMITS): Linked[] {
  return walk(ws, id, 'down', null, limits).found;
}

export interface Impact {
  /** everything a change here could reach, nearest first */
  affected: Linked[];
  /** the ones a reader should be told about: close, or load-bearing */
  notable: Linked[];
  truncated: boolean;
  /** the sentence to show before a consequential change */
  summary: string;
}

/**
 * What a change to this would reach.
 *
 * NOT A CONFIRMATION DIALOG. Most edits are small and asking about them is
 * friction; this exists so a surface can say "this parameter is under three
 * models and a conclusion" at the moment that is worth knowing, and say
 * nothing at all when it is not.
 */
export function impactOf(ws: Workspace, id: string, limits = TRACE_LIMITS): Impact {
  const { found, truncated } = walk(ws, id, 'down', null, limits);
  const notable = found.filter(
    (l) =>
      l.distance <= 2 ||
      l.object.type === 'conclusion' ||
      l.object.type === 'decision' ||
      l.object.type === 'model' ||
      l.object.type === 'simulation'
  );
  const kinds = new Map<string, number>();
  for (const l of found) kinds.set(l.object.type, (kinds.get(l.object.type) ?? 0) + 1);
  const parts = [...kinds.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t, n]) => `${n} ${t}${n === 1 ? '' : 's'}`);
  const summary = found.length
    ? `Changing this reaches ${parts.join(', ')}${truncated ? ', and more beyond what was walked' : ''}.`
    : 'Nothing else in the workspace depends on this.';
  return { affected: found, notable, truncated, summary };
}

/** The full answer, with the short answer on top. */
export function trace(ws: Workspace, id: string, limits = TRACE_LIMITS): Trace | null {
  const object = ws.objects.get(id);
  if (!object) return null;

  const direct = edgesTo(ws, id);
  const supports = direct
    .filter((e) => SUPPORTING.includes(e.r.type))
    .map((e) => ({ object: e.other, via: e.r, distance: 1 }));
  const contradicts = direct
    .filter((e) => OPPOSING.includes(e.r.type))
    .map((e) => ({ object: e.other, via: e.r, distance: 1 }));

  const up = walk(ws, id, 'up', null, limits);
  const down = walk(ws, id, 'down', null, limits);

  const assumptions = up.found
    .map((l) => l.object)
    .filter((o) => o.type === 'assumption' || o.epistemic === 'assumed');
  const sources = [
    ...direct.map((e) => e.other),
    ...up.found.map((l) => l.object),
  ].filter((o) => o.type === 'source' || o.type === 'dataset');

  const history = ws.log
    .filter((ev) => touches(ev, id))
    .map((ev) => ({ at: ev.at, said: sayShort(ev, ws) }))
    .reverse()
    .slice(0, 12);

  return {
    object,
    what: whatIs(object),
    origin: originLine(object),
    standing: `${EPISTEMIC_SAYS[object.epistemic].charAt(0).toUpperCase()}${EPISTEMIC_SAYS[object.epistemic].slice(1)}.`,
    supports: supports.slice(0, limits.shown),
    contradicts: contradicts.slice(0, limits.shown),
    upstream: up.found.slice(0, limits.shown),
    downstream: down.found.slice(0, limits.shown),
    assumptions: dedupe(assumptions).slice(0, limits.shown),
    sources: dedupe(sources).slice(0, limits.shown),
    history,
    truncated: up.truncated || down.truncated,
  };
}

function dedupe(objects: WObject[]): WObject[] {
  const seen = new Set<string>();
  return objects.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}

function whatIs(o: WObject): string {
  const kind = o.claimKind ? `${o.claimKind.replace(/-/g, ' ')}` : o.type.replace(/-/g, ' ');
  return o.meaning ? `A ${kind}. ${o.meaning}` : `A ${kind}.`;
}

function touches(ev: import('./store').WorkspaceEvent, id: string): boolean {
  switch (ev.e) {
    case 'add': return ev.object.id === id;
    case 'update': case 'correct': return ev.id === id;
    case 'remove': return ev.object.id === id;
    case 'relate': case 'unrelate':
      return ev.relationship.from === id || ev.relationship.to === id;
    default: return false;
  }
}

function sayShort(ev: import('./store').WorkspaceEvent, ws: Workspace): string {
  const name = (x: string) => ws.objects.get(x)?.label ?? x;
  switch (ev.e) {
    case 'add': return `added${ev.by === 'user' ? ' by you' : ' by Socria'}`;
    case 'update': return `changed: ${Object.keys(ev.patch).join(', ')}`;
    case 'correct': return `you said it is ${ev.to}, not ${ev.from}`;
    case 'remove': return 'removed';
    case 'relate': return `linked ${ev.relationship.type.replace(/-/g, ' ')} ${name(ev.relationship.to)}`;
    case 'unrelate': return `unlinked ${ev.relationship.type.replace(/-/g, ' ')}`;
    default: return '';
  }
}

// ── what the workspace itself can see about its own state ───────────

export type TensionKind =
  | 'direct-contradiction'
  | 'apparent-tension'
  | 'different-definitions'
  | 'different-assumptions'
  | 'different-data'
  | 'different-periods'
  | 'different-populations'
  | 'unknown';

export interface Tension {
  a: WObject;
  b: WObject;
  via: Relationship;
  kind: TensionKind;
  /** why the two disagree, where the workspace can tell */
  because: string;
}

/**
 * Where two things in the workspace disagree, and — the part that matters —
 * WHAT KIND of disagreement it is.
 *
 * Two papers that contradict each other because they measured different
 * populations are not in conflict; they are answering different questions,
 * and a tool that reports that as a contradiction sends somebody to resolve
 * something that is not broken. Where the objects carry enough to tell (a
 * different method, a different dataset, a different definition, a different
 * period), this says which. Where they do not, it says `unknown` rather than
 * guessing — and it never picks a winner.
 */
export function tensions(ws: Workspace): Tension[] {
  const out: Tension[] = [];
  for (const r of ws.relationships.values()) {
    if (!OPPOSING.includes(r.type)) continue;
    const a = ws.objects.get(r.from);
    const b = ws.objects.get(r.to);
    if (!a || !b) continue;

    const differs = (key: string): string | null => {
      const av = a.meta?.[key];
      const bv = b.meta?.[key];
      if (av === undefined || bv === undefined || av === bv) return null;
      return `${av} against ${bv}`;
    };

    let kind: TensionKind = 'unknown';
    let because = 'Nothing here says why these disagree.';
    const pop = differs('population');
    const data = differs('dataset');
    const period = differs('period');
    const method = differs('method');
    const defn = differs('defines');

    if (defn) { kind = 'different-definitions'; because = `They define the term differently: ${defn}.`; }
    else if (pop) { kind = 'different-populations'; because = `They are about different populations: ${pop}.`; }
    else if (period) { kind = 'different-periods'; because = `They cover different periods: ${period}.`; }
    else if (data) { kind = 'different-data'; because = `They rest on different data: ${data}.`; }
    else if (method) { kind = 'different-assumptions'; because = `They use different methods: ${method}.`; }
    else if (a.type === 'claim' && b.type === 'claim' && a.claimKind === b.claimKind) {
      kind = 'direct-contradiction';
      because = 'Two claims of the same kind that cannot both hold.';
    } else {
      kind = 'apparent-tension';
      because = 'They pull against each other; what settles it is not recorded here.';
    }
    out.push({ a, b, via: r, kind, because });
  }
  return out;
}

export interface Gap {
  kind:
    | 'unsupported-assumption'
    | 'claim-without-evidence'
    | 'unresolved-contradiction'
    | 'open-question'
    | 'orphan'
    | 'undefined-variable';
  object: WObject;
  say: string;
  /** how much rests on it — the reason to look at this one first */
  weight: number;
}

/**
 * What the workspace can see is missing.
 *
 * ORDERED BY HOW MUCH RESTS ON IT, not by how many there are. Twelve
 * unsupported assumptions is a number; "the assumption three conclusions rest
 * on has nothing behind it" is a thing to do something about. Nothing here
 * scores anybody's thinking, and there is no number out of a hundred: these
 * are structural facts, and the person decides which of them matter.
 */
export function gaps(ws: Workspace, limit = 20): Gap[] {
  const out: Gap[] = [];
  const weightOf = (id: string) => downstream(ws, id, { ...TRACE_LIMITS, depth: 3, breadth: 60 }).length;

  for (const o of ws.objects.values()) {
    const supports = (ws.into.get(o.id) ?? [])
      .map((rid) => ws.relationships.get(rid))
      .filter((r) => r && SUPPORTING.includes(r.type));

    if (o.type === 'assumption' && !supports.length && UNSETTLED.includes(o.epistemic)) {
      out.push({
        kind: 'unsupported-assumption',
        object: o,
        say: `“${o.label}” is assumed, and nothing here supports it.`,
        weight: weightOf(o.id) + 1,
      });
    } else if (o.type === 'claim' && !supports.length && !isUsers(o)) {
      out.push({
        kind: 'claim-without-evidence',
        object: o,
        say: `“${o.label}” has no evidence attached.`,
        weight: weightOf(o.id),
      });
    }
    if (o.type === 'question' && (o.question ?? 'open') === 'open') {
      out.push({ kind: 'open-question', object: o, say: `Still open: “${o.label}”.`, weight: weightOf(o.id) });
    }
    const degree = (ws.out.get(o.id)?.length ?? 0) + (ws.into.get(o.id)?.length ?? 0);
    if (!degree && ws.objects.size > 3) {
      out.push({
        kind: 'orphan',
        object: o,
        say: `“${o.label}” is not connected to anything else.`,
        weight: 0,
      });
    }
  }
  for (const t of tensions(ws)) {
    if (t.kind === 'direct-contradiction' || t.kind === 'apparent-tension') {
      out.push({
        kind: 'unresolved-contradiction',
        object: t.a,
        say: `“${t.a.label}” and “${t.b.label}” disagree, and nothing here settles it.`,
        weight: weightOf(t.a.id) + weightOf(t.b.id),
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/**
 * The state of the workspace, in counts a person can act on.
 *
 * NOT A SCORE. There is no percentage, no grade and no meter: those turn
 * thinking into a game and the number into the goal. Counts of structural
 * facts, and the list of what they are.
 */
export function health(ws: Workspace): { say: string; gaps: Gap[]; counts: Record<string, number> } {
  const list = gaps(ws, 40);
  const counts: Record<string, number> = {};
  for (const g of list) counts[g.kind] = (counts[g.kind] ?? 0) + 1;
  const bits: string[] = [];
  const n = (k: Gap['kind'], one: string, many: string) => {
    const c = counts[k];
    if (c) bits.push(`${c} ${c === 1 ? one : many}`);
  };
  n('unresolved-contradiction', 'unresolved disagreement', 'unresolved disagreements');
  n('unsupported-assumption', 'assumption with nothing behind it', 'assumptions with nothing behind them');
  n('claim-without-evidence', 'claim without evidence', 'claims without evidence');
  n('open-question', 'open question', 'open questions');
  n('orphan', 'object connected to nothing', 'objects connected to nothing');
  return {
    say: bits.length ? bits.join(' · ') : 'Nothing structural is outstanding.',
    gaps: list.slice(0, 12),
    counts,
  };
}

/** Objects of one type, for a lens. Cheap, and the reason lenses are not views. */
export function lens(ws: Workspace, of: WObject['type'] | 'unsettled' | 'inferred'): WObject[] {
  const all = [...ws.objects.values()];
  if (of === 'unsettled') return all.filter((o) => UNSETTLED.includes(o.epistemic));
  if (of === 'inferred') return all.filter(isInferred);
  return all.filter((o) => o.type === of);
}
