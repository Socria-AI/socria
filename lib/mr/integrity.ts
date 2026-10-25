// lib/mr/integrity.ts — THE METACOGNITIVE INTEGRITY MONITOR.
//
// MR changes how Socria helps, so it can fail in ways of its own, and the
// proposal names them: proxy gaming (satisfaction read as learning), claims
// that the person improved with nothing to show it, controls set outside what
// a rule may set, a strategy flipping back and forth, an adjustment on nearly
// every turn, an adjustment that contradicts what they asked for, a write
// across a privacy boundary, MR's own time and cost. Each is a pure check
// here that returns content-free findings: a code, a severity, the turn, a
// short code-level detail, and what the caller should do about it.
//
// NOTHING HERE ACTS. The state engine freezes and reverts (state.ts), the
// reply gate drops a sentence (the route, via unsupportedClaim), the store
// refuses a write. The monitor only says so, which keeps every check testable
// on its own and every finding recordable in the ledger exactly as it is.
//
// A FINDING NEVER HOLDS CONTENT. Details are codes and counts. A value that
// came in from outside (a trigger, a policy version, an unknown control) is
// never echoed into a detail: it is named by what is wrong with it.
//
// Pure, except assertDecision, which reads the environment to decide whether
// a bad decision is a bug to fail loudly on (tests, CORE4_STRICT=1) — the same
// rule as Core 4's withhold without a quote (lib/core4/allocation.ts).

import { preferenceCodeOf, preferenceInForce, type PreferenceCode } from './adaptation';
import type { StrategyParams } from './config';
import {
  ACTIONS,
  OUTCOME_DIMENSIONS,
  type ControlKey,
  type Fact,
  type IntegrityCode,
  type IntegrityFinding,
  type InterventionRecord,
  type MRDecision,
  type OutcomeVector,
  type Target,
  type TypedControls,
} from './types';

