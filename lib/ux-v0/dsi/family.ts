// lib/ux-v0/dsi/family.ts — systems made from a system: a product's, a campaign's, an experiment's.
//
// A company has one brand and many things made within it. A product or a campaign may need a system of its own —
// its own accent, its own display face — that is still the company's in everything it does not change. And a brand
// that is being rethought needs somewhere to be rethought that is not the brand.
//
//   a product system, a campaign system   made from the parent's PUBLISHED version; what it changes is its own,
//                                         everything else is the parent's
//   an experiment                         made from the system as it stands (its draft); changed freely; compared
//                                         with where it came from; brought back only by the person
//
// NOTHING MOVES ON ITS OWN. A child is a system like any other (drafts, versions, publishing, projects linked to
// it). It remembers what it was made from as its source (lib/ux-v0/dsi/sync.ts): when the parent publishes a new
// version, the child is told one is waiting; the three-way comparison there brings in what the child never touched,
// keeps what the child changed as its deliberate overrides, and asks about the rest — into the child's draft, which
// is published separately. A parent is never changed by a child. An experiment reaches its origin only through
// `promote`: into the origin's draft, never into a published version.

import { publishedContent, logged, newRecord, updateDraft, type SystemRecord } from './registry';
import type { SystemContent } from './schema';
import { applyMerge, planMerge, type Choice } from './merge';
import { emptySync } from './registry';
import { recordCheck, type SyncDiff } from './sync';
import { diffContent, type Change } from './tokens';

export const RELATIONS = ['product', 'campaign', 'experiment'] as const;
export type Relation = (typeof RELATIONS)[number];
export const RELATION_LABEL: Record<Relation, string> = { product: 'Product system', campaign: 'Campaign system', experiment: 'Experiment' };

export interface Parentage {
  id: string;
  relation: Relation;
  /** the parent's version it was made from, or last brought in (0: made from a draft) */
  version: number;
}

/** What a system was made from, if it was made from another. */
export function parentageOf(r: SystemRecord): Parentage | null {
  const s = r.sync.source;
  if (!s || s.kind !== 'socriaux' || !/^dsys_[\w-]{4,64}$/.test(s.ref)) return null;
  const relation = (RELATIONS as readonly string[]).includes(String(s.property)) ? (s.property as Relation) : 'product';
  return { id: s.ref, relation, version: Math.max(0, Number(/^v(\d+)$/.exec(r.sync.upstream)?.[1] ?? 0)) };
}

export const childrenOf = (records: readonly SystemRecord[], parentId: string) => records.filter((r) => parentageOf(r)?.id === parentId);

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * A system made from another (see the head of this file). A product's or a campaign's needs a published parent: it
 * is made within the brand as approved, never within a draft. An experiment starts from the parent as it stands.
 */
export function deriveSystem(parent: SystemRecord, o: { name: string; relation: Relation; now?: number; owner?: string | null; by?: string }): { record: SystemRecord } | { error: string } {
  const now = o.now ?? Date.now();
  const name = o.name.trim().slice(0, 80);
  if (!name) return { error: 'Give it a name.' };
  const from = o.relation === 'experiment' ? parent.draft : publishedContent(parent);
  if (!from) return { error: `${parent.name} has no published version yet. A ${o.relation} system is made within the brand as published, never within a draft: publish it first.` };
  const content: SystemContent = { ...copy(from), identity: { ...copy(from.identity), name } };
  const upstream = o.relation === 'experiment' ? `draft@${parent.updatedAt}` : `v${parent.published}`;
  const record = newRecord(content, { owner: o.owner ?? parent.owner, by: o.by, now, source: { kind: 'socriaux', ref: parent.id, property: o.relation, version: String(parent.published) } });
  // (what it was made from, as the base every later comparison starts at — under its own name, which is its own)
  record.sync = { ...emptySync(), mode: 'manual', source: { kind: 'socriaux', ref: parent.id, property: o.relation, version: String(parent.published) }, base: { ...copy(from), identity: copy(content.identity) }, upstream, lastSynced: now, lastChecked: now };
  record.audit = [{ at: now, action: 'created', by: o.by ?? 'owner', summary: `${RELATION_LABEL[o.relation]} made from ${parent.name}${o.relation === 'experiment' ? ' as it stands' : ` v${parent.published}`}: what it does not change stays ${parent.name}’s` }];
  return { record };
}

