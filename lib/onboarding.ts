// lib/onboarding.ts
//
// The first map, taught by doing.
//
// WHY THIS EXISTS AT ALL. Socria already has a good first session:
// first-session.ts hands somebody a complete opening worth 40-90 words,
// tuned to the length the extractor needs to find five nodes of five kinds
// on the first turn. That solves the blank composer. It does not solve the
// thing that comes NEXT, which is a person watching a diagram assemble
// itself beside their sentence and having no idea that it is theirs, that it
// is live, or that every card on it opens.
//
// The invitation we had for that was a twelve-pixel pill in the corner,
// dismissible, and wrapped in `hidden sm:block` — so on a phone there was no
// invitation at all. A pill is enough to advertise a FEATURE. This is not a
// feature; it is an interaction nobody has performed before, and the only
// way to learn one of those is to perform it.
//
// SO IT WAITS. Every step here advances on something the person actually
// did — a card pressed, an action chosen — and never on a timer. Nothing
// auto-plays, nothing is demonstrated at them, and if they wander off
// mid-way the sequence simply stays where it is until they come back. That
// is not a stylistic choice: this is a product whose entire argument is that
// the thinking has to be yours, and an onboarding that performs itself while
// you watch would be the product contradicting itself on the first screen.
//
// PURE, so the suite can hold the part that actually goes wrong. The bug in
// a coach-mark sequence is never the arrow; it is showing up twice, showing
// up for the wrong person, showing up over an empty map, or refusing to die.

export type StepId = 'drawn' | 'press' | 'opens';

/** What the app tells this module happened. Never a timer. */
export type Signal =
  /** the map reached enough nodes to be worth pointing at */
  | 'map-drew'
  /** they pressed a card and its four actions appeared */
  | 'node-pressed'
  /** they chose one of the four */
  | 'action-taken'
  /** they asked it to stop, by any of the ways offered */
  | 'skip';

export interface Step {
  id: StepId;
  /** the element this attaches to; the renderer finds it, this names it */
  anchor: 'map' | 'node' | 'panel';
  /** four or five words */
  title: string;
  /** one or two sentences, in their situation and not the product's */
  body: string;
  /** what the person has to DO to move on, said plainly */
  cue: string;
}

/**
 * Three beats, because there are exactly three things to learn and a fourth
 * would be a tour.
 *
 * The copy says "you" and "your" throughout and never names a feature. A
 * person does not need to know the phrase "Thinking Map" to use one, and
 * teaching the noun before the motion is how software ends up with an
 * onboarding people click through to get rid of.
 */
export const STEPS: Step[] = [
  {
    id: 'drawn',
    anchor: 'map',
    title: 'That came from your sentence',
    body: 'Socria read what you just wrote and drew what is in it — the claim, what it rests on, what pulls against it. Nothing here was typed by you twice.',
    cue: 'Press any card to go on',
  },
  {
    id: 'press',
    anchor: 'node',
    title: 'Every card opens',
    body: 'A card is not a label. It is a piece of your reasoning you can pick up and turn over.',
    cue: 'Choose one of the four',
  },
  {
    id: 'opens',
    anchor: 'panel',
    title: 'This is the whole idea',
    body: 'Explore what it is, challenge where it breaks, or trace where it came from. The map keeps redrawing as you talk — you never have to tend it.',
    cue: 'Close this and keep going',
  },
];

export const byId = (id: StepId): Step =>
  STEPS.find((s) => s.id === id) ?? STEPS[0];

/** Nothing running, or finished for good. */
export type State = { at: StepId } | { at: 'idle' } | { at: 'done' };

export const IDLE: State = { at: 'idle' };
export const DONE: State = { at: 'done' };

/** The flag that survives a reload. One key, one value, set once. */
export const ONBOARDING_KEY = 'socria.firstmap.v1';

export interface StartConditions {
  /** an account, because the map and its actions need one */
  signedIn: boolean;
  /** already been through it, from storage */
  completed: boolean;
  /** how many nodes are on the map right now */
  nodes: number;
  /** a reply is still streaming; pointing at a moving map is pointing at nothing */
  busy: boolean;
  /** they are typing. Never interrupt a sentence. */
  composing: boolean;
}

/**
 * Whether to begin.
 *
 * The node threshold is the interesting one. Two nodes is not a map, it is
 * two boxes, and "look what Socria drew" over two boxes undersells the thing
 * it is trying to sell. first-session.ts exists precisely to make the first
 * turn produce five, so waiting for four means the sequence opens on a map
 * with a SHAPE or does not open at all — and not opening is the right
 * outcome for a thin first message.
 */
export function shouldStart(c: StartConditions): boolean {
  if (!c.signedIn || c.completed) return false;
  if (c.busy || c.composing) return false;
  return c.nodes >= 4;
}

/**
 * Advance.
 *
 * Signals that do not belong to the current step are IGNORED rather than
 * treated as progress — somebody who presses a second card while already on
 * 'press' has not done a new thing, and jumping them forward would skip a
 * beat they never saw. The one exception is skip, which is always obeyed
 * immediately, from anywhere.
 */
export function advance(state: State, signal: Signal): State {
  if (signal === 'skip') return DONE;
  if (state.at === 'done') return DONE;

  if (state.at === 'idle') {
    // Only the map appearing can open the sequence. A card pressed before
    // there is anything to teach is just somebody using the product, and
    // interrupting that to explain it would be absurd.
    return signal === 'map-drew' ? { at: 'drawn' } : IDLE;
  }
  if (state.at === 'drawn') return signal === 'node-pressed' ? { at: 'press' } : state;
  if (state.at === 'press') return signal === 'action-taken' ? { at: 'opens' } : state;
  // 'opens' is the last beat; only skip (above) or finish() ends it.
  return state;
}

/** The last step dismissed, which is the same as finishing. */
export function finish(): State {
  return DONE;
}

export function isRunning(state: State): boolean {
  return state.at !== 'idle' && state.at !== 'done';
}

/** Which of the three, for the progress dots. Zero-based; -1 when not running. */
export function indexOf(state: State): number {
  return isRunning(state) ? STEPS.findIndex((s) => s.id === state.at) : -1;
}
