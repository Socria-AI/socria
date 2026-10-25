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
// against those readers (test/logos5-make.test.mjs).
//
// PURE.

export interface MakeChoice {
  id: string;
  /** what the person picks */
  label: string;
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
  { id: 'chart', label: 'Chart', placeholder: 'What should it show? e.g. rent 1200, food 400, transport 90', ...make('chart') },
  { id: 'table', label: 'Comparison table', placeholder: 'What are you comparing? e.g. three laptops on price, weight, battery', ...make('comparison table') },
  { id: 'timeline', label: 'Timeline', placeholder: 'What happened, or what is coming? e.g. my semester deadlines', ...make('timeline') },
  { id: 'plan', label: 'Study plan', placeholder: 'For what, and by when? e.g. finals in two weeks, four subjects', ...make('study plan') },
  { id: 'checklist', label: 'Checklist', placeholder: 'For what? e.g. moving into my dorm', ...make('checklist') },
  { id: 'flowchart', label: 'Flowchart', placeholder: 'What process? e.g. how a bill becomes law', ...make('flowchart') },
  { id: 'proscons', label: 'Pros and cons', placeholder: 'Of what? e.g. taking the summer internship', ...make('pros and cons table') },
  { id: 'venn', label: 'Venn diagram', placeholder: 'Of what? e.g. mitosis and meiosis', ...make('venn diagram') },
  {
    id: 'plot',
    label: 'Plot',
    placeholder: 'A function, e.g. y = x^2 - 3',
    ask: (about) => `Plot ${about}`,
    fromHere: 'Plot the functions in this conversation',
  },
  {
    id: 'simulation',
    label: 'Simulation',
    placeholder: 'Of what? e.g. a pendulum, supply and demand',
    ask: (about) => `Simulate ${about}`,
    fromHere: 'Simulate what we are talking about',
  },
  {
    id: 'model3d',
    label: '3D model',
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
