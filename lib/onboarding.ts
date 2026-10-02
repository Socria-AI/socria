// lib/onboarding.ts
//
// The first model, taught by doing.
//
// Logos is the one surface whose interaction nobody has performed before:
// talk, and a model of what you said appears beside you; touch it, and what
// depends on the touched thing moves; ask about a piece of it by what it IS.
// That cannot be explained in a sentence and does not need to be — it needs
// to happen once, on the person's own words, with a line beside it saying
// what just happened. So this sequence waits for the person's first map or
// model and then follows what they do, three beats and out.
//
// THREE BEATS, PLANNED FROM WHAT ACTUALLY EXISTS. A first map and a first
// model are different things: a map has cards that open, a model has values
// that move and a picture that recomputes. The copy says which, names the
// thing it points at by the KIND the canonical model gives it — a parameter
// is called a parameter, never an assumption — and mentions computation only
// when a backend ran. Nothing here invents a model, a dependency or a
// calculation to have something to point at; `planFor` reads the shape of
// what is on screen and writes the three beats for it.
//
// IT WAITS. Every step advances on something the person actually did — a
// value moved, a card pressed, a question asked — never on a timer. Nothing
// auto-plays, nothing is demonstrated at them, and if they wander off the
// sequence stays where it is until they come back. A product whose argument
// is that the thinking has to be yours cannot open with an onboarding that
// performs itself while you watch.
//
// PURE, so the suite can hold the part that goes wrong: showing up twice,
// for the wrong person, over an empty map, or refusing to die.

export type StepId = 'became' | 'changed' | 'release';

/** What the app tells this module happened. Never a timer. */
export type Signal =
  /** the map reached enough nodes to be worth pointing at */
  | 'map-drew'
  /** the engine built a model document from what they said */
  | 'model-built'
  /** they moved a value — a control, a cursor, a free input */
  | 'control-moved'
  /** they pressed a card and its actions appeared */
  | 'node-pressed'
  /** they chose one of a card's actions — explore, challenge, research, trace */
  | 'action-taken'
  /** they asked the conversation about an object by its identity */
  | 'asked'
  /** they asked it to stop, by any of the ways offered */
  | 'skip';

/**
 * What is on screen, as the planner needs it. Read from the canonical model
 * and the map — never guessed.
 */
export interface Shape {
  /** a model document exists (not just a map) */
  model: boolean;
  /** how many values can be moved on it */
  controls: number;
  /** the first movable thing, named by its canonical kind and label */
  control?: { label: string; kind: 'parameter' | 'input' | 'time' } | null;
  /** a backend actually ran on it; what, and on what */
  computed?: { operation: string; backend: string } | null;
  /** nodes on the map */
  nodes: number;
}

export interface Step {
  id: StepId;
  /** the element this attaches to; the renderer finds it, this names it */
  anchor: 'map' | 'control' | 'node' | 'panel';
  /** a few words — the thing that just happened, or is about to */
  title: string;
  /** one or two sentences, in their situation and not the product's */
  body: string;
  /** what the person has to DO to move on, said plainly; empty on the last */
  cue: string;
}

export const DEFAULT_SHAPE: Shape = { model: false, controls: 0, nodes: 5 };

/**
 * The three beats for THIS first model.
 *
 * The copy says "you" and "your" throughout and never names a feature. A
 * person does not need to know the phrase "Thinking Map" to use one, and
 * teaching the noun before the motion is how software ends up with an
 * onboarding people click through to get rid of.
 */
export function planFor(shape: Shape = DEFAULT_SHAPE): Step[] {
  const hasControl = shape.model && shape.controls > 0 && !!shape.control;
  const became: Step = shape.model
    ? {
        id: 'became',
        anchor: hasControl ? 'control' : 'panel',
        title: 'This is your thinking becoming a model.',
        body: 'What you said is now a model: its quantities, its relationships, what depends on what. Nothing here was typed by you twice.',
        cue: hasControl
          ? `Try changing this — move ${shape.control!.label}.`
          : 'Press anything on it to open it.',
      }
    : {
        id: 'became',
        anchor: 'map',
        title: 'This is your thinking becoming a model.',
        body: 'Socria read what you wrote and drew what is in it — the claim, what it rests on, what pulls against it.',
        cue: 'Press any card to go on.',
      };
  const changed: Step = shape.model
    ? {
        id: 'changed',
        anchor: 'panel',
        title: 'Change the model, and Logos updates what depends on it.',
        body: shape.computed
          ? `${shape.computed.operation} ran again on ${shape.computed.backend}. What you see is computed from your model, not redrawn by hand.`
          : 'The picture, the readouts and what depends on it all moved with it. Nothing was redrawn by hand.',
        cue: 'Ask about this — select something, then press Ask about this.',
      }
    : {
        id: 'changed',
        anchor: 'node',
        title: 'Every card opens.',
        body: 'A card is not a label. It is a piece of your reasoning you can pick up and turn over.',
        cue: 'Choose one of the four.',
      };
  const release: Step = {
    id: 'release',
    anchor: 'panel',
    title: 'Now keep thinking.',
    body: shape.model
      ? 'Ask about anything you see, change the model directly, or keep talking. It keeps up as you do.'
      : 'Explore what it is, challenge where it breaks, or trace where it came from. The map keeps redrawing as you talk — you never have to tend it.',
    cue: '',
  };
  return [became, changed, release];
}

