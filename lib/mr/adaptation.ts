// lib/mr/adaptation.ts — THE LONGITUDINAL ADAPTATION ENGINE, HONESTLY SCOPED.
//
// The proposal's sixth module "promotes context-dependent strategies only
// after evaluation". What that means here is narrower than the name, on
// purpose:
//
//   • NO AUTOMATIC POLICY LEARNING. Nothing in this file changes a threshold,
//     a rule or a policy version. A new policy is a new STRATEGIES entry
//     (lib/mr/config.ts) written by a person; `promotionVerdict` reads an
//     evaluation of it and returns a RECOMMENDATION with its reasons, and a
//     person decides. `rollbackTarget` names the version a rollback goes to;
//     pinning it (LOGOS_MR_POLICY) is, again, a person's act.
//   • THE ONLY THING THAT CROSSES CONVERSATIONS is what they said with "from
//     now on" — a standing preference — and only when they agreed to have it
//     carried (MRSettings.carryAcross). `standingFacts` folds those out of the
//     ledger. Nothing MR inferred is ever carried: a standing decision has to
//     rest on their own words.
//   • THEIR SETTINGS are read through one bounded parser, `sanitizeSettings`,
//     so a malformed or hostile user_profiles.mr value becomes the defaults —
//     the most private ones — and never something in between.
//
// The evidence ladder (`evidenceLevel`) is the proposal's own table: I
// interaction quality, II independent capability, III longitudinal transfer,
// IV architecture effect. Each level requires the ones below it, and a level
// is only ever read off what a report measured, never off what MR believes.
//
// Pure. No model, no network, no clock (time comes in as `now`).

import { ACTIONS, DEFAULT_MR_SETTINGS, type Action, type Fact, type LedgerRow, type MRDecision, type MRSettings } from './types';

// ── settings ─────────────────────────────────────────────────────────

/** A study id, an experiment id: the same shape config.ts accepts for LOGOS_MR_EXPERIMENT. */
const STUDY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
/** A settings value is a small object; anything larger is not one of ours. */
const MAX_SETTINGS_CHARS = 4096;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A rule id as the ledger writes it ('ifr.explicit.stop_questions'): a short code, never words. */
const RULE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;
/** A forgotten conversation is kept as a hash of its key (lib/mr/store.ts forgottenKey), never the key itself. */
const FORGOTTEN_KEY = /^[0-9a-f]{32}$/;
/** One per rule is all there can be; the explicit rules are far fewer than this. */
export const MAX_REVOKED_STANDING = 32;
/** Deletes within a day; more than this and the oldest go first. */
export const MAX_FORGOTTEN = 50;
/**
 * How long a deleted conversation's marker is kept. It only has to outlast a
 * turn of that conversation still writing its rows — seconds — so a day is
 * generous, and after it nothing of the conversation is left here either.
 */
export const FORGOTTEN_TTL_MS = 86_400_000;

type Stamp<K extends string> = { [k in K]: string } & { at: number };

/** Entries of {key, at}: well-formed only, the newest per key, newest first, at most `max`. */
function stamps<K extends string>(v: unknown, key: K, shape: RegExp, max: number): Stamp<K>[] {
  if (!Array.isArray(v)) return [];
  const newest = new Map<string, number>();
  for (const x of v.slice(0, max * 4)) {
    if (!isObj(x) || typeof x[key] !== 'string' || !shape.test(x[key] as string) || !positive(x.at)) continue;
    const k = x[key] as string;
    const cur = newest.get(k);
    if (cur === undefined || x.at > cur) newest.set(k, x.at);
  }
  return [...newest]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, max)
    .map(([k, at]) => ({ [key]: k, at }) as Stamp<K>);
}

/** The "from now on" preferences their words took back, as stored: by rule, newest per rule. */
export function revokedStandingFrom(v: unknown): { trigger: string; at: number }[] {
  return stamps(v, 'trigger', RULE_ID, MAX_REVOKED_STANDING);
}

/** The conversations whose rows were just deleted, as stored: by hashed key, newest per key. */
export function forgottenFrom(v: unknown): { conversation: string; at: number }[] {
  return stamps(v, 'conversation', FORGOTTEN_KEY, MAX_FORGOTTEN);
}

