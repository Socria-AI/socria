// lib/ux-v0/dsi/generate.ts — generating within a design system without turning it into a template.
//
//   brief → load the system → resolve its hard constraints → read its approved principles → form an original concept →
//   plan an independent composition → construct editable objects → apply its tokens and assets → evaluate brand
//   fidelity → present
//
// The system supplies identity (tokens, faces, the approved logo, rules); the generative engine supplies expression
// (concept, composition, construction). So a graphic's directions are the engine's own directions, each speaking the
// system's identity; a board's system options are three expressions of one identity; and every result is checked for
// fidelity before it is shown. No imported layout, composition or template is ever reused.

import { proposeSystems } from '../boards/pipeline';
import type { BoardBrief } from '../boards/model';
import type { MasterDesignSystem } from '../boards/system';
import { composeGraphic, type GraphicBrief, type GraphicDirection } from '../graphics/compose';
import type { GraphicDoc } from '../graphics/doc';
import type { Measure } from '../graphics/text';
import { directionInBrand, guardedForBrand, toMasterSystem, type AdaptOpts } from './adapters';
import { fidelityOfDoc, type Fidelity } from './fidelity';
import { bindingRules, visualLanguageOf } from './intelligence';
import { bindForBrand } from './link';
import type { DocBindings } from '../graphics/state';
import type { SystemContent } from './schema';

/** The engine's own directions, each speaking the system's identity (its expression untouched). */
export function brandDirections(c: SystemContent, options: readonly GraphicDirection[], opts: AdaptOpts = {}): GraphicDirection[] {
  return options.map((d) => directionInBrand(c, d, opts));
}

/** A board's system options: three expressions (composition, shapes, vocabulary, style) of one identity. */
export function brandBoardOptions(c: SystemContent, brief: BoardBrief, salt: string, opts: AdaptOpts & { round?: number; assetId?: string } = {}): MasterDesignSystem[] {
  const proposals = proposeSystems({ ...brief, name: brief.name || c.identity.name }, salt, { round: opts.round ?? 0 });
  return proposals.map((p) => toMasterSystem(c, p, opts));
}

/** What the system asks of a design, in words: for notes, annotations and any model prompt. */
export function brandAsks(c: SystemContent): string {
  const { hard, soft } = bindingRules(c);
  const vl = visualLanguageOf(c);
  return [
    `DESIGN SYSTEM — ${c.identity.name}: its colours, faces and approved logo are fixed; compose freely within them. Do not reuse any layout or composition from its source.`,
    hard.length ? `Rules (always): ${hard.map((i) => i.statement).join('; ')}.` : '',
    soft.length ? `Preferences: ${soft.map((i) => i.statement).join('; ')}.` : '',
    vl.personality.length ? `Personality: ${vl.personality.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface BrandComposed {
  doc: GraphicDoc;
  bindings: DocBindings;
  fidelity: Fidelity;
  direction: GraphicDirection;
}

/**
 * One graphic generated within the system: the engine composes it from the brief and a direction in the system's
 * identity, the approved logo is placed where the brand is named, its bindings are recorded, and its fidelity checked.
 */
export function composeInBrand(c: SystemContent, brief: GraphicBrief, base: GraphicDirection, opts: AdaptOpts & { measure?: Measure; seed?: number; name?: string } = {}): BrandComposed {
  const direction = directionInBrand(c, base, opts);
  // the brand is named, so its approved logo has a place (the composer sets the name; the logo replaces it)
  const named = brief.content.brand ? brief : { ...brief, content: { ...brief.content, brand: c.identity.name } };
  const composed = composeGraphic(named, direction, { measure: opts.measure, seed: opts.seed, name: opts.name });
  // the logo placed, the system's hard rules resolved, then the document's own checks on the colours it really has
  const doc = guardedForBrand(composed.doc, c, opts, opts.measure).doc;
  const bindings = bindForBrand(doc, direction.look);
  return { doc, bindings, fidelity: fidelityOfDoc(doc, c, opts), direction };
}
