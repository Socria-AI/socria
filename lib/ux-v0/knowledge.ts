// lib/ux-v0/knowledge.ts — what SocriaUX knows about design, written down so it can be used.
//
// Not a pile of screenshots: principles, each with the reason it works, the
// area it belongs to, and (where SocriaUX can measure it) the check that does.
// They are used three ways:
//
//   - the checks cite them (lib/ux-v0/evaluate.ts): every finding says why it
//     matters, in a sentence a designer can disagree with;
//   - generation is given the few that matter most for the approved direction
//     (a kinetic poster needs different reminders from a public service);
//   - critique and the Direction step can say what a choice rests on.
//
// They are SocriaUX's own synthesis of long-standing practice (Swiss and
// editorial typography, the measure and modular scales, WCAG, motion timing),
// not copied from any gallery or course. Reference galleries such as Awwwards,
// Godly, Mobbin or Codrops are not integrated: nothing here is fetched from
// them, and no claim is made that it is.

import type { Look } from './spec';

export type Area = 'typography' | 'composition' | 'hierarchy' | 'colour' | 'imagery' | 'motion' | 'interaction' | 'responsive' | 'accessibility' | 'references' | 'critique';

export interface Principle {
  id: string;
  area: Area;
  /** the principle, as an instruction */
  rule: string;
  /** why it works */
  why: string;
}

export const DESIGN_PRINCIPLES: readonly Principle[] = [
  // typography
  { id: 'type.measure', area: 'typography', rule: 'Keep body lines between about 45 and 75 characters.', why: 'Shorter lines break the reading rhythm; longer ones lose the eye on its way back to the next line.' },
  { id: 'type.scale', area: 'typography', rule: 'Size type from one modular scale, and let the ratio match the voice: tight for quiet, wide for loud.', why: 'Sizes related by one ratio read as a system; arbitrary sizes read as accidents.' },
  { id: 'type.pairing', area: 'typography', rule: 'Pair faces by contrast of role, not by similarity: one voice for headlines, one steady face for reading.', why: 'Two similar faces fight; a clear division of labour lets each do its job.' },
  { id: 'type.few-sizes', area: 'typography', rule: 'Use few sizes, far apart.', why: 'Hierarchy comes from difference; five near-equal sizes flatten it.' },
  { id: 'type.case', area: 'typography', rule: 'Set long text in sentence case; reserve capitals for short labels, and give them air.', why: 'Capitals remove word shapes, slowing reading; tracking restores some legibility.' },
  { id: 'type.kinetic', area: 'typography', rule: 'Animate only short headlines letter by letter.', why: 'Beyond a few words the arrival outlasts the reader’s patience and the sentence loses its shape.' },
  // composition
  { id: 'comp.grid', area: 'composition', rule: 'Hang everything from one grid; break it on purpose, once, where emphasis is wanted.', why: 'Alignment makes relationships visible; a single deliberate break draws the eye because the rest holds.' },
  { id: 'comp.rhythm', area: 'composition', rule: 'Vary neighbouring sections; repeat only what should read as a set.', why: 'Identical neighbours blur into one; contrast in rhythm keeps a long page legible.' },
  { id: 'comp.whitespace', area: 'composition', rule: 'Treat space as material: group with proximity, separate with distance before rules.', why: 'The eye reads grouping from space first; lines are a second resort.' },
  { id: 'comp.asymmetry', area: 'composition', rule: 'Prefer asymmetric balance to centring when the content has a direction.', why: 'Centred layouts are static; asymmetry creates movement and a reading path.' },
  { id: 'comp.focal', area: 'composition', rule: 'Give each screen one focal point.', why: 'Two equal focal points split attention, and neither wins.' },
  // hierarchy
  { id: 'hier.contrast', area: 'hierarchy', rule: 'Make the most important thing the most different: size, weight, colour or space.', why: 'Attention goes to difference; importance has to be visible, not only stated.' },
  { id: 'hier.one-action', area: 'hierarchy', rule: 'One primary action per view; everything else steps back.', why: 'Several equal calls to action make a visitor choose, and many choose nothing.' },
  // colour
  { id: 'colour.roles', area: 'colour', rule: 'Give each colour one job: ground, text, accent, line.', why: 'A colour that means one thing teaches the visitor what to look at.' },
  { id: 'colour.accent', area: 'colour', rule: 'Spend the accent sparingly: on the action and the one word that matters.', why: 'An accent everywhere is no accent.' },
  { id: 'colour.ground', area: 'colour', rule: 'Choose the ground first; every other colour must read on it.', why: 'The ground is most of the page: it sets temperature and every contrast.' },
  // imagery
  { id: 'img.treatment', area: 'imagery', rule: 'Treat all pictures one way (tone, crop, frame).', why: 'A consistent treatment makes mixed sources feel art-directed rather than collected.' },
  { id: 'img.purpose', area: 'imagery', rule: 'Show a picture only when it says something the words cannot.', why: 'Decorative stock pictures dilute the real ones and slow the page.' },
  // motion
  { id: 'motion.purpose', area: 'motion', rule: 'Move things to show what is new, what belongs together, or where to look; never only to decorate.', why: 'Motion is attention: spent everywhere, it stops meaning anything.' },
  { id: 'motion.timing', area: 'motion', rule: 'Short for small, longer for large: about 120–200 ms for a hover, 300–700 ms for an arrival, rarely more than a second.', why: 'Duration should match the distance and size of what moves, or it feels sluggish or abrupt.' },
  { id: 'motion.easing', area: 'motion', rule: 'Ease out for arrivals, ease in for departures; avoid linear except for continuous loops.', why: 'Real objects decelerate as they arrive; linear motion reads mechanical.' },
  { id: 'motion.stagger', area: 'motion', rule: 'Stagger a group in reading order, briefly.', why: 'A short stagger reveals structure; a long one makes the visitor wait for the last item.' },
  { id: 'motion.reduced', area: 'motion', rule: 'Always offer a reduced-motion alternative: fade, never travel.', why: 'Parallax and large movements cause discomfort for people with vestibular disorders.' },
  // interaction
  { id: 'ix.targets', area: 'interaction', rule: 'Make anything tappable at least 44 by 44 px.', why: 'Fingers are imprecise; small targets cause mistaps, worst for older or motor-impaired people.' },
  { id: 'ix.feedback', area: 'interaction', rule: 'Answer every action within a tenth of a second, even if only with a state change.', why: 'Below that threshold an interface feels direct; above it, uncertain.' },
  // responsive
  { id: 'resp.no-overflow', area: 'responsive', rule: 'Nothing may be wider than the screen.', why: 'Sideways scrolling on a phone hides content and breaks trust in the page.' },
  { id: 'resp.priority', area: 'responsive', rule: 'On a phone, keep the order of importance, not the desktop’s arrangement.', why: 'A narrow screen is read top to bottom; what matters most must come first.' },
  // accessibility
  { id: 'a11y.contrast', area: 'accessibility', rule: 'Body text at 4.5:1 or more against its ground (7:1 for AAA); large text at 3:1.', why: 'Low contrast excludes people with low vision and everyone in bright light.' },
  { id: 'a11y.meaning', area: 'accessibility', rule: 'Never let colour or motion carry meaning alone.', why: 'Some people cannot see the colour, or have motion turned off.' },
  // references
  { id: 'ref.aspect', area: 'references', rule: 'Take from a reference only what it is kept for (its light, its type, its pacing), never its subject or layout wholesale.', why: 'Copying a reference reproduces someone else’s answer to someone else’s brief.' },
  { id: 'ref.avoid', area: 'references', rule: 'Read references to avoid as seriously as ones to follow.', why: 'What a designer rules out often says more about their taste than what they keep.' },
  // critique
  { id: 'crit.evidence', area: 'critique', rule: 'Ground every judgement in something visible or measured.', why: 'A critique that cannot point to its evidence cannot be acted on, or disagreed with.' },
  { id: 'crit.brief', area: 'critique', rule: 'Judge a design against its brief and direction before taste.', why: 'A beautiful page that ignores its purpose has failed the brief.' },
];