/**
 * A revocation to record (lib/mr/store.ts writeRows, from an exposure row's
 * `revoked`). `reasserted`: the conversation is saying again that it was
 * taken back at an earlier turn, whose time this row does not know — `at` is
 * then only an upper bound.
 */
export interface Revocation {
  trigger: string;
  at: number;
  reasserted?: boolean;
}

/**
 * The stored revocations with `add` merged in. Their words said now win
 * over an older stamp of the same rule (the newest revocation is what ends
 * the most). A revocation said again by a later turn only fills a gap — it
 * never moves an existing stamp forward, or every later turn of that
 * conversation would end a "from now on" they said again since, somewhere
 * else. Stamps at or before their last reset, and stamps older than any
 * preference that could still be carried, end nothing and are dropped.
 * `changed` is false when nothing needs writing.
 */
export function mergeRevocations(
  held: readonly { trigger: string; at: number }[],
  add: readonly Revocation[],
  o: { now: number; resetAt: number | null }
): { list: { trigger: string; at: number }[]; changed: boolean } {
  const by = new Map(revokedStandingFrom(held).map((x) => [x.trigger, x.at] as const));
  for (const r of add ?? []) {
    if (!r || typeof r.trigger !== 'string' || !RULE_ID.test(r.trigger) || !positive(r.at)) continue;
    const cur = by.get(r.trigger);
    if (cur === undefined || (!r.reasserted && r.at > cur)) by.set(r.trigger, r.at);
  }
  const floor = Math.max(positive(o.resetAt) ? o.resetAt : 0, Number.isFinite(o.now) ? o.now - STANDING_MAX_AGE_MS : 0);
  const list = revokedStandingFrom([...by].filter(([, at]) => at > floor).map(([trigger, at]) => ({ trigger, at })));
  const before = revokedStandingFrom(held);
  return { list, changed: JSON.stringify(list) !== JSON.stringify(before) };
}

/** The stored forgotten conversations with one more, the expired ones dropped. */
export function mergeForgotten(held: readonly { conversation: string; at: number }[], add: { conversation: string; at: number } | null, now: number): { conversation: string; at: number }[] {
  const all = add ? [...held, add] : [...held];
  return forgottenFrom(all.filter((x) => !Number.isFinite(now) || x.at > now - FORGOTTEN_TTL_MS));
}

/**
 * Their MR settings, whatever was stored. Every field is checked on its own:
 * a well-formed `carryAcross` survives a malformed `research`. Anything
 * unknown or malformed takes the DEFAULT_MR_SETTINGS value — MR on, nothing
 * carried, not a research participant. Strict types: the string "false" is
 * not false, it is malformed. The two server-kept markers (revokedStanding,
 * forgotten) are bounded and present only when there is one.
 */
export function sanitizeSettings(raw: unknown): MRSettings {
  let v: unknown = raw;
  if (typeof v === 'string') {
    if (v.length > MAX_SETTINGS_CHARS) v = null;
    else {
      try {
        v = JSON.parse(v);
      } catch {
        v = null;
      }
    }
  }
  const o = isObj(v) ? v : {};
  const r = o.research;
  const research =
    isObj(r) && typeof r.studyId === 'string' && STUDY_ID.test(r.studyId) && positive(r.consentedAt)
      ? { studyId: r.studyId, consentedAt: r.consentedAt }
      : null;
  const revokedStanding = revokedStandingFrom(o.revokedStanding);
  const forgotten = forgottenFrom(o.forgotten);
  return {
    version: 1,
    enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_MR_SETTINGS.enabled,
    carryAcross: typeof o.carryAcross === 'boolean' ? o.carryAcross : DEFAULT_MR_SETTINGS.carryAcross,
    research,
    resetAt: positive(o.resetAt) ? o.resetAt : DEFAULT_MR_SETTINGS.resetAt,
    ...(revokedStanding.length ? { revokedStanding } : {}),
    ...(forgotten.length ? { forgotten } : {}),
  };
}

/**
 * What the person may see of their settings (GET and PUT /api/mr): their
 * choices, without the markers the server keeps for itself.
 */
export function publicSettings(s: MRSettings): MRSettings {
  return { version: 1, enabled: s.enabled, carryAcross: s.carryAcross, research: s.research, resetAt: s.resetAt };
}

