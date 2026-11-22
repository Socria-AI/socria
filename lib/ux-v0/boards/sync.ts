// lib/ux-v0/boards/sync.ts — a change to the Master Design System carried through a board, deterministically.
//
//   identify → update → repair → re-note → report
//
// Which materials a change reaches is read from their bindings (recorded when each was composed): only properties
// bound to a changed token, and still holding its old value, are set to the new one. What a designer changed in a
// material (a local override) is kept and said, unless they approve resetting it (`reset`). Locked objects, and
// materials whose colours or faces are locked, are kept and said. Then the bounded repair: never a recomposition, never
// a model call. Mockups draw their source, so they follow it with nothing to do. A website is a project of its own
// with its own history, so it changes only when asked, as a new version of it (the website-sync action). Generated
// notes are written again from the facts where they stand. It all comes back as board operations, applied as one
// step (one undo), and a report to show before it is applied.

import type { Measure } from '../graphics/text';
import { annotate } from './annotate';
import { applyBoardOps, type BoardOp, type BoardState, type Material } from './model';
import { changedTokens, overridesOf, propagate, resetOverrides, TOKEN_LABEL, type MasterDesignSystem, type Repair, type TokenKey } from './system';

export interface SyncEntry {
  id: string;
  name: string;
  type: Material['type'];
  /** what the change does to it */
  outcome: 'updated' | 'unaffected' | 'follows-source' | 'website' | 'not-composed';
  /** properties set to the new values */
  updated: number;
  /** what was kept as it is, and why (local overrides, locks, overrides the change made hard to read) */
  kept: { node: string; name: string; prop: string; why: string }[];
  /** colours the bounded repair changed to keep something readable */
  repaired: Repair[];
  /** local overrides reset to the system, as approved */
  reset: number;
}

export interface SyncPlan {
  changed: TokenKey[];
  entries: SyncEntry[];
  /** everything, as one step: the materials' new documents and bindings, the system, the notes */
  ops: BoardOp[];
  /** generated notes written again or added */
  notes: number;
  summary: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A system change planned through a board (see the head of this file). `reset` names, per material, the objects
 * whose local overrides the designer approved resetting (or 'all'); nothing else of theirs is touched.
 */
export function syncSystem(b: BoardState, next: MasterDesignSystem, opts: { measure?: Measure; reset?: Record<string, readonly string[] | 'all'>; annotate?: boolean } = {}): SyncPlan {
  const from = b.system;
  const changed = from ? changedTokens(from, next) : [];
  const entries: SyncEntry[] = [];
  const ops: BoardOp[] = [];
  for (const m of b.materials) {
    const base = { id: m.id, name: m.name, type: m.type, updated: 0, kept: [], repaired: [], reset: 0 };
    if (m.type === 'mockup') {
      entries.push({ ...base, outcome: 'follows-source' });
      continue;
    }
    if (m.type === 'website') {
      entries.push({ ...base, outcome: 'website' });
      continue;
    }
    if (!m.doc || !from) {
      entries.push({ ...base, outcome: 'not-composed' });
      continue;
    }
    const pr = propagate(m.doc, m.bindings, from, next, opts.measure);
    let doc = pr.doc;
    let kept = pr.kept;
    let reset = 0;
    const approved = opts.reset?.[m.id];
    if (approved) {
      const nodes = approved === 'all' ? overridesOf(doc, pr.bindings, next).map((o) => o.node) : [...approved];
      if (nodes.length) {
        const r = resetOverrides(doc, pr.bindings, next, nodes, opts.measure);
        doc = r.doc;
        reset = r.reset;
        kept = kept.filter((k) => !nodes.includes(k.node));
      }
    }
    const touched = pr.updated > 0 || reset > 0 || pr.repaired.length > 0;
    entries.push({ ...base, outcome: touched ? 'updated' : 'unaffected', updated: pr.updated, kept, repaired: pr.repaired, reset });
    if (touched || doc !== m.doc) ops.push({ op: 'material-update', id: m.id, set: { doc, bindings: pr.bindings } });
  }
  ops.push({ op: 'system', system: next });
  let notes = 0;
  if (opts.annotate !== false && b.nodes.some((n) => n.type === 'note' && n.generated)) {
    const after = applyBoardOps(b, ops);
    if (after.ok) {
      const noteOps = annotate(after.board);
      notes = noteOps.filter((op) => op.op === 'note-write' || op.op === 'node-add').length;
      ops.push(...noteOps);
    }
  }
  return { changed, entries, ops, notes, summary: summarize(changed, entries, notes) };
}

/** The plan in words, for the confirmation before it is applied and the history after. */
function summarize(changed: readonly TokenKey[], entries: readonly SyncEntry[], notes: number): string {
  if (!changed.length) return 'Nothing in the system changed.';
  const what = changed.map((k) => TOKEN_LABEL[k]).join(', ');
  const updated = entries.filter((e) => e.outcome === 'updated');
  const props = updated.reduce((s, e) => s + e.updated, 0);
  const kept = entries.flatMap((e) => e.kept.map((k) => ({ ...k, material: e.name })));
  const repaired = entries.reduce((s, e) => s + e.repaired.length, 0);
  const reset = entries.reduce((s, e) => s + e.reset, 0);
  const parts = [`Changed: ${what}.`, updated.length ? `${plural(updated.length, 'material')} updated (${plural(props, 'property', 'properties')}).` : 'No material uses what changed.'];
  if (kept.length) parts.push(`${plural(kept.length, 'thing')} kept as it is: ${kept.slice(0, 3).map((k) => `${k.material}, ${k.name} (${k.prop})`).join('; ')}${kept.length > 3 ? '…' : ''}.`);
  if (reset) parts.push(`${plural(reset, 'local override')} reset to the system, as approved.`);
  if (repaired) parts.push(`${plural(repaired, 'colour')} adjusted by the bounded repair so ${repaired === 1 ? 'it stays' : 'they stay'} readable.`);
  if (entries.some((e) => e.outcome === 'follows-source')) parts.push('Mockups follow the designs they show.');
  if (entries.some((e) => e.outcome === 'website')) parts.push('The website is a project of its own: carry the change into it separately, as a new version.');
  if (notes) parts.push(`${plural(notes, 'note')} written again from the facts.`);
  return parts.join(' ');
}
