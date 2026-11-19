// lib/ux-v0/arrange.ts — the opening in the arrangement the approved direction carries, held in code.
//
// A direction's tokens and look are applied in code whatever a model writes (lib/ux-v0/design.ts). The arrangement a
// creative reading asked of the opening (lib/ux-v0/interpret.ts: layered, overlapping, off-axis) is held the same
// way, at generation and again whenever the drawn design is checked (lib/ux-v0/evaluate.ts).

import { arrangedOpening, overlapsIn, type Piece } from './compose';
import type { ArtDirection } from './direction';
import { hashText, seeded } from './layout';
import { normalizeSpec, type DesignSpec } from './spec';
import type { Moodboard } from './types';

/**
 * The opening in the arrangement the approved direction carries (words layered over the picture, the title crossing
 * it, or set off-axis), whatever the model wrote: an opening the model wrote as a library hero is rebuilt from its
 * own words and its own picture; one it composed itself is kept, and given the frames the direction asks for. A
 * locked opening, a screen of an app, or a page that opens with something else is left as it is.
 */
export function holdArrangement(spec: DesignSpec, dir: ArtDirection, moodboard: Moodboard | null): DesignSpec {
  if (!dir.arrange || spec.pageType !== 'website') return spec;
  // the opening: the page's first part when it is a hero or composed; on a page that leads with its work (a
  // gallery first), the hero that follows it
  const lead = spec.sections.findIndex((x) => x.kind !== 'nav');
  const i = lead >= 0 && (spec.sections[lead].kind === 'hero' || spec.sections[lead].kind === 'compose') ? lead : spec.sections.findIndex((x) => x.kind === 'hero');
  const first = i >= 0 ? spec.sections[i] : null;
  if (!first || first.locked) return spec;
  const frames = (hasImg: boolean): Record<string, string> => ({
    ...(dir.arrange === 'layered' && hasImg && dir.frame?.bleed ? { span: 'bleed' } : dir.arrange !== 'layered' ? { span: 'wide' } : {}),
    ...(dir.arrange === 'layered' && hasImg && dir.frame?.tall ? { tall: 'screen' } : {}),
  });
  let next: Record<string, unknown> | null = null;
  let note = '';
  if (first.kind === 'compose') {
    const root = first.content.root as Piece;
    if (overlapsIn(root) || root.t === 'field') {
      const f = frames(first.images.length > 0);
      if (Object.entries(f).every(([k, v]) => first.content[k] === v || first.content[k])) return spec;
      next = { ...first, content: { ...f, ...Object.fromEntries(Object.entries(first.content).filter(([, v]) => v !== '')) } };
    }
  }
  if (!next && first.kind === 'hero') {
    const c = first.content;
    const images = first.images.slice(0, 1);
    const root = arrangedOpening({ eyebrow: c.eyebrow || undefined, title: String(c.title), lead: c.subtitle || undefined, action: c.primary || undefined }, images.length > 0, seeded(hashText(`${dir.id}|${dir.language}|arranged`)), dir.arrange, dir.frame?.display);
    next = { id: first.id, kind: 'compose', variant: 'free', images, tone: first.tone, pad: first.pad, content: { root, ...frames(images.length > 0) } };
    note = `The opening composed as the direction asks: ${dir.arrange === 'layered' ? 'its words layered over its picture' : dir.arrange === 'overlap' ? 'its title crossing its picture' : 'its title set off-axis'}.`;
  }
  if (!next) return spec;
  const held = normalizeSpec({ ...spec, sections: spec.sections.map((x, j) => (j === i ? next : x)), notes: note ? [...spec.notes, note].slice(-8) : spec.notes }, moodboard);
  return held && held.sections.length === spec.sections.length ? held : spec;
}
