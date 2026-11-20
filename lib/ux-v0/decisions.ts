// lib/ux-v0/decisions.ts — the approved direction's decisions, one record, each with its reason and whether the
// drawn page keeps it.
//
// A direction is not prompt context: it is a set of decisions (typography, colour, composition, hierarchy,
// imagery, shape, spacing, interaction, motion, accessibility) that the generator is told, that code holds after
// generation (lib/ux-v0/arrange.ts, design.ts, edit.ts) and that the evaluation checks (evaluate.ts fidelity). This
// gathers them into one structured, validated record the designer can read: what was decided, why, how it is held,
// and whether the design on the canvas keeps it now. It is a view of the direction, not a second format: everything
// here is read from the direction, the design and the rendered page's audit.

import type { ArtDirection } from './direction';
import type { PageAudit } from './evaluate';
import { describeForm } from './form';
import type { DesignSpec } from './spec';
import { AXIS_LABEL } from './strategy';

export const DECISION_AREAS = ['concept', 'typography', 'colour', 'composition', 'hierarchy', 'imagery', 'shape', 'spacing', 'interaction', 'motion', 'accessibility'] as const;
export type DecisionArea = (typeof DECISION_AREAS)[number];

export const DECISION_AREA_LABEL: Record<DecisionArea, string> = {
  concept: 'Concept',
  typography: 'Typography',
  colour: 'Colour',
  composition: 'Composition',
  hierarchy: 'Hierarchy',
  imagery: 'Pictures',
  shape: 'Shapes',
  spacing: 'Space and rhythm',
  interaction: 'Interaction',
  motion: 'Motion',
  accessibility: 'Accessibility',
};

export interface DirectionDecision {
  area: DecisionArea;
  label: string;
  /** what was decided, in a few words */
  value: string;
  /** why, where the direction says */
  because: string;
  /** whether the design keeps it now; null where it is said, not measured */
  held: boolean | null;
  /** how it is held or checked */
  how: string;
}

const first = (xs: readonly (string | undefined)[] | undefined) => (xs ?? []).find((x) => !!x && x.trim()) ?? '';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The direction's decisions and whether the design keeps each (see the head of this file). */
export function decisionsOf(dir: ArtDirection | null | undefined, spec: DesignSpec, audit?: PageAudit | null): DirectionDecision[] {
  const look = spec.look;
  const d = dir ?? null;
  const dl = d?.look;
  const out: DirectionDecision[] = [];
  const push = (area: DecisionArea, value: string, because: string, held: boolean | null, how: string) => out.push({ area, label: DECISION_AREA_LABEL[area], value, because, held, how });

  push('concept', d ? `${d.name}: ${d.concept}`.replace(/:\s*$/, '') : spec.title, first(d?.rationale), null, 'Said by the direction; read through every decision below.');

  const faces = `${spec.tokens.fonts.display} for headlines, ${spec.tokens.fonts.body} for text`;
  const facesKept = !d || (spec.tokens.fonts.display === d.tokens.fonts.display && spec.tokens.fonts.body === d.tokens.fonts.body);
  const drawn = audit ? Object.keys(audit.style?.families ?? {}).some((f) => f.toLowerCase().includes(spec.tokens.fonts.display.toLowerCase().split(' ')[0])) : null;
  push('typography', `${faces}; ${look.case === 'upper' ? 'capitals, ' : ''}${look.tracking} tracking`, first(d?.reading?.said) || (d ? `the ${d.language} language's pairing` : ''), facesKept && drawn !== false, drawn === null ? 'The design’s faces are the direction’s.' : drawn ? `The drawn headlines are set in ${spec.tokens.fonts.display}.` : `The drawn headlines are not in ${spec.tokens.fonts.display}.`);

  const c = spec.tokens.colors;
  const colourKept = !d || (c.background === d.tokens.colors.background && (c.accent === d.tokens.colors.accent || spec.notes.some((n) => /contrast|darken|read/i.test(n))));
  push('colour', `ground ${c.background}, text ${c.text}, accent ${c.accent}${look.accent2 ? `, second ${look.accent2}` : ''}`, d?.imagery ? '' : '', colourKept, colourKept ? 'The palette is the direction’s (an accent darkened only where text must read).' : 'The palette has moved from the direction’s.');

  const st = d?.strategy;
  const composed = spec.sections.filter((s) => s.kind === 'compose').length;
  const wanted = st ? st.recompose : 0;
  push(
    'composition',
    st ? `${AXIS_LABEL[st.axis]}; ${wanted ? `${wanted} part${wanted > 1 ? 's' : ''} composed from their own content` : 'the library’s layouts, kept plain'}` : d?.composition || 'the library’s layouts',
    first(st?.said),
    !st || !wanted || composed >= Math.min(wanted, spec.sections.length - 2),
    st ? 'Held in code after generation (the strategy recomposes the parts it names); the evaluation reports a part turned back into a stock layout.' : 'No strategy to hold.',
  );

  const h1 = audit?.headings.find((h) => h.level === 1);
  const ratio = h1 && audit?.bodySize ? h1.size / audit.bodySize : null;
  push('hierarchy', st ? `type ${st.type.role}${st.type.vertical ? ', labels upright' : ''}` : `${spec.tokens.scale} scale`, '', ratio === null ? null : ratio >= 2, ratio === null ? 'Measured on the drawn page.' : `The page title is ${ratio.toFixed(1)}× the body text.`);

  push('imagery', `${look.frame} frames${st ? `; pictures ${st.images}` : ''}`, d?.imagery ?? '', !dl || look.frame === dl.frame, !dl || look.frame === dl.frame ? 'Pictures are framed as the direction frames them.' : `Pictures are framed ${look.frame}, not ${dl.frame}.`);

  push('shape', look.form ? describeForm(look.form) : 'no shape system', first(d?.formSaid), !dl?.form || same(look.form, dl.form), !dl?.form ? 'No shape system to keep.' : same(look.form, dl.form) ? 'Every shape on the page is drawn from this system.' : 'The shapes have moved from the direction’s system.');

  push('spacing', `${spec.tokens.scale} scale, ${look.rhythm} rhythm, ${look.width} width`, '', !d || (spec.tokens.scale === d.tokens.scale && look.rhythm === dl!.rhythm), 'Spacing tokens are the direction’s.');

  push('interaction', `${look.buttons} buttons, ${look.motion?.hover ?? 'no'} hover`, '', !dl || (look.buttons === dl.buttons && (look.motion?.hover ?? '') === (dl.motion?.hover ?? '')), 'Buttons and hovers are the direction’s.');

  const feel = look.motion?.feel ?? 'still';
  push('motion', feel === 'still' ? 'still: nothing moves' : `${feel}, ${look.motion?.duration ?? 0} ms${look.motion?.story ? ', a pinned story' : ''}`, '', !dl || feel === (dl.motion?.feel ?? 'still'), 'Every movement has its reduced-motion alternative.');

  const contrastOk = audit ? audit.contrast.every((x) => x.ratio >= x.need) : null;
  push('accessibility', 'AA contrast, 44 px targets, reduced motion, named controls', '', contrastOk === null ? null : contrastOk && !(audit?.a11y && (audit.a11y.noAlt.length || audit.a11y.noName.length || audit.a11y.noLabel.length)), contrastOk === null ? 'Checked on the drawn page.' : contrastOk ? 'Every text on the drawn page reads at its ratio.' : 'Some text reads below its ratio.');
  return out;
}
