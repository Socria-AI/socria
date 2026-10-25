// lib/mr/deliberate.ts — THE DELIBERATIVE LOOP.
//
// The fast loop (index.ts) is rules over observations. A few situations are
// beyond a rule: two instructions that contradict each other in one message
// ("keep it short, but go into more detail" — a quiz taken back in the same
// breath is not one: IFR reads the newest clause), an adjustment rolled back
// twice in a row, a worked example that did not land either. The fold names
// them (FoldOutput.deliberation); this module decides what to do about them.
//
// WHAT IT MAY TOUCH. Only the full arm, outside shadow, under a condition
// that is theirs to regulate (never when they switched MR off or their
// settings could not be read), and never during an integrity freeze. A
// deliberated adjustment is COMPOSED with what is in force — it can narrow
// the help, never lift their own instructions — and the reply filters stay
// exactly as the fast loop set them.
//
// TWO WAYS, AND THE CHEAP ONE IS THE DEFAULT:
//
//   deterministic  always available, no cost: conflicting instructions are
//                  left to precedence (their newest words, then ACS); a
//                  repeated rollback reverts to ACS's default — the honest
//                  move when MR's adjustments keep failing is to stop making
//                  them; a worked example that did not land is followed by a
//                  simpler one, never a further escalation.
//   model-assisted LOGOS_MR_DELIBERATE=on, at most `deliberationsPerConversation`
//                  times per conversation, under a short timeout: a small model
//                  CHOOSES FROM A MENU that precedence has already filtered
//                  (it can never pick "give the answer" under a withhold, or
//                  "fewer questions" for somebody who just asked for some).
//                  Whatever it returns is parsed into that menu or thrown away;
//                  it never writes text into the reply and never sets a
//                  control itself. Any failure falls back to the deterministic
//                  choice.
//
// The model client is injected (the route passes a tracked OpenAI client), so
// this module never constructs one and its tests need no network.

import { paramsFor, STRATEGIES } from './config';
import { checkCost, checkDecision, checkHistory } from './integrity';
import { compose, interventionIdFor, noneDecision, revertDecision, RULE_CONTROLS } from './policy';
import { NOT_ENFORCED, sourceOf } from './state';
import { enforceDecision, traceOf, type MRRegulation } from './index';
import type { Action, IntegrityFinding, InterventionRecord, MRDecision, MRTurnInput, TypedControls } from './types';

/** What a deliberated action sets — the same controls the fast loop's rules would. */
export const ACTION_CONTROLS: Readonly<Partial<Record<Action, TypedControls>>> = Object.freeze({
  none: {},
  revert: {},
  worked_example: { strategy: 'worked_example', scaffolding: 'more', simplify: true, questionBudget: { max: 0, enforcement: 'tail' } },
  simplify: { simplify: true, scaffolding: 'more' },
  fewer_questions: { questionBudget: { max: 0, enforcement: 'tail' } },
  direct: { strategy: 'direct', answerFirst: true, questionBudget: { max: 0, enforcement: 'tail' } },
  preserve_challenge: { strategy: 'preserve_challenge', questionBudget: { max: 1, enforcement: 'tail' } },
  shorter: { verbosity: { ceilingTokens: 360 } },
});

const MENU_WORDS: Readonly<Partial<Record<Action, string>>> = {
  none: 'leave the help as it is',
  revert: 'undo the adjustments Socria made itself and help the default way',
  worked_example: 'show one fully worked example first',
  simplify: 'explain more simply, in smaller steps',
  fewer_questions: 'stop asking them questions for now',
  direct: 'give them what they asked for directly',
  preserve_challenge: 'keep it a quiz, one question at a time',
  shorter: 'keep replies short',
};

/** Where the deliberative loop may act at all: something is enforced (the full arm, not shadow) and the condition is theirs to regulate. */
export function mayDeliberate(r: Pick<MRRegulation, 'condition' | 'state'>): boolean {
  const c = r.condition;
  if (c.arm !== 'full' || c.shadow) return false;
  if (c.source !== 'deployment' && c.source !== 'experiment') return false;
  // the integrity monitor's freeze: MR takes no new action (types.ts frozenUntilTurn)
  return !(r.state.frozenUntilTurn !== null && r.state.turn <= r.state.frozenUntilTurn);
}

/** The newest turn's explicit codes, as IFR confirmed them. */
const saidNow = (r: MRRegulation) => new Set(r.state.observations.filter((o) => o.turn === r.state.turn && o.code.startsWith('explicit.')).map((o) => o.code));

