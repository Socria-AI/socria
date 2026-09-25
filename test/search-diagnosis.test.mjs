// Why the search came back empty.
//
// FOUR ROUNDS OF "SEARCH STILL ISN'T WORKING" were spent on one line of code:
// `fetch(...).then(r => r.ok ? r.json() : null).catch(() => null)`. A key the
// provider rejects, an account out of credits, blocked egress from the runtime,
// and a query that genuinely matched nothing all arrived at the rest of the turn
// as the same empty array, logged nowhere. Core 4 then correctly told the person
// it could not pull anything up live and pointed them at where to look — which
// is the right behaviour for a failed lookup and reads, from outside, exactly
// like a broken feature.
//
// So the suite is about the ONE fact that ends that argument: the status the
// provider returned, kept at the point it was known, and turned into a sentence
// that names what to do about it.
//
// THE CONSTRAINT THAT OUTRANKS ALL OF IT: a diagnostic that leaks a key is a
// worse bug than the one it diagnoses. The last block is a standing check that
// nothing here can carry one out, however the provider answers.

import { runSearch, whyEmpty } from './.tmp/logos-explore.mjs';
import { probeSearch, summarise } from './.tmp/upstream-health.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const KEY = 'test-key-do-not-leak-3f9a';
const realFetch = globalThis.fetch;

// The provider layer now says something when a search comes back empty, which is
// the point of the whole change — so the noise is captured rather than printed,
// and one block below asserts it happened at all.
const logged = [];
const realError = console.error;
console.error = (...a) => logged.push(a);
const env = { ...process.env };
const reset = () => {
  globalThis.fetch = realFetch;
  for (const k of ['SERPER_API_KEY', 'TAVILY_API_KEY']) delete process.env[k];
  if (env.SERPER_API_KEY) process.env.SERPER_API_KEY = env.SERPER_API_KEY;
  if (env.TAVILY_API_KEY) process.env.TAVILY_API_KEY = env.TAVILY_API_KEY;
};

/** A provider that answers however the test says, and records what it was asked. */
function stub(answer) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const a = typeof answer === 'function' ? answer(String(url)) : answer;
    if (a instanceof Error) throw a;
    return {
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      json: async () => a.body ?? {},
    };
  };
  return calls;
}

const ORGANIC = { organic: [{ title: 'A page', link: 'https://example.com/a', snippet: 'words', date: '2 days ago' }] };

console.log('=== a status becomes a reason ===');
{
  ok('no answer at all is unreachable', whyEmpty('google', null).why === 'unreachable');
  ok('402 is out of credits', whyEmpty('google', 402).why === 'out of credits');
  ok('429 is rate-limited', whyEmpty('google', 429).why === 'rate-limited');
  ok('401 is rejected', whyEmpty('google', 401).why === 'rejected');
  ok('403 is rejected', whyEmpty('google', 403).why === 'rejected');
  ok('400 is rejected', whyEmpty('google', 400).why === 'rejected');
  // THE ONE THAT MATTERS MOST: a provider that answered fine and simply had
  // nothing is not a misconfiguration, and telling somebody to rotate a working
  // key would send them after the wrong thing entirely.
  ok('200 with nothing in it is "no results"', whyEmpty('google', 200).why === 'no results');
  ok('the status itself is carried, not just the label', whyEmpty('tavily', 402).status === 402);
  ok('  with the provider that gave it', whyEmpty('tavily', 402).provider === 'tavily');
}

console.log('\n=== the provider\'s refusal survives the trip ===');
{
  process.env.SERPER_API_KEY = KEY;
  stub({ status: 403 });
  const b = await runSearch('recent uta shorthorn articles on ai');
  ok('no results, as before', b.results.length === 0);
  ok('but now it says why', b.failure?.why === 'rejected', JSON.stringify(b.failure));
  ok('  and with which status', b.failure?.status === 403);
  ok('  and names the provider', b.provider === 'google');
  reset();
}

console.log('\n=== an account out of credits is not a bug in the code ===');
{
  process.env.SERPER_API_KEY = KEY;
  stub({ status: 402 });
  const b = await runSearch('anything');
  ok('out of credits reaches the caller under its own name', b.failure?.why === 'out of credits');
  reset();
}

