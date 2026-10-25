// lib/mr/config.ts — MR's SWITCHES AND ITS VERSIONED STRATEGIES.
//
// Every threshold MR acts on lives in one versioned table, STRATEGIES, keyed
// by policy version. A decision carries the version it was made under, so a
// ledger row can always be traced back to the exact rules that produced it,
// and pinning an older version (LOGOS_MR_POLICY) is a rollback that needs no
// code change. A new version is a new entry — an entry is never edited after
// it has been used — and promoting one is a human decision taken on an
// evaluation (lib/mr/adaptation.ts promotionVerdict), never something MR does
// to itself.
//
// SWITCHES are read on every call with an injectable env, like the runtime's
// (lib/runtime/index.ts): tests and evaluations set them per turn.
//
//   LOGOS_MR=off|shadow|on       default ON. `off` (or 0/false/no) is the
//                                route exactly as it was before MR; `shadow`
//                                decides and traces without enforcing.
//   LOGOS_MR_ARM=baseline|prompt_reflection|state_only|full
//                                the condition the deployment runs when MR is
//                                on (default full). For offline comparisons.
//   LOGOS_IFR=off                Interaction Friction Regulation off inside a
//                                full arm (the IFR-on/off factor).
//   LOGOS_MR_POLICY=<version>    pin an earlier policy (rollback).
//   LOGOS_MR_DELIBERATE=on       allow the model-assisted deliberative loop
//                                (default off: no extra model call, ever).
//   LOGOS_MR_STORE=off           never read or write the ledger.
//   LOGOS_MR_EXPERIMENT=<id>     the experiment enrolled participants are in
//                                (lib/mr/experiment.ts); unset = none.
//
// Pure.

import { ARMS, MR_POLICY_VERSION, type Arm, type MRMode } from './types';

type Env = Record<string, string | undefined>;

const read = (env: Env, k: string) => (env[k] ?? '').trim().toLowerCase();
const isOff = (v: string) => /^(off|0|false|no)$/.test(v);
const isOn = (v: string) => /^(on|1|true|yes)$/.test(v);
const procEnv = (): Env => (typeof process !== 'undefined' ? (process.env as Env) : {});

/** On unless LOGOS_MR says off (off/0/false/no) or shadow. The person's own switch still turns it off for them. */
export function mrMode(env: Env = procEnv()): MRMode {
  const v = read(env, 'LOGOS_MR');
  if (v === 'shadow') return 'shadow';
  if (isOff(v)) return 'off';
  return 'on';
}

/** The deployment's arm when MR runs. Unrecognised → full (the arm MR exists to be). */
export function deploymentArm(env: Env = procEnv()): Arm {
  const v = read(env, 'LOGOS_MR_ARM');
  return (ARMS as readonly string[]).includes(v) ? (v as Arm) : 'full';
}

/** IFR is on inside the full arm unless LOGOS_IFR=off. */
export function ifrOn(env: Env = procEnv()): boolean {
  return !isOff(read(env, 'LOGOS_IFR'));
}

/** The model-assisted deliberative loop: off unless explicitly on. */
export function deliberationOn(env: Env = procEnv()): boolean {
  return isOn(read(env, 'LOGOS_MR_DELIBERATE'));
}

/** The ledger: on unless LOGOS_MR_STORE=off (it is only ever used when MR itself runs). */
export function storeOn(env: Env = procEnv()): boolean {
  return !isOff(read(env, 'LOGOS_MR_STORE'));
}

export function experimentId(env: Env = procEnv()): string | null {
  const v = (env.LOGOS_MR_EXPERIMENT ?? '').trim();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(v) ? v : null;
}

// ── the strategies ───────────────────────────────────────────────────

/**
 * Every number a rule reads. Each is a deliberate, conservative choice; the
 * reasons are in docs/MR.md §Thresholds. Changing one is a new version.
 */
export interface StrategyParams {
  /** replies of Socria's that asked something, in a row, before the questions are called unproductive (with no progress between) */
  unproductiveStreak: number;
  /** confusion after an explanation, this many times, before the explanation strategy changes */
  confusionRepeats: number;
  /** engine-refuted attempts in the window before a worked example is offered */
  failedAttempts: number;
  /** a momentary request ("just tell me") holds for this many turns, the one it was said on included */
  momentaryTurns: number;
  /** an IFR adjustment from observed (not explicit) evidence holds this many turns */
  observedTurns: number;
  /** a worked example is given on this many turns before guided discovery resumes */
  workedExampleTurns: number;
  /** a strategy MR set is kept at least this many turns before MR may change it again (their words may, at once) */
  minDwellTurns: number;
  /** more than this many strategy changes in `oscillationWindow` turns → freeze */
  maxChanges: number;
  oscillationWindow: number;
  /** MR may act on at most this share of the last `excessiveWindow` turns before it freezes */
  maxActiveShare: number;
  excessiveWindow: number;
  /** a freeze lasts this many turns */
  freezeTurns: number;
  /** "shorter": the reply ceiling, in tokens */
  shorterCeiling: number;
  /** a reply this many times longer than their message, and over this many words, three times running, is verbose */
  verboseRatio: number;
  verboseWords: number;
  /** user turns MR reads in full (older ones are folded for standing words only) */
  window: number;
  /** MR's own budget per turn, ms (a warning above, never a failure) */
  latencyBudgetMs: number;
  /** model-assisted deliberations allowed per conversation */
  deliberationsPerConversation: number;
}

export const STRATEGIES: Readonly<Record<string, Readonly<StrategyParams>>> = Object.freeze({
  'mr-2026.10.1': Object.freeze({
    unproductiveStreak: 2,
    confusionRepeats: 2,
    failedAttempts: 2,
    momentaryTurns: 2,
    observedTurns: 3,
    workedExampleTurns: 1,
    minDwellTurns: 2,
    maxChanges: 3,
    oscillationWindow: 6,
    maxActiveShare: 0.75,
    excessiveWindow: 8,
    freezeTurns: 3,
    shorterCeiling: 360,
    verboseRatio: 12,
    verboseWords: 260,
    window: 24,
    latencyBudgetMs: 40,
    deliberationsPerConversation: 2,
  }),
});

/** The policy in force: a pinned version when it exists, the current one otherwise. An unknown pin is ignored (and is an integrity finding). */
export function policyVersion(env: Env = procEnv()): string {
  const pin = (env.LOGOS_MR_POLICY ?? '').trim();
  return pin && STRATEGIES[pin] ? pin : MR_POLICY_VERSION;
}

/** True when LOGOS_MR_POLICY names a version that does not exist. */
export function policyPinInvalid(env: Env = procEnv()): boolean {
  const pin = (env.LOGOS_MR_POLICY ?? '').trim();
  return !!pin && !STRATEGIES[pin];
}

export function paramsFor(version: string): Readonly<StrategyParams> {
  return STRATEGIES[version] ?? STRATEGIES[MR_POLICY_VERSION];
}
