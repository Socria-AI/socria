// evals/explain/plan.mjs — a turn read the way the chat route reads it, then planned by the explanation engine.
//
// Shared by the plan-audit test (test/explain-audit.test.mjs) and the offline evaluation (evals/explain/run.mjs):
// signals, the route's reading of the turn, the cognitive state, Core 4's allocation, the presentation planner,
// then planExplanation and the guidance block — the same pure seams, in the same order, with no model call.
// Expects the runtime bundle built by test/helpers/build.mjs (test/.tmp/runtime-under-test.mjs).

export const NOW = Date.UTC(2026, 10, 7, 12);
export const DAY = 86_400_000;

/** A golden item's ledger ({topic, seen, right, wrong, daysAgo, box}) as the browser would send it. */
export function ledgerOf(entries = [], now = NOW) {
  return entries.map((e) => ({
    topic: e.topic,
    seen: e.seen ?? 1,
    right: e.right ?? 0,
    wrong: e.wrong ?? 0,
    last: now - Math.round((e.daysAgo ?? e.days ?? 0) * DAY) - (e.hoursAgo ? e.hoursAgo * 3600_000 : 0),
    box: e.box ?? 0,
    ...(e.fade ? { fade: e.fade } : {}),
    ...(e.failed ? { failed: e.failed } : {}),
  }));
}

export function planTurn(R, item, o = {}) {
  const text = item.text;
  const history = (item.history ?? []).map((m) => ({ role: m.role, content: m.content }));
  const signals = R.readSignals(text);
  const route = R.routeTurn({ text, lastReply: [...history].reverse().find((m) => m.role === 'assistant')?.content });
  const checked = item.checked ?? [];
  const state = R.readTurnState({ text, history, signals, intent: route.intent, checked, ...(item.resumedAfterMs ? { resumedAfterMs: item.resumedAfterMs } : {}) });
  const guard = !!item.guard;
  const a = R.allocate({ state, signals, assist: { lastUserText: text, history, guard, ...(item.resumedAfterMs ? { resumedAfterMs: item.resumedAfterMs } : {}) } });
  const ownReasoning = a.split.reasoning === 'human' || a.split.reasoning === 'scaffold';
  const length = item.length ?? null;
  const p = R.planPresentation({
    text,
    state,
    signals,
    questions: item.questions ?? a.assist.questions,
    ownWriting: a.split.creativity === 'human',
    ownJudgment: a.split.judgment === 'human',
    ownReasoning,
    scaffold: a.split.reasoning === 'scaffold',
    guard,
    history,
    length,
  });
  const questions = item.questions ?? a.assist.questions;
  const did = item.did ? { right: item.did.right ?? 0, wrong: item.did.wrong ?? 0 } : undefined;
  const thread = (item.thread ?? []).map((n) => R.sanitizeThreadNote(n)).filter(Boolean);
  const plan = R.planExplanation({
    text,
    history,
    signals,
    state,
    presentation: p,
    questions,
    guard,
    ownReasoning,
    ownJudgment: a.split.judgment === 'human',
    assist: a.assist,
    did,
    ledger: R.sanitizeLedger(ledgerOf(item.ledger, o.now ?? NOW), o.now ?? NOW),
    thread: thread.length === (item.thread ?? []).length ? thread : [],
    length,
    now: o.now ?? NOW,
  });
  const applied = R.applyExplanation(p, plan);
  const block = R.renderTurnGuidance(plan, applied, { said: { retrieval: a.assist.retrieval, selfExplain: a.assist.selfExplain } });
  const shape = R.renderPresentation(applied, {});
  return { plan, p, applied, block, shape, assist: a.assist, state, signals, allocation: a, ownReasoning };
}