const BY_ID = new Map(DESIGN_PRINCIPLES.map((p) => [p.id, p]));
export const principle = (id: string): Principle | null => BY_ID.get(id) ?? null;

/** The finding a check reports, and the principle that says why it matters. */
export const FINDING_PRINCIPLE: Record<string, string> = {
  overflow: 'resp.no-overflow',
  contrast: 'a11y.contrast',
  target: 'ix.targets',
  image: 'img.purpose',
  hierarchy: 'hier.contrast',
  headline: 'type.few-sizes',
  measure: 'type.measure',
  rhythm: 'comp.rhythm',
  cliche: 'crit.brief',
  length: 'comp.focal',
  placeholder: 'crit.evidence',
  generic: 'comp.grid',
  fidelity: 'crit.brief',
  motion: 'motion.purpose',
};

/** Why a finding matters, in one sentence. */
export function whyFor(kind: string, override?: string): string {
  const p = principle(override ?? FINDING_PRINCIPLE[kind] ?? '');
  return p ? p.why : '';
}

/**
 * The few principles a direction most needs reminding of, for generation: its
 * motion, its grid and type character, and always hierarchy and contrast.
 */
export function principlesForLook(look: Look | null | undefined, n = 8): Principle[] {
  const ids = ['hier.contrast', 'a11y.contrast', 'comp.focal'];
  if (look) {
    // what moves needs reminding first: it is the newest part of the look, and the easiest to overdo
    const m = look.motion;
    if (m && (m.headline === 'letters' || m.headline === 'words')) ids.push('type.kinetic');
    if (m && m.feel !== 'still') ids.push('motion.purpose', 'motion.reduced');
    if (look.grid === 'asymmetric' || look.grid === 'poster') ids.push('comp.asymmetry', 'comp.grid');
    if (look.grid === 'swiss' || look.grid === 'editorial' || look.grid === 'modular') ids.push('comp.grid', 'comp.whitespace');
    if (look.case === 'upper') ids.push('type.case');
    if (look.ratio >= 1.45) ids.push('type.few-sizes');
    else ids.push('type.measure');
  }
  ids.push('hier.one-action');
  ids.push('img.treatment', 'colour.accent', 'comp.rhythm');
  return [...new Set(ids)].slice(0, n).map((id) => BY_ID.get(id)!).filter(Boolean);
}

/** Those principles, as lines for a prompt. */
export function knowledgeBrief(look: Look | null | undefined): string {
  return `DESIGN PRINCIPLES TO HONOUR (each with why):\n${principlesForLook(look)
    .map((p) => `- ${p.rule} (${p.why})`)
    .join('\n')}`;
}