// ── what a preference means ──────────────────────────────────────────

/**
 * The few preferences and goals the rest of MR reasons about, in one
 * vocabulary. The state engine files a stated preference under a key
 * (lib/mr/state.ts prefKey: 'questions:0', 'strategy:direct', ...) and a goal
 * under key:value ('goal:learn'); an older or alternative state may file it
 * under the observation code itself ('explicit.stop_questions'). All of them
 * map here, so the integrity monitor and the state_only arm read the same
 * meaning off any of them.
 */
export type PreferenceCode =
  | 'direct' // give the answer / the steps
  | 'no_questions' // stop asking
  | 'wants_questions' // ask me
  | 'quiz' // keep it a quiz
  | 'shorter'
  | 'longer'
  | 'simpler'
  | 'verify'
  | 'edit_only'
  | 'own_work'
  | 'learn';

const PREFERENCE_KEYS: Readonly<Record<string, PreferenceCode>> = Object.freeze({
  // the state engine's keys (and standingKey's)
  'questions:0': 'no_questions',
  'questions:1': 'wants_questions',
  'strategy:direct': 'direct',
  'strategy:quiz': 'quiz',
  'strategy:edit_only': 'edit_only',
  'verbosity:shorter': 'shorter',
  'style:simpler': 'simpler',
  // its goals, as key:value
  'goal:learn': 'learn',
  'goal:practice': 'quiz',
  'authorship:theirs': 'own_work',
  'help:edits_only': 'edit_only',
  // their words' own codes
  'explicit.direct_answer': 'direct',
  'explicit.show_steps': 'direct',
  'explicit.stop_questions': 'no_questions',
  'explicit.wants_questions': 'wants_questions',
  'explicit.quiz': 'quiz',
  'explicit.shorter': 'shorter',
  'explicit.longer': 'longer',
  'explicit.simpler': 'simpler',
  'explicit.verify': 'verify',
  'explicit.edit_only': 'edit_only',
  'explicit.own_work': 'own_work',
  'explicit.learning_goal': 'learn',
});

/** The table's own entry ('constructor' and 'toString' are not preferences). */
const prefCode = (k: string): PreferenceCode | undefined => (Object.prototype.hasOwnProperty.call(PREFERENCE_KEYS, k) ? PREFERENCE_KEYS[k] : undefined);

/** What a preference or goal fact means, or null when it is not one MR reasons about. Reads codes only. */
export function preferenceCodeOf(f: Pick<Fact, 'key' | 'value'>): PreferenceCode | null {
  const key = String(f?.key ?? '');
  const value = typeof f?.value === 'string' ? f.value : '';
  return prefCode(key) ?? prefCode(`${key}:${value}`) ?? prefCode(value) ?? null;
}

/** A fact that holds at `turn`: their own words (never an estimate or a hypothesis), said by then, not yet expired. */
export function preferenceInForce(f: Fact, turn: number): boolean {
  return f.provenance === 'explicit' && f.turn <= turn && (f.expiresAfterTurn === null || f.expiresAfterTurn >= turn);
}

// ── standing preferences across conversations ────────────────────────

/**
 * The key a standing preference is filed under — the same keys the state
 * engine files a stated preference under (lib/mr/state.ts prefKey), so a
 * carried fact and the decision it came from always meet.
 *
 * ONE KEY PER DECISION, the axis it acts on, named with its setting:
 *   strategy:direct     "just give me the answer / the steps" (it also sets
 *                       answer-first and a tail budget; the strategy names it)
 *   strategy:quiz       "quiz me"
 *   strategy:edit_only  "only fix what I asked"
 *   questions:0         "stop asking me questions" (a budget, no strategy)
 *   verbosity:shorter   "shorter"
 *   style:simpler       "simpler"
 * The part before ':' is the axis: a later standing decision on the same axis
 * replaces an earlier one ("latest wins"). Other strategies (a worked
 * example, execute) are MR's readings of one moment, never something to carry,
 * and have no key.
 *
 * A COMPOSED decision (composedOf, more than one member) is several in force
 * at once: its controls are all of theirs merged, while its action, trigger
 * and scope are its newest member's alone. Its key is that member's — read
 * off the action, and only while the member's own control is still there —
 * never off the merged controls: a "stop asking" kept to one conversation,
 * composed with a standing "shorter", must not cross as 'questions:0'.
 */
