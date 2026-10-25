// lib/mr/state.ts — THE METACOGNITIVE STATE ENGINE.
//
// MR's state for a conversation is FOLDED from the conversation itself, one
// turn of theirs at a time: observe the turn (ifr.ts), read how the previous
// adjustment went (outcome.ts), expire and revoke what has ended, decide
// (policy.ts), and check the result (integrity.ts). The same pattern as Core
// 4's replay (lib/runtime/replay.ts), and for the same reasons:
//
//   • REPRODUCIBLE. Every decision is a pure function of its inputs — the
//     transcript, the policy version, the condition, ACS's move and the
//     engine's verdicts for the turn, their length setting, the facts carried
//     in with their consent, and their reset — so given those, the adjustment
//     that ran on turn 7 can be recomputed exactly. (The ledger keeps codes,
//     not the transcript: a replay needs the transcript from elsewhere, with
//     consent. docs/MR-RESEARCH.md §3.)
//   • NOTHING EXTRA KEPT ABOUT THEM. The transcript the client already sends
//     is the state; the ledger (lib/mr/store.ts) keeps only content-free codes
//     of what was decided, for evaluation, export and their own view.
//   • VERSIONED. The state carries the policy version it was folded under.
//     Pin an older one (LOGOS_MR_POLICY) and the same conversation folds under
//     the older rules.
//
// What crosses conversations is only what they said with "from now on" and
// agreed to have carried (MRSettings.carryAcross): it arrives as `carried`
// facts and enters the fold as standing decisions of their own words.
//
// THE STATE HOLDS NO TEXT. Goals and preferences are codes ('work:practice',
// 'questions:0'); evidence is turn indices. A psychological reading never
// appears as a fact: frustration is only ever their own word for it.
//
// Pure. No model, no network, no clock.

import { isFactQuestion } from '../cognition/assist';
import { sentencesOf } from '../core4/questions';
import { assertDecision, checkDecision, checkHistory, checkTaskRegression } from './integrity';
import { movedOn, observeTurn, observeWords, questionsAsContent, turnsOf, writingForOthers, type TurnView } from './ifr';
import { evaluateOutcome, regulationCause } from './outcome';
import { standingKey } from './adaptation';
import { compose, decide, interventionIdFor, noneDecision, RULE_CONTROLS, RULES, ruleFamily, type PolicyNow, type RuleFamily } from './policy';
import { STRATEGIES, type StrategyParams } from './config';
import type {
  Fact,
  IntegrityFinding,
  InterventionRecord,
  MRDecision,
  MRState,
  MRTurnInput,
  Observation,
  OutcomeVector,
  StrategyState,
  TypedControls,
} from './types';
import { MR_STATE_VERSION } from './types';

export interface FoldInput {
  input: MRTurnInput;
  params: Readonly<StrategyParams>;
  policyVersion: string;
  /** the IFR family is ENFORCED (its rules are folded either way: see foldConversation) */
  ifr: boolean;
  /** consent to carry standing preferences across conversations */
  carryAcross: boolean;
  /** the engine's verdicts on their claims at earlier turns, by user-turn index */
  verdictsByTurn: Readonly<Record<number, readonly { status: string }[]>>;
}

export interface FoldOutput {
  state: MRState;
  /** the decision in force at the newest turn: what this condition enforces */
  current: MRDecision;
  /** everything in force, enforced or not (differs from current only for a condition with IFR off) */
  wouldBe: MRDecision;
  /** decisions made at the newest turn (not carried) */
  fresh: MRDecision[];
  turns: TurnView[];
  /** a reason the deliberative loop should look at this turn, or null */
  deliberation: string | null;
  /** integrity findings raised while folding (this turn's are the ones with turn === state.turn) */
  findings: IntegrityFinding[];
}

const ACTIVE: InterventionRecord['status'] = 'active';
/** observations kept on the state: the last few turns are what the next turn's rules and the ledger need */
const KEEP_OBSERVED_TURNS = 6;

