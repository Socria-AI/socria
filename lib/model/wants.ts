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

import { SURFACE_OBJECTS } from '../logos-viz';

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
  // "Black hole simulation", typed on its own, is a request for one. Checked
  // last, and never as a fragment: "sim" alone is inside "similar".
  'simulation',
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

/**
 * What people put in front of a request without making it a question.
 *
 * "Can you make me a black hole?" ends in a question mark and opens with
 * "can you", and it is the most ordinary way there is to ask for one. The
 * imperative test below looked for the making verb at the very start, so this
 * — the politest form of the request — was read as a question ABOUT black
 * holes and answered with a paragraph.
 */
const POLITE = /^(?:(?:hey|hi|hello|ok|okay|so|now|right|logos|socria|please|pls|plz)[\s,!.:;-]+)*(?:(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+)?|please\s+|pls\s+|plz\s+)?/i;

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
  // at the very start, where "Simulate a black hole?" is just a polite ask —
  // and "can you", "please", "hey" in front of it do not change that.
  if (isQuestion && !s.startsWith(asked) && !s.replace(POLITE, '').startsWith(asked)) return null;

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

// ── WHEN THE ENGINE'S OWN SIMULATION ANSWERS THE TURN ─────────────────
//
// REPORTED FROM THE PRODUCT, ON MAIN: "generate black hole" came back with a
// one-node map and, in the panel's note, "Nothing in that is written down as a
// relationship I can hold — no equation, no system, no specification." The
// product ships a Kerr black hole with real geodesics; nobody saw it.
//
// WHY. The extractor answered the request with a PROPOSAL — titled "Black hole
// simulation" and holding nothing formal — and the route only reached for the
// shipped simulation when nothing at all had been proposed. A proposal that
// wrote nothing down still counted as an answer, the on-ramp refused it
// (correctly: it was prose), and the refusal was what the person got. The
// second pass never ran either, because it too waited for "nothing proposed".
//
// THE RULE NOW, in two halves, both decided here so a suite can hold them:
//
//   OUTRIGHT  a BARE request — the object named, a making verb, and nothing of
//             their own — for an object with a surface of its own is answered
//             by that surface. Nothing the extractor writes can do better than
//             the engine's own Kerr hole, and making the answer depend on how
//             a language model reads "generate black hole" today is how this
//             broke.
//   INSTEAD   after the engine has tried (the proposal, and the second pass),
//             a named simulation answers when nothing drew and nothing built,
//             and the refusal is not one worth reading instead: there was no
//             proposal, or it wrote nothing down, or the person described
//             nothing of their own for it to be missing from.
//
// WHAT STILL WINS OVER THE STOCK SCENE: a model that built, a scene the
// extractor drew, and a refusal naming what is missing from a system the
// person described themselves — "a mass of 2 kg on a spring" refused for want
// of a stiffness is the useful answer, and the stock oscillator beside it
// would be the engine overruling them.

/** True when the object is drawn by a surface of its own rather than plotted. */
export function hasSurface(object: string): boolean {
  return (SURFACE_OBJECTS as readonly string[]).includes(object);
}

/** Words that ask for the object without saying anything about it. */
const FILLER = new Set([
  'the', 'an', 'and', 'please', 'pls', 'plz', 'can', 'could', 'would', 'will', 'you', 'for',
  'some', 'one', 'just', 'now', 'again', 'here', 'this', 'that', 'let', 'lets', "let's", 'see',
  'want', 'like', 'new', 'another', 'hey', 'hello', 'okay', 'logos', 'socria', 'thanks', 'thank',
  'show', 'give', 'really', 'very', 'simulation', 'simulations', 'sim', 'model', 'models',
  'visual', 'visualisation', 'visualization', 'picture', 'image', 'rendering', 'interactive',
  'real', 'realistic', 'cool', 'nice', 'beautiful', 'awesome', 'amazing', 'quick', 'quickly',
  'simple', 'basic', 'full', 'whole', 'live', 'working', 'actual', 'proper',
  // what the shipped surfaces already are, so naming it asks for nothing more
  'supermassive', 'massive', 'giant', 'huge', 'spinning', 'rotating', 'universe',
]);

/**
 * Did they ask for the object and nothing else?
 *
 * "generate black hole", "can you make me a black hole?", "show me a 3d black
 * hole", "black hole simulation" — yes. "simulate light bending around a black
 * hole", "model the orbit of Mars", "a black hole of ten solar masses" — no:
 * each says something of its own, and the engine should try to build THAT
 * before reaching for the stock scene.
 */