export function standingKey(
  d: Pick<MRDecision, 'action' | 'controls' | 'composedOf'> | { action: unknown; controls: unknown; composedOf?: unknown } | null | undefined
): string | null {
  if (!d || d.action === 'none' || !isObj(d.controls)) return null;
  const c = d.controls;
  if (Array.isArray(d.composedOf) && d.composedOf.length > 1) {
    const key = typeof d.action === 'string' && Object.prototype.hasOwnProperty.call(KEY_OF_ACTION, d.action) ? KEY_OF_ACTION[d.action as Action] : undefined;
    return key && controlFor(key, c) ? key : null;
  }
  if (c.strategy === 'direct') return 'strategy:direct';
  if (c.strategy === 'preserve_challenge') return 'strategy:quiz';
  if (c.strategy === 'edit_as_asked') return 'strategy:edit_only';
  if (c.strategy) return null;
  if (isObj(c.questionBudget) && c.questionBudget.max === 0) return 'questions:0';
  if (c.verbosity) return 'verbosity:shorter';
  if (c.simplify === true) return 'style:simpler';
  return null;
}

/** The axis an explicit rule's action acts on (the rules in lib/mr/policy.ts that can be stated as a preference). */
const KEY_OF_ACTION: Readonly<Partial<Record<Action, string>>> = Object.freeze({
  fewer_questions: 'questions:0',
  direct: 'strategy:direct',
  preserve_challenge: 'strategy:quiz',
  task_specific: 'strategy:edit_only',
  shorter: 'verbosity:shorter',
  simplify: 'style:simpler',
});

/** The control that makes `key` what it is is present in `c`. */
function controlFor(key: string, c: Record<string, unknown>): boolean {
  switch (key) {
    case 'questions:0':
      return isObj(c.questionBudget) && c.questionBudget.max === 0;
    case 'strategy:direct':
      return c.strategy === 'direct';
    case 'strategy:quiz':
      return c.strategy === 'preserve_challenge';
    case 'strategy:edit_only':
      return c.strategy === 'edit_as_asked';
    case 'verbosity:shorter':
      return isObj(c.verbosity);
    case 'style:simpler':
      return c.simplify === true;
    default:
      return false;
  }
}

const axisOf = (key: string) => key.split(':')[0];
/** The rule fired on their words (lib/mr/policy.ts ids: 'ifr.explicit.*', 'mr.explicit.*'). */
const EXPLICIT_RULE = /^(?:ifr|mr)\.explicit\./;

/** A carried preference lapses after this long with no restatement: the ledger's own retention (Core 4's TRACE_RETENTION_MS). */
export const STANDING_MAX_AGE_MS = 180 * 86_400_000;
/** Their words, said in an earlier conversation: explicit, but not re-heard here. */
const CARRIED_CONFIDENCE = 0.9;

interface StandingCandidate {
  key: string;
  action: Action;
  at: number;
  turn: number;
  onRevoke: Set<string>;
}

/**
 * What they said AT the turn a decision row was made, with a revert's
 * 'revoke:' prefix taken off. Only their words of that turn: a composed row
 * carries its older members' evidence too ("quiz me" from five turns back),
 * and words said before a standing statement cannot revoke it.
 */
function saidThen(rec: Record<string, unknown>, rowTurn: number): string[] {
  const at = Number.isInteger(rec.issuedAtTurn) ? (rec.issuedAtTurn as number) : rowTurn;
  const refs = Array.isArray(rec.evidenceRefs) ? rec.evidenceRefs : [];
  return refs
    .map((r) => (isObj(r) && r.role === 'user' && r.turn === at && typeof r.code === 'string' ? r.code : ''))
    .filter(Boolean)
    .map((c) => (c.startsWith('revoke:') ? c.slice('revoke:'.length) : c));
}

/** Row A comes after row B in time (created_at, then turn within the same moment). */
const after = (a: { at: number; turn: number }, b: { at: number; turn: number }) => a.at > b.at || (a.at === b.at && a.turn > b.turn);

