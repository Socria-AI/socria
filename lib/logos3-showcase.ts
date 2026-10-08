// lib/logos3-showcase.ts
//
// WHAT LOGOS 3 SHOWS OF ITSELF: a short list of real things it builds, each
// from the words that ask for it.
//
// Every item names an example the engine (lib/model/engineering.ts,
// lib/model/dynamics-examples.ts) or Live 3D (SCENE_EXAMPLES) already carries,
// and quotes that example's own request. The picture beside it is built live
// by the product's own code from that same definition — never a screenshot,
// never a drawing of one (components/logos3/LiveExample.tsx).
//
// The cover takes them in turn, one per opening, so somebody who opens it
// twice sees two different kinds of problem: a heat sink drawn in 3D,
// pattern formation, a strange attractor, an engine's layout, an invasion
// front, an oscillator that keeps its own beat. Each surface that shows Logos 3 picks a different subject from
// the others (the homepage stage has its own; the docs pages theirs).
//
// PURE.

import { ENGINEERING, SCENE_EXAMPLES } from './model/engineering';
import { DYNAMICS } from './model/dynamics-examples';

export interface ShowcaseItem {
  /** the example's id in its registry */
  id: string;
  kind: 'model' | 'scene';
  /** a few words for what it is */
  title: string;
  /** what the person typed — the example's own request, verbatim. A design is built from exactly these words. */
  said: string;
  /** what to do with the live figure */
  cue: string;
}

const ask = (id: string) => [...ENGINEERING, ...DYNAMICS].find((e) => e.id === id)?.ask ?? '';
const say = (id: string) => SCENE_EXAMPLES.find((e) => e.id === id)?.say ?? '';

/** The cover's rotation: a different kind of problem each time it opens. */
export const COVER_SHOWCASE: readonly ShowcaseItem[] = [
  { id: 'heatsink', kind: 'scene', title: 'A heat sink, from its description', said: say('heatsink'), cue: 'Drawn in 3D by Live 3D from the sentence above. Drag to turn it.' },
  { id: 'patterns', kind: 'model', title: 'Patterns from a reaction', said: ask('patterns'), cue: 'Solved live: a pattern grows out of a small seed. Change the feed rate.' },
  { id: 'henon', kind: 'model', title: 'A strange attractor', said: ask('henon'), cue: 'Iterated live, point by point. Change a or b and the attractor reshapes.' },
  { id: 'radial', kind: 'scene', title: 'A radial engine’s layout', said: say('radial'), cue: 'Seven cylinders placed in 3D from one paragraph. Drag to turn it.' },
  { id: 'front', kind: 'model', title: 'An invasion front', said: ask('front'), cue: 'A travelling wave, integrated as you watch. Change r or D.' },
  { id: 'vanderpol', kind: 'model', title: 'An oscillator that keeps its own beat', said: ask('vanderpol'), cue: 'Integrated live. Raise μ and the cycle sharpens.' },
];

/** The item after `i`, wrapping: what the next opening shows. */
export function showcaseAt(list: readonly ShowcaseItem[], i: number): ShowcaseItem {
  const n = list.length;
  return list[((Math.floor(i) % n) + n) % n];
}

/**
 * The homepage stage's subject, its own and shown nowhere else: what holds an
 * aircraft up. The model is the engine's lift example, asked for in its own
 * words; the wing is what Live 3D's reader draws from one message — one wing
 * of a NACA 2412 section (the section on a Cessna 172's wing), 1.5 m chord and
 * 5.35 m span: two of them are about the 16 m² the model's wing has.
 */
export const STAGE_MODEL: ShowcaseItem = { id: 'lift', kind: 'model', title: 'Lift against airspeed', said: ask('lift'), cue: 'Solved live. Move the wing area or C_L.' };
export const STAGE_DESIGN: ShowcaseItem = {
  id: 'stage-wing',
  kind: 'scene',
  title: 'The wing, in 3D',
  said: 'Now draw one wing: a NACA 2412 aluminium wing with chord 1.5 m and span 5.35 m.',
  cue: 'Drawn by Live 3D from that message. Drag to turn it.',
};
