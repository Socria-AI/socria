// Deterministic, per-turn metrics. No model involved.
//
// These are the measurements that do not need judgement: how many questions
// a reply put to the person (any interrogative work — the same counter the
// guard uses), whether it ended on one, whether it revealed something the
// scenario says must stay with the person, closing offers, sycophantic
// openers, length. Each is checked against the turn's `expect` where the
// scenario states one, and reported as a raw number everywhere.
//
// They are deliberately NOT a verdict on quality. A reply can pass every
// check here and still be useless; that is what the blind judge and the
// human raters are for.

export function turnMetrics(q, reply, expect) {
  const i = q.interrogatives(reply);
  const questions = q.questionLoad(reply);
  const trimmed = reply.trim();
  const endsWithQuestion = /\?["'’”)\]]*\s*$/.test(trimmed);
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const revealed = (expect?.mustNotReveal ?? []).filter((r) => {
    try { return new RegExp(r, 'i').test(reply); } catch { return false; }
  });
  const checks = {};
  if (expect && typeof expect.maxQuestions === 'number') checks.maxQuestions = questions <= expect.maxQuestions;
  if (expect?.noQuestionEnding) checks.noQuestionEnding = !endsWithQuestion;
  if (expect?.mustNotReveal?.length) checks.mustNotReveal = revealed.length === 0;
  return {
    questions,
    explicit: i.explicit.length,
    disguised: i.disguised.length,
    offers: i.offers.length,
    endsWithQuestion,
    sycophantic: q.hasSycophanticOpener(reply),
    words,
    revealed,
    checks,
  };
}

/** Sum a list of turn metrics into rates. */
export function aggregate(ms) {
  const n = ms.length || 1;
  const checkNames = [...new Set(ms.flatMap((m) => Object.keys(m.checks)))];
  const checks = Object.fromEntries(
    checkNames.map((c) => {
      const applicable = ms.filter((m) => c in m.checks);
      const passed = applicable.filter((m) => m.checks[c]).length;
      return [c, { passed, of: applicable.length, rate: applicable.length ? passed / applicable.length : null }];
    })
  );
  const mean = (f) => ms.reduce((a, m) => a + f(m), 0) / n;
  return {
    turns: ms.length,
    questionsPerReply: mean((m) => m.questions),
    repliesWithAnyQuestion: mean((m) => (m.questions > 0 ? 1 : 0)),
    endsWithQuestion: mean((m) => (m.endsWithQuestion ? 1 : 0)),
    disguisedPerReply: mean((m) => m.disguised),
    offers: mean((m) => (m.offers > 0 ? 1 : 0)),
    sycophantic: mean((m) => (m.sycophantic ? 1 : 0)),
    words: mean((m) => m.words),
    revealViolations: ms.filter((m) => m.revealed.length).length,
    checks,
  };
}
