// lib/mind/evolve.ts — the Living Model: how understanding changes, and the person's say over it.
//
// The Mind Graph already refuses to overwrite: a change of position is a new
// node and a `superseded_by` edge, a conflict is two nodes and a `contradicts`
// edge, better words keep the old text in provenance (apply.ts). What it did
// not do was let the person see those changes as changes, check them, or
// undo one Socria got wrong — they were applied the moment an extractor read
// them, and the only record was a status word on a node.
//
// This file is that missing layer, and it is not a second store. A CHANGE is
// read straight out of the graph — an edge of the kind that records one, or a
// node's provenance entry that records a rewording — and its review state
// lives in that same provenance entry (`review`, with `prior` holding exactly
// what it displaced). So:
//
//   changesOf          every recorded change, newest first, with what it
//                      reached (the same walk the Memory page's "waiting on
//                      a change" marks use — lib/workspace/impact.ts)
//   reviewChange       the person confirms it, or rejects it — and a
//                      rejection restores exactly what was there and leaves a
//                      tombstone, so the same change is not read in again
//   detectContradictions  two live claims of the same kind that say opposite
//                      things, found by plain rules and PROPOSED — nothing
//                      about either changes until the person confirms
//   evolutionOf        one memory's history: what it replaced, what replaced
//                      it, how its words changed, what it is in tension with
//   changesBlock       what Core and Logos are told: unconfirmed changes are
//                      held lightly, and settled ones are said as settled
//
// Nothing here guesses a change Socria was not given evidence for, and nothing
// marks a change of the person's own as needing their confirmation.
//
// PURE. No clock, no ids of its own.

import { projectMind } from '@/lib/workspace/adapters';
import { planImpact } from '@/lib/workspace/impact';
import { emptyWorkspace } from '@/lib/workspace/store';
import { forgetEdge, forgetNode } from './apply';
import {
  boundProvenance,
  clip,
  fingerprintEdge,
  isForgotten,
  normalize,
  privateElsewhere,
  type MindEdge,
  type MindGraph,
  type MindNode,
  type NodeStatus,
  type Provenance,
  type ReviewState,
} from './types';

export type ChangeKind = 'superseded' | 'conflict' | 'possible-conflict' | 'revised';

export interface ChangeSide {
  id: string;
  type: string;
  label: string;
  content: string;
  status: NodeStatus;
}

export interface Affected {
  id: string;
  label: string;
  /** how many steps from what changed */
  distance: number;
  /** the relationship the change travelled along */
  via: string;
}

export interface Change {
  /** `e:<edge id>` for a change an edge records; `r:<node id>:<moment>` for a rewording */
  id: string;
  kind: ChangeKind;
  at: number;
  review: ReviewState;
  /** what it was — the earlier position, one side of a tension, the old words */
  from: ChangeSide;
  /** what it is now — the new position, the other side, the new words */
  to: ChangeSide;
  /** the old wording, for a rewording */
  was?: string;
  /** the reason recorded with it, in the record's own words */
  note?: string;
  surface: Provenance['surface'];
  conversationId?: string;
  /** what rests on the earlier side and may need another look */
  affected: Affected[];
  /** whether rejecting may also forget the new side (only when this change created it) */
  canForget: boolean;
  /** recorded before changes were reviewed: history, neither proposed nor confirmed */
  legacy?: boolean;
}

const CHANGE_RELS = new Set(['superseded_by', 'contradicts']);

/** The provenance entry that records the change — the first, which is the change itself. */
const changeEntry = (e: MindEdge): Provenance | undefined => e.provenance[0];

/**
 * A change's review state. One the person made themselves is theirs, never
 * pending their own confirmation. One recorded before reviews existed is
 * history: it is not put in front of them now as though it had just been
 * read, and it is never called confirmed — it is LEGACY.
 */
function reviewOf(p: Provenance | undefined): ReviewState {
  if (!p) return 'confirmed';
  if (p.review) return p.review;
  return 'confirmed';
}
const isLegacy = (p: Provenance | undefined) => !!p && !p.review && p.surface !== 'user';