/** A standing preference carried from an earlier conversation, back as the decision their words made. */
function carriedDecision(f: Fact, turn: number, policyVersion: string, conversationKey: string | null, params: Readonly<StrategyParams>): MRDecision | null {
  const rule =
    f.key === 'questions:0'
      ? RULES.find((r) => r.id === 'ifr.explicit.stop_questions')
      : f.key === 'verbosity:shorter'
        ? RULES.find((r) => r.id === 'ifr.explicit.shorter')
        : f.key === 'strategy:direct'
          ? RULES.find((r) => r.id === 'ifr.explicit.direct_answer')
          : null;
  if (!rule) return null;
  const controls =
    f.key === 'questions:0'
      ? { questionBudget: { max: 0 as const, enforcement: 'hard' as const } }
      : f.key === 'verbosity:shorter'
        ? { verbosity: { ceilingTokens: params.shorterCeiling } }
        : { strategy: 'direct' as const, answerFirst: true, questionBudget: { max: 0 as const, enforcement: 'tail' as const } };
  return {
    policyVersion,
    interventionId: interventionIdFor(policyVersion, conversationKey, turn, `${rule.id}:carried`, rule.action),
    action: rule.action,
    trigger: rule.id,
    evidenceRefs: f.refs.length ? f.refs : [{ turn, role: 'user', code: `carried:${f.key}` }],
    target: [...rule.target],
    controls,
    scope: { kind: 'standing' },
    expiration: { afterTurn: null, onRevoke: [...rule.onRevoke] },
    confidence: f.confidence,
    uncertainty: ['carried_from_earlier_conversation'],
    evaluationPlan: rule.plan,
    rollback: { revertTo: 'acs_default', when: ['outcome:revert', ...rule.onRevoke.map((c) => `revoke:${c}`)] },
    loop: 'longitudinal',
    issuedAtTurn: turn,
    carried: true,
  };
}

/** A strategy-setting decision's source: their words, or MR's reading. */
export const sourceOf = (d: MRDecision): StrategyState['source'] => (d.trigger.includes('.explicit.') || d.loop === 'longitudinal' ? 'user' : 'mr');

/** The rule family a decision belongs to: a carried preference is its rule's; MR's own reverts and deliberations are 'mr'. */
const familyOf = (d: MRDecision): RuleFamily => ruleFamily(d.trigger) ?? 'mr';

/** The uncertainty code on a decision this condition computes but does not enforce (an IFR rule with IFR off). */
export const NOT_ENFORCED = 'not_enforced';

/**
 * What a decision is judged against: the controls actually in force at the
 * turn it was made. A member of a composition is enforced with the
 * composition's question budget and ceiling (a worked example inside a quiz
 * keeps the quiz's one question), and a strategy the composition did not pick
 * was never asked of the reply, so it is not tested.
 */
function asEnforced(d: MRDecision, inForce: TypedControls | undefined): MRDecision {
  if (!inForce) return d;
  const c: TypedControls = { ...d.controls };
  if (inForce.questionBudget) c.questionBudget = { ...inForce.questionBudget };
  if (inForce.verbosity) c.verbosity = { ...inForce.verbosity };
  if (c.strategy && inForce.strategy !== c.strategy) delete c.strategy;
  return { ...d, controls: c };
}

