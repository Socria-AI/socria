// lib/model/ask.ts
//
// WHAT THE PERSON ASKED LOGOS TO DO — as distinct from what they were talking
// about.
//
// THE FAILURE THIS FILE ANSWERS. Asked to
//
//   "Create a simple economic model showing the relationship between years of
//    education and wages. Use education as the independent variable and wages
//    as the dependent variable. Represent the model visually and make its
//    variables manipulable."
//
// Logos explained what such a model would be, and put one node on the Thinking
// Map: "relationship between education and wages". Nothing was built. Nothing
// recorded that anything had failed to be built.
//
// The cause was not a bad classifier. There was no classifier. The turn carried
// a `context` — deciding, writing, learning, math, simulating — which says what
// KIND OF WORK the person is doing, and nothing anywhere said what they had
// ASKED FOR. Those are different questions:
//
//   DOMAIN    economics          ← `context` answers roughly this
//   TOPIC     education and wages
//   ACTION    construct a model  ← nothing answered this
//
// So the extractor fell back to the only thing it always does — extract the
// thinking — and the Thinking Map's node became the answer to a request for an
// artifact. The map is very good at its job, which is why the failure is quiet:
// something plausible always appears.
//
// WHAT THIS IS. One semantic reading of the turn, produced once, consumed by
// the map, the model engine and the reply. An `ask` is a PROPOSAL like
// everything else a language model emits here — it is sanitised, it is never
// trusted, and, critically, IT CANNOT MAKE ANYTHING TRUE. Saying
// `action: "construct"` does not build a model; it only says what to attempt,
// and `settle()` below reports what actually happened. An ask that claims a
// construction which then failed produces a named failure, not a silent
// substitution.
//
// WHY THE LANGUAGE MODEL DECIDES IT RATHER THAN A REGEX. "Explain how
// economists build models" and "Build me a model with X as the independent
// variable" share their verb and mean opposite things; "I'm worried my model is
// wrong" contains `model` and asks for nothing to be made. Reading a sentence
// is the one thing a language model is actually for. What it is NOT for is
// deciding whether the result is real — which is why the ask routes and the
// engine judges, and never the other way round.
//
// PURE. No network, no clock, no React.

import type { Model } from './schema';

// ── what may be asked ───────────────────────────────────────────────

/**
 * The actions a turn may carry.
 *
 * DELIBERATELY NOT A LIST OF FEATURES. Each of these is a different answer to
 * "what should exist when this turn is finished?", which is the only question
 * that changes the routing:
 *
 *   discuss/explore/explain/question → prose, and the map grows as it always does
 *   map                              → the map is the point
 *   construct/modify/remove          → a structured object must exist or change
 *   compute/simulate/estimate        → an existing object must be RUN
 *   represent/compare/trace          → an existing object must be SHOWN
 *
 * The middle group is the one that was missing. Everything else already worked.
 */
