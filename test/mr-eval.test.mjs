// THE MR BENCHMARK, OFFLINE (evals/mr/run.mjs) — held to what it may claim.
//
// The benchmark drives the real route through every arm with a SIMULATED
// assistant. This suite runs it and holds down the invariants that make its
// numbers mean anything, and the honesty of what it reports:
//   • shadow changes nothing that reaches anyone: per scenario, its delivered
//     outcomes equal the baseline's;
//   • questions are counted the way the person meets them: every
//     interrogative sentence, check-ins like "Does that make sense?" included;
//   • the full arm lowers the over-asking simulator's unwanted questions
//     against baseline, and every scenario where one still reached the person
//     is named in the report, not averaged away;
//   • the full arm does not lower task success anywhere;
//   • a quiz keeps its questions in every arm; an ambiguous "ok" draws no
//     intervention;
//   • no arm makes an extra model call; MR's own time stays in budget, timed
//     after a warm-up and with no arm always first;
//   • a run with no useful reply counts the turns it played, and a value from
//     one scenario is printed without an interval;
//   • the precision scenarios tell the full arm from baseline: a correction
//     and a redundant question (on its second turn, inside the window) are
//     answered with no question where baseline asks; a stuck turn with nothing
//     shown and a missing referent get one useful question where baseline
//     gives generic advice; the same words with the error attached draw no
//     intervention; a complete solution gets no question and no step;
//   • the ledger it wrote holds no text;
//   • every report says SIMULATION and lists what it does not measure.

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '.tmp', 'mr-bench');
rmSync(OUT, { recursive: true, force: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

const r = spawnSync(process.execPath, [join(here, '..', 'evals', 'mr', 'run.mjs'), '--out', OUT], { encoding: 'utf8', env: { ...process.env, LOGOS_MR: '', LOGOS_IFR: '' } });
ok('the benchmark runs offline, with no key', r.status === 0, `${r.stdout}\n${r.stderr}`.slice(-1500));
const { summary, runs } = JSON.parse(readFileSync(join(OUT, 'summary.json'), 'utf8'));
const report = readFileSync(join(OUT, 'report.md'), 'utf8');

const by = (arm, profile, scenario) => runs.find((x) => x.arm === arm && x.profile === profile && x.scenario === scenario);
const scenarios = [...new Set(runs.map((x) => x.scenario))];

console.log('\n=== shadow is the baseline, as far as anybody can see ===');
for (const profile of ['compliant', 'question_prone']) {
  const same = scenarios.every((s) => {
    const a = by('baseline', profile, s), b = by('shadow', profile, s);
    return JSON.stringify(a.turns.map((t) => [t.questions, t.useful, t.control])) === JSON.stringify(b.turns.map((t) => [t.questions, t.useful, t.control]));
  });
  ok(`${profile}: every scenario delivers the same in shadow as in baseline`, same);
}

console.log('\n=== questions, counted as the person meets them ===');
{
  // The count once came from Core 4's questionLoad, which leaves offers out by design, so a
  // mid-reply "Does that make sense?" scored 0 while the scenario's own check saw a question.
  const missed = runs.flatMap((x) => x.turns.filter((t) => t.questions < t.marks).map((t) => `${x.profile}/${x.arm}/${x.scenario}#${t.k}`));
  ok('the count misses no sentence that ends in a question mark (check-ins and offers included)', missed.length === 0, missed.join(','));
}

console.log('\n=== the full arm ===');
{
  const qp = summary.profiles.question_prone.byArm;
  const d = summary.profiles.question_prone.vsBaseline.full.unnecessaryQuestions;
  ok('lowers the over-asking simulator\'s unwanted questions against baseline', qp.full.unnecessaryQuestions.mean < qp.baseline.unnecessaryQuestions.mean, `${qp.baseline.unnecessaryQuestions.mean} → ${qp.full.unnecessaryQuestions.mean}`);
  console.log(`  (question-prone, unnecessary questions per scenario: baseline ${qp.baseline.unnecessaryQuestions.mean.toFixed(2)}, full ${qp.full.unnecessaryQuestions.mean.toFixed(2)}; paired difference ${d.mean.toFixed(2)} [${d.lo.toFixed(2)}, ${d.hi.toFixed(2)}] ${d.direction})`);
  // What MR did not stop, named. A tail-only cap cannot reach a check-in with more of the reply
  // after it; that is a limit to show, so the suite holds the report to listing every case.
  for (const profile of ['compliant', 'question_prone']) {
    const leaked = scenarios.filter((s) => by('full', profile, s).turns.some((t) => t.unwanted && t.questions > 0));
    const listed = summary.profiles[profile].residual.map((x) => x.scenario);
    const section = report.split(`## Profile: ${profile}`)[1]?.split('### Unwanted questions that still reached the person (full arm)')[1]?.split('\n## ')[0] ?? '';
    console.log(`  (${profile}, full arm, unwanted questions that still reached the person: ${leaked.length ? leaked.map((s) => `${s} ${by('full', profile, s).turns.filter((t) => t.unwanted && t.questions > 0).map((t) => `turn ${t.k}: ${t.questions}`).join(', ')}`).join('; ') : 'none'})`);
    ok(`${profile}: every scenario where one still reached the person is named in the report`, JSON.stringify(leaked) === JSON.stringify(listed) && (leaked.length ? leaked.every((s) => section.includes(`- ${s}:`)) : /None\./.test(section)), `${leaked} vs ${listed}`);
  }
  for (const profile of ['compliant', 'question_prone']) {
    const worse = scenarios.filter((s) => {
      const a = by('baseline', profile, s).metrics.taskSuccess, b = by('full', profile, s).metrics.taskSuccess;
      return a !== null && b !== null && b < a;
    });
    ok(`${profile}: task success is lower in no scenario`, worse.length === 0, worse.join(','));
  }
  // In baseline, ACS's own budget ("never three asking replies in a row") takes a quiz's later questions away;
  // keeping them is MR's doing (the quiz rule is MR's, not IFR's, so it holds with IFR off too).
  ok('a quiz keeps a question on every turn where MR acts', ['full', 'full_no_ifr'].every((arm) => ['compliant', 'question_prone'].every((p) => by(arm, p, 'quiz').turns.every((t) => t.questions >= 1))));
  const baseQuiz = by('baseline', 'compliant', 'quiz').turns.map((t) => t.questions);
  console.log(`  (baseline quiz questions per turn: ${baseQuiz.join(', ')} — ACS's streak rule ends the quiz's questions)`);
  ok('an ambiguous "ok": no intervention in any arm', runs.filter((x) => x.scenario === 'ambiguous').every((x) => x.metrics.noInterventionWhenAmbiguous === 1));
  ok('an unsupported "you\'ve improved" never reaches the person in the full arm', by('full', 'compliant', 'improvement-claims').turns.every((t) => t.control === true));
}

console.log('\n=== the precision scenarios (mr-2026.11.1) ===');
{
  // an open question: the key point and one question about what they meant, not an essay
  for (const profile of ['compliant', 'question_prone']) {
    const f = by('full', profile, 'open-question');
    ok(`${profile}: an open question, full arm: the first reply asks exactly one question, and is useful`, f.turns[0].questions === 1 && f.turns[0].useful === true && f.metrics.oneQuestionWhenWanted === 1, JSON.stringify(f.turns[0]));
  }
  const fc = by('full', 'compliant', 'open-question'), bc = by('baseline', 'compliant', 'open-question');
  ok('compliant: …and it is shorter than baseline\'s first reply (the essay)', fc.metrics.firstReplyWords < bc.metrics.firstReplyWords, `${fc.metrics.firstReplyWords} vs ${bc.metrics.firstReplyWords}`);
  // (question-prone baseline opens with the bare diagnostic question, which is shorter still but not useful: the
  // simulator does not read the route's "EXPLAIN —" move line, so it is never told to explain)
  const fq = by('full', 'question_prone', 'open-question'), bq = by('baseline', 'question_prone', 'open-question');
  ok('question_prone: …where baseline\'s first reply was not useful', bq.turns[0].useful !== true, JSON.stringify({ full: fq.turns[0], baseline: bq.turns[0] }));
  ok('a clear question: no intervention in any arm', runs.filter((x) => x.scenario === 'clear-explain').length > 0 && runs.filter((x) => x.scenario === 'clear-explain').every((x) => x.metrics.noInterventionWhenClear === 1), JSON.stringify(runs.filter((x) => x.scenario === 'clear-explain').map((x) => `${x.profile}/${x.arm}:${x.metrics.noInterventionWhenClear}`)));
  const st = by('full', 'compliant', 'stuck-next-step');
  ok('stuck on the next step (full, compliant): the first reply is useful and asks nothing', st.turns[0].useful === true && st.turns[0].questions === 0, JSON.stringify(st.turns[0]));
  for (const s of ['corrected', 'still-failing']) {
    const x = by('full', 'compliant', s);
    ok(`${s} (full, compliant): the first reply is useful`, x.turns[0].useful === true, JSON.stringify(x.turns[0]));
  }
  ok('the new metrics are reported per arm, each on its own row', ['wordsPerReply', 'firstReplyWords', 'oneQuestionWhenWanted', 'noInterventionWhenClear'].every((m) => new RegExp(`\\| ${m} \\|`).test(report)));
}

console.log('\n=== the precision scenarios tell MR on from MR off (review N16, N25, N26) ===');
{
  // corrected: "useful" alone passed in every arm (the simulator says the answer whatever the prompt). What only the
  // full arm does is take the question away and keep to their correction.
  for (const profile of ['compliant', 'question_prone']) {
    const f = by('full', profile, 'corrected').turns[0], b = by('baseline', profile, 'corrected').turns[0];
    ok(`corrected (${profile}): full asks nothing and keeps to their correction (control true)`, f.questions === 0 && f.control === true, JSON.stringify(f));
    ok(`  …where baseline asks (or does not keep to it): the two arms differ`, b.questions >= 1 || b.control === false, JSON.stringify(b));
  }
  // redundant: turn 0 is the same in every arm (ACS asks nothing after one asking reply). Its second turn, inside the
  // 3-turn window, is where ACS would ask again: the full arm asks nothing there, baseline does.
  for (const profile of ['compliant', 'question_prone']) {
    const f = by('full', profile, 'redundant'), b = by('baseline', profile, 'redundant');
    ok(`redundant (${profile}): two turns played in both arms`, f.turns.length === 2 && b.turns.length === 2, `${f.turns.length} ${b.turns.length}`);
    ok(`  turn 1, inside the window: full asks nothing, baseline asks`, f.turns[1]?.questions === 0 && b.turns[1]?.questions >= 1, JSON.stringify({ full: f.turns[1], baseline: b.turns[1] }));
    ok(`  the window is MR's: full_no_ifr, without the redundant-question reading, asks there too`, by('full_no_ifr', profile, 'redundant').turns[1]?.questions >= 1, JSON.stringify(by('full_no_ifr', profile, 'redundant').turns[1]));
  }
  // the three diagnose families the simulator now reads (sim-model DIAGNOSE_LINE): a stuck turn with nothing shown,
  // and a missing referent, each answered with one plain question in the full arm
  for (const s of ['stuck-unseen', 'missing-referent']) {
    const f = by('full', 'compliant', s), b = by('baseline', 'compliant', s);
    ok(`${s} (compliant): full asks exactly one question and it is the useful one (diagnose)`, f.turns[0].action === 'diagnose' && f.turns[0].questions === 1 && f.turns[0].useful === true && f.metrics.oneQuestionWhenWanted === 1, JSON.stringify(f.turns[0]));
    ok(`  …where baseline gives generic advice instead (not useful)`, b.turns[0].useful !== true && b.metrics.oneQuestionWhenWanted === 0, JSON.stringify(b.turns[0]));
    ok(`  …and the full reply is the shorter one`, f.metrics.firstReplyWords < b.metrics.firstReplyWords, `${f.metrics.firstReplyWords} vs ${b.metrics.firstReplyWords}`);
  }
  // the same words with the error attached: something is on their screen, and MR does nothing in any arm
  const att = runs.filter((x) => x.scenario === 'missing-referent-attached');
  ok('missing-referent with the error attached: no intervention in any arm', att.length > 0 && att.every((x) => x.metrics.noInterventionWhenClear === 1 && x.turns.every((t) => !t.action || t.action === 'none')), JSON.stringify(att.map((x) => `${x.profile}/${x.arm}:${x.turns[0].action}`)));
  ok('  and the full arm (compliant) answers the attached error', by('full', 'compliant', 'missing-referent-attached').turns[0].useful === true, JSON.stringify(by('full', 'compliant', 'missing-referent-attached').turns[0]));
  // complete solutions: the reply solved it, they say thanks — no question and no step added (N25)
  const cs = by('full', 'compliant', 'complete-solution').turns[0];
  ok('complete solution (full, compliant): turn 0 asks nothing and adds no step', cs.questions === 0 && cs.useful === true && (!cs.action || cs.action === 'none'), JSON.stringify(cs));
  ok('  MR adds nothing on it in any arm or profile', runs.filter((x) => x.scenario === 'complete-solution').every((x) => x.turns.every((t) => !t.action || t.action === 'none')), JSON.stringify(runs.filter((x) => x.scenario === 'complete-solution').map((x) => `${x.profile}/${x.arm}:${x.turns[0].action}`)));
}

console.log('\n=== cost ===');
{
  ok('one model call per turn, in every arm', runs.every((x) => x.metrics.modelCallsPerTurn === 1), JSON.stringify(runs.filter((x) => x.metrics.modelCallsPerTurn !== 1).map((x) => `${x.arm}/${x.scenario}`)));
  // The cold start once landed on baseline, which always ran first, and made every MR arm look
  // faster. Now an untimed warm-up pass comes first and the arm order rotates per scenario.
  ok('timing starts warm: an untimed warm-up pass played every run first', summary.warmup.runs === runs.length, JSON.stringify(summary.warmup));
  const arms = [...new Set(runs.map((x) => x.arm))];
  ok('  and no arm always runs first: every arm leads some scenario', arms.every((a) => runs.some((x) => x.arm === a && x.slot === 0)), JSON.stringify(arms.map((a) => [a, runs.filter((x) => x.arm === a && x.slot === 0).length])));
  const warm = runs.filter((x) => x.metrics.mrMs !== null).map((x) => x.metrics.mrMs);
  const cold = summary.warmup.coldStart?.mrMs;
  console.log(`  (cold first call, in the warm-up: ${cold ?? '—'} ms; warm median of medians: ${[...warm].sort((a, b) => a - b)[Math.floor(warm.length / 2)]?.toFixed(1)} ms)`);
  ok(`MR's own time, warm: every run's median under its 40 ms budget (worst ${Math.max(...warm).toFixed(1)} ms)`, warm.length > 0 && warm.every((m) => m < 40));
  ok('  and even the cold first call under 250 ms', Number.isFinite(cold) && cold < 250, String(cold));
}

console.log('\n=== what it says about itself ===');
{
  ok('the ledger it wrote holds no text', summary.ledger.rows > 0 && summary.ledger.rowsWithText === 0, JSON.stringify(summary.ledger));
  ok('the report says SIMULATION, and what it is not evidence of', /SIMULATION/.test(report) && /not evidence that anybody/.test(report));
  ok('  and lists what it does not measure', /Independent performance, retention and autonomy/.test(report));
  ok('  with intervals, and the seed that makes them reproducible', /\[[-\d.]+, [-\d.]+\]/.test(report) && /seed 7/.test(report));
  // One scenario has no spread to resample: "[1.00, 1.00] n=1" read as certainty.
  ok('  but no interval for a value from one scenario: its value and n only', !/\] n=1\b/.test(report) && /\| 1\.00 n=1 \|/.test(report));
  // A person who stopped after one turn waited one turn, not the four-turn cap.
  const off = runs.filter((x) => x.metrics.turnsBeforeUseful !== null && (x.metrics.turnsBeforeUseful > x.metrics.turns || (x.metrics.usefulCensored && x.metrics.turnsBeforeUseful !== x.metrics.turns)));
  ok('a run with no useful reply counts the turns it played, never more', off.length === 0, off.map((x) => `${x.profile}/${x.arm}/${x.scenario}`).join(','));
}

rmSync(OUT, { recursive: true, force: true });
console.log(`\nmr eval: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
