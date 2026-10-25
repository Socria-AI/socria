// lib/logos5/make.ts — WHAT TO MAKE, CHOSEN BEFORE ASKING.
//
// Artifacts holds what is made in a line of thinking (lib/logos5/views.ts):
// charts, tables, timelines, plans, plots, models. Socria makes one when the
// words ask for it; this lets the person say which one up front instead,
// from a short list in the composer or in Artifacts, and then write only what
// it is about ("rent 1200, food 400").
//
// NOTHING NEW ON THE SERVER. A choice is said in words, as the person could
// have said it: "Make a chart: rent 1200, food 400". The same readers that
// answer a typed request answer it (lib/runtime/orchestrate.ts routeTurn,
// lib/objects/display-request.ts readDisplayRequest, the map pass), so a
// picked chart and a typed one cannot be made differently, and the
// conversation shows exactly what was asked. The suite checks every choice
// against those readers (test/logic-map-ideas.test.mjs).
//
// PURE.

export interface MakeChoice {
  id: string;
  /** what the person picks */
  label: string;
  /** what it is for, in a line — under its preview */
  about: string;
  /**
   * THE TEMPLATE IT FILLS: a display kind and the view it opens on
   * (lib/objects), drawn by the same figure whatever is poured into it — so
   * what is made is the template, never a picture improvised beside it
   * (app/api/logos/map, ONE ANSWER TO ONE ASK). The words below are read as
   * exactly this kind, opened on exactly this view (the request's view is
   * held to — lib/objects/display-propose.ts), so the preview is what comes
   * back; test/make-gallery.test.mjs holds every choice to it. Null for what
   * the engine builds itself: a plot, a simulation, a 3D model.
   */
  template: { kind: string; view?: string } | null;
  /** the composer's prompt while it is chosen */
  placeholder: string;
  /** the request, in the words someone would type */
  ask: (about: string) => string;
  /** the request when there is nothing typed: made from the conversation so far */
  fromHere: string;
}

const make = (noun: string) => ({
  ask: (about: string) => `Make a ${noun}: ${about}`,
  fromHere: `Make a ${noun} from this conversation`,
});

/** The choices, in the order they are offered. Each one is something Artifacts can hold. */
export const MAKE_CHOICES: readonly MakeChoice[] = [
  { id: 'chart', label: 'Chart', about: 'Your numbers at a glance — as bars, a line or a pie.', template: { kind: 'data' }, placeholder: 'What should it show? e.g. rent 1200, food 400, transport 90', ...make('chart') },
  { id: 'table', label: 'Comparison table', about: 'Options side by side, on what matters to you.', template: { kind: 'compare', view: 'matrix' }, placeholder: 'What are you comparing? e.g. three laptops on price, weight, battery', ...make('comparison table') },
  { id: 'timeline', label: 'Timeline', about: 'What happens when, in order.', template: { kind: 'plan', view: 'timeline' }, placeholder: 'What happened, or what is coming? e.g. my semester deadlines', ...make('timeline') },
  { id: 'plan', label: 'Study plan', about: 'What to do on which day, up to the deadline.', template: { kind: 'plan', view: 'calendar' }, placeholder: 'For what, and by when? e.g. finals in two weeks, four subjects', ...make('study calendar') },
  { id: 'checklist', label: 'Checklist', about: 'Steps to tick off as you go.', template: { kind: 'plan', view: 'checklist' }, placeholder: 'For what? e.g. moving into my dorm', ...make('checklist') },
  { id: 'flowchart', label: 'Flowchart', about: 'A process step by step, with where it branches.', template: { kind: 'diagram', view: 'flow' }, placeholder: 'What process? e.g. how a bill becomes law', ...make('flowchart') },
  { id: 'proscons', label: 'Pros and cons', about: 'A decision: the options, and what weighs on each.', template: { kind: 'crossroads', view: 'compare' }, placeholder: 'Of what? e.g. taking the summer internship', ...make('pros and cons table') },
  { id: 'venn', label: 'Venn diagram', about: 'What two or three things share, and where they differ.', template: { kind: 'venn', view: 'venn' }, placeholder: 'Of what? e.g. mitosis and meiosis', ...make('venn diagram') },
  {
    id: 'plot',
    label: 'Plot',
    about: 'A function, drawn — change it and watch.',
    template: null,
    placeholder: 'A function, e.g. y = x^2 - 3',
    ask: (about) => `Plot ${about}`,
    fromHere: 'Plot the functions in this conversation',
  },
  {
    id: 'simulation',
    label: 'Simulation',
    about: 'Something moving, with sliders to change it.',
    template: null,
    placeholder: 'Of what? e.g. a pendulum, supply and demand',
    ask: (about) => `Simulate ${about}`,
    fromHere: 'Simulate what we are talking about',
  },
  {
    id: 'model3d',
    label: '3D model',
    about: 'A shape you can turn and take apart.',
    template: null,
    placeholder: 'Of what? e.g. a water molecule',
    ask: (about) => `Build a 3D model of ${about}`,
    fromHere: 'Build a 3D model of what we are talking about',
  },
];

export const makeChoice = (id: string | null | undefined): MakeChoice | null => MAKE_CHOICES.find((c) => c.id === id) ?? null;

/**
 * The message a choice sends: what they typed, asked for as that choice. With
 * nothing typed it is made from the conversation so far; with nothing typed
 * and no conversation there is nothing to make it from, and nothing is sent.
 */
export function askFor(choice: MakeChoice, typed: string, hasConversation: boolean): string | null {
  const about = typed.trim().replace(/\s+$/, '');
  if (!about) return hasConversation ? choice.fromHere : null;
  return choice.ask(about);
}
