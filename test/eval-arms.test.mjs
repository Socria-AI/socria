// The eval harness's own arms, tested — because a measurement instrument that
// is quietly wrong is worse than no measurement.
//
// This session found four defects in the instruments and three in the code
// they measure. The instrument defects were all the same shape: a harness that
// LOOKED like it was measuring something and was not. A fake stability number
// computed from cache-identical repeats. A fake sampling spread, because five
// identical requests hash to one key. A fake "the new stages are gated
// correctly" result, because the fake model had no branch for their system
// prompts and every call fell through to prose.
//
// The three-arm longitudinal comparison rests entirely on one property, so it
// gets a test rather than a one-off check:
//
//   ORACLE gets every earlier session verbatim. NATURAL gets none.
//
// If `natural` ever silently starts receiving history, the run still completes
// and still produces judgments, and the persistence result is nonsense with no
// symptom. The difference between these two arms IS the persistence advantage;
// if they are the same arm, the experiment has no independent variable.

import { runBaseline } from '../evals/core4/lib/runner.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const SCENARIO = {
  id: 'arms',
  sessions: [
    { turns: [{ user: 'Session one: monthly logo churn is 4.1% and we raise in March.' }] },
    { turns: [{ user: 'Session two: is March still the right call?' }] },
    { turns: [{ user: 'Session three: the board wants a view.' }] },
  ],
};

/** Run one arm and return the system prompt sent on each turn. */
async function systemsFor(memory) {
  const seen = [];
  globalThis.__socriaModelClient = {
    async complete(req) { seen.push(req.system); return { text: 'ok' }; },
    stream() { throw new Error('not used'); },
  };
  await runBaseline(SCENARIO, { step: { pending: [] }, world: { advance() {} }, memory, client: globalThis.__socriaModelClient });
  return seen;
}

console.log('=== the oracle arm is handed every earlier session, verbatim ===');
{
  const s = await systemsFor('oracle');
  ok('three sessions, three calls', s.length === 3, String(s.length));
  ok('session 1 has nothing to carry', !/MEMORY FROM EARLIER SESSIONS/.test(s[0]));
  ok('session 2 carries session 1', /MEMORY FROM EARLIER SESSIONS/.test(s[1]) && /churn is 4\.1%/.test(s[1]));
  ok('session 3 carries both', /Session 1 ---/.test(s[2]) && /Session 2 ---/.test(s[2]), s[2].slice(-200));
}

console.log('\n=== the natural arm is handed none of it ===');
{
  const s = await systemsFor('natural');
  ok('three sessions, three calls', s.length === 3, String(s.length));
  ok('session 2 has no memory block', !/MEMORY FROM EARLIER SESSIONS/.test(s[1]));
  ok('  and none of session 1\'s text', !/churn is 4\.1%/.test(s[1]), s[1].slice(-200));
  ok('session 3 likewise', !/MEMORY FROM EARLIER SESSIONS/.test(s[2]) && !/is March still the right call/.test(s[2]));
  ok('it still gets the Human-First prompt — it is a strong baseline, not a crippled one',
    s[1].length > 400 && /Human-First|human-first/i.test(s[1]), String(s[1].length));
}

console.log('\n=== the two arms genuinely differ, which is the whole experiment ===');
{
  const a = await systemsFor('oracle');
  const b = await systemsFor('natural');
  ok('session 1 is identical in both — no memory exists yet either way', a[0] === b[0]);
  ok('session 2 is NOT identical', a[1] !== b[1]);
  ok('  and the difference is exactly the history', a[1].length > b[1].length && a[1].includes(b[1].slice(0, 300)));
  ok('the default is oracle, so an unspecified arm stays the conservative one',
    (await systemsFor(undefined))[1] === a[1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