console.log('\n=== egress that never lands is a third thing again ===');
{
  process.env.SERPER_API_KEY = KEY;
  stub(new TypeError('fetch failed'));
  const b = await runSearch('anything');
  ok('a request that never landed is unreachable', b.failure?.why === 'unreachable', JSON.stringify(b.failure));
  ok('  and nothing threw', Array.isArray(b.results));
  reset();
}

console.log('\n=== success says nothing, which is how a caller can trust the field ===');
{
  process.env.SERPER_API_KEY = KEY;
  stub({ status: 200, body: ORGANIC });
  const b = await runSearch('anything');
  ok('results came back', b.results.length === 1, JSON.stringify(b.results));
  ok('and there is no failure to report', b.failure === undefined);
  ok('the published date is kept', b.results[0].published === '2 days ago');
  reset();
}

console.log('\n=== a reply has nowhere to put a picture ===');
{
  process.env.SERPER_API_KEY = KEY;
  let calls = stub({ status: 200, body: ORGANIC });
  await runSearch('anything', { images: false });
  ok('one request, not two', calls.length === 1, calls.map((c) => c.url).join(','));
  ok('  and it is the search endpoint', calls[0].url.endsWith('/search'));
  reset();

  process.env.SERPER_API_KEY = KEY;
  calls = stub({ status: 200, body: ORGANIC });
  await runSearch('anything');
  // Explore shows images beside a node, so the default is unchanged: this is a
  // new option for callers that discard them, not a removed feature.
  ok('the panel still gets its images', calls.length === 2 && calls.some((c) => c.url.endsWith('/images')));
  reset();
}

console.log('\n=== a failing images endpoint cannot cost a turn its sources ===');
{
  process.env.SERPER_API_KEY = KEY;
  stub((url) => (url.endsWith('/images') ? { status: 403 } : { status: 200, body: ORGANIC }));
  const b = await runSearch('anything');
  ok('the search still counts', b.results.length === 1);
  ok('  and nothing is reported as failed', b.failure === undefined);
  reset();
}

console.log('\n=== a key pasted with its newline or its quotes still works ===');
{
  // The whole class: the variable IS set, so searchConfigured says yes, and then
  // the header the provider sees is malformed and comes back 403 — which reads
  // from outside as a wrong key when the key is fine.
  for (const [label, raw] of [
    ['a trailing newline', KEY + '\n'],
    ['leading and trailing space', '  ' + KEY + '  '],
    ['the quotes it was copied inside', '"' + KEY + '"'],
    ["single quotes", "'" + KEY + "'"],
  ]) {
    process.env.SERPER_API_KEY = raw;
    const calls = stub({ status: 200, body: ORGANIC });
    const b = await runSearch('anything', { images: false });
    ok(`${label} is cleaned off before it goes out`, calls[0]?.init?.headers?.['X-API-KEY'] === KEY,
      JSON.stringify(calls[0]?.init?.headers ?? null).replace(KEY, '<key>'));
    ok(`  and the search works`, b.results.length === 1);
    reset();
  }
  // Empty or whitespace-only is somebody's half-finished configuration, and
  // counting it as a key means every lookup fails with a 403 instead of the
  // deployment simply saying it cannot search.
  for (const blank of ['', '   ', '""']) {
    process.env.SERPER_API_KEY = blank;
    const calls = stub({ status: 200, body: ORGANIC });
    const b = await runSearch('anything');
    ok(`${JSON.stringify(blank)} counts as no key at all`, calls.length === 0 && b.provider === null);
    reset();
  }
}

console.log('\n=== no key configured is its own answer, and costs no request ===');
{
  const calls = stub({ status: 200, body: ORGANIC });
  const b = await runSearch('anything');
  ok('nothing was asked of anybody', calls.length === 0);
  ok('and no failure is invented for it', b.failure === undefined && b.provider === null);
  reset();
}

console.log('\n=== the deployment can be asked whether it can search ===');
{
  const noKey = await probeSearch({ configured: () => false, run: async () => ({ results: [], provider: null }) });
  ok('an unconfigured deployment says so', !noKey.configured && noKey.why === 'no key');

  const refused = await probeSearch({
    configured: () => true,
    run: async () => ({ results: [], provider: 'google', failure: { provider: 'google', status: 403, why: 'rejected' } }),
  });
  ok('a rejected key comes through with its status', refused.status === 403 && refused.why === 'rejected');
  ok('  and is not reported as ok', !refused.ok);

  const working = await probeSearch({
    configured: () => true,
    run: async () => ({ results: [{}, {}], provider: 'google' }),
  });
  ok('a working provider is ok, with a count', working.ok && working.results === 2);
  ok('  and names itself', working.provider === 'google');

  // probeSearch is the last line before a person is told "everything is fine",
  // so a throw inside it must not become a 500 on the diagnostics endpoint.
  const threw = await probeSearch({
    configured: () => true,
    run: async () => { throw new RangeError('x'); },
  });
  ok('a throw is named, not propagated', !threw.ok && /RangeError/.test(threw.why ?? ''));
}