const finding = (code: IntegrityCode, severity: IntegrityFinding['severity'], turn: number, detail: string, action: IntegrityFinding['action']): IntegrityFinding => ({
  code,
  severity,
  turn,
  detail,
  action,
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
/** A content-free code: no whitespace, no quotes, short. Anything else in a code field is text, and text does not belong in a decision. */
const CODE = /^[A-Za-z0-9_][\w.:/=+<>#,@|-]{0,63}$/;

// ── claims that they improved ────────────────────────────────────────

/*
 * A CLAIM THAT THEY IMPROVED needs evidence one conversation cannot hold: a
 * before and an after, measured independently. One engine-verified attempt
 * is one observation (lib/mr/outcome.ts 'single_observation_not_capability')
 * — it supports "that's right", never "you've improved" or "you've mastered
 * it" — and an attempt may echo the answer Socria just gave. So such a
 * claim is always dropped from Socria's own words. "Thanks, that helped" is
 * satisfaction, not evidence either (proxy gaming).
 * Praise of a STEP — "that step is right", "good catch", "nice work on the
 * chain rule step" — is checkable on the page and is left alone. So is
 * anything Socria says about itself or about somebody else, and anything said
 * as a condition, a question, a purpose or a denial ("once you've mastered
 * this", "do you understand it now?", "so you really understand it",
 * "I wouldn't say you've mastered it").
 *
 * Conservative by design: a sentence this matches is dropped from the reply,
 * and a sentence dropped wrongly loses whatever else it said. It misses some
 * claims rather than eat ordinary teaching sentences. English only.
 */
const A = "['’]";
const GUARD =
  // not the subject of a claim: a condition, a question, a purpose, a relative "what you've learned"
  '(?<!\\b(?:if|once|when|whenever|whether|until|till|unless|before|after|so|what|do|does|did|are|were|have|has|had|can|could|would|will|should|might|may|sure|check|ensure|confirm|test)\\s+)' +
  // not a denial of one: "I don't think", "that's not to say", "it doesn't mean"
  `(?<!(?:\\bnot|n${A}t|\\bnever)\\s+(?:to\\s+)?(?:say|saying|claim|claiming|think|thinking|sure|mean|means|suggest|suggests|imply|implies)\\s+(?:that\\s+)?)`;
const ADV =
  '(?:(?:really|truly|clearly|definitely|genuinely|certainly|already|now|just|significantly|massively|greatly|noticeably|dramatically|so|much|finally|actually|obviously|visibly|steadily|quickly|totally|completely|fully)\\s+)*';
const HAVE = `(?:${A}ve|\\s+have)\\s+`;
const ARE = `(?:${A}re|\\s+are)\\s+`;
const MORE = '(?:confident|fluent|skilled|capable|independent|proficient|comfortable)';
const DEGREE = '(?:(?:so|much|a\\s+lot|way|far|even|really|loads|heaps|noticeably|steadily|quite|pretty)\\s+)*';
const CAPABILITY =
  '(?:understanding|grasp|skills?|abilit(?:y|ies)|intuition|reasoning|fluency|mastery|knowledge|comprehension|confidence|thinking|problem[- ]solving(?:\\s+skills?)?|technique|instincts?)';
const CLAUSE_END = '\\s*(?:[.!?,;:)\\u2014\\u2013]|$)';
/*
 * WHAT MAY FOLLOW A GROWTH VERB when the growth is theirs: the clause ends,
 * or it goes on with how much, how fast, since when, at what, as what. An
 * allow-list, not a deny-list of objects, because what follows otherwise is
 * nearly always something else: "you've improved both paragraphs", "you've
 * grown tired of this", "you're growing impatient", "you've got better
 * options", "you're getting better approximations".
 */
const PERSON_TAIL =
  `(?=${CLAUSE_END}|\\s+(?:` +
  [
    'so\\s+(?:much|far|fast|quickly|well|a\\s+lot)',
    'really\\s+(?:well|fast|quickly|a\\s+lot|much)',
    'a\\s+lot',
    'a\\s+great\\s+deal',
    'loads|heaps|lots|tons',
    'well|fast|quickly|steadily',
    'massively|hugely|enormously|tremendously|dramatically|significantly|noticeably|considerably|immensely|remarkably',
    'already|again|lately|recently|since|today|overall|too|here',
    'at|as|with|from|and',
    'over\\s+(?:time|the\\s+(?:last|past)|these|this|recent)',
    `in\\s+(?:confidence|skill|fluency|leaps|every\\s+(?:way|area|respect)|(?:so\\s+)?many\\s+ways|your\\s+(?:own\\s+)?${CAPABILITY})`,
    'this\\s+(?:week|month|term|year|session|semester)',
  ].join('|') +
  ')\\b)';
/** A capability noun that ends its phrase ("a solid understanding of recursion"), not one that modifies another noun ("a skills matrix", "your technique section"). */
const NOUN_END = `(?=${CLAUSE_END}|\\s+(?:of|for|in|with|at|around|about|here|now|already|too|and)\\b)`;

const PERFECT =
  `${GUARD}\\byou${HAVE}${ADV}(?:` +
  [
    `improved${PERSON_TAIL}`,
    `(?:improved|strengthened|deepened|sharpened)\\s+your\\s+(?:own\\s+)?${CAPABILITY}\\b${NOUN_END}`,
    `grown${PERSON_TAIL}`,
    `progressed${PERSON_TAIL}`,
    '(?:leveled|levelled)\\s+up',
    `(?:gotten|got)\\s+${DEGREE}better${PERSON_TAIL}`,
    `become\\s+${DEGREE}(?:(?:better|stronger)${PERSON_TAIL}|more\\s+${MORE})`,
    'become\\s+(?:a|an)\\s+(?:expert|pro|master)\\b',
    `(?:developed|built)\\s+(?:(?:a|an|real|solid|strong|deep|deeper|good|great|much|better|genuine|clear|clearer|firm)\\s+)*(?:(?:understanding|grasp|intuition|mastery|skills?)\\b${NOUN_END}|feel\\s+for)`,
    '(?:made|making)\\s+(?:(?:real|great|huge|big|tremendous|excellent|good|serious|significant|amazing|incredible|massive|remarkable|so\\s+much|a\\s+lot\\s+of|such|some)\\s+)+progress(?!\\s+(?:on|with)\\s+(?:the|this|that|these|your)\\b)',
    'come\\s+(?:such\\s+|so\\s+)?(?:a\\s+long\\s+way|so\\s+far)',
    'mastered\\b',
    '(?:learned|learnt)\\s+(?:a\\s+lot|so\\s+much|loads|tons|a\\s+ton|a\\s+great\\s+deal|heaps|plenty|how\\s+to)\\b',
    '(?:(?:now|finally|fully|really|clearly|truly)\\s+)(?:understood|grasped)\\b',
    '(?:got|gotten)\\s+the\\s+hang\\b',
    'got\\s+it\\s+now\\b',
  ].join('|') +
  ')';

const PROGRESSIVE =
  `${GUARD}\\byou${ARE}${ADV}(?:` +
  [
    `(?:getting|becoming)\\s+${DEGREE}(?:(?:better|stronger)${PERSON_TAIL}|good\\s+at|more\\s+${MORE})`,
    'getting\\s+the\\s+hang\\b',
    `(?:improving|progressing|growing)${PERSON_TAIL}`,
    `(?:improving|strengthening|deepening|sharpening)\\s+your\\s+(?:own\\s+)?${CAPABILITY}\\b${NOUN_END}`,
    'learning\\s+(?:so\\s+|really\\s+|very\\s+)?(?:fast|quickly)\\b',
    'mastering\\b',
    '(?:a|an)\\s+(?:pro|expert|master)\\s+(?:at\\s+(?:this|it|these)\\s+)?now\\b',
  ].join('|') +
  ')';

const UNDERSTANDS_NOW = [
  // "you clearly understand it now", "you get it now" — the "now" ends the clause: in "you understand that x is now 5" it belongs to the maths
  `${GUARD}\\byou\\s+(?:(?:clearly|really|truly|definitely|obviously|now|finally|fully|totally|actually)\\s+)*(?:(?:understand|grasp)\\b[^.!?,;\\n]{0,40}?\\bnow\\b|get\\s+it\\s+now\\b)(?=${CLAUSE_END})`,
  // "you now understand"
  `${GUARD}\\byou\\s+(?:(?:clearly|really|truly|finally|fully)\\s+)*now\\s+(?:(?:clearly|really|truly|fully|finally)\\s+)*(?:understand|grasp|get\\s+it)\\b`,
  // "you clearly understand the idea", "you really get it" (not "you really get the best results", "you really get that wrong")
  `${GUARD}\\byou\\s+(?:clearly|really|obviously|truly|definitely|fully)\\s+(?:(?:understand|grasp)\\s+(?:it|this|that|the|how|why|what)\\b|get\\s+(?:it|this|that)\\b(?=${CLAUSE_END}|\\s+(?:now|already|too|completely|fully)\\b))`,
].join('|');

/** "your understanding (of the chain rule) has grown": at most a short of/in/with phrase between the capability and its verb, so "your confidence interval has improved" and "your understanding of this means the essay has improved" are not about them. */
const OF_WHAT = "(?:\\s+(?:of|in|with|for|at|on|about|around)\\s+(?:[\\w'’-]+\\s+){0,2}[\\w'’-]+)?";
const YOURS =
  `${GUARD}\\byour\\s+(?:(?:overall|general|conceptual|own)\\s+)?${CAPABILITY}\\b${OF_WHAT}(?:\\s+(?:has|have|is|are)|${A}s)\\s+${ADV}(?:` +
  [
    '(?:been\\s+)?(?:improved|improving|grown|growing|deepened|deepening|developed|developing|strengthened|strengthening|progressed|progressing|matured|maturing|advanced)\\b',
    `(?:gotten|got|become|getting|becoming)\\s+${DEGREE}(?:better|stronger|sharper|clearer|deeper)\\b`,
    `${DEGREE}(?:better|stronger|sharper|clearer|deeper)\\s+(?:now\\b|than\\s+(?:before|it\\s+was|last|when))`,
    '(?:really\\s+)?coming\\s+along\\b',
    'come\\s+a\\s+long\\s+way\\b',
  ].join('|') +
  ')';

/** "look how far you've come" — not "I don't know how much you've learned" or "let's check how much you've learned" */
const HOW_FAR = `(?<!\\b(?:know|sure|say|tell|check|test|measure|see|whether|unclear|out)\\s+)\\bhow\\s+(?:far|much)\\s+you${HAVE}(?:come|grown|improved|progressed|learned|learnt)\\b`;

/**
 * A sentence claiming the PERSON improved, learned, mastered, is getting
 * better, has grown, or understands now. Case-insensitive, no `g` flag (so
 * `.test` keeps no state between calls). See the note above for what it
 * deliberately leaves alone.
 */
export const IMPROVEMENT_CLAIM: RegExp = new RegExp(`(?:${PERFECT})|(?:${PROGRESSIVE})|(?:${UNDERSTANDS_NOW})|(?:${YOURS})|(?:${HOW_FAR})`, 'i');

/** Quoted and code text is not Socria's claim: a quoted teacher, a draft in a blockquote, a code comment. */
function ownWords(sentence: string): string {
  return sentence
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^[ \t]*>.*$/gm, ' ')
    .replace(/“[^”\n]{0,400}”/g, ' ')
    .replace(/"[^"\n]{0,400}"/g, ' ');
}

/** A question asks; it does not claim — unless it is a tag on a claim ("you've improved, haven't you?"). */
const TAG_QUESTION = new RegExp(`,\\s*(?:haven${A}t|aren${A}t|don${A}t|didn${A}t|isn${A}t|right|huh|eh|no)\\b[^?]{0,30}\\?\\s*$`, 'i');

/**
 * The reply's sentence claims they improved — which nothing one conversation
 * holds can show (above). The route drops such a sentence
 * (gate.dropUnsupportedClaims, lib/mr/index.ts replyGate).
 */
export function unsupportedClaim(sentence: string): boolean {
  const s = ownWords(String(sentence ?? '')).trim();
  if (!s) return false;
  if (/\?\s*$/.test(s) && !TAG_QUESTION.test(s)) return false;
  return IMPROVEMENT_CLAIM.test(s);
}

// ── a decision's contract ────────────────────────────────────────────

const CONTROL_KEYS: readonly ControlKey[] = [
  'questionBudget',
  'questionWindow',
  'strategy',
  'scaffolding',
  'simplify',
  'verbosity',
  'verification',
  'answerFirst',
  'noRevealAnswers',
];
const STRATEGIES: readonly NonNullable<TypedControls['strategy']>[] = ['direct', 'execute', 'worked_example', 'guided', 'preserve_challenge', 'edit_as_asked'];
const SCOPES = ['turn', 'turns', 'conversation', 'standing'];
const TARGETS: readonly Target[] = ['acs', 'behavior', 'epistemic', 'orchestration'];
const LOOPS: readonly MRDecision['loop'][] = ['fast', 'deliberative', 'longitudinal'];
/** A list whose every entry is a code (absent counts as empty). */
const codeList = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string' && CODE.test(x)));

/** A control's value has the shape the runtime enforces; anything else could not be enforced as written. */
function controlValid(key: ControlKey, v: unknown): boolean {
  switch (key) {
    case 'questionBudget':
      return isObj(v) && (v.max === 0 || v.max === 1) && (v.enforcement === 'hard' || v.enforcement === 'tail');
    case 'questionWindow':
      return isObj(v) && isInt(v.max) && v.max >= 0 && isInt(v.turns) && v.turns >= 1;
    case 'strategy':
      return typeof v === 'string' && (STRATEGIES as readonly string[]).includes(v);
    case 'scaffolding':
      return v === 'less' || v === 'more';
    case 'verbosity':
      return isObj(v) && isInt(v.ceilingTokens) && v.ceilingTokens > 0;
    case 'verification':
      return v === 'explicit';
    case 'simplify':
    case 'answerFirst':
    case 'noRevealAnswers':
      return typeof v === 'boolean';
  }
}

/** The controls a decision actually sets (a key present with `undefined` sets nothing). */
function setKeys(controls: unknown): string[] {
  return isObj(controls) ? Object.keys(controls).filter((k) => controls[k] !== undefined) : [];
}

/**
 * A decision checked against its contract BEFORE the runtime enforces it.
 *
 * contract_invalid — a non-'none' decision without evidence, a valid
 *   expiration (consistent with its scope; an open-ended one must name what
 *   revokes it), a rollback (with conditions, except a revert, which is
 *   itself the rollback), an evaluation plan, or a confidence in [0,1]; an
 *   evidence or uncertainty entry that is not a code (a quote has no place in
 *   a decision); evidence from a turn after the decision; a standing scope
 *   that does not rest on their own words (an explicit rule); a control of
 *   the wrong shape; a 'none' decision that sets a control; and, because a
 *   ledger row keeps the decision as it is, an expectation, a rollback
 *   condition, a constraint or a member id that is not a code, an unknown
 *   target or loop, or an intervention id that is not one.
 * unauthorized_policy — a policy version that is not known, an unknown rule,
 *   or a control the rule that fired may not set (ruleControls[trigger]).
 *
 * Every finding blocks, and the action is reject_decision.
 */
export function checkDecision(
  d: MRDecision,
  ctx: { knownPolicies: readonly string[]; ruleControls: Readonly<Record<string, readonly ControlKey[]>>; turn: number }
): IntegrityFinding[] {
  const out: IntegrityFinding[] = [];
  const turn = ctx.turn;
  const invalid = (detail: string) => out.push(finding('contract_invalid', 'block', turn, detail, 'reject_decision'));
  const unauthorized = (detail: string) => out.push(finding('unauthorized_policy', 'block', turn, detail, 'reject_decision'));
  if (!isObj(d)) {
    invalid('not_a_decision');
    return out;
  }

  if (typeof d.policyVersion !== 'string' || !ctx.knownPolicies.includes(d.policyVersion)) unauthorized('unknown_policy_version');
  if (typeof d.action !== 'string' || !(ACTIONS as readonly string[]).includes(d.action)) {
    invalid('unknown_action');
    return out;
  }

  const keys = setKeys(d.controls);
  if (d.controls !== undefined && !isObj(d.controls)) invalid('controls_not_object');
  if (d.action === 'none') {
    if (keys.length) invalid('none_sets_controls');
    return out;
  }

  // the rule, and what it may set
  const allowed = typeof d.trigger === 'string' && Object.prototype.hasOwnProperty.call(ctx.ruleControls, d.trigger) ? ctx.ruleControls[d.trigger] : null;
  if (!allowed) unauthorized('unknown_rule');
  for (const k of keys) {
    if (!(CONTROL_KEYS as readonly string[]).includes(k)) {
      invalid('unknown_control');
      continue;
    }
    const key = k as ControlKey;
    if (!controlValid(key, (d.controls as Record<string, unknown>)[k])) invalid(`bad_control:${key}`);
    if (allowed && !allowed.includes(key)) unauthorized(`control_not_allowed:${key}`);
  }

  // evidence: codes from turns that had happened
  const issued = d.issuedAtTurn;
  if (!isInt(issued) || issued < 0) invalid('bad_issued_turn');
  const refs: unknown = d.evidenceRefs;
  if (!Array.isArray(refs) || !refs.length) invalid('missing:evidenceRefs');
  else {
    if (refs.some((r) => !isObj(r) || typeof r.code !== 'string' || !CODE.test(r.code))) invalid('evidence_not_code');
    if (refs.some((r) => !isObj(r) || !isInt(r.turn) || r.turn < 0 || (r.role !== 'user' && r.role !== 'assistant'))) invalid('evidence_malformed');
    else if (isInt(issued) && refs.some((r) => (r as { turn: number }).turn > issued)) invalid('evidence_after_decision');
  }
  const uncertainty: unknown = d.uncertainty;
  if (uncertainty !== undefined && (!Array.isArray(uncertainty) || uncertainty.some((u) => typeof u !== 'string' || !CODE.test(u)))) invalid('uncertainty_not_code');

  // scope and expiration agree, and nothing runs forever without a way to end it
  const scope: unknown = d.scope;
  const exp: unknown = d.expiration;
  if (!isObj(scope) || typeof scope.kind !== 'string' || !SCOPES.includes(scope.kind)) invalid('missing:scope');
  if (!isObj(exp) || !Array.isArray(exp.onRevoke) || !(exp.afterTurn === null || isInt(exp.afterTurn))) invalid('missing:expiration');
  else if (isObj(scope) && isInt(issued)) {
    const after = exp.afterTurn as number | null;
    const onRevoke = exp.onRevoke as unknown[];
    if (onRevoke.some((c) => typeof c !== 'string' || !CODE.test(c))) invalid('revoke_not_code');
    if (scope.kind === 'turn' && after !== issued) invalid('expiration_scope_mismatch');
    if (scope.kind === 'turns') {
      const n = scope.turns;
      if (!isInt(n) || n < 1) invalid('scope_turns_invalid');
      else if (after === null || after < issued || after > issued + n - 1) invalid('expiration_scope_mismatch');
    }
    if ((scope.kind === 'conversation' || scope.kind === 'standing') && after === null && !onRevoke.length) invalid('unending_without_revoke');
    if (after !== null && after < issued) invalid('expires_before_issued');
  }
  // across conversations only on their own words (a preference is never inferred)
  if (isObj(scope) && scope.kind === 'standing' && !theirs(d)) invalid('standing_without_their_words');

  // how it is undone, and how it is judged
  const rb: unknown = d.rollback;
  if (!isObj(rb) || rb.revertTo !== 'acs_default' || !Array.isArray(rb.when)) invalid('missing:rollback');
  else {
    if (d.action !== 'revert' && !rb.when.length) invalid('rollback_without_conditions');
    if (!codeList(rb.when)) invalid('rollback_not_code');
  }
  const plan: unknown = d.evaluationPlan;
  if (
    !isObj(plan) ||
    typeof plan.primary !== 'string' ||
    !(OUTCOME_DIMENSIONS as readonly string[]).includes(plan.primary) ||
    !isInt(plan.window) ||
    plan.window < 1 ||
    !Array.isArray(plan.expect)
  ) {
    invalid('missing:evaluationPlan');
  } else if (!codeList(plan.expect)) invalid('expect_not_code');

  if (typeof d.confidence !== 'number' || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) invalid('confidence_out_of_range');

  // The rest of what a ledger row keeps of a decision, as it is (lib/mr/ledger.ts):
  // ids and codes only, from fixed vocabularies where there is one.
  if (typeof d.interventionId !== 'string' || !CODE.test(d.interventionId)) invalid('bad_intervention_id');
  const target: unknown = d.target;
  if (!Array.isArray(target) || !target.length || target.some((t) => !(TARGETS as readonly unknown[]).includes(t))) invalid('bad_target');
  if (!(LOOPS as readonly unknown[]).includes(d.loop)) invalid('bad_loop');
  if (!codeList(d.constrainedBy)) invalid('constrained_not_code');
  if (!codeList(d.composedOf)) invalid('composed_not_code');
  return out;
}

/** Strict where a bad decision is a bug (tests, CORE4_STRICT=1); in production it is rejected, not thrown. */
function strict(): boolean {
  const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
  return env.NODE_ENV === 'test' || env.CORE4_STRICT === '1';
}

/**
 * checkDecision, loud: throws on a blocking finding when strict, and is a
 * no-op otherwise (the caller still rejects the decision through checkDecision).
 * The message holds codes only.
 */
export function assertDecision(d: MRDecision, ctx: Parameters<typeof checkDecision>[1]): void {
  if (!strict()) return;
  const bad = checkDecision(d, ctx).filter((f) => f.severity === 'block');
  if (bad.length) throw new Error(`mr decision rejected: ${bad.map((f) => `${f.code}:${f.detail}`).join(',')}`);
}

// ── the history of decisions ─────────────────────────────────────────

/** A rule that fires on their words ('ifr.explicit.stop_questions', 'mr.explicit.quiz'), and a carried standing preference, which keeps its rule's id. */
const EXPLICIT_RULE = /^(?:ifr|mr)\.explicit\./;

/**
 * Their own words made it. Read off the RULE that fired, never off the
 * evidence codes: MR's own readings point at their words too ("repeated
 * confusion" cites each explicit.confused; "practice" cites the quiz request),
 * and a worked example MR chose after two confusions is MR's choice, not
 * theirs. A revert is theirs when every reason for it is one of their
 * revocations ('revoke:explicit.*').
 */
function theirs(d: MRDecision): boolean {
  if (typeof d.trigger !== 'string') return false;
  if (EXPLICIT_RULE.test(d.trigger)) return true;
  if (d.action !== 'revert' || !Array.isArray(d.evidenceRefs) || !d.evidenceRefs.length) return false;
  return d.evidenceRefs.every((r) => r?.role === 'user' && typeof r.code === 'string' && r.code.startsWith('revoke:explicit.'));
}

/** MR's own adjustment, not their words and not a return to the default. */
const mrInitiated = (d: MRDecision) => d.action !== 'none' && d.action !== 'revert' && !theirs(d);

/**
 * The last turn a record applied to. endedAtTurn is the turn it stopped
 * applying at (an expiry is read on the turn after its last; a revocation, a
 * rollback or a supersession on the turn their words or the outcome arrived).
 */
function lastActive(r: InterventionRecord, now: number): number {
  let last = r.decision.expiration?.afterTurn ?? now;
  if (isInt(r.endedAtTurn)) last = Math.min(last, r.endedAtTurn - 1);
  return Math.min(last, now);
}

type Change = { turn: number; strategy: string; cause: 'theirs' | 'expiry' | 'correction' | 'mr' };

/** Why the strategy changed at a turn: their words, a planned expiry, the monitor's own correction, or MR. */
function causeOf(turn: number, strategy: string, interventions: readonly InterventionRecord[]): Change['cause'] {
  const issuedThere = interventions.filter((r) => r.decision.issuedAtTurn === turn);
  const endedThere = interventions.filter((r) => r.endedAtTurn === turn);
  const ended = (prefix: string) => endedThere.some((r) => typeof r.endReason === 'string' && r.endReason.startsWith(prefix));
  // a strategy issued at that turn says who chose it, whatever else ended there
  if (strategy !== 'default' && issuedThere.some((r) => r.decision.controls?.strategy === strategy && theirs(r.decision))) return 'theirs';
  if (strategy !== 'default' && issuedThere.some((r) => r.decision.controls?.strategy === strategy)) return 'mr';
  if (ended('revoke:')) return 'theirs';
  if (issuedThere.some((r) => r.decision.action === 'revert' && theirs(r.decision))) return 'theirs';
  // the monitor's own rollbacks, and the control loop undoing an adjustment whose outcome was bad, are corrections — not MR changing course
  if (ended('integrity:') || ended('outcome:')) return 'correction';
  if (endedThere.some((r) => r.status === 'expired' || r.endReason === 'expired')) return 'expiry';
  // an adjustment that ended at or after its own last turn was ending anyway
  if (endedThere.some((r) => isInt(r.decision.expiration?.afterTurn) && (r.decision.expiration.afterTurn as number) < turn)) return 'expiry';
  return 'mr';
}

/** The strategy a decision moves to, or null when it sets none. */
function strategyOf(d: MRDecision | null | undefined): string | null {
  if (!d || d.action === 'none') return null;
  if (d.action === 'revert') return 'default';
  return d.controls?.strategy ?? null;
}

const DIRECT: ReadonlySet<PreferenceCode> = new Set(['direct']);
const NO_QUESTIONS: ReadonlySet<PreferenceCode> = new Set(['no_questions']);
const WANTS_QUESTIONS: ReadonlySet<PreferenceCode> = new Set(['wants_questions', 'quiz']);
/** hands over less than they asked for */
const LESS_DIRECT_ACTIONS: ReadonlySet<string> = new Set(['guided_discovery', 'preserve_challenge', 'more_scaffolding']);
const LESS_DIRECT_STRATEGIES: ReadonlySet<string> = new Set(['guided', 'preserve_challenge']);

/**
 * Integrity over the history of decisions in a conversation.
 *
 * oscillation (freeze) — more than params.maxChanges strategy changes within
 *   params.oscillationWindow turns, or an A→B→A flip where B held for fewer
 *   than params.minDwellTurns. Only MR's own decisions to change count: a
 *   change their words made is them, a return at a planned expiry is the end
 *   of a change already counted, and an integrity rollback is the monitor's
 *   correction (counting it would keep a freeze renewing itself). A flip
 *   likewise needs MR to have made both changes, to B and back. The current
 *   decision's strategy, if it would move, counts as a change at this turn.
 *   The finding repeats on every turn the condition holds.
 * excessive_intervention (freeze) — MR's own adjustments (not their words,
 *   not a revert) in force on more than params.maxActiveShare of the last
 *   params.excessiveWindow turns, once that many turns exist. An instruction
 *   of theirs in force on every turn is them, not MR acting too much.
 * goal_drift (revert, block) — the current decision hands over less (guided
 *   discovery, a preserved challenge, more scaffolding) while their "just
 *   tell me / show me the steps" is in force; raises questions while their
 *   "stop asking" is in force; or takes questions away while their "ask me /
 *   quiz me" is in force. Where two of their own instructions conflict, the
 *   newer one is the one in force — and a decision their own words made, no
 *   older than the instruction it contradicts, is never drift.
 * "Their words" is the rule that fired (an explicit rule, or a revert of
 * their revocations), never the evidence codes alone: MR's own readings cite
 * their words too.
 */
export function checkHistory(i: {
  interventions: readonly InterventionRecord[];
  strategyChanges: readonly [number, string][];
  turn: number;
  params: StrategyParams;
  goals?: readonly Fact[];
  preferences?: readonly Fact[];
  current?: MRDecision | null;
}): IntegrityFinding[] {
  const out: IntegrityFinding[] = [];
  const { turn, params } = i;
  const interventions = (i.interventions ?? []).filter((r) => r && isObj(r.decision));

  // ── oscillation
  const changes: Change[] = (i.strategyChanges ?? [])
    .filter((c) => Array.isArray(c) && isInt(c[0]) && typeof c[1] === 'string' && c[0] <= turn)
    .map(([t, s]) => ({ turn: t, strategy: s, cause: causeOf(t, s, interventions) }));
  const next = strategyOf(i.current);
  const lastStrategy = changes.length ? changes[changes.length - 1].strategy : 'default';
  if (next !== null && next !== lastStrategy && !(changes.length && changes[changes.length - 1].turn === turn)) {
    changes.push({ turn, strategy: next, cause: i.current && theirs(i.current) ? 'theirs' : 'mr' });
  }
  const recent = changes.filter((c) => turn - c.turn < params.oscillationWindow);
  // a planned expiry ends a change already counted; their words and the monitor's own rollbacks are not MR changing course
  const counted = recent.filter((c) => c.cause === 'mr').length;
  const why: string[] = [];
  if (counted > params.maxChanges) why.push(`changes:${counted}>${params.maxChanges}`);
  for (let k = 2; k < changes.length; k++) {
    const [a, b, c] = [changes[k - 2], changes[k - 1], changes[k]];
    if (turn - c.turn >= params.oscillationWindow) continue;
    // indecision is MR choosing B and then A again; a B their words or an expiry brought is a new situation
    if (b.cause !== 'mr' || c.cause !== 'mr' || a.strategy !== c.strategy || b.strategy === c.strategy) continue;
    const dwell = c.turn - b.turn;
    if (dwell < params.minDwellTurns) {
      why.push(`flip:dwell=${dwell}<${params.minDwellTurns}`);
      break;
    }
  }
  if (why.length) out.push(finding('oscillation', 'warn', turn, why.join(','), 'freeze'));

  // ── excessive intervention
  if (turn + 1 >= params.excessiveWindow && params.excessiveWindow > 0) {
    const from = turn - params.excessiveWindow + 1;
    const active = new Set<number>();
    for (const r of interventions) {
      if (!mrInitiated(r.decision) || !isInt(r.decision.issuedAtTurn)) continue;
      const last = lastActive(r, turn);
      for (let t = Math.max(from, r.decision.issuedAtTurn); t <= last; t++) active.add(t);
    }
    if (i.current && mrInitiated(i.current)) active.add(turn);
    const share = active.size / params.excessiveWindow;
    if (share > params.maxActiveShare) {
      out.push(finding('excessive_intervention', 'warn', turn, `active:${active.size}/${params.excessiveWindow}`, 'freeze'));
    }
  }

  // ── goal drift
  const d = i.current;
  if (d && d.action !== 'none' && d.action !== 'revert') {
    const facts = [...(i.preferences ?? []), ...(i.goals ?? [])].filter((f) => f && preferenceInForce(f, turn));
    const newest = (codes: ReadonlySet<PreferenceCode>) =>
      facts.filter((f) => codes.has(preferenceCodeOf(f) as PreferenceCode)).reduce((m, f) => Math.max(m, f.turn), -1);
    const direct = newest(DIRECT);
    const noQ = newest(NO_QUESTIONS);
    const wantQ = newest(WANTS_QUESTIONS);
    const c = d.controls ?? {};
    const drift: string[] = [];
    // Drift is MR's reading against their words. A decision their own words
    // made, at or after the instruction it contradicts, is them changing
    // their mind ("quiz me", later "just fix the grammar"), not drift.
    const mine = (prefTurn: number) => !theirs(d) || !isInt(d.issuedAtTurn) || d.issuedAtTurn < prefTurn;
    // "just tell me" is in force unless a newer "quiz me / ask me" replaced it
    if (direct >= 0 && direct >= wantQ && mine(direct) && (LESS_DIRECT_ACTIONS.has(d.action) || LESS_DIRECT_STRATEGIES.has(c.strategy ?? '') || c.noRevealAnswers === true)) {
      drift.push(`direct_pref:${d.action}`);
    }
    const asks = (c.questionBudget?.max ?? 0) > 0 || d.action === 'guided_discovery' || c.strategy === 'guided' || c.strategy === 'preserve_challenge';
    if (noQ >= 0 && noQ >= wantQ && mine(noQ) && asks) drift.push(`no_questions_pref:${d.action}`);
    const takesAway = c.questionBudget?.max === 0 || d.action === 'fewer_questions';
    if (wantQ >= 0 && wantQ > Math.max(noQ, direct) && mine(wantQ) && takesAway) drift.push(`questions_pref:${d.action}`);
    if (drift.length) out.push(finding('goal_drift', 'block', turn, drift.join(','), 'revert'));
  }
  return out;
}

// ── what an outcome may be used to claim ─────────────────────────────

/**
 * Proxy gaming: a success claimed from a measure that cannot carry it.
 *   capability   "they got better at it" needs an independent attempt of
 *                theirs, decided by the engine (independentPerformance with a
 *                value, observed). Satisfaction and friction cannot show it.
 *   interaction  "the help went better" needs task completion or friction;
 *                their saying thanks alone cannot show it.
 * The finding blocks the claim; nothing is done to the conversation.
 */
export function checkOutcomeUse(outcomes: readonly OutcomeVector[], claim: 'interaction' | 'capability'): IntegrityFinding[] {
  const list = (outcomes ?? []).filter((o) => isObj(o));
  const turn = list.reduce((m, o) => (isInt(o.turn) ? Math.max(m, o.turn) : m), 0);
  const known = (v: unknown) => v !== undefined && v !== 'unknown';
  const satisfied = list.some((o) => known(o.satisfaction?.value));
  if (claim === 'capability') {
    const independent = list.some((o) => known(o.independentPerformance?.value) && o.independentPerformance?.provenance === 'observed');
    if (independent) return [];
    const frictioned = list.some((o) => known(o.friction?.value));
    const detail = satisfied || frictioned ? `capability_from:${[satisfied ? 'satisfaction' : '', frictioned ? 'friction' : ''].filter(Boolean).join('+')}` : 'capability_without_evidence';
    return [finding('proxy_gaming', 'block', turn, detail, 'none')];
  }
  const interaction = list.some((o) => known(o.taskCompletion?.value) || known(o.friction?.value));
  if (interaction) return [];
  return [finding('proxy_gaming', 'block', turn, satisfied ? 'interaction_from:satisfaction' : 'interaction_without_evidence', 'none')];
}

// ── budgets, privacy, regression ─────────────────────────────────────

/** MR's own time over its per-turn budget: a warning, never a failure. An unreadable time is no reading. */
export function checkLatency(ms: number, params: StrategyParams, turn: number): IntegrityFinding[] {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= params.latencyBudgetMs) return [];
  return [finding('latency_budget', 'warn', turn, `ms:${Math.round(ms)}>${params.latencyBudgetMs}`, 'none')];
}

/**
 * Model-assisted deliberations this conversation, counting the one being
 * considered, over params.deliberationsPerConversation: that one may not run.
 */
export function checkCost(deliberations: number, params: StrategyParams, turn: number): IntegrityFinding[] {
  const n = typeof deliberations === 'number' && Number.isFinite(deliberations) ? deliberations : Infinity;
  if (n <= params.deliberationsPerConversation) return [];
  return [finding('cost_budget', 'block', turn, `deliberations:${Number.isFinite(n) ? n : 'unknown'}>${params.deliberationsPerConversation}`, 'none')];
}

/**
 * May MR write (or read across conversations) for this turn? One finding per
 * reason it may not; empty means it may. Fails closed: an incognito flag that
 * could not be read (null) is treated as incognito, because the read that
 * failed says nothing about what they chose.
 *
 *   no_user                 a guest: nothing is kept server-side
 *   shared                  more than one person: MR keeps no per-person state
 *   persist_none            their words put the conversation off the record
 *   incognito / incognito_unknown
 *   store_off               LOGOS_MR_STORE=off
 *   carry_without_consent   a cross-conversation read or write without carryAcross
 *   carry_conversation_only their words kept this conversation to itself
 */
export function checkPrivacy(w: {
  userId: string | null;
  shared: boolean;
  persistPolicy: 'full' | 'conversation_only' | 'none';
  incognito: boolean | null;
  storeOn: boolean;
  consent: { carryAcross: boolean };
  crossConversation: boolean;
  turn: number;
}): IntegrityFinding[] {
  const why: string[] = [];
  if (!w.userId) why.push('no_user');
  if (w.shared !== false) why.push('shared');
  if (w.persistPolicy !== 'full' && w.persistPolicy !== 'conversation_only') why.push('persist_none');
  if (w.incognito === true) why.push('incognito');
  else if (w.incognito !== false) why.push('incognito_unknown');
  if (w.storeOn !== true) why.push('store_off');
  if (w.crossConversation) {
    if (w.consent?.carryAcross !== true) why.push('carry_without_consent');
    if (w.persistPolicy === 'conversation_only') why.push('carry_conversation_only');
  }
  return why.map((detail) => finding('privacy_boundary', 'block', w.turn, detail, 'block_write'));
}

/** An adjusted turn that did not deliver what they asked for: the adjustment is reverted. */
export function checkTaskRegression(o: OutcomeVector, turn: number): IntegrityFinding[] {
  if (!isObj(o) || o.taskCompletion?.value !== 'not_delivered') return [];
  return [finding('task_regression', 'warn', turn, 'not_delivered', 'revert')];
}