/**
 * THE ONLY CROSS-CONVERSATION CARRY. Standing preferences they stated ("from
 * now on, no questions"), folded out of their ledger rows:
 *
 *   • nothing unless settings.carryAcross (their consent) and MR is on for them;
 *   • only decision rows with scope 'standing' that rest on their own words
 *     (an explicit rule, with an 'explicit.*' code of theirs at that turn —
 *     a preference is never inferred), and not a decision that was itself
 *     carried in (carried, or loop 'longitudinal'): re-carrying is not a new
 *     statement;
 *   • only rows after their last reset (created_at > resetAt), not from the
 *     future, and not older than STANDING_MAX_AGE_MS;
 *   • the latest standing decision on an axis wins;
 *   • a LATER decision row revokes it the way the fold does inside a
 *     conversation: what they said at that row's turn includes one of the
 *     codes the standing decision itself names in expiration.onRevoke ("you
 *     can ask questions again", "quiz me", "never mind, go back"), or it is a
 *     revert keyed to the same axis. Carrying less is the safe direction, so
 *     a revocation said in any conversation ends it everywhere — but only
 *     words said then: a composed row also cites its older members' words;
 *   • a statement made at or before a revocation of its rule recorded in
 *     their settings (settings.revokedStanding) is taken back — it still
 *     replaces what it replaced on its axis, then holds nothing. That record
 *     outlives the conversation the revocation was said in; a statement made
 *     after it carries as usual.
 * A composed row (several decisions in force) is read by its newest member
 * only (standingKey), so nothing it was merged with crosses with it.
 *
 * Each carried fact is explicit, confidence 0.9, until revoked
 * (expiresAfterTurn null), with value = the decision's action. A carried fact
 * has no evidence inside the new conversation: refs are empty and turn is 0
 * (it holds from the first turn). Deterministic: sorted by key.
 */