const side = (n: MindNode): ChangeSide => ({ id: n.id, type: n.type, label: n.label, content: n.content, status: n.status });

/** The graph as the impact walk reads it — build once, ask many times. */
export const impactView = (graph: MindGraph) => projectMind(emptyWorkspace(), graph);

/** What rests on a node — the same walk lib/mind/waiting.ts writes its marks from. */
export function affectedBy(graph: MindGraph, nodeId: string, limit = 12, view?: ReturnType<typeof impactView>): Affected[] {
  const plan = planImpact(view ?? impactView(graph), `mind:${nodeId}`);
  if (!plan) return [];
  const bare = (id: string) => (id.startsWith('mind:') ? id.slice(5) : id);
  return plan.affected.slice(0, limit).map((a) => ({ id: bare(a.id), label: a.label, distance: a.distance, via: a.via }));
}

/**
 * Every change the graph records, newest first. `excludePrivate` hides
 * private memories from a surface that may not see them (Logos); `here` lets
 * a private memory show in the conversation it was made in.
 */
export function changesOf(graph: MindGraph, opts: { excludePrivate?: boolean; here?: string; withAffected?: boolean; limit?: number } = {}): Change[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const hidden = (n: MindNode) => !!opts.excludePrivate && privateElsewhere(n, opts.here, !opts.here);
  const view = opts.withAffected === false ? null : impactView(graph);
  const reach = (id: string) => (view ? affectedBy(graph, id, 12, view) : []);
  const out: Change[] = [];
  for (const e of graph.edges) {
    if (!CHANGE_RELS.has(e.relationship)) continue;
    const a = byId.get(e.sourceId);
    const b = byId.get(e.targetId);
    if (!a || !b || hidden(a) || hidden(b)) continue;
    const p = changeEntry(e);
    const possible = e.relationship === 'contradicts' && p?.kind === 'inferred' && /possible contradiction/.test(p?.note ?? '');
    const kind: ChangeKind = e.relationship === 'superseded_by' ? 'superseded' : possible ? 'possible-conflict' : 'conflict';
    out.push({
      id: `e:${e.id}`,
      kind,
      at: e.createdAt,
      review: reviewOf(p),
      from: side(a),
      to: side(b),
      ...(p?.note ? { note: p.note } : {}),
      surface: p?.surface ?? 'core',
      ...(p?.conversationId ? { conversationId: p.conversationId } : {}),
      affected: reach(a.id),
      canForget: b.createdAt === e.createdAt && b.provenance.every((q) => q.surface !== 'user'),
      ...(isLegacy(p) ? { legacy: true } : {}),
    });
  }
  // a rewording: a provenance entry that kept the old words
  for (const n of graph.nodes) {
    if (hidden(n)) continue;
    for (const p of n.provenance) {
      if (!p.note?.startsWith('was: ')) continue;
      const was = p.note.slice(5);
      out.push({
        id: `r:${n.id}:${p.at}`,
        kind: 'revised',
        at: p.at,
        review: reviewOf(p),
        from: { ...side(n), content: was },
        to: side(n),
        was,
        surface: p.surface,
        ...(p.conversationId ? { conversationId: p.conversationId } : {}),
        affected: reach(n.id),
        canForget: false,
        ...(isLegacy(p) ? { legacy: true } : {}),
      });
    }
  }
  out.sort((x, y) => y.at - x.at || x.id.localeCompare(y.id));
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export type Decision = 'confirm' | 'reject' | 'forget' | 'supersede';

/**
 * The person's decision on a change.
 *
 *   confirm    it stands, and is said as settled from now on
 *   reject     it was not a change: what it displaced is restored exactly
 *              (`prior`), the link is removed and tombstoned so the same reading
 *              is not made again; the newer claim, if any, stays as a claim
 *   forget     as reject, and the newer claim is forgotten too — only for a
 *              claim this change itself created
 *   supersede  for two claims in tension: neither is wrong, their thinking
 *              CHANGED — the earlier becomes what they used to think, the newer
 *              what they think now. Recorded the way a change of position read
 *              from a conversation is (a superseded_by link, the earlier marked
 *              superseded), as the person's own, settled; the tension is
 *              tombstoned so it is not proposed again. Rejecting that change
 *              later restores the earlier claim exactly, as any other.
 *
 * A rewording rejected keeps the earlier words.
 */
export function reviewChange(graph: MindGraph, changeId: string, decision: Decision, now: number): { ok: true; graph: MindGraph; say: string } | { ok: false; why: string } {
  if (changeId.startsWith('r:')) {
    const rest = changeId.slice(2);
    const cut = rest.lastIndexOf(':');
    const nodeId = rest.slice(0, cut);
    const at = Number(rest.slice(cut + 1));
    const n = graph.nodes.find((x) => x.id === nodeId);
    const entry = n?.provenance.find((p) => p.at === at && p.note?.startsWith('was: '));
    if (!n || !entry) return { ok: false, why: 'That change is no longer in your memory.' };
    if (decision === 'forget') return { ok: false, why: 'A rewording can be kept or undone — use “keep the earlier words”.' };
    if (decision === 'supersede') return { ok: false, why: 'A rewording is one claim in new words — keep the new words, or the earlier ones.' };
    const was = entry.note!.slice(5);
    const marked = n.provenance.map((p) => (p === entry ? { ...p, review: decision === 'confirm' ? ('confirmed' as const) : ('rejected' as const) } : p));
    const node: MindNode =
      decision === 'confirm'
        ? { ...n, provenance: marked, updatedAt: now }
        : { ...n, content: clip(was, 400), provenance: boundProvenance([...marked, { kind: 'stated', surface: 'user', at: now, note: `kept the earlier wording over: ${n.content}`, review: 'confirmed' }]), updatedAt: now };
    return { ok: true, graph: { ...graph, nodes: graph.nodes.map((x) => (x.id === n.id ? node : x)) }, say: decision === 'confirm' ? 'Kept the new wording.' : 'Kept your earlier wording.' };
  }
  if (!changeId.startsWith('e:')) return { ok: false, why: 'That is not a change.' };
  const edge = graph.edges.find((e) => e.id === changeId.slice(2));
  if (!edge || !CHANGE_RELS.has(edge.relationship)) return { ok: false, why: 'That change is no longer in your memory.' };
  const a = graph.nodes.find((n) => n.id === edge.sourceId);
  const b = graph.nodes.find((n) => n.id === edge.targetId);
  if (!a || !b) return { ok: false, why: 'One side of that change is no longer in your memory.' };
  const entry = changeEntry(edge);
  const possible = edge.relationship === 'contradicts' && entry?.kind === 'inferred' && /possible contradiction/.test(entry?.note ?? '');

  if (decision === 'supersede') {
    if (edge.relationship !== 'contradicts') return { ok: false, why: 'That is already a change of position — confirm it, or undo it.' };
    // the link runs from what was held first to what was said since — detectContradictions
    // and apply.ts both write it that way, and the Memory view says so on the card
    const [older, newer] = [a, b];
    const live = (s: NodeStatus): NodeStatus => (s === 'contradicted' || s === 'tentative' || s === 'uncertain' ? 'active' : s);
    // the tension is not proposed again (detectContradictions reads this tombstone)
    const stone = fingerprintEdge(a.type, a.label, 'contradicts', b.type, b.label);
    const tombstones = graph.tombstones.includes(stone) ? graph.tombstones : [...graph.tombstones, stone];
    // the same link, now the change it was: same id, so the store updates the row it already has
    const edges = graph.edges.map((e) =>
      e.id === edge.id
        ? {
            ...e,
            sourceId: older.id,
            targetId: newer.id,
            relationship: 'superseded_by',
            provenance: [{ kind: 'stated' as const, surface: 'user' as const, at: now, note: 'You said it changed.', review: 'confirmed' as const, prior: { status: older.status, toStatus: newer.status } }],
            updatedAt: now,
            lastReinforced: now,
          }
        : e
    );
    const nodes = graph.nodes.map((n) => {
      if (n.id === older.id) return { ...n, status: 'superseded' as const, updatedAt: now };
      if (n.id === newer.id) return { ...n, status: stillDisputed(graph, n.id, edge.id) ? n.status : live(n.status), updatedAt: now };
      return n;
    });
    return { ok: true, graph: { ...graph, nodes, edges, tombstones }, say: `Kept the newer: “${newer.label}” is what you think now, and “${older.label}” what you used to.` };
  }

  if (decision === 'confirm') {
    const edges = graph.edges.map((e) => (e.id === edge.id ? { ...e, provenance: e.provenance.map((p, i) => (i === 0 ? { ...p, review: 'confirmed' as const } : p)), updatedAt: now } : e));
    // a possible contradiction becomes a real one only now: both stand, both in dispute
    const nodes = possible ? graph.nodes.map((n) => (n.id === a.id || n.id === b.id ? { ...n, status: 'contradicted' as const, updatedAt: now } : n)) : graph.nodes;
    return { ok: true, graph: { ...graph, nodes, edges }, say: edge.relationship === 'superseded_by' ? `Confirmed: “${b.label}” is what you think now.` : 'Confirmed: those two are in tension.' };
  }

  // reject or forget: restore exactly what the change displaced
  const prior = entry?.prior ?? {};
  const restoreA: NodeStatus | undefined = possible ? undefined : (prior.status ?? 'active');
  const restoreB: NodeStatus | undefined = edge.relationship === 'contradicts' && !possible ? (prior.toStatus ?? 'tentative') : undefined;
  let next: MindGraph = {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.id === a.id && restoreA) return { ...n, status: stillDisputed(graph, a.id, edge.id) ? n.status : restoreA, updatedAt: now };
      if (n.id === b.id && restoreB) return { ...n, status: stillDisputed(graph, b.id, edge.id) ? n.status : restoreB, updatedAt: now };
      return n;
    }),
  };
  // the link goes, with a tombstone: the same reading is not made again
  next = forgetEdge(next, edge.id);
  if (decision === 'forget') {
    const created = b.createdAt === edge.createdAt && b.provenance.every((q) => q.surface !== 'user');
    if (!created) return { ok: false, why: 'That claim was there before this change — reject the change instead, and it stays as it was.' };
    next = forgetNode(next, b.id, now, 'not what I think');
  }
  return {
    ok: true,
    graph: next,
    say:
      decision === 'forget'
        ? `Forgotten: “${b.label}”. “${a.label}” is as it was.`
        : edge.relationship === 'superseded_by'
          ? `Undone: “${a.label}” stands as it was; “${b.label}” stays as its own claim.`
          : 'Undone: those two are not treated as in tension.',
  };
}

