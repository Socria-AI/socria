// test/second-pass.test.mjs
//
// "MODEL A PULSAR" was read as a construction, nothing was proposed, and the
// route reported a fault and stopped. The second pass asks once more, for the
// proposal alone, with the same rules the first pass had — ONE copy of them.
// The call itself needs a key this container does not have; what can be
// tested is the prompt, which is the whole of what the second pass says.

import { buildMapPrompt, buildProposePrompt, EMPTY_MAP } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== the second pass asks for the proposal alone ===');
{
  const p = buildProposePrompt({ action: 'construct', artifact: 'model', topic: 'a pulsar', formal: { states: ['rotation period', 'magnetic field'] } });
  ok('it says why it is being asked', /previous pass over this conversation returned no proposal/.test(p));
  ok('  and what they asked for, in their words', /the subject, in their words: a pulsar/.test(p));
  ok('  and the artifact', /the artifact they asked for: model/.test(p));
  ok('  and what they said about it', /rotation period/.test(p));
  ok('it wants only a proposal', /no "nodes", no "edges", no "viz"/.test(p));
  ok('  with an honest way out', /"propose": null, "because"/.test(p));
  ok('  and a preference for a partial model over none', /Prefer a partial model to none/.test(p));
  ok('a null ask still produces a prompt', /Read what they asked to build from the conversation/.test(buildProposePrompt(null)));
}

console.log('\n=== the two passes share one set of rules ===');
{
  const first = buildMapPrompt(EMPTY_MAP);
  const second = buildProposePrompt({ action: 'construct', artifact: 'model', topic: 'x' });
  for (const rule of [
    'PROPOSING A STRUCTURED MODEL',
    'A COEFFICIENT YOU LEAVE OUT IS A PLACEHOLDER, NOT A FAILURE',
    'THE ENGINE BINDS THE STANDARD NOTATION TO THE SLOT IT NAMES',
    'A CONTINUOUS INPUT WITH NO "over" IS DRAWN OVER 0 TO 10',
    'The engine reads the OBVIOUS ones from their names when you forget',
    '"coefficients": {"intercept": 1, "education": 0.08, "experience": 0.02}',
    'A MECHANISM IS PARTS, NOT EQUATIONS',
  ]) {
    ok(`both passes carry: ${rule.slice(0, 50)}`, first.includes(rule) && second.includes(rule));
  }
  // The prompt no longer promises what the engine does not do, nor forbids
  // what it now does.
  ok('the prompt no longer says the engine will not invent a range', !/the engine will not invent one/.test(first));
  ok('  nor that it cannot tell a dummy from its name', !/The engine cannot tell from the name and will not guess/.test(first));
  ok('  and names the right key for controls', /put them in "params" \(that key, not "parameters"/.test(first));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