/** The actions precedence leaves open on this turn. */
export function allowedActions(r: MRRegulation, input: MRTurnInput): Action[] {
  const s = input.signals;
  if (s.safety || input.acs.assist.reasons.includes('safety')) return ['none'];
  const said = saidNow(r);
  const menu: Action[] = ['none', 'revert', 'worked_example', 'simplify'];
  const keeps = !!input.acs.core?.withhold || input.context.guard || said.has('explicit.learning_goal') || s.directness === 'no_answer';
  if (!keeps) menu.push('direct');
  const asksForQuestions = !(said.has('explicit.quiz') && said.has('explicit.direct_answer')) && (said.has('explicit.wants_questions') || said.has('explicit.quiz'));
  if (!asksForQuestions) menu.push('fewer_questions');
  // a quiz only while the one they asked for stands, never against their
  // "stop asking", and not on a turn whose words ask for the answer
  const stopInForce = r.state.preferences.some((f) => f.key === 'questions:0');
  const quizStands = r.state.interventions.some((x) => x.status === 'active' && x.decision.trigger === 'mr.explicit.quiz');
  if (quizStands && !stopInForce && !said.has('explicit.direct_answer') && !said.has('explicit.show_steps')) menu.push('preserve_challenge');
  if (r.state.observations.some((o) => o.code === 'explicit.shorter' || o.code === 'observed.verbose_replies')) menu.push('shorter');
  return menu;
}

/** The choice with no model: conservative by construction. */
export function deterministicChoice(reason: string, allowed: readonly Action[]): Action {
  const pick = (a: Action) => (allowed.includes(a) ? a : 'none');
  if (reason === 'repeated_revert') return pick('revert');
  if (reason === 'worked_example_not_landing') return pick('simplify');
  return 'none';
}

/** Parse a model's answer into the menu, or null. */
export function parseChoice(raw: string, allowed: readonly Action[]): Action | null {
  try {
    const j = JSON.parse(raw) as { action?: unknown };
    const a = typeof j?.action === 'string' ? (j.action.trim() as Action) : null;
    return a && allowed.includes(a) ? a : null;
  } catch {
    return null;
  }
}

/** A deliberated decision, in the same contract as every other. */
export function deliberatedDecision(r: MRRegulation, action: Action, reason: string, how: 'deterministic' | 'model'): MRDecision {
  const turn = r.state.turn;
  const pv = r.decision.policyVersion;
  const key = r.state.conversationKey;
  if (action === 'none') return { ...noneDecision(pv, key, turn, [`deliberate:${reason}`]), loop: 'deliberative' };
  if (action === 'revert') return revertDecision({ policyVersion: pv, conversationKey: key, turn }, [`deliberate:${reason}`], 'deliberative');
  const controls = JSON.parse(JSON.stringify(ACTION_CONTROLS[action] ?? {})) as TypedControls;
  const params = paramsFor(pv);
  if (controls.verbosity) controls.verbosity = { ceilingTokens: params.shorterCeiling };
  return {
    policyVersion: pv,
    interventionId: interventionIdFor(pv, key, turn, `mr.deliberate:${how}`, action),
    action,
    trigger: 'mr.deliberate',
    evidenceRefs: [{ turn, role: 'user', code: `deliberate:${reason}` }],
    target: ['acs', 'behavior'],
    controls,
    scope: { kind: 'turn' },
    expiration: { afterTurn: turn, onRevoke: ['explicit.revoke'] },
    confidence: how === 'model' ? 0.6 : 0.8,
    uncertainty: [`deliberate:${reason}`, `deliberate_by:${how}`],
    evaluationPlan: { primary: 'friction', expect: ['no_revert'], window: 1 },
    rollback: { revertTo: 'acs_default', when: ['outcome:revert'] },
    loop: 'deliberative',
    issuedAtTurn: turn,
  };
}

/**
 * The turn under a deliberated decision. IT NARROWS WHAT IS IN FORCE; IT
 * NEVER REPLACES IT. The deliberated adjustment is composed with every
 * adjustment in force (policy.ts compose: the tightest question budget, the
 * lowest ceiling), so their own "stop asking" or "keep it short" holds
 * whatever is chosen. 'none' leaves everything in force as it is; 'revert'
 * ends only what MR did on its own — what their words asked for stays. Nothing changes where deliberation may
 * not act (mayDeliberate).
 */
export function applyDeliberated(r: MRRegulation, input: MRTurnInput, d: MRDecision, how: 'deterministic' | 'model' = 'deterministic'): MRRegulation {
  if (!mayDeliberate(r)) return r;
  const turn = r.state.turn;
  const why = d.uncertainty.find((u) => u.startsWith('deliberate:')) ?? 'deliberate';
  const records: InterventionRecord[] = r.state.interventions.map((x) => ({ ...x }));
  const enforcedHere = (x: InterventionRecord) => x.status === 'active' && !x.decision.uncertainty.includes(NOT_ENFORCED);
  // "none" leaves the help as it is; only "revert" undoes what MR did on its own
  if (d.action === 'revert') {
    for (const x of records) {
      if (enforcedHere(x) && sourceOf(x.decision) === 'mr') {
        x.status = 'rolled_back';
        x.endedAtTurn = turn;
        x.endReason = why;
      }
    }
  }
  if (d.action !== 'none') records.push({ decision: d, status: 'active' });
  const inForce = compose(records.filter(enforcedHere).map((x) => x.decision), turn, d.policyVersion, r.state.conversationKey);
  const state = { ...r.state, interventions: records };
  const ex = enforceDecision({ state, turns: r.turns }, input, inForce);
  const next: MRRegulation = {
    ...r,
    state,
    decision: ex.decision,
    assist: ex.assist,
    block: ex.block,
    ceiling: ex.ceiling,
    gate: ex.gate,
    enforced: ex.enforced,
    contentTurn: ex.contentTurn,
    fresh: d.action !== 'none' ? [...r.fresh, d] : r.fresh,
    timing: { ...r.timing, deliberated: true, ...(how === 'model' ? { modelDeliberated: true } : {}) },
  };
  next.trace = traceOf(next);
  return next;
}

