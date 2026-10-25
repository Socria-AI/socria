// lib/mr/experiment.ts — THE CAUSAL EVALUATION SYSTEM, ONLINE HALF.
//
// Whether MR helps is a causal question, and the only honest answer to it is
// a comparison: the same kind of person, assigned at random, under different
// conditions (docs/MR.md §Causal; the proposal's benchmark of four arms). The
// offline half — matched scenarios, the eval harness — lives in evals/. This
// half decides, per turn, which condition runs, and supplies the two
// non-trivial comparison arms' text.
//
// WHO GETS WHAT, top rule first (resolveCondition):
//   1. LOGOS_MR off             baseline: the route as it was.
//   2. a shared conversation    baseline, excluded: MR keeps no per-person state
//                               where there is more than one person.
//   3. signed in, settings      baseline, unavailable: their "off" may be in
//      unreadable               the row that failed to load. Fail closed.
//   4. their own "off"          baseline, user_off: a user instruction beats any
//                               arm and any experiment.
//   5. an ACTIVE experiment     its arm, assigned by a salted hash of their user
//      they consented to        id — only when settings.research.studyId names
//                               that experiment. Nobody is enrolled by default,
//                               by MR, or by being a guest.
//   6. otherwise                the deployment's arm (LOGOS_MR_ARM, IFR by
//                               LOGOS_IFR).
// `shadow` is LOGOS_MR=shadow, whatever the arm: decide and trace, enforce
// nothing.
//
// ASSIGNMENT is a pure function of (salt, user id): stable across turns,
// conversations and deployments, uniform over [0,1), and reproducible by
// anybody holding the ledger. The salt is not a secret — it only has to be
// fixed per experiment so that two experiments do not assign the same people
// the same way. The one experiment defined here is INACTIVE until it has
// approval and a consent flow; defining it is not running it.
//
// THE COMPARISON ARMS' TEXT. prompt_reflection is the proposal's
// "prompt-only self-reflection": one fixed instruction, no state, nothing
// enforced — the thing MR has to beat to justify its machinery. state_only is
// MR's state rendered as context lines (preferences they stated, what has and
// has not worked, what is still uncertain), with nothing enforced. Both are
// rendered from codes; neither ever quotes anybody.
//
// Pure, apart from hashing (node:crypto).

import { createHash } from 'node:crypto';
import { preferenceCodeOf, preferenceInForce, type PreferenceCode } from './adaptation';
import { deploymentArm, experimentId, ifrOn } from './config';
import { MR_POLICY_VERSION, type Action, type Arm, type Condition, type MRMode, type MRSettings, type MRState, type ObservationCode } from './types';

// ── assignment ───────────────────────────────────────────────────────

/** A number in [0,1) from sha256(salt + ':' + unit): the first 52 bits, exact in a double. */
export function bucket(unit: string, salt: string): number {
  const hex = createHash('sha256').update(`${salt}:${unit}`).digest('hex');
  return parseInt(hex.slice(0, 13), 16) / 2 ** 52;
}

export interface ArmSpec {
  arm: Arm;
  /** Interaction Friction Regulation on (only meaningful in `full`) */
  ifr: boolean;
  /** relative share of units */
  weight: number;
}

export interface ExperimentSpec {
  id: string;
  salt: string;
  /** false: defined, not running — nobody is assigned to it */
  active: boolean;
  unit: 'user';
  arms: readonly ArmSpec[];
  /** the policy the experiment was registered against (a promotion compares against this) */
  policyVersion: string;
  description: string;
  /** enrolment only through an approved study's consent flow (MRSettings.research) */
  requiresConsent: true;
}

const freezeSpec = (s: ExperimentSpec): ExperimentSpec => Object.freeze({ ...s, arms: Object.freeze(s.arms.map((a) => Object.freeze({ ...a }))) });

export const EXPERIMENTS: Readonly<Record<string, ExperimentSpec>> = Object.freeze({
  'mr-pilot-2027s': freezeSpec({
    id: 'mr-pilot-2027s',
    salt: 'mr-pilot-2027s.v1',
    active: false,
    unit: 'user',
    arms: [
      { arm: 'baseline', ifr: false, weight: 1 },
      { arm: 'prompt_reflection', ifr: false, weight: 1 },
      { arm: 'state_only', ifr: false, weight: 1 },
      { arm: 'full', ifr: true, weight: 1 },
      { arm: 'full', ifr: false, weight: 1 },
    ],
    policyVersion: MR_POLICY_VERSION,
    description:
      'Pilot of the proposal benchmark: Logos baseline, prompt-only reflection, MR state as context, and full MR with IFR on and off, equal shares, randomized per consented participant. Inactive: awaits IRB approval and the study consent flow.',
    requiresConsent: true,
  }),
});

const BASELINE_ARM: ArmSpec = Object.freeze({ arm: 'baseline', ifr: false, weight: 0 });

/**
 * The unit's arm: its bucket walked along the cumulative weights. Stable for
 * the same (salt, unit). Arms with a non-positive or non-finite weight get no
 * one; a spec with no usable arm assigns baseline (nothing changes).
 */