export function standingFacts(rows: readonly LedgerRow[], settings: MRSettings, now: number): Fact[] {
  if (!settings?.carryAcross || settings.enabled === false || !Array.isArray(rows)) return [];
  const resetAt = positive(settings.resetAt) ? settings.resetAt : 0;
  const oldest = Number.isFinite(now) ? now - STANDING_MAX_AGE_MS : -Infinity;
  const usable = rows
    .filter((r) => r && r.kind === 'decision' && isObj(r.record))
    .filter((r) => typeof r.created_at === 'number' && Number.isFinite(r.created_at))
    .filter((r) => r.created_at > resetAt && r.created_at >= oldest && (!Number.isFinite(now) || r.created_at <= now))
    .map((r) => ({ row: r, rec: r.record, at: r.created_at, turn: Number.isFinite(r.turn) ? r.turn : 0 }))
    .sort((a, b) => a.at - b.at || a.turn - b.turn);
  const revokedAt = new Map(revokedStandingFrom(settings.revokedStanding).map((x) => [x.trigger, x.at] as const));

  const held = new Map<string, StandingCandidate>(); // by axis
  for (const u of usable) {
    const rec = u.rec;
    const action = typeof rec.action === 'string' && (ACTIONS as readonly string[]).includes(rec.action) ? (rec.action as Action) : null;
    if (!action) continue;
    const codes = saidThen(rec, u.turn);
    const controls = isObj(rec.controls) ? rec.controls : {};
    const key = standingKey({ action, controls, composedOf: rec.composedOf });

    // 1. what this row revokes, among what is held so far
    for (const [axis, s] of held) {
      if (!after(u, s)) continue;
      const byWords = codes.some((c) => s.onRevoke.has(c));
      const byRevert = action === 'revert' && key !== null && axisOf(key) === axis;
      if (byWords || byRevert) held.delete(axis);
    }

    // 2. a new standing statement of theirs
    const scope = isObj(rec.scope) ? rec.scope : {};
    if (scope.kind !== 'standing' || action === 'revert' || !key) continue;
    // a standing decision carried into a later conversation is not a new statement of theirs
    if (rec.carried === true || rec.loop === 'longitudinal') continue;
    // their words: a rule that fires on their words, and their words at that turn behind it
    // (an MR reading cites their words too — "repeated confusion" points at each "I don't get it")
    const theirWords = typeof rec.trigger === 'string' && EXPLICIT_RULE.test(rec.trigger) && codes.some((c) => c.startsWith('explicit.'));
    if (!theirWords) continue;
    const exp = isObj(rec.expiration) ? rec.expiration : {};
    const onRevoke = new Set<string>((Array.isArray(exp.onRevoke) ? (exp.onRevoke as unknown[]) : []).filter((c): c is string => typeof c === 'string'));
    if ((revokedAt.get(rec.trigger as string) ?? -Infinity) >= u.at) {
      held.delete(axisOf(key));
      continue;
    }
    held.set(axisOf(key), { key, action, at: u.at, turn: u.turn, onRevoke });
  }

  return [...held.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((s) => ({
      key: s.key,
      value: s.action,
      provenance: 'explicit' as const,
      turn: 0,
      refs: [],
      confidence: CARRIED_CONFIDENCE,
      expiresAfterTurn: null,
    }));
}

// ── evaluation → a recommendation for a person ───────────────────────

export interface MetricCI {
  mean: number;
  lo: number;
  hi: number;
  n: number;
}

export interface EvaluationReport {
  /** the arm (or policy version) being considered */
  candidate: string;
  /** what it is compared with */
  baseline: string;
  /** units were randomly assigned to arms (lib/mr/experiment.ts), not self-selected or before/after */
  randomized: boolean;
  /** per arm: exposures, and each metric's mean with its 95% interval */
  arms: { arm: string; n: number; metrics: Record<string, MetricCI> }[];
  /** the one pre-registered metric the decision rests on */
  primary: string;
  /** metrics that must not get worse (non-inferiority) */
  guardrails: string[];
  /** an independent attempt (theirs, without the answer in between, engine-decided) was measured */
  independentOutcomeMeasured: boolean;
  /** outcomes were measured across sessions (a delayed check), not inside one conversation */
  longitudinal: boolean;
  /** the other arms the candidate was run against in the same study */
  comparedAgainst: string[];
}

export interface PromotionCriteria {
  /** exposures (and measured units for each metric used) per compared arm */
  minPerArm: number;
  requireRandomized: boolean;
  /** the primary effect's interval must clear this, in the metric's good direction (0: exclude no effect) */
  primaryLowerBoundAbove: number;
  /** a guardrail may be worse by at most this much, on its own scale, at the interval's worst end */
  guardrailMargin: number;
}

/**
 * Conservative on purpose (docs/CORE-4-EXPERIMENTS.md: pre-register, do not
 * move the threshold after): 200 per arm, randomized only, an interval that
 * excludes no effect, and both guardrails non-inferior within 0.02.
 */
export const PROMOTION_CRITERIA: PromotionCriteria = Object.freeze({
  minPerArm: 200,
  requireRandomized: true,
  primaryLowerBoundAbove: 0,
  guardrailMargin: 0.02,
});

/** Guardrails every promotion needs: helping must still get the task done, and must still do what they told it to. */
export const REQUIRED_GUARDRAILS: readonly string[] = Object.freeze(['task_success', 'control_compliance']);

/**
 * Which way is better, per metric name. A metric not listed has no known
 * direction, and an effect on it cannot be read as an improvement.
 */
export const METRIC_DIRECTION: Readonly<Record<string, 'higher' | 'lower'>> = Object.freeze({
  task_success: 'higher',
  task_completion: 'higher',
  control_compliance: 'higher',
  user_rated_control: 'higher',
  independent_performance: 'higher',
  retention: 'higher',
  autonomy: 'higher',
  friction: 'lower',
  unwanted_questions: 'lower',
  questions_asked: 'lower',
  repeat_requests: 'lower',
  complaints: 'lower',
  turns_to_useful: 'lower',
  latency_ms: 'lower',
  cost: 'lower',
});

/** Friction measures (evidence level I). */
const FRICTION_METRICS: readonly string[] = ['friction', 'unwanted_questions', 'questions_asked', 'repeat_requests', 'complaints', 'turns_to_useful'];

/** Satisfaction and its look-alikes: how they felt about a reply. Never the thing a promotion rests on (proxy gaming). */
const SATISFACTION = /satisf|thumbs|csat|\bnps\b|nps_|stars?\b|liked|likes\b|helpful|sentiment|positive_feedback|happiness|enjoy/i;

const validCI = (m: MetricCI | undefined): m is MetricCI =>
  !!m &&
  [m.mean, m.lo, m.hi, m.n].every((x) => typeof x === 'number' && Number.isFinite(x)) &&
  m.lo <= m.mean &&
  m.mean <= m.hi &&
  m.n >= 0;

/**
 * The candidate-minus-baseline effect with its interval, from the two arms'
 * own intervals: independent arms, intervals of the same level, roughly
 * normal — the half-widths add in quadrature. Oriented so that POSITIVE IS
 * BETTER (a lower-is-better metric is negated). Null when either is missing.
 */
/** The table's own direction for a metric ('constructor' has none). */
const directionOf = (metric: string): 'higher' | 'lower' | undefined =>
  Object.prototype.hasOwnProperty.call(METRIC_DIRECTION, metric) ? METRIC_DIRECTION[metric] : undefined;

/** A report's arm by name; a malformed entry (null, not an object) is no arm. */
const armOf = (r: EvaluationReport, name: string) =>
  (Array.isArray(r?.arms) ? r.arms : []).find((a) => isObj(a) && a.arm === name) as EvaluationReport['arms'][number] | undefined;

export function armEffect(r: EvaluationReport, metric: string, candidate = r.candidate, baseline = r.baseline): { diff: number; lo: number; hi: number } | null {
  const dir = directionOf(metric);
  const c = armOf(r, candidate)?.metrics?.[metric];
  const b = armOf(r, baseline)?.metrics?.[metric];
  if (!dir || !validCI(c) || !validCI(b)) return null;
  const sign = dir === 'higher' ? 1 : -1;
  const diff = sign * (c.mean - b.mean);
  const half = Math.sqrt(((c.hi - c.lo) / 2) ** 2 + ((b.hi - b.lo) / 2) ** 2);
  return { diff, lo: diff - half, hi: diff + half };
}

/**
 * Should a person promote the candidate? A RECOMMENDATION with its reasons —
 * this applies nothing, writes nothing and changes no version. `promote` is
 * true only when every criterion holds; `reasons` lists every one that did not
 * (or 'all_criteria_met').
 */
export function promotionVerdict(r: EvaluationReport, c: PromotionCriteria = PROMOTION_CRITERIA): { promote: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!r || !Array.isArray(r.arms)) return { promote: false, reasons: ['report_invalid'] };
  if (c.requireRandomized && r.randomized !== true) reasons.push('not_randomized');
  if (r.candidate === r.baseline) reasons.push('candidate_is_baseline');

  const cand = armOf(r, r.candidate);
  const base = armOf(r, r.baseline);
  if (!cand) reasons.push('arm_missing:candidate');
  if (!base) reasons.push('arm_missing:baseline');
  for (const [name, a] of [['candidate', cand], ['baseline', base]] as const) {
    if (a && !(a.n >= c.minPerArm)) reasons.push(`underpowered:${name}:n=${Number.isFinite(a.n) ? a.n : 0}<${c.minPerArm}`);
  }

  // The primary: never satisfaction, a known direction, enough measured, and an interval that clears the bar.
  const primary = String(r.primary ?? '');
  if (!primary) reasons.push('primary_missing');
  else if (SATISFACTION.test(primary)) reasons.push('primary_is_satisfaction');
  else if (!directionOf(primary)) reasons.push('primary_direction_unknown');
  else if (cand && base) {
    const e = armEffect(r, primary);
    const n = Math.min(cand.metrics?.[primary]?.n ?? 0, base.metrics?.[primary]?.n ?? 0);
    if (!e) reasons.push('primary_not_measured');
    else {
      if (n < c.minPerArm) reasons.push(`underpowered:primary:n=${n}<${c.minPerArm}`);
      if (!(e.lo > c.primaryLowerBoundAbove)) reasons.push(e.diff > 0 ? 'primary_ci_includes_no_effect' : 'primary_not_better');
    }
  }

  // Guardrails: both required ones named, measured in both arms, and not worse beyond the margin.
  const guardrails = Array.isArray(r.guardrails) ? r.guardrails : [];
  for (const g of REQUIRED_GUARDRAILS) if (!guardrails.includes(g)) reasons.push(`guardrail_missing:${g}`);
  for (const g of guardrails) {
    if (!directionOf(g)) {
      reasons.push(`guardrail_direction_unknown:${g}`);
      continue;
    }
    const e = armEffect(r, g);
    if (!e) reasons.push(`guardrail_not_measured:${g}`);
    else {
      // "not worse" measured on a handful is not shown, however narrow the interval says it is
      const n = Math.min(cand?.metrics?.[g]?.n ?? 0, base?.metrics?.[g]?.n ?? 0);
      if (n < c.minPerArm) reasons.push(`underpowered:guardrail:${g}:n=${n}<${c.minPerArm}`);
      if (!(e.lo > -c.guardrailMargin)) reasons.push(`guardrail_inferior:${g}`);
    }
  }

  return reasons.length ? { promote: false, reasons } : { promote: true, reasons: ['all_criteria_met'] };
}