export function bareRequest(text: unknown, w: Wanted): boolean {
  const raw = typeof text === 'string' ? text.toLowerCase() : '';
  if (!raw.trim() || raw.length > 200) return false;
  // "3d" is a way of asking, not a number somebody chose.
  const s = ` ${raw.replace(/\b[23]-?d\b/g, ' ')} `;
  if (/\d/.test(s)) return false;
  let rest = s;
  const phrases = [...(SIM_WORDS[w.object] ?? []), ...MAKING].sort((a, b) => b.length - a.length);
  for (const p of phrases) rest = rest.split(p).join(' ');
  const words = rest.replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.every((x) => x.length <= 2 || FILLER.has(x));
}

/** The scene a map carries, as far as these rules need to see it. */
type SceneLike = { kind?: string; sim?: { object?: string } } | null | undefined;

/** True when the scene already is the simulation that was asked for. */
export function isThatSimulation(scene: SceneLike, w: Wanted | null): boolean {
  return !!w && scene?.kind === 'simulation' && scene.sim?.object === w.object;
}

/**
 * OUTRIGHT: does the engine's own surface answer this turn before any
 * proposal is built? Only for a bare request, only for an object with a
 * surface, and not when the extractor already drew exactly that.
 */
export function answersOutright(w: Wanted | null, bare: boolean, scene: SceneLike): boolean {
  if (!w || !bare || !hasSurface(w.object)) return false;
  return !isThatSimulation(scene, w);
}

/**
 * INSTEAD: after the engine has tried, does the named simulation answer the
 * turn in place of what came back?
 *
 * `missing` is how many objects the refusal named something missing from;
 * zero is a refusal that wrote nothing down — the extractor's failure, not a
 * fact about the person's system.
 */
export function answersInstead(
  w: Wanted | null,
  bare: boolean,
  outcome: { scene: boolean; proposed: boolean; built: boolean; missing: number }
): boolean {
  if (!w || outcome.scene || outcome.built) return false;
  if (!outcome.proposed) return true;
  if (outcome.missing === 0) return true;
  // A refusal naming what is missing is the answer — when they described
  // something of their own for it to be missing from. A bare request
  // described nothing, so "it needs a stiffness" asks them for a number they
  // never meant to choose, and the stock scene is the better reply.
  return bare;
}

/** What each surface shows and what moves, for the reply on the turn it opens. */
const BRIEF: Record<string, { name: string; shows: string; moves: string }> = {
  'black-hole': {
    name: 'a Kerr black hole',
    shows:
      'its horizon and shadow, a thin accretion disc coloured by its computed temperature, and light rays integrated as real null geodesics',
    moves: 'its mass and spin, the disc\u2019s tilt, size and feeding rate, and how many rays are traced',
  },
  'big-bang': {
    name: 'the expanding universe',
    shows:
      'its history from the first instants to today, with the temperature, the age and the epoch all computed from one number, the scale factor',
    moves: 'where in that history they are, the matter and dark-energy densities, and the expansion rate today',
  },
  orbit: {
    name: 'a gravitating system',
    shows: 'bodies under Newtonian gravity, integrated step by step, with their trails and the barycentre',
    moves:
      'the setup (two bodies, a figure eight, the inner planets, a binary with a third body, a cluster of twelve), how fast it runs and how much of each path is kept',
  },
};

/**
 * The block the reply is given on a turn the engine answers outright.
 *
 * WHY THE REPLY NEEDS IT. The reply and the map are separate calls made in
 * parallel, so on this turn the reply cannot see what is being drawn — and,
 * left to itself, it answered "generate black hole" by asking which aspect of
 * black holes they wanted to understand, beside a surface that was about to
 * show them one. On an OUTRIGHT turn the route always opens the surface, so
 * this is a fact the reply may state, not a hope.
 */
export function simulationBlock(w: Wanted): string {
  const b = BRIEF[w.object];
  if (!b) return '';
  return `

THIS TURN: they asked Logos to make ${b.name}, and Logos is opening its own simulation of one beside this conversation \u2014 ${b.shows}. They can move ${b.moves}.
Do not ask what they want to understand about it before they have seen it, and do not explain how one would be made in reality. In two or three sentences, say what they are looking at and the one thing most worth moving first, and why. At most one question, after that.`;
}