/** Whether a node is still in another unresolved tension, so undoing one does not clear the other. */
function stillDisputed(graph: MindGraph, nodeId: string, exceptEdge: string): boolean {
  return graph.edges.some((e) => e.id !== exceptEdge && e.relationship === 'contradicts' && (e.sourceId === nodeId || e.targetId === nodeId));
}

// ── possible contradictions, by plain rules ──────────────────────────

/** Kinds of claim a person can hold and later hold the opposite of. */
const CLAIM_TYPES = new Set(['belief', 'preference', 'goal', 'plan', 'decision', 'assumption']);
const NEGATION = /\b(?:not|never|no longer|dont|doesnt|didnt|wont|cant|cannot|isnt|arent|wasnt|shouldnt|stop|stopped|quit|against|hate|dislike|avoid|refuse|neither|nor)\b/;
const tokens = (t: string) => new Set(normalize(t).replace(/\b(?:not|never|no|dont|doesnt|didnt|wont|cant|cannot|isnt|arent|wasnt|shouldnt|longer)\b/g, ' ').split(' ').filter((w) => w.length > 3));
const negated = (t: string) => NEGATION.test(normalize(t).replace(/'/g, ''));

function sameSubject(a: MindNode, b: MindNode): boolean {
  const x = tokens(`${a.label} ${a.content}`);
  const y = tokens(`${b.label} ${b.content}`);
  if (x.size < 2 || y.size < 2) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size) >= 0.5;
}

const live = (n: MindNode) => n.status === 'active' || n.status === 'tentative';
const linked = (graph: MindGraph, a: string, b: string) =>
  graph.edges.some((e) => (e.sourceId === a && e.targetId === b) || (e.sourceId === b && e.targetId === a));

/**
 * Two live claims of the same kind, about the same thing, one saying it and
 * the other its negation — "I want to move to Denver" and "I don't want to
 * move" — PROPOSED as a possible contradiction. Conservative on purpose: a
 * shared subject AND opposite polarity AND the same kind of claim, between a
 * claim this turn touched and one already held. Nothing about either claim
 * changes; the person confirms or dismisses it. A dismissed one is never
 * proposed again (its tombstone).
 */
export function detectContradictions(
  graph: MindGraph,
  touched: readonly string[],
  opts: { now: number; nextId: () => string; provenance: Omit<Provenance, 'kind' | 'at'>; max?: number }
): { graph: MindGraph; proposed: Change['id'][] } {
  const edges = [...graph.edges];
  const proposed: string[] = [];
  const max = opts.max ?? 2;
  const touchedNodes = graph.nodes.filter((n) => touched.includes(n.id) && live(n) && CLAIM_TYPES.has(normalize(n.type)));
  for (const t of touchedNodes) {
    if (proposed.length >= max) break;
    for (const o of graph.nodes) {
      if (proposed.length >= max) break;
      if (o.id === t.id || !live(o) || normalize(o.type) !== normalize(t.type)) continue;
      if (o.private !== t.private) continue;
      if (linked({ ...graph, edges }, t.id, o.id)) continue;
      if (negated(`${t.label} ${t.content}`) === negated(`${o.label} ${o.content}`)) continue;
      if (!sameSubject(t, o)) continue;
      // older first, so the edge reads "what was held" → "what was just said"
      const [a, b] = o.createdAt <= t.createdAt ? [o, t] : [t, o];
      if (isForgotten(graph, fingerprintEdge(a.type, a.label, 'contradicts', b.type, b.label))) continue;
      const id = opts.nextId();
      edges.push({
        id,
        sourceId: a.id,
        targetId: b.id,
        relationship: 'contradicts',
        confidence: 0.4,
        strength: 0.4,
        provenance: [{ ...opts.provenance, kind: 'inferred', at: opts.now, note: `possible contradiction: “${clip(a.content || a.label, 120)}” and “${clip(b.content || b.label, 120)}”`, review: 'proposed' }],
        createdAt: opts.now,
        updatedAt: opts.now,
        lastReinforced: opts.now,
      });
      proposed.push(`e:${id}`);
    }
  }
  return { graph: proposed.length ? { ...graph, edges } : graph, proposed };
}

// ── one memory's history ─────────────────────────────────────────────

export interface EvolutionStep {
  at: number;
  kind: 'origin' | 'replaced' | 'replaced-by' | 'reworded' | 'tension' | 'corrected';
  label: string;
  text: string;
  /** the other node, where there is one */
  other?: string;
  review?: ReviewState;
}

/**
 * How one memory came to be what it is, oldest first, from the record alone:
 * where it first came from, the positions it replaced and that replaced it
 * (following the chain both ways), each rewording with the old words, each
 * tension, each correction the person made. Nothing is reconstructed that
 * was not recorded.
 */
export function evolutionOf(graph: MindGraph, nodeId: string): EvolutionStep[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const start = byId.get(nodeId);
  if (!start) return [];
  // the whole chain of positions this one is part of
  const chain = new Set<string>([nodeId]);
  let grew = true;
  while (grew && chain.size < 40) {
    grew = false;
    for (const e of graph.edges) {
      if (e.relationship !== 'superseded_by' && e.relationship !== 'changed_into') continue;
      if (chain.has(e.sourceId) !== chain.has(e.targetId)) {
        chain.add(e.sourceId);
        chain.add(e.targetId);
        grew = true;
      }
    }
  }
  const steps: EvolutionStep[] = [];
  for (const id of chain) {
    const n = byId.get(id);
    if (!n) continue;
    const first = n.provenance[0];
    steps.push({ at: first?.at ?? n.createdAt, kind: 'origin', label: n.label, text: n.content, review: undefined });
    for (const p of n.provenance) {
      if (p.note?.startsWith('was: ')) steps.push({ at: p.at, kind: 'reworded', label: n.label, text: `was: ${p.note.slice(5)}`, review: reviewOf(p) });
      else if (p.surface === 'user' && p.note && !p.note.startsWith('kept the earlier')) steps.push({ at: p.at, kind: 'corrected', label: n.label, text: p.note });
    }
  }
  for (const e of graph.edges) {
    const a = byId.get(e.sourceId);
    const b = byId.get(e.targetId);
    if (!a || !b) continue;
    if ((e.relationship === 'superseded_by' || e.relationship === 'changed_into') && chain.has(a.id) && chain.has(b.id)) {
      steps.push({ at: e.createdAt, kind: 'replaced', label: b.label, text: `“${a.label}” → “${b.label}”${changeEntry(e)?.note ? ` — ${changeEntry(e)!.note}` : ''}`, other: a.id, review: reviewOf(changeEntry(e)) });
    }
    if (e.relationship === 'contradicts' && (chain.has(a.id) || chain.has(b.id))) {
      const other = chain.has(a.id) ? b : a;
      steps.push({ at: e.createdAt, kind: 'tension', label: other.label, text: `in tension with “${other.label}”`, other: other.id, review: reviewOf(changeEntry(e)) });
    }
  }
  return steps.sort((x, y) => x.at - y.at || x.kind.localeCompare(y.kind));
}

// ── what Core and Logos are told ─────────────────────────────────────

const day = (t: number) => (t ? new Date(t).toISOString().slice(0, 10) : 'an unrecorded day');

/**
 * The changes that bear on this turn — those touching what was recalled,
 * then the most recent — as a block for the system prompt. Unconfirmed ones
 * are said to be unconfirmed: a model reading a change Socria inferred must
 * not treat it as the person's settled view, nor the old view as current.
 */
export function selectForPrompt(changes: readonly Change[], relevant: ReadonlySet<string>, opts: { now: number; max?: number; days?: number }): Change[] {
  const max = opts.max ?? 4;
  const horizon = opts.now - (opts.days ?? 45) * 86_400_000;
  const pick = [
    ...changes.filter((c) => relevant.has(c.from.id) || relevant.has(c.to.id)),
    ...changes.filter((c) => c.review === 'proposed' && c.at >= horizon),
  ];
  const seen = new Set<string>();
  const out: Change[] = [];
  for (const c of pick) {
    if (seen.has(c.id) || out.length >= max) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export function changesBlock(picked: readonly Change[]): string {
  const lines: string[] = [];
  for (const c of picked) {
    const tag = c.review === 'proposed' ? `read from a conversation on ${day(c.at)}; NOT confirmed by them` : c.legacy ? `recorded ${day(c.at)}` : `confirmed, ${day(c.at)}`;
    if (c.kind === 'superseded') lines.push(`- They used to hold “${c.from.content || c.from.label}” and now “${c.to.content || c.to.label}” (${tag}).`);
    else if (c.kind === 'revised') lines.push(`- “${c.to.label}” was reworded from “${c.was}” to “${c.to.content}” (${tag}).`);
    else lines.push(`- “${c.from.content || c.from.label}” and “${c.to.content || c.to.label}” ${c.kind === 'possible-conflict' ? 'may be in tension' : 'are in tension'} (${tag}).`);
    if (c.affected.length) lines.push(`  It may affect: ${c.affected.slice(0, 4).map((a) => `“${a.label}”`).join(', ')}.`);
  }
  if (!lines.length) return '';
  return `\n=== How their thinking has been changing ===\n${lines.join('\n')}\nAn unconfirmed change is Socria's reading: hold both sides lightly, never present the old view as current or the new one as settled, and if it bears on what they are asking, ask them. Never resolve a tension for them.\n`;
}