/** The effect clears zero in the good direction. */
const better = (r: EvaluationReport, metric: string, cand?: string, base?: string) => {
  const e = armEffect(r, metric, cand, base);
  return !!e && e.lo > 0;
};
/** The effect is significantly worse. */
const worse = (r: EvaluationReport, metric: string) => {
  const e = armEffect(r, metric);
  return !!e && e.hi < 0;
};

/**
 * How far up the proposal's evidence ladder a report reaches. Each level
 * requires every one below it:
 *
 *   I    interaction quality: randomized; at least one friction measure
 *        better and none worse; task success measured and non-inferior.
 *        Says the help got better. Not that they did.
 *   II   independent capability: an independent outcome was measured and
 *        independent_performance is better than baseline.
 *   III  longitudinal transfer: that was measured across sessions.
 *   IV   architecture effect: the candidate is `full` and it beats BOTH the
 *        prompt-only reflection arm and the state-only arm on the primary.
 */
export function evidenceLevel(r: EvaluationReport): 'none' | 'I' | 'II' | 'III' | 'IV' {
  if (!r || !Array.isArray(r.arms) || r.randomized !== true) return 'none';
  const friction = FRICTION_METRICS.filter((m) => armEffect(r, m));
  const task = armEffect(r, 'task_success') ?? armEffect(r, 'task_completion');
  const levelI =
    friction.some((m) => better(r, m)) && !friction.some((m) => worse(r, m)) && !!task && task.lo > -PROMOTION_CRITERIA.guardrailMargin;
  if (!levelI) return 'none';
  if (!(r.independentOutcomeMeasured === true && better(r, 'independent_performance'))) return 'I';
  if (r.longitudinal !== true) return 'II';
  const compared = Array.isArray(r.comparedAgainst) ? r.comparedAgainst : [];
  const primary = String(r.primary ?? '');
  const levelIV =
    r.candidate === 'full' &&
    !SATISFACTION.test(primary) &&
    (['prompt_reflection', 'state_only'] as const).every((arm) => compared.includes(arm) && better(r, primary, 'full', arm));
  return levelIV ? 'IV' : 'III';
}