export function foldConversation(f: FoldInput): FoldOutput {
  const { input, params, policyVersion } = f;
  const turns = turnsOf(input.messages, input.signals);
  const key = input.conversationKey;
  const findings: IntegrityFinding[] = [];
  const records: InterventionRecord[] = [];
  const outcomes: OutcomeVector[] = [];
  const kept: Observation[] = [];
  const strategy: StrategyState = { current: 'default', since: 0, source: 'default', changes: [] };
  /** the controls in force at each turn (the composition of what this condition enforces), for judging outcomes */
  const inForceAt = new Map<number, TypedControls>();
  const resetTurn = typeof input.resetTurn === 'number' && Number.isInteger(input.resetTurn) && input.resetTurn >= 0 ? input.resetTurn : null;
  let resetDone = resetTurn === null;
  let frozenUntil: number | null = null;
  let lastMrStrategyChange: number | null = null;
  let reverts: number[] = [];
  let workedExampleEnded: number | null = null;

  if (!turns.length) {
    const none = noneDecision(policyVersion, key, 0, ['no_turn']);
    return {
      state: emptyState(policyVersion, key),
      current: none,
      wouldBe: none,
      fresh: [],
      turns,
      deliberation: null,
      findings,
    };
  }
  const last = turns.length - 1;
  const lastIndex = turns[last].index;
  const start = Math.max(0, turns.length - params.window);
  const knownPolicies = Object.keys(STRATEGIES);

  // EVERY ARM FOLDS THE SAME RULES. A condition only changes what is
  // ENFORCED: with IFR off, IFR's decisions are still made, recorded and
  // judged against the replies as sent (marked NOT_ENFORCED) — so the IFR
  // on/off comparison measures the same things in both arms — but they never
  // enter the decision in force, the strategy, or the integrity checks that
  // act on it.
  const enforces = (d: MRDecision) => f.ifr || familyOf(d) !== 'ifr';
  const activeAt = () => records.filter((r) => r.status === ACTIVE);
  const enforcedAt = () => activeAt().filter((r) => enforces(r.decision));
  const lastTurn = turns.length ? turns[turns.length - 1].index : 0;
  const end = (r: InterventionRecord, status: InterventionRecord['status'], at: number, why: string) => {
    if (r.status !== ACTIVE) return;
    r.status = status;
    r.endedAtTurn = at;
    r.endReason = why;
    // a worked example that ran its course, or did not land — not one the monitor took back
    if (r.decision.action === 'worked_example' && (status === 'expired' || why.startsWith('outcome:'))) workedExampleEnded = at;
  };
  const add = (d: MRDecision) => records.push({ decision: enforces(d) ? d : { ...d, uncertainty: [...new Set([...d.uncertainty, NOT_ENFORCED])] }, status: ACTIVE });
  /** The strategy the adjustments in force add up to, and a change recorded when it moves. */
  const settleStrategy = (at: number) => {
    const live = enforcedAt().map((r) => r.decision).filter((d) => d.controls.strategy);
    const composed = live.length ? compose(live, at, policyVersion, key) : null;
    const next = composed?.controls.strategy ?? 'default';
    if (next !== strategy.current) {
      strategy.changes.push([at, next]);
      strategy.changes = strategy.changes.filter(([t]) => at - t < Math.max(params.oscillationWindow, params.minDwellTurns) + 1);
      strategy.current = next;
      strategy.since = at;
      strategy.source = composed ? sourceOf(composed) : 'default';
      if (composed && strategy.source === 'mr') lastMrStrategyChange = at;
    }
  };
  /** Their reset: what MR did on its own before it is over. What they asked for stays theirs. */
  const applyReset = (at: number) => {
    if (resetDone || resetTurn === null || at < resetTurn) return;
    resetDone = true;
    for (const r of activeAt()) if (r.decision.issuedAtTurn < resetTurn && sourceOf(r.decision) === 'mr') end(r, 'revoked', at, 'revoke:reset');
  };
  /** Their words ended these; then the decisions made, each checked against its contract first. */
  const settle = (at: number, out: ReturnType<typeof decide>) => {
    for (const rv of out.revoked) {
      const r = records.find((x) => x.decision.interventionId === rv.id);
      if (r) end(r, 'revoked', at, rv.reason);
    }
    for (const d of out.decisions) {
      const ctx = { knownPolicies, ruleControls: RULE_CONTROLS, turn: at };
      const bad = checkDecision(d, ctx);
      if (bad.some((b) => b.severity === 'block')) {
        // a rule that makes a decision its own contract rejects is a bug: loud under test (CORE4_STRICT), rejected in production
        assertDecision(d, ctx);
        findings.push(...bad);
        continue;
      }
      // the same rule, issued again (their words repeated): the older one is superseded — but a "from now on"
      // (said here or carried in) is not narrowed by saying it again without one ("stop asking me questions"):
      // it stays, and the new one adds nothing it does not already hold
      const wide = (x: MRDecision) => x.scope.kind === 'standing' || !!x.carried;
      for (const r of activeAt()) if (r.decision.trigger === d.trigger && !(wide(r.decision) && !wide(d))) end(r, 'superseded', at, 'superseded');
      add(d);
    }
  };

  // Standing preferences from earlier conversations, with their consent —
  // from the first turn of this conversation they were carried into (its own
  // exposure rows say which), so words said here before they existed never
  // end them and words said since end them here; with nothing recorded here,
  // from the newest turn.
  const carriedFrom = new Map<number, MRDecision[]>();
  if (f.carryAcross) {
    for (const fact of input.carried ?? []) {
      const d = carriedDecision(fact, turns[0].index, policyVersion, key, params);
      if (!d) continue;
      const seen = (input.carriedIn ?? []).filter((x) => x && Number.isInteger(x.turn) && Array.isArray(x.ids) && x.ids.includes(d.interventionId)).map((x) => x.turn);
      const since = seen.length ? Math.min(...seen) : lastTurn;
      const at = turns.find((t) => t.index >= since)?.index ?? lastTurn;
      carriedFrom.set(at, [...(carriedFrom.get(at) ?? []), d]);
    }
  }
  const carryIn = (at: number) => {
    const ds = carriedFrom.get(at);
    if (!ds) return;
    carriedFrom.delete(at);
    for (const d of ds) records.push({ decision: enforces(d) ? d : { ...d, uncertainty: [...d.uncertainty, NOT_ENFORCED] }, status: ACTIVE });
    settleStrategy(at);
  };

  // OLDER THAN THE WINDOW: their words only. An instruction that holds until
  // they take it back ("stop asking me questions", forty turns ago), a quiz
  // they asked for, and their taking either back are read from every turn;
  // the counts, outcomes and integrity checks run over the window below.
  for (let k = 0; k < start; k++) {
    const at = turns[k].index;
    carryIn(at);
    applyReset(at);
    for (const r of activeAt()) {
      const until = r.decision.expiration.afterTurn;
      if (until !== null && until < at) end(r, 'expired', at, 'expired');
    }
    const words = observeWords(turns, k, { params });
    if (!words.length) continue;
    settle(
      at,
      decide({ turn: at, observations: words, active: activeAt(), params, policyVersion, conversationKey: key, ifr: f.ifr, frozen: false, carryAcross: f.carryAcross, now: null, lastMrStrategyChange: null })
    );
    settleStrategy(at);
  }

  for (let k = start; k <= last; k++) {
    const t = turns[k];
    const at = t.index;
    const isNow = k === last;
    const obs = observeTurn(turns, k, {
      work: isNow ? workForIfr(input, t.text) : null,
      verdicts: isNow ? input.context.accuracy.theirs : f.verdictsByTurn[at],
      verdictsByTurn: f.verdictsByTurn,
      params,
      length: input.context.length,
    });
    if (lastIndex - at < KEEP_OBSERVED_TURNS) kept.push(...obs);
    carryIn(at);
    applyReset(at);

    // 1. How the adjustment made at the previous turn went — judged against
    //    what was in force then (asEnforced), and for a decision this
    //    condition does not enforce, against its own controls: whether the
    //    reply happened to do it anyway is what the comparison measures.
    if (k > start) {
      const prev = turns[k - 1];
      for (const r of records) {
        const d = r.decision;
        if (d.issuedAtTurn !== prev.index || d.carried || d.action === 'none' || d.action === 'revert') continue;
        const enforced = enforces(d) ? asEnforced(d, inForceAt.get(prev.index)).controls : undefined;
        // the questions they asked for as content (a list, a draft to somebody) were not put to them
        const questionsWereContent = questionsAsContent(prev.text) || writingForOthers(prev.text, turns.slice(Math.max(0, k - 4), k - 1).map((x) => x.text).reverse());
        const oi = { decision: d, ...(enforced ? { enforced } : {}), ...(questionsWereContent ? { questionsWereContent } : {}), reply: prev.reply, next: t, nextObservations: obs, params };
        const o = evaluateOutcome(oi);
        outcomes.push(o);
        if (enforces(d)) findings.push(...checkTaskRegression(o, at));
        if (o.regulation !== 'revert') continue;
        const cause = regulationCause(oi) ?? 'outcome:revert';
        // Their own words end it only where the rule says those words end it
        // (its onRevoke), or a revocation that covers it: "that doesn't
        // answer it" is about the reply's content, not a "you can ask me
        // questions again".
        const theirWordsEndIt = cause === 'explicit.revoke' || (d.expiration.onRevoke as readonly string[]).includes(cause);
        if (theirWordsEndIt) {
          // a request for questions after a stop, which IFR reads as one taking it back (ifr.ts revokedByAsking), is
          // recorded as what they said: it is not their words taking a "from now on" back (lib/mr/ledger.ts rowsForTurn)
          const asked = cause === 'explicit.revoke' && obs.some((o) => o.code === 'explicit.revoke' && o.refs.some((x) => x.code === 'explicit.wants_questions'));
          end(r, 'revoked', at, `revoke:${asked ? 'explicit.wants_questions' : cause}`);
        } else if (sourceOf(d) === 'user') {
          // A reply that did not do what THEY asked does not end what they
          // asked: MR may not override their instruction because the model
          // ignored it, or because they disliked the content. It stays in
          // force; a missed delivery is an integrity finding.
          if (cause.startsWith('delivery.') && enforces(d)) findings.push({ code: 'control_violation', severity: 'warn', turn: at, detail: `delivery:${cause}`, action: 'none' });
        } else {
          // MR's own adjustment that did not help: rolled back, and counted
          end(r, 'rolled_back', at, cause === 'explicit.negative' ? 'outcome:negative' : 'outcome:revert');
          if (enforces(d)) reverts.push(at);
        }
      }
    }

    // 2. What has run its course.
    for (const r of activeAt()) {
      const until = r.decision.expiration.afterTurn;
      if (until !== null && until < at) end(r, 'expired', at, 'expired');
    }
    // A quiz is over when their practice is: "that's enough for today" said
    // in words the quiz rule does not list still ends it (ifr.ts practiceSince).
    if (!obs.some((o) => o.code === 'observed.practice')) {
      for (const r of activeAt()) if (r.decision.trigger === 'mr.explicit.quiz' && r.decision.issuedAtTurn < at) end(r, 'revoked', at, 'revoke:practice_ended');
    }
    // "Let me try it first" is about that problem: a new question about something else is asked for, not kept back
    for (const r of activeAt()) {
      if (r.decision.trigger !== 'mr.explicit.own_try' || r.decision.issuedAtTurn >= at) continue;
      const from = turns.find((x) => x.index === r.decision.issuedAtTurn);
      if (from && movedOn(from.text, t.text, t.prevReply)) end(r, 'expired', at, 'expired:moved_on');
    }

    // 3. Decide.
    const now: PolicyNow | null = isNow
      ? { assist: input.acs.assist, core: input.acs.core, maxReply: input.context.maxReply }
      : null;
    settle(
      at,
      decide({
        turn: at,
        observations: obs,
        active: activeAt(),
        params,
        policyVersion,
        conversationKey: key,
        ifr: f.ifr,
        frozen: frozenUntil !== null && at <= frozenUntil,
        carryAcross: f.carryAcross,
        now,
        lastMrStrategyChange,
      })
    );
    // expiries, revocations and new decisions can all move the strategy
    settleStrategy(at);

    // 4. Integrity over what this condition enforces.
    const composedNow = compose(enforcedAt().map((r) => r.decision), at, policyVersion, key);
    const quizActive = activeAt().some((r) => r.decision.trigger === 'mr.explicit.quiz');
    const hist = checkHistory({
      interventions: records.filter((r) => enforces(r.decision)),
      strategyChanges: strategy.changes,
      turn: at,
      params,
      preferences: preferencesOf(enforcedAt(), input.carried ?? []),
      goals: goalsOf(input, kept, at, quizActive),
      current: composedNow,
    });
    for (const h of hist) {
      if (findings.some((x) => x.code === h.code && x.turn === h.turn)) continue;
      findings.push(h);
      if (h.action === 'freeze') {
        frozenUntil = at + params.freezeTurns;
        // What MR inferred is taken back; what they said stands.
        for (const r of enforcedAt()) if (sourceOf(r.decision) === 'mr') end(r, 'rolled_back', at, `integrity:${h.code}`);
        settleStrategy(at);
      } else if (h.action === 'revert') {
        for (const r of enforcedAt()) if (r.decision.issuedAtTurn === at && sourceOf(r.decision) === 'mr') end(r, 'rolled_back', at, `integrity:${h.code}`);
        settleStrategy(at);
      }
    }
    inForceAt.set(at, compose(enforcedAt().map((r) => r.decision), at, policyVersion, key).controls);
    reverts = reverts.filter((x) => at - x < 4);
  }

  const active = activeAt();
  const current = compose(enforcedAt().map((r) => r.decision), lastIndex, policyVersion, key);
  const wouldBe = compose(active.map((r) => r.decision), lastIndex, policyVersion, key);
  const fresh = records.filter((r) => r.decision.issuedAtTurn === lastIndex && !r.decision.carried).map((r) => r.decision);
  const nowObs = kept.filter((o) => o.turn === lastIndex);

  // THE DELIBERATIVE LOOP'S TRIGGERS: the fast loop has evidence it is not
  // resolving something. Rare by construction.
  let deliberation: string | null = null;
  const codes = new Set(nowObs.map((o) => o.code));
  if ((codes.has('explicit.quiz') && codes.has('explicit.direct_answer')) || (codes.has('explicit.shorter') && codes.has('explicit.longer'))) {
    deliberation = 'conflicting_instructions';
  } else if (reverts.length >= 2) {
    deliberation = 'repeated_revert';
  } else if (codes.has('observed.failed_attempts') && workedExampleEnded !== null && lastIndex - workedExampleEnded <= 3) {
    deliberation = 'worked_example_not_landing';
  }

  const uncertainty = new Set<string>();
  if (!nowObs.some((o) => o.code === 'explicit.learning_goal' || o.code === 'explicit.quiz' || o.code === 'explicit.own_work')) uncertainty.add('goal_unstated');
  if (outcomes.length && outcomes.every((o) => o.taskCompletion.value === 'unknown')) uncertainty.add('no_outcome_signal');
  if (nowObs.some((o) => o.strength === 'weak')) uncertainty.add('ambiguous_signal');
  if (deliberation) uncertainty.add(`deliberate:${deliberation}`);

  const state: MRState = {
    version: MR_STATE_VERSION,
    policyVersion,
    conversationKey: key,
    turn: lastIndex,
    goals: goalsOf(input, kept, lastIndex, active.some((r) => r.decision.trigger === 'mr.explicit.quiz')),
    preferences: preferencesOf(active, input.carried ?? []),
    strategy,
    observations: kept,
    uncertainty: [...uncertainty],
    interventions: records,
    outcomes,
    frozenUntilTurn: frozenUntil,
    integrity: findings,
    ...(resetTurn !== null ? { resetTurn } : {}),
  };
  return { state, current, wouldBe, fresh, turns, deliberation, findings };
}

