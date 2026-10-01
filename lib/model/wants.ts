// lib/model/wants.ts
//
// "GENERATE ME A BLACK HOLE" IS A CONSTRUCTION, AND THE ENGINE CAN KNOW THAT
// WITHOUT ASKING A LANGUAGE MODEL.
//
// WHAT WENT WRONG. Somebody typed "generate me a black hole" into Logos and got
// a paragraph explaining that creating a black hole would require collapsing a
// massive star beyond its Schwarzschild radius, plus a map node of kind
// `concept` called "Black hole creation". The product ships a Kerr black hole
// with real geodesics, sliders for mass and spin, and a shadow computed from
// the critical impact parameter — and it answered as though the request were
// about astrophysics rather than about itself.
//
// WHY. The classifier is prompted (lib/logos.ts), and its rule for "is this a
// construction" ends with a list of verbs: create, build, construct, set up,
// define, model, simulate, plot, fit, estimate. "Generate" is not on it. None of
// the other tests fired either — no variable roles, no equation, no named parts,
// nothing to manipulate afterwards — so the turn was not a construction, and a
// request to make something became a concept about the subject of the request.
//
// A LIST OF VERBS SOMEBODY WROTE DOWN IS THE FAILURE THIS CODEBASE KEEPS
// MAKING. The engine already holds the list that matters: SIM_OBJECTS in
// lib/logos-viz.ts is what the product can actually simulate. If a person names
// one of those and asks for it in any making register, that is a construction,
// decidable here, in code, with a test — not a sentence in a prompt hoping to
// be read the right way.
//
// IT DOES NOT BUILD ANYTHING. Like TurnAsk, this says what was asked for. The
// scene is still assembled and sanitised by the usual machinery; this only
// stops a request to make a thing being filed as a thought about the thing.
//
// PURE. No I/O, no model, no DOM.

/**
 * The simulations this product ships, and what people call them.
 *
 * THE IDS ARE NOT INVENTED HERE. They are `SIM_OBJECTS` from lib/logos-viz.ts,
 * and `test/wants.test.mjs` checks that this list and that one have not drifted
 * apart — because a name here that the renderer does not have is a promise of a
 * picture, and a name there that is missing here is a request that keeps
 * becoming a concept node.
 *
 * The aliases are what somebody actually types. "Black hole" is the obvious
 * one; "event horizon" and "Schwarzschild" are what a person who knows the
 * subject types, and they are asking for the same object.
 */
export const SIM_WORDS: Record<string, readonly string[]> = {
  'black-hole': [
    'black hole',
    'blackhole',
    'event horizon',
    'schwarzschild',
    'kerr',
    'accretion disk',
    'accretion disc',
    'singularity',
  ],
  'big-bang': [
    'big bang',
    'expanding universe',
    'friedmann',
    'cosmic expansion',
    'hubble expansion',
  ],
  orbit: ['orbit', 'orbital', 'two-body', 'two body', 'kepler', 'planetary motion'],
  oscillator: [
    'oscillator',
    'pendulum',
    'spring',
    'harmonic motion',
    'mass on a spring',
    'damped oscillation',
  ],
  projectile: ['projectile', 'trajectory of a ball', 'cannonball', 'ballistic'],
};

/**
 * The registers in which somebody asks for a thing to be made.
 *
 * DELIBERATELY WIDE, and that is safe here because it is only consulted
 * alongside a named simulation. "Show me a black hole" and "I want a black
 * hole" are both requests for the object; "show me" on its own is not a request
 * for anything in particular, and this never sees it on its own.
 *
 * `generate` is first because its absence is what caused the bug.
 */
const MAKING = [
  'generate',
  'make',
  'create',
  'build',
  'construct',
  'simulate',
  'model',
  'render',
  'draw',
  'plot',
  'visualise',
  'visualize',
  'show me',
  'show us',
  'give me',
  'i want',
  "let's see",
  'lets see',
  'can i see',
  'can you do',
  'do a',
  'set up',
];

/**
 * The registers in which somebody is asking ABOUT a thing instead.
 *
 * THE OTHER HALF, AND IT HAS TO EXIST. Without it "what is a black hole?" and
 * "how do black holes form?" would both be read as requests to build one, which
 * is the same failure pointing the other way — answering a question with a
 * simulation nobody asked for. A question wins over a making verb, because
 * "can you explain how to model a black hole" contains "model" and is a
 * question about modelling.
 */
const ASKING_ABOUT = [
  /^\s*(what|why|how|when|where|who|which|is|are|does|do|did|can you explain|explain|tell me about)\b/i,
  /\b(what is|what are|how does|how do|why does|why do|tell me about|explain)\b/i,
];

const NOT_A_REQUEST = [
  // Thinking out loud about whether to, rather than asking for one.
  /\b(should i|shall i|do you think i|wondering whether|not sure whether)\b/i,
];

export interface Wanted {
  /** the SIM_OBJECTS id */
  object: string;
  /** the words in their message that named it, for the account the turn gives */
  named: string;
  /** the making register that was used, for the same reason */
  asked: string;
}

/**
 * Did they ask for one of the simulations this product ships?
 *
 * Null for anything that is not unambiguously a request to make a named one —
 * which is most things, and that is correct. This exists to catch the case
 * where the product can obviously do what was asked and said it could not; it
 * is not a second classifier competing with the first.
 */
export function wantedSimulation(text: unknown): Wanted | null {
  const s = typeof text === 'string' ? text.toLowerCase().trim() : '';
  if (!s || s.length > 2000) return null;
  if (NOT_A_REQUEST.some((re) => re.test(s))) return null;

  // A question about the subject is not a request for the object.
  const isQuestion = s.endsWith('?') || ASKING_ABOUT.some((re) => re.test(s));

  let found: { object: string; named: string } | null = null;
  for (const [object, words] of Object.entries(SIM_WORDS)) {
    for (const w of words) {
      // Word-boundary, so "orbit" does not fire inside "orbital mechanics is
      // interesting" — it does, and should: the alias list has 'orbital' too.
      // What it must not do is fire inside an unrelated longer word.
      const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'i');
      if (re.test(s)) {
        // The longest alias wins, so "accretion disk" is not reported as
        // whichever single word happened to be checked first.
        if (!found || w.length > found.named.length) found = { object, named: w };
      }
    }
  }
  if (!found) return null;

  const asked = MAKING.find((v) => s.includes(v));
  if (!asked) return null;

  // "How do I simulate a black hole?" is a question about simulating, not a
  // request for the simulation — UNLESS the making verb is in the imperative
  // at the very start, where "Simulate a black hole?" is just a polite ask.
  if (isQuestion && !s.startsWith(asked)) return null;

  return { ...found, asked };
}

/**
 * What to say when the engine corrects the classification.
 *
 * SAID OUT LOUD, because a silent correction is the engine overruling the
 * reading of somebody's words without telling them. If it gets this wrong the
 * person can see that it did, and what it thought they meant.
 */
export function correctionNote(w: Wanted): string {
  return `read as a request to build the ${w.object.replace(/-/g, ' ')} simulation — “${w.asked}” and “${w.named}” together name something this engine can make`;
}