/** What a child has made its own: every difference from what it was made from (or last took from its parent). */
export function ownChanges(child: SystemRecord): Change[] {
  return child.sync.base ? diffContent(child.sync.base, child.draft).filter((c) => c.kind !== 'identity') : [];
}

/**
 * The parent looked at again: a newer published version (for an experiment, a changed draft) is kept as an update
 * waiting on the child. Nothing in the child's draft changes here.
 */
export function checkParent(child: SystemRecord, parent: SystemRecord | null, now = Date.now()): { record: SystemRecord; changed: boolean; diff?: SyncDiff; error?: string } {
  const p = parentageOf(child);
  if (!p) return { record: child, changed: false, error: 'This system was not made from another.' };
  if (!parent || parent.id !== p.id) {
    const r = recordCheck(child, { ok: false, error: 'The system it was made from is not in this browser.' }, { now });
    return { ...r, error: 'The system it was made from is not in this browser.' };
  }
  const content = p.relation === 'experiment' ? parent.draft : publishedContent(parent);
  if (!content) return { record: child, changed: false, error: `${parent.name} has no published version.` };
  return recordCheck(child, { ok: true, upstreamId: p.relation === 'experiment' ? `draft@${parent.updatedAt}` : `v${parent.published}`, content: copy(content) }, { now });
}

/** Whether a newer parent is waiting (already found by a check) or would be found by one. */
export function parentAhead(child: SystemRecord, parent: SystemRecord | null): boolean {
  const p = parentageOf(child);
  if (!p || !parent) return false;
  if (child.sync.pending) return true;
  return p.relation === 'experiment' ? child.sync.upstream !== `draft@${parent.updatedAt}` && diffContent(child.sync.base ?? parent.draft, parent.draft).length > 0 : parent.published > p.version;
}

/** What an experiment would change in the system it was made from, were it brought back. */
export function experimentAgainst(experiment: SystemRecord, origin: SystemRecord): Change[] {
  // (its name is its own, and is never brought back)
  return diffContent(origin.draft, experiment.draft).filter((c) => c.kind !== 'identity');
}

/**
 * An experiment brought back into where it came from — into the origin's DRAFT, by the person's choices where the
 * two disagree. The origin's published versions are untouched: publishing stays its own, explicit step.
 */
export function promote(experiment: SystemRecord, origin: SystemRecord, choices: Record<string, Choice> = {}, o: { now?: number; by?: string } = {}): { record: SystemRecord; log: string[]; conflicts: number } | { error: string } {
  const p = parentageOf(experiment);
  if (!p || p.id !== origin.id) return { error: `${experiment.name} was not made from ${origin.name}.` };
  const now = o.now ?? Date.now();
  const plan = planMerge(origin.draft, experiment.draft);
  // where the two disagree and the person has not chosen, the experiment's value is taken: bringing it back is the point
  const full: Record<string, Choice> = Object.fromEntries(plan.conflicts.filter((c) => c.kind !== 'identity').map((c) => [c.id, choices[c.id] ?? (c.options.includes('replace') ? 'replace' : c.suggested)]));
  const merged = applyMerge(origin.draft, experiment.draft, full);
  // (the experiment's name is its own: the origin keeps its identity)
  const content: SystemContent = { ...merged.content, identity: origin.draft.identity };
  const n = diffContent(origin.draft, content).length;
  if (!n) return { record: logged(origin, { at: now, action: 'edited', by: o.by ?? 'owner', summary: `${experiment.name} brought nothing new` }), log: [], conflicts: 0 };
  return { record: updateDraft(origin, content, `Brought in from the experiment “${experiment.name}”: ${n} change${n === 1 ? '' : 's'} in the draft (not published)`, { now, by: o.by }), log: merged.log, conflicts: plan.conflicts.length };
}
