// lib/ux-v0/boards/style.ts — a board's design language changed as one decision, carried through every material.
//
//   the new language → the system re-dressed (systemInStyle) → its tokens carried through each material's bindings
//   (syncSystem: local overrides and locks kept and said) → the materials nobody has touched recomposed in the new
//   language, each in its own construction (composeMaterial) → one set of operations, one undo, and a report first.
//
// A material edited by hand since it was composed keeps its composition: its colours and faces follow the system (as
// bound), its arrangement stays the designer's, and the report says so. A locked material, or one holding locked
// objects, is not recomposed. Websites and mockups behave as syncSystem says. Nothing here calls a model.

import { walk } from '../graphics/doc';
import type { Measure } from '../graphics/text';
import { styledDirection } from '../graphics/styles/apply';
import type { StyleSelection } from '../graphics/styles/blend';
import type { StyleDNA } from '../graphics/styles/schema';
import type { Asset } from '../graphics/doc';
import { applyBoardOps, type BoardOp, type BoardState } from './model';
import { annotate } from './annotate';
import { composeMaterial, graphicIndex, siblingIndex } from './plan';
import { syncSystem, type SyncPlan } from './sync';
import { directionOfSystem, overridesOf, systemInStyle, type MasterDesignSystem } from './system';

export interface RestylePlan {
  system: MasterDesignSystem;
  /** the tokens carried through the bindings */
  sync: SyncPlan;
  /** materials recomposed in the new language */
  regenerated: { id: string; name: string; construction: string }[];
  /** materials whose composition is kept, and why */
  kept: { id: string; name: string; why: string }[];
  ops: BoardOp[];
  summary: string;
}

/** A board's design language changed (null: it speaks none), planned as operations (see the head of this file). */
export function planRestyle(
  b: BoardState,
  sel: StyleSelection | null,
  opts: {
    measure?: Measure;
    customs?: readonly StyleDNA[];
    assets?: readonly Asset[];
  } = {},
): RestylePlan | null {
  const from = b.system;
  if (!from) return null;
  const customs = opts.customs ?? [];
  const dir = sel ? styledDirection(directionOfSystem(from), { ...sel, seedKey: sel.seedKey ?? from.id }, { customs }) : null;
  const next = systemInStyle(from, dir, customs);
  const sync = syncSystem(b, next, { measure: opts.measure });
  const regenerated: RestylePlan['regenerated'] = [];
  const kept: RestylePlan['kept'] = [];
  const ops: BoardOp[] = [...sync.ops];
  for (const m of b.materials) {
    if (m.type !== 'graphic' || !m.doc) continue;
    const node = b.nodes.find((n) => n.type === 'material' && n.material === m.id);
    if (node?.locked) {
      kept.push({ id: m.id, name: m.name, why: 'it is locked' });
      continue;
    }
    if (m.doc.artboards.some((ab) => walk(ab).some((l) => l.node.locked))) {
      kept.push({ id: m.id, name: m.name, why: 'it holds locked objects' });
      continue;
    }
    const edited = m.composed === undefined || m.doc.revision !== m.composed || overridesOf(m.doc, m.bindings, from).length > 0;
    if (edited || !next.style) {
      kept.push({
        id: m.id,
        name: m.name,
        why: edited ? 'it was edited by hand: its arrangement is kept, its colours and faces follow the system' : 'no language to build it in: its arrangement is kept',
      });
      continue;
    }
    // the material's own composition kept through the change of language: its concept's structure replayed
    const was = m.doc.artboards[0]?.concept;
    const made = composeMaterial(m, next, {
      measure: opts.measure,
      assets: opts.assets ?? b.assets,
      sibling: Math.max(0, siblingIndex(b.materials, m)),
      order: Math.max(0, graphicIndex(b.materials, m)),
      ...(was ? { replay: { ...was.request, keys: { org: was.org, type: was.type, colouring: was.colouring, focal: was.focal } } } : {}),
    });
    regenerated.push({
      id: m.id,
      name: m.name,
      construction: made.plan.archetype,
    });
    ops.push({
      op: 'material-update',
      id: m.id,
      set: {
        doc: made.doc,
        bindings: made.bindings,
        plan: made.plan,
        composed: made.doc.revision,
        findings: made.left.length,
        status: made.left.length ? 'failed' : 'ready',
        error: made.left.length ? `${made.left.length} problem${made.left.length === 1 ? '' : 's'} left after the bounded repair: ${made.left[0].message}` : '',
      },
    });
  }
  // the generated notes written again from the facts of the rebuilt materials
  if (regenerated.length && b.nodes.some((n) => n.type === 'note' && n.generated)) {
    const after = applyBoardOps(b, ops);
    if (after.ok) ops.push(...annotate(after.board));
  }
  const name = next.style ? next.direction.name : 'no design language';
  const summary = [
    `The board now speaks ${name}.`,
    regenerated.length ? `${regenerated.length} material${regenerated.length === 1 ? '' : 's'} rebuilt in it, each in its own way (${[...new Set(regenerated.map((r) => r.construction.replace(/-/g, ' ')))].slice(0, 4).join(', ')}).` : '',
    kept.length
      ? `${kept.length} kept as composed: ${kept
          .slice(0, 3)
          .map((k) => `${k.name} (${k.why})`)
          .join('; ')}${kept.length > 3 ? '…' : ''}.`
      : '',
    sync.summary !== 'Nothing in the system changed.' ? sync.summary : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { system: next, sync, regenerated, kept, ops, summary };
}