console.log('\n=== the verdict names what to do ===');
{
  const healthy = [{ what: 'model a', ok: true, ms: 1 }];
  const say = (search) => summarise({ commit: 'abc1234', node: 'v20', hasApiKey: true, probes: healthy, search });

  ok('a missing key says REDEPLOY, because Vercel captures them per build',
    /REDEPLOY/.test(say({ configured: false, provider: null, ok: false, results: 0, why: 'no key', ms: 0 })));
  ok('  and names both variables', /SERPER_API_KEY/.test(say({ configured: false, provider: null, ok: false, results: 0, why: 'no key', ms: 0 })) &&
    /TAVILY_API_KEY/.test(say({ configured: false, provider: null, ok: false, results: 0, why: 'no key', ms: 0 })));
  ok('a rejected key says check the value and the environment',
    /Production/.test(say({ configured: true, provider: 'google', ok: false, results: 0, why: 'rejected', ms: 9 })));
  ok('out of credits says nothing in the code can fix it',
    /code can work around/.test(say({ configured: true, provider: 'google', ok: false, results: 0, why: 'out of credits', ms: 9 })));
  ok('unreachable sends them at egress, not at the key',
    /egress/.test(say({ configured: true, provider: 'google', ok: false, results: 0, why: 'unreachable', ms: 9 })));
  ok('a working search is not mentioned at all',
    /Everything this check can reach is working/.test(say({ configured: true, provider: 'google', ok: true, results: 4, why: undefined, ms: 9 })));

  // Order matters: without a reply model there is no reply to put a source in,
  // so the model fault is the one to fix first and the one to print.
  const badModel = summarise({
    commit: 'abc1234', node: 'v20', hasApiKey: true,
    probes: [{ what: 'model a', ok: false, code: 'upstream_auth', reason: 'x', ms: 1 }],
    search: { configured: false, provider: null, ok: false, results: 0, why: 'no key', ms: 0 },
  });
  ok('a broken reply model outranks a broken search', /OPENAI_API_KEY/.test(badModel), badModel);

  // A report from a host that does not run the search check must not read as a
  // failed search.
  ok('no search probe at all is not a failed search',
    /Everything this check can reach is working/.test(summarise({ commit: 'a', node: 'v20', hasApiKey: true, probes: healthy })));
}

console.log('\n=== nothing here can carry a key out ===');
{
  process.env.SERPER_API_KEY = KEY;
  for (const answer of [{ status: 403 }, { status: 402 }, { status: 500 }, new TypeError('fetch failed')]) {
    stub(answer);
    const b = await runSearch('anything');
    const dumped = JSON.stringify(b);
    ok(`the bundle for ${answer instanceof Error ? 'a dead socket' : answer.status} holds no key`,
      !dumped.includes(KEY), dumped.slice(0, 200));
    const p = await probeSearch({ configured: () => true, run: () => runSearch('anything') });
    ok(`  nor does the probe`, !JSON.stringify(p).includes(KEY));
    ok(`  nor the verdict`, !summarise({ commit: 'a', node: 'v20', hasApiKey: true, probes: [{ what: 'm', ok: true, ms: 1 }], search: p }).includes(KEY));
  }
  reset();
}

console.log('\n=== it is said out loud, where it happened ===');
{
  logged.length = 0;
  process.env.SERPER_API_KEY = KEY;
  stub({ status: 403 });
  await runSearch('anything', { images: false });
  const said = logged.map((a) => JSON.stringify(a)).join(' ');
  ok('an empty search is logged', logged.length > 0);
  ok('  with the status, which is the fact that ends the argument', /403/.test(said), said);
  ok('  and the provider', /google/.test(said));
  ok('  and NEVER the key', !said.includes(KEY));
  reset();
}

console.error = realError;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