/**
 * The work, as IFR's routine-task reader should see it. "Routine" — a fact, a
 * conversion, a calculation with nothing to learn in it — is read with ACS's
 * own conservative reader (isFactQuestion, on the message and on its last
 * sentence: "I spend $95 a week. What is that per month?") or the engine
 * having computed the answer. The runtime's broader work reading is NOT
 * enough on its own: it reads "compare these two studies" as execution, and
 * a comparison is not a routine task. A non-routine information/execution
 * reading is passed as 'research', which IFR does not treat as routine.
 */
export function workForIfr(input: MRTurnInput, text: string): string {
  const last = sentencesOf(text.trim()).filter((x) => x.trim()).pop()?.trim() ?? '';
  const routine = isFactQuestion(text) || (!!last && last !== text.trim() && isFactQuestion(last)) || input.context.accuracy.computed;
  if (routine) return 'information';
  const w = String(input.turnState.work);
  return w === 'information' || w === 'execution' ? 'research' : w;
}

export function emptyState(policyVersion: string, conversationKey: string | null): MRState {
  return {
    version: MR_STATE_VERSION,
    policyVersion,
    conversationKey,
    turn: 0,
    goals: [],
    preferences: [],
    strategy: { current: 'default', since: 0, source: 'default', changes: [] },
    observations: [],
    uncertainty: ['no_turn'],
    interventions: [],
    outcomes: [],
    frozenUntilTurn: null,
    integrity: [],
  };
}