export interface DeliberateOptions {
  /** an OpenAI-compatible chat.completions.create, already tracked for token logging */
  create?: (params: Record<string, unknown>) => Promise<{ choices?: { message?: { content?: string | null } }[] }>;
  model?: string;
  timeoutMs?: number;
  /**
   * Model-assisted deliberations already spent in this conversation: the
   * ledger's exposure rows that record a model was actually asked
   * (lib/mr/ledger.ts modelDeliberationsIn). The caller passes Infinity when
   * it could not read them — an unknown count is over budget.
   */
  used: number;
  /** model-assisted allowed (LOGOS_MR_DELIBERATE=on) */
  modelAllowed: boolean;
  now?: () => number;
}

/**
 * Resolve the fold's deliberation reason into a decision. Never throws, never
 * blocks longer than the timeout, never lets a model widen what precedence
 * allows, and never runs — not even the model call — where it could not act.
 */
export async function deliberate(
  r: MRRegulation,
  input: MRTurnInput,
  o: DeliberateOptions
): Promise<{ regulation: MRRegulation; how: 'deterministic' | 'model'; findings: IntegrityFinding[]; ms: number }> {
  const clock = o.now ?? (() => Date.now());
  const t0 = clock();
  const reason = r.needsDeliberation;
  const findings: IntegrityFinding[] = [];
  if (!reason || !mayDeliberate(r)) return { regulation: r, how: 'deterministic', findings, ms: 0 };
  const allowed = allowedActions(r, input);
  const params = paramsFor(r.decision.policyVersion);
  const turn = r.state.turn;
  let action = deterministicChoice(reason, allowed);
  let how: 'deterministic' | 'model' = 'deterministic';
  // the budget, counting the call being considered (integrity.ts checkCost)
  const cost = o.modelAllowed ? checkCost((Number.isFinite(o.used) ? o.used : Infinity) + 1, params, turn) : [];
  findings.push(...cost);
  if (o.modelAllowed && !cost.length && o.create && o.model) {
    const recent = input.messages.slice(-4).map((m) => `${m.role === 'user' ? 'THEM' : 'SOCRIA'}: ${String(m.content ?? '').replace(/\s+/g, ' ').slice(0, 600)}`);
    const menu = allowed.map((a) => `- ${a}: ${MENU_WORDS[a] ?? a}`).join('\n');
    how = 'model';
    const ask = o.create({
      model: o.model,
      temperature: 0,
      max_tokens: 60,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You decide how an assistant should adjust the way it is helping one person, choosing ONLY from the menu. ' +
            'The person\'s own explicit words outrank everything; never choose to withhold help they asked for, and never choose to keep asking questions of someone who asked not to be asked. ' +
            'When unsure, choose "none". Reply with JSON: {"action": "<one menu id>"}.\n\nMENU:\n' +
            menu,
        },
        { role: 'user', content: `Why this needs a decision: ${reason}\n\nThe last messages:\n${recent.join('\n')}` },
      ],
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(200, o.timeoutMs ?? 1500)));
    try {
      const res = await Promise.race([ask, timeout]);
      const raw = res && 'choices' in res ? res.choices?.[0]?.message?.content ?? '' : '';
      const parsed = raw ? parseChoice(raw, allowed) : null;
      if (parsed) action = parsed;
      else findings.push({ code: 'unauthorized_policy', severity: 'info', turn, detail: res ? 'deliberation_unparsed' : 'deliberation_timeout', action: 'reject_decision' });
    } catch {
      findings.push({ code: 'unauthorized_policy', severity: 'info', turn, detail: 'deliberation_failed', action: 'reject_decision' });
    }
  }
  // `how` stays 'model' once a model was asked, whatever came back: the budget counts calls, not answers
  let d = deliberatedDecision(r, action, reason, how);
  // The same checks every fast-loop decision passes: the contract, the
  // controls its trigger may set, and drift from their own instructions.
  const bad = [
    ...checkDecision(d, { knownPolicies: Object.keys(STRATEGIES), ruleControls: RULE_CONTROLS, turn }),
    ...checkHistory({ interventions: r.state.interventions, strategyChanges: r.state.strategy.changes, turn, params, preferences: r.state.preferences, goals: r.state.goals, current: d }).filter((f) => f.code === 'goal_drift'),
  ].filter((f) => f.severity === 'block');
  if (bad.length) {
    findings.push(...bad);
    d = deliberatedDecision(r, 'none', reason, how);
  }
  const next = applyDeliberated(r, input, d, how);
  return { regulation: { ...next, integrity: [...next.integrity, ...findings] }, how, findings, ms: clock() - t0 };
}