export const ACTIONS = [
  'discuss',
  'explore',
  'explain',
  'question',
  'map',
  'construct',
  'modify',
  'remove',
  'compute',
  'simulate',
  'estimate',
  'represent',
  'compare',
  'trace',
  'research',
  'verify',
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * The actions that mean A STRUCTURED OBJECT MUST EXIST OR CHANGE when the turn
 * is over. These are the ones that can fail loudly, and the ones for which a
 * Thinking Map node is not an acceptable substitute.
 */
export const BUILDING_ACTIONS: readonly Action[] = ['construct', 'modify', 'remove'];

/** The actions that need a model to already be there. Asking for one without is its own failure. */
export const ON_A_MODEL: readonly Action[] = [
  'modify', 'remove', 'compute', 'simulate', 'estimate', 'represent', 'compare', 'trace',
];

export function isBuilding(a: Action): boolean {
  return (BUILDING_ACTIONS as readonly string[]).includes(a);
}

/**
 * What the person expects to be holding afterwards.
 *
 * Separate from the action because the same action produces different things:
 * `construct` a model, `construct` a plot, `construct` a diagram of an
 * argument. The artifact decides which part of the substrate is aimed at.
 */
export const ARTIFACTS = [
  'answer',        // prose, and nothing else was asked for
  'map',           // the Thinking Map
  'model',         // a structured model the engine owns
  'simulation',    // a model that runs through time
  'plot',          // a picture of a function or of data
  'diagram',       // a drawn structure
  'estimate',      // fitted numbers
  'draft',         // writing
  'research',      // sources and what they say
  'comparison',
] as const;
export type Artifact = (typeof ARTIFACTS)[number];

/**
 * The formal structure the person named, in their own words.
 *
 * NOT PARSED INTO A MODEL HERE. This is the evidence that they were specifying
 * rather than musing — "use education as the independent variable and wages as
 * the dependent variable" names an outcome and a regressor, and a turn that
 * does that is not asking to be told what regression is. The proposal itself
 * carries the real structure; this is what lets the engine check the proposal
 * against what was actually asked for, and say so when they disagree.
 */
export interface FormalStructure {
  /** what is being explained, or what the model is of */
  outcome?: string;
  /** what explains it — regressors, inputs, drivers */
  inputs?: string[];
  /** named states, bodies, compartments, stocks */
  states?: string[];
  /** named parameters, coefficients, constants */
  parameters?: string[];
  /** equations the person wrote down themselves */
  equations?: string[];
  /** a method they named. NEVER filled in by us — see EstimationDecl. */
  method?: string;
  /** data they referred to or supplied */
  data?: string;
}

export interface TurnAsk {
  action: Action;
  /** what should exist afterwards */
  artifact: Artifact;
  /** the subject, in the person's words — for the reply and for the map, never for routing */
  topic?: string;
  /** the field, where it is clear. Routing must not depend on it. */
  domain?: string;
  /** structure they named themselves */
  formal?: FormalStructure;
  /** what they want to be able to do with it: manipulate, run, fit, compare */
  operations?: string[];
}

// ── sanitising ──────────────────────────────────────────────────────

const text = (v: unknown, n: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
const list = (v: unknown, n: number, each: number): string[] =>
  Array.isArray(v) ? v.map((x) => text(x, each)).filter(Boolean).slice(0, n) : [];

/**
 * An ask from outside, trusted for nothing.
 *
 * Returns null rather than a default when the action is not one we know.
 * A DEFAULT WOULD BE THE BUG AGAIN: `discuss` as a fallback silently turns
 * every unreadable ask back into conversation, which is exactly the failure
 * this file exists to stop. No ask means no ask, and the caller behaves as it
 * did before one existed.
 */
export function sanitizeAsk(raw: unknown): TurnAsk | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const action = text(r.action, 24).toLowerCase() as Action;
  if (!(ACTIONS as readonly string[]).includes(action)) return null;

  const artifactRaw = text(r.artifact, 24).toLowerCase() as Artifact;
  const artifact: Artifact = (ARTIFACTS as readonly string[]).includes(artifactRaw)
    ? artifactRaw
    : // No artifact named: a building action must mean a model, and anything
      // else means prose. Inferred here rather than left blank so downstream
      // never has to ask "and what if it is missing".
      isBuilding(action) ? 'model' : 'answer';

  const f = r.formal as Record<string, unknown> | undefined;
  const formal: FormalStructure | undefined =
    f && typeof f === 'object'
      ? {
          ...(text(f.outcome, 60) ? { outcome: text(f.outcome, 60) } : {}),
          ...(list(f.inputs, 20, 60).length ? { inputs: list(f.inputs, 20, 60) } : {}),
          ...(list(f.states, 24, 60).length ? { states: list(f.states, 24, 60) } : {}),
          ...(list(f.parameters, 24, 60).length ? { parameters: list(f.parameters, 24, 60) } : {}),
          ...(list(f.equations, 12, 300).length ? { equations: list(f.equations, 12, 300) } : {}),
          ...(text(f.method, 40) ? { method: text(f.method, 40) } : {}),
          ...(text(f.data, 60) ? { data: text(f.data, 60) } : {}),
        }
      : undefined;

  return {
    action,
    artifact,
    ...(text(r.topic, 120) ? { topic: text(r.topic, 120) } : {}),
    ...(text(r.domain, 40) ? { domain: text(r.domain, 40) } : {}),
    ...(formal && Object.keys(formal).length ? { formal } : {}),
    ...(list(r.operations, 8, 40).length ? { operations: list(r.operations, 8, 40) } : {}),
  };
}

// ── what actually happened ──────────────────────────────────────────

/**
 * Why a construction did not happen.
 *
 * NAMED RATHER THAN SWALLOWED. Every one of these used to look identical from
 * the outside — a concept node on the map and a reply describing what the
 * person would have seen — and they need completely different things from the
 * person. The last two are ours to fix; the middle three are theirs to supply;
 * the first is a bug in the routing and should be visible as one.
 */
export const FAILURES = [
  /** the turn asked for construction and nothing was even proposed */
  'intent-routing',
  /** proposed, but nothing here models that kind of thing */
  'missing-primitive',
  /** proposed and understood, but something structural is absent */
  'missing-structure',
  /** the structure is complete; the numbers are not supplied */
  'missing-data',
  /** a solver for this exists as an interface with nothing behind it */
  'missing-backend',
  /** proposed, but it was not a model at all */
  'invalid-model',
  /** it built; nothing here can draw it */
  'unsupported-representation',
] as const;
export type Failure = (typeof FAILURES)[number];

export const FAILURE_SAYS: Record<Failure, string> = {
  'intent-routing':
    'you asked for something to be built and nothing was proposed — that is a fault here, not something missing from what you said',
  'missing-primitive': 'nothing here knows how to model that kind of thing yet',
  'missing-structure': 'the model needs a part that has not been named',
  'missing-data': 'the structure is complete; what is missing is the observations',
  'missing-backend': 'this kind of model is understood here but nothing computes it yet',
  'invalid-model': 'what came back was not a model',
  'unsupported-representation': 'the model is built, but nothing here draws this kind of thing',
};

/** The engine's verdict on a turn: what was asked, and what came of it. */
export interface Settled {
  ask: TurnAsk | null;
  /** did the turn ask for a structured object to exist or change */
  wanted: boolean;
  /** did one */
  got: boolean;
  /** when it wanted one and did not get one, why */
  failure?: Failure;
  /** one sentence, in the person's terms, that a reply may use verbatim */
  says: string;
}

/**
 * What became of the ask.
 *
 * THE POINT OF THIS FUNCTION is that it takes the ask and the RESULT and lets
 * the result win. An ask that says `construct` and a build that refused settle
 * to a named failure; an ask that says `discuss` and a model that built anyway
 * settles to having built one. Nothing downstream may claim a model exists on
 * the strength of the ask alone — §22 of the brief, and the reason the reply is
 * given `says` rather than being trusted to work it out.
 */
export function settle(
  ask: TurnAsk | null,
  result: {
    /** did the turn carry a proposal at all */
    proposed: boolean;
    /** did the engine build one */
    built: boolean;
    /** the refusal's own words, when it refused */
    because?: string;
    /** what the engine said was missing, by object */
    missing?: { label: string; missing: { what: string }[] }[];
  }
): Settled {
  const wanted = !!ask && isBuilding(ask.action) && ask.artifact !== 'answer' && ask.artifact !== 'map';

  if (result.built) {
    return { ask, wanted, got: true, says: '' };
  }
  if (!wanted) {
    // Nothing was asked to be built and nothing was. Not a failure; the
    // ordinary case, and the map does what it always does.
    return { ask, wanted, got: false, says: '' };
  }

  const failure: Failure = !result.proposed
    ? 'intent-routing'
    : classify(result.because, result.missing);

  const detail = (result.missing ?? [])
    .map((m) => `${m.label} needs ${m.missing.map((x) => x.what).join(', ')}`)
    .join('; ');

  return {
    ask,
    wanted,
    got: false,
    failure,
    says: detail ? `${FAILURE_SAYS[failure]}: ${detail}` : FAILURE_SAYS[failure],
  };
}

/**
 * Which failure a refusal was.
 *
 * Reads the engine's own words rather than re-deriving anything, because the
 * engine already worked it out — `route` returns unsupported-with-a-reason,
 * `missingStructure` returns what is absent, and the estimator distinguishes
 * "no observations" from "no such column". This only sorts them.
 */
function classify(
  because?: string,
  missing?: { label: string; missing: { what: string }[] }[]
): Failure {
  const all = (missing ?? []).flatMap((m) => m.missing.map((x) => x.what.toLowerCase()));
  if (!missing?.length && /not a model|no id|no title|nothing the engine recognised/i.test(because ?? '')) {
    return 'invalid-model';
  }
  // The estimator says "observations — …" with no data block, and "the data
  // block “x”" when one was named and is not there. Both are data.
  if (all.some((w) => /observations|data block|the numbers|a column/.test(w))) return 'missing-data';
  if (all.some((w) => /backend|interface here/.test(w)) || /interface here, not an implementation/i.test(because ?? '')) {
    return 'missing-backend';
  }
  if (/nothing registered computes|no solver that handles/i.test(because ?? '')) return 'missing-primitive';
  if (all.length) return 'missing-structure';
  return 'missing-primitive';
}

// ── what the reply is allowed to say ────────────────────────────────

/**
 * The block the conversation is given about this turn's ask and its outcome.
 *
 * WHY THE REPLY NEEDS THIS AT ALL. The reply and the map are two calls made in
 * parallel — that is what lets prose stream while the map builds — so on the
 * turn that creates a model the reply cannot know whether it worked. Before
 * this it guessed, and guessed in the most flattering direction: it described
 * the model as though it were there.
 *
 * So the rule here is about what may be CLAIMED, and it is deliberately
 * asymmetric. The reply may say what it is asking the engine to build. It may
 * not say the thing exists. The surface reports the build, because the surface
 * is the thing that knows.
 */
export function askBlock(ask: TurnAsk | null): string {
  if (!ask) return '';
  const lines = [`\n\nTHIS TURN'S ASK, as read from what they wrote: ${ask.action} → ${ask.artifact}.`];

  if (ask.formal) {
    const f = ask.formal;
    const bits = [
      f.outcome ? `outcome: ${f.outcome}` : '',
      f.inputs?.length ? `explained by: ${f.inputs.join(', ')}` : '',
      f.states?.length ? `states: ${f.states.join(', ')}` : '',
      f.parameters?.length ? `parameters: ${f.parameters.join(', ')}` : '',
      f.equations?.length ? `equations they wrote: ${f.equations.join('; ')}` : '',
      f.method ? `method they named: ${f.method}` : '',
      f.data ? `data: ${f.data}` : '',
    ].filter(Boolean);
    if (bits.length) lines.push(`They named the structure themselves — ${bits.join('; ')}.`);
  }

  if (isBuilding(ask.action) && ask.artifact !== 'answer' && ask.artifact !== 'map') {
    lines.push(
      'THEY ASKED FOR A THING TO BE MADE, NOT DESCRIBED. The engine is asked to build it while you write; the surface will show it, or say plainly that it could not be built.',
      'So: do not write "the model you are envisioning", "you would likely see", "imagine a chart where" or any other description of an artifact in place of the artifact. That is the failure this rule exists to stop.',
      'And do not claim it exists, or that it "is being created" — you are not the thing that knows, and progress is a claim too. Say what they asked for and what they will be able to do with it, in one or two sentences, never a number the engine computes, and let the model itself be the answer.',
      'If part of what they asked for genuinely cannot be built, the surface says so; do not pre-empt it with an apology.'
    );
  }

  return lines.join('\n');
}

/**
 * Did the built model actually answer the ask?
 *
 * A CHEAP, STRUCTURAL CHECK, and deliberately not a clever one. It compares the
 * names the person used against the names the model carries. It exists because
 * "the engine built something" and "the engine built what was asked for" are
 * different claims, and only the first was ever checked — so a proposal that
 * quietly dropped a variable the person had named would build, and nothing
 * would notice.
 *
 * Returns the names that were asked for and are nowhere in the model. Empty is
 * the good case. It never blocks a build: a model missing a named variable is
 * still a model, and this is what the reply mentions rather than what the
 * engine refuses on.
 */
export function unanswered(ask: TurnAsk | null, model: Model): string[] {
  const f = ask?.formal;
  if (!f) return [];
  const asked = [f.outcome, ...(f.inputs ?? []), ...(f.states ?? [])].filter(Boolean) as string[];
  if (!asked.length) return [];

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const have = new Set<string>();
  // EMPTY NAMES ARE DROPPED, and this is not tidiness. The containment test
  // below asks whether either string contains the other, and every string
  // contains the empty one — so a single label that normalises away ("β₀" is
  // all non-ascii) made every name in the model match every name they asked
  // for, and `unanswered` silently returned nothing for every model.
  const add = (v: string) => {
    const n = norm(v);
    if (n) have.add(n);
  };
  for (const o of model.objects) {
    add(o.id);
    add(o.label);
    const col = o.meta?.column;
    if (typeof col === 'string') add(col);
    // AN UNKNOWN IS A NAME THE MODEL HOLDS. Asked for a model in Qd, Qs, Pc and
    // Pp, a model whose equations block names all four was reporting every one
    // of them as unanswered — because the solved objects that carry those labels
    // do not exist until the declaration is expanded, and this runs before that.
    for (const u of o.equations?.unknowns ?? []) add(u);
  }
  for (const p of model.params) {
    add(p.id);
    add(p.label);
  }

  return asked.filter((a) => {
    const n = norm(a);
    if (!n) return false;
    // A name counts as present if anything in the model contains it or is
    // contained by it — "years of education" and "education" are the same
    // variable, and demanding an exact match would report every model as
    // incomplete.
    for (const h of have) {
      if (h.includes(n) || n.includes(h)) return false;
    }
    return true;
  });
}