/**
 * What they are doing, as codes. The runtime's reading of the work is an
 * ESTIMATE; a goal they stated in so many words is explicit.
 */
function goalsOf(input: MRTurnInput, obs: readonly Observation[], turn: number, quizActive: boolean): Fact[] {
  const out: Fact[] = [
    { key: 'work', value: String(input.turnState.work), provenance: 'estimate', turn, refs: [], confidence: 0.6, expiresAfterTurn: turn },
  ];
  const said = (code: Observation['code'], key: string, value: string) => {
    const o = [...obs].reverse().find((x) => x.code === code);
    if (o) out.push({ key, value, provenance: 'explicit', turn: o.turn, refs: o.refs, confidence: o.confidence, expiresAfterTurn: null });
  };
  said('explicit.learning_goal', 'goal', 'learn');
  // practice is their goal while the quiz they asked for stands — not after
  // "no, forget the quiz, just tell me", where it would read as a standing
  // wish for questions (integrity.ts goal_drift)
  if (quizActive) said('explicit.quiz', 'goal', 'practice');
  said('explicit.own_work', 'authorship', 'theirs');
  said('explicit.edit_only', 'help', 'edits_only');
  return out;
}

/** Their stated preferences in force, as codes — only from their own words (or carried, with consent). */
export function preferencesOf(active: readonly InterventionRecord[], carried: readonly Fact[]): Fact[] {
  const out: Fact[] = [];
  for (const r of active) {
    const d = r.decision;
    if (!d.trigger.includes('.explicit.') && d.loop !== 'longitudinal') continue;
    const key = prefKey(d);
    if (!key) continue;
    out.push({
      key,
      value: d.action,
      provenance: 'explicit',
      turn: d.issuedAtTurn,
      refs: d.evidenceRefs,
      confidence: d.confidence,
      expiresAfterTurn: d.expiration.afterTurn,
    });
  }
  for (const c of carried) if (!out.some((x) => x.key === c.key)) out.push(c);
  return out;
}

/** The key a stated preference is filed under — adaptation.ts's, so the fold and the carry agree. */
export function prefKey(d: MRDecision): string | null {
  return standingKey(d);
}