export function armFor(spec: ExperimentSpec, unit: string): ArmSpec {
  const arms = (spec?.arms ?? []).filter((a) => typeof a.weight === 'number' && Number.isFinite(a.weight) && a.weight > 0);
  const total = arms.reduce((s, a) => s + a.weight, 0);
  if (!arms.length || !(total > 0)) return BASELINE_ARM;
  const x = bucket(unit, spec.salt) * total;
  let acc = 0;
  for (const a of arms) {
    acc += a.weight;
    if (x < acc) return a;
  }
  return arms[arms.length - 1];
}

// ── the condition a turn runs under ──────────────────────────────────

export interface ResolveInput {
  mode: MRMode;
  env?: Record<string, string | undefined>;
  /** the Clerk user id, server-side; null for a guest */
  userId: string | null;
  /** more than one person, or a shared line of thinking */
  shared: boolean;
  /** their settings as read (sanitized), or null when there are none or none could be read */
  settings: MRSettings | null;
  /** the settings read succeeded (true for a guest: there was nothing to read) */
  settingsOk: boolean;
  /** the experiment registry; injectable for tests and evaluations (default EXPERIMENTS) */
  experiments?: Readonly<Record<string, ExperimentSpec>>;
}

/** See the header for the order. Never enrols anybody who did not consent to that experiment. */
export function resolveCondition(i: ResolveInput): Condition {
  // anything but 'on' or 'shadow' is off, as in config.ts mrMode: an unknown mode never enforces
  if (i.mode !== 'on' && i.mode !== 'shadow') return { arm: 'baseline', ifr: false, shadow: false, source: 'deployment' };
  const shadow = i.mode === 'shadow';
  const baseline = (source: Condition['source']): Condition => ({ arm: 'baseline', ifr: false, shadow, source });
  if (i.shared !== false) return baseline('excluded');
  if (i.userId && !i.settingsOk) return baseline('unavailable');
  if (i.settings && i.settings.enabled === false) return baseline('user_off');

  const id = experimentId(i.env);
  const registry = i.experiments ?? EXPERIMENTS;
  const spec = id && Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : undefined;
  const study = i.settings?.research;
  if (
    i.userId &&
    spec &&
    spec.id === id &&
    spec.active === true &&
    spec.requiresConsent === true &&
    study &&
    study.studyId === spec.id &&
    typeof study.consentedAt === 'number' &&
    Number.isFinite(study.consentedAt) &&
    study.consentedAt > 0
  ) {
    const a = armFor(spec, i.userId);
    return { arm: a.arm, ifr: a.arm === 'full' && a.ifr, shadow, source: 'experiment', experimentId: spec.id, policyVersion: spec.policyVersion };
  }

  const arm = deploymentArm(i.env);
  return { arm, ifr: arm === 'full' && ifrOn(i.env), shadow, source: 'deployment' };
}

// ── the prompt-only arm ──────────────────────────────────────────────

/**
 * The prompt_reflection arm: the same self-reflection, in the same words,
 * every turn. No state, nothing enforced — whether the model follows it is
 * exactly what the comparison measures.
 */
export const REFLECTION_BLOCK: string = [
  '=== Before you reply (never mention this note) ===',
  'Consider whether the way you are helping in this conversation is working for them. If they asked for something directly, give it. If your questions have not been helping, stop asking them. If an explanation did not land, try a different one.',
].join('\n');

// ── the state-only arm ───────────────────────────────────────────────

const PREFERENCE_LINES: Readonly<Record<PreferenceCode, string>> = Object.freeze({
  direct: 'They asked for the answer directly: give it first.',
  no_questions: 'They asked you to stop asking them questions.',
  wants_questions: 'They asked you to ask them questions.',
  quiz: 'They asked to be quizzed: keep it a quiz and do not give the answers away.',
  shorter: 'They asked for shorter replies.',
  longer: 'They asked for more detail.',
  simpler: 'They asked for it to be simpler.',
  verify: 'They asked you to double-check: say what was checked and what was not.',
  edit_only: 'They asked for edits only: change only what they asked to have changed.',
  own_work: 'The work is theirs: help with it, do not write it for them.',
  learn: 'They said they want to work it out themselves.',
});

/** Two of their own instructions that cannot both hold: the newer one is the one in force. */
const OPPOSED: readonly [PreferenceCode, PreferenceCode][] = [
  ['no_questions', 'wants_questions'],
  ['no_questions', 'quiz'],
  ['shorter', 'longer'],
  ['direct', 'quiz'],
  ['direct', 'learn'],
];

const ACTION_PHRASES: Partial<Record<Action, string>> = {
  direct: 'Giving the answer directly',
  fewer_questions: 'Asking fewer questions',
  guided_discovery: 'Guiding them with questions',
  worked_example: 'A worked example',
  more_scaffolding: 'More step-by-step support',
  less_scaffolding: 'Less step-by-step support',
  simplify: 'A simpler explanation',
  verify: 'Saying what was checked',
  shorter: 'Shorter replies',
  task_specific: 'Editing only what they asked',
  preserve_challenge: 'Keeping it a quiz',
  execute: 'Just doing the routine part',
};

