// lib/ux-v0/graphics/composition/render.ts — a Composition Plan drawn: its family's procedure, then the solver.
//
// The composer (compose.ts) hands over its own helpers (the Kit), as it does to the style constructions, so this module
// imports nothing at run time from it. What comes back is ordinary objects (text, shapes, patterns, pictures) and the
// relationships the family relied on, kept with the artboard's record of how it was composed.

import type { Ctx, Kit } from '../compose';
import type { Node } from '../doc';
import { GEOMETRIC } from './families-geometric';
import { TYPOGRAPHIC } from './families-type';
import { IMAGERY } from './families-image';
import { EXPERIMENTAL } from './families-experimental';
import { INFORMATION } from './families-info';
import { makeCC, solve, unresolved, type CC } from './kit';
import { FAMILY_IDS, type CompositionPlan, type Relation } from './schema';

export const RENDERERS: Record<string, (c: CC) => void> = { ...GEOMETRIC, ...TYPOGRAPHIC, ...IMAGERY, ...EXPERIMENTAL, ...INFORMATION };

const missing = FAMILY_IDS.filter((id) => !RENDERERS[id]);
if (missing.length) throw new Error(`Composition families without a procedure: ${missing.join(', ')}`);

export interface Rendered {
  nodes: Node[];
  relations: Relation[];
  notes: string[];
  /** What the hard rules could not settle (words over words, a broken word, words outside the safe area): none is a plan that held. */
  unresolved: string[];
}

/** A plan's objects, placed by its family and held to the rules (kit.ts solve). */
export function renderComposition(k: Kit, x: Ctx, plan: CompositionPlan): Rendered {
  const c = makeCC(k, x, plan);
  RENDERERS[plan.family](c);
  const nodes = solve(c, c.out);
  return { nodes, relations: c.relations, notes: c.notes, unresolved: unresolved(c, nodes) };
}