/** The default plan, for a map with no model. */
export const STEPS: Step[] = planFor();

export const byId = (id: StepId, shape: Shape = DEFAULT_SHAPE): Step =>
  planFor(shape).find((s) => s.id === id) ?? planFor(shape)[0];

/** Nothing running, or finished for good. */
export type State = { at: StepId } | { at: 'idle' } | { at: 'done' };

export const IDLE: State = { at: 'idle' };
export const DONE: State = { at: 'done' };

/**
 * The flag that survives a reload. One key, one value, set once. The newer
 * record (lib/first-run.ts) reads it as a legacy milestone, so a person who
 * finished under this key is never shown the sequence again under that one.
 */
export const ONBOARDING_KEY = 'socria.firstmap.v1';

export interface StartConditions {
  /** an account, because the map and its actions need one */
  signedIn: boolean;
  /** already been through it, from storage */
  completed: boolean;
  /** how many nodes are on the map right now */
  nodes: number;
  /** a model document exists — enough on its own, whatever the node count */
  model?: boolean;
  /** a reply is still streaming; pointing at a moving map is pointing at nothing */
  busy: boolean;
  /** they are typing. Never interrupt a sentence. */
  composing: boolean;
}

/**
 * Whether to begin.
 *
 * The node threshold is the interesting one. Two nodes is not a map, it is
 * two boxes, and "this is your thinking becoming a model" over two boxes
 * undersells the thing it is trying to show. first-session.ts exists
 * precisely to make the first turn produce five, so waiting for four means
 * the sequence opens on a map with a SHAPE or does not open at all. A model
 * document is a shape by itself.
 */
export function shouldStart(c: StartConditions): boolean {
  if (!c.signedIn || c.completed) return false;
  if (c.busy || c.composing) return false;
  return !!c.model || c.nodes >= 4;
}

/**
 * Advance.
 *
 * Signals that do not belong to the current step are IGNORED rather than
 * treated as progress — somebody who presses a second card while already on
 * 'changed' has not done a new thing, and jumping them forward would skip a
 * beat they never saw. The one exception is skip, which is always obeyed
 * immediately, from anywhere.
 *
 * Which signal advances which beat depends on the shape: on a model the
 * second beat is reached by moving a value and the third by asking about an
 * object; on a map, by pressing a card and then choosing what to do with it.
 * A card's own actions — explore, challenge, trace — ARE asking about it, so
 * they release a model sequence too.
 */
export function advance(state: State, signal: Signal, shape: Shape = DEFAULT_SHAPE): State {
  if (signal === 'skip') return DONE;
  if (state.at === 'done') return DONE;

  if (state.at === 'idle') {
    // Only the map or a model appearing can open the sequence. A card pressed
    // before there is anything to teach is just somebody using the product.
    return signal === 'map-drew' || signal === 'model-built' ? { at: 'became' } : IDLE;
  }
  const manipulable = shape.model && shape.controls > 0;
  if (state.at === 'became') {
    if (manipulable) return signal === 'control-moved' ? { at: 'changed' } : state;
    if (shape.model) return signal === 'control-moved' || signal === 'node-pressed' || signal === 'asked' ? { at: 'changed' } : state;
    return signal === 'node-pressed' ? { at: 'changed' } : state;
  }
  if (state.at === 'changed') {
    if (shape.model) return signal === 'asked' || signal === 'action-taken' ? { at: 'release' } : state;
    return signal === 'action-taken' ? { at: 'release' } : state;
  }
  // 'release' is the last beat; only skip (above) or finish() ends it.
  return state;
}

/** The last step dismissed, which is the same as finishing. */
export function finish(): State {
  return DONE;
}

export function isRunning(state: State): boolean {
  return state.at !== 'idle' && state.at !== 'done';
}

/** Which of the three, for the progress marks. Zero-based; -1 when not running. */
export function indexOf(state: State): number {
  return isRunning(state) ? STEPS.findIndex((s) => s.id === state.at) : -1;
}