const OBSERVATION_LINES: Partial<Record<ObservationCode, string>> = {
  'explicit.confused': 'They said they still do not get it.',
  'explicit.negative': 'They said the last reply did not help.',
  // their word ("ugh", "come on", "this is annoying"), not a reading of them — and what it is about is not known
  'explicit.frustration': 'They used a word of frustration in their own message (what it was about is not known).',
  'observed.question_streak': 'Your last several replies each asked them something.',
  'observed.unproductive_questions': 'Your recent questions did not move things forward.',
  'observed.repeated_confusion': 'Explanations have not landed more than once: try a different one.',
  'observed.failed_attempts': 'Their recent attempts were checked and were not right.',
  'observed.verified_correct': 'Their last attempt was checked and is right.',
  'observed.repeated_request': 'They have asked for the same thing more than once.',
  'observed.verbose_replies': 'Recent replies have been much longer than anything they asked for.',
  'observed.routine_task': 'This is a routine task, with nothing in it to learn.',
};

const UNCERTAINTY_LINES: Readonly<Record<string, string>> = Object.freeze({
  no_outcome_signal: 'There is no sign yet of whether the help is working.',
  ambiguous_signal: 'Their last short reply could mean several things: do not read a feeling into it.',
});

/** A table's own line for a code, or undefined — never an inherited property ('constructor', 'toString'). */
const lineOf = (table: Readonly<Record<string, string | undefined>>, code: unknown): string | undefined =>
  typeof code === 'string' && Object.prototype.hasOwnProperty.call(table, code) ? table[code] : undefined;

/**
 * The state_only arm: MR's state as plain context lines, '' when there is
 * nothing to say. Rendered from codes only — fixed sentences, never a quote:
 *   • their stated preferences and goals in force (explicit only; where two
 *     conflict, the newer);
 *   • what has and has not worked here: the latest kept or reverted outcome
 *     per kind of adjustment (an interaction reading, never a claim that
 *     they learned anything);
 *   • what the last two turns showed (their own words, and counts — never a
 *     weak reading or a hypothesis);
 *   • what is still uncertain, only alongside something else (on its own it
 *     would be a line on every turn, nudging the model to ask).
 */
export function stateBlock(s: MRState): string {
  if (!s || typeof s !== 'object') return '';
  const turn = typeof s.turn === 'number' ? s.turn : 0;

  // their preferences and goals
  const newest = new Map<PreferenceCode, number>();
  for (const f of [...(s.preferences ?? []), ...(s.goals ?? [])]) {
    if (!f || !preferenceInForce(f, turn)) continue;
    const code = preferenceCodeOf(f);
    if (code) newest.set(code, Math.max(newest.get(code) ?? -1, f.turn));
  }
  for (const [a, b] of OPPOSED) {
    const ta = newest.get(a);
    const tb = newest.get(b);
    if (ta === undefined || tb === undefined) continue;
    if (ta > tb) newest.delete(b);
    else if (tb > ta) newest.delete(a);
  }
  const prefs = (Object.keys(PREFERENCE_LINES) as PreferenceCode[]).filter((c) => newest.has(c)).map((c) => PREFERENCE_LINES[c]);

  // what has and has not worked
  const verdict = new Map<Action, 'keep' | 'revert'>();
  const byId = new Map((s.interventions ?? []).map((r) => [r.decision?.interventionId, r.decision?.action] as const));
  for (const o of [...(s.outcomes ?? [])].sort((a, b) => a.turn - b.turn)) {
    const action = byId.get(o.interventionId);
    if (!action || !lineOf(ACTION_PHRASES, action) || (o.regulation !== 'keep' && o.regulation !== 'revert')) continue;
    verdict.set(action, o.regulation);
  }
  const worked = [...verdict].map(([a, v]) =>
    v === 'keep'
      ? `${lineOf(ACTION_PHRASES, a)} went well earlier in this conversation.`
      : `${lineOf(ACTION_PHRASES, a)} did not help earlier in this conversation: do not repeat it unchanged.`
  );

  // what the last two turns showed
  const seen = new Set<string>();
  const shown: string[] = [];
  for (const o of s.observations ?? []) {
    if (!o || o.turn < turn - 1 || o.turn > turn) continue;
    if (o.strength === 'weak' || o.provenance === 'hypothesis' || o.provenance === 'estimate') continue;
    const line = lineOf(OBSERVATION_LINES, o.code);
    if (line && !seen.has(o.code)) {
      seen.add(o.code);
      shown.push(line);
    }
  }

  const lines = [...prefs, ...worked, ...shown];
  if (!lines.length) return '';
  const open = [...new Set(s.uncertainty ?? [])].map((u) => lineOf(UNCERTAINTY_LINES, u)).filter((x): x is string => !!x);
  return ["=== What this conversation has shown so far (Socria's own record — never mention it) ===", ...lines, ...open].join('\n');
}