// ── rollback ─────────────────────────────────────────────────────────

/**
 * The policy version a rollback goes to. `known` is oldest first (the order
 * of STRATEGIES). A valid pin EARLIER than the current version wins;
 * otherwise the version before the current one. A pin to a later version is
 * not a rollback (STRATEGIES can hold a candidate not yet promoted, and
 * "rolling back" onto it would be trying it) and is ignored, saying so. With
 * nothing earlier there is no version to roll back to — the answer is the
 * current version, and the rollback that remains is MR off (LOGOS_MR=off).
 */
export function rollbackTarget(current: string, pinned: string | null, known: readonly string[]): { version: string; reason: string } {
  const list = Array.isArray(known) ? known.filter((k) => typeof k === 'string' && k) : [];
  const at = list.indexOf(current);
  const pinAt = pinned ? list.indexOf(pinned) : -1;
  if (pinned && pinned !== current && pinAt >= 0 && (at < 0 || pinAt < at)) return { version: pinned, reason: 'pinned' };
  const pinNote = pinned && pinAt < 0 ? 'pin_unknown:' : pinned && pinned !== current && pinAt > at ? 'pin_not_earlier:' : '';
  if (!list.length) return { version: current, reason: `${pinNote}no_known_versions` };
  if (at < 0) return { version: list[list.length - 1], reason: `${pinNote}current_unknown:latest_known` };
  if (at === 0) return { version: current, reason: `${pinNote}no_earlier_version:turn_mr_off` };
  return { version: list[at - 1], reason: `${pinNote}previous` };
}
